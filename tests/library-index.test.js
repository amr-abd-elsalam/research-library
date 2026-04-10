// tests/library-index.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 52 — LibraryIndex unit tests
// Tests disabled-path defaults for all read-only methods (config
// LIBRARY_INDEX.enabled defaults to false). refresh() and
// startPeriodicRefresh() are guarded — no qdrant/gemini needed.
// Uses singleton import directly.
// ═══════════════════════════════════════════════════════════════

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { libraryIndex } from '../server/services/libraryIndex.js';

describe('LibraryIndex', () => {

  afterEach(() => {
    // Ensure no lingering timers from tests
    libraryIndex.stopPeriodicRefresh();
  });

  // T-LI01: enabled is true by default (Phase 97: LIBRARY_INDEX.enabled defaults to true)
  it('T-LI01: enabled is true by default', () => {
    assert.strictEqual(libraryIndex.enabled, true);
  });

  // T-LI02: getIndex() returns null when no refresh has been done
  it('T-LI02: getIndex returns null when no refresh done', () => {
    const index = libraryIndex.getIndex();
    assert.strictEqual(index, null);
  });

  // T-LI03: getTopicNames() returns empty array when no index
  it('T-LI03: getTopicNames returns empty array when no index', () => {
    const topics = libraryIndex.getTopicNames();
    assert.ok(Array.isArray(topics), 'should return array');
    assert.strictEqual(topics.length, 0);
  });

  // T-LI04: counts() returns correct structure with expected keys
  it('T-LI04: counts returns correct structure', () => {
    const c = libraryIndex.counts();
    assert.ok('enabled' in c, 'should have enabled');
    assert.ok('hasIndex' in c, 'should have hasIndex');
    assert.ok('fileCount' in c, 'should have fileCount');
    assert.ok('topicCount' in c, 'should have topicCount');
    assert.ok('totalPoints' in c, 'should have totalPoints');
    assert.ok('refreshCount' in c, 'should have refreshCount');
    assert.ok('timerActive' in c, 'should have timerActive');
    assert.ok('libraryVersion' in c, 'should have libraryVersion');
  });

  // T-LI05: startPeriodicRefresh() when enabled → timer starts (Phase 97: enabled by default)
  it('T-LI05: startPeriodicRefresh when enabled starts timer', () => {
    libraryIndex.startPeriodicRefresh();
    const c = libraryIndex.counts();
    assert.strictEqual(c.timerActive, true, 'timer should start when enabled');
    libraryIndex.stopPeriodicRefresh();
  });

  // T-LI06: stopPeriodicRefresh() idempotent — no error on double call
  it('T-LI06: stopPeriodicRefresh is idempotent', () => {
    assert.doesNotThrow(() => {
      libraryIndex.stopPeriodicRefresh();
      libraryIndex.stopPeriodicRefresh();
    });
  });

  // T-LI07: getIndex returns null — serves as getVersion proxy (no version without index)
  it('T-LI07: counts libraryVersion is null when no index', () => {
    const c = libraryIndex.counts();
    assert.strictEqual(c.libraryVersion, null);
  });

  // T-LI08: counts().refreshCount is 0 initially
  it('T-LI08: refreshCount is 0 initially', () => {
    const c = libraryIndex.counts();
    assert.strictEqual(c.refreshCount, 0);
  });

  // T-LI09: counts().enabled is true by default (Phase 97)
  it('T-LI09: counts enabled is true by default', () => {
    const c = libraryIndex.counts();
    assert.strictEqual(c.enabled, true);
  });

  // T-LI10: getTopicNames() return type is Array
  it('T-LI10: getTopicNames return type is Array', () => {
    const result = libraryIndex.getTopicNames();
    assert.ok(Array.isArray(result), 'getTopicNames should always return an Array');
  });

  // ── Multi-collection foundation (Phase 59) ──────────────────

  // T-LI11: MULTI_LIBRARY disabled → getIndex() returns same as before (single collection)
  it('T-LI11: getIndex with no argument returns default index (backward compatible)', () => {
    const index = libraryIndex.getIndex();
    // Same as T-LI02 — null when no refresh done
    assert.strictEqual(index, null);
    // Also test with explicit null
    const indexNull = libraryIndex.getIndex(null);
    assert.strictEqual(indexNull, null);
  });

  // T-LI12: getIndex with libraryId when MULTI_LIBRARY disabled → returns null
  it('T-LI12: getIndex with libraryId when MULTI_LIBRARY disabled → null', () => {
    const index = libraryIndex.getIndex('some-library');
    assert.strictEqual(index, null, 'should return null — MULTI_LIBRARY disabled by default');
  });

  // T-LI13: getAllIndices() when MULTI_LIBRARY disabled → returns empty array
  it('T-LI13: getAllIndices when MULTI_LIBRARY disabled → empty array', () => {
    const result = libraryIndex.getAllIndices();
    assert.ok(Array.isArray(result), 'should return an array');
    assert.strictEqual(result.length, 0, 'should be empty when MULTI_LIBRARY disabled');
  });

  // ── Phase 60: Multi-library activation tests ────────────────

  // T-LI14: refresh() when disabled → early return (no qdrant calls)
  it('T-LI14: refresh when disabled returns without error', async () => {
    // LIBRARY_INDEX.enabled is false by default → refresh should return immediately
    await assert.doesNotReject(async () => {
      await libraryIndex.refresh();
    });
    // No index should be built
    assert.strictEqual(libraryIndex.getIndex(), null);
  });

  // T-LI15: refresh(libraryId) when disabled → early return
  it('T-LI15: refresh with libraryId when disabled returns without error', async () => {
    await assert.doesNotReject(async () => {
      await libraryIndex.refresh('test-lib');
    });
    assert.strictEqual(libraryIndex.getIndex('test-lib'), null);
  });

  // T-LI16: getIndex with various libraryId when MULTI_LIBRARY disabled → always null
  it('T-LI16: getIndex with various libraryId values when disabled → null', () => {
    assert.strictEqual(libraryIndex.getIndex('lib-a'), null);
    assert.strictEqual(libraryIndex.getIndex('lib-b'), null);
    assert.strictEqual(libraryIndex.getIndex(''), null);
  });

  // T-LI17: getAllIndices returns array (type safety check)
  it('T-LI17: getAllIndices always returns array with correct shape', () => {
    const result = libraryIndex.getAllIndices();
    assert.ok(Array.isArray(result), 'should be array');
    // Each entry should be [string, object] pair
    for (const entry of result) {
      assert.ok(Array.isArray(entry), 'each entry should be an array');
      assert.strictEqual(entry.length, 2, 'each entry should be [id, index]');
    }
  });

});
