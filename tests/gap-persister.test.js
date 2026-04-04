// tests/gap-persister.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 55 — GapPersister unit tests (disabled-path)
// Tests disabled-path guards for all public methods (config.CONTENT_GAPS
// defaults: persistGaps=false → enabled=false). All file I/O
// methods return early (no-op) when disabled.
// Uses singleton import directly.
// ═══════════════════════════════════════════════════════════════

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { gapPersister } from '../server/services/gapPersister.js';

describe('GapPersister', () => {

  afterEach(() => {
    gapPersister.stop();
  });

  // T-GP01: enabled is false by default
  it('T-GP01: enabled is false by default (persistGaps defaults to false)', () => {
    assert.strictEqual(gapPersister.enabled, false);
  });

  // T-GP02: flush when disabled is no-op
  it('T-GP02: flush when disabled is a no-op', async () => {
    await assert.doesNotReject(async () => {
      await gapPersister.flush();
    });
  });

  // T-GP03: read when disabled returns empty array
  it('T-GP03: read when disabled returns empty array', async () => {
    const entries = await gapPersister.read();
    assert.deepStrictEqual(entries, []);
  });

  // T-GP04: scheduleWrite when disabled is no-op
  it('T-GP04: scheduleWrite when disabled is a no-op', () => {
    assert.doesNotThrow(() => {
      gapPersister.scheduleWrite({ message: 'test', reason: 'test' });
    });
  });

  // T-GP05: ensureDir when disabled is no-op
  it('T-GP05: ensureDir when disabled is a no-op', async () => {
    await assert.doesNotReject(async () => {
      await gapPersister.ensureDir();
    });
  });

  // T-GP06: stop is idempotent
  it('T-GP06: stop is idempotent', () => {
    assert.doesNotThrow(() => {
      gapPersister.stop();
      gapPersister.stop();
    });
  });

  // T-GP07: counts returns correct structure
  it('T-GP07: counts returns correct structure', () => {
    const c = gapPersister.counts();
    assert.ok('enabled' in c, 'should have enabled key');
    assert.ok('filePath' in c, 'should have filePath key');
    assert.ok('pending' in c, 'should have pending key');
    assert.ok('writeCount' in c, 'should have writeCount key');
  });

  // T-GP08: counts includes all expected keys with correct types
  it('T-GP08: counts includes all expected keys with correct types', () => {
    const c = gapPersister.counts();
    assert.strictEqual(typeof c.enabled, 'boolean');
    assert.strictEqual(typeof c.filePath, 'string');
    assert.strictEqual(typeof c.pending, 'number');
    assert.strictEqual(typeof c.writeCount, 'number');
    assert.strictEqual(c.enabled, false);
    assert.strictEqual(c.pending, 0);
  });

});
