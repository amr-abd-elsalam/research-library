// server/services/featureFlags.js
// ═══════════════════════════════════════════════════════════════
// FeatureFlags — Phase 44 (Singleton #27)
// Centralized source of truth for feature enabled/disabled state.
// Priority: runtime override (from toggle-feature admin action)
//           → config value (from config.js deep-frozen object).
// Used by toggleable singletons instead of reading config directly.
// Emits 'feature:toggled' EventBus event on every setOverride().
// Zero overhead when no overrides are set.
// ═══════════════════════════════════════════════════════════════

import { mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { atomicWriteFile } from './atomicWrite.js';
import config from '../../config.js';
import { eventBus } from './eventBus.js';
import { logger } from './logger.js';

class FeatureFlags {
  /** @type {Map<string, boolean>} */
  #overrides = new Map();

  #persistEnabled;
  #filePath;
  #writeTimer = null;

  constructor() {
    this.#persistEnabled = config.FEATURE_FLAGS?.persistOverrides === true;
    this.#filePath = join(config.FEATURE_FLAGS?.overrideDir || './data/overrides', 'overrides.json');
  }

  /** Whether file persistence is active. */
  get persistEnabled() { return this.#persistEnabled; }

  // Section name → config path mapping (uppercase)
  #sectionPaths = {
    ADMIN_INTELLIGENCE: () => config.ADMIN_INTELLIGENCE?.enabled === true,
    SUGGESTIONS:        () => config.SUGGESTIONS?.enabled === true,
    CONTENT_GAPS:       () => config.CONTENT_GAPS?.enabled === true,
    FEEDBACK:           () => config.FEEDBACK?.enabled === true,
    QUALITY:            () => config.QUALITY?.enabled === true,
    HEALTH_SCORE:       () => config.HEALTH_SCORE?.enabled === true,
    RETRIEVAL:          () => config.RETRIEVAL?.rerankEnabled === true,
    QUERY_COMPLEXITY:   () => config.QUERY_COMPLEXITY?.enabled === true,
    GROUNDING:          () => config.GROUNDING?.enabled === true,
    CITATION:           () => config.CITATION?.enabled === true,
    SEMANTIC_MATCHING:  () => config.SEMANTIC_MATCHING?.enabled === true,
    COST_GOVERNANCE:    () => config.COST_GOVERNANCE?.enabled === true,
    ANSWER_REFINEMENT:  () => config.ANSWER_REFINEMENT?.enabled === true,
  };

  /**
   * Checks if a feature is enabled.
   * Priority: runtime override > config value.
   * @param {string} section — section name (case-insensitive, normalized to uppercase)
   * @returns {boolean}
   */
  isEnabled(section) {
    const upper = section.toUpperCase();
    if (this.#overrides.has(upper)) {
      return this.#overrides.get(upper);
    }
    const configCheck = this.#sectionPaths[upper];
    return configCheck ? configCheck() : false;
  }

  /**
   * Sets a runtime override for a feature.
   * Emits 'feature:toggled' EventBus event.
   * @param {string} section — section name
   * @param {boolean} enabled — new state
   */
  setOverride(section, enabled) {
    const upper = section.toUpperCase();
    const previousValue = this.isEnabled(upper);
    this.#overrides.set(upper, enabled);

    eventBus.emit('feature:toggled', {
      section: upper,
      enabled,
      previousValue,
      timestamp: Date.now(),
    });

    this.#scheduleWrite();
  }

  /**
   * Removes a runtime override (reverts to config value).
   * Emits 'feature:toggled' EventBus event (consistent with setOverride).
   * @param {string} section
   */
  clearOverride(section) {
    const upper = section.toUpperCase();
    const previousValue = this.isEnabled(upper);
    const hadOverride = this.#overrides.has(upper);
    this.#overrides.delete(upper);

    if (hadOverride) {
      const enabled = this.isEnabled(upper);
      eventBus.emit('feature:toggled', {
        section: upper,
        enabled,
        previousValue,
        timestamp: Date.now(),
      });
    }

    this.#scheduleWrite();
  }

  /**
   * Returns all current runtime overrides.
   * @returns {Object<string, boolean>}
   */
  getOverrides() {
    const result = {};
    for (const [key, value] of this.#overrides) {
      result[key] = value;
    }
    return result;
  }

  /**
   * Returns full status for all known feature sections:
   * config value + override value + effective (resolved) value.
   * @returns {Array<{ section: string, configValue: boolean, override: boolean|null, effective: boolean }>}
   */
  getStatus() {
    const sections = Object.keys(this.#sectionPaths);
    return sections.map(section => {
      const configValue = this.#sectionPaths[section]();
      const override = this.#overrides.has(section) ? this.#overrides.get(section) : null;
      return {
        section,
        configValue,
        override,
        effective: this.isEnabled(section),
      };
    });
  }

  /**
   * Summary for inspect endpoint.
   * @returns {{ totalOverrides: number, sections: number, persisted: boolean }}
   */
  counts() {
    return {
      totalOverrides: this.#overrides.size,
      sections:       Object.keys(this.#sectionPaths).length,
      persisted:      this.#persistEnabled,
    };
  }

  // ═══════════════════════════════════════════════════════════
  // Persistence — Phase 45
  // ═══════════════════════════════════════════════════════════

  /**
   * Ensures the override directory exists.
   * Called once during bootstrap — before restore().
   */
  async ensureDir() {
    if (!this.#persistEnabled) return;
    await mkdir(dirname(this.#filePath), { recursive: true });
  }

  /**
   * Writes current overrides to disk (explicit flush).
   * Called during graceful shutdown and by debounced #scheduleWrite().
   */
  async persist() {
    if (!this.#persistEnabled) return;
    if (this.#overrides.size === 0) return;
    try {
      const data = {};
      for (const [key, value] of this.#overrides) {
        data[key] = value;
      }
      await atomicWriteFile(this.#filePath, JSON.stringify(data, null, 2));
    } catch (err) {
      logger.warn('featureFlags', 'persist failed', { error: err.message });
    }
  }

  /**
   * Restores overrides from disk.
   * Called during bootstrap — before listener registration.
   * Does NOT emit events or trigger scheduleWrite (silent restore).
   */
  async restore() {
    if (!this.#persistEnabled) return;
    try {
      const raw = await readFile(this.#filePath, 'utf-8');
      const data = JSON.parse(raw);
      if (data && typeof data === 'object') {
        for (const [key, value] of Object.entries(data)) {
          if (typeof value === 'boolean') {
            this.#overrides.set(key.toUpperCase(), value);
          }
        }
        logger.info('featureFlags', `restored ${this.#overrides.size} override(s) from disk`);
      }
    } catch (err) {
      if (err.code === 'ENOENT') return; // first run — no file yet
      logger.warn('featureFlags', 'restore failed — starting with empty overrides', { error: err.message });
    }
  }

  /**
   * Debounced write (500ms). Called after every setOverride/clearOverride.
   */
  #scheduleWrite() {
    if (!this.#persistEnabled) return;
    if (this.#writeTimer) clearTimeout(this.#writeTimer);
    this.#writeTimer = setTimeout(() => {
      this.#writeTimer = null;
      this.persist().catch(err => {
        logger.warn('featureFlags', 'scheduled persist failed', { error: err.message });
      });
    }, 500);
    this.#writeTimer.unref();
  }

  /**
   * Stops the debounce timer. Called during graceful shutdown.
   */
  stop() {
    if (this.#writeTimer) {
      clearTimeout(this.#writeTimer);
      this.#writeTimer = null;
    }
  }
}

// ── Singleton instance ─────────────────────────────────────────
const featureFlags = new FeatureFlags();

export { FeatureFlags, featureFlags };
