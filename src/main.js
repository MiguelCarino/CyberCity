/* CyberCity main — the loop, the viewport, the seed, and nothing else.
 *
 * There is no game here. Nothing is scored, nothing is aimed, nothing is clicked. The whole of
 * "interaction" is: the page may go real-fullscreen if you touch it, and the URL fragment names
 * which city you are standing in so a walk can be handed to someone else. Everything past that
 * would be UI, and UI is the one thing this piece cannot have.
 */
(function (CC) {
  'use strict';

  var HAS_DOM = typeof document !== 'undefined' && typeof window !== 'undefined' &&
                !!(document && document.createElement);

  var STEP = 1 / 60;                 // simulation tick; elements were written against 60 Hz
  var ASPECT = 0.5625;               // 9x16 character cell, the proportion surfaces.js was tuned on
  var MAXC = 360, MINC = 48, MINR = 22;

  var canvas = null, frame = null, city = null, seed = 0;
  var cam = { x: 0, z: 0, yaw: 0, eyeY: 1.7, fov: 1.25, horizon: 0, t: 0, cellAspect: ASPECT };
  var els = [], cols = 0, rows = 0;
  var simT = 0, acc = 0, last = 0, running = false;
  var zoom = 1;                      // adaptive column pressure; 1 = full detail (see adapt)

  /* ---- seed ----------------------------------------------------------------------------------
   * A city is a pure function of its seed, so the fragment IS the artwork's address. Anything that
   * is not an integer is folded with FNV-1a, which means #shinjuku is a perfectly good city and
   * people can name their own. */
  /* ---- world in the fragment -------------------------------------------------------------------
   * The address of a place is now WHICH WORLD and WHICH SEED, and the old form has to keep working
   * because it is the form that has been sent to people: `#42` is city 42 and always will be. A
   * world other than the default prefixes itself — `#west/42` — which is a URL somebody can also
   * type from memory, and which reads as a path rather than as a query because that is what it is.
   *
   * Returns the world id, or null for "the fragment did not say", which the boot path distinguishes
   * from "the fragment said cyber": neither changes anything today, but a third world added later
   * must not silently inherit whatever was live. */
  function worldFromHash() {
    var h = (window.location.hash || '').replace(/^#/, '').trim();
    var i = h.indexOf('/');
    /* NO PREFIX MEANS THE DEFAULT WORLD, not "the fragment did not say", and the difference is a
     * real bug that only shows on a navigation. `#42` addresses the city — that is the whole point
     * of fragment() omitting the prefix for LIST[0] — so returning null here made the hashchange
     * handler read "no opinion" and leave a viewer standing on the frontier while the URL in front
     * of them said otherwise. Going from #west/42 to #42 by editing the address bar, or by a back
     * button, did nothing at all. */
    if (i < 0) return CC.World ? CC.World.DEFAULT : 'cyber';
    var w = CC.World && CC.World.at(h.slice(0, i));
    return w ? w.id : null;
  }

  function seedFromHash() {
    var h = (window.location.hash || '').replace(/^#/, '').trim();
    var sl = h.indexOf('/');
    if (sl >= 0) h = h.slice(sl + 1);
    h = h.replace(/^seed=/, '').trim();
    if (!h) return null;                 // null, not 0 — #0 is a legitimate city
    /* Literal only within the 32-bit window a seed actually occupies — signed at the bottom so
     * #-1 keeps working, unsigned at the top because that is the form replaceState writes and a
     * random seed reaches 4294967295. Outside it, `| 0` silently folds (a twenty-digit number
     * lands on 0) and the visitor would be moved to somebody else's city, so anything wider
     * falls through to the hash below and is at least its own address. */
    if (/^-?\d+$/.test(h)) {
      var v = parseInt(h, 10);
      if (v >= -2147483648 && v <= 4294967295) return v >>> 0;
    }
    var s = 2166136261;
    for (var i = 0; i < h.length; i++) { s ^= h.charCodeAt(i); s = Math.imul(s, 16777619); }
    return s >>> 0;
  }

  /* The fragment, written from the two facts that make it. One function, because there were three
   * call sites writing '#' + seed by hand and a world that only two of them knew about is a link
   * that takes the reader somewhere else. */
  function fragment(w, sd) {
    return '#' + (w && w !== CC.World.DEFAULT ? w + '/' : '') + (sd >>> 0);
  }
  function writeFragment() {
    if (window.history && history.replaceState)
      history.replaceState(null, '', fragment(CC.World ? CC.World.id : 'cyber', seed));
  }

  /* ---- viewport ------------------------------------------------------------------------------
   * The band used to be pinned wide (6.4-9.6 CSS px) on the argument that a smaller cell only
   * shrinks the ink: a glyph covers about a fifth of its cell, so halving the cell halved the light
   * and 400 columns read as grey mush. That argument died with the underpainting. Every cell now
   * carries its own colour behind the glyph (core.js, Compose.post), so a smaller cell is more
   * PICTURE rather than less ink, and the optics are sized in reference cells (frame.D) so a halo
   * does not shrink to a quarter of its area when the grid doubles. What is left of the old rule is
   * the floor: under 5 px a glyph stops being a shape, and the shapes are still the texture.
   *
   * Integer device-pixel cells make the column counts lumpier than the band suggests: 6.4 rounds to
   * 6 at dpr 1, so 1920 lands on 320 columns, the ladder's 1.25 and 1.5 steps on 240 and 192, and a
   * 390 px phone at dpr 2 on 78. MAXC is set at 360 because the node budget was measured at 300x95
   * (world + elements + underpainting under 12 ms) and an ultrawide must not buy a grid nobody
   * costed; past it the cell grows instead, which at 2560 dpr 1 means 8 px and 320 columns. */
  function cellCSS(vw) {
    var w = vw < 560 ? 5.0 : vw < 1000 ? 5.6 : 6.4;
    return w * zoom;
  }

  /* The stage the canvas sits in: everything under the fleet navbar, or the whole screen once the
   * navbar has slid away (fullscreen, or idle). Without a laid-out parent (the DOM shim) it is
   * the window, as it always was. */
  function stageSize() {
    var p = canvas && canvas.parentNode;
    var w = p && p.clientWidth, h = p && p.clientHeight;
    return (w > 0 && h > 0) ? [w, h] : [window.innerWidth, window.innerHeight];
  }

  function layout() {
    var sz = stageSize();
    var vw = Math.max(sz[0] || 320, 200);
    var vh = Math.max(sz[1] || 240, 160);
    /* Capped at 2. A phone at dpr 3 would triple the fill rate of the bloom taps to sharpen glyphs
     * that are already sub-pixel-crisp at 2, and the bloom is where the frame budget goes. */
    var dpr = Math.min(window.devicePixelRatio || 1, 2);

    var dw = Math.max(4, Math.round(cellCSS(vw) * dpr));
    var dh = Math.max(7, Math.round(dw / ASPECT));
    /* ceil, not round: the canvas is allowed to overhang the viewport by a fraction of a cell.
     * Fullscreen must have no seam of page showing at the edge, and a partial cell of city bleeding
     * off-screen is invisible where a black gutter would not be. */
    var c = Math.ceil(vw * dpr / dw);
    if (c > MAXC) {                   // ultrawide: grow the cell instead of the column count
      c = MAXC;
      dw = Math.ceil(vw * dpr / c);
      dh = Math.max(7, Math.round(dw / ASPECT));
      /* dw was just rounded UP, so MAXC of them overshoot the viewport — by a whole cell at
       * 3440 and by more once dpr is in play, which is a canvas wider than the screen and a
       * picture whose right-hand edge is off it. Re-derive the count from the widened cell. */
      c = Math.ceil(vw * dpr / dw);
    }
    if (c < MINC) c = MINC;
    var r = Math.max(MINR, Math.ceil(vh * dpr / dh));

    cols = c; rows = r;
    calm = nowMs() + 1000;            // see adapt: a relayout's own cost is not the frame's
    CC.Canvas.setGrid(cols, rows, dw, dh, dpr);
    frame = CC.makeFrame(cols, rows);
    /* horizonBase is the neutral row; cam.horizon is owned by CC.Control from here on, because
     * looking up and down IS sliding the horizon (see control.js). Seeded to the neutral value so
     * a frame rendered before the first control tick is still correct. */
    cam.horizonBase = rows * 0.56;
    cam.horizon = cam.horizonBase;
    cam.rows = rows;
    cam.cellAspect = CC.Canvas.cellAspect;
  }

  /* ---- world ---------------------------------------------------------------------------------
   * Elements size their own buffers off the frame they are handed (the sizeTo pattern), so a
   * resize does NOT re-init them — that would restart every rain drop and reshuffle every crowd
   * mid-walk. Only a seed change rebuilds the world. */
  function build(newSeed) {
    seed = newSeed >>> 0;
    city = CC.City ? CC.City.make(seed) : null;
    cam.x = city && city.startX !== undefined ? city.startX : 0.5;
    cam.z = city && city.startZ !== undefined ? city.startZ : 0.5;
    /* A new city is a new sky and a fresh walk. Weather gets its OWN rng rather than a draw from
     * the element stream below, so adding it did not reshuffle every element's noise. */
    /* THE CLOCK IS INITIALISED BEFORE THE WEATHER AND BEFORE EVERY ELEMENT, because both of those
     * read it: an element's init() may size itself to the hour, and the weather director's first
     * update happens under whatever sky the clock says. Unlike the weather it is NOT reset by a
     * rebuild — see daylight.js's init — so pressing 2 at noon puts you on the frontier at noon. */
    if (CC.Daylight) CC.Daylight.init(city);
    if (CC.Weather) CC.Weather.init(city, CC.mulberry(seed ^ 0x5bf03635));
    if (CC.Control) CC.Control.reset();
    var rng = CC.mulberry(seed ^ 0x9e3779b9);
    /* THE TIE-BREAK IS WRITTEN DOWN, because this sort decides two things and only one of them is
     * obvious. Seven pairs of elements share a layer — 7 (beacons | lowcloud), 8 (searchlights |
     * fogbank), 12 (blimps | rain), 20 (pedestrians | skybridges), 21 (cat | rooftop-plant),
     * 22 (traffic | masts), 24 (litter | cables) — and for each pair the order fixes not just who
     * draws over whom but who draws from the ONE shared rng first, which shifts the noise stream
     * of every element initialised after them. Array#sort has been stable since ES2019, so the
     * ties have always resolved to registration order; sorting the INDICES and falling back to
     * them says so in code rather than leaving a reader to know that about their engine.
     *
     * What this does NOT fix, and cannot fix from here: registration order is concatenation order,
     * which build.js takes from readdirSync('src/elements').sort(). Renaming an element file
     * across one of those ties would reseed everything downstream of it — measured at 0.8-3.6% of
     * the cells of a 400x100 frame. The cure is to sort on (layer, name) so the order belongs to
     * the elements instead of to the filesystem, and it has to be made HERE and in
     * tools/headless.cjs in the same edit: the harness sorts CC.ELEMENTS itself, and a harness
     * ordering elements differently from the browser is an offline reference frame that is not
     * the frame the browser draws. */
    /* THE WORLD GATE, and it happens BEFORE the sort for the reason the tie-break note below
     * spells out: every element pulls from one shared rng in layer order, so which elements are
     * present decides what every later element's noise stream is. Filtering after the sort would
     * give the same answer here and a different one the day someone reorders the filter. An
     * element with no `world` belongs to both — see src/world.js. */
    var live = CC.World ? CC.World.id : 'cyber';
    var seq = [], q;
    for (q = 0; q < CC.ELEMENTS.length; q++)
      if (CC.inWorld(CC.ELEMENTS[q], live)) seq.push(CC.ELEMENTS[q]);
    var rank = [];
    for (q = 0; q < seq.length; q++) rank.push(q);
    rank.sort(function (a, b) { return ((seq[a].layer | 0) - (seq[b].layer | 0)) || (a - b); });
    els = [];
    for (q = 0; q < rank.length; q++) els.push(seq[rank[q]]);
    for (var i = 0; i < els.length; i++)
      if (els[i].init) els[i].init(city, rng, { cols: cols, rows: rows });
    simT = 0; acc = 0;
  }

  function step(dt, t) {
    /* PHOTO MODE. P freezes the city but not the viewer: control.js keeps arbitrating input, so
     * look and walk still work and you can compose the shot you stopped for. Everything downstream
     * of this line is the simulation — weather, rain, the crowd — and it does not advance.
     * Returning here is only half of the freeze; the other half is `simT` being held in tick(),
     * because an element whose draw() is a pure function of t (the sky, a sign's flicker, the
     * scanline roll) would go on animating no matter how many updates we skipped. */
    if (CC.Control && CC.Control.paused) { CC.Control.update(dt, t, cam, city); return; }
    /* city.camera, NOT CC.City.camera. CC.City is only { make }; the walk is exported on the
     * INSTANCE that make() returns. Guarding on the module put the whole piece in a chair: the
     * camera was placed once in build() and never moved again, so a browser showed one still
     * frame with rain falling on it. */
    /* Clock first, then weather: an element updating this tick must see this tick's sky, not last
     * tick's, and the weather is read against the hour rather than the other way round. */
    if (CC.Daylight) CC.Daylight.update(dt, t);
    if (CC.Weather) CC.Weather.update(dt, t);
    /* Through CC.Control, which arbitrates between the autopilot and whoever is holding the keys.
     * With nothing attached and nothing pressed it delegates straight to city.camera, so the walk
     * is unchanged and tools/headless.cjs still renders the frame the browser draws.
     *
     * city.camera, NOT CC.City.camera. CC.City is only { make }; the walk is exported on the
     * INSTANCE that make() returns. Guarding on the module put the whole piece in a chair: the
     * camera was placed once in build() and never moved again, so a browser showed one still
     * frame with rain falling on it. */
    if (CC.Control) CC.Control.update(dt, t, cam, city);
    else if (city && city.camera) city.camera(cam, city, t);
    if (CC.Control && CC.Control.tickHint) CC.Control.tickHint(dt);
    for (var i = 0; i < els.length; i++) if (els[i].update) els[i].update(dt, t, cam);
  }

  function render(t) {
    cam.t = t;
    CC.clearFrame(frame);
    if (CC.Cast) CC.Cast.render(frame, cam, city);
    if (CC.Compose && CC.Compose.world) CC.Compose.world(frame);
    for (var i = 0; i < els.length; i++) if (els[i].draw) els[i].draw(frame, cam, t);
    if (CC.Compose && CC.Compose.post) CC.Compose.post(frame, cam, t);
    CC.Canvas.draw(frame);
  }

  /* ---- adaptive quality ----------------------------------------------------------------------
   * Degradation is deliberately reluctant and strictly ordered, and the order turned round when the
   * cell shrank. Bloom used to go first because it was the fill-rate cost; it is now sized in screen
   * pixels and blurred off a downsampled scene, so it costs the same at 200 columns as at 360, while
   * the world pass, the elements and the underpainting all scale with the cell count and the glyph
   * pass does not scale at all (the pixel path). So columns go first, in two rungs — zoom 1.25 and
   * 1.5, which at 1920 is 320 -> 240 -> 192 — because a coarser grid is still the same picture and
   * a missing glow is a different one. Bloom drops to one tap only once the grid is as coarse as the
   * band allows. Recovery climbs back the same ladder in reverse, one rung per six sustained good
   * seconds, so a one-off GC pause cannot make the frame breathe in and out of detail.
   *
   * The six seconds are not enough on their own. A machine that holds 240 columns at 10 ms and
   * drops 320 at 27 would otherwise climb, fall and climb again every seven seconds forever, which
   * is exactly the breathing the wait was meant to stop. So a rung that is lost again within twelve
   * seconds of being regained doubles the wait for the next climb, up to most of a minute. THAT
   * rung and no other: upLv is the level the climb landed on, and only a loss FROM it is a relapse.
   * Keyed on the clock alone, every rung a heavy burst took after one good climb doubled it again —
   * measured on the ladder lifted out verbatim, a climb at 9.4 s, the regained rung lost at 12.4 s
   * (6 -> 12 s, right) and then the bloom rung, never regained, lost at 13.6 s (12 -> 24 s, wrong):
   * one burst cost a quarter of a minute of waiting it had not earned. And a
   * rung that was held a full minute before it was lost resets the wait to six seconds, because a
   * doubling earned by a tab switch or a GC storm at boot is not evidence about the machine an
   * hour later, and without the reset every recovery for the rest of the page's life waited 48 s.
   *
   * And the first second after any layout is not evidence. A relayout rebuilds the atlas, the
   * frame and every bloom buffer, and at boot the JIT has not warmed yet: Chromium measured 30-40 ms
   * ticks in that second on worlds that then settled at 21-25 ms at 320 columns, and the ladder,
   * charged for them, had given away a third of the grid before the page had properly started. */
  var ZOOM = [1, 1.25, 1.5, 1.5];
  var ema = 16, badSince = 0, goodSince = 0, lv = 0, upAt = -1e9, upLv = -1, hold = 6000, calm = 0;
  /* A rung that moves no columns is skipped, not served. Past MAXC the cell is already widened to
   * fit, so at 2560 dpr 1 zoom 1 and zoom 1.25 both land on 8 px and 320 columns: the first rung
   * there was measured in Chromium spending 1.2 s of bad frames to change nothing. (Climbing back,
   * the same no-op is the last rung, 1.25 -> 1; it costs one idle six-second wait and no detail,
   * and testing for it would mean a trial relayout, which rebuilds the atlas.) */
  function rung(d) {
    lv += d;
    if (lv > 2) CC.Canvas.setQuality(1);
    else {
      if (lv === 2 && d < 0) CC.Canvas.setQuality(2);
      var c0 = cols;
      if (ZOOM[lv] !== zoom) { zoom = ZOOM[lv]; layout(); }
      if (cols === c0 && lv === 1 && d > 0) rung(d);
    }
  }
  function adapt(ms, now) {
    if (now < calm) { badSince = goodSince = 0; return; }
    ema += (ms - ema) * 0.08;
    if (ema > 26) {
      goodSince = 0;
      if (!badSince) badSince = now;
      else if (now - badSince > 1200 && lv < 3) {
        badSince = now;
        hold = now - upAt < 12000 && lv === upLv ? Math.min(hold * 2, 48000) : now - upAt > 60000 ? 6000 : hold;
        rung(1);
      }
    } else if (ema < 11) {
      badSince = 0;
      if (!goodSince) goodSince = now;
      else if (now - goodSince > hold && lv > 0) { goodSince = upAt = now; rung(-1); upLv = lv; }
    } else { badSince = 0; goodSince = 0; }
  }

  /* ---- loop ----------------------------------------------------------------------------------
   * Fixed-step accumulator, so the walk covers the same ground per second on a 144 Hz panel as on a
   * 30 Hz one; the elements integrate in ticks and would otherwise run at monitor speed. */
  function nowMs() { return window.performance ? performance.now() : Date.now(); }

  function tick(now) {
    if (!running) return;
    window.requestAnimationFrame(tick);
    /* Measured from callback entry, not from the rAF timestamp: the gap between the two is the
     * browser's own scheduling delay, and charging that to our budget makes the renderer degrade
     * itself over somebody else's long task. */
    var t0 = nowMs();
    var dt = (now - last) / 1000; last = now;
    if (!(dt > 0)) dt = STEP;
    /* A backgrounded tab hands back a gap of minutes. Fast-forwarding it would burn hundreds of
     * ticks on a frame nobody saw, so time simply did not pass while you were away. */
    if (dt > 0.25) dt = 0.25;
    /* Reduced motion does not mean a frozen picture — a still would lose the piece entirely. It
     * means the same walk at roughly a third the pace; the elements damp themselves on top. */
    if (CC.reducedMotion) dt *= 0.35;

    acc += dt;
    var n = 0;
    /* simT is held while paused — see step(). The accumulator still drains and step() is still
     * called, so control.js gets its ticks at the usual rate and the look keeps its smoothing;
     * only the clock the world is a function of stops. */
    var frozen = !!(CC.Control && CC.Control.paused);
    while (acc >= STEP && n < 5) { if (!frozen) simT += STEP; step(STEP, simT); acc -= STEP; n++; }
    if (n === 5) acc = 0;             // cannot catch up; drop the debt rather than spiral

    render(simT);
    adapt(nowMs() - t0, now);
  }

  /* ---- DOM plumbing --------------------------------------------------------------------------
   * Kept to the minimum the contract allows main to own: one canvas, one resize, one fullscreen
   * gesture. The fade-out hint is pure CSS in index.html precisely so no code here has to know
   * about it or ever remove it. The fleet chrome (navbar, help overlay, pause button) lives in
   * ui.js and talks to this file only through four window events, so the bundle still leaks
   * nothing to window:
   *   cybercity:help    main -> ui   H or ? was pressed; open the help overlay
   *   cybercity:paused  main -> ui   photo mode changed, detail {paused}
   *   cybercity:pause   ui -> main   set photo mode, detail {paused}
   *   cybercity:modal   ui -> main   a dialog opened or closed, detail {open}; while open the
   *                                  keys belong to the dialog and nothing goes fullscreen */
  var modalOpen = false;
  function emit(name, detail) {
    try { window.dispatchEvent(new CustomEvent(name, { detail: detail })); } catch (err) { }
  }
  /* A gesture on the city (the canvas) asks for fullscreen and the mouse-look; one on the navbar,
   * a dialog or a button is about that control and asks for neither. */
  function onStage(e) {
    var t = e && e.target;
    return !modalOpen && !!e && !(t && t.closest && t.closest('#carinoNav, .modal-scrim, [data-carino-actions]'));
  }
  var rzT = 0;
  function onResize() {
    window.clearTimeout(rzT);
    /* Debounced: a desktop window drag fires this dozens of times a second and each one
     * reallocates the frame, every bloom buffer and the whole glyph atlas. */
    rzT = window.setTimeout(function () { layout(); }, 180);
  }

  function goFullscreen() {
    if (document.fullscreenElement || document.webkitFullscreenElement) return;
    var e = document.documentElement;
    var fn = e.requestFullscreen || e.webkitRequestFullscreen;
    if (!fn) return;
    /* The try/catch alone was never enough, and nothing had ever run this line in a browser to
     * find out. requestFullscreen RETURNS A PROMISE in every current engine; try/catch only ever
     * caught the old synchronous webkit form. A denied request — the page is framed without
     * allow="fullscreen", the engine did not count this particular keystroke as activation, or
     * the user simply refused — then REJECTS, and an unhandled rejection is a red line in the
     * console of a piece whose entire claim is that it is one quiet self-contained file that
     * asks for nothing. Being refused fullscreen is a perfectly good outcome here; it must just
     * be a silent one. */
    try {
      var p = fn.call(e);
      if (p && p.catch) p.catch(function () { });
    } catch (err) { /* denied or not user-activated: fine as-is */ }
  }

  function boot() {
    canvas = document.getElementById('cc');
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.id = 'cc';
      document.body.appendChild(canvas);
    }
    /* Before ANY module initialises: elements read CC.reducedMotion at init time as well as in
     * update, so setting it after boot would leave half the city un-damped. */
    /* A coarse pointer means a thumb, so the stencil hint speaks touch from its first frame rather
     * than after the first tap. Asked before the motion query, which is the one kept live. */
    try {
      if (CC.Control && window.matchMedia && window.matchMedia('(pointer: coarse)').matches) CC.Control.touch = 1;
    } catch (err) { }
    var mq = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
    CC.reducedMotion = !!(mq && mq.matches);
    if (mq && mq.addEventListener)
      mq.addEventListener('change', function (e) { CC.reducedMotion = !!e.matches; });

    CC.Canvas.init(canvas);
    /* 'auto', not on: the pixel-write glyph pass (render_canvas.js) only pays at cells of 7 device
     * px or less, where drawImage per glyph is what made more columns cost more frames. Above that
     * the atlas blit is as fast and the canvas's own antialiasing is the better print. */
    if (CC.Canvas.setPixelPath) CC.Canvas.setPixelPath('auto');
    layout();

    /* World first, seed second, and in that order because city.js resolves CC.World inside make():
     * building the city and then setting the world gives a frontier flag over a city map. */
    var w0 = worldFromHash();
    if (w0 && CC.World) CC.World.force(w0);
    var s = seedFromHash();
    /* === null, not !s. seedFromHash already distinguishes "no fragment" (null) from "#0", and
     * testing falsiness threw that distinction away: #0 built a RANDOM city and then replaceState
     * overwrote the user's own fragment with it. */
    if (s === null) {
      s = (Math.random() * 4294967296) >>> 0;
      /* replaceState, not location.hash: writing the hash directly would push a history entry and
       * fire hashchange, rebuilding the city we are about to build. */
      seed = s;
      writeFragment();
    }
    build(s);

    window.addEventListener('resize', onResize, { passive: true });
    window.addEventListener('orientationchange', onResize, { passive: true });
    /* The stage also changes size with no window event: the navbar sliding away or back
     * (carino:navbar), or arriving at all after boot. */
    if (typeof ResizeObserver === 'function' && canvas.parentNode && canvas.parentNode.nodeType === 1)
      new ResizeObserver(onResize).observe(canvas.parentNode);
    window.addEventListener('carino:navbar', onResize);
    window.addEventListener('cybercity:modal', function (e) { modalOpen = !!(e && e.detail && e.detail.open); });
    window.addEventListener('cybercity:pause', function (e) {
      if (CC.Control && CC.Control.setPaused) CC.Control.setPaused(!!(e && e.detail && e.detail.paused));
    });
    document.addEventListener('fullscreenchange', onResize);
    // goFullscreen already reaches for the webkit entry point; without its event too, a Safari
    // that DID go fullscreen would keep drawing at the old grid until something else resized it.
    document.addEventListener('webkitfullscreenchange', onResize);
    window.addEventListener('hashchange', function () {
      /* Two facts can have moved, and a world change with the SAME seed is still a move — which is
       * why the seed test alone is no longer enough to decide whether to rebuild. force(), not
       * set(): set() would fire the change callback and rebuild, and then this would rebuild
       * again on the next line. */
      var nw = worldFromHash(), ns = seedFromHash();
      var moved = 0;
      if (nw && CC.World && nw !== CC.World.id) { CC.World.force(nw); moved = 1; }
      if (ns !== null && ns !== seed) moved = 1;   // same reason: navigating to #0 is a real move
      if (moved) build(ns === null ? seed : ns);
    });
    window.addEventListener('pointerdown', function (e) { if (onStage(e)) goFullscreen(); }, { passive: true });
    window.addEventListener('keydown', function (e) {
      if (!e.metaKey && !e.ctrlKey && !e.altKey && onStage(e) && e.key !== 'Escape') goFullscreen();
    });

    /* The keys. `hooks` is how control.js reaches back into main without importing it — it owns
     * the input, main owns the city and the canvas, and neither has to know the other's shape. */
    if (CC.Control && CC.Control.attach) {
      CC.Control.attach(window, document, canvas, {
        city: function () { return city; },
        now: function () { return simT; },
        fullscreen: goFullscreen,
        help: function () { emit('cybercity:help', {}); },
        blocked: function () { return modalOpen; },
        paused: function (p) { emit('cybercity:paused', { paused: !!p }); },
        reseed: function () {
          var ns = (Math.random() * 4294967296) >>> 0;
          seed = ns;
          writeFragment();
          build(ns);
        },
        /* WORLD SWITCH. The seed is kept: #42 is a place in every world, and pressing 2 is
         * therefore "show me this seed as the frontier" rather than "take me somewhere random".
         * That is the whole reason the switch is worth having on a key — the two worlds share
         * their street lattice indices, so the same number puts you on the same corner of the
         * same map with a different town built on it. */
        world: function (v) {
          if (!CC.World || !CC.World.set(v)) return 0;
          writeFragment();
          build(seed);
          return 1;
        },
        worldName: function () { return CC.World ? CC.World.name : ''; }
      });
      /* Pointer lock is a mouse-look, and a mouse-look nobody asked for is a trap: it is only
       * requested on a real click, which is also the gesture that goes fullscreen. */
      window.addEventListener('pointerdown', function (e) {
        if (onStage(e) && CC.Control.requestLook) CC.Control.requestLook();
      }, { passive: true });
    }

    running = true;
    last = nowMs();
    window.requestAnimationFrame(tick);
  }

  if (HAS_DOM) {
    if (document.readyState === 'loading')
      document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }

  /* `cam` is read-only introspection, not an API: it exists so the walk can be PROVEN — driven
   * for hundreds of frames offline and checked for pace and for clipping — rather than trusted. */
  var Main = { boot: boot, layout: layout, build: build,
               get seed() { return seed; }, get cols() { return cols; }, get rows() { return rows; },
               get cam() { return cam; } };
  CC.Main = Main;
  if (typeof module !== 'undefined') module.exports = Main;
})(typeof CC !== 'undefined' ? CC : require('./core.js'));
