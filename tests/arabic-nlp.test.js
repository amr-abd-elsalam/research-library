// tests/arabic-nlp.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 72 — Arabic NLP shared utility tests
// Tests: removeDiacritics, normalizeArabic, tokenize, tokenizeLight,
// splitSentences, STOP_WORDS export.
// Stateless module — no cleanup needed.
// ═══════════════════════════════════════════════════════════════

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  removeDiacritics,
  normalizeArabic,
  tokenize,
  tokenizeLight,
  splitSentences,
  cosineSimilarity,
  STOP_WORDS,
} from '../server/services/arabicNlp.js';

describe('arabicNlp — removeDiacritics', () => {

  // T-NLP01: strips all tashkeel marks
  it('T-NLP01: strips all tashkeel marks (فَتَحَ → فتح)', () => {
    assert.strictEqual(removeDiacritics('فَتَحَ'), 'فتح');
    assert.strictEqual(removeDiacritics('الذَّكَاءُ الاصْطِنَاعِيُّ'), 'الذكاء الاصطناعي');
  });

  // T-NLP02: preserves text without diacritics
  it('T-NLP02: preserves text without diacritics', () => {
    assert.strictEqual(removeDiacritics('مرحبا بالعالم'), 'مرحبا بالعالم');
    assert.strictEqual(removeDiacritics('hello world'), 'hello world');
  });

  // T-NLP03: empty/null input returns empty string
  it('T-NLP03: empty/null input returns empty string', () => {
    assert.strictEqual(removeDiacritics(''), '');
    assert.strictEqual(removeDiacritics(null), '');
    assert.strictEqual(removeDiacritics(undefined), '');
  });
});

describe('arabicNlp — normalizeArabic', () => {

  // T-NLP04: alef variants → bare alef
  it('T-NLP04: alef variants (أ إ آ) → bare alef (ا)', () => {
    assert.strictEqual(normalizeArabic('أحمد'), 'احمد');
    assert.strictEqual(normalizeArabic('إسلام'), 'اسلام');
    assert.strictEqual(normalizeArabic('آلة'), 'اله');
  });

  // T-NLP05: taa marbuta → haa
  it('T-NLP05: taa marbuta (ة) → haa (ه)', () => {
    assert.strictEqual(normalizeArabic('مكتبة'), 'مكتبه');
    assert.strictEqual(normalizeArabic('جامعة'), 'جامعه');
  });

  // T-NLP06: alef maqsura → yaa
  it('T-NLP06: alef maqsura (ى) → yaa (ي)', () => {
    assert.strictEqual(normalizeArabic('على'), 'علي');
    assert.strictEqual(normalizeArabic('مستشفى'), 'مستشفي');
  });

  // T-NLP07: preserves non-Arabic text unchanged
  it('T-NLP07: preserves non-Arabic text unchanged', () => {
    assert.strictEqual(normalizeArabic('hello world 123'), 'hello world 123');
  });

  // T-NLP08: empty/null input returns empty string
  it('T-NLP08: empty/null input returns empty string', () => {
    assert.strictEqual(normalizeArabic(''), '');
    assert.strictEqual(normalizeArabic(null), '');
    assert.strictEqual(normalizeArabic(undefined), '');
  });
});

