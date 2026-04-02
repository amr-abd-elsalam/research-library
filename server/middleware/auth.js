// server/middleware/auth.js
// ═══════════════════════════════════════════════════════════════
// Authentication middleware
// - Admin endpoints: Bearer token from ADMIN_TOKEN env var
// - User access: public | pin | token modes
// ═══════════════════════════════════════════════════════════════

import crypto from 'node:crypto';

// ── Custom Error ───────────────────────────────────────────────
export class AuthError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
  }
}

// ── Env vars ───────────────────────────────────────────────────
const ADMIN_TOKEN   = process.env.ADMIN_TOKEN   || '';
const ACCESS_MODE   = process.env.ACCESS_MODE   || 'public';
const ACCESS_PIN    = process.env.ACCESS_PIN    || '';
const ACCESS_TOKENS = (process.env.ACCESS_TOKENS || '')
  .split(',')
  .map(t => t.trim())
  .filter(Boolean);

// ── getAccessMode — exported for config endpoint ───────────────
export function getAccessMode() {
  return ACCESS_MODE;
}

// ── requireAdmin ───────────────────────────────────────────────
/**
 * Middleware that checks for valid admin Bearer token.
 * Ends the response with 401/403 if invalid.
 * Caller should check res.writableEnded after calling.
 */
export function requireAdmin(req, res) {
  if (!ADMIN_TOKEN) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'لم يتم تكوين توكن الأدمن',
      code:  'ADMIN_NOT_CONFIGURED',
    }));
    return;
  }

  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : '';

  if (!token) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'مطلوب توكن المصادقة',
      code:  'AUTH_REQUIRED',
    }));
    return;
  }

  if (!timingSafeEqual(token, ADMIN_TOKEN)) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'توكن غير صالح',
      code:  'INVALID_TOKEN',
    }));
    return;
  }

  // Flag successful admin auth (Phase 26 — used by buildPermissionContext)
  req._isAdmin = true;
}

// ── requireAccess ──────────────────────────────────────────────
/**
 * Middleware that checks user access based on ACCESS_MODE.
 * For 'public' mode — always passes.
 * For 'pin' mode — checks X-Access-Pin header.
 * For 'token' mode — checks X-Access-Token header or ?token= query.
 * Ends response with 401/403 if invalid.
 */
export function requireAccess(req, res) {
  if (ACCESS_MODE === 'public') return;

  if (ACCESS_MODE === 'pin') {
    const pin = req.headers['x-access-pin'] || '';
    if (!pin) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'مطلوب رمز الدخول',
        code:  'PIN_REQUIRED',
      }));
      return;
    }
    if (!ACCESS_PIN || !timingSafeEqual(pin, ACCESS_PIN)) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'رمز الدخول غير صحيح',
        code:  'INVALID_PIN',
      }));
      return;
    }
    req._authenticated = true; // Phase 26 — used by buildPermissionContext
    return;
  }

  if (ACCESS_MODE === 'token') {
    // Check header first, then query param
    let token = req.headers['x-access-token'] || '';
    if (!token) {
      const url = new URL(req.url, `http://${req.headers.host}`);
      token = url.searchParams.get('token') || '';
    }
    if (!token) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'مطلوب توكن الوصول',
        code:  'TOKEN_REQUIRED',
      }));
      return;
    }
    const valid = ACCESS_TOKENS.some(t => timingSafeEqual(token, t));
    if (!valid) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'توكن الوصول غير صالح',
        code:  'INVALID_ACCESS_TOKEN',
      }));
      return;
    }
    req._authenticated = true; // Phase 26 — used by buildPermissionContext
    return;
  }

  // Unknown mode — treat as public (backward compatible)
}

// ── verifyAccess — for POST /api/auth/verify ───────────────────
/**
 * Verifies a PIN or token and returns { valid, mode }.
 * Used by the /api/auth/verify endpoint.
 */
export function verifyAccess(credential) {
  if (ACCESS_MODE === 'public') {
    return { valid: true, mode: 'public' };
  }

  if (ACCESS_MODE === 'pin') {
    if (!credential || !ACCESS_PIN) return { valid: false, mode: 'pin' };
    return {
      valid: timingSafeEqual(credential, ACCESS_PIN),
      mode:  'pin',
    };
  }

  if (ACCESS_MODE === 'token') {
    if (!credential || ACCESS_TOKENS.length === 0) return { valid: false, mode: 'token' };
    const valid = ACCESS_TOKENS.some(t => timingSafeEqual(credential, t));
    return { valid, mode: 'token' };
  }

  return { valid: true, mode: ACCESS_MODE };
}

// ── Timing-safe string comparison ──────────────────────────────
function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}
