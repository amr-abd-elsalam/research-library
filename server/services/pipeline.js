// server/services/pipeline.js
// ═══════════════════════════════════════════════════════════════
// Structured RAG Pipeline — decomposes the chat handler into
// discrete, traceable stages with a shared PipelineContext.
// ═══════════════════════════════════════════════════════════════

import { embedText, streamGenerate, GeminiTimeoutError, GeminiSafetyError, GeminiEmptyError } from './gemini.js';
import { search }                             from './qdrant.js';
import { routeQuery, getTopK }                from './queryRouter.js';
import { rewriteQuery }                       from './queryRewriter.js';
import { getPromptForType }                   from './promptTemplates.js';
import { ContextManager }                     from './contextManager.js';
import { TranscriptStore }                    from './transcript.js';
import { EventTrace }                         from './eventTrace.js';
import { pipelineHooks }                      from './hookRegistry.js';
import { eventBus }                           from './eventBus.js';
import { estimateTokens, estimateRequestCost } from './costTracker.js';
import { CircuitOpenError }                   from './circuitBreaker.js';
import config                                 from '../../config.js';

// ── Singleton ContextManager (same as previous chat.js) ────────
const contextManager = new ContextManager();

// ── Constants ──────────────────────────────────────────────────
const LOW_SCORE_THRESHOLD = 0.30;
const SNIPPET_MAX_CHARS   = 150;

// ═══════════════════════════════════════════════════════════════
// PipelineContext — data carrier for all stages
// ═══════════════════════════════════════════════════════════════

class PipelineContext {
  constructor({ message, topicFilter, history, sessionId, req, res }) {
    // ── Input (set once in constructor — don't overwrite) ──
    this.message       = message;
    this.topicFilter   = topicFilter;
    this.history       = history;
    this.sessionId     = sessionId;
    this.req           = req;
    this.res           = res;
    this.startTime     = Date.now();

    // ── Mutable state (set by stages progressively) ───────
    this.transcript       = null;
    this.queryRoute       = null;
    this.effectiveMessage = message;
    this.queryVector      = null;
    this.hits             = null;
    this.trimmedHits      = null;
    this.trimmedHistory   = null;
    this.systemPrompt     = null;
    this.context          = null;
    this.sources          = null;
    this.fullText         = '';
    this.avgScore         = 0;
    this.budget           = null;

    // ── Control flags ─────────────────────────────────────
    this.aborted     = false;
    this.abortReason = null;
    this.cacheHit    = false;
    this.partial     = false;
  }
}

// ═══════════════════════════════════════════════════════════════
// Helper functions (moved from chat.js)
// ═══════════════════════════════════════════════════════════════

function writeChunk(res, payload) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
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

// ═══════════════════════════════════════════════════════════════
// Stage Functions — each takes (ctx, trace), returns ctx
// ═══════════════════════════════════════════════════════════════

// ── Stage 1: Transcript Initialization ─────────────────────────
async function stageTranscriptInit(ctx, _trace) {
  ctx.transcript = new TranscriptStore(
    (ctx.history || []).map(h => ({
      role: h.role === 'model' ? 'assistant' : h.role,
      text: h.text,
    }))
  );
  return ctx;
}

// ── Stage 2: Route Query ───────────────────────────────────────
async function stageRouteQuery(ctx, _trace) {
  ctx.queryRoute = routeQuery(ctx.message);
  return ctx;
}

// ── Stage 3: Rewrite Query (follow-up) ─────────────────────────
async function stageRewriteQuery(ctx, _trace) {
  const shouldRewrite =
    ctx.queryRoute.isFollowUp &&
    config.FOLLOWUP?.enabled &&
    ctx.queryRoute.followUpConfidence >= (config.FOLLOWUP?.minConfidence ?? 0.33) &&
    ctx.transcript.size > 0;

  if (!shouldRewrite) {
    // status will be recorded as 'skip' by the runner detail callback
    ctx._rewriteSkipped = true;
    return ctx;
  }

  const result = await rewriteQuery(
    ctx.message,
    ctx.transcript.replayForAPI(config.FOLLOWUP?.maxHistoryItems ?? 4)
  );

  if (result.wasRewritten) {
    ctx.effectiveMessage = result.rewritten;
  }

  ctx._rewriteSkipped = false;
  ctx._rewriteResult  = result;
  return ctx;
}

