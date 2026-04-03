// server/services/libraryIndex.js
// ═══════════════════════════════════════════════════════════════
// LibraryIndex — Phase 36
// Qdrant introspection singleton: scrolls the Qdrant collection
// and extracts metadata about library content (files, topics,
// point counts). Provides periodic auto-refresh and a counts()
// method for the inspect endpoint.
//
// Config: LIBRARY_INDEX.enabled (default false — opt-in)
//         LIBRARY_INDEX.refreshIntervalMs (default 3600000 = 1h)
//         LIBRARY_INDEX.includeFileList (default true)
//
// Uses scrollPoints() from qdrant.js with SCAN_LIMIT = 500.
// ═══════════════════════════════════════════════════════════════

import { scrollPoints, getCollectionInfo } from './qdrant.js';
import config from '../../config.js';
import { logger } from './logger.js';

const SCAN_LIMIT = 500;

class LibraryIndex {
  #enabled;
  #refreshIntervalMs;
  #includeFileList;
  #timer;
  #index;
  #refreshCount;

  constructor() {
    this.#enabled           = config.LIBRARY_INDEX?.enabled === true;
    this.#refreshIntervalMs = Math.max(config.LIBRARY_INDEX?.refreshIntervalMs ?? 3600000, 300000);
    this.#includeFileList   = config.LIBRARY_INDEX?.includeFileList !== false;
    this.#timer             = null;
    this.#index             = null;
    this.#refreshCount      = 0;
  }

  /** Whether library indexing is enabled. */
  get enabled() {
    return this.#enabled;
  }

  /**
   * Scrolls Qdrant collection and builds the library index.
   * Respects SCAN_LIMIT (500 points max per refresh).
   */
  async refresh() {
    if (!this.#enabled) return;

    // Get total points from collection info
    let totalPoints = 0;
    try {
      const info = await getCollectionInfo();
      totalPoints = info?.points_count ?? info?.vectors_count ?? 0;
    } catch (err) {
      logger.warn('libraryIndex', 'failed to get collection info', { error: err.message });
      return;
    }

    // Scroll through points
    const fileSet  = new Set();
    const topicMap = new Map();
    let scanned    = 0;
    let offset     = null;

    try {
      while (scanned < SCAN_LIMIT) {
        const batchLimit = Math.min(100, SCAN_LIMIT - scanned);
        const result = await scrollPoints({ offset, limit: batchLimit, withPayload: true });
        const points = result.points;

        if (!points || points.length === 0) break;

        for (const point of points) {
          const payload = point.payload || {};

          // Extract file_name
          if (payload.file_name) {
            fileSet.add(payload.file_name);
          }

          // Extract topic_id
          const topicId = payload.topic_id;
          if (topicId !== undefined && topicId !== null) {
            const key = String(topicId);
            topicMap.set(key, (topicMap.get(key) || 0) + 1);
          }
        }

        scanned += points.length;
        offset = result.next_page_offset;

        if (offset === null || offset === undefined) break;
      }
    } catch (err) {
      logger.warn('libraryIndex', 'scroll error during refresh', { error: err.message, scanned });
      // Continue with partial results
    }

    // Build index
    this.#index = {
      files:          this.#includeFileList ? [...fileSet] : [],
      fileCount:      fileSet.size,
      topics:         Object.fromEntries(topicMap),
      topicCount:     topicMap.size,
      totalPoints,
      scannedPoints:  scanned,
      lastRefresh:    Date.now(),
    };

    this.#refreshCount++;
    logger.info('libraryIndex', `refreshed: ${fileSet.size} files, ${topicMap.size} topics, ${totalPoints} points (scanned ${scanned})`);
  }

  /**
   * Starts periodic refresh timer.
   */
  startPeriodicRefresh() {
    if (!this.#enabled || this.#timer) return;

    this.#timer = setInterval(() => {
      this.refresh().catch(() => {});
    }, this.#refreshIntervalMs);

    // Don't prevent process exit
    if (this.#timer.unref) this.#timer.unref();

    logger.info('libraryIndex', `periodic refresh started (interval: ${this.#refreshIntervalMs}ms)`);
  }

  /**
   * Stops periodic refresh timer.
   */
  stopPeriodicRefresh() {
    if (this.#timer) {
      clearInterval(this.#timer);
      this.#timer = null;
    }
  }

  /**
   * Returns a shallow copy of the current index, or null if not refreshed yet.
   * @returns {object|null}
   */
  getIndex() {
    if (!this.#index) return null;
    return { ...this.#index };
  }

  /**
   * Summary for inspect endpoint.
   * @returns {object}
   */
  counts() {
    return {
      enabled:      this.#enabled,
      hasIndex:     this.#index !== null,
      fileCount:    this.#index?.fileCount ?? 0,
      topicCount:   this.#index?.topicCount ?? 0,
      totalPoints:  this.#index?.totalPoints ?? 0,
      refreshCount: this.#refreshCount,
      timerActive:  this.#timer !== null,
    };
  }
}

// ── Singleton instance ─────────────────────────────────────────
const libraryIndex = new LibraryIndex();

export { LibraryIndex, libraryIndex };
