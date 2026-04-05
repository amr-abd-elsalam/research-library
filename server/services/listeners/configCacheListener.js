// server/services/listeners/configCacheListener.js
// ═══════════════════════════════════════════════════════════════
// Config Cache Listener — Phase 62 (Listener #20)
// Moved from inline listeners in configHandler.js.
// Listens to feature:toggled + library:changed events.
// Invalidates config response cache + DynamicWelcomeSuggestions.
// ═══════════════════════════════════════════════════════════════

import { eventBus } from '../eventBus.js';
import { dynamicWelcomeSuggestions } from '../dynamicWelcomeSuggestions.js';

let _configCacheInvalidator = null;

/**
 * Sets the config cache invalidation function.
 * Called by bootstrap.js after registerAllListeners().
 * @param {Function} fn — () => void
 */
export function setConfigCacheInvalidator(fn) {
  _configCacheInvalidator = fn;
}

/**
 * Registers event listeners on the EventBus.
 */
export function register() {
  eventBus.on('feature:toggled', () => {
    if (typeof _configCacheInvalidator === 'function') _configCacheInvalidator();
    dynamicWelcomeSuggestions.invalidate();
  });

  eventBus.on('library:changed', () => {
    if (typeof _configCacheInvalidator === 'function') _configCacheInvalidator();
    dynamicWelcomeSuggestions.invalidate();
  });
}
