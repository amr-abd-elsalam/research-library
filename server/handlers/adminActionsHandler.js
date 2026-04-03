// server/handlers/adminActionsHandler.js
// ═══════════════════════════════════════════════════════════════
// POST /api/admin/actions/:action — Phase 42 + Phase 43
// Admin quick actions: force library refresh, clear cache,
// reset metrics, reanalyze gaps, toggle feature.
// Admin-only (requireAdmin applied in router).
// Phase 43: EventBus emission, cooldown, 3 new actions.
// ═══════════════════════════════════════════════════════════════

import { libraryIndex } from '../services/libraryIndex.js';
import { cache } from '../services/cache.js';
import { logger } from '../services/logger.js';
import { eventBus } from '../services/eventBus.js';
import { metrics } from '../services/metrics.js';
import { contentGapDetector } from '../services/contentGapDetector.js';
import { gapPersister } from '../services/gapPersister.js';
import { libraryHealthScorer } from '../services/libraryHealthScorer.js';
import config from '../../config.js';
import { featureFlags } from '../services/featureFlags.js';

// ── Per-action-type cooldown tracking (Phase 43) ───────────────
const lastActionTime = new Map();

function checkCooldown(action) {
  const cooldownMs = config.ADMIN_ACTIONS?.cooldownMs ?? 5000;
  if (cooldownMs <= 0) return { blocked: false };
  const last = lastActionTime.get(action);
  if (last && (Date.now() - last) < cooldownMs) {
    return { blocked: true, retryAfterMs: cooldownMs - (Date.now() - last) };
  }
  return { blocked: false };
}

function recordCooldown(action) {
  lastActionTime.set(action, Date.now());
}

// ── EventBus emission helper (Phase 43) ────────────────────────
function emitAction(action, params, result, durationMs) {
  if (config.ADMIN_ACTIONS?.enabled === false) return;
  eventBus.emit('admin:action', {
    action,
    params: params || {},
    result,
    timestamp: Date.now(),
    durationMs,
  });
}

// ── Runtime overrides for toggle-feature (Phase 43 → Phase 44) ─
/** @deprecated — use featureFlags singleton. Kept for backward compatibility. */
export const runtimeOverrides = {
  set(key, value) { featureFlags.setOverride(key, value); },
  get(key) { return featureFlags.isEnabled(key); },
  has(key) { return featureFlags.getOverrides().hasOwnProperty(key.toUpperCase()); },
};

// ── Request body reader helper ─────────────────────────────────
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf-8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

