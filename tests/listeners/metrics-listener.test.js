// tests/listeners/metrics-listener.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 57 — Unit tests for metricsListener
// Tests that pipeline events correctly increment counters and
// observe histograms on the MetricsCollector singleton.
// ═══════════════════════════════════════════════════════════════

import { describe, it, before, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { eventBus } from '../../server/services/eventBus.js';
import { metrics }  from '../../server/services/metrics.js';
import { register } from '../../server/services/listeners/metricsListener.js';

let registered = false;

describe('MetricsListener', () => {

  before(() => {
    if (!registered) {
      register();
      registered = true;
    }
  });

  afterEach(() => {
    metrics.reset();
  });

  // T-ML01: pipeline:complete — increments requests_total{type:pipeline}
  it('T-ML01: pipeline:complete — increments requests_total counter', () => {
    eventBus.emit('pipeline:complete', {
      totalMs: 150,
      message: 'test',
    });

    const snap = metrics.snapshot();
    const pipelineCount = snap.counters['requests_total']?.['[["type","pipeline"]]'];
    assert.ok(pipelineCount >= 1, `requests_total{pipeline} should be >= 1, got ${pipelineCount}`);
  });

  // T-ML02: pipeline:complete — observes request_duration_ms histogram
  it('T-ML02: pipeline:complete — observes request_duration_ms histogram', () => {
    eventBus.emit('pipeline:complete', {
      totalMs: 250,
      message: 'test',
    });

    const snap = metrics.snapshot();
    const hist = snap.histograms['request_duration_ms']?.['[]'];
    assert.ok(hist, 'request_duration_ms histogram should exist');
    assert.ok(hist.count >= 1, 'should have at least 1 observation');
  });

  // T-ML03: pipeline:stageComplete — observes stage_duration_ms histogram
  it('T-ML03: pipeline:stageComplete — observes stage_duration_ms', () => {
    eventBus.emit('pipeline:stageComplete', {
      stageName: 'stageEmbed',
      durationMs: 50,
      status: 'ok',
    });

    const snap = metrics.snapshot();
    const stageHist = snap.histograms['stage_duration_ms'];
    assert.ok(stageHist, 'stage_duration_ms histogram should exist');
    const embedKey = '[["stage","stageEmbed"]]';
    assert.ok(stageHist[embedKey], `stage histogram for stageEmbed should exist`);
    assert.ok(stageHist[embedKey].count >= 1, 'should have at least 1 observation');
  });

  // T-ML04: pipeline:cacheHit — increments cache_hits_total counter
  it('T-ML04: pipeline:cacheHit — increments cache_hits_total', () => {
    eventBus.emit('pipeline:cacheHit', {});

    const snap = metrics.snapshot();
    const cacheHits = snap.counters['cache_hits_total']?.['[]'];
    assert.ok(cacheHits >= 1, `cache_hits_total should be >= 1, got ${cacheHits}`);
  });

  // T-ML05: feature:toggled — increments feature_toggle_total counter
  it('T-ML05: feature:toggled — increments feature_toggle_total', () => {
    eventBus.emit('feature:toggled', {
      section: 'SUGGESTIONS',
      enabled: true,
    });

    const snap = metrics.snapshot();
    const toggleCount = snap.counters['feature_toggle_total'];
    assert.ok(toggleCount, 'feature_toggle_total counter should exist');
    const key = '[["enabled","true"],["section","SUGGESTIONS"]]';
    assert.ok(toggleCount[key] >= 1, `feature_toggle_total{SUGGESTIONS,true} should be >= 1`);
  });

  // T-ML06: pipeline:stageComplete with error — increments stage_errors_total
  it('T-ML06: pipeline:stageComplete with error — increments stage_errors_total', () => {
    eventBus.emit('pipeline:stageComplete', {
      stageName: 'stageSearch',
      durationMs: 100,
      status: 'error',
    });

    const snap = metrics.snapshot();
    const errors = snap.counters['stage_errors_total'];
    assert.ok(errors, 'stage_errors_total counter should exist');
    const key = '[["stage","stageSearch"]]';
    assert.ok(errors[key] >= 1, `stage_errors_total{stageSearch} should be >= 1`);
  });
});
