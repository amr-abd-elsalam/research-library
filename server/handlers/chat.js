import { GeminiTimeoutError, GeminiSafetyError, GeminiEmptyError } from '../services/gemini.js';
import { QdrantNotFoundError, QdrantTimeoutError, QdrantConnectionError } from '../services/qdrant.js';
import { cache }           from '../services/cache.js';
import { getValidTopicIds } from './topics.js';
import { logEvent }        from '../services/analytics.js';
import { matchCommand, executeCommand } from '../services/commands.js';
import config              from '../../config.js';
import { EventTrace }      from '../services/eventTrace.js';
import { eventBus }        from '../services/eventBus.js';
import { PipelineContext, chatPipeline, writeChunk } from '../services/pipeline.js';
import { metrics }         from '../services/metrics.js';

// ── Active requests counter (for gauge) ────────────────────────
let activeRequests = 0;

// ── Helpers (kept in chat.js — not part of pipeline) ───────────
function buildCacheKey(topic_filter, message) {
  const normalized = message.trim().toLowerCase();
  return `chat:${topic_filter ?? 'all'}:${normalized}`;
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

  // ── Emit cache hit event (listeners handle analytics + session) ──
  eventBus.emit('pipeline:cacheHit', {
    message,
    fullText:    cached.text,
    sources:     cached.sources,
    avgScore:    cached.score,
    sessionId:   session_id,
    topicFilter: topic_filter,
    _analytics: {
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
    },
  });
}

// ── validateTopicFilter ────────────────────────────────────────
function validateTopicFilter(topic_filter) {
  if (topic_filter === null || topic_filter === 'all') return null;
  const validIds = getValidTopicIds();
  if (validIds === null) return topic_filter; // cache empty — allow
  if (!validIds.has(topic_filter)) return 'INVALID';
  return topic_filter;
}

// ── postPipeline removed in Phase 13 — logic moved to EventBus listeners ──
// Analytics  → server/services/listeners/analyticsListener.js
// Cache      → server/services/listeners/cacheListener.js
// Session    → server/services/listeners/sessionListener.js
// Token estimation + enriched data → afterPipeline hook in pipeline.js

// ── Pipeline error handler ─────────────────────────────────────
function handlePipelineError(err, res, ctx, trace, startTime) {
  // GeminiTimeoutError during streaming (partial response exists)
  if (err instanceof GeminiTimeoutError && ctx.fullText.length > 0) {
    ctx.partial = true;
    writeChunk(res, { text: '\n\n⚠️ تم قطع الإجابة بسبب انتهاء المهلة.' });
    writeChunk(res, { done: true, sources: ctx.sources, score: ctx.avgScore, partial: true });
    if (!res.writableEnded) res.end();
    // Note: the afterPipeline hook already ran (or will run) via PipelineRunner,
    // emitting pipeline:complete with enriched data for listeners.
    // For partial responses where the pipeline errored mid-stream,
    // we emit a dedicated event so listeners can still log/persist.
    eventBus.emit('pipeline:complete', {
      correlationId: trace.correlationId,
      aborted:       false,
      abortReason:   null,
      totalMs:       Date.now() - startTime,
      queryType:     ctx.queryRoute?.type ?? null,
      message:       ctx.message,
      fullText:      ctx.fullText,
      sources:       ctx.sources,
      avgScore:      ctx.avgScore,
      sessionId:     ctx.sessionId,
      topicFilter:   ctx.topicFilter,
      effectiveMessage: ctx.effectiveMessage,
      _tokenEstimates: null,
      _cacheKey:     null,
      _cacheEntry:   null,
      _analytics: {
        event_type:        'chat',
        req:               ctx.req,
        topic_filter:      ctx.topicFilter || null,
        query_type:        ctx.queryRoute?.type,
        message_length:    ctx.message.length,
        response_length:   ctx.fullText.length,
        embedding_tokens:  0,
        generation_tokens: 0,
        latency_ms:        Date.now() - startTime,
        score:             ctx.avgScore,
        sources_count:     ctx.sources?.length || 0,
        cache_hit:         false,
        estimated_cost:    0,
        follow_up:         ctx.queryRoute?.isFollowUp || false,
      },
      _traceCompact: trace.toCompact(),
    });
    return;
  }

  // GeminiTimeoutError before streaming (embed or pre-stream)
  if (err instanceof GeminiTimeoutError) {
    if (!res.writableEnded) {
      writeChunk(res, { error: true, message: 'انتهت مهلة الاتصال', code: 'TIMEOUT' });
      res.end();
    }
    return;
  }

  // Qdrant errors
  if (err instanceof QdrantNotFoundError) {
    if (!res.writableEnded) {
      writeChunk(res, { error: true, message: 'قاعدة البيانات غير جاهزة', code: 'SERVICE_UNAVAILABLE' });
      res.end();
    }
    return;
  }
  if (err instanceof QdrantTimeoutError) {
    if (!res.writableEnded) {
      writeChunk(res, { error: true, message: 'انتهت مهلة الاتصال', code: 'TIMEOUT' });
      res.end();
    }
    return;
  }

  // Gemini safety block
  if (err instanceof GeminiSafetyError) {
    if (!res.writableEnded) {
      writeChunk(res, { error: true, message: 'لا يمكن معالجة هذا السؤال، يرجى إعادة الصياغة', code: 'SAFETY_BLOCKED' });
      res.end();
    }
    return;
  }

  // Gemini empty response
  if (err instanceof GeminiEmptyError) {
    if (!res.writableEnded) {
      writeChunk(res, { error: true, message: 'لم يتمكن النظام من توليد إجابة، يرجى المحاولة', code: 'EMPTY_RESPONSE' });
      res.end();
    }
    return;
  }

  // Generic / unknown error
  console.error('[chat] pipeline error:', err.message);
  if (!res.writableEnded) {
    writeChunk(res, { error: true, message: 'حدث خطأ في المعالجة', code: 'SERVER_ERROR' });
    res.end();
  }
}

