// server/services/listeners/correlationListener.js
// ═══════════════════════════════════════════════════════════════
// Correlation Listener — Phase 34 (Listener #15)
// Listens to pipeline:complete → records request metadata in
// CorrelationIndex for O(1) lookup by correlationId.
//
// Does NOT listen to pipeline:cacheHit — cache hits have
// correlationId: null (Phase 33 design decision).
// ═══════════════════════════════════════════════════════════════

import { eventBus }         from '../eventBus.js';
import { correlationIndex } from '../correlationIndex.js';

export function register() {
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
    });
  });
}
