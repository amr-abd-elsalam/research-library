/* =============================================================
   markdown.js — MarkdownRenderer
   Lightweight Markdown → DOM (no innerHTML, no dependencies)
   Supports: ### h3, #### h4, **bold**, - lists, 1. lists,
             `inline code`, paragraphs, line breaks
   ============================================================= */

'use strict';

const MarkdownRenderer = (() => {

  /* ── تحويل سطر نصي إلى عناصر inline (bold, code, text) ── */
  function _parseInline(text, parent) {
    // Pattern: **bold** أو `code`
    const regex = /(\*\*(.+?)\*\*)|(`([^`]+?)`)/g;
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(text)) !== null) {
      // نص عادي قبل الـ match
      if (match.index > lastIndex) {
        parent.appendChild(
          document.createTextNode(text.slice(lastIndex, match.index))
        );
      }

      if (match[2]) {
        // **bold**
        const strong = document.createElement('strong');
        strong.textContent = match[2];
        parent.appendChild(strong);
      } else if (match[4]) {
        // `inline code`
        const code = document.createElement('code');
        code.className = 'md-inline-code';
        code.textContent = match[4];
        parent.appendChild(code);
      }

      lastIndex = regex.lastIndex;
    }

    // نص متبقي بعد آخر match
    if (lastIndex < text.length) {
      parent.appendChild(
        document.createTextNode(text.slice(lastIndex))
      );
    }

    // لو ما في أي match — النص كله عادي
    if (lastIndex === 0 && text.length > 0) {
      // تم إضافته أعلاه بالفعل في الشرط الأخير
    }
  }

  /* ── تصنيف نوع السطر ─────────────────────────────────────── */
  function _classifyLine(line) {
    const trimmed = line.trim();

    if (trimmed === '') return { type: 'empty', content: '' };

    // #### h4
    if (trimmed.startsWith('#### ')) {
      return { type: 'h4', content: trimmed.slice(5).trim() };
    }

    // ### h3
    if (trimmed.startsWith('### ')) {
      return { type: 'h3', content: trimmed.slice(4).trim() };
    }

    // ## h3 (نعامله كـ h3 أيضاً)
    if (trimmed.startsWith('## ')) {
      return { type: 'h3', content: trimmed.slice(3).trim() };
    }

    // # h3 (نعامله كـ h3 — لا نسمح بـ h1/h2 في الإجابات)
    if (trimmed.startsWith('# ')) {
      return { type: 'h3', content: trimmed.slice(2).trim() };
    }

    // قائمة نقطية: - item أو * item أو • item
    if (/^[-*•]\s+/.test(trimmed)) {
      return { type: 'ul', content: trimmed.replace(/^[-*•]\s+/, '') };
    }

    // قائمة مرقمة: 1. item أو 1) item
    if (/^\d+[.)]\s+/.test(trimmed)) {
      return { type: 'ol', content: trimmed.replace(/^\d+[.)]\s+/, '') };
    }

    return { type: 'paragraph', content: trimmed };
  }

  /* ── بناء عنصر DOM لسطر واحد مع inline parsing ──────────── */
  function _buildElement(tag, text, className) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    _parseInline(text, el);
    return el;
  }

  /* ══════════════════════════════════════════════════════════
     PUBLIC: render(text) → DocumentFragment
     يحوّل نص Markdown كامل إلى fragment جاهز للإضافة للـ DOM
  ══════════════════════════════════════════════════════════ */
  function render(text) {
    const fragment = document.createDocumentFragment();

    if (!text || typeof text !== 'string') return fragment;

    const lines = text.split('\n');
    let currentList = null;  // null | 'ul' | 'ol'
    let listElement = null;

    function _closeList() {
      if (listElement) {
        fragment.appendChild(listElement);
        listElement = null;
        currentList = null;
      }
    }

    for (let i = 0; i < lines.length; i++) {
      const { type, content } = _classifyLine(lines[i]);

      // ── Empty line — يغلق أي قائمة مفتوحة
      if (type === 'empty') {
        _closeList();
        continue;
      }

      // ── Headings
      if (type === 'h3' || type === 'h4') {
        _closeList();
        const heading = _buildElement(type, content, `md-${type}`);
        fragment.appendChild(heading);
        continue;
      }

      // ── Unordered list
      if (type === 'ul') {
        if (currentList !== 'ul') {
          _closeList();
          listElement = document.createElement('ul');
          listElement.className = 'md-list';
          currentList = 'ul';
        }
        const li = _buildElement('li', content, 'md-list-item');
        listElement.appendChild(li);
        continue;
      }

      // ── Ordered list
      if (type === 'ol') {
        if (currentList !== 'ol') {
          _closeList();
          listElement = document.createElement('ol');
          listElement.className = 'md-list md-list-ordered';
          currentList = 'ol';
        }
        const li = _buildElement('li', content, 'md-list-item');
        listElement.appendChild(li);
        continue;
      }

      // ── Paragraph
      if (type === 'paragraph') {
        _closeList();

        // تجميع أسطر متتالية في فقرة واحدة
        let paragraphText = content;
        while (i + 1 < lines.length) {
          const nextClassified = _classifyLine(lines[i + 1]);
          if (nextClassified.type === 'paragraph') {
            paragraphText += ' ' + nextClassified.content;
            i++;
          } else {
            break;
          }
        }

        const p = _buildElement('p', paragraphText, 'md-paragraph');
        fragment.appendChild(p);
      }
    }

    // أغلق أي قائمة مفتوحة في النهاية
    _closeList();

    return fragment;
  }

  /* ══════════════════════════════════════════════════════════
     PUBLIC: renderToContainer(text, container)
     ينظف الـ container ويضيف المحتوى المُحوَّل
  ══════════════════════════════════════════════════════════ */
  function renderToContainer(text, container) {
    if (!container) return;
    // تنظيف آمن
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }
    container.appendChild(render(text));
  }

  /* ── Public API ───────────────────────────────────────────── */
  return Object.freeze({
    render,
    renderToContainer,
  });

})();
