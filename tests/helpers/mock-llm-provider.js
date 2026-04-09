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

    // ── Chaos injection (Phase 89) ────────────────────────────
    this._chaosConfig  = {
      randomFailureRate: 0,    // 0-1: probability of random Error throw
      latencySpike:     null,  // { probability: 0.3, maxMs: 5000 } or null
      failOnNthCall:    null,  // number — fail on exact call index (0-based global count)
      timeoutOnCall:    null,  // { n: number, ms: number } — simulate timeout on specific call
      degradeAfterCalls: null, // number — return empty text after N total calls
    };
    this._chaosCallCount = 0;
    this._chaosDegraded  = false;
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
    await this._applyChaos();
    this._calls.embedText.push({ text, taskType });
    if (this._chaosDegraded) return new Array(this._embeddingDimensions).fill(0);
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
    await this._applyChaos();
    this._calls.streamGenerate.push({ systemPrompt, context, history, question });
    if (this._chaosDegraded) {
      onChunk('');
      return { finishReason: 'stop' };
    }
    for (const chunk of this._streamChunks) {
      onChunk(chunk);
    }
    return { finishReason: 'stop' };
  }

  async generate(systemPrompt, context, history, question) {
    await this._maybeDelay();
    this._maybeThrow('generate');
    await this._applyChaos();
    this._calls.generate.push({ systemPrompt, context, history, question });
    if (this._chaosDegraded) {
      return { text: '', usage: { inputTokens: 0, outputTokens: 0 }, finishReason: 'stop' };
    }
    return { ...this._generateResult };
  }

  // ── Chaos injection API (Phase 89) ──────────────────────────

  /**
   * Configures chaos injection for subsequent calls.
   * Chainable — returns `this`.
   * @param {object} chaosConfig
   * @returns {MockLLMProvider}
   */
  setChaos(chaosConfig = {}) {
    this._chaosConfig = { ...this._chaosConfig, ...chaosConfig };
    // Reset degradation flag when reconfiguring
    if (chaosConfig.degradeAfterCalls !== undefined) {
      this._chaosDegraded = false;
    }
    // Reset chaos call counter if clearing chaos entirely
    if (Object.keys(chaosConfig).length === 0) {
      this._chaosCallCount = 0;
      this._chaosDegraded = false;
      this._chaosConfig = {
        randomFailureRate: 0,
        latencySpike: null,
        failOnNthCall: null,
        timeoutOnCall: null,
        degradeAfterCalls: null,
      };
    }
    return this;
  }

  /**
   * Applies chaos effects before a real method call.
   * Called at the start of embedText, generate, streamGenerate.
   * @returns {Promise<void>}
   */
  async _applyChaos() {
    const idx = this._chaosCallCount++;
    const cfg = this._chaosConfig;

    // 1. failOnNthCall — exact match (0-based)
    if (typeof cfg.failOnNthCall === 'number' && idx === cfg.failOnNthCall) {
      throw new Error(`MockLLMProvider: chaos failOnNthCall at index ${idx}`);
    }

    // 2. timeoutOnCall — delay then throw
    if (cfg.timeoutOnCall && typeof cfg.timeoutOnCall.n === 'number' && idx === cfg.timeoutOnCall.n) {
      const ms = cfg.timeoutOnCall.ms || 100;
      await new Promise(r => setTimeout(r, ms));
      throw new Error(`MockLLMProvider: chaos timeout after ${ms}ms at call ${idx}`);
    }

    // 3. randomFailureRate
    if (typeof cfg.randomFailureRate === 'number' && cfg.randomFailureRate > 0) {
      if (Math.random() < cfg.randomFailureRate) {
        throw new Error(`MockLLMProvider: chaos random failure (rate: ${cfg.randomFailureRate})`);
      }
    }

    // 4. latencySpike
    if (cfg.latencySpike && typeof cfg.latencySpike.probability === 'number') {
      if (Math.random() < cfg.latencySpike.probability) {
        const ms = Math.floor(Math.random() * (cfg.latencySpike.maxMs || 100));
        await new Promise(r => setTimeout(r, ms));
      }
    }

    // 5. degradeAfterCalls
    if (typeof cfg.degradeAfterCalls === 'number' && idx >= cfg.degradeAfterCalls) {
      this._chaosDegraded = true;
    }
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

  /** Clears all call recordings and chaos state. */
  reset() {
    for (const key of Object.keys(this._calls)) {
      this._calls[key] = [];
    }
    this._chaosCallCount = 0;
    this._chaosDegraded = false;
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
