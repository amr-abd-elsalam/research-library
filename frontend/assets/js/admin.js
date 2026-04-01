/* =============================================================
   admin.js — Ai8V Admin Dashboard
   Zero-framework, vanilla JS, IIFE module
   ============================================================= */
'use strict';

(function () {

  // ══════════════════════════════════════════════════════════
  //  DEFAULTS (hardcoded — no dependency on /api/config ADMIN)
  // ══════════════════════════════════════════════════════════
  const DEFAULTS = Object.freeze({
    refreshIntervalMs: 60000,
    sessionsPageSize:  20,
    fetchTimeoutMs:    8000,
  });

  // ══════════════════════════════════════════════════════════
  //  DOM REFS
  // ══════════════════════════════════════════════════════════
  const $ = (id) => document.getElementById(id);

  const DOM = {
    // Auth
    authOverlay:   $('admin-auth'),
    authLogo:      $('admin-auth-logo'),
    tokenInput:    $('admin-token-input'),
    authError:     $('admin-auth-error'),
    authBtn:       $('admin-auth-btn'),
    // App
    app:           $('admin-app'),
    headerLogo:    $('admin-header-logo'),
    headerTitle:   $('admin-header-title'),
    lastUpdate:    $('admin-last-update'),
    autoRefreshCb: $('admin-auto-refresh'),
    btnRefresh:    $('admin-btn-refresh'),
    btnLogout:     $('admin-btn-logout'),
    // Sections
    overviewGrid:  $('admin-overview-grid'),
    healthGrid:    $('admin-health-grid'),
    sessionsTbody: $('admin-sessions-tbody'),
    sessionsWrap:  $('admin-sessions-wrap'),
    sessionsPrev:  $('admin-sessions-prev'),
    sessionsNext:  $('admin-sessions-next'),
    sessionsInfo:  $('admin-sessions-info'),
    sessionsEmpty: $('admin-sessions-empty'),
    costGrid:      $('admin-cost-grid'),
  };

  // ══════════════════════════════════════════════════════════
  //  STATE
  // ══════════════════════════════════════════════════════════
  let state = {
    token: null,
    refreshTimer: null,
    sessionsPage: 0,
    sessionsTotal: 0,
    brand: null,
  };

  // ══════════════════════════════════════════════════════════
  //  AdminAPI — fetch helper
  // ══════════════════════════════════════════════════════════
  async function adminFetch(endpoint, params) {
    const url = new URL(endpoint, window.location.origin);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
      }
    }

    const controller = new AbortController();
    const timer = setTimeout(function () { controller.abort(); }, DEFAULTS.fetchTimeoutMs);

    try {
      const res = await fetch(url.toString(), {
        headers: { 'Authorization': 'Bearer ' + (state.token || '') },
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (res.status === 401 || res.status === 403) {
        doLogout();
        return null;
      }

      if (!res.ok) {
        throw new Error('HTTP ' + res.status);
      }

      return await res.json();
    } catch (err) {
      clearTimeout(timer);
      if (err.name === 'AbortError') {
        throw new Error('انتهت مهلة الاتصال');
      }
      throw err;
    }
  }

  async function fetchStats() {
    return adminFetch('/api/admin/stats');
  }

  async function fetchSessions(limit, offset) {
    return adminFetch('/api/admin/sessions', { limit: limit, offset: offset });
  }

  async function fetchHealth() {
    // Health endpoint doesn't need auth — but we send it anyway (harmless)
    const url = new URL('/api/health', window.location.origin);
    const controller = new AbortController();
    const timer = setTimeout(function () { controller.abort(); }, DEFAULTS.fetchTimeoutMs);
    try {
      const res = await fetch(url.toString(), { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } catch (err) {
      clearTimeout(timer);
      if (err.name === 'AbortError') throw new Error('انتهت مهلة الاتصال');
      throw err;
    }
  }

  async function fetchConfig() {
    try {
      const controller = new AbortController();
      const timer = setTimeout(function () { controller.abort(); }, 5000);
      const res = await fetch('/api/config', { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) return null;
      return await res.json();
    } catch (_) {
      return null;
    }
  }

  // ══════════════════════════════════════════════════════════
  //  BRAND — apply logo + colors from /api/config
  // ══════════════════════════════════════════════════════════
  function applyBrand(brand) {
    if (!brand) return;
    state.brand = brand;

    // Accent color
    if (brand.primaryColor) {
      document.documentElement.style.setProperty('--accent', brand.primaryColor);
      var hex = brand.primaryColor.replace('#', '');
      var r = parseInt(hex.slice(0, 2), 16);
      var g = parseInt(hex.slice(2, 4), 16);
      var b = parseInt(hex.slice(4, 6), 16);
      document.documentElement.style.setProperty('--accent-dim', 'rgba(' + r + ',' + g + ',' + b + ',.12)');
      document.documentElement.style.setProperty('--accent-border', 'rgba(' + r + ',' + g + ',' + b + ',.25)');
      document.documentElement.style.setProperty('--accent-light', 'rgba(' + r + ',' + g + ',' + b + ',.85)');
    }

    // Header title
    if (DOM.headerTitle) {
      DOM.headerTitle.textContent = (brand.name || 'Ai8V') + ' Admin';
    }

    // Page title
    document.title = (brand.name || 'Ai8V') + ' — Admin';

    // Logos
    applyLogoEl(DOM.authLogo, brand, 64, 'admin-auth-logo-placeholder');
    applyLogoEl(DOM.headerLogo, brand, 34, 'admin-header-logo-placeholder');
  }

  function applyLogoEl(container, brand, size, placeholderClass) {
    if (!container) return;
    while (container.firstChild) container.removeChild(container.firstChild);

    var img = new Image();
    img.onload = function () {
      while (container.firstChild) container.removeChild(container.firstChild);
      var el = document.createElement('img');
      el.src = brand.logo;
      el.alt = brand.name || '';
      el.width = size;
      el.height = size;
      container.appendChild(el);
    };
    img.onerror = function () {
      while (container.firstChild) container.removeChild(container.firstChild);
      var ph = document.createElement('div');
      ph.className = placeholderClass;
      ph.textContent = (brand.name || 'A').charAt(0);
      container.appendChild(ph);
    };
    img.src = brand.logo || '';
  }

  // ══════════════════════════════════════════════════════════
  //  AUTH
  // ══════════════════════════════════════════════════════════
  function initAuth() {
    var saved = sessionStorage.getItem('admin_token');
    if (saved) {
      state.token = saved;
      verifyAndEnter();
      return;
    }
    showLogin();
  }

  function showLogin() {
    DOM.authOverlay.classList.remove('hidden');
    DOM.app.classList.add('hidden');
    if (DOM.tokenInput) DOM.tokenInput.focus();
  }

  function doLogout() {
    sessionStorage.removeItem('admin_token');
    state.token = null;
    stopAutoRefresh();
    DOM.app.classList.add('hidden');
    DOM.authOverlay.classList.remove('hidden', 'admin-fade-out');
    if (DOM.tokenInput) {
      DOM.tokenInput.value = '';
      DOM.tokenInput.focus();
    }
    if (DOM.authError) DOM.authError.classList.add('hidden');
  }

  async function verifyAndEnter() {
    try {
      var data = await adminFetch('/api/admin/stats');
      if (!data) {
        showLogin();
        return;
      }
      enterDashboard();
    } catch (_) {
      sessionStorage.removeItem('admin_token');
      state.token = null;
      showLogin();
    }
  }

  async function handleLogin() {
    var token = DOM.tokenInput ? DOM.tokenInput.value.trim() : '';
    if (!token) {
      showAuthError('أدخل التوكن');
      return;
    }

    DOM.authBtn.disabled = true;
    DOM.authBtn.textContent = 'جاري التحقق...';
    DOM.authError.classList.add('hidden');

    state.token = token;
    try {
      var data = await adminFetch('/api/admin/stats');
      if (!data) {
        showAuthError('توكن غير صالح');
        state.token = null;
        DOM.authBtn.disabled = false;
        DOM.authBtn.textContent = 'دخول';
        return;
      }
      sessionStorage.setItem('admin_token', token);
      DOM.authOverlay.classList.add('admin-fade-out');
      setTimeout(function () {
        enterDashboard();
      }, 300);
    } catch (err) {
      showAuthError('فشل الاتصال: ' + err.message);
      state.token = null;
      DOM.authBtn.disabled = false;
      DOM.authBtn.textContent = 'دخول';
    }
  }

  function showAuthError(msg) {
    if (!DOM.authError) return;
    DOM.authError.textContent = msg;
    DOM.authError.classList.remove('hidden');
  }

  function enterDashboard() {
    DOM.authOverlay.classList.add('hidden');
    DOM.app.classList.remove('hidden');
    DOM.authBtn.disabled = false;
    DOM.authBtn.textContent = 'دخول';
    loadAll();
    setupAutoRefresh();
  }

  // ══════════════════════════════════════════════════════════
  //  OVERVIEW CARDS
  // ══════════════════════════════════════════════════════════
  var OVERVIEW_CARDS = [
    { key: 'total',       label: 'إجمالي المحادثات', icon: 'chat',    extract: function (s) { return s.analytics.chat.total; } },
    { key: 'today',       label: 'اليوم',            icon: 'today',   extract: function (s) { return s.analytics.chat.today; } },
    { key: 'week',        label: 'هذا الأسبوع',      icon: 'week',    extract: function (s) { return s.analytics.chat.week; } },
    { key: 'month',       label: 'هذا الشهر',        icon: 'month',   extract: function (s) { return s.analytics.chat.month; } },
    { key: 'users',       label: 'مستخدمين فريدين',  icon: 'users',   extract: function (s) { return s.analytics.unique_users; } },
    { key: 'score',       label: 'معدل الثقة',       icon: 'score',   extract: function (s) { return Math.round((s.analytics.avg_score || 0) * 100) + '%'; } },
    { key: 'cost',        label: 'التكلفة الإجمالية', icon: 'cost',    extract: function (s) { return '$' + (s.analytics.estimated_total_cost || 0).toFixed(4); } },
    { key: 'cache',       label: 'Cache Hit Rate',    icon: 'cache',   extract: function (s) { return s.analytics.cache ? s.analytics.cache.hit_rate : '0%'; } },
    { key: 'latency',     label: 'معدل الاستجابة',   icon: 'latency', extract: function (s) { return (s.analytics.avg_latency_ms || 0) + 'ms'; } },
  ];

  var SVG_ICONS = {
    chat:    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
    today:   '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
    week:    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M3 10h18M8 2v4M16 2v4"/></svg>',
    month:   '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M3 10h18M8 2v4M16 2v4"/></svg>',
    users:   '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    score:   '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>',
    cost:    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
    cache:   '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12A10 10 0 1 1 12 2"/><path d="M22 2 13.5 10.5"/><path d="M16 2h6v6"/></svg>',
    latency: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
  };

  function renderOverview(statsData) {
    var grid = DOM.overviewGrid;
    if (!grid) return;
    while (grid.firstChild) grid.removeChild(grid.firstChild);

    for (var i = 0; i < OVERVIEW_CARDS.length; i++) {
      var def = OVERVIEW_CARDS[i];
      var val;
      try { val = def.extract(statsData); } catch (_) { val = '—'; }

      var card = document.createElement('div');
      card.className = 'admin-card';

      var header = document.createElement('div');
      header.className = 'admin-card-header';

      var iconWrap = document.createElement('div');
      iconWrap.className = 'admin-card-icon';
      // SVG icons — static, safe (not user-provided)
      iconWrap.innerHTML = SVG_ICONS[def.icon] || '';
      header.appendChild(iconWrap);
      card.appendChild(header);

      var valueEl = document.createElement('div');
      valueEl.className = 'admin-card-value';
      valueEl.textContent = String(val);
      card.appendChild(valueEl);

      var labelEl = document.createElement('div');
      labelEl.className = 'admin-card-label';
      labelEl.textContent = def.label;
      card.appendChild(labelEl);

      grid.appendChild(card);
    }
  }

  function showOverviewSkeleton() {
    var grid = DOM.overviewGrid;
    if (!grid) return;
    while (grid.firstChild) grid.removeChild(grid.firstChild);
    for (var i = 0; i < 8; i++) {
      var s = document.createElement('div');
      s.className = 'admin-skeleton admin-skeleton-card';
      grid.appendChild(s);
    }
  }

  // ══════════════════════════════════════════════════════════
  //  HEALTH
  // ══════════════════════════════════════════════════════════
  function renderHealth(healthData) {
    var grid = DOM.healthGrid;
    if (!grid) return;
    while (grid.firstChild) grid.removeChild(grid.firstChild);

    // Qdrant
    addHealthItem(grid, 'Qdrant',
      healthData.qdrant && healthData.qdrant.status ? 'ok' : 'error',
      'نقاط البيانات: ' + ((healthData.qdrant && healthData.qdrant.points_count) || 0));

    // Gemini
    var geminiStatus = healthData.gemini && healthData.gemini.status ? 'ok' : 'error';
    if (healthData.gemini && healthData.gemini.detail === 'quota limited') geminiStatus = 'warn';
    addHealthItem(grid, 'Gemini',
      geminiStatus,
      'زمن الاستجابة: ' + ((healthData.gemini && healthData.gemini.latency_ms) || 0) + 'ms');

    // Cache
    var cacheData = healthData.cache || {};
    addHealthItem(grid, 'Cache', 'ok',
      'الحجم: ' + (cacheData.size || 0) + ' | Hit Rate: ' + (cacheData.hit_rate || '0%'));

    // System
    var sys = healthData.system || {};
    addHealthItem(grid, 'النظام',
      healthData.status === 'ok' ? 'ok' : 'warn',
      'Uptime: ' + formatUptime(sys.uptime_sec || 0) + ' | RAM: ' + (sys.memory_mb || 0) + 'MB | ' + (sys.node_env || ''));
  }

  function addHealthItem(parent, label, status, detail) {
    var item = document.createElement('div');
    item.className = 'admin-health-item';

    var hdr = document.createElement('div');
    hdr.className = 'admin-health-header';

    var dot = document.createElement('div');
    dot.className = 'admin-status-dot ' + status;
    hdr.appendChild(dot);

    var lbl = document.createElement('span');
    lbl.className = 'admin-health-label';
    lbl.textContent = label;
    hdr.appendChild(lbl);

    item.appendChild(hdr);

    var det = document.createElement('div');
    det.className = 'admin-health-detail';
    det.textContent = detail;
    item.appendChild(det);

    parent.appendChild(item);
  }

  function formatUptime(sec) {
    if (sec < 60) return sec + ' ثانية';
    if (sec < 3600) return Math.floor(sec / 60) + ' دقيقة';
    if (sec < 86400) return Math.floor(sec / 3600) + ' ساعة';
    return Math.floor(sec / 86400) + ' يوم';
  }

  function showHealthSkeleton() {
    var grid = DOM.healthGrid;
    if (!grid) return;
    while (grid.firstChild) grid.removeChild(grid.firstChild);
    for (var i = 0; i < 4; i++) {
      var s = document.createElement('div');
      s.className = 'admin-skeleton admin-skeleton-card';
      grid.appendChild(s);
    }
  }

  // ══════════════════════════════════════════════════════════
  //  SESSIONS TABLE
  // ══════════════════════════════════════════════════════════
  function renderSessions(data) {
    var tbody = DOM.sessionsTbody;
    if (!tbody) return;
    while (tbody.firstChild) tbody.removeChild(tbody.firstChild);

    var sessions = (data && data.sessions) || [];
    state.sessionsTotal = (data && data.total) || 0;

    if (sessions.length === 0) {
      DOM.sessionsWrap.classList.add('hidden');
      DOM.sessionsEmpty.classList.remove('hidden');
      updatePagination();
      return;
    }

    DOM.sessionsWrap.classList.remove('hidden');
    DOM.sessionsEmpty.classList.add('hidden');

    for (var i = 0; i < sessions.length; i++) {
      var s = sessions[i];
      var tr = document.createElement('tr');

      addTd(tr, (s.session_id || '').slice(0, 8) + '…');
      addTd(tr, formatDate(s.created_at));
      addTd(tr, formatDate(s.last_active));
      addTd(tr, String(s.message_count || 0));
      addTd(tr, (s.ip_hash || '—').slice(0, 10));
      addTd(tr, s.topic_filter || 'الكل');

      tbody.appendChild(tr);
    }

    updatePagination();
  }

  function addTd(tr, text) {
    var td = document.createElement('td');
    td.textContent = text;
    tr.appendChild(td);
  }

  function formatDate(iso) {
    if (!iso) return '—';
    try {
      var d = new Date(iso);
      return d.toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' }) +
        ' ' + d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
    } catch (_) {
      return iso.slice(0, 16);
    }
  }

  function updatePagination() {
    var pageSize = DEFAULTS.sessionsPageSize;
    var start = state.sessionsPage * pageSize;
    var end = Math.min(start + pageSize, state.sessionsTotal);

    if (DOM.sessionsInfo) {
      if (state.sessionsTotal === 0) {
        DOM.sessionsInfo.textContent = '';
      } else {
        DOM.sessionsInfo.textContent = 'عرض ' + (start + 1) + ' - ' + end + ' من ' + state.sessionsTotal;
      }
    }

    if (DOM.sessionsPrev) DOM.sessionsPrev.disabled = (state.sessionsPage <= 0);
    if (DOM.sessionsNext) DOM.sessionsNext.disabled = (end >= state.sessionsTotal);
  }

  async function loadSessionsPage(page) {
    state.sessionsPage = page;
    var pageSize = DEFAULTS.sessionsPageSize;
    try {
      var data = await fetchSessions(pageSize, page * pageSize);
      if (data) renderSessions(data);
    } catch (err) {
      showSectionError(DOM.sessionsTbody ? DOM.sessionsTbody.parentElement.parentElement : null, err.message, function () { loadSessionsPage(page); });
    }
  }

  function showSessionsSkeleton() {
    var tbody = DOM.sessionsTbody;
    if (!tbody) return;
    while (tbody.firstChild) tbody.removeChild(tbody.firstChild);
    DOM.sessionsWrap.classList.remove('hidden');
    DOM.sessionsEmpty.classList.add('hidden');
    for (var i = 0; i < 5; i++) {
      var tr = document.createElement('tr');
      for (var j = 0; j < 6; j++) {
        var td = document.createElement('td');
        var sk = document.createElement('div');
        sk.className = 'admin-skeleton';
        sk.style.height = '14px';
        sk.style.width = (40 + Math.random() * 40) + '%';
        td.appendChild(sk);
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
  }

  // ══════════════════════════════════════════════════════════
  //  COST BREAKDOWN
  // ══════════════════════════════════════════════════════════
  function renderCost(statsData) {
    var grid = DOM.costGrid;
    if (!grid) return;
    while (grid.firstChild) grid.removeChild(grid.firstChild);

    var cost = (statsData && statsData.cost) || {};
    var tokens = (cost && cost.tokens) || {};
    var analytics = (statsData && statsData.analytics) || {};

    var items = [
      { label: 'التكلفة الإجمالية', value: '$' + (cost.total_cost || 0).toFixed(6) },
      { label: 'متوسط تكلفة/طلب', value: '$' + (cost.avg_cost_per_request || 0).toFixed(6) },
      { label: 'إجمالي الطلبات', value: String(cost.total_requests || 0) },
      { label: 'Embedding Tokens', value: formatNum(tokens.embedding || analytics.tokens && analytics.tokens.embedding || 0) },
      { label: 'Generation Tokens', value: formatNum(tokens.generation || analytics.tokens && analytics.tokens.generation || 0) },
      { label: 'إجمالي Tokens', value: formatNum(tokens.total || ((analytics.tokens && analytics.tokens.embedding || 0) + (analytics.tokens && analytics.tokens.generation || 0))) },
    ];

    for (var i = 0; i < items.length; i++) {
      var card = document.createElement('div');
      card.className = 'admin-card';

      var valueEl = document.createElement('div');
      valueEl.className = 'admin-card-value';
      valueEl.style.fontSize = '20px';
      valueEl.textContent = items[i].value;
      card.appendChild(valueEl);

      var labelEl = document.createElement('div');
      labelEl.className = 'admin-card-label';
      labelEl.textContent = items[i].label;
      card.appendChild(labelEl);

      grid.appendChild(card);
    }
  }

  function formatNum(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return String(n);
  }

  function showCostSkeleton() {
    var grid = DOM.costGrid;
    if (!grid) return;
    while (grid.firstChild) grid.removeChild(grid.firstChild);
    for (var i = 0; i < 6; i++) {
      var s = document.createElement('div');
      s.className = 'admin-skeleton admin-skeleton-card';
      s.style.height = '80px';
      grid.appendChild(s);
    }
  }

  // ══════════════════════════════════════════════════════════
  //  SECTION ERROR STATE
  // ══════════════════════════════════════════════════════════
  function showSectionError(container, msg, retryFn) {
    if (!container) return;
    var existing = container.querySelector('.admin-error-state');
    if (existing) existing.remove();

    var wrap = document.createElement('div');
    wrap.className = 'admin-error-state';

    var p = document.createElement('p');
    p.textContent = msg || 'حدث خطأ في تحميل البيانات';
    wrap.appendChild(p);

    if (retryFn) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'admin-btn-retry';
      btn.textContent = 'إعادة المحاولة';
      btn.addEventListener('click', retryFn);
      wrap.appendChild(btn);
    }

    container.appendChild(wrap);
  }

  // ══════════════════════════════════════════════════════════
  //  LOAD ALL
  // ══════════════════════════════════════════════════════════
  async function loadAll() {
    // Show skeletons
    showOverviewSkeleton();
    showHealthSkeleton();
    showSessionsSkeleton();
    showCostSkeleton();

    // Parallel fetch
    var results = await Promise.allSettled([
      fetchStats(),
      fetchHealth(),
      fetchSessions(DEFAULTS.sessionsPageSize, 0),
    ]);

    // Stats
    if (results[0].status === 'fulfilled' && results[0].value) {
      renderOverview(results[0].value);
      renderCost(results[0].value);
    } else {
      var statsErr = results[0].reason ? results[0].reason.message : 'فشل تحميل الإحصائيات';
      showSectionError(DOM.overviewGrid, statsErr, loadAll);
      showSectionError(DOM.costGrid, statsErr, loadAll);
    }

    // Health
    if (results[1].status === 'fulfilled' && results[1].value) {
      renderHealth(results[1].value);
    } else {
      showSectionError(DOM.healthGrid,
        (results[1].reason ? results[1].reason.message : 'فشل تحميل حالة النظام'),
        loadAll);
    }

    // Sessions
    state.sessionsPage = 0;
    if (results[2].status === 'fulfilled' && results[2].value) {
      renderSessions(results[2].value);
    } else {
      showSectionError(
        DOM.sessionsTbody ? DOM.sessionsTbody.parentElement.parentElement : null,
        (results[2].reason ? results[2].reason.message : 'فشل تحميل الجلسات'),
        function () { loadSessionsPage(0); });
    }

    // Last update
    updateTimestamp();
  }

  // ══════════════════════════════════════════════════════════
  //  AUTO REFRESH
  // ══════════════════════════════════════════════════════════
  function setupAutoRefresh() {
    if (DOM.autoRefreshCb && DOM.autoRefreshCb.checked) {
      startAutoRefresh();
    }
  }

  function startAutoRefresh() {
    stopAutoRefresh();
    state.refreshTimer = setInterval(function () {
      loadAll();
    }, DEFAULTS.refreshIntervalMs);
  }

  function stopAutoRefresh() {
    if (state.refreshTimer) {
      clearInterval(state.refreshTimer);
      state.refreshTimer = null;
    }
  }

  function updateTimestamp() {
    if (!DOM.lastUpdate) return;
    try {
      DOM.lastUpdate.textContent = 'آخر تحديث: ' +
        new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch (_) {
      DOM.lastUpdate.textContent = 'آخر تحديث: ' + new Date().toISOString().slice(11, 19);
    }
  }

  // ══════════════════════════════════════════════════════════
  //  EVENT LISTENERS
  // ══════════════════════════════════════════════════════════
  function bindEvents() {
    // Auth
    if (DOM.authBtn) {
      DOM.authBtn.addEventListener('click', handleLogin);
    }
    if (DOM.tokenInput) {
      DOM.tokenInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleLogin();
        }
      });
    }

    // Logout
    if (DOM.btnLogout) {
      DOM.btnLogout.addEventListener('click', doLogout);
    }

    // Manual refresh
    if (DOM.btnRefresh) {
      DOM.btnRefresh.addEventListener('click', function () {
        loadAll();
      });
    }

    // Auto refresh toggle
    if (DOM.autoRefreshCb) {
      DOM.autoRefreshCb.addEventListener('change', function () {
        if (DOM.autoRefreshCb.checked) {
          startAutoRefresh();
        } else {
          stopAutoRefresh();
        }
      });
    }

    // Sessions pagination
    if (DOM.sessionsPrev) {
      DOM.sessionsPrev.addEventListener('click', function () {
        if (state.sessionsPage > 0) {
          loadSessionsPage(state.sessionsPage - 1);
        }
      });
    }
    if (DOM.sessionsNext) {
      DOM.sessionsNext.addEventListener('click', function () {
        var pageSize = DEFAULTS.sessionsPageSize;
        if ((state.sessionsPage + 1) * pageSize < state.sessionsTotal) {
          loadSessionsPage(state.sessionsPage + 1);
        }
      });
    }
  }

  // ══════════════════════════════════════════════════════════
  //  BOOTSTRAP
  // ══════════════════════════════════════════════════════════
  document.addEventListener('DOMContentLoaded', async function () {
    bindEvents();

    // Fetch brand from config (public endpoint — no auth needed)
    var configData = await fetchConfig();
    if (configData && configData.BRAND) {
      applyBrand(configData.BRAND);
    }

    initAuth();
  });

})();
