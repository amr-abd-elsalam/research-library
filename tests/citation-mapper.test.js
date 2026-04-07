// tests/citation-mapper.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 71 — CitationMapper unit tests
// Tests: disabled passthrough, empty/null answer, single/multi
// source mapping, Arabic diacritics, maxCitations, minOverlap,
// sourceRelevance, counts, reset.
// Uses the class constructor + featureFlags override for isolation.
// ═══════════════════════════════════════════════════════════════

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { CitationMapper } from '../server/services/citationMapper.js';
import { featureFlags } from '../server/services/featureFlags.js';

describe('CitationMapper', () => {
  const mapper = new CitationMapper();

  afterEach(() => {
    featureFlags.clearOverride('CITATION');
    featureFlags.clearOverride('SEMANTIC_MATCHING');
  });

  // T-CM01: disabled — map() returns empty citations + empty sourceRelevance
  it('T-CM01: returns empty when disabled', async () => {
    // Config default is enabled: false, no override set
    const result = await mapper.map('بعض النص', [{ file: 'a.md', section: '', snippet: '', content: 'محتوى', score: 0.9 }], 'سياق');
    assert.deepStrictEqual(result.citations, []);
    assert.deepStrictEqual(result.sourceRelevance, []);
  });

  // T-CM02: empty answer — returns empty
  it('T-CM02: empty answer returns empty', async () => {
    featureFlags.setOverride('CITATION', true);
    const result = await mapper.map('', [{ file: 'a.md', section: '', snippet: '', content: 'محتوى', score: 0.9 }], 'سياق');
    assert.deepStrictEqual(result.citations, []);
  });

  // T-CM03: null answer — returns empty
  it('T-CM03: null answer returns empty', async () => {
    featureFlags.setOverride('CITATION', true);
    const result = await mapper.map(null, [{ file: 'a.md', section: '', snippet: '', content: 'محتوى', score: 0.9 }], 'سياق');
    assert.deepStrictEqual(result.citations, []);
    assert.deepStrictEqual(result.sourceRelevance, []);
  });

  // T-CM04: single sentence maps to nearest source (highest overlap)
  it('T-CM04: single sentence maps to highest overlap source', async () => {
    featureFlags.setOverride('CITATION', true);
    const sources = [
      { file: 'a.md', section: '', snippet: '', content: 'البرمجة بلغة بايثون تحتاج مكتبات علمية متعددة', score: 0.8 },
      { file: 'b.md', section: '', snippet: '', content: 'الذكاء الاصطناعي يعتمد على تحليل البيانات الضخمة', score: 0.7 },
    ];
    const answer = 'الذكاء الاصطناعي يعتمد على تحليل البيانات الضخمة بشكل فعال';
    const result = await mapper.map(answer, sources, '');
    assert.ok(result.citations.length >= 1, 'should have at least 1 citation');
    assert.strictEqual(result.citations[0].sourceIndex, 1, 'should match source b.md');
  });

  // T-CM05: multiple sentences map to different sources
  it('T-CM05: multiple sentences map to different sources', async () => {
    featureFlags.setOverride('CITATION', true);
    const sources = [
      { file: 'a.md', section: '', snippet: '', content: 'المنصة توفر مساعد بحثي ذكي يعتمد على الذكاء الاصطناعي', score: 0.9 },
      { file: 'b.md', section: '', snippet: '', content: 'البرمجة بلغة جافاسكريبت تتطلب معرفة بالمتصفحات الحديثة', score: 0.8 },
    ];
    const answer = 'المنصة توفر مساعد بحثي ذكي يعتمد على الذكاء الاصطناعي.\nالبرمجة بلغة جافاسكريبت تتطلب معرفة بالمتصفحات الحديثة.';
    const result = await mapper.map(answer, sources, '');
    assert.ok(result.citations.length >= 2, `expected >= 2 citations, got ${result.citations.length}`);
    const sourceIndices = result.citations.map(c => c.sourceIndex);
    assert.ok(sourceIndices.includes(0), 'should include source 0');
    assert.ok(sourceIndices.includes(1), 'should include source 1');
  });

  // T-CM06: Arabic text with diacritics — maps correctly (diacritics stripped)
  it('T-CM06: Arabic diacritics stripped before comparison', async () => {
    featureFlags.setOverride('CITATION', true);
    const sources = [
      { file: 'a.md', section: '', snippet: '', content: 'الذكاء الاصطناعي يساعد في تحليل البيانات الكبيرة وتقديم نتائج دقيقة', score: 0.9 },
    ];
    const answer = 'الذَّكَاءُ الاصْطِنَاعِيُّ يُسَاعِدُ فِي تَحْلِيلِ البَيَانَاتِ الكَبِيرَةِ وتقديم نتائج دقيقة';
    const result = await mapper.map(answer, sources, '');
    assert.ok(result.citations.length >= 1, 'should match despite diacritics');
    assert.strictEqual(result.citations[0].sourceIndex, 0);
    assert.ok(result.citations[0].overlap >= 0.5, `overlap should be high, got ${result.citations[0].overlap}`);
  });

  // T-CM07: maxCitations limits output — only top N by overlap
  it('T-CM07: maxCitations limits output', async () => {
    featureFlags.setOverride('CITATION', true);
    // config.CITATION.maxCitations = 5 by default
    // Create answer with 8 sentences all matching the same source
    const content = 'هذا المحتوى يتحدث عن المنصة والتقنيات والأدوات والميزات والخصائص والتحديثات والإصدارات والدعم';
    const sources = [{ file: 'a.md', section: '', snippet: '', content, score: 0.9 }];
    const sentences = [];
    for (let i = 0; i < 8; i++) {
      sentences.push('المحتوى يتحدث عن المنصة والتقنيات والأدوات والميزات الرقم ' + (i + 1));
    }
    const answer = sentences.join('.\n');
    const result = await mapper.map(answer, sources, '');
    assert.ok(result.citations.length <= 5, `expected <= 5, got ${result.citations.length}`);
  });

  // T-CM08: minOverlap filters low-overlap matches — below threshold excluded
  it('T-CM08: minOverlap filters low-overlap matches', async () => {
    featureFlags.setOverride('CITATION', true);
    // config.CITATION.minOverlap = 0.2 by default
    const sources = [
      { file: 'a.md', section: '', snippet: '', content: 'كلمة فريدة جداً لا علاقة لها بأي شيء آخر تماماً', score: 0.5 },
    ];
    // Answer with completely different words
    const answer = 'البرمجة تتطلب تعلم الخوارزميات وهياكل البيانات المتقدمة والمعقدة';
    const result = await mapper.map(answer, sources, '');
    assert.strictEqual(result.citations.length, 0, 'should have no citations for low overlap');
  });

  // T-CM09: sourceRelevance computed for each source — uses score field
  it('T-CM09: sourceRelevance uses source score', async () => {
    featureFlags.setOverride('CITATION', true);
    const sources = [
      { file: 'a.md', section: '', snippet: '', content: 'محتوى أول', score: 0.95 },
      { file: 'b.md', section: '', snippet: '', content: 'محتوى ثاني', score: 0.72 },
    ];
    const result = await mapper.map('محتوى أول في الإجابة الطويلة هنا', sources, '');
    assert.strictEqual(result.sourceRelevance.length, 2);
    assert.strictEqual(result.sourceRelevance[0].sourceIndex, 0);
    assert.strictEqual(result.sourceRelevance[0].relevance, 0.95);
    assert.strictEqual(result.sourceRelevance[1].sourceIndex, 1);
    assert.strictEqual(result.sourceRelevance[1].relevance, 0.72);
  });

  // T-CM10: single source — all matching sentences point to it
  it('T-CM10: single source — sentences map to it', async () => {
    featureFlags.setOverride('CITATION', true);
    const sources = [
      { file: 'a.md', section: '', snippet: '', content: 'المنصة توفر أدوات بحثية متقدمة للطلاب والباحثين', score: 0.9 },
    ];
    const answer = 'المنصة توفر أدوات بحثية متقدمة للطلاب.\nالباحثين يستفيدون من أدوات المنصة المتقدمة.';
    const result = await mapper.map(answer, sources, '');
    for (const cit of result.citations) {
      assert.strictEqual(cit.sourceIndex, 0, 'all citations should point to source 0');
    }
  });

  // T-CM11: counts() returns { enabled }
  it('T-CM11: counts returns correct structure', () => {
    const c1 = mapper.counts();
    assert.strictEqual(typeof c1.enabled, 'boolean');
    assert.strictEqual(c1.enabled, false); // default

    featureFlags.setOverride('CITATION', true);
    const c2 = mapper.counts();
    assert.strictEqual(c2.enabled, true);
  });

  // T-CM12: reset() callable — no-op (no error)
  it('T-CM12: reset is callable without error', () => {
    assert.doesNotThrow(() => mapper.reset());
  });

  // T-CM13: disabled — map() returns empty (no SEMANTIC_MATCHING effect)
  it('T-CM13: disabled returns empty regardless of SEMANTIC_MATCHING', async () => {
    // CITATION disabled, SEMANTIC_MATCHING enabled — should still return empty
    featureFlags.setOverride('SEMANTIC_MATCHING', true);
    const result = await mapper.map('بعض النص', [{ file: 'a.md', section: '', snippet: '', content: 'محتوى', score: 0.9 }], 'سياق');
    assert.deepStrictEqual(result.citations, []);
    assert.deepStrictEqual(result.sourceRelevance, []);
  });

  // T-CM14: CITATION enabled + SEMANTIC_MATCHING disabled — token-only overlap
  it('T-CM14: CITATION enabled + SEMANTIC_MATCHING disabled — token-only behavior', async () => {
    featureFlags.setOverride('CITATION', true);
    // SEMANTIC_MATCHING stays disabled (default)
    const sources = [
      { file: 'a.md', section: '', snippet: '', content: 'المنصة توفر مساعد بحثي ذكي يعتمد على الذكاء الاصطناعي', score: 0.9 },
    ];
    const answer = 'المنصة توفر مساعد بحثي ذكي يعتمد على الذكاء الاصطناعي المتقدم';
    const result = await mapper.map(answer, sources, '');
    assert.ok(result.citations.length >= 1, 'should have citation via token-only');
    assert.strictEqual(result.citations[0].sourceIndex, 0);
  });

  // T-CM15: CITATION + SEMANTIC_MATCHING enabled — fallback on embed error (no API)
  it('T-CM15: SEMANTIC_MATCHING enabled — fallback on embed error (no API)', async () => {
    featureFlags.setOverride('CITATION', true);
    featureFlags.setOverride('SEMANTIC_MATCHING', true);
    // embedBatch will fail (no GEMINI_API_KEY in test env) → graceful fallback to token-only
    const sources = [
      { file: 'a.md', section: '', snippet: '', content: 'المنصة توفر مساعد بحثي ذكي يعتمد على الذكاء الاصطناعي', score: 0.9 },
    ];
    const answer = 'المنصة توفر مساعد بحثي ذكي يعتمد على الذكاء الاصطناعي المتقدم';
    const result = await mapper.map(answer, sources, '');
    // Should NOT throw — fallbackOnError is true by default
    assert.ok(result.citations.length >= 0, 'should return valid result after fallback');
    assert.ok(Array.isArray(result.sourceRelevance), 'sourceRelevance should be array');
  });

  // T-CM16: map() returns consistent shape with all expected fields
  it('T-CM16: map result contains citations and sourceRelevance arrays', async () => {
    featureFlags.setOverride('CITATION', true);
    const sources = [
      { file: 'a.md', section: '', snippet: '', content: 'محتوى المصدر الأول للاختبار', score: 0.85 },
    ];
    const result = await mapper.map('محتوى المصدر الأول للاختبار مع تفاصيل إضافية', sources, '');
    assert.ok(Array.isArray(result.citations), 'citations should be array');
    assert.ok(Array.isArray(result.sourceRelevance), 'sourceRelevance should be array');
    if (result.citations.length > 0) {
      assert.ok('sentenceIndex' in result.citations[0], 'citation should have sentenceIndex');
      assert.ok('sourceIndex' in result.citations[0], 'citation should have sourceIndex');
      assert.ok('overlap' in result.citations[0], 'citation should have overlap');
    }
  });
});
