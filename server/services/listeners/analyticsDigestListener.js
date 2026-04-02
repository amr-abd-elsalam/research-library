// server/services/listeners/analyticsDigestListener.js
// ═══════════════════════════════════════════════════════════════
// Analytics Digest Listener — Phase 22
// Feeds lightweight pipeline event data to PipelineAnalytics
// for rolling statistics. No heavy computation — just accumulation.
// ═══════════════════════════════════════════════════════════════

import { eventBus }           from '../eventBus.js';
import { pipelineAnalytics }  from '../pipelineAnalytics.js';

export function register() {
  eventBus.on('pipeline:complete', (data) => {
    pipelineAnalytics._recordCompletion(data);
  });

  eventBus.on('pipeline:stageComplete', (data) => {
    pipelineAnalytics._recordStageCompletion(data);
  });
}
