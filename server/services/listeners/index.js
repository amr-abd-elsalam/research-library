// server/services/listeners/index.js
// ═══════════════════════════════════════════════════════════════
// Listener Registration Hub — Phase 13
// Registers all EventBus listeners. Called once during bootstrap.
// ═══════════════════════════════════════════════════════════════

import { register as registerAnalytics } from './analyticsListener.js';
import { register as registerCache }     from './cacheListener.js';
import { register as registerSession }   from './sessionListener.js';
import { register as registerMetrics }   from './metricsListener.js';

/**
 * Registers all EventBus listeners.
 * Called once during bootstrap, after pipeline hooks are set up
 * and before service checks.
 */
export function registerAllListeners() {
  registerAnalytics();
  registerCache();
  registerSession();
  registerMetrics();

  console.log('[listeners] 4 EventBus listeners registered (analytics, cache, session, metrics)');
}
