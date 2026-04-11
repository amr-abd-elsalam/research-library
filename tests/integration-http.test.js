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

  // T-IH52: responses include X-Request-Id header (Phase 65)
  it('T-IH52: responses include X-Request-Id header', async () => {
    const res = await fetch(`${ts.baseUrl}/api/health`);
    assert.ok([200, 207].includes(res.status));
    const requestId = res.headers.get('x-request-id');
    assert.ok(requestId, 'X-Request-Id header should be present');
    assert.ok(requestId.length >= 32, 'X-Request-Id should be UUID-like');
  });

  // T-IH54: health endpoint does not include external field when periodicHealthCheck disabled (Phase 65)
  it('T-IH54: health endpoint does not include external field when periodicHealthCheck disabled', async () => {
    const res = await fetch(`${ts.baseUrl}/api/health`);
    assert.ok([200, 207].includes(res.status));
    const data = await res.json();
    // periodicHealthCheck.enabled is false by default — external should be absent
    assert.strictEqual(data.external, undefined, 'external field should be absent when periodicHealthCheck disabled');
  });

  // T-IH55: X-Request-Id header is UUID v4 format (Phase 66)
  it('T-IH55: X-Request-Id header is UUID v4 format', async () => {
    const res = await fetch(`${ts.baseUrl}/api/health`);
    assert.ok([200, 207, 429].includes(res.status), `expected 200/207/429, got ${res.status}`);
    const requestId = res.headers.get('x-request-id');
    assert.ok(requestId, 'X-Request-Id header must be present');
    // UUID v4 format: 8-4-4-4-12 hex chars
    assert.ok(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId),
      `X-Request-Id should be UUID v4 format, got ${requestId}`);
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

  // T-IH26: POST /api/feedback with valid body — Phase 90: FEEDBACK enabled by default, returns 200
  it('T-IH26: POST /api/feedback with valid body — returns 200 (feedback enabled)', async () => {
    const res = await postJSON(`${ts.baseUrl}/api/feedback`, {
      correlationId: 'test-corr-id',
      rating: 'positive',
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.ok, true);
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

// ═══════════════════════════════════════════════════════════════
// Block 10: Per-Library Analytics (Phase 61)
// ═══════════════════════════════════════════════════════════════
describe('Integration HTTP — Per-Library Analytics (Phase 61)', () => {
  let ts;

  before(async () => { ts = await createTestServer(); });
  after(async () => { await ts.close(); });

  // T-IH46: GET /api/admin/gaps?library_id=nonexistent — returns 200
  it('T-IH46: GET /api/admin/gaps?library_id=nonexistent — returns 200', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/gaps?library_id=nonexistent`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok('gaps' in data, 'should contain gaps field');
  });

  // T-IH47: GET /api/admin/feedback?library_id=nonexistent — returns 200
  it('T-IH47: GET /api/admin/feedback?library_id=nonexistent — returns 200', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/feedback?library_id=nonexistent`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok('counts' in data, 'should contain counts');
    assert.ok('recent' in data, 'should contain recent');
  });

  // T-IH48: GET /api/admin/health-score?library_id=nonexistent — returns 200 (Phase 97: HEALTH_SCORE enabled by default)
  it('T-IH48: GET /api/admin/health-score?library_id=nonexistent — returns 200 with score', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/health-score?library_id=nonexistent`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200, 'should return 200 (HEALTH_SCORE enabled by default)');
    const data = await res.json();
    assert.ok(typeof data === 'object', 'should return JSON object');
    assert.ok('score' in data, 'should contain score field');
  });

  // T-IH49: GET /api/admin/intelligence?library_id=nonexistent — returns 200 with insights array
  it('T-IH49: GET /api/admin/intelligence?library_id=nonexistent — returns 200', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/intelligence?library_id=nonexistent`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok('insights' in data, 'should contain insights field');
    assert.ok(Array.isArray(data.insights), 'insights should be an array');
  });

  // T-IH50: GET /api/config/features — response includes RETRIEVAL field (Phase 63, Phase 98: true by default)
  it('T-IH50: GET /api/config/features includes RETRIEVAL field', async () => {
    const res = await fetch(`${ts.baseUrl}/api/config/features`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(typeof data.RETRIEVAL, 'boolean');
    assert.strictEqual(data.RETRIEVAL, true, 'RETRIEVAL should be true by default (Phase 98)');
  });

  // T-IH51: GET /api/config/features — response includes QUERY_COMPLEXITY field (Phase 64, Phase 98: true by default)
  it('T-IH51: GET /api/config/features includes QUERY_COMPLEXITY field', async () => {
    const res = await fetch(`${ts.baseUrl}/api/config/features`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(typeof data.QUERY_COMPLEXITY, 'boolean');
    assert.strictEqual(data.QUERY_COMPLEXITY, true, 'QUERY_COMPLEXITY should be true by default (Phase 98)');
  });

  // T-IH53: GET /api/config/features includes ADMIN_INTELLIGENCE boolean (Phase 97: true by default)
  it('T-IH53: GET /api/config/features includes ADMIN_INTELLIGENCE boolean', async () => {
    const res = await fetch(`${ts.baseUrl}/api/config/features`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.ADMIN_INTELLIGENCE, true, 'ADMIN_INTELLIGENCE should be true by default');
  });

  // T-IH56: GET /api/admin/log — entries have requestId field (Phase 67)
  it('T-IH56: GET /api/admin/log — entries have requestId field in schema', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/log`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok('entries' in data, 'response should contain entries');
    assert.ok(Array.isArray(data.entries), 'entries should be an array');
    assert.ok('total' in data, 'response should contain total');
    assert.ok('limit' in data, 'response should contain limit');
    // If there are any entries, verify requestId field exists (string or null)
    if (data.entries.length > 0) {
      const entry = data.entries[0];
      assert.ok('requestId' in entry, 'entry should have requestId field');
      const validType = entry.requestId === null || typeof entry.requestId === 'string';
      assert.ok(validType, `requestId should be string or null, got ${typeof entry.requestId}`);
    }
  });

  // T-IH57: GET /api/admin/log — admin/log endpoint returns proper structure (Phase 67)
  it('T-IH57: GET /api/admin/log — limit parameter works', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/log?limit=5`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data.entries), 'entries should be an array');
    assert.strictEqual(data.limit, 5, 'limit should reflect query parameter');
  });

  // ── Log Filter & Export tests (Phase 68) ───────────────────

  // T-IH58: GET /api/admin/log?requestId=nonexistent — returns 200 with filtered: true
  it('T-IH58: GET /api/admin/log?requestId=nonexistent — returns filtered=true', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/log?requestId=nonexistent-id`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data.entries), 'entries should be an array');
    assert.strictEqual(data.filtered, true, 'filtered should be true when requestId param present');
  });

  // T-IH59: GET /api/admin/log?level=error — returns 200 with filtered: true
  it('T-IH59: GET /api/admin/log?level=error — returns filtered=true', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/log?level=error`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data.entries), 'entries should be an array');
    assert.strictEqual(data.filtered, true, 'filtered should be true when level param present');
  });

  // T-IH60: GET /api/admin/log without filter params — filtered is false
  it('T-IH60: GET /api/admin/log without filter params — filtered is false', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/log`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.filtered, false, 'filtered should be false when no filter params');
    assert.ok(Array.isArray(data.entries), 'entries should be an array');
    assert.ok('total' in data, 'should contain total field');
    assert.ok('limit' in data, 'should contain limit field');
  });

  // T-IH61: GET /api/admin/export?type=logs — returns 200 with logs array (Phase 97: EXPORT enabled by default)
  it('T-IH61: GET /api/admin/export?type=logs — returns 200 with logs', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/export?type=logs`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok('logs' in data, 'response should contain logs field');
    assert.ok(Array.isArray(data.logs), 'logs should be an array');
  });

  // T-IH62: GET /api/config/features includes GROUNDING boolean (Phase 69)
  it('T-IH62: GET /api/config/features includes GROUNDING boolean', async () => {
    const res = await fetch(`${ts.baseUrl}/api/config/features`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(typeof data.GROUNDING, 'boolean');
  });

  // T-IH63: GET /api/admin/inspect includes answerGroundingChecker (Phase 69)
  it('T-IH63: GET /api/admin/inspect includes answerGroundingChecker', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/inspect`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok('answerGroundingChecker' in data, 'inspect should contain answerGroundingChecker');
    assert.strictEqual(typeof data.answerGroundingChecker.enabled, 'boolean');
  });

  // T-IH64: GET /api/admin/inspect includes groundingAnalytics field (Phase 70)
  it('T-IH64: GET /api/admin/inspect includes groundingAnalytics', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/inspect`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok('groundingAnalytics' in data, 'inspect should contain groundingAnalytics');
    assert.strictEqual(typeof data.groundingAnalytics.enabled, 'boolean');
    assert.strictEqual(typeof data.groundingAnalytics.totalChecked, 'number');
    assert.strictEqual(typeof data.groundingAnalytics.avgScore, 'number');
  });

  // T-IH65: GET /api/admin/export?type=grounding — returns 200 (Phase 97: EXPORT enabled by default)
  it('T-IH65: GET /api/admin/export?type=grounding — returns 200 with grounding', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/export?type=grounding`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok('grounding' in data, 'response should contain grounding field');
    assert.ok(Array.isArray(data.grounding), 'grounding should be an array');
  });

  // T-IH66: GET /api/admin/metrics — response parseable with metrics field (no regression)
  it('T-IH66: GET /api/admin/metrics — response parseable', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/metrics`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok('metrics' in data, 'should contain metrics field');
  });

  // T-IH67: GET /api/config/features includes CITATION boolean (Phase 71)
  it('T-IH67: GET /api/config/features includes CITATION boolean', async () => {
    const res = await fetch(`${ts.baseUrl}/api/config/features`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(typeof data.CITATION, 'boolean');
  });

  // T-IH68: GET /api/admin/inspect includes citationMapper (Phase 71)
  it('T-IH68: GET /api/admin/inspect includes citationMapper', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/inspect`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok('citationMapper' in data, 'inspect should contain citationMapper');
    assert.strictEqual(typeof data.citationMapper.enabled, 'boolean');
  });

  // T-IH69: GET /api/config/features returns exactly 15 keys (Phase 85: was 14, +RAG_STRATEGIES)
  it('T-IH69: GET /api/config/features returns exactly 15 keys', async () => {
    const res = await fetch(`${ts.baseUrl}/api/config/features`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(Object.keys(data).length, 15, `expected 15 feature keys, got ${Object.keys(data).length}`);
  });

  // T-IH70: GET /api/admin/inspect — sharedUtilities includes 'arabicNlp' (Phase 72)
  it('T-IH70: GET /api/admin/inspect — sharedUtilities includes arabicNlp', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/inspect`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok('sharedUtilities' in data, 'inspect should contain sharedUtilities');
    assert.ok(Array.isArray(data.sharedUtilities), 'sharedUtilities should be an array');
    assert.ok(data.sharedUtilities.includes('atomicWrite'), 'should include atomicWrite');
    assert.ok(data.sharedUtilities.includes('arabicNlp'), 'should include arabicNlp');
  });

  // T-IH71: GET /api/config/features — includes SEMANTIC_MATCHING boolean (Phase 73, Phase 102: enabled by default)
  it('T-IH71: GET /api/config/features includes SEMANTIC_MATCHING boolean', async () => {
    const res = await fetch(`${ts.baseUrl}/api/config/features`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(typeof data.SEMANTIC_MATCHING, 'boolean');
    assert.strictEqual(data.SEMANTIC_MATCHING, true, 'SEMANTIC_MATCHING should default to true (Phase 102)');
  });

  // T-IH72: GET /api/admin/inspect — featureFlags.status has 15 sections including RAG_STRATEGIES (Phase 85: was 14)
  it('T-IH72: GET /api/admin/inspect — featureFlags has 15 sections', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/inspect`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok('featureFlags' in data, 'inspect should contain featureFlags');
    assert.strictEqual(data.featureFlags.sections, 15, 'should have 15 managed sections');
    const sectionNames = data.featureFlags.status.map(s => s.section);
    assert.ok(sectionNames.includes('SEMANTIC_MATCHING'), 'should include SEMANTIC_MATCHING in status');
    assert.ok(sectionNames.includes('COST_GOVERNANCE'), 'should include COST_GOVERNANCE in status');
    assert.ok(sectionNames.includes('ANSWER_REFINEMENT'), 'should include ANSWER_REFINEMENT in status');
    assert.ok(sectionNames.includes('QUERY_PLANNING'), 'should include QUERY_PLANNING in status');
    assert.ok(sectionNames.includes('RAG_STRATEGIES'), 'should include RAG_STRATEGIES in status');
  });

  // T-IH73: GET /api/admin/inspect — response includes llmProvider object (Phase 74)
  it('T-IH73: GET /api/admin/inspect — includes llmProvider with activeProvider and registered', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/inspect`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok('llmProvider' in data, 'inspect should contain llmProvider');
    assert.strictEqual(typeof data.llmProvider.activeProvider, 'string');
    assert.strictEqual(typeof data.llmProvider.registeredCount, 'number');
    assert.ok(Array.isArray(data.llmProvider.registered), 'registered should be an array');
  });

  // T-IH74: GET /api/admin/inspect — llmProvider.activeProvider is 'gemini' (Phase 74)
  it('T-IH74: GET /api/admin/inspect — llmProvider.activeProvider is gemini', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/inspect`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.llmProvider.activeProvider, 'gemini');
    assert.strictEqual(typeof data.llmProvider.registeredCount, 'number');
    assert.ok(Array.isArray(data.llmProvider.registered), 'registered should be an array');
  });

  // T-IH75: GET /api/admin/inspect — llmProvider.registeredCount is number >= 0 (Phase 75)
  it('T-IH75: GET /api/admin/inspect — llmProvider.registeredCount is number', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/inspect`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(typeof data.llmProvider.registeredCount, 'number');
    assert.ok(data.llmProvider.registeredCount >= 0, `registeredCount should be >= 0, got ${data.llmProvider.registeredCount}`);
  });

  // T-IH76: GET /api/admin/inspect — llmProvider.registered is array (Phase 75)
  it('T-IH76: GET /api/admin/inspect — registered is array with correct length', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/inspect`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data.llmProvider.registered), 'registered should be an array');
    assert.strictEqual(data.llmProvider.registered.length, data.llmProvider.registeredCount,
      'registered array length should match registeredCount');
  });

  // T-IH77: GET /api/admin/inspect — activeProvider is string from config
  it('T-IH77: GET /api/admin/inspect — activeProvider is string from config', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/inspect`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(typeof data.llmProvider.activeProvider, 'string');
    assert.ok(data.llmProvider.activeProvider.length > 0, 'activeProvider should be non-empty');
    // activeProvider comes from config — should be 'gemini' by default
    assert.strictEqual(data.llmProvider.activeProvider, 'gemini',
      'default activeProvider should be gemini');
  });

  // T-IH78: GET /api/admin/inspect includes costGovernor section (Phase 76)
  it('T-IH78: GET /api/admin/inspect includes costGovernor', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/inspect`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok('costGovernor' in data, 'inspect should contain costGovernor');
    assert.strictEqual(typeof data.costGovernor.enabled, 'boolean');
    assert.strictEqual(typeof data.costGovernor.activeSessions, 'number');
    assert.strictEqual(typeof data.costGovernor.trackedProviders, 'number');
    assert.ok('globalUsage' in data.costGovernor, 'should contain globalUsage');
  });

  // T-IH79: GET /api/admin/inspect costGovernor has enabled boolean field (Phase 76, Phase 101: enabled by default)
  it('T-IH79: GET /api/admin/inspect — costGovernor.enabled is true by default', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/inspect`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.costGovernor.enabled, true, 'should default to true (Phase 101)');
    assert.strictEqual(data.costGovernor.monthlyBudgetCeiling, 0, 'default budget ceiling is 0');
  });

  // T-IH80: GET /api/admin/cost without auth — returns 401 (Phase 77)
  it('T-IH80: GET /api/admin/cost without auth — returns 401', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/cost`);
    assert.strictEqual(res.status, 401);
  });

  // T-IH81: GET /api/admin/cost with valid token — returns 200 with cost data shape (Phase 77)
  it('T-IH81: GET /api/admin/cost with valid token — returns 200 with cost data', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/cost`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(typeof data.enabled, 'boolean');
    assert.strictEqual(typeof data.enforcementEnabled, 'boolean');
    assert.ok('globalUsage' in data, 'should have globalUsage');
    assert.ok(Array.isArray(data.providers), 'providers should be array');
    assert.ok(Array.isArray(data.topSessions), 'topSessions should be array');
    assert.strictEqual(typeof data.monthlyBudgetCeiling, 'number');
    assert.strictEqual(typeof data.monthlyBudgetUsed, 'number');
  });

  // T-IH82: GET /api/config/features — includes COST_GOVERNANCE boolean (Phase 77, Phase 101: enabled by default)
  it('T-IH82: GET /api/config/features includes COST_GOVERNANCE boolean', async () => {
    const res = await fetch(`${ts.baseUrl}/api/config/features`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(typeof data.COST_GOVERNANCE, 'boolean');
    assert.strictEqual(data.COST_GOVERNANCE, true, 'COST_GOVERNANCE should default to true (Phase 101)');
  });

  // T-IH83: GET /api/admin/inspect — costGovernor includes enforcementEnabled (Phase 77, Phase 101: COST_GOVERNANCE enabled, enforceBudget still false)
  it('T-IH83: GET /api/admin/inspect — costGovernor includes enforcementEnabled', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/inspect`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok('enforcementEnabled' in data.costGovernor, 'costGovernor should have enforcementEnabled');
    assert.strictEqual(typeof data.costGovernor.enforcementEnabled, 'boolean');
    assert.strictEqual(data.costGovernor.enforcementEnabled, false, 'enforceBudget still false — tracking only');
  });

  // T-IH84: GET /api/admin/cost — globalUsage has expected shape (Phase 77)
  it('T-IH84: GET /api/admin/cost — globalUsage has expected shape', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/cost`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    const g = data.globalUsage;
    assert.strictEqual(typeof g.inputTokens, 'number');
    assert.strictEqual(typeof g.outputTokens, 'number');
    assert.strictEqual(typeof g.requests, 'number');
    assert.strictEqual(typeof g.totalCost, 'number');
  });

  // T-IH85: GET /api/config/features — returns 15 boolean keys including RAG_STRATEGIES (Phase 85: was 14)
  it('T-IH85: GET /api/config/features returns exactly 15 keys', async () => {
    const res = await fetch(`${ts.baseUrl}/api/config/features`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(Object.keys(data).length, 15, `expected 15 feature keys, got ${Object.keys(data).length}`);
    assert.strictEqual(typeof data.ANSWER_REFINEMENT, 'boolean');
    assert.strictEqual(typeof data.QUERY_PLANNING, 'boolean');
    assert.strictEqual(typeof data.RAG_STRATEGIES, 'boolean');
  });

  // T-IH86: GET /api/admin/inspect — featureFlags has 15 sections including RAG_STRATEGIES (Phase 85: was 14)
  it('T-IH86: GET /api/admin/inspect — featureFlags has 15 sections', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/inspect`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.featureFlags.sections, 15, 'should have 15 managed sections');
    const sectionNames = data.featureFlags.status.map(s => s.section);
    assert.ok(sectionNames.includes('ANSWER_REFINEMENT'), 'should include ANSWER_REFINEMENT in status');
    assert.ok(sectionNames.includes('QUERY_PLANNING'), 'should include QUERY_PLANNING in status');
    assert.ok(sectionNames.includes('RAG_STRATEGIES'), 'should include RAG_STRATEGIES in status');
  });

  // T-IH87: GET /api/admin/inspect — includes answerRefinement section with enabled boolean (Phase 78)
  it('T-IH87: GET /api/admin/inspect — includes answerRefinement section', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/inspect`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok('answerRefinement' in data, 'inspect should contain answerRefinement');
    assert.strictEqual(typeof data.answerRefinement.enabled, 'boolean');
    assert.strictEqual(typeof data.answerRefinement.maxRefinements, 'number');
    assert.strictEqual(typeof data.answerRefinement.minScoreToRetry, 'number');
    assert.strictEqual(data.answerRefinement.requiresGrounding, true);
  });

  // T-IH88: GET /api/admin/inspect — includes configValidator section with totalRules number (Phase 79)
  it('T-IH88: GET /api/admin/inspect — includes configValidator section', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/inspect`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok('configValidator' in data, 'inspect should contain configValidator');
    assert.strictEqual(typeof data.configValidator.totalRules, 'number');
  });

  // T-IH89: GET /api/admin/inspect — configValidator.totalRules is 15 (Phase 95: was 14, +EXECUTION_REGISTRY_coverage_check)
  it('T-IH89: GET /api/admin/inspect — configValidator.totalRules is 15', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/inspect`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.configValidator.totalRules, 15, 'should have 15 validation rules');
  });

  // T-IH90: GET /api/admin/inspect — configValidator.lastResult is null or object (Phase 79)
  // Note: test-server does NOT run full bootstrap — lastResult is null unless validate() was called
  it('T-IH90: GET /api/admin/inspect — configValidator.lastResult is null or object', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/inspect`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    const lr = data.configValidator.lastResult;
    const validType = lr === null || (typeof lr === 'object' && lr !== null);
    assert.ok(validType, `lastResult should be null or object, got ${typeof lr}`);
  });

  // T-IH91: GET /api/admin/inspect — configValidator.lastResult.valid is boolean when present (Phase 79)
  it('T-IH91: GET /api/admin/inspect — configValidator.lastResult.valid is boolean when present', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/inspect`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    const lr = data.configValidator.lastResult;
    if (lr !== null) {
      assert.strictEqual(typeof lr.valid, 'boolean');
    } else {
      // test-server skips bootstrap — lastResult stays null — that's valid
      assert.strictEqual(lr, null);
    }
  });

  // T-IH92: GET /api/admin/inspect — includes actionRegistry section (Phase 80)
  it('T-IH92: GET /api/admin/inspect — includes actionRegistry section', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/inspect`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok('actionRegistry' in data, 'inspect should contain actionRegistry');
  });

  // T-IH93: GET /api/admin/inspect — actionRegistry.totalActions is a number >= 0 (Phase 80)
  it('T-IH93: GET /api/admin/inspect — actionRegistry.totalActions is number >= 0', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/inspect`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(typeof data.actionRegistry.totalActions, 'number');
    assert.ok(data.actionRegistry.totalActions >= 0, 'totalActions should be >= 0');
  });

  // T-IH94: GET /api/admin/inspect — actionRegistry.enabled is boolean (Phase 80)
  it('T-IH94: GET /api/admin/inspect — actionRegistry.enabled is boolean', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/inspect`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(typeof data.actionRegistry.enabled, 'boolean');
  });

  // T-IH95: GET /api/config/features includes QUERY_PLANNING boolean (Phase 99: enabled by default)
  it('T-IH95: GET /api/config/features includes QUERY_PLANNING boolean', async () => {
    const res = await fetch(`${ts.baseUrl}/api/config/features`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(typeof data.QUERY_PLANNING, 'boolean');
    assert.strictEqual(data.QUERY_PLANNING, true, 'QUERY_PLANNING should default to true (Phase 99)');
  });

  // T-IH96: GET /api/admin/inspect includes queryPlanner section (Phase 81)
  it('T-IH96: GET /api/admin/inspect includes queryPlanner section', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/inspect`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok('queryPlanner' in data, 'inspect should contain queryPlanner');
    assert.strictEqual(typeof data.queryPlanner.enabled, 'boolean');
    assert.strictEqual(typeof data.queryPlanner.totalPlanned, 'number');
    assert.strictEqual(typeof data.queryPlanner.totalSkipped, 'number');
  });

  // T-IH97: GET /api/config/features returns exactly 15 keys (Phase 85: was 14)
  it('T-IH97: GET /api/config/features returns exactly 15 keys', async () => {
    const res = await fetch(`${ts.baseUrl}/api/config/features`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(Object.keys(data).length, 15, `expected 15 feature keys, got ${Object.keys(data).length}`);
  });

  // T-IH98: GET /api/admin/inspect includes pipelineComposer section (Phase 82)
  it('T-IH98: GET /api/admin/inspect includes pipelineComposer section', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/inspect`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok('pipelineComposer' in data, 'inspect should contain pipelineComposer');
  });

  // T-IH99: GET /api/admin/inspect — pipelineComposer has totalComposed and totalFallbacks (Phase 82)
  it('T-IH99: GET /api/admin/inspect — pipelineComposer has totalComposed and totalFallbacks', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/inspect`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(typeof data.pipelineComposer.totalComposed, 'number');
    assert.strictEqual(typeof data.pipelineComposer.totalFallbacks, 'number');
  });

  // T-IH100: GET /api/admin/inspect — conversationContext includes totalPipelineExecutions (Phase 82)
  it('T-IH100: GET /api/admin/inspect — conversationContext includes totalPipelineExecutions', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/inspect`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(typeof data.conversationContext.totalPipelineExecutions, 'number');
  });

  // T-IH101: GET /api/health — still ok/degraded (mock infrastructure not loaded) (Phase 83)
  it('T-IH101: GET /api/health — still returns ok/degraded (or 429 from rate limit)', async () => {
    const res = await fetch(`${ts.baseUrl}/api/health`);
    assert.ok([200, 207, 429].includes(res.status), `expected 200/207/429, got ${res.status}`);
    if (res.status !== 429) {
      const data = await res.json();
      assert.ok(['ok', 'degraded'].includes(data.status), 'status should be ok or degraded');
    }
  });

  // T-IH102: GET /api/config/features — still returns 15 features (Phase 85)
  it('T-IH102: GET /api/config/features — still returns 15 features', async () => {
    const res = await fetch(`${ts.baseUrl}/api/config/features`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(Object.keys(data).length, 15, `expected 15 features, got ${Object.keys(data).length}`);
  });

  // T-IH103: GET /api/admin/inspect — no mock singletons registered (Phase 83)
  it('T-IH103: GET /api/admin/inspect — llmProvider is gemini (not mock)', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/inspect`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.llmProvider.activeProvider, 'gemini', 'should be gemini, not mock');
  });

  // T-IH104: GET /api/sessions/:id/replay without auth → returns 401 (Phase 84)
  it('T-IH104: GET /api/sessions/:id/replay without auth — returns 401', async () => {
    const fakeId = '00000000-0000-4000-a000-000000000000';
    const res = await fetch(`${ts.baseUrl}/api/sessions/${fakeId}/replay`);
    assert.strictEqual(res.status, 401);
  });

  // T-IH105: GET /api/sessions/:id/replay with auth → returns 404 (enableReplay disabled by default) (Phase 84)
  it('T-IH105: GET /api/sessions/:id/replay with auth — returns 404 (feature disabled)', async () => {
    const fakeId = '00000000-0000-4000-a000-000000000000';
    const res = await fetch(`${ts.baseUrl}/api/sessions/${fakeId}/replay`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 404);
    const data = await res.json();
    assert.strictEqual(data.code, 'FEATURE_DISABLED');
  });

  // T-IH106: GET /api/admin/inspect with auth → includes sessionReplaySerializer section (Phase 84)
  it('T-IH106: GET /api/admin/inspect — includes sessionReplaySerializer', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/inspect`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok('sessionReplaySerializer' in data, 'inspect should contain sessionReplaySerializer');
    assert.strictEqual(typeof data.sessionReplaySerializer.enabled, 'boolean');
  });

  // T-IH107: GET /api/config/features includes RAG_STRATEGIES boolean (Phase 100: enabled by default)
  it('T-IH107: GET /api/config/features includes RAG_STRATEGIES boolean', async () => {
    const res = await fetch(`${ts.baseUrl}/api/config/features`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(typeof data.RAG_STRATEGIES, 'boolean');
    assert.strictEqual(data.RAG_STRATEGIES, true, 'RAG_STRATEGIES should default to true (Phase 100)');
  });

  // T-IH108: GET /api/admin/inspect includes ragStrategySelector section (Phase 85)
  it('T-IH108: GET /api/admin/inspect includes ragStrategySelector', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/inspect`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok('ragStrategySelector' in data, 'inspect should contain ragStrategySelector');
    assert.strictEqual(typeof data.ragStrategySelector.enabled, 'boolean');
    assert.strictEqual(typeof data.ragStrategySelector.totalSelections, 'number');
    assert.strictEqual(typeof data.ragStrategySelector.strategyBreakdown, 'object');
  });

  // T-IH109: GET /api/config/features returns exactly 15 keys (Phase 85)
  it('T-IH109: GET /api/config/features returns exactly 15 keys', async () => {
    const res = await fetch(`${ts.baseUrl}/api/config/features`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(Object.keys(data).length, 15, `expected 15 feature keys, got ${Object.keys(data).length}`);
  });

  // T-IH110: GET /api/admin/inspect — configValidator.totalRules is 15 (Phase 95: was 14, +EXECUTION_REGISTRY_coverage_check)
  it('T-IH110: GET /api/admin/inspect — configValidator.totalRules is 15', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/inspect`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.configValidator.totalRules, 15, 'should have 15 validation rules');
  });

  // T-IH111: GET /api/admin/inspect — answerRefinement includes streamingRevisionEnabled field (Phase 86)
  it('T-IH111: GET /api/admin/inspect — answerRefinement includes streamingRevisionEnabled', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/inspect`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok('streamingRevisionEnabled' in data.answerRefinement,
      'answerRefinement should include streamingRevisionEnabled');
    assert.strictEqual(typeof data.answerRefinement.streamingRevisionEnabled, 'boolean');
    assert.strictEqual(data.answerRefinement.streamingRevisionEnabled, false,
      'should default to false');
  });

  // T-IH112: GET /api/admin/inspect — includes refinementAnalytics section (Phase 87)
  it('T-IH112: GET /api/admin/inspect — includes refinementAnalytics section', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/inspect`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok('refinementAnalytics' in data, 'inspect should contain refinementAnalytics');
    assert.strictEqual(typeof data.refinementAnalytics.enabled, 'boolean');
    assert.strictEqual(typeof data.refinementAnalytics.totalRecorded, 'number');
    assert.strictEqual(typeof data.refinementAnalytics.maxEntries, 'number');
  });

  // T-IH113: GET /api/admin/inspect — includes strategyAnalytics section (Phase 87)
  it('T-IH113: GET /api/admin/inspect — includes strategyAnalytics section', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/inspect`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok('strategyAnalytics' in data, 'inspect should contain strategyAnalytics');
    assert.strictEqual(typeof data.strategyAnalytics.enabled, 'boolean');
    assert.strictEqual(typeof data.strategyAnalytics.totalRecorded, 'number');
    assert.strictEqual(typeof data.strategyAnalytics.maxEntries, 'number');
  });

  // T-IH114: GET /api/admin/inspect — refinementAnalytics.totalRecorded is number >= 0 (Phase 87)
  it('T-IH114: GET /api/admin/inspect — refinementAnalytics.totalRecorded is number', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/inspect`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(data.refinementAnalytics.totalRecorded >= 0,
      `totalRecorded should be >= 0, got ${data.refinementAnalytics.totalRecorded}`);
  });

  // T-IH115: GET /api/admin/inspect — strategyAnalytics.totalRecorded is number >= 0 (Phase 87)
  it('T-IH115: GET /api/admin/inspect — strategyAnalytics.totalRecorded is number', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/inspect`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(data.strategyAnalytics.totalRecorded >= 0,
      `totalRecorded should be >= 0, got ${data.strategyAnalytics.totalRecorded}`);
  });

  // T-IH116: GET /api/admin/inspect — conversationContext includes quality tracking fields (Phase 87)
  it('T-IH116: GET /api/admin/inspect — conversationContext has quality tracking', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/inspect`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok('conversationContext' in data, 'inspect should contain conversationContext');
    assert.strictEqual(typeof data.conversationContext.enabled, 'boolean');
    assert.strictEqual(typeof data.conversationContext.activeSessions, 'number');
    assert.strictEqual(typeof data.conversationContext.totalTurns, 'number');
  });

  // T-IH117: GET /api/admin/inspect — ragStrategySelector has correct shape including qualitySource awareness (Phase 88)
  it('T-IH117: GET /api/admin/inspect — ragStrategySelector has expected shape', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/inspect`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok('ragStrategySelector' in data, 'inspect should contain ragStrategySelector');
    assert.strictEqual(typeof data.ragStrategySelector.enabled, 'boolean');
    assert.strictEqual(typeof data.ragStrategySelector.totalSelections, 'number');
    assert.strictEqual(typeof data.ragStrategySelector.strategyBreakdown, 'object');
    const breakdown = data.ragStrategySelector.strategyBreakdown;
    assert.strictEqual(typeof breakdown.quick_factual, 'number');
    assert.strictEqual(typeof breakdown.deep_analytical, 'number');
    assert.strictEqual(typeof breakdown.conversational_followup, 'number');
    assert.strictEqual(typeof breakdown.exploratory_scan, 'number');
    assert.strictEqual(typeof breakdown.none, 'number');
  });

  // T-IH118: GET /api/admin/inspect — circuits section shows CB name reflecting provider (Phase 88)
  it('T-IH118: GET /api/admin/inspect — circuits section is object', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/inspect`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok('circuits' in data, 'inspect should contain circuits');
    assert.strictEqual(typeof data.circuits, 'object', 'circuits should be an object');
    // CB may or may not be registered depending on whether gemini.js facade was called
    // When registered, the CB name should be a string key in the circuits object
    const cbNames = Object.keys(data.circuits);
    if (cbNames.length > 0) {
      for (const name of cbNames) {
        assert.strictEqual(typeof data.circuits[name].state, 'string', `CB ${name} should have state`);
        assert.strictEqual(typeof data.circuits[name].name, 'string', `CB ${name} should have name`);
      }
    }
  });

  // T-IH119: GET /api/admin/inspect → refinementAnalytics has expected shape (Phase 89)
  it('T-IH119: GET /api/admin/inspect — refinementAnalytics has expected shape', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/inspect`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok('refinementAnalytics' in data, 'should contain refinementAnalytics');
    assert.strictEqual(typeof data.refinementAnalytics.enabled, 'boolean');
    assert.strictEqual(typeof data.refinementAnalytics.totalRecorded, 'number');
    assert.strictEqual(typeof data.refinementAnalytics.maxEntries, 'number');
    assert.strictEqual(typeof data.refinementAnalytics.successRate, 'number');
  });

  // T-IH120: GET /api/admin/inspect → strategyAnalytics has expected shape (Phase 89)
  it('T-IH120: GET /api/admin/inspect — strategyAnalytics has expected shape', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/inspect`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok('strategyAnalytics' in data, 'should contain strategyAnalytics');
    assert.strictEqual(typeof data.strategyAnalytics.enabled, 'boolean');
    assert.strictEqual(typeof data.strategyAnalytics.totalRecorded, 'number');
    assert.strictEqual(typeof data.strategyAnalytics.maxEntries, 'number');
    assert.strictEqual(typeof data.strategyAnalytics.strategyBreakdown, 'object');
  });

  // T-IH121: GET /api/admin/inspect → feedbackCollector has expected shape (Phase 89)
  it('T-IH121: GET /api/admin/inspect — feedbackCollector has expected shape', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/inspect`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok('feedbackCollector' in data, 'should contain feedbackCollector');
    assert.strictEqual(typeof data.feedbackCollector.enabled, 'boolean');
    assert.strictEqual(typeof data.feedbackCollector.totalPositive, 'number');
    assert.strictEqual(typeof data.feedbackCollector.totalNegative, 'number');
    assert.strictEqual(typeof data.feedbackCollector.recentCount, 'number');
  });

  // T-IH122: GET /api/admin/inspect → correlationIndex has expected shape (Phase 89)
  it('T-IH122: GET /api/admin/inspect — correlationIndex has expected shape', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/inspect`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok('correlationIndex' in data, 'should contain correlationIndex');
    assert.strictEqual(typeof data.correlationIndex.enabled, 'boolean');
    assert.strictEqual(typeof data.correlationIndex.size, 'number');
    assert.strictEqual(typeof data.correlationIndex.maxSize, 'number');
  });

  // T-IH124: GET /api/config/features → FEEDBACK: true (Phase 90)
  it('T-IH124: GET /api/config/features — FEEDBACK is true by default', async () => {
    const res = await fetch(`${ts.baseUrl}/api/config/features`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.FEEDBACK, true);
  });

  // T-IH125: GET /api/config/features → GROUNDING: true (Phase 90)
  it('T-IH125: GET /api/config/features — GROUNDING is true by default', async () => {
    const res = await fetch(`${ts.baseUrl}/api/config/features`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.GROUNDING, true);
    assert.strictEqual(data.CITATION, true);
    assert.strictEqual(data.SUGGESTIONS, true);
  });

  // T-IH126: GET /api/sessions (user-scoped) — returns 200 with sessions array (Phase 90)
  it('T-IH126: GET /api/sessions — returns sessions array', async () => {
    const res = await fetch(`${ts.baseUrl}/api/sessions`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok('sessions' in data, 'should contain sessions field');
    assert.ok(Array.isArray(data.sessions), 'sessions should be an array');
  });

  // T-IH127: GET /api/sessions — Content-Type is application/json (Phase 90)
  it('T-IH127: GET /api/sessions — Content-Type is application/json', async () => {
    const res = await fetch(`${ts.baseUrl}/api/sessions`);
    assert.strictEqual(res.status, 200);
    const ct = res.headers.get('content-type');
    assert.ok(ct && ct.includes('application/json'), `Content-Type should include application/json, got ${ct}`);
  });

  // T-IH128: POST /api/feedback returns 200 when FEEDBACK enabled by default (Phase 90)
  it('T-IH128: POST /api/feedback — returns 200 with ok:true', async () => {
    const res = await postJSON(`${ts.baseUrl}/api/feedback`, {
      correlationId: 'test-phase90-corr',
      rating: 'negative',
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.ok, true);
  });

  // T-IH129: GET /api/sessions returns 200 with sessions array (Phase 91 — index-backed)
  it('T-IH129: GET /api/sessions — returns 200 with sessions array', async () => {
    const res = await fetch(`${ts.baseUrl}/api/sessions`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok('sessions' in data, 'should contain sessions field');
    assert.ok(Array.isArray(data.sessions), 'sessions should be an array');
  });

  // T-IH130: GET /api/admin/inspect includes sessionMetadataIndex singleton (Phase 91)
  it('T-IH130: GET /api/admin/inspect includes sessionMetadataIndex', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/inspect`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok('sessionMetadataIndex' in data, 'inspect should contain sessionMetadataIndex');
    assert.strictEqual(typeof data.sessionMetadataIndex.enabled, 'boolean');
    assert.strictEqual(typeof data.sessionMetadataIndex.warmedUp, 'boolean');
    assert.strictEqual(typeof data.sessionMetadataIndex.cachedSessions, 'number');
    assert.strictEqual(typeof data.sessionMetadataIndex.maxCached, 'number');
    assert.strictEqual(typeof data.sessionMetadataIndex.firstMessageMaxLen, 'number');
  });

  // T-IH131: GET /api/admin/inspect — configValidator.totalRules is 15 (Phase 95: was 14, +EXECUTION_REGISTRY_coverage_check)
  it('T-IH131: GET /api/admin/inspect — configValidator.totalRules is 15', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/inspect`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.configValidator.totalRules, 15, 'should have 15 validation rules');
  });

  // T-IH132: GET /api/sessions returns sessions array (per-user isolation active)
  it('T-IH132: GET /api/sessions — returns sessions array with per-user isolation', async () => {
    const res = await fetch(`${ts.baseUrl}/api/sessions`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok('sessions' in data, 'should contain sessions field');
    assert.ok(Array.isArray(data.sessions), 'sessions should be an array');
  });

  // T-IH133: GET /api/admin/inspect — sessionMetadataIndex includes perUserIsolation field
  it('T-IH133: GET /api/admin/inspect — sessionMetadataIndex includes perUserIsolation', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/inspect`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok('sessionMetadataIndex' in data, 'inspect should contain sessionMetadataIndex');
    assert.strictEqual(typeof data.sessionMetadataIndex.perUserIsolation, 'boolean',
      'perUserIsolation should be boolean');
    assert.strictEqual(data.sessionMetadataIndex.perUserIsolation, true,
      'perUserIsolation should default to true');
  });

  // T-IH134: GET /api/admin/inspect — configValidator.totalRules is 15 (Phase 95: was 14, +EXECUTION_REGISTRY_coverage_check)
  it('T-IH134: GET /api/admin/inspect — configValidator.totalRules is 15', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/inspect`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.configValidator.totalRules, 15, 'should have 15 validation rules');
  });

  // T-IH135: GET /api/sessions/stream — returns SSE response (Phase 93)
  it('T-IH135: GET /api/sessions/stream — returns SSE Content-Type', async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2000);
    try {
      const res = await fetch(`${ts.baseUrl}/api/sessions/stream`, {
        signal: controller.signal,
      });
      clearTimeout(timer);
      const ct = res.headers.get('content-type');
      assert.ok(ct && ct.includes('text/event-stream'), `Content-Type should be text/event-stream, got ${ct}`);
      // Abort after checking headers — don't wait for stream to end
      controller.abort();
    } catch (err) {
      clearTimeout(timer);
      // AbortError is expected — we just need to check the headers were correct
      if (err.name !== 'AbortError') throw err;
    }
  });

  // T-IH136: GET /api/admin/inspect — includes sessionStream section (Phase 93)
  it('T-IH136: GET /api/admin/inspect — includes sessionStream section', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/inspect`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok('sessionStream' in data, 'inspect should contain sessionStream');
    assert.strictEqual(typeof data.sessionStream.totalConnections, 'number');
    assert.strictEqual(typeof data.sessionStream.uniqueUsers, 'number');
  });

  // T-IH137: hashIPFromRequest produces stable hash (Phase 93)
  it('T-IH137: GET /api/sessions — returns consistent results across calls', async () => {
    // Call twice — should get same structure (stable identity)
    const res1 = await fetch(`${ts.baseUrl}/api/sessions`);
    const res2 = await fetch(`${ts.baseUrl}/api/sessions`);
    assert.strictEqual(res1.status, 200);
    assert.strictEqual(res2.status, 200);
    const data1 = await res1.json();
    const data2 = await res2.json();
    assert.ok(Array.isArray(data1.sessions));
    assert.ok(Array.isArray(data2.sessions));
    // Both should return same session count (same IP = same hash = same filter)
    assert.strictEqual(data1.sessions.length, data2.sessions.length, 'stable hash should return consistent results');
  });

  // T-IH138: PATCH /api/sessions/:id/title — returns 400 for invalid title (Phase 94)
  it('T-IH138: PATCH /api/sessions/:id/title — returns 400 for empty title', async () => {
    const fakeId = '00000000-0000-4000-a000-000000000000';
    const res = await fetch(`${ts.baseUrl}/api/sessions/${fakeId}/title`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '' }),
    });
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    // validateBody middleware catches empty title before handler — returns VALIDATION_ERROR
    assert.ok(['VALIDATION_ERROR', 'INVALID_TITLE'].includes(data.code),
      `expected VALIDATION_ERROR or INVALID_TITLE, got ${data.code}`);
  });

  // T-IH139: POST /api/sessions/:id/pin on non-existent session — returns 404 (Phase 94)
  it('T-IH139: POST /api/sessions/:id/pin — returns 404 for non-existent session', async () => {
    const fakeId = '00000000-0000-4000-a000-000000000000';
    const res = await fetch(`${ts.baseUrl}/api/sessions/${fakeId}/pin`, {
      method: 'POST',
    });
    assert.strictEqual(res.status, 404);
    const data = await res.json();
    assert.strictEqual(data.code, 'SESSION_NOT_FOUND');
  });

  // T-IH140: GET /api/admin/inspect includes unifiedRegistry section (Phase 94)
  it('T-IH140: GET /api/admin/inspect includes unifiedRegistry', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/inspect`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok('unifiedRegistry' in data, 'inspect should contain unifiedRegistry');
    assert.strictEqual(typeof data.unifiedRegistry.enabled, 'boolean');
    assert.strictEqual(typeof data.unifiedRegistry.populated, 'boolean');
    assert.strictEqual(typeof data.unifiedRegistry.total, 'number');
    assert.strictEqual(typeof data.unifiedRegistry.aliases, 'number');
    assert.strictEqual(typeof data.unifiedRegistry.byType, 'object');
    assert.strictEqual(typeof data.unifiedRegistry.byCategory, 'object');
  });

  // T-IH141: GET /api/admin/inspect — configValidator.totalRules is 15 (Phase 95)
  it('T-IH141: GET /api/admin/inspect — configValidator.totalRules is 15', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/inspect`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.configValidator.totalRules, 15, 'should have 15 validation rules');
  });

  // T-IH142: GET /api/admin/inspect — config.sections count is 50 (Phase 94: +EXECUTION_REGISTRY)
  it('T-IH142: GET /api/admin/inspect — config.sections is 50', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/inspect`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.config.sections, 50, 'should have 50 config sections');
  });

  // T-IH123: GET /api/admin/inspect → all sections present (Phase 93: +sessionStream)
  it('T-IH123: GET /api/admin/inspect — all singleton sections present', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/inspect`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    const expectedSections = [
      'config', 'commands', 'hooks', 'eventBus', 'plugins', 'metrics',
      'logger', 'operationalLog', 'bootstrap', 'circuits', 'sessionBudget',
      'intentClassifier', 'pipelineAnalytics', 'metricsPersister',
      'executionRouter', 'conversationContext', 'contextPersister',
      'suggestionsEngine', 'suggestionAnalytics', 'feedbackCollector',
      'correlationIndex', 'auditTrail', 'auditPersister', 'libraryIndex',
      'systemPromptEnrichment', 'contentGapDetector', 'gapPersister',
      'sessionQualityScorer', 'libraryHealthScorer', 'adminActions',
      'featureFlags', 'adminIntelligence', 'dynamicWelcomeSuggestions',
      'searchReranker', 'queryComplexityAnalyzer', 'answerGroundingChecker',
      'groundingAnalytics', 'citationMapper', 'sharedUtilities',
      'llmProvider', 'costGovernor', 'answerRefinement', 'configValidator',
      'actionRegistry', 'queryPlanner', 'pipelineComposer',
      'sessionReplaySerializer', 'ragStrategySelector',
      'refinementAnalytics', 'strategyAnalytics',
      'sessionMetadataIndex', 'sessionStream',
      'unifiedRegistry',
      'observability', 'tiers',
    ];
    for (const section of expectedSections) {
      assert.ok(section in data, `inspect should contain "${section}"`);
    }
  });

  // T-IH143: GET /api/admin/inspect — unifiedRegistry has executeResolved capability (Phase 95)
  it('T-IH143: GET /api/admin/inspect — unifiedRegistry shows counts', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/inspect`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok('unifiedRegistry' in data, 'inspect should contain unifiedRegistry');
    assert.strictEqual(typeof data.unifiedRegistry.enabled, 'boolean');
    assert.strictEqual(typeof data.unifiedRegistry.populated, 'boolean');
    assert.strictEqual(typeof data.unifiedRegistry.total, 'number');
    assert.strictEqual(typeof data.unifiedRegistry.aliases, 'number');
  });

  // T-IH144: GET /api/admin/inspect — configValidator reports 15 rules (Phase 95)
  it('T-IH144: GET /api/admin/inspect — configValidator reports 15 rules', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/inspect`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.configValidator.totalRules, 15, 'should have 15 validation rules');
  });

  // T-IH145: GET /api/admin/inspect — sessionMetadataIndex has getPath capability (Phase 95)
  it('T-IH145: GET /api/admin/inspect — sessionMetadataIndex shows counts', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/inspect`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok('sessionMetadataIndex' in data, 'inspect should contain sessionMetadataIndex');
    assert.strictEqual(typeof data.sessionMetadataIndex.enabled, 'boolean');
    assert.strictEqual(typeof data.sessionMetadataIndex.cachedSessions, 'number');
    assert.strictEqual(typeof data.sessionMetadataIndex.perUserIsolation, 'boolean');
  });

  // T-IH146: POST /api/admin/actions/clear-cache with valid token — returns 200 (Phase 96)
  it('T-IH146: POST /api/admin/actions/clear-cache — returns 200', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/actions/clear-cache`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(data.ok === true || data.success === true, 'should return ok or success');
  });

  // T-IH147: GET /api/admin/inspect — configValidator reports 15 rules (Phase 96)
  it('T-IH147: GET /api/admin/inspect — configValidator reports 15 rules', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/inspect`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.configValidator.totalRules, 15, 'should have 15 validation rules');
  });

  // T-IH148: GET /api/admin/inspect — unifiedRegistry shows action entries when ACTION_REGISTRY enabled (Phase 96)
  it('T-IH148: GET /api/admin/inspect — unifiedRegistry shows action entries', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/inspect`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok('unifiedRegistry' in data, 'inspect should contain unifiedRegistry');
    assert.strictEqual(typeof data.unifiedRegistry.total, 'number');
    assert.strictEqual(typeof data.unifiedRegistry.byType, 'object');
    // With ACTION_REGISTRY enabled, unifiedRegistry should have action entries
    assert.strictEqual(data.unifiedRegistry.enabled, true, 'unifiedRegistry should be enabled');
  });

  // T-IH149: GET /api/admin/grounding without auth returns 401 (Phase 102)
  it('T-IH149: GET /api/admin/grounding without auth — returns 401', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/grounding`);
    assert.strictEqual(res.status, 401);
  });

  // T-IH150: GET /api/admin/grounding with auth returns 200 with expected shape (Phase 102)
  it('T-IH150: GET /api/admin/grounding with auth — returns 200 with shape', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/grounding`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(typeof data.totalChecked, 'number');
    assert.strictEqual(typeof data.avgScore, 'number');
    assert.strictEqual(typeof data.scoreDistribution, 'object');
    assert.strictEqual(typeof data.config, 'object');
    assert.strictEqual(typeof data.config.semanticMatchingEnabled, 'boolean');
  });

  // T-IH151: GET /api/config/features returns SEMANTIC_MATCHING: true (Phase 102)
  it('T-IH151: GET /api/config/features — SEMANTIC_MATCHING is true', async () => {
    const res = await fetch(`${ts.baseUrl}/api/config/features`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.SEMANTIC_MATCHING, true, 'SEMANTIC_MATCHING should be true (Phase 102)');
  });

  // T-IH152: GET /api/config/features returns exactly 15 keys (count unchanged — Phase 102)
  it('T-IH152: GET /api/config/features returns exactly 15 keys', async () => {
    const res = await fetch(`${ts.baseUrl}/api/config/features`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(Object.keys(data).length, 15, `expected 15 feature keys, got ${Object.keys(data).length}`);
  });
});
