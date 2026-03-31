import { embedText, streamGenerate, GeminiTimeoutError, GeminiSafetyError, GeminiEmptyError, GeminiAPIError } from '../services/gemini.js';
import { search, QdrantNotFoundError, QdrantTimeoutError, QdrantConnectionError }                             from '../services/qdrant.js';
import { cache }           from '../services/cache.js';
import { getValidTopicIds } from './topics.js';
import { logEvent }        from '../services/analytics.js';
import { estimateTokens, estimateRequestCost } from '../services/costTracker.js';
import { matchCommand, executeCommand } from '../services/commands.js';
import { routeQuery, getTopK }         from '../services/queryRouter.js';
import { getPromptForType }            from '../services/promptTemplates.js';
import config              from '../../config.js';
import { appendMessage }   from '../services/sessions.js';

const LOW_SCORE_THRESHOLD   = 0.30;
const CACHE_TTL             = 3600;
const SNIPPET_MAX_CHARS     = 150;

// ── Helpers ────────────────────────────────────────────────────
function writeChunk(res, payload) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function buildCacheKey(topic_filter, message) {
  const normalized = message.trim().toLowerCase();
  return `chat:${topic_filter ?? 'all'}:${normalized}`;
}

function buildContext(hits) {
  return hits
    .map((h, i) => {
      const p    = h.payload;
      const path = Array.isArray(p.section_path)
        ? p.section_path.join(' > ')
        : p.section_title || '';
      return `[${i + 1}] ${path}\n${p.parent_content || p.content}`;
    })
    .join('\n\n---\n\n');
}

function buildSources(hits) {
  return hits.map(h => {
    const p       = h.payload;
    const content = p.parent_content || p.content || '';
    const snippet = content.slice(0, SNIPPET_MAX_CHARS) +
      (content.length > SNIPPET_MAX_CHARS ? '...' : '');
    return {
      file:    p.file_name    || '',
      section: p.section_title || '',
      snippet,
      content,
      score:   Math.round(h.score * 10000) / 10000,
    };
  });
}

function avgScore(hits) {
  if (!hits.length) return 0;
  return hits.reduce((s, h) => s + h.score, 0) / hits.length;
}

// ── streamCachedResponse ───────────────────────────────────────
async function streamCachedResponse(res, cached, req, message, topic_filter, session_id) {
  const startTime = Date.now();

  res.writeHead(200, {
    'Content-Type':  'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection':    'keep-alive',
  });

  // SSE needs longer timeout
  res.setTimeout?.(0);

  const words = cached.text.split(' ');
  for (const word of words) {
    writeChunk(res, { text: word + ' ' });
    await new Promise(r => setTimeout(r, 5));
  }

  writeChunk(res, {
    done:    true,
    sources: cached.sources,
    score:   cached.score,
  });
  res.end();

  // ── Analytics (fire-and-forget) ────────────────────────────
  logEvent({
    event_type:       'chat',
    req,
    topic_filter:     topic_filter || null,
    message_length:   message.length,
    response_length:  cached.text.length,
    embedding_tokens: 0,
    generation_tokens:0,
    latency_ms:       Date.now() - startTime,
    score:            cached.score,
    sources_count:    cached.sources?.length || 0,
    cache_hit:        true,
    estimated_cost:   0,
  }).catch(() => {});

  // ── Session persistence (fire-and-forget) ──────────────────
  if (session_id && config.SESSIONS.enabled) {
    appendMessage(session_id, 'user', message).catch(() => {});
    appendMessage(session_id, 'assistant', cached.text, {
      sources:    cached.sources,
      score:      cached.score,
    }).catch(() => {});
  }
}

// ── validateTopicFilter ────────────────────────────────────────
function validateTopicFilter(topic_filter) {
  if (topic_filter === null || topic_filter === 'all') return null;
  const validIds = getValidTopicIds();
  if (validIds === null) return topic_filter; // cache empty — allow
  if (!validIds.has(topic_filter)) return 'INVALID';
  return topic_filter;
}

