/* ============================================================
   carino-lang.js — fleet-wide language preference + switcher.
   ------------------------------------------------------------
   Drop this file into any Carino project and add it AFTER the
   header exists (TV's native header) or after carino-navbar.js
   (every other site):

     <script src="carino-lang.js" defer></script>

   It injects a compact language button (a language glyph + AUTO,
   or the picked code: EN / ES / PT / 日本語 / RU) into the header's
   right cluster, left of the Sys. Status control. Clicking it opens
   a dropdown: Auto (follow the browser) plus the five languages.

   AUTOMATIC: the language resolves without any user action —
     ?lang= in the URL  >  fleet-wide choice  >  browser language
     >  English.
   The fleet-wide choice is a cookie on .carino.systems, so one
   pick on any subdomain applies to every site in the fleet
   (subdomains do NOT share localStorage — the cookie is the only
   thing that makes the preference travel). The same choice is
   mirrored into per-site localStorage, which is what off-domain
   copies (local dev, forks) read, and what keeps the pick alive
   on Safari — ITP caps a JS-set cookie at seven days.

   The file owns only the preference. Each app owns its own
   dictionary and reacts via:
     window.CarinoLang.current            // 'en' | 'es' | 'pt-BR' | 'ja' | 'ru'
     window.CarinoLang.set(code)          // programmatic switch
     window.addEventListener('carino:langchange', (e) => e.detail.lang)
   An app with no dictionary simply stays English — the choice
   still persists for the sites that do translate. The switcher's
   own words (its tooltip, "Auto", the legal shield's tooltip) are
   translated here, with a site's window.t winning when it has them.

   Self-contained: styles are inlined and scoped under #cnLangBtn /
   #cnLangBox with hard-coded colours, so it is safe on light-themed
   or Tailwind pages and needs no CDN.
   ============================================================ */
