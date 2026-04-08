// server/services/listeners/costListener.js
// ═══════════════════════════════════════════════════════════════
// Cost Listener — Phase 76 (Listener #23)
// Listens to pipeline:complete and records token usage in CostGovernor.
// Uses token estimates from pipeline (actual usage tracking via
// CostGovernor is complementary to SessionBudgetTracker).
// Zero overhead when COST_GOVERNANCE.enabled === false.
// ═══════════════════════════════════════════════════════════════

import { eventBus } from '../eventBus.js';
import { costGovernor } from '../costGovernor.js';
import config from '../../../config.js';

function register() {
  eventBus.on('pipeline:complete', (data) => {
    if (!costGovernor.enabled) return;
    if (data.aborted) return;

    const sessionId    = data.sessionId || null;
    const inputTokens  = data._tokenEstimates?.input  ?? 0;
    const outputTokens = data._tokenEstimates?.output ?? 0;

    // Provider name from config (active provider)
    const providerName = config.LLM_PROVIDER?.provider || 'gemini';

    costGovernor.recordUsage(sessionId, { inputTokens, outputTokens }, providerName);
  });
}

export { register };
