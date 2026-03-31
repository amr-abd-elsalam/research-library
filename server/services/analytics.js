// server/services/analytics.js
// ═══════════════════════════════════════════════════════════════
// Analytics service — JSONL file-based event logging
// Writes one JSON line per event to logs/analytics.jsonl
// Auto-rotates at 50 MB, hashes IPs with daily salt
// ═══════════════════════════════════════════════════════════════

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

// ── Paths ──────────────────────────────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const LOGS_DIR = path.join(PROJECT_ROOT, 'logs');
const LOG_FILE = path.join(LOGS_DIR, 'analytics.jsonl');

// ── Constants ──────────────────────────────────────────────────
const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MB
const SIZE_CHECK_INTERVAL = 100;         // check file size every N writes

// ── Custom Error ───────────────────────────────────────────────
export class AnalyticsError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AnalyticsError';
  }
}

// ── State ──────────────────────────────────────────────────────
let writeCount = 0;
let cachedFileSize = 0;
let initialized = false;

// ── Init: ensure logs/ directory exists ────────────────────────
async function ensureLogsDir() {
  if (initialized) return;
  try {
    await fsp.mkdir(LOGS_DIR, { recursive: true });
    // Seed cached file size
    try {
      const stat = await fsp.stat(LOG_FILE);
      cachedFileSize = stat.size;
    } catch {
      cachedFileSize = 0;
    }
    initialized = true;
  } catch (err) {
    console.error('[analytics] failed to create logs directory:', err.message);
  }
}

// ── IP Hashing (SHA-256 + daily salt) ──────────────────────────
function hashIP(ip) {
  if (!ip) return 'unknown';
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return crypto
    .createHash('sha256')
    .update(`${today}:${ip}`)
    .digest('hex')
    .slice(0, 16); // 16 hex chars — enough for uniqueness, shorter for storage
}

// ── Extract client IP (Cloudflare-aware) ───────────────────────
function getClientIP(req) {
  if (!req) return null;
  // CF-Connecting-IP is set by Cloudflare
  return req.headers?.['cf-connecting-ip']
    || req.headers?.['x-forwarded-for']?.split(',')[0]?.trim()
    || req.socket?.remoteAddress
    || null;
}

// ── Auto-rotate when file exceeds MAX_FILE_BYTES ───────────────
async function rotateIfNeeded() {
  writeCount++;

  // Only stat the file every SIZE_CHECK_INTERVAL writes
  if (writeCount % SIZE_CHECK_INTERVAL !== 0) return;

  try {
    const stat = await fsp.stat(LOG_FILE);
    cachedFileSize = stat.size;
  } catch {
    cachedFileSize = 0;
    return; // file doesn't exist yet
  }

  if (cachedFileSize < MAX_FILE_BYTES) return;

  // Rotate: rename current file with timestamp
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const archiveName = `analytics-${timestamp}.jsonl`;
  const archivePath = path.join(LOGS_DIR, archiveName);

  try {
    await fsp.rename(LOG_FILE, archivePath);
    cachedFileSize = 0;
    writeCount = 0;
    console.log(`[analytics] rotated log → ${archiveName}`);
  } catch (err) {
    console.error('[analytics] rotation failed:', err.message);
  }
}

// ── logEvent (main export) ─────────────────────────────────────
/**
 * Logs an analytics event to the JSONL file.
 * Fire-and-forget — does NOT block the request.
 *
 * @param {object} data - Event data
 * @param {string} data.event_type       - 'chat' | 'command' | etc.
 * @param {object} [data.req]            - http.IncomingMessage (for IP extraction)
 * @param {string} [data.topic_filter]   - Active topic filter or null
 * @param {number} [data.message_length] - Character count of user message
 * @param {number} [data.response_length]- Character count of assistant response
 * @param {number} [data.embedding_tokens]  - Estimated embedding token count
 * @param {number} [data.generation_tokens] - Estimated generation token count
 * @param {number} [data.latency_ms]     - Total request duration in ms
 * @param {number} [data.score]          - Average confidence score
 * @param {number} [data.sources_count]  - Number of sources returned
 * @param {boolean}[data.cache_hit]      - Whether response was from cache
 */
export async function logEvent(data) {
  try {
    await ensureLogsDir();

    // Build the event record
    const { req, ...rest } = data;
    const event = {
      timestamp: new Date().toISOString(),
      ...rest,
      ip_hash: hashIP(getClientIP(req)),
    };

    // Remove the req reference — we don't want to serialize it
    delete event.req;

    const line = JSON.stringify(event) + '\n';

    // Append (non-blocking — we await but caller can fire-and-forget)
    await fsp.appendFile(LOG_FILE, line, 'utf8');

    // Update cached size estimate
    cachedFileSize += Buffer.byteLength(line, 'utf8');

    // Check rotation
    await rotateIfNeeded();

  } catch (err) {
    // Never throw — analytics failure must not break user requests
    console.error('[analytics] logEvent failed:', err.message);
  }
}

