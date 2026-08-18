/* CyberCity raycaster — voxel-space (heightmap) march at character resolution.
 *
 * One march per screen COLUMN, front to back, carrying a running silhouette row. Everything the
 * frame needs falls out of that single loop: occlusion, stepped rooftops, the slot of sky, and the
 * floor, which is nothing more special than terrain of height 0.
 *
 * Camera model is PLANAR, not cylindrical: dir = forward + right*s, left un-normalised, so the
 * march parameter `w` IS the perpendicular (forward-axis) distance and the vertical projection
 * needs no cosine fix-up. Straight building edges stay straight and the frame has no barrel bow.
 * Radial distance — what fog and the elements' depth test want — is w*|dir|, and |dir| is a
 * per-column constant.
 */
(function (CC) {
  'use strict';

  var P = CC.P, poke = CC.poke, hash2 = CC.hash2, vnoise = CC.vnoise;
  var G_COLON = CC.g(':'), G_DASH = CC.g('-');

  /* city.js can emit 58+46 for a landmark. The far-cutoff below must never UNDER-estimate this or
   * a tower is dropped from the skyline the instant a nearer roof lifts the silhouette. */
  var HMAX = 108;
  /* Hard ceiling per column so a degenerate ray can never stall a frame. Never reached in
   * practice: the silhouette cutoff (see the end of the march) ends the average column after ~45
   * cells and the worst measured column at 146, out of the ~220 a full 125 m march would take.
   * That cutoff, not a growing step, is what keeps the far march cheap — and it is exact. A
   * geometric step was tried first and was both SLOWER at 400x100 (5.7 ms vs 4.0) and lossy: it
   * strides over one-cell slivers of frontage and drops them out of the skyline. */
  var MAXSTEP = 512;

  /* ---- the record handed to CC.Surf.facade --------------------------------------------------
   * city.js stores `seed` as a 0..1 float and surfaces coerces it with `|0`, which would collapse
   * every building in the city onto seed 0 — one facade, repeated to the horizon. Widening it into
   * a scratch record here is cheaper than reaching into either file. Memoised on the record
   * pointer because a column march walks many cells of the same lot in a row.
   * `hue` is the district's dominant colour and is the ONLY thing that makes a sodium quarter
   * look different from a screen quarter. Dropping it here — which this record used to do —
   * silently reduces the whole district system to dead code, because surfaces.js can then do
   * nothing but re-roll a hue off the building seed and every district comes out identical. */
  /* `h` is the height of THIS COLUMN's cell, not of the lot, and it is set after bindCell rather
   * than inside it: city.js drops a lot's outer ring to a podium, so one record can front several
   * different heights and the memo would hand the podium the tower's parapet. surfaces.js needs it
   * to know where the wall stops — a parapet is the one piece of a facade that cannot be placed
   * from u and v alone, and without it a roofline is just where the windows happen to run out. */
  /* `faceX` and `side` are set after bindCell alongside `h`, and for the same reason: they are
   * properties of the HIT, not of the building, so the memo must not cache them. They say which of
   * the cell's four walls the ray crossed, which is dead weight in the city — its light comes from
   * the street and every face is lit the same — and is the entire lighting model of the frontier,
   * where a single low sun means one side of the road is amber and the other is a silhouette.
   * Two stores per wall hit, on a path that already does one. */
  var SC = { seed: 0, style: 0, litRate: 0.3, accent: 0, hue: undefined, h: 0, faceX: 1, side: 1 };
  var scRec = null;
  function bindCell(rec) {
    if (rec !== scRec) {
      scRec = rec;
      SC.seed = (rec.seed * 4294967296) | 0;
      SC.style = rec.style | 0;
      SC.litRate = rec.litRate;
      SC.accent = rec.accent;
      SC.hue = rec.hue;
    }
    return SC;
  }

  /* ---- signage ------------------------------------------------------------------------------
   * city.js hangs a sign box on some lots and nothing else reads it. It is the brightest thing in
   * the frame, so it stays small and rare — the whole box is at most 4 m across. */
  var SGO = { ch: 0, col: 0, lum: 0 };
  function sgset(ch, col, lum) { SGO.ch = ch; SGO.col = col; SGO.lum = lum; return SGO; }

  function signPixel(rec, u, v, faceX, t) {
    var s = rec.sign;
    /* Anchored to the LOT, never to the hit point: a u origin derived from the camera would send
     * the sign sliding along the wall as you walk. */
    var u0 = (faceX ? rec.lotZ : rec.lotX) + 0.7 + s.seed * 2.2;
    var du = u - u0, dv = v - s.y;
    if (du < 0 || dv < 0 || du > s.w || dv > s.h) return null;
    /* Dark reveal all the way round. Without it the sign fuses with the window grid behind it and
     * stops reading as an object hung off the building. */
    if (du < 0.22 || dv < 0.22 || s.w - du < 0.22 || s.h - dv < 0.22)
      return sgset(0, P.shadow, 0);
    if (s.vertical) {                                  // blade sign: stacked characters, gapped
      var seg = dv / 1.5; seg -= Math.floor(seg);
      if (seg > 0.72) return sgset(0, P.shadow, 0);
    }
    var sd = (s.seed * 4294967296) | 0;
    /* A slow whole-sign pulse plus tube-by-tube ageing, keyed on t and the sign's own seed alone.
     * Any camera term in here and the signage boils as you walk. On a painted board the same term
     * is the lamp under it guttering, which is the same 14% and reads correctly as either. */
    var pulse = CC.reducedMotion ? 0.93 : 0.86 + 0.14 * vnoise(t * 0.7 + s.seed * 40, 0x51);

    /* ---- a PAINTED BOARD, not a lit panel ---------------------------------------------------
     * city.js's frontier signs carry `board`, and they are the opposite object to a neon sign in
     * the one way that matters here: a neon sign IS the light, so filling its whole box with a lit
     * glyph is correct, and a board is a dark plank with a few letters painted on it. Filling a
     * 5x2 m board the neon way put a solid white rectangle the size of a shopfront in the middle
     * of the frame — measured at seed 42 it was the largest single object in the picture.
     *
     * So the box is mostly plank: a sparse slate grain at lum 16, which reads as timber and still
     * occludes the wall behind it. The LETTERING is a coarse lattice inside the middle band, about
     * 40% covered, and it is the only bright thing here. Two hashes on the same lattice, because
     * the letters and the grain must not be able to occupy the same cell. */
    if (s.board) {
      var lu = Math.floor(du * 2.9), lv = Math.floor(dv * 3.4);
      var ink = hash2(lu, lv, sd ^ 0x2C1D);
      if (dv > s.h * 0.24 && dv < s.h * 0.80 && ink < 0.46)
        return sgset(s.glyph, s.hue, (148 + ink * 220) * pulse);
      return hash2(lu, lv, sd ^ 0x5D33) < 0.34 ? sgset(G_DASH, P.slate, 16)
                                               : sgset(0, P.shadow, 0);
    }

    var h = hash2(Math.floor(du * 2.4), Math.floor(dv * 2.4), sd);
    return sgset(s.glyph, s.hue, (172 + h * 66) * (h < 0.10 ? 0.3 : 1) * pulse);
  }

  /* ---- the canyon the floor texture is drawn against ----------------------------------------
   * surfaces.js models one street, running along +z, with its centreline at a world x. The city
   * has two street directions and the walk uses both, so pick whichever one the camera is standing
   * in and, for a cross street, hand floorTex its coordinates transposed — otherwise the kerbs and
   * the centreline run across the view instead of away from it, and the road stops reading as a
   * road at all.
   * The kerb is also pulled CC.PAVE in off the building line: city.js has the facades abutting the
   * carriageway, and a kerb painted hard against a wall reads as a skirting board, not a street. */
  var swapFloor = 0;
  /* Latched across frames on purpose. A bare afx>afz comparison flips the ENTIRE floor texture
   * space in one 16 ms frame the moment the heading crosses 45 deg inside an intersection —
   * measured at +123% floor luminance and +18.9% of the whole frame on seed 1 frame 2176. The
   * margin below makes the flip wait until the heading has clearly committed, which is the middle
   * of the corner pan, where the whole image is already sliding ~2.4 columns per frame and the
   * change is masked. */
  var swapLatch = 0;
  /* The argument object for CC.Surf.configure(), hoisted and refilled in place. It used to be an
   * object literal built inside configureFor, which made it the last structural per-frame
   * allocation in the whole frame path — a V8 sampling heap profile over 900 frames at 260x100
   * put `render @ raycast.js` at 4.7 B/frame, and every other entry in that profile was either
   * unavoidable HeapNumber boxing on a double return or the city's lazy chunk cache. The shape is
   * fixed and known, so there is no reason to hand the collector a fresh one sixty times a second.
   * configure() copies these into CFG, so the scratch is never retained. */
  var CFGARG = { grid: 8.0, streetX: 4.0, streetPeriod: 0, half: 3.1,
                 horizon: 33.6, rows: 60, skyVScale: 1, skyK: 1, swap: 0 };
  /* One neutral-camera row, in the elevation units Surf.sky hashes on. cellAspect/2/tan(fov/2) at
   * the neutral fov 1.25 is what `scale` works out to per column, so dividing the live scale back
   * out gives 1.0 whenever the camera is at that fov and grows as it zooms in — which is what
   * makes the star field magnify under zoom instead of being re-dealt. */
  var SKY_NEUTRAL = 0.5625 / (2 * Math.tan(0.625));
  function configureFor(city, camx, camz, fwx, fwz, horizon, rows, scale, cols) {
    var cx = 4.0, hw = 3.1;
    swapFloor = 0;
    if (city && city.aveX) {
      var k = Math.round(camx / city.AVE), m = Math.round(camz / city.CROSS);
      var aC = 0, aW = 0, cC = 0, cW = 0, bA = 1e18, bC = 1e18, i, c, d;
      for (i = k - 1; i <= k + 1; i++) {
        c = city.aveX(i) + 0.5; d = camx - c; if (d < 0) d = -d;
        if (d < bA) { bA = d; aC = c; aW = city.aveW(i) + 0.5; }
      }
      for (i = m - 1; i <= m + 1; i++) {
        c = city.crossZ(i) + 0.5; d = camz - c; if (d < 0) d = -d;
        if (d < bC) { bC = d; cC = c; cW = city.crossW(i) + 0.5; }
      }
      /* Standing in an intersection both are true, so the tiebreak is which way we are looking. */
      var onAve = bA <= aW, onCross = bC <= cW;
      var afz = fwz < 0 ? -fwz : fwz, afx = fwx < 0 ? -fwx : fwx;
      var want;
      if (onCross && !onAve) want = 1;
      else if (!onCross) want = 0;
      else want = swapLatch ? (afz > afx * 1.35 ? 0 : 1)    // 1.35 either way = a dead band the
                            : (afx > afz * 1.35 ? 1 : 0);   // heading cannot chatter across
      swapLatch = want;
      if (want) { swapFloor = 1; cx = cC; hw = cW; }
      else { cx = aC; hw = aW; }
      /* city.js abuts the facades to the street cells, so the width it reports is measured to the
       * BUILDING LINE. The carriageway is that inset by a pavement on each side. The floor is what
       * keeps the meanest side street a street: at CC.PAVE 2.15 a 3.5 m half-width would leave
       * 1.35 m of tarmac, which is not a road, so those streets give the pavement back a little
       * rather than the road giving up. */
      hw = hw - CC.PAVE; if (hw < 1.7) hw = 1.7;
    }
    /* streetPeriod 0 disables the wrap: we know the real centreline, and a wrapped copy of the
     * road markings would surface on pavements and down alleys where there is no road. */
    CFGARG.grid = 8.0; CFGARG.streetX = cx; CFGARG.streetPeriod = 0; CFGARG.half = hw;
    CFGARG.swap = swapFloor;
    CFGARG.horizon = horizon; CFGARG.rows = rows;
    /* Surf.sky hashes its vertical on an ELEVATION, and only the caster knows the projection that
     * turns a screen row into one. A guard for the degenerate case: a caller that hands us a zero
     * or absent scale must not put a NaN into every sky cell in the frame. */
    CFGARG.skyVScale = (scale > 0 && cols > 0) ? (SKY_NEUTRAL * cols) / scale : 1;
    /* The horizontal counterpart, and the same deal: sky() is handed an index, and only the caster
     * knows how many of them there are to a radian. surf_west.js turns it back into a bearing so
     * the sunset stays in the west while the viewer turns round. Kept in step with skyK below by
     * being derived from the same expression. */
    CFGARG.skyK = cols > 0 ? cols / 1.25 : 1;
    CC.Surf.configure(CFGARG);
    loadCrossings(city, camx, camz);
  }

  /* ---- where the cross streets cut the one we are standing in --------------------------------
   * surfaces.js draws the junction — the crossing, the stop line, the box hatch, and the fact that
   * the kerb STOPS — and it has no city to ask where a junction is, so the world pass loads them.
   * They are handed over in the axis floorTex reads as wz, which is the transposed one when the
   * camera has committed to a cross street: get that wrong and every crossing in the frame is
   * painted down the road instead of across it.
   *
   * Written straight into the config's fixed-length arrays. Eight is comfortably more than the
   * ~125 m of visible street can hold at a 26 m pitch, and allocating a fresh list per frame in
   * the one function the whole world pass runs through is exactly the kind of garbage this
   * renderer is built to avoid. */
  function loadCrossings(city, camx, camz) {
    var cf = CC.Surf.cfg;
    if (!city || !city.aveX) { cf.xn = 0; return; }
    /* Along the street we are ON, the streets that CROSS it are the other family. */
    var along = swapFloor ? camx : camz;             // the coordinate floorTex sees as wz
    var pitch = swapFloor ? city.AVE : city.CROSS;
    var n = 0, i, k0 = Math.round(along / pitch);
    /* One behind, six ahead: the frame only shows what is in front, and a junction just behind the
     * camera still owns the kerb the camera is standing next to. */
    for (i = k0 - 1; i <= k0 + 6 && n < 8; i++) {
      cf.xc[n] = (swapFloor ? city.aveX(i) : city.crossZ(i)) + 0.5;
      /* The same inset and the same floor as configureFor above, and they have to be the same or
       * the junction mouth stops where the kerb does not: city.js abuts the facades to the
       * carriageway, so a mouth measured to the building line swallows both pavements. */
      var w = (swapFloor ? city.aveW(i) : city.crossW(i)) + 0.5 - CC.PAVE;
      cf.xw[n] = w < 1.7 ? 1.7 : w;
      if (n === 0) cf.xz0 = cf.xc[0];
      n++;
    }
    cf.xn = n;
    /* The pitch is published with them so floorTex can INDEX the nearest entry instead of scanning
     * all of them: it asks this question once per floor cell, which is twenty thousand times a
     * frame, and city.js's jitter is bounded well under half a block so the arithmetic guess is
     * never more than one slot out. */
    cf.xpitch = pitch;
  }

  /* ---- floor by inverse projection ----------------------------------------------------------
   * Every floor row gets its OWN distance. Painting a span of rows from one marched sample would
   * stretch metres of tarmac across rows that are tens of metres apart in world space. */
  function floorRow(frame, i, r, rowC, ox, oz, dx, dz, len, horizon, scale, eyeY, t) {
    var Surf = CC.Surf, den = rowC - horizon;
    /* The row the horizon line falls on looks at tarmac an unbounded distance away. Black, but a
     * large FINITE depth rather than Infinity — Infinity is reserved for sky, and an element that
     * depth-tests against it would punch through the road. */
    if (den < 1e-3) { poke(frame, i, 0, P.shadow, 0, 1e6, 2); mirA[r] = 0; return; }
    var w = eyeY * scale / den, d = w * len;
    var px = ox + dx * w, pz = oz + dz * w;
    var o = swapFloor ? Surf.floorTex(pz, px, d, t) : Surf.floorTex(px, pz, d, t);
    poke(frame, i, o.ch, o.col, Surf.fog(o.lum, d), d, 2);
    /* Parked for the reflect pass at the end of the column. It cannot run here: the wall this
     * cell is going to mirror has not been painted yet. */
    mirA[r] = o.mir; ripA[r] = o.rip; wchA[r] = o.wch;
  }

  /* ---- reflections ---------------------------------------------------------------------------
   * A puddle mirroring a sign is the defining image of this genre and it cannot be faked from
   * inside surfaces.js, which has no frame and no camera: the old wet-road code invented a
   * plausible hue per strip and the result never matched the wall standing over it. So the water
   * is decided there and the COLOUR is fetched here, once the column above is finished.
   *
   * THE MIRROR IS THE HORIZON ROW. A point at height h and forward distance D lands on row
   * `horizon - (h - eyeY)*scale/D`, and its reflection in the ground plane lands on
   * `horizon + (h + eyeY)*scale/D`. Those are not quite reflections of each other about the
   * horizon — the difference is 2*eyeY*scale/D, which is to say the cheap mirror shows the world
   * 3.4 m taller than it is. On a thirty-metre wall that is a tenth of its height and nothing the
   * eye can catch; in exchange the reflection is anchored exactly at the horizon, which is where
   * every reflection anyone has ever seen is anchored, and it follows cam.horizon so it stays
   * anchored when the camera pitches.
   *
   * Scratch is per COLUMN and lives for the length of one march, so the whole pass costs three
   * floats per row and no allocation after the first frame at a given size.
   */
  var mirA = new Float32Array(0), ripA = new Float32Array(0), wchA = new Uint8Array(0);
  function scratch(rows) {
    if (mirA.length === rows) return;
    mirA = new Float32Array(rows); ripA = new Float32Array(rows); wchA = new Uint8Array(rows);
  }

  function reflectColumn(frame, x, cols, rows, horizon) {
    var Surf = CC.Surf;
    var r0 = horizon < 0 ? 0 : (horizon | 0);
    for (var r = r0; r < rows; r++) {
      var m = mirA[r];
      if (m < 0.06) continue;
      var i = r * cols + x;
      if (frame.kind[i] !== 2) continue;         // something took the cell after the floor did
      var sr = Math.floor(2 * horizon - r - 0.5 + ripA[r]);
      if (sr < 0 || sr >= r) continue;           // above the frame, or not actually above the cell
      var j = sr * cols + x;
      var sl = frame.lum[j];
      /* YOU SEE REFLECTIONS OF LIGHTS, not of dim structure, and this threshold is the whole
       * difference between a wet street and a grey one. The world pass carries tens of thousands
       * of cells of spandrel and mullion at lum 8-40.
       *
       * THE INVERSION THAT ORIGINALLY JUSTIFIED THE THRESHOLD IS GONE, and saying so is the point
       * of this paragraph. It used to read: core.js prints slate at 2.00 and white at 1.15, so a
       * reflection of a dead concrete panel at lum 30 comes back out of the print BRIGHTER than the
       * amber kerb it is lying next to — which was true (slate lum 30 printed v 80 against the
       * kerb's v 96-126, and white lum 30 printed v 112, over the kerb). On the current table slate
       * is 0.60, white is 0.30 and amber is 0.50: slate at lum 30 prints v 51, white v 31, and the
       * kerb prints v 137-179. Nothing dim outranks anything lit any more; the print stopped doing
       * this file's argument for it.
       *
       * The threshold stays, because the OTHER half was never about the curve. Reflecting
       * everything turned the road into a pale grey mirror of the building's own shadows — measured
       * at 44% of the floor's lit energy in white, which is a COVERAGE fact: there are simply more
       * dim structural cells above a puddle than lit ones, whatever they print at. Reflecting only
       * what is actually emitting turns it into a black road with the signage lying in it, which is
       * the picture. The numbers 55 and 118 are now conservative rather than forced, and lowering
       * them is a legitimate experiment that has to be measured on white's share of the floor.
       *
       * Two figures, because there are two mechanisms here. Standing water is a mirror and will
       * show anything lit. Dry tarmac — mir sitting at its 0.13 bounce floor — only shows a source
       * bright enough to LIGHT it, which is a sign or a lit window and nothing else.
       *
       * A dark wall over water leaves the water dark. That is not a gap, it is the answer. */
      if (sl < (m > 0.22 ? 55 : 118) || frame.ch[j] === 0) continue;
      /* A reflection is a fraction of its source and it is attenuated by the distance to the
       * WATER, not to the wall: the puddle is the thing being looked at. Both terms already
       * carry their own fog, which is why this reads as depth rather than as a decal.
       *
       * THE FRACTION IS LARGE, and THE PRINT-CURVE HALF OF THAT ARGUMENT NO LONGER HOLDS. It read:
       * core.js prints amber through a gain of 0.19 with a knee at 0.055, so an amber cell does not
       * clear the knee until lum 74, and a reflection at a quarter of its source renders a sign at
       * 200 as lum 50, which prints BLACK. Every number in that sentence has moved — amber is at
       * gain 0.50 and KNEE is 0.075, so amber's knee is at lum 38 and it is over the visibility
       * floor from lum 10. The worked example now comes out the other way round: a sign at 200
       * reflected at a quarter is lum 50, and lum 50 prints v 98, which is not black but a legible
       * reflection. The refit did not just brighten the sums, it removed the failure mode this
       * fraction was sized to dodge.
       *
       * The fraction is kept at 0.30-0.90 anyway, on the physics alone, which is what the old
       * comment listed second: water at the grazing angle a street is seen at reflects most of what
       * hits it. Note what that means for anyone tuning it — the floor is now taste and geometry,
       * not a cliff. A quarter would no longer give a dry road; it would give a dimmer wet one. */
      var add = Surf.fog(sl * (0.30 + 0.60 * m), frame.dist[i]);
      if (add < 5) continue;
      var own = frame.lum[i];
      if (add > own) {
        /* Water takes its colour from what is above it — that is the whole point, and it is why
         * this branch overwrites the swatch instead of blending toward it. Blending two palette
         * indices is not a thing this renderer can do; picking the brighter of the two sources is. */
        /* The glyph for a cell the floor left black comes from surfaces.js, because it has to be
         * keyed on WORLD position: chosen here, off the column and the row, it would re-roll every
         * frame and the water would boil while the puddle stood still. G_COLON is only the
         * belt-and-braces answer for a floor row that never ran floorTex at all. */
        var ch = frame.ch[i];
        if (ch === 0) ch = wchA[r] || G_COLON;
        poke(frame, i, ch, frame.col[j], add + own * 0.3 > 255 ? 255 : add + own * 0.3,
             frame.dist[i], 2);
      } else if (frame.ch[i] !== 0) {
        /* Damp tarmac that is already carrying its own tone just gets a little of the glow. */
        poke(frame, i, frame.ch[i], frame.col[i], own + add * 0.45, frame.dist[i], 2);
      }
    }
  }

  /* ---- the pass ------------------------------------------------------------------------------ */
  function render(frame, cam, city) {
    var Surf = CC.Surf;
    if (!Surf) throw new Error('CC.Cast needs surfaces.js loaded first');

    var cols = frame.cols, rows = frame.rows;
    /* Grid size is never assumed: horizon and fov arrive on the camera, everything else is
     * derived from cols/rows. */
    var horizon = cam.horizon !== undefined ? cam.horizon : rows * 0.56;
    var fov     = cam.fov     || 1.25;
    var eyeY    = cam.eyeY    !== undefined ? cam.eyeY    : 1.7;
    var halfPlane = Math.tan(fov * 0.5);
    /* fov and scale over-specify the camera. A character cell is about half as wide as it is
     * tall, so the moment the horizontal fov is fixed, the vertical rows-per-metre that keeps a
     * square metre square on screen is fixed with it — one free parameter, not two. The harness's
     * rows*0.9 corresponds to a 92 degree fov at 200x60 and 102 at 400x100, so honouring it
     * literally flattens the canyon further the wider the grid gets, and the height of the walls
     * is the entire subject. fov wins; the vertical scale is reconciled to it. cam.scaleY is the
     * escape hatch for a caller that really does want a different vertical zoom. */
    var cellA = cam.cellAspect || 0.5625;             // 9x16 cell, as tools/topng.py draws
    var scale = cam.scaleY !== undefined ? cam.scaleY : (cols * cellA) / (2 * halfPlane);
    var t = cam.t || 0;
    var ox = cam.x, oz = cam.z, yaw = cam.yaw || 0;

    var fwx = Math.sin(yaw), fwz = Math.cos(yaw);      // yaw 0 faces +z, as city.camera assumes
    var rgx = Math.cos(yaw), rgz = -Math.sin(yaw);
    /* Past the end of the fog ramp fog() returns 0, so marching further is work that can only
     * produce black — and the weather MOVES that end, so it is asked for rather than assumed.
     * beginFrame also syncs surfaces.js's once-per-frame weather cache, which every per-cell call
     * below reads, so it has to happen before the first of them. */
    var FAR = Surf.beginFrame ? Surf.beginFrame(t) : Surf.FOG_END;

    scratch(rows);
    configureFor(city, ox, oz, fwx, fwz, horizon, rows, scale, cols);
    /* Stars are fixed to the world, not to the view; without this they ride the camera round.
     *
     * What Surf.sky is keyed on has to be an ANGLE, and the old `skyOff = (yaw/fov)*cols` added to
     * a raw column index was not one. It is the bearing measured in units of "one column at the
     * CURRENT fov", so the unit itself changed the moment the wheel was touched: zooming did not
     * magnify the star field, it re-dealt it. One 0.045 notch off control.js's zoom re-rolled
     * 291 of 298 lit sky cells at seed 3 with the camera not having moved a millimetre, and
     * skyOff alone slid 12 columns per notch near yaw +-pi/2.
     *
     * So the index is the column's true world BEARING, yaw + atan(sp), on a quantisation pinned to
     * the neutral fov rather than the live one. A first attempt at this used the linear bearing
     * yaw + fov*(x/cols - 0.5), and it was still wrong for the same reason in miniature: the
     * linear form is exact only at the frame edges, and its error in the middle scales with fov,
     * which walked the field about three columns across control.js's 1.02..1.52 range. atan is the
     * exact inverse of the sp the ray was built from, so it removes the dependence outright rather
     * than shrinking it. It costs one atan per COLUMN — not per cell — which is 260 a frame.
     *
     * Math.floor rather than |0 because |0 truncates toward zero, which maps -0.5 and +0.5 onto
     * the same index and prints one duplicated column of sky wherever the bearing crosses zero —
     * and with the bearing now centred on the view axis, that crossing is on screen. */
    var skyK = cols / 1.25;                      // index units per radian; one column at fov 1.25

    for (var x = 0; x < cols; x++) {
      var sp = (2 * (x + 0.5) / cols - 1) * halfPlane;
      /* This column's world bearing, quantised for Surf.sky. Hoisted out of the sky loop below
       * because it is a property of the column, not of the row. */
      var skyX = Math.floor((yaw + Math.atan(sp)) * skyK);
      var dx = fwx + rgx * sp, dz = fwz + rgz * sp;
      var len = Math.sqrt(1 + sp * sp);                // w * len == radial distance
      var wFar = FAR / len;

      var cx = Math.floor(ox), cz = Math.floor(oz);
      var sX = dx > 0 ? 1 : -1, sZ = dz > 0 ? 1 : -1;
      var adx = dx === 0 ? 1e30 : Math.abs(1 / dx), adz = dz === 0 ? 1e30 : Math.abs(1 / dz);
      var mX = (dx > 0 ? (cx + 1 - ox) : (ox - cx)) * adx;
      var mZ = (dz > 0 ? (cz + 1 - oz) : (oz - cz)) * adz;

      var sil = rows;              // rows [sil, rows-1] are painted; sil==0 means the column is done
      var w = 0, faceX = 1, steps = 0;

      while (sil > 0 && steps++ < MAXSTEP) {
        /* Cell-exact traversal, which is what hands us the entry distance and the crossed face
         * for free — no back-projection, no bisection, and no chance of striding over a one-cell
         * sliver of frontage and opening a hole in the wall. */
        if (mX < mZ) { w = mX; mX += adx; cx += sX; faceX = 1; }
        else         { w = mZ; mZ += adz; cz += sZ; faceX = 0; }
        if (w > wFar) break;

        var h = city ? city.height(cx, cz) : 0;
        if (h <= 0) continue;

        var topRow = horizon - (h - eyeY) * scale / w;
        if (topRow > sil - 0.5) continue;              // wholly behind what is already painted

        var r0 = Math.ceil(topRow - 0.5); if (r0 < 0) r0 = 0;
        var dist = w * len;
        var grF = horizon + eyeY * scale / w;          // screen row of the wall's base
        /* u runs along the face that was actually crossed, taken at the hit point in WORLD
         * coordinates. This is the whole ballgame: derive u from anything camera-relative and the
         * windows slide sideways down the wall as you walk instead of translating with it. */
        var u = faceX ? (oz + dz * w) : (ox + dx * w);
        var rec = city.cell(cx, cz);
        var sc = rec ? bindCell(rec) : null;
        if (sc) { sc.h = h; sc.faceX = faceX; sc.side = faceX ? sX : sZ; }
        var sign = rec && rec.sign;

        for (var r = sil - 1; r >= r0; r--) {
          var rowC = r + 0.5, i = r * cols + x;
          if (rowC > grF) {
            /* Below the wall's base: street in FRONT of the building, at its own distance. */
            floorRow(frame, i, r, rowC, ox, oz, dx, dz, len, horizon, scale, eyeY, t);
            continue;
          }
          mirA[r] = 0;                    // wall, not water: nothing here reflects anything
          var v = eyeY + (horizon - rowC) * w / scale;
          var o = Surf.facade(u, v, sc, dist, t);
          var ch = o.ch, cl = o.col, lm = o.lum, sg;
          if (sign && (sg = signPixel(rec, u, v, faceX, t))) { ch = sg.ch; cl = sg.col; lm = sg.lum; }
          poke(frame, i, ch, cl, Surf.fog(lm, dist), dist, 1);
        }
        sil = r0;

        /* Nothing beyond this distance can clear the silhouette even at the city's tallest, so the
         * rest of the march is provably invisible. In a canyon this ends most columns early. */
        var room = horizon - sil + 0.5;
        if (room > 0.5) {
          var wCut = (HMAX - eyeY) * scale / room;
          if (wCut < wFar) wFar = wCut;
        }
      }

      /* Whatever the march never reached: distant road below the horizon, sky above it. */
      for (var q = sil - 1; q >= 0; q--) {
        var j = q * cols + x, qc = q + 0.5;
        if (qc > horizon) {
          floorRow(frame, j, q, qc, ox, oz, dx, dz, len, horizon, scale, eyeY, t);
        } else {
          var s = Surf.sky(skyX, q, t);
          poke(frame, j, s.ch, s.col, s.lum, Infinity, 0);
        }
      }

      /* The column is complete, so the water can now be told what it is standing under. */
      reflectColumn(frame, x, cols, rows, horizon);
    }
    return frame;
  }

  var Cast = { render: render, HMAX: HMAX };
  CC.Cast = Cast;
  if (typeof module !== 'undefined') module.exports = Cast;
})(typeof CC !== 'undefined' ? CC : require('./core.js'));
