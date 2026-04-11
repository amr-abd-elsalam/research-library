// tests/rag-strategies-activation.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 100 — RAG Strategies Activation Tests
// Tests config defaults, strategy selection, skip stages,
// stateful counters on searchReranker + queryComplexityAnalyzer,
// feature flag integration, and admin API verification.
// ═══════════════════════════════════════════════════════════════

import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import config from '../config.js';
import { ragStrategySelector } from '../server/services/ragStrategySelector.js';
import { searchReranker } from '../server/services/searchReranker.js';
import { queryComplexityAnalyzer } from '../server/services/queryComplexityAnalyzer.js';
import { featureFlags } from '../server/services/featureFlags.js';
import { configValidator } from '../server/services/configValidator.js';
import { createTestServer } from './helpers/test-server.js';

const ADMIN_TOKEN = 'test-admin-token-phase56';

// ── Cleanup ───────────────────────────────────────────────────
afterEach(() => {
  featureFlags.clearOverride('RAG_STRATEGIES');
  featureFlags.clearOverride('QUERY_COMPLEXITY');
  ragStrategySelector.reset();
  searchReranker.reset();
  queryComplexityAnalyzer.reset();
});

// ═══════════════════════════════════════════════════════════════
// Block 1: Config Defaults (T-RSA01 to T-RSA03)
// ═══════════════════════════════════════════════════════════════
describe('RAG Strategies Activation — Config Defaults', () => {

  // T-RSA01: config.RAG_STRATEGIES.enabled is true by default
  it('T-RSA01: config.RAG_STRATEGIES.enabled is true', () => {
    assert.strictEqual(config.RAG_STRATEGIES.enabled, true);
  });

  // T-RSA02: config.RAG_STRATEGIES.strategies has 4 strategies
  it('T-RSA02: config.RAG_STRATEGIES.strategies has 4 strategies', () => {
    const strategies = config.RAG_STRATEGIES.strategies;
    assert.ok(strategies, 'strategies should exist');
    assert.ok('quick_factual' in strategies);
    assert.ok('deep_analytical' in strategies);
    assert.ok('conversational_followup' in strategies);
    assert.ok('exploratory_scan' in strategies);
    assert.strictEqual(Object.keys(strategies).length, 4);
  });

  // T-RSA03: config.RAG_STRATEGIES.selectionRules has expected thresholds
  it('T-RSA03: selectionRules has expected thresholds', () => {
    const rules = config.RAG_STRATEGIES.selectionRules;
    assert.strictEqual(rules.turnThresholdForConversational, 3);
    assert.strictEqual(rules.lowScoreThresholdForDeep, 0.5);
    assert.strictEqual(rules.maxQuickFactualWords, 10);
    assert.strictEqual(rules.useRollingScore, true);
  });
});

// ═══════════════════════════════════════════════════════════════
// Block 2: Singleton Behavior (T-RSA04 to T-RSA08)
// ═══════════════════════════════════════════════════════════════
describe('RAG Strategies Activation — Singleton Behavior', () => {

  // T-RSA04: ragStrategySelector.enabled is true by default
  it('T-RSA04: ragStrategySelector.enabled is true', () => {
    assert.strictEqual(ragStrategySelector.enabled, true);
  });

  // T-RSA05: select() returns quick_factual for short factual question
  it('T-RSA05: select returns quick_factual for short factual', () => {
    const result = ragStrategySelector.select({
      complexityType: 'factual', turnNumber: 0, lastAvgScore: 0,
      isFollowUp: false, messageWordCount: 5,
    });
    assert.ok(result !== null);
    assert.strictEqual(result.name, 'quick_factual');
  });

  // T-RSA06: select() returns deep_analytical for low quality score
  it('T-RSA06: select returns deep_analytical for low quality + analytical', () => {
    const result = ragStrategySelector.select({
      complexityType: 'analytical', turnNumber: 2, lastAvgScore: 0.3,
      isFollowUp: false, messageWordCount: 15,
    });
    assert.ok(result !== null);
    assert.strictEqual(result.name, 'deep_analytical');
  });

  // T-RSA07: select() returns conversational_followup after 3+ turns
  it('T-RSA07: select returns conversational_followup after 3 turns', () => {
    const result = ragStrategySelector.select({
      complexityType: 'factual', turnNumber: 3, lastAvgScore: 0,
      isFollowUp: true, messageWordCount: 5,
    });
    assert.ok(result !== null);
    assert.strictEqual(result.name, 'conversational_followup');
  });

  // T-RSA08: select() returns exploratory_scan for exploratory
  it('T-RSA08: select returns exploratory_scan for exploratory', () => {
    const result = ragStrategySelector.select({
      complexityType: 'exploratory', turnNumber: 0, lastAvgScore: 0,
      isFollowUp: false, messageWordCount: 15,
    });
    assert.ok(result !== null);
    assert.strictEqual(result.name, 'exploratory_scan');
  });
});

