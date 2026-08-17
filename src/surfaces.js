/* CyberCity surfaces — pure texture lookups. No camera, no raycasting, and no per-FRAME state:
 * the one piece of state in the file is two integers sky() keeps to recover the rooftop row of
 * the column it is currently walking down, and it is rebuilt from scratch on every column.
 *
 * Every function is called once per screen cell, so nothing here allocates: each returns a
 * module-level scratch object. THE CALLER MUST NOT RETAIN THE RETURNED OBJECT — copy ch/col/lum
 * out before the next call to the same function. (facade/floorTex/sky each own a separate
 * scratch, so holding a facade result across a floorTex call is safe; holding two facade
 * results is not.)
 *
 * `ch === 0` means "leave this cell black" — a legal, common answer. Roughly half of every
 * frame is meant to be untouched.
 *
 * fog() is NOT applied by facade/floorTex; they return the surface's own brightness. Whoever
 * owns the world pass applies fog exactly once, or distant walls get attenuated twice and the
 * street reads as a tunnel of soot. sky() is already unfogged and fog(lum, Infinity) is a
 * no-op, so a blanket fog pass over the frame is safe.
 *
 * INTEGRATION — three things this layer cannot know, so the world pass must tell it once:
 *   CC.Surf.configure({ grid, streetX, streetPeriod, half, horizon })
 *     grid         metres per city cell; facade corner ribs land on multiples of it
 *     streetX      world x of the canyon centreline; streetPeriod wraps the road pattern onto
 *                  the grid so an unconfigured canyon still gets a centreline and kerbs
 *     half         centreline-to-kerb metres
 *     horizon      screen row of the horizon; sky() ramps its light pollution from there
 *   sky(sx, sy, t) takes SCREEN cells. If the camera yaws, pass a yaw-compensated column
 *     (x + yaw/fov*cols | 0) or the stars ride the view instead of the sky.
 *     ORDER MATTERS for sky() and only for sky(): call it down a column, sy DECREASING, so it can
 *     recover where that column's rooftop was — that is what the glow is anchored to. Everything
 *     else in this file may be called in any order at all.
 *   T_FAR should match CC.Surf.FOG_END — past it fog() returns 0 and marching is wasted work.
 */
