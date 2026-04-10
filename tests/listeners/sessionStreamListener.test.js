// tests/listeners/sessionStreamListener.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 93 — SessionStream Listener Unit Tests
// Tests SSE connection management, event matching, and disabled guard.
// No network calls — tests in-memory connection pool only.
// ═══════════════════════════════════════════════════════════════

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { addConnection, handlePipelineComplete, handlePipelineCacheHit, counts, reset } from '../../server/services/listeners/sessionStreamListener.js';

// ── Helper: create mock ServerResponse ────────────────────────
function mockRes() {
  const emitter = new EventEmitter();
  const chunks = [];
  emitter.write = function(data) {
    chunks.push(data);
    return true;
  };
  emitter.writableEnded = false;
  emitter._chunks = chunks;
  return emitter;
}

// ── Cleanup ───────────────────────────────────────────────────
afterEach(() => {
  reset();
});

describe('sessionStreamListener', () => {

  // T-SSL01: handlePipelineComplete sends SSE to matching ipHash connection
  it('T-SSL01: handlePipelineComplete sends SSE to matching ipHash', () => {
    const res = mockRes();
    addConnection('hash-aaa', res);

    handlePipelineComplete({
      ipHash: 'hash-aaa',
      sessionId: 'sess-001',
    });

    // Should have received one SSE event (besides any initial data)
    assert.ok(res._chunks.length >= 1, 'should have written at least 1 chunk');
    const lastChunk = res._chunks[res._chunks.length - 1];
    assert.ok(lastChunk.startsWith('data: '), 'should be SSE data format');
    const parsed = JSON.parse(lastChunk.replace('data: ', '').replace('\n\n', ''));
    assert.strictEqual(parsed.type, 'session_updated');
    assert.strictEqual(parsed.sessionId, 'sess-001');
  });

  // T-SSL02: handlePipelineComplete does nothing for non-matching ipHash
  it('T-SSL02: handlePipelineComplete ignores non-matching ipHash', () => {
    const res = mockRes();
    addConnection('hash-bbb', res);

    handlePipelineComplete({
      ipHash: 'hash-ccc',
      sessionId: 'sess-002',
    });

    assert.strictEqual(res._chunks.length, 0, 'should not write to non-matching connection');
  });

  // T-SSL03: handlePipelineComplete does nothing when no sessionId
  it('T-SSL03: handlePipelineComplete ignores events without sessionId', () => {
    const res = mockRes();
    addConnection('hash-ddd', res);

    handlePipelineComplete({
      ipHash: 'hash-ddd',
    });

    assert.strictEqual(res._chunks.length, 0, 'should not write when no sessionId');
  });

  // T-SSL04: handlePipelineComplete does nothing for empty connections
  it('T-SSL04: handlePipelineComplete is no-op with no connections', () => {
    // No connections registered — should not throw
    handlePipelineComplete({
      ipHash: 'hash-eee',
      sessionId: 'sess-003',
    });

    assert.strictEqual(counts().totalConnections, 0);
  });

  // T-SSL05: addConnection tracks connection correctly + counts()
  it('T-SSL05: addConnection tracks and counts correctly', () => {
    const res1 = mockRes();
    const res2 = mockRes();
    addConnection('hash-fff', res1);
    addConnection('hash-fff', res2);
    addConnection('hash-ggg', mockRes());

    const c = counts();
    assert.strictEqual(c.totalConnections, 3, 'should have 3 total connections');
    assert.strictEqual(c.uniqueUsers, 2, 'should have 2 unique users');
  });

  // T-SSL06: connection removal on res 'close' event
  it('T-SSL06: connection removed on close event', () => {
    const res = mockRes();
    addConnection('hash-hhh', res);

    assert.strictEqual(counts().totalConnections, 1);

    // Simulate client disconnect
    res.emit('close');

    assert.strictEqual(counts().totalConnections, 0);
    assert.strictEqual(counts().uniqueUsers, 0);
  });

  // T-SSL07: multiple connections same ipHash all receive event
  it('T-SSL07: multiple connections same ipHash all receive event', () => {
    const res1 = mockRes();
    const res2 = mockRes();
    addConnection('hash-iii', res1);
    addConnection('hash-iii', res2);

    handlePipelineComplete({
      ipHash: 'hash-iii',
      sessionId: 'sess-004',
    });

    assert.ok(res1._chunks.length >= 1, 'res1 should receive event');
    assert.ok(res2._chunks.length >= 1, 'res2 should receive event');
  });

  // T-SSL08: handlePipelineCacheHit also triggers SSE push
  it('T-SSL08: handlePipelineCacheHit also triggers SSE push', () => {
    const res = mockRes();
    addConnection('hash-jjj', res);

    handlePipelineCacheHit({
      ipHash: 'hash-jjj',
      sessionId: 'sess-005',
    });

    assert.ok(res._chunks.length >= 1, 'should have written at least 1 chunk');
    const lastChunk = res._chunks[res._chunks.length - 1];
    const parsed = JSON.parse(lastChunk.replace('data: ', '').replace('\n\n', ''));
    assert.strictEqual(parsed.type, 'session_updated');
    assert.strictEqual(parsed.sessionId, 'sess-005');
  });
});
