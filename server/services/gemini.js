// server/services/gemini.js
// ═══════════════════════════════════════════════════════════════
// Gemini API Facade — Phase 74
// Thin wrapper that delegates to the active LLM provider via
// LLMProviderRegistry. Maintains backward compatibility:
// all exported functions and error classes unchanged.
// Circuit breaker wrapping stays here (not in provider).
// ═══════════════════════════════════════════════════════════════

import { createCircuitBreaker } from './circuitBreaker.js';
import { llmProviderRegistry }  from './llmProvider.js';

// ── Re-export error classes from GeminiProvider (backward compat) ──
export { GeminiTimeoutError, GeminiSafetyError, GeminiEmptyError, GeminiAPIError } from './providers/geminiProvider.js';

// ── Circuit Breaker (unchanged from Phase 18) ──────────────────
const geminiCB = createCircuitBreaker('gemini');

// ── embedText — facade ─────────────────────────────────────────
export async function embedText(text, taskType = 'RETRIEVAL_QUERY') {
  return geminiCB.execute(() => llmProviderRegistry.get().embedText(text, taskType));
}

// ── embedBatch — facade (Phase 73) ─────────────────────────────
export async function embedBatch(texts, taskType = 'RETRIEVAL_DOCUMENT') {
  return geminiCB.execute(() => llmProviderRegistry.get().embedBatch(texts, taskType));
}

// ── streamGenerate — facade ────────────────────────────────────
export async function streamGenerate(systemPrompt, context, history, question, onChunk) {
  return geminiCB.execute(() => llmProviderRegistry.get().streamGenerate(systemPrompt, context, history, question, onChunk));
}
