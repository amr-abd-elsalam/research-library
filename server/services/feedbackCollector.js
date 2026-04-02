// server/services/feedbackCollector.js
// ═══════════════════════════════════════════════════════════════
// FeedbackCollector — Phase 33
// Manages user feedback on search quality:
//   - submit() with JSONL persistence (append-only)
//   - In-memory ring buffer for admin recent reads
//   - Positive/negative counters
//   - ensureDir() for bootstrap
//   - Emits feedback:submitted event via EventBus
// Zero overhead when disabled (FEEDBACK.enabled: false, default).
// ═══════════════════════════════════════════════════════════════

import { appendFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import config from '../../config.js';
import { logger } from './logger.js';
import { eventBus } from './eventBus.js';

class FeedbackCollector {
  #enabled;
  #allowComments;
  #maxCommentLength;
  #filePath;
  #buffer;
  #maxBuffer;
  #positiveCount;
  #negativeCount;

  constructor() {
    const cfg = config.FEEDBACK ?? {};
    this.#enabled          = cfg.enabled === true;
    this.#allowComments    = cfg.allowComments !== false;
    this.#maxCommentLength = cfg.maxCommentLength ?? 200;
    this.#filePath         = './data/feedback.jsonl';
    this.#buffer           = [];
    this.#maxBuffer        = 200;
    this.#positiveCount    = 0;
    this.#negativeCount    = 0;
  }

  /** Whether feedback collection is active. */
  get enabled() {
    return this.#enabled;
  }

  /**
   * Ensures the ./data/ directory exists.
   * Called once during bootstrap — before any listener writes.
   */
  async ensureDir() {
    if (!this.#enabled) return;
    try {
      const dir = './data';
      if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true });
      }
      logger.info('feedbackCollector', 'data directory ready');
    } catch (err) {
      logger.warn('feedbackCollector', 'ensureDir failed', { error: err.message });
    }
  }

  /**
   * Submits a feedback entry.
   * @param {{ correlationId: string, sessionId?: string, rating: string, comment?: string }} params
   * @returns {boolean} true if submitted, false if invalid or disabled
   */
  async submit({ correlationId, sessionId, rating, comment }) {
    if (!this.#enabled) return false;

    // Validate required fields
    if (!correlationId || typeof correlationId !== 'string') return false;
    if (rating !== 'positive' && rating !== 'negative') return false;

    // Sanitize comment
    let sanitizedComment = null;
    if (this.#allowComments && comment) {
      sanitizedComment = String(comment).slice(0, this.#maxCommentLength);
    }

    // Build entry
    const entry = {
      correlationId,
      sessionId: sessionId || null,
      rating,
      comment: sanitizedComment,
      timestamp: new Date().toISOString(),
    };

    // Update counters
    if (rating === 'positive') {
      this.#positiveCount++;
    } else {
      this.#negativeCount++;
    }

    // Ring buffer
    this.#buffer.push(entry);
    if (this.#buffer.length > this.#maxBuffer) {
      this.#buffer.shift();
    }

    // JSONL persist (fire-and-forget)
    try {
      await appendFile(this.#filePath, JSON.stringify(entry) + '\n', 'utf-8');
    } catch (err) {
      logger.warn('feedbackCollector', 'JSONL write failed', { error: err.message });
    }

    // Emit event
    eventBus.emit('feedback:submitted', entry);

    return true;
  }

  /**
   * Returns recent feedback entries from the ring buffer.
   * @param {number} [limit=20]
   * @returns {Array<object>}
   */
  recent(limit = 20) {
    return this.#buffer.slice(-limit);
  }

  /**
   * Summary for inspect endpoint.
   * @returns {{ enabled: boolean, totalPositive: number, totalNegative: number, recentCount: number }}
   */
  counts() {
    return {
      enabled:       this.#enabled,
      totalPositive: this.#positiveCount,
      totalNegative: this.#negativeCount,
      recentCount:   this.#buffer.length,
    };
  }
}

// ── Singleton instance ─────────────────────────────────────────
const feedbackCollector = new FeedbackCollector();

export { FeedbackCollector, feedbackCollector };
