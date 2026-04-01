// server/services/metrics.js
// ═══════════════════════════════════════════════════════════════
// MetricsCollector — Phase 14
// In-memory metrics aggregation: counters, histograms, gauges.
// Fed by metricsListener via EventBus. Read by /api/admin/metrics.
// Zero dependencies — standalone module.
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';

class MetricsCollector {
  #counters    = new Map();   // Map<name, Map<serializedLabels, number>>
  #histograms  = new Map();   // Map<name, Map<serializedLabels, number[]>>
  #gauges      = new Map();   // Map<name, number>
  #collectedSince = new Date().toISOString();
  #maxWindow;

  constructor() {
    this.#maxWindow = config.PIPELINE?.metricsWindow ?? 2000;
  }

  // ── Guard: skip if metrics disabled ──────────────────────────
  get #enabled() {
    return config.PIPELINE?.metricsEnabled !== false;
  }

  // ── Labels → deterministic string key ────────────────────────
  #serializeLabels(labels) {
    if (!labels || typeof labels !== 'object') return '[]';
    const entries = Object.entries(labels).sort();
    return entries.length === 0 ? '[]' : JSON.stringify(entries);
  }

  // ── Counter ──────────────────────────────────────────────────
  /**
   * Increments a counter by delta (default 1).
   * @param {string} name   — metric name (e.g. 'requests_total')
   * @param {object} [labels={}] — dimensional labels (e.g. { type: 'pipeline' })
   * @param {number} [delta=1]   — increment amount
   */
  increment(name, labels = {}, delta = 1) {
    if (!this.#enabled) return;

    if (!this.#counters.has(name)) {
      this.#counters.set(name, new Map());
    }
    const bucket = this.#counters.get(name);
    const key = this.#serializeLabels(labels);
    bucket.set(key, (bucket.get(key) || 0) + delta);
  }

  // ── Histogram ────────────────────────────────────────────────
  /**
   * Records an observation in a histogram.
   * @param {string} name      — metric name (e.g. 'stage_duration_ms')
   * @param {number} value     — observed value (e.g. 145)
   * @param {object} [labels={}] — dimensional labels (e.g. { stage: 'stageEmbed' })
   */
  observe(name, value, labels = {}) {
    if (!this.#enabled) return;
    if (typeof value !== 'number' || Number.isNaN(value)) return;

    if (!this.#histograms.has(name)) {
      this.#histograms.set(name, new Map());
    }
    const bucket = this.#histograms.get(name);
    const key = this.#serializeLabels(labels);

    if (!bucket.has(key)) {
      bucket.set(key, []);
    }
    const values = bucket.get(key);

    // Insert in sorted position (binary search insert)
    let lo = 0, hi = values.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (values[mid] < value) lo = mid + 1;
      else hi = mid;
    }
    values.splice(lo, 0, value);

    // Sliding window compaction: keep most recent half when exceeding maxWindow
    if (values.length > this.#maxWindow) {
      const removeCount = Math.floor(this.#maxWindow / 2);
      values.splice(0, removeCount);
    }
  }

  // ── Gauge ────────────────────────────────────────────────────
  /**
   * Sets a gauge to an absolute value.
   * @param {string} name  — metric name (e.g. 'active_requests')
   * @param {number} value — current value
   */
  set(name, value) {
    if (!this.#enabled) return;
    this.#gauges.set(name, value);
  }

  // ── Percentile helper ────────────────────────────────────────
  #percentile(sortedValues, p) {
    if (!sortedValues || sortedValues.length === 0) return 0;
    const idx = Math.floor(sortedValues.length * p);
    return sortedValues[Math.min(idx, sortedValues.length - 1)];
  }

  // ── Snapshot ─────────────────────────────────────────────────
  /**
   * Returns a JSON-safe snapshot of all collected metrics.
   * @returns {object}
   */
  snapshot() {
    if (!this.#enabled) {
      return { counters: {}, histograms: {}, gauges: {}, collected_since: this.#collectedSince };
    }

    // Counters
    const counters = {};
    for (const [name, bucket] of this.#counters) {
      counters[name] = {};
      for (const [key, count] of bucket) {
        counters[name][key] = count;
      }
    }

    // Histograms (compute percentiles)
    const histograms = {};
    for (const [name, bucket] of this.#histograms) {
      histograms[name] = {};
      for (const [key, values] of bucket) {
        const sum = values.reduce((a, b) => a + b, 0);
        histograms[name][key] = {
          count: values.length,
          sum:   Math.round(sum * 100) / 100,
          p50:   Math.round(this.#percentile(values, 0.50) * 100) / 100,
          p95:   Math.round(this.#percentile(values, 0.95) * 100) / 100,
          p99:   Math.round(this.#percentile(values, 0.99) * 100) / 100,
        };
      }
    }

    // Gauges
    const gauges = {};
    for (const [name, value] of this.#gauges) {
      gauges[name] = value;
    }

    return {
      counters,
      histograms,
      gauges,
      collected_since: this.#collectedSince,
    };
  }

  // ── Counts (introspection) ───────────────────────────────────
  /**
   * Returns summary counts for system introspection.
   * Lighter than snapshot() — no data, just overview.
   * @returns {{ counterNames: number, histogramNames: number, gaugeNames: number, enabled: boolean }}
   */
  counts() {
    return {
      counterNames:   this.#counters.size,
      histogramNames: this.#histograms.size,
      gaugeNames:     this.#gauges.size,
      enabled:        this.#enabled,
    };
  }

  // ── Reset (testing) ──────────────────────────────────────────
  /**
   * Clears all metrics. Intended for testing only.
   */
  reset() {
    this.#counters.clear();
    this.#histograms.clear();
    this.#gauges.clear();
    this.#collectedSince = new Date().toISOString();
  }
}

// ── Singleton instance ─────────────────────────────────────────
const metrics = new MetricsCollector();

export { MetricsCollector, metrics };