(function () {
  'use strict';

  var A = '#eab308', BG = '#0f0f0f', BORDER = '#262626', MUTED = '#8a8a8a', TEXT = '#fff';
  var MONO = '"IBM Plex Mono",ui-monospace,SFMono-Regular,Menlo,monospace';

  // [code, button label, native name]
  var LANGS = [
    ['en', 'EN', 'English'],
    ['es', 'ES', 'Español'],
    ['pt-BR', 'PT', 'Português'],
    ['ja', '日本語', '日本語'],
    ['ru', 'RU', 'Русский'],
  ];

  var CSS = ''
    + '#cnLangBtn{display:flex;align-items:center;gap:6px;background:transparent;border:1px solid ' + BORDER + ';'
    + 'color:' + MUTED + ';font-family:' + MONO + ';font-size:.8rem;text-transform:uppercase;letter-spacing:.1em;'
    + 'padding:0 10px;height:32px;border-radius:4px;cursor:pointer;transition:.2s;white-space:nowrap;}'
    + '#cnLangBtn:hover{border-color:' + A + ';color:' + A + ';background:rgba(234,179,8,.08);}'
    + '#cnLangBox{position:fixed;top:56px;right:12px;width:180px;background:' + BG + ';'
    + 'border:1px solid ' + BORDER + ';border-radius:8px;padding:6px;box-shadow:0 18px 40px rgba(0,0,0,.6);'
    + 'opacity:0;visibility:hidden;transform:translateY(-8px);transition:.18s;z-index:400;}'
    + '#cnLangBox.open{opacity:1;visibility:visible;transform:translateY(0);}'
    + '#cnLangBox button{display:flex;justify-content:space-between;align-items:center;width:100%;'
    + 'background:transparent;border:0;border-radius:5px;padding:7px 10px;cursor:pointer;text-align:left;'
    + 'color:' + TEXT + ';font-size:.8rem;}'
    + '#cnLangBox button:hover{background:rgba(234,179,8,.08);color:' + A + ';}'
    + '#cnLangBox button .code{font-family:' + MONO + ';font-size:.65rem;letter-spacing:.1em;color:' + MUTED + ';}'
    // "Русский" is the only Cyrillic on an English page, and it is inside a
    // menu nobody has opened yet — enough to pull a whole Cyrillic webfont
    // subset down on every first visit in every language. A system face for
    // that one label costs nothing and every other row keeps the site's font.
    + '#cnLangBox button .nat[lang="ru"]{font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;}'
    + '#cnLangBox button.active{color:' + A + ';}'
    + '#cnLangBox button.active .code{color:' + A + ';}';

  /* ---- resolution ---- */

  function resolve(tag) {
    if (!tag) return null;
    var l = String(tag).toLowerCase();
    if (l.indexOf('es') === 0) return 'es';
    if (l.indexOf('pt') === 0) return 'pt-BR';
    if (l.indexOf('ja') === 0) return 'ja';
    if (l.indexOf('ru') === 0) return 'ru';
    if (l.indexOf('en') === 0) return 'en';
    return null;
  }

  var onFleet = /(^|\.)carino\.systems$/.test(location.hostname);

  /* Storage is a MIRROR, not an either/or. The parent-domain cookie is the
     only thing that carries the choice across subdomains, but Safari's ITP
     caps the lifetime of any cookie written from JS at seven days — so on
     Safari the fleet-wide pick silently reverted to Auto about once a week,
     while Gecko and Chromium honoured the full Max-Age=31536000. localStorage
     is not capped that way, so we write both: the cookie for travel, the
     localStorage copy as a same-origin backstop. Reads prefer the cookie (it
     is the one another subdomain can have just updated) and fall through to
     the mirror when it is gone. */

  function readCookie() {
    try {
      var m = document.cookie.match(/(?:^|;\s*)carino_lang=([^;]+)/);
      return m ? resolve(decodeURIComponent(m[1])) : null;
    } catch (e) { return null; }
  }

  function readStored() {
    var c = onFleet ? readCookie() : null;
    if (c) return c;
    try { return resolve(localStorage.getItem('carino_lang')); } catch (e) { return null; }
  }

  // Secure is added only where it means something: a browser rejects a Secure
  // cookie outright from a plain-http origin, so setting it unconditionally
  // would throw the preference away on any fleet site still served over http.
  var COOKIE = '; Domain=.carino.systems; Path=/; SameSite=Lax'
    + (location.protocol === 'https:' ? '; Secure' : '');

  function store(code) {
    if (onFleet) {
      try {
        document.cookie = 'carino_lang=' + encodeURIComponent(code) + '; Max-Age=31536000' + COOKIE;
      } catch (e) { /* cookies blocked */ }
    }
    try { localStorage.setItem('carino_lang', code); } catch (e) { /* private mode */ }
  }

  function clearStore() {
    if (onFleet) {
      try {
        document.cookie = 'carino_lang=; Max-Age=0' + COOKIE;
      } catch (e) { /* cookies blocked */ }
    }
    try { localStorage.removeItem('carino_lang'); } catch (e) { /* private mode */ }
  }

  // AUTO is the default: no stored choice means "follow the browser". A
  // manual pick stores it fleet-wide; picking Auto again clears it.
  var urlLang = resolve(new URLSearchParams(location.search).get('lang'));
  if (urlLang) store(urlLang);
  var stored = urlLang || readStored();
  var manual = !!stored;
  var current = stored || resolve(navigator.language) || 'en';
  document.documentElement.lang = current;

  // Translated <title> and description, written into the page by the fleet
  // baseline as <script type="application/json" id="carino-head-i18n">. When
  // the URL names the language (?lang=es), the canonical points at that URL
  // too, so search engines index each language version as its own page.
  var headI18n = null, headOrig = null;
  try {
    var hi = document.getElementById('carino-head-i18n');
    if (hi) headI18n = JSON.parse(hi.textContent);
  } catch (e) { headI18n = null; }

  function headEl(sel) { return document.head && document.head.querySelector(sel); }

  function applyHead() {
    if (!headI18n) return;
    var desc = headEl('meta[name="description"]'), canon = headEl('link[rel="canonical"]');
    var ogt = headEl('meta[property="og:title"]'), ogd = headEl('meta[property="og:description"]');
    if (!headOrig) {
      headOrig = { title: document.title, desc: desc && desc.content, canon: canon && canon.href,
                   ogt: ogt && ogt.content, ogd: ogd && ogd.content };
    }
    var t = headI18n[current];
    document.title = t ? t.title : headOrig.title;
    if (desc) desc.content = t ? t.desc : headOrig.desc;
    if (ogt) ogt.content = t ? t.title : headOrig.ogt;
    if (ogd) ogd.content = t ? t.desc : headOrig.ogd;
    if (canon && headOrig.canon) {
      var inUrl = resolve(new URLSearchParams(location.search).get('lang')) === current;
      canon.href = (t && inUrl) ? headOrig.canon.split('?')[0] + '?lang=' + encodeURIComponent(current)
                                : headOrig.canon;
    }
  }
  applyHead();

  // The "language" glyph (A + 文) shown on the button in every state.
  var ICON = '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden="true">'
    + '<path d="M12.87 15.07l-2.54-2.51.03-.03A17.52 17.52 0 0 0 14.07 6H17V4h-7V2H8v2H1v2h11.17'
    + 'C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56'
    + 'l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12z'
    + 'm-2.62 7l1.62-4.33L19.12 17h-3.24z"/></svg>';

  function set(code) {
    if (code === 'auto') {
      manual = false;
      clearStore();
      current = resolve(navigator.language) || 'en';
    } else {
      code = resolve(code) || 'en';
      manual = true;
      store(code);
      current = code;
    }
    document.documentElement.lang = current;
    applyHead();
    updateBtn();
    renderRows();
    window.dispatchEvent(new CustomEvent('carino:langchange', { detail: { lang: current } }));
    // Again a tick later, once the site's own handler has switched window.t.
    setTimeout(relabel, 0);
  }

  function relabel() { updateBtn(); renderRows(); }

  function label(code) {
    for (var i = 0; i < LANGS.length; i++) if (LANGS[i][0] === code) return LANGS[i][1];
    return 'EN';
  }

  window.CarinoLang = {
    get current() { return current; },
    get mode() { return manual ? 'manual' : 'auto'; },
    set: set,
    resolve: resolve,
  };

  /* ---- UI ---- */

  // The shield link to carino.systems/legal.html (#cnLegal) sits in every
  // header, shared or bespoke. Its tooltip is translated here, the one script
  // all of those headers load, rather than in each site's own dictionary.
  var LEGAL = { en: 'Legal notice & privacy', es: 'Aviso legal y privacidad', 'pt-BR': 'Aviso legal e privacidade',
                ja: '法的通知とプライバシー', ru: 'Правовая информация и конфиденциальность' };

  var TIP = 'Language — Auto follows your browser';
  var L10N = {
    es: { 'Language — Auto follows your browser': 'Idioma: Auto sigue a tu navegador', 'Auto': 'Auto' },
    'pt-BR': { 'Language — Auto follows your browser': 'Idioma: Auto segue o seu navegador', 'Auto': 'Auto' },
    ja: { 'Language — Auto follows your browser': '言語 — 自動はブラウザーの設定に従います', 'Auto': '自動' },
    ru: { 'Language — Auto follows your browser': 'Язык — «Авто» следует настройкам браузера', 'Auto': 'Авто' },
  };
  function tr(s) {
    if (typeof window.t === 'function') {
      try { var v = window.t(s); if (typeof v === 'string' && v && v !== s) return v; } catch (e) { /* not i18n */ }
    }
    var d = L10N[current];
    return (d && d[s]) || s;
  }

  function updateBtn() {
    var btn = document.getElementById('cnLangBtn');
    if (btn) {
      btn.innerHTML = ICON + '<span class="lbl">' + (manual ? label(current) : 'AUTO') + '</span>';
      btn.title = tr(TIP);
      btn.setAttribute('aria-label', btn.title);
    }
    var legal = document.getElementById('cnLegal');
    if (legal) { legal.title = LEGAL[current] || LEGAL.en; legal.setAttribute('aria-label', legal.title); }
  }

  function renderRows() {
    var box = document.getElementById('cnLangBox');
    if (!box) return;
    box.innerHTML = '';
    var auto = document.createElement('button');
    auto.type = 'button';
    auto.className = manual ? '' : 'active';
    auto.innerHTML = '<span>' + tr('Auto') + '</span><span class="code">' + label(resolve(navigator.language) || 'en') + '</span>';
    auto.addEventListener('click', function (e) {
      e.stopPropagation();
      set('auto');
      box.classList.remove('open');
    });
    box.appendChild(auto);
    LANGS.forEach(function (l) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = (manual && l[0] === current) ? 'active' : '';
      b.innerHTML = '<span class="nat" lang="' + l[0] + '">' + l[2] + '</span><span class="code">' + l[1] + '</span>';
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        set(l[0]);
        box.classList.remove('open');
      });
      box.appendChild(b);
    });
  }

  function build(right, beforeEl) {
    if (document.getElementById('cnLangBtn')) return;

    var style = document.createElement('style');
    style.id = 'carino-lang-style';
    style.textContent = CSS;
    document.head.appendChild(style);

    var btn = document.createElement('button');
    btn.id = 'cnLangBtn';
    btn.type = 'button';
    btn.setAttribute('aria-haspopup', 'true');

    if (beforeEl) right.insertBefore(btn, beforeEl); else right.appendChild(btn);
    updateBtn();
    // window.t (the site's i18n.js) loads after this file, still before
    // DOMContentLoaded; adding the listener once that has passed is harmless.
    document.addEventListener('DOMContentLoaded', function () { setTimeout(relabel, 0); });
    setTimeout(relabel, 0);

    var box = document.createElement('div');
    box.id = 'cnLangBox';
    document.body.appendChild(box);
    renderRows();

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      box.classList.toggle('open');
    });
    box.addEventListener('click', function (e) { e.stopPropagation(); });

    // Tap-outside-to-dismiss: WebKit does not bubble a click to document from
    // a non-interactive element, so on iOS the document 'click' below never
    // fires and the menu stays stuck open. touchend always bubbles, so it is
    // the iOS path. Both handlers only ever REMOVE the class, so a desktop
    // browser that emits touchend and then click cannot double-fire into a
    // reopen. The button and the box stop touchend too, so a tap inside is
    // handled by the click handlers rather than closing the menu first.
    function dismiss() { box.classList.remove('open'); }
    btn.addEventListener('touchend', function (e) { e.stopPropagation(); });
    box.addEventListener('touchend', function (e) { e.stopPropagation(); });
    document.addEventListener('touchend', dismiss);
    document.addEventListener('click', dismiss);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') box.classList.remove('open');
    });
  }

  // Attach to whichever header exists: TV's native .header-right, or the
  // injected navbar's .cn-right (carino-navbar.js). Sit LEFT of Sys. Status.
  function tryAttach() {
    var nav = document.getElementById('carinoNav');
    if (nav) {
      var right = nav.querySelector('.cn-right');
      if (right) { build(right, document.getElementById('cnDiagBtn') || right.querySelector('.social-row')); return true; }
    }
    var hr = document.querySelector('.header-right');
    if (hr) { build(hr, document.getElementById('diagToggle') || hr.querySelector('.social-row')); return true; }
    return false;
  }

  function start() {
    if (tryAttach()) return;
    // The navbar self-injects on DOMContentLoaded; both scripts are deferred
    // so order is not guaranteed — watch for it instead of assuming.
    var obs = new MutationObserver(function () {
      if (tryAttach()) obs.disconnect();
    });
    obs.observe(document.body, { childList: true, subtree: true });
    setTimeout(function () { obs.disconnect(); }, 10000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
