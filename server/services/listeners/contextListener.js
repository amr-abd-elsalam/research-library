// server/services/listeners/contextListener.js
// ═══════════════════════════════════════════════════════════════
// Context Listener — Phase 28
// Records conversation turns in ConversationContext for each session.
// Listens to pipeline:complete + pipeline:cacheHit.
// Emits conversation:contextUpdated after each recording.
// ═══════════════════════════════════════════════════════════════

import { eventBus } from '../eventBus.js';
import { conversationContext } from '../conversationContext.js';
import { contextPersister } from '../contextPersister.js';

export function register() {

  // ── Record context after pipeline completion ───────────────
  eventBus.on('pipeline:complete', (data) => {
    if (!data.sessionId) return;

    conversationContext.recordTurn(data.sessionId, {
      message:     data.message || '',
      response:    (data.fullText || '').slice(0, 300),
      queryType:   data.queryType || null,
      topicFilter: data.topicFilter || null,
    });

    eventBus.emit('conversation:contextUpdated', {
      sessionId: data.sessionId,
      turns:     conversationContext.getContext(data.sessionId)?.turns ?? 0,
      timestamp: Date.now(),
    });

    // Persist context to disk (Phase 31 — debounced, fire-and-forget)
    try {
      if (contextPersister.enabled && data.sessionId) {
        const serialized = conversationContext.serialize(data.sessionId);
        if (serialized) contextPersister.scheduleWrite(data.sessionId, serialized);
      }
    } catch (_) { /* graceful — persistence is optional */ }
  });

  // ── Record cache hits (they represent user intent too) ─────
  eventBus.on('pipeline:cacheHit', (data) => {
    if (!data.sessionId) return;

    conversationContext.recordTurn(data.sessionId, {
      message:     data.message || '',
      response:    (data.fullText || '').slice(0, 300),
      queryType:   null,
      topicFilter: data.topicFilter || null,
    });

    eventBus.emit('conversation:contextUpdated', {
      sessionId: data.sessionId,
      turns:     conversationContext.getContext(data.sessionId)?.turns ?? 0,
      timestamp: Date.now(),
    });

    // Persist context to disk (Phase 31 — debounced, fire-and-forget)
    try {
      if (contextPersister.enabled && data.sessionId) {
        const serialized = conversationContext.serialize(data.sessionId);
        if (serialized) contextPersister.scheduleWrite(data.sessionId, serialized);
      }
    } catch (_) { /* graceful — persistence is optional */ }
  });
}
