// server/handlers/adminLogHandler.js
// ═══════════════════════════════════════════════════════════════
// GET /api/admin/log — Phase 16
// Returns operational log entries. Protected by admin auth.
// ═══════════════════════════════════════════════════════════════

import { operationalLog } from '../services/operationalLog.js';

export async function handleAdminLog(req, res) {
  try {
    // Parse limit from query string
    const queryStart = req.url.indexOf('?');
    let limit = 100;
    if (queryStart !== -1) {
      const params = new URLSearchParams(req.url.slice(queryStart));
      const rawLimit = parseInt(params.get('limit'), 10);
      if (!Number.isNaN(rawLimit) && rawLimit > 0) {
        limit = Math.min(rawLimit, 500);
      }
    }

    const entries = operationalLog.recent(limit);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      entries,
      total: operationalLog.size,
      limit,
    }));

  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'حدث خطأ في جلب سجل الأحداث',
      code:  'LOG_ERROR',
    }));
  }
}
