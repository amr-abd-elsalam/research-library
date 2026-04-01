// server/services/listeners/sessionListener.js
// ═══════════════════════════════════════════════════════════════
// Session Listener — Phase 13
// Listens to pipeline events on EventBus and persists messages
// to server-side sessions. Replaces the explicit appendMessage()
// calls in chat.js postPipeline() and streamCachedResponse().
// ═══════════════════════════════════════════════════════════════

import { eventBus }      from '../eventBus.js';
import { appendMessage } from '../sessions.js';
import config            from '../../../config.js';

function register() {

  // ── Pipeline complete (normal requests — with token metadata) ──
  eventBus.on('pipeline:complete', (data) => {
    if (!data.sessionId || !config.SESSIONS.enabled) return;

    appendMessage(data.sessionId, 'user', data.message)
      .then(() => appendMessage(data.sessionId, 'assistant', data.fullText, {
        sources:    data.sources,
        score:      data.avgScore,
        query_type: data.queryType,
        tokens:     data._tokenEstimates,
      }))
      .catch(() => {});
  });

  // ── Cache hit (cached responses — no token metadata) ───────────
  eventBus.on('pipeline:cacheHit', (data) => {
    if (!data.sessionId || !config.SESSIONS.enabled) return;

    appendMessage(data.sessionId, 'user', data.message)
      .then(() => appendMessage(data.sessionId, 'assistant', data.fullText, {
        sources: data.sources,
        score:   data.avgScore,
      }))
      .catch(() => {});
  });
}

export { register };
