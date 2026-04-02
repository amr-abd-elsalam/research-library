// server/services/pipelineAnalytics.js
// ═══════════════════════════════════════════════════════════════
// PipelineAnalytics — Phase 22
// Reads from MetricsCollector + cache.stats() to produce:
//   - digest: analytical summary of pipeline performance
//   - recommendations: actionable suggestions for the admin
//   - adaptiveOverrides: optional runtime config adjustments
// Uses cooldown-based caching — does NOT recompute on every call.
// Zero overhead when disabled (adaptiveEnabled: false).
// ═══════════════════════════════════════════════════════════════

import { metrics } from './metrics.js';
import { cache }   from './cache.js';
import { logger }  from './logger.js';
import config      from '../../config.js';

// ── Circular buffer helper (fixed-size, no allocation per push) ──
class CircularBuffer {
  #buf;
  #size;
  #head = 0;
  #count = 0;

  constructor(size) {
    this.#size = size;
    this.#buf  = new Array(size);
  }

  push(value) {
    this.#buf[this.#head] = value;
    this.#head = (this.#head + 1) % this.#size;
    if (this.#count < this.#size) this.#count++;
  }

  toArray() {
    if (this.#count < this.#size) return this.#buf.slice(0, this.#count);
    return [...this.#buf.slice(this.#head), ...this.#buf.slice(0, this.#head)];
  }

  get length() { return this.#count; }
}

class PipelineAnalytics {
  #enabled;
  #cooldownMs;
  #thresholds;
  #cache          = null;   // { digest, recommendations, overrides }
  #lastComputed   = 0;

  // ── Rolling stats (fed by analyticsDigestListener) ─────────
  #completionCount   = 0;
  #totalLatencyMs    = 0;
  #lastScores        = new CircularBuffer(50);
  #stageDurations    = new Map();  // Map<stageName, CircularBuffer>

  constructor() {
    const cfg         = config.PIPELINE ?? {};
    this.#enabled     = cfg.adaptiveEnabled === true;
    this.#cooldownMs  = Math.max(cfg.adaptiveCooldownMs ?? 60_000, 30_000);
    this.#thresholds  = {
      stageP95WarnMs:   cfg.adaptiveThresholds?.stageP95WarnMs   ?? 2000,
      cacheHitRateWarn: cfg.adaptiveThresholds?.cacheHitRateWarn  ?? 0.10,
      errorRateWarn:    cfg.adaptiveThresholds?.errorRateWarn     ?? 0.05,
    };
  }

  // ═══════════════════════════════════════════════════════════
  // Public API
  // ═══════════════════════════════════════════════════════════

  /**
   * Returns analytical digest of pipeline performance.
   * Cached with cooldown — light to call frequently.
   * @returns {object|null} digest object or null if disabled
   */
  digest() {
    if (!this.#enabled) return null;
    this.#recomputeIfStale();
    return this.#cache?.digest ?? null;
  }

  /**
   * Returns actionable recommendations for the admin.
   * @returns {Array<object>} recommendations array (empty if disabled or no data)
   */
  recommendations() {
    if (!this.#enabled) return [];
    this.#recomputeIfStale();
    return this.#cache?.recommendations ?? [];
  }

  /**
   * Returns adaptive config overrides for the pipeline.
   * Applied via beforePipeline hook to ctx._adaptiveConfig.
   * @returns {object|null} overrides or null
   */
  adaptiveOverrides() {
    if (!this.#enabled) return null;
    this.#recomputeIfStale();
    return this.#cache?.overrides ?? null;
  }

  /**
   * Summary for inspect endpoint.
   * @returns {{ enabled: boolean, digestAge: number|null, recommendationCount: number, lastComputedAt: string|null }}
   */
  counts() {
    return {
      enabled:             this.#enabled,
      digestAge:           this.#lastComputed > 0 ? Date.now() - this.#lastComputed : null,
      recommendationCount: this.#cache?.recommendations?.length ?? 0,
      lastComputedAt:      this.#lastComputed > 0 ? new Date(this.#lastComputed).toISOString() : null,
    };
  }

  // ═══════════════════════════════════════════════════════════
  // Internal — fed by analyticsDigestListener
  // ═══════════════════════════════════════════════════════════

  /**
   * Records a pipeline completion event (lightweight accumulation).
   * Called by analyticsDigestListener on pipeline:complete.
   * @param {object} data — pipeline:complete event data
   */
  _recordCompletion(data) {
    if (!this.#enabled) return;
    this.#completionCount++;
    this.#totalLatencyMs += data.totalMs ?? 0;
    if (typeof data.avgScore === 'number') {
      this.#lastScores.push(data.avgScore);
    }
  }

  /**
   * Records a stage completion event (lightweight accumulation).
   * Called by analyticsDigestListener on pipeline:stageComplete.
   * @param {object} data — pipeline:stageComplete event data
   */
  _recordStageCompletion(data) {
    if (!this.#enabled) return;
    const name = data.stageName;
    if (!name) return;
    if (!this.#stageDurations.has(name)) {
      this.#stageDurations.set(name, new CircularBuffer(50));
    }
    this.#stageDurations.get(name).push(data.durationMs ?? 0);
  }

  // ═══════════════════════════════════════════════════════════
  // Internal — recomputation logic
  // ═══════════════════════════════════════════════════════════

  #recomputeIfStale() {
    const now = Date.now();
    if (this.#cache && (now - this.#lastComputed) < this.#cooldownMs) return;

    try {
      const snapshot   = metrics.snapshot();
      const cacheStats = cache.stats();
      const digest     = this.#buildDigest(snapshot, cacheStats);
      const recs       = this.#buildRecommendations(digest);
      const overrides  = this.#buildOverrides(digest);

      this.#cache = { digest, recommendations: recs, overrides };
      this.#lastComputed = now;
    } catch (err) {
      logger.warn('pipelineAnalytics', 'recompute failed', { error: err.message });
    }
  }

  // ── Parse serialized labels to extract a specific label value ──
  #extractLabel(serializedKey, labelName) {
    // Keys look like '[["type","pipeline"]]' or '[]'
    if (serializedKey === '[]') return null;
    try {
      const parsed = JSON.parse(serializedKey);
      if (Array.isArray(parsed)) {
        for (const pair of parsed) {
          if (Array.isArray(pair) && pair[0] === labelName) return pair[1];
        }
      }
    } catch { /* ignore */ }
    return null;
  }

  // ── Sum all values in a counter bucket ────────────────────────
  #sumCounter(counterBucket) {
    if (!counterBucket || typeof counterBucket !== 'object') return 0;
    let total = 0;
    for (const key in counterBucket) {
      total += counterBucket[key] || 0;
    }
    return total;
  }

  // ── Build digest from metrics snapshot ───────────────────────
  #buildDigest(snapshot, cacheStats) {
    const counters   = snapshot.counters   || {};
    const histograms = snapshot.histograms || {};

    // ── Query type distribution ──────────────────────────────
    // counter: query_type_total  keys: '[["type","factual"]]' → count
    const queryTypeDistribution = {};
    const queryTypeBucket = counters.query_type_total;
    if (queryTypeBucket) {
      for (const key in queryTypeBucket) {
        const type = this.#extractLabel(key, 'type') || 'unknown';
        queryTypeDistribution[type] = (queryTypeDistribution[type] || 0) + (queryTypeBucket[key] || 0);
      }
    }

    // ── Intent distribution ──────────────────────────────────
    const intentDistribution = {};
    const intentBucket = counters.intent_classification_total;
    if (intentBucket) {
      for (const key in intentBucket) {
        const intent = this.#extractLabel(key, 'intent') || 'unknown';
        intentDistribution[intent] = (intentDistribution[intent] || 0) + (intentBucket[key] || 0);
      }
    }

    // ── Stage durations (from histograms) ────────────────────
    // histogram: stage_duration_ms  keys: '[["stage","stageEmbed"]]' → { count, sum, p50, p95, p99 }
    const stageDurations = {};
    const stageHistBucket = histograms.stage_duration_ms;
    if (stageHistBucket) {
      for (const key in stageHistBucket) {
        const stage = this.#extractLabel(key, 'stage');
        if (stage) {
          const v = stageHistBucket[key];
          stageDurations[stage] = {
            p50: v.p50 ?? 0,
            p95: v.p95 ?? 0,
            p99: v.p99 ?? 0,
          };
        }
      }
    }

    // ── Request duration ─────────────────────────────────────
    // histogram: request_duration_ms  key: '[]' → { count, sum, p50, p95, p99 }
    const reqHistBucket = histograms.request_duration_ms;
    let requestDuration = { p50: 0, p95: 0, p99: 0 };
    if (reqHistBucket) {
      // Usually has key '[]' (no labels)
      const entry = reqHistBucket['[]'];
      if (entry) {
        requestDuration = { p50: entry.p50 ?? 0, p95: entry.p95 ?? 0, p99: entry.p99 ?? 0 };
      }
    }

    // ── Total requests ───────────────────────────────────────
    const totalRequests = this.#sumCounter(counters.requests_total);

    // ── Error rate ───────────────────────────────────────────
    const totalErrors = this.#sumCounter(counters.stage_errors_total);
    const errorRate = totalRequests > 0 ? totalErrors / totalRequests : 0;

    // ── Retry rate ───────────────────────────────────────────
    const totalRetries = this.#sumCounter(counters.stage_retries_total);
    const retryRate = totalRequests > 0 ? totalRetries / totalRequests : 0;

    // ── Abort rate ───────────────────────────────────────────
    const totalAborted = this.#sumCounter(counters.aborted_total);
    const abortRate = totalRequests > 0 ? totalAborted / totalRequests : 0;

    // ── Cache hit rate ───────────────────────────────────────
    // cache.stats() returns hit_rate as string like "45.00%"
    let cacheHitRate = 0;
    if (cacheStats && cacheStats.hit_rate) {
      const parsed = parseFloat(cacheStats.hit_rate);
      if (!Number.isNaN(parsed)) cacheHitRate = parsed / 100;
    }

    // ── Rewrite method distribution (Phase 32) ───────────────
    const rewriteMethodDistribution = {};
    const rewriteBucket = counters.rewrite_method_total;
    if (rewriteBucket) {
      for (const key in rewriteBucket) {
        const method = this.#extractLabel(key, 'method') || 'unknown';
        rewriteMethodDistribution[method] = (rewriteMethodDistribution[method] || 0) + (rewriteBucket[key] || 0);
      }
    }

    // ── Top query type / intent ──────────────────────────────
    const topQueryType = Object.entries(queryTypeDistribution)
      .sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    const topIntent = Object.entries(intentDistribution)
      .sort((a, b) => b[1] - a[1])[0]?.[0] || null;

    return {
      queryTypeDistribution,
      intentDistribution,
      rewriteMethodDistribution,
      stageDurations,
      requestDuration,
      cacheHitRate,
      totalRequests,
      errorRate:     Math.round(errorRate * 10000) / 10000,
      retryRate:     Math.round(retryRate * 10000) / 10000,
      abortRate:     Math.round(abortRate * 10000) / 10000,
      topQueryType,
      topIntent,
      computedAt:    new Date().toISOString(),
    };
  }

  // ── Build recommendations from digest ────────────────────────
  #buildRecommendations(digest) {
    const recs = [];
    const t = this.#thresholds;

    // 0. No data yet
    if (digest.totalRequests === 0) {
      recs.push({
        type: 'info', severity: 'info',
        title: 'لا توجد بيانات بعد',
        message: 'لم تُسجّل أي طلبات بعد — أرسل بعض الأسئلة للحصول على تحليلات.',
        metric: 'requests_total',
        suggestedAction: 'أرسل 10+ أسئلة اختبارية عبر الواجهة',
      });
      return recs;
    }

    // 1. stageSearch P95 high
    const searchP95 = digest.stageDurations?.stageSearch?.p95 ?? 0;
    if (searchP95 > t.stageP95WarnMs) {
      recs.push({
        type: 'performance', severity: 'warning',
        title: 'مرحلة البحث بطيئة',
        message: `مرحلة البحث (stageSearch) P95 = ${Math.round(searchP95)}ms — أعلى من الحد (${t.stageP95WarnMs}ms). فكّر في تقليل topK أو تفعيل circuit breaker.`,
        metric: 'stage_duration_ms.stageSearch.p95',
        suggestedAction: 'PIPELINE.circuitBreaker.enabled: true أو تقليل عدد نتائج البحث',
      });
    }

    // 2. stageEmbed P95 high
    const embedP95 = digest.stageDurations?.stageEmbed?.p95 ?? 0;
    if (embedP95 > t.stageP95WarnMs) {
      recs.push({
        type: 'performance', severity: 'warning',
        title: 'مرحلة التضمين بطيئة',
        message: `مرحلة التضمين (stageEmbed) P95 = ${Math.round(embedP95)}ms. فكّر في تفعيل circuit breaker أو retry مع backoff.`,
        metric: 'stage_duration_ms.stageEmbed.p95',
        suggestedAction: 'PIPELINE.retryableStages.stageEmbed: { maxRetries: 1, backoffMs: 500 }',
      });
    }

    // 3. Cache hit rate low
    if (digest.cacheHitRate < t.cacheHitRateWarn) {
      recs.push({
        type: 'performance', severity: 'info',
        title: 'معدل الكاش منخفض',
        message: `معدل إصابة الكاش ${(digest.cacheHitRate * 100).toFixed(1)}% — أقل من ${(t.cacheHitRateWarn * 100).toFixed(0)}%. فكّر في زيادة TTL أو حجم الكاش.`,
        metric: 'cache.hitRate',
        suggestedAction: 'زيادة cache TTL أو cache maxSize في الكود',
      });
    }

    // 4. Error rate high
    if (digest.errorRate > t.errorRateWarn) {
      recs.push({
        type: 'quality', severity: 'critical',
        title: 'معدل الأخطاء مرتفع',
        message: `معدل الأخطاء ${(digest.errorRate * 100).toFixed(1)}% — أعلى من ${(t.errorRateWarn * 100).toFixed(0)}%. تحقق من حالة Gemini و Qdrant في صفحة Health.`,
        metric: 'stage_errors_total / requests_total',
        suggestedAction: 'تفقد GET /api/health + فعّل circuit breaker',
      });
    }

    // 5. Retry rate high
    if (digest.retryRate > 0.10) {
      recs.push({
        type: 'performance', severity: 'warning',
        title: 'معدل إعادة المحاولة مرتفع',
        message: `${(digest.retryRate * 100).toFixed(1)}% من المراحل بتحتاج retry. فعّل circuit breaker لتجنب timeouts متكررة.`,
        metric: 'stage_retries_total / requests_total',
        suggestedAction: 'PIPELINE.circuitBreaker.enabled: true',
      });
    }

    // 6. Abort rate high
    if (digest.abortRate > 0.30) {
      recs.push({
        type: 'quality', severity: 'warning',
        title: 'معدل الإلغاء مرتفع',
        message: `${(digest.abortRate * 100).toFixed(1)}% من الأسئلة تُلغى بسبب ثقة منخفضة. تحقق من جودة المحتوى في المكتبة أو أضف مزيداً من الملفات.`,
        metric: 'aborted_total / requests_total',
        suggestedAction: 'مراجعة المحتوى + إضافة ملفات جديدة + مراجعة CONFIDENCE levels',
      });
    }

    // 7. Request duration P95 very high
    if (digest.requestDuration.p95 > 5000) {
      recs.push({
        type: 'performance', severity: 'warning',
        title: 'زمن الاستجابة الكلي مرتفع',
        message: `زمن الاستجابة الكلي P95 = ${Math.round(digest.requestDuration.p95)}ms. راجع مراحل الـ pipeline الأبطأ أعلاه.`,
        metric: 'request_duration_ms.p95',
        suggestedAction: 'راجع stageSearch و stageEmbed و stageStream durations',
      });
    }

    // 8. Excellent cache hit rate
    if (digest.cacheHitRate > 0.80) {
      recs.push({
        type: 'info', severity: 'info',
        title: 'أداء الكاش ممتاز',
        message: `معدل إصابة الكاش ${(digest.cacheHitRate * 100).toFixed(1)}% — أغلب الأسئلة تُجاب من الكاش مباشرة.`,
        metric: 'cache.hitRate',
        suggestedAction: 'لا إجراء مطلوب — الأداء ممتاز',
      });
    }

    // 9. Meta intent high — suggest stageGating
    const intentTotal = Object.values(digest.intentDistribution).reduce((s, v) => s + v, 0);
    const metaCount   = digest.intentDistribution.meta ?? 0;
    if (intentTotal > 0 && (metaCount / intentTotal) > 0.30) {
      recs.push({
        type: 'configuration', severity: 'info',
        title: 'نسبة أسئلة Meta عالية',
        message: `${((metaCount / intentTotal) * 100).toFixed(0)}% من الأسئلة عن المنصة نفسها. فعّل stageGating لتوفير tokens و latency.`,
        metric: 'intent_classification_total.meta',
        suggestedAction: "PIPELINE.stageGating: { meta: ['stageEmbed', 'stageSearch'] }",
      });
    }

    // 10. API rewrite ratio high — suggest adding local patterns
    const localRewrites = digest.rewriteMethodDistribution?.local_context ?? 0;
    const apiRewrites   = digest.rewriteMethodDistribution?.api ?? 0;
    const totalRewrites = localRewrites + apiRewrites;
    if (totalRewrites > 20 && (apiRewrites / totalRewrites) > 0.70) {
      recs.push({
        type: 'performance', severity: 'info',
        title: 'معظم إعادات الصياغة تحتاج API',
        message: `${((apiRewrites / totalRewrites) * 100).toFixed(0)}% من إعادات الصياغة تستخدم Gemini API بدلاً من الأنماط المحلية. أضف أنماط محلية جديدة لتقليل التكلفة والتأخير.`,
        metric: 'rewrite_method_total',
        suggestedAction: 'راجع rewrite_pattern_total في الـ metrics لمعرفة الأنماط الشائعة، وأضف patterns جديدة في attemptLocalRewrite()',
      });
    }

    // 11. Negative feedback rate high (Phase 33)
    const feedbackBucket = counters.feedback_total;
    if (feedbackBucket) {
      let feedbackPositive = 0;
      let feedbackNegative = 0;
      for (const key in feedbackBucket) {
        const ratingLabel = this.#extractLabel(key, 'rating');
        if (ratingLabel === 'positive') feedbackPositive += feedbackBucket[key] || 0;
        if (ratingLabel === 'negative') feedbackNegative += feedbackBucket[key] || 0;
      }
      const totalFeedback = feedbackPositive + feedbackNegative;
      if (totalFeedback > 10 && (feedbackNegative / totalFeedback) > 0.30) {
        recs.push({
          type: 'quality', severity: 'warning',
          title: 'معدل التقييم السلبي مرتفع',
          message: `${((feedbackNegative / totalFeedback) * 100).toFixed(0)}% من التقييمات سلبية (${feedbackNegative} من ${totalFeedback}). راجع الإجابات ذات التقييم السلبي وحسّن المحتوى.`,
          metric: 'feedback_total',
          suggestedAction: 'راجع GET /api/admin/feedback لمعرفة التقييمات السلبية + أضف أو حسّن محتوى المكتبة',
        });
      }
    }

    return recs;
  }

  // ── Build adaptive overrides ─────────────────────────────────
  #buildOverrides(digest) {
    if (digest.totalRequests < 10) return null; // Not enough data

    const overrides = {};
    let hasOverride = false;

    // topK reduction when stageSearch is slow
    const searchP95 = digest.stageDurations?.stageSearch?.p95 ?? 0;
    if (searchP95 > this.#thresholds.stageP95WarnMs) {
      // Suggest reducing topK by 1 (minimum 3 enforced in stageSearch)
      overrides.topKAdjustment = -1;
      hasOverride = true;
    }

    return hasOverride ? overrides : null;
  }

  /**
   * Reset all rolling stats. For testing only.
   */
  reset() {
    this.#completionCount = 0;
    this.#totalLatencyMs  = 0;
    this.#lastScores      = new CircularBuffer(50);
    this.#stageDurations  = new Map();
    this.#cache           = null;
    this.#lastComputed    = 0;
  }
}

// ── Singleton instance ─────────────────────────────────────────
const pipelineAnalytics = new PipelineAnalytics();

export { PipelineAnalytics, pipelineAnalytics };
