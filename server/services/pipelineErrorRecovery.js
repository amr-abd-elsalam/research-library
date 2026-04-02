// server/services/pipelineErrorRecovery.js
// ═══════════════════════════════════════════════════════════════
// PipelineErrorRecovery — Phase 18
// Single source of truth for pipeline error classification
// and partial pipeline:complete event data construction.
// Eliminates data shape duplication between chat.js and pipeline.js.
// ═══════════════════════════════════════════════════════════════

import { GeminiTimeoutError, GeminiSafetyError, GeminiEmptyError } from './gemini.js';
import { QdrantNotFoundError, QdrantTimeoutError, QdrantConnectionError } from './qdrant.js';
import { CircuitOpenError } from './circuitBreaker.js';
import { logger } from './logger.js';

/**
 * @typedef {Object} ErrorClassification
 * @property {string}  category         — error type: 'timeout' | 'safety' | 'empty' | 'service_unavailable' | 'circuit_open' | 'unknown'
 * @property {string}  userMessage      — Arabic message to show the user
 * @property {string}  code             — machine-readable error code for SSE
 * @property {boolean} isPartial        — true if there's partial streaming content to preserve
 * @property {boolean} shouldEmitComplete — true if we need to emit pipeline:complete for listeners
 */

class PipelineErrorRecovery {

  /**
   * Classifies a pipeline error and determines recovery strategy.
   * @param {Error} err — the caught error
   * @param {PipelineContext} ctx — pipeline context (for checking partial content)
   * @returns {ErrorClassification}
   */
  classify(err, ctx) {
    const hasPartialContent = ctx.fullText && ctx.fullText.length > 0;

    // ── GeminiTimeoutError during streaming (partial response exists) ──
    if (err instanceof GeminiTimeoutError && hasPartialContent) {
      return {
        category:            'timeout_partial',
        userMessage:         'تم قطع الإجابة بسبب انتهاء المهلة.',
        code:                'TIMEOUT',
        isPartial:           true,
        shouldEmitComplete:  true,
      };
    }

    // ── GeminiTimeoutError before streaming ──
    if (err instanceof GeminiTimeoutError) {
      return {
        category:            'timeout',
        userMessage:         'انتهت مهلة الاتصال',
        code:                'TIMEOUT',
        isPartial:           false,
        shouldEmitComplete:  false,
      };
    }

    // ── CircuitOpenError ──
    if (err instanceof CircuitOpenError) {
      return {
        category:            'circuit_open',
        userMessage:         'الخدمة غير متاحة حالياً، يرجى المحاولة بعد قليل',
        code:                'SERVICE_UNAVAILABLE',
        isPartial:           false,
        shouldEmitComplete:  false,
      };
    }

    // ── Qdrant errors ──
    if (err instanceof QdrantNotFoundError) {
      return {
        category:            'service_unavailable',
        userMessage:         'قاعدة البيانات غير جاهزة',
        code:                'SERVICE_UNAVAILABLE',
        isPartial:           false,
        shouldEmitComplete:  false,
      };
    }
    if (err instanceof QdrantTimeoutError) {
      return {
        category:            'timeout',
        userMessage:         'انتهت مهلة الاتصال',
        code:                'TIMEOUT',
        isPartial:           false,
        shouldEmitComplete:  false,
      };
    }
    if (err instanceof QdrantConnectionError) {
      return {
        category:            'service_unavailable',
        userMessage:         'قاعدة البيانات غير متاحة حالياً',
        code:                'SERVICE_UNAVAILABLE',
        isPartial:           false,
        shouldEmitComplete:  false,
      };
    }

    // ── Gemini safety block ──
    if (err instanceof GeminiSafetyError) {
      return {
        category:            'safety',
        userMessage:         'لا يمكن معالجة هذا السؤال، يرجى إعادة الصياغة',
        code:                'SAFETY_BLOCKED',
        isPartial:           false,
        shouldEmitComplete:  false,
      };
    }

    // ── Gemini empty response ──
    if (err instanceof GeminiEmptyError) {
      return {
        category:            'empty',
        userMessage:         'لم يتمكن النظام من توليد إجابة، يرجى المحاولة',
        code:                'EMPTY_RESPONSE',
        isPartial:           false,
        shouldEmitComplete:  false,
      };
    }

    // ── Unknown error ──
    logger.error('pipelineRecovery', 'unclassified pipeline error', { error: err.message });
    return {
      category:            'unknown',
      userMessage:         'حدث خطأ في المعالجة',
      code:                'SERVER_ERROR',
      isPartial:           false,
      shouldEmitComplete:  false,
    };
  }

  /**
   * Builds the pipeline:complete event data for partial/error responses.
   * Single source of truth — eliminates duplication with the enriched
   * afterPipeline hook in pipeline.js.
   *
   * @param {PipelineContext} ctx
   * @param {EventTrace} trace
   * @param {number} startTime — Date.now() from request start
   * @returns {object} — event data matching the shape emitted by afterPipeline hook
   */
  buildPartialCompleteEvent(ctx, trace, startTime) {
    return {
      // ── Core fields ────────────────────────────────────────
      correlationId:    trace.correlationId,
      aborted:          false,
      abortReason:      null,
      totalMs:          Date.now() - startTime,
      queryType:        ctx.queryRoute?.type ?? null,

      // ── Context fields ─────────────────────────────────────
      message:          ctx.message,
      fullText:         ctx.fullText,
      sources:          ctx.sources,
      avgScore:         ctx.avgScore,
      sessionId:        ctx.sessionId,
      topicFilter:      ctx.topicFilter,
      effectiveMessage: ctx.effectiveMessage,

      // ── Null/zero for unavailable fields ───────────────────
      _tokenEstimates:  null,
      _cacheKey:        null,
      _cacheEntry:      null,

      // ── Analytics entry ────────────────────────────────────
      _analytics: {
        event_type:        'chat',
        req:               ctx.req,
        topic_filter:      ctx.topicFilter || null,
        query_type:        ctx.queryRoute?.type,
        message_length:    ctx.message.length,
        response_length:   (ctx.fullText || '').length,
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
    };
  }
}

// ── Singleton export ───────────────────────────────────────────
export const pipelineErrorRecovery = new PipelineErrorRecovery();
