// tests/cost-governor.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 76 — CostGovernor Singleton Tests
// Tests token usage tracking, cost calculation, threshold events.
// No network calls — tests structure and behavior only.
// ═══════════════════════════════════════════════════════════════

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { CostGovernor, costGovernor } from '../server/services/costGovernor.js';
import { EventBus } from '../server/services/eventBus.js';

// ═══════════════════════════════════════════════════════════════
// Block 1: CostGovernor Structure
// ═══════════════════════════════════════════════════════════════
describe('CostGovernor Structure', () => {

  // T-CG01: CostGovernor is constructable
  it('T-CG01: CostGovernor is constructable', () => {
    const instance = new CostGovernor();
    assert.ok(instance, 'should be constructable');
    assert.strictEqual(typeof instance.enabled, 'boolean');
  });

  // T-CG02: enabled returns false by default
  it('T-CG02: enabled returns false by default', () => {
    const instance = new CostGovernor();
    assert.strictEqual(instance.enabled, false);
  });

  // T-CG03: counts() returns expected shape
  it('T-CG03: counts() returns expected shape', () => {
    const instance = new CostGovernor();
    const c = instance.counts();
    assert.strictEqual(typeof c.enabled, 'boolean');
    assert.strictEqual(typeof c.activeSessions, 'number');
    assert.strictEqual(typeof c.trackedProviders, 'number');
    assert.ok('globalUsage' in c, 'should have globalUsage');
    assert.strictEqual(typeof c.globalUsage.inputTokens, 'number');
    assert.strictEqual(typeof c.globalUsage.outputTokens, 'number');
    assert.strictEqual(typeof c.globalUsage.requests, 'number');
    assert.strictEqual(typeof c.globalUsage.totalCost, 'number');
    assert.strictEqual(typeof c.monthlyBudgetCeiling, 'number');
  });

  // T-CG04: reset() clears all data
  it('T-CG04: reset() clears all data', () => {
    const instance = new CostGovernor();
    instance.reset();
    const c = instance.counts();
    assert.strictEqual(c.activeSessions, 0);
    assert.strictEqual(c.trackedProviders, 0);
    assert.strictEqual(c.globalUsage.requests, 0);
  });

  // T-CG05: getGlobalUsage() returns zero initial state
  it('T-CG05: getGlobalUsage() returns zero initial state', () => {
    const instance = new CostGovernor();
    const usage = instance.getGlobalUsage();
    assert.strictEqual(usage.inputTokens, 0);
    assert.strictEqual(usage.outputTokens, 0);
    assert.strictEqual(usage.requests, 0);
    assert.strictEqual(usage.totalCost, 0);
  });
});

// ═══════════════════════════════════════════════════════════════
// Block 2: Usage Recording
// ═══════════════════════════════════════════════════════════════
describe('CostGovernor Usage Recording', () => {

  // T-CG06: recordUsage does nothing when disabled
  it('T-CG06: recordUsage does nothing when disabled', () => {
    // Default config has enabled: false
    const instance = new CostGovernor();
    instance.recordUsage('session-1', { inputTokens: 100, outputTokens: 50 }, 'gemini');
    assert.strictEqual(instance.getSessionUsage('session-1'), null);
    assert.strictEqual(instance.getGlobalUsage().requests, 0);
  });

  // T-CG07: singleton exported correctly
  it('T-CG07: costGovernor singleton is CostGovernor instance', () => {
    assert.ok(costGovernor instanceof CostGovernor);
    assert.strictEqual(typeof costGovernor.enabled, 'boolean');
    assert.strictEqual(typeof costGovernor.recordUsage, 'function');
  });

  // T-CG08: getSessionUsage returns null for unknown session
  it('T-CG08: getSessionUsage returns null for unknown session', () => {
    const instance = new CostGovernor();
    assert.strictEqual(instance.getSessionUsage('nonexistent'), null);
  });

  // T-CG09: getSessionUsage returns null when sessionId is null
  it('T-CG09: getSessionUsage(null) returns null', () => {
    const instance = new CostGovernor();
    assert.strictEqual(instance.getSessionUsage(null), null);
  });

  // T-CG10: getProviderUsage returns null for unknown provider
  it('T-CG10: getProviderUsage returns null for unknown provider', () => {
    const instance = new CostGovernor();
    assert.strictEqual(instance.getProviderUsage('nonexistent'), null);
  });

  // T-CG11: getProviderUsage(null) returns null
  it('T-CG11: getProviderUsage(null) returns null', () => {
    const instance = new CostGovernor();
    assert.strictEqual(instance.getProviderUsage(null), null);
  });

  // T-CG12: getGlobalUsage returns copy (not reference)
  it('T-CG12: getGlobalUsage returns copy not reference', () => {
    const instance = new CostGovernor();
    const a = instance.getGlobalUsage();
    const b = instance.getGlobalUsage();
    assert.notStrictEqual(a, b, 'should be different references');
    assert.deepStrictEqual(a, b, 'but same values');
  });
});

