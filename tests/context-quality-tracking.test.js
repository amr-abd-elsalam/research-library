// tests/context-quality-tracking.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 86 — ConversationContext Quality Tracking Tests
// Tests lastAvgScore recording, retrieval, serialization,
// restoration, and edge cases.
// No network calls — tests pure context state management.
// ═══════════════════════════════════════════════════════════════

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { ConversationContext, conversationContext } from '../server/services/conversationContext.js';

// ── Cleanup ───────────────────────────────────────────────────
afterEach(() => {
  conversationContext.reset();
});

// ═══════════════════════════════════════════════════════════════
// Block 1: lastAvgScore Recording (T-CQT01 to T-CQT06)
// ═══════════════════════════════════════════════════════════════
describe('lastAvgScore Recording', () => {

  // T-CQT01: recordTurn with avgScore stores lastAvgScore in session state
  it('T-CQT01: recordTurn with avgScore stores lastAvgScore', () => {
    conversationContext.recordTurn('s1', {
      message: 'test question',
      response: 'test answer',
      queryType: 'factual',
      topicFilter: null,
      avgScore: 0.85,
    });
    const ctx = conversationContext.getContext('s1');
    assert.strictEqual(ctx.lastAvgScore, 0.85);
  });

  // T-CQT02: getContext returns lastAvgScore field
  it('T-CQT02: getContext returns lastAvgScore field', () => {
    conversationContext.recordTurn('s2', {
      message: 'test',
      response: 'answer',
      queryType: null,
      topicFilter: null,
      avgScore: 0.7,
    });
    const ctx = conversationContext.getContext('s2');
    assert.ok('lastAvgScore' in ctx, 'should have lastAvgScore key');
    assert.strictEqual(typeof ctx.lastAvgScore, 'number');
  });

  // T-CQT03: lastAvgScore defaults to null for new session
  it('T-CQT03: lastAvgScore defaults to null for new session', () => {
    conversationContext.recordTurn('s3', {
      message: 'test',
      response: 'answer',
      queryType: null,
      topicFilter: null,
    });
    const ctx = conversationContext.getContext('s3');
    assert.strictEqual(ctx.lastAvgScore, null);
  });

  // T-CQT04: lastAvgScore updates on each turn with new avgScore
  it('T-CQT04: lastAvgScore updates on each turn', () => {
    conversationContext.recordTurn('s4', {
      message: 'q1', response: 'a1', queryType: null, topicFilter: null, avgScore: 0.5,
    });
    assert.strictEqual(conversationContext.getContext('s4').lastAvgScore, 0.5);

    conversationContext.recordTurn('s4', {
      message: 'q2', response: 'a2', queryType: null, topicFilter: null, avgScore: 0.9,
    });
    assert.strictEqual(conversationContext.getContext('s4').lastAvgScore, 0.9);

    conversationContext.recordTurn('s4', {
      message: 'q3', response: 'a3', queryType: null, topicFilter: null, avgScore: 0.3,
    });
    assert.strictEqual(conversationContext.getContext('s4').lastAvgScore, 0.3);
  });

  // T-CQT05: recordTurn without avgScore preserves previous lastAvgScore value
  it('T-CQT05: recordTurn without avgScore preserves previous value', () => {
    conversationContext.recordTurn('s5', {
      message: 'q1', response: 'a1', queryType: null, topicFilter: null, avgScore: 0.75,
    });
    assert.strictEqual(conversationContext.getContext('s5').lastAvgScore, 0.75);

    conversationContext.recordTurn('s5', {
      message: 'q2', response: 'a2', queryType: null, topicFilter: null,
      // no avgScore
    });
    assert.strictEqual(conversationContext.getContext('s5').lastAvgScore, 0.75,
      'should preserve previous value when avgScore not provided');
  });

  // T-CQT06: recordTurn with avgScore: null preserves previous value
  it('T-CQT06: avgScore null preserves previous value', () => {
    conversationContext.recordTurn('s6', {
      message: 'q1', response: 'a1', queryType: null, topicFilter: null, avgScore: 0.65,
    });
    conversationContext.recordTurn('s6', {
      message: 'q2', response: 'a2', queryType: null, topicFilter: null, avgScore: null,
    });
    assert.strictEqual(conversationContext.getContext('s6').lastAvgScore, 0.65,
      'null avgScore should not overwrite previous value');
  });
});

