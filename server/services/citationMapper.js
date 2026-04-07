// server/services/citationMapper.js
// ═══════════════════════════════════════════════════════════════
// CitationMapper — Phase 71 (Singleton #34)
// Maps each sentence in the LLM answer to its nearest source
// chunk via token overlap. Computes per-source relevance scores.
// Zero API calls — pure in-memory tokenization + comparison.
// Feature-gated via featureFlags.isEnabled('CITATION').
// Stateless — no internal buffer, no reset needed.
// Zero overhead when CITATION disabled.
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';
import { featureFlags } from './featureFlags.js';
import { tokenizeLight, splitSentences as nlpSplitSentences } from './arabicNlp.js';

class CitationMapper {

  /** Feature flag gate */
  get enabled() {
    return featureFlags.isEnabled('CITATION');
  }

  /**
   * Maps answer sentences to source chunks + computes source relevance.
   * @param {string} answer — full LLM answer text
   * @param {Array<{ file: string, section: string, snippet: string, content: string, score: number }>} sources — from pipeline ctx.sources
   * @param {string} contextText — the full RAG context text (from ctx.context)
   * @returns {{ citations: Array<{ sentenceIndex: number, sourceIndex: number, overlap: number }>, sourceRelevance: Array<{ sourceIndex: number, relevance: number }> }}
   */
  map(answer, sources, contextText) {
    if (!this.enabled) {
      return { citations: [], sourceRelevance: [] };
    }
    if (!answer || !sources || sources.length === 0) {
      return { citations: [], sourceRelevance: [] };
    }

    const maxCitations = config.CITATION?.maxCitations ?? 5;
    const minOverlap   = config.CITATION?.minOverlap ?? 0.2;

    // Split answer into sentences
    const sentences = this.#splitSentences(answer);
    if (sentences.length === 0) {
      return { citations: [], sourceRelevance: this.#computeSourceRelevance(sources) };
    }

    // Tokenize each source content
    const sourceTokenSets = sources.map(s => this.#tokenize(s.content || s.snippet || ''));

    // Map each sentence to best matching source
    const rawCitations = [];
    for (let si = 0; si < sentences.length; si++) {
      const sentenceTokens = this.#tokenize(sentences[si]);
      if (sentenceTokens.size === 0) continue;

      let bestSourceIndex = -1;
      let bestOverlap = 0;

      for (let ji = 0; ji < sourceTokenSets.length; ji++) {
        const sourceTokens = sourceTokenSets[ji];
        if (sourceTokens.size === 0) continue;

        let matchCount = 0;
        for (const token of sentenceTokens) {
          if (sourceTokens.has(token)) matchCount++;
        }
        const overlap = matchCount / sentenceTokens.size;

        if (overlap > bestOverlap) {
          bestOverlap = overlap;
          bestSourceIndex = ji;
        }
      }

      if (bestSourceIndex >= 0 && bestOverlap >= minOverlap) {
        rawCitations.push({
          sentenceIndex: si,
          sourceIndex: bestSourceIndex,
          overlap: Math.round(bestOverlap * 10000) / 10000,
        });
      }
    }

    // Limit to maxCitations — keep highest overlap
    const citations = rawCitations
      .sort((a, b) => b.overlap - a.overlap)
      .slice(0, maxCitations)
      .sort((a, b) => a.sentenceIndex - b.sentenceIndex); // Re-sort by position in answer

    // Compute per-source relevance (independent of citations)
    const sourceRelevance = this.#computeSourceRelevance(sources);

    return { citations, sourceRelevance };
  }

  /**
   * Computes relevance of each source.
   * Uses source score from Qdrant as primary signal (already normalized 0-1).
   * @param {Array<{ score: number }>} sources
   * @returns {Array<{ sourceIndex: number, relevance: number }>}
   */
  #computeSourceRelevance(sources) {
    return sources.map((s, i) => ({
      sourceIndex: i,
      relevance: Math.round((s.score || 0) * 10000) / 10000,
    }));
  }

  /**
   * Split text into sentences.
   * Delegates to shared arabicNlp.splitSentences() — Phase 72.
   */
  #splitSentences(text) {
    return nlpSplitSentences(text);
  }

  /**
   * Arabic-aware tokenization.
   * Delegates to shared arabicNlp.tokenizeLight() — Phase 72.
   */
  #tokenize(text) {
    return tokenizeLight(text);
  }

  /** Summary for inspect endpoint. */
  counts() {
    return { enabled: this.enabled };
  }

  /** Reset — no-op (stateless). */
  reset() { /* no-op */ }
}

const citationMapper = new CitationMapper();

export { CitationMapper, citationMapper };
