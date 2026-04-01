# Ai8V Smart Research Library — رؤية التطوير المتقدم

## 1. ملخص تنفيذي

مشروع Ai8V مشروع محكم التصميم وصل لمرحلة نضج ممتازة في 5 phases — بنية zero-framework نظيفة، 2 dependencies فقط، فصل واضح بين الطبقات (handlers → services → middleware)، ونظام white-label متكامل. المقارنة مع الأنماط المعمارية المكشوفة من Claude Code تكشف فرص تطوير جوهرية في 5 محاور: نظام أوامر extensible مع registry pattern حقيقي، إدارة transcript/context بنظام compact + replay + budget، نظام صلاحيات متدرج لتحويل المنصة من "مساعد بحثي" لـ"منصة ذكية"، bootstrap graph يخلي الـ startup أسرع وأكثر resilience، ونظام execution موحّد يدمج الأوامر مع أي أدوات مستقبلية. الـ roadmap المقترح (Phases 6-10) يبني على كل نقطة قوة موجودة ويسد الفجوات بدون كسر أي قاعدة من قواعد المشروع.

---

## 2. مراجعة المشروع الحالي

### نقاط القوة

**البنية المعمارية صلبة ونظيفة.** الفصل بين `handlers/`, `services/`, `middleware/` واضح ومتسق — كل handler بيتعامل مع HTTP فقط، وكل service بيتعامل مع business logic فقط. ده pattern مثالي لمشروع بدون framework لأنه بيعوّض غياب الـ conventions اللي الـ frameworks بتفرضها.

**الـ white-label system مصمم بشكل ممتاز.** ملف `config.js` الواحد مع `deepFreeze` بيمنع أي تعديل عرضي في runtime، وكل الـ UI strings وألوان وبيانات المكتبة configurable. الـ frontend بيجلب الـ config من الـ API كـ single source of truth مع fallback محلي — ده design pattern ناضج.

**الـ zero-dependency philosophy محترمة بجدية.** المشروع بيستخدم native `http`، native `fs`، native `crypto`، وحتى الـ SSE streaming متبنية manually بدون أي library. ده بيعطي control كامل وبيخلي الـ attack surface صغير جداً.

**الـ error handling defensive ومتسق.** كل service عنده custom errors (مثل `GeminiTimeoutError`, `QdrantNotFoundError`)، والـ chat handler بيتعامل مع كل error type بشكل مختلف مع رسائل عربية واضحة. الـ fire-and-forget pattern في analytics وsessions ذكي — failures مش بتكسر الـ user experience.

**الـ session system مصمم بحكمة.** الـ file-based approach مع date folders، atomic writes (tmp + rename)، periodic cleanup، والـ opt-in toggle — كل ده بيعكس تفكير production-grade.

**الـ frontend بنيته IIFE modules نظيفة.** كل module (`AppModule`, `ChatModule`, `TopicsModule`, etc.) بيعمل expose لـ public API فقط عبر `Object.freeze`. الـ DOM references مركزية في `AppModule.DOM`، والـ state مشتركة عبر `AppModule.STATE`. الـ `MarkdownRenderer` vanilla بالكامل — ده impressive.

### نقاط الضعف والفجوات المعمارية

**الـ command system rigid وغير قابل للتوسعة.** كل أمر (`/ملخص`, `/مصادر`, `/اختبار`, `/مساعدة`) hardcoded كـ function في `commands.js` مع `COMMAND_MAP` ثابتة. مفيش طريقة يضيف المدرب (white-label client) أمر جديد بدون تعديل الكود. المقارنة مع Claude Code — اللي عنده command registry مع metadata, categorization, وplugin-based loading — بتوضح الفجوة.

**مفيش context management حقيقي.** الـ chat handler بيبني الـ context من الـ Qdrant hits كل مرة من الصفر. مفيش مفهوم لـ "conversation context window" بيكبر ويصغر حسب المحادثة. الـ history بتتبعت كاملة للـ Gemini API بدون أي compaction أو summarization — ده بيهدر tokens وبيضعف جودة الإجابات في المحادثات الطويلة.

**الـ query router بسيط أكتر من اللازم.** الـ keyword matching في `queryRouter.js` مفيش فيه fallback أو confidence threshold — يعني لو مفيش keyword match بيرجع `factual` دايماً بـ confidence: 0. مفيش distinction بين "مش فاهم السؤال" و"السؤال factual". كمان الـ routing مش بيأثر إلا على الـ prompt template وعدد الـ top-K results — ممكن يعمل أكتر.

