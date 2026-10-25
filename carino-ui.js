/* ============================================================
   carino-ui.js — the behaviour half of carino-ui.css.
   Canonical copy: Branding/carino-ui.js; Carino-Systems/propagate.sh
   copies it into each site. Load it deferred, after carino-navbar.js:
     <script src="carino-ui.js" defer></script>

   Three pieces, all opt-in by markup, so loading the file on a page that
   uses none of them does nothing:

   1. Workspace drawer. Below 900px .ws-rail is an off-canvas drawer.
      Any [data-ws-toggle] button opens and closes it; the scrim, Esc and
      growing past 900px close it. The scrim is created here.

   2. Slice router. A Suite's (or Learning's) modules are addressable as
      #<module>, with extra parameters after "&": #edit&sample=ct, and a
      place inside a module after "/": #sha2/stage-3 (as params.path).
        CarinoUI.slices({
          menu: document.querySelector('.slice-menu'),   // .slice[data-id] inside
          onRoute(id, params) { … },                     // id null = overview
          collapsed: true,   // optional: start collapsed (modules share one input)
        });
      Clicking a slice only sets location.hash; hashchange drives
      everything, so Back, bookmarks and shared links all land right.
      It keeps body.state-overview / body.state-module and .active in step.

   3. Export menu. Every .cs-menu: its [aria-haspopup] button opens the
      .cs-menu-panel; choosing an item, clicking away or Esc closes it.
      Items keep their own handlers; the menu only governs visibility.
   ============================================================ */
(function () {
  'use strict';
  var WS_MQ = window.matchMedia('(max-width: 900px)');

  function initDrawer(ws) {
    if (ws.dataset.wsReady) return;
    ws.dataset.wsReady = '1';
    var scrim = ws.querySelector('.ws-scrim');
    if (!scrim) {
      scrim = document.createElement('div');
      scrim.className = 'ws-scrim';
      ws.appendChild(scrim);
    }
    var toggles = function () {
      return document.querySelectorAll('[data-ws-toggle]');
    };
    function set(open) {
      ws.classList.toggle('drawer-open', open);
      toggles().forEach(function (b) { b.setAttribute('aria-expanded', open ? 'true' : 'false'); });
    }
    // Delegated, so a toggle the navbar relocates (data-carino-actions) keeps working.
    document.addEventListener('click', function (e) {
      var t = e.target.closest && e.target.closest('[data-ws-toggle]');
      if (t) { e.preventDefault(); set(!ws.classList.contains('drawer-open')); }
    });
    scrim.addEventListener('click', function () { set(false); });
    window.addEventListener('keydown', function (e) { if (e.key === 'Escape') set(false); });
    var onMq = function () { if (!WS_MQ.matches) set(false); };
    if (WS_MQ.addEventListener) WS_MQ.addEventListener('change', onMq);
    else if (WS_MQ.addListener) WS_MQ.addListener(onMq); // older Safari
    set(false);
  }

  function parseHash() {
    var raw = decodeURIComponent(location.hash.replace(/^#/, ''));
    var parts = raw.split('&');
    var params = {};
    // A path inside a module (#hash-family/stage-3, #module/lab) travels as
    // params.path; the module id is what comes before the first "/".
    var slash = parts[0].indexOf('/');
    if (slash >= 0) { params.path = parts[0].slice(slash + 1); parts[0] = parts[0].slice(0, slash); }
    parts.slice(1).forEach(function (p) {
      if (!p) return;
      var i = p.indexOf('=');
      if (i < 0) params[p] = true;
      else params[p.slice(0, i)] = p.slice(i + 1);
    });
    return { id: parts[0] || null, params: params };
  }

  function slices(opts) {
    var menu = opts && opts.menu;
    if (!menu) return null;
    var ids = function () {
      return Array.prototype.map.call(menu.querySelectorAll('.slice[data-id]'), function (s) { return s.dataset.id; });
    };
    menu.addEventListener('click', function (e) {
      var s = e.target.closest && e.target.closest('.slice[data-id]');
      if (!s) return;
      e.preventDefault();
      if (parseHash().id !== s.dataset.id) location.hash = '#' + s.dataset.id;
    });
    function route() {
      var h = parseHash();
      var id = ids().indexOf(h.id) >= 0 ? h.id : null;
      document.body.classList.toggle('state-module', !!id);
      document.body.classList.toggle('state-overview', !id);
      menu.classList.toggle('collapsed', !!id || !!opts.collapsed);
      Array.prototype.forEach.call(menu.querySelectorAll('.slice[data-id]'), function (s) {
        var on = s.dataset.id === id;
        s.classList.toggle('active', on);
        if (on) s.setAttribute('aria-current', 'page'); else s.removeAttribute('aria-current');
        if (on && s.scrollIntoView && menu.scrollWidth > menu.clientWidth) s.scrollIntoView({ block: 'nearest', inline: 'center' });
      });
      if (typeof opts.onRoute === 'function') opts.onRoute(id, h.params);
    }
    window.addEventListener('hashchange', route);
    route();
    return { route: route, go: function (id) { location.hash = id ? '#' + id : '#'; } };
  }

  function initMenu(m) {
    if (m.dataset.menuReady) return;
    m.dataset.menuReady = '1';
    var btn = m.querySelector('[aria-haspopup]'), panel = m.querySelector('.cs-menu-panel');
    if (!btn || !panel) return;
    var isOpen = function () { return !panel.hidden; };
    function set(open) { panel.hidden = !open; btn.setAttribute('aria-expanded', open ? 'true' : 'false'); }
    btn.addEventListener('click', function (e) { e.stopPropagation(); set(!isOpen()); });
    panel.addEventListener('click', function (e) { if (e.target.closest('.cs-menu-item')) set(false); });
    document.addEventListener('click', function (e) { if (isOpen() && !m.contains(e.target)) set(false); });
    window.addEventListener('keydown', function (e) { if (e.key === 'Escape' && isOpen()) { set(false); btn.focus(); } });
    set(false);
  }

  function boot() {
    Array.prototype.forEach.call(document.querySelectorAll('.ws'), initDrawer);
    Array.prototype.forEach.call(document.querySelectorAll('.cs-menu'), initMenu);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.CarinoUI = { slices: slices, drawer: initDrawer, menu: initMenu, parseHash: parseHash };
})();
