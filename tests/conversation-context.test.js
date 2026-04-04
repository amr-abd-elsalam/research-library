// tests/conversation-context.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 47 — ConversationContext lifecycle tests
// Tests: recordTurn → getContext → hasRichContext → serialize →
//        restore → evict → counts → null guards.
// Uses the singleton instance with reset() for test isolation.
// Does NOT duplicate entity extraction quality tests from
// entity-extraction.test.js — focuses on lifecycle only.
// ═══════════════════════════════════════════════════════════════

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { conversationContext } from '../server/services/conversationContext.js';

describe('ConversationContext Lifecycle', () => {

  afterEach(() => {
    conversationContext.reset();
  });

  // T-CC01: recordTurn + getContext → returns context object with expected keys
  it('T-CC01: recordTurn + getContext → valid context object with expected keys', () => {
    conversationContext.recordTurn('session-1', {
      message: 'ما هو الذكاء الاصطناعي؟',
      response: 'الذكاء الاصطناعي هو...',
      queryType: 'factual',
      topicFilter: null,
    });
    const ctx = conversationContext.getContext('session-1');
    assert.notStrictEqual(ctx, null, 'context should not be null after recordTurn');
    assert.ok('turns' in ctx, 'should have turns key');
    assert.ok('entities' in ctx, 'should have entities key');
    assert.ok('recentTopics' in ctx, 'should have recentTopics key');
    assert.ok('lastQueryType' in ctx, 'should have lastQueryType key');
    assert.ok('summary' in ctx, 'should have summary key');
  });

  // T-CC02: recordTurn increments turns counter
  it('T-CC02: recordTurn increments turns counter', () => {
    conversationContext.recordTurn('s1', { message: 'سؤال 1', response: 'جواب 1', queryType: null, topicFilter: null });
    conversationContext.recordTurn('s1', { message: 'سؤال 2', response: 'جواب 2', queryType: null, topicFilter: null });
    const ctx = conversationContext.getContext('s1');
    assert.strictEqual(ctx.turns, 2);
  });

  // T-CC03: getContext for non-existent session → null
  it('T-CC03: getContext for non-existent session → null', () => {
    const ctx = conversationContext.getContext('does-not-exist');
    assert.strictEqual(ctx, null);
  });

  // T-CC04: hasRichContext → false for brand new session (0 turns)
  it('T-CC04: hasRichContext → false for session with 0 turns', () => {
    assert.strictEqual(conversationContext.hasRichContext('new-session'), false);
  });

  // T-CC05: hasRichContext → true after 2+ turns with entities
  // Uses quoted strings to guarantee entity extraction
  it('T-CC05: hasRichContext → true after 2+ turns with entities', () => {
    conversationContext.recordTurn('s1', {
      message: 'ما هو "التعلم العميق"؟',
      response: 'التعلم العميق...',
      queryType: 'factual',
      topicFilter: null,
    });
    conversationContext.recordTurn('s1', {
      message: 'وما هي "الشبكات العصبية"؟',
      response: 'الشبكات...',
      queryType: 'factual',
      topicFilter: null,
    });
    // Needs turns >= 2 AND entities >= 1
    assert.strictEqual(conversationContext.hasRichContext('s1'), true);
  });

  // T-CC06: hasRichContext → false after 1 turn (needs >= 2)
  it('T-CC06: hasRichContext → false after 1 turn', () => {
    conversationContext.recordTurn('s1', {
      message: '"البرمجة" مفيدة',
      response: 'البرمجة...',
      queryType: null,
      topicFilter: null,
    });
    // 1 turn < 2 required → false even with entities
    assert.strictEqual(conversationContext.hasRichContext('s1'), false);
  });

  // T-CC07: evict removes session completely
  it('T-CC07: evict removes session completely', () => {
    conversationContext.recordTurn('s1', { message: 'test', response: 'test', queryType: null, topicFilter: null });
    assert.notStrictEqual(conversationContext.getContext('s1'), null);
    conversationContext.evict('s1');
    assert.strictEqual(conversationContext.getContext('s1'), null);
  });

  // T-CC08: serialize returns object with _version: 2
  it('T-CC08: serialize returns object with _version: 2', () => {
    conversationContext.recordTurn('s1', {
      message: 'شيء ما',
      response: 'رد',
      queryType: 'factual',
      topicFilter: null,
    });
    const serialized = conversationContext.serialize('s1');
    assert.notStrictEqual(serialized, null, 'serialize should not return null for existing session');
    assert.strictEqual(serialized._version, 2);
  });

  // T-CC09: serialize + restore round-trip → context preserved
  it('T-CC09: serialize + restore round-trip → context preserved', () => {
    conversationContext.recordTurn('s1', {
      message: '"الكمبيوتر" مهم',
      response: 'نعم الكمبيوتر...',
      queryType: 'factual',
      topicFilter: 'tech',
    });
    const serialized = conversationContext.serialize('s1');
    conversationContext.reset();

    const restored = conversationContext.restore('s2', serialized);
    assert.strictEqual(restored, true, 'restore should return true');
    const ctx = conversationContext.getContext('s2');
    assert.notStrictEqual(ctx, null, 'context should exist after restore');
    assert.strictEqual(ctx.turns, 1);
  });

  // T-CC10: restore with unknown version → returns false
  it('T-CC10: restore with unknown version → returns false', () => {
    const result = conversationContext.restore('s1', {
      _version: 99,
      turns: 1,
      entities: [],
      recentTopics: [],
      lastQueryType: null,
      contextSummary: null,
      lastActiveAt: Date.now(),
    });
    assert.strictEqual(result, false);
  });

  // T-CC11: entities respect maxContextEntities limit (default 20)
  it('T-CC11: entities respect maxContextEntities limit', () => {
    // Record 25 turns with unique quoted entities to guarantee extraction
    for (let i = 0; i < 25; i++) {
      conversationContext.recordTurn('s1', {
        message: `"مصطلح_${i}" هو مفهوم مهم`,
        response: `"رد_${i}" يوضح المفهوم`,
        queryType: null,
        topicFilter: null,
      });
    }
    const ctx = conversationContext.getContext('s1');
    assert.ok(ctx.entities.length <= 20, `entities count ${ctx.entities.length} should be <= 20 (maxContextEntities)`);
  });

  // T-CC12: recordTurn with null sessionId → no crash, no state change
  it('T-CC12: recordTurn with null sessionId → no crash, no state change', () => {
    // Should not throw
    conversationContext.recordTurn(null, { message: 'test', response: 'test', queryType: null, topicFilter: null });
    assert.strictEqual(conversationContext.counts().activeSessions, 0);
  });

});
