// server/handlers/authHandler.js
// ═══════════════════════════════════════════════════════════════
// POST /api/auth/verify — verifies PIN or token
// ═══════════════════════════════════════════════════════════════

import { verifyAccess, getAccessMode } from '../middleware/auth.js';

export async function handleAuthVerify(req, res) {
  // Read body
  let body = '';
  try {
    for await (const chunk of req) {
      body += chunk;
      if (body.length > 1024) {
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'الطلب كبير جداً', code: 'PAYLOAD_TOO_LARGE' }));
        return;
      }
    }
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'خطأ في قراءة الطلب', code: 'BAD_REQUEST' }));
    return;
  }

  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'JSON غير صالح', code: 'INVALID_JSON' }));
    return;
  }

  const credential = parsed.pin || parsed.token || '';
  const result = verifyAccess(credential);

  if (result.valid) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ valid: true, mode: result.mode }));
  } else {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ valid: false, mode: result.mode, error: 'بيانات الدخول غير صحيحة', code: 'INVALID_CREDENTIAL' }));
  }
}
