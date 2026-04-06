// tests/query-complexity-analyzer.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 64 — QueryComplexityAnalyzer unit tests
// Tests: disabled passthrough, complexity detection (comparative,
// analytical, multi-part, exploratory, factual), scoring, strategy
// resolution, counts.
// Uses the class constructor + featureFlags override for isolation.
// ═══════════════════════════════════════════════════════════════

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { QueryComplexityAnalyzer } from '../server/services/queryComplexityAnalyzer.js';
import { featureFlags } from '../server/services/featureFlags.js';

describe('QueryComplexityAnalyzer', () => {
  const analyzer = new QueryComplexityAnalyzer();

  afterEach(() => {
    featureFlags.clearOverride('QUERY_COMPLEXITY');
  });

  // T-QCA01: disabled → analyze() returns factual defaults
  it('T-QCA01: returns factual defaults when disabled', () => {
    // Config default is enabled: false, no override set
    const result = analyzer.analyze('ما الفرق بين X وY؟');
    assert.strictEqual(result.type, 'factual');
    assert.strictEqual(result.score, 1);
    assert.deepStrictEqual(result.indicators, []);
  });

  // T-QCA02: enabled + simple factual question
  it('T-QCA02: simple factual question returns type=factual', () => {
    featureFlags.setOverride('QUERY_COMPLEXITY', true);
    const result = analyzer.analyze('ما هو الذكاء الاصطناعي؟');
    assert.strictEqual(result.type, 'factual');
    assert.strictEqual(result.score, 1);
  });

  // T-QCA03: enabled + comparative question with "الفرق"
  it('T-QCA03: detects comparative question with الفرق', () => {
    featureFlags.setOverride('QUERY_COMPLEXITY', true);
    const result = analyzer.analyze('ما الفرق بين الباقة الأساسية والمتقدمة؟');
    assert.strictEqual(result.type, 'comparative');
    assert.ok(result.score >= 3, `score should be >= 3, got ${result.score}`);
    assert.ok(result.indicators.includes('comparative'));
  });

  // T-QCA04: enabled + comparative question with "قارن بين"
  it('T-QCA04: detects comparative question with قارن', () => {
    featureFlags.setOverride('QUERY_COMPLEXITY', true);
    const result = analyzer.analyze('قارن بين المنهج التقليدي والحديث');
    assert.strictEqual(result.type, 'comparative');
    assert.ok(result.indicators.includes('comparative'));
  });

  // T-QCA05: enabled + analytical question with "لماذا"
  it('T-QCA05: detects analytical question with لماذا', () => {
    featureFlags.setOverride('QUERY_COMPLEXITY', true);
    const result = analyzer.analyze('لماذا يفشل المشروع؟');
    assert.strictEqual(result.type, 'analytical');
    assert.ok(result.indicators.includes('analytical'));
  });

  // T-QCA06: enabled + analytical question with "كيف يمكن"
  it('T-QCA06: detects analytical question with كيف يمكن', () => {
    featureFlags.setOverride('QUERY_COMPLEXITY', true);
    const result = analyzer.analyze('كيف يمكن تحسين الأداء؟');
    assert.strictEqual(result.type, 'analytical');
    assert.ok(result.indicators.includes('analytical'));
  });

  // T-QCA07: enabled + multi-part question with multiple "؟"
  it('T-QCA07: detects multi-part question with multiple question marks', () => {
    featureFlags.setOverride('QUERY_COMPLEXITY', true);
    const result = analyzer.analyze('ما هي المنصة؟ وكيف تعمل؟ وما سعرها؟');
    assert.strictEqual(result.type, 'multi_part');
    assert.ok(result.indicators.includes('multi_part'));
  });

  // T-QCA08: enabled + multi-part question with "أولاً... ثانياً"
  it('T-QCA08: detects multi-part question with أولاً ثانياً', () => {
    featureFlags.setOverride('QUERY_COMPLEXITY', true);
    const result = analyzer.analyze('أولاً اشرح المفهوم ثانياً قدم أمثلة');
    assert.strictEqual(result.type, 'multi_part');
    assert.ok(result.indicators.includes('multi_part'));
  });

  // T-QCA09: enabled + exploratory question with "اشرح" + long message
  it('T-QCA09: detects exploratory question with اشرح and long message', () => {
    featureFlags.setOverride('QUERY_COMPLEXITY', true);
    const result = analyzer.analyze('اشرح لي بالتفصيل ما هي المنصة وكيف تعمل وما المميزات التي تقدمها للمستخدم');
    assert.strictEqual(result.type, 'exploratory');
    assert.ok(result.indicators.includes('exploratory'));
  });

  // T-QCA10: enabled + very long query (40+ words) → score ≥ 3
  it('T-QCA10: very long query gets high score with very_long_query indicator', () => {
    featureFlags.setOverride('QUERY_COMPLEXITY', true);
    // Build a 45-word query
    const words = Array(45).fill('كلمة').join(' ');
    const result = analyzer.analyze(words);
    assert.ok(result.score >= 3, `score should be >= 3 for 45 words, got ${result.score}`);
    assert.ok(result.indicators.includes('very_long_query'));
    assert.ok(result.indicators.includes('long_query'));
  });

  // T-QCA11: enabled + empty/null message → factual defaults
  it('T-QCA11: empty or null message returns factual defaults', () => {
    featureFlags.setOverride('QUERY_COMPLEXITY', true);
    const result1 = analyzer.analyze('');
    assert.strictEqual(result1.type, 'factual');
    assert.strictEqual(result1.score, 1);
    assert.deepStrictEqual(result1.indicators, []);

    const result2 = analyzer.analyze(null);
    assert.strictEqual(result2.type, 'factual');
    assert.strictEqual(result2.score, 1);
  });

  // T-QCA12: enabled + getStrategy('comparative') → returns topK + promptSuffix
  it('T-QCA12: getStrategy returns correct topK and promptSuffix for comparative', () => {
    featureFlags.setOverride('QUERY_COMPLEXITY', true);
    const strategy = analyzer.getStrategy({ type: 'comparative', score: 3 });
    assert.strictEqual(strategy.topK, 8);
    assert.ok(strategy.promptSuffix && strategy.promptSuffix.length > 0, 'promptSuffix should be non-empty');
  });

  // T-QCA13: disabled + getStrategy() → returns null values
  it('T-QCA13: getStrategy returns null values when disabled', () => {
    // No override — default disabled
    const strategy = analyzer.getStrategy({ type: 'comparative', score: 3 });
    assert.strictEqual(strategy.topK, null);
    assert.strictEqual(strategy.promptSuffix, null);
  });

  // T-QCA14: counts() → returns { enabled: boolean }
  it('T-QCA14: counts returns correct structure', () => {
    const c1 = analyzer.counts();
    assert.strictEqual(typeof c1.enabled, 'boolean');
    assert.strictEqual(c1.enabled, false); // default

    featureFlags.setOverride('QUERY_COMPLEXITY', true);
    const c2 = analyzer.counts();
    assert.strictEqual(c2.enabled, true);
  });
});
