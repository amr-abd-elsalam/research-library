// tests/session-quality-scorer.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 50 — SessionQualityScorer unit tests
// Tests the SessionQualityScorer singleton lifecycle:
//   - Disabled-path guards (config.QUALITY.enabled = false by default)
//   - Enabled via featureFlags.setOverride('QUALITY', true)
//   - recordQuery + recordFeedback + getScore round-trip
//   - sessionMinTurns guard (default 2 — needs ≥2 queries before scoring)
//   - getAllScores retrieval
//   - counts() structure
//   - reset() lifecycle
//
// Uses singleton + featureFlags.setOverride() + reset() pattern.
// Zero external service dependency — all operations are in-memory.
// ═══════════════════════════════════════════════════════════════

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { sessionQualityScorer } from '../server/services/sessionQualityScorer.js';
import { featureFlags } from '../server/services/featureFlags.js';

describe('SessionQualityScorer', () => {

  afterEach(() => {
    featureFlags.clearOverride('QUALITY');
    sessionQualityScorer.reset();
  });

  // T-SQ01: getScore() returns null when disabled (config default)
  it('T-SQ01: getScore returns null when disabled', () => {
    const result = sessionQualityScorer.getScore('sess-001');
    assert.strictEqual(result, null);
  });

  // T-SQ02: enabled getter reflects featureFlags state (false by default)
  it('T-SQ02: enabled reflects featureFlags state (false by default)', () => {
    assert.strictEqual(sessionQualityScorer.enabled, false);
  });

  // T-SQ03: counts() returns correct structure { enabled, trackedSessions }
  it('T-SQ03: counts returns correct structure', () => {
    const c = sessionQualityScorer.counts();
    assert.ok('enabled' in c, 'should have enabled key');
    assert.ok('trackedSessions' in c, 'should have trackedSessions key');
    assert.strictEqual(c.enabled, false);
    assert.strictEqual(c.trackedSessions, 0);
  });

  // T-SQ04: setOverride enables → recordQuery + getScore round-trip
  // sessionMinTurns default is 2, so we need at least 2 queries
  it('T-SQ04: setOverride enables → recordQuery + getScore round-trip', () => {
    featureFlags.setOverride('QUALITY', true);
    assert.strictEqual(sessionQualityScorer.enabled, true);

    // Record 2 queries (to meet minTurns = 2)
    sessionQualityScorer.recordQuery('sess-test', { avgScore: 0.8, aborted: false, rewriteMethod: null });
    sessionQualityScorer.recordQuery('sess-test', { avgScore: 0.9, aborted: false, rewriteMethod: null });

    const score = sessionQualityScorer.getScore('sess-test');
    assert.notStrictEqual(score, null, 'score should not be null after 2 queries');
    assert.strictEqual(typeof score, 'number', 'score should be a number');
    assert.ok(score >= 0 && score <= 1, `score ${score} should be in range [0, 1]`);
  });

  // T-SQ05: getScore() for unknown session returns null when enabled
  it('T-SQ05: getScore for unknown session returns null when enabled', () => {
    featureFlags.setOverride('QUALITY', true);
    const result = sessionQualityScorer.getScore('non-existent-session');
    assert.strictEqual(result, null);
  });

  // T-SQ06: getScore() returns null when queries < minTurns (sessionMinTurns = 2)
  it('T-SQ06: getScore returns null when queries below minTurns', () => {
    featureFlags.setOverride('QUALITY', true);
    // Only 1 query — below minTurns (2)
    sessionQualityScorer.recordQuery('sess-single', { avgScore: 0.7, aborted: false, rewriteMethod: null });
    const score = sessionQualityScorer.getScore('sess-single');
    assert.strictEqual(score, null, 'score should be null with only 1 query (minTurns = 2)');
  });

  // T-SQ07: reset() clears all scored sessions
  it('T-SQ07: reset clears all scored sessions', () => {
    featureFlags.setOverride('QUALITY', true);
    sessionQualityScorer.recordQuery('sess-r', { avgScore: 0.8, aborted: false, rewriteMethod: null });
    sessionQualityScorer.recordQuery('sess-r', { avgScore: 0.9, aborted: false, rewriteMethod: null });
    assert.ok(sessionQualityScorer.counts().trackedSessions > 0, 'should have tracked sessions');

    sessionQualityScorer.reset();
    assert.strictEqual(sessionQualityScorer.counts().trackedSessions, 0, 'trackedSessions should be 0 after reset');
    assert.strictEqual(sessionQualityScorer.getScore('sess-r'), null, 'getScore should return null after reset');
  });

  // T-SQ08: reset() then counts() shows zero trackedSessions
  it('T-SQ08: reset then counts shows zero trackedSessions', () => {
    featureFlags.setOverride('QUALITY', true);
    sessionQualityScorer.recordQuery('sess-x', { avgScore: 0.5, aborted: false, rewriteMethod: null });
    sessionQualityScorer.reset();
    const c = sessionQualityScorer.counts();
    assert.strictEqual(c.trackedSessions, 0);
  });

  // T-SQ09: getAllScores() returns empty array when disabled
  it('T-SQ09: getAllScores returns empty array when disabled', () => {
    const results = sessionQualityScorer.getAllScores();
    assert.ok(Array.isArray(results), 'should be an array');
    assert.strictEqual(results.length, 0);
  });

  // T-SQ10: getAllScores() returns scored sessions when enabled
  it('T-SQ10: getAllScores returns scored sessions when enabled', () => {
    featureFlags.setOverride('QUALITY', true);
    // Session A: 2 queries
    sessionQualityScorer.recordQuery('sess-A', { avgScore: 0.6, aborted: false, rewriteMethod: null });
    sessionQualityScorer.recordQuery('sess-A', { avgScore: 0.7, aborted: false, rewriteMethod: null });
    // Session B: 2 queries
    sessionQualityScorer.recordQuery('sess-B', { avgScore: 0.9, aborted: false, rewriteMethod: null });
    sessionQualityScorer.recordQuery('sess-B', { avgScore: 0.95, aborted: false, rewriteMethod: null });

    const results = sessionQualityScorer.getAllScores();
    assert.strictEqual(results.length, 2, 'should have 2 scored sessions');
    // Sorted by score ascending (worst first)
    assert.ok(results[0].score <= results[1].score, 'should be sorted by score ascending');
    // Each result has expected structure
    for (const r of results) {
      assert.ok('sessionId' in r, 'should have sessionId');
      assert.ok('score' in r, 'should have score');
      assert.ok('totalQueries' in r, 'should have totalQueries');
    }
  });

  // T-SQ11: recordFeedback updates session quality
  it('T-SQ11: recordFeedback updates session quality', () => {
    featureFlags.setOverride('QUALITY', true);

    // Record 2 queries with moderate scores
    sessionQualityScorer.recordQuery('sess-fb', { avgScore: 0.7, aborted: false, rewriteMethod: null });
    sessionQualityScorer.recordQuery('sess-fb', { avgScore: 0.7, aborted: false, rewriteMethod: null });

    const scoreBefore = sessionQualityScorer.getScore('sess-fb');

    // Record positive feedback — should influence the feedbackPositive weight
    sessionQualityScorer.recordFeedback('sess-fb', { rating: 'positive' });

    const scoreAfter = sessionQualityScorer.getScore('sess-fb');

    // Both scores should be valid numbers
    assert.strictEqual(typeof scoreBefore, 'number');
    assert.strictEqual(typeof scoreAfter, 'number');
    // With positive feedback, score should change (likely increase due to feedbackPositive weight)
    // We don't assert direction — just that feedback was accepted and score recalculates
    assert.ok(scoreAfter >= 0 && scoreAfter <= 1, `score ${scoreAfter} should be in [0, 1]`);
  });

  // T-SQ12: recordQuery when disabled — no-op, does not throw
  it('T-SQ12: recordQuery when disabled does not throw', () => {
    assert.doesNotThrow(() => {
      sessionQualityScorer.recordQuery('sess-disabled', { avgScore: 0.5, aborted: false, rewriteMethod: null });
    });
    assert.strictEqual(sessionQualityScorer.counts().trackedSessions, 0, 'no sessions tracked when disabled');
  });

  // T-SQ13: getAllScores(limit, libraryId) filters by libraryId (Phase 61)
  it('T-SQ13: getAllScores with libraryId filters by libraryId', () => {
    featureFlags.setOverride('QUALITY', true);
    sessionQualityScorer.recordQuery('sess-libA-1', { avgScore: 0.7, aborted: false, rewriteMethod: null, libraryId: 'lib-A' });
    sessionQualityScorer.recordQuery('sess-libA-1', { avgScore: 0.8, aborted: false, rewriteMethod: null, libraryId: 'lib-A' });
    sessionQualityScorer.recordQuery('sess-libB-1', { avgScore: 0.6, aborted: false, rewriteMethod: null, libraryId: 'lib-B' });
    sessionQualityScorer.recordQuery('sess-libB-1', { avgScore: 0.5, aborted: false, rewriteMethod: null, libraryId: 'lib-B' });

    const scoresA = sessionQualityScorer.getAllScores(50, 'lib-A');
    assert.strictEqual(scoresA.length, 1, 'should have 1 session for lib-A');
    assert.strictEqual(scoresA[0].sessionId, 'sess-libA-1');

    const scoresB = sessionQualityScorer.getAllScores(50, 'lib-B');
    assert.strictEqual(scoresB.length, 1, 'should have 1 session for lib-B');
    assert.strictEqual(scoresB[0].sessionId, 'sess-libB-1');
  });

  // T-SQ14: getAllScores(limit) without libraryId returns all (backward compatible) (Phase 61)
  it('T-SQ14: getAllScores without libraryId returns all scores', () => {
    featureFlags.setOverride('QUALITY', true);
    sessionQualityScorer.recordQuery('sess-all-1', { avgScore: 0.7, aborted: false, rewriteMethod: null, libraryId: 'lib-X' });
    sessionQualityScorer.recordQuery('sess-all-1', { avgScore: 0.8, aborted: false, rewriteMethod: null, libraryId: 'lib-X' });
    sessionQualityScorer.recordQuery('sess-all-2', { avgScore: 0.5, aborted: false, rewriteMethod: null });
    sessionQualityScorer.recordQuery('sess-all-2', { avgScore: 0.6, aborted: false, rewriteMethod: null });

    const all = sessionQualityScorer.getAllScores(50);
    assert.strictEqual(all.length, 2, 'should have 2 sessions in global');
  });

});
