// server/services/listeners/sessionIndexListener.js
// ═══════════════════════════════════════════════════════════════
// SessionIndex Listener — Phase 91 (Listener #27)
// Updates SessionMetadataIndex incrementally from EventBus events.
// Listens to:
//   - pipeline:complete → upsert (new message activity)
//   - pipeline:cacheHit → upsert (session activity)
//   - session:evicted   → remove (session cleanup)
// Zero overhead when SESSION_INDEX.enabled: false.
// ═══════════════════════════════════════════════════════════════

import { sessionMetadataIndex } from '../sessionMetadataIndex.js';
import { eventBus } from '../eventBus.js';

/**
 * Handler for pipeline:complete events.
 * Exported for unit testing.
 */
export function handlePipelineComplete(data) {
  if (!sessionMetadataIndex.enabled) return;
  if (!data.sessionId) return;

  // Always pass message as first_message — upsert() only sets it
  // on new entries or entries that don't have first_message yet.
  sessionMetadataIndex.upsert(data.sessionId, {
    last_active:         Date.now(),
    message_count_delta: 2,   // user message + assistant response
    first_message:       data.message || null,
    topic_filter:        data.topicFilter ?? undefined,
    ip_hash:             data.ipHash || null,   // Phase 92: propagate for per-user isolation
  });
}

/**
 * Handler for pipeline:cacheHit events.
 * Exported for unit testing.
 */
export function handlePipelineCacheHit(data) {
  if (!sessionMetadataIndex.enabled) return;
  if (!data.sessionId) return;

  sessionMetadataIndex.upsert(data.sessionId, {
    last_active:         Date.now(),
    message_count_delta: 2,
    first_message:       data.message || null,
    topic_filter:        data.topicFilter ?? undefined,
    ip_hash:             data.ipHash || null,   // Phase 92: propagate for per-user isolation
  });
}

/**
 * Handler for session:evicted events.
 * Exported for unit testing.
 */
export function handleSessionEvicted(data) {
  if (!data.sessionId) return;
  sessionMetadataIndex.remove(data.sessionId);
}

export function register() {
  eventBus.on('pipeline:complete', handlePipelineComplete);
  eventBus.on('pipeline:cacheHit', handlePipelineCacheHit);
  eventBus.on('session:evicted',   handleSessionEvicted);
}
