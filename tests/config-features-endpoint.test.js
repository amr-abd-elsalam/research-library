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
const SECTIONS = ['ADMIN_INTELLIGENCE', 'FEEDBACK', 'SUGGESTIONS', 'CONTENT_GAPS', 'QUALITY', 'HEALTH_SCORE', 'RETRIEVAL', 'QUERY_COMPLEXITY', 'GROUNDING', 'CITATION', 'SEMANTIC_MATCHING', 'ANSWER_REFINEMENT', 'QUERY_PLANNING', 'RAG_STRATEGIES'];

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

  // T-CF02: returns all 15 feature sections (Phase 85: was 14, +RAG_STRATEGIES)
  it('T-CF02: returns all 15 feature sections', async () => {
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
    assert.ok('RAG_STRATEGIES' in data);
    assert.strictEqual(Object.keys(data).length, 15, 'should have exactly 15 feature fields');
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

  // T-CF04: defaults match config (Phase 97: +ADMIN_INTELLIGENCE/CONTENT_GAPS/QUALITY/HEALTH_SCORE now true)
  it('T-CF04: defaults match config', async () => {
    const res = createMockRes();
    await handleConfigFeatures({}, res);
    const data = res.json;
    assert.strictEqual(data.ADMIN_INTELLIGENCE, true);  // Phase 97: enabled by default
    assert.strictEqual(data.FEEDBACK, true);             // Phase 90: enabled by default
    assert.strictEqual(data.SUGGESTIONS, true);          // Phase 90: enabled by default
    assert.strictEqual(data.CONTENT_GAPS, true);         // Phase 97: enabled by default
    assert.strictEqual(data.QUALITY, true);              // Phase 97: enabled by default
    assert.strictEqual(data.HEALTH_SCORE, true);         // Phase 97: enabled by default
    assert.strictEqual(data.RETRIEVAL, true);             // Phase 98: enabled by default
    assert.strictEqual(data.QUERY_COMPLEXITY, true);      // Phase 98: enabled by default
    assert.strictEqual(data.GROUNDING, true);             // Phase 90: enabled by default
    assert.strictEqual(data.CITATION, true);             // Phase 90: enabled by default
    assert.strictEqual(data.QUERY_PLANNING, true);        // Phase 99: enabled by default
    assert.strictEqual(data.RAG_STRATEGIES, true);         // Phase 100: enabled by default
    assert.strictEqual(data.SEMANTIC_MATCHING, true);     // Phase 102: enabled by default
    assert.strictEqual(data.ANSWER_REFINEMENT, true);    // Phase 101: enabled by default
    assert.strictEqual(data.COST_GOVERNANCE, true);       // Phase 101: enabled by default
  });

  // T-CF05: reflects runtime override (Phase 90: SUGGESTIONS now true by default)
  it('T-CF05: reflects runtime override', async () => {
    featureFlags.setOverride('FEEDBACK', false);
    const res = createMockRes();
    await handleConfigFeatures({}, res);
    const data = res.json;
    assert.strictEqual(data.FEEDBACK, false);    // overridden to false
    assert.strictEqual(data.SUGGESTIONS, true);  // Phase 90: config default is now true
  });

  // T-CF06: override removed — reverts to config value (Phase 97: QUALITY default is now true)
  it('T-CF06: reverts when override is cleared', async () => {
    featureFlags.setOverride('QUALITY', false);

    let res = createMockRes();
    await handleConfigFeatures({}, res);
    assert.strictEqual(res.json.QUALITY, false);

    featureFlags.clearOverride('QUALITY');

    res = createMockRes();
    await handleConfigFeatures({}, res);
    assert.strictEqual(res.json.QUALITY, true);  // Phase 97: config default is now true
  });

});
