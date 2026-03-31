/* =============================================================
   auth.js — AuthModule
   PIN / Token gate — shows access screen before chat
   ============================================================= */

'use strict';

const AuthModule = (() => {

  const SESSION_KEY = 'research_access_verified';

  /* ── Check if already verified ───────────────────────────── */
  function isVerified() {
    return sessionStorage.getItem(SESSION_KEY) === 'true';
  }

  /* ── Check if auth is required ───────────────────────────── */
  function isRequired() {
    const mode = CLIENT_CONFIG.AUTH?.mode;
    return mode === 'pin' || mode === 'token';
  }

  /* ── Get mode ────────────────────────────────────────────── */
  function getMode() {
    return CLIENT_CONFIG.AUTH?.mode || 'public';
  }

  /* ── Handle token mode (from URL) ────────────────────────── */
  function _checkTokenFromURL() {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (!token) return false;

    // Verify token with server
    return fetch(CLIENT_CONFIG.API.authVerify, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.valid) {
          sessionStorage.setItem(SESSION_KEY, 'true');
          sessionStorage.setItem('research_access_token', token);
          // Clean URL
          const url = new URL(window.location);
          url.searchParams.delete('token');
          window.history.replaceState({}, '', url.pathname);
          return true;
        }
        return false;
      })
      .catch(() => false);
  }

  /* ── Build PIN screen ────────────────────────────────────── */
  function _buildPinScreen() {
    const overlay = document.createElement('div');
    overlay.className = 'auth-overlay';
    overlay.id = 'auth-overlay';

    const card = document.createElement('div');
    card.className = 'auth-card';

    // Logo
    const logoWrap = document.createElement('div');
    logoWrap.className = 'auth-logo';
    const logoImg = document.createElement('img');
    logoImg.src = CLIENT_CONFIG.BRAND.logo;
    logoImg.alt = CLIENT_CONFIG.BRAND.name;
    logoImg.width = 64;
    logoImg.height = 64;
    logoImg.onerror = function () {
      const ph = document.createElement('div');
      ph.className = 'auth-logo-placeholder';
      ph.textContent = CLIENT_CONFIG.BRAND.name.charAt(0);
      logoWrap.replaceChild(ph, logoImg);
    };
    logoWrap.appendChild(logoImg);
    card.appendChild(logoWrap);

    // Title
    const title = document.createElement('h2');
    title.className = 'auth-title';
    title.textContent = CLIENT_CONFIG.BRAND.name;
    card.appendChild(title);

    // Subtitle
    const sub = document.createElement('p');
    sub.className = 'auth-sub';
    sub.textContent = 'أدخل رمز الدخول للمتابعة';
    card.appendChild(sub);

    // PIN input
    const inputWrap = document.createElement('div');
    inputWrap.className = 'auth-input-wrap';

    const input = document.createElement('input');
    input.type = 'password';
    input.className = 'auth-input';
    input.id = 'auth-pin-input';
    input.placeholder = 'رمز الدخول';
    input.maxLength = 8;
    input.autocomplete = 'off';
    input.inputMode = 'numeric';
    input.setAttribute('aria-label', 'رمز الدخول');
    inputWrap.appendChild(input);
    card.appendChild(inputWrap);

    // Error message
    const errMsg = document.createElement('p');
    errMsg.className = 'auth-error hidden';
    errMsg.id = 'auth-error';
    card.appendChild(errMsg);

    // Submit button
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'auth-btn';
    btn.id = 'auth-submit';
    btn.textContent = 'دخول';
    card.appendChild(btn);

    overlay.appendChild(card);
    return { overlay, input, btn, errMsg };
  }

  /* ── Verify PIN with server ──────────────────────────────── */
  async function _verifyPin(pin, errMsg, btn) {
    btn.disabled = true;
    btn.textContent = 'جاري التحقق...';

    try {
      const res = await fetch(CLIENT_CONFIG.API.authVerify, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });

      const data = await res.json();

      if (data.valid) {
        sessionStorage.setItem(SESSION_KEY, 'true');
        sessionStorage.setItem('research_access_pin', pin);
        return true;
      } else {
        errMsg.textContent = 'رمز الدخول غير صحيح';
        errMsg.classList.remove('hidden');
        btn.disabled = false;
        btn.textContent = 'دخول';
        return false;
      }
    } catch {
      errMsg.textContent = 'تعذّر الاتصال، حاول مرة أخرى';
      errMsg.classList.remove('hidden');
      btn.disabled = false;
      btn.textContent = 'دخول';
      return false;
    }
  }

  /* ── Show gate and return promise ────────────────────────── */
  function showGate() {
    return new Promise((resolve) => {
      const mode = getMode();

      // Token mode — try URL first
      if (mode === 'token') {
        _checkTokenFromURL().then(valid => {
          if (valid) {
            resolve(true);
          } else {
            // Show error — no PIN screen for token mode
            const overlay = document.createElement('div');
            overlay.className = 'auth-overlay';

            const card = document.createElement('div');
            card.className = 'auth-card';

            const title = document.createElement('h2');
            title.className = 'auth-title';
            title.textContent = 'الوصول مقيّد';
            card.appendChild(title);

            const sub = document.createElement('p');
            sub.className = 'auth-sub';
            sub.textContent = 'هذا الرابط يحتاج توكن وصول صالح';
            card.appendChild(sub);

            overlay.appendChild(card);
            document.body.appendChild(overlay);
            resolve(false);
          }
        });
        return;
      }

      // PIN mode
      if (mode === 'pin') {
        const { overlay, input, btn, errMsg } = _buildPinScreen();
        document.body.appendChild(overlay);

        // Focus input
        requestAnimationFrame(() => input.focus());

        const doVerify = async () => {
          const pin = input.value.trim();
          if (!pin) {
            errMsg.textContent = 'أدخل رمز الدخول';
            errMsg.classList.remove('hidden');
            return;
          }
          const valid = await _verifyPin(pin, errMsg, btn);
          if (valid) {
            overlay.classList.add('auth-fade-out');
            setTimeout(() => {
              overlay.remove();
              resolve(true);
            }, 300);
          }
        };

        btn.addEventListener('click', doVerify);
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            doVerify();
          }
        });
        return;
      }

      // public or unknown — just pass
      resolve(true);
    });
  }

  /* ── Inject access headers into fetch (for chat requests) ── */
  function getAccessHeaders() {
    const mode = getMode();
    const headers = {};
    if (mode === 'pin') {
      const pin = sessionStorage.getItem('research_access_pin');
      if (pin) headers['X-Access-Pin'] = pin;
    }
    if (mode === 'token') {
      const token = sessionStorage.getItem('research_access_token');
      if (token) headers['X-Access-Token'] = token;
    }
    return headers;
  }

  return Object.freeze({
    isVerified,
    isRequired,
    getMode,
    showGate,
    getAccessHeaders,
  });

})();