describe('arabicNlp — tokenizeLight', () => {

  // T-NLP09: Arabic text with diacritics returns clean token Set
  it('T-NLP09: Arabic text with diacritics returns clean token Set', () => {
    const tokens = tokenizeLight('الذَّكَاءُ الاصْطِنَاعِيُّ يُسَاعِدُ');
    assert.ok(tokens instanceof Set, 'should return a Set');
    assert.ok(tokens.has('الذكاء'), 'should contain الذكاء');
    assert.ok(tokens.has('الاصطناعي'), 'should contain الاصطناعي');
    assert.ok(tokens.has('يساعد'), 'should contain يساعد');
  });

  // T-NLP10: filters Arabic stop words
  it('T-NLP10: filters Arabic stop words', () => {
    const tokens = tokenizeLight('المنصة هي أداة من أدوات البحث');
    assert.ok(!tokens.has('هي'), 'should filter Arabic stop word هي');
    assert.ok(!tokens.has('من'), 'should filter Arabic stop word من');
    assert.ok(tokens.has('المنصة'), 'should keep المنصة');
    assert.ok(tokens.has('أداة'), 'should keep أداة');
    assert.ok(tokens.has('أدوات'), 'should keep أدوات');
    assert.ok(tokens.has('البحث'), 'should keep البحث');
  });

  // T-NLP11: filters English stop words
  it('T-NLP11: filters English stop words', () => {
    const tokens = tokenizeLight('this is a test for the system');
    assert.ok(!tokens.has('this'), 'should filter this');
    assert.ok(!tokens.has('is'), 'should filter is');
    assert.ok(!tokens.has('the'), 'should filter the');
    assert.ok(!tokens.has('for'), 'should filter for');
    assert.ok(tokens.has('test'), 'should keep test');
    assert.ok(tokens.has('system'), 'should keep system');
  });

  // T-NLP12: handles mixed Arabic/English text
  it('T-NLP12: handles mixed Arabic/English text', () => {
    const tokens = tokenizeLight('منصة AI تستخدم machine learning');
    assert.ok(tokens.has('منصة'), 'should keep منصة');
    assert.ok(tokens.has('ai'), 'should keep ai (lowercased)');
    assert.ok(tokens.has('تستخدم'), 'should keep تستخدم');
    assert.ok(tokens.has('machine'), 'should keep machine');
    assert.ok(tokens.has('learning'), 'should keep learning');
  });

  // T-NLP13: empty/null input returns empty Set
  it('T-NLP13: empty/null input returns empty Set', () => {
    assert.strictEqual(tokenizeLight('').size, 0);
    assert.strictEqual(tokenizeLight(null).size, 0);
    assert.strictEqual(tokenizeLight(undefined).size, 0);
    assert.ok(tokenizeLight(null) instanceof Set);
  });

  // T-NLP14: filters tokens shorter than 2 chars
  it('T-NLP14: filters tokens shorter than 2 chars', () => {
    const tokens = tokenizeLight('x ab abc');
    assert.ok(!tokens.has('x'), 'should filter single char token');
    assert.ok(tokens.has('ab'), 'should keep 2-char token');
    assert.ok(tokens.has('abc'), 'should keep 3-char token');
  });
});

describe('arabicNlp — tokenize (with normalization)', () => {

  // T-NLP15: includes Arabic normalization
  it('T-NLP15: includes Arabic normalization (ة→ه, أ→ا, ى→ي)', () => {
    const tokens = tokenize('مكتبة أحمد على');
    // 'مكتبة' → normalized to 'مكتبه'
    assert.ok(tokens.has('مكتبه'), 'ة should be normalized to ه');
    // 'أحمد' → normalized to 'احمد'
    assert.ok(tokens.has('احمد'), 'أ should be normalized to ا');
    // 'على' is a stop word but normalizeArabic converts ى→ي BEFORE stop word check
    // so 'على' becomes 'علي' which is NOT in STOP_WORDS → it passes through
    assert.ok(!tokens.has('على'), 'original form should not be present (normalized away)');
    assert.ok(tokens.has('علي'), 'normalized form علي passes through (not in STOP_WORDS)');
  });
});

