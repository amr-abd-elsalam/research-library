// server/services/gemini.js

// ─── Constants ────────────────────────────────────────────────────────────────
const API_KEY = process.env.GEMINI_API_KEY ?? '';

const EMBED_MODEL    = 'gemini-embedding-001';
const EMBED_DIM      = 3072;
const GENERATE_MODEL = 'gemini-2.5-flash';

const EMBED_BASE_URL = `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:embedContent`;
const GEN_BASE_URL   = `https://generativelanguage.googleapis.com/v1beta/models/${GENERATE_MODEL}:streamGenerateContent?alt=sse`;

const EMBED_TIMEOUT_MS  =  8_000;
const STREAM_TIMEOUT_MS = 35_000;

// ─── Auth headers (key in header, not URL) ────────────────────────────────────
const AUTH_HEADERS = Object.freeze({
  'Content-Type':    'application/json',
  'x-goog-api-key':  API_KEY,
});

// ─── Custom Errors ────────────────────────────────────────────────────────────
export class GeminiTimeoutError extends Error {
  constructor(op) { super(`Gemini timeout: ${op}`); this.name = 'GeminiTimeoutError'; }
}
export class GeminiSafetyError extends Error {
  constructor() { super('Gemini safety block'); this.name = 'GeminiSafetyError'; }
}
export class GeminiEmptyError extends Error {
  constructor() { super('Gemini empty response'); this.name = 'GeminiEmptyError'; }
}
export class GeminiAPIError extends Error {
  constructor(status, body) {
    super(`Gemini API error ${status}`);
    this.name   = 'GeminiAPIError';
    this.status = status;
  }
}

// ─── embedText ────────────────────────────────────────────────────────────────
/**
 * Embeds a single text string using gemini-embedding-001.
 * @param {string} text       — النص المراد تضمينه
 * @param {string} taskType   — RETRIEVAL_QUERY للسؤال | RETRIEVAL_DOCUMENT للمحتوى
 * Returns float[] of length 3072.
 */
export async function embedText(text, taskType = 'RETRIEVAL_QUERY') {
  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), EMBED_TIMEOUT_MS);

  try {
    const res = await fetch(EMBED_BASE_URL, {
      method:  'POST',
      headers: AUTH_HEADERS,
      body:    JSON.stringify({
        model:    `models/${EMBED_MODEL}`,
        content:  { parts: [{ text }] },
        taskType: taskType,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new GeminiAPIError(res.status, body);
    }

    const json   = await res.json();
    const vector = json?.embedding?.values;

    if (!Array.isArray(vector) || vector.length !== EMBED_DIM) {
      throw new GeminiAPIError(200, `Invalid embedding dimension: expected ${EMBED_DIM}, got ${vector?.length}`);
    }

    return vector;

  } catch (err) {
    if (err.name === 'AbortError') throw new GeminiTimeoutError('embed');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// ─── streamGenerate ───────────────────────────────────────────────────────────
/**
 * Streams a generation from Gemini 2.5 Flash.
 * Calls onChunk(text) for each text delta.
 * Returns { finishReason } when done.
 */
export async function streamGenerate(systemPrompt, context, history, question, onChunk) {
  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), STREAM_TIMEOUT_MS);

  // Build contents array from history + current question
  const contents = [];

  for (const item of (history ?? [])) {
    if (item.role === 'user'  && item.text) contents.push({ role: 'user',  parts: [{ text: item.text }] });
    if (item.role === 'model' && item.text) contents.push({ role: 'model', parts: [{ text: item.text }] });
  }

  const userTurn = context
    ? `السياق من المكتبة:\n${context}\n\nالسؤال: ${question}`
    : question;

  contents.push({ role: 'user', parts: [{ text: userTurn }] });

  const body = JSON.stringify({
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents,
    generationConfig: {
      temperature:     0.2,
      maxOutputTokens: 2048,
    },
  });

  let res;
  try {
    res = await fetch(GEN_BASE_URL, {
      method:  'POST',
      headers: AUTH_HEADERS,
      body,
      signal:  controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') throw new GeminiTimeoutError('stream');
    throw err;
  }

  if (!res.ok) {
    clearTimeout(timer);
    const errBody = await res.text().catch(() => '');
    throw new GeminiAPIError(res.status, errBody);
  }

  // ── Read SSE stream ──────────────────────────────────────────────────────
  const reader  = res.body.getReader();
  const decoder = new TextDecoder();
  let   buffer  = '';
  let   hasText = false;
  let   finishReason = null;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // keep incomplete last line

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;

        const raw = trimmed.slice(5).trim();
        if (raw === '[DONE]') continue;

        let parsed;
        try { parsed = JSON.parse(raw); } catch { continue; }

        const candidate = parsed?.candidates?.[0];
        if (!candidate) continue;

        // Check finish reason
        if (candidate.finishReason) finishReason = candidate.finishReason;

        if (finishReason === 'SAFETY') {
          throw new GeminiSafetyError();
        }

        // Extract text delta
        const text = candidate?.content?.parts?.[0]?.text;
        if (text) {
          hasText = true;
          onChunk(text);
        }
      }
    }

    // Flush remaining buffer
    buffer += decoder.decode();

  } finally {
    reader.releaseLock();
    clearTimeout(timer);
  }

  if (!hasText) throw new GeminiEmptyError();

  return { finishReason };
}
