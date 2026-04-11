// tests/admin-analytics-endpoints.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 103 — Admin Analytics Endpoints Tests
// Tests dedicated endpoints: refinement, strategy, search-intel.
// Tests cost endpoint enrichment (semanticMatchingCost).
// Uses real HTTP via createTestServer.
// ═══════════════════════════════════════════════════════════════

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestServer } from './helpers/test-server.js';

const ADMIN_TOKEN = 'test-admin-token-phase56';

// ═══════════════════════════════════════════════════════════════
// Block 1: Admin Refinement Endpoint (T-AAE01 to T-AAE07)
// ═══════════════════════════════════════════════════════════════
describe('Admin Analytics — Refinement Endpoint (Phase 103)', () => {
  let ts;

  before(async () => { ts = await createTestServer(); });
  after(async () => { await ts.close(); });

  // T-AAE01: GET /api/admin/refinement without auth → 401
  it('T-AAE01: GET /api/admin/refinement without auth — returns 401', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/refinement`);
    assert.strictEqual(res.status, 401);
  });

  // T-AAE02: GET /api/admin/refinement with auth → 200
  it('T-AAE02: GET /api/admin/refinement with auth — returns 200', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/refinement`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(typeof data, 'object');
  });

  // T-AAE03: Response contains enabled boolean
  it('T-AAE03: response contains enabled boolean', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/refinement`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(typeof data.enabled, 'boolean');
    assert.strictEqual(data.enabled, true, 'ANSWER_REFINEMENT enabled by default');
  });

  // T-AAE04: Response contains totalRecorded number
  it('T-AAE04: response contains totalRecorded number', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/refinement`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(typeof data.totalRecorded, 'number');
    assert.ok(data.totalRecorded >= 0);
  });

  // T-AAE05: Response contains successRate number (0-1)
  it('T-AAE05: response contains successRate number', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/refinement`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(typeof data.successRate, 'number');
    assert.ok(data.successRate >= 0 && data.successRate <= 1, `successRate should be 0-1, got ${data.successRate}`);
  });

  // T-AAE06: Response contains config object
  it('T-AAE06: response contains config object with expected fields', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/refinement`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(typeof data.config, 'object');
    assert.strictEqual(typeof data.config.maxRefinements, 'number');
    assert.strictEqual(typeof data.config.minScoreToRetry, 'number');
    assert.strictEqual(typeof data.config.streamingRevisionEnabled, 'boolean');
  });

  // T-AAE07: Content-Type is application/json
  it('T-AAE07: Content-Type is application/json', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/refinement`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    const ct = res.headers.get('content-type');
    assert.ok(ct && ct.includes('application/json'), `expected application/json, got ${ct}`);
  });
});

// ═══════════════════════════════════════════════════════════════
// Block 2: Admin Strategy Endpoint (T-AAE08 to T-AAE14)
// ═══════════════════════════════════════════════════════════════
describe('Admin Analytics — Strategy Endpoint (Phase 103)', () => {
  let ts;

  before(async () => { ts = await createTestServer(); });
  after(async () => { await ts.close(); });

  // T-AAE08: GET /api/admin/strategy without auth → 401
  it('T-AAE08: GET /api/admin/strategy without auth — returns 401', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/strategy`);
    assert.strictEqual(res.status, 401);
  });

  // T-AAE09: GET /api/admin/strategy with auth → 200
  it('T-AAE09: GET /api/admin/strategy with auth — returns 200', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/strategy`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(typeof data, 'object');
  });

  // T-AAE10: Response contains enabled boolean
  it('T-AAE10: response contains enabled boolean', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/strategy`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(typeof data.enabled, 'boolean');
    assert.strictEqual(data.enabled, true, 'RAG_STRATEGIES enabled by default');
  });

  // T-AAE11: Response contains selectorStrategyBreakdown object with 5 keys
  it('T-AAE11: response contains selectorStrategyBreakdown with 5 strategy keys', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/strategy`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(typeof data.selectorStrategyBreakdown, 'object');
    const keys = Object.keys(data.selectorStrategyBreakdown);
    assert.strictEqual(keys.length, 5, `expected 5 strategy keys, got ${keys.length}`);
    assert.ok(keys.includes('quick_factual'));
    assert.ok(keys.includes('deep_analytical'));
    assert.ok(keys.includes('conversational_followup'));
    assert.ok(keys.includes('exploratory_scan'));
    assert.ok(keys.includes('none'));
  });

  // T-AAE12: Response contains config object
  it('T-AAE12: response contains config object with strategies array', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/strategy`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(typeof data.config, 'object');
    assert.ok(Array.isArray(data.config.strategies), 'strategies should be an array');
    assert.strictEqual(typeof data.config.useRollingScore, 'boolean');
  });

  // T-AAE13: Response contains escalationRate number
  it('T-AAE13: response contains escalationRate number', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/strategy`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(typeof data.escalationRate, 'number');
  });

  // T-AAE14: Content-Type is application/json
  it('T-AAE14: Content-Type is application/json', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/strategy`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    const ct = res.headers.get('content-type');
    assert.ok(ct && ct.includes('application/json'), `expected application/json, got ${ct}`);
  });
});

