// server/services/answerGroundingChecker.js
// ═══════════════════════════════════════════════════════════════
// AnswerGroundingChecker — Phase 69 (Singleton #32)
// Post-generation validation: checks that the LLM answer is
// actually grounded in the provided RAG context.
// Uses token overlap between answer claims and context —
// zero API calls, zero cost, in-memory only.
// Feature-gated via featureFlags.isEnabled('GROUNDING').
// Zero overhead when disabled.
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';
import { featureFlags } from './featureFlags.js';
import { tokenizeLight, splitSentences } from './arabicNlp.js';

// ── Internal overlap threshold for a claim to be "grounded" ───
const CLAIM_OVERLAP_THRESHOLD = 0.3;

class AnswerGroundingChecker {

  /** Feature flag gate */
  get enabled() {
    return featureFlags.isEnabled('GROUNDING');
  }

  /**
   * Checks how well the answer is grounded in the provided context.
   * @param {string} answer — the LLM-generated answer text
   * @param {string} contextText — the RAG context that was fed to the LLM
   * @returns {{ score: number, totalClaims: number, groundedClaims: number, ungroundedClaims: string[], flags: string[] }}
   */
  check(answer, contextText) {
    if (!this.enabled) {
      return { score: 1, totalClaims: 0, groundedClaims: 0, ungroundedClaims: [], flags: [] };
    }

    if (!answer || typeof answer !== 'string' || answer.trim().length === 0) {
      return { score: 1, totalClaims: 0, groundedClaims: 0, ungroundedClaims: [], flags: [] };
    }

    const maxClaims = Math.max(1, Math.min(config.GROUNDING?.maxClaimsToCheck ?? 10, 20));

    // ── Extract claims from the answer ─────────────────────
    const claims = this.#extractClaims(answer, maxClaims);

    if (claims.length === 0) {
      return { score: 1, totalClaims: 0, groundedClaims: 0, ungroundedClaims: [], flags: [] };
    }

    // ── Tokenize context once ──────────────────────────────
    const contextTokens = this.#tokenize(contextText || '');

    // ── Check each claim against context ───────────────────
    let groundedCount = 0;
    const ungroundedClaims = [];

    for (const claim of claims) {
      const claimTokens = this.#tokenize(claim);
      if (claimTokens.size === 0) {
        groundedCount++; // Empty claim after stop word removal — consider grounded
        continue;
      }

      let overlap = 0;
      for (const token of claimTokens) {
        if (contextTokens.has(token)) overlap++;
      }

      const overlapRatio = overlap / claimTokens.size;
      if (overlapRatio >= CLAIM_OVERLAP_THRESHOLD) {
        groundedCount++;
      } else {
        ungroundedClaims.push(claim.slice(0, 150)); // Truncate for safety
      }
    }

    const score = claims.length > 0 ? Math.round((groundedCount / claims.length) * 10000) / 10000 : 1;
    const minScore = config.GROUNDING?.minGroundingScore ?? 0.4;
    const flags = score < minScore ? ['low_grounding'] : [];

    return {
      score,
      totalClaims: claims.length,
      groundedClaims: groundedCount,
      ungroundedClaims,
      flags,
    };
  }

  /**
   * Extracts factual claims from the answer text.
   * Splits on sentence boundaries, filters out questions and very short segments.
   * @param {string} text
   * @param {number} maxClaims
   * @returns {string[]}
   */
  #extractClaims(text, maxClaims) {
    // Split on sentence boundaries via shared arabicNlp utility
    const segments = splitSentences(text);

    // Filter out question sentences (they're not claims)
    const claims = segments.filter(s => {
      const trimmed = s.trim();
      return !trimmed.endsWith('؟') && !trimmed.endsWith('?') && !trimmed.startsWith('هل ') && !trimmed.startsWith('ما ') && !trimmed.startsWith('كيف ') && !trimmed.startsWith('لماذا ') && !trimmed.startsWith('أين ') && !trimmed.startsWith('متى ');
    });

    return claims.slice(0, maxClaims);
  }

  /**
   * Tokenizes text: removes diacritics, lowercases, splits on whitespace/punctuation, removes stop words.
   * Delegates to shared arabicNlp.tokenizeLight() — Phase 72.
   * @param {string} text
   * @returns {Set<string>}
   */
  #tokenize(text) {
    return tokenizeLight(text);
  }

  /** Summary for inspect endpoint. */
  counts() {
    return { enabled: this.enabled };
  }

  /** Reset — no-op (stateless singleton). */
  reset() {}
}

const answerGroundingChecker = new AnswerGroundingChecker();

export { AnswerGroundingChecker, answerGroundingChecker };
