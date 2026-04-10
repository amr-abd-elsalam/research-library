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
  resumeSession,
  exportSession,
} from '../services/sessions.js';
import { eventBus } from '../services/eventBus.js';
import { sessionBudget } from '../services/sessionBudget.js';
import { conversationContext } from '../services/conversationContext.js';
import { sessionQualityScorer } from '../services/sessionQualityScorer.js';
import { contextPersister } from '../services/contextPersister.js';
import { logger } from '../services/logger.js';
import { sessionReplaySerializer } from '../services/sessionReplaySerializer.js';
import { sessionMetadataIndex } from '../services/sessionMetadataIndex.js';
import { addConnection } from '../services/listeners/sessionStreamListener.js';
import fsp from 'node:fs/promises';
import fs from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __handler_dirname = dirname(fileURLToPath(import.meta.url));
const SESSIONS_DIR = join(__handler_dirname, '..', '..', 'data', 'sessions');

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

    // Enrich sessions with quality score (Phase 40)
    if (result.sessions) {
      for (const session of result.sessions) {
        session.qualityScore = sessionQualityScorer.getScore(session.session_id);
      }
    }

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

// ═══════════════════════════════════════════════════════════════
// GET /api/sessions — User-scoped session list (Phase 90, optimized Phase 91)
// Returns last 50 sessions sorted by last_activity DESC.
// Each session includes first_message (truncated to 50 chars).
// Phase 91: uses in-memory SessionMetadataIndex when available (O(1)).
// Falls back to O(n) disk reads when index is disabled or not warmed up.
// ═══════════════════════════════════════════════════════════════
export async function handleListUserSessions(req, res) {
  if (!config.SESSIONS.enabled) {
    sessionsDisabledResponse(res);
    return;
  }

  try {
    // Phase 92: extract IP hash for per-user isolation
    const ipHash = hashIPFromRequest(req);

    // Phase 91+92: use metadata index with per-user isolation
    if (sessionMetadataIndex.enabled && sessionMetadataIndex.isWarmedUp) {
      const sessions = sessionMetadataIndex.list({ limit: 50, ipHash });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ sessions }));
      return;
    }

    // Fallback: original Phase 90 O(n) implementation
    const result = await listSessions({ limit: '50', offset: '0', since: '0' });
    let sessions = (result.sessions || []).map(s => {
      return {
        session_id:    s.session_id,
        created_at:    s.created_at,
        last_active:   s.last_active,
        message_count: s.message_count || 0,
        topic_filter:  s.topic_filter,
        first_message: null,
        ip_hash:       s.ip_hash || null,
      };
    });

    // Phase 92: filter by ip_hash in fallback path
    if (ipHash && config.SESSION_INDEX?.perUserIsolation !== false) {
      sessions = sessions.filter(s => s.ip_hash === ipHash);
    }

    // Enrich each session with first user message (truncated)
    for (const s of sessions) {
      try {
        const full = await getSession(s.session_id);
        if (full && full.messages && full.messages.length > 0) {
          const firstUser = full.messages.find(m => m.role === 'user');
          if (firstUser && firstUser.text) {
            s.first_message = firstUser.text.length > 50
              ? firstUser.text.slice(0, 50) + '…'
              : firstUser.text;
          }
        }
      } catch (_) {
        // Non-fatal — leave first_message as null
      }
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ sessions }));

  } catch (err) {
    console.error('[sessions:list-user] error:', err.message);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'فشل جلب قائمة الجلسات',
      code:  'SESSION_LIST_ERROR',
    }));
  }
}

// ═══════════════════════════════════════════════════════════════
// GET /api/sessions/stream — SSE real-time session updates (Phase 93)
// Sends events when current user's sessions are updated.
// ═══════════════════════════════════════════════════════════════
export async function handleSessionStream(req, res) {
  if (!config.SESSIONS?.enabled || config.SESSION_INDEX?.sseEnabled === false) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'الميزة غير مفعّلة', code: 'FEATURE_DISABLED' }));
    return;
  }

  const ipHash = hashIPFromRequest(req);

  // SSE headers
  res.writeHead(200, {
    'Content-Type':      'text/event-stream',
    'Cache-Control':     'no-cache',
    'Connection':        'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  // Disable socket timeout for long-lived SSE
  if (typeof res.setTimeout === 'function') {
    res.setTimeout(0);
  }

  // Initial connection event
  res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);

  // Register connection for SSE push
  addConnection(ipHash, res);

  // Heartbeat every 30s to keep connection alive through proxies
  const heartbeat = setInterval(() => {
    if (!res.writableEnded) {
      res.write(': heartbeat\n\n');
    }
  }, 30000);
  if (heartbeat.unref) heartbeat.unref();

  req.on('close', () => {
    clearInterval(heartbeat);
  });
}

