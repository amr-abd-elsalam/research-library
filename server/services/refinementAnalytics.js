// server/services/refinementAnalytics.js
// ═══════════════════════════════════════════════════════════════
// RefinementAnalytics — Phase 87 (Singleton #43)
// Ring buffer collecting answer refinement analytics.
// Fed by refinementListener from pipeline:complete events
// when _refinementApplied is true.
// Aggregates: success rate, avg improvement, per-strategy breakdown,
// streaming vs structured breakdown.
// In-memory only — data resets on restart.
// Zero overhead when ANSWER_REFINEMENT not active (no events emitted).
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';

class RefinementAnalytics {
  #entries = [];
  #maxEntries;

  constructor() {
    this.#maxEntries = config.REFINEMENT_ANALYTICS?.maxEntries ?? 200;
  }

  /**
   * Records a refinement event.
   * Called by refinementListener when pipeline:complete has _refinementApplied === true.
   * @param {{ correlationId: string, sessionId: string, originalScore: number, finalScore: number, attempts: number, improved: boolean, responseMode: string, strategy: string|null, avgScore: number, timestamp: number }} entry
   */
  record(entry) {
    if (!entry || typeof entry !== 'object') return;

    this.#entries.push({
      correlationId: entry.correlationId || null,
      sessionId:     entry.sessionId || null,
      originalScore: typeof entry.originalScore === 'number' ? entry.originalScore : 0,
      finalScore:    typeof entry.finalScore === 'number' ? entry.finalScore : 0,
      attempts:      typeof entry.attempts === 'number' ? entry.attempts : 0,
      improved:      entry.improved === true,
      responseMode:  entry.responseMode || 'unknown',
      strategy:      entry.strategy || null,
      avgScore:      typeof entry.avgScore === 'number' ? entry.avgScore : 0,
      timestamp:     entry.timestamp || Date.now(),
    });

    // Ring buffer eviction — remove oldest
    if (this.#entries.length > this.#maxEntries) {
      this.#entries.shift();
    }
  }

  /**
   * Returns aggregated refinement statistics.
   * @returns {{ totalRecorded: number, successRate: number, avgImprovement: number, avgAttempts: number, byResponseMode: Object, byStrategy: Object }}
   */
  getStats() {
    const total = this.#entries.length;

    if (total === 0) {
      return {
        totalRecorded: 0,
        successRate: 0,
        avgImprovement: 0,
        avgAttempts: 0,
        byResponseMode: {},
        byStrategy: {},
      };
    }

    // Overall stats
    let improvedCount = 0;
    let improvementSum = 0;
    let attemptsSum = 0;

    // Per-responseMode buckets
    const modeMap = new Map();
    // Per-strategy buckets
    const stratMap = new Map();

    for (const entry of this.#entries) {
      attemptsSum += entry.attempts;

      if (entry.improved) {
        improvedCount++;
        improvementSum += (entry.finalScore - entry.originalScore);
      }

      // ResponseMode aggregation
      const mode = entry.responseMode || 'unknown';
      if (!modeMap.has(mode)) {
        modeMap.set(mode, { count: 0, improved: 0, improvementSum: 0 });
      }
      const mBucket = modeMap.get(mode);
      mBucket.count++;
      if (entry.improved) {
        mBucket.improved++;
        mBucket.improvementSum += (entry.finalScore - entry.originalScore);
      }

      // Strategy aggregation
      const strat = entry.strategy || 'none';
      if (!stratMap.has(strat)) {
        stratMap.set(strat, { count: 0, improved: 0, improvementSum: 0 });
      }
      const sBucket = stratMap.get(strat);
      sBucket.count++;
      if (entry.improved) {
        sBucket.improved++;
        sBucket.improvementSum += (entry.finalScore - entry.originalScore);
      }
    }

    const successRate = Math.round((improvedCount / total) * 10000) / 10000;
    const avgImprovement = improvedCount > 0
      ? Math.round((improvementSum / improvedCount) * 10000) / 10000
      : 0;
    const avgAttempts = Math.round((attemptsSum / total) * 10000) / 10000;

    // Build byResponseMode
    const byResponseMode = {};
    for (const [mode, bucket] of modeMap) {
      byResponseMode[mode] = {
        count: bucket.count,
        successRate: bucket.count > 0 ? Math.round((bucket.improved / bucket.count) * 10000) / 10000 : 0,
        avgImprovement: bucket.improved > 0 ? Math.round((bucket.improvementSum / bucket.improved) * 10000) / 10000 : 0,
      };
    }

    // Build byStrategy
    const byStrategy = {};
    for (const [strat, bucket] of stratMap) {
      byStrategy[strat] = {
        count: bucket.count,
        successRate: bucket.count > 0 ? Math.round((bucket.improved / bucket.count) * 10000) / 10000 : 0,
        avgImprovement: bucket.improved > 0 ? Math.round((bucket.improvementSum / bucket.improved) * 10000) / 10000 : 0,
      };
    }

    return {
      totalRecorded: total,
      successRate,
      avgImprovement,
      avgAttempts,
      byResponseMode,
      byStrategy,
    };
  }

  /**
   * Returns the last N entries (most recent first).
   * @param {number} [n=10]
   * @returns {Array}
   */
  getRecent(n = 10) {
    const count = Math.min(n, this.#entries.length);
    return this.#entries.slice(-count).reverse();
  }

  /**
   * Summary for inspect endpoint.
   * @returns {{ enabled: boolean, totalRecorded: number, maxEntries: number, successRate: number }}
   */
  counts() {
    const total = this.#entries.length;
    let improvedCount = 0;
    for (const entry of this.#entries) {
      if (entry.improved) improvedCount++;
    }
    return {
      enabled: true,
      totalRecorded: total,
      maxEntries: this.#maxEntries,
      successRate: total > 0 ? Math.round((improvedCount / total) * 10000) / 10000 : 0,
    };
  }

  /**
   * Resets all state. For test isolation.
   */
  reset() {
    this.#entries = [];
  }
}

// ── Singleton instance ─────────────────────────────────────────
const refinementAnalytics = new RefinementAnalytics();

export { RefinementAnalytics, refinementAnalytics };
