// server/services/listeners/index.js
// ═══════════════════════════════════════════════════════════════
// Listener Registration Hub — Phase 13, updated Phase 19
// Registers all EventBus listeners. Called once during bootstrap.
// ═══════════════════════════════════════════════════════════════

import { register as registerAnalytics }     from './analyticsListener.js';
import { register as registerCache }         from './cacheListener.js';
import { register as registerSession }       from './sessionListener.js';
import { register as registerMetrics }       from './metricsListener.js';
import { register as registerCommand }       from './commandListener.js';
import { register as registerLog }           from './logListener.js';
import { register as registerCircuit }       from './circuitListener.js';
import { register as registerSessionStats }  from './sessionStatsListener.js';
import { register as registerAnalyticsDigest } from './analyticsDigestListener.js';
import { logger }                            from '../logger.js';

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
  registerCommand();
  registerLog();
  registerCircuit();
  registerSessionStats();
  registerAnalyticsDigest();

  logger.info('listeners', '9 EventBus listeners registered (analytics, cache, session, metrics, command, log, circuit, sessionStats, analyticsDigest)');
}
