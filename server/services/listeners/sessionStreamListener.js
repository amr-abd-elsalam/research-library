// server/services/listeners/sessionStreamListener.js
// ═══════════════════════════════════════════════════════════════
// SessionStream Listener — Phase 93 (Listener #28)
// Bridges EventBus pipeline events to SSE connections.
// Maintains a Map of ipHash → Set<ServerResponse> for per-user
// targeting. When pipeline:complete or pipeline:cacheHit fires,
// pushes an SSE event to all matching connections.
// Feature-gated: config.SESSION_INDEX.sseEnabled.
// Zero overhead when disabled or no active connections.
// ═══════════════════════════════════════════════════════════════

import { eventBus } from '../eventBus.js';
import config from '../../../config.js';

/** @type {Map<string, Set<import('node:http').ServerResponse>>} */
const connections = new Map();

/**
 * Registers an SSE connection for a specific ipHash.
 * Auto-removes on connection close.
 * @param {string} ipHash
 * @param {import('node:http').ServerResponse} res
 */
export function addConnection(ipHash, res) {
  if (!ipHash) return;
  if (!connections.has(ipHash)) connections.set(ipHash, new Set());
  connections.get(ipHash).add(res);

  res.on('close', () => {
    const set = connections.get(ipHash);
    if (set) {
      set.delete(res);
      if (set.size === 0) connections.delete(ipHash);
    }
  });
}

/**
 * Returns current connection counts. For inspect/testing.
 * @returns {{ totalConnections: number, uniqueUsers: number }}
 */
export function counts() {
  let total = 0;
  for (const set of connections.values()) total += set.size;
  return { totalConnections: total, uniqueUsers: connections.size };
}

/**
 * Pushes an SSE event to all connections matching the given ipHash.
 * @param {object} data — event data from EventBus (must contain ipHash + sessionId)
 */
function pushToConnections(data) {
  if (config.SESSION_INDEX?.sseEnabled === false) return;
  if (!data.ipHash || !data.sessionId) return;

  const clients = connections.get(data.ipHash);
  if (!clients || clients.size === 0) return;

  const payload = JSON.stringify({
    type:      'session_updated',
    sessionId: data.sessionId,
    timestamp: Date.now(),
  });

  for (const res of clients) {
    try {
      res.write(`data: ${payload}\n\n`);
    } catch {
      // Client disconnected — will be cleaned up by 'close' event
    }
  }
}

/**
 * Handler for pipeline:complete events.
 * Exported for unit testing.
 */
export function handlePipelineComplete(data) {
  pushToConnections(data);
}

/**
 * Handler for pipeline:cacheHit events.
 * Exported for unit testing.
 */
export function handlePipelineCacheHit(data) {
  pushToConnections(data);
}

/**
 * Resets all connections. For test isolation.
 */
export function reset() {
  connections.clear();
}

/**
 * Handler for session:meta_updated events (Phase 94).
 * Pushes SSE event when session title/pin changes.
 * Exported for unit testing.
 */
export function handleSessionMetaUpdated(data) {
  if (config.SESSION_INDEX?.sseEnabled === false) return;
  if (!data.ipHash || !data.sessionId) return;

  const clients = connections.get(data.ipHash);
  if (!clients || clients.size === 0) return;

  const payload = JSON.stringify({
    type:      'session_meta_updated',
    sessionId: data.sessionId,
    field:     data.field || null,
    timestamp: Date.now(),
  });

  for (const res of clients) {
    try {
      res.write(`data: ${payload}\n\n`);
    } catch { /* client disconnected */ }
  }
}

export function register() {
  eventBus.on('pipeline:complete', handlePipelineComplete);
  eventBus.on('pipeline:cacheHit', handlePipelineCacheHit);
  eventBus.on('session:meta_updated', handleSessionMetaUpdated);
}
