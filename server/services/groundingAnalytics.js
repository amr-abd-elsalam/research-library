// server/services/groundingAnalytics.js
// ═══════════════════════════════════════════════════════════════
// GroundingAnalytics — Phase 70 (Singleton #33)
// Rolling aggregation of grounding scores from pipeline:complete.
// Provides stats for admin dashboard visualization + export.
// Feature-gated via featureFlags.isEnabled('GROUNDING').
// In-memory ring buffer — data resets on restart.
// Zero overhead when GROUNDING disabled.
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';
import { featureFlags } from './featureFlags.js';

class GroundingAnalytics {
  #entries = [];
  #maxEntries;
  #totalChecked = 0;
  #totalLow = 0;
  #scoreSum = 0;

  constructor() {
    this.#maxEntries = config.GROUNDING_ANALYTICS?.maxEntries ?? 200;
  }

  /** Feature flag gate */
  get enabled() {
    return featureFlags.isEnabled('GROUNDING');
  }

  /**
   * Records a grounding check result.
   * Called by groundingListener on pipeline:complete (when grounding was checked).
   * @param {{ correlationId: string, score: number, timestamp: number, libraryId: string|null }} data
   */
  record(data) {
    if (!this.enabled) return;
    if (data.score === null || data.score === undefined) return;

    this.#entries.push({
      correlationId: data.correlationId || null,
      score: data.score,
      timestamp: data.timestamp || Date.now(),
      libraryId: data.libraryId || null,
    });

    // Ring buffer eviction
    if (this.#entries.length > this.#maxEntries) {
      this.#entries.shift();
    }

    // Running counters
    this.#totalChecked++;
    this.#scoreSum += data.score;

    const minScore = config.GROUNDING?.minGroundingScore ?? 0.4;
    if (data.score < minScore) {
      this.#totalLow++;
    }
  }

  /**
   * Returns aggregated grounding stats.
   * @returns {{ avgScore: number, lowRate: number, totalChecked: number, checkedWithScore: number, scoreDistribution: Object, recentScores: Array }}
   */
  getStats() {
    if (this.#totalChecked === 0) {
      return {
        avgScore: 0,
        lowRate: 0,
        totalChecked: 0,
        checkedWithScore: 0,
        scoreDistribution: { veryLow: 0, low: 0, medium: 0, high: 0, veryHigh: 0 },
        recentScores: [],
      };
    }

    const avgScore = Math.round((this.#scoreSum / this.#totalChecked) * 10000) / 10000;
    const lowRate = Math.round((this.#totalLow / this.#totalChecked) * 10000) / 10000;

    // Score distribution from ring buffer entries
    const dist = { veryLow: 0, low: 0, medium: 0, high: 0, veryHigh: 0 };
    for (const entry of this.#entries) {
      if (entry.score < 0.2) dist.veryLow++;
      else if (entry.score < 0.4) dist.low++;
      else if (entry.score < 0.6) dist.medium++;
      else if (entry.score < 0.8) dist.high++;
      else dist.veryHigh++;
    }

    return {
      avgScore,
      lowRate,
      totalChecked: this.#totalChecked,
      checkedWithScore: this.#entries.length,
      scoreDistribution: dist,
      recentScores: this.#entries.slice(-10).reverse(),
    };
  }

  /**
   * Returns recent entries for export.
   * @param {number} [limit=200]
   * @returns {Array<{ correlationId: string, score: number, timestamp: number, libraryId: string|null }>}
   */
  getRecentScores(limit = 200) {
    const sliceSize = Math.min(limit, this.#entries.length);
    return this.#entries.slice(-sliceSize).reverse();
  }

  /** Summary for inspect endpoint. */
  counts() {
    return {
      enabled: this.enabled,
      totalChecked: this.#totalChecked,
      avgScore: this.#totalChecked > 0 ? Math.round((this.#scoreSum / this.#totalChecked) * 10000) / 10000 : 0,
    };
  }

  /** Reset — clears all state (for test isolation). */
  reset() {
    this.#entries = [];
    this.#totalChecked = 0;
    this.#totalLow = 0;
    this.#scoreSum = 0;
  }
}

const groundingAnalytics = new GroundingAnalytics();

export { GroundingAnalytics, groundingAnalytics };
