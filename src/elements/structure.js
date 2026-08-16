/* CyberCity structure — the hardware bolted to the canyon.
 *
 * Seven ambient systems that all share one job: break the flat rectangle of a facade and the flat
 * slot of sky with objects that have a real position in the world. Cables and skybridges cross the
 * void between the walls, fire escapes hang off them, plant and masts stand on top of them,
 * lanterns hang under them — and street props stand on the pavement under all of it, which is the
 * one band this file used to leave completely empty. See section 7 for why that mattered.
 *
 * Everything here is placed by hashing a WORLD lattice index, never by hashing a camera-relative
 * sample. A screen- or camera-derived placement re-rolls every frame and the whole street boils —
 * the same failure surfaces.js documents for facade windows, and it is far more obvious on an
 * object with a silhouette than on a texel.
 *
 * That rule applies to the PATTERNS ON an object exactly as much as to the object's position, and
 * the first cut of this file honoured it for placement and broke it for pattern in two places: the
 * skybridge window band, soffit dash and window brightness were all keyed on the screen column, and
 * segment3's dash phase came from a per-call counter over drawn screen cells. Both produced a
 * texture welded to the viewport that the object then slid underneath. Measured against a world
 * lattice, 4-37% of a bridge's pattern cells and 21-27% of an escape's dash decisions re-rolled
 * between two consecutive frames 27 mm apart; both are 0.0% now. If you add anything to this file,
 * the test is: hold the world still, move the camera by a millimetre, and nothing may change that
 * is not a consequence of the projection.
 *
 * Coverage discipline: measured against the 200x60 harness over four seeds, the whole batch costs
 * between half a point and two points of lit coverage, averaging about one. Much of what it draws
 * is BLACK — a bridge soffit and a mast shaft are unlit iron, and CC.put with ch 0 / lum 0 is how
 * you draw an absence at a depth. Adding lit cells was never the goal; adding silhouette was.
 */
