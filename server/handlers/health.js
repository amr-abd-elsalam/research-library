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

// ── handler ────────────────────────────────────────────────────
export async function handleHealth(req, res) {
  const [qdrant, gemini] = await Promise.all([checkQdrant(), checkGemini()]);

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
  });

  res.writeHead(allOk ? 200 : 207, { 'Content-Type': 'application/json' });
  res.end(body);
}
