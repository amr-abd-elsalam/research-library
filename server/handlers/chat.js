import { GeminiTimeoutError, GeminiSafetyError, GeminiEmptyError } from '../services/gemini.js';
import { QdrantNotFoundError, QdrantTimeoutError, QdrantConnectionError } from '../services/qdrant.js';
import { pipelineErrorRecovery } from '../services/pipelineErrorRecovery.js';
import { sessionBudget }         from '../services/sessionBudget.js';
import { cache }           from '../services/cache.js';
import { logger }          from '../services/logger.js';
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

// ── Pipeline error handler (Phase 18 — simplified via PipelineErrorRecovery) ──
function handlePipelineError(err, res, ctx, trace, startTime) {
  const classification = pipelineErrorRecovery.classify(err, ctx);

  if (classification.isPartial) {
    // Partial response exists — append warning and send what we have
    ctx.partial = true;
    writeChunk(res, { text: '\n\n⚠️ ' + classification.userMessage });
    writeChunk(res, { done: true, sources: ctx.sources, score: ctx.avgScore, partial: true });
  } else {
    // No partial content — send error
    if (!res.headersSent) {
      logger.error('chat', 'pipeline error', { error: err.message, category: classification.category }, trace?.correlationId);
    }
    writeChunk(res, { error: true, message: classification.userMessage, code: classification.code });
  }

  if (!res.writableEnded) res.end();

  // Emit pipeline:complete for listeners (analytics, session, etc.) if needed
  if (classification.shouldEmitComplete) {
    eventBus.emit('pipeline:complete', pipelineErrorRecovery.buildPartialCompleteEvent(ctx, trace, startTime));
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

  // ── 4. Budget check (Phase 19) ──────────────────────────────
  if (session_id) {
    const budgetCheck = sessionBudget.check(session_id);
    if (budgetCheck.exceeded) {
      res.writeHead(200, {
        'Content-Type':  'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection':    'keep-alive',
      });
      res.setTimeout?.(0);
      writeChunk(res, {
        text: `⚠️ وصلت هذه المحادثة للحد الأقصى من الاستخدام (${budgetCheck.usage.totalTokens.toLocaleString()} token). يمكنك بدء محادثة جديدة للاستمرار.`,
      });
      writeChunk(res, { done: true, sources: [], score: 0, budgetExceeded: true });
      res.end();
      return;
    }
  }

  // ── 5. Start SSE stream ─────────────────────────────────────
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