export async function handleAdminAction(req, res) {
  try {
    // Extract action name from URL: /api/admin/actions/{action}
    const pathname = (req.url || '').split('?')[0];
    const segments = pathname.split('/');
    // segments: ['', 'api', 'admin', 'actions', '{action}']
    const action = segments[4] || '';

    // ── Cooldown check (Phase 43) ────────────────────────────
    const cooldownResult = checkCooldown(action);
    if (cooldownResult.blocked) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Action cooldown active',
        code:  'COOLDOWN_ACTIVE',
        retryAfterMs: cooldownResult.retryAfterMs,
      }));
      return;
    }

    const t0 = Date.now();

    // ── refresh-library ──────────────────────────────────────
    if (action === 'refresh-library') {
      if (!libraryIndex.enabled) {
        const result = { success: false, error: 'Library index disabled' };
        emitAction(action, {}, result, Date.now() - t0);
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'Library index disabled',
          code:  'FEATURE_DISABLED',
        }));
        return;
      }

      try {
        await libraryIndex.refresh();
        recordCooldown(action);
        libraryHealthScorer.invalidateCache();
        const durationMs = Date.now() - t0;
        const result = { success: true, message: 'Library refreshed' };
        logger.info('adminActions', 'Library index refreshed via admin action');
        emitAction(action, {}, result, durationMs);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err) {
        recordCooldown(action);
        const durationMs = Date.now() - t0;
        const result = { success: false, error: err.message };
        logger.warn('adminActions', 'Library refresh failed', { error: err.message });
        emitAction(action, {}, result, durationMs);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: err.message,
          code:  'REFRESH_FAILED',
        }));
      }
      return;
    }

    // ── clear-cache ──────────────────────────────────────────
    if (action === 'clear-cache') {
      const count = cache.invalidateAll();
      recordCooldown(action);
      libraryHealthScorer.invalidateCache();
      const durationMs = Date.now() - t0;
      const result = { success: true, cleared: count };
      logger.info('adminActions', `Cache cleared via admin action (${count} entries)`);
      emitAction(action, {}, result, durationMs);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
      return;
    }

    // ── reset-metrics (Phase 43) ─────────────────────────────
    if (action === 'reset-metrics') {
      metrics.reset();
      recordCooldown(action);
      libraryHealthScorer.invalidateCache();
      const durationMs = Date.now() - t0;
      const result = { success: true, message: 'Metrics counters reset' };
      logger.info('adminActions', 'Metrics reset via admin action');
      emitAction(action, {}, result, durationMs);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
      return;
    }

    // ── reanalyze-gaps (Phase 43) ────────────────────────────
    if (action === 'reanalyze-gaps') {
      if (!contentGapDetector.enabled) {
        const result = { success: false, error: 'Content gap detection disabled' };
        emitAction(action, {}, result, Date.now() - t0);
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'Content gap detection disabled',
          code:  'FEATURE_DISABLED',
        }));
        return;
      }

      try {
        let entriesProcessed = 0;
        if (gapPersister.enabled) {
          const entries = await gapPersister.read();
          if (entries.length > 0) {
            contentGapDetector.restoreFromEntries(entries);
            entriesProcessed = entries.length;
          }
        }
        recordCooldown(action);
        libraryHealthScorer.invalidateCache();
        const durationMs = Date.now() - t0;
        const result = { success: true, message: 'Gap analysis refreshed', entriesProcessed };
        logger.info('adminActions', `Gap analysis refreshed via admin action (${entriesProcessed} entries)`);
        emitAction(action, {}, result, durationMs);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err) {
        recordCooldown(action);
        const durationMs = Date.now() - t0;
        const result = { success: false, error: err.message };
        logger.warn('adminActions', 'Gap reanalysis failed', { error: err.message });
        emitAction(action, {}, result, durationMs);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: err.message,
          code:  'REANALYZE_FAILED',
        }));
      }
      return;
    }

    // ── toggle-feature (Phase 43) ────────────────────────────
    if (action === 'toggle-feature') {
      const whitelist = config.ADMIN_ACTIONS?.toggleWhitelist ?? [];
      if (!Array.isArray(whitelist) || whitelist.length === 0) {
        const result = { success: false, error: 'Feature toggling not configured' };
        emitAction(action, {}, result, Date.now() - t0);
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'Feature toggling not configured',
          code:  'TOGGLE_NOT_CONFIGURED',
        }));
        return;
      }

      const body = await readBody(req);
      const feature = typeof body.feature === 'string' ? body.feature.trim().toUpperCase() : '';
      const enabled = body.enabled === true;

      if (!feature) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'Missing feature name',
          code:  'MISSING_FEATURE',
        }));
        return;
      }

      // Normalize whitelist to uppercase for comparison
      const normalizedWhitelist = whitelist.map(f => String(f).toUpperCase());
      if (!normalizedWhitelist.includes(feature)) {
        const result = { success: false, error: 'Feature not in toggle whitelist' };
        emitAction(action, { feature, enabled }, result, Date.now() - t0);
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'Feature not in toggle whitelist',
          code:  'TOGGLE_DENIED',
        }));
        return;
      }

      featureFlags.setOverride(feature, enabled);
      recordCooldown(action);
      libraryHealthScorer.invalidateCache();
      const durationMs = Date.now() - t0;
      const result = { success: true, feature, enabled, message: `${feature} set to ${enabled}` };
      logger.info('adminActions', `Feature toggled via admin action: ${feature} → ${enabled}`);
      emitAction(action, { feature, enabled }, result, durationMs);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
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
