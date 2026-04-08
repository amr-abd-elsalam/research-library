// tests/listeners/configRevalidationListener.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 80 — Config Re-Validation Listener Unit Tests
// Tests configRevalidationListener behavior and register function.
// No network calls — tests glue layer only.
// ═══════════════════════════════════════════════════════════════

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { configRevalidationListener, registerConfigRevalidationListener } from '../../server/services/listeners/configRevalidationListener.js';
import { configValidator } from '../../server/services/configValidator.js';
import { eventBus } from '../../server/services/eventBus.js';

// ── Cleanup ───────────────────────────────────────────────────
afterEach(() => {
  configValidator.reset();
  eventBus.removeAllListeners('feature:toggled');
});

// ═══════════════════════════════════════════════════════════════
// Block 1: Listener Structure
// ═══════════════════════════════════════════════════════════════
describe('configRevalidationListener Structure', () => {

  // T-CRL01: configRevalidationListener is a function
  it('T-CRL01: configRevalidationListener is a function', () => {
    assert.strictEqual(typeof configRevalidationListener, 'function');
  });

  // T-CRL02: registerConfigRevalidationListener is a function
  it('T-CRL02: registerConfigRevalidationListener is a function', () => {
    assert.strictEqual(typeof registerConfigRevalidationListener, 'function');
  });

  // T-CRL03: listener does not throw when called with valid data
  it('T-CRL03: listener does not throw with valid data', () => {
    assert.doesNotThrow(() => configRevalidationListener({
      section: 'FEEDBACK',
      enabled: true,
      previousValue: false,
      timestamp: Date.now(),
    }));
  });
});

// ═══════════════════════════════════════════════════════════════
// Block 2: Behavior
// ═══════════════════════════════════════════════════════════════
describe('configRevalidationListener Behavior', () => {

  // T-CRL04: listener calls configValidator.revalidate() (verify lastResult changes)
  it('T-CRL04: listener triggers revalidate — lastResult gets populated', () => {
    assert.strictEqual(configValidator.counts().lastResult, null, 'should be null before');
    configRevalidationListener({ section: 'FEEDBACK', enabled: true, previousValue: false, timestamp: Date.now() });
    assert.ok(configValidator.counts().lastResult !== null, 'lastResult should be populated after listener call');
    assert.strictEqual(typeof configValidator.counts().lastResult.valid, 'boolean');
  });

  // T-CRL05: listener handles missing data.section gracefully (no throw)
  it('T-CRL05: handles missing data.section gracefully', () => {
    assert.doesNotThrow(() => configRevalidationListener({ enabled: true }));
  });

  // T-CRL06: listener handles null data gracefully (no throw)
  it('T-CRL06: handles null data gracefully', () => {
    assert.doesNotThrow(() => configRevalidationListener(null));
  });

  // T-CRL07: listener handles undefined data gracefully (no throw)
  it('T-CRL07: handles undefined data gracefully', () => {
    assert.doesNotThrow(() => configRevalidationListener(undefined));
  });

  // T-CRL08: registerConfigRevalidationListener registers on eventBus
  it('T-CRL08: register adds listener to feature:toggled event', () => {
    const beforeCount = (eventBus.listenerCounts()['feature:toggled'] || 0);
    registerConfigRevalidationListener();
    const afterCount = (eventBus.listenerCounts()['feature:toggled'] || 0);
    assert.strictEqual(afterCount, beforeCount + 1, 'should add one listener');
  });
});
