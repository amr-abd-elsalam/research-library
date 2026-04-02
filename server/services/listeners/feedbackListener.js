// server/services/listeners/feedbackListener.js
// ═══════════════════════════════════════════════════════════════
// Feedback Listener — Phase 33 (Listener #14)
// Listens to feedback:submitted → records feedback_total metric
// labeled by rating (positive/negative).
// ═══════════════════════════════════════════════════════════════

import { eventBus } from '../eventBus.js';
import { metrics }  from '../metrics.js';

export function register() {
  eventBus.on('feedback:submitted', (data) => {
    if (!data || !data.rating) return;
    metrics.increment('feedback_total', { rating: data.rating });
  });
}
