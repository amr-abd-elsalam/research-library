// server/services/ragStrategySelector.js
// ═══════════════════════════════════════════════════════════════
// RAGStrategySelector — Phase 85 (Singleton #42)
// Adaptive RAG Strategy Engine — selects retrieval strategy
// dynamically based on query complexity, conversation state,
// previous quality scores, and follow-up detection.
// Rule-based selection — zero API calls, microsecond latency.
// Feature-gated via featureFlags.isEnabled('RAG_STRATEGIES').
// Zero overhead when disabled — select() returns null.
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';
import { featureFlags } from './featureFlags.js';

class RAGStrategySelector {
  #stats;

  constructor() {
    this.#stats = {
      totalSelections: 0,
      strategyBreakdown: {
        quick_factual: 0,
        deep_analytical: 0,
        conversational_followup: 0,
        exploratory_scan: 0,
        none: 0,
      },
    };
  }

  /** Whether RAG strategy selection is active (dynamic — reads from featureFlags). */
  get enabled() {
    return featureFlags.isEnabled('RAG_STRATEGIES');
  }

  /**
   * Selects the optimal RAG strategy based on multi-dimensional input signals.
   * Returns null when disabled or no matching rule.
   *
   * @param {{ complexityType: string, turnNumber: number, lastAvgScore: number, rollingAvgScore?: number|null, isFollowUp: boolean, messageWordCount: number }} params
   * @returns {{ name: string, topK: number, skipStages: string[], promptSuffix: string, preferLocalRewrite: boolean, qualitySource: string }|null}
   */
  select({ complexityType, turnNumber, lastAvgScore, rollingAvgScore, isFollowUp, messageWordCount }) {
    if (!this.enabled) return null;

    this.#stats.totalSelections++;

    const strategies = config.RAG_STRATEGIES?.strategies ?? {};
    const rules = config.RAG_STRATEGIES?.selectionRules ?? {};

    const turnThreshold   = rules.turnThresholdForConversational ?? 3;
    const lowScoreThresh  = rules.lowScoreThresholdForDeep ?? 0.5;
    const maxQuickWords   = rules.maxQuickFactualWords ?? 10;

    // ── Phase 88: resolve quality score for Rule 3 ──
    const useRolling = rules.useRollingScore !== false;  // default true
    const qualityScore = (useRolling && typeof rollingAvgScore === 'number' && rollingAvgScore > 0)
      ? rollingAvgScore
      : lastAvgScore;
    const qualitySource = (useRolling && typeof rollingAvgScore === 'number' && rollingAvgScore > 0)
      ? 'rolling'
      : (lastAvgScore > 0 ? 'last' : 'none');

    let selectedName = null;

    // ── Rule 1: Follow-up + sufficient turns → conversational_followup ──
    if (isFollowUp && turnNumber >= turnThreshold) {
      selectedName = 'conversational_followup';
    }

    // ── Rule 2: Short factual (≤N words, factual type) → quick_factual ──
    if (!selectedName && complexityType === 'factual' && messageWordCount <= maxQuickWords) {
      selectedName = 'quick_factual';
    }

    // ── Rule 3: Low previous score + complex type → deep_analytical ──
    // qualityScore === 0 means "no previous scores" → skip this rule
    if (!selectedName && qualityScore > 0 && qualityScore < lowScoreThresh
        && (complexityType === 'analytical' || complexityType === 'comparative' || complexityType === 'multi_part')) {
      selectedName = 'deep_analytical';
    }

    // ── Rule 4: Exploratory → exploratory_scan ──
    if (!selectedName && complexityType === 'exploratory') {
      selectedName = 'exploratory_scan';
    }

    // ── Rule 5: Analytical/comparative/multi_part → deep_analytical ──
    if (!selectedName && (complexityType === 'analytical' || complexityType === 'comparative' || complexityType === 'multi_part')) {
      selectedName = 'deep_analytical';
    }

    // ── Rule 6: Default — no match ──
    if (!selectedName) {
      this.#stats.strategyBreakdown.none++;
      return null;
    }

    // ── Lookup strategy definition from config ──
    const strategyDef = strategies[selectedName];
    if (!strategyDef) {
      // Strategy not defined in config — treat as no match
      this.#stats.strategyBreakdown.none++;
      return null;
    }

    // Update stats
    if (this.#stats.strategyBreakdown[selectedName] !== undefined) {
      this.#stats.strategyBreakdown[selectedName]++;
    }

    return {
      name:               selectedName,
      topK:               strategyDef.topK ?? null,
      skipStages:         Array.isArray(strategyDef.skipStages) ? strategyDef.skipStages : [],
      promptSuffix:       strategyDef.promptSuffix ?? '',
      preferLocalRewrite: strategyDef.preferLocalRewrite ?? false,
      qualitySource,
    };
  }

  /**
   * Summary for inspect endpoint.
   * @returns {{ enabled: boolean, totalSelections: number, strategyBreakdown: Object }}
   */
  counts() {
    return {
      enabled:            this.enabled,
      totalSelections:    this.#stats.totalSelections,
      strategyBreakdown:  { ...this.#stats.strategyBreakdown },
    };
  }

  /**
   * Resets internal state. For test isolation.
   */
  reset() {
    this.#stats = {
      totalSelections: 0,
      strategyBreakdown: {
        quick_factual: 0,
        deep_analytical: 0,
        conversational_followup: 0,
        exploratory_scan: 0,
        none: 0,
      },
    };
  }
}

// ── Singleton instance ─────────────────────────────────────────
const ragStrategySelector = new RAGStrategySelector();

export { RAGStrategySelector, ragStrategySelector };
