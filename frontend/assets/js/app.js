/* =============================================================
   app.js — AppModule
   Core DOM references · Shared STATE · Brand bootstrap
   ============================================================= */

'use strict';

const AppModule = (() => {

  /* ── DOM References ───────────────────────────────────────── */
  const DOM = Object.freeze({

    // Header
    headerTitle:    document.getElementById('header-title'),
    headerTagline:  document.getElementById('header-tagline'),
    headerLogoWrap: document.getElementById('header-logo-wrap'),
    btnClear:       document.getElementById('btn-clear'),
    connDot:        document.getElementById('conn-dot'),
    connLabel:      document.getElementById('conn-label'),

    // Topics bar
    topicsBar:      document.getElementById('topics-bar'),

    // Chat
    chatScroll:     document.getElementById('chat-scroll'),
    welcomeState:   document.getElementById('welcome-state'),
    welcomeLogo:    document.getElementById('welcome-logo'),
    welcomeTitle:   document.getElementById('welcome-title'),
    welcomeSub:     document.getElementById('welcome-sub'),
    welcomeStats:   document.getElementById('welcome-stats'),
    messagesList:   document.getElementById('messages-list'),
    suggestionsGrid:document.getElementById('suggestions-grid'),

    // Input
    inputScope:     document.getElementById('input-scope'),
    scopeText:      document.getElementById('scope-text'),
    chatTextarea:   document.getElementById('chat-textarea'),
    btnSend:        document.getElementById('btn-send'),
    inputHint:      document.getElementById('input-hint'),
    charCount:      document.getElementById('char-count'),

    // Drawer
    drawerOverlay:  document.getElementById('drawer-overlay'),
    sourceDrawer:   document.getElementById('source-drawer'),
    drawerTitle:    document.getElementById('drawer-title'),
    drawerSection:  document.getElementById('drawer-section'),
    drawerScore:    document.getElementById('drawer-score'),
    drawerScoreBar: document.getElementById('drawer-score-bar'),
    drawerBody:     document.getElementById('drawer-body'),
    btnDrawerClose: document.getElementById('btn-drawer-close'),

  });

  /* ── Shared STATE ─────────────────────────────────────────── */
  const STATE = {
    isLoading:    false,   // هل في طلب جاري الآن؟
    activeTopic:  null,    // null = كل المكتبة | string = topic_id
    lastSources:  [],      // مصادر آخر إجابة
    lastScore:    0,       // avg confidence score آخر إجابة
  };

  /* ── Brand Bootstrap ──────────────────────────────────────── */
  function _applyBrand() {
    const { BRAND, META } = CLIENT_CONFIG;

    // CSS accent color
    document.documentElement.style.setProperty('--accent', BRAND.primaryColor);

    // حساب accent-dim و accent-border من اللون الأساسي
    const hex   = BRAND.primaryColor.replace('#', '');
    const r     = parseInt(hex.slice(0, 2), 16);
    const g     = parseInt(hex.slice(2, 4), 16);
    const b     = parseInt(hex.slice(4, 6), 16);
    document.documentElement.style.setProperty('--accent-dim',    `rgba(${r},${g},${b},.15)`);
    document.documentElement.style.setProperty('--accent-border', `rgba(${r},${g},${b},.30)`);

    // Page title + lang
    document.title                    = META.title;
    document.documentElement.lang     = META.lang;
    document.documentElement.dir      = META.dir;

    // Header
    if (DOM.headerTitle)   DOM.headerTitle.textContent   = BRAND.name;
    if (DOM.headerTagline) DOM.headerTagline.textContent = BRAND.tagline;

    // Logo
    _applyLogo();

    // Clear button label
    if (DOM.btnClear) {
      const span = DOM.btnClear.querySelector('span');
      if (span) span.textContent = CLIENT_CONFIG.CHAT.clearLabel;
    }

    // Welcome state
    if (DOM.welcomeTitle) DOM.welcomeTitle.textContent = CLIENT_CONFIG.CHAT.welcomeTitle;
    if (DOM.welcomeSub)   DOM.welcomeSub.textContent   = CLIENT_CONFIG.CHAT.welcomeSub;

    // Stats pills
    _buildWelcomeStats();

    // Input
    if (DOM.chatTextarea) DOM.chatTextarea.placeholder = CLIENT_CONFIG.CHAT.placeholder;
    if (DOM.inputHint)    DOM.inputHint.textContent    = CLIENT_CONFIG.CHAT.inputHint;
  }

  function _applyLogo() {
    const { BRAND } = CLIENT_CONFIG;

    const img = new Image();
    img.onload = () => {
      // هيدر — لوجو صغير
      if (DOM.headerLogoWrap) {
        while (DOM.headerLogoWrap.firstChild) DOM.headerLogoWrap.removeChild(DOM.headerLogoWrap.firstChild);
        const headerImg = document.createElement('img');
        headerImg.src       = BRAND.logo;
        headerImg.alt       = BRAND.name;
        headerImg.className = 'header-logo';
        headerImg.width     = 34;
        headerImg.height    = 34;
        DOM.headerLogoWrap.appendChild(headerImg);
      }

      // شاشة الترحيب — لوجو كبير
      if (DOM.welcomeLogo) {
        while (DOM.welcomeLogo.firstChild) DOM.welcomeLogo.removeChild(DOM.welcomeLogo.firstChild);
        const welcomeImg = document.createElement('img');
        welcomeImg.src       = BRAND.logo;
        welcomeImg.alt       = BRAND.name;
        welcomeImg.width     = 80;
        welcomeImg.height    = 80;
        DOM.welcomeLogo.appendChild(welcomeImg);
      }
    };

    img.onerror = () => {
      // هيدر — placeholder
      if (DOM.headerLogoWrap) {
        while (DOM.headerLogoWrap.firstChild) DOM.headerLogoWrap.removeChild(DOM.headerLogoWrap.firstChild);
        const ph = document.createElement('div');
        ph.className = 'header-logo-placeholder';
        ph.setAttribute('aria-hidden', 'true');
        ph.textContent = BRAND.name.charAt(0);
        DOM.headerLogoWrap.appendChild(ph);
      }

      // شاشة الترحيب — placeholder كبير
      if (DOM.welcomeLogo) {
        while (DOM.welcomeLogo.firstChild) DOM.welcomeLogo.removeChild(DOM.welcomeLogo.firstChild);
        const ph = document.createElement('div');
        ph.className = 'welcome-logo-placeholder';
        ph.setAttribute('aria-hidden', 'true');
        ph.textContent = BRAND.name.charAt(0);
        DOM.welcomeLogo.appendChild(ph);
      }
    };

    img.src = BRAND.logo;
  }

  function _buildWelcomeStats() {
    if (!DOM.welcomeStats) return;
    const { LIBRARY } = CLIENT_CONFIG;

    while (DOM.welcomeStats.firstChild) DOM.welcomeStats.removeChild(DOM.welcomeStats.firstChild);

    // سطر واحد بسيط: "XX مصدر بحثي"
    if (LIBRARY.totalFiles > 0) {
      const pill = document.createElement('div');
      pill.className = 'stat-pill';

      const icon = document.createElement('span');
      icon.textContent = '📚';
      icon.setAttribute('aria-hidden', 'true');
      pill.appendChild(icon);

      const strong = document.createElement('strong');
      strong.textContent = LIBRARY.totalFiles;
      pill.appendChild(strong);

      const label = document.createElement('span');
      label.textContent = ' مصدر بحثي';
      pill.appendChild(label);

      DOM.welcomeStats.appendChild(pill);
    }
  }

  /* ── Welcome / Chat state helpers ────────────────────────── */
  function hideWelcomeState() {
    if (DOM.welcomeState)  DOM.welcomeState.classList.add('hidden');
    if (DOM.messagesList)  DOM.messagesList.classList.remove('hidden');
  }

  function resetWelcomeState() {
    if (DOM.welcomeState) DOM.welcomeState.classList.remove('hidden');
    if (DOM.messagesList) {
      DOM.messagesList.classList.add('hidden');
      DOM.messagesList.innerHTML = '';
    }
  }

  /* ── Scroll to bottom ─────────────────────────────────────── */
  function scrollToBottom(smooth = true) {
    if (!DOM.chatScroll) return;
    DOM.chatScroll.scrollTo({
      top:      DOM.chatScroll.scrollHeight,
      behavior: smooth ? 'smooth' : 'instant',
    });
  }

  /* ── Connection status ───────────────────────────────────── */
  function setConnectionStatus(status) {
    // status: 'online' | 'offline' | 'loading'
    if (!DOM.connDot || !DOM.connLabel) return;

    DOM.connDot.className = `conn-dot ${status}`;

    const labels = {
      online:  'متصل',
      offline: 'غير متصل',
      loading: 'جاري التحميل...',
    };
    DOM.connLabel.textContent = labels[status] ?? '';
  }

  /* ── Init (يُستدعى من bootstrap.js بعد تحميل config) ───── */
  function init() {
    _applyBrand();
    setConnectionStatus('loading');
  }

  /* ── Public API ───────────────────────────────────────────── */
  return Object.freeze({
    DOM,
    STATE,
    init,
    hideWelcomeState,
    resetWelcomeState,
    scrollToBottom,
    setConnectionStatus,
  });

})();