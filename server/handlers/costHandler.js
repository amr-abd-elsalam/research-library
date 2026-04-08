// server/handlers/costHandler.js
// ═══════════════════════════════════════════════════════════════
// GET /api/admin/cost — Phase 77
// Returns cost governance data from CostGovernor singleton.
// Includes global usage, per-provider breakdown, and top sessions.
// Protected by admin auth.
// ═══════════════════════════════════════════════════════════════

import { costGovernor } from '../services/costGovernor.js';
import config from '../../config.js';

export async function handleAdminCost(_req, res) {
  const globalUsage = costGovernor.getGlobalUsage();

  // ── Per-provider breakdown ──────────────────────────────────
  const providerNames = Object.keys(config.COST_GOVERNANCE?.perProviderRates ?? {});
  const providers = providerNames.map(name => {
    const usage = costGovernor.getProviderUsage(name);
    return {
      name,
      inputTokens:  usage?.inputTokens  ?? 0,
      outputTokens: usage?.outputTokens ?? 0,
      requests:     usage?.requests     ?? 0,
      estimatedCost: usage?.estimatedCost ?? 0,
    };
  });

  // ── Top sessions by cost ────────────────────────────────────
  const topSessions = costGovernor.getTopSessions(10);

  const payload = {
    enabled:              costGovernor.enabled,
    enforcementEnabled:   costGovernor.enforcementEnabled,
    globalUsage,
    providers,
    topSessions,
    monthlyBudgetCeiling: config.COST_GOVERNANCE?.monthlyBudgetCeiling ?? 0,
    monthlyBudgetUsed:    globalUsage.totalCost,
  };

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}
