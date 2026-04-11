// tests/query-planner.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 81 — QueryPlanner Tests
// Tests multi-step query decomposition, merge strategies,
// deduplication, config gating, and feature flag integration.
// No network calls — tests pure planning/merge logic.
// ═══════════════════════════════════════════════════════════════

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { QueryPlanner, queryPlanner } from '../server/services/queryPlanner.js';
import { featureFlags } from '../server/services/featureFlags.js';

// ── Cleanup ───────────────────────────────────────────────────
afterEach(() => {
  featureFlags.clearOverride('QUERY_PLANNING');
  featureFlags.clearOverride('QUERY_COMPLEXITY');
  queryPlanner.reset();
});

// ── Mock hit factory ──────────────────────────────────────────
function makeHit(id, score, content = 'test content') {
  return { id, score, payload: { content, file_name: `file-${id}.pdf`, section_title: `Section ${id}` } };
}

// ═══════════════════════════════════════════════════════════════
// Block 1: QueryPlanner Structure
// ═══════════════════════════════════════════════════════════════
describe('QueryPlanner Structure', () => {

  // T-QP01: QueryPlanner is a class
  it('T-QP01: QueryPlanner is a class', () => {
    assert.strictEqual(typeof QueryPlanner, 'function', 'QueryPlanner should be a constructor');
    const instance = new QueryPlanner();
    assert.ok(instance instanceof QueryPlanner, 'should create instance');
  });

  // T-QP02: queryPlanner is a singleton instance of QueryPlanner
  it('T-QP02: queryPlanner is a singleton instance', () => {
    assert.ok(queryPlanner instanceof QueryPlanner, 'should be QueryPlanner instance');
  });

  // T-QP03: counts() returns { enabled, totalPlanned, totalSkipped } shape
  it('T-QP03: counts() returns correct shape', () => {
    const c = queryPlanner.counts();
    assert.strictEqual(typeof c.enabled, 'boolean', 'enabled should be boolean');
    assert.strictEqual(typeof c.totalPlanned, 'number', 'totalPlanned should be number');
    assert.strictEqual(typeof c.totalSkipped, 'number', 'totalSkipped should be number');
  });

  // T-QP04: reset() clears stats — counts shows 0
  it('T-QP04: reset() clears stats', () => {
    featureFlags.setOverride('QUERY_PLANNING', true);
    queryPlanner.decompose('part1؟ part2؟ part3', { type: 'multi_part' });
    const before = queryPlanner.counts();
    assert.ok(before.totalPlanned > 0 || before.totalSkipped > 0, 'should have some stats');
    queryPlanner.reset();
    const after = queryPlanner.counts();
    assert.strictEqual(after.totalPlanned, 0);
    assert.strictEqual(after.totalSkipped, 0);
  });

  // T-QP05: enabled getter returns boolean (true by default — Phase 99)
  it('T-QP05: enabled returns true by default', () => {
    assert.strictEqual(queryPlanner.enabled, true);
    assert.strictEqual(typeof queryPlanner.enabled, 'boolean');
  });

  // T-QP06: shouldPlan returns false when disabled via override
  it('T-QP06: shouldPlan returns false when disabled via override', () => {
    featureFlags.setOverride('QUERY_PLANNING', false);
    assert.strictEqual(queryPlanner.shouldPlan('some question', { type: 'comparative', score: 3, indicators: ['comparative'] }), false);
  });
});

// ═══════════════════════════════════════════════════════════════
// Block 2: shouldPlan Logic
// ═══════════════════════════════════════════════════════════════
describe('QueryPlanner shouldPlan', () => {

  // T-QP07: shouldPlan returns false for 'factual' complexity
  it('T-QP07: shouldPlan returns false for factual', () => {
    featureFlags.setOverride('QUERY_PLANNING', true);
    assert.strictEqual(queryPlanner.shouldPlan('ما هي الباقات؟', { type: 'factual', score: 1, indicators: [] }), false);
  });

  // T-QP08: shouldPlan returns false for 'exploratory' complexity
  it('T-QP08: shouldPlan returns false for exploratory', () => {
    featureFlags.setOverride('QUERY_PLANNING', true);
    assert.strictEqual(queryPlanner.shouldPlan('اشرح لي عن المنصة بالتفصيل', { type: 'exploratory', score: 2, indicators: ['exploratory'] }), false);
  });

  // T-QP09: shouldPlan returns true for 'comparative' complexity
  it('T-QP09: shouldPlan returns true for comparative', () => {
    featureFlags.setOverride('QUERY_PLANNING', true);
    assert.strictEqual(queryPlanner.shouldPlan('ما الفرق بين الباقة الأساسية والباقة الاحترافية', { type: 'comparative', score: 3, indicators: ['comparative'] }), true);
  });

  // T-QP10: shouldPlan returns true for 'multi_part' complexity
  it('T-QP10: shouldPlan returns true for multi_part', () => {
    featureFlags.setOverride('QUERY_PLANNING', true);
    assert.strictEqual(queryPlanner.shouldPlan('ما المنصة؟ وما الأسعار؟ وهل تعمل على الموبايل؟', { type: 'multi_part', score: 4, indicators: ['multi_part'] }), true);
  });
});

