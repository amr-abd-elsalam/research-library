// server/services/contextManager.js
// ═══════════════════════════════════════════════════════════════
// ContextManager — computes a token budget and distributes it
// between RAG context hits and conversation history.
// Ensures the total prompt stays within the model's sweet spot.
// ═══════════════════════════════════════════════════════════════

import { estimateTokens } from './costTracker.js';
import config from '../../config.js';

class ContextManager {
  /** @type {number} */
  #maxTokenBudget;
  /** @type {number} */
  #contextRatio;
  /** @type {number} */
  #SAFETY_MARGIN = 0.9;

  /**
   * @param {object} [options]
   * @param {number} [options.maxTokenBudget]
   * @param {number} [options.contextRatio]
   */
  constructor(options = {}) {
    this.#maxTokenBudget = options.maxTokenBudget
      ?? config.CONTEXT?.maxTokenBudget
      ?? 6000;
    this.#contextRatio = options.contextRatio
      ?? config.CONTEXT?.contextRatio
      ?? 0.7;
  }

  // ── buildWindow ────────────────────────────────────────────
  /**
   * Allocates token budget across system prompt, message,
   * RAG hits, and history — trimming when necessary.
   *
   * @param {object} params
   * @param {string} params.systemPrompt
   * @param {Array}  params.ragHits       — Qdrant search results
   * @param {Array}  params.history        — conversation history [{role, text}]
   * @param {string} params.message        — current user question
   * @returns {{ hits: Array, history: Array, budget: object }}
   */
  buildWindow({ systemPrompt, ragHits, history, message }) {
    const totalBudget = Math.floor(this.#maxTokenBudget * this.#SAFETY_MARGIN);

    const systemTokens  = estimateTokens(systemPrompt || '');
    const messageTokens = estimateTokens(message || '');

    // Fixed costs: system prompt + current message
    const fixedCost = systemTokens + messageTokens;

    // Remaining budget for context + history
    let remaining = totalBudget - fixedCost;

    // If budget is too tight even for fixed costs — return empty
    if (remaining <= 0) {
      return {
        hits:    [],
        history: [],
        budget: {
          total:     totalBudget,
          system:    systemTokens,
          message:   messageTokens,
          context:   0,
          history:   0,
          remaining: 0,
        },
      };
    }

    // Split remaining budget: contextRatio for RAG, rest for history
    const contextBudget = Math.floor(remaining * this.#contextRatio);
    const historyBudget = remaining - contextBudget;

    // ── Trim RAG hits (lowest score removed first) ───────────
    const trimmedHits = [];
    let contextTokensUsed = 0;

    // Hits are already sorted by score descending (from Qdrant)
    const hitsArray = Array.isArray(ragHits) ? ragHits : [];
    for (const hit of hitsArray) {
      const content = hit.payload?.parent_content || hit.payload?.content || '';
      const hitTokens = estimateTokens(content);

      if (contextTokensUsed + hitTokens <= contextBudget) {
        trimmedHits.push(hit);
        contextTokensUsed += hitTokens;
      } else {
        // Budget exhausted — stop adding (lower-score hits are dropped)
        break;
      }
    }

    // ── Trim history (oldest removed first → newest kept) ────
    const trimmedHistory = [];
    let historyTokensUsed = 0;

    const histArray = Array.isArray(history) ? history : [];
    // Walk from newest to oldest
    for (let i = histArray.length - 1; i >= 0; i--) {
      const item = histArray[i];
      const itemTokens = estimateTokens(item.text || '');

      if (historyTokensUsed + itemTokens <= historyBudget) {
        trimmedHistory.unshift(item); // prepend to maintain order
        historyTokensUsed += itemTokens;
      } else {
        // Budget exhausted — older items are dropped
        break;
      }
    }

    const finalRemaining = remaining - contextTokensUsed - historyTokensUsed;

    return {
      hits:    trimmedHits,
      history: trimmedHistory,
      budget: {
        total:     totalBudget,
        system:    systemTokens,
        message:   messageTokens,
        context:   contextTokensUsed,
        history:   historyTokensUsed,
        remaining: finalRemaining,
      },
    };
  }
}

export { ContextManager };
