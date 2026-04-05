// server/services/sessionQualityScorer.js
// ═══════════════════════════════════════════════════════════════
// SessionQualityScorer — Phase 40 (Singleton #25)
// In-memory per-session quality scoring from accumulated signals:
//   - Search scores (avgScore from each query)
//   - Feedback (positive/negative ratio)
//   - Completion rate (non-aborted queries)
//   - Rewrite success (local context rewrites)
//
// Config: QUALITY.enabled (default false), QUALITY.weights, QUALITY.sessionMinTurns
// Zero overhead when disabled.
// No file persistence — in-memory only. Scores rebuild from events after restart.
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';
import { logger } from './logger.js';
import { featureFlags } from './featureFlags.js';

class SessionQualityScorer {
  #enabled;
  #weights;
  #minTurns;
  /** @type {Map<string, { totalQueries: number, totalScore: number, abortedCount: number, localRewriteCount: number, totalRewrites: number, positiveFeedback: number, negativeFeedback: number, lastUpdated: number }>} */
  #sessions;

  constructor() {
    const cfg     = config.QUALITY ?? {};
    this.#enabled = cfg.enabled === true;
    this.#weights = {
      avgScore:         cfg.weights?.avgScore         ?? 0.35,
      feedbackPositive: cfg.weights?.feedbackPositive ?? 0.30,
      completionRate:   cfg.weights?.completionRate   ?? 0.20,
      rewriteSuccess:   cfg.weights?.rewriteSuccess   ?? 0.15,
    };
    this.#minTurns = cfg.sessionMinTurns ?? 2;
    this.#sessions = new Map();

    if (this.#enabled) {
      logger.info('sessionQualityScorer', `initialized (minTurns: ${this.#minTurns}, weights: ${JSON.stringify(this.#weights)})`);
    }
  }

  /** Whether quality scoring is active (dynamic — reads from featureFlags). */
  get enabled() {
    return featureFlags.isEnabled('QUALITY');
  }

  /**
   * Records a query result for a session.
   * Called by qualityListener on pipeline:complete.
   * @param {string} sessionId
   * @param {{ avgScore: number, aborted: boolean, rewriteMethod: string|null }} data
   */
  recordQuery(sessionId, { avgScore, aborted, rewriteMethod, libraryId }) {
    if (!this.enabled || !sessionId) return;

    const state = this.#getOrCreate(sessionId);
    state.totalQueries++;
    state.totalScore += (typeof avgScore === 'number' ? avgScore : 0);

    if (aborted) {
      state.abortedCount++;
    }

    if (rewriteMethod) {
      state.totalRewrites++;
      if (rewriteMethod === 'local_context') {
        state.localRewriteCount++;
      }
    }

    // Phase 61: store libraryId (last seen wins)
    if (libraryId) {
      state.libraryId = libraryId;
    }

    state.lastUpdated = Date.now();
  }

  /**
   * Records a feedback event for a session.
   * Called by qualityListener on feedback:submitted.
   * @param {string} sessionId
   * @param {{ rating: string }} data
   */
  recordFeedback(sessionId, { rating }) {
    if (!this.enabled || !sessionId) return;

    const state = this.#getOrCreate(sessionId);

    if (rating === 'positive') {
      state.positiveFeedback++;
    } else if (rating === 'negative') {
      state.negativeFeedback++;
    }

    state.lastUpdated = Date.now();
  }

  /**
   * Computes the weighted quality score for a session.
   * @param {string} sessionId
   * @returns {number|null} Quality score (0-1) or null if insufficient data
   */
  getScore(sessionId) {
    if (!this.enabled || !sessionId) return null;

    const state = this.#sessions.get(sessionId);
    if (!state || state.totalQueries < this.#minTurns) return null;

    const w = this.#weights;

    // Component 1: Average search score (0-1)
    const avgScoreComponent = state.totalScore / state.totalQueries;

    // Component 2: Positive feedback ratio (0-1), default 0.5 if no feedback
    const totalFeedback = state.positiveFeedback + state.negativeFeedback;
    const feedbackComponent = totalFeedback > 0
      ? state.positiveFeedback / totalFeedback
      : 0.5;

    // Component 3: Completion rate (0-1) — non-aborted / total
    const completionComponent = 1 - (state.abortedCount / state.totalQueries);

    // Component 4: Rewrite success (0-1) — local rewrites / total rewrites, default 0.5
    const rewriteComponent = state.totalRewrites > 0
      ? state.localRewriteCount / state.totalRewrites
      : 0.5;

    // Weighted sum
    const score = (w.avgScore * avgScoreComponent)
                + (w.feedbackPositive * feedbackComponent)
                + (w.completionRate * completionComponent)
                + (w.rewriteSuccess * rewriteComponent);

    // Clamp to [0, 1]
    return Math.max(0, Math.min(1, score));
  }

  /**
   * Returns all scored sessions sorted by score ascending (worst first).
   * Filters out sessions below minTurns.
   * @param {number} [limit=50]
   * @returns {Array<{ sessionId: string, score: number, totalQueries: number, abortedCount: number, positiveFeedback: number, negativeFeedback: number, lastUpdated: number }>}
   */
  getAllScores(limit = 50, libraryId = null) {
    if (!this.enabled) return [];

    const results = [];
    for (const [sessionId, state] of this.#sessions) {
      if (state.totalQueries < this.#minTurns) continue;
      if (libraryId && state.libraryId !== libraryId) continue;

      const score = this.getScore(sessionId);
      if (score === null) continue;

      results.push({
        sessionId,
        score,
        totalQueries:     state.totalQueries,
        abortedCount:     state.abortedCount,
        positiveFeedback: state.positiveFeedback,
        negativeFeedback: state.negativeFeedback,
        lastUpdated:      state.lastUpdated,
      });
    }

    // Sort by score ascending (worst first)
    results.sort((a, b) => a.score - b.score);

    return results.slice(0, limit);
  }

  /**
   * Removes quality data for a session.
   * Called by evictionListener step #7.
   * @param {string} sessionId
   */
  remove(sessionId) {
    if (!sessionId) return;
    this.#sessions.delete(sessionId);
  }

  /**
   * Resets all in-memory state. For testing only.
   */
  reset() {
    this.#sessions.clear();
  }

  /**
   * Summary for inspect endpoint.
   * @returns {{ enabled: boolean, trackedSessions: number }}
   */
  counts() {
    return {
      enabled:          this.enabled,
      trackedSessions:  this.#sessions.size,
    };
  }

  // ── Private: get or create session state ─────────────────────
  #getOrCreate(sessionId) {
    let state = this.#sessions.get(sessionId);
    if (!state) {
      state = {
        totalQueries:     0,
        totalScore:       0,
        abortedCount:     0,
        localRewriteCount: 0,
        totalRewrites:    0,
        positiveFeedback: 0,
        negativeFeedback: 0,
        lastUpdated:      Date.now(),
        libraryId:        null,
      };
      this.#sessions.set(sessionId, state);
    }
    return state;
  }
}

// ── Singleton instance ─────────────────────────────────────────
const sessionQualityScorer = new SessionQualityScorer();

export { SessionQualityScorer, sessionQualityScorer };
