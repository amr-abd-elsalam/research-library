// tests/config-validator.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 79 — ConfigValidator Tests
// Tests cross-section config validation rules, structure,
// counts(), reset(), and idempotency.
// No network calls — tests pure config validation logic.
// ═══════════════════════════════════════════════════════════════

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { ConfigValidator, configValidator } from '../server/services/configValidator.js';
import config from '../config.js';

// ── Cleanup ───────────────────────────────────────────────────
afterEach(() => {
  configValidator.reset();
});

// ═══════════════════════════════════════════════════════════════
// Block 1: ConfigValidator Structure
// ═══════════════════════════════════════════════════════════════
describe('ConfigValidator Structure', () => {

  // T-CV01: ConfigValidator is a class with validate() method
  it('T-CV01: ConfigValidator is a class with validate() method', () => {
    assert.strictEqual(typeof ConfigValidator, 'function', 'ConfigValidator should be a constructor');
    const instance = new ConfigValidator();
    assert.strictEqual(typeof instance.validate, 'function', 'should have validate method');
  });

  // T-CV02: validate() returns { valid, errors, warnings, checkedAt } shape
  it('T-CV02: validate() returns correct shape', () => {
    const result = configValidator.validate();
    assert.strictEqual(typeof result.valid, 'boolean', 'valid should be boolean');
    assert.ok(Array.isArray(result.errors), 'errors should be array');
    assert.ok(Array.isArray(result.warnings), 'warnings should be array');
    assert.strictEqual(typeof result.checkedAt, 'number', 'checkedAt should be number');
  });

  // T-CV03: counts() returns { totalRules, lastResult } shape
  it('T-CV03: counts() returns correct shape', () => {
    const counts = configValidator.counts();
    assert.strictEqual(typeof counts.totalRules, 'number', 'totalRules should be number');
    assert.ok('lastResult' in counts, 'should have lastResult key');
  });

  // T-CV04: counts().totalRules is 7
  it('T-CV04: counts().totalRules is 7', () => {
    const counts = configValidator.counts();
    assert.strictEqual(counts.totalRules, 7, 'should have 7 validation rules');
  });

  // T-CV05: reset() clears lastResult to null
  it('T-CV05: reset() clears lastResult to null', () => {
    configValidator.validate(); // populate lastResult
    assert.ok(configValidator.counts().lastResult !== null, 'should have result after validate');
    configValidator.reset();
    assert.strictEqual(configValidator.counts().lastResult, null, 'lastResult should be null after reset');
  });
});

// ═══════════════════════════════════════════════════════════════
// Block 2: Default Config Validation
// ═══════════════════════════════════════════════════════════════
describe('Default Config Validation', () => {

  // T-CV06: Clean default config passes validation (valid: true, 0 errors)
  it('T-CV06: default config passes validation with 0 errors', () => {
    const result = configValidator.validate();
    assert.strictEqual(result.valid, true, 'default config should be valid');
    assert.strictEqual(result.errors.length, 0, 'should have 0 errors');
  });

  // T-CV07: Default config has 0 warnings (all features disabled by default)
  it('T-CV07: default config has 0 warnings', () => {
    const result = configValidator.validate();
    assert.strictEqual(result.warnings.length, 0, 'default config with all features disabled should have 0 warnings');
  });

  // T-CV08: validate() can be called multiple times (idempotent)
  it('T-CV08: validate() is idempotent', () => {
    const result1 = configValidator.validate();
    const result2 = configValidator.validate();
    assert.strictEqual(result1.valid, result2.valid, 'results should be consistent');
    assert.strictEqual(result1.errors.length, result2.errors.length, 'error count should be consistent');
    assert.strictEqual(result1.warnings.length, result2.warnings.length, 'warning count should be consistent');
  });
});

