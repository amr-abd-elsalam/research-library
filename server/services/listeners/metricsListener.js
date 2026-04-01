// server/services/listeners/metricsListener.js
// ═══════════════════════════════════════════════════════════════
// Metrics Listener — Phase 14
// Listens to pipeline events on EventBus and records metrics
// on the in-memory MetricsCollector.
// ═══════════════════════════════════════════════════════════════

import { eventBus } from '../eventBus.js';
import { metrics }  from '../metrics.js';

function register() {

  // ── Pipeline complete (normal requests) ────────────────────
  eventBus.on('pipeline:complete', (data) => {
    metrics.increment('requests_total', { type: 'pipeline' });

    if (typeof data.totalMs === 'number') {
      metrics.observe('request_duration_ms', data.totalMs);
    }

    if (data.queryType) {
      metrics.increment('query_type_total', { type: data.queryType });
    }

    if (data.aborted) {
      metrics.increment('aborted_total', { reason: data.abortReason || 'unknown' });
    }
  });

  // ── Stage complete (per-stage timing) ──────────────────────
  eventBus.on('pipeline:stageComplete', (data) => {
    if (typeof data.durationMs === 'number') {
      metrics.observe('stage_duration_ms', data.durationMs, { stage: data.stageName });
    }

    if (data.status === 'error') {
      metrics.increment('stage_errors_total', { stage: data.stageName });
    }
  });

  // ── Cache hit (cached responses that skip the pipeline) ────
  eventBus.on('pipeline:cacheHit', () => {
    metrics.increment('requests_total', { type: 'cache_hit' });
    metrics.increment('cache_hits_total');
  });
}

export { register };