// ═══════════════════════════════════════════════════════════════
// Block 3: Admin Search Intelligence Endpoint (T-AAE15 to T-AAE22)
// ═══════════════════════════════════════════════════════════════
describe('Admin Analytics — Search Intelligence Endpoint (Phase 103)', () => {
  let ts;

  before(async () => { ts = await createTestServer(); });
  after(async () => { await ts.close(); });

  // T-AAE15: GET /api/admin/search-intel without auth → 401
  it('T-AAE15: GET /api/admin/search-intel without auth — returns 401', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/search-intel`);
    assert.strictEqual(res.status, 401);
  });

  // T-AAE16: GET /api/admin/search-intel with auth → 200
  it('T-AAE16: GET /api/admin/search-intel with auth — returns 200', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/search-intel`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
  });

  // T-AAE17: Response contains reranker object with enabled boolean
  it('T-AAE17: response contains reranker.enabled boolean', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/search-intel`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    const data = await res.json();
    assert.strictEqual(typeof data.reranker, 'object');
    assert.strictEqual(typeof data.reranker.enabled, 'boolean');
    assert.strictEqual(data.reranker.enabled, true);
  });

  // T-AAE18: Response contains complexity object with enabled boolean
  it('T-AAE18: response contains complexity.enabled boolean', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/search-intel`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    const data = await res.json();
    assert.strictEqual(typeof data.complexity, 'object');
    assert.strictEqual(typeof data.complexity.enabled, 'boolean');
    assert.strictEqual(data.complexity.enabled, true);
  });

  // T-AAE19: Response contains planner object with enabled boolean
  it('T-AAE19: response contains planner.enabled boolean', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/search-intel`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    const data = await res.json();
    assert.strictEqual(typeof data.planner, 'object');
    assert.strictEqual(typeof data.planner.enabled, 'boolean');
  });

  // T-AAE20: Response contains strategy object with enabled boolean
  it('T-AAE20: response contains strategy.enabled boolean', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/search-intel`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    const data = await res.json();
    assert.strictEqual(typeof data.strategy, 'object');
    assert.strictEqual(typeof data.strategy.enabled, 'boolean');
  });

  // T-AAE21: All 4 sub-objects have total counters
  it('T-AAE21: all 4 sub-objects have total counters', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/search-intel`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    const data = await res.json();
    assert.strictEqual(typeof data.reranker.totalReranked, 'number');
    assert.strictEqual(typeof data.complexity.totalAnalyzed, 'number');
    assert.strictEqual(typeof data.planner.totalPlanned, 'number');
    assert.strictEqual(typeof data.strategy.totalSelections, 'number');
  });

  // T-AAE22: Content-Type is application/json
  it('T-AAE22: Content-Type is application/json', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/search-intel`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    const ct = res.headers.get('content-type');
    assert.ok(ct && ct.includes('application/json'), `expected application/json, got ${ct}`);
  });
});

