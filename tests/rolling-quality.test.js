// tests/rolling-quality.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 87 — Rolling Quality Score Unit Tests
// Tests ConversationContext.rollingAvgScore:
// exponential moving average computation, serialization, edge cases.
// No network calls — tests pure context logic.
// ═══════════════════════════════════════════════════════════════

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { conversationContext } from '../server/services/conversationContext.js';

// ── Cleanup ───────────────────────────────────────────────────
afterEach(() => {
  conversationContext.reset();
});

// ═══════════════════════════════════════════════════════════════
// Block 1: Rolling Average Computation (T-RQ01 to T-RQ06)
// ═══════════════════════════════════════════════════════════════
describe('Rolling Quality — Computation', () => {

  // T-RQ01: rollingAvgScore starts null for new session
  it('T-RQ01: rollingAvgScore starts null for new session', () => {
    const sessionId = 'rq01-' + Date.now();
    // Record a turn without avgScore
    conversationContext.recordTurn(sessionId, {
      message: 'test', response: 'response', queryType: 'factual', topicFilter: null,
    });
    const ctx = conversationContext.getContext(sessionId);
    assert.strictEqual(ctx.rollingAvgScore, null, 'rollingAvgScore should be null when no avgScore recorded');
  });

  // T-RQ02: first avgScore sets rollingAvgScore directly (seed value)
  it('T-RQ02: first avgScore seeds rollingAvgScore directly', () => {
    const sessionId = 'rq02-' + Date.now();
    conversationContext.recordTurn(sessionId, {
      message: 'test', response: 'response', queryType: 'factual', topicFilter: null,
      avgScore: 0.85,
    });
    const ctx = conversationContext.getContext(sessionId);
    assert.strictEqual(ctx.rollingAvgScore, 0.85, 'first avgScore should seed directly');
  });

  // T-RQ03: second avgScore applies exponential moving average
  it('T-RQ03: second avgScore applies EMA formula', () => {
    const sessionId = 'rq03-' + Date.now();
    conversationContext.recordTurn(sessionId, {
      message: 'test1', response: 'resp1', queryType: 'factual', topicFilter: null,
      avgScore: 0.80,
    });
    conversationContext.recordTurn(sessionId, {
      message: 'test2', response: 'resp2', queryType: 'factual', topicFilter: null,
      avgScore: 0.60,
    });
    const ctx = conversationContext.getContext(sessionId);
    // EMA: (1 - 0.3) * 0.80 + 0.3 * 0.60 = 0.56 + 0.18 = 0.74
    assert.strictEqual(ctx.rollingAvgScore, 0.74, 'should apply EMA formula');
  });

  // T-RQ04: rolling average converges toward consistent scores
  it('T-RQ04: rolling average converges toward consistent scores', () => {
    const sessionId = 'rq04-' + Date.now();
    // Start at 0.5, then consistent 0.9 scores — should converge toward 0.9
    conversationContext.recordTurn(sessionId, {
      message: 't', response: 'r', queryType: null, topicFilter: null,
      avgScore: 0.5,
    });
    for (let i = 0; i < 20; i++) {
      conversationContext.recordTurn(sessionId, {
        message: `t${i}`, response: `r${i}`, queryType: null, topicFilter: null,
        avgScore: 0.9,
      });
    }
    const ctx = conversationContext.getContext(sessionId);
    assert.ok(ctx.rollingAvgScore > 0.85, `should converge toward 0.9, got ${ctx.rollingAvgScore}`);
  });

  // T-RQ05: rolling average responds to quality drops (but dampened)
  it('T-RQ05: rolling average dampens quality drops', () => {
    const sessionId = 'rq05-' + Date.now();
    // Build up good quality
    for (let i = 0; i < 5; i++) {
      conversationContext.recordTurn(sessionId, {
        message: `t${i}`, response: `r${i}`, queryType: null, topicFilter: null,
        avgScore: 0.9,
      });
    }
    const ctxBefore = conversationContext.getContext(sessionId);
    const beforeScore = ctxBefore.rollingAvgScore;

    // Single bad turn
    conversationContext.recordTurn(sessionId, {
      message: 'bad', response: 'bad', queryType: null, topicFilter: null,
      avgScore: 0.2,
    });
    const ctxAfter = conversationContext.getContext(sessionId);

    // Rolling should drop but not to 0.2
    assert.ok(ctxAfter.rollingAvgScore > 0.5,
      `should be dampened above 0.5, got ${ctxAfter.rollingAvgScore}`);
    assert.ok(ctxAfter.rollingAvgScore < beforeScore,
      `should be lower than before (${beforeScore}), got ${ctxAfter.rollingAvgScore}`);
  });

  // T-RQ06: getContext() returns both lastAvgScore and rollingAvgScore
  it('T-RQ06: getContext() returns both lastAvgScore and rollingAvgScore', () => {
    const sessionId = 'rq06-' + Date.now();
    conversationContext.recordTurn(sessionId, {
      message: 't', response: 'r', queryType: null, topicFilter: null,
      avgScore: 0.75,
    });
    conversationContext.recordTurn(sessionId, {
      message: 't2', response: 'r2', queryType: null, topicFilter: null,
      avgScore: 0.55,
    });
    const ctx = conversationContext.getContext(sessionId);
    assert.strictEqual(ctx.lastAvgScore, 0.55, 'lastAvgScore should be last value');
    assert.ok(typeof ctx.rollingAvgScore === 'number', 'rollingAvgScore should be number');
    assert.ok(ctx.rollingAvgScore !== ctx.lastAvgScore, 'rolling should differ from last (smoothed)');
  });
});

