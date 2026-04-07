// server/handlers/adminLogHandler.js
// ═══════════════════════════════════════════════════════════════
// GET /api/admin/log — Phase 16
// Returns operational log entries. Protected by admin auth.
// ═══════════════════════════════════════════════════════════════

import { operationalLog } from '../services/operationalLog.js';

export async function handleAdminLog(req, res) {
  try {
    // Parse query parameters
    const queryStart = req.url.indexOf('?');
    let limit = 100;
    const criteria = {};
    let hasFilter = false;

    if (queryStart !== -1) {
      const params = new URLSearchParams(req.url.slice(queryStart));

      const rawLimit = parseInt(params.get('limit'), 10);
      if (!Number.isNaN(rawLimit) && rawLimit > 0) {
        limit = Math.min(rawLimit, 500);
      }

      // Filter parameters (Phase 68)
      const requestId = params.get('requestId');
      const level     = params.get('level');
      const module    = params.get('module');
      const rawFrom   = params.get('from');
      const rawTo     = params.get('to');

      if (requestId) { criteria.requestId = requestId; hasFilter = true; }
      if (level)     { criteria.level     = level;     hasFilter = true; }
      if (module)    { criteria.module    = module;    hasFilter = true; }
      if (rawFrom)   { const v = parseInt(rawFrom, 10); if (!Number.isNaN(v)) { criteria.from = v; hasFilter = true; } }
      if (rawTo)     { const v = parseInt(rawTo,   10); if (!Number.isNaN(v)) { criteria.to   = v; hasFilter = true; } }
    }

    const entries = hasFilter
      ? operationalLog.filterBy(criteria, limit)
      : operationalLog.recent(limit);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      entries,
      total: operationalLog.size,
      limit,
      filtered: hasFilter,
    }));

  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'حدث خطأ في جلب سجل الأحداث',
      code:  'LOG_ERROR',
    }));
  }
}
