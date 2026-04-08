// server/services/llmProvider.js
// ═══════════════════════════════════════════════════════════════
// LLM Provider Abstraction Layer — Phase 74 (Singleton #35)
// Provides a swappable interface for LLM providers (Gemini, OpenAI, etc.)
// The registry manages named providers with lazy instantiation.
// Default provider comes from config.LLM_PROVIDER.provider.
// Zero behavior change — GeminiProvider wraps existing gemini.js logic.
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';
import { logger } from './logger.js';

/**
 * Base class for LLM providers.
 * All methods throw by default — providers must override them.
 */
class LLMProvider {
  /** @returns {string} provider name */
  get name() { throw new Error('LLMProvider.name must be overridden'); }

  /** @returns {number} embedding vector dimensions */
  get embeddingDimensions() { throw new Error('LLMProvider.embeddingDimensions must be overridden'); }

  /** @returns {string} embedding model name */
  get embeddingModel() { throw new Error('LLMProvider.embeddingModel must be overridden'); }

  /** @returns {string} generation model name */
  get generationModel() { throw new Error('LLMProvider.generationModel must be overridden'); }

  /**
   * Embeds a single text.
   * @param {string} text
   * @param {string} [taskType='RETRIEVAL_QUERY']
   * @returns {Promise<number[]>} embedding vector
   */
  async embedText(text, taskType = 'RETRIEVAL_QUERY') {
    throw new Error('LLMProvider.embedText() must be overridden');
  }

  /**
   * Embeds multiple texts. Graceful per-item failure (null).
   * @param {string[]} texts
   * @param {string} [taskType='RETRIEVAL_DOCUMENT']
   * @returns {Promise<(number[]|null)[]>}
   */
  async embedBatch(texts, taskType = 'RETRIEVAL_DOCUMENT') {
    throw new Error('LLMProvider.embedBatch() must be overridden');
  }

  /**
   * Streams a generation. Calls onChunk(text) for each delta.
   * @param {string} systemPrompt
   * @param {string} context
   * @param {Array} history
   * @param {string} question
   * @param {Function} onChunk — (text: string) => void
   * @returns {Promise<{finishReason: string|null}>}
   */
  async streamGenerate(systemPrompt, context, history, question, onChunk) {
    throw new Error('LLMProvider.streamGenerate() must be overridden');
  }

  /**
   * Non-streaming generation. Returns full response + actual token usage.
   * Default implementation: wraps streamGenerate() with accumulator.
   * Providers SHOULD override with native non-streaming API for efficiency + actual usage.
   * @param {string} systemPrompt
   * @param {string} context
   * @param {Array} history
   * @param {string} question
   * @returns {Promise<{ text: string, usage: { inputTokens: number, outputTokens: number }, finishReason: string|null }>}
   */
  async generate(systemPrompt, context, history, question) {
    let text = '';
    const result = await this.streamGenerate(systemPrompt, context, history, question, (chunk) => { text += chunk; });
    return { text, usage: { inputTokens: 0, outputTokens: 0 }, finishReason: result?.finishReason ?? null };
  }
}

/**
 * Registry for LLM providers.
 * Manages named providers with lazy instantiation.
 */
class LLMProviderRegistry {
  /** @type {Map<string, Function>} name → factory */
  #factories = new Map();
  /** @type {Map<string, LLMProvider>} name → lazily instantiated instance */
  #instances = new Map();

  /**
   * Registers a provider factory.
   * @param {string} name — provider name (e.g. 'gemini', 'openai')
   * @param {Function} factory — () => LLMProvider instance
   */
  register(name, factory) {
    if (!name || typeof name !== 'string') throw new Error('Provider name must be a non-empty string');
    if (typeof factory !== 'function') throw new Error('Provider factory must be a function');
    this.#factories.set(name.toLowerCase(), factory);
    // Clear cached instance if re-registering
    this.#instances.delete(name.toLowerCase());
    logger.debug('llmProvider', `registered provider: ${name}`);
  }

  /**
   * Returns a provider instance (lazily created).
   * @param {string} [name] — provider name. Defaults to config.LLM_PROVIDER.provider.
   * @returns {LLMProvider}
   */
  get(name) {
    const resolvedName = (name || config.LLM_PROVIDER?.provider || 'gemini').toLowerCase();

    // Return cached instance if available
    if (this.#instances.has(resolvedName)) {
      return this.#instances.get(resolvedName);
    }

    // Create instance from factory
    const factory = this.#factories.get(resolvedName);
    if (!factory) {
      throw new Error(`LLM provider '${resolvedName}' not registered. Available: ${[...this.#factories.keys()].join(', ') || 'none'}`);
    }

    const instance = factory();
    this.#instances.set(resolvedName, instance);
    logger.info('llmProvider', `instantiated provider: ${resolvedName} (${instance.embeddingModel} + ${instance.generationModel})`);
    return instance;
  }

  /**
   * Checks if a provider is registered.
   * @param {string} name
   * @returns {boolean}
   */
  has(name) {
    return this.#factories.has((name || '').toLowerCase());
  }

  /**
   * Summary for inspect endpoint.
   * @returns {{ activeProvider: string, registeredCount: number, registered: string[], embeddingModel: string|null, generationModel: string|null, embeddingDimensions: number|null }}
   */
  counts() {
    const activeName = (config.LLM_PROVIDER?.provider || 'gemini').toLowerCase();
    const activeInstance = this.#instances.get(activeName);
    return {
      activeProvider:      activeName,
      registeredCount:     this.#factories.size,
      registered:          [...this.#factories.keys()],
      embeddingModel:      activeInstance?.embeddingModel ?? null,
      generationModel:     activeInstance?.generationModel ?? null,
      embeddingDimensions: activeInstance?.embeddingDimensions ?? null,
    };
  }

  /**
   * Resets all state. For testing only.
   */
  reset() {
    this.#factories.clear();
    this.#instances.clear();
  }
}

// ── Singleton instance ─────────────────────────────────────────
const llmProviderRegistry = new LLMProviderRegistry();

export { LLMProvider, LLMProviderRegistry, llmProviderRegistry };
