/* =============================================================
   suggestions.js — SuggestionsModule
   Static suggestion cards · Welcome state only
   ============================================================= */

'use strict';

const SuggestionsModule = (() => {

  /* ── الأسئلة المقترحة — تُقرأ من config ─────────────────── */
  const DEFAULT_SUGGESTIONS = [
    'ما المواضيع التي تغطيها هذه المكتبة؟',
    'لخّص أهم المفاهيم الواردة في المكتبة',
  ];

  /* ── بناء card واحدة ──────────────────────────────────────── */
  function _buildCard(text) {
    const btn = document.createElement('button');
    btn.className = 'suggestion-card';
    btn.type      = 'button';

    // icon
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('width',        '14');
    icon.setAttribute('height',       '14');
    icon.setAttribute('viewBox',      '0 0 24 24');
    icon.setAttribute('fill',         'none');
    icon.setAttribute('stroke',       'currentColor');
    icon.setAttribute('stroke-width', '2');
    icon.style.marginBottom = '6px';
    icon.style.opacity      = '0.5';
    const iconPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    iconPath.setAttribute('d', 'M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z');
    icon.appendChild(iconPath);
    btn.appendChild(icon);

    // text
    const span = document.createElement('span');
    span.textContent = text;
    btn.appendChild(span);

    // click → أرسل السؤال للـ ChatModule
    btn.addEventListener('click', () => {
      if (AppModule.STATE.isLoading) return;

      const { chatTextarea } = AppModule.DOM;
      if (!chatTextarea) return;

      chatTextarea.value = text;
      chatTextarea.dispatchEvent(new Event('input'));

      requestAnimationFrame(() => {
        ChatModule.send();
      });
    });

    return btn;
  }

  /* ── رسم كل الـ cards ─────────────────────────────────────── */
  function _render(list) {
    const { suggestionsGrid } = AppModule.DOM;
    if (!suggestionsGrid) return;

    suggestionsGrid.innerHTML = '';

    list.forEach(text => {
      suggestionsGrid.appendChild(_buildCard(text));
    });
  }

  /* ── Init ─────────────────────────────────────────────────── */
  function init() {
    const configSuggestions = CLIENT_CONFIG.CHAT.suggestions;
    const list = (Array.isArray(configSuggestions) && configSuggestions.length > 0)
      ? configSuggestions
      : DEFAULT_SUGGESTIONS;
    _render(list);
  }

  /* ── Refresh ─────── */
  function refresh(newList) {
    const list = Array.isArray(newList) && newList.length > 0
      ? newList
      : CLIENT_CONFIG.CHAT.suggestions || DEFAULT_SUGGESTIONS;
    _render(list);
  }

  /* ── Public API ───────────────────────────────────────────── */
  return Object.freeze({
    init,
    refresh,
  });

})();
