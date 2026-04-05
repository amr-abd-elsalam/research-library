// tests/integration-http.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 56 — Handler Integration Tests with Real HTTP
// Tests the full middleware chain (CORS → rate limit → auth →
// validate → handler → response) via real HTTP requests.
// Does NOT require external services (Qdrant, Gemini).
// ═══════════════════════════════════════════════════════════════

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestServer } from './helpers/test-server.js';

// ── Admin token must match what test-server.js sets ───────────
const ADMIN_TOKEN = 'test-admin-token-phase56';

// ── Helper: POST JSON ─────────────────────────────────────────
async function postJSON(url, body, extraHeaders = {}) {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
    body: JSON.stringify(body),
  });
}

// ═══════════════════════════════════════════════════════════════
// Block 1: Health & Readiness
// ═══════════════════════════════════════════════════════════════
describe('Integration HTTP — Health & Readiness', () => {
  let ts;

  before(async () => { ts = await createTestServer(); });
  after(async () => { await ts.close(); });

  // T-IH01: GET /api/health — returns JSON with 'status' field
  it('T-IH01: GET /api/health — returns JSON body with status field', async () => {
    const res = await fetch(`${ts.baseUrl}/api/health`);
    assert.ok([200, 207].includes(res.status), `expected 200 or 207, got ${res.status}`);
    const data = await res.json();
    assert.ok('status' in data, 'response should contain status field');
    assert.ok(['ok', 'degraded'].includes(data.status), `status should be ok or degraded, got ${data.status}`);
  });

  // T-IH02: GET /api/health — Content-Type is application/json
  it('T-IH02: GET /api/health — Content-Type is application/json', async () => {
    const res = await fetch(`${ts.baseUrl}/api/health`);
    const ct = res.headers.get('content-type');
    assert.ok(ct && ct.includes('application/json'), `Content-Type should include application/json, got ${ct}`);
  });

  // T-IH03: GET /api/health/ready — returns readiness payload
  it('T-IH03: GET /api/health/ready — returns readiness payload', async () => {
    const res = await fetch(`${ts.baseUrl}/api/health/ready`);
    assert.ok([200, 503].includes(res.status), `expected 200 or 503, got ${res.status}`);
    const data = await res.json();
    assert.ok('ready' in data, 'response should contain ready field');
    assert.ok('stages' in data, 'response should contain stages field');
    assert.ok(Array.isArray(data.stages), 'stages should be an array');
  });

  // T-IH04: GET /api/health — response includes system info
  it('T-IH04: GET /api/health — response includes system and brand info', async () => {
    const res = await fetch(`${ts.baseUrl}/api/health`);
    const data = await res.json();
    assert.ok('system' in data, 'response should contain system field');
    assert.ok('brand' in data, 'response should contain brand field');
    assert.ok('timestamp' in data, 'response should contain timestamp field');
  });
});

