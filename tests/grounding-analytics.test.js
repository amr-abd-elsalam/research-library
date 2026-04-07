// tests/grounding-analytics.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 70 — GroundingAnalytics unit tests
// Tests the GroundingAnalytics singleton lifecycle:
//   - feature-gated record() no-op
//   - single/multi record accumulation
//   - avgScore, lowRate calculation
//   - ring buffer eviction
//   - getRecentScores() order and limit
//   - scoreDistribution buckets
//   - counts() structure
//   - reset() lifecycle
// Uses singleton + featureFlags.setOverride() pattern.
// ═══════════════════════════════════════════════════════════════

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { groundingAnalytics } from '../server/services/groundingAnalytics.js';
import { featureFlags } from '../server/services/featureFlags.js';

describe('GroundingAnalytics', () => {

  afterEach(() => {
    groundingAnalytics.reset();
    featureFlags.clearOverride('GROUNDING');
  });

  // T-GA01: disabled — record() is no-op, getStats() returns zeros
  it('T-GA01: disabled — record is no-op, getStats returns zeros', () => {
    featureFlags.setOverride('GROUNDING', false);
    groundingAnalytics.record({ correlationId: 'c1', score: 0.8, timestamp: 1 });
    const stats = groundingAnalytics.getStats();
    assert.strictEqual(stats.totalChecked, 0);
    assert.strictEqual(stats.avgScore, 0);
    assert.strictEqual(stats.lowRate, 0);
  });

  // T-GA02: enabled — record single entry → getStats reflects it
  it('T-GA02: enabled — record single entry reflects in getStats', () => {
    featureFlags.setOverride('GROUNDING', true);
    groundingAnalytics.record({ correlationId: 'c1', score: 0.75, timestamp: 1000 });
    const stats = groundingAnalytics.getStats();
    assert.strictEqual(stats.totalChecked, 1);
    assert.strictEqual(stats.avgScore, 0.75);
    assert.strictEqual(stats.checkedWithScore, 1);
  });

  // T-GA03: enabled — record multiple entries → avgScore calculated correctly
  it('T-GA03: enabled — multiple entries avgScore correct', () => {
    featureFlags.setOverride('GROUNDING', true);
    groundingAnalytics.record({ correlationId: 'c1', score: 0.8, timestamp: 1 });
    groundingAnalytics.record({ correlationId: 'c2', score: 0.6, timestamp: 2 });
    const stats = groundingAnalytics.getStats();
    assert.strictEqual(stats.totalChecked, 2);
    assert.strictEqual(stats.avgScore, 0.7);
  });

  // T-GA04: enabled — record low-score entry → lowRate reflects it
  it('T-GA04: enabled — low score entry increases lowRate', () => {
    featureFlags.setOverride('GROUNDING', true);
    groundingAnalytics.record({ correlationId: 'c1', score: 0.2, timestamp: 1 }); // below 0.4
    groundingAnalytics.record({ correlationId: 'c2', score: 0.9, timestamp: 2 }); // above 0.4
    const stats = groundingAnalytics.getStats();
    assert.strictEqual(stats.lowRate, 0.5);
  });

  // T-GA05: enabled — ring buffer eviction when maxEntries exceeded
  it('T-GA05: enabled — ring buffer eviction', () => {
    featureFlags.setOverride('GROUNDING', true);
    // Default maxEntries is 200
    for (let i = 0; i < 210; i++) {
      groundingAnalytics.record({ correlationId: `c${i}`, score: 0.5, timestamp: i });
    }
    const stats = groundingAnalytics.getStats();
    assert.strictEqual(stats.totalChecked, 210);
    assert.strictEqual(stats.checkedWithScore, 200); // ring buffer capped
  });

  // T-GA06: enabled — getRecentScores returns entries in reverse chronological order
  it('T-GA06: enabled — getRecentScores reverse chronological', () => {
    featureFlags.setOverride('GROUNDING', true);
    groundingAnalytics.record({ correlationId: 'c1', score: 0.5, timestamp: 100 });
    groundingAnalytics.record({ correlationId: 'c2', score: 0.6, timestamp: 200 });
    groundingAnalytics.record({ correlationId: 'c3', score: 0.7, timestamp: 300 });
    const recent = groundingAnalytics.getRecentScores(10);
    assert.strictEqual(recent.length, 3);
    assert.strictEqual(recent[0].correlationId, 'c3'); // newest first
    assert.strictEqual(recent[2].correlationId, 'c1'); // oldest last
  });

  // T-GA07: enabled — getRecentScores respects limit parameter
  it('T-GA07: enabled — getRecentScores respects limit', () => {
    featureFlags.setOverride('GROUNDING', true);
    for (let i = 0; i < 10; i++) {
      groundingAnalytics.record({ correlationId: `c${i}`, score: 0.5, timestamp: i });
    }
    const recent = groundingAnalytics.getRecentScores(3);
    assert.strictEqual(recent.length, 3);
  });

  // T-GA08: enabled — scoreDistribution buckets calculated correctly
  it('T-GA08: enabled — scoreDistribution buckets correct', () => {
    featureFlags.setOverride('GROUNDING', true);
    groundingAnalytics.record({ correlationId: 'c1', score: 0.1, timestamp: 1 }); // veryLow
    groundingAnalytics.record({ correlationId: 'c2', score: 0.3, timestamp: 2 }); // low
    groundingAnalytics.record({ correlationId: 'c3', score: 0.5, timestamp: 3 }); // medium
    groundingAnalytics.record({ correlationId: 'c4', score: 0.7, timestamp: 4 }); // high
    groundingAnalytics.record({ correlationId: 'c5', score: 0.9, timestamp: 5 }); // veryHigh
    const stats = groundingAnalytics.getStats();
    assert.strictEqual(stats.scoreDistribution.veryLow, 1);
    assert.strictEqual(stats.scoreDistribution.low, 1);
    assert.strictEqual(stats.scoreDistribution.medium, 1);
    assert.strictEqual(stats.scoreDistribution.high, 1);
    assert.strictEqual(stats.scoreDistribution.veryHigh, 1);
  });

  // T-GA09: counts() returns { enabled, totalChecked, avgScore }
  it('T-GA09: counts returns correct structure', () => {
    const c = groundingAnalytics.counts();
    assert.ok('enabled' in c);
    assert.ok('totalChecked' in c);
    assert.ok('avgScore' in c);
    assert.strictEqual(typeof c.enabled, 'boolean');
    assert.strictEqual(typeof c.totalChecked, 'number');
    assert.strictEqual(typeof c.avgScore, 'number');
  });

  // T-GA10: reset() clears all state
  it('T-GA10: reset clears all state', () => {
    featureFlags.setOverride('GROUNDING', true);
    groundingAnalytics.record({ correlationId: 'c1', score: 0.8, timestamp: 1 });
    assert.strictEqual(groundingAnalytics.counts().totalChecked, 1);
    groundingAnalytics.reset();
    assert.strictEqual(groundingAnalytics.counts().totalChecked, 0);
    assert.strictEqual(groundingAnalytics.getStats().totalChecked, 0);
    assert.strictEqual(groundingAnalytics.getRecentScores().length, 0);
  });
});
