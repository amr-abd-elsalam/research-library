// server/services/queryRouter.js
// ═══════════════════════════════════════════════════════════════
// Keyword-based query classifier — zero API calls
// Classifies user questions into types to select the best
// system prompt and retrieval strategy
// ═══════════════════════════════════════════════════════════════

// ── Query Types ────────────────────────────────────────────────
// factual    — direct question expecting a specific answer
// summary    — broad or overview question
// comparison — comparing two or more things
// definition — "what is X" style questions
// list       — "list/enumerate/what are the types" questions
// opinion    — subjective or recommendation questions
// meta       — questions about the system itself

const PATTERNS = [
  {
    type: 'comparison',
    keywords: [
      'الفرق', 'فرق', 'مقارنة', 'قارن', 'بالمقارنة', 'مقابل',
      'أفضل من', 'افضل من', 'أيهما', 'ايهما', 'ام ', 'أم ',
      'بينما', 'عكس', 'يختلف', 'اختلاف', 'تختلف', 'versus', 'vs',
    ],
    weight: 2,
  },
  {
    type: 'definition',
    keywords: [
      'ما هو', 'ما هي', 'ماهو', 'ماهي', 'تعريف', 'معنى',
      'يعني ايه', 'يعني إيه', 'المقصود', 'شرح مفهوم',
      'what is', 'define',
    ],
    weight: 1,
  },
  {
    type: 'summary',
    keywords: [
      'ملخص', 'لخص', 'تلخيص', 'نظرة عامة', 'باختصار', 'اختصار',
      'شرح شامل', 'بشكل عام', 'عموما', 'عمومًا', 'إجمالي',
      'اجمالي', 'كل شيء عن', 'كل شي عن', 'overview', 'summarize',
    ],
    weight: 2,
  },
  {
    type: 'list',
    keywords: [
      'اذكر', 'أذكر', 'عدد', 'قائمة', 'أنواع', 'انواع',
      'ما هي أنواع', 'ما هي انواع', 'كم عدد', 'اسرد',
      'خطوات', 'مراحل', 'عناصر', 'مكونات', 'متطلبات',
      'list', 'enumerate', 'types of',
    ],
    weight: 1,
  },
  {
    type: 'opinion',
    keywords: [
      'رأيك', 'رايك', 'تنصح', 'أنصح', 'انصح', 'تقترح', 'اقتراح',
      'أحسن', 'احسن', 'هل يستحق', 'هل ينفع', 'هل يصلح',
      'recommend', 'suggest', 'should i',
    ],
    weight: 1,
  },
  {
    type: 'meta',
    keywords: [
      'كيف تعمل', 'كيف بتشتغل', 'إزاي', 'ازاي بتشتغل',
      'من أنت', 'من انت', 'مين انت', 'ايه المصادر', 'مصادرك',
      'who are you', 'how do you work',
    ],
    weight: 1,
  },
];

// ── Route a query ──────────────────────────────────────────────
/**
 * Classifies a user message into a query type.
 * Pure keyword matching — no API calls.
 *
 * @param {string} message — the user's question
 * @returns {{ type: string, confidence: number }}
 */
export function routeQuery(message) {
  if (!message || typeof message !== 'string') {
    return { type: 'factual', confidence: 0 };
  }

  const normalized = message.trim().toLowerCase();
  const scores = {};

  for (const pattern of PATTERNS) {
    let matchCount = 0;
    for (const kw of pattern.keywords) {
      if (normalized.includes(kw.toLowerCase())) {
        matchCount++;
      }
    }
    if (matchCount > 0) {
      scores[pattern.type] = (scores[pattern.type] || 0) + matchCount * pattern.weight;
    }
  }

  // Find highest scoring type
  let bestType = 'factual';
  let bestScore = 0;

  for (const [type, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestType = type;
      bestScore = score;
    }
  }

  // Confidence: 0 = no match (default factual), 1 = strong match
  const confidence = Math.min(bestScore / 4, 1);

  return { type: bestType, confidence };
}

/**
 * Returns suggested topK based on query type.
 * Summary/list questions benefit from more context.
 */
export function getTopK(queryType) {
  switch (queryType) {
    case 'summary':    return 8;
    case 'comparison': return 6;
    case 'list':       return 7;
    case 'definition': return 4;
    case 'factual':    return 5;
    case 'opinion':    return 5;
    case 'meta':       return 3;
    default:           return 5;
  }
}
