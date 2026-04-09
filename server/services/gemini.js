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

// ── Circuit Breaker (Phase 88: lazy init with per-provider naming) ──
let _cb = null;
function getCB() {
  if (_cb) return _cb;
  let cbName = 'gemini';  // fallback
  try {
    cbName = llmProviderRegistry.get().name;
  } catch { /* provider not yet registered — use fallback */ }
  _cb = createCircuitBreaker(cbName);
  return _cb;
}

// ── embedText — facade ─────────────────────────────────────────
export async function embedText(text, taskType = 'RETRIEVAL_QUERY') {
  return getCB().execute(() => llmProviderRegistry.get().embedText(text, taskType));
}

// ── embedBatch — facade (Phase 73) ─────────────────────────────
export async function embedBatch(texts, taskType = 'RETRIEVAL_DOCUMENT') {
  return getCB().execute(() => llmProviderRegistry.get().embedBatch(texts, taskType));
}

// ── streamGenerate — facade ────────────────────────────────────
export async function streamGenerate(systemPrompt, context, history, question, onChunk) {
  return getCB().execute(() => llmProviderRegistry.get().streamGenerate(systemPrompt, context, history, question, onChunk));
}

// ── generate — facade (Phase 76 — non-streaming) ──────────────
export async function generate(systemPrompt, context, history, question) {
  return getCB().execute(() => llmProviderRegistry.get().generate(systemPrompt, context, history, question));
}