// ═══════════════════════════════════════════════════════════════
// Block 3: Strategy Skip Stages (T-RSA09 to T-RSA12)
// ═══════════════════════════════════════════════════════════════
describe('RAG Strategies Activation — Skip Stages', () => {

  // T-RSA09: quick_factual skipStages includes stageRerank
  it('T-RSA09: quick_factual skips stageRerank', () => {
    const result = ragStrategySelector.select({
      complexityType: 'factual', turnNumber: 0, lastAvgScore: 0,
      isFollowUp: false, messageWordCount: 5,
    });
    assert.ok(result.skipStages.includes('stageRerank'));
  });

  // T-RSA10: quick_factual skipStages includes stageGroundingCheck
  it('T-RSA10: quick_factual skips stageGroundingCheck', () => {
    const result = ragStrategySelector.select({
      complexityType: 'factual', turnNumber: 0, lastAvgScore: 0,
      isFollowUp: false, messageWordCount: 5,
    });
    assert.ok(result.skipStages.includes('stageGroundingCheck'));
  });

  // T-RSA11: deep_analytical skipStages is empty
  it('T-RSA11: deep_analytical has empty skipStages', () => {
    const result = ragStrategySelector.select({
      complexityType: 'analytical', turnNumber: 0, lastAvgScore: 0,
      isFollowUp: false, messageWordCount: 15,
    });
    assert.strictEqual(result.skipStages.length, 0);
  });

  // T-RSA12: conversational_followup skipStages includes stageQueryPlan
  it('T-RSA12: conversational_followup skips stageQueryPlan', () => {
    const result = ragStrategySelector.select({
      complexityType: 'factual', turnNumber: 3, lastAvgScore: 0,
      isFollowUp: true, messageWordCount: 5,
    });
    assert.ok(result.skipStages.includes('stageQueryPlan'));
  });
});

// ═══════════════════════════════════════════════════════════════
// Block 4: Stateful Counters — searchReranker (T-RSA13 to T-RSA15)
// ═══════════════════════════════════════════════════════════════
describe('RAG Strategies Activation — searchReranker Counters', () => {

  // T-RSA13: searchReranker.counts() returns totalReranked number
  it('T-RSA13: counts() returns totalReranked number', () => {
    const c = searchReranker.counts();
    assert.strictEqual(typeof c.totalReranked, 'number');
  });

  // T-RSA14: searchReranker.counts().totalReranked starts at 0
  it('T-RSA14: totalReranked starts at 0', () => {
    const c = searchReranker.counts();
    assert.strictEqual(c.totalReranked, 0);
  });

  // T-RSA15: searchReranker.counts().enabled is boolean
  it('T-RSA15: enabled is boolean', () => {
    const c = searchReranker.counts();
    assert.strictEqual(typeof c.enabled, 'boolean');
  });
});

