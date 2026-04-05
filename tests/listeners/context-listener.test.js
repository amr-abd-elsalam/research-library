// tests/listeners/context-listener.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 58 — Unit tests for contextListener
// Tests that pipeline:complete and pipeline:cacheHit events
// record turns in ConversationContext, emit contextUpdated,
// and trigger ContextPersister (when enabled).
// ═══════════════════════════════════════════════════════════════

import { describe, it, before, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { eventBus }            from '../../server/services/eventBus.js';
import { conversationContext } from '../../server/services/conversationContext.js';
import { register }            from '../../server/services/listeners/contextListener.js';

let registered = false;

describe('ContextListener', () => {

  before(() => {
    if (!registered) {
      register();
      registered = true;
    }
  });

  afterEach(() => {
    conversationContext.reset();
  });

  // T-CTX01: pipeline:complete with sessionId — records turn in conversationContext
  it('T-CTX01: pipeline:complete with sessionId — records turn', () => {
    eventBus.emit('pipeline:complete', {
      sessionId: 'ctx-test-01',
      message: 'ما هو الذكاء الاصطناعي؟',
      fullText: 'الذكاء الاصطناعي هو فرع من علوم الحاسوب',
      queryType: 'factual',
      topicFilter: 'AI',
    });

    const ctx = conversationContext.getContext('ctx-test-01');
    assert.ok(ctx, 'context should exist for session');
    assert.strictEqual(ctx.turns, 1, 'should have 1 turn');
    assert.strictEqual(ctx.lastQueryType, 'factual');
    assert.ok(ctx.recentTopics.includes('AI'), 'should track topic filter');
  });

  // T-CTX02: pipeline:cacheHit with sessionId — also records turn
  it('T-CTX02: pipeline:cacheHit with sessionId — records turn', () => {
    eventBus.emit('pipeline:cacheHit', {
      sessionId: 'ctx-test-02',
      message: 'ما هو التعلم العميق؟',
      fullText: 'التعلم العميق هو فرع من التعلم الآلي',
      topicFilter: 'ML',
    });

    const ctx = conversationContext.getContext('ctx-test-02');
    assert.ok(ctx, 'context should exist for session');
    assert.strictEqual(ctx.turns, 1, 'should have 1 turn');
    assert.strictEqual(ctx.lastQueryType, null, 'cacheHit sets queryType to null');
    assert.ok(ctx.recentTopics.includes('ML'), 'should track topic filter');
  });

  // T-CTX03: pipeline:complete → emits conversation:contextUpdated
  it('T-CTX03: pipeline:complete — emits conversation:contextUpdated', () => {
    let contextUpdated = null;

    const unsub = eventBus.on('conversation:contextUpdated', (data) => {
      contextUpdated = data;
    });

    eventBus.emit('pipeline:complete', {
      sessionId: 'ctx-test-03',
      message: 'test message',
      fullText: 'test response',
    });

    unsub();

    assert.ok(contextUpdated, 'conversation:contextUpdated should have been emitted');
    assert.strictEqual(contextUpdated.sessionId, 'ctx-test-03');
    assert.strictEqual(contextUpdated.turns, 1);
    assert.ok(typeof contextUpdated.timestamp === 'number');
  });

  // T-CTX04: multiple turns — accumulates in conversationContext
  it('T-CTX04: multiple turns — accumulates in context', () => {
    const sid = 'ctx-test-04';

    eventBus.emit('pipeline:complete', {
      sessionId: sid,
      message: 'السؤال الأول',
      fullText: 'الإجابة الأولى',
      queryType: 'factual',
    });

    eventBus.emit('pipeline:complete', {
      sessionId: sid,
      message: 'السؤال الثاني',
      fullText: 'الإجابة الثانية',
      queryType: 'analytical',
    });

    const ctx = conversationContext.getContext(sid);
    assert.strictEqual(ctx.turns, 2, 'should have 2 turns');
    assert.strictEqual(ctx.lastQueryType, 'analytical');
  });

  // T-CTX05: pipeline:complete without sessionId — no turn recorded
  it('T-CTX05: pipeline:complete without sessionId — no turn recorded', () => {
    const sizeBefore = conversationContext.counts().activeSessions;

    eventBus.emit('pipeline:complete', {
      message: 'no session id',
      fullText: 'response',
    });

    const sizeAfter = conversationContext.counts().activeSessions;
    assert.strictEqual(sizeAfter, sizeBefore, 'no new session should be created');
  });

  // T-CTX06: null event data — no crash
  it('T-CTX06: null event data — no crash', () => {
    assert.doesNotThrow(() => {
      eventBus.emit('pipeline:complete', null);
    });
  });
});
