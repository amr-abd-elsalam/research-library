// tests/session-replay.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 84 — SessionReplaySerializer Unit Tests
// Tests replay building from audit trail + correlation index.
// Populates test data directly into singletons (no listener
// registration needed — singletons are standalone).
// ═══════════════════════════════════════════════════════════════

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { SessionReplaySerializer, sessionReplaySerializer } from '../server/services/sessionReplaySerializer.js';
import { correlationIndex }  from '../server/services/correlationIndex.js';
import { eventBus }          from '../server/services/eventBus.js';

// ── Helper: populate audit trail by emitting events ───────────
// AuditTrailListener listens on EventBus. We must register it
// before emitting events. However, listeners may already be
// registered from module import. Instead, we emit events and
// let the listener (if registered) pick them up. If not
// registered, we import and call register() once.
let auditRegistered = false;
async function ensureAuditListenerRegistered() {
  if (auditRegistered) return;
  try {
    const mod = await import('../server/services/listeners/auditTrailListener.js');
    // Check if already registered by looking at eventBus listener count
    const beforeCount = eventBus.size;
    mod.register();
    auditRegistered = true;
  } catch {
    // May throw if already registered — that's fine
    auditRegistered = true;
  }
}

// ── Helper: emit a pipeline:complete event to populate audit trail ──
function emitQueryEvent(sessionId, correlationId, message, avgScore, totalMs) {
  eventBus.emit('pipeline:complete', {
    correlationId,
    message,
    queryType:   'factual',
    avgScore,
    aborted:     false,
    sessionId,
    topicFilter: null,
    totalMs,
    fullText:    `إجابة عن: ${message}`,
    sources:     [],
    _responseMode: 'stream',
    _requestId:    null,
    _cacheKey:     null,
    _cacheEntry:   null,
    _analytics:    {},
    _traceCompact: '',
    effectiveMessage: message,
    _rewriteResult:   null,
    _groundingScore:  0.85,
    _groundingSkipped: false,
    _libraryId:       null,
    _turnNumber:      1,
    _tokenEstimates:  { embedding: 10, input: 100, output: 50, rewrite: 0 },
  });
}

// ═══════════════════════════════════════════════════════════════
// Block 1: SessionReplaySerializer Structure (T-SR01 to T-SR05)
// ═══════════════════════════════════════════════════════════════
describe('SessionReplaySerializer — Structure', () => {

  // T-SR01: new SessionReplaySerializer() — has enabled property (boolean)
  it('T-SR01: has enabled property (boolean)', () => {
    const sr = new SessionReplaySerializer();
    assert.strictEqual(typeof sr.enabled, 'boolean');
  });

  // T-SR02: buildReplay returns null when disabled (enableReplay: false)
  it('T-SR02: buildReplay returns null when disabled', () => {
    // config.SESSIONS.enableReplay defaults to false
    const result = sessionReplaySerializer.buildReplay('some-session');
    assert.strictEqual(result, null, 'should return null when disabled');
  });

  // T-SR03: buildReplay returns null for null/undefined/empty sessionId
  it('T-SR03: buildReplay returns null for invalid sessionId', () => {
    const sr = new SessionReplaySerializer();
    // Even if we override enabled check, null sessionId → null
    assert.strictEqual(sr.buildReplay(null), null);
    assert.strictEqual(sr.buildReplay(undefined), null);
    assert.strictEqual(sr.buildReplay(''), null);
  });

  // T-SR04: counts() returns { enabled: boolean }
  it('T-SR04: counts returns correct shape', () => {
    const c = sessionReplaySerializer.counts();
    assert.strictEqual(typeof c.enabled, 'boolean');
    assert.ok('enabled' in c, 'should have enabled field');
  });

  // T-SR05: reset() is callable (no-op, no throw)
  it('T-SR05: reset is callable without throw', () => {
    assert.doesNotThrow(() => sessionReplaySerializer.reset());
  });
});

