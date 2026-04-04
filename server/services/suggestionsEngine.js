// server/services/suggestionsEngine.js
// ═══════════════════════════════════════════════════════════════
// SuggestionsEngine — Phase 29
// Generates context-aware follow-up suggestions based on
// accumulated ConversationContext data.
// Template-based — no API calls (zero cost).
// Zero overhead when SUGGESTIONS.enabled !== true.
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';
import { logger } from './logger.js';
import { featureFlags } from './featureFlags.js';

// ── Default suggestion templates ───────────────────────────────
// Each template has:
//   trigger: query type ('factual', 'conceptual', etc.) or '*' for any
//   generator: (ctx) => string|null — returns suggestion text or null to skip
const DEFAULT_TEMPLATES = [
  // ── Factual triggers ─────────────────────────────────────────
  { trigger: 'factual',    generator: (ctx) => ctx.entities.length > 0 ? `ما المزيد عن ${ctx.entities[ctx.entities.length - 1]}؟` : null },
  { trigger: 'factual',    generator: (ctx) => ctx.entities.length > 1 ? `ما الفرق بين ${ctx.entities[ctx.entities.length - 1]} و${ctx.entities[ctx.entities.length - 2]}؟` : null },

  // ── Conceptual triggers ──────────────────────────────────────
  { trigger: 'conceptual', generator: (ctx) => ctx.entities.length > 0 ? `اشرح ${ctx.entities[ctx.entities.length - 1]} بالتفصيل` : null },
  { trigger: 'conceptual', generator: (_ctx) => `ما هي التطبيقات العملية لذلك؟` },

  // ── Summary triggers ─────────────────────────────────────────
  { trigger: 'summary',    generator: (ctx) => ctx.entities.length > 0 ? `ملخص عن ${ctx.entities[ctx.entities.length - 1]}` : null },
  { trigger: 'summary',    generator: (_ctx) => `ما هي أهم النقاط الأساسية؟` },

  // ── How-to triggers ──────────────────────────────────────────
  { trigger: 'how_to',     generator: (_ctx) => `ما هي الخطوات التالية؟` },
  { trigger: 'how_to',     generator: (ctx) => ctx.entities.length > 0 ? `ما أفضل طريقة لتطبيق ${ctx.entities[ctx.entities.length - 1]}؟` : null },

  // ── Generic triggers (match any query type) ──────────────────
  { trigger: '*',          generator: (ctx) => ctx.entities.length > 0 ? `أخبرني أكثر عن ${ctx.entities[ctx.entities.length - 1]}` : null },
  { trigger: '*',          generator: (ctx) => ctx.recentTopics.length > 0 ? `ما المواضيع المرتبطة بذلك؟` : null },
  { trigger: '*',          generator: (ctx) => ctx.entities.length > 0 ? `ما أهمية ${ctx.entities[ctx.entities.length - 1]}؟` : null },
];

class SuggestionsEngine {
  #maxSuggestions;
  #minTurns;
  #templates;
  #clickCounts = new Map();
  #totalClicks = 0;

  constructor() {
    const cfg = config.SUGGESTIONS ?? {};
    this.#maxSuggestions = Math.min(Math.max(cfg.maxSuggestions ?? 3, 1), 5);
    this.#minTurns = cfg.minTurns ?? 1;
    this.#templates = DEFAULT_TEMPLATES;
  }

  /**
   * Generates follow-up suggestions from conversation context.
   * Template-based — no API calls.
   * @param {{ turns: number, entities: string[], recentTopics: string[], lastQueryType: string|null, summary: string|null }} convCtx
   * @returns {string[]} — array of suggestion strings (0 to maxSuggestions)
   */
  generate(convCtx) {
    if (!featureFlags.isEnabled('SUGGESTIONS')) return [];
    if (!convCtx || convCtx.turns < this.#minTurns) return [];
    if (!convCtx.entities || convCtx.entities.length === 0) return [];

    const queryType = convCtx.lastQueryType || '*';
    const candidates = [];

    // Collect matching templates (trigger matches query type or is wildcard)
    for (const tmpl of this.#templates) {
      if (tmpl.trigger !== '*' && tmpl.trigger !== queryType) continue;
      try {
        const suggestion = tmpl.generator(convCtx);
        if (suggestion && typeof suggestion === 'string' && suggestion.length > 3) {
          candidates.push(suggestion);
        }
      } catch (err) {
        logger.debug('suggestionsEngine', 'template error', { error: err.message });
      }
    }

    // Deduplicate and limit
    const unique = [...new Set(candidates)];
    const result = unique.slice(0, this.#maxSuggestions);

    if (result.length > 0) {
      logger.debug('suggestionsEngine', `generated ${result.length} suggestions`, {
        queryType,
        entityCount: convCtx.entities.length,
      });
    }

    return result;
  }

  /** Whether suggestions feature is enabled. */
  get enabled() { return featureFlags.isEnabled('SUGGESTIONS'); }

  /**
   * Records a suggestion click.
   * @param {string} text — the suggestion text that was clicked
   */
  recordClick(text) {
    if (!this.enabled) return;
    if (!text || typeof text !== 'string') return;
    const key = text.trim().slice(0, 200);
    if (!key) return;
    this.#clickCounts.set(key, (this.#clickCounts.get(key) || 0) + 1);
    this.#totalClicks++;
  }

  /**
   * Returns click tracking summary.
   * @returns {{ totalClicks: number, uniqueSuggestions: number, top: Array<{text: string, count: number}> }}
   */
  getClickCounts() {
    return {
      totalClicks: this.#totalClicks,
      uniqueSuggestions: this.#clickCounts.size,
      top: [...this.#clickCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([text, count]) => ({ text, count })),
    };
  }

  /**
   * Resets click tracking state. For testing.
   */
  reset() {
    this.#clickCounts.clear();
    this.#totalClicks = 0;
  }

  /**
   * Summary for inspect endpoint.
   * @returns {{ enabled: boolean, maxSuggestions: number, minTurns: number, templateCount: number, totalClicks: number }}
   */
  counts() {
    return {
      enabled:        this.enabled,
      maxSuggestions:  this.#maxSuggestions,
      minTurns:       this.#minTurns,
      templateCount:  this.#templates.length,
      totalClicks:    this.#totalClicks,
    };
  }
}

// ── Singleton instance ─────────────────────────────────────────
const suggestionsEngine = new SuggestionsEngine();

export { SuggestionsEngine, suggestionsEngine };
