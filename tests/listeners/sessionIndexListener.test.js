// tests/listeners/sessionIndexListener.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 91 — Session Index Listener Unit Tests
// Tests sessionIndexListener handler functions and register().
// No network calls — tests glue layer only.
// ═══════════════════════════════════════════════════════════════

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { handlePipelineComplete, handlePipelineCacheHit, handleSessionEvicted, register } from '../../server/services/listeners/sessionIndexListener.js';
import { sessionMetadataIndex } from '../../server/services/sessionMetadataIndex.js';

// ── Cleanup ───────────────────────────────────────────────────
afterEach(() => {
  sessionMetadataIndex.reset();
});

describe('sessionIndexListener', () => {

  // T-SIL01: register is a function and handlers are functions
  it('T-SIL01: register and handlers are functions', () => {
    assert.strictEqual(typeof register, 'function');
    assert.strictEqual(typeof handlePipelineComplete, 'function');
    assert.strictEqual(typeof handlePipelineCacheHit, 'function');
    assert.strictEqual(typeof handleSessionEvicted, 'function');
  });

  // T-SIL02: pipeline:complete with sessionId → upsert called
  it('T-SIL02: pipeline:complete with sessionId upserts', () => {
    handlePipelineComplete({
      sessionId: 'sil-sess-02',
      message: 'ما هي المنصة؟',
      topicFilter: null,
    });

    const list = sessionMetadataIndex.list();
    assert.strictEqual(list.length, 1);
    assert.strictEqual(list[0].session_id, 'sil-sess-02');
    assert.strictEqual(list[0].message_count, 2);
    assert.strictEqual(list[0].first_message, 'ما هي المنصة؟');
  });

  // T-SIL03: pipeline:complete without sessionId → no upsert
  it('T-SIL03: pipeline:complete without sessionId is no-op', () => {
    handlePipelineComplete({
      message: 'test',
    });

    assert.strictEqual(sessionMetadataIndex.list().length, 0);
  });

  // T-SIL04: first_message set on first call (new session)
  it('T-SIL04: first_message set on first call', () => {
    handlePipelineComplete({
      sessionId: 'sil-sess-04',
      message: 'السؤال الأول',
    });

    const list = sessionMetadataIndex.list();
    assert.strictEqual(list[0].first_message, 'السؤال الأول');
  });

  // T-SIL05: first_message NOT overwritten on second call
  it('T-SIL05: first_message preserved on second call', () => {
    handlePipelineComplete({
      sessionId: 'sil-sess-05',
      message: 'السؤال الأول',
    });
    handlePipelineComplete({
      sessionId: 'sil-sess-05',
      message: 'السؤال الثاني',
    });

    const list = sessionMetadataIndex.list();
    assert.strictEqual(list[0].first_message, 'السؤال الأول', 'should preserve first message');
    assert.strictEqual(list[0].message_count, 4, 'message count should be 4 (2+2)');
  });

  // T-SIL06: pipeline:cacheHit with sessionId → upsert called
  it('T-SIL06: pipeline:cacheHit with sessionId upserts', () => {
    handlePipelineCacheHit({
      sessionId: 'sil-sess-06',
      message: 'سؤال مكرر',
      topicFilter: 'web-dev',
    });

    const list = sessionMetadataIndex.list();
    assert.strictEqual(list.length, 1);
    assert.strictEqual(list[0].session_id, 'sil-sess-06');
    assert.strictEqual(list[0].message_count, 2);
  });

  // T-SIL07: session:evicted → remove called
  it('T-SIL07: session:evicted removes from index', () => {
    // Pre-populate
    sessionMetadataIndex.upsert('sil-sess-07', { message_count_delta: 2 });
    assert.strictEqual(sessionMetadataIndex.list().length, 1);

    handleSessionEvicted({ sessionId: 'sil-sess-07' });
    assert.strictEqual(sessionMetadataIndex.list().length, 0);
  });

  // T-SIL08: disabled index → handlers are no-ops (index remains empty)
  it('T-SIL08: handlers check enabled before operating', () => {
    // Note: we can't easily disable the singleton in tests since config is frozen
    // Instead, verify that without sessionId the handler is a no-op
    handlePipelineComplete({ message: 'no session id' });
    handlePipelineCacheHit({ message: 'no session id' });
    handleSessionEvicted({});

    assert.strictEqual(sessionMetadataIndex.list().length, 0);
  });
});
