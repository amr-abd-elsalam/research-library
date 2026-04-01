// server/services/operationalLog.js
// ═══════════════════════════════════════════════════════════════
// OperationalLog — Phase 16
// In-memory ring buffer for operational events (pipeline decisions,
// cache hits, hook executions, errors). Read by /api/admin/log.
// Fed by logListener (EventBus events) + Logger listener (warn/error).
// Zero dependencies — standalone module.
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';

class OperationalLog {
  #entries = [];
  #maxEntries;

  constructor() {
    this.#maxEntries = config.LOGGING?.maxEntries ?? 500;
  }

  // ── Guard: skip if operational log disabled ──────────────────
  get #enabled() {
    return config.LOGGING?.operationalLog !== false;
  }

  // ── Record an operational event ──────────────────────────────
  /**
   * Adds an event to the ring buffer.
   * @param {string} event — event name (e.g. 'pipeline:complete', 'log:warn')
   * @param {string} module — source module
   * @param {object|null} [detail=null] — optional structured detail
   * @param {string|null} [correlationId=null] — optional request correlation ID
   */
  record(event, module, detail = null, correlationId = null) {
    if (!this.#enabled) return;

    const entry = {
      timestamp: new Date().toISOString(),
      event,
      module,
    };
    if (detail !== null && detail !== undefined) entry.detail = detail;
    if (correlationId) entry.correlationId = correlationId;

    this.#entries.push(entry);

    // Ring buffer — remove oldest when exceeding max
    if (this.#entries.length > this.#maxEntries) {
      this.#entries.shift();
    }
  }

  // ── Read recent entries ──────────────────────────────────────
  /**
   * Returns the last N entries, newest first.
   * @param {number} [limit=100]
   * @returns {Array<object>}
   */
  recent(limit = 100) {
    const safeLimit = Math.max(1, Math.min(limit, this.#entries.length));
    const start = this.#entries.length - safeLimit;
    return this.#entries.slice(start).reverse();
  }

  /**
   * Returns all entries, oldest first.
   * @returns {Array<object>}
   */
  all() {
    return [...this.#entries];
  }

  /** @returns {number} Current number of entries */
  get size() {
    return this.#entries.length;
  }

  /**
   * Clears all entries. Intended for testing only.
   */
  reset() {
    this.#entries = [];
  }
}

// ── Singleton instance ─────────────────────────────────────────
const operationalLog = new OperationalLog();

export { OperationalLog, operationalLog };
