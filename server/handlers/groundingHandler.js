// server/handlers/groundingHandler.js
// ═══════════════════════════════════════════════════════════════
// GET /api/admin/grounding — Phase 102
// Dedicated endpoint for grounding analytics + score distribution.
// Reads from groundingAnalytics.getStats() and config settings.
// Protected by admin auth. Read-only — no mutations.
// ═══════════════════════════════════════════════════════════════

import { groundingAnalytics } from '../services/groundingAnalytics.js';
import { answerGroundingChecker } from '../services/answerGroundingChecker.js';
import { featureFlags } from '../services/featureFlags.js';
import config from '../../config.js';

export async function handleAdminGrounding(_req, res) {
  try {
    const stats = groundingAnalytics.getStats();

    const payload = {
      ...stats,
      config: {
        enabled: answerGroundingChecker.enabled,
        minGroundingScore: config.GROUNDING?.minGroundingScore ?? 0.4,
        warnUser: config.GROUNDING?.warnUser ?? true,
        maxClaimsToCheck: config.GROUNDING?.maxClaimsToCheck ?? 10,
        semanticMatchingEnabled: featureFlags.isEnabled('SEMANTIC_MATCHING'),
        citationEnabled: featureFlags.isEnabled('CITATION'),
      },
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Failed to load grounding data', code: 'GROUNDING_ERROR' }));
  }
}
