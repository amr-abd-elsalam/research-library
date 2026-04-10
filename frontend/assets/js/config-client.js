/* =============================================================
   config-client.js — Ai8V Smart Research Library
   يجلب الإعدادات من /api/config (مصدر واحد للحقيقة)
   مع fallback احتياطي إذا فشل الاتصال
   ============================================================= */

// ── المتغير العام — يبدأ بـ fallback ثم يُستبدل ─────────────
let CLIENT_CONFIG = Object.freeze({
  BRAND: Object.freeze({
    name:         "Smart Research Library",
    tagline:      "",
    logo:         "./assets/img/logo.png",
    primaryColor: "#10b981",
    domain:       "",
  }),
  META: Object.freeze({
    title: "Smart Research Library",
    description: "",
    lang: "ar",
    dir: "rtl",
  }),
  LIBRARY: Object.freeze({
    totalFiles:  0,
    domainLabel: "",
    showTopics:  true,
    categories:  [],
  }),
  CHAT: Object.freeze({
    welcomeTitle:   "مرحباً بك",
    welcomeSub:     "",
    placeholder:    "اكتب سؤالك هنا...",
    inputHint:      "",
    assistantLabel: "المساعد",
    userLabel:      "أنت",
    errorNetwork:   "تعذّر الاتصال",
    errorTimeout:   "استغرقت الإجابة وقتاً طويلاً",
    errorRate:      "يرجى الانتظار لحظة",
    errorServer:    "حدث خطأ",
    errorEmpty:     "لا تتضمن المكتبة معلومات كافية",
    typingText:     "جاري البحث...",
    sourcesLabel:   "المصادر",
    clearLabel:     "محادثة جديدة",
    sendLabel:      "إرسال",
    allTopicsLabel: "الكل",
    scopePrefix:    "نطاق البحث:",
    drawerClose:    "إغلاق",
    copyBtn:        "نسخ",
    copiedBtn:      "تم النسخ ✓",
    suggestions:    [],
  }),
  CONFIDENCE: Object.freeze({
    level5: Object.freeze({ min: 0.92, label: "تطابق عالي جداً" }),
    level4: Object.freeze({ min: 0.82, label: "تطابق عالي" }),
    level3: Object.freeze({ min: 0.72, label: "تطابق جيد" }),
    level2: Object.freeze({ min: 0.60, label: "تطابق متوسط" }),
    level1: Object.freeze({ min: 0.00, label: "تطابق ضعيف" }),
    lowWarning: "",
  }),
  LIMITS: Object.freeze({
    maxMessageChars: 500,
    maxHistoryItems: 20,
    streamDelay:     28,
  }),
  API: Object.freeze({
    chat:       "/api/chat",
    topics:     "/api/topics",
    health:     "/api/health",
    config:     "/api/config",
    authVerify: "/api/auth/verify",
  }),
  AUTH: Object.freeze({
    mode: "public",
  }),
  COMMANDS: Object.freeze({
    enabled: true,
    prefix:  '/',
    list:    [],
  }),
  SESSIONS: Object.freeze({
    enabled: false,
  }),
});

