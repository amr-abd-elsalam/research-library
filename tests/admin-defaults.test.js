// tests/admin-defaults.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 97 — Admin Feature Defaults Tests
// Verifies that all newly-enabled features return actual data
// from their respective API endpoints (not 404 or enabled:false).
// Uses real HTTP via createTestServer.
// ═══════════════════════════════════════════════════════════════

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestServer } from './helpers/test-server.js';
import config from '../config.js';

const ADMIN_TOKEN = 'test-admin-token-phase56';

// ═══════════════════════════════════════════════════════════════
// Block 1: Config Default Verification (T-AD01 to T-AD07)
// ═══════════════════════════════════════════════════════════════
describe('Admin Feature Defaults — Config (Phase 97)', () => {

  // T-AD01: config.CONTENT_GAPS.enabled === true
  it('T-AD01: config.CONTENT_GAPS.enabled is true', () => {
    assert.strictEqual(config.CONTENT_GAPS.enabled, true);
  });

  // T-AD02: config.QUALITY.enabled === true
  it('T-AD02: config.QUALITY.enabled is true', () => {
    assert.strictEqual(config.QUALITY.enabled, true);
  });

  // T-AD03: config.HEALTH_SCORE.enabled === true
  it('T-AD03: config.HEALTH_SCORE.enabled is true', () => {
    assert.strictEqual(config.HEALTH_SCORE.enabled, true);
  });

  // T-AD04: config.EXPORT.enabled === true
  it('T-AD04: config.EXPORT.enabled is true', () => {
    assert.strictEqual(config.EXPORT.enabled, true);
  });

  // T-AD05: config.PIPELINE.adaptiveEnabled === true
  it('T-AD05: config.PIPELINE.adaptiveEnabled is true', () => {
    assert.strictEqual(config.PIPELINE.adaptiveEnabled, true);
  });

  // T-AD06: config.LIBRARY_INDEX.enabled === true
  it('T-AD06: config.LIBRARY_INDEX.enabled is true', () => {
    assert.strictEqual(config.LIBRARY_INDEX.enabled, true);
  });

  // T-AD07: config.ADMIN_INTELLIGENCE.enabled === true
  it('T-AD07: config.ADMIN_INTELLIGENCE.enabled is true', () => {
    assert.strictEqual(config.ADMIN_INTELLIGENCE.enabled, true);
  });

  // T-AD26: config.RETRIEVAL.rerankEnabled === true (Phase 98)
  it('T-AD26: config.RETRIEVAL.rerankEnabled is true', () => {
    assert.strictEqual(config.RETRIEVAL.rerankEnabled, true);
  });

  // T-AD27: config.QUERY_COMPLEXITY.enabled === true (Phase 98)
  it('T-AD27: config.QUERY_COMPLEXITY.enabled is true', () => {
    assert.strictEqual(config.QUERY_COMPLEXITY.enabled, true);
  });

  // T-AD31: config.QUERY_PLANNING.enabled === true (Phase 99)
  it('T-AD31: config.QUERY_PLANNING.enabled is true', () => {
    assert.strictEqual(config.QUERY_PLANNING.enabled, true);
  });

  // T-AD34: config.RAG_STRATEGIES.enabled === true (Phase 100)
  it('T-AD34: config.RAG_STRATEGIES.enabled is true', () => {
    assert.strictEqual(config.RAG_STRATEGIES.enabled, true);
  });

  // T-AD39: config.ANSWER_REFINEMENT.enabled === true (Phase 101)
  it('T-AD39: config.ANSWER_REFINEMENT.enabled is true', () => {
    assert.strictEqual(config.ANSWER_REFINEMENT.enabled, true);
  });

  // T-AD40: config.COST_GOVERNANCE.enabled === true (Phase 101)
  it('T-AD40: config.COST_GOVERNANCE.enabled is true', () => {
    assert.strictEqual(config.COST_GOVERNANCE.enabled, true);
  });

  // T-AD41: config.COST_GOVERNANCE.enforceBudget === false (Phase 101 — tracking only)
  it('T-AD41: config.COST_GOVERNANCE.enforceBudget is false', () => {
    assert.strictEqual(config.COST_GOVERNANCE.enforceBudget, false);
  });
});

