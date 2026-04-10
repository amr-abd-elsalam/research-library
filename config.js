// ═══════════════════════════════════════════════════════════════
// config.js — ملف الإعدادات الرئيسي (White-Label)
// ═══════════════════════════════════════════════════════════════
//
// 🔧 هذا هو الملف الوحيد الذي يتغير لكل عميل/مدرب
//    (بالإضافة إلى .env للمتغيرات البيئية)
//
// 📖 التعليمات:
//    - عدّل القيم أدناه حسب بيانات العميل
//    - لا تغيّر أسماء المفاتيح (keys)
//    - لا تحذف أي مفتاح — كلها مطلوبة
//    - بعد التعديل: pm2 restart [app-name]
//
// ═══════════════════════════════════════════════════════════════

// ── دالة تجميد عميق — تمنع التعديل العرضي أثناء التشغيل ────
function deepFreeze(obj) {
  Object.freeze(obj);
  for (const val of Object.values(obj)) {
    if (val && typeof val === 'object' && !Object.isFrozen(val)) {
      deepFreeze(val);
    }
  }
  return obj;
}

const config = {

  // ═══════════════════════════════════════════════════════════
  // 1. هوية العلامة التجارية (BRAND)
  //    — الاسم والشعار والألوان التي تظهر للطلاب
  // ═══════════════════════════════════════════════════════════
  BRAND: {
    // اسم المنصة — يظهر في الهيدر وعنوان الصفحة
    name: "Ai8V | Smart Research Library",

    // الشعار الفرعي — يظهر تحت الاسم في الهيدر
    tagline: "Mind & Machine | مساعدك البحثي الذكي",

    // مسار الشعار — ضع صورة الشعار في frontend/assets/img/
    logo: "./assets/img/logo.png",

    // اللون الرئيسي — يُستخدم للأزرار والروابط والعناصر المميزة
    // أمثلة: "#10b981" أخضر | "#3b82f6" أزرق | "#8b5cf6" بنفسجي
    primaryColor: "#10b981",

    // الدومين — يُستخدم في الـ SYSTEM_PROMPT ولأغراض التعريف
    domain: "chat.ai8v.com",
  },

  // ═══════════════════════════════════════════════════════════
  // 2. بيانات الصفحة (META)
  //    — تظهر في تبويب المتصفح ونتائج البحث
  // ═══════════════════════════════════════════════════════════
  META: {
    // عنوان الصفحة في تبويب المتصفح
    title: "Ai8V | Smart Research Library",

    // وصف الصفحة (SEO)
    description: "مساعد بحثي ذكي من Ai8V — اسأل واحصل على إجابات موثّقة بالمصادر من مكتبتك الخاصة",

    // اللغة واتجاه النص
    lang: "ar",
    dir:  "rtl",
  },

  // ═══════════════════════════════════════════════════════════
  // 3. معلومات المكتبة (LIBRARY)
  //    — إحصائيات وتصنيفات المحتوى
  // ═══════════════════════════════════════════════════════════
  LIBRARY: {
    // عدد الملفات المصدرية (يُحدَّث بعد تشغيل pipeline)
    totalFiles: 4,

    // تسمية مجال المكتبة — تظهر كنطاق بحث افتراضي
    // أمثلة: "مكتبة بحثية ذكية" | "أكاديمية أحمد" | "دورات البرمجة"
    domainLabel: "مكتبة بحثية ذكية",

    // ── شريط التصنيفات ────────────────────────────────────
    // true = يظهر | false = مخفي
    showTopics: false,

    // تصنيفات المحتوى — يحددها المدرب حسب كورساته/دوراته
    // إذا كانت فارغة [] — يتم جلب المواضيع تلقائياً من API
    // كل تصنيف: { id: "معرف فريد", label: "الاسم الظاهر" }
    // الـ id يُستخدم لتصفية البحث في Qdrant (topic_id)
    categories: [
      // مثال لمدرب:
      // { id: "web-dev",    label: "تطوير الويب" },
      // { id: "python",     label: "بايثون" },
      // { id: "databases",  label: "قواعد البيانات" },
    ],
  },

  // ═══════════════════════════════════════════════════════════
  // 4. نصوص واجهة المحادثة (CHAT)
  //    — كل النصوص التي يراها الطالب في الواجهة
  // ═══════════════════════════════════════════════════════════
  CHAT: {
    // ── شاشة الترحيب ──────────────────────────────────────
    welcomeTitle:  "مرحباً بك في مكتبة Ai8V البحثية",
    welcomeSub:    "اسأل أي سؤال واحصل على إجابات موثّقة حصرياً من محتوى المكتبة مع ذكر المصادر الدقيقةهذا نموذج تجريبي يوضح كيف يعمل مساعد الذكاء الاصطناعي على ملفاتك الخاصة — جرّب أن تسأل أي سؤال",

    // ── حقل الإدخال ───────────────────────────────────────
    placeholder:   "اكتب سؤالك هنا...",
    inputHint:     "Enter للإرسال · Shift+Enter لسطر جديد · الإجابات من المكتبة فقط",

    // ── تسميات العناصر ────────────────────────────────────
    assistantLabel: "مساعد Ai8V",
    userLabel:      "أنت",
    sourcesLabel:   "المصادر",
    clearLabel:     "مسح المحادثة",
    sendLabel:      "إرسال",
    allTopicsLabel: "كل المكتبة",
    scopePrefix:    "نطاق البحث الحالي:",

    // ── حالات الانتظار ────────────────────────────────────
    typingText:    "جاري البحث في المكتبة...",

    // ── رسائل الأخطاء ────────────────────────────────────
    errorNetwork:  "تعذّر الاتصال، يرجى المحاولة مرة أخرى",
    errorTimeout:  "استغرقت الإجابة وقتاً طويلاً، يرجى المحاولة مرة أخرى",
    errorRate:     "يرجى الانتظار لحظة قبل إرسال سؤال جديد",
    errorServer:   "حدث خطأ في المعالجة، يرجى المحاولة مرة أخرى",
    errorBudget:   "تم تجاوز الحد المسموح من الاستخدام لهذه الجلسة. يرجى بدء جلسة جديدة.",
    errorEmpty:    "لا تتضمن المكتبة معلومات كافية حول هذا الموضوع",

    // ── أزرار ─────────────────────────────────────────────
    copyBtn:       "نسخ",
    copiedBtn:     "تم النسخ ✓",
    drawerClose:   "إغلاق",

    // ── الأسئلة المقترحة ──────────────────────────────────
    // تظهر في شاشة الترحيب — خصّصها حسب محتوى المدرب
    suggestions: [
      "ما هي المنصة وما الذي تقدمه للمدرّب؟",
      "ما الفرق بين مساعد الذكاء الاصطناعي وChatGPT العادي؟",
      "ما الباقات والأسعار المتاحة؟",
      "هل المنصة تعمل على الموبايل؟",
    ],
  },

  // ═══════════════════════════════════════════════════════════
  // 5. مستويات الثقة (CONFIDENCE)
  //    — تحدد كيف يُعرض مستوى تطابق الإجابة
  //    — لا تحتاج تعديل عادةً
  // ═══════════════════════════════════════════════════════════
  CONFIDENCE: {
    level5: { min: 0.92, label: "تطابق عالي جداً" },
    level4: { min: 0.82, label: "تطابق عالي" },
    level3: { min: 0.72, label: "تطابق جيد" },
    level2: { min: 0.60, label: "تطابق متوسط" },
    level1: { min: 0.00, label: "تطابق ضعيف" },
    lowWarning: "المعلومات المتاحة محدودة حول هذا الموضوع",
  },

  // ═══════════════════════════════════════════════════════════
  // 6. حدود الاستخدام (LIMITS)
  //    — لا تحتاج تعديل عادةً
  // ═══════════════════════════════════════════════════════════
  LIMITS: {
    maxMessageChars: 500,    // أقصى عدد أحرف في الرسالة
    maxHistoryItems: 20,     // أقصى عدد رسائل محفوظة في الجلسة
    streamDelay:     28,     // تأخير عرض الكلمات (مللي ثانية) — للتأثير البصري
  },

  // ═══════════════════════════════════════════════════════════
  // 7. مسارات API (API)
  //    — لا تغيّر هذه القيم
  // ═══════════════════════════════════════════════════════════
  API: {
    chat:       "/api/chat",
    topics:     "/api/topics",
    health:     "/api/health",
    config:     "/api/config",
    adminStats:    "/api/admin/stats",
    authVerify:    "/api/auth/verify",
    sessions:      "/api/sessions",
    adminSessions: "/api/admin/sessions",
  },

  // ═══════════════════════════════════════════════════════════
  // 8. الأوامر (COMMANDS)
  //    — أوامر / المتاحة للمستخدم
  //    — لا تحتاج تعديل عادةً
  // ═══════════════════════════════════════════════════════════
  COMMANDS: {
    enabled: true,
    prefix:  '/',
    list: [
      { cmd: '/ملخص',    label: 'ملخص شامل',       desc: 'ملخص شامل من محتوى المكتبة' },
      { cmd: '/مصادر',   label: 'عرض المصادر',      desc: 'قائمة بكل الملفات والأقسام المتاحة' },
      { cmd: '/اختبار',  label: 'أسئلة اختبارية',   desc: 'توليد أسئلة اختبارية من المحتوى' },
      { cmd: '/مساعدة',  label: 'المساعدة',         desc: 'عرض الأوامر المتاحة' },
    ],
  },

  // ═══════════════════════════════════════════════════════════
  // 9. أوامر مخصصة (CUSTOM_COMMANDS)
  //    — أوامر إضافية يحددها المدرب
  //    — كل أمر يرجع نص ثابت بدون بحث في المكتبة
  //    — اتركها فارغة [] لو مش محتاج أوامر إضافية
  // ═══════════════════════════════════════════════════════════
  CUSTOM_COMMANDS: [
    // مثال — احذف أو عدّل حسب الاحتياج:
    // {
    //   name:        '/باقات',
    //   aliases:     ['/packages', '/اسعار'],
    //   description: 'عرض الباقات والأسعار المتاحة',
    //   text:        'الباقات المتاحة:\n- أساسية: 99$/شهر\n- متقدمة: 199$/شهر\n- احترافية: 399$/شهر',
    // },
  ],

  // ═══════════════════════════════════════════════════════════
  // 10. الجلسات (SESSIONS)
  //    — حفظ المحادثات على السيرفر
  //    — معطّل افتراضياً — فعّله من هنا
  //    — لا يحتاج أي خدمة خارجية (file-based)
  // ═══════════════════════════════════════════════════════════
  SESSIONS: {
    enabled:              true,     // true = حفظ المحادثات على السيرفر | false = المتصفح فقط
    maxMessages:          100,      // أقصى عدد رسائل في session واحدة
    ttlDays:              30,       // مدة الاحتفاظ بالـ session (بالأيام)
    maxSessions:          10000,    // أقصى عدد sessions محفوظة
    maxTokensPerSession:  0,        // أقصى tokens per session (0 = بدون حد). مثلاً 50000 = ~25 سؤال متوسط
    enableReplay:         false,    // true = تفعيل Session Replay (إعادة بناء المحادثة من الـ audit trail) | false = معطّل. يتطلب AUDIT.enabled: true
  },

  // ═══════════════════════════════════════════════════════════
  // 11. إدارة السياق (CONTEXT)
  //    — تحكم في حجم السياق المُرسل للنموذج
  //    — تقلل التكلفة وتحسّن جودة المحادثات الطويلة
  //    — لا تحتاج تعديل عادةً
  // ═══════════════════════════════════════════════════════════
  CONTEXT: {
    maxTokenBudget:    6000,  // أقصى tokens للسياق + التاريخ (بدون system prompt)
    contextRatio:      0.7,   // نسبة الـ budget لنتائج البحث (الباقي للتاريخ)
    compactAfterTurns: 12,    // ضغط التاريخ بعد هذا العدد من الرسائل (0 = بدون ضغط)

    // ── Intelligent Compaction (Phase 28) ─────────────────────
    intelligentCompaction: true,       // true = تفعيل ذاكرة المحادثة + local rewrite لأسئلة المتابعة البسيطة | false = السلوك الحالي بالظبط
    compactionStrategy:   'summarize', // استراتيجية ضغط السياق — reserved for future phases ('summarize' | 'entity_only')
    maxContextEntities:   20,          // أقصى عدد entities محفوظة per session (الأقدم يتحذف أولاً)

    // ── Session Eviction (Phase 30) ───────────────────────────
    evictionEnabled:      true,        // true = حذف الـ sessions الخاملة تلقائياً | false = تعيش للأبد (السلوك الحالي بالظبط). يعمل فقط لما intelligentCompaction: true
    evictionIdleMs:       1800000,     // مللي ثانية — session تبقى idle بعدها قبل الحذف (minimum 60000). 1800000 = 30 دقيقة
    evictionIntervalMs:   300000,      // مللي ثانية بين كل sweep (minimum 60000). 300000 = 5 دقائق

    // ── Context Persistence (Phase 31) ────────────────────────
    persistContext:        false,       // true = حفظ الـ context على الديسك واستعادته عند resume | false = ذاكرة فقط (السلوك الحالي بالظبط). يعمل فقط لما intelligentCompaction: true
    contextDir:           './data/context',  // مجلد حفظ ملفات الـ context — كل session = ملف JSON واحد ({sessionId}.json). يتعمل تلقائياً لو مش موجود

    // ── Rolling Quality Score (Phase 87) ──────────────────────
    rollingQualityAlpha:  0.3,         // 0-1: weight for exponential moving average of search quality scores. 0.3 = recent scores matter ~30%. Used by RAGStrategySelector for stable quality-based decisions
  },

  // ═══════════════════════════════════════════════════════════
  // 12. أسئلة المتابعة (FOLLOWUP)
  //    — إعادة صياغة الأسئلة القصيرة/السياقية تلقائياً
  //    — يحسّن جودة البحث في المحادثات المتعددة الأدوار
  //    — لا تحتاج تعديل عادةً
  // ═══════════════════════════════════════════════════════════
  FOLLOWUP: {
    enabled:          true,    // true = اكتشاف وإعادة صياغة الأسئلة السياقية
    minConfidence:    0.33,    // حد أدنى لثقة الاكتشاف (0-1) لتفعيل إعادة الصياغة
    rewriteTimeoutMs: 5000,   // مهلة الـ API call (مللي ثانية)
    maxHistoryItems:  4,       // عدد الرسائل السابقة المُرسلة لإعادة الصياغة
  },

  // ═══════════════════════════════════════════════════════════
  // 13. لوحة التحكم (ADMIN)
  //    — إعدادات لوحة تحكم الأدمن
  //    — لا تحتاج تعديل عادةً
  // ═══════════════════════════════════════════════════════════
  ADMIN: {
    refreshIntervalMs: 60000,   // auto-refresh كل 60 ثانية
    sessionsPageSize:  20,       // عدد sessions في الصفحة
    showCost:          true,     // عرض قسم التكاليف
    showHealth:        true,     // عرض حالة النظام
  },

  // ═══════════════════════════════════════════════════════════
  // 14. تعليمات النموذج (SYSTEM_PROMPT)
  //    — التعليمات التي تُرسل لـ Gemini مع كل سؤال
  //    — خصّصها حسب تخصص المدرب ونوع المحتوى
  // ═══════════════════════════════════════════════════════════
  SYSTEM_PROMPT: `أنت مساعد بحثي ذكي تابع لمنصة Ai8V — Smart Research Library.
مهمتك هي الإجابة على أسئلة المستخدمين بدقة وحصرياً من المحتوى المقدّم إليك.

التعليمات:
- أجب فقط وحصرياً من المحتوى المقدّم إليك في السياق.
- إذا لم تجد الإجابة في المحتوى، قل بوضوح: "لا تتضمن المكتبة معلومات كافية حول هذا السؤال."
- لا تذكر أسماء الملفات أو أرقام المراجع أو أي إشارة مثل [1] أو [2] في إجابتك — المصادر تُعرض تلقائياً للمستخدم.
- لا تُدرج أسئلة داخل الإجابة — أجب مباشرة بدون تكرار السؤال أو ذكر أسئلة أخرى.
- لا تخترع معلومات ولا تستنتج خارج النص المقدّم.
- أجب بنفس لغة السؤال.
- نسّق إجابتك بشكل واضح ومقروء باستخدام عناوين ونقاط عند الحاجة.
- إذا كان السؤال عاماً، قدّم ملخصاً شاملاً مما هو متاح في المكتبة.`,

  // ═══════════════════════════════════════════════════════════
  // 15. Pipeline (PIPELINE)
  //    — تحكم في سلوك الـ RAG pipeline
  //    — لا تحتاج تعديل عادةً
  // ═══════════════════════════════════════════════════════════
  PIPELINE: {
    enableTracing:    true,    // تسجيل مراحل كل request (EventTrace)
    traceInAnalytics: false,   // حفظ الـ trace المضغوط في JSONL analytics log
    enableHooks:      true,    // تفعيل pipeline hooks (beforeStage/afterStage/beforePipeline/afterPipeline)
    metricsEnabled:   true,    // تجميع مقاييس الأداء في الذاكرة (P50/P95/P99 latency, counters)
    metricsWindow:    2000,    // أقصى عدد observations لكل histogram (sliding window)

    // ── Stage Retry (Phase 18) ────────────────────────────────
    // أي stage مش مذكور هنا = 0 retries (default)
    // ⚠️ لا تعمل retry للـ stageStream — streaming مش safe للإعادة
    retryableStages: {
      // stageEmbed:  { maxRetries: 1, backoffMs: 500 },
      // stageSearch: { maxRetries: 1, backoffMs: 300 },
    },

    // ── Circuit Breaker (Phase 18) ────────────────────────────
    // يحمي من external service failures (Gemini, Qdrant)
    // لما service يفشل failureThreshold مرات متتالية → الـ circuit يتفتح
    // → كل call يرجع error فوراً بدل ما ينتظر timeout
    // → بعد resetAfterMs → يحاول مرة تانية (half-open)
    circuitBreaker: {
      enabled:          false,    // true = تفعيل circuit breaker | false = معطّل (zero overhead)
      failureThreshold: 3,       // عدد الفشل المتتالي قبل فتح الـ circuit
      resetAfterMs:     30000,   // مللي ثانية قبل المحاولة مرة تانية (half-open)
    },

    // ── Intent Classifier (Phase 21) ──────────────────────────
    // يكتشف intent المستخدم: command (بدون /) أو meta (عن المنصة) أو search (RAG)
    // لما يكتشف command intent → ينفذ الأمر بدون pipeline
    // لما يكتشف meta intent → ممكن يعمل skip لـ stages عبر stageGating
    intentClassifier: {
      enabled:           true,    // true = تفعيل intent classification | false = كل رسالة تروح pipeline
      commandThreshold:  0.6,     // حد أدنى confidence لتحويل رسالة لأمر (0-1). 0.6 = متوازن
      patterns:          [],      // patterns إضافية — فارغ = builtin patterns فقط
                                  // شكل كل pattern: { pattern: "regex string", command: "/اسم_الأمر" }
    },

    // ── Stage Gating (Phase 21) ────────────────────────────────
    // يسمح بعمل skip لـ stages محددة حسب نوع الـ intent
    // فارغ {} = كل الـ stages تتنفذ دائماً (السلوك الحالي بالظبط)
    // مثال: { meta: ['stageEmbed', 'stageSearch'] } → meta queries تتجاوز الـ embedding والبحث
    // ⚠️ لا تعمل skip لـ stageTranscriptInit أو stageStream — ضرورية لكل request
    stageGating: {
      // meta: ['stageEmbed', 'stageSearch'],  // uncomment لتفعيل — يوفّر latency + tokens لـ meta queries
    },

    // ── Adaptive Pipeline Analytics (Phase 22) ────────────────
    // يحلل بيانات الأداء المتراكمة ويقدم توصيات + تحسينات تلقائية
    // معطّل افتراضياً — فعّله بعد ما يكون عندك بيانات كافية (50+ request)
    adaptiveEnabled:    false,    // true = تفعيل التحليل الذكي | false = معطّل (zero overhead)
    adaptiveCooldownMs: 60000,    // مللي ثانية بين كل إعادة حساب (minimum 30000). 60000 = دقيقة
    adaptiveThresholds: {
      stageP95WarnMs:   2000,    // P95 أعلى من كده يطلع warning لأي stage
      cacheHitRateWarn: 0.10,    // أقل من كده يطلع توصية لتحسين الكاش
      errorRateWarn:    0.05,    // أعلى من كده يطلع critical warning
    },

    // ── Metrics Persistence (Phase 23) ────────────────────────
    // يحفظ snapshot دوري لملف JSON عشان الـ metrics ما تروحش عند restart
    // بيعيد تحميل الـ snapshot تلقائياً في الـ bootstrap
    // معطّل افتراضياً — فعّله في production عشان الـ PipelineAnalytics يبدأ بـ historical data بعد restart
    snapshotEnabled:    false,        // true = حفظ snapshot دوري | false = in-memory فقط (zero overhead)
    snapshotIntervalMs: 300000,       // مللي ثانية بين كل حفظ (minimum 60000). 300000 = 5 دقائق
    snapshotPath:       './data/metrics-snapshot.json',  // مسار ملف الـ snapshot (الـ directory يتعمل تلقائياً)

    // ── Pipeline Request Timeout (Phase 49) ─────────────────────
    // أقصى مدة لتنفيذ الـ pipeline الكامل (مللي ثانية).
    // لو الـ pipeline أخد أكتر من كده → يتوقف gracefully ويرجع abort.
    // القيمة الافتراضية (25 ثانية) أقل من server.timeout (30 ثانية) — ده يسمح بـ graceful cleanup.
    // ضعها على 0 لتعطيل الـ timeout (غير مستحسن في production).
    maxRequestMs:       25000,
  },

  // ═══════════════════════════════════════════════════════════
  // 16. نظام الإضافات (PLUGINS)
  //    — يسمح بتوسيع المنصة بدون تعديل الكود المصدري
  //    — معطّل افتراضياً — فعّله من هنا
  //    — الـ plugins تقدر تضيف: hooks على الـ pipeline، أوامر جديدة، listeners
  //    — لا تحتاج أي dependency خارجية
  // ═══════════════════════════════════════════════════════════
  PLUGINS: {
    enabled:          false,    // true = تفعيل نظام الـ plugins | false = معطّل بالكامل (zero overhead)
    allowFilePlugins: false,    // true = تحميل plugins من مجلد ./plugins/ | false = inline فقط (أأمن)
    dir:              './plugins',  // مجلد الـ plugins (نسبي من root المشروع) — يُقرأ فقط لو allowFilePlugins: true
    registered: [
      // ── Inline Plugins ───────────────────────────────────
      // كل plugin هو object فيه:
      // {
      //   name:        'my-plugin',           // اسم فريد (مطلوب)
      //   version:     '1.0.0',               // رقم الإصدار
      //   description: 'وصف قصير',            // يظهر في الـ inspect endpoint لاحقاً
      //   hooks: {                             // optional — hooks على الـ pipeline
      //     onInit:          async () => {},   // يتنفذ مرة عند الـ bootstrap
      //     beforePipeline:  (ctx, trace) => {},
      //     afterPipeline:   (ctx, trace) => {},
      //     beforeStage:     { 'stageSearch': (ctx, trace, stageName) => {} },
      //     afterStage:      { '*': (ctx, trace, stageName) => {} },  // wildcard
      //   },
      //   commands: [                          // optional — أوامر إضافية
      //     {
      //       name: '/باقات',
      //       aliases: ['/packages'],
      //       description: 'عرض الباقات والأسعار',
      //       text: 'الباقات المتاحة:\n- أساسية: 99$/شهر\n- متقدمة: 199$/شهر',
      //     },
      //   ],
      //   listeners: [                         // optional — EventBus listeners
      //     {
      //       event: 'pipeline:complete',
      //       handler: (data) => { console.log('plugin saw:', data.correlationId); },
      //     },
      //   ],
      // },
    ],
  },

  // ═══════════════════════════════════════════════════════════
  // 17. التسجيل والمراقبة (LOGGING)
  //    — يتحكم في مستوى تفاصيل الـ logs وتسجيل الأحداث التشغيلية
  //    — الأحداث التشغيلية تظهر في لوحة تحكم الأدمن
  //    — لا تحتاج تعديل عادةً
  // ═══════════════════════════════════════════════════════════
  LOGGING: {
    level:          'info',    // 'debug' | 'info' | 'warn' | 'error' — الحد الأدنى لمستوى الطباعة في الـ console
    operationalLog: true,      // true = تسجيل الأحداث التشغيلية في ring buffer (routing, cache, hooks, errors)
    maxEntries:     500,       // أقصى عدد entries في الـ operational log (in-memory ring buffer — الأقدم يتحذف أولاً)
    includeRequestId: true,    // Phase 67: تضمين requestId/sessionId في log entries (true = استخراج من detail._requestId/_sessionId)
  },

  // ═══════════════════════════════════════════════════════════
  // 18. أوضاع الرد (RESPONSE)
  //    — تحكم في شكل الرد المرجع من الـ chat endpoint
  //    — الوضع الافتراضي "stream" — SSE streaming (السلوك الحالي بالظبط)
  //    — "structured" يرجع JSON response كامل مرة واحدة (مفيد لـ API integrations)
  //    — "concise" يرجع رد مختصر عبر SSE (مفيد للأسئلة البسيطة)
  //    — لا تحتاج تعديل عادةً
  // ═══════════════════════════════════════════════════════════
  RESPONSE: {
    defaultMode:           'stream',                          // 'stream' | 'structured' | 'concise' — الوضع الافتراضي لو الـ client ما حددش
    allowedModes:          ['stream', 'structured', 'concise'], // الأوضاع المسموحة — شيل أي وضع مش عايزه يكون متاح
    conciseMaxSentences:   3,                                  // أقصى عدد جمل في الوضع المختصر (1-10)
    structuredIncludeTrace: false,                             // true = يضيف trace data في الـ structured JSON response (للتصحيح)
  },

  // ═══════════════════════════════════════════════════════════
  // 19. مستويات الصلاحيات (TIERS)
  //    — تحكم أدق في ما يستطيع كل مستوى وصول القيام به
  //    — معطّل افتراضياً — كل المستخدمين لهم نفس الصلاحيات
  //    — لما يتفعّل: الـ auth state (guest/member/admin) بيحدد الـ tier
  //    — كل tier يحدد: أوامر مسموحة، أوضاع رد، مواضيع، حد tokens
  //    — القيمة '*' = الكل مسموح (wildcard)
  //    — لا تحتاج تعديل عادةً
  // ═══════════════════════════════════════════════════════════
  TIERS: {
    enabled:     false,       // true = تفعيل مستويات الصلاحيات | false = الكل متساوي (السلوك الحالي بالظبط)
    defaultTier: 'member',    // المستوى الافتراضي لأي مستخدم authenticated (PIN أو token)
    guestTier:   'guest',     // المستوى لأي مستخدم بدون auth (لو وضع الوصول public)
    definitions: {
      guest: {
        allowedCommands:      ['/مساعدة'],                  // أوامر مسموحة فقط ('*' = الكل)
        allowedModes:         ['stream'],                    // أوضاع الرد المسموحة ('*' = الكل)
        allowedTopics:        '*',                           // المواضيع المسموحة ('*' = الكل، أو array of topic IDs)
        maxTokensPerSession:  10000,                         // حد tokens خاص بالمستوى (0 = يستخدم SESSIONS.maxTokensPerSession)
      },
      member: {
        allowedCommands:      '*',
        allowedModes:         ['stream', 'concise'],
        allowedTopics:        '*',
        maxTokensPerSession:  0,                             // 0 = يستخدم الحد العام من SESSIONS.maxTokensPerSession
      },
      premium: {
        allowedCommands:      '*',
        allowedModes:         '*',                           // يشمل structured — مفيد لـ API integrations
        allowedTopics:        '*',
        maxTokensPerSession:  0,
      },
    },
  },

  // ═══════════════════════════════════════════════════════════
  // 20. اقتراحات المتابعة الذكية (SUGGESTIONS)
  //    — يولّد اقتراحات أسئلة متابعة بناءً على سياق المحادثة المتراكم
  //    — template-based — بدون استدعاء API (تكلفة صفر)
  //    — معطّل افتراضياً — فعّله من هنا
  //    — يتطلب: CONTEXT.intelligentCompaction: true (لبناء سياق المحادثة)
  //    — الاقتراحات تظهر تحت كل إجابة كأزرار قابلة للنقر
  // ═══════════════════════════════════════════════════════════
  SUGGESTIONS: {
    enabled:        true,     // true = تفعيل اقتراحات المتابعة الذكية | false = معطّل (السلوك الحالي بالظبط)
    maxSuggestions: 3,        // أقصى عدد اقتراحات لكل رد (1-5)
    minTurns:       1,        // أقل عدد turns قبل ما تبدأ الاقتراحات (0 = من أول رد)
    templates:      [],       // templates إضافية — فارغ = builtin templates فقط (reserved for future customization)
  },

  // ═══════════════════════════════════════════════════════════
  // 21. تقييم جودة الإجابات (FEEDBACK)
  //    — يسمح للمستخدم بتقييم كل إجابة (إعجاب/عدم إعجاب)
  //    — يربط التقييم بـ correlationId لتتبع الطلب الأصلي
  //    — معطّل افتراضياً — فعّله من هنا
  // ═══════════════════════════════════════════════════════════
  FEEDBACK: {
    enabled:          true,     // true = تفعيل نظام التقييم (👍👎) | false = مخفي بالكامل (zero overhead)
    allowComments:    true,     // true = يسمح للمستخدم بإضافة تعليق نصي مع التقييم | false = تقييم فقط بدون نص
    maxCommentLength: 200,      // أقصى أحرف في التعليق
  },

  // ═══════════════════════════════════════════════════════════
  // 22. ربط التقييمات ومسار التدقيق (AUDIT)
  //    — يربط correlationId بالسؤال والجواب (CorrelationIndex)
  //    — يبني per-session audit trail من أحداث المحادثة
  //    — مفعّل افتراضياً — أداة مراقبة مفيدة بدون risk
  // ═══════════════════════════════════════════════════════════
  AUDIT: {
    enabled:                   true,   // true = تفعيل الـ correlation index + audit trail | false = معطّل (zero overhead)
    maxCorrelationEntries:     500,    // أقصى entries في الـ correlation index (in-memory ring buffer — الأقدم يتحذف)
    maxAuditEntriesPerSession: 100,    // أقصى audit events per session
    maxAuditSessions:          200,    // أقصى sessions في الـ audit trail (الأقدم يتحذف)
    persistAudit:              false,  // true = حفظ الـ audit trail على الديسك واستعادته بعد restart | false = ذاكرة فقط (السلوك الحالي بالظبط). يعمل فقط لما enabled: true
    auditDir:                  './data/audit',  // مجلد حفظ ملفات الـ audit — كل session = ملف JSONL واحد ({sessionId}.jsonl). يتعمل تلقائياً لو مش موجود
  },

  // ═══════════════════════════════════════════════════════════
  // 23. فهرسة محتوى المكتبة (LIBRARY_INDEX)
  //    — يعمل introspection على Qdrant collection ويستخلص
  //      metadata عن الملفات والمواضيع ونقاط البيانات
  //    — معطّل افتراضياً — فعّله من هنا
  //    — يظهر في لوحة تحكم الأدمن (قسم "محتوى المكتبة")
  //    — لا يحتاج أي dependency خارجية
  // ═══════════════════════════════════════════════════════════
  LIBRARY_INDEX: {
    enabled:           false,      // true = تفعيل فهرسة محتوى المكتبة من Qdrant | false = معطّل (zero overhead — السلوك الحالي بالظبط)
    refreshIntervalMs: 3600000,    // مللي ثانية بين كل تحديث تلقائي (minimum 300000). 3600000 = ساعة واحدة
    includeFileList:   true,       // true = يحفظ قائمة أسماء الملفات في الفهرس (مفيد للعرض في لوحة التحكم) | false = إحصائيات فقط (عدد الملفات والمواضيع)
  },

  // ═══════════════════════════════════════════════════════════
  // 24. إثراء تعليمات النموذج (SYSTEM_PROMPT_ENRICHMENT)
  //    — يخلّي الـ system prompt ديناميكي — يتضمن معلومات المكتبة
  //      الفعلية (عدد الملفات، أسماء الأقسام، حجم المحتوى)
  //      من LibraryIndex عشان الـ LLM يعرف إيه اللي في المكتبة
  //    — معطّل افتراضياً — فعّله من هنا
  //    — يتطلب: LIBRARY_INDEX.enabled: true (لبناء فهرس المكتبة)
  //    — بدون overhead لما معطّل — الـ system prompt يفضل static
  // ═══════════════════════════════════════════════════════════
  SYSTEM_PROMPT_ENRICHMENT: {
    enabled:            false,     // true = إثراء system prompt ديناميكياً بمعلومات المكتبة الفعلية | false = السلوك الحالي بالظبط (static system prompt). يعمل فقط لما LIBRARY_INDEX.enabled: true
    includeTopicList:   true,      // true = يذكر أسماء الأقسام/التصنيفات المتاحة في المكتبة | false = يتجاوز
    includeFileCount:   true,      // true = يذكر عدد الملفات المصدرية وحجم المحتوى | false = يتجاوز
    includeLastRefresh: false,     // true = يذكر تاريخ آخر تحديث لفهرس المكتبة | false = يتجاوز (مش مفيد عادةً للمستخدم — بس مفيد للـ debugging)
    customPreamble:     '',        // نص إضافي يُضاف في بداية الـ system prompt الديناميكي (فارغ = بدون). مثال: "أنت مساعد متخصص في تطوير الويب" — يخلي الـ LLM يعرف تخصص المكتبة

    // ── Phase 41 — Gap-Aware Enrichment ─────────────────────
    includeKnownGaps:  false,       // true = إضافة تحذيرات المواضيع غير المغطاة في المكتبة إلى تعليمات النموذج | false = بدون (السلوك الحالي). يعمل فقط لما CONTENT_GAPS.enabled: true + SYSTEM_PROMPT_ENRICHMENT.enabled: true
    maxGapsInPrompt:   5,           // أقصى عدد مواضيع غير مغطاة يتم ذكرها في تعليمات النموذج (1-10). أكثر = tokens أكثر بس دقة أعلى
  },

  // ═══════════════════════════════════════════════════════════
  // 25. اكتشاف فجوات المحتوى (CONTENT_GAPS)
  //    — يكتشف الأسئلة اللي المكتبة مش بتجاوبها كويس
  //      (low confidence + low score + negative feedback)
  //      ويجمعها في clusters ذكية بناءً على keyword overlap
  //    — معطّل افتراضياً — فعّله من هنا
  //    — in-memory فقط — البيانات تضيع عند restart
  //    — zero overhead عند التعطيل
  // ═══════════════════════════════════════════════════════════
  CONTENT_GAPS: {
    enabled:            false,     // true = تفعيل اكتشاف فجوات المحتوى | false = معطّل بالكامل (zero overhead — السلوك الحالي بالظبط)
    maxGapEntries:      200,       // أقصى عدد entries في الـ ring buffer (in-memory). الأقدم يتحذف أولاً
    minFrequencyToShow: 2,         // أقل تكرار لعرض gap في الأدمن (1 = كل سؤال بدون إجابة يظهر)
    clusterThreshold:   0.6,       // حد التشابه لتجميع الأسئلة في cluster واحد (0-1). 0.6 = متساهل — أسئلة بتشترك في 60%+ من الكلمات المفتاحية يتجمعوا مع بعض
    lowScoreThreshold:  0.45,      // أسئلة بـ avgScore أقل من كده تُعتبر gap (حتى لو مش aborted). 0.45 يغطي الأسئلة اللي أخذت نتائج ضعيفة بدون ما يكونوا aborted

    // ── Persistence (Phase 39) ────────────────────────────────
    persistGaps:        false,     // true = حفظ gap entries على الديسك واستعادتها عند restart | false = in-memory فقط (السلوك الحالي بالظبط). يعمل فقط لما enabled: true
    gapDir:             './data/gaps',  // مجلد حفظ ملف الـ gaps — ملف واحد gaps.jsonl (append-only). يتعمل تلقائياً لو مش موجود
    alertThreshold:     0.20,      // نسبة الـ gap rate (gaps/requests) اللي لما تتعداها يظهر alert للأدمن في Content Gaps section. 0.20 = 20%
  },

  // ═══════════════════════════════════════════════════════════
  // 26. تصدير بيانات الأدمن (EXPORT)
  //    — يسمح للأدمن بتصدير بيانات المنصة كملفات JSON
  //    — معطّل افتراضياً — فعّله من هنا
  //    — يدعم: feedback, audit, gaps
  //    — الـ endpoint: GET /api/admin/export?type=feedback,audit,gaps
  // ═══════════════════════════════════════════════════════════
  EXPORT: {
    enabled:        false,       // true = تفعيل API التصدير | false = معطّل (404)
    allowedTypes:   ['feedback', 'audit', 'gaps', 'logs', 'grounding'],  // أنواع البيانات المسموح تصديرها (Phase 68: added 'logs', Phase 70: added 'grounding')
    maxExportRows:  10000,       // أقصى عدد صفوف لكل نوع بيانات في التصدير (حماية من exports كبيرة)
  },

  // ═══════════════════════════════════════════════════════════
  // 27. تقييم جودة البحث (QUALITY)
  //    — يحسب quality score لكل session بناءً على إشارات متعددة
  //    — معطّل افتراضياً — فعّله من هنا
  //    — in-memory فقط — البيانات تضيع عند restart
  //    — zero overhead عند التعطيل
  // ═══════════════════════════════════════════════════════════
  QUALITY: {
    enabled:              false,       // true = تفعيل حساب جودة البحث per session | false = معطّل (zero overhead)
    weights: {
      avgScore:           0.35,        // وزن متوسط درجة البحث (0-1)
      feedbackPositive:   0.30,        // وزن نسبة التقييمات الإيجابية
      completionRate:     0.20,        // وزن نسبة الأسئلة المكتملة (non-aborted)
      rewriteSuccess:     0.15,        // وزن نجاح إعادة الصياغة المحلية
    },
    sessionMinTurns:      2,           // أقل عدد أسئلة في session قبل حساب الـ quality score
  },

  // ═══════════════════════════════════════════════════════════
  // 28. تقييم صحة المكتبة (HEALTH_SCORE)
  //    — يحسب مؤشر صحة موحد (0-100) من بيانات الأداء المتراكمة
  //    — يظهر في لوحة تحكم الأدمن مع نقاط عمل مقترحة
  //    — معطّل افتراضياً — فعّله بعد ما يكون عندك بيانات كافية
  // ═══════════════════════════════════════════════════════════
  HEALTH_SCORE: {
    enabled:       false,      // true = تفعيل مؤشر صحة المكتبة | false = معطّل (zero overhead)
    weights: {
      qualityAvg:       0.25,  // وزن متوسط جودة الجلسات (من SessionQualityScorer)
      feedbackPositive: 0.20,  // وزن نسبة الفيدباك الإيجابي
      gapRate:          0.20,  // وزن نسبة الأسئلة بدون إجابة (معكوس — أقل = أفضل)
      cacheHitRate:     0.15,  // وزن نسبة الكاش (أعلى = أفضل)
      errorRate:        0.10,  // وزن نسبة الأخطاء (معكوس — أقل = أفضل)
      libraryCoverage:  0.10,  // وزن نسبة تغطية المكتبة (نسبة الأسئلة المُجابة)
    },
    actionItemThresholds: {
      criticalBelow:    40,    // مؤشر أقل من كده = حالة حرجة (أحمر)
      warningBelow:     70,    // مؤشر أقل من كده = تحذير (أصفر)
      maxActionItems:   5,     // أقصى عدد نقاط العمل المعروضة
    },
  },

  // ═══════════════════════════════════════════════════════════
  // 29. إجراءات الأدمن (ADMIN_ACTIONS)
  //    — يتحكم في تسجيل وتتبع الإجراءات الإدارية
  //    — يسجل كل action في audit trail للمراجعة والمحاسبة
  //    — مفعّل افتراضياً — خفيف ومفيد من اللحظة الأولى
  // ═══════════════════════════════════════════════════════════
  ADMIN_ACTIONS: {
    enabled:                true,       // true = تتبع الإجراءات الإدارية | false = معطّل
    auditEnabled:           true,       // true = تسجيل الإجراءات في audit trail | false = بدون تسجيل
    cooldownMs:             5000,       // مللي ثانية بين نفس نوع الإجراء (حماية من التكرار). 5000 = 5 ثوان
    healthScoreCacheTtlMs:  30000,      // مللي ثانية لتخزين نتيجة مؤشر الصحة مؤقتاً. 30000 = 30 ثانية
    toggleWhitelist:        [],         // أسماء الـ features المسموح تشغيلها/إيقافها في runtime — فارغ = toggle معطّل
                                        // أمثلة آمنة: ['SUGGESTIONS', 'CONTENT_GAPS', 'FEEDBACK', 'QUALITY', 'HEALTH_SCORE']
                                        // ⚠️ لا تضيف: PIPELINE, SESSIONS, AUDIT — هذه features بنيوية مش safe للتبديل أثناء التشغيل
  },

  // ═══════════════════════════════════════════════════════════
  // 30. إعدادات الـ Feature Flags (FEATURE_FLAGS)
  //    — تحكم في persistence الـ runtime overrides
  //    — معطّل افتراضياً — فعّله في production عشان الـ overrides تنجو من restart
  //    — لا تحتاج تعديل عادةً
  // ═══════════════════════════════════════════════════════════
  FEATURE_FLAGS: {
    persistOverrides:  false,              // true = حفظ الـ overrides على الديسك واستعادتها عند restart | false = ذاكرة فقط (السلوك الحالي بالظبط)
    overrideDir:       './data/overrides', // مجلد حفظ ملف الـ overrides (overrides.json) — يتعمل تلقائياً لو مش موجود
  },

  // ═══════════════════════════════════════════════════════════
  // 31. ذكاء النظام الإداري (ADMIN_INTELLIGENCE)
  //    — تحليل دوري لبيانات 6+ singletons (HealthScorer, PipelineAnalytics,
  //      FeedbackCollector, ContentGapDetector, SessionQualityScorer, Metrics + Cache)
  //    — يولّد insights مُرتّبة حسب الأولوية + auto-remediation اختياري
  //    — SSE endpoint لـ real-time admin notifications (اختياري)
  //    — معطّل افتراضياً — فعّله من هنا
  //    — zero overhead عند التعطيل
  // ═══════════════════════════════════════════════════════════
  ADMIN_INTELLIGENCE: {
    enabled:                 false,     // true = تحليل دوري للبيانات وتوليد insights | false = معطّل (zero overhead)
    analysisIntervalMs:      300000,    // مللي ثانية بين كل تحليل (minimum 60000). 300000 = 5 دقائق
    autoRemediationEnabled:  false,     // true = تنفيذ safe actions تلقائياً لما health score critical | false = insights فقط
    maxInsights:             10,        // أقصى عدد insights نشطة في الذاكرة
    notificationsEnabled:    false,     // true = SSE endpoint لـ real-time admin alerts | false = polling فقط
    notificationMaxQueue:    50,        // أقصى عدد notifications محفوظة في الذاكرة (ring buffer)
    insightCooldownMs:       600000,    // مللي ثانية — نفس الـ insight ما يتولدش مرتين خلال هذه المدة. 600000 = 10 دقائق
  },

  // ═══════════════════════════════════════════════════════════
  // 32. دعم مكتبات متعددة (MULTI_LIBRARY)
  //    — يسمح بربط أكثر من collection في Qdrant بنفس الـ instance
  //    — معطّل افتراضياً — لما معطّل = المشروع يشتغل بالسلوك الحالي بالظبط (collection واحدة من .env)
  //    — لا تحتاج تعديل عادةً
  // ═══════════════════════════════════════════════════════════
  MULTI_LIBRARY: {
    enabled:        false,       // true = دعم مكتبات متعددة | false = collection واحدة من .env (السلوك الحالي بالظبط)
    defaultLibrary: null,        // library ID الافتراضي — null = أول library في القائمة. يُستخدم لما المستخدم ما يحددش library
    libraries:      [
      // كل library = collection في Qdrant
      // {
      //   id:               'main',                    // معرف فريد (مطلوب)
      //   name:             'المكتبة الرئيسية',         // اسم ظاهر
      //   qdrantCollection: 'knowledge',               // اسم الـ collection في Qdrant
      //   domainLabel:      'مكتبة بحثية ذكية',         // يظهر في الـ frontend
      // },
    ],
  },

  // ═══════════════════════════════════════════════════════════
  // 33. Search Re-ranking (RETRIEVAL)
  //    — تحسين جودة نتائج البحث بعد Qdrant
  //    — يضيف keyword overlap scoring و source diversity enforcement
  //    — معطّل افتراضياً — فعّله من هنا أو عبر feature flags
  //    — لا يحتاج أي dependency خارجية
  // ═══════════════════════════════════════════════════════════
  RETRIEVAL: {
    rerankEnabled:    false,    // true = تفعيل re-ranking لنتائج البحث | false = استخدام ترتيب Qdrant كما هو (zero overhead)
    diversityWeight:  0.3,      // 0-1: وزن تنوع المصادر في حساب الـ score (يؤثر على vector weight allocation)
    keywordWeight:    0.3,      // 0-1: وزن تطابق الكلمات المفتاحية في حساب الـ combined score (0 = بدون keyword scoring)
    maxPerFile:       3,        // أقصى عدد نتائج من نفس الملف (الباقي يتأخر لآخر القائمة — لا يُحذف)
    minDiverseFiles:  2,        // أقل عدد ملفات مختلفة في النتائج (best-effort — لو المكتبة صغيرة ما يتحققش)
  },

  // ═══════════════════════════════════════════════════════════
  // 34. تحليل تعقيد الاستعلام (QUERY_COMPLEXITY)
  //    — يحلل مدى تعقيد السؤال ويكيّف الـ pipeline تبعاً لذلك
  //    — أسئلة بسيطة تحتاج hits أقل + بدون prompt instructions إضافية
  //    — أسئلة مقارنة/تحليلية تحتاج hits أكتر + prompt instructions مخصصة
  //    — معطّل افتراضياً — فعّله من هنا أو عبر feature flags
  //    — لا يحتاج أي dependency خارجية (in-memory regex فقط)
  // ═══════════════════════════════════════════════════════════
  QUERY_COMPLEXITY: {
    enabled:        false,    // true = تفعيل تحليل تعقيد الاستعلام | false = كل الأسئلة تُعامل كـ factual (zero overhead)
    includeInTrace: true,     // true = تسجيل complexity type + score في الـ trace | false = لا تسجيل
    strategies: {
      factual:     { maxTopK: 5,  promptSuffix: '' },
      comparative: { maxTopK: 8,  promptSuffix: 'قدّم المقارنة بشكل منظم مع إبراز أوجه التشابه والاختلاف.' },
      analytical:  { maxTopK: 10, promptSuffix: 'حلّل الموضوع بعمق مع تقديم الأدلة من المحتوى.' },
      multi_part:  { maxTopK: 10, promptSuffix: 'أجب على كل جزء من السؤال بشكل منفصل ومنظم.' },
      exploratory: { maxTopK: 8,  promptSuffix: 'قدّم نظرة شاملة ومتكاملة حول الموضوع.' },
    },
  },

  // ═══════════════════════════════════════════════════════════
  // 35. المراقبة والتتبع (OBSERVABILITY)
  //    — تحكم في تتبع الطلبات وفحص الخدمات الخارجية
  //    — X-Request-Id header مفعّل افتراضياً
  //    — الفحص الدوري للخدمات الخارجية معطّل افتراضياً
  //    — لا تحتاج تعديل عادةً
  // ═══════════════════════════════════════════════════════════
  OBSERVABILITY: {
    // X-Request-Id header — يُضاف لكل HTTP response
    requestIdEnabled: true,    // true = إضافة X-Request-Id header لكل response | false = بدون

    // فحص دوري للخدمات الخارجية (Qdrant + Gemini)
    // يظهر في /api/health response لما مفعّل
    periodicHealthCheck: {
      enabled:    false,       // true = فحص الخدمات الخارجية عند كل health check | false = معطّل (السلوك الحالي بالظبط)
      cacheTtlMs: 30000,       // مدة تخزين نتيجة الفحص مؤقتاً (مللي ثانية). 30000 = 30 ثانية
    },
  },

  // ═══════════════════════════════════════════════════════════
  // 36. فحص دقة الإجابات (GROUNDING)
  //    — يتحقق أن الإجابة مبنية فعلاً على محتوى المكتبة
  //    — post-generation check بدون API call (zero cost)
  //    — معطّل افتراضياً — فعّله من هنا أو عبر feature flags
  //    — لا يحتاج أي dependency خارجية (in-memory token overlap)
  // ═══════════════════════════════════════════════════════════
  GROUNDING: {
    enabled:           true,      // true = post-generation grounding check | false = no validation (zero overhead — السلوك الحالي بالظبط)
    minGroundingScore: 0.4,       // 0-1: إجابات بـ score أقل من كده تظهر مع تنبيه للمستخدم. 0.4 = متساهل (يسمح بإعادة الصياغة)
    warnUser:          true,      // true = إضافة تنبيه في الـ response لما الـ score منخفض | false = تسجيل بدون تنبيه
    includeInTrace:    true,      // true = تسجيل grounding score في الـ pipeline trace | false = لا تسجيل
    maxClaimsToCheck:  10,        // أقصى عدد claims يتم استخراجها من الإجابة للتحقق منها (1-20). أكثر = أدق بس أبطأ
  },

  // ═══════════════════════════════════════════════════════════
  // 37. تحليلات دقة الإجابات (GROUNDING_ANALYTICS)
  //    — يجمع إحصائيات عن مدى استناد الإجابات على محتوى المكتبة
  //    — يظهر في لوحة تحكم الأدمن (Content tab)
  //    — معطّل تلقائياً عندما GROUNDING معطّل
  //    — in-memory فقط — البيانات تضيع عند restart
  //    — zero overhead عند التعطيل
  // ═══════════════════════════════════════════════════════════
  GROUNDING_ANALYTICS: {
    maxEntries: 200,    // أقصى عدد entries في الـ ring buffer (in-memory). الأقدم يتحذف أولاً
  },

  // ═══════════════════════════════════════════════════════════
  // 38. إسناد المصادر (CITATION)
  //    — يربط كل جملة في الإجابة بمصدرها تلقائياً
  //    — يحسب مدى صلة كل مصدر بالسؤال
  //    — معطّل افتراضياً — فعّله من هنا
  //    — بدون استدعاء API (تكلفة صفر)
  //    — يعمل فقط لما GROUNDING مفعّل أو مستقل
  // ═══════════════════════════════════════════════════════════
  CITATION: {
    enabled:             true,      // true = تفعيل إسناد المصادر التلقائي | false = معطّل (zero overhead)
    showSourceRelevance: true,      // true = عرض نسبة صلة كل مصدر بالسؤال | false = بدون
    maxCitations:        5,         // أقصى عدد إسنادات لكل إجابة (1-20)
    minOverlap:          0.2,       // أقل نسبة تطابق لاعتبار الجملة مُسندة (0-1)
  },

  // ═══════════════════════════════════════════════════════════════
  // 39. المطابقة الدلالية (SEMANTIC_MATCHING)
  //    — يستخدم Gemini embeddings لتحسين دقة الـ grounding والـ citation
  //    — يعمل blending بين token overlap و cosine similarity
  //    — معطّل افتراضياً — فعّله من هنا
  //    — يتطلب: GROUNDING.enabled أو CITATION.enabled
  //    — بدون overhead لما معطّل — الـ grounding والـ citation يفضلوا token-only
  // ═══════════════════════════════════════════════════════════════
  SEMANTIC_MATCHING: {
    enabled:         false,    // true = semantic similarity for grounding + citation | false = token overlap only (zero overhead — السلوك الحالي بالظبط)
    tokenWeight:     0.5,      // 0-1: وزن token overlap في الـ blended score
    semanticWeight:  0.5,      // 0-1: وزن semantic (cosine) similarity في الـ blended score
    batchSize:       20,       // أقصى عدد texts يتم embed-ها في call واحد (cost control)
    fallbackOnError: true,     // true = يرجع لـ token-only عند فشل embedding | false = يعمل propagate للـ error
  },

  // ═══════════════════════════════════════════════════════════════
  // 40. مزوّد نموذج اللغة (LLM_PROVIDER)
  //    — يحدد أي LLM provider يُستخدم للـ embedding والـ generation
  //    — القيم الافتراضية تطابق Gemini (السلوك الحالي بالظبط)
  //    — غيّر الـ provider لتبديل بين Gemini / OpenAI / غيره
  //    — يتطلب وجود provider مسجّل بنفس الاسم في الـ registry
  // ═══════════════════════════════════════════════════════════════
  LLM_PROVIDER: {
    provider:        'gemini',           // اسم الـ provider المسجّل في الـ registry ('gemini' | 'openai' | ...)
    embedding: {
      model:         'gemini-embedding-001',  // اسم نموذج الـ embedding
      dimensions:    3072,                     // أبعاد vector الـ embedding
      timeoutMs:     8000,                     // مهلة استدعاء الـ embedding (مللي ثانية)
    },
    generation: {
      model:         'gemini-2.5-flash',       // اسم نموذج التوليد
      temperature:   0.2,                      // درجة الإبداع (0-1)
      maxOutputTokens: 2048,                   // أقصى عدد tokens في الإجابة
      timeoutMs:     35000,                    // مهلة استدعاء التوليد (مللي ثانية)
    },
    rewrite: {
      model:     null,       // null = يستخدم generation.model | string = نموذج مخصص لإعادة الصياغة (أسرع/أرخص). مثال: 'gemini-2.0-flash-lite' أو 'gpt-4o-mini'
      timeoutMs: 5000,       // مهلة استدعاء إعادة الصياغة (مللي ثانية) — fallback: FOLLOWUP.rewriteTimeoutMs
    },
  },

  // ═══════════════════════════════════════════════════════════════
  // 41. حوكمة التكلفة (COST_GOVERNANCE)
  //    — تتبع استهلاك الـ tokens الفعلي per session + per provider
  //    — حساب التكلفة بناءً على أسعار كل provider
  //    — معطّل افتراضياً — فعّله من هنا
  //    — zero overhead عند التعطيل
  // ═══════════════════════════════════════════════════════════════
  COST_GOVERNANCE: {
    enabled:            false,      // true = تتبع استهلاك الـ tokens الفعلي | false = معطّل (zero overhead)
    perProviderRates: {
      gemini: {
        inputPer1kTokens:  0.000125,   // USD per 1K input tokens
        outputPer1kTokens: 0.000375,   // USD per 1K output tokens
      },
      openai: {
        inputPer1kTokens:  0.00015,    // USD per 1K input tokens
        outputPer1kTokens: 0.0006,     // USD per 1K output tokens
      },
    },
    monthlyBudgetCeiling: 0,         // 0 = بدون حد شهري. > 0 = حد شهري بالدولار
    sessionWarnThreshold: 0.80,      // نسبة استهلاك الـ session التي يُطلق عندها تحذير (0-1)
    enforceBudget:        false,     // true = الـ pipeline يوقف لما session تتخطى token budget (actual tokens) | false = tracking فقط بدون enforcement (السلوك الحالي بالظبط). يعمل فقط لما enabled: true + SESSIONS.maxTokensPerSession > 0
  },

  // ═══════════════════════════════════════════════════════════════
  // 42. تحسين جودة الإجابات (ANSWER_REFINEMENT)
  //    — self-correction loop: يعيد توليد الإجابة بـ prompt أقوى
  //      لما الـ grounding score منخفض (الإجابة غير مستندة للمحتوى)
  //    — يعمل فقط في structured response mode (مش streaming)
  //    — يتطلب: GROUNDING.enabled: true (لفحص جودة الإجابة)
  //    — معطّل افتراضياً — فعّله من هنا
  //    — zero overhead عند التعطيل
  // ═══════════════════════════════════════════════════════════════
  ANSWER_REFINEMENT: {
    enabled:            false,     // true = إعادة توليد الإجابة لما الـ grounding score منخفض | false = بدون refinement (zero overhead — السلوك الحالي بالظبط)
    maxRefinements:     1,         // أقصى عدد محاولات إعادة التوليد (1-3). أكثر = جودة أعلى بس تكلفة أعلى
    minScoreToRetry:    0.3,       // grounding score أقل من كده يُفعّل إعادة التوليد (0-1). 0.3 = يعيد فقط للإجابات الضعيفة جداً
    refinementPromptSuffix: 'تعليمات صارمة: أجب فقط وحصرياً بناءً على المحتوى المقدم إليك. لا تضف أي معلومة من خارج النص. كل جملة في إجابتك يجب أن تكون مدعومة مباشرة بمحتوى من المكتبة. إذا لم تجد معلومة كافية، قل ذلك بوضوح.',
    streamingRevisionEnabled: false,  // true = send revision SSE chunk when grounding score is low in streaming mode | false = streaming mode skips refinement (السلوك الحالي بالظبط). يعمل فقط لما enabled: true + GROUNDING.enabled: true
  },

  // ═══════════════════════════════════════════════════════════════
  // 43. إثراء الردود المنظمة (STRUCTURED_OUTPUT)
  //    — يضيف نقاط رئيسية ومؤشر ثقة في الردود المنظمة (structured mode)
  //    — يعمل فقط في structured response mode
  //    — استخراج بدون API call (تكلفة صفر)
  //    — معطّل افتراضياً — فعّله من هنا
  // ═══════════════════════════════════════════════════════════════
  STRUCTURED_OUTPUT: {
    enabled:           false,        // true = إثراء الردود المنظمة بنقاط رئيسية ومؤشر ثقة | false = الرد المنظم كما هو (السلوك الحالي بالظبط)
    maxKeyPoints:      5,            // أقصى عدد نقاط رئيسية مستخرجة من الإجابة (1-10)
    includeConfidence: true,         // true = حساب مؤشر ثقة مركّب من search score + grounding score | false = بدون
  },

  // ═══════════════════════════════════════════════════════════════
  // 44. سجل الأوامر الموحد (ACTION_REGISTRY)
  //    — يجمع كل الأوامر والأدوات في سجل واحد قابل للبحث
  //    — يستورد الأوامر تلقائياً من CommandRegistry عند التشغيل
  //    — يظهر في inspect endpoint
  //    — معطّل افتراضياً — فعّله من هنا
  // ═══════════════════════════════════════════════════════════════
  ACTION_REGISTRY: {
    enabled:          false,        // true = تفعيل السجل الموحد | false = معطّل (zero overhead)
    includeInInspect: true,         // true = عرض بيانات السجل في inspect endpoint | false = إخفاء
  },

  // ═══════════════════════════════════════════════════════════════
  // 45. تخطيط الاستعلام الذكي (QUERY_PLANNING)
  //    — يحلل الأسئلة المركّبة ويقسمها لاستعلامات فرعية
  //    — كل استعلام فرعي يُبحث بشكل مستقل ثم تُدمج النتائج
  //    — يتطلب: QUERY_COMPLEXITY.enabled: true (لتحديد نوع التعقيد)
  //    — معطّل افتراضياً — فعّله من هنا
  //    — Pattern-based decomposition — بدون استدعاء API (تكلفة صفر)
  // ═══════════════════════════════════════════════════════════════
  QUERY_PLANNING: {
    enabled:               false,          // true = multi-step retrieval للأسئلة المركّبة | false = single-pass (السلوك الحالي بالظبط)
    maxSubQueries:         3,              // أقصى عدد استعلامات فرعية لكل سؤال (1-5)
    mergeStrategy:         'interleave',   // 'interleave' = round-robin من كل sub-query | 'concatenate' = flatten + sort by score | 'ranked' = weighted by position + score
    minComplexityForPlan:  'comparative',  // أقل مستوى تعقيد لتفعيل التخطيط ('comparative' | 'analytical' | 'multi_part'). 'factual' و 'exploratory' = لا تخطيط
    includeInTrace:        true,           // true = تسجيل تفاصيل التخطيط في الـ trace | false = لا تسجيل
    budgetPerSubQuery:     0.6,            // نسبة الـ topK لكل sub-query (0.3-1.0). 0.6 = كل sub-query يأخذ 60% من الـ topK الأصلي
  },

  // ═══════════════════════════════════════════════════════════════
  // 46. استراتيجيات البحث التكيّفية (RAG_STRATEGIES)
  //    — اختيار استراتيجية البحث والتوليد ديناميكياً
  //    — بناءً على نوع السؤال + موقعه في المحادثة + جودة النتائج
  //    — معطّل افتراضياً — فعّله من هنا
  //    — يتطلب: QUERY_COMPLEXITY.enabled: true
  //    — بدون استدعاء API — zero cost
  // ═══════════════════════════════════════════════════════════════
  RAG_STRATEGIES: {
    enabled:        false,    // true = تفعيل اختيار الاستراتيجية التكيّفي | false = معطّل (zero overhead — السلوك الحالي بالظبط)
    includeInTrace: true,     // true = تسجيل الاستراتيجية المختارة في الـ trace | false = لا تسجيل
    strategies: {
      quick_factual: {
        topK: 3,
        skipStages: ['stageRerank', 'stageGroundingCheck', 'stageCitationMapping'],
        promptSuffix: '',
        preferLocalRewrite: true,
      },
      deep_analytical: {
        topK: 10,
        skipStages: [],
        promptSuffix: 'حلّل الموضوع بعمق واستند إلى كل المصادر المتاحة.',
        preferLocalRewrite: false,
      },
      conversational_followup: {
        topK: 5,
        skipStages: ['stageQueryPlan'],
        promptSuffix: '',
        preferLocalRewrite: true,
      },
      exploratory_scan: {
        topK: 8,
        skipStages: [],
        promptSuffix: 'قدّم نظرة شاملة ومتنوعة حول الموضوع.',
        preferLocalRewrite: false,
      },
    },
    selectionRules: {
      turnThresholdForConversational: 3,   // أقل عدد turns لتفعيل استراتيجية المحادثة
      lowScoreThresholdForDeep:       0.5, // scores أقل من كده تُصعِّد لـ deep_analytical
      maxQuickFactualWords:           10,  // أسئلة أقصر من كده + factual → quick_factual
      useRollingScore:                true, // Phase 88: true = use rollingAvgScore for quality escalation (Rule 3) when available, false = use lastAvgScore only (backward compat)
    },
  },

  // ═══════════════════════════════════════════════════════════════
  // 47. تحليلات تحسين الإجابات (REFINEMENT_ANALYTICS)
  //    — يجمع إحصائيات عن answer refinement performance
  //    — نسبة النجاح، متوسط التحسين، breakdown per strategy/mode
  //    — in-memory فقط — البيانات تضيع عند restart
  //    — zero overhead عند التعطيل (analytics is passive)
  // ═══════════════════════════════════════════════════════════════
  REFINEMENT_ANALYTICS: {
    maxEntries: 200,    // أقصى عدد entries في الـ ring buffer
  },

  // ═══════════════════════════════════════════════════════════════
  // 48. تحليلات اختيار الاستراتيجية (STRATEGY_ANALYTICS)
  //    — يجمع إحصائيات عن RAG strategy selection performance
  //    — per-strategy quality، escalation rate، usage frequency
  //    — in-memory فقط — البيانات تضيع عند restart
  //    — zero overhead عند التعطيل (analytics is passive)
  // ═══════════════════════════════════════════════════════════════
  STRATEGY_ANALYTICS: {
    maxEntries: 200,    // أقصى عدد entries في الـ ring buffer
  },

  // ═══════════════════════════════════════════════════════════
  // 49. فهرس الجلسات (SESSION_INDEX)
  //    — يسرّع تحميل قائمة المحادثات في الـ sidebar
  //    — يبني فهرس في الذاكرة من ملفات الجلسات عند بدء التشغيل
  //    — يتحدث تلقائياً عبر EventBus بدون قراءة الديسك
  //    — لا يحتاج أي خدمة خارجية (in-memory)
  // ═══════════════════════════════════════════════════════════
  SESSION_INDEX: {
    enabled:             true,      // true = تفعيل فهرس الجلسات في الذاكرة | false = قراءة الملفات من الديسك لكل طلب (أبطأ)
    maxCachedSessions:   1000,      // أقصى عدد جلسات في الفهرس — الأقدم يتحذف أولاً (حسب last_active)
    refreshOnStartup:    true,      // true = مسح مجلد الجلسات عند بدء التشغيل | false = الفهرس يتبنى تدريجياً من الأحداث فقط
    firstMessageMaxLen:  50,        // أقصى طول لأول رسالة محفوظة في الفهرس (بالأحرف)
    perUserIsolation:    true,      // Phase 92: true = الـ sidebar يعرض جلسات المستخدم الحالي فقط (حسب IP hash) — آمن افتراضياً. false = عرض كل الجلسات (السلوك القديم)
    sseEnabled:          true,      // Phase 93: true = إرسال SSE events للـ sidebar عند تحديث sessions | false = معطّل (الـ sidebar يعمل بدون auto-refresh)
    sidebarAutoRefresh:  true,      // Phase 93: true = الـ sidebar يتحدث تلقائياً عند استقبال SSE event | false = manual refresh فقط
  },

  // ═══════════════════════════════════════════════════════════
  // 50. سجل التنفيذ الموحد (EXECUTION_REGISTRY) — Phase 94
  //    — يجمع الأوامر والعمليات في واجهة واحدة موحدة
  //    — يوفر introspection موحد لكل حاجة ممكن تتنفذ في النظام
  //    — لا تحتاج تعديل عادةً
  // ═══════════════════════════════════════════════════════════
  EXECUTION_REGISTRY: {
    enabled:          true,     // true = تفعيل الـ unified execution registry | false = معطّل (backward compatible — CommandRegistry + ActionRegistry يشتغلوا كما هم)
    logResolutions:   false,    // true = تسجيل كل resolve() call في الـ operational log (للتصحيح) | false = بدون logging
  },

};

export default deepFreeze(config);
