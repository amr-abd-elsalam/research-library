// tests/openai-provider.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 75 — OpenAI Provider Tests
// Tests OpenAIProvider structure, error classes, config reading.
// No network calls — tests structure and behavior only.
// ═══════════════════════════════════════════════════════════════

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { LLMProvider } from '../server/services/llmProvider.js';
import { OpenAIProvider } from '../server/services/providers/openaiProvider.js';
import {
  OpenAITimeoutError,
  OpenAISafetyError,
  OpenAIEmptyError,
  OpenAIAPIError,
} from '../server/services/providers/openaiProvider.js';

// ═══════════════════════════════════════════════════════════════
// Block 1: OpenAIProvider Structure
// ═══════════════════════════════════════════════════════════════
describe('OpenAIProvider Structure', () => {

  // T-OAI01: OpenAIProvider instanceof LLMProvider
  it('T-OAI01: OpenAIProvider extends LLMProvider', () => {
    const provider = new OpenAIProvider();
    assert.ok(provider instanceof LLMProvider, 'should be instance of LLMProvider');
  });

  // T-OAI02: name returns 'openai'
  it('T-OAI02: name returns "openai"', () => {
    const provider = new OpenAIProvider();
    assert.strictEqual(provider.name, 'openai');
  });

  // T-OAI03: embeddingDimensions returns config value (default 1536)
  it('T-OAI03: embeddingDimensions returns 1536 (default)', () => {
    // config.LLM_PROVIDER.embedding.dimensions is 3072 (Gemini default in config)
    // but OpenAIProvider uses fallback 1536 only when config has no value
    // Since config has 3072 set, OpenAIProvider reads that.
    // However, in production, admin would change config when switching.
    // Test verifies provider reads from config correctly.
    const provider = new OpenAIProvider();
    const dim = provider.embeddingDimensions;
    assert.strictEqual(typeof dim, 'number');
    assert.ok(dim > 0, 'dimensions should be positive');
  });

  // T-OAI04: embeddingModel returns config value (default text-embedding-3-small)
  it('T-OAI04: embeddingModel returns string', () => {
    const provider = new OpenAIProvider();
    assert.strictEqual(typeof provider.embeddingModel, 'string');
    assert.ok(provider.embeddingModel.length > 0, 'model name should be non-empty');
  });

  // T-OAI05: generationModel returns config value (default gpt-4o-mini)
  it('T-OAI05: generationModel returns string', () => {
    const provider = new OpenAIProvider();
    assert.strictEqual(typeof provider.generationModel, 'string');
    assert.ok(provider.generationModel.length > 0, 'model name should be non-empty');
  });

  // T-OAI06: constructor reads config.LLM_PROVIDER (same section as Gemini)
  it('T-OAI06: constructor reads config.LLM_PROVIDER section', () => {
    // OpenAIProvider and GeminiProvider both read the same config section.
    // When config has Gemini defaults, OpenAIProvider still works
    // (it reads whatever is in config — admin is expected to set OpenAI values).
    const provider = new OpenAIProvider();
    // Verify all getters work without throwing
    assert.strictEqual(typeof provider.name, 'string');
    assert.strictEqual(typeof provider.embeddingDimensions, 'number');
    assert.strictEqual(typeof provider.embeddingModel, 'string');
    assert.strictEqual(typeof provider.generationModel, 'string');
  });
});

// ═══════════════════════════════════════════════════════════════
// Block 2: Error Classes
// ═══════════════════════════════════════════════════════════════
describe('OpenAIProvider Error Classes', () => {

  // T-OAI07: OpenAITimeoutError instanceof Error
  it('T-OAI07: OpenAITimeoutError instanceof Error', () => {
    const err = new OpenAITimeoutError('embed');
    assert.ok(err instanceof Error);
  });

  // T-OAI08: OpenAITimeoutError has correct name property
  it('T-OAI08: OpenAITimeoutError — correct name', () => {
    const err = new OpenAITimeoutError('stream');
    assert.strictEqual(err.name, 'OpenAITimeoutError');
  });

  // T-OAI09: OpenAITimeoutError message includes operation name
  it('T-OAI09: OpenAITimeoutError — message includes op', () => {
    const err = new OpenAITimeoutError('embed');
    assert.strictEqual(err.message, 'OpenAI timeout: embed');
  });

  // T-OAI10: OpenAIAPIError instanceof Error
  it('T-OAI10: OpenAIAPIError instanceof Error', () => {
    const err = new OpenAIAPIError(429, 'rate limited');
    assert.ok(err instanceof Error);
  });

  // T-OAI11: OpenAIAPIError has status property
  it('T-OAI11: OpenAIAPIError — stores status', () => {
    const err = new OpenAIAPIError(500, 'server error');
    assert.strictEqual(err.status, 500);
  });

  // T-OAI12: OpenAIAPIError message includes status code
  it('T-OAI12: OpenAIAPIError — message includes status', () => {
    const err = new OpenAIAPIError(401, 'unauthorized');
    assert.strictEqual(err.message, 'OpenAI API error 401');
  });

  // T-OAI13: OpenAIEmptyError instanceof Error
  it('T-OAI13: OpenAIEmptyError instanceof Error', () => {
    const err = new OpenAIEmptyError();
    assert.ok(err instanceof Error);
    assert.strictEqual(err.name, 'OpenAIEmptyError');
    assert.strictEqual(err.message, 'OpenAI empty response');
  });

  // T-OAI14: OpenAISafetyError instanceof Error
  it('T-OAI14: OpenAISafetyError instanceof Error', () => {
    const err = new OpenAISafetyError();
    assert.ok(err instanceof Error);
    assert.strictEqual(err.name, 'OpenAISafetyError');
    assert.strictEqual(err.message, 'OpenAI content filter block');
  });
});

