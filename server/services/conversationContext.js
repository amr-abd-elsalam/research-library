// server/services/conversationContext.js
// ═══════════════════════════════════════════════════════════════
// ConversationContext — Phase 28
// Manages per-session conversation context in-memory:
//   - Extracts key entities/topics from each turn
//   - Maintains a running context summary per session
//   - Provides hasRichContext() for local rewrite decisions
//   - Fed by contextListener via EventBus (pipeline:complete + pipeline:cacheHit)
// Zero overhead when CONTEXT.intelligentCompaction === false.
// No file persistence — ephemeral context rebuilt from live events.
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';
import { logger } from './logger.js';

class ConversationContext {
  /** @type {Map<string, ContextState>} */
  #sessions = new Map();
  #maxEntities;
  #enabled;

  constructor() {
    const ctx = config.CONTEXT ?? {};
    this.#maxEntities = ctx.maxContextEntities ?? 20;
    this.#enabled = ctx.intelligentCompaction !== false;
  }

  // ── Guard: skip if disabled ──────────────────────────────────
  get #active() { return this.#enabled; }

  /**
   * Records a turn in the conversation context.
   * Extracts entities/topics and updates the running context summary.
   * Called by contextListener on pipeline:complete + pipeline:cacheHit.
   * @param {string} sessionId
   * @param {{ message: string, response: string, queryType: string|null, topicFilter: string|null }} turnData
   */
  recordTurn(sessionId, turnData) {
    if (!this.#active || !sessionId) return;

    let state = this.#sessions.get(sessionId);
    if (!state) {
      state = {
        turns: 0,
        entities: [],
        recentTopics: [],
        lastQueryType: null,
        contextSummary: null,
        lastActiveAt: Date.now(),
      };
      this.#sessions.set(sessionId, state);
    }

    state.turns++;
    state.lastActiveAt = Date.now();
    state.lastQueryType = turnData.queryType || null;

    // Extract entities from message (lightweight — no API call)
    const extracted = this.#extractEntities(turnData.message);
    for (const entity of extracted) {
      if (!state.entities.includes(entity)) {
        state.entities.push(entity);
      }
    }

    // Also extract from response (first 300 chars — key terms often appear early)
    if (turnData.response) {
      const responseEntities = this.#extractEntities(turnData.response.slice(0, 300));
      for (const entity of responseEntities) {
        if (!state.entities.includes(entity)) {
          state.entities.push(entity);
        }
      }
    }

    // Enforce max entities — keep most recent
    if (state.entities.length > this.#maxEntities) {
      state.entities = state.entities.slice(-this.#maxEntities);
    }

    // Track recent topics (last 5)
    if (turnData.topicFilter && !state.recentTopics.includes(turnData.topicFilter)) {
      state.recentTopics.push(turnData.topicFilter);
      if (state.recentTopics.length > 5) state.recentTopics.shift();
    }

    // Rebuild context summary
    state.contextSummary = this.#buildSummary(state);

    logger.debug('conversationContext', `recorded turn #${state.turns} for session ${sessionId.slice(0, 8)}`, {
      entities: state.entities.length,
      topics: state.recentTopics.length,
    });
  }

  /**
   * Returns the current context for a session.
   * Used by stageRewriteQuery for local rewriting decisions.
   * @param {string} sessionId
   * @returns {{ turns: number, entities: string[], recentTopics: string[], lastQueryType: string|null, summary: string|null }|null}
   */
  getContext(sessionId) {
    if (!this.#active || !sessionId) return null;
    const state = this.#sessions.get(sessionId);
    if (!state) return null;
    return {
      turns: state.turns,
      entities: [...state.entities],
      recentTopics: [...state.recentTopics],
      lastQueryType: state.lastQueryType,
      summary: state.contextSummary,
    };
  }

  /**
   * Checks if session has enough accumulated context for local rewriting
   * (avoiding an API call for simple follow-up questions).
   * @param {string} sessionId
   * @returns {boolean}
   */
  hasRichContext(sessionId) {
    if (!this.#active) return false;
    const state = this.#sessions.get(sessionId);
    if (!state) return false;
    return state.turns >= 2 && state.entities.length >= 1;
  }

  /**
   * Removes context for a session (cleanup on session delete, etc.).
   * @param {string} sessionId
   */
  evict(sessionId) {
    this.#sessions.delete(sessionId);
  }

  /**
   * Lightweight entity extraction — no API calls, no external dependencies.
   * Extracts quoted strings and Arabic definite nouns.
   * @param {string} text
   * @returns {string[]}
   */
  #extractEntities(text) {
    if (!text || typeof text !== 'string') return [];
    const entities = [];

    // 1. Quoted strings (Arabic quotes «» + English quotes "")
    const quotedMatches = text.match(/[""«»「」](.*?)[""«»「」]/g);
    if (quotedMatches) {
      for (const q of quotedMatches) {
        const clean = q.replace(/[""«»「」]/g, '').trim();
        if (clean.length > 1 && clean.length < 60) {
          entities.push(clean);
        }
      }
    }

    // 2. Arabic definite nouns (ال + 3+ Arabic chars)
    const arabicNouns = text.match(/ال[\u0600-\u06FF]{3,}/g);
    if (arabicNouns) {
      const unique = [...new Set(arabicNouns)];
      for (const noun of unique.slice(0, 8)) {
        if (!entities.includes(noun)) {
          entities.push(noun);
        }
      }
    }

    return entities.slice(0, 10);
  }

  /**
   * Builds a compact context summary string from accumulated state.
   * Used as context hint for local rewrite.
   * @param {object} state — internal ContextState
   * @returns {string|null}
   */
  #buildSummary(state) {
    const parts = [];

    if (state.entities.length > 0) {
      // Show last 5 entities — most recent context
      parts.push(`المواضيع المذكورة: ${state.entities.slice(-5).join('، ')}`);
    }

    if (state.lastQueryType) {
      parts.push(`نوع آخر سؤال: ${state.lastQueryType}`);
    }

    if (state.recentTopics.length > 0) {
      parts.push(`الأقسام: ${state.recentTopics.join('، ')}`);
    }

    return parts.length > 0 ? parts.join('. ') : null;
  }

  /**
   * Summary for inspect endpoint.
   * @returns {{ enabled: boolean, activeSessions: number, totalTurns: number, maxEntities: number }}
   */
  counts() {
    let totalTurns = 0;
    for (const [, state] of this.#sessions) {
      totalTurns += state.turns;
    }
    return {
      enabled:        this.#active,
      activeSessions: this.#sessions.size,
      totalTurns,
      maxEntities:    this.#maxEntities,
    };
  }

  /**
   * Resets all state. For testing only.
   */
  reset() {
    this.#sessions.clear();
  }
}

// ── Singleton instance ─────────────────────────────────────────
const conversationContext = new ConversationContext();

export { ConversationContext, conversationContext };
