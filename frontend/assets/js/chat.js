/* =============================================================
   chat.js — ChatModule
   Send · Stream · Render messages · History · Clear
   ============================================================= */

'use strict';

const ChatModule = (() => {

  /* ── History (sessionStorage) ─────────────────────────────── */
  const HISTORY_KEY        = 'research_chat_history';
  const SESSION_ID_KEY     = 'research_session_id';
  const SESSION_PERSIST_KEY = 'research_session_persist';
  const MAX_HISTORY        = CLIENT_CONFIG.LIMITS.maxHistoryItems;

  function _loadHistory() {
    try {
      const raw = sessionStorage.getItem(HISTORY_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }

  function _saveHistory(history) {
    try {
      sessionStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch { /* quota exceeded — ignore */ }
  }

  function _pushHistory(role, text) {
    const history = _loadHistory();
    history.push({ role, text });
    if (history.length > MAX_HISTORY) history.splice(0, history.length - MAX_HISTORY);
    _saveHistory(history);
  }

  /* ── Server-side sessions ─────────────────────────────────── */
  function _getSessionId() {
    if (!CLIENT_CONFIG.SESSIONS || !CLIENT_CONFIG.SESSIONS.enabled) return null;
    return sessionStorage.getItem(SESSION_ID_KEY) || null;
  }

  async function _ensureSession() {
    if (!CLIENT_CONFIG.SESSIONS || !CLIENT_CONFIG.SESSIONS.enabled) return null;
    var sid = sessionStorage.getItem(SESSION_ID_KEY);
    if (sid) return sid;
    try {
      var topicFilter = TopicsModule.getActiveTopic();
      var res = await fetch(CLIENT_CONFIG.API.sessions, {
        method: 'POST',
        headers: Object.assign(
          { 'Content-Type': 'application/json' },
          AuthModule.getAccessHeaders()
        ),
        body: JSON.stringify({ topic_filter: topicFilter }),
      });
      if (!res.ok) return null;
      var data = await res.json();
      sessionStorage.setItem(SESSION_ID_KEY, data.session_id);
      try { localStorage.setItem(SESSION_PERSIST_KEY, data.session_id); } catch (_) { /* ignore */ }
      return data.session_id;
    } catch (e) { return null; }
  }

  /* ── Input state (enable/disable) ────────────────────────── */
  function _setInputState(enabled) {
    const { chatTextarea, btnSend } = AppModule.DOM;
    AppModule.STATE.isLoading = !enabled;

    if (chatTextarea) chatTextarea.disabled = !enabled;
    if (btnSend)      btnSend.disabled      = !enabled;

    if (enabled && chatTextarea) {
      chatTextarea.focus();
    }
  }

  /* ── Char counter ─────────────────────────────────────────── */
  function _updateCharCount(len) {
    const { charCount } = AppModule.DOM;
    if (!charCount) return;

    const max = CLIENT_CONFIG.LIMITS.maxMessageChars;
    charCount.textContent = `${len} / ${max}`;
    charCount.className   = 'char-count';

    if (len > max)           charCount.classList.add('over');
    else if (len > max * 0.8) charCount.classList.add('warn');
  }

  /* ══════════════════════════════════════════════════════════
     MESSAGE BUILDERS
  ══════════════════════════════════════════════════════════ */

  function _makeAvatar(isUser) {
    const div = document.createElement('div');
    div.className = 'msg-avatar';
    div.setAttribute('aria-hidden', 'true');
    div.textContent = isUser ? '👤' : '🔍';
    return div;
  }

  function _addUserMessage(text) {
    AppModule.hideWelcomeState();

    const { messagesList } = AppModule.DOM;
    if (!messagesList) return;

    const msg = document.createElement('div');
    msg.className = 'message user';
    msg.appendChild(_makeAvatar(true));

    const body = document.createElement('div');
    body.className = 'msg-body';

    const label = document.createElement('span');
    label.className   = 'msg-label';
    label.textContent = CLIENT_CONFIG.CHAT.userLabel;
    body.appendChild(label);

    const bubble = document.createElement('div');
    bubble.className   = 'msg-bubble';
    bubble.textContent = text;
    body.appendChild(bubble);

    msg.appendChild(body);
    messagesList.appendChild(msg);
    AppModule.scrollToBottom();
  }

  function _addTypingIndicator() {
    const { messagesList } = AppModule.DOM;
    if (!messagesList) return null;

    const wrap = document.createElement('div');
    wrap.className = 'typing-indicator';

    wrap.appendChild(_makeAvatar(false));

    const body = document.createElement('div');
    body.className = 'typing-body';

    const label = document.createElement('span');
    label.className   = 'typing-label';
    label.textContent = CLIENT_CONFIG.CHAT.typingText;
    body.appendChild(label);

    const dots = document.createElement('div');
    dots.className = 'typing-dots';
    for (let i = 0; i < 3; i++) {
      dots.appendChild(document.createElement('span'));
    }
    body.appendChild(dots);

    wrap.appendChild(body);
    messagesList.appendChild(wrap);
    AppModule.scrollToBottom();
    return wrap;
  }

  /* ── بناء هيكل رسالة الـ assistant — يرجّع refs بدل IDs ── */
  function _buildAssistantSkeleton() {
    const { messagesList } = AppModule.DOM;
    if (!messagesList) return null;

    const msg = document.createElement('div');
    msg.className = 'message assistant';
    msg.appendChild(_makeAvatar(false));

    const body = document.createElement('div');
    body.className = 'msg-body';

    const label = document.createElement('span');
    label.className   = 'msg-label';
    label.textContent = CLIENT_CONFIG.CHAT.assistantLabel;
    body.appendChild(label);

    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble';
    body.appendChild(bubble);

    // Confidence bar
    const confWrap = document.createElement('div');
    confWrap.className = 'confidence-bar-wrap hidden';

    const confBar = document.createElement('div');
    confBar.className = 'confidence-bar';
    const confFill = document.createElement('div');
    confFill.className = 'confidence-fill';
    confBar.appendChild(confFill);
    confWrap.appendChild(confBar);

    const confLabel = document.createElement('span');
    confLabel.className = 'confidence-label';
    confWrap.appendChild(confLabel);

    body.appendChild(confWrap);

    // Warning
    const warning = document.createElement('div');
    warning.className = 'confidence-warning hidden';
    const warnIcon = document.createElement('span');
    warnIcon.textContent = '⚠️';
    warning.appendChild(warnIcon);
    const warnText = document.createElement('span');
    warning.appendChild(warnText);
    body.appendChild(warning);

    // Source chips
    const chips = document.createElement('div');
    chips.className = 'source-chips hidden';
    body.appendChild(chips);

    // Actions (copy)
    const actions = document.createElement('div');
    actions.className = 'msg-actions hidden';

    const copyBtn = document.createElement('button');
    copyBtn.className = 'btn-copy';
    copyBtn.type      = 'button';

    const copyIcon = document.createElement('span');
    copyIcon.textContent = '📋';
    copyIcon.setAttribute('aria-hidden', 'true');
    copyBtn.appendChild(copyIcon);

    const copyLabel = document.createElement('span');
    copyLabel.textContent = CLIENT_CONFIG.CHAT.copyBtn;
    copyBtn.appendChild(copyLabel);

    actions.appendChild(copyBtn);
    body.appendChild(actions);

    msg.appendChild(body);
    messagesList.appendChild(msg);

    // نرجّع object فيه كل الـ references — بدون أي IDs
    return {
      msgEl:     msg,
      bubble,
      confWrap,
      confFill,
      confLabel,
      warning,
      warnText,
      chips,
      actions,
      copyBtn,
      copyLabel,
    };
  }

  /* ── Markdown render ──────────────────────────────────────── */
  function _renderMarkdown(bubble, fullText) {
    if (!bubble || !fullText) return;
    while (bubble.firstChild) bubble.removeChild(bubble.firstChild);
    bubble.appendChild(MarkdownRenderer.render(fullText));
    AppModule.scrollToBottom(false);
  }

  function _appendRawText(bubble, text) {
    if (!bubble) return;
    bubble.appendChild(document.createTextNode(text));
    AppModule.scrollToBottom(false);
  }

  /* ── Confidence bar — يستخدم refs مباشرة ─────────────────── */
  function _buildConfidenceBar(refs, score) {
    const { confWrap, confFill, confLabel, warning, warnText } = refs;
    if (!confWrap || !confFill || !confLabel) return;

    const { CONFIDENCE } = CLIENT_CONFIG;
    let levelLabel = CONFIDENCE.level1.label;
    if      (score >= CONFIDENCE.level5.min) levelLabel = CONFIDENCE.level5.label;
    else if (score >= CONFIDENCE.level4.min) levelLabel = CONFIDENCE.level4.label;
    else if (score >= CONFIDENCE.level3.min) levelLabel = CONFIDENCE.level3.label;
    else if (score >= CONFIDENCE.level2.min) levelLabel = CONFIDENCE.level2.label;

    let confClass = 'conf-1';
    if      (score >= 0.92) confClass = 'conf-5';
    else if (score >= 0.82) confClass = 'conf-4';
    else if (score >= 0.72) confClass = 'conf-3';
    else if (score >= 0.60) confClass = 'conf-2';

    confFill.className = `confidence-fill ${confClass}`;
    confLabel.textContent = levelLabel;
    confWrap.classList.remove('hidden');

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        confFill.style.width = `${Math.round(score * 100)}%`;
      });
    });

    if (score < CONFIDENCE.level2.min && warning && warnText) {
      warnText.textContent = CONFIDENCE.lowWarning;
      warning.classList.remove('hidden');
    }
  }

  /* ── Copy button — يستخدم refs مباشرة ─────────────────────── */
  function _setupCopyButton(refs, fullText) {
    const { copyBtn, copyLabel, actions } = refs;
    if (!copyBtn || !copyLabel || !actions) return;

    actions.classList.remove('hidden');

    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(fullText);
        copyBtn.classList.add('copied');
        copyLabel.textContent = CLIENT_CONFIG.CHAT.copiedBtn;
        setTimeout(() => {
          copyBtn.classList.remove('copied');
          copyLabel.textContent = CLIENT_CONFIG.CHAT.copyBtn;
        }, 2000);
      } catch { /* clipboard API غير متاحة */ }
    });
  }

  /* ══════════════════════════════════════════════════════════
     ERROR MESSAGE
  ══════════════════════════════════════════════════════════ */

  function _addErrorMessage(text) {
    const { messagesList } = AppModule.DOM;
    if (!messagesList) return;

    const msg = document.createElement('div');
    msg.className = 'message assistant';
    msg.appendChild(_makeAvatar(false));

    const body = document.createElement('div');
    body.className = 'msg-body';

    const label = document.createElement('span');
    label.className   = 'msg-label';
    label.textContent = CLIENT_CONFIG.CHAT.assistantLabel;
    body.appendChild(label);

    const bubble = document.createElement('div');
    bubble.className   = 'msg-bubble';
    bubble.style.color     = 'var(--text-secondary)';
    bubble.style.fontStyle = 'italic';
    bubble.textContent = text;
    body.appendChild(bubble);

    msg.appendChild(body);
    messagesList.appendChild(msg);
    AppModule.scrollToBottom();
  }

  /* ══════════════════════════════════════════════════════════
     FETCH & STREAM
  ══════════════════════════════════════════════════════════ */

  async function _fetchAndStream(message) {
    const history     = _loadHistory();
    const topicFilter = TopicsModule.getActiveTopic();

    const typingEl = _addTypingIndicator();
    const refs     = _buildAssistantSkeleton();

    // مخفي حتى يبدأ الـ stream
    if (refs) refs.msgEl.style.visibility = 'hidden';

    let fullText = '';
    let done     = false;

    try {
      const controller = new AbortController();
      const timer      = setTimeout(() => controller.abort(), 38000);

      var chatBody = {
        message:      message,
        topic_filter: topicFilter,
        history:      history.slice(-10),
      };
      var currentSid = _getSessionId();
      if (currentSid) chatBody.session_id = currentSid;
      var modeSelect = document.getElementById('response-mode-select');
      if (modeSelect && modeSelect.style.display !== 'none' && modeSelect.value) {
        chatBody.response_mode = modeSelect.value;
      }
      var selectedLib = _getSelectedLibrary();
      if (selectedLib) chatBody.library_id = selectedLib;

      const res = await fetch(CLIENT_CONFIG.API.chat, {
        method:  'POST',
        headers: Object.assign(
          { 'Content-Type': 'application/json' },
          AuthModule.getAccessHeaders()
        ),
        body:    JSON.stringify(chatBody),
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (typingEl) typingEl.remove();

      if (!res.ok) {
        let code = 'SERVER_ERROR';
        try { const j = await res.json(); code = j.code || code; } catch { /* */ }
        if (res.status === 429) throw Object.assign(new Error(), { _code: 'RATE_LIMITED' });
        throw Object.assign(new Error(), { _code: code });
      }

      if (refs) refs.msgEl.style.visibility = 'visible';

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let   buffer  = '';

      while (!done) {
        const { value, done: streamDone } = await reader.read();
        if (streamDone) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;

          let parsed;
          try { parsed = JSON.parse(raw); } catch { continue; }

          if (parsed.error) {
            if (refs && refs.bubble) {
              refs.bubble.textContent = parsed.message || CLIENT_CONFIG.CHAT.errorServer;
            }
            done = true;
            break;
          }

          if (parsed.text) {
            fullText += parsed.text;
            if (refs) _appendRawText(refs.bubble, parsed.text);
          }

          // Phase 86: revision chunk — replaces last assistant message with improved answer
          if (parsed.revision && parsed.text && refs) {
            _renderMarkdown(refs.bubble, parsed.text);
            var revIndicator = document.createElement('div');
            revIndicator.className = 'revision-indicator';
            revIndicator.textContent = 'تم تحسين الإجابة ✓';
            revIndicator.style.cssText = 'font-size:0.75rem;color:var(--accent,#10b981);margin-top:4px;opacity:0.8;';
            refs.bubble.appendChild(revIndicator);
            continue;
          }

          // Phase 69: grounding warning chunk
          if (parsed.groundingWarning && refs) {
            var gwBanner = document.createElement('div');
            gwBanner.className = 'grounding-warning';
            var gwIcon = document.createElement('span');
            gwIcon.textContent = '⚠️';
            gwIcon.setAttribute('aria-hidden', 'true');
            gwBanner.appendChild(gwIcon);
            var gwText = document.createElement('span');
            gwText.textContent = 'تنبيه: قد تتضمن هذه الإجابة معلومات غير مستندة بالكامل إلى محتوى المكتبة.';
            gwBanner.appendChild(gwText);
            var body = refs.msgEl.querySelector('.msg-body');
            if (body) body.appendChild(gwBanner);
          }

          if (parsed.done) {
            done = true;

            const sources = parsed.sources || [];
            const score   = parsed.score   ?? 0;

            if (fullText && refs) {
              _renderMarkdown(refs.bubble, fullText);
            }

            if (score > 0 && refs) _buildConfidenceBar(refs, score);

            if (refs && refs.chips && sources.length) {
              refs.chips.classList.remove('hidden');
              SourcesModule.buildSourceChips(sources, refs.chips, parsed.sourceRelevance);
            }

            AppModule.STATE.lastSources = sources;
            AppModule.STATE.lastScore   = score;

            if (fullText && refs) _setupCopyButton(refs, fullText);
            if (fullText) _pushHistory('model', fullText);

            // Store correlationId on message element (Phase 33)
            if (parsed.correlationId && refs && refs.msgEl) {
              refs.msgEl.setAttribute('data-correlation-id', parsed.correlationId);
            }

            // Phase 71: Citation markers + quality badge
            if (refs && parsed.citations && parsed.citations.length > 0 && window.getEffective('CITATION')) {
              _renderCitationMarkers(refs.bubble, parsed.citations, sources);
              _renderQualityBadge(refs.msgEl, parsed.groundingScore, parsed.citations.length);
            }

            // Feedback buttons (Phase 33, Phase 46: uses getEffective)
            if (refs && refs.msgEl && window.getEffective('FEEDBACK')) {
              _addFeedbackButtons(refs.msgEl);
            }

            // Dynamic suggestions (Phase 29)
            if (parsed.suggestions && parsed.suggestions.length > 0) {
              _renderDynamicSuggestions(parsed.suggestions);
            }

            break;
          }
        }
      }

      reader.releaseLock();

    } catch (err) {
      if (typingEl) typingEl.remove();
      if (refs) refs.msgEl.remove();

      let errMsg = CLIENT_CONFIG.CHAT.errorServer;
      if (err.name === 'AbortError')          errMsg = CLIENT_CONFIG.CHAT.errorTimeout;
      else if (err._code === 'RATE_LIMITED')  errMsg = CLIENT_CONFIG.CHAT.errorRate;
      else if (err._code === 'TIMEOUT')       errMsg = CLIENT_CONFIG.CHAT.errorTimeout;

      _addErrorMessage(errMsg);
      AppModule.setConnectionStatus('offline');
      console.warn('[ChatModule] stream error:', err);

    } finally {
      _setInputState(true);
      AppModule.scrollToBottom();
      if (done) AppModule.setConnectionStatus('online');
    }
  }

  /* ══════════════════════════════════════════════════════════
     PUBLIC: send
  ══════════════════════════════════════════════════════════ */

  async function send() {
    const { chatTextarea } = AppModule.DOM;
    if (!chatTextarea) return;

    const message = chatTextarea.value.trim();
    if (!message) return;

    const max = CLIENT_CONFIG.LIMITS.maxMessageChars;
    if (message.length > max) return;

    if (AppModule.STATE.isLoading) return;

    _pushHistory('user', message);

    chatTextarea.value = '';
    _updateCharCount(0);

    _setInputState(false);
    AppModule.setConnectionStatus('loading');

    // إخفاء الهيدر والتصنيفات عند أول رسالة
    if (window.__headerControl) window.__headerControl.hide();

    _addUserMessage(message);

    // Ensure server-side session exists (graceful — no-op if disabled)
    await _ensureSession();

    await _fetchAndStream(message);
  }

  /* ══════════════════════════════════════════════════════════
     PUBLIC: clear
  ══════════════════════════════════════════════════════════ */

  function clear() {
    if (AppModule.STATE.isLoading) return;

    sessionStorage.removeItem(HISTORY_KEY);
    sessionStorage.removeItem(SESSION_ID_KEY);
    try { localStorage.removeItem(SESSION_PERSIST_KEY); } catch (_) { /* ignore */ }

    AppModule.resetWelcomeState();

    AppModule.STATE.lastSources = [];
    AppModule.STATE.lastScore   = 0;

    _updateCharCount(0);

    const { chatTextarea } = AppModule.DOM;
    if (chatTextarea) {
      chatTextarea.value = '';
      chatTextarea.focus();
    }

    AppModule.setConnectionStatus('online');

    // إظهار الهيدر والتصنيفات
    if (window.__headerControl) window.__headerControl.show();
  }

  /* ══════════════════════════════════════════════════════════
     COMMAND HINTS
  ══════════════════════════════════════════════════════════ */

  function _showCommandHint(value) {
    const { inputHint } = AppModule.DOM;
    if (!inputHint) return;

    const commands = CLIENT_CONFIG.COMMANDS?.list;
    if (!commands || !commands.length) return;

    const trimmed = value.trim();
    const prefix  = CLIENT_CONFIG.COMMANDS?.prefix || '/';

    // Show hints when user types the prefix
    if (trimmed === prefix || (trimmed.startsWith(prefix) && trimmed.length <= 10)) {
      const matching = commands.filter(c => c.cmd.startsWith(trimmed));
      if (matching.length > 0 && trimmed !== matching[0]?.cmd) {
        inputHint.textContent = matching.map(c => c.cmd + ' ' + c.desc).join(' · ');
        return;
      }
    }

    // Reset to default hint
    inputHint.textContent = CLIENT_CONFIG.CHAT.inputHint;
  }

  /* ══════════════════════════════════════════════════════════
     INIT
  ══════════════════════════════════════════════════════════ */

  function init() {
    const { chatTextarea, btnSend, btnClear } = AppModule.DOM;

    // Initialize command autocomplete (Phase 21)
    _initAutocomplete();

    if (chatTextarea) {
      chatTextarea.addEventListener('input', () => {
        chatTextarea.style.height = 'auto';
        chatTextarea.style.height = Math.min(chatTextarea.scrollHeight, 140) + 'px';
        _updateCharCount(chatTextarea.value.length);
        _showCommandHint(chatTextarea.value);
      });

      chatTextarea.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          send();
        }
      });
    }

    if (btnSend)  btnSend.addEventListener('click', send);
    if (btnClear) btnClear.addEventListener('click', clear);

    _restoreSession();
  }

  /* ── استعادة آخر محادثة ─────────────────────────────────── */
  function _restoreSession() {
    var sid = _getSessionId();
    if (sid) {
      // Try server-side restore first
      _restoreFromServer(sid);
      return;
    }

    // Check localStorage for persisted session (Phase 19 — cross-tab/browser-restart resume)
    var persistedSid = null;
    try { persistedSid = localStorage.getItem(SESSION_PERSIST_KEY); } catch (_) { /* ignore */ }
    if (persistedSid && CLIENT_CONFIG.SESSIONS && CLIENT_CONFIG.SESSIONS.enabled) {
      _showResumeBanner(persistedSid);
      return;
    }

    _restoreFromLocal();
  }

  /* ── Resume banner (Phase 19) ───────────────────────────── */
  function _showResumeBanner(sid) {
    var chatScroll = AppModule.DOM.chatScroll;
    if (!chatScroll) { _restoreFromLocal(); return; }

    var banner = document.createElement('div');
    banner.className = 'resume-banner';
    banner.setAttribute('role', 'alert');

    var text = document.createElement('span');
    text.className = 'resume-banner-text';
    text.textContent = 'لديك محادثة سابقة — هل تريد المتابعة؟';
    banner.appendChild(text);

    var actions = document.createElement('div');
    actions.className = 'resume-banner-actions';

    var btnResume = document.createElement('button');
    btnResume.className = 'resume-banner-btn resume-btn-yes';
    btnResume.type = 'button';
    btnResume.textContent = 'متابعة';

    var btnNew = document.createElement('button');
    btnNew.className = 'resume-banner-btn resume-btn-no';
    btnNew.type = 'button';
    btnNew.textContent = 'بدء جديدة';

    actions.appendChild(btnResume);
    actions.appendChild(btnNew);
    banner.appendChild(actions);

    chatScroll.insertBefore(banner, chatScroll.firstChild);

    btnResume.addEventListener('click', function() {
      banner.remove();
      sessionStorage.setItem(SESSION_ID_KEY, sid);
      _restoreFromServer(sid);
    });

    btnNew.addEventListener('click', function() {
      banner.remove();
      try { localStorage.removeItem(SESSION_PERSIST_KEY); } catch (_) { /* ignore */ }
      _restoreFromLocal();
    });
  }

  function _restoreFromLocal() {
    var history = _loadHistory();
    if (!history.length) return;

    AppModule.hideWelcomeState();
    if (window.__headerControl) window.__headerControl.hide();

    var messagesList = AppModule.DOM.messagesList;
    if (!messagesList) return;

    history.forEach(function(item) {
      if (item.role === 'user') {
        _addUserMessage(item.text);
      } else if (item.role === 'model' || item.role === 'assistant') {
        _addRestoredAssistantMessage(item.text);
      }
    });

    AppModule.scrollToBottom(false);
  }

  function _restoreFromServer(sid) {
    fetch(CLIENT_CONFIG.API.sessions + '/' + sid, {
      headers: AuthModule.getAccessHeaders(),
    })
    .then(function(res) {
      if (!res.ok) throw new Error('session fetch failed');
      return res.json();
    })
    .then(function(data) {
      var messages = data.messages || [];
      if (!messages.length) {
        _restoreFromLocal();
        return;
      }
      // Persist session_id for cross-session resume (Phase 19)
      try { localStorage.setItem(SESSION_PERSIST_KEY, sid); } catch (_) { /* ignore */ }
      // Sync local history with server data
      var localHistory = [];
      messages.forEach(function(m) {
        var role = m.role === 'assistant' ? 'model' : m.role;
        localHistory.push({ role: role, text: m.text });
      });
      _saveHistory(localHistory);

      AppModule.hideWelcomeState();
      if (window.__headerControl) window.__headerControl.hide();

      var messagesList = AppModule.DOM.messagesList;
      if (!messagesList) return;

      messages.forEach(function(m) {
        if (m.role === 'user') {
          _addUserMessage(m.text);
        } else if (m.role === 'assistant' || m.role === 'model') {
          _addRestoredAssistantMessage(m.text);
        }
      });

      AppModule.scrollToBottom(false);
    })
    .catch(function() {
      // Server failed — fallback to local sessionStorage
      _restoreFromLocal();
    });
  }

  function _addRestoredAssistantMessage(text) {
    const { messagesList } = AppModule.DOM;
    if (!messagesList) return;

    const msg = document.createElement('div');
    msg.className = 'message assistant';
    msg.appendChild(_makeAvatar(false));

    const body = document.createElement('div');
    body.className = 'msg-body';

    const label = document.createElement('span');
    label.className   = 'msg-label';
    label.textContent = CLIENT_CONFIG.CHAT.assistantLabel;
    body.appendChild(label);

    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble';
    bubble.appendChild(MarkdownRenderer.render(text));
    body.appendChild(bubble);

    // Phase 90: disabled feedback buttons on restored messages (no correlationId available)
    if (window.getEffective('FEEDBACK')) {
      var bar = document.createElement('div');
      bar.className = 'ai8v-feedback-bar feedback-submitted';

      var btnUp = document.createElement('button');
      btnUp.type = 'button';
      btnUp.className = 'feedback-btn feedback-positive';
      btnUp.textContent = '\uD83D\uDC4D';
      btnUp.disabled = true;
      btnUp.title = 'التقييم متاح فقط للإجابات الجديدة';
      btnUp.setAttribute('aria-label', 'التقييم متاح فقط للإجابات الجديدة');

      var btnDown = document.createElement('button');
      btnDown.type = 'button';
      btnDown.className = 'feedback-btn feedback-negative';
      btnDown.textContent = '\uD83D\uDC4E';
      btnDown.disabled = true;
      btnDown.title = 'التقييم متاح فقط للإجابات الجديدة';
      btnDown.setAttribute('aria-label', 'التقييم متاح فقط للإجابات الجديدة');

      bar.appendChild(btnUp);
      bar.appendChild(btnDown);
      body.appendChild(bar);
    }

    msg.appendChild(body);
    messagesList.appendChild(msg);
  }

  /* ══════════════════════════════════════════════════════════
     COMMAND AUTOCOMPLETE (Phase 21)
  ══════════════════════════════════════════════════════════ */

  let _commandsCache = null;

  // ── Permission-based command filter (Phase 27) ──────────────
  function _filterCommandsByPermission(commands) {
    const allowed = window.__permissions?.permissions?.allowedCommands;
    if (!allowed) return commands;  // null = all allowed
    return commands.filter(function(cmd) {
      var name = cmd.name || cmd.cmd;
      return allowed.indexOf(name) !== -1;
    });
  }

  async function _fetchCommands() {
    if (_commandsCache) return _commandsCache;
    try {
      const res = await fetch('/api/commands');
      if (res.ok) {
        _commandsCache = await res.json();
      }
    } catch { /* ignore — autocomplete is optional enhancement */ }
    return _commandsCache;
  }

  function _showAutocomplete(commands) {
    const container = document.getElementById('command-autocomplete');
    if (!container || !commands || commands.length === 0) {
      _hideAutocomplete();
      return;
    }

    while (container.firstChild) container.removeChild(container.firstChild);

    for (let i = 0; i < commands.length; i++) {
      const cmd = commands[i];
      const item = document.createElement('div');
      item.className = 'cmd-ac-item';
      item.setAttribute('data-cmd', cmd.name);

      const nameEl = document.createElement('span');
      nameEl.className = 'cmd-ac-name';
      nameEl.textContent = cmd.name;
      item.appendChild(nameEl);

      const descEl = document.createElement('span');
      descEl.className = 'cmd-ac-desc';
      descEl.textContent = cmd.description || '';
      item.appendChild(descEl);

      item.addEventListener('click', function() {
        const textarea = AppModule.DOM.chatTextarea;
        if (textarea) {
          textarea.value = cmd.name + ' ';
          textarea.focus();
          textarea.dispatchEvent(new Event('input'));
        }
        _hideAutocomplete();
      });

      container.appendChild(item);
    }

    container.classList.remove('hidden');
  }

  function _hideAutocomplete() {
    const container = document.getElementById('command-autocomplete');
    if (container) {
      container.classList.add('hidden');
      while (container.firstChild) container.removeChild(container.firstChild);
    }
  }

  function _initAutocomplete() {
    const textarea = document.getElementById('chat-textarea');
    if (!textarea) return;

    textarea.addEventListener('input', async function() {
      const val = textarea.value.trim();
      const prefix = CLIENT_CONFIG.COMMANDS?.prefix || '/';

      if (val.startsWith(prefix) && val.length >= 1) {
        const data = await _fetchCommands();
        if (data) {
          const allCmds = [].concat(
            data.builtins || [],
            data.custom   || [],
            data.plugins  || []
          );
          const q = val.toLowerCase();
          const permFiltered = _filterCommandsByPermission(allCmds);
          const filtered = permFiltered.filter(function(c) {
            return c.name.toLowerCase().indexOf(q) !== -1 ||
              (c.aliases || []).some(function(a) { return a.toLowerCase().indexOf(q) !== -1; });
          });
          _showAutocomplete(filtered.length > 0 ? filtered : permFiltered);
        }
      } else {
        _hideAutocomplete();
      }
    });

    textarea.addEventListener('blur', function() {
      setTimeout(_hideAutocomplete, 200);
    });
  }

  // ── Response mode selector (Phase 27) ───────────────────────
  function _initResponseModeSelector() {
    var select = document.getElementById('response-mode-select');
    if (!select) return;

    var perms = window.__permissions?.permissions;
    var serverModes = CLIENT_CONFIG.RESPONSE?.allowedModes || ['stream'];
    var allowedModes = perms?.allowedModes;
    var modes = (!allowedModes) ? serverModes : serverModes.filter(function(m) { return allowedModes.indexOf(m) !== -1; });

    if (modes.length <= 1) {
      select.style.display = 'none';
      return;
    }

    var labels = { stream: 'مباشر', structured: 'مُنظّم', concise: 'مختصر' };
    var defaultMode = CLIENT_CONFIG.RESPONSE?.defaultMode || 'stream';
    select.innerHTML = modes.map(function(m) {
      return '<option value="' + m + '"' + (m === defaultMode ? ' selected' : '') + '>' + (labels[m] || m) + '</option>';
    }).join('');
    select.style.display = '';
  }

  /* ══════════════════════════════════════════════════════════
     DYNAMIC SUGGESTIONS (Phase 29)
  ══════════════════════════════════════════════════════════ */

  function _renderDynamicSuggestions(suggestions) {
    // Remove any previous dynamic suggestions
    var prev = document.querySelector('.dynamic-suggestions');
    if (prev) prev.remove();

    // Guard: check feature enabled (Phase 46: uses getEffective for runtime toggle support)
    if (!window.getEffective('SUGGESTIONS')) return;

    // Guard: need suggestions
    if (!suggestions || !suggestions.length) return;

    var container = document.createElement('div');
    container.className = 'dynamic-suggestions';

    for (var i = 0; i < suggestions.length; i++) {
      (function(text) {
        var chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'suggestion-chip dynamic';
        chip.textContent = text;

        chip.addEventListener('click', function() {
          // Suggestion click tracking (Phase 54 — fire-and-forget)
          fetch('/api/suggestion-click', {
            method: 'POST',
            headers: Object.assign(
              { 'Content-Type': 'application/json' },
              AuthModule.getAccessHeaders()
            ),
            body: JSON.stringify({ text: text }),
          }).catch(function() {});

          var textarea = AppModule.DOM.chatTextarea;
          if (textarea) {
            textarea.value = text;
            textarea.dispatchEvent(new Event('input'));
          }
          send();
        });

        container.appendChild(chip);
      })(suggestions[i]);
    }

    var messagesList = AppModule.DOM.messagesList;
    if (messagesList) {
      messagesList.appendChild(container);
      AppModule.scrollToBottom();
    }
  }

  /* ══════════════════════════════════════════════════════════
     CITATION MARKERS + QUALITY BADGE (Phase 71)
  ══════════════════════════════════════════════════════════ */

  function _renderCitationMarkers(bubble, citations, sources) {
    if (!bubble || !citations || !citations.length) return;

    // Get all text-bearing block elements inside the bubble (paragraphs, list items, headings)
    var blocks = bubble.querySelectorAll('.md-paragraph, .md-list-item, .md-h3, .md-h4');
    if (!blocks.length) return;

    // Map sentenceIndex to sourceIndex — build a simple lookup
    // Citations are ordered by sentenceIndex (re-sorted after maxCitations filter)
    // We attach markers to the closest block element
    var sentenceCounter = 0;
    for (var bi = 0; bi < blocks.length; bi++) {
      var block = blocks[bi];
      // Count sentences in this block (rough — split on same delimiters)
      var blockText = block.textContent || '';
      var blockSentences = blockText.split(/[.\n؟?!]+/).filter(function(s) { return s.trim().length >= 10; });
      var blockSentenceEnd = sentenceCounter + Math.max(blockSentences.length, 1);

      // Find citations whose sentenceIndex falls in this block's range
      for (var ci = 0; ci < citations.length; ci++) {
        var cit = citations[ci];
        if (cit.sentenceIndex >= sentenceCounter && cit.sentenceIndex < blockSentenceEnd) {
          var marker = document.createElement('sup');
          marker.className = 'citation-marker';
          marker.textContent = '[' + (cit.sourceIndex + 1) + ']';
          marker.setAttribute('data-source-index', cit.sourceIndex);
          marker.title = (sources[cit.sourceIndex] ? (sources[cit.sourceIndex].section || sources[cit.sourceIndex].file || '') : '') + ' (' + Math.round(cit.overlap * 100) + '%)';
          block.appendChild(marker);
        }
      }

      sentenceCounter = blockSentenceEnd;
    }
  }

  function _renderQualityBadge(msgEl, groundingScore, citationCount) {
    if (!msgEl) return;
    if (groundingScore === null || groundingScore === undefined) return;

    var body = msgEl.querySelector('.msg-body');
    if (!body) return;

    var badge = document.createElement('div');
    badge.className = 'quality-badge';

    var level = 'poor';
    var label = 'دقة منخفضة';
    if (groundingScore >= 0.8) { level = 'good'; label = 'دقة عالية'; }
    else if (groundingScore >= 0.6) { level = 'medium'; label = 'دقة متوسطة'; }
    badge.classList.add('quality-badge--' + level);

    var dot = document.createElement('span');
    dot.className = 'quality-badge-dot';
    badge.appendChild(dot);

    var text = document.createElement('span');
    text.textContent = label + ' · ' + citationCount + ' إسناد';
    badge.appendChild(text);

    body.appendChild(badge);
  }

  /* ══════════════════════════════════════════════════════════
     FEEDBACK BUTTONS (Phase 33)
  ══════════════════════════════════════════════════════════ */

  function _addFeedbackButtons(msgEl) {
    var bar = document.createElement('div');
    bar.className = 'ai8v-feedback-bar';

    var btnUp = document.createElement('button');
    btnUp.type = 'button';
    btnUp.className = 'feedback-btn feedback-positive';
    btnUp.textContent = '\uD83D\uDC4D';
    btnUp.setAttribute('aria-label', 'إجابة مفيدة');

    var btnDown = document.createElement('button');
    btnDown.type = 'button';
    btnDown.className = 'feedback-btn feedback-negative';
    btnDown.textContent = '\uD83D\uDC4E';
    btnDown.setAttribute('aria-label', 'إجابة غير مفيدة');

    bar.appendChild(btnUp);
    bar.appendChild(btnDown);

    // Find the msg-body inside the message element
    var body = msgEl.querySelector('.msg-body');
    if (body) {
      body.appendChild(bar);
    } else {
      msgEl.appendChild(bar);
    }

    function handleFeedback(rating) {
      var corrId = msgEl.getAttribute('data-correlation-id');
      if (!corrId) return;

      // Disable both buttons
      btnUp.disabled = true;
      btnDown.disabled = true;
      bar.classList.add('feedback-submitted');

      // Highlight selected
      if (rating === 'positive') {
        btnUp.classList.add('selected');
      } else {
        btnDown.classList.add('selected');
      }

      // Send feedback to server (silent — no alerts on failure)
      var payload = { correlationId: corrId, rating: rating };
      var sid = _getSessionId();
      if (sid) payload.session_id = sid;

      fetch('/api/feedback', {
        method: 'POST',
        headers: Object.assign(
          { 'Content-Type': 'application/json' },
          AuthModule.getAccessHeaders()
        ),
        body: JSON.stringify(payload),
      }).catch(function() { /* silent graceful degradation */ });

      // Phase 90: confirmation text after submit
      var confirmEl = document.createElement('span');
      confirmEl.className = 'feedback-confirmation';
      confirmEl.textContent = 'شكراً على تقييمك';
      bar.appendChild(confirmEl);
    }

    btnUp.addEventListener('click', function() { handleFeedback('positive'); });
    btnDown.addEventListener('click', function() { handleFeedback('negative'); });
  }

  /* ══════════════════════════════════════════════════════════
     LIBRARY SELECTOR (Phase 60)
  ══════════════════════════════════════════════════════════ */

  function _getSelectedLibrary() {
    var wrapper = document.getElementById('library-selector-wrapper');
    var selector = document.getElementById('library-selector');
    if (!wrapper || !selector || wrapper.style.display === 'none') return undefined;
    return selector.value || undefined;
  }

  function _initLibrarySelector() {
    var wrapper = document.getElementById('library-selector-wrapper');
    var selector = document.getElementById('library-selector');
    if (!wrapper || !selector) return;

    var libraries = CLIENT_CONFIG.libraries;
    if (!libraries || !libraries.enabled || !libraries.libraries || libraries.libraries.length <= 1) {
      wrapper.style.display = 'none';
      return;
    }

    // Populate options
    selector.innerHTML = '';
    var defaultLib = libraries.defaultLibrary || libraries.libraries[0]?.id;
    for (var i = 0; i < libraries.libraries.length; i++) {
      var lib = libraries.libraries[i];
      var option = document.createElement('option');
      option.value = lib.id;
      option.textContent = lib.name || lib.id;
      if (lib.id === defaultLib) option.selected = true;
      selector.appendChild(option);
    }

    // Restore from sessionStorage
    var saved = sessionStorage.getItem('ai8v_selected_library');
    if (saved && libraries.libraries.some(function(l) { return l.id === saved; })) {
      selector.value = saved;
    }

    // Save selection
    selector.addEventListener('change', function() {
      sessionStorage.setItem('ai8v_selected_library', selector.value);
    });

    wrapper.style.display = '';
  }

  // Called from bootstrap after permissions are loaded
  function onPermissionsReady() {
    _initResponseModeSelector();
    _initLibrarySelector();
  }

  return Object.freeze({
    init,
    send,
    clear,
    _initAutocomplete,
    onPermissionsReady,
  });

})();
