// tests/rag-strategy.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 85 — RAGStrategySelector Tests
// Tests adaptive RAG strategy selection: structure, rule priority,
// strategy output, stats tracking, and edge cases.
// No network calls — tests pure selection logic.
// ═══════════════════════════════════════════════════════════════

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { RAGStrategySelector, ragStrategySelector } from '../server/services/ragStrategySelector.js';
import { featureFlags } from '../server/services/featureFlags.js';

// ── Cleanup ───────────────────────────────────────────────────
afterEach(() => {
  featureFlags.clearOverride('RAG_STRATEGIES');
  ragStrategySelector.reset();
});

// ═══════════════════════════════════════════════════════════════
// Block 1: RAGStrategySelector Structure (T-RS01 to T-RS05)
// ═══════════════════════════════════════════════════════════════
describe('RAGStrategySelector Structure', () => {

  // T-RS01: RAGStrategySelector is a class with enabled property
  it('T-RS01: has enabled property (boolean)', () => {
    assert.strictEqual(typeof ragStrategySelector.enabled, 'boolean');
  });

  // T-RS02: select() returns null when disabled
  it('T-RS02: select() returns null when disabled', () => {
    // RAG_STRATEGIES is false by default
    const result = ragStrategySelector.select({
      complexityType: 'factual',
      turnNumber: 0,
      lastAvgScore: 0,
      isFollowUp: false,
      messageWordCount: 5,
    });
    assert.strictEqual(result, null);
  });

  // T-RS03: counts() returns correct shape
  it('T-RS03: counts() returns { enabled, totalSelections, strategyBreakdown }', () => {
    const c = ragStrategySelector.counts();
    assert.strictEqual(typeof c.enabled, 'boolean');
    assert.strictEqual(typeof c.totalSelections, 'number');
    assert.strictEqual(typeof c.strategyBreakdown, 'object');
  });

  // T-RS04: reset() clears stats to zero values
  it('T-RS04: reset() clears stats to zero values', () => {
    featureFlags.setOverride('RAG_STRATEGIES', true);
    ragStrategySelector.select({ complexityType: 'analytical', turnNumber: 0, lastAvgScore: 0, isFollowUp: false, messageWordCount: 15 });
    ragStrategySelector.reset();
    const c = ragStrategySelector.counts();
    assert.strictEqual(c.totalSelections, 0);
    assert.strictEqual(c.strategyBreakdown.deep_analytical, 0);
    assert.strictEqual(c.strategyBreakdown.none, 0);
  });

  // T-RS05: strategyBreakdown has all 4 strategy keys + 'none' key
  it('T-RS05: strategyBreakdown has all 5 keys', () => {
    const c = ragStrategySelector.counts();
    const keys = Object.keys(c.strategyBreakdown);
    assert.ok(keys.includes('quick_factual'), 'should have quick_factual');
    assert.ok(keys.includes('deep_analytical'), 'should have deep_analytical');
    assert.ok(keys.includes('conversational_followup'), 'should have conversational_followup');
    assert.ok(keys.includes('exploratory_scan'), 'should have exploratory_scan');
    assert.ok(keys.includes('none'), 'should have none');
    assert.strictEqual(keys.length, 5, 'should have exactly 5 keys');
  });
});

