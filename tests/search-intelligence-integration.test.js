// tests/search-intelligence-integration.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 98 — Search Intelligence Layer Integration Tests
// Tests RETRIEVAL + QUERY_COMPLEXITY feature activation,
// singleton behavior, config defaults, and admin endpoint data.
// ═══════════════════════════════════════════════════════════════

import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import config from '../config.js';
import { searchReranker } from '../server/services/searchReranker.js';
import { queryComplexityAnalyzer } from '../server/services/queryComplexityAnalyzer.js';
import { featureFlags } from '../server/services/featureFlags.js';
import { createTestServer } from './helpers/test-server.js';

const ADMIN_TOKEN = 'test-admin-token-phase56';

// ═══════════════════════════════════════════════════════════════
// Block 1: Config Defaults (T-SI01 to T-SI04)
// ═══════════════════════════════════════════════════════════════
describe('Search Intelligence — Config Defaults (Phase 98)', () => {

  // T-SI01: config.RETRIEVAL.rerankEnabled is true
  it('T-SI01: config.RETRIEVAL.rerankEnabled is true', () => {
    assert.strictEqual(config.RETRIEVAL.rerankEnabled, true);
  });

  // T-SI02: config.QUERY_COMPLEXITY.enabled is true
  it('T-SI02: config.QUERY_COMPLEXITY.enabled is true', () => {
    assert.strictEqual(config.QUERY_COMPLEXITY.enabled, true);
  });

  // T-SI03: RETRIEVAL config has expected weights
  it('T-SI03: RETRIEVAL config has expected weights', () => {
    assert.strictEqual(config.RETRIEVAL.diversityWeight, 0.3);
    assert.strictEqual(config.RETRIEVAL.keywordWeight, 0.3);
    assert.strictEqual(config.RETRIEVAL.maxPerFile, 3);
    assert.strictEqual(config.RETRIEVAL.minDiverseFiles, 2);
  });

  // T-SI04: QUERY_COMPLEXITY config has all 5 strategies
  it('T-SI04: QUERY_COMPLEXITY has all 5 strategies', () => {
    const strategies = config.QUERY_COMPLEXITY.strategies;
    assert.ok(strategies, 'strategies should exist');
    assert.ok('factual' in strategies);
    assert.ok('comparative' in strategies);
    assert.ok('analytical' in strategies);
    assert.ok('multi_part' in strategies);
    assert.ok('exploratory' in strategies);
  });
});

// ═══════════════════════════════════════════════════════════════
// Block 2: Singleton Behavior (T-SI05 to T-SI10)
// ═══════════════════════════════════════════════════════════════
describe('Search Intelligence — Singleton Behavior (Phase 98)', () => {

  afterEach(() => {
    featureFlags.clearOverride('RETRIEVAL');
    featureFlags.clearOverride('QUERY_COMPLEXITY');
  });

  // T-SI05: searchReranker.enabled is true by default
  it('T-SI05: searchReranker.enabled is true', () => {
    assert.strictEqual(searchReranker.enabled, true);
  });

  // T-SI06: queryComplexityAnalyzer.enabled is true by default
  it('T-SI06: queryComplexityAnalyzer.enabled is true', () => {
    assert.strictEqual(queryComplexityAnalyzer.enabled, true);
  });

  // T-SI07: searchReranker.counts() returns { enabled: true }
  it('T-SI07: searchReranker.counts() returns enabled', () => {
    const counts = searchReranker.counts();
    assert.strictEqual(typeof counts, 'object');
    assert.strictEqual(counts.enabled, true);
  });

  // T-SI08: queryComplexityAnalyzer.counts() returns { enabled: true }
  it('T-SI08: queryComplexityAnalyzer.counts() returns enabled', () => {
    const counts = queryComplexityAnalyzer.counts();
    assert.strictEqual(typeof counts, 'object');
    assert.strictEqual(counts.enabled, true);
  });

  // T-SI09: queryComplexityAnalyzer.analyze() detects comparative question
  it('T-SI09: analyze detects comparative question', () => {
    const result = queryComplexityAnalyzer.analyze('ما الفرق بين JavaScript و Python؟');
    assert.strictEqual(result.type, 'comparative');
    assert.ok(result.indicators.includes('comparative'));
    assert.ok(result.score > 1);
  });

  // T-SI10: queryComplexityAnalyzer.analyze() detects factual question
  it('T-SI10: analyze detects factual question', () => {
    const result = queryComplexityAnalyzer.analyze('ما هو الباقة الأساسية؟');
    // Short question without comparative/analytical indicators → factual or exploratory
    assert.ok(['factual', 'exploratory'].includes(result.type), `expected factual or exploratory, got ${result.type}`);
  });
});

