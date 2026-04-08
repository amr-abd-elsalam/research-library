// server/services/costGovernor.js
// ═══════════════════════════════════════════════════════════════
// CostGovernor — Phase 76 (Singleton #36)
// Tracks actual token usage per session + per provider + globally.
// Calculates per-provider cost based on configurable rates.
// Emits 'cost:threshold' event when session approaches budget.
// Opt-in via config.COST_GOVERNANCE.enabled (default false).
// Zero overhead when disabled.
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';
import { eventBus } from './eventBus.js';
import { logger } from './logger.js';

class CostGovernor {
  /** @type {boolean} */
  #enabled;

  /** @type {Map<string, { inputTokens: number, outputTokens: number, requests: number, estimatedCost: number }>} */
  #sessionUsage = new Map();

  /** @type {Map<string, { inputTokens: number, outputTokens: number, requests: number, estimatedCost: number }>} */
  #providerUsage = new Map();

  /** @type {{ inputTokens: number, outputTokens: number, requests: number, totalCost: number }} */
  #globalUsage = { inputTokens: 0, outputTokens: 0, requests: 0, totalCost: 0 };

  /** @type {Object} */
  #rates;

  /** @type {number} */
  #monthlyBudgetCeiling;

  /** @type {number} */
  #sessionWarnThreshold;

  constructor() {
    const cfg = config.COST_GOVERNANCE ?? {};
    this.#enabled              = cfg.enabled === true;
    this.#rates                = cfg.perProviderRates ?? {};
    this.#monthlyBudgetCeiling = cfg.monthlyBudgetCeiling ?? 0;
    this.#sessionWarnThreshold = cfg.sessionWarnThreshold ?? 0.80;
  }

