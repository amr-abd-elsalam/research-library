// server/services/commands.js
// ═══════════════════════════════════════════════════════════════
// Slash command handlers — /ملخص, /مصادر, /اختبار, /مساعدة
// Each handler streams SSE responses like normal chat
// ═══════════════════════════════════════════════════════════════

import { streamGenerate, GeminiTimeoutError, GeminiSafetyError, GeminiEmptyError } from './gemini.js';
import { scroll }          from './qdrant.js';
import { logEvent }        from './analytics.js';
import { estimateTokens, estimateRequestCost } from './costTracker.js';
import config              from '../../config.js';

// ── Custom Error ───────────────────────────────────────────────
export class CommandError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'CommandError';
    this.code = code;
  }
}

// ── Command registry ───────────────────────────────────────────
const COMMAND_MAP = new Map([
  ['/ملخص',    handleSummary],
  ['/مصادر',   handleSources],
  ['/اختبار',  handleQuiz],
  ['/مساعدة',  handleHelp],
]);

/**
 * Checks if a message is a slash command.
 * @param {string} message — trimmed user message
 * @returns {string|null} command key or null
 */
export function matchCommand(message) {
  if (!config.COMMANDS?.enabled) return null;
  const prefix = config.COMMANDS?.prefix || '/';
  if (!message.startsWith(prefix)) return null;
  const cmd = message.split(/\s/)[0];
  if (COMMAND_MAP.has(cmd)) return cmd;
  return null;
}

/**
 * Executes a slash command with SSE streaming.
 */
export async function executeCommand(cmd, opts) {
  const handler = COMMAND_MAP.get(cmd);
  if (!handler) {
    opts.writeChunk({ error: true, message: 'أمر غير معروف', code: 'UNKNOWN_COMMAND' });
    return;
  }
  await handler(opts);
}

// ── Helper: fetch points from Qdrant with optional topic filter ──
async function fetchPoints(topicFilter) {
  const result = await scroll(true, 10000);
  let points = result?.points || [];

  // Apply topic filter if specified
  if (topicFilter !== null && topicFilter !== 'all') {
    const topicId = parseInt(topicFilter, 10);
    if (!Number.isNaN(topicId)) {
      points = points.filter(p => p.payload?.topic_id === topicId);
    }
  }

  return points;
}

// ── Helper: build sources array from points ────────────────────
function pointsToSources(points, max = 15) {
  return points.slice(0, max).map(p => {
    const payload = p.payload || {};
    const content = payload.parent_content || payload.content || '';
    return {
      file:    payload.file_name    || '',
      section: payload.section_title || '',
      snippet: content.slice(0, 150) + (content.length > 150 ? '...' : ''),
      content,
      score:   p.score != null ? Math.round(p.score * 10000) / 10000 : 0,
    };
  });
}

// ── Helper: build context string from points ───────────────────
function pointsToContext(points, max = 15) {
  return points.slice(0, max).map((p, i) => {
    const payload = p.payload || {};
    const path = Array.isArray(payload.section_path)
      ? payload.section_path.join(' > ')
      : payload.section_title || '';
    return `[${i + 1}] ${path}\n${payload.parent_content || payload.content}`;
  }).join('\n\n---\n\n');
}

// ═══════════════════════════════════════════════════════════════
// /مساعدة
// ═══════════════════════════════════════════════════════════════
async function handleHelp({ res, writeChunk, startTime, req }) {
  const commands = config.COMMANDS?.list || [];

  let text = '### الأوامر المتاحة\n\n';
  for (const c of commands) {
    text += `- **${c.cmd}** — ${c.desc}\n`;
  }
  text += '\nاكتب أي أمر في حقل الإدخال للاستخدام.';

  writeChunk({ text });
  writeChunk({ done: true, sources: [], score: 0 });
  res.end();

  logEvent({
    event_type: 'command', req, topic_filter: null,
    message_length: '/مساعدة'.length, response_length: text.length,
    embedding_tokens: 0, generation_tokens: 0,
    latency_ms: Date.now() - startTime, score: 0,
    sources_count: 0, cache_hit: false, estimated_cost: 0,
  }).catch(() => {});
}

