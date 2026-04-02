// server/services/sessionBudget.js
// ═══════════════════════════════════════════════════════════════
// SessionBudgetTracker — Phase 19
// In-memory tracker for cumulative token consumption per session.
// Used for budget enforcement (maxTokensPerSession) and admin
// visibility. Fast-path check — the session files themselves
// contain token_usage for persistence.
// Zero dependencies beyond config + logger.
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';
import { logger } from './logger.js';

class SessionBudgetTracker {
  /** @type {Map<string, { totalTokens: number, totalCost: number, turnCount: number, lastUpdated: number }>} */
  #budgets = new Map();

  /**
   * Records token usage for a session.
   * Called by sessionStatsListener on each pipeline:complete event.
   * @param {string} sessionId
   * @param {{ embedding?: number, input?: number, output?: number, rewrite?: number }|null} tokens
   * @param {number} [cost=0] — estimated cost from costTracker
   */
  record(sessionId, tokens, cost = 0) {
    if (!sessionId) return;

    const existing = this.#budgets.get(sessionId) || {
      totalTokens: 0,
      totalCost:   0,
      turnCount:   0,
      lastUpdated: 0,
    };

    const tokenSum = (tokens?.embedding || 0)
                   + (tokens?.input    || 0)
                   + (tokens?.output   || 0)
                   + (tokens?.rewrite  || 0);

    existing.totalTokens += tokenSum;
    existing.totalCost   += cost;
    existing.turnCount   += 1;
    existing.lastUpdated  = Date.now();

    this.#budgets.set(sessionId, existing);
  }

  /**
   * Checks if a session has exceeded its token budget.
   * Returns exceeded=false if maxTokensPerSession is 0 (unlimited).
   * @param {string} sessionId
   * @returns {{ exceeded: boolean, usage: object|null, limit: number }}
   */
  check(sessionId) {
    const limit = config.SESSIONS?.maxTokensPerSession || 0;

    // 0 = unlimited — always passes
    if (limit === 0) {
      return { exceeded: false, usage: null, limit: 0 };
    }

    const usage = this.#budgets.get(sessionId);
    if (!usage) {
      return { exceeded: false, usage: null, limit };
    }

    return {
      exceeded: usage.totalTokens >= limit,
      usage,
      limit,
    };
  }

  /**
   * Returns budget info for a session (for inspect/resume endpoints).
   * @param {string} sessionId
   * @returns {{ totalTokens: number, totalCost: number, turnCount: number, lastUpdated: number }|null}
   */
  get(sessionId) {
    return this.#budgets.get(sessionId) || null;
  }

  /**
   * Number of sessions being tracked.
   * @returns {number}
   */
  get size() {
    return this.#budgets.size;
  }

  /**
   * Returns summary for inspect endpoint.
   * @returns {{ trackedSessions: number, maxTokensPerSession: number }}
   */
  counts() {
    return {
      trackedSessions:     this.#budgets.size,
      maxTokensPerSession: config.SESSIONS?.maxTokensPerSession || 0,
    };
  }

  /**
   * Removes budget entries older than maxAgeMs.
   * Prevents memory leaks from abandoned sessions.
   * @param {number} [maxAgeMs=86400000] — default 24 hours
   * @returns {number} count of removed entries
   */
  cleanup(maxAgeMs = 24 * 60 * 60 * 1000) {
    const cutoff  = Date.now() - maxAgeMs;
    let   removed = 0;

    for (const [id, budget] of this.#budgets) {
      if (budget.lastUpdated && budget.lastUpdated < cutoff) {
        this.#budgets.delete(id);
        removed++;
      }
    }

    if (removed > 0) {
      logger.debug('sessionBudget', `cleaned ${removed} stale budget entries`);
    }

    return removed;
  }

  /**
   * Clears all budget entries. Intended for testing only.
   */
  reset() {
    this.#budgets.clear();
  }
}

// ── Singleton instance ─────────────────────────────────────────
const sessionBudget = new SessionBudgetTracker();

// ── Periodic cleanup (every 6 hours) ───────────────────────────
const _cleanupTimer = setInterval(
  () => { sessionBudget.cleanup(); },
  6 * 60 * 60 * 1000,
);
_cleanupTimer.unref(); // Don't prevent process exit

export { SessionBudgetTracker, sessionBudget };
