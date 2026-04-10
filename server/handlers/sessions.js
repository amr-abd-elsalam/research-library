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
import { sessionBudget } from '../services/sessionBudget.js';
import { conversationContext } from '../services/conversationContext.js';
import { sessionQualityScorer } from '../services/sessionQualityScorer.js';
import { contextPersister } from '../services/contextPersister.js';
import { logger } from '../services/logger.js';
import { sessionReplaySerializer } from '../services/sessionReplaySerializer.js';
import { sessionMetadataIndex } from '../services/sessionMetadataIndex.js';

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
    // Phase 91: use metadata index if available (O(1) vs O(n) disk reads)
    if (sessionMetadataIndex.enabled && sessionMetadataIndex.isWarmedUp) {
      const sessions = sessionMetadataIndex.list({ limit: 50 });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ sessions }));
      return;
    }

    // Fallback: original Phase 90 O(n) implementation
    const result = await listSessions({ limit: '50', offset: '0', since: '0' });
    const sessions = (result.sessions || []).map(s => {
      return {
        session_id:    s.session_id,
        created_at:    s.created_at,
        last_active:   s.last_active,
        message_count: s.message_count || 0,
        topic_filter:  s.topic_filter,
        first_message: null,
      };
    });

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

// ── Session action URL matcher ─────────────────────────────────
const SESSION_ACTION_RE = /^\/api\/sessions\/([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/(resume|export|replay)\/?$/i;

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
