// server/handlers/healthScoreHandler.js
// ═══════════════════════════════════════════════════════════════
// GET /api/admin/health-score — Phase 42
// Returns unified health score + breakdown + action items.
// Admin-only (requireAdmin applied in router).
// ═══════════════════════════════════════════════════════════════

import { libraryHealthScorer } from '../services/libraryHealthScorer.js';

export async function handleHealthScore(_req, res) {
  try {
    if (!libraryHealthScorer.enabled) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Health score disabled',
        code:  'FEATURE_DISABLED',
      }));
      return;
    }

    const result = libraryHealthScorer.compute();

    if (result === null) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Health score unavailable',
        code:  'FEATURE_DISABLED',
      }));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));

  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'حدث خطأ في حساب مؤشر الصحة',
      code:  'HEALTH_SCORE_ERROR',
    }));
  }
}
