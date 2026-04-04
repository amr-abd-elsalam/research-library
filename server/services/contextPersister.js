// server/services/contextPersister.js
// ═══════════════════════════════════════════════════════════════
// ContextPersister — Phase 31
// Manages file I/O for ConversationContext state:
//   - Debounced writes (2000ms, unref timer) after each recordTurn()
//   - Lazy reads on session resume
//   - File deletion on eviction
//   - Directory management (ensureDir)
// Zero overhead when disabled (persistContext: false, default).
// ═══════════════════════════════════════════════════════════════

import { readFile, unlink, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { atomicWriteFile } from './atomicWrite.js';
import config from '../../config.js';
import { logger } from './logger.js';

class ContextPersister {
  #dir;
  #enabled;
  /** @type {Map<string, ReturnType<typeof setTimeout>>} */
  #writeQueue = new Map();
  #debounceMs = 2000;

  constructor() {
    const ctx = config.CONTEXT ?? {};
    this.#dir = ctx.contextDir || './data/context';
    this.#enabled = ctx.persistContext === true && ctx.intelligentCompaction !== false;
  }

  /** Whether persistence is active. */
  get enabled() {
    return this.#enabled;
  }

  /**
   * Ensures the context directory exists.
   * Called once during bootstrap — before any listener writes.
   */
  async ensureDir() {
    if (!this.#enabled) return;
    try {
      await mkdir(this.#dir, { recursive: true });
      logger.info('contextPersister', `directory ready: ${this.#dir}`);
    } catch (err) {
      logger.warn('contextPersister', 'ensureDir failed', { error: err.message });
    }
  }

  /**
   * Schedules a debounced write for a session's context data.
   * Cancels any pending write for the same session.
   * The timer is unref'd — won't prevent process exit.
   * @param {string} sessionId
   * @param {object} data — JSON-safe object from conversationContext.serialize()
   */
  scheduleWrite(sessionId, data) {
    if (!this.#enabled || !sessionId || !data) return;

    // Cancel existing pending write for this session
    const existing = this.#writeQueue.get(sessionId);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(async () => {
      this.#writeQueue.delete(sessionId);
      try {
        const filePath = join(this.#dir, `${sessionId}.json`);
        await atomicWriteFile(filePath, JSON.stringify(data));
        logger.debug('contextPersister', `wrote context for session ${sessionId.slice(0, 8)}`);
      } catch (err) {
        logger.warn('contextPersister', 'write failed', { sessionId: sessionId.slice(0, 8), error: err.message });
      }
    }, this.#debounceMs);

    timer.unref();
    this.#writeQueue.set(sessionId, timer);
  }

  /**
   * Reads persisted context data for a session.
   * Returns parsed JSON or null (file missing or corrupt).
   * @param {string} sessionId
   * @returns {Promise<object|null>}
   */
  async read(sessionId) {
    if (!this.#enabled || !sessionId) return null;

    try {
      const filePath = join(this.#dir, `${sessionId}.json`);
      const raw = await readFile(filePath, 'utf-8');
      return JSON.parse(raw);
    } catch (err) {
      if (err.code !== 'ENOENT') {
        logger.warn('contextPersister', 'read failed', { sessionId: sessionId.slice(0, 8), error: err.message });
      }
      return null;
    }
  }

  /**
   * Removes the persisted context file for a session.
   * Also cancels any pending write.
   * Errors are silent (file may not exist).
   * @param {string} sessionId
   * @returns {Promise<void>}
   */
  async remove(sessionId) {
    if (!this.#enabled || !sessionId) return;

    // Cancel any pending write
    const existing = this.#writeQueue.get(sessionId);
    if (existing) {
      clearTimeout(existing);
      this.#writeQueue.delete(sessionId);
    }

    try {
      const filePath = join(this.#dir, `${sessionId}.json`);
      await unlink(filePath);
      logger.debug('contextPersister', `removed context file for session ${sessionId.slice(0, 8)}`);
    } catch {
      // Silent — file may not exist
    }
  }

  /**
   * Summary for inspect endpoint.
   * @returns {{ enabled: boolean, dir: string, pendingWrites: number }}
   */
  counts() {
    return {
      enabled:       this.#enabled,
      dir:           this.#dir,
      pendingWrites: this.#writeQueue.size,
    };
  }
}

// ── Singleton instance ─────────────────────────────────────────
const contextPersister = new ContextPersister();

export { ContextPersister, contextPersister };
