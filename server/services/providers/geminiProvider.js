// server/services/providers/geminiProvider.js
// ═══════════════════════════════════════════════════════════════
// GeminiProvider — Phase 74
// Wraps the existing Gemini API logic from gemini.js.
// Reads model names and timeouts from config.LLM_PROVIDER.
// Error classes defined here, re-exported from gemini.js for backward compat.
// IDENTICAL behavior to previous gemini.js implementation.
// ═══════════════════════════════════════════════════════════════

import config from '../../../config.js';
import { LLMProvider } from '../llmProvider.js';

// ─── Auth ─────────────────────────────────────────────────────
const API_KEY = process.env.GEMINI_API_KEY ?? '';

// ─── Custom Errors (same as previous gemini.js — exact definitions) ──
export class GeminiTimeoutError extends Error {
  constructor(op) { super(`Gemini timeout: ${op}`); this.name = 'GeminiTimeoutError'; }
}
export class GeminiSafetyError extends Error {
  constructor() { super('Gemini safety block'); this.name = 'GeminiSafetyError'; }
}
export class GeminiEmptyError extends Error {
  constructor() { super('Gemini empty response'); this.name = 'GeminiEmptyError'; }
}
export class GeminiAPIError extends Error {
  constructor(status, body) {
    super(`Gemini API error ${status}`);
    this.name   = 'GeminiAPIError';
    this.status = status;
  }
}

class GeminiProvider extends LLMProvider {
  #embedModel;
  #embedDim;
  #genModel;
  #embedUrl;
  #genUrl;
  #authHeaders;
  #embedTimeout;
  #streamTimeout;
  #temperature;
  #maxOutputTokens;

