// tests/pipeline-error-recovery.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 52 — PipelineErrorRecovery unit tests
// Tests error classification for all 6 error types + generic fallback,
// isPartial detection based on ctx.fullText, and buildPartialCompleteEvent
// structure. PipelineErrorRecovery is stateless — uses singleton directly.
// Zero external service dependency — all errors are instantiated locally.
// ═══════════════════════════════════════════════════════════════

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { pipelineErrorRecovery } from '../server/services/pipelineErrorRecovery.js';
import { GeminiTimeoutError, GeminiSafetyError, GeminiEmptyError } from '../server/services/gemini.js';
import { QdrantConnectionError, QdrantTimeoutError } from '../server/services/qdrant.js';
import { CircuitOpenError } from '../server/services/circuitBreaker.js';

// ── Helper: minimal PipelineContext mock ────────────────────────
function mockCtx(overrides = {}) {
  return {
    message: 'سؤال اختباري',
    fullText: '',
    sources: [],
    avgScore: 0,
    sessionId: 'test-session',
    topicFilter: null,
    effectiveMessage: 'سؤال اختباري',
    queryRoute: { type: 'factual', isFollowUp: false },
    req: null,
    ...overrides,
  };
}

// ── Helper: minimal EventTrace mock ─────────────────────────────
function mockTrace() {
  return {
    correlationId: 'test-corr-001',
    toCompact() { return { id: this.correlationId, stages: [] }; },
  };
}

