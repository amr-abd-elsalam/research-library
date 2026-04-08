// server/services/pipeline.js
// ═══════════════════════════════════════════════════════════════
// Structured RAG Pipeline — decomposes the chat handler into
// discrete, traceable stages with a shared PipelineContext.
// ═══════════════════════════════════════════════════════════════

import { embedText, embedBatch, streamGenerate, generate, GeminiTimeoutError, GeminiSafetyError, GeminiEmptyError } from './gemini.js';
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
import { splitSentences }                     from './arabicNlp.js';
import { conversationContext }                from './conversationContext.js';
import { libraryIndex }                       from './libraryIndex.js';
import { contentGapDetector }                 from './contentGapDetector.js';
import { searchReranker }                     from './searchReranker.js';
import { queryComplexityAnalyzer }            from './queryComplexityAnalyzer.js';
import { answerGroundingChecker }             from './answerGroundingChecker.js';
import { citationMapper }                     from './citationMapper.js';
import { costGovernor }                       from './costGovernor.js';
import { featureFlags }                       from './featureFlags.js';
import { queryPlanner }                       from './queryPlanner.js';

// ── Singleton ContextManager (same as previous chat.js) ────────
const contextManager = new ContextManager();

// ── Constants ──────────────────────────────────────────────────
const LOW_SCORE_THRESHOLD = 0.30;
const SNIPPET_MAX_CHARS   = 150;

// ═══════════════════════════════════════════════════════════════
// PipelineContext — data carrier for all stages
// ═══════════════════════════════════════════════════════════════