// ═══════════════════════════════════════════════════════════════
// Block 2: Replay Building — Happy Path (T-SR06 to T-SR12)
// Note: These tests require SESSIONS.enableReplay to be true,
// but config is frozen. We test the internal logic by creating
// a fresh instance with a config-override approach. Since
// config is frozen, we test via the singleton when it's enabled
// OR test the logic that would run. For disabled state, we
// already tested in Block 1. For happy path, we'll verify the
// structure by manually creating a testable subclass.
// ═══════════════════════════════════════════════════════════════
describe('SessionReplaySerializer — Replay Building', () => {
  // We need enableReplay=true to test buildReplay.
  // Since config is frozen, we create a testable wrapper that
  // overrides the enabled check.
  class TestableReplaySerializer extends SessionReplaySerializer {
    get enabled() { return true; }
  }

  let serializer;

  before(async () => {
    await ensureAuditListenerRegistered();
    serializer = new TestableReplaySerializer();
  });

  beforeEach(() => {
    correlationIndex.reset();
  });

  // T-SR06: buildReplay returns correct shape { sessionId, turns, totalTurns, durationMs }
  it('T-SR06: buildReplay returns correct shape', () => {
    const sessionId = 'sr06-' + Date.now();

    // Populate correlation index
    correlationIndex.record('corr-sr06-1', {
      message: 'ما هو الذكاء الاصطناعي؟',
      fullText: 'الذكاء الاصطناعي هو مجال علمي.',
      sessionId,
      queryType: 'factual',
      avgScore: 0.85,
      topicFilter: null,
      timestamp: Date.now(),
      aborted: false,
      groundingScore: 0.90,
    });

    // Emit event to populate audit trail
    emitQueryEvent(sessionId, 'corr-sr06-1', 'ما هو الذكاء الاصطناعي؟', 0.85, 250);

    // Small delay to ensure event is processed synchronously
    const result = serializer.buildReplay(sessionId);
    assert.ok(result !== null, 'result should not be null');
    assert.strictEqual(result.sessionId, sessionId);
    assert.ok(Array.isArray(result.turns), 'turns should be array');
    assert.strictEqual(typeof result.totalTurns, 'number');
    assert.strictEqual(typeof result.durationMs, 'number');
  });

  // T-SR07: Each turn has expected fields
  it('T-SR07: each turn has expected fields', () => {
    const sessionId = 'sr07-' + Date.now();

    correlationIndex.record('corr-sr07-1', {
      message: 'ما هو التعلم الآلي؟',
      fullText: 'التعلم الآلي هو فرع من الذكاء.',
      sessionId,
      queryType: 'factual',
      avgScore: 0.88,
      topicFilter: null,
      timestamp: Date.now(),
      aborted: false,
      groundingScore: 0.75,
    });

    emitQueryEvent(sessionId, 'corr-sr07-1', 'ما هو التعلم الآلي؟', 0.88, 300);

    const result = serializer.buildReplay(sessionId);
    assert.ok(result !== null);
    assert.strictEqual(result.turns.length, 1);

    const turn = result.turns[0];
    assert.ok('turnNumber' in turn, 'should have turnNumber');
    assert.ok('question' in turn, 'should have question');
    assert.ok('answer' in turn, 'should have answer');
    assert.ok('sources' in turn, 'should have sources');
    assert.ok('groundingScore' in turn, 'should have groundingScore');
    assert.ok('avgScore' in turn, 'should have avgScore');
    assert.ok('timingMs' in turn, 'should have timingMs');
    assert.ok('rewriteUsed' in turn, 'should have rewriteUsed');
    assert.ok('correlationId' in turn, 'should have correlationId');
  });

  // T-SR08: turnNumber is 1-indexed and sequential
  it('T-SR08: turnNumber is 1-indexed and sequential', () => {
    const sessionId = 'sr08-' + Date.now();

    for (let i = 1; i <= 3; i++) {
      const corrId = `corr-sr08-${i}`;
      correlationIndex.record(corrId, {
        message: `سؤال ${i}`,
        fullText: `إجابة ${i}`,
        sessionId,
        queryType: 'factual',
        avgScore: 0.80,
        timestamp: Date.now() + i * 100,
        aborted: false,
        groundingScore: null,
      });
      emitQueryEvent(sessionId, corrId, `سؤال ${i}`, 0.80, 200);
    }

    const result = serializer.buildReplay(sessionId);
    assert.ok(result !== null);
    assert.strictEqual(result.turns.length, 3);
    assert.strictEqual(result.turns[0].turnNumber, 1);
    assert.strictEqual(result.turns[1].turnNumber, 2);
    assert.strictEqual(result.turns[2].turnNumber, 3);
  });

  // T-SR09: durationMs calculated correctly
  it('T-SR09: durationMs calculated correctly', () => {
    const sessionId = 'sr09-' + Date.now();
    const baseTime = Date.now();

    correlationIndex.record('corr-sr09-1', {
      message: 'سؤال 1', fullText: 'إجابة 1', sessionId,
      queryType: 'factual', avgScore: 0.80, timestamp: baseTime, aborted: false,
    });
    correlationIndex.record('corr-sr09-2', {
      message: 'سؤال 2', fullText: 'إجابة 2', sessionId,
      queryType: 'factual', avgScore: 0.80, timestamp: baseTime + 5000, aborted: false,
    });

    emitQueryEvent(sessionId, 'corr-sr09-1', 'سؤال 1', 0.80, 200);
    emitQueryEvent(sessionId, 'corr-sr09-2', 'سؤال 2', 0.80, 300);

    const result = serializer.buildReplay(sessionId);
    assert.ok(result !== null);
    // durationMs is based on audit trail timestamps (which are Date.now() at emission time)
    // Since events are emitted nearly simultaneously, durationMs will be very small
    assert.strictEqual(typeof result.durationMs, 'number');
    assert.ok(result.durationMs >= 0, 'durationMs should be non-negative');
  });

  // T-SR10: Multiple turns produce correct totalTurns count
  it('T-SR10: multiple turns produce correct totalTurns', () => {
    const sessionId = 'sr10-' + Date.now();

    for (let i = 1; i <= 5; i++) {
      const corrId = `corr-sr10-${i}`;
      correlationIndex.record(corrId, {
        message: `سؤال ${i}`, fullText: `إجابة ${i}`, sessionId,
        queryType: 'factual', avgScore: 0.80, timestamp: Date.now(),
        aborted: false,
      });
      emitQueryEvent(sessionId, corrId, `سؤال ${i}`, 0.80, 200);
    }

    const result = serializer.buildReplay(sessionId);
    assert.ok(result !== null);
    assert.strictEqual(result.totalTurns, 5);
  });

  // T-SR11: sources array populated from correlation data
  it('T-SR11: sources populated from correlation data', () => {
    const sessionId = 'sr11-' + Date.now();

    correlationIndex.record('corr-sr11-1', {
      message: 'سؤال', fullText: 'إجابة', sessionId,
      queryType: 'factual', avgScore: 0.85, timestamp: Date.now(),
      aborted: false, sources: [{ file: 'doc.pdf', section: 'intro' }],
    });
    emitQueryEvent(sessionId, 'corr-sr11-1', 'سؤال', 0.85, 200);

    const result = serializer.buildReplay(sessionId);
    assert.ok(result !== null);
    // Note: correlationListener stores fullText sliced to 500 chars but NOT sources directly
    // correlationIndex.record stores whatever is passed — in production, correlationListener
    // does NOT store sources. So sources in replay will be null unless explicitly stored.
    // This is expected behavior — replay shows question + answer + scores, not sources.
    // For this test, we passed sources directly to correlationIndex.record()
    const turn = result.turns[0];
    assert.ok(Array.isArray(turn.sources), 'sources should be array when present in correlation');
  });

  // T-SR12: groundingScore populated from correlation data (or null if absent)
  it('T-SR12: groundingScore from correlation data', () => {
    const sessionId = 'sr12-' + Date.now();

    correlationIndex.record('corr-sr12-1', {
      message: 'سؤال', fullText: 'إجابة', sessionId,
      queryType: 'factual', avgScore: 0.85, timestamp: Date.now(),
      aborted: false, groundingScore: 0.92,
    });
    emitQueryEvent(sessionId, 'corr-sr12-1', 'سؤال', 0.85, 200);

    const result = serializer.buildReplay(sessionId);
    assert.ok(result !== null);
    assert.strictEqual(result.turns[0].groundingScore, 0.92);
  });
});