**الـ bootstrap sequence بسيطة وبدون resilience.** في الـ frontend، `bootstrap.js` بيعمل `await loadConfig()` وبعدين يعمل init لكل module بالترتيب. لو أي module فشل، مفيش graceful degradation — الباقي ممكن يفشل silently. مفيش health check قبل ما الـ user يبدأ يكتب.

**الـ rate limiter مفيش فيه tiered limits.** كل الـ users عندهم نفس الـ limits بغض النظر عن الـ access mode. User بـ token مدفوع بياخد نفس الـ 10 requests/minute زي user بـ public access.

**الـ cache system مفيش فيه invalidation strategy.** لو المدرب حدّث محتوى المكتبة (أضاف ملفات جديدة في Qdrant)، الـ cache هيفضل يرجع إجابات قديمة لحد ما الـ TTL ينتهي. مفيش manual invalidation endpoint.

**مفيش transcript/audit trail.** الـ analytics JSONL بتسجّل metadata (أوقات، tokens، scores) بس مش بتسجّل المحادثة نفسها. الـ sessions بتحفظ المحادثات بس مفيش export أو replay capability.

**الـ frontend مفيش فيه offline/degraded mode.** لو الـ API وقع أثناء محادثة، الـ user بيشوف "غير متصل" بس مفيش retry mechanism أو queuing.

---

## 3. جدول المقارنة: Ai8V vs Claude Code Patterns

| المجال | Ai8V الحالي | Claude Code Pattern | الفجوة |
|--------|-------------|-------------------|--------|
| **Command System** | `COMMAND_MAP` ثابتة بـ 4 أوامر hardcoded. كل أمر function منفصلة في نفس الملف. مفيش metadata أو categorization. التسجيل يدوي. | `ExecutionRegistry` موحّد يجمع commands + tools. كل command عنده `name`, `source_hint`, `responsibility`. فيه `find_commands(query)` للبحث، `get_commands()` مع filters (plugin/skill). الـ registry بيتبني dynamically من snapshot files. | المطلوب: registry pattern مع metadata per command، قابلية إضافة أوامر عبر config بدون تعديل كود، وbuild-time assembly. |
| **Session Management** | File-based JSON، date-folder structure، atomic writes، appendMessage pattern. Sessions مربوطة بـ session_id في `sessionStorage`. مفيش resume من device تاني. | `StoredSession` dataclass مع `session_id`, `messages`, token counts. `save_session`/`load_session` atomic. الـ `QueryEnginePort` بيعمل `persist_session()` بعد كل interaction. فيه `from_saved_session()` للاستعادة الكاملة. | المطلوب: session resume/export، token tracking per session، وpersist after every turn (مش fire-and-forget). |
| **Tool/Plugin Architecture** | مفيش. كل الـ capabilities hardcoded. | `ToolPool` مع `filter_tools_by_permission_context()`. الأدوات بتتجمع من snapshots وبتتفلتر حسب mode (simple/full) وpermissions. `MirroredTool.execute()` interface موحّد. | المطلوب: plugin/tool abstraction layer — حتى لو المشروع مش محتاج BashTool، المفهوم مهم لإضافة capabilities مستقبلية (مثلاً: citation tool, export tool). |
| **Query Routing** | `routeQuery()` — keyword matching ثابت بـ 7 أنواع. بيرجع `{type, confidence}`. بيأثر على prompt template وtop-K فقط. | `PortRuntime.route_prompt()` — token-based scoring ضد كل الـ commands + tools. بيرجع `RoutedMatch[]` مرتبة بـ score. بيروّت لـ execution (مش بس prompt selection). | المطلوب: الـ routing يأثر على أكتر من الـ prompt — يأثر على الـ retrieval strategy, context window, وpost-processing. |
| **Permission System** | `ACCESS_MODE` بـ 3 modes (public/pin/token). Binary: يا مسموح يا مرفوض. مفيش granular permissions. | `ToolPermissionContext` مع deny lists وprefix matching. `filter_tools_by_permission_context()` بتشيل أدوات حسب الصلاحية. `_infer_permission_denials()` بتحدد ده runtime. | المطلوب: permission tiers (مثلاً: guest يشوف 3 results، premium يشوف 8). الـ commands والـ features تتفلتر حسب الـ tier. |
| **Context Management** | الـ context بيتبني fresh كل request من Qdrant hits. الـ history كاملة بتتبعت للـ API. مفيش compaction. | `TranscriptStore` مع `append`, `compact(keep_last)`, `replay`, `flush`. الـ `QueryEnginePort` عنده `compact_messages_if_needed()` بيشتغل automatically بعد كل turn. الـ `mutable_messages` بتتقص لما تتجاوز `compact_after_turns`. | المطلوب: transcript compaction للمحادثات الطويلة — summarize old turns بدل ما تبعتهم كلهم. |
| **Bootstrap/Init** | Frontend: `DOMContentLoaded` → `loadConfig()` → auth gate → module inits بالترتيب. Backend: `http.createServer` مباشرة. مفيش startup checks. | `BootstrapGraph` بـ 7 stages واضحة: prefetch → guards → trust gate → parallel load → deferred init → mode routing → engine loop. `SetupReport` بيوثّق كل stage. `DeferredInitResult` بيأجّل initialization لحد ما الـ trust يتأكد. | المطلوب: backend startup sequence مع health pre-checks (Qdrant reachable? Gemini API key valid?). Frontend bootstrap مع parallel loading وgraceful degradation. |

