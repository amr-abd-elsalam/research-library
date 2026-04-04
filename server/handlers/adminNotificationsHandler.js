// server/handlers/adminNotificationsHandler.js
// ═══════════════════════════════════════════════════════════════
// GET /api/admin/notifications/stream — Phase 53
// SSE endpoint for real-time admin intelligence alerts.
// Long-lived connection with heartbeat (30s) and auto-cleanup.
// Admin-only (requireAdmin applied in router).
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';
import { adminIntelligence } from '../services/adminIntelligence.js';
import { eventBus } from '../services/eventBus.js';

export async function handleAdminNotifications(req, res) {
  // Check if notifications enabled
  if (!adminIntelligence.enabled || !(config.ADMIN_INTELLIGENCE?.notificationsEnabled)) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Notifications disabled' }));
    return;
  }

  // SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  // Disable socket timeout for long-lived SSE
  if (typeof res.setTimeout === 'function') {
    res.setTimeout(0);
  }

  // Send existing queued notifications
  const existing = adminIntelligence.getNotifications(0);
  for (const n of existing) {
    if (res.writableEnded) return;
    res.write(`data: ${JSON.stringify(n)}\n\n`);
  }

  // Subscribe to new notifications
  const unsub = eventBus.on('intelligence:notification', (data) => {
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    }
  });

  // Heartbeat every 30s (keep connection alive through proxies)
  const heartbeat = setInterval(() => {
    if (!res.writableEnded) {
      res.write(': heartbeat\n\n');
    }
  }, 30000);
  heartbeat.unref();

  // Cleanup on disconnect
  req.on('close', () => {
    unsub();
    clearInterval(heartbeat);
  });
}
