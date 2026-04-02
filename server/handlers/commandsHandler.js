// server/handlers/commandsHandler.js
// ═══════════════════════════════════════════════════════════════
// GET /api/commands — Phase 20
// Returns command graph (categorized) or search results.
// Public endpoint — commands are visible to all users.
// ═══════════════════════════════════════════════════════════════

import { commandRegistry } from '../services/commandRegistry.js';

/**
 * GET /api/commands       → command graph (builtins/custom/plugins)
 * GET /api/commands?q=xxx → search results matching query
 */
export async function handleCommands(req, res) {
  try {
    const i     = req.url.indexOf('?');
    const query = i === -1 ? null : new URLSearchParams(req.url.slice(i)).get('q');

    const result = query
      ? { commands: commandRegistry.search(query), query }
      : commandRegistry.graph();

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));

  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'حدث خطأ في استعراض الأوامر',
      code:  'COMMANDS_ERROR',
    }));
  }
}
