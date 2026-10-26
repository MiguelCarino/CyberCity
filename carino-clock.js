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

   Language: the tooltip and the local city name come from a small
   dictionary here (es, pt-BR, ja, ru), picked by CarinoLang.current or
   <html lang>; a site's window.t wins when it has the string. UTC,
   EPOCH, TAI and BEATS are names, not words, and stay as they are.
   ============================================================ */
(function () {
  'use strict';

  var MODES = 5;
  var TAI_OFFSET = 37; // TAI - UTC in seconds (leap seconds; bump if IERS adds one)

  function pad(n) { return String(n).padStart(2, '0'); }

  var TIP = 'Click to toggle Local / UTC / Epoch / TAI / .beats';

  // The tooltip, plus the city names of the zones the fleet's visitors are
  // most often in. Any other zone shows its IANA city name as it is.
  var L10N = {
    es: {
      'Click to toggle Local / UTC / Epoch / TAI / .beats': 'Haz clic para alternar Local / UTC / Epoch / TAI / .beats',
      'LOCAL': 'LOCAL', 'Mexico City': 'Ciudad de México', 'New York': 'Nueva York', 'Sao Paulo': 'São Paulo',
      'London': 'Londres', 'Tokyo': 'Tokio', 'Moscow': 'Moscú', 'Bogota': 'Bogotá',
    },
    'pt-BR': {
      'Click to toggle Local / UTC / Epoch / TAI / .beats': 'Clique para alternar Local / UTC / Epoch / TAI / .beats',
      'LOCAL': 'LOCAL', 'Mexico City': 'Cidade do México', 'New York': 'Nova York', 'Sao Paulo': 'São Paulo',
      'London': 'Londres', 'Madrid': 'Madri', 'Tokyo': 'Tóquio', 'Moscow': 'Moscou', 'Bogota': 'Bogotá',
    },
    ja: {
      'Click to toggle Local / UTC / Epoch / TAI / .beats': 'クリックで切り替え: ローカル / UTC / Epoch / TAI / .beats',
      'LOCAL': 'ローカル', 'Mexico City': 'メキシコシティ', 'New York': 'ニューヨーク', 'Los Angeles': 'ロサンゼルス',
      'Chicago': 'シカゴ', 'Sao Paulo': 'サンパウロ', 'Bogota': 'ボゴタ', 'Madrid': 'マドリード',
      'London': 'ロンドン', 'Tokyo': '東京', 'Moscow': 'モスクワ',
    },
    ru: {
      'Click to toggle Local / UTC / Epoch / TAI / .beats': 'Нажмите, чтобы переключить: местное / UTC / Epoch / TAI / .beats',
      'LOCAL': 'МЕСТНОЕ', 'Mexico City': 'Мехико', 'New York': 'Нью-Йорк', 'Los Angeles': 'Лос-Анджелес',
      'Chicago': 'Чикаго', 'Sao Paulo': 'Сан-Паулу', 'Bogota': 'Богота', 'Madrid': 'Мадрид',
      'London': 'Лондон', 'Tokyo': 'Токио', 'Moscow': 'Москва',
    },
  };
  function langNow() {
    var l = String((window.CarinoLang && window.CarinoLang.current) || document.documentElement.lang || 'en');
    return /^pt/i.test(l) ? 'pt-BR' : l.slice(0, 2).toLowerCase();
  }
  function tr(s) {
    if (typeof window.t === 'function') {
      try { var v = window.t(s); if (typeof v === 'string' && v && v !== s) return v; } catch (e) { /* not i18n */ }
    }
    var d = L10N[langNow()];
    return (d && d[s]) || s;
  }

  var LOCAL_TZ = 'LOCAL';
  try {
    LOCAL_TZ = (Intl.DateTimeFormat().resolvedOptions().timeZone || 'LOCAL')
      .split('/').pop().replace(/_/g, ' ') || 'LOCAL';
  } catch (e) { LOCAL_TZ = 'LOCAL'; }
  // Looked up once per language, not on every one-second tick.
  var tzLang = null, tzLabel = LOCAL_TZ;
  function localTz() {
    var l = langNow();
    if (l !== tzLang) { tzLang = l; tzLabel = tr(LOCAL_TZ); }
    return tzLabel;
  }

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
      time = pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()); tz = localTz();
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
    box.setAttribute('title', tr(TIP));
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
    // A tick late, so a site's own langchange handler has switched window.t.
    function relabel() {
      tzLang = null;
      for (var i = 0; i < clocks.length; i++) clocks[i].box.setAttribute('title', tr(TIP));
      tickAll();
    }
    window.addEventListener('carino:langchange', function () { setTimeout(relabel, 0); });
    document.addEventListener('DOMContentLoaded', function () { setTimeout(relabel, 0); });
    // The shared navbar injects its header shortly after load, so re-scan a
    // few times to catch a `.header-clock` that appears just after we boot.
    var tries = 0;
    var iv = setInterval(function () { scan(); if (++tries > 12) clearInterval(iv); }, 300);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
