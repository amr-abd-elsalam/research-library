import config from '../../config.js';
import { getAccessMode } from '../middleware/auth.js';
import { commandRegistry } from '../services/commandRegistry.js';
import { featureFlags } from '../services/featureFlags.js';
import { dynamicWelcomeSuggestions } from '../services/dynamicWelcomeSuggestions.js';

const HEADERS = {
  'Content-Type':  'application/json',
  'Cache-Control': 'public, max-age=300',
};

// ── Build payload (lazy — computed on first request, invalidated via configCacheListener) ──
let cachedPayload = null;

/** Invalidates the cached config payload. Called by configCacheListener (Phase 62). */
export function invalidateConfigCache() {
  cachedPayload = null;
}

// Note: CONTEXT, FOLLOWUP, ADMIN, SYSTEM_PROMPT — backend-only, not exposed to client
function buildPayload() {
  if (cachedPayload) return cachedPayload;

  // Phase 59: dynamic welcome suggestions (null when disabled or empty)
  const dynSuggestions = dynamicWelcomeSuggestions.generate();
  const dynamicSuggestionsValue = dynSuggestions.length > 0 ? dynSuggestions : null;

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

    // Phase 59: dynamic welcome suggestions from library content + click analytics
    dynamicSuggestions: dynamicSuggestionsValue,

    // Phase 60: multi-library info (does NOT expose qdrantCollection — security)
    libraries: config.MULTI_LIBRARY?.enabled === true
      ? {
          enabled: true,
          defaultLibrary: config.MULTI_LIBRARY.defaultLibrary || ((config.MULTI_LIBRARY.libraries || [])[0]?.id ?? null),
          libraries: (config.MULTI_LIBRARY.libraries || []).map(lib => ({
            id:          lib.id,
            name:        lib.name || lib.id,
            domainLabel: lib.domainLabel || null,
          })),
        }
      : { enabled: false, libraries: [] },

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
 * Returns 9 boolean values: one per managed feature section.
 * Always computed fresh (no caching) — reflects runtime overrides immediately.
 */
export async function handleConfigFeatures(_req, res) {
  const payload = {
    ADMIN_INTELLIGENCE: featureFlags.isEnabled('ADMIN_INTELLIGENCE'),
    FEEDBACK:           featureFlags.isEnabled('FEEDBACK'),
    SUGGESTIONS:        featureFlags.isEnabled('SUGGESTIONS'),
    CONTENT_GAPS:       featureFlags.isEnabled('CONTENT_GAPS'),
    QUALITY:            featureFlags.isEnabled('QUALITY'),
    HEALTH_SCORE:       featureFlags.isEnabled('HEALTH_SCORE'),
    RETRIEVAL:          featureFlags.isEnabled('RETRIEVAL'),
    QUERY_COMPLEXITY:   featureFlags.isEnabled('QUERY_COMPLEXITY'),
    GROUNDING:          featureFlags.isEnabled('GROUNDING'),
    CITATION:           featureFlags.isEnabled('CITATION'),
    SEMANTIC_MATCHING:  featureFlags.isEnabled('SEMANTIC_MATCHING'),
    COST_GOVERNANCE:    featureFlags.isEnabled('COST_GOVERNANCE'),
    ANSWER_REFINEMENT:  featureFlags.isEnabled('ANSWER_REFINEMENT'),
    QUERY_PLANNING:     featureFlags.isEnabled('QUERY_PLANNING'),
    RAG_STRATEGIES:     featureFlags.isEnabled('RAG_STRATEGIES'),
  };
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}
