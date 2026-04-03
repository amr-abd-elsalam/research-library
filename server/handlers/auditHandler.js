// server/handlers/auditHandler.js
// ═══════════════════════════════════════════════════════════════
// GET /api/admin/audit/:sessionId — Phase 34
// Returns the per-session audit trail (query, cache_hit, feedback,
// evicted events) as a chronological timeline.
// Protected by admin auth. Read-only.
// ═══════════════════════════════════════════════════════════════

import { getTrail } from '../services/listeners/auditTrailListener.js';
import { auditPersister } from '../services/auditPersister.js';
import { sessionQualityScorer } from '../services/sessionQualityScorer.js';

/**
 * GET /api/admin/audit/:sessionId
 * Returns audit trail entries for a specific session.
 */
export async function handleAudit(req, res) {
  // Extract sessionId from URL: /api/admin/audit/{sessionId}
  const match = req.url.match(/\/api\/admin\/audit\/([^/?]+)/);
  const sessionId = match ? match[1] : null;

  if (!sessionId) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'sessionId required', code: 'MISSING_SESSION_ID' }));
    return;
  }

  // Parse query string for limit
  let limit = 50;
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const paramLimit = parseInt(url.searchParams.get('limit'), 10);
    if (!isNaN(paramLimit) && paramLimit > 0) {
      limit = Math.min(paramLimit, 200);
    }
  } catch { /* use default */ }

  let trail = getTrail(sessionId, limit);

  // Fallback to persisted JSONL when in-memory is empty (e.g. after restart) — Phase 35
  if (trail.length === 0 && auditPersister.enabled) {
    trail = await auditPersister.read(sessionId, limit);
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    sessionId,
    entries:      trail,
    total:        trail.length,
    qualityScore: sessionQualityScorer.getScore(sessionId),
  }));
}
