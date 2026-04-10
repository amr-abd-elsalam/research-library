/* =============================================================
   sidebar.js — SidebarModule (Phase 90)
   Conversation list sidebar — load, switch, delete, toggle
   ============================================================= */

'use strict';

const SidebarModule = (() => {

  /* ── DOM References ────────────────────────── */
  let _sidebar      = null;
  let _overlay      = null;
  let _toggle       = null;
  let _sessionsEl   = null;
  let _newChatBtn   = null;
  let _activeId     = null;
  let _isOpen       = false;
  let _eventSource  = null;
  let _reconnectTimer = null;
  let _searchInput    = null;
  let _loadedSessions = [];

  /* ── SSE Reconnect — Exponential Backoff (Phase 96) ──── */
  var _reconnectAttempts = 0;
  var _SSE_BASE_DELAY   = 1000;
  var _SSE_MAX_DELAY    = 30000;
  var _SSE_JITTER       = 0.3;

  function _calcReconnectDelay() {
    var exp = Math.min(_SSE_BASE_DELAY * Math.pow(2, _reconnectAttempts), _SSE_MAX_DELAY);
    var jitter = exp * _SSE_JITTER * (Math.random() * 2 - 1);
    return Math.max(_SSE_BASE_DELAY, Math.round(exp + jitter));
  }

  /* ── Load sessions from API ────────────────── */
  async function _loadSessions() {
    if (!_sessionsEl) return;

    try {
      var res = await fetch('/api/sessions', {
        headers: AuthModule.getAccessHeaders(),
      });
      if (!res.ok) {
        _renderEmpty();
        return;
      }
      var data = await res.json();
      var sessions = data.sessions || [];
      _loadedSessions = sessions;
      _renderSessionList(sessions);
    } catch (_err) {
      _renderEmpty();
    }
  }

  /* ── Render empty state ────────────────────── */
  function _renderEmpty() {
    if (!_sessionsEl) return;
    _sessionsEl.innerHTML = '';
    var empty = document.createElement('div');
    empty.className = 'sidebar-empty';
    empty.textContent = 'لا توجد محادثات سابقة';
    _sessionsEl.appendChild(empty);
  }

  /* ── Render session list ───────────────────── */
  function _renderSessionList(sessions) {
    if (!_sessionsEl) return;
    _sessionsEl.innerHTML = '';

    if (!sessions || sessions.length === 0) {
      _renderEmpty();
      _updateBadge(0);
      return;
    }

    _updateBadge(sessions.length);

    // Get current session ID for active highlight
    var currentSid = null;
    try { currentSid = sessionStorage.getItem('research_session_id'); } catch (_) {}

    for (var i = 0; i < sessions.length; i++) {
      (function(session) {
        var item = document.createElement('div');
        item.className = 'sidebar-item';
        if (session.session_id === currentSid) {
          item.classList.add('active');
          _activeId = session.session_id;
        }
        item.setAttribute('data-session-id', session.session_id);
        item.setAttribute('role', 'button');
        item.setAttribute('tabindex', '0');

        // Pinned visual class
        if (session.pinned) {
          item.classList.add('pinned');
        }

        // Title — custom_title or first message or fallback
        var title = document.createElement('div');
        title.className = 'sidebar-item-title';
        title.textContent = session.custom_title || session.first_message || 'محادثة بتاريخ ' + _formatDate(session.created_at);
        item.appendChild(title);

        // Double-click to edit title
        title.addEventListener('dblclick', function(e) {
          e.stopPropagation();
          title.setAttribute('contenteditable', 'true');
          title.focus();
          var range = document.createRange();
          range.selectNodeContents(title);
          var sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
        });
        title.addEventListener('blur', function() {
          title.removeAttribute('contenteditable');
          var newTitle = title.textContent.trim();
          var originalTitle = session.custom_title || session.first_message || '';
          if (newTitle && newTitle !== originalTitle) {
            _handleTitleEdit(session.session_id, newTitle);
          }
        });
        title.addEventListener('keydown', function(e) {
          if (e.key === 'Enter') {
            e.preventDefault();
            title.blur();
          }
          if (e.key === 'Escape') {
            title.textContent = session.custom_title || session.first_message || '';
            title.removeAttribute('contenteditable');
          }
        });

        // Meta — date + message count
        var meta = document.createElement('div');
        meta.className = 'sidebar-item-meta';
        meta.textContent = _relativeTime(session.last_active) + ' · ' + (session.message_count || 0) + ' رسالة';
        item.appendChild(meta);

        // Delete button
        var del = document.createElement('button');
        del.className = 'sidebar-item-delete';
        del.type = 'button';
        del.textContent = '✕';
        del.title = 'حذف المحادثة';
        del.setAttribute('aria-label', 'حذف المحادثة');
        del.addEventListener('click', function(e) {
          e.stopPropagation();
          _deleteSession(session.session_id);
        });
        item.appendChild(del);

        // Pin button (Phase 94)
        var pin = document.createElement('button');
        pin.className = 'sidebar-item-pin' + (session.pinned ? ' pinned' : '');
        pin.type = 'button';
        pin.textContent = '\uD83D\uDCCC';
        pin.title = session.pinned ? 'إلغاء التثبيت' : 'تثبيت المحادثة';
        pin.setAttribute('aria-label', pin.title);
        pin.addEventListener('click', function(e) {
          e.stopPropagation();
          _handleTogglePin(session.session_id);
        });
        item.appendChild(pin);

        // Click → switch to this session
        item.addEventListener('click', function() {
          _switchToSession(session.session_id);
        });

        // Keyboard accessibility
        item.addEventListener('keydown', function(e) {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            _switchToSession(session.session_id);
          }
        });

        _sessionsEl.appendChild(item);
      })(sessions[i]);
    }
  }

  /* ── Switch to session ─────────────────────── */
  async function _switchToSession(sessionId) {
    if (!sessionId) return;

    // Save session ID
    try {
      sessionStorage.setItem('research_session_id', sessionId);
      localStorage.setItem('research_session_persist', sessionId);
    } catch (_) {}

    // Close sidebar on mobile
    _close();

    // Clear current chat UI
    var messagesList = AppModule.DOM.messagesList;
    if (messagesList) messagesList.innerHTML = '';
    AppModule.hideWelcomeState();
    if (window.__headerControl) window.__headerControl.hide();

    // Fetch session data and render
    try {
      var res = await fetch('/api/sessions/' + sessionId, {
        headers: AuthModule.getAccessHeaders(),
      });
      if (!res.ok) return;
      var data = await res.json();
      var messages = data.messages || [];

      // Sync local history
      var localHistory = [];
      for (var i = 0; i < messages.length; i++) {
        var m = messages[i];
        var role = m.role === 'assistant' ? 'model' : m.role;
        localHistory.push({ role: role, text: m.text });
      }
      try {
        sessionStorage.setItem('research_chat_history', JSON.stringify(localHistory));
      } catch (_) {}

      // Render messages
      if (!messagesList) return;
      for (var j = 0; j < messages.length; j++) {
        var msg = messages[j];
        if (msg.role === 'user') {
          _renderUserMsg(msg.text);
        } else if (msg.role === 'assistant' || msg.role === 'model') {
          _renderAssistantMsg(msg.text);
        }
      }
      AppModule.scrollToBottom(false);

      // Update active state in sidebar
      _activeId = sessionId;
      _updateActiveHighlight();

    } catch (_err) {
      // Silent fail
    }
  }

  /* ── Simple message renderers for sidebar-initiated restore ── */
  function _renderUserMsg(text) {
    var messagesList = AppModule.DOM.messagesList;
    if (!messagesList) return;

    var msg = document.createElement('div');
    msg.className = 'message user';

    var avatar = document.createElement('div');
    avatar.className = 'msg-avatar';
    avatar.setAttribute('aria-hidden', 'true');
    avatar.textContent = '👤';
    msg.appendChild(avatar);

    var body = document.createElement('div');
    body.className = 'msg-body';

    var label = document.createElement('span');
    label.className = 'msg-label';
    label.textContent = CLIENT_CONFIG.CHAT.userLabel;
    body.appendChild(label);

    var bubble = document.createElement('div');
    bubble.className = 'msg-bubble';
    bubble.textContent = text;
    body.appendChild(bubble);

    msg.appendChild(body);
    messagesList.appendChild(msg);
  }

  function _renderAssistantMsg(text) {
    var messagesList = AppModule.DOM.messagesList;
    if (!messagesList) return;

    var msg = document.createElement('div');
    msg.className = 'message assistant';

    var avatar = document.createElement('div');
    avatar.className = 'msg-avatar';
    avatar.setAttribute('aria-hidden', 'true');
    avatar.textContent = '🔍';
    msg.appendChild(avatar);

    var body = document.createElement('div');
    body.className = 'msg-body';

    var label = document.createElement('span');
    label.className = 'msg-label';
    label.textContent = CLIENT_CONFIG.CHAT.assistantLabel;
    body.appendChild(label);

    var bubble = document.createElement('div');
    bubble.className = 'msg-bubble';
    bubble.appendChild(MarkdownRenderer.render(text));
    body.appendChild(bubble);

    // Phase 90: disabled feedback buttons on restored messages
    if (window.getEffective('FEEDBACK')) {
      var bar = document.createElement('div');
      bar.className = 'ai8v-feedback-bar feedback-submitted';

      var btnUp = document.createElement('button');
      btnUp.type = 'button';
      btnUp.className = 'feedback-btn feedback-positive';
      btnUp.textContent = '\uD83D\uDC4D';
      btnUp.disabled = true;
      btnUp.title = 'التقييم متاح فقط للإجابات الجديدة';

      var btnDown = document.createElement('button');
      btnDown.type = 'button';
      btnDown.className = 'feedback-btn feedback-negative';
      btnDown.textContent = '\uD83D\uDC4E';
      btnDown.disabled = true;
      btnDown.title = 'التقييم متاح فقط للإجابات الجديدة';

      bar.appendChild(btnUp);
      bar.appendChild(btnDown);
      body.appendChild(bar);
    }

    msg.appendChild(body);
    messagesList.appendChild(msg);
  }

  /* ── Delete session ────────────────────────── */
  async function _deleteSession(sessionId) {
    if (!sessionId) return;

    try {
      var res = await fetch('/api/sessions/' + sessionId, {
        method: 'DELETE',
        headers: AuthModule.getAccessHeaders(),
      });
      if (!res.ok && res.status !== 404) return;

      // If deleting the active session, clear chat
      var currentSid = null;
      try { currentSid = sessionStorage.getItem('research_session_id'); } catch (_) {}
      if (sessionId === currentSid) {
        ChatModule.clear();
      }

      // Refresh the list
      _loadSessions();

    } catch (_err) {
      // Silent fail
    }
  }

  /* ── Update active highlight ───────────────── */
  function _updateActiveHighlight() {
    if (!_sessionsEl) return;
    var items = _sessionsEl.querySelectorAll('.sidebar-item');
    for (var i = 0; i < items.length; i++) {
      if (items[i].getAttribute('data-session-id') === _activeId) {
        items[i].classList.add('active');
      } else {
        items[i].classList.remove('active');
      }
    }
  }

  /* ── Toggle sidebar ────────────────────────── */
  function _open() {
    if (!_sidebar || _isOpen) return;
    _isOpen = true;
    _sidebar.classList.add('sidebar-open');
    if (_overlay) _overlay.classList.add('open');
    _loadSessions();
  }

  function _close() {
    if (!_sidebar || !_isOpen) return;
    _isOpen = false;
    _sidebar.classList.remove('sidebar-open');
    if (_overlay) _overlay.classList.remove('open');
  }

  function _toggle_fn() {
    if (_isOpen) _close(); else _open();
  }

  /* ── Date helpers ──────────────────────────── */
  function _formatDate(iso) {
    if (!iso) return '';
    try {
      var d = new Date(iso);
      return d.toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' });
    } catch (_) {
      return iso.slice(0, 10);
    }
  }

  function _relativeTime(iso) {
    if (!iso) return '';
    try {
      var now = Date.now();
      var then = new Date(iso).getTime();
      var diff = now - then;

      var mins = Math.floor(diff / 60000);
      if (mins < 1) return 'الآن';
      if (mins < 60) return 'منذ ' + mins + ' د';

      var hours = Math.floor(mins / 60);
      if (hours < 24) return 'منذ ' + hours + ' س';

      var days = Math.floor(hours / 24);
      if (days < 7) return 'منذ ' + days + ' يوم';

      return _formatDate(iso);
    } catch (_) {
      return _formatDate(iso);
    }
  }

  /* ── Title edit + Pin toggle + Search (Phase 94) ── */
  async function _handleTitleEdit(sessionId, newTitle) {
    if (!sessionId || !newTitle) return;
    try {
      var res = await fetch('/api/sessions/' + sessionId + '/title', {
        method: 'PATCH',
        headers: Object.assign({ 'Content-Type': 'application/json' }, AuthModule.getAccessHeaders()),
        body: JSON.stringify({ title: newTitle }),
      });
      if (res.ok) {
        _loadSessions();
      }
    } catch (_) {}
  }

  async function _handleTogglePin(sessionId) {
    if (!sessionId) return;
    try {
      var res = await fetch('/api/sessions/' + sessionId + '/pin', {
        method: 'POST',
        headers: AuthModule.getAccessHeaders(),
      });
      if (res.ok) {
        _loadSessions();
      }
    } catch (_) {}
  }

  function _filterSessions(query) {
    if (!query || !query.trim()) {
      _renderSessionList(_loadedSessions);
      return;
    }
    var q = query.trim().toLowerCase();
    var filtered = _loadedSessions.filter(function(s) {
      var titleText = (s.custom_title || s.first_message || '').toLowerCase();
      return titleText.indexOf(q) !== -1;
    });
    _renderSessionList(filtered);
  }

  /* ── SSE auto-refresh (Phase 93) ───────────── */
  function _connectSSE() {
    if (_eventSource) return;
    if (!CLIENT_CONFIG.SESSIONS || !CLIENT_CONFIG.SESSIONS.enabled) return;
    if (typeof EventSource === 'undefined') return;

    try {
      var url = '/api/sessions/stream';
      var headers = AuthModule.getAccessHeaders();
      // EventSource doesn't support custom headers natively
      // For access-pin/token, we rely on cookies or query params if needed
      // In the current architecture, requireAccess checks X-Access-Pin header,
      // but EventSource can't set headers. For public access mode, this works.
      // For PIN-protected mode, the session cookie or other mechanism handles auth.
      _eventSource = new EventSource(url);

      _eventSource.onopen = function() {
        _reconnectAttempts = 0;
      };

      _eventSource.onmessage = function(event) {
        try {
          var data = JSON.parse(event.data);
          if (data.type === 'session_updated' || data.type === 'session_meta_updated') {
            _loadSessions();
          }
        } catch (_) {}
      };

      _eventSource.onerror = function() {
        if (_eventSource) {
          _eventSource.close();
          _eventSource = null;
        }
        if (_reconnectTimer) clearTimeout(_reconnectTimer);
        var delay = _calcReconnectDelay();
        _reconnectAttempts++;
        _reconnectTimer = setTimeout(_connectSSE, delay);
      };
    } catch (_) {}
  }

  function _updateBadge(count) {
    if (!_toggle) return;
    var badge = _toggle.querySelector('.sidebar-badge');
    if (count > 0) {
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'sidebar-badge';
        _toggle.style.position = 'relative';
        _toggle.appendChild(badge);
      }
      badge.textContent = count;
      badge.style.display = '';
    } else if (badge) {
      badge.style.display = 'none';
    }
  }

  /* ── Public ────────────────────────────────── */
  function init() {
    // Guard: skip if SESSIONS not enabled
    if (!CLIENT_CONFIG.SESSIONS || !CLIENT_CONFIG.SESSIONS.enabled) return;

    // Bind DOM refs
    _sidebar    = document.getElementById('sidebar');
    _overlay    = document.getElementById('sidebar-overlay');
    _toggle     = document.getElementById('btn-sidebar-toggle');
    _sessionsEl = document.getElementById('sidebar-sessions');
    _newChatBtn = document.getElementById('btn-new-chat-sidebar');

    if (!_sidebar || !_sessionsEl) return;

    // Show toggle button
    if (_toggle) {
      _toggle.classList.remove('hidden');
      _toggle.addEventListener('click', _toggle_fn);
    }

    // Overlay click → close
    if (_overlay) {
      _overlay.addEventListener('click', _close);
    }

    // New chat button in sidebar
    if (_newChatBtn) {
      _newChatBtn.addEventListener('click', function() {
        _close();
        ChatModule.clear();
      });
    }

    // Search input (Phase 94)
    _searchInput = document.getElementById('sidebar-search');
    if (_searchInput) {
      _searchInput.addEventListener('input', function() {
        _filterSessions(_searchInput.value);
      });
    }

    // Load sessions initially
    _loadSessions();

    // Connect SSE for auto-refresh (Phase 93)
    _connectSSE();
  }

  function refreshList() {
    _loadSessions();
  }

  return Object.freeze({ init, refreshList });
})();
