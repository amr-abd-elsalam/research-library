// tests/feature-flags.test.js
// ═══════════════════════════════════════════════════════════════
// Phase T — FeatureFlags priority logic tests
// Tests: override > config, case insensitivity, cleanup, getStatus.
// Uses the singleton instance (config defaults all false).
// ═══════════════════════════════════════════════════════════════

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { featureFlags } from '../server/services/featureFlags.js';

// ── Cleanup helper — clear all overrides after each test ────────
const SECTIONS = ['FEEDBACK', 'SUGGESTIONS', 'CONTENT_GAPS', 'QUALITY', 'HEALTH_SCORE', 'ADMIN_INTELLIGENCE', 'RETRIEVAL', 'QUERY_COMPLEXITY', 'GROUNDING', 'CITATION', 'SEMANTIC_MATCHING'];

describe('FeatureFlags', () => {

  afterEach(() => {
    for (const section of SECTIONS) {
      featureFlags.clearOverride(section);
    }
  });

  // T-FF01: isEnabled — no override, config default false
  it('T-FF01: returns false when no override and config defaults to false', () => {
    // All 5 sections default to enabled: false in config.js
    assert.strictEqual(featureFlags.isEnabled('FEEDBACK'), false);
    assert.strictEqual(featureFlags.isEnabled('SUGGESTIONS'), false);
    assert.strictEqual(featureFlags.isEnabled('CONTENT_GAPS'), false);
    assert.strictEqual(featureFlags.isEnabled('QUALITY'), false);
    assert.strictEqual(featureFlags.isEnabled('HEALTH_SCORE'), false);
  });

  // T-FF02: isEnabled — no override, config value (all defaults are false)
  it('T-FF02: returns config value when no override is set', () => {
    // Since all 5 sections are false in config.js defaults, this just confirms
    const result = featureFlags.isEnabled('FEEDBACK');
    assert.strictEqual(typeof result, 'boolean');
  });

  // T-FF03: isEnabled — override true, config false → true (override wins)
  it('T-FF03: override true wins over config false', () => {
    assert.strictEqual(featureFlags.isEnabled('FEEDBACK'), false);
    featureFlags.setOverride('FEEDBACK', true);
    assert.strictEqual(featureFlags.isEnabled('FEEDBACK'), true);
  });

  // T-FF04: isEnabled — override false, config false → false (override wins, same value)
  it('T-FF04: override false keeps feature disabled', () => {
    featureFlags.setOverride('FEEDBACK', false);
    assert.strictEqual(featureFlags.isEnabled('FEEDBACK'), false);
  });

  // T-FF05: isEnabled — unknown section → false
  it('T-FF05: returns false for unknown section', () => {
    assert.strictEqual(featureFlags.isEnabled('NONEXISTENT_SECTION'), false);
  });

  // T-FF06: isEnabled — case insensitive
  it('T-FF06: is case insensitive', () => {
    featureFlags.setOverride('feedback', true);
    assert.strictEqual(featureFlags.isEnabled('FEEDBACK'), true);
    assert.strictEqual(featureFlags.isEnabled('feedback'), true);
    assert.strictEqual(featureFlags.isEnabled('Feedback'), true);
  });

  // T-FF07: setOverride — changes isEnabled result
  it('T-FF07: setOverride changes isEnabled result', () => {
    assert.strictEqual(featureFlags.isEnabled('SUGGESTIONS'), false);
    featureFlags.setOverride('SUGGESTIONS', true);
    assert.strictEqual(featureFlags.isEnabled('SUGGESTIONS'), true);
    featureFlags.setOverride('SUGGESTIONS', false);
    assert.strictEqual(featureFlags.isEnabled('SUGGESTIONS'), false);
  });

  // T-FF08: clearOverride — reverts to config value
  it('T-FF08: clearOverride reverts to config value', () => {
    featureFlags.setOverride('QUALITY', true);
    assert.strictEqual(featureFlags.isEnabled('QUALITY'), true);
    featureFlags.clearOverride('QUALITY');
    assert.strictEqual(featureFlags.isEnabled('QUALITY'), false); // config default
  });

  // T-FF09: getOverrides — returns current overrides
  it('T-FF09: getOverrides returns current overrides', () => {
    featureFlags.setOverride('FEEDBACK', true);
    featureFlags.setOverride('QUALITY', false);
    const overrides = featureFlags.getOverrides();
    assert.strictEqual(overrides.FEEDBACK, true);
    assert.strictEqual(overrides.QUALITY, false);
    assert.strictEqual(overrides.SUGGESTIONS, undefined); // not overridden
  });

  // T-FF10: getStatus — returns all 12 sections (Phase 77: was 11, +COST_GOVERNANCE)
  it('T-FF10: getStatus returns all 12 sections', () => {
    const status = featureFlags.getStatus();
    assert.strictEqual(status.length, 12);
    const sectionNames = status.map(s => s.section);
    assert.ok(sectionNames.includes('SUGGESTIONS'));
    assert.ok(sectionNames.includes('CONTENT_GAPS'));
    assert.ok(sectionNames.includes('FEEDBACK'));
    assert.ok(sectionNames.includes('QUALITY'));
    assert.ok(sectionNames.includes('HEALTH_SCORE'));
    assert.ok(sectionNames.includes('ADMIN_INTELLIGENCE'));
    assert.ok(sectionNames.includes('RETRIEVAL'));
    assert.ok(sectionNames.includes('QUERY_COMPLEXITY'));
    assert.ok(sectionNames.includes('GROUNDING'));
    assert.ok(sectionNames.includes('CITATION'));
    assert.ok(sectionNames.includes('SEMANTIC_MATCHING'));
    assert.ok(sectionNames.includes('COST_GOVERNANCE'));
  });

  // T-FF11: getStatus — effective reflects override
  it('T-FF11: getStatus effective field reflects override', () => {
    featureFlags.setOverride('HEALTH_SCORE', true);
    const status = featureFlags.getStatus();
    const hs = status.find(s => s.section === 'HEALTH_SCORE');
    assert.strictEqual(hs.configValue, false);  // config default
    assert.strictEqual(hs.override, true);       // our override
    assert.strictEqual(hs.effective, true);      // resolved: override wins
  });

  // T-FF12: counts — returns correct structure
  it('T-FF12: counts returns correct structure', () => {
    featureFlags.setOverride('FEEDBACK', true);
    const c = featureFlags.counts();
    assert.strictEqual(typeof c.totalOverrides, 'number');
    assert.ok(c.totalOverrides >= 1);
    assert.strictEqual(c.sections, 12);
    assert.strictEqual(typeof c.persisted, 'boolean');
  });

  // T-FF13: clearOverride emits feature:toggled event
  it('T-FF13: clearOverride emits feature:toggled event', async () => {
    const { eventBus } = await import('../server/services/eventBus.js');
    let emittedData = null;
    const unsub = eventBus.on('feature:toggled', (data) => {
      // Capture only the clearOverride emission (enabled will be false for SUGGESTIONS)
      if (data.section === 'SUGGESTIONS' && data.enabled === false) {
        emittedData = data;
      }
    });

    featureFlags.setOverride('SUGGESTIONS', true);
    featureFlags.clearOverride('SUGGESTIONS');

    unsub();

    assert.ok(emittedData !== null, 'feature:toggled event should be emitted on clearOverride');
    assert.strictEqual(emittedData.section, 'SUGGESTIONS');
    assert.strictEqual(typeof emittedData.timestamp, 'number');
  });

  // T-FF14: clearOverride event has correct previousValue and enabled
  it('T-FF14: clearOverride event has correct previousValue and enabled', async () => {
    const { eventBus } = await import('../server/services/eventBus.js');
    let emittedData = null;
    const unsub = eventBus.on('feature:toggled', (data) => {
      if (data.section === 'FEEDBACK' && data.previousValue === true) {
        emittedData = data;
      }
    });

    featureFlags.setOverride('FEEDBACK', true);
    assert.strictEqual(featureFlags.isEnabled('FEEDBACK'), true);

    featureFlags.clearOverride('FEEDBACK');

    unsub();

    assert.ok(emittedData !== null, 'feature:toggled event should be emitted');
    assert.strictEqual(emittedData.previousValue, true, 'previousValue should be true (was overridden to true)');
    assert.strictEqual(emittedData.enabled, false, 'enabled should be false (config default)');
  });

});
