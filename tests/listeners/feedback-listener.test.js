// tests/listeners/feedback-listener.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 57 — Unit tests for feedbackListener
// Tests that feedback:submitted events increment the
// feedback_total metric on MetricsCollector.
// Note: feedbackListener records metrics (not feedbackCollector).
// feedbackCollector.submit() is what EMITS feedback:submitted.
// ═══════════════════════════════════════════════════════════════

import { describe, it, before, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { eventBus } from '../../server/services/eventBus.js';
import { metrics }  from '../../server/services/metrics.js';
import { register } from '../../server/services/listeners/feedbackListener.js';

let registered = false;

describe('FeedbackListener', () => {

  before(() => {
    if (!registered) {
      register();
      registered = true;
    }
  });

  afterEach(() => {
    metrics.reset();
  });

  // T-FL01: feedback:submitted with positive rating — increments feedback_total{positive}
  it('T-FL01: feedback:submitted positive — increments feedback_total', () => {
    eventBus.emit('feedback:submitted', {
      correlationId: 'corr-01',
      sessionId: 'sess-01',
      rating: 'positive',
      comment: null,
      timestamp: new Date().toISOString(),
    });

    const snap = metrics.snapshot();
    const feedbackCounter = snap.counters['feedback_total'];
    assert.ok(feedbackCounter, 'feedback_total counter should exist');
    const posKey = '[["rating","positive"]]';
    assert.ok(feedbackCounter[posKey] >= 1, 'positive count should be >= 1');
  });

  // T-FL02: feedback:submitted with negative rating — increments feedback_total{negative}
  it('T-FL02: feedback:submitted negative — increments feedback_total', () => {
    eventBus.emit('feedback:submitted', {
      correlationId: 'corr-02',
      sessionId: 'sess-01',
      rating: 'negative',
      comment: 'not helpful',
      timestamp: new Date().toISOString(),
    });

    const snap = metrics.snapshot();
    const feedbackCounter = snap.counters['feedback_total'];
    assert.ok(feedbackCounter, 'feedback_total counter should exist');
    const negKey = '[["rating","negative"]]';
    assert.ok(feedbackCounter[negKey] >= 1, 'negative count should be >= 1');
  });

  // T-FL03: feedback:submitted with null data — no crash
  it('T-FL03: feedback:submitted with null data — no crash', () => {
    assert.doesNotThrow(() => {
      eventBus.emit('feedback:submitted', null);
    });
  });

  // T-FL04: feedback:submitted with missing rating — no crash (guard check)
  it('T-FL04: feedback:submitted with missing rating — no crash', () => {
    assert.doesNotThrow(() => {
      eventBus.emit('feedback:submitted', {
        correlationId: 'corr-03',
      });
    });

    // Should NOT have incremented anything (guard: if (!data || !data.rating) return)
    const snap = metrics.snapshot();
    const feedbackCounter = snap.counters['feedback_total'];
    // Counter might not exist at all, which is fine
    assert.ok(!feedbackCounter || Object.keys(feedbackCounter).length === 0,
      'no feedback metric should be recorded without rating');
  });
});
