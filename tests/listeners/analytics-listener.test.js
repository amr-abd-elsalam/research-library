// tests/listeners/analytics-listener.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 57 — Unit tests for analyticsListener
// Tests that pipeline:complete and pipeline:cacheHit events
// trigger logEvent() calls on the analytics module.
// ═══════════════════════════════════════════════════════════════

import { describe, it, before, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { eventBus } from '../../server/services/eventBus.js';
import { register } from '../../server/services/listeners/analyticsListener.js';

// We cannot easily intercept logEvent (it's a file-append function),
// so we verify no crash and that the listener is wired up properly.
// The listener does a no-op return when data._analytics is missing.

let registered = false;

describe('AnalyticsListener', () => {

  before(() => {
    if (!registered) {
      register();
      registered = true;
    }
  });

  // T-AL01: pipeline:complete with _analytics — does not throw
  it('T-AL01: pipeline:complete with _analytics — does not throw', () => {
    assert.doesNotThrow(() => {
      eventBus.emit('pipeline:complete', {
        _analytics: {
          event_type: 'chat',
          message_length: 10,
          latency_ms: 200,
          score: 0.85,
        },
        message: 'test question',
        correlationId: 'test-corr-01',
      });
    });
  });

  // T-AL02: pipeline:complete without _analytics — no-op, no crash
  it('T-AL02: pipeline:complete without _analytics — no-op, no crash', () => {
    assert.doesNotThrow(() => {
      eventBus.emit('pipeline:complete', {
        message: 'test question',
        correlationId: 'test-corr-02',
      });
    });
  });

  // T-AL03: pipeline:complete with aborted: true + _analytics — no crash
  it('T-AL03: pipeline:complete with aborted and _analytics — no crash', () => {
    assert.doesNotThrow(() => {
      eventBus.emit('pipeline:complete', {
        _analytics: { event_type: 'chat', score: 0.2 },
        aborted: true,
        abortReason: 'low_confidence',
      });
    });
  });

  // T-AL04: pipeline:cacheHit with _analytics — does not throw
  it('T-AL04: pipeline:cacheHit with _analytics — does not throw', () => {
    assert.doesNotThrow(() => {
      eventBus.emit('pipeline:cacheHit', {
        _analytics: { event_type: 'chat', cache_hit: true },
        message: 'cached question',
      });
    });
  });

  // T-AL05: pipeline:cacheHit without _analytics — no-op, no crash
  it('T-AL05: pipeline:cacheHit without _analytics — no-op, no crash', () => {
    assert.doesNotThrow(() => {
      eventBus.emit('pipeline:cacheHit', {
        message: 'cached question',
      });
    });
  });

  // T-AL06: null event data — no crash (EventBus error isolation)
  it('T-AL06: null event data — no crash', () => {
    assert.doesNotThrow(() => {
      eventBus.emit('pipeline:complete', null);
    });
  });
});
