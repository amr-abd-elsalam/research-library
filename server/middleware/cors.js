const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'http://localhost:3000';
const IS_DEV = process.env.NODE_ENV !== 'production';

export function applyCors(req, res) {
  const origin = req.headers['origin'];

  // ── Always set Vary ────────────────────────────────────────────
  res.setHeader('Vary', 'Origin');

  // ── No origin (curl, server-to-server) → allow through ────────
  if (!origin) return;

  // ── Check if origin is allowed ────────────────────────────────
  const isAllowed = origin === ALLOWED_ORIGIN
    || (IS_DEV && origin.startsWith('http://localhost:'));

  if (isAllowed) {
    res.setHeader('Access-Control-Allow-Origin',      origin);
    res.setHeader('Access-Control-Allow-Methods',     'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers',     'Content-Type, Authorization, X-Access-Pin, X-Access-Token');
    res.setHeader('Access-Control-Allow-Credentials', 'false');
    res.setHeader('Access-Control-Max-Age',           '86400');
    return;
  }

  // ── Reject cross-origin requests from wrong origins ───────────
  res.writeHead(403, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Forbidden', code: 'CORS_REJECTED' }));
}
