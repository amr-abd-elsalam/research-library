// server/services/sessions.js
// ═══════════════════════════════════════════════════════════════
// Session service — file-based server-side chat history
// Each session is a separate JSON file stored in data/sessions/YYYY-MM-DD/
// Designed to be fire-and-forget — failures never break the chat flow
// ═══════════════════════════════════════════════════════════════

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import config from '../../config.js';
import { sessionMetadataIndex } from './sessionMetadataIndex.js';

// ── Paths ──────────────────────────────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const SESSIONS_DIR = path.join(PROJECT_ROOT, 'data', 'sessions');

// ── Custom Error ───────────────────────────────────────────────
export class SessionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SessionError';
  }
}

// ── UUID v4 regex ──────────────────────────────────────────────
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// ── Date folder format ─────────────────────────────────────────
function dateFolderName(isoString) {
  return isoString.slice(0, 10); // YYYY-MM-DD
}

// ── Ensure directory exists ────────────────────────────────────
async function ensureDir(dirPath) {
  try {
    await fsp.mkdir(dirPath, { recursive: true });
  } catch (err) {
    // EEXIST is fine — directory already exists
    if (err.code !== 'EEXIST') {
      console.error('[sessions] failed to create directory:', dirPath, err.message);
      throw new SessionError(`Cannot create directory: ${err.message}`);
    }
  }
}

// ── IP Hashing (SHA-256 + stable salt) — Phase 93: stable identity across days ──
function hashIP(ip) {
  if (!ip) return 'unknown';
  const salt = process.env.SESSION_SALT || 'ai8v-session-identity-v1';
  return crypto
    .createHash('sha256')
    .update(`${salt}:${ip}`)
    .digest('hex')
    .slice(0, 16);
}

// ── Extract client IP (Cloudflare-aware) ───────────────────────
function getClientIP(req) {
  if (!req) return null;
  return req.headers?.['cf-connecting-ip']
    || req.headers?.['x-forwarded-for']?.split(',')[0]?.trim()
    || req.socket?.remoteAddress
    || null;
}

// ── Resolve session file path from session_id ──────────────────
// Scans date folders to find the file (since we don't store creation date separately)
async function resolveSessionPath(sessionId) {
  if (!sessionId || !UUID_RE.test(sessionId)) return null;

  // Phase 95: Try cached path first (O(1))
  const cachedPath = sessionMetadataIndex.getPath(sessionId);
  if (cachedPath) {
    try {
      await fsp.access(cachedPath, fs.constants.F_OK);
      return cachedPath;
    } catch {
      // Cache stale — fall through to directory scan
    }
  }

  // Sanitize — only allow uuid chars in the filename
  const fileName = `${sessionId}.json`;

  try {
    const dateDirs = await fsp.readdir(SESSIONS_DIR);
    // Sort descending — most recent first (optimization for recent sessions)
    dateDirs.sort((a, b) => b.localeCompare(a));

    for (const dir of dateDirs) {
      // Validate date folder name format (YYYY-MM-DD)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dir)) continue;

      const filePath = path.join(SESSIONS_DIR, dir, fileName);
      try {
        await fsp.access(filePath, fs.constants.F_OK);
        // Phase 95: Update cache for next time
        sessionMetadataIndex.upsert(sessionId, { filePath });
        return filePath;
      } catch {
        // File not in this date folder — continue
      }
    }
  } catch (err) {
    if (err.code === 'ENOENT') return null; // sessions dir doesn't exist yet
    console.error('[sessions] resolveSessionPath error:', err.message);
  }

  return null;
}

// ── Read session from disk ─────────────────────────────────────
async function readSessionFile(filePath) {
  try {
    const content = await fsp.readFile(filePath, 'utf8');
    return JSON.parse(content);
  } catch (err) {
    console.error('[sessions] readSessionFile error:', filePath, err.message);
    return null;
  }
}

// ── Write session to disk (atomic: write tmp + rename) ─────────
async function writeSessionFile(filePath, data) {
  const tmpPath = filePath + '.tmp';
  try {
    await fsp.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf8');
    await fsp.rename(tmpPath, filePath);
  } catch (err) {
    console.error('[sessions] writeSessionFile error:', filePath, err.message);
    // Clean up tmp file if it exists
    try { await fsp.unlink(tmpPath); } catch { /* ignore */ }
    throw new SessionError(`Cannot write session: ${err.message}`);
  }
}

