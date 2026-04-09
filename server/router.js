import { randomUUID }     from 'node:crypto';
import { applyCors }      from './middleware/cors.js';
import { applyRateLimit } from './middleware/rateLimit.js';
import { validateBody }   from './middleware/validate.js';
import { requireAdmin, requireAccess } from './middleware/auth.js';
import { handleChat }     from './handlers/chat.js';
import { handleTopics }   from './handlers/topics.js';
import { handleHealth }   from './handlers/health.js';
import { handleConfig, handleConfigFeatures } from './handlers/configHandler.js';
import { handleAdminStats } from './handlers/adminStats.js';
import { handleMetrics }    from './handlers/metricsHandler.js';
import { handleAdminLog }   from './handlers/adminLogHandler.js';
import { handleInspect }    from './handlers/inspectHandler.js';
import { handleAuthVerify }  from './handlers/authHandler.js';
import { handleCreateSession, handleGetSession, handleDeleteSession, handleListSessions, extractSessionId, extractSessionAction, handleResumeSession, handleExportSession, handleSessionReplay } from './handlers/sessions.js';
import { handleCommands } from './handlers/commandsHandler.js';
import { handleWhoami }   from './handlers/whoamiHandler.js';
import { handleSubmitFeedback, handleAdminFeedback } from './handlers/feedbackHandler.js';
import { handleAudit } from './handlers/auditHandler.js';
import { handleLibraryOverview } from './handlers/libraryHandler.js';
import { handleContentGaps } from './handlers/contentGapsHandler.js';
import { handleExport } from './handlers/exportHandler.js';
import { handleHealthScore } from './handlers/healthScoreHandler.js';
import { handleAdminAction } from './handlers/adminActionsHandler.js';
import { handleAdminIntelligence } from './handlers/adminIntelligenceHandler.js';
import { handleSuggestionAnalytics } from './handlers/suggestionsHandler.js';
import { handleAdminNotifications } from './handlers/adminNotificationsHandler.js';
import { handleLibraries } from './handlers/librariesHandler.js';
import { handleAdminCost } from './handlers/costHandler.js';
import { bootstrap } from './bootstrap.js';
import { eventBus } from './services/eventBus.js';
import config from '../config.js';

// ── URL matcher (strips query string + trailing slash) ─────────
function matchRoute(reqUrl, routePath) {
  const i        = reqUrl.indexOf('?');
  const pathname = i === -1 ? reqUrl : reqUrl.slice(0, i);
  return pathname === routePath || pathname === routePath + '/';
}

export { matchRoute };

