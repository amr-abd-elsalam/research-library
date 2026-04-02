// server/handlers/whoamiHandler.js
// ═══════════════════════════════════════════════════════════════
// GET /api/whoami — Phase 27
// Returns the current user's tier and permissions based on auth state.
// Uses the same buildPermissionContext(req) factory as chat.js.
// When TIERS.enabled === false → returns all-null permissions
// (frontend shows everything — identical behavior to Phase 26).
// ═══════════════════════════════════════════════════════════════

import { buildPermissionContext } from '../services/permissionContext.js';
import config from '../../config.js';

export async function handleWhoami(req, res) {
  const permCtx = buildPermissionContext(req);

  // ── Base payload (tiers disabled or no tier config) ──────
  const payload = {
    tiersEnabled: config.TIERS?.enabled === true,
    tier:         permCtx.tier || null,
    permissions: {
      allowedCommands:     null,  // null = all allowed (wildcard)
      allowedModes:        null,
      allowedTopics:       null,
      maxTokensPerSession: 0,    // 0 = use global limit
    },
  };

  // ── Populate specific permissions when tiers are enabled ──
  if (config.TIERS?.enabled === true && permCtx.tier) {
    const tierDef = config.TIERS?.definitions?.[permCtx.tier];
    if (tierDef) {
      payload.permissions = {
        allowedCommands:     tierDef.allowedCommands === '*' ? null : (Array.isArray(tierDef.allowedCommands) ? tierDef.allowedCommands : null),
        allowedModes:        tierDef.allowedModes === '*' ? null : (Array.isArray(tierDef.allowedModes) ? tierDef.allowedModes : null),
        allowedTopics:       tierDef.allowedTopics === '*' ? null : (Array.isArray(tierDef.allowedTopics) ? tierDef.allowedTopics : null),
        maxTokensPerSession: tierDef.maxTokensPerSession ?? 0,
      };
    }
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}
