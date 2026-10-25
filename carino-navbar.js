/* ============================================================
   carino-navbar.js — the shared Carino navbar, self-injecting.
   ------------------------------------------------------------
   Drop this file into any Carino Systems project and include it:

     <script src="carino-navbar.js" data-app="AppName" data-repo="RepoName" defer></script>

   data-app is the little tag next to the brand; data-repo is the
   GitHub repository the header's GitHub button points at. They
   differ on the few sites whose repo name is longer than the tag
   (Netplan/NetplanConfig, Setup/SimpleSetup, Software/
   SoftwareCatalog, SyncSubs/SyncSubsStudio), so data-repo falls
   back to data-app and, failing that, to the profile page.

   It injects its own (scoped) styles + the canonical top-header
   markup and runs the greeting. The live CLOCK (Local/UTC/Epoch/
   TAI/.beats + click-to-cycle) lives in the companion file
   carino-clock.js, which this script loads from the SAME site — both
   files ship together in every project, so there is no external/CDN
   dependency and each site works standalone/offline. To change the
   clock, edit carino-clock.js and re-copy it to each site (see
   propagate.sh). All styles are scoped under #carinoNav so nothing
   leaks into (or clashes with) the app.

   The Status diagnostics dropdown lives only on carino.systems
   itself — every sub-project's navbar omits it.

   Brand links: "Carino" goes to the hub (carino.systems); the
   app-tag next to it links to the app's own root — clicking it
   acts as a fresh reload of the current site.

   Right-cluster order is fixed by CSS `order`, not by DOM
   position, because four different scripts insert into it and
   none of them can rely on the others having run yet. Read it
   from the right edge inwards — the socials anchor the row and
   language sits immediately beside them:
     1  the app's own controls (.cn-actions)
     2  status     (carino-diag.js, or an app's own toggle)
     3  language   (carino-lang.js)
     4  legal + GitHub + LinkedIn — always last

   The shield in that last group opens carino.systems/legal.html, the one
   legal notice, privacy and cookie page for every site. carino-lang.js
   translates its tooltip (it finds the link by its id, #cnLegal).
   The legal page itself leaves the shield out.

   Fitting. The brand must never be squeezed out and the clock must stay
   readable, at any width. When the right cluster would do either, items
   fold into a generated "⋯" menu, in this order: first the legal/GitHub/
   LinkedIn row; then the clock steps aside (as it already does below
   900px), because an app's controls matter more than the time; last, the
   app's own controls. Controls marked
   data-priority="1" stay in the bar (an app's one main action), and
   data-priority="2" ones too while there is room (a Live page's source
   badge); without any mark, the first .btn-primary / .primary control
   stays. If even those squeeze the brand, priority 2 folds, then 1. The real
   nodes move (never clones) and return when there is room again, and the
   menu sits inside #carinoNav, so `#carinoNav .cn-actions …` rules still
   apply. If an app has moved .cn-actions somewhere else itself (Topo's
   drawer), it is left alone.

   Immersive mode (Games and ambient pages). Opt in on the script tag:
     <script src="carino-navbar.js" data-app="…" data-immersive defer>
   (data-immersive="5000" sets the idle delay in ms; 3000 by default). In
   fullscreen, or after that long without the pointer near the top, the bar
   slides away; moving the pointer to the top edge, focusing into it or
   pressing Esc brings it back. On touch screens it only hides in
   fullscreen. Under reduced motion it hides and shows without sliding.
   Each change fires `carino:navbar` with detail {hidden}. A page that
   needs it only some of the time (Asobi: while a game is open, not on
   its scrolling chooser) switches it at run time instead:
   window.CarinoNav.immersive(true | false).
   ============================================================ */
