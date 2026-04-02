// server/services/listeners/routingListener.js
// ═══════════════════════════════════════════════════════════════
// Routing Listener — Phase 24
// Records execution routing decisions in OperationalLog + Metrics.
// Provides admin visibility on routing distribution
// (pipeline vs command vs cache vs budget_exceeded).
// ═══════════════════════════════════════════════════════════════

import { eventBus }        from '../eventBus.js';
import { operationalLog }  from '../operationalLog.js';
import { metrics }         from '../metrics.js';

export function register() {
  eventBus.on('execution:routed', (data) => {
    // Record in operational log
    operationalLog.record('execution:routed', 'executionRouter', {
      action:    data.action,
      latencyMs: data.latencyMs,
    });

    // Record routing distribution metric
    metrics.increment('execution_routed_total', { action: data.action });
  });
}
