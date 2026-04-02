// server/services/listeners/suggestionsListener.js
// ═══════════════════════════════════════════════════════════════
// Suggestions Listener — Phase 29
// Listens to conversation:contextUpdated and generates follow-up
// suggestions via SuggestionsEngine.
// Stores latest suggestions per session (in-memory cache).
// Emits suggestions:ready event (informational — for future phases).
// ═══════════════════════════════════════════════════════════════

import { eventBus } from '../eventBus.js';
import { suggestionsEngine } from '../suggestionsEngine.js';
import { conversationContext } from '../conversationContext.js';

// In-memory store for latest suggestions per session
const latestSuggestions = new Map();

export function register() {
  eventBus.on('conversation:contextUpdated', (data) => {
    if (!data.sessionId) return;

    const convCtx = conversationContext.getContext(data.sessionId);
    if (!convCtx) return;

    const suggestions = suggestionsEngine.generate(convCtx);
    latestSuggestions.set(data.sessionId, suggestions);

    eventBus.emit('suggestions:ready', {
      sessionId:   data.sessionId,
      suggestions,
      timestamp:   Date.now(),
    });
  });
}

/**
 * Returns the latest suggestions for a session.
 * Can be used by chat.js or other modules.
 * @param {string} sessionId
 * @returns {string[]}
 */
export function getLatestSuggestions(sessionId) {
  return latestSuggestions.get(sessionId) || [];
}

/**
 * Cleanup — removes suggestions for evicted sessions.
 * @param {string} sessionId
 */
export function clearSuggestions(sessionId) {
  latestSuggestions.delete(sessionId);
}
