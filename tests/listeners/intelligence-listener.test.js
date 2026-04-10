// tests/listeners/intelligence-listener.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 58 — Unit tests for intelligenceListener
// Tests that pipeline:complete, feedback:submitted, and
// library:changed events feed AdminIntelligenceEngine
// rolling accumulators (_recordCompletion, _recordFeedback,
// _recordLibraryChange).
//
// intelligenceListener always registers (no guard in register()).
// Guards are inside _record* methods (enabled check).
// ═══════════════════════════════════════════════════════════════

import { describe, it, before, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { eventBus }          from '../../server/services/eventBus.js';
import { adminIntelligence } from '../../server/services/adminIntelligence.js';
import { featureFlags }      from '../../server/services/featureFlags.js';
import { register }          from '../../server/services/listeners/intelligenceListener.js';

let registered = false;

describe('IntelligenceListener', () => {

  before(() => {
    if (!registered) {
      register();
      registered = true;
    }
  });

  afterEach(() => {
    adminIntelligence.reset();
    featureFlags.clearOverride('ADMIN_INTELLIGENCE');
  });

  // T-INT01: pipeline:complete with intelligence enabled — increments rolling completions
  it('T-INT01: pipeline:complete — increments rolling completions', () => {
    featureFlags.setOverride('ADMIN_INTELLIGENCE', true);

    eventBus.emit('pipeline:complete', {
      totalMs: 200,
      avgScore: 0.8,
    });

    const stats = adminIntelligence.getRollingStats();
    assert.ok(stats.completionsSinceLastAnalysis >= 1,
      `completions should be >= 1, got ${stats.completionsSinceLastAnalysis}`);
  });

  // T-INT02: feedback:submitted positive — increments rolling positive feedback
  it('T-INT02: feedback:submitted positive — increments rolling positive feedback', () => {
    featureFlags.setOverride('ADMIN_INTELLIGENCE', true);

    eventBus.emit('feedback:submitted', {
      rating: 'positive',
      sessionId: 'int-test-02',
    });

    const stats = adminIntelligence.getRollingStats();
    assert.ok(stats.feedbackSinceLastAnalysis.positive >= 1,
      `positive feedback should be >= 1`);
  });

  // T-INT03: feedback:submitted negative — increments rolling negative feedback
  it('T-INT03: feedback:submitted negative — increments rolling negative', () => {
    featureFlags.setOverride('ADMIN_INTELLIGENCE', true);

    eventBus.emit('feedback:submitted', {
      rating: 'negative',
      sessionId: 'int-test-03',
    });

    const stats = adminIntelligence.getRollingStats();
    assert.ok(stats.feedbackSinceLastAnalysis.negative >= 1,
      `negative feedback should be >= 1`);
  });

  // T-INT04: library:changed — increments rolling library changes
  it('T-INT04: library:changed — increments rolling library changes', () => {
    featureFlags.setOverride('ADMIN_INTELLIGENCE', true);

    eventBus.emit('library:changed', {
      reason: 'file_added',
      timestamp: Date.now(),
    });

    const stats = adminIntelligence.getRollingStats();
    assert.ok(stats.libraryChangesSinceLastAnalysis >= 1,
      `library changes should be >= 1`);
  });

  // T-INT05: intelligence disabled — _record methods are no-op
  it('T-INT05: intelligence disabled — no accumulation', () => {
    featureFlags.setOverride('ADMIN_INTELLIGENCE', false);  // Phase 97: config default is now true — explicitly disable

    eventBus.emit('pipeline:complete', { totalMs: 100 });
    eventBus.emit('feedback:submitted', { rating: 'positive' });
    eventBus.emit('library:changed', { reason: 'test' });

    const stats = adminIntelligence.getRollingStats();
    assert.strictEqual(stats.completionsSinceLastAnalysis, 0,
      'completions should be 0 when disabled');
    assert.strictEqual(stats.feedbackSinceLastAnalysis.positive, 0);
    assert.strictEqual(stats.libraryChangesSinceLastAnalysis, 0);
  });

  // T-INT06: null event data — no crash
  it('T-INT06: null event data — no crash', () => {
    featureFlags.setOverride('ADMIN_INTELLIGENCE', true);

    assert.doesNotThrow(() => {
      eventBus.emit('pipeline:complete', null);
    });
  });
});
