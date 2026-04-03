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
import { register as registerRouting }         from './routingListener.js';
import { register as registerContext }         from './contextListener.js';
import { register as registerSuggestions }     from './suggestionsListener.js';
import { register as registerEviction }        from './evictionListener.js';
import { register as registerFeedback }        from './feedbackListener.js';
import { register as registerCorrelation }     from './correlationListener.js';
import { register as registerAuditTrail }      from './auditTrailListener.js';
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
  registerRouting();
  registerContext();
  registerSuggestions();
  registerEviction();
  registerFeedback();
  registerCorrelation();
  registerAuditTrail();

  logger.info('listeners', '16 EventBus listeners registered (analytics, cache, session, metrics, command, log, circuit, sessionStats, analyticsDigest, routing, context, suggestions, eviction, feedback, correlation, auditTrail)');
}
