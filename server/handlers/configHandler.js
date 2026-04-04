import config from '../../config.js';
import { getAccessMode } from '../middleware/auth.js';
import { commandRegistry } from '../services/commandRegistry.js';
import { featureFlags } from '../services/featureFlags.js';
import { eventBus } from '../services/eventBus.js';

const HEADERS = {
  'Content-Type':  'application/json',
  'Cache-Control': 'public, max-age=300',
};

// ── Build payload (lazy — computed on first request, invalidated on feature toggle) ──
let cachedPayload = null;

// Phase 45: Invalidate config cache when feature toggled
eventBus.on('feature:toggled', () => {
  cachedPayload = null;
});

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
      enabled:           config.SUGGESTIONS?.enabled === true,
      effectiveEnabled:  featureFlags.isEnabled('SUGGESTIONS'),
      maxSuggestions:    config.SUGGESTIONS?.maxSuggestions ?? 3,
    },

    FEEDBACK: {
      enabled:           config.FEEDBACK?.enabled === true,
      effectiveEnabled:  featureFlags.isEnabled('FEEDBACK'),
      allowComments:     config.FEEDBACK?.allowComments !== false,
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
      includeKnownGaps: config.SYSTEM_PROMPT_ENRICHMENT?.includeKnownGaps === true,
    },

    CONTENT_GAPS: {
      enabled:           config.CONTENT_GAPS?.enabled === true,
      effectiveEnabled:  featureFlags.isEnabled('CONTENT_GAPS'),
      persistGaps:       config.CONTENT_GAPS?.persistGaps === true,
    },

    EXPORT: {
      enabled: config.EXPORT?.enabled === true,
    },

    QUALITY: {
      enabled:           config.QUALITY?.enabled === true,
      effectiveEnabled:  featureFlags.isEnabled('QUALITY'),
    },

    HEALTH_SCORE: {
      enabled:           config.HEALTH_SCORE?.enabled === true,
      effectiveEnabled:  featureFlags.isEnabled('HEALTH_SCORE'),
    },

    ADMIN_ACTIONS: {
      enabled: config.ADMIN_ACTIONS?.enabled !== false,
    },

    FEATURE_FLAGS: {
      persistOverrides: config.FEATURE_FLAGS?.persistOverrides ?? false,
    },

    // TIERS: moved to GET /api/whoami (Phase 27 — per-request, not static config)
  });
  return cachedPayload;
}

export async function handleConfig(req, res) {
  res.writeHead(200, HEADERS);
  res.end(buildPayload());
}

/**
 * GET /api/config/features — Phase 46
 * Lightweight endpoint returning effective feature state only.
 * Public (no admin auth required) — same access level as /api/config.
 * Returns 5 boolean values: one per managed feature section.
 * Always computed fresh (no caching) — reflects runtime overrides immediately.
 */
export async function handleConfigFeatures(_req, res) {
  const payload = {
    FEEDBACK:     featureFlags.isEnabled('FEEDBACK'),
    SUGGESTIONS:  featureFlags.isEnabled('SUGGESTIONS'),
    CONTENT_GAPS: featureFlags.isEnabled('CONTENT_GAPS'),
    QUALITY:      featureFlags.isEnabled('QUALITY'),
    HEALTH_SCORE: featureFlags.isEnabled('HEALTH_SCORE'),
  };
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}
