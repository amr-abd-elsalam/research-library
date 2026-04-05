// tests/listeners/correlation-listener.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 57 — Unit tests for correlationListener
// Tests that pipeline:complete and pipeline:cacheHit events
// record entries in the CorrelationIndex singleton.
// ═══════════════════════════════════════════════════════════════

import { describe, it, before, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { eventBus }         from '../../server/services/eventBus.js';
import { correlationIndex } from '../../server/services/correlationIndex.js';
import { register } from '../../server/services/listeners/correlationListener.js';

let registered = false;

describe('CorrelationListener', () => {

  before(() => {
    if (!registered) {
      register();
      registered = true;
    }
  });

  afterEach(() => {
    correlationIndex.reset();
  });

  // T-CoL01: pipeline:complete — records correlation entry
  it('T-CoL01: pipeline:complete — records correlation entry', () => {
    eventBus.emit('pipeline:complete', {
      correlationId: 'corr-test-01',
      message: 'what is AI?',
      fullText: 'AI is artificial intelligence...',
      sessionId: 'sess-01',
      queryType: 'factual',
      avgScore: 0.85,
      topicFilter: null,
      _cacheKey: 'chat:all:what is AI?',
      aborted: false,
      _responseMode: 'stream',
    });

    const entry = correlationIndex.get('corr-test-01');
    assert.ok(entry, 'correlation entry should exist');
    assert.strictEqual(entry.message, 'what is AI?');
    assert.strictEqual(entry.queryType, 'factual');
    assert.strictEqual(entry.avgScore, 0.85);
    assert.strictEqual(entry.aborted, false);
  });

  // T-CoL02: pipeline:cacheHit — records correlation entry with cacheHit flag
  it('T-CoL02: pipeline:cacheHit — records correlation entry', () => {
    eventBus.emit('pipeline:cacheHit', {
      correlationId: 'corr-test-02',
      message: 'cached question',
      fullText: 'cached answer...',
      sessionId: 'sess-02',
      avgScore: 0.9,
      topicFilter: null,
    });

    const entry = correlationIndex.get('corr-test-02');
    assert.ok(entry, 'correlation entry should exist for cache hit');
    assert.strictEqual(entry.cacheHit, true);
    assert.strictEqual(entry.message, 'cached question');
  });

  // T-CoL03: pipeline:complete — correlation entry contains correct fields
  it('T-CoL03: correlation entry contains correct fields', () => {
    eventBus.emit('pipeline:complete', {
      correlationId: 'corr-test-03',
      message: 'test',
      fullText: 'response text that is longer than needed for test',
      sessionId: 'sess-03',
      queryType: 'conceptual',
      avgScore: 0.72,
      topicFilter: 'web-dev',
      _cacheKey: 'chat:web-dev:test',
      aborted: false,
      _responseMode: 'concise',
    });

    const entry = correlationIndex.get('corr-test-03');
    assert.ok(entry);
    assert.strictEqual(entry.sessionId, 'sess-03');
    assert.strictEqual(entry.topicFilter, 'web-dev');
    assert.strictEqual(entry.responseMode, 'concise');
    assert.strictEqual(entry.cacheKey, 'chat:web-dev:test');
    assert.ok(typeof entry.timestamp === 'number');
  });

  // T-CoL04: null correlationId — no crash, no recording
  it('T-CoL04: null correlationId — no crash, no recording', () => {
    const sizeBefore = correlationIndex.counts().size;

    assert.doesNotThrow(() => {
      eventBus.emit('pipeline:complete', {
        correlationId: null,
        message: 'no-id question',
      });
    });

    const sizeAfter = correlationIndex.counts().size;
    assert.strictEqual(sizeAfter, sizeBefore, 'size should not increase without correlationId');
  });

  // T-CoL05: correlationIndex size increases after events
  it('T-CoL05: correlationIndex size increases after events', () => {
    const sizeBefore = correlationIndex.counts().size;

    eventBus.emit('pipeline:complete', {
      correlationId: 'corr-test-05a',
      message: 'q1',
      fullText: 'a1',
    });

    eventBus.emit('pipeline:cacheHit', {
      correlationId: 'corr-test-05b',
      message: 'q2',
      fullText: 'a2',
    });

    const sizeAfter = correlationIndex.counts().size;
    assert.strictEqual(sizeAfter, sizeBefore + 2, 'size should increase by 2');
  });

  // T-CoL06: pipeline:complete with _libraryId — entry contains libraryId (Phase 61)
  it('T-CoL06: pipeline:complete with _libraryId — entry contains libraryId', () => {
    eventBus.emit('pipeline:complete', {
      correlationId: 'corr-lib-06',
      message: 'library question',
      fullText: 'library answer',
      sessionId: 'sess-lib-06',
      _libraryId: 'lib-main',
    });

    const entry = correlationIndex.get('corr-lib-06');
    assert.ok(entry, 'entry should exist');
    assert.strictEqual(entry.libraryId, 'lib-main', 'libraryId should be stored from _libraryId');
  });
});
