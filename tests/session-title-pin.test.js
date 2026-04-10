// tests/session-title-pin.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 94 — Session Title/Pin Unit Tests
// Tests sessionMetadataIndex custom_title + pinned fields:
// upsert, list sort (pinned first), warmUp with new fields.
// No network calls — tests pure in-memory logic.
// ═══════════════════════════════════════════════════════════════

import { describe, it, afterEach, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { sessionMetadataIndex } from '../server/services/sessionMetadataIndex.js';

// ── Cleanup ───────────────────────────────────────────────────
afterEach(() => {
  sessionMetadataIndex.reset();
});

// ═══════════════════════════════════════════════════════════════
// Block 1: upsert with custom_title + pinned (T-STP01 to T-STP05)
// ═══════════════════════════════════════════════════════════════
describe('Session Title/Pin — upsert', () => {

  // T-STP01: upsert with custom_title updates entry
  it('T-STP01: upsert with custom_title updates entry', () => {
    sessionMetadataIndex.upsert('sess-t1', { message_count_delta: 2, first_message: 'original' });
    sessionMetadataIndex.upsert('sess-t1', { custom_title: 'عنوان مخصص' });
    const list = sessionMetadataIndex.list();
    assert.strictEqual(list[0].custom_title, 'عنوان مخصص');
  });

  // T-STP02: upsert with pinned updates entry
  it('T-STP02: upsert with pinned updates entry', () => {
    sessionMetadataIndex.upsert('sess-t2', { message_count_delta: 2 });
    sessionMetadataIndex.upsert('sess-t2', { pinned: true });
    const list = sessionMetadataIndex.list();
    assert.strictEqual(list[0].pinned, true);
  });

  // T-STP03: new entry has custom_title: null and pinned: false by default
  it('T-STP03: new entry has null custom_title and false pinned', () => {
    sessionMetadataIndex.upsert('sess-t3', { message_count_delta: 1 });
    const list = sessionMetadataIndex.list();
    assert.strictEqual(list[0].custom_title, null);
    assert.strictEqual(list[0].pinned, false);
  });

  // T-STP04: upsert with pinned: false after pinned: true — unpins
  it('T-STP04: upsert pinned false after true — unpins', () => {
    sessionMetadataIndex.upsert('sess-t4', { pinned: true });
    sessionMetadataIndex.upsert('sess-t4', { pinned: false });
    const list = sessionMetadataIndex.list();
    assert.strictEqual(list[0].pinned, false);
  });

  // T-STP05: upsert with custom_title: null clears title
  it('T-STP05: upsert with custom_title null clears title', () => {
    sessionMetadataIndex.upsert('sess-t5', { custom_title: 'عنوان' });
    sessionMetadataIndex.upsert('sess-t5', { custom_title: null });
    const list = sessionMetadataIndex.list();
    assert.strictEqual(list[0].custom_title, null);
  });
});

// ═══════════════════════════════════════════════════════════════
// Block 2: list sort — pinned first (T-STP06 to T-STP09)
// ═══════════════════════════════════════════════════════════════
describe('Session Title/Pin — list sort', () => {

  // T-STP06: pinned sessions appear first in list
  it('T-STP06: pinned sessions appear first', () => {
    sessionMetadataIndex.upsert('sess-unpinned', { last_active: 3000000, pinned: false });
    sessionMetadataIndex.upsert('sess-pinned', { last_active: 1000000, pinned: true });
    sessionMetadataIndex.upsert('sess-unpinned2', { last_active: 2000000, pinned: false });

    const list = sessionMetadataIndex.list();
    assert.strictEqual(list[0].session_id, 'sess-pinned', 'pinned should be first despite older last_active');
    assert.strictEqual(list[0].pinned, true);
  });

  // T-STP07: within pinned group, sorted by last_active DESC
  it('T-STP07: within pinned group, sorted by last_active DESC', () => {
    sessionMetadataIndex.upsert('pin-old', { last_active: 1000000, pinned: true });
    sessionMetadataIndex.upsert('pin-new', { last_active: 3000000, pinned: true });
    sessionMetadataIndex.upsert('pin-mid', { last_active: 2000000, pinned: true });

    const list = sessionMetadataIndex.list();
    assert.strictEqual(list[0].session_id, 'pin-new');
    assert.strictEqual(list[1].session_id, 'pin-mid');
    assert.strictEqual(list[2].session_id, 'pin-old');
  });

  // T-STP08: within unpinned group, sorted by last_active DESC
  it('T-STP08: within unpinned group, sorted by last_active DESC', () => {
    sessionMetadataIndex.upsert('unpin-old', { last_active: 1000000 });
    sessionMetadataIndex.upsert('unpin-new', { last_active: 3000000 });

    const list = sessionMetadataIndex.list();
    assert.strictEqual(list[0].session_id, 'unpin-new');
    assert.strictEqual(list[1].session_id, 'unpin-old');
  });

  // T-STP09: mixed pinned and unpinned — correct order
  it('T-STP09: mixed pinned and unpinned — correct order', () => {
    sessionMetadataIndex.upsert('u1', { last_active: 5000000 });        // unpinned, most recent
    sessionMetadataIndex.upsert('p1', { last_active: 1000000, pinned: true }); // pinned, oldest
    sessionMetadataIndex.upsert('u2', { last_active: 4000000 });        // unpinned
    sessionMetadataIndex.upsert('p2', { last_active: 2000000, pinned: true }); // pinned

    const list = sessionMetadataIndex.list();
    // Pinned first (p2 newer, then p1), then unpinned (u1 newer, then u2)
    assert.strictEqual(list[0].session_id, 'p2');
    assert.strictEqual(list[1].session_id, 'p1');
    assert.strictEqual(list[2].session_id, 'u1');
    assert.strictEqual(list[3].session_id, 'u2');
  });
});

// ═══════════════════════════════════════════════════════════════
// Block 3: warmUp with custom_title + pinned (T-STP10 to T-STP12)
// ═══════════════════════════════════════════════════════════════
describe('Session Title/Pin — warmUp', () => {
  let tempDir;

  before(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'stp-test-'));
  });

  after(async () => {
    try { await rm(tempDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  afterEach(() => {
    sessionMetadataIndex.reset();
  });

  // T-STP10: warmUp reads custom_title from session files
  it('T-STP10: warmUp reads custom_title', async () => {
    const dateDir = join(tempDir, '2025-03-01');
    await mkdir(dateDir, { recursive: true });

    const session = {
      session_id: 'dddddddd-1111-4111-a111-111111111111',
      created_at: '2025-03-01T10:00:00.000Z',
      last_active: '2025-03-01T10:00:00.000Z',
      custom_title: 'عنوان مخصص',
      messages: [{ role: 'user', text: 'سؤال' }],
    };
    await writeFile(join(dateDir, 'dddddddd-1111-4111-a111-111111111111.json'), JSON.stringify(session));

    await sessionMetadataIndex.warmUp(tempDir);
    const list = sessionMetadataIndex.list();
    assert.strictEqual(list[0].custom_title, 'عنوان مخصص');
  });

  // T-STP11: warmUp reads pinned from session files
  it('T-STP11: warmUp reads pinned', async () => {
    const dateDir = join(tempDir, '2025-03-02');
    await mkdir(dateDir, { recursive: true });

    const session = {
      session_id: 'eeeeeeee-2222-4222-b222-222222222222',
      created_at: '2025-03-02T10:00:00.000Z',
      last_active: '2025-03-02T10:00:00.000Z',
      pinned: true,
      messages: [],
    };
    await writeFile(join(dateDir, 'eeeeeeee-2222-4222-b222-222222222222.json'), JSON.stringify(session));

    await sessionMetadataIndex.warmUp(tempDir);
    const list = sessionMetadataIndex.list();
    const found = list.find(s => s.session_id === 'eeeeeeee-2222-4222-b222-222222222222');
    assert.ok(found);
    assert.strictEqual(found.pinned, true);
  });

  // T-STP12: warmUp defaults custom_title to null and pinned to false when missing
  it('T-STP12: warmUp defaults when fields missing', async () => {
    const dateDir = join(tempDir, '2025-03-03');
    await mkdir(dateDir, { recursive: true });

    const session = {
      session_id: 'ffffffff-3333-4333-b333-333333333333',
      created_at: '2025-03-03T10:00:00.000Z',
      last_active: '2025-03-03T10:00:00.000Z',
      messages: [],
    };
    await writeFile(join(dateDir, 'ffffffff-3333-4333-b333-333333333333.json'), JSON.stringify(session));

    await sessionMetadataIndex.warmUp(tempDir);
    const list = sessionMetadataIndex.list();
    const found = list.find(s => s.session_id === 'ffffffff-3333-4333-b333-333333333333');
    assert.ok(found);
    assert.strictEqual(found.custom_title, null);
    assert.strictEqual(found.pinned, false);
  });
});

// ═══════════════════════════════════════════════════════════════
// Block 4: Per-user isolation with pinned (T-STP13 to T-STP15)
// ═══════════════════════════════════════════════════════════════
describe('Session Title/Pin — Per-user + Pinned', () => {

  // T-STP13: pinned sessions from different user don't appear in filtered list
  it('T-STP13: pinned sessions respect per-user filter', () => {
    sessionMetadataIndex.upsert('user-a-pinned', { ip_hash: 'hash-a', pinned: true, last_active: 1000000 });
    sessionMetadataIndex.upsert('user-b-unpinned', { ip_hash: 'hash-b', last_active: 2000000 });

    const listA = sessionMetadataIndex.list({ ipHash: 'hash-a' });
    assert.strictEqual(listA.length, 1);
    assert.strictEqual(listA[0].session_id, 'user-a-pinned');

    const listB = sessionMetadataIndex.list({ ipHash: 'hash-b' });
    assert.strictEqual(listB.length, 1);
    assert.strictEqual(listB[0].session_id, 'user-b-unpinned');
  });

  // T-STP14: pinned sort works within per-user filtered results
  it('T-STP14: pinned sort within per-user filter', () => {
    sessionMetadataIndex.upsert('a-unpinned', { ip_hash: 'hash-x', last_active: 3000000 });
    sessionMetadataIndex.upsert('a-pinned', { ip_hash: 'hash-x', last_active: 1000000, pinned: true });

    const list = sessionMetadataIndex.list({ ipHash: 'hash-x' });
    assert.strictEqual(list[0].session_id, 'a-pinned', 'pinned should be first even within user filter');
    assert.strictEqual(list[1].session_id, 'a-unpinned');
  });

  // T-STP15: list with custom_title visible in entries
  it('T-STP15: list includes custom_title field in entries', () => {
    sessionMetadataIndex.upsert('titled-sess', { custom_title: 'العنوان', message_count_delta: 1 });
    const list = sessionMetadataIndex.list();
    assert.strictEqual(list[0].custom_title, 'العنوان');
    assert.ok('custom_title' in list[0], 'custom_title field should exist');
    assert.ok('pinned' in list[0], 'pinned field should exist');
  });
});
