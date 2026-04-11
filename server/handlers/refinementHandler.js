// server/handlers/refinementHandler.js
// ═══════════════════════════════════════════════════════════════
// GET /api/admin/refinement — Phase 103
// Dedicated endpoint for answer refinement analytics.
// Reads from refinementAnalytics.getStats() and config settings.
// Protected by admin auth. Read-only — no mutations.
// ═══════════════════════════════════════════════════════════════

import { refinementAnalytics } from '../services/refinementAnalytics.js';
import { featureFlags } from '../services/featureFlags.js';
import config from '../../config.js';

export async function handleAdminRefinement(_req, res) {
  try {
    const stats = refinementAnalytics.getStats();
    const recent = refinementAnalytics.getRecent(10);

    const payload = {
      enabled: featureFlags.isEnabled('ANSWER_REFINEMENT'),
      ...stats,
      recentEntries: recent,
      maxEntries: config.REFINEMENT_ANALYTICS?.maxEntries ?? 200,
      config: {
        maxRefinements: config.ANSWER_REFINEMENT?.maxRefinements ?? 1,
        minScoreToRetry: config.ANSWER_REFINEMENT?.minScoreToRetry ?? 0.3,
        streamingRevisionEnabled: config.ANSWER_REFINEMENT?.streamingRevisionEnabled === true,
      },
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Failed to load refinement data', code: 'REFINEMENT_ERROR' }));
  }
}