class PipelineContext {
  constructor({ message, topicFilter, history, sessionId, req, res, responseMode, libraryId, requestId }) {
    // ── Input (set once in constructor — don't overwrite) ──
    this.message       = message;
    this.topicFilter   = topicFilter;
    this.history       = history;
    this.sessionId     = sessionId;
    this.req           = req;
    this.res           = res;
    this.startTime     = Date.now();
    this._responseMode = responseMode || 'stream';
    this.libraryId     = libraryId || null;
    this.requestId     = requestId || null;

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

// ── Structured Output Helpers (Phase 79) — zero API call ──────

function extractKeyPoints(text, maxPoints = 5) {
  if (!text || typeof text !== 'string') return [];
  const sentences = splitSentences(text, 15);
  if (sentences.length === 0) return [];
  const candidates = sentences.filter(s => {
    const trimmed = s.trim();
    return !trimmed.endsWith('؟') && !trimmed.endsWith('?')
      && !trimmed.startsWith('هل ') && !trimmed.startsWith('ما ')
      && !trimmed.startsWith('لا تتضمن') && !trimmed.startsWith('لا أستطيع')
      && trimmed.length >= 20;
  });
  return candidates.slice(0, maxPoints).map(s => s.trim());
}

function calculateConfidence(avgScore, groundingScore) {
  const search = typeof avgScore === 'number' ? avgScore : 0;
  const grounding = typeof groundingScore === 'number' ? groundingScore : search;
  const raw = (search * 0.6) + (grounding * 0.4);
  return Math.round(raw * 10000) / 10000;
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

// ── Stage 2: Budget Check (Phase 77) ───────────────────────────
async function stageBudgetCheck(ctx, _trace) {
  if (!costGovernor.enforcementEnabled) {
    ctx._budgetSkipped = true;
    return ctx;
  }

  const check = costGovernor.isSessionOverBudget(ctx.sessionId);
  ctx._budgetCheck = check;

  if (check.overBudget) {
    ctx.aborted = true;
    ctx.abortReason = 'budget_exceeded';
    ctx._budgetSkipped = false;
  } else {
    ctx._budgetSkipped = false;
  }
  return ctx;
}

// ── Stage 3: Route Query ───────────────────────────────────────
async function stageRouteQuery(ctx, _trace) {
  ctx.queryRoute = routeQuery(ctx.message);
  return ctx;
}

// ── Stage 2.5: Complexity Analysis (Phase 64) ─────────────────
async function stageComplexityAnalysis(ctx, _trace) {
  if (!queryComplexityAnalyzer.enabled) {
    ctx._complexity = { type: 'factual', score: 1, indicators: [] };
    ctx._complexitySkipped = true;
    return ctx;
  }

  ctx._complexity = queryComplexityAnalyzer.analyze(ctx.message);
  const strategy = queryComplexityAnalyzer.getStrategy(ctx._complexity);

  if (strategy.topK) {
    ctx._complexityTopK = strategy.topK;
  }
  if (strategy.promptSuffix) {
    ctx._complexityPromptSuffix = strategy.promptSuffix;
  }

  ctx._complexitySkipped = false;
  return ctx;
}

// ── Stage 5: Query Planning (Phase 81) ─────────────────────────
async function stageQueryPlan(ctx, _trace) {
  if (!queryPlanner.enabled || !ctx._complexity || ctx._complexitySkipped) {
    ctx._planSkipped = true;
    ctx._planSkipReason = 'disabled';
    ctx._subQueries = null;
    ctx._mergeStrategy = null;
    return ctx;
  }

  if (!queryPlanner.shouldPlan(ctx.effectiveMessage, ctx._complexity)) {
    ctx._planSkipped = true;
    ctx._planSkipReason = 'below_threshold';
    ctx._subQueries = null;
    ctx._mergeStrategy = null;
    return ctx;
  }

  const plan = queryPlanner.decompose(ctx.effectiveMessage, ctx._complexity);

  if (!plan.subQueries || plan.subQueries.length <= 1) {
    ctx._planSkipped = true;
    ctx._planSkipReason = 'single_query';
    ctx._subQueries = null;
    ctx._mergeStrategy = null;
    return ctx;
  }

  ctx._subQueries = plan.subQueries;
  ctx._mergeStrategy = plan.strategy;
  ctx._planSkipped = false;
  return ctx;
}

// ── Local rewrite helper (Phase 28, updated Phase 32) — pure function, no API call ──
// Handles short follow-up patterns by injecting entities from ConversationContext.
// Returns { rewritten, pattern } or null (null → fallback to API rewrite).
function attemptLocalRewrite(message, convCtx) {
  if (!convCtx || !convCtx.entities || convCtx.entities.length === 0) return null;

  const normalized = message.trim();
  const lower = normalized.toLowerCase();

  // Last 3 entities joined — most recent context
  const entityHint = convCtx.entities.slice(-3).join(' و ');

  // Pattern 1: "أكثر", "المزيد", "تفصيل", "وضح", "شرح", "بالتفصيل", "فصّل"
  if (/^(أكثر|اكثر|المزيد|تفصيل|وضح|وضّح|شرح|اشرح|فصّل|فصل|بالتفصيل|بتوسع)$/i.test(lower)) {
    return { rewritten: `${normalized} فيما يخص ${entityHint}`, pattern: 'more_detail' };
  }

  // Pattern 2: "وماذا عنه؟", "وماذا عنها؟", "ماذا عن", "وإيه عنه"
  if (/^(وماذا عنه|وماذا عنها|ماذا عن|وإيه عنه|وايه عنه|وماذا عنهم)\??[؟]?$/i.test(lower)) {
    return { rewritten: `ماذا عن ${entityHint}؟`, pattern: 'what_about' };
  }

  // Pattern 3: "نعم", "أيوا", "اه", "طيب", "تمام", "أكمل", "اكمل", "استمر"
  if (/^(نعم|أيوا|ايوا|اه|آه|طيب|تمام|أكمل|اكمل|استمر|كمّل|كمل)$/i.test(lower)) {
    return { rewritten: `أكمل فيما يخص ${entityHint}`, pattern: 'affirm_continue' };
  }

  // Pattern 4: "لماذا؟", "ليش", "ليه", "لمَ"
  if (/^(لماذا|ليش|ليه|لمَ|لم)[؟?]?$/i.test(lower)) {
    return { rewritten: `لماذا ${entityHint}؟`, pattern: 'why' };
  }

  // Pattern 5: "كيف؟", "كيف ذلك", "ازاي", "كيفية"
  if (/^(كيف|كيف ذلك|ازاي|إزاي|كيفية)[؟?]?$/i.test(lower)) {
    return { rewritten: `كيف ${entityHint}؟`, pattern: 'how' };
  }

  // Pattern 6: "متى؟", "متى ذلك", "إمتى", "امتى"
  if (/^(متى|متى ذلك|إمتى|امتى)[؟?]?$/i.test(lower)) {
    return { rewritten: `متى ${entityHint}؟`, pattern: 'when' };
  }

  // Pattern 7: "أين؟", "اين", "وين", "فين"
  if (/^(أين|اين|وين|فين)[؟?]?$/i.test(lower)) {
    return { rewritten: `أين ${entityHint}؟`, pattern: 'where' };
  }

  // Pattern 8: "مَن؟", "من", "مين", "منو"
  if (/^(مَن|من|مين|منو)[؟?]?$/i.test(lower)) {
    return { rewritten: `مَن ${entityHint}؟`, pattern: 'who' };
  }

  // Pattern 9: "الفرق؟", "ما الفرق", "ايش الفرق"
  if (/^(الفرق|ما الفرق|ايش الفرق|إيش الفرق)[؟?]?$/i.test(lower)) {
    if (convCtx.entities.length >= 2) {
      return { rewritten: `ما الفرق بين ${convCtx.entities[convCtx.entities.length - 1]} و${convCtx.entities[convCtx.entities.length - 2]}؟`, pattern: 'difference' };
    }
    return { rewritten: `ما الفرق فيما يخص ${entityHint}؟`, pattern: 'difference' };
  }

  // Pattern 10: "والعكس؟", "العكس", "بالعكس"
  if (/^(والعكس|العكس|بالعكس)[؟?]?$/i.test(lower)) {
    return { rewritten: `ماذا عن عكس ذلك فيما يخص ${entityHint}؟`, pattern: 'opposite' };
  }

  // Pattern 11: "مثال؟", "أعطيني مثال", "اعطني مثال"
  if (/^(مثال|أعطيني مثال|اعطني مثال|أعطني مثال|اعطيني مثال)[؟?]?$/i.test(lower)) {
    return { rewritten: `أعطني مثال عن ${entityHint}`, pattern: 'example' };
  }

  // No match — return null so API rewrite is used as fallback
  return null;
}

// ── Dynamic System Prompt Enrichment (Phase 37) — pure function, no API call ──
// Wraps the base prompt (from promptTemplates) with library metadata
// from LibraryIndex. Falls back to base prompt when:
//   - SYSTEM_PROMPT_ENRICHMENT.enabled !== true
//   - LIBRARY_INDEX not active or not yet refreshed
//   - No enrichment fields enabled
function buildDynamicSystemPrompt(basePrompt) {
  const enrichConfig = config.SYSTEM_PROMPT_ENRICHMENT;
  if (!enrichConfig || enrichConfig.enabled !== true) return basePrompt;

  const index = libraryIndex.getIndex();
  if (!index) return basePrompt; // Index not ready — use static

  const parts = [];

  // Custom preamble (if configured)
  if (enrichConfig.customPreamble && typeof enrichConfig.customPreamble === 'string' && enrichConfig.customPreamble.trim()) {
    parts.push(enrichConfig.customPreamble.trim());
  }

  // File count + total points
  if (enrichConfig.includeFileCount !== false) {
    parts.push(
      `المكتبة تحتوي على ${index.fileCount} ملف مصدري و${index.totalPoints} مقطع محتوى.`
    );
  }

  // Topic list
  if (enrichConfig.includeTopicList !== false && index.topicCount > 0) {
    const topicNames = libraryIndex.getTopicNames();
    if (topicNames.length > 0) {
      parts.push(
        `الأقسام المتاحة في المكتبة: ${topicNames.join('، ')}.`
      );
    }
  }

  // Last refresh timestamp
  if (enrichConfig.includeLastRefresh === true && index.lastRefresh) {
    const refreshDate = new Date(index.lastRefresh).toLocaleString('ar-EG');
    parts.push(`آخر تحديث لفهرس المكتبة: ${refreshDate}.`);
  }

  // Phase 41: Known content gaps — warn the model about topics not well covered
  if (enrichConfig.includeKnownGaps === true && contentGapDetector.enabled) {
    const maxGaps = Math.min(Math.max(enrichConfig.maxGapsInPrompt ?? 5, 1), 10);
    const minFreq = config.CONTENT_GAPS?.minFrequencyToShow ?? 2;
    const gaps = contentGapDetector.getGaps(maxGaps);

    if (gaps.length > 0) {
      const gapDescriptions = gaps
        .filter(g => g.count >= minFreq)
        .map(g => g.keywords.slice(0, 3).join(' + '))
        .slice(0, maxGaps);

      if (gapDescriptions.length > 0) {
        parts.push(
          `تنبيه: المكتبة لا تغطي بشكل كافٍ المواضيع التالية: ${gapDescriptions.join('، ')}. إذا سُئلت عن أحد هذه المواضيع، أجب بوضوح أن المكتبة لا تحتوي على معلومات كافية حول هذا الموضوع بدلاً من محاولة الإجابة من سياق ضعيف.`
        );
      }
    }
  }

  if (parts.length === 0) return basePrompt;

  // Enriched prompt: dynamic preamble → then base prompt (query-type-specific)
  const enrichment = parts.join('\n');
  return `${enrichment}\n\n${basePrompt}`;
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

  // ── Phase 28: attempt local rewrite first (no API call) ────
  if (config.CONTEXT?.intelligentCompaction !== false &&
      conversationContext.hasRichContext(ctx.sessionId)) {
    const convCtx = conversationContext.getContext(ctx.sessionId);
    const localRewrite = attemptLocalRewrite(ctx.message, convCtx);
    if (localRewrite) {
      ctx.effectiveMessage = localRewrite.rewritten;
      ctx._rewriteSkipped  = false;
      ctx._rewriteResult   = { wasRewritten: true, rewritten: localRewrite.rewritten, original: ctx.message, method: 'local_context', pattern: localRewrite.pattern };
      return ctx;
    }
  }

  // ── Fallback: API rewrite via Gemini ───────────────────────
  const result = await rewriteQuery(
    ctx.message,
    ctx.transcript.replayForAPI(config.FOLLOWUP?.maxHistoryItems ?? 4)
  );

  if (result.wasRewritten) {
    ctx.effectiveMessage = result.rewritten;
  }

  ctx._rewriteSkipped = false;
  ctx._rewriteResult  = { ...result, method: 'api' };
  return ctx;
}

// ── Stage 4: Embed ─────────────────────────────────────────────
async function stageEmbed(ctx, _trace) {
  if (ctx._subQueries && ctx._subQueries.length > 1) {
    // Phase 81: Multi-query embedding via embedBatch
    const vectors = await embedBatch(ctx._subQueries);
    ctx._queryVectors = vectors.filter(v => v !== null);
    // Primary vector for backward compat (used by stages that expect single vector)
    ctx.queryVector = ctx._queryVectors.length > 0
      ? ctx._queryVectors[0]
      : await embedText(ctx.effectiveMessage);
  } else {
    ctx.queryVector = await embedText(ctx.effectiveMessage);
  }
  return ctx;
}

// ── Collection resolution helper (Phase 60) ────────────────────
function resolveCollection(libraryId) {
  if (!libraryId) return null;
  if (!config.MULTI_LIBRARY?.enabled) return null;
  const lib = (config.MULTI_LIBRARY.libraries || []).find(l => l.id === libraryId);
  return lib?.qdrantCollection || null;
}

// ── Stage 5: Search ────────────────────────────────────────────
async function stageSearch(ctx, _trace) {
  let topK = getTopK(ctx.queryRoute.type);

  // Phase 64: Complexity-based topK (highest priority)
  if (ctx._complexityTopK) {
    topK = ctx._complexityTopK;
  }
  // Adaptive topK adjustment (Phase 22) — only if no complexity topK
  else if (ctx._adaptiveConfig?.topKAdjustment) {
    topK = Math.max(3, topK + ctx._adaptiveConfig.topKAdjustment);
  }

  const collection = resolveCollection(ctx.libraryId);

  // Phase 81: Multi-step search when sub-queries produced multiple vectors
  if (ctx._queryVectors && ctx._queryVectors.length > 1) {
    ctx.hits = await queryPlanner.searchAndMerge(ctx._queryVectors, topK, ctx.topicFilter, collection);
  } else {
    ctx.hits = await search(ctx.queryVector, topK, ctx.topicFilter, collection);
  }

  // Compute average score (same logic as previous chat.js)
  if (!ctx.hits.length) {
    ctx.avgScore = 0;
  } else {
    ctx.avgScore = ctx.hits.reduce((s, h) => s + h.score, 0) / ctx.hits.length;
  }

  ctx._searchTopK = topK;
  return ctx;
}

// ── Stage 5.5: Re-rank (Phase 63) ─────────────────────────────
async function stageRerank(ctx, _trace) {
  if (!searchReranker.enabled) {
    ctx._rerankSkipped = true;
    return ctx;
  }

  const originalOrder = ctx.hits.map(h => h.payload?.file_name || '');
  ctx.hits = searchReranker.rerank(ctx.hits, ctx.effectiveMessage);

  // Recompute avgScore after re-ranking (order may have changed)
  if (ctx.hits.length > 0) {
    ctx.avgScore = ctx.hits.reduce((s, h) => s + h.score, 0) / ctx.hits.length;
  }

  ctx._rerankSkipped = false;
  ctx._rerankOriginalOrder = originalOrder;
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
  const basePrompt = getPromptForType(ctx.queryRoute.type);
  ctx.systemPrompt = buildDynamicSystemPrompt(basePrompt);
  ctx._promptEnriched = (ctx.systemPrompt !== basePrompt);

  // Concise mode — append brevity instruction (Phase 25)
  if (ctx._responseMode === 'concise') {
    const maxSentences = config.RESPONSE?.conciseMaxSentences ?? 3;
    ctx.systemPrompt += `\n\nتعليمات إضافية: أجب بإيجاز شديد في ${maxSentences} جمل كحد أقصى. ركّز على المعلومة الأساسية فقط بدون مقدمات أو تكرار.`;
  }

  // Phase 64: Complexity-aware prompt suffix
  if (ctx._complexityPromptSuffix) {
    ctx.systemPrompt += `\n\nتعليمات إضافية: ${ctx._complexityPromptSuffix}`;
  }

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
  // Structured mode: accumulate text only — no SSE streaming
  // Stream/concise modes: stream chunks to client via SSE (existing behavior)
  const onChunk = ctx._responseMode === 'structured'
    ? (chunk) => { ctx.fullText += chunk; }
    : (chunk) => { ctx.fullText += chunk; writeChunk(ctx.res, { text: chunk }); };

  await streamGenerate(
    ctx.systemPrompt,
    ctx.context,
    ctx.trimmedHistory,
    ctx.message,
    onChunk,
  );

  // ── Phase 79: Structured Output Enrichment ──────────────────
  if (ctx._responseMode === 'structured' && config.STRUCTURED_OUTPUT?.enabled) {
    const maxKP = Math.min(Math.max(config.STRUCTURED_OUTPUT.maxKeyPoints ?? 5, 1), 10);
    ctx._keyPoints = extractKeyPoints(ctx.fullText, maxKP);
    ctx._structuredSchema = 'default';

    if (config.STRUCTURED_OUTPUT.includeConfidence !== false) {
      ctx._confidencePending = true;
    }
  }

  return ctx;
}

// ── Stage 9: Grounding Check (Phase 69) ────────────────────────
async function stageGroundingCheck(ctx, _trace) {
  if (!answerGroundingChecker.enabled || ctx.aborted || !ctx.fullText) {
    ctx._groundingSkipped = true;
    ctx._groundingScore = null;
    ctx._groundingResult = null;
    return ctx;
  }

  const contextText = ctx.context || '';
  const result = await answerGroundingChecker.check(ctx.fullText, contextText);

  ctx._groundingScore = result.score;
  ctx._groundingResult = result;
  ctx._groundingSkipped = false;
  ctx._semanticMatchingUsed = result.semanticUsed ?? false;

  return ctx;
}

// ── Stage 10: Answer Refinement — Self-Correction Loop (Phase 78) ──
async function stageAnswerRefinement(ctx, _trace) {
  // ── Skip conditions ───────────────────────────────────────
  // 1. Feature not enabled
  if (!featureFlags.isEnabled('ANSWER_REFINEMENT')) {
    ctx._refinementSkipped = true;
    ctx._refinementSkipReason = 'disabled';
    return ctx;
  }
  // 2. Grounding check was skipped or not available
  if (ctx._groundingSkipped || ctx._groundingScore === null || ctx._groundingScore === undefined) {
    ctx._refinementSkipped = true;
    ctx._refinementSkipReason = 'no_grounding_data';
    return ctx;
  }
  // 3. Pipeline aborted or no text
  if (ctx.aborted || !ctx.fullText) {
    ctx._refinementSkipped = true;
    ctx._refinementSkipReason = 'aborted_or_empty';
    return ctx;
  }
  // 4. Response mode is 'stream' — can't replace already-streamed text
  if (ctx._responseMode === 'stream') {
    ctx._refinementSkipped = true;
    ctx._refinementSkipReason = 'streaming_mode';
    return ctx;
  }
  // 5. Grounding score already acceptable
  const minScore = config.ANSWER_REFINEMENT?.minScoreToRetry ?? 0.3;
  if (ctx._groundingScore >= minScore) {
    ctx._refinementSkipped = true;
    ctx._refinementSkipReason = 'score_acceptable';
    return ctx;
  }

  // ── Refinement loop ───────────────────────────────────────
  const maxAttempts = Math.min(Math.max(config.ANSWER_REFINEMENT?.maxRefinements ?? 1, 1), 3);
  const suffix = config.ANSWER_REFINEMENT?.refinementPromptSuffix || '';
  const enhancedPrompt = ctx.systemPrompt + (suffix ? `\n\n${suffix}` : '');

  let bestText = ctx.fullText;
  let bestScore = ctx._groundingScore;
  const originalScore = ctx._groundingScore;
  let attempts = 0;

  for (let i = 0; i < maxAttempts; i++) {
    attempts++;
    try {
      const result = await generate(enhancedPrompt, ctx.context, ctx.trimmedHistory, ctx.message);
      if (!result.text) break;

      const newGrounding = await answerGroundingChecker.check(result.text, ctx.context || '');

      if (newGrounding.score > bestScore) {
        bestText = result.text;
        bestScore = newGrounding.score;
      }

      // Good enough — stop retrying
      if (newGrounding.score >= (config.GROUNDING?.minGroundingScore ?? 0.4)) break;
    } catch (_err) {
      // Refinement failure should not crash pipeline — log and break
      break;
    }
  }

  // ── Apply best result ─────────────────────────────────────
  const improved = bestScore > originalScore;
  if (improved) {
    ctx.fullText = bestText;
    ctx._groundingScore = bestScore;
  }

  ctx._refinementSkipped = false;
  ctx._refinementAttempts = attempts;
  ctx._refinementImproved = improved;
  ctx._refinementOriginalScore = originalScore;
  ctx._refinementFinalScore = bestScore;

  // ── Emit event ────────────────────────────────────────────
  eventBus.emit('answer:refined', {
    correlationId: _trace?.correlationId ?? null,
    attempts,
    improved,
    originalScore,
    finalScore: bestScore,
    sessionId: ctx.sessionId,
    timestamp: Date.now(),
  });

  return ctx;
}

// ── Stage 11: Citation Mapping (Phase 71) ──────────────────────
async function stageCitationMapping(ctx, _trace) {
  if (!citationMapper.enabled || ctx.aborted || !ctx.fullText || !ctx.sources) {
    ctx._citationSkipped = true;
    ctx._citations = null;
    ctx._sourceRelevance = null;
    return ctx;
  }

  const contextText = ctx.context || '';
  const result = await citationMapper.map(ctx.fullText, ctx.sources, contextText);

  ctx._citations = result.citations;
  ctx._sourceRelevance = result.sourceRelevance;
  ctx._citationSkipped = false;

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

    // ── Pipeline-level timeout (Phase 49) ───────────────────
    const maxMs = config.PIPELINE?.maxRequestMs ?? 25000;
    const deadline = maxMs > 0 ? ctx.startTime + maxMs : 0;

    for (const stage of this.#stages) {
      // Stop if a previous stage signalled abort
      if (ctx.aborted) break;

      // Pipeline timeout check (Phase 49)
      if (deadline > 0 && Date.now() > deadline) {
        ctx.aborted = true;
        ctx.abortReason = 'pipeline_timeout';
        trace.record('pipeline_timeout', Date.now() - ctx.startTime, 'timeout', { maxMs });
        break;
      }

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

    case 'stageBudgetCheck':
      if (ctx._budgetSkipped) {
        return { status: 'skip', detail: { reason: 'enforcement_disabled' } };
      }
      return {
        status: ctx.aborted ? 'aborted' : 'ok',
        detail: {
          currentTokens: ctx._budgetCheck?.currentTokens ?? 0,
          limit: ctx._budgetCheck?.limit ?? 0,
          ratio: ctx._budgetCheck?.ratio ?? 0,
        },
      };

    case 'stageRouteQuery':
      return {
        status: 'ok',
        detail: { type: ctx.queryRoute.type, isFollowUp: ctx.queryRoute.isFollowUp },
      };

    case 'stageComplexityAnalysis':
      if (ctx._complexitySkipped) {
        return { status: 'skip', detail: { reason: 'disabled' } };
      }
      return {
        status: 'ok',
        detail: {
          type: ctx._complexity?.type ?? 'factual',
          score: ctx._complexity?.score ?? 1,
          indicators: ctx._complexity?.indicators ?? [],
        },
      };

    case 'stageQueryPlan':
      if (ctx._planSkipped) {
        return { status: 'skip', detail: { reason: ctx._planSkipReason || 'disabled' } };
      }
      return {
        status: 'ok',
        detail: {
          subQueryCount: ctx._subQueries?.length ?? 0,
          mergeStrategy: ctx._mergeStrategy ?? 'single',
          complexityType: ctx._complexity?.type ?? 'unknown',
        },
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

    case 'stageRerank':
      if (ctx._rerankSkipped) {
        return { status: 'skip', detail: { reason: 'disabled' } };
      }
      return {
        status: 'ok',
        detail: {
          hitCount: ctx.hits?.length ?? 0,
          avgScoreAfterRerank: ctx.avgScore,
        },
      };

    case 'stageConfidenceCheck':
      return {
        status: ctx.aborted ? 'aborted' : 'ok',
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

    case 'stageGroundingCheck':
      if (ctx._groundingSkipped) {
        return { status: 'skip', detail: { reason: ctx.aborted ? 'aborted' : 'disabled' } };
      }
      return {
        status: 'ok',
        detail: {
          score: ctx._groundingScore,
          totalClaims: ctx._groundingResult?.totalClaims ?? 0,
          groundedClaims: ctx._groundingResult?.groundedClaims ?? 0,
        },
      };

    case 'stageCitationMapping':
      if (ctx._citationSkipped) {
        return { status: 'skip', detail: { reason: ctx.aborted ? 'aborted' : 'disabled' } };
      }
      return {
        status: 'ok',
        detail: {
          citationCount: ctx._citations?.length ?? 0,
          sourceCount: ctx._sourceRelevance?.length ?? 0,
        },
      };

    case 'stageAnswerRefinement':
      if (ctx._refinementSkipped) {
        return { status: 'skip', detail: { reason: ctx._refinementSkipReason || 'disabled' } };
      }
      return {
        status: 'ok',
        detail: {
          attempts: ctx._refinementAttempts ?? 0,
          improved: ctx._refinementImproved ?? false,
          originalScore: ctx._refinementOriginalScore ?? null,
          finalScore: ctx._refinementFinalScore ?? null,
        },
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
  stageBudgetCheck,           // Phase 77 — actual token budget enforcement
  stageRouteQuery,
  stageComplexityAnalysis,  // Phase 64 — query complexity analysis
  stageQueryPlan,           // Phase 81 — multi-step query decomposition
  stageRewriteQuery,
  stageEmbed,
  stageSearch,
  stageRerank,              // Phase 63 — keyword overlap + source diversity
  stageConfidenceCheck,
  stageBuildContext,
  stageStream,
  stageGroundingCheck,      // Phase 69 — answer grounding & faithfulness check
  stageAnswerRefinement,    // Phase 78 — self-correction loop (structured mode only)
  stageCitationMapping,     // Phase 71 — sentence-to-source citation mapping
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
      _cacheKey: `chat:${_ctx.libraryId || 'default'}:${_ctx.topicFilter ?? 'all'}:${_ctx.message.trim().toLowerCase()}`,
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
        request_id:        _ctx.requestId || null,
      },
      _traceCompact: trace.toCompact(),

      // ── Intent classification (Phase 21) ───────────────────
      _queryIntent: _ctx._queryIntent ?? null,

      // ── Response mode (Phase 25) ───────────────────────────
      _responseMode: _ctx._responseMode ?? 'stream',

      // ── Rewrite method (Phase 28) ─────────────────────────
      _rewriteMethod: _ctx._rewriteResult?.method ?? null,

      // ── Rewrite result detail (Phase 32) ───────────────────
      _rewriteResult: _ctx._rewriteResult ?? null,

      // ── Re-rank applied flag (Phase 63) ───────────────────
      _rerankApplied: !_ctx._rerankSkipped,

      // ── Complexity analysis (Phase 64) ────────────────────
      _complexityType: _ctx._complexity?.type ?? null,
      _complexityScore: _ctx._complexity?.score ?? 0,

      // ── Prompt enrichment flag (Phase 37) ────────────────────
      _promptEnriched: _ctx._promptEnriched ?? false,

      // ── Library ID (Phase 61) ────────────────────────────────
      _libraryId: _ctx.libraryId || null,

      // ── Request ID (Phase 66) ────────────────────────────────
      _requestId: _ctx.requestId || null,

      // ── Grounding check (Phase 69) ───────────────────────────
      _groundingScore: _ctx._groundingScore ?? null,
      _groundingSkipped: _ctx._groundingSkipped ?? true,

      // ── Citation mapping (Phase 71) ──────────────────────────
      _citations: _ctx._citations ?? null,
      _citationSkipped: _ctx._citationSkipped ?? true,
      _sourceRelevance: _ctx._sourceRelevance ?? null,

      // ── Semantic matching (Phase 73) ─────────────────────────
      _semanticMatchingUsed: _ctx._semanticMatchingUsed ?? false,

      // ── Answer refinement (Phase 78) ─────────────────────────
      _refinementApplied: !(_ctx._refinementSkipped ?? true),
      _refinementAttempts: _ctx._refinementAttempts ?? 0,
      _refinementImproved: _ctx._refinementImproved ?? false,

      // ── Query planning (Phase 81) ────────────────────────────
      _queryPlanApplied: !(_ctx._planSkipped ?? true),
      _subQueryCount: _ctx._subQueries?.length ?? 0,
      _mergeStrategy: _ctx._mergeStrategy ?? null,
    });
  });
}

// ═══════════════════════════════════════════════════════════════
// Exports
// ═══════════════════════════════════════════════════════════════

export { PipelineContext, PipelineRunner, chatPipeline, writeChunk, buildContext, buildSources, attemptLocalRewrite, buildDynamicSystemPrompt, stageRerank, stageComplexityAnalysis, stageQueryPlan, stageGroundingCheck, stageAnswerRefinement, stageCitationMapping, stageBudgetCheck, extractKeyPoints, calculateConfidence };