// ═══════════════════════════════════════════════════════════════
// Block 2: Strategy Selection Rules (T-RS06 to T-RS15)
// ═══════════════════════════════════════════════════════════════
describe('RAGStrategySelector Selection Rules', () => {

  // T-RS06: Short factual question (≤10 words, factual type) → quick_factual
  it('T-RS06: short factual question → quick_factual', () => {
    featureFlags.setOverride('RAG_STRATEGIES', true);
    const result = ragStrategySelector.select({
      complexityType: 'factual',
      turnNumber: 0,
      lastAvgScore: 0,
      isFollowUp: false,
      messageWordCount: 5,
    });
    assert.ok(result !== null);
    assert.strictEqual(result.name, 'quick_factual');
  });

  // T-RS07: Analytical complexity → deep_analytical
  it('T-RS07: analytical complexity → deep_analytical', () => {
    featureFlags.setOverride('RAG_STRATEGIES', true);
    const result = ragStrategySelector.select({
      complexityType: 'analytical',
      turnNumber: 0,
      lastAvgScore: 0,
      isFollowUp: false,
      messageWordCount: 15,
    });
    assert.ok(result !== null);
    assert.strictEqual(result.name, 'deep_analytical');
  });

  // T-RS08: Comparative complexity → deep_analytical
  it('T-RS08: comparative complexity → deep_analytical', () => {
    featureFlags.setOverride('RAG_STRATEGIES', true);
    const result = ragStrategySelector.select({
      complexityType: 'comparative',
      turnNumber: 0,
      lastAvgScore: 0,
      isFollowUp: false,
      messageWordCount: 15,
    });
    assert.ok(result !== null);
    assert.strictEqual(result.name, 'deep_analytical');
  });

  // T-RS09: Multi_part complexity → deep_analytical
  it('T-RS09: multi_part complexity → deep_analytical', () => {
    featureFlags.setOverride('RAG_STRATEGIES', true);
    const result = ragStrategySelector.select({
      complexityType: 'multi_part',
      turnNumber: 0,
      lastAvgScore: 0,
      isFollowUp: false,
      messageWordCount: 15,
    });
    assert.ok(result !== null);
    assert.strictEqual(result.name, 'deep_analytical');
  });

  // T-RS10: Exploratory complexity → exploratory_scan
  it('T-RS10: exploratory complexity → exploratory_scan', () => {
    featureFlags.setOverride('RAG_STRATEGIES', true);
    const result = ragStrategySelector.select({
      complexityType: 'exploratory',
      turnNumber: 0,
      lastAvgScore: 0,
      isFollowUp: false,
      messageWordCount: 15,
    });
    assert.ok(result !== null);
    assert.strictEqual(result.name, 'exploratory_scan');
  });

  // T-RS11: Follow-up + turnNumber >= 3 → conversational_followup
  it('T-RS11: follow-up + turnNumber >= 3 → conversational_followup', () => {
    featureFlags.setOverride('RAG_STRATEGIES', true);
    const result = ragStrategySelector.select({
      complexityType: 'factual',
      turnNumber: 3,
      lastAvgScore: 0,
      isFollowUp: true,
      messageWordCount: 5,
    });
    assert.ok(result !== null);
    assert.strictEqual(result.name, 'conversational_followup');
  });

  // T-RS12: Follow-up + turnNumber < 3 → NOT conversational (falls through to other rules)
  it('T-RS12: follow-up + turnNumber < 3 → falls through to other rules', () => {
    featureFlags.setOverride('RAG_STRATEGIES', true);
    const result = ragStrategySelector.select({
      complexityType: 'factual',
      turnNumber: 1,
      lastAvgScore: 0,
      isFollowUp: true,
      messageWordCount: 5,
    });
    // Should fall through to Rule 2 (short factual) → quick_factual
    assert.ok(result !== null);
    assert.strictEqual(result.name, 'quick_factual');
  });

  // T-RS13: Low lastAvgScore (< 0.5) + analytical → deep_analytical (quality escalation)
  it('T-RS13: low lastAvgScore + analytical → deep_analytical', () => {
    featureFlags.setOverride('RAG_STRATEGIES', true);
    const result = ragStrategySelector.select({
      complexityType: 'analytical',
      turnNumber: 0,
      lastAvgScore: 0.3,
      isFollowUp: false,
      messageWordCount: 15,
    });
    assert.ok(result !== null);
    assert.strictEqual(result.name, 'deep_analytical');
  });

  // T-RS14: lastAvgScore === 0 (no previous scores) → Rule 3 NOT triggered
  it('T-RS14: lastAvgScore === 0 → Rule 3 not triggered (falls to Rule 5)', () => {
    featureFlags.setOverride('RAG_STRATEGIES', true);
    // With analytical and lastAvgScore=0, Rule 3 skips, Rule 5 catches
    const result = ragStrategySelector.select({
      complexityType: 'analytical',
      turnNumber: 0,
      lastAvgScore: 0,
      isFollowUp: false,
      messageWordCount: 15,
    });
    assert.ok(result !== null);
    assert.strictEqual(result.name, 'deep_analytical');
    // This tests that Rule 3 didn't trigger (it would also give deep_analytical,
    // but the key is that lastAvgScore=0 is treated as "no data")
  });

  // T-RS15: Factual + long question (> 10 words) → null (no strategy override)
  it('T-RS15: factual + long question → null', () => {
    featureFlags.setOverride('RAG_STRATEGIES', true);
    const result = ragStrategySelector.select({
      complexityType: 'factual',
      turnNumber: 0,
      lastAvgScore: 0,
      isFollowUp: false,
      messageWordCount: 15,
    });
    assert.strictEqual(result, null);
  });
});

