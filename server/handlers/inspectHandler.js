// server/handlers/inspectHandler.js
// ═══════════════════════════════════════════════════════════════
// GET /api/admin/inspect — Phase 17
// System introspection: returns a complete snapshot of all
// registered commands, hooks, listeners, plugins, metrics,
// logger, and operational log state.
// Protected by admin auth. Read-only — no mutations.
// ═══════════════════════════════════════════════════════════════

import { commandRegistry }  from '../services/commandRegistry.js';
import { pipelineHooks }    from '../services/hookRegistry.js';
import { eventBus }         from '../services/eventBus.js';
import { pluginRegistry }   from '../services/pluginRegistry.js';
import { metrics }          from '../services/metrics.js';
import { logger }           from '../services/logger.js';
import { operationalLog }   from '../services/operationalLog.js';
import { bootstrap }        from '../bootstrap.js';
import { allCircuitStats }  from '../services/circuitBreaker.js';
import { sessionBudget }    from '../services/sessionBudget.js';
import { queryIntentClassifier } from '../services/queryIntentClassifier.js';
import { pipelineAnalytics }     from '../services/pipelineAnalytics.js';
import { metricsPersister }      from '../services/metricsPersister.js';
import { executionRouter }       from '../services/executionRouter.js';
import { conversationContext }   from '../services/conversationContext.js';
import { suggestionsEngine }     from '../services/suggestionsEngine.js';
import { contextPersister }      from '../services/contextPersister.js';
import { feedbackCollector }     from '../services/feedbackCollector.js';
import { correlationIndex }      from '../services/correlationIndex.js';
import { getTrailCounts, getTrail } from '../services/listeners/auditTrailListener.js';
import { auditPersister }        from '../services/auditPersister.js';
import { libraryIndex }          from '../services/libraryIndex.js';
import { contentGapDetector }    from '../services/contentGapDetector.js';
import { gapPersister }          from '../services/gapPersister.js';
import { sessionQualityScorer }  from '../services/sessionQualityScorer.js';
import { libraryHealthScorer }   from '../services/libraryHealthScorer.js';
import { featureFlags }          from '../services/featureFlags.js';
import { adminIntelligence }     from '../services/adminIntelligence.js';
import { dynamicWelcomeSuggestions } from '../services/dynamicWelcomeSuggestions.js';
import { searchReranker }            from '../services/searchReranker.js';
import { queryComplexityAnalyzer }   from '../services/queryComplexityAnalyzer.js';
import { answerGroundingChecker }    from '../services/answerGroundingChecker.js';
import { groundingAnalytics }        from '../services/groundingAnalytics.js';
import { citationMapper }            from '../services/citationMapper.js';
import { llmProviderRegistry }       from '../services/llmProvider.js';
import { costGovernor }              from '../services/costGovernor.js';
import { configValidator }  from '../services/configValidator.js';
import { actionRegistry }   from '../services/actionRegistry.js';
import { queryPlanner }      from '../services/queryPlanner.js';
import { pipelineComposer }          from '../services/pipelineComposer.js';
import { sessionReplaySerializer }   from '../services/sessionReplaySerializer.js';
import { ragStrategySelector }       from '../services/ragStrategySelector.js';
import config                        from '../../config.js';

