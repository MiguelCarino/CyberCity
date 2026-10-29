/* ============================================================
   carino-theme.js — the theme switch: Gold & Black (default) and
   Colourful. Pairs with carino-theme.css.

     <script src="carino-theme.js" data-mark="marks/branding.svg"
             data-mark-color="marks/branding-color.svg" defer></script>

   The no-flash snippet in <head> has already set <html data-carino-theme>
   before first paint; this file owns the switch that changes it. The
   switch is the site's own mark, a real <button role="switch"> inserted
   just left of the navbar's "Carino" (#carinoNav .cn-brand .brand-name),
   without editing carino-navbar.js.

   Persistence (identical to software.carino.systems):
     ?theme=gold|color (also colour) > carino-theme cookie > localStorage
     > gold. The cookie is Path=/, a year, SameSite=Lax, Secure on https,
     and Domain=.carino.systems only on that domain, so a choice made on
     one subdomain carries to the others. ?theme= is for that visit only;
     a click drops it from the URL. Another tab's choice arrives through
     the storage event. Every switch fires carino:themechange {theme}.
   ============================================================ */
(function () {
  'use strict';

  var KEY = 'carino-theme';
  var SCRIPT = document.currentScript;
  var MARK = (SCRIPT && SCRIPT.getAttribute('data-mark')) || 'logo.svg';
  var MARK_COLOR = (SCRIPT && SCRIPT.getAttribute('data-mark-color')) || MARK.replace(/\.svg$/, '-color.svg');
  var META_ID = 'carinoThemeColor';
  var root = document.documentElement;

  // A site's window.t wins; this covers sites with no dictionary of their own.
  var OWN = {
    es: 'Cambiar tema', 'pt-BR': 'Alternar tema', ja: 'テーマを切り替え', ru: 'Сменить тему'
  };
  function label() {
    var key = 'Toggle theme';
    if (typeof window.t === 'function') { var s = window.t(key); if (s && s !== key) return s; }
    var lang = (window.CarinoLang && window.CarinoLang.current) || root.lang || 'en';
    return OWN[lang] || key;
  }

  function current() { return root.getAttribute('data-carino-theme') === 'color' ? 'color' : 'gold'; }
  // The theme a click asked for while its View Transition has not painted it
  // yet, so a quick second click toggles from there instead of being lost.
  var pending = null;

  function remember(t) {
    try { localStorage.setItem(KEY, t); } catch (e) {}
    var domain = /(^|\.)carino\.systems$/.test(location.hostname) ? '; Domain=.carino.systems' : '';
    try {
      document.cookie = KEY + '=' + t + '; Path=/; Max-Age=31536000; SameSite=Lax' + domain +
        (location.protocol === 'https:' ? '; Secure' : '');
    } catch (e) {}
  }

  function isDark() {
    return root.getAttribute('data-theme') !== 'light' && !!window.matchMedia &&
      matchMedia('(prefers-color-scheme: dark)').matches;
  }
  function paintMeta(t) {
    var meta = document.getElementById(META_ID);
    if (meta) meta.content = t === 'gold' ? '#050505' : (isDark() ? '#0e1420' : '#eef3fc');
  }

  function labelSwitch(btn) {
    if (!btn) return;
    // A switch: on means Colourful. Hovering shows the other theme's mark,
    // so the name only has to say what it does.
    btn.setAttribute('aria-checked', current() === 'color' ? 'true' : 'false');
    btn.setAttribute('aria-label', label());
    btn.title = label();
  }

  function apply(t) {
    root.setAttribute('data-carino-theme', t);
    paintMeta(t);
    labelSwitch(document.getElementById('ctSwitch'));
    try { window.dispatchEvent(new CustomEvent('carino:themechange', { detail: { theme: t } })); } catch (e) {}
  }

  function toggle(btn) {
    var next = (pending || current()) === 'gold' ? 'color' : 'gold';
    pending = null;
    remember(next);
    // A ?theme= review link has done its job; drop it so a reload keeps the
    // choice the visitor just made.
    try {
      var url = new URL(location.href);
      if (url.searchParams.has('theme')) {
        url.searchParams.delete('theme');
        history.replaceState(history.state, '', url.pathname + url.search + url.hash);
      }
    } catch (e) {}
    var still = !!window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!document.startViewTransition || still || document.visibilityState !== 'visible') { apply(next); return; }
    // The new theme grows out of the switch as a circle.
    var r = btn.getBoundingClientRect();
    var x = r.left + r.width / 2, y = r.top + r.height / 2;
    root.style.setProperty('--vt-x', x + 'px');
    root.style.setProperty('--vt-y', y + 'px');
    root.style.setProperty('--vt-r', Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y)) + 'px');
    pending = next;
    var vt;
    try { vt = document.startViewTransition(function () { apply(next); }); }
    catch (e) { pending = null; apply(next); return; }
    // A newer click skips this transition; its promises then reject.
    var settle = function () { if (pending === next) pending = null; };
    vt.updateCallbackDone.then(settle, settle);
    vt.ready.catch(function () {});
    vt.finished.catch(function () {});
  }

  // carino-navbar.js builds #carinoNav at DOMContentLoaded; put the switch
  // just left of its "Carino" once it exists. The hub draws its own header
  // inline (.top-header), with the same .brand-name.
  function mount() {
    if (document.getElementById('ctSwitch')) return true;
    var name = document.querySelector('#carinoNav .cn-brand .brand-name') ||
      document.querySelector('.top-header .brand-name');
    if (!name) return false;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'ctSwitch';
    btn.className = 'ct-switch';
    btn.setAttribute('role', 'switch');
    // the site's mark in both colourings; CSS shows the current theme's,
    // and the other one under a pointer
    btn.innerHTML = '<img class="ct-switch-gold" src="' + MARK + '" alt="" width="28" height="28">' +
      '<img class="ct-switch-color" src="' + MARK_COLOR + '" alt="" width="28" height="28">';
    btn.addEventListener('click', function () { toggle(btn); });
    name.parentNode.insertBefore(btn, name);
    labelSwitch(btn);
    // the navbar refits on resize; nudge it now that the brand is wider
    window.dispatchEvent(new Event('resize'));
    return true;
  }
  function whenNavbar() {
    if (mount()) return;
    var mo = new MutationObserver(function () { if (mount()) mo.disconnect(); });
    mo.observe(document.body, { childList: true, subtree: true });
    setTimeout(function () { mo.disconnect(); }, 10000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', whenNavbar);
  else whenNavbar();

  // after the site's i18n has adopted the new language (its listener runs later)
  window.addEventListener('carino:langchange', function () {
    setTimeout(function () { labelSwitch(document.getElementById('ctSwitch')); }, 0);
  });
  // the label needs the site's dictionary, which may load after this file
  document.addEventListener('DOMContentLoaded', function () {
    setTimeout(function () { labelSwitch(document.getElementById('ctSwitch')); }, 0);
  });
  // another open tab switched: follow it (no transition, it is not looking)
  window.addEventListener('storage', function (e) {
    if (e.key !== KEY) return;
    var t = e.newValue === 'color' ? 'color' : e.newValue === 'gold' ? 'gold' : null;
    if (t && t !== current()) apply(t);
  });
  if (window.matchMedia) {
    var mq = matchMedia('(prefers-color-scheme: dark)');
    if (mq.addEventListener) mq.addEventListener('change', function () { paintMeta(current()); });
  }
  paintMeta(current());

  window.CarinoTheme = { current: current, apply: apply };
})();
