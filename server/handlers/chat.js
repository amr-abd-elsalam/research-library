import { GeminiTimeoutError, GeminiSafetyError, GeminiEmptyError } from '../services/gemini.js';
import { QdrantNotFoundError, QdrantTimeoutError, QdrantConnectionError } from '../services/qdrant.js';
import { cache }           from '../services/cache.js';
import { getValidTopicIds } from './topics.js';
import { logEvent }        from '../services/analytics.js';
import { estimateTokens, estimateRequestCost } from '../services/costTracker.js';
import { matchCommand, executeCommand } from '../services/commands.js';
import config              from '../../config.js';
import { appendMessage }   from '../services/sessions.js';
import { EventTrace }      from '../services/eventTrace.js';
import { PipelineContext, chatPipeline, writeChunk } from '../services/pipeline.js';

const CACHE_TTL = 3600;

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

  // ── Session persistence (fire-and-forget, sequential) ──────
  if (session_id && config.SESSIONS.enabled) {
    appendMessage(session_id, 'user', message)
      .then(() => appendMessage(session_id, 'assistant', cached.text, {
        sources:    cached.sources,
        score:      cached.score,
      }))
      .catch(() => {});
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

// ── Post-pipeline (fire-and-forget) ────────────────────────────
async function postPipeline(ctx, trace, startTime) {
  // 1. Token estimation
  const embeddingTokens  = estimateTokens(ctx.effectiveMessage);
  const rewriteTokens    = ctx.effectiveMessage !== ctx.message
    ? estimateTokens(ctx.effectiveMessage) + estimateTokens(ctx.message) : 0;
  const genInputTokens   = estimateTokens(ctx.systemPrompt) + estimateTokens(ctx.context) + estimateTokens(ctx.message);
  const genOutputTokens  = estimateTokens(ctx.fullText);

  // 2. Cache set (only if not aborted)
  if (!ctx.aborted && ctx.fullText) {
    cache.set(buildCacheKey(ctx.topicFilter, ctx.message), {
      text: ctx.fullText, sources: ctx.sources, score: ctx.avgScore,
    }, CACHE_TTL);
  }

  // 3. Session persistence
  if (ctx.sessionId && config.SESSIONS.enabled) {
    appendMessage(ctx.sessionId, 'user', ctx.message)
      .then(() => appendMessage(ctx.sessionId, 'assistant', ctx.fullText, {
        sources: ctx.sources,
        score:   ctx.avgScore,
        query_type: ctx.queryRoute?.type,
        tokens: {
          embedding: embeddingTokens,
          input:     genInputTokens,
          output:    genOutputTokens,
          rewrite:   rewriteTokens,
        },
      }))
      .catch(() => {});
  }

  // 4. Analytics
  const costEstimate = estimateRequestCost({
    embeddingInputTokens:   embeddingTokens,
    generationInputTokens:  genInputTokens,
    generationOutputTokens: genOutputTokens,
  });

  logEvent({
    event_type:        'chat',
    req:               ctx.req,
    topic_filter:      ctx.topicFilter || null,
    query_type:        ctx.queryRoute?.type,
    message_length:    ctx.message.length,
    response_length:   ctx.fullText.length,
    embedding_tokens:  embeddingTokens,
    generation_tokens: genOutputTokens,
    latency_ms:        Date.now() - startTime,
    score:             ctx.avgScore,
    sources_count:     ctx.sources?.length || 0,
    cache_hit:         false,
    estimated_cost:    costEstimate.total_cost,
    rewritten_query:   ctx.effectiveMessage !== ctx.message ? ctx.effectiveMessage : undefined,
    follow_up:         ctx.queryRoute?.isFollowUp || false,
    ...(config.PIPELINE?.traceInAnalytics ? { trace: trace.toCompact() } : {}),
  }).catch(() => {});
}

// ── Pipeline error handler ─────────────────────────────────────
function handlePipelineError(err, res, ctx, trace, startTime) {
  // GeminiTimeoutError during streaming (partial response exists)
  if (err instanceof GeminiTimeoutError && ctx.fullText.length > 0) {
    ctx.partial = true;
    writeChunk(res, { text: '\n\n⚠️ تم قطع الإجابة بسبب انتهاء المهلة.' });
    writeChunk(res, { done: true, sources: ctx.sources, score: ctx.avgScore, partial: true });
    if (!res.writableEnded) res.end();
    postPipeline(ctx, trace, startTime).catch(() => {});
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

    // ── 8. Post-pipeline (fire-and-forget) ──────────────────
    postPipeline(ctx, trace, startTime).catch(() => {});

  } catch (err) {
    // ── 9. Error handling (Gemini-specific + generic) ───────
    handlePipelineError(err, res, ctx, trace, startTime);
  }
}
