// server/services/listeners/cacheListener.js
// ═══════════════════════════════════════════════════════════════
// Cache Listener — Phase 13
// Listens to pipeline:complete on EventBus and caches successful
// responses. Replaces the explicit cache.set() in chat.js
// postPipeline().
// ═══════════════════════════════════════════════════════════════

import { eventBus } from '../eventBus.js';
import { cache }    from '../cache.js';
import { logger }   from '../logger.js';

const CACHE_TTL = 3600;

function register() {

  eventBus.on('pipeline:complete', (data) => {
    // Only cache successful (non-aborted) responses with content
    if (data.aborted || !data._cacheEntry) return;

    cache.set(data._cacheKey, data._cacheEntry, CACHE_TTL);
  });

  // Phase 41: invalidate cache when library content changes
  eventBus.on('library:changed', (data) => {
    const cleared = cache.invalidateAll();
    cache.setLibraryVersion(data.newVersion);
    logger.info('cacheListener', `cache invalidated on library change (${cleared} entries cleared, version: ${data.newVersion})`);
  });
}

export { register };