---

## 4. خارطة الطريق (Phases 6-10)

### Phase 6: Transcript Engine + Context Compaction
**الهدف:** بناء نظام إدارة السياق الذكي اللي يخلي المحادثات الطويلة أفضل جودة وأقل تكلفة.

**الفيتشرات المحددة:** نظام transcript store يعمل append/compact/replay على مستوى الـ session. الـ history اللي تتبعت لـ Gemini بتتقص ذكياً (آخر N turns + ملخص للأقدم). Budget tracking per session (عدد tokens مستخدمة vs الحد الأقصى). Context window management — الـ RAG context + history لازم يكونوا في حدود token budget.

**الملفات المتأثرة:**
- **جديد:** `server/services/transcript.js` — TranscriptStore class
- **جديد:** `server/services/contextManager.js` — context window + budget logic
- **تعديل:** `server/handlers/chat.js` — يستخدم الـ context manager بدل الـ manual building
- **تعديل:** `server/services/sessions.js` — يحفظ token counts per session
- **تعديل:** `config.js` — إضافة `CONTEXT` section (maxTokenBudget, compactAfterTurns)

**الـ Pattern المستوحى:** `TranscriptStore` (compact, replay, flush) + `QueryEngineConfig` (max_budget_tokens, compact_after_turns) من clawd-code.

**الأثر على اليوزر:** محادثات طويلة بتفضل عالية الجودة بدل ما تتدهور. تقليل تكلفة API tokens. إمكانية عرض "ملخص المحادثة السابقة" عند الاستعادة.

**التعقيد:** Medium

**الاعتماديات:** Phase 5 (sessions) — جاهز.

---

### Phase 7: Command Registry + Extensible Commands
**الهدف:** تحويل نظام الأوامر من hardcoded functions لـ registry pattern قابل للتوسعة عبر الـ config.

**الفيتشرات المحددة:** كل أمر يبقى object عنده metadata (name, description, category, handler, configurable: true/false). المدرب يقدر يضيف أوامر custom في `config.js` بنوعين: template-based (prompt template + RAG) أو static (نص ثابت). الـ registry بيتبني وقت الـ startup من merge بين built-in commands + config commands. فيه `findCommands(query)` للـ autocomplete.

**الفيتشرات المحددة (تكملة):** Command categories (تعليمي / بحثي / إداري). الـ frontend يعرض الأوامر المتاحة في dropdown عند كتابة `/`. Command aliases (مثلاً `/س` = `/ملخص`).

**الملفات المتأثرة:**
- **إعادة كتابة:** `server/services/commands.js` — من flat functions لـ CommandRegistry class
- **تعديل:** `config.js` — إضافة `customCommands` array في `COMMANDS`
- **تعديل:** `server/handlers/chat.js` — يستخدم registry.match() بدل matchCommand()
- **تعديل:** `frontend/assets/js/chat.js` — autocomplete dropdown للأوامر

**الـ Pattern المستوحى:** `ExecutionRegistry` + `build_execution_registry()` + `find_commands(query)` من clawd-code.

**الأثر على اليوزر:** المدرب يقدر يضيف أوامر مخصصة (مثلاً `/منهج` يعرض منهج الكورس). الطلاب يشوفوا suggestions أثناء الكتابة.

