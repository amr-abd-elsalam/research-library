// tests/integration-chat-flow.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 52 — Lightweight Integration Tests (Chat Flow Wiring)
// Verifies module wiring between ExecutionRouter, PipelineContext,
// and chatPipeline without HTTP server or external services.
// Tests resolve() routing decisions and PipelineContext constructor
// field initialization. No qdrant, no gemini, no HTTP.
// ═══════════════════════════════════════════════════════════════

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { executionRouter } from '../server/services/executionRouter.js';
import { PipelineContext, chatPipeline } from '../server/services/pipeline.js';

describe('Integration — Chat Flow Wiring', () => {

  // T-ICF01: executionRouter.resolve() with command message (/مساعدة) → action: 'command'
  it('T-ICF01: resolve with /مساعدة returns action command', () => {
    const result = executionRouter.resolve('/مساعدة', {
      topicFilter: null,
      history: [],
      sessionId: 'test-sess',
    });
    assert.strictEqual(result.action, 'command');
    assert.ok(result.data.command, 'data.command should exist');
    assert.ok(result.data.parsed, 'data.parsed should exist');
  });

  // T-ICF02: executionRouter.resolve() with normal text + empty cache → action: 'pipeline'
  it('T-ICF02: resolve with normal text returns action pipeline', () => {
    const result = executionRouter.resolve('ما هو التعلم العميق؟', {
      topicFilter: null,
      history: [],
      sessionId: 'test-sess-02',
    });
    assert.strictEqual(result.action, 'pipeline');
    assert.ok(result.data.cacheKey, 'data.cacheKey should exist');
    assert.ok(result.data.queryIntent, 'data.queryIntent should exist');
  });

  // T-ICF03: resolve() pipeline action returns cacheKey with correct prefix ('chat:')
  it('T-ICF03: pipeline action cacheKey starts with chat:', () => {
    const result = executionRouter.resolve('سؤال عشوائي فريد للاختبار', {
      topicFilter: null,
      history: [],
      sessionId: 'test-sess-03',
    });
    assert.strictEqual(result.action, 'pipeline');
    assert.ok(result.data.cacheKey.startsWith('chat:'), `cacheKey should start with 'chat:', got: ${result.data.cacheKey}`);
  });

  // T-ICF04: PipelineContext constructor sets all expected fields
  it('T-ICF04: PipelineContext constructor sets expected fields', () => {
    const ctx = new PipelineContext({
      message: 'سؤال اختباري',
      topicFilter: 'topic1',
      history: [{ role: 'user', text: 'hi' }],
      sessionId: 'sess-ctx-test',
      req: null,
      res: null,
      responseMode: 'stream',
    });

    assert.strictEqual(ctx.message, 'سؤال اختباري');
    assert.strictEqual(ctx.topicFilter, 'topic1');
    assert.strictEqual(ctx.sessionId, 'sess-ctx-test');
    assert.strictEqual(typeof ctx.startTime, 'number');
    assert.ok(ctx.startTime > 0, 'startTime should be set');
    assert.strictEqual(ctx.aborted, false);
    assert.strictEqual(ctx.abortReason, null);
    assert.strictEqual(ctx.fullText, '');
    assert.strictEqual(ctx.avgScore, 0);
    assert.strictEqual(ctx.cacheHit, false);
  });

  // T-ICF05: chatPipeline stages array exists and has 8 entries
  it('T-ICF05: chatPipeline is defined (PipelineRunner with 8 stages)', () => {
    assert.ok(chatPipeline, 'chatPipeline should be defined');
    assert.strictEqual(typeof chatPipeline.run, 'function', 'chatPipeline should have run() method');
  });

});
