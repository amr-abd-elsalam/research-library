// server/services/pipelineComposer.js
// ═══════════════════════════════════════════════════════════════
// PipelineComposer — Phase 82 (Singleton #40)
// Builds a request-specific stage array dynamically based on
// feature flags + request properties instead of running all 15
// stages and skipping inside each one.
// Core stages (7) always included. Conditional stages (up to 8)
// included only when their feature flags are enabled.
// Returns null on error — caller uses static chatPipeline fallback.
// Zero config — reads existing feature flags and config sections.
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';
import { featureFlags } from './featureFlags.js';
import { costGovernor } from './costGovernor.js';
import {
  stageTranscriptInit,
  stageBudgetCheck,
  stageRouteQuery,
  stageComplexityAnalysis,
  stageQueryPlan,
  stageRewriteQuery,
  stageEmbed,
  stageSearch,
  stageRerank,
  stageConfidenceCheck,
  stageBuildContext,
  stageStream,
  stageGroundingCheck,
  stageAnswerRefinement,
  stageCitationMapping,
} from './pipeline.js';

class PipelineComposer {
  #stats;

  constructor() {
    this.#stats = { composed: 0, fallbacks: 0 };
  }

  /**
   * Composes a request-specific stage array.
   * Returns null if composition fails (caller uses static fallback).
   *
   * @param {{ isFollowUp?: boolean, responseMode?: string, libraryId?: string|null }} options
   * @returns {Function[]|null} — ordered stage functions, or null for fallback
   */
  compose(options = {}) {
    try {
      const { responseMode = 'stream' } = options;
      const stages = [];

      // ── 1. Core: Transcript Init (always) ──────────────────
      stages.push(stageTranscriptInit);

      // ── 2. Conditional: Budget Check ───────────────────────
      if (costGovernor.enforcementEnabled) {
        stages.push(stageBudgetCheck);
      }

      // ── 3. Core: Route Query (always) ──────────────────────
      stages.push(stageRouteQuery);

      // ── 4. Conditional: Complexity Analysis ────────────────
      if (featureFlags.isEnabled('QUERY_COMPLEXITY')) {
        stages.push(stageComplexityAnalysis);
      }

      // ── 5. Conditional: Query Planning ─────────────────────
      if (featureFlags.isEnabled('QUERY_PLANNING')) {
        stages.push(stageQueryPlan);
      }

      // ── 6. Conditional: Rewrite Query ──────────────────────
      if (config.FOLLOWUP?.enabled) {
        stages.push(stageRewriteQuery);
      }

      // ── 7. Core: Embed (always) ────────────────────────────
      stages.push(stageEmbed);

      // ── 8. Core: Search (always) ───────────────────────────
      stages.push(stageSearch);

      // ── 9. Conditional: Re-rank ────────────────────────────
      if (featureFlags.isEnabled('RETRIEVAL')) {
        stages.push(stageRerank);
      }

      // ── 10. Core: Confidence Check (always) ────────────────
      stages.push(stageConfidenceCheck);

      // ── 11. Core: Build Context (always) ───────────────────
      stages.push(stageBuildContext);

      // ── 12. Core: Stream (always) ──────────────────────────
      stages.push(stageStream);

      // ── 13. Conditional: Grounding Check ───────────────────
      if (featureFlags.isEnabled('GROUNDING')) {
        stages.push(stageGroundingCheck);
      }

      // ── 14. Conditional: Answer Refinement ─────────────────
      if (featureFlags.isEnabled('ANSWER_REFINEMENT') && responseMode === 'structured') {
        stages.push(stageAnswerRefinement);
      }

      // ── 15. Conditional: Citation Mapping ──────────────────
      if (featureFlags.isEnabled('CITATION')) {
        stages.push(stageCitationMapping);
      }

      this.#stats.composed++;
      return stages;
    } catch (_err) {
      this.#stats.fallbacks++;
      return null; // caller uses static fallback
    }
  }

  /**
   * Summary for inspect endpoint.
   * @returns {{ totalComposed: number, totalFallbacks: number }}
   */
  counts() {
    return {
      totalComposed:  this.#stats.composed,
      totalFallbacks: this.#stats.fallbacks,
    };
  }

  /**
   * Resets stats. For test isolation.
   */
  reset() {
    this.#stats = { composed: 0, fallbacks: 0 };
  }
}

// ── Singleton instance ─────────────────────────────────────────
const pipelineComposer = new PipelineComposer();

export { PipelineComposer, pipelineComposer };
