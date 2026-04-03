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
import { auditPersister } from '../auditPersister.js';

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
  const fullEntry = { ...entry, timestamp: Date.now() };
  trail.push(fullEntry);

  // Enforce max entries per session — evict oldest
  while (trail.length > MAX_ENTRIES_PER_SESSION) {
    trail.shift();
  }

  // Persist to disk (Phase 35 — fire-and-forget, scheduleWrite buffers internally)
  auditPersister.scheduleWrite(sessionId, fullEntry);
}

// ── System-level audit entries (Phase 43) ──────────────────────
function addSystemEntry(entry) {
  if (!enabled) return;
  const key = '__system__';
  if (!sessionTrails.has(key)) {
    // System key does NOT count towards MAX_SESSIONS eviction
    sessionTrails.set(key, []);
  }
  const trail = sessionTrails.get(key);
  const fullEntry = { ...entry, timestamp: entry.timestamp || Date.now() };
  trail.push(fullEntry);

  // Enforce max entries
  while (trail.length > MAX_ENTRIES_PER_SESSION) {
    trail.shift();
  }

  // Persist if enabled
  if (auditPersister.enabled) {
    auditPersister.scheduleWrite(key, fullEntry);
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

  // ── command:complete → command entry (Phase 35) ──────────────
  eventBus.on('command:complete', (data) => {
    const sessionId = data.sessionId || null;
    if (!sessionId) return;
    addEntry(sessionId, {
      type:        'command',
      commandName: data.commandName || data.command || null,
      timestamp:   data.timestamp || Date.now(),
    });
  });

  // ── execution:routed → routing entry (Phase 35) ──────────────
  eventBus.on('execution:routed', (data) => {
    // Skip 'pipeline' action — pipeline:complete already records queries
    if (data.action === 'pipeline') return;
    const sessionId = data.sessionId || null;
    if (!sessionId) return;
    addEntry(sessionId, {
      type:      'routing',
      action:    data.action,
      latencyMs: data.latencyMs || 0,
      timestamp: data.timestamp || Date.now(),
    });
  });

  // ── admin:action → system audit entry (Phase 43) ─────────────
  eventBus.on('admin:action', (data) => {
    if (config.ADMIN_ACTIONS?.auditEnabled === false) return;
    addSystemEntry({
      type:       'admin_action',
      action:     data.action,
      params:     data.params || {},
      success:    data.result?.success ?? true,
      detail:     data.result?.message || data.result?.error || '',
      durationMs: data.durationMs,
      timestamp:  data.timestamp || Date.now(),
    });
  });

  logger.info('auditTrail', `listener registered (maxSessions: ${MAX_SESSIONS}, maxEntriesPerSession: ${MAX_ENTRIES_PER_SESSION}, persistence: ${auditPersister.enabled})`);
}