// ═══════════════════════════════════════════════════════════════
// Block 4: Admin Cost Endpoint Enrichment (T-AAE23 to T-AAE26)
// ═══════════════════════════════════════════════════════════════
describe('Admin Analytics — Cost Endpoint Enrichment (Phase 103)', () => {
  let ts;

  before(async () => { ts = await createTestServer(); });
  after(async () => { await ts.close(); });

  // T-AAE23: GET /api/admin/cost with auth → 200 (backward compat)
  it('T-AAE23: GET /api/admin/cost with auth — returns 200', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/cost`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(typeof data.enabled, 'boolean');
  });

  // T-AAE24: Response contains semanticMatchingCost object
  it('T-AAE24: response contains semanticMatchingCost object', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/cost`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    const data = await res.json();
    assert.strictEqual(typeof data.semanticMatchingCost, 'object');
    assert.ok(data.semanticMatchingCost !== null, 'semanticMatchingCost should not be null');
  });

  // T-AAE25: semanticMatchingCost.enabled is boolean
  it('T-AAE25: semanticMatchingCost.enabled is boolean', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/cost`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    const data = await res.json();
    assert.strictEqual(typeof data.semanticMatchingCost.enabled, 'boolean');
    assert.strictEqual(data.semanticMatchingCost.enabled, true, 'SEMANTIC_MATCHING enabled by default');
  });

  // T-AAE26: Existing fields (globalUsage, providers, topSessions) unchanged
  it('T-AAE26: existing fields unchanged (backward compatible)', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/cost`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    const data = await res.json();
    assert.ok('globalUsage' in data, 'should contain globalUsage');
    assert.ok(Array.isArray(data.providers), 'providers should be array');
    assert.ok(Array.isArray(data.topSessions), 'topSessions should be array');
    assert.strictEqual(typeof data.monthlyBudgetCeiling, 'number');
    assert.strictEqual(typeof data.monthlyBudgetUsed, 'number');
    assert.strictEqual(typeof data.enforcementEnabled, 'boolean');
  });
});

// ═══════════════════════════════════════════════════════════════
// Block 5: getStats / getPerformance Methods (T-AAE27 to T-AAE30)
// ═══════════════════════════════════════════════════════════════
describe('Admin Analytics — Singleton Stats Methods (Phase 103)', () => {

  // T-AAE27: refinementAnalytics.getStats() returns expected shape
  it('T-AAE27: refinementAnalytics.getStats() returns expected shape', async () => {
    const { refinementAnalytics } = await import('../server/services/refinementAnalytics.js');
    refinementAnalytics.reset();
    refinementAnalytics.record({
      correlationId: 'test-1', sessionId: 's1', originalScore: 0.2, finalScore: 0.5,
      attempts: 1, improved: true, responseMode: 'structured', strategy: 'deep_analytical',
      avgScore: 0.7, timestamp: Date.now(),
    });
    const stats = refinementAnalytics.getStats();
    assert.strictEqual(stats.totalRecorded, 1);
    assert.strictEqual(stats.successRate, 1);
    assert.strictEqual(typeof stats.avgImprovement, 'number');
    assert.strictEqual(typeof stats.avgAttempts, 'number');
    assert.strictEqual(typeof stats.byResponseMode, 'object');
    assert.strictEqual(typeof stats.byStrategy, 'object');
    refinementAnalytics.reset();
  });

  // T-AAE28: refinementAnalytics.getStats() totalRecorded is 0 when empty
  it('T-AAE28: refinementAnalytics.getStats() totalRecorded is 0 when empty', async () => {
    const { refinementAnalytics } = await import('../server/services/refinementAnalytics.js');
    refinementAnalytics.reset();
    const stats = refinementAnalytics.getStats();
    assert.strictEqual(stats.totalRecorded, 0);
    assert.strictEqual(stats.successRate, 0);
    assert.strictEqual(stats.avgImprovement, 0);
  });

  // T-AAE29: strategyAnalytics.getPerformance() returns expected shape
  it('T-AAE29: strategyAnalytics.getPerformance() returns expected shape', async () => {
    const { strategyAnalytics } = await import('../server/services/strategyAnalytics.js');
    strategyAnalytics.reset();
    strategyAnalytics.record({
      correlationId: 'test-1', sessionId: 's1', strategy: 'quick_factual',
      complexityType: 'factual', avgScore: 0.85, turnNumber: 1,
      isFollowUp: false, skipped: false, timestamp: Date.now(),
    });
    const perf = strategyAnalytics.getPerformance();
    assert.strictEqual(perf.totalRecorded, 1);
    assert.strictEqual(typeof perf.skippedCount, 'number');
    assert.strictEqual(typeof perf.skippedRate, 'number');
    assert.strictEqual(typeof perf.byStrategy, 'object');
    assert.strictEqual(typeof perf.escalationRate, 'number');
    strategyAnalytics.reset();
  });

  // T-AAE30: strategyAnalytics.getPerformance() totalRecorded is 0 when empty
  it('T-AAE30: strategyAnalytics.getPerformance() totalRecorded is 0 when empty', async () => {
    const { strategyAnalytics } = await import('../server/services/strategyAnalytics.js');
    strategyAnalytics.reset();
    const perf = strategyAnalytics.getPerformance();
    assert.strictEqual(perf.totalRecorded, 0);
    assert.strictEqual(perf.escalationRate, 0);
  });
});