export async function handleInspect(_req, res) {
  try {
    const payload = {
      timestamp: new Date().toISOString(),

      // ── Config overview ────────────────────────────────────
      config: {
        sections:        Object.keys(config).length,
        sectionNames:    Object.keys(config),
        pipelineHooks:   config.PIPELINE?.enableHooks !== false,
        metricsEnabled:  config.PIPELINE?.metricsEnabled !== false,
        pluginsEnabled:  config.PLUGINS?.enabled === true,
        sessionsEnabled: config.SESSIONS?.enabled === true,
        logLevel:        config.LOGGING?.level ?? 'info',
      },

      // ── Registered commands ────────────────────────────────
      commands: {
        total: commandRegistry.size,
        list:  commandRegistry.list(),
        graph: commandRegistry.graph(),
      },

      // ── Pipeline hooks breakdown ───────────────────────────
      hooks: pipelineHooks.inspect(),

      // ── EventBus listener wiring ───────────────────────────
      eventBus: {
        totalListeners: eventBus.size,
        byEvent:        eventBus.listenerCounts(),
      },

      // ── Plugin registry ────────────────────────────────────
      plugins: {
        enabled:     config.PLUGINS?.enabled === true,
        total:       pluginRegistry.size,
        initialized: pluginRegistry.initialized,
        list:        pluginRegistry.list(),
      },

      // ── Metrics collector ──────────────────────────────────
      metrics: metrics.counts(),

      // ── Logger status ──────────────────────────────────────
      logger: {
        level:         config.LOGGING?.level ?? 'info',
        listenerCount: logger.listenerCount,
      },

      // ── Operational log status ─────────────────────────────
      operationalLog: {
        size:             operationalLog.size,
        maxEntries:       config.LOGGING?.maxEntries ?? 500,
        filterableFields: ['requestId', 'level', 'module', 'from', 'to'],
      },

      // ── Bootstrap readiness ────────────────────────────────
      bootstrap: bootstrap.getReadinessPayload(),

      // ── Circuit breakers (Phase 18) ────────────────────────
      circuits: allCircuitStats(),

      // ── Session budget (Phase 19) ──────────────────────────
      sessionBudget: sessionBudget.counts(),

      // ── Intent classifier (Phase 21) ───────────────────────
      intentClassifier: queryIntentClassifier.counts(),

      // ── Pipeline analytics (Phase 22) ──────────────────────
      pipelineAnalytics: pipelineAnalytics.counts(),

      // ── Metrics persistence (Phase 23) ─────────────────────
      metricsPersister: metricsPersister.counts(),

      // ── Execution router (Phase 24) ────────────────────────
      executionRouter: executionRouter.counts(),

      // ── Conversation context (Phase 28) ────────────────────
      conversationContext: conversationContext.counts(),

      // ── Context persistence (Phase 31) ─────────────────────
      contextPersister: contextPersister.counts(),

      // ── Suggestions engine (Phase 29) ──────────────────────
      suggestionsEngine: suggestionsEngine.counts(),

      // ── Suggestion click analytics (Phase 57) ──────────────
      suggestionAnalytics: suggestionsEngine.getClickCounts(),

      // ── Feedback collector (Phase 33) ──────────────────────
      feedbackCollector: feedbackCollector.counts(),

      // ── Correlation index (Phase 34) ───────────────────────
      correlationIndex: correlationIndex.counts(),

      // ── Audit trail (Phase 34) ─────────────────────────────
      auditTrail: getTrailCounts(),

      // ── Audit persistence (Phase 35) ───────────────────────
      auditPersister: auditPersister.counts(),

      // ── Library index (Phase 36) ───────────────────────────
      libraryIndex: libraryIndex.counts(),

      // ── System prompt enrichment (Phase 37) ────────────────
      systemPromptEnrichment: {
        enabled: config.SYSTEM_PROMPT_ENRICHMENT?.enabled === true,
        libraryIndexAvailable: libraryIndex.getIndex() !== null,
      },

      // ── Content gap detector (Phase 38) ────────────────────
      contentGapDetector: contentGapDetector.counts(),

      // ── Gap persistence (Phase 39) ─────────────────────────
      gapPersister: gapPersister.counts(),

      // ── Session quality scorer (Phase 40) ──────────────────
      sessionQualityScorer: sessionQualityScorer.counts(),

      // ── Library health scorer (Phase 42) ───────────────────
      libraryHealthScorer: libraryHealthScorer.counts(),

      // ── Admin actions (Phase 43) ───────────────────────────
      adminActions: {
        enabled:             config.ADMIN_ACTIONS?.enabled !== false,
        auditEnabled:        config.ADMIN_ACTIONS?.auditEnabled !== false,
        cooldownMs:          config.ADMIN_ACTIONS?.cooldownMs ?? 5000,
        systemAuditEntries:  (getTrail('__system__') || []).length,
      },

      // ── Feature flags (Phase 44) ──────────────────────────
      featureFlags: {
        ...featureFlags.counts(),
        status: featureFlags.getStatus(),
      },

      // ── Admin intelligence (Phase 53) ─────────────────────
      adminIntelligence: adminIntelligence.counts(),

      // ── Dynamic welcome suggestions (Phase 59) ────────────
      dynamicWelcomeSuggestions: dynamicWelcomeSuggestions.counts(),

      // ── Search re-ranker (Phase 63) ───────────────────────
      searchReranker: searchReranker.counts(),

      // ── Query complexity analyzer (Phase 64) ──────────────
      queryComplexityAnalyzer: queryComplexityAnalyzer.counts(),

      // ── Answer grounding checker (Phase 69) ───────────────
      answerGroundingChecker: answerGroundingChecker.counts(),

      // ── Grounding analytics (Phase 70) ────────────────────
      groundingAnalytics: groundingAnalytics.counts(),

      // ── Citation mapper (Phase 71) ────────────────────────────
      citationMapper: citationMapper.counts(),

      // ── Shared utility modules (Phase 72) ─────────────────────
      sharedUtilities: ['atomicWrite', 'arabicNlp'],

      // ── LLM Provider (Phase 74) ──────────────────────────────
      llmProvider: llmProviderRegistry.counts(),

      // ── Cost Governor (Phase 76) ─────────────────────────────
      costGovernor: costGovernor.counts(),

      // ── Answer Refinement (Phase 78) ─────────────────────────
      answerRefinement: {
        enabled: featureFlags.isEnabled('ANSWER_REFINEMENT'),
        maxRefinements: config.ANSWER_REFINEMENT?.maxRefinements ?? 1,
        minScoreToRetry: config.ANSWER_REFINEMENT?.minScoreToRetry ?? 0.3,
        requiresGrounding: true,
      },

      // ── Config Validator (Phase 79) ──────────────────────────
      configValidator: configValidator.counts(),

      // ── Action Registry (Phase 80) ───────────────────────────
      actionRegistry: actionRegistry.counts(),

      // ── Query Planner (Phase 81) ─────────────────────────────
      queryPlanner: queryPlanner.counts(),

      // ── Pipeline Composer (Phase 82) ─────────────────────────
      pipelineComposer: pipelineComposer.counts(),

      // ── Session Replay Serializer (Phase 84) ─────────────────
      sessionReplaySerializer: sessionReplaySerializer.counts(),

      // ── RAG Strategy Selector (Phase 85) ─────────────────────
      ragStrategySelector: ragStrategySelector.counts(),

      // ── Observability (Phase 65) ──────────────────────────────
      observability: {
        requestIdEnabled: config.OBSERVABILITY?.requestIdEnabled !== false,
        periodicHealthCheck: config.OBSERVABILITY?.periodicHealthCheck?.enabled === true,
      },

      // ── Permission Tiers (Phase 26) ────────────────────────
      tiers: {
        enabled:      config.TIERS?.enabled === true,
        definedTiers: config.TIERS?.enabled ? Object.keys(config.TIERS?.definitions || {}) : [],
        defaultTier:  config.TIERS?.defaultTier || null,
        guestTier:    config.TIERS?.guestTier || null,
      },
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload));

  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'حدث خطأ في فحص النظام',
      code:  'INSPECT_ERROR',
    }));
  }
}
