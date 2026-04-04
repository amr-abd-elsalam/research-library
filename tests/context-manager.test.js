// tests/context-manager.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 55 — ContextManager unit tests
// Tests token budget allocation and trimming logic.
// Uses new ContextManager() instances for full isolation.
// The class reads config defaults in constructor but accepts
// options override — we use defaults (config is frozen + global).
// ═══════════════════════════════════════════════════════════════

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ContextManager } from '../server/services/contextManager.js';

describe('ContextManager', () => {

  // T-CM01: buildWindow returns expected structure shape
  it('T-CM01: buildWindow returns expected structure shape', () => {
    const cm = new ContextManager();
    const result = cm.buildWindow({
      systemPrompt: 'test',
      ragHits: [],
      history: [],
      message: 'hello',
    });
    assert.ok(Array.isArray(result.hits), 'hits should be an array');
    assert.ok(Array.isArray(result.history), 'history should be an array');
    assert.ok(result.budget && typeof result.budget === 'object', 'budget should be an object');
  });

  // T-CM02: empty ragHits → hits array empty
  it('T-CM02: empty ragHits returns empty hits array', () => {
    const cm = new ContextManager();
    const result = cm.buildWindow({
      systemPrompt: 'test',
      ragHits: [],
      history: [],
      message: 'hello',
    });
    assert.strictEqual(result.hits.length, 0);
  });

  // T-CM03: empty history → history array empty
  it('T-CM03: empty history returns empty history array', () => {
    const cm = new ContextManager();
    const result = cm.buildWindow({
      systemPrompt: 'test',
      ragHits: [],
      history: [],
      message: 'hello',
    });
    assert.strictEqual(result.history.length, 0);
  });

  // T-CM04: budget has total reflecting maxTokenBudget
  it('T-CM04: budget.total reflects maxTokenBudget * safety margin', () => {
    const cm = new ContextManager({ maxTokenBudget: 1000 });
    const result = cm.buildWindow({
      systemPrompt: '',
      ragHits: [],
      history: [],
      message: '',
    });
    // total = floor(1000 * 0.9) = 900
    assert.strictEqual(result.budget.total, 900);
  });

  // T-CM05: ragHits preserved when within budget
  it('T-CM05: ragHits preserved when within budget', () => {
    const cm = new ContextManager({ maxTokenBudget: 6000 });
    const hits = [
      { payload: { content: 'short text' } },
      { payload: { content: 'another short' } },
    ];
    const result = cm.buildWindow({
      systemPrompt: 'sys',
      ragHits: hits,
      history: [],
      message: 'q',
    });
    assert.strictEqual(result.hits.length, 2);
  });

  // T-CM06: history items preserved when within budget
  it('T-CM06: history items preserved when within budget', () => {
    const cm = new ContextManager({ maxTokenBudget: 6000 });
    const history = [
      { role: 'user', text: 'hello' },
      { role: 'assistant', text: 'hi there' },
    ];
    const result = cm.buildWindow({
      systemPrompt: 'sys',
      ragHits: [],
      history,
      message: 'q',
    });
    assert.strictEqual(result.history.length, 2);
  });

  // T-CM07: large ragHits trimmed to fit budget
  it('T-CM07: large ragHits trimmed to fit budget', () => {
    const cm = new ContextManager({ maxTokenBudget: 200 });
    const hits = [];
    for (let i = 0; i < 20; i++) {
      hits.push({ payload: { content: 'x'.repeat(100) } });
    }
    const result = cm.buildWindow({
      systemPrompt: 'sys',
      ragHits: hits,
      history: [],
      message: 'q',
    });
    assert.ok(result.hits.length < 20, `expected fewer than 20 hits, got ${result.hits.length}`);
  });

  // T-CM08: large history trimmed to fit budget
  it('T-CM08: large history trimmed to fit budget', () => {
    const cm = new ContextManager({ maxTokenBudget: 200 });
    const history = [];
    for (let i = 0; i < 20; i++) {
      history.push({ role: 'user', text: 'x'.repeat(100) });
    }
    const result = cm.buildWindow({
      systemPrompt: 'sys',
      ragHits: [],
      history,
      message: 'q',
    });
    assert.ok(result.history.length < 20, `expected fewer than 20 items, got ${result.history.length}`);
  });

  // T-CM09: budget.remaining is non-negative
  it('T-CM09: budget.remaining is non-negative', () => {
    const cm = new ContextManager();
    const result = cm.buildWindow({
      systemPrompt: 'test prompt',
      ragHits: [{ payload: { content: 'some content' } }],
      history: [{ role: 'user', text: 'hello' }],
      message: 'what is this?',
    });
    assert.ok(result.budget.remaining >= 0, `remaining should be >= 0, got ${result.budget.remaining}`);
  });

  // T-CM10: larger systemPrompt reduces available budget for hits/history
  it('T-CM10: larger systemPrompt reduces available budget', () => {
    const cm = new ContextManager({ maxTokenBudget: 300 });
    const hits = [];
    for (let i = 0; i < 10; i++) {
      hits.push({ payload: { content: 'content chunk number ' + i } });
    }
    const history = [{ role: 'user', text: 'hi' }];

    const smallPrompt = cm.buildWindow({
      systemPrompt: 'x',
      ragHits: hits,
      history,
      message: 'q',
    });

    const largePrompt = cm.buildWindow({
      systemPrompt: 'x'.repeat(500),
      ragHits: hits,
      history,
      message: 'q',
    });

    // Larger system prompt should leave less room for hits
    assert.ok(
      largePrompt.hits.length <= smallPrompt.hits.length,
      `large prompt hits (${largePrompt.hits.length}) should be <= small prompt hits (${smallPrompt.hits.length})`
    );
  });

});
