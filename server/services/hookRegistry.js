// server/services/hookRegistry.js
// ═══════════════════════════════════════════════════════════════
// PipelineHookRegistry — Phase 12, Phase 16 (Logger integration)
// Manages registration and execution of pipeline lifecycle hooks:
//   beforeStage / afterStage  (per-stage or wildcard '*')
//   beforePipeline / afterPipeline (pipeline-level)
// ═══════════════════════════════════════════════════════════════

import { logger } from './logger.js';

class PipelineHookRegistry {
  #hooks = {
    beforeStage:    new Map(),   // Map<stageName|'*', Function[]>
    afterStage:     new Map(),   // Map<stageName|'*', Function[]>
    beforePipeline: [],          // Function[]
    afterPipeline:  [],          // Function[]
  };

  /**
   * Registers a hook on an event.
   *
   * Stage-level events ('beforeStage' | 'afterStage'):
   *   register(event, stageName, fn)  — hook fires only for that stage
   *   register(event, fn)             — shorthand: stageName defaults to '*' (all stages)
   *
   * Pipeline-level events ('beforePipeline' | 'afterPipeline'):
   *   register(event, fn)             — hook fires once per pipeline run
   *
   * @param {'beforeStage'|'afterStage'|'beforePipeline'|'afterPipeline'} event
   * @param {string|Function} stageNameOrFn
   * @param {Function}        [fn]
   */
  register(event, stageNameOrFn, fn) {
    const bucket = this.#hooks[event];
    if (bucket === undefined) {
      throw new Error(`PipelineHookRegistry.register: unknown event '${event}'`);
    }

    // ── Pipeline-level events (array) ──────────────────────
    if (Array.isArray(bucket)) {
      const handler = typeof stageNameOrFn === 'function' ? stageNameOrFn : fn;
      if (typeof handler !== 'function') {
        throw new Error('PipelineHookRegistry.register: handler must be a function');
      }
      bucket.push(handler);
      return;
    }

    // ── Stage-level events (Map) ───────────────────────────
    let stageName;
    let handler;

    if (typeof stageNameOrFn === 'function') {
      // register(event, fn) — wildcard shorthand
      stageName = '*';
      handler   = stageNameOrFn;
    } else {
      stageName = stageNameOrFn;
      handler   = fn;
    }

    if (typeof handler !== 'function') {
      throw new Error('PipelineHookRegistry.register: handler must be a function');
    }

    if (!bucket.has(stageName)) {
      bucket.set(stageName, []);
    }
    bucket.get(stageName).push(handler);
  }

  /**
   * Executes all hooks registered for the given event + stageName.
   *
   * Stage-level: runs wildcard '*' hooks first, then stage-specific hooks.
   * Pipeline-level: runs all hooks in registration order.
   *
   * Each hook is wrapped in try/catch — a failing hook never stops the pipeline.
   *
   * @param {'beforeStage'|'afterStage'|'beforePipeline'|'afterPipeline'} event
   * @param {string|null} stageName — stage function name, or null for pipeline-level
   * @param {PipelineContext} ctx
   * @param {EventTrace} trace
   */
  async run(event, stageName, ctx, trace) {
    const bucket = this.#hooks[event];
    if (bucket === undefined) return;

    // ── Pipeline-level events (array) ──────────────────────
    if (Array.isArray(bucket)) {
      for (const hook of bucket) {
        try {
          await hook(ctx, trace);
        } catch (err) {
          logger.warn('pipelineHooks', `${event} hook error`, { error: err.message });
        }
      }
      return;
    }

    // ── Stage-level events (Map) ───────────────────────────
    // 1. Wildcard '*' hooks first (cross-cutting concerns)
    const wildcardHooks = bucket.get('*');
    if (wildcardHooks) {
      for (const hook of wildcardHooks) {
        try {
          await hook(ctx, trace, stageName);
        } catch (err) {
          logger.warn('pipelineHooks', `${event}(*) hook error`, { error: err.message });
        }
      }
    }

    // 2. Stage-specific hooks
    if (stageName && stageName !== '*') {
      const specificHooks = bucket.get(stageName);
      if (specificHooks) {
        for (const hook of specificHooks) {
          try {
            await hook(ctx, trace, stageName);
          } catch (err) {
            logger.warn('pipelineHooks', `${event}(${stageName}) hook error`, { error: err.message });
          }
        }
      }
    }
  }

  /**
   * Total number of hooks registered across all events.
   * @returns {number}
   */
  get size() {
    let count = 0;

    // Pipeline-level (arrays)
    count += this.#hooks.beforePipeline.length;
    count += this.#hooks.afterPipeline.length;

    // Stage-level (Maps)
    for (const [, fns] of this.#hooks.beforeStage) {
      count += fns.length;
    }
    for (const [, fns] of this.#hooks.afterStage) {
      count += fns.length;
    }

    return count;
  }
}

// ── Singleton instance ─────────────────────────────────────────
const pipelineHooks = new PipelineHookRegistry();

export { PipelineHookRegistry, pipelineHooks };
