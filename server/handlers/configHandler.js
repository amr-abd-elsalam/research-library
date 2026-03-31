import config from '../../config.js';
import { getAccessMode } from '../middleware/auth.js';

const HEADERS = {
  'Content-Type':  'application/json',
  'Cache-Control': 'public, max-age=300',
};

// ── Build payload (lazy — computed on first request) ──────────
let cachedPayload = null;

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
    COMMANDS:   config.COMMANDS,
  });
  return cachedPayload;
}

export async function handleConfig(req, res) {
  res.writeHead(200, HEADERS);
  res.end(buildPayload());
}
