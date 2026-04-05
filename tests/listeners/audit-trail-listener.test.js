// tests/listeners/audit-trail-listener.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 57 — Unit tests for auditTrailListener
// Tests that 7 event types create correct audit trail entries.
// Uses getTrail() and getTrailCounts() from the listener module.
// ═══════════════════════════════════════════════════════════════

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { eventBus } from '../../server/services/eventBus.js';
import { register, getTrail, getTrailCounts } from '../../server/services/listeners/auditTrailListener.js';

let registered = false;

describe('AuditTrailListener', () => {

  before(() => {
    if (!registered) {
      register();
      registered = true;
    }
  });

  // T-ATL01: pipeline:complete — records 'query' audit entry
  it('T-ATL01: pipeline:complete — records query audit entry', () => {
    const sessionId = 'audit-test-sess-01';

    eventBus.emit('pipeline:complete', {
      sessionId,
      correlationId: 'audit-corr-01',
      message: 'what is AI?',
      queryType: 'factual',
      avgScore: 0.85,
      aborted: false,
      _responseMode: 'stream',
      totalMs: 200,
    });

    const trail = getTrail(sessionId, 50);
    const queryEntries = trail.filter(e => e.type === 'query');
    assert.ok(queryEntries.length >= 1, 'should have at least 1 query entry');

    const last = queryEntries[queryEntries.length - 1];
    assert.strictEqual(last.type, 'query');
    assert.strictEqual(last.correlationId, 'audit-corr-01');
    assert.strictEqual(last.message, 'what is AI?');
    assert.ok(typeof last.timestamp === 'number');
  });

  // T-ATL02: pipeline:cacheHit — records 'cache_hit' audit entry
  it('T-ATL02: pipeline:cacheHit — records cache_hit audit entry', () => {
    const sessionId = 'audit-test-sess-02';

    eventBus.emit('pipeline:cacheHit', {
      sessionId,
      message: 'cached question',
      avgScore: 0.9,
    });

    const trail = getTrail(sessionId, 50);
    const cacheEntries = trail.filter(e => e.type === 'cache_hit');
    assert.ok(cacheEntries.length >= 1, 'should have at least 1 cache_hit entry');
    assert.strictEqual(cacheEntries[cacheEntries.length - 1].message, 'cached question');
  });

  // T-ATL03: feedback:submitted — records 'feedback' audit entry
  it('T-ATL03: feedback:submitted — records feedback audit entry', () => {
    const sessionId = 'audit-test-sess-03';

    eventBus.emit('feedback:submitted', {
      sessionId,
      correlationId: 'audit-corr-03',
      rating: 'positive',
      comment: 'great answer!',
    });

    const trail = getTrail(sessionId, 50);
    const fbEntries = trail.filter(e => e.type === 'feedback');
    assert.ok(fbEntries.length >= 1, 'should have at least 1 feedback entry');

    const last = fbEntries[fbEntries.length - 1];
    assert.strictEqual(last.rating, 'positive');
    assert.strictEqual(last.comment, 'great answer!');
  });

  // T-ATL04: session:evicted — records 'evicted' audit entry
  it('T-ATL04: session:evicted — records evicted audit entry', () => {
    const sessionId = 'audit-test-sess-04';

    // Need a pre-existing trail for this session
    eventBus.emit('pipeline:complete', {
      sessionId,
      message: 'setup',
      correlationId: 'setup-corr',
    });

    eventBus.emit('session:evicted', { sessionId });

    const trail = getTrail(sessionId, 50);
    const evictEntries = trail.filter(e => e.type === 'evicted');
    assert.ok(evictEntries.length >= 1, 'should have at least 1 evicted entry');
  });

  // T-ATL05: command:complete — records 'command' audit entry
  it('T-ATL05: command:complete — records command audit entry', () => {
    const sessionId = 'audit-test-sess-05';

    eventBus.emit('command:complete', {
      sessionId,
      commandName: '/ملخص',
      timestamp: Date.now(),
    });

    const trail = getTrail(sessionId, 50);
    const cmdEntries = trail.filter(e => e.type === 'command');
    assert.ok(cmdEntries.length >= 1, 'should have at least 1 command entry');
    assert.strictEqual(cmdEntries[cmdEntries.length - 1].commandName, '/ملخص');
  });

  // T-ATL06: execution:routed (non-pipeline) — records 'routing' audit entry
  it('T-ATL06: execution:routed — records routing audit entry', () => {
    const sessionId = 'audit-test-sess-06';

    eventBus.emit('execution:routed', {
      sessionId,
      action: 'command',
      latencyMs: 5,
    });

    const trail = getTrail(sessionId, 50);
    const routeEntries = trail.filter(e => e.type === 'routing');
    assert.ok(routeEntries.length >= 1, 'should have at least 1 routing entry');
    assert.strictEqual(routeEntries[routeEntries.length - 1].action, 'command');
  });

  // T-ATL07: admin:action — records admin action in __system__ session
  it('T-ATL07: admin:action — records admin_action in __system__', () => {
    eventBus.emit('admin:action', {
      action: 'clear-cache',
      params: {},
      result: { success: true, message: 'cleared 5 items' },
      durationMs: 10,
    });

    const trail = getTrail('__system__', 50);
    const adminEntries = trail.filter(e => e.type === 'admin_action');
    assert.ok(adminEntries.length >= 1, 'should have at least 1 admin_action entry');

    const last = adminEntries[adminEntries.length - 1];
    assert.strictEqual(last.action, 'clear-cache');
    assert.strictEqual(last.success, true);
  });
});
