/* =============================================================
   topics.js — TopicsModule
   Fetch topics · Render chips · Active topic state
   ============================================================= */

'use strict';

const TopicsModule = (() => {

  /* ── Internal state ───────────────────────────────────────── */
  let _topics      = [];   // مصفوفة التبويبات من الـ API
  let _activeTopic = null; // null = كل المكتبة

  /* ── Render skeleton أثناء التحميل ───────────────────────── */
  function _renderSkeleton() {
    const { topicsBar } = AppModule.DOM;
    if (!topicsBar) return;

    topicsBar.innerHTML = '';

    const wrap = document.createElement('div');
    wrap.className = 'topics-skeleton';

    const widths = [80, 110, 90, 130, 100];
    widths.forEach(w => {
      const el = document.createElement('div');
      el.className = 'skel-chip';
      el.style.width = `${w}px`;
      wrap.appendChild(el);
    });

    topicsBar.appendChild(wrap);
  }

  /* ── بناء chip واحدة (بدون أعداد) ─────────────────────────── */
  function _buildChip(topic) {
    const btn = document.createElement('button');
    btn.className       = 'topic-chip';
    btn.type            = 'button';
    btn.dataset.topicId = String(topic.id);

    // هل هي النشطة؟
    const isActive = (topic.id === 'all')
      ? _activeTopic === null
      : _activeTopic === String(topic.id);

    if (isActive) btn.classList.add('active');

    // Label فقط — بدون count
    btn.textContent = topic.label;

    // Click handler
    btn.addEventListener('click', () => selectTopic(topic.id));

    return btn;
  }

  /* ── رسم كل الـ chips ─────────────────────────────────────── */
  function _renderChips() {
    const { topicsBar } = AppModule.DOM;
    if (!topicsBar) return;

    topicsBar.innerHTML = '';

    _topics.forEach(topic => {
      topicsBar.appendChild(_buildChip(topic));
    });
  }

  /* ── تحديث الـ active chip بصرياً ────────────────────────── */
  function _updateActiveChip() {
    const { topicsBar } = AppModule.DOM;
    if (!topicsBar) return;

    topicsBar.querySelectorAll('.topic-chip').forEach(btn => {
      const id       = btn.dataset.topicId;
      const isActive = (id === 'all')
        ? _activeTopic === null
        : _activeTopic === id;

      btn.classList.toggle('active', isActive);
    });
  }

  /* ── تحديث scope label في الـ input ──────────────────────── */
  function _updateScopeLabel() {
    const { scopeText } = AppModule.DOM;
    if (!scopeText) return;

    if (_activeTopic === null) {
      scopeText.textContent = CLIENT_CONFIG.LIBRARY.domainLabel
        || CLIENT_CONFIG.CHAT.allTopicsLabel;
    } else {
      const found = _topics.find(t => String(t.id) === _activeTopic);
      scopeText.textContent = found ? found.label : _activeTopic;
    }
  }

  /* ── اختيار تبويب ─────────────────────────────────────────── */
  function selectTopic(topicId) {
    // 'all' أو null → كل المكتبة
    if (topicId === 'all' || topicId === null) {
      _activeTopic = null;
      AppModule.STATE.activeTopic = null;
    } else {
      _activeTopic = String(topicId);
      AppModule.STATE.activeTopic = String(topicId);
    }

    _updateActiveChip();
    _updateScopeLabel();
  }

  /* ── تحميل التصنيفات — من config أولاً، ثم API كـ fallback ── */
  async function _fetchTopics() {
    const configCategories = CLIENT_CONFIG.LIBRARY.categories;

    // ── إذا المدرب حدد تصنيفات في config — استخدمها مباشرة
    if (Array.isArray(configCategories) && configCategories.length > 0) {
      _topics = [
        { id: 'all', label: CLIENT_CONFIG.CHAT.allTopicsLabel },
        ...configCategories.map(cat => ({
          id:    cat.id || cat.label,
          label: cat.label,
        })),
      ];
      _renderChips();
      _updateScopeLabel();
      AppModule.setConnectionStatus('online');
      return;
    }

    // ── لا تصنيفات في config — جلب من API
    _renderSkeleton();

    try {
      const controller = new AbortController();
      const timer      = setTimeout(() => controller.abort(), 8000);

      const res = await fetch(CLIENT_CONFIG.API.topics, {
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();

      if (!Array.isArray(data) || data.length === 0) {
        throw new Error('empty topics');
      }

      // إضافة "الكل" في البداية + إزالة count من بيانات API
      _topics = [
        { id: 'all', label: CLIENT_CONFIG.CHAT.allTopicsLabel },
        ...data.map(t => ({ id: t.id, label: t.label })),
      ];
      _renderChips();
      _updateScopeLabel();
      AppModule.setConnectionStatus('online');

    } catch (err) {
      // فشل — اعرض "الكل" فقط
      _topics = [{ id: 'all', label: CLIENT_CONFIG.CHAT.allTopicsLabel }];
      _renderChips();
      _updateScopeLabel();

      if (err.name !== 'AbortError') {
        AppModule.setConnectionStatus('offline');
        console.warn('[TopicsModule] fetch failed:', err.message);
      }
    }
  }

  /* ── Init ─────────────────────────────────────────────────── */
  function init() {
    // إذا المدرب أخفى شريط التصنيفات — لا نعرضه
    if (CLIENT_CONFIG.LIBRARY.showTopics === false) {
      const { topicsBar } = AppModule.DOM;
      if (topicsBar) topicsBar.classList.add('hidden');
      return;
    }
    _fetchTopics();
  }

  /* ── Getters ──────────────────────────────────────────────── */
  function getTopics()      { return [..._topics]; }
  function getActiveTopic() { return _activeTopic; }

  /* ── Public API ───────────────────────────────────────────── */
  return Object.freeze({
    init,
    selectTopic,
    getTopics,
    getActiveTopic,
  });

})();