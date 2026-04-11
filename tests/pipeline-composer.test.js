// tests/pipeline-composer.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 82 — PipelineComposer Tests
// Tests dynamic pipeline composition, stage inclusion/exclusion
// based on feature flags, stage ordering, and turn tracking.
// No network calls — tests pure composition logic.
// ═══════════════════════════════════════════════════════════════

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { PipelineComposer, pipelineComposer } from '../server/services/pipelineComposer.js';
import { featureFlags } from '../server/services/featureFlags.js';
import { conversationContext } from '../server/services/conversationContext.js';
import {
  stageTranscriptInit,
  stageRouteQuery,
  stageEmbed,
  stageSearch,
  stageConfidenceCheck,
  stageBuildContext,
  stageStream,
  stageBudgetCheck,
  stageComplexityAnalysis,
  stageStrategySelect,
  stageQueryPlan,
  stageRewriteQuery,
  stageRerank,
  stageGroundingCheck,
  stageAnswerRefinement,
  stageCitationMapping,
} from '../server/services/pipeline.js';

// ── Cleanup ───────────────────────────────────────────────────
afterEach(() => {
  featureFlags.clearOverride('QUERY_COMPLEXITY');
  featureFlags.clearOverride('QUERY_PLANNING');
  featureFlags.clearOverride('RETRIEVAL');
  featureFlags.clearOverride('GROUNDING');
  featureFlags.clearOverride('ANSWER_REFINEMENT');
  featureFlags.clearOverride('CITATION');
  featureFlags.clearOverride('COST_GOVERNANCE');
  featureFlags.clearOverride('RAG_STRATEGIES');
  pipelineComposer.reset();
  conversationContext.reset();
});

// ═══════════════════════════════════════════════════════════════
// Block 1: PipelineComposer Structure
// ═══════════════════════════════════════════════════════════════
describe('PipelineComposer Structure', () => {

  // T-PCO01: PipelineComposer is a class
  it('T-PCO01: PipelineComposer is a class', () => {
    assert.strictEqual(typeof PipelineComposer, 'function', 'PipelineComposer should be a constructor');
    const instance = new PipelineComposer();
    assert.ok(instance instanceof PipelineComposer, 'should create instance');
  });

  // T-PCO02: pipelineComposer is a singleton instance
  it('T-PCO02: pipelineComposer is a singleton instance of PipelineComposer', () => {
    assert.ok(pipelineComposer instanceof PipelineComposer, 'should be PipelineComposer instance');
  });

  // T-PCO03: counts() returns correct shape
  it('T-PCO03: counts() returns { totalComposed, totalFallbacks } shape', () => {
    const c = pipelineComposer.counts();
    assert.strictEqual(typeof c.totalComposed, 'number', 'totalComposed should be number');
    assert.strictEqual(typeof c.totalFallbacks, 'number', 'totalFallbacks should be number');
  });

  // T-PCO04: reset() clears stats
  it('T-PCO04: reset() clears stats — counts shows 0', () => {
    pipelineComposer.compose({});
    pipelineComposer.compose({});
    const before = pipelineComposer.counts();
    assert.ok(before.totalComposed >= 2, 'should have composed at least 2');
    pipelineComposer.reset();
    const after = pipelineComposer.counts();
    assert.strictEqual(after.totalComposed, 0);
    assert.strictEqual(after.totalFallbacks, 0);
  });

  // T-PCO05: compose() returns array or null
  it('T-PCO05: compose() returns array', () => {
    const result = pipelineComposer.compose({});
    assert.ok(Array.isArray(result), 'should return an array');
  });
});