// ── Helper: resolve + write session file (Phase 94) ────────────
async function _resolveAndWrite(sessionId, session) {
  const fileName = `${sessionId}.json`;
  try {
    const dateDirs = await fsp.readdir(SESSIONS_DIR);
    dateDirs.sort((a, b) => b.localeCompare(a));
    for (const dir of dateDirs) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dir)) continue;
      const filePath = join(SESSIONS_DIR, dir, fileName);
      try {
        await fsp.access(filePath, fs.constants.F_OK);
        const tmpPath = filePath + '.tmp';
        await fsp.writeFile(tmpPath, JSON.stringify(session, null, 2), 'utf8');
        await fsp.rename(tmpPath, filePath);
        return true;
      } catch { continue; }
    }
  } catch { /* sessions dir missing */ }
  return false;
}

// ═══════════════════════════════════════════════════════════════
// PATCH /api/sessions/:id/title — Update session custom title (Phase 94)
// ═══════════════════════════════════════════════════════════════
export async function handleUpdateSessionTitle(req, res) {
  if (!config.SESSIONS?.enabled) {
    sessionsDisabledResponse(res);
    return;
  }

  const body = req._validatedBody || {};
  const title = body.title;
  if (!title || typeof title !== 'string' || title.trim().length === 0 || title.trim().length > 100) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'العنوان مطلوب (1-100 حرف)', code: 'INVALID_TITLE' }));
    return;
  }

  // Extract session ID from URL using extractSessionAction (defined below)
  const actionInfo = extractSessionAction(req.url);
  const sessionId = actionInfo?.id;
  if (!sessionId) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'معرّف الجلسة مطلوب', code: 'MISSING_SESSION_ID' }));
    return;
  }

  const session = await getSession(sessionId);
  if (!session) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'الجلسة غير موجودة', code: 'SESSION_NOT_FOUND' }));
    return;
  }

  const ipHash = hashIPFromRequest(req);
  if (session.ip_hash && session.ip_hash !== ipHash) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'غير مسموح', code: 'FORBIDDEN' }));
    return;
  }

  const trimmedTitle = title.trim();
  session.custom_title = trimmedTitle;

  const written = await _resolveAndWrite(sessionId, session);
  if (!written) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'ملف الجلسة غير موجود', code: 'FILE_NOT_FOUND' }));
    return;
  }

  sessionMetadataIndex.upsert(sessionId, { custom_title: trimmedTitle });
  eventBus.emit('session:meta_updated', { sessionId, ipHash, field: 'title', timestamp: Date.now() });

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true, custom_title: trimmedTitle }));
}

// ═══════════════════════════════════════════════════════════════
// POST /api/sessions/:id/pin — Toggle session pin state (Phase 94)
// ═══════════════════════════════════════════════════════════════
export async function handleTogglePin(req, res) {
  if (!config.SESSIONS?.enabled) {
    sessionsDisabledResponse(res);
    return;
  }

  const actionInfo = extractSessionAction(req.url);
  const sessionId = actionInfo?.id;
  if (!sessionId) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'معرّف الجلسة مطلوب', code: 'MISSING_SESSION_ID' }));
    return;
  }

  const session = await getSession(sessionId);
  if (!session) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'الجلسة غير موجودة', code: 'SESSION_NOT_FOUND' }));
    return;
  }

  const ipHash = hashIPFromRequest(req);
  if (session.ip_hash && session.ip_hash !== ipHash) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'غير مسموح', code: 'FORBIDDEN' }));
    return;
  }

  const newPinned = !(session.pinned || false);
  session.pinned = newPinned;

  const written = await _resolveAndWrite(sessionId, session);
  if (!written) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'ملف الجلسة غير موجود', code: 'FILE_NOT_FOUND' }));
    return;
  }

  sessionMetadataIndex.upsert(sessionId, { pinned: newPinned });
  eventBus.emit('session:meta_updated', { sessionId, ipHash, field: 'pin', timestamp: Date.now() });

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true, pinned: newPinned }));
}

