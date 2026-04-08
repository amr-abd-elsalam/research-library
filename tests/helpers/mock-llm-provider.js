// tests/helpers/mock-llm-provider.js
// ═══════════════════════════════════════════════════════════════
// Phase 83 — MockLLMProvider for Pipeline Integration Testing
// Implements LLMProvider interface (duck-typing — no inheritance).
// Configurable responses, call recording, error injection,
// latency simulation. Used exclusively in tests — never
// imported by production code.
// ═══════════════════════════════════════════════════════════════

class MockLLMProvider {
  /**
   * @param {object} [options]
   * @param {string}   [options.name='mock']
   * @param {number}   [options.embeddingDimensions=3072]
   * @param {number[]} [options.embedResult]          — fixed vector (cloned per call)
   * @param {object}   [options.generateResult]       — { text, usage, finishReason }
   * @param {string[]} [options.streamChunks]          — chunks for streamGenerate
   * @param {object}   [options.errorOnCall]           — e.g. { embedText: 3 } → throw on 3rd embedText
   * @param {number}   [options.latencyMs=0]
   */
  constructor(options = {}) {
    this._name                = options.name || 'mock';
    this._embeddingDimensions = options.embeddingDimensions || 3072;
    this._embedResult         = options.embedResult || new Array(3072).fill(0.01);
    this._generateResult      = options.generateResult || {
      text: 'إجابة تجريبية من المكتبة.',
      usage: { inputTokens: 100, outputTokens: 50 },
      finishReason: 'stop',
    };
    this._streamChunks = options.streamChunks || ['إجابة ', 'تجريبية ', 'من المكتبة.'];
    this._calls        = { embedText: [], embedBatch: [], streamGenerate: [], generate: [] };
    this._errorOnCall  = options.errorOnCall || {};
    this._latencyMs    = options.latencyMs || 0;
  }

  // ── LLMProvider interface getters ───────────────────────────
  get name()                { return this._name; }
  get embeddingDimensions() { return this._embeddingDimensions; }
  get embeddingModel()      { return `${this._name}-embed-mock`; }
  get generationModel()     { return `${this._name}-gen-mock`; }

  // ── LLMProvider interface methods ───────────────────────────

  async embedText(text, taskType) {
    await this._maybeDelay();
    this._maybeThrow('embedText');
    this._calls.embedText.push({ text, taskType });
    return [...this._embedResult];
  }

  async embedBatch(texts, taskType) {
    await this._maybeDelay();
    this._maybeThrow('embedBatch');
    this._calls.embedBatch.push({ texts, taskType });
    return texts.map(() => [...this._embedResult]);
  }

  async streamGenerate(systemPrompt, context, history, question, onChunk) {
    await this._maybeDelay();
    this._maybeThrow('streamGenerate');
    this._calls.streamGenerate.push({ systemPrompt, context, history, question });
    for (const chunk of this._streamChunks) {
      onChunk(chunk);
    }
    return { finishReason: 'stop' };
  }

  async generate(systemPrompt, context, history, question) {
    await this._maybeDelay();
    this._maybeThrow('generate');
    this._calls.generate.push({ systemPrompt, context, history, question });
    return { ...this._generateResult };
  }

  // ── Inspection helpers ──────────────────────────────────────

  /** Returns a copy of recorded calls for a method. */
  getCalls(method) { return [...(this._calls[method] || [])]; }

  /** Returns call count for a method. */
  getCallCount(method) { return (this._calls[method] || []).length; }

  /** Returns total call count across all methods. */
  getTotalCallCount() {
    return Object.values(this._calls).reduce((sum, arr) => sum + arr.length, 0);
  }

  /** Clears all call recordings. */
  reset() {
    for (const key of Object.keys(this._calls)) {
      this._calls[key] = [];
    }
  }

  // ── Internal helpers ────────────────────────────────────────

  async _maybeDelay() {
    if (this._latencyMs > 0) {
      await new Promise(r => setTimeout(r, this._latencyMs));
    }
  }

  _maybeThrow(method) {
    const threshold = this._errorOnCall[method];
    if (typeof threshold === 'number') {
      const count = this._calls[method].length + 1;
      if (count >= threshold) {
        throw new Error(`MockLLMProvider: injected error on ${method} call #${count}`);
      }
    }
  }
}

export { MockLLMProvider };