**التعقيد:** Medium

**الاعتماديات:** لا يوجد (مستقل).

---

### Phase 8: Permission Tiers + Tiered Rate Limiting
**الهدف:** تحويل نظام الوصول من binary (مسموح/مرفوض) لنظام tiers يدعم مستويات مختلفة من الخدمة.

**الفيتشرات المحددة:** تعريف permission tiers في config: `guest` (محدود), `member` (عادي), `premium` (كامل), `admin`. كل tier عنده: rate limits مختلفة، عدد results مختلف (top-K)، أوامر متاحة مختلفة، وصلاحيات مختلفة (مثلاً: export, session history). الـ token-based access يقدر يحمل tier metadata. الـ rate limiter بيقرأ الـ tier من الـ request.

**الملفات المتأثرة:**
- **جديد:** `server/services/permissions.js` — PermissionContext class
- **تعديل:** `server/middleware/auth.js` — يرجع tier مع الـ verification
- **تعديل:** `server/middleware/rateLimit.js` — tiered limits
- **تعديل:** `server/handlers/chat.js` — top-K حسب الـ tier
- **تعديل:** `server/services/commands.js` — filter commands by tier
- **تعديل:** `config.js` — إضافة `TIERS` section

**الـ Pattern المستوحى:** `ToolPermissionContext` (deny lists, prefix matching) + `filter_tools_by_permission_context()` من clawd-code.

**الأثر على اليوزر:** المدرب يقدر يبيع باقات مختلفة. Guest يجرب 5 أسئلة/يوم، Premium ب 100 سؤال/يوم مع أوامر إضافية.

**التعقيد:** High

**الاعتماديات:** Phase 7 (command registry) — لأن الـ tier بيفلتر الأوامر.

---

### Phase 9: Resilient Bootstrap + Startup Health Graph
**الهدف:** بناء نظام startup ذكي في الـ backend والـ frontend يضمن graceful degradation ويقلل وقت التحميل.

**الفيتشرات المحددة:**

**Backend:** startup sequence بتعمل pre-check لـ Qdrant وGemini قبل ما تبدأ تقبل requests. لو Qdrant مش جاهزة، السيرفر يشتغل في degraded mode (يرجع "المكتبة قيد التحميل"). Health status يتخزن in-memory ويتحدث كل 60 ثانية. الـ startup بيعمل prefetch للـ topics ويحطهم في الـ cache.

**Frontend:** parallel loading للـ config + auth check + topics fetch. لو الـ config فشل، الـ app يشتغل بالـ fallback. لو الـ topics فشلت، الـ chat يشتغل بدون topic bar. Health indicator حقيقي (أخضر/أصفر/أحمر) مبني على `/api/health`.

**الملفات المتأثرة:**
- **جديد:** `server/services/healthMonitor.js` — periodic health checks + degraded mode
- **تعديل:** `server.js` — startup sequence مع pre-checks
- **تعديل:** `server/handlers/health.js` — يقرأ من الـ monitor بدل ما يعمل live checks كل مرة
- **تعديل:** `frontend/assets/js/bootstrap.js` — parallel init + degraded mode
- **تعديل:** `config.js` — إضافة `STARTUP` section

**الـ Pattern المستوحى:** `BootstrapGraph` (staged startup) + `SetupReport` (startup documentation) + `start_project_scan` (prefetch) من clawd-code.

**الأثر على اليوزر:** الواجهة بتتحمل أسرع. لو في مشكلة في Qdrant، اليوزر يشوف رسالة واضحة بدل error غامض. الـ health indicator بيطمن اليوزر.

**التعقيد:** Medium

**الاعتماديات:** لا يوجد (مستقل).

---

### Phase 10: Session Resume + Export + Replay
**الهدف:** تحويل نظام الـ sessions من storage بسيط لنظام كامل يدعم الاستعادة والتصدير وإعادة التشغيل.

**الفيتشرات المحددة:** Session resume بـ shareable link (`?session=UUID`). Export session كـ Markdown, JSON, أو PDF-ready HTML. Session replay — إعادة عرض المحادثة step-by-step (للمراجعة). Session metadata enrichment (عنوان تلقائي من أول سؤال، tags من الـ topics). Admin: session search وfiltering.

