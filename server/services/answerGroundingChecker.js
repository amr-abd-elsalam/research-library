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
import { tokenizeLight, splitSentences, cosineSimilarity } from './arabicNlp.js';
import { embedBatch } from './gemini.js';

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
   * @returns {Promise<{ score: number, totalClaims: number, groundedClaims: number, ungroundedClaims: string[], flags: string[], semanticUsed: boolean }>}
   */
  async check(answer, contextText) {
    if (!this.enabled) {
      return { score: 1, totalClaims: 0, groundedClaims: 0, ungroundedClaims: [], flags: [], semanticUsed: false };
    }

    if (!answer || typeof answer !== 'string' || answer.trim().length === 0) {
      return { score: 1, totalClaims: 0, groundedClaims: 0, ungroundedClaims: [], flags: [], semanticUsed: false };
    }

    const maxClaims = Math.max(1, Math.min(config.GROUNDING?.maxClaimsToCheck ?? 10, 20));

    // ── Extract claims from the answer ─────────────────────
    const claims = this.#extractClaims(answer, maxClaims);

    if (claims.length === 0) {
      return { score: 1, totalClaims: 0, groundedClaims: 0, ungroundedClaims: [], flags: [], semanticUsed: false };
    }

    // ── Tokenize context once ──────────────────────────────
    const contextTokens = this.#tokenize(contextText || '');

    // ── Compute token overlap for each claim ───────────────
    const claimOverlaps = [];
    const claimEmptyFlags = [];

    for (const claim of claims) {
      const claimTokens = this.#tokenize(claim);
      if (claimTokens.size === 0) {
        claimOverlaps.push(1); // Empty claim after stop word removal — consider grounded
        claimEmptyFlags.push(true);
        continue;
      }

      let overlap = 0;
      for (const token of claimTokens) {
        if (contextTokens.has(token)) overlap++;
      }

      claimOverlaps.push(overlap / claimTokens.size);
      claimEmptyFlags.push(false);
    }

    // ── Semantic matching (Phase 73) — feature-gated ───────
    let semanticUsed = false;
    if (featureFlags.isEnabled('SEMANTIC_MATCHING')) {
      const semConfig = config.SEMANTIC_MATCHING || {};
      try {
        const batchSize = semConfig.batchSize || 20;
        const tokenW = semConfig.tokenWeight ?? 0.5;
        const semanticW = semConfig.semanticWeight ?? 0.5;

        // Embed claims (up to batchSize, skip empty-flagged)
        const claimTexts = claims.slice(0, batchSize);
        const claimVecs = await embedBatch(claimTexts, 'RETRIEVAL_DOCUMENT');

        // Split context into chunks and embed
        const contextChunks = splitSentences(contextText || '', 20);
        const chunkVecs = await embedBatch(contextChunks.slice(0, batchSize), 'RETRIEVAL_DOCUMENT');

        // Blend scores for each claim
        for (let i = 0; i < claimTexts.length; i++) {
          if (claimEmptyFlags[i]) continue; // skip empty claims — already scored 1
          if (!claimVecs[i]) continue; // embed failed — keep token-only score
          let maxSemSim = 0;
          for (let j = 0; j < chunkVecs.length; j++) {
            if (!chunkVecs[j]) continue;
            const sim = cosineSimilarity(claimVecs[i], chunkVecs[j]);
            if (sim > maxSemSim) maxSemSim = sim;
          }
          // Blend: replace token overlap with blended score
          claimOverlaps[i] = (tokenW * claimOverlaps[i]) + (semanticW * maxSemSim);
        }
        semanticUsed = true;
      } catch {
        if (semConfig.fallbackOnError !== false) {
          // Fallback — keep token-only scores (already computed)
          semanticUsed = false;
        } else {
          throw new Error('Semantic matching failed and fallbackOnError is disabled');
        }
      }
    }

    // ── Decide grounded/ungrounded per claim ───────────────
    let groundedCount = 0;
    const ungroundedClaims = [];

    for (let i = 0; i < claims.length; i++) {
      if (claimEmptyFlags[i]) {
        groundedCount++;
        continue;
      }
      if (claimOverlaps[i] >= CLAIM_OVERLAP_THRESHOLD) {
        groundedCount++;
      } else {
        ungroundedClaims.push(claims[i].slice(0, 150)); // Truncate for safety
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
      semanticUsed,
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
