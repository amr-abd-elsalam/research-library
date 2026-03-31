import { applyCors }      from './middleware/cors.js';
import { applyRateLimit } from './middleware/rateLimit.js';
import { validateBody }   from './middleware/validate.js';
import { handleChat }     from './handlers/chat.js';
import { handleTopics }   from './handlers/topics.js';
import { handleHealth }   from './handlers/health.js';
import { handleConfig }   from './handlers/configHandler.js';

// ── URL matcher (strips query string + trailing slash) ─────────
function matchRoute(reqUrl, routePath) {
  const i        = reqUrl.indexOf('?');
  const pathname = i === -1 ? reqUrl : reqUrl.slice(0, i);
  return pathname === routePath || pathname === routePath + '/';
}

export async function router(req, res) {
  const { method, url } = req;

  // ── CORS preflight ─────────────────────────────────────────────
  if (method === 'OPTIONS') {
    applyCors(req, res);
    if (res.writableEnded) return;
    res.writeHead(204);
    res.end();
    return;
  }

  // ── Apply CORS on every request ────────────────────────────────
  applyCors(req, res);
  if (res.writableEnded) return;

  // ── Routes ─────────────────────────────────────────────────────

  // GET /api/health
  if (method === 'GET' && matchRoute(url, '/api/health')) {
    await applyRateLimit(req, res, 'health');
    if (res.writableEnded) return;
    await handleHealth(req, res);
    return;
  }

  // GET /api/config
  if (method === 'GET' && matchRoute(url, '/api/config')) {
    await handleConfig(req, res);
    return;
  }

  // GET /api/topics
  if (method === 'GET' && matchRoute(url, '/api/topics')) {
    await applyRateLimit(req, res, 'topics');
    if (res.writableEnded) return;
    await handleTopics(req, res);
    return;
  }

  // POST /api/chat
  if (method === 'POST' && matchRoute(url, '/api/chat')) {
    await applyRateLimit(req, res, 'chat');
    if (res.writableEnded) return;
    await validateBody(req, res);
    if (res.writableEnded) return;
    await handleChat(req, res);
    return;
  }

  // 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not Found', code: 'NOT_FOUND' }));
}