// ═══════════════════════════════════════════════════════════════
// Block 3: Reranker Logic (T-SI11 to T-SI13)
// ═══════════════════════════════════════════════════════════════
describe('Search Intelligence — Reranker Logic (Phase 98)', () => {

  afterEach(() => {
    featureFlags.clearOverride('RETRIEVAL');
  });

  // T-SI11: rerank with empty hits returns empty array
  it('T-SI11: rerank returns empty array for empty hits', () => {
    const result = searchReranker.rerank([], 'test query');
    assert.ok(Array.isArray(result));
    assert.strictEqual(result.length, 0);
  });

  // T-SI12: rerank with single hit returns same hit
  it('T-SI12: rerank returns same hit for single result', () => {
    const hits = [{ score: 0.9, payload: { content: 'test content', file_name: 'file1.pdf' } }];
    const result = searchReranker.rerank(hits, 'test');
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0], hits[0]);
  });

  // T-SI13: rerank with multiple hits from same file enforces maxPerFile
  it('T-SI13: rerank enforces maxPerFile limit', () => {
    const hits = [];
    for (let i = 0; i < 6; i++) {
      hits.push({
        score: 0.9 - (i * 0.01),
        payload: { content: 'content ' + i, file_name: 'same-file.pdf' },
      });
    }
    const result = searchReranker.rerank(hits, 'test query');
    assert.strictEqual(result.length, 6, 'all hits should be returned (deferred, not deleted)');
    // First 3 should be primary (maxPerFile=3), rest deferred
    const firstThreeFiles = result.slice(0, 3).map(h => h.payload.file_name);
    assert.ok(firstThreeFiles.every(f => f === 'same-file.pdf'));
  });
});

// ═══════════════════════════════════════════════════════════════
// Block 4: Complexity Strategy (T-SI14 to T-SI16)
// ═══════════════════════════════════════════════════════════════
describe('Search Intelligence — Complexity Strategy (Phase 98)', () => {

  // T-SI14: getStrategy returns topK for comparative
  it('T-SI14: getStrategy returns topK 8 for comparative', () => {
    const complexity = { type: 'comparative', score: 3 };
    const strategy = queryComplexityAnalyzer.getStrategy(complexity);
    assert.strictEqual(strategy.topK, 8);
    assert.ok(strategy.promptSuffix.length > 0, 'should have prompt suffix');
  });

  // T-SI15: getStrategy returns topK for analytical
  it('T-SI15: getStrategy returns topK 10 for analytical', () => {
    const complexity = { type: 'analytical', score: 2 };
    const strategy = queryComplexityAnalyzer.getStrategy(complexity);
    assert.strictEqual(strategy.topK, 10);
  });

  // T-SI16: getStrategy returns topK 5 for factual with null promptSuffix (empty string → null via || null)
  it('T-SI16: getStrategy returns topK 5 for factual', () => {
    const complexity = { type: 'factual', score: 1 };
    const strategy = queryComplexityAnalyzer.getStrategy(complexity);
    assert.strictEqual(strategy.topK, 5);
    assert.strictEqual(strategy.promptSuffix, null, 'empty string promptSuffix becomes null via || null');
  });
});

// ═══════════════════════════════════════════════════════════════
// Block 5: Feature Flags Integration (T-SI17 to T-SI19)
// ═══════════════════════════════════════════════════════════════
describe('Search Intelligence — Feature Flags (Phase 98)', () => {

  afterEach(() => {
    featureFlags.clearOverride('RETRIEVAL');
    featureFlags.clearOverride('QUERY_COMPLEXITY');
  });

  // T-SI17: featureFlags.isEnabled('RETRIEVAL') is true by default
  it('T-SI17: featureFlags.isEnabled RETRIEVAL is true', () => {
    assert.strictEqual(featureFlags.isEnabled('RETRIEVAL'), true);
  });

  // T-SI18: featureFlags.isEnabled('QUERY_COMPLEXITY') is true by default
  it('T-SI18: featureFlags.isEnabled QUERY_COMPLEXITY is true', () => {
    assert.strictEqual(featureFlags.isEnabled('QUERY_COMPLEXITY'), true);
  });

  // T-SI19: override to false disables both singletons
  it('T-SI19: override disables singletons dynamically', () => {
    featureFlags.setOverride('RETRIEVAL', false);
    assert.strictEqual(searchReranker.enabled, false);
    featureFlags.setOverride('QUERY_COMPLEXITY', false);
    assert.strictEqual(queryComplexityAnalyzer.enabled, false);
    // analyze still works but returns factual
    const result = queryComplexityAnalyzer.analyze('ما الفرق بين X و Y؟');
    assert.strictEqual(result.type, 'factual');
  });
});

