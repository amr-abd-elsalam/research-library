// server/services/listeners/refinementListener.js
// ═══════════════════════════════════════════════════════════════
// Refinement Listener — Phase 78 (Listener #24)
// Subscribes to answer:refined → records answer_refinement_total
// and answer_refinement_improved metrics in MetricsCollector.
// Zero overhead when ANSWER_REFINEMENT disabled (no events emitted).
// ═══════════════════════════════════════════════════════════════

import { eventBus } from '../eventBus.js';
import { metrics } from '../metrics.js';

/**
 * Handles answer:refined events — records metrics.
 * @param {object|null} data — event payload
 */
export function refinementHandler(data) {
  if (!data) return;
  metrics.increment('answer_refinement_total');
  if (data.improved) {
    metrics.increment('answer_refinement_improved');
  }
}

export function register() {
  eventBus.on('answer:refined', refinementHandler);
}
