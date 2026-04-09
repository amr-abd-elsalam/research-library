// server/services/listeners/refinementListener.js
// ═══════════════════════════════════════════════════════════════
// Refinement Listener — Phase 78, updated Phase 87 (Listener #24)
// Subscribes to answer:refined → records answer_refinement_total
// and answer_refinement_improved metrics in MetricsCollector.
// Subscribes to pipeline:complete → feeds RefinementAnalytics
// when _refinementApplied is true (Phase 87).
// Zero overhead when ANSWER_REFINEMENT disabled (no events emitted).
// ═══════════════════════════════════════════════════════════════

import { eventBus } from '../eventBus.js';
import { metrics } from '../metrics.js';
import { refinementAnalytics } from '../refinementAnalytics.js';

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

/**
 * Handles pipeline:complete events — feeds RefinementAnalytics.
 * Only records when _refinementApplied is true (Phase 87).
 * @param {object|null} data — event payload
 */
export function refinementAnalyticsHandler(data) {
  if (!data) return;
  if (data._refinementApplied !== true) return;

  refinementAnalytics.record({
    correlationId: data.correlationId || null,
    sessionId:     data.sessionId || null,
    originalScore: data._refinementOriginalScore ?? 0,
    finalScore:    data._refinementFinalScore ?? 0,
    attempts:      data._refinementAttempts ?? 0,
    improved:      data._refinementImproved === true,
    responseMode:  data._responseMode || 'unknown',
    strategy:      data._selectedStrategy ?? null,
    avgScore:      data.avgScore ?? 0,
    timestamp:     Date.now(),
  });
}

export function register() {
  eventBus.on('answer:refined', refinementHandler);
  eventBus.on('pipeline:complete', refinementAnalyticsHandler);
}
