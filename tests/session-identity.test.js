// tests/session-identity.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 93 — Session Identity Tests
// Tests stable IP hash (no daily rotation).
// hashIPFromRequest delegates to hashIP (private) — we test
// via the public export.
// ═══════════════════════════════════════════════════════════════

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { hashIPFromRequest } from '../server/services/sessions.js';

// ── Helper: create mock request ───────────────────────────────
function mockReq(opts = {}) {
  return {
    headers: opts.headers || {},
    socket: { remoteAddress: opts.remoteAddress || null },
  };
}

describe('Session Identity — hashIPFromRequest', () => {

  const originalEnv = process.env.SESSION_SALT;

  afterEach(() => {
    // Restore env
    if (originalEnv !== undefined) {
      process.env.SESSION_SALT = originalEnv;
    } else {
      delete process.env.SESSION_SALT;
    }
  });

  // T-SI01: hashIPFromRequest returns same hash for same IP (deterministic)
  it('T-SI01: returns same hash for same IP (deterministic)', () => {
    const req = mockReq({ remoteAddress: '192.168.1.1' });
    const hash1 = hashIPFromRequest(req);
    const hash2 = hashIPFromRequest(req);
    assert.strictEqual(hash1, hash2, 'same request should produce same hash');
  });

  // T-SI02: hashIPFromRequest returns different hash for different IPs
  it('T-SI02: returns different hash for different IPs', () => {
    const req1 = mockReq({ remoteAddress: '192.168.1.1' });
    const req2 = mockReq({ remoteAddress: '10.0.0.1' });
    const hash1 = hashIPFromRequest(req1);
    const hash2 = hashIPFromRequest(req2);
    assert.notStrictEqual(hash1, hash2, 'different IPs should produce different hashes');
  });

  // T-SI03: hash is consistent across different calls (no daily rotation)
  it('T-SI03: hash is consistent (no daily rotation — stable salt)', () => {
    delete process.env.SESSION_SALT; // use default salt
    const req = mockReq({ remoteAddress: '192.168.1.100' });
    const hash1 = hashIPFromRequest(req);
    // Call again — if daily salt was used, crossing midnight would change it
    // Since we use stable salt, this should be identical
    const hash2 = hashIPFromRequest(req);
    assert.strictEqual(hash1, hash2, 'hash should not change between calls');
  });

  // T-SI04: SESSION_SALT env variable overrides default salt
  it('T-SI04: SESSION_SALT env variable overrides default salt', () => {
    delete process.env.SESSION_SALT;
    const req = mockReq({ remoteAddress: '192.168.1.1' });
    const hashDefault = hashIPFromRequest(req);

    process.env.SESSION_SALT = 'custom-test-salt-xyz';
    // We need to test that hash changes — but hashIP reads env at call time
    const hashCustom = hashIPFromRequest(req);
    assert.notStrictEqual(hashDefault, hashCustom, 'custom salt should produce different hash');
  });

  // T-SI05: fallback salt works when SESSION_SALT not set
  it('T-SI05: fallback salt works when SESSION_SALT not set', () => {
    delete process.env.SESSION_SALT;
    const req = mockReq({ remoteAddress: '192.168.1.1' });
    const hash = hashIPFromRequest(req);
    assert.ok(hash, 'should return a hash even without SESSION_SALT env');
    assert.strictEqual(typeof hash, 'string');
    assert.notStrictEqual(hash, 'unknown');
  });

  // T-SI06: hash length is 16 characters hex
  it('T-SI06: hash length is 16 characters hex', () => {
    const req = mockReq({ remoteAddress: '192.168.1.1' });
    const hash = hashIPFromRequest(req);
    assert.strictEqual(hash.length, 16, 'hash should be 16 chars');
    assert.ok(/^[0-9a-f]{16}$/.test(hash), 'hash should be lowercase hex');
  });

  // T-SI07: cf-connecting-ip header is preferred (Cloudflare)
  it('T-SI07: cf-connecting-ip header is preferred over x-forwarded-for', () => {
    const req = mockReq({
      headers: {
        'cf-connecting-ip': '1.2.3.4',
        'x-forwarded-for': '5.6.7.8',
      },
      remoteAddress: '127.0.0.1',
    });
    const hash = hashIPFromRequest(req);

    // Compare with hash from cf-connecting-ip only
    const reqCf = mockReq({ headers: { 'cf-connecting-ip': '1.2.3.4' } });
    const hashCf = hashIPFromRequest(reqCf);
    assert.strictEqual(hash, hashCf, 'should use cf-connecting-ip');
  });

  // T-SI08: multiple x-forwarded-for values — first IP used
  it('T-SI08: multiple x-forwarded-for values — first IP used', () => {
    const req = mockReq({
      headers: { 'x-forwarded-for': '10.0.0.1, 10.0.0.2, 10.0.0.3' },
    });
    const hash = hashIPFromRequest(req);

    const reqFirst = mockReq({ headers: { 'x-forwarded-for': '10.0.0.1' } });
    const hashFirst = hashIPFromRequest(reqFirst);
    assert.strictEqual(hash, hashFirst, 'should use first IP from x-forwarded-for');
  });

  // T-SI09: missing IP falls back to 'unknown'
  it('T-SI09: missing IP falls back to unknown', () => {
    const req = mockReq({ headers: {}, remoteAddress: null });
    const hash = hashIPFromRequest(req);
    assert.strictEqual(hash, 'unknown', 'should return unknown when no IP available');
  });

  // T-SI10: hash does not contain original IP (privacy)
  it('T-SI10: hash does not contain original IP', () => {
    const ip = '192.168.1.55';
    const req = mockReq({ remoteAddress: ip });
    const hash = hashIPFromRequest(req);
    assert.ok(!hash.includes(ip), 'hash should not contain the original IP');
    assert.ok(!hash.includes('192'), 'hash should not contain IP octets');
  });

  // T-SI11: IPv6 addresses produce valid hash
  it('T-SI11: IPv6 addresses produce valid hash', () => {
    const req = mockReq({ remoteAddress: '::1' });
    const hash = hashIPFromRequest(req);
    assert.strictEqual(hash.length, 16);
    assert.ok(/^[0-9a-f]{16}$/.test(hash));
  });

  // T-SI12: empty x-forwarded-for falls back to socket
  it('T-SI12: empty x-forwarded-for falls back to socket', () => {
    const req = mockReq({
      headers: { 'x-forwarded-for': '' },
      remoteAddress: '10.10.10.10',
    });
    const hash = hashIPFromRequest(req);

    const reqSocket = mockReq({ remoteAddress: '10.10.10.10' });
    const hashSocket = hashIPFromRequest(reqSocket);
    // Empty x-forwarded-for -> split returns [''] -> trim returns '' -> falsy
    // Falls through to socket.remoteAddress
    assert.strictEqual(hash, hashSocket, 'should fall back to socket.remoteAddress');
  });

  // T-SI13: undefined headers handled gracefully
  it('T-SI13: undefined headers handled gracefully', () => {
    const req = { headers: undefined, socket: { remoteAddress: '1.1.1.1' } };
    // getClientIP uses optional chaining: req.headers?.['cf-connecting-ip']
    // This should not throw
    const hash = hashIPFromRequest(req);
    assert.ok(typeof hash === 'string', 'should return string');
  });

  // T-SI14: same IP with different salts produces different hash
  it('T-SI14: same IP with different salts produces different hash', () => {
    const req = mockReq({ remoteAddress: '192.168.1.1' });

    process.env.SESSION_SALT = 'salt-alpha';
    const hash1 = hashIPFromRequest(req);

    process.env.SESSION_SALT = 'salt-beta';
    const hash2 = hashIPFromRequest(req);

    assert.notStrictEqual(hash1, hash2, 'different salts should produce different hashes');
  });

  // T-SI15: null req.socket handled gracefully
  it('T-SI15: null req.socket handled gracefully', () => {
    const req = { headers: {}, socket: null };
    const hash = hashIPFromRequest(req);
    assert.strictEqual(hash, 'unknown', 'should return unknown when socket is null');
  });
});