// ═══════════════════════════════════════════════════════════════
// /مصادر
// ═══════════════════════════════════════════════════════════════
async function handleSources({ res, writeChunk, startTime, req, topic_filter }) {
  try {
    const points = await fetchPoints(topic_filter);

    const fileMap = new Map();
    for (const p of points) {
      const file = p.payload?.file_name || 'غير معروف';
      if (!fileMap.has(file)) fileMap.set(file, new Set());
      const section = p.payload?.section_title || '';
      if (section) fileMap.get(file).add(section);
    }

    let text = '### المصادر المتاحة في المكتبة\n\n';
    let fileIndex = 0;
    for (const [file, sections] of fileMap) {
      fileIndex++;
      text += `**${fileIndex}. ${file}**\n`;
      for (const sec of sections) {
        text += `- ${sec}\n`;
      }
      text += '\n';
    }
    text += `إجمالي: **${fileMap.size}** ملف، **${points.length}** مقطع نصي.`;

    writeChunk({ text });
    writeChunk({ done: true, sources: [], score: 0 });
    res.end();

    logEvent({
      event_type: 'command', req, topic_filter: topic_filter || null,
      message_length: '/مصادر'.length, response_length: text.length,
      embedding_tokens: 0, generation_tokens: 0,
      latency_ms: Date.now() - startTime, score: 0,
      sources_count: fileMap.size, cache_hit: false, estimated_cost: 0,
    }).catch(() => {});

  } catch (err) {
    console.error('[commands] /مصادر error:', err.message);
    writeChunk({ error: true, message: 'حدث خطأ في جلب المصادر', code: 'COMMAND_ERROR' });
    res.end();
  }
}

