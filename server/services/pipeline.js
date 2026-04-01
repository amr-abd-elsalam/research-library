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
  const topK = getTopK(ctx.queryRoute.type);
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

  /**
   * @param {Function[]} stages — ordered stage functions
   * @param {PipelineHookRegistry|null} [hooks=null] — optional hook registry
   */
  constructor(stages, hooks = null) {
    this.#stages = stages;
    this.#hooks  = hooks;
  }

  async run(ctx, trace) {
    // ── beforePipeline hooks ────────────────────────────────
    if (this.#hooks) await this.#hooks.run('beforePipeline', null, ctx, trace);

    for (const stage of this.#stages) {
      // Stop if a previous stage signalled abort
      if (ctx.aborted) break;

      // ── beforeStage hooks ───────────────────────────────
      if (this.#hooks) await this.#hooks.run('beforeStage', stage.name, ctx, trace);

      const t0 = Date.now();
      try {
        await stage(ctx, trace);
        const elapsed = Date.now() - t0;

        // Record trace with stage-specific detail
        const { status, detail } = buildStageRecord(stage.name, ctx, elapsed);
        trace.record(stage.name, elapsed, status, detail);

      } catch (err) {
        const elapsed = Date.now() - t0;
        trace.record(stage.name, elapsed, 'error', { error: err.message });
        throw err;
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
], config.PIPELINE?.enableHooks !== false ? pipelineHooks : null);

// ═══════════════════════════════════════════════════════════════
// Default Hooks — emit pipeline events to EventBus
// ═══════════════════════════════════════════════════════════════

if (config.PIPELINE?.enableHooks !== false) {

  // Emit after each stage completes
  pipelineHooks.register('afterStage', '*', (_ctx, trace, stageName) => {
    eventBus.emit('pipeline:stageComplete', {
      stageName,
      correlationId: trace.correlationId,
      timestamp:     Date.now(),
    });
  });

  // Emit when the full pipeline completes
  pipelineHooks.register('afterPipeline', (_ctx, trace) => {
    eventBus.emit('pipeline:complete', {
      correlationId: trace.correlationId,
      aborted:       _ctx.aborted,
      abortReason:   _ctx.abortReason,
      totalMs:       Date.now() - _ctx.startTime,
      queryType:     _ctx.queryRoute?.type ?? null,
    });
  });
}

// ═══════════════════════════════════════════════════════════════
// Exports
// ═══════════════════════════════════════════════════════════════

export { PipelineContext, PipelineRunner, chatPipeline, writeChunk, buildContext, buildSources };
