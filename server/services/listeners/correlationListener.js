// server/services/listeners/correlationListener.js
// ═══════════════════════════════════════════════════════════════
// Correlation Listener — Phase 34 (Listener #15)
// Listens to pipeline:complete + pipeline:cacheHit → records
// request metadata in CorrelationIndex for O(1) lookup by
// correlationId.
//
// Phase 36: Extended to listen to pipeline:cacheHit — cache hits
// now have synthetic correlationId (was null before Phase 36).
// ═══════════════════════════════════════════════════════════════

import { eventBus }         from '../eventBus.js';
import { correlationIndex } from '../correlationIndex.js';

export function register() {
  // pipeline:complete → record pipeline request correlation
  eventBus.on('pipeline:complete', (data) => {
    if (!data.correlationId) return;

    correlationIndex.record(data.correlationId, {
      message:      data.message,
      fullText:     (data.fullText || '').slice(0, 500),
      sessionId:    data.sessionId || null,
      queryType:    data.queryType || null,
      avgScore:     data.avgScore ?? 0,
      topicFilter:  data.topicFilter || null,
      timestamp:    Date.now(),
      cacheKey:     data._cacheKey || null,
      aborted:      data.aborted || false,
      responseMode: data._responseMode || 'stream',
      libraryId:    data._libraryId || null,
      requestId:    data._requestId || null,
    });
  });

  // pipeline:cacheHit → record cache hit correlation (Phase 36)
  eventBus.on('pipeline:cacheHit', (data) => {
    if (!data.correlationId) return; // backward compat — old cache hits without ID

    correlationIndex.record(data.correlationId, {
      message:      data.message,
      fullText:     (data.fullText || '').slice(0, 500),
      sessionId:    data.sessionId || null,
      queryType:    null,
      avgScore:     data.avgScore ?? 0,
      topicFilter:  data.topicFilter || null,
      timestamp:    Date.now(),
      cacheKey:     null,
      aborted:      false,
      responseMode: null,
      cacheHit:     true,
      libraryId:    data._libraryId || null,
      requestId:    data._requestId || null,
    });
  });
}
