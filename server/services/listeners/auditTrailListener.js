// server/services/listeners/auditTrailListener.js
// ═══════════════════════════════════════════════════════════════
// Audit Trail Listener — Phase 34 (Listener #16)
// Builds per-session audit trails from multiple EventBus events:
//   - pipeline:complete   → query entries
//   - pipeline:cacheHit   → cache hit entries
//   - feedback:submitted  → feedback entries
//   - session:evicted     → eviction entries
//
// Config: AUDIT.enabled, AUDIT.maxAuditEntriesPerSession,
//         AUDIT.maxAuditSessions
// Zero overhead when disabled.
// ═══════════════════════════════════════════════════════════════

import config   from '../../../config.js';
import { logger }   from '../logger.js';
import { eventBus } from '../eventBus.js';

// ── Module-level state ─────────────────────────────────────────
const sessionTrails          = new Map();
const MAX_ENTRIES_PER_SESSION = config.AUDIT?.maxAuditEntriesPerSession ?? 100;
const MAX_SESSIONS           = config.AUDIT?.maxAuditSessions ?? 200;
const enabled                = config.AUDIT?.enabled !== false;

// ── Private helper ─────────────────────────────────────────────
function addEntry(sessionId, entry) {
  if (!enabled || !sessionId) return;

  if (!sessionTrails.has(sessionId)) {
    // Enforce max sessions — evict oldest
    if (sessionTrails.size >= MAX_SESSIONS) {
      const oldestKey = sessionTrails.keys().next().value;
      sessionTrails.delete(oldestKey);
    }
    sessionTrails.set(sessionId, []);
  }

  const trail = sessionTrails.get(sessionId);
  trail.push({ ...entry, timestamp: Date.now() });

  // Enforce max entries per session — evict oldest
  while (trail.length > MAX_ENTRIES_PER_SESSION) {
    trail.shift();
  }
}

// ── Public API ─────────────────────────────────────────────────

/**
 * Returns audit trail entries for a session.
 * @param {string} sessionId
 * @param {number} [limit=50]
 * @returns {Array<object>}
 */
export function getTrail(sessionId, limit = 50) {
  const trail = sessionTrails.get(sessionId);
  if (!trail) return [];
  return trail.slice(-limit);
}

/**
 * Summary for inspect endpoint.
 * @returns {{ enabled: boolean, activeSessions: number, maxSessions: number, maxEntriesPerSession: number }}
 */
export function getTrailCounts() {
  return {
    enabled,
    activeSessions:       sessionTrails.size,
    maxSessions:          MAX_SESSIONS,
    maxEntriesPerSession: MAX_ENTRIES_PER_SESSION,
  };
}

/**
 * Registers all audit trail EventBus listeners.
 * @param {EventBus} _eventBus — unused (uses singleton import)
 */
export function register() {
  if (!enabled) {
    logger.info('auditTrail', 'disabled — skipping listener registration');
    return;
  }

  // ── pipeline:complete → query entry ──────────────────────────
  eventBus.on('pipeline:complete', (data) => {
    addEntry(data.sessionId, {
      type:          'query',
      correlationId: data.correlationId,
      message:       data.message,
      queryType:     data.queryType,
      avgScore:      data.avgScore,
      aborted:       data.aborted,
      responseMode:  data._responseMode,
      totalMs:       data.totalMs,
    });
  });

  // ── pipeline:cacheHit → cache hit entry ──────────────────────
  eventBus.on('pipeline:cacheHit', (data) => {
    addEntry(data.sessionId, {
      type:     'cache_hit',
      message:  data.message,
      avgScore: data.avgScore,
    });
  });

  // ── feedback:submitted → feedback entry ──────────────────────
  eventBus.on('feedback:submitted', (data) => {
    addEntry(data.sessionId, {
      type:          'feedback',
      correlationId: data.correlationId,
      rating:        data.rating,
      comment:       data.comment || null,
    });
  });

  // ── session:evicted → eviction entry ─────────────────────────
  eventBus.on('session:evicted', (data) => {
    addEntry(data.sessionId, {
      type: 'evicted',
    });
  });

  logger.info('auditTrail', `listener registered (maxSessions: ${MAX_SESSIONS}, maxEntriesPerSession: ${MAX_ENTRIES_PER_SESSION})`);
}
