// server/services/sessionMetadataIndex.js
// ═══════════════════════════════════════════════════════════════
// SessionMetadataIndex — Phase 91 (Singleton #45)
// In-memory index for session metadata. Eliminates O(n) disk
// reads in handleListUserSessions() by maintaining a Map of
// session metadata that is:
//   1. Warmed up at bootstrap (scan session directory once)
//   2. Updated incrementally via EventBus (pipeline:complete,
//      pipeline:cacheHit, session:evicted)
//   3. Queried by handleListUserSessions() in O(1)
// Feature-gated: config.SESSION_INDEX.enabled + config.SESSIONS.enabled.
// Backward compatible: when disabled, handler falls back to
// original O(n) disk implementation.
// ═══════════════════════════════════════════════════════════════

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import config from '../../config.js';
import { logger } from './logger.js';

class SessionMetadataIndex {
  /** @type {Map<string, object>} */
  #index = new Map();
  #enabled;
  #maxCached;
  #refreshOnStartup;
  #firstMessageMaxLen;
  #perUserIsolation;
  #warmedUp = false;

  constructor() {
    const cfg = config.SESSION_INDEX ?? {};
    this.#enabled            = cfg.enabled !== false;    // default true
    this.#maxCached          = Math.max(cfg.maxCachedSessions ?? 1000, 10);
    this.#refreshOnStartup   = cfg.refreshOnStartup !== false;
    this.#firstMessageMaxLen = Math.max(cfg.firstMessageMaxLen ?? 50, 10);
    this.#perUserIsolation   = cfg.perUserIsolation !== false;  // Phase 92: default true (secure by default)
  }

  get enabled()    { return this.#enabled && config.SESSIONS?.enabled === true; }
  get isWarmedUp() { return this.#warmedUp; }

  /**
   * Scans session directory once at bootstrap.
   * Populates the in-memory index with metadata from each session file.
   * Session files are stored in date-folder structure: data/sessions/YYYY-MM-DD/{uuid}.json
   * @param {string} sessionDir — path to session directory (e.g. './data/sessions')
   */
  async warmUp(sessionDir) {
    if (!this.enabled || !this.#refreshOnStartup) {
      this.#warmedUp = true; // mark as ready even if skipped — so list() works for incremental updates
      return { loaded: 0, skipped: 0 };
    }

    try {
      const topEntries = await readdir(sessionDir).catch(() => []);
      let loaded = 0;
      let skipped = 0;

      for (const entry of topEntries) {
        // Session files are in date-folder structure: YYYY-MM-DD/{uuid}.json
        if (/^\d{4}-\d{2}-\d{2}$/.test(entry)) {
          // Date folder — scan contents
          const dateDirPath = join(sessionDir, entry);
          let files;
          try {
            files = await readdir(dateDirPath);
          } catch {
            continue; // can't read date folder — skip
          }

          for (const file of files) {
            if (!file.endsWith('.json') || file.endsWith('.tmp')) continue;

            try {
              const raw = await readFile(join(dateDirPath, file), 'utf-8');
              const data = JSON.parse(raw);

              if (!data.session_id) { skipped++; continue; }

              // Extract first user message
              let firstMessage = null;
              if (Array.isArray(data.messages)) {
                const firstUser = data.messages.find(m => m.role === 'user');
                if (firstUser && firstUser.text) {
                  firstMessage = firstUser.text.length > this.#firstMessageMaxLen
                    ? firstUser.text.slice(0, this.#firstMessageMaxLen) + '…'
                    : firstUser.text;
                }
              }

              this.#index.set(data.session_id, {
                session_id:    data.session_id,
                created_at:    data.created_at || null,
                last_active:   data.last_active || data.created_at || null,
                message_count: data.messages?.length || 0,
                topic_filter:  data.topic_filter || null,
                first_message: firstMessage,
                ip_hash:       data.ip_hash || null,
              });

              loaded++;
            } catch (err) {
              skipped++;
              logger.warn('sessionMetadataIndex', `skipped corrupt session file: ${entry}/${file}`, { error: err.message });
            }
          }
        } else if (entry.endsWith('.json') && !entry.endsWith('.tmp')) {
          // Legacy: session file directly in root (unlikely but defensive)
          try {
            const raw = await readFile(join(sessionDir, entry), 'utf-8');
            const data = JSON.parse(raw);

            if (!data.session_id) { skipped++; continue; }

            let firstMessage = null;
            if (Array.isArray(data.messages)) {
              const firstUser = data.messages.find(m => m.role === 'user');
              if (firstUser && firstUser.text) {
                firstMessage = firstUser.text.length > this.#firstMessageMaxLen
                  ? firstUser.text.slice(0, this.#firstMessageMaxLen) + '…'
                  : firstUser.text;
              }
            }

            this.#index.set(data.session_id, {
              session_id:    data.session_id,
              created_at:    data.created_at || null,
              last_active:   data.last_active || data.created_at || null,
              message_count: data.messages?.length || 0,
              topic_filter:  data.topic_filter || null,
              first_message: firstMessage,
              ip_hash:       data.ip_hash || null,
            });

            loaded++;
          } catch (err) {
            skipped++;
            logger.warn('sessionMetadataIndex', `skipped corrupt session file: ${entry}`, { error: err.message });
          }
        }
      }

      // Enforce max
      this.#enforceMax();

      this.#warmedUp = true;
      logger.info('sessionMetadataIndex', `warm-up complete: ${loaded} sessions indexed, ${skipped} skipped`);

      return { loaded, skipped };
    } catch (err) {
      // readdir failed — mark as not warmed up, fallback will be used
      logger.error('sessionMetadataIndex', 'warm-up failed — fallback to disk reads', { error: err.message });
      this.#warmedUp = false;
      return { loaded: 0, skipped: 0 };
    }
  }