// ── getStats ───────────────────────────────────────────────────
/**
 * Reads the current log file and computes aggregate statistics.
 * Only reads the active file (not rotated archives).
 *
 * @param {number} [sinceTimestamp=0] - Unix ms timestamp; only count events after this
 * @returns {object} stats summary
 */
export async function getStats(sinceTimestamp = 0) {
  await ensureLogsDir();

  let lines;
  try {
    const content = await fsp.readFile(LOG_FILE, 'utf8');
    lines = content.trim().split('\n').filter(Boolean);
  } catch (err) {
    if (err.code === 'ENOENT') {
      // No log file yet
      return buildEmptyStats();
    }
    throw new AnalyticsError(`Failed to read analytics log: ${err.message}`);
  }

  // Parse and filter
  const events = [];
  for (const line of lines) {
    try {
      const event = JSON.parse(line);
      const eventTime = new Date(event.timestamp).getTime();
      if (eventTime >= sinceTimestamp) {
        events.push(event);
      }
    } catch {
      // Skip malformed lines
    }
  }

  return computeStats(events);
}

// ── computeStats ───────────────────────────────────────────────
function computeStats(events) {
  const now = Date.now();
  const ONE_DAY = 24 * 60 * 60 * 1000;
  const ONE_WEEK = 7 * ONE_DAY;
  const ONE_MONTH = 30 * ONE_DAY;

  const chatEvents = events.filter(e => e.event_type === 'chat');

  // ── Time-based counts ────────────────────────────────────────
  let today = 0;
  let week = 0;
  let month = 0;

  for (const e of chatEvents) {
    const t = new Date(e.timestamp).getTime();
    const age = now - t;
    if (age <= ONE_DAY) today++;
    if (age <= ONE_WEEK) week++;
    if (age <= ONE_MONTH) month++;
  }

  // ── Topic distribution ───────────────────────────────────────
  const topicCounts = {};
  for (const e of chatEvents) {
    const topic = e.topic_filter || 'all';
    topicCounts[topic] = (topicCounts[topic] || 0) + 1;
  }

  // Sort by count descending
  const topTopics = Object.entries(topicCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([topic, count]) => ({ topic, count }));

  // ── Confidence stats ─────────────────────────────────────────
  const scores = chatEvents
    .map(e => e.score)
    .filter(s => typeof s === 'number' && !isNaN(s));

  const avgScore = scores.length > 0
    ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10000) / 10000
    : 0;

  // ── Cache hit rate ───────────────────────────────────────────
  const cacheHits = chatEvents.filter(e => e.cache_hit === true).length;
  const cacheRate = chatEvents.length > 0
    ? `${((cacheHits / chatEvents.length) * 100).toFixed(2)}%`
    : '0.00%';

  // ── Token & cost totals ──────────────────────────────────────
  let totalEmbeddingTokens = 0;
  let totalGenerationTokens = 0;
  let totalCost = 0;

  for (const e of chatEvents) {
    if (typeof e.embedding_tokens === 'number') totalEmbeddingTokens += e.embedding_tokens;
    if (typeof e.generation_tokens === 'number') totalGenerationTokens += e.generation_tokens;
    if (typeof e.estimated_cost === 'number') totalCost += e.estimated_cost;
  }

  // ── Latency stats ───────────────────────────────────────────
  const latencies = chatEvents
    .map(e => e.latency_ms)
    .filter(l => typeof l === 'number' && !isNaN(l));

  const avgLatency = latencies.length > 0
    ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
    : 0;

  // ── Unique users (by ip_hash) ────────────────────────────────
  const uniqueUsers = new Set(chatEvents.map(e => e.ip_hash).filter(Boolean)).size;

  return {
    total_events: events.length,
    chat: {
      total: chatEvents.length,
      today,
      week,
      month,
    },
    unique_users: uniqueUsers,
    top_topics: topTopics,
    avg_score: avgScore,
    cache: {
      hits: cacheHits,
      total: chatEvents.length,
      hit_rate: cacheRate,
    },
    tokens: {
      embedding: totalEmbeddingTokens,
      generation: totalGenerationTokens,
    },
    estimated_total_cost: Math.round(totalCost * 1_000_000) / 1_000_000,
    avg_latency_ms: avgLatency,
  };
}

// ── Empty stats skeleton ───────────────────────────────────────
function buildEmptyStats() {
  return {
    total_events: 0,
    chat: { total: 0, today: 0, week: 0, month: 0 },
    unique_users: 0,
    top_topics: [],
    avg_score: 0,
    cache: { hits: 0, total: 0, hit_rate: '0.00%' },
    tokens: { embedding: 0, generation: 0 },
    estimated_total_cost: 0,
    avg_latency_ms: 0,
  };
}
