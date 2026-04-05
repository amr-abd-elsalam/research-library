// tests/listeners/routing-listener.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 58 — Unit tests for routingListener
// Tests that execution:routed events write entries to
// OperationalLog and increment execution_routed_total metric.
// ═══════════════════════════════════════════════════════════════

import { describe, it, before, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { eventBus }       from '../../server/services/eventBus.js';
import { operationalLog } from '../../server/services/operationalLog.js';
import { metrics }        from '../../server/services/metrics.js';
import { register }       from '../../server/services/listeners/routingListener.js';

let registered = false;

describe('RoutingListener', () => {

  before(() => {
    if (!registered) {
      register();
      registered = true;
    }
  });

  afterEach(() => {
    operationalLog.reset();
    metrics.reset();
  });

  // T-RT01: execution:routed — records in operationalLog
  it('T-RT01: execution:routed — records in operationalLog', () => {
    eventBus.emit('execution:routed', {
      action: 'pipeline',
      latencyMs: 3,
    });

    const entries = operationalLog.all();
    const routeEntries = entries.filter(e => e.event === 'execution:routed');
    assert.ok(routeEntries.length >= 1, 'should have at least 1 execution:routed entry');

    const last = routeEntries[routeEntries.length - 1];
    assert.strictEqual(last.module, 'executionRouter');
    assert.strictEqual(last.detail.action, 'pipeline');
    assert.strictEqual(last.detail.latencyMs, 3);
  });

  // T-RT02: execution:routed — increments execution_routed_total metric
  it('T-RT02: execution:routed — increments execution_routed_total', () => {
    eventBus.emit('execution:routed', {
      action: 'command',
      latencyMs: 2,
    });

    const snap = metrics.snapshot();
    const counter = snap.counters['execution_routed_total'];
    assert.ok(counter, 'execution_routed_total counter should exist');
    const key = '[["action","command"]]';
    assert.ok(counter[key] >= 1, `execution_routed_total{command} should be >= 1`);
  });

  // T-RT03: different action types — all recorded
  it('T-RT03: different action types — all recorded in log', () => {
    eventBus.emit('execution:routed', { action: 'pipeline', latencyMs: 5 });
    eventBus.emit('execution:routed', { action: 'command', latencyMs: 2 });
    eventBus.emit('execution:routed', { action: 'cache', latencyMs: 1 });

    const entries = operationalLog.all();
    const routeEntries = entries.filter(e => e.event === 'execution:routed');
    assert.ok(routeEntries.length >= 3, 'should have at least 3 routing entries');

    const actions = routeEntries.map(e => e.detail.action);
    assert.ok(actions.includes('pipeline'));
    assert.ok(actions.includes('command'));
    assert.ok(actions.includes('cache'));
  });

  // T-RT04: different actions — separate metric labels
  it('T-RT04: different actions — separate metric labels', () => {
    eventBus.emit('execution:routed', { action: 'pipeline', latencyMs: 5 });
    eventBus.emit('execution:routed', { action: 'cache', latencyMs: 1 });

    const snap = metrics.snapshot();
    const counter = snap.counters['execution_routed_total'];
    assert.ok(counter['[["action","pipeline"]]'] >= 1);
    assert.ok(counter['[["action","cache"]]'] >= 1);
  });

  // T-RT05: null event data — no crash
  it('T-RT05: null event data — no crash', () => {
    assert.doesNotThrow(() => {
      eventBus.emit('execution:routed', null);
    });
  });
});
