// tests/listeners/grounding-listener.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 70 — Unit tests for groundingListener
// Tests that pipeline:complete events with grounding data
// correctly feed GroundingAnalytics and record metrics.
// ═══════════════════════════════════════════════════════════════

import { describe, it, before, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { eventBus } from '../../server/services/eventBus.js';
import { groundingAnalytics } from '../../server/services/groundingAnalytics.js';
import { metrics } from '../../server/services/metrics.js';
import { featureFlags } from '../../server/services/featureFlags.js';
import { register } from '../../server/services/listeners/groundingListener.js';

let registered = false;

describe('GroundingListener', () => {

  before(() => {
    if (!registered) {
      register();
      registered = true;
    }
    featureFlags.setOverride('GROUNDING', true);
  });

  afterEach(() => {
    groundingAnalytics.reset();
    metrics.reset();
  });

  // T-GL01: pipeline:complete with _groundingSkipped: false + score → analytics updated
  it('T-GL01: pipeline:complete with grounding data feeds analytics', () => {
    eventBus.emit('pipeline:complete', {
      correlationId: 'gl-01',
      _groundingSkipped: false,
      _groundingScore: 0.85,
      _libraryId: null,
    });

    assert.strictEqual(groundingAnalytics.counts().totalChecked, 1);
    assert.strictEqual(groundingAnalytics.counts().avgScore, 0.85);
  });

  // T-GL02: pipeline:complete with _groundingSkipped: true → analytics NOT updated
  it('T-GL02: pipeline:complete with _groundingSkipped true — no recording', () => {
    eventBus.emit('pipeline:complete', {
      correlationId: 'gl-02',
      _groundingSkipped: true,
      _groundingScore: 0.5,
    });

    assert.strictEqual(groundingAnalytics.counts().totalChecked, 0);
  });

  // T-GL03: pipeline:complete with low score → grounding_low_total incremented
  it('T-GL03: pipeline:complete with low score increments grounding_low_total', () => {
    eventBus.emit('pipeline:complete', {
      correlationId: 'gl-03',
      _groundingSkipped: false,
      _groundingScore: 0.2, // below 0.4 threshold
    });

    const snap = metrics.snapshot();
    const lowCount = snap.counters['grounding_low_total']?.['[]'];
    assert.ok(lowCount >= 1, `grounding_low_total should be >= 1, got ${lowCount}`);
  });

  // T-GL04: pipeline:complete with normal score → check total incremented, low NOT
  it('T-GL04: normal score — check total yes, low total no', () => {
    eventBus.emit('pipeline:complete', {
      correlationId: 'gl-04',
      _groundingSkipped: false,
      _groundingScore: 0.8,
    });

    const snap = metrics.snapshot();
    const checkCount = snap.counters['grounding_check_total']?.['[]'];
    assert.ok(checkCount >= 1, `grounding_check_total should be >= 1`);
    const lowCount = snap.counters['grounding_low_total']?.['[]'];
    assert.ok(!lowCount, `grounding_low_total should not be incremented for score 0.8`);
  });

  // T-GL05: pipeline:complete with _groundingScore: null → no recording
  it('T-GL05: _groundingScore null — no recording', () => {
    eventBus.emit('pipeline:complete', {
      correlationId: 'gl-05',
      _groundingSkipped: false,
      _groundingScore: null,
    });

    assert.strictEqual(groundingAnalytics.counts().totalChecked, 0);
  });

  // T-GL06: pipeline:complete with _libraryId → entry includes libraryId
  it('T-GL06: _libraryId passed to analytics', () => {
    eventBus.emit('pipeline:complete', {
      correlationId: 'gl-06',
      _groundingSkipped: false,
      _groundingScore: 0.7,
      _libraryId: 'lib-test',
    });

    const scores = groundingAnalytics.getRecentScores(1);
    assert.strictEqual(scores.length, 1);
    assert.strictEqual(scores[0].libraryId, 'lib-test');
  });

  // T-GL07: pipeline:complete without grounding fields → safe no-op
  it('T-GL07: missing grounding fields — safe no-op', () => {
    assert.doesNotThrow(() => {
      eventBus.emit('pipeline:complete', {
        correlationId: 'gl-07',
        totalMs: 100,
        message: 'test',
      });
    });

    assert.strictEqual(groundingAnalytics.counts().totalChecked, 0);
  });
});