// ═══════════════════════════════════════════════════════════════
// Block 5: Stateful Counters — queryComplexityAnalyzer (T-RSA16 to T-RSA19)
// ═══════════════════════════════════════════════════════════════
describe('RAG Strategies Activation — queryComplexityAnalyzer Counters', () => {

  // T-RSA16: counts() returns totalAnalyzed number
  it('T-RSA16: counts() returns totalAnalyzed number', () => {
    const c = queryComplexityAnalyzer.counts();
    assert.strictEqual(typeof c.totalAnalyzed, 'number');
  });

  // T-RSA17: counts().typeBreakdown has 5 keys
  it('T-RSA17: typeBreakdown has 5 keys', () => {
    const c = queryComplexityAnalyzer.counts();
    const keys = Object.keys(c.typeBreakdown);
    assert.strictEqual(keys.length, 5);
    assert.ok(keys.includes('factual'));
    assert.ok(keys.includes('comparative'));
    assert.ok(keys.includes('analytical'));
    assert.ok(keys.includes('multi_part'));
    assert.ok(keys.includes('exploratory'));
  });

  // T-RSA18: totalAnalyzed starts at 0
  it('T-RSA18: totalAnalyzed starts at 0', () => {
    const c = queryComplexityAnalyzer.counts();
    assert.strictEqual(c.totalAnalyzed, 0);
  });

  // T-RSA19: analyze() increments totalAnalyzed and updates typeBreakdown
  it('T-RSA19: analyze increments totalAnalyzed and typeBreakdown', () => {
    queryComplexityAnalyzer.analyze('ما الفرق بين A و B؟');
    queryComplexityAnalyzer.analyze('اشرح المفهوم');
    const c = queryComplexityAnalyzer.counts();
    assert.strictEqual(c.totalAnalyzed, 2);
    const total = Object.values(c.typeBreakdown).reduce((s, v) => s + v, 0);
    assert.strictEqual(total, 2);
  });
});

// ═══════════════════════════════════════════════════════════════
// Block 6: Feature Flag Integration (T-RSA20 to T-RSA22)
// ═══════════════════════════════════════════════════════════════
describe('RAG Strategies Activation — Feature Flags', () => {

  // T-RSA20: override to false disables dynamically
  it('T-RSA20: override to false disables', () => {
    featureFlags.setOverride('RAG_STRATEGIES', false);
    assert.strictEqual(ragStrategySelector.enabled, false);
    const result = ragStrategySelector.select({
      complexityType: 'factual', turnNumber: 0, lastAvgScore: 0,
      isFollowUp: false, messageWordCount: 5,
    });
    assert.strictEqual(result, null);
  });

  // T-RSA21: clearing override re-enables
  it('T-RSA21: clearOverride re-enables', () => {
    featureFlags.setOverride('RAG_STRATEGIES', false);
    assert.strictEqual(ragStrategySelector.enabled, false);
    featureFlags.clearOverride('RAG_STRATEGIES');
    assert.strictEqual(ragStrategySelector.enabled, true);
  });

  // T-RSA22: configValidator reports 0 warnings with current defaults
  it('T-RSA22: configValidator reports 0 warnings', () => {
    const result = configValidator.validate();
    assert.strictEqual(result.warnings.length, 0, `expected 0 warnings, got: ${result.warnings.join('; ')}`);
    assert.strictEqual(result.errors.length, 0, `expected 0 errors, got: ${result.errors.join('; ')}`);
  });
});

// ═══════════════════════════════════════════════════════════════
// Block 7: Admin API Verification (T-RSA23 to T-RSA25)
// ═══════════════════════════════════════════════════════════════
describe('RAG Strategies Activation — Admin API', () => {
  let ts;

  before(async () => { ts = await createTestServer(); });
  after(async () => { await ts.close(); });

  // T-RSA23: inspect shows ragStrategySelector.enabled: true
  it('T-RSA23: inspect shows ragStrategySelector.enabled true', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/inspect`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.ragStrategySelector.enabled, true);
  });

  // T-RSA24: inspect shows searchReranker.totalReranked number
  it('T-RSA24: inspect shows searchReranker.totalReranked', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/inspect`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(typeof data.searchReranker.totalReranked, 'number');
  });

  // T-RSA25: config/features shows RAG_STRATEGIES: true with 15 total
  it('T-RSA25: config/features shows RAG_STRATEGIES true', async () => {
    const res = await fetch(`${ts.baseUrl}/api/config/features`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.RAG_STRATEGIES, true);
    assert.strictEqual(Object.keys(data).length, 15);
  });
});
