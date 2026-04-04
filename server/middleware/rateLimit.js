// In-memory rate limiter — per IP, per route
// Limits: chat 10/min — topics 30/min — health 10/min

const LIMITS = {
  chat:     { max: 10,  windowMs: 60_000 },
  topics:   { max: 30,  windowMs: 60_000 },
  health:   { max: 10,  windowMs: 60_000 },
  feedback: { max: 10,  windowMs: 60_000 },
};

// store: Map<route, Map<ip, { count, resetAt }>>
const store = new Map();

// ── IP extraction (Cloudflare-aware) ───────────────────────────
function getIP(req) {
  // CF-Connecting-IP is set by Cloudflare — cannot be spoofed
  const cfIP = req.headers['cf-connecting-ip'];
  if (cfIP) return cfIP.trim();

  // Fallback for local development (no Cloudflare)
  return req.socket?.remoteAddress || 'unknown';
}

// ── Cleanup expired entries every 5 minutes ────────────────────
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [route, routeStore] of store) {
    for (const [ip, entry] of routeStore) {
      if (now > entry.resetAt) {
        routeStore.delete(ip);
      }
    }
    if (routeStore.size === 0) {
      store.delete(route);
    }
  }
}, 5 * 60 * 1000);
cleanupTimer.unref();

// ── Apply rate limit ───────────────────────────────────────────
export async function applyRateLimit(req, res, route) {
  const limit = LIMITS[route];
  if (!limit) return;

  const ip  = getIP(req);
  const now = Date.now();

  if (!store.has(route)) store.set(route, new Map());
  const routeStore = store.get(route);

  const entry = routeStore.get(ip);

  // ── New or expired window ──────────────────────────────────────
  if (!entry || now > entry.resetAt) {
    routeStore.set(ip, { count: 1, resetAt: now + limit.windowMs });
    return;
  }

  // ── Within window ──────────────────────────────────────────────
  if (entry.count >= limit.max) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    res.writeHead(429, {
      'Content-Type':  'application/json',
      'Retry-After':   String(retryAfter),
    });
    res.end(JSON.stringify({
      error: 'يرجى الانتظار قليلاً قبل المحاولة مجدداً',
      code:  'RATE_LIMITED',
    }));
    return;
  }

  entry.count += 1;
}
