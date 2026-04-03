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

import config from '../../config.js';
import { eventBus } from './eventBus.js';

class FeatureFlags {
  /** @type {Map<string, boolean>} */
  #overrides = new Map();

  // Section name → config path mapping (uppercase)
  #sectionPaths = {
    SUGGESTIONS:    () => config.SUGGESTIONS?.enabled === true,
    CONTENT_GAPS:   () => config.CONTENT_GAPS?.enabled === true,
    FEEDBACK:       () => config.FEEDBACK?.enabled === true,
    QUALITY:        () => config.QUALITY?.enabled === true,
    HEALTH_SCORE:   () => config.HEALTH_SCORE?.enabled === true,
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
  }

  /**
   * Removes a runtime override (reverts to config value).
   * @param {string} section
   */
  clearOverride(section) {
    this.#overrides.delete(section.toUpperCase());
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
   * @returns {{ totalOverrides: number, sections: number }}
   */
  counts() {
    return {
      totalOverrides: this.#overrides.size,
      sections:       Object.keys(this.#sectionPaths).length,
    };
  }
}

// ── Singleton instance ─────────────────────────────────────────
const featureFlags = new FeatureFlags();

export { FeatureFlags, featureFlags };
