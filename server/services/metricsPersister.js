// server/services/metricsPersister.js
// ═══════════════════════════════════════════════════════════════
// MetricsSnapshotPersister — Phase 23
// Periodically persists MetricsCollector snapshot + OperationalLog
// entries to disk as JSON. Restores on bootstrap for data
// continuity across restarts.
// File-based, zero external dependencies.
// Zero overhead when disabled (snapshotEnabled: false).
// ═══════════════════════════════════════════════════════════════

import { readFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { atomicWriteFile } from './atomicWrite.js';
import { metrics }        from './metrics.js';
import { operationalLog } from './operationalLog.js';
import { logger }         from './logger.js';
import config             from '../../config.js';

class MetricsSnapshotPersister {
  #enabled;
  #intervalMs;
  #filePath;
  #timer      = null;
  #lastSavedAt = null;

  constructor() {
    const cfg        = config.PIPELINE ?? {};
    this.#enabled    = cfg.snapshotEnabled === true;
    this.#intervalMs = Math.max(cfg.snapshotIntervalMs ?? 300_000, 60_000); // min 1 minute
    this.#filePath   = resolve(cfg.snapshotPath ?? './data/metrics-snapshot.json');
  }

  // ═══════════════════════════════════════════════════════════
  // Public API
  // ═══════════════════════════════════════════════════════════

  /**
   * Attempts to restore metrics + operational log from a previously saved snapshot.
   * Called during bootstrap — before service checks.
   * @returns {Promise<boolean>} true if restored successfully
   */
  async restore() {
    if (!this.#enabled) return false;

    try {
      const raw  = await readFile(this.#filePath, 'utf-8');
      const data = JSON.parse(raw);

      if (!data || typeof data !== 'object') return false;

      // Restore metrics counters
      if (data.metricsSnapshot) {
        metrics.restore(data.metricsSnapshot);
        logger.info('metricsPersister', `restored metrics snapshot from ${data.savedAt ?? 'unknown'}`, {
          counterNames: Object.keys(data.metricsSnapshot.counters ?? {}).length,
        });
      }

      // Restore operational log entries
      if (Array.isArray(data.operationalLogEntries) && data.operationalLogEntries.length > 0) {
        operationalLog.restore(data.operationalLogEntries);
        logger.info('metricsPersister', `restored ${data.operationalLogEntries.length} operational log entries`);
      }

      return true;

    } catch (err) {
      if (err.code === 'ENOENT') {
        // First run — no snapshot yet. Not an error.
        return false;
      }
      logger.warn('metricsPersister', 'restore failed', { error: err.message });
      return false;
    }
  }

  /**
   * Starts periodic snapshot persistence.
   * Called after bootstrap completes successfully.
   */
  start() {
    if (!this.#enabled) return;
    if (this.#timer) return; // already started

    this.#timer = setInterval(() => {
      this.flush().catch(() => {}); // fire-and-forget
    }, this.#intervalMs);
    this.#timer.unref(); // don't prevent process exit

    logger.info('metricsPersister', `started — interval ${this.#intervalMs}ms, path ${this.#filePath}`);
  }

  /**
   * Writes current metrics snapshot + operational log entries to disk.
   * Called periodically by timer and once during graceful shutdown.
   * @returns {Promise<void>}
   */
  async flush() {
    if (!this.#enabled) return;

    try {
      const data = {
        savedAt:               new Date().toISOString(),
        metricsSnapshot:       metrics.snapshot(),
        operationalLogEntries: operationalLog.dump(),
      };

      // Write atomically: temp file + rename (crash-safe)
      await atomicWriteFile(this.#filePath, JSON.stringify(data));

      this.#lastSavedAt = data.savedAt;

    } catch (err) {
      logger.warn('metricsPersister', 'flush failed', { error: err.message });
    }
  }

  /**
   * Stops periodic persistence. For graceful shutdown.
   */
  stop() {
    if (this.#timer) {
      clearInterval(this.#timer);
      this.#timer = null;
    }
  }

  /**
   * Summary for inspect endpoint.
   * @returns {{ enabled: boolean, intervalMs: number, filePath: string, lastSavedAt: string|null }}
   */
  counts() {
    return {
      enabled:     this.#enabled,
      intervalMs:  this.#intervalMs,
      filePath:    this.#filePath,
      lastSavedAt: this.#lastSavedAt,
    };
  }
}

// ── Singleton instance ─────────────────────────────────────────
const metricsPersister = new MetricsSnapshotPersister();

export { MetricsSnapshotPersister, metricsPersister };
