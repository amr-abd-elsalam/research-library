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

  // T-LI01: enabled is false by default (LIBRARY_INDEX.enabled defaults to false)
  it('T-LI01: enabled is false by default', () => {
    assert.strictEqual(libraryIndex.enabled, false);
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

  // T-LI05: startPeriodicRefresh() when disabled → no timer started
  it('T-LI05: startPeriodicRefresh when disabled does not start timer', () => {
    libraryIndex.startPeriodicRefresh();
    const c = libraryIndex.counts();
    assert.strictEqual(c.timerActive, false, 'timer should not start when disabled');
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

  // T-LI09: counts().enabled is false by default
  it('T-LI09: counts enabled is false by default', () => {
    const c = libraryIndex.counts();
    assert.strictEqual(c.enabled, false);
  });

  // T-LI10: getTopicNames() return type is Array
  it('T-LI10: getTopicNames return type is Array', () => {
    const result = libraryIndex.getTopicNames();
    assert.ok(Array.isArray(result), 'getTopicNames should always return an Array');
  });

});
