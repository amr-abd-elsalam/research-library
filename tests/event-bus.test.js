// tests/event-bus.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 51 — EventBus unit tests
// Tests the EventBus class lifecycle:
//   - on() registration + unsubscribe
//   - emit() dispatch, multi-listener, error isolation
//   - size getter + listenerCounts()
//   - Edge cases: no listeners, non-function arg, double unsubscribe
//
// Uses new EventBus() class instances for full isolation.
// The module-level logger import is a singleton — prints warnings
// for listener errors but does not affect test correctness.
// ═══════════════════════════════════════════════════════════════

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../server/services/eventBus.js';

describe('EventBus', () => {

  // T-EB1: fresh instance has size 0
  it('T-EB1: fresh instance has size 0', () => {
    const bus = new EventBus();
    assert.strictEqual(bus.size, 0);
  });

  // T-EB2: on() registers listener and increments size
  it('T-EB2: on registers listener and increments size', () => {
    const bus = new EventBus();
    bus.on('test:event', () => {});
    assert.strictEqual(bus.size, 1);
    bus.on('test:event', () => {});
    assert.strictEqual(bus.size, 2);
    bus.on('other:event', () => {});
    assert.strictEqual(bus.size, 3);
  });

  // T-EB3: emit() calls listener with correct data
  it('T-EB3: emit calls listener with correct data', () => {
    const bus = new EventBus();
    let received = null;
    bus.on('test:event', (data) => { received = data; });
    const payload = { key: 'value', num: 42 };
    bus.emit('test:event', payload);
    assert.deepStrictEqual(received, payload);
  });

  // T-EB4: emit() calls multiple listeners for same event
  it('T-EB4: emit calls multiple listeners for same event', () => {
    const bus = new EventBus();
    const calls = [];
    bus.on('multi', (d) => calls.push(`a:${d}`));
    bus.on('multi', (d) => calls.push(`b:${d}`));
    bus.on('multi', (d) => calls.push(`c:${d}`));
    bus.emit('multi', 'x');
    assert.deepStrictEqual(calls, ['a:x', 'b:x', 'c:x']);
  });

  // T-EB5: emit() does not call listeners for different events
  it('T-EB5: emit does not call listeners for different events', () => {
    const bus = new EventBus();
    let called = false;
    bus.on('event:A', () => { called = true; });
    bus.emit('event:B', {});
    assert.strictEqual(called, false);
  });

  // T-EB6: on() returns unsubscribe — removes listener, decrements size
  it('T-EB6: on returns unsubscribe that removes listener and decrements size', () => {
    const bus = new EventBus();
    let callCount = 0;
    const unsub = bus.on('test:unsub', () => { callCount++; });
    assert.strictEqual(bus.size, 1);

    bus.emit('test:unsub', {});
    assert.strictEqual(callCount, 1);

    unsub();
    assert.strictEqual(bus.size, 0);

    bus.emit('test:unsub', {});
    assert.strictEqual(callCount, 1, 'listener should not be called after unsubscribe');
  });

  // T-EB7: listener error does not prevent other listeners (error isolation)
  it('T-EB7: listener error does not prevent other listeners', () => {
    const bus = new EventBus();
    const calls = [];
    bus.on('err:test', () => calls.push('first'));
    bus.on('err:test', () => { throw new Error('boom'); });
    bus.on('err:test', () => calls.push('third'));
    bus.emit('err:test', {});
    assert.deepStrictEqual(calls, ['first', 'third']);
  });

  // T-EB8: emit() with no listeners — no throw
  it('T-EB8: emit with no listeners does not throw', () => {
    const bus = new EventBus();
    assert.doesNotThrow(() => {
      bus.emit('nonexistent:event', { some: 'data' });
    });
  });

  // T-EB9: listenerCounts() returns correct map
  it('T-EB9: listenerCounts returns correct map', () => {
    const bus = new EventBus();
    bus.on('alpha', () => {});
    bus.on('alpha', () => {});
    bus.on('beta', () => {});
    const counts = bus.listenerCounts();
    assert.strictEqual(counts.alpha, 2);
    assert.strictEqual(counts.beta, 1);
    assert.strictEqual(counts.gamma, undefined);
  });

  // T-EB10: on() throws for non-function argument
  it('T-EB10: on throws for non-function argument', () => {
    const bus = new EventBus();
    assert.throws(() => bus.on('test', 'not a function'), /fn must be a function/);
    assert.throws(() => bus.on('test', null), /fn must be a function/);
    assert.throws(() => bus.on('test', 42), /fn must be a function/);
  });

  // T-EB11: data passed by reference (not cloned)
  it('T-EB11: data passed by reference not cloned', () => {
    const bus = new EventBus();
    let received = null;
    bus.on('ref:test', (data) => { received = data; });
    const payload = { mutable: true };
    bus.emit('ref:test', payload);
    assert.strictEqual(received, payload, 'should be the same object reference');
    payload.mutable = false;
    assert.strictEqual(received.mutable, false, 'mutation should be visible — same reference');
  });

  // T-EB12: double unsubscribe is idempotent
  it('T-EB12: double unsubscribe is idempotent', () => {
    const bus = new EventBus();
    bus.on('keep', () => {});
    const unsub = bus.on('remove', () => {});
    assert.strictEqual(bus.size, 2);

    unsub();
    assert.strictEqual(bus.size, 1);

    // Second call should not throw or remove other listeners
    assert.doesNotThrow(() => unsub());
    assert.strictEqual(bus.size, 1, 'size should stay 1 after double unsubscribe');
  });

  // T-EB13: removeAllListeners(event) — removes listeners for specific event only
  it('T-EB13: removeAllListeners(event) removes specific event listeners only', () => {
    const bus = new EventBus();
    bus.on('alpha', () => {});
    bus.on('alpha', () => {});
    bus.on('beta', () => {});
    assert.strictEqual(bus.size, 3);

    bus.removeAllListeners('alpha');
    assert.strictEqual(bus.size, 1, 'only beta listener should remain');

    const counts = bus.listenerCounts();
    assert.strictEqual(counts.alpha, undefined, 'alpha should have no listeners');
    assert.strictEqual(counts.beta, 1, 'beta should still have 1 listener');
  });

  // T-EB14: removeAllListeners() without args — clears ALL listeners
  it('T-EB14: removeAllListeners() without args clears all listeners', () => {
    const bus = new EventBus();
    bus.on('alpha', () => {});
    bus.on('beta', () => {});
    bus.on('gamma', () => {});
    assert.strictEqual(bus.size, 3);

    bus.removeAllListeners();
    assert.strictEqual(bus.size, 0, 'all listeners should be removed');

    const counts = bus.listenerCounts();
    assert.deepStrictEqual(counts, {}, 'listenerCounts should be empty object');
  });

});
