/* =============================================================
   sources.js — SourcesModule
   Source chips · Full-content Drawer
   ============================================================= */

'use strict';

const SourcesModule = (() => {

  /* ── Score → CSS class ────────────────────────────────────── */
  function _scoreClass(score) {
    if (score >= 0.92) return 'score-high';
    if (score >= 0.82) return 'score-good';
    if (score >= 0.72) return 'score-mid';
    if (score >= 0.60) return 'score-low';
    return 'score-poor';
  }

  /* ── Score → confidence CSS class ────────────────────────── */
  function _confClass(score) {
    if (score >= 0.92) return 'conf-5';
    if (score >= 0.82) return 'conf-4';
    if (score >= 0.72) return 'conf-3';
    if (score >= 0.60) return 'conf-2';
    return 'conf-1';
  }

  /* ── Score → label ────────────────────────────────────────── */
  function _scoreLabel(score) {
    return `${Math.round(score * 100)}%`;
  }

  /* ── اسم مقروء للمصدر ────────────────────────────────────── */
  function _displayName(src) {
    // أولوية: section title → اسم ملف مُنظّف
    if (src.section && src.section.trim()) {
      return src.section.trim().replace(/^#+ */, '');
    }
    // fallback: تنظيف اسم الملف
    return src.file
      .replace(/\.[^.]+$/, '')       // إزالة الامتداد
      .replace(/^\d+-/, '')          // إزالة الرقم في البداية
      .replace(/[-_]/g, ' ')        // شرطات → مسافات
      .replace(/\b\w/g, c => c.toUpperCase()); // أول حرف كبير
  }

  /* ── إزالة التكرارات (نفس الملف + نفس القسم) ────────────── */
  function _dedup(sources) {
    const seen = new Set();
    return sources.filter(src => {
      const key = `${src.file}::${src.section || ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /* ══════════════════════════════════════════════════════════
     SOURCE CHIPS (تحت فقاعة الإجابة)
  ══════════════════════════════════════════════════════════ */

  function buildSourceChips(sources, container) {
    if (!container || !sources.length) return;

    const unique = _dedup(sources);

    unique.forEach((src, i) => {
      const chip = document.createElement('button');
      chip.className = 'source-chip';
      chip.type      = 'button';

      const name = _displayName(src);
      chip.setAttribute('aria-label', `مصدر ${i + 1}: ${name}`);

      // Icon
      const iconSpan = document.createElement('span');
      iconSpan.setAttribute('aria-hidden', 'true');
      iconSpan.textContent = '📄';
      chip.appendChild(iconSpan);

      // Name (section title بدل اسم الملف)
      const nameSpan = document.createElement('span');
      nameSpan.textContent = name;
      chip.appendChild(nameSpan);

      // بدون نسبة — أنظف للمستخدم

      chip.addEventListener('click', () => openDrawer(src));

      container.appendChild(chip);
    });
  }

  /* ══════════════════════════════════════════════════════════
     DRAWER
  ══════════════════════════════════════════════════════════ */

  function openDrawer(source) {
    const {
      drawerOverlay, sourceDrawer,
      drawerTitle, drawerSection,
      drawerScore, drawerScoreBar,
      drawerBody, btnDrawerClose,
    } = AppModule.DOM;

    if (!sourceDrawer || !drawerOverlay) return;

    // Title — اسم مقروء
    if (drawerTitle) {
      drawerTitle.textContent = _displayName(source);
    }

    // Section
    if (drawerSection) {
      drawerSection.textContent = source.section || '';
    }

    // Score bar
    if (drawerScore) {
      drawerScore.className   = `drawer-score-label ${_scoreClass(source.score)}`;
      drawerScore.textContent = `تطابق: ${_scoreLabel(source.score)}`;
    }
    if (drawerScoreBar) {
      drawerScoreBar.innerHTML = '';

      const bar = document.createElement('div');
      bar.className  = 'confidence-bar';
      bar.style.maxWidth = '100%';
      bar.style.flex     = '1';

      const fill = document.createElement('div');
      fill.className = `confidence-fill ${_confClass(source.score)}`;
      fill.style.width = '0%';
      bar.appendChild(fill);
      drawerScoreBar.appendChild(bar);

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          fill.style.width = `${Math.round(source.score * 100)}%`;
        });
      });
    }

    // Content
    if (drawerBody) {
      drawerBody.innerHTML = '';
      const pre = document.createElement('p');
      pre.className   = 'drawer-content-text';
      pre.textContent = source.content || source.snippet || '';
      drawerBody.appendChild(pre);
    }

    // Open
    drawerOverlay.classList.add('open');
    sourceDrawer.classList.add('open');
    sourceDrawer.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    if (btnDrawerClose) {
      setTimeout(() => btnDrawerClose.focus(), 50);
    }
  }

  function closeDrawer() {
    const { drawerOverlay, sourceDrawer } = AppModule.DOM;
    if (!sourceDrawer || !drawerOverlay) return;

    drawerOverlay.classList.remove('open');
    sourceDrawer.classList.remove('open');
    sourceDrawer.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  /* ── Init ─────────────────────────────────────────────────── */
  function init() {
    const { drawerOverlay, btnDrawerClose } = AppModule.DOM;

    if (drawerOverlay) {
      drawerOverlay.addEventListener('click', closeDrawer);
    }

    if (btnDrawerClose) {
      btnDrawerClose.addEventListener('click', closeDrawer);
    }

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeDrawer();
    });
  }

  /* ── Public API ───────────────────────────────────────────── */
  return Object.freeze({
    init,
    buildSourceChips,
    openDrawer,
    closeDrawer,
  });

})();
