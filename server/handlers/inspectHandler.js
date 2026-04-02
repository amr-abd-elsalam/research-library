// server/handlers/inspectHandler.js
// ═══════════════════════════════════════════════════════════════
// GET /api/admin/inspect — Phase 17
// System introspection: returns a complete snapshot of all
// registered commands, hooks, listeners, plugins, metrics,
// logger, and operational log state.
// Protected by admin auth. Read-only — no mutations.
// ═══════════════════════════════════════════════════════════════

import { commandRegistry }  from '../services/commandRegistry.js';
import { pipelineHooks }    from '../services/hookRegistry.js';
import { eventBus }         from '../services/eventBus.js';
import { pluginRegistry }   from '../services/pluginRegistry.js';
import { metrics }          from '../services/metrics.js';
import { logger }           from '../services/logger.js';
import { operationalLog }   from '../services/operationalLog.js';
import { bootstrap }        from '../bootstrap.js';
import { allCircuitStats }  from '../services/circuitBreaker.js';
import { sessionBudget }    from '../services/sessionBudget.js';
import { queryIntentClassifier } from '../services/queryIntentClassifier.js';
import { pipelineAnalytics }     from '../services/pipelineAnalytics.js';
import { metricsPersister }      from '../services/metricsPersister.js';
import config               from '../../config.js';

export async function handleInspect(_req, res) {
  try {
    const payload = {
      timestamp: new Date().toISOString(),

      // ── Config overview ────────────────────────────────────
      config: {
        sections:        Object.keys(config).length,
        sectionNames:    Object.keys(config),
        pipelineHooks:   config.PIPELINE?.enableHooks !== false,
        metricsEnabled:  config.PIPELINE?.metricsEnabled !== false,
        pluginsEnabled:  config.PLUGINS?.enabled === true,
        sessionsEnabled: config.SESSIONS?.enabled === true,
        logLevel:        config.LOGGING?.level ?? 'info',
      },

      // ── Registered commands ────────────────────────────────
      commands: {
        total: commandRegistry.size,
        list:  commandRegistry.list(),
        graph: commandRegistry.graph(),
      },

      // ── Pipeline hooks breakdown ───────────────────────────
      hooks: pipelineHooks.inspect(),

      // ── EventBus listener wiring ───────────────────────────
      eventBus: {
        totalListeners: eventBus.size,
        byEvent:        eventBus.listenerCounts(),
      },

      // ── Plugin registry ────────────────────────────────────
      plugins: {
        enabled:     config.PLUGINS?.enabled === true,
        total:       pluginRegistry.size,
        initialized: pluginRegistry.initialized,
        list:        pluginRegistry.list(),
      },

      // ── Metrics collector ──────────────────────────────────
      metrics: metrics.counts(),

      // ── Logger status ──────────────────────────────────────
      logger: {
        level:         config.LOGGING?.level ?? 'info',
        listenerCount: logger.listenerCount,
      },

      // ── Operational log status ─────────────────────────────
      operationalLog: {
        size:       operationalLog.size,
        maxEntries: config.LOGGING?.maxEntries ?? 500,
      },

      // ── Bootstrap readiness ────────────────────────────────
      bootstrap: bootstrap.getReadinessPayload(),

      // ── Circuit breakers (Phase 18) ────────────────────────
      circuits: allCircuitStats(),

      // ── Session budget (Phase 19) ──────────────────────────
      sessionBudget: sessionBudget.counts(),

      // ── Intent classifier (Phase 21) ───────────────────────
      intentClassifier: queryIntentClassifier.counts(),

      // ── Pipeline analytics (Phase 22) ──────────────────────
      pipelineAnalytics: pipelineAnalytics.counts(),

      // ── Metrics persistence (Phase 23) ─────────────────────
      metricsPersister: metricsPersister.counts(),
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload));

  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'حدث خطأ في فحص النظام',
      code:  'INSPECT_ERROR',
    }));
  }
}
