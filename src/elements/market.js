/* CyberCity street market — layer 17. The commercial half of the pavement.
 *
 * WHAT THIS IS AND WHAT IT IS NOT. street.js already owns `foodstalls` (layer 18): four camera-
 * relative slots, each ONE lit counter cart, spawned at 66-90 m so the fog hands it over. That is
 * a single object seen at the end of a street. This file is the other thing entirely — a RUN of
 * stalls under one canopy, a kiosk, a bank of machines — laid out on a WORLD lattice like the
 * street props in structure.js, so a market belongs to a block and is still there when the walk
 * comes back past it. The two never share a code path and never share a lattice.
 *
 * THE SHAPE, and every constant below is in service of it: a continuous dark canopy line with ONE
 * lit strip under it, a lit counter at waist height, and black goods between and below. Four
 * horizontals stacked through two and a half metres, two of them black and two of them lit. That
 * reads at twelve rows tall and it carries perspective down the pavement, which a scatter of lit
 * dots cannot do.
 *
 * THE PRINT BUDGET IS WHY THERE ARE SO FEW LIT CELLS HERE. Measured through tools/exposure-style
 * probes on the shipped curve (colour, lum, distance -> rendered v):
 *     slate  tops out at v=74 at lum 80. EVERY slate cell is inside the muddy band (v 9-119).
 *            There is therefore no such thing as a cheap dim edge in this project, and this file
 *            draws almost none: the "lit top edge" idiom that structure.js uses on its props is
 *            paid for in muddy, and a market row is twenty times longer than a news box.
 *     amber  lum 100->v126, 165->v153, and only reaches the v=170 hot line at lum 220 at 8 m.
 *            Amber is nearly impossible to make hot, which is why the counters are amber-led.
 *     azure  lum 120 is ALREADY hot (v=176 at 8 m). Azure here is held at lum 96-100 (v 152-164).
 *     ember  lum 165 -> v138, and it is IN the band — but ember is a 1.4% garnish swatch across
 *            the whole build and this file paints SURFACES, so it is held to 7% of counters and
 *            8% of vending windows. It used to be 14%/10%, and at seed 4545 t=2100 that put 271
 *            ember cells and 218 lit ones — the entire red-orange mass on the right of that frame
 *            — on one object. A garnish swatch may not carry a surface; see counterHue below.
 *     warm   lum 152 -> v138, also in band, and also held to 7%: warm is drifting upward across
 *            the build (10.8% of lit energy against a documented 11.4% ceiling) and a counter run
 *            is the largest thing on the pavement.
 * So: the mass is drawn with lum 0 — a pure occluder that stamps depth and prints nothing, which
 * is how the pedestrians and the shut shopfronts do it — and the lit cells are aimed at v 130-165,
 * which is above the muddy band and below the hot line. That band is free on both metrics, and a
 * black canopy laid over the lit shopfront band behind it actually REMOVES muddy cells.
 *
 * NO LIT SURFACE IN THIS FILE IS A SOLID FILL ANY MORE, and that is the second lesson. Measured at
 * seed 3412 frame 600 (400x100) the first cut owned 5553 cells, 13.9% of the picture, of which
 * 1023 were one unbroken azure rectangle from a vending bank at five metres. Every lit band here is
 * now either ONE row tall (the strip light, the shelf, the header lamps) or meshed, and every
 * object is retired on SCREEN AREA — see coverOf() below.
 *
 * Everything is a pure function of (world, t): no update(), no simulation state, so jumping to
 * frame 3000 and replaying to it give the same frame. Placement is hashed on a world lattice
 * index, never on the camera or the screen.
 */
