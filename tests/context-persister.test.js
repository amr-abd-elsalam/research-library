// tests/context-persister.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 52 — ContextPersister unit tests
// Tests disabled-path guards for all public methods (config.CONTEXT
// defaults: persistContext=false → enabled=false). All file I/O
// methods return early (no-op) when disabled — no temp directory needed.
// Uses singleton import directly.
// ═══════════════════════════════════════════════════════════════

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { contextPersister } from '../server/services/contextPersister.js';

describe('ContextPersister', () => {

  // T-CP01: enabled getter reflects config (false by default)
  it('T-CP01: enabled is false by default (persistContext defaults to false)', () => {
    assert.strictEqual(contextPersister.enabled, false);
  });

  // T-CP02: write (scheduleWrite) when disabled → no-op, no error
  it('T-CP02: scheduleWrite when disabled is a no-op', () => {
    assert.doesNotThrow(() => {
      contextPersister.scheduleWrite('sess-001', { turns: [] });
    });
  });

  // T-CP03: read() when disabled → returns null
  it('T-CP03: read when disabled returns null', async () => {
    const data = await contextPersister.read('sess-001');
    assert.strictEqual(data, null);
  });

  // T-CP04: counts() returns correct structure
  it('T-CP04: counts returns correct structure', () => {
    const c = contextPersister.counts();
    assert.ok('enabled' in c, 'should have enabled key');
    assert.ok('dir' in c, 'should have dir key');
    assert.ok('pendingWrites' in c, 'should have pendingWrites key');
    assert.strictEqual(typeof c.enabled, 'boolean');
    assert.strictEqual(typeof c.dir, 'string');
    assert.strictEqual(typeof c.pendingWrites, 'number');
  });

  // T-CP05: ensureDir() when disabled → no-op, no error
  it('T-CP05: ensureDir when disabled is a no-op', async () => {
    await assert.doesNotReject(async () => {
      await contextPersister.ensureDir();
    });
  });

  // T-CP06: remove() when disabled → no-op, no error
  it('T-CP06: remove when disabled is a no-op', async () => {
    await assert.doesNotReject(async () => {
      await contextPersister.remove('sess-001');
    });
  });

  // T-CP07: enabled is false because persistContext defaults to false
  // (intelligentCompaction defaults to true, but persistContext must also be true)
  it('T-CP07: enabled requires persistContext=true (config default is false)', () => {
    // enabled = persistContext === true && intelligentCompaction !== false
    // Since persistContext defaults to false → enabled = false
    assert.strictEqual(contextPersister.enabled, false);
  });

  // T-CP08: counts() includes expected keys with correct types
  it('T-CP08: counts includes all expected keys', () => {
    const c = contextPersister.counts();
    assert.strictEqual(c.enabled, false);
    assert.strictEqual(c.pendingWrites, 0, 'no pending writes when disabled');
    assert.ok(c.dir.length > 0, 'dir should have a default value');
  });

});
