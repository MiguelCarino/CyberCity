/* ============================================================
   carino-ui.js — the behaviour half of carino-ui.css.
   Canonical copy: Branding/carino-ui.js; Carino-Systems/propagate.sh
   copies it into each site. Load it deferred, after carino-navbar.js:
     <script src="carino-ui.js" defer></script>

   Four pieces, all opt-in by markup or call, so loading the file on a
   page that uses none of them does nothing:

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

   4. Modal. Works on both markups: a .modal-scrim[hidden] holding a
      .modal, or a native <dialog class="modal">. Pass the scrim, the
      .modal inside it, the <dialog>, or an element id.
        CarinoUI.modal.open(el, {
          returnFocus: btn,      // optional: default is what had focus
          onDismiss(reason) { … }, // optional: Esc / scrim / [data-close]
          onClose(reason) { … },   // optional: after it has closed
        });
        CarinoUI.modal.close(el);  // also .isOpen(el), .top()
      Open moves focus to the first control inside (or the card itself)
      and keeps Tab inside (a card holding an iframe gets two hidden
      focus edges, so Tab out of the iframe wraps back too). Esc, a click on the scrim or ::backdrop, and
      any [data-close] button inside dismiss the topmost modal: without
      onDismiss that closes it; with onDismiss the page decides (confirm
      unsaved changes, then call close). Close restores focus to the
      opener and fires "carino:modalclose" on the scrim or <dialog>
      (detail.reason: "escape", "backdrop", "button" or whatever was
      passed to close). A page with its own Esc handler leaves Esc alone
      while CarinoUI.modal.top() is set, or calls preventDefault() when it
      handles the key itself; this one skips a prevented Esc.
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

  // ---- 4. Modal ----
  var FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])';
  var stack = []; // open modals, topmost last: { root, box, opts, back }

  // root = what is shown and hidden (the scrim or the <dialog>); box = the card.
  function resolve(el) {
    if (typeof el === 'string') el = document.getElementById(el);
    if (!el) return null;
    if (el.tagName === 'DIALOG') return { root: el, box: el };
    var scrim = el.classList.contains('modal-scrim') ? el : el.closest('.modal-scrim');
    if (!scrim) return null;
    return { root: scrim, box: scrim.querySelector('.modal') || scrim };
  }
  function entryOf(root) {
    for (var i = stack.length - 1; i >= 0; i--) if (stack[i].root === root) return stack[i];
    return null;
  }
  function focusables(box) {
    return Array.prototype.filter.call(box.querySelectorAll(FOCUSABLE), function (n) {
      return n.getClientRects().length > 0 && !n.hasAttribute('data-modal-sentinel');
    });
  }
  // Tab out of a cross-origin iframe never reaches our keydown, so a focusable
  // edge at each end of the card catches it and wraps it back inside.
  function sentinel(box, edge) {
    var s = document.createElement('span');
    s.tabIndex = 0;
    s.setAttribute('data-modal-sentinel', edge);
    s.setAttribute('aria-hidden', 'true');
    s.style.position = 'fixed'; s.style.top = '0'; s.style.left = '0';
    s.style.width = '1px'; s.style.height = '1px'; s.style.overflow = 'hidden';
    s.style.opacity = '0'; s.style.pointerEvents = 'none';
    if (edge === 'start') box.insertBefore(s, box.firstChild); else box.appendChild(s);
    return s;
  }
  function dismiss(entry, reason) {
    if (typeof entry.opts.onDismiss !== 'function') { closeModal(entry.root, reason); return; }
    // The page's own close path calls close(el) with no reason; it gets this one.
    entry.reason = reason;
    try { entry.opts.onDismiss(reason); } finally { entry.reason = null; }
  }
  function wireModal(m) {
    if (m.root.dataset.modalReady) return;
    m.root.dataset.modalReady = '1';
    // A scrim click counts only when the press started on the scrim too, so
    // selecting text in the card and releasing outside does not close it.
    var downOnRoot = false;
    m.root.addEventListener('pointerdown', function (e) { downOnRoot = e.target === m.root; });
    m.root.addEventListener('click', function (e) {
      var entry = entryOf(m.root);
      if (!entry) return;
      var x = e.target.closest && e.target.closest('[data-close]');
      if (x && m.root.contains(x)) { dismiss(entry, 'button'); return; }
      if (e.target !== m.root || !downOnRoot) return;
      if (m.root.tagName === 'DIALOG') {
        // The <dialog> is the card, so only a click outside its box is the backdrop.
        var r = m.root.getBoundingClientRect();
        if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) return;
      }
      dismiss(entry, 'backdrop');
    });
    if (m.root.tagName === 'DIALOG') {
      m.root.addEventListener('cancel', function (e) {
        e.preventDefault();
        var entry = entryOf(m.root);
        if (entry) dismiss(entry, 'escape');
      });
      // dialog.close() or a <form method="dialog"> closes without us: tidy up.
      // The event is queued, so it can arrive after closeModal has already
      // run and the page has opened the dialog again; that one is stale.
      m.root.addEventListener('close', function () {
        if (entryOf(m.root) && !m.root.open) closeModal(m.root, m.root.returnValue || 'native');
      });
    }
  }
  function openModal(el, opts) {
    var m = resolve(el);
    if (!m) return null;
    opts = opts || {};
    var open = entryOf(m.root);
    if (open) {
      open.opts = opts;
      // Closed natively a moment ago, its 'close' event not yet handled: show it again.
      if (m.root.tagName === 'DIALOG' && !m.root.open) m.root.showModal();
      return m.root;
    }
    wireModal(m);
    var prev = document.activeElement;
    var back = opts.returnFocus || (prev && prev !== document.body ? prev : null);
    var edges = m.box.querySelector('iframe') ? [sentinel(m.box, 'start'), sentinel(m.box, 'end')] : [];
    stack.push({ root: m.root, box: m.box, opts: opts, back: back, edges: edges });
    if (m.root.tagName === 'DIALOG') { if (!m.root.open) m.root.showModal(); }
    else m.root.hidden = false;
    // The page may focus a particular field right after this.
    var f = focusables(m.box);
    if (f.length) f[0].focus({ preventScroll: true });
    else {
      if (!m.box.hasAttribute('tabindex')) m.box.setAttribute('tabindex', '-1');
      m.box.focus({ preventScroll: true });
    }
    return m.root;
  }
  function closeModal(el, reason) {
    var m = resolve(el);
    var entry = m && entryOf(m.root);
    if (!entry) return;
    stack.splice(stack.indexOf(entry), 1);
    entry.edges.forEach(function (s) { if (s.parentNode) s.parentNode.removeChild(s); });
    var active = document.activeElement;
    var hadFocus = !active || active === document.body || m.root.contains(active);
    if (m.root.tagName === 'DIALOG') { if (m.root.open) m.root.close(); }
    else m.root.hidden = true;
    // A modal opened from inside this one returns to this one's opener.
    stack.forEach(function (o) { if (o.back && m.root.contains(o.back)) o.back = entry.back; });
    var back = entry.back;
    if (hadFocus && back && document.contains(back) && back.focus) back.focus({ preventScroll: true });
    reason = reason || entry.reason || 'close';
    if (typeof entry.opts.onClose === 'function') entry.opts.onClose(reason);
    m.root.dispatchEvent(new CustomEvent('carino:modalclose', { bubbles: true, detail: { reason: reason } }));
  }
  function topModal() { return stack.length ? stack[stack.length - 1].root : null; }

  // Capture phase, so the modal answers Esc before the drawer or a menu does.
  window.addEventListener('keydown', function (e) {
    var entry = stack[stack.length - 1];
    if (!entry) return;
    if (e.key === 'Escape') {
      if (e.defaultPrevented) return;
      e.preventDefault();
      e.stopPropagation();
      dismiss(entry, 'escape');
      return;
    }
    if (e.key !== 'Tab') return;
    var f = focusables(entry.box);
    if (!f.length) { e.preventDefault(); return; }
    var first = f[0], last = f[f.length - 1], a = document.activeElement;
    if (!entry.box.contains(a)) { e.preventDefault(); first.focus(); }
    else if (e.shiftKey && (a === first || a === entry.box)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && a === last) { e.preventDefault(); first.focus(); }
  }, true);
  // Focus that leaves anyway (Tab out of an iframe, a click on the page behind
  // a scrim the page made see-through) comes back to the top modal.
  document.addEventListener('focusin', function (e) {
    var entry = stack[stack.length - 1];
    if (!entry) return;
    var edge = e.target.getAttribute && e.target.getAttribute('data-modal-sentinel');
    if (!edge && entry.box.contains(e.target)) return;
    var f = focusables(entry.box);
    var to = edge === 'start' ? f[f.length - 1] : f[0];
    (to || entry.box).focus({ preventScroll: true });
  });

  function boot() {
    Array.prototype.forEach.call(document.querySelectorAll('.ws'), initDrawer);
    Array.prototype.forEach.call(document.querySelectorAll('.cs-menu'), initMenu);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.CarinoUI = {
    slices: slices, drawer: initDrawer, menu: initMenu, parseHash: parseHash,
    modal: {
      open: openModal, close: closeModal, top: topModal,
      isOpen: function (el) { var m = resolve(el); return !!(m && entryOf(m.root)); },
    },
  };
})();
