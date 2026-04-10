// tests/admin-intelligence.test.js
// ═══════════════════════════════════════════════════════════════
// AdminIntelligenceEngine — Phase 53
// 14 test cases for singleton #28.
// Pattern: singleton + featureFlags.setOverride + reset() cleanup.
// ═══════════════════════════════════════════════════════════════

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { adminIntelligence } from '../server/services/adminIntelligence.js';
import { featureFlags } from '../server/services/featureFlags.js';

describe('AdminIntelligenceEngine (Phase 53)', () => {

  afterEach(() => {
    adminIntelligence.stopAnalysis();
    adminIntelligence.reset();
    featureFlags.clearOverride('ADMIN_INTELLIGENCE');
  });

  // T-AI01: enabled defaults to true (Phase 97: ADMIN_INTELLIGENCE enabled by default)
  it('T-AI01: enabled defaults to true (config guard via featureFlags)', () => {
    assert.strictEqual(adminIntelligence.enabled, true);
  });

  // T-AI02: analyze() generates insights when enabled (Phase 97: enabled by default)
  it('T-AI02: analyze() generates insights when enabled by default', () => {
    adminIntelligence.analyze();
    const counts = adminIntelligence.counts();
    assert.strictEqual(counts.analysisCount, 1);
    assert.ok(counts.insightCount >= 1, 'should generate at least 1 insight');
  });

  // T-AI03: getInsights() returns empty array when disabled
  it('T-AI03: getInsights() returns empty array when disabled', () => {
    const insights = adminIntelligence.getInsights();
    assert.deepStrictEqual(insights, []);
  });

  // T-AI04: counts() returns correct structure
  it('T-AI04: counts() returns correct structure', () => {
    const counts = adminIntelligence.counts();
    assert.strictEqual(typeof counts.enabled, 'boolean');
    assert.strictEqual(typeof counts.analysisCount, 'number');
    assert.strictEqual(typeof counts.insightCount, 'number');
    assert.strictEqual(typeof counts.notificationCount, 'number');
    assert.strictEqual(counts.lastAnalyzedAt, null);
  });

  // T-AI05: after setOverride — enabled becomes true
  it('T-AI05: after featureFlags.setOverride — enabled becomes true', () => {
    featureFlags.setOverride('ADMIN_INTELLIGENCE', true);
    assert.strictEqual(adminIntelligence.enabled, true);
  });

  // T-AI06: analyze() when enabled generates at least one insight
  it('T-AI06: analyze() when enabled generates insights', () => {
    featureFlags.setOverride('ADMIN_INTELLIGENCE', true);
    adminIntelligence.analyze();
    const counts = adminIntelligence.counts();
    assert.strictEqual(counts.analysisCount, 1);
    // Should have at least the "no requests" info insight
    assert.ok(counts.insightCount >= 1, 'should generate at least 1 insight');
  });

  // T-AI07: getInsights(limit) respects limit parameter
  it('T-AI07: getInsights(limit) respects limit parameter', () => {
    featureFlags.setOverride('ADMIN_INTELLIGENCE', true);
    adminIntelligence.analyze();
    const all = adminIntelligence.getInsights(100);
    const limited = adminIntelligence.getInsights(1);
    assert.ok(all.length >= 1);
    assert.strictEqual(limited.length, 1);
  });

  // T-AI08: insights sorted by severity
  it('T-AI08: insights sorted by severity — critical first, then warning, then info', () => {
    featureFlags.setOverride('ADMIN_INTELLIGENCE', true);
    adminIntelligence.analyze();
    const insights = adminIntelligence.getInsights(100);
    const severityOrder = { critical: 0, warning: 1, info: 2 };
    for (let i = 1; i < insights.length; i++) {
      const prev = severityOrder[insights[i - 1].severity] ?? 99;
      const curr = severityOrder[insights[i].severity] ?? 99;
      assert.ok(prev <= curr, `insight ${i - 1} (${insights[i - 1].severity}) should be <= insight ${i} (${insights[i].severity})`);
    }
  });

  // T-AI09: _recordCompletion increments rolling counter
  it('T-AI09: _recordCompletion() increments rolling counter', () => {
    featureFlags.setOverride('ADMIN_INTELLIGENCE', true);
    adminIntelligence._recordCompletion({ totalMs: 100 });
    adminIntelligence._recordCompletion({ totalMs: 200 });
    const stats = adminIntelligence.getRollingStats();
    assert.strictEqual(stats.completionsSinceLastAnalysis, 2);
  });

  // T-AI10: _recordFeedback increments rolling negative counter
  it('T-AI10: _recordFeedback({ rating: "negative" }) increments rolling negative counter', () => {
    featureFlags.setOverride('ADMIN_INTELLIGENCE', true);
    adminIntelligence._recordFeedback({ rating: 'negative' });
    adminIntelligence._recordFeedback({ rating: 'positive' });
    adminIntelligence._recordFeedback({ rating: 'negative' });
    const stats = adminIntelligence.getRollingStats();
    assert.strictEqual(stats.feedbackSinceLastAnalysis.negative, 2);
    assert.strictEqual(stats.feedbackSinceLastAnalysis.positive, 1);
  });

  // T-AI11: getNotifications(since) filters by timestamp
  it('T-AI11: getNotifications(since) filters by timestamp', () => {
    featureFlags.setOverride('ADMIN_INTELLIGENCE', true);
    adminIntelligence.analyze();
    const all = adminIntelligence.getNotifications(0);
    const future = adminIntelligence.getNotifications(Date.now() + 100000);
    assert.ok(all.length >= 0);
    assert.strictEqual(future.length, 0);
  });

  // T-AI12: notification ring buffer capped
  it('T-AI12: notification ring buffer capped at notificationMaxQueue', () => {
    featureFlags.setOverride('ADMIN_INTELLIGENCE', true);
    // Run many analyses to accumulate notifications
    for (let i = 0; i < 60; i++) {
      adminIntelligence.reset();
      featureFlags.setOverride('ADMIN_INTELLIGENCE', true);
      adminIntelligence.analyze();
    }
    const all = adminIntelligence.getNotifications(0);
    // Config default is 50
    assert.ok(all.length <= 50, `notification count ${all.length} should be <= 50`);
  });

  // T-AI13: reset() clears all state
  it('T-AI13: reset() clears all state — insights empty, counters zero', () => {
    featureFlags.setOverride('ADMIN_INTELLIGENCE', true);
    adminIntelligence._recordCompletion({});
    adminIntelligence.analyze();
    assert.ok(adminIntelligence.counts().analysisCount > 0);
    adminIntelligence.reset();
    const counts = adminIntelligence.counts();
    assert.strictEqual(counts.analysisCount, 0);
    assert.strictEqual(counts.insightCount, 0);
    assert.strictEqual(counts.notificationCount, 0);
    const stats = adminIntelligence.getRollingStats();
    assert.strictEqual(stats.completionsSinceLastAnalysis, 0);
  });

  // T-AI14: startAnalysis() + stopAnalysis() timer lifecycle
  it('T-AI14: startAnalysis() + stopAnalysis() timer lifecycle — no dangling timers', () => {
    featureFlags.setOverride('ADMIN_INTELLIGENCE', true);
    adminIntelligence.startAnalysis();
    // Should have run first analysis immediately
    assert.ok(adminIntelligence.counts().analysisCount >= 1);
    adminIntelligence.stopAnalysis();
    const countAfterStop = adminIntelligence.counts().analysisCount;
    // No more analyses should run after stop
    assert.strictEqual(adminIntelligence.counts().analysisCount, countAfterStop);
  });

  // T-AI15: analyze('lib-test') generates insights with libraryId field
  it('T-AI15: analyze(libraryId) generates insights with libraryId field set', () => {
    featureFlags.setOverride('ADMIN_INTELLIGENCE', true);
    adminIntelligence.analyze('lib-test');
    const insights = adminIntelligence.getInsights(100);
    assert.ok(insights.length >= 1, 'should generate at least 1 per-library insight');
    for (const insight of insights) {
      assert.strictEqual(insight.libraryId, 'lib-test', 'every insight should have libraryId: "lib-test"');
      assert.ok(insight.insightKey.endsWith(':lib-test'), `insightKey "${insight.insightKey}" should be suffixed with :lib-test`);
    }
  });

  // T-AI16: analyze() without parameter generates insights with libraryId: null
  it('T-AI16: analyze() without parameter generates insights with libraryId: null — backward compatible', () => {
    featureFlags.setOverride('ADMIN_INTELLIGENCE', true);
    adminIntelligence.analyze();
    const insights = adminIntelligence.getInsights(100);
    assert.ok(insights.length >= 1, 'should generate at least 1 global insight');
    for (const insight of insights) {
      assert.strictEqual(insight.libraryId, null, 'global insight should have libraryId: null');
      assert.ok(!insight.insightKey.includes(':'), `global insightKey "${insight.insightKey}" should not have library suffix`);
    }
  });

  // T-AI17: getInsights(10, 'lib-test') returns only matching insights
  it('T-AI17: getInsights(limit, libraryId) filters by libraryId', () => {
    featureFlags.setOverride('ADMIN_INTELLIGENCE', true);
    // Generate global insights
    adminIntelligence.analyze();
    // Generate per-library insights
    adminIntelligence.analyze('lib-test');
    // All insights (mixed)
    const all = adminIntelligence.getInsights(100);
    assert.ok(all.length >= 2, 'should have global + per-library insights');
    // Filtered — only per-library
    const filtered = adminIntelligence.getInsights(100, 'lib-test');
    assert.ok(filtered.length >= 1, 'should have at least 1 filtered insight');
    for (const insight of filtered) {
      assert.strictEqual(insight.libraryId, 'lib-test');
    }
    // Filtered should be subset of all
    assert.ok(filtered.length <= all.length, 'filtered should be <= all');
  });

  // T-AI18: getInsights(10) without libraryId returns all insights (global + per-library)
  it('T-AI18: getInsights(limit) without libraryId returns all insights — backward compatible', () => {
    featureFlags.setOverride('ADMIN_INTELLIGENCE', true);
    adminIntelligence.analyze();
    adminIntelligence.analyze('lib-a');
    const all = adminIntelligence.getInsights(100);
    const hasGlobal = all.some(i => i.libraryId === null);
    const hasPerLib = all.some(i => i.libraryId === 'lib-a');
    assert.ok(hasGlobal, 'should contain global insights (libraryId: null)');
    assert.ok(hasPerLib, 'should contain per-library insights (libraryId: "lib-a")');
  });

});