// ═══════════════════════════════════════════════════════════════
// Block 3: Rule Priority (T-RS16 to T-RS20)
// ═══════════════════════════════════════════════════════════════
describe('RAGStrategySelector Rule Priority', () => {

  // T-RS16: Follow-up rule (1) takes precedence over factual rule (2)
  it('T-RS16: follow-up rule takes precedence over factual rule', () => {
    featureFlags.setOverride('RAG_STRATEGIES', true);
    // Follow-up + factual + short + turn >= 3 → Rule 1 wins (conversational_followup)
    const result = ragStrategySelector.select({
      complexityType: 'factual',
      turnNumber: 5,
      lastAvgScore: 0,
      isFollowUp: true,
      messageWordCount: 5,
    });
    assert.ok(result !== null);
    assert.strictEqual(result.name, 'conversational_followup');
  });

  // T-RS17: Factual rule (2) takes precedence over low-score rule (3)
  it('T-RS17: factual rule takes precedence over low-score rule', () => {
    featureFlags.setOverride('RAG_STRATEGIES', true);
    // Factual + short + low score → Rule 2 wins (quick_factual)
    // Note: Rule 3 requires analytical/comparative/multi_part, not factual
    const result = ragStrategySelector.select({
      complexityType: 'factual',
      turnNumber: 0,
      lastAvgScore: 0.3,
      isFollowUp: false,
      messageWordCount: 5,
    });
    assert.ok(result !== null);
    assert.strictEqual(result.name, 'quick_factual');
  });

  // T-RS18: Low-score rule (3) takes precedence over complexity-type rule (5)
  it('T-RS18: low-score rule takes precedence over complexity-type rule', () => {
    featureFlags.setOverride('RAG_STRATEGIES', true);
    // Analytical + low score → Rule 3 (deep_analytical) — same result as Rule 5
    // but Rule 3 fires first
    const result = ragStrategySelector.select({
      complexityType: 'analytical',
      turnNumber: 0,
      lastAvgScore: 0.3,
      isFollowUp: false,
      messageWordCount: 15,
    });
    assert.ok(result !== null);
    assert.strictEqual(result.name, 'deep_analytical');
  });

  // T-RS19: Exploratory rule (4) takes precedence over default (6)
  it('T-RS19: exploratory rule takes precedence over default', () => {
    featureFlags.setOverride('RAG_STRATEGIES', true);
    const result = ragStrategySelector.select({
      complexityType: 'exploratory',
      turnNumber: 0,
      lastAvgScore: 0,
      isFollowUp: false,
      messageWordCount: 15,
    });
    assert.ok(result !== null);
    assert.strictEqual(result.name, 'exploratory_scan');
  });

  // T-RS20: No matching rule → returns null, stats increments 'none'
  it('T-RS20: no matching rule → null, stats tracks none', () => {
    featureFlags.setOverride('RAG_STRATEGIES', true);
    const result = ragStrategySelector.select({
      complexityType: 'factual',
      turnNumber: 0,
      lastAvgScore: 0,
      isFollowUp: false,
      messageWordCount: 15,
    });
    assert.strictEqual(result, null);
    const c = ragStrategySelector.counts();
    assert.strictEqual(c.strategyBreakdown.none, 1);
  });
});

