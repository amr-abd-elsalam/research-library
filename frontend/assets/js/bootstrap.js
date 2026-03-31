/* =============================================================
   bootstrap.js — Ai8V Smart Research Library
   التهيئة: تحميل الإعدادات أولاً ثم تشغيل الوحدات
   ============================================================= */

document.addEventListener('DOMContentLoaded', async () => {

  // ── 1. تحميل الإعدادات من السيرفر ──────────────────────────
  const configLoaded = await loadConfig();
  if (!configLoaded) {
    console.warn('[bootstrap] ⚠️ يتم استخدام الإعدادات الاحتياطية');
  }

  // ── 2. تهيئة الوحدة الأساسية (براند + ترحيب) ──────────────
  AppModule.init();

  // ── 3. تعيين نطاق البحث ────────────────────────────────────
  const scopePrefix = document.getElementById('scope-prefix');
  if (scopePrefix) {
    scopePrefix.textContent = CLIENT_CONFIG.CHAT.scopePrefix + ' ';
  }

  // ── 4. تهيئة باقي الوحدات ──────────────────────────────────
  SourcesModule.init();
  TopicsModule.init();
  SuggestionsModule.init();
  ChatModule.init();

  console.log('[bootstrap] ✅ تم تهيئة جميع الوحدات');
});
