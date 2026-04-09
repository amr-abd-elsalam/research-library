// tests/strategy-analytics.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 87 — StrategyAnalytics Unit Tests
// Tests structure, recording, per-strategy stats, ring buffer, edge cases.
// No network calls — tests pure analytics logic.
// ═══════════════════════════════════════════════════════════════

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { StrategyAnalytics, strategyAnalytics } from '../server/services/strategyAnalytics.js';

// ── Cleanup ───────────────────────────────────────────────────
afterEach(() => {
  strategyAnalytics.reset();
});

// ── Helper: build a strategy entry ────────────────────────────
function buildEntry(overrides = {}) {
  return {
    correlationId: 'corr-' + Math.random().toString(36).slice(2, 8),
    sessionId:     'sess-test',
    strategy:      'quick_factual',
    complexityType: 'factual',
    avgScore:      0.85,
    turnNumber:    1,
    isFollowUp:    false,
    skipped:       false,
    timestamp:     Date.now(),
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════
// Block 1: StrategyAnalytics Structure (T-SA01 to T-SA05)
// ═══════════════════════════════════════════════════════════════
describe('StrategyAnalytics Structure', () => {

  // T-SA01: StrategyAnalytics exports singleton and class
  it('T-SA01: exports singleton and class', () => {
    assert.ok(strategyAnalytics instanceof StrategyAnalytics);
    assert.strictEqual(typeof StrategyAnalytics, 'function');
  });

  // T-SA02: counts() returns expected shape
  it('T-SA02: counts() returns expected shape', () => {
    const c = strategyAnalytics.counts();
    assert.strictEqual(typeof c.enabled, 'boolean');
    assert.strictEqual(typeof c.totalRecorded, 'number');
    assert.strictEqual(typeof c.maxEntries, 'number');
    assert.strictEqual(typeof c.strategyBreakdown, 'object');
    assert.strictEqual(c.enabled, true);
  });

  // T-SA03: reset() clears all entries
  it('T-SA03: reset() clears all entries', () => {
    strategyAnalytics.record(buildEntry());
    strategyAnalytics.record(buildEntry());
    assert.strictEqual(strategyAnalytics.counts().totalRecorded, 2);
    strategyAnalytics.reset();
    assert.strictEqual(strategyAnalytics.counts().totalRecorded, 0);
  });

  // T-SA04: getPerformance() returns zero stats when empty
  it('T-SA04: getPerformance() returns zero stats when empty', () => {
    const perf = strategyAnalytics.getPerformance();
    assert.strictEqual(perf.totalRecorded, 0);
    assert.strictEqual(perf.skippedCount, 0);
    assert.strictEqual(perf.skippedRate, 0);
    assert.deepStrictEqual(perf.byStrategy, {});
    assert.strictEqual(perf.escalationRate, 0);
  });

  // T-SA05: getRecent() returns empty array when no entries
  it('T-SA05: getRecent() returns empty array when no entries', () => {
    const recent = strategyAnalytics.getRecent();
    assert.ok(Array.isArray(recent));
    assert.strictEqual(recent.length, 0);
  });
});

// ═══════════════════════════════════════════════════════════════
// Block 2: Recording & Per-Strategy Stats (T-SA06 to T-SA11)
// ═══════════════════════════════════════════════════════════════
describe('StrategyAnalytics Recording & Per-Strategy Stats', () => {

  // T-SA06: record() stores entry — totalRecorded increments
  it('T-SA06: record() stores entry — totalRecorded increments', () => {
    strategyAnalytics.record(buildEntry());
    assert.strictEqual(strategyAnalytics.counts().totalRecorded, 1);
  });

  // T-SA07: byStrategy counts each strategy correctly
  it('T-SA07: byStrategy counts each strategy correctly', () => {
    strategyAnalytics.record(buildEntry({ strategy: 'quick_factual' }));
    strategyAnalytics.record(buildEntry({ strategy: 'quick_factual' }));
    strategyAnalytics.record(buildEntry({ strategy: 'deep_analytical' }));
    const perf = strategyAnalytics.getPerformance();
    assert.strictEqual(perf.byStrategy.quick_factual.count, 2);
    assert.strictEqual(perf.byStrategy.deep_analytical.count, 1);
  });

  // T-SA08: byStrategy avgScore computed per strategy
  it('T-SA08: byStrategy avgScore computed per strategy', () => {
    strategyAnalytics.record(buildEntry({ strategy: 'quick_factual', avgScore: 0.8 }));
    strategyAnalytics.record(buildEntry({ strategy: 'quick_factual', avgScore: 0.6 }));
    const perf = strategyAnalytics.getPerformance();
    assert.strictEqual(perf.byStrategy.quick_factual.avgScore, 0.7);
  });

  // T-SA09: skipped entries counted separately
  it('T-SA09: skipped entries counted separately', () => {
    strategyAnalytics.record(buildEntry({ skipped: true }));
    strategyAnalytics.record(buildEntry({ skipped: true }));
    strategyAnalytics.record(buildEntry({ skipped: false, strategy: 'quick_factual' }));
    const perf = strategyAnalytics.getPerformance();
    assert.strictEqual(perf.skippedCount, 2);
    assert.strictEqual(perf.skippedRate, 0.6667); // 2/3 rounded to 4 decimals
  });

  // T-SA10: escalationRate computed
  it('T-SA10: escalationRate computed', () => {
    strategyAnalytics.record(buildEntry({ strategy: 'deep_analytical', skipped: false }));
    strategyAnalytics.record(buildEntry({ strategy: 'quick_factual', skipped: false }));
    strategyAnalytics.record(buildEntry({ strategy: 'quick_factual', skipped: false }));
    strategyAnalytics.record(buildEntry({ strategy: 'deep_analytical', skipped: false }));
    const perf = strategyAnalytics.getPerformance();
    assert.strictEqual(perf.escalationRate, 0.5); // 2/4
  });

  // T-SA11: multiple strategies recorded — breakdown is accurate
  it('T-SA11: multiple strategies — breakdown accurate', () => {
    strategyAnalytics.record(buildEntry({ strategy: 'quick_factual' }));
    strategyAnalytics.record(buildEntry({ strategy: 'deep_analytical' }));
    strategyAnalytics.record(buildEntry({ strategy: 'conversational_followup' }));
    strategyAnalytics.record(buildEntry({ strategy: 'exploratory_scan' }));
    strategyAnalytics.record(buildEntry({ strategy: 'quick_factual' }));
    const perf = strategyAnalytics.getPerformance();
    assert.strictEqual(perf.byStrategy.quick_factual.count, 2);
    assert.strictEqual(perf.byStrategy.deep_analytical.count, 1);
    assert.strictEqual(perf.byStrategy.conversational_followup.count, 1);
    assert.strictEqual(perf.byStrategy.exploratory_scan.count, 1);
    assert.strictEqual(perf.totalRecorded, 5);
  });
});

// ═══════════════════════════════════════════════════════════════
// Block 3: Ring Buffer & Edge Cases (T-SA12 to T-SA15)
// ═══════════════════════════════════════════════════════════════
describe('StrategyAnalytics Ring Buffer & Edge Cases', () => {

  // T-SA12: ring buffer evicts oldest when maxEntries exceeded
  it('T-SA12: ring buffer evicts oldest when exceeded', () => {
    for (let i = 0; i < 210; i++) {
      strategyAnalytics.record(buildEntry({ correlationId: `corr-${i}` }));
    }
    const c = strategyAnalytics.counts();
    assert.ok(c.totalRecorded <= 200, `should not exceed maxEntries, got ${c.totalRecorded}`);
  });

  // T-SA13: getRecent(n) returns last N entries in order
  it('T-SA13: getRecent(n) returns last N entries in order', () => {
    strategyAnalytics.record(buildEntry({ correlationId: 'first' }));
    strategyAnalytics.record(buildEntry({ correlationId: 'second' }));
    strategyAnalytics.record(buildEntry({ correlationId: 'third' }));
    const recent = strategyAnalytics.getRecent(2);
    assert.strictEqual(recent.length, 2);
    assert.strictEqual(recent[0].correlationId, 'third');
    assert.strictEqual(recent[1].correlationId, 'second');
  });

  // T-SA14: record with null strategy — handled gracefully
  it('T-SA14: null strategy handled gracefully', () => {
    strategyAnalytics.record(buildEntry({ strategy: null, skipped: false }));
    const perf = strategyAnalytics.getPerformance();
    assert.ok('unknown' in perf.byStrategy, 'should have unknown bucket for null strategy');
    assert.strictEqual(perf.byStrategy.unknown.count, 1);
  });

  // T-SA15: all entries skipped — escalationRate is 0
  it('T-SA15: all skipped — escalationRate is 0', () => {
    strategyAnalytics.record(buildEntry({ skipped: true }));
    strategyAnalytics.record(buildEntry({ skipped: true }));
    strategyAnalytics.record(buildEntry({ skipped: true }));
    const perf = strategyAnalytics.getPerformance();
    assert.strictEqual(perf.escalationRate, 0);
    assert.strictEqual(perf.skippedCount, 3);
    assert.strictEqual(perf.skippedRate, 1);
  });
});
