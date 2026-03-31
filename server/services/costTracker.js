// server/services/costTracker.js
// ═══════════════════════════════════════════════════════════════
// Cost estimation service for Gemini API usage
// Estimates token counts from text length and calculates costs
// based on published Gemini pricing (March 2026)
// ═══════════════════════════════════════════════════════════════

// ── Pricing per 1M tokens (USD) ────────────────────────────────
// Source: https://ai.google.dev/gemini-api/docs/pricing
// Last updated: 2026-03-31
const PRICING = Object.freeze({
  'gemini-2.5-flash': {
    input:  0.30,   // $0.30 per 1M input tokens
    output: 2.50,   // $2.50 per 1M output tokens
  },
  'gemini-embedding-001': {
    input:  0.15,   // $0.15 per 1M input tokens
    output: 0,
  },
});

// ── Token estimation constants ─────────────────────────────────
// Arabic text averages ~2 chars per token (wider Unicode = more tokens)
// English text averages ~4 chars per token
// Mixed content: we use a conservative ~3 chars per token
const CHARS_PER_TOKEN = 3;

// ── estimateTokens ─────────────────────────────────────────────
/**
 * Estimates token count from text length.
 * Conservative estimate for mixed Arabic/English content.
 *
 * @param {string} text - The text to estimate tokens for
 * @returns {number} Estimated token count
 */
export function estimateTokens(text) {
  if (!text || typeof text !== 'string') return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

// ── calculateCost ──────────────────────────────────────────────
/**
 * Calculates the cost in USD for a given token count and model.
 *
 * @param {number} tokens - Number of tokens
 * @param {string} model  - Model name key from PRICING
 * @param {string} direction - 'input' or 'output'
 * @returns {number} Cost in USD
 */
function calculateCost(tokens, model, direction) {
  const modelPricing = PRICING[model];
  if (!modelPricing) return 0;
  const pricePerMillion = modelPricing[direction] || 0;
  return (tokens / 1_000_000) * pricePerMillion;
}

// ── estimateRequestCost ────────────────────────────────────────
/**
 * Estimates the total cost of a single chat request.
 *
 * @param {object} details
 * @param {number} details.embeddingInputTokens  - Tokens sent to embedding model
 * @param {number} details.generationInputTokens - Tokens sent to generation model (system + context + history + question)
 * @param {number} details.generationOutputTokens- Tokens received from generation model
 * @returns {object} { embedding_cost, generation_input_cost, generation_output_cost, total_cost, breakdown }
 */
export function estimateRequestCost({
  embeddingInputTokens = 0,
  generationInputTokens = 0,
  generationOutputTokens = 0,
} = {}) {
  const embeddingCost       = calculateCost(embeddingInputTokens,  'gemini-embedding-001', 'input');
  const genInputCost        = calculateCost(generationInputTokens, 'gemini-2.5-flash',     'input');
  const genOutputCost       = calculateCost(generationOutputTokens,'gemini-2.5-flash',     'output');
  const totalCost           = embeddingCost + genInputCost + genOutputCost;

  return {
    embedding_cost:          round(embeddingCost),
    generation_input_cost:   round(genInputCost),
    generation_output_cost:  round(genOutputCost),
    total_cost:              round(totalCost),
    tokens: {
      embedding_input:       embeddingInputTokens,
      generation_input:      generationInputTokens,
      generation_output:     generationOutputTokens,
      total:                 embeddingInputTokens + generationInputTokens + generationOutputTokens,
    },
  };
}

// ── getCostSummary ─────────────────────────────────────────────
/**
 * Aggregates cost data from analytics stats.
 * Designed to work with the output of analytics.getStats().
 *
 * @param {object} analyticsStats - Output from getStats()
 * @returns {object} Cost summary
 */
export function getCostSummary(analyticsStats) {
  if (!analyticsStats) {
    return {
      total_cost: 0,
      avg_cost_per_request: 0,
      total_requests: 0,
      tokens: { embedding: 0, generation: 0, total: 0 },
    };
  }

  const { chat, tokens, estimated_total_cost } = analyticsStats;
  const totalRequests = chat?.total || 0;
  const totalTokens   = (tokens?.embedding || 0) + (tokens?.generation || 0);

  return {
    total_cost:           estimated_total_cost || 0,
    avg_cost_per_request: totalRequests > 0
      ? round(estimated_total_cost / totalRequests)
      : 0,
    total_requests:       totalRequests,
    tokens: {
      embedding:  tokens?.embedding  || 0,
      generation: tokens?.generation || 0,
      total:      totalTokens,
    },
  };
}

// ── Utility ────────────────────────────────────────────────────
function round(n) {
  // Round to 8 decimal places — enough precision for micro-costs
  return Math.round(n * 100_000_000) / 100_000_000;
}