// ═══════════════════════════════════════════════════════════════
// Block 2: Serialization & Edge Cases (T-RQ07 to T-RQ10)
// ═══════════════════════════════════════════════════════════════
describe('Rolling Quality — Serialization & Edge Cases', () => {

  // T-RQ07: serialize() includes rollingAvgScore
  it('T-RQ07: serialize() includes rollingAvgScore', () => {
    const sessionId = 'rq07-' + Date.now();
    conversationContext.recordTurn(sessionId, {
      message: 't', response: 'r', queryType: null, topicFilter: null,
      avgScore: 0.8,
    });
    const serialized = conversationContext.serialize(sessionId);
    assert.ok('rollingAvgScore' in serialized, 'should have rollingAvgScore');
    assert.strictEqual(serialized.rollingAvgScore, 0.8);
  });

  // T-RQ08: restore() recovers rollingAvgScore correctly
  it('T-RQ08: restore() recovers rollingAvgScore', () => {
    const sessionId = 'rq08-' + Date.now();
    const ok = conversationContext.restore(sessionId, {
      turns: 3,
      entities: ['الذكاء'],
      recentTopics: [],
      lastQueryType: null,
      contextSummary: null,
      lastActiveAt: Date.now(),
      lastAvgScore: 0.7,
      rollingAvgScore: 0.65,
      _version: 2,
    });
    assert.strictEqual(ok, true, 'restore should succeed');
    const ctx = conversationContext.getContext(sessionId);
    assert.strictEqual(ctx.rollingAvgScore, 0.65, 'should recover rollingAvgScore');
    assert.strictEqual(ctx.lastAvgScore, 0.7, 'should recover lastAvgScore');
  });

  // T-RQ09: recordTurn without avgScore preserves existing rollingAvgScore
  it('T-RQ09: recordTurn without avgScore preserves rolling', () => {
    const sessionId = 'rq09-' + Date.now();
    conversationContext.recordTurn(sessionId, {
      message: 't', response: 'r', queryType: null, topicFilter: null,
      avgScore: 0.8,
    });
    const before = conversationContext.getContext(sessionId).rollingAvgScore;

    // Record without avgScore
    conversationContext.recordTurn(sessionId, {
      message: 't2', response: 'r2', queryType: null, topicFilter: null,
    });
    const after = conversationContext.getContext(sessionId).rollingAvgScore;
    assert.strictEqual(after, before, 'rolling should not change without avgScore');
  });

  // T-RQ10: reset() clears sessions including rollingAvgScore
  it('T-RQ10: reset() clears all including rollingAvgScore', () => {
    const sessionId = 'rq10-' + Date.now();
    conversationContext.recordTurn(sessionId, {
      message: 't', response: 'r', queryType: null, topicFilter: null,
      avgScore: 0.9,
    });
    assert.ok(conversationContext.getContext(sessionId).rollingAvgScore !== null);
    conversationContext.reset();
    assert.strictEqual(conversationContext.getContext(sessionId), null, 'session should be cleared');
  });
});
