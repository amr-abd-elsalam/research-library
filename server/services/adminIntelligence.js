// server/services/adminIntelligence.js
// ═══════════════════════════════════════════════════════════════
// AdminIntelligenceEngine — Phase 53 (Singleton #28)
// Periodic analysis of 6+ observability singletons to generate
// prioritized insights + optional auto-remediation + SSE notifications.
//
// Reads from: LibraryHealthScorer, PipelineAnalytics, FeedbackCollector,
//             ContentGapDetector, SessionQualityScorer, MetricsCollector, cache.
// Produces: prioritized insights (critical > warning > info),
//           optional auto-actions (refresh-library, clear-cache),
//           SSE notifications via EventBus.
//
// Config: ADMIN_INTELLIGENCE (section #31) — all fields opt-in.
// Feature flag: featureFlags.isEnabled('ADMIN_INTELLIGENCE').
// Zero overhead when disabled.
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';
import { featureFlags } from './featureFlags.js';
import { libraryHealthScorer } from './libraryHealthScorer.js';
import { pipelineAnalytics } from './pipelineAnalytics.js';
import { feedbackCollector } from './feedbackCollector.js';
import { contentGapDetector } from './contentGapDetector.js';
import { sessionQualityScorer } from './sessionQualityScorer.js';
import { metrics } from './metrics.js';
import { cache } from './cache.js';
import { eventBus } from './eventBus.js';
import { logger } from './logger.js';
import { libraryIndex } from './libraryIndex.js';

// ── Severity ordering for sort (lower = higher priority) ──────
const SEVERITY_ORDER = { critical: 0, warning: 1, info: 2 };

let _insightSeq = 0;

class AdminIntelligenceEngine {
  // ── Config fields ──────────────────────────────────────────
  #intervalMs;
  #autoRemediation;
  #maxInsights;
  #notificationsEnabled;
  #notificationMaxQueue;
  #insightCooldownMs;

  // ── State ──────────────────────────────────────────────────
  #insights = [];
  #notifications = [];
  #timer = null;
  #analysisCount = 0;
  #lastAnalyzedAt = 0;
  #recentInsightKeys = new Map(); // Map<insightKey, timestamp>

  // ── Rolling accumulators (fed by intelligenceListener) ─────
  #rollingCompletions = 0;
  #rollingFeedback = { positive: 0, negative: 0 };
  #rollingLibraryChanges = 0;

  constructor() {
    const cfg = config.ADMIN_INTELLIGENCE ?? {};
    this.#intervalMs           = Math.max(cfg.analysisIntervalMs ?? 300000, 60000);
    this.#autoRemediation      = cfg.autoRemediationEnabled === true;
    this.#maxInsights          = cfg.maxInsights ?? 10;
    this.#notificationsEnabled = cfg.notificationsEnabled === true;
    this.#notificationMaxQueue = cfg.notificationMaxQueue ?? 50;
    this.#insightCooldownMs    = cfg.insightCooldownMs ?? 600000;
  }

  /** Whether intelligence analysis is active (dynamic — reads from featureFlags). */
  get enabled() {
    return featureFlags.isEnabled('ADMIN_INTELLIGENCE');
  }

  // ═══════════════════════════════════════════════════════════
  // Core Analysis
  // ═══════════════════════════════════════════════════════════

