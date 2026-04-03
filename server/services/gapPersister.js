// server/services/gapPersister.js
// ═══════════════════════════════════════════════════════════════
// GapPersister — Phase 39 (Singleton #24)
// JSONL file persistence for content gap entries:
//   - scheduleWrite() with 500ms debounce (batched, unref timer)
//   - flush() — writes all queued entries to single JSONL file
//   - read() — lazy line-based parsing of gaps JSONL file
//   - ensureDir() for bootstrap
//   - stop() clears pending timer
//   - counts() for inspect endpoint
//
// Config: CONTENT_GAPS.enabled + CONTENT_GAPS.persistGaps (both must be true)
//         CONTENT_GAPS.gapDir (default './data/gaps')
// Zero overhead when disabled (persistGaps: false, default).
//
// Unlike AuditPersister (per-session files), GapPersister uses a single
// file (gaps.jsonl) because gap data is analytics data — not per-session.
// No remove() method — gap data survives session eviction.
// ═══════════════════════════════════════════════════════════════

import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import config from '../../config.js';
import { logger } from './logger.js';

class GapPersister {
  #enabled;
  #filePath;
  /** @type {Array<object>} */
  #pending;
  #timer;
  #writeCount;

  constructor() {
    const cfg = config.CONTENT_GAPS ?? {};
    this.#enabled    = cfg.enabled === true && cfg.persistGaps === true;
    const dir        = cfg.gapDir || './data/gaps';
    this.#filePath   = join(dir, 'gaps.jsonl');
    this.#pending    = [];
    this.#timer      = null;
    this.#writeCount = 0;
  }

  /** Whether persistence is active (both CONTENT_GAPS.enabled and persistGaps must be true). */
  get enabled() {
    return this.#enabled;
  }

  /**
   * Ensures the gap directory exists.
   * Called once during bootstrap — before any listener writes.
   */
  async ensureDir() {
    if (!this.#enabled) return;
    try {
      const dir = dirname(this.#filePath);
      await mkdir(dir, { recursive: true });
      logger.info('gapPersister', `gap directory ready: ${dir}`);
    } catch (err) {
      logger.warn('gapPersister', 'ensureDir failed', { error: err.message });
    }
  }

  /**
   * Schedules a debounced write for a gap entry.
   * Buffers entries and flushes after 500ms of inactivity.
   * @param {object} entry — gap entry (message, reason, sessionId, avgScore, timestamp)
   */
  scheduleWrite(entry) {
    if (!this.#enabled || !entry) return;

    this.#pending.push(entry);

    // Debounce: clear existing timer, set new 500ms timer
    if (this.#timer) {
      clearTimeout(this.#timer);
    }
    this.#timer = setTimeout(() => {
      this.#timer = null;
      this.#writeBatch().catch((err) => {
        logger.warn('gapPersister', 'scheduled flush failed', { error: err.message });
      });
    }, 500);
    this.#timer.unref();
  }

  /**
   * Flushes all queued entries to disk.
   * Called during graceful shutdown to ensure no data loss.
   */
  async flush() {
    if (!this.#enabled || this.#pending.length === 0) return;

    // Clear debounce timer
    if (this.#timer) {
      clearTimeout(this.#timer);
      this.#timer = null;
    }

    await this.#writeBatch();
  }

  /**
   * Reads all persisted gap entries from the JSONL file.
   * Parses line-by-line, skips corrupt lines.
   * @returns {Promise<Array<object>>}
   */
  async read() {
    if (!this.#enabled) return [];

    if (!existsSync(this.#filePath)) return [];

    try {
      const raw = await readFile(this.#filePath, 'utf-8');
      const lines = raw.split('\n').filter(line => line.trim() !== '');

      const entries = [];
      for (const line of lines) {
        try {
          entries.push(JSON.parse(line));
        } catch {
          // Skip corrupt lines
        }
      }
      return entries;
    } catch (err) {
      logger.warn('gapPersister', 'read failed', { error: err.message });
      return [];
    }
  }

  /**
   * Summary for inspect endpoint.
   * @returns {{ enabled: boolean, filePath: string, pending: number, writeCount: number }}
   */
  counts() {
    return {
      enabled:    this.#enabled,
      filePath:   this.#filePath,
      pending:    this.#pending.length,
      writeCount: this.#writeCount,
    };
  }

  /**
   * Stops the debounce timer. Called during graceful shutdown.
   */
  stop() {
    if (this.#timer) {
      clearTimeout(this.#timer);
      this.#timer = null;
    }
  }

  // ── Private: write pending entries to file ───────────────────
  async #writeBatch() {
    if (this.#pending.length === 0) return;

    // Splice entire queue
    const batch = this.#pending.splice(0);

    try {
      const lines = batch.map(e => JSON.stringify(e)).join('\n') + '\n';
      await appendFile(this.#filePath, lines, 'utf-8');
      this.#writeCount += batch.length;
    } catch (err) {
      // Re-queue failed entries at the front
      this.#pending.unshift(...batch);
      logger.warn('gapPersister', 'write failed — entries re-queued', { error: err.message, count: batch.length });
    }
  }
}

// ── Singleton instance ─────────────────────────────────────────
const gapPersister = new GapPersister();

export { GapPersister, gapPersister };
