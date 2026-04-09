// tests/listeners/refinementListener.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 78 — Refinement Listener Unit Tests
// Tests refinementHandler behavior and register function.
// No network calls — tests glue layer only.
// ═══════════════════════════════════════════════════════════════

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { refinementHandler, refinementAnalyticsHandler, register } from '../../server/services/listeners/refinementListener.js';
import { refinementAnalytics } from '../../server/services/refinementAnalytics.js';

// ── Cleanup ───────────────────────────────────────────────────
afterEach(() => {
  refinementAnalytics.reset();
});

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

  // T-RL07: refinementAnalyticsHandler feeds refinementAnalytics when _refinementApplied is true
  it('T-RL07: feeds refinementAnalytics when _refinementApplied is true', () => {
    refinementAnalyticsHandler({
      correlationId: 'corr-test',
      sessionId: 'sess-test',
      _refinementApplied: true,
      _refinementOriginalScore: 0.2,
      _refinementFinalScore: 0.6,
      _refinementAttempts: 1,
      _refinementImproved: true,
      _responseMode: 'structured',
      _selectedStrategy: 'deep_analytical',
      avgScore: 0.8,
    });
    assert.strictEqual(refinementAnalytics.counts().totalRecorded, 1);
  });

  // T-RL08: refinementAnalyticsHandler does NOT feed when _refinementApplied is false
  it('T-RL08: does NOT feed analytics when _refinementApplied is false', () => {
    refinementAnalyticsHandler({
      correlationId: 'corr-skip',
      sessionId: 'sess-skip',
      _refinementApplied: false,
      avgScore: 0.8,
    });
    assert.strictEqual(refinementAnalytics.counts().totalRecorded, 0);
  });

  // T-RL09: refinementAnalytics.record() receives correct fields from pipeline:complete
  it('T-RL09: correct fields passed to refinementAnalytics', () => {
    refinementAnalyticsHandler({
      correlationId: 'corr-fields',
      sessionId: 'sess-fields',
      _refinementApplied: true,
      _refinementOriginalScore: 0.15,
      _refinementFinalScore: 0.55,
      _refinementAttempts: 2,
      _refinementImproved: true,
      _responseMode: 'stream',
      _selectedStrategy: 'exploratory_scan',
      avgScore: 0.7,
    });
    const recent = refinementAnalytics.getRecent(1);
    assert.strictEqual(recent.length, 1);
    assert.strictEqual(recent[0].correlationId, 'corr-fields');
    assert.strictEqual(recent[0].responseMode, 'stream');
    assert.strictEqual(recent[0].strategy, 'exploratory_scan');
    assert.strictEqual(recent[0].originalScore, 0.15);
    assert.strictEqual(recent[0].finalScore, 0.55);
    assert.strictEqual(recent[0].attempts, 2);
  });
});
