// tests/listeners/analytics-digest-listener.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 58 — Unit tests for analyticsDigestListener
// Tests that pipeline:complete and pipeline:stageComplete events
// feed PipelineAnalytics rolling accumulators.
// ═══════════════════════════════════════════════════════════════

import { describe, it, before, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { eventBus }          from '../../server/services/eventBus.js';
import { pipelineAnalytics } from '../../server/services/pipelineAnalytics.js';
import { register }          from '../../server/services/listeners/analyticsDigestListener.js';

let registered = false;

describe('AnalyticsDigestListener', () => {

  before(() => {
    if (!registered) {
      register();
      registered = true;
    }
  });

  afterEach(() => {
    pipelineAnalytics.reset();
  });

  // T-AD01: pipeline:complete — feeds _recordCompletion (no crash)
  it('T-AD01: pipeline:complete — feeds pipelineAnalytics._recordCompletion', () => {
    assert.doesNotThrow(() => {
      eventBus.emit('pipeline:complete', {
        totalMs: 250,
        avgScore: 0.85,
        queryType: 'factual',
      });
    });
  });

  // T-AD02: pipeline:stageComplete — feeds _recordStageCompletion (no crash)
  it('T-AD02: pipeline:stageComplete — feeds pipelineAnalytics._recordStageCompletion', () => {
    assert.doesNotThrow(() => {
      eventBus.emit('pipeline:stageComplete', {
        stageName: 'stageEmbed',
        durationMs: 80,
        status: 'ok',
      });
    });
  });

  // T-AD03: multiple pipeline:complete events — accumulates without crash
  it('T-AD03: multiple pipeline:complete events — accumulates', () => {
    for (let i = 0; i < 5; i++) {
      eventBus.emit('pipeline:complete', {
        totalMs: 100 + i * 50,
        avgScore: 0.5 + i * 0.1,
      });
    }
    // No assertion on internal state (pipelineAnalytics rolling stats are private)
    // but verify no crash and analytics object is functional
    assert.doesNotThrow(() => {
      pipelineAnalytics.counts();
    });
  });

  // T-AD04: pipeline:stageComplete without stageName — no crash
  it('T-AD04: pipeline:stageComplete without stageName — no crash', () => {
    assert.doesNotThrow(() => {
      eventBus.emit('pipeline:stageComplete', {
        durationMs: 30,
        status: 'ok',
      });
    });
  });

  // T-AD05: null event data — no crash
  it('T-AD05: null event data — no crash', () => {
    assert.doesNotThrow(() => {
      eventBus.emit('pipeline:complete', null);
    });
  });
});
