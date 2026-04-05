// tests/feedback-collector.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 51 — FeedbackCollector unit tests
// Tests the FeedbackCollector singleton lifecycle:
//   - Disabled-path guards (config.FEEDBACK.enabled = false by default)
//   - Dynamic enabled getter via featureFlags.setOverride()
//   - submit() with dynamic featureFlags gate (BUG-3 fixed in Phase 51)
//   - submit() validation (correlationId, rating, comment)
//   - Positive/negative counters + recent() retrieval
//   - counts() structure
//   - reset() lifecycle
//
// BUG-3 (fixed in Phase 51):
//   submit() and ensureDir() previously checked this.#enabled (static config
//   value) instead of this.enabled (dynamic featureFlags getter). Fixed to
//   use this.enabled — submit() now works after setOverride('FEEDBACK', true).
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

  // T-FC04: submit() returns true after setOverride (BUG-3 fixed in Phase 51)
  // submit() now uses this.enabled (dynamic featureFlags getter) instead of this.#enabled
  it('T-FC04: submit returns true after setOverride (BUG-3 fixed)', async () => {
    featureFlags.setOverride('FEEDBACK', true);
    assert.strictEqual(feedbackCollector.enabled, true, 'dynamic getter should be true');
    const result = await feedbackCollector.submit({
      correlationId: 'test-corr-002',
      rating: 'positive',
    });
    assert.strictEqual(result, true, 'submit should return true when featureFlags enabled');
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

  // T-FC13: submit() positive rating — counters and recent updated correctly
  it('T-FC13: submit positive rating updates counters and recent', async () => {
    featureFlags.setOverride('FEEDBACK', true);
    const result = await feedbackCollector.submit({
      correlationId: 'test-corr-013',
      sessionId: 'sess-013',
      rating: 'positive',
    });
    assert.strictEqual(result, true);
    const c = feedbackCollector.counts();
    assert.strictEqual(c.totalPositive, 1);
    assert.strictEqual(c.totalNegative, 0);
    assert.strictEqual(c.recentCount, 1);
    const entries = feedbackCollector.recent();
    assert.strictEqual(entries.length, 1);
    assert.strictEqual(entries[0].correlationId, 'test-corr-013');
    assert.strictEqual(entries[0].rating, 'positive');
  });

  // T-FC14: submit() negative rating — negative counter incremented
  it('T-FC14: submit negative rating increments negative counter', async () => {
    featureFlags.setOverride('FEEDBACK', true);
    const result = await feedbackCollector.submit({
      correlationId: 'test-corr-014',
      rating: 'negative',
      comment: 'Not helpful',
    });
    assert.strictEqual(result, true);
    const c = feedbackCollector.counts();
    assert.strictEqual(c.totalPositive, 0);
    assert.strictEqual(c.totalNegative, 1);
    const entries = feedbackCollector.recent();
    assert.strictEqual(entries[0].rating, 'negative');
    assert.strictEqual(entries[0].comment, 'Not helpful');
  });

  // T-FC15: recent() respects limit when buffer has entries
  it('T-FC15: recent respects limit when buffer has entries', async () => {
    featureFlags.setOverride('FEEDBACK', true);
    for (let i = 0; i < 5; i++) {
      await feedbackCollector.submit({
        correlationId: `test-corr-15-${i}`,
        rating: 'positive',
      });
    }
    const limited = feedbackCollector.recent(3);
    assert.strictEqual(limited.length, 3, 'should return only last 3 entries');
    // recent() uses slice(-limit) — returns last N entries
    assert.strictEqual(limited[0].correlationId, 'test-corr-15-2');
    assert.strictEqual(limited[2].correlationId, 'test-corr-15-4');
  });

  // T-FC16: submit() with comment longer than maxCommentLength — truncated
  it('T-FC16: submit truncates comment to maxCommentLength', async () => {
    featureFlags.setOverride('FEEDBACK', true);
    const longComment = 'A'.repeat(300);
    await feedbackCollector.submit({
      correlationId: 'test-corr-016',
      rating: 'positive',
      comment: longComment,
    });
    const entries = feedbackCollector.recent();
    // Default maxCommentLength is 200
    assert.strictEqual(entries[0].comment.length, 200);
  });

  // T-FC17: submit() still returns false when disabled (after BUG-3 fix)
  it('T-FC17: submit returns false when feature disabled via clearOverride', async () => {
    featureFlags.setOverride('FEEDBACK', true);
    const r1 = await feedbackCollector.submit({ correlationId: 'test-corr-017a', rating: 'positive' });
    assert.strictEqual(r1, true, 'should succeed while enabled');

    featureFlags.clearOverride('FEEDBACK');
    const r2 = await feedbackCollector.submit({ correlationId: 'test-corr-017b', rating: 'positive' });
    assert.strictEqual(r2, false, 'should fail after disabling');
  });

  // T-FC18: submit() with libraryId stores correctly — counts() without filter includes entry (Phase 61)
  it('T-FC18: submit with libraryId — counts without filter returns global', async () => {
    featureFlags.setOverride('FEEDBACK', true);
    await feedbackCollector.submit({ correlationId: 'fc18', rating: 'positive', libraryId: 'lib-A' });
    const c = feedbackCollector.counts();
    assert.strictEqual(c.totalPositive, 1, 'global counts should include entry');
    const entries = feedbackCollector.recent();
    assert.strictEqual(entries[0].libraryId, 'lib-A');
  });

  // T-FC19: counts(libraryId) filters correctly (Phase 61)
  it('T-FC19: counts with libraryId filters correctly', async () => {
    featureFlags.setOverride('FEEDBACK', true);
    await feedbackCollector.submit({ correlationId: 'fc19a', rating: 'positive', libraryId: 'lib-A' });
    await feedbackCollector.submit({ correlationId: 'fc19b', rating: 'negative', libraryId: 'lib-B' });
    await feedbackCollector.submit({ correlationId: 'fc19c', rating: 'positive', libraryId: 'lib-A' });

    const cA = feedbackCollector.counts('lib-A');
    assert.strictEqual(cA.totalPositive, 2);
    assert.strictEqual(cA.totalNegative, 0);
    assert.strictEqual(cA.recentCount, 2);

    const cB = feedbackCollector.counts('lib-B');
    assert.strictEqual(cB.totalPositive, 0);
    assert.strictEqual(cB.totalNegative, 1);
    assert.strictEqual(cB.recentCount, 1);
  });

  // T-FC20: counts() without libraryId returns global counts (backward compatible) (Phase 61)
  it('T-FC20: counts without libraryId returns global', async () => {
    featureFlags.setOverride('FEEDBACK', true);
    await feedbackCollector.submit({ correlationId: 'fc20a', rating: 'positive', libraryId: 'lib-X' });
    await feedbackCollector.submit({ correlationId: 'fc20b', rating: 'negative' });

    const c = feedbackCollector.counts();
    assert.strictEqual(c.totalPositive, 1);
    assert.strictEqual(c.totalNegative, 1);
    assert.strictEqual(c.recentCount, 2);
  });

  // T-FC21: submit() without libraryId defaults libraryId to null (Phase 61)
  it('T-FC21: submit without libraryId defaults to null', async () => {
    featureFlags.setOverride('FEEDBACK', true);
    await feedbackCollector.submit({ correlationId: 'fc21', rating: 'positive' });
    const entries = feedbackCollector.recent();
    assert.strictEqual(entries[0].libraryId, null);
  });

});
