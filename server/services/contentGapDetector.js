// server/services/contentGapDetector.js
// ═══════════════════════════════════════════════════════════════
// ContentGapDetector — Phase 38
// In-memory ring buffer + keyword-based clustering to detect
// questions the library cannot answer well.
// Clusters questions by Jaccard keyword overlap.
// Zero overhead when disabled (CONTENT_GAPS.enabled: false).
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';
import { logger } from './logger.js';
import { gapPersister } from './gapPersister.js';
import { featureFlags } from './featureFlags.js';

// ── Arabic + English stop words (hardcoded — no external dependency) ──
const STOP_WORDS = new Set([
  // Arabic
  'في', 'من', 'على', 'إلى', 'عن', 'مع', 'هذا', 'هذه', 'ذلك', 'تلك',
  'التي', 'الذي', 'الذين', 'اللذان', 'اللتان', 'هو', 'هي', 'هم', 'هن',
  'أنا', 'نحن', 'أنت', 'أنتم', 'أنتن', 'كان', 'كانت', 'يكون', 'تكون',
  'ما', 'ماذا', 'لماذا', 'كيف', 'متى', 'أين', 'هل', 'لا', 'نعم',
  'أو', 'و', 'ثم', 'لكن', 'بل', 'حتى', 'إذا', 'لو', 'أن', 'إن',
  'قد', 'لم', 'لن', 'سوف', 'كل', 'بعض', 'غير', 'بين', 'عند', 'بعد',
  'قبل', 'فوق', 'تحت', 'أمام', 'خلف', 'حول', 'منذ', 'خلال', 'ضد',
  'ال', 'لل', 'فيها', 'فيه', 'منها', 'منه', 'عليه', 'عليها', 'به', 'بها',
  'له', 'لها', 'لهم', 'وهو', 'وهي', 'هناك', 'ذات', 'ذو', 'يا', 'أي',
  'كما', 'مثل', 'حيث', 'إلا', 'فقط', 'أيضا', 'جدا', 'عبر', 'وفي',
  'ايش', 'إيش', 'شو', 'وين', 'ليش', 'ليه', 'ازاي', 'إزاي',
  // English
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'can', 'shall', 'must', 'to', 'of', 'in',
  'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through',
  'during', 'before', 'after', 'above', 'below', 'between', 'out',
  'up', 'down', 'and', 'but', 'or', 'nor', 'not', 'so', 'yet',
  'if', 'then', 'else', 'when', 'where', 'why', 'how', 'what',
  'which', 'who', 'whom', 'this', 'that', 'these', 'those', 'it',
  'its', 'he', 'she', 'they', 'them', 'we', 'you', 'me', 'him',
  'her', 'my', 'your', 'his', 'our', 'their', 'all', 'each',
  'every', 'both', 'few', 'more', 'most', 'some', 'any', 'no',
  'about', 'also', 'just', 'than', 'very', 'too', 'only',
]);

class ContentGapDetector {
  #enabled;
  #maxGapEntries;
  #minFrequencyToShow;
  #clusterThreshold;
  #lowScoreThreshold;
  #entries;       // ring buffer: [{ message, reason, sessionId, avgScore, timestamp }]
  #clusters;      // Map<clusterKey, { keywords: Set<string>, count: number, samples: string[], lastSeen: number }>
  #clusterIdSeq;  // auto-increment cluster ID

  constructor() {
    const cfg = config.CONTENT_GAPS ?? {};
    this.#enabled            = cfg.enabled === true;
    this.#maxGapEntries      = cfg.maxGapEntries ?? 200;
    this.#minFrequencyToShow = cfg.minFrequencyToShow ?? 2;
    this.#clusterThreshold   = cfg.clusterThreshold ?? 0.6;
    this.#lowScoreThreshold  = cfg.lowScoreThreshold ?? 0.45;
    this.#entries            = [];
    this.#clusters           = new Map();
    this.#clusterIdSeq       = 0;

    if (this.#enabled) {
      logger.info('contentGapDetector', `initialized (maxEntries: ${this.#maxGapEntries}, clusterThreshold: ${this.#clusterThreshold})`);
    }
  }

  /** Whether gap detection is active (dynamic — reads from featureFlags). */
  get enabled() {
    return featureFlags.isEnabled('CONTENT_GAPS');
  }

  /** The low score threshold (exposed for listener). */
  get lowScoreThreshold() {
    return this.#lowScoreThreshold;
  }

  /**
   * Records a gap entry.
   * @param {{ message: string, reason: string, sessionId?: string, avgScore?: number }} data
   */
  record(data) {
    if (!this.enabled) return;
    if (!data || !data.message) return;

    const entry = {
      message:   data.message,
      reason:    data.reason || 'unknown',
      sessionId: data.sessionId || null,
      avgScore:  typeof data.avgScore === 'number' ? data.avgScore : null,
      timestamp: Date.now(),
    };

    // Ring buffer — evict oldest when full
    this.#entries.push(entry);
    while (this.#entries.length > this.#maxGapEntries) {
      this.#entries.shift();
    }

    // Assign to cluster
    this.#assignToCluster(entry);

    // Persist entry to disk (Phase 39)
    gapPersister.scheduleWrite(entry);
  }

