// server/handlers/contentGapsHandler.js
// ═══════════════════════════════════════════════════════════════
// GET /api/admin/gaps — Phase 38
// Returns top content gaps detected by ContentGapDetector.
// Admin-only (requireAdmin applied in router).
// ═══════════════════════════════════════════════════════════════

import { contentGapDetector } from '../services/contentGapDetector.js';

export async function handleContentGaps(req, res) {
  try {
    if (!contentGapDetector.enabled) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ enabled: false, gaps: [] }));
      return;
    }

    // Parse ?limit=N query parameter (default 20, max 50)
    const url   = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const raw   = parseInt(url.searchParams.get('limit'), 10);
    const limit = Number.isFinite(raw) && raw > 0 ? Math.min(raw, 50) : 20;

    const counts = contentGapDetector.counts();
    const gaps   = contentGapDetector.getGaps(limit);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      enabled:      true,
      totalEntries: counts.totalEntries,
      clusterCount: counts.clusterCount,
      gaps,
    }));

  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'حدث خطأ في جلب فجوات المحتوى',
      code:  'CONTENT_GAPS_ERROR',
    }));
  }
}
