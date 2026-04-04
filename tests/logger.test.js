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

});
