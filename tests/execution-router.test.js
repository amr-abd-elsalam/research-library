// tests/execution-router.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 47 — ExecutionRouter.resolve() unit tests
// Tests the 7 routing actions + return structure + edge cases.
// Uses the real singleton with config defaults:
//   COMMANDS.enabled: true, TIERS.enabled: false,
//   SESSIONS.maxTokensPerSession: 0 (unlimited).
// ═══════════════════════════════════════════════════════════════

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { executionRouter } from '../server/services/executionRouter.js';

// ── Known action strings (7 possible actions) ──────────────────
const KNOWN_ACTIONS = [
  'command', 'nl_command', 'cache_hit',
  'budget_exceeded', 'topic_denied', 'permission_denied',
  'pipeline',
];

describe('ExecutionRouter.resolve()', () => {

  // No shared state to clean — ExecutionRouter is stateless.
  // Cache and featureFlags are untouched by these tests.

  // T-ER01: /مساعدة is a registered command → action: 'command'
  it('T-ER01: resolve with /مساعدة → returns action: command', () => {
    const result = executionRouter.resolve('/مساعدة', {
      topicFilter: null, history: [], sessionId: null,
    });
    assert.strictEqual(result.action, 'command');
  });

  // T-ER02: command action data contains command object with name string
  it('T-ER02: command action data contains command object with name', () => {
    const result = executionRouter.resolve('/مساعدة', {
      topicFilter: null, history: [], sessionId: null,
    });
    assert.ok(result.data.command, 'data.command should exist');
    assert.strictEqual(typeof result.data.command.name, 'string');
  });

  // T-ER03: normal text → action: 'pipeline'
  it('T-ER03: resolve with normal text → returns action: pipeline', () => {
    const result = executionRouter.resolve('ما هي المنصة؟', {
      topicFilter: null, history: [], sessionId: null,
    });
    assert.strictEqual(result.action, 'pipeline');
  });

  // T-ER04: resolve always returns object with 'action' and 'data' keys
  it('T-ER04: resolve returns object with action and data keys', () => {
    const result = executionRouter.resolve('أي رسالة', {
      topicFilter: null, history: [], sessionId: null,
    });
    assert.ok('action' in result, 'result should have action key');
    assert.ok('data' in result, 'result should have data key');
  });

  // T-ER05: null sessionId → pipeline (no budget check crash)
  it('T-ER05: resolve with null sessionId → no crash, goes to pipeline', () => {
    const result = executionRouter.resolve('سؤال عادي', {
      topicFilter: null, history: [], sessionId: null,
    });
    // Should not throw — budget check is guarded by `if (sessionId)`
    assert.strictEqual(result.action, 'pipeline');
  });

  // T-ER06: pipeline action data contains cacheKey string
  it('T-ER06: pipeline action data contains cacheKey string', () => {
    const result = executionRouter.resolve('سؤال ما', {
      topicFilter: null, history: [], sessionId: null,
    });
    assert.strictEqual(result.action, 'pipeline');
    assert.strictEqual(typeof result.data.cacheKey, 'string');
  });

  // T-ER07: cacheKey starts with 'chat:' prefix
  it('T-ER07: cacheKey format starts with chat: prefix', () => {
    const result = executionRouter.resolve('test question', {
      topicFilter: null, history: [], sessionId: null,
    });
    assert.ok(result.data.cacheKey.startsWith('chat:'), `cacheKey should start with 'chat:' — got: ${result.data.cacheKey}`);
  });

  // T-ER08: cacheKey with topicFilter=null contains 'all'
  it('T-ER08: cacheKey with null topicFilter contains all', () => {
    const result = executionRouter.resolve('test', {
      topicFilter: null, history: [], sessionId: null,
    });
    assert.ok(result.data.cacheKey.includes('all'), `cacheKey should include 'all' — got: ${result.data.cacheKey}`);
  });

  // T-ER09: cacheKey with topicFilter='topic1' contains 'topic1'
  it('T-ER09: cacheKey with topicFilter=topic1 contains topic1', () => {
    const result = executionRouter.resolve('test', {
      topicFilter: 'topic1', history: [], sessionId: null,
    });
    assert.ok(result.data.cacheKey.includes('topic1'), `cacheKey should include 'topic1' — got: ${result.data.cacheKey}`);
  });

  // T-ER10: pipeline data contains queryIntent object with intent field
  it('T-ER10: pipeline data contains queryIntent with intent field', () => {
    const result = executionRouter.resolve('سؤال عادي', {
      topicFilter: null, history: [], sessionId: null,
    });
    assert.strictEqual(result.action, 'pipeline');
    assert.ok(result.data.queryIntent !== undefined, 'data.queryIntent should exist');
    assert.ok('intent' in result.data.queryIntent, 'queryIntent should have intent field');
  });

  // T-ER11: action is always one of 7 known strings
  it('T-ER11: resolve action is one of 7 known action strings', () => {
    const result = executionRouter.resolve('أي رسالة', {
      topicFilter: null, history: [], sessionId: null,
    });
    assert.ok(
      KNOWN_ACTIONS.includes(result.action),
      `action '${result.action}' should be one of: ${KNOWN_ACTIONS.join(', ')}`
    );
  });

  // T-ER12: unknown / prefix command → falls through to pipeline
  // /قمر is not registered. matchCommand returns null.
  // queryIntentClassifier.classify('/قمر') returns { intent: 'command', confidence: 1.0 }
  // since confidence === 1.0 (not < 1.0), the nl_command branch is skipped.
  // Result: falls through to cache → budget → pipeline.
  it('T-ER12: resolve with unknown /قمر → pipeline (not registered)', () => {
    const result = executionRouter.resolve('/قمر', {
      topicFilter: null, history: [], sessionId: null,
    });
    assert.strictEqual(result.action, 'pipeline');
  });

});
