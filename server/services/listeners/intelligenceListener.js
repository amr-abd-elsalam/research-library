// server/services/listeners/intelligenceListener.js
// ═══════════════════════════════════════════════════════════════
// Intelligence Listener — Phase 53 (Listener #19)
// Feeds rolling data to AdminIntelligenceEngine from 3 events:
//   - pipeline:complete → _recordCompletion()
//   - feedback:submitted → _recordFeedback()
//   - library:changed → _recordLibraryChange()
//
// Lightweight — counter increments only, no async I/O.
// Always registers (guard is inside _record* methods via enabled check).
// ═══════════════════════════════════════════════════════════════

import { eventBus } from '../eventBus.js';
import { adminIntelligence } from '../adminIntelligence.js';

export function register() {
  eventBus.on('pipeline:complete', (data) => {
    adminIntelligence._recordCompletion(data);
  });

  eventBus.on('feedback:submitted', (data) => {
    adminIntelligence._recordFeedback(data);
  });

  eventBus.on('library:changed', (data) => {
    adminIntelligence._recordLibraryChange(data);
  });
}
