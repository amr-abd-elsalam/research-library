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

  // ── Eviction (Phase 30) ─────────────────────────────────────
  #evictionEnabled;
  #evictionIdleMs;
  #evictionIntervalMs;
  #evictionTimer  = null;
  #evictionCount  = 0;
  #onEvict        = null;

  // ── Rolling quality (Phase 87) ──────────────────────────────
  #rollingAlpha;

  constructor() {
    const ctx = config.CONTEXT ?? {};
    this.#maxEntities = ctx.maxContextEntities ?? 20;
    this.#enabled = ctx.intelligentCompaction !== false;

    // Eviction config (Phase 30)
    this.#evictionEnabled    = ctx.evictionEnabled !== false;
    this.#evictionIdleMs     = Math.max(ctx.evictionIdleMs ?? 1800000, 60000);
    this.#evictionIntervalMs = Math.max(ctx.evictionIntervalMs ?? 300000, 60000);

    // Rolling quality score alpha (Phase 87)
    this.#rollingAlpha = Math.max(0, Math.min(1, ctx.rollingQualityAlpha ?? 0.3));
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
        lastAvgScore: null,
        rollingAvgScore: null,
      };
      this.#sessions.set(sessionId, state);
    }

    state.turns++;
    state.lastActiveAt = Date.now();
    state.lastQueryType = turnData.queryType || null;

    // Phase 86: track search quality for RAG strategy escalation
    // Phase 87: rolling quality score via exponential moving average
    if (typeof turnData.avgScore === 'number') {
      state.lastAvgScore = turnData.avgScore;
      const alpha = this.#rollingAlpha;
      if (state.rollingAvgScore === null) {
        state.rollingAvgScore = turnData.avgScore;
      } else {
        state.rollingAvgScore = (1 - alpha) * state.rollingAvgScore + alpha * turnData.avgScore;
      }
      state.rollingAvgScore = Math.round(state.rollingAvgScore * 10000) / 10000;
    }

    // Extract entities from message (lightweight — no API call)
    const extracted = this.#extractEntities(turnData.message);
    for (const entity of extracted) {
      if (!state.entities.includes(entity)) {
        state.entities.push(entity);
      }
    }

    // Also extract from response (first 600 chars — key terms may appear beyond first paragraph)
    if (turnData.response) {
      const responseEntities = this.#extractEntities(turnData.response.slice(0, 600));
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
      lastAvgScore: state.lastAvgScore ?? null,
      rollingAvgScore: state.rollingAvgScore ?? null,
    };
  }

  /**
   * Serializes the session context state to a JSON-safe object.
   * Used by contextPersister to write to disk.
   * @param {string} sessionId
   * @returns {{ turns: number, entities: string[], recentTopics: string[], lastQueryType: string|null, contextSummary: string|null, lastActiveAt: number, _version: number }|null}
   */
  serialize(sessionId) {
    if (!this.#active || !sessionId) return null;
    const state = this.#sessions.get(sessionId);
    if (!state) return null;
    return {
      turns:          state.turns,
      entities:       [...state.entities],
      recentTopics:   [...state.recentTopics],
      lastQueryType:  state.lastQueryType,
      contextSummary: state.contextSummary,
      lastActiveAt:   state.lastActiveAt,
      lastAvgScore:   state.lastAvgScore ?? null,
      rollingAvgScore: state.rollingAvgScore ?? null,
      _version:       2,
    };
  }

  /**
   * Restores session context state from a previously serialized object.
   * Used by handleResumeSession to recover context from disk.
   * @param {string} sessionId
   * @param {object} data — output of serialize() or read from file
   * @returns {boolean} true if restored successfully
   */
  restore(sessionId, data) {
    if (!this.#active || !sessionId || !data) return false;

    // Version handling — v1 (migrate), v2 (accept), unknown (reject)
    if (data._version === 1) {
      // Auto-migrate v1→v2: re-extract entities using v2 extractor
      const migrationText = (data.contextSummary || '') + ' ' + (data.entities || []).join(' ');
      const v2Entities = this.#extractEntitiesV2(migrationText);
      const existingEntities = Array.isArray(data.entities) ? data.entities : [];
      const merged = [...existingEntities];
      for (const e of v2Entities) {
        if (!merged.includes(e)) merged.push(e);
      }
      data.entities = merged;
      data._version = 2;
      logger.debug('conversationContext', `migrated context v1→v2 for session ${sessionId.slice(0, 8)}`);
    } else if (data._version !== 2) {
      logger.warn('conversationContext', `unknown context version ${data._version} for session ${sessionId.slice(0, 8)}`);
      return false;
    }

    // Sanitize and rebuild state
    const entities = Array.isArray(data.entities)
      ? data.entities.filter(e => typeof e === 'string').slice(0, this.#maxEntities)
      : [];

    const recentTopics = Array.isArray(data.recentTopics)
      ? data.recentTopics.filter(t => typeof t === 'string').slice(0, 5)
      : [];

    this.#sessions.set(sessionId, {
      turns:          typeof data.turns === 'number' ? data.turns : 0,
      entities,
      recentTopics,
      lastQueryType:  typeof data.lastQueryType === 'string' ? data.lastQueryType : null,
      contextSummary: typeof data.contextSummary === 'string' ? data.contextSummary : null,
      lastActiveAt:   typeof data.lastActiveAt === 'number' ? data.lastActiveAt : Date.now(),
      lastAvgScore:   typeof data.lastAvgScore === 'number' ? data.lastAvgScore : null,
      rollingAvgScore: typeof data.rollingAvgScore === 'number' ? data.rollingAvgScore : null,
    });

    logger.debug('conversationContext', `restored context for session ${sessionId.slice(0, 8)}`, {
      turns: data.turns,
      entities: entities.length,
      topics: recentTopics.length,
    });

    return true;
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

  // ── Turn tracking (Phase 82) ───────────────────────────────

  /**
   * Increments the pipeline execution counter for a session.
   * Independent from recordTurn() — tracks pipeline runs, not context recordings.
   * Creates session state if it doesn't exist yet.
   * @param {string} sessionId
   * @returns {number} — new turn count (1-based)
   */
  incrementTurn(sessionId) {
    if (!sessionId) return 0;
    let state = this.#sessions.get(sessionId);
    if (!state) {
      state = {
        turns: 0,
        entities: [],
        recentTopics: [],
        lastQueryType: null,
        contextSummary: null,
        lastActiveAt: Date.now(),
        lastAvgScore: null,
        rollingAvgScore: null,
        turnCount: 0,
      };
      this.#sessions.set(sessionId, state);
    }
    state.turnCount = (state.turnCount || 0) + 1;
    state.lastActiveAt = Date.now();
    return state.turnCount;
  }

  /**
   * Returns the pipeline execution count for a session.
   * @param {string} sessionId
   * @returns {number} — current turn count (0 if unknown)
   */
  getTurnCount(sessionId) {
    if (!sessionId) return 0;
    const state = this.#sessions.get(sessionId);
    return state?.turnCount || 0;
  }

  // ── Eviction lifecycle (Phase 30) ──────────────────────────

  /**
   * Sets a callback invoked for every evicted session.
   * Wired once during bootstrap to emit EventBus events.
   * @param {Function} fn — (sessionId: string) => void
   */
  setEvictionCallback(fn) {
    if (typeof fn === 'function') this.#onEvict = fn;
  }

  /**
   * Starts the periodic eviction sweep.
   * Idempotent — safe to call multiple times.
   */
  startEviction() {
    // Guard: skip if context inactive or eviction disabled or timer already running
    if (!this.#active || !this.#evictionEnabled || this.#evictionTimer) return;

    this.#evictionTimer = setInterval(() => this.#sweep(), this.#evictionIntervalMs);
    this.#evictionTimer.unref(); // Don't prevent process exit

    logger.info('conversationContext', `eviction started (idle: ${this.#evictionIdleMs}ms, interval: ${this.#evictionIntervalMs}ms)`);
  }

  /**
   * Stops the periodic eviction sweep.
   * Called during graceful shutdown.
   */
  stopEviction() {
    if (this.#evictionTimer) {
      clearInterval(this.#evictionTimer);
      this.#evictionTimer = null;
    }
  }

  /**
   * Sweeps idle sessions from the in-memory Map.
   * Sessions with lastActiveAt older than evictionIdleMs are removed.
   */
  #sweep() {
    const now    = Date.now();
    const cutoff = this.#evictionIdleMs;
    let   swept  = 0;

    for (const [sessionId, state] of this.#sessions) {
      if (now - state.lastActiveAt > cutoff) {
        this.#sessions.delete(sessionId);
        this.#evictionCount++;
        swept++;

        // Notify cleanup coordinator
        if (this.#onEvict) {
          try { this.#onEvict(sessionId); } catch { /* never throw from sweep */ }
        }
      }
    }

    if (swept > 0) {
      logger.info('conversationContext', `evicted ${swept} idle session(s) (total: ${this.#evictionCount})`);
    }
  }

  /**
   * Enhanced entity extraction v2 — no API calls, no external dependencies.
   * Extracts: quoted strings, multi-word Arabic phrases, English terms, Arabic proper nouns.
   * @param {string} text
   * @returns {string[]}
   */
  #extractEntitiesV2(text) {
    if (!text || typeof text !== 'string') return [];
    const entities = [];

    // Strategy 1 — Quoted strings (Arabic quotes «» + English quotes "" + CJK 「」)
    const quotedMatches = text.match(/[""«»「」](.*?)[""«»「」]/g);
    if (quotedMatches) {
      for (const q of quotedMatches) {
        const clean = q.replace(/[""«»「」]/g, '').trim();
        if (clean.length > 1 && clean.length < 60) {
          entities.push(clean);
        }
      }
    }

    // Strategy 2 — Multi-word Arabic phrases (ال + up to 2 following Arabic words)
    const arabicPhrases = text.match(/ال[\u0600-\u06FF]+(\s+[\u0600-\u06FF]{2,}){0,2}/g);
    if (arabicPhrases) {
      const unique = [...new Set(arabicPhrases.map(p => p.trim()))];
      for (const phrase of unique.slice(0, 8)) {
        if (phrase.length > 3 && !entities.includes(phrase)) {
          entities.push(phrase);
        }
      }
    }

    // Strategy 3 — English capitalized terms (3+ chars, filtered stop words)
    const englishStopWords = new Set(['The', 'This', 'That', 'What', 'When', 'Where', 'How', 'Why', 'With', 'From', 'About', 'Into', 'Your', 'Some', 'Most', 'Each', 'Very', 'Also', 'Just']);
    const englishMatches = text.match(/[A-Z][a-zA-Z]{2,}/g);
    if (englishMatches) {
      const unique = [...new Set(englishMatches)];
      let count = 0;
      for (const term of unique) {
        if (count >= 5) break;
        if (!englishStopWords.has(term) && !entities.includes(term)) {
          entities.push(term);
          count++;
        }
      }
    }

    // Strategy 4 — Arabic proper nouns after context words (هو/هي/يسمى/اسمه/تسمى/اسمها)
    const properNounPattern = /(?:هو|هي|يسمى|اسمه|تسمى|اسمها)\s+([\u0600-\u06FF]+(?:\s+[\u0600-\u06FF]+)?)/g;
    let match;
    let properCount = 0;
    while ((match = properNounPattern.exec(text)) !== null && properCount < 3) {
      const name = match[1].trim();
      if (name.length > 2 && name.length < 40 && !entities.includes(name)) {
        entities.push(name);
        properCount++;
      }
    }

    return entities.slice(0, 12);
  }

  /**
   * Entity extraction — delegates to v2 implementation.
   * @param {string} text
   * @returns {string[]}
   */
  #extractEntities(text) {
    return this.#extractEntitiesV2(text);
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
   * @returns {{ enabled: boolean, activeSessions: number, totalTurns: number, maxEntities: number, eviction: object }}
   */
  counts() {
    let totalTurns = 0;
    let totalPipelineExecutions = 0;
    for (const [, state] of this.#sessions) {
      totalTurns += state.turns;
      totalPipelineExecutions += (state.turnCount || 0);
    }
    return {
      enabled:        this.#active,
      activeSessions: this.#sessions.size,
      totalTurns,
      totalPipelineExecutions,
      maxEntities:    this.#maxEntities,
      entityExtractionVersion: 2,
      eviction: {
        enabled:       this.#evictionEnabled,
        idleMs:        this.#evictionIdleMs,
        intervalMs:    this.#evictionIntervalMs,
        totalEvicted:  this.#evictionCount,
        timerActive:   this.#evictionTimer !== null,
      },
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
