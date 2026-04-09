// tests/listeners/strategyAnalyticsListener.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 87 — Strategy Analytics Listener Unit Tests
// Tests strategyAnalyticsHandler behavior and register function.
// No network calls — tests glue layer only.
// ═══════════════════════════════════════════════════════════════

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { strategyAnalyticsHandler, register } from '../../server/services/listeners/strategyAnalyticsListener.js';
import { strategyAnalytics } from '../../server/services/strategyAnalytics.js';

// ── Cleanup ───────────────────────────────────────────────────
afterEach(() => {
  strategyAnalytics.reset();
});

describe('strategyAnalyticsListener', () => {

  // T-SAL01: listener is registered and responds to pipeline:complete
  it('T-SAL01: strategyAnalyticsHandler is a function', () => {
    assert.strictEqual(typeof strategyAnalyticsHandler, 'function');
    assert.strictEqual(typeof register, 'function');
  });

  // T-SAL02: strategy data extracted correctly from event
  it('T-SAL02: strategy data extracted correctly from event', () => {
    strategyAnalyticsHandler({
      correlationId: 'corr-test',
      sessionId: 'sess-test',
      _selectedStrategy: 'deep_analytical',
      _complexityType: 'analytical',
      avgScore: 0.85,
      _turnNumber: 3,
      _rewriteResult: { wasRewritten: false },
      _strategySkipped: false,
    });

    const perf = strategyAnalytics.getPerformance();
    assert.strictEqual(perf.totalRecorded, 1);
    assert.strictEqual(perf.byStrategy.deep_analytical.count, 1);
    assert.strictEqual(perf.byStrategy.deep_analytical.avgScore, 0.85);
  });

  // T-SAL03: skipped events recorded with skipped: true
  it('T-SAL03: skipped events recorded correctly', () => {
    strategyAnalyticsHandler({
      correlationId: 'corr-skip',
      sessionId: 'sess-skip',
      _selectedStrategy: null,
      _strategySkipped: true,
      avgScore: 0.7,
    });

    const perf = strategyAnalytics.getPerformance();
    assert.strictEqual(perf.skippedCount, 1);
    assert.strictEqual(perf.totalRecorded, 1);
  });

  // T-SAL04: missing _selectedStrategy handled as null
  it('T-SAL04: missing _selectedStrategy handled as null', () => {
    strategyAnalyticsHandler({
      correlationId: 'corr-null',
      sessionId: 'sess-null',
      _strategySkipped: false,
      avgScore: 0.6,
    });

    const perf = strategyAnalytics.getPerformance();
    assert.ok('unknown' in perf.byStrategy, 'should record as unknown');
  });

  // T-SAL05: avgScore extracted from event data
  it('T-SAL05: avgScore extracted from event data', () => {
    strategyAnalyticsHandler({
      correlationId: 'corr-score',
      sessionId: 'sess-score',
      _selectedStrategy: 'quick_factual',
      _strategySkipped: false,
      avgScore: 0.92,
      _turnNumber: 1,
    });

    const perf = strategyAnalytics.getPerformance();
    assert.strictEqual(perf.byStrategy.quick_factual.avgScore, 0.92);
  });

  // T-SAL06: turnNumber extracted from _turnNumber
  it('T-SAL06: turnNumber extracted from _turnNumber', () => {
    strategyAnalyticsHandler({
      correlationId: 'corr-turn',
      sessionId: 'sess-turn',
      _selectedStrategy: 'conversational_followup',
      _strategySkipped: false,
      avgScore: 0.8,
      _turnNumber: 5,
    });

    const perf = strategyAnalytics.getPerformance();
    assert.strictEqual(perf.byStrategy.conversational_followup.avgTurnNumber, 5);
  });
});