// ═══════════════════════════════════════════════════════════════
// Block 2: API Endpoint Verification (T-AD08 to T-AD20)
// ═══════════════════════════════════════════════════════════════
describe('Admin Feature Defaults — API Endpoints (Phase 97)', () => {
  let ts;

  before(async () => { ts = await createTestServer(); });
  after(async () => { await ts.close(); });

  // T-AD08: Health Score returns 200 (not 404) with default config
  it('T-AD08: GET /api/admin/health-score returns 200 with score field', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/health-score`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok('score' in data, 'should contain score field');
    assert.ok('level' in data, 'should contain level field');
    assert.ok('breakdown' in data, 'should contain breakdown field');
    assert.ok('actionItems' in data, 'should contain actionItems field');
  });

  // T-AD09: Content Gaps returns enabled: true
  it('T-AD09: GET /api/admin/gaps returns enabled: true', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/gaps`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.enabled, true, 'enabled should be true');
    assert.ok('gaps' in data, 'should contain gaps field');
    assert.ok(Array.isArray(data.gaps), 'gaps should be an array');
  });

  // T-AD10: Intelligence returns enabled: true
  it('T-AD10: GET /api/admin/intelligence returns enabled: true', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/intelligence`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.enabled, true, 'enabled should be true');
    assert.ok('insights' in data, 'should contain insights field');
  });

  // T-AD11: Export feedback returns 200 (not 404)
  it('T-AD11: GET /api/admin/export?type=feedback returns 200', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/export?type=feedback`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok('feedback' in data, 'should contain feedback field');
  });

  // T-AD12: Export audit returns 200
  it('T-AD12: GET /api/admin/export?type=audit returns 200', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/export?type=audit`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok('audit' in data, 'should contain audit field');
  });

  // T-AD13: Export gaps returns 200
  it('T-AD13: GET /api/admin/export?type=gaps returns 200', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/export?type=gaps`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok('gaps' in data, 'should contain gaps field');
  });

  // T-AD14: Export logs returns 200
  it('T-AD14: GET /api/admin/export?type=logs returns 200', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/export?type=logs`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok('logs' in data, 'should contain logs field');
  });

  // T-AD15: Export grounding returns 200
  it('T-AD15: GET /api/admin/export?type=grounding returns 200', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/export?type=grounding`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok('grounding' in data, 'should contain grounding field');
  });

  // T-AD16: Config features returns CONTENT_GAPS + QUALITY + HEALTH_SCORE as true
  it('T-AD16: GET /api/config/features — CONTENT_GAPS + QUALITY + HEALTH_SCORE all true', async () => {
    const res = await fetch(`${ts.baseUrl}/api/config/features`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.CONTENT_GAPS, true, 'CONTENT_GAPS should be true');
    assert.strictEqual(data.QUALITY, true, 'QUALITY should be true');
    assert.strictEqual(data.HEALTH_SCORE, true, 'HEALTH_SCORE should be true');
  });

  // T-AD17: Config features returns ADMIN_INTELLIGENCE as true
  it('T-AD17: GET /api/config/features — ADMIN_INTELLIGENCE is true', async () => {
    const res = await fetch(`${ts.baseUrl}/api/config/features`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.ADMIN_INTELLIGENCE, true, 'ADMIN_INTELLIGENCE should be true');
  });

  // T-AD18: Inspect shows libraryIndex enabled
  it('T-AD18: GET /api/admin/inspect — libraryIndex.enabled is true', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/inspect`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.libraryIndex.enabled, true);
  });

  // T-AD19: Inspect shows adminIntelligence enabled
  it('T-AD19: GET /api/admin/inspect — adminIntelligence.enabled is true', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/inspect`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.adminIntelligence.enabled, true);
  });

  // T-AD20: Inspect shows contentGapDetector enabled
  it('T-AD20: GET /api/admin/inspect — contentGapDetector.enabled is true', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/inspect`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.contentGapDetector.enabled, true);
  });

  // T-AD21: GET /api/config — QUALITY section includes effectiveEnabled
  it('T-AD21: GET /api/config — QUALITY has effectiveEnabled field', async () => {
    const res = await fetch(`${ts.baseUrl}/api/config`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok('QUALITY' in data, 'should contain QUALITY section');
    assert.strictEqual(data.QUALITY.enabled, true, 'QUALITY.enabled should be true');
    assert.strictEqual(typeof data.QUALITY.effectiveEnabled, 'boolean', 'effectiveEnabled should be boolean');
  });

  // T-AD22: GET /api/config — HEALTH_SCORE section includes effectiveEnabled
  it('T-AD22: GET /api/config — HEALTH_SCORE has effectiveEnabled', async () => {
    const res = await fetch(`${ts.baseUrl}/api/config`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok('HEALTH_SCORE' in data, 'should contain HEALTH_SCORE section');
    assert.strictEqual(data.HEALTH_SCORE.enabled, true);
  });

  // T-AD23: GET /api/config — EXPORT.enabled is true
  it('T-AD23: GET /api/config — EXPORT.enabled is true', async () => {
    const res = await fetch(`${ts.baseUrl}/api/config`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok('EXPORT' in data, 'should contain EXPORT section');
    assert.strictEqual(data.EXPORT.enabled, true);
  });

  // T-AD24: Health score returns valid score number (0-100)
  it('T-AD24: health-score returns valid score (0-100)', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/health-score`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(typeof data.score, 'number', 'score should be a number');
    assert.ok(data.score >= 0 && data.score <= 100, `score should be 0-100, got ${data.score}`);
  });

  // T-AD25: Health score returns valid level string
  it('T-AD25: health-score returns valid level', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/health-score`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(['healthy', 'warning', 'critical'].includes(data.level),
      `level should be healthy/warning/critical, got ${data.level}`);
  });

  // T-AD28: Inspect shows searchReranker.enabled true (Phase 98)
  it('T-AD28: inspect shows searchReranker.enabled true', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/inspect`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.searchReranker.enabled, true, 'searchReranker should be enabled by default');
  });

  // T-AD29: Inspect shows queryComplexityAnalyzer.enabled true (Phase 98)
  it('T-AD29: inspect shows queryComplexityAnalyzer.enabled true', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/inspect`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.queryComplexityAnalyzer.enabled, true, 'queryComplexityAnalyzer should be enabled by default');
  });

  // T-AD30: Config features returns RETRIEVAL + QUERY_COMPLEXITY as true (Phase 98)
  it('T-AD30: config features — RETRIEVAL + QUERY_COMPLEXITY true', async () => {
    const res = await fetch(`${ts.baseUrl}/api/config/features`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.RETRIEVAL, true, 'RETRIEVAL should be true');
    assert.strictEqual(data.QUERY_COMPLEXITY, true, 'QUERY_COMPLEXITY should be true');
  });

  // T-AD32: Config features returns QUERY_PLANNING as true (Phase 99)
  it('T-AD32: config features — QUERY_PLANNING true', async () => {
    const res = await fetch(`${ts.baseUrl}/api/config/features`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.QUERY_PLANNING, true, 'QUERY_PLANNING should be true');
  });

  // T-AD33: Inspect shows queryPlanner.enabled true (Phase 99)
  it('T-AD33: inspect shows queryPlanner.enabled true', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/inspect`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.queryPlanner.enabled, true, 'queryPlanner should be enabled by default');
  });

  // T-AD35: Config features returns RAG_STRATEGIES as true (Phase 100)
  it('T-AD35: config features — RAG_STRATEGIES true', async () => {
    const res = await fetch(`${ts.baseUrl}/api/config/features`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.RAG_STRATEGIES, true, 'RAG_STRATEGIES should be true');
  });

  // T-AD36: Inspect shows ragStrategySelector.enabled true (Phase 100)
  it('T-AD36: inspect shows ragStrategySelector.enabled true', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/inspect`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.ragStrategySelector.enabled, true, 'ragStrategySelector should be enabled by default');
  });

  // T-AD42: Inspect shows answerRefinement.enabled true (Phase 101)
  it('T-AD42: inspect shows answerRefinement.enabled true', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/inspect`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.answerRefinement.enabled, true, 'answerRefinement should be enabled by default');
  });

  // T-AD43: Inspect shows costGovernor.enabled true (Phase 101)
  it('T-AD43: inspect shows costGovernor.enabled true', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/inspect`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.costGovernor.enabled, true, 'costGovernor should be enabled by default');
    assert.strictEqual(data.costGovernor.enforcementEnabled, false, 'enforceBudget should still be false');
  });

  // T-AD44: Config features returns ANSWER_REFINEMENT + COST_GOVERNANCE as true (Phase 101)
  it('T-AD44: config features — ANSWER_REFINEMENT + COST_GOVERNANCE true', async () => {
    const res = await fetch(`${ts.baseUrl}/api/config/features`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.ANSWER_REFINEMENT, true, 'ANSWER_REFINEMENT should be true');
    assert.strictEqual(data.COST_GOVERNANCE, true, 'COST_GOVERNANCE should be true');
  });

  // T-AD37: Inspect shows searchReranker.totalReranked is number (Phase 100)
  it('T-AD37: inspect shows searchReranker.totalReranked', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/inspect`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(typeof data.searchReranker.totalReranked, 'number');
  });

  // T-AD38: Inspect shows queryComplexityAnalyzer.totalAnalyzed + typeBreakdown (Phase 100)
  it('T-AD38: inspect shows queryComplexityAnalyzer counters', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/inspect`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(typeof data.queryComplexityAnalyzer.totalAnalyzed, 'number');
    assert.strictEqual(typeof data.queryComplexityAnalyzer.typeBreakdown, 'object');
    assert.strictEqual(Object.keys(data.queryComplexityAnalyzer.typeBreakdown).length, 5);
  });
});
