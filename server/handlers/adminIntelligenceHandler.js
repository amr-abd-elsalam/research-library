// server/handlers/adminIntelligenceHandler.js
// ═══════════════════════════════════════════════════════════════
// GET /api/admin/intelligence — Phase 53
// Returns admin intelligence insights + analysis metadata.
// Admin-only (requireAdmin applied in router).
// ═══════════════════════════════════════════════════════════════

import { adminIntelligence } from '../services/adminIntelligence.js';

export async function handleAdminIntelligence(_req, res) {
  try {
    if (!adminIntelligence.enabled) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        enabled: false,
        insights: [],
        analysisCount: 0,
        lastAnalyzedAt: null,
        rollingStats: null,
      }));
      return;
    }

    const counts = adminIntelligence.counts();

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      enabled: true,
      insights: adminIntelligence.getInsights(),
      analysisCount: counts.analysisCount,
      lastAnalyzedAt: counts.lastAnalyzedAt,
      rollingStats: adminIntelligence.getRollingStats(),
    }));

  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'حدث خطأ في تحميل بيانات الذكاء',
      code: 'INTELLIGENCE_ERROR',
    }));
  }
}
