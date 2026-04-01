// server/services/listeners/analyticsListener.js
// ═══════════════════════════════════════════════════════════════
// Analytics Listener — Phase 13
// Listens to pipeline events on EventBus and logs analytics.
// Replaces the explicit logEvent() calls in chat.js postPipeline()
// and streamCachedResponse().
// ═══════════════════════════════════════════════════════════════

import { eventBus } from '../eventBus.js';
import { logEvent } from '../analytics.js';
import config       from '../../../config.js';

function register() {

  // ── Pipeline complete (normal requests) ────────────────────
  eventBus.on('pipeline:complete', (data) => {
    if (!data._analytics) return;

    const analyticsEntry = { ...data._analytics };

    // Append compact trace if configured
    if (config.PIPELINE?.traceInAnalytics && data._traceCompact) {
      analyticsEntry.trace = data._traceCompact;
    }

    logEvent(analyticsEntry).catch(() => {});
  });

  // ── Cache hit (cached responses that skip the pipeline) ────
  eventBus.on('pipeline:cacheHit', (data) => {
    if (!data._analytics) return;

    logEvent(data._analytics).catch(() => {});
  });
}

export { register };
