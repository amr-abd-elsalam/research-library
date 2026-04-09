// server/services/strategyAnalytics.js
// ═══════════════════════════════════════════════════════════════
// StrategyAnalytics — Phase 87 (Singleton #44)
// Ring buffer collecting RAG strategy selection analytics.
// Fed by strategyAnalyticsListener from pipeline:complete events.
// Aggregates: per-strategy quality, escalation rate, usage frequency.
// In-memory only — data resets on restart.
// Zero overhead when RAG_STRATEGIES not active (no events emitted).
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';

class StrategyAnalytics {
  #entries = [];
  #maxEntries;

  constructor() {
    this.#maxEntries = config.STRATEGY_ANALYTICS?.maxEntries ?? 200;
  }

  /**
   * Records a strategy selection event.
   * Called by strategyAnalyticsListener on pipeline:complete.
   * @param {{ correlationId: string, sessionId: string, strategy: string|null, complexityType: string|null, avgScore: number, turnNumber: number, isFollowUp: boolean, skipped: boolean, timestamp: number }} entry
   */
  record(entry) {
    if (!entry || typeof entry !== 'object') return;

    this.#entries.push({
      correlationId: entry.correlationId || null,
      sessionId:     entry.sessionId || null,
      strategy:      entry.strategy || null,
      complexityType: entry.complexityType || null,
      avgScore:      typeof entry.avgScore === 'number' ? entry.avgScore : 0,
      turnNumber:    typeof entry.turnNumber === 'number' ? entry.turnNumber : 0,
      isFollowUp:    entry.isFollowUp === true,
      skipped:       entry.skipped === true,
      timestamp:     entry.timestamp || Date.now(),
    });

    // Ring buffer eviction — remove oldest
    if (this.#entries.length > this.#maxEntries) {
      this.#entries.shift();
    }
  }

  /**
   * Returns per-strategy performance statistics.
   * @returns {{ totalRecorded: number, skippedCount: number, skippedRate: number, byStrategy: Object, escalationRate: number }}
   */
  getPerformance() {
    const total = this.#entries.length;

    if (total === 0) {
      return {
        totalRecorded: 0,
        skippedCount: 0,
        skippedRate: 0,
        byStrategy: {},
        escalationRate: 0,
      };
    }

    let skippedCount = 0;
    const stratMap = new Map();

    for (const entry of this.#entries) {
      if (entry.skipped) {
        skippedCount++;
        continue;
      }

      const strat = entry.strategy || 'unknown';
      if (!stratMap.has(strat)) {
        stratMap.set(strat, { count: 0, scoreSum: 0, turnSum: 0 });
      }
      const bucket = stratMap.get(strat);
      bucket.count++;
      bucket.scoreSum += entry.avgScore;
      bucket.turnSum += entry.turnNumber;
    }

    const nonSkipped = total - skippedCount;
    const skippedRate = Math.round((skippedCount / total) * 10000) / 10000;

    // Build byStrategy
    const byStrategy = {};
    let deepAnalyticalCount = 0;

    for (const [strat, bucket] of stratMap) {
      byStrategy[strat] = {
        count: bucket.count,
        avgScore: bucket.count > 0 ? Math.round((bucket.scoreSum / bucket.count) * 10000) / 10000 : 0,
        avgTurnNumber: bucket.count > 0 ? Math.round((bucket.turnSum / bucket.count) * 10000) / 10000 : 0,
      };

      if (strat === 'deep_analytical') {
        deepAnalyticalCount = bucket.count;
      }
    }

    // Escalation rate: deep_analytical selections / total non-skipped
    const escalationRate = nonSkipped > 0
      ? Math.round((deepAnalyticalCount / nonSkipped) * 10000) / 10000
      : 0;

    return {
      totalRecorded: total,
      skippedCount,
      skippedRate,
      byStrategy,
      escalationRate,
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
   * @returns {{ enabled: boolean, totalRecorded: number, maxEntries: number, strategyBreakdown: Object }}
   */
  counts() {
    const breakdown = {};
    for (const entry of this.#entries) {
      if (entry.skipped) continue;
      const strat = entry.strategy || 'unknown';
      breakdown[strat] = (breakdown[strat] || 0) + 1;
    }
    return {
      enabled: true,
      totalRecorded: this.#entries.length,
      maxEntries: this.#maxEntries,
      strategyBreakdown: breakdown,
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
const strategyAnalytics = new StrategyAnalytics();

export { StrategyAnalytics, strategyAnalytics };
