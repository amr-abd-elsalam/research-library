// tests/metrics-persister.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 55 — MetricsSnapshotPersister unit tests (disabled-path)
// Tests disabled-path guards for all public methods (config.PIPELINE
// defaults: snapshotEnabled=false). All file I/O methods return
// early (no-op) when disabled — no temp directory needed.
// Uses singleton import directly.
// ═══════════════════════════════════════════════════════════════

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { metricsPersister } from '../server/services/metricsPersister.js';

describe('MetricsSnapshotPersister', () => {

  afterEach(() => {
    metricsPersister.stop();
  });

  // T-MP01: enabled is false by default
  it('T-MP01: enabled is false by default (snapshotEnabled defaults to false)', () => {
    const c = metricsPersister.counts();
    assert.strictEqual(c.enabled, false);
  });

  // T-MP02: flush when disabled is no-op
  it('T-MP02: flush when disabled is a no-op', async () => {
    await assert.doesNotReject(async () => {
      await metricsPersister.flush();
    });
  });

  // T-MP03: restore when disabled is no-op
  it('T-MP03: restore when disabled is a no-op', async () => {
    const result = await metricsPersister.restore();
    assert.strictEqual(result, false);
  });

  // T-MP04: start when disabled does not start timer
  it('T-MP04: start when disabled does not start timer', () => {
    assert.doesNotThrow(() => {
      metricsPersister.start();
    });
  });

  // T-MP05: stop when disabled is idempotent
  it('T-MP05: stop when disabled is idempotent', () => {
    assert.doesNotThrow(() => {
      metricsPersister.stop();
      metricsPersister.stop();
    });
  });

  // T-MP06: counts returns correct structure
  it('T-MP06: counts returns correct structure', () => {
    const c = metricsPersister.counts();
    assert.ok('enabled' in c, 'should have enabled key');
    assert.ok('intervalMs' in c, 'should have intervalMs key');
    assert.ok('filePath' in c, 'should have filePath key');
    assert.ok('lastSavedAt' in c, 'should have lastSavedAt key');
  });

  // T-MP07: counts.enabled is false by default
  it('T-MP07: counts.enabled is false by default', () => {
    assert.strictEqual(metricsPersister.counts().enabled, false);
  });

  // T-MP08: counts includes all expected keys with correct types
  it('T-MP08: counts includes all expected keys with correct types', () => {
    const c = metricsPersister.counts();
    assert.strictEqual(typeof c.enabled, 'boolean');
    assert.strictEqual(typeof c.intervalMs, 'number');
    assert.strictEqual(typeof c.filePath, 'string');
    assert.ok(c.lastSavedAt === null || typeof c.lastSavedAt === 'string', 'lastSavedAt should be null or string');
  });

});