  /**
   * Incremental update — called by EventBus listener.
   * @param {string} sessionId
   * @param {{ last_active?: number|string, message_count_delta?: number, first_message?: string, topic_filter?: string, created_at?: string, ip_hash?: string }} metadata
   */
  upsert(sessionId, metadata) {
    if (!this.enabled || !sessionId) return;

    const existing = this.#index.get(sessionId);

    if (existing) {
      // Update existing entry
      if (metadata.last_active !== undefined) {
        existing.last_active = typeof metadata.last_active === 'number'
          ? new Date(metadata.last_active).toISOString()
          : metadata.last_active;
      }
      if (typeof metadata.message_count_delta === 'number') {
        existing.message_count = (existing.message_count || 0) + metadata.message_count_delta;
      }
      // first_message: only set if not already set (preserve original)
      if (metadata.first_message && !existing.first_message) {
        existing.first_message = metadata.first_message.length > this.#firstMessageMaxLen
          ? metadata.first_message.slice(0, this.#firstMessageMaxLen) + '…'
          : metadata.first_message;
      }
      if (metadata.topic_filter !== undefined) {
        existing.topic_filter = metadata.topic_filter;
      }
    } else {
      // New entry
      const now = new Date().toISOString();
      this.#index.set(sessionId, {
        session_id:    sessionId,
        created_at:    metadata.created_at || now,
        last_active:   metadata.last_active
          ? (typeof metadata.last_active === 'number' ? new Date(metadata.last_active).toISOString() : metadata.last_active)
          : now,
        message_count: metadata.message_count_delta || 0,
        topic_filter:  metadata.topic_filter || null,
        first_message: metadata.first_message
          ? (metadata.first_message.length > this.#firstMessageMaxLen
              ? metadata.first_message.slice(0, this.#firstMessageMaxLen) + '…'
              : metadata.first_message)
          : null,
        ip_hash:       metadata.ip_hash || null,
      });

      // Enforce max after adding new entry
      this.#enforceMax();
    }
  }

  /**
   * Removes a session from the index.
   * @param {string} sessionId
   */
  remove(sessionId) {
    if (!sessionId) return;
    this.#index.delete(sessionId);
  }

  /**
   * Returns sorted session list (by last_active DESC).
   * Replaces O(n) disk reads in handleListUserSessions().
   * Phase 92: supports ipHash filtering for per-user isolation.
   * @param {{ limit?: number, ipHash?: string|null }} options
   * @returns {Array<object>}
   */
  list({ limit = 50, ipHash = null } = {}) {
    let entries = [...this.#index.values()];

    // Phase 92: Per-user isolation — filter by ip_hash when enabled
    if (this.#perUserIsolation && ipHash) {
      entries = entries.filter(e => e.ip_hash === ipHash);
    }

    // Sort by last_active DESC (most recent first)
    entries.sort((a, b) => {
      const tA = a.last_active ? new Date(a.last_active).getTime() : 0;
      const tB = b.last_active ? new Date(b.last_active).getTime() : 0;
      return tB - tA;
    });

    return entries.slice(0, Math.max(limit, 1));
  }

  /**
   * Summary for inspect endpoint.
   * @returns {{ enabled: boolean, warmedUp: boolean, cachedSessions: number, maxCached: number, firstMessageMaxLen: number, perUserIsolation: boolean }}
   */
  counts() {
    return {
      enabled:            this.enabled,
      warmedUp:           this.#warmedUp,
      cachedSessions:     this.#index.size,
      maxCached:          this.#maxCached,
      firstMessageMaxLen: this.#firstMessageMaxLen,
      perUserIsolation:   this.#perUserIsolation,
    };
  }

  /**
   * Resets all state. For test isolation.
   */
  reset() {
    this.#index.clear();
    this.#warmedUp = false;
  }

  // ── Private ───────────────────────────────────────────────

  /**
   * Enforces maxCachedSessions by removing oldest entries.
   */
  #enforceMax() {
    if (this.#index.size <= this.#maxCached) return;

    const entries = [...this.#index.entries()];
    entries.sort((a, b) => {
      const tA = a[1].last_active ? new Date(a[1].last_active).getTime() : 0;
      const tB = b[1].last_active ? new Date(b[1].last_active).getTime() : 0;
      return tA - tB; // oldest first
    });

    const toRemove = entries.slice(0, entries.length - this.#maxCached);
    for (const [key] of toRemove) {
      this.#index.delete(key);
    }
  }
}

// ── Singleton instance ─────────────────────────────────────────
const sessionMetadataIndex = new SessionMetadataIndex();

export { SessionMetadataIndex, sessionMetadataIndex };
