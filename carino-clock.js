/* ============================================================
   carino-clock.js — single source of truth for the Carino navbar clock.
   ------------------------------------------------------------
   Hosted at https://carino.systems/carino-clock.js and loaded by every
   Carino navbar (the shared carino-navbar.js injects it automatically;
   bespoke navbars include it with a <script> tag).

   It owns ONLY the clock inside every `.header-clock`: it writes the
   `.clock-time` and `.clock-tz` elements and wires click-to-cycle. It
   never touches greetings, diagnostics or anything else — those stay
   with each app.

   Cycle: Local → UTC → Epoch → TAI → .beats
     * TAI   = UTC + TAI_OFFSET leap seconds
     * .beats = Swatch Internet Time (Biel Mean Time = UTC+1, 1 beat = 86.4s)

   Change the clock here once; every site picks it up on next load.
   ============================================================ */
(function () {
  'use strict';

  var MODES = 5;
  var TAI_OFFSET = 37; // TAI - UTC in seconds (leap seconds; bump if IERS adds one)

  function pad(n) { return String(n).padStart(2, '0'); }

  var LOCAL_TZ = 'LOCAL';
  try {
    LOCAL_TZ = (Intl.DateTimeFormat().resolvedOptions().timeZone || 'LOCAL')
      .split('/').pop().replace(/_/g, ' ') || 'LOCAL';
  } catch (e) { LOCAL_TZ = 'LOCAL'; }

  function beats(d) { // Swatch .beats — UTC+1, 1000 beats/day
    return '@' + String(Math.floor(((d.getTime() + 3600000) % 86400000) / 86400) % 1000).padStart(3, '0');
  }

  function render(mode) {
    var d = new Date(), time, tz;
    if (mode === 1) {
      time = pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) + ':' + pad(d.getUTCSeconds()); tz = 'UTC';
    } else if (mode === 2) {
      time = String(Math.floor(d.getTime() / 1000)); tz = 'EPOCH';
    } else if (mode === 3) {
      var a = new Date(d.getTime() + TAI_OFFSET * 1000);
      time = pad(a.getUTCHours()) + ':' + pad(a.getUTCMinutes()) + ':' + pad(a.getUTCSeconds()); tz = 'TAI';
    } else if (mode === 4) {
      time = beats(d); tz = 'BEATS';
    } else {
      time = pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()); tz = LOCAL_TZ;
    }
    return { time: time, tz: tz };
  }

  var clocks = []; // { box, timeEl, tzEl, mode }

  function tickAll() {
    for (var i = 0; i < clocks.length; i++) {
      var c = clocks[i], r = render(c.mode);
      if (c.timeEl) c.timeEl.textContent = r.time;
      if (c.tzEl) c.tzEl.textContent = r.tz;
    }
  }

  function attach(box) {
    if (box.__carinoClock) return;                 // idempotent — never double-wire
    var timeEl = box.querySelector('.clock-time');
    var tzEl = box.querySelector('.clock-tz');
    if (!timeEl && !tzEl) return;                   // not a real clock element yet
    box.__carinoClock = true;
    var c = { box: box, timeEl: timeEl, tzEl: tzEl, mode: 0 };
    clocks.push(c);
    box.style.cursor = 'pointer';
    box.style.userSelect = 'none';
    // Unprefixed user-select only landed in Safari 17; without the prefixed
    // partner, double-tapping the clock to cycle modes selects the digits on
    // any slightly older iPhone or Mac.
    box.style.webkitUserSelect = 'none';
    box.setAttribute('title', 'Click to toggle Local / UTC / Epoch / TAI / .beats');
    if (!box.hasAttribute('role')) box.setAttribute('role', 'button');
    if (!box.hasAttribute('tabindex')) box.setAttribute('tabindex', '0');
    function cycle() { c.mode = (c.mode + 1) % MODES; tickAll(); }
    box.addEventListener('click', cycle);
    box.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); cycle(); }
    });
    var r = render(c.mode);                          // paint immediately
    if (timeEl) timeEl.textContent = r.time;
    if (tzEl) tzEl.textContent = r.tz;
  }

  function scan() {
    var boxes = document.querySelectorAll('.header-clock');
    for (var i = 0; i < boxes.length; i++) attach(boxes[i]);
  }

  function boot() {
    scan();
    setInterval(tickAll, 1000);
    // Every engine throttles background setInterval and iOS suspends timers
    // outright, so the first frame after returning to a hidden tab still shows
    // the old time; after a bfcache restore the interval may not resume at all
    // and it would stay wrong indefinitely. Repaint on the way back in.
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) tickAll();
    });
    window.addEventListener('pageshow', tickAll);
    // The shared navbar injects its header shortly after load, so re-scan a
    // few times to catch a `.header-clock` that appears just after we boot.
    var tries = 0;
    var iv = setInterval(function () { scan(); if (++tries > 12) clearInterval(iv); }, 300);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
