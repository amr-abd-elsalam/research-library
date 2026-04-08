// tests/helpers/pipeline-test-harness.js
// ═══════════════════════════════════════════════════════════════
// Phase 83 — PipelineTestHarness
// Orchestrates MockLLMProvider + MockVectorStore to enable
// full pipeline integration testing without external services.
//
// Strategy:
//   - LLM: Register MockLLMProvider in llmProviderRegistry under
//     the configured provider name ('gemini'). The gemini.js facade
//     delegates to registry.get() → transparently uses mock.
//   - Qdrant: Instead of patching ESM imports (not possible with
//     live bindings), we create replacement stageEmbed + stageSearch
//     functions that delegate to the mock store, then build a
//     custom pipeline stage array using these replacements.
//     This is cleaner and avoids module patching entirely.
//
// Usage:
//   const harness = new PipelineTestHarness();
//   await harness.setup();
//   const { ctx, trace } = await harness.run('ما هو الذكاء الاصطناعي؟');
//   await harness.teardown();
// ═══════════════════════════════════════════════════════════════

import { MockLLMProvider }              from './mock-llm-provider.js';
import { MockVectorStore, buildHit }    from './mock-vector-store.js';
import {
  PipelineContext,
  PipelineRunner,
  chatPipeline,
  stageTranscriptInit,
  stageBudgetCheck,
  stageRouteQuery,
  stageComplexityAnalysis,
  stageQueryPlan,
  stageRewriteQuery,
  stageEmbed        as realStageEmbed,
  stageSearch       as realStageSearch,
  stageRerank,
  stageConfidenceCheck,
  stageBuildContext,
  stageStream,
  stageGroundingCheck,
  stageAnswerRefinement,
  stageCitationMapping,
  writeChunk,
  buildContext,
  buildSources,
}                                       from '../../server/services/pipeline.js';
import { EventTrace }                   from '../../server/services/eventTrace.js';
import { llmProviderRegistry }          from '../../server/services/llmProvider.js';
import { GeminiProvider }               from '../../server/services/providers/geminiProvider.js';
import { featureFlags }                 from '../../server/services/featureFlags.js';
import { conversationContext }          from '../../server/services/conversationContext.js';
import { pipelineComposer }            from '../../server/services/pipelineComposer.js';
import { costGovernor }                 from '../../server/services/costGovernor.js';

// ── Feature flag sections to clear on teardown ────────────────
const ALL_FEATURE_SECTIONS = [
  'QUERY_COMPLEXITY', 'QUERY_PLANNING', 'RETRIEVAL', 'GROUNDING',
  'ANSWER_REFINEMENT', 'CITATION', 'COST_GOVERNANCE', 'SEMANTIC_MATCHING',
  'FEEDBACK', 'SUGGESTIONS', 'CONTENT_GAPS', 'QUALITY',
  'HEALTH_SCORE', 'ADMIN_INTELLIGENCE',
];

class PipelineTestHarness {
  /**
   * @param {object} [options]
   * @param {object} [options.llm]   — options for MockLLMProvider
   * @param {object} [options.store] — options for MockVectorStore
   */
  constructor(options = {}) {
    this.mockLLM   = new MockLLMProvider(options.llm || {});
    this.mockStore  = new MockVectorStore(options.store || {});
    this._options   = options;
    this._setupDone = false;
  }

  /**
   * Registers mock LLM provider under 'gemini' name in the registry.
   * The gemini.js facade calls llmProviderRegistry.get() which resolves
   * to 'gemini' by default → returns our mock transparently.
   */
  async setup() {
    // 1. Reset registry (clears factories + cached instances)
    llmProviderRegistry.reset();

    // 2. Register mock as 'gemini' (the config default provider name)
    llmProviderRegistry.register('gemini', () => this.mockLLM);

    this._setupDone = true;
  }

