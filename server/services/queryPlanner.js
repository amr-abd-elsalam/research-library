// server/services/queryPlanner.js
// ═══════════════════════════════════════════════════════════════
// QueryPlanner — Phase 81 (Singleton #39)
// Multi-step query decomposition for complex questions.
// Analyzes comparative, analytical, and multi-part questions,
// splits them into focused sub-queries, executes parallel
// searches, and merges results with deduplication.
// Pattern-based decomposition — zero LLM cost.
// Feature-gated via featureFlags.isEnabled('QUERY_PLANNING').
// Zero overhead when disabled.
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';
import { featureFlags } from './featureFlags.js';
import { search } from './qdrant.js';
import { removeDiacritics, tokenize } from './arabicNlp.js';
import { logger } from './logger.js';

// ── Complexity level ordering (lowest → highest) ───────────────
const COMPLEXITY_LEVELS = ['factual', 'exploratory', 'comparative', 'analytical', 'multi_part'];

class QueryPlanner {
  #stats;

  constructor() {
    this.#stats = { planned: 0, skipped: 0 };
  }

  /** Dynamic enabled check via featureFlags. */
  get enabled() {
    return featureFlags.isEnabled('QUERY_PLANNING');
  }

  /**
   * Decides if the query needs multi-step planning.
   * @param {string} message — user message
   * @param {{ type: string, score: number, indicators: string[] }} complexity — from stageComplexityAnalysis
   * @returns {boolean}
   */
  shouldPlan(message, complexity) {
    if (!this.enabled) return false;
    if (!complexity || !complexity.type) return false;
    if (!message || typeof message !== 'string' || message.trim().length < 5) return false;

    const minLevel = config.QUERY_PLANNING?.minComplexityForPlan ?? 'comparative';
    const currentIdx = COMPLEXITY_LEVELS.indexOf(complexity.type);
    const minIdx = COMPLEXITY_LEVELS.indexOf(minLevel);

    if (currentIdx < 0 || minIdx < 0) return false;
    return currentIdx >= minIdx;
  }

  /**
   * Decomposes a complex question into sub-queries.
   * Pattern-based — no LLM call — zero cost.
   * @param {string} message
   * @param {{ type: string }} complexity
   * @returns {{ subQueries: string[], strategy: string }}
   */
  decompose(message, complexity) {
    if (!this.enabled || !message || !complexity) {
      this.#stats.skipped++;
      return { subQueries: [message || ''], strategy: 'single' };
    }

    const maxSub = Math.min(Math.max(config.QUERY_PLANNING?.maxSubQueries ?? 3, 1), 5);

    let result;
    switch (complexity.type) {
      case 'multi_part':
        result = this.#decomposeMultiPart(message, maxSub);
        break;
      case 'comparative':
        result = this.#decomposeComparative(message, maxSub);
        break;
      case 'analytical':
        result = this.#decomposeAnalytical(message, maxSub);
        break;
      default:
        result = { subQueries: [message], strategy: 'single' };
        break;
    }

    if (result.subQueries.length > 1) {
      this.#stats.planned++;
      logger.debug('queryPlanner', `decomposed into ${result.subQueries.length} sub-queries`, {
        type: complexity.type,
        strategy: result.strategy,
      });
    } else {
      this.#stats.skipped++;
    }

    return result;
  }

  /**
   * Executes parallel searches for multiple vectors and merges results.
   * @param {number[][]} vectors — embedding vectors for each sub-query
   * @param {number} topK — results per sub-query
   * @param {string|null} topicFilter
   * @param {string|null} collection
   * @returns {Promise<Array>} — merged and deduplicated hits
   */
  async searchAndMerge(vectors, topK, topicFilter, collection) {
    const strategy = config.QUERY_PLANNING?.mergeStrategy ?? 'interleave';
    const budgetRatio = Math.min(Math.max(config.QUERY_PLANNING?.budgetPerSubQuery ?? 0.6, 0.3), 1.0);
    const perQueryK = Math.max(3, Math.ceil(topK * budgetRatio));

    // Parallel search
    const searchPromises = vectors.map(vec => search(vec, perQueryK, topicFilter, collection));
    const allResults = await Promise.all(searchPromises);

    return this.merge(allResults, strategy, topK);
  }

  /**
   * Merges results from multiple searches.
   * @param {Array[]} resultSets — array of hit arrays
   * @param {string} strategy — 'interleave' | 'concatenate' | 'ranked'
   * @param {number} limit — max total results
   * @returns {Array} — merged hits, deduplicated
   */
  merge(resultSets, strategy, limit) {
    if (!resultSets || resultSets.length === 0) return [];
    if (resultSets.length === 1) return this.#dedup(resultSets[0]).slice(0, limit);

    switch (strategy) {
      case 'interleave':  return this.#mergeInterleave(resultSets, limit);
      case 'concatenate': return this.#mergeConcatenate(resultSets, limit);
      case 'ranked':      return this.#mergeRanked(resultSets, limit);
      default:            return this.#mergeInterleave(resultSets, limit);
    }
  }

