// tests/pipeline-analytics.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 48 — PipelineAnalytics unit tests
// Tests disabled-path guards (adaptiveEnabled: false by default):
// digest → null, recommendations → [], adaptiveOverrides → null.
// Also tests internal accumulation (_recordCompletion/_recordStageCompletion)
// does not throw when disabled, counts() structure, and reset().
// Uses the singleton instance with reset() for cleanup.
// ═══════════════════════════════════════════════════════════════

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { pipelineAnalytics } from '../server/services/pipelineAnalytics.js';

describe('PipelineAnalytics', () => {

  afterEach(() => {
    pipelineAnalytics.reset();
  });

  // T-PA01: digest() returns null when adaptiveEnabled is false (default)
  it('T-PA01: digest returns null when adaptiveEnabled is false', () => {
    const result = pipelineAnalytics.digest();
    assert.strictEqual(result, null);
  });

  // T-PA02: recommendations() returns empty array when disabled
  it('T-PA02: recommendations returns empty array when disabled', () => {
    const result = pipelineAnalytics.recommendations();
    assert.ok(Array.isArray(result), 'should be an array');
    assert.strictEqual(result.length, 0);
  });

  // T-PA03: adaptiveOverrides() returns null when disabled
  it('T-PA03: adaptiveOverrides returns null when disabled', () => {
    const result = pipelineAnalytics.adaptiveOverrides();
    assert.strictEqual(result, null);
  });

  // T-PA04: counts() returns object with enabled, digestAge, recommendationCount, lastComputedAt
  it('T-PA04: counts returns object with expected keys', () => {
    const c = pipelineAnalytics.counts();
    assert.ok('enabled' in c, 'should have enabled key');
    assert.ok('digestAge' in c, 'should have digestAge key');
    assert.ok('recommendationCount' in c, 'should have recommendationCount key');
    assert.ok('lastComputedAt' in c, 'should have lastComputedAt key');
  });

  // T-PA05: counts().enabled is false with default config
  it('T-PA05: counts().enabled is false with default config', () => {
    const c = pipelineAnalytics.counts();
    assert.strictEqual(c.enabled, false);
  });

  // T-PA06: _recordCompletion() with valid data — no throw when disabled
  it('T-PA06: _recordCompletion with valid data does not throw when disabled', () => {
    assert.doesNotThrow(() => {
      pipelineAnalytics._recordCompletion({ totalMs: 100, avgScore: 0.8 });
    });
  });

  // T-PA07: _recordStageCompletion() with valid data — no throw when disabled
  it('T-PA07: _recordStageCompletion with valid data does not throw when disabled', () => {
    assert.doesNotThrow(() => {
      pipelineAnalytics._recordStageCompletion({ stageName: 'stageSearch', durationMs: 50 });
    });
  });

  // T-PA08: _recordCompletion() with null/undefined data — no throw (defensive)
  it('T-PA08: _recordCompletion with null/undefined does not throw', () => {
    assert.doesNotThrow(() => {
      pipelineAnalytics._recordCompletion(null);
    });
    assert.doesNotThrow(() => {
      pipelineAnalytics._recordCompletion(undefined);
    });
  });

  // T-PA09: _recordStageCompletion() with missing stageName — no throw (defensive)
  it('T-PA09: _recordStageCompletion with missing stageName does not throw', () => {
    assert.doesNotThrow(() => {
      pipelineAnalytics._recordStageCompletion({});
    });
    assert.doesNotThrow(() => {
      pipelineAnalytics._recordStageCompletion({ durationMs: 50 });
    });
  });

  // T-PA10: reset() — after reset, counts shows clean state
  it('T-PA10: reset clears state — counts shows digestAge null and recommendationCount 0', () => {
    pipelineAnalytics._recordCompletion({ totalMs: 1 });
    pipelineAnalytics.reset();
    const c = pipelineAnalytics.counts();
    assert.strictEqual(c.digestAge, null);
    assert.strictEqual(c.recommendationCount, 0);
    assert.strictEqual(c.lastComputedAt, null);
  });

});
