import { GeminiTimeoutError, GeminiSafetyError, GeminiEmptyError } from '../services/gemini.js';
import { QdrantNotFoundError, QdrantTimeoutError, QdrantConnectionError } from '../services/qdrant.js';
import { pipelineErrorRecovery } from '../services/pipelineErrorRecovery.js';
import { logger }          from '../services/logger.js';
import { getValidTopicIds } from './topics.js';
import { logEvent }        from '../services/analytics.js';
import { executeCommand }  from '../services/commands.js';
import { executionRouter } from '../services/executionRouter.js';
import { EventTrace }      from '../services/eventTrace.js';
import { eventBus }        from '../services/eventBus.js';
import { PipelineContext, chatPipeline, writeChunk } from '../services/pipeline.js';
import { metrics }         from '../services/metrics.js';
import config              from '../../config.js';
import { buildPermissionContext } from '../services/permissionContext.js';
import { suggestionsEngine }     from '../services/suggestionsEngine.js';
import { conversationContext }   from '../services/conversationContext.js';

// ── Active requests counter (for gauge) ────────────────────────
let activeRequests = 0;


// ── streamCachedResponse ───────────────────────────────────────
async function streamCachedResponse(res, cached, req, message, topic_filter, session_id) {
  const startTime = Date.now();

  // Generate synthetic correlationId for cache hits (Phase 36)
  const syntheticTrace = new EventTrace({ requestId: req._requestId || null });
  const correlationId  = syntheticTrace.correlationId;

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
    correlationId,
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
    correlationId,
    _requestId:  req._requestId || null,
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
      logger.error('chat', 'pipeline error', { error: err.message, category: classification.category, _requestId: ctx.req?._requestId || null, _sessionId: ctx.sessionId || null }, trace?.correlationId);
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
  const { message, topic_filter: rawFilter, history, session_id, library_id } = req._validatedBody;

  // ── 1. Topic validation (stays — config-dependent, cheap) ──
  const topic_filter = validateTopicFilter(rawFilter);
  if (topic_filter === 'INVALID') {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'topic_filter غير صالح', code: 'INVALID_TOPIC' }));
    return;
  }

  // ── 2. Build permission context from request auth state (Phase 26) ──
  const permissionContext = buildPermissionContext(req);

  // ── 3. Route resolution (replaces 4 sequential checks) ────
  const route = executionRouter.resolve(message, {
    topicFilter: topic_filter,
    history,
    sessionId: session_id,
    permissionContext,
    libraryId: library_id || null,
  });

  // ── 4. Execute based on route action ──────────────────────
  switch (route.action) {

    case 'command':
    case 'nl_command': {
      const cmd = route.data.command;
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
        logger.error('chat', `${route.action} error`, { error: err.message, _requestId: req._requestId || null, _sessionId: session_id || null });
        if (!res.writableEnded) {
          writeChunk(res, { error: true, message: 'حدث خطأ في تنفيذ الأمر', code: 'COMMAND_ERROR' });
          res.end();
        }
      }
      return;
    }

    case 'cache_hit':
      await streamCachedResponse(res, route.data.cached, req, message, topic_filter, session_id);
      return;

    case 'budget_exceeded': {
      const { budgetCheck } = route.data;
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

    case 'topic_denied': {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'الموضوع غير مسموح لمستوى الوصول الحالي',
        code: 'TOPIC_NOT_ALLOWED',
      }));
      return;
    }

    case 'pipeline':
    default: {
      const { cacheKey, queryIntent } = route.data;
      const startTime = Date.now();
      const responseMode = req._validatedBody.response_mode
        ?? config.RESPONSE?.defaultMode
        ?? 'stream';

      // SSE headers for stream/concise — deferred for structured
      if (responseMode !== 'structured') {
        res.writeHead(200, {
          'Content-Type':  'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection':    'keep-alive',
        });
        req.setTimeout?.(120_000);
        res.setTimeout?.(0);
      }

      const ctx   = new PipelineContext({
        message, topicFilter: topic_filter, history, sessionId: session_id, req, res,
        responseMode,
        libraryId: library_id || null,
        requestId: req._requestId || null,
      });
      const trace = new EventTrace({ requestId: req._requestId || null });

      // Pass intent classification to pipeline (Phase 21 — for stage gating + observability)
      if (queryIntent) ctx._queryIntent = queryIntent;

      try {
        await chatPipeline.run(ctx, trace);

        // ── Generate suggestions (Phase 29 — zero cost, template-based) ──
        let suggestions = [];
        try {
          const convCtx = conversationContext.getContext(session_id);
          if (convCtx) {
            suggestions = suggestionsEngine.generate(convCtx);
          }
        } catch (_) { /* graceful degradation — suggestions are optional */ }

        if (responseMode === 'structured') {
          // ── Structured mode: single JSON response ──────────
          const payload = {
            text:      ctx.aborted ? 'لا تتضمن المكتبة معلومات كافية حول هذا السؤال.' : ctx.fullText,
            sources:   ctx.aborted ? [] : ctx.sources,
            score:     ctx.avgScore,
            aborted:   ctx.aborted,
            queryType: ctx.queryRoute?.type ?? null,
            suggestions,
            correlationId: trace.correlationId,
          };
          if (config.RESPONSE?.structuredIncludeTrace === true) {
            payload.trace = trace.toJSON();
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(payload));
        } else {
          // ── Stream/concise mode: SSE finish (existing behavior) ──
          if (ctx.aborted && ctx.abortReason === 'low_confidence') {
            writeChunk(res, { text: 'لا تتضمن المكتبة معلومات كافية حول هذا السؤال.' });
            writeChunk(res, { done: true, sources: [], score: ctx.avgScore, suggestions: [], correlationId: trace.correlationId });
          } else {
            writeChunk(res, { done: true, sources: ctx.sources, score: ctx.avgScore, suggestions, correlationId: trace.correlationId });
          }
          res.end();
        }
      } catch (err) {
        if (responseMode === 'structured' && !res.headersSent) {
          // ── Structured mode: JSON error ────────────────────
          const classification = pipelineErrorRecovery.classify(err, ctx);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            error:   true,
            message: classification.userMessage,
            code:    classification.code,
          }));
        } else {
          // ── Stream/concise mode: SSE error (existing behavior) ──
          handlePipelineError(err, res, ctx, trace, startTime);
        }
      }
      return;
    }
  }
}