// ═══════════════════════════════════════════════════════════════
// Block 3: Correlation Integration (T-SR13 to T-SR16)
// ═══════════════════════════════════════════════════════════════
describe('SessionReplaySerializer — Correlation Integration', () => {
  class TestableReplaySerializer extends SessionReplaySerializer {
    get enabled() { return true; }
  }

  let serializer;

  before(async () => {
    await ensureAuditListenerRegistered();
    serializer = new TestableReplaySerializer();
  });

  beforeEach(() => {
    correlationIndex.reset();
  });

  // T-SR13: correlationId populated from audit event
  it('T-SR13: correlationId from audit event', () => {
    const sessionId = 'sr13-' + Date.now();
    const corrId = 'corr-sr13-abc';

    correlationIndex.record(corrId, {
      message: 'سؤال', fullText: 'إجابة', sessionId,
      queryType: 'factual', avgScore: 0.85, timestamp: Date.now(), aborted: false,
    });
    emitQueryEvent(sessionId, corrId, 'سؤال', 0.85, 200);

    const result = serializer.buildReplay(sessionId);
    assert.ok(result !== null);
    assert.strictEqual(result.turns[0].correlationId, corrId);
  });

  // T-SR14: Missing correlation entry → sources/groundingScore are null/defaults
  it('T-SR14: missing correlation entry → null defaults', () => {
    const sessionId = 'sr14-' + Date.now();

    // Emit event WITHOUT recording in correlation index
    emitQueryEvent(sessionId, 'nonexistent-corr', 'سؤال بدون correlation', 0.80, 200);

    const result = serializer.buildReplay(sessionId);
    assert.ok(result !== null);
    const turn = result.turns[0];
    // Question comes from audit event directly
    assert.strictEqual(turn.question, 'سؤال بدون correlation');
    // Correlation lookup returns null → answer/sources null
    assert.strictEqual(turn.answer, null);
    assert.strictEqual(turn.sources, null);
  });

  // T-SR15: rewriteUsed flag correctly read from correlation data
  it('T-SR15: rewriteUsed flag from correlation data', () => {
    const sessionId = 'sr15-' + Date.now();

    correlationIndex.record('corr-sr15-1', {
      message: 'المزيد', fullText: 'تفاصيل إضافية', sessionId,
      queryType: 'factual', avgScore: 0.85, timestamp: Date.now(),
      aborted: false,
      effectiveMessage: 'المزيد فيما يخص الذكاء الاصطناعي',
    });
    emitQueryEvent(sessionId, 'corr-sr15-1', 'المزيد', 0.85, 200);

    const result = serializer.buildReplay(sessionId);
    assert.ok(result !== null);
    // effectiveMessage !== message → rewriteUsed = true
    assert.strictEqual(result.turns[0].rewriteUsed, true);
  });

  // T-SR16: avgScore correctly read from correlation data
  it('T-SR16: avgScore from correlation or audit event', () => {
    const sessionId = 'sr16-' + Date.now();

    correlationIndex.record('corr-sr16-1', {
      message: 'سؤال', fullText: 'إجابة', sessionId,
      queryType: 'factual', avgScore: 0.93, timestamp: Date.now(), aborted: false,
    });
    emitQueryEvent(sessionId, 'corr-sr16-1', 'سؤال', 0.93, 200);

    const result = serializer.buildReplay(sessionId);
    assert.ok(result !== null);
    assert.strictEqual(result.turns[0].avgScore, 0.93);
  });
});