// ═══════════════════════════════════════════════════════════════
// Block 2: Core Stages Always Included
// ═══════════════════════════════════════════════════════════════
describe('PipelineComposer Core Stages', () => {

  // T-PCO06: compose() always includes stageTranscriptInit
  it('T-PCO06: compose() always includes stageTranscriptInit', () => {
    const stages = pipelineComposer.compose({});
    assert.ok(stages.includes(stageTranscriptInit), 'should include stageTranscriptInit');
  });

  // T-PCO07: compose() always includes stageRouteQuery
  it('T-PCO07: compose() always includes stageRouteQuery', () => {
    const stages = pipelineComposer.compose({});
    assert.ok(stages.includes(stageRouteQuery), 'should include stageRouteQuery');
  });

  // T-PCO08: compose() always includes stageEmbed, stageSearch, stageConfidenceCheck, stageBuildContext, stageStream
  it('T-PCO08: compose() always includes 5 core stages', () => {
    const stages = pipelineComposer.compose({});
    assert.ok(stages.includes(stageEmbed), 'should include stageEmbed');
    assert.ok(stages.includes(stageSearch), 'should include stageSearch');
    assert.ok(stages.includes(stageConfidenceCheck), 'should include stageConfidenceCheck');
    assert.ok(stages.includes(stageBuildContext), 'should include stageBuildContext');
    assert.ok(stages.includes(stageStream), 'should include stageStream');
  });

  // T-PCO09: compose() minimum stage count with default config features (Phase 99: QUERY_COMPLEXITY + RETRIEVAL + GROUNDING + CITATION + QUERY_PLANNING enabled)
  it('T-PCO09: compose() minimum stage count with default config features', () => {
    // Default config (Phase 99): 7 core + stageRewriteQuery + stageComplexityAnalysis + stageQueryPlan + stageRerank + stageGroundingCheck + stageCitationMapping = 13
    const stages = pipelineComposer.compose({});
    assert.ok(stages.length >= 7, `expected >= 7, got ${stages.length}`);
  });
});

// ═══════════════════════════════════════════════════════════════
// Block 3: Conditional Stage Inclusion
// ═══════════════════════════════════════════════════════════════
describe('PipelineComposer Conditional Stages', () => {

  // T-PCO10: stageBudgetCheck NOT included when costGovernor.enforcementEnabled is false
  it('T-PCO10: stageBudgetCheck NOT included when enforcement disabled', () => {
    // Default: COST_GOVERNANCE.enforceBudget = false → enforcementEnabled = false
    const stages = pipelineComposer.compose({});
    assert.ok(!stages.includes(stageBudgetCheck), 'should NOT include stageBudgetCheck');
  });

  // T-PCO11: stageComplexityAnalysis included when QUERY_COMPLEXITY enabled
  it('T-PCO11: stageComplexityAnalysis included when QUERY_COMPLEXITY enabled', () => {
    featureFlags.setOverride('QUERY_COMPLEXITY', true);
    const stages = pipelineComposer.compose({});
    assert.ok(stages.includes(stageComplexityAnalysis), 'should include stageComplexityAnalysis');
  });

  // T-PCO12: stageComplexityAnalysis NOT included when QUERY_COMPLEXITY disabled
  it('T-PCO12: stageComplexityAnalysis NOT included when QUERY_COMPLEXITY disabled', () => {
    featureFlags.setOverride('QUERY_COMPLEXITY', false);  // Phase 98: config default is now true — explicitly disable
    const stages = pipelineComposer.compose({});
    assert.ok(!stages.includes(stageComplexityAnalysis), 'should NOT include stageComplexityAnalysis');
  });

  // T-PCO13: stageQueryPlan included when QUERY_PLANNING enabled
  it('T-PCO13: stageQueryPlan included when QUERY_PLANNING enabled', () => {
    featureFlags.setOverride('QUERY_PLANNING', true);
    const stages = pipelineComposer.compose({});
    assert.ok(stages.includes(stageQueryPlan), 'should include stageQueryPlan');
  });

  // T-PCO14: stageRerank included when RETRIEVAL enabled
  it('T-PCO14: stageRerank included when RETRIEVAL enabled', () => {
    featureFlags.setOverride('RETRIEVAL', true);
    const stages = pipelineComposer.compose({});
    assert.ok(stages.includes(stageRerank), 'should include stageRerank');
  });

  // T-PCO15: stageGroundingCheck included when GROUNDING enabled
  it('T-PCO15: stageGroundingCheck included when GROUNDING enabled', () => {
    featureFlags.setOverride('GROUNDING', true);
    const stages = pipelineComposer.compose({});
    assert.ok(stages.includes(stageGroundingCheck), 'should include stageGroundingCheck');
  });

  // T-PCO16: stageAnswerRefinement included when ANSWER_REFINEMENT enabled AND responseMode='structured'
  it('T-PCO16: stageAnswerRefinement included when enabled + structured mode', () => {
    featureFlags.setOverride('ANSWER_REFINEMENT', true);
    const stages = pipelineComposer.compose({ responseMode: 'structured' });
    assert.ok(stages.includes(stageAnswerRefinement), 'should include stageAnswerRefinement');
  });

  // T-PCO17: stageAnswerRefinement NOT included when responseMode='stream' even if enabled
  it('T-PCO17: stageAnswerRefinement NOT included when stream mode', () => {
    featureFlags.setOverride('ANSWER_REFINEMENT', true);
    const stages = pipelineComposer.compose({ responseMode: 'stream' });
    assert.ok(!stages.includes(stageAnswerRefinement), 'should NOT include stageAnswerRefinement in stream mode');
  });

  // T-PCO18: stageCitationMapping included when CITATION enabled
  it('T-PCO18: stageCitationMapping included when CITATION enabled', () => {
    featureFlags.setOverride('CITATION', true);
    const stages = pipelineComposer.compose({});
    assert.ok(stages.includes(stageCitationMapping), 'should include stageCitationMapping');
  });

  // T-PCO19: stageRewriteQuery included when config.FOLLOWUP.enabled is true
  it('T-PCO19: stageRewriteQuery included when FOLLOWUP enabled', () => {
    // Default config: FOLLOWUP.enabled = true
    const stages = pipelineComposer.compose({});
    assert.ok(stages.includes(stageRewriteQuery), 'should include stageRewriteQuery');
  });
});

