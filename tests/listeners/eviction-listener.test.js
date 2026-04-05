// tests/listeners/eviction-listener.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 58 — Unit tests for evictionListener
// Tests that session:evicted events trigger 7 cleanup steps:
//   1. clearSuggestions(sessionId)
//   2. sessionBudget.remove(sessionId)
//   3. contextPersister.remove(sessionId) — async, fire-and-forget
//   4. metrics.increment('eviction_total')
//   5. logger.debug(...)
//   6. auditPersister.remove(sessionId) — conditional on enabled
//   7. sessionQualityScorer.remove(sessionId)
// ═══════════════════════════════════════════════════════════════

import { describe, it, before, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { eventBus }             from '../../server/services/eventBus.js';
import { metrics }              from '../../server/services/metrics.js';
import { sessionBudget }        from '../../server/services/sessionBudget.js';
import { sessionQualityScorer } from '../../server/services/sessionQualityScorer.js';
import { featureFlags }         from '../../server/services/featureFlags.js';
import { register }             from '../../server/services/listeners/evictionListener.js';

let registered = false;

describe('EvictionListener', () => {

  before(() => {
    if (!registered) {
      register();
      registered = true;
    }
  });

  afterEach(() => {
    metrics.reset();
    sessionBudget.reset();
    sessionQualityScorer.reset();
    featureFlags.clearOverride('QUALITY');
  });

  // T-EVT01: session:evicted — increments eviction_total metric
  it('T-EVT01: session:evicted — increments eviction_total metric', () => {
    eventBus.emit('session:evicted', { sessionId: 'evict-01' });

    const snap = metrics.snapshot();
    const counter = snap.counters['eviction_total'];
    assert.ok(counter, 'eviction_total counter should exist');
    assert.ok(counter['[]'] >= 1, 'eviction_total should be >= 1');
  });

  // T-EVT02: session:evicted — removes sessionBudget entry
  it('T-EVT02: session:evicted — removes sessionBudget entry', () => {
    // Setup: record some budget
    sessionBudget.record('evict-02', { embedding: 100, input: 200 }, 0.01);
    assert.ok(sessionBudget.get('evict-02'), 'budget should exist before eviction');

    eventBus.emit('session:evicted', { sessionId: 'evict-02' });

    assert.strictEqual(sessionBudget.get('evict-02'), null, 'budget should be removed after eviction');
  });

  // T-EVT03: session:evicted — removes sessionQualityScorer entry
  it('T-EVT03: session:evicted — removes quality scorer entry', () => {
    // Setup: enable quality and record some data
    featureFlags.setOverride('QUALITY', true);
    sessionQualityScorer.recordQuery('evict-03', { avgScore: 0.8, aborted: false, rewriteMethod: null });
    sessionQualityScorer.recordQuery('evict-03', { avgScore: 0.7, aborted: false, rewriteMethod: null });

    eventBus.emit('session:evicted', { sessionId: 'evict-03' });

    // After eviction, getScore should return null (session removed)
    const score = sessionQualityScorer.getScore('evict-03');
    assert.strictEqual(score, null, 'quality score should be null after eviction');
  });

  // T-EVT04: session:evicted — multiple evictions accumulate metric
  it('T-EVT04: multiple evictions — metric accumulates', () => {
    eventBus.emit('session:evicted', { sessionId: 'evict-04a' });
    eventBus.emit('session:evicted', { sessionId: 'evict-04b' });
    eventBus.emit('session:evicted', { sessionId: 'evict-04c' });

    const snap = metrics.snapshot();
    const count = snap.counters['eviction_total']?.['[]'];
    assert.ok(count >= 3, `eviction_total should be >= 3, got ${count}`);
  });

  // T-EVT05: session:evicted without sessionId — no crash, no cleanup
  it('T-EVT05: session:evicted without sessionId — no crash', () => {
    const budgetSizeBefore = sessionBudget.size;

    assert.doesNotThrow(() => {
      eventBus.emit('session:evicted', { sessionId: null });
    });

    assert.strictEqual(sessionBudget.size, budgetSizeBefore, 'no budget change when no sessionId');
  });

  // T-EVT06: session:evicted with data missing sessionId key — no crash
  it('T-EVT06: session:evicted with empty object — no crash', () => {
    assert.doesNotThrow(() => {
      eventBus.emit('session:evicted', {});
    });
  });

  // T-EVT07: null event data — no crash (EventBus error isolation catches it)
  it('T-EVT07: null event data — no crash', () => {
    assert.doesNotThrow(() => {
      eventBus.emit('session:evicted', null);
    });
  });

  // T-EVT08: end-to-end — all verifiable cleanups happen in one emit
  it('T-EVT08: end-to-end — budget + quality + metric all cleaned in one emit', () => {
    const sid = 'evict-08-e2e';

    // Setup budget
    sessionBudget.record(sid, { embedding: 50, input: 100 }, 0.005);
    assert.ok(sessionBudget.get(sid), 'budget should exist');

    // Setup quality
    featureFlags.setOverride('QUALITY', true);
    sessionQualityScorer.recordQuery(sid, { avgScore: 0.9, aborted: false, rewriteMethod: null });
    sessionQualityScorer.recordQuery(sid, { avgScore: 0.8, aborted: false, rewriteMethod: null });

    // Evict
    eventBus.emit('session:evicted', { sessionId: sid });

    // Verify all cleanup
    assert.strictEqual(sessionBudget.get(sid), null, 'budget should be removed');
    assert.strictEqual(sessionQualityScorer.getScore(sid), null, 'quality score should be removed');

    const snap = metrics.snapshot();
    assert.ok(snap.counters['eviction_total']?.['[]'] >= 1, 'eviction metric should be recorded');
  });
});
