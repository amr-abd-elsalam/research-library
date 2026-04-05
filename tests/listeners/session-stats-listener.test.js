// tests/listeners/session-stats-listener.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 58 — Unit tests for sessionStatsListener
// Tests that pipeline:complete and pipeline:cacheHit events
// record budget tracking in SessionBudgetTracker and
// increment session-level metrics.
// ═══════════════════════════════════════════════════════════════

import { describe, it, before, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { eventBus }      from '../../server/services/eventBus.js';
import { metrics }       from '../../server/services/metrics.js';
import { sessionBudget } from '../../server/services/sessionBudget.js';
import { register }      from '../../server/services/listeners/sessionStatsListener.js';

let registered = false;

describe('SessionStatsListener', () => {

  before(() => {
    if (!registered) {
      register();
      registered = true;
    }
  });

  afterEach(() => {
    metrics.reset();
    sessionBudget.reset();
  });

  // T-SS01: pipeline:complete with sessionId + _tokenEstimates — records budget
  it('T-SS01: pipeline:complete with tokens — records budget in sessionBudget', () => {
    eventBus.emit('pipeline:complete', {
      sessionId: 'ss-test-01',
      _tokenEstimates: { embedding: 100, input: 200, output: 300 },
      _analytics: { estimated_cost: 0.005 },
    });

    const budget = sessionBudget.get('ss-test-01');
    assert.ok(budget, 'budget entry should exist');
    assert.strictEqual(budget.totalTokens, 600, 'totalTokens should be 600');
    assert.strictEqual(budget.turnCount, 1, 'turnCount should be 1');
  });

  // T-SS02: pipeline:complete with sessionId — increments session_messages_total{role:pipeline}
  it('T-SS02: pipeline:complete with sessionId — increments session_messages_total', () => {
    eventBus.emit('pipeline:complete', {
      sessionId: 'ss-test-02',
    });

    const snap = metrics.snapshot();
    const counter = snap.counters['session_messages_total'];
    assert.ok(counter, 'session_messages_total counter should exist');
    const key = '[["role","pipeline"]]';
    assert.ok(counter[key] >= 1, `session_messages_total{pipeline} should be >= 1`);
  });

  // T-SS03: pipeline:cacheHit with sessionId — increments session_messages_total{role:cache_hit}
  it('T-SS03: pipeline:cacheHit with sessionId — increments session_messages_total{cache_hit}', () => {
    eventBus.emit('pipeline:cacheHit', {
      sessionId: 'ss-test-03',
    });

    const snap = metrics.snapshot();
    const counter = snap.counters['session_messages_total'];
    assert.ok(counter, 'session_messages_total counter should exist');
    const key = '[["role","cache_hit"]]';
    assert.ok(counter[key] >= 1, `session_messages_total{cache_hit} should be >= 1`);
  });

  // T-SS04: pipeline:complete without sessionId — no budget recorded, no metric
  it('T-SS04: pipeline:complete without sessionId — no budget or metric', () => {
    eventBus.emit('pipeline:complete', {
      _tokenEstimates: { embedding: 50 },
    });

    assert.strictEqual(sessionBudget.size, 0, 'no budget entries should exist');
  });

  // T-SS05: null event data — no crash
  it('T-SS05: null event data — no crash', () => {
    assert.doesNotThrow(() => {
      eventBus.emit('pipeline:complete', null);
    });
  });
});