**الملفات المتأثرة:**
- **جديد:** `server/handlers/sessionExport.js` — export endpoints
- **جديد:** `frontend/assets/js/sessionManager.js` — resume + export UI
- **تعديل:** `server/services/sessions.js` — title generation, search
- **تعديل:** `server/router.js` — إضافة export routes
- **تعديل:** `frontend/assets/js/chat.js` — resume from URL
- **تعديل:** `config.js` — إضافة `SESSIONS.allowResume`, `SESSIONS.allowExport`

**الـ Pattern المستوحى:** `from_saved_session()` (full restoration) + `replay_user_messages()` + `flush_transcript()` من clawd-code.

**الأثر على اليوزر:** الطالب يقدر يرجع لمحادثة قديمة من أي جهاز. يقدر يصدّر المحادثة كملخص. المدرب يقدر يراجع محادثات الطلاب.

**التعقيد:** High

**الاعتماديات:** Phase 6 (transcript engine) + Phase 8 (permissions — لأن resume يحتاج access control).

---

## 5. تفصيل Phase 6: Transcript Engine + Context Compaction

### الخطوة A: إنشاء TranscriptStore (`server/services/transcript.js`)

**الملف:** `server/services/transcript.js` (جديد)

**التغيير:** إنشاء class `TranscriptStore` بيدير قائمة الرسائل في المحادثة مع عمليات compact وreplay.

```javascript
// server/services/transcript.js

export class TranscriptStore {
  #entries = [];
  #flushed = false;

  constructor(entries = []) {
    this.#entries = [...entries];
  }

  append(role, text, metadata = {}) {
    this.#entries.push({
      role,
      text,
      timestamp: new Date().toISOString(),
      ...metadata,
    });
    this.#flushed = false;
  }

  compact(keepLast = 10) {
    if (this.#entries.length <= keepLast) return null;

    const removed = this.#entries.splice(0, this.#entries.length - keepLast);

    // Build summary of removed turns
    const summary = removed
      .filter(e => e.role === 'user')
      .map(e => e.text.slice(0, 80))
      .join(' | ');

    return {
      removedCount: removed.length,
      summary: `المواضيع السابقة: ${summary}`,
    };
  }

  replay() {
    return this.#entries.map(e => ({ role: e.role, text: e.text }));
  }

  replayForAPI(maxItems = 10) {
    // Returns the last N turns formatted for Gemini API
    const recent = this.#entries.slice(-maxItems);
    return recent.map(e => ({
      role: e.role === 'assistant' ? 'model' : e.role,
      text: e.text,
    }));
  }

  get size() { return this.#entries.length; }
  get entries() { return [...this.#entries]; }
  get flushed() { return this.#flushed; }

  flush() { this.#flushed = true; }

  toJSON() {
    return {
      entries: this.#entries,
      flushed: this.#flushed,
    };
  }

  static fromJSON(data) {
    const store = new TranscriptStore(data.entries || []);
    if (data.flushed) store.flush();
    return store;
  }
}
```

**الترتيب:** أول حاجة — مفيش اعتماديات.

**اختبار:** unit test بسيط — append 20 entries, compact(10), verify size = 10, verify summary يحتوي على الأقدم.

---

### الخطوة B: إنشاء ContextManager (`server/services/contextManager.js`)

**الملف:** `server/services/contextManager.js` (جديد)

**التغيير:** class `ContextManager` بيحسب الـ token budget ويقرر حجم الـ context والـ history.

