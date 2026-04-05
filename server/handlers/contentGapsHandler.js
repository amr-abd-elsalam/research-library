// server/handlers/contentGapsHandler.js
// ═══════════════════════════════════════════════════════════════
// GET /api/admin/gaps — Phase 38
// Returns top content gaps detected by ContentGapDetector.
// Admin-only (requireAdmin applied in router).
// ═══════════════════════════════════════════════════════════════

import { contentGapDetector } from '../services/contentGapDetector.js';
import { metrics } from '../services/metrics.js';
import config from '../../config.js';

// ── Helper: sum all values in a counter bucket ──────────────────
function sumCounter(bucket) {
  if (!bucket || typeof bucket !== 'object') return 0;
  let total = 0;
  for (const key in bucket) total += bucket[key] || 0;
  return total;
}

export async function handleContentGaps(req, res) {
  try {
    if (!contentGapDetector.enabled) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ enabled: false, gaps: [], adminAlert: false, gapRate: 0, alertThreshold: 0 }));
      return;
    }

    // Parse ?limit=N query parameter (default 20, max 50)
    const url   = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const raw   = parseInt(url.searchParams.get('limit'), 10);
    const limit = Number.isFinite(raw) && raw > 0 ? Math.min(raw, 50) : 20;
    const filterLibrary = url.searchParams.get('library_id') || null;

    const counts = contentGapDetector.counts();
    const gaps   = contentGapDetector.getGaps(limit, filterLibrary);

    // ── Admin alert calculation (Phase 39) ───────────────────
    const snapshot      = metrics.snapshot();
    const counters      = snapshot.counters || {};
    const totalRequests = sumCounter(counters.requests_total);
    const totalGaps     = sumCounter(counters.content_gap_total);
    const gapRate       = totalRequests > 0 ? totalGaps / totalRequests : 0;
    const alertThreshold = config.CONTENT_GAPS?.alertThreshold ?? 0.20;
    const adminAlert    = gapRate > alertThreshold && totalRequests > 20;

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      enabled:      true,
      totalEntries: counts.totalEntries,
      clusterCount: counts.clusterCount,
      gaps,
      adminAlert,
      gapRate:        Math.round(gapRate * 10000) / 10000,
      alertThreshold,
    }));

  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'حدث خطأ في جلب فجوات المحتوى',
      code:  'CONTENT_GAPS_ERROR',
    }));
  }
}
