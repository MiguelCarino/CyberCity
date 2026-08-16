/* CyberCity street life — the pavement layer: people, ground traffic across the intersections,
 * a cat, food stalls, and the litter the wind pushes around.
 *
 * DESIGN NOTE, because it governs every draw call below: this batch is mostly SUBTRACTIVE.
 * The reference frames are ~60% pure black and the road is already the darkest thing in them, so
 * a person or a car drawn as a lit shape would be the brightest object on screen and would wreck
 * the balance. Instead they are drawn as black cut-outs at their true depth — CC.put writes
 * ch=0/lum=0 and stamps `dist`, which punches the shape out of the lit shopfront band behind it —
 * and each one carries only a couple of genuinely lit cells: a rim of sodium on a head, a pair of
 * headlamps, an eye-shine. That is how the references read, and it means the whole batch costs
 * almost nothing against the black budget.
 *
 * Everything is world-anchored. Agents hold world (x,z) and a world velocity, so turning a corner
 * leaves them behind on the street they belong to instead of dragging them round with the view.
 */
(function (CC) {
  'use strict';

  var P = CC.P, g = CC.g, hash2 = CC.hash2, clamp = CC.clamp, vnoise = CC.vnoise, put = CC.put;

  /* Resolved once — g() is a string lookup and these are hit thousands of times a frame. */
  var G_DOT = g('.'), G_COMMA = g(','), G_COLON = g(':'), G_SEMI = g(';'), G_QUOTE = g("'"),
      G_TICK = g('`'), G_DASH = g('-'), G_UNDER = g('_'), G_EQ = g('='), G_PIPE = g('|'),
      G_HASH = g('#'), G_8 = g('8'), G_0 = g('0'), G_X = g('X'), G_o = g('o'), G_M = g('M'),
      G_W = g('W'), G_CARET = g('^'), G_STAR = g('*');

  /* Blocky only. Anything with holes in it dithers instead of massing at this cell size. */
  var FILL = [G_8, G_0, G_HASH, G_M, G_W, G_X], FILL_N = FILL.length;
  var PAPER = [G_QUOTE, G_TICK, G_COMMA, G_DOT, G_DASH, G_UNDER, G_COLON, G_SEMI],
      PAPER_N = PAPER.length;

  /* ---- the weather, and the two ways of reading it ---------------------------------------------
   * CC.Weather.P is a LIVE object — held, never copied, or an element ends up drawing last
   * minute's sky. Two readings, and which one to use is not a matter of taste:
   *
   *   wrel(k)  the parameter divided by its value under the 'rain' preset, which is the preset
   *            this whole file was tuned under. A constant that already existed and already looked
   *            right is scaled by wrel(), so it reproduces its shipped value exactly and only
   *            moves when the weather does. Multiplying such a constant by the RAW parameter would
   *            silently re-tune it to 65% of what it was.
   *   wp().x   the raw 0..1 direction, for behaviour that is NEW and has no shipped value to
   *            preserve — how far a downpour thins the pavement, how many umbrellas are up.
   *
   * The fallback block is the 'rain' preset itself, so a harness that never loaded the director
   * renders the frame the director's reference preset would have produced. */
  var W_STILL = { rain: 0.65, wind: 0.55, fog: 0.30, wet: 0.90, storm: 0.12, haze: 0.40,
                  cloud: 0.75, steam: 0.85 };
  function wp() { return CC.Weather ? CC.Weather.P : W_STILL; }
  function wrel(k) { return CC.Weather ? CC.Weather.rel(k) : 1; }
  /* 0 on autopilot, easing to 1 while a human drives. Read, never written. */
  function ctrlBlend() { return CC.Control ? CC.Control.blend : 0; }

  /* ---- camera basis ---------------------------------------------------------------------------
   * Duplicated from raycast.js rather than reached for, because elements are handed `cam` and
   * nothing else. The projection MUST match the caster exactly or a pedestrian stands beside the
   * kerb it is meant to be standing on: planar camera, so `w` is the forward-axis distance and the
   * radial distance the depth test wants is w*sqrt(1+sp*sp). */
  var CX = 0, CZ = 0, FWX = 0, FWZ = 1, RGX = 1, RGZ = 0, HP = 0.7, EYE = 1.7;
  var COLS = 0, ROWS = 0, HOR = 0, SCALE = 1, CPM = 1;

  function camBasis(cam) {
    var yaw = cam.yaw || 0;
    FWX = Math.sin(yaw); FWZ = Math.cos(yaw);
    RGX = Math.cos(yaw); RGZ = -Math.sin(yaw);
    CX = cam.x; CZ = cam.z;
    HP = Math.tan((cam.fov || 1.25) * 0.5);
    EYE = cam.eyeY !== undefined ? cam.eyeY : 1.7;
  }
  /* Split out from camScreen so that update(), which is handed a camera and no frame, can still ask
   * the questions draw() asks — specifically how large a figure is about to print. A cull written
   * against a screen-space budget has to compute that budget the same way the drawing code does or
   * the two disagree at exactly the moment it matters. */
  function camScreenAt(cam, cols, rows) {
    camBasis(cam);
    COLS = cols; ROWS = rows;
    HOR = cam.horizon !== undefined ? cam.horizon : ROWS * 0.56;
    /* Once the horizontal fov and the cell aspect are fixed so is the vertical scale — same
     * reconciliation the caster does. Reading cam.scale instead would tilt every element off the
     * world by the ratio between the two. */
    SCALE = cam.scaleY !== undefined ? cam.scaleY
          : (COLS * (cam.cellAspect || 0.5625)) / (2 * HP);
    CPM = COLS * 0.5 / HP;               // screen columns per metre of lateral offset, times 1/w
  }
  function camScreen(frame, cam) { camScreenAt(cam, frame.cols, frame.rows); }

  var PJ = { ok: 0, w: 0, sp: 0, x: 0, dist: 0 };
  /* Module scratch: the caller must read what it needs out of PJ before projecting anything else.
   * The car body, which projects a nose and a tail, is the one place that matters. */
  function project(px, pz) {
    var dx = px - CX, dz = pz - CZ;
    var w = dx * FWX + dz * FWZ;
    /* Behind the eye, or so close that sp explodes and the shape smears across the whole frame. */
    if (w < 0.45) { PJ.ok = 0; return PJ; }
    var sp = (dx * RGX + dz * RGZ) / w;
    PJ.ok = 1; PJ.w = w; PJ.sp = sp;
    PJ.x = (sp / HP + 1) * COLS * 0.5 - 0.5;
    PJ.dist = w * Math.sqrt(1 + sp * sp);
    return PJ;
  }
  function rowOf(y, w) { return HOR - (y - EYE) * SCALE / w; }

  /* Depth of the TARMAC at a screen row. Anything drawn below an object's base — a pool of spill,
   * a reflection — lies on road that is NEARER than the object casting it, so handing CC.put the
   * object's own distance loses the depth test every time and the mark silently never appears.
   * This was drawn wrong first and the stall spill and the car's tail reflection were both
   * invisible; that is the reason this function exists. */
  function roadDist(row, sp) {
    var den = row - HOR;
    if (den < 0.5) return 1e6;
    return (EYE * SCALE / den) * Math.sqrt(1 + sp * sp);
  }

  /* The world pass has already fogged its own cells. Fogging here too keeps a figure at 50 m as
   * dim as the wall it stands against; skipping it makes the far half of the street brighter than
   * the buildings around it, which inverts the depth cue the whole palette rests on. */
  function fg(lum, dist) {
    var S = CC.Surf;
    return S ? S.fog(lum, dist) : lum;
  }

  /* Depth ties LOSE in CC.put (it wants a strict improvement), and a figure's feet stand on tarmac
   * at almost exactly the figure's own distance. Biasing an element a few centimetres toward the
   * eye is what stops the bottom row of every silhouette dropping out. */
  function near(d) { return d * 0.994; }
  /* A second bias step, for anything that sits on the FRONT FACE of a shape this file has already
   * stamped at near(): a rim light on a silhouette, a headlamp on a car, a cat's eye. Without it
   * the detail ties with its own body and CC.put throws it away — every element in this file was
   * drawing its silhouette and losing all its lit cells, which is exactly as visible as drawing
   * nothing at all. */
  function nearer(d) { return d * 0.982; }

  /* ---- which corridor the camera is standing in -----------------------------------------------
   * Mirrors raycast.configureFor. Avenues run along +z, cross streets along +x; standing in an
   * intersection both are true, so the tiebreak is which way the camera is looking. Street life is
   * laid out in corridor space (along, lateral) and only then converted to world, because "on the
   * pavement" is a statement about the corridor, not about x or z. */
  var COR = { axis: 0, ctr: 0, half: 3.5, along: 0, dir: 1 };
  function corridor(city, cam) {
    if (!city || !city.aveX) {                    // no city loaded: assume the harness's canyon
      COR.axis = 0; COR.ctr = 0.5; COR.half = 3.5;
      COR.along = cam.z; COR.dir = FWZ < 0 ? -1 : 1;
      return COR;
    }
    var k = Math.round(cam.x / city.AVE), m = Math.round(cam.z / city.CROSS);
    var aC = 0, aW = 0, cC = 0, cW = 0, bA = 1e18, bC = 1e18, i, c, d;
    for (i = k - 1; i <= k + 1; i++) {
      c = city.aveX(i) + 0.5; d = cam.x - c; if (d < 0) d = -d;
      if (d < bA) { bA = d; aC = c; aW = city.aveW(i) + 0.5; }
    }
    for (i = m - 1; i <= m + 1; i++) {
      c = city.crossZ(i) + 0.5; d = cam.z - c; if (d < 0) d = -d;
      if (d < bC) { bC = d; cC = c; cW = city.crossW(i) + 0.5; }
    }
    var afz = FWZ < 0 ? -FWZ : FWZ, afx = FWX < 0 ? -FWX : FWX;
    if (bC <= cW && (bA > aW || afx > afz)) {
      COR.axis = 1; COR.ctr = cC; COR.half = cW; COR.along = cam.x; COR.dir = FWX < 0 ? -1 : 1;
    } else {
      COR.axis = 0; COR.ctr = aC; COR.half = aW; COR.along = cam.z; COR.dir = FWZ < 0 ? -1 : 1;
    }
    return COR;
  }
  function worldX(a, l) { return COR.axis ? a : COR.ctr + l; }
  function worldZ(a, l) { return COR.axis ? COR.ctr + l : a; }

  /* The kerb sits 1.4 m in off the building line (raycast.configureFor), so the pavement is that
   * 1.4 m strip. A 3 m alley has no such strip, hence the floor at half the corridor width. */
  function kerbL() {
    var p = COR.half - 1.4;
    return p < COR.half * 0.5 ? COR.half * 0.5 : p;
  }

  /* Vertical run of one shape in one column. rTop/rBot are float screen rows, top first. */
  function bar(f, x, rTop, rBot, ch, col, lum, dist) {
    var r0 = Math.round(rTop), r1 = Math.round(rBot);
    if (r1 < r0) r1 = r0;
    if (r0 < 0) r0 = 0;
    if (r1 > ROWS - 1) r1 = ROWS - 1;
    for (var r = r0; r <= r1; r++) put(f, x, r, ch, col, lum, dist);
  }

  /* =============================================================================================
   * FOOD STALLS — layer 18
   * The one genuinely emissive thing down here, so it is built the way the references build every
   * lit surface: ONE massed horizontal slab (the counter) with dark above and below it, never a
   * scatter of bright dots. Steam is the only part that moves.
   * ============================================================================================ */
  /* Four slots, not two. A stall now spawns at 66–90 m instead of 16–58 (see update), so it spends
   * the first half-minute of its life as a smudge in the fog and only the last twenty seconds as
   * the massed slab it exists to be — and a route that jogs onto a parallel avenue kills it on the
   * way in. With two slots the street went minutes at a time with no lit counter anywhere near it:
   * measured over 50 s of walk, stall energy fell to a twentieth. Four put it back to 0.9x the old
   * average on a straight run, and they are staggered far enough apart that the street is still a
   * street that happens to have a stall on it rather than one lined with them. */
  var stalls = null, STALL_N = 4, PUFF_N = 5;

  CC.ELEMENTS.push({
    name: 'foodstalls',
    layer: 18,
    init: function (city, rng) {
      this.city = city;
      this.seed = (rng() * 2147483647) | 0;
      stalls = new Array(STALL_N);
      for (var i = 0; i < STALL_N; i++)
        stalls[i] = { x: 0, z: 0, side: 1, n: i * 37 + 1, live: 0, hue: P.amber,
                      w: 1.8, tall: 2.2 };
    },
    /* Stalls are static furniture; update() only recycles the ones the walk has left behind. */
    update: function (dt, t, cam) {
      camBasis(cam);
      corridor(this.city, cam);
      var S = this.seed, kl = kerbL(), i;
      for (i = 0; i < STALL_N; i++) {
        var s = stalls[i];
        if (s.live) {
          var p = project(s.x, s.z);
          /* The retirement range has to sit PAST the spawn range below, or a stall born at 80 m
           * fails this test on its very next update and re-rolls itself every frame without ever
           * being drawn. */
          var sl = COR.axis ? s.z - COR.ctr : s.x - COR.ctr;
          if (sl < 0) sl = -sl;
          /* Retired the moment the walk jogs onto a parallel avenue: the stall is then out in the
           * middle of somebody else's block and can never come back into view, but the projection
           * test alone keeps it alive for another twenty seconds while its slot — one of only four
           * — sits dead. Freeing it immediately is what keeps a stall in the pipeline on a route
           * that turns often. */
          if (p.ok && p.w < 96 && p.sp < HP * 2.4 && p.sp > -HP * 2.4 && sl < COR.half + 3) continue;
          s.live = 0;
        }
        s.n++;
        var h1 = hash2(i, s.n, S), h2 = hash2(i, s.n, S ^ 0x5A1), h3 = hash2(i, s.n, S ^ 0x9B);
        /* Spawned at 66–90 m, which is BEYOND the far end of the draw below, so a stall is never
         * seen arriving. It used to spawn at 16–58 m: at 16 m a lit amber counter is thirteen
         * columns of lum 186 and it simply materialised in the middle of the frame. Now the fog
         * hands it over — 34 lum and a column and a half at 90 m — and the walk takes half a
         * minute to bring it up to the massed slab it exists to be. */
        var a = COR.along + COR.dir * (66 + h1 * 24);
        s.side = h2 < 0.5 ? -1 : 1;
        var l = s.side * (kl + 0.25 + h3 * 0.55);
        s.x = worldX(a, l); s.z = worldZ(a, l);
        s.w = 1.5 + h1 * 1.3;
        s.tall = 2.05 + h2 * 0.45;
        /* Amber strip light or a warm fry counter, and nothing else — a stall in an accent colour
         * reads as signage rather than as food. */
        s.hue = h3 < 0.55 ? P.amber : P.warm;
        s.live = 1;
      }
    },
    draw: function (frame, cam, t) {
      camScreen(frame, cam);
      var S = this.seed, i, j, x;
      for (i = 0; i < STALL_N; i++) {
        var s = stalls[i];
        if (!s.live) continue;
        var p = project(s.x, s.z);
        /* Drawn all the way out past the spawn range so the reveal belongs to the fog and not to
         * this cull: a hard cut-off anywhere inside the spawn range is just the pop again, moved. */
        if (!p.ok || p.dist > 96) continue;
        /* Copied out of PJ before anything else projects — it is one shared scratch record. */
        var w = p.w, cx = p.x, dist = p.dist, sp = p.sp, d = near(dist);
        var hw = s.w * 0.5 * CPM / w;                    // half width, in screen columns
        if (hw < 0.5) hw = 0.5;
        var x0 = Math.round(cx - hw), x1 = Math.round(cx + hw);
        if (x1 < 0 || x0 > COLS - 1) continue;

        /* rowOf climbs the screen as y climbs, so every pair below is (top, bottom). */
        var rGnd = rowOf(0, w);
        var rCtT = rowOf(1.36, w), rCtB = rowOf(0.98, w);
        var rTop = rowOf(s.tall, w), rEave = rowOf(s.tall - 0.28, w);
        var lit = fg(196 + hash2(i, s.n, S ^ 0x3) * 46, dist);
        var dim = fg(30, dist);

        /* Columns per metre ACROSS this stall at its own depth. The texture below is hashed on a
         * world offset from the stall's centre, not on the screen column: hashing on x welded the
         * canopy dashes, the counter fill, the lum jitter and the trestle legs to the VIEWPORT, so
         * the whole surface re-rolled as the stall slid across the frame — a stall that swims is
         * the loudest thing on a quiet street. One third of a metre per bin, which is a plank at
         * arm's length and about a column at the far end of the draw. */
        var cpm = CPM / w;
        for (x = x0; x <= x1; x++) {
          if (x < 0 || x > COLS - 1) continue;
          var hx = hash2(Math.floor((x - cx) / cpm * 3), s.n, S ^ 0x71);
          /* Canopy drawn as a dark slab with only a thin lit underside. The dark half is what
           * keeps the counter reading as a slot of light and not a bar floating in the air. */
          bar(frame, x, rTop, rEave, hx < 0.55 ? G_EQ : 0, P.shadow, hx < 0.55 ? dim * 0.6 : 0, d);
          bar(frame, x, rEave + 1, rCtT - 1, 0, P.shadow, 0, d);          // shadowed interior
          bar(frame, x, rCtT, rCtB, FILL[(hx * FILL_N) | 0], s.hue, lit * (0.82 + hx * 0.30), d);
          bar(frame, x, rCtB + 1, rGnd, hx < 0.30 ? G_PIPE : 0, P.shadow,
              hx < 0.30 ? dim * 0.5 : 0, d);                             // trestle legs
        }
        /* The burner: one ember cell in the dark above the counter. It is the only accent colour
         * this element is allowed and it is deliberately a single cell. */
        if (dist < 40) {
          var bl = fg(150, dist);
          if (bl >= 5)
            put(frame, Math.round(cx + (hash2(i, s.n, S ^ 0xE) - 0.5) * hw),
                Math.round(rCtT - 1), G_o, P.ember, bl, nearer(dist));
        }
        /* Spill on the wet tarmac in front. Smeared ALONG the view, one column per row, because a
         * reflection on a road streaks toward the eye — that vertical drag is the whole reason a
         * street reads as wet. Dimmed hard: it must stay a fraction of the counter above it.
         * Its LENGTH now follows the road: wrel('wet') is 1.0 under the preset this was tuned as,
         * so a rainy street keeps exactly the four rows it always had and a dry one gets two. */
        if (dist < 40) {
          var wetS = wrel('wet');
          var spn = 2 + ((wetS * 2.2) | 0); if (spn > 5) spn = 5;
          var rp0 = Math.round(rGnd) + 1;
          for (j = 0; j < spn; j++) {
            var rr = rp0 + j, rd = roadDist(rr, sp);
            var sl = fg(58 * (1 - j * 0.22) * (0.55 + 0.45 * wetS), rd);
            if (sl < 5) continue;
            put(frame, Math.round(cx - s.side * (j * 0.6)), rr,
                j < 2 ? G_COLON : G_QUOTE, s.hue, sl, near(rd));
          }
        }

        /* Steam. Derived from t and a fixed per-puff phase rather than integrated, so scrubbing
         * time lands on the same frame every time and there is no state to drift. */
        var rate = CC.reducedMotion ? 0.05 : 0.42;
        for (j = 0; j < PUFF_N; j++) {
          var ph = hash2(j, s.n, S ^ 0xC0FE);
          var age = (t * rate + ph) % 1;
          /* Wind pushes the plume sideways as it rises, keyed on the stall's own seed so two
           * stalls never breathe in step. */
          var drift = (vnoise(t * 0.5 + ph * 20, S ^ 0x1D) - 0.5) * age * 2.6;
          var fade = (1 - age) * (1 - age);
          var sl2 = fg(50 * fade, dist);
          if (sl2 < 6) continue;
          /* ONE cell per puff. A dense plume is a grey veil, which is the single failure this
           * whole art direction exists to prevent. */
          put(frame, Math.round(cx + drift * CPM / w * 0.6),
              Math.round(rowOf(s.tall + 0.15 + age * 3.4, w)),
              age < 0.35 ? G_QUOTE : G_TICK, P.slate, sl2, near(dist));
        }
      }
    }
  });

  /* =============================================================================================
   * PEDESTRIANS — layer 20
   *
   * A walker is still a black cut-out with a lit top edge, because that is the only thing that
   * reads against a black road. What is new is that the cut-out has a SHAPE. Every figure draws an
   * ARCHETYPE at spawn and the archetype is spent on the SILHOUETTE, not on colour: most of this
   * crowd stands between six and twenty rows tall, where a coat's COLOUR is one cell and a coat's
   * HEM is four. So a long coat widens toward the ankle, a hood peaks where a face would be, a
   * courier's pack breaks one shoulder square, a brim runs wider than the head, a skirt narrows to
   * two legs, and an umbrella puts an arc over the lot. Each archetype also carries its own stride
   * frequency, bob and pace — a costume without its own walk is a sticker, and fourteen identical
   * gaits was exactly the tell.
   *
   * The body stays NEAR-BLACK. The lit cells on a figure are the rim (sodium off the lamp
   * standards, azure where the frontage behind them is screenlight), the phone, and AT MOST ONE
   * accent — LED piping down a technical shell, a courier's reflective strip, a cigarette, a lit
   * takeaway bag. Roughly one figure in six carries an accent at all. Two coloured things on one
   * silhouette and it stops being a person in the dark.
   * ============================================================================================ */

  /* The costume table. Built once at load and held BY REFERENCE on each walker, so an archetype
   * costs no per-frame lookup and no allocation. Every measurement below is in "shoulder
   * half-widths" across and in body fractions down, 0 at the crown and 1 at the sole, so a costume
   * is the same shape at 3 m and at 60 m.
   *   w       relative spawn weight
   *   hem     how far the hem flares past the shoulder line
   *   hemTop  where that flare starts and where it ends — a coat reaches the ankle, a skirt the knee
   *   hemBot
   *   legTop  below this the silhouette narrows to legW: a narrow base, which is what reads as a
   *           skirt and heels rather than as trousers
   *   legW    half-width of the legs
   *   brim    a hat brim, wider than the shoulders, sitting just under the crown
   *   pack    a square courier pack, ONE side only
   *   bag     a shoulder bag or a case, one side, at hip height
   *   hood    the crown reads as a peak and carries no face
   *   umb     may own an umbrella — a pack or a hood is already this figure's answer to rain
   *   tallB   metres of extra height
   *   stride  stride frequency multiplier
   *   bob     head bob amplitude, metres
   *   spd     walking pace multiplier
   *   accP    chance this archetype carries its accent at all
   *   acc     1 LED piping   2 reflective strip   3 cigarette   4 something carried and lit
   */
  var ARCH = [
    { name: 'plain',   w: 0.17, hem: 0.00, hemTop: 0.00, hemBot: 1.00, legTop: 1.00, legW: 0.30,
      brim: 0.00, pack: 0.00, bag: 0.00, hood: 0, umb: 1, tallB: 0.00,
      stride: 1.00, bob: 0.035, spd: 1.00, accP: 0.06, acc: 3 },
    { name: 'coat',    w: 0.17, hem: 0.70, hemTop: 0.46, hemBot: 0.97, legTop: 1.00, legW: 0.30,
      brim: 0.00, pack: 0.00, bag: 0.00, hood: 0, umb: 1, tallB: 0.00,
      stride: 0.86, bob: 0.028, spd: 0.96, accP: 0.10, acc: 3 },
    { name: 'hood',    w: 0.15, hem: 0.26, hemTop: 0.58, hemBot: 0.92, legTop: 1.00, legW: 0.30,
      brim: 0.00, pack: 0.00, bag: 0.00, hood: 1, umb: 0, tallB: 0.00,
      stride: 0.96, bob: 0.024, spd: 1.08, accP: 0.14, acc: 1 },
    { name: 'skirt',   w: 0.12, hem: 0.34, hemTop: 0.50, hemBot: 0.76, legTop: 0.76, legW: 0.19,
      brim: 0.00, pack: 0.00, bag: 0.00, hood: 0, umb: 1, tallB: 0.00,
      stride: 1.24, bob: 0.052, spd: 1.02, accP: 0.10, acc: 4 },
    { name: 'courier', w: 0.10, hem: 0.00, hemTop: 0.00, hemBot: 1.00, legTop: 1.00, legW: 0.30,
      brim: 0.00, pack: 0.55, bag: 0.00, hood: 0, umb: 0, tallB: 0.00,
      stride: 1.14, bob: 0.030, spd: 1.30, accP: 0.34, acc: 2 },
    /* The one figure allowed a narrow accent down its own seam, and it is 6% of the crowd. */
    { name: 'shell',   w: 0.06, hem: 0.16, hemTop: 0.55, hemBot: 0.95, legTop: 1.00, legW: 0.30,
      brim: 0.00, pack: 0.00, bag: 0.00, hood: 0, umb: 0, tallB: 0.14,
      stride: 0.98, bob: 0.032, spd: 1.04, accP: 0.78, acc: 1 },
    { name: 'hat',     w: 0.09, hem: 0.00, hemTop: 0.00, hemBot: 1.00, legTop: 1.00, legW: 0.30,
      brim: 0.55, pack: 0.00, bag: 0.00, hood: 0, umb: 1, tallB: 0.00,
      stride: 0.92, bob: 0.026, spd: 0.94, accP: 0.06, acc: 3 },
    { name: 'bagger',  w: 0.14, hem: 0.00, hemTop: 0.00, hemBot: 1.00, legTop: 1.00, legW: 0.30,
      brim: 0.00, pack: 0.00, bag: 0.60, hood: 0, umb: 1, tallB: 0.00,
      stride: 1.00, bob: 0.034, spd: 0.97, accP: 0.18, acc: 4 }
  ];
  var ARCH_TOT = 0;
  (function () {
    /* `ext` is how far past the shoulder line this costume can possibly reach, so the column loop
     * knows where to stop without testing every accessory on every column of every figure. */
    for (var i = 0; i < ARCH.length; i++) {
      var A = ARCH[i], e = A.hem;
      if (A.brim > e) e = A.brim;
      if (A.pack > e) e = A.pack;
      if (A.bag > e) e = A.bag;
      A.ext = e;
      ARCH_TOT += A.w; A.acc0 = ARCH_TOT;
    }
  })();
  function archPick(h) {
    var r = h * ARCH_TOT, i;
    for (i = 0; i < ARCH.length - 1; i++) if (r < ARCH[i].acc0) return ARCH[i];
    return ARCH[ARCH.length - 1];
  }

  /* The pool is allocated at the maximum and only a PREFIX of it is ever live, the same shape the
   * rain uses, and for the same reason: a crowd is measured against the frame it is drawn in. A
   * 400x100 window is three and a third times the cells of the reference 200x60 and shows a walker
   * at three times the detail, so a world-fixed population that reads as a crowd there reads as a
   * scatter. NOT linear in cells, though — unlike a rain streak, a figure's screen FOOTPRINT is
   * already a fixed fraction of the frame at any grid size, so scaling linearly would multiply the
   * cut-out area by the same factor as the count and black the picture out. The square root adds
   * people without adding that much occlusion. */
  var peds = null, PED_MAX = 52, PED_AT_REF = 20, REF_CELLS = 200 * 60;

  function pedWant(cells) {
    var n = PED_AT_REF * Math.sqrt(cells / REF_CELLS);
    /* Rain empties a pavement. NEW behaviour, so it reads the raw 0..1 direction rather than
     * wrel(): there is no shipped value here to preserve, and rain=1 meaning "downpour" is exactly
     * what the number is for. Three in five stay out in the worst of it, and disproportionately
     * many of those are the ones who own an umbrella. */
    n *= 1 - 0.38 * wp().rain;
    n = n | 0;
    return n > PED_MAX ? PED_MAX : (n < 4 ? 4 : n);
  }

  /* ---- how much of the frame one walker blacks out -------------------------------------------
   * THE NUMBER THIS FILE'S WORST TRANSIENT IS MEASURED IN, so it is computed here once and used
   * both by the draw (which builds the box) and by the retirement in update() (which decides the
   * box is too big). Two different formulas for the same box is how the cull came to let through
   * exactly the case it existed to catch.
   *
   * A pedestrian is a BLACK CUT-OUT — see the design note at the top — so its area is not a matter
   * of taste, it is the whole-frame luminance it removes. Every other visual property of a figure
   * can be eased; this one cannot, because there is no such thing as a half-drawn hole. */
  function pedShoulder(w) {
    var shw = 0.24 * CPM / w;            // half a SHOULDER width, in columns
    return shw < 0.45 ? 0.45 : shw;
  }
  function pedCover(p, pr) {
    var xw = pedShoulder(pr.w) * (1 + p.A.ext);
    /* Clipped to the frame, deliberately: a figure that is half off the left edge blacks out half
     * as much picture, and it is the picture that this budget is about. That clip is also what
     * lets somebody walk right past your shoulder — the case that reads best — while stopping
     * somebody walking into your face. */
    var x0 = pr.x - xw, x1 = pr.x + xw;
    if (x0 < 0) x0 = 0;
    if (x1 > COLS - 1) x1 = COLS - 1;
    if (x1 <= x0) return 0;
    var rr = (p.tall + p.A.tallB) * SCALE / pr.w;      // head to feet, in screen rows
    if (rr > ROWS) rr = ROWS;
    return (x1 - x0) * rr / (COLS * ROWS);
  }
  /* THE BUDGET, and the one number in this file that is a safety limit rather than a look.
   *
   * The projection has a singularity at the eye and the near cull in project() sits right on top of
   * it: a walker at 0.46 m is 585 rows tall and 250 columns wide, i.e. a black slab over the whole
   * frame, and the next tick deletes it. Measured over seeds 3/7/42/99 x 300 s at 400x100 that
   * happened ten times, and the worst of them moved the whole frame's mean printed luminance by
   * 8.0% of full scale in one 16 ms frame with 32% of the cells changing by more than a tenth —
   * far and away the largest luminance step the piece can produce, and invisible to both safety
   * tools because neither of them looks at area.
   *
   * Retiring on a screen-area budget rather than on a distance is what makes this correct at every
   * grid size and every fov, and it is also kinder than a distance would be: a slim figure and one
   * clipped by the frame edge may both come far closer than a coat walking straight at you, which
   * is the case that has to go. 3.5% of the frame is the largest cut-out the rest of the build
   * already produces routinely at the LATERAL cull, so nothing here introduces a transient the
   * piece did not already have — it only stops the ones an order of magnitude past it. */
  var PED_COVER_MAX = 0.035;

  /* How busy the frontage is at a spot on the pavement, and what colour it throws. The city
   * already knows both: a lot with a sign on it and a high litRate is a shopfront parade, a
   * concrete lot with neither is a dead wall. Asking it is the difference between a crowd that
   * stands outside the shops and a sprinkle spread evenly along a street that is not even.
   * Returns roughly 0.34 (blank wall) .. 2.0 (a lit parade under signage). */
  var FF_HUE = 0;
  function footfall(city, a, l) {
    FF_HUE = P.amber;
    if (!city || !city.cell) return 1;
    /* Sampled 2.2 m PAST the walker, i.e. inside the frontage. The pavement itself is street and
     * carries no building record, so sampling where the figure stands always returns null. */
    var ll = l + (l < 0 ? -2.2 : 2.2);
    var c = city.cell(worldX(a, ll), worldZ(a, ll));
    if (!c) return 0.62;        // a gap in the frontage — an alley mouth or a plaza, not a parade
    FF_HUE = c.hue;
    return 0.34 + c.litRate * 2.4 + (c.sign ? 0.55 : 0);
  }

  function pedSpawn(p, i, S, fresh, city) {
    p.n++;
    var n = p.n;
    /* One independent draw per decision. Sharing a hash between two of them welds them together,
     * and the shipped version of this function did exactly that twice: reusing the crossing draw
     * for the rim colour made every crosser amber. Additive offsets, never XOR — the house rule
     * for seeding hash2. */
    var h1 = hash2(i, n, S + 101), h2 = hash2(i, n, S + 211), h3 = hash2(i, n, S + 307),
        h4 = hash2(i, n, S + 401), h5 = hash2(i, n, S + 503), h6 = hash2(i, n, S + 601),
        h7 = hash2(i, n, S + 701), h8 = hash2(i, n, S + 809), h9 = hash2(i, n, S + 907),
        h10 = hash2(i, n, S + 1013), h11 = hash2(i, n, S + 1117), h12 = hash2(i, n, S + 1223),
        h13 = hash2(i, n, S + 1301), h14 = hash2(i, n, S + 1409);
    var rain = wp().rain;
    var kl = kerbL(), band = COR.half - kl - 0.6;
    if (band < 0.2) band = 0.2;
    var side = h2 < 0.5 ? -1 : 1;
    var A = archPick(h4);
    var a, l, ki;

    /* WHERE. Three candidate spots down the street, and the busiest frontage wins. */
    var l0 = side * (kl + 0.2 + h3 * band);
    var bestA = COR.along + COR.dir * 58, bestF = -1, bestH = P.amber;
    for (ki = 0; ki < 3; ki++) {
      var hk = hash2(i, n * 4 + ki, S + 1361);
      /* The first fill spreads over the whole visible street; every later respawn arrives from
       * BEYOND the draw cull below, so a walker is always handed to the frame by the fog at two
       * rows and thirty lum rather than switching on at full contrast in the middle of it. */
      var ak = COR.along + COR.dir * (fresh ? 5 + hk * 42 : 52 + hk * 16);
      var ff = footfall(city, ak, l0);
      if (ff > bestF) { bestF = ff; bestA = ak; bestH = FF_HUE; }
    }
    /* And if even the best of the three has nothing worth walking past, this slot sits the next
     * second or two out and asks again. That is what actually thins the pavement on a dead block —
     * picking the best spot alone only slides the same crowd along it. The first fill is exempt,
     * or the street starts empty and takes half a minute to populate. */
    /* The wait deliberately shares h6 with the threshold. Given that the test failed, h6 is
     * conditioned HIGH — the fussier the draw, the emptier the frontage it just turned down — so
     * a genuinely dead block keeps its slot idle for longer than a marginal one does, for free. */
    if (!fresh && bestF < 0.55 + h6 * 0.80) {
      p.live = 0; p.wait = 0.5 + h6 * 2.4;
      return;
    }

    var sp = (0.95 + h1 * 0.55) * A.spd;
    /* Nobody strolls in a downpour, and nobody sprints in one either at this camera distance —
     * they shorten up and get on with it. The hunch below is the visible half of the same fact. */
    sp *= 1 - 0.16 * rain;
    p.shelter = 0;
    /* How many of them are standing still under something. It grows with the rain because that is
     * what rain does to a pavement, but it is capped low on purpose: a sheltering figure has no
     * velocity, so it is one that will never walk into the near field, and a share much past a
     * quarter empties the foreground and stacks the whole crowd at one depth. */
    var shP = 0.05 + 0.22 * rain;
    if (h7 < 0.28) {
      /* A quarter of them cross the carriageway. On a 13 m boulevard the pavements sit at the very
       * edge of a 92-degree view and a figure standing on one is out of frame until it is 8 m
       * away, so without crossers the middle of the street — most of the lower frame — never has
       * anybody in it at all.
       * A crosser has to start near enough to still be crossing when it matters, so it cannot be
       * hidden by distance the way the pavement walkers are. It is hidden by the BUILDING instead:
       * 1.2 m in behind the frontage, where the facade the raycaster already painted wins the
       * depth test, so the figure walks out from the wall rather than appearing in the road. */
      p.cross = 1; p.goSide = side;
      a = COR.along + COR.dir * (fresh ? 7 + h1 * 22 : 15 + h1 * 17);
      l = -side * (COR.half + 1.2);
      p.vx = COR.axis ? 0 : side * sp;
      p.vz = COR.axis ? side * sp : 0;
    } else if (h7 < 0.28 + shP) {
      /* SHELTERING. Rain does not only thin a pavement, it moves the people who are still on it
       * off the middle of it and under whatever roof is nearest — which is why this share grows
       * with the rain rather than being a fixed quirk. A sheltering figure has no velocity at all:
       * the walk brings the camera to it, exactly the way it brings the camera to a stall. */
      p.cross = 0; p.shelter = 1;
      p.vx = 0; p.vz = 0;
      a = bestA; l = side * (COR.half - 0.5);
      /* Only about half of them go to a stall, and never more than a couple of metres either side
       * of it. With every shelterer homing on the nearest live counter the whole group landed
       * inside one 3.6 m span at one depth — twelve people shoulder to shoulder reads as a wall,
       * not as a queue. The rest hold up whatever frontage they happen to be beside. */
      var sst = h13 < 0.5 && stalls ? stalls[(h13 * 2 * STALL_N) | 0] : null;
      if (sst && sst.live) {
        /* Better still, under the stall's own canopy. It is the one lit roof on the street, so it
         * is both where anybody waiting out a downpour would actually stand and the one place on
         * the pavement where a black cut-out has something bright to stand against. */
        var sa = COR.axis ? sst.x : sst.z;
        var sl = (COR.axis ? sst.z : sst.x) - COR.ctr;
        a = sa + (h1 - 0.5) * 3.6;
        l = sl + (sl < 0 ? 0.95 : -0.95);
        side = sl < 0 ? -1 : 1;
      }
    } else {
      /* With the camera and against it, but weighted to the oncoming ones: they are what make the
       * street feel used rather than swept, and they are also the only half that ever arrives —
       * a walker going YOUR way at 1.2 m/s in front of a 1.6 m/s walk closes at 0.4 m/s and
       * spends its whole life two rows tall at the far end of the street. */
      p.cross = 0;
      a = bestA; l = l0;
      var go = (h5 < 0.62 ? -1 : 1) * COR.dir;
      p.vx = COR.axis ? go * sp : 0;
      p.vz = COR.axis ? 0 : go * sp;
    }
    p.x = worldX(a, l); p.z = worldZ(a, l);
    p.dodge = 0; p.dx = 0; p.dz = 0;
    p.A = A;
    p.tall = 1.62 + h11 * 0.22;
    p.walked = 0;
    p.phase = h3 * 6.283;
    /* Which shoulder the nearest lamp is over. Rimming both sides makes a figure read as a
     * cardboard cut-out lit from the front, which is the one thing it must not look like. For a
     * sheltering figure the counter beside it IS the lamp, so the lit shoulder is the outboard
     * one whatever the hash says. */
    p.side = p.shelter ? (l < 0 ? -1 : 1) : (h14 < 0.5 ? -1 : 1);
    /* Rim colour follows the frontage this figure is walking past rather than a coin toss: a
     * screen block throws azure onto whoever is in front of it and a sodium one throws amber,
     * which is the same two-pillar rule the facades themselves obey. One in five breaks it,
     * because a street has more light in it than the wall behind you. */
    var scr = bestH === P.azure;
    p.rim = (h10 < 0.80 ? scr : !scr) ? P.azure : P.amber;
    /* Umbrellas. Owning one is not the same as having it up — see the easing in update(). */
    p.umbOwn = A.umb && h9 < 0.62 ? 1 : 0;
    p.uRate = 0.20 + h1 * 0.26;              // seconds-scale, and different for every figure
    /* A phone is a screen, which is the one thing violet is licensed for. Conditional on the gate,
     * h12/0.18 is itself uniform on 0..1 and independent of it, so the colour needs no extra
     * draw — the same trick pays for the accent below. */
    if (h12 < 0.18) {
      var q = h12 / 0.18;
      p.phone = q < 0.70 ? P.azure : (q < 0.88 ? P.ice : P.violet);
    } else p.phone = -1;
    /* THE ONE ACCENT, and only about one figure in six has one. */
    if (h8 < A.accP) {
      var qa = h8 / A.accP;
      p.acc = A.acc;
      /* Piping leans violet rather than spring, and that is a PRINT decision, not a taste one:
       * core.js gives spring an exposure weight of 1.55 against violet's 0.70, so the same lum
       * prints spring more than twice as hot and a green seam was reading as the brightest thing
       * on the pavement. */
      p.accHue = A.acc === 1 ? (qa < 0.34 ? P.spring : P.violet)
               : A.acc === 2 ? P.ice
               : A.acc === 3 ? P.ember
               : (qa < 0.60 ? P.warm : P.amber);
    } else { p.acc = 0; p.accHue = P.amber; }
    p.live = 1;
  }

  CC.ELEMENTS.push({
    name: 'pedestrians',
    layer: 20,
    init: function (city, rng, dims) {
      this.city = city;
      /* Small seed and additive offsets, per the house rule for hash2 — and the draw is still one
       * rng() call, so no downstream element's stream moves. */
      this.seed = (rng() * 30011) | 0;
      this.boot = 0;
      this.cols = dims && dims.cols ? dims.cols : 200;
      this.rows = dims && dims.rows ? dims.rows : 60;
      this.cells = this.cols * this.rows;
      peds = new Array(PED_MAX);
      for (var i = 0; i < PED_MAX; i++)
        peds[i] = { x: 0, z: 0, vx: 0, vz: 0, dx: 0, dz: 0, dodge: 0, n: i * 91, tall: 1.7,
                    phase: 0, cross: 0, goSide: 1, shelter: 0, side: 1, rim: P.amber, phone: -1,
                    acc: 0, accHue: P.amber, walked: 0, live: 0, wait: 0,
                    umbOwn: 0, umb: 0, uRate: 0.3, hunch: 0, A: ARCH[0] };
    },
    update: function (dt, t, cam) {
      /* The full screen basis, not just camBasis, because the retirement below is written in screen
       * area. The dimensions are last frame's — one frame of lag on a window resize, which is a
       * frame in which nothing has moved anyway. */
      camScreenAt(cam, this.cols, this.rows);
      corridor(this.city, cam);
      var S = this.seed, city = this.city, i, p;
      /* Deferred to the first update because init() has no camera and therefore no corridor. */
      if (!this.boot) {
        this.boot = 1;
        for (i = 0; i < PED_MAX; i++) pedSpawn(peds[i], i, S, 1, city);
      }
      var k = CC.reducedMotion ? 0.10 : 1;
      var eK = CC.reducedMotion ? 0.35 : 1;
      var want = pedWant(this.cells);
      var rain = wp().rain, cb = ctrlBlend();
      var latX = COR.axis ? 0 : 1, latZ = COR.axis ? 1 : 0;
      for (i = 0; i < PED_MAX; i++) {
        p = peds[i];
        if (i >= want) {
          /* The rain coming on trims the tail of the pool. Staggering the wait is what stops the
           * whole tail walking back on in one block when it eases off again. */
          if (p.live) { p.live = 0; p.wait = 0.4 + (i % 7) * 0.35; }
          continue;
        }
        if (!p.live) {
          /* NOT damped by k, unlike the car and the cat below, and the difference is the rule:
           * damp a timer by whatever damps the thing it feeds. What retires a walker is the CAMERA
           * overtaking it, and the camera's speed is not this element's to slow — damping the
           * refill too would empty the pavement for a reduced-motion viewer and leave it empty. */
          p.wait -= dt;
          if (p.wait <= 0) pedSpawn(p, i, S, 0, city);
          continue;
        }
        p.x += p.vx * dt * k; p.z += p.vz * dt * k;
        p.walked += (p.vx === 0 ? (p.vz < 0 ? -p.vz : p.vz) : (p.vx < 0 ? -p.vx : p.vx)) * dt * k;

        /* Hunch and umbrella are EASED, never switched. An umbrella that appeared on the frame the
         * rain crossed a threshold would be the loudest cut in the piece; over three or four
         * seconds, every figure on its own rate, it reads as a street putting them up one at a
         * time as the front arrives. Reduced motion slows the transition rather than freezing it,
         * because a half-open umbrella frozen forever is worse than a slow one. */
        p.hunch += (rain - p.hunch) * Math.min(1, dt * 0.55 * eK);
        var uT = (p.umbOwn && rain > 0.22) ? 1 : 0;
        p.umb += (uT - p.umb) * Math.min(1, dt * p.uRate * eK);
        if (p.umb < 0.002) p.umb = 0;

        var pr = project(p.x + p.dx, p.z + p.dz);
        /* Somebody is driving, so the nearest walkers give way. Half a metre, eased in over about
         * a second, only inside 7 m and only near the middle of the view — and stepping toward the
         * kerb they are already nearest, which is what a person does and also what keeps this
         * independent of which way the frame happens to be facing. Any more than this and the
         * crowd is visibly reacting to the camera, which turns an ambient piece into a video game.
         * On autopilot CC.Control.blend is 0 and none of it happens at all. */
        var dodgeT = 0;
        if (cb > 0.02 && pr.ok && pr.w < 9) {
          /* The test is in METRES across the camera's own path, not in screen columns. Screen
           * offset was the first cut and it never fired once: sp is an angle, so at 7 m a walker
           * standing a metre off the line of travel is already a third of the way to the frame
           * edge and failed a "near the middle of the view" test that a 60-degree lens made
           * meaningless. Multiplying by w turns it back into the question actually being asked —
           * is this person about to be walked into. */
          var off = pr.sp * pr.w;
          if (off < 1.3 && off > -1.3) {
            var lat = COR.axis ? p.z - COR.ctr : p.x - COR.ctr;
            dodgeT = (lat < 0 ? -1 : 1) * 0.55 * cb;
          }
        }
        p.dodge += (dodgeT - p.dodge) * Math.min(1, dt * 1.5);
        p.dx = latX * p.dodge; p.dz = latZ * p.dodge;

        /* The lateral cull is generous (1.8 half-fovs) so somebody stepping out of frame at the
         * edge is not instantly teleported to the horizon in front of your eyes. The far cull sits
         * past the 68 m respawn, or a recycled walker is retired on the same tick it is created. */
        var gone = !pr.ok || pr.w > 74 || pr.sp > HP * 1.8 || pr.sp < -HP * 1.8;
        /* THE NEAR RETIREMENT, and it runs a long way ahead of project()'s w<0.45 near cull on
         * purpose — see PED_COVER_MAX. That cull is still there and still correct as a guard on the
         * arithmetic, but it must never be the thing that actually retires a walker: by the time a
         * figure reaches it, it is a black slab over the whole frame and deleting it is the biggest
         * luminance step the piece can produce. Retiring on the AREA the cut-out would black out
         * instead means the figure is small when it goes, which is the only way a hole can leave
         * quietly — a cut-out cannot be faded down, because it has no brightness to fade. */
        if (!gone && pedCover(p, pr) > PED_COVER_MAX) gone = 1;
        /* A crosser reaches the far pavement without ever leaving the frustum, so it needs its
         * own retirement test or it walks on through the buildings forever.
         *
         * SIGNED, against the direction it set out in, and that is a bug fix rather than a tidy-up.
         * The shipped test took the ABSOLUTE lateral offset, and a crosser is deliberately born
         * 1.2 m behind the frontage it walks out of — which is already further from the centreline
         * than the 0.6 m the test allowed. Every crosser was therefore retired on the very first
         * tick of its life, before it had moved a centimetre, and the "a third of them cross the
         * carriageway" this file has always claimed simply never happened: the slot rolled again
         * and came back as a pavement walker two times in three. That is also why the near field
         * was empty. Crossers are the only figures that spawn inside 32 m, so they are what keeps
         * anybody in the bottom half of the frame at all. */
        if (!gone && p.cross) {
          var l2 = (COR.axis ? p.z - COR.ctr : p.x - COR.ctr) * p.goSide;
          if (l2 > COR.half + 0.6) gone = 1;
        }
        if (gone) { p.live = 0; p.wait = 0; }
      }
    },
    draw: function (frame, cam, t) {
      camScreen(frame, cam);
      /* Picked up here rather than only at init so a resized window re-scales the crowd on the
       * next frame instead of on the next rebuild. update() reads the same three back, because the
       * near retirement is a screen-area test and it has no frame of its own to measure. */
      this.cols = frame.cols; this.rows = frame.rows;
      this.cells = frame.cols * frame.rows;
      var S = this.seed, i, x, q;
      var wetR = wrel('wet');
      for (i = 0; i < PED_MAX; i++) {
        var p = peds[i];
        if (!p.live) continue;
        var pr = project(p.x + p.dx, p.z + p.dz);
        /* Past the respawn distance, so a walker fades up out of the fog instead of switching on
         * at the cull. The sub-cell test a few lines down retires it for good past ~90 m. */
        if (!pr.ok || pr.dist > 72) continue;
        var w = pr.w, dist = pr.dist, d = near(dist), cx = pr.x, A = p.A;
        /* Bob and stride are keyed on distance walked, not wall clock — they survive scrubbing and
         * they stay in step with the legs instead of with the frame counter. The archetype's own
         * stride multiplier is what stops eight costumes sharing one walk. */
        var st = CC.reducedMotion ? 0 : Math.sin(p.walked * 3.6 * A.stride + p.phase);
        var bobA = CC.reducedMotion ? A.bob * 0.12 : A.bob;
        var hunch = p.hunch;
        var rFeet = rowOf(0, w);
        var rHead = rowOf((p.tall + A.tallB) * (1 - hunch * 0.055) + st * bobA, w);
        var tallRows = rFeet - rHead;
        if (tallRows < 1.4) continue;                 // sub-cell: it would only salt the pavement
        var shw = pedShoulder(w);                     // half a SHOULDER width, in columns
        var xw = shw * (1 + A.ext);                   // ...and how far the costume reaches past it
        var x0 = Math.round(cx - xw), x1 = Math.round(cx + xw);
        if (x1 < 0 || x0 > COLS - 1) continue;
        /* Backstop for the one tick a window resize can put between update()'s area budget and this
         * box: without it a figure that was inside the budget at the old size can print as a slab
         * at the new one, which is precisely the transient PED_COVER_MAX exists to prevent. Twice
         * the budget, so it never fires while the two agree. Skipped rather than retired here,
         * because retiring is update()'s job and it will do it on the very next tick, having by
         * then been handed the new dimensions. */
        if (pedCover(p, pr) > PED_COVER_MAX * 2) continue;
        /* Clamped to the frame, because the loop below walks every column between them and an
         * unclamped near figure spans hundreds of columns that are not on screen. */
        if (x0 < 0) x0 = 0;
        if (x1 > COLS - 1) x1 = COLS - 1;

        /* The body is a black cut-out, and the ONLY lit thing on it is the top edge of that
         * cut-out: sodium from the lamp standards overhead, catching a crown and two shoulders.
         * That single rule is what makes a figure read on a black road — the earlier version drew
         * the silhouette alone, which is invisible everywhere the shopfronts behind it are dark,
         * and that is most of the street. The rule now pays for the costumes too: because the rim
         * lands on whatever the topmost occupied row of each column is, a hat brim, a coat hem and
         * a courier's pack all catch the light on their own edge for free. */
        var rim = fg(70 + hash2(i, p.n, S + 5) * 44, dist);
        var sTop = 0.13 + hunch * 0.06;               // shoulder line, rising as the figure hunches
        for (x = x0; x <= x1; x++) {
          var u = (x - cx) / shw, au = u < 0 ? -u : u;
          var onAcc = (u < 0 ? -1 : 1) === p.side;    // the side the bag or the pack is slung on
          /* v0/v1 are the top and bottom of this column as body fractions. Start empty and let
           * each piece of the costume claim its own span; a column nothing claims is skipped. The
           * union is deliberately taken as a single run rather than as separate pieces — at this
           * cell size a gap between a bag and a hip is one cell of black inside a silhouette that
           * is already black, so drawing it twice would cost and show nothing. */
          var v0 = 9, v1 = -9;
          if (au <= 1.0) {
            v0 = au > 0.62 ? 0.20 + hunch * 0.05 : (au > 0.34 ? sTop : 0);
            /* A hood is a PEAK, and a peak is a shape, not a glyph. Sloping the crown band away
             * from the centre puts the middle column one row above its neighbours, which is what
             * makes the caret below read as a hood rather than as a row of carets — the first cut
             * left the crown flat and printed ^^^^ across the top of every hooded figure. */
            if (A.hood && au <= 0.34) v0 = au * 0.30;
            v1 = au > 0.62 ? 0.66 : (au > A.legW ? A.legTop : 1);
            /* The legs parting is the whole walk cycle at this size; anything more is invisible. */
            if (au < 0.28 && tallRows > 5 && st > 0.42) v1 = 0.90;
          }
          if (A.hem > 0 && au > 1 && au <= 1 + A.hem) {
            /* A coat is a triangle: shoulder-width at the waist, widest at the hem. So a column
             * this far out is covered from the height where the flare has reached it, down. */
            q = A.hemTop + (A.hemBot - A.hemTop) * (au - 1) / A.hem;
            if (q < v0) v0 = q;
            if (A.hemBot > v1) v1 = A.hemBot;
          }
          if (A.brim > 0 && au <= 1 + A.brim) {
            if (0.05 < v0) v0 = 0.05;
            if (0.13 > v1) v1 = 0.13;
          }
          /* The pack hangs BELOW the crown and stops at the small of the back. Started at the head
           * and carried to 1.8 half-widths it stopped being a pack and squared the whole figure
           * off into a slab with a bump on top. */
          if (A.pack > 0 && onAcc && au > 0.50 && au <= 1 + A.pack) {
            if (0.15 < v0) v0 = 0.15;
            if (0.54 > v1) v1 = 0.54;
          }
          if (A.bag > 0 && onAcc && au > 0.60 && au <= 1 + A.bag) {
            if (0.40 < v0) v0 = 0.40;
            if (0.66 > v1) v1 = 0.66;
          }
          if (v1 < v0) continue;
          var rt = rHead + v0 * tallRows, rb = rHead + v1 * tallRows;
          bar(frame, x, rt, rb, 0, P.shadow, 0, d);
          if (rim >= 5) {
            /* A hood carries no face, so its crown is a dimmer peak rather than the bright round
             * head every other archetype gets — which is the whole read at eight rows tall.
             *
             * THE RAMP OUTWARD USED TO END AT 0.32 AND THAT WAS THE COSTUMES' WHOLE PROBLEM. Every
             * cell this loop lights is the TOP EDGE of its own column — the crown, the shoulder
             * line, the top of a coat's flare, a hat brim, the lid of a pack — so all of them face
             * the same lamp and none of them has any business being a third as bright as the head.
             * And au>1 is not a detail: it is exactly the hem, brim, pack and bag, i.e. the only
             * columns that tell one archetype from another. At 0.32 of a rim that starts at 70-114,
             * amber landed at raw 22-36, and core.js prints amber at 0.19 exposure — 12 to 32 out
             * of 255, one step above the black it is drawn on. The geometry was in the buffer and
             * nothing was on the screen. Azure hid it: the same 0.32 prints 38-79 through azure's
             * 0.34 exposure, so a screen-lit figure read and a sodium-lit one did not, which is
             * why this survived being looked at.
             *
             * The crown stays at 1. It is the only feature a figure eight rows tall has left, and
             * the review that found the 0.32 wanted it dropped to 0.55 for hierarchy — but that
             * hierarchy costs half the brightness of every walker in the middle distance, which is
             * most of the crowd, to model a figure that is only modelled at all when it is close.
             * The hierarchy is kept the cheap way instead: the outer bands come UP to just under
             * the crown rather than the crown coming down to them. */
            var rl = au < 0.34 ? (A.hood ? 0.60 : 1) : (au <= 1.0 ? 0.72 : 0.88);
            /* AND THE GLYPH IS HALF THE FIX, which measuring lum alone will never show. The two
             * outer bands used to be drawn with ' and ` — the two smallest marks in the table, a
             * speck in the corner of a cell. A shoulder line and a coat's hem are HORIZONTAL edges
             * caught from above, and at this resolution the thing that says "edge" is a mark with
             * width across the cell, so they are dashes. Rendered and looked at: with the ticks the
             * costume was a dotted rumour at any brightness, and the same cells as dashes are a
             * shoulder and a flared hem. The crown keeps its round o, and a hood its caret, because
             * those two are reading a curve rather than an edge. */
            put(frame, x, Math.round(rt),
                au < 0.34 ? (A.hood ? G_CARET : G_o) : G_DASH,
                p.rim, rim * rl, nearer(dist));
          }
        }
        if (rim < 5) continue;

        /* One shoulder is turned to the lamp, so that side gets a short CONTIGUOUS rim down the
         * upper body. Contiguous matters: spaced every other row it scattered into loose ticks
         * that read as grit on the pavement rather than as the lit edge of a coat. It stops at the
         * waist — carried to the feet it outlines the figure and turns it into a neon sign, which
         * is also why the run is capped: at 400x100 a figure at 3 m is forty rows tall and 0.42 of
         * that is most of a person drawn in sodium. */
        if (tallRows > 8) {
          var rx = Math.round(cx + p.side * shw), qn = (tallRows * 0.42) | 0;
          if (qn > 13) qn = 13;
          /* The old ramp was 0.36 down to 0.16, and 0.16 of a rim that starts at 70 is raw lum 11,
           * which core.js prints as amber 3. The bottom two thirds of every lit shoulder in the
           * piece were therefore drawn in a colour that does not exist on screen — the run was
           * "contiguous" in the buffer and a couple of ticks long in the picture. It now starts
           * near the shoulder rim's own value and fades to nothing over its whole length, which is
           * what a fade is; the cap of 13 cells is what keeps it a lit edge rather than a strip
           * light, and that cap was never the part that was wrong. */
          for (q = 1; q <= qn; q++)
            put(frame, rx, Math.round(rHead + q), G_QUOTE, p.rim,
                rim * (0.62 - 0.44 * q / qn), nearer(dist));
        }

        /* THE ACCENT — at most one per figure, and only about one figure in six carries one. */
        if (p.acc && tallRows > 4) {
          if (p.acc === 1) {
            /* LED piping down one seam. This is the ONE place a narrow accent is licensed to
             * appear on a person, which is the reason the tall technical shell exists as an
             * archetype at all: it gives the colour something to be a property OF. Dim at the top
             * and fading down, so it reads as a lit seam rather than as a strip light. */
            var al = fg(52, dist);
            if (al >= 5) {
              var qn2 = (tallRows * 0.40) | 0; if (qn2 > 8) qn2 = 8;
              var px2 = Math.round(cx - p.side * shw * 0.70);
              for (q = 0; q <= qn2; q++)
                put(frame, px2, Math.round(rHead + tallRows * 0.18) + q, G_PIPE, p.accHue,
                    al * (0.90 - 0.55 * q / (qn2 + 1)), nearer(dist));
            }
          } else if (p.acc === 2) {
            /* A courier's reflective strip across the pack. Ice, which is the swatch's actual job
             * — a GLINT, two cells, never a surface. */
            var al2 = fg(165, dist);
            if (al2 >= 5) {
              var bx = Math.round(cx + p.side * shw * (1 + A.pack * 0.7));
              put(frame, bx, Math.round(rHead + tallRows * 0.30), G_DASH, P.ice, al2, nearer(dist));
              if (tallRows > 9)
                put(frame, bx - p.side, Math.round(rHead + tallRows * 0.30), G_DOT, P.ice,
                    al2 * 0.45, nearer(dist));
            }
          } else if (p.acc === 3) {
            /* A cigarette. One ember cell at the mouth, breathing on the figure's own phase so no
             * two pulse together, and frozen flat under reduced motion. */
            var glow = CC.reducedMotion ? 0.72
                     : 0.55 + 0.45 * vnoise(t * 0.7 + p.phase * 3, S + 47);
            var al3 = fg(120 * glow, dist);
            if (al3 >= 5)
              put(frame, Math.round(cx + p.side * shw * 0.55),
                  Math.round(rHead + tallRows * 0.10), G_DOT, P.ember, al3, nearer(dist));
          } else {
            /* Something carried and lit — a takeaway bag, a paper lantern, a lit sign held low.
             * It swings with the arm, which is why it needs the stride and not a clock. */
            var al4 = fg(128, dist);
            if (al4 >= 5) {
              var hx2 = Math.round(cx + p.side * shw * (0.85 + st * 0.22));
              var hy2 = Math.round(rHead + tallRows * (0.56 + st * 0.03));
              put(frame, hx2, hy2, G_STAR, p.accHue, al4, nearer(dist));
              if (tallRows > 11)
                put(frame, hx2, hy2 + 1, G_DOT, p.accHue, al4 * 0.40, nearer(dist));
            }
          }
        }

        /* THE UMBRELLA. A shallow arc over the head, wide enough to be a roof and no wider, drawn
         * as one cell per column so it never masses into a lit blob: the apex takes the light and
         * the ribs fall away from it. p.umb is the open fraction, so the canopy grows out of the
         * head over three or four seconds rather than appearing. */
        if (p.umb > 0.03 && tallRows > 3.5) {
          var ru = shw * 2.0 * p.umb;
          if (ru < 1) ru = 1;
          var ruI = ru | 0;
          var rApex = rHead - tallRows * (0.07 + 0.08 * p.umb);
          for (q = -ruI; q <= ruI; q++) {
            var f2 = q / ru;
            var ul = rim * (0.46 - 0.30 * f2 * f2) * (0.5 + 0.5 * p.umb);
            put(frame, Math.round(cx) + q, Math.round(rApex + f2 * f2 * tallRows * 0.17),
                (q === -ruI || q === ruI) ? G_TICK : G_DASH, p.rim, ul, nearer(dist));
          }
          /* The shaft, and only the stretch between the canopy and the crown: below that it runs
           * inside a cut-out that is already black, so drawing it again would cost and show
           * nothing. */
          bar(frame, Math.round(cx), rApex + 1, rHead - 1, 0, P.shadow, 0, nearer(dist));
        }

        /* Reflected in the wet road under the feet, smeared toward the eye. This does more work
         * than the figure itself: it is the only part of a pedestrian that lands in the empty
         * black road rather than in the busy band at the horizon, where a 1.7 m head seen from a
         * 1.7 m eye always sits. Falls off fast — a reflection never out-reads its source.
         * How far it runs is now the road's business: wrel('wet') is 1.0 under the preset this was
         * tuned as, so a rainy street keeps exactly the four rows it always had, a dry one gets
         * one, and an umbrella keeps a patch of road dry under itself. */
        var rn = 1 + ((wetR * 3.4) | 0); if (rn > 5) rn = 5;
        var dry = 1 - 0.55 * p.umb;
        for (var rj = 1; rj <= rn; rj++) {
          var rr = Math.round(rFeet) + rj, rd = roadDist(rr, pr.sp);
          var rl2 = fg(rim * (0.52 - rj * 0.11) * (0.55 + 0.45 * wetR) * dry, rd);
          if (rl2 < 5) break;
          put(frame, Math.round(cx), rr, rj < 3 ? G_QUOTE : G_DOT, p.rim, rl2, near(rd));
        }
        if (p.phone >= 0 && tallRows > 3.2) {
          var pl = fg(150, dist);
          if (pl >= 5)
            put(frame, Math.round(cx - p.side * shw * 0.6),
                Math.round(rHead + tallRows * 0.40), G_DOT, p.phone, pl, nearer(dist));
        }
      }
    }
  });

  /* =============================================================================================
   * A CAT — layer 21
   * Dormant most of the time. The body is a cut-out that mostly disappears into the road; the
   * eye-shine is the whole element, and it is two cells at most.
   * ============================================================================================ */
  var cat = null;

  CC.ELEMENTS.push({
    name: 'cat',
    layer: 21,
    init: function (city, rng) {
      this.city = city;
      this.seed = (rng() * 2147483647) | 0;
      cat = { x: 0, z: 0, vx: 0, vz: 0, live: 0, wait: 5, n: 0, len: 0.5, side: 1 };
    },
    update: function (dt, t, cam) {
      camBasis(cam);
      corridor(this.city, cam);
      var S = this.seed, k = CC.reducedMotion ? 0.10 : 1, rain = wp().rain;
      if (cat.live) {
        cat.x += cat.vx * dt * k; cat.z += cat.vz * dt * k;
        var pr = project(cat.x, cat.z);
        var l = COR.axis ? cat.z - COR.ctr : cat.x - COR.ctr;
        if (l < 0) l = -l;
        if (!pr.ok || pr.w > 48 || l > COR.half + 0.9) {
          cat.live = 0;
          /* Long gaps. A cat every few seconds is a rat problem, not an atmosphere. And a cat in
           * a downpour is a cat under a parked van: the gap stretches by up to two and a half
           * times, which is the difference between a wet night that happens to have a cat in it
           * and one that has the same cat in it as a dry one. */
          cat.wait = (19 + hash2(0, cat.n, S ^ 0x11) * 26) * (1 + 1.5 * rain);
        }
        return;
      }
      /* Damped by k, unlike the pedestrians' respawn above: what ends a cat's crossing is the
       * cat's own legs, and those ARE slowed by k. Leaving the timer at full speed while the
       * crossing crawls is what puts a permanent cat in a reduced-motion frame. */
      cat.wait -= dt * k;
      if (cat.wait > 0) return;
      cat.n++;
      var h1 = hash2(1, cat.n, S), h2 = hash2(2, cat.n, S), h3 = hash2(3, cat.n, S);
      cat.side = h2 < 0.5 ? -1 : 1;
      /* Out at 34–42 m and 0.9 m BEHIND the building line, so the frontage the raycaster already
       * painted owns those cells and the cat walks out from under it. It used to start at 9–22 m
       * and half a metre in, which on any block with a gap in the frontage put a lit pair of eyes
       * on screen out of nothing. */
      var a = COR.along + COR.dir * (34 + h1 * 8);
      var l0 = -cat.side * (COR.half + 0.9);
      cat.x = worldX(a, l0); cat.z = worldZ(a, l0);
      /* It crosses the corridor, so its velocity is purely lateral. Halved from the old sprint:
       * from 34 m the walk needs a few seconds to bring the crossing inside the draw, and a cat
       * that has already reached the far kerb by then is a cat nobody ever sees. It also simply
       * looks more like a cat — they saunter across a road and bolt only at the end. Except in the
       * rain, when the saunter is the first thing to go. */
      var sp = (1.05 + h3 * 0.75) * (1 + 0.55 * rain);
      cat.vx = COR.axis ? 0 : cat.side * sp;
      cat.vz = COR.axis ? cat.side * sp : 0;
      cat.len = 0.44 + h3 * 0.16;
      cat.live = 1;
    },
    draw: function (frame, cam, t) {
      if (!cat || !cat.live) return;
      camScreen(frame, cam);
      var pr = project(cat.x, cat.z);
      /* Past the 42 m end of the spawn range, so this cull never switches the eye-shine on: the
       * reveal is the frontage the cat steps out from, and after that the fog. */
      if (!pr.ok || pr.dist > 46) return;
      var w = pr.w, dist = pr.dist, d = near(dist), cx = pr.x;
      var hw = cat.len * 0.5 * CPM / w;
      if (hw < 0.5) hw = 0.5;
      var rGnd = rowOf(0, w), rBack = rowOf(0.26, w);
      var x, x0 = Math.round(cx - hw), x1 = Math.round(cx + hw);
      for (x = x0; x <= x1; x++) bar(frame, x, rBack, rGnd, 0, P.shadow, 0, d);
      /* Tail, kicked up behind: one cell, and it is what turns a smudge into an animal. */
      put(frame, Math.round(cx - cat.side * (hw + 1)), Math.round(rBack - 0.6), 0, P.shadow, 0, d);
      /* Tapetum. Spring green, and the one thing in this batch licensed to be bright — two dots
       * moving across a black road is the entire read. */
      var el = fg(198, dist);
      if (el < 6) return;
      var ex = Math.round(cx + cat.side * hw);
      put(frame, ex, Math.round(rBack), G_DOT, P.spring, el, nearer(dist));
      if (hw > 2.4)
        put(frame, ex - cat.side, Math.round(rBack), G_DOT, P.spring, el * 0.7, nearer(dist));
    }
  });

  /* =============================================================================================
   * GROUND TRAFFIC — layer 22
   * Cars are only ever seen crossing the intersections ahead, never coming down the camera's own
   * street: the walk goes down the middle of the carriageway and a car bearing down on the eye
   * would turn an ambient piece into an event. Occlusion is free — the depth test drops the body
   * the moment a corner building is in front of it, so a car only exists inside the slot.
   * ============================================================================================ */
  var cars = null, CAR_N = 2;

  /* An intersection 14–58 m ahead, picked by a 0..1 hash. Counted then re-walked rather than
   * collected, because an element may not allocate. */
  function crossAhead(city, pick) {
    if (!city || !city.aveX) return NaN;
    var period = COR.axis ? city.AVE : city.CROSS;
    var i0 = Math.round(COR.along / period), i, c, dd, cnt = 0, want;
    for (i = i0 - 4; i <= i0 + 4; i++) {
      c = (COR.axis ? city.aveX(i) : city.crossZ(i)) + 0.5;
      dd = (c - COR.along) * COR.dir;
      if (dd >= 14 && dd <= 58) cnt++;
    }
    if (!cnt) return NaN;
    want = (pick * cnt) | 0; if (want >= cnt) want = cnt - 1;
    for (i = i0 - 4; i <= i0 + 4; i++) {
      c = (COR.axis ? city.aveX(i) : city.crossZ(i)) + 0.5;
      dd = (c - COR.along) * COR.dir;
      if (dd >= 14 && dd <= 58) { if (want === 0) return c; want--; }
    }
    return NaN;
  }
  function crossHalf(city, c) {
    if (!city || !city.aveX) return 2.0;
    var period = COR.axis ? city.AVE : city.CROSS;
    var i = Math.round((c - 0.5) / period);
    return (COR.axis ? city.aveW(i) : city.crossW(i)) + 0.5;
  }

  CC.ELEMENTS.push({
    name: 'traffic',
    layer: 22,
    init: function (city, rng) {
      this.city = city;
      this.seed = (rng() * 2147483647) | 0;
      cars = new Array(CAR_N);
      for (var i = 0; i < CAR_N; i++)
        cars[i] = { x: 0, z: 0, vx: 0, vz: 0, live: 0, wait: 1.5 + i * 6, n: i * 53,
                    len: 4.2, tall: 1.4, go: 1, tail: P.red };
    },
    update: function (dt, t, cam) {
      var city = this.city;
      camBasis(cam);
      corridor(city, cam);
      var S = this.seed, k = CC.reducedMotion ? 0.08 : 1, i;
      for (i = 0; i < CAR_N; i++) {
        var c = cars[i];
        if (c.live) {
          c.x += c.vx * dt * k; c.z += c.vz * dt * k;
          var pr = project(c.x, c.z);
          var l = COR.axis ? c.z - COR.ctr : c.x - COR.ctr;
          /* Retired well past the far building line — the depth test has been hiding it for
           * several metres by then, so nothing pops out of existence on screen. */
          if (!pr.ok || pr.w > 70 || l * c.go > COR.half + 11) {
            c.live = 0;
            c.wait = 3.5 + hash2(i, c.n, S ^ 0x4D) * 11;
          }
          continue;
        }
        /* THE GAP IS DAMPED BY THE SAME k AS THE CROSSING, and that is a reduced-motion FIX, not a
         * flourish. A crossing takes 26 m at 8% of 8–15 m/s, so a car that used to be on screen
         * for two seconds in every eight was on it for thirty out of every eight — a headlamp at
         * lum 240 and a six-cell sodium beam parked in the intersection essentially permanently,
         * and the whole frame's luminance stepping up and down around it on a slow cycle it never
         * has at normal speed. Motion damped without its own timer damped does not calm a frame;
         * it changes what is in it. */
        c.wait -= dt * k;
        if (c.wait > 0) continue;
        c.n++;
        var h1 = hash2(i, c.n, S), h2 = hash2(i, c.n, S ^ 0x21), h3 = hash2(i, c.n, S ^ 0x8F);
        var ca = crossAhead(city, h1);
        if (ca !== ca) { c.wait = 2.5; continue; }    // nothing crossing in range; look again soon
        var ch = crossHalf(city, ca);
        c.go = h2 < 0.5 ? -1 : 1;
        /* Lane offset opposed to the direction of travel, so the two slots never share a line. */
        var a = ca + (ch > 1.6 ? 0.55 + h3 * (ch - 1.2) : 0) * -c.go;
        var l0 = -c.go * (COR.half + 10);
        c.x = worldX(a, l0); c.z = worldZ(a, l0);
        var sp = 8 + h3 * 7;
        c.vx = COR.axis ? 0 : c.go * sp;
        c.vz = COR.axis ? c.go * sp : 0;
        c.len = 3.6 + h1 * 1.7;
        c.tall = 1.25 + h2 * 0.35;
        c.tail = h3 < 0.82 ? P.red : P.ember;
        c.live = 1;
      }
    },
    draw: function (frame, cam, t) {
      camScreen(frame, cam);
      var i, j;
      /* The road's wetness, read reference-relative: 1.0 is the preset every constant below was
       * tuned under, so a rainy crossing looks exactly as it always did and only a dry or a
       * drowned one moves. */
      var wetR = wrel('wet');
      for (i = 0; i < CAR_N; i++) {
        var c = cars[i];
        if (!c.live) continue;
        /* Nose and tail as world points, then sampled between them: the car is broadside to the
         * view, so its two ends can be many metres apart in DEPTH at a near intersection and a
         * single projected centre would shear the whole body. */
        var half = c.len * 0.5;
        var nx = c.x + (c.vx > 0 ? half : (c.vx < 0 ? -half : 0));
        var nz = c.z + (c.vz > 0 ? half : (c.vz < 0 ? -half : 0));
        var tx = c.x * 2 - nx, tz = c.z * 2 - nz;

        /* PJ is shared scratch: read each projection out before taking the next. */
        var pn = project(nx, nz); if (!pn.ok) continue;
        var xn = pn.x, wn = pn.w, dn = pn.dist;
        var pt = project(tx, tz); if (!pt.ok) continue;
        var xt = pt.x, wt = pt.w, dtl = pt.dist, spt = pt.sp;
        if (dn > 72 && dtl > 72) continue;

        var span = xn - xt; if (span < 0) span = -span;
        var ns = (span + 2) | 0; if (ns < 4) ns = 4; if (ns > 72) ns = 72;
        for (j = 0; j <= ns; j++) {
          var s = j / ns;
          var ps = project(tx + (nx - tx) * s, tz + (nz - tz) * s);
          if (!ps.ok) continue;
          var sd = near(ps.dist);
          var rB = rowOf(0.06, ps.w), rT = rowOf(c.tall, ps.w);
          /* The cabin is set back from both ends. At this size that step is the only thing that
           * says car rather than skip. */
          var cab = s > 0.28 && s < 0.74;
          if (cab) rT = rowOf(c.tall + 0.34, ps.w);
          bar(frame, Math.round(ps.x), rT, rB, 0, P.shadow, 0, sd);
          /* THE ROOFLINE AND THE SILL, which are what turn the body from a hole in the road into a
           * car. Measured over the canonical sweep the element blanked 89 to 140 cells to paint 8
           * to 10, all of them lamps: a black bar sliding across a black street with two sparks on
           * it, and the step up over the cabin — the one piece of shape this thing has — printed
           * nowhere at all. The pedestrians beside it have solved this since they were written; a
           * cut-out is only a silhouette if SOMETHING lights its edge.
           *
           * Sodium, because that is what is over an intersection, and the beam this element throws
           * on the tarmac a few lines down is already amber for the same reason. Kept well under
           * the headlamp: a roof is a reflection and a lamp is a lamp, and if the two arrive at the
           * same brightness the car stops having a front. The ends are dimmer than the cabin so the
           * line reads as a roof falling away to a bonnet rather than as a bar. */
          var rfl = fg(cab ? 58 : 42, ps.dist);
          if (rfl >= 5)
            put(frame, Math.round(ps.x), Math.round(rT), G_DASH, P.amber, rfl, nearer(ps.dist));
          /* The sill catches the road's own sheen rather than the lamp, so it is dimmer still and
           * it grows with the wet — on a dry night there is nothing down there to catch. */
          var sll = fg(30 * (0.45 + 0.55 * wetR), ps.dist);
          if (sll >= 5)
            put(frame, Math.round(ps.x), Math.round(rB) - 1, G_UNDER, P.amber, sll, nearer(ps.dist));
          /* Glazing: a dim azure dash along the cabin. Interior light, not a lamp. */
          if (s > 0.30 && s < 0.72 && ps.dist < 42 && (j & 1) === 0) {
            var gl = fg(54, ps.dist);
            if (gl >= 5)
              put(frame, Math.round(ps.x), Math.round(rT + 1), G_DASH, P.azure, gl, nearer(ps.dist));
          }
        }

        /* Head and tail lamps: the point of the whole element. Both are drawn as short horizontal
         * SMEARS trailing the direction of travel, not as points — at 12 m/s a lamp is a streak to
         * the eye, and one isolated bright cell in a black intersection reads as a stuck pixel
         * rather than as something moving. Two or three cells is all it takes. */
        var back = xn > xt ? -1 : 1;                  // screen direction opposite the travel
        var hl = fg(240, dn), tl = fg(196, dtl);
        var rHl = Math.round(rowOf(0.62, wn)), rTl = Math.round(rowOf(0.78, wt));
        if (hl >= 5) {
          put(frame, Math.round(xn), rHl, G_0, P.ice, hl, nearer(dn));
          put(frame, Math.round(xn) + back, rHl, G_o, P.ice, hl * 0.46, nearer(dn));
          put(frame, Math.round(xn) + back * 2, rHl, G_DOT, P.ice, hl * 0.20, nearer(dn));
          put(frame, Math.round(xn), rHl + 1, G_DOT, P.ice, hl * 0.34, nearer(dn));
          /* The bloom on a wet road. Extra CELLS, never extra lum: fg(240) is already at the top
           * of the scale and the print's shoulder is what would eat any further gain, so pushing
           * the number only flattens the lamp. Two dim cells either side is what a wet windscreen
           * actually does to a light. */
          if (wetR > 0.80) {
            var bw = hl * 0.16 * wetR;
            put(frame, Math.round(xn) + back * 3, rHl, G_DOT, P.ice, bw, nearer(dn));
            put(frame, Math.round(xn) - back, rHl, G_DOT, P.ice, bw * 1.2, nearer(dn));
          }
        }
        if (tl >= 5) {
          put(frame, Math.round(xt), rTl, G_o, c.tail, tl, nearer(dtl));
          put(frame, Math.round(xt) + back, rTl, G_DOT, c.tail, tl * 0.44, nearer(dtl));
          if (span > 8)
            put(frame, Math.round(xt) - back, rTl, G_DOT, c.tail, tl * 0.34, nearer(dtl));
        }

        /* The beam on the tarmac ahead of the nose — this is the "streak" the crossing actually
         * reads as. Sodium-tinted, because it is landing on a sodium-lit road, and it reaches
         * further the wetter that road is: six steps under the preset this was tuned as, four on
         * a dry one, where a beam has nothing to lie on. */
        if (dn < 46) {
          var bn = 4 + ((wetR * 2.4) | 0); if (bn > 8) bn = 8;
          var ux = c.vx === 0 ? 0 : (c.vx > 0 ? 1 : -1), uz = c.vz === 0 ? 0 : (c.vz > 0 ? 1 : -1);
          for (j = 1; j <= bn; j++) {
            var bp = project(nx + ux * (1.1 + j * 1.35), nz + uz * (1.1 + j * 1.35));
            if (!bp.ok) continue;
            var bl = fg(120 * (1 - j / (bn + 1.5)), bp.dist);
            if (bl < 5) continue;
            put(frame, Math.round(bp.x), Math.round(rowOf(0.02, bp.w)),
                j < 3 ? G_EQ : G_DASH, P.amber, bl, near(bp.dist));
          }
          /* Tail lamps in the wet road, at the TARMAC's depth — the road under the car's skirt is
           * nearer than the car, so the lamp's own distance would lose the test outright. Kept
           * well under the lamp itself: a reflection that competes with its source stops looking
           * like water. It runs longer as the road gets wetter, which is the one place in this
           * element where the weather is meant to be legible rather than merely correct. */
          var tn = 1 + ((wetR * 2.2) | 0); if (tn > 4) tn = 4;
          var rr0 = Math.round(rowOf(0, wt)) + 1;
          for (j = 0; j < tn; j++) {
            var rrd = roadDist(rr0 + j, spt);
            var rl = fg((70 - j * 22) * (0.55 + 0.45 * wetR), rrd);
            if (rl >= 5) put(frame, Math.round(xt), rr0 + j, G_QUOTE, c.tail, rl, near(rrd));
          }
        }
      }
    }
  });

  /* =============================================================================================
   * LITTER — layer 24
   * Fourteen single cells whose job is to make the wind visible. Dim, mostly scraping the ground,
   * and brightening only when one lifts far enough to catch a streetlamp.
   * ============================================================================================ */
  var bits = null, BIT_N = 18;

  function bitSpawn(b, i, S, fresh) {
    b.n++;
    var h1 = hash2(i, b.n, S), h2 = hash2(i, b.n, S ^ 0x2F), h3 = hash2(i, b.n, S ^ 0x5C);
    /* Respawned CLOSE, because the wind blows them away from the camera faster than the walk
     * follows: seeded at the far cull they spent their whole life past 30 m, where fog has them
     * at four or five lum and half the pool was invisible. */
    var a = COR.along + COR.dir * (fresh ? 3 + h1 * 20 : 8 + h1 * 16);
    var l = (h2 * 2 - 1) * COR.half * 0.94;
    b.x = worldX(a, l); b.z = worldZ(a, l);
    b.lift = h3 < 0.55 ? 0.05 + h3 * 0.35 : 0.40 + h3 * 1.10;   // most never leave the tarmac
    b.ph = h1 * 6.283;
    b.rate = 0.8 + h2 * 1.9;
    b.hue = h3 < 0.62 ? P.slate : (h3 < 0.87 ? P.white : P.amber);
    b.gl = PAPER[(h1 * PAPER_N) | 0];
  }

  CC.ELEMENTS.push({
    name: 'litter',
    layer: 24,
    init: function (city, rng) {
      this.city = city;
      this.seed = (rng() * 2147483647) | 0;
      this.boot = 0;
      bits = new Array(BIT_N);
      for (var i = 0; i < BIT_N; i++)
        bits[i] = { x: 0, z: 0, n: i * 17 + 3, lift: 0.2, ph: 0, rate: 1, y: 0.05,
                    hue: P.slate, gl: G_QUOTE };
    },
    update: function (dt, t, cam) {
      camBasis(cam);
      corridor(this.city, cam);
      var S = this.seed, i, b;
      if (!this.boot) { this.boot = 1; for (i = 0; i < BIT_N; i++) bitSpawn(bits[i], i, S, 1); }
      var k = CC.reducedMotion ? 0.12 : 1;
      /* One gust field for the whole street, so every scrap moves together — that shared motion is
       * the only reason a handful of dots reads as wind and not as insects. Its strength is the
       * wind's, read reference-relative so a rainy night blows exactly as hard as it always did
       * and a still one barely stirs. */
      var wR = wrel('wind');
      /* The along-street push rides weather.js's shared gust envelope (CC.Wind.mult, mean 1 by
       * construction) rather than a private vnoise. A scrap of paper skating up the street while
       * the rain curtain was leaning the other way was the most visible symptom of every element
       * rolling its own wind, and it is exactly what the exported vector exists to stop.
       * 1.30 is the old expression's mean — (0.35 + 0.5*1.9) — so the average drift rate at the
       * reference sky is unchanged; only the phase, and the fact that it is now the city's phase,
       * has moved. The fallback keeps the file standing in a harness that loads no weather.
       * The LATERAL swirl below keeps its own noise on purpose: it is the cross-street component,
       * which is turbulence around the buildings and not the wind itself. */
      var wmult = CC.Wind ? CC.Wind.mult : (0.27 + vnoise(t * 0.31, S ^ 0x77) * 1.46);
      var gust = 1.30 * wmult * (0.35 + 0.65 * wR);
      var swirl = (vnoise(t * 0.24 + 11, S ^ 0x9A) - 0.5) * 1.4 * (0.35 + 0.65 * wR);
      for (i = 0; i < BIT_N; i++) {
        b = bits[i];
        b.ph += dt * b.rate * k;
        /* Height is derived from the phase, not integrated: a scrap bouncing off an accumulated
         * velocity walks out of the street after a few thousand frames of catch-up. */
        b.y = 0.04 + b.lift * (0.5 - 0.5 * Math.cos(b.ph)) * (CC.reducedMotion ? 0.3 : 1);
        var along = gust * (0.6 + b.lift), lat = swirl * b.lift;
        b.x += (COR.axis ? COR.dir * along : lat) * dt * k;
        b.z += (COR.axis ? lat : COR.dir * along) * dt * k;
        var pr = project(b.x, b.z);
        if (!pr.ok || pr.w > 30 || pr.sp > HP * 1.6 || pr.sp < -HP * 1.6) bitSpawn(b, i, S, 0);
      }
    },
    draw: function (frame, cam, t) {
      camScreen(frame, cam);
      for (var i = 0; i < BIT_N; i++) {
        var b = bits[i];
        var pr = project(b.x, b.z);
        if (!pr.ok || pr.dist > 32) continue;
        /* A lifted scrap catches the streetlight and a scraping one does not; that contrast IS the
         * animation. Capped low — this must never outshine the kerb it blows past. */
        var lum = fg(18 + clamp(b.y / (b.lift + 0.05), 0, 1) * 48, pr.dist);
        if (lum < 5) continue;
        put(frame, Math.round(pr.x), Math.round(rowOf(b.y, pr.w)), b.gl, b.hue, lum,
            near(pr.dist));
      }
    }
  });

})(typeof CC !== 'undefined' ? CC : require('../core.js'));
if (typeof module !== 'undefined')
  module.exports = (typeof CC !== 'undefined' ? CC : require('../core.js')).ELEMENTS;