// ═══════════════════════════════════════════════════════════════
// Block 3: Cost Calculation (using enabled-override pattern)
// We test via the singleton + manual #enabled override is not
// possible since it's private. Instead, test via a custom
// subclass or verify counts() shape.
// Since CostGovernor reads config at construction and config is
// frozen, we test behavior when disabled (default).
// ═══════════════════════════════════════════════════════════════
describe('CostGovernor Cost Calculation', () => {

  // T-CG13: recordUsage with zero tokens — no error
  it('T-CG13: recordUsage with zero tokens — no error when disabled', () => {
    const instance = new CostGovernor();
    // Should not throw even when disabled
    assert.doesNotThrow(() => {
      instance.recordUsage('s1', { inputTokens: 0, outputTokens: 0 }, 'gemini');
    });
  });

  // T-CG14: recordUsage with null sessionId — no error when disabled
  it('T-CG14: recordUsage with null sessionId — handles gracefully', () => {
    const instance = new CostGovernor();
    assert.doesNotThrow(() => {
      instance.recordUsage(null, { inputTokens: 100, outputTokens: 50 }, 'gemini');
    });
  });

  // T-CG15: recordUsage with missing tokens object — no error
  it('T-CG15: recordUsage with empty tokens — no error', () => {
    const instance = new CostGovernor();
    assert.doesNotThrow(() => {
      instance.recordUsage('s1', {}, 'gemini');
    });
  });

  // T-CG16: recordUsage with undefined tokens — no error
  it('T-CG16: recordUsage with undefined tokens — no error', () => {
    const instance = new CostGovernor();
    assert.doesNotThrow(() => {
      instance.recordUsage('s1', undefined, 'gemini');
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// Block 4: Edge Cases & counts() shape
// ═══════════════════════════════════════════════════════════════
describe('CostGovernor Edge Cases', () => {

  // T-CG17: counts() activeSessions is 0 when no usage recorded
  it('T-CG17: counts() activeSessions is 0 initially', () => {
    const instance = new CostGovernor();
    instance.reset();
    assert.strictEqual(instance.counts().activeSessions, 0);
  });

  // T-CG18: counts() trackedProviders is 0 when no usage recorded
  it('T-CG18: counts() trackedProviders is 0 initially', () => {
    const instance = new CostGovernor();
    instance.reset();
    assert.strictEqual(instance.counts().trackedProviders, 0);
  });

  // T-CG19: counts() monthlyBudgetCeiling matches config
  it('T-CG19: counts() monthlyBudgetCeiling matches config default', () => {
    const instance = new CostGovernor();
    assert.strictEqual(instance.counts().monthlyBudgetCeiling, 0);
  });

  // T-CG20: getSessionUsage returns copy (immutability)
  it('T-CG20: counts() enabled matches config default', () => {
    const instance = new CostGovernor();
    assert.strictEqual(instance.counts().enabled, false);
  });

  // T-CG21: isSessionOverBudget is a function
  it('T-CG21: isSessionOverBudget is a function', () => {
    const instance = new CostGovernor();
    assert.strictEqual(typeof instance.isSessionOverBudget, 'function');
  });

  // T-CG22: isSessionOverBudget returns correct shape
  it('T-CG22: isSessionOverBudget returns correct shape', () => {
    const instance = new CostGovernor();
    const result = instance.isSessionOverBudget('s1');
    assert.ok('overBudget' in result);
    assert.ok('currentTokens' in result);
    assert.ok('limit' in result);
    assert.ok('ratio' in result);
    assert.strictEqual(typeof result.overBudget, 'boolean');
    assert.strictEqual(typeof result.currentTokens, 'number');
    assert.strictEqual(typeof result.limit, 'number');
    assert.strictEqual(typeof result.ratio, 'number');
  });

  // T-CG23: enforcementEnabled getter returns boolean
  it('T-CG23: enforcementEnabled getter returns boolean', () => {
    const instance = new CostGovernor();
    assert.strictEqual(typeof instance.enforcementEnabled, 'boolean');
  });

  // T-CG24: enforcementEnabled is false by default
  it('T-CG24: enforcementEnabled is false by default', () => {
    const instance = new CostGovernor();
    assert.strictEqual(instance.enforcementEnabled, false);
  });

  // T-CG25: counts() includes enforcementEnabled field
  it('T-CG25: counts() includes enforcementEnabled field', () => {
    const instance = new CostGovernor();
    const c = instance.counts();
    assert.ok('enforcementEnabled' in c, 'counts should have enforcementEnabled');
    assert.strictEqual(typeof c.enforcementEnabled, 'boolean');
    assert.strictEqual(c.enforcementEnabled, false);
  });
});