// ═══════════════════════════════════════════════════════════════
// Block 2: Config & Features
// ═══════════════════════════════════════════════════════════════
describe('Integration HTTP — Config & Features', () => {
  let ts;

  before(async () => { ts = await createTestServer(); });
  after(async () => { await ts.close(); });

  // T-IH05: GET /api/config — returns 200 with BRAND and CHAT sections
  it('T-IH05: GET /api/config — returns 200 with BRAND and CHAT sections', async () => {
    const res = await fetch(`${ts.baseUrl}/api/config`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok('BRAND' in data, 'response should contain BRAND');
    assert.ok('CHAT' in data, 'response should contain CHAT');
    assert.ok('FEEDBACK' in data, 'response should contain FEEDBACK');
  });

  // T-IH06: GET /api/config/features — returns 200 with 5 boolean feature flags
  it('T-IH06: GET /api/config/features — returns 200 with 5 boolean flags', async () => {
    const res = await fetch(`${ts.baseUrl}/api/config/features`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    const expectedKeys = ['FEEDBACK', 'SUGGESTIONS', 'CONTENT_GAPS', 'QUALITY', 'HEALTH_SCORE'];
    for (const key of expectedKeys) {
      assert.ok(key in data, `response should contain ${key}`);
      assert.strictEqual(typeof data[key], 'boolean', `${key} should be boolean`);
    }
  });

  // T-IH07: Routing safety — /api/config and /api/config/features return different responses
  it('T-IH07: /api/config and /api/config/features return different responses', async () => {
    const [configRes, featuresRes] = await Promise.all([
      fetch(`${ts.baseUrl}/api/config`),
      fetch(`${ts.baseUrl}/api/config/features`),
    ]);
    const configData = await configRes.json();
    const featuresData = await featuresRes.json();
    assert.ok('BRAND' in configData, '/api/config should have BRAND');
    assert.ok(!('BRAND' in featuresData), '/api/config/features should NOT have BRAND');
  });

  // T-IH08: GET /api/config — does NOT include SYSTEM_PROMPT (backend-only)
  it('T-IH08: GET /api/config — does NOT include SYSTEM_PROMPT', async () => {
    const res = await fetch(`${ts.baseUrl}/api/config`);
    const data = await res.json();
    assert.ok(!('SYSTEM_PROMPT' in data), 'SYSTEM_PROMPT should not be exposed to client');
    assert.ok(!('PIPELINE' in data), 'PIPELINE should not be exposed to client');
    assert.ok(!('CONTEXT' in data), 'CONTEXT should not be exposed to client');
    assert.ok(!('FOLLOWUP' in data), 'FOLLOWUP should not be exposed to client');
  });

  // T-IH39: GET /api/config — response contains dynamicSuggestions field (Phase 59)
  it('T-IH39: GET /api/config — response contains dynamicSuggestions field', async () => {
    const res = await fetch(`${ts.baseUrl}/api/config`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok('dynamicSuggestions' in data, 'response should contain dynamicSuggestions field');
  });

  // T-IH40: GET /api/config — dynamicSuggestions is null or array (never undefined)
  it('T-IH40: GET /api/config — dynamicSuggestions is null or array', async () => {
    const res = await fetch(`${ts.baseUrl}/api/config`);
    const data = await res.json();
    const val = data.dynamicSuggestions;
    const valid = val === null || Array.isArray(val);
    assert.ok(valid, `dynamicSuggestions should be null or array, got ${typeof val}: ${JSON.stringify(val)}`);
  });
});

// ═══════════════════════════════════════════════════════════════
// Block 3: Public Routes
// ═══════════════════════════════════════════════════════════════
describe('Integration HTTP — Public Routes', () => {
  let ts;

  before(async () => { ts = await createTestServer(); });
  after(async () => { await ts.close(); });

  // T-IH09: GET /api/commands — returns 200 with command data
  it('T-IH09: GET /api/commands — returns 200 with command data', async () => {
    const res = await fetch(`${ts.baseUrl}/api/commands`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(typeof data === 'object', 'response should be an object');
  });

  // T-IH10: GET /api/nonexistent — returns 404 with standard error
  it('T-IH10: GET /api/nonexistent — returns 404 with NOT_FOUND code', async () => {
    const res = await fetch(`${ts.baseUrl}/api/nonexistent`);
    assert.strictEqual(res.status, 404);
    const data = await res.json();
    assert.strictEqual(data.error, 'Not Found');
    assert.strictEqual(data.code, 'NOT_FOUND');
  });

  // T-IH11: POST on GET-only route — returns 404
  it('T-IH11: POST /api/commands — returns 404 (method not allowed)', async () => {
    const res = await postJSON(`${ts.baseUrl}/api/commands`, {});
    assert.strictEqual(res.status, 404);
  });

  // T-IH12: OPTIONS preflight on /api/chat — returns 204
  it('T-IH12: OPTIONS preflight — returns 204', async () => {
    const res = await fetch(`${ts.baseUrl}/api/chat`, {
      method: 'OPTIONS',
    });
    assert.strictEqual(res.status, 204);
  });
});

// ═══════════════════════════════════════════════════════════════
// Block 4: Admin Auth Rejection
// ═══════════════════════════════════════════════════════════════
describe('Integration HTTP — Admin Auth Rejection', () => {
  let ts;

  before(async () => { ts = await createTestServer(); });
  after(async () => { await ts.close(); });

  // T-IH13: GET /api/admin/stats without Authorization — returns 401
  it('T-IH13: GET /api/admin/stats without auth — returns 401', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/stats`);
    assert.strictEqual(res.status, 401);
    const data = await res.json();
    assert.strictEqual(data.code, 'AUTH_REQUIRED');
  });

  // T-IH14: GET /api/admin/inspect without Authorization — returns 401
  it('T-IH14: GET /api/admin/inspect without auth — returns 401', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/inspect`);
    assert.strictEqual(res.status, 401);
  });

  // T-IH15: GET /api/admin/metrics without Authorization — returns 401
  it('T-IH15: GET /api/admin/metrics without auth — returns 401', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/metrics`);
    assert.strictEqual(res.status, 401);
  });

  // T-IH16: GET /api/admin/feedback without Authorization — returns 401
  it('T-IH16: GET /api/admin/feedback without auth — returns 401', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/feedback`);
    assert.strictEqual(res.status, 401);
  });

  // T-IH17: GET /api/admin/stats WITH valid token — returns non-401/403
  it('T-IH17: GET /api/admin/stats with valid token — passes auth (non-401)', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/stats`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.notStrictEqual(res.status, 401, 'should not be 401 with valid token');
    assert.notStrictEqual(res.status, 403, 'should not be 403 with valid token');
  });

  // T-IH18: GET /api/admin/stats with WRONG token — returns 403
  it('T-IH18: GET /api/admin/stats with wrong token — returns 403', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/stats`, {
      headers: { 'Authorization': 'Bearer wrong-token-12345' },
    });
    assert.strictEqual(res.status, 403);
    const data = await res.json();
    assert.strictEqual(data.code, 'INVALID_TOKEN');
  });

  // T-IH19: Admin endpoints with valid token — inspect returns 200
  it('T-IH19: GET /api/admin/inspect with valid token — returns 200', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/inspect`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok('config' in data, 'inspect should contain config section');
    assert.ok('commands' in data, 'inspect should contain commands section');
    assert.ok('eventBus' in data, 'inspect should contain eventBus section');
  });
});

// ═══════════════════════════════════════════════════════════════
// Block 5: Body Validation
// ═══════════════════════════════════════════════════════════════
describe('Integration HTTP — Body Validation', () => {
  let ts;

  before(async () => { ts = await createTestServer(); });
  after(async () => { await ts.close(); });

  // T-IH20: POST /api/chat with empty body {} — returns 400 (missing message)
  it('T-IH20: POST /api/chat with {} — returns 400 (missing message)', async () => {
    const res = await postJSON(`${ts.baseUrl}/api/chat`, {});
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.strictEqual(data.code, 'VALIDATION_ERROR');
  });

  // T-IH21: POST /api/chat with { message: '' } — returns 400 (empty message)
  it('T-IH21: POST /api/chat with empty message — returns 400', async () => {
    const res = await postJSON(`${ts.baseUrl}/api/chat`, { message: '' });
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.strictEqual(data.code, 'VALIDATION_ERROR');
  });

  // T-IH22: POST /api/suggestion-click with {} — returns 400 (missing text)
  it('T-IH22: POST /api/suggestion-click with {} — returns 400', async () => {
    const res = await postJSON(`${ts.baseUrl}/api/suggestion-click`, {});
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.strictEqual(data.code, 'VALIDATION_ERROR');
  });

  // T-IH23: POST /api/feedback with {} — returns 400 (missing correlationId)
  it('T-IH23: POST /api/feedback with {} — returns 400', async () => {
    const res = await postJSON(`${ts.baseUrl}/api/feedback`, {});
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.strictEqual(data.code, 'VALIDATION_ERROR');
  });

  // T-IH24: POST /api/chat with no Content-Type — returns 415
  it('T-IH24: POST /api/chat without Content-Type — returns 415', async () => {
    const res = await fetch(`${ts.baseUrl}/api/chat`, {
      method: 'POST',
      body: '{"message":"test"}',
    });
    assert.strictEqual(res.status, 415);
    const data = await res.json();
    assert.strictEqual(data.code, 'VALIDATION_ERROR');
  });

  // T-IH25: POST /api/suggestion-click with valid body — returns 200
  it('T-IH25: POST /api/suggestion-click with valid text — returns 200', async () => {
    const res = await postJSON(`${ts.baseUrl}/api/suggestion-click`, { text: 'test suggestion' });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.ok, true);
  });

  // T-IH26: POST /api/feedback with valid body — returns 404 when feedback disabled
  it('T-IH26: POST /api/feedback with valid body — returns 404 (feedback disabled)', async () => {
    const res = await postJSON(`${ts.baseUrl}/api/feedback`, {
      correlationId: 'test-corr-id',
      rating: 'positive',
    });
    assert.strictEqual(res.status, 404);
  });
});

// ═══════════════════════════════════════════════════════════════
// Block 6: CORS Behavior
// ═══════════════════════════════════════════════════════════════
describe('Integration HTTP — CORS Behavior', () => {
  let ts;

  before(async () => { ts = await createTestServer(); });
  after(async () => { await ts.close(); });

  // T-IH27: Request without Origin header — no CORS rejection, Vary header set
  it('T-IH27: Request without Origin — passes through (no CORS block)', async () => {
    const res = await fetch(`${ts.baseUrl}/api/config`);
    assert.strictEqual(res.status, 200);
    const vary = res.headers.get('vary');
    assert.ok(vary && vary.includes('Origin'), `Vary header should include Origin, got ${vary}`);
  });

  // T-IH28: Request with localhost Origin in dev — CORS headers present
  it('T-IH28: Request with localhost Origin — CORS headers set', async () => {
    const res = await fetch(`${ts.baseUrl}/api/config`, {
      headers: { 'Origin': 'http://localhost:3000' },
    });
    assert.strictEqual(res.status, 200);
    const acao = res.headers.get('access-control-allow-origin');
    assert.ok(acao, 'Access-Control-Allow-Origin should be set');
    assert.strictEqual(acao, 'http://localhost:3000');
  });

  // T-IH29: Request with foreign Origin — returns 403 CORS_REJECTED
  it('T-IH29: Request with foreign Origin — returns 403 CORS_REJECTED', async () => {
    const res = await fetch(`${ts.baseUrl}/api/config`, {
      headers: { 'Origin': 'https://evil-site.com' },
    });
    assert.strictEqual(res.status, 403);
    const data = await res.json();
    assert.strictEqual(data.code, 'CORS_REJECTED');
  });

  // T-IH36: CORS — Access-Control-Allow-Headers includes Authorization (Phase 57 fix)
  it('T-IH36: CORS — Allow-Headers includes Authorization', async () => {
    const res = await fetch(`${ts.baseUrl}/api/config`, {
      method: 'OPTIONS',
      headers: { 'Origin': 'http://localhost:3000' },
    });
    const allowHeaders = res.headers.get('access-control-allow-headers') || '';
    assert.ok(allowHeaders.includes('Authorization'), `Allow-Headers should include Authorization, got: ${allowHeaders}`);
    assert.ok(allowHeaders.includes('X-Access-Pin'), `Allow-Headers should include X-Access-Pin, got: ${allowHeaders}`);
    assert.ok(allowHeaders.includes('X-Access-Token'), `Allow-Headers should include X-Access-Token, got: ${allowHeaders}`);
  });
});

// ═══════════════════════════════════════════════════════════════
// Block 7: Rate Limiting
// ═══════════════════════════════════════════════════════════════
describe('Integration HTTP — Rate Limiting', () => {
  let ts;

  before(async () => { ts = await createTestServer(); });
  after(async () => { await ts.close(); });

  // T-IH30: Exceeding health rate limit (10/min) — returns 429
  it('T-IH30: Exceeding health rate limit — returns 429', async () => {
    // health bucket: 10 requests per minute
    // Send 11 requests — the 11th should be rate limited
    // Note: rate limit store is module-level (shared across blocks/servers)
    // so previous blocks may have consumed some of the budget.
    // We send enough to guarantee hitting the limit regardless.
    const results = [];
    for (let i = 0; i < 15; i++) {
      const res = await fetch(`${ts.baseUrl}/api/health`);
      results.push(res.status);
    }
    const has429 = results.includes(429);
    assert.ok(has429, `expected at least one 429 in ${JSON.stringify(results)}`);
  });

  // T-IH31: Rate limit response includes Retry-After header
  it('T-IH31: Rate limit response includes Retry-After header and RATE_LIMITED code', async () => {
    // After the previous test already hit the limit, send one more
    const res = await fetch(`${ts.baseUrl}/api/health`);
    if (res.status === 429) {
      const retryAfter = res.headers.get('retry-after');
      assert.ok(retryAfter, 'Retry-After header should be present');
      const seconds = parseInt(retryAfter, 10);
      // windowMs is 60s but Retry-After can be up to ~61 due to timing
      assert.ok(seconds > 0 && seconds <= 65, `Retry-After should be 1-65 seconds, got ${seconds}`);
      const data = await res.json();
      assert.strictEqual(data.code, 'RATE_LIMITED');
    } else {
      // If not rate limited (window might have reset), just verify it responded
      assert.ok([200, 207].includes(res.status), `unexpected status ${res.status}`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// Block 8: Whoami & Misc Routes
// ═══════════════════════════════════════════════════════════════
describe('Integration HTTP — Whoami & Misc', () => {
  let ts;

  before(async () => { ts = await createTestServer(); });
  after(async () => { await ts.close(); });

  // T-IH32: GET /api/whoami — returns tier info
  it('T-IH32: GET /api/whoami — returns 200 with tier info', async () => {
    const res = await fetch(`${ts.baseUrl}/api/whoami`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok('tiersEnabled' in data, 'should contain tiersEnabled');
    assert.ok('permissions' in data, 'should contain permissions');
  });

  // T-IH33: GET /api/admin/metrics with valid token — returns 200
  it('T-IH33: GET /api/admin/metrics with valid token — returns 200', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/metrics`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok('metrics' in data, 'should contain metrics field');
    assert.ok('collected_at' in data, 'should contain collected_at field');
  });

  // T-IH34: GET /api/admin/feedback with valid token — returns 200
  it('T-IH34: GET /api/admin/feedback with valid token — returns 200', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/feedback`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok('counts' in data, 'should contain counts');
    assert.ok('recent' in data, 'should contain recent');
  });

  // T-IH35: 404 for unknown API path — correct JSON shape
  it('T-IH35: DELETE /api/nonexistent — returns 404', async () => {
    const res = await fetch(`${ts.baseUrl}/api/nonexistent`, { method: 'DELETE' });
    assert.strictEqual(res.status, 404);
    const data = await res.json();
    assert.strictEqual(data.code, 'NOT_FOUND');
  });

  // T-IH37: GET /api/admin/suggestions without auth — returns 401 (Phase 57)
  it('T-IH37: GET /api/admin/suggestions without auth — returns 401', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/suggestions`);
    assert.strictEqual(res.status, 401);
  });

  // T-IH38: GET /api/admin/suggestions with valid token — returns 200 (Phase 57)
  it('T-IH38: GET /api/admin/suggestions with valid token — returns 200', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/suggestions`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok('totalClicks' in data, 'should contain totalClicks');
    assert.ok('uniqueSuggestions' in data, 'should contain uniqueSuggestions');
    assert.ok('topClicked' in data, 'should contain topClicked');
    assert.ok(Array.isArray(data.topClicked), 'topClicked should be an array');
  });
});

// ═══════════════════════════════════════════════════════════════
// Block 9: Libraries Endpoint (Phase 60)
// ═══════════════════════════════════════════════════════════════
describe('Integration HTTP — Libraries (Phase 60)', () => {
  let ts;

  before(async () => { ts = await createTestServer(); });
  after(async () => { await ts.close(); });

  // T-IH41: GET /api/libraries returns { enabled: false, libraries: [] } when MULTI_LIBRARY disabled
  it('T-IH41: GET /api/libraries — returns disabled response when MULTI_LIBRARY off', async () => {
    const res = await fetch(`${ts.baseUrl}/api/libraries`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.enabled, false, 'enabled should be false');
    assert.ok(Array.isArray(data.libraries), 'libraries should be an array');
    assert.strictEqual(data.libraries.length, 0, 'libraries should be empty');
  });

  // T-IH42: GET /api/libraries returns proper JSON content-type
  it('T-IH42: GET /api/libraries — Content-Type is application/json', async () => {
    const res = await fetch(`${ts.baseUrl}/api/libraries`);
    assert.strictEqual(res.status, 200);
    const ct = res.headers.get('content-type');
    assert.ok(ct && ct.includes('application/json'), `Content-Type should include application/json, got ${ct}`);
  });

  // T-IH43: POST /api/chat with library_id field (string) — accepted (no rejection)
  it('T-IH43: POST /api/chat with library_id string — passes validation', async () => {
    // This will reach chat handler which will fail (no Qdrant) but validation should pass
    const res = await postJSON(`${ts.baseUrl}/api/chat`, {
      message: 'test question',
      library_id: 'some-library',
    });
    // Should NOT be 400 (validation error) — should be 200 (SSE stream) or 500 (qdrant fail)
    // When MULTI_LIBRARY is disabled, library_id is accepted but ignored
    assert.notStrictEqual(res.status, 400, 'should not reject library_id string field');
    assert.notStrictEqual(res.status, 415, 'should not be content-type error');
  });

  // T-IH44: POST /api/chat with invalid library_id (number) — returns 400
  it('T-IH44: POST /api/chat with library_id as number — returns 400', async () => {
    const res = await postJSON(`${ts.baseUrl}/api/chat`, {
      message: 'test question',
      library_id: 123,
    });
    assert.strictEqual(res.status, 400, 'should reject non-string library_id');
    const data = await res.json();
    assert.strictEqual(data.code, 'VALIDATION_ERROR');
  });

  // T-IH45: GET /api/config — response contains libraries field (Phase 60)
  it('T-IH45: GET /api/config — response contains libraries field', async () => {
    const res = await fetch(`${ts.baseUrl}/api/config`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok('libraries' in data, 'response should contain libraries field');
    assert.ok('enabled' in data.libraries, 'libraries should have enabled field');
    assert.ok(Array.isArray(data.libraries.libraries), 'libraries.libraries should be an array');
  });
});