```javascript
// server/services/contextManager.js

import { estimateTokens } from './costTracker.js';
import config from '../../config.js';

const DEFAULT_MAX_BUDGET  = 6000;  // max total tokens for context + history
const DEFAULT_CONTEXT_RATIO = 0.7; // 70% for RAG context, 30% for history

export class ContextManager {
  #maxBudget;
  #contextRatio;

  constructor(options = {}) {
    this.#maxBudget   = options.maxTokenBudget
      ?? config.CONTEXT?.maxTokenBudget
      ?? DEFAULT_MAX_BUDGET;
    this.#contextRatio = options.contextRatio
      ?? config.CONTEXT?.contextRatio
      ?? DEFAULT_CONTEXT_RATIO;
  }

  buildWindow({ systemPrompt, ragHits, history, message }) {
    const systemTokens  = estimateTokens(systemPrompt);
    const messageTokens = estimateTokens(message);
    const fixedTokens   = systemTokens + messageTokens;

    const availableBudget = Math.max(0, this.#maxBudget - fixedTokens);
    const contextBudget   = Math.floor(availableBudget * this.#contextRatio);
    const historyBudget   = availableBudget - contextBudget;

    // Trim RAG hits to fit context budget
    const trimmedHits = this.#trimHits(ragHits, contextBudget);

    // Trim history to fit history budget
    const trimmedHistory = this.#trimHistory(history, historyBudget);

    return {
      hits:    trimmedHits,
      history: trimmedHistory,
      budget: {
        total:     this.#maxBudget,
        system:    systemTokens,
        message:   messageTokens,
        context:   estimateTokens(trimmedHits.map(h =>
          h.payload?.parent_content || h.payload?.content || ''
        ).join(' ')),
        history:   estimateTokens(trimmedHistory.map(h => h.text).join(' ')),
      },
    };
  }

  #trimHits(hits, budget) {
    const result = [];
    let used = 0;
    for (const hit of hits) {
      const content = hit.payload?.parent_content || hit.payload?.content || '';
      const tokens  = estimateTokens(content);
      if (used + tokens > budget) break;
      result.push(hit);
      used += tokens;
    }
    return result;
  }

  #trimHistory(history, budget) {
    // Keep most recent turns, drop oldest
    const reversed = [...history].reverse();
    const result = [];
    let used = 0;
    for (const item of reversed) {
      const tokens = estimateTokens(item.text);
      if (used + tokens > budget) break;
      result.unshift(item);
      used += tokens;
    }
    return result;
  }
}
```

**الترتيب:** بعد الخطوة A (يعتمد على `estimateTokens` من `costTracker.js` — موجودة أصلاً).

**اختبار:** unit test — تمرير system prompt كبير وhistory كبيرة → verify أن الناتج في حدود الـ budget.

---

### الخطوة C: تحديث `config.js`

**الملف:** `config.js` (تعديل)

**التغيير:** إضافة section `CONTEXT` بعد `SESSIONS`.

```javascript
// ═══════════════════════════════════════════════════════════
// 11. إدارة السياق (CONTEXT)
//    — تحكم في حجم السياق المُرسل للنموذج
//    — لا تحتاج تعديل عادةً
// ═══════════════════════════════════════════════════════════
CONTEXT: {
  maxTokenBudget:  6000,    // أقصى عدد tokens للسياق + التاريخ
  contextRatio:    0.7,     // نسبة الـ budget المخصصة لنتائج البحث
  compactAfterTurns: 12,    // عدد الأدوار قبل ضغط التاريخ
},
```

**الترتيب:** بعد الخطوة B (الـ ContextManager بيقرأ منه).

**اختبار:** verify أن `deepFreeze` بيشمل الـ section الجديد.

---

### الخطوة D: تعديل `server/services/sessions.js`

**الملف:** `server/services/sessions.js` (تعديل)

**التغيير:** إضافة token tracking per session. الـ session object يحصل على fields جديدة.

```javascript
// في createSession — إضافة:
const session = {
  session_id:       sessionId,
  created_at:       now,
  last_active:      now,
  ip_hash:          ipHash || 'unknown',
  topic_filter:     topicFilter,
  messages:         [],
  // ── Phase 6: Token tracking ──────────
  token_usage: {
    embedding_tokens:  0,
    generation_input:  0,
    generation_output: 0,
  },
};

// في appendMessage — إضافة:
if (metadata.tokens) {
  session.token_usage.embedding_tokens  += metadata.tokens.embedding  || 0;
  session.token_usage.generation_input  += metadata.tokens.input      || 0;
  session.token_usage.generation_output += metadata.tokens.output     || 0;
}
```

**الترتيب:** بعد الخطوة C (بيقرأ config).

**اختبار:** create session → append message with tokens → read session → verify token_usage updated.

---

### الخطوة E: تعديل `server/handlers/chat.js`

**الملف:** `server/handlers/chat.js` (تعديل رئيسي)

**التغيير:** استبدال الـ manual context building بالـ `ContextManager`. إضافة transcript compaction. تمرير token data للـ session.

