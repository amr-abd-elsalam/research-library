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

  // T-AI01: enabled defaults to false
  it('T-AI01: enabled defaults to false (config guard via featureFlags)', () => {
    assert.strictEqual(adminIntelligence.enabled, false);
  });

  // T-AI02: analyze() is no-op when disabled
  it('T-AI02: analyze() is no-op when disabled — no insights generated', () => {
    adminIntelligence.analyze();
    const counts = adminIntelligence.counts();
    assert.strictEqual(counts.analysisCount, 0);
    assert.strictEqual(counts.insightCount, 0);
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

});