  /**
   * Creates a mock HTTP response object that captures SSE chunks.
   * @returns {{ writeHead: Function, write: Function, end: Function, on: Function, setTimeout: Function, headersSent: boolean, writableEnded: boolean, _chunks: string[] }}
   */
  createMockRes() {
    const chunks = [];
    let headersSent = false;
    let ended = false;
    return {
      writeHead: () => { headersSent = true; },
      write:     (data) => { chunks.push(data); },
      end:       () => { ended = true; },
      on:        () => {},
      setTimeout: () => {},
      get headersSent() { return headersSent; },
      get writableEnded() { return ended; },
      _chunks: chunks,
    };
  }

  /**
   * Creates a mock HTTP request object.
   * @param {object} [overrides]
   * @returns {object}
   */
  createMockReq(overrides = {}) {
    return {
      headers: { 'x-forwarded-for': '127.0.0.1' },
      socket: { remoteAddress: '127.0.0.1' },
      setTimeout: () => {},
      ...overrides,
    };
  }

  /**
   * Builds the pipeline stage array with mock-aware replacements.
   *
   * The real stageEmbed and stageSearch import from gemini.js and qdrant.js
   * respectively. For stageEmbed, the gemini.js facade delegates to
   * llmProviderRegistry.get() which now returns our MockLLMProvider.
   * For stageSearch, we create a replacement that calls our MockVectorStore.
   *
   * @param {object} options — feature flags and response mode
   * @returns {Function[]} — ordered stage functions
   */
  _buildStages(options = {}) {
    const { responseMode = 'stream', featureOverrides = {} } = options;

    // Apply feature overrides so composer/stage checks reflect them
    for (const [section, enabled] of Object.entries(featureOverrides)) {
      featureFlags.setOverride(section, enabled);
    }

    // stageEmbed works via gemini.js facade → llmProviderRegistry.get() → MockLLMProvider
    // So the real stageEmbed is fine — it will call our mock transparently.

    // stageSearch calls qdrant.search (imported as live ESM binding).
    // We can't patch that import. Create a replacement stage:
    const mockStore = this.mockStore;
    async function mockStageSearch(ctx, _trace) {
      const { getTopK } = await import('../../server/services/queryRouter.js');
      let topK = getTopK(ctx.queryRoute.type);
      if (ctx._complexityTopK) topK = ctx._complexityTopK;

      // Multi-step search (Phase 81)
      if (ctx._queryVectors && ctx._queryVectors.length > 1) {
        // Simulate multi-search: call mock for each vector, merge
        const allHits = [];
        for (const vec of ctx._queryVectors) {
          const hits = await mockStore.search(vec, topK, ctx.topicFilter, null);
          allHits.push(...hits);
        }
        // Deduplicate by content prefix
        const seen = new Set();
        ctx.hits = allHits.filter(h => {
          const key = (h.payload?.content || '').slice(0, 100);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        }).slice(0, topK);
      } else {
        ctx.hits = await mockStore.search(ctx.queryVector, topK, ctx.topicFilter, null);
      }

      if (!ctx.hits.length) {
        ctx.avgScore = 0;
      } else {
        ctx.avgScore = ctx.hits.reduce((s, h) => s + h.score, 0) / ctx.hits.length;
      }
      ctx._searchTopK = topK;
      return ctx;
    }
    // Name the function for trace recording
    Object.defineProperty(mockStageSearch, 'name', { value: 'stageSearch' });

    // Build stage array
    const stages = [];

    // 1. Core: Transcript Init
    stages.push(stageTranscriptInit);

    // 2. Conditional: Budget Check
    if (costGovernor.enforcementEnabled) {
      stages.push(stageBudgetCheck);
    }

    // 3. Core: Route Query
    stages.push(stageRouteQuery);

    // 4. Conditional: Complexity Analysis
    if (featureFlags.isEnabled('QUERY_COMPLEXITY')) {
      stages.push(stageComplexityAnalysis);
    }

    // 5. Conditional: Query Planning
    if (featureFlags.isEnabled('QUERY_PLANNING')) {
      // QueryPlan uses imported search — create mock-aware replacement
      const mockStageQueryPlan = async (ctx, _trace) => {
        // Import queryPlanner dynamically
        const { queryPlanner } = await import('../../server/services/queryPlanner.js');

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
      };
      Object.defineProperty(mockStageQueryPlan, 'name', { value: 'stageQueryPlan' });
      stages.push(mockStageQueryPlan);
    }

    // 6. Conditional: Rewrite (uses LLM provider via registry — mock works)
    // Always include (config.FOLLOWUP.enabled defaults to true)
    stages.push(stageRewriteQuery);

    // 7. Core: Embed (uses gemini.js facade → mock LLM provider via registry)
    stages.push(realStageEmbed);

    // 8. Core: Search (mock replacement)
    stages.push(mockStageSearch);

    // 9. Conditional: Re-rank
    if (featureFlags.isEnabled('RETRIEVAL')) {
      stages.push(stageRerank);
    }

    // 10. Core: Confidence Check
    stages.push(stageConfidenceCheck);

    // 11. Core: Build Context
    stages.push(stageBuildContext);

    // 12. Core: Stream (uses gemini.js facade → mock LLM provider)
    stages.push(stageStream);

    // 13. Conditional: Grounding Check
    if (featureFlags.isEnabled('GROUNDING')) {
      stages.push(stageGroundingCheck);
    }

    // 14. Conditional: Answer Refinement
    if (featureFlags.isEnabled('ANSWER_REFINEMENT') && responseMode === 'structured') {
      stages.push(stageAnswerRefinement);
    }

    // 15. Conditional: Citation Mapping
    if (featureFlags.isEnabled('CITATION')) {
      stages.push(stageCitationMapping);
    }

    return stages;
  }