// ═══════════════════════════════════════════════════════════════
// Block 2: Serialization & Restoration (T-CQT07 to T-CQT09)
// ═══════════════════════════════════════════════════════════════
describe('lastAvgScore Serialization & Restoration', () => {

  // T-CQT07: serialize() includes lastAvgScore field
  it('T-CQT07: serialize includes lastAvgScore', () => {
    conversationContext.recordTurn('s7', {
      message: 'test', response: 'answer', queryType: null, topicFilter: null, avgScore: 0.88,
    });
    const serialized = conversationContext.serialize('s7');
    assert.ok('lastAvgScore' in serialized, 'serialized should include lastAvgScore');
    assert.strictEqual(serialized.lastAvgScore, 0.88);
  });

  // T-CQT08: restore() recovers lastAvgScore correctly
  it('T-CQT08: restore recovers lastAvgScore', () => {
    const data = {
      turns: 3,
      entities: ['الذكاء الاصطناعي'],
      recentTopics: [],
      lastQueryType: 'factual',
      contextSummary: 'test summary',
      lastActiveAt: Date.now(),
      lastAvgScore: 0.72,
      _version: 2,
    };
    const result = conversationContext.restore('s8', data);
    assert.strictEqual(result, true);
    const ctx = conversationContext.getContext('s8');
    assert.strictEqual(ctx.lastAvgScore, 0.72);
  });

  // T-CQT09: restore() sets lastAvgScore to null when not present in data
  it('T-CQT09: restore sets lastAvgScore to null when absent', () => {
    const data = {
      turns: 2,
      entities: [],
      recentTopics: [],
      lastQueryType: null,
      contextSummary: null,
      lastActiveAt: Date.now(),
      // no lastAvgScore
      _version: 2,
    };
    const result = conversationContext.restore('s9', data);
    assert.strictEqual(result, true);
    const ctx = conversationContext.getContext('s9');
    assert.strictEqual(ctx.lastAvgScore, null);
  });
});

// ═══════════════════════════════════════════════════════════════
// Block 3: Integration & Edge Cases (T-CQT10 to T-CQT12)
// ═══════════════════════════════════════════════════════════════
describe('lastAvgScore Edge Cases', () => {

  // T-CQT10: evicted session loses lastAvgScore
  it('T-CQT10: evicted session loses lastAvgScore', () => {
    conversationContext.recordTurn('s10', {
      message: 'test', response: 'answer', queryType: null, topicFilter: null, avgScore: 0.9,
    });
    assert.strictEqual(conversationContext.getContext('s10').lastAvgScore, 0.9);
    conversationContext.evict('s10');
    assert.strictEqual(conversationContext.getContext('s10'), null);
  });

  // T-CQT11: reset() clears all sessions including quality data
  it('T-CQT11: reset clears all quality data', () => {
    conversationContext.recordTurn('s11a', {
      message: 'test', response: 'answer', queryType: null, topicFilter: null, avgScore: 0.8,
    });
    conversationContext.recordTurn('s11b', {
      message: 'test', response: 'answer', queryType: null, topicFilter: null, avgScore: 0.6,
    });
    conversationContext.reset();
    assert.strictEqual(conversationContext.getContext('s11a'), null);
    assert.strictEqual(conversationContext.getContext('s11b'), null);
  });

  // T-CQT12: multiple sessions maintain independent lastAvgScore values
  it('T-CQT12: independent lastAvgScore per session', () => {
    conversationContext.recordTurn('s12a', {
      message: 'q1', response: 'a1', queryType: null, topicFilter: null, avgScore: 0.9,
    });
    conversationContext.recordTurn('s12b', {
      message: 'q1', response: 'a1', queryType: null, topicFilter: null, avgScore: 0.4,
    });
    assert.strictEqual(conversationContext.getContext('s12a').lastAvgScore, 0.9);
    assert.strictEqual(conversationContext.getContext('s12b').lastAvgScore, 0.4);
  });
});