(function (CC) {
  'use strict';

  var P = CC.P, hash2 = CC.hash2, put = CC.put, vnoise = CC.vnoise;

  /* g() is a string-keyed lookup and these are hit a few thousand times a frame. */
  var G_DASH = CC.g('-'), G_EQ = CC.g('='),
      G_8 = CC.g('8'), G_0 = CC.g('0'), G_HASH = CC.g('#'), G_X = CC.g('X'),
      G_M = CC.g('M'), G_W = CC.g('W'), G_o = CC.g('o'),
      G_COLON = CC.g(':'), G_COMMA = CC.g(','), G_DOT = CC.g('.'), G_QUOTE = CC.g("'"),
      G_TICK = CC.g('`');

  /* Blocky only. Anything with holes in it dithers instead of massing at this cell size — the
   * same table street.js keeps, for the same reason. */
  var FILL = [G_8, G_0, G_HASH, G_M, G_W, G_X], FILL_N = 6;

  /* ---- world binding --------------------------------------------------------------------------
   * THIS ELEMENT DRAWS FROM THE SHARED RNG EXACTLY ZERO TIMES, and that is deliberate rather than
   * lazy. Elements are init()ed in layer order off one shared stream, so any draw taken here would
   * shift the stream under every element below layer 17 — which is most of the build. A new file
   * that re-rolls six other files' worlds is a new file nobody can measure against. The lattice
   * offset comes from the city's own seed instead, which is already a pure function of the world
   * and re-derives correctly when main.js rebuilds on a #hashchange.
   *
   * BASE is kept to 22 bits on purpose: hash2 folds its salt through one imul and the house rule
   * is small seeds varied with SMALL ADDITIVE salts, never `S ^ big`. */
  var CITY = null, BASE = 0, Surf = null;
  function boot(city) {
    CITY = city && city.aveX ? city : null;
    BASE = CITY ? ((Math.imul(CITY.seed | 0, 40503) >>> 8) & 0x3fffff) : 0;
  }

  /* ---- the view -------------------------------------------------------------------------------
   * Mirrors raycast.js, exactly as structure.js does. Elements are handed `cam` and nothing else,
   * and a projection that disagrees with the caster by one term puts a stall through the wall it
   * is standing against. Planar camera: w is the perpendicular distance and the projection
   * divisor, and the radial distance the depth test wants is w*sqrt(1+sp^2). */
  var V = {
    ox: 0, oz: 0, eyeY: 1.7, fwx: 0, fwz: 1, rgx: 1, rgz: 0,
    hp: 0.7265, colK: 0, colMid: 0, scale: 77, horizon: 33, cols: 0, rows: 0, far: 125,
    t: 0, tt: 0
  };

  /* Wet pavement doubles the spill pools, which is the cheapest weather cue available down here.
   * rel() and not the raw parameter: 1.0 under the 'rain' preset this build was tuned in, so the
   * constants below keep the value they were chosen at until the weather actually moves. */
  var W_WET = 1;

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
    /* The steam clock, and it is stopped rather than slowed under reduced motion. Damping the
     * amplitude of a plume and leaving its clock running is still a plume boiling away in the
     * corner of the frame. */
    V.tt = CC.reducedMotion ? 11.7 : t;
    W_WET = CC.Weather ? CC.Weather.rel('wet') : 1;
  }

  /* Continuous cell coordinates: column i covers [i, i+1). Floor, never |0 — |0 truncates -0.4 to
   * 0 and smears anything just off the left edge back onto the frame. */
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

  /* The only write. Fog is applied here because the world pass has already fogged its own cells;
   * an unfogged counter at 40 m would read nearer than the shopfront it stands in front of. A cell
   * fogged to nothing is still written: it is unlit timber in front of something, and that
   * occlusion is most of what this file contributes. */
  function emit(f, x, y, ch, col, lum, d) {
    if (x < 0 || y < 0 || x >= V.cols || y >= V.rows) return;
    if (lum > 0 && Surf) { lum = Surf.fog(lum, d); if (lum <= 0) ch = 0; }
    put(f, x, y, ch, col, lum, d, 3);
  }

  /* ---- street geometry ------------------------------------------------------------------------
   * axis 0 = avenue (runs along +z, so a span crosses in x); axis 1 = cross street (spans z).
   * city.js puts street cells at |g - centre| <= halfWidth, so the wall faces sit at centre-hw and
   * centre+hw+1. Same derivation as structure.js; getting the +1 wrong buries a stall a metre
   * inside the masonry. */
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

  /* HOW MUCH PAVEMENT THERE ACTUALLY IS on this span. CC.PAVE is the building-face-to-kerb width
   * and it is read, never rewritten — three files have to agree on it. But raycast.configureFor
   * floors the CARRIAGEWAY half-width at 1.7 m, so on a narrow street the pavement is whatever is
   * left after the road takes its minimum, which is less than CC.PAVE. A stall laid out on the
   * nominal 2.15 m there is standing in the traffic. */
  function paveOf(spanW) {
    var p = CC.PAVE, avail = spanW * 0.5 - 1.7;
    return avail < p ? avail : p;
  }
  /* The kerb itself eats the last 34 cm of that strip — a stall leg on the kerb face is a stall
   * leg in the gutter — so everything this file builds lives inside `strip`. Cross offsets below
   * are written as FRACTIONS of strip rather than as metres, so a market on a narrow street packs
   * itself in instead of spilling into the road. */
  var KERB_LIP = 0.34;

  /* Is there a continuous building frontage behind this run? `cross` is half a metre BEHIND the
   * wall face so the probe can never land on the street cell itself. Four probes across the run
   * and ALL must hit, unlike structure.js's anchorH which takes the tallest of three: a prop is
   * 4 m long and can bridge an alley mouth, but an eleven-metre market row that bridges one is a
   * row of stalls standing across a side street. */
  function frontage(axis, along, len, cross) {
    var i, a;
    for (i = 0; i <= 3; i++) {
      a = along + len * (i / 3);
      if (CITY.height(wx(axis, a, cross), wz(axis, a, cross)) < 3) return 0;
    }
    return 1;
  }

  /* Cheap reject for a whole object before its sample loop runs. Generous lateral margin: the ends
   * of a long run can be on screen while its midpoint is not. `near` is the same allowance one
   * axis over and every caller passes its own, because a market row is up to 15 m long and its
   * midpoint goes behind the eye plane while a third of it still fills the frame. */
  function objVisible(axis, along, cross, near) {
    var px = wx(axis, along, cross), pz = wz(axis, along, cross);
    var rx = px - V.ox, rz = pz - V.oz;
    var w = rx * V.fwx + rz * V.fwz;
    if (w < near || w > V.far) return 0;
    var s = rx * V.rgx + rz * V.rgz, lim = w * V.hp + 16;
    if (s < -lim || s > lim) return 0;
    return w;
  }

  /* Index windows either side of the camera, and an along window at REACH rather than at the fog
   * distance: nothing in this file is drawn past REACH, so walking the lattice out to 125 m is
   * three quarters of the hashing thrown away. */
  var REACH = 44;
  function idxLo(axis) {
    return Math.round((axis ? V.oz : V.ox) / (axis ? CITY.CROSS : CITY.AVE)) - (axis ? 3 : 2);
  }
  function idxHi(axis) {
    return Math.round((axis ? V.oz : V.ox) / (axis ? CITY.CROSS : CITY.AVE)) + (axis ? 3 : 2);
  }
  function alongLo(axis, pitch) { return Math.floor(((axis ? V.ox : V.oz) - REACH) / pitch); }
  function alongHi(axis, pitch) { return Math.floor(((axis ? V.ox : V.oz) + REACH) / pitch); }

  /* ---- near clip ------------------------------------------------------------------------------
   * The camera genuinely walks past these things at arm's length, and a span with one end behind
   * the eye plane must be CLIPPED, not dropped: dropping it deletes an eleven-metre canopy in one
   * frame while two thirds of it are still across the picture. Both w and s are affine in u along
   * a straight world span, so the surviving interval is exact. Same solution as structure.js's
   * clipNear, and the 0.42 (rather than 0.40) is the same rounding guard: the endpoint projection
   * must not fail on the comparison this function just passed. */
  var CLIP = { u0: 0, u1: 1 };
  function clipNear(axis, a0, a1, cross) {
    var rx = wx(axis, a0, cross) - V.ox, rz = wz(axis, a0, cross) - V.oz;
    var g0 = rx * V.fwx + rz * V.fwz - 0.42;
    rx = wx(axis, a1, cross) - V.ox; rz = wz(axis, a1, cross) - V.oz;
    var g1 = rx * V.fwx + rz * V.fwz - 0.42;
    if (g0 < 0 && g1 < 0) return false;
    CLIP.u0 = 0; CLIP.u1 = 1;
    if (g0 < 0) CLIP.u0 = g0 / (g0 - g1);
    else if (g1 < 0) CLIP.u1 = g0 / (g0 - g1);
    return true;
  }

  /* ---- screen-area retirement -----------------------------------------------------------------
   * THE PEDESTRIANS RETIRE ON AREA — PED_COVER_MAX = 3.5% of the frame — rather than on a distance,
   * and this file now does the same, for the same reason: the photosensitivity rule names "a near
   * object that suddenly covers the frame" as its worst case for a whole-frame luminance step, and
   * a market run is the largest object on the pavement. Retiring on DISTANCE cannot do this job. An
   * eleven-metre row seen broadside at 8 m is small; the SAME row at 8 m seen end-on runs away down
   * the pavement and fills a third of the picture, and it is the screen area, not the range, that
   * the rule is about. Measured before this existed: seed 3412 frame 600 at 400x100, market owned
   * 5553 cells = 13.9% of the frame; seed 4681 t=900, 2136 cells with a bbox spanning 91% of the
   * frame width; seed 4137 t=900, 1522 cells of which exactly 2 were lit — a black rectangle over a
   * tenth of the picture, which reads as a hole punched in the street rather than as an object.
   *
   * coverOf() integrates the object's own projected area along its span: seven samples, and the
   * segment between two of them contributes |dx| columns times its height in rows at the mean of
   * the two depths. Samples are CLAMPED to the frame, so an object hanging half off the edge is
   * charged only for the half that is on screen, and samples behind the eye plane are dropped
   * rather than mirrored (a mirrored one lands on the wrong side and doubles the estimate).
   * Seven samples and not two: w is affine along the span but the projected x is not, and a
   * two-point estimate of a run whose near end is at 2 m and far end at 13 m is out by 4x.
   *
   * THE CAP IS SPENT AS COVERAGE, NEVER AS BRIGHTNESS. Each cell holds a fixed rank on the panel's
   * world lattice and the cells above the fade are dropped, so a growing object erodes one cell at
   * a time — no step in it anywhere, which is the property the rule actually asks for. Dimming the
   * whole slab instead would put its every cell in the muddy band, which is the one purchase the
   * print budget cannot make.
   *
   * THE MASS AND THE LIGHT ARE NOT CAPPED EQUALLY, and the first cut of this cap got that wrong.
   * Eroding both at one rate turned the bank at seed 3412 into 222 scattered azure cells over a
   * 126x78 bbox — confetti, which is worse than the slab it replaced, because content that costs
   * cells and cannot be read is worse than content that is not there. The house style for a dark
   * object here is a black cut-out with a FEW BRIGHT CELLS ON IT, so the cap is spent the same way:
   * lum-0 mass takes the full erode and lit cells take COV_LIT = min(1, COV * 2.4), which keeps the
   * strip light, the header lamps and the hatch legible while the carcass behind them ghosts out.
   * A lit cell is a few per cent of an object's area, so letting them through at 2.4x costs the
   * cap almost nothing and is the whole difference between "a stall dissolving" and "noise".
   *
   * 5% and not 3.5%: 3.5% is the whole CROWD's allowance and the crowd is many small silhouettes
   * spread across the frame, where one market is a single object the walk passes at arm's length.
   * Measured at seed 3412 frame 600 (400x100): 13.9% of the frame uncapped, 4.3% at 3.5% with the
   * lit cells eroded with the mass, 6.4% at 5% with them protected — and it is the last of those
   * that still reads as a bank of machines. */
  var COV_MAX = 0.05, COV_LIT_GAIN = 2.4;
  var COV = 1, COV_LIT = 1;
  function coverOf(axis, a0, a1, cross, H) {
    var K = 6, i, a, rx, rz, w, x, dx, wm, rws, area = 0, px = 0, pw = 0, have = 0, budget;
    for (i = 0; i <= K; i++) {
      a = a0 + (a1 - a0) * (i / K);
      rx = wx(axis, a, cross) - V.ox; rz = wz(axis, a, cross) - V.oz;
      w = rx * V.fwx + rz * V.fwz;
      if (w < 0.6) { have = 0; continue; }
      x = (rx * V.rgx + rz * V.rgz) / w * V.colK + V.colMid;
      if (x < 0) x = 0; else if (x > V.cols) x = V.cols;
      if (have) {
        dx = x - px; if (dx < 0) dx = -dx;
        wm = (w + pw) * 0.5;
        rws = H * V.scale / wm;
        if (rws > V.rows) rws = V.rows;         // an object taller than the frame is charged the frame
        area += dx * rws;
      }
      px = x; pw = w; have = 1;
    }
    budget = V.cols * V.rows * COV_MAX;
    COV = area <= budget ? 1 : budget / area;
    COV_LIT = COV * COV_LIT_GAIN;
    if (COV_LIT > 1) COV_LIT = 1;
    return COV;
  }
  function coverClear() { COV = 1; COV_LIT = 1; }

  /* ---- one flat panel in world space ----------------------------------------------------------
   * a0..a1 along the street, y0..y1 in height, at a fixed distance `cross` from the corridor
   * centre. ONE SAMPLE PER SCREEN COLUMN, with the column as the loop variable and the world point
   * solved for — marching uniformly along the span instead leaves multi-column holes in the near
   * end of a black plate, because the projection's screen density goes as 1/w^2 and a canopy that
   * reaches the eye differs by thirty times between its two ends. Holes in a silhouette read as
   * tearing, and a canopy is the longest silhouette in this file.
   *
   * `mesh` drops a checkerboard of cells: half the print cost for a surface that is texture rather
   * than mass. The lattice it is keyed on is the PANEL's — a world coordinate and an offset from
   * the panel's own top edge — so nothing in the pattern re-rolls when the camera takes a step.
   *
   * THE APPROACH DISSOLVE is not decoration. A market stands 1.1 m off the wall and the autopilot
   * walks about a metre and a half off it, so the camera passes through these planes several times
   * a minute. Fading in COVERAGE and not in luminance is the only option that works, because most
   * of this file is a black occluder with no brightness to take away: each cell holds a fixed rank
   * on the panel's lattice and the panel drops the cells ranked above the fade, so cells leave one
   * at a time over the last two metres. That also matters for the photosensitivity rule — a near
   * object that suddenly covers the frame is the worst case for a whole-frame luminance step, and
   * an erode has no step in it at all. */
  function panel(f, axis, a0, a1, cross, y0, y1, ch, col, lum, jit, mesh, sd) {
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
      fade = (dd - 1.2) * 0.5556;                    // full at 3.0 m, gone at 1.2 m
      if (fade <= 0) continue;
      if (fade > 1) fade = 1;
      /* ...and then the object's screen-area cap on top of it, as the SAME coverage erode rather
       * than as a second mechanism. COV/COV_LIT are set once per object by the caller; a lit panel
       * takes the gentler of the two so the object keeps a readable signature while its mass goes.
       * `lum` and not `l`, because the jitter below can only add. */
      if (lum > 0) { if (COV_LIT < 1) fade *= COV_LIT; }
      else if (COV < 1) fade *= COV;
      if (!project(wx(axis, a, cross), y0, wz(axis, a, cross))) continue;
      rb = PJ.y;
      r0 = Math.floor(rt); r1 = Math.floor(rb);
      if (r1 < r0) { tmp = r0; r0 = r1; r1 = tmp; }
      /* The pattern's row origin is the panel's OWN top edge, captured BEFORE the frame clip below
       * moves it. Keyed on the clipped r0 the mesh phase re-rolls the moment a near panel's top
       * leaves the screen, which is a texture welded to the viewport in the one place it is
       * largest on screen. */
      pat = r0;
      if (r0 < -1) r0 = -1;
      if (r1 > V.rows) r1 = V.rows;
      lat = Math.floor(a * 4.7) + (sd & 15);
      for (row = r0; row <= r1; row++) {
        if (fade < 1 && hash2(lat, row - pat, sd + 51) > fade) continue;
        if (mesh && ((lat + row - pat) & 1)) continue;
        l = lum;
        if (jit) l += hash2(lat, row - pat, sd + 113) * jit;
        emit(f, j, row, ch, col, l, dd);
      }
    }
  }

  /* One cell at one world point. `bias` pulls the write a fraction toward the eye, and every mark
   * that lies ON the pavement needs it: the floor under a stall is at very nearly the stall's own
   * depth, CC.put wants a strict improvement, and a spill pool drawn at the floor's exact distance
   * loses every tie and is simply never seen. street.js hit this first and calls it near(). */
  function pcell(f, axis, a, cross, y, ch, col, lum, bias) {
    if (!project(wx(axis, a, cross), y, wz(axis, a, cross))) return;
    emit(f, Math.floor(PJ.x), Math.floor(PJ.y), ch, col, lum, PJ.d * bias);
  }

  /* ---- the lit tier ---------------------------------------------------------------------------
   * ONE brightness per swatch, tuned so that every lit surface in this file prints in the v=130-165
   * band whatever colour it happens to be — above the muddy ceiling (119) and below the hot floor
   * (170). The numbers are not a style: they are the print curve read backwards. amber and ember
   * need lum 165 to get there, azure needs 96 and is already hot at 120, warm and spring sit at
   * the top of what their pigment can reach at all. A single shared "bright" constant would have
   * made the azure stalls hot and the warm ones muddy, which is exactly the mistake the colour
   * census exists to catch.
   *
   * WEIGHTS, and they were re-cut once the census came back. amber leads because it is the sodium
   * of a food counter and because it is the swatch that cannot go hot; it went 50% -> 60% because
   * amber is the pillar the frame is SHORT of (47.2 against a documented 46.5) while azure is the
   * one it is long on. azure 16% -> 14%: measured, this file alone was 6.7% of every lit azure cell
   * in the frame and the single largest non-world azure contributor, and a pillar may not move by
   * more than 1.5 points. ember 14% -> 7% and warm 8% -> 7%: both are garnish swatches (1.4% and
   * 11.4% of the census) and a counter run is a SURFACE — at seed 4545 t=2100 the old 14% put 218
   * lit ember cells in horizontal slabs across the right of the frame, which is a garnish being
   * asked to be a pillar. spring keeps its 12%: it is the draw that stops a row of stalls reading
   * as one repeated stall, and it is small enough on screen to be affordable. */
  function counterHue(r) {
    if (r < 0.60) return P.amber;
    if (r < 0.74) return P.azure;
    if (r < 0.81) return P.ember;
    if (r < 0.93) return P.spring;
    return P.warm;
  }
  /* Vending machines are the other way round: a machine is a backlit screen, so azure still leads.
   * 46% -> 40% for the same census reason as above, and ember 10% -> 8%. spring is the one in five
   * that makes a bank read as different machines rather than as one machine repeated. Same argument
   * structure.js's propVend makes; this is a ROW of them, which is the whole difference. */
  function vendHue(r) {
    if (r < 0.40) return P.azure;
    if (r < 0.74) return P.amber;
    if (r < 0.92) return P.spring;
    return P.ember;
  }
  function litLum(col) {
    if (col === P.azure) return 96;
    if (col === P.warm) return 152;
    if (col === P.spring) return 155;
    if (col === P.violet) return 228;
    return 165;                                      // amber and ember
  }

  /* ---- 1. THE MARKET ROW ----------------------------------------------------------------------
   * Three to five stalls in a line under one canopy. The canopy is CONTINUOUS across the whole run
   * and the stalls are not: that contrast is the object. A canopy broken per stall reads as five
   * separate carts, which is the thing street.js already draws.
   *
   * Heights, in metres, and all five bands are load-bearing:
   *   0.00-0.94  goods and trestle. Black. This is the knee-height mass the frame was thin at.
   *   0.98-1.15  THE COUNTER. The lit band. Waist height, so it lands just below the eye line and
   *              runs away down the pavement in perspective. It was 0.96-1.24 and it is 0.17 m
   *              rather than 0.28 for one measured reason: at 4 m that band was six screen rows of
   *              unbroken lit fill per stall and the run read as a bright hoarding. At 0.17 m it is
   *              three rows near, one row from 15 m out, and the read at range is unchanged because
   *              a band under one row still floors to exactly one row.
   *   1.15-1.92  AIR, on most of the run. See below — this band is the whole difference between a
   *              market and a hoarding.
   *   1.92-2.02  THE STRIP LIGHT under the canopy, notched by whatever is hanging off the rail.
   *   2.26-2.54  the canopy itself. Black, and the largest single occluder this file draws.
   * The gap between 2.02 and 2.26 is not slack — it is what stops the strip light and the canopy
   * fascia landing on the same screen row at 25 m, where 20 cm is under one row and the nearer
   * plane simply deletes the lit one.
   *
   * THE BAND BETWEEN THE COUNTER AND THE STRIP LIGHT IS DELIBERATELY EMPTY, and it is the most
   * expensive lesson in this file. The first cut ran a black plate from the ground to 1.86 m
   * across the whole run, which is the honest shape of a stall with its back to a wall — and at
   * seed 3001 frame 1500 it stood an unbroken black wall the full length of the run across the
   * left half of the picture and deleted an entire lit facade with it. Whole-frame lit coverage
   * fell 63.8% -> 57.7% from that one object. A market has to be a row of THINGS with light between
   * them, not a fence: the shopfront band behind shows through the gaps, the stalls read as
   * separate, and the same walk costs a fraction of the picture. Only the stallholder blocks and
   * the hanging goods reach into that band, and both are per-stall and sparse. */
  /* MR_P was 0.30, KI_P 0.17 and VB_P 0.22, which put an object of some kind every fourteen metres
   * of walked street once both pavements are counted. A review found the market covering 5-14% of
   * the picture in 7 of 29 sampled frames; coverOf() caps how big any one of them gets, and these
   * cut how OFTEN one is close enough to matter. Together they are about a fifth fewer objects.
   * Count before brightness, and fewer better-placed objects before more dim ones. */
  var MR_PITCH = 30, MR_P = 0.25, STALL_W = 2.30;

  /* Three to five stalls, 6.9 to 11.5 m of pavement. ONE function, called by both the draw and the
   * visibility/frontage tests in drawMarket, because they were two copies of the same expression
   * for one revision and they had already drifted apart: the cull was sizing a six-stall run while
   * the draw built a five-stall one, so a row could be admitted on the strength of two metres of
   * frontage it did not occupy. A length that two callers must agree on gets one definition. */
  function rowStalls(sd) { return 3 + ((hash2(1, 0, sd + 101) * 2.99) | 0); }

  function marketRow(f, axis, along, wallC, inw, strip, sd) {
    var nst = rowStalls(sd);
    var len = nst * STALL_W;
    var back = wallC + inw * strip * 0.10;           // the wall the goods are stacked against
    var cnt  = wallC + inw * strip * 0.62;           // the counter face, toward the street
    var gds  = wallC + inw * strip * 0.82;           // produce stacked in front of the counter
    var rail = wallC + inw * strip * 0.90;           // the hanging rail, in front of the strip light
    var fas  = wallC + inw * strip * 0.98;           // the canopy fascia, at the kerb lip
    var a0 = along, a1 = along + len;
    var hue = counterHue(hash2(2, 0, sd + 211));
    var lum = litLum(hue);
    var i, a, h, hh, chue, clum;

    /* The screen-area cap for the whole run, measured across the canopy line because that is the
     * object's full extent. It SETS COV and COV_LIT, which panel() reads; it is module state and
     * not a parameter because panel() already takes twelve arguments and the eight calls below all
     * want the same value. coverClear() at the bottom of this function puts it back. */
    coverOf(axis, a0 - 0.45, a1 + 0.45, cnt, 2.54);

    /* The canopy, in two planes — the fascia the eye reads as a line and one plane of underside
     * behind it. Both black, both lum 0: they print nothing and stamp depth, which punches the run
     * out of the lit shopfront band behind it. That silhouette is the entire read at 30 m and it
     * costs the print budget precisely nothing. A third plane against the wall was drawn at first
     * and deleted: from the street the eye cannot separate it from the second, and it was 40% of
     * the canopy's coverage for no shape at all. */
    panel(f, axis, a0 - 0.45, a1 + 0.45, fas, 2.26, 2.54, 0, P.shadow, 0, 0, 0, sd);
    panel(f, axis, a0 - 0.45, a1 + 0.45, cnt, 2.30, 2.50, 0, P.shadow, 0, 0, 0, sd);

    /* THE STRIP LIGHT. One row of glyph, the full length of the run, and it is the long horizontal
     * that carries the perspective. It is drawn at the counter plane rather than at the fascia so
     * the fascia hangs in front of its top edge and it reads as being UNDER something. */
    panel(f, axis, a0 - 0.30, a1 + 0.30, cnt, 1.92, 2.02, G_EQ, hue, lum * 0.86, 0, 0, sd);

    for (i = 0; i < nst; i++) {
      a = along + i * STALL_W;
      h = hash2(i, 3, sd + 307);
      /* Goods, crates and trestle: pure mass under the light, and it stops at the counter. The
       * stack against the wall behind reaches 1.10 m — waist-high boxes, not a partition. */
      panel(f, axis, a + 0.06, a + STALL_W - 0.06, cnt, 0, 0.94, 0, P.shadow, 0, 0, 0, sd + i);
      panel(f, axis, a + 0.16, a + STALL_W - 0.16, back, 0, 1.10, 0, P.shadow, 0, 0, 0, sd + i);
      /* Somebody behind the counter, on two stalls in five. This is the ONLY thing that reaches
       * into the open band, it is 0.6 m wide, and it is what stops the gaps reading as a row of
       * empty tables. Silhouette only — a lit figure here would be the brightest thing on the
       * pavement and the crowd at layer 20 is drawn as a black cut-out for exactly that reason. */
      if (hash2(i, 8, sd + 907) < 0.40)
        panel(f, axis, a + 0.78, a + 1.38, back, 0.90, 1.86, 0, P.shadow, 0, 0, 0, sd + i);
      /* THE COUNTER. One massed horizontal BAND per stall — 0.17 m, three screen rows at four
       * metres and one from fifteen out — with the blocky glyphs jittered on the panel's own world
       * lattice so two adjacent stalls are not one long extrusion. The 0.10 m gaps between stalls
       * are the whole reason the run reads as a run of things. */
      /* Two thirds of the stalls take the row's hue and the rest light their own counter. That
       * split is not decoration: measured on seed 3001 frame 2160, where a row stands three metres
       * off the walk, a single-hue run took that frame's lit energy from amber 50.3% to 61.3%. One
       * object is not allowed to be eleven points of a frame's colour census however good the
       * pooled number looks, and a trader with his own strip light is what a market actually looks
       * like. The hue is an INDEPENDENT draw from the "is it the row's colour" roll — sharing one
       * would weld every odd stall to one colour. */
      chue = hash2(i, 10, sd + 1103) < 0.64 ? hue : counterHue(hash2(i, 11, sd + 1201));
      /* AND EMBER NEVER CARRIES THE BAND ITSELF. Cutting ember from 14% to 7% of the roll halves
       * how OFTEN a row is ember but does nothing about how much of one there is when it happens:
       * re-measured at seed 4545 t=2100 the row still put 278 ember cells on screen, and ember is
       * a 1.4% garnish across the whole build. The counter band is the largest lit surface in this
       * file, so the demotion is applied HERE and not in counterHue() — the row keeps its ember
       * strip light, its ember crate lid and its ember pool on the wet pavement, which is between
       * one and two rows of glyph each and is exactly what a garnish swatch is for. */
      if (chue === P.ember) chue = P.amber;
      clum = litLum(chue);
      panel(f, axis, a + 0.10, a + STALL_W - 0.10, cnt, 0.98, 1.15,
            FILL[(h * FILL_N) | 0], chue, clum * (0.90 + h * 0.14), 26, 0, sd + i);
      /* PRODUCE STACKED IN FRONT OF THE COUNTER, on a plane nearer than the counter so it wins the
       * depth test and NOTCHES the light. This is one of the three pieces that make a near stall
       * survivable — the other two are the 0.17 m counter band and coverOf()'s area cap. Walked
       * past at three metres, the original 0.28 m counter alone was a ten-row unbroken lit wedge
       * across the bottom corner of the frame, the biggest single object in the picture, and it
       * read as a bright rectangle rather than as a stall. The boxes cut it into lit and dark, and
       * cost the print budget nothing because they are lum 0. They are also the knee-height mass
       * this file was asked for: 1.06 m and 0.86 m are a crate stack and a sack pile. */
      /* TWO INDEPENDENT DRAWS, one per box. One draw thresholded twice welds the two stacks
       * together — every stall would either have both or exactly one, and which one would be fixed
       * by the threshold rather than by the stall. That shared-hash bug has been found three times
       * in this repo and it is cheaper to spend the second hash than to find it a fourth. */
      if (hash2(i, 9, sd + 1009) < 0.55)
        panel(f, axis, a + 0.34, a + 0.94, gds, 0, 1.06, 0, P.shadow, 0, 0, 0, sd + i);
      if (hash2(i, 12, sd + 1307) < 0.48)
        panel(f, axis, a + 1.32, a + 1.86, gds, 0, 0.86, 0, P.shadow, 0, 0, 0, sd + i);
      /* The stall divider: a dark post from the counter up to the canopy. It starts at the counter
       * and not at the ground because the goods mass below already owns that band, and a post
       * drawn through it is coverage bought twice. Two cells wide at 10 m and one at 30, which is
       * all a division needs to be. */
      panel(f, axis, a + STALL_W - 0.08, a + STALL_W + 0.02, cnt, 0.94, 2.30, 0, P.shadow, 0, 0, 0, sd);

      /* Hanging goods on the rail: a short black drop in front of the strip light, so it prints as
       * a NOTCH in the one lit line rather than as a mark of its own. Sparse — a drop at every
       * position is a fringe, and a fringe reads as a dashed line, not as goods. */
      hh = hash2(i, 4, sd + 401);
      if (hh < 0.62)
        panel(f, axis, a + 0.45 + hh * 0.5, a + 0.78 + hh * 0.5, rail, 1.62, 2.04,
              0, P.shadow, 0, 0, 0, sd + i);
      hh = hash2(i, 5, sd + 503);
      if (hh < 0.44)
        panel(f, axis, a + 1.30 + hh * 0.5, a + 1.55 + hh * 0.5, rail, 1.70, 2.04,
              0, P.shadow, 0, 0, 0, sd + i);
    }

    /* ONE lit crate lid in the whole run, on the stall the light is over. This is the only place
     * this file spends print on a knee-height edge, and it is one panel of meshed cells rather
     * than the continuous slate top edge that structure.js's props use: slate never prints above
     * v=74, so a continuous dim edge along an eleven-metre run is eleven metres of muddy. It takes
     * the ROW's hue and not the stall's: it is a lid catching the strip light overhead, which runs
     * the whole length, rather than the counter light of whichever stall it happens to sit at. */
    i = (hash2(6, 0, sd + 601) * nst) | 0;
    a = along + i * STALL_W;
    panel(f, axis, a + 0.30, a + 1.50, wallC + inw * strip * 0.80, 0.44, 0.52,
          G_DASH, hue, lum * 0.74, 0, 1, sd);
    coverClear();                                    // the pcell spills below are not area-capped

    /* The pool of the counter light on the wet pavement — three cells, the same idiom and the same
     * weather scaling as every other lamp on this street. It is what makes the run a light source
     * rather than a bright rectangle. */
    var wl = 24 + 28 * W_WET;
    a = along + len * 0.5;
    pcell(f, axis, a - 1.1, wallC + inw * strip * 0.88, 0.02, G_COMMA, hue, wl, 0.985);
    pcell(f, axis, a,       wallC + inw * strip * 0.99, 0.02, G_COLON, hue, wl * 1.25, 0.985);
    pcell(f, axis, a + 1.1, wallC + inw * strip * 0.88, 0.02, G_DOT,   hue, wl, 0.985);
  }

  /* Steam over the hot end of a market row. weather.js already owns a `steam` element (layer 14)
   * that hashes a 4 m world lattice for grates and vents; it knows nothing about where a fry
   * counter is, so a row can stand in clear air all night. THREE puffs, one cell each, and only
   * inside 26 m — a dense plume is a grey veil, which is the single failure the whole art
   * direction exists to prevent, and slate cannot print above v=74 so every one of these cells is
   * bought out of the muddy budget.
   *
   * Derived from t and a fixed per-puff phase rather than integrated, so scrubbing lands on the
   * same frame every time. Each puff completes 0.34 of a cycle per second (0.34 Hz), far under the
   * 2.6 Hz photosensitivity ceiling, and under reduced motion V.tt is a fixed constant so the
   * plume stands still rather than crawling at a third speed.
   *
   * THE ENVELOPE HAS AN ATTACK AND THAT IS NOT DECORATION. A bare (1-age)^2 decay with the old
   * `l < 6` cut meant the puff was invisible for age > 0.63 and then APPEARED at full brightness on
   * the single frame age wraps to 0 — lum 0 -> 44 in one 16 ms frame. It is one slate cell, slate
   * never prints above v=74, and 0.34 Hz is nowhere near any rate ceiling, so it was never a
   * violation. It is still a hard onset where this project's house style is a ramp — the same
   * argument signage.js writes out at its crest and ads.js at crest() — and a hard onset is
   * invisible to every whole-frame statistic while being perfectly visible in that one cell.
   * The first 16% of the cycle now ramps in linearly: 0.16 of a 2.94 s cycle is 0.47 s, so the
   * largest single-frame change in this cell is 1.56 lum at 60 Hz instead of 44 in one — measured
   * over 20 phases x 4000 frames, see the cut below. The decay is untouched, so the puff still
   * fades as it rises rather than being brightest at the top of its climb. */
  var PUFF_N = 3, PUFF_RATE = 0.34;                  // 0.34 Hz per puff. Ceiling is 2.6 Hz.
  var PUFF_ATK = 0.16, PUFF_ATK_INV = 1 / 0.16;

  function rowSteam(f, axis, along, wallC, inw, strip, sd, dd) {
    if (dd > 26) return;
    var cross = wallC + inw * strip * 0.62, j, ph, age, fade, l, drift;
    for (j = 0; j < PUFF_N; j++) {
      ph = hash2(j, 7, sd + 701);
      age = (V.tt * PUFF_RATE + ph) % 1;
      fade = (1 - age) * (1 - age);
      /* The envelope is BUILT and then scaled, never scaled and then floored — the lightning bug
       * this project has written down was a floor subtracted on the wrong side of the scale. */
      if (age < PUFF_ATK) fade *= age * PUFF_ATK_INV;
      l = 44 * fade;
      /* 1 and not the original 6: the cut is what the onset step actually is, because the first
       * frame the puff is drawn on is the first frame above it. Measured over 20 phases x 4000
       * frames at 60 Hz, largest single-frame change in this lum: 44.0 with the old bare decay and
       * a cut at 6 (a full-brightness appearance), 4.4 with the ramp and a cut at 3, and 1.56 with
       * the ramp and a cut at 1 — which is the ramp's own slope, 44 * (1/0.16) * (0.34/60), and is
       * therefore as smooth as this envelope can be. slate at lum 1.6 prints v=2, under the v<9
       * line every census in this project calls black. The extra cells are two frames per puff per
       * 2.94 s cycle and they print nothing. */
      if (l < 1) continue;
      /* The plume leans as it rises, on the same noise field the rest of the build reads its wind
       * from, keyed on the row's own seed so two markets never breathe in step. */
      drift = (vnoise(V.tt * 0.5 + ph * 20, sd + 811) - 0.5) * age * 1.9;
      pcell(f, axis, along + 1.1 + drift, cross, 2.62 + age * 2.2,
            age < 0.4 ? G_QUOTE : G_TICK, P.slate, l, 0.99);
    }
  }

  /* ---- 2. THE KIOSK ---------------------------------------------------------------------------
   * A lit box with a serving hatch, standing alone. Smaller than a row and, at a 13 m lattice
   * against the row's 30 m, about 40% more of them per hundred metres of street — one of these
   * on a block is what makes a street commercial, and a row of stalls on every block is a bazaar.
   * The hatch is the object: a lit rectangle at chest height with a dark roof over it and dark mass
   * under it is the most legible thing that fits on a pavement.
   *
   * WHAT MAKES IT A KIOSK AND NOT A STALL RUN OR A VENDING BANK, since a review found the three
   * indistinguishable at every range: the kiosk is the only one of the three that is ISOLATED and
   * TALL — a single block under two metres wide with a roof line above the hatch and two stool
   * cells below it, against the row's continuous eleven-metre strip light and the bank's evenly
   * spaced header lamps. The two menu-board cells at 1.74 m sit above the hatch with a dark gap
   * between, and no other object in this file puts light above head height. */
  var KI_PITCH = 13, KI_P = 0.15;

  function kiosk(f, axis, along, wallC, inw, strip, sd) {
    var face = wallC + inw * strip * 0.58;
    var lip  = wallC + inw * strip * 0.74;
    var roof = wallC + inw * strip * 0.90;
    var hue = counterHue(hash2(1, 0, sd + 101));
    var lum = litLum(hue);
    coverOf(axis, along - 1.00, along + 1.00, face, 2.50);

    /* Carcass and roof: black. The roof oversails the hatch by a third of a metre, which is what
     * puts the hatch in a shadow slot instead of on a flat face. */
    panel(f, axis, along - 0.85, along + 0.85, face, 0, 2.28, 0, P.shadow, 0, 0, 0, sd);
    panel(f, axis, along - 1.00, along + 1.00, roof, 2.28, 2.50, 0, P.shadow, 0, 0, 0, sd);
    panel(f, axis, along - 1.00, along + 1.00, face, 2.30, 2.48, 0, P.shadow, 0, 0, 0, sd);
    /* THE HATCH. 1.08-1.40 and not the original 1.06-1.46: 0.32 m rather than 0.40 is nine screen
     * rows at three metres instead of eleven, and it still floors to one row out at 26 m, which is
     * where the hatch stops being a rectangle and becomes the kiosk's one bright mark. The rest of
     * the near-range problem is coverOf()'s, not this band's. */
    panel(f, axis, along - 0.55, along + 0.55, face, 1.08, 1.40,
          G_8, hue, lum, 24, 0, sd);
    /* The serving shelf below it, at three quarters the hatch's brightness: it is a board catching
     * the light and not a second light. */
    panel(f, axis, along - 0.66, along + 0.66, lip, 0.94, 1.02, G_DASH, hue, lum * 0.78, 0, 0, sd);

    /* The menu board over the hatch. TWO CELLS, and this is the one place in the file that may be
     * violet: violet is a signage-only garnish here and a violet SURFACE turns the frame into the
     * cliche the references avoid, so it gets one in six kiosks and never more than a sign's worth
     * of cells. The colour is an independent draw from the hatch's — sharing one roll between the
     * sign and the counter welds every violet-signed kiosk to one counter colour, which is the bug
     * this repo has now found three times. */
    var sr = hash2(2, 0, sd + 211);
    var shue = sr < 0.17 ? P.violet : (sr < 0.60 ? P.amber : P.azure);
    var slum = litLum(shue);
    pcell(f, axis, along - 0.22, face, 1.74, G_0, shue, slum, 1);
    pcell(f, axis, along + 0.22, face, 1.74, G_0, shue, slum * 0.9, 1);

    /* Two stools at the shelf, knee height. Black posts with a lit seat cell each — the frame is
     * thin between the kerb and the counter and this is the band that fixes it. */
    var st = wallC + inw * strip * 0.94, k, sa;
    for (k = 0; k < 2; k++) {
      sa = along - 0.42 + k * 0.84;
      panel(f, axis, sa - 0.10, sa + 0.10, st, 0, 0.56, 0, P.shadow, 0, 0, 0, sd);
      pcell(f, axis, sa, st, 0.60, G_o, hue, lum * 0.70, 1);
    }
    coverClear();                                    // the pcell spills below are not area-capped

    var wl = 24 + 28 * W_WET;
    pcell(f, axis, along - 0.4, wallC + inw * strip * 0.86, 0.02, G_COLON, hue, wl * 1.2, 0.985);
    pcell(f, axis, along + 0.5, wallC + inw * strip * 0.99, 0.02, G_DOT,   hue, wl, 0.985);
  }

  /* ---- 3. THE VENDING BANK --------------------------------------------------------------------
   * Three or four machines shoulder to shoulder against the wall. structure.js has a propVend and
   * it is ONE machine with a 1.14 m lit face; this is deliberately the other object — a ROW, with
   * a per-machine hue draw, a shared dark carcass and a shorter window on each. The window is
   * SHORT on purpose: propVend's face runs 0.60-1.74 m, and four of those side by side is a lit
   * wall two metres high, which is more lit area than this whole file's budget.
   *
   * THIS WAS THE WORST OBJECT IN THE FILE AND THE SHORT WINDOW WAS NOT SHORT ENOUGH. The first cut
   * ran a solid 0.96-1.66 m lit face on every machine, and at seed 3412 frame 600 (400x100) a bank
   * at about five metres printed 1023 azure cells in ONE unbroken rectangle roughly 110 columns by
   * 19 rows. A 0.70 m band is only ever one screen row past 15 m, so nothing about the mid-range
   * read was paying for that; it was purely the near case, and the near case was a wall of digits.
   *
   * The bank is now built the way a bank actually reads, which also fixes the "I cannot tell a
   * kiosk from a vending bank from a stall run" finding — the three objects had no distinct
   * signature at any range:
   *   a HEADER LAMP per machine, 1.72-1.80 m. Eight centimetres, so it is two rows at 4 m and
   *     exactly one from 10 m out, and there is a dark 0.20 m gap between each. A row of short
   *     lit dashes all at ONE height, evenly spaced, is a bank of machines and nothing else on
   *     this street looks like it: the market row's strip light is CONTINUOUS across the whole run
   *     and the kiosk's hatch is a single isolated block.
   *   a MESHED product window, 1.10-1.42 m. Meshed rather than solid because a window with goods
   *     behind it is texture, not mass, and the checkerboard halves the lit cells outright.
   * Lit area per machine falls from 0.70 x 0.70 m of solid fill to about a third of that. */
  var VB_PITCH = 19, VB_P = 0.17, VB_W = 0.92;

  function vendBank(f, axis, along, wallC, inw, strip, sd) {
    var n = 3 + (hash2(1, 0, sd + 101) < 0.45 ? 1 : 0);
    var face = wallC + inw * 0.40;                   // 5 cm proud of structure.js's propVend plane
    var len = n * VB_W, i, a, hue, lum;
    coverOf(axis, along - 0.08, along + len + 0.08, face, 2.02);
    /* One carcass behind the lot, not one per machine: the bank is a single dark block with lit
     * windows cut in it, which is what makes it read as a bank rather than as four boxes. */
    panel(f, axis, along - 0.08, along + len + 0.08, face - inw * 0.04, 0, 2.02,
          0, P.shadow, 0, 0, 0, sd);
    for (i = 0; i < n; i++) {
      a = along + i * VB_W;
      hue = vendHue(hash2(i, 2, sd + 211));
      lum = litLum(hue);
      /* The header lamp. One row of glyph over each machine, with a gap between. */
      panel(f, axis, a + 0.08, a + VB_W - 0.10, face, 1.72, 1.80, G_DASH, hue, lum, 0, 0, sd + i);
      /* The product window. Jitter on the panel lattice so the goods inside are not a flat slab. */
      panel(f, axis, a + 0.14, a + VB_W - 0.16, face, 1.10, 1.42,
            G_8, hue, lum * 0.86, 30, 1, sd + i);
      /* The coin plate: one cell of the same light, which is what gives a machine a front. */
      pcell(f, axis, a + VB_W * 0.5, face, 0.92, G_DASH, hue, lum * 0.6, 1);
    }
    coverClear();
    /* Two cells of spill for the whole bank, at the ends. A pool under every machine is four times
     * the light on the floor that four small lamps actually throw. */
    var wl = 22 + 26 * W_WET;
    pcell(f, axis, along + VB_W * 0.5, wallC + inw * strip * 0.62, 0.02, G_COLON,
          vendHue(hash2(0, 2, sd + 211)), wl, 0.985);
    pcell(f, axis, along + len - VB_W * 0.5, wallC + inw * strip * 0.62, 0.02, G_DOT,
          vendHue(hash2(n - 1, 2, sd + 211)), wl, 0.985);
  }

  /* ---- the walk -------------------------------------------------------------------------------
   * Three independent lattices rather than one lattice with a kind roll: a market row wants a
   * 30 m pitch and a kiosk a 13 m one, and folding them together would either scatter rows every
   * thirteen metres or make kiosks as rare as rows. Each lattice takes ONE independent hash for
   * "is there one here" and another for its offset — sharing a draw between the two welds the
   * position of every market to whether it exists, which comes out as every market sitting at the
   * same place in its block. */
  function drawMarket(f) {
    if (!CITY) return;
    var axis, idx, n, side, wallC, inw, pave, strip, along, dd, sd, len;
    for (axis = 0; axis < 2; axis++) {
      for (idx = idxLo(axis); idx <= idxHi(axis); idx++) {
        streetSpan(axis, idx);
        /* An alley has no pavement to stand a stall on, and paveOf goes negative on one. 5 m is a
         * metre wider than structure.js's prop threshold because a market is deeper than a bollard
         * and the run has to clear the traffic. */
        if (SPAN.w < 5) continue;
        pave = paveOf(SPAN.w);
        strip = pave - KERB_LIP;
        if (strip < 1.05) continue;                  // no room for a counter and a punter
        for (side = 0; side < 2; side++) {
          wallC = side ? SPAN.c1 : SPAN.c0;
          inw = side ? -1 : 1;                       // from the building face toward the centre

          /* --- market rows --- */
          for (n = alongLo(axis, MR_PITCH); n <= alongHi(axis, MR_PITCH); n++) {
            if (hash2(idx * 2 + side, n, BASE + 907) > MR_P) continue;
            along = n * MR_PITCH + hash2(idx * 2 + side, n, BASE + 1013) * 12;
            sd = BASE + idx * 977 + n * 6151 + side * 37;
            len = rowStalls(sd) * STALL_W;
            /* -8 m, not the default: the run is up to 11.5 m long, so its midpoint crosses the eye
             * plane while its far half is still across a third of the frame. A midpoint test alone
             * deletes the whole canopy in one frame, which is both a visible pop and the exact
             * whole-frame luminance step the photosensitivity rule forbids. Everything that gets
             * past this is clipped exactly, per panel, by clipNear(). */
            dd = objVisible(axis, along + len * 0.5, wallC + inw, -8);
            if (!dd || dd > REACH) continue;
            if (!frontage(axis, along, len, wallC - inw * 0.5)) continue;
            marketRow(f, axis, along, wallC, inw, strip, sd);
            rowSteam(f, axis, along, wallC, inw, strip, sd, dd);
          }

          /* --- kiosks --- */
          for (n = alongLo(axis, KI_PITCH); n <= alongHi(axis, KI_PITCH); n++) {
            if (hash2(idx * 2 + side, n, BASE + 1117) > KI_P) continue;
            along = n * KI_PITCH + hash2(idx * 2 + side, n, BASE + 1223) * 8;
            dd = objVisible(axis, along, wallC + inw, -3);
            if (!dd || dd > REACH) continue;
            if (!frontage(axis, along - 1, 2, wallC - inw * 0.5)) continue;
            kiosk(f, axis, along, wallC, inw, strip, BASE + idx * 1301 + n * 4099 + side * 53);
          }

          /* --- vending banks --- */
          for (n = alongLo(axis, VB_PITCH); n <= alongHi(axis, VB_PITCH); n++) {
            if (hash2(idx * 2 + side, n, BASE + 1327) > VB_P) continue;
            along = n * VB_PITCH + hash2(idx * 2 + side, n, BASE + 1433) * 9;
            dd = objVisible(axis, along + 1.4, wallC + inw, -4);
            if (!dd || dd > REACH) continue;
            if (!frontage(axis, along, 3.7, wallC - inw * 0.5)) continue;
            vendBank(f, axis, along, wallC, inw, strip,
                     BASE + idx * 1523 + n * 3671 + side * 61);
          }
        }
      }
    }
  }

  CC.ELEMENTS.push({
    name: 'market',
    /* CITY ONLY. See src/world.js: an element with no `world` belongs to both, and main.js
     * filters CC.ELEMENTS on this before the layer sort. */
    world: 'cyber',
    /* 17: free, and below streetprops (19) and the pedestrians (20) on purpose. Both of those draw
     * after this file and both are depth-tested, so a walker in front of a stall correctly cuts a
     * hole in the counter light rather than being painted over by it. */
    layer: 17,
    init: function (city) { boot(city); },
    draw: function (f, cam, t) {
      view(f, cam, t === undefined ? (cam.t || 0) : t);
      drawMarket(f);
    }
  });

})(typeof CC !== 'undefined' ? CC : require('../core.js'));
