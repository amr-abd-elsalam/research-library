/* =============================================================
   bootstrap.js — Ai8V Smart Research Library
   التهيئة: تحميل الإعدادات أولاً ثم تشغيل الوحدات
   ============================================================= */

// ── Load user permissions from /api/whoami (Phase 27) ──────────
async function loadPermissions() {
  try {
    const res = await fetch('/api/whoami', {
      headers: AuthModule.getAccessHeaders(),
    });
    if (!res.ok) throw new Error('whoami ' + res.status);
    const data = await res.json();
    window.__permissions = data;
    console.log('[bootstrap] ✅ تم تحميل الصلاحيات', data.tiersEnabled ? '(tier: ' + data.tier + ')' : '(tiers disabled)');
  } catch (err) {
    console.warn('[bootstrap] ⚠️ فشل تحميل الصلاحيات — يتم استخدام الافتراضي:', err.message);
    // Keep default window.__permissions (all null = all allowed)
  }
}

document.addEventListener('DOMContentLoaded', async () => {

  // ── 1. تحميل الإعدادات من السيرفر ──────────────────────────
  const configLoaded = await loadConfig();
  if (!configLoaded) {
    console.warn('[bootstrap] ⚠️ يتم استخدام الإعدادات الاحتياطية');
  }

  // ── 2. Auth gate — لو الوصول مقيّد، نعرض شاشة الدخول أولاً ──
  if (AuthModule.isRequired() && !AuthModule.isVerified()) {
    const granted = await AuthModule.showGate();
    if (!granted) {
      console.warn('[bootstrap] ⛔ لم يتم التحقق من الوصول');
      return; // Stop — don't init app
    }
  }

  // ── 2.5 Load permissions from /api/whoami (Phase 27) ────────
  await loadPermissions();

  // ── 3. تهيئة الوحدة الأساسية (براند + ترحيب) ──────────────
  AppModule.init();

  // ── 4. تعيين نطاق البحث ────────────────────────────────────
  const scopePrefix = document.getElementById('scope-prefix');
  if (scopePrefix) {
    scopePrefix.textContent = CLIENT_CONFIG.CHAT.scopePrefix + ' ';
  }

  // ── 5. تهيئة باقي الوحدات ──────────────────────────────────
  SourcesModule.init();
  TopicsModule.init();
  SuggestionsModule.init();
  ChatModule.init();
  SidebarModule.init();

  // ── 6. Apply permissions to UI (Phase 27) ───────────────────
  TopicsModule.onPermissionsReady();
  ChatModule.onPermissionsReady();

  console.log('[bootstrap] ✅ تم تهيئة جميع الوحدات');
});