// ═══════════════════════════════════════════════════════════════
// /ملخص
// ═══════════════════════════════════════════════════════════════
async function handleSummary({ req, res, writeChunk, startTime, topic_filter }) {
  try {
    const points = await fetchPoints(topic_filter);
    if (!points.length) {
      writeChunk({ text: 'لا يوجد محتوى متاح لتلخيصه.' });
      writeChunk({ done: true, sources: [], score: 0 });
      res.end();
      return;
    }

    const context = pointsToContext(points, 15);
    const sources = pointsToSources(points, 15);

    const summaryPrompt = `أنت مساعد بحثي ذكي. المطلوب منك تقديم ملخص شامل ومنظم لكل المحتوى المقدّم إليك.

التعليمات:
- لخّص المحتوى في فقرات منظمة مع عناوين فرعية واضحة.
- غطّي كل المواضيع الرئيسية الموجودة في المحتوى.
- لا تخترع معلومات — لخّص فقط ما هو موجود.
- اكتب بالعربية بأسلوب واضح ومقروء.
- لا تذكر أسماء الملفات أو أرقام المراجع.`;

    let fullText = '';
    try {
      await streamGenerate(
        summaryPrompt, context, [],
        'قدّم ملخصاً شاملاً لكل المحتوى المتاح في المكتبة',
        (chunk) => { fullText += chunk; writeChunk({ text: chunk }); },
      );
    } catch (err) {
      if (err instanceof GeminiSafetyError) {
        writeChunk({ error: true, message: 'لا يمكن معالجة هذا الطلب', code: 'SAFETY_BLOCKED' });
        res.end(); return;
      }
      if (err instanceof GeminiEmptyError) {
        writeChunk({ error: true, message: 'لم يتمكن النظام من توليد ملخص', code: 'EMPTY_RESPONSE' });
        res.end(); return;
      }
      if (err instanceof GeminiTimeoutError) {
        writeChunk({ text: '\n\n⚠️ تم قطع الملخص بسبب انتهاء المهلة.' });
      }
      writeChunk({ done: true, sources, score: 0, partial: true });
      res.end(); return;
    }

    writeChunk({ done: true, sources, score: 0 });
    res.end();

    const genInputTokens  = estimateTokens(summaryPrompt) + estimateTokens(context);
    const genOutputTokens = estimateTokens(fullText);
    const cost = estimateRequestCost({
      embeddingInputTokens: 0, generationInputTokens: genInputTokens,
      generationOutputTokens: genOutputTokens,
    });

    logEvent({
      event_type: 'command', req, topic_filter: topic_filter || null,
      message_length: '/ملخص'.length, response_length: fullText.length,
      embedding_tokens: 0, generation_tokens: genOutputTokens,
      latency_ms: Date.now() - startTime, score: 0,
      sources_count: sources.length, cache_hit: false,
      estimated_cost: cost.total_cost,
    }).catch(() => {});

  } catch (err) {
    console.error('[commands] /ملخص error:', err.message);
    if (!res.writableEnded) {
      writeChunk({ error: true, message: 'حدث خطأ في توليد الملخص', code: 'COMMAND_ERROR' });
      res.end();
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// /اختبار
// ═══════════════════════════════════════════════════════════════
async function handleQuiz({ req, res, writeChunk, startTime, topic_filter }) {
  try {
    const points = await fetchPoints(topic_filter);
    if (!points.length) {
      writeChunk({ text: 'لا يوجد محتوى متاح لتوليد أسئلة منه.' });
      writeChunk({ done: true, sources: [], score: 0 });
      res.end();
      return;
    }

    const context = pointsToContext(points, 10);
    const sources = pointsToSources(points, 10);

    const quizPrompt = `أنت مساعد تعليمي ذكي. المطلوب منك توليد 5 أسئلة اختبارية من المحتوى المقدّم.

التعليمات:
- ولّد 5 أسئلة اختيار من متعدد (4 خيارات لكل سؤال).
- حدد الإجابة الصحيحة لكل سؤال.
- الأسئلة يجب أن تكون من المحتوى المقدّم فقط.
- نوّع مستوى الصعوبة بين سهل ومتوسط وصعب.
- اكتب بالعربية.
- نسّق كل سؤال بشكل واضح مع ترقيم.`;

    let fullText = '';
    try {
      await streamGenerate(
        quizPrompt, context, [],
        'ولّد 5 أسئلة اختبارية اختيار من متعدد من المحتوى المتاح',
        (chunk) => { fullText += chunk; writeChunk({ text: chunk }); },
      );
    } catch (err) {
      if (err instanceof GeminiSafetyError) {
        writeChunk({ error: true, message: 'لا يمكن معالجة هذا الطلب', code: 'SAFETY_BLOCKED' });
        res.end(); return;
      }
      if (err instanceof GeminiEmptyError) {
        writeChunk({ error: true, message: 'لم يتمكن النظام من توليد أسئلة', code: 'EMPTY_RESPONSE' });
        res.end(); return;
      }
      if (err instanceof GeminiTimeoutError) {
        writeChunk({ text: '\n\n⚠️ تم قطع الأسئلة بسبب انتهاء المهلة.' });
      }
      writeChunk({ done: true, sources, score: 0, partial: true });
      res.end(); return;
    }

    writeChunk({ done: true, sources, score: 0 });
    res.end();

    const genInputTokens  = estimateTokens(quizPrompt) + estimateTokens(context);
    const genOutputTokens = estimateTokens(fullText);
    const cost = estimateRequestCost({
      embeddingInputTokens: 0, generationInputTokens: genInputTokens,
      generationOutputTokens: genOutputTokens,
    });

    logEvent({
      event_type: 'command', req, topic_filter: topic_filter || null,
      message_length: '/اختبار'.length, response_length: fullText.length,
      embedding_tokens: 0, generation_tokens: genOutputTokens,
      latency_ms: Date.now() - startTime, score: 0,
      sources_count: sources.length, cache_hit: false,
      estimated_cost: cost.total_cost,
    }).catch(() => {});

  } catch (err) {
    console.error('[commands] /اختبار error:', err.message);
    if (!res.writableEnded) {
      writeChunk({ error: true, message: 'حدث خطأ في توليد الأسئلة', code: 'COMMAND_ERROR' });
      res.end();
    }
  }
}