// ═══════════════════════════════════════════════════════════════
// Block 6: Admin API Verification (T-SI20 to T-SI23)
// ═══════════════════════════════════════════════════════════════
describe('Search Intelligence — Admin API (Phase 98)', () => {
  let ts;

  before(async () => { ts = await createTestServer(); });
  after(async () => { await ts.close(); });

  // T-SI20: inspect shows searchReranker.enabled: true
  it('T-SI20: inspect shows searchReranker enabled', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/inspect`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.searchReranker.enabled, true);
  });

  // T-SI21: inspect shows queryComplexityAnalyzer.enabled: true
  it('T-SI21: inspect shows queryComplexityAnalyzer enabled', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/inspect`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.queryComplexityAnalyzer.enabled, true);
  });

  // T-SI22: config features returns RETRIEVAL: true
  it('T-SI22: config features returns RETRIEVAL true', async () => {
    const res = await fetch(`${ts.baseUrl}/api/config/features`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.RETRIEVAL, true);
    assert.strictEqual(data.QUERY_COMPLEXITY, true);
  });

  // T-SI23: config features still returns 15 fields
  it('T-SI23: config features returns 15 fields', async () => {
    const res = await fetch(`${ts.baseUrl}/api/config/features`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(Object.keys(data).length, 15);
  });

  // T-SI24: config features returns QUERY_PLANNING: true (Phase 99)
  it('T-SI24: config features returns QUERY_PLANNING true', async () => {
    const res = await fetch(`${ts.baseUrl}/api/config/features`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.QUERY_PLANNING, true, 'QUERY_PLANNING should be true (Phase 99)');
  });

  // T-SI25: inspect shows queryPlanner.enabled: true (Phase 99)
  it('T-SI25: inspect shows queryPlanner enabled', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/inspect`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.queryPlanner.enabled, true);
    assert.strictEqual(typeof data.queryPlanner.totalPlanned, 'number');
    assert.strictEqual(typeof data.queryPlanner.totalSkipped, 'number');
  });

  // T-SI26: queryPlanner.enabled is true by default (singleton check) (Phase 99)
  it('T-SI26: queryPlanner singleton enabled by default', async () => {
    const { queryPlanner } = await import('../server/services/queryPlanner.js');
    assert.strictEqual(queryPlanner.enabled, true);
  });

  // T-SI27: queryPlanner.shouldPlan returns true for comparative (Phase 99)
  it('T-SI27: queryPlanner shouldPlan returns true for comparative', async () => {
    const { queryPlanner } = await import('../server/services/queryPlanner.js');
    const result = queryPlanner.shouldPlan('ما الفرق بين الأولى والثانية', { type: 'comparative', score: 3, indicators: ['comparative'] });
    assert.strictEqual(result, true);
  });

  // T-SI28: queryPlanner.shouldPlan returns false for factual (Phase 99)
  it('T-SI28: queryPlanner shouldPlan returns false for factual', async () => {
    const { queryPlanner } = await import('../server/services/queryPlanner.js');
    const result = queryPlanner.shouldPlan('ما هي الباقات؟', { type: 'factual', score: 1, indicators: [] });
    assert.strictEqual(result, false);
  });

  // T-SI29: config features returns RAG_STRATEGIES: true (Phase 100)
  it('T-SI29: config features returns RAG_STRATEGIES true', async () => {
    const res = await fetch(`${ts.baseUrl}/api/config/features`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.RAG_STRATEGIES, true, 'RAG_STRATEGIES should be true (Phase 100)');
  });

  // T-SI30: ragStrategySelector singleton enabled by default (Phase 100)
  it('T-SI30: ragStrategySelector singleton enabled by default', async () => {
    const { ragStrategySelector } = await import('../server/services/ragStrategySelector.js');
    assert.strictEqual(ragStrategySelector.enabled, true);
  });

  // T-SI31: ragStrategySelector.select returns quick_factual for short factual (Phase 100)
  it('T-SI31: ragStrategySelector selects quick_factual for short factual', async () => {
    const { ragStrategySelector } = await import('../server/services/ragStrategySelector.js');
    const result = ragStrategySelector.select({
      complexityType: 'factual', turnNumber: 0, lastAvgScore: 0,
      isFollowUp: false, messageWordCount: 5,
    });
    assert.ok(result !== null);
    assert.strictEqual(result.name, 'quick_factual');
  });

  // T-SI32: inspect shows ragStrategySelector.enabled: true (Phase 100)
  it('T-SI32: inspect shows ragStrategySelector enabled', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/inspect`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.ragStrategySelector.enabled, true);
    assert.strictEqual(typeof data.ragStrategySelector.totalSelections, 'number');
    assert.strictEqual(typeof data.ragStrategySelector.strategyBreakdown, 'object');
  });

  // T-SI33: inspect shows searchReranker with totalReranked (Phase 100)
  it('T-SI33: inspect shows searchReranker.totalReranked', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/inspect`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(typeof data.searchReranker.totalReranked, 'number');
  });
});
