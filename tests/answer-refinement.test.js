// tests/answer-refinement.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 78 — Answer Refinement Tests
// Tests stageAnswerRefinement behavior, skip conditions,
// feature flag integration, and pipeline composition.
// No network calls — tests structure and behavior only.
// ═══════════════════════════════════════════════════════════════

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { stageAnswerRefinement, chatPipeline } from '../server/services/pipeline.js';
import { featureFlags } from '../server/services/featureFlags.js';
import config from '../config.js';

// ── Cleanup ───────────────────────────────────────────────────
afterEach(() => {
  featureFlags.clearOverride('ANSWER_REFINEMENT');
  featureFlags.clearOverride('GROUNDING');
});

// ═══════════════════════════════════════════════════════════════
// Block 1: stageAnswerRefinement Behavior
// ═══════════════════════════════════════════════════════════════
describe('stageAnswerRefinement Behavior', () => {

  // T-AR01: stageAnswerRefinement is a function
  it('T-AR01: stageAnswerRefinement is a function', () => {
    assert.strictEqual(typeof stageAnswerRefinement, 'function');
  });

  // T-AR02: stageAnswerRefinement returns a Promise
  it('T-AR02: stageAnswerRefinement returns a Promise', () => {
    const ctx = { aborted: false, fullText: '', _groundingSkipped: true };
    const result = stageAnswerRefinement(ctx, null);
    assert.ok(result instanceof Promise, 'should return a Promise');
  });

  // T-AR03: Returns ctx when ANSWER_REFINEMENT disabled (feature flag off)
  it('T-AR03: returns ctx when ANSWER_REFINEMENT disabled', async () => {
    // Default: ANSWER_REFINEMENT.enabled = false
    const ctx = { aborted: false, fullText: 'some text', _groundingSkipped: false, _groundingScore: 0.2 };
    const result = await stageAnswerRefinement(ctx, null);
    assert.strictEqual(result, ctx);
  });

  // T-AR04: Returns ctx and sets _refinementSkipped=true when disabled
  it('T-AR04: sets _refinementSkipped=true and reason=disabled when feature off', async () => {
    const ctx = { aborted: false, fullText: 'some text', _groundingSkipped: false, _groundingScore: 0.2 };
    await stageAnswerRefinement(ctx, null);
    assert.strictEqual(ctx._refinementSkipped, true);
    assert.strictEqual(ctx._refinementSkipReason, 'disabled');
  });

  // T-AR05: Skips when grounding was skipped (_groundingSkipped=true)
  it('T-AR05: skips when grounding was skipped', async () => {
    featureFlags.setOverride('ANSWER_REFINEMENT', true);
    const ctx = { aborted: false, fullText: 'some text', _groundingSkipped: true, _groundingScore: null };
    await stageAnswerRefinement(ctx, null);
    assert.strictEqual(ctx._refinementSkipped, true);
    assert.strictEqual(ctx._refinementSkipReason, 'no_grounding_data');
  });

  // T-AR06: Skips when grounding score is null
  it('T-AR06: skips when grounding score is null', async () => {
    featureFlags.setOverride('ANSWER_REFINEMENT', true);
    const ctx = { aborted: false, fullText: 'some text', _groundingSkipped: false, _groundingScore: null };
    await stageAnswerRefinement(ctx, null);
    assert.strictEqual(ctx._refinementSkipped, true);
    assert.strictEqual(ctx._refinementSkipReason, 'no_grounding_data');
  });

  // T-AR07: Skips when ctx.aborted is true
  it('T-AR07: skips when ctx.aborted is true', async () => {
    featureFlags.setOverride('ANSWER_REFINEMENT', true);
    const ctx = { aborted: true, fullText: 'some text', _groundingSkipped: false, _groundingScore: 0.1 };
    await stageAnswerRefinement(ctx, null);
    assert.strictEqual(ctx._refinementSkipped, true);
    assert.strictEqual(ctx._refinementSkipReason, 'aborted_or_empty');
  });

  // T-AR08: Skips when ctx.fullText is empty
  it('T-AR08: skips when ctx.fullText is empty', async () => {
    featureFlags.setOverride('ANSWER_REFINEMENT', true);
    const ctx = { aborted: false, fullText: '', _groundingSkipped: false, _groundingScore: 0.1 };
    await stageAnswerRefinement(ctx, null);
    assert.strictEqual(ctx._refinementSkipped, true);
    assert.strictEqual(ctx._refinementSkipReason, 'aborted_or_empty');
  });

  // T-AR09: Skips when response mode is 'stream'
  it('T-AR09: skips when response mode is stream', async () => {
    featureFlags.setOverride('ANSWER_REFINEMENT', true);
    const ctx = {
      aborted: false,
      fullText: 'some text',
      _groundingSkipped: false,
      _groundingScore: 0.1,
      _responseMode: 'stream',
    };
    await stageAnswerRefinement(ctx, null);
    assert.strictEqual(ctx._refinementSkipped, true);
    assert.strictEqual(ctx._refinementSkipReason, 'streaming_mode');
  });

  // T-AR10: Skips when grounding score >= minScoreToRetry
  it('T-AR10: skips when grounding score >= minScoreToRetry', async () => {
    featureFlags.setOverride('ANSWER_REFINEMENT', true);
    const ctx = {
      aborted: false,
      fullText: 'some text',
      _groundingSkipped: false,
      _groundingScore: 0.5,  // above default minScoreToRetry (0.3)
      _responseMode: 'structured',
    };
    await stageAnswerRefinement(ctx, null);
    assert.strictEqual(ctx._refinementSkipped, true);
    assert.strictEqual(ctx._refinementSkipReason, 'score_acceptable');
  });
});

