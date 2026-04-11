// tests/semantic-matching-activation.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 102 — SEMANTIC_MATCHING Activation Tests
// Verifies that SEMANTIC_MATCHING is enabled by default,
// feature flags reflect the change, config values are correct,
// dependencies are satisfied, and groundingAnalytics getStats works.
// ═══════════════════════════════════════════════════════════════

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import config from '../config.js';
import { featureFlags } from '../server/services/featureFlags.js';
import { configValidator } from '../server/services/configValidator.js';
import { GroundingAnalytics } from '../server/services/groundingAnalytics.js';

// ── Cleanup ───────────────────────────────────────────────────
afterEach(() => {
  featureFlags.clearOverride('SEMANTIC_MATCHING');
  configValidator.reset();
});

// ═══════════════════════════════════════════════════════════════
// Block 1: Config Defaults (4 tests)
// ═══════════════════════════════════════════════════════════════
describe('SEMANTIC_MATCHING Config Defaults (Phase 102)', () => {

  // T-SMA01: config.SEMANTIC_MATCHING.enabled is true by default
  it('T-SMA01: SEMANTIC_MATCHING.enabled is true', () => {
    assert.strictEqual(config.SEMANTIC_MATCHING.enabled, true, 'SEMANTIC_MATCHING should be enabled by default');
  });

  // T-SMA02: config.SEMANTIC_MATCHING.tokenWeight is 0.5
  it('T-SMA02: tokenWeight is 0.5', () => {
    assert.strictEqual(config.SEMANTIC_MATCHING.tokenWeight, 0.5);
  });

  // T-SMA03: config.SEMANTIC_MATCHING.semanticWeight is 0.5
  it('T-SMA03: semanticWeight is 0.5', () => {
    assert.strictEqual(config.SEMANTIC_MATCHING.semanticWeight, 0.5);
  });

  // T-SMA04: config.SEMANTIC_MATCHING.fallbackOnError is true
  it('T-SMA04: fallbackOnError is true', () => {
    assert.strictEqual(config.SEMANTIC_MATCHING.fallbackOnError, true);
  });
});

// ═══════════════════════════════════════════════════════════════
// Block 2: Feature Flags Integration (3 tests)
// ═══════════════════════════════════════════════════════════════
describe('SEMANTIC_MATCHING Feature Flags (Phase 102)', () => {

  // T-SMA05: featureFlags.isEnabled('SEMANTIC_MATCHING') returns true
  it('T-SMA05: isEnabled returns true', () => {
    assert.strictEqual(featureFlags.isEnabled('SEMANTIC_MATCHING'), true);
  });

  // T-SMA06: featureFlags status includes SEMANTIC_MATCHING with effective: true
  it('T-SMA06: getStatus includes SEMANTIC_MATCHING effective: true', () => {
    const status = featureFlags.getStatus();
    const sm = status.find(s => s.section === 'SEMANTIC_MATCHING');
    assert.ok(sm, 'SEMANTIC_MATCHING should be in status');
    assert.strictEqual(sm.effective, true);
    assert.strictEqual(sm.configValue, true);
    assert.strictEqual(sm.override, null);
  });

  // T-SMA07: 15 managed sections (count unchanged)
  it('T-SMA07: 15 managed sections', () => {
    assert.strictEqual(featureFlags.counts().sections, 15);
  });
});

// ═══════════════════════════════════════════════════════════════
// Block 3: Dependency Verification (3 tests)
// ═══════════════════════════════════════════════════════════════
describe('SEMANTIC_MATCHING Dependencies (Phase 102)', () => {

  // T-SMA08: GROUNDING.enabled is true (dependency satisfied)
  it('T-SMA08: GROUNDING.enabled is true', () => {
    assert.strictEqual(config.GROUNDING.enabled, true);
  });

  // T-SMA09: CITATION.enabled is true (dependency satisfied)
  it('T-SMA09: CITATION.enabled is true', () => {
    assert.strictEqual(config.CITATION.enabled, true);
  });

  // T-SMA10: SEMANTIC_MATCHING.batchSize is 20 (cost control)
  it('T-SMA10: batchSize is 20', () => {
    assert.strictEqual(config.SEMANTIC_MATCHING.batchSize, 20);
  });
});

