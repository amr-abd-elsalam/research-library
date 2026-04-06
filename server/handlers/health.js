import { getCollectionInfo, QdrantTimeoutError, QdrantNotFoundError, QdrantConnectionError } from '../services/qdrant.js';
import { embedText, GeminiTimeoutError, GeminiAPIError }                                     from '../services/gemini.js';
import { cache }                                                                              from '../services/cache.js';
import { allCircuitStats }                                                                    from '../services/circuitBreaker.js';
import config                                                                                 from '../../config.js';
import { bootstrap }                                                                          from '../bootstrap.js';

// ── checkQdrant ────────────────────────────────────────────────
async function checkQdrant() {
  try {
    const info   = await getCollectionInfo();
    const status = info?.status;
    const count  = info?.points_count ?? info?.vectors_count ?? 0;

    return {
      status:       status === 'green' || status === 'ok' || !!status,
      points_count: count,
    };
  } catch (err) {
    if (err instanceof QdrantNotFoundError) {
      return { status: false, points_count: 0, detail: 'collection not found' };
    }
    if (err instanceof QdrantTimeoutError) {
      return { status: false, points_count: 0, detail: 'timeout' };
    }
    return { status: false, points_count: 0, detail: 'connection error' };
  }
}

// ── checkGemini ────────────────────────────────────────────────
async function checkGemini() {
  const t0 = Date.now();
  try {
    await embedText('ping', 'CLASSIFICATION');
    return { status: true, latency_ms: Date.now() - t0 };
  } catch (err) {
    // 429 = quota exceeded — API is reachable
    if (err instanceof GeminiAPIError && err.status === 429) {
      return { status: true, detail: 'quota limited', latency_ms: Date.now() - t0 };
    }
    if (err instanceof GeminiTimeoutError) {
      return { status: false, detail: 'timeout', latency_ms: Date.now() - t0 };
    }
    return { status: false, detail: 'api error', latency_ms: Date.now() - t0 };
  }
}

// ── Cached External Health Probes (Phase 65) ───────────────────
let _externalHealthCache = null;
let _externalHealthCacheTs = 0;

async function checkExternalHealthCached() {
  const cfg = config.OBSERVABILITY?.periodicHealthCheck;
  if (!cfg || cfg.enabled !== true) return null;

  const ttl = cfg.cacheTtlMs ?? 30000;
  const now = Date.now();
  if (_externalHealthCache && (now - _externalHealthCacheTs) < ttl) {
    return _externalHealthCache;
  }

  const [qdrantResult, geminiResult] = await Promise.all([checkQdrant(), checkGemini()]);
  _externalHealthCache = { qdrant: qdrantResult, gemini: geminiResult, checkedAt: new Date().toISOString() };
  _externalHealthCacheTs = now;
  return _externalHealthCache;
}

// ── handler ────────────────────────────────────────────────────
export async function handleHealth(req, res) {
  // Phase 65: when periodicHealthCheck enabled — use cached probes, otherwise real-time
  const cached = await checkExternalHealthCached();
  const [qdrant, gemini] = cached
    ? [cached.qdrant, cached.gemini]
    : await Promise.all([checkQdrant(), checkGemini()]);

  const allOk  = qdrant.status === true && gemini.status === true;
  const status = allOk ? 'ok' : 'degraded';

  const body = JSON.stringify({
    status,
    qdrant,
    gemini,
    cache:  cache.stats(),
    system: {
      uptime_sec: Math.floor(process.uptime()),
      memory_mb:  Math.round(process.memoryUsage().rss / 1024 / 1024),
      node_env:   process.env.NODE_ENV || 'development',
    },
    bootstrap: {
      ready:      bootstrap.isReady,
      durationMs: bootstrap.report?.durationMs ?? null,
    },
    circuits:  allCircuitStats(),
    brand:     config.BRAND.name,
    timestamp: new Date().toISOString(),
    ...(cached ? { external: cached } : {}),
  });

  res.writeHead(allOk ? 200 : 207, { 'Content-Type': 'application/json' });
  res.end(body);
}
