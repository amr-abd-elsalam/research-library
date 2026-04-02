// server/handlers/metricsHandler.js
// ═══════════════════════════════════════════════════════════════
// GET /api/admin/metrics — Phase 14
// Returns in-memory metrics snapshot. Protected by admin auth.
// ═══════════════════════════════════════════════════════════════

import { metrics }            from '../services/metrics.js';
import { cache }              from '../services/cache.js';
import { pipelineAnalytics }  from '../services/pipelineAnalytics.js';

export async function handleMetrics(req, res) {
  try {
    const snapshot   = metrics.snapshot();
    const cacheStats = cache.stats();

    const response = {
      collected_at:    new Date().toISOString(),
      uptime_sec:      Math.floor(process.uptime()),
      metrics:         snapshot,
      cache:           cacheStats,
      recommendations: pipelineAnalytics.recommendations(),
      digest:          pipelineAnalytics.digest(),
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(response, null, 2));

  } catch (err) {
    console.error('[metrics] handler error:', err.message);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'حدث خطأ في جلب المقاييس',
      code:  'METRICS_ERROR',
    }));
  }
}
