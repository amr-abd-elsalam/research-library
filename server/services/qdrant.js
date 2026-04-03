import { QdrantClient } from '@qdrant/js-client-rest';
import { createCircuitBreaker } from './circuitBreaker.js';
import { logger }               from './logger.js';

const QDRANT_URL        = process.env.QDRANT_URL        || 'http://localhost:6333';
const QDRANT_COLLECTION = process.env.QDRANT_COLLECTION || 'knowledge';

const client = new QdrantClient({ url: QDRANT_URL, checkCompatibility: false });

// ── Circuit Breaker (Phase 18) ─────────────────────────────────
const qdrantCB = createCircuitBreaker('qdrant');

// ── Custom Errors ──────────────────────────────────────────────
export class QdrantTimeoutError    extends Error { constructor() { super('Qdrant timeout');     this.name = 'QdrantTimeoutError';    } }
export class QdrantNotFoundError   extends Error { constructor() { super('Collection missing'); this.name = 'QdrantNotFoundError';   } }
export class QdrantConnectionError extends Error { constructor(m){ super(m);                   this.name = 'QdrantConnectionError'; } }

// ── Helpers ────────────────────────────────────────────────────
function withTimeout(promise, ms, ErrorClass) {
  let timer;
  return Promise.race([
    promise.then(
      (v) => { clearTimeout(timer); return v; },
      (e) => { clearTimeout(timer); throw e; },
    ),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new ErrorClass()), ms);
    }),
  ]);
}

// ── search ─────────────────────────────────────────────────────
async function _search(queryVector, topK = 5, topicFilter = null) {
  const params = {
    vector: queryVector,
    limit:  topK,
    with_payload: true,
    with_vectors: false,
  };

  if (topicFilter !== null) {
    const topicId = parseInt(topicFilter, 10);
    if (Number.isNaN(topicId)) {
      return [];
    }
    params.filter = {
      must: [{
        key:   'topic_id',
        match: { value: topicId },
      }],
    };
  }

  try {
    const result = await withTimeout(
      client.search(QDRANT_COLLECTION, params),
      8000,
      QdrantTimeoutError,
    );
    return result;
  } catch (err) {
    if (err instanceof QdrantTimeoutError) throw err;
    if (err?.status === 404) throw new QdrantNotFoundError();
    throw new QdrantConnectionError(err.message);
  }
}

export async function search(queryVector, topK = 5, topicFilter = null) {
  return qdrantCB.execute(() => _search(queryVector, topK, topicFilter));
}

// ── scroll ─────────────────────────────────────────────────────
export async function scroll(withPayload = true, limit = 10000) {
  try {
    const result = await withTimeout(
      client.scroll(QDRANT_COLLECTION, {
        limit,
        with_payload: withPayload,
        with_vectors: false,
      }),
      15000,
      QdrantTimeoutError,
    );
    return result;
  } catch (err) {
    if (err instanceof QdrantTimeoutError) throw err;
    if (err?.status === 404) throw new QdrantNotFoundError();
    throw new QdrantConnectionError(err.message);
  }
}

// ── getCollectionInfo ──────────────────────────────────────────
async function _getCollectionInfo() {
  try {
    const result = await withTimeout(
      client.getCollection(QDRANT_COLLECTION),
      3000,
      QdrantTimeoutError,
    );
    return result;
  } catch (err) {
    if (err instanceof QdrantTimeoutError) throw err;
    if (err?.status === 404) throw new QdrantNotFoundError();
    throw new QdrantConnectionError(err.message);
  }
}

export async function getCollectionInfo() {
  return qdrantCB.execute(() => _getCollectionInfo());
}

// ── scrollPoints (Phase 36) ────────────────────────────────────
// Paginated scroll through Qdrant collection points.
// Returns { points: Array, next_page_offset: string|null }.
export async function scrollPoints({ offset = null, limit = 100, withPayload = true } = {}) {
  try {
    const params = {
      limit,
      with_payload: withPayload,
      with_vectors: false,
    };
    if (offset !== null && offset !== undefined) {
      params.offset = offset;
    }
    const result = await withTimeout(
      client.scroll(QDRANT_COLLECTION, params),
      10000,
      QdrantTimeoutError,
    );
    return {
      points:           result.points || [],
      next_page_offset: result.next_page_offset ?? null,
    };
  } catch (err) {
    if (err instanceof QdrantTimeoutError) throw err;
    if (err?.status === 404) throw new QdrantNotFoundError();
    throw new QdrantConnectionError(err.message);
  }
}
