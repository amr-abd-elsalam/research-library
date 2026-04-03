// server/handlers/adminActionsHandler.js
// ═══════════════════════════════════════════════════════════════
// POST /api/admin/actions/:action — Phase 42
// Admin quick actions: force library refresh, clear cache.
// Admin-only (requireAdmin applied in router).
// ═══════════════════════════════════════════════════════════════

import { libraryIndex } from '../services/libraryIndex.js';
import { cache } from '../services/cache.js';
import { logger } from '../services/logger.js';

export async function handleAdminAction(req, res) {
  try {
    // Extract action name from URL: /api/admin/actions/{action}
    const pathname = (req.url || '').split('?')[0];
    const segments = pathname.split('/');
    // segments: ['', 'api', 'admin', 'actions', '{action}']
    const action = segments[4] || '';

    if (action === 'refresh-library') {
      if (!libraryIndex.enabled) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'Library index disabled',
          code:  'FEATURE_DISABLED',
        }));
        return;
      }

      try {
        await libraryIndex.refresh();
        logger.info('adminActions', 'Library index refreshed via admin action');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          message: 'Library refreshed',
        }));
      } catch (err) {
        logger.warn('adminActions', 'Library refresh failed', { error: err.message });
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: err.message,
          code:  'REFRESH_FAILED',
        }));
      }
      return;
    }

    if (action === 'clear-cache') {
      const count = cache.invalidateAll();
      logger.info('adminActions', `Cache cleared via admin action (${count} entries)`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        cleared: count,
      }));
      return;
    }

    // Unknown action
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'Unknown action',
      code:  'UNKNOWN_ACTION',
    }));

  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'حدث خطأ في تنفيذ الإجراء',
      code:  'ACTION_ERROR',
    }));
  }
}
