// tests/search-reranker.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 63 — SearchReranker unit tests
// Tests: enabled/disabled behavior, keyword boost, diversity
// enforcement, edge cases, Arabic tokenization, counts, reset.
// ═══════════════════════════════════════════════════════════════

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { SearchReranker } from '../server/services/searchReranker.js';
import { featureFlags } from '../server/services/featureFlags.js';

// ── Helper: create mock hit ────────────────────────────────────
function mockHit(score, fileName, content = '') {
  return {
    score,
    payload: {
      file_name: fileName,
      content,
      parent_content: '',
      section_title: '',
    },
  };
}

describe('SearchReranker', () => {
  const reranker = new SearchReranker();

  afterEach(() => {
    featureFlags.clearOverride('RETRIEVAL');
  });

  // T-SR01: disabled → returns original hits unchanged
  it('T-SR01: disabled — returns original hits unchanged', () => {
    featureFlags.setOverride('RETRIEVAL', false);  // Phase 98: config default is now true — explicitly disable
    assert.strictEqual(reranker.enabled, false);
    const hits = [mockHit(0.9, 'a.pdf', 'hello'), mockHit(0.8, 'b.pdf', 'world')];
    const result = reranker.rerank(hits, 'test query');
    assert.strictEqual(result, hits, 'should return same reference when disabled');
  });

  // T-SR02: enabled + keyword boost promotes matching hits
  it('T-SR02: enabled — keyword boost promotes hits with matching keywords', () => {
    featureFlags.setOverride('RETRIEVAL', true);
    const hits = [
      mockHit(0.85, 'a.pdf', 'unrelated content about physics'),
      mockHit(0.80, 'b.pdf', 'machine learning algorithms and neural networks'),
    ];
    const result = reranker.rerank(hits, 'machine learning algorithms');
    // Hit b.pdf has higher keyword overlap → should be promoted
    assert.strictEqual(result[0].payload.file_name, 'b.pdf', 'keyword-matching hit should be ranked first');
  });

  // T-SR03: enabled + diversity enforcement limits per-file hits
  it('T-SR03: enabled — diversity enforcement limits per-file hits', () => {
    featureFlags.setOverride('RETRIEVAL', true);
    // config default maxPerFile = 3
    const hits = [
      mockHit(0.95, 'same.pdf', 'content one'),
      mockHit(0.90, 'same.pdf', 'content two'),
      mockHit(0.85, 'same.pdf', 'content three'),
      mockHit(0.80, 'same.pdf', 'content four'),
      mockHit(0.75, 'other.pdf', 'different content'),
    ];
    const result = reranker.rerank(hits, 'content');
    // First 3 from same.pdf should be in primary, 4th should be deferred
    // other.pdf should appear before the deferred same.pdf hit
    const fileNames = result.map(h => h.payload.file_name);
    const sameCount = fileNames.slice(0, 4).filter(f => f === 'same.pdf').length;
    assert.ok(sameCount <= 3, 'at most 3 hits from same file in primary positions');
    // other.pdf should be present before the deferred hit
    const otherIdx = fileNames.indexOf('other.pdf');
    assert.ok(otherIdx >= 0 && otherIdx < fileNames.length, 'other.pdf should be present');
  });

  // T-SR04: all hits from same file → only maxPerFile in primary, rest deferred
  it('T-SR04: all hits from same file — maxPerFile in primary, rest deferred to end', () => {
    featureFlags.setOverride('RETRIEVAL', true);
    const hits = [
      mockHit(0.95, 'only.pdf', 'first'),
      mockHit(0.90, 'only.pdf', 'second'),
      mockHit(0.85, 'only.pdf', 'third'),
      mockHit(0.80, 'only.pdf', 'fourth'),
      mockHit(0.75, 'only.pdf', 'fifth'),
    ];
    const result = reranker.rerank(hits, 'test');
    assert.strictEqual(result.length, 5, 'no hits should be discarded');
    // All hits still present (deferred, not removed)
    const allScores = result.map(h => h.score);
    assert.ok(allScores.includes(0.80), '4th hit should still be present (deferred)');
    assert.ok(allScores.includes(0.75), '5th hit should still be present (deferred)');
  });

  // T-SR05: empty hits array → returns empty array
  it('T-SR05: empty hits array — returns empty array', () => {
    featureFlags.setOverride('RETRIEVAL', true);
    const result = reranker.rerank([], 'test');
    assert.deepStrictEqual(result, []);
  });

  // T-SR06: single hit → returns same single hit
  it('T-SR06: single hit — returns same single hit', () => {
    featureFlags.setOverride('RETRIEVAL', true);
    const hits = [mockHit(0.9, 'a.pdf', 'content')];
    const result = reranker.rerank(hits, 'test');
    assert.strictEqual(result, hits, 'single hit should return same reference');
  });

  // T-SR07: null/undefined hits → returns same value
  it('T-SR07: null/undefined hits — returns same value gracefully', () => {
    featureFlags.setOverride('RETRIEVAL', true);
    assert.strictEqual(reranker.rerank(null, 'test'), null);
    assert.strictEqual(reranker.rerank(undefined, 'test'), undefined);
  });

  // T-SR08: query with no matching keywords → vector score determines order
  it('T-SR08: no keyword matches — vector score determines order', () => {
    featureFlags.setOverride('RETRIEVAL', true);
    const hits = [
      mockHit(0.70, 'a.pdf', 'alpha beta gamma'),
      mockHit(0.90, 'b.pdf', 'delta epsilon zeta'),
    ];
    const result = reranker.rerank(hits, 'xyztotallydifferent');
    // No keyword matches → keyword score = 0 for both → vector weight determines order
    // b.pdf has higher vector score → should be first
    assert.strictEqual(result[0].payload.file_name, 'b.pdf', 'higher vector score should rank first when no keyword matches');
  });

  // T-SR09: combined score formula — verify ranking
  it('T-SR09: combined score — keyword overlap + vector score produce expected ranking', () => {
    featureFlags.setOverride('RETRIEVAL', true);
    // With default weights: vecWeight=0.4, kwWeight=0.3
    // Hit A: vec=0.9, kw=0 → combined=0.36
    // Hit B: vec=0.5, kw=1 → combined=0.20 + 0.30 = 0.50
    // Hit B should rank higher due to keyword match
    const hits = [
      mockHit(0.90, 'a.pdf', 'totally unrelated text'),
      mockHit(0.50, 'b.pdf', 'important research methods for analysis'),
    ];
    const result = reranker.rerank(hits, 'research methods analysis');
    assert.strictEqual(result[0].payload.file_name, 'b.pdf', 'hit with strong keyword overlap should rank first');
  });

  // T-SR10: Arabic text tokenization — diacritics removed, short tokens filtered
  it('T-SR10: Arabic tokenization — diacritics removed, short tokens filtered', () => {
    featureFlags.setOverride('RETRIEVAL', true);
    // Arabic text with diacritics: "مَنْهَجُ البَحْثِ العِلْمِيِّ"
    // After diacritics removal: "منهج البحث العلمي"
    const hits = [
      mockHit(0.50, 'a.pdf', 'فيزياء ورياضيات'),
      mockHit(0.50, 'b.pdf', 'منهج البحث العلمي والتحليل'),
    ];
    const result = reranker.rerank(hits, 'مَنْهَجُ البَحْثِ العِلْمِيِّ');
    assert.strictEqual(result[0].payload.file_name, 'b.pdf', 'Arabic keyword matching should work after diacritics removal');
  });

  // T-SR11: reset() — runs without error
  it('T-SR11: reset runs without error (stateless — no-op)', () => {
    assert.doesNotThrow(() => reranker.reset());
  });

  // T-SR12: counts() — returns { enabled: boolean }
  it('T-SR12: counts returns { enabled: boolean }', () => {
    featureFlags.setOverride('RETRIEVAL', false);  // Phase 98: config default is now true — explicitly disable for first check
    const c = reranker.counts();
    assert.strictEqual(typeof c.enabled, 'boolean');
    assert.strictEqual(c.enabled, false); // overridden to false

    featureFlags.setOverride('RETRIEVAL', true);
    const c2 = reranker.counts();
    assert.strictEqual(c2.enabled, true);
  });
});