describe('arabicNlp — splitSentences', () => {

  // T-NLP16: splits on period, newline, ?, !, ؟
  it('T-NLP16: splits on period, newline, ?, !, ؟', () => {
    const result = splitSentences('الجملة الأولى هنا.\nالجملة الثانية هنا؟الجملة الثالثة هنا!الجملة الرابعة');
    assert.ok(result.length >= 4, `expected >= 4 sentences, got ${result.length}`);
    assert.strictEqual(result[0], 'الجملة الأولى هنا');
    assert.strictEqual(result[1], 'الجملة الثانية هنا');
    assert.strictEqual(result[2], 'الجملة الثالثة هنا');
  });

  // T-NLP17: filters segments shorter than default minLength (10)
  it('T-NLP17: filters segments shorter than minLength (default 10)', () => {
    const result = splitSentences('قصير.\nهذه جملة طويلة بما يكفي لتمرير الفلتر.');
    assert.strictEqual(result.length, 1, 'short segment should be filtered');
    assert.strictEqual(result[0], 'هذه جملة طويلة بما يكفي لتمرير الفلتر');
  });

  // T-NLP18: custom minLength parameter works
  it('T-NLP18: custom minLength parameter works', () => {
    const result = splitSentences('قصير.\nأطول قليلاً.\nجملة طويلة جداً هنا.', 5);
    assert.ok(result.length >= 2, `expected >= 2 sentences with minLength=5, got ${result.length}`);
  });

  // T-NLP19: empty/null input returns empty array
  it('T-NLP19: empty/null input returns empty array', () => {
    assert.deepStrictEqual(splitSentences(''), []);
    assert.deepStrictEqual(splitSentences(null), []);
    assert.deepStrictEqual(splitSentences(undefined), []);
  });
});

describe('arabicNlp — STOP_WORDS export', () => {

  // T-NLP20: exported and is a Set
  it('T-NLP20: STOP_WORDS is exported and is a Set', () => {
    assert.ok(STOP_WORDS instanceof Set, 'STOP_WORDS should be a Set');
    assert.ok(STOP_WORDS.size > 0, 'STOP_WORDS should not be empty');
  });

  // T-NLP21: contains Arabic stop words
  it('T-NLP21: contains Arabic stop words', () => {
    assert.ok(STOP_WORDS.has('من'), 'should contain من');
    assert.ok(STOP_WORDS.has('في'), 'should contain في');
    assert.ok(STOP_WORDS.has('على'), 'should contain على');
    assert.ok(STOP_WORDS.has('هذا'), 'should contain هذا');
    assert.ok(STOP_WORDS.has('التي'), 'should contain التي');
  });

  // T-NLP22: contains English stop words
  it('T-NLP22: contains English stop words', () => {
    assert.ok(STOP_WORDS.has('the'), 'should contain the');
    assert.ok(STOP_WORDS.has('is'), 'should contain is');
    assert.ok(STOP_WORDS.has('and'), 'should contain and');
    assert.ok(STOP_WORDS.has('of'), 'should contain of');
    assert.ok(STOP_WORDS.has('not'), 'should contain not');
  });
});

describe('arabicNlp — cosineSimilarity', () => {

  // T-NLP23: identical vectors return ~1
  it('T-NLP23: identical vectors return ~1', () => {
    const vec = [0.5, 0.3, 0.8, 0.1];
    const result = cosineSimilarity(vec, vec);
    assert.ok(result >= 0.999 && result <= 1.0, `expected ~1, got ${result}`);
  });

  // T-NLP24: orthogonal vectors return 0
  it('T-NLP24: orthogonal vectors return 0', () => {
    const vecA = [1, 0, 0];
    const vecB = [0, 1, 0];
    const result = cosineSimilarity(vecA, vecB);
    assert.strictEqual(result, 0);
  });

  // T-NLP25: empty/null input returns 0
  it('T-NLP25: empty/null input returns 0', () => {
    assert.strictEqual(cosineSimilarity(null, [1, 2]), 0);
    assert.strictEqual(cosineSimilarity([1, 2], null), 0);
    assert.strictEqual(cosineSimilarity([], []), 0);
    assert.strictEqual(cosineSimilarity([1, 2], [1, 2, 3]), 0); // different lengths
  });

  // T-NLP26: known vectors return expected value (verify math)
  it('T-NLP26: known vectors return expected value', () => {
    // vec A = [1, 0], vec B = [1, 1]
    // dot = 1, magA = 1, magB = sqrt(2)
    // cosine = 1 / sqrt(2) ≈ 0.7071
    const result = cosineSimilarity([1, 0], [1, 1]);
    assert.ok(result >= 0.707 && result <= 0.708, `expected ~0.7071, got ${result}`);
  });
});
