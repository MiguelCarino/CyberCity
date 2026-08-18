/* CyberCity frontier town — the street furniture of the west. Layers 17-21.
 *
 * WHAT THIS FILE IS FOR. surf_west.js paints the walls and the ground, and a town made only of
 * those two things is a corridor: two flat fronts and a strip of dust, with nothing standing
 * between the viewer and the buildings and therefore no depth in the near field at all. Everything
 * here is an OBJECT in the street — a post, a rail, a trough, a lantern, a water tank on a roof —
 * and between them they do three jobs the surfaces cannot:
 *
 *   1. THE POSTS ARE THE RHYTHM. A veranda post every two and a half metres down both sides of the
 *      road is a colonnade, and a colonnade in perspective is the strongest depth cue available in
 *      a still frame. It is also the single most recognisable silhouette of the setting.
 *   2. THE LANTERNS ARE THE LIGHT. core.js's EXPOSURE ladder puts every SURFACE swatch in this
 *      world under 0.42 gain, so nothing surf_west.js paints can reach the v>=170 band the print
 *      wants 3.5-5% of the frame in. A flame can: amber at lum 200+, a handful of cells per porch.
 *      Measured before this file existed, the frontier printed 0.18% hot.
 *   3. THE ROOFLINE GETS SOMETHING ON IT. A town of two-storey boxes has a flat skyline, and a
 *      flat skyline against the biggest sky in the project is a ruler laid across the frame. The
 *      crowns — chimney, water tank, steeple — are what break it.
 *
 * Everything is a pure function of (world, t). No update(), no simulation state, no draw from the
 * shared rng: the lattice offset comes from the city's own seed, exactly as market.js does it and
 * for the same reason — an element that draws from the shared stream reshuffles the noise of every
 * element initialised after it.
 */