export async function router(req, res) {
  const { method, url } = req;

  // ── CORS preflight ─────────────────────────────────────────────
  if (method === 'OPTIONS') {
    applyCors(req, res);
    if (res.writableEnded) return;
    res.writeHead(204);
    res.end();
    return;
  }

  // ── Apply CORS on every request ────────────────────────────────
  applyCors(req, res);
  if (res.writableEnded) return;

  // ── Request ID (Phase 65) ──────────────────────────────────────
  if (config.OBSERVABILITY?.requestIdEnabled !== false) {
    const requestId = randomUUID();
    req._requestId = requestId;
    res.setHeader('X-Request-Id', requestId);
  }

  // ── Routes ─────────────────────────────────────────────────────

  // GET /api/health
  if (method === 'GET' && matchRoute(url, '/api/health')) {
    await applyRateLimit(req, res, 'health');
    if (res.writableEnded) return;
    await handleHealth(req, res);
    return;
  }

  // GET /api/health/ready (readiness probe — no rate limit, no auth)
  if (method === 'GET' && matchRoute(url, '/api/health/ready')) {
    const payload = bootstrap.getReadinessPayload();
    const statusCode = payload.ready ? 200 : 503;
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload));
    return;
  }

  // GET /api/libraries (Phase 60 — public, no auth, no rate limit)
  if (method === 'GET' && matchRoute(url, '/api/libraries')) {
    await handleLibraries(req, res);
    return;
  }

  // GET /api/config/features (Phase 46 — lightweight effective feature state)
  if (method === 'GET' && matchRoute(url, '/api/config/features')) {
    await handleConfigFeatures(req, res);
    return;
  }

  // GET /api/config
  if (method === 'GET' && matchRoute(url, '/api/config')) {
    await handleConfig(req, res);
    return;
  }

  // POST /api/auth/verify
  if (method === 'POST' && matchRoute(url, '/api/auth/verify')) {
    await handleAuthVerify(req, res);
    return;
  }

  // GET /api/topics
  if (method === 'GET' && matchRoute(url, '/api/topics')) {
    await applyRateLimit(req, res, 'topics');
    if (res.writableEnded) return;
    await handleTopics(req, res);
    return;
  }

  // GET /api/commands (Phase 20 — public, no auth)
  if (method === 'GET' && matchRoute(url, '/api/commands')) {
    await handleCommands(req, res);
    return;
  }

  // GET /api/whoami (Phase 27 — returns tier + permissions for current auth state)
  if (method === 'GET' && matchRoute(url, '/api/whoami')) {
    requireAccess(req, res);
    if (res.writableEnded) return;
    await handleWhoami(req, res);
    return;
  }

  // POST /api/feedback (Phase 33 — user feedback submission, Phase 54 — rate limited)
  if (method === 'POST' && matchRoute(url, '/api/feedback')) {
    requireAccess(req, res);
    if (res.writableEnded) return;
    await applyRateLimit(req, res, 'feedback');
    if (res.writableEnded) return;
    await validateBody(req, res);
    if (res.writableEnded) return;
    await handleSubmitFeedback(req, res);
    return;
  }

  // POST /api/suggestion-click (Phase 54 — suggestion click tracking, fire-and-forget)
  if (method === 'POST' && matchRoute(url, '/api/suggestion-click')) {
    requireAccess(req, res);
    if (res.writableEnded) return;
    await applyRateLimit(req, res, 'feedback');
    if (res.writableEnded) return;
    await validateBody(req, res);
    if (res.writableEnded) return;
    const { text } = req._validatedBody;
    if (text && typeof text === 'string') {
      eventBus.emit('suggestion:clicked', { text, timestamp: Date.now() });
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // POST /api/chat
  if (method === 'POST' && matchRoute(url, '/api/chat')) {
    requireAccess(req, res);
    if (res.writableEnded) return;
    await applyRateLimit(req, res, 'chat');
    if (res.writableEnded) return;
    await validateBody(req, res);
    if (res.writableEnded) return;
    await handleChat(req, res);
    return;
  }

  // GET /api/admin/stats
  if (method === 'GET' && matchRoute(url, '/api/admin/stats')) {
    requireAdmin(req, res);
    if (res.writableEnded) return;
    await handleAdminStats(req, res);
    return;
  }

  // GET /api/admin/metrics
  if (method === 'GET' && matchRoute(url, '/api/admin/metrics')) {
    requireAdmin(req, res);
    if (res.writableEnded) return;
    await handleMetrics(req, res);
    return;
  }

  // GET /api/admin/log
  if (method === 'GET' && matchRoute(url, '/api/admin/log')) {
    requireAdmin(req, res);
    if (res.writableEnded) return;
    await handleAdminLog(req, res);
    return;
  }

  // GET /api/admin/feedback (Phase 33 — admin feedback overview)
  if (method === 'GET' && matchRoute(url, '/api/admin/feedback')) {
    requireAdmin(req, res);
    if (res.writableEnded) return;
    await handleAdminFeedback(req, res);
    return;
  }

  // GET /api/admin/audit/:sessionId (Phase 34 — per-session audit trail)
  if (method === 'GET' && /^\/api\/admin\/audit\/[^/?]+/.test(url.split('?')[0])) {
    requireAdmin(req, res);
    if (res.writableEnded) return;
    await handleAudit(req, res);
    return;
  }

  // GET /api/admin/library (Phase 36 — library content overview)
  if (method === 'GET' && matchRoute(url, '/api/admin/library')) {
    requireAdmin(req, res);
    if (res.writableEnded) return;
    await handleLibraryOverview(req, res);
    return;
  }

  // GET /api/admin/gaps (Phase 38 — content gap detection)
  if (method === 'GET' && matchRoute(url, '/api/admin/gaps')) {
    requireAdmin(req, res);
    if (res.writableEnded) return;
    await handleContentGaps(req, res);
    return;
  }

  // GET /api/admin/export (Phase 40 — admin data export)
  if (method === 'GET' && matchRoute(url, '/api/admin/export')) {
    requireAdmin(req, res);
    if (res.writableEnded) return;
    await handleExport(req, res);
    return;
  }

  // GET /api/admin/health-score (Phase 42 — unified health score)
  if (method === 'GET' && matchRoute(url, '/api/admin/health-score')) {
    requireAdmin(req, res);
    if (res.writableEnded) return;
    await handleHealthScore(req, res);
    return;
  }

  // GET /api/admin/cost (Phase 77 — cost governance dashboard data)
  if (method === 'GET' && matchRoute(url, '/api/admin/cost')) {
    requireAdmin(req, res);
    if (res.writableEnded) return;
    await handleAdminCost(req, res);
    return;
  }

  // GET /api/admin/suggestions (Phase 57 — suggestion click analytics)
  if (method === 'GET' && matchRoute(url, '/api/admin/suggestions')) {
    requireAdmin(req, res);
    if (res.writableEnded) return;
    await handleSuggestionAnalytics(req, res);
    return;
  }

  // GET /api/admin/intelligence (Phase 53 — admin intelligence insights)
  if (method === 'GET' && matchRoute(url, '/api/admin/intelligence')) {
    requireAdmin(req, res);
    if (res.writableEnded) return;
    await handleAdminIntelligence(req, res);
    return;
  }

  // GET /api/admin/notifications/stream (Phase 53 — SSE real-time admin alerts)
  if (method === 'GET' && matchRoute(url, '/api/admin/notifications/stream')) {
    requireAdmin(req, res);
    if (res.writableEnded) return;
    await handleAdminNotifications(req, res);
    return;
  }

  // POST /api/admin/actions/* (Phase 42 — admin quick actions)
  if (method === 'POST' && /^\/api\/admin\/actions\/[^/?]+/.test(url.split('?')[0])) {
    requireAdmin(req, res);
    if (res.writableEnded) return;
    await handleAdminAction(req, res);
    return;
  }

  // GET /api/admin/inspect
  if (method === 'GET' && matchRoute(url, '/api/admin/inspect')) {
    requireAdmin(req, res);
    if (res.writableEnded) return;
    await handleInspect(req, res);
    return;
  }

  // GET /api/admin/sessions (admin — metadata only)
  if (method === 'GET' && matchRoute(url, '/api/admin/sessions')) {
    requireAdmin(req, res);
    if (res.writableEnded) return;
    await handleListSessions(req, res);
    return;
  }

  // POST /api/sessions (create)
  if (method === 'POST' && matchRoute(url, '/api/sessions')) {
    requireAccess(req, res);
    if (res.writableEnded) return;
    await handleCreateSession(req, res);
    return;
  }

  // POST /api/sessions/:id/resume (Phase 19)
  if (method === 'POST' && extractSessionAction(url)?.action === 'resume') {
    requireAccess(req, res);
    if (res.writableEnded) return;
    await handleResumeSession(req, res);
    return;
  }

  // GET /api/admin/sessions/:id/replay (Phase 84 — admin-protected session replay)
  if (method === 'GET' && extractSessionAction(url)?.action === 'replay') {
    requireAdmin(req, res);
    if (res.writableEnded) return;
    await handleSessionReplay(req, res);
    return;
  }

  // GET /api/sessions/:id/export (Phase 19)
  if (method === 'GET' && extractSessionAction(url)?.action === 'export') {
    requireAccess(req, res);
    if (res.writableEnded) return;
    await handleExportSession(req, res);
    return;
  }

  // GET /api/sessions/:id (read)
  if (method === 'GET' && extractSessionId(url)) {
    requireAccess(req, res);
    if (res.writableEnded) return;
    await handleGetSession(req, res);
    return;
  }

  // DELETE /api/sessions/:id (delete)
  if (method === 'DELETE' && extractSessionId(url)) {
    requireAccess(req, res);
    if (res.writableEnded) return;
    await handleDeleteSession(req, res);
    return;
  }

  // 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not Found', code: 'NOT_FOUND' }));
}
