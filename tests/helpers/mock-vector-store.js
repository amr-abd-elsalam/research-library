// tests/helpers/mock-vector-store.js
// ═══════════════════════════════════════════════════════════════
// Phase 83 — MockVectorStore for Pipeline Integration Testing
// Provides configurable search results matching Qdrant hit shape.
// Includes buildHit() factory for creating realistic test fixtures.
// Used exclusively in tests — never imported by production code.
// ═══════════════════════════════════════════════════════════════

/**
 * Creates a realistic Qdrant hit object for testing.
 * @param {object} [overrides]
 * @param {number}   [overrides.score=0.85]
 * @param {string}   [overrides.fileName='test-doc.pdf']
 * @param {string}   [overrides.sectionTitle='القسم التجريبي']
 * @param {string[]} [overrides.sectionPath]
 * @param {string}   [overrides.content]
 * @param {string|null} [overrides.parentContent=null]
 * @param {object}   [overrides.extraPayload]
 * @returns {{ score: number, payload: object }}
 */
function buildHit(overrides = {}) {
  return {
    score: overrides.score ?? 0.85,
    payload: {
      file_name:     overrides.fileName ?? 'test-doc.pdf',
      section_title: overrides.sectionTitle ?? 'القسم التجريبي',
      section_path:  overrides.sectionPath ?? ['الفصل الأول', 'القسم التجريبي'],
      content:       overrides.content ?? 'هذا محتوى تجريبي يتعلق بالموضوع المطلوب ويحتوي على معلومات مفصلة.',
      parent_content: overrides.parentContent ?? null,
      ...(overrides.extraPayload || {}),
    },
  };
}

class MockVectorStore {
  /**
   * @param {object} [options]
   * @param {Array}   [options.defaultHits]
   * @param {boolean} [options.emptyMode=false]    — always return []
   * @param {boolean} [options.lowScoreMode=false]  — return hits with score < 0.30
   */
  constructor(options = {}) {
    this._defaultHits = options.defaultHits || [
      buildHit({ score: 0.92, fileName: 'doc1.pdf', sectionTitle: 'المقدمة', content: 'محتوى المقدمة الرئيسي يتضمن شرحاً وافياً للموضوع.' }),
      buildHit({ score: 0.85, fileName: 'doc2.pdf', sectionTitle: 'التفاصيل', content: 'محتوى تفصيلي عن الموضوع يشمل النقاط الرئيسية والفرعية.' }),
      buildHit({ score: 0.78, fileName: 'doc1.pdf', sectionTitle: 'الخاتمة', content: 'محتوى الخاتمة والنتائج والتوصيات النهائية.' }),
    ];
    this._calls = [];
    this._emptyMode    = options.emptyMode || false;
    this._lowScoreMode = options.lowScoreMode || false;
  }

  /**
   * Mock search matching qdrant.search() signature.
   * @param {number[]} vector
   * @param {number}   topK
   * @param {string|null} filter
   * @param {string|null} collection
   * @returns {Promise<Array>}
   */
  async search(vector, topK, filter, collection) {
    this._calls.push({ vector, topK, filter, collection, timestamp: Date.now() });
    if (this._emptyMode) return [];
    if (this._lowScoreMode) {
      return this._defaultHits.map(h => ({ ...h, score: 0.15, payload: { ...h.payload } })).slice(0, topK);
    }
    return this._defaultHits.slice(0, topK).map(h => ({ ...h, payload: { ...h.payload } }));
  }

  /** Returns copy of recorded search calls. */
  getCalls() { return [...this._calls]; }

  /** Returns search call count. */
  getCallCount() { return this._calls.length; }

  /** Replaces default hits. */
  setDefaultHits(hits) { this._defaultHits = hits; }

  /** Toggle empty mode (for abort/low-confidence tests). */
  setEmptyMode(enabled) { this._emptyMode = enabled; }

  /** Toggle low score mode (for abort tests). */
  setLowScoreMode(enabled) { this._lowScoreMode = enabled; }

  /** Clears calls and resets modes. */
  reset() {
    this._calls = [];
    this._emptyMode = false;
    this._lowScoreMode = false;
  }
}

export { MockVectorStore, buildHit };
