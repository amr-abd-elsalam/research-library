// server/handlers/suggestionsHandler.js
// ═══════════════════════════════════════════════════════════════
// Suggestion Analytics Handler — Phase 57
// GET /api/admin/suggestions — admin-only endpoint returning
// suggestion click analytics (top clicked, effectiveness, counts).
// ═══════════════════════════════════════════════════════════════

import { suggestionsEngine } from '../services/suggestionsEngine.js';

export async function handleSuggestionAnalytics(_req, res) {
  const clickData = suggestionsEngine.getClickCounts();
  const counts    = suggestionsEngine.counts();

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    enabled:           counts.enabled,
    totalClicks:       clickData.totalClicks,
    uniqueSuggestions: clickData.uniqueSuggestions,
    topClicked:        clickData.top,
    templateCount:     counts.templateCount,
    maxSuggestions:    counts.maxSuggestions,
    minTurns:          counts.minTurns,
  }));
}
