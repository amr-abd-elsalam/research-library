// server/services/queryIntentClassifier.js
// ═══════════════════════════════════════════════════════════════
// QueryIntentClassifier — Phase 21
// Classifies user messages into intents before pipeline execution.
// Detects natural-language command intent (without / prefix),
// meta questions (about the platform), and search queries (RAG).
// Uses regex patterns + token scoring against CommandRegistry.
// Zero overhead when disabled.
// ═══════════════════════════════════════════════════════════════

import { commandRegistry } from './commandRegistry.js';
import { logger } from './logger.js';
import config from '../../config.js';

// ── Default natural language → command patterns ────────────────
const DEFAULT_NL_PATTERNS = [
  { pattern: /^(أعطيني|اعطني|عايز|اريد|أريد)\s+(ملخص|تلخيص)/i, command: '/ملخص' },
  { pattern: /^(أعطيني|اعطني|وريني|عرض|اعرض)\s+(المصادر|الملفات|مصادر|ملفات)/i, command: '/مصادر' },
  { pattern: /^(اعمل|سوي|سوّي|اختبرني|امتحنني|أسئلة)\s*(اختبار|امتحان|اختبارية)?/i, command: '/اختبار' },
  { pattern: /^(ساعدني|مساعدة|الأوامر|إيه الأوامر|ايش الاوامر|شو الأوامر)/i, command: '/مساعدة' },
];

// ── Default meta question patterns ─────────────────────────────
const DEFAULT_META_PATTERNS = [
  /^(ما هي|ايش|إيه|شو)\s+(المنصة|هذه المنصة|هذا الموقع)/i,
  /^(كيف|كيفية|ازاي)\s+(تعمل|يعمل|بتشتغل|تشتغل)/i,
  /^(كم|عدد)\s+(ملف|ملفات|مصدر|مصادر|موضوع)/i,
  /^(إيه|ما هي|ايش|شو)\s+(المواضيع|التصنيفات|الأقسام)\s*(المتاحة|الموجودة)?/i,
  /^(عن|حول)\s+(المكتبة|المنصة|الموقع)/i,
];

class QueryIntentClassifier {
  #enabled;
  #commandThreshold;
  #nlPatterns;
  #metaPatterns;

  constructor() {
    const cfg = config.PIPELINE?.intentClassifier ?? {};
    this.#enabled = cfg.enabled !== false;
    this.#commandThreshold = cfg.commandThreshold ?? 0.6;

    // Natural language patterns — merge config patterns with defaults
    const configPatterns = Array.isArray(cfg.patterns) ? cfg.patterns : [];
    this.#nlPatterns = configPatterns.length > 0
      ? configPatterns.map(p => ({
          pattern: p.pattern instanceof RegExp ? p.pattern : new RegExp(p.pattern, 'i'),
          command: p.command,
        }))
      : DEFAULT_NL_PATTERNS;

    this.#metaPatterns = DEFAULT_META_PATTERNS;
  }

  /**
   * Classifies user message intent.
   * @param {string} message — raw user message
   * @param {Array} [history=[]] — conversation history (reserved for future use)
   * @returns {{ intent: 'command'|'search'|'meta', confidence: number, commandMatch?: { command: object, commandName: string, matchType: string, originalMessage: string }, metadata?: object }}
   */
  classify(message, history = []) {
    if (!this.#enabled || !message || typeof message !== 'string') {
      return { intent: 'search', confidence: 1.0 };
    }

    const trimmed = message.trim();
    if (!trimmed) return { intent: 'search', confidence: 1.0 };

    // ── 1. Explicit command (starts with /) — fast bypass ────
    if (trimmed.startsWith('/')) {
      return { intent: 'command', confidence: 1.0 };
    }

    // ── 2. Natural language → command patterns (regex) ───────
    const nlMatch = this.#matchNaturalLanguage(trimmed);
    if (nlMatch && nlMatch.confidence >= this.#commandThreshold) {
      return {
        intent:       'command',
        confidence:   nlMatch.confidence,
        commandMatch: nlMatch,
      };
    }

    // ── 3. Token scoring against command registry ────────────
    const scoredMatch = this.#scoreAgainstCommands(trimmed);
    if (scoredMatch && scoredMatch.confidence >= this.#commandThreshold) {
      return {
        intent:       'command',
        confidence:   scoredMatch.confidence,
        commandMatch: scoredMatch,
      };
    }

    // ── 4. Meta question detection ───────────────────────────
    if (this.#isMetaQuery(trimmed)) {
      return { intent: 'meta', confidence: 0.8 };
    }

    // ── 5. Default: search intent ────────────────────────────
    return { intent: 'search', confidence: 1.0 };
  }

  // ── Natural language regex matching ──────────────────────────
  #matchNaturalLanguage(message) {
    for (const { pattern, command } of this.#nlPatterns) {
      if (pattern.test(message)) {
        const cmd = commandRegistry.match(command);
        if (cmd) {
          return {
            command:         cmd,
            commandName:     command,
            confidence:      0.85,
            matchType:       'natural_language',
            originalMessage: message,
          };
        }
      }
    }
    return null;
  }

  // ── Token scoring (inspired by Claude Code PortRuntime.route_prompt) ──
  #scoreAgainstCommands(message) {
    const tokens = new Set(
      message.toLowerCase().split(/\s+/).filter(t => t.length > 1)
    );
    if (tokens.size === 0) return null;

    const commands = commandRegistry.list();
    let bestScore   = 0;
    let bestCommand = null;

    for (const cmd of commands) {
      const haystack = [
        cmd.name.replace('/', ''),
        cmd.description,
        ...cmd.aliases.map(a => a.replace('/', '')),
      ].join(' ').toLowerCase();

      let hits = 0;
      for (const token of tokens) {
        if (haystack.includes(token)) hits++;
      }

      const score = hits / tokens.size;
      if (score > bestScore) {
        bestScore   = score;
        bestCommand = cmd;
      }
    }

    if (bestScore > 0 && bestCommand) {
      const resolved = commandRegistry.match(bestCommand.name);
      if (resolved) {
        return {
          command:         resolved,
          commandName:     bestCommand.name,
          confidence:      Math.min(bestScore, 0.95),
          matchType:       'token_scoring',
          originalMessage: message,
        };
      }
    }
    return null;
  }

  // ── Meta question detection ──────────────────────────────────
  #isMetaQuery(message) {
    return this.#metaPatterns.some(p => p.test(message));
  }

  /**
   * Returns summary for inspect endpoint.
   * @returns {{ enabled: boolean, commandThreshold: number, patternCount: number }}
   */
  counts() {
    return {
      enabled:          this.#enabled,
      commandThreshold: this.#commandThreshold,
      patternCount:     this.#nlPatterns.length,
    };
  }
}

// ── Singleton instance ─────────────────────────────────────────
const queryIntentClassifier = new QueryIntentClassifier();

export { QueryIntentClassifier, queryIntentClassifier };
