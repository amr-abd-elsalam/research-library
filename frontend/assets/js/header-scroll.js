/* =============================================================
   header-scroll.js — Hide header & topics when chat starts
   + Floating "new chat" button when header is hidden
   ============================================================= */
'use strict';

(() => {
  const header    = document.querySelector('.app-header');
  const topicsBar = document.getElementById('topics-bar');

  /* ── Create floating new-chat button ─────────────────────── */
  const fab = document.createElement('button');
  fab.className = 'fab-new-chat';
  fab.type      = 'button';
  fab.setAttribute('aria-label', 'محادثة جديدة');
  fab.innerHTML =
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" ' +
    'stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true">' +
    '<path d="M12 5v14M5 12h14"/></svg>' +
    '<span>محادثة جديدة</span>';

  fab.style.display = 'none';          // مخفي في البداية
  document.body.appendChild(fab);

  // ربط الزر بنفس وظيفة btn-clear
  fab.addEventListener('click', () => {
    if (typeof ChatModule !== 'undefined' && ChatModule.clear) {
      ChatModule.clear();
    }
  });

  /* ── Public API ──────────────────────────────────────────── */
  window.__headerControl = Object.freeze({
    hide() {
      if (header)    header.classList.add('header-hidden');
      if (topicsBar) topicsBar.classList.add('header-hidden');
      // أظهر FAB بعد انتهاء الـ animation
      setTimeout(() => { fab.style.display = 'flex'; }, 320);
    },
    show() {
      fab.style.display = 'none';
      if (header)    header.classList.remove('header-hidden');
      if (topicsBar) topicsBar.classList.remove('header-hidden');
    }
  });
})();