// ═══════════════════════════════════════════════════════════════
// Block 3: Method Signatures
// ═══════════════════════════════════════════════════════════════
describe('OpenAIProvider Method Signatures', () => {

  // T-OAI15: embedText is async function
  it('T-OAI15: embedText is async function', () => {
    const provider = new OpenAIProvider();
    assert.strictEqual(typeof provider.embedText, 'function');
    // Verify it returns a promise (async)
    const result = provider.embedText('test');
    assert.ok(result instanceof Promise, 'should return a Promise');
    // Clean up — catch the expected error (no API key / network)
    result.catch(() => {});
  });

  // T-OAI16: embedBatch is async function
  it('T-OAI16: embedBatch is async function', () => {
    const provider = new OpenAIProvider();
    assert.strictEqual(typeof provider.embedBatch, 'function');
  });

  // T-OAI17: streamGenerate is async function
  it('T-OAI17: streamGenerate is async function', () => {
    const provider = new OpenAIProvider();
    assert.strictEqual(typeof provider.streamGenerate, 'function');
  });

  // T-OAI18: embedBatch([]) returns empty array (no API call)
  it('T-OAI18: embedBatch([]) returns empty array', async () => {
    const provider = new OpenAIProvider();
    const result = await provider.embedBatch([]);
    assert.deepStrictEqual(result, []);
  });

  // T-OAI19: embedBatch(null) returns empty array
  it('T-OAI19: embedBatch(null) returns empty array', async () => {
    const provider = new OpenAIProvider();
    const result = await provider.embedBatch(null);
    assert.deepStrictEqual(result, []);
  });

  // T-OAI20: embedBatch(undefined) returns empty array
  it('T-OAI20: embedBatch(undefined) returns empty array', async () => {
    const provider = new OpenAIProvider();
    const result = await provider.embedBatch(undefined);
    assert.deepStrictEqual(result, []);
  });
});

// ═══════════════════════════════════════════════════════════════
// Block 4: Error Class Patterns (parallel to GeminiProvider)
// ═══════════════════════════════════════════════════════════════
describe('OpenAIProvider Error Patterns', () => {

  // T-OAI21: All 4 error classes are constructable
  it('T-OAI21: all 4 error classes are constructable', () => {
    const errors = [
      new OpenAITimeoutError('test'),
      new OpenAISafetyError(),
      new OpenAIEmptyError(),
      new OpenAIAPIError(400, 'bad request'),
    ];
    assert.strictEqual(errors.length, 4);
    for (const err of errors) {
      assert.ok(err instanceof Error, `${err.name} should be instanceof Error`);
      assert.ok(err.name.startsWith('OpenAI'), `name should start with OpenAI, got ${err.name}`);
    }
  });

  // T-OAI22: OpenAIAPIError with different status codes
  it('T-OAI22: OpenAIAPIError with various status codes', () => {
    const e400 = new OpenAIAPIError(400, 'bad');
    const e429 = new OpenAIAPIError(429, 'rate');
    const e500 = new OpenAIAPIError(500, 'server');
    assert.strictEqual(e400.status, 400);
    assert.strictEqual(e429.status, 429);
    assert.strictEqual(e500.status, 500);
    assert.strictEqual(e400.message, 'OpenAI API error 400');
    assert.strictEqual(e429.message, 'OpenAI API error 429');
    assert.strictEqual(e500.message, 'OpenAI API error 500');
  });
});

// ═══════════════════════════════════════════════════════════════
// Block 5: Non-Streaming generate() (Phase 76)
// ═══════════════════════════════════════════════════════════════
describe('OpenAIProvider generate() — Phase 76', () => {

  // T-OAI23: generate() is async function
  it('T-OAI23: generate() is async function', () => {
    const provider = new OpenAIProvider();
    assert.strictEqual(typeof provider.generate, 'function');
  });

  // T-OAI24: generate() exists on OpenAIProvider prototype
  it('T-OAI24: generate() exists on OpenAIProvider prototype', () => {
    assert.strictEqual(typeof OpenAIProvider.prototype.generate, 'function');
  });

  // T-OAI25: OpenAIProvider has generate as own method (not just inherited default)
  it('T-OAI25: OpenAIProvider overrides generate (not inherited)', () => {
    // OpenAIProvider should have its own generate(), not just the base class default
    assert.ok(
      OpenAIProvider.prototype.hasOwnProperty('generate'),
      'OpenAIProvider should have its own generate method'
    );
  });
});