// ═══════════════════════════════════════════════════════════════
// Block 4: Stage Ordering
// ═══════════════════════════════════════════════════════════════
describe('PipelineComposer Stage Ordering', () => {

  // T-PCO20: composed stages maintain correct order
  it('T-PCO20: composed stages maintain correct order', () => {
    // Enable all conditional stages
    featureFlags.setOverride('QUERY_COMPLEXITY', true);
    featureFlags.setOverride('QUERY_PLANNING', true);
    featureFlags.setOverride('RETRIEVAL', true);
    featureFlags.setOverride('GROUNDING', true);
    featureFlags.setOverride('ANSWER_REFINEMENT', true);
    featureFlags.setOverride('CITATION', true);

    const stages = pipelineComposer.compose({ responseMode: 'structured' });

    // Verify order: transcriptInit < routeQuery < complexity < queryPlan < rewrite < embed < search < rerank < confidence < buildContext < stream < grounding < refinement < citation
    const idxTranscript  = stages.indexOf(stageTranscriptInit);
    const idxRoute       = stages.indexOf(stageRouteQuery);
    const idxComplexity  = stages.indexOf(stageComplexityAnalysis);
    const idxPlan        = stages.indexOf(stageQueryPlan);
    const idxRewrite     = stages.indexOf(stageRewriteQuery);
    const idxEmbed       = stages.indexOf(stageEmbed);
    const idxSearch      = stages.indexOf(stageSearch);
    const idxRerank      = stages.indexOf(stageRerank);
    const idxConfidence  = stages.indexOf(stageConfidenceCheck);
    const idxBuild       = stages.indexOf(stageBuildContext);
    const idxStreamStage = stages.indexOf(stageStream);
    const idxGrounding   = stages.indexOf(stageGroundingCheck);
    const idxRefinement  = stages.indexOf(stageAnswerRefinement);
    const idxCitation    = stages.indexOf(stageCitationMapping);

    assert.ok(idxTranscript < idxRoute, 'transcriptInit before routeQuery');
    assert.ok(idxRoute < idxComplexity, 'routeQuery before complexity');
    assert.ok(idxComplexity < idxPlan, 'complexity before plan');
    assert.ok(idxPlan < idxRewrite, 'plan before rewrite');
    assert.ok(idxRewrite < idxEmbed, 'rewrite before embed');
    assert.ok(idxEmbed < idxSearch, 'embed before search');
    assert.ok(idxSearch < idxRerank, 'search before rerank');
    assert.ok(idxRerank < idxConfidence, 'rerank before confidence');
    assert.ok(idxConfidence < idxBuild, 'confidence before build');
    assert.ok(idxBuild < idxStreamStage, 'build before stream');
    assert.ok(idxStreamStage < idxGrounding, 'stream before grounding');
    assert.ok(idxGrounding < idxRefinement, 'grounding before refinement');
    assert.ok(idxRefinement < idxCitation, 'refinement before citation');
  });

  // T-PCO21: no duplicate stages in composed array
  it('T-PCO21: no duplicate stages in composed array', () => {
    featureFlags.setOverride('QUERY_COMPLEXITY', true);
    featureFlags.setOverride('RETRIEVAL', true);
    featureFlags.setOverride('GROUNDING', true);
    featureFlags.setOverride('CITATION', true);

    const stages = pipelineComposer.compose({});
    const unique = new Set(stages);
    assert.strictEqual(unique.size, stages.length, 'should have no duplicates');
  });

  // T-PCO22: stage count matches expected when all features enabled vs minimal disabled
  it('T-PCO22: stage count — minimal vs all enabled', () => {
    // Minimal: disable all optional features explicitly (Phase 99: some are on by default)
    featureFlags.setOverride('QUERY_COMPLEXITY', false);
    featureFlags.setOverride('QUERY_PLANNING', false);
    featureFlags.setOverride('RETRIEVAL', false);
    featureFlags.setOverride('GROUNDING', false);
    featureFlags.setOverride('ANSWER_REFINEMENT', false);
    featureFlags.setOverride('CITATION', false);
    featureFlags.setOverride('RAG_STRATEGIES', false);

    const minStages = pipelineComposer.compose({});
    const minCount = minStages.length;

    // All enabled + structured mode — should be up to 16 (minus budgetCheck if enforcement off)
    featureFlags.setOverride('QUERY_COMPLEXITY', true);
    featureFlags.setOverride('QUERY_PLANNING', true);
    featureFlags.setOverride('RETRIEVAL', true);
    featureFlags.setOverride('GROUNDING', true);
    featureFlags.setOverride('ANSWER_REFINEMENT', true);
    featureFlags.setOverride('CITATION', true);
    featureFlags.setOverride('RAG_STRATEGIES', true);

    pipelineComposer.reset();
    const maxStages = pipelineComposer.compose({ responseMode: 'structured' });
    const maxCount = maxStages.length;

    assert.ok(maxCount > minCount, `max (${maxCount}) should be > min (${minCount})`);
    // maxCount = 7 core + rewrite + complexity + strategy + plan + rerank + grounding + refinement + citation = 15
    // (budgetCheck not included because enforcementEnabled=false)
    assert.strictEqual(maxCount, 15, `expected 15 with all features on (no budget enforcement), got ${maxCount}`);
  });
});

