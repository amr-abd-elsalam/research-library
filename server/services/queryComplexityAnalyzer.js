// server/services/queryComplexityAnalyzer.js
// ═══════════════════════════════════════════════════════════════
// QueryComplexityAnalyzer — Phase 64 (Singleton #31)
// Analyzes query complexity and returns type + score + indicators.
// In-memory regex matching — zero API calls, microsecond latency.
// Reads QUERY_COMPLEXITY config section for strategies.
// Feature-gated via featureFlags.isEnabled('QUERY_COMPLEXITY').
// Zero overhead when disabled — analyze() returns factual defaults.
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';
import { featureFlags } from './featureFlags.js';

// ── Complexity detection patterns ──────────────────────────────

const COMPARATIVE_PATTERN = /(?:^|[\s,.،؛:!؟?])(الفرق|فرق|مقارنة|قارن|أيهما|ايهما|أفضل|افضل|مقابل|ضد|بين\s+.+?\s+و|versus|compare|differ|vs)(?:[\s,.،؛:!؟?]|$)/i;

const ANALYTICAL_PATTERN = /(?:^|[\s,.،؛:!؟?])(لماذا|ليش|ليه|كيف يمكن|ما أثر|ما تأثير|ما سبب|ما أسباب|حلل|تحليل|تفسير|فسّر|فسر|why|how can|analyze|impact|cause|reason)(?:[\s,.،؛:!؟?]|$)/i;

const MULTI_PART_PATTERN = /(?:^|[\s,.،؛:!؟?])(أولاً|أولا|ثانياً|ثانيا|ثالثاً|ثالثا|أيضاً|أيضا|بالإضافة|وكذلك|علاوة|firstly|secondly|also|additionally|moreover)(?:[\s,.،؛:!؟?]|$)/i;

const EXPLORATORY_PATTERN = /(?:^|[\s,.،؛:!؟?])(ما هو|ما هي|ماذا يعني|اشرح|وضّح|وضح|عرّف|عرف|شرح شامل|نظرة عامة|ملخص شامل|overview|explain|define|describe|elaborate)(?:[\s,.،؛:!؟?]|$)/i;

class QueryComplexityAnalyzer {

  /** Whether complexity analysis is active (dynamic — reads from featureFlags). */
  get enabled() {
    return featureFlags.isEnabled('QUERY_COMPLEXITY');
  }

  /**
   * Analyzes query complexity and returns type + score + indicators.
   * Returns factual defaults when disabled.
   * @param {string} message — raw user message
   * @returns {{ type: string, score: number, indicators: string[] }}
   */
  analyze(message) {
    if (!this.enabled) {
      return { type: 'factual', score: 1, indicators: [] };
    }

    const normalized = (message || '').trim();
    if (!normalized) {
      return { type: 'factual', score: 1, indicators: [] };
    }

    const indicators = [];
    let score = 1;

    // ── Indicator 1: Word count ─────────────────────────────
    const words = normalized.split(/\s+/).length;
    if (words > 20) { score += 1; indicators.push('long_query'); }
    if (words > 40) { score += 1; indicators.push('very_long_query'); }

    // ── Indicator 2: Comparative keywords ───────────────────
    if (COMPARATIVE_PATTERN.test(normalized)) {
      score += 2;
      indicators.push('comparative');
    }

    // ── Indicator 3: Analytical keywords ────────────────────
    if (ANALYTICAL_PATTERN.test(normalized)) {
      score += 1;
      indicators.push('analytical');
    }

    // ── Indicator 4: Multi-part indicators ──────────────────
    const questionMarks = (normalized.match(/[؟?]/g) || []).length;
    if (MULTI_PART_PATTERN.test(normalized) || questionMarks > 1) {
      score += 2;
      indicators.push('multi_part');
    }

    // ── Indicator 5: Exploratory keywords ───────────────────
    if (EXPLORATORY_PATTERN.test(normalized) && words > 10) {
      score += 1;
      indicators.push('exploratory');
    }

    // Cap score at 5
    score = Math.min(score, 5);

    // ── Determine type based on indicator priority ──────────
    // multi_part > comparative > analytical > exploratory > factual
    let type = 'factual';
    if (indicators.includes('multi_part'))        type = 'multi_part';
    else if (indicators.includes('comparative'))  type = 'comparative';
    else if (indicators.includes('analytical'))   type = 'analytical';
    else if (indicators.includes('exploratory'))  type = 'exploratory';

    return { type, score, indicators };
  }

  /**
   * Returns adaptive pipeline parameters for a given complexity.
   * @param {{ type: string, score: number }} complexity
   * @returns {{ topK: number|null, promptSuffix: string|null }}
   */
  getStrategy(complexity) {
    if (!this.enabled) return { topK: null, promptSuffix: null };

    const strategies = config.QUERY_COMPLEXITY?.strategies;
    if (!strategies) return { topK: null, promptSuffix: null };

    const strategy = strategies[complexity.type] || strategies.factual || {};
    return {
      topK: strategy.maxTopK ?? null,
      promptSuffix: strategy.promptSuffix || null,
    };
  }

  /**
   * Resets internal state. Stateless singleton — no-op.
   * Provided for pattern consistency with other singletons.
   */
  reset() {
    // Stateless — nothing to reset
  }

  /**
   * Summary for inspect endpoint.
   * @returns {{ enabled: boolean }}
   */
  counts() {
    return { enabled: this.enabled };
  }
}

// ── Singleton instance ─────────────────────────────────────────
const queryComplexityAnalyzer = new QueryComplexityAnalyzer();

export { QueryComplexityAnalyzer, queryComplexityAnalyzer };
