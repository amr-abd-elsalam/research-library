// tests/dynamic-welcome-suggestions.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 59 — DynamicWelcomeSuggestions unit tests
// Tests the singleton lifecycle: disabled paths, cache, invalidate,
// reset, counts, and enabled-path generation with mock data.
// ═══════════════════════════════════════════════════════════════

import { describe, it, afterEach, before } from 'node:test';
import assert from 'node:assert/strict';
import { dynamicWelcomeSuggestions } from '../server/services/dynamicWelcomeSuggestions.js';
import { featureFlags } from '../server/services/featureFlags.js';
import { libraryIndex } from '../server/services/libraryIndex.js';
import { suggestionsEngine } from '../server/services/suggestionsEngine.js';

// ── Helper: temporarily override libraryIndex.enabled getter ──
// libraryIndex.enabled is a class getter returning this.#enabled (set from config).
// In test env, config.LIBRARY_INDEX.enabled = false → always false.
// We use Object.defineProperty to override the getter for enabled-path tests.
let originalEnabledDescriptor;

function mockLibraryIndexEnabled(value) {
  if (!originalEnabledDescriptor) {
    originalEnabledDescriptor = Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(libraryIndex), 'enabled'
    );
  }
  Object.defineProperty(libraryIndex, 'enabled', {
    get: () => value,
    configurable: true,
  });
}

function restoreLibraryIndexEnabled() {
  if (originalEnabledDescriptor) {
    // Remove instance-level override → prototype getter takes over
    delete libraryIndex.enabled;
  }
}

