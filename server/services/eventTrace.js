// server/services/eventTrace.js
// ═══════════════════════════════════════════════════════════════
// EventTrace — records pipeline stage execution with timing,
// status, optional detail, correlation IDs, and nested spans.
// ═══════════════════════════════════════════════════════════════

import crypto from 'node:crypto';

class EventTrace {
  #stages;
  #startTime;
  #correlationId;
  #parentId;
  #childSpans;

  /**
   * @param {string|null} [parentId=null] — parent trace correlationId (for nested spans)
   */
  constructor(parentId = null) {
    this.#stages        = [];
    this.#startTime     = Date.now();
    this.#correlationId = crypto.randomUUID().slice(0, 8);
    this.#parentId      = parentId;
    this.#childSpans    = [];
  }

  /** @returns {string} 8-char hex correlation ID */
  get correlationId() { return this.#correlationId; }

  /** @returns {string|null} parent trace's correlationId, or null if root */
  get parentId() { return this.#parentId; }

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
      timestamp:     Date.now(),
      correlationId: this.#correlationId,
    });
  }

  /**
   * Creates a child span for nested tracing.
   * @param {string} name — span name (descriptive label)
   * @returns {EventTrace} child trace linked to this trace
   */
  span(name) {
    const child = new EventTrace(this.#correlationId);
    this.#childSpans.push({ name, child });
    return child;
  }

  /**
   * Returns a JSON-safe snapshot of the trace.
   * @returns {{ correlationId: string, parentId: string|null, totalMs: number, stages: Array, childSpans?: Array }}
   */
  toJSON() {
    const result = {
      correlationId: this.#correlationId,
      parentId:      this.#parentId,
      totalMs:       Date.now() - this.#startTime,
      stages:        this.#stages.map(s => ({ ...s })),
    };
    if (this.#childSpans.length > 0) {
      result.childSpans = this.#childSpans.map(cs => ({
        name:  cs.name,
        trace: cs.child.toJSON(),
      }));
    }
    return result;
  }

  /**
   * Returns a compact single-line summary for log files.
   * Format: "stageRouteQuery:ok:2ms|stageEmbed:ok:145ms|..."
   * ⚠️ Unchanged from Phase 11 — analytics JSONL backward compatible
   * @returns {string}
   */
  toCompact() {
    return this.#stages
      .map(s => `${s.name}:${s.status}:${s.durationMs}ms`)
      .join('|');
  }
}

export { EventTrace };