// ═══════════════════════════════════════════════════════════════
// Block 3: Decomposition — multi_part
// ═══════════════════════════════════════════════════════════════
describe('QueryPlanner Decompose multi_part', () => {

  // T-QP11: decompose multi_part splits on ؟
  it('T-QP11: splits on Arabic question mark', () => {
    featureFlags.setOverride('QUERY_PLANNING', true);
    const result = queryPlanner.decompose('ما المنصة؟ وما الأسعار؟ وهل تعمل على الموبايل', { type: 'multi_part' });
    assert.ok(result.subQueries.length >= 2, `expected >= 2 sub-queries, got ${result.subQueries.length}`);
    assert.strictEqual(result.strategy, 'interleave');
  });

  // T-QP12: decompose multi_part respects maxSubQueries limit
  it('T-QP12: respects maxSubQueries limit', () => {
    featureFlags.setOverride('QUERY_PLANNING', true);
    // config.QUERY_PLANNING.maxSubQueries defaults to 3
    const result = queryPlanner.decompose('الأولى؟ الثانية؟ الثالثة؟ الرابعة؟ الخامسة', { type: 'multi_part' });
    assert.ok(result.subQueries.length <= 3, `expected <= 3, got ${result.subQueries.length}`);
  });

  // T-QP13: decompose multi_part returns single strategy for 1 part
  it('T-QP13: returns single for single part', () => {
    featureFlags.setOverride('QUERY_PLANNING', true);
    const result = queryPlanner.decompose('ما هي المنصة', { type: 'multi_part' });
    assert.strictEqual(result.strategy, 'single');
    assert.strictEqual(result.subQueries.length, 1);
  });
});

// ═══════════════════════════════════════════════════════════════
// Block 4: Decomposition — comparative
// ═══════════════════════════════════════════════════════════════
describe('QueryPlanner Decompose comparative', () => {

  // T-QP14: decompose comparative extracts "بين X و Y"
  it('T-QP14: extracts بين X و Y', () => {
    featureFlags.setOverride('QUERY_PLANNING', true);
    const result = queryPlanner.decompose('ما الفرق بين الباقة الأساسية و الباقة الاحترافية؟', { type: 'comparative' });
    assert.ok(result.subQueries.length >= 2, `expected >= 2, got ${result.subQueries.length}`);
    assert.strictEqual(result.strategy, 'interleave');
    // Should contain sub-queries about each side
    const joined = result.subQueries.join(' ');
    assert.ok(joined.includes('الأساسية') || joined.includes('الباقة'), 'should reference first entity');
  });

  // T-QP15: decompose comparative falls back to single when no pattern match
  it('T-QP15: falls back to single when no بين pattern', () => {
    featureFlags.setOverride('QUERY_PLANNING', true);
    const result = queryPlanner.decompose('أيهما أفضل للمبتدئين', { type: 'comparative' });
    assert.strictEqual(result.strategy, 'single');
    assert.strictEqual(result.subQueries.length, 1);
  });

  // T-QP16: decompose comparative subQueries length ≤ maxSubQueries
  it('T-QP16: subQueries respects maxSubQueries', () => {
    featureFlags.setOverride('QUERY_PLANNING', true);
    const result = queryPlanner.decompose('ما الفرق بين الأولى و الثانية؟', { type: 'comparative' });
    assert.ok(result.subQueries.length <= 3, `expected <= 3, got ${result.subQueries.length}`);
  });
});

// ═══════════════════════════════════════════════════════════════
// Block 5: Decomposition — analytical
// ═══════════════════════════════════════════════════════════════
describe('QueryPlanner Decompose analytical', () => {

  // T-QP17: decompose analytical keeps original message as first sub-query
  it('T-QP17: keeps original as first sub-query', () => {
    featureFlags.setOverride('QUERY_PLANNING', true);
    const msg = 'لماذا تحتاج المنصة إلى ذكاء اصطناعي متقدم';
    const result = queryPlanner.decompose(msg, { type: 'analytical' });
    assert.strictEqual(result.subQueries[0], msg);
    assert.strictEqual(result.strategy, 'ranked');
  });

  // T-QP18: decompose analytical extracts additional keyword-based sub-queries
  it('T-QP18: adds keyword sub-queries', () => {
    featureFlags.setOverride('QUERY_PLANNING', true);
    const msg = 'لماذا تحتاج المنصة إلى ذكاء اصطناعي متقدم للتعليم';
    const result = queryPlanner.decompose(msg, { type: 'analytical' });
    assert.ok(result.subQueries.length >= 1, 'should have at least the original');
    assert.strictEqual(result.strategy, 'ranked');
  });
});

