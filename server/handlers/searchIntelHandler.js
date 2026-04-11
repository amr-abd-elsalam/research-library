// server/handlers/searchIntelHandler.js
// ═══════════════════════════════════════════════════════════════
// GET /api/admin/search-intel — Phase 103
// Unified search intelligence endpoint combining 4 singletons:
// searchReranker, queryComplexityAnalyzer, queryPlanner, ragStrategySelector.
// Protected by admin auth. Read-only — no mutations.
// ═══════════════════════════════════════════════════════════════

import { searchReranker } from '../services/searchReranker.js';
import { queryComplexityAnalyzer } from '../services/queryComplexityAnalyzer.js';
import { queryPlanner } from '../services/queryPlanner.js';
import { ragStrategySelector } from '../services/ragStrategySelector.js';
import config from '../../config.js';

export async function handleAdminSearchIntel(_req, res) {
  try {
    const rerankerCounts = searchReranker.counts();
    const complexityCounts = queryComplexityAnalyzer.counts();
    const plannerCounts = queryPlanner.counts();
    const strategyCounts = ragStrategySelector.counts();

    const payload = {
      reranker: {
        ...rerankerCounts,
        diversityWeight: config.RETRIEVAL?.diversityWeight ?? 0.3,
        keywordWeight: config.RETRIEVAL?.keywordWeight ?? 0.3,
        maxPerFile: config.RETRIEVAL?.maxPerFile ?? 3,
        minDiverseFiles: config.RETRIEVAL?.minDiverseFiles ?? 2,
      },
      complexity: {
        ...complexityCounts,
        strategies: Object.keys(config.QUERY_COMPLEXITY?.strategies ?? {}),
      },
      planner: {
        ...plannerCounts,
        maxSubQueries: config.QUERY_PLANNING?.maxSubQueries ?? 3,
        mergeStrategy: config.QUERY_PLANNING?.mergeStrategy ?? 'interleave',
        minComplexityForPlan: config.QUERY_PLANNING?.minComplexityForPlan ?? 'comparative',
      },
      strategy: {
        ...strategyCounts,
        definedStrategies: Object.keys(config.RAG_STRATEGIES?.strategies ?? {}),
      },
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Failed to load search intelligence data', code: 'SEARCH_INTEL_ERROR' }));
  }
}