// ═══════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════

/**
 * Create a new session.
 * @param {string} ipHash - Hashed client IP (16 hex chars)
 * @param {string|null} topicFilter - Active topic filter or null
 * @returns {Promise<{session_id: string, created_at: string}>}
 */
export async function createSession(ipHash, topicFilter = null) {
  const sessionId = crypto.randomUUID();
  const now = new Date().toISOString();
  const dateFolder = dateFolderName(now);
  const dirPath = path.join(SESSIONS_DIR, dateFolder);

  await ensureDir(dirPath);

  const session = {
    session_id:   sessionId,
    created_at:   now,
    last_active:  now,
    ip_hash:      ipHash || 'unknown',
    topic_filter: topicFilter,
    messages:     [],
    token_usage: {
      embedding_tokens:  0,
      generation_input:  0,
      generation_output: 0,
    },
  };

  const filePath = path.join(dirPath, `${sessionId}.json`);
  await writeSessionFile(filePath, session);

  // Phase 95: Propagate file path to metadata index for O(1) future lookups
  sessionMetadataIndex.upsert(sessionId, {
    created_at: now,
    last_active: now,
    ip_hash: ipHash || 'unknown',
    topic_filter: topicFilter,
    filePath,
  });

  return { session_id: sessionId, created_at: now };
}

/**
 * Get a session by ID.
 * @param {string} sessionId - UUID v4
 * @returns {Promise<object|null>} Session object or null if not found
 */
export async function getSession(sessionId) {
  if (!sessionId || !UUID_RE.test(sessionId)) return null;

  const filePath = await resolveSessionPath(sessionId);
  if (!filePath) return null;

  return readSessionFile(filePath);
}

/**
 * Append a message to an existing session.
 * @param {string} sessionId - UUID v4
 * @param {string} role - 'user' | 'assistant'
 * @param {string} text - Message text
 * @param {object} [metadata] - Optional metadata (sources, score, query_type)
 * @returns {Promise<boolean>} true if appended, false if session not found
 */
export async function appendMessage(sessionId, role, text, metadata = {}) {
  if (!sessionId || !UUID_RE.test(sessionId)) return false;

  const filePath = await resolveSessionPath(sessionId);
  if (!filePath) return false;

  const session = await readSessionFile(filePath);
  if (!session) return false;

  // Enforce max messages limit
  const maxMessages = config.SESSIONS?.maxMessages || 100;
  if (session.messages.length >= maxMessages) {
    console.warn(`[sessions] session ${sessionId} reached max messages (${maxMessages})`);
    return false;
  }

  const message = {
    role,
    text,
    timestamp: new Date().toISOString(),
  };

  // Add optional metadata for assistant messages
  if (role === 'assistant') {
    if (metadata.sources !== undefined) message.sources = metadata.sources;
    if (metadata.score !== undefined)   message.score = metadata.score;
    if (metadata.query_type !== undefined) message.query_type = metadata.query_type;
  }

  // Accumulate token usage if provided
  if (metadata.tokens) {
    session.token_usage = session.token_usage || {
      embedding_tokens:  0,
      generation_input:  0,
      generation_output: 0,
    };
    session.token_usage.embedding_tokens  += metadata.tokens.embedding  || 0;
    session.token_usage.generation_input  += metadata.tokens.input      || 0;
    session.token_usage.generation_output += metadata.tokens.output     || 0;
  }

  session.messages.push(message);
  session.last_active = message.timestamp;

  await writeSessionFile(filePath, session);
  return true;
}

/**
 * Delete a session by ID.
 * @param {string} sessionId - UUID v4
 * @returns {Promise<boolean>} true if deleted, false if not found
 */
export async function deleteSession(sessionId) {
  if (!sessionId || !UUID_RE.test(sessionId)) return false;

  const filePath = await resolveSessionPath(sessionId);
  if (!filePath) return false;

  try {
    await fsp.unlink(filePath);
    return true;
  } catch (err) {
    if (err.code === 'ENOENT') return false;
    console.error('[sessions] deleteSession error:', err.message);
    return false;
  }
}

