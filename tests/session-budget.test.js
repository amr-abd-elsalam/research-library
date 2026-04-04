// tests/session-budget.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 52 — SessionBudgetTracker unit tests
// Tests check() structure, record() + check() flow, unlimited
// budget (maxTokensPerSession=0), counts() introspection,
// reset lifecycle, and multi-session independence.
// Uses singleton + reset() pattern.
// ═══════════════════════════════════════════════════════════════

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { sessionBudget } from '../server/services/sessionBudget.js';

describe('SessionBudgetTracker', () => {

  afterEach(() => {
    sessionBudget.reset();
  });

  // T-SB01: check() with no session tracked → exceeded: false
  it('T-SB01: check with no session tracked returns exceeded false', () => {
    const result = sessionBudget.check('nonexistent-session');
    assert.strictEqual(result.exceeded, false);
  });

  // T-SB02: check() returns correct structure shape
  it('T-SB02: check returns correct structure shape', () => {
    const result = sessionBudget.check('test-session');
    assert.ok('exceeded' in result, 'should have exceeded key');
    assert.ok('usage' in result, 'should have usage key');
    assert.ok('limit' in result, 'should have limit key');
    assert.strictEqual(typeof result.exceeded, 'boolean');
    assert.strictEqual(typeof result.limit, 'number');
  });

  // T-SB03: counts() returns correct structure with expected keys
  it('T-SB03: counts returns correct structure', () => {
    const c = sessionBudget.counts();
    assert.ok('trackedSessions' in c, 'should have trackedSessions');
    assert.ok('maxTokensPerSession' in c, 'should have maxTokensPerSession');
    assert.strictEqual(typeof c.trackedSessions, 'number');
    assert.strictEqual(typeof c.maxTokensPerSession, 'number');
  });

  // T-SB04: reset() clears all tracked sessions
  it('T-SB04: reset clears all tracked sessions', () => {
    sessionBudget.record('sess-1', { embedding: 100, input: 200, output: 300 });
    sessionBudget.record('sess-2', { embedding: 50 });
    assert.strictEqual(sessionBudget.size, 2);

    sessionBudget.reset();
    assert.strictEqual(sessionBudget.size, 0);
  });

  // T-SB05: reset() then counts shows zero tracked sessions
  it('T-SB05: reset then counts shows zero tracked sessions', () => {
    sessionBudget.record('sess-1', { input: 100 });
    sessionBudget.reset();
    const c = sessionBudget.counts();
    assert.strictEqual(c.trackedSessions, 0);
  });

  // T-SB06: check() with maxTokensPerSession = 0 (config default) → never exceeded
  it('T-SB06: check with maxTokensPerSession=0 (unlimited) → never exceeded', () => {
    // Record a large amount of tokens
    sessionBudget.record('sess-big', { embedding: 50000, input: 50000, output: 50000 });
    const result = sessionBudget.check('sess-big');
    assert.strictEqual(result.exceeded, false, 'unlimited budget should never be exceeded');
    assert.strictEqual(result.limit, 0, 'limit should be 0 (unlimited)');
  });

  // T-SB07: multiple sessions tracked independently
  it('T-SB07: multiple sessions tracked independently', () => {
    sessionBudget.record('sess-A', { input: 100 });
    sessionBudget.record('sess-B', { input: 200 });
    sessionBudget.record('sess-A', { input: 50 });

    const infoA = sessionBudget.get('sess-A');
    const infoB = sessionBudget.get('sess-B');

    assert.notStrictEqual(infoA, null);
    assert.notStrictEqual(infoB, null);
    assert.strictEqual(infoA.totalTokens, 150, 'sess-A should have 100 + 50 = 150 tokens');
    assert.strictEqual(infoB.totalTokens, 200, 'sess-B should have 200 tokens');
    assert.strictEqual(infoA.turnCount, 2, 'sess-A should have 2 turns');
    assert.strictEqual(infoB.turnCount, 1, 'sess-B should have 1 turn');
  });

  // T-SB08: counts() reflects number of tracked sessions
  it('T-SB08: counts reflects number of tracked sessions', () => {
    assert.strictEqual(sessionBudget.counts().trackedSessions, 0);
    sessionBudget.record('sess-1', { input: 10 });
    assert.strictEqual(sessionBudget.counts().trackedSessions, 1);
    sessionBudget.record('sess-2', { input: 20 });
    assert.strictEqual(sessionBudget.counts().trackedSessions, 2);
    // Same session again — should not increase count
    sessionBudget.record('sess-1', { input: 30 });
    assert.strictEqual(sessionBudget.counts().trackedSessions, 2);
  });

});
