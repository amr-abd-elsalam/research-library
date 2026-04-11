// tests/query-planning-activation.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 99 — Query Planning Activation Tests
// Verifies QUERY_PLANNING default is true, decomposition works,
// merge strategies function correctly, feature flag integration,
// config validator compliance, and admin API data.
// ═══════════════════════════════════════════════════════════════

import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import config from '../config.js';
import { queryPlanner } from '../server/services/queryPlanner.js';
import { featureFlags } from '../server/services/featureFlags.js';
import { configValidator } from '../server/services/configValidator.js';
import { createTestServer } from './helpers/test-server.js';

const ADMIN_TOKEN = 'test-admin-token-phase56';

// ── Cleanup ───────────────────────────────────────────────────
afterEach(() => {
  featureFlags.clearOverride('QUERY_PLANNING');
  featureFlags.clearOverride('QUERY_COMPLEXITY');
  queryPlanner.reset();
  configValidator.reset();
});

// ── Mock hit factory ──────────────────────────────────────────
function makeHit(id, score, content) {
  return { id, score, payload: { content: content || 'test content', file_name: 'file-' + id + '.pdf', section_title: 'Section ' + id } };
}

// ═══════════════════════════════════════════════════════════════
// Block 1: Config Defaults (T-QPA01 to T-QPA03)
// ═══════════════════════════════════════════════════════════════
describe('Query Planning Activation — Config Defaults (Phase 99)', () => {

  // T-QPA01: config.QUERY_PLANNING.enabled is true by default
  it('T-QPA01: config.QUERY_PLANNING.enabled is true', () => {
    assert.strictEqual(config.QUERY_PLANNING.enabled, true);
  });

  // T-QPA02: config.QUERY_PLANNING.minComplexityForPlan is 'comparative'
  it('T-QPA02: minComplexityForPlan is comparative', () => {
    assert.strictEqual(config.QUERY_PLANNING.minComplexityForPlan, 'comparative');
  });

  // T-QPA03: config.QUERY_PLANNING.mergeStrategy is 'interleave'
  it('T-QPA03: mergeStrategy is interleave', () => {
    assert.strictEqual(config.QUERY_PLANNING.mergeStrategy, 'interleave');
  });
});

// ═══════════════════════════════════════════════════════════════
// Block 2: Singleton Behavior (T-QPA04 to T-QPA07)
// ═══════════════════════════════════════════════════════════════
describe('Query Planning Activation — Singleton Behavior (Phase 99)', () => {

  // T-QPA04: queryPlanner.enabled is true by default
  it('T-QPA04: queryPlanner.enabled is true by default', () => {
    assert.strictEqual(queryPlanner.enabled, true);
  });

  // T-QPA05: shouldPlan returns true for comparative type
  it('T-QPA05: shouldPlan returns true for comparative', () => {
    assert.strictEqual(queryPlanner.shouldPlan('ما الفرق بين الأساسية والاحترافية', { type: 'comparative', score: 3, indicators: ['comparative'] }), true);
  });

  // T-QPA06: shouldPlan returns true for analytical type
  it('T-QPA06: shouldPlan returns true for analytical', () => {
    assert.strictEqual(queryPlanner.shouldPlan('لماذا تحتاج المنصة إلى ذكاء اصطناعي متقدم', { type: 'analytical', score: 3, indicators: ['analytical'] }), true);
  });

  // T-QPA07: shouldPlan returns false for factual type (below threshold)
  it('T-QPA07: shouldPlan returns false for factual', () => {
    assert.strictEqual(queryPlanner.shouldPlan('ما هي الباقات؟', { type: 'factual', score: 1, indicators: [] }), false);
  });
});

