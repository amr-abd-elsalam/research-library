// server/services/listeners/qualityListener.js
// ═══════════════════════════════════════════════════════════════
// Quality Listener — Phase 40 (Listener #18)
// Listens to pipeline:complete + feedback:submitted → feeds
// SessionQualityScorer with per-session quality signals.
//
// Config: QUALITY.enabled (default false)
// Zero overhead when disabled — register() returns immediately.
// ═══════════════════════════════════════════════════════════════

import { eventBus } from '../eventBus.js';
import { sessionQualityScorer } from '../sessionQualityScorer.js';

export function register() {
  if (!sessionQualityScorer.enabled) return;

  // pipeline:complete → record query quality signals
  eventBus.on('pipeline:complete', (data) => {
    if (!data.sessionId) return;
    sessionQualityScorer.recordQuery(data.sessionId, {
      avgScore:      data.avgScore,
      aborted:       data.aborted,
      rewriteMethod: data._rewriteMethod,
    });
  });

  // feedback:submitted → record feedback signal
  eventBus.on('feedback:submitted', (data) => {
    if (!data.sessionId) return;
    sessionQualityScorer.recordFeedback(data.sessionId, {
      rating: data.rating,
    });
  });
}
