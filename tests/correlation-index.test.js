// tests/correlation-index.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 50 — CorrelationIndex unit tests
// Tests the CorrelationIndex singleton lifecycle:
//   - record() + get() round-trip
//   - bySession() per-session queries
//   - counts() structure
//   - reset() lifecycle
//   - Ring buffer eviction (maxCorrelationEntries enforcement)
//
// CorrelationIndex is NOT feature-gated via featureFlags — it reads
// config.AUDIT.enabled (default true) in constructor. No dynamic toggle.
// Uses singleton + reset() pattern.
// Zero external service dependency — all operations are in-memory.
// ═══════════════════════════════════════════════════════════════

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { correlationIndex } from '../server/services/correlationIndex.js';

describe('CorrelationIndex', () => {

  afterEach(() => {
    correlationIndex.reset();
  });

  // T-CI01: get() for non-existent correlationId returns null
  it('T-CI01: get for non-existent correlationId returns null', () => {
    const result = correlationIndex.get('non-existent-id');
    assert.strictEqual(result, null);
  });

  // T-CI02: record() + get() round-trip — returns stored data
  it('T-CI02: record + get round-trip returns stored data', () => {
    const entry = {
      message: 'ما هي المنصة؟',
      fullText: 'المنصة هي...',
      sessionId: 'sess-001',
      queryType: 'factual',
      avgScore: 0.85,
      topicFilter: null,
      timestamp: Date.now(),
    };
    correlationIndex.record('corr-001', entry);
    const result = correlationIndex.get('corr-001');
    assert.notStrictEqual(result, null);
    assert.strictEqual(result.message, 'ما هي المنصة؟');
    assert.strictEqual(result.sessionId, 'sess-001');
    assert.strictEqual(result.queryType, 'factual');
    assert.strictEqual(result.avgScore, 0.85);
  });

  // T-CI03: record() stores correct fields including timestamp
  it('T-CI03: record stores correct fields including timestamp', () => {
    const now = Date.now();
    correlationIndex.record('corr-002', {
      message: 'سؤال اختباري',
      fullText: 'إجابة',
      sessionId: 'sess-002',
      queryType: 'conceptual',
      avgScore: 0.72,
      timestamp: now,
    });
    const result = correlationIndex.get('corr-002');
    assert.strictEqual(result.timestamp, now);
    assert.strictEqual(result.queryType, 'conceptual');
  });

  // T-CI04: bySession() returns entries for a specific session
  it('T-CI04: bySession returns entries for a specific session', () => {
    correlationIndex.record('corr-a1', { message: 'q1', sessionId: 'sess-A', timestamp: 1 });
    correlationIndex.record('corr-b1', { message: 'q2', sessionId: 'sess-B', timestamp: 2 });
    correlationIndex.record('corr-a2', { message: 'q3', sessionId: 'sess-A', timestamp: 3 });

    const results = correlationIndex.bySession('sess-A');
    assert.strictEqual(results.length, 2);
    // Should be sorted by timestamp ascending
    assert.strictEqual(results[0].correlationId, 'corr-a1');
    assert.strictEqual(results[1].correlationId, 'corr-a2');
  });

  // T-CI05: bySession() for non-existent session returns empty array
  it('T-CI05: bySession for non-existent session returns empty array', () => {
    correlationIndex.record('corr-x', { message: 'q', sessionId: 'sess-X', timestamp: 1 });
    const results = correlationIndex.bySession('non-existent');
    assert.ok(Array.isArray(results), 'should be an array');
    assert.strictEqual(results.length, 0);
  });

  // T-CI06: counts() returns correct structure { enabled, size, maxSize }
  it('T-CI06: counts returns correct structure', () => {
    const c = correlationIndex.counts();
    assert.ok('enabled' in c, 'should have enabled key');
    assert.ok('size' in c, 'should have size key');
    assert.ok('maxSize' in c, 'should have maxSize key');
    assert.strictEqual(typeof c.enabled, 'boolean');
    assert.strictEqual(typeof c.size, 'number');
    assert.strictEqual(typeof c.maxSize, 'number');
  });

  // T-CI07: counts().size reflects actual number of recorded entries
  it('T-CI07: counts size reflects actual number of recorded entries', () => {
    assert.strictEqual(correlationIndex.counts().size, 0);
    correlationIndex.record('corr-1', { message: 'q1', timestamp: 1 });
    correlationIndex.record('corr-2', { message: 'q2', timestamp: 2 });
    assert.strictEqual(correlationIndex.counts().size, 2);
  });

  // T-CI08: reset() clears all entries
  it('T-CI08: reset clears all entries', () => {
    correlationIndex.record('corr-1', { message: 'q1', timestamp: 1 });
    correlationIndex.record('corr-2', { message: 'q2', timestamp: 2 });
    assert.strictEqual(correlationIndex.counts().size, 2);

    correlationIndex.reset();
    assert.strictEqual(correlationIndex.get('corr-1'), null);
    assert.strictEqual(correlationIndex.get('corr-2'), null);
  });

  // T-CI09: reset() then counts() shows zero size
  it('T-CI09: reset then counts shows zero size', () => {
    correlationIndex.record('corr-1', { message: 'q1', timestamp: 1 });
    correlationIndex.reset();
    const c = correlationIndex.counts();
    assert.strictEqual(c.size, 0, 'size should be 0 after reset');
  });

  // T-CI10: ring buffer eviction — record beyond maxSize removes oldest
  // Config default: AUDIT.maxCorrelationEntries = 500
  // We record 502 entries and verify the first 2 are evicted
  it('T-CI10: ring buffer eviction removes oldest when exceeding maxSize', () => {
    const maxSize = correlationIndex.counts().maxSize; // should be 500

    // Record maxSize + 2 entries
    for (let i = 0; i < maxSize + 2; i++) {
      correlationIndex.record(`corr-${i}`, {
        message: `question ${i}`,
        sessionId: 'sess-eviction',
        timestamp: i,
      });
    }

    // The first 2 entries should have been evicted
    assert.strictEqual(correlationIndex.get('corr-0'), null, 'oldest entry (corr-0) should be evicted');
    assert.strictEqual(correlationIndex.get('corr-1'), null, 'second oldest entry (corr-1) should be evicted');

    // The last entry should still exist
    assert.notStrictEqual(correlationIndex.get(`corr-${maxSize + 1}`), null, 'newest entry should exist');

    // Size should be capped at maxSize
    assert.strictEqual(correlationIndex.counts().size, maxSize, `size should be capped at maxSize (${maxSize})`);
  });

  // T-CI11: enabled is true by default (config.AUDIT.enabled defaults to true)
  it('T-CI11: enabled is true by default', () => {
    assert.strictEqual(correlationIndex.enabled, true);
  });

  // T-CI12: bySession() respects limit parameter
  it('T-CI12: bySession respects limit parameter', () => {
    for (let i = 0; i < 5; i++) {
      correlationIndex.record(`corr-${i}`, { message: `q${i}`, sessionId: 'sess-limit', timestamp: i });
    }
    const results = correlationIndex.bySession('sess-limit', 2);
    assert.strictEqual(results.length, 2, 'bySession should respect limit');
    // Should return the first 2 by timestamp (ascending sort, then slice)
    assert.strictEqual(results[0].correlationId, 'corr-0');
    assert.strictEqual(results[1].correlationId, 'corr-1');
  });

});
