// server/handlers/adminStats.js
// ═══════════════════════════════════════════════════════════════
// GET /api/admin/stats — returns analytics and cost summary
// Protected by admin Bearer token
// ═══════════════════════════════════════════════════════════════

import { getStats }       from '../services/analytics.js';
import { getCostSummary } from '../services/costTracker.js';
import { cache }          from '../services/cache.js';

// ── Handler ────────────────────────────────────────────────────
export async function handleAdminStats(req, res) {
  try {
    // Parse optional ?since= query parameter (Unix ms timestamp)
    const url   = new URL(req.url, `http://${req.headers.host}`);
    const since = parseInt(url.searchParams.get('since'), 10) || 0;

    // Gather data
    const analyticsStats = await getStats(since);
    const costSummary    = getCostSummary(analyticsStats);
    const cacheStats     = cache.stats();

    const response = {
      period: {
        since: since > 0 ? new Date(since).toISOString() : 'all',
        until: new Date().toISOString(),
      },
      analytics: analyticsStats,
      cost:      costSummary,
      cache:     cacheStats,
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(response, null, 2));

  } catch (err) {
    console.error('[adminStats] error:', err.message);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'حدث خطأ في جلب الإحصائيات',
      code:  'STATS_ERROR',
    }));
  }
}
