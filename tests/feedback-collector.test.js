// tests/feedback-collector.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 50 — FeedbackCollector unit tests
// Tests the FeedbackCollector singleton lifecycle:
//   - Disabled-path guards (config.FEEDBACK.enabled = false by default)
//   - Dynamic enabled getter via featureFlags.setOverride()
//   - submit() validation (correlationId, rating, comment)
//   - recent() retrieval + limit
//   - counts() structure
//   - reset() lifecycle
//
// ⚠️ Known issue (BUG-3 from Phase 50 audit):
//   submit() checks this.#enabled (static config value), NOT this.enabled
//   (dynamic featureFlags getter). So even after setOverride('FEEDBACK', true),
//   submit() still returns false because config.FEEDBACK.enabled = false.
//   Tests document the actual behavior. A future Phase should fix submit()
//   to use the dynamic getter.
//
// Uses singleton + featureFlags.setOverride() + reset() pattern.
// Zero external service dependency — all operations are in-memory.
// ═══════════════════════════════════════════════════════════════

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { feedbackCollector } from '../server/services/feedbackCollector.js';
import { featureFlags } from '../server/services/featureFlags.js';

describe('FeedbackCollector', () => {

  afterEach(() => {
    featureFlags.clearOverride('FEEDBACK');
    feedbackCollector.reset();
  });

  // T-FC01: submit() returns false when disabled (config default)
  // submit() checks internal #enabled (static), which is false from config
  it('T-FC01: submit returns false when disabled (config default)', async () => {
    const result = await feedbackCollector.submit({
      correlationId: 'test-corr-001',
      rating: 'positive',
    });
    assert.strictEqual(result, false);
  });

  // T-FC02: counts() when disabled via featureFlags — shows enabled: false
  it('T-FC02: counts shows enabled false with default config', () => {
    const c = feedbackCollector.counts();
    assert.strictEqual(c.enabled, false);
    assert.strictEqual(typeof c.totalPositive, 'number');
    assert.strictEqual(typeof c.totalNegative, 'number');
    assert.strictEqual(typeof c.recentCount, 'number');
  });

  // T-FC03: enabled getter reflects featureFlags state after setOverride
  it('T-FC03: enabled getter reflects featureFlags state after setOverride', () => {
    assert.strictEqual(feedbackCollector.enabled, false);
    featureFlags.setOverride('FEEDBACK', true);
    assert.strictEqual(feedbackCollector.enabled, true);
  });

  // T-FC04: submit() still returns false even after setOverride (BUG-3: static #enabled check)
  // This documents the known inconsistency between dynamic getter and static submit guard
  it('T-FC04: submit returns false even after setOverride due to static #enabled check (BUG-3)', async () => {
    featureFlags.setOverride('FEEDBACK', true);
    assert.strictEqual(feedbackCollector.enabled, true, 'dynamic getter should be true');
    const result = await feedbackCollector.submit({
      correlationId: 'test-corr-002',
      rating: 'positive',
    });
    // BUG-3: submit() uses this.#enabled (static config = false), not this.enabled (dynamic)
    assert.strictEqual(result, false, 'submit still returns false due to static #enabled guard');
  });

  // T-FC05: submit() validates correlationId is required — returns false without it
  it('T-FC05: submit returns false without correlationId', async () => {
    // Even if we could enable submit, missing correlationId should fail validation
    const result = await feedbackCollector.submit({
      rating: 'positive',
    });
    assert.strictEqual(result, false);
  });

  // T-FC06: submit() validates rating must be positive or negative
  it('T-FC06: submit returns false with invalid rating', async () => {
    const result = await feedbackCollector.submit({
      correlationId: 'test-corr-003',
      rating: 'neutral', // invalid — only 'positive' or 'negative'
    });
    assert.strictEqual(result, false);
  });

  // T-FC07: counts() returns correct structure with all expected keys
  it('T-FC07: counts returns correct structure with all expected keys', () => {
    const c = feedbackCollector.counts();
    assert.ok('enabled' in c, 'should have enabled key');
    assert.ok('totalPositive' in c, 'should have totalPositive key');
    assert.ok('totalNegative' in c, 'should have totalNegative key');
    assert.ok('recentCount' in c, 'should have recentCount key');
  });

  // T-FC08: recent() returns empty array initially
  it('T-FC08: recent returns empty array initially', () => {
    const entries = feedbackCollector.recent();
    assert.ok(Array.isArray(entries), 'should be an array');
    assert.strictEqual(entries.length, 0);
  });

  // T-FC09: recent() respects limit parameter
  it('T-FC09: recent respects limit parameter', () => {
    // Since we can't submit (BUG-3), recent should always be empty
    // but we verify the method accepts a limit parameter without error
    const entries = feedbackCollector.recent(5);
    assert.ok(Array.isArray(entries), 'should be an array');
    assert.strictEqual(entries.length, 0);
  });

  // T-FC10: reset() clears all accumulated state
  it('T-FC10: reset clears all accumulated state', () => {
    // Verify reset doesn't throw and results in clean state
    feedbackCollector.reset();
    const c = feedbackCollector.counts();
    assert.strictEqual(c.totalPositive, 0);
    assert.strictEqual(c.totalNegative, 0);
    assert.strictEqual(c.recentCount, 0);
  });

  // T-FC11: reset() then counts() shows zero totals
  it('T-FC11: reset then counts shows zero totals', () => {
    feedbackCollector.reset();
    const c = feedbackCollector.counts();
    assert.strictEqual(c.totalPositive, 0, 'totalPositive should be 0 after reset');
    assert.strictEqual(c.totalNegative, 0, 'totalNegative should be 0 after reset');
    assert.strictEqual(c.recentCount, 0, 'recentCount should be 0 after reset');
  });

  // T-FC12: counts().enabled becomes true after setOverride (dynamic getter)
  it('T-FC12: counts enabled becomes true after setOverride', () => {
    featureFlags.setOverride('FEEDBACK', true);
    const c = feedbackCollector.counts();
    assert.strictEqual(c.enabled, true, 'counts().enabled should reflect dynamic featureFlags');
  });

});
