// server/services/listeners/commandListener.js
// ═══════════════════════════════════════════════════════════════
// Command Listener — Phase 15
// Listens to command:complete events on EventBus and records
// analytics + metrics. Unifies command observability with the
// pipeline's existing EventBus-driven pattern.
// ═══════════════════════════════════════════════════════════════

import { eventBus } from '../eventBus.js';
import { logEvent } from '../analytics.js';
import { metrics }  from '../metrics.js';

function register() {

  // ── Command complete ───────────────────────────────────────
  eventBus.on('command:complete', (data) => {
    // Analytics — fire-and-forget, same pattern as analyticsListener
    if (data._analytics) {
      logEvent(data._analytics).catch(() => {});
    }

    // Metrics — synchronous in-memory
    metrics.increment('command_execution_total', {
      command: data.commandName || 'unknown',
    });

    if (typeof data.latencyMs === 'number') {
      metrics.observe('command_duration_ms', data.latencyMs);
    }
  });
}

export { register };
