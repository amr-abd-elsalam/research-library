// tests/listeners/config-cache-listener.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 62 — Unit tests for configCacheListener (Listener #20)
// Tests that feature:toggled and library:changed events trigger
// config cache invalidation + DynamicWelcomeSuggestions.invalidate().
// ═══════════════════════════════════════════════════════════════

import { describe, it, before, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { eventBus } from '../../server/services/eventBus.js';
import { register, setConfigCacheInvalidator } from '../../server/services/listeners/configCacheListener.js';
import { dynamicWelcomeSuggestions } from '../../server/services/dynamicWelcomeSuggestions.js';

let registered = false;

describe('ConfigCacheListener (Phase 62)', () => {

  before(() => {
    if (!registered) {
      register();
      registered = true;
    }
  });

  afterEach(() => {
    // Reset the invalidator to avoid cross-test leakage
    setConfigCacheInvalidator(null);
  });

  // T-CCL01: feature:toggled event → config cache invalidator called
  it('T-CCL01: feature:toggled — config cache invalidator called', () => {
    let called = false;
    setConfigCacheInvalidator(() => { called = true; });
    eventBus.emit('feature:toggled', { section: 'FEEDBACK', enabled: true });
    assert.strictEqual(called, true, 'invalidator should have been called');
  });

  // T-CCL02: feature:toggled event → DynamicWelcomeSuggestions.invalidate() called
  it('T-CCL02: feature:toggled — DynamicWelcomeSuggestions.invalidate() called', () => {
    // Pre-warm the DWS cache by manually setting lastRefreshedAt via generate()
    // We verify invalidate was called by checking that cache is cleared
    const countsBefore = dynamicWelcomeSuggestions.counts();
    // Force a known state: call invalidate first to have a clean baseline
    dynamicWelcomeSuggestions.invalidate();
    // After invalidation, lastRefreshedAt should be null
    const countsAfterInvalidate = dynamicWelcomeSuggestions.counts();
    assert.strictEqual(countsAfterInvalidate.lastRefreshedAt, null);

    // Now generate to set a cache
    dynamicWelcomeSuggestions.generate();

    // Emit event — should call invalidate()
    setConfigCacheInvalidator(() => {});
    eventBus.emit('feature:toggled', { section: 'SUGGESTIONS', enabled: false });

    // After event, cache should be invalidated (lastRefreshedAt reset to null)
    const countsAfterEvent = dynamicWelcomeSuggestions.counts();
    assert.strictEqual(countsAfterEvent.lastRefreshedAt, null, 'DWS cache should be invalidated after feature:toggled');
  });

  // T-CCL03: library:changed event → config cache invalidator called
  it('T-CCL03: library:changed — config cache invalidator called', () => {
    let called = false;
    setConfigCacheInvalidator(() => { called = true; });
    eventBus.emit('library:changed', { newVersion: 'v-test' });
    assert.strictEqual(called, true, 'invalidator should have been called');
  });

  // T-CCL04: library:changed event → DynamicWelcomeSuggestions.invalidate() called
  it('T-CCL04: library:changed — DynamicWelcomeSuggestions.invalidate() called', () => {
    dynamicWelcomeSuggestions.invalidate();
    dynamicWelcomeSuggestions.generate();

    setConfigCacheInvalidator(() => {});
    eventBus.emit('library:changed', { newVersion: 'v-test-2' });

    const counts = dynamicWelcomeSuggestions.counts();
    assert.strictEqual(counts.lastRefreshedAt, null, 'DWS cache should be invalidated after library:changed');
  });

  // T-CCL05: No invalidator set → no error thrown (graceful handling)
  it('T-CCL05: no invalidator set — no error thrown on event', () => {
    setConfigCacheInvalidator(null);
    // Should not throw
    assert.doesNotThrow(() => {
      eventBus.emit('feature:toggled', { section: 'FEEDBACK', enabled: true });
    });
    assert.doesNotThrow(() => {
      eventBus.emit('library:changed', { newVersion: 'v-safe' });
    });
  });

});
