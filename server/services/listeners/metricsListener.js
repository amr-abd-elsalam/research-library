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

    // Intent classification (Phase 21)
    if (data._queryIntent) {
      metrics.increment('intent_classification_total', {
        intent:    data._queryIntent.intent || 'search',
        matchType: data._queryIntent.commandMatch?.matchType || 'none',
      });
    }

    // Response mode distribution (Phase 25)
    if (data._responseMode) {
      metrics.increment('response_mode_total', { mode: data._responseMode });
    }

    // Rewrite method distribution (Phase 28)
    if (data._rewriteMethod) {
      metrics.increment('rewrite_method_total', { method: data._rewriteMethod });
    }

    // Rewrite pattern distribution (Phase 32)
    if (data._rewriteMethod === 'local_context' && data._rewriteResult?.pattern) {
      metrics.increment('rewrite_pattern_total', { pattern: data._rewriteResult.pattern });
    }

    // Enriched prompt tracking (Phase 37)
    if (data._promptEnriched) {
      metrics.increment('enriched_prompt_total');
    }

    // Content gap tracking (Phase 38)
    if (data.aborted && data.abortReason === 'low_confidence') {
      metrics.increment('content_gap_total', { reason: 'low_confidence' });
    } else if (!data.aborted && typeof data.avgScore === 'number' && data.avgScore < 0.45) {
      metrics.increment('content_gap_total', { reason: 'low_score' });
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

    // Retry tracking (Phase 18) — stage ran more than once
    if (data.attempt && data.attempt > 1) {
      metrics.increment('stage_retries_total', { stage: data.stageName });
    }
  });

  // ── Cache hit (cached responses that skip the pipeline) ────
  eventBus.on('pipeline:cacheHit', () => {
    metrics.increment('requests_total', { type: 'cache_hit' });
    metrics.increment('cache_hits_total');
  });

  // ── Permission denial tracking (Phase 26) ─────────────────
  eventBus.on('execution:routed', (data) => {
    if (data.action === 'permission_denied') {
      metrics.increment('permission_denied_total', { reason: 'command' });
    } else if (data.action === 'topic_denied') {
      metrics.increment('permission_denied_total', { reason: 'topic' });
    }
  });

  // ── Cache invalidation tracking (Phase 41) ────────────────
  eventBus.on('library:changed', (_data) => {
    metrics.increment('cache_invalidation_total');
  });

  // ── Admin action tracking (Phase 43) ──────────────────────
  eventBus.on('admin:action', (data) => {
    metrics.increment('admin_action_total', {
      action:  data.action,
      success: String(data.result?.success ?? true),
    });
  });
}

export { register };
