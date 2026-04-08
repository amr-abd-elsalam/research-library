// tests/config-features-endpoint.test.js
// ═══════════════════════════════════════════════════════════════
// Phase T — handleConfigFeatures() handler tests
// Tests the lightweight /api/config/features endpoint (Phase 46).
// Handler-level test — no HTTP server needed.
// ═══════════════════════════════════════════════════════════════

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { handleConfigFeatures } from '../server/handlers/configHandler.js';
import { featureFlags } from '../server/services/featureFlags.js';

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
const SECTIONS = ['ADMIN_INTELLIGENCE', 'FEEDBACK', 'SUGGESTIONS', 'CONTENT_GAPS', 'QUALITY', 'HEALTH_SCORE', 'RETRIEVAL', 'QUERY_COMPLEXITY', 'GROUNDING', 'CITATION', 'SEMANTIC_MATCHING', 'ANSWER_REFINEMENT', 'QUERY_PLANNING'];

describe('handleConfigFeatures()', () => {

  afterEach(() => {
    for (const s of SECTIONS) featureFlags.clearOverride(s);
  });

  // T-CF01: returns 200 with JSON content type
  it('T-CF01: returns 200 with JSON content type', async () => {
    const res = createMockRes();
    await handleConfigFeatures({}, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.headers['Content-Type'], 'application/json');
  });

  // T-CF02: returns all 14 feature sections (Phase 81: was 13, +QUERY_PLANNING)
  it('T-CF02: returns all 14 feature sections', async () => {
    const res = createMockRes();
    await handleConfigFeatures({}, res);
    const data = res.json;
    assert.ok('ADMIN_INTELLIGENCE' in data);
    assert.ok('FEEDBACK' in data);
    assert.ok('SUGGESTIONS' in data);
    assert.ok('CONTENT_GAPS' in data);
    assert.ok('QUALITY' in data);
    assert.ok('HEALTH_SCORE' in data);
    assert.ok('RETRIEVAL' in data);
    assert.ok('QUERY_COMPLEXITY' in data);
    assert.ok('GROUNDING' in data);
    assert.ok('CITATION' in data);
    assert.ok('SEMANTIC_MATCHING' in data);
    assert.ok('COST_GOVERNANCE' in data);
    assert.ok('ANSWER_REFINEMENT' in data);
    assert.ok('QUERY_PLANNING' in data);
    assert.strictEqual(Object.keys(data).length, 14, 'should have exactly 14 feature fields');
  });

  // T-CF03: all values are booleans
  it('T-CF03: all values are booleans', async () => {
    const res = createMockRes();
    await handleConfigFeatures({}, res);
    const data = res.json;
    for (const key of SECTIONS) {
      assert.strictEqual(typeof data[key], 'boolean', `${key} should be boolean`);
    }
  });

  // T-CF04: defaults match config (all false with default config)
  it('T-CF04: defaults match config (all false)', async () => {
    const res = createMockRes();
    await handleConfigFeatures({}, res);
    const data = res.json;
    // All 11 sections are false by default in config.js
    assert.strictEqual(data.ADMIN_INTELLIGENCE, false);
    assert.strictEqual(data.FEEDBACK, false);
    assert.strictEqual(data.SUGGESTIONS, false);
    assert.strictEqual(data.CONTENT_GAPS, false);
    assert.strictEqual(data.QUALITY, false);
    assert.strictEqual(data.HEALTH_SCORE, false);
    assert.strictEqual(data.RETRIEVAL, false);
    assert.strictEqual(data.QUERY_COMPLEXITY, false);
    assert.strictEqual(data.GROUNDING, false);
    assert.strictEqual(data.CITATION, false);
    assert.strictEqual(data.SEMANTIC_MATCHING, false);
  });

  // T-CF05: reflects runtime override
  it('T-CF05: reflects runtime override', async () => {
    featureFlags.setOverride('FEEDBACK', true);
    const res = createMockRes();
    await handleConfigFeatures({}, res);
    const data = res.json;
    assert.strictEqual(data.FEEDBACK, true);
    assert.strictEqual(data.SUGGESTIONS, false); // not overridden
  });

  // T-CF06: override removed — reverts to config value
  it('T-CF06: reverts when override is cleared', async () => {
    featureFlags.setOverride('QUALITY', true);

    let res = createMockRes();
    await handleConfigFeatures({}, res);
    assert.strictEqual(res.json.QUALITY, true);

    featureFlags.clearOverride('QUALITY');

    res = createMockRes();
    await handleConfigFeatures({}, res);
    assert.strictEqual(res.json.QUALITY, false);
  });

});
