// server/services/listeners/circuitListener.js
// ═══════════════════════════════════════════════════════════════
// Circuit Breaker Listener — Phase 18
// Listens to circuit:stateChange events — records in OperationalLog
// and increments metrics. Provides admin visibility on service
// reliability without requiring server log access.
// ═══════════════════════════════════════════════════════════════

import { eventBus }       from '../eventBus.js';
import { operationalLog } from '../operationalLog.js';
import { metrics }        from '../metrics.js';

export function register() {
  eventBus.on('circuit:stateChange', (data) => {
    // Record in operational log for admin dashboard
    operationalLog.record('circuit:stateChange', data.name, {
      from: data.from,
      to:   data.to,
    });

    // Note: circuit_state_changes_total counter is already incremented
    // inside CircuitBreaker.#transition() — no need to duplicate here.
    // This listener focuses on OperationalLog recording.
  });
}
