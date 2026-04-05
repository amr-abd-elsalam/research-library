// tests/listeners/content-gap-listener.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 58 — Unit tests for contentGapListener
// Tests that pipeline:complete (low confidence/low score) and
// feedback:submitted (negative) events feed ContentGapDetector.
//
// ⚠️ contentGapListener has an early guard: if (!contentGapDetector.enabled)
//    return; — so featureFlags.setOverride('CONTENT_GAPS', true) must be set
//    BEFORE calling register(). We use a separate describe to control this.
// ═══════════════════════════════════════════════════════════════

import { describe, it, before, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { eventBus }           from '../../server/services/eventBus.js';
import { contentGapDetector } from '../../server/services/contentGapDetector.js';
import { correlationIndex }   from '../../server/services/correlationIndex.js';
import { featureFlags }       from '../../server/services/featureFlags.js';

// Must enable BEFORE register() — guard is at registration time
featureFlags.setOverride('CONTENT_GAPS', true);

const { register } = await import('../../server/services/listeners/contentGapListener.js');

let registered = false;

describe('ContentGapListener', () => {

  before(() => {
    if (!registered) {
      register();
      registered = true;
    }
  });

  afterEach(() => {
    contentGapDetector.reset();
    correlationIndex.reset();
  });

  // T-CG01: pipeline:complete with aborted + low_confidence — records gap
  it('T-CG01: pipeline:complete aborted low_confidence — records gap', () => {
    eventBus.emit('pipeline:complete', {
      aborted: true,
      abortReason: 'low_confidence',
      message: 'ما هي نظرية الأوتار الفائقة؟',
      sessionId: 'cg-test-01',
      avgScore: 0.2,
    });

    const counts = contentGapDetector.counts();
    assert.ok(counts.totalEntries >= 1, 'should have at least 1 gap entry');
  });

  // T-CG02: pipeline:complete with low avgScore (below threshold) — records gap
  it('T-CG02: pipeline:complete with low avgScore — records gap', () => {
    eventBus.emit('pipeline:complete', {
      aborted: false,
      message: 'كيف تعمل الجاذبية الكمية؟',
      sessionId: 'cg-test-02',
      avgScore: 0.2,
    });

    const counts = contentGapDetector.counts();
    assert.ok(counts.totalEntries >= 1, 'should have at least 1 gap entry for low score');
  });

  // T-CG03: pipeline:complete with high avgScore — no gap recorded
  it('T-CG03: pipeline:complete with high avgScore — no gap recorded', () => {
    eventBus.emit('pipeline:complete', {
      aborted: false,
      message: 'ما هو الذكاء الاصطناعي؟',
      sessionId: 'cg-test-03',
      avgScore: 0.9,
    });

    const counts = contentGapDetector.counts();
    assert.strictEqual(counts.totalEntries, 0, 'no gap should be recorded for high score');
  });

  // T-CG04: feedback:submitted negative with correlationId — records gap
  it('T-CG04: feedback:submitted negative — records gap via correlation lookup', () => {
    // Setup: add a correlation entry
    correlationIndex.record('cg-corr-04', {
      message: 'سؤال بدون إجابة جيدة',
      sessionId: 'cg-test-04',
      avgScore: 0.3,
    });

    eventBus.emit('feedback:submitted', {
      correlationId: 'cg-corr-04',
      rating: 'negative',
      sessionId: 'cg-test-04',
    });

    const counts = contentGapDetector.counts();
    assert.ok(counts.totalEntries >= 1, 'should have gap entry from negative feedback');
  });

  // T-CG05: feedback:submitted positive — no gap recorded
  it('T-CG05: feedback:submitted positive — no gap recorded', () => {
    correlationIndex.record('cg-corr-05', {
      message: 'سؤال جيد',
      sessionId: 'cg-test-05',
      avgScore: 0.9,
    });

    eventBus.emit('feedback:submitted', {
      correlationId: 'cg-corr-05',
      rating: 'positive',
      sessionId: 'cg-test-05',
    });

    const counts = contentGapDetector.counts();
    assert.strictEqual(counts.totalEntries, 0, 'no gap for positive feedback');
  });

  // T-CG06: null event data — no crash
  it('T-CG06: null event data — no crash', () => {
    assert.doesNotThrow(() => {
      eventBus.emit('pipeline:complete', null);
    });
  });
});
