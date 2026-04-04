// server/services/logger.js
// ═══════════════════════════════════════════════════════════════
// Logger — Phase 16
// Structured logging with 4 levels (debug/info/warn/error),
// module tagging, correlation ID tracking, and listener support.
// Console output formatted for readability (not JSON).
// Zero dependencies — standalone module.
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };

class Logger {
  #level;
  #listeners = [];

  constructor() {
    const configLevel = config.LOGGING?.level ?? 'info';
    this.#level = LEVELS[configLevel] ?? LEVELS.info;
  }

  // ── Level check ──────────────────────────────────────────────
  #shouldLog(level) {
    return (LEVELS[level] ?? 0) >= this.#level;
  }

  // ── Core emit ────────────────────────────────────────────────
  #emit(level, module, message, detail = null, correlationId = null) {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      module,
      message,
    };
    if (detail !== null && detail !== undefined) entry.detail = detail;
    if (correlationId) entry.correlationId = correlationId;

    // Console output (only if level meets threshold)
    if (this.#shouldLog(level)) {
      const prefix = `[${module}]`;
      const detailStr = detail !== null && detail !== undefined
        ? typeof detail === 'string' ? detail : JSON.stringify(detail)
        : '';

      switch (level) {
        case 'error': console.error(prefix, message, detailStr); break;
        case 'warn':  console.warn(prefix, message, detailStr);  break;
        case 'debug': console.debug(prefix, message, detailStr); break;
        default:      console.log(prefix, message, detailStr);   break;
      }
    }

    // Notify all listeners (regardless of level — listeners decide what to keep)
    for (const fn of this.#listeners) {
      try {
        fn(entry);
      } catch {
        // Never throw from logger — swallow listener errors silently
      }
    }
  }

  // ── Public API ───────────────────────────────────────────────

  /**
   * Log at debug level.
   * @param {string} module — source module name (e.g. 'pipeline', 'bootstrap')
   * @param {string} message — human-readable message
   * @param {object|string|null} [detail] — optional structured detail
   * @param {string|null} [correlationId] — optional request correlation ID
   */
  debug(module, message, detail, correlationId) {
    this.#emit('debug', module, message, detail ?? null, correlationId ?? null);
  }

  /**
   * Log at info level.
   */
  info(module, message, detail, correlationId) {
    this.#emit('info', module, message, detail ?? null, correlationId ?? null);
  }

  /**
   * Log at warn level.
   */
  warn(module, message, detail, correlationId) {
    this.#emit('warn', module, message, detail ?? null, correlationId ?? null);
  }

  /**
   * Log at error level.
   */
  error(module, message, detail, correlationId) {
    this.#emit('error', module, message, detail ?? null, correlationId ?? null);
  }

  // ── Listener management ──────────────────────────────────────

  /**
   * Register a listener that receives every log entry (regardless of level).
   * Used by OperationalLog to capture warn/error entries.
   * @param {Function} fn — (entry) => void
   */
  addListener(fn) {
    if (typeof fn === 'function') {
      this.#listeners.push(fn);
    }
  }

  /**
   * Number of registered listeners.
   * @returns {number}
   */
  get listenerCount() {
    return this.#listeners.length;
  }

  /**
   * Clears all registered listeners. Intended for testing only.
   */
  reset() {
    this.#listeners.length = 0;
  }
}

// ── Singleton instance ─────────────────────────────────────────
const logger = new Logger();

export { Logger, logger };
