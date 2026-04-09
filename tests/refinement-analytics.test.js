// tests/refinement-analytics.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 87 — RefinementAnalytics Unit Tests
// Tests structure, recording, aggregation, ring buffer, and edge cases.
// No network calls — tests pure analytics logic.
// ═══════════════════════════════════════════════════════════════

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { RefinementAnalytics, refinementAnalytics } from '../server/services/refinementAnalytics.js';

// ── Cleanup ───────────────────────────────────────────────────
afterEach(() => {
  refinementAnalytics.reset();
});

// ── Helper: build a refinement entry ──────────────────────────
function buildEntry(overrides = {}) {
  return {
    correlationId: 'corr-' + Math.random().toString(36).slice(2, 8),
    sessionId:     'sess-test',
    originalScore: 0.2,
    finalScore:    0.5,
    attempts:      1,
    improved:      true,
    responseMode:  'structured',
    strategy:      'deep_analytical',
    avgScore:      0.75,
    timestamp:     Date.now(),
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════
// Block 1: RefinementAnalytics Structure (T-RFA01 to T-RFA05)
// ═══════════════════════════════════════════════════════════════
describe('RefinementAnalytics Structure', () => {

  // T-RFA01: RefinementAnalytics exports singleton and class
  it('T-RFA01: exports singleton and class', () => {
    assert.ok(refinementAnalytics instanceof RefinementAnalytics);
    assert.strictEqual(typeof RefinementAnalytics, 'function');
  });

  // T-RFA02: counts() returns expected shape
  it('T-RFA02: counts() returns expected shape', () => {
    const c = refinementAnalytics.counts();
    assert.strictEqual(typeof c.enabled, 'boolean');
    assert.strictEqual(typeof c.totalRecorded, 'number');
    assert.strictEqual(typeof c.maxEntries, 'number');
    assert.strictEqual(typeof c.successRate, 'number');
    assert.strictEqual(c.enabled, true);
  });

  // T-RFA03: reset() clears all entries
  it('T-RFA03: reset() clears all entries', () => {
    refinementAnalytics.record(buildEntry());
    refinementAnalytics.record(buildEntry());
    assert.strictEqual(refinementAnalytics.counts().totalRecorded, 2);
    refinementAnalytics.reset();
    assert.strictEqual(refinementAnalytics.counts().totalRecorded, 0);
  });

  // T-RFA04: getStats() returns zero stats when empty
  it('T-RFA04: getStats() returns zero stats when empty', () => {
    const stats = refinementAnalytics.getStats();
    assert.strictEqual(stats.totalRecorded, 0);
    assert.strictEqual(stats.successRate, 0);
    assert.strictEqual(stats.avgImprovement, 0);
    assert.strictEqual(stats.avgAttempts, 0);
    assert.deepStrictEqual(stats.byResponseMode, {});
    assert.deepStrictEqual(stats.byStrategy, {});
  });

  // T-RFA05: getRecent() returns empty array when no entries
  it('T-RFA05: getRecent() returns empty array when no entries', () => {
    const recent = refinementAnalytics.getRecent();
    assert.ok(Array.isArray(recent));
    assert.strictEqual(recent.length, 0);
  });
});

// ═══════════════════════════════════════════════════════════════
// Block 2: Recording & Aggregation (T-RFA06 to T-RFA11)
// ═══════════════════════════════════════════════════════════════
describe('RefinementAnalytics Recording & Aggregation', () => {

  // T-RFA06: record() stores entry — totalRecorded increments
  it('T-RFA06: record() stores entry — totalRecorded increments', () => {
    refinementAnalytics.record(buildEntry());
    assert.strictEqual(refinementAnalytics.counts().totalRecorded, 1);
  });

  // T-RFA07: record() multiple entries — getStats().totalRecorded matches count
  it('T-RFA07: multiple entries — totalRecorded matches count', () => {
    refinementAnalytics.record(buildEntry());
    refinementAnalytics.record(buildEntry());
    refinementAnalytics.record(buildEntry());
    assert.strictEqual(refinementAnalytics.getStats().totalRecorded, 3);
  });

  // T-RFA08: successRate computed correctly
  it('T-RFA08: successRate computed correctly', () => {
    refinementAnalytics.record(buildEntry({ improved: true }));
    refinementAnalytics.record(buildEntry({ improved: true }));
    refinementAnalytics.record(buildEntry({ improved: false }));
    refinementAnalytics.record(buildEntry({ improved: false }));
    const stats = refinementAnalytics.getStats();
    assert.strictEqual(stats.successRate, 0.5); // 2/4
  });

  // T-RFA09: avgImprovement computed correctly
  it('T-RFA09: avgImprovement computed correctly', () => {
    refinementAnalytics.record(buildEntry({ improved: true, originalScore: 0.2, finalScore: 0.6 })); // +0.4
    refinementAnalytics.record(buildEntry({ improved: true, originalScore: 0.1, finalScore: 0.3 })); // +0.2
    refinementAnalytics.record(buildEntry({ improved: false, originalScore: 0.2, finalScore: 0.2 })); // not counted
    const stats = refinementAnalytics.getStats();
    // avg improvement: (0.4 + 0.2) / 2 = 0.3
    assert.strictEqual(stats.avgImprovement, 0.3);
  });

  // T-RFA10: byResponseMode breakdown
  it('T-RFA10: byResponseMode breakdown', () => {
    refinementAnalytics.record(buildEntry({ responseMode: 'stream', improved: true }));
    refinementAnalytics.record(buildEntry({ responseMode: 'stream', improved: false }));
    refinementAnalytics.record(buildEntry({ responseMode: 'structured', improved: true }));
    const stats = refinementAnalytics.getStats();
    assert.strictEqual(stats.byResponseMode.stream.count, 2);
    assert.strictEqual(stats.byResponseMode.stream.successRate, 0.5);
    assert.strictEqual(stats.byResponseMode.structured.count, 1);
    assert.strictEqual(stats.byResponseMode.structured.successRate, 1);
  });

  // T-RFA11: byStrategy breakdown
  it('T-RFA11: byStrategy breakdown', () => {
    refinementAnalytics.record(buildEntry({ strategy: 'deep_analytical', improved: true }));
    refinementAnalytics.record(buildEntry({ strategy: 'deep_analytical', improved: false }));
    refinementAnalytics.record(buildEntry({ strategy: 'exploratory_scan', improved: true }));
    refinementAnalytics.record(buildEntry({ strategy: null, improved: false }));
    const stats = refinementAnalytics.getStats();
    assert.strictEqual(stats.byStrategy.deep_analytical.count, 2);
    assert.strictEqual(stats.byStrategy.exploratory_scan.count, 1);
    assert.strictEqual(stats.byStrategy.none.count, 1);
  });
});

// ═══════════════════════════════════════════════════════════════
// Block 3: Ring Buffer & Edge Cases (T-RFA12 to T-RFA15)
// ═══════════════════════════════════════════════════════════════
describe('RefinementAnalytics Ring Buffer & Edge Cases', () => {

  // T-RFA12: ring buffer evicts oldest when maxEntries exceeded
  it('T-RFA12: ring buffer evicts oldest when exceeded', () => {
    // maxEntries is 200 from config
    for (let i = 0; i < 210; i++) {
      refinementAnalytics.record(buildEntry({ correlationId: `corr-${i}` }));
    }
    const c = refinementAnalytics.counts();
    assert.ok(c.totalRecorded <= 200, `should not exceed maxEntries, got ${c.totalRecorded}`);
  });

  // T-RFA13: getRecent(n) returns last N entries in order
  it('T-RFA13: getRecent(n) returns last N entries in order', () => {
    refinementAnalytics.record(buildEntry({ correlationId: 'first' }));
    refinementAnalytics.record(buildEntry({ correlationId: 'second' }));
    refinementAnalytics.record(buildEntry({ correlationId: 'third' }));
    const recent = refinementAnalytics.getRecent(2);
    assert.strictEqual(recent.length, 2);
    assert.strictEqual(recent[0].correlationId, 'third');
    assert.strictEqual(recent[1].correlationId, 'second');
  });

  // T-RFA14: record with null strategy — falls into 'none' bucket
  it('T-RFA14: null strategy falls into none bucket', () => {
    refinementAnalytics.record(buildEntry({ strategy: null, improved: true }));
    const stats = refinementAnalytics.getStats();
    assert.ok('none' in stats.byStrategy, 'should have none bucket');
    assert.strictEqual(stats.byStrategy.none.count, 1);
  });

  // T-RFA15: all entries improved=false — successRate is 0, avgImprovement is 0
  it('T-RFA15: all improved=false — successRate 0, avgImprovement 0', () => {
    refinementAnalytics.record(buildEntry({ improved: false }));
    refinementAnalytics.record(buildEntry({ improved: false }));
    refinementAnalytics.record(buildEntry({ improved: false }));
    const stats = refinementAnalytics.getStats();
    assert.strictEqual(stats.successRate, 0);
    assert.strictEqual(stats.avgImprovement, 0);
  });
});
