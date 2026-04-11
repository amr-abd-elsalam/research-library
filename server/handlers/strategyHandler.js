// server/handlers/strategyHandler.js
// ═══════════════════════════════════════════════════════════════
// GET /api/admin/strategy — Phase 103
// Dedicated endpoint for RAG strategy analytics.
// Reads from strategyAnalytics.getPerformance() + ragStrategySelector.counts().
// Protected by admin auth. Read-only — no mutations.
// ═══════════════════════════════════════════════════════════════

import { strategyAnalytics } from '../services/strategyAnalytics.js';
import { ragStrategySelector } from '../services/ragStrategySelector.js';
import { featureFlags } from '../services/featureFlags.js';
import config from '../../config.js';

export async function handleAdminStrategy(_req, res) {
  try {
    const performance = strategyAnalytics.getPerformance();
    const selectorCounts = ragStrategySelector.counts();
    const recent = strategyAnalytics.getRecent(10);

    const payload = {
      enabled: featureFlags.isEnabled('RAG_STRATEGIES'),
      ...performance,
      selectorTotalSelections: selectorCounts.totalSelections,
      selectorStrategyBreakdown: selectorCounts.strategyBreakdown,
      recentEntries: recent,
      maxEntries: config.STRATEGY_ANALYTICS?.maxEntries ?? 200,
      config: {
        strategies: Object.keys(config.RAG_STRATEGIES?.strategies ?? {}),
        turnThresholdForConversational: config.RAG_STRATEGIES?.selectionRules?.turnThresholdForConversational ?? 3,
        lowScoreThresholdForDeep: config.RAG_STRATEGIES?.selectionRules?.lowScoreThresholdForDeep ?? 0.5,
        maxQuickFactualWords: config.RAG_STRATEGIES?.selectionRules?.maxQuickFactualWords ?? 10,
        useRollingScore: config.RAG_STRATEGIES?.selectionRules?.useRollingScore !== false,
      },
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Failed to load strategy data', code: 'STRATEGY_ERROR' }));
  }
}
