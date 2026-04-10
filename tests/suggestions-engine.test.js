// tests/suggestions-engine.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 47 — SuggestionsEngine.generate() unit tests
// Tests: disabled guard, minTurns, valid generation, limits,
//        type validation, deterministic output.
// Uses featureFlags.setOverride('SUGGESTIONS', true) to enable
// the engine (config default is false).
// ═══════════════════════════════════════════════════════════════

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { suggestionsEngine } from '../server/services/suggestionsEngine.js';
import { featureFlags } from '../server/services/featureFlags.js';

describe('SuggestionsEngine.generate()', () => {

  afterEach(() => {
    featureFlags.clearOverride('SUGGESTIONS');
  });

  // T-SE01: generate with null context → empty array
  it('T-SE01: generate with null context → empty array', () => {
    featureFlags.setOverride('SUGGESTIONS', true);
    const result = suggestionsEngine.generate(null);
    assert.ok(Array.isArray(result), 'result should be an array');
    assert.strictEqual(result.length, 0);
  });

  // T-SE02: generate when feature disabled → empty array
  it('T-SE02: generate when feature disabled → empty array', () => {
    // Phase 90: SUGGESTIONS now enabled by default — explicitly disable
    featureFlags.setOverride('SUGGESTIONS', false);
    const convCtx = {
      turns: 5,
      entities: ['الذكاء الاصطناعي'],
      recentTopics: [],
      lastQueryType: 'factual',
      summary: 'something',
    };
    const result = suggestionsEngine.generate(convCtx);
    assert.ok(Array.isArray(result), 'result should be an array');
    assert.strictEqual(result.length, 0);
  });

  // T-SE03: generate with turns < minTurns → empty array
  // Config default: minTurns = 1, so turns: 0 should return empty
  it('T-SE03: generate with turns < minTurns → empty array', () => {
    featureFlags.setOverride('SUGGESTIONS', true);
    const convCtx = {
      turns: 0,
      entities: ['شيء'],
      recentTopics: [],
      lastQueryType: null,
      summary: null,
    };
    const result = suggestionsEngine.generate(convCtx);
    assert.strictEqual(result.length, 0);
  });

  // T-SE04: generate with valid rich context → non-empty array
  it('T-SE04: generate with valid rich context → non-empty array', () => {
    featureFlags.setOverride('SUGGESTIONS', true);
    const convCtx = {
      turns: 3,
      entities: ['الذكاء الاصطناعي', 'التعلم العميق'],
      recentTopics: ['ai'],
      lastQueryType: 'factual',
      summary: 'المواضيع: الذكاء الاصطناعي',
    };
    const result = suggestionsEngine.generate(convCtx);
    assert.ok(result.length > 0, `expected non-empty suggestions, got ${result.length}`);
  });

  // T-SE05: generate respects maxSuggestions limit (default 3)
  it('T-SE05: generate respects maxSuggestions limit', () => {
    featureFlags.setOverride('SUGGESTIONS', true);
    const convCtx = {
      turns: 5,
      entities: ['a', 'b', 'c', 'd', 'e'],
      recentTopics: ['topic1'],
      lastQueryType: 'factual',
      summary: 'test',
    };
    const result = suggestionsEngine.generate(convCtx);
    // Config default: maxSuggestions = 3
    assert.ok(result.length <= 3, `result length ${result.length} should be <= 3 (maxSuggestions)`);
  });

  // T-SE06: each suggestion is a non-empty string
  it('T-SE06: each suggestion is a non-empty string', () => {
    featureFlags.setOverride('SUGGESTIONS', true);
    const convCtx = {
      turns: 3,
      entities: ['التقنية'],
      recentTopics: [],
      lastQueryType: 'factual',
      summary: 'test',
    };
    const result = suggestionsEngine.generate(convCtx);
    // May be empty if no templates match — but if non-empty, all should be strings
    for (const s of result) {
      assert.strictEqual(typeof s, 'string', `suggestion should be string, got ${typeof s}`);
      assert.ok(s.length > 0, 'suggestion should not be empty string');
    }
  });

  // T-SE07: generate with empty entities → returns empty array
  // (SuggestionsEngine has explicit guard: entities.length === 0 → return [])
  it('T-SE07: generate with empty entities → empty array', () => {
    featureFlags.setOverride('SUGGESTIONS', true);
    const convCtx = {
      turns: 3,
      entities: [],
      recentTopics: [],
      lastQueryType: null,
      summary: null,
    };
    const result = suggestionsEngine.generate(convCtx);
    assert.ok(Array.isArray(result), 'result should be an array');
    assert.strictEqual(result.length, 0);
  });

  // T-SE08: repeated calls with same context → consistent output length
  it('T-SE08: repeated calls with same context → consistent output length', () => {
    featureFlags.setOverride('SUGGESTIONS', true);
    const convCtx = {
      turns: 3,
      entities: ['البرمجة'],
      recentTopics: [],
      lastQueryType: 'factual',
      summary: 'test',
    };
    const r1 = suggestionsEngine.generate(convCtx);
    const r2 = suggestionsEngine.generate(convCtx);
    assert.strictEqual(r1.length, r2.length, 'output length should be deterministic');
  });

  // ── Click Tracking (Phase 54) ──────────────────────────────────

  // T-SE09: recordClick() stores click and increments totalClicks
  it('T-SE09: recordClick stores click and increments totalClicks', () => {
    featureFlags.setOverride('SUGGESTIONS', true);
    suggestionsEngine.recordClick('test suggestion');
    const counts = suggestionsEngine.getClickCounts();
    assert.strictEqual(counts.totalClicks, 1);
    assert.strictEqual(counts.uniqueSuggestions, 1);
    suggestionsEngine.reset();
  });

  // T-SE10: recordClick() when disabled → no-op
  it('T-SE10: recordClick when disabled is a no-op', () => {
    // Phase 90: SUGGESTIONS now enabled by default — explicitly disable
    featureFlags.setOverride('SUGGESTIONS', false);
    suggestionsEngine.recordClick('test suggestion');
    const counts = suggestionsEngine.getClickCounts();
    assert.strictEqual(counts.totalClicks, 0);
    assert.strictEqual(counts.uniqueSuggestions, 0);
  });

  // T-SE11: getClickCounts() returns correct structure with top sorted
  it('T-SE11: getClickCounts returns sorted top suggestions', () => {
    featureFlags.setOverride('SUGGESTIONS', true);
    suggestionsEngine.reset(); // Phase 90: clear any prior state since SUGGESTIONS now enabled by default
    suggestionsEngine.recordClick('A');
    suggestionsEngine.recordClick('B');
    suggestionsEngine.recordClick('A');
    const counts = suggestionsEngine.getClickCounts();
    assert.strictEqual(counts.totalClicks, 3);
    assert.strictEqual(counts.uniqueSuggestions, 2);
    assert.strictEqual(counts.top[0].text, 'A');
    assert.strictEqual(counts.top[0].count, 2);
    assert.strictEqual(counts.top[1].text, 'B');
    assert.strictEqual(counts.top[1].count, 1);
    suggestionsEngine.reset();
  });

  // T-SE12: reset() clears click data
  it('T-SE12: reset clears click data', () => {
    featureFlags.setOverride('SUGGESTIONS', true);
    suggestionsEngine.reset(); // Phase 90: clear any prior state
    suggestionsEngine.recordClick('test');
    assert.strictEqual(suggestionsEngine.getClickCounts().totalClicks, 1);
    suggestionsEngine.reset();
    const counts = suggestionsEngine.getClickCounts();
    assert.strictEqual(counts.totalClicks, 0);
    assert.strictEqual(counts.uniqueSuggestions, 0);
  });

});
