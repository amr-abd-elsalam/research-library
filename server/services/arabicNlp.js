// server/services/arabicNlp.js
// ═══════════════════════════════════════════════════════════════
// Arabic NLP Shared Utilities — Phase 72
// Shared Arabic text processing functions used by:
//   - AnswerGroundingChecker (Phase 69)
//   - CitationMapper (Phase 71)
// NOT a singleton — stateless exported functions (same pattern as atomicWrite.js).
// Zero dependencies on EventBus, config, or any other service.
// ═══════════════════════════════════════════════════════════════

// ── Arabic diacritics removal regex ────────────────────────────
// Broad range covering full tashkeel spectrum.
// Source: Identical regex from AnswerGroundingChecker (Phase 69) + CitationMapper (Phase 71).
const DIACRITICS_RE = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E4\u06E7\u06E8\u06EA-\u06ED]/g;

// ── Stop words (Arabic + English) ──────────────────────────────
// Identical list from AnswerGroundingChecker + CitationMapper (union — both were already identical).
const STOP_WORDS = new Set([
  // Arabic
  'من', 'في', 'على', 'إلى', 'الى', 'عن', 'مع', 'هذا', 'هذه', 'ذلك', 'تلك',
  'التي', 'الذي', 'اللذان', 'اللتان', 'الذين', 'اللاتي', 'اللواتي',
  'أن', 'إن', 'ان', 'كان', 'كانت', 'يكون', 'تكون',
  'هو', 'هي', 'هم', 'هن', 'أنت', 'أنا', 'نحن',
  'لا', 'لم', 'لن', 'قد', 'ما', 'كل', 'بعض', 'أي',
  'أو', 'و', 'ثم', 'بل', 'لكن',
  'بين', 'حول', 'عند', 'بعد', 'قبل', 'خلال', 'منذ',
  // English
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
  'of', 'in', 'to', 'for', 'on', 'with', 'at', 'by', 'from',
  'and', 'or', 'but', 'not', 'this', 'that', 'it',
]);

/**
 * Removes Arabic diacritics (tashkeel) from text.
 * @param {string} text
 * @returns {string}
 */
export function removeDiacritics(text) {
  if (!text || typeof text !== 'string') return '';
  return text.replace(DIACRITICS_RE, '');
}

/**
 * Normalizes Arabic text for improved matching.
 * NOT used by consumers in Phase 72 — available for future phases.
 * - Alef variants (أ إ آ) → bare alef (ا)
 * - Taa marbuta (ة) → haa (ه)
 * - Alef maqsura (ى) → yaa (ي)
 * - Waw hamza (ؤ) → waw (و)
 * - Yaa hamza (ئ) → yaa (ي)
 * @param {string} text
 * @returns {string}
 */
export function normalizeArabic(text) {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي');
}

/**
 * Full tokenization pipeline WITH Arabic normalization.
 * Pipeline: diacritics removal → normalization → lowercase → split → filter stops + short tokens.
 * Available for future use — NOT used by consumers in Phase 72 (they use tokenizeLight).
 * @param {string} text
 * @returns {Set<string>}
 */
export function tokenize(text) {
  if (!text || typeof text !== 'string') return new Set();
  const cleaned = normalizeArabic(removeDiacritics(text))
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ');
  const tokens = cleaned
    .split(/\s+/)
    .filter(t => t.length >= 2 && !STOP_WORDS.has(t));
  return new Set(tokens);
}

/**
 * Light tokenization pipeline WITHOUT Arabic normalization.
 * Pipeline: diacritics removal → lowercase → split → filter stops + short tokens.
 * EXACT same behavior as the inline #tokenize() in AnswerGroundingChecker + CitationMapper.
 * Used by consumers in Phase 72 to ensure ZERO behavior change.
 * @param {string} text
 * @returns {Set<string>}
 */
export function tokenizeLight(text) {
  if (!text || typeof text !== 'string') return new Set();
  const cleaned = removeDiacritics(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ');
  const tokens = cleaned
    .split(/\s+/)
    .filter(t => t.length >= 2 && !STOP_WORDS.has(t));
  return new Set(tokens);
}

/**
 * Splits text into sentences on common delimiters.
 * Filters out segments shorter than minLength.
 * @param {string} text
 * @param {number} [minLength=10] — minimum segment length to include
 * @returns {string[]}
 */
export function splitSentences(text, minLength = 10) {
  if (!text || typeof text !== 'string') return [];
  return text
    .split(/[.\n؟?!]+/)
    .map(s => s.trim())
    .filter(s => s.length >= minLength);
}

/**
 * Computes cosine similarity between two equal-length number arrays.
 * Used for comparing embedding vectors.
 * @param {number[]} vecA
 * @param {number[]} vecB
 * @returns {number} similarity score (0-1, clamped)
 */
export function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length || vecA.length === 0) return 0;
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dot  += vecA[i] * vecB[i];
    magA += vecA[i] * vecA[i];
    magB += vecB[i] * vecB[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  if (denom === 0) return 0;
  return Math.max(0, Math.min(1, dot / denom));
}

// Export STOP_WORDS for consumers that need direct access
export { STOP_WORDS };
