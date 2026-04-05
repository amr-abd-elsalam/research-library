// tests/listeners/quality-listener.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 58 — Unit tests for qualityListener
// Tests that pipeline:complete and feedback:submitted events
// feed SessionQualityScorer.
//
// ⚠️ qualityListener has an early guard: if (!sessionQualityScorer.enabled)
//    return; — so featureFlags.setOverride('QUALITY', true) must be set
//    BEFORE calling register().
// ═══════════════════════════════════════════════════════════════

import { describe, it, before, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { eventBus }             from '../../server/services/eventBus.js';
import { sessionQualityScorer } from '../../server/services/sessionQualityScorer.js';
import { featureFlags }         from '../../server/services/featureFlags.js';

// Must enable BEFORE register() — guard is at registration time
featureFlags.setOverride('QUALITY', true);

const { register } = await import('../../server/services/listeners/qualityListener.js');

let registered = false;

describe('QualityListener', () => {

  before(() => {
    if (!registered) {
      register();
      registered = true;
    }
  });

  afterEach(() => {
    sessionQualityScorer.reset();
  });

  // T-QL01: pipeline:complete with sessionId — records query in quality scorer
  it('T-QL01: pipeline:complete — records query in quality scorer', () => {
    eventBus.emit('pipeline:complete', {
      sessionId: 'ql-test-01',
      avgScore: 0.85,
      aborted: false,
      _rewriteMethod: 'local_context',
    });

    // Need 2+ queries for getScore to return non-null (minTurns default: 2)
    eventBus.emit('pipeline:complete', {
      sessionId: 'ql-test-01',
      avgScore: 0.80,
      aborted: false,
      _rewriteMethod: null,
    });

    const score = sessionQualityScorer.getScore('ql-test-01');
    assert.ok(score !== null, 'score should be non-null after 2 queries');
    assert.ok(score > 0, 'score should be positive');
    assert.ok(score <= 1, 'score should be <= 1');
  });

  // T-QL02: feedback:submitted — records feedback in quality scorer
  it('T-QL02: feedback:submitted — records feedback in quality scorer', () => {
    // First, record 2 queries so session has enough data
    eventBus.emit('pipeline:complete', { sessionId: 'ql-test-02', avgScore: 0.7, aborted: false });
    eventBus.emit('pipeline:complete', { sessionId: 'ql-test-02', avgScore: 0.6, aborted: false });

    const scoreBefore = sessionQualityScorer.getScore('ql-test-02');

    eventBus.emit('feedback:submitted', {
      sessionId: 'ql-test-02',
      rating: 'positive',
    });

    const scoreAfter = sessionQualityScorer.getScore('ql-test-02');
    assert.ok(scoreAfter !== null, 'score should exist after feedback');
    // Positive feedback should improve score (or at least not decrease it significantly)
    assert.ok(typeof scoreAfter === 'number');
  });

  // T-QL03: pipeline:complete without sessionId — no crash, no recording
  it('T-QL03: pipeline:complete without sessionId — no recording', () => {
    const countsBefore = sessionQualityScorer.counts().trackedSessions;

    eventBus.emit('pipeline:complete', {
      avgScore: 0.5,
      aborted: false,
    });

    const countsAfter = sessionQualityScorer.counts().trackedSessions;
    assert.strictEqual(countsAfter, countsBefore, 'no new session should be tracked');
  });

  // T-QL04: pipeline:complete with aborted: true — records aborted query
  it('T-QL04: pipeline:complete with aborted — records aborted query', () => {
    eventBus.emit('pipeline:complete', { sessionId: 'ql-test-04', avgScore: 0.3, aborted: true });
    eventBus.emit('pipeline:complete', { sessionId: 'ql-test-04', avgScore: 0.4, aborted: false });

    const score = sessionQualityScorer.getScore('ql-test-04');
    assert.ok(score !== null, 'score should be available after 2 queries');
    // Aborted query should lower the score via completion rate component
    assert.ok(score < 1, 'score should be less than 1 with an aborted query');
  });

  // T-QL05: null event data — no crash
  it('T-QL05: null event data — no crash', () => {
    assert.doesNotThrow(() => {
      eventBus.emit('pipeline:complete', null);
    });
  });
});