(function (CC) {
  'use strict';

  var P = CC.P, g = CC.g, hash2 = CC.hash2, clamp = CC.clamp, vnoise = CC.vnoise;

  /* Glyph indices resolved once — g() is a string-keyed lookup and this runs cols*rows times. */
  var G_DOT = g('.'), G_COMMA = g(','), G_COLON = g(':'), G_SEMI = g(';'), G_QUOTE = g("'"),
      G_TICK = g('`'), G_DASH = g('-'), G_UNDER = g('_'), G_EQ = g('='), G_PLUS = g('+'),
      G_PIPE = g('|'), G_SLASH = g('/'), G_BSLASH = g('\\'), G_HASH = g('#'), G_PCT = g('%'),
      G_8 = g('8'), G_O = g('O'), G_0 = g('0'), G_X = g('X'), G_Z = g('Z'), G_W = g('W'),
      G_M = g('M'), G_TILDE = g('~'), G_oo = g('o'), G_DQ = g('"'), G_V = g('V');

  /* What share of ground-floor shop units are open, and therefore lit. Exported on CC.Surf because
   * signage.js's shopSpill re-derives the same test to land its pool under a lit window rather than
   * under a shutter; see the note where ground() spends it for why it moved from 0.40. */
  var SHOP_OPEN = 0.52;

  /* Blocky fills only. Anything with visual "holes" (& $ ? !) reads as noise at this size. */
  var FILL   = [G_8, G_0, G_O, G_HASH, G_X, G_Z, G_8, G_M, G_W, G_PCT];
  var FILL_N = FILL.length;
  var DIMGL  = [G_COLON, G_DOT, G_QUOTE, G_DASH, G_SEMI, G_COMMA, G_TICK, G_UNDER];
  var DIMGL_N = DIMGL.length;

  /* Facade styles. pu/pv are the bay pitch in metres — measured off real curtain wall, 2–4 m
   * across and one storey (2.8–4.4 m) up. mu/sill/head are the fraction of the bay that is
   * concrete rather than glass; that concrete is what makes the wall read as a slab. */
  var STYLE = [
    { pu: 2.60, pv: 3.30, mu: 0.20, sill: 0.20, head: 0.86, panes: 2, prow: 1, band: 4, gnd: 4.2 },
    { pu: 3.40, pv: 3.90, mu: 0.15, sill: 0.13, head: 0.90, panes: 3, prow: 2, band: 3, gnd: 4.8 },
    { pu: 2.10, pv: 2.90, mu: 0.26, sill: 0.26, head: 0.80, panes: 1, prow: 1, band: 5, gnd: 3.6 },
    { pu: 4.10, pv: 4.40, mu: 0.12, sill: 0.10, head: 0.93, panes: 4, prow: 2, band: 3, gnd: 5.4 },
    { pu: 3.00, pv: 3.60, mu: 0.18, sill: 0.22, head: 0.84, panes: 2, prow: 2, band: 4, gnd: 4.4 }
  ];

  /* Everything the texture layer cannot derive on its own. city.js/raycast.js should call
   * CC.Surf.configure() once after the map exists; the defaults describe an 8 m grid with the
   * canyon running down the middle of a cell, which is what the harness renders. */
  var CFG = {
    grid: 8.0,        // metres per city cell — corner ribs land on this
    streetX: 4.0,     // world x of the canyon centreline
    streetPeriod: 8.0, // road markings repeat on the grid, so an unconfigured canyon still gets kerbs
    half: 3.10,       // centreline-to-kerb metres
    horizon: 33.6,    // screen row of the horizon; sky() needs it for the light-pollution ramp
    /* The sky glow's e-fold used to be a fraction of `horizon`, and the day the camera learned to
     * PITCH that stopped being a length on the picture: cam.horizon slides over 0.26..0.86 of the
     * grid, so simply looking up stretched the light-pollution ramp by three and a bit and the
     * roofline glow visibly grew as you tilted. `rows` is the grid, it never moves, and it is what
     * the ramp is a fraction of. horizon still anchors WHERE the ramp starts. */
    rows: 60,
    /* Where the cross streets cut this one, in the same axis floorTex reads as wz. This file has no
     * city to ask, so the world pass loads them; with xn 0 the road simply runs on unbroken, which
     * is what the bare harness wants. Fixed-length and written in place — the caster refills these
     * every frame and must not be handed an allocation to do it. */
    xn: 0,
    xc: new Float64Array(8),
    xw: new Float64Array(8),
    xz0: 0, xpitch: 26,   // xc[0] and the city's block pitch, so the nearest entry can be INDEXED
                          // rather than searched: this runs twenty thousand times a frame
    /* Whether THIS street carries tram rails. Rolled once per configure() rather than per cell:
     * a rail that appears for some cells of a street and not others is not a rail. */
    rail: 0,
    skySeed: 0x5EED,
    /* How many of sky()'s elevation index units one screen row is worth. 1.0 means "the neutral
     * camera", and the world pass overwrites it every frame from the live projection so that the
     * star field magnifies under zoom instead of being re-dealt. Defaulted to 1 so an
     * unconfigured harness — and the standalone parse check — still gets the shipped sky. */
    skyVScale: 1
  };
  function configure(o) {
    if (!o) return CFG;
    for (var k in o) if (CFG[k] !== undefined && o[k] !== undefined && k !== 'xc' && k !== 'xw')
      CFG[k] = o[k];
    /* Rails belong to the street, so they are decided by the street's own centreline and width and
     * nothing else — walking the same avenue twice has to give the same track. */
    CFG.rail = (CFG.half > 2.7 && hash2((CFG.streetX * 4) | 0, (CFG.half * 8) | 0, 0x5A11) < 0.34)
             ? 1 : 0;
    return CFG;
  }

  /* ---- weather, sampled once per frame ---------------------------------------------------
   * CC.Weather.rel(key) does a linear KEYS.indexOf, and this file would call it twenty thousand
   * times a frame. `t` is the frame clock and changes exactly once per frame, so it is also the
   * cache key — and because it is the clock and not a counter, scrubbing the harness to frame 9000
   * syncs the same weather the browser has there.
   *
   * MIGRATION RULE, applied throughout: every tuned constant below is scaled by rel(...), which is
   * 1.0 under the 'rain' preset the whole build was tuned against. Multiplying by the raw P.wet
   * would silently re-tune the street to 90% of what shipped. */
  var wT = 1 / 0, wWet = 1, wRain = 1, wWind = 1, wFogP = 0.30;
  function weatherAt(t) {
    if (t === wT) return;
    wT = t;
    var W = CC.Weather;
    if (!W) return;                      // standalone require: hold the tuned reference look
    wWet = W.rel('wet'); wRain = W.rel('rain'); wWind = W.rel('wind');
    wFogP = W.P.fog;
    refog();
  }

  /* ---- cell metadata, defensively ------------------------------------------------------
   * city.js owns the cell record and may not carry every field, so read through helpers and
   * fall back to a hash. A missing field must degrade, never throw or blank the wall. */
  function seedOf(cell) {
    if (!cell || typeof cell !== 'object') return 0;
    if (cell.seed !== undefined) return cell.seed | 0;
    if (cell.id !== undefined) return cell.id | 0;
    var x = cell.gx !== undefined ? cell.gx : (cell.x !== undefined ? cell.x : 0);
    var z = cell.gz !== undefined ? cell.gz : (cell.z !== undefined ? cell.z : 0);
    return (hash2(x, z, 7717) * 2147483647) | 0;
  }
  function styleOf(cell, sd) {
    var s = cell && cell.style;
    if (typeof s === 'number') return STYLE[((s | 0) % STYLE.length + STYLE.length) % STYLE.length];
    return STYLE[(hash2(sd, 11, 0x51) * STYLE.length) | 0];
  }
  function litOf(cell) {
    var r = cell && cell.litRate;
    return typeof r === 'number' ? clamp(r, 0, 1) : 0.34;
  }
  /* One accent per building, never two — a facade that mixes ember and violet stops reading
   * as one object. Violet stays rare: it is ~12% of an accent that is itself ~10% of windows. */
  function accentOf(cell, sd) {
    if (cell && typeof cell.accent === 'number') return cell.accent | 0;
    var r = hash2(sd, 5, 0x33A);
    return r < 0.46 ? P.ember : (r < 0.86 ? P.spring : P.violet);
  }
  /* The building's dominant hue. city.js picks this from the DISTRICT, which is the entire
   * point of having districts: it is what makes an ember pocket read as an ember pocket rather
   * than as more of the same wall. Re-rolling it off the building seed — which is all this file
   * used to do — flattens six districts into one and starves two of the three accents. The seed
   * roll survives only as a fallback for a cell record that never carried the field. */
  function hueOf(cell, sd) {
    if (cell && typeof cell.hue === 'number') return cell.hue | 0;
    var dr = hash2(0, 0, sd ^ 0x2B1D);
    return dr < 0.58 ? P.azure : (dr < 0.90 ? P.amber : P.warm);
  }

  /* ---- facade ---------------------------------------------------------------------------
   * u = metres along the wall, v = metres up from the street.
   * Every hash is keyed on the bay index and the building seed, never on u/v directly and never
   * on anything derived from the camera — a facade whose windows re-roll as you walk destroys
   * the illusion faster than any other error in this project. */
  var FOUT = { ch: 0, col: 0, lum: 0 };
  function fset(ch, col, lum) {
    FOUT.ch = ch; FOUT.col = col;
    FOUT.lum = lum < 0 ? 0 : (lum > 255 ? 255 : lum | 0);
    return FOUT;
  }

  /* Dirt, streaking and reflection at ~8 cm — the only detail that survives when a wall is
   * four metres away and one bay covers thirty columns. Keyed on quantised WORLD coordinates,
   * so it is welded to the building and cannot crawl as the camera advances. */
  function grain(u, v, sd, lod) {
    if (lod < 2) return 1;
    var h = hash2(Math.floor(u * 11), Math.floor(v * 11), sd ^ 0x6A11);
    return h < 0.12 ? 0.30 : 0.74 + h * 0.52;
  }

  function facade(u, v, cell, dist, t) {
    if (v < 0) v = 0;
    weatherAt(t === undefined ? 0 : t);
    var sd = seedOf(cell), st = styleOf(cell, sd);

    var wu = Math.floor(u / st.pu), wv = Math.floor(v / st.pv);
    var fu = u / st.pu - wu, fv = v / st.pv - wv;

    /* At 40 m one character spans several metres of wall, so per-pane hashing would alias into
     * static. Coarsen the lattice with distance instead: shifted bay indices are stable, so the
     * pattern locks to the building rather than crawling as `dist` changes.
     * The switch distance is jittered PER BAY so the boundary dissolves bay by bay instead of
     * sweeping the wall as one hard line you can watch travelling towards you. */
    var lj = dist + (hash2(wu, wv, sd ^ 0x9C) - 0.5) * 7;
    var lod = lj < 13 ? 2 : (lj < 34 ? 1 : 0);
    /* CONTENT indices never coarsen. They used to: `bu = lod===0 ? wu>>1 : wu` fed the lit test
     * and the hue picks, so crossing the 34 m LOD boundary re-rolled WHICH windows were lit and
     * a whole facade visibly re-shuffled as you walked up to it — the worst possible place to
     * change your mind, because the eye is already tracking that wall. Only the decorative glyph
     * pick coarsens, via `glu`; swapping one blocky fill character for another at 40 m is
     * invisible, while changing the lit pattern is not. */
    var bu = wu, bv = wv;
    var glu = lod === 0 ? (wu >> 1) : wu;

    /* Street level is exempt from the dark-block mask below: the parade of shopfronts has its
     * own rhythm, and punching four-bay holes in it breaks the band that anchors the wall to
     * the ground — the one horizontal the eye uses to read the canyon's depth. */
    if (v < st.gnd) return ground(u, v, st, sd, cell, lod, t);

    /* ---- the roofline -------------------------------------------------------------------------
     * The top two metres of every wall are a PARAPET, not more windows. This is the one feature of
     * a facade that cannot be derived from u and v alone — it needs the building's height, which is
     * why the world pass now puts that on the cell record — and it earns the extra field because
     * the rooftop line is the silhouette the entire picture is composed around. Without it a wall
     * simply stops wherever its window grid ran out, and every roof in the frame is the same roof.
     *
     * Three courses, top down: a coping that catches the sky glow behind it, a blank upstand, and
     * the shadow line where the parapet oversails the wall. Together they read as a THICKNESS at
     * the top of the building, which is the whole difference between a parapet and a painted line.
     * All three are cheap in coverage because they REPLACE two storeys of window lattice. */
    var bh = cell && typeof cell.h === 'number' ? cell.h : 0;
    if (bh > 6 && v > bh - 2.35) {
      var pu2 = Math.floor(u / 1.9);
      if (v > bh - 0.42)                      // coping, jointed every 1.9 m like real precast
        return fset((u - pu2 * 1.9) < 0.16 ? G_PIPE : G_EQ, P.slate,
                    24 + hash2(pu2, 0, sd ^ 0x2A1) * 22);
      if (v > bh - 1.85) {
        var pg = hash2(pu2, Math.floor(v * 2.2), sd ^ 0x2A2);
        return pg < 0.32 ? fset(DIMGL[(pg * DIMGL_N * 3.1) | 0], P.shadow, 14 + pg * 34)
                         : fset(0, P.shadow, 0);
      }
      return fset(G_UNDER, P.shadow, 30 + hash2(pu2, 3, sd ^ 0x2A3) * 28);
    }

    /* Weather on the wall. Rain does not run evenly down a facade — it sheets off the sills and
     * leaves vertical stripes of washed and unwashed concrete, and those stripes are the only
     * thing on a wall that says the wall is wet. Keyed on world u ALONE, so a streak is a fixed
     * feature of the building rather than something that crawls across it, and it fades in and out
     * with the rain instead of switching. */
    var streak = 0;
    if (lod > 0 && wRain > 0.15 &&
        hash2(Math.floor(u * 3.1), 0, sd ^ 0x7C1) < 0.30 * clamp(wRain, 0, 1.3)) streak = 1;

    /* Rainwater downpipe, on a third of buildings. It runs the full height inside a bay joint, so
     * it lands on mullion cells rather than on glass and costs the wall almost nothing it was
     * using. It is one of only two unbroken verticals a facade has — the corner rib is the other —
     * and a wall with no vertical at all reads as a lattice instead of as a building. */
    if (lod > 0 && hash2(sd, 17, 0x3D1) < 0.26 &&
        (((bu % 3) + 3) % 3) === ((hash2(sd, 18, 0x3D1) * 3) | 0) && fu < 0.085) {
      var dg = hash2(0, Math.floor(v * 1.6), sd ^ 0x3D2);
      return fset(dg < 0.13 ? G_O : G_PIPE, P.slate, 13 + dg * 20);   // brackets every metre or so
    }

    /* Dark blocks: derelict floors, empty lets, the shadowed half of a plant room. These are
     * where the 55%-black budget comes from, and being 4 bays wide they read as mass rather
     * than as holes punched in a lattice. */
    /* Grain matters as much as probability here. At >>2 the mask worked in four-bay by two-storey
     * blocks, which on a wall seven metres away is a twenty-by-twenty pure-black rectangle with
     * hard edges — not mass, a hole cut in the building. Halving the horizontal grain and cutting
     * the rate keeps the derelict floors while letting the wall stay a wall up close. */
    if (hash2(wu >> 1, wv >> 1, sd ^ 0x1F35) < 0.18) {
      return fset(0, P.shadow, 0);
    }

    /* Corner rib. Buildings sit on the city grid, so a wall's corners are wherever u crosses a
     * grid line; the rib is brighter than the mullions so the silhouette edge stays readable. */
    if (lod > 0) {
      var ge = u / CFG.grid; ge -= Math.floor(ge);
      if (ge * CFG.grid < 0.20 || (1 - ge) * CFG.grid < 0.20) {
        return fset(G_PIPE, P.slate, 9 + hash2(wu, wv, sd ^ 0x4C) * 13);
      }
    }
    /* Floor band every few storeys — a belt course, the only strong horizontal on the wall. */
    if (fv < 0.11 && (wv % st.band) === 0 && hash2(wu, wv, sd ^ 0xB2) < 0.72) {
      return fset(G_EQ, P.slate, 12 + hash2(wu, wv, sd ^ 0xB1) * 16);
    }

    /* Lit windows must CLUSTER, not speckle. Biasing the threshold by a per-column and a
     * per-storey hash (both mean 1.0, so the cell's litRate still holds on average) gives
     * lit stacks and lit floors — the massed slabs the references are made of. */
    var pcol = 0.35 + 1.30 * hash2(bu, 0, sd ^ 0x71);
    var prow = 0.45 + 1.10 * hash2(0, bv, sd ^ 0x37);
    var lit = hash2(bu, bv, sd) < litOf(cell) * pcol * prow;
    var hue = P.slate, base = 0;

    var isAcc = 0, curtain = 0, occupied = 0, ws = 0;
    if (lit) {
      /* Most windows take the building's DISTRICT hue; a tenant here and there breaks it.
       * Colour massing per building is why the references never look like confetti. */
      if (hash2(bu, bv, sd ^ 0x4D) < 0.62) {
        hue = hueOf(cell, sd);
      } else {
        var hr = hash2(bu >> 1, bv, sd ^ 0x2B1D);
        if      (hr < 0.30) hue = P.azure;   // screenlight and sodium in the ratio measured off
        else if (hr < 0.72) hue = P.amber;   // the references: azure ~27% of lit energy, amber ~26%
        else if (hr < 0.78) hue = P.warm;    // someone is home — a garnish, not a third pillar
        // P.ice is documented as holo/glass/rain highlight, not a facade swatch. It sat here on
        // 8% of windows and, combined with the accent path, became the fourth-largest colour in
        // the frame. Slate is the cold-glass read without a fourth pillar.
        else if (hr < 0.86) hue = P.slate;
        else {
          /* An accent must be a STRIPE, never a slab. Probability alone does not bound its AREA:
           * this hash is keyed on the bay column, so one unlucky roll paints every storey of a
           * two-bay column, and on a wall seven metres away that is a solid 7x12-cell block of
           * ember or red carrying a tenth of the frame's colour by itself. Gate it on a coarse
           * lot-level slot instead — at most one bay column in five of any building may take an
           * accent, and the rest fall back to a pillar. */
          var slot = (hash2(sd, 9, 0x2C7) * 5) | 0;
          if ((((bu % 5) + 5) % 5) === slot) { hue = accentOf(cell, sd); isAcc = 1; }
          else hue = hash2(bu, 0, sd ^ 0x2C8) < 0.5 ? P.azure : P.amber;
        }
      }
      /* Brightness is shared along a floor, then jittered per bay — an office lit by one
       * ceiling grid does not vary window to window as much as floor to floor. */
      base = 172 + hash2(0, bv, sd ^ 0x5) * 56 + hash2(bu, bv, sd ^ 0x9E) * 28;
      /* Upper storeys sit further from the street's own light and read as further back;
       * without this a 60 m tower is a flat wall of equal-brightness cells. */
      base *= 1 - clamp(v / 190, 0, 0.24);
      /* Accents are narrow in AREA above and in ENERGY here: an ember bay at 250 out-weighs
       * three azure ones and drags the whole frame's balance with it. */
      if (isAcc && base > 148) base = 148;

      /* A few tubes are failing. Every window gets its OWN phase: keying the blink on a global
       * time bucket made every failing tube in the city blink in lockstep, which is not a city,
       * it is a strobe. 1.9 Hz base rate, and it stops entirely under reduced motion. */
      if (lod > 0 && !CC.reducedMotion && hash2(bu, bv, sd ^ 0x5BD1) < 0.055) {
        var tk = Math.floor(t * 1.9 + hash2(bu, bv, sd ^ 0x5BE2) * 40);
        if (hash2(bu ^ tk, bv, sd ^ 0x77) < 0.34) base *= 0.22;
      }

      /* WINDOW STATE. A lit window is not one thing, and a wall on which every lit window is the
       * same lit window is the flattest surface in the frame however well its colour is massed.
       * Three states beyond plain, rolled once per bay off the bay's own hash so a window keeps
       * what it is as you walk past it:
       *   curtained  a drawn blind or a net — flat, dimmer, no pane grid behind it, and warm on a
       *              minority because a domestic curtain is lit by a domestic lamp. Warm is a
       *              garnish and not a third pillar, so most curtains keep the building's own hue.
       *   occupied   somebody standing in the glass. Drawn as an ABSENCE in the pane below, which
       *              is the only way a silhouette can be drawn and also the cheapest.
       *   dead       handled in the unlit branch; a window with the glass gone. */
      ws = hash2(bu, bv, sd ^ 0x6C21);
      if (ws < 0.15) {
        curtain = 1;
        base *= 0.64;
        if (hash2(bu, bv, sd ^ 0x6C22) < 0.30) hue = P.warm;
      } else if (ws < 0.22) occupied = 1;
    }

    if (lod === 0) {
      /* Far away the mullions are sub-cell; drawing them would just dither the slab. Unlit
       * bays go black and let the raycaster's silhouette carry the building. */
      if (lit) return fset(FILL[(hash2(glu, bv, sd ^ 0x3) * FILL_N) | 0], hue, base * 0.92);
      return hash2(wu, wv, sd ^ 0x5) < 0.17
        ? fset(G_COLON, P.shadow, 9 + hash2(wu, wv, sd ^ 0x6) * 6) : fset(0, P.shadow, 0);
    }

    var inU = fu > st.mu && fu < 1 - st.mu;
    var inV = fv > st.sill && fv < st.head;

    if (!inU || !inV) {
      /* Structure — the concrete a curtain wall is hung on, and the reason a facade reads as a
       * SLAB instead of as scaffolding. Two tiers, and the distinction is the whole trick:
       * the mullion LINES carry an edge, and the spandrel field behind them is painted at the
       * bottom of the visible range so the wall has mass without acquiring a grey veil.
       *
       * `lum` is not brightness. P.shadow's pigment is (40,50,66), so the swatch tops out at a
       * rendered value of 60 however hard it is driven — still under P.slate at lum 60, which
       * prints 65. The old code drew this tier at lum 8-27 on P.shadow, i.e. at a rendered value
       * of 1-3, and then wondered where its exposure had gone: it was paying for tens of thousands
       * of cells that were arithmetically indistinguishable from black.
       *
       * "Everything below is chosen by rendered value, not by lum" USED TO BE TRUE AND IS NOT.
       * The tiers below were fitted against an EXPOSURE table that gave shadow 2.60 and slate
       * 2.00; core.js's refit cut them to 0.80 and 0.60, so every literal in this function now
       * prints at roughly a third of the value it was chosen for. Measured on the current table:
       * shadow is invisible (v<9) below lum 12 and reaches only v 24 at lum 22; slate is invisible
       * below lum 11. The spandrel salt at 8-22 therefore prints v 4-24 and the dead-glass salt at
       * 6-14 prints v 2-13, which is most of the way back to the 1-3 this paragraph is about.
       *
       * That is NOT a licence to multiply these numbers up. The crush is now core.js's, it is
       * deliberate, and it is measured there: at KNEE 0.075 "99.7% of what goes dark is slate and
       * shadow", which is this file's structural dither by name. Over a 32-frame fixture (seeds
       * 3001+137k, k=0..15, frames 600 and 1800 at 400x100) blank is 42.3% and black(v<9) 57.2%,
       * so 14.9% of ALL cells are painted-and-invisible, nearly all of it this tier and the floor's
       * — and lifting that mass back over v=9 would put the muddy band, which core.js holds at
       * 27.9% against a <30 target, straight through the target. The honest description is: this
       * tier is now MASS THE PRINT DELETES, and it survives as coverage rather than as texture.
       * Anyone who wants it visible again has to buy it from the muddy band and say so. */
      var onU = fu < st.mu * 0.45 || fu > 1 - st.mu * 0.45;
      var onV = fv < st.sill * 0.40 || fv > 1 - (1 - st.head) * 0.40;
      var ml = (lod === 2 ? 62 : 48) + hash2(wu, wv + 9973, sd) * 26;
      /* The mullion picks up a little of its window's colour: that spill is what turns a grid
       * of bright dots into a lit slab. */
      if (lit) return fset(onV ? G_DASH : G_PIPE, hue, ml + base * 0.16);

      /* The dark tiers are P.shadow, and that is a deliberate choice against the print curve
       * rather than a default. core.js prints each swatch through its own gain, and the numbers
       * this argument used to quote (amber 3-148, azure never below 76, shadow 23 at lum 6) were
       * taken off the pre-refit table. RE-MEASURED on the current one, near bucket, pigment
       * included: amber runs 0-179, azure 0-219, shadow 0-60. The ARGUMENT still holds and it is
       * now about the SLOPE rather than the floor — azure's gain is 1.00, the highest in the
       * table, so it goes from invisible at lum 4 to v 77 at lum 16 and v 125 at lum 48. Its
       * entire dim range is eleven units of lum wide, which is not a range anything can be dialled
       * into: tinting this tier with the district hue still lights every dead wall in a screen
       * district as brightly as its own windows. P.shadow spreads its whole 0-60 over the full
       * 0-255 (v 24 at lum 22, v 33 at lum 50, saturating at 60), so it is still the only swatch
       * that can carry MASS: present everywhere, incapable of blowing out, and it takes fog
       * straight down to black. The district's colour lives in the lit tiers, where brightness is
       * the point.
       *
       * What DID change is the floor: shadow prints nothing until lum 12 now, where the old table
       * had it over v=9 from lum 3, so the "dim but present" tiers below now sit on the edge of
       * the print rather than just inside it. That is the subject of the note above. */
      /* Plant: an air-conditioning box or an extract grille bolted onto the spandrel under the
       * sill. One bay in seven, near only, and it is the difference between a spandrel band that
       * is one continuous course of concrete for sixty metres and one that has been lived in. */
      if (lod === 2 && fv < st.sill * 0.86 && fu > 0.26 && fu < 0.74 &&
          hash2(bu, bv, sd ^ 0x4E1) < 0.10) {
        var acg = hash2(Math.floor(u * 4.4), Math.floor(v * 4.4), sd ^ 0x4E3);
        return fset(acg < 0.34 ? G_HASH : (acg < 0.72 ? G_EQ : G_PIPE), P.slate, 15 + acg * 26);
      }

      if (onU || onV) {
        /* Mullion on a dead bay. Broken up rather than drawn continuously — a complete tracery
         * over a dead building is still a veil, just a thinner one. */
        if (hash2(wu, wv + 5, sd ^ 0xE) < 0.50) return fset(0, P.shadow, 0);
        return fset(onV ? DIMGL[(hash2(wu, wv + 31, sd ^ 0xD) * DIMGL_N) | 0] : G_PIPE,
                    P.shadow, 30 + hash2(wu, wv + 31, sd ^ 0xD) * 50);
      }
      /* Spandrel field — the mass itself, at the very bottom of the visible range. Keyed on a
       * sub-bay quantisation of the world position so it is a texture on the concrete and not
       * one flat tone per bay. */
      /* A streak lands HERE, on the blank concrete, which is where a real one is visible. It is
       * drawn as a continuous vertical rather than as more dither, because the whole point of a
       * run-off mark is that it is a line the wall did not have before it rained. */
      if (streak) {
        var stg = hash2(Math.floor(u * 3.1), Math.floor(v * 1.5), sd ^ 0x7C2);
        if (stg < 0.50) return fset(G_PIPE, P.shadow, 24 + stg * 46);
      }
      /* THE SPANDREL FIELD, AND ITS BUDGET ARGUMENT HAS EXPIRED. Everything above and in the
       * structure tier says this mass is held blank and near-black because lifting it would put
       * the muddy 9-119 band through core.js's <30 target. That was true and it was measured; the
       * band sat at 31.6-32.5% for the whole of the period those notes were written in.
       *
       * It is now 26.6%, and the reason is a repair rather than a taste: three branches in this
       * file were painting 7.3% of every cell in the frame at lums that could not clear v=9, so
       * the frame was paying for them and printing black. Deleting them returned 3.4 points of
       * headroom. Spending part of it HERE is the point of having found it — this is the tier the
       * file has twice written down as the one it would fund first, because a wall with no mass
       * between its lit windows reads as scaffolding rather than as a building.
       *
       * lum 16-42 on P.shadow prints v 18-31 on the current table: visible, and incapable of
       * blowing out, because shadow's pigment (40,50,66) saturates at v 60 however hard it is
       * driven. That is exactly why it is the swatch that can carry area — it costs the muddy band
       * and it can never cost the hot tail. Coverage 0.18 -> 0.26 of the field for the same reason.
       * Measured over the 24-frame fixture, this change and the dead-glass one below together:
       * see the note on the unlit-glass tier, which carries the numbers and is honest that they
       * are smaller than two eight-point coverage raises would suggest. */
      if (hash2((u * 3.2) | 0, (v * 3.2) | 0, sd ^ 0xE5) < 0.74) return fset(0, P.shadow, 0);
      return fset(DIMGL[(hash2((u * 3.2) | 0, (v * 3.2) | 0, sd ^ 0xD3) * DIMGL_N) | 0],
                  P.shadow, 16 + hash2((u * 3.2) | 0, (v * 3.2) | 0, sd ^ 0xC1) * 26);
    }

    if (!lit) {
      /* Dead: the glass is gone. One unlit bay in twenty, and it is the state that costs nothing —
       * a broken window is mostly a hole, so this SUBTRACTS coverage rather than adding it, which
       * is how a facade pays for the parapet and the pipework above. */
      if (hash2(wu, wv, sd ^ 0x1C3) < 0.07) {
        var dgl = hash2(Math.floor(u * 2.6), Math.floor(v * 2.6), sd ^ 0x1C4);
        return dgl < 0.24 ? fset(dgl < 0.12 ? G_SLASH : G_BSLASH, P.shadow, 30 + dgl * 60)
                          : fset(0, P.shadow, 0);
      }
      /* Unlit glass: dim but PRESENT often enough to keep the wall solid, black elsewhere. At
       * 30% coverage and lum 8-15 this was neither — the dark bays came out as holes, and half
       * of every facade read as scaffolding rather than as a slab of building. */
      /* 0.33, down from 0.44, and the coverage is not lost — it is MOVED. Everything this file
       * added above (the parapet course, the downpipes, the plant, the awnings, the streaks) is
       * structure that has a shape, and it is paid for by thinning the one tier that has none: a
       * per-bay salt of colons on dead glass. That salt was fitted at a rendered value of eighteen
       * and NO LONGER PRINTS THERE — with shadow's gain cut 2.60 -> 0.80 the lum 6-14 written below
       * prints v 2-13, and shadow's visibility threshold on the current table is lum 12, so most of
       * this tier is now below it. The tier is thinned, and the print has taken most of what was
       * left; both facts are load-bearing for the coverage argument above, which is why the second
       * one is stated instead of the old number being left standing. See the long note in the
       * structure tier for why the answer is not to multiply the lum back up. The wall keeps its
       * mass, because mass comes from the spandrel and the mullions, and the frame's black budget
       * comes back out at the far end. */
      /* AND THE SAME EXPIRY APPLIES HERE. The paragraph above is kept because its REASONING is
       * still correct — it is the arithmetic that has moved. It says the lum 6-14 written below
       * prints v 2-13 against a visibility threshold of lum 12, i.e. that most of this tier was
       * paid for and never seen, and that the answer was not to multiply it back up because the
       * muddy band had no room. The band now has 3.4 points of room, recovered by deleting three
       * branches that were painting 7.3% of the frame below the print floor.
       *
       * So it IS multiplied back up, to the value the old paragraph's own argument implies: lum
       * 15-31 prints v 16-26, over the floor by a margin rather than straddling it. Coverage 0.31
       * -> 0.38. The glyphs stay a colon and a quote: this tier is dead glass catching a little
       * skylight, and it must not acquire an edge, or it stops being glass and becomes a grid.
       *
       * MEASURED, 24-frame fixture, this change together with the spandrel one above — and the
       * headline number is much SMALLER than raising two coverage thresholds by eight points
       * suggests, because these two tiers are a modest share of facade cells and most of the
       * frame's remaining blank is not them:
       *   blank 47.9% -> 47.5%   muddy 26.6% -> 28.0% [target <30]   hot 4.19% -> 4.19%
       *   facade, in points of the whole frame:
       *     painted-but-INVISIBLE (v<9)  4.1 -> 3.2      visible mid (v 9-119)  10.2 -> 11.5
       * So what this bought is not coverage, it is VISIBILITY: about 1.3 points of the frame that
       * was already being painted and already being printed black is now over the floor, for 1.4
       * points of muddy. That is close to a one-for-one trade of invisible paint into visible
       * mass, which is the best rate available anywhere in this file.
       * The hot tail does not move AT ALL, which is the property that made this the right tier to
       * spend the headroom on: P.shadow saturates at v 60 and cannot reach the hot band however
       * hard it is driven. */
      return hash2(wu, wv, sd ^ 0x1B) < 0.38
        ? fset(hash2(wu, wv, sd ^ 0x2C) < 0.5 ? G_COLON : G_QUOTE,
               P.shadow, 15 + hash2(wu, wv, sd ^ 0x2C) * 16)
        : fset(0, P.shadow, 0);
    }

    /* A curtain hangs IN FRONT of the pane grid, so it replaces it rather than being drawn over
     * it: folds instead of mullions, and a soft vertical texture at about a hand's width. This is
     * why the state is worth having — a curtained bay and a plain one are different SHAPES up
     * close, not just different brightnesses. */
    if (curtain && lod === 2) {
      var cfd = u / 0.24; cfd -= Math.floor(cfd);
      return fset(cfd < 0.42 ? G_PCT : G_HASH, hue,
                  base * (0.76 + 0.36 * hash2(Math.floor(u * 4.1), bv, sd ^ 0x6C23)));
    }

    if (lod === 2) {
      /* Close up a bay is dozens of cells tall, so subdivide into panes; otherwise a near
       * window is one featureless flood of colour twenty rows high. */
      var gu = (fu - st.mu) / (1 - 2 * st.mu), gv = (fv - st.sill) / (st.head - st.sill);
      var pi = (gu * st.panes) | 0, pj = (gv * st.prow) | 0;
      var pfu = gu * st.panes - pi, pfv = gv * st.prow - pj;
      if (pfu < 0.11 || pfv < 0.13) return fset(pfu < 0.11 ? G_PIPE : G_DASH, hue, base * 0.50);
      /* Somebody at the window. A silhouette is an ABSENCE of light, so it is drawn as one —
       * which also makes it the one piece of detail in this file that gives coverage back. */
      if (occupied && pfv > 0.38 && pfu > 0.28 && pfu < 0.70) return fset(0, P.shadow, 0);
      var ph = hash2(bu * 7 + pi, bv * 5 + pj, sd ^ 0x77E1);
      if (ph < 0.15) return fset(G_COLON, hue, base * 0.20);   // blind drawn, desk light off
      base *= (0.80 + ph * 0.38) * grain(u, v, sd, lod);
    }

    return fset(FILL[(hash2(glu, bv, sd ^ 0x3) * FILL_N) | 0], hue, base);
  }

  /* Shopfront light colour, rolled off the LOT'S OWN DISTRICT hue rather than district-blind.
   * Sixteen slots read with a single index, because this is per-cell code and a chain of
   * thresholds here bought nothing but branches.
   *
   * P.ice is deliberately absent. It used to hold 10% of this roll, and core.js documents that
   * swatch as "holo, glass, rain highlight" — not a facade colour. Because this band is v < 8 m it
   * fills most of the near frame, so 10% of the roll became a PILLAR: measured at seed 11 frame
   * 800, ice took 48.3% of the frame's lit energy against azure's 25.6 and amber's 9.4, and 788 of
   * its 1231 cells were standing inside a SODIUM block. Ice belongs on rain and glazing highlights,
   * where it is a highlight.
   *
   * hueOf answers with the district's DOMINANT swatch, which for a concrete quarter is structure
   * (slate/white) and for the two accent quarters is an accent. Shopfront glow is LIGHT, so those
   * are folded onto whichever pillar they sit nearest — concrete takes either, ember leans sodium,
   * spring leans screen — with the quarter's own colour surviving as a minority tenant so the
   * district still reads as itself. Warm is two slots in every district: someone's counter lamp,
   * a garnish, never a third pillar. */
  var SHOP = (function () {
    var t = [], i;
    function fill(hue, list) { t[hue] = list; }
    var A = P.amber, Z = P.azure, W = P.warm;
    fill(A,        [A,A,A,A,A,A,A,A,A,A, Z,Z,Z,Z, W,W]);
    fill(Z,        [Z,Z,Z,Z,Z,Z,Z,Z,Z,Z, A,A,A,A, W,W]);
    fill(P.ember,  [P.ember,P.ember,P.ember,P.ember,P.ember, A,A,A,A,A,A,A, Z,Z, W,W]);
    fill(P.spring, [P.spring,P.spring,P.spring,P.spring,P.spring, Z,Z,Z,Z,Z,Z,Z, A,A, W,W]);
    var neutral =  [A,A,A,A,A,A,A, Z,Z,Z,Z,Z,Z,Z, W,W];
    /* Sixteen rows, not twelve, so the lookup can be indexed with `& 15` and is TOTAL: a cell
     * record carrying a hue this file has never heard of gets the neutral parade instead of an
     * exception, which is the same contract seedOf/styleOf/litOf keep. */
    for (i = 0; i < 16; i++) if (!t[i]) t[i] = neutral;
    return t;
  })();

  /* ---- STORE TYPES --------------------------------------------------------------------------
   * Every open unit used to be the same shop — fascia, awning, sign band, plinth, mullioned
   * glazing — with one district colour rolled over the top. Forty identical units in eight
   * colours is a texture, not a street, and this is the largest surface in the frame, so it is
   * the one place where "the same thing again" is most visible. A unit now rolls a TYPE once, off
   * its own hash, and the type decides at least four things: what the glazing draws, which end of
   * the district roll its light comes from, what its sign band looks like, and whether it has an
   * awning at all.
   *
   * THE BUDGET RULE FOR ALL OF THEM, and it is why none of these is a "dim shop": on core.js's
   * current curve a cell prints inside the muddy 9-119 band over most of the lum range that FEELS
   * like dim — amber does not clear v=119 until lum 103 (measured, see the tiers below). An
   * interior painted at half brightness is a grey veil across a third of the picture. So every
   * interior below is BRIGHT WHERE IT IS LIT AND BLACK WHERE IT IS NOT, and a type is made dim by
   * lighting LESS OF ITSELF, never by lighting all of itself less. The bar is the extreme case:
   * one lit shelf of bottles on a black field, and the black it hands back is what pays for the
   * convenience store two doors down having its whole window lit.
   *
   * WHAT THE EIGHT TYPES COST THE PRINT, with-vs-without over 12 frames (seeds 3001+137k for
   * k=0..5, frames 600 and 1800 at 213x67, rendered against an identical snapshot of every other
   * file in the tree so that a neighbouring agent's edit cannot land inside the measurement):
   *     muddy(9-119)  29.8% -> 27.0%     hot(v>=170)  4.55% -> 4.50%
   *     blank         36.4% -> 40.9%     black(v<9)   49.7% -> 54.0%
   * The muddy band comes DOWN by 2.8 points and that is where the whole feature is paid for: what
   * it replaced was a flood over the entire glazing band at lum 92-230 with a quarter of the cells
   * knocked to 0.40 of that, and on amber those knocked-down cells printed v 85-110 — dead centre
   * of the band core.js is trying to hold under 30% — across the largest surface in the picture.
   * The hot tail is unchanged, so the types are not bought out of the highlights either.
   *
   * The 4.5 points of extra blank are the honest cost: this band is emptier than it was, because
   * an interior that is black between its lit parts is black over more of itself than a flood is.
   * Both figures stay inside core.js's own bands (blank 40-55%, black 54-60%).
   *
   * THE FOUR ABSOLUTE NUMBERS ABOVE ARE THE STATE THE TYPES LANDED IN, NOT THE CURRENT ONE. The
   * trim that followed — the awning canvas, the three invisible slate tiers, the bulkhead cone —
   * moved the same 12-frame fixture to muddy 26.1%, hot 4.48%, blank 48.4%, black 54.6%. The
   * with-vs-without DELTAS are what this paragraph is about and they are unaffected: nothing the
   * trim touched is inside storeIn().
   *
   * NOTHING HERE PULSES. Not one of the eight has a time term — the barber's pole is a STATIC
   * helix on purpose, because a turning pole is a periodic luminance change on the nearest object
   * in the frame and this band is up against the camera. Flash rate of this file: 0 Hz. */

  /* Printed-value tiers. `lum` is not brightness and the two pillars are not on the same scale:
   * measured against core.js's live curve in the near depth bucket (lum swept 0..255, v taken as
   * max(r,g,b)*lum/255 exactly as tools/metrics.py does it), azure reaches v 150 at lum 79 where
   * amber needs 157 — a factor of two. Writing one lum for both is how a "lit shelf" comes out as
   * a hot azure slab in one district and a muddy amber smear in the next, which is precisely the
   * failure the colour census keeps catching. The interiors below are therefore written in TARGET
   * PRINTED VALUE and converted here:
   *   L_LOW  v~128  the dimmest thing allowed to exist — just clear of the muddy band's 119 top
   *   L_LIT  v~150  the working brightness of a lit interior
   *   L_HOT  v~175  the few cells per unit that may cross the hot line: signs, lamps, door jambs
   * There is deliberately NO tier below L_LOW. A cell that wants to be dimmer than v 128 is
   * written black instead; that is the whole discipline of this band.
   * slate and shadow are absent from every interior on purpose: their ceilings are v 114 and v 60,
   * so they CANNOT clear the muddy band at any lum, and the 255s in their slots are unreachable
   * placeholders that keep these three arrays indexable by palette index rather than sparse. */
  var L_LOW = [103,  52, 135, 133, 154, 165,  71, 255, 124, 110,  47, 255];
  var L_LIT = [157,  79, 206, 206, 239, 254, 109, 255, 190, 169,  72, 255];
  var L_HOT = [240, 120, 255, 255, 255, 255, 165, 255, 255, 255, 109, 255];

  var T_NOODLE = 0, T_CONV = 1, T_LAUNDRY = 2, T_BAR = 3,
      T_ARCADE = 4, T_HARD = 5, T_PHARM = 6, T_BARBER = 7;

  /* Frontage share, as cumulative thresholds on ONE draw. The noodle counter is the commonest
   * because it is the strongest read and the most genre-appropriate; the convenience store is
   * held down because it is the only type that lights its entire window and therefore the only
   * one whose share is also a brightness budget. */
  function typeOf(su, sd) {
    var r = hash2(su, 29, sd ^ 0x9F51);
    if (r < 0.21) return T_NOODLE;      // 21%
    if (r < 0.34) return T_CONV;        // 13%
    if (r < 0.46) return T_LAUNDRY;     // 12%
    if (r < 0.58) return T_BAR;         // 12%
    if (r < 0.68) return T_ARCADE;      // 10%
    if (r < 0.79) return T_HARD;        // 11%
    if (r < 0.90) return T_PHARM;       // 11%
    return T_BARBER;                    // 10%
  }

  /* Which way a type leans its light, and this is the constraint the whole feature is most
   * likely to break. The district roll (SHOP) already decides what colour a quarter's shopfronts
   * are, and it is what keeps an amber pocket reading as an amber pocket; a type must not overrule
   * it or eight biases sum into a shift in the pillars. So the lean never invents a colour — it
   * only pulls a fitting the district already handed out ONTO THE TYPE'S OWN PILLAR, and it leaves
   * the district's accent slots (ember, spring) alone entirely.
   *   +1 warm-lit (sodium, tungsten)   -1 cool-lit (fluorescent, screen)   0 takes the district */
  var T_LEAN = [1, -1, -1, 1, -1, 0, -1, 0];
  function lean(ty, lite, su, sd, sel) {
    var b = T_LEAN[ty];
    if (b === 0) return lite;
    var pil = b < 0 ? P.azure : P.amber;
    if (lite === pil) return lite;
    /* ONE draw decides this, and that is correct rather than a shared-hash bug: a fitting is
     * either the other pillar or warm, never both, so the two thresholds below are read in
     * mutually exclusive branches. `sel` separates the unit's main fitting from its second one so
     * that a shop does not convert both or neither.
     *   warm is pulled at 0.30. It is a garnish (11.7% of lit energy over the fixture below, against
     *     the 11.4% the census documents) and a fluorescent launderette or a sodium noodle counter
     *     is exactly a place a tungsten domestic lamp does not belong.
     *   the other PILLAR is pulled at 0.20, i.e. rarely, because that roll is the district talking
     *     and the district has to survive the type.
     * WHAT THE PAIR IS WORTH, with-vs-without over 12 frames (seeds 3001+137k for k=0..5, frames
     * 600 and 1800 at 213x67, every other file in the tree held identical): amber 46.6 -> 47.6 and
     * azure 30.8 -> 30.1 of lit energy, warm 11.7 -> 10.8. Both pillars inside the +-1.5 the
     * census allows, and the type lean is paid for out of the garnish rather than out of a pillar.
     * THE SENSITIVITY IS IN THE WARM PULL, not the pillar one: on a smaller fixture 0.00 -> 0.35
     * moved amber by five points. Re-measure on twelve frames or more before touching it. */
    var q = hash2(su, sel, sd ^ 0x9F63);
    if (lite === P.warm) return q < 0.30 ? pil : lite;
    if (lite === P.amber || lite === P.azure) return q < 0.20 ? pil : lite;
    return lite;
  }

  /* Awnings only where an awning belongs. Canvas over a food counter, a launderette or a parts
   * shop; never over a convenience store's lit window, an arcade or a clinic. The roll is raised
   * 0.40 -> 0.46 on the units that may have one; the awning branch in ground() carries the
   * arithmetic on what that does to the frequency along the parade, and why it is worth it. */
  var T_AWN = [1, 0, 1, 1, 0, 1, 0, 0];

  /* The sign band, per type: what share of the strip is lit and how long a lit block runs. This
   * is a thin strip and it stays one — the band is unchanged in height and position, only its
   * rhythm is type-specific. A menu board is a dense column of small marks; a convenience store
   * is one long unbroken bar; a bar's sign is a short word in the dark. */
  var SIGN_FILL  = [0.92, 0.98, 0.80, 0.56, 0.86, 0.92, 0.72, 0.68];
  var SIGN_PITCH = [0.30, 1.70, 0.64, 0.44, 0.34, 0.92, 0.52, 0.40];

  /* One open unit's interior, in the glazing band only. u is metres along the wall (WORLD, not
   * unit-local), v is metres up from the pavement, gTop is the underside of the sign band.
   * Returns the shared FOUT scratch like everything else in this file.
   *
   * KEYING. Every hash below resolves to a WORLD position, because a pattern keyed on anything
   * unit-local is the same pattern in every unit of that type and a pattern keyed on the screen
   * boils. Two forms are used and the difference matters:
   *   hash2((u * k) | 0, ...)      a feature on a global grid — the counter, the crates
   *   hash2(su * K + i, ...)       a feature on the UNIT's own grid, i running 0..K-1 across it
   * In the second form K must be at least the number of cells that fit across one unit, or unit
   * su+1 cell 0 collides with unit su cell K and the parade repeats at a fixed interval. Each K
   * below is written as ceil(2.55 / pitch) for exactly that reason. */
  function storeIn(ty, u, v, su, sd, lite, lite2, gTop) {
    var xm = u - su * 2.55;
    var h, a, b, i, j;
    switch (ty) {

    case T_NOODLE:
      /* The counter IS the shop: one hot horizontal at a metre with the light source on it, a row
       * of stool seats catching that light just under the lip, and the back of house lit as broken
       * panels above. Everything else is black — the void under a counter is the darkest thing at
       * street level and it is what makes the counter read as a counter rather than as a shelf. */
      if (v > 0.99 && v < 1.31) {
        h = hash2((u * 3) | 0, 0, sd ^ 0x9F71);
        return fset(h < 0.5 ? G_EQ : G_8, lite,
                    (v > 1.19 ? L_HOT[lite] : L_LIT[lite]) * (0.90 + h * 0.18));
      }
      if (v > 0.80 && v < 0.99) {                       // stool seats, one every 0.62 m, catching
        h = xm / 0.62; h -= Math.floor(h);              // the counter light from just under the lip
        return h < 0.34 ? fset(G_oo, lite, L_LOW[lite]) : fset(0, P.shadow, 0);
      }
      /* The counter's own front panel, lit by the strip under its lip. It is the one thing down
       * here that IS lit — the rest of the void stays black, which is what the stools sit in. */
      if (v > 0.66 && v < 0.80) {
        h = hash2((u * 2.2) | 0, 0, sd ^ 0x9F79);
        return h < 0.74 ? fset(G_UNDER, lite, L_LOW[lite]) : fset(0, P.shadow, 0);
      }
      if (v < 0.99) return fset(0, P.shadow, 0);        // the void under the counter
      if (v > 1.58 && v < 2.24) {                       // back of house, lit in broken panels
        h = hash2((u / 0.42) | 0, 0, sd ^ 0x9F83);
        if (h < 0.72) {
          a = h < 0.20 ? lite2 : lite;
          return fset(FILL[(h * 1.7 * FILL_N) | 0], a, L_LIT[a] * (0.88 + h * 0.20));
        }
        return fset(0, P.shadow, 0);
      }
      /* A hanging lamp over the counter every 1.27 m. A lamp is a small HOT cluster, not a lit
       * surface — the same rule the bulkhead lamp on a shut unit is drawn by. */
      if (v > 2.26 && v < 2.46) {
        h = xm / 1.27; h -= Math.floor(h);
        if (h > 0.36 && h < 0.60) return fset(G_0, P.warm, L_HOT[P.warm]);
      }
      return fset(0, P.shadow, 0);

    case T_CONV:
      /* The bright one, and the only type that lights its whole window. Even cool flood, a
       * shelving grid on it, and a doorway cut out of the middle — the doorway is what stops the
       * flood reading as one flat panel, because it puts a black vertical through the brightest
       * surface on the street. */
      if (xm > 1.62 && xm < 2.18) {
        if (xm < 1.72 || xm > 2.08) return fset(G_PIPE, lite, L_HOT[lite]);   // lit jambs
        if (v > gTop - 0.30) return fset(G_DASH, lite, L_HOT[lite]);          // lit head
        return fset(0, P.shadow, 0);                                          // the door, dark
      }
      h = v / 0.58; h -= Math.floor(h);
      if (h < 0.24) return fset(G_EQ, lite, L_HOT[lite]);   // shelf edge under the strip light
      h = hash2((u * 1.6) | 0, (v * 1.7) | 0, sd ^ 0x9F91);
      a = h < 0.22 ? lite2 : lite;
      /* L_HOT, not L_LIT, and this is the type that carries it: a convenience store's window is a
       * ceiling of fluorescent tube two metres from the glass and it is the brightest thing on the
       * street. It is also 13% of the frontage, which is what makes it affordable: the hot tail
       * over the 12-frame fixture lands at 4.50% with all eight types in against 4.55% without
       * them, so the types as a whole are hot-neutral and this is the type paying for the seven
       * that are darker than what they replaced. */
      return fset(FILL[(h * FILL_N) | 0], a, L_HOT[a] * (0.90 + h * 0.14));

    case T_LAUNDRY:
      /* A row of round machine doors. Circles in a line are the single most legible interior this
       * glyph set can draw — 'O' and 'o' at one height read as machines and as nothing else — so
       * this type spends everything it has on the doors and leaves the casings black. Two banks,
       * one at waist height and one stacked over it. */
      if (v > 0.72 && v < 1.98) {
        b = (v - 0.72) / 0.63; j = b | 0; b -= j;         // 0.63 m per bank
        a = xm / 0.52; i = su * 5 + (a | 0); a -= a | 0;  // one machine every 0.52 m, 5 per unit
        a -= 0.5; b -= 0.5;
        h = (a * a + b * b) * 4;                          // squared radius in cell units
        if (h < 0.52) {
          a = hash2(i, j, sd ^ 0x9FA3) < 0.24 ? lite2 : lite;
          return fset(h < 0.22 ? G_0 : G_O, a, h < 0.22 ? L_HOT[a] : L_LIT[a]);
        }
        if (h < 0.78) return fset(G_oo, lite, L_LOW[lite]);   // the door rim
        return fset(0, P.shadow, 0);                          // the casing
      }
      if (v > 2.08 && v < 2.30) return fset(G_DASH, lite, L_LIT[lite]);   // back-wall strip light
      return fset(0, P.shadow, 0);

    case T_BAR:
      /* Dim and warm, and it is the one shopfront on the street DARKER than the street outside
       * it. A lit row of bottles on the back shelf, the counter lip catching a little of that,
       * and nothing else at all. This is the type that gives coverage back to the black budget. */
      if (v > 1.52 && v < 1.74) {
        i = su * 17 + ((xm / 0.15) | 0);                  // bottles a hand's width apart, 17 per unit
        h = hash2(i, 0, sd ^ 0x9FB1);
        if (h < 0.62) {
          a = h < 0.18 ? lite2 : lite;
          return fset(h < 0.30 ? G_8 : G_PIPE, a, L_LIT[a] * (0.84 + h * 0.30));
        }
        return fset(0, P.shadow, 0);
      }
      if (v > 1.06 && v < 1.20) return fset(G_DASH, lite, L_LOW[lite]);   // the counter lip
      return fset(0, P.shadow, 0);

    case T_ARCADE:
      /* A wall of screens, and the only surface in this file that is allowed violet. A screen IS
       * a sign, which is the exception the house rule names ("a violet SURFACE turns the frame
       * into the cliche; a violet sign is fine"), and it is held to one tile in six so it stays a
       * garnish. MEASURED, and it is the one census line this feature does move by a visible
       * fraction: at one tile in six violet went 0.2% -> 0.7% of lit energy over the 12-frame
       * fixture, a quadrupling of a swatch that was very nearly absent.
       *
       * IT HAS COME DOWN, on the lever the author named — 0.17 -> 0.09, fewer violet screens and
       * not smaller ones. The reason is that this is the one place in the file where the swatch is
       * a SURFACE and not a strip, which is the distinction the house rule is entirely about, and
       * the arcade already has the strip: its sign band takes violet on its own draw a few dozen
       * lines below. A wall of screens that is one-in-eleven violet still reads as an arcade;
       * one-in-six was starting to read as the colour. */
      a = xm / 0.62; i = su * 5 + (a | 0); a -= a | 0;  // 0.62 m screens, 5 per unit
      b = v / 0.52;  j = b | 0; b -= j;
      if (a > 0.07 && b > 0.10) {
        h = hash2(i, j, sd ^ 0x9FD1);
        if (h > 0.90) return fset(0, P.shadow, 0);        // dead cabinet
        a = h < 0.09 ? P.violet : (h < 0.30 ? lite2 : lite);
        /* Separate draw for the glyph: welding the fill character to the colour roll would make
         * every violet screen the same character, which is how a pattern becomes a repeat. The
         * salt is a long way from 0x9FD1 above and not the next value along — adjacent salts are
         * measured correlated in this project up to -0.44, and these two read the SAME (i, j),
         * so a near salt is exactly the case where the second draw would not be a second draw. */
        b = hash2(i, j, sd ^ 0xA0E3);
        return fset(FILL[(b * FILL_N) | 0], a,
                    (b < 0.34 ? L_HOT[a] : L_LIT[a]) * (0.88 + b * 0.22));
      }
      return fset(0, P.shadow, 0);                        // the cabinet frames

    case T_HARD:
      /* Hanging goods on a rail, and crates stacked on the deck under them. This type reads by
       * its VERTICALS: everything else in this band is horizontal — counters, shelves, machine
       * banks — so a row of stock hanging at uneven lengths is the one silhouette here that
       * cannot be mistaken for any of the others. */
      if (v > 2.14 && v < 2.30) return fset(G_DASH, lite, L_LIT[lite]);   // the rail itself
      if (v > 1.30 && v < 2.14) {
        h = xm / 0.26; i = su * 10 + (h | 0); h -= h | 0; // 0.26 m hanger pitch, 10 per unit
        b = hash2(i, 0, sd ^ 0x9FE1);
        if (h < 0.58 && v > 1.84 - b * 0.54) {
          a = b < 0.20 ? lite2 : lite;
          return fset(b < 0.34 ? G_PIPE : G_V, a, L_LIT[a] * 0.94);
        }
        return fset(0, P.shadow, 0);
      }
      if (v < 1.24) {                                     // crates on the deck
        h = hash2((u / 0.44) | 0, (v / 0.31) | 0, sd ^ 0x9FE3);
        return h < 0.55 ? fset(G_HASH, lite, L_LOW[lite]) : fset(0, P.shadow, 0);
      }
      return fset(0, P.shadow, 0);

    case T_PHARM:
      /* Cool, quiet, and mostly empty — a clinic is lit evenly and has nothing in its window. The
       * cross does all the identifying. "Quiet" here is SPARSE and not DIM, per the budget rule
       * above: the interior is lit at full working brightness over a little under half its area
       * and black over the rest. The cross is P.white, whose ceiling is v 151 — under both pillars —
       * so the one white object on the street cannot glare. */
      a = xm - 1.27; if (a < 0) a = -a;
      b = v - (gTop - 0.90); if (b < 0) b = -b;
      if ((a < 0.15 && b < 0.52) || (b < 0.15 && a < 0.52))
        return fset(a < 0.15 && b < 0.15 ? G_8 : G_HASH, P.white, L_LIT[P.white]);
      /* A QUIET ZONE round the cross, and it is the whole difference between a cross and a
       * coincidence: drawn straight onto the lit field the arms were the same brightness as the
       * blocks either side of them and the shape disappeared — looked at, on the flat probe, and
       * it did not read at all. Two hands of black around it and it reads at a glance. */
      if (a < 0.72 && b < 0.72) return fset(0, P.shadow, 0);
      if (v > 0.70 && v < gTop - 0.20) {
        /* 0.45 m blocks rather than 0.9 m: at 0.9 m a "sparse" third of the field was three
         * blobs the size of the cross itself, which is what was drowning it. */
        h = hash2((u / 0.45) | 0, (v / 0.45) | 0, sd ^ 0x9FC1);
        if (h < 0.46) return fset(FILL[(h * 2.1 * FILL_N) | 0], lite, L_LIT[lite] * (0.94 + h * 0.16));
        return fset(0, P.shadow, 0);
      }
      return fset(0, P.shadow, 0);

    default:      /* T_BARBER */
      /* A pole and a pair of mirrors. The mirrors are the point: the two lit bands take the SAME
       * hash, so whatever is lit in the left one is lit in the right one at a fixed offset, and
       * the type reads as doubled cells — which no other type here does. The pole is a static
       * helix; see the no-pulse note at the top of this block for why it does not turn. */
      if (xm > 0.16 && xm < 0.38 && v > 1.10 && v < 2.05) {
        h = v * 2.9 + xm * 2.2; h -= Math.floor(h);
        /* Red is brake-lights-and-hazard by house rule, and this is the exception that proves it
         * is about AREA: half a 0.22 m stripe on a tenth of the units is 0.1% of the band, drawn
         * at L_LOW so it carries almost no energy either. */
        return h < 0.5 ? fset(G_8, P.white, L_LIT[P.white]) : fset(G_8, P.red, L_LOW[P.red]);
      }
      if (v > 0.86 && v < gTop - 0.24) {
        a = (xm > 0.58 && xm < 1.14) || (xm > 1.48 && xm < 2.04) ? 1 : 0;
        if (a) {
          h = hash2((v / 0.28) | 0, su, sd ^ 0x9FF1);
          if (h < 0.76) return fset(h < 0.28 ? G_8 : G_EQ, lite, L_LIT[lite] * (0.90 + h * 0.18));
        }
        return fset(0, P.shadow, 0);
      }
      return fset(0, P.shadow, 0);
    }
  }

  /* Street level: shutters, a canopy line, and the occasional open shopfront.
   * This band is banded HORIZONTALLY — plinth, glazing, sign, fascia — because the camera eye
   * is 1.7 m up and a near wall's ground floor can fill the whole screen edge. A single flood
   * of colour there swings the frame's entire colour balance; bands keep it reading as depth. */
  function ground(u, v, st, sd, cell, lod, t) {
    var su = Math.floor(u / 2.55), fs = u / 2.55 - Math.floor(u / 2.55);
    var r = hash2(su, 0, sd ^ 0x7E31);
    /* 0.52, up from 0.40. This band is the nearest and largest surface in the picture — at a 1.8 m
     * pavement the camera passes within two metres of it and one 2.55 m unit can be a third of the
     * frame's width — and three units in five being shuttered meant the thing directly beside the
     * viewer was, more often than not, nothing at all. The measured frame was 39.1% blank cells and
     * 30.1 points of that was facade; this band and the dead-bay tiers above it are where all of it
     * lives. Half and a bit open is also simply what a lit street looks like: a parade with more
     * shutters than shopfronts is a parade at four in the morning. */
    var open = r < SHOP_OPEN;
    /* The unit's own light colour, on its OWN hash. It cannot ride on `r`: `r` is what decides
     * whether the unit is open at all, so it only ever reaches 0.40 in here and any threshold
     * above that is dead code — which is exactly how "amber or warm" became "amber or warm or
     * nothing else, ever". This band is the nearest and brightest thing in frame and carries
     * around two-fifths of all facade energy, so whatever colour it is, the FRAME is: a parade
     * of sodium shopfronts on its own turns a two-pillar city into a yellow one. */
    var cr = hash2(su, 3, sd ^ 0x1D7);
    var roll = SHOP[hueOf(cell, sd) & 15];
    var lite = roll[(cr * 16) | 0];
    /* The unit's SECOND fitting, drawn from the same district roll on an unrelated hash. One unit
     * of frontage is 2.55 m, and the camera passes within two metres of a wall: at that range a
     * single unit is most of the screen, and a single `lite` roll was taking two thirds of the
     * frame's lit energy on its own — seed 0 and seed 555 both measured one swatch over 62% at
     * frame 2400. A shop is not lit by one tube. Giving the glazing a minority second colour
     * bounds what any one roll can own, at the scale where the eye reads it as depth into the
     * unit rather than as a change of subject. */
    var lite2 = roll[(hash2(su, 11, sd ^ 0x1D8) * 16) | 0];
    /* WHAT KIND OF SHOP. Rolled once per unit on its own hash and then applied to the glazing, the
     * sign band, the awning and the colour lean — a type that changed only the colour would be the
     * thing this band already had. See the STORE TYPES block above for the budget rule the eight
     * interiors are written to. Rolled for shut units as well, at the cost of one hash, because
     * that keeps `su` the only thing the type depends on: a unit does not change trade when the
     * open/shut roll is retuned, and SHOP_OPEN keeps meaning exactly what signage.js re-derives. */
    var ty = typeOf(su, sd);
    if (open) { lite = lean(ty, lite, su, sd, 31); lite2 = lean(ty, lite2, su, sd, 37); }

    /* PAINTED-AND-INVISIBLE, AND THAT IS NOT A CHEAP MISTAKE — see the census below the pilaster.
     * A shut unit's fascia was drawn on P.slate at lum 7. Slate does not clear the print's v=9
     * floor until lum 11 (measured against core.js's live curve, near bucket), so this was a
     * continuous course of nothing over half the frontage in the frame. It is black now, which is
     * what it always rendered as. */
    if (v > st.gnd - 0.42) {                       // canopy / fascia over the whole parade
      return open ? fset(G_EQ, lite, 58) : fset(0, P.shadow, 0);
    }
    /* Pilaster between units. Also black, and this is the biggest single line of the trim.
     *
     * MEASURED, 12 frames (seeds 3001+137k for k=0..5, frames 600 and 1800 at 213x67, every other
     * file in the tree held identical): this branch, the shut fascia above and the glazing mullion
     * below wrote 7.3% of EVERY CELL IN THE FRAME at lum 7-9 on P.slate, i.e. at a printed value of
     * 5-7, below the v=9 floor. Deleting all three moved blank 40.5% -> 47.8% and moved black(v<9),
     * muddy, hot and every swatch's share of lit energy by 0.1 point or less. The picture is
     * identical; the paint was not.
     *
     * THE FIX IS NOT TO RAISE THEM. A pilaster is 12% of the ground band's width running its full
     * height, and the ground band is the nearest and largest surface in the picture; lifting it to
     * a value slate can actually print puts a mid-tone stripe every 2.55 m across the whole near
     * frame, and slate's ceiling is v 114 — it CANNOT leave the muddy band at any lum. That is the
     * grey veil this renderer is written to avoid, bought from the one budget that is overdrawn.
     * Black reads as the division just as well, because what the eye reads is the lit interior
     * stopping.
     *
     * And an invisible cell is worse than a blank one here rather than merely equal to it:
     * optics.js's shafts skip any cell with `ch !== 0 && lum > 4` and its headlamp wash can only
     * ADD a mote where lum is 0, so lum-7 paint was a mask that blocked the very effects it was
     * supposedly leaving something for. */
    if (fs < 0.06 || fs > 0.94) return fset(0, P.shadow, 0);
    if (open) {
      /* AWNING. One unit in four has one, and it is the single most useful thing that can happen to
       * a ground floor: it breaks a band that is otherwise four stacked horizontals, it throws the
       * shopfront under it into shadow, and it hangs a scalloped valance at eye height.
       *
       * It is a DARK OBJECT WITH BRIGHT MARKS ON IT — black canvas, one lit rib per scallop, and a
       * lit fringe along the leading edge — which is the same shape every other dark thing in this
       * file is drawn as, and the reason is under the rib branch below. It used to be a 50/50
       * stripe of lit-and-slate covering the whole canvas, and that read as cross-hatching on a
       * wall rather than as cloth over a shop. */
      /* Gated on the type — see T_AWN: canvas over a food counter, a launderette, a bar or a
       * parts shop, never over a convenience store's lit window, an arcade or a clinic, all three
       * of which are types whose whole point is the glazing an awning would shade.
       * The rate goes 0.40 -> 0.46, which against the 55% of frontage whose type allows one is a
       * frequency of 0.25 along the parade, DOWN from the old flat 0.40. That is deliberate and it
       * is the one thing the types cost this band: an awning hangs from 1.65 m to 2.58 m, which is
       * exactly where a noodle bar's back of house and a hardware shop's hanging rail live, so at
       * the old frequency three units in five were a type you could not see. A quarter of the
       * parade keeps its awning and the overhang it puts into the band; the rest show what they
       * sell. */
      if (T_AWN[ty] && hash2(su, 21, sd ^ 0x8A1) < 0.46 &&
          v > st.gnd - 2.55 && v < st.gnd - 1.62) {
        var aw = (st.gnd - 1.62 - v) / 0.93;           // 0 at the fascia, 1 at the front edge
        if (aw > 0.86) {
          /* Valance: the scalloped fringe that hangs off the leading edge, and the one part of an
           * awning that is unambiguously an awning. Written in PRINTED VALUE like every other lit
           * tier in this band rather than as a flat lum: at the old 44-74 the same fringe printed
           * v 125-160 on azure and v 47-88 on warm, so a warm-lit unit's valance was inside the
           * muddy band and a cool one's was a highlight. L_LOW lands both at v 128-153. */
          var vg = u / 0.42; vg -= Math.floor(vg);
          return fset(vg < 0.5 ? G_V : G_UNDER, lite,
                      L_LOW[lite] * (1.00 + hash2(su, (u * 2.4) | 0, sd ^ 0x8A2) * 0.20));
        }
        /* THE CANVAS IS BLACK, WITH ONE LIT SEAM EVERY 0.55 m. It used to be a 50/50 stripe — the
         * lit half on the unit's own colour at lum 26-60, the other half on P.slate at lum 12-26 —
         * and that is the single densest mid-tone field this file produced. Counted on one near
         * block (seed 3412, frame 1800, cols 20-46 rows 26-41): 432 cells, of which 236 printed
         * inside the muddy 9-119 band and only 49 were blank. The slate half printed v 10-25, which
         * is visible-but-unreadable, and slate's ceiling is v 114 so no lum could have fixed it.
         * On screen the pair read as cross-hatching on a wall, not as canvas over a shop.
         *
         * Reduce AREA, keep the peak: a 26% duty seam at L_LOW and honest black between. The slope
         * is carried by the diagonal glyph and by the valance line under it, which is where it was
         * being read from anyway, and the shopfront the awning shades is still shaded because a
         * black return here is what occludes it. Measured over the 12-frame fixture: muddy 26.9%
         * -> 26.2% for the canvas alone, blank +0.8, hot unmoved.
         *
         * Brightest at the fascia and dimmest at the front edge, because an awning is lit from
         * underneath by the shop it belongs to and the back of it is nearest that light.
         *
         * The seam pitch is 0.42 m, which is the VALANCE's pitch and not the 0.55 the stripes used
         * to have. That is the whole read: a stripe now runs up from every scallop instead of
         * beating against them, so the fringe and the canvas are one object. Looked at on the
         * probe — at 0.55 against a 0.42 fringe the two rhythms drifted in and out of phase and
         * the canvas read as pinstripes that happened to end above a row of V's. */
        var ag = u / 0.42; ag -= Math.floor(ag);        // canvas seams, on the valance's own pitch
        if (ag < 0.30) return fset(G_SLASH, lite, L_LOW[lite] * (1.18 - aw * 0.20));
        return fset(0, P.shadow, 0);
      }

      /* Sign band under the fascia. Signage is the one place violet is allowed, and it is a
       * thin strip rather than a whole surface, which is how the references use it. It stays ONE
       * strip, in the same place and at the same height it always was; what the type changes is
       * its RHYTHM — SIGN_PITCH is how long a lit block runs and SIGN_FILL how much of the strip
       * is lit at all, so a menu board is a dense column of small marks, a convenience store is
       * one long unbroken bar, and a bar's sign is a short word in the dark.
       *
       * The lum is now L_HOT rather than a flat 176-255. That literal was chosen against amber,
       * where it prints v 156-178; on azure the same numbers print v 197-218, i.e. every azure
       * sign in the city was sitting a quarter of the way past the hot line while its amber
       * neighbour was under it. L_HOT lands both at v~175. */
      if (v > st.gnd - 1.55) {
        var sp = u / SIGN_PITCH[ty];
        var sg = hash2(sp | 0, su, sd ^ 0x515);
        if (sg > SIGN_FILL[ty]) return fset(0, P.shadow, 0);
        /* The accent sign used to be gated on `r`, which is the open/shut roll — so "this unit
         * has an accent sign" was welded to "this unit is one of the most-open units", the exact
         * shared-hash bug the file warns about twice above. Its own draw now.
         * The arcade is the one type that may put violet on its sign: a games parlour's sign is
         * the reference's own violet, and it is a strip. The clinic's is white, which is the
         * only swatch here that reads as clinical and cannot glare (ceiling v 151). */
        var sc = ty === T_ARCADE && sg < 0.20 ? P.violet
               : (ty === T_PHARM && sg < 0.05 ? P.white
               : (hash2(su, 47, sd ^ 0x517) < 0.10 ? accentOf(cell, sd) : lite));
        /* 1.00-1.14 of L_HOT, not 0.88-1.10. On the low half of that older range amber printed
         * v 168, i.e. UNDER the hot line, and the sign band is the largest genuinely bright thing
         * in the frame. Measured while tuning: with the band's amber half sitting a few points
         * under 170 the frame's hot tail fell by more than a point, i.e. out of core.js's 3.5-5
         * target on the LOW side, which is its own kind of miscalibration — a pillar has to be
         * able to reach the top of the lit range or nothing in the picture is a highlight. */
        return fset(FILL[((sg / SIGN_FILL[ty]) * FILL_N) | 0], sc, L_HOT[sc] * (1.00 + sg * 0.14));
      }
      if (v < 0.62)                                       // plinth, in its own shadow
        return hash2(su, Math.floor(v * 6), sd ^ 0x3) < 0.5 ? fset(G_UNDER, P.shadow, 14)
                                                            : fset(0, P.shadow, 0);
      /* Glazing. Mullion every 0.85 m first, and it is BLACK: it used to be P.slate at lum 9,
       * which its own comment correctly said prints v 5 — and then called that "a division the eye
       * reads as an edge ... [that] costs the print nothing". Half of that is right. It costs the
       * print nothing because it prints nothing, so the edge the eye was reading was the black
       * cell, not the glyph; writing the glyph only masked the shafts and the headlamp wash off it.
       * See the pilaster above for the census. Then the interior, which is the type's own. */
      var fm = u / 0.85; fm -= Math.floor(fm);
      if (fm < 0.10) return fset(0, P.shadow, 0);

      if (lod > 0) return storeIn(ty, u, v, su, sd, lite, lite2, st.gnd - 1.55);

      /* Beyond ~34 m a whole unit is a couple of columns wide and the type's features — bottles
       * at 0.15 m, machine doors at 0.52 m — are sub-cell. Drawing them there would sample one
       * arbitrary point of each and the parade would resolve into noise, so the far band keeps a
       * MASSED version instead: lit blocks at the working brightness, black between, at the
       * type's own coverage so a bar is still darker than a convenience store from across the
       * junction. Keyed on world position, so it is stable as the camera walks into it.
       *
       * This replaces the old far-field flood, which painted every cell at lum 92-230 with a
       * quarter of them knocked to 0.40 of that. Those knocked-down cells printed v 85-110 on
       * amber — dead centre of the muddy band — over the largest surface in the frame, and
       * deleting them is where this file's muddy budget comes from. */
      /* 0.30 + 0.38, not 0.86 + 0.14. The old pair claimed to give each type its own coverage "so
       * a bar is still darker than a convenience store from across the junction", and SIGN_FILL
       * runs 0.56-0.98, so what it actually produced was 0.94 to 0.99 — a five-point spread that no
       * eye can see, on a band that is 94-99% painted, which is the far-field flood the paragraph
       * above says was deleted. The comment was describing an intention, not the code. This pair
       * spans 0.51 to 0.67 and the bar-vs-convenience-store difference is real. Measured over the
       * 12-frame fixture the change is worth 0.0 points of muddy and +0.1 of blank — at 34 m+ the
       * ground band is usually behind something — so this is a correctness fix to the constant and
       * to the sentence above it, not a budget one. */
      var fcov = 0.30 + SIGN_FILL[ty] * 0.38;
      var fh = hash2(Math.floor(u * 1.1), Math.floor(v * 1.1), sd ^ 0x6C1);
      if (fh > fcov) return fset(0, P.shadow, 0);
      var fcol = hash2(Math.floor(u * 0.8), Math.floor(v * 1.3), sd ^ 0x6C3) < 0.30 ? lite2 : lite;
      return fset(FILL[((fh / fcov) * FILL_N) | 0], fcol, L_LIT[fcol] * (0.90 + fh * 0.20));
    }
    /* ---- SHUT ------------------------------------------------------------------------------
     * Everything from here down is a unit with its shutter down, and it is roughly half the
     * frontage the viewer walks past. It used to be four lines that returned black: 2% truly dead
     * and the rest a rib pattern drawn on P.shadow at lum 11-19, which on core.js's current table
     * prints v 0-10 — below the visibility floor, so in practice ALL of it was black. Half of the
     * biggest surface in the frame was not being drawn.
     *
     * THE FIX IS NOT TO PAINT THE SHUTTER GREY. A field of dim metal is bought from the muddy
     * 9-119 band, which is the one budget in this project that has repeatedly been overdrawn — it
     * stood at 32.1% against core.js's <30 target when this block was written and at 26.1% after
     * the trim below, and the headroom it now has was bought by DELETING dim tiers rather than by
     * finding room for another one. It would arrive as exactly the veil this whole renderer is
     * written to avoid. A shut shop is a DARK object, and it is drawn the way every other dark
     * object here is drawn — as a black mass with a few bright things ON it:
     *
     *   the lintel     one lit course where the shutter box meets the fascia, which is the only
     *                  continuous horizontal a shut unit has and the thing that says the frontage
     *                  is still there in the dark
     *   a tag          sprayed paint. Bright by nature (it is the one surface on the street with
     *                  fresh pigment on it under a sodium lamp) and iconic to the genre
     *   a stair light  a bulkhead lamp over the door beside the shop, burning all night. A LAMP and
     *                  not a lit surface: the cone it used to throw down the shutter was removed
     *                  because P.warm cannot clear v=119 below lum 104 and the cone topped out at
     *                  88 — see the branch itself
     *   a sliver       one unit in eight has the shutter a hand's width off the ground, with the
     *                  light of whatever is still open inside coming out under it
     *
     * That is a few dozen bright cells per unit against several hundred cells of honest black, so
     * it lands in the thin part of the histogram (upper 12.3%, hot 3.7% against a 3.5-5 target)
     * rather than the overdrawn part. */

    /* One draw per decision, additive salts. `r` is spent — it decided open/shut — so nothing
     * below may be rolled off it or the feature only ever appears on the shuttest units. */
    var sh1 = hash2(su, 41, sd ^ 0xA31), sh2 = hash2(su, 53, sd ^ 0xA32),
        sh3 = hash2(su, 67, sd ^ 0xA33), sh4 = hash2(su, 79, sd ^ 0xA35);

    /* The lintel. The shutter box is a hand's depth proud of the wall, so its underside catches
     * the light spilling along the parade and its front face does not — one lit row, not a band.
     *
     * IT TAKES THE DISTRICT'S OWN LIGHT, off the same SHOP roll the open units use, and that is a
     * census fix rather than a flourish. Drawn as flat P.amber — the argument being that this is a
     * metre under a sodium lamp, which is the argument the kerb makes and wins — it put a
     * continuous sodium line along every shut frontage in the city, and shut frontages are half of
     * them: measured over the six-frame fixture it moved amber from 50.0% of lit energy to 51.8%
     * and took azure down 28.6 -> 26.9. That is the longest new line in the picture landing
     * entirely on one pillar. The kerb can be amber because there is one kerb; this is on every
     * wall, so it has to obey the same district rule the wall does. */
    if (v > st.gnd - 0.72) return fset(G_DASH, roll[(sh4 * 16) | 0], 90 + sh1 * 44);

    /* The sliver. Not shut after all — the shutter is up a hand's width and the shop behind it is
     * still lit, which is the single most useful thing that can happen to a dead frontage: it puts
     * a bright horizontal at ankle height, i.e. down in the lower third where the frame is emptiest
     * and where nothing else is emissive. */
    if (sh2 < 0.11 && v < 0.34)
      return fset(v < 0.17 ? G_UNDER : G_EQ, lite, 128 + sh3 * 58);

    /* A bulkhead lamp over the door to the flats above. One unit in nine (0.68..0.79 of one draw —
     * the old comment said one in five and the code has never done that), and it is a LAMP: a small
     * hot cluster, and nothing else.
     *
     * THE CONE IT USED TO THROW IS GONE. It ran 1.5 m down the shutter at lum 24-88 on P.warm, and
     * warm does not clear the muddy band's v=119 top until lum 104 — its ceiling is v 167 at lum
     * 255 — so every cell of that wash printed v 28-100 and could not have been lifted out of the
     * band without going brighter than the lamp itself. It was the exact thing the block comment
     * above forbids: a dim mid-tone field on the nearest surface in the frame, on a swatch the
     * census already has drifting. Measured over the 12-frame fixture, removing it: muddy 26.9% ->
     * 26.8%, warm 10.8% -> 10.7% of lit energy, and nothing else moved. The lamp reads on its own,
     * because a lamp at this scale IS a couple of cells. */
    if (sh2 > 0.68 && sh2 < 0.79) {
      var dl = v - 2.28, du = fs - 0.80;
      if (du < 0) du = -du;
      if (du < 0.075 && dl > -0.16 && dl < 0.16) return fset(G_0, P.warm, 156 + sh3 * 40);
    }

    /* A tag. Rolled on the unit and then drawn on its own lattice so it is a MARK with edges and
     * not a stain: a couple of dense blocks of paint at shoulder height, in a colour nobody chose
     * for the building. Sprayed work sits where an arm reaches, which is also exactly the band the
     * eye is in — 1.1 to 2.1 m is the middle of the near wall. */
    if (sh1 < 0.34 && v > 1.05 && v < 2.15) {
      var tgu = (u - su * 2.55 - 0.28) / 1.75;
      if (tgu > 0 && tgu < 1) {
        var tg = hash2(Math.floor(tgu * 9), Math.floor((v - 1.05) * 6.4), sd ^ 0xA34);
        if (tg < 0.46) {
          /* The tag's colour is the DISTRICT ACCENT, which is the one swatch a building already
           * owns that is not its own light — so a tag reads as somebody else's mark on it rather
           * than as another window. */
          return fset(tg < 0.16 ? G_HASH : (tg < 0.31 ? G_PCT : G_SLASH),
                      accentOf(cell, sd), 116 + tg * 116);
        }
      }
    }

    /* And the shutter itself, which stays black. The ribs are kept at the very bottom of the
     * range and at a third of the coverage they had: they are not there to be seen, they are there
     * so that a shutter caught in a headlamp or a lightning stroke has something for the flash to
     * land on. Everything above is what the viewer actually reads. */
    var rib = Math.floor(v * 3.4);
    return (rib % 3) ? fset(0, P.shadow, 0)
      : fset(G_UNDER, P.shadow, 11 + hash2(su, rib, sd ^ 0xA9) * 8);
  }

  /* ---- street ---------------------------------------------------------------------------
   * wx/wz are world metres. The road pattern is wrapped onto the grid pitch so it still lands
   * correctly if nobody calls configure() with the real canyon position.
   *
   * THREE THINGS COME OUT OF HERE, not one, and the second is the important one.
   *   ch/col/lum  the tarmac itself, as before.
   *   mir         how much of whatever is standing ABOVE this cell the surface hands back. This
   *               file cannot see the sign it is reflecting — it has no camera and no frame — so
   *               it reports the water and raycast.js's reflect pass fetches the colour once the
   *               column above is painted. That division is the whole reason a puddle here can
   *               mirror a sign rather than inventing a plausible hue for one, which is what the
   *               old wet-strip code did and why a wet road never quite matched the wall over it.
   *   wch         the glyph to spend a reflection on when the cell is otherwise black. Chosen here
   *               because it must be keyed on WORLD position: picked screen-side it would re-roll
   *               every frame and the water would boil.
   *
   * The lower third of the frame is the largest single region in the composition, so everything
   * below is chosen for what it does to that region: the long markings (kerb arris, edge line,
   * rails, seams) are continuous because continuity is what carries perspective, and the field
   * detail (patches, plates, puddles) is BLOCKY because a road at this resolution reads as areas
   * of tone, never as speckle.
   */
  var ROUT = { ch: 0, col: 0, lum: 0, mir: 0, rip: 0, wch: 0 };
  /* Set once at the top of floorTex and read back out by every rset() below, so the twenty-odd
   * early returns in the cascade do not each have to carry the water with them. */
  var mirNow = 0, ripNow = 0, wchNow = 0, bounceNow = 0;
  function rset(ch, col, lum) {
    ROUT.ch = ch; ROUT.col = col;
    ROUT.lum = lum < 0 ? 0 : (lum > 255 ? 255 : lum | 0);
    ROUT.mir = mirNow > bounceNow ? mirNow : bounceNow;
    ROUT.rip = ripNow; ROUT.wch = wchNow;
    return ROUT;
  }

  /* Smeary, low-contrast glyphs. A reflection drawn in the blocky FILL set reads as a second wall
   * lying on the ground; these read as something lying ON water. */
  var WATER = [G_COLON, G_QUOTE, G_TILDE, G_SEMI, G_DQ, G_DASH, G_COMMA, G_TICK];
  var WATER_N = WATER.length;

  function floorTex(wx, wz, dist, t) {
    weatherAt(t === undefined ? 0 : t);
    var lane = wx - CFG.streetX;
    if (CFG.streetPeriod > 0) lane -= Math.round(lane / CFG.streetPeriod) * CFG.streetPeriod;
    var al = lane < 0 ? -lane : lane;
    var half = CFG.half;

    /* The floor is the worst aliaser in the frame: one row near the horizon covers tens of
     * metres of tarmac, so fine per-metre hashes there resolve into crawling static. Detail is
     * dropped by distance band and the surviving hashes are quantised coarser. Big features
     * (centreline, kerb, edge line, rails, crossings) are kept at every distance — they are what
     * carries the perspective, and they are lines rather than fields so they cannot alias. */
    var fl = dist < 22 ? 2 : (dist < 50 ? 1 : 0);

    /* ---- water ---------------------------------------------------------------------------
     * Two scales, doing two different jobs.
     *
     * The SHEET is the broad damp — metres across, slow — and it is what takes the carriageway
     * from matte to specular as the weather wets it. Under 'clear' rel('wet') is 0.13 and this
     * collapses to nothing; under 'downpour' it is 1.11 and the road is a mirror end to end.
     *
     * The PUDDLES are objects, not noise: standing water a metre or two across with an edge you
     * can see, placed on a world lattice so they hold still while you walk past them. They are
     * the point of the whole exercise — a puddle reflecting a sign is the defining image of the
     * genre, and noise cannot make one because noise has no edge to catch the light. */
    var sheet = vnoise(wx * 0.11 + 3.1, 91) * 0.72 + vnoise(wz * 0.05, 57) * 0.62
              - 0.42 + (wWet - 1) * 0.34;
    sheet = clamp(sheet, 0, 1) * clamp(wWet, 0, 1.15);

    /* 2.4 m across the road by 5.6 m along it, at most one puddle per lattice cell, and the centre
     * is INSET BY THE RADIUS so a puddle can never be clipped by its own cell boundary. A clipped
     * puddle shows a dead straight side and stops being water on sight; this is cheaper than
     * testing the neighbouring cells and the size it costs is size a puddle does not want. */
    var pi = Math.floor(lane / 2.4), pj = Math.floor(wz / 5.6);
    var pd = 0;
    /* Past 50 m a puddle is smaller than a cell, so it is not computed rather than not drawn. */
    if (fl > 0 && hash2(pi, pj, 0x9D1) < 0.26 + 0.40 * clamp(wWet, 0, 1.2)) {
      var pra = (0.30 + hash2(pi, pj, 0x9D4) * 0.60) * clamp(0.42 + wWet * 0.64, 0.22, 1.25);
      if (pra > 1.05) pra = 1.05;
      var prz = pra * (1.5 + hash2(pi, pj, 0x9D5) * 1.4);
      if (prz > 2.55) prz = 2.55;
      var pcx = pi * 2.4 + pra + (2.4 - 2 * pra) * hash2(pi, pj, 0x9D2);
      var pcz = pj * 5.6 + prz + (5.6 - 2 * prz) * hash2(pi, pj, 0x9D3);
      var dl = (lane - pcx) / pra, dpz = (wz - pcz) / prz;
      var rr2 = dl * dl + dpz * dpz;
      /* Squared falloff, so the middle is flat water and the last fifth of the radius is all the
       * gradient there is. That narrow ring is the meniscus, and it is what gets the glint. */
      if (rr2 < 1) pd = 1 - rr2 * rr2;
    }

    /* Wheel ruts. Tyres polish two strips of any carriageway and water stands in them, which is
     * why a wet road photographs as two bright bands and not as one even sheet. */
    var rc = half * 0.55, rut = al - rc; if (rut < 0) rut = -rut;
    rut = 1 - clamp(rut / 0.62, 0, 1);

    /* ---- the sodium pool --------------------------------------------------------------------
     * A street lamp is the first pillar of the whole palette and the road is the thing it points
     * at, so the tarmac under one is the brightest amber surface in the lower third. It is also
     * the only large-scale RHYTHM the carriageway has: a pool every thirteen metres, alternating
     * sides the way real columns do, is a metre rule laid down the canyon, and the eye reads
     * distance off it without being told to.
     *
     * It lives in the SURFACE rather than in an element because it is a property of the surface.
     * An element would have to paint over the road it is lighting, and the kerb and the markings
     * would still read as a street with no lamps on it. The lamp bodies belong to structure.js;
     * this is what they land on.
     *
     * Squared falloff and no edge — light does not have one. */
    var lampK = 0;
    if (fl > 0) {
      var lj = Math.floor(wz / 13.5);
      var lcl = (hash2(lj, 0, 0x1A3) < 0.5 ? 1 : -1) * (half - 0.55);
      var lcz = lj * 13.5 + 3.4 + hash2(lj, 1, 0x1A3) * 6.6;
      var dll = (lane - lcl) / 3.0, dlpz = (wz - lcz) / 4.1;
      lampK = 1 - (dll * dll + dlpz * dlpz);
      if (lampK < 0) lampK = 0; else lampK *= lampK;
    }

    mirNow = clamp(pd * 0.95 + sheet * (0.40 + rut * 0.26), 0, 1);
    /* The DRY BOUNCE, kept separate from the water because the two do different jobs and only one
     * of them should decide whether this cell draws a water glyph. Asphalt is not a mirror, but it
     * is not a hole either: a sign four metres over a dry road lays a smear of its own colour on
     * it, and on a clear night that smear is the only thing putting the street's own light back
     * onto the street. It goes out through ROUT.mir, and the reflect pass raises its source
     * threshold when the figure is this low — see raycast.js — so only something genuinely
     * emitting can spend it. That gate is the whole difference between this and the grey wash the
     * old wet-strip code produced. */
    bounceNow = 0.13;
    /* The mirror is broken up by ripples: a row offset the reflect pass adds before it samples.
     * Keyed on WORLD position so a puddle's surface holds still as you walk past it, and given a
     * travelling term only when there is rain to make one. Reduced motion freezes it outright —
     * a still puddle is a mirror, which is a perfectly good thing for it to be. */
    ripNow = 0;
    if (mirNow > 0.20) {                 // dry bounce has no surface to ripple, so it pays nothing
      ripNow = (hash2(Math.floor(wx * 2.7), Math.floor(wz * 1.9), 0x2E2) - 0.5)
             * (1.2 + 1.8 * clamp(wWind, 0, 1.4));
      if (!CC.reducedMotion && wRain > 0.05)
        ripNow += (vnoise(wz * 0.85 + t * 1.7, 0x2E3) - 0.5) * 2.4 * clamp(wRain, 0, 1.2);
    }
    wchNow = WATER[(hash2(Math.floor(wx * 2.3), Math.floor(wz * 1.1), 0x2E1) * WATER_N) | 0];

    /* ---- where the cross streets cut this one ---------------------------------------------
     * A junction is the only place a street's markings STOP, and stopping them is most of what
     * makes a junction read as one. Loaded by the caster; with none loaded the road runs on. */
    var xd = 1e9, xh = 0, xcv = 0, i, ad2;
    if (CFG.xn > 0) {
      /* The entries are evenly pitched to within city.js's own jitter, so the index of the nearest
       * is arithmetic and only its two neighbours need testing. Scanning all eight cost 0.15 ms a
       * frame at 400x100 for an answer that was never more than one slot away from the guess. */
      var xg = Math.round((wz - CFG.xz0) / CFG.xpitch);
      var xlo = xg - 1, xhi = xg + 1;
      if (xlo < 0) xlo = 0;
      if (xhi > CFG.xn - 1) xhi = CFG.xn - 1;
      for (i = xlo; i <= xhi; i++) {
        ad2 = wz - CFG.xc[i]; if (ad2 < 0) ad2 = -ad2;
        if (ad2 < xd) { xd = ad2; xh = CFG.xw[i]; xcv = CFG.xc[i]; }
      }
    }
    var inX = xd < xh;

    /* ---- paint -----------------------------------------------------------------------------
     * Paint sits on top of the road, so it is tested first, and none of it is ever dropped for
     * distance: these are the lines the perspective is read from. Wet paint is glossier than wet
     * tarmac, which is why none of these branches turns the mirror off. */
    if (CFG.xn > 0) {
      if (inX) {
        /* Box junction. Yellow crosshatch is the one piece of road paint that is unmistakably a
         * junction from any angle, and in perspective the two diagonal families converge to two
         * different points, which does more for the depth of the lower third than anything else
         * on the road. Rare on purpose — two in five junctions — and dim, because amber is
         * already the hottest swatch in the frame and this is a large area. */
        if (al < half + xh && hash2((xcv * 2) | 0, 0, 0x2C9) < 0.40) {
          var d1 = lane + wz, d2 = lane - wz;
          d1 -= Math.floor(d1 / 2.6) * 2.6; d2 -= Math.floor(d2 / 2.6) * 2.6;
          if (d1 < 0.14 || d2 < 0.14) {
            var hb = hash2(Math.floor(wx * 1.3), Math.floor(wz * 1.3), 0x2CA);
            if (hb > 0.20)                                       // worn through in patches
              return rset(d1 < 0.14 ? G_SLASH : G_BSLASH, P.amber, 30 + hb * 26);
          }
        }
      } else if (al < half) {
        var apr = xd - xh;                       // metres out from the junction mouth
        /* Zebra. The bars run ALONG the road, which is what a crossing looks like from a footpath
         * at either end of it, and at this resolution they are the single most legible object the
         * carriageway can carry: half a dozen hard verticals converging together.
         *
         * THE WEAR THRESHOLD IS A COVERAGE CONTROL, and it was moved at integration from 0.30 to
         * 0.52 after the near band was measured across the reference sweep. A crossing is close to
         * the camera by construction — you cannot see one from far enough away for it to be small —
         * so it lands in the biggest cells in the frame, and at 70% intact it was the largest
         * single contributor of white anywhere in the picture: 736 white cells in the bottom
         * twenty-two rows at seed 3, against 1220 for every other road marking put together, in a
         * band where white took 27-38% of the lit energy across the sweep. White is structure, not
         * light; a road at night is tarmac with paint ON it, and the frame was reading as paint
         * with tarmac between. At 48% worn it is 25-32% and slate — the tarmac itself — takes the
         * difference, because the worn branch below is not a discard, it is the road showing
         * through. Whole-frame black did not move (39.40% before and after at seed 3 frame 600):
         * this is a redistribution between swatches, not a cut in coverage, which is exactly what
         * it should be. Measure the near band before touching it again. */
        if (apr > 0.40 && apr < 2.60) {
          var zk = lane - Math.floor(lane / 1.30) * 1.30;
          if (zk < 0.52) {
            var zw = hash2(Math.floor(lane * 1.6), Math.floor(wz * 1.6), 0x2C4);
            if (zw > 0.52) return rset(zw < 0.72 ? G_HASH : G_8, P.white, 24 + zw * 20);
            return rset(G_DASH, P.slate, 14);                    // worn back to the tarmac
          }
        } else if (apr > 2.86 && apr < 3.04) {                   // stop line
          /* Thin, worn and dim. A stop line is 0.2 m of paint, but it lies almost FLAT to the
           * camera, so unlike a longitudinal line — which costs one column per row — it costs a
           * whole row of the near frame every time it appears. Eight junctions' worth of it was
           * 426 cells at seed 42 on its own, more than the centreline and both edge lines together.
           *
           * THE OTHER HALF OF THAT ARGUMENT IS DEAD: white was "the most expensive swatch in the
           * print at a gain of 1.15", and core.js's refit made it the CHEAPEST — gain 0.30, the
           * lowest entry in the table, ceiling 151, deliberately under both pillars because white
           * is structure and not light. So the lums below are no longer a discount against an
           * expensive swatch; they are just low. Measured: at 27-45 this line printed v 108-130
           * when it was fitted and prints v 25-63 today, and white does not clear v=9 at all until
           * lum 17. The surviving reason to keep it dim is the cell count above, which is a
           * coverage fact and does not care about the curve — so the code stands, but anyone
           * raising it is now buying legibility with white's share of lit energy (4.3% pooled over
           * the 32-frame fixture, against core.js's worst-frame ceiling of 32.4%) and not
           * spending an expensive swatch. Those are different trades and only one of them is
           * written down here. */
          var sw = hash2(Math.floor(lane * 1.7), 0, 0x2C5);
          if (sw < 0.22) return rset(0, P.shadow, 0);
          return rset(G_EQ, P.white, 27 + sw * 18);
        }
      }
    }

    /* Painted arrows — rare, one per ~26 m of road at most. */
    if (!inX) {
      var az = Math.floor(wz / 26);
      if (hash2(az, 0, 0xA55) < 0.40) {
        var z0 = az * 26 + hash2(az, 1, 0xA55) * 18;
        var dz = wz - z0, dlz = lane - (hash2(az, 2, 0xA55) - 0.5) * 3.0;
        if (dz >= 0 && dz < 3.2) {
          var adl = dlz < 0 ? -dlz : dlz;
          /* Thin strokes on purpose: real 0.5 m paint is several cells wide up close and turns
           * into a white slab that out-shouts the neon it is meant to sit under. */
          if (dz > 1.0 && adl < 0.15) return rset(G_PIPE, P.white, 84 + sheet * 34);
          var hw = dz * 0.85;
          if (dz <= 1.0 && adl - hw < 0.17 && hw - adl < 0.17)
            return rset(dlz < 0 ? G_SLASH : G_BSLASH, P.white, 84 + sheet * 34);
        }
      }

      /* Centreline: dashed, sodium-amber because that is the colour the street lamps paint it. */
      if (al < 0.13 && (wz - Math.floor(wz / 4.6) * 4.6) < 2.8)
        return rset(G_PIPE, P.amber, 150 + sheet * 60);

      /* Edge line. Solid, unbroken, and the reason it is here: it is the one white line that runs
       * the entire depth of the frame, so it converges to the vanishing point on its own and
       * gives the near road a floor to sit on. Worn in short stretches rather than dashed. */
      var el = half - 0.46, ael = al - el; if (ael < 0) ael = -ael;
      if (ael < 0.062) {
        var ew = hash2(Math.floor(wz * 0.55), 0, 0x2C7);
        if (ew > 0.16) return rset(G_PIPE, P.white, 26 + ew * 22 + mirNow * 22);
      }
    }

    /* Tram rails. Two continuous steel lines the length of the street, on the third of streets
     * that have a track. The head of a rail is polished by the wheels and is the one place on a
     * road that is genuinely specular, so it carries a white glint even dry — but only near,
     * where a glint is a glint and not a dotted line running to the horizon. */
    if (CFG.rail && !inX) {
      var rg = al - 0.62; if (rg < 0) rg = -rg;
      var rg2 = al - 2.06; if (rg2 < 0) rg2 = -rg2;
      if (rg < 0.055 || rg2 < 0.055) {
        var rh = hash2(Math.floor(wz * 1.4), 0, 0x5A12);
        if (fl === 2 && rh < 0.30)
          return rset(G_EQ, P.white, 40 + rh * 62 + mirNow * 34);
        return rset(G_PIPE, P.slate, 16 + rh * 22);
      }
    }

    /* ---- kerb and pavement ------------------------------------------------------------------
     * Neither exists inside a junction: there the cross street's carriageway runs edge to edge,
     * and a kerb ruled straight through it was the clearest tell that the road was a texture
     * rather than a place. */
    if (!inX && al > half && al < half + 0.34) {
      /* The kerb is the one continuous line the eye can follow from the camera all the way to the
       * vanishing point, so it is drawn as an EDGE and not as a texture: a lit top arris that
       * catches the sodium, and a face under it that does not. */
      var kw = hash2(Math.floor(wz * 3), 0, 0x3);
      if (al < half + 0.14)
        /* SODIUM, not white. A kerb is structure and white is the swatch for structure, but this
         * particular structure is a metre under a sodium lamp and nothing else in the frame is
         * lit so unambiguously by one source. Painting it white cost the floor a third of its
         * amber and handed it to a swatch that is supposed to be the quiet one; painting it amber
         * puts the longest continuous line in the lower third on the first pillar, which is where
         * a street lamp's light actually goes.
         *
         * Lum is set against the print, and THE REASON IT IS SET HIGH HAS REVERSED. The old
         * argument was that amber ran at gain 0.19 against white's 1.15, so an amber cell at lum
         * 200 and a white cell at lum 30 printed the same brightness — amber had to shout to be
         * heard next to the paint. On core.js's current table amber is 0.50 and white is 0.30, and
         * amber's pigment (max channel 232) is brighter than white's (236 — near enough equal), so
         * the compensation now runs the OTHER WAY: amber at lum 124 prints v 137 while white needs
         * lum 118 to reach v 113. Amber's knee is at lum 38, not 74, and it is over v=9 from lum 10
         * and over v=40 from lum 21, so "anything under about 120 reads as dark olive" is off by
         * more than a factor of two — the honest figure on this table is about lum 55, which prints
         * v 101.
         *
         * The lums below are therefore GENEROUS rather than forced, and they are kept because the
         * conclusion survives its old reason: this is the longest continuous line in the lower
         * third and it is the one thing in the frame lit unambiguously by a single sodium source,
         * so it should sit at the top of the first pillar's range. Measured over the 32-frame
         * fixture (seeds 3001+137k, k=0..15, frames 600/1800 at 400x100) the kerb's 5866 cells
         * print a mean v of 143 with 3.3% of them over the v=170 hot line, against a whole-frame
         * hot tail of 3.57% in core.js's 3.5-5 band — bright, in band, and not the frame's
         * brightest object. If amber's gain moves again, this number is the one to re-measure. */
        return rset(G_UNDER, P.amber, 124 + kw * 34 + lampK * 74 + mirNow * 30);
      return rset(G_EQ, P.slate, 10 + kw * 12);
    }

    if (!inX && al > half + 0.34) {                // pavement
      /* Standing water does not sit on a crowned pavement the way it sits in a gutter, and a
       * pavement is a metre out of the light a shopfront throws down its own frontage. */
      mirNow *= 0.35; bounceNow = 0.05;
      if (fl === 0) return rset(0, P.shadow, 0);
      /* Tactile paving at a crossing mouth — a hard field of dots, the one place a pavement has a
       * texture of its own rather than a grid of joints. */
      if (CFG.xn > 0 && xd > xh - 0.2 && xd < xh + 2.4 && al < half + 2.2) {
        var tp = hash2(Math.floor(wx * 3.4), Math.floor(wz * 3.4), 0x2D3);
        if (tp < 0.38) return rset(G_oo, P.slate, 15 + tp * 34);
        return rset(0, P.shadow, 0);
      }
      /* Cable and service ducts run parallel to the kerb under every real pavement, and their
       * covers are the long straight thing that keeps the slab grid from being the only order in
       * the picture. */
      if (fl === 2) {
        var du = al - (half + 1.05); if (du < 0) du = -du;
        if (du < 0.17) {
          var dj = wz - Math.floor(wz / 1.15) * 1.15;
          if (hash2(Math.floor(wz / 1.15), 0, 0x2D4) < 0.42)
            return rset(dj < 0.12 ? G_PIPE : (du < 0.08 ? G_EQ : G_DASH), P.slate,
                        dj < 0.12 ? 10 : 20 + hash2(Math.floor(wz * 2), 0, 0x2D5) * 18);
        }
      }
      /* Paving joints are the only perspective cue the pavement has, so they are drawn at a
       * value the eye can actually resolve. The per-cell dirt speckle that used to sit under
       * them is gone rather than raised: it was a fifth of every floor cell drawn at a rendered
       * value of eight, which is to say the frame paid for it and got black.
       *
       * They used to stop dead at 22 m, which is to say they stopped exactly where perspective
       * begins to do the work: everything from there to the horizon was a black band with no
       * scale in it at all. The grid now runs to 50 m on a doubled pitch, because past 22 m one
       * screen row covers more than a metre of slab and the 1.25 m grid aliases into a moire
       * that crawls as you walk. */
      var jp = fl === 2 ? 1.25 : 2.50, jw = fl === 2 ? 0.09 : 0.17;
      var jx = wx - Math.floor(wx / jp) * jp, jz = wz - Math.floor(wz / jp) * jp;
      if (jx < jw || jz < jw) return rset(G_COLON, P.slate, fl === 2 ? 15 : 11);
      /* The slabs BETWEEN the joints. A grid of joints on black is a wireframe, not a pavement —
       * it needs a surface to be the joints in. Quantised so it is stone and not per-cell salt,
       * and kept well under the joints' own value so the grid still leads. The far band gets a
       * thinner version of the same thing rather than nothing at all: from 22 m to the vanishing
       * point is most of the pavement's screen area and it was empty. */
      var ps = hash2(Math.floor(wx * (fl === 2 ? 1.6 : 0.8)),
                     Math.floor(wz * (fl === 2 ? 1.6 : 0.8)), 0x2F);
      if (ps < (fl === 2 ? 0.30 : 0.15))
        return rset(ps < 0.15 ? G_DOT : G_COMMA, P.slate, (fl === 2 ? 7 : 6) + ps * 20);
      return rset(0, P.shadow, 0);
    }

    /* ---- the carriageway --------------------------------------------------------------------
     * Everything from here down is tarmac, and the job is coverage with STRUCTURE: a road that is
     * 50% pure black in the near field is not a dark road, it is a missing one. */

    /* Gutter. Water runs to the kerb and stands there, so the last third of a metre before the
     * kerb is the wettest strip on the street whatever the weather is doing. */
    if (!inX && al > half - 0.34) {
      mirNow = clamp(mirNow + 0.20 + sheet * 0.45, 0, 1);
      var gt = hash2(Math.floor(wz * 2.4), 0, 0x2D8);
      if (gt < 0.15 + mirNow * 0.36)
        return rset(wchNow, gt < 0.09 ? P.azure : P.slate,
                    gt < 0.09 ? 48 + mirNow * 54 : 9 + mirNow * 30 + gt * 12);
    }

    /* Ironwork. Sub-cell past ~50 m, where drawing it would just salt the road with noise. */
    if (fl > 0) {
      /* Manhole covers, placed in LANE space so they can never end up under a building. */
      var mz = Math.floor(wz / 9);
      var dcl = lane - (hash2(mz, 0, 0x404) - 0.5) * 4.4;
      var dcz = wz - (mz * 9 + hash2(mz, 1, 0x404) * 7);
      var rr = dcl * dcl + dcz * dcz;
      if (hash2(mz, 2, 0x404) < 0.34 && rr < 0.42) {
        if (rr > 0.30) return rset(G_O, P.slate, 16);
        return rset(hash2(Math.floor(wx * 3), Math.floor(wz * 3), 0x9) < 0.5 ? G_COLON : G_DASH,
                    P.slate, 9 + sheet * 8);
      }
      /* Inspection plates: the rectangular ones, bolted down, with a raised rim. Round covers
       * alone gave the road one shape repeated; a road has a whole hardware catalogue in it. */
      var iz = Math.floor(wz / 7.3);
      if (hash2(iz, 3, 0x404) < 0.22) {
        var ipl = lane - (hash2(iz, 4, 0x404) - 0.5) * 4.0;
        var ipz = wz - (iz * 7.3 + hash2(iz, 5, 0x404) * 5.6);
        var aip = ipl < 0 ? -ipl : ipl;
        if (aip < 0.46 && ipz > 0 && ipz < 0.78) {
          if (aip > 0.38 || ipz < 0.07 || ipz > 0.71)             // rim
            return rset(aip > 0.38 ? G_PIPE : G_DASH, P.slate, 26);
          var bh = hash2(Math.floor(ipl * 7), Math.floor(ipz * 7), 0x405);
          return rset(bh < 0.22 ? G_PLUS : G_DOT, P.slate, 11 + bh * 16);
        }
      }
      /* Gutter grates, hard against the kerb where they belong. */
      if (!inX && al > half - 0.62 && al < half - 0.08) {
        var gz = Math.floor(wz / 2.6);
        if (hash2(gz, 0, 0x6A2) < 0.22 && (wz - gz * 2.6) < 1.5)
          return rset(G_HASH, P.slate, 12 + sheet * 10);
      }
    }

    /* Tar seams. A carriageway is not poured in one piece: it is a set of strips with a filled
     * joint between them, and the joint wanders. These are near-black and one cell wide, and they
     * are the cheapest coverage on the road — they cost almost no light and they give the near
     * tarmac a set of long lines running to the vanishing point, which is exactly the cue an
     * empty lower third is missing. */
    if (fl > 0) {
      var sq = Math.floor(lane / 1.35);
      if (hash2(sq, 1, 0x33B) < 0.44) {
        var sp = sq * 1.35 + 0.18 + hash2(sq, 0, 0x33B) * 0.98
               + (vnoise(wz * 0.21 + sq * 7.3, 0x3C) - 0.5) * 0.55;
        var asp = lane - sp; if (asp < 0) asp = -asp;
        if (asp < (fl === 2 ? 0.05 : 0.09))
          return rset(G_PIPE, P.slate, 8 + hash2(sq, Math.floor(wz * 0.7), 0x33C) * 12);
      }
    }

    /* Expansion joints across the carriageway — cheap, honest parallax as you walk, and the only
     * thing on the carriageway that runs ACROSS the view, so they are the road's answer to the
     * facades' belt courses. Drawn at a value that survives the crush near the camera — which is
     * why the mid-LOD tier is 16 and not the 9 it used to be: the crush moved under it. With slate
     * at gain 0.60 and KNEE at 0.075 a slate cell needs lum 11 to print v 9 at all, so 9 printed
     * v 6 and the joints stopped existing at exactly the distance the parallax is for, while the
     * tarmac they cross now prints v 14-35 (see the near-tarmac note below). At 16 both LODs print
     * v 21 and the line reads at both. */
    if (fl > 0 && (wz - Math.floor(wz / 4.0) * 4.0) < 0.10)
      return rset(G_DASH, P.slate, 16);

    /* The pool itself, on the tarmac. `lum` is chosen against the print curve rather than by eye,
     * and the curve it is chosen against has MOVED: this used to read "amber's gain is 0.19 with
     * its knee at 0.055, so an amber cell under lum 74 renders as black". core.js now runs amber
     * at 0.50 with KNEE 0.075, which puts amber's knee at lum 38 and its visibility floor at lum
     * 10. The black floor this branch was built to clear is therefore three times lower than the
     * comment claimed, and the lums below clear it by a wide margin: 112 prints v 132 and the top
     * of the range prints at amber's ceiling, v 179.
     *
     * FEWER CELLS, BRIGHTER survives the refit, but for the saturation half of the argument rather
     * than the knee half: amber still saturates slowly (v 105 at lum 60, v 137 at 124, v 164 at
     * 200), so the energy a pool carries barely changes when its dither thins while what the eye
     * can SEE of it changes completely. A dense pool at lum 80 is now v 116 rather than a large
     * area of nothing, so the trade is less forced than it was — it is kept because a sodium pool
     * under a lamp IS the brightest thing on a wet road, not because the alternative prints black.
     * Wet tarmac under a lamp is brighter again, hence the mirror term. */
    if (lampK > 0.05 && fl > 0) {
      var lh = hash2(Math.floor(wx * (fl === 2 ? 2.1 : 1.0)),
                     Math.floor(wz * (fl === 2 ? 2.1 : 1.0)), 0x1A5);
      if (lh < 0.24 + lampK * 0.40)
        return rset(lh < 0.5 ? G_DOT : G_COMMA, P.amber,
                    112 + lampK * 118 + lh * 26 + mirNow * 44);
    }

    /* ---- water on the tarmac ----------------------------------------------------------------
     * The meniscus first. A puddle's rim is the one genuinely specular line on a street: it is a
     * curved edge of water standing proud of the tarmac and it catches whatever is overhead at a
     * grazing angle. Ice is a GLINT and this is what a glint is for — a ring one cell wide round
     * an object a metre across, not a surface. */
    if (pd > 0.015 && pd < 0.30) {
      var mh2 = hash2(Math.floor(wx * 4.1), Math.floor(wz * 4.1), 0x2E5);
      if (mh2 < 0.38)
        return rset(mh2 < 0.09 ? G_QUOTE : wchNow, mh2 < 0.09 ? P.ice : P.white,
                    22 + pd * 90 + mh2 * 40);
    }

    /* And then the water itself. Its COLOUR is not decided here — see the header: raycast.js
     * fetches whatever is standing above the cell. What this branch owns is the sheen a wet road
     * has where there happens to be nothing overhead worth reflecting, which is most of it: dim,
     * cool, and dense enough that a wet street is never the darkest thing in the picture. */
    if (mirNow > 0.12) {
      var wg = hash2(Math.floor(wx * 3.1), Math.floor(wz * 1.3), 0x717);
      /* Water standing inside a sodium pool is sodium, so this branch has to come first. The
       * ORDER-OF-MAGNITUDE part of that instruction was arithmetic off the old table — amber 0.19
       * against slate 2.00, meeting on the print at about ten to one in lum — and core.js's refit
       * has closed that gap almost exactly: amber is 0.50 and slate 0.60, and with amber's brighter
       * pigment (232 against slate's 138) the two now meet at roughly ONE to one. Amber at lum 24
       * prints v 51 where slate at lum 24 prints v 40; the ten-to-one ratio no longer exists.
       *
       * The branch keeps its high lums anyway, and the reason is now physical rather than
       * compensatory: this is standing water inside a lamp's pool, it is the brightest thing on the
       * carriageway, and it should print like it (98-220 -> v 126-170). The failure the old comment
       * names — a lit puddle ending up darker than the tarmac round it — is no longer a print
       * artifact waiting to happen, so if a future edit wants this dimmer, it may go dimmer than
       * ten times the slate branch without inverting anything. */
      if (lampK > 0.16 && wg < 0.14 + mirNow * 0.44)
        return rset(wchNow, P.amber, 98 + lampK * 76 + mirNow * 46);
      if (wg < 0.13 + mirNow * 0.48)
        /* A minority of the sheen is AZURE, and it is not decoration: standing water at a grazing
         * angle takes its colour from the sky and from the screenlight coming off the walls, which
         * is the second pillar and the coldest thing in the frame.
         *
         * "48 up is where azure starts existing at all" WAS TRUE AND IS NOW FALSE BY A FACTOR OF
         * TEN. It was arithmetic off azure 0.34 against slate 2.00; core.js raised azure to 1.00 —
         * the highest gain in the table — and cut slate to 0.60, so azure clears v=9 at lum 5 and
         * v=40 at lum 11, and the 48-98 written below prints v 125-163 against the slate branch's
         * v 5-63. This branch is no longer a dim cool sheen sitting alongside the tarmac; it is a
         * pillar-bright one, and it is a third of a stop brighter than when it was fitted (v 84-109
         * on the old table).
         *
         * It is left alone on purpose and the purpose is measurable: core.js's ladder says the
         * pillars own the top of the lit range, azure holds 32.5% of lit energy over the 32-frame
         * fixture against amber's 46.4%, and the whole-frame hot tail is 3.57% inside its 3.5-5
         * band, so nothing here is out of calibration — the number is simply no longer a floor,
         * it is a choice. Anyone who wants the old dim sheen back writes about lum 12-16, not 48,
         * and should re-measure azure's share when they do. */
        return rset(wchNow, wg < 0.055 ? P.azure : P.slate,
                    wg < 0.055 ? 48 + mirNow * 50 : 8 + mirNow * 30 + wg * 14);
    }

    /* ---- asphalt ----------------------------------------------------------------------------
     * With the road's own repair history in it. A carriageway is a patchwork of different ages of
     * blacktop and the EDGES of those patches are what the eye reads; a single even tone over the
     * whole lower third is the thing that made it a void. Blocky on purpose — road repairs are
     * rectangles — and jittered on the lattice so the blocks are not a visible grid. */
    if (fl === 0) return rset(0, P.shadow, 0);

    var qi = Math.floor(lane / 2.6), qj = Math.floor(wz / 3.4);
    var patch = hash2(qi, qj, 0x7A9) < 0.30;
    if (patch && fl === 2) {
      /* The seam round a patch: fresh blacktop laid into a cut, so the cut shows. */
      var el2 = lane - qi * 2.6, ez = wz - qj * 3.4;
      if (el2 < 0.09 || ez < 0.09 || el2 > 2.51 || ez > 3.31)
        return rset(el2 < 0.09 || el2 > 2.51 ? G_PIPE : G_DASH, P.slate, 13);
    }

    /* Near tarmac. This is the single largest surface in the frame and it was printing 18% of its
     * cells at lum 5-7 — through P.slate's gain THEN, 2.00, that is a rendered value of about 42,
     * one notch over the threshold, on less than a fifth of the ground. The result was a piece
     * about walking down a street in which the street was the darkest thing in the picture.
     *
     * THE LUMS BELOW ARE RAISED, AND THE REASON IS THAT THE SENTENCE ABOVE STOPPED BEING TRUE.
     * core.js's refit cut slate 2.00 -> 0.60 to give the swatch its depth fade back (at 2.00 it
     * sat past the SHOULDER and printed 137 near against 137 far). That is right, and it is not
     * this file's to argue with — but it also means slate no longer clears v=9 until lum 11, and
     * this branch was still writing the numbers that were chosen when lum 6 printed 42. Measured
     * on the 32-frame fixture (seeds 3001+137k, k=0..15, frames 600 and 1800 at 400x100) BEFORE
     * the change: the mid-LOD tier's whole dither, lum 6.0-10.1, printed v 3-8 — every cell of it
     * under the visibility floor — and 25.5% of all painted slate floor cells printed v<9. The
     * branch was paying for coverage and returning nothing, which is the exact mistake the
     * spandrel tier documents and which the paragraph above says it fixed. It was a hole again.
     *
     * The fix is a lift, not a restoration: lum 13-22 here and 11-37 below print v 14-35 and v
     * 10-56, against the v 42-90 the same dither used to reach. Restoring the old PRINTED values
     * would need slate lums around 25-150, and that is not affordable — core.js holds the muddy
     * v=9-119 band at 27.9% against a <30 target and 99.7% of what its KNEE crushes is slate and
     * shadow, i.e. this texture, deliberately. So the road gets back over the visibility floor and
     * no further. MEASURED before -> after on the 32-frame fixture, this block and the expansion
     * joint above it together: painted slate floor cells printing v<9 25.5% -> 19.0% (the
     * remainder is the pavement slab and joint tiers, which were left alone), slate's mean printed
     * floor value 19.2 -> 21.8, muddy 27.9% -> 28.3%, hot 3.57% -> 3.57%, black(v<9) 57.2% ->
     * 56.9%, blank unmoved at 42.3%, lit energy unmoved at amber 46.4 / azure 32.5. It is still
     * the darkest LARGE surface, which is what it should be.
     *
     * NOT LIFTED, on purpose: the pavement slabs and joints next door (v 3-18) and the facades'
     * spandrel salt. They are not the largest surface in the frame, the muddy budget does not
     * stretch to the whole floor, and a swatch-wide correction belongs in EXPOSURE, not in forty
     * literals here. If slate's gain moves again, this block is the first thing to re-measure. */
    if (fl === 1) {
      var mh = hash2(Math.floor(wx * 0.9), Math.floor(wz * 0.9), 0x12);
      return mh < 0.23 ? rset(mh < 0.11 ? G_DOT : G_COMMA, P.slate, 13 + mh * 40)
                       : rset(0, P.shadow, 0);
    }
    var ah = hash2(Math.floor(wx * 2.2), Math.floor(wz * 2.2), 0x12);
    /* A patch is younger, blacker and smoother than the road round it, so it goes DOWN in
     * coverage and up in evenness. The ruts go the other way: polished, so they hold more light.
     * The patch tier keeps its lower value but not its old lum: at 7 + ah*20 with ah < 0.24 every
     * patch cell in the frame printed v 4-10, so the "younger, blacker" distinction was being
     * drawn entirely below the print's floor and read as a hole in the road. */
    var acov = patch ? 0.24 : 0.33 + rut * 0.12;
    return ah < acov ? rset(ah < 0.15 ? G_DOT : G_COMMA, P.slate,
                            (patch ? 11 : 13) + ah * (patch ? 26 : 40) + rut * 6)
                     : rset(0, P.shadow, 0);
  }

  /* ---- sky ------------------------------------------------------------------------------
   * sx/sy are screen cells. Pass a yaw-compensated column (e.g. x + yaw/fov*cols) if the camera
   * turns, otherwise the stars ride the view. Nearly all of this returns blank: the slot of sky
   * is the largest single reservoir of black in the frame. */
  var SOUT = { ch: 0, col: 0, lum: 0 };
  function sset(ch, col, lum) {
    SOUT.ch = ch; SOUT.col = col;
    SOUT.lum = lum < 0 ? 0 : (lum > 255 ? 255 : lum | 0);
    return SOUT;
  }

  /* THE ROOFLINE THIS COLUMN ACTUALLY HAS.
   * The glow used to be measured from the horizon alone, which is why it never appeared: at
   * 200x60 the open sky starts 19-21 rows above the horizon and at 400x100 it starts 31, so with
   * an 11-row e-fold every visible sky cell received 0.06-0.16 of the glow — arithmetically
   * present, invisible on screen. And an e-fold fixed in ROWS is not a length at all: doubling
   * the grid halves the lit fraction of the same picture.
   *
   * The raycaster paints a column's sky top-down from the silhouette, calling sky() with sy
   * strictly DECREASING and always finishing at row 0, so the first call of a new column is
   * exactly the one whose sy is not lower than the previous call's. That is the row immediately
   * under this column's rooftop, and it is the only extra fact the glow needs. Two integers of
   * module state, no allocation, no camera term, and if a caller ever violates the sweep order
   * the worst case is a glow anchored one row off. */
  var skyLastSy = 1e9, skyRoof = 0;

  function sky(sx, sy, t) {
    if (sy >= skyLastSy) skyRoof = sy + 1;
    skyLastSy = sy;

    /* Light pollution, not haze: the city lighting its own underside. Dithered rather than
     * washed, because a solid low-lum fill would read as the grey sky the references refuse
     * to have. Amber at the rooftop line, cooling to slate, gone by the top of the slot.
     *
     * This is what draws the ROOFLINE. A rooftop silhouette is not a thing the raycaster can
     * paint — it is the boundary between a lit sky and an unlit building, so if the sky slot is
     * black there is no silhouette at all, just black meeting black, and the skyline the whole
     * piece is built around disappears.
     *
     * Two anchors, and the brighter wins. The HORIZON term is the physical one: down the canyon's
     * vanishing point you are looking through the deepest column of lit air there is. The ROOFTOP
     * term is the one that draws the picture: every parapet in the frame is back-lit by the city
     * standing behind it, so the glow hugs whatever silhouette this column happens to have
     * instead of only the ones that stop near the horizon. Where a column is fully open the two
     * coincide exactly and the expression collapses to the physical one.
     *
     * The e-fold is a fraction of the GRID rather than a count of rows, so it is a length on the
     * picture and not on the buffer: a 100-row grid gets the same sky a 60-row grid does.
     *
     * It used to be a fraction of CFG.horizon, which was the same number back when the horizon was
     * always 0.56*rows. The camera pitches now — control.js slides cam.horizon over 0.26..0.86 of
     * the grid — so that expression stretched the light-pollution ramp by a factor of three and a
     * bit as you tilted, and the roofline glow visibly grew when you looked up at it. The horizon
     * still says WHERE the ramp starts; the grid says how long it is. */
    var e = CFG.rows * 0.185;
    if (e < 3) e = 3;
    var aboveH = CFG.horizon - sy; if (aboveH < 0) aboveH = 0;
    /* The star field's VERTICAL, which must be an elevation and not a screen row.
     *
     * The integration note at the top of this file tells the caller how to compensate for yaw and
     * says nothing about pitch, because pitch did not exist when it was written — so sy went
     * straight into the two hashes below and the stars ended up welded to the glass. Measured: at
     * 260x100, tilting the camera by 10 rows (a third of control.js's PITCH_MAX) left 8/8, 7/7,
     * 7/7 and 7/7 stars at seeds 3/7/42/99 on exactly the SAME screen cell. Look up and the city
     * slides past a starfield that is painted on the inside of the visor.
     *
     * cam.horizon is where the pitch actually lives — the caster slides it and projects everything
     * else against it — so (horizon - sy) is already invariant under pitch by construction, in the
     * same way aboveH above is. skyVScale then divides out the live vertical magnification, which
     * is the zoom half of the same problem. At the neutral camera it is 1.0 and this is exactly
     * the old sy up to a constant offset, so the shipped sky is unchanged.
     *
     * Math.floor, not |0: |0 truncates toward zero and would mirror the field about the horizon
     * row, printing a visibly duplicated line of stars right along the roofline. */
    var ey = Math.floor((CFG.horizon - sy) * CFG.skyVScale);
    var aboveR = skyRoof - sy;     if (aboveR < 0) aboveR = 0;
    var glow = Math.exp(-aboveR / e) * 0.94;
    var gh = Math.exp(-aboveH / e);
    if (gh > glow) glow = gh;

    /* 124, not 82, and the reason WAS the print's KNEE. That instruction — "if EXPOSURE[amber]
     * moves, re-measure the sky's lit fraction" — has now been honoured, because it did move, and
     * the arithmetic underneath this constant no longer says what it used to.
     *
     * THEN: amber at gain 0.19 with KNEE 0.055 did not clear the knee until lum 74, so a glow cell
     * written at 82 fell under it the moment `glow` dropped below about 0.9 and printed black
     * however carefully it was dithered. NOW: amber is 0.50 and KNEE is 0.075, which puts amber's
     * knee at lum 38 and its visibility floor at lum 10. At 124 the dimmest cell of the dither
     * (the 0.7 tail of the jitter) stays over the knee down to glow 0.44; at 82 it would still hold
     * to glow 0.66. So 82 would NOT print black now — the constant buys about a factor of 1.5 in
     * how far up the slot the glow survives, not the difference between a roofline and nothing.
     *
     * RE-MEASURED over the 32-frame fixture (seeds 3001+137k, k=0..15, frames 600 and 1800 at
     * 400x100; per column, take the six rows above the first non-sky cell from the top and count
     * kind-0 cells there, blank ones included, that print v>=40): 17.9%, against the 25-35% this
     * comment sets as the target. Every cell the dither actually PAINTS in that band clears v=40
     * comfortably — its lums run 60-152, i.e. v 105-147 — so the shortfall is DENSITY, not
     * brightness: the gate below paints glow*0.86 of the cells and the rest stay blank sky.
     * Raising 124 cannot fix that, and lowering it would not even show up in the census until it
     * fell under about 42 (below which the dimmest jitter of the dimmest of those six rows stops
     * clearing v=40 — amber reaches v 40 at lum 21). The number that moves this census is the
     * 0.86, and moving it spends black budget, so it is left to whoever owns the sky rather than
     * smuggled in under a comment repair. Either way, state the target honestly: it describes a
     * density this constant does not control. */
    if (glow > 0.02 && hash2(sx, ey, CFG.skySeed) < glow * 0.86) {
      var lum = 124 * glow * (0.7 + 0.6 * hash2(sx, ey, CFG.skySeed ^ 0x11));
      // The documented ramp is amber at the rooftop line cooling to slate, gone by the top of the
      // slot. It used to cool straight to P.shadow (40,50,66) — near-black — so the outer two
      // thirds of every sky slot printed as a dark dot on black and read as void, not as air.
      if (lum >= 4) return sset(glow > 0.32 ? G_DOT : G_TICK,
                                glow > 0.32 ? P.amber : (glow > 0.11 ? P.slate : P.shadow), lum);
    }

    /* Stars only well clear of the glow — nothing survives being seen through a city. Gated on
     * the glow itself rather than on a second row count, so the two can never drift apart:
     * exp(-0.64) is where the dither has thinned enough for a star to hold its own. */
    if (glow < 0.53) {
      var s = hash2(sx, ey, 0x1337);
      if (s < 0.0075) {
        /* Twinkle is motion, and motion is opt-out. Frozen it is still a star. */
        var tw = CC.reducedMotion ? 0.86
               : 0.55 + 0.45 * hash2(sx ^ Math.floor(t * 0.8), ey, 0x99);
        return sset(s < 0.0018 ? G_PLUS : G_DOT, s < 0.0035 ? P.ice : P.white,
                    (52 + s * 9000) * tw);
      }
    }
    return sset(0, P.shadow, 0);
  }

  /* ---- depth ----------------------------------------------------------------------------
   * Attenuation toward BLACK, never toward grey — there is no atmospheric scatter colour in
   * the references, distant buildings simply stop emitting. Multiplying lum keeps the hue and
   * lets brightness carry all of the depth cue.
   * Apply this exactly once per cell, in the world pass. */
  var FOG_START = 12.0, FOG_END = 125.0;
  /* The LIVE end of the ramp, which the weather moves. FOG_END stays the constant it always was
   * because three other files use it as "further away than the world goes" — sky.js parks the moon
   * past it, structure.js culls against it, core.js buckets its print curve on it — and none of
   * those wants to be re-based every time it drizzles. What the weather moves is how far you can
   * SEE, and that is this pair. */
  var fogEnd = FOG_END, fogSpan = FOG_END - FOG_START;
  function refog() {
    /* P.fog is 0.30 under the reference preset, so k is 0 for the look that shipped, +1 in a full
     * mist and about -0.31 on a clear night. Deliberately a gentle swing: the house rule is that
     * distance fades to BLACK, so a shorter ramp does not add haze, it removes street, and a mist
     * that ate forty metres of canyon would take the frame's black budget with it. */
    var k = (wFogP - 0.30) / 0.70;
    if (k > 1) k = 1; else if (k < -0.45) k = -0.45;
    fogEnd = FOG_END * (1 - 0.26 * k);
    fogSpan = fogEnd - FOG_START;
  }
  function fog(lum, dist) {
    if (!(dist === dist) || dist === Infinity) return lum;   // sky (Infinity) and NaN pass through
    if (dist <= FOG_START) return lum;
    if (dist >= fogEnd) return 0;
    var k = 1 - (dist - FOG_START) / fogSpan;
    k = k * Math.sqrt(k);                       // pow 1.5: gentle near, hard crush past ~55 m
    var v = lum * k;
    return v < 4 ? 0 : v | 0;                   // crush the tail so nothing settles into grey mush
  }

  /* Called once at the top of the world pass, before any per-cell call. It syncs the weather
   * cache and hands back how far marching is still worth doing — past this fog() can only return
   * 0. The caster must use the RETURNED value rather than FOG_END: on a clear night the ramp runs
   * ten metres further than the constant and the far end of the street would otherwise be cut off
   * at exactly the distance the air stopped hiding it. */
  function beginFrame(t) {
    weatherAt(t === undefined ? 0 : t);
    return fogEnd;
  }

  CC.Surf = {
    facade: facade, floorTex: floorTex, sky: sky, fog: fog,
    configure: configure, cfg: CFG, beginFrame: beginFrame,
    FOG_START: FOG_START, FOG_END: FOG_END,
    /* The share of ground-floor units that are open, published because signage.js's shopSpill has
     * to re-derive the SAME test to land its pool under a lit window rather than under a shutter —
     * it says so in its own comment and then hardcoded the number, so raising the rate here left
     * every spill in the city keyed to the old frontage. One constant, two readers. */
    SHOP_OPEN: SHOP_OPEN
  };
})(typeof CC !== 'undefined' ? CC : require('./core.js'));
/* Standalone `require()` of this file has no global CC, so re-resolve it rather than assuming
   the concatenated-build case. require() is cached, so this is the same object either way. */
if (typeof module !== 'undefined')
  module.exports = (typeof CC !== 'undefined' ? CC : require('./core.js')).Surf;
