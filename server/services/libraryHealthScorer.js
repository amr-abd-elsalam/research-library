// server/services/libraryHealthScorer.js
// ═══════════════════════════════════════════════════════════════
// LibraryHealthScorer — Phase 42 (Singleton #26)
// Computes a unified health score (0-100) from accumulated
// performance data: quality avg + feedback positive rate +
// gap rate (inverted) + cache hit rate + error rate (inverted)
// + library coverage.
//
// On-demand computation — no state, no persistence, no EventBus.
// Reads from: metrics, feedbackCollector, sessionQualityScorer.
// Config: HEALTH_SCORE.enabled (default false), HEALTH_SCORE.weights,
//         HEALTH_SCORE.actionItemThresholds.
// Zero overhead when disabled.
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';
import { metrics } from './metrics.js';
import { feedbackCollector } from './feedbackCollector.js';
import { sessionQualityScorer } from './sessionQualityScorer.js';

class LibraryHealthScorer {
  #enabled;
  #weights;
  #thresholds;

  constructor() {
    const cfg       = config.HEALTH_SCORE ?? {};
    this.#enabled   = cfg.enabled === true;
    this.#weights   = {
      qualityAvg:       cfg.weights?.qualityAvg       ?? 0.25,
      feedbackPositive: cfg.weights?.feedbackPositive ?? 0.20,
      gapRate:          cfg.weights?.gapRate          ?? 0.20,
      cacheHitRate:     cfg.weights?.cacheHitRate     ?? 0.15,
      errorRate:        cfg.weights?.errorRate        ?? 0.10,
      libraryCoverage:  cfg.weights?.libraryCoverage  ?? 0.10,
    };
    this.#thresholds = {
      criticalBelow:  cfg.actionItemThresholds?.criticalBelow ?? 40,
      warningBelow:   cfg.actionItemThresholds?.warningBelow  ?? 70,
      maxActionItems: cfg.actionItemThresholds?.maxActionItems ?? 5,
    };
  }

  /** Whether health scoring is active. */
  get enabled() {
    return this.#enabled;
  }

  /**
   * Computes the unified health score on-demand.
   * @returns {{ score: number, level: string, breakdown: object, totalRequests: number, actionItems: Array } | null}
   */
  compute() {
    if (!this.#enabled) return null;

    const snapshot = metrics.snapshot();
    const counters = snapshot.counters || {};

    // ── Sum helper for counter buckets ───────────────────────
    const sumCounter = (bucket) => {
      if (!bucket || typeof bucket !== 'object') return 0;
      let total = 0;
      for (const key in bucket) total += bucket[key] || 0;
      return total;
    };

    const totalRequests = sumCounter(counters.requests_total);
    const totalErrors   = sumCounter(counters.stage_errors_total);
    const totalAborted  = sumCounter(counters.aborted_total);
    const totalGaps     = sumCounter(counters.content_gap_total);

    const w = this.#weights;

    // ── Component 1: qualityAvg ─────────────────────────────
    let qualityAvgComponent = 0.5; // fallback
    if (sessionQualityScorer.enabled) {
      const allScores = sessionQualityScorer.getAllScores(200);
      if (allScores.length > 0) {
        const sum = allScores.reduce((acc, s) => acc + s.score, 0);
        qualityAvgComponent = sum / allScores.length;
      }
    }

    // ── Component 2: feedbackPositive ───────────────────────
    const fbCounts = feedbackCollector.counts();
    const totalFeedback = fbCounts.totalPositive + fbCounts.totalNegative;
    const feedbackPositiveComponent = totalFeedback > 0
      ? fbCounts.totalPositive / totalFeedback
      : 0.5; // fallback

    // ── Component 3: gapRate (inverted — lower gaps = better) ─
    let gapRateComponent = 1; // fallback = perfect (no gaps)
    if (totalRequests >= 10) {
      gapRateComponent = 1 - (totalGaps / totalRequests);
      gapRateComponent = Math.max(0, Math.min(1, gapRateComponent));
    }

    // ── Component 4: cacheHitRate ───────────────────────────
    let cacheHitRateComponent = 0.5; // fallback
    if (totalRequests >= 10) {
      const cacheHits = sumCounter(counters.requests_total);
      // Extract cache_hit count specifically
      const cacheHitKey = '[["type","cache_hit"]]';
      const cacheHitCount = (counters.requests_total && counters.requests_total[cacheHitKey]) || 0;
      cacheHitRateComponent = totalRequests > 0 ? cacheHitCount / totalRequests : 0.5;
    }

    // ── Component 5: errorRate (inverted — lower errors = better) ─
    let errorRateComponent = 1; // fallback = perfect (no errors)
    if (totalRequests >= 10) {
      errorRateComponent = 1 - (totalErrors / totalRequests);
      errorRateComponent = Math.max(0, Math.min(1, errorRateComponent));
    }

    // ── Component 6: libraryCoverage (non-aborted / total) ──
    let libraryCoverageComponent = 0.5; // fallback
    if (totalRequests >= 10) {
      libraryCoverageComponent = 1 - (totalAborted / totalRequests);
      libraryCoverageComponent = Math.max(0, Math.min(1, libraryCoverageComponent));
    }

    // ── Weighted sum ────────────────────────────────────────
    const rawScore = (w.qualityAvg       * qualityAvgComponent)
                   + (w.feedbackPositive * feedbackPositiveComponent)
                   + (w.gapRate          * gapRateComponent)
                   + (w.cacheHitRate     * cacheHitRateComponent)
                   + (w.errorRate        * errorRateComponent)
                   + (w.libraryCoverage  * libraryCoverageComponent);

    const score = Math.round(Math.max(0, Math.min(1, rawScore)) * 100);

    // ── Level ───────────────────────────────────────────────
    let level;
    if (score < this.#thresholds.criticalBelow) {
      level = 'critical';
    } else if (score < this.#thresholds.warningBelow) {
      level = 'warning';
    } else {
      level = 'healthy';
    }

    // ── Breakdown (percentages) ─────────────────────────────
    const breakdown = {
      qualityAvg:       Math.round(qualityAvgComponent * 100),
      feedbackPositive: Math.round(feedbackPositiveComponent * 100),
      gapRate:          Math.round(gapRateComponent * 100),
      cacheHitRate:     Math.round(cacheHitRateComponent * 100),
      errorRate:        Math.round(errorRateComponent * 100),
      libraryCoverage:  Math.round(libraryCoverageComponent * 100),
    };

    // ── Action Items ────────────────────────────────────────
    const actionItems = this.#buildActionItems({
      totalRequests,
      totalGaps,
      totalErrors,
      totalAborted,
      totalFeedback,
      feedbackPositiveRate: feedbackPositiveComponent,
      gapRate: totalRequests > 0 ? totalGaps / totalRequests : 0,
      errorRate: totalRequests > 0 ? totalErrors / totalRequests : 0,
      qualityAvg: qualityAvgComponent,
      cacheHitRate: cacheHitRateComponent,
    });

    return {
      score,
      level,
      breakdown,
      totalRequests,
      actionItems,
    };
  }

  /**
   * Summary for inspect endpoint.
   * @returns {{ enabled: boolean }}
   */
  counts() {
    return {
      enabled: this.#enabled,
    };
  }

  // ── Private: build prioritized action items ───────────────
  #buildActionItems({ totalRequests, totalGaps, totalErrors, totalAborted, totalFeedback, feedbackPositiveRate, gapRate, errorRate, qualityAvg, cacheHitRate }) {
    const items = [];

    // Insufficient data
    if (totalRequests < 20) {
      items.push({
        priority: 'info',
        text: `بيانات غير كافية — تم تسجيل ${totalRequests} طلب فقط. أرسل المزيد من الأسئلة للحصول على تقييم دقيق.`,
      });
      return items;
    }

    // High gap rate
    if (gapRate > 0.20) {
      items.push({
        priority: 'critical',
        text: `${Math.round(gapRate * 100)}% من الأسئلة (${totalGaps} من ${totalRequests}) بدون إجابة كافية — أضف محتوى جديد للمكتبة يغطي المواضيع الناقصة.`,
      });
    }

    // Low feedback positive rate
    if (totalFeedback > 5 && feedbackPositiveRate < 0.60) {
      items.push({
        priority: 'warning',
        text: `نسبة الفيدباك الإيجابي ${Math.round(feedbackPositiveRate * 100)}% فقط — راجع الإجابات ذات التقييم السلبي وحسّن المحتوى.`,
      });
    }

    // High error rate
    if (errorRate > 0.05) {
      items.push({
        priority: 'warning',
        text: `نسبة الأخطاء ${Math.round(errorRate * 100)}% — تحقق من حالة النظام (Gemini, Qdrant) وفعّل circuit breaker.`,
      });
    }

    // Low cache hit rate
    if (totalRequests > 50 && cacheHitRate < 0.10) {
      items.push({
        priority: 'info',
        text: `نسبة الكاش ${Math.round(cacheHitRate * 100)}% فقط — فكّر في زيادة TTL أو حجم الكاش.`,
      });
    }

    // Low quality avg
    if (qualityAvg < 0.50) {
      items.push({
        priority: 'warning',
        text: `متوسط جودة الجلسات ${Math.round(qualityAvg * 100)}% — راجع محتوى المكتبة وأضف ملفات تغطي الأسئلة الشائعة.`,
      });
    }

    // High abort rate
    if (totalRequests > 20 && (totalAborted / totalRequests) > 0.30) {
      items.push({
        priority: 'warning',
        text: `${Math.round((totalAborted / totalRequests) * 100)}% من الأسئلة ملغاة بسبب ثقة منخفضة — أضف المزيد من المحتوى أو عدّل حدود الثقة.`,
      });
    }

    // Slice to max
    return items.slice(0, this.#thresholds.maxActionItems);
  }
}

// ── Singleton instance ─────────────────────────────────────────
const libraryHealthScorer = new LibraryHealthScorer();

export { LibraryHealthScorer, libraryHealthScorer };