  /** @returns {boolean} */
  get enabled() { return this.#enabled; }

  /**
   * Whether budget enforcement is active.
   * Requires: enabled + enforceBudget config flag.
   * @returns {boolean}
   */
  get enforcementEnabled() {
    if (!this.#enabled) return false;
    return config.COST_GOVERNANCE?.enforceBudget === true;
  }

  /**
   * Records token usage for a request.
   * Updates session, provider, and global counters.
   * Calculates cost based on provider-specific rates.
   * Emits 'cost:threshold' when session approaches budget.
   *
   * @param {string|null} sessionId
   * @param {{ inputTokens?: number, outputTokens?: number }} tokens
   * @param {string} [providerName='unknown']
   */
  recordUsage(sessionId, { inputTokens = 0, outputTokens = 0 } = {}, providerName = 'unknown') {
    if (!this.#enabled) return;

    const cost = this.#calculateCost(inputTokens, outputTokens, providerName);

    // ── Update session usage ──────────────────────────────────
    if (sessionId) {
      const session = this.#sessionUsage.get(sessionId) || {
        inputTokens: 0, outputTokens: 0, requests: 0, estimatedCost: 0,
      };
      session.inputTokens  += inputTokens;
      session.outputTokens += outputTokens;
      session.requests     += 1;
      session.estimatedCost += cost;
      this.#sessionUsage.set(sessionId, session);

      // ── Check session threshold ─────────────────────────────
      this.#checkSessionThreshold(sessionId, session);
    }

    // ── Update provider usage ─────────────────────────────────
    const provider = this.#providerUsage.get(providerName) || {
      inputTokens: 0, outputTokens: 0, requests: 0, estimatedCost: 0,
    };
    provider.inputTokens  += inputTokens;
    provider.outputTokens += outputTokens;
    provider.requests     += 1;
    provider.estimatedCost += cost;
    this.#providerUsage.set(providerName, provider);

    // ── Update global usage ───────────────────────────────────
    this.#globalUsage.inputTokens  += inputTokens;
    this.#globalUsage.outputTokens += outputTokens;
    this.#globalUsage.requests     += 1;
    this.#globalUsage.totalCost    += cost;
  }

  /**
   * Returns usage for a specific session.
   * @param {string} sessionId
   * @returns {{ inputTokens: number, outputTokens: number, requests: number, estimatedCost: number }|null}
   */
  getSessionUsage(sessionId) {
    if (!sessionId) return null;
    const usage = this.#sessionUsage.get(sessionId);
    return usage ? { ...usage } : null;
  }

  /**
   * Returns usage for a specific provider.
   * @param {string} providerName
   * @returns {{ inputTokens: number, outputTokens: number, requests: number, estimatedCost: number }|null}
   */
  getProviderUsage(providerName) {
    if (!providerName) return null;
    const usage = this.#providerUsage.get(providerName);
    return usage ? { ...usage } : null;
  }

  /**
   * Returns global totals across all sessions and providers.
   * @returns {{ inputTokens: number, outputTokens: number, requests: number, totalCost: number }}
   */
  getGlobalUsage() {
    return { ...this.#globalUsage };
  }

  /**
   * Checks if a session has exceeded its actual token budget.
   * Uses actual tokens recorded by CostGovernor (not estimates).
   * @param {string} sessionId
   * @returns {{ overBudget: boolean, currentTokens: number, limit: number, ratio: number }}
   */
  isSessionOverBudget(sessionId) {
    if (!this.enforcementEnabled || !sessionId) {
      return { overBudget: false, currentTokens: 0, limit: 0, ratio: 0 };
    }
    const limit = config.SESSIONS?.maxTokensPerSession || 0;
    if (limit === 0) return { overBudget: false, currentTokens: 0, limit: 0, ratio: 0 };

    const usage = this.#sessionUsage.get(sessionId);
    const currentTokens = usage ? (usage.inputTokens + usage.outputTokens) : 0;
    const ratio = limit > 0 ? currentTokens / limit : 0;

    return { overBudget: ratio >= 1.0, currentTokens, limit, ratio };
  }

  /**
   * Returns top N sessions sorted by estimatedCost descending.
   * @param {number} [limit=5]
   * @returns {Array<{ sessionId: string, inputTokens: number, outputTokens: number, requests: number, estimatedCost: number }>}
   */
  getTopSessions(limit = 5) {
    const entries = [];
    for (const [sessionId, usage] of this.#sessionUsage) {
      entries.push({ sessionId, ...usage });
    }
    entries.sort((a, b) => b.estimatedCost - a.estimatedCost);
    return entries.slice(0, limit);
  }

  /**
   * Summary for inspect endpoint.
   * @returns {{ enabled: boolean, enforcementEnabled: boolean, activeSessions: number, trackedProviders: number, globalUsage: object, monthlyBudgetCeiling: number }}
   */
  counts() {
    return {
      enabled:              this.#enabled,
      enforcementEnabled:   this.enforcementEnabled,
      activeSessions:       this.#sessionUsage.size,
      trackedProviders:     this.#providerUsage.size,
      globalUsage:          { ...this.#globalUsage },
      monthlyBudgetCeiling: this.#monthlyBudgetCeiling,
    };
  }

  /**
   * Resets all state. For testing only.
   */
  reset() {
    this.#sessionUsage.clear();
    this.#providerUsage.clear();
    this.#globalUsage = { inputTokens: 0, outputTokens: 0, requests: 0, totalCost: 0 };
  }

  // ── Private helpers ─────────────────────────────────────────

  /**
   * Calculates cost in USD for given token counts using provider-specific rates.
   * @param {number} inputTokens
   * @param {number} outputTokens
   * @param {string} providerName
   * @returns {number} cost in USD
   */
  #calculateCost(inputTokens, outputTokens, providerName) {
    const providerRates = this.#rates[providerName];
    if (!providerRates) return 0;

    const inputCost  = (inputTokens / 1000) * (providerRates.inputPer1kTokens ?? 0);
    const outputCost = (outputTokens / 1000) * (providerRates.outputPer1kTokens ?? 0);

    return inputCost + outputCost;
  }

  /**
   * Checks if a session has reached the warn threshold.
   * Emits 'cost:threshold' event when threshold exceeded.
   * @param {string} sessionId
   * @param {{ inputTokens: number, outputTokens: number, requests: number, estimatedCost: number }} session
   */
  #checkSessionThreshold(sessionId, session) {
    // Only check if session token budget is configured
    const sessionLimit = config.SESSIONS?.maxTokensPerSession || 0;
    if (sessionLimit === 0) return;

    const totalTokens = session.inputTokens + session.outputTokens;
    const ratio = totalTokens / sessionLimit;

    if (ratio >= this.#sessionWarnThreshold) {
      eventBus.emit('cost:threshold', {
        sessionId,
        currentTokens: { input: session.inputTokens, output: session.outputTokens },
        estimatedCost: session.estimatedCost,
        threshold: this.#sessionWarnThreshold,
        ratio,
        timestamp: Date.now(),
      });

      logger.warn('costGovernor', `session ${sessionId} approaching token budget: ${Math.round(ratio * 100)}%`, {
        _sessionId: sessionId,
      });
    }
  }
}

// ── Singleton instance ─────────────────────────────────────────
const costGovernor = new CostGovernor();

export { CostGovernor, costGovernor };
