// tests/phase101-feature-activation.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 101 — Feature Activation Tests
// Verifies ANSWER_REFINEMENT + COST_GOVERNANCE are enabled by default,
// their singletons behave correctly, and config validator produces 0 warnings.
// ═══════════════════════════════════════════════════════════════

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import config from '../config.js';
import { featureFlags } from '../server/services/featureFlags.js';
import { costGovernor } from '../server/services/costGovernor.js';
import { configValidator } from '../server/services/configValidator.js';
import { refinementAnalytics } from '../server/services/refinementAnalytics.js';

// ═══════════════════════════════════════════════════════════════
// Block 1: Config Defaults (T-FA01 to T-FA04)
// ═══════════════════════════════════════════════════════════════
describe('Phase 101 — Config Defaults', () => {

  // T-FA01: ANSWER_REFINEMENT.enabled is true by default
  it('T-FA01: config.ANSWER_REFINEMENT.enabled is true', () => {
    assert.strictEqual(config.ANSWER_REFINEMENT.enabled, true);
  });

  // T-FA02: streamingRevisionEnabled is still false
  it('T-FA02: config.ANSWER_REFINEMENT.streamingRevisionEnabled is false', () => {
    assert.strictEqual(config.ANSWER_REFINEMENT.streamingRevisionEnabled, false);
  });

  // T-FA03: COST_GOVERNANCE.enabled is true by default
  it('T-FA03: config.COST_GOVERNANCE.enabled is true', () => {
    assert.strictEqual(config.COST_GOVERNANCE.enabled, true);
  });

  // T-FA04: enforceBudget is still false (tracking only)
  it('T-FA04: config.COST_GOVERNANCE.enforceBudget is false', () => {
    assert.strictEqual(config.COST_GOVERNANCE.enforceBudget, false);
  });
});

// ═══════════════════════════════════════════════════════════════
// Block 2: ANSWER_REFINEMENT Singleton Behavior (T-FA05 to T-FA09)
// ═══════════════════════════════════════════════════════════════
describe('Phase 101 — ANSWER_REFINEMENT Singleton', () => {

  // T-FA05: featureFlags.isEnabled('ANSWER_REFINEMENT') returns true
  it('T-FA05: featureFlags.isEnabled ANSWER_REFINEMENT is true', () => {
    assert.strictEqual(featureFlags.isEnabled('ANSWER_REFINEMENT'), true);
  });

  // T-FA06: GROUNDING also enabled (dependency)
  it('T-FA06: GROUNDING is enabled (dependency for ANSWER_REFINEMENT)', () => {
    assert.strictEqual(featureFlags.isEnabled('GROUNDING'), true);
  });

  // T-FA07: maxRefinements is 1
  it('T-FA07: ANSWER_REFINEMENT.maxRefinements is 1', () => {
    assert.strictEqual(config.ANSWER_REFINEMENT.maxRefinements, 1);
  });

  // T-FA08: minScoreToRetry is 0.3
  it('T-FA08: ANSWER_REFINEMENT.minScoreToRetry is 0.3', () => {
    assert.strictEqual(config.ANSWER_REFINEMENT.minScoreToRetry, 0.3);
  });

  // T-FA09: refinementAnalytics singleton accessible
  it('T-FA09: refinementAnalytics singleton exists', () => {
    assert.ok(refinementAnalytics, 'refinementAnalytics should exist');
    assert.strictEqual(typeof refinementAnalytics.counts, 'function');
  });
});

// ═══════════════════════════════════════════════════════════════
// Block 3: COST_GOVERNANCE Singleton Behavior (T-FA10 to T-FA13)
// ═══════════════════════════════════════════════════════════════
describe('Phase 101 — COST_GOVERNANCE Singleton', () => {

  // T-FA10: featureFlags.isEnabled('COST_GOVERNANCE') returns true
  it('T-FA10: featureFlags.isEnabled COST_GOVERNANCE is true', () => {
    assert.strictEqual(featureFlags.isEnabled('COST_GOVERNANCE'), true);
  });

  // T-FA11: costGovernor.enabled is true
  it('T-FA11: costGovernor.enabled is true', () => {
    assert.strictEqual(costGovernor.enabled, true);
  });

  // T-FA12: enforcementEnabled is false (tracking only)
  it('T-FA12: costGovernor.enforcementEnabled is false', () => {
    assert.strictEqual(costGovernor.enforcementEnabled, false);
  });

  // T-FA13: global usage starts at 0
  it('T-FA13: costGovernor global usage starts at zero', () => {
    const usage = costGovernor.getGlobalUsage();
    assert.strictEqual(typeof usage.totalCost, 'number');
    assert.strictEqual(typeof usage.requests, 'number');
  });
});

// ═══════════════════════════════════════════════════════════════
// Block 4: Config Validator Integration (T-FA14 to T-FA16)
// ═══════════════════════════════════════════════════════════════
describe('Phase 101 — Config Validator', () => {

  // T-FA14: validator reports 0 warnings with current defaults
  it('T-FA14: configValidator reports 0 warnings', () => {
    const result = configValidator.validate();
    assert.strictEqual(result.warnings.length, 0, `Unexpected warnings: ${result.warnings.join('; ')}`);
  });

  // T-FA15: validator reports 0 errors
  it('T-FA15: configValidator reports 0 errors', () => {
    const result = configValidator.validate();
    assert.strictEqual(result.errors.length, 0, `Unexpected errors: ${result.errors.join('; ')}`);
  });

  // T-FA16: validator.valid is true
  it('T-FA16: configValidator.valid is true', () => {
    const result = configValidator.validate();
    assert.strictEqual(result.valid, true);
  });
});

// ═══════════════════════════════════════════════════════════════
// Block 5: Feature Counts (T-FA17 to T-FA20)
// ═══════════════════════════════════════════════════════════════
describe('Phase 101 — Feature Counts', () => {

  // T-FA17: featureFlags has 15 managed sections (unchanged)
  it('T-FA17: featureFlags has 15 managed sections', () => {
    const status = featureFlags.getStatus();
    assert.strictEqual(status.length, 15);
  });

  // T-FA18: ANSWER_REFINEMENT appears in getStatus with effective=true
  it('T-FA18: ANSWER_REFINEMENT effective is true in getStatus', () => {
    const status = featureFlags.getStatus();
    const ar = status.find(s => s.section === 'ANSWER_REFINEMENT');
    assert.ok(ar, 'ANSWER_REFINEMENT should be in getStatus');
    assert.strictEqual(ar.effective, true);
    assert.strictEqual(ar.configValue, true);
  });

  // T-FA19: COST_GOVERNANCE appears in getStatus with effective=true
  it('T-FA19: COST_GOVERNANCE effective is true in getStatus', () => {
    const status = featureFlags.getStatus();
    const cg = status.find(s => s.section === 'COST_GOVERNANCE');
    assert.ok(cg, 'COST_GOVERNANCE should be in getStatus');
    assert.strictEqual(cg.effective, true);
    assert.strictEqual(cg.configValue, true);
  });

  // T-FA20: configValidator still has 15 rules
  it('T-FA20: configValidator has 15 rules', () => {
    const counts = configValidator.counts();
    assert.strictEqual(counts.totalRules, 15);
  });
});