/**
 * List sessions with pagination and optional time filter.
 * Returns metadata only — no message contents.
 * @param {object} [options]
 * @param {number} [options.limit=50] - Max sessions to return
 * @param {number} [options.offset=0] - Skip count
 * @param {number} [options.since=0] - Unix ms timestamp — only sessions after this
 * @returns {Promise<{sessions: Array, total: number}>}
 */
export async function listSessions(options = {}) {
  const limit  = Math.min(Math.max(parseInt(options.limit, 10) || 50, 1), 200);
  const offset = Math.max(parseInt(options.offset, 10) || 0, 0);
  const since  = parseInt(options.since, 10) || 0;

  const allSessions = [];

  try {
    const dateDirs = await fsp.readdir(SESSIONS_DIR);
    // Sort descending — newest first
    dateDirs.sort((a, b) => b.localeCompare(a));

    for (const dir of dateDirs) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dir)) continue;

      const dirPath = path.join(SESSIONS_DIR, dir);

      let files;
      try {
        files = await fsp.readdir(dirPath);
      } catch {
        continue;
      }

      for (const file of files) {
        if (!file.endsWith('.json') || file.endsWith('.tmp')) continue;

        const filePath = path.join(dirPath, file);
        const session = await readSessionFile(filePath);
        if (!session) continue;

        // Apply time filter
        const createdTime = new Date(session.created_at).getTime();
        if (since > 0 && createdTime < since) continue;

        // Return metadata only — no message contents
        allSessions.push({
          session_id:    session.session_id,
          created_at:    session.created_at,
          last_active:   session.last_active,
          message_count: session.messages?.length || 0,
          ip_hash:       session.ip_hash,
          topic_filter:  session.topic_filter,
        });
      }
    }
  } catch (err) {
    if (err.code === 'ENOENT') {
      return { sessions: [], total: 0 };
    }
    console.error('[sessions] listSessions error:', err.message);
    return { sessions: [], total: 0 };
  }

  // Sort by last_active descending
  allSessions.sort((a, b) => b.last_active.localeCompare(a.last_active));

  const total = allSessions.length;
  const paged = allSessions.slice(offset, offset + limit);

  return { sessions: paged, total };
}

/**
 * Clean up expired sessions (older than ttlDays).
 * @param {number} [ttlDays] - Days to keep — defaults to config value
 * @returns {Promise<{deleted: number}>}
 */
export async function cleanExpiredSessions(ttlDays) {
  const ttl = ttlDays ?? config.SESSIONS?.ttlDays ?? 30;
  const cutoff = Date.now() - (ttl * 24 * 60 * 60 * 1000);
  let deleted = 0;

  try {
    const dateDirs = await fsp.readdir(SESSIONS_DIR);

    for (const dir of dateDirs) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dir)) continue;

      // Quick check: if the date folder itself is older than cutoff, delete entire folder
      const folderDate = new Date(dir + 'T23:59:59.999Z').getTime();
      if (folderDate < cutoff) {
        const dirPath = path.join(SESSIONS_DIR, dir);
        try {
          const files = await fsp.readdir(dirPath);
          for (const file of files) {
            if (!file.endsWith('.json')) continue;
            await fsp.unlink(path.join(dirPath, file));
            deleted++;
          }
          // Try to remove the now-empty directory
          await fsp.rmdir(dirPath);
        } catch (err) {
          console.error('[sessions] cleanup error for dir:', dir, err.message);
        }
        continue;
      }

      // For folders near the cutoff, check individual files
      const dirPath = path.join(SESSIONS_DIR, dir);
      let files;
      try {
        files = await fsp.readdir(dirPath);
      } catch {
        continue;
      }

      for (const file of files) {
        if (!file.endsWith('.json') || file.endsWith('.tmp')) continue;

        const filePath = path.join(dirPath, file);
        const session = await readSessionFile(filePath);
        if (!session) continue;

        const lastActive = new Date(session.last_active).getTime();
        if (lastActive < cutoff) {
          try {
            await fsp.unlink(filePath);
            deleted++;
          } catch (err) {
            console.error('[sessions] failed to delete expired session:', file, err.message);
          }
        }
      }

      // Try to remove the directory if empty
      try {
        const remaining = await fsp.readdir(dirPath);
        if (remaining.length === 0) {
          await fsp.rmdir(dirPath);
        }
      } catch { /* ignore */ }
    }
  } catch (err) {
    if (err.code === 'ENOENT') {
      return { deleted: 0 }; // sessions dir doesn't exist
    }
    console.error('[sessions] cleanExpiredSessions error:', err.message);
  }

  if (deleted > 0) {
    console.log(`[sessions] cleaned ${deleted} expired session(s)`);
  }

  return { deleted };
}