// ═══════════════════════════════════════════════════════════════
// Block 3: Validation Rules Detail
// ═══════════════════════════════════════════════════════════════
describe('Validation Rules Detail', () => {

  // T-CV09: Rule names are all strings
  it('T-CV09: all rules return valid shape on default config', () => {
    // With default config, all rules should pass (ok: true)
    const result = configValidator.validate();
    assert.strictEqual(result.valid, true);
  });

  // T-CV10: errors array contains descriptive strings when present
  it('T-CV10: errors array contains strings', () => {
    const result = configValidator.validate();
    for (const err of result.errors) {
      assert.strictEqual(typeof err, 'string', 'each error should be a string');
    }
  });

  // T-CV11: warnings array contains descriptive strings when present
  it('T-CV11: warnings array contains strings', () => {
    const result = configValidator.validate();
    for (const warn of result.warnings) {
      assert.strictEqual(typeof warn, 'string', 'each warning should be a string');
    }
  });

  // T-CV12: validate().checkedAt is a recent timestamp
  it('T-CV12: checkedAt is a recent timestamp', () => {
    const before = Date.now();
    const result = configValidator.validate();
    const after = Date.now();
    assert.ok(result.checkedAt >= before, 'checkedAt should be >= before');
    assert.ok(result.checkedAt <= after, 'checkedAt should be <= after');
  });

  // T-CV13: validate().valid is boolean
  it('T-CV13: valid is boolean', () => {
    const result = configValidator.validate();
    assert.strictEqual(typeof result.valid, 'boolean');
  });

  // T-CV14: validate() after reset() returns fresh result
  it('T-CV14: validate() after reset() returns fresh result', () => {
    configValidator.validate();
    configValidator.reset();
    assert.strictEqual(configValidator.counts().lastResult, null);
    const fresh = configValidator.validate();
    assert.ok(fresh.checkedAt > 0, 'fresh result should have valid checkedAt');
  });

  // T-CV15: New ConfigValidator instances have null lastResult
  it('T-CV15: new instances have null lastResult', () => {
    const instance = new ConfigValidator();
    assert.strictEqual(instance.counts().lastResult, null);
    assert.strictEqual(instance.counts().totalRules, 7);
  });
});

// ═══════════════════════════════════════════════════════════════
// Block 4: revalidate() Method (Phase 80)
// ═══════════════════════════════════════════════════════════════
describe('ConfigValidator revalidate()', () => {

  // T-CV16: revalidate() is a method on ConfigValidator
  it('T-CV16: revalidate is a method', () => {
    assert.strictEqual(typeof configValidator.revalidate, 'function');
  });

  // T-CV17: revalidate() returns { result, changed, newErrors, newWarnings } shape
  it('T-CV17: revalidate returns correct shape', () => {
    const rv = configValidator.revalidate();
    assert.strictEqual(typeof rv.result, 'object', 'result should be object');
    assert.strictEqual(typeof rv.changed, 'boolean', 'changed should be boolean');
    assert.ok(Array.isArray(rv.newErrors), 'newErrors should be array');
    assert.ok(Array.isArray(rv.newWarnings), 'newWarnings should be array');
    assert.strictEqual(typeof rv.result.valid, 'boolean', 'result.valid should be boolean');
    assert.ok(Array.isArray(rv.result.errors), 'result.errors should be array');
    assert.ok(Array.isArray(rv.result.warnings), 'result.warnings should be array');
    assert.strictEqual(typeof rv.result.checkedAt, 'number', 'result.checkedAt should be number');
  });

  // T-CV18: revalidate() returns changed=false when called twice with same config
  it('T-CV18: revalidate twice returns changed=false on second call', () => {
    const first = configValidator.revalidate();
    const second = configValidator.revalidate();
    assert.strictEqual(second.changed, false, 'should not change on identical config');
    assert.strictEqual(second.newErrors.length, 0);
    assert.strictEqual(second.newWarnings.length, 0);
  });

  // T-CV19: revalidate() result.valid is boolean
  it('T-CV19: result.valid is boolean', () => {
    const rv = configValidator.revalidate();
    assert.strictEqual(typeof rv.result.valid, 'boolean');
  });

  // T-CV20: revalidate() after reset() returns changed=true (no previous)
  it('T-CV20: after reset, revalidate returns changed=true', () => {
    configValidator.validate(); // populate lastResult
    configValidator.reset();    // clear it
    const rv = configValidator.revalidate();
    assert.strictEqual(rv.changed, true, 'should be changed when no previous result exists');
  });
});