describe('PipelineErrorRecovery', () => {

  // T-PER01: classify() with GeminiTimeoutError (no partial) → category: 'timeout'
  it('T-PER01: classify GeminiTimeoutError without partial content → timeout', () => {
    const err = new GeminiTimeoutError('stream');
    const ctx = mockCtx({ fullText: '' });
    const result = pipelineErrorRecovery.classify(err, ctx);
    assert.strictEqual(result.category, 'timeout');
    assert.strictEqual(result.isPartial, false);
    assert.strictEqual(result.code, 'TIMEOUT');
    assert.strictEqual(typeof result.userMessage, 'string');
    assert.ok(result.userMessage.length > 0, 'userMessage should not be empty');
  });

  // T-PER02: classify() with GeminiSafetyError → category: 'safety'
  it('T-PER02: classify GeminiSafetyError → safety', () => {
    const err = new GeminiSafetyError();
    const ctx = mockCtx();
    const result = pipelineErrorRecovery.classify(err, ctx);
    assert.strictEqual(result.category, 'safety');
    assert.strictEqual(result.code, 'SAFETY_BLOCKED');
    assert.strictEqual(result.isPartial, false);
    assert.strictEqual(result.shouldEmitComplete, false);
  });

  // T-PER03: classify() with GeminiEmptyError → category: 'empty'
  it('T-PER03: classify GeminiEmptyError → empty', () => {
    const err = new GeminiEmptyError();
    const ctx = mockCtx();
    const result = pipelineErrorRecovery.classify(err, ctx);
    assert.strictEqual(result.category, 'empty');
    assert.strictEqual(result.code, 'EMPTY_RESPONSE');
    assert.strictEqual(result.isPartial, false);
  });

  // T-PER04: classify() with QdrantConnectionError → category: 'service_unavailable'
  it('T-PER04: classify QdrantConnectionError → service_unavailable', () => {
    const err = new QdrantConnectionError('connection refused');
    const ctx = mockCtx();
    const result = pipelineErrorRecovery.classify(err, ctx);
    assert.strictEqual(result.category, 'service_unavailable');
    assert.strictEqual(result.code, 'SERVICE_UNAVAILABLE');
    assert.strictEqual(result.isPartial, false);
  });

  // T-PER05: classify() with QdrantTimeoutError → category: 'timeout'
  it('T-PER05: classify QdrantTimeoutError → timeout', () => {
    const err = new QdrantTimeoutError();
    const ctx = mockCtx();
    const result = pipelineErrorRecovery.classify(err, ctx);
    assert.strictEqual(result.category, 'timeout');
    assert.strictEqual(result.code, 'TIMEOUT');
    assert.strictEqual(result.isPartial, false);
  });

  // T-PER06: classify() with CircuitOpenError → category: 'circuit_open'
  it('T-PER06: classify CircuitOpenError → circuit_open', () => {
    const err = new CircuitOpenError('gemini');
    const ctx = mockCtx();
    const result = pipelineErrorRecovery.classify(err, ctx);
    assert.strictEqual(result.category, 'circuit_open');
    assert.strictEqual(result.code, 'SERVICE_UNAVAILABLE');
    assert.strictEqual(result.isPartial, false);
    assert.strictEqual(result.shouldEmitComplete, false);
  });

  // T-PER07: classify() with generic Error → category: 'unknown'
  it('T-PER07: classify generic Error → unknown', () => {
    const err = new Error('something unexpected');
    const ctx = mockCtx();
    const result = pipelineErrorRecovery.classify(err, ctx);
    assert.strictEqual(result.category, 'unknown');
    assert.strictEqual(result.code, 'SERVER_ERROR');
    assert.strictEqual(result.isPartial, false);
    assert.strictEqual(result.shouldEmitComplete, false);
  });

  // T-PER08: classify() with GeminiTimeoutError + non-empty fullText → isPartial: true
  it('T-PER08: classify GeminiTimeoutError with partial content → timeout_partial + isPartial true', () => {
    const err = new GeminiTimeoutError('stream');
    const ctx = mockCtx({ fullText: 'بداية إجابة جزئية...' });
    const result = pipelineErrorRecovery.classify(err, ctx);
    assert.strictEqual(result.category, 'timeout_partial');
    assert.strictEqual(result.isPartial, true);
    assert.strictEqual(result.shouldEmitComplete, true);
    assert.strictEqual(result.code, 'TIMEOUT');
  });

  // T-PER09: classify() with non-timeout error + non-empty fullText → isPartial: false
  // Only GeminiTimeoutError triggers the partial path
  it('T-PER09: classify non-timeout error with fullText → isPartial still false', () => {
    const err = new GeminiSafetyError();
    const ctx = mockCtx({ fullText: 'some partial text' });
    const result = pipelineErrorRecovery.classify(err, ctx);
    assert.strictEqual(result.isPartial, false, 'only GeminiTimeoutError triggers isPartial');
  });

  // T-PER10: buildPartialCompleteEvent() returns correct structure
  it('T-PER10: buildPartialCompleteEvent returns correct event structure', () => {
    const ctx = mockCtx({
      fullText: 'partial response',
      sources: [{ file: 'test.md', score: 0.8 }],
      avgScore: 0.75,
    });
    const trace = mockTrace();
    const startTime = Date.now() - 500;

    const event = pipelineErrorRecovery.buildPartialCompleteEvent(ctx, trace, startTime);

    // Core fields
    assert.strictEqual(event.correlationId, 'test-corr-001');
    assert.strictEqual(event.aborted, false);
    assert.strictEqual(event.abortReason, null);
    assert.strictEqual(typeof event.totalMs, 'number');
    assert.ok(event.totalMs >= 400, 'totalMs should reflect elapsed time');

    // Context fields
    assert.strictEqual(event.message, 'سؤال اختباري');
    assert.strictEqual(event.fullText, 'partial response');
    assert.strictEqual(event.sessionId, 'test-session');
    assert.strictEqual(event.avgScore, 0.75);

    // Null fields
    assert.strictEqual(event._tokenEstimates, null);
    assert.strictEqual(event._cacheKey, null);
    assert.strictEqual(event._cacheEntry, null);

    // Analytics entry
    assert.ok(event._analytics, '_analytics should exist');
    assert.strictEqual(event._analytics.event_type, 'chat');
    assert.strictEqual(event._analytics.cache_hit, false);
    assert.strictEqual(typeof event._analytics.latency_ms, 'number');

    // Trace compact
    assert.ok(event._traceCompact, '_traceCompact should exist');
    assert.strictEqual(event._traceCompact.id, 'test-corr-001');
  });

});
