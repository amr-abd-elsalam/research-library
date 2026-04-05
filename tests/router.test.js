// tests/router.test.js
// ═══════════════════════════════════════════════════════════════
// Phase T — matchRoute() unit tests
// The URL matcher that every single route depends on.
// ═══════════════════════════════════════════════════════════════

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { matchRoute } from '../server/router.js';

describe('matchRoute()', () => {

  // T-R01: exact match
  it('T-R01: matches exact path', () => {
    assert.strictEqual(matchRoute('/api/health', '/api/health'), true);
  });

  // T-R02: trailing slash match
  it('T-R02: matches path with trailing slash', () => {
    assert.strictEqual(matchRoute('/api/health/', '/api/health'), true);
  });

  // T-R03: query string stripped
  it('T-R03: matches path with query string', () => {
    assert.strictEqual(matchRoute('/api/health?v=1', '/api/health'), true);
  });

  // T-R04: trailing slash + query string
  it('T-R04: matches path with trailing slash and query string', () => {
    assert.strictEqual(matchRoute('/api/health/?v=1', '/api/health'), true);
  });

  // T-R05: wrong path
  it('T-R05: rejects different path', () => {
    assert.strictEqual(matchRoute('/api/chat', '/api/health'), false);
  });

  // T-R06: prefix mismatch — critical: /api/health/ready must NOT match /api/health
  it('T-R06: rejects path that extends the route (prefix safety)', () => {
    assert.strictEqual(matchRoute('/api/health/ready', '/api/health'), false);
  });

  // T-R07: empty route path
  it('T-R07: handles empty route path', () => {
    const result = matchRoute('', '');
    assert.strictEqual(typeof result, 'boolean');
    // Empty string === empty string → true
    assert.strictEqual(result, true);
  });

  // T-R08: CRITICAL — /api/config/features must NOT match /api/config
  it('T-R08: /api/config/features does NOT match /api/config (Phase 46 routing safety)', () => {
    assert.strictEqual(matchRoute('/api/config/features', '/api/config'), false);
  });

  // T-R09: /api/config exact match
  it('T-R09: /api/config matches /api/config exactly', () => {
    assert.strictEqual(matchRoute('/api/config', '/api/config'), true);
  });

  // T-R10: /api/libraries exact match and non-match (Phase 60)
  it('T-R10: /api/libraries matches exactly, /api/library does not', () => {
    assert.strictEqual(matchRoute('/api/libraries', '/api/libraries'), true);
    assert.strictEqual(matchRoute('/api/library', '/api/libraries'), false);
    assert.strictEqual(matchRoute('/api/libraries/', '/api/libraries'), true);
    assert.strictEqual(matchRoute('/api/libraries?v=1', '/api/libraries'), true);
  });

});
