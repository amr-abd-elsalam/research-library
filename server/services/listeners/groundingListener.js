// server/services/listeners/groundingListener.js
// ═══════════════════════════════════════════════════════════════
// Grounding Listener — Phase 70 (Listener #21)
// Subscribes to pipeline:complete → feeds GroundingAnalytics + records metrics.
// Only processes events where grounding was actually checked.
// ═══════════════════════════════════════════════════════════════

import { eventBus } from '../eventBus.js';
import { groundingAnalytics } from '../groundingAnalytics.js';
import { metrics } from '../metrics.js';
import config from '../../../config.js';

export function register() {
  eventBus.on('pipeline:complete', (data) => {
    // Only process when grounding was actually checked (not skipped)
    if (data._groundingSkipped) return;

    const score = data._groundingScore;
    if (score === null || score === undefined) return;

    // Feed to analytics singleton
    groundingAnalytics.record({
      correlationId: data.correlationId,
      score,
      timestamp: Date.now(),
      libraryId: data._libraryId || null,
    });

    // Record metrics
    metrics.increment('grounding_check_total');
    metrics.observe('grounding_score', score);

    const minScore = config.GROUNDING?.minGroundingScore ?? 0.4;
    if (score < minScore) {
      metrics.increment('grounding_low_total');
    }
  });
}