// ═══════════════════════════════════════════════════════════════
// Block 6: Merge Strategies
// ═══════════════════════════════════════════════════════════════
describe('QueryPlanner Merge Strategies', () => {

  // T-QP19: merge interleave — round-robin from 2 sets
  it('T-QP19: interleave round-robins', () => {
    const setA = [makeHit('a1', 0.9), makeHit('a2', 0.8)];
    const setB = [makeHit('b1', 0.85), makeHit('b2', 0.7)];
    const merged = queryPlanner.merge([setA, setB], 'interleave', 10);
    assert.strictEqual(merged.length, 4);
    // Round-robin: a1, b1, a2, b2
    assert.strictEqual(merged[0].id, 'a1');
    assert.strictEqual(merged[1].id, 'b1');
    assert.strictEqual(merged[2].id, 'a2');
    assert.strictEqual(merged[3].id, 'b2');
  });

  // T-QP20: merge concatenate — flatten + sort by score
  it('T-QP20: concatenate sorts by score', () => {
    const setA = [makeHit('a1', 0.9), makeHit('a2', 0.5)];
    const setB = [makeHit('b1', 0.85), makeHit('b2', 0.7)];
    const merged = queryPlanner.merge([setA, setB], 'concatenate', 10);
    assert.strictEqual(merged.length, 4);
    // Sorted by score desc: a1(0.9), b1(0.85), b2(0.7), a2(0.5)
    assert.strictEqual(merged[0].id, 'a1');
    assert.strictEqual(merged[1].id, 'b1');
    assert.strictEqual(merged[2].id, 'b2');
    assert.strictEqual(merged[3].id, 'a2');
  });

  // T-QP21: merge ranked — weighted by position
  it('T-QP21: ranked weights by position + score', () => {
    const setA = [makeHit('a1', 0.9), makeHit('shared', 0.6)];
    const setB = [makeHit('shared', 0.8), makeHit('b2', 0.7)];
    const merged = queryPlanner.merge([setA, setB], 'ranked', 10);
    // 'shared' appears in both sets → higher combined score
    // a1: 0.9 * (1/1) = 0.9
    // shared: 0.6 * (1/2) + 0.8 * (1/1) = 0.3 + 0.8 = 1.1
    // b2: 0.7 * (1/2) = 0.35
    assert.strictEqual(merged[0].id, 'shared', 'shared should be first (highest combined score)');
    assert.strictEqual(merged[1].id, 'a1');
  });

  // T-QP22: merge deduplicates by id
  it('T-QP22: deduplicates by id', () => {
    const setA = [makeHit('dup', 0.9), makeHit('a2', 0.7)];
    const setB = [makeHit('dup', 0.85), makeHit('b2', 0.6)];
    const merged = queryPlanner.merge([setA, setB], 'interleave', 10);
    const ids = merged.map(h => h.id);
    const dupCount = ids.filter(id => id === 'dup').length;
    assert.strictEqual(dupCount, 1, 'should deduplicate');
  });

  // T-QP23: merge returns empty array for empty input
  it('T-QP23: returns empty for empty input', () => {
    assert.deepStrictEqual(queryPlanner.merge([], 'interleave', 10), []);
    assert.deepStrictEqual(queryPlanner.merge(null, 'interleave', 10), []);
    assert.deepStrictEqual(queryPlanner.merge(undefined, 'interleave', 10), []);
  });
});

// ═══════════════════════════════════════════════════════════════
// Block 7: Config Gating
// ═══════════════════════════════════════════════════════════════
describe('QueryPlanner Config Gating', () => {

  // T-QP24: decompose returns single when disabled via override (Phase 99: enabled by default)
  it('T-QP24: decompose returns single when disabled via override', () => {
    featureFlags.setOverride('QUERY_PLANNING', false);
    const result = queryPlanner.decompose('ما المنصة؟ وما الأسعار؟', { type: 'multi_part' });
    assert.strictEqual(result.strategy, 'single');
    assert.strictEqual(result.subQueries.length, 1);
  });

  // T-QP25: feature flag override disables then re-enables planning (Phase 99: enabled by default)
  it('T-QP25: feature flag override disables then re-enables planning', () => {
    assert.strictEqual(queryPlanner.enabled, true);
    featureFlags.setOverride('QUERY_PLANNING', false);
    assert.strictEqual(queryPlanner.enabled, false);
    featureFlags.clearOverride('QUERY_PLANNING');
    assert.strictEqual(queryPlanner.enabled, true);
    assert.strictEqual(queryPlanner.shouldPlan('بين الأولى و الثانية', { type: 'comparative', score: 3, indicators: ['comparative'] }), true);
  });
});
