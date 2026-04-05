// tests/listeners/circuit-listener.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 58 — Unit tests for circuitListener
// Tests that circuit:stateChange events write entries to
// the OperationalLog ring buffer.
// ═══════════════════════════════════════════════════════════════

import { describe, it, before, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { eventBus }       from '../../server/services/eventBus.js';
import { operationalLog } from '../../server/services/operationalLog.js';
import { register }       from '../../server/services/listeners/circuitListener.js';

let registered = false;

describe('CircuitListener', () => {

  before(() => {
    if (!registered) {
      register();
      registered = true;
    }
  });

  afterEach(() => {
    operationalLog.reset();
  });

  // T-CIR01: circuit:stateChange — records entry in operationalLog
  it('T-CIR01: circuit:stateChange — records entry in operationalLog', () => {
    eventBus.emit('circuit:stateChange', {
      name: 'embedding',
      from: 'closed',
      to: 'open',
    });

    const entries = operationalLog.all();
    const circuitEntries = entries.filter(e => e.event === 'circuit:stateChange');
    assert.ok(circuitEntries.length >= 1, 'should have at least 1 circuit:stateChange entry');

    const last = circuitEntries[circuitEntries.length - 1];
    assert.strictEqual(last.module, 'embedding');
    assert.strictEqual(last.detail.from, 'closed');
    assert.strictEqual(last.detail.to, 'open');
  });

  // T-CIR02: circuit:stateChange half-open → closed — logged correctly
  it('T-CIR02: circuit:stateChange half-open to closed — logged correctly', () => {
    eventBus.emit('circuit:stateChange', {
      name: 'search',
      from: 'half-open',
      to: 'closed',
    });

    const entries = operationalLog.all();
    const circuitEntries = entries.filter(e => e.event === 'circuit:stateChange');
    assert.ok(circuitEntries.length >= 1);

    const last = circuitEntries[circuitEntries.length - 1];
    assert.strictEqual(last.module, 'search');
    assert.strictEqual(last.detail.from, 'half-open');
    assert.strictEqual(last.detail.to, 'closed');
  });

  // T-CIR03: multiple state changes — all recorded
  it('T-CIR03: multiple state changes — all recorded', () => {
    eventBus.emit('circuit:stateChange', { name: 'c1', from: 'closed', to: 'open' });
    eventBus.emit('circuit:stateChange', { name: 'c1', from: 'open', to: 'half-open' });
    eventBus.emit('circuit:stateChange', { name: 'c1', from: 'half-open', to: 'closed' });

    const entries = operationalLog.all();
    const circuitEntries = entries.filter(e => e.event === 'circuit:stateChange');
    assert.ok(circuitEntries.length >= 3, 'should have at least 3 circuit entries');
  });

  // T-CIR04: null event data — no crash
  it('T-CIR04: null event data — no crash', () => {
    assert.doesNotThrow(() => {
      eventBus.emit('circuit:stateChange', null);
    });
  });
});
