// server/services/dynamicWelcomeSuggestions.js
// ═══════════════════════════════════════════════════════════════
// DynamicWelcomeSuggestions — Phase 59 (Singleton #29)
// Generates welcome page suggestions from library content + click analytics.
// Read-only — reads from LibraryIndex + SuggestionsEngine, writes nothing.
// Feature-gated: SUGGESTIONS (via featureFlags) + LIBRARY_INDEX (via libraryIndex.enabled).
// Caches results for 5 minutes. Invalidated on library:changed event.
// Zero overhead when disabled — returns [] immediately.
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';
import { featureFlags } from './featureFlags.js';
import { libraryIndex } from './libraryIndex.js';
import { suggestionsEngine } from './suggestionsEngine.js';

const CACHE_TTL_MS = 300000; // 5 minutes

class DynamicWelcomeSuggestions {
  #cache = null;
  #lastRefreshedAt = 0;

  /** Whether dynamic suggestions are active (requires SUGGESTIONS flag + library index). */
  get enabled() {
    return featureFlags.isEnabled('SUGGESTIONS') && libraryIndex.enabled;
  }

  /**
   * Returns dynamic welcome suggestions. Cached for 5 minutes.
   * Falls back to [] when disabled or no data available.
   * @returns {string[]}
   */
  generate() {
    if (!this.enabled) return [];

    // Return cached if fresh
    if (this.#cache && (Date.now() - this.#lastRefreshedAt) < CACHE_TTL_MS) {
      return this.#cache;
    }

    return this.#rebuild();
  }

  /**
   * Invalidates the cache. Called on library:changed event.
   */
  invalidate() {
    this.#cache = null;
    this.#lastRefreshedAt = 0;
  }

  /**
   * Summary for inspect endpoint.
   * @returns {{ enabled: boolean, cachedCount: number, lastRefreshedAt: string|null }}
   */
  counts() {
    return {
      enabled: this.enabled,
      cachedCount: this.#cache?.length ?? 0,
      lastRefreshedAt: this.#lastRefreshedAt > 0
        ? new Date(this.#lastRefreshedAt).toISOString()
        : null,
    };
  }

  /**
   * Resets all state. For testing only.
   */
  reset() {
    this.#cache = null;
    this.#lastRefreshedAt = 0;
  }

  // ═══════════════════════════════════════════════════════════
  // Private — rebuild logic
  // ═══════════════════════════════════════════════════════════

  #rebuild() {
    const maxSuggestions = config.SUGGESTIONS?.maxSuggestions ?? 3;
    const suggestions = [];
    const seen = new Set();

    // ── Source 1: Top clicked suggestions (highest priority) ──
    try {
      const clickData = suggestionsEngine.getClickCounts();
      if (clickData.top && clickData.top.length > 0) {
        for (const item of clickData.top) {
          if (item.text && !seen.has(item.text)) {
            suggestions.push(item.text);
            seen.add(item.text);
          }
          if (suggestions.length >= maxSuggestions) break;
        }
      }
    } catch { /* ignore — suggestions engine may not be ready */ }

    // ── Source 2: Library topic-based questions ────────────────
    if (suggestions.length < maxSuggestions) {
      try {
        const topicNames = libraryIndex.getTopicNames();
        for (const topic of topicNames) {
          const q = `ما أهم المواضيع في قسم ${topic}؟`;
          if (!seen.has(q)) {
            suggestions.push(q);
            seen.add(q);
          }
          if (suggestions.length >= maxSuggestions) break;
        }
      } catch { /* ignore — library index may not be ready */ }
    }

    // ── Source 3: File name-based suggestions ─────────────────
    if (suggestions.length < maxSuggestions) {
      try {
        const index = libraryIndex.getIndex();
        if (index && Array.isArray(index.files) && index.files.length > 0) {
          for (const file of index.files) {
            const name = typeof file === 'string'
              ? file.replace(/\.(pdf|docx|md|txt)$/i, '')
              : '';
            if (name && name.length > 1) {
              const q = `ملخص عن ${name}`;
              if (!seen.has(q)) {
                suggestions.push(q);
                seen.add(q);
              }
            }
            if (suggestions.length >= maxSuggestions) break;
          }
        }
      } catch { /* ignore — library index may not be ready */ }
    }

    // ── Cache and return ──────────────────────────────────────
    this.#cache = suggestions.slice(0, maxSuggestions);
    this.#lastRefreshedAt = Date.now();
    return this.#cache;
  }
}

// ── Singleton instance ─────────────────────────────────────────
const dynamicWelcomeSuggestions = new DynamicWelcomeSuggestions();

export { DynamicWelcomeSuggestions, dynamicWelcomeSuggestions };
