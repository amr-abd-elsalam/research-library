import { scroll, QdrantNotFoundError, QdrantTimeoutError, QdrantConnectionError } from '../services/qdrant.js';
import { cache }   from '../services/cache.js';
import config      from '../../config.js';

const CACHE_KEY = 'topics:all';
const CACHE_TTL = 3600;

// ── buildTopicsFromPoints ──────────────────────────────────────
function buildTopicsFromPoints(points) {
  const map = new Map();

  for (const point of points) {
    const p = point.payload;
    if (!p) continue;

    const id       = String(p.topic_id ?? '-1');
    const label    = p.topic_label    || 'عام';
    const keywords = p.topic_keywords || [];

    if (!map.has(id)) {
      map.set(id, { id, label, keywords, count: 0 });
    }
    map.get(id).count += 1;
  }

  // ── Sort by count desc ─────────────────────────────────────
  const topics = [...map.values()].sort((a, b) => b.count - a.count);

  // ── Prepend "all" ──────────────────────────────────────────
  return [
    {
      id:       'all',
      label:    config.LIBRARY.domainLabel,
      keywords: [],
      count:    points.length,
    },
    ...topics,
  ];
}

// ── getValidTopicIds ───────────────────────────────────────────
export function getValidTopicIds() {
  const cached = cache.get(CACHE_KEY);
  if (!cached) return null;
  return new Set(cached.map(t => t.id));
}

// ── handler ───────────────────────────────────────────────────
export async function handleTopics(req, res) {

  // ── Cache hit ──────────────────────────────────────────────
  const cached = cache.get(CACHE_KEY);
  if (cached) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(cached));
    return;
  }

  // ── Cache miss → fetch from Qdrant ─────────────────────────
  try {
    const result = await scroll(
      { include: ['topic_id', 'topic_label', 'topic_keywords'] },
      10000,
    );
    const points = result?.points || [];
    const topics = buildTopicsFromPoints(points);

    cache.set(CACHE_KEY, topics, CACHE_TTL);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(topics));

  } catch (err) {
    if (err instanceof QdrantNotFoundError) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'قاعدة البيانات غير جاهزة',
        code:  'SERVICE_UNAVAILABLE',
      }));
      return;
    }
    if (err instanceof QdrantTimeoutError) {
      res.writeHead(504, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'انتهت مهلة الاتصال',
        code:  'TIMEOUT',
      }));
      return;
    }
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'حدث خطأ في الخادم',
      code:  'SERVER_ERROR',
    }));
  }
}