(function (CC) {
  'use strict';

  /* One projector per element — see src/proj.js. V and PJ are this element's own
   * basis and scratch; the four functions are closed over them. */
  var PR = CC.Proj.make(), V = PR.V, PJ = PR.PJ;
  var project = PR.project, emit = PR.emit, column = PR.column, litFace = PR.litFace;

  var P = CC.P, hash2 = CC.hash2, put = CC.put, vnoise = CC.vnoise, clamp = CC.clamp;

  var G_PIPE = CC.g('|'), G_DASH = CC.g('-'), G_EQ = CC.g('='), G_DOT = CC.g('.'),
      G_COLON = CC.g(':'), G_TICK = CC.g('`'), G_CARET = CC.g('^'), G_STAR = CC.g('*'),
      G_0 = CC.g('0'), G_O = CC.g('O'), G_o = CC.g('o'), G_HASH = CC.g('#'), G_PLUS = CC.g('+'),
      G_TILDE = CC.g('~');

  var CITY = null, BASE = 0, Surf = null, WEST = null;
  function boot(city) {
    CITY = (city && city.aveX && city.world === 'west') ? city : null;
    BASE = CITY ? ((Math.imul(CITY.seed | 0, 40503) >>> 8) & 0x3fffff) : 0;
  }

  /* ---- the view — mirrors raycast.js exactly ------------------------------------------------- */
  var W_WIND = 1, W_WET = 1;

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
    W_WET = CC.Weather ? CC.Weather.rel('wet') : 1;
  }






  /* ---- street geometry ------------------------------------------------------------------------
   * axis 0 = avenue (runs along +z, span crosses in x); axis 1 = cross street (spans z). Same
   * derivation as market.js and structure.js: city.js puts street cells at |g - centre| <= half, so
   * the wall faces sit at centre-half and centre+half+1. */
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
  /* The outward normal of the frontage on side s, in world axes: side 0 is the low face (its
   * buildings are at smaller cross, so it looks toward +cross) and side 1 is the high face. */
  function nX(axis, s) { return axis ? 0 : (s ? -1 : 1); }
  function nZ(axis, s) { return axis ? (s ? -1 : 1) : 0; }

  /* The pavement actually available. CC.PAVE is the building-face-to-kerb width and it is read,
   * never rewritten; raycast floors the carriageway at 1.7 m, so on a narrow street the walk is
   * whatever is left. Same arithmetic as market.js's paveOf. */
  function paveOf(spanW) {
    var p = CC.PAVE, avail = spanW * 0.5 - 1.7;
    return avail < p ? avail : p;
  }

  /* Is there continuous frontage behind this stretch? Four probes, all must hit — a veranda that
   * bridges an alley mouth is a veranda standing across a side street. */
  function frontage(axis, a0, len, cross, dirIn) {
    var i, a, c = cross - dirIn * 0.7;
    for (i = 0; i <= 3; i++) {
      a = a0 + len * (i / 3);
      if (CITY.height(wx(axis, a, c), wz(axis, a, c)) < 2.5) return 0;
    }
    return 1;
  }

  function objVisible(axis, along, cross, near) {
    var px = wx(axis, along, cross), pz = wz(axis, along, cross);
    var rx = px - V.ox, rz = pz - V.oz;
    var w = rx * V.fwx + rz * V.fwz;
    if (w < near || w > V.far) return 0;
    var s = rx * V.rgx + rz * V.rgz, lim = w * V.hp + 14;
    if (s < -lim || s > lim) return 0;
    return w;
  }



  /* ---- a horizontal run along the street ------------------------------------------------------
   * Sampled rather than projected end-to-end, because a rail seen nearly end-on covers hundreds of
   * columns and a two-point fill would step. The step is chosen off the projected length so a rail
   * two metres away costs the same per column as one forty metres away. */
  function beam(f, axis, a0, a1, cross, y, ch, col, lum) {
    /* Screen-space interpolation between world samples, and BOTH coordinates of it. The first cut
     * of this filled only in x, at the row of the newer sample, and it drew a horizontal line clean
     * across the frame every time a sample dropped out behind the eye plane — the run would resume
     * forty metres later and the fill would join the two, which is a rail across the sky.
     *
     * So: a sample that fails to project BREAKS the run (lx = -1), the fill walks x and y together,
     * and a segment whose depth jumps by more than double is dropped rather than joined — that jump
     * only happens where the span passes the eye plane, and joining across it connects two points
     * that are behind each other. */
    var n = 22, i, a, lx = -1, ly = 0, ld = 0;
    for (i = 0; i <= n; i++) {
      a = a0 + (a1 - a0) * (i / n);
      if (!project(wx(axis, a, cross), y, wz(axis, a, cross))) { lx = -1; continue; }
      var x = Math.floor(PJ.x), r = Math.floor(PJ.y), d = PJ.d;
      if (lx >= 0 && (d > ld * 2 || ld > d * 2)) lx = -1;
      if (lx >= 0) {
        var dx = x - lx, dy = r - ly;
        var steps = Math.abs(dx) > Math.abs(dy) ? Math.abs(dx) : Math.abs(dy);
        if (steps > 4 * V.cols) steps = 0;                 // degenerate; draw the endpoint only
        for (var q = 1; q < steps; q++) {
          var t2 = q / steps;
          emit(f, lx + Math.round(dx * t2), ly + Math.round(dy * t2), ch, col, lum,
               ld + (d - ld) * t2);
        }
      }
      emit(f, x, r, ch, col, lum, d);
      lx = x; ly = r; ld = d;
    }
  }

  /* ================================================================================================
   * THE VERANDA — posts, awning fascia, and the lanterns hung off them.
   * ============================================================================================= */
  var POST = 2.6;                 // post spacing in metres. A frontier veranda bay is 8-9 feet.
  var AWN_Y = 2.94;               // underside of the awning at the post; it slopes up to the wall

  function drawVeranda(f, axis, idx) {
    streetSpan(axis, idx);
    var pave = paveOf(SPAN.w);
    if (pave < 1.1) return;                       // no room for a walk, so no veranda
    var pitch = axis ? CITY.AVE : CITY.CROSS;     // the OTHER family's pitch: along this street
    var lo = Math.floor(((axis ? V.ox : V.oz) - 60) / POST);
    var hi = Math.floor(((axis ? V.ox : V.oz) + 60) / POST);
    if (hi - lo > 60) hi = lo + 60;

    for (var s = 0; s < 2; s++) {
      var face = s ? SPAN.c1 : SPAN.c0, dirIn = s ? -1 : 1;
      var postC = face + dirIn * (pave - 0.34);
      var nx = nX(axis, s), nz = nZ(axis, s);
      var sun = litFace(nx, nz);
      /* A post is a black cut-out with one lit edge — the house idiom for a near object. The lit
       * edge is on the sun side and it is what makes a colonnade read as round timber rather than
       * as a row of slots. */
      var pcol = sun > 0.6 ? P.amber : P.slate;
      var plum = sun > 0.6 ? 74 : 20;

      for (var k = lo; k <= hi; k++) {
        var along = k * POST + 0.5;
        var w = objVisible(axis, along, postC, 0.7);
        if (!w) continue;
        if (!frontage(axis, along - POST * 0.5, POST, face, dirIn)) continue;
        var hh = hash2(k, idx * 2 + s, BASE + (axis ? 0x51 : 0x52));

        /* The post. Two cells wide inside 12 m so it has some mass when you walk past it. */
        column(f, wx(axis, along, postC), wz(axis, along, postC), 0.0, AWN_Y,
               G_PIPE, pcol, plum, w < 12 ? 1 : 0);

        /* THE AWNING, one bay at a time. It used to be a single run down the whole street and that
         * is wrong twice over: it bridged every alley mouth and vacant lot in the block, and a
         * fifty-metre span sampled at a fixed rate is coarse near the camera and wasteful far from
         * it. Drawn per bay it inherits the frontage test above for free. */
        beam(f, axis, along - POST, along, postC, AWN_Y + 0.06, G_EQ,
             sun > 0.6 ? P.amber : P.slate, sun > 0.6 ? 96 : 26);
        beam(f, axis, along - POST, along, postC, AWN_Y - 0.12, G_DASH, P.shadow, 0);

        /* A lantern on one post in three, and never two in a row — a porch light is a thing a
         * shopkeeper hangs, not a street lighting scheme. It is the brightest object in the world
         * and it is four cells; see the header. */
        if (hh < 0.30 && hash2(k + 1, idx * 2 + s, BASE + 0x53) > 0.30) {
          var ly = AWN_Y - 0.42;
          if (project(wx(axis, along, postC), ly, wz(axis, along, postC))) {
            var lx = Math.floor(PJ.x), lr = Math.floor(PJ.y), ld = PJ.d;
            /* The flame, then the glass around it. Fog is applied by emit, so a lantern at the far
             * end of the street dims with everything else instead of hanging in the dark. */
            emit(f, lx, lr, G_o, P.amber, 236, ld);
            emit(f, lx, lr - 1, G_DOT, P.warm, 150, ld);
            if (ld < 22) {
              emit(f, lx + 1, lr, G_TICK, P.warm, 108, ld);
              emit(f, lx - 1, lr, G_TICK, P.warm, 108, ld);
            }
          }
        }
      }

    }
  }

  /* ================================================================================================
   * HITCHING RAILS, TROUGHS, BARRELS — what stands between the veranda and the road.
   * ============================================================================================= */
  var RAIL_PITCH = 15.0;

  function drawStreetProps(f, axis, idx) {
    streetSpan(axis, idx);
    var pave = paveOf(SPAN.w);
    var lo = Math.floor(((axis ? V.ox : V.oz) - 48) / RAIL_PITCH);
    var hi = Math.floor(((axis ? V.ox : V.oz) + 48) / RAIL_PITCH);

    for (var s = 0; s < 2; s++) {
      var face = s ? SPAN.c1 : SPAN.c0, dirIn = s ? -1 : 1;
      var sun = litFace(nX(axis, s), nZ(axis, s));
      var edge = face + dirIn * (pave + 0.15);     // just off the boardwalk, in the road

      for (var k = lo; k <= hi; k++) {
        var h0 = hash2(k, idx * 2 + s, BASE + 0x61);
        if (h0 > 0.62) continue;
        var along = k * RAIL_PITCH + h0 * 9;
        var w = objVisible(axis, along, edge, 0.8);
        if (!w) continue;
        if (!frontage(axis, along, 5.2, face, dirIn)) continue;

        var kind = hash2(k, idx * 2 + s, BASE + 0x62);
        if (kind < 0.52) {
          /* A HITCHING RAIL. Two short posts and a bar at 1.05 m — waist height on the figures
           * street.js draws, which is what makes it read as furniture rather than as fence. */
          var L = 3.6 + kind * 3.2;
          column(f, wx(axis, along, edge), wz(axis, along, edge), 0, 1.28, G_PIPE,
                 sun > 0.6 ? P.amber : P.slate, sun > 0.6 ? 62 : 18, 0);
          column(f, wx(axis, along + L, edge), wz(axis, along + L, edge), 0, 1.28, G_PIPE,
                 sun > 0.6 ? P.amber : P.slate, sun > 0.6 ? 62 : 18, 0);
          beam(f, axis, along, along + L, edge, 1.06, G_DASH,
               sun > 0.6 ? P.amber : P.slate, sun > 0.6 ? 72 : 20);
        } else if (kind < 0.74) {
          /* A WATER TROUGH. A dark box with a lit rim, and — the only reason it is worth drawing —
           * a surface in it, which is the one horizontal reflector at ground level in a world with
           * no wet road. It picks up the sky, so it is ember at dusk and it is the brightest thing
           * on the ground. */
          var TL = 2.5;
          beam(f, axis, along, along + TL, edge, 0.62, G_EQ, sun > 0.6 ? P.white : P.slate,
               sun > 0.6 ? 76 : 24);
          beam(f, axis, along, along + TL, edge, 0.30, G_HASH, P.shadow, 0);
          beam(f, axis, along + 0.15, along + TL - 0.15, edge - dirIn * 0.02, 0.55,
               G_TILDE, P.ember, 128);
        } else {
          /* BARRELS AND CRATES, up on the boardwalk against the wall where a shopkeeper would put
           * them. Round ones and square ones, and the difference is one glyph. */
          var bc = face + dirIn * 0.55;
          for (var b = 0; b < 3; b++) {
            var bh = hash2(k * 7 + b, idx * 2 + s, BASE + 0x63);
            if (bh > 0.66) continue;
            var ba = along + b * 0.95;
            if (!objVisible(axis, ba, bc, 0.8)) continue;
            var tall = 0.42 + bh * 0.62;
            column(f, wx(axis, ba, bc), wz(axis, ba, bc), 0.18, 0.18 + tall,
                   bh < 0.33 ? G_O : G_HASH, sun > 0.6 ? P.amber : P.slate,
                   sun > 0.6 ? 56 : 16, 1);
          }
        }
      }
    }
  }

  /* ================================================================================================
   * ROOFTOP CROWNS — what breaks the skyline. Reads city.js's `crown`, which the frontier means as
   * 0 nothing, 1 chimney, 2 water tank, 3 steeple.
   * ============================================================================================= */
  function drawCrowns(f) {
    var R = 74;                                    // a crown past this is under a cell tall
    var gx0 = Math.floor(V.ox - R), gx1 = Math.floor(V.ox + R);
    var gz0 = Math.floor(V.oz - R), gz1 = Math.floor(V.oz + R);
    /* Walked on a 4 m lattice rather than per cell: a crown belongs to a LOT, and stepping every
     * metre over a 148 m square is 22000 height lookups a frame for at most a dozen objects. */
    for (var gz = gz0; gz <= gz1; gz += 4) {
      for (var gx = gx0; gx <= gx1; gx += 4) {
        var h = CITY.height(gx, gz);
        if (h < 3) continue;
        var rec = CITY.cell(gx, gz);
        if (!rec || !rec.crown || rec.rock) continue;
        /* One crown per lot, placed at a fixed offset inside it so walking past does not make it
         * jump from one cell of the roof to another. */
        var cx = rec.lotX + 1.6 + rec.seed * 2.2, cz = rec.lotZ + 1.4 + rec.face * 2.4;
        if (Math.abs(cx - gx) > 4 || Math.abs(cz - gz) > 4) continue;
        var w = objVisible(0, cz, cx, 2.0);
        if (!w) continue;
        var sun = litFace(WEST ? WEST.SUN_X : -1, WEST ? WEST.SUN_Z : 0);
        var lum = 66, col = P.amber;

        if (rec.crown === 1) {
          /* A stone chimney and its smoke. The smoke is the only thing in this file that moves,
           * and it is the reason a chimney is worth more than the eight cells it costs: a slow
           * vertical drift is what tells you the town is inhabited. */
          var ch2 = 1.1 + rec.seed * 0.9;
          column(f, cx, cz, h, h + ch2, G_HASH, P.slate, 30, 1);
          emit2smoke(f, cx, cz, h + ch2, rec);
        } else if (rec.crown === 2) {
          /* A WATER TANK on legs — four verticals and a drum, and the most recognisable roofline
           * object of the period after the false front itself. */
          var ty = h + 1.5, td = 1.5 + rec.seed * 0.8;
          column(f, cx - 0.7, cz - 0.7, h, ty, G_PIPE, P.slate, 24, 0);
          column(f, cx + 0.7, cz - 0.7, h, ty, G_PIPE, P.slate, 24, 0);
          column(f, cx - 0.7, cz + 0.7, h, ty, G_PIPE, P.slate, 24, 0);
          column(f, cx + 0.7, cz + 0.7, h, ty, G_PIPE, P.slate, 24, 0);
          for (var q = 0; q < 5; q++) {
            var qx = cx - 0.9 + q * 0.45;
            column(f, qx, cz, ty, ty + td, G_0, sun > 0.6 ? P.amber : P.slate,
                   sun > 0.6 ? 86 : 26, 0);
          }
          beam(f, 0, cz - 1.0, cz + 1.0, cx, ty + td, G_EQ, P.amber, 96);
        } else {
          /* A STEEPLE, or a windmill — the two things out here that are taller than anything else
           * and the only reason the eye ever goes above the second storey. Both are a thin shaft
           * with something on top; the roll decides which. */
          var mill = rec.seed > 0.55;
          var sy = h + 2.2 + rec.face * 3.4;
          column(f, cx, cz, h, sy, G_PIPE, sun > 0.6 ? P.amber : P.slate, sun > 0.6 ? 72 : 22, 0);
          if (mill) {
            /* ---- THE WHEEL, AND WHY IT DOES NOT TURN THE WAY IT FIRST DID ---------------------
             * A rotating windmill is the single most dangerous object either world has ever
             * contained, and it failed tools/west-flicker.cjs on the first run: eight spokes drawn
             * at lum 5 sweeping across sky cells at lum 189 chopped those cells at 4.7 big steps a
             * second, against a limit of 1.0 — a dark blade crossing a bright background at a few
             * hertz is the textbook photosensitive trigger, and it is exactly what a real farm
             * windmill does.
             *
             * The fix is not to slow it down. A blade-crossing rate low enough to be safe is far
             * below what reads as a turning wheel, so the wheel would have to look wrong to be
             * safe. What is drawn instead is a STATIC RIM — twelve cells that are always painted,
             * so no cell of it ever alternates with the sky behind it — and one bright vane
             * travelling round that rim. The motion is carried entirely by the glint, whose step is
             * held under the third-of-full-scale line (54 to 128, i.e. 29%) and which visits any
             * one rim cell about once every ten seconds.
             *
             * At the distance a windmill is ever seen here the wheel is five cells across, so a
             * disc with a moving highlight and a spoked wheel are the same picture anyway. */
            if (project(cx, sy, cz)) {
              var mx = Math.floor(PJ.x), my = Math.floor(PJ.y), md = PJ.d;
              for (var b2 = 0; b2 < 12; b2++) {
                var an = b2 * Math.PI / 6;
                emit(f, mx + Math.round(Math.cos(an) * 2.2), my + Math.round(Math.sin(an) * 1.2),
                     G_PLUS, P.slate, 54, md);
              }
              emit(f, mx, my, G_O, P.amber, 120, md);
              var sp = CC.reducedMotion ? 0.9 : V.t * 0.5 * (0.3 + 0.5 * W_WIND);
              emit(f, mx + Math.round(Math.cos(sp) * 2.2), my + Math.round(Math.sin(sp) * 1.2),
                   G_STAR, P.amber, 128, md);
            }
          } else {
            /* A bell tower: a taper and a cross. */
            column(f, cx, cz, sy, sy + 1.2, G_CARET, P.white, 84, 0);
            if (project(cx, sy + 1.5, cz))
              emit(f, Math.floor(PJ.x), Math.floor(PJ.y), G_PLUS, P.amber, 148, PJ.d);
          }
        }
      }
    }
  }

  /* Chimney smoke — a CONTINUOUS plume, not a string of puffs, and the difference is a
   * photosensitivity fix as much as a look.
   *
   * Five discrete puffs on a phase cycle put five dark cells travelling up through the brightest
   * part of the sky, and a dark object crossing a bright cell is a step: measured at lum 5 against
   * a lum 189 sunset, which is 72% of full scale, several times a second on any cell under the
   * plume. Sampling the same path densely instead means the cells the plume occupies are occupied
   * CONTINUOUSLY — the plume is a shape that leans, not a sequence of things that arrive — and a
   * given cell changes only when the lean carries the edge across it, which happens at the sway's
   * own rate of about a third of a hertz.
   *
   * It is also drawn far brighter than the first cut. Wood smoke at this hour is lit from the side
   * by the same sun everything else is; it is a pale grey-orange column, not a black one, and
   * painting it dark was both wrong and the whole reason the step was large.
   *
   * Pure in t, so it scrubs. */
  function emit2smoke(f, cx, cz, y0, rec) {
    var lean = 1.5 * W_WIND;
    var tt = CC.reducedMotion ? 4.0 : V.t;
    var sway = vnoise(tt * 0.33 + rec.seed * 7, 0x2A) - 0.5;
    var N = 16;
    for (var i = 0; i < N; i++) {
      var u = i / (N - 1);
      var yy = y0 + 0.15 + u * 3.8;
      /* Leans downwind as it rises, and the lean itself drifts. u*u so the base is vertical and
       * the top is where the wind has had time to work on it. */
      var dx = (lean * u * u + sway * 0.9 * u) * 1.6;
      if (!project(cx + dx, yy, cz + dx * 0.35)) continue;
      /* Thins with height, and the fade is smooth so the top of the plume dissolves rather than
       * ending. slate at 46-104 against a sky that runs 120-200: a soft column, and a step of
       * under a third of full scale wherever the edge does move. */
      var lum = 104 * (1 - u) * (1 - u * 0.5);
      if (lum < 6) continue;
      emit(f, Math.floor(PJ.x), Math.floor(PJ.y), u < 0.35 ? G_HASH : (u < 0.7 ? G_COLON : G_DOT),
           P.slate, lum, PJ.d);
    }
  }

  /* ---- which streets to draw ------------------------------------------------------------------ */
  function nearIdx(axis) {
    return Math.round((axis ? V.oz : V.ox) / (axis ? CITY.CROSS : CITY.AVE));
  }
  function eachStreet(f, fn) {
    var i;
    for (i = -1; i <= 1; i++) fn(f, 0, nearIdx(0) + i);
    for (i = -1; i <= 1; i++) fn(f, 1, nearIdx(1) + i);
  }

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

  /* 17 street props, 18 verandas, 21 crowns — under the pedestrians at 20 for the props that share
   * the pavement with them, and the crowns are up on the roofs where nothing else goes. */
  CC.ELEMENTS.push(mk('west-props', 17, function (f) { eachStreet(f, drawStreetProps); }));
  CC.ELEMENTS.push(mk('west-veranda', 18, function (f) { eachStreet(f, drawVeranda); }));
  CC.ELEMENTS.push(mk('west-crowns', 21, drawCrowns));

})(typeof CC !== 'undefined' ? CC : require('../core.js'));
