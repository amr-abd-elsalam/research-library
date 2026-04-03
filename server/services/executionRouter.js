// server/services/executionRouter.js
// ═══════════════════════════════════════════════════════════════
// ExecutionRouter — Phase 24
// Unified pre-pipeline routing — resolves a user message to an
// execution action before any SSE/pipeline setup.
// Replaces the sequential if/else chain in chat.js with a single
// resolve() call that returns { action, data }.
// Zero state — pure routing logic using existing singletons.
// ═══════════════════════════════════════════════════════════════

import { matchCommand }           from './commands.js';
import { commandRegistry }        from './commandRegistry.js';
import { queryIntentClassifier }  from './queryIntentClassifier.js';
import { sessionBudget }          from './sessionBudget.js';
import { cache }                  from './cache.js';
import { eventBus }               from './eventBus.js';
import { logger }                 from './logger.js';

class ExecutionRouter {

  /**
   * Resolves a user message to an execution action.
   * Order matches the existing chat.js flow exactly:
   *   1. Explicit command (starts with /)
   *   2. Intent classification → NL command
   *   3. Cache lookup
   *   4. Session budget check
   *   5. Default: pipeline
   *
   * @param {string} message — raw user message
   * @param {{ topicFilter: string|null, history: Array, sessionId: string|null }} context
   * @returns {{ action: string, data: object }}
   */
  resolve(message, context) {
    const t0 = Date.now();
    const { topicFilter, history, sessionId, permissionContext } = context;

    // ── 1. Explicit command check (/ملخص, /مصادر, etc.) ────
    const parsed = matchCommand(message)
      ? commandRegistry.parseMessage(message)
      : null;

    if (parsed?.command) {
      // Permission check — if denied, fall through to next checks (NOT error)
      if (permissionContext && !permissionContext.allowsCommand(parsed.command.name)) {
        logger.debug('executionRouter', `command '${parsed.command.name}' denied for tier '${permissionContext.tier}'`);
        this.#emitRouted('permission_denied', t0, sessionId);
        // Fall through — don't return. Message will go to cache/budget/pipeline checks
      } else {
        this.#emitRouted('command', t0, sessionId);
        return {
          action: 'command',
          data:   { command: parsed.command, parsed },
        };
      }
    }

    // ── 2. Intent classification (NL commands — Phase 21) ───
    const queryIntent = queryIntentClassifier.classify(message, history);

    if (
      queryIntent.intent === 'command' &&
      queryIntent.confidence < 1.0 &&
      queryIntent.commandMatch?.command
    ) {
      // Permission check — if denied, fall through
      if (permissionContext && !permissionContext.allowsCommand(queryIntent.commandMatch.command.name)) {
        logger.debug('executionRouter', `NL command '${queryIntent.commandMatch.command.name}' denied for tier '${permissionContext.tier}'`);
        this.#emitRouted('permission_denied', t0, sessionId);
        // Fall through to cache/budget/pipeline
      } else {
        this.#emitRouted('nl_command', t0, sessionId);
        return {
          action: 'nl_command',
          data:   { command: queryIntent.commandMatch.command, intent: queryIntent },
        };
      }
    }

    // ── 3. Cache lookup ─────────────────────────────────────
    const cacheKey = `chat:${topicFilter ?? 'all'}:${message.trim().toLowerCase()}`;
    const cached   = cache.get(cacheKey);

    if (cached) {
      this.#emitRouted('cache_hit', t0, sessionId);
      return {
        action: 'cache_hit',
        data:   { cached, cacheKey },
      };
    }

    // ── 4. Session budget check ─────────────────────────────
    if (sessionId) {
      const budgetCheck = sessionBudget.check(sessionId);
      if (budgetCheck.exceeded) {
        this.#emitRouted('budget_exceeded', t0, sessionId);
        return {
          action: 'budget_exceeded',
          data:   { budgetCheck },
        };
      }
    }

    // ── 5. Topic restriction check (Phase 26) ───────────────
    if (permissionContext && topicFilter && !permissionContext.allowsTopic(topicFilter)) {
      this.#emitRouted('topic_denied', t0, sessionId);
      return {
        action: 'topic_denied',
        data:   { topicFilter, tier: permissionContext.tier },
      };
    }

    // ── 6. Default: pipeline execution ──────────────────────
    this.#emitRouted('pipeline', t0, sessionId);
    return {
      action: 'pipeline',
      data:   { cacheKey, queryIntent },
    };
  }

  /**
   * Emits routing decision event for observability.
   * @param {string} action — resolved action name
   * @param {number} t0 — start timestamp
   * @param {string|null} [sessionId=null] — session ID for audit trail tracking
   */
  #emitRouted(action, t0, sessionId = null) {
    eventBus.emit('execution:routed', {
      action,
      sessionId,
      latencyMs: Date.now() - t0,
      timestamp: Date.now(),
    });
  }

  /**
   * Summary for inspect endpoint.
   * @returns {{ available: true }}
   */
  counts() {
    return { available: true };
  }
}

// ── Singleton instance ─────────────────────────────────────────
const executionRouter = new ExecutionRouter();

export { ExecutionRouter, executionRouter };
