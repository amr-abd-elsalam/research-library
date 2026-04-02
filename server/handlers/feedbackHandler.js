// server/handlers/feedbackHandler.js
// ═══════════════════════════════════════════════════════════════
// Feedback Endpoints — Phase 33
//   POST /api/feedback       — user submits feedback
//   GET  /api/admin/feedback — admin reads feedback summary
// ═══════════════════════════════════════════════════════════════

import { feedbackCollector } from '../services/feedbackCollector.js';

/**
 * POST /api/feedback
 * Submits user feedback (thumbs up/down) for a specific request.
 */
export async function handleSubmitFeedback(req, res) {
  // Hide feature completely when disabled
  if (!feedbackCollector.enabled) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not Found', code: 'NOT_FOUND' }));
    return;
  }

  const body = req._validatedBody;
  const { correlationId, rating, comment, session_id } = body;

  const success = await feedbackCollector.submit({
    correlationId,
    sessionId: session_id,
    rating,
    comment,
  });

  if (!success) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'بيانات غير صالحة',
      code:  'INVALID_FEEDBACK',
    }));
    return;
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true }));
}

/**
 * GET /api/admin/feedback
 * Returns feedback summary + recent entries for the admin dashboard.
 */
export async function handleAdminFeedback(req, res) {
  // Parse query string for limit
  let limit = 50;
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const paramLimit = parseInt(url.searchParams.get('limit'), 10);
    if (!isNaN(paramLimit) && paramLimit > 0) {
      limit = Math.min(paramLimit, 200);
    }
  } catch { /* use default */ }

  const payload = {
    counts: feedbackCollector.counts(),
    recent: feedbackCollector.recent(limit),
  };

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}
