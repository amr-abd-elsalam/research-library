// server/services/auditPersister.js
// ═══════════════════════════════════════════════════════════════
// AuditPersister — Phase 35
// JSONL file persistence per session for audit trail entries:
//   - scheduleWrite() with 500ms debounce (batched, unref timer)
//   - flush() — writes all queued entries grouped by sessionId
//   - read() — lazy line-based parsing of session JSONL file
//   - remove() — file deletion on eviction
//   - ensureDir() for bootstrap
//   - stop() clears pending timer
//   - counts() for inspect endpoint
//
// Config: AUDIT.enabled + AUDIT.persistAudit (both must be true)
//         AUDIT.auditDir (default './data/audit')
// Zero overhead when disabled (persistAudit: false, default).
//
// Pattern inspired by ContextPersister (Phase 31) + FeedbackCollector (Phase 33).
// ═══════════════════════════════════════════════════════════════

import { appendFile, mkdir, readFile, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import config from '../../config.js';
import { logger } from './logger.js';

class AuditPersister {
  #enabled;
  #auditDir;
  /** @type {Array<{ sessionId: string, entry: object }>} */
  #writeQueue;
  #flushTimer;
  #totalWrites;

  constructor() {
    const cfg = config.AUDIT ?? {};
    this.#enabled     = cfg.enabled !== false && cfg.persistAudit === true;
    this.#auditDir    = cfg.auditDir || './data/audit';
    this.#writeQueue  = [];
    this.#flushTimer  = null;
    this.#totalWrites = 0;
  }

  /** Whether persistence is active (both AUDIT.enabled and AUDIT.persistAudit must be true). */
  get enabled() {
    return this.#enabled;
  }

  /**
   * Ensures the audit directory exists.
   * Called once during bootstrap — before any listener writes.
   */
  async ensureDir() {
    if (!this.#enabled) return;
    try {
      await mkdir(this.#auditDir, { recursive: true });
      logger.info('auditPersister', `audit directory ready: ${this.#auditDir}`);
    } catch (err) {
      logger.warn('auditPersister', 'ensureDir failed', { error: err.message });
    }
  }

  /**
   * Schedules a debounced write for an audit entry.
   * Buffers entries and flushes after 500ms of inactivity.
   * @param {string} sessionId
   * @param {object} entry — audit trail entry (type, timestamp, etc.)
   */
  scheduleWrite(sessionId, entry) {
    if (!this.#enabled || !sessionId) return;

    this.#writeQueue.push({ sessionId, entry });

    // Debounce: clear existing timer, set new 500ms timer
    if (this.#flushTimer) {
      clearTimeout(this.#flushTimer);
    }
    this.#flushTimer = setTimeout(() => {
      this.#flushTimer = null;
      this.flush().catch((err) => {
        logger.warn('auditPersister', 'scheduled flush failed', { error: err.message });
      });
    }, 500);
    this.#flushTimer.unref();
  }

  /**
   * Flushes all queued entries to disk.
   * Groups entries by sessionId and appends to per-session JSONL files.
   */
  async flush() {
    if (!this.#enabled || this.#writeQueue.length === 0) return;

    // Splice entire queue
    const batch = this.#writeQueue.splice(0);

    // Group by sessionId
    const grouped = new Map();
    for (const { sessionId, entry } of batch) {
      if (!grouped.has(sessionId)) {
        grouped.set(sessionId, []);
      }
      grouped.get(sessionId).push(entry);
    }

    // Write each session's entries
    for (const [sessionId, entries] of grouped) {
      try {
        const lines = entries.map(e => JSON.stringify(e)).join('\n') + '\n';
        const filePath = `${this.#auditDir}/${sessionId}.jsonl`;
        await appendFile(filePath, lines, 'utf-8');
        this.#totalWrites += entries.length;
      } catch (err) {
        logger.warn('auditPersister', 'write failed', { sessionId: sessionId.slice(0, 8), error: err.message });
      }
    }
  }

  /**
   * Reads persisted audit entries for a session.
   * Parses the last `limit` lines from the JSONL file.
   * @param {string} sessionId
   * @param {number} [limit=100]
   * @returns {Promise<Array<object>>}
   */
  async read(sessionId, limit = 100) {
    if (!this.#enabled || !sessionId) return [];

    const filePath = `${this.#auditDir}/${sessionId}.jsonl`;
    if (!existsSync(filePath)) return [];

    try {
      const raw = await readFile(filePath, 'utf-8');
      const lines = raw.split('\n').filter(line => line.trim() !== '');

      // Take last `limit` lines
      const subset = lines.slice(-limit);
      const entries = [];
      for (const line of subset) {
        try {
          entries.push(JSON.parse(line));
        } catch {
          // Skip corrupt lines
        }
      }
      return entries;
    } catch (err) {
      logger.warn('auditPersister', 'read failed', { sessionId: sessionId.slice(0, 8), error: err.message });
      return [];
    }
  }

  /**
   * Removes the persisted audit JSONL file for a session.
   * @param {string} sessionId
   * @returns {Promise<void>}
   */
  async remove(sessionId) {
    if (!this.#enabled || !sessionId) return;

    const filePath = `${this.#auditDir}/${sessionId}.jsonl`;
    try {
      if (existsSync(filePath)) {
        await unlink(filePath);
        logger.debug('auditPersister', `removed audit file for session ${sessionId.slice(0, 8)}`);
      }
    } catch (err) {
      logger.warn('auditPersister', 'remove failed', { sessionId: sessionId.slice(0, 8), error: err.message });
    }
  }

  /**
   * Summary for inspect endpoint.
   * @returns {{ enabled: boolean, auditDir: string, queueSize: number, totalWrites: number }}
   */
  counts() {
    return {
      enabled:     this.#enabled,
      auditDir:    this.#auditDir,
      queueSize:   this.#writeQueue.length,
      totalWrites: this.#totalWrites,
    };
  }

  /**
   * Stops the debounce timer. Called during graceful shutdown.
   */
  stop() {
    if (this.#flushTimer) {
      clearTimeout(this.#flushTimer);
      this.#flushTimer = null;
    }
  }
}

// ── Singleton instance ─────────────────────────────────────────
const auditPersister = new AuditPersister();

export { AuditPersister, auditPersister };
