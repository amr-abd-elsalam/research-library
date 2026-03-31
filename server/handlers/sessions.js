// server/handlers/sessions.js
// ═══════════════════════════════════════════════════════════════
// Session endpoints — create, get, delete, list (admin)
// All session operations are defensive — errors never break chat
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';
import {
  createSession,
  getSession,
  deleteSession,
  listSessions,
  hashIPFromRequest,
} from '../services/sessions.js';

// ── Custom Error ───────────────────────────────────────────────
export class SessionHandlerError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SessionHandlerError';
  }
}

// ── UUID v4 regex ──────────────────────────────────────────────
const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// ── Helper: read JSON body (small, max 1KB) ────────────────────
async function readSmallBody(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 1024) return null;
  }
  try {
    return JSON.parse(body);
  } catch {
    return {};
  }
}

// ── Helper: check if sessions are enabled ──────────────────────
function sessionsDisabledResponse(res) {
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    error: 'الجلسات غير مفعّلة',
    code:  'SESSIONS_DISABLED',
  }));
}

// ── Extract session ID from URL path ───────────────────────────
export function extractSessionId(url) {
  // Matches: /api/sessions/{uuid}  or  /api/sessions/{uuid}/
  const i = url.indexOf('?');
  const pathname = i === -1 ? url : url.slice(0, i);
  const match = pathname.match(/^\/api\/sessions\/([^/]+)\/?$/);
  if (!match) return null;
  const id = match[1];
  return UUID_V4_RE.test(id) ? id : null;
}

// ═══════════════════════════════════════════════════════════════
// POST /api/sessions — Create a new session
// ═══════════════════════════════════════════════════════════════
export async function handleCreateSession(req, res) {
  if (!config.SESSIONS.enabled) {
    sessionsDisabledResponse(res);
    return;
  }

  try {
    const parsed = await readSmallBody(req);
    if (parsed === null) {
      res.writeHead(413, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'الطلب كبير جداً', code: 'PAYLOAD_TOO_LARGE' }));
      return;
    }

    const topicFilter = (typeof parsed.topic_filter === 'string' && parsed.topic_filter.length <= 64)
      ? parsed.topic_filter
      : null;

    const ipHash = hashIPFromRequest(req);
    const result = await createSession(ipHash, topicFilter);

    res.writeHead(201, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));

  } catch (err) {
    console.error('[sessions:create] error:', err.message);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'فشل إنشاء الجلسة',
      code:  'SESSION_CREATE_ERROR',
    }));
  }
}

// ═══════════════════════════════════════════════════════════════
// GET /api/sessions/:id — Get session by ID
// ═══════════════════════════════════════════════════════════════
export async function handleGetSession(req, res) {
  if (!config.SESSIONS.enabled) {
    sessionsDisabledResponse(res);
    return;
  }

  const sessionId = extractSessionId(req.url);
  if (!sessionId) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'معرّف الجلسة غير صالح',
      code:  'INVALID_SESSION_ID',
    }));
    return;
  }

  try {
    const session = await getSession(sessionId);
    if (!session) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'الجلسة غير موجودة',
        code:  'SESSION_NOT_FOUND',
      }));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(session));

  } catch (err) {
    console.error('[sessions:get] error:', err.message);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'فشل جلب الجلسة',
      code:  'SESSION_GET_ERROR',
    }));
  }
}

// ═══════════════════════════════════════════════════════════════
// DELETE /api/sessions/:id — Delete session
// ═══════════════════════════════════════════════════════════════
export async function handleDeleteSession(req, res) {
  if (!config.SESSIONS.enabled) {
    sessionsDisabledResponse(res);
    return;
  }

  const sessionId = extractSessionId(req.url);
  if (!sessionId) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'معرّف الجلسة غير صالح',
      code:  'INVALID_SESSION_ID',
    }));
    return;
  }

  try {
    const deleted = await deleteSession(sessionId);
    if (!deleted) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'الجلسة غير موجودة',
        code:  'SESSION_NOT_FOUND',
      }));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ deleted: true }));

  } catch (err) {
    console.error('[sessions:delete] error:', err.message);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'فشل حذف الجلسة',
      code:  'SESSION_DELETE_ERROR',
    }));
  }
}

// ═══════════════════════════════════════════════════════════════
// GET /api/admin/sessions — List all sessions (admin only, metadata only)
// ═══════════════════════════════════════════════════════════════
export async function handleListSessions(req, res) {
  if (!config.SESSIONS.enabled) {
    sessionsDisabledResponse(res);
    return;
  }

  try {
    const url    = new URL(req.url, `http://${req.headers.host}`);
    const limit  = url.searchParams.get('limit')  || '50';
    const offset = url.searchParams.get('offset') || '0';
    const since  = url.searchParams.get('since')  || '0';

    const result = await listSessions({ limit, offset, since });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));

  } catch (err) {
    console.error('[sessions:list] error:', err.message);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'فشل جلب قائمة الجلسات',
      code:  'SESSION_LIST_ERROR',
    }));
  }
}