// ═══════════════════════════════════════════════════════════════
// Block 5: Turn Tracking
// ═══════════════════════════════════════════════════════════════
describe('Turn Tracking', () => {

  // T-PCO23: conversationContext.incrementTurn returns 1 for new session
  it('T-PCO23: incrementTurn returns 1 for new session', () => {
    const result = conversationContext.incrementTurn('test-session-1');
    assert.strictEqual(result, 1, 'first incrementTurn should return 1');
  });

  // T-PCO24: incrementTurn increments correctly (1, 2, 3)
  it('T-PCO24: incrementTurn increments correctly', () => {
    assert.strictEqual(conversationContext.incrementTurn('test-session-2'), 1);
    assert.strictEqual(conversationContext.incrementTurn('test-session-2'), 2);
    assert.strictEqual(conversationContext.incrementTurn('test-session-2'), 3);
  });

  // T-PCO25: getTurnCount returns 0 for unknown session
  it('T-PCO25: getTurnCount returns 0 for unknown session', () => {
    assert.strictEqual(conversationContext.getTurnCount('nonexistent-session'), 0);
  });

  // T-PCO26: getTurnCount returns correct value after incrementTurn
  it('T-PCO26: getTurnCount returns correct value after incrementTurn', () => {
    conversationContext.incrementTurn('test-session-3');
    conversationContext.incrementTurn('test-session-3');
    assert.strictEqual(conversationContext.getTurnCount('test-session-3'), 2);
  });

  // T-PCO27: incrementTurn with null sessionId returns 0
  it('T-PCO27: incrementTurn with null sessionId returns 0', () => {
    assert.strictEqual(conversationContext.incrementTurn(null), 0);
    assert.strictEqual(conversationContext.incrementTurn(undefined), 0);
    assert.strictEqual(conversationContext.incrementTurn(''), 0);
  });

  // T-PCO28: getTurnCount with null sessionId returns 0
  it('T-PCO28: getTurnCount with null sessionId returns 0', () => {
    assert.strictEqual(conversationContext.getTurnCount(null), 0);
    assert.strictEqual(conversationContext.getTurnCount(undefined), 0);
  });
});

