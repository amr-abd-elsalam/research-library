// server/services/searchReranker.js
// ═══════════════════════════════════════════════════════════════
// SearchReranker — Phase 63 (Singleton #30)
// Post-Qdrant re-ranking: keyword overlap + source diversity.
// Reads RETRIEVAL config section for weights and limits.
// Feature-gated via featureFlags.isEnabled('RETRIEVAL').
// Zero overhead when disabled — rerank() returns original hits.
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';
import { featureFlags } from './featureFlags.js';

class SearchReranker {
  #totalReranked = 0;

  /** Whether re-ranking is active (dynamic — reads from featureFlags). */
  get enabled() {
    return featureFlags.isEnabled('RETRIEVAL');
  }

  /**
   * Re-ranks search hits based on keyword overlap and source diversity.
   * Returns original order when disabled or when hits.length <= 1.
   * @param {Array<{score: number, payload: object}>} hits — Qdrant search results
   * @param {string} query — original or effective query message
   * @returns {Array<{score: number, payload: object}>} — re-ranked hits (same shape, potentially different order)
   */
  rerank(hits, query) {
    if (!this.enabled || !hits || hits.length <= 1) return hits;

    this.#totalReranked++;

    const cfg = config.RETRIEVAL ?? {};
    const kwWeight  = Math.max(0, Math.min(1, cfg.keywordWeight ?? 0.3));
    const divWeight = Math.max(0, Math.min(1, cfg.diversityWeight ?? 0.3));
    const vecWeight = Math.max(0, 1 - kwWeight - divWeight);
    const maxPerFile = Math.max(1, cfg.maxPerFile ?? 3);

    // Tokenize query for keyword matching
    const queryTokens = this.#tokenize(query);

    // Score each hit: combined = vecWeight * vectorScore + kwWeight * keywordScore
    const scored = hits.map((hit, idx) => {
      const vectorScore  = hit.score || 0;
      const keywordScore = kwWeight > 0 ? this.#keywordOverlap(queryTokens, hit.payload) : 0;
      const combinedScore = (vecWeight * vectorScore) + (kwWeight * keywordScore);

      return {
        hit,
        combinedScore,
        originalIdx: idx,
        fileName: hit.payload?.file_name || `__unknown_${idx}`,
      };
    });

    // Sort by combined score descending
    scored.sort((a, b) => b.combinedScore - a.combinedScore);

    // Diversity enforcement: limit per-file count
    const fileCounts = new Map();
    const primary   = [];
    const deferred  = [];

    for (const item of scored) {
      const count = fileCounts.get(item.fileName) || 0;
      if (count < maxPerFile) {
        fileCounts.set(item.fileName, count + 1);
        primary.push(item);
      } else {
        deferred.push(item);
      }
    }

    // Merge: primary (diverse) + deferred (excess from same file)
    const final = [...primary, ...deferred];

    return final.map(item => item.hit);
  }

  /**
   * Tokenizes text for keyword matching.
   * Removes Arabic diacritics, lowercases, splits on whitespace/punctuation, filters short tokens.
   * @param {string} text
   * @returns {Set<string>}
   */
  #tokenize(text) {
    if (!text) return new Set();
    const cleaned = text.replace(/[\u064B-\u065F\u0670]/g, '').toLowerCase();
    const tokens = cleaned.split(/[\s,.;:!?\-/()[\]{}"'،؛؟]+/).filter(t => t.length > 2);
    return new Set(tokens);
  }

  /**
   * Computes keyword overlap ratio between query tokens and hit payload text.
   * @param {Set<string>} queryTokens
   * @param {object} payload — Qdrant hit payload
   * @returns {number} 0-1 overlap ratio
   */
  #keywordOverlap(queryTokens, payload) {
    if (!queryTokens.size || !payload) return 0;
    const content = [
      payload.content || '',
      payload.parent_content || '',
      payload.section_title || '',
    ].join(' ');
    const contentLower = content.replace(/[\u064B-\u065F\u0670]/g, '').toLowerCase();

    let matches = 0;
    for (const token of queryTokens) {
      if (contentLower.includes(token)) matches++;
    }
    return matches / queryTokens.size;
  }

  /**
   * Summary for inspect endpoint.
   * @returns {{ enabled: boolean, totalReranked: number }}
   */
  counts() {
    return { enabled: this.enabled, totalReranked: this.#totalReranked };
  }

  /**
   * Resets internal state.
   */
  reset() {
    this.#totalReranked = 0;
  }
}

// ── Singleton instance ─────────────────────────────────────────
const searchReranker = new SearchReranker();

export { SearchReranker, searchReranker };