// ═══════════════════════════════════════════════════════════════
// Block 4: Strategy Output Shape (T-RS21 to T-RS23)
// ═══════════════════════════════════════════════════════════════
describe('RAGStrategySelector Strategy Output', () => {

  // T-RS21: quick_factual returns correct skipStages (3 stages)
  it('T-RS21: quick_factual returns correct skipStages', () => {
    featureFlags.setOverride('RAG_STRATEGIES', true);
    const result = ragStrategySelector.select({
      complexityType: 'factual',
      turnNumber: 0,
      lastAvgScore: 0,
      isFollowUp: false,
      messageWordCount: 5,
    });
    assert.ok(result !== null);
    assert.strictEqual(result.name, 'quick_factual');
    assert.ok(Array.isArray(result.skipStages));
    assert.strictEqual(result.skipStages.length, 3);
    assert.ok(result.skipStages.includes('stageRerank'));
    assert.ok(result.skipStages.includes('stageGroundingCheck'));
    assert.ok(result.skipStages.includes('stageCitationMapping'));
  });

  // T-RS22: deep_analytical returns empty skipStages
  it('T-RS22: deep_analytical returns empty skipStages', () => {
    featureFlags.setOverride('RAG_STRATEGIES', true);
    const result = ragStrategySelector.select({
      complexityType: 'analytical',
      turnNumber: 0,
      lastAvgScore: 0,
      isFollowUp: false,
      messageWordCount: 15,
    });
    assert.ok(result !== null);
    assert.strictEqual(result.name, 'deep_analytical');
    assert.ok(Array.isArray(result.skipStages));
    assert.strictEqual(result.skipStages.length, 0);
  });

  // T-RS23: conversational_followup has preferLocalRewrite: true
  it('T-RS23: conversational_followup has preferLocalRewrite: true', () => {
    featureFlags.setOverride('RAG_STRATEGIES', true);
    const result = ragStrategySelector.select({
      complexityType: 'factual',
      turnNumber: 3,
      lastAvgScore: 0,
      isFollowUp: true,
      messageWordCount: 5,
    });
    assert.ok(result !== null);
    assert.strictEqual(result.name, 'conversational_followup');
    assert.strictEqual(result.preferLocalRewrite, true);
  });
});

// ═══════════════════════════════════════════════════════════════
// Block 5: Stats Tracking (T-RS24 to T-RS25)
// ═══════════════════════════════════════════════════════════════
describe('RAGStrategySelector Stats Tracking', () => {

  // T-RS24: totalSelections increments on each select() call (when enabled)
  it('T-RS24: totalSelections increments on each select() call', () => {
    featureFlags.setOverride('RAG_STRATEGIES', true);
    ragStrategySelector.select({ complexityType: 'factual', turnNumber: 0, lastAvgScore: 0, isFollowUp: false, messageWordCount: 5 });
    ragStrategySelector.select({ complexityType: 'analytical', turnNumber: 0, lastAvgScore: 0, isFollowUp: false, messageWordCount: 15 });
    ragStrategySelector.select({ complexityType: 'factual', turnNumber: 0, lastAvgScore: 0, isFollowUp: false, messageWordCount: 15 });
    const c = ragStrategySelector.counts();
    assert.strictEqual(c.totalSelections, 3);
  });

  // T-RS25: strategyBreakdown correctly tracks per-strategy counts
  it('T-RS25: strategyBreakdown tracks per-strategy counts correctly', () => {
    featureFlags.setOverride('RAG_STRATEGIES', true);
    ragStrategySelector.select({ complexityType: 'factual', turnNumber: 0, lastAvgScore: 0, isFollowUp: false, messageWordCount: 5 }); // quick_factual
    ragStrategySelector.select({ complexityType: 'factual', turnNumber: 0, lastAvgScore: 0, isFollowUp: false, messageWordCount: 5 }); // quick_factual
    ragStrategySelector.select({ complexityType: 'analytical', turnNumber: 0, lastAvgScore: 0, isFollowUp: false, messageWordCount: 15 }); // deep_analytical
    ragStrategySelector.select({ complexityType: 'exploratory', turnNumber: 0, lastAvgScore: 0, isFollowUp: false, messageWordCount: 15 }); // exploratory_scan
    ragStrategySelector.select({ complexityType: 'factual', turnNumber: 0, lastAvgScore: 0, isFollowUp: false, messageWordCount: 15 }); // none
    const c = ragStrategySelector.counts();
    assert.strictEqual(c.strategyBreakdown.quick_factual, 2);
    assert.strictEqual(c.strategyBreakdown.deep_analytical, 1);
    assert.strictEqual(c.strategyBreakdown.exploratory_scan, 1);
    assert.strictEqual(c.strategyBreakdown.none, 1);
    assert.strictEqual(c.totalSelections, 5);
  });
});