  constructor() {
    super();
    const llmConfig = config.LLM_PROVIDER || {};
    const embedCfg  = llmConfig.embedding || {};
    const genCfg    = llmConfig.generation || {};

    this.#embedModel      = embedCfg.model          || 'gemini-embedding-001';
    this.#embedDim        = embedCfg.dimensions      || 3072;
    this.#genModel        = genCfg.model             || 'gemini-2.5-flash';
    this.#embedTimeout    = embedCfg.timeoutMs       || 8000;
    this.#streamTimeout   = genCfg.timeoutMs         || 35000;
    this.#temperature     = genCfg.temperature       ?? 0.2;
    this.#maxOutputTokens = genCfg.maxOutputTokens   || 2048;

    this.#embedUrl = `https://generativelanguage.googleapis.com/v1beta/models/${this.#embedModel}:embedContent`;
    this.#genUrl   = `https://generativelanguage.googleapis.com/v1beta/models/${this.#genModel}:streamGenerateContent?alt=sse`;

    this.#authHeaders = Object.freeze({
      'Content-Type':   'application/json',
      'x-goog-api-key': API_KEY,
    });
  }

  get name() { return 'gemini'; }
  get embeddingDimensions() { return this.#embedDim; }
  get embeddingModel() { return this.#embedModel; }
  get generationModel() { return this.#genModel; }

  // ── embedText — EXACT same logic as gemini.js _embedText() ──
  async embedText(text, taskType = 'RETRIEVAL_QUERY') {
    const controller = new AbortController();
    const timer      = setTimeout(() => controller.abort(), this.#embedTimeout);

    try {
      const res = await fetch(this.#embedUrl, {
        method:  'POST',
        headers: this.#authHeaders,
        body:    JSON.stringify({
          model:    `models/${this.#embedModel}`,
          content:  { parts: [{ text }] },
          taskType: taskType,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new GeminiAPIError(res.status, body);
      }

      const json   = await res.json();
      const vector = json?.embedding?.values;

      if (!Array.isArray(vector) || vector.length !== this.#embedDim) {
        throw new GeminiAPIError(200, `Invalid embedding dimension: expected ${this.#embedDim}, got ${vector?.length}`);
      }

      return vector;

    } catch (err) {
      if (err.name === 'AbortError') throw new GeminiTimeoutError('embed');
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  // ── embedBatch — EXACT same logic as gemini.js embedBatch() ──
  // NOTE: In the original gemini.js, embedBatch calls the exported
  // (circuit-breaker-wrapped) embedText(). Here in the provider,
  // embedBatch calls this.embedText() (no CB wrapping).
  // The facade (gemini.js) wraps the entire embedBatch call in CB,
  // so the net effect is the same: each batch is CB-protected.
  async embedBatch(texts, taskType = 'RETRIEVAL_DOCUMENT') {
    if (!texts || !Array.isArray(texts) || texts.length === 0) return [];
    const results = [];
    for (const text of texts) {
      try {
        const vec = await this.embedText(text, taskType);
        results.push(vec);
      } catch {
        results.push(null); // graceful — caller handles nulls
      }
    }
    return results;
  }

  // ── streamGenerate — EXACT same logic as gemini.js _streamGenerate() ──
  async streamGenerate(systemPrompt, context, history, question, onChunk) {
    const controller = new AbortController();
    const timer      = setTimeout(() => controller.abort(), this.#streamTimeout);

    // Build contents array from history + current question
    const contents = [];

    for (const item of (history ?? [])) {
      if (item.role === 'user'  && item.text) contents.push({ role: 'user',  parts: [{ text: item.text }] });
      if (item.role === 'model' && item.text) contents.push({ role: 'model', parts: [{ text: item.text }] });
    }

    const userTurn = context
      ? `السياق من المكتبة:\n${context}\n\nالسؤال: ${question}`
      : question;

    contents.push({ role: 'user', parts: [{ text: userTurn }] });

    const body = JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents,
      generationConfig: {
        temperature:     this.#temperature,
        maxOutputTokens: this.#maxOutputTokens,
      },
    });

    let res;
    try {
      res = await fetch(this.#genUrl, {
        method:  'POST',
        headers: this.#authHeaders,
        body,
        signal:  controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      if (err.name === 'AbortError') throw new GeminiTimeoutError('stream');
      throw err;
    }

    if (!res.ok) {
      clearTimeout(timer);
      const errBody = await res.text().catch(() => '');
      throw new GeminiAPIError(res.status, errBody);
    }

    // ── Read SSE stream ────────────────────────────────────
    const reader  = res.body.getReader();
    const decoder = new TextDecoder();
    let   buffer  = '';
    let   hasText = false;
    let   finishReason = null;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // keep incomplete last line

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;

          const raw = trimmed.slice(5).trim();
          if (raw === '[DONE]') continue;

          let parsed;
          try { parsed = JSON.parse(raw); } catch { continue; }

          const candidate = parsed?.candidates?.[0];
          if (!candidate) continue;

          // Check finish reason
          if (candidate.finishReason) finishReason = candidate.finishReason;

          if (finishReason === 'SAFETY') {
            throw new GeminiSafetyError();
          }

          // Extract text delta
          const text = candidate?.content?.parts?.[0]?.text;
          if (text) {
            hasText = true;
            onChunk(text);
          }
        }
      }

      // Flush remaining buffer
      buffer += decoder.decode();

    } finally {
      reader.releaseLock();
      clearTimeout(timer);
    }

    if (!hasText) throw new GeminiEmptyError();

    return { finishReason };
  }

  // ── generate — non-streaming via generateContent endpoint ──
  async generate(systemPrompt, context, history, question) {
    const controller = new AbortController();
    const timeout    = config.LLM_PROVIDER?.rewrite?.timeoutMs || config.LLM_PROVIDER?.generation?.timeoutMs || 35000;
    const timer      = setTimeout(() => controller.abort(), timeout);

    // Build contents array (same logic as streamGenerate)
    const contents = [];

    for (const item of (history ?? [])) {
      if (item.role === 'user'  && item.text) contents.push({ role: 'user',  parts: [{ text: item.text }] });
      if (item.role === 'model' && item.text) contents.push({ role: 'model', parts: [{ text: item.text }] });
    }

    const userTurn = context
      ? `السياق من المكتبة:\n${context}\n\nالسؤال: ${question}`
      : question;

    contents.push({ role: 'user', parts: [{ text: userTurn }] });

    const body = JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents,
      generationConfig: {
        temperature:     this.#temperature,
        maxOutputTokens: this.#maxOutputTokens,
      },
    });

    // Non-streaming URL: generateContent (not streamGenerateContent)
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.#genModel}:generateContent`;

    let res;
    try {
      res = await fetch(url, {
        method:  'POST',
        headers: this.#authHeaders,
        body,
        signal:  controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      if (err.name === 'AbortError') throw new GeminiTimeoutError('generate');
      throw err;
    }

    clearTimeout(timer);

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new GeminiAPIError(res.status, errBody);
    }

    const json = await res.json();

    const candidate = json?.candidates?.[0];
    if (!candidate) throw new GeminiEmptyError();

    const finishReason = candidate.finishReason ?? null;

    if (finishReason === 'SAFETY') {
      throw new GeminiSafetyError();
    }

    const text = candidate?.content?.parts?.[0]?.text;
    if (!text) throw new GeminiEmptyError();

    // Extract actual token usage from usageMetadata
    const usage = {
      inputTokens:  json?.usageMetadata?.promptTokenCount     ?? 0,
      outputTokens: json?.usageMetadata?.candidatesTokenCount ?? 0,
    };

    return { text, usage, finishReason };
  }
}

export { GeminiProvider };