describe('DynamicWelcomeSuggestions', () => {

  afterEach(() => {
    dynamicWelcomeSuggestions.reset();
    featureFlags.clearOverride('SUGGESTIONS');
    suggestionsEngine.reset();
    restoreLibraryIndexEnabled();
  });

  // ── Disabled paths ───────────────────────────────────────────

  // T-DWS01: disabled (SUGGESTIONS off) → generate() returns []
  it('T-DWS01: disabled (SUGGESTIONS off) → generate returns []', () => {
    // featureFlags default: SUGGESTIONS = false
    const result = dynamicWelcomeSuggestions.generate();
    assert.ok(Array.isArray(result), 'should return array');
    assert.strictEqual(result.length, 0);
  });

  // T-DWS02: disabled (libraryIndex not enabled) → generate() returns []
  it('T-DWS02: disabled (libraryIndex not enabled) → generate returns []', () => {
    featureFlags.setOverride('SUGGESTIONS', true);
    // libraryIndex.enabled = false (config default)
    const result = dynamicWelcomeSuggestions.generate();
    assert.ok(Array.isArray(result), 'should return array');
    assert.strictEqual(result.length, 0);
  });

  // T-DWS03: enabled but no library data (empty index) → returns []
  it('T-DWS03: enabled but no library data → returns []', () => {
    featureFlags.setOverride('SUGGESTIONS', true);
    mockLibraryIndexEnabled(true);
    // libraryIndex.getIndex() returns null (no refresh done)
    // suggestionsEngine.getClickCounts().top is empty
    const result = dynamicWelcomeSuggestions.generate();
    assert.ok(Array.isArray(result), 'should return array');
    assert.strictEqual(result.length, 0);
  });

  // ── Enabled paths (with mock data via click tracking) ────────

  // T-DWS04: click data present → top clicked suggestions appear first
  it('T-DWS04: click data present → top clicked appear in results', () => {
    featureFlags.setOverride('SUGGESTIONS', true);
    mockLibraryIndexEnabled(true);

    // Record clicks (suggestionsEngine needs SUGGESTIONS enabled to record)
    suggestionsEngine.recordClick('سؤال شائع أول');
    suggestionsEngine.recordClick('سؤال شائع ثاني');
    suggestionsEngine.recordClick('سؤال شائع أول'); // second click

    const result = dynamicWelcomeSuggestions.generate();
    assert.ok(result.length > 0, 'should have suggestions from click data');
    assert.strictEqual(result[0], 'سؤال شائع أول', 'most clicked should be first');
  });

  // T-DWS05: maxSuggestions respected — never exceeds config limit
  it('T-DWS05: maxSuggestions respected', () => {
    featureFlags.setOverride('SUGGESTIONS', true);
    mockLibraryIndexEnabled(true);

    // Record more clicks than maxSuggestions (default 3)
    for (let i = 0; i < 10; i++) {
      suggestionsEngine.recordClick(`سؤال رقم ${i}`);
    }

    const result = dynamicWelcomeSuggestions.generate();
    assert.ok(result.length <= 3, `should not exceed maxSuggestions (3), got ${result.length}`);
  });

  // T-DWS06: cache works — second generate() call returns same array without rebuild
  it('T-DWS06: cache works — second call returns cached result', () => {
    featureFlags.setOverride('SUGGESTIONS', true);
    mockLibraryIndexEnabled(true);

    suggestionsEngine.recordClick('cached question');

    const result1 = dynamicWelcomeSuggestions.generate();
    const result2 = dynamicWelcomeSuggestions.generate();
    assert.deepStrictEqual(result1, result2, 'second call should return same result');
    // Verify same reference (cache hit — no rebuild)
    assert.strictEqual(result1, result2, 'should return exact same array reference (cached)');
  });

  // T-DWS07: invalidate() clears cache — next generate() rebuilds
  it('T-DWS07: invalidate clears cache', () => {
    featureFlags.setOverride('SUGGESTIONS', true);
    mockLibraryIndexEnabled(true);

    suggestionsEngine.recordClick('before invalidation');

    const result1 = dynamicWelcomeSuggestions.generate();
    assert.ok(result1.length > 0, 'should have results');

    dynamicWelcomeSuggestions.invalidate();

    // After invalidate, generate should rebuild (new reference)
    const result2 = dynamicWelcomeSuggestions.generate();
    assert.notStrictEqual(result1, result2, 'should be a different array reference after invalidation');
    assert.deepStrictEqual(result1, result2, 'content should be same (same underlying data)');
  });

  // T-DWS08: reset() clears all state — counts() reflects empty
  it('T-DWS08: reset clears all state', () => {
    featureFlags.setOverride('SUGGESTIONS', true);
    mockLibraryIndexEnabled(true);

    suggestionsEngine.recordClick('something');
    dynamicWelcomeSuggestions.generate();

    assert.ok(dynamicWelcomeSuggestions.counts().cachedCount > 0, 'should have cached items');

    dynamicWelcomeSuggestions.reset();

    const counts = dynamicWelcomeSuggestions.counts();
    assert.strictEqual(counts.cachedCount, 0, 'cachedCount should be 0 after reset');
    assert.strictEqual(counts.lastRefreshedAt, null, 'lastRefreshedAt should be null after reset');
  });

  // T-DWS09: counts() returns correct structure
  it('T-DWS09: counts returns correct structure', () => {
    const counts = dynamicWelcomeSuggestions.counts();
    assert.ok('enabled' in counts, 'should have enabled');
    assert.ok('cachedCount' in counts, 'should have cachedCount');
    assert.ok('lastRefreshedAt' in counts, 'should have lastRefreshedAt');
    assert.strictEqual(typeof counts.enabled, 'boolean', 'enabled should be boolean');
    assert.strictEqual(typeof counts.cachedCount, 'number', 'cachedCount should be number');
  });

  // T-DWS10: duplicate filtering — same text from different sources not duplicated
  it('T-DWS10: duplicate filtering works', () => {
    featureFlags.setOverride('SUGGESTIONS', true);
    mockLibraryIndexEnabled(true);

    // Record same text twice — should only appear once
    suggestionsEngine.recordClick('سؤال مكرر');
    suggestionsEngine.recordClick('سؤال مكرر');

    const result = dynamicWelcomeSuggestions.generate();
    const duplicates = result.filter(s => s === 'سؤال مكرر');
    assert.ok(duplicates.length <= 1, 'same suggestion should not appear twice');
  });

  // T-DWS11: enabled getter reflects combined state
  it('T-DWS11: enabled getter reflects SUGGESTIONS + libraryIndex state', () => {
    // Both off
    assert.strictEqual(dynamicWelcomeSuggestions.enabled, false);

    // SUGGESTIONS on, libraryIndex off
    featureFlags.setOverride('SUGGESTIONS', true);
    assert.strictEqual(dynamicWelcomeSuggestions.enabled, false);

    // Both on
    mockLibraryIndexEnabled(true);
    assert.strictEqual(dynamicWelcomeSuggestions.enabled, true);

    // SUGGESTIONS off, libraryIndex on
    featureFlags.clearOverride('SUGGESTIONS');
    assert.strictEqual(dynamicWelcomeSuggestions.enabled, false);
  });

  // T-DWS12: counts().lastRefreshedAt is ISO string after generate
  it('T-DWS12: lastRefreshedAt is ISO string after generate', () => {
    featureFlags.setOverride('SUGGESTIONS', true);
    mockLibraryIndexEnabled(true);

    suggestionsEngine.recordClick('test');
    dynamicWelcomeSuggestions.generate();

    const counts = dynamicWelcomeSuggestions.counts();
    assert.ok(counts.lastRefreshedAt !== null, 'should have lastRefreshedAt');
    assert.ok(typeof counts.lastRefreshedAt === 'string', 'should be a string');
    // Validate ISO format
    const parsed = new Date(counts.lastRefreshedAt);
    assert.ok(!isNaN(parsed.getTime()), 'should be a valid ISO date');
  });

});
