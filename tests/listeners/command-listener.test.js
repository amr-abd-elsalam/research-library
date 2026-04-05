// tests/listeners/command-listener.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 58 — Unit tests for commandListener
// Tests that command:complete events trigger analytics logEvent()
// and increment metrics counters.
// ═══════════════════════════════════════════════════════════════

import { describe, it, before, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { eventBus } from '../../server/services/eventBus.js';
import { metrics }  from '../../server/services/metrics.js';
import { register } from '../../server/services/listeners/commandListener.js';

let registered = false;

describe('CommandListener', () => {

  before(() => {
    if (!registered) {
      register();
      registered = true;
    }
  });

  afterEach(() => {
    metrics.reset();
  });

  // T-CMD01: command:complete — increments command_execution_total counter
  it('T-CMD01: command:complete — increments command_execution_total', () => {
    eventBus.emit('command:complete', {
      commandName: '/ملخص',
      latencyMs: 50,
      _analytics: { event_type: 'command' },
    });

    const snap = metrics.snapshot();
    const cmdCounter = snap.counters['command_execution_total'];
    assert.ok(cmdCounter, 'command_execution_total counter should exist');
    const key = '[["command","/ملخص"]]';
    assert.ok(cmdCounter[key] >= 1, `command_execution_total{/ملخص} should be >= 1`);
  });

  // T-CMD02: command:complete with latencyMs — observes command_duration_ms histogram
  it('T-CMD02: command:complete with latencyMs — observes command_duration_ms', () => {
    eventBus.emit('command:complete', {
      commandName: '/مساعدة',
      latencyMs: 120,
    });

    const snap = metrics.snapshot();
    const hist = snap.histograms['command_duration_ms']?.['[]'];
    assert.ok(hist, 'command_duration_ms histogram should exist');
    assert.ok(hist.count >= 1, 'should have at least 1 observation');
  });

  // T-CMD03: command:complete without commandName — uses 'unknown' label
  it('T-CMD03: command:complete without commandName — uses unknown label', () => {
    eventBus.emit('command:complete', {
      latencyMs: 30,
    });

    const snap = metrics.snapshot();
    const cmdCounter = snap.counters['command_execution_total'];
    assert.ok(cmdCounter, 'command_execution_total counter should exist');
    const key = '[["command","unknown"]]';
    assert.ok(cmdCounter[key] >= 1, `command_execution_total{unknown} should be >= 1`);
  });

  // T-CMD04: null event data — no crash (EventBus error isolation)
  it('T-CMD04: null event data — no crash', () => {
    assert.doesNotThrow(() => {
      eventBus.emit('command:complete', null);
    });
  });
});