/**
 * Returns a session with recent messages formatted for frontend resume.
 * Read-only — does not modify the session file.
 * @param {string} sessionId — UUID v4
 * @param {number} [lastN=20] — last N messages to include
 * @returns {Promise<object|null>} resume payload or null if not found
 */
export async function resumeSession(sessionId, lastN = 20) {
  if (!sessionId || !UUID_RE.test(sessionId)) return null;

  const session = await getSession(sessionId);
  if (!session) return null;

  const allMessages = session.messages || [];
  const messages = allMessages.slice(-Math.max(1, lastN));

  return {
    session_id:    session.session_id,
    created_at:    session.created_at,
    last_active:   session.last_active,
    topic_filter:  session.topic_filter,
    messages:      messages.map(m => ({
      role:      m.role,
      text:      m.text,
      timestamp: m.timestamp,
      sources:   m.sources || undefined,
      score:     m.score   || undefined,
    })),
    token_usage:   session.token_usage || null,
    message_count: allMessages.length,
  };
}

/**
 * Exports a session as a Markdown string.
 * @param {string} sessionId — UUID v4
 * @returns {Promise<{ markdown: string, fileName: string }|null>} or null if not found
 */
export async function exportSession(sessionId) {
  if (!sessionId || !UUID_RE.test(sessionId)) return null;

  const session = await getSession(sessionId);
  if (!session) return null;

  const brandName = config.BRAND?.name || 'Research Library';
  const messages  = session.messages || [];

  const lines = [
    `# ${brandName} — محادثة`,
    '',
    `**تاريخ الإنشاء:** ${session.created_at}`,
    `**آخر نشاط:** ${session.last_active}`,
    `**عدد الرسائل:** ${messages.length}`,
  ];

  if (session.topic_filter) {
    lines.push(`**نطاق البحث:** ${session.topic_filter}`);
  }

  if (session.token_usage) {
    const tu = session.token_usage;
    const total = (tu.embedding_tokens || 0) + (tu.generation_input || 0) + (tu.generation_output || 0);
    lines.push(`**إجمالي الـ tokens:** ${total.toLocaleString()}`);
  }

  lines.push('', '---', '');

  for (const msg of messages) {
    const roleLabel = msg.role === 'user' ? '**أنت:**' : '**المساعد:**';
    const time = msg.timestamp
      ? ` _(${new Date(msg.timestamp).toLocaleString('ar-EG')})_`
      : '';
    lines.push(`${roleLabel}${time}`);
    lines.push('');
    lines.push(msg.text || '');
    lines.push('');

    if (msg.role === 'assistant' && Array.isArray(msg.sources) && msg.sources.length > 0) {
      lines.push('> **المصادر:**');
      for (const src of msg.sources) {
        const label = src.file + (src.section ? ` — ${src.section}` : '');
        lines.push(`> - ${label}`);
      }
      lines.push('');
    }

    lines.push('---', '');
  }

  lines.push(`_تم التصدير من ${brandName}_`);

  const dateStr  = (session.created_at || '').slice(0, 10) || 'unknown';
  const safeName = brandName.replace(/[^a-zA-Z0-9\u0600-\u06FF\s]/g, '_').replace(/\s+/g, '_');
  const fileName = `${safeName}_${dateStr}_${sessionId.slice(0, 8)}.md`;

  return {
    markdown: lines.join('\n'),
    fileName,
  };
}

// ── Convenience: hash IP from request object ───────────────────
export function hashIPFromRequest(req) {
  return hashIP(getClientIP(req));
}

// ── Periodic cleanup (runs every SESSIONS_CLEANUP_HOURS) ───────
const CLEANUP_HOURS = parseInt(process.env.SESSIONS_CLEANUP_HOURS, 10) || 24;
const cleanupTimer = setInterval(
  () => { cleanExpiredSessions().catch(() => {}); },
  CLEANUP_HOURS * 60 * 60 * 1000,
);
cleanupTimer.unref(); // Don't prevent process exit
