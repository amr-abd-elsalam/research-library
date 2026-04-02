// server/services/listeners/sessionStatsListener.js
// ═══════════════════════════════════════════════════════════════
// Session Stats Listener — Phase 19
// Listens to pipeline:complete and pipeline:cacheHit events —
// records cumulative token usage in SessionBudgetTracker and
// session-level metrics in MetricsCollector.
// Separate from sessionListener (which handles appendMessage).
// ═══════════════════════════════════════════════════════════════

import { eventBus }       from '../eventBus.js';
import { metrics }        from '../metrics.js';
import { sessionBudget }  from '../sessionBudget.js';

export function register() {

  // ── pipeline:complete — budget tracking + metrics ──────────
  eventBus.on('pipeline:complete', (data) => {
    // Record budget (only if session is tracked and tokens are available)
    if (data.sessionId && data._tokenEstimates) {
      const cost = data._analytics?.estimated_cost || 0;
      sessionBudget.record(data.sessionId, data._tokenEstimates, cost);
    }

    // Record session-level metrics
    if (data.sessionId) {
      metrics.increment('session_messages_total', { role: 'pipeline' });
    }
  });

  // ── pipeline:cacheHit — metrics only (no budget cost) ─────
  eventBus.on('pipeline:cacheHit', (data) => {
    if (data.sessionId) {
      metrics.increment('session_messages_total', { role: 'cache_hit' });
    }
  });
}
