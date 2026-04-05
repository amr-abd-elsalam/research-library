// server/services/listeners/contentGapListener.js
// ═══════════════════════════════════════════════════════════════
// Content Gap Listener — Phase 38 (Listener #17)
// Listens to pipeline:complete (low confidence / low score)
// and feedback:submitted (negative) to record content gap events.
// Zero overhead when disabled (CONTENT_GAPS.enabled: false).
// ═══════════════════════════════════════════════════════════════

import { eventBus }           from '../eventBus.js';
import { contentGapDetector } from '../contentGapDetector.js';
import { correlationIndex }   from '../correlationIndex.js';

export function register() {
  // Guard: if gap detection is disabled, skip registration entirely
  if (!contentGapDetector.enabled) return;

  // ── pipeline:complete — detect low confidence / low score ──
  eventBus.on('pipeline:complete', (data) => {
    // Case 1: pipeline aborted due to low confidence
    if (data.aborted && data.abortReason === 'low_confidence') {
      contentGapDetector.record({
        message:   data.message,
        reason:    'low_confidence',
        sessionId: data.sessionId || null,
        avgScore:  data.avgScore,
        libraryId: data._libraryId || null,
      });
      return;
    }

    // Case 2: pipeline completed but avgScore is below threshold
    if (!data.aborted && typeof data.avgScore === 'number' &&
        data.avgScore < contentGapDetector.lowScoreThreshold) {
      contentGapDetector.record({
        message:   data.message,
        reason:    'low_score',
        sessionId: data.sessionId || null,
        avgScore:  data.avgScore,
        libraryId: data._libraryId || null,
      });
    }
  });

  // ── feedback:submitted — detect negative feedback ──────────
  eventBus.on('feedback:submitted', (data) => {
    if (data.rating !== 'negative') return;

    // Look up the original question via correlation index
    const corr = correlationIndex.get(data.correlationId);
    if (!corr || !corr.message) return;

    contentGapDetector.record({
      message:   corr.message,
      reason:    'negative_feedback',
      sessionId: data.sessionId || corr.sessionId || null,
      avgScore:  corr.avgScore ?? null,
      libraryId: corr.libraryId || null,
    });
  });
}