// ── handler ───────────────────────────────────────────────────
export async function handleChat(req, res) {
  const { message, topic_filter: rawFilter, history, session_id } = req._validatedBody;

  // ── Validate topic_filter ──────────────────────────────────
  const topic_filter = validateTopicFilter(rawFilter);
  if (topic_filter === 'INVALID') {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'topic_filter غير صالح',
      code:  'INVALID_TOPIC',
    }));
    return;
  }

  // ── Command check ──────────────────────────────────────────
  const cmd = matchCommand(message);
  if (cmd) {
    const startTime = Date.now();
    res.writeHead(200, {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
    });
    req.setTimeout?.(120_000);
    res.setTimeout?.(0);

    try {
      await executeCommand(cmd, {
        req, res, message, topic_filter, history,
        writeChunk: (payload) => writeChunk(res, payload),
        startTime,
      });
    } catch (err) {
      console.error('[chat] command error:', err.message);
      if (!res.writableEnded) {
        writeChunk(res, { error: true, message: 'حدث خطأ في تنفيذ الأمر', code: 'COMMAND_ERROR' });
        res.end();
      }
    }
    return;
  }

  // ── Cache check ────────────────────────────────────────────
  const cacheKey = buildCacheKey(topic_filter, message);
  const cached   = cache.get(cacheKey);
  if (cached) {
    await streamCachedResponse(res, cached, req, message, topic_filter, session_id);
    return;
  }

  // ── Start SSE stream ───────────────────────────────────────
  const startTime = Date.now();

  res.writeHead(200, {
    'Content-Type':  'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection':    'keep-alive',
  });

  // Disable timeout for SSE (prevents server.timeout from killing stream)
  req.setTimeout?.(120_000);
  res.setTimeout?.(0);

  try {
    // ── 1. Embed question ────────────────────────────────────
    let queryVector;
    try {
      queryVector = await embedText(message);
    } catch (err) {
      if (err instanceof GeminiTimeoutError) {
        writeChunk(res, { error: true, message: 'انتهت مهلة الاتصال', code: 'TIMEOUT' });
      } else {
        writeChunk(res, { error: true, message: 'حدث خطأ في المعالجة', code: 'SERVER_ERROR' });
      }
      res.end();
      return;
    }

    // ── 2. Route query + Search Qdrant ───────────────────────
    const queryRoute = routeQuery(message);
    const topK       = getTopK(queryRoute.type);

    let hits;
    try {
      hits = await search(queryVector, topK, topic_filter);
    } catch (err) {
      if (err instanceof QdrantNotFoundError) {
        writeChunk(res, { error: true, message: 'قاعدة البيانات غير جاهزة', code: 'SERVICE_UNAVAILABLE' });
      } else if (err instanceof QdrantTimeoutError) {
        writeChunk(res, { error: true, message: 'انتهت مهلة الاتصال', code: 'TIMEOUT' });
      } else {
        writeChunk(res, { error: true, message: 'حدث خطأ في المعالجة', code: 'SERVER_ERROR' });
      }
      res.end();
      return;
    }

    // ── 3. Check confidence ──────────────────────────────────
    const avg = avgScore(hits);
    if (avg < LOW_SCORE_THRESHOLD || hits.length === 0) {
      writeChunk(res, { text: 'لا تتضمن المكتبة معلومات كافية حول هذا السؤال.' });
      writeChunk(res, { done: true, sources: [], score: avg });
      res.end();
      return;
    }

    // ── 4. Build context ─────────────────────────────────────
    const context = buildContext(hits);
    const sources = buildSources(hits);

    // ── 5. Stream Gemini ─────────────────────────────────────
    const systemPrompt = getPromptForType(queryRoute.type);
    let fullText = '';
    try {
      await streamGenerate(
        systemPrompt,
        context,
        history,
        message,
        (chunk) => {
          fullText += chunk;
          writeChunk(res, { text: chunk });
        },
      );
    } catch (err) {
      if (err instanceof GeminiSafetyError) {
        writeChunk(res, { error: true, message: 'لا يمكن معالجة هذا السؤال، يرجى إعادة الصياغة', code: 'SAFETY_BLOCKED' });
        res.end();
        return;
      }
      if (err instanceof GeminiEmptyError) {
        writeChunk(res, { error: true, message: 'لم يتمكن النظام من توليد إجابة، يرجى المحاولة', code: 'EMPTY_RESPONSE' });
        res.end();
        return;
      }
      if (err instanceof GeminiTimeoutError) {
        writeChunk(res, { text: '\n\n⚠️ تم قطع الإجابة بسبب انتهاء المهلة.' });
        writeChunk(res, { done: true, sources, score: avg, partial: true });
        res.end();
        return;
      }
      writeChunk(res, { error: true, message: 'حدث خطأ في المعالجة', code: 'SERVER_ERROR' });
      res.end();
      return;
    }

    // ── 6. Done ──────────────────────────────────────────────
    writeChunk(res, { done: true, sources, score: avg });
    res.end();

    // ── 6.5. Session persistence (fire-and-forget) ──────────
    if (session_id && config.SESSIONS.enabled) {
      appendMessage(session_id, 'user', message).catch(() => {});
      appendMessage(session_id, 'assistant', fullText, {
        sources,
        score:      avg,
        query_type: queryRoute.type,
      }).catch(() => {});
    }

    // ── 7. Analytics (fire-and-forget) ───────────────────────
    const embeddingTokens  = estimateTokens(message);
    const genInputTokens   = estimateTokens(systemPrompt)
                           + estimateTokens(context)
                           + estimateTokens(message);
    const genOutputTokens  = estimateTokens(fullText);

    const costEstimate = estimateRequestCost({
      embeddingInputTokens:   embeddingTokens,
      generationInputTokens:  genInputTokens,
      generationOutputTokens: genOutputTokens,
    });

    logEvent({
      event_type:        'chat',
      req,
      topic_filter:      topic_filter || null,
      query_type:        queryRoute.type,
      message_length:    message.length,
      response_length:   fullText.length,
      embedding_tokens:  embeddingTokens,
      generation_tokens: genOutputTokens,
      latency_ms:        Date.now() - startTime,
      score:             avg,
      sources_count:     sources.length,
      cache_hit:         false,
      estimated_cost:    costEstimate.total_cost,
    }).catch(() => {});

    // ── 8. Cache ─────────────────────────────────────────────
    cache.set(cacheKey, { text: fullText, sources, score: avg }, CACHE_TTL);

  } catch (err) {
    console.error('[chat] unhandled error:', err.message);
    if (!res.writableEnded) {
      writeChunk(res, { error: true, message: 'حدث خطأ في المعالجة', code: 'SERVER_ERROR' });
      res.end();
    }
  }
}
