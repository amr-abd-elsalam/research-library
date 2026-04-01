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
  });
  return cachedPayload;
}

export async function handleConfig(req, res) {
  res.writeHead(200, HEADERS);
  res.end(buildPayload());
}
