// tests/audit-persister.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 55 — AuditPersister unit tests (disabled-path)
// Tests disabled-path guards for all public methods (config.AUDIT
// defaults: persistAudit=false → enabled=false). All file I/O
// methods return early (no-op) when disabled.
// Uses singleton import directly.
// ═══════════════════════════════════════════════════════════════

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { auditPersister } from '../server/services/auditPersister.js';

describe('AuditPersister', () => {

  afterEach(() => {
    auditPersister.stop();
  });

  // T-AP01: enabled is false by default
  it('T-AP01: enabled is false by default (persistAudit defaults to false)', () => {
    assert.strictEqual(auditPersister.enabled, false);
  });

  // T-AP02: flush when disabled is no-op
  it('T-AP02: flush when disabled is a no-op', async () => {
    await assert.doesNotReject(async () => {
      await auditPersister.flush();
    });
  });

  // T-AP03: read when disabled returns empty array
  it('T-AP03: read when disabled returns empty array', async () => {
    const entries = await auditPersister.read('sess-001');
    assert.deepStrictEqual(entries, []);
  });

  // T-AP04: scheduleWrite when disabled is no-op
  it('T-AP04: scheduleWrite when disabled is a no-op', () => {
    assert.doesNotThrow(() => {
      auditPersister.scheduleWrite('sess-001', { type: 'test' });
    });
  });

  // T-AP05: ensureDir when disabled is no-op
  it('T-AP05: ensureDir when disabled is a no-op', async () => {
    await assert.doesNotReject(async () => {
      await auditPersister.ensureDir();
    });
  });

  // T-AP06: stop is idempotent
  it('T-AP06: stop is idempotent', () => {
    assert.doesNotThrow(() => {
      auditPersister.stop();
      auditPersister.stop();
    });
  });

  // T-AP07: counts returns correct structure
  it('T-AP07: counts returns correct structure', () => {
    const c = auditPersister.counts();
    assert.ok('enabled' in c, 'should have enabled key');
    assert.ok('auditDir' in c, 'should have auditDir key');
    assert.ok('queueSize' in c, 'should have queueSize key');
    assert.ok('totalWrites' in c, 'should have totalWrites key');
  });

  // T-AP08: counts includes all expected keys with correct types
  it('T-AP08: counts includes all expected keys with correct types', () => {
    const c = auditPersister.counts();
    assert.strictEqual(typeof c.enabled, 'boolean');
    assert.strictEqual(typeof c.auditDir, 'string');
    assert.strictEqual(typeof c.queueSize, 'number');
    assert.strictEqual(typeof c.totalWrites, 'number');
    assert.strictEqual(c.enabled, false);
    assert.strictEqual(c.queueSize, 0);
  });

});
