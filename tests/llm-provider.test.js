// tests/llm-provider.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 74 — LLM Provider Abstraction Layer Tests
// Tests LLMProvider base class, LLMProviderRegistry, and
// GeminiProvider structure (no network calls).
// ═══════════════════════════════════════════════════════════════

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { LLMProvider, LLMProviderRegistry } from '../server/services/llmProvider.js';
import { GeminiProvider } from '../server/services/providers/geminiProvider.js';
import { GeminiTimeoutError, GeminiSafetyError, GeminiEmptyError, GeminiAPIError } from '../server/services/providers/geminiProvider.js';

// ── Mock Provider for registry tests ──────────────────────────
class MockProvider extends LLMProvider {
  get name() { return 'mock'; }
  get embeddingDimensions() { return 128; }
  get embeddingModel() { return 'mock-embed-v1'; }
  get generationModel() { return 'mock-gen-v1'; }
  async embedText() { return [0.1, 0.2, 0.3]; }
  async embedBatch(texts) { return texts.map(() => [0.1, 0.2]); }
  async streamGenerate() { return { finishReason: 'stop' }; }
}

// ═══════════════════════════════════════════════════════════════
// Block 1: LLMProvider Base Class
// ═══════════════════════════════════════════════════════════════
describe('LLMProvider Base Class', () => {

  // T-LLM01: embedText() throws not-overridden error
  it('T-LLM01: embedText() throws not-overridden error', async () => {
    const base = new LLMProvider();
    await assert.rejects(() => base.embedText('test'), {
      message: 'LLMProvider.embedText() must be overridden',
    });
  });

  // T-LLM02: streamGenerate() throws not-overridden error
  it('T-LLM02: streamGenerate() throws not-overridden error', async () => {
    const base = new LLMProvider();
    await assert.rejects(() => base.streamGenerate('sys', 'ctx', [], 'q', () => {}), {
      message: 'LLMProvider.streamGenerate() must be overridden',
    });
  });

  // T-LLM03: name getter throws not-overridden error
  it('T-LLM03: name getter throws not-overridden error', () => {
    const base = new LLMProvider();
    assert.throws(() => base.name, {
      message: 'LLMProvider.name must be overridden',
    });
  });

  // T-LLM04: embeddingDimensions getter throws not-overridden error
  it('T-LLM04: embeddingDimensions getter throws not-overridden error', () => {
    const base = new LLMProvider();
    assert.throws(() => base.embeddingDimensions, {
      message: 'LLMProvider.embeddingDimensions must be overridden',
    });
  });

  // T-LLM05: embedBatch() throws not-overridden error
  it('T-LLM05: embedBatch() throws not-overridden error', async () => {
    const base = new LLMProvider();
    await assert.rejects(() => base.embedBatch(['a', 'b']), {
      message: 'LLMProvider.embedBatch() must be overridden',
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// Block 2: LLMProviderRegistry
// ═══════════════════════════════════════════════════════════════
describe('LLMProviderRegistry', () => {
  let registry;

  beforeEach(() => {
    registry = new LLMProviderRegistry();
  });

  // T-LLM06: register() adds factory and has() returns true
  it('T-LLM06: register() adds factory — has() returns true', () => {
    registry.register('mock', () => new MockProvider());
    assert.strictEqual(registry.has('mock'), true);
    assert.strictEqual(registry.has('nonexistent'), false);
  });

  // T-LLM07: get() returns lazily created instance
  it('T-LLM07: get() returns lazily created instance', () => {
    let factoryCalls = 0;
    registry.register('mock', () => { factoryCalls++; return new MockProvider(); });
    assert.strictEqual(factoryCalls, 0, 'factory should not be called at registration');
    const instance = registry.get('mock');
    assert.strictEqual(factoryCalls, 1, 'factory called on first get()');
    assert.strictEqual(instance.name, 'mock');
  });

  // T-LLM08: get() caches instance (same reference on second call)
  it('T-LLM08: get() caches instance — same reference on second call', () => {
    registry.register('mock', () => new MockProvider());
    const first  = registry.get('mock');
    const second = registry.get('mock');
    assert.strictEqual(first, second, 'should return same instance');
  });

  // T-LLM09: get('unknown') throws with available providers list
  it('T-LLM09: get(unknown) throws with available providers', () => {
    registry.register('mock', () => new MockProvider());
    assert.throws(() => registry.get('unknown'), (err) => {
      assert.ok(err.message.includes("'unknown'"), 'should mention unknown name');
      assert.ok(err.message.includes('mock'), 'should list available providers');
      return true;
    });
  });

  // T-LLM10: counts() returns correct structure
  it('T-LLM10: counts() returns correct structure', () => {
    registry.register('mock', () => new MockProvider());
    registry.get('mock'); // instantiate
    const c = registry.counts();
    assert.strictEqual(c.registeredCount, 1);
    assert.deepStrictEqual(c.registered, ['mock']);
  });

  // T-LLM11: reset() clears all registrations
  it('T-LLM11: reset() clears all registrations', () => {
    registry.register('mock', () => new MockProvider());
    registry.get('mock');
    registry.reset();
    assert.strictEqual(registry.has('mock'), false);
    assert.strictEqual(registry.counts().registeredCount, 0);
  });

  // T-LLM12: register() with invalid name throws
  it('T-LLM12: register() with invalid name throws', () => {
    assert.throws(() => registry.register('', () => {}), { message: /non-empty string/ });
    assert.throws(() => registry.register(null, () => {}), { message: /non-empty string/ });
  });

  // T-LLM13: register() with non-function factory throws
  it('T-LLM13: register() with non-function factory throws', () => {
    assert.throws(() => registry.register('test', 'not-a-function'), { message: /must be a function/ });
  });
});

// ═══════════════════════════════════════════════════════════════
// Block 3: GeminiProvider Structure
// ═══════════════════════════════════════════════════════════════
describe('GeminiProvider Structure', () => {

  // T-LLM14: GeminiProvider extends LLMProvider
  it('T-LLM14: GeminiProvider extends LLMProvider', () => {
    const provider = new GeminiProvider();
    assert.ok(provider instanceof LLMProvider, 'should be instance of LLMProvider');
  });

  // T-LLM15: name returns "gemini"
  it('T-LLM15: name returns "gemini"', () => {
    const provider = new GeminiProvider();
    assert.strictEqual(provider.name, 'gemini');
  });

  // T-LLM16: embeddingDimensions returns config value (3072 default)
  it('T-LLM16: embeddingDimensions returns 3072 (default)', () => {
    const provider = new GeminiProvider();
    assert.strictEqual(provider.embeddingDimensions, 3072);
  });

  // T-LLM17: embeddingModel returns config value
  it('T-LLM17: embeddingModel returns "gemini-embedding-001" (default)', () => {
    const provider = new GeminiProvider();
    assert.strictEqual(provider.embeddingModel, 'gemini-embedding-001');
  });

  // T-LLM18: generationModel returns config value
  it('T-LLM18: generationModel returns "gemini-2.5-flash" (default)', () => {
    const provider = new GeminiProvider();
    assert.strictEqual(provider.generationModel, 'gemini-2.5-flash');
  });
});

// ═══════════════════════════════════════════════════════════════
// Block 4: GeminiProvider Error Classes
// ═══════════════════════════════════════════════════════════════
describe('GeminiProvider Error Classes', () => {

  // T-LLM19: GeminiTimeoutError has correct name and message
  it('T-LLM19: GeminiTimeoutError — correct name and message', () => {
    const err = new GeminiTimeoutError('embed');
    assert.strictEqual(err.name, 'GeminiTimeoutError');
    assert.strictEqual(err.message, 'Gemini timeout: embed');
    assert.ok(err instanceof Error);
  });

  // T-LLM20: GeminiSafetyError has correct name
  it('T-LLM20: GeminiSafetyError — correct name', () => {
    const err = new GeminiSafetyError();
    assert.strictEqual(err.name, 'GeminiSafetyError');
    assert.strictEqual(err.message, 'Gemini safety block');
  });

  // T-LLM21: GeminiEmptyError has correct name
  it('T-LLM21: GeminiEmptyError — correct name', () => {
    const err = new GeminiEmptyError();
    assert.strictEqual(err.name, 'GeminiEmptyError');
  });

  // T-LLM22: GeminiAPIError stores status
  it('T-LLM22: GeminiAPIError — stores status', () => {
    const err = new GeminiAPIError(429, 'rate limited');
    assert.strictEqual(err.name, 'GeminiAPIError');
    assert.strictEqual(err.status, 429);
    assert.strictEqual(err.message, 'Gemini API error 429');
  });
});

// ═══════════════════════════════════════════════════════════════
// Block 5: Facade Re-exports (backward compat)
// ═══════════════════════════════════════════════════════════════
describe('Gemini Facade Re-exports', () => {

  // T-LLM23: gemini.js re-exports all error classes
  it('T-LLM23: gemini.js re-exports all error classes', async () => {
    const gemini = await import('../server/services/gemini.js');
    assert.strictEqual(typeof gemini.GeminiTimeoutError, 'function');
    assert.strictEqual(typeof gemini.GeminiSafetyError, 'function');
    assert.strictEqual(typeof gemini.GeminiEmptyError, 'function');
    assert.strictEqual(typeof gemini.GeminiAPIError, 'function');
  });

  // T-LLM24: gemini.js exports all functions
  it('T-LLM24: gemini.js exports all functions', async () => {
    const gemini = await import('../server/services/gemini.js');
    assert.strictEqual(typeof gemini.embedText, 'function');
    assert.strictEqual(typeof gemini.embedBatch, 'function');
    assert.strictEqual(typeof gemini.streamGenerate, 'function');
  });

  // T-LLM25: error classes from facade are same as from provider
  it('T-LLM25: error classes from facade === from provider', async () => {
    const gemini = await import('../server/services/gemini.js');
    const provider = await import('../server/services/providers/geminiProvider.js');
    assert.strictEqual(gemini.GeminiTimeoutError, provider.GeminiTimeoutError);
    assert.strictEqual(gemini.GeminiSafetyError, provider.GeminiSafetyError);
    assert.strictEqual(gemini.GeminiEmptyError, provider.GeminiEmptyError);
    assert.strictEqual(gemini.GeminiAPIError, provider.GeminiAPIError);
  });
});

// ═══════════════════════════════════════════════════════════════
// Block 6: Multi-Provider Registry (Phase 75)
// ═══════════════════════════════════════════════════════════════
describe('Multi-Provider Registry (Phase 75)', () => {

  // ── MockOpenAIProvider for registry tests (no real API) ─────
  class MockOpenAIProvider extends LLMProvider {
    get name() { return 'openai'; }
    get embeddingDimensions() { return 1536; }
    get embeddingModel() { return 'text-embedding-3-small'; }
    get generationModel() { return 'gpt-4o-mini'; }
    async embedText() { return new Array(1536).fill(0); }
    async embedBatch() { return []; }
    async streamGenerate() { return { finishReason: 'stop' }; }
  }

  let registry;

  beforeEach(() => {
    registry = new LLMProviderRegistry();
  });

  // T-LLM26: register('openai', factory) + get('openai') returns instance
  it('T-LLM26: register + get openai returns OpenAI instance', () => {
    registry.register('openai', () => new MockOpenAIProvider());
    const instance = registry.get('openai');
    assert.strictEqual(instance.name, 'openai');
    assert.strictEqual(instance.embeddingDimensions, 1536);
  });

  // T-LLM27: registering both providers → counts().registeredCount === 2
  it('T-LLM27: two providers registered — registeredCount is 2', () => {
    registry.register('gemini', () => new MockProvider());
    registry.register('openai', () => new MockOpenAIProvider());
    assert.strictEqual(registry.counts().registeredCount, 2);
  });

  // T-LLM28: counts().registered includes both names
  it('T-LLM28: counts().registered includes both names', () => {
    registry.register('gemini', () => new MockProvider());
    registry.register('openai', () => new MockOpenAIProvider());
    const registered = registry.counts().registered;
    assert.ok(registered.includes('gemini'), 'should include gemini');
    assert.ok(registered.includes('openai'), 'should include openai');
  });

  // T-LLM29: get() defaults to config provider even when multiple registered
  it('T-LLM29: get() defaults to config provider (gemini)', () => {
    registry.register('gemini', () => new MockProvider());
    registry.register('openai', () => new MockOpenAIProvider());
    // config.LLM_PROVIDER.provider is 'gemini' by default
    const instance = registry.get();
    assert.strictEqual(instance.name, 'mock'); // MockProvider.name is 'mock', but config resolves to 'gemini' factory
  });

  // T-LLM30: re-register clears cached instance
  it('T-LLM30: re-register clears cached instance — new factory used', () => {
    let callCount = 0;
    registry.register('openai', () => { callCount++; return new MockOpenAIProvider(); });
    registry.get('openai');
    assert.strictEqual(callCount, 1);
    // Re-register with a different factory
    registry.register('openai', () => { callCount++; return new MockOpenAIProvider(); });
    registry.get('openai');
    assert.strictEqual(callCount, 2, 're-register should clear cache and use new factory');
  });
});
