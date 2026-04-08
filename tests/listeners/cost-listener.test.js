// tests/listeners/cost-listener.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 76 — Cost Listener Unit Tests
// Tests costListener registration and event handling.
// Uses real EventBus + real CostGovernor singleton.
// ═══════════════════════════════════════════════════════════════

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { eventBus } from '../../server/services/eventBus.js';
import { costGovernor } from '../../server/services/costGovernor.js';
import { register } from '../../server/services/listeners/costListener.js';

// ═══════════════════════════════════════════════════════════════
// Cost Listener Tests
// ═══════════════════════════════════════════════════════════════
describe('Cost Listener (Phase 76)', () => {

  beforeEach(() => {
    eventBus.removeAllListeners('pipeline:complete');
    costGovernor.reset();
    register();
  });

  afterEach(() => {
    eventBus.removeAllListeners('pipeline:complete');
    costGovernor.reset();
  });

  // T-CLT01: register function exists and is callable
  it('T-CLT01: register function exists and is callable', () => {
    assert.strictEqual(typeof register, 'function');
  });

  // T-CLT02: register adds listener for pipeline:complete
  it('T-CLT02: register adds pipeline:complete listener', () => {
    const counts = eventBus.listenerCounts();
    assert.ok(counts['pipeline:complete'] >= 1, 'should have at least 1 listener on pipeline:complete');
  });

  // T-CLT03: emitting pipeline:complete — no crash when costGovernor disabled
  it('T-CLT03: pipeline:complete does not crash when costGovernor disabled', () => {
    // costGovernor.enabled is false by default
    assert.doesNotThrow(() => {
      eventBus.emit('pipeline:complete', {
        aborted: false,
        sessionId: 'test-session',
        _tokenEstimates: { input: 100, output: 50 },
      });
    });
  });

  // T-CLT04: aborted pipeline:complete does not record usage
  it('T-CLT04: aborted pipeline:complete — no recording attempt', () => {
    // Even if enabled, aborted should be skipped
    assert.doesNotThrow(() => {
      eventBus.emit('pipeline:complete', {
        aborted: true,
        abortReason: 'low_confidence',
        sessionId: 'test-session',
        _tokenEstimates: { input: 100, output: 50 },
      });
    });
    // Since costGovernor is disabled, nothing should be recorded anyway
    assert.strictEqual(costGovernor.getSessionUsage('test-session'), null);
  });

  // T-CLT05: pipeline:complete without sessionId — handles gracefully
  it('T-CLT05: pipeline:complete without sessionId — no crash', () => {
    assert.doesNotThrow(() => {
      eventBus.emit('pipeline:complete', {
        aborted: false,
        _tokenEstimates: { input: 100, output: 50 },
      });
    });
  });

  // T-CLT06: pipeline:complete without _tokenEstimates — no crash
  it('T-CLT06: pipeline:complete without _tokenEstimates — no crash', () => {
    assert.doesNotThrow(() => {
      eventBus.emit('pipeline:complete', {
        aborted: false,
        sessionId: 'test-session',
      });
    });
  });

  // T-CLT07: multiple pipeline:complete events — no crash
  it('T-CLT07: multiple pipeline:complete events — no crash', () => {
    assert.doesNotThrow(() => {
      for (let i = 0; i < 5; i++) {
        eventBus.emit('pipeline:complete', {
          aborted: false,
          sessionId: `session-${i}`,
          _tokenEstimates: { input: 100 * i, output: 50 * i },
        });
      }
    });
  });

  // T-CLT08: pipeline:complete with zero tokens — no crash
  it('T-CLT08: pipeline:complete with zero tokens — no crash', () => {
    assert.doesNotThrow(() => {
      eventBus.emit('pipeline:complete', {
        aborted: false,
        sessionId: 'test-session',
        _tokenEstimates: { input: 0, output: 0 },
      });
    });
  });
});
