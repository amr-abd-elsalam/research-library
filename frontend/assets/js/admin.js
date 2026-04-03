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
    // Metrics (Phase 14)
    metricsCards:  $('admin-metrics-cards'),
    metricsStages: $('admin-metrics-stages'),
    metricsEmpty:  $('admin-metrics-empty'),
    // Log (Phase 16)
    logEntries:    $('admin-log-entries'),
    logFilter:     $('admin-log-filter'),
    // Inspect (Phase 17)
    inspectGrid:    $('admin-inspect-grid'),
    inspectDetails: $('admin-inspect-details'),
    // Commands (Phase 20)
    commandsGraph:  $('admin-commands-graph'),
    commandsMetrics:$('admin-commands-metrics'),
    commandsEmpty:  $('admin-commands-empty'),
    // Insights (Phase 22)
    insightsSummary:         $('admin-insights-summary'),
    insightsDistributions:   $('admin-insights-distributions'),
    insightsRecommendations: $('admin-insights-recommendations'),
    insightsEmpty:           $('admin-insights-empty'),
    // Feedback (Phase 33)
    feedbackCounts:  $('admin-feedback-counts'),
    feedbackRecent:  $('admin-feedback-recent'),
    feedbackEmpty:   $('admin-feedback-empty'),
    // Correlation Explorer (Phase 34)
    correlationFilter: $('admin-correlation-filter'),
    correlationCards:  $('admin-correlation-cards'),
    correlationEmpty:  $('admin-correlation-empty'),
    // Audit Trail (Phase 34)
    auditInput:     $('admin-audit-session-input'),
    auditBtn:       $('admin-audit-btn'),
    auditTimeline:  $('admin-audit-timeline'),
    auditEmpty:     $('admin-audit-empty'),
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

  async function fetchMetrics() {
    return adminFetch('/api/admin/metrics');
  }

  async function fetchLog() {
    return adminFetch('/api/admin/log', { limit: 200 });
  }

  async function fetchInspect() {
    return adminFetch('/api/admin/inspect');
  }

  async function fetchCommandGraph() {
    // Public endpoint — no auth needed, but we send it anyway (harmless)
    var url = new URL('/api/commands', window.location.origin);
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, DEFAULTS.fetchTimeoutMs);
    try {
      var res = await fetch(url.toString(), { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) return null;
      return await res.json();
    } catch (_) {
      clearTimeout(timer);
      return null;
    }
  }

  async function fetchFeedback() {
    return adminFetch('/api/admin/feedback', { limit: 50 });
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
    gauge:   '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z"/><path d="M12 12l4-4"/><circle cx="12" cy="12" r="1"/></svg>',
    stage:   '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>',
    counter: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>',
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
  //  METRICS (Phase 14)
  // ══════════════════════════════════════════════════════════
  function renderMetrics(metricsData) {
    var cards  = DOM.metricsCards;
    var stages = DOM.metricsStages;
    var empty  = DOM.metricsEmpty;
    if (!cards || !stages) return;

    while (cards.firstChild) cards.removeChild(cards.firstChild);
    while (stages.firstChild) stages.removeChild(stages.firstChild);

    if (!metricsData || !metricsData.metrics) {
      cards.classList.add('hidden');
      stages.classList.add('hidden');
      if (empty) empty.classList.remove('hidden');
      return;
    }

    var m = metricsData.metrics;
    var hasData = (Object.keys(m.counters || {}).length > 0) ||
                  (Object.keys(m.histograms || {}).length > 0);

    if (!hasData) {
      cards.classList.add('hidden');
      stages.classList.add('hidden');
      if (empty) empty.classList.remove('hidden');
      return;
    }

    cards.classList.remove('hidden');
    stages.classList.remove('hidden');
    if (empty) empty.classList.add('hidden');

    // ── Data Since Badge (Phase 23) ────────────────────────
    var collectedSince = m.collected_since || (metricsData.metrics && metricsData.metrics.collected_since);
    if (collectedSince && cards.parentElement) {
      var existingBadge = cards.parentElement.querySelector('.admin-metrics-badge');
      if (existingBadge) existingBadge.remove();
      var sinceDate = new Date(collectedSince);
      var badge = document.createElement('div');
      badge.className = 'admin-metrics-badge';
      badge.textContent = '\uD83D\uDCCA \u0628\u064A\u0627\u0646\u0627\u062A \u0645\u0646: ' + sinceDate.toLocaleString('ar-EG');
      cards.parentElement.insertBefore(badge, cards);
    }

    // ── Summary Cards ──────────────────────────────────────
    // 1. Request Duration P95
    var reqHist = (m.histograms || {})['request_duration_ms'] || {};
    var reqAll  = reqHist['[]'] || {};
    addMetricCard(cards, SVG_ICONS.latency, (reqAll.p95 || 0) + 'ms', 'P95 زمن الاستجابة',
      'P50: ' + (reqAll.p50 || 0) + 'ms · P99: ' + (reqAll.p99 || 0) + 'ms');

    // 2. Active Requests
    var activeReqs = ((m.gauges || {})['active_requests']) || 0;
    addMetricCard(cards, SVG_ICONS.gauge, String(activeReqs), 'طلبات نشطة', 'الطلبات الجارية حالياً');

    // 3. Total Requests
    var reqCounters = (m.counters || {})['requests_total'] || {};
    var pipelineCount = reqCounters['[["type","pipeline"]]'] || 0;
    var cacheHitCount = reqCounters['[["type","cache_hit"]]'] || 0;
    var totalReqs = pipelineCount + cacheHitCount;
    addMetricCard(cards, SVG_ICONS.counter, String(totalReqs), 'إجمالي الطلبات',
      'Pipeline: ' + pipelineCount + ' · Cache: ' + cacheHitCount);

    // 4. Aborted / Errors
    var abortCounters = (m.counters || {})['aborted_total'] || {};
    var abortTotal = 0;
    for (var ak in abortCounters) { abortTotal += abortCounters[ak]; }
    var stageErrCounters = (m.counters || {})['stage_errors_total'] || {};
    var stageErrTotal = 0;
    for (var ek in stageErrCounters) { stageErrTotal += stageErrCounters[ek]; }
    addMetricCard(cards, SVG_ICONS.stage, String(abortTotal), 'طلبات ملغاة',
      'أخطاء Stages: ' + stageErrTotal);

    // ── Stage Breakdown Bars ───────────────────────────────
    var stageHist = (m.histograms || {})['stage_duration_ms'] || {};
    var stageKeys = Object.keys(stageHist);

    if (stageKeys.length === 0) {
      stages.classList.add('hidden');
      return;
    }

    var stageTitle = document.createElement('div');
    stageTitle.className = 'admin-metrics-stages-title';
    stageTitle.textContent = 'تفاصيل المراحل (P95 ms)';
    stages.appendChild(stageTitle);

    // Find max p95 for bar scaling
    var maxP95 = 0;
    for (var si = 0; si < stageKeys.length; si++) {
      var sv = stageHist[stageKeys[si]];
      if (sv.p95 > maxP95) maxP95 = sv.p95;
    }
    if (maxP95 === 0) maxP95 = 1;

    for (var sj = 0; sj < stageKeys.length; sj++) {
      var sKey  = stageKeys[sj];
      var sVal  = stageHist[sKey];

      // Extract stage name from serialized label key like '[["stage","stageEmbed"]]'
      var stageName = sKey;
      try {
        var parsed = JSON.parse(sKey);
        if (Array.isArray(parsed) && parsed.length > 0 && Array.isArray(parsed[0])) {
          stageName = parsed[0][1] || sKey;
        }
      } catch (_) { /* keep raw key */ }

      var row = document.createElement('div');
      row.className = 'admin-metrics-stage-row';

      var labelEl = document.createElement('div');
      labelEl.className = 'admin-metrics-stage-label';
      labelEl.textContent = stageName;
      row.appendChild(labelEl);

      var barWrap = document.createElement('div');
      barWrap.className = 'admin-metrics-stage-bar-wrap';

      var bar = document.createElement('div');
      bar.className = 'admin-metrics-stage-bar';
      var pct = Math.max((sVal.p95 / maxP95) * 100, 2);
      bar.style.width = pct + '%';
      barWrap.appendChild(bar);
      row.appendChild(barWrap);

      var valEl = document.createElement('div');
      valEl.className = 'admin-metrics-stage-value';
      valEl.textContent = sVal.p95 + 'ms';
      valEl.title = 'P50: ' + sVal.p50 + 'ms · P99: ' + sVal.p99 + 'ms · Count: ' + sVal.count;
      row.appendChild(valEl);

      stages.appendChild(row);
    }
  }

  function addMetricCard(parent, iconSvg, value, label, sub) {
    var card = document.createElement('div');
    card.className = 'admin-card';

    var header = document.createElement('div');
    header.className = 'admin-card-header';
    var iconWrap = document.createElement('div');
    iconWrap.className = 'admin-card-icon';
    iconWrap.innerHTML = iconSvg || '';
    header.appendChild(iconWrap);
    card.appendChild(header);

    var valueEl = document.createElement('div');
    valueEl.className = 'admin-card-value';
    valueEl.textContent = value;
    card.appendChild(valueEl);

    var labelEl = document.createElement('div');
    labelEl.className = 'admin-card-label';
    labelEl.textContent = label;
    card.appendChild(labelEl);

    if (sub) {
      var subEl = document.createElement('div');
      subEl.className = 'admin-card-sub';
      subEl.textContent = sub;
      card.appendChild(subEl);
    }

    parent.appendChild(card);
  }

  function showMetricsSkeleton() {
    var cards = DOM.metricsCards;
    if (!cards) return;
    while (cards.firstChild) cards.removeChild(cards.firstChild);
    cards.classList.remove('hidden');
    for (var i = 0; i < 4; i++) {
      var s = document.createElement('div');
      s.className = 'admin-skeleton admin-skeleton-card';
      cards.appendChild(s);
    }
    if (DOM.metricsStages) {
      while (DOM.metricsStages.firstChild) DOM.metricsStages.removeChild(DOM.metricsStages.firstChild);
      DOM.metricsStages.classList.remove('hidden');
    }
    if (DOM.metricsEmpty) DOM.metricsEmpty.classList.add('hidden');
  }

  // ══════════════════════════════════════════════════════════
  //  OPERATIONAL LOG (Phase 16)
  // ══════════════════════════════════════════════════════════
  var _logData = null;

  function renderLog(data) {
    _logData = data;
    var container = DOM.logEntries;
    if (!container) return;

    if (!data || !data.entries || data.entries.length === 0) {
      container.innerHTML = '<p class="admin-empty-msg">\u0644\u0627 \u062a\u0648\u062c\u062f \u0623\u062d\u062f\u0627\u062b \u0628\u0639\u062f</p>';
      return;
    }

    var filterValue = DOM.logFilter ? DOM.logFilter.value : 'all';
    var filtered = filterValue === 'all'
      ? data.entries
      : data.entries.filter(function (e) { return e.event === filterValue; });

    if (filtered.length === 0) {
      container.innerHTML = '<p class="admin-empty-msg">\u0644\u0627 \u062a\u0648\u062c\u062f \u0623\u062d\u062f\u0627\u062b \u0645\u0637\u0627\u0628\u0642\u0629 \u0644\u0644\u0641\u0644\u062a\u0631</p>';
      return;
    }

    var html = '';
    var max = Math.min(filtered.length, 100);
    for (var i = 0; i < max; i++) {
      var e = filtered[i];
      var isError = e.event.indexOf('error') !== -1;
      var isWarn = e.event.indexOf('warn') !== -1;
      var cssClass = isError ? 'admin-log-error' : isWarn ? 'admin-log-warn' : 'admin-log-info';
      var time = '';
      try {
        time = new Date(e.timestamp).toLocaleTimeString('ar-EG', { hour12: false });
      } catch (_) {
        time = e.timestamp ? e.timestamp.slice(11, 19) : '';
      }
      var corrId = e.correlationId ? '<span class="admin-log-corr">' + e.correlationId + '</span>' : '';
      var detailStr = e.detail ? '<span class="admin-log-detail">' + JSON.stringify(e.detail) + '</span>' : '';
      html += '<div class="admin-log-row ' + cssClass + '">' +
        '<span class="admin-log-time">' + time + '</span>' +
        '<span class="admin-log-event">' + e.event + '</span>' +
        '<span class="admin-log-module">' + e.module + '</span>' +
        corrId + detailStr + '</div>';
    }
    container.innerHTML = html;
  }

  function showLogSkeleton() {
    var container = DOM.logEntries;
    if (!container) return;
    container.innerHTML = '<p class="admin-empty-msg">\u062c\u0627\u0631\u064a \u0627\u0644\u062a\u062d\u0645\u064a\u0644...</p>';
  }

  // ══════════════════════════════════════════════════════════
  //  SYSTEM INSPECTION (Phase 17)
  // ══════════════════════════════════════════════════════════
  function renderInspect(data) {
    var grid = DOM.inspectGrid;
    var details = DOM.inspectDetails;
    if (!grid) return;

    while (grid.firstChild) grid.removeChild(grid.firstChild);
    if (details) while (details.firstChild) details.removeChild(details.firstChild);

    if (!data) return;

    // ── Summary cards ──────────────────────────────────────
    var hookTotal = (data.hooks ? data.hooks.beforePipeline || 0 : 0)
      + (data.hooks ? data.hooks.afterPipeline || 0 : 0);
    var bsKeys = data.hooks && data.hooks.beforeStage ? Object.keys(data.hooks.beforeStage) : [];
    for (var bi = 0; bi < bsKeys.length; bi++) hookTotal += data.hooks.beforeStage[bsKeys[bi]];
    var asKeys = data.hooks && data.hooks.afterStage ? Object.keys(data.hooks.afterStage) : [];
    for (var ai = 0; ai < asKeys.length; ai++) hookTotal += data.hooks.afterStage[asKeys[ai]];

    var metricsActive = (data.metrics ? (data.metrics.counterNames || 0) + (data.metrics.histogramNames || 0) + (data.metrics.gaugeNames || 0) : 0);

    var cards = [
      { label: '\u0623\u0648\u0627\u0645\u0631 \u0645\u0633\u062c\u0644\u0629',       value: data.commands ? data.commands.total || 0 : 0,       icon: '\u2318' },
      { label: 'Pipeline Hooks',      value: hookTotal,                                  icon: '\uD83D\uDD17' },
      { label: 'EventBus Listeners',  value: data.eventBus ? data.eventBus.totalListeners || 0 : 0, icon: '\uD83D\uDCE1' },
      { label: 'Plugins',             value: data.plugins ? data.plugins.total || 0 : 0, icon: '\uD83E\uDDE9' },
      { label: 'Metrics Active',      value: metricsActive,                              icon: '\uD83D\uDCCA' },
      { label: '\u0633\u062c\u0644 \u062a\u0634\u063a\u064a\u0644\u064a', value: (data.operationalLog ? data.operationalLog.size || 0 : 0) + '/' + (data.operationalLog ? data.operationalLog.maxEntries || 500 : 500), icon: '\uD83D\uDCCB' },
    ];

    for (var ci = 0; ci < cards.length; ci++) {
      var card = document.createElement('div');
      card.className = 'admin-inspect-card';

      var iconSpan = document.createElement('span');
      iconSpan.className = 'admin-inspect-icon';
      iconSpan.textContent = cards[ci].icon;
      card.appendChild(iconSpan);

      var valSpan = document.createElement('span');
      valSpan.className = 'admin-inspect-value';
      valSpan.textContent = String(cards[ci].value);
      card.appendChild(valSpan);

      var lblSpan = document.createElement('span');
      lblSpan.className = 'admin-inspect-label';
      lblSpan.textContent = cards[ci].label;
      card.appendChild(lblSpan);

      grid.appendChild(card);
    }

    // ── Detail sections ──────────────────────────────────
    if (!details) return;

    // Commands list
    if (data.commands && data.commands.list && data.commands.list.length > 0) {
      var cmdTitle = document.createElement('h3');
      cmdTitle.textContent = '\u0627\u0644\u0623\u0648\u0627\u0645\u0631 \u0627\u0644\u0645\u0633\u062c\u0644\u0629';
      details.appendChild(cmdTitle);

      var cmdList = document.createElement('div');
      cmdList.className = 'admin-inspect-list';
      for (var cj = 0; cj < data.commands.list.length; cj++) {
        var cmd = data.commands.list[cj];
        var aliases = cmd.aliases && cmd.aliases.length ? ' (' + cmd.aliases.join(', ') + ')' : '';
        var item = document.createElement('div');
        item.className = 'admin-inspect-item';

        var nameEl = document.createElement('span');
        nameEl.className = 'admin-inspect-cmd-name';
        nameEl.textContent = cmd.name + aliases;
        item.appendChild(nameEl);

        var catEl = document.createElement('span');
        catEl.className = 'admin-inspect-cmd-cat';
        catEl.textContent = cmd.category;
        item.appendChild(catEl);

        var descEl = document.createElement('span');
        descEl.className = 'admin-inspect-cmd-desc';
        descEl.textContent = cmd.description || '';
        item.appendChild(descEl);

        cmdList.appendChild(item);
      }
      details.appendChild(cmdList);
    }

    // EventBus breakdown
    if (data.eventBus && data.eventBus.byEvent) {
      var ebTitle = document.createElement('h3');
      ebTitle.textContent = 'EventBus Listeners';
      details.appendChild(ebTitle);

      var ebList = document.createElement('div');
      ebList.className = 'admin-inspect-list';
      var ebKeys = Object.keys(data.eventBus.byEvent);
      for (var ei = 0; ei < ebKeys.length; ei++) {
        var ebItem = document.createElement('div');
        ebItem.className = 'admin-inspect-item';

        var evName = document.createElement('span');
        evName.className = 'admin-inspect-event';
        evName.textContent = ebKeys[ei];
        ebItem.appendChild(evName);

        var evCount = document.createElement('span');
        evCount.className = 'admin-inspect-count';
        evCount.textContent = String(data.eventBus.byEvent[ebKeys[ei]]);
        ebItem.appendChild(evCount);

        var evSpacer = document.createElement('span');
        ebItem.appendChild(evSpacer);

        ebList.appendChild(ebItem);
      }
      details.appendChild(ebList);
    }

    // Hooks breakdown
    if (hookTotal > 0) {
      var hkTitle = document.createElement('h3');
      hkTitle.textContent = 'Pipeline Hooks';
      details.appendChild(hkTitle);

      var hkList = document.createElement('div');
      hkList.className = 'admin-inspect-list';

      function addHookRow(parent, label, count) {
        var row = document.createElement('div');
        row.className = 'admin-inspect-item';
        var l = document.createElement('span');
        l.className = 'admin-inspect-event';
        l.textContent = label;
        row.appendChild(l);
        var c = document.createElement('span');
        c.className = 'admin-inspect-count';
        c.textContent = String(count);
        row.appendChild(c);
        var s = document.createElement('span');
        row.appendChild(s);
        parent.appendChild(row);
      }

      addHookRow(hkList, 'beforePipeline', data.hooks.beforePipeline || 0);
      addHookRow(hkList, 'afterPipeline', data.hooks.afterPipeline || 0);

      for (var bsi = 0; bsi < bsKeys.length; bsi++) {
        addHookRow(hkList, 'beforeStage:' + bsKeys[bsi], data.hooks.beforeStage[bsKeys[bsi]]);
      }
      for (var asi = 0; asi < asKeys.length; asi++) {
        addHookRow(hkList, 'afterStage:' + asKeys[asi], data.hooks.afterStage[asKeys[asi]]);
      }

      details.appendChild(hkList);
    }

    // Plugins list
    if (data.plugins && data.plugins.list && data.plugins.list.length > 0) {
      var plTitle = document.createElement('h3');
      plTitle.textContent = '\u0627\u0644\u0625\u0636\u0627\u0641\u0627\u062a \u0627\u0644\u0645\u062d\u0645\u0644\u0629';
      details.appendChild(plTitle);

      var plList = document.createElement('div');
      plList.className = 'admin-inspect-list';
      for (var pi = 0; pi < data.plugins.list.length; pi++) {
        var p = data.plugins.list[pi];
        var plItem = document.createElement('div');
        plItem.className = 'admin-inspect-item';

        var plName = document.createElement('span');
        plName.className = 'admin-inspect-plugin-name';
        plName.textContent = p.name + ' v' + p.version;
        plItem.appendChild(plName);

        var plStatus = document.createElement('span');
        plStatus.className = 'admin-inspect-plugin-status';
        plStatus.textContent = p.enabled ? '\u0645\u0641\u0639\u0651\u0644' : '\u0645\u0639\u0637\u0651\u0644';
        plItem.appendChild(plStatus);

        var plDesc = document.createElement('span');
        plDesc.className = 'admin-inspect-cmd-desc';
        plDesc.textContent = p.description || '';
        plItem.appendChild(plDesc);

        plList.appendChild(plItem);
      }
      details.appendChild(plList);
    }

    // Config & Bootstrap summary
    var sysTitle = document.createElement('h3');
    sysTitle.textContent = '\u062d\u0627\u0644\u0629 \u0627\u0644\u0646\u0638\u0627\u0645';
    details.appendChild(sysTitle);

    var sysList = document.createElement('div');
    sysList.className = 'admin-inspect-list';

    function addSysRow(parent, label, value) {
      var row = document.createElement('div');
      row.className = 'admin-inspect-item';
      var l = document.createElement('span');
      l.className = 'admin-inspect-event';
      l.textContent = label;
      row.appendChild(l);
      var v = document.createElement('span');
      v.className = 'admin-inspect-count';
      v.textContent = String(value);
      row.appendChild(v);
      var s = document.createElement('span');
      row.appendChild(s);
      parent.appendChild(row);
    }

    addSysRow(sysList, 'Config Sections', data.config ? data.config.sections || 0 : 0);
    addSysRow(sysList, 'Log Level', data.config ? data.config.logLevel || 'info' : 'info');
    addSysRow(sysList, 'Sessions Enabled', data.config && data.config.sessionsEnabled ? '\u0646\u0639\u0645' : '\u0644\u0627');
    addSysRow(sysList, 'Plugins Enabled', data.config && data.config.pluginsEnabled ? '\u0646\u0639\u0645' : '\u0644\u0627');
    addSysRow(sysList, 'Metrics Enabled', data.config && data.config.metricsEnabled ? '\u0646\u0639\u0645' : '\u0644\u0627');
    addSysRow(sysList, 'Bootstrap', (data.bootstrap && data.bootstrap.ready ? '\u062c\u0627\u0647\u0632' : '\u063a\u064a\u0631 \u062c\u0627\u0647\u0632') + ' (' + (data.bootstrap ? data.bootstrap.durationMs || 0 : 0) + 'ms)');
    addSysRow(sysList, 'Logger Listeners', data.logger ? data.logger.listenerCount || 0 : 0);

    details.appendChild(sysList);
  }

  function showInspectSkeleton() {
    var grid = DOM.inspectGrid;
    if (!grid) return;
    while (grid.firstChild) grid.removeChild(grid.firstChild);
    for (var i = 0; i < 6; i++) {
      var s = document.createElement('div');
      s.className = 'admin-skeleton';
      s.style.height = '90px';
      s.style.borderRadius = '10px';
      grid.appendChild(s);
    }
    if (DOM.inspectDetails) {
      while (DOM.inspectDetails.firstChild) DOM.inspectDetails.removeChild(DOM.inspectDetails.firstChild);
    }
  }

  // ══════════════════════════════════════════════════════════
  //  COMMAND METRICS (Phase 20)
  // ══════════════════════════════════════════════════════════
  function renderCommandMetrics(graphData, metricsData) {
    var graphEl  = DOM.commandsGraph;
    var metricsEl = DOM.commandsMetrics;
    var emptyEl  = DOM.commandsEmpty;
    if (!graphEl || !metricsEl) return;

    while (graphEl.firstChild) graphEl.removeChild(graphEl.firstChild);
    while (metricsEl.firstChild) metricsEl.removeChild(metricsEl.firstChild);

    if (!graphData) {
      if (emptyEl) emptyEl.classList.remove('hidden');
      return;
    }

    if (emptyEl) emptyEl.classList.add('hidden');

    // ── Category cards ──────────────────────────────────────
    var categories = [
      { label: 'أوامر مدمجة',  count: graphData.builtins ? graphData.builtins.length : 0 },
      { label: 'أوامر مخصصة',  count: graphData.custom ? graphData.custom.length : 0 },
      { label: 'أوامر إضافات',  count: graphData.plugins ? graphData.plugins.length : 0 },
      { label: 'الإجمالي',      count: graphData.total || 0 },
    ];

    for (var ci = 0; ci < categories.length; ci++) {
      var catCard = document.createElement('div');
      catCard.className = 'admin-cmd-category';

      var catCount = document.createElement('div');
      catCount.className = 'admin-cmd-category-count';
      catCount.textContent = String(categories[ci].count);
      catCard.appendChild(catCount);

      var catLabel = document.createElement('div');
      catLabel.className = 'admin-cmd-category-label';
      catLabel.textContent = categories[ci].label;
      catCard.appendChild(catLabel);

      graphEl.appendChild(catCard);
    }

    // ── Per-command execution breakdown ──────────────────────
    // Extract command metrics from metricsData
    var counters   = (metricsData && metricsData.metrics && metricsData.metrics.counters) || {};
    var histograms = (metricsData && metricsData.metrics && metricsData.metrics.histograms) || {};

    var cmdCounters = counters['command_execution_total'] || {};
    var cmdHist     = histograms['command_duration_ms'] || {};

    // Build command execution list
    var cmdRows = [];
    var maxCount = 0;

    // Combine all known commands from graph + any metrics keys
    var allCmds = {};
    var lists = [graphData.builtins || [], graphData.custom || [], graphData.plugins || []];
    for (var li = 0; li < lists.length; li++) {
      for (var lj = 0; lj < lists[li].length; lj++) {
        allCmds[lists[li][lj].name] = true;
      }
    }

    // Parse counters — keys are like '[["command","/ملخص"]]'
    for (var ck in cmdCounters) {
      var cmdName = ck;
      try {
        var parsed = JSON.parse(ck);
        if (Array.isArray(parsed) && parsed.length > 0 && Array.isArray(parsed[0])) {
          cmdName = parsed[0][1] || ck;
        }
      } catch (_) { /* keep raw key */ }
      allCmds[cmdName] = true;
    }

    for (var name in allCmds) {
      // Find counter for this command
      var countKey = '[["command","' + name + '"]]';
      var count = cmdCounters[countKey] || 0;

      // Find histogram for this command
      var histData = cmdHist[countKey] || {};
      var p50 = histData.p50 || 0;
      var p95 = histData.p95 || 0;
      var avgLatency = p50; // Use p50 as representative avg

      cmdRows.push({ name: name, count: count, latency: avgLatency, p95: p95 });
      if (count > maxCount) maxCount = count;
    }

    // Sort by count descending
    cmdRows.sort(function (a, b) { return b.count - a.count; });

    if (cmdRows.length === 0) return;

    if (maxCount === 0) maxCount = 1;

    for (var ri = 0; ri < cmdRows.length; ri++) {
      var row = cmdRows[ri];
      var rowEl = document.createElement('div');
      rowEl.className = 'admin-cmd-row';

      var nameEl = document.createElement('div');
      nameEl.className = 'admin-cmd-name';
      nameEl.textContent = row.name;
      rowEl.appendChild(nameEl);

      var barWrap = document.createElement('div');
      barWrap.className = 'admin-cmd-bar';
      var barFill = document.createElement('div');
      barFill.className = 'admin-cmd-bar-fill';
      var pct = Math.max((row.count / maxCount) * 100, 2);
      barFill.style.width = pct + '%';
      barWrap.appendChild(barFill);
      rowEl.appendChild(barWrap);

      var countEl = document.createElement('div');
      countEl.className = 'admin-cmd-count';
      countEl.textContent = String(row.count) + ' مرة';
      rowEl.appendChild(countEl);

      var latEl = document.createElement('div');
      latEl.className = 'admin-cmd-latency';
      latEl.textContent = row.latency + 'ms';
      latEl.title = 'P50: ' + row.latency + 'ms · P95: ' + row.p95 + 'ms';
      rowEl.appendChild(latEl);

      metricsEl.appendChild(rowEl);
    }
  }

  function showCommandsSkeleton() {
    var graphEl = DOM.commandsGraph;
    if (!graphEl) return;
    while (graphEl.firstChild) graphEl.removeChild(graphEl.firstChild);
    for (var i = 0; i < 4; i++) {
      var s = document.createElement('div');
      s.className = 'admin-skeleton';
      s.style.height = '70px';
      s.style.borderRadius = '10px';
      graphEl.appendChild(s);
    }
    if (DOM.commandsMetrics) {
      while (DOM.commandsMetrics.firstChild) DOM.commandsMetrics.removeChild(DOM.commandsMetrics.firstChild);
    }
    if (DOM.commandsEmpty) DOM.commandsEmpty.classList.add('hidden');
  }

  // ══════════════════════════════════════════════════════════
  //  PIPELINE INSIGHTS (Phase 22)
  // ══════════════════════════════════════════════════════════
  function showInsightsSkeleton() {
    if (DOM.insightsSummary) {
      while (DOM.insightsSummary.firstChild) DOM.insightsSummary.removeChild(DOM.insightsSummary.firstChild);
      for (var i = 0; i < 6; i++) {
        var s = document.createElement('div');
        s.className = 'admin-skeleton';
        s.style.height = '90px';
        s.style.borderRadius = '10px';
        DOM.insightsSummary.appendChild(s);
      }
    }
    if (DOM.insightsDistributions) {
      while (DOM.insightsDistributions.firstChild) DOM.insightsDistributions.removeChild(DOM.insightsDistributions.firstChild);
    }
    if (DOM.insightsRecommendations) {
      while (DOM.insightsRecommendations.firstChild) DOM.insightsRecommendations.removeChild(DOM.insightsRecommendations.firstChild);
    }
    if (DOM.insightsEmpty) DOM.insightsEmpty.style.display = 'none';
  }

  function renderInsights(data) {
    var digest = data ? data.digest : null;
    var recs   = (data && data.recommendations) ? data.recommendations : [];

    // ── Disabled or no data ────────────────────────────────────
    if (!digest) {
      if (DOM.insightsSummary) { while (DOM.insightsSummary.firstChild) DOM.insightsSummary.removeChild(DOM.insightsSummary.firstChild); }
      if (DOM.insightsDistributions) { while (DOM.insightsDistributions.firstChild) DOM.insightsDistributions.removeChild(DOM.insightsDistributions.firstChild); }
      if (DOM.insightsRecommendations) { while (DOM.insightsRecommendations.firstChild) DOM.insightsRecommendations.removeChild(DOM.insightsRecommendations.firstChild); }
      if (DOM.insightsEmpty) DOM.insightsEmpty.style.display = '';
      return;
    }
    if (DOM.insightsEmpty) DOM.insightsEmpty.style.display = 'none';

    // ── Summary Cards ──────────────────────────────────────────
    if (DOM.insightsSummary) {
      while (DOM.insightsSummary.firstChild) DOM.insightsSummary.removeChild(DOM.insightsSummary.firstChild);

      var summaryCards = [
        { label: '\u0625\u062c\u0645\u0627\u0644\u064a \u0627\u0644\u0637\u0644\u0628\u0627\u062a', value: String(digest.totalRequests || 0), icon: '\uD83D\uDCC8' },
        { label: '\u0645\u0639\u062f\u0644 \u0627\u0644\u0643\u0627\u0634', value: ((digest.cacheHitRate || 0) * 100).toFixed(1) + '%', icon: '\u26A1' },
        { label: '\u0645\u0639\u062f\u0644 \u0627\u0644\u0623\u062e\u0637\u0627\u0621', value: ((digest.errorRate || 0) * 100).toFixed(1) + '%', icon: digest.errorRate > 0.05 ? '\uD83D\uDD34' : '\uD83D\uDFE2' },
        { label: 'P95 \u0627\u0633\u062a\u062c\u0627\u0628\u0629', value: Math.round((digest.requestDuration && digest.requestDuration.p95) || 0) + 'ms', icon: '\u23F1\uFE0F' },
        { label: '\u0623\u0643\u062b\u0631 \u0646\u0648\u0639 \u0633\u0624\u0627\u0644', value: digest.topQueryType || '\u2014', icon: '\uD83D\uDD0D' },
        { label: '\u0623\u0643\u062b\u0631 intent', value: digest.topIntent || '\u2014', icon: '\uD83C\uDFAF' },
      ];

      for (var ci = 0; ci < summaryCards.length; ci++) {
        var card = document.createElement('div');
        card.className = 'admin-insight-card';

        var iconSpan = document.createElement('span');
        iconSpan.className = 'admin-insight-icon';
        iconSpan.textContent = summaryCards[ci].icon;
        card.appendChild(iconSpan);

        var valSpan = document.createElement('span');
        valSpan.className = 'admin-insight-value';
        valSpan.textContent = summaryCards[ci].value;
        card.appendChild(valSpan);

        var lblSpan = document.createElement('span');
        lblSpan.className = 'admin-insight-label';
        lblSpan.textContent = summaryCards[ci].label;
        card.appendChild(lblSpan);

        DOM.insightsSummary.appendChild(card);
      }
    }

    // ── Distribution Bars ──────────────────────────────────────
    if (DOM.insightsDistributions) {
      while (DOM.insightsDistributions.firstChild) DOM.insightsDistributions.removeChild(DOM.insightsDistributions.firstChild);

      // Query Type Distribution
      var qtd = digest.queryTypeDistribution || {};
      var qtKeys = Object.keys(qtd);
      var qtTotal = 0;
      for (var qi = 0; qi < qtKeys.length; qi++) qtTotal += qtd[qtKeys[qi]];

      if (qtTotal > 0) {
        var qtTitle = document.createElement('h3');
        qtTitle.textContent = '\u062a\u0648\u0632\u064a\u0639 \u0623\u0646\u0648\u0627\u0639 \u0627\u0644\u0623\u0633\u0626\u0644\u0629';
        DOM.insightsDistributions.appendChild(qtTitle);

        var qtBars = document.createElement('div');
        qtBars.className = 'admin-dist-bars';
        // Sort by count descending
        var qtSorted = qtKeys.slice().sort(function (a, b) { return qtd[b] - qtd[a]; });
        for (var qj = 0; qj < qtSorted.length; qj++) {
          var qType = qtSorted[qj];
          var qCount = qtd[qType];
          var qPct = ((qCount / qtTotal) * 100).toFixed(1);

          var qRow = document.createElement('div');
          qRow.className = 'admin-dist-row';

          var qLabel = document.createElement('span');
          qLabel.className = 'admin-dist-label';
          qLabel.textContent = qType;
          qRow.appendChild(qLabel);

          var qBarWrap = document.createElement('div');
          qBarWrap.className = 'admin-dist-bar';
          var qBarFill = document.createElement('div');
          qBarFill.className = 'admin-dist-fill';
          qBarFill.style.width = qPct + '%';
          qBarWrap.appendChild(qBarFill);
          qRow.appendChild(qBarWrap);

          var qPctEl = document.createElement('span');
          qPctEl.className = 'admin-dist-pct';
          qPctEl.textContent = qPct + '%';
          qRow.appendChild(qPctEl);

          qtBars.appendChild(qRow);
        }
        DOM.insightsDistributions.appendChild(qtBars);
      }

      // Intent Distribution
      var id = digest.intentDistribution || {};
      var idKeys = Object.keys(id);
      var idTotal = 0;
      for (var ii = 0; ii < idKeys.length; ii++) idTotal += id[idKeys[ii]];

      if (idTotal > 0) {
        var idTitle = document.createElement('h3');
        idTitle.textContent = '\u062a\u0648\u0632\u064a\u0639 \u0627\u0644\u0640 Intent';
        DOM.insightsDistributions.appendChild(idTitle);

        var idBars = document.createElement('div');
        idBars.className = 'admin-dist-bars';
        var idSorted = idKeys.slice().sort(function (a, b) { return id[b] - id[a]; });
        for (var ij = 0; ij < idSorted.length; ij++) {
          var iIntent = idSorted[ij];
          var iCount = id[iIntent];
          var iPct = ((iCount / idTotal) * 100).toFixed(1);

          var iRow = document.createElement('div');
          iRow.className = 'admin-dist-row';

          var iLabel = document.createElement('span');
          iLabel.className = 'admin-dist-label';
          iLabel.textContent = iIntent;
          iRow.appendChild(iLabel);

          var iBarWrap = document.createElement('div');
          iBarWrap.className = 'admin-dist-bar';
          var iBarFill = document.createElement('div');
          iBarFill.className = 'admin-dist-fill admin-dist-fill-intent';
          iBarFill.style.width = iPct + '%';
          iBarWrap.appendChild(iBarFill);
          iRow.appendChild(iBarWrap);

          var iPctEl = document.createElement('span');
          iPctEl.className = 'admin-dist-pct';
          iPctEl.textContent = iPct + '%';
          iRow.appendChild(iPctEl);

          idBars.appendChild(iRow);
        }
        DOM.insightsDistributions.appendChild(idBars);
      }
    }

    // ── Recommendations ────────────────────────────────────────
    if (DOM.insightsRecommendations) {
      while (DOM.insightsRecommendations.firstChild) DOM.insightsRecommendations.removeChild(DOM.insightsRecommendations.firstChild);

      if (recs.length === 0) {
        var okMsg = document.createElement('p');
        okMsg.className = 'admin-insights-ok';
        okMsg.textContent = '\u2705 \u0644\u0627 \u062a\u0648\u062c\u062f \u062a\u0648\u0635\u064a\u0627\u062a \u2014 \u0627\u0644\u0623\u062f\u0627\u0621 \u062c\u064a\u062f';
        DOM.insightsRecommendations.appendChild(okMsg);
      } else {
        var recTitle = document.createElement('h3');
        recTitle.textContent = '\u0627\u0644\u062a\u0648\u0635\u064a\u0627\u062a';
        DOM.insightsRecommendations.appendChild(recTitle);

        for (var ri = 0; ri < recs.length; ri++) {
          var r = recs[ri];
          var severityClass = r.severity === 'critical' ? 'admin-rec-critical'
                            : r.severity === 'warning'  ? 'admin-rec-warning'
                            : 'admin-rec-info';

          var recCard = document.createElement('div');
          recCard.className = 'admin-rec-card ' + severityClass;

          var recTitleEl = document.createElement('div');
          recTitleEl.className = 'admin-rec-title';
          recTitleEl.textContent = r.title || '';
          recCard.appendChild(recTitleEl);

          var recMsg = document.createElement('div');
          recMsg.className = 'admin-rec-message';
          recMsg.textContent = r.message || '';
          recCard.appendChild(recMsg);

          var recAction = document.createElement('div');
          recAction.className = 'admin-rec-action';
          var recStrong = document.createElement('strong');
          recStrong.textContent = '\u0627\u0644\u0625\u062c\u0631\u0627\u0621 \u0627\u0644\u0645\u0642\u062a\u0631\u062d: ';
          recAction.appendChild(recStrong);
          var recCode = document.createElement('code');
          recCode.textContent = r.suggestedAction || '';
          recAction.appendChild(recCode);
          recCard.appendChild(recAction);

          DOM.insightsRecommendations.appendChild(recCard);
        }
      }
    }
  }

  // ══════════════════════════════════════════════════════════
  //  FEEDBACK (Phase 33)
  // ══════════════════════════════════════════════════════════
  function renderFeedback(data) {
    var countsEl = DOM.feedbackCounts;
    var recentEl = DOM.feedbackRecent;
    var emptyEl  = DOM.feedbackEmpty;
    if (!countsEl || !recentEl) return;

    while (countsEl.firstChild) countsEl.removeChild(countsEl.firstChild);
    while (recentEl.firstChild) recentEl.removeChild(recentEl.firstChild);

    if (!data || !data.counts) {
      if (emptyEl) emptyEl.classList.remove('hidden');
      return;
    }

    var c = data.counts;
    var total = (c.totalPositive || 0) + (c.totalNegative || 0);

    if (total === 0) {
      if (emptyEl) emptyEl.classList.remove('hidden');
      return;
    }

    if (emptyEl) emptyEl.classList.add('hidden');

    // ── Counts cards ──────────────────────────────────────────
    var cards = [
      { label: 'إعجاب', value: c.totalPositive || 0, cls: 'admin-fb-positive' },
      { label: 'عدم إعجاب', value: c.totalNegative || 0, cls: 'admin-fb-negative' },
      { label: 'الإجمالي', value: total, cls: '' },
      { label: 'معدل الرضا', value: total > 0 ? Math.round((c.totalPositive / total) * 100) + '%' : '—', cls: '' },
    ];

    for (var i = 0; i < cards.length; i++) {
      var card = document.createElement('div');
      card.className = 'admin-fb-card ' + cards[i].cls;

      var valEl = document.createElement('div');
      valEl.className = 'admin-fb-card-value';
      valEl.textContent = String(cards[i].value);
      card.appendChild(valEl);

      var lblEl = document.createElement('div');
      lblEl.className = 'admin-fb-card-label';
      lblEl.textContent = cards[i].label;
      card.appendChild(lblEl);

      countsEl.appendChild(card);
    }

    // ── Recent entries ──────────────────────────────────────────
    var recent = data.recent || [];
    if (recent.length === 0) return;

    var title = document.createElement('div');
    title.className = 'admin-fb-recent-title';
    title.textContent = 'آخر التقييمات';
    recentEl.appendChild(title);

    var max = Math.min(recent.length, 20);
    for (var j = recent.length - 1; j >= Math.max(0, recent.length - max); j--) {
      var entry = recent[j];
      var row = document.createElement('div');
      row.className = 'admin-fb-entry ' + (entry.rating === 'positive' ? 'admin-fb-entry-pos' : 'admin-fb-entry-neg');

      var icon = document.createElement('span');
      icon.className = 'admin-fb-entry-icon';
      icon.textContent = entry.rating === 'positive' ? '\uD83D\uDC4D' : '\uD83D\uDC4E';
      row.appendChild(icon);

      var time = document.createElement('span');
      time.className = 'admin-fb-entry-time';
      try {
        time.textContent = new Date(entry.timestamp).toLocaleString('ar-EG', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      } catch (_) {
        time.textContent = entry.timestamp ? entry.timestamp.slice(0, 16) : '';
      }
      row.appendChild(time);

      var corrEl = document.createElement('span');
      corrEl.className = 'admin-fb-entry-corr';
      corrEl.textContent = entry.correlationId ? entry.correlationId.slice(0, 8) : '—';
      row.appendChild(corrEl);

      if (entry.comment) {
        var commentEl = document.createElement('span');
        commentEl.className = 'admin-fb-entry-comment';
        commentEl.textContent = entry.comment;
        row.appendChild(commentEl);
      }

      recentEl.appendChild(row);
    }
  }

  function showFeedbackSkeleton() {
    var countsEl = DOM.feedbackCounts;
    if (!countsEl) return;
    while (countsEl.firstChild) countsEl.removeChild(countsEl.firstChild);
    for (var i = 0; i < 4; i++) {
      var s = document.createElement('div');
      s.className = 'admin-skeleton';
      s.style.height = '80px';
      s.style.borderRadius = '10px';
      countsEl.appendChild(s);
    }
    if (DOM.feedbackRecent) {
      while (DOM.feedbackRecent.firstChild) DOM.feedbackRecent.removeChild(DOM.feedbackRecent.firstChild);
    }
    if (DOM.feedbackEmpty) DOM.feedbackEmpty.classList.add('hidden');
  }

  // ══════════════════════════════════════════════════════════
  //  CORRELATION EXPLORER (Phase 34)
  // ══════════════════════════════════════════════════════════
  var _correlationData = null;
  var _correlationFilter = 'all';

  function renderCorrelationExplorer(data, filter) {
    var cardsEl = DOM.correlationCards;
    var emptyEl = DOM.correlationEmpty;
    if (!cardsEl) return;

    while (cardsEl.firstChild) cardsEl.removeChild(cardsEl.firstChild);

    if (!data || !data.recent || data.recent.length === 0) {
      if (emptyEl) emptyEl.classList.remove('hidden');
      return;
    }

    // Filter by rating
    var items = data.recent;
    if (filter && filter !== 'all') {
      items = items.filter(function (e) { return e.rating === filter; });
    }

    if (items.length === 0) {
      if (emptyEl) emptyEl.classList.remove('hidden');
      return;
    }

    if (emptyEl) emptyEl.classList.add('hidden');

    // Render most recent first
    for (var i = items.length - 1; i >= 0; i--) {
      var entry = items[i];
      var card = document.createElement('div');
      card.className = 'admin-correlation-card ' + (entry.rating === 'positive' ? 'positive' : 'negative');

      // Rating icon
      var ratingIcon = document.createElement('div');
      ratingIcon.className = 'correlation-rating-icon';
      ratingIcon.textContent = entry.rating === 'positive' ? '\uD83D\uDC4D' : '\uD83D\uDC4E';
      card.appendChild(ratingIcon);

      // Question
      var question = document.createElement('div');
      question.className = 'correlation-question';
      question.textContent = entry.question || '\u2014 \u0644\u0627 \u064A\u0648\u062C\u062F \u0633\u0624\u0627\u0644 \u0645\u0631\u062A\u0628\u0637';
      card.appendChild(question);

      // Response snippet
      if (entry.responseSnippet) {
        var snippet = document.createElement('div');
        snippet.className = 'correlation-snippet';
        snippet.textContent = entry.responseSnippet.slice(0, 150) + (entry.responseSnippet.length > 150 ? '...' : '');
        card.appendChild(snippet);
      }

      // Comment
      if (entry.comment) {
        var comment = document.createElement('div');
        comment.className = 'correlation-comment';
        comment.textContent = '\uD83D\uDCAC ' + entry.comment;
        card.appendChild(comment);
      }

      // Meta row
      var meta = document.createElement('div');
      meta.className = 'correlation-meta';

      if (entry.queryType) {
        var badge = document.createElement('span');
        badge.className = 'correlation-badge';
        badge.textContent = entry.queryType;
        meta.appendChild(badge);
      }

      if (entry.avgScore !== null && entry.avgScore !== undefined) {
        var scoreEl = document.createElement('span');
        scoreEl.className = 'correlation-score';
        scoreEl.textContent = '\u2B50 ' + Math.round(entry.avgScore * 100) + '%';
        meta.appendChild(scoreEl);
      }

      if (entry.correlationId) {
        var corrEl = document.createElement('span');
        corrEl.className = 'correlation-corr-id';
        corrEl.textContent = entry.correlationId.slice(0, 8);
        meta.appendChild(corrEl);
      }

      var timeEl = document.createElement('span');
      timeEl.className = 'correlation-time';
      try {
        timeEl.textContent = new Date(entry.timestamp).toLocaleString('ar-EG', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      } catch (_) {
        timeEl.textContent = entry.timestamp ? entry.timestamp.slice(0, 16) : '';
      }
      meta.appendChild(timeEl);

      card.appendChild(meta);
      cardsEl.appendChild(card);
    }
  }

  function showCorrelationSkeleton() {
    var cardsEl = DOM.correlationCards;
    if (!cardsEl) return;
    while (cardsEl.firstChild) cardsEl.removeChild(cardsEl.firstChild);
    for (var i = 0; i < 3; i++) {
      var s = document.createElement('div');
      s.className = 'admin-skeleton';
      s.style.height = '100px';
      s.style.borderRadius = '10px';
      s.style.marginBottom = '10px';
      cardsEl.appendChild(s);
    }
    if (DOM.correlationEmpty) DOM.correlationEmpty.classList.add('hidden');
  }

  async function loadCorrelationExplorer(filter) {
    if (filter !== undefined) _correlationFilter = filter;
    showCorrelationSkeleton();
    try {
      var data = await adminFetch('/api/admin/feedback', { limit: 50 });
      _correlationData = data;
      renderCorrelationExplorer(data, _correlationFilter);
    } catch (err) {
      if (DOM.correlationCards) {
        while (DOM.correlationCards.firstChild) DOM.correlationCards.removeChild(DOM.correlationCards.firstChild);
      }
      showSectionError(DOM.correlationCards, err.message, function () { loadCorrelationExplorer(_correlationFilter); });
    }
  }

  // ══════════════════════════════════════════════════════════
  //  AUDIT TRAIL (Phase 34)
  // ══════════════════════════════════════════════════════════
  function renderAuditTrail(data) {
    var timeline = DOM.auditTimeline;
    var emptyEl  = DOM.auditEmpty;
    if (!timeline) return;

    while (timeline.firstChild) timeline.removeChild(timeline.firstChild);

    if (!data || !data.entries || data.entries.length === 0) {
      if (emptyEl) {
        emptyEl.textContent = '\u0644\u0627 \u062A\u0648\u062C\u062F \u0623\u062D\u062F\u0627\u062B \u0644\u0647\u0630\u0647 \u0627\u0644\u062C\u0644\u0633\u0629';
        emptyEl.classList.remove('hidden');
      }
      return;
    }

    if (emptyEl) emptyEl.classList.add('hidden');

    var TYPE_ICONS = {
      query:     '\uD83D\uDD0D',
      cache_hit: '\uD83D\uDCCB',
      feedback:  '',
      evicted:   '\uD83D\uDEAA',
    };

    for (var i = 0; i < data.entries.length; i++) {
      var entry = data.entries[i];
      var row = document.createElement('div');
      row.className = 'audit-entry audit-type-' + entry.type;

      // Icon
      var iconEl = document.createElement('div');
      iconEl.className = 'audit-type-icon';
      if (entry.type === 'feedback') {
        iconEl.textContent = entry.rating === 'positive' ? '\uD83D\uDC4D' : '\uD83D\uDC4E';
      } else {
        iconEl.textContent = TYPE_ICONS[entry.type] || '\u2022';
      }
      row.appendChild(iconEl);

      // Details container
      var details = document.createElement('div');
      details.className = 'audit-entry-details';

      // Type label + timestamp
      var headerLine = document.createElement('div');
      headerLine.className = 'audit-entry-header';

      var typeLabel = document.createElement('span');
      typeLabel.className = 'audit-entry-type';
      var typeNames = { query: '\u0627\u0633\u062A\u0639\u0644\u0627\u0645', cache_hit: '\u0643\u0627\u0634', feedback: '\u062A\u0642\u064A\u064A\u0645', evicted: '\u0625\u0646\u0647\u0627\u0621 \u062C\u0644\u0633\u0629' };
      typeLabel.textContent = typeNames[entry.type] || entry.type;
      headerLine.appendChild(typeLabel);

      var timeEl = document.createElement('span');
      timeEl.className = 'audit-entry-time';
      try {
        timeEl.textContent = new Date(entry.timestamp).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      } catch (_) {
        timeEl.textContent = '';
      }
      headerLine.appendChild(timeEl);

      details.appendChild(headerLine);

      // Type-specific content
      if (entry.type === 'query') {
        var msgEl = document.createElement('div');
        msgEl.className = 'audit-entry-message';
        msgEl.textContent = entry.message || '';
        details.appendChild(msgEl);

        var metaRow = document.createElement('div');
        metaRow.className = 'audit-entry-meta';
        if (entry.queryType) {
          var qtEl = document.createElement('span');
          qtEl.className = 'audit-meta-badge';
          qtEl.textContent = entry.queryType;
          metaRow.appendChild(qtEl);
        }
        if (entry.avgScore !== undefined) {
          var scEl = document.createElement('span');
          scEl.textContent = '\u2B50 ' + Math.round((entry.avgScore || 0) * 100) + '%';
          metaRow.appendChild(scEl);
        }
        if (entry.correlationId) {
          var cidEl = document.createElement('span');
          cidEl.className = 'audit-meta-corr';
          cidEl.textContent = entry.correlationId.slice(0, 8);
          metaRow.appendChild(cidEl);
        }
        if (entry.totalMs) {
          var msEl = document.createElement('span');
          msEl.textContent = entry.totalMs + 'ms';
          metaRow.appendChild(msEl);
        }
        details.appendChild(metaRow);
      }

      if (entry.type === 'cache_hit') {
        var chMsg = document.createElement('div');
        chMsg.className = 'audit-entry-message';
        chMsg.textContent = entry.message || '';
        details.appendChild(chMsg);
      }

      if (entry.type === 'feedback') {
        var fbRow = document.createElement('div');
        fbRow.className = 'audit-entry-meta';
        var fbRating = document.createElement('span');
        fbRating.textContent = entry.rating === 'positive' ? '\u0625\u0639\u062C\u0627\u0628' : '\u0639\u062F\u0645 \u0625\u0639\u062C\u0627\u0628';
        fbRow.appendChild(fbRating);
        if (entry.comment) {
          var fbComment = document.createElement('span');
          fbComment.className = 'audit-entry-comment';
          fbComment.textContent = '\uD83D\uDCAC ' + entry.comment;
          fbRow.appendChild(fbComment);
        }
        details.appendChild(fbRow);
      }

      if (entry.type === 'evicted') {
        var evMsg = document.createElement('div');
        evMsg.className = 'audit-entry-message audit-evicted-msg';
        evMsg.textContent = '\u062A\u0645 \u0625\u0646\u0647\u0627\u0621 \u0627\u0644\u062C\u0644\u0633\u0629';
        details.appendChild(evMsg);
      }

      row.appendChild(details);
      timeline.appendChild(row);
    }
  }

  function showAuditSkeleton() {
    var timeline = DOM.auditTimeline;
    if (!timeline) return;
    while (timeline.firstChild) timeline.removeChild(timeline.firstChild);
    for (var i = 0; i < 4; i++) {
      var s = document.createElement('div');
      s.className = 'admin-skeleton';
      s.style.height = '60px';
      s.style.borderRadius = '10px';
      s.style.marginBottom = '8px';
      timeline.appendChild(s);
    }
    if (DOM.auditEmpty) DOM.auditEmpty.classList.add('hidden');
  }

  async function loadAuditTrail(sessionId) {
    if (!sessionId) {
      if (DOM.auditTimeline) {
        while (DOM.auditTimeline.firstChild) DOM.auditTimeline.removeChild(DOM.auditTimeline.firstChild);
      }
      if (DOM.auditEmpty) {
        DOM.auditEmpty.textContent = '\u0623\u062F\u062E\u0644 \u0645\u0639\u0631\u0651\u0641 \u0627\u0644\u062C\u0644\u0633\u0629 \u0644\u0639\u0631\u0636 \u0645\u0633\u0627\u0631 \u0627\u0644\u062A\u062F\u0642\u064A\u0642';
        DOM.auditEmpty.classList.remove('hidden');
      }
      return;
    }
    showAuditSkeleton();
    try {
      var data = await adminFetch('/api/admin/audit/' + encodeURIComponent(sessionId), { limit: 100 });
      renderAuditTrail(data);
    } catch (err) {
      if (DOM.auditTimeline) {
        while (DOM.auditTimeline.firstChild) DOM.auditTimeline.removeChild(DOM.auditTimeline.firstChild);
      }
      showSectionError(DOM.auditTimeline, err.message, function () { loadAuditTrail(sessionId); });
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
  //  LIBRARY OVERVIEW (Phase 36)
  // ══════════════════════════════════════════════════════════
  function renderTopicBars(topics) {
    if (!topics || typeof topics !== 'object') return '';

    var keys = Object.keys(topics);
    if (keys.length === 0) return '';

    // Sort by count descending
    keys.sort(function (a, b) { return topics[b] - topics[a]; });

    var maxCount = topics[keys[0]] || 1;
    var html = '<h3 style="font-size:13px;color:var(--text-muted);margin:16px 0 8px;">\u062A\u0648\u0632\u064A\u0639 \u0627\u0644\u0645\u0648\u0627\u0636\u064A\u0639</h3>';
    html += '<div class="library-topic-bars">';

    for (var i = 0; i < keys.length; i++) {
      var pct = Math.max((topics[keys[i]] / maxCount) * 100, 2);
      html += '<div class="library-topic-row">';
      html += '<span class="library-topic-label">' + keys[i] + '</span>';
      html += '<div class="library-topic-bar"><div class="library-topic-bar-fill" style="width:' + pct + '%"></div></div>';
      html += '<span class="library-topic-count">' + topics[keys[i]] + '</span>';
      html += '</div>';
    }

    html += '</div>';
    return html;
  }

  async function loadLibraryOverview() {
    var container = document.getElementById('admin-library-content');
    if (!container) return;

    container.innerHTML = '<p class="admin-empty-msg">\u062C\u0627\u0631\u064A \u0627\u0644\u062A\u062D\u0645\u064A\u0644...</p>';

    try {
      var data = await adminFetch('/api/admin/library');
      if (!data) {
        container.innerHTML = '<p class="admin-empty-msg">\u062E\u0637\u0623 \u0641\u064A \u062A\u062D\u0645\u064A\u0644 \u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0645\u0643\u062A\u0628\u0629</p>';
        return;
      }

      if (!data.enabled) {
        container.innerHTML = '<p class="admin-empty-msg">\u0641\u0647\u0631\u0633\u0629 \u0627\u0644\u0645\u0643\u062A\u0628\u0629 \u0645\u0639\u0637\u0651\u0644\u0629 \u2014 \u0641\u0639\u0651\u0644\u0647\u0627 \u0645\u0646 <code>LIBRARY_INDEX.enabled: true</code></p>';
        return;
      }

      var html = '';

      // Stats cards
      html += '<div class="library-stats">';
      html += '<div class="library-stat-card"><div class="library-stat-value">' + (data.fileCount || 0) + '</div><div class="library-stat-label">\u0645\u0644\u0641\u0627\u062A</div></div>';
      html += '<div class="library-stat-card"><div class="library-stat-value">' + (data.topicCount || 0) + '</div><div class="library-stat-label">\u0645\u0648\u0627\u0636\u064A\u0639</div></div>';
      html += '<div class="library-stat-card"><div class="library-stat-value">' + (data.totalPoints || 0) + '</div><div class="library-stat-label">\u0646\u0642\u0627\u0637 \u0628\u064A\u0627\u0646\u0627\u062A</div></div>';
      html += '<div class="library-stat-card"><div class="library-stat-value">' + (data.scannedPoints || 0) + '</div><div class="library-stat-label">\u0646\u0642\u0627\u0637 \u0645\u0641\u062D\u0648\u0635\u0629</div></div>';
      html += '</div>';

      // Topic distribution bars
      if (data.topics && Object.keys(data.topics).length > 0) {
        html += renderTopicBars(data.topics);
      }

      // File list
      if (data.files && data.files.length > 0) {
        html += '<h3 style="font-size:13px;color:var(--text-muted);margin:16px 0 8px;">\u0642\u0627\u0626\u0645\u0629 \u0627\u0644\u0645\u0644\u0641\u0627\u062A</h3>';
        html += '<div class="library-files"><ul>';
        for (var i = 0; i < data.files.length; i++) {
          html += '<li>' + data.files[i] + '</li>';
        }
        html += '</ul></div>';
      }

      // Last refresh
      if (data.lastRefresh) {
        try {
          var refreshDate = new Date(data.lastRefresh);
          html += '<p style="font-size:11px;color:var(--text-muted);margin-top:12px;">\u0622\u062E\u0631 \u062A\u062D\u062F\u064A\u062B: ' + refreshDate.toLocaleString('ar-EG') + '</p>';
        } catch (_) {}
      }

      container.innerHTML = html;

    } catch (err) {
      container.innerHTML = '<p class="admin-empty-msg">\u062E\u0637\u0623 \u0641\u064A \u062A\u062D\u0645\u064A\u0644 \u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0645\u0643\u062A\u0628\u0629: ' + err.message + '</p>';
    }
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
    showMetricsSkeleton();
    showLogSkeleton();
    showInspectSkeleton();
    showCommandsSkeleton();
    showInsightsSkeleton();
    showFeedbackSkeleton();
    showCorrelationSkeleton();

    // Parallel fetch
    var results = await Promise.allSettled([
      fetchStats(),
      fetchHealth(),
      fetchSessions(DEFAULTS.sessionsPageSize, 0),
      fetchMetrics(),
      fetchLog(),
      fetchInspect(),
      fetchCommandGraph(),
      fetchFeedback(),
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

    // Metrics (Phase 14)
    if (results[3].status === 'fulfilled' && results[3].value) {
      renderMetrics(results[3].value);
    } else {
      renderMetrics(null);
    }

    // Pipeline Insights (Phase 22) — uses same metricsData (has digest + recommendations)
    var insightsData = (results[3].status === 'fulfilled') ? results[3].value : null;
    renderInsights(insightsData);

    // Log (Phase 16)
    if (results[4].status === 'fulfilled' && results[4].value) {
      renderLog(results[4].value);
    } else {
      renderLog(null);
    }

    // Inspect (Phase 17)
    if (results[5].status === 'fulfilled' && results[5].value) {
      renderInspect(results[5].value);
    } else {
      renderInspect(null);
    }

    // Command metrics (Phase 20) — uses graphData [6] + metricsData [3]
    var commandGraphData = (results[6].status === 'fulfilled') ? results[6].value : null;
    var metricsDataForCmds = (results[3].status === 'fulfilled') ? results[3].value : null;
    renderCommandMetrics(commandGraphData, metricsDataForCmds);

    // Feedback (Phase 33)
    if (results[7].status === 'fulfilled' && results[7].value) {
      renderFeedback(results[7].value);
    } else {
      renderFeedback(null);
    }

    // Correlation Explorer (Phase 34) — uses same feedback endpoint (enriched)
    if (results[7].status === 'fulfilled' && results[7].value) {
      _correlationData = results[7].value;
      renderCorrelationExplorer(results[7].value, _correlationFilter);
    } else {
      renderCorrelationExplorer(null, _correlationFilter);
    }

    // Library Overview (Phase 36) — separate fetch (not in parallel — optional section)
    loadLibraryOverview();

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

    // Log filter (Phase 16)
    if (DOM.logFilter) {
      DOM.logFilter.addEventListener('change', function () {
        if (_logData) {
          renderLog(_logData);
        } else {
          fetchLog().then(function (data) { renderLog(data); });
        }
      });
    }

    // Correlation filter (Phase 34)
    if (DOM.correlationFilter) {
      DOM.correlationFilter.addEventListener('click', function (e) {
        var btn = e.target.closest('.admin-rating-btn');
        if (!btn) return;
        var filter = btn.getAttribute('data-filter') || 'all';
        // Update active state
        var allBtns = DOM.correlationFilter.querySelectorAll('.admin-rating-btn');
        for (var i = 0; i < allBtns.length; i++) { allBtns[i].classList.remove('active'); }
        btn.classList.add('active');
        _correlationFilter = filter;
        if (_correlationData) {
          renderCorrelationExplorer(_correlationData, filter);
        } else {
          loadCorrelationExplorer(filter);
        }
      });
    }

    // Audit trail (Phase 34)
    if (DOM.auditBtn) {
      DOM.auditBtn.addEventListener('click', function () {
        var sessionId = DOM.auditInput ? DOM.auditInput.value.trim() : '';
        loadAuditTrail(sessionId);
      });
    }
    if (DOM.auditInput) {
      DOM.auditInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          var sessionId = DOM.auditInput.value.trim();
          loadAuditTrail(sessionId);
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