(function (CC) {
  'use strict';

  var P = CC.P, hash2 = CC.hash2, vnoise = CC.vnoise, put = CC.put;

  /* g() is a string-keyed lookup and these are hit thousands of times per frame. */
  var G_DASH = CC.g('-'), G_PIPE = CC.g('|'), G_SL = CC.g('/'), G_BS = CC.g('\\'),
      G_EQ = CC.g('='), G_HASH = CC.g('#'), G_O = CC.g('O'), G_oo = CC.g('o'),
      G_0 = CC.g('0'), G_8 = CC.g('8'), G_U = CC.g('U'), G_V = CC.g('V'),
      G_Y = CC.g('Y'), G_STAR = CC.g('*'), G_PLUS = CC.g('+'), G_COLON = CC.g(':'),
      G_UNDER = CC.g('_'), G_DOT = CC.g('.'), G_COMMA = CC.g(','), G_SEMI = CC.g(';'),
      G_X = CC.g('X'), G_M = CC.g('M'), G_W = CC.g('W'), G_N = CC.g('N'), G_A = CC.g('A'),
      G_PCT = CC.g('%'), G_AMP = CC.g('&'), G_TICK = CC.g('`'), G_QUOTE = CC.g("'");

  var LANTERN_G = [G_oo, G_O, G_0, G_8];

  /* ---- shared state ---------------------------------------------------------------------------
   * All six elements draw off one city and one seed, so BASE is drawn from the rng ONCE PER WORLD:
   * six draws would give every element a different lattice offset and, worse, would shift the
   * shared rng stream under every element that inits after these six.
   *
   * The guard is the city object, not a `booted` boolean. A boolean is right exactly once. main.js
   * calls init() again whenever the seed changes — a #hashchange, someone pasting a link — and a
   * latched BASE meant the new city inherited the old city's cables, masts, escapes and lanterns
   * while every other module rebuilt around them. Comparing identity keeps the once-per-world
   * property (all six are handed the SAME object in one round) and still re-rolls on a real
   * rebuild. Resizing is not a rebuild and never reaches here: main.js's layout() re-allocates the
   * frame and leaves the elements alone, precisely so a window drag cannot reshuffle the city. */
  var CITY = null, BASE = 0, bootWorld, Surf = null;
  function boot(city, rng) {
    if (rng && bootWorld !== city) { bootWorld = city; BASE = (rng() * 4294967296) | 0; }
    CITY = city && city.aveX ? city : null;   // no street lattice, nothing here has an anchor
  }

  /* ---- the view ------------------------------------------------------------------------------
   * Mirrors raycast.js exactly. The camera is PLANAR: w is the perpendicular distance and doubles
   * as the projection divisor, and the radial distance the depth test wants is w*sqrt(1+sp^2).
   * Deriving `scale` from fov the same way raycast does is not optional — an element projected
   * with a different vertical scale detaches from the wall it is bolted to. */
  var V = {
    ox: 0, oz: 0, eyeY: 1.7, fwx: 0, fwz: 1, rgx: 1, rgz: 0,
    hp: 0.7265, colK: 0, colMid: 0, scale: 77, horizon: 33, cols: 0, rows: 0, far: 125,
    t: 0, tt: 0
  };

  /* ---- weather binding ------------------------------------------------------------------------
   * Read off CC.Weather.P, which is a LIVE block held by reference, once per element draw and
   * cached in these three scalars — the alternative is a dozen `CC.Weather.rel('wet')` calls per
   * frame, each of which walks a string array.
   *
   * W_WET and the rest come through rel(), which is 1.0 under the 'rain' preset the whole build
   * was tuned in, so a constant multiplied by it is unchanged until the weather actually moves.
   * Multiplying by the RAW parameter instead would silently re-tune this file to 65% of what it
   * was on the day it shipped, which is the one migration mistake weather_state.js calls out.
   *
   * W_GUST is the exception and is deliberately NOT a rel(): there is no gust in the tuned preset
   * to be relative to. It is a 0..1-ish magnitude and every consumer below scales its own
   * displacement by it. */
  var W_WET = 1, W_GUST = 0.55, W_RAIN = 1;

  /* REDUCED MOTION, once, for everything in this file that swings. A damped amplitude is not
   * enough on its own — a banner still swinging at a third of its travel is still a banner
   * swinging — so the clock is stopped as well and the amplitude kept, which leaves the cloth
   * leaning on a fixed gust instead of oscillating on one. W_SWAY is that amplitude factor and
   * V.tt the stopped clock; every sway in the file reads both. */
  var W_SWAY = 1;

  /* THE GUST. weather.js owns the single wind vector the whole build shares — rain slant, steam
   * drift, litter — and publishes the live strength of it as CC.Wind.gust, which is P.wind beaten
   * by its gust envelope on the director's own 0..1 scale (up to about 1.6 on the hardest gust of
   * a storm). Reading it is what puts the banners, the washing and the paper lanterns on exactly
   * the same beat as the rain curtain instead of on a private one that happens to look similar.
   *
   * The fallback is not dead code and should stay: this file is also loaded by tools that require
   * a subset of src/, and a missing wind must produce a still street rather than an exception.
   * Probed every frame rather than latched at init, because CC.Wind is a live object and the
   * element files load in an order this one does not get to choose. */
  function gustOf(Wm, t) {
    var G = CC.Wind ? CC.Wind.gust : undefined;
    if (typeof G === 'number') return G;
    var base = Wm ? Wm.P.wind : 0.55;
    return base * (0.70 + 0.66 * vnoise(t * 0.27, 0x51D));
  }

  function view(f, cam, t) {
    if (!Surf) Surf = CC.Surf;
    var fov = cam.fov || 1.25, hp = Math.tan(fov * 0.5);
    var cellA = cam.cellAspect || 0.5625;
    V.cols = f.cols; V.rows = f.rows; V.hp = hp;
    V.colK = f.cols * 0.5 / hp; V.colMid = f.cols * 0.5;
    V.scale = cam.scaleY !== undefined ? cam.scaleY : (f.cols * cellA) / (2 * hp);
    V.horizon = cam.horizon !== undefined ? cam.horizon : f.rows * 0.56;
    V.eyeY = cam.eyeY !== undefined ? cam.eyeY : 1.7;
    var yaw = cam.yaw || 0;
    V.fwx = Math.sin(yaw); V.fwz = Math.cos(yaw);
    V.rgx = Math.cos(yaw); V.rgz = -Math.sin(yaw);
    V.ox = cam.x; V.oz = cam.z;
    V.far = Surf ? Surf.FOG_END : 125;
    V.t = t;
    V.tt = CC.reducedMotion ? 0 : t;
    var Wm = CC.Weather;
    W_WET = Wm ? Wm.rel('wet') : 1;
    W_RAIN = Wm ? Wm.rel('rain') : 1;
    W_GUST = gustOf(Wm, t);
    W_SWAY = CC.reducedMotion ? 0.38 : 1;
  }

  /* Continuous cell coordinates: column i covers [i, i+1), row i has its centre at i+0.5, which is
   * the convention raycast.js paints against. Floor, never |0 — |0 truncates -0.4 to 0 and would
   * smear anything just off the top-left corner back onto the frame. */
  var PJ = { x: 0, y: 0, d: 0 };
  function project(px, py, pz) {
    var rx = px - V.ox, rz = pz - V.oz;
    var w = rx * V.fwx + rz * V.fwz;
    if (w < 0.4) return false;                       // at or behind the eye plane
    var sp = (rx * V.rgx + rz * V.rgz) / w;
    PJ.d = w * Math.sqrt(1 + sp * sp);
    PJ.x = sp * V.colK + V.colMid;
    PJ.y = V.horizon - (py - V.eyeY) * V.scale / w;
    return PJ.d < V.far;
  }

  /* The only write. Fog is applied here because raycast.js already fogged the world pass; an
   * unfogged mast at 90 m would read nearer than the tower it stands on. A cell fogged to nothing
   * still gets written: it is unlit iron in front of something, and that occlusion is the point. */
  function emit(f, x, y, ch, col, lum, d) {
    if (x < 0 || y < 0 || x >= V.cols || y >= V.rows) return;
    if (lum > 0 && Surf) { lum = Surf.fog(lum, d); if (lum <= 0) ch = 0; }
    put(f, x, y, ch, col, lum, d, 3);
  }

  /* The same write for a LAMP rather than a surface, and the difference is not a licence — it is
   * the physics. Surf.fog models a surface that stops reaching you: multiply by k^1.5 and crush
   * the tail, so an 80 m parapet correctly goes to black. A point source is the other case: an
   * aerial obstruction light is built to be seen from further than this city is deep, and fogging
   * it as though it were concrete is why the mast element measured 4.5 cells a frame with NOT ONE
   * of them over v=60 across the whole canonical sweep — the beacons were arithmetically present
   * and printed as nothing. The floor keeps 42% of the lamp's own luminance at any range, which
   * is a lamp dimmed by weather rather than a lamp deleted by it, and it is applied to exactly
   * two cells per mast and nothing else in this file. */
  function emitLamp(f, x, y, ch, col, lum, d) {
    if (x < 0 || y < 0 || x >= V.cols || y >= V.rows) return;
    var l = Surf ? Surf.fog(lum, d) : lum, fl = lum * 0.42;
    put(f, x, y, ch, col, l < fl ? fl : l, d, 3);
  }

  /* ---- straight world segment ---------------------------------------------------------------
   * Sample count comes from the segment's PROJECTED length, so a rail two metres away and the same
   * rail at sixty cost the same number of distinct cells. `dash` draws one distinct cell in N:
   * ironwork drawn continuously turns into the grey lattice the art direction exists to prevent.
   *
   * THE DASH PHASE COMES FROM THE WORLD. It used to come from a running counter over drawn screen
   * cells — `if (dash > 1 && (k++ % dash)) continue;` — with k reset at the top of every call. That
   * counter is indexed by the screen, so the instant a sub-cell camera step pushed the segment's
   * first sample across a column boundary the whole run re-phased and every drawn cell in it
   * jumped one place along. Fire escapes were the worst of it: measured at 200x60, consecutive
   * frames 27 mm apart re-rolled 15%, 61%, 35%, 45% of the escapes' cells. Nothing was moving in
   * the world; the pattern was simply being re-dealt sixty times a second.
   *
   * The replacement counts TICKS along the segment in world units, so a tick belongs to a point on
   * the ironwork and stays with it. The one subtlety is the tick pitch. A pitch fixed in metres
   * looks right at one distance only — it goes solid at range and turns into three lonely cells up
   * close — so the pitch tracks the projected density, but QUANTISED TO A POWER OF TWO of ticks
   * per metre. That quantisation is the whole trick: it holds a segment's pattern rigid across a
   * 1.4x change of distance, which at walking pace is several seconds, and when it does change it
   * changes once, cleanly, instead of dithering every frame. `anchor` puts the lattice origin in
   * the world rather than at the segment's own end, so a stack of landings on one wall does not
   * come out with every flight starting on the same tread. */
  var TICK_MIN = 0.03125, TICK_MAX = 64;
  function segment3(f, x0, y0, z0, x1, y1, z1, ch, col, lum, dash) {
    var okA = project(x0, y0, z0), ax = PJ.x, ay = PJ.y;
    var okB = project(x1, y1, z1), bx = PJ.x, by = PJ.y;
    if (!okA && !okB) return;
    var n, span;
    if (okA && okB) {
      var dx = bx - ax, dy = by - ay;
      if (dx < 0) dx = -dx; if (dy < 0) dy = -dy;
      span = dx > dy ? dx : dy;                      // Chebyshev length: how many cells this covers
      /* Three samples per cell, not the 1.35 this used to run at. 1.35 does not guarantee a sample
       * lands in every cell the line passes through, so a tenth of the cells were simply missed —
       * and WHICH tenth changed as the phase drifted, which looked exactly like the dash bug and
       * partly was it. Oversampling costs projections, not writes: the duplicate-cell test below
       * throws the extra samples away before they reach emit(). */
      n = (span * 3 + 2) | 0;
      if (n > 480) n = 480;
    } else { n = 48; span = 24; }                    // one end is behind us; sample generously
    var wl = 0, tpm = 0, anchor = 0;
    if (dash > 1) {
      var wdx = x1 - x0, wdy = y1 - y0, wdz = z1 - z0;
      wl = Math.sqrt(wdx * wdx + wdy * wdy + wdz * wdz);
      if (wl < 1e-4) wl = 1e-4;
      /* Ticks per metre, from the CELL count and never from the sample count: one tick is meant to
       * be about one screen cell, so that a run of `dash` ticks reads as one gap and one mark. */
      tpm = Math.pow(2, Math.round(Math.log(span / wl) / Math.LN2));
      if (!(tpm >= TICK_MIN)) tpm = TICK_MIN; else if (tpm > TICK_MAX) tpm = TICK_MAX;
      anchor = x0 * 0.37 + y0 * 1.13 + z0 * 0.71;
    }
    var lx = -9999, ly = -9999, i, u, cx, cy;
    for (i = 0; i <= n; i++) {
      u = i / n;
      if (!project(x0 + (x1 - x0) * u, y0 + (y1 - y0) * u, z0 + (z1 - z0) * u)) { lx = -9999; continue; }
      cx = Math.floor(PJ.x); cy = Math.floor(PJ.y);
      if (cx === lx && cy === ly) continue;
      lx = cx; ly = cy;
      if (dash > 1 && (Math.floor((anchor + u * wl) * tpm) % dash)) continue;
      emit(f, cx, cy, ch, col, lum, PJ.d);
    }
  }

  /* ---- street geometry ------------------------------------------------------------------------
   * axis 0 = avenue (runs along +z, so a span crosses in x); axis 1 = cross street (spans z).
   * city.js puts street cells at |g - centre| <= halfWidth, so the wall faces sit at centre-hw and
   * centre+hw+1 — the +1 is the far edge of the last street cell, and getting it wrong buries an
   * anchor a metre inside the building. */
  var SPAN = { c0: 0, c1: 0, mid: 0, w: 0 };
  function streetSpan(axis, idx) {
    var c, h;
    if (axis) { c = CITY.crossZ(idx); h = CITY.crossW(idx); }
    else      { c = CITY.aveX(idx);   h = CITY.aveW(idx); }
    SPAN.c0 = c - h; SPAN.c1 = c + h + 1;
    SPAN.mid = c + 0.5; SPAN.w = SPAN.c1 - SPAN.c0;
  }
  function wx(axis, along, cross) { return axis ? along : cross; }
  function wz(axis, along, cross) { return axis ? cross : along; }

  /* Height of the building a span anchors into. Callers pass a `cross` half a metre BEHIND the
   * wall face, so the probe can never land on the street cell itself and report a hole.
   * Three probes, tallest wins: the frontage is broken by alleys, courtyards and vacant lots
   * every few metres, and a single probe dropped roughly half of all spans on the floor — the
   * street ended up with no cables at all for fifty metres at a time. A four-metre gap in the
   * frontage does not stop a wire being strung from the masonry either side of it. */
  function anchorH(axis, along, cross) {
    var a = CITY.height(wx(axis, along, cross), wz(axis, along, cross));
    var b = CITY.height(wx(axis, along - 2.5, cross), wz(axis, along - 2.5, cross));
    var c = CITY.height(wx(axis, along + 2.5, cross), wz(axis, along + 2.5, cross));
    if (b > a) a = b;
    return c > a ? c : a;
  }

  /* Cheap reject for a whole span before its sample loop runs. Generous lateral margin: the ends
   * of a span can be on screen while its midpoint is not.
   *
   * `near` is the same allowance one axis over, and it defaults to a metre only because most of
   * this file hangs its objects overhead, where a span whose MIDPOINT is a metre away is entirely
   * past the top of the frame. Street props are the exception and pass their own: a prop is four
   * metres long, so its midpoint goes behind the eye plane while half of it is still filling a
   * third of the screen, and a test on the midpoint alone deleted it in one frame. Objects that
   * survive this test still get clipped exactly, per span, by clipNear() below. */
  function spanVisible(axis, along, cross, near) {
    var px = wx(axis, along, cross), pz = wz(axis, along, cross);
    var rx = px - V.ox, rz = pz - V.oz;
    var w = rx * V.fwx + rz * V.fwz;
    if (w < (near === undefined ? 1 : near) || w > V.far) return 0;
    var s = rx * V.rgx + rz * V.rgz, lim = w * V.hp + 14;
    if (s < -lim || s > lim) return 0;
    return w;
  }

  /* Index windows either side of the camera. AVE is 30 m and CROSS 26, so these cover the fog
   * range in both directions without walking indices that can only produce black. */
  function idxLo(axis) {
    return Math.round((axis ? V.oz : V.ox) / (axis ? CITY.CROSS : CITY.AVE)) - (axis ? 5 : 3);
  }
  function idxHi(axis) {
    return Math.round((axis ? V.oz : V.ox) / (axis ? CITY.CROSS : CITY.AVE)) + (axis ? 5 : 3);
  }
  function alongLo(axis, pitch) { return Math.floor(((axis ? V.ox : V.oz) - V.far) / pitch); }
  function alongHi(axis, pitch) { return Math.floor(((axis ? V.ox : V.oz) + V.far) / pitch); }

  /* ============================================================================================
   * 1. SKYBRIDGES — layer 20
   * A tube crossing the canyon overhead. Rare on purpose: one in frame is an event, two is a
   * theme park. Drawn as its near face only — the far face is behind it and never resolves at
   * this resolution — with a dark soffit that occludes the skyline behind it.
   * ========================================================================================== */
  function drawBridges(f) {
    if (!CITY) return;
    var axis, idx, n, r, along, hA, hB, y, thick, near, hue, sd, w, cnt, i, u, cross;
    var rt, rb, r0, r1, row, cx, dd, lit, lastCx, cw, band;
    for (axis = 0; axis < 2; axis++) {
      for (idx = idxLo(axis); idx <= idxHi(axis); idx++) {
        streetSpan(axis, idx);
        if (SPAN.w < 5) continue;                    // an alley cannot carry a bridge
        for (n = alongLo(axis, 34); n <= alongHi(axis, 34); n++) {
          if (hash2(idx, n, BASE ^ 0x5B12) > 0.46) continue;
          along = n * 34 + hash2(idx, n, BASE ^ 0x5B13) * 24;
          w = spanVisible(axis, along, SPAN.mid);
          if (!w) continue;
          hA = anchorH(axis, along, SPAN.c0 - 0.5);
          hB = anchorH(axis, along, SPAN.c1 + 0.5);
          if (hA < 15 || hB < 15) continue;          // needs two buildings, not two shopfronts
          sd = BASE ^ (idx * 131 + n * 7919);
          y = 9 + hash2(idx, n, BASE ^ 0x5B14) * 14;
          r = (hA < hB ? hA : hB) - 3.2;
          if (y > r) y = r;
          /* Under about 7 m it stops reading as a bridge and starts reading as an awning; the
           * eye is at 1.7 and needs to be looking clearly UP at the thing. */
          if (y < 7.5) continue;
          thick = 2.3 + hash2(idx, n, BASE ^ 0x5B15) * 1.3;
          /* The face we can actually see. Picking the wrong one puts the bridge a few metres out
           * of place, which is enough for its shadow edge to disagree with the towers it lands on. */
          near = ((axis ? V.ox : V.oz) < along) ? along - 1.7 : along + 1.7;
          r = hash2(idx, n, BASE ^ 0x5B16);
          hue = r < 0.55 ? P.azure : (r < 0.90 ? P.amber : P.warm);

          cnt = (SPAN.w * 210 / w) | 0;
          if (cnt < 10) cnt = 10; if (cnt > 260) cnt = 260;
          lastCx = -99999;
          for (i = 0; i <= cnt; i++) {
            u = i / cnt;
            cross = SPAN.c0 + SPAN.w * u;
            if (!project(wx(axis, near, cross), y + thick, wz(axis, near, cross))) continue;
            rt = PJ.y; cx = Math.floor(PJ.x); dd = PJ.d;
            /* Duplicate screen columns, dropped the way segment3 drops them. At 210 samples per
             * projected column the span hits the same cx three or four times running, and each
             * repeat was a fresh CC.put at a slightly different depth — so which of them won a
             * cell flipped as the camera moved, on top of everything below. */
            if (cx === lastCx) continue;
            lastCx = cx;
            if (!project(wx(axis, near, cross), y, wz(axis, near, cross))) continue;
            rb = PJ.y;
            r0 = Math.floor(rt); r1 = Math.floor(rb);
            if (r1 < r0) r1 = r0;
            if (r1 - r0 > 24) r1 = r0 + 24;          // a bridge overhead can fill the screen
            /* THE PATTERN IS KEYED ON THE BRIDGE, NEVER ON THE VIEWPORT.
             * Every one of these three used to read `cx`, the SCREEN COLUMN — the soffit dash, the
             * window band and the band's own brightness hash. A pattern keyed on a screen column
             * is welded to the frame, not to the object: the bridge slides across the screen and
             * the stripes stay where they are, so the windows crawl along the tube and the soffit
             * dashes swim through it. Measured against the world lattice below, 34% of a bridge's
             * pattern cells re-rolled between two consecutive frames 27 mm apart.
             * `cw` is the distance ALONG THE SPAN in units of 0.625 m, offset by the bridge's own
             * seed so neighbouring bridges do not line up. 1.6 units per metre is chosen so one
             * unit stays wider than one screen column out to ~60 m, past which fog has the bridge
             * anyway: finer than that and the pattern aliases against the column grid, which is
             * the same bug wearing a different hat. */
            cw = Math.floor(cross * 1.6) + (sd & 3);
            band = cw & 3;
            for (row = r0; row <= r1; row++) {
              if (row === r0) { emit(f, cx, row, G_EQ, P.slate, 34, dd); continue; }
              if (row === r1 && r1 > r0) {           // soffit: deck lights, otherwise black mass
                /* DECK LIGHTS, and they are what makes the bridge pay for itself. Measured over
                 * the canonical sweep, this element punched out 8.4 already-visible cells a frame
                 * and put back 1.1 — a black tube crossing the one part of the frame that has any
                 * sky in it, contributing nothing but the hole. A tube that big in a city like
                 * this has lights under it. One every eight units of span, which is five metres,
                 * so a canyon-width bridge carries three or four: a run, not a strip.
                 * Amber because a light under a deck is a sodium lamp, and because amber is a
                 * pillar and this is one of the few places up in the slot that can carry one.
                 * Half a period off the window band so the two patterns stay legibly separate. */
                if (!(cw & 7)) emit(f, cx, row, G_oo, P.amber, 150, dd);
                else emit(f, cx, row, band === 2 ? G_DASH : 0, P.slate, band === 2 ? 15 : 0, dd);
                continue;
              }
              /* One window band, one unit of span in four. The rest of the tube is dark: a lit
               * strip that reads as a strip is worth more than a lit rectangle that reads as a
               * sign. */
              /* row - r0 and not row: the second argument of the hash has to be an offset from the
               * TUBE, because the tube's absolute screen row changes every time the camera takes a
               * step and a hash keyed on it re-rolls the window brightness with it. Same bug as
               * the column, one axis over, and it survived the first pass at this fix. */
              lit = (row === r0 + 1) && band === 0;
              if (lit) emit(f, cx, row, G_8, hue, 150 + hash2(cw, row - r0, sd) * 62, dd);
              else emit(f, cx, row, 0, P.shadow, 0, dd);
            }
          }
        }
      }
    }
  }

  /* ============================================================================================
   * 2. ROOFTOP PLANT — layer 21
   * Air handling units and satellite dishes. These only ever resolve on buildings 40 m out and
   * further: a near roof projects far above the top of the frame. Their whole job is to stop the
   * mid-distance skyline being a row of clean parapets.
   *
   * PLACED ALONG THE STREET FRONTAGE, for exactly the reason section 3 gives for the masts, and
   * this element learned it the expensive way. It used to walk a world lattice over the whole
   * city, which sounds more general and is strictly worse: raycast.js paints walls and never roof
   * surfaces, so a box standing five metres back from the parapet is hidden behind its own
   * building's front wall — that wall is nearer, projects higher, and wins the depth test. Only
   * the front metre or two of any roof is ever on the silhouette. Measured over the canonical
   * sweep the lattice version put 6.6 cells a frame into the picture, of which NOT ONE printed
   * over v=60: an element slot spent on hidden geometry. The frontage walk enumerates the strip
   * that is actually visible, and it is welded to the world in exactly the same way — a lattice
   * along the street rather than across the city.
   * ========================================================================================== */
  function drawPlant(f) {
    if (!CITY) return;
    var axis, idx, n, side, r, along, cross, px, pz, w, h, top, wide, tall;
    var x0, y0, x1, y1, cx0, cx1, ry0, ry1, col, row, dd, lum;
    for (axis = 0; axis < 2; axis++) {
      for (idx = idxLo(axis); idx <= idxHi(axis); idx++) {
        streetSpan(axis, idx);
        for (n = alongLo(axis, 9); n <= alongHi(axis, 9); n++) {
          for (side = 0; side < 2; side++) {
            r = hash2(idx * 2 + side, n, BASE + 0x7A0F);
            if (r > 0.30) continue;                    // hash first: height() is the expensive part
            along = n * 9 + hash2(idx * 2 + side, n, BASE + 0x7A10) * 7;
            /* 1.4 m back from the wall face, which is far enough that the box stands ON the roof
             * rather than floating off the front of it and near enough to stay on the silhouette. */
            cross = side ? SPAN.c1 + 1.4 : SPAN.c0 - 1.4;
            w = spanVisible(axis, along, cross);
            if (!w || w < 14) continue;                // nearer than that, the roof is off the top
            px = wx(axis, along, cross); pz = wz(axis, along, cross);
            h = CITY.height(px, pz);
            if (h < 7) continue;

            if (r < 0.08) {
              /* Dish. 'U' is the only glyph in the table that reads as a tilted parabola; the stem
               * below it is what stops it looking like a stray letter on the skyline. */
              if (!project(px, h + 1.5, pz)) continue;
              dd = PJ.d; col = Math.floor(PJ.x); row = Math.floor(PJ.y);
              emit(f, col, row, G_U, hash2(idx * 2 + side, n, BASE + 0x7A12) < 0.7 ? P.slate : P.white, 52, dd);
              emit(f, col, row + 1, G_COLON, P.slate, 26, dd);
              continue;
            }
            /* Plant box. Two rows at most — measured against the harness, a third row of housing
             * turns a skyline accent into a second parapet. */
            top = h + 1.1 + r * 2.9;
            wide = 1.5 + r * 3.8;
            if (!project(px - wide * 0.5, top, pz)) continue;
            x0 = PJ.x; y0 = PJ.y; dd = PJ.d;
            if (!project(px + wide * 0.5, h, pz)) continue;
            x1 = PJ.x; y1 = PJ.y;
            cx0 = Math.floor(x0); cx1 = Math.floor(x1);
            if (cx1 < cx0) { tall = cx0; cx0 = cx1; cx1 = tall; }
            if (cx1 - cx0 > 9) cx1 = cx0 + 9;
            ry0 = Math.floor(y0); ry1 = Math.floor(y1);
            if (ry1 > ry0 + 2) ry1 = ry0 + 2;
            for (row = ry0; row <= ry1; row++) {
              lum = row === ry0 ? 46 : 28;             // only the top deck catches the skyglow
              for (col = cx0; col <= cx1; col++)
                emit(f, col, row, row === ry0 ? G_EQ : G_HASH, P.slate, lum, dd);
            }
          }
        }
      }
    }
  }

  /* ============================================================================================
   * 3. MASTS AND AERIAL LAMPS — layer 22
   * The only place red is allowed to lead, and it is three or four cells of it in the whole frame.
   * Lamps carry their own phase so a skyline of them never pulses in unison.
   *
   * Placed along the street FRONTAGE rather than on a lattice over the roofs, which is not a
   * stylistic choice: raycast.js paints walls and never roof surfaces, so a mast standing back
   * from the parapet is hidden behind its own building's front wall — that wall is nearer, so it
   * projects higher and wins the depth test. Only the front metre of a roof is ever on the
   * silhouette, and that is exactly what the frontage walk enumerates.
   * ========================================================================================== */
  function drawMasts(f) {
    if (!CITY) return;
    var axis, idx, n, side, r, along, cross, h, mh, col, row, rowTop, dd, k, ph, blink;
    for (axis = 0; axis < 2; axis++) {
      for (idx = idxLo(axis); idx <= idxHi(axis); idx++) {
        streetSpan(axis, idx);
        for (n = alongLo(axis, 15); n <= alongHi(axis, 15); n++) {
          for (side = 0; side < 2; side++) {
            r = hash2(idx * 2 + side, n, BASE ^ 0x2E10);
            if (r > 0.30) continue;
            along = n * 15 + hash2(idx * 2 + side, n, BASE ^ 0x2E11) * 11;
            /* A metre back from the face so the mast stands ON the roof; any further and its foot
             * disappears behind the parapet it is supposed to be bolted to. */
            cross = side ? SPAN.c1 + 1.0 : SPAN.c0 - 1.0;
            if (!spanVisible(axis, along, cross)) continue;
            h = CITY.height(wx(axis, along, cross), wz(axis, along, cross));
            /* 11 m, down from 14. Not a loosening for its own sake: a mast can only enter the
             * frame at all beyond about fifty metres, because a nearer roofline projects above the
             * top of it — (h - eye) * scale / d has to fall under `horizon` before the mast's own
             * FOOT is on screen — and out there fog has most of what it draws. Dropping the gate
             * by three metres brings the 25-40 m band into play, which is the only part of the
             * street where a mast is not already half fog. Below about ten metres it stops being a
             * mast on a building and becomes a flagpole on a shop. */
            if (h < 11) continue;

            mh = 3.5 + r * 26 + (h > 55 ? 9 : 0);      // landmarks carry the tall ones
            if (!project(wx(axis, along, cross), h + mh, wz(axis, along, cross))) continue;
            col = Math.floor(PJ.x); rowTop = Math.floor(PJ.y); dd = PJ.d;
            if (rowTop >= V.rows) continue;            // whole mast below the roofline we can see
            if (!project(wx(axis, along, cross), h, wz(axis, along, cross))) continue;
            row = Math.floor(PJ.y);
            if (row - rowTop > 30) row = rowTop + 30;

            /* Shaft, dashed. A solid column of '|' at this scale reads as a lit edge rather than
             * as a wire frame against the sky. */
            for (k = rowTop + 1; k <= row; k++)
              if (!((k - rowTop) & 1) || (k - rowTop) < 3)
                emit(f, col, k, G_PIPE, P.slate, 26, dd);
            /* A third of them are lattice aerials rather than plain poles: two stub arms, no more. */
            if (hash2(idx * 2 + side, n, BASE ^ 0x2E13) < 0.34 && row - rowTop > 4) {
              k = rowTop + 2;
              emit(f, col - 1, k, G_DASH, P.slate, 22, dd);
              emit(f, col + 1, k, G_DASH, P.slate, 22, dd);
              emit(f, col, rowTop + 1, G_Y, P.slate, 30, dd);
            }
            ph = V.t * 0.55 + hash2(idx * 2 + side, n, BASE ^ 0x2E14);
            blink = CC.reducedMotion ? 0.72 : ((ph - Math.floor(ph)) < 0.34 ? 1 : 0.16);
            emitLamp(f, col, rowTop, blink > 0.5 ? G_STAR : G_PLUS, P.red, 78 + 150 * blink, dd);
            /* Tall masts carry a second lamp partway down; that pair is what makes height read. */
            if (mh > 22 && row - rowTop > 12)
              emitLamp(f, col, rowTop + ((row - rowTop) >> 1), G_PLUS, P.red, 40 + 90 * blink, dd);
          }
        }
      }
    }
  }

  /* ============================================================================================
   * 4. FIRE ESCAPES — layer 23
   * Hung 0.42 m proud of the wall, which is both true of real ironwork and what keeps the whole
   * assembly strictly nearer than the facade so it passes the depth test instead of z-fighting it.
   * Landings and stair flights only: the balustrades and the rail returns are sub-cell at every
   * distance this thing survives to, and drawing them cost 40% more coverage for no read at all.
   *
   * The zig-zag is spent only on walls we see enough of. A canyon wall running away from the
   * camera foreshortens the along-wall axis into pure depth, so a 3.3 m flight lands as a single
   * unbroken diagonal twenty-five rows tall — a scratch across the frame, not a staircase. Below
   * five columns of projected width the flights are dropped and the landings alone remain, which
   * reads as balcony ledges: correct for that viewing angle and a tenth of the cells.
   * ========================================================================================== */
  function drawEscapes(f) {
    if (!CITY) return;
    var axis, idx, n, side, r, along, plane, h, top, y, lev, wdt, dd, dir, a0, a1, lum, pw, flights;
    for (axis = 0; axis < 2; axis++) {
      for (idx = idxLo(axis); idx <= idxHi(axis); idx++) {
        streetSpan(axis, idx);
        for (n = alongLo(axis, 11); n <= alongHi(axis, 11); n++) {
          for (side = 0; side < 2; side++) {
            r = hash2(idx * 2 + side, n, BASE ^ 0x3E5C);
            if (r > 0.18) continue;
            along = n * 11 + hash2(idx * 2 + side, n, BASE ^ 0x3E5D) * 7.5;
            dd = spanVisible(axis, along, side ? SPAN.c1 : SPAN.c0);
            if (!dd) continue;
            h = anchorH(axis, along, side ? SPAN.c1 + 0.5 : SPAN.c0 - 0.5);
            if (h < 12) continue;
            plane = side ? SPAN.c1 - 0.42 : SPAN.c0 + 0.42;
            top = h - 1.7; if (top > 21) top = 21;
            wdt = 1.15 + r * 2.2;                    // half-width along the wall
            /* Fog crushes anything past ~70 m to nothing, and drawing an invisible lattice is
             * still 80 cells of work per escape. */
            /* Nearer than about twelve metres a single 3.3 m flight is twenty-odd rows tall and
             * all you get is a fragment of one diagonal; past seventy fog has crushed it to
             * nothing and the eighty cells of work go straight in the bin. */
            if (dd > 74 || dd < 12) continue;

            a0 = along - wdt; a1 = along + wdt;
            if (!project(wx(axis, a0, plane), 8, wz(axis, a0, plane))) continue;
            pw = PJ.x;
            if (!project(wx(axis, a1, plane), 8, wz(axis, a1, plane))) continue;
            pw = PJ.x - pw; if (pw < 0) pw = -pw;
            if (pw < 2.2) continue;                    // edge-on: nothing here would read at all
            flights = pw >= 5;
            lev = 0;
            for (y = 2.9; y < top; y += 3.3, lev++) {
              /* One landing per escape is lit from inside — a door left open. This is the only
               * warm cell in the whole element and it is what stops the escape reading as dirt. */
              lum = (lev === 1 && r < 0.06) ? 62 : 33;
              segment3(f, wx(axis, a0, plane), y, wz(axis, a0, plane),
                          wx(axis, a1, plane), y, wz(axis, a1, plane),
                       G_EQ, (lev === 1 && r < 0.06) ? P.amber : P.slate, lum, 3);
              if (!flights || y + 3.3 >= top) continue;
              /* The zig-zag. Flights alternate direction, which is the whole silhouette of a fire
               * escape and reads even when the landings have fogged out. Drawn every other cell:
               * a solid diagonal is a scratch, a broken one is a run of treads. */
              dir = (lev & 1) ? 1 : -1;
              segment3(f, wx(axis, along - wdt * dir, plane), y, wz(axis, along - wdt * dir, plane),
                          wx(axis, along + wdt * dir, plane), y + 3.3, wz(axis, along + wdt * dir, plane),
                       dir > 0 ? G_SL : G_BS, P.slate, 24, 2);
            }
          }
        }
      }
    }
  }

  /* ============================================================================================
   * 5. CABLES — layer 24
   * Power and tram feed strung wall to wall. The sag is a parabola, not a true catenary: over a
   * span this short the two differ by well under a character cell, and the parabola costs one
   * multiply. Cables are drawn as an unbroken run — the one thing in this file that must not be
   * dashed, because a dashed wire stops being a wire.
   * ========================================================================================== */
  function drawCableRun(f, axis, along, c0, c1, yA, yB, sag, col, lum, w) {
    var cnt = ((c1 - c0) * 220 / w) | 0;
    if (cnt < 12) cnt = 12; if (cnt > 300) cnt = 300;
    var lx = -9999, ly = -9999, i, u, cross, y, cx, cy, dy, ch, k;
    for (i = 0; i <= cnt; i++) {
      u = i / cnt;
      cross = c0 + (c1 - c0) * u;
      y = yA + (yB - yA) * u - sag * 4 * u * (1 - u);
      if (!project(wx(axis, along, cross), y, wz(axis, along, cross))) { lx = -9999; continue; }
      cx = Math.floor(PJ.x); cy = Math.floor(PJ.y);
      if (cx === lx && cy === ly) continue;
      if (lx === -9999) ch = G_DASH;
      else {
        dy = cy - ly;
        /* Near the anchors the wire climbs faster than one row per column; those rows have to be
         * bridged or the cable arrives at the wall in pieces. */
        if (dy > 1 || dy < -1) {
          for (k = ly + (dy > 0 ? 1 : -1); k !== cy; k += (dy > 0 ? 1 : -1))
            emit(f, cx, k, G_PIPE, col, lum, PJ.d);
          ch = G_PIPE;
        } else ch = dy === 0 ? G_DASH : (dy > 0 ? G_BS : G_SL);
      }
      emit(f, cx, cy, ch, col, lum, PJ.d);
      lx = cx; ly = cy;
    }
  }

  function drawCables(f) {
    if (!CITY) return;
    var axis, idx, n, r, along, hA, hB, yA, yB, sag, w, tram, lum;
    for (axis = 0; axis < 2; axis++) {
      for (idx = idxLo(axis); idx <= idxHi(axis); idx++) {
        streetSpan(axis, idx);
        /* One span in four, every 26 m. Two visible cables read as a canyon that is wired; five
         * read as scaffolding, and at 200x60 they were costing more coverage than every other
         * element in this file put together. */
        for (n = alongLo(axis, 26); n <= alongHi(axis, 26); n++) {
          r = hash2(idx, n, BASE ^ 0x1CAB);
          if (r > 0.26) continue;
          along = n * 26 + hash2(idx, n, BASE ^ 0x1CAC) * 18;
          w = spanVisible(axis, along, SPAN.mid);
          if (!w) continue;
          hA = anchorH(axis, along, SPAN.c0 - 0.5);
          hB = anchorH(axis, along, SPAN.c1 + 0.5);
          if (hA < 8 || hB < 8) continue;
          yA = 6.5 + hash2(idx, n, BASE ^ 0x1CAD) * 6.5;
          /* The two ends differ by barely a metre and the sag is 8-15% of the span. Both numbers
           * are picked against each other, not from a catalogue: at the first attempt the ends
           * could disagree by 1.7 m, which at 15 m out is seven screen rows of tilt against four
           * of sag — every cable in the city came out a straight diagonal ramp and the whole
           * point of hanging them was lost. */
          yB = yA + (hash2(idx, n, BASE ^ 0x1CAE) - 0.5) * 1.2;
          if (yA > hA - 1.4) yA = hA - 1.4;
          if (yB > hB - 1.4) yB = hB - 1.4;
          if (yA < 5 || yB < 5) continue;
          sag = SPAN.w * (0.075 + hash2(idx, n, BASE ^ 0x1CAF) * 0.075);
          /* Brighter than a real wire deserves. At lum 25 a fogged cable was arithmetically
           * present and visually absent — slate at 19/255 does not survive the bloom pass. */
          tram = r < 0.10;
          lum = tram ? 62 : 44;
          drawCableRun(f, axis, along, SPAN.c0, SPAN.c1, yA, yB, sag, P.slate, lum, w);
          /* A tram feed is a pair — contact wire and catenary — and only close enough to resolve
           * as two. Doubling every span would double the cheapest element into the dearest. */
          if (tram && w < 46)
            drawCableRun(f, axis, along, SPAN.c0, SPAN.c1, yA - 1.15, yB - 1.15,
                         sag * 0.55, P.slate, 34, w);
        }
      }
    }
  }

  /* ============================================================================================
   * 6. LANTERNS AND PENNANTS — layer 26
   * Strung low over the street. The cord is deliberately NOT drawn: at night an unlit cord is
   * invisible and the lanterns float, which is both what the reference frames show and about
   * eight cells per string instead of eighty.
   * ========================================================================================== */
  function drawLanterns(f) {
    if (!CITY) return;
    var axis, idx, n, r, along, hA, hB, y, sag, w, cnt, i, u, cross, yy, hue, sd, flick, lum;
    var col, row, dd, pennant, swing, ph;
    for (axis = 0; axis < 2; axis++) {
      for (idx = idxLo(axis); idx <= idxHi(axis); idx++) {
        streetSpan(axis, idx);
        for (n = alongLo(axis, 14); n <= alongHi(axis, 14); n++) {
          r = hash2(idx, n, BASE ^ 0x4A17);
          if (r > 0.46) continue;
          along = n * 14 + hash2(idx, n, BASE ^ 0x4A18) * 10;
          w = spanVisible(axis, along, SPAN.mid);
          if (!w) continue;
          hA = anchorH(axis, along, SPAN.c0 - 0.5);
          hB = anchorH(axis, along, SPAN.c1 + 0.5);
          if (hA < 6 || hB < 6) continue;
          y = 4.6 + hash2(idx, n, BASE ^ 0x4A19) * 1.9;
          sag = 0.30 + r * 1.4;
          sd = BASE ^ (idx * 613 + n * 4099);
          /* Own hash, not the existence roll: keying hue off `r` ties the colour to how likely the
           * string was, and every rare string in the city comes out the same colour. Paper red is
           * the one place ember leads, and it stays a minority even here. */
          hue = (r = hash2(idx, n, BASE ^ 0x4A1B)) < 0.26 ? P.ember : (r < 0.40 ? P.warm : P.amber);
          pennant = hash2(idx, n, BASE ^ 0x4A1A) < 0.34;
          cnt = (SPAN.w / 1.9) | 0; if (cnt < 4) cnt = 4;
          /* Wind. The string is strung ACROSS the canyon, so a wind blowing down it pushes the
           * lanterns ALONG the street — that is why the displacement goes into `along` and not
           * into `cross`, which would only make the string longer and shorter. The lift is the
           * other half of it: a lantern that swings sideways without rising reads as a slider on
           * a rail. Both scale off the one gust magnitude the whole file shares, so the paper
           * lanterns, the banners and the washing all move on the same weather. */
          swing = W_GUST * (0.34 + r * 0.30) * W_SWAY;
          for (i = 0; i < cnt; i++) {
            u = (i + 0.5) / cnt;
            cross = SPAN.c0 + SPAN.w * u;
            yy = y - sag * 4 * u * (1 - u);
            /* Neighbours on one cord swing very nearly together — i * 0.22 is a lag along the
             * string, not eight independent pendulums, which is what a cord physically does. */
            ph = Math.sin(V.tt * 1.25 + (sd & 31) * 0.19 + i * 0.22);
            yy += swing * 0.13 * (ph > 0 ? ph : -ph);
            if (!project(wx(axis, along + swing * ph, cross), yy,
                         wz(axis, along + swing * ph, cross))) continue;
            col = Math.floor(PJ.x); row = Math.floor(PJ.y); dd = PJ.d;
            /* Paper lanterns breathe rather than flicker; keyed on the string seed and t alone so
             * they cannot boil as the camera walks past. */
            flick = CC.reducedMotion ? 0.94
                  : 0.80 + 0.24 * vnoise(V.t * 1.7 + i * 0.7 + (sd & 255) * 0.13, 0x4A1);
            lum = (168 + hash2(i, n, sd) * 60) * flick;
            emit(f, col, row, LANTERN_G[(hash2(i, 0, sd) * 4) | 0], hue, lum, dd);
            if (pennant && (i & 1))
              emit(f, col, row + 1, G_V, hue, lum * 0.26, dd);
          }
        }
      }
    }
  }

  /* ============================================================================================
   * 7. STREET PROPS — layer 19
   *
   * The complaint this element answers is specific: the canyon was over-furnished at the roofline
   * and empty at eye level. Everything above was bolted on at 8-25 m — bridges, cables, masts,
   * lanterns — and the first two metres of the street, which is the part a walking viewer is
   * actually standing in, carried nothing but tarmac and the shopfront band behind it.
   *
   * HOW A PROP EARNS ITS CELLS. Almost all of these are drawn the way street.js draws a person:
   * as a hole. CC.put with ch 0 / lum 0 at the prop's depth punches its silhouette out of the lit
   * facade behind it, which costs no light at all and reads immediately, because the shopfronts
   * ARE the light down here. On top of that hole each prop gets between one and a dozen genuinely
   * lit cells — a vending machine's face, a warm sliver under a half-shut shutter, the glow coming
   * up out of a stairwell. That split is the whole budget story: the group adds silhouette almost
   * for free and buys its lit coverage back one small light source at a time.
   *
   * DRAW ORDER INSIDE A PROP. Lit detail first, dark mass second, and the mass is pushed 5 cm
   * further from the street so it is unambiguously behind. CC.put wants a STRICT improvement in
   * depth, so a carcass drawn at the same plane as the face it surrounds would lose ties — but
   * "the same plane" is only true to the precision of two different sample positions along the
   * prop, and where the carcass won a column by a millimetre it swallowed the lit cell. The 5 cm
   * makes the ordering a fact about the geometry rather than a fact about rounding.
   *
   * PLACEMENT is a world lattice per side of each corridor, hashed exactly as everything else in
   * this file is: walk it and a prop stays welded to its lot. A prop needs a frontage to belong to,
   * so a lot with no building on it (anchorH under 3 m) is skipped — a call box standing alone in
   * a vacant lot reads as a bug, not as a call box.
   * ========================================================================================== */
  var K_VEND = 0, K_SHUTTER = 1, K_BOLLARD = 2, K_CRATES = 3, K_AC = 4,
      K_BANNER = 5, K_CALLBOX = 6, K_LADDER = 7, K_PLANTER = 8, K_HOARD = 9, K_SCAFF = 10,
      K_SHELTER = 11, K_NEWSBOX = 12, K_STAIR = 13, K_WASH = 14;

  /* The deal. Repeated slots are the weights, and they are weighted by what each prop is FOR:
   * refuse and vending are the two things a real street has every few doors, the light sources are
   * common because they are the reason this element exists, and the big assemblies — scaffolding,
   * a bus shelter, a hoarding — get one slot each because two of them in one frame is a set.
   *
   * THREE KINDS WERE CUT, and the census that cut them is the argument. Over the canonical sweep
   * (4 seeds x 4 frames at 400x100, every prop diffed against the frame it drew into): the bicycle
   * came out at a MEDIAN OF SEVEN CELLS in a 2x5 box and a best-in-sweep of 33, which is a diagonal
   * scratch of slate '/' whose slope argues with the perspective around it; the wall dish at six
   * cells in 5x3 and a best of 11; the pavement grate turned up ONCE in sixteen frames, thirteen
   * cells of lum-22 slate lying flat on tarmac. None of the three put a single cell over v=60 in
   * the whole sweep. They were detail at a scale this renderer does not have, and cells spent on
   * them are cells not spent on silhouette.
   *
   * Their four slots went to the two kinds the same census says do read: the vending machine (10
   * instances, 108 cells per frame over v=60 — on its own the best small light source in the
   * build) and the half-shut shutter (534 cells at 36x20 in the median, whose amber slat ribs are
   * unmistakable at street level), plus one to the call box, which is the only other prop that
   * pairs a dark cabinet with a lit panel and keeps a run of vending machines from becoming a
   * row of vending machines. The news box stays: 22 cells is small, but it is a chest-high box
   * with a lit ember face and it is the only ember at eye level. */
  var KIND = new Uint8Array([
    K_VEND, K_VEND, K_VEND, K_VEND, K_VEND,
    K_CRATES, K_CRATES, K_CRATES,
    K_SHUTTER, K_SHUTTER,
    K_BOLLARD, K_BOLLARD,
    K_AC, K_AC,
    K_CALLBOX, K_CALLBOX,
    K_PLANTER, K_NEWSBOX,
    K_LADDER, K_BANNER,
    K_STAIR, K_SHELTER, K_HOARD, K_WASH, K_SCAFF
  ]);

  var STY_FLAT = 0, STY_RIB = 1, STY_MESH = 2;

  /* NEAR-PLANE CLIP OF A PANEL'S SPAN.
   * This is the fix for the worst pop in the build. panel() used to bail on the WHOLE panel the
   * instant one of its two ends failed to project, and project() fails at w < 0.4 — the eye plane.
   * A 4.2 m hoarding walked past at arm's length has its trailing end behind that plane while the
   * rest of it still covers a third of the screen, and almost every prop is mostly a black
   * occluder plate, so the frame lost a plate the size of a wall between one frame and the next.
   * Measured at seed 3, 400x100: at t=68.750 s streetprops owned 4664 cells (11.7% of the frame)
   * and at t=68.767 s it owned 110, and the whole-frame printed mean stepped 16.94% -> 20.79% of
   * full scale in that single frame.
   *
   * Note what it was NOT: nothing was culled by spanVisible, and both frames drew the same thirty
   * props. The object did not leave; one of its corners crossed the eye plane.
   *
   * The cure is to clip the span rather than drop it. Both w (forward distance) and s (lateral
   * offset) are AFFINE in u along a straight world span, so "in front of the eye plane" is one
   * linear inequality and the surviving interval is exact — no iteration, no allocation. The panel
   * now walks off the edge of the frame over the two seconds the geometry says it should take,
   * instead of switching off. 0.42 rather than 0.40 so the endpoint projection below cannot fail
   * on the rounding of the same comparison. */
  var CLIP = { u0: 0, u1: 1 };
  function clipNear(axis, a0, a1, cross) {
    var rx = wx(axis, a0, cross) - V.ox, rz = wz(axis, a0, cross) - V.oz;
    var g0 = rx * V.fwx + rz * V.fwz - 0.42;
    rx = wx(axis, a1, cross) - V.ox; rz = wz(axis, a1, cross) - V.oz;
    var g1 = rx * V.fwx + rz * V.fwz - 0.42;
    if (g0 < 0 && g1 < 0) return false;              // the whole span is behind us
    CLIP.u0 = 0; CLIP.u1 = 1;
    if (g0 < 0) CLIP.u0 = g0 / (g0 - g1);
    else if (g1 < 0) CLIP.u1 = g0 / (g0 - g1);
    return true;
  }

  /* One flat panel standing in the world: a0..a1 along the street, y0..y1 in height, at a fixed
   * distance `cross` from the corridor centre. Drawn ONE SAMPLE PER SCREEN COLUMN, so a crate at
   * three metres and the same crate at forty cost the same number of writes.
   *
   * The column is the loop variable and the world point is solved for, rather than the other way
   * round. Marching uniformly along the span and taking whatever column each sample lands in is
   * the obvious way to write this and it fails exactly where it matters most: the projection is a
   * Möbius map, its screen density goes as 1/w^2, and once the span is allowed to reach the eye
   * plane the two ends differ in density by a factor of thirty or more. A uniform march then
   * leaves multi-column gaps in the near end of a black plate — holes in a silhouette, which read
   * as tearing. Inverting sp(u) = (s0 + ds*u)/(w0 + dw*u) for the column centre costs one divide
   * and lands exactly one sample in every column the panel covers, at any distance.
   *
   * The pattern lattice is the panel's own: `a` is a world coordinate and `row - r0` is an offset
   * from the panel's top edge, so neither re-rolls when the camera takes a step. Keying either on
   * the screen is the bug the skybridge comment above documents at length, and it is even louder
   * on a two-metre object than on a bridge. */
  function panel(f, axis, a0, a1, cross, y0, y1, ch, col, lum, jit, sty, sd) {
    if (!clipNear(axis, a0, a1, cross)) return;
    var b0 = a0 + (a1 - a0) * CLIP.u0, b1 = a0 + (a1 - a0) * CLIP.u1;
    var rx = wx(axis, b0, cross) - V.ox, rz = wz(axis, b0, cross) - V.oz;
    var w0 = rx * V.fwx + rz * V.fwz, s0 = rx * V.rgx + rz * V.rgz;
    rx = wx(axis, b1, cross) - V.ox; rz = wz(axis, b1, cross) - V.oz;
    var w1 = rx * V.fwx + rz * V.fwz, s1 = rx * V.rgx + rz * V.rgz;
    var dw = w1 - w0, ds = s1 - s0;
    var xa = s0 / w0 * V.colK + V.colMid, xb = s1 / w1 * V.colK + V.colMid;
    var j0 = Math.floor(xa < xb ? xa : xb), j1 = Math.floor(xa < xb ? xb : xa);
    if (j1 < 0 || j0 >= V.cols) return;
    if (j0 < 0) j0 = 0;
    if (j1 > V.cols - 1) j1 = V.cols - 1;
    var j, sp, den, u, a, rt, rb, r0, r1, row, dd, lat, l, tmp, pat, fade;
    for (j = j0; j <= j1; j++) {
      sp = (j + 0.5 - V.colMid) / V.colK;
      den = sp * dw - ds;
      /* A panel that projects into a single column has no gradient to invert; take its middle. */
      u = (den > 1e-9 || den < -1e-9) ? (s0 - sp * w0) / den : 0.5;
      if (u < 0) u = 0; else if (u > 1) u = 1;
      a = b0 + (b1 - b0) * u;
      if (!project(wx(axis, a, cross), y1, wz(axis, a, cross))) continue;
      rt = PJ.y; dd = PJ.d;
      /* THE APPROACH DISSOLVE, and it is here because the camera genuinely walks THROUGH these
       * things. A kerb prop stands at wallC + 1.55 m and the walk runs about a metre and a half
       * off the wall, so the two planes are the same plane to within a few centimetres several
       * times a minute. Clipping alone is honest about that and unwatchable: at seed 3 f2738 the
       * scaffold netting the camera is 0.49 m from covered the ENTIRE frame in a dotted veil.
       * A fade cannot be done in luminance, because most of a prop is a black occluder plate and
       * a black plate has no brightness to take away. It is done in COVERAGE instead: each cell
       * keeps a fixed random rank on the panel's own lattice, and the panel drops the cells whose
       * rank is above the fade. Cells then leave ONE AT A TIME as the viewer closes the last two
       * metres, so there is no frame where anything steps, and the near end of a long panel
       * dissolves before its far end, which is the way an object you are walking into should go.
       * 3.0 m is where a prop on the walk line starts to be a wall rather than an object, and by
       * 1.2 m it is closer than the eye can focus. */
      fade = (dd - 1.2) * 0.5556;
      if (fade <= 0) continue;
      if (fade > 1) fade = 1;
      if (!project(wx(axis, a, cross), y0, wz(axis, a, cross))) continue;
      rb = PJ.y;
      r0 = Math.floor(rt); r1 = Math.floor(rb);
      if (r1 < r0) { tmp = r0; r0 = r1; r1 = tmp; }
      /* The pattern's row origin is the panel's OWN top edge, captured before the frame clip
       * below moves it. Keyed on the clipped r0 the rib and mesh phases re-roll the moment a near
       * panel's top leaves the screen, which is the viewport-welded pattern this file spends four
       * paragraphs on elsewhere, in the one place it is largest on screen. */
      pat = r0;
      /* CLIP TO THE FRAME. Capping the raw run at N rows from its top looks like the same thing
       * and is not: a prop close enough for its top edge to leave the screen has a hugely negative
       * r0, so `r1 = r0 + N` cut the run off ABOVE the first visible row and the whole prop
       * silently disappeared exactly when it was largest. The frame clip is also the whole write
       * budget — at most rows+2 cells per column — so the fixed 60-row cap that used to follow it
       * is not just redundant, it is wrong on any frame taller than sixty: it sliced the bottom
       * off a near prop with a horizontal edge that has no business being there. */
      if (r0 < -1) r0 = -1;
      if (r1 > V.rows) r1 = V.rows;
      lat = Math.floor(a * 4.7) + (sd & 15);
      for (row = r0; row <= r1; row++) {
        /* The rank is drawn on the panel's lattice, never on the screen: a rank keyed on the cell
         * would re-roll every frame and the dissolve would boil instead of erode. Additive salt —
         * see street.js:467; an XOR of the seed is data-dependent and correlates with the jitter
         * hash two lines below, which shares its two coordinates. */
        if (fade < 1 && hash2(lat, row - pat, sd + 0x51) > fade) continue;
        l = lum;
        if (sty === STY_RIB) { if ((row - pat) & 1) l *= 0.32; }
        else if (sty === STY_MESH && ((lat + row - pat) & 1)) continue;
        if (jit) l += hash2(lat, row - pat, sd) * jit;
        emit(f, j, row, ch, col, l, dd);
      }
    }
  }

  /* One cell at one world point. `bias` pulls the write a fraction toward the eye, and every mark
   * that lies ON THE PAVEMENT needs it: the tarmac under a prop is at very nearly the prop's own
   * depth, CC.put wants a strict improvement, and a spill pool drawn at the road's exact distance
   * loses every tie and is simply never seen. street.js hit this first and calls it near(). */
  function pcell(f, axis, a, cross, y, ch, col, lum, bias) {
    if (!project(wx(axis, a, cross), y, wz(axis, a, cross))) return;
    emit(f, Math.floor(PJ.x), Math.floor(PJ.y), ch, col, lum, PJ.d * bias);
  }

  /* ---- the props themselves --------------------------------------------------------------------
   * Each takes the corridor axis, its position along the street, the plane of the building face,
   * the sign that points from that face toward the street centre, its own seed and its distance.
   * `wp` is the prop face (0.45 m proud of the wall, which is both true of a real machine and what
   * keeps it strictly nearer than the facade), `kp` the kerb, `bp` the back plane the dark mass
   * goes on. */
  function propVend(f, axis, a, wp, kp, inw, sd, dd) {
    var q = hash2(1, 0, sd);
    /* A vending machine is the best small light source this genre has, so it is allowed to be one
     * of the two pillars nearly every time; spring is the one in five that makes a row of them
     * read as different machines rather than one machine repeated. */
    var hue = q < 0.44 ? P.azure : (q < 0.82 ? P.amber : P.spring);
    panel(f, axis, a - 0.44, a + 0.44, wp, 0.60, 1.74, G_8, hue, 92, 58, STY_FLAT, sd);
    panel(f, axis, a - 0.58, a + 0.58, wp - inw * 0.05, 0, 2.04, 0, P.shadow, 0, 0, STY_FLAT, sd);
    // The top edge is the only part of the carcass that catches the street lamp above it.
    panel(f, axis, a - 0.58, a + 0.58, wp - inw * 0.05, 1.98, 2.06, G_EQ, P.slate, 40, 0, STY_FLAT, sd);
    /* The pool of its own light on the wet pavement. This is what makes the machine a LAMP rather
     * than a bright rectangle, and it is three cells. Wet weather doubles it, which is the cheapest
     * weather cue in the file. */
    var wl = 26 + 30 * W_WET;
    pcell(f, axis, a - 0.30, wp + inw * 0.55, 0.02, G_COMMA, hue, wl, 0.985);
    pcell(f, axis, a,        wp + inw * 0.75, 0.02, G_COLON, hue, wl * 1.2, 0.985);
    pcell(f, axis, a + 0.30, wp + inw * 0.55, 0.02, G_DOT,   hue, wl, 0.985);
  }

  function propShutter(f, axis, a, wp, kp, inw, sd, dd) {
    /* Half down: corrugation above, and under it the sliver of the shop that is still open. The
     * sliver is the point — a fully shut shutter is a dark rectangle and there are enough of those
     * already. */
    /* The sliver is 30 cm and meshed, and both numbers are the difference between a shop that is
     * still open and a light box: walk past this at six metres and the panel projects forty rows
     * tall, so a warm slab the full width of the opening was the brightest object in the frame and
     * put warm — a support swatch, capped at 8% of lit energy — over the two pillars on its own. */
    panel(f, axis, a - 1.30, a + 1.30, wp, 0.18, 0.48, G_UNDER, P.warm, 76, 30, STY_MESH, sd);
    panel(f, axis, a - 1.35, a + 1.35, wp - inw * 0.05, 0, 1.16, 0, P.shadow, 0, 0, STY_FLAT, sd);
    panel(f, axis, a - 1.40, a + 1.40, wp, 1.16, 2.72, G_EQ, P.slate, 30, 10, STY_RIB, sd);
    // The bottom rail of the shutter itself, which is the line that says "half down".
    panel(f, axis, a - 1.40, a + 1.40, wp + inw * 0.03, 1.16, 1.24, G_DASH, P.slate, 54, 0, STY_FLAT, sd);
    pcell(f, axis, a, wp + inw * 0.6, 0.02, G_COLON, P.warm, 30 + 26 * W_WET, 0.985);
  }

  function propBollard(f, axis, a, wp, kp, inw, sd, dd) {
    /* Four posts on the kerb. A row is what reads; one post is a stray mark. */
    var i, aa;
    for (i = 0; i < 4; i++) {
      aa = a - 1.65 + i * 1.1;
      segment3(f, wx(axis, aa, kp), 0.02, wz(axis, aa, kp),
                  wx(axis, aa, kp), 0.86, wz(axis, aa, kp), G_PIPE, P.slate, 34, 1);
      // The reflective band, which is the only reason a bollard is visible at night.
      pcell(f, axis, aa, kp, 0.90, G_oo, P.white, 74, 1);
    }
  }

  function propCrates(f, axis, a, wp, kp, inw, sd, dd) {
    /* Refuse against the wall: two stacks of crates and a heap of sacks beside them. Pure
     * silhouette apart from the top edges — this is mass, and mass is what the bottom of a wall
     * needs.
     *
     * TWO STACKS AND NOT ONE. It was a single 1 m box of '#' with one lit edge along the top, and
     * at the near end of its range that is 250-odd cells of uniform hatch in a rectangle: read as
     * a patch of wall texture rather than as an object, because nothing inside it says where one
     * thing ends and the next begins. The break costs one extra panel and one extra lit edge. The
     * edges are slate, deliberately: this is structure catching the street lamp, not a light, and
     * the two heights are what makes the silhouette say "stacked". */
    var hL = 1.26, hR = 0.94 + hash2(3, 0, sd) * 0.22;
    panel(f, axis, a - 0.85, a - 0.34, wp - inw * 0.05, 0, hL, G_HASH, P.shadow, 16, 8, STY_FLAT, sd);
    panel(f, axis, a - 0.85, a - 0.34, wp, hL - 0.08, hL + 0.02, G_EQ, P.slate, 44, 0, STY_FLAT, sd);
    panel(f, axis, a - 0.34, a + 0.15, wp - inw * 0.05, 0, hR, G_HASH, P.shadow, 14, 8, STY_FLAT, sd);
    panel(f, axis, a - 0.34, a + 0.15, wp, hR - 0.08, hR + 0.02, G_EQ, P.slate, 36, 0, STY_FLAT, sd);
    panel(f, axis, a + 0.15, a + 0.92, wp - inw * 0.05, 0, 0.62, G_oo, P.shadow, 14, 8, STY_FLAT, sd);
    /* The odd crate left on top of the taller stack, with its own edge so it reads as a separate
     * box rather than as the stack having grown. */
    if (hash2(4, 0, sd) < 0.4) {
      panel(f, axis, a - 0.78, a - 0.40, wp + inw * 0.10, hL, hL + 0.44, G_HASH, P.shadow, 15, 8, STY_FLAT, sd);
      panel(f, axis, a - 0.78, a - 0.40, wp + inw * 0.10, hL + 0.36, hL + 0.46, G_EQ, P.slate, 38, 0, STY_FLAT, sd);
    }
  }

  function propAC(f, axis, a, wp, kp, inw, sd, dd) {
    /* An air-conditioning unit at head height and above, which is the one prop here that furnishes
     * the wall BETWEEN the shopfront band and the fire escapes. */
    panel(f, axis, a - 0.40, a + 0.40, wp + inw * 0.15, 3.22, 3.68, G_EQ, P.slate, 32, 0, STY_RIB, sd);
    panel(f, axis, a - 0.46, a + 0.46, wp + inw * 0.10, 3.05, 3.86, G_HASH, P.slate, 22, 10, STY_FLAT, sd);
    /* The drip. One cell, falling on the unit's own phase, and the ROLL PER CYCLE is what makes it
     * weather: a dry night drips now and then, a wet one runs steadily. Frozen under reduced
     * motion rather than slowed — a single cell teleporting down a wall is exactly the kind of
     * motion the flag exists to remove. */
    if (!CC.reducedMotion) {
      var ph = V.t * 0.62 + (sd & 31) * 0.19, k = Math.floor(ph), fr = ph - k;
      if (hash2(k, 0, sd + 11) < 0.22 + 0.46 * W_WET)
        pcell(f, axis, a + 0.12, wp + inw * 0.18, 3.02 - fr * fr * 3.0, G_QUOTE, P.ice, 96, 1);
    }
    // The stain it has made under itself, which is only visible when the pavement is wet.
    if (W_WET > 0.5)
      pcell(f, axis, a + 0.12, wp + inw * 0.35, 0.02, G_COMMA, P.ice, 16 + 18 * W_WET, 0.985);
  }

  function propBanner(f, axis, a, wp, kp, inw, sd, dd) {
    /* Cloth on a bracket, and the best wind gauge in the frame: the sway is the whole prop.
     * Amplitude grows down the cloth, because that is how a hung banner moves and because a slab
     * translating sideways as one piece reads as a sprite sliding rather than as fabric. */
    var q = hash2(6, 0, sd);
    var hue = q < 0.44 ? P.ember : (q < 0.84 ? P.amber : P.violet);
    var p = wp + inw * 0.42, i, y, s, amp = W_GUST * 0.40 * W_SWAY, ph = (sd & 63) * 0.11;
    segment3(f, wx(axis, a, wp - inw * 0.3), 4.02, wz(axis, a, wp - inw * 0.3),
                wx(axis, a, p), 4.02, wz(axis, a, p), G_DASH, P.slate, 32, 1);
    for (i = 0; i < 9; i++) {
      y = 3.92 - i * 0.20;
      /* i/8 squared, so the top stays pinned to its bracket and the hem does the travelling. */
      s = amp * (i / 8) * (i / 8) * Math.sin(V.tt * 1.45 + ph + i * 0.30);
      segment3(f, wx(axis, a - 0.26 + s, p), y, wz(axis, a - 0.26 + s, p),
                  wx(axis, a + 0.26 + s, p), y, wz(axis, a + 0.26 + s, p),
               i === 8 ? G_V : G_8, hue, i === 8 ? 46 : 62 + hash2(i, 0, sd) * 40, 1);
    }
  }

  function propCallbox(f, axis, a, wp, kp, inw, sd, dd) {
    /* A call box: a dark cabinet with one lit panel in it. The lamp on top is the tell — a box
     * with a small steady light beside a much bigger dark shape reads as public infrastructure. */
    panel(f, axis, a - 0.26, a + 0.26, wp, 1.48, 2.06, G_8, P.azure, 104, 40, STY_FLAT, sd);
    panel(f, axis, a - 0.40, a + 0.40, wp - inw * 0.05, 0, 2.28, 0, P.shadow, 0, 0, STY_FLAT, sd);
    panel(f, axis, a - 0.40, a + 0.40, wp - inw * 0.05, 2.22, 2.30, G_EQ, P.slate, 38, 0, STY_FLAT, sd);
    var ph = V.t * 0.31 + (sd & 15) * 0.21; ph -= Math.floor(ph);
    pcell(f, axis, a, wp, 2.42, G_oo, P.ember,
          CC.reducedMotion ? 96 : (ph < 0.5 ? 150 : 44), 1);
    pcell(f, axis, a, wp + inw * 0.5, 0.02, G_COLON, P.azure, 18 + 20 * W_WET, 0.985);
  }

  function propLadder(f, axis, a, wp, kp, inw, sd, dd) {
    /* A ladder left against the wall. Rails plus rungs, all dashed: solid ironwork at this cell
     * size reads as a lit edge, which is the note the fire escapes above are drawn to. */
    var p = wp + inw * 0.08, i, y, top = 4.6 + hash2(7, 0, sd) * 1.6;
    segment3(f, wx(axis, a - 0.26, p), 0.1, wz(axis, a - 0.26, p),
                wx(axis, a - 0.26, p), top, wz(axis, a - 0.26, p), G_PIPE, P.slate, 30, 1);
    segment3(f, wx(axis, a + 0.26, p), 0.1, wz(axis, a + 0.26, p),
                wx(axis, a + 0.26, p), top, wz(axis, a + 0.26, p), G_PIPE, P.slate, 30, 1);
    for (y = 0.45; y < top; y += 0.52)
      segment3(f, wx(axis, a - 0.26, p), y, wz(axis, a - 0.26, p),
                  wx(axis, a + 0.26, p), y, wz(axis, a + 0.26, p), G_DASH, P.slate, 26, 1);
  }

  function propPlanter(f, axis, a, wp, kp, inw, sd, dd) {
    /* The one place spring is allowed down here, and it is six cells of it. Foliage is scattered on
     * the planter's own lattice rather than filled, or a street tree comes out as a green slab. */
    panel(f, axis, a - 0.70, a + 0.70, kp, 0, 0.54, G_HASH, P.slate, 24, 8, STY_FLAT, sd);
    panel(f, axis, a - 0.70, a + 0.70, kp, 0.50, 0.58, G_EQ, P.slate, 46, 0, STY_FLAT, sd);
    var i, aa, y;
    for (i = 0; i < 7; i++) {
      aa = a - 0.55 + hash2(i, 1, sd) * 1.1;
      y = 0.62 + hash2(i, 2, sd) * 0.72;
      pcell(f, axis, aa, kp + inw * (hash2(i, 3, sd) - 0.5) * 0.3, y,
            hash2(i, 4, sd) < 0.5 ? G_AMP : G_PCT, P.spring, 34 + hash2(i, 5, sd) * 30, 1);
    }
  }

  function propHoard(f, axis, a, wp, kp, inw, sd, dd) {
    /* A construction hoarding: a long flat nothing at the kerb whose entire job is to hide the
     * shopfront band behind it and carry one blinking lamp. A dark mass that big is a gift to a
     * frame that is 43% black — it is the black, placed on purpose. */
    panel(f, axis, a - 2.1, a + 2.1, kp, 0, 2.16, 0, P.shadow, 0, 0, STY_FLAT, sd);
    panel(f, axis, a - 2.1, a + 2.1, kp, 2.10, 2.18, G_EQ, P.slate, 36, 0, STY_FLAT, sd);
    // Hazard stripes, dashed rather than drawn: a solid band of ember at the kerb is a sign.
    panel(f, axis, a - 2.0, a + 2.0, kp + inw * 0.02, 1.72, 1.88, G_SL, P.ember, 30, 12, STY_MESH, sd);
    var ph = V.t * 1.05 + (sd & 31) * 0.13; ph -= Math.floor(ph);
    pcell(f, axis, a + 1.9, kp, 2.34, G_0, P.amber,
          CC.reducedMotion ? 110 : (ph < 0.34 ? 208 : 30), 1);
    pcell(f, axis, a + 1.9, kp + inw * 0.4, 0.02, G_COLON, P.amber,
          (CC.reducedMotion ? 22 : (ph < 0.34 ? 44 : 8)) * (0.6 + W_WET * 0.8), 0.985);
  }

  function propScaff(f, axis, a, wp, kp, inw, sd, dd) {
    /* Scaffolding, which is the one prop here that reaches all the way up into the territory the
     * fire escapes own — and that is the point of it: it ties the empty pavement to the crowded
     * roofline instead of leaving them two unrelated bands. */
    var p = wp + inw * 0.55, i, y, aa, top = 6.4 + hash2(8, 0, sd) * 3.4;
    for (i = 0; i < 3; i++) {
      aa = a - 1.9 + i * 1.85;
      segment3(f, wx(axis, aa, p), 0.05, wz(axis, aa, p),
                  wx(axis, aa, p), top, wz(axis, aa, p), G_PIPE, P.slate, 30, 2);
    }
    for (y = 2.3; y < top; y += 2.4) {
      segment3(f, wx(axis, a - 1.9, p), y, wz(axis, a - 1.9, p),
                  wx(axis, a + 1.8, p), y, wz(axis, a + 1.8, p), G_EQ, P.slate, 34, 2);
      // One brace per lift, alternating, which is what stops it reading as a plain grid.
      segment3(f, wx(axis, a - 1.9, p), y - 2.4, wz(axis, a - 1.9, p),
                  wx(axis, a - 0.05, p), y, wz(axis, a - 0.05, p), G_SL, P.slate, 22, 3);
    }
    /* The debris netting on the bottom lift, meshed so it is a veil rather than a wall. */
    panel(f, axis, a - 1.9, a + 1.8, p + inw * 0.06, 0.1, 2.3, G_COLON, P.slate, 18, 6, STY_MESH, sd);
  }

  function propShelter(f, axis, a, wp, kp, inw, sd, dd) {
    /* A bus shelter: a roof, two posts, a bench and one back-lit advertising panel. The panel is
     * doing all the work — a lit rectangle at knee-to-shoulder height with a dark roof over it is
     * the single most legible object this element draws. */
    /* Stood ON the kerb, not past it: the shelter is the widest thing this element puts on the
     * pavement and a quarter of a metre further out was enough to have it standing in the road on
     * a narrow corridor. */
    var p = kp;
    panel(f, axis, a - 1.05, a - 0.05, p, 0.55, 2.10, G_8, P.azure, 96, 46, STY_FLAT, sd);
    panel(f, axis, a - 1.05, a - 0.05, p - inw * 0.05, 0, 2.20, 0, P.shadow, 0, 0, STY_FLAT, sd);
    panel(f, axis, a - 1.75, a + 1.75, p, 2.28, 2.44, G_EQ, P.slate, 38, 0, STY_FLAT, sd);
    segment3(f, wx(axis, a + 1.70, p), 0.05, wz(axis, a + 1.70, p),
                wx(axis, a + 1.70, p), 2.28, wz(axis, a + 1.70, p), G_PIPE, P.slate, 30, 1);
    segment3(f, wx(axis, a - 1.70, p), 0.05, wz(axis, a - 1.70, p),
                wx(axis, a - 1.70, p), 2.28, wz(axis, a - 1.70, p), G_PIPE, P.slate, 30, 1);
    segment3(f, wx(axis, a + 0.15, p - inw * 0.2), 0.45, wz(axis, a + 0.15, p - inw * 0.2),
                wx(axis, a + 1.60, p - inw * 0.2), 0.45, wz(axis, a + 1.60, p - inw * 0.2),
             G_UNDER, P.slate, 30, 1);
    pcell(f, axis, a - 0.55, p + inw * 0.7, 0.02, G_COLON, P.azure, 24 + 30 * W_WET, 0.985);
  }

  function propNewsbox(f, axis, a, wp, kp, inw, sd, dd) {
    /* A news box. Small, chest-high, one ember face — the cheapest prop in the file and the one
     * that makes a kerb look used. */
    panel(f, axis, a - 0.26, a + 0.26, kp, 0.42, 0.96, G_8, P.ember, 64, 26, STY_FLAT, sd);
    panel(f, axis, a - 0.30, a + 0.30, kp - inw * 0.05, 0, 1.06, 0, P.shadow, 0, 0, STY_FLAT, sd);
    panel(f, axis, a - 0.30, a + 0.30, kp - inw * 0.05, 1.00, 1.08, G_DASH, P.slate, 40, 0, STY_FLAT, sd);
  }

  function propStair(f, axis, a, wp, kp, inw, sd, dd) {
    /* A stairwell going down, with the light coming UP out of it. It is the only light in the
     * whole build that arrives from below the pavement, which is why it is worth thirty cells:
     * everything else down here is lit from a shopfront or a street lamp, and the eye notices the
     * one thing that is not.
     * Drawn as a ramp of ground cells brightening toward the wall end, so the opening reads as a
     * hole with a lit throat rather than as a rug. */
    var i, j, c, aa, l, hue = hash2(9, 0, sd) < 0.7 ? P.warm : P.spring;
    /* The opening reaches the kerb and stops. It ran to 2.4 m first, which is past the kerb line
     * into the carriageway on any corridor narrower than six metres — a stairwell with cars
     * driving over it. The pavement here is the 1.4 m strip raycast.configureFor lays out. */
    for (i = 0; i < 5; i++) {
      c = wp + inw * (0.22 + i * 0.30);
      l = 118 - i * 19;                              // brightest at the throat, against the wall
      for (j = 0; j < 5; j++) {
        aa = a - 0.86 + j * 0.43;
        pcell(f, axis, aa, c, 0.02, i === 0 ? G_8 : G_EQ, hue, l, 0.985);
      }
    }
    // The handrail round the opening, which is what gives the light a shape to come out of.
    segment3(f, wx(axis, a - 0.95, wp + inw * 1.65), 0.98, wz(axis, a - 0.95, wp + inw * 1.65),
                wx(axis, a + 0.95, wp + inw * 1.65), 0.98, wz(axis, a + 0.95, wp + inw * 1.65),
             G_DASH, P.slate, 44, 1);
    segment3(f, wx(axis, a + 0.95, wp + inw * 1.65), 0.05, wz(axis, a + 0.95, wp + inw * 1.65),
                wx(axis, a + 0.95, wp + inw * 1.65), 1.02, wz(axis, a + 0.95, wp + inw * 1.65),
             G_PIPE, P.slate, 36, 1);
  }

  function propWash(f, axis, a, wp, kp, inw, sd, dd) {
    /* A washing line. Four cloths on a wire, and they are the second wind gauge: the whole line
     * lifts and the sheets swing on it, all off the one gust magnitude the file shares. */
    var p = wp + inw * 0.35, i, aa, s, y, amp = W_GUST * 0.34 * W_SWAY, ph = (sd & 31) * 0.2;
    /* The wire runs ALONG the wall, not across the street, so it is a segment and not a cable run:
     * drawCableRun sweeps `cross` at a fixed `along`, which would have strung this washing line out
     * into the traffic. Over 3.8 m the sag is a couple of centimetres and worth nothing here. */
    segment3(f, wx(axis, a - 1.9, p), 4.32, wz(axis, a - 1.9, p),
                wx(axis, a + 1.9, p), 4.30, wz(axis, a + 1.9, p), G_DASH, P.slate, 30, 1);
    /* Nobody leaves the washing out in a downpour. The empty line stays — that is the half of the
     * observation that makes the other half read — and the sheets come in above about a third of
     * the reference rainfall, which is the point where the street's umbrellas go up too. */
    if (W_RAIN > 0.6) return;
    for (i = 0; i < 4; i++) {
      aa = a - 1.35 + i * 0.9;
      s = amp * Math.sin(V.tt * 1.2 + ph + i * 0.8);
      for (y = 4.18; y > 3.35; y -= 0.20) {
        segment3(f, wx(axis, aa - 0.18 + s, p), y, wz(axis, aa - 0.18 + s, p),
                    wx(axis, aa + 0.18 + s, p), y, wz(axis, aa + 0.18 + s, p),
                 G_8, i & 1 ? P.white : P.slate, 40 + hash2(i, (y * 5) | 0, sd) * 22, 1);
      }
    }
  }

  function drawProps(f) {
    if (!CITY) return;
    var axis, idx, n, side, r, along, dd, kind, sd, wallC, inw, wp, kp;
    for (axis = 0; axis < 2; axis++) {
      for (idx = idxLo(axis); idx <= idxHi(axis); idx++) {
        streetSpan(axis, idx);
        if (SPAN.w < 4) continue;                    // an alley has no pavement to stand on
        for (n = alongLo(axis, 6); n <= alongHi(axis, 6); n++) {
          for (side = 0; side < 2; side++) {
            r = hash2(idx * 2 + side, n, BASE ^ 0x9701);
            if (r > 0.50) continue;                  // about one prop every eleven metres per side
            along = n * 6 + hash2(idx * 2 + side, n, BASE ^ 0x9702) * 4.6;
            wallC = side ? SPAN.c1 : SPAN.c0;
            inw = side ? -1 : 1;                     // from the building face toward the centre
            /* -3.2 m, not the default metre: a prop is up to 4.2 m long, so its midpoint passes
             * the eye plane while its far half is still across a third of the frame. The old
             * midpoint test at w < 1 threw the whole prop away there, in one frame, which is the
             * second half of the same pop clipNear() fixes — and unlike the panel bail it fires on
             * every prop that the viewer walks past rather than only on the long ones. Everything
             * that survives to be drawn is clipped exactly by clipNear(). */
            dd = spanVisible(axis, along, wallC + inw, -3.2);
            /* Past forty-odd metres a prop is two fogged cells and a lie about detail; the work is
             * better spent on the ones the viewer is about to walk past. */
            if (!dd || dd > 44) continue;
            // Half a metre INTO the building, so the probe can never land on the street itself.
            if (anchorH(axis, along, wallC - inw * 0.5) < 3) continue;
            sd = BASE ^ (idx * 977 + n * 6151 + side * 37);
            wp = wallC + inw * 0.45;
            kp = wallC + inw * 1.55;
            kind = KIND[(hash2(idx * 2 + side, n, BASE ^ 0x9703) * KIND.length) | 0];
            switch (kind) {
              case K_VEND:    propVend(f, axis, along, wp, kp, inw, sd, dd); break;
              case K_SHUTTER: propShutter(f, axis, along, wp, kp, inw, sd, dd); break;
              case K_BOLLARD: propBollard(f, axis, along, wp, kp, inw, sd, dd); break;
              case K_CRATES:  propCrates(f, axis, along, wp, kp, inw, sd, dd); break;
              case K_AC:      propAC(f, axis, along, wp, kp, inw, sd, dd); break;
              case K_BANNER:  propBanner(f, axis, along, wp, kp, inw, sd, dd); break;
              case K_CALLBOX: propCallbox(f, axis, along, wp, kp, inw, sd, dd); break;
              case K_LADDER:  propLadder(f, axis, along, wp, kp, inw, sd, dd); break;
              case K_PLANTER: propPlanter(f, axis, along, wp, kp, inw, sd, dd); break;
              case K_HOARD:   propHoard(f, axis, along, wp, kp, inw, sd, dd); break;
              case K_SCAFF:   propScaff(f, axis, along, wp, kp, inw, sd, dd); break;
              case K_SHELTER: propShelter(f, axis, along, wp, kp, inw, sd, dd); break;
              case K_NEWSBOX: propNewsbox(f, axis, along, wp, kp, inw, sd, dd); break;
              case K_STAIR:   propStair(f, axis, along, wp, kp, inw, sd, dd); break;
              case K_WASH:    propWash(f, axis, along, wp, kp, inw, sd, dd); break;
              /* Unreachable while every entry in KIND has a case above, which is the point of
               * writing it out: a kind added to the bag and forgotten here draws a crate rather
               * than nothing, so the mistake is visible instead of silent. */
              default:        propCrates(f, axis, along, wp, kp, inw, sd, dd); break;
            }
          }
        }
      }
    }
  }

  /* ---- registration ---------------------------------------------------------------------------
   * All seven are pure functions of (world, t): no simulation state, so no update(). That also
   * makes them scrub-safe — jumping to frame 900 and back gives byte-identical frames. */
  function mk(name, layer, fn) {
    return {
      name: name, layer: layer,
      init: function (city, rng) { boot(city, rng); },
      draw: function (f, cam, t) {
        view(f, cam, t === undefined ? (cam.t || 0) : t);
        fn(f);
      }
    };
  }

  CC.ELEMENTS.push(mk('streetprops', 19, drawProps));
  CC.ELEMENTS.push(mk('skybridges', 20, drawBridges));
  CC.ELEMENTS.push(mk('rooftop-plant', 21, drawPlant));
  CC.ELEMENTS.push(mk('masts', 22, drawMasts));
  CC.ELEMENTS.push(mk('fire-escapes', 23, drawEscapes));
  CC.ELEMENTS.push(mk('cables', 24, drawCables));
  CC.ELEMENTS.push(mk('lanterns', 26, drawLanterns));

})(typeof CC !== 'undefined' ? CC : require('../core.js'));