  /**
   * Executes the full pipeline with mocked dependencies.
   *
   * @param {string} message — user question
   * @param {object} [options]
   * @param {Array}  [options.history=[]]
   * @param {string} [options.sessionId]
   * @param {string|null} [options.topicFilter=null]
   * @param {string} [options.responseMode='stream']
   * @param {string|null} [options.libraryId=null]
   * @param {object} [options.featureOverrides={}] — { SECTION: boolean }
   * @returns {Promise<{ ctx: PipelineContext, trace: EventTrace, sseChunks: string[], traceJSON: object }>}
   */
  async run(message, options = {}) {
    if (!this._setupDone) {
      throw new Error('PipelineTestHarness: call setup() before run()');
    }

    const {
      history          = [],
      sessionId        = 'test-session-' + Date.now(),
      topicFilter      = null,
      responseMode     = 'stream',
      libraryId        = null,
      featureOverrides = {},
    } = options;

    // Build stage array with feature overrides
    const stages = this._buildStages({ responseMode, featureOverrides });

    const mockRes = this.createMockRes();
    const mockReq = this.createMockReq();
    const requestId = 'test-req-' + Date.now();

    const ctx = new PipelineContext({
      message,
      topicFilter,
      history,
      sessionId,
      req:          mockReq,
      res:          mockRes,
      responseMode,
      libraryId,
      requestId,
    });

    const trace = new EventTrace({
      requestId,
      enableTracing: true,
    });

    // No hooks — we want clean pipeline execution for testing
    const runner = new PipelineRunner(stages, null, {});

    await runner.run(ctx, trace);

    return {
      ctx,
      trace,
      sseChunks: mockRes._chunks,
      traceJSON: trace.toJSON(),
    };
  }

  /**
   * Restores all originals and resets state.
   */
  async teardown() {
    // 1. Restore LLM provider registry — re-register real GeminiProvider
    llmProviderRegistry.reset();
    llmProviderRegistry.register('gemini', () => new GeminiProvider());

    // 2. Clear all feature flag overrides
    for (const section of ALL_FEATURE_SECTIONS) {
      featureFlags.clearOverride(section);
    }

    // 3. Reset singletons used in tests
    this.mockLLM.reset();
    this.mockStore.reset();
    conversationContext.reset();
    pipelineComposer.reset();
    costGovernor.reset();

    this._setupDone = false;
  }
}

export { PipelineTestHarness, MockLLMProvider, MockVectorStore, buildHit };
