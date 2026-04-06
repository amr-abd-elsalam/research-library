// tests/logger.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 52 — Logger unit tests
// Tests listener management, log entry shape, level propagation
// to listeners (all levels reach listeners regardless of config
// level), error isolation for failing listeners, and reset lifecycle.
// Uses singleton + reset() pattern (Logger reads frozen config in
// constructor — new instances would share the same config level).
// ═══════════════════════════════════════════════════════════════

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { logger } from '../server/services/logger.js';

describe('Logger', () => {

  afterEach(() => {
    logger.reset();
  });

  // T-LOG01: addListener() registers listener — listenerCount increments
  it('T-LOG01: addListener registers listener — listenerCount increments', () => {
    assert.strictEqual(logger.listenerCount, 0, 'should start with 0 listeners');
    logger.addListener(() => {});
    assert.strictEqual(logger.listenerCount, 1);
    logger.addListener(() => {});
    assert.strictEqual(logger.listenerCount, 2);
  });

  // T-LOG02: info() calls registered listener with level: 'info'
  it('T-LOG02: info calls registered listener with level info', () => {
    const entries = [];
    logger.addListener((entry) => entries.push(entry));
    logger.info('test-module', 'hello info');
    assert.strictEqual(entries.length, 1);
    assert.strictEqual(entries[0].level, 'info');
    assert.strictEqual(entries[0].module, 'test-module');
    assert.strictEqual(entries[0].message, 'hello info');
  });

  // T-LOG03: warn() calls registered listener with level: 'warn'
  it('T-LOG03: warn calls registered listener with level warn', () => {
    const entries = [];
    logger.addListener((entry) => entries.push(entry));
    logger.warn('test-module', 'hello warn');
    assert.strictEqual(entries.length, 1);
    assert.strictEqual(entries[0].level, 'warn');
  });

  // T-LOG04: error() calls registered listener with level: 'error'
  it('T-LOG04: error calls registered listener with level error', () => {
    const entries = [];
    logger.addListener((entry) => entries.push(entry));
    logger.error('test-module', 'hello error');
    assert.strictEqual(entries.length, 1);
    assert.strictEqual(entries[0].level, 'error');
  });

  // T-LOG05: listener receives correct entry shape (level, module, message, timestamp)
  it('T-LOG05: listener receives correct entry shape', () => {
    const entries = [];
    logger.addListener((entry) => entries.push(entry));
    logger.info('mod', 'msg', { key: 'val' }, 'corr-123');
    assert.strictEqual(entries.length, 1);
    const e = entries[0];
    assert.strictEqual(typeof e.timestamp, 'string', 'timestamp should be ISO string');
    assert.strictEqual(e.level, 'info');
    assert.strictEqual(e.module, 'mod');
    assert.strictEqual(e.message, 'msg');
    assert.deepStrictEqual(e.detail, { key: 'val' });
    assert.strictEqual(e.correlationId, 'corr-123');
  });

  // T-LOG06: listener error doesn't crash logger (error isolation)
  it('T-LOG06: listener error does not crash logger', () => {
    logger.addListener(() => { throw new Error('listener boom'); });
    const entries = [];
    logger.addListener((entry) => entries.push(entry));

    // Should not throw — logger swallows listener errors
    assert.doesNotThrow(() => {
      logger.info('mod', 'safe message');
    });
    // Second listener should still receive the entry
    assert.strictEqual(entries.length, 1);
    assert.strictEqual(entries[0].message, 'safe message');
  });

  // T-LOG07: reset() clears listeners — listenerCount becomes 0
  it('T-LOG07: reset clears listeners — listenerCount becomes 0', () => {
    logger.addListener(() => {});
    logger.addListener(() => {});
    assert.strictEqual(logger.listenerCount, 2);
    logger.reset();
    assert.strictEqual(logger.listenerCount, 0);
  });

  // T-LOG08: multiple listeners all called on same event
  it('T-LOG08: multiple listeners all called on same event', () => {
    const calls1 = [];
    const calls2 = [];
    const calls3 = [];
    logger.addListener((e) => calls1.push(e));
    logger.addListener((e) => calls2.push(e));
    logger.addListener((e) => calls3.push(e));

    logger.warn('multi', 'broadcast');

    assert.strictEqual(calls1.length, 1);
    assert.strictEqual(calls2.length, 1);
    assert.strictEqual(calls3.length, 1);
    assert.strictEqual(calls1[0].message, 'broadcast');
    assert.strictEqual(calls2[0].message, 'broadcast');
    assert.strictEqual(calls3[0].message, 'broadcast');
  });

  // T-LOG09: log with _requestId in detail — entry has requestId field (Phase 67)
  it('T-LOG09: log with _requestId in detail — entry has requestId field', () => {
    const entries = [];
    logger.addListener((entry) => entries.push(entry));
    logger.info('mod', 'msg', { _requestId: 'req-123', key: 'val' });
    assert.strictEqual(entries.length, 1);
    assert.strictEqual(entries[0].requestId, 'req-123');
  });

  // T-LOG10: log without _requestId — entry requestId defaults to null (Phase 67)
  it('T-LOG10: log without _requestId — entry requestId defaults to null', () => {
    const entries = [];
    logger.addListener((entry) => entries.push(entry));
    logger.info('mod', 'msg', { key: 'val' });
    assert.strictEqual(entries.length, 1);
    assert.strictEqual(entries[0].requestId, null);
  });

  // T-LOG11: log with _sessionId in detail — entry has sessionId field (Phase 67)
  it('T-LOG11: log with _sessionId in detail — entry has sessionId field', () => {
    const entries = [];
    logger.addListener((entry) => entries.push(entry));
    logger.info('mod', 'msg', { _sessionId: 'sess-1' });
    assert.strictEqual(entries.length, 1);
    assert.strictEqual(entries[0].sessionId, 'sess-1');
  });

  // T-LOG12: all levels support _requestId extraction (Phase 67)
  it('T-LOG12: all levels support _requestId extraction', () => {
    const entries = [];
    logger.addListener((entry) => entries.push(entry));
    logger.debug('m', 'd', { _requestId: 'r-debug' });
    logger.info('m', 'i', { _requestId: 'r-info' });
    logger.warn('m', 'w', { _requestId: 'r-warn' });
    logger.error('m', 'e', { _requestId: 'r-error' });
    assert.strictEqual(entries.length, 4);
    assert.strictEqual(entries[0].requestId, 'r-debug');
    assert.strictEqual(entries[1].requestId, 'r-info');
    assert.strictEqual(entries[2].requestId, 'r-warn');
    assert.strictEqual(entries[3].requestId, 'r-error');
  });

  // T-LOG13: _requestId and _sessionId stripped from detail in entry (Phase 67)
  it('T-LOG13: _requestId and _sessionId stripped from detail in entry', () => {
    const entries = [];
    logger.addListener((entry) => entries.push(entry));
    logger.info('mod', 'msg', { _requestId: 'r1', _sessionId: 's1', error: 'test' });
    assert.strictEqual(entries.length, 1);
    const e = entries[0];
    assert.strictEqual(e.requestId, 'r1');
    assert.strictEqual(e.sessionId, 's1');
    assert.deepStrictEqual(e.detail, { error: 'test' });
    assert.strictEqual(e.detail._requestId, undefined, '_requestId should be stripped from detail');
    assert.strictEqual(e.detail._sessionId, undefined, '_sessionId should be stripped from detail');
  });

});
