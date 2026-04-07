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
   * @param {string|null} [requestId=null] — optional HTTP request ID (Phase 67)
   */
  record(event, module, detail = null, correlationId = null, requestId = null) {
    if (!this.#enabled) return;

    const entry = {
      timestamp: new Date().toISOString(),
      event,
      module,
    };
    if (detail !== null && detail !== undefined) entry.detail = detail;
    if (correlationId) entry.correlationId = correlationId;
    entry.requestId = requestId || null;

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
   * Returns all entries as a JSON-safe array for persistence.
   * Same as all() — oldest-first order.
   * @returns {Array<object>}
   */
  dump() {
    return this.all();
  }

  /**
   * Restores entries from a previously saved dump.
   * Respects maxEntries limit — keeps newest if overflow.
   * @param {Array<object>} entries — output of a previous dump() call
   */
  restore(entries) {
    if (!Array.isArray(entries)) return;
    for (const entry of entries) {
      if (!entry || typeof entry !== 'object') continue;
      this.#entries.push(entry);
      if (this.#entries.length > this.#maxEntries) {
        this.#entries.shift();
      }
    }
  }

  /**
   * Filters entries by criteria. All criteria are optional — AND logic.
   * Returns matching entries sorted newest-first (same order as recent()).
   * @param {{ requestId?: string, level?: string, module?: string, from?: number, to?: number }} criteria
   * @param {number} [limit=100]
   * @returns {Array<object>}
   */
  filterBy(criteria = {}, limit = 100) {
    const { requestId, level, module, from, to } = criteria;
    let results = this.#entries;

    if (requestId) results = results.filter(e => e.requestId === requestId);
    if (level)     results = results.filter(e => e.event === `log:${level}` || (e.event && e.event.includes(level)));
    if (module)    results = results.filter(e => e.module === module);
    if (from)      results = results.filter(e => new Date(e.timestamp).getTime() >= from);
    if (to)        results = results.filter(e => new Date(e.timestamp).getTime() <= to);

    const safeLimit = Math.max(1, Math.min(limit, results.length));
    const start = results.length - safeLimit;
    return results.slice(start).reverse();
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
