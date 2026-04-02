// server/services/listeners/evictionListener.js
// ═══════════════════════════════════════════════════════════════
// Eviction Listener — Phase 30
// Handles unified cleanup when a session context is evicted:
//   - Clears suggestions cache (suggestionsListener)
//   - Removes session budget tracking (sessionBudget)
//   - Records eviction_total metric
//   - Logs eviction event
// ═══════════════════════════════════════════════════════════════

import { eventBus } from '../eventBus.js';
import { metrics } from '../metrics.js';
import { logger } from '../logger.js';
import { sessionBudget } from '../sessionBudget.js';
import { clearSuggestions } from './suggestionsListener.js';

export function register() {
  eventBus.on('session:evicted', (data) => {
    const { sessionId } = data;
    if (!sessionId) return;

    // 1. Clear suggestions cache
    try {
      clearSuggestions(sessionId);
    } catch (_) { /* graceful — suggestions cleanup is optional */ }

    // 2. Remove session budget tracking
    try {
      sessionBudget.remove(sessionId);
    } catch (_) { /* graceful — budget cleanup is optional */ }

    // 3. Record metric
    metrics.increment('eviction_total', {});

    // 4. Log
    logger.debug('evictionListener', `cleaned up evicted session ${sessionId.slice(0, 8)}`);
  });
}
