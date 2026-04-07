// tests/listeners/citation-listener.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 71 — Unit tests for citationListener
// Tests that pipeline:complete events with citation data
// correctly record metrics.
// ═══════════════════════════════════════════════════════════════

import { describe, it, before, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { eventBus } from '../../server/services/eventBus.js';
import { metrics } from '../../server/services/metrics.js';
import { register } from '../../server/services/listeners/citationListener.js';

let registered = false;

describe('CitationListener', () => {

  before(() => {
    if (!registered) {
      register();
      registered = true;
    }
  });

  afterEach(() => {
    metrics.reset();
  });

  // T-CiL01: pipeline:complete with _citationSkipped: false + citations array → metrics recorded
  it('T-CiL01: citations present — metrics recorded', () => {
    eventBus.emit('pipeline:complete', {
      correlationId: 'cil-01',
      _citationSkipped: false,
      _citations: [
        { sentenceIndex: 0, sourceIndex: 0, overlap: 0.8 },
        { sentenceIndex: 1, sourceIndex: 1, overlap: 0.6 },
      ],
    });

    const snap = metrics.snapshot();
    const mappedCount = snap.counters['citation_mapped_total']?.['[]'];
    assert.ok(mappedCount >= 1, `citation_mapped_total should be >= 1, got ${mappedCount}`);

    const citCountObs = snap.histograms['citation_count'];
    assert.ok(citCountObs, 'citation_count histogram should exist');
  });

  // T-CiL02: pipeline:complete with _citationSkipped: true → no metrics
  it('T-CiL02: _citationSkipped true — no metrics', () => {
    eventBus.emit('pipeline:complete', {
      correlationId: 'cil-02',
      _citationSkipped: true,
      _citations: [{ sentenceIndex: 0, sourceIndex: 0, overlap: 0.5 }],
    });

    const snap = metrics.snapshot();
    const mappedCount = snap.counters['citation_mapped_total']?.['[]'];
    assert.ok(!mappedCount, 'citation_mapped_total should not be incremented');
  });

  // T-CiL03: pipeline:complete with empty citations array → metrics recorded with count 0
  it('T-CiL03: empty citations array — metrics recorded with count 0', () => {
    eventBus.emit('pipeline:complete', {
      correlationId: 'cil-03',
      _citationSkipped: false,
      _citations: [],
    });

    const snap = metrics.snapshot();
    const mappedCount = snap.counters['citation_mapped_total']?.['[]'];
    assert.ok(mappedCount >= 1, `citation_mapped_total should be >= 1, got ${mappedCount}`);
  });

  // T-CiL04: pipeline:complete with null citations → no metrics
  it('T-CiL04: null citations — no metrics', () => {
    eventBus.emit('pipeline:complete', {
      correlationId: 'cil-04',
      _citationSkipped: false,
      _citations: null,
    });

    const snap = metrics.snapshot();
    const mappedCount = snap.counters['citation_mapped_total']?.['[]'];
    assert.ok(!mappedCount, 'citation_mapped_total should not be incremented for null');
  });

  // T-CiL05: pipeline:complete without citation fields → safe no-op
  it('T-CiL05: missing citation fields — safe no-op', () => {
    assert.doesNotThrow(() => {
      eventBus.emit('pipeline:complete', {
        correlationId: 'cil-05',
        totalMs: 100,
        message: 'test',
      });
    });

    const snap = metrics.snapshot();
    const mappedCount = snap.counters['citation_mapped_total']?.['[]'];
    assert.ok(!mappedCount, 'citation_mapped_total should not exist');
  });
});