// ═══════════════════════════════════════════════════════════════
// Block 6: Composition Stats
// ═══════════════════════════════════════════════════════════════
describe('PipelineComposer Stats', () => {

  // T-PCO29: compose() increments totalComposed
  it('T-PCO29: compose() increments totalComposed', () => {
    pipelineComposer.compose({});
    pipelineComposer.compose({});
    pipelineComposer.compose({});
    const c = pipelineComposer.counts();
    assert.strictEqual(c.totalComposed, 3);
    assert.strictEqual(c.totalFallbacks, 0);
  });
});

// ═══════════════════════════════════════════════════════════════
// Block 7: RAG Strategy Stage (Phase 85)
// ═══════════════════════════════════════════════════════════════
describe('PipelineComposer RAG Strategy Stage', () => {

  // T-PCO30: stageStrategySelect NOT in composed stages when RAG_STRATEGIES disabled
  it('T-PCO30: stageStrategySelect NOT included when RAG_STRATEGIES disabled', () => {
    const stages = pipelineComposer.compose({});
    assert.ok(!stages.includes(stageStrategySelect), 'should NOT include stageStrategySelect');
  });

  // T-PCO31: stageStrategySelect IN composed stages when RAG_STRATEGIES enabled
  it('T-PCO31: stageStrategySelect included when RAG_STRATEGIES enabled', () => {
    featureFlags.setOverride('RAG_STRATEGIES', true);
    const stages = pipelineComposer.compose({});
    assert.ok(stages.includes(stageStrategySelect), 'should include stageStrategySelect');
  });

  // T-PCO32: stageStrategySelect comes after stageComplexityAnalysis
  it('T-PCO32: stageStrategySelect comes after stageComplexityAnalysis', () => {
    featureFlags.setOverride('RAG_STRATEGIES', true);
    featureFlags.setOverride('QUERY_COMPLEXITY', true);
    const stages = pipelineComposer.compose({});
    const idxComplexity = stages.indexOf(stageComplexityAnalysis);
    const idxStrategy = stages.indexOf(stageStrategySelect);
    assert.ok(idxComplexity >= 0, 'should include stageComplexityAnalysis');
    assert.ok(idxStrategy >= 0, 'should include stageStrategySelect');
    assert.ok(idxComplexity < idxStrategy, 'complexity should come before strategy');
  });

  // T-PCO33: stageStrategySelect comes before stageQueryPlan
  it('T-PCO33: stageStrategySelect comes before stageQueryPlan', () => {
    featureFlags.setOverride('RAG_STRATEGIES', true);
    featureFlags.setOverride('QUERY_PLANNING', true);
    const stages = pipelineComposer.compose({});
    const idxStrategy = stages.indexOf(stageStrategySelect);
    const idxPlan = stages.indexOf(stageQueryPlan);
    assert.ok(idxStrategy >= 0, 'should include stageStrategySelect');
    assert.ok(idxPlan >= 0, 'should include stageQueryPlan');
    assert.ok(idxStrategy < idxPlan, 'strategy should come before plan');
  });

  // T-PCO34: Total composed stages increases by 1 when RAG_STRATEGIES enabled
  it('T-PCO34: stage count increases by 1 when RAG_STRATEGIES enabled', () => {
    const withoutStrategy = pipelineComposer.compose({});
    const countWithout = withoutStrategy.length;

    pipelineComposer.reset();
    featureFlags.setOverride('RAG_STRATEGIES', true);
    const withStrategy = pipelineComposer.compose({});
    const countWith = withStrategy.length;

    assert.strictEqual(countWith, countWithout + 1, `expected ${countWithout + 1} with strategy, got ${countWith}`);
  });

  // T-PCO35: stageAnswerRefinement NOT included for streaming when streamingRevisionEnabled is false (default)
  it('T-PCO35: stageAnswerRefinement excluded for streaming with default config', () => {
    featureFlags.setOverride('ANSWER_REFINEMENT', true);
    const stages = pipelineComposer.compose({ responseMode: 'stream' });
    assert.ok(!stages.includes(stageAnswerRefinement),
      'should NOT include stageAnswerRefinement in stream mode with streamingRevisionEnabled=false');
  });

  // T-PCO36: stageAnswerRefinement still included for structured regardless
  it('T-PCO36: stageAnswerRefinement included for structured regardless of streaming config', () => {
    featureFlags.setOverride('ANSWER_REFINEMENT', true);
    const stages = pipelineComposer.compose({ responseMode: 'structured' });
    assert.ok(stages.includes(stageAnswerRefinement),
      'should include stageAnswerRefinement in structured mode');
  });
});
