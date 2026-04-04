// server/services/correlationIndex.js
// ═══════════════════════════════════════════════════════════════
// CorrelationIndex — Phase 34
// In-memory ring buffer that maps correlationId → request metadata.
// Enables O(1) lookup to enrich feedback entries with the original
// question and response, and supports per-session queries.
//
// Config: AUDIT.enabled (default true), AUDIT.maxCorrelationEntries (500)
// Zero overhead when disabled.
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';
import { logger } from './logger.js';

class CorrelationIndex {
  #entries;
  #order;
  #maxSize;
  #enabled;

  constructor() {
    this.#entries = new Map();
    this.#order   = [];
    this.#maxSize = config.AUDIT?.maxCorrelationEntries ?? 500;
    this.#enabled = config.AUDIT?.enabled !== false;

    if (this.#enabled) {
      logger.info('correlationIndex', `initialized (maxSize: ${this.#maxSize})`);
    }
  }

  /** Whether the index is active. */
  get enabled() {
    return this.#enabled;
  }

  /**
   * Records a correlation entry.
   * @param {string} correlationId
   * @param {object} entry — { message, fullText, sessionId, queryType, avgScore, topicFilter, timestamp, cacheKey, aborted, responseMode }
   */
  record(correlationId, entry) {
    if (!this.#enabled || !correlationId) return;

    this.#entries.set(correlationId, {
      ...entry,
      timestamp: entry.timestamp ?? Date.now(),
    });

    this.#order.push(correlationId);

    // Enforce max size — evict oldest
    while (this.#order.length > this.#maxSize) {
      const oldest = this.#order.shift();
      this.#entries.delete(oldest);
    }
  }

  /**
   * Retrieves a correlation entry by ID.
   * @param {string} correlationId
   * @returns {object|null}
   */
  get(correlationId) {
    if (!this.#enabled) return null;
    return this.#entries.get(correlationId) || null;
  }

  /**
   * Retrieves all entries for a given session.
   * @param {string} sessionId
   * @param {number} [limit=50]
   * @returns {Array<{ correlationId: string, ...entry }>}
   */
  bySession(sessionId, limit = 50) {
    if (!this.#enabled || !sessionId) return [];

    const results = [];
    for (const [correlationId, entry] of this.#entries) {
      if (entry.sessionId === sessionId) {
        results.push({ correlationId, ...entry });
      }
    }

    // Sort by timestamp ascending
    results.sort((a, b) => a.timestamp - b.timestamp);

    return results.slice(0, limit);
  }

  /**
   * Resets all in-memory state. For testing only.
   */
  reset() {
    this.#entries.clear();
    this.#order.length = 0;
  }

  /**
   * Summary for inspect endpoint.
   * @returns {{ enabled: boolean, size: number, maxSize: number }}
   */
  counts() {
    return {
      enabled: this.#enabled,
      size:    this.#entries.size,
      maxSize: this.#maxSize,
    };
  }
}

// ── Singleton instance ─────────────────────────────────────────
const correlationIndex = new CorrelationIndex();

export { CorrelationIndex, correlationIndex };
