// tests/listeners/refinementListener.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 78 — Refinement Listener Unit Tests
// Tests refinementHandler behavior and register function.
// No network calls — tests glue layer only.
// ═══════════════════════════════════════════════════════════════

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { refinementHandler, register } from '../../server/services/listeners/refinementListener.js';

describe('refinementListener', () => {

  // T-RL01: refinementHandler is a function
  it('T-RL01: refinementHandler is a function', () => {
    assert.strictEqual(typeof refinementHandler, 'function');
  });

  // T-RL02: register is a function
  it('T-RL02: register is a function', () => {
    assert.strictEqual(typeof register, 'function');
  });

  // T-RL03: refinementHandler does not throw when data is null
  it('T-RL03: refinementHandler does not throw when data is null', () => {
    assert.doesNotThrow(() => refinementHandler(null));
  });

  // T-RL04: refinementHandler does not throw when data is valid
  it('T-RL04: refinementHandler does not throw with valid data', () => {
    assert.doesNotThrow(() => refinementHandler({
      correlationId: 'test-corr',
      attempts: 1,
      improved: true,
      originalScore: 0.2,
      finalScore: 0.6,
      sessionId: 'test-session',
      timestamp: Date.now(),
    }));
  });

  // T-RL05: refinementHandler handles missing fields gracefully
  it('T-RL05: refinementHandler handles missing fields', () => {
    assert.doesNotThrow(() => refinementHandler({}));
    assert.doesNotThrow(() => refinementHandler({ improved: false }));
    assert.doesNotThrow(() => refinementHandler({ improved: undefined }));
  });

  // T-RL06: register does not throw
  it('T-RL06: register does not throw', () => {
    assert.doesNotThrow(() => register());
  });
});
