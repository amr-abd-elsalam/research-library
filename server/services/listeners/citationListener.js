// server/services/listeners/citationListener.js
// ═══════════════════════════════════════════════════════════════
// Citation Listener — Phase 71 (Listener #22)
// Subscribes to pipeline:complete → records citation metrics.
// Only processes events where citations were generated.
// ═══════════════════════════════════════════════════════════════

import { eventBus } from '../eventBus.js';
import { metrics } from '../metrics.js';

export function register() {
  eventBus.on('pipeline:complete', (data) => {
    // Only process when citation mapping was performed (not skipped)
    if (data._citationSkipped) return;

    const citations = data._citations;
    if (!citations || !Array.isArray(citations)) return;

    // Record metrics
    metrics.increment('citation_mapped_total');
    metrics.observe('citation_count', citations.length);
  });
}
