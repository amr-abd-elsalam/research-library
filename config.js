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
    enabled:              false,    // true = حفظ المحادثات على السيرفر | false = المتصفح فقط
    maxMessages:          100,      // أقصى عدد رسائل في session واحدة
    ttlDays:              30,       // مدة الاحتفاظ بالـ session (بالأيام)
    maxSessions:          10000,    // أقصى عدد sessions محفوظة
    maxTokensPerSession:  0,        // أقصى tokens per session (0 = بدون حد). مثلاً 50000 = ~25 سؤال متوسط
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
    enabled:        false,    // true = تفعيل اقتراحات المتابعة الذكية | false = معطّل (السلوك الحالي بالظبط)
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
    enabled:          false,    // true = تفعيل نظام التقييم (👍👎) | false = مخفي بالكامل (zero overhead)
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
  },

};

export default deepFreeze(config);
