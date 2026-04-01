// server/services/listeners/logListener.js
// ═══════════════════════════════════════════════════════════════
// Log Listener — Phase 16
// Listens to all active EventBus events and records them in the
// OperationalLog ring buffer for admin visibility.
// ═══════════════════════════════════════════════════════════════

import { eventBus }       from '../eventBus.js';
import { operationalLog } from '../operationalLog.js';

function register() {

  // ── Pipeline complete ──────────────────────────────────────
  eventBus.on('pipeline:complete', (data) => {
    operationalLog.record('pipeline:complete', 'pipeline', {
      queryType:  data.queryType,
      totalMs:    data.totalMs,
      aborted:    data.aborted,
      abortReason: data.abortReason || null,
      sourcesCount: data.sources?.length ?? 0,
    }, data.correlationId);
  });

  // ── Stage complete ─────────────────────────────────────────
  eventBus.on('pipeline:stageComplete', (data) => {
    operationalLog.record('pipeline:stageComplete', 'pipeline', {
      stageName:  data.stageName,
      durationMs: data.durationMs,
      status:     data.status,
    }, data.correlationId);
  });

  // ── Cache hit ──────────────────────────────────────────────
  eventBus.on('pipeline:cacheHit', (data) => {
    operationalLog.record('pipeline:cacheHit', 'cache', {
      messagePreview: typeof data.message === 'string' ? data.message.slice(0, 80) : null,
      topicFilter:    data.topicFilter || null,
    });
  });

  // ── Command complete ───────────────────────────────────────
  eventBus.on('command:complete', (data) => {
    operationalLog.record('command:complete', 'commands', {
      commandName: data.commandName,
      latencyMs:   data.latencyMs,
    });
  });
}

export { register };
