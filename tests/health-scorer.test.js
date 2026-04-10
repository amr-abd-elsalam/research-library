// tests/health-scorer.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 48 — LibraryHealthScorer unit tests
// Tests disabled→enabled toggle via FeatureFlags, compute() return
// structure (score/level/breakdown/actionItems), score range 0-100,
// level enum, and cache invalidation.
// Uses the singleton instance + featureFlags.setOverride().
// Config default: HEALTH_SCORE.enabled = false.
// When enabled with empty singletons, compute() uses fallback values.
// ═══════════════════════════════════════════════════════════════

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { libraryHealthScorer } from '../server/services/libraryHealthScorer.js';
import { featureFlags } from '../server/services/featureFlags.js';

describe('LibraryHealthScorer', () => {

  afterEach(() => {
    featureFlags.clearOverride('HEALTH_SCORE');
    libraryHealthScorer.invalidateCache();
  });

  // T-HS01: compute() returns non-null when HEALTH_SCORE enabled (Phase 97: enabled by default)
  it('T-HS01: compute returns non-null when HEALTH_SCORE enabled', () => {
    const result = libraryHealthScorer.compute();
    assert.notStrictEqual(result, null, 'should return score object when enabled');
    assert.strictEqual(typeof result.score, 'number');
  });

  // T-HS02: enabled getter returns true with default config (Phase 97)
  it('T-HS02: enabled returns true with default config', () => {
    assert.strictEqual(libraryHealthScorer.enabled, true);
  });

  // T-HS03: counts() returns object with enabled field
  it('T-HS03: counts returns object with enabled field', () => {
    const c = libraryHealthScorer.counts();
    assert.ok('enabled' in c, 'should have enabled key');
    assert.strictEqual(typeof c.enabled, 'boolean');
  });

  // T-HS04: invalidateCache() does not throw
  it('T-HS04: invalidateCache does not throw', () => {
    assert.doesNotThrow(() => {
      libraryHealthScorer.invalidateCache();
    });
  });

  // T-HS05: After setOverride('HEALTH_SCORE', true) — enabled returns true
  it('T-HS05: enabled returns true after setOverride HEALTH_SCORE true', () => {
    featureFlags.setOverride('HEALTH_SCORE', true);
    assert.strictEqual(libraryHealthScorer.enabled, true);
  });

  // T-HS06: After enabling — compute() returns non-null object
  it('T-HS06: compute returns non-null object when enabled', () => {
    featureFlags.setOverride('HEALTH_SCORE', true);
    const result = libraryHealthScorer.compute();
    assert.notStrictEqual(result, null);
    assert.strictEqual(typeof result, 'object');
  });

  // T-HS07: compute() result has score, level, breakdown, totalRequests, actionItems
  it('T-HS07: compute result has score, level, breakdown, totalRequests, actionItems', () => {
    featureFlags.setOverride('HEALTH_SCORE', true);
    const result = libraryHealthScorer.compute();
    assert.strictEqual(typeof result.score, 'number');
    assert.strictEqual(typeof result.level, 'string');
    assert.strictEqual(typeof result.breakdown, 'object');
    assert.strictEqual(typeof result.totalRequests, 'number');
    assert.ok(Array.isArray(result.actionItems), 'actionItems should be an array');
  });

  // T-HS08: compute() result score is number between 0 and 100 (inclusive)
  it('T-HS08: compute result score is between 0 and 100', () => {
    featureFlags.setOverride('HEALTH_SCORE', true);
    const result = libraryHealthScorer.compute();
    assert.ok(result.score >= 0, `score ${result.score} should be >= 0`);
    assert.ok(result.score <= 100, `score ${result.score} should be <= 100`);
  });

  // T-HS09: compute() result level is one of 'critical', 'warning', 'healthy'
  it('T-HS09: compute result level is one of critical, warning, healthy', () => {
    featureFlags.setOverride('HEALTH_SCORE', true);
    const result = libraryHealthScorer.compute();
    const validLevels = ['critical', 'warning', 'healthy'];
    assert.ok(
      validLevels.includes(result.level),
      `level '${result.level}' should be one of: ${validLevels.join(', ')}`
    );
  });

  // T-HS10: After setOverride('HEALTH_SCORE', false) — compute() returns null
  it('T-HS10: compute returns null after setOverride HEALTH_SCORE false', () => {
    // Phase 97: HEALTH_SCORE enabled by default — explicitly disable
    featureFlags.setOverride('HEALTH_SCORE', false);
    libraryHealthScorer.invalidateCache();
    const disabled = libraryHealthScorer.compute();
    assert.strictEqual(disabled, null, 'should return null when disabled');

    featureFlags.clearOverride('HEALTH_SCORE');
    libraryHealthScorer.invalidateCache();
    const enabled = libraryHealthScorer.compute();
    assert.notStrictEqual(enabled, null, 'should be non-null after re-enabling');
  });

  // T-HS11: compute(libraryId) returns valid score object (Phase 61)
  it('T-HS11: compute with libraryId returns valid score', () => {
    featureFlags.setOverride('HEALTH_SCORE', true);
    const result = libraryHealthScorer.compute('lib-test');
    assert.notStrictEqual(result, null);
    assert.strictEqual(typeof result.score, 'number');
    assert.ok(result.score >= 0 && result.score <= 100);
  });

  // T-HS12: compute() without libraryId returns global score (backward compatible) (Phase 61)
  it('T-HS12: compute without libraryId returns global score', () => {
    featureFlags.setOverride('HEALTH_SCORE', true);
    const global = libraryHealthScorer.compute();
    const perLib = libraryHealthScorer.compute('nonexistent-lib');
    assert.notStrictEqual(global, null);
    assert.notStrictEqual(perLib, null);
    // Both should be valid score objects
    assert.strictEqual(typeof global.score, 'number');
    assert.strictEqual(typeof perLib.score, 'number');
  });

});