// ═══════════════════════════════════════════════════════════════
// Block 4: Config Validator (4 tests)
// ═══════════════════════════════════════════════════════════════
describe('SEMANTIC_MATCHING ConfigValidator (Phase 102)', () => {

  // T-SMA11: configValidator has 15 rules (unchanged — rule already existed)
  it('T-SMA11: 15 total rules', () => {
    assert.strictEqual(configValidator.counts().totalRules, 15);
  });

  // T-SMA12: configValidator reports 0 errors with current defaults
  it('T-SMA12: 0 errors with current defaults', () => {
    const result = configValidator.validate();
    assert.strictEqual(result.errors.length, 0);
  });

  // T-SMA13: configValidator reports 0 warnings with current defaults
  it('T-SMA13: 0 warnings with current defaults', () => {
    const result = configValidator.validate();
    assert.strictEqual(result.warnings.length, 0);
  });

  // T-SMA14: SEMANTIC_MATCHING_requires_GROUNDING_or_CITATION rule exists
  it('T-SMA14: dependency rule exists in validator', () => {
    // The rule was already added in Phase 79 — verify it works
    // With both GROUNDING and CITATION enabled, no warning expected
    const result = configValidator.validate();
    const hasSmWarning = result.warnings.some(w => w.includes('SEMANTIC_MATCHING'));
    assert.strictEqual(hasSmWarning, false, 'no warning when dependencies are satisfied');
  });
});

// ═══════════════════════════════════════════════════════════════
// Block 5: GroundingAnalytics getStats (6 tests)
// ═══════════════════════════════════════════════════════════════
describe('GroundingAnalytics getStats (Phase 102)', () => {

  // T-SMA15: getStats() returns correct shape
  it('T-SMA15: getStats returns correct shape', () => {
    const ga = new GroundingAnalytics();
    const stats = ga.getStats();
    assert.strictEqual(typeof stats.avgScore, 'number');
    assert.strictEqual(typeof stats.totalChecked, 'number');
    assert.strictEqual(typeof stats.lowRate, 'number');
    assert.strictEqual(typeof stats.checkedWithScore, 'number');
    assert.strictEqual(typeof stats.scoreDistribution, 'object');
    assert.ok(Array.isArray(stats.recentScores));
  });

  // T-SMA16: getStats() with 0 entries returns zeroed distribution
  it('T-SMA16: 0 entries returns zeroed distribution', () => {
    const ga = new GroundingAnalytics();
    const stats = ga.getStats();
    assert.strictEqual(stats.totalChecked, 0);
    assert.strictEqual(stats.avgScore, 0);
    const d = stats.scoreDistribution;
    assert.strictEqual(d.veryLow, 0);
    assert.strictEqual(d.low, 0);
    assert.strictEqual(d.medium, 0);
    assert.strictEqual(d.high, 0);
    assert.strictEqual(d.veryHigh, 0);
  });

  // T-SMA17: getStats() classifies score >= 0.8 as veryHigh
  it('T-SMA17: score >= 0.8 classified as veryHigh', () => {
    const ga = new GroundingAnalytics();
    ga.record({ score: 0.85, timestamp: Date.now() });
    ga.record({ score: 0.95, timestamp: Date.now() });
    const stats = ga.getStats();
    assert.strictEqual(stats.scoreDistribution.veryHigh, 2);
  });

  // T-SMA18: getStats() classifies 0.6 <= score < 0.8 as high
  it('T-SMA18: score 0.6-0.79 classified as high', () => {
    const ga = new GroundingAnalytics();
    ga.record({ score: 0.65, timestamp: Date.now() });
    ga.record({ score: 0.75, timestamp: Date.now() });
    const stats = ga.getStats();
    assert.strictEqual(stats.scoreDistribution.high, 2);
  });

  // T-SMA19: getStats() classifies score < 0.2 as veryLow
  it('T-SMA19: score < 0.2 classified as veryLow', () => {
    const ga = new GroundingAnalytics();
    ga.record({ score: 0.1, timestamp: Date.now() });
    ga.record({ score: 0.15, timestamp: Date.now() });
    const stats = ga.getStats();
    assert.strictEqual(stats.scoreDistribution.veryLow, 2);
  });

  // T-SMA20: getStats() mixed scores distributed correctly
  it('T-SMA20: mixed scores distributed correctly', () => {
    const ga = new GroundingAnalytics();
    ga.record({ score: 0.1, timestamp: Date.now() });  // veryLow
    ga.record({ score: 0.3, timestamp: Date.now() });  // low
    ga.record({ score: 0.5, timestamp: Date.now() });  // medium
    ga.record({ score: 0.7, timestamp: Date.now() });  // high
    ga.record({ score: 0.9, timestamp: Date.now() });  // veryHigh
    const stats = ga.getStats();
    assert.strictEqual(stats.scoreDistribution.veryLow, 1);
    assert.strictEqual(stats.scoreDistribution.low, 1);
    assert.strictEqual(stats.scoreDistribution.medium, 1);
    assert.strictEqual(stats.scoreDistribution.high, 1);
    assert.strictEqual(stats.scoreDistribution.veryHigh, 1);
    assert.strictEqual(stats.checkedWithScore, 5);
  });
});
