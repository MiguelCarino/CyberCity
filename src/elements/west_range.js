/* CyberCity frontier country — what is outside the town, and the one thing that moves in it.
 * Layers 15-23.
 *
 * city.js's `range` district is 26% of the frontier's ground by weight and 62% of its lots are
 * empty, which means the walk regularly comes out of a street of shopfronts into open country.
 * Empty ground rendered honestly is empty: surf_west.js paints dirt and that is all there is. So
 * everything in this file exists to give the country three things the town gets for free —
 *
 *   A LINE THAT CONVERGES.  The telegraph runs beside the road whether or not there is a town
 *     round it, and a row of poles with a wire slung between them is the only perspective cue
 *     available on open ground. It is also, historically, the correct one: the line went in with
 *     the road and it is the first thing built anywhere out here.
 *   SOMETHING WITH A SIZE.  Brush and cactus. A saguaro is human-scale and a sage clump is
 *     knee-high, and having both means the eye can read distance off them.
 *   SOMETHING THAT MOVES.   One tumbleweed. It is the single most recognisable motion in the
 *     setting and it costs about forty cells.
 *
 * The poles and the brush are pure functions of (world, t). The tumbleweed is the only element in
 * either world that carries simulation state, and it is written so that state is recoverable from
 * t alone — see the note on it.
 */