  // ── Private decomposition methods ────────────────────────────

  /**
   * multi_part: splits on ؟ or ? — each part becomes a sub-query.
   */
  #decomposeMultiPart(message, maxSub) {
    const parts = message
      .split(/[؟?]/)
      .map(p => p.trim())
      .filter(p => p.length >= 5);

    if (parts.length <= 1) {
      return { subQueries: [message], strategy: 'single' };
    }

    return { subQueries: parts.slice(0, maxSub), strategy: 'interleave' };
  }

  /**
   * comparative: extracts "بين X و Y" pattern.
   */
  #decomposeComparative(message, maxSub) {
    // Look for "بين X و Y" or "بين X وY"
    const betweenMatch = message.match(/بين\s+(.+?)\s+و\s*(.+?)(?:\s*[؟?]|$)/);
    if (betweenMatch) {
      const partA = betweenMatch[1].trim();
      const partB = betweenMatch[2].trim();

      if (partA.length >= 2 && partB.length >= 2) {
        const subQueries = [
          `ما هو ${partA}؟`,
          `ما هو ${partB}؟`,
        ];
        if (subQueries.length < maxSub) {
          subQueries.push(message); // original question as context
        }
        return { subQueries: subQueries.slice(0, maxSub), strategy: 'interleave' };
      }
    }

    // Fallback: return original
    return { subQueries: [message], strategy: 'single' };
  }

  /**
   * analytical: keeps original + extracts keyword-based focused sub-queries.
   */
  #decomposeAnalytical(message, maxSub) {
    const subQueries = [message];

    // Use arabicNlp tokenize to find significant terms
    const tokens = tokenize(removeDiacritics(message));
    const significant = [...tokens].filter(t => t.length >= 3).slice(0, 2);

    for (const term of significant) {
      if (subQueries.length < maxSub) {
        subQueries.push(`ما هو ${term}؟`);
      }
    }

    return { subQueries, strategy: 'ranked' };
  }

  // ── Private merge methods ────────────────────────────────────

  /**
   * Interleave: round-robin from each set, skip duplicates.
   */
  #mergeInterleave(resultSets, limit) {
    const merged = [];
    const seen = new Set();
    const maxLen = Math.max(...resultSets.map(s => s.length));

    for (let i = 0; i < maxLen && merged.length < limit; i++) {
      for (const set of resultSets) {
        if (i >= set.length || merged.length >= limit) continue;
        const hit = set[i];
        const key = this.#hitKey(hit);
        if (!seen.has(key)) {
          seen.add(key);
          merged.push(hit);
        }
      }
    }

    return merged;
  }

  /**
   * Concatenate: flatten + sort by score descending, skip duplicates.
   */
  #mergeConcatenate(resultSets, limit) {
    const all = resultSets.flat();
    all.sort((a, b) => (b.score || 0) - (a.score || 0));
    return this.#dedup(all).slice(0, limit);
  }

  /**
   * Ranked: each hit gets combined score = original_score × (1 / (position + 1)).
   * Higher position penalty → results appearing early in multiple sets rank higher.
   */
  #mergeRanked(resultSets, limit) {
    const scoreMap = new Map(); // key → { hit, combinedScore }

    for (const set of resultSets) {
      for (let i = 0; i < set.length; i++) {
        const hit = set[i];
        const key = this.#hitKey(hit);
        const positionWeight = 1 / (i + 1);
        const score = (hit.score || 0) * positionWeight;

        if (scoreMap.has(key)) {
          const existing = scoreMap.get(key);
          existing.combinedScore += score;
        } else {
          scoreMap.set(key, { hit, combinedScore: score });
        }
      }
    }

    const sorted = [...scoreMap.values()]
      .sort((a, b) => b.combinedScore - a.combinedScore)
      .map(entry => entry.hit);

    return sorted.slice(0, limit);
  }

  // ── Deduplication helper ─────────────────────────────────────

  /**
   * Returns a unique key for a hit (by point id or content prefix).
   */
  #hitKey(hit) {
    if (hit.id !== undefined && hit.id !== null) return String(hit.id);
    return (hit.payload?.content || '').slice(0, 100);
  }

  /**
   * Removes duplicate hits by key.
   */
  #dedup(hits) {
    const seen = new Set();
    return hits.filter(hit => {
      const key = this.#hitKey(hit);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  // ── Inspect + Reset ──────────────────────────────────────────

  /**
   * Summary for inspect endpoint.
   * @returns {{ enabled: boolean, totalPlanned: number, totalSkipped: number }}
   */
  counts() {
    return {
      enabled: this.enabled,
      totalPlanned: this.#stats.planned,
      totalSkipped: this.#stats.skipped,
    };
  }

  /**
   * Resets internal state. For test isolation.
   */
  reset() {
    this.#stats = { planned: 0, skipped: 0 };
  }
}

// ── Singleton instance ─────────────────────────────────────────
const queryPlanner = new QueryPlanner();

export { QueryPlanner, queryPlanner };
