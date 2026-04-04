// tests/atomic-write.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 55 — atomicWriteFile utility unit tests
// Tests the shared atomic write utility (temp file + rename).
// Uses real temp directories — cleaned up in afterEach.
// ═══════════════════════════════════════════════════════════════

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { atomicWriteFile } from '../server/services/atomicWrite.js';

let tempDir;

afterEach(() => {
  if (tempDir && existsSync(tempDir)) {
    rmSync(tempDir, { recursive: true, force: true });
  }
  tempDir = null;
});

function makeTempDir() {
  tempDir = mkdtempSync(join(tmpdir(), 'aw-'));
  return tempDir;
}

describe('atomicWriteFile', () => {

  // T-AW01: creates file with correct content
  it('T-AW01: creates file with correct content', async () => {
    const dir = makeTempDir();
    const filePath = join(dir, 'test.json');
    await atomicWriteFile(filePath, '{"key":"value"}');
    const content = readFileSync(filePath, 'utf-8');
    assert.strictEqual(content, '{"key":"value"}');
  });

  // T-AW02: creates parent directory if missing
  it('T-AW02: creates parent directory if missing', async () => {
    const dir = makeTempDir();
    const filePath = join(dir, 'sub', 'deep', 'test.json');
    await atomicWriteFile(filePath, 'data');
    const content = readFileSync(filePath, 'utf-8');
    assert.strictEqual(content, 'data');
  });

  // T-AW03: tmp file is cleaned up after successful write
  it('T-AW03: tmp file is cleaned up after successful write', async () => {
    const dir = makeTempDir();
    const filePath = join(dir, 'test.json');
    await atomicWriteFile(filePath, 'data');
    assert.strictEqual(existsSync(filePath + '.tmp'), false);
  });

  // T-AW04: overwrites existing file
  it('T-AW04: overwrites existing file', async () => {
    const dir = makeTempDir();
    const filePath = join(dir, 'test.json');
    writeFileSync(filePath, 'old', 'utf-8');
    await atomicWriteFile(filePath, 'new');
    const content = readFileSync(filePath, 'utf-8');
    assert.strictEqual(content, 'new');
  });

  // T-AW05: empty content writes empty file
  it('T-AW05: empty content writes empty file', async () => {
    const dir = makeTempDir();
    const filePath = join(dir, 'test.json');
    await atomicWriteFile(filePath, '');
    const content = readFileSync(filePath, 'utf-8');
    assert.strictEqual(content, '');
  });

  // T-AW06: unicode content (Arabic text) preserved
  it('T-AW06: unicode content (Arabic text) preserved', async () => {
    const dir = makeTempDir();
    const filePath = join(dir, 'test.json');
    await atomicWriteFile(filePath, 'مرحباً');
    const content = readFileSync(filePath, 'utf-8');
    assert.strictEqual(content, 'مرحباً');
  });

  // T-AW07: JSON round-trip preserves structure
  it('T-AW07: JSON round-trip preserves structure', async () => {
    const dir = makeTempDir();
    const filePath = join(dir, 'test.json');
    const obj = { name: 'test', items: [1, 2, 3] };
    await atomicWriteFile(filePath, JSON.stringify(obj));
    const content = readFileSync(filePath, 'utf-8');
    assert.deepStrictEqual(JSON.parse(content), obj);
  });

  // T-AW08: consecutive writes — last write wins
  it('T-AW08: consecutive writes — last write wins', async () => {
    const dir = makeTempDir();
    const filePath = join(dir, 'test.json');
    await atomicWriteFile(filePath, 'first');
    await atomicWriteFile(filePath, 'second');
    const content = readFileSync(filePath, 'utf-8');
    assert.strictEqual(content, 'second');
  });

});
