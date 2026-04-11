// tests/budget-enforcement.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 77 — Pipeline Budget Enforcement Tests
// Tests stageBudgetCheck, isSessionOverBudget, enforcementEnabled.
// No network calls — tests structure and behavior only.
// ═══════════════════════════════════════════════════════════════

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { CostGovernor } from '../server/services/costGovernor.js';
import { stageBudgetCheck } from '../server/services/pipeline.js';

// ═══════════════════════════════════════════════════════════════
// Block 1: stageBudgetCheck Behavior
// ═══════════════════════════════════════════════════════════════
describe('stageBudgetCheck Behavior', () => {

  // T-BE01: stageBudgetCheck is a function
  it('T-BE01: stageBudgetCheck is a function', () => {
    assert.strictEqual(typeof stageBudgetCheck, 'function');
  });

  // T-BE02: stageBudgetCheck skips when enforcement disabled (default)
  it('T-BE02: stageBudgetCheck skips when enforcement disabled', async () => {
    // Default config: COST_GOVERNANCE.enabled = false, enforceBudget = false
    const ctx = { sessionId: 'test-session', aborted: false, abortReason: null };
    const result = await stageBudgetCheck(ctx, null);
    assert.strictEqual(result._budgetSkipped, true);
    assert.strictEqual(result.aborted, false);
    assert.strictEqual(result.abortReason, null);
  });

  // T-BE03: stageBudgetCheck returns ctx
  it('T-BE03: stageBudgetCheck returns ctx object', async () => {
    const ctx = { sessionId: 'test-session', aborted: false, abortReason: null };
    const result = await stageBudgetCheck(ctx, null);
    assert.strictEqual(result, ctx, 'should return same ctx object');
  });

  // T-BE04: stageBudgetCheck does not set aborted when skipped
  it('T-BE04: stageBudgetCheck does not abort when skipped', async () => {
    const ctx = { sessionId: 's1', aborted: false, abortReason: null };
    await stageBudgetCheck(ctx, null);
    assert.strictEqual(ctx.aborted, false);
    assert.strictEqual(ctx.abortReason, null);
  });

  // T-BE05: stageBudgetCheck handles null sessionId
  it('T-BE05: stageBudgetCheck handles null sessionId gracefully', async () => {
    const ctx = { sessionId: null, aborted: false, abortReason: null };
    const result = await stageBudgetCheck(ctx, null);
    assert.strictEqual(result._budgetSkipped, true);
    assert.strictEqual(result.aborted, false);
  });

  // T-BE06: stageBudgetCheck handles undefined sessionId
  it('T-BE06: stageBudgetCheck handles undefined sessionId', async () => {
    const ctx = { aborted: false, abortReason: null };
    const result = await stageBudgetCheck(ctx, null);
    assert.strictEqual(result._budgetSkipped, true);
    assert.strictEqual(result.aborted, false);
  });

  // T-BE07: stageBudgetCheck is async
  it('T-BE07: stageBudgetCheck returns a Promise', () => {
    const ctx = { sessionId: 's1', aborted: false, abortReason: null };
    const result = stageBudgetCheck(ctx, null);
    assert.ok(result instanceof Promise, 'should return a Promise');
  });
});

// ═══════════════════════════════════════════════════════════════
// Block 2: isSessionOverBudget Method
// ═══════════════════════════════════════════════════════════════
describe('isSessionOverBudget Method', () => {

  // T-BE08: isSessionOverBudget is a function
  it('T-BE08: isSessionOverBudget is a function', () => {
    const instance = new CostGovernor();
    assert.strictEqual(typeof instance.isSessionOverBudget, 'function');
  });

  // T-BE09: returns { overBudget: false } when enforcement disabled (default)
  it('T-BE09: returns overBudget false when enforcement disabled', () => {
    const instance = new CostGovernor();
    const result = instance.isSessionOverBudget('test-session');
    assert.strictEqual(result.overBudget, false);
    assert.strictEqual(typeof result.currentTokens, 'number');
    assert.strictEqual(typeof result.limit, 'number');
    assert.strictEqual(typeof result.ratio, 'number');
  });

  // T-BE10: returns correct shape { overBudget, currentTokens, limit, ratio }
  it('T-BE10: returns correct shape', () => {
    const instance = new CostGovernor();
    const result = instance.isSessionOverBudget('s1');
    assert.ok('overBudget' in result, 'should have overBudget');
    assert.ok('currentTokens' in result, 'should have currentTokens');
    assert.ok('limit' in result, 'should have limit');
    assert.ok('ratio' in result, 'should have ratio');
  });

  // T-BE11: returns { overBudget: false } for null sessionId
  it('T-BE11: returns overBudget false for null sessionId', () => {
    const instance = new CostGovernor();
    const result = instance.isSessionOverBudget(null);
    assert.strictEqual(result.overBudget, false);
  });

  // T-BE12: returns { overBudget: false } for empty string sessionId
  it('T-BE12: returns overBudget false for empty string', () => {
    const instance = new CostGovernor();
    const result = instance.isSessionOverBudget('');
    assert.strictEqual(result.overBudget, false);
  });
});

// ═══════════════════════════════════════════════════════════════
// Block 3: enforcementEnabled Getter
// ═══════════════════════════════════════════════════════════════
describe('enforcementEnabled Getter', () => {

  // T-BE13: enforcementEnabled is a getter that returns boolean
  it('T-BE13: enforcementEnabled returns boolean', () => {
    const instance = new CostGovernor();
    assert.strictEqual(typeof instance.enforcementEnabled, 'boolean');
  });

  // T-BE14: enforcementEnabled returns false when COST_GOVERNANCE.enabled is false (default)
  it('T-BE14: enforcementEnabled defaults to false', () => {
    const instance = new CostGovernor();
    assert.strictEqual(instance.enforcementEnabled, false);
  });

  // T-BE15: enforcementEnabled false even when enabled is true (enforceBudget: false)
  it('T-BE15: enforcementEnabled false when enforceBudget is false', () => {
    const instance = new CostGovernor();
    // Phase 101: enabled = true, but enforceBudget = false → enforcementEnabled must be false
    assert.strictEqual(instance.enabled, true);
    assert.strictEqual(instance.enforcementEnabled, false);
  });
});

// ═══════════════════════════════════════════════════════════════
// Block 4: getTopSessions Method
// ═══════════════════════════════════════════════════════════════
describe('getTopSessions Method', () => {

  // T-BE16: getTopSessions is a function
  it('T-BE16: getTopSessions is a function', () => {
    const instance = new CostGovernor();
    assert.strictEqual(typeof instance.getTopSessions, 'function');
  });

  // T-BE17: getTopSessions returns array
  it('T-BE17: getTopSessions returns empty array when no data', () => {
    const instance = new CostGovernor();
    const result = instance.getTopSessions();
    assert.ok(Array.isArray(result), 'should return array');
    assert.strictEqual(result.length, 0);
  });

  // T-BE18: getTopSessions respects limit parameter
  it('T-BE18: getTopSessions returns empty array for fresh instance', () => {
    const instance = new CostGovernor();
    instance.reset();
    const result = instance.getTopSessions(3);
    assert.ok(Array.isArray(result));
    assert.strictEqual(result.length, 0);
  });
});