// ═══════════════════════════════════════════════════════════════
// Block 3: Decomposition (T-QPA08 to T-QPA12)
// ═══════════════════════════════════════════════════════════════
describe('Query Planning Activation — Decomposition (Phase 99)', () => {

  // T-QPA08: decompose multi_part splits on ؟ correctly
  it('T-QPA08: multi_part splits on Arabic question mark', () => {
    const result = queryPlanner.decompose('ما المنصة؟ وما الأسعار؟ وهل تعمل على الموبايل', { type: 'multi_part' });
    assert.ok(result.subQueries.length >= 2, 'should split into 2+ sub-queries');
    assert.strictEqual(result.strategy, 'interleave');
  });

  // T-QPA09: decompose comparative produces 2-3 sub-queries for "بين X و Y"
  it('T-QPA09: comparative extracts بين X و Y into sub-queries', () => {
    const result = queryPlanner.decompose('ما الفرق بين الباقة الأساسية و الباقة الاحترافية؟', { type: 'comparative' });
    assert.ok(result.subQueries.length >= 2, 'should produce 2+ sub-queries');
    assert.strictEqual(result.strategy, 'interleave');
  });

  // T-QPA10: decompose analytical adds keyword sub-queries
  it('T-QPA10: analytical keeps original + adds keyword sub-queries', () => {
    const msg = 'لماذا تحتاج المنصة إلى ذكاء اصطناعي متقدم للتعليم';
    const result = queryPlanner.decompose(msg, { type: 'analytical' });
    assert.strictEqual(result.subQueries[0], msg, 'first sub-query should be original');
    assert.strictEqual(result.strategy, 'ranked');
  });

  // T-QPA11: decompose returns single sub-query when no pattern matches
  it('T-QPA11: comparative falls back to single when no بين pattern', () => {
    const result = queryPlanner.decompose('أيهما أفضل للمبتدئين', { type: 'comparative' });
    assert.strictEqual(result.strategy, 'single');
    assert.strictEqual(result.subQueries.length, 1);
  });

  // T-QPA12: decompose respects maxSubQueries limit
  it('T-QPA12: multi_part respects maxSubQueries limit (3)', () => {
    const result = queryPlanner.decompose('الأولى؟ الثانية؟ الثالثة؟ الرابعة؟ الخامسة', { type: 'multi_part' });
    assert.ok(result.subQueries.length <= 3, 'should respect maxSubQueries=3');
  });
});

// ═══════════════════════════════════════════════════════════════
// Block 4: Merge Strategies (T-QPA13 to T-QPA15)
// ═══════════════════════════════════════════════════════════════
describe('Query Planning Activation — Merge Strategies (Phase 99)', () => {

  // T-QPA13: merge interleave deduplicates correctly
  it('T-QPA13: interleave deduplicates by id', () => {
    var setA = [makeHit('dup', 0.9), makeHit('a2', 0.7)];
    var setB = [makeHit('dup', 0.85), makeHit('b2', 0.6)];
    var merged = queryPlanner.merge([setA, setB], 'interleave', 10);
    var dupCount = merged.filter(function (h) { return h.id === 'dup'; }).length;
    assert.strictEqual(dupCount, 1, 'should deduplicate');
    assert.strictEqual(merged.length, 3, 'should have 3 unique hits');
  });

  // T-QPA14: merge concatenate sorts by score
  it('T-QPA14: concatenate sorts by score descending', () => {
    var setA = [makeHit('a1', 0.9), makeHit('a2', 0.5)];
    var setB = [makeHit('b1', 0.85), makeHit('b2', 0.7)];
    var merged = queryPlanner.merge([setA, setB], 'concatenate', 10);
    assert.strictEqual(merged[0].id, 'a1');
    assert.strictEqual(merged[1].id, 'b1');
  });

  // T-QPA15: merge ranked applies position weighting
  it('T-QPA15: ranked boosts hits appearing in multiple sets', () => {
    var setA = [makeHit('a1', 0.9), makeHit('shared', 0.6)];
    var setB = [makeHit('shared', 0.8), makeHit('b2', 0.7)];
    var merged = queryPlanner.merge([setA, setB], 'ranked', 10);
    assert.strictEqual(merged[0].id, 'shared', 'shared should rank first (appears in both sets)');
  });
});