(function () {
  'use strict';

  var SCRIPT = document.currentScript;
  var TAG = (SCRIPT && SCRIPT.getAttribute('data-app')) || '';
  // The GitHub button points at THIS project's repository, not the profile.
  var REPO = (SCRIPT && SCRIPT.getAttribute('data-repo')) || TAG;
  var GH_URL = 'https://github.com/MiguelCarino' + (REPO ? '/' + REPO : '');
  var CLOCK_SRC = 'carino-clock.js'; // local copy shipped in each site (no CDN)

  var CSS = ''
    + '#carinoNav{--cn-accent:#eab308;--cn-bg:#050505;--cn-border:#262626;--cn-text:#fff;--cn-muted:#8a8a8a;'
    + '--cn-mono:"IBM Plex Mono",ui-monospace,SFMono-Regular,Menlo,monospace;'
    + '--cn-sans:"IBM Plex Sans",system-ui,-apple-system,sans-serif;'
    + 'height:60px;flex-shrink:0;box-sizing:border-box;background:linear-gradient(180deg,#0f0f0f 0%,#050505 100%);'
    + 'border-bottom:1px solid var(--cn-border);display:flex;align-items:center;justify-content:space-between;'
    + 'gap:16px;padding:0 20px;position:relative;z-index:2147483000;font-family:var(--cn-sans);}'
    + '#carinoNav *,#carinoNav *::before,#carinoNav *::after{box-sizing:border-box;}'
    + '#carinoNav .cn-left{display:flex;align-items:center;gap:18px;min-width:0;flex:1 1 auto;overflow:hidden;}'
    + '#carinoNav .cn-right{display:flex;align-items:center;gap:10px;flex-shrink:0;}'
    + '#carinoNav .brand-name{font-family:"Red Hat Display",var(--cn-sans);font-weight:900;font-size:1.5rem;line-height:1;'
    + 'background:linear-gradient(130deg,#fef08a 0%,#eab308 50%,#b45309 100%);-webkit-background-clip:text;background-clip:text;'
    + '-webkit-text-fill-color:transparent;text-decoration:none;white-space:nowrap;cursor:pointer;}'
    + '#carinoNav .cn-brand{display:flex;align-items:center;flex-shrink:0;}'
    + '#carinoNav .app-tag{-webkit-text-fill-color:var(--cn-accent);color:var(--cn-accent);font-family:var(--cn-mono);'
    + 'font-size:.6rem;font-weight:700;letter-spacing:.14em;text-transform:uppercase;border:1px solid var(--cn-border);'
    + 'border-radius:4px;padding:3px 6px;margin-left:10px;text-decoration:none;transition:.2s;}'
    + '#carinoNav .app-tag:hover{border-color:var(--cn-accent);background:rgba(234,179,8,.12);}'
    + '#carinoNav .app-tag:empty{display:none;}'
    + '#carinoNav .header-clock{display:flex;align-items:baseline;gap:8px;border-left:1px solid var(--cn-border);padding-left:18px;min-width:0;overflow:hidden;cursor:pointer;user-select:none;}'
    + '#carinoNav .header-clock:hover .clock-tz{filter:brightness(1.12);}'
    + '#carinoNav .clock-time{font-family:var(--cn-mono);font-size:1.05rem;font-weight:700;color:var(--cn-text);flex-shrink:0;}'
    + '#carinoNav .clock-tz{font-family:var(--cn-mono);font-size:.58rem;font-weight:700;color:#050505;background:var(--cn-accent);padding:2px 5px;border-radius:3px;flex-shrink:0;}'
    + '#carinoNav .brand-greeting{font-family:var(--cn-mono);font-size:.68rem;color:var(--cn-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;}'
    + '#carinoNav .social-row{display:flex;gap:8px;}'
    + '#carinoNav .icon-btn{width:32px;height:32px;border:1px solid var(--cn-border);border-radius:4px;display:flex;'
    + 'align-items:center;justify-content:center;color:var(--cn-muted);transition:.2s;text-decoration:none;background:transparent;cursor:pointer;}'
    + '#carinoNav .icon-btn:hover{border-color:var(--cn-accent);color:#050505;background:var(--cn-accent);transform:translateY(-2px);box-shadow:0 4px 12px rgba(234,179,8,.18);}'
    + '#carinoNav .icon-btn svg{width:15px;height:15px;}'
    + '#carinoNav .cn-right{gap:12px;min-width:0;}'
    + '#carinoNav .cn-actions{display:flex;align-items:center;gap:8px;flex-wrap:nowrap;min-width:0;}'
    // Slot order, independent of which script inserted what first.
    + '#carinoNav .cn-right > *{order:1;}'
    + '#carinoNav .cn-right > #cnDiagBtn,#carinoNav .cn-right > .status-toggle{order:2;}'
    + '#carinoNav .cn-right > #cnLangBtn{order:3;}'
    + '#carinoNav .cn-right > .social-row{order:4;}'
    // The divider only makes sense when something sits to the left of it;
    // :only-child covers the sites that ship neither language nor actions.
    + '#carinoNav .cn-right > .social-row:not(:only-child){border-left:1px solid var(--cn-border);padding-left:12px;}'
    + '@media(max-width:900px){#carinoNav .header-clock{display:none;}}'
    + '@media(max-width:640px){#carinoNav .app-tag{display:none;}}'
    // Fitting: the "⋯" button and the menu the folded items move into.
    + '#carinoNav .cn-right > .cn-keep{order:1;display:flex;align-items:center;gap:8px;}'
    + '#carinoNav .cn-right > .cn-more{order:5;}'
    + '#carinoNav .cn-more[hidden],#carinoNav .cn-keep:empty{display:none;}'
    + '#carinoNav.cn-noclock .header-clock{display:none;}'
    + '#carinoNav .cn-more[aria-expanded="true"]:not(:hover){border-color:var(--cn-accent);color:var(--cn-accent);}'
    + '#carinoNav .cn-more-menu{position:absolute;top:calc(100% + 6px);right:12px;z-index:3;display:flex;flex-direction:column;'
    + 'align-items:stretch;gap:12px;min-width:220px;max-width:min(360px,calc(100vw - 24px));max-height:calc(100dvh - 80px);overflow:auto;'
    + 'padding:12px;background:#0b0b0b;border:1px solid rgba(234,179,8,.3);border-radius:8px;box-shadow:0 18px 40px rgba(0,0,0,.7);}'
    + '#carinoNav .cn-more-menu[hidden]{display:none;}'
    + '#carinoNav .cn-more-menu .cn-actions{flex-wrap:wrap;overflow:visible;gap:8px;}'
    + '#carinoNav .cn-more-menu .social-row{border:0;padding:0;margin:0;justify-content:flex-start;}'
    + '#carinoNav .cn-more-menu .social-row:not(:first-child){border-top:1px solid var(--cn-border);padding-top:12px;}'
    // Immersive: collapse the bar's own height so the stage below takes it.
    + '#carinoNav{transition:margin-top .25s ease,opacity .25s ease;}'
    + '#carinoNav.cn-immersed{margin-top:-60px;opacity:0;pointer-events:none;}'
    + '@media(prefers-reduced-motion:reduce){#carinoNav{transition:none;}}';

  var GH = 'M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22';
  var LI = 'M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z';
  var SHIELD = 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z';
  var LEGAL_URL = 'https://carino.systems/legal.html';
  var LEGAL = 'Legal notice & privacy';

  var MARKUP = ''
    + '<header class="top-header" id="carinoNav">'
    + '<div class="cn-left">'
    + '<span class="cn-brand">'
    + '<a class="brand-name" href="https://carino.systems/" title="Carino Systems — back to hub">Carino</a>'
    + '<a class="app-tag" href="./"></a>'
    + '</span>'
    + '<div class="header-clock">'
    + '<span class="clock-time">00:00:00</span>'
    + '<span class="clock-tz">LOCAL</span>'
    + '<span class="brand-greeting" id="cnGreeting">Ready.</span>'
    + '</div></div>'
    + '<div class="cn-right">'
    + '<div class="social-row">'
    + '<a href="' + LEGAL_URL + '" class="icon-btn" id="cnLegal" title="' + LEGAL + '" aria-label="' + LEGAL + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="' + SHIELD + '"></path></svg></a>'
    + '<a href="' + GH_URL + '" target="_blank" rel="noopener" class="icon-btn" title="' + (REPO ? REPO + ' on GitHub' : 'GitHub') + '" aria-label="GitHub"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="' + GH + '"></path></svg></a>'
    + '<a href="https://www.linkedin.com/in/miguelcarino94/" target="_blank" rel="noopener" class="icon-btn" title="LinkedIn" aria-label="LinkedIn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="' + LI + '"></path><rect x="2" y="9" width="4" height="12"></rect><circle cx="4" cy="4" r="2"></circle></svg></a>'
    + '</div>'
    + '</div>'
    + '</header>';

  function set(id, v) { var el = document.getElementById(id); if (el) el.textContent = v; }

  // Greeting stays local to the navbar; the clock is owned by carino-clock.js.
  // Routed through window.t so the greeting follows the fleet language.
  // i18n.js is deferred and may not have run yet, hence the guard; the
  // langchange listener re-renders it when the visitor switches language.
  function greet() {
    var h = new Date().getHours();
    var s = h < 5 ? 'Late shift.' : h < 12 ? 'Good morning.' : h < 18 ? 'Good afternoon.' : 'Good evening.';
    set('cnGreeting', (typeof window.t === 'function') ? window.t(s) : s);
  }
  window.addEventListener('carino:langchange', greet);
  // carino-navbar.js is deferred and executes BEFORE i18n.js, so window.t does
  // not exist yet when inject() first calls greet(). Each site's i18n.js adopts
  // the fleet locale in its own DOMContentLoaded handler, registered after this
  // one — so re-render on a timeout, once every handler has finished.
  document.addEventListener('DOMContentLoaded', function () { setTimeout(greet, 0); });

  function loadClockModule() {
    if (document.querySelector('script[data-carino-clock]')) return;
    var s = document.createElement('script');
    s.src = CLOCK_SRC;
    s.async = true;
    s.setAttribute('data-carino-clock', '');
    document.head.appendChild(s);
  }

  // Move an app's own header controls INTO the navbar's right cluster so there
  // is a single top bar. The real DOM nodes are moved (not cloned), so their
  // event handlers and ids are preserved. An app can opt in explicitly with
  // [data-carino-actions] (the controls) + [data-carino-strip] (the now-empty
  // wrapper to delete); otherwise we auto-detect the leftover `header.cs-header`
  // bar that this migration leaves as a direct child of <body>.
  function relocateActions(nav) {
    var actions = document.querySelector('[data-carino-actions]');
    var strip = document.querySelector('[data-carino-strip]');
    if (!actions) {
      var old = document.querySelector('body > header.cs-header');
      if (old) { actions = old.querySelector('.cs-right') || old; strip = old; }
    }
    if (actions) {
      actions.classList.add('cn-actions');
      var right = nav.querySelector('.cn-right');
      right.insertBefore(actions, right.querySelector('.social-row'));
    }
    if (strip && strip !== actions && strip.parentNode) strip.remove();
  }

  // ---- fitting ----------------------------------------------------------
  // Stage 0: everything in the bar. Stage 1: the socials row folds into the
  // menu. Stage 2: the clock steps aside. Stage 3: the app's controls fold
  // too, except the kept ones. Stage 4: the kept ones fold as well, since
  // the brand comes first. Each stage is tried from 0 upward and the first
  // that fits wins.
  var fitting = false, fitQueued = false, fitPending = false, fitObserver = null;

  function moreLabel() { return (typeof window.t === 'function') ? window.t('More') : 'More'; }

  function ensureMore(nav) {
    var btn = nav.querySelector('.cn-more');
    if (btn) return btn;
    btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'icon-btn cn-more';
    // An SVG like its neighbours, not a text glyph a site's font may lack.
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true"><circle cx="5" cy="12" r="1.9"></circle><circle cx="12" cy="12" r="1.9"></circle><circle cx="19" cy="12" r="1.9"></circle></svg>';
    btn.hidden = true;
    btn.setAttribute('aria-haspopup', 'true');
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-controls', 'cnMoreMenu');
    var menu = document.createElement('div');
    menu.className = 'cn-more-menu';
    menu.id = 'cnMoreMenu';
    menu.hidden = true;
    var keep = document.createElement('div');
    // .cn-actions too, so an app's `#carinoNav .cn-actions …` rules still reach a kept control
    keep.className = 'cn-keep cn-actions';
    var right = nav.querySelector('.cn-right');
    right.appendChild(keep);
    right.appendChild(btn);
    nav.appendChild(menu);
    function label() { var l = moreLabel(); btn.title = l; btn.setAttribute('aria-label', l); }
    label();
    window.addEventListener('carino:langchange', label);
    document.addEventListener('DOMContentLoaded', function () { setTimeout(label, 0); });
    function open(on) {
      menu.hidden = !on;
      btn.setAttribute('aria-expanded', on ? 'true' : 'false');
    }
    btn.addEventListener('click', function (e) { e.stopPropagation(); open(menu.hidden); });
    document.addEventListener('click', function (e) {
      if (menu.hidden || menu.contains(e.target)) return;
      open(false);
    });
    // A button or link inside the menu does its job and closes it; form
    // fields (selects, inputs) keep it open while they are in use.
    menu.addEventListener('click', function (e) {
      var hit = e.target.closest && e.target.closest('button,a');
      // a toggle for something nested (a dropdown, a disclosure) keeps it open
      if (hit && !hit.closest('select,label') && !hit.hasAttribute('aria-haspopup') && !hit.hasAttribute('aria-expanded')) {
        setTimeout(function () { open(false); }, 0);
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !menu.hidden) { open(false); btn.focus(); }
    });
    return btn;
  }

  // Each moved node leaves a comment behind, so it returns to its exact spot.
  function park(node, dest) {
    if (!node || node.__cnHome) return;
    var mark = document.createComment('cn-home');
    node.parentNode.insertBefore(mark, node);
    node.__cnHome = mark;
    dest.appendChild(node);
  }
  function unpark(node) {
    var mark = node && node.__cnHome;
    if (!mark) return;
    if (mark.parentNode) mark.parentNode.insertBefore(node, mark), mark.remove();
    node.__cnHome = null;
  }

  function keptControls(actions) {
    var marked = actions.querySelectorAll('[data-priority="1"],[data-priority="2"]');
    if (marked.length) return Array.prototype.slice.call(marked);
    var first = actions.querySelector('.btn-primary,.primary,.cs-btn.primary');
    return first ? [first] : [];
  }

  function cramped(nav) {
    // Positions, not widths: an app may put its own button before the brand.
    var left = nav.querySelector('.cn-left').getBoundingClientRect();
    var brand = nav.querySelector('.cn-brand').getBoundingClientRect();
    if (brand.right > left.right + 1 || brand.right > window.innerWidth) return true;
    if (nav.scrollWidth > nav.clientWidth + 1) return true;
    var clock = nav.querySelector('.header-clock');
    if (clock && clock.offsetParent !== null && clock.clientWidth + 1 < clock.scrollWidth) {
      // the clock may give up its greeting, but never the time itself
      var time = clock.querySelector('.clock-time'), tz = clock.querySelector('.clock-tz');
      var need = (time ? time.offsetWidth : 0) + (tz ? tz.offsetWidth : 0) + 26;
      if (clock.clientWidth < need) return true;
    }
    return false;
  }

  // Moving a field someone is typing in would drop the caret (and a phone's
  // keyboard resizes the window), so wait until focus leaves it.
  function typingInNav(nav) {
    var a = document.activeElement;
    return !!(a && nav.contains(a) && a.matches('input,select,textarea,[contenteditable="true"]'));
  }

  function fit() {
    var nav = document.getElementById('carinoNav');
    if (!nav || fitting) return;
    if (typingInNav(nav)) { fitPending = true; return; }
    fitting = true;
    try {
      var right = nav.querySelector('.cn-right');
      var more = ensureMore(nav);
      var menu = nav.querySelector('.cn-more-menu');
      var keep = right.querySelector('.cn-keep');
      var socials = nav.querySelector('.social-row');
      var actions = nav.querySelector('.cn-actions:not(.cn-keep)');
      // An app that moved its controls out of the bar owns them now.
      var ownActions = actions && (actions.parentNode === right || actions.parentNode === menu);
      // Back to stage 0.
      Array.prototype.slice.call(keep.children).forEach(unpark);
      if (ownActions) unpark(actions);
      unpark(socials);
      nav.classList.remove('cn-noclock');
      more.hidden = true;
      if (!cramped(nav)) { menu.hidden = true; more.setAttribute('aria-expanded', 'false'); return; }
      // Stage 1.
      more.hidden = false;
      park(socials, menu);
      if (!cramped(nav)) return;
      // Stage 2.
      nav.classList.add('cn-noclock');
      if (!cramped(nav) || !ownActions) return;
      // Stage 3: the whole controls block folds, the kept controls stay out.
      keptControls(actions).forEach(function (el) { park(el, keep); });
      menu.insertBefore(actions, menu.firstChild);
      var mark = document.createComment('cn-home');
      right.insertBefore(mark, keep);
      actions.__cnHome = mark;
      // Stage 4: the brand comes before even the kept controls: priority 2
      // folds first, then priority 1.
      ['2', '1'].forEach(function (rank) {
        if (!cramped(nav)) return;
        Array.prototype.slice.call(keep.children).forEach(function (el) {
          if (el.getAttribute('data-priority') === rank || rank === '1') unpark(el);
        });
      });
    } finally {
      // The moves above are this function's own; don't let them refit again.
      if (fitObserver) fitObserver.takeRecords();
      fitting = false;
    }
  }

  function queueFit() {
    if (fitQueued) return;
    fitQueued = true;
    requestAnimationFrame(function () { fitQueued = false; fit(); });
  }

  function watchFit(nav) {
    window.addEventListener('resize', queueFit);
    window.addEventListener('carino:langchange', queueFit);
    // carino-lang.js, carino-diag.js and the app add to the bar after this
    // runs, and apps show or hide their own controls; refit on any of it.
    // Only the right cluster and the menu are watched (the clock ticks every
    // second on the left), and text changes are ignored: a live readout in
    // an app's controls would otherwise refit on every update.
    if (window.MutationObserver) {
      ensureMore(nav);
      var menuEl = nav.querySelector('.cn-more-menu'), moreEl = nav.querySelector('.cn-more');
      fitObserver = new MutationObserver(function (records) {
        if (fitting) return;
        // opening and closing the menu is not a change in what has to fit
        for (var i = 0; i < records.length; i++) {
          if (records[i].target !== menuEl && records[i].target !== moreEl) { queueFit(); return; }
        }
      });
      var opts = { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden', 'style'] };
      fitObserver.observe(nav.querySelector('.cn-right'), opts);
      fitObserver.observe(nav.querySelector('.cn-more-menu'), opts);
    }
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(queueFit);
    window.addEventListener('load', queueFit);
    nav.addEventListener('focusout', function () {
      if (fitPending) { fitPending = false; setTimeout(queueFit, 0); }
    });
    queueFit();
  }

  // ---- immersive -------------------------------------------------------
  function immersive(nav) {
    var enabled = !!(SCRIPT && SCRIPT.hasAttribute('data-immersive'));
    var delay = (SCRIPT && parseInt(SCRIPT.getAttribute('data-immersive'), 10)) || 3000;
    var coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    var timer = null, hidden = false;
    function set(h) {
      if (h === hidden) return;
      hidden = h;
      nav.classList.toggle('cn-immersed', h);
      try { window.dispatchEvent(new CustomEvent('carino:navbar', { detail: { hidden: h } })); } catch (e) {}
    }
    function busy() {
      var menu = nav.querySelector('.cn-more-menu');
      return nav.contains(document.activeElement) || (menu && !menu.hidden) || nav.matches(':hover');
    }
    function arm() {
      clearTimeout(timer);
      if (!enabled || (coarse && !document.fullscreenElement)) return;
      timer = setTimeout(function () { if (!busy()) set(true); else arm(); }, document.fullscreenElement ? 1200 : delay);
    }
    function show() { set(false); arm(); }
    window.CarinoNav = window.CarinoNav || {};
    window.CarinoNav.immersive = function (on) {
      enabled = !!on;
      if (enabled) arm(); else { clearTimeout(timer); set(false); }
    };
    document.addEventListener('mousemove', function (e) {
      if (!enabled) return;
      if (e.clientY < 70) show(); else if (!hidden) arm();
    }, { passive: true });
    nav.addEventListener('focusin', function () { if (enabled) show(); });
    document.addEventListener('keydown', function (e) { if (enabled && e.key === 'Escape') show(); });
    document.addEventListener('fullscreenchange', function () {
      if (!enabled) return;
      if (document.fullscreenElement) arm(); else show();
    });
    arm();
  }

  function inject() {
    if (document.getElementById('carinoNav')) return;
    var style = document.createElement('style');
    style.id = 'carino-nav-style';
    style.textContent = CSS;
    document.head.appendChild(style);
    var wrap = document.createElement('div');
    wrap.innerHTML = MARKUP;
    var nav = wrap.firstElementChild;
    document.body.insertBefore(nav, document.body.firstChild);
    if (TAG) { var t = nav.querySelector('.app-tag'); if (t) { t.textContent = TAG; t.title = TAG + ' — reload'; } }
    // On the legal page itself the shield would only link back to this page.
    if (/\/legal(\.html)?$/.test(location.pathname)) {
      var legal = nav.querySelector('#cnLegal');
      if (legal) legal.remove();
    }
    relocateActions(nav);
    watchFit(nav);
    immersive(nav);
    greet();
    setInterval(greet, 60000);
    loadClockModule();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', inject);
  else inject();
})();
