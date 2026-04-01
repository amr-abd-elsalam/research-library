// server/services/transcript.js
// ═══════════════════════════════════════════════════════════════
// TranscriptStore — manages conversation message list with
// compact (summarise old turns) and replay capabilities.
// Used by ContextManager to feed trimmed history to Gemini API.
// ═══════════════════════════════════════════════════════════════

import { estimateTokens } from './costTracker.js';

class TranscriptStore {
  /** @type {Array<{role: string, text: string, timestamp: string}>} */
  #entries;
  /** @type {boolean} */
  #flushed;

  /**
   * @param {Array} entries — seed entries (e.g. from JSON restore)
   */
  constructor(entries = []) {
    this.#entries = Array.isArray(entries) ? [...entries] : [];
    this.#flushed = false;
  }

  // ── append ─────────────────────────────────────────────────
  /**
   * Add a message to the transcript.
   * @param {'user'|'assistant'} role
   * @param {string} text
   * @param {object} [metadata] — optional { sources, score, query_type, tokens }
   */
  append(role, text, metadata = {}) {
    const entry = {
      role,
      text,
      timestamp: new Date().toISOString(),
      ...metadata,
    };
    this.#entries.push(entry);
  }

  // ── compact ────────────────────────────────────────────────
  /**
   * Removes older entries beyond keepLast, returning a summary
   * of the removed user questions.
   * @param {number} [keepLast=10]
   * @returns {{ removedCount: number, summary: string } | null}
   */
  compact(keepLast = 10) {
    if (this.#entries.length <= keepLast) return null;

    const removeCount = this.#entries.length - keepLast;
    const removed = this.#entries.splice(0, removeCount);

    // Build summary from removed user questions
    const userQuestions = removed
      .filter(e => e.role === 'user' && e.text)
      .map(e => e.text.slice(0, 80));

    const summary = userQuestions.length > 0
      ? 'المواضيع السابقة: ' + userQuestions.join(' | ')
      : '';

    return { removedCount: removeCount, summary };
  }

  // ── replay ─────────────────────────────────────────────────
  /**
   * Returns a full copy of all entries.
   * @returns {Array<{role: string, text: string, timestamp: string}>}
   */
  replay() {
    return this.#entries.map(e => ({ ...e }));
  }

  // ── replayForAPI ───────────────────────────────────────────
  /**
   * Returns the last maxItems entries formatted for Gemini API.
   * Converts 'assistant' → 'model' (Gemini convention).
   * @param {number} [maxItems=10]
   * @returns {Array<{role: 'user'|'model', text: string}>}
   */
  replayForAPI(maxItems = 10) {
    const slice = this.#entries.slice(-maxItems);
    return slice.map(e => ({
      role: e.role === 'assistant' ? 'model' : e.role,
      text: e.text,
    }));
  }

  // ── estimateTotalTokens ────────────────────────────────────
  /**
   * Estimates total token count across all entries.
   * @returns {number}
   */
  estimateTotalTokens() {
    let total = 0;
    for (const entry of this.#entries) {
      total += estimateTokens(entry.text || '');
    }
    return total;
  }

  // ── Getters ────────────────────────────────────────────────

  /** @returns {number} Number of entries */
  get size() {
    return this.#entries.length;
  }

  /** @returns {Array} Copy of entries (no reference leak) */
  get entries() {
    return this.#entries.map(e => ({ ...e }));
  }

  /** @returns {boolean} Whether flush() was called */
  get flushed() {
    return this.#flushed;
  }

  // ── flush ──────────────────────────────────────────────────
  /** Marks the transcript as flushed (persisted). */
  flush() {
    this.#flushed = true;
  }

  // ── Serialization ──────────────────────────────────────────

  /** @returns {{ entries: Array, flushed: boolean }} */
  toJSON() {
    return {
      entries: this.#entries.map(e => ({ ...e })),
      flushed: this.#flushed,
    };
  }

  /**
   * Reconstruct a TranscriptStore from serialized data.
   * @param {object} data — { entries, flushed }
   * @returns {TranscriptStore}
   */
  static fromJSON(data) {
    const store = new TranscriptStore(data?.entries || []);
    if (data?.flushed) store.flush();
    return store;
  }
}

export { TranscriptStore };
