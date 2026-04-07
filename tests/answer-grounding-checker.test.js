// tests/answer-grounding-checker.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 69 — AnswerGroundingChecker unit tests
// Tests: disabled passthrough, empty/null answer, fully grounded,
// ungrounded, partial, diacritics, claim extraction, maxClaims,
// single claim, counts, reset.
// Uses the class constructor + featureFlags override for isolation.
// ═══════════════════════════════════════════════════════════════

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { AnswerGroundingChecker } from '../server/services/answerGroundingChecker.js';
import { featureFlags } from '../server/services/featureFlags.js';

describe('AnswerGroundingChecker', () => {
  const checker = new AnswerGroundingChecker();

  afterEach(() => {
    featureFlags.clearOverride('GROUNDING');
    featureFlags.clearOverride('SEMANTIC_MATCHING');
  });

  // T-AGC01: disabled — check() returns score: 1, totalClaims: 0
  it('T-AGC01: returns score 1 and totalClaims 0 when disabled', async () => {
    // Config default is enabled: false, no override set
    const result = await checker.check('المنصة توفر مساعد بحثي ذكي', 'بعض المحتوى');
    assert.strictEqual(result.score, 1);
    assert.strictEqual(result.totalClaims, 0);
    assert.strictEqual(result.groundedClaims, 0);
    assert.deepStrictEqual(result.ungroundedClaims, []);
    assert.deepStrictEqual(result.flags, []);
    assert.strictEqual(result.semanticUsed, false);
  });

  // T-AGC02: enabled — empty answer returns score: 1, totalClaims: 0
  it('T-AGC02: empty answer returns score 1 when enabled', async () => {
    featureFlags.setOverride('GROUNDING', true);
    const result = await checker.check('', 'بعض المحتوى');
    assert.strictEqual(result.score, 1);
    assert.strictEqual(result.totalClaims, 0);
    assert.strictEqual(result.groundedClaims, 0);
  });

  // T-AGC03: enabled — null answer returns score: 1
  it('T-AGC03: null answer returns score 1 when enabled', async () => {
    featureFlags.setOverride('GROUNDING', true);
    const result = await checker.check(null, 'بعض المحتوى');
    assert.strictEqual(result.score, 1);
    assert.strictEqual(result.totalClaims, 0);
  });

  // T-AGC04: enabled — answer fully grounded in context → score close to 1.0
  it('T-AGC04: fully grounded answer returns high score', async () => {
    featureFlags.setOverride('GROUNDING', true);
    const context = 'المنصة توفر مساعد بحثي ذكي يعتمد على تقنيات الذكاء الاصطناعي المتقدمة لمساعدة الطلاب في البحث العلمي والدراسة';
    const answer = 'المنصة توفر مساعد بحثي ذكي يعتمد على تقنيات الذكاء الاصطناعي المتقدمة.\nهذا المساعد يساعد الطلاب في البحث العلمي والدراسة.';
    const result = await checker.check(answer, context);
    assert.ok(result.score >= 0.8, `expected score >= 0.8, got ${result.score}`);
    assert.ok(result.totalClaims > 0, 'should have at least one claim');
    assert.strictEqual(result.groundedClaims, result.totalClaims, 'all claims should be grounded');
    assert.strictEqual(result.ungroundedClaims.length, 0);
  });

  // T-AGC05: enabled — answer completely ungrounded → score close to 0.0
  it('T-AGC05: completely ungrounded answer returns low score', async () => {
    featureFlags.setOverride('GROUNDING', true);
    const context = 'المنصة توفر مساعد بحثي ذكي';
    const answer = 'البرمجة بلغة بايثون تتطلب معرفة بالمكتبات العلمية مثل نمباي وباندا.\nتعلم الخوارزميات يحتاج صبر وممارسة مستمرة لفترة طويلة.';
    const result = await checker.check(answer, context);
    assert.ok(result.score <= 0.2, `expected score <= 0.2, got ${result.score}`);
    assert.ok(result.ungroundedClaims.length > 0, 'should have ungrounded claims');
    assert.ok(result.flags.includes('low_grounding'), 'should have low_grounding flag');
  });

  // T-AGC06: enabled — partially grounded answer → score between 0 and 1
  it('T-AGC06: partially grounded answer returns intermediate score', async () => {
    featureFlags.setOverride('GROUNDING', true);
    const context = 'المنصة توفر مساعد بحثي ذكي يعتمد على الذكاء الاصطناعي لمساعدة المستخدمين';
    const answer = 'المنصة توفر مساعد بحثي ذكي يعتمد على الذكاء الاصطناعي.\nتعلم البرمجة بلغة جافاسكريبت يتطلب معرفة أساسية بالمتصفحات.';
    const result = await checker.check(answer, context);
    assert.ok(result.score > 0 && result.score < 1, `expected score between 0 and 1, got ${result.score}`);
    assert.ok(result.totalClaims >= 2, 'should have at least 2 claims');
    assert.ok(result.groundedClaims >= 1, 'should have at least 1 grounded claim');
    assert.ok(result.ungroundedClaims.length >= 1, 'should have at least 1 ungrounded claim');
  });

  // T-AGC07: enabled — Arabic diacritics removed before comparison
  it('T-AGC07: diacritics are removed for comparison', async () => {
    featureFlags.setOverride('GROUNDING', true);
    // Context without diacritics, answer with diacritics
    const context = 'الذكاء الاصطناعي يساعد في تحليل البيانات الكبيرة وتقديم نتائج دقيقة للمستخدمين';
    const answer = 'الذَّكَاءُ الاصْطِنَاعِيُّ يُسَاعِدُ فِي تَحْلِيلِ البَيَانَاتِ الكَبِيرَةِ وتقديم نتائج دقيقة.';
    const result = await checker.check(answer, context);
    assert.ok(result.score >= 0.8, `expected score >= 0.8 with diacritics removed, got ${result.score}`);
  });

  // T-AGC08: enabled — claim extraction splits correctly on Arabic punctuation
  it('T-AGC08: claims split on sentence boundaries', async () => {
    featureFlags.setOverride('GROUNDING', true);
    const context = 'المنصة رائعة وتعمل بشكل ممتاز وتوفر أدوات متعددة للبحث العلمي والتحليل';
    const answer = 'المنصة رائعة وتعمل بشكل ممتاز.\nتوفر أدوات متعددة للبحث.\nتدعم التحليل العلمي المتقدم.';
    const result = await checker.check(answer, context);
    assert.ok(result.totalClaims >= 2, `expected at least 2 claims, got ${result.totalClaims}`);
  });

  // T-AGC09: enabled — maxClaimsToCheck respected
  it('T-AGC09: maxClaimsToCheck limits number of claims checked', async () => {
    featureFlags.setOverride('GROUNDING', true);
    // Build answer with 15 claim-like sentences
    const sentences = [];
    for (let i = 0; i < 15; i++) {
      sentences.push(`هذا هو المحتوى رقم ${i + 1} في الإجابة الطويلة جداً`);
    }
    const answer = sentences.join('.\n');
    const context = 'بعض المحتوى البسيط';
    const result = await checker.check(answer, context);
    // Config default maxClaimsToCheck = 10
    assert.ok(result.totalClaims <= 10, `expected totalClaims <= 10 (maxClaimsToCheck), got ${result.totalClaims}`);
  });

  // T-AGC10: enabled — single short claim answer
  it('T-AGC10: single claim answer works correctly', async () => {
    featureFlags.setOverride('GROUNDING', true);
    const context = 'المنصة تعمل على جميع الأجهزة المحمولة والحواسيب';
    const answer = 'المنصة تعمل على جميع الأجهزة المحمولة والحواسيب بشكل كامل';
    const result = await checker.check(answer, context);
    assert.ok(result.totalClaims >= 1, 'should have at least 1 claim');
    assert.ok(result.score >= 0.5, `expected score >= 0.5, got ${result.score}`);
  });

  // T-AGC11: counts() returns { enabled: boolean }
  it('T-AGC11: counts returns correct structure', () => {
    const c1 = checker.counts();
    assert.strictEqual(typeof c1.enabled, 'boolean');
    assert.strictEqual(c1.enabled, false); // default

    featureFlags.setOverride('GROUNDING', true);
    const c2 = checker.counts();
    assert.strictEqual(c2.enabled, true);
  });

  // T-AGC12: reset() is callable (no-op — no error thrown)
  it('T-AGC12: reset is callable without error', () => {
    assert.doesNotThrow(() => checker.reset());
  });

  // T-AGC13: disabled — check() returns semanticUsed: false
  it('T-AGC13: disabled returns semanticUsed false', async () => {
    // GROUNDING disabled + SEMANTIC_MATCHING disabled
    const result = await checker.check('بعض النص هنا', 'محتوى السياق');
    assert.strictEqual(result.semanticUsed, false);
  });

  // T-AGC14: enabled + SEMANTIC_MATCHING disabled — token-only, semanticUsed: false
  it('T-AGC14: GROUNDING enabled + SEMANTIC_MATCHING disabled — token-only behavior', async () => {
    featureFlags.setOverride('GROUNDING', true);
    // SEMANTIC_MATCHING stays disabled (default)
    const context = 'المنصة توفر مساعد بحثي ذكي يعتمد على الذكاء الاصطناعي المتقدم';
    const answer = 'المنصة توفر مساعد بحثي ذكي يعتمد على الذكاء الاصطناعي المتقدم بشكل فعال';
    const result = await checker.check(answer, context);
    assert.strictEqual(result.semanticUsed, false, 'semanticUsed should be false when SEMANTIC_MATCHING disabled');
    assert.ok(result.score >= 0.5, 'token-only score should still work');
    assert.ok(result.totalClaims >= 1);
  });

  // T-AGC15: enabled + SEMANTIC_MATCHING enabled — fallbackOnError graceful (no real Gemini API in tests)
  it('T-AGC15: SEMANTIC_MATCHING enabled — fallback on embed error (no API)', async () => {
    featureFlags.setOverride('GROUNDING', true);
    featureFlags.setOverride('SEMANTIC_MATCHING', true);
    // embedBatch will fail (no GEMINI_API_KEY in test env) → graceful fallback to token-only
    const context = 'المنصة توفر مساعد بحثي ذكي يعتمد على الذكاء الاصطناعي';
    const answer = 'المنصة توفر مساعد بحثي ذكي يعتمد على الذكاء الاصطناعي بشكل كبير';
    const result = await checker.check(answer, context);
    // Should NOT throw — fallbackOnError is true by default
    assert.strictEqual(result.semanticUsed, false, 'semanticUsed should be false after fallback');
    assert.ok(result.score >= 0, 'score should still be computed via token-only');
    assert.ok(result.totalClaims >= 1);
  });

  // T-AGC16: check() result always contains semanticUsed field
  it('T-AGC16: result always contains semanticUsed field', async () => {
    featureFlags.setOverride('GROUNDING', true);
    const result = await checker.check('إجابة بسيطة هنا للاختبار', 'سياق المحتوى للاختبار');
    assert.ok('semanticUsed' in result, 'result should contain semanticUsed field');
    assert.strictEqual(typeof result.semanticUsed, 'boolean');
  });
});