(function (CC) {
  'use strict';

  /* One projector per element — see src/proj.js. V and PJ are this element's own
   * basis and scratch; the four functions are closed over them. */
  var PR = CC.Proj.make(), V = PR.V, PJ = PR.PJ;
  var project = PR.project, emit = PR.emit, column = PR.column, litFace = PR.litFace;

  var P = CC.P, hash2 = CC.hash2, put = CC.put, vnoise = CC.vnoise, clamp = CC.clamp;

  var G_PIPE = CC.g('|'), G_DASH = CC.g('-'), G_UNDER = CC.g('_'), G_DOT = CC.g('.'),
      G_COMMA = CC.g(','), G_TICK = CC.g('`'), G_QUOTE = CC.g("'"), G_STAR = CC.g('*'),
      G_o = CC.g('o');

  var CITY = null, BASE = 0, Surf = null, WEST = null;
  function boot(city) {
    CITY = (city && city.aveX && city.world === 'west') ? city : null;
    BASE = CITY ? ((Math.imul(CITY.seed | 0, 26417) >>> 7) & 0x3fffff) : 0;
  }

  var W_WIND = 1, W_RAIN = 0, W_DUST = 0.3;

  /* The camera basis and its four helpers live in src/proj.js — see that file for
   * why there is only one copy of them. What stays here is whatever THIS element
   * caches per frame on top of it. */
  function view(f, cam, t) {
    PR.view(f, cam, t);
    /* The two module handles the old in-file view() used to set. They were assigned
     * inside the body that moved to src/proj.js, and leaving them null took the
     * fallback branch at every site that reads WEST — which is how a refactor that was
     * supposed to be byte-identical moved 1105 cells of a frontier frame. Resolved off
     * the painter registry rather than by CC.SurfWest's name, so an element copied into
     * another world picks up that world's painter. */
    if (!Surf) Surf = CC.Surf;
    if (!WEST) WEST = (CC.SURFACES && CC.World) ? CC.SURFACES[CC.World.id] : null;
    W_WIND = CC.Weather ? CC.Weather.rel('wind') : 1;
    W_RAIN = CC.Weather ? CC.Weather.P.rain : 0;
    W_DUST = CC.Weather ? CC.Weather.P.haze : 0.3;
  }








  function wx(axis, along, cross) { return axis ? along : cross; }
  function wz(axis, along, cross) { return axis ? cross : along; }
  function nearIdx(axis) {
    return Math.round((axis ? V.oz : V.ox) / (axis ? CITY.CROSS : CITY.AVE));
  }

  /* ================================================================================ telegraph ===
   * ONE SIDE OF THE ROAD ONLY, and always the same side of the same street, because a telegraph
   * line down both sides is a thing that has never existed and reads immediately as wrong. Which
   * side is a function of the street index, so walking the same avenue twice gives the same line.
   *
   * The WIRE is the reason this element is worth its cost. A row of poles is a row of sticks; a
   * row of poles with a catenary between them is a line running to the horizon, and a catenary is
   * three multiplications. It is drawn in world space and sampled, so it takes the perspective for
   * free and sags correctly in the near span where the sag is actually visible.
   */
  var POLE_PITCH = 27.0, POLE_H = 7.4;

  function drawTelegraph(f, axis, idx) {
    var c, hw;
    if (axis) { c = CITY.crossZ(idx); hw = CITY.crossW(idx); }
    else      { c = CITY.aveX(idx);   hw = CITY.aveW(idx); }
    /* Just outside the boardwalk on its chosen side — a pole stands off the road, not in it. */
    var side = hash2(idx, axis, BASE + 0x11) < 0.5 ? -1 : 1;
    var cross = c + 0.5 + side * (hw + 0.75);

    var here = axis ? V.ox : V.oz;
    var lo = Math.floor((here - 90) / POLE_PITCH), hi = Math.floor((here + 90) / POLE_PITCH);
    if (hi - lo > 12) hi = lo + 12;

    var sunA = litFace(axis ? 1 : 0, axis ? 0 : 1);
    var sunB = litFace(axis ? -1 : 0, axis ? 0 : -1);
    var sun = sunA > sunB ? sunA : sunB;
    /* ---- THE DAY, from the painter that owns it (surf_west.js's dFill) -------------------------
     * `sun > 0.6 ? P.amber : P.slate` is a creosoted pole picked out of the dark by a low sun. At
     * noon it is a creosoted pole: dark brown against a bright sky, which is the OPPOSITE relation
     * to the background and is what makes a pole line read at midday. So the day swatches are
     * timber and stone rather than amber and slate, and the pole gets DARKER against its
     * surroundings rather than brighter — the one object in this pass that does. */
    var dF = (CC.SurfWest && CC.SurfWest.dayFill !== undefined) ? CC.SurfWest.dayFill : 0;
    var day = hash2(idx, axis, BASE + 0x14) < dF;
    var pcol = day ? (sun > 0.6 ? P.timber : P.stone) : (sun > 0.6 ? P.amber : P.slate);
    var plum = day ? (sun > 0.6 ? 120 : 86) : (sun > 0.6 ? 96 : 26);

    for (var k = lo; k <= hi; k++) {
      var a0 = k * POLE_PITCH + hash2(k, idx, BASE + 0x12) * 3.0;
      var a1 = (k + 1) * POLE_PITCH + hash2(k + 1, idx, BASE + 0x12) * 3.0;
      var hgt = POLE_H + hash2(k, idx, BASE + 0x13) * 1.2;
      /* A pole standing inside a building is a pole nobody put there. */
      if (CITY.height(wx(axis, a0, cross), wz(axis, a0, cross)) > 0.5) continue;

      column(f, wx(axis, a0, cross), wz(axis, a0, cross), 0, hgt, G_PIPE, pcol, plum, 0);
      /* The crossarm, two cells either side of the head — the shape that says telegraph and not
       * fencepost, and the only place the insulators can go. */
      var ay = hgt - 0.55;
      var i;
      /* THE INSULATORS, day and near field only. Two white glass knobs on the crossarm, and they
       * are the only bright thing on a pole — which is exactly how one reads against a sky. Gated
       * on distance because at thirty metres they are the same cell as the crossarm. */
      /* No objVisible() in this file, so the distance test is the projected depth of the pole
       * head — which project() has already computed one line up in column(). PJ is the shared
       * scratch and is still holding it. */
      if (day && PJ.d < 26) {
        for (i = -1; i <= 1; i += 2) {
          if (project(wx(axis, a0, cross + i * 0.9), ay + 0.22, wz(axis, a0, cross + i * 0.9)))
            emit(f, Math.floor(PJ.x), Math.floor(PJ.y), G_o,
                 sun > 0.6 ? P.white : P.stone, sun > 0.6 ? 176 : 108, PJ.d);
        }
      }
      for (i = -1; i <= 1; i++) {
        if (!i) continue;
        var ax2 = wx(axis, a0, cross + i * 0.9), az2 = wz(axis, a0, cross + i * 0.9);
        if (project(ax2, ay, az2))
          emit(f, Math.floor(PJ.x), Math.floor(PJ.y), G_DASH, pcol, plum, PJ.d);
      }

      /* The wire. Sag is a fraction of the span and it is only ever visible on the near one or
       * two, which is why it is worth having at all. */
      var span = a1 - a0, sag = 0.9;
      var lx = -1, ly = 0, ld = 0;
      for (i = 0; i <= 16; i++) {
        var u = i / 16, a = a0 + span * u;
        var yy = hgt - 0.2 - sag * 4 * u * (1 - u);
        if (!project(wx(axis, a, cross), yy, wz(axis, a, cross))) { lx = -1; continue; }
        var px = Math.floor(PJ.x), py = Math.floor(PJ.y), pd = PJ.d;
        if (lx >= 0 && (pd > ld * 2 || ld > pd * 2)) lx = -1;
        if (lx >= 0) {
          var dx = px - lx, dy = py - ly;
          var st = Math.abs(dx) > Math.abs(dy) ? Math.abs(dx) : Math.abs(dy);
          if (st > V.cols * 2) st = 0;
          for (var q = 1; q < st; q++) {
            var tq = q / st;
            emit(f, lx + Math.round(dx * tq), ly + Math.round(dy * tq), G_DOT,
                 day ? P.timber : P.slate, day ? 96 : (sun > 0.6 ? 40 : 18),
                 ld + (pd - ld) * tq);
          }
        }
        /* THE WIRE ITSELF, and by day it is a DARK line on a bright sky rather than a faint one
         * on a dark sky. Same swatch inversion as the pole, and the same reason: a wire is a
         * silhouette at every hour, and slate at gain 0.78 by day would print it as a pale streak
         * across the dome. It stays one glyph wide and gets no more ink than it had — a thin
         * bright line that a walking camera steps across is the failure the whole project's
         * photosensitivity rule is written for, and the fix for it here is to keep it thin AND
         * dark, not to make it heavier. */
        emit(f, px, py, G_DOT, day ? P.timber : P.slate,
             day ? 96 : (sun > 0.6 ? 40 : 18), pd);
        lx = px; ly = py; ld = pd;
      }
    }
  }

  /* ==================================================================================== brush ===
   * Sage on a 3 m lattice and saguaro on a 17 m one, both restricted to cells that are genuinely
   * open ground. The height probe is the whole placement rule: a plant is anywhere the town is not.
   *
   * SAGE IS THE ONLY THING IN EITHER WORLD PAINTED IN SPRING. core.js keeps that swatch for
   * "foliage" and the city spends it on rooftop planting; out here it is the one living colour in
   * the frame and it is deliberately kept to a couple of cells per clump — a desert is not green,
   * it has green things in it. */
  var SAGE_LAT = 3.1, CACTUS_LAT = 17.0, BRUSH_R = 52;

  function drawBrush(f) {
    var lo0 = Math.floor((V.ox - BRUSH_R) / SAGE_LAT), hi0 = Math.floor((V.ox + BRUSH_R) / SAGE_LAT);
    var lo1 = Math.floor((V.oz - BRUSH_R) / SAGE_LAT), hi1 = Math.floor((V.oz + BRUSH_R) / SAGE_LAT);
    var i, j;
    for (j = lo1; j <= hi1; j++) {
      for (i = lo0; i <= hi0; i++) {
        var h = hash2(i, j, BASE + 0x21);
        if (h > 0.16) continue;
        var px = i * SAGE_LAT + hash2(i, j, BASE + 0x22) * SAGE_LAT;
        var pz = j * SAGE_LAT + hash2(i, j, BASE + 0x23) * SAGE_LAT;
        /* Open ground only, and not in the middle of the carriageway — a wheel rut is not where a
         * bush grows. The road test is cheap: the road is where the walk is, and the walk is where
         * the height is 0 for a long way in both directions, so instead the probe asks whether the
         * NEIGHBOURING cells are also clear. Two probes, not eight: this runs a thousand times. */
        if (CITY.height(px, pz) > 0.1) continue;
        if (CITY.height(px + 2.4, pz) <= 0.1 && CITY.height(px - 2.4, pz) <= 0.1 &&
            CITY.height(px, pz + 2.4) <= 0.1 && CITY.height(px, pz - 2.4) <= 0.1 &&
            hash2(i, j, BASE + 0x24) > 0.45) continue;      // wide open: that is the road, thin it
        var rx = px - V.ox, rz = pz - V.oz;
        var w = rx * V.fwx + rz * V.fwz;
        if (w < 0.9 || w > 60) continue;
        var hh = 0.30 + h * 2.6;                            // 0.3-0.75 m
        if (!project(px, hh, pz)) continue;
        var x = Math.floor(PJ.x), y = Math.floor(PJ.y), d = PJ.d;
        if (x < -1 || x >= V.cols + 1) continue;
        var lum = 30 + h * 260;
        emit(f, x, y, h < 0.06 ? G_STAR : G_TICK, P.spring, lum, d);
        if (d < 16) {
          emit(f, x - 1, y, G_QUOTE, P.spring, lum * 0.6, d);
          emit(f, x + 1, y, G_TICK, P.spring, lum * 0.6, d);
          if (project(px, hh * 0.4, pz))
            emit(f, x, Math.floor(PJ.y), G_COMMA, P.slate, 22, PJ.d);
        }
      }
    }

    /* The saguaro. Two arms and a trunk, three to five metres, and it is the one plant out here
     * that is taller than a person — which is why it gets a lit side and a dark side like a
     * building rather than a single colour like the sage. */
    var c0 = Math.floor((V.ox - 70) / CACTUS_LAT), c1 = Math.floor((V.ox + 70) / CACTUS_LAT);
    var c2 = Math.floor((V.oz - 70) / CACTUS_LAT), c3 = Math.floor((V.oz + 70) / CACTUS_LAT);
    for (j = c2; j <= c3; j++) {
      for (i = c0; i <= c1; i++) {
        var ch2 = hash2(i, j, BASE + 0x31);
        if (ch2 > 0.34) continue;
        var qx = i * CACTUS_LAT + hash2(i, j, BASE + 0x32) * CACTUS_LAT;
        var qz = j * CACTUS_LAT + hash2(i, j, BASE + 0x33) * CACTUS_LAT;
        if (CITY.height(qx, qz) > 0.1) continue;
        if (CITY.height(qx + 3, qz) > 0.1 || CITY.height(qx - 3, qz) > 0.1) continue;
        var rx2 = qx - V.ox, rz2 = qz - V.oz;
        var w2 = rx2 * V.fwx + rz2 * V.fwz;
        if (w2 < 1.2 || w2 > 78) continue;
        var th = 2.6 + ch2 * 7.0;
        /* A CYLINDER, NOT A WALL, which is why it does not go through litFace. Every other object
         * in this world is a flat face with one normal and is either lit or not; a saguaro trunk
         * presents every normal at once, so the honest thing is the lit half and the dark half
         * side by side. Close up that is two columns — the sunward one in spring, the other in
         * slate — and far away it collapses to the lit one, which is correct: at forty metres the
         * dark half is under a cell wide. */
        var sunX = (WEST && WEST.SUN_X < 0) ? -1 : 1;
        column(f, qx, qz, 0, th, G_PIPE, P.spring, 98, 0);
        if (w2 < 18) column(f, qx - sunX * 0.30, qz, 0, th * 0.96, G_PIPE, P.slate, 26, 0);
        var col = P.spring, lum = 98;
        /* The arms: up, out, up. Drawn as three short columns rather than as a curve, because at
         * this cell size a curve is three cells anyway and a curve costs an atan. */
        var ah = th * (0.42 + ch2 * 0.4);
        column(f, qx - 0.55, qz, ah, ah + th * 0.34, G_PIPE, col, lum, 0);
        if (project(qx - 0.28, ah, qz)) emit(f, Math.floor(PJ.x), Math.floor(PJ.y), G_UNDER, col, lum, PJ.d);
        if (ch2 < 0.20) {
          column(f, qx + 0.55, qz, ah * 0.8, ah * 0.8 + th * 0.28, G_PIPE, col, lum, 0);
          if (project(qx + 0.28, ah * 0.8, qz)) emit(f, Math.floor(PJ.x), Math.floor(PJ.y), G_UNDER, col, lum, PJ.d);
        }
      }
    }
  }

  /* =============================================================================== tumbleweed ===
   * THE ONE STATEFUL ELEMENT IN THE BUILD, and it is worth the exception. Everything else here is
   * a pure function of (world, t) so the offline harness reproduces the browser exactly; a
   * tumbleweed cannot be, because where it is depends on where it has BEEN — it rolls until it
   * hits something and then it goes round it.
   *
   * The exception is contained the same way the weather director contains its override: the state
   * is reset from t in init(), it advances only in update(), and it is a single position and phase
   * per weed. The harness replays every tick, so it gets the same answer the browser does at the
   * same frame — see the replay note in tools/headless.cjs, which exists for exactly this shape of
   * element. What it is NOT is scrub-safe: jumping to frame 9000 without replaying gives a weed
   * somewhere else. Nothing measures a weed.
   */
  var NWEED = 3;
  var wdX, wdZ, wdVX, wdVZ, wdPh, wdR, wdLife;

  function respawn(i, rnd) {
    /* Upwind of the camera, out at the fog line, on a bearing that will bring it across the view.
     * The wind is +x-ish with the sun's own bearing rotated a quarter turn, which is not physics —
     * it is that a weed crossing the frame reads and a weed coming straight at the camera does
     * not. */
    var a = rnd * 6.2831853;
    wdX[i] = V.ox + Math.cos(a) * 46;
    wdZ[i] = V.oz + Math.sin(a) * 46;
    var b = a + 3.14159 + (rnd - 0.5) * 1.5;
    var sp = 2.4 + rnd * 3.0;
    wdVX[i] = Math.cos(b) * sp; wdVZ[i] = Math.sin(b) * sp;
    wdPh[i] = rnd * 6.28;
    wdR[i] = 0.30 + rnd * 0.34;
    wdLife[i] = 26 + rnd * 30;
  }

  CC.ELEMENTS.push({
    name: 'west-tumbleweed',
    layer: 23,
    world: 'west',
    init: function (city, rng) {
      boot(city);
      wdX = new Float64Array(NWEED); wdZ = new Float64Array(NWEED);
      wdVX = new Float64Array(NWEED); wdVZ = new Float64Array(NWEED);
      wdPh = new Float64Array(NWEED); wdR = new Float64Array(NWEED);
      wdLife = new Float64Array(NWEED);
      /* Placed relative to the origin rather than to the camera, because init() runs before the
       * first camera update and V is still zeroed. They walk into range within a few seconds. */
      V.ox = city && city.startX !== undefined ? city.startX : 0;
      V.oz = city && city.startZ !== undefined ? city.startZ : 0;
      for (var i = 0; i < NWEED; i++) respawn(i, rng());
    },
    update: function (dt, t, cam) {
      if (!CITY) return;
      V.ox = cam.x; V.oz = cam.z;
      var gust = 0.55 + 0.9 * W_WIND;
      var damp = CC.reducedMotion ? 0.3 : 1;
      for (var i = 0; i < NWEED; i++) {
        wdLife[i] -= dt;
        var nx = wdX[i] + wdVX[i] * dt * gust * damp;
        var nz = wdZ[i] + wdVZ[i] * dt * gust * damp;
        /* It bounces off buildings rather than stopping at them: a weed that parks against a wall
         * is a weed the eye finds and then watches not move. */
        if (CITY.height(nx, wdZ[i]) > 0.1) { wdVX[i] = -wdVX[i] * 0.7; nx = wdX[i]; }
        if (CITY.height(wdX[i], nz) > 0.1) { wdVZ[i] = -wdVZ[i] * 0.7; nz = wdZ[i]; }
        wdX[i] = nx; wdZ[i] = nz;
        /* THE ROLL RATE IS CAPPED BY THE FLICKER RULE, not by how fast a tumbleweed rolls. The
         * draw modulates the weed's luminance on |sin(ph)|, which beats at twice the phase rate,
         * and the project's hard limit is nothing above 2% of full scale between 3 and 20 Hz. At
         * the first cut's 2.6 + 3.4*rel(wind) the phase reached 8.6 rad/s under `thunder`, which
         * is 2.7 Hz of a 16% modulation — inside the danger band with room to spare on amplitude.
         * 2.0 + 1.6*rel(wind) tops out at 4.9 rad/s, i.e. 1.5 Hz, and the amplitude came down with
         * it. A weed that rolls a little slower than life is not a thing anyone can notice. */
        wdPh[i] += dt * (2.0 + 1.6 * W_WIND) * damp;
        var dx = nx - cam.x, dz = nz - cam.z;
        if (wdLife[i] < 0 || dx * dx + dz * dz > 4900)
          respawn(i, hash2(i, (t * 3) | 0, BASE + 0x41));
      }
    },
    draw: function (f, cam, t) {
      if (!CITY) return;
      view(f, cam, t === undefined ? (cam.t || 0) : t);
      if (W_RAIN > 0.5) return;                 // it soaks and stops
      for (var i = 0; i < NWEED; i++) {
        var r = wdR[i];
        /* It BOUNCES: the height is a rectified sine, which is what a rolling ball of sticks does
         * on rough ground, and it is the whole read at this size. */
        var bounce = Math.abs(Math.sin(wdPh[i] * 0.5)) * r * 1.5;
        if (!project(wdX[i], r + bounce, wdZ[i])) continue;
        var x = Math.floor(PJ.x), y = Math.floor(PJ.y), d = PJ.d;
        var rw = r * V.colK / (d * 0.85), rh = r * V.scale / (d * 0.85);
        var lum = 74 + 24 * Math.abs(Math.sin(wdPh[i]));
        if (rw < 1.1) { emit(f, x, y, G_STAR, P.slate, lum, d); continue; }
        var iw = Math.ceil(rw), ih = Math.ceil(rh), dx, dy;
        if (iw > 9) iw = 9; if (ih > 9) ih = 9;
        for (dy = -ih; dy <= ih; dy++) {
          for (dx = -iw; dx <= iw; dx++) {
            var u = dx / rw, v = dy / rh, r2 = u * u + v * v;
            if (r2 > 1.05) continue;
            /* Open, tangled, and turning: the hash is keyed on the ROTATED offset, so the tangle
             * spins with the weed instead of shimmering inside a moving circle. */
            var ca = Math.cos(wdPh[i]), sa = Math.sin(wdPh[i]);
            var ru = u * ca - v * sa, rv = u * sa + v * ca;
            if (hash2(Math.round(ru * 5), Math.round(rv * 5), BASE + 0x42) > 0.42) continue;
            emit(f, x + dx, y + dy, r2 > 0.6 ? G_TICK : G_STAR, P.slate, lum * (1 - 0.3 * r2), d);
          }
        }
      }
    }
  });

  function mk(name, layer, fn) {
    return {
      name: name, layer: layer, world: 'west',
      init: function (city) { boot(city); },
      draw: function (f, cam, t) {
        if (!CITY) return;
        view(f, cam, t === undefined ? (cam.t || 0) : t);
        fn(f);
      }
    };
  }

  CC.ELEMENTS.push(mk('west-brush', 15, drawBrush));
  CC.ELEMENTS.push(mk('west-telegraph', 19, function (f) {
    var i;
    for (i = -1; i <= 1; i++) drawTelegraph(f, 0, nearIdx(0) + i);
    for (i = -1; i <= 1; i++) drawTelegraph(f, 1, nearIdx(1) + i);
  }));

})(typeof CC !== 'undefined' ? CC : require('../core.js'));
