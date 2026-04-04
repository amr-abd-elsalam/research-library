// tests/circuit-breaker.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 51 — CircuitBreaker unit tests
// Tests the CircuitBreaker class state machine:
//   - closed → open (after threshold failures)
//   - open → half-open (after cooldown)
//   - half-open → closed (on success) or → open (on failure)
//   - execute() behavior in each state
//   - CircuitOpenError thrown when open
//   - stats getter structure
//
// Uses new CircuitBreaker(name, options) instances for full isolation.
// Module-level logger/eventBus/metrics imports print console output
// during state transitions but do not affect test correctness.
// Timer tests use short resetAfterMs + real setTimeout (no fakes).
// ═══════════════════════════════════════════════════════════════

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CircuitBreaker, CircuitOpenError } from '../server/services/circuitBreaker.js';

describe('CircuitBreaker', () => {

  // T-CB1: initial state is 'closed'
  it('T-CB1: initial state is closed', () => {
    const cb = new CircuitBreaker('test-cb1');
    assert.strictEqual(cb.state, 'closed');
  });

  // T-CB2: execute() returns result when closed
  it('T-CB2: execute returns result when closed', async () => {
    const cb = new CircuitBreaker('test-cb2');
    const result = await cb.execute(() => 'hello');
    assert.strictEqual(result, 'hello');
  });

  // T-CB3: single failure doesn't open circuit (threshold > 1)
  it('T-CB3: single failure does not open circuit when threshold > 1', async () => {
    const cb = new CircuitBreaker('test-cb3', { failureThreshold: 3 });
    try {
      await cb.execute(() => { throw new Error('fail'); });
    } catch { /* expected */ }
    assert.strictEqual(cb.state, 'closed', 'should remain closed after 1 failure');
  });

  // T-CB4: failures reaching threshold → opens circuit
  it('T-CB4: failures reaching threshold opens circuit', async () => {
    const cb = new CircuitBreaker('test-cb4', { failureThreshold: 2 });
    for (let i = 0; i < 2; i++) {
      try {
        await cb.execute(() => { throw new Error(`fail-${i}`); });
      } catch { /* expected */ }
    }
    assert.strictEqual(cb.state, 'open');
  });

  // T-CB5: execute() throws CircuitOpenError when open
  it('T-CB5: execute throws CircuitOpenError when open', async () => {
    const cb = new CircuitBreaker('test-cb5', { failureThreshold: 1, resetAfterMs: 60000 });
    try {
      await cb.execute(() => { throw new Error('trip'); });
    } catch { /* trip the breaker */ }
    assert.strictEqual(cb.state, 'open');

    await assert.rejects(
      () => cb.execute(() => 'should not run'),
      (err) => {
        assert.ok(err instanceof CircuitOpenError, 'should be CircuitOpenError');
        assert.strictEqual(err.circuitName, 'test-cb5');
        return true;
      }
    );
  });

  // T-CB6: success resets failure count
  it('T-CB6: success resets failure count', async () => {
    const cb = new CircuitBreaker('test-cb6', { failureThreshold: 3 });
    // 2 failures (below threshold)
    for (let i = 0; i < 2; i++) {
      try {
        await cb.execute(() => { throw new Error('fail'); });
      } catch { /* expected */ }
    }
    assert.strictEqual(cb.state, 'closed');
    assert.strictEqual(cb.stats.failureCount, 2);

    // 1 success resets count
    await cb.execute(() => 'ok');
    assert.strictEqual(cb.stats.failureCount, 0);

    // Now 2 more failures should NOT open (count was reset)
    for (let i = 0; i < 2; i++) {
      try {
        await cb.execute(() => { throw new Error('fail'); });
      } catch { /* expected */ }
    }
    assert.strictEqual(cb.state, 'closed', 'should still be closed because count was reset');
  });

  // T-CB7: circuit transitions to half-open after resetAfterMs cooldown
  it('T-CB7: circuit transitions to half-open after resetAfterMs cooldown', async () => {
    const cb = new CircuitBreaker('test-cb7', { failureThreshold: 1, resetAfterMs: 40 });
    // Trip the circuit
    try {
      await cb.execute(() => { throw new Error('trip'); });
    } catch { /* expected */ }
    assert.strictEqual(cb.state, 'open');

    // Wait for cooldown to expire
    await new Promise(r => setTimeout(r, 60));

    // Next execute should transition to half-open then succeed → closed
    const result = await cb.execute(() => 'recovered');
    assert.strictEqual(result, 'recovered');
    assert.strictEqual(cb.state, 'closed');
  });

  // T-CB8: success in half-open → closes circuit
  it('T-CB8: success in half-open closes circuit', async () => {
    const cb = new CircuitBreaker('test-cb8', { failureThreshold: 1, resetAfterMs: 40 });
    try {
      await cb.execute(() => { throw new Error('trip'); });
    } catch { /* expected */ }
    assert.strictEqual(cb.state, 'open');

    await new Promise(r => setTimeout(r, 60));

    await cb.execute(() => 'success');
    assert.strictEqual(cb.state, 'closed');
    assert.strictEqual(cb.stats.failureCount, 0);
  });

  // T-CB9: failure in half-open → re-opens circuit
  it('T-CB9: failure in half-open re-opens circuit', async () => {
    const cb = new CircuitBreaker('test-cb9', { failureThreshold: 1, resetAfterMs: 40 });
    try {
      await cb.execute(() => { throw new Error('trip'); });
    } catch { /* expected */ }
    assert.strictEqual(cb.state, 'open');

    await new Promise(r => setTimeout(r, 60));

    // Fail during half-open
    try {
      await cb.execute(() => { throw new Error('still broken'); });
    } catch { /* expected */ }
    assert.strictEqual(cb.state, 'open', 'should re-open after failure in half-open');
  });

  // T-CB10: stats getter returns correct structure
  it('T-CB10: stats getter returns correct structure', () => {
    const cb = new CircuitBreaker('test-cb10', { failureThreshold: 5, resetAfterMs: 15000 });
    const s = cb.stats;
    assert.strictEqual(s.name, 'test-cb10');
    assert.strictEqual(s.state, 'closed');
    assert.strictEqual(s.failureCount, 0);
    assert.strictEqual(s.lastFailureTime, 0);
    assert.strictEqual(s.failureThreshold, 5);
    assert.strictEqual(s.resetAfterMs, 15000);
  });

});
