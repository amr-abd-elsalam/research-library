// tests/operational-log.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 52 — OperationalLog unit tests
// Tests record/recent/size, ring buffer overflow enforcement,
// entry shape, limit parameter, empty log behavior, and reset lifecycle.
// Uses singleton + reset() pattern.
// ═══════════════════════════════════════════════════════════════

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { operationalLog } from '../server/services/operationalLog.js';

describe('OperationalLog', () => {

  afterEach(() => {
    operationalLog.reset();
  });

  // T-OL01: record() increases size
  it('T-OL01: record increases size', () => {
    assert.strictEqual(operationalLog.size, 0, 'should start empty');
    operationalLog.record('pipeline:complete', 'pipeline', { status: 'ok' });
    assert.strictEqual(operationalLog.size, 1);
    operationalLog.record('pipeline:stageComplete', 'pipeline', { stage: 'embed' });
    assert.strictEqual(operationalLog.size, 2);
  });

  // T-OL02: recent() returns entries newest first
  it('T-OL02: recent returns entries newest first', () => {
    operationalLog.record('event-A', 'modA');
    operationalLog.record('event-B', 'modB');
    operationalLog.record('event-C', 'modC');

    const entries = operationalLog.recent();
    assert.strictEqual(entries.length, 3);
    assert.strictEqual(entries[0].event, 'event-C', 'newest should be first');
    assert.strictEqual(entries[1].event, 'event-B');
    assert.strictEqual(entries[2].event, 'event-A', 'oldest should be last');
  });

  // T-OL03: recent(limit) respects limit parameter
  it('T-OL03: recent respects limit parameter', () => {
    for (let i = 0; i < 10; i++) {
      operationalLog.record(`event-${i}`, 'mod');
    }
    const entries = operationalLog.recent(3);
    assert.strictEqual(entries.length, 3, 'should return only 3 entries');
    // Newest first
    assert.strictEqual(entries[0].event, 'event-9');
    assert.strictEqual(entries[1].event, 'event-8');
    assert.strictEqual(entries[2].event, 'event-7');
  });

  // T-OL04: ring buffer — size never exceeds maxEntries (config default 500)
  it('T-OL04: ring buffer — size capped at maxEntries', () => {
    // Config default: LOGGING.maxEntries = 500
    // Record 510 entries
    for (let i = 0; i < 510; i++) {
      operationalLog.record(`event-${i}`, 'mod');
    }
    assert.ok(operationalLog.size <= 500, `size (${operationalLog.size}) should not exceed maxEntries (500)`);
    assert.strictEqual(operationalLog.size, 500);
  });

  // T-OL05: size getter reflects actual entry count
  it('T-OL05: size reflects actual entry count', () => {
    assert.strictEqual(operationalLog.size, 0);
    operationalLog.record('a', 'm');
    assert.strictEqual(operationalLog.size, 1);
    operationalLog.record('b', 'm');
    assert.strictEqual(operationalLog.size, 2);
    operationalLog.record('c', 'm');
    assert.strictEqual(operationalLog.size, 3);
  });

  // T-OL06: record entry has correct shape (timestamp, event, module, detail, correlationId)
  it('T-OL06: record entry has correct shape', () => {
    operationalLog.record('test:event', 'testMod', { key: 'value' }, 'corr-001');
    const entries = operationalLog.recent(1);
    assert.strictEqual(entries.length, 1);
    const entry = entries[0];
    assert.strictEqual(typeof entry.timestamp, 'string', 'timestamp should be ISO string');
    assert.strictEqual(entry.event, 'test:event');
    assert.strictEqual(entry.module, 'testMod');
    assert.deepStrictEqual(entry.detail, { key: 'value' });
    assert.strictEqual(entry.correlationId, 'corr-001');
  });

  // T-OL07: reset() clears all entries — size becomes 0
  it('T-OL07: reset clears all entries — size becomes 0', () => {
    operationalLog.record('a', 'm');
    operationalLog.record('b', 'm');
    assert.strictEqual(operationalLog.size, 2);
    operationalLog.reset();
    assert.strictEqual(operationalLog.size, 0);
  });

  // T-OL08: recent() on empty log returns empty array
  it('T-OL08: recent on empty log returns empty array', () => {
    const entries = operationalLog.recent();
    assert.ok(Array.isArray(entries), 'should return array');
    assert.strictEqual(entries.length, 0);
  });

  // T-OL09: record with requestId — entry has requestId field (Phase 67)
  it('T-OL09: record with requestId — entry has requestId field', () => {
    operationalLog.record('test:event', 'src', { key: 'val' }, null, 'req-id-1');
    const entries = operationalLog.recent(1);
    assert.strictEqual(entries.length, 1);
    assert.strictEqual(entries[0].requestId, 'req-id-1');
  });

  // T-OL10: record without requestId — entry requestId defaults to null (Phase 67)
  it('T-OL10: record without requestId — entry requestId defaults to null', () => {
    operationalLog.record('test:event', 'src', { key: 'val' });
    const entries = operationalLog.recent(1);
    assert.strictEqual(entries.length, 1);
    assert.strictEqual(entries[0].requestId, null);
  });

  // T-OL11: multiple records with different requestIds (Phase 67)
  it('T-OL11: multiple records with different requestIds', () => {
    operationalLog.record('event-a', 'mod', null, null, 'req-AAA');
    operationalLog.record('event-b', 'mod', null, null, 'req-BBB');
    const entries = operationalLog.recent(2);
    // newest first
    assert.strictEqual(entries[0].event, 'event-b');
    assert.strictEqual(entries[0].requestId, 'req-BBB');
    assert.strictEqual(entries[1].event, 'event-a');
    assert.strictEqual(entries[1].requestId, 'req-AAA');
  });

  // ── filterBy() tests (Phase 68) ────────────────────────────

  // T-OL12: filterBy({ requestId }) — returns only matching entries
  it('T-OL12: filterBy requestId — returns matching entries only', () => {
    operationalLog.record('log:info', 'chat', null, null, 'r1');
    operationalLog.record('log:warn', 'router', null, null, 'r2');
    operationalLog.record('log:error', 'chat', null, null, 'r1');

    const results = operationalLog.filterBy({ requestId: 'r1' });
    assert.strictEqual(results.length, 2, 'should return 2 entries with requestId r1');
    // newest first
    assert.strictEqual(results[0].event, 'log:error');
    assert.strictEqual(results[1].event, 'log:info');
    for (const entry of results) {
      assert.strictEqual(entry.requestId, 'r1');
    }
  });

  // T-OL13: filterBy({ level }) — returns entries matching event pattern
  it('T-OL13: filterBy level error — returns log:error entries', () => {
    operationalLog.record('log:error', 'chat', { msg: 'fail' });
    operationalLog.record('log:warn', 'router');
    operationalLog.record('routing', 'router');
    operationalLog.record('log:info', 'chat');

    const results = operationalLog.filterBy({ level: 'error' });
    assert.strictEqual(results.length, 1, 'should return only log:error entry');
    assert.strictEqual(results[0].event, 'log:error');
  });

  // T-OL14: filterBy({ module }) — returns entries matching module
  it('T-OL14: filterBy module — exact match on module field', () => {
    operationalLog.record('log:info', 'chat');
    operationalLog.record('log:warn', 'router');
    operationalLog.record('log:error', 'chat');

    const results = operationalLog.filterBy({ module: 'chat' });
    assert.strictEqual(results.length, 2, 'should return 2 entries from chat module');
    for (const entry of results) {
      assert.strictEqual(entry.module, 'chat');
    }
  });

  // T-OL15: filterBy({ from, to }) — returns entries within time range
  it('T-OL15: filterBy time range — returns entries within from/to', () => {
    // Record 3 entries with known timestamps
    operationalLog.record('event-old', 'mod');
    const afterFirst = Date.now();

    // Small delay to ensure timestamp difference
    operationalLog.record('event-mid', 'mod');
    const afterMid = Date.now();

    operationalLog.record('event-new', 'mod');

    // Filter for entries from afterFirst onwards
    const results = operationalLog.filterBy({ from: afterFirst });
    assert.ok(results.length >= 1, 'should return at least 1 entry after first timestamp');
    // All returned entries should have timestamps >= afterFirst
    for (const entry of results) {
      assert.ok(new Date(entry.timestamp).getTime() >= afterFirst,
        'entry timestamp should be >= from');
    }
  });

  // T-OL16: filterBy({}) with empty criteria — returns all entries (respects limit)
  it('T-OL16: filterBy empty criteria — returns all entries', () => {
    operationalLog.record('a', 'mod1');
    operationalLog.record('b', 'mod2');
    operationalLog.record('c', 'mod3');

    const all = operationalLog.filterBy({});
    assert.strictEqual(all.length, 3, 'empty criteria should return all entries');
    // newest first
    assert.strictEqual(all[0].event, 'c');
    assert.strictEqual(all[2].event, 'a');

    // Limit respected
    const limited = operationalLog.filterBy({}, 2);
    assert.strictEqual(limited.length, 2, 'limit should be respected');
    assert.strictEqual(limited[0].event, 'c');
    assert.strictEqual(limited[1].event, 'b');
  });

});
