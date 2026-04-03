import config from '../../config.js';
import { getAccessMode } from '../middleware/auth.js';
import { commandRegistry } from '../services/commandRegistry.js';

const HEADERS = {
  'Content-Type':  'application/json',
  'Cache-Control': 'public, max-age=300',
};

// ── Build payload (lazy — computed on first request) ──────────
let cachedPayload = null;

// Note: CONTEXT, FOLLOWUP, ADMIN, SYSTEM_PROMPT — backend-only, not exposed to client
function buildPayload() {
  if (cachedPayload) return cachedPayload;
  cachedPayload = JSON.stringify({
    BRAND:      config.BRAND,
    META:       config.META,
    LIBRARY:    config.LIBRARY,
    CHAT:       config.CHAT,
    CONFIDENCE: config.CONFIDENCE,
    LIMITS:     config.LIMITS,
    API:        config.API,
    AUTH:       { mode: getAccessMode() },
    COMMANDS: {
      enabled: config.COMMANDS.enabled,
      prefix:  config.COMMANDS.prefix,
      list:    commandRegistry.list().map(c => ({
        cmd:   c.name,
        label: c.description.slice(0, 20),
        desc:  c.description,
      })),
    },

    SESSIONS:   { enabled: config.SESSIONS.enabled },

    RESPONSE: {
      defaultMode:         config.RESPONSE?.defaultMode ?? 'stream',
      allowedModes:        config.RESPONSE?.allowedModes ?? ['stream'],
      conciseMaxSentences: config.RESPONSE?.conciseMaxSentences ?? 3,
    },

    SUGGESTIONS: {
      enabled:        config.SUGGESTIONS?.enabled === true,
      maxSuggestions:  config.SUGGESTIONS?.maxSuggestions ?? 3,
    },

    FEEDBACK: {
      enabled:        config.FEEDBACK?.enabled === true,
      allowComments:  config.FEEDBACK?.allowComments !== false,
    },

    AUDIT: {
      enabled: config.AUDIT?.enabled !== false,
      persistAudit: config.AUDIT?.persistAudit === true,
    },

    LIBRARY_INDEX: {
      enabled: config.LIBRARY_INDEX?.enabled === true,
    },

    SYSTEM_PROMPT_ENRICHMENT: {
      enabled: config.SYSTEM_PROMPT_ENRICHMENT?.enabled === true,
    },

    CONTENT_GAPS: {
      enabled: config.CONTENT_GAPS?.enabled === true,
    },

    // TIERS: moved to GET /api/whoami (Phase 27 — per-request, not static config)
  });
  return cachedPayload;
}

export async function handleConfig(req, res) {
  res.writeHead(200, HEADERS);
  res.end(buildPayload());
}
