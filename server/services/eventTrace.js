// server/services/eventTrace.js
// ═══════════════════════════════════════════════════════════════
// EventTrace — records pipeline stage execution with timing,
// status, and optional detail for diagnostics & analytics.
// ═══════════════════════════════════════════════════════════════

class EventTrace {
  #stages;
  #startTime;

  constructor() {
    this.#stages    = [];
    this.#startTime = Date.now();
  }

  /**
   * Record a stage execution.
   * @param {string} name       — stage function name (e.g. 'stageEmbed')
   * @param {number} durationMs — how long the stage took in ms
   * @param {'ok'|'skip'|'error'} status — outcome
   * @param {object|null} [detail=null] — extra stage-specific info
   */
  record(name, durationMs, status, detail = null) {
    this.#stages.push({
      name,
      durationMs,
      status,
      detail,
      timestamp: Date.now(),
    });
  }

  /**
   * Returns a JSON-safe snapshot of the trace.
   * @returns {{ totalMs: number, stages: Array<{ name: string, durationMs: number, status: string, detail: object|null, timestamp: number }> }}
   */
  toJSON() {
    return {
      totalMs: Date.now() - this.#startTime,
      stages:  this.#stages.map(s => ({ ...s })),
    };
  }

  /**
   * Returns a compact single-line summary for log files.
   * Format: "stageRouteQuery:ok:2ms|stageEmbed:ok:145ms|..."
   * @returns {string}
   */
  toCompact() {
    return this.#stages
      .map(s => `${s.name}:${s.status}:${s.durationMs}ms`)
      .join('|');
  }
}

export { EventTrace };
