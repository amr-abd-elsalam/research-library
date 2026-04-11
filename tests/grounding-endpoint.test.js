// tests/grounding-endpoint.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 102 — Admin Grounding Endpoint Tests
// Tests GET /api/admin/grounding with real HTTP via test server.
// ═══════════════════════════════════════════════════════════════

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestServer } from './helpers/test-server.js';

const ADMIN_TOKEN = 'test-admin-token-phase56';

describe('Admin Grounding Endpoint (Phase 102)', () => {
  let ts;

  before(async () => { ts = await createTestServer(); });
  after(async () => { await ts.close(); });

  // T-GE01: GET /api/admin/grounding without auth returns 401
  it('T-GE01: without auth returns 401', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/grounding`);
    assert.strictEqual(res.status, 401);
  });

  // T-GE02: GET /api/admin/grounding with valid auth returns 200
  it('T-GE02: with auth returns 200', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/grounding`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
  });

  // T-GE03: Response has totalChecked number field
  it('T-GE03: response has totalChecked number', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/grounding`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    const data = await res.json();
    assert.strictEqual(typeof data.totalChecked, 'number');
  });

  // T-GE04: Response has avgScore number field
  it('T-GE04: response has avgScore number', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/grounding`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    const data = await res.json();
    assert.strictEqual(typeof data.avgScore, 'number');
  });

  // T-GE05: Response has scoreDistribution object with 5 buckets
  it('T-GE05: response has scoreDistribution with 5 buckets', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/grounding`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    const data = await res.json();
    assert.strictEqual(typeof data.scoreDistribution, 'object');
    assert.strictEqual(typeof data.scoreDistribution.veryLow, 'number');
    assert.strictEqual(typeof data.scoreDistribution.low, 'number');
    assert.strictEqual(typeof data.scoreDistribution.medium, 'number');
    assert.strictEqual(typeof data.scoreDistribution.high, 'number');
    assert.strictEqual(typeof data.scoreDistribution.veryHigh, 'number');
  });

  // T-GE06: Response has config object
  it('T-GE06: response has config object', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/grounding`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    const data = await res.json();
    assert.strictEqual(typeof data.config, 'object');
  });

  // T-GE07: config.enabled is boolean
  it('T-GE07: config.enabled is boolean', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/grounding`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    const data = await res.json();
    assert.strictEqual(typeof data.config.enabled, 'boolean');
  });

  // T-GE08: config.minGroundingScore is number
  it('T-GE08: config.minGroundingScore is number', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/grounding`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    const data = await res.json();
    assert.strictEqual(typeof data.config.minGroundingScore, 'number');
  });

  // T-GE09: config.semanticMatchingEnabled is true (Phase 102)
  it('T-GE09: config.semanticMatchingEnabled is true', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/grounding`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    const data = await res.json();
    assert.strictEqual(data.config.semanticMatchingEnabled, true, 'semantic matching should be enabled');
  });

  // T-GE10: Content-Type is application/json
  it('T-GE10: Content-Type is application/json', async () => {
    const res = await fetch(`${ts.baseUrl}/api/admin/grounding`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    const ct = res.headers.get('content-type');
    assert.ok(ct && ct.includes('application/json'), `Content-Type should include application/json, got ${ct}`);
  });
});
