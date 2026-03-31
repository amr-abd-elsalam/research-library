const MAX_BODY_SIZE  = 64 * 1024;  // 64KB — يكفي لـ history كامل بالعربية
const MAX_MSG_CHARS  = 500;
const MAX_HISTORY    = 20;
const MAX_TOPIC_LEN  = 64;
const MAX_ITEM_CHARS = 4000;

const VALID_ROLES = new Set(['user', 'model']);

export async function validateBody(req, res) {

  // ── 1. Content-Type ────────────────────────────────────────────
  const ct = req.headers['content-type'] || '';
  if (!ct.includes('application/json')) {
    res.writeHead(415, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'Content-Type يجب أن يكون application/json',
      code:  'VALIDATION_ERROR',
    }));
    return;
  }

  // ── 2. Read body with size limit ───────────────────────────────
  let body = '';
  let size = 0;
  let oversized = false;

  try {
    await new Promise((resolve, reject) => {
      const onData = (chunk) => {
        size += chunk.length;
        if (size > MAX_BODY_SIZE) {
          oversized = true;
          req.removeListener('data', onData);
          req.resume();
          if (!res.writableEnded) {
            res.writeHead(413, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              error: 'حجم الطلب كبير جداً',
              code:  'VALIDATION_ERROR',
            }));
          }
          reject(new Error('BODY_TOO_LARGE'));
          return;
        }
        body += chunk.toString();
      };

      req.on('data',  onData);
      req.on('end',   resolve);
      req.on('error', reject);
    });
  } catch (err) {
    if (err.message !== 'BODY_TOO_LARGE') {
      if (!res.writableEnded) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'خطأ في قراءة الطلب',
          code:  'VALIDATION_ERROR',
        }));
      }
    }
    return;
  }

  if (res.writableEnded) return;

  // ── 3. Parse JSON ──────────────────────────────────────────────
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'JSON غير صالح',
      code:  'VALIDATION_ERROR',
    }));
    return;
  }

  // ── 4. Validate message ────────────────────────────────────────
  const message = parsed.message;
  if (typeof message !== 'string' || message.trim().length === 0) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'الرسالة مطلوبة',
      code:  'VALIDATION_ERROR',
    }));
    return;
  }
  if (message.trim().length > MAX_MSG_CHARS) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: `الرسالة تتجاوز ${MAX_MSG_CHARS} حرف`,
      code:  'VALIDATION_ERROR',
    }));
    return;
  }

  // ── 5. Validate topic_filter ───────────────────────────────────
  const topic_filter = parsed.topic_filter ?? null;
  if (topic_filter !== null) {
    if (typeof topic_filter !== 'string' || topic_filter.length > MAX_TOPIC_LEN) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'topic_filter غير صالح',
        code:  'VALIDATION_ERROR',
      }));
      return;
    }
  }

  // ── 6. Validate history ────────────────────────────────────────
  const history = parsed.history ?? [];
  if (!Array.isArray(history)) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'history يجب أن يكون array',
      code:  'VALIDATION_ERROR',
    }));
    return;
  }
  if (history.length > MAX_HISTORY) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: `history يتجاوز ${MAX_HISTORY} عنصر`,
      code:  'VALIDATION_ERROR',
    }));
    return;
  }
  for (const item of history) {
    if (
      typeof item !== 'object' || item === null ||
      typeof item.role !== 'string' ||
      !VALID_ROLES.has(item.role) ||
      typeof item.text !== 'string' ||
      item.text.length === 0 ||
      item.text.length > MAX_ITEM_CHARS
    ) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'عنصر في history غير صالح',
        code:  'VALIDATION_ERROR',
      }));
      return;
    }
  }

  // ── 7. Validate session_id (optional) ──────────────────────────
  const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const session_id = (typeof parsed.session_id === 'string' && UUID_V4_RE.test(parsed.session_id))
    ? parsed.session_id
    : null;

  // ── 8. Attach to request ───────────────────────────────────
  req._validatedBody = {
    message:      message.trim(),
    topic_filter: topic_filter,
    history:      history,
    session_id:   session_id,
  };
}