  /**
   * Runs one analysis cycle. Reads all data sources, generates insights,
   * optionally executes auto-remediation, and queues notifications.
   * All data sources are in-memory — no async I/O needed.
   */
  analyze(libraryId = null) {
    if (!this.enabled) return;

    const newInsights = [];

    // ── 1. Health Score ──────────────────────────────────────
    try {
      const health = libraryHealthScorer.enabled ? libraryHealthScorer.compute(libraryId) : null;
      if (health) {
        if (health.level === 'critical') {
          newInsights.push(this.#makeInsight({
            type: 'health',
            severity: 'critical',
            title: 'مؤشر صحة المكتبة حرج',
            message: `مؤشر الصحة ${health.score}/100 — حالة حرجة. راجع نقاط العمل في لوحة التحكم.`,
            insightKey: 'health_critical',
            autoActionable: false,
            libraryId,
          }));
        } else if (health.level === 'warning') {
          newInsights.push(this.#makeInsight({
            type: 'health',
            severity: 'warning',
            title: 'مؤشر صحة المكتبة يحتاج انتباه',
            message: `مؤشر الصحة ${health.score}/100 — يحتاج تحسين.`,
            insightKey: 'health_warning',
            autoActionable: false,
            libraryId,
          }));
        }
      }
    } catch { /* ignore — health scorer may not be enabled */ }

    // ── 2. Feedback Analysis ─────────────────────────────────
    try {
      const fbCounts = feedbackCollector.counts(libraryId);
      const totalFb = fbCounts.totalPositive + fbCounts.totalNegative;
      if (totalFb > 5) {
        const negativeRate = fbCounts.totalNegative / totalFb;
        if (negativeRate > 0.40) {
          newInsights.push(this.#makeInsight({
            type: 'feedback',
            severity: 'warning',
            title: 'ارتفاع التقييمات السلبية',
            message: `${Math.round(negativeRate * 100)}% من التقييمات سلبية (${fbCounts.totalNegative} من ${totalFb}). راجع الإجابات وحسّن المحتوى.`,
            insightKey: 'feedback_negative_high',
            autoActionable: false,
            libraryId,
          }));
        }
      }
    } catch { /* ignore */ }

    // ── 3. Content Gap Rate ──────────────────────────────────
    try {
      const snapshot = metrics.snapshot();
      const counters = snapshot.counters || {};
      const totalRequests = this.#sumCounter(counters.requests_total);
      const totalGaps = this.#sumCounter(counters.content_gap_total);

      if (totalRequests > 20) {
        const gapRate = totalGaps / totalRequests;
        if (gapRate > 0.25) {
          newInsights.push(this.#makeInsight({
            type: 'gap',
            severity: 'warning',
            title: 'نسبة فجوات المحتوى مرتفعة',
            message: `${Math.round(gapRate * 100)}% من الأسئلة بدون إجابة كافية. أضف محتوى جديد للمكتبة.`,
            suggestedAction: 'تحديث فهرس المكتبة',
            insightKey: 'gap_rate_high',
            autoActionable: true,
            autoActionName: 'refresh-library',
            libraryId,
          }));
        }
      }

      // ── 4. Cache Hit Rate ────────────────────────────────────
      const cacheStats = cache.stats();
      const hitRateStr = cacheStats.hit_rate || '0%';
      const hitRate = parseFloat(hitRateStr) / 100;
      if (totalRequests > 50 && hitRate < 0.10) {
        newInsights.push(this.#makeInsight({
          type: 'cache',
          severity: 'info',
          title: 'معدل الكاش منخفض',
          message: `معدل إصابة الكاش ${(hitRate * 100).toFixed(1)}% فقط. مسح الكاش القديم قد يحسّن الأداء.`,
          suggestedAction: 'مسح الكاش',
          insightKey: 'cache_hit_low',
          autoActionable: true,
          autoActionName: 'clear-cache',
          libraryId,
        }));
      }

      // ── 5. Quality Average ───────────────────────────────────
      try {
        if (sessionQualityScorer.enabled) {
          const allScores = sessionQualityScorer.getAllScores(200, libraryId);
          if (allScores.length >= 3) {
            const sum = allScores.reduce((acc, s) => acc + s.score, 0);
            const avg = sum / allScores.length;
            if (avg < 0.40) {
              newInsights.push(this.#makeInsight({
                type: 'quality',
                severity: 'warning',
                title: 'متوسط جودة الجلسات منخفض',
                message: `متوسط جودة الجلسات ${Math.round(avg * 100)}% — راجع محتوى المكتبة.`,
                insightKey: 'quality_avg_low',
                autoActionable: false,
                libraryId,
              }));
            }
          }
        }
      } catch { /* ignore */ }

      // ── 6. No requests yet ───────────────────────────────────
      if (totalRequests === 0) {
        newInsights.push(this.#makeInsight({
          type: 'performance',
          severity: 'info',
          title: 'لا توجد بيانات بعد',
          message: 'لم تُسجّل أي طلبات بعد — أرسل بعض الأسئلة للحصول على تحليلات.',
          insightKey: 'no_requests',
          autoActionable: false,
          libraryId,
        }));
      }

    } catch { /* ignore metrics read errors */ }

    // ── 7. Library Changed ───────────────────────────────────
    if (this.#rollingLibraryChanges > 0) {
      newInsights.push(this.#makeInsight({
        type: 'performance',
        severity: 'info',
        title: 'تم اكتشاف تغيير في المكتبة',
        message: `تم رصد ${this.#rollingLibraryChanges} تغيير(ات) في محتوى المكتبة منذ آخر تحليل. مسح الكاش يضمن إجابات محدّثة.`,
        suggestedAction: 'مسح الكاش',
        insightKey: 'library_changed',
        autoActionable: true,
        autoActionName: 'clear-cache',
        libraryId,
      }));
    }

    // ── Deduplicate by cooldown ──────────────────────────────
    const now = Date.now();
    const filteredInsights = newInsights.filter(insight => {
      if (!insight) return false;
      const lastSeen = this.#recentInsightKeys.get(insight.insightKey);
      if (lastSeen && (now - lastSeen) < this.#insightCooldownMs) {
        return false;
      }
      return true;
    });

    // Record cooldown timestamps
    for (const insight of filteredInsights) {
      this.#recentInsightKeys.set(insight.insightKey, now);
    }

    // Prune old cooldown entries
    for (const [key, ts] of this.#recentInsightKeys) {
      if (now - ts > this.#insightCooldownMs * 2) {
        this.#recentInsightKeys.delete(key);
      }
    }

    // ── Sort by severity priority (critical first) ──────────
    filteredInsights.sort((a, b) => {
      return (SEVERITY_ORDER[a.severity] ?? 99) - (SEVERITY_ORDER[b.severity] ?? 99);
    });

    // ── Update insights array (cap at maxInsights) ──────────
    if (libraryId) {
      // Per-library: append to existing insights (global + previous libraries)
      this.#insights = this.#insights.concat(filteredInsights);
      // Re-sort mixed array by severity
      this.#insights.sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 99) - (SEVERITY_ORDER[b.severity] ?? 99));
      // Cap at max
      this.#insights = this.#insights.slice(0, this.#maxInsights);
    } else {
      // Global: replace all insights (fresh start for this cycle)
      this.#insights = filteredInsights.slice(0, this.#maxInsights);
    }

    // ── Auto-remediation ────────────────────────────────────
    if (this.#autoRemediation) {
      for (const insight of this.#insights) {
        if (insight.autoActionable && insight.autoActionName) {
          this.#executeAutoAction(insight.autoActionName, insight.title);
        }
      }
    }

    // ── Queue notifications ─────────────────────────────────
    for (const insight of filteredInsights) {
      const notification = {
        id: insight.id,
        type: 'insight',
        severity: insight.severity,
        title: insight.title,
        message: insight.message,
        timestamp: insight.createdAt,
      };

      this.#notifications.push(notification);

      // Ring buffer cap
      while (this.#notifications.length > this.#notificationMaxQueue) {
        this.#notifications.shift();
      }

      // SSE push
      if (this.#notificationsEnabled) {
        eventBus.emit('intelligence:notification', notification);
      }
    }

    // ── Reset rolling accumulators ──────────────────────────
    this.#rollingCompletions = 0;
    this.#rollingFeedback = { positive: 0, negative: 0 };
    this.#rollingLibraryChanges = 0;

    // ── Update metadata ─────────────────────────────────────
    this.#analysisCount++;
    this.#lastAnalyzedAt = now;

    // ── Emit analyzed event ─────────────────────────────────
    eventBus.emit('intelligence:analyzed', {
      insightCount: this.#insights.length,
      analysisCount: this.#analysisCount,
      timestamp: now,
    });

    if (filteredInsights.length > 0) {
      logger.info('adminIntelligence', `analysis #${this.#analysisCount}: ${filteredInsights.length} insight(s) generated`);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // Public API
  // ═══════════════════════════════════════════════════════════

  /**
   * Returns current insights sorted by severity (critical first).
   * @param {number} [limit=10]
   * @param {string|null|undefined} [libraryId=undefined] — filter by libraryId. undefined/null = all insights.
   * @returns {Array<object>}
   */
  getInsights(limit = 10, libraryId = undefined) {
    if (!this.enabled) return [];
    if (libraryId !== undefined && libraryId !== null) {
      return this.#insights.filter(i => i.libraryId === libraryId).slice(0, limit);
    }
    return this.#insights.slice(0, limit);
  }

  /**
   * Returns notifications after a given timestamp.
   * @param {number} [since=0]
   * @returns {Array<object>}
   */
  getNotifications(since = 0) {
    if (!this.enabled) return [];
    if (since <= 0) return [...this.#notifications];
    return this.#notifications.filter(n => n.timestamp > since);
  }

  /**
   * Returns rolling stats since last analysis (for admin endpoint).
   * @returns {{ completionsSinceLastAnalysis: number, feedbackSinceLastAnalysis: object, libraryChangesSinceLastAnalysis: number }}
   */
  getRollingStats() {
    return {
      completionsSinceLastAnalysis: this.#rollingCompletions,
      feedbackSinceLastAnalysis: { ...this.#rollingFeedback },
      libraryChangesSinceLastAnalysis: this.#rollingLibraryChanges,
    };
  }

  /**
   * Runs per-library analysis for all configured libraries.
   * Only active when MULTI_LIBRARY is enabled with at least one library.
   * Called after the global analyze() in each periodic cycle.
   */
  analyzeAllLibraries() {
    if (!this.enabled) return;
    if (!config.MULTI_LIBRARY?.enabled) return;
    const libraries = config.MULTI_LIBRARY.libraries || [];
    if (libraries.length === 0) return;
    for (const lib of libraries) {
      if (lib.id) this.analyze(lib.id);
    }
  }

  /**
   * Starts periodic analysis timer.
   */
  startAnalysis() {
    if (!this.enabled || this.#timer) return;

    // Run first analysis immediately
    this.analyze();
    this.analyzeAllLibraries();

    this.#timer = setInterval(() => {
      this.analyze();
      this.analyzeAllLibraries();
    }, this.#intervalMs);

    if (this.#timer.unref) this.#timer.unref();

    logger.info('adminIntelligence', `periodic analysis started (interval: ${this.#intervalMs}ms)`);
  }

  /**
   * Stops periodic analysis timer.
   */
  stopAnalysis() {
    if (this.#timer) {
      clearInterval(this.#timer);
      this.#timer = null;
    }
  }

  /**
   * Summary for inspect endpoint.
   * @returns {{ enabled: boolean, analysisCount: number, insightCount: number, notificationCount: number, lastAnalyzedAt: string|null }}
   */
  counts() {
    return {
      enabled:           this.enabled,
      analysisCount:     this.#analysisCount,
      insightCount:      this.#insights.length,
      notificationCount: this.#notifications.length,
      lastAnalyzedAt:    this.#lastAnalyzedAt > 0 ? new Date(this.#lastAnalyzedAt).toISOString() : null,
    };
  }

  /**
   * Resets all internal state. For testing only.
   */
  reset() {
    this.#insights = [];
    this.#notifications = [];
    this.#analysisCount = 0;
    this.#lastAnalyzedAt = 0;
    this.#recentInsightKeys.clear();
    this.#rollingCompletions = 0;
    this.#rollingFeedback = { positive: 0, negative: 0 };
    this.#rollingLibraryChanges = 0;
    this.stopAnalysis();
    _insightSeq = 0;
  }

  // ═══════════════════════════════════════════════════════════
  // Internal — fed by intelligenceListener
  // ═══════════════════════════════════════════════════════════

  /** @param {object} data — pipeline:complete event data */
  _recordCompletion(data) {
    if (!this.enabled) return;
    this.#rollingCompletions++;
  }

  /** @param {object} data — feedback:submitted event data */
  _recordFeedback(data) {
    if (!this.enabled) return;
    if (data.rating === 'positive') {
      this.#rollingFeedback.positive++;
    } else if (data.rating === 'negative') {
      this.#rollingFeedback.negative++;
    }
  }

  /** @param {object} data — library:changed event data */
  _recordLibraryChange(data) {
    if (!this.enabled) return;
    this.#rollingLibraryChanges++;
  }

  // ═══════════════════════════════════════════════════════════
  // Private Helpers
  // ═══════════════════════════════════════════════════════════

  #makeInsight({ type, severity, title, message, suggestedAction, insightKey, autoActionable, autoActionName, libraryId }) {
    return {
      id: `ins_${Date.now()}_${++_insightSeq}`,
      type,
      severity,
      title,
      message,
      suggestedAction: suggestedAction || null,
      autoActionable: autoActionable || false,
      autoActionName: autoActionName || null,
      createdAt: Date.now(),
      insightKey: libraryId ? `${insightKey}:${libraryId}` : insightKey,
      libraryId: libraryId || null,
    };
  }

  #sumCounter(bucket) {
    if (!bucket || typeof bucket !== 'object') return 0;
    let total = 0;
    for (const key in bucket) total += bucket[key] || 0;
    return total;
  }

  #executeAutoAction(actionName, insightTitle) {
    try {
      if (actionName === 'refresh-library' && libraryIndex.enabled) {
        libraryIndex.refresh().catch(() => {});
        logger.info('adminIntelligence', `auto-action: refresh-library (triggered by: ${insightTitle})`);
      } else if (actionName === 'clear-cache') {
        cache.invalidateAll();
        logger.info('adminIntelligence', `auto-action: clear-cache (triggered by: ${insightTitle})`);
      }
    } catch (err) {
      logger.warn('adminIntelligence', `auto-action failed: ${actionName}`, { error: err.message });
    }
  }
}

// ── Singleton instance ─────────────────────────────────────────
const adminIntelligence = new AdminIntelligenceEngine();

export { AdminIntelligenceEngine, adminIntelligence };