// ═══════════════════════════════════════════════════════════════
// Block 5: Feature Flag Integration (T-QPA16 to T-QPA18)
// ═══════════════════════════════════════════════════════════════
describe('Query Planning Activation — Feature Flags (Phase 99)', () => {

  // T-QPA16: setOverride(false) disables dynamically
  it('T-QPA16: setOverride disables queryPlanner dynamically', () => {
    assert.strictEqual(queryPlanner.enabled, true);
    featureFlags.setOverride('QUERY_PLANNING', false);
    assert.strictEqual(queryPlanner.enabled, false);
    assert.strictEqual(queryPlanner.shouldPlan('بين X و Y', { type: 'comparative', score: 3, indicators: [] }), false);
  });

  // T-QPA17: clearOverride re-enables (reverts to config default: true)
  it('T-QPA17: clearOverride re-enables from config default', () => {
    featureFlags.setOverride('QUERY_PLANNING', false);
    assert.strictEqual(queryPlanner.enabled, false);
    featureFlags.clearOverride('QUERY_PLANNING');
    assert.strictEqual(queryPlanner.enabled, true);
  });

  // T-QPA18: configValidator reports 0 warnings with current defaults
  it('T-QPA18: configValidator reports 0 warnings with QUERY_PLANNING + QUERY_COMPLEXITY both enabled', () => {
    var result = configValidator.validate();
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.errors.length, 0);
    assert.strictEqual(result.warnings.length, 0);
    var hasQPWarning = result.warnings.some(function (w) { return w.includes('QUERY_PLANNING'); });
    assert.strictEqual(hasQPWarning, false, 'no QUERY_PLANNING warning');
  });
});

// ═══════════════════════════════════════════════════════════════
// Block 6: Admin API Verification (T-QPA19 to T-QPA22)
// ═══════════════════════════════════════════════════════════════
describe('Query Planning Activation — Admin API (Phase 99)', () => {
  let ts;

  before(async () => { ts = await createTestServer(); });
  after(async () => { await ts.close(); });

  // T-QPA19: inspect endpoint shows queryPlanner.enabled: true
  it('T-QPA19: inspect shows queryPlanner.enabled true', async () => {
    var res = await fetch(ts.baseUrl + '/api/admin/inspect', {
      headers: { 'Authorization': 'Bearer ' + ADMIN_TOKEN },
    });
    assert.strictEqual(res.status, 200);
    var data = await res.json();
    assert.strictEqual(data.queryPlanner.enabled, true);
    assert.strictEqual(typeof data.queryPlanner.totalPlanned, 'number');
    assert.strictEqual(typeof data.queryPlanner.totalSkipped, 'number');
  });

  // T-QPA20: config/features endpoint shows QUERY_PLANNING: true
  it('T-QPA20: config features shows QUERY_PLANNING true', async () => {
    var res = await fetch(ts.baseUrl + '/api/config/features');
    assert.strictEqual(res.status, 200);
    var data = await res.json();
    assert.strictEqual(data.QUERY_PLANNING, true);
  });

  // T-QPA21: config/features still returns 15 fields
  it('T-QPA21: config features still returns 15 fields', async () => {
    var res = await fetch(ts.baseUrl + '/api/config/features');
    assert.strictEqual(res.status, 200);
    var data = await res.json();
    assert.strictEqual(Object.keys(data).length, 15);
  });

  // T-QPA22: inspect queryPlanner has correct shape
  it('T-QPA22: inspect queryPlanner has correct shape', async () => {
    var res = await fetch(ts.baseUrl + '/api/admin/inspect', {
      headers: { 'Authorization': 'Bearer ' + ADMIN_TOKEN },
    });
    assert.strictEqual(res.status, 200);
    var data = await res.json();
    assert.ok('queryPlanner' in data, 'should contain queryPlanner');
    assert.strictEqual(typeof data.queryPlanner.enabled, 'boolean');
    assert.strictEqual(typeof data.queryPlanner.totalPlanned, 'number');
    assert.strictEqual(typeof data.queryPlanner.totalSkipped, 'number');
  });
});