```javascript
// ── في أعلى الملف: إضافة imports ────────────────────
import { ContextManager }  from '../services/contextManager.js';
import { TranscriptStore } from '../services/transcript.js';

// ── إنشاء singleton ───────────────────────────────────
const contextManager = new ContextManager();

// ── داخل handleChat، بعد الـ RAG search ───────────────
// بدل:
//   const context = buildContext(hits);
// يبقى:
const systemPrompt = getPromptForType(queryRoute.type);
const window = contextManager.buildWindow({
  systemPrompt,
  ragHits: hits,
  history,
  message,
});
const context = buildContext(window.hits);
const trimmedHistory = window.history;

// ── في streamGenerate — استخدم trimmedHistory بدل history ──
await streamGenerate(
  systemPrompt,
  context,
  trimmedHistory,  // ← بدل history
  message,
  (chunk) => { fullText += chunk; writeChunk(res, { text: chunk }); },
);

// ── في الـ session persistence — تمرير token data ──────
if (session_id && config.SESSIONS.enabled) {
  appendMessage(session_id, 'user', message)
    .then(() => appendMessage(session_id, 'assistant', fullText, {
      sources,
      score:      avg,
      query_type: queryRoute.type,
      tokens: {
        embedding: embeddingTokens,
        input:     genInputTokens,
        output:    genOutputTokens,
      },
    }))
    .catch(() => {});
}
```

**الترتيب:** آخر خطوة — يعتمد على كل اللي فوق.

**اختبار:**
1. **Integration test بسيط:** أرسل 3 أسئلة متتالية → verify أن الـ tokens المستخدمة في الـ 3rd request أقل من لو كانت الـ history كاملة.
2. **Edge case:** أرسل سؤال مع history فيها 20 item → verify أن الـ API مش بيستلم الـ 20 كلهم.
3. **Budget test:** system prompt كبير جداً (2000 token) + سؤال كبير → verify أن الـ context مش بيتجاوز الـ budget.

---

### ملخص الخطوات

| الخطوة | الملف | النوع | الاعتمادية |
|--------|-------|-------|-----------|
| A | `server/services/transcript.js` | جديد | — |
| B | `server/services/contextManager.js` | جديد | A (conceptual) |
| C | `config.js` | تعديل | — |
| D | `server/services/sessions.js` | تعديل | C |
| E | `server/handlers/chat.js` | تعديل | A + B + C + D |

---

## 6. ملاحظات وتحذيرات

**أنماط من Claude Code لا تناسب المشروع:**

الـ `remote_runtime.py`, `ssh_mode`, `teleport_mode`, و`direct_modes.py` كلها patterns خاصة بـ agent harness يشتغل على ماكينة developer. مشروع Ai8V هو web application — مفيش حاجة اسمها SSH mode أو teleport في سياق مساعد بحثي. لا تطبقها.

الـ `parity_audit.py` pattern خاص بالـ porting effort بين TypeScript وPython. مفيش equivalent في Ai8V.

الـ `prefetch.py` (MDM raw read, keychain prefetch) — ده patterns خاصة بـ desktop application. الـ equivalent في Ai8V هو prefetch للـ topics والـ health status عند الـ startup (وده في Phase 9).

**مخاطر لازم تتراقب:**

الـ `ContextManager` بيستخدم `estimateTokens()` اللي هي تقدير مش دقيق (3 chars/token). في المحادثات العربية بالذات، التقدير ممكن يكون off بنسبة 30%. الحل: ضيف safety margin 20% في الـ budget calculation.

الـ transcript compaction ممكن يخسّر سياق مهم. لازم يكون فيه option يعطّلها (`config.CONTEXT.compactAfterTurns: 0` = no compaction).

إضافة permission tiers (Phase 8) هي أعقد phase لأنها بتأثر على كل طبقة (middleware → handlers → frontend). نفّذها بالتدريج — ابدأ بالـ rate limiting tiers فقط، وبعدين أضف command filtering.

الـ session resume (Phase 10) فيه security concern — لو عند اليوزر UUID الـ session، يقدر يقرأ محادثة حد تاني. الحل: ربط الـ session بالـ IP hash أو بالـ access token، وcheck عند الـ resume.

**ترتيب الأولويات المقترح:**

Phase 6 (Context) هو الأكثر تأثيراً على جودة المنتج — ابدأ بيه. Phase 9 (Bootstrap) ممكن يتنفذ بالتوازي مع Phase 7 (Commands) لأنهم مستقلين. Phase 8 (Permissions) والـ Phase 10 (Session Resume) يتأجلوا لأنهم بيعتمدوا على الباقي. لو الـ timeline ضيق، Phase 7 + Phase 9 لوحدهم بيضيفوا قيمة كبيرة مع Phase 6.
