// tests/listeners/session-listener.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 57 — Unit tests for sessionListener
// Tests that pipeline:complete and pipeline:cacheHit events
// trigger appendMessage calls. Since sessions are disabled by
// default in config, we verify the listener's guard behavior.
// ═══════════════════════════════════════════════════════════════

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { eventBus } from '../../server/services/eventBus.js';
import { register } from '../../server/services/listeners/sessionListener.js';

let registered = false;

describe('SessionListener', () => {

  before(() => {
    if (!registered) {
      register();
      registered = true;
    }
  });

  // T-SL01: pipeline:complete without sessionId — no crash
  it('T-SL01: pipeline:complete without sessionId — no crash', () => {
    assert.doesNotThrow(() => {
      eventBus.emit('pipeline:complete', {
        message: 'test question',
        fullText: 'test answer',
        sources: [],
      });
    });
  });

  // T-SL02: pipeline:complete with sessionId (sessions disabled in config) — no crash
  it('T-SL02: pipeline:complete with sessionId (sessions disabled) — no crash', () => {
    assert.doesNotThrow(() => {
      eventBus.emit('pipeline:complete', {
        sessionId: 'test-session-001',
        message: 'test question',
        fullText: 'test answer',
        sources: [],
        avgScore: 0.85,
        queryType: 'factual',
        _tokenEstimates: { embedding: 10, input: 50, output: 100 },
      });
    });
  });

  // T-SL03: pipeline:cacheHit without sessionId — no crash
  it('T-SL03: pipeline:cacheHit without sessionId — no crash', () => {
    assert.doesNotThrow(() => {
      eventBus.emit('pipeline:cacheHit', {
        message: 'cached question',
        fullText: 'cached answer',
        sources: [],
        avgScore: 0.9,
      });
    });
  });

  // T-SL04: pipeline:cacheHit with sessionId (sessions disabled) — no crash
  it('T-SL04: pipeline:cacheHit with sessionId (sessions disabled) — no crash', () => {
    assert.doesNotThrow(() => {
      eventBus.emit('pipeline:cacheHit', {
        sessionId: 'test-session-002',
        message: 'cached question',
        fullText: 'cached answer',
        sources: [],
        avgScore: 0.9,
      });
    });
  });

  // T-SL05: null event data — no crash
  it('T-SL05: null event data — no crash', () => {
    assert.doesNotThrow(() => {
      eventBus.emit('pipeline:complete', null);
    });
  });
});
