// server/services/listeners/strategyAnalyticsListener.js
// ═══════════════════════════════════════════════════════════════
// Strategy Analytics Listener — Phase 87 (Listener #26)
// Listens on pipeline:complete → feeds StrategyAnalytics.
// Extracts strategy selection data from pipeline events.
// Zero overhead when RAG_STRATEGIES not active.
// ═══════════════════════════════════════════════════════════════

import { eventBus } from '../eventBus.js';
import { strategyAnalytics } from '../strategyAnalytics.js';

/**
 * Handles pipeline:complete events — records strategy selection data.
 * @param {object|null} data — event payload
 */
export function strategyAnalyticsHandler(data) {
  if (!data) return;

  strategyAnalytics.record({
    correlationId: data.correlationId || null,
    sessionId:     data.sessionId || null,
    strategy:      data._selectedStrategy ?? null,
    complexityType: data._complexityType ?? null,
    avgScore:      data.avgScore ?? 0,
    turnNumber:    data._turnNumber ?? 0,
    isFollowUp:    data._rewriteResult?.wasRewritten === true,
    skipped:       data._strategySkipped ?? true,
    timestamp:     Date.now(),
  });
}

export function register() {
  eventBus.on('pipeline:complete', strategyAnalyticsHandler);
}