// ── دالة التحميل — تُستدعى من bootstrap.js ─────────────────
async function loadConfig() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch('/api/config', {
      signal: controller.signal,
      cache: 'no-cache',
    });
    clearTimeout(timer);

    if (!res.ok) {
      throw new Error('Config response: ' + res.status);
    }

    const data = await res.json();

    // ── استبدال CLIENT_CONFIG بالبيانات الحية ──
    CLIENT_CONFIG = Object.freeze({
      BRAND:      Object.freeze(data.BRAND      || CLIENT_CONFIG.BRAND),
      META:       Object.freeze(data.META        || CLIENT_CONFIG.META),
      LIBRARY:    Object.freeze(data.LIBRARY     || CLIENT_CONFIG.LIBRARY),
      CHAT:       Object.freeze(data.CHAT        || CLIENT_CONFIG.CHAT),
      CONFIDENCE: Object.freeze(data.CONFIDENCE  || CLIENT_CONFIG.CONFIDENCE),
      LIMITS:     Object.freeze(data.LIMITS      || CLIENT_CONFIG.LIMITS),
      API:        Object.freeze(data.API         || CLIENT_CONFIG.API),
      AUTH:       Object.freeze(data.AUTH         || CLIENT_CONFIG.AUTH),
      COMMANDS:   Object.freeze(data.COMMANDS     || CLIENT_CONFIG.COMMANDS),
      SESSIONS:   Object.freeze(data.SESSIONS     || CLIENT_CONFIG.SESSIONS),
      RESPONSE:   Object.freeze(data.RESPONSE     || { defaultMode: 'stream', allowedModes: ['stream'], conciseMaxSentences: 3 }),
      SUGGESTIONS: Object.freeze(data.SUGGESTIONS  || { enabled: false, maxSuggestions: 3 }),
      FEEDBACK:    Object.freeze(data.FEEDBACK      || { enabled: false, allowComments: true }),
      AUDIT:         Object.freeze(data.AUDIT          || { enabled: true }),
      LIBRARY_INDEX: Object.freeze(data.LIBRARY_INDEX  || { enabled: false }),
      CONTENT_GAPS:  Object.freeze(data.CONTENT_GAPS   || { enabled: false }),
      EXPORT:        Object.freeze(data.EXPORT          || { enabled: false }),
      QUALITY:       Object.freeze(data.QUALITY         || { enabled: false }),
      HEALTH_SCORE:    Object.freeze(data.HEALTH_SCORE    || { enabled: false }),
      ADMIN_ACTIONS:   Object.freeze(data.ADMIN_ACTIONS   || { enabled: true }),
      FEATURE_FLAGS:   Object.freeze(data.FEATURE_FLAGS   || { persistOverrides: false }),
      dynamicSuggestions: Array.isArray(data.dynamicSuggestions) ? Object.freeze(data.dynamicSuggestions) : null,
      libraries: data.libraries ? Object.freeze(data.libraries) : Object.freeze({ enabled: false, libraries: [] }),
    });

    // ── Phase 59: Store dynamic suggestions from server ───────────
    if (data.dynamicSuggestions !== undefined) {
      CLIENT_CONFIG = Object.freeze({
        ...CLIENT_CONFIG,
        dynamicSuggestions: Array.isArray(data.dynamicSuggestions) ? Object.freeze(data.dynamicSuggestions) : null,
      });
    }

    // ── Phase 46: Store effective feature state ───────────────────
    // Phase 90: extended to cover all 15 features (was 5 — GROUNDING/CITATION etc were missing)
    window.__effectiveFeatures = {
      FEEDBACK:           data.FEEDBACK?.effectiveEnabled           ?? data.FEEDBACK?.enabled           ?? false,
      SUGGESTIONS:        data.SUGGESTIONS?.effectiveEnabled        ?? data.SUGGESTIONS?.enabled        ?? false,
      CONTENT_GAPS:       data.CONTENT_GAPS?.effectiveEnabled       ?? data.CONTENT_GAPS?.enabled       ?? false,
      QUALITY:            data.QUALITY?.effectiveEnabled            ?? data.QUALITY?.enabled            ?? false,
      HEALTH_SCORE:       data.HEALTH_SCORE?.effectiveEnabled       ?? data.HEALTH_SCORE?.enabled       ?? false,
      ADMIN_INTELLIGENCE: false,
      RETRIEVAL:          false,
      QUERY_COMPLEXITY:   false,
      GROUNDING:          false,
      CITATION:           false,
      SEMANTIC_MATCHING:  false,
      COST_GOVERNANCE:    false,
      ANSWER_REFINEMENT:  false,
      QUERY_PLANNING:     false,
      RAG_STRATEGIES:     false,
    };

    console.log('[config] ✅ تم تحميل الإعدادات من السيرفر');

    // Phase 90: fetch full effective feature state from /api/config/features
    // This covers all 15 features (loadConfig above only sets 5 from config data)
    await window.refreshEffectiveFeatures();

    return true;

  } catch (err) {
    clearTimeout(timer);
    console.warn('[config] ⚠️ فشل تحميل الإعدادات — يتم استخدام القيم الاحتياطية:', err.message);
    return false;
  }
}

// ── Phase 46: Public API for effective feature state ──────────
window.getEffective = function(section) {
  return window.__effectiveFeatures?.[section.toUpperCase()] ?? false;
};

// ── Phase 46: On-demand refresh of effective feature state ────
// Phase 90: extended to cover all 15 features from /api/config/features
window.refreshEffectiveFeatures = async function() {
  try {
    var resp = await fetch('/api/config/features');
    if (!resp.ok) return;
    var data = await resp.json();
    window.__effectiveFeatures = {};
    for (var key in data) {
      if (typeof data[key] === 'boolean') {
        window.__effectiveFeatures[key] = data[key];
      }
    }
  } catch (_) {
    // Silent fail — keep existing values
  }
};
