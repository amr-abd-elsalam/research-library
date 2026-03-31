import config from '../../config.js';

// ── إعدادات الواجهة — تُحسب مرة واحدة عند بدء التشغيل ────────
const clientPayload = JSON.stringify({
  BRAND:      config.BRAND,
  META:       config.META,
  LIBRARY:    config.LIBRARY,
  CHAT:       config.CHAT,
  CONFIDENCE: config.CONFIDENCE,
  LIMITS:     config.LIMITS,
  API:        config.API,
});

const HEADERS = {
  'Content-Type':  'application/json',
  'Cache-Control': 'public, max-age=300',
};

export async function handleConfig(req, res) {
  res.writeHead(200, HEADERS);
  res.end(clientPayload);
}
