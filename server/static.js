import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import url  from 'node:url';

const __dirname    = path.dirname(url.fileURLToPath(import.meta.url));
const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');

const MIME = {
  '.html':  'text/html; charset=utf-8',
  '.css':   'text/css; charset=utf-8',
  '.js':    'application/javascript; charset=utf-8',
  '.json':  'application/json; charset=utf-8',
  '.png':   'image/png',
  '.jpg':   'image/jpeg',
  '.jpeg':  'image/jpeg',
  '.svg':   'image/svg+xml',
  '.ico':   'image/x-icon',
  '.woff':  'font/woff',
  '.woff2': 'font/woff2',
  '.ttf':   'font/ttf',
};

// ── Security headers for HTML pages ────────────────────────────
function getSecurityHeaders(ext) {
  const headers = {
    'X-Content-Type-Options': 'nosniff',
  };

  if (ext === '.html') {
    headers['X-Frame-Options']    = 'DENY';
    headers['Referrer-Policy']    = 'strict-origin-when-cross-origin';
    headers['Permissions-Policy'] = 'camera=(), microphone=(), geolocation=()';
    headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains';
  }

  return headers;
}

// ── Security: prevent path traversal ──────────────────────────
function isSafePath(filePath) {
  const normalized = path.normalize(filePath);
  return normalized.startsWith(FRONTEND_DIR);
}

// ── Cache headers per file type ────────────────────────────────
function getCacheHeader(ext) {
  if (ext === '.html')  return 'no-cache';
  if (ext === '.woff2') return 'public, max-age=31536000, immutable';
  if (ext === '.js' || ext === '.css') return 'public, max-age=86400';
  return 'public, max-age=3600';
}

// ── Resolve file path ──────────────────────────────────────────
function resolveFilePath(reqUrl) {
  let urlPath;
  try {
    urlPath = decodeURIComponent(reqUrl.split('?')[0]);
  } catch {
    return null;
  }

  // Null byte protection
  if (urlPath.includes('\0')) return null;

  // root → index.html
  if (urlPath === '/') urlPath = '/index.html';

  const filePath = path.normalize(path.join(FRONTEND_DIR, urlPath));

  if (!isSafePath(filePath)) return null;

  return filePath;
}

// ── serveStatic ────────────────────────────────────────────────
export async function serveStatic(req, res) {
  const filePath = resolveFilePath(req.url);

  // ── Path traversal / decode error ─────────────────────────
  if (!filePath) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Bad Request' }));
    return;
  }

  // ── Check file exists ──────────────────────────────────────
  let fileStat;
  try {
    fileStat = await stat(filePath);
  } catch {
    // File not found → 404
    res.writeHead(404, {
      'Content-Type':           'application/json',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(JSON.stringify({ error: 'Not Found' }));
    return;
  }

  // ── No directory listing ───────────────────────────────────
  if (fileStat.isDirectory()) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Forbidden' }));
    return;
  }

  // ── File size limit (10MB) ─────────────────────────────────
  if (fileStat.size > 10 * 1024 * 1024) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Forbidden' }));
    return;
  }

  // ── Serve file ─────────────────────────────────────────────
  const ext         = path.extname(filePath).toLowerCase();
  const contentType = MIME[ext] || 'application/octet-stream';
  const cacheHeader = getCacheHeader(ext);
  const secHeaders  = getSecurityHeaders(ext);

  // Block source maps in production
  if (ext === '.map' && process.env.NODE_ENV === 'production') {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not Found' }));
    return;
  }

  let content;
  try {
    content = await readFile(filePath);
  } catch {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal Server Error' }));
    return;
  }

  res.writeHead(200, {
    'Content-Type':  contentType,
    'Cache-Control': cacheHeader,
    ...secHeaders,
  });
  res.end(content);
}
