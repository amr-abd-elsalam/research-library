const MAX_SIZE = 1000;

class Cache {
  #store  = new Map();
  #hits   = 0;
  #misses = 0;
  #currentLibraryVersion = null;

  get(key) {
    if (!this.#store.has(key)) {
      this.#misses++;
      return null;
    }

    const entry = this.#store.get(key);

    // ── Expired ────────────────────────────────────────────────
    if (Date.now() > entry.expiresAt) {
      this.#store.delete(key);
      this.#misses++;
      return null;
    }

    // ── Phase 41: stale cache entry — library version mismatch ─
    if (this.#currentLibraryVersion !== null && entry.libraryVersion !== undefined && entry.libraryVersion !== this.#currentLibraryVersion) {
      this.#store.delete(key);
      this.#misses++;
      return null;
    }

    // ── LRU: move to end ───────────────────────────────────────
    this.#store.delete(key);
    this.#store.set(key, entry);

    this.#hits++;
    return entry.value;
  }

  set(key, value, ttlSeconds = 3600) {
    // ── LRU eviction ──────────────────────────────────────────
    if (this.#store.size >= MAX_SIZE) {
      const oldest = this.#store.keys().next().value;
      this.#store.delete(oldest);
    }

    // ── LRU: move to end if exists ────────────────────────────
    if (this.#store.has(key)) {
      this.#store.delete(key);
    }

    this.#store.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
      libraryVersion: this.#currentLibraryVersion,
    });
  }

  delete(key) {
    this.#store.delete(key);
  }

  purgeExpired() {
    const now = Date.now();
    for (const [key, entry] of this.#store) {
      if (now > entry.expiresAt) {
        this.#store.delete(key);
      }
    }
  }

  stats() {
    const total   = this.#hits + this.#misses;
    const hitRate = total === 0
      ? '0.00%'
      : `${((this.#hits / total) * 100).toFixed(2)}%`;
    return {
      size:     this.#store.size,
      hits:     this.#hits,
      misses:   this.#misses,
      hit_rate: hitRate,
    };
  }

  /**
   * Sets the current library version. Called by cacheListener on library:changed.
   * @param {string} version
   */
  setLibraryVersion(version) {
    this.#currentLibraryVersion = version;
  }

  /**
   * Clears all cache entries. Called by cacheListener on library:changed.
   * @returns {number} number of entries cleared
   */
  invalidateAll() {
    const size = this.#store.size;
    this.#store.clear();
    return size;
  }

  /**
   * Returns the current library version tag.
   * @returns {string|null}
   */
  getVersion() {
    return this.#currentLibraryVersion;
  }
}

// ── Singleton ──────────────────────────────────────────────────
const cache = new Cache();

// ── Cleanup every 10 minutes ───────────────────────────────────
const timer = setInterval(() => cache.purgeExpired(), 10 * 60 * 1000);
timer.unref();

export { cache };
