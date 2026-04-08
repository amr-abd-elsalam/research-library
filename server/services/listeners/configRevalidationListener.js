// server/services/listeners/configRevalidationListener.js
// ═══════════════════════════════════════════════════════════════
// Config Re-Validation Listener — Phase 80 (Listener #25)
// Listens on 'feature:toggled' event (emitted by FeatureFlags.setOverride).
// Triggers configValidator.revalidate() and logs new errors/warnings.
// Non-blocking — failures are caught and logged, never thrown.
// ═══════════════════════════════════════════════════════════════

import { eventBus }        from '../eventBus.js';
import { configValidator } from '../configValidator.js';
import { logger }          from '../logger.js';
import { operationalLog }  from '../operationalLog.js';

/**
 * Handles 'feature:toggled' events — re-validates config consistency.
 * @param {{ section: string, enabled: boolean, previousValue: boolean, timestamp: number }} data
 */
function configRevalidationListener(data) {
  try {
    const { result, changed, newErrors, newWarnings } = configValidator.revalidate();

    if (newErrors.length > 0) {
      logger.error('configRevalidation',
        `feature toggle caused ${newErrors.length} config error(s)`,
        { section: data?.section, errors: newErrors }
      );
      operationalLog.record('config:revalidation:error', 'configValidator', {
        trigger: `feature:toggled:${data?.section || 'unknown'}`,
        errors: newErrors,
      });
    }

    if (newWarnings.length > 0) {
      logger.warn('configRevalidation',
        `feature toggle caused ${newWarnings.length} config warning(s)`,
        { section: data?.section, warnings: newWarnings }
      );
      operationalLog.record('config:revalidation:warning', 'configValidator', {
        trigger: `feature:toggled:${data?.section || 'unknown'}`,
        warnings: newWarnings,
      });
    }
  } catch (err) {
    logger.warn('configRevalidation', 'revalidation failed', { error: err.message });
  }
}

/**
 * Registers the listener on EventBus.
 */
export function registerConfigRevalidationListener() {
  eventBus.on('feature:toggled', configRevalidationListener);
}

export { configRevalidationListener };