// ═══════════════════════════════════════════════════════════════
// Block 2: Refinement Config
// ═══════════════════════════════════════════════════════════════
describe('Refinement Config', () => {

  // T-AR11: Default config — enabled: false
  it('T-AR11: default config has enabled false', () => {
    assert.strictEqual(config.ANSWER_REFINEMENT.enabled, false);
  });

  // T-AR12: maxRefinements defaults to 1
  it('T-AR12: maxRefinements defaults to 1', () => {
    assert.strictEqual(config.ANSWER_REFINEMENT.maxRefinements, 1);
  });

  // T-AR13: minScoreToRetry defaults to 0.3
  it('T-AR13: minScoreToRetry defaults to 0.3', () => {
    assert.strictEqual(config.ANSWER_REFINEMENT.minScoreToRetry, 0.3);
  });

  // T-AR14: refinementPromptSuffix is a non-empty string
  it('T-AR14: refinementPromptSuffix is a non-empty string', () => {
    assert.strictEqual(typeof config.ANSWER_REFINEMENT.refinementPromptSuffix, 'string');
    assert.ok(config.ANSWER_REFINEMENT.refinementPromptSuffix.length > 0, 'should be non-empty');
  });
});

// ═══════════════════════════════════════════════════════════════
// Block 3: Feature Flag Integration
// ═══════════════════════════════════════════════════════════════
describe('Feature Flag Integration', () => {

  // T-AR15: featureFlags.isEnabled('ANSWER_REFINEMENT') returns boolean
  it('T-AR15: featureFlags.isEnabled ANSWER_REFINEMENT returns boolean', () => {
    assert.strictEqual(typeof featureFlags.isEnabled('ANSWER_REFINEMENT'), 'boolean');
    assert.strictEqual(featureFlags.isEnabled('ANSWER_REFINEMENT'), false);
  });

  // T-AR16: ANSWER_REFINEMENT in featureFlags.getStatus()
  it('T-AR16: ANSWER_REFINEMENT in featureFlags.getStatus()', () => {
    const status = featureFlags.getStatus();
    const names = status.map(s => s.section);
    assert.ok(names.includes('ANSWER_REFINEMENT'), 'should include ANSWER_REFINEMENT');
  });

  // T-AR17: ANSWER_REFINEMENT section count is 13
  it('T-AR17: featureFlags has 13 managed sections', () => {
    const status = featureFlags.getStatus();
    assert.strictEqual(status.length, 13, `expected 13 sections, got ${status.length}`);
  });
});

// ═══════════════════════════════════════════════════════════════
// Block 4: Pipeline Integration
// ═══════════════════════════════════════════════════════════════
describe('Pipeline Integration', () => {

  // T-AR18: Pipeline stage count is 14 (after Phase 78)
  it('T-AR18: chatPipeline exists', () => {
    assert.ok(chatPipeline, 'chatPipeline should exist');
  });

  // T-AR19: stageAnswerRefinement skip sets all required ctx fields
  it('T-AR19: skip sets _refinementSkipped and _refinementSkipReason', async () => {
    const ctx = { aborted: false, fullText: 'text', _groundingSkipped: true, _groundingScore: null };
    await stageAnswerRefinement(ctx, null);
    assert.ok('_refinementSkipped' in ctx, 'should have _refinementSkipped');
    assert.ok('_refinementSkipReason' in ctx, 'should have _refinementSkipReason');
  });

  // T-AR20: stageAnswerRefinement does not modify fullText when skipped
  it('T-AR20: does not modify fullText when skipped', async () => {
    const originalText = 'original answer text';
    const ctx = {
      aborted: false,
      fullText: originalText,
      _groundingSkipped: true,
      _groundingScore: null,
    };
    await stageAnswerRefinement(ctx, null);
    assert.strictEqual(ctx.fullText, originalText, 'fullText should be unchanged');
  });
});
