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
    });

    console.log('[config] ✅ تم تحميل الإعدادات من السيرفر');
    return true;

  } catch (err) {
    clearTimeout(timer);
    console.warn('[config] ⚠️ فشل تحميل الإعدادات — يتم استخدام القيم الاحتياطية:', err.message);
    return false;
  }
}
