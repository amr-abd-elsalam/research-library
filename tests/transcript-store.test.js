// tests/transcript-store.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 55 — TranscriptStore unit tests
// Tests append, replay, compact, replayForAPI, and serialization.
// Uses new TranscriptStore() instances for full isolation.
// ═══════════════════════════════════════════════════════════════

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TranscriptStore } from '../server/services/transcript.js';

describe('TranscriptStore', () => {

  // T-TS01: initial size is 0
  it('T-TS01: initial size is 0', () => {
    const ts = new TranscriptStore();
    assert.strictEqual(ts.size, 0);
  });

  // T-TS02: append increases size
  it('T-TS02: append increases size', () => {
    const ts = new TranscriptStore();
    ts.append('user', 'hello');
    assert.strictEqual(ts.size, 1);
  });

  // T-TS03: replay returns all entries in order
  it('T-TS03: replay returns all entries in order', () => {
    const ts = new TranscriptStore();
    ts.append('user', 'first');
    ts.append('assistant', 'second');
    const entries = ts.replay();
    assert.strictEqual(entries.length, 2);
    assert.strictEqual(entries[0].role, 'user');
    assert.strictEqual(entries[0].text, 'first');
    assert.strictEqual(entries[1].role, 'assistant');
    assert.strictEqual(entries[1].text, 'second');
  });

  // T-TS04: compact keeps only last N entries
  it('T-TS04: compact keeps only last N entries', () => {
    const ts = new TranscriptStore();
    for (let i = 0; i < 5; i++) {
      ts.append('user', `msg-${i}`);
    }
    const result = ts.compact(2);
    assert.strictEqual(ts.size, 2);
    assert.ok(result !== null, 'compact should return summary');
    assert.strictEqual(result.removedCount, 3);
  });

  // T-TS05: compact with fewer entries than keepLast — no change
  it('T-TS05: compact with fewer entries than keepLast returns null', () => {
    const ts = new TranscriptStore();
    ts.append('user', 'hello');
    ts.append('assistant', 'hi');
    const result = ts.compact(5);
    assert.strictEqual(result, null);
    assert.strictEqual(ts.size, 2);
  });

  // T-TS06: replayForAPI respects limit
  it('T-TS06: replayForAPI respects limit', () => {
    const ts = new TranscriptStore();
    for (let i = 0; i < 5; i++) {
      ts.append('user', `msg-${i}`);
    }
    const result = ts.replayForAPI(2);
    assert.strictEqual(result.length, 2);
  });

  // T-TS07: initial replay returns empty array
  it('T-TS07: initial replay returns empty array', () => {
    const ts = new TranscriptStore();
    assert.strictEqual(ts.replay().length, 0);
  });

  // T-TS08: constructor with initial entries
  it('T-TS08: constructor with initial entries populates store', () => {
    const entries = [
      { role: 'user', text: 'hello', timestamp: new Date().toISOString() },
      { role: 'assistant', text: 'hi', timestamp: new Date().toISOString() },
    ];
    const ts = new TranscriptStore(entries);
    assert.strictEqual(ts.size, 2);
  });

});
