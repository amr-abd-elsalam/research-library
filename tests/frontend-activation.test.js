// tests/frontend-activation.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 90 — Frontend Feature Activation Tests
// Verifies new config defaults + feature flag resolution + endpoint shape.
// ═══════════════════════════════════════════════════════════════

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import config from '../config.js';
import { featureFlags } from '../server/services/featureFlags.js';
import { handleConfigFeatures } from '../server/handlers/configHandler.js';

// ── Mock response object ──────────────────────────────────────
function createMockRes() {
  let _status = 0;
  let _headers = {};
  let _body = '';
  return {
    writeHead(status, headers) { _status = status; _headers = headers || {}; },
    end(body) { _body = body || ''; },
    get statusCode() { return _status; },
    get headers() { return _headers; },
    get body() { return _body; },
    get json() { return JSON.parse(_body); },
  };
}

// ── Cleanup ───────────────────────────────────────────────────
const TOGGLE_SECTIONS = ['FEEDBACK', 'GROUNDING', 'CITATION', 'SUGGESTIONS'];

// ═══════════════════════════════════════════════════════════════
// Block 1: Config Default Verification (T-FA01 to T-FA05)
// ═══════════════════════════════════════════════════════════════
describe('Frontend Activation — Config Defaults', () => {

  // T-FA01: config.FEEDBACK.enabled === true
  it('T-FA01: config.FEEDBACK.enabled is true', () => {
    assert.strictEqual(config.FEEDBACK.enabled, true);
  });

  // T-FA02: config.GROUNDING.enabled === true
  it('T-FA02: config.GROUNDING.enabled is true', () => {
    assert.strictEqual(config.GROUNDING.enabled, true);
  });

  // T-FA03: config.CITATION.enabled === true
  it('T-FA03: config.CITATION.enabled is true', () => {
    assert.strictEqual(config.CITATION.enabled, true);
  });

  // T-FA04: config.SUGGESTIONS.enabled === true
  it('T-FA04: config.SUGGESTIONS.enabled is true', () => {
    assert.strictEqual(config.SUGGESTIONS.enabled, true);
  });

  // T-FA05: config.SESSIONS.enabled === true
  it('T-FA05: config.SESSIONS.enabled is true', () => {
    assert.strictEqual(config.SESSIONS.enabled, true);
  });
});

// ═══════════════════════════════════════════════════════════════
// Block 2: Feature Flag Resolution (T-FA06 to T-FA10)
// ═══════════════════════════════════════════════════════════════
describe('Frontend Activation — Feature Flag Resolution', () => {

  afterEach(() => {
    for (const s of TOGGLE_SECTIONS) featureFlags.clearOverride(s);
  });

  // T-FA06: featureFlags.isEnabled('FEEDBACK') === true (no override needed)
  it('T-FA06: featureFlags.isEnabled(FEEDBACK) is true by default', () => {
    assert.strictEqual(featureFlags.isEnabled('FEEDBACK'), true);
  });

  // T-FA07: featureFlags.isEnabled('GROUNDING') === true
  it('T-FA07: featureFlags.isEnabled(GROUNDING) is true by default', () => {
    assert.strictEqual(featureFlags.isEnabled('GROUNDING'), true);
  });

  // T-FA08: featureFlags.isEnabled('CITATION') === true
  it('T-FA08: featureFlags.isEnabled(CITATION) is true by default', () => {
    assert.strictEqual(featureFlags.isEnabled('CITATION'), true);
  });

  // T-FA09: featureFlags.isEnabled('SUGGESTIONS') === true
  it('T-FA09: featureFlags.isEnabled(SUGGESTIONS) is true by default', () => {
    assert.strictEqual(featureFlags.isEnabled('SUGGESTIONS'), true);
  });

  // T-FA10: handleConfigFeatures returns FEEDBACK/GROUNDING/CITATION/SUGGESTIONS all true
  it('T-FA10: handleConfigFeatures returns 4 features as true', async () => {
    const res = createMockRes();
    await handleConfigFeatures({}, res);
    const data = res.json;
    assert.strictEqual(data.FEEDBACK, true);
    assert.strictEqual(data.GROUNDING, true);
    assert.strictEqual(data.CITATION, true);
    assert.strictEqual(data.SUGGESTIONS, true);
  });
});

// ═══════════════════════════════════════════════════════════════
// Block 3: Config Shape Verification (T-FA11 to T-FA15)
// ═══════════════════════════════════════════════════════════════
describe('Frontend Activation — Config Shape', () => {

  // T-FA11: FEEDBACK section has all required fields
  it('T-FA11: FEEDBACK section has required fields', () => {
    assert.strictEqual(typeof config.FEEDBACK.enabled, 'boolean');
    assert.strictEqual(typeof config.FEEDBACK.allowComments, 'boolean');
    assert.strictEqual(typeof config.FEEDBACK.maxCommentLength, 'number');
  });

  // T-FA12: GROUNDING section has all required fields
  it('T-FA12: GROUNDING section has required fields', () => {
    assert.strictEqual(typeof config.GROUNDING.enabled, 'boolean');
    assert.strictEqual(typeof config.GROUNDING.minGroundingScore, 'number');
    assert.strictEqual(typeof config.GROUNDING.warnUser, 'boolean');
  });

  // T-FA13: CITATION section has all required fields
  it('T-FA13: CITATION section has required fields', () => {
    assert.strictEqual(typeof config.CITATION.enabled, 'boolean');
    assert.strictEqual(typeof config.CITATION.maxCitations, 'number');
    assert.strictEqual(typeof config.CITATION.minOverlap, 'number');
  });

  // T-FA14: SESSIONS section has all required fields
  it('T-FA14: SESSIONS section has required fields', () => {
    assert.strictEqual(typeof config.SESSIONS.enabled, 'boolean');
    assert.strictEqual(typeof config.SESSIONS.maxMessages, 'number');
    assert.strictEqual(typeof config.SESSIONS.ttlDays, 'number');
  });

  // T-FA15: SUGGESTIONS section has all required fields
  it('T-FA15: SUGGESTIONS section has required fields', () => {
    assert.strictEqual(typeof config.SUGGESTIONS.enabled, 'boolean');
    assert.strictEqual(typeof config.SUGGESTIONS.maxSuggestions, 'number');
    assert.strictEqual(typeof config.SUGGESTIONS.minTurns, 'number');
  });
});