// ── handler ───────────────────────────────────────────────────
export async function handleChat(req, res) {
  activeRequests++;
  metrics.set('active_requests', activeRequests);

  try {
    await _handleChat(req, res);
  } finally {
    activeRequests--;
    metrics.set('active_requests', activeRequests);
  }
}

async function _handleChat(req, res) {
  const { message, topic_filter: rawFilter, history, session_id } = req._validatedBody;

  // ── 1. Topic validation (stays here) ────────────────────────
  const topic_filter = validateTopicFilter(rawFilter);
  if (topic_filter === 'INVALID') {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'topic_filter غير صالح',
      code:  'INVALID_TOPIC',
    }));
    return;
  }

  // ── 2. Command check (stays here — commands bypass pipeline) ──
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

  // ── 3. Cache check (stays here — cache bypasses pipeline) ──
  const cacheKey = buildCacheKey(topic_filter, message);
  const cached   = cache.get(cacheKey);
  if (cached) {
    await streamCachedResponse(res, cached, req, message, topic_filter, session_id);
    return;
  }

  // ── 4. Start SSE stream ─────────────────────────────────────
  const startTime = Date.now();
  res.writeHead(200, {
    'Content-Type':  'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection':    'keep-alive',
  });
  req.setTimeout?.(120_000);
  res.setTimeout?.(0);

  // ── 5. Build pipeline context + trace ───────────────────────
  const ctx   = new PipelineContext({
    message, topicFilter: topic_filter, history, sessionId: session_id, req, res,
  });
  const trace = new EventTrace();

  try {
    // ── 6. Run pipeline ─────────────────────────────────────
    await chatPipeline.run(ctx, trace);

    // ── 7. Handle result ────────────────────────────────────
    if (ctx.aborted && ctx.abortReason === 'low_confidence') {
      writeChunk(res, { text: 'لا تتضمن المكتبة معلومات كافية حول هذا السؤال.' });
      writeChunk(res, { done: true, sources: [], score: ctx.avgScore });
    } else {
      writeChunk(res, { done: true, sources: ctx.sources, score: ctx.avgScore });
    }
    res.end();

    // ── 8. Post-pipeline handled by EventBus listeners ──────
    // The enriched afterPipeline hook in pipeline.js emits
    // 'pipeline:complete' with all data needed by listeners
    // (analytics, cache, session). No explicit call needed.

  } catch (err) {
    // ── 9. Error handling (Gemini-specific + generic) ───────
    handlePipelineError(err, res, ctx, trace, startTime);
  }
}
