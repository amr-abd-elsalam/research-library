// server/services/providers/openaiProvider.js
// ═══════════════════════════════════════════════════════════════
// OpenAIProvider — Phase 75
// Second LLM provider implementation.
// Wraps OpenAI Embedding API (text-embedding-3-small) and
// Chat Completions API (gpt-4o-mini) with streaming.
// Follows exact same pattern as GeminiProvider.
// Reads config.LLM_PROVIDER for model names + timeouts.
// ═══════════════════════════════════════════════════════════════

import config from '../../../config.js';
import { LLMProvider } from '../llmProvider.js';

// ─── Auth ─────────────────────────────────────────────────────
const API_KEY = process.env.OPENAI_API_KEY ?? '';

// ─── Custom Errors (same pattern as GeminiProvider) ───────────
export class OpenAITimeoutError extends Error {
  constructor(op) { super(`OpenAI timeout: ${op}`); this.name = 'OpenAITimeoutError'; }
}
export class OpenAISafetyError extends Error {
  constructor() { super('OpenAI content filter block'); this.name = 'OpenAISafetyError'; }
}
export class OpenAIEmptyError extends Error {
  constructor() { super('OpenAI empty response'); this.name = 'OpenAIEmptyError'; }
}
export class OpenAIAPIError extends Error {
  constructor(status, body) {
    super(`OpenAI API error ${status}`);
    this.name   = 'OpenAIAPIError';
    this.status = status;
  }
}

class OpenAIProvider extends LLMProvider {
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

    // OpenAI-specific defaults (differ from Gemini defaults)
    this.#embedModel      = embedCfg.model          || 'text-embedding-3-small';
    this.#embedDim        = embedCfg.dimensions      || 1536;
    this.#genModel        = genCfg.model             || 'gpt-4o-mini';
    this.#embedTimeout    = embedCfg.timeoutMs       || 8000;
    this.#streamTimeout   = genCfg.timeoutMs         || 35000;
    this.#temperature     = genCfg.temperature       ?? 0.2;
    this.#maxOutputTokens = genCfg.maxOutputTokens   || 2048;

    this.#embedUrl = 'https://api.openai.com/v1/embeddings';
    this.#genUrl   = 'https://api.openai.com/v1/chat/completions';

    this.#authHeaders = Object.freeze({
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${API_KEY}`,
    });
  }

  get name() { return 'openai'; }
  get embeddingDimensions() { return this.#embedDim; }
  get embeddingModel() { return this.#embedModel; }
  get generationModel() { return this.#genModel; }

  // ── embedText — OpenAI Embedding API ────────────────────────
  async embedText(text, taskType = 'RETRIEVAL_QUERY') {
    // taskType is ignored by OpenAI — parameter kept for interface compat
    const controller = new AbortController();
    const timer      = setTimeout(() => controller.abort(), this.#embedTimeout);

    try {
      const res = await fetch(this.#embedUrl, {
        method:  'POST',
        headers: this.#authHeaders,
        body:    JSON.stringify({
          model: this.#embedModel,
          input: text,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new OpenAIAPIError(res.status, body);
      }

      const json   = await res.json();
      const vector = json?.data?.[0]?.embedding;

      if (!Array.isArray(vector) || vector.length !== this.#embedDim) {
        throw new OpenAIAPIError(200, `Invalid embedding dimension: expected ${this.#embedDim}, got ${vector?.length}`);
      }

      return vector;

    } catch (err) {
      if (err.name === 'AbortError') throw new OpenAITimeoutError('embed');
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  // ── embedBatch — sequential with graceful failure ───────────
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

  // ── streamGenerate — OpenAI Chat Completions Streaming ──────
  async streamGenerate(systemPrompt, context, history, question, onChunk) {
    const controller = new AbortController();
    const timer      = setTimeout(() => controller.abort(), this.#streamTimeout);

    // Build messages array from system prompt + history + current question
    const messages = [];

    // System message
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }

    // History — map 'model' role to 'assistant' for OpenAI
    for (const item of (history ?? [])) {
      if (item.role === 'user'  && item.text) messages.push({ role: 'user',      content: item.text });
      if (item.role === 'model' && item.text) messages.push({ role: 'assistant', content: item.text });
    }

    // Current user turn with context
    const userTurn = context
      ? `السياق من المكتبة:\n${context}\n\nالسؤال: ${question}`
      : question;

    messages.push({ role: 'user', content: userTurn });

    const body = JSON.stringify({
      model:       this.#genModel,
      stream:      true,
      temperature: this.#temperature,
      max_tokens:  this.#maxOutputTokens,
      messages,
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
      if (err.name === 'AbortError') throw new OpenAITimeoutError('stream');
      throw err;
    }

    if (!res.ok) {
      clearTimeout(timer);
      const errBody = await res.text().catch(() => '');
      throw new OpenAIAPIError(res.status, errBody);
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

          const choice = parsed?.choices?.[0];
          if (!choice) continue;

          // Check finish reason
          if (choice.finish_reason) finishReason = choice.finish_reason;

          if (finishReason === 'content_filter') {
            throw new OpenAISafetyError();
          }

          // Extract text delta
          const text = choice?.delta?.content;
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

    if (!hasText) throw new OpenAIEmptyError();

    return { finishReason };
  }
}

export { OpenAIProvider };