// ── Stage 4: Embed ─────────────────────────────────────────────
async function stageEmbed(ctx, _trace) {
  ctx.queryVector = await embedText(ctx.effectiveMessage);
  return ctx;
}

// ── Stage 5: Search ────────────────────────────────────────────
async function stageSearch(ctx, _trace) {
  let topK = getTopK(ctx.queryRoute.type);

  // Adaptive topK adjustment (Phase 22)
  if (ctx._adaptiveConfig?.topKAdjustment) {
    topK = Math.max(3, topK + ctx._adaptiveConfig.topKAdjustment);
  }

  ctx.hits   = await search(ctx.queryVector, topK, ctx.topicFilter);

  // Compute average score (same logic as previous chat.js)
  if (!ctx.hits.length) {
    ctx.avgScore = 0;
  } else {
    ctx.avgScore = ctx.hits.reduce((s, h) => s + h.score, 0) / ctx.hits.length;
  }

  ctx._searchTopK = topK;
  return ctx;
}

// ── Stage 6: Confidence Check ──────────────────────────────────
async function stageConfidenceCheck(ctx, _trace) {
  if (ctx.avgScore < LOW_SCORE_THRESHOLD || ctx.hits.length === 0) {
    ctx.aborted     = true;
    ctx.abortReason = 'low_confidence';
    ctx._confidenceResult = 'below_threshold';
  } else {
    ctx._confidenceResult = 'pass';
  }
  return ctx;
}

// ── Stage 7: Build Context ─────────────────────────────────────
async function stageBuildContext(ctx, _trace) {
  ctx.systemPrompt = getPromptForType(ctx.queryRoute.type);

  const window = contextManager.buildWindow({
    systemPrompt: ctx.systemPrompt,
    ragHits:      ctx.hits,
    history:      ctx.history,
    message:      ctx.message,
  });

  ctx.trimmedHits    = window.hits;
  ctx.trimmedHistory = window.history;
  ctx.budget         = window.budget;
  ctx.context        = buildContext(window.hits);
  ctx.sources        = buildSources(window.hits);

  return ctx;
}

// ── Stage 8: Stream ────────────────────────────────────────────
async function stageStream(ctx, _trace) {
  await streamGenerate(
    ctx.systemPrompt,
    ctx.context,
    ctx.trimmedHistory,
    ctx.message,
    (chunk) => {
      ctx.fullText += chunk;
      writeChunk(ctx.res, { text: chunk });
    },
  );
  return ctx;
}

// ═══════════════════════════════════════════════════════════════
// PipelineRunner — executes stages sequentially with tracing
// ═══════════════════════════════════════════════════════════════

class PipelineRunner {
  #stages;
  #hooks;
  #retryConfig;

  /**
   * @param {Function[]} stages — ordered stage functions
   * @param {PipelineHookRegistry|null} [hooks=null] — optional hook registry
   * @param {Object<string, {maxRetries: number, backoffMs: number}>} [retryConfig={}] — per-stage retry configuration
   */
  constructor(stages, hooks = null, retryConfig = {}) {
    this.#stages      = stages;
    this.#hooks       = hooks;
    this.#retryConfig = retryConfig;
  }