// ── Session action URL matcher ─────────────────────────────────
const SESSION_ACTION_RE = /^\/api\/sessions\/([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/(resume|export|replay|title|pin)\/?$/i;

/**
 * Extracts session ID and action from URLs like /api/sessions/:id/resume
 * @param {string} url
 * @returns {{ id: string, action: string }|null}
 */
export function extractSessionAction(url) {
  const i = url.indexOf('?');
  const pathname = i === -1 ? url : url.slice(0, i);
  const match = pathname.match(SESSION_ACTION_RE);
  if (!match) return null;
  return { id: match[1], action: match[2] };
}

// ═══════════════════════════════════════════════════════════════
// POST /api/sessions/:id/resume — Resume a previous session
// ═══════════════════════════════════════════════════════════════
export async function handleResumeSession(req, res) {
  if (!config.SESSIONS.enabled) {
    sessionsDisabledResponse(res);
    return;
  }

  const parsed = extractSessionAction(req.url);
  if (!parsed || parsed.action !== 'resume') {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'session_id مطلوب', code: 'BAD_REQUEST' }));
    return;
  }

  try {
    const result = await resumeSession(parsed.id);
    if (!result) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'الجلسة غير موجودة', code: 'SESSION_NOT_FOUND' }));
      return;
    }

    // Restore ConversationContext from persisted file (Phase 31)
    try {
      if (contextPersister.enabled) {
        const ctxData = await contextPersister.read(parsed.id);
        if (ctxData) {
          const restored = conversationContext.restore(parsed.id, ctxData);
          if (restored) {
            logger.debug('sessions', `restored conversation context for session ${parsed.id.slice(0, 8)}`);
          }
        }
      }
    } catch (err) {
      logger.warn('sessions', 'context restoration failed (non-fatal)', { error: err.message });
    }

    // Attach budget info if available
    const budget = sessionBudget.get(parsed.id);
    if (budget) {
      result.budget = budget;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));

  } catch (err) {
    console.error('[sessions:resume] error:', err.message);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'حدث خطأ في استئناف الجلسة', code: 'RESUME_ERROR' }));
  }
}

// ═══════════════════════════════════════════════════════════════
// GET /api/admin/sessions/:id/replay — Replay session conversation (Phase 84)
// ═══════════════════════════════════════════════════════════════
export async function handleSessionReplay(req, res) {
  if (!sessionReplaySerializer.enabled) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'إعادة تشغيل الجلسات غير مفعّلة',
      code:  'FEATURE_DISABLED',
    }));
    return;
  }

  const parsed = extractSessionAction(req.url);
  if (!parsed || parsed.action !== 'replay') {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'session_id مطلوب', code: 'BAD_REQUEST' }));
    return;
  }

  try {
    const replay = sessionReplaySerializer.buildReplay(parsed.id);
    if (!replay) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'لا توجد بيانات إعادة تشغيل لهذه الجلسة',
        code:  'NO_REPLAY_DATA',
      }));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(replay));

  } catch (err) {
    console.error('[sessions:replay] error:', err.message);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'حدث خطأ في إعادة تشغيل الجلسة',
      code:  'REPLAY_ERROR',
    }));
  }
}

// ═══════════════════════════════════════════════════════════════
// GET /api/sessions/:id/export — Export session as Markdown
// ═══════════════════════════════════════════════════════════════
export async function handleExportSession(req, res) {
  if (!config.SESSIONS.enabled) {
    sessionsDisabledResponse(res);
    return;
  }

  const parsed = extractSessionAction(req.url);
  if (!parsed || parsed.action !== 'export') {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'session_id مطلوب', code: 'BAD_REQUEST' }));
    return;
  }

  try {
    const result = await exportSession(parsed.id);
    if (!result) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'الجلسة غير موجودة', code: 'SESSION_NOT_FOUND' }));
      return;
    }

    res.writeHead(200, {
      'Content-Type':        'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="${result.fileName}"`,
    });
    res.end(result.markdown);

  } catch (err) {
    console.error('[sessions:export] error:', err.message);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'حدث خطأ في تصدير الجلسة', code: 'EXPORT_ERROR' }));
  }
}