  /**
   * Returns top content gaps sorted by count (descending).
   * Filters by minFrequencyToShow.
   * @param {number} [limit=20]
   * @returns {Array<{ keywords: string[], count: number, samples: string[], lastSeen: number }>}
   */
  getGaps(limit = 20) {
    if (!this.enabled) return [];

    const gaps = [];
    for (const [, cluster] of this.#clusters) {
      if (cluster.count >= this.#minFrequencyToShow) {
        gaps.push({
          keywords: [...cluster.keywords],
          count:    cluster.count,
          samples:  cluster.samples.slice(0, 3), // max 3 samples per cluster
          lastSeen: cluster.lastSeen,
        });
      }
    }

    // Sort by count descending, then by lastSeen descending
    gaps.sort((a, b) => b.count - a.count || b.lastSeen - a.lastSeen);

    return gaps.slice(0, limit);
  }

  /**
   * Restores gap entries from persisted data (Phase 39).
   * Rebuilds the ring buffer and clusters from an array of entries.
   * Does NOT call gapPersister.scheduleWrite() — avoids re-persisting restored data.
   * @param {Array<object>} entries — array of persisted entry objects
   */
  restoreFromEntries(entries) {
    if (!this.enabled || !Array.isArray(entries)) return;

    let restoredCount = 0;
    for (const raw of entries) {
      if (!raw || !raw.message) continue;

      const entry = {
        message:   raw.message,
        reason:    raw.reason || 'unknown',
        sessionId: raw.sessionId || null,
        avgScore:  typeof raw.avgScore === 'number' ? raw.avgScore : null,
        timestamp: raw.timestamp || Date.now(),
      };

      this.#entries.push(entry);
      this.#assignToCluster(entry);
      restoredCount++;
    }

    // Enforce ring buffer limit
    while (this.#entries.length > this.#maxGapEntries) {
      this.#entries.shift();
    }

    if (restoredCount > 0) {
      logger.info('contentGapDetector', `restored ${restoredCount} entries (${this.#clusters.size} clusters)`);
    }
  }

  /**
   * Summary for inspect endpoint.
   * @returns {{ enabled: boolean, totalEntries: number, clusterCount: number, visibleGaps: number }}
   */
  counts() {
    if (!this.enabled) {
      return { enabled: false, totalEntries: 0, clusterCount: 0, visibleGaps: 0 };
    }
    let visibleGaps = 0;
    for (const [, cluster] of this.#clusters) {
      if (cluster.count >= this.#minFrequencyToShow) visibleGaps++;
    }
    return {
      enabled:      this.enabled,
      totalEntries: this.#entries.length,
      clusterCount: this.#clusters.size,
      visibleGaps,
    };
  }

  // ── Private: assign entry to nearest cluster or create new ──
  #assignToCluster(entry) {
    const keywords = this.#extractKeywords(entry.message);
    if (keywords.size === 0) return;

    let bestClusterKey = null;
    let bestScore      = 0;

    for (const [key, cluster] of this.#clusters) {
      const score = this.#overlapScore(keywords, cluster.keywords);
      if (score > bestScore) {
        bestScore      = score;
        bestClusterKey = key;
      }
    }

    if (bestScore >= this.#clusterThreshold && bestClusterKey !== null) {
      // Merge into existing cluster
      const cluster = this.#clusters.get(bestClusterKey);
      cluster.count++;
      cluster.lastSeen = entry.timestamp;
      // Add new keywords to cluster
      for (const kw of keywords) {
        cluster.keywords.add(kw);
      }
      // Add sample (max 5 unique samples)
      if (cluster.samples.length < 5 && !cluster.samples.includes(entry.message)) {
        cluster.samples.push(entry.message);
      }
    } else {
      // Create new cluster
      const key = `cluster_${++this.#clusterIdSeq}`;
      this.#clusters.set(key, {
        keywords: new Set(keywords),
        count:    1,
        samples:  [entry.message],
        lastSeen: entry.timestamp,
      });
    }

    // Cluster eviction: when clusters exceed maxGapEntries * 4, prune 20% oldest
    const maxClusters = this.#maxGapEntries * 4;
    if (this.#clusters.size > maxClusters) {
      const sorted = [...this.#clusters.entries()].sort((a, b) => a[1].lastSeen - b[1].lastSeen);
      const removeCount = Math.floor(this.#clusters.size * 0.2);
      for (let i = 0; i < removeCount; i++) {
        this.#clusters.delete(sorted[i][0]);
      }
    }
  }

  // ── Private: extract keywords from text ──
  #extractKeywords(text) {
    if (!text || typeof text !== 'string') return new Set();

    // Remove punctuation, normalize whitespace
    const cleaned = text
      .replace(/[.,،؟?!؛:;()\[\]{}"'`~@#$%^&*+=<>|\\\/\-_]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();

    const tokens = cleaned.split(' ');
    const keywords = new Set();

    for (const token of tokens) {
      // Skip short tokens (length <= 2) and stop words
      if (token.length <= 2) continue;
      if (STOP_WORDS.has(token)) continue;
      keywords.add(token);
    }

    return keywords;
  }

  // ── Private: Jaccard similarity ──
  #overlapScore(setA, setB) {
    if (setA.size === 0 || setB.size === 0) return 0;

    let intersectionSize = 0;
    // Iterate over smaller set for efficiency
    const [smaller, larger] = setA.size <= setB.size ? [setA, setB] : [setB, setA];
    for (const item of smaller) {
      if (larger.has(item)) intersectionSize++;
    }

    const unionSize = setA.size + setB.size - intersectionSize;
    return unionSize === 0 ? 0 : intersectionSize / unionSize;
  }
}

// ── Singleton instance ─────────────────────────────────────────
const contentGapDetector = new ContentGapDetector();

export { ContentGapDetector, contentGapDetector };