  async run(ctx, trace) {
    // ── beforePipeline hooks ────────────────────────────────
    if (this.#hooks) await this.#hooks.run('beforePipeline', null, ctx, trace);

    for (const stage of this.#stages) {
      // Stop if a previous stage signalled abort
      if (ctx.aborted) break;

      // ── Stage gating (Phase 21) — skip stages based on intent ──
      if (ctx._skipStages && ctx._skipStages.has(stage.name)) {
        trace.record(stage.name, 0, 'skip', { reason: 'stage_gating' });
        // Still fire afterStage hooks (for metrics/observability)
        if (this.#hooks) await this.#hooks.run('afterStage', stage.name, ctx, trace);
        continue;
      }

      // ── beforeStage hooks ───────────────────────────────
      if (this.#hooks) await this.#hooks.run('beforeStage', stage.name, ctx, trace);

      const stageRetry  = this.#retryConfig[stage.name];
      const maxAttempts = (stageRetry?.maxRetries ?? 0) + 1;
      let lastError     = null;
      let t0            = Date.now();

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          t0 = Date.now();
          await stage(ctx, trace);
          const elapsed = Date.now() - t0;

          // Record trace with stage-specific detail
          const { status, detail } = buildStageRecord(stage.name, ctx, elapsed);
          const traceDetail = attempt > 1 ? { ...detail, attempt } : detail;
          trace.record(stage.name, elapsed, status, traceDetail);

          lastError = null;
          break; // success — exit retry loop

        } catch (err) {
          lastError = err;

          // Don't retry CircuitOpenError — circuit is open by design
          if (err instanceof CircuitOpenError) break;

          if (attempt < maxAttempts) {
            const backoffMs = stageRetry?.backoffMs ?? 300;
            trace.record(stage.name, Date.now() - t0, 'retry', {
              attempt,
              backoffMs,
              error: err.message,
            });
            await new Promise(r => setTimeout(r, backoffMs));
          }
        }
      }

      if (lastError) {
        const elapsed = Date.now() - t0;
        trace.record(stage.name, elapsed, 'error', { error: lastError.message });
        throw lastError;
      }

      // ── afterStage hooks ────────────────────────────────
      if (this.#hooks) await this.#hooks.run('afterStage', stage.name, ctx, trace);

      // Check abort *after* recording and hooks (for stageConfidenceCheck)
      if (ctx.aborted) break;
    }

    // ── afterPipeline hooks ─────────────────────────────────
    if (this.#hooks) await this.#hooks.run('afterPipeline', null, ctx, trace);

    return ctx;
  }
}

// ── Stage-specific trace detail builder ────────────────────────
function buildStageRecord(stageName, ctx, _elapsed) {
  switch (stageName) {
    case 'stageTranscriptInit':
      return { status: 'ok', detail: { size: ctx.transcript.size } };

    case 'stageRouteQuery':
      return {
        status: 'ok',
        detail: { type: ctx.queryRoute.type, isFollowUp: ctx.queryRoute.isFollowUp },
      };

    case 'stageRewriteQuery':
      if (ctx._rewriteSkipped) {
        return { status: 'skip', detail: null };
      }
      return {
        status: 'ok',
        detail: {
          original:  ctx.message,
          rewritten: ctx.effectiveMessage,
          wasRewritten: ctx._rewriteResult?.wasRewritten ?? false,
        },
      };

    case 'stageEmbed':
      return { status: 'ok', detail: null };

    case 'stageSearch':
      return {
        status: 'ok',
        detail: {
          topK:     ctx._searchTopK,
          hitCount: ctx.hits.length,
          avgScore: ctx.avgScore,
        },
      };

    case 'stageConfidenceCheck':
      return {
        status: ctx.aborted ? 'ok' : 'ok',
        detail: { result: ctx._confidenceResult },
      };

    case 'stageBuildContext':
      return {
        status: 'ok',
        detail: {
          hitsUsed:        ctx.trimmedHits?.length ?? 0,
          historyUsed:     ctx.trimmedHistory?.length ?? 0,
          budgetRemaining: ctx.budget?.remaining ?? 0,
        },
      };

    case 'stageStream':
      return {
        status: 'ok',
        detail: { responseLength: ctx.fullText.length },
      };

    default:
      return { status: 'ok', detail: null };
  }
}

// ═══════════════════════════════════════════════════════════════
// Composed Pipeline
// ═══════════════════════════════════════════════════════════════

const chatPipeline = new PipelineRunner([
  stageTranscriptInit,
  stageRouteQuery,
  stageRewriteQuery,
  stageEmbed,
  stageSearch,
  stageConfidenceCheck,
  stageBuildContext,
  stageStream,
], config.PIPELINE?.enableHooks !== false ? pipelineHooks : null,
   config.PIPELINE?.retryableStages ?? {});

// ═══════════════════════════════════════════════════════════════
// Default Hooks — emit pipeline events to EventBus
// ═══════════════════════════════════════════════════════════════

if (config.PIPELINE?.enableHooks !== false) {

  // Stage gating based on query intent (Phase 21)
  const gatingConfig = config.PIPELINE?.stageGating;
  if (gatingConfig && typeof gatingConfig === 'object' && Object.keys(gatingConfig).length > 0) {
    pipelineHooks.register('beforePipeline', (ctx, _trace) => {
      const intent = ctx._queryIntent?.intent;
      if (intent && gatingConfig[intent]) {
        const stagesToSkip = gatingConfig[intent];
        if (Array.isArray(stagesToSkip) && stagesToSkip.length > 0) {
          ctx._skipStages = new Set(stagesToSkip);
        }
      }
    });
  }

  // Adaptive config injection (Phase 22)
  if (config.PIPELINE?.adaptiveEnabled === true) {
    import('./pipelineAnalytics.js').then(({ pipelineAnalytics }) => {
      pipelineHooks.register('beforePipeline', (ctx, _trace) => {
        const overrides = pipelineAnalytics.adaptiveOverrides();
        if (overrides) ctx._adaptiveConfig = overrides;
      });
    }).catch(() => {
      // Ignore — adaptive analytics is optional
    });
  }

  // Emit after each stage completes (enriched with duration for metrics)
  pipelineHooks.register('afterStage', '*', (_ctx, trace, stageName) => {
    // Read latest stage entry from trace for duration + status
    const traceData  = trace.toJSON();
    const lastStage  = traceData.stages[traceData.stages.length - 1];

    eventBus.emit('pipeline:stageComplete', {
      stageName,
      correlationId: trace.correlationId,
      timestamp:     Date.now(),
      durationMs:    lastStage?.durationMs ?? 0,
      status:        lastStage?.status ?? 'ok',
    });
  });

  // Emit when the full pipeline completes — enriched data for listeners
  pipelineHooks.register('afterPipeline', (_ctx, trace) => {
    // ── Token estimation (moved from chat.js postPipeline) ────
    const embeddingTokens  = estimateTokens(_ctx.effectiveMessage);
    const rewriteTokens    = _ctx.effectiveMessage !== _ctx.message
      ? estimateTokens(_ctx.effectiveMessage) + estimateTokens(_ctx.message) : 0;
    const genInputTokens   = estimateTokens(_ctx.systemPrompt) + estimateTokens(_ctx.context) + estimateTokens(_ctx.message);
    const genOutputTokens  = estimateTokens(_ctx.fullText);

    const costEstimate = estimateRequestCost({
      embeddingInputTokens:   embeddingTokens,
      generationInputTokens:  genInputTokens,
      generationOutputTokens: genOutputTokens,
    });

    eventBus.emit('pipeline:complete', {
      // ── Core fields (existing) ─────────────────────────────
      correlationId: trace.correlationId,
      aborted:       _ctx.aborted,
      abortReason:   _ctx.abortReason,
      totalMs:       Date.now() - _ctx.startTime,
      queryType:     _ctx.queryRoute?.type ?? null,

      // ── Context fields (for session + cache listeners) ─────
      message:          _ctx.message,
      fullText:         _ctx.fullText,
      sources:          _ctx.sources,
      avgScore:         _ctx.avgScore,
      sessionId:        _ctx.sessionId,
      topicFilter:      _ctx.topicFilter,
      effectiveMessage: _ctx.effectiveMessage,

      // ── Token estimates (for session listener) ─────────────
      _tokenEstimates: {
        embedding: embeddingTokens,
        input:     genInputTokens,
        output:    genOutputTokens,
        rewrite:   rewriteTokens,
      },

      // ── Cache entry (for cache listener) ───────────────────
      _cacheKey: `chat:${_ctx.topicFilter ?? 'all'}:${_ctx.message.trim().toLowerCase()}`,
      _cacheEntry: (!_ctx.aborted && _ctx.fullText) ? {
        text: _ctx.fullText, sources: _ctx.sources, score: _ctx.avgScore,
      } : null,

      // ── Analytics entry (for analytics listener) ───────────
      _analytics: {
        event_type:        'chat',
        req:               _ctx.req,
        topic_filter:      _ctx.topicFilter || null,
        query_type:        _ctx.queryRoute?.type,
        message_length:    _ctx.message.length,
        response_length:   (_ctx.fullText || '').length,
        embedding_tokens:  embeddingTokens,
        generation_tokens: genOutputTokens,
        latency_ms:        Date.now() - _ctx.startTime,
        score:             _ctx.avgScore,
        sources_count:     _ctx.sources?.length || 0,
        cache_hit:         false,
        estimated_cost:    costEstimate.total_cost,
        rewritten_query:   _ctx.effectiveMessage !== _ctx.message ? _ctx.effectiveMessage : undefined,
        follow_up:         _ctx.queryRoute?.isFollowUp || false,
      },
      _traceCompact: trace.toCompact(),

      // ── Intent classification (Phase 21) ───────────────────
      _queryIntent: _ctx._queryIntent ?? null,
    });
  });
}

// ═══════════════════════════════════════════════════════════════
// Exports
// ═══════════════════════════════════════════════════════════════

export { PipelineContext, PipelineRunner, chatPipeline, writeChunk, buildContext, buildSources };
