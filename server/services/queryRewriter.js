// ═══════════════════════════════════════════════════════════════
// queryRewriter.js — Follow-up detection + query rewriting
// Detects contextual questions and rewrites them for better RAG retrieval
// ═══════════════════════════════════════════════════════════════

import { estimateTokens } from './costTracker.js';
import { llmProviderRegistry } from './llmProvider.js';
import config from '../../config.js';

// ── Follow-up detection patterns ───────────────────────────────
const FOLLOWUP_SIGNALS = [
  {
    name: 'pronoun_reference',
    weight: 3,
    patterns: [
      'ده', 'هذا', 'هذه', 'هذي', 'دي', 'فيها', 'فيه', 'منها', 'منه',
      'عنه', 'عنها', 'عليه', 'عليها', 'فيهم', 'منهم', 'عنهم',
      'بها', 'به', 'لها', 'له', 'إليه', 'إليها',
    ],
  },
  {
    name: 'continuation_word',
    weight: 3,
    patterns: [
      'طيب و', 'وماذا عن', 'وإيه', 'وايه', 'وهل', 'بالإضافة',
      'كمان', 'وبالنسبة', 'وماذا', 'ايضا', 'أيضا', 'أيضاً',
      'وكمان', 'وإلا', 'وبعدين',
    ],
  },
  {
    name: 'comparative_back_ref',
    weight: 2,
    patterns: [
      'أكتر', 'اكتر', 'أكثر', 'اكثر', 'أقل', 'اقل',
      'بالتفصيل', 'باختصار', 'وضّح', 'وضح', 'فصّل', 'فصل',
      'اشرح', 'بتوسع',
    ],
  },
  {
    name: 'ellipsis_style',
    weight: 1,
    // Checked separately — starts with و or بس or لكن
    patterns: [],
    test: (normalized) => {
      return /^(و[^ا-ي]|بس |لكن )/.test(normalized) || normalized.startsWith('و ');
    },
  },
  {
    name: 'short_question',
    weight: 2,
    // Checked separately — message length < 20 after trim
    patterns: [],
    test: (normalized) => {
      return normalized.length > 0 && normalized.length < 20;
    },
  },
];

// ── detectFollowUp ─────────────────────────────────────────────
/**
 * Detects whether a question is a follow-up that needs context
 * from previous conversation. Pure keyword matching — zero API calls.
 *
 * @param {string} message — the user's current question
 * @returns {{ isFollowUp: boolean, confidence: number, signals: string[] }}
 */
export function detectFollowUp(message) {
  if (!message || typeof message !== 'string') {
    return { isFollowUp: false, confidence: 0, signals: [] };
  }

  const normalized = message.trim().toLowerCase();
  if (!normalized) {
    return { isFollowUp: false, confidence: 0, signals: [] };
  }

  let totalWeight = 0;
  const signals = [];

  for (const signal of FOLLOWUP_SIGNALS) {
    let matched = false;

    // Pattern-based signals (keyword matching)
    if (signal.patterns.length > 0) {
      for (const pattern of signal.patterns) {
        if (normalized.includes(pattern.toLowerCase())) {
          matched = true;
          break;
        }
      }
    }

    // Custom test function signals (ellipsis_style, short_question)
    if (!matched && typeof signal.test === 'function') {
      matched = signal.test(normalized);
    }

    if (matched) {
      totalWeight += signal.weight;
      signals.push(signal.name);
    }
  }

  const isFollowUp = totalWeight >= 2;
  const confidence = Math.min(totalWeight / 6, 1);

  return { isFollowUp, confidence, signals };
}

// ── rewriteQuery ───────────────────────────────────────────────
/**
 * Rewrites a follow-up question with conversation context using
 * a non-streaming Gemini API call.
 *
 * @param {string} message — the current question
 * @param {Array<{role: string, text: string}>} recentHistory — last N messages
 * @returns {Promise<{ rewritten: string, original: string, wasRewritten: boolean }>}
 */
export async function rewriteQuery(message, recentHistory) {
  const fallback = { rewritten: message, original: message, wasRewritten: false };

  // Guard: no history → nothing to rewrite from
  if (!Array.isArray(recentHistory) || recentHistory.length === 0) {
    return fallback;
  }

  const rewriteCfg = config.LLM_PROVIDER?.rewrite || {};
  const timeoutMs  = rewriteCfg.timeoutMs || config.FOLLOWUP?.rewriteTimeoutMs || 5000;

  // Build conversation string from recent history
  const historyText = recentHistory
    .map(h => {
      const role = h.role === 'model' ? 'المساعد' : 'المستخدم';
      return `${role}: ${h.text}`;
    })
    .join('\n');

  const systemPrompt = 'أنت مساعد إعادة صياغة. مهمتك الوحيدة هي إعادة صياغة السؤال الأخير ليكون مكتفياً بذاته.\nلا تجب على السؤال — فقط أعد صياغته.\nأرجع السؤال المُعاد صياغته فقط — بدون أي شرح أو مقدمة.';

  const question = `المحادثة السابقة:\n${historyText}\n\nالسؤال الأخير: ${message}\n\nأعد صياغة السؤال الأخير فقط في جملة واحدة واضحة ومكتفية بذاتها، بحيث يمكن فهمه بدون المحادثة السابقة.`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
    let provider;
    try {
      provider = llmProviderRegistry.get();
    } catch {
      console.warn('[queryRewriter] no LLM provider available — skipping rewrite');
      return fallback;
    }

    // Non-streaming generation (Phase 76 — faster, simpler, actual token usage)
    const result = await provider.generate(systemPrompt, '', [], question);

    const rewritten = result.text.trim();

    if (!rewritten || rewritten.length < 3) {
      console.warn('[queryRewriter] empty rewrite response — using original');
      return fallback;
    }

    // Log token usage estimate
    const inputTokens  = estimateTokens(systemPrompt + question);
    const outputTokens = estimateTokens(rewritten);
    console.log(`[queryRewriter] rewrite: "${message}" → "${rewritten}" (tokens: ~${inputTokens}in ~${outputTokens}out)`);

    return { rewritten, original: message, wasRewritten: true };

  } catch (err) {
    if (err.name === 'AbortError') {
      console.warn('[queryRewriter] rewrite timed out — using original');
    } else {
      console.warn('[queryRewriter] rewrite failed:', err.message, '— using original');
    }
    return fallback;

  } finally {
    clearTimeout(timer);
  }
}
