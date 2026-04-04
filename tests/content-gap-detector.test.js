// tests/content-gap-detector.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 48 — ContentGapDetector unit tests
// Tests disabled→enabled toggle via FeatureFlags, record() + getGaps()
// lifecycle, limit enforcement, frequency tracking (Jaccard clustering),
// restoreFromEntries recovery, and counts() structure.
// Uses the singleton instance + featureFlags.setOverride().
// Config default: CONTENT_GAPS.enabled = false.
// Note: ContentGapDetector has no reset() method — entries accumulate
// across tests. Tests are designed to be idempotent (behavior checks,
// not exact counts). Tests that record entries use featureFlags toggle.
// ═══════════════════════════════════════════════════════════════

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { contentGapDetector } from '../server/services/contentGapDetector.js';
import { featureFlags } from '../server/services/featureFlags.js';

describe('ContentGapDetector', () => {

  afterEach(() => {
    featureFlags.clearOverride('CONTENT_GAPS');
  });

  // T-CG01: enabled returns false with default config
  it('T-CG01: enabled returns false with default config', () => {
    assert.strictEqual(contentGapDetector.enabled, false);
  });

  // T-CG02: record() is no-op when disabled — does not throw
  it('T-CG02: record is no-op when disabled — does not throw', () => {
    assert.doesNotThrow(() => {
      contentGapDetector.record({ message: 'test question', reason: 'low_score' });
    });
  });

  // T-CG03: getGaps() returns empty array when disabled
  it('T-CG03: getGaps returns empty array when disabled', () => {
    const gaps = contentGapDetector.getGaps(10);
    assert.ok(Array.isArray(gaps), 'should be an array');
    assert.strictEqual(gaps.length, 0);
  });

  // T-CG04: counts() returns object with enabled and totalEntries fields
  it('T-CG04: counts returns object with enabled and totalEntries fields', () => {
    const c = contentGapDetector.counts();
    assert.ok('enabled' in c, 'should have enabled key');
    assert.ok('totalEntries' in c, 'should have totalEntries key');
    assert.ok('clusterCount' in c, 'should have clusterCount key');
    assert.ok('visibleGaps' in c, 'should have visibleGaps key');
  });

  // T-CG05: After setOverride('CONTENT_GAPS', true) — enabled returns true
  it('T-CG05: enabled returns true after setOverride CONTENT_GAPS true', () => {
    featureFlags.setOverride('CONTENT_GAPS', true);
    assert.strictEqual(contentGapDetector.enabled, true);
  });

  // T-CG06: After enabling — record() with valid message creates entry (counts totalEntries > 0)
  it('T-CG06: record with valid message increases totalEntries when enabled', () => {
    featureFlags.setOverride('CONTENT_GAPS', true);
    const before = contentGapDetector.counts().totalEntries;
    contentGapDetector.record({
      message: 'كيف أستخدم الذكاء الاصطناعي في التعليم المدرسي',
      reason: 'low_score',
      avgScore: 0.2,
    });
    const after = contentGapDetector.counts().totalEntries;
    assert.ok(after > before, `totalEntries should increase — before: ${before}, after: ${after}`);
  });

  // T-CG07: getGaps(limit) returns at most limit entries
  it('T-CG07: getGaps respects limit parameter', () => {
    featureFlags.setOverride('CONTENT_GAPS', true);
    // Record enough entries to potentially exceed limit
    // (entries from other tests may already exist — that's fine)
    for (let i = 0; i < 5; i++) {
      contentGapDetector.record({
        message: `سؤال فريد عن موضوع خاص جداً رقم ${i} في مجال البرمجة المتقدمة`,
        reason: 'low_score',
        avgScore: 0.1,
      });
    }
    const gaps = contentGapDetector.getGaps(2);
    assert.ok(gaps.length <= 2, `getGaps(2) should return at most 2 — got ${gaps.length}`);
  });

  // T-CG08: record() same message multiple times — cluster count increases (frequency > 1)
  it('T-CG08: recording same message multiple times increases cluster count', () => {
    featureFlags.setOverride('CONTENT_GAPS', true);
    const sameMessage = 'ما هي أفضل طريقة لتحسين أداء قواعد البيانات العلائقية';
    // Record same message 3 times to ensure cluster count >= minFrequencyToShow (2)
    for (let i = 0; i < 3; i++) {
      contentGapDetector.record({ message: sameMessage, reason: 'low_score', avgScore: 0.15 });
    }
    // getGaps filters by minFrequencyToShow (default 2) — this cluster should appear
    const gaps = contentGapDetector.getGaps(50);
    // Find a gap whose keywords overlap with our message
    const found = gaps.some(g => g.count >= 2);
    assert.ok(found, 'should find at least one cluster with count >= 2');
  });

  // T-CG09: restoreFromEntries() with valid entries — gaps restored
  it('T-CG09: restoreFromEntries restores entries when enabled', () => {
    featureFlags.setOverride('CONTENT_GAPS', true);
    const before = contentGapDetector.counts().totalEntries;
    const entries = [
      { message: 'سؤال تاريخي عن الحضارة الإسلامية وتأثيرها على العلوم', reason: 'low_score', avgScore: 0.3, timestamp: Date.now() - 10000 },
      { message: 'سؤال تاريخي عن الحضارة الإسلامية وتأثيرها على الفلسفة', reason: 'low_score', avgScore: 0.25, timestamp: Date.now() - 5000 },
    ];
    contentGapDetector.restoreFromEntries(entries);
    const after = contentGapDetector.counts().totalEntries;
    assert.ok(after >= before + 2, `totalEntries should increase by at least 2 — before: ${before}, after: ${after}`);
  });

  // T-CG10: After clearOverride('CONTENT_GAPS') — reverts to disabled (getGaps returns empty)
  it('T-CG10: getGaps returns empty after clearOverride CONTENT_GAPS', () => {
    featureFlags.setOverride('CONTENT_GAPS', true);
    contentGapDetector.record({ message: 'سؤال عن البرمجة الكمية وتطبيقاتها', reason: 'low_score' });

    featureFlags.clearOverride('CONTENT_GAPS');
    const gaps = contentGapDetector.getGaps(10);
    assert.strictEqual(gaps.length, 0, 'getGaps should return empty when disabled');
  });

});