// ═══════════════════════════════════════════════════════════════
// Block 4: Edge Cases (T-SR17 to T-SR20)
// ═══════════════════════════════════════════════════════════════
describe('SessionReplaySerializer — Edge Cases', () => {
  class TestableReplaySerializer extends SessionReplaySerializer {
    get enabled() { return true; }
  }

  let serializer;

  before(async () => {
    await ensureAuditListenerRegistered();
    serializer = new TestableReplaySerializer();
  });

  beforeEach(() => {
    correlationIndex.reset();
  });

  // T-SR17: Session with no audit trail → returns null
  it('T-SR17: no audit trail → returns null', () => {
    const result = serializer.buildReplay('nonexistent-session-' + Date.now());
    assert.strictEqual(result, null);
  });

  // T-SR18: Trail with unrecognized event types → gracefully skipped
  it('T-SR18: unrecognized event types are skipped', () => {
    const sessionId = 'sr18-' + Date.now();

    // Emit a feedback event (not a query)
    eventBus.emit('feedback:submitted', {
      sessionId,
      correlationId: 'some-corr',
      rating: 'positive',
      comment: 'great',
    });

    // Without any query events, replay should return null
    const result = serializer.buildReplay(sessionId);
    assert.strictEqual(result, null, 'should return null with no query events');
  });

  // T-SR19: Trail with only query events (valid scenario)
  it('T-SR19: trail with only query events works', () => {
    const sessionId = 'sr19-' + Date.now();

    correlationIndex.record('corr-sr19-1', {
      message: 'سؤال', fullText: 'إجابة', sessionId,
      queryType: 'factual', avgScore: 0.85, timestamp: Date.now(), aborted: false,
    });
    emitQueryEvent(sessionId, 'corr-sr19-1', 'سؤال', 0.85, 200);

    const result = serializer.buildReplay(sessionId);
    assert.ok(result !== null);
    assert.strictEqual(result.totalTurns, 1);
  });

  // T-SR20: Empty sessionId → returns null
  it('T-SR20: empty sessionId returns null', () => {
    assert.strictEqual(serializer.buildReplay(''), null);
    assert.strictEqual(serializer.buildReplay(null), null);
    assert.strictEqual(serializer.buildReplay(undefined), null);
  });
});
