/* CyberCity signage — everything the street lights itself with.
 *
 * Four ambient systems, four ELEMENTS entries: shop-window spill on the pavement, neon mounted on
 * facades, traffic signals at the junctions, holographic adverts hung mid-canyon.
 *
 * Placement is NOT a spawn list. The walk is endless, so every fixture is a pure function of the
 * world cell (or of the street-lattice index) it hangs on: nothing is allocated, nothing is
 * recycled, and scrubbing time backwards puts every sign back exactly where it was. The cost of
 * that is a bounded scan of the cells around the camera each frame, which is why every scan below
 * rejects on the cheap forward-distance dot product before it touches a hash or the heightmap.
 *
 * THE VOCABULARY. `neon` used to have two shapes — a stack of characters down a corner and a row
 * of them over a door — which is not a city, it is a texture applied to one. It now has twelve
 * STYLES, each with its own construction, its own animation and its own way of failing, chosen per
 * lot by a weighted roll off the district so a concrete quarter is full of half-dead boards and the
 * arcade strip is full of chase borders and character blocks. They are listed at S_TUBE below.
 * The one that carries the most weight in the references is S_BLOCK, the stacked square clusters
 * that read as a language: it is the difference between "signs" and "this city has writing on it".
 *
 * HOW BIG A SIGN ACTUALLY IS, which is the thing that decides whether any of that vocabulary
 * reaches the viewer. Instrumented over the canonical sweep (seeds 3/7/42/99 x frames
 * 600/3000/9000/18000 at 400x100, through the real harness — the frame checksum of the
 * instrumented render matches tools/headless.cjs cell for cell): 125 fixtures land, 7.8 a frame,
 * 281 cells a frame, 0.70% of the picture. The MEDIAN fixture is 3.1 screen columns wide at 30 m
 * and 72% of them are under 8 columns. All twelve styles appear, and most of them had nowhere to
 * happen, in two separate ways that were both being blamed on the constructions:
 *
 *   1. THE GRID WAS FINER THAN THE SCREEN. A fixture's character grid is fixed in the world at up
 *      to 9 columns, and the shader is point-sampled once per screen column, so at 3 columns two
 *      grid columns in three are never asked about — 52% of all fixtures had a grid at least twice
 *      as fine as their own footprint. Which columns survived was a function of where the board's
 *      edge fell between two cells, so a hollow tube printed as an L, a chase border lost a side,
 *      and a character block lost the gaps that made it characters. board() now coarsens the drawn
 *      grid to what the screen can sample (52% -> 11% undersampled) while shade() keeps every
 *      letterform, brightness jitter and screen-noise lookup indexed in the WORLD grid, so the
 *      construction gets coarser on approach and the writing does not reshuffle.
 *   2. BELOW A CERTAIN SIZE THERE IS NO CONSTRUCTION, only its ink — four or five loose marks in
 *      the two pillar hues, drawn from the same glyph bank the window lattice behind them is drawn
 *      from, at the wall's own brightness. So under MIN_C x MIN_R a fixture crossfades into its own
 *      MASS: the case fills the cells the construction leaves dark and everything converges on one
 *      level, which is what a real sign reduces to at distance and the one property shared by every
 *      style the craft review found legible. Measured on the printed frame as the largest connected
 *      run of the fixture's own cells at v>=60: median 10 -> 12 cells, mean 15.7 -> 18.5, and the
 *      styles that read worst gained most (chase 8 -> 16, screen 4 -> 10, block 8 -> 13, tube
 *      11 -> 13.5) while the ones that already read are untouched by construction (marquee 9 -> 10).
 *      The crossfade is over two cells of span rather than a threshold, because the quantity it
 *      keys on is one the walk changes continuously; and since the mass level is a constant, the
 *      blend can only REDUCE a cell's temporal amplitude — measured, tools/flicker-rate.cjs returns
 *      exactly the same worst per-cell step for `neon` before and after, 15.3/13.3/17.3/19.6% on
 *      seeds 0/7/42/555, on 15% more painted cells.
 *
 * The bill for both: 281 -> 337 cells a frame, 0.70% -> 0.84% of the picture, almost all of it
 * dark case rather than light. Over the same 16 frames the printed palette does not move — amber
 * 22.59% -> 22.58% of lit energy, azure 24.91% -> 24.88%, black 44.02% -> 43.98%.
 *
 * WHAT A SIGN LIGHTS. A sign is a light source, and until this pass it lit nothing — it was a
 * bright decal on a wall that stayed exactly as dark as the wall next door. Every fixture now
 * casts (castGlow), and the cast is deliberately a MODULATION of cells that are already painted
 * rather than new marks: the wall it is bolted to, the pavement under it, the awning over the
 * stall in front, the rain falling through it and the near edge of whoever is walking past all
 * arrive in the frame before layer 30 does, so lighting them costs energy and almost no coverage.
 * That is the whole trick, and it is why the budget below barely moved for the largest visible
 * change in the file.
 *
 * WET REFLECTION. As the road wets, every fixture smears down it toward the viewer (wetSmear) at
 * the fixture's own screen column, in the fixture's own colour. surfaces.js owns the road's general
 * wetness and its anonymous streaking; this owns the reflection OF A NAMED SIGN, which is the one
 * thing a generic road texture cannot know about.
 *
 * PHOTOSENSITIVITY IS A CEILING, NOT A PREFERENCE. Nothing here flashes above 3 Hz and no cell may
 * move more than a third of full scale in one frame. Every travelling crest in this file is a
 * smoothstep PLATEAU rather than a threshold, for the reason spelled out at the holo scan band; the
 * one deliberate strobe (S_FAIL) is a 2.2 Hz sine of amplitude 0.28, whose worst frame is 6.4% of
 * full scale; the ticker changes GLYPH and not luminance, so its 2 Hz step is a shape change and
 * not a luminance edge at all.
 *
 * tools/flicker-rate.cjs is the judge and it says PASS, but read what it actually covers: part 1
 * lifts flick() out of this file, and part 2 drives the real elements over four seeds and eight
 * bearings. Neither one knows the styles exist. So each style was ALSO forced city-wide on its own
 * and measured — worst per-cell frame step, and the strongest 3-20 Hz component of the forty
 * busiest cells over 24 s, Hann windowed exactly the way the tool does it:
 *
 *   tube 23.1%/1.47%   blade 23.9%/1.45%   chase 17.6%/0.29%   wipe 25.1%/1.45%
 *   ticker 0.0%/0.00%  block 22.7%/1.46%   flap 2.7%/0.32%     fail 3.1%/0.04%
 *   backlit 0.0%/0.00% arrow 3.9%/0.28%    screen 1.2%/0.03%   marquee 27.5%/1.78%
 *
 * Every one is inside the 34% step and 2% band limits. The 3.79 Hz line the lit styles all carry is
 * flick()'s failing starter and nothing else — it is the same line part 1 reports at 1.06% on the
 * multiplier. Three of those numbers are the record of a bug this pass introduced and fixed, and
 * the fixes are written up where they live: the visibility cut in board(), the smear gate under it,
 * and the screen's black level. Compared like for like against the file this replaced, on the same
 * measurement: worst per-cell step 18.8% against 26.3%, strongest 3-20 Hz 1.14% against 1.75%.
 *
 * Coverage budget, measured by rendering seeds 3/7/42/99 at frames 600/3000/9000 at 400x100 with
 * the four elements drawn and again with them skipped — the same process and the same rng draw
 * either way, or the elements downstream re-roll and a third of the frame changes for reasons that
 * have nothing to do with signage: signage owns 1.74% of cells (the file it replaces: 1.05%) and
 * adds 0.29 points of lit coverage (0.33). It touches two thirds again as many cells for LESS new
 * light, which is the cast doing exactly what it was built to do. Lit energy over those twelve
 * frames with signage in: amber 27.4%, azure 24.0% against 27.6%/23.7% without it — the two pillars
 * level and unmoved — ember 2.0%, spring 0.7%, violet under 0.05%. That is the whole point: the
 * references are 54-60% pure black and signage is the one thing in frame allowed to be truly
 * bright, so it has to stay small or it stops reading as bright at all.
 */
(function (CC) {
  'use strict';

  var P = CC.P, g = CC.g, hash2 = CC.hash2, vnoise = CC.vnoise, clamp = CC.clamp, put = CC.put;

  var G_HASH = g('#'), G_8 = g('8'), G_0 = g('0'), G_O = g('O'), G_oo = g('o'),
      G_X = g('X'), G_Z = g('Z'), G_EQ = g('='), G_COLON = g(':'), G_DOT = g('.'),
      G_QUOTE = g("'"), G_DASH = g('-'), G_COMMA = g(',');
  /* The second bank, for the styles that need a letterform rather than a lamp: the dense square
   * glyphs a character block is built out of, the arrow head, the tube's vertical leg. */
  var G_PIPE = g('|'), G_V = g('V'), G_M = g('M'), G_W = g('W'), G_N = g('N'),
      G_H = g('H'), G_U = g('U'), G_K = g('K'), G_Y = g('Y'), G_Q = g('Q'),
      G_AT = g('@'), G_PCT = g('%'), G_PLUS = g('+'), G_STAR = g('*'), G_SEMI = g(';');

  /* Blocky only. A neon tube at this resolution is a solid mark; anything with holes in it
   * (& $ ? %) dithers into noise and stops reading as a lit object. */
  var NEON_G = [G_HASH, G_8, G_0, G_X, G_O, G_Z, G_EQ], NEON_N = 7;
  var HOLO_G = [G_COLON, G_DASH, G_EQ, G_oo, G_Z, G_X], HOLO_N = 6;
  var SPILL_G = [G_DOT, G_COLON, G_QUOTE, G_COMMA], SPILL_N = 4;
  /* A character block is read by its MASS, not by which glyph it is: every entry here fills most
   * of its cell, so a 2x2 cluster of them prints as one dense square with a bit of internal
   * structure, which is exactly how a CJK signboard reads across a street. Anything lighter than
   * these (o, :, -) breaks the cluster back into separate marks and the read is gone. */
  var BLOCK_G = [G_HASH, G_8, G_M, G_W, G_N, G_H, G_U, G_K, G_Y, G_X, G_Q, G_0, G_AT], BLOCK_N = 13;
  /* The ticker is text you cannot resolve, so it wants VARIETY of width rather than mass. */
  var TICK_G = [G_EQ, G_DASH, G_COLON, G_PLUS, G_STAR, G_X, G_Z, G_oo, G_PCT, G_SEMI], TICK_N = 10;
  /* A luminance ramp, dark to bright. The screen style picks its glyph by how bright the cell
   * came out, which is the oldest trick in ASCII rendering and the reason a slow noise field
   * reads as video rather than as a rectangle of static. */
  var SCREEN_G = [G_DOT, G_COLON, G_oo, G_O, G_8, G_HASH], SCREEN_N = 6;

  /* surfaces.js is loaded before the elements directory in every path that matters, but a
   * standalone `require` of this file has no CC.Surf at all. Bind late, once. */
  var _fog = null;
  function passthrough(l) { return l; }
  function fog(l, d) {
    if (!_fog) _fog = (CC.Surf && CC.Surf.fog) || passthrough;
    return _fog(l, d);
  }

  /* ---- weather -------------------------------------------------------------------------------
   * rel(k) is the parameter divided by its value in the 'rain' preset, which is the preset every
   * constant in this file was tuned under, so each expression below is written to come out at
   * exactly 1.0 when rel() is 1 and the element renders the look that shipped. Multiplying by the
   * raw P.rain instead would silently re-tune the whole file to 65% of itself.
   * The guard is not defensive noise, but the reason it used to give here is no longer true and a
   * stale reason is worse than none. This comment claimed tools/flicker-rate.cjs deliberately does
   * NOT load weather_state.js, so the photosensitivity numbers were taken with CC.Weather absent.
   * That stopped being true when the director was wired in: flicker-rate.cjs and lightning-rate.cjs
   * both require src/weather_state.js now and PIN a preset (storm by default, --sky=... to choose),
   * for the reason flicker-rate.cjs writes out at its own load line — with CC.Weather absent every
   * rel() is 1, AT.gust comes out at exactly 1, and that trips the `AT.gust <= 1.02` guard which
   * switches the wind gutter off, so the tool guarding the 34% ceiling was measuring the one sky in
   * which the newest flicker source in this file does nothing at all. Anyone quoting "measured with
   * the weather absent" is quoting a run that no longer exists.
   * What the fallback still buys is tools/headless.cjs's promise to render whatever subset of src
   * exists: on a half-written tree with no weather module, `CC.Weather.rel(k)` would throw on the
   * first sign of the first frame, and instead every rel() returns 1 and this file draws the 'rain'
   * reference look it was tuned under. */
  function rel(k) { return CC.Weather ? CC.Weather.rel(k) : 1; }

  /* One object, filled once per element draw. Fog eats a sign's own luminance and hands it back as
   * halo — that is what fog IS, light taken off the source and smeared over everything near it —
   * so `dim` and `halo` move in opposite directions off the same parameter and a mist night is
   * soft glowing blobs where a clear night is hard bright marks. */
  var AT = { dim: 1, halo: 1, wet: 1, gust: 1 };
  function airPrep() {
    var f = rel('fog'), h = rel('haze');
    AT.dim  = clamp(1 - 0.17 * (f - 1) - 0.11 * (h - 1), 0.46, 1.14);
    AT.halo = clamp(1 + 0.42 * (f - 1) + 0.26 * (h - 1), 0.72, 2.10);
    AT.wet  = clamp(rel('wet'), 0, 1.30);
    AT.gust = clamp(1 + 0.60 * (rel('wind') - 1), 0.55, 1.90);
  }

  /* The wind gutter. A tube in a gale does not strobe, it BREATHES badly: the whole fixture sags
   * and comes back, together, because what is moving is the supply and not the glass.
   *
   * It is applied to the fixture's peak ONCE, outside flick(), and that separation is deliberate.
   * flick()'s failing-starter personality already sits at 32.5% of full scale in its worst frame,
   * measured; deepening THAT by the gust would push it over the 34% ceiling in a storm, which is
   * the one thing this file may not do. A separate 1.1 Hz carrier at 0.26 depth costs 0.6% of full
   * scale a frame at the strongest wind in the presets and cannot interact with the starter at all.
   * Frozen flat under reduced motion, like everything else here. */
  function gutter(t, ph) {
    if (CC.reducedMotion || AT.gust <= 1.02) return 1;
    /* THE CARRIER IS THE CITY'S WIND, not a private noise. weather.js publishes one gust envelope
     * that the rain slant, the litter, the banners and the washing all ride; a sign sagging on its
     * own 1.1 Hz noise sagged while the rain was falling straight, which reads as two unrelated
     * weathers on one screen. CC.Wind.mult is that envelope with a mean of 1, remapped here to
     * 0..1 across the range it actually occupies.
     *
     * The private noise is not deleted, it is demoted to a third of the signal: every fixture in
     * the street dropping by exactly the same fraction on exactly the same frame is its own kind
     * of wrong, and the residue is what gives each one its own slack in the supply.
     *
     * Both terms stay inside 0..1, so the depth of the gutter is bounded exactly as it was before
     * and tools/flicker-rate.cjs's 0.6%-of-full-scale reading still holds. */
    var shared = CC.Wind ? clamp((CC.Wind.mult - 0.70) / 0.60, 0, 1)
                         : vnoise(t * 1.1, 0x4C1);
    return 1 - 0.26 * (AT.gust - 1) *
               (0.65 * shared + 0.35 * vnoise(t * 1.1 + ph * 23, 0x4C1));
  }

  /* ---- projection ----------------------------------------------------------------------------
   * Must agree with raycast.js cell for cell or an element floats off its wall. Same planar
   * camera, same `scale` derivation (cam.scaleY is the escape hatch, not cam.scale — the harness
   * sets cam.scale to something the raycaster ignores), same radial distance w*|dir| so the depth
   * test in CC.put compares like with like. */
  var CO = { cols: 0, rows: 0, horizon: 0, hp: 0, scale: 1, eyeY: 1.7,
             ox: 0, oz: 0, fwx: 0, fwz: 1, rgx: 1, rgz: 0 };
  var VP = { x: 0, y: 0, w: 0, dist: 0 };

  function setCam(frame, cam) {
    CO.cols = frame.cols; CO.rows = frame.rows;
    CO.horizon = cam.horizon !== undefined ? cam.horizon : frame.rows * 0.56;
    CO.hp = Math.tan((cam.fov || 1.25) * 0.5);
    CO.scale = cam.scaleY !== undefined ? cam.scaleY
             : (frame.cols * (cam.cellAspect || 0.5625)) / (2 * CO.hp);
    CO.eyeY = cam.eyeY !== undefined ? cam.eyeY : 1.7;
    CO.ox = cam.x; CO.oz = cam.z;
    var yaw = cam.yaw || 0;
    CO.fwx = Math.sin(yaw); CO.fwz = Math.cos(yaw);
    CO.rgx = Math.cos(yaw); CO.rgz = -Math.sin(yaw);
  }

  function project(px, py, pz) {
    var rx = px - CO.ox, rz = pz - CO.oz;
    var w = rx * CO.fwx + rz * CO.fwz;
    if (w < 0.6) return false;                       // at or behind the lens
    var sp = (rx * CO.rgx + rz * CO.rgz) / w;
    /* Generous horizontal margin: a wide sign whose CENTRE is off-screen can still have half of
     * itself in view, and clipping it here would make it vanish a beat early at the frame edge. */
    if (sp < -CO.hp * 2 || sp > CO.hp * 2) return false;
    VP.x = (sp / CO.hp + 1) * 0.5 * CO.cols - 0.5;
    VP.y = CO.horizon - (py - CO.eyeY) * CO.scale / w;
    VP.w = w;
    VP.dist = w * Math.sqrt(1 + sp * sp);
    return true;
  }

  /* The same projection with no horizontal cull and its own output slot, because a board is drawn
   * from its two END points and one of them being off the side of the frame is not a reason to
   * drop the sign — it is the normal case for anything close. The cull is done once, on the
   * fixture's centre, by project() above. */
  var VA = { x: 0, y: 0, w: 0, dist: 0 }, VB = { x: 0, y: 0, w: 0, dist: 0 };
  function projInto(px, py, pz, O) {
    var rx = px - CO.ox, rz = pz - CO.oz;
    var w = rx * CO.fwx + rz * CO.fwz;
    if (w < 0.9) return false;
    var sp = (rx * CO.rgx + rz * CO.rgz) / w;
    O.x = (sp / CO.hp + 1) * 0.5 * CO.cols - 0.5;
    O.y = CO.horizon - (py - CO.eyeY) * CO.scale / w;
    O.w = w;
    O.dist = w * Math.sqrt(1 + sp * sp);
    return true;
  }

  /* Metres-across at distance w, converted to screen columns. Signs are sized in the world and
   * then clamped in cells, because a 0.4 m neon tube two metres from the eye is thirty columns
   * wide and a thirty-column bar of pure amber owns the entire frame. */
  function colsFor(m, w) { return (m / w / CO.hp) * CO.cols * 0.5; }

  /* A modulation pass has to rewrite a cell it did not author, and put() rejects an equal depth.
   * Shaving a part in ten thousand off the existing depth satisfies the test while leaving the
   * cell at effectively the same place in the queue. Sky carries Infinity, which has no
   * representable nudge and is how the rest of the pipeline recognises sky, so it is refused. */
  function nearer(d) {
    if (!(d < 1e30)) return -1;
    var n = d - d * 1e-4;
    return n < d ? n : -1;
  }

  /* ---- the wall the fixture hangs on ----------------------------------------------------------
   * A cell is a candidate only if it is built AND at least one of its four sides opens onto
   * street/alley/plaza. The dominant axis is tried first: that is the face turned towards the
   * camera, and mounting on the other one puts the sign inside the block. */
  var FACE = { nx: 0, nz: 0, fx: 0, fz: 0 };
  function faceOf(city, gx, gz, rx, rz) {
    var xFirst = (rx < 0 ? -rx : rx) > (rz < 0 ? -rz : rz);
    var i, nx, nz;
    for (i = 0; i < 2; i++) {
      if ((i === 0) === xFirst) {
        nx = rx > 0 ? -1 : 1; nz = 0;
      } else {
        nx = 0; nz = rz > 0 ? -1 : 1;
      }
      if (city.height(gx + nx, gz + nz) <= 0) {
        FACE.nx = nx; FACE.nz = nz;
        FACE.fx = gx + 0.5 + nx * 0.5; FACE.fz = gz + 0.5 + nz * 0.5;
        return true;
      }
    }
    return false;
  }

  /* ---- flicker personalities ------------------------------------------------------------------
   * Four, because a street where every tube behaves the same reads as a texture rather than as a
   * hundred separate failing objects. `j` is the character index down the sign so personality 2
   * can kill one glyph and only that glyph. Nothing here takes a camera term: a flicker keyed on
   * anything the walk changes makes the whole street boil as you move.
   *
   * tools/flicker-rate.cjs LIFTS THIS FUNCTION out of the source file by brace matching and runs
   * it with nothing but (CC, vnoise, clamp, hash2) in scope. Do not reach out of it for a module
   * helper: the measurement stops working and nothing tells you. */
  function flick(kind, ph, t, j, dead) {
    if (kind === 2 && j === dead) return 0.10;
    if (CC.reducedMotion) return 0.88;
    if (kind === 0) return 1;
    if (kind === 1) {
      /* A failing starter, NOT a strobe — and, since this line, not a step edge either.
       *
       * The cut before this one selected between two branches at b < 0.26. That reads as
       * continuous and is not: the low branch tops out at 0.30 + 0.5*0.26 = 0.430 and the high
       * branch opens at 0.84 + 0.16*0.26 = 0.882, so every crossing moved the tube 0.45 — 45% of
       * full scale — inside one 16 ms frame. Measured on that function: 50.3% worst frame, +135%
       * of the value it left, and a step over a third of full scale about twice a second.
       *
       * Two things were wrong, and CROSSFADING the branches only fixes one of them.
       *
       * The crossfade (below) removes the discontinuity, but a smoothstep 0.12 of noise-range
       * wide is not a ramp at 5.6 noise units a second: value noise moves up to 0.14 of its range
       * per frame there, so the window was crossed in one or two frames and the worst frame still
       * measured 49.0%. Widening the window is the obvious lever and it is the wrong one — it
       * turns the strike into a dimmer, which is exactly what this personality must not be.
       *
       * The second fault is the carrier. Round 2 halved 11.3 to 5.6 and reported the DROPOUT rate,
       * 1.0 a second, as the rate — but the modulation itself is at the noise rate, and 5.6 Hz is
       * inside the 3-20 Hz flash band this piece is built to stay out of. A DFT of the multiplier
       * found a coherent line sitting right on 5.60 Hz at 3.2% of full scale, and it stayed there
       * at every crossfade width, because it is the noise's own node grid and no amount of
       * smoothing the transfer curve moves it. Halving again to 2.8 puts the carrier under the
       * ceiling and takes the strike's per-frame travel with it.
       *
       * Both together, measured by tools/flicker-rate.cjs, which lifts this exact function out of
       * this file and samples it at 60 Hz over 90 s x 12 phases: worst frame 32.5% of full scale
       * (was 50.3%), never over a third, strongest 3-20 Hz component 0.81% (was 3.2% at 5.60 Hz).
       * The crossfade window is centred on the old 0.26 threshold and slowing the noise does not
       * move it, so the mean multiplier is 0.832 against the old 0.828: over 64 frames across four
       * seeds the whole element's summed luminance moved +1.5%, on 1.6% of the frame, and the
       * exposure the lead set is where he set it.
       *
       * It still reads as a starter: the tube gutters every two seconds or so — 0.48 dropouts a
       * second at 63% mean depth, floor 0.30, so it is never actually out, it just fails to
       * strike — and comes back in four to six frames, which is a snap and not a fade.
       *
       * The other three personalities are audited by the same tool: 0 (steady) and 2 (steady, one
       * dead character) do not move at all, and 3 is a 0.13 Hz breath whose worst frame is 0.2%. */
      var b = vnoise(t * 2.8 + ph * 17, 0x8117);
      var w = CC.smooth(clamp((b - 0.20) / 0.12, 0, 1));
      return (0.30 + 0.5 * b) * (1 - w) + (0.84 + 0.16 * b) * w;
    }
    if (kind === 2) return 0.97;
    return 0.66 + 0.34 * (0.5 + 0.5 * Math.sin(t * 0.8 + ph * 6.283));
  }

  /* A travelling crest, and the ONLY shape allowed to travel in this file. `d` is the signed
   * distance to the crest in whatever parameter it runs along, measured the short way round the
   * wrap; the answer is a flat-topped plateau `hold` wide falling to nothing by `hold + soft`.
   *
   * It is a profile rather than a test for the reason written out at the holo scan band: a hard
   * `Math.abs(d) < w` edge on a smooth sweep jumps every cell it crosses the full height of the
   * boost inside one frame, which on a bright sign cell is over 200 of 255 — the largest artefact
   * this file has ever shipped, invisible to every frame-level statistic because it is one cell
   * wide, and perfectly visible to somebody looking at that cell. Measuring the short way round
   * the wrap matters just as much: a crest that teleports from the end of the sign back to the
   * start is the same step edge in a different costume. */
  function crest(d, hold, soft) {
    d -= Math.floor(d);
    if (d > 0.5) d = 1 - d;
    return CC.smooth(clamp((hold + soft - d) / soft, 0, 1));
  }

  /* ---- decorrelated per-cell hashes ------------------------------------------------------------
   * hash2 folds its salt in as s*(2^31-1), which modulo 2^32 is nothing but (s&1)*2^31 - s. Two
   * salts differing by a small XOR therefore differ by a small CONSTANT inside the mixer, and the
   * avalanche does not hide it. Conditioning on one such hash landing in its low tail — exactly
   * what "is there a sign on this cell" does — drags every sibling hash into ITS low tail, and a
   * census of 360k cells came back 100% amber: one hue, one sign type, one flicker, city-wide.
   * So the varying term is the COORDINATE, which enters through a large odd multiplier and
   * decorrelates cleanly (measured: flat quartiles). Offsets stay under 5e6 because hash2
   * multiplies by 6.7e8 in double precision and the product must stay inside 2^53.
   * The same trap is waiting for anyone who derives two decisions from one cell here.
   * There are ten slots and the styles below want more than ten independent decisions per lot;
   * the extra streams come from OFFSETTING THE COORDINATE (hk(gx + 7, gz - 3, ...)), which is the
   * same escape and for the same reason — never from a second salt. */
  var HKX = [0, 104729, 611953, 1999993, 3391993, 4796027, 7919, 2750159, 4256233, 1299709];
  var HKZ = [0, 4256233, 1299709, 4796027, 611953, 2750159, 3391993, 104729, 7919, 1999993];
  function hk(a, b, salt, i) { return hash2(a + HKX[i], b + HKZ[i], salt); }

  function neonHue(r) {
    /* Two pillars carry it, two accents garnish it, and there is NO violet here. A violet tube
     * bloomed into exactly the hot magenta the references are built to avoid — it was, by some
     * distance, the loudest object in any frame that contained one. Violet survives in this file
     * on the holo panels alone, which is what "screens and signage only" actually buys you: a
     * dim translucent projection can carry it, a saturated glass tube on a near wall cannot. */
    return r < 0.34 ? P.amber : r < 0.68 ? P.azure : r < 0.80 ? P.warm
         : r < 0.90 ? P.ember : P.spring;
  }

  /* =============================================================================================
   * THE SIGN STYLES
   * Twelve constructions. Each is a shader over the fixture's own character grid — see shade() —
   * plus a geometry rule in setupSign() and a weight per district in STYLE_W.
   * ========================================================================================== */
  var S_TUBE = 0,      // hollow rectangle of tube, one corner segment out
      S_BLADE = 1,     // vertical banner projecting PERPENDICULAR from the facade, read edge-on
      S_CHASE = 2,     // lamps running round a marquee border
      S_WIPE = 3,      // a bar of light travelling across the face
      S_TICKER = 4,    // a band of scrolling glyph noise: text you cannot quite make out
      S_BLOCK = 5,     // stacked square character clusters — the CJK signboard read
      S_FLAP = 6,      // split-flap segments flicking between states
      S_FAIL = 7,      // one segment dead, one segment strobing under the safety ceiling
      S_BACKLIT = 8,   // a dark panel that lights the WALL rather than the street
      S_ARROW = 9,     // chevrons pulsing down toward a doorway
      S_SCREEN = 10,   // a slow luminance field that reads as video from across the street
      S_MARQUEE = 11,  // the plain row of letters over the door — the baseline this file shipped
      S_N = 12;

  /* Weights by district id, in the order city.js declares them: sodium, screen, concrete, ember,
   * spring, arcade. This table is the whole reason a district reads as a place rather than as a
   * hue: the concrete quarter is where signs go to die (S_FAIL, S_BACKLIT, and very little that
   * moves), the screen district is screens and tickers, and the arcade strip is the only place
   * that can afford a chase border on every second building. */
  var STYLE_W = [
    /*            TUBE BLADE CHASE WIPE TICK BLOK FLAP FAIL BACK ARRW SCRN MARQ */
    /* sodium  */ [  6,   3,   3,   2,   1,   4,   2,   3,   2,   3,   1,   5],
    /* screen  */ [  2,   3,   2,   4,   5,   3,   3,   1,   3,   1,   6,   2],
    /* concrete*/ [  3,   1,   1,   1,   1,   2,   2,   6,   5,   2,   1,   3],
    /* ember   */ [  4,   2,   2,   1,   1,   2,   2,   5,   2,   5,   1,   3],
    /* spring  */ [  3,   3,   2,   2,   2,   3,   4,   2,   3,   2,   2,   3],
    /* arcade  */ [  3,   5,   6,   4,   4,   6,   3,   2,   2,   4,   5,   2]
  ];

  /* HOW MUCH SCREEN A CONSTRUCTION NEEDS BEFORE IT IS A CONSTRUCTION, in cells across and cells
   * up, per style. These are not taste: they are the size at which the style's own parts stop
   * being separable. A hollow tube needs two legs and something between them (4 across, 3 up); a
   * chase border needs four sides; a character block needs two cells of ink and one of gap; a
   * marquee needs three letters to read as writing; an arrow needs the chevrons to stack. Below
   * these the fixture is drawn as its own MASS instead — see BD.lod in board(). That is what the
   * eye gets from a real sign a hundred metres away, and the alternative measured over the sweep
   * is a handful of loose marks in the facade's own glyphs and the facade's own hues, which is
   * exactly what the craft review found the small styles printing as. */
  var MIN_C = [4, 1, 4, 3, 3, 5, 3, 3, 3, 2, 3, 3];
  var MIN_R = [3, 4, 3, 2, 2, 2, 2, 2, 2, 4, 2, 2];

  /* The nearest grid size at or below n that holds a whole number of block characters, 2 ink and
   * 1 gap each: 2, 5, 8, 11. Never below one character, or the block style has nothing to draw. */
  function blockGrid(n) {
    var k = ((n + 1) / 3) | 0;
    return (k < 1 ? 1 : k) * 3 - 1;
  }

  function pickStyle(did, r) {
    var w = STYLE_W[did] || STYLE_W[0], tot = 0, i;
    for (i = 0; i < S_N; i++) tot += w[i];
    var x = r * tot;
    for (i = 0; i < S_N; i++) { x -= w[i]; if (x <= 0) return i; }
    return S_MARQUEE;
  }

  /* The fixture currently being drawn. One object, filled by setupSign and read by shade, board,
   * castGlow and wetSmear — the draw path allocates nothing, and a per-sign closure over these
   * values would allocate twelve of them a frame. */
  /* ncW/nrW are the fixture's character grid in the WORLD, fixed for its life; nc/nr are the grid
   * the SCREEN can actually sample this frame, which is never finer — see board(). gs/rs carry the
   * ratio, so a shader can index its structure in the drawn grid and its content in the world one
   * and the lettering stays put while the construction coarsens. Both are 1 whenever the fixture
   * is big enough to hold its own grid, and then every expression below is what it always was. */
  var BD = {
    style: 0, hue: 0, sd: 0, ph: 0, kind: 0, dead: 0, dead2: 0,
    gl: 0, gl2: 0, nc: 2, nr: 2, ncW: 2, nrW: 2, gs: 1, rs: 1,
    bv: 0, peak: 200, halo: 0.55, dens: 1, cased: 1, lod: 0, massk: 0.82, sweep: 0, tt: 0
  };
  var SH = { g: 0, k: 0, c: 0 };            // one cell's answer out of shade()
  var GEO = { ax: 0, az: 0, bx: 0, bz: 0, v0: 0, H: 0 };

  /* Where a fixture's colour comes from. city.js already decided a hue for the sign PANEL it
   * painted into this lot's wall texture, and taking it means the fixture and the panel behind it
   * are the same advertisement rather than two unrelated objects that happen to overlap. Lots with
   * no panel fall back to the file's own roll, which is what every sign used before this pass, so
   * the palette census barely moves. */
  function signHue(rec, r, style) {
    var h = (rec && rec.sign) ? rec.sign.hue : neonHue(r);
    /* Violet is a SCREEN pigment here and nothing else — see neonHue. A screen or a ticker is a
     * dim emissive panel and can carry it; a saturated glass tube on a near wall blooms into the
     * hot magenta the whole palette exists to avoid. */
    if (h === P.violet && style !== S_SCREEN && style !== S_TICKER) h = P.azure;
    /* The concrete district hands out slate and white sign panels, which are structure colours.
     * A sign is a light source and a light source is never unlit concrete. */
    if (h === P.slate || h === P.white || h === P.shadow) h = r < 0.5 ? P.amber : P.azure;
    return h;
  }

  /* ---- the shader ------------------------------------------------------------------------------
   * (u, v) are the fixture's own surface coordinates, u along it from one end and v up from its
   * foot, both 0..1 and both computed perspective-correct in board(). Everything a style needs
   * beyond that is on BD. Fills SH and returns false for a cell the style leaves dark — the gaps
   * are as much of the construction as the marks are, since a sign with no dark in it is a slab.
   *
   * All locals are declared here rather than in the branches: `var` inside a switch case is
   * function-scoped anyway, and hoisting them makes that visible instead of surprising. */
  function shade(u, v, t) {
    var nc = BD.nc, nr = BD.nr;
    var ci = (u * nc) | 0; if (ci < 0) ci = 0; else if (ci >= nc) ci = nc - 1;
    var ri = (v * nr) | 0; if (ri < 0) ri = 0; else if (ri >= nr) ri = nr - 1;
    /* STRUCTURE is indexed in the drawn grid (ci, ri) and CONTENT in the world grid (cw, rw).
     * The distinction only exists when board() had to coarsen the grid to what the screen can
     * sample, and it is what keeps that coarsening from re-rolling the sign: which columns are
     * border and which are gap has to follow the cells that exist, while which letterform sits in
     * a column, how bright it is and what a screen is showing must stay a property of the fixture
     * or the whole board reshuffles at the two or three distances where a column becomes
     * affordable. gs and rs are 1 for an unclamped fixture, so cw === ci and rw === ri and every
     * line below reduces to exactly what it computed before this split existed. */
    var cw = BD.gs > 1 ? (ci * BD.gs) | 0 : ci;
    var rw = BD.rs > 1 ? (ri * BD.rs) | 0 : ri;
    var edge, quad, pl, pi, p, k, j, ff, st, fr, d, lv, a, b, bi, ix, iy, pk, cs;
    SH.c = BD.hue;

    switch (BD.style) {

    case S_TUBE:
      /* The classic bar sign: a hollow rectangle of tube with the name floating inside it. */
      edge = (ci === 0 || ci === nc - 1 || ri === 0 || ri === nr - 1);
      if (!edge) {
        if (nr < 5 || ri !== (nr >> 1) || (ci & 1)) return false;
        SH.g = (cw & 2) ? BD.gl : BD.gl2;
        SH.k = 0.60 * flick(BD.kind, BD.ph, t, cw, BD.dead2);
        return true;
      }
      /* One corner segment is out. A rectangle of tube fails at a corner — that is where the
       * bend is and where the electrode sits — and a rectangle with three corners is instantly
       * read as a broken sign, where a uniformly dim one is just read as a distant one. */
      quad = (ci * 2 >= nc ? 1 : 0) + (ri * 2 >= nr ? 2 : 0);
      SH.g = (ri === 0 || ri === nr - 1) ? BD.gl : G_PIPE;
      SH.k = quad === (BD.dead & 3) ? 0.09
           : (0.86 + 0.14 * hk(cw, rw, BD.sd, 3)) * flick(BD.kind, BD.ph, t, 0, -1);
      return true;

    case S_BLADE:
      /* A stack of characters down a banner that stands out from the wall. Same construction the
       * file has always had; what changed is where it hangs — see setupSign. */
      k = v * nr;
      j = k | 0; ff = k - j;
      if (ff > 0.66) return false;                   // the gap between stacked characters
      j = BD.rs > 1 ? (j * BD.rs) | 0 : j;           // the character, in the world grid
      SH.g = hk(j, cw, BD.sd, 2) < 0.55 ? BD.gl : BD.gl2;
      SH.k = (0.86 + 0.20 * hk(j, cw, BD.sd, 1)) * flick(BD.kind, BD.ph, t, j, BD.dead);
      return true;

    case S_CHASE:
      /* Lamps running round the border at a fixed rate, letters holding steady inside it. The
       * crest is 0.10 of the perimeter wide with a 0.09 falloff and laps in 4.5 s, so a given lamp
       * takes about 0.4 s to come up: 4% of full scale a frame at the very worst. */
      edge = (ci === 0 || ci === nc - 1 || ri === 0 || ri === nr - 1);
      if (edge) {
        pl = 2 * (nc + nr) - 4; if (pl < 1) pl = 1;
        if (ri === 0) pi = ci;
        else if (ci === nc - 1) pi = (nc - 1) + ri;
        else if (ri === nr - 1) pi = (nc - 1) + (nr - 1) + (nc - 1 - ci);
        else pi = 2 * (nc - 1) + (nr - 1) + (nr - 1 - ri);
        p = crest(pi / pl - BD.sweep, 0.10, 0.09);
        SH.g = p > 0.34 ? G_O : G_oo;
        SH.k = 0.26 + 0.86 * p;
        return true;
      }
      if (nr < 3 || ri !== (nr >> 1)) return false;
      if ((ci & 3) === 3) return false;              // inter-letter dark inside the border
      SH.g = hk(cw, 0, BD.sd, 2) < 0.55 ? BD.gl : BD.gl2;
      SH.k = 0.74 * flick(BD.kind, BD.ph, t, cw, BD.dead);
      return true;

    case S_WIPE:
      /* A bar of light crossing the face of an otherwise dull board — the cheapest animation a
       * real sign has and the one that reads from furthest away. */
      k = u * nc;
      j = k | 0; ff = k - j;
      if (ff > 0.68) return false;
      SH.g = hk(cw, rw, BD.sd, 2) < 0.55 ? BD.gl : BD.gl2;
      SH.k = (0.30 + 0.68 * crest(u - BD.sweep, 0.08, 0.13)) *
             flick(BD.kind, BD.ph, t, cw, BD.dead);
      return true;

    case S_TICKER:
      /* Text you cannot quite read, and the reason it is safe: the GLYPH scrolls, the luminance
       * does not. Nothing in this branch takes t except the integer step, so the per-cell
       * luminance is dead flat over time and the eye still gets a band of moving characters at
       * 2 Hz. Put a blank in TICK_G and that stops being true — a space scrolling past a cell is
       * a full-scale on/off edge twice a second, which is the exact artefact this file spent two
       * rounds of measurement removing. */
      if (nr > 2 && (ri === 0 || ri === nr - 1)) {
        SH.g = G_DASH; SH.k = 0.22; return true;     // the case around the display
      }
      st = CC.reducedMotion ? 0 : (BD.tt * 2.0) | 0;
      SH.g = TICK_G[((hk(cw + st, rw, BD.sd, 4) * 1361) | 0) % TICK_N];
      SH.k = 0.52 + 0.44 * hk(cw, rw, BD.sd, 5);
      return true;

    case S_BLOCK:
      /* Stacked square character clusters: a 2-cell block of dense glyphs, a gap, the next block.
       * This is the signboard read the references lean on hardest and the single strongest cue in
       * the file that the city has a written language — which is exactly why the block's ink
       * pattern is a fixed function of its index and never of t. Writing that changes shape is
       * not writing. */
      if (BD.bv) {
        if (ri % 3 === 2) return false;              // the gap between stacked characters
        bi = (ri / 3) | 0; ix = ci; iy = ri % 3;
      } else {
        if (ci % 3 === 2) return false;
        bi = (ci / 3) | 0; ix = ci % 3; iy = ri;
      }
      /* The character a block shows is a property of the fixture, not of how far away you are
       * standing, so the block index is lifted into the world grid exactly like every other
       * content index in this shader. */
      bi = BD.bv ? (BD.rs > 1 ? (bi * BD.rs) | 0 : bi) : (BD.gs > 1 ? (bi * BD.gs) | 0 : bi);
      pk = hk(bi * 4 + ix, iy, BD.sd + 41, 8);
      if (pk < 0.15) return false;                   // the counter inside the character
      cs = hk(bi, 0, BD.sd + 7, 7);
      SH.g = BLOCK_G[(((cs * 977 + pk * 131) | 0) % BLOCK_N)];
      SH.k = (0.82 + 0.18 * pk) * flick(BD.kind, BD.ph, t, bi, BD.dead);
      return true;

    case S_FLAP:
      /* A split-flap board. Each character holds a state for about a second and then turns over,
       * and the turn is a DIP: the flap is edge-on to the street for the moment it is moving, so
       * the cell darkens, the glyph changes at the bottom of the dip where nobody can see the
       * change, and it comes back. The dip is measured to the flip instant the short way round,
       * so there is no wrap edge — the same rule as crest(). */
      p = hk(cw, rw, BD.sd, 6);
      k = BD.tt * 0.55 + p * 7;
      st = k | 0; fr = k - st;
      d = fr < 0.5 ? fr : 1 - fr;
      SH.g = TICK_G[((hk(st + cw * 5, rw, BD.sd, 4) * 1361) | 0) % TICK_N];
      /* The dip is WIDE on purpose, and the rate is low on purpose, and both numbers are the
       * answer to a measurement rather than to taste. At 0.85 flips a second through a dip 0.14
       * of a period wide this is a narrow pulse train, and a narrow pulse train is a comb: the
       * fourth harmonic landed at 3.42 Hz carrying 5.75% of full scale, three times the 2% the
       * flash band allows, even though nothing in it moved more than 9% in any one frame. Half a
       * flip a second through a dip that occupies more than half the cycle is almost a raised
       * cosine, and its content above 3 Hz measures 0.32%. */
      SH.k = 0.94 - 0.52 * CC.smooth(clamp((0.28 - d) / 0.28, 0, 1));
      return true;

    case S_FAIL:
      /* The sign nobody has come to fix: one row of segments dead, one column of them strobing.
       * 2.2 Hz is under the 3 Hz ceiling and the amplitude is 0.28, so the worst frame moves the
       * cell 0.28 * 2 * pi * 2.2 / 60 = 6.4% of full scale. That is a fault, not a flash. */
      if (ri === BD.dead2 % nr) { SH.g = BD.gl2; SH.k = 0.07; return true; }
      if (ci === BD.dead % nc) {
        SH.g = BD.gl;
        SH.k = CC.reducedMotion ? 0.56
             : 0.42 + 0.28 * (0.5 + 0.5 * Math.sin(BD.tt * 13.82 + BD.ph * 6.283));
        return true;
      }
      k = u * nc; j = k | 0; ff = k - j;
      if (ff > 0.70) return false;
      SH.g = hk(cw, rw, BD.sd, 2) < 0.55 ? BD.gl : BD.gl2;
      SH.k = 0.80 + 0.14 * hk(cw, rw, BD.sd, 1);
      return true;

    case S_BACKLIT:
      /* A sign that is not the light source: an opaque panel with the tubes behind it, so what
       * you actually see is the WALL around it glowing and the panel itself as a dark shape with
       * a rim. All the energy is in BD.halo — see setupSign — and this branch is only here to
       * put a hole in the middle of it. */
      edge = (ci === 0 || ci === nc - 1 || ri === 0 || ri === nr - 1);
      if (edge) { SH.g = BD.gl; SH.k = 0.42 + 0.12 * hk(cw, rw, BD.sd, 3); return true; }
      SH.c = P.shadow;
      SH.g = G_HASH; SH.k = 0.34;
      return true;

    case S_ARROW:
      /* Chevrons pointing down at a doorway, with the pulse running down them. One chevron per
       * grid row, 3.3 s a pulse: this is the slowest animation in the file and the most legible,
       * because what moves is a POSITION and not a brightness. */
      p = crest((nr - 1 - ri) / nr - BD.sweep, 0.09, 0.16);
      SH.g = ri === nr - 1 ? G_EQ : G_V;      // a bar at the head, chevrons under it
      SH.k = 0.24 + 0.82 * p;
      return true;

    case S_SCREEN:
      /* Something is playing on it. Two slow value-noise fields crossed — one running along the
       * screen, one up it — give luminance regions that grow and drift rather than a field of
       * static, and picking the glyph off the LEVEL rather than off a hash is what turns that
       * into a picture: bright regions print dense, dark ones print sparse, exactly the way an
       * ASCII conversion of a video frame does.
       * At 0.45 units a second the field moves at most 1.1% of its range in a frame, so a screen
       * on a near wall is the calmest object in this file despite never repeating. */
      a = vnoise(BD.tt * 0.45 + cw * 0.83 + BD.ph * 9, BD.sd + 101);
      b = vnoise(BD.tt * 0.37 + rw * 1.29 + BD.ph * 5, BD.sd + 211);
      lv = clamp(a * 0.66 + b * 0.52 - 0.13, 0, 1);
      /* The black in the picture is DARK, not absent. `if (lv < 0.07) return false` was the
       * obvious way to write it and it is a moving threshold on a moving field: every cell the
       * picture faded through it stopped being drawn, and with two panels overlapping — which is
       * common, they are the most numerous style in the screen district — the cell behind flashed
       * through the hole. Forced to one style city-wide and measured, that cut was a 36.1% single
       * frame step; without it the same panels measure 1.2%. A screen is an object: its black
       * cells still print as its black cells, and the floor in board() keeps them occluding. */
      j = (lv * SCREEN_N) | 0; if (j >= SCREEN_N) j = SCREEN_N - 1;
      SH.g = SCREEN_G[j];
      SH.k = 0.16 + 0.90 * lv * lv;
      return true;

    default:
      /* S_MARQUEE — a short row of glyph blocks over the door, the shape this file shipped with
       * and still the right answer for most buildings. */
      k = u * nc;
      j = k | 0; ff = k - j;
      if (ff > 0.62) return false;                   // inter-letter dark, so it reads as writing
      SH.g = hk(cw, rw, BD.sd, 2) < 0.55 ? BD.gl : BD.gl2;
      SH.k = (0.84 + 0.22 * hk(cw, rw, BD.sd, 1)) * flick(BD.kind, BD.ph, t, cw, BD.dead);
      return true;
    }
  }

  /* ---- what a sign lights ----------------------------------------------------------------------
   * The cast, and the reason it is a modulation and not a mark: everything a street sign actually
   * illuminates — the wall it is bolted to, the pavement under it, the underside of the awning
   * over the stall in front of it, the rain falling through it, the near edge of whoever is
   * walking past — has ALREADY BEEN PAINTED by the time layer 30 runs. Lighting those cells costs
   * energy and almost no coverage, which is the only way an effect this large fits in a frame that
   * is 43% pure black on purpose.
   *
   * Two rules keep it honest. Only cells that already carry ink are lit, because light falls on
   * surfaces and there is no surface in an empty cell. And only cells at roughly the sign's own
   * depth are lit: something twenty metres in front of the sign is not being lit BY it, and
   * without that test a fixture glowing behind a near corner lights up the corner.
   *
   * The colour crossfades rather than switching: near the source the surface takes the sign's hue
   * outright, further out it keeps its own and only gets brighter, which is what a coloured light
   * on a coloured surface does and what stops a halo reading as a decal. */
  function castGlow(frame, cx, cy, rx, ry, hue, amt, dist) {
    if (amt < 0.03 || rx < 0.5 || ry < 0.5) return;
    var cols = CO.cols, rows = CO.rows;
    var xa = Math.floor(cx - rx), xb = Math.ceil(cx + rx);
    var ya = Math.floor(cy - ry), yb = Math.ceil(cy + ry);
    if (xa < 0) xa = 0; if (xb > cols - 1) xb = cols - 1;
    if (ya < 0) ya = 0; if (yb > rows - 1) yb = rows - 1;
    if (xb < xa || yb < ya) return;
    var dNear = dist * 0.55, dFar = dist * 1.5;
    var x, y, dx, dy, rr, i, l0, nd, k, add;
    for (y = ya; y <= yb; y++) {
      dy = (y + 0.5 - cy) / ry;
      if (dy < -1 || dy > 1) continue;
      for (x = xa; x <= xb; x++) {
        dx = (x + 0.5 - cx) / rx;
        rr = dx * dx + dy * dy;
        if (rr > 1) continue;
        i = y * cols + x;
        if (frame.ch[i] === 0) continue;             // nothing there to light
        l0 = frame.lum[i];
        if (l0 === 0) continue;
        if (!(frame.dist[i] > dNear && frame.dist[i] < dFar)) continue;
        k = 1 - Math.sqrt(rr); k *= k;
        add = fog(amt * k * 104, frame.dist[i]);
        if (add < 3) continue;
        nd = nearer(frame.dist[i]);
        if (nd < 0) continue;
        put(frame, x, y, frame.ch[i], k > 0.44 ? hue : frame.col[i], l0 + add, nd,
            frame.kind[i]);
      }
    }
  }

  /* Is any part of this fixture in front of what the world pass already put there? Sampled on the
   * board's own centre row at three points across it, because one sample lands in the gap between
   * two raindrops as often as it lands on the wall. 0.86 of the board's depth is the slack: the
   * wall the sign is bolted to is a few tens of centimetres behind it and must NOT count as an
   * occluder, while a building on the near side of the street is at a fraction of the distance. */
  function boardVisible(frame, xL, xR, cy, dist) {
    var cols = CO.cols, y = Math.round(cy);
    if (y < 0) y = 0; else if (y > CO.rows - 1) y = CO.rows - 1;
    var lim = dist * 0.86, q, x;
    for (q = 0; q < 3; q++) {
      x = Math.round(xL + (xR - xL) * (0.1 + 0.4 * q));
      if (x < 0 || x > cols - 1) continue;
      if (!(frame.dist[y * cols + x] < lim)) return true;
    }
    return false;
  }

  /* ---- what a sign leaves on the road ----------------------------------------------------------
   * The single highest-value effect in a rain-slicked street, and it belongs here because it is
   * made of the sign's colour and the sign's brightness, which nothing else in the build knows.
   * surfaces.js owns the road's own wetness — the anonymous streaking that says "this tarmac is
   * wet" — and this owns the reflection of a NAMED fixture: one column, at the sign's own screen
   * column, dragged toward the viewer.
   *
   * A mirror image in a horizontal plane lands in the same screen column as its source, so the
   * smear is vertical and no sideways term is needed or wanted. It runs from the foot of the wall
   * toward the eye and dies out on the way, because the further from the source the more of the
   * road's own texture is mixed into it. Every value here is static in t: a reflection that
   * shimmers is a reflection that flickers, and this file does not flicker. */
  function wetSmear(frame, cx, w, hue, peak, sd) {
    if (AT.wet < 0.22 || peak < 20) return;
    var cols = CO.cols, rows = CO.rows, horizon = CO.horizon;
    var x = Math.round(cx);
    if (x < 0 || x > cols - 1 || w < 1.6 || w > 44) return;
    var sp = (2 * (x + 0.5) / cols - 1) * CO.hp, len = Math.sqrt(1 + sp * sp);
    var r0 = Math.floor(horizon + CO.eyeY * CO.scale / w);
    var lo = Math.floor(horizon) + 1; if (r0 < lo) r0 = lo;
    /* How far toward the eye the image is dragged. A damp road holds a short blurred copy that
     * dies a third of the way out; a flooded one pulls it two thirds of the way to your feet. */
    var wEnd = w * (0.60 - 0.30 * AT.wet); if (wEnd < 1.1) wEnd = 1.1;
    var r1 = Math.ceil(horizon + CO.eyeY * CO.scale / wEnd);
    if (r1 > rows - 1) r1 = rows - 1;
    var d = w - wEnd; if (d < 0.2) return;
    var r, den, wf, q, fall, dth, lum, dd;
    for (r = r0; r <= r1; r++) {
      den = r + 0.5 - horizon;
      if (den < 0.4) continue;
      wf = CO.eyeY * CO.scale / den;
      q = (w - wf) / d;
      if (q < 0) q = 0; else if (q > 1) continue;
      fall = (1 - q) * (1 - q);
      dth = hk(x, r, sd, 5);
      if (dth > 0.26 + 0.62 * fall * AT.wet) continue;
      dd = wf * len;
      lum = fog(peak * 0.50 * fall * AT.wet * AT.dim, dd);
      if (lum < 5) continue;
      /* One column wandering by a cell, keyed on the row so it is a stable ripple and not a
       * per-frame jitter, and 0.6% nearer than the tarmac it lies on because the road at this
       * exact distance was painted by the raycaster and the coin flip has to be settled. */
      put(frame, x + ((hk(x, r >> 1, sd, 6) * 2.6) | 0) - 1, r,
          dth < 0.11 ? G_QUOTE : G_COLON, hue, lum, dd * 0.994);
    }
  }

  /* =============================================================================================
   * 1. SHOP WINDOW SPILL  — layer 28
   * The warm pool a lit shopfront throws onto the wet pavement in front of it. Drawn first of the
   * four so a sign or a signal always wins the cell.
   * ========================================================================================== */
  var SP = { salt: 0 };

  /* surfaces.js decides which ground-floor units are open from hash2(floor(u/2.55),0,sd^0x7E31),
   * with sd the building seed widened the way raycast.js widens it. Re-deriving that here is the
   * whole reason the spill lands under a lit window instead of under a shutter. If surfaces ever
   * re-rolls that test this degrades to spill in a merely plausible place, never to a crash. */
  /* ...and it is read from CC.Surf rather than written out again. It WAS written out again, as a
   * literal 0.40, which is how raising the open rate in surfaces.js left every spill pool in the
   * city keyed to the old frontage: the shutters that used to be dark got shopfronts, and the
   * pools stayed under the units that had been open before. The fallback keeps this file loadable
   * on its own, which is the only reason it is not simply CC.Surf.SHOP_OPEN inline. */
  function shopOpen(rec, u) {
    var sd = (rec.seed * 4294967296) | 0;
    var th = (CC.Surf && CC.Surf.SHOP_OPEN) || 0.52;
    return hash2(Math.floor(u / 2.55), 0, sd ^ 0x7E31) < th;
  }

  CC.ELEMENTS.push({
    name: 'shopSpill',
    layer: 28,

    /* The interface hands `city` to init but not to draw, so park it on the element rather than
     * in a module-level singleton a second City instance would silently share. */
    init: function (city, rng) {
      this.city = city;
      SP.salt = (rng() * 2147483647) | 0;
    },

    update: function () {},

    draw: function (frame, cam, t) {
      var city = this.city;
      if (!city) return;
      setCam(frame, cam);
      airPrep();

      var R = 25;                     // past this the pool is under two rows and reads as grime
      var gx0 = Math.floor(CO.ox - R), gx1 = Math.floor(CO.ox + R);
      var gz0 = Math.floor(CO.oz - R), gz1 = Math.floor(CO.oz + R);
      var rows = CO.rows, cols = CO.cols, horizon = CO.horizon;
      var drawn = 0, gx, gz;

      /* Every cell, not every other one: a stride over world cells aliases against the wall,
       * whose frontage is a single column of constant gx, so half the time a whole facade is
       * skipped and the other half it is fully covered. The pools are broken apart by a hash
       * below instead — a continuous wash along the kerb reads as a painted stripe. */
      for (gz = gz0; gz <= gz1; gz++) {
        for (gx = gx0; gx <= gx1; gx++) {
          /* 22, up from 16, for the same reason the prop lattice was packed tighter: the pavement
           * is 1.81 m of walkable strip rather than 1.06 m (CC.PAVE), and `depth` below already
           * runs 1.15-1.90 m, so a pool now covers the pavement instead of stopping short of the
           * kerb. More frontage to light, more of each pool visible, and the band it lands in
           * measured 4.7 points of the frame blank. */
          if (drawn > 22) return;
          var rx = gx + 0.5 - CO.ox, rz = gz + 0.5 - CO.oz;
          var w = rx * CO.fwx + rz * CO.fwz;
          if (w < 1.2 || w > R) continue;
          var side = rx * CO.rgx + rz * CO.rgz, lim = w * CO.hp + 2.5;
          if (side > lim || side < -lim) continue;
          if (hk(gx, gz, SP.salt, 6) > 0.62) continue;   // one pool per few metres, not a wash
          if (city.height(gx, gz) <= 0) continue;
          if (!faceOf(city, gx, gz, rx, rz)) continue;

          var rec = city.cell(gx, gz);
          if (!rec) continue;
          var nx = FACE.nx, nz = FACE.nz;
          /* u is the world coordinate ALONG the wall — the same one raycast.js hands the facade
           * texture, so the unit boundaries agree. */
          var u = nx ? FACE.fz : FACE.fx;
          if (!shopOpen(rec, u)) continue;

          if (!project(FACE.fx + nx * 0.5, 0.1, FACE.fz + nz * 0.5)) continue;
          var span = colsFor(0.75, VP.w);
          var xa = Math.floor(VP.x - span), xb = Math.ceil(VP.x + span);
          if (xa < 0) xa = 0; if (xb > cols - 1) xb = cols - 1;
          if (xb < xa) continue;

          var hs = hk(gx, gz, SP.salt, 1);
          /* The pool's colour comes from the sign over the door when there is one. A shopfront
           * and its sign are lit by the same tubes, and pooling generic warm under an azure
           * fixture was the one place in this file where two systems disagreed about what colour
           * a shop is. Most units keep the interior warm: the light on the pavement is mostly
           * what is on INSIDE, and a street where every pool matches its sign is a lighting rig,
           * not a street. */
          var hue = (rec.sign && hs < 0.58) ? signHue(rec, hs, S_MARQUEE)
                  : (hs < 0.74 ? P.warm : (hs < 0.93 ? P.amber : P.ice));
          var depth = 1.15 + hs * 0.75;
          var peak = 74 + hk(gx, gz, SP.salt, 2) * 46;
          /* The pool breathes with whatever is on inside. Tiny amplitude — this is a reflection,
           * and a reflection that pulses harder than its source stops being one. */
          if (!CC.reducedMotion) peak *= 0.90 + 0.10 * vnoise(t * 0.5 + hs * 30, SP.salt);
          /* Wet pavement holds the pool; dry pavement scatters it. Exactly 1.0 at the preset the
           * pool was tuned under, so this changes nothing until the weather does. */
          peak *= clamp(0.68 + 0.32 * AT.wet, 0.60, 1.16) * AT.dim;
          /* Counts pools that landed, not pools considered: a parade of shopfronts hidden behind
           * the near block must not spend the budget the visible kerb needs. */
          var hit = 0;

          var planeX = FACE.fx, planeZ = FACE.fz;
          /* The pool only ever occupies the band of rows looking at pavement between the wall and
           * `depth` metres out. Deriving that band up front turns a full-column march into three
           * or four rows; the margin covers the face being a plane rather than a sphere, so a
           * column at the edge of the span still finds its ground. */
          var wLo = w - depth - 1.2; if (wLo < 0.9) wLo = 0.9;
          var rTop = Math.floor(horizon + CO.eyeY * CO.scale / (w + 1.2));
          var rBot = Math.ceil(horizon + CO.eyeY * CO.scale / wLo);
          if (rTop < Math.floor(horizon) + 1) rTop = Math.floor(horizon) + 1;
          if (rBot > rows - 1) rBot = rows - 1;
          var a0 = (nx ? FACE.fz : FACE.fx) - 0.5, a1 = a0 + 1;

          for (var x = xa; x <= xb; x++) {
            var sp = (2 * (x + 0.5) / cols - 1) * CO.hp;
            var dx = CO.fwx + CO.rgx * sp, dz = CO.fwz + CO.rgz * sp;
            var len = Math.sqrt(1 + sp * sp);
            /* Each row is inverse-projected on its own — a pool painted from one sample would
             * stretch metres of pavement across rows that are metres apart in world space. */
            for (var r = rTop; r <= rBot; r++) {
              var den = r + 0.5 - horizon;
              if (den < 0.4) continue;
              var wf = CO.eyeY * CO.scale / den;
              var px = CO.ox + dx * wf, pz = CO.oz + dz * wf;
              var out = (px - planeX) * nx + (pz - planeZ) * nz;
              if (out < 0.04 || out > depth) continue;
              var along = nx ? pz : px;
              if (along < a0 || along > a1) continue;
              var k = 1 - out / depth;
              var dith = hk(Math.floor(px * 3.1), Math.floor(pz * 3.1), SP.salt, 3);
              if (dith > 0.30 + k * 0.20) continue;   // brighter near the glass means denser too
              var lum = fog(peak * k * k * (0.6 + 0.8 * dith), wf * len);
              if (lum < 5) continue;
              /* 0.6% depth bias: the pool is a decal on tarmac the raycaster already painted at
               * this exact distance, and without it, which one wins is a floating-point coin flip. */
              if (put(frame, x, r, SPILL_G[((dith * 977) | 0) % SPILL_N], hue, lum,
                      wf * len * 0.994)) hit = 1;
            }
          }
          drawn += hit;
        }
      }
    }
  });

  /* =============================================================================================
   * 2. FACADE NEON  — layer 30
   * Twelve sign styles bolted to the walls, each one lighting what is around it and smearing down
   * the wet road in front of it. city.js already paints a flat sign PANEL into the wall texture;
   * these are the fixtures that stand proud of it, mounted off the face so they occlude the facade
   * honestly instead of by fiat.
   * ========================================================================================== */
  var NE = { salt: 0 };
  var SIGN_CAP = 14;      // fixtures that may LAND in one frame; bounds cost and coverage together
  /* The screen area, in cells, at which a fixture starts thinning out instead of growing. A 2 m
   * board eight metres away is 70 columns of solid neon, which is the entire frame's light budget
   * in one object; past this the dither takes cells away as fast as the perspective adds them, so
   * a sign you walk up to gets BIGGER and SPARSER rather than turning into a wall of colour. The
   * dropout is keyed in the fixture's own grid, never in screen space, so it does not crawl as you
   * approach. */
  var AREA_T = 108;

  /* Everything about one fixture, derived from its cell. Fills BD and GEO; no allocation. */
  function setupSign(gx, gz, bh, rec, t) {
    var nx = FACE.nx, nz = FACE.nz;
    var tx = nz, tz = -nx;                 // unit vector ALONG the wall; the faces are axis-aligned
    var r1 = hk(gx, gz, NE.salt, 1), r2 = hk(gx, gz, NE.salt, 2), r3 = hk(gx, gz, NE.salt, 3);
    var r4 = hk(gx, gz, NE.salt, 4), r9 = hk(gx, gz, NE.salt, 9);
    var style = pickStyle(rec ? rec.did : 0, hk(gx, gz, NE.salt, 5));
    var W, H, v0, L, blade = 0, vert = 0;

    /* A blade needs wall to hang off. Falling back to the marquee rather than to nothing keeps the
     * low industrial pockets — which is most of the ember district — from being the only unsigned
     * streets in the city. The vertical signboard makes the same decision for itself below, since
     * it has a horizontal version to fall back to and the blade does not. */
    if (style === S_BLADE && bh < 15) style = S_MARQUEE;

    switch (style) {
    case S_BLADE:
      /* Perpendicular to the facade, which is the whole point of a blade: walking down the street
       * it is a bright board, and looking straight at the wall it collapses to a line. board()
       * handles that collapse by projecting both ends rather than assuming a width. */
      blade = 1;
      L = 0.85 + r2 * 0.80;
      H = 3.4 + r3 * 4.6;
      if (H > bh - 6) H = bh - 6;
      if (H < 2.2) H = 2.2;
      v0 = 5.0 + r9 * (bh - H - 7 > 0 ? bh - H - 7 : 0);
      W = L;
      break;
    case S_BLOCK:
      /* Tall buildings get the vertical signboard — characters stacked one above the other down
       * the corner, which is the single most recognisable shape in the reference set. Everything
       * else gets the horizontal fascia version of the same construction. */
      vert = (bh > 19 && r2 < 0.66) ? 1 : 0;
      if (vert) {
        W = 0.95; H = 2.9 + r3 * 3.4;
        if (H > bh - 8) H = bh - 8;
        if (H < 2.0) { vert = 0; }
      }
      if (vert) v0 = 4.6 + r9 * (bh - H - 8 > 0 ? bh - H - 8 : 0);
      else { W = 1.9 + r3 * 0.9; H = 1.05; v0 = 3.0 + r9 * 1.9; }
      break;
    case S_TUBE:    W = 1.7 + r3 * 0.9; H = 0.95 + r2 * 0.80; v0 = 2.95 + r9 * 1.7; break;
    case S_ARROW:   W = 0.70; H = 1.9 + r3 * 0.9; v0 = 2.45 + r9 * 0.7; break;
    case S_SCREEN:  W = 1.5 + r3 * 1.1; H = 1.05 + r2 * 0.9; v0 = 3.1 + r9 * 2.6; break;
    case S_TICKER:  W = 2.0 + r3 * 0.9; H = 0.60; v0 = 3.2 + r9 * 1.6; break;
    case S_CHASE:   W = 1.8 + r3 * 0.8; H = 0.95 + r2 * 0.5; v0 = 3.0 + r9 * 1.5; break;
    case S_FLAP:    W = 1.5 + r3 * 0.8; H = 0.70 + r2 * 0.4; v0 = 3.0 + r9 * 1.5; break;
    case S_BACKLIT: W = 1.5 + r3 * 1.0; H = 0.95 + r2 * 0.7; v0 = 3.2 + r9 * 2.2; break;
    default:        W = 1.6 + r3 * 0.9; H = 0.62 + r2 * 0.5; v0 = 3.1 + r9 * 1.4; break;
    }

    var cx = FACE.fx, cz = FACE.fz;
    if (blade) {
      GEO.ax = cx + nx * 0.18; GEO.az = cz + nz * 0.18;
      GEO.bx = cx + nx * (0.18 + L); GEO.bz = cz + nz * (0.18 + L);
    } else {
      /* 0.30 m proud of the face, and off-centre on its own cell by up to 15 cm so a run of
       * signed lots does not print as a dotted line of perfectly spaced boards. */
      var off = (r4 - 0.5) * 0.30;
      GEO.ax = cx + nx * 0.30 + tx * (off - W * 0.5);
      GEO.az = cz + nz * 0.30 + tz * (off - W * 0.5);
      GEO.bx = cx + nx * 0.30 + tx * (off + W * 0.5);
      GEO.bz = cz + nz * 0.30 + tz * (off + W * 0.5);
    }
    GEO.v0 = v0; GEO.H = H;

    /* The character grid, in the WORLD and fixed for the life of the fixture: walking towards a
     * sign enlarges its lettering instead of re-rolling it, which is the same rule the holo panel
     * follows and for the same reason. */
    BD.ncW = Math.round(W / 0.30); if (BD.ncW < 2) BD.ncW = 2; else if (BD.ncW > 9) BD.ncW = 9;
    BD.nrW = Math.round(H / 0.34); if (BD.nrW < 2) BD.nrW = 2; else if (BD.nrW > 14) BD.nrW = 14;
    BD.bv = vert;
    if (style === S_BLOCK) {
      /* Blocks are 2 grid cells of ink and 1 of gap, so the grid has to be a whole number of
       * them or the last character comes out clipped. */
      var nch;
      if (vert) {
        BD.ncW = 2;
        nch = Math.round(H / 1.02); if (nch < 2) nch = 2; else if (nch > 6) nch = 6;
        BD.nrW = nch * 3 - 1;
      } else {
        nch = Math.round(W / 0.92); if (nch < 2) nch = 2; else if (nch > 4) nch = 4;
        BD.ncW = nch * 3 - 1; BD.nrW = 2;
      }
    }
    if (style === S_ARROW) { BD.ncW = 2; BD.nrW = Math.round(H / 0.42); if (BD.nrW < 3) BD.nrW = 3; }
    /* Until board() measures the fixture on screen, the drawn grid IS the world grid: setupSign is
     * the only writer of these and a shader must never see a stale pair from the fixture before. */
    BD.nc = BD.ncW; BD.nr = BD.nrW; BD.gs = 1; BD.rs = 1;

    BD.style = style;
    BD.hue = signHue(rec, r1, style);
    BD.kind = (hk(gx, gz, NE.salt, 6) * 4) | 0;
    BD.ph = hk(gx, gz, NE.salt, 7);
    BD.gl = NEON_G[(r3 * NEON_N) | 0];
    /* A sign is a WORD. Rolling a fresh glyph per character turned every board into a column of
     * static, so each fixture gets exactly two letterforms and alternates between them; the eye
     * reads that as lettering it cannot quite make out. */
    BD.gl2 = NEON_G[(hk(gx, gz, NE.salt, 8) * NEON_N) | 0];
    /* Which segment is out is a fact about the FIXTURE, so it is rolled against the world grid and
     * taken modulo the drawn one where it is used. Rolling it against the drawn grid would move the
     * dead tube to another column every time the sign gained a column on approach. */
    BD.dead = (hk(gx + 7, gz - 3, NE.salt, 0) * BD.ncW) | 0;
    BD.dead2 = (hk(gx - 5, gz + 11, NE.salt, 0) * BD.nrW) | 0;
    /* Small, and varied additively: hash2 is exact in imul now, but every seed in this file stays
     * inside a few tens of thousands so that the vnoise streams below cannot collide by rounding. */
    BD.sd = (hk(gx + 13, gz + 17, NE.salt, 2) * 30011) | 0;
    BD.tt = CC.reducedMotion ? BD.ph * 31 : t;

    /* Every fixture is boxed — see the case in board(). The flag exists because the backlit panel
     * already IS a case with a rim round it, and a second one under it only darkens its own
     * interior for nothing. */
    BD.cased = style === S_BACKLIT ? 0 : 1;
    /* The level the fixture collapses to when it is too small to have parts. It carries the
     * fixture's own flicker personality and nothing else — a distant sign that guttered per
     * character would be twinkling, and twinkle at this size is indistinguishable from the
     * lattice noise the mass exists to separate itself from. j is off the end of the grid on
     * purpose so personality 2's dead character cannot be the one cell the whole fixture is. */
    BD.massk = 0.82 * flick(BD.kind, BD.ph, t, -1, -2);

    var peak = 178 + hk(gx + 3, gz - 5, NE.salt, 1) * 66;
    BD.halo = 0.50;
    if (style === S_SCREEN) { peak *= 0.80; BD.halo = 0.70; }
    else if (style === S_BACKLIT) { peak *= 0.50; BD.halo = 1.70; }
    else if (style === S_TICKER) { peak *= 0.86; BD.halo = 0.42; }
    else if (style === S_BLOCK) BD.halo = 0.62;
    BD.peak = peak * gutter(t, BD.ph);

    /* Sweep rates, one field because no style has two travelling crests. Every one of them laps
     * in three to five seconds: what the eye reads is the MOVEMENT, and a crest that laps faster
     * than that stops being a lamp running round a border and becomes a flicker. */
    var rate = style === S_CHASE ? 0.22 : (style === S_WIPE ? 0.26 : 0.30);
    BD.sweep = CC.reducedMotion ? BD.ph : (BD.ph + t * rate) % 1;
  }

  /* Rasterise the fixture described by BD and GEO. Returns 1 if anything landed.
   *
   * The board is a rectangle in the world standing on the segment (ax,az)-(bx,bz) — along the wall
   * for a fascia, out along the normal for a blade — so one routine draws both and a blade
   * foreshortens correctly instead of being faked. Both ends are projected and the interior is
   * interpolated PERSPECTIVE-CORRECT: 1/w is what is linear in screen x, so the depth of a column
   * is 1/lerp(1/wL, 1/wR) and the surface coordinate is (s/wR) over that same sum. Interpolating u
   * linearly instead puts the lettering of a near sign visibly off-centre. */
  function board(frame, t) {
    if (!projInto(GEO.ax, GEO.v0, GEO.az, VA)) return 0;
    if (!projInto(GEO.bx, GEO.v0, GEO.bz, VB)) return 0;
    var cols = CO.cols, rows = CO.rows;
    var xL, xR, wL, wR;
    if (VA.x <= VB.x) { xL = VA.x; wL = VA.w; xR = VB.x; wR = VB.w; }
    else              { xL = VB.x; wL = VB.w; xR = VA.x; wR = VA.w; }
    /* A blade seen edge-on is a LINE, not nothing — that instant is when a blade sign is most
     * itself — so a board narrower than a column is widened to one rather than dropped. */
    var span = xR - xL;
    if (span < 0.9) { var mid = (xL + xR) * 0.5; xL = mid - 0.45; xR = mid + 0.45; span = 0.9; }
    if (xR < 0 || xL > cols - 1) return 0;

    var wMid = 2 / (1 / wL + 1 / wR);
    var hRows = GEO.H * CO.scale / wMid;
    var cxs = (xL + xR) * 0.5;
    var cys = CO.horizon - (GEO.v0 + GEO.H * 0.5 - CO.eyeY) * CO.scale / wMid;
    var spC = (2 * (cxs + 0.5) / cols - 1) * CO.hp;
    var distMid = wMid * Math.sqrt(1 + spC * spC);

    var xa = Math.floor(xL), xb = Math.ceil(xR);
    if (xa < 0) xa = 0; if (xb > cols - 1) xb = cols - 1;
    if (xb < xa) return 0;

    /* ---- the grid the screen can actually sample --------------------------------------------
     * A fixture's character grid is fixed in the world — up to 9 columns of lettering — and the
     * shader is point-sampled once per screen column. Over the canonical sweep the median fixture
     * covers 3.1 columns at 30 m while carrying 7 grid columns, and 52% of all fixtures have a
     * grid at least twice as fine as the screen: for those, one grid column in two is never asked
     * about, and WHICH ones are skipped is a function of where the board's edge happens to fall
     * between two cells. That is the whole reason the constructions do not read. A hollow tube
     * loses one leg and prints as an L; a chase border loses a side; a character block loses the
     * gap that separates two characters and prints as the same lattice the window texture behind
     * it is made of. Nothing was wrong with the constructions — half of every construction was
     * being sampled away, and the half that survived changed as the viewer walked.
     *
     * Coarsening the grid to what the screen can carry is the standard answer to that (it is a
     * mip level, and the alternative — supersampling every cell — is a draw-path allocation and
     * four times the shader cost for an object 3 cells wide). STRUCTURE then follows the cells
     * that exist, so a tube always has two legs and a border always has four sides, at any size.
     * CONTENT does not follow it: gs/rs carry the ratio and shade() lifts every letterform,
     * brightness jitter and screen-noise lookup back into the world grid, so approaching a sign
     * does not reshuffle what it says. Both ratios are 1 for any fixture big enough to hold its
     * own grid, and that fixture renders exactly what it rendered before. */
    var sgc = Math.round(span); if (sgc < 2) sgc = 2;
    var sgr = Math.round(hRows); if (sgr < 2) sgr = 2;
    BD.nc = BD.ncW < sgc ? BD.ncW : sgc;
    BD.nr = BD.nrW < sgr ? BD.nrW : sgr;
    if (BD.style === S_BLOCK) {
      /* A block character is two grid cells of ink and one of gap, so a grid that is not a whole
       * number of them clips the last character in half — the same rule setupSign follows when it
       * builds the world grid, applied again to the coarsened one. */
      if (BD.bv) BD.nr = blockGrid(BD.nr); else BD.nc = blockGrid(BD.nc);
    }
    BD.gs = BD.nc > 0 ? BD.ncW / BD.nc : 1;
    BD.rs = BD.nr > 0 ? BD.nrW / BD.nr : 1;

    /* ---- and when even that is too small ------------------------------------------------------
     * Coarsening the grid makes a construction survivable; it cannot make it EXIST. 72% of the
     * fixtures in the sweep are under 8 columns and half are under 3, and at 3 columns a hollow
     * rectangle, a chase border and a video screen are the same object: four or five loose marks
     * in the two pillar hues, drawn out of the same glyph bank the window lattice behind them is
     * drawn from, at the wall's own brightness. That is the finding, and no amount of care inside
     * the shader answers it, because the parts being drawn are smaller than a cell.
     *
     * So below MIN_C x MIN_R the fixture stops being a construction and becomes its own MASS: a
     * contiguous block of the sign's colour at one level, which is what a real sign reduces to at
     * distance and — per the review's own census of what does and does not read — the single
     * property shared by every style that survives. lod crossfades it in over two cells of span
     * rather than switching, for the reason every travelling shape in this file is a plateau: a
     * threshold on a quantity the walk changes puts a full-scale step on every cell of a fixture
     * in one frame, and this quantity changes with every step the viewer takes. Since the mass
     * level is a constant, the blend can only ever REDUCE a cell's temporal amplitude — the
     * chase's crest, the screen's field and the fail's strobe all shrink toward flat as lod goes
     * up, so nothing here can push a style past the envelope it was measured at. */
    var mnc = MIN_C[BD.style], mnr = MIN_R[BD.style];
    if (BD.style === S_BLOCK && BD.bv) { mnc = 2; mnr = 5; }
    var dfc = (mnc - span) * 0.5, dfr = (mnr - hRows) * 0.5;
    if (dfr > dfc) dfc = dfr;
    BD.lod = BD.cased ? CC.smooth(clamp(dfc, 0, 1)) : 0;

    /* Thinning, not clamping — see AREA_T. */
    var area = (xb - xa + 1) * (hRows < 1 ? 1 : hRows);
    BD.dens = area > AREA_T ? AREA_T / area : 1;
    if (BD.dens < 0.24) BD.dens = 0.24;

    /* The cast goes down FIRST and the board over the top of it. The board carries a 0.4% depth
     * bias — it stands 0.3 m proud of its wall, so it is genuinely nearer — and the halo is only
     * a part in ten thousand nearer than whatever it landed on, so the sign can never be eaten by
     * its own glow. Reverse the order and it is, at every grazing angle where the standoff stops
     * separating the two depths.
     *
     * Which is why the visibility of the fixture has to be settled BEFORE anything is drawn: the
     * board finds out it is behind a wall one put() at a time, and by then the halo has already
     * gone down. Three samples across the board's own row, and any one of them seeing past the
     * board's depth is enough — a sign half hidden by a corner still lights the corner. */
    var vis = boardVisible(frame, xL, xR, cys, distMid);
    if (vis) {
      /* The halo's reach is deliberately mean. At span*0.85 + 2.2 it was a 52x30 ellipse on a near
       * fixture — six hundred cells of somebody else's facade repainted in the sign's hue, which
       * is not a sign lighting a wall, it is a sign eating one. Half that radius still puts a
       * clear pool of colour around every fixture and leaves the facade underneath legible. */
      var gr = span * 0.55 + 1.8; if (gr > 15) gr = 15;
      var gy = hRows * 0.55 + 1.4; if (gy > 9) gy = 9;
      /* A dim fixture casts a dim pool: the halo is a fraction of the source and not a constant,
       * or a ticker at 0.86 peak lights the street as hard as a marquee at full. */
      castGlow(frame, cxs, cys, gr, gy, BD.hue,
               BD.halo * AT.halo * clamp(BD.peak / 210, 0.40, 1.20), distMid);
    }

    var hit = 0, x, r, s, iw, w, u, sp, len, dist, yBot, yTop, vspan, r0, r1, v, lum;
    for (x = xa; x <= xb; x++) {
      s = (x + 0.5 - xL) / span;
      if (s < 0) s = 0; else if (s > 1) s = 1;
      iw = (1 - s) / wL + s / wR;
      w = 1 / iw;
      u = (s / wR) / iw;
      sp = (2 * (x + 0.5) / cols - 1) * CO.hp;
      len = Math.sqrt(1 + sp * sp);
      dist = w * len * 0.996;
      yBot = CO.horizon - (GEO.v0 - CO.eyeY) * CO.scale / w;
      yTop = yBot - GEO.H * CO.scale / w;
      vspan = yBot - yTop;
      if (vspan < 0.4) vspan = 0.4;
      r0 = Math.ceil(yTop); r1 = Math.floor(yBot);
      if (r0 < 0) r0 = 0; if (r1 > rows - 1) r1 = rows - 1;
      if (r1 < r0) continue;
      for (r = r0; r <= r1; r++) {
        v = (yBot - (r + 0.5)) / vspan;
        if (v < 0) v = 0; else if (v > 1) v = 1;
        /* Thinned in the fixture's own grid at three times its resolution, so the holes stay put
         * on the sign as you walk towards it instead of crawling across it. */
        if (BD.dens < 1 && hk((u * BD.ncW * 3) | 0, (v * BD.nrW * 3) | 0, BD.sd, 4) > BD.dens) continue;
        if (!shade(u, v, t)) {
          /* THE CASE. A sign is an object bolted to a wall, not a stencil cut into one, and until
           * this line the cells a construction leaves dark showed the facade straight through —
           * so a fixture arrived as a handful of loose marks scattered across the window lattice,
           * in the lattice's own glyphs and the lattice's own two hues. That is the whole of why
           * the small styles do not read: at the median fixture, 3 screen columns at 30 m, there
           * is no construction left to see, only its ink, and its ink is indistinguishable from
           * lit windows. The one style everybody agrees reads — the marquee — is the one whose
           * ink happens to be contiguous.
           *
           * The case fixes that for every style at once and costs no light: it is the sign's own
           * dark box, at a tenth of its brightness in the shadow swatch, filling exactly the cells
           * the construction does not. What it buys is a SILHOUETTE — the lattice stops dead at
           * the fixture's edge — and a silhouette is the cue that says object rather than
           * lit-window-cluster. It writes dark cells over bright wall, so it takes lit coverage
           * away rather than adding any, which is the only kind of legibility this frame budget
           * can afford.
           *
           * It goes down at the board's own depth, so it occludes honestly, and it is static: no
           * cell of it moves at any rate, and it can only ever make the fixture's total energy
           * smaller. */
          if (!BD.cased) continue;
          SH.c = BD.hue;
          /* The case takes the fixture's own two letterforms rather than one filler glyph: the
           * box of a sign is lit by the tubes bolted to it, and a flat field of one character
           * reads as a texture swatch where an alternation reads as an object. The parity is
           * taken in the WORLD grid, so it holds still on the sign as the viewer walks instead of
           * crawling across it a cell at a time the way a screen-space parity would. */
          SH.g = ((((u * BD.ncW) | 0) + ((v * BD.nrW) | 0)) & 1) ? BD.gl : BD.gl2;
          SH.k = 0.10;
        }
        /* Toward the fixture's mass as it gets too small to have parts — see BD.lod. */
        if (BD.lod > 0) SH.k += (BD.massk - SH.k) * BD.lod;
        lum = fog(BD.peak * SH.k * AT.dim, dist);
        /* A sign OCCLUDES whether or not it is lit, and the floor here is what enforces that.
         * `if (lum < 5) continue` looks like a harmless saving and is a photosensitivity bug: a
         * fixture guttering across that threshold stops writing its cells for a frame, and every
         * cell of it that happened to be in front of a brighter fixture behind flips to that
         * fixture's value and back. Measured with the styles forced one at a time, that hole was
         * a 56% single-frame step on the wipe and 36% on the screen — by some way the worst
         * artefact in the file, and invisible in the aggregate because it needs two fixtures to
         * overlap. A dark cell is a dark cell; a hole is a flash. */
        if (lum < 4) lum = 4;
        if (put(frame, x, r, SH.g, SH.c, lum, dist)) hit = 1;
      }
    }
    /* Gated on VISIBILITY and not on `hit`, for exactly the reason above: `hit` is false for a
     * frame whenever the fixture is mid-dropout, and a reflection that blinks out with the
     * flicker of its source is a 90% step on every cell of the smear. The image in the road is
     * the sign's steady brightness — water does not strobe. */
    if (vis) wetSmear(frame, cxs, wMid, BD.hue, BD.peak, BD.sd);
    return hit;
  }

  CC.ELEMENTS.push({
    name: 'neon',
    layer: 30,

    init: function (city, rng) {
      this.city = city;
      NE.salt = (rng() * 2147483647) | 0;
    },

    update: function () {},

    draw: function (frame, cam, t) {
      var city = this.city;
      if (!city) return;
      setCam(frame, cam);
      airPrep();

      var R = 58;
      var gx0 = Math.floor(CO.ox - R), gx1 = Math.floor(CO.ox + R);
      var gz0 = Math.floor(CO.oz - R), gz1 = Math.floor(CO.oz + R);
      var drawn = 0, gx, gz;

      /* Stride 1 for the same reason the spill uses it: a wall's frontage is one column of
       * constant gx, and any stride at all makes whether a facade carries signage depend on the
       * parity of the camera's own cell. */
      for (gz = gz0; gz <= gz1; gz++) {
        for (gx = gx0; gx <= gx1; gx++) {
          /* The cap counts fixtures that actually reached the frame, not fixtures considered.
           * Counting attempts lets a row of signs hidden behind the near block spend the whole
           * budget and leave the visible street bare. */
          if (drawn > SIGN_CAP) return;
          var rx = gx + 0.5 - CO.ox, rz = gz + 0.5 - CO.oz;
          var w = rx * CO.fwx + rz * CO.fwz;
          if (w < 2.2 || w > R) continue;
          var side = rx * CO.rgx + rz * CO.rgz, lim = w * CO.hp + 3;
          if (side > lim || side < -lim) continue;

          /* Cheap rejection FIRST — most cells die here, before a heightmap lookup. */
          if (hk(gx, gz, NE.salt, 0) > 0.105) continue;
          var bh = city.height(gx, gz);
          if (bh < 6) continue;
          if (!faceOf(city, gx, gz, rx, rz)) continue;
          /* The record is only worth building once the cell is certainly a signed facade: cell()
           * is chunk-cached, but the first call for a chunk builds 256 of them. */
          var rec = city.cell(gx, gz);
          if (!rec) continue;

          setupSign(gx, gz, bh, rec, t);
          drawn += board(frame, t);
        }
      }
    }
  });

  /* =============================================================================================
   * 3. TRAFFIC SIGNALS  — layer 31
   * One head each side of a junction, four metres up. Three lamps, one of them alight. This is the
   * only element that is allowed pure saturated red, and it is two cells of it.
   * ========================================================================================== */
  var TS = { salt: 0 };
  var LAMP_V = [4.30, 4.66, 5.02];                   // green low, amber, red high, as they are hung
  var LAMP_C = [P.spring, P.amber, P.red];
  var CYCLE = 46;

  CC.ELEMENTS.push({
    name: 'signals',
    layer: 31,

    init: function (city, rng) {
      this.city = city;
      TS.salt = (rng() * 2147483647) | 0;
    },

    update: function () {},

    draw: function (frame, cam, t) {
      var city = this.city;
      if (!city || !city.aveX) return;
      setCam(frame, cam);
      airPrep();

      var R = 62;
      var k0 = Math.round((CO.ox - R) / city.AVE), k1 = Math.round((CO.ox + R) / city.AVE);
      var m0 = Math.round((CO.oz - R) / city.CROSS), m1 = Math.round((CO.oz + R) / city.CROSS);
      var k, m, s;

      for (k = k0; k <= k1; k++) {
        var aw = city.aveW(k);
        if (aw < 3) continue;                        // an alley mouth gets no signal head
        var ix = city.aveX(k) + 0.5;
        for (m = m0; m <= m1; m++) {
          var cw = city.crossW(m);
          if (cw < 2) continue;
          var iz = city.crossZ(m) + 0.5;

          /* Phase is per junction and never per frame, so the lights keep time through a scrub
           * and two heads at the same crossing always agree with each other. */
          var phase = hk(k, m, TS.salt, 1) * CYCLE;
          var u = CC.reducedMotion ? phase : (t + phase) % CYCLE;
          if (u < 0) u += CYCLE;
          var on = u < 21 ? 0 : (u < 25 ? 1 : 2);
          /* The amber is the only lamp that blinks; a steady frame of it looks like a dead pixel
           * rather than the four seconds of warning it is. 9 rad/s is 1.43 Hz — under the ceiling,
           * and a sine rather than a square, so its worst frame moves the lamp 0.45*9/60 = 6.8% of
           * full scale. The lamp CHANGES, on the other hand, are hard cuts of most of full scale,
           * and are meant to be: a traffic light is the one object here that is supposed to snap.
           * They cost a given cell about six steps per 46 s cycle, which is what tells them apart
           * from a flicker edge — see the rate column in tools/flicker-rate.cjs. */
          var blink = (on === 1 && !CC.reducedMotion) ? (0.55 + 0.45 * Math.sin(u * 9)) : 1;

          var zs = hk(k, m, TS.salt, 2) < 0.5 ? -1 : 1;
          for (s = -1; s <= 1; s += 2) {
            /* aw/cw are half-widths in CELLS, so the carriageway reaches aw + 0.5 either side of
             * the centreline. Hanging the head at aw + 1.1 put every one of them a metre inside
             * the corner building, where the height test then silently dropped it. */
            var hx = ix + s * (aw - 0.2), hz = iz + zs * (cw + 0.9);
            if (city.height(hx, hz) > 0) continue;   // the corner got eaten by a plaza or a lot
            var lit = 0, lw = 0, lx = 0;
            for (var li = 0; li < 3; li++) {
              if (!project(hx, LAMP_V[li], hz)) break;
              var near = VP.dist < 21;
              if (li !== on && !near) continue;      // far off, only the burning lamp survives
              var lum = li === on ? fog(236 * blink * AT.dim, VP.dist) : fog(15, VP.dist);
              if (lum < 5) continue;
              put(frame, Math.round(VP.x), Math.round(VP.y),
                  li === on ? G_O : G_oo, li === on ? LAMP_C[li] : P.shadow, lum, VP.dist);
              if (li === on) { lw = VP.w; lx = VP.x; }
              lit++;
            }
            /* The head's own body, one cell under the bottom lamp, only when it is close enough
             * for the lamps to have separated into their own rows. */
            if (lit && VP.dist < 15 && project(hx, 4.05, hz))
              put(frame, Math.round(VP.x), Math.round(VP.y), G_EQ, P.shadow,
                  fog(20, VP.dist), VP.dist);
            /* A stop lamp on a wet road is the most reliably reflected object in a night street —
             * it is the brightest saturated thing at the lowest height. Same smear the signs use,
             * at a third of the strength: the head is two cells and its reflection may not become
             * the larger object. */
            if (lw > 0) wetSmear(frame, lx, lw, LAMP_C[on], 96, TS.salt & 0x7fff);
          }
        }
      }
    }
  });

  /* =============================================================================================
   * 4. HOLOGRAPHIC ADVERTS  — layer 33
   * Hung over the carriageway, camera-facing because a hologram has no back. Interlaced and heavily
   * dropped out: a holo you can't see the sky through is just a billboard.
   * ========================================================================================== */
  var HO = { salt: 0 };
  var HZ = 30;                                       // metres between advert slots down an avenue
  /* How much of a character row the vertical resample below spends crossfading between the two
   * rows a screen row straddles — see the long note in the draw loop. Away from that window the
   * cell shows exactly one character row and prints exactly what it always printed; inside it the
   * two are mixed, which is what removes the pop and also what costs coverage, since a cell is lit
   * if EITHER row lights it and the advert is 50% dropout by design.
   *
   * The width is set by LOOKING, not by the step, because over the whole range 0.25..1.00 the
   * measured worst per-cell frame step only moves between 3.5% and 4.3% of full scale — the scan
   * band's own 2.7-3.1% dominates it either way, so the step buys nothing above about 0.3. What
   * does change is the picture: at 0.6 and above a line of copy is visibly DOUBLED for most of the
   * bob's travel, a bright row with a dim ghost of the next row under it (seed 99, camera frozen at
   * frame 2990, frames 3247-3256, rendered and looked at). That is the failure the brief names —
   * a holo that shimmers permanently is worse than one that pops rarely. At 0.30 the ghost is gone,
   * the panel reads as the single clean row it always did, and the row change still arrives cell by
   * cell at matched luminance instead of as a whole row swapping in one frame. */
  var HXF = 0.30;

  CC.ELEMENTS.push({
    name: 'holo',
    layer: 33,

    init: function (city, rng) {
      this.city = city;
      HO.salt = (rng() * 2147483647) | 0;
    },

    update: function () {},

    draw: function (frame, cam, t) {
      var city = this.city;
      if (!city || !city.aveX) return;
      setCam(frame, cam);
      airPrep();

      /* Only the camera's own avenue and its immediate neighbours. An advert hung over an
       * avenue two blocks away is behind thirty metres of building in a canyon this deep: it can
       * never be seen, but it can still spend the per-frame budget. */
      var kn = Math.round(CO.ox / city.AVE), k0 = kn - 1, k1 = kn + 1;
      var j0 = Math.floor((CO.oz - 30) / HZ), j1 = Math.floor((CO.oz + 105) / HZ);
      var rows = CO.rows, cols = CO.cols, drawn = 0, k, j;

      for (k = k0; k <= k1; k++) {
        var aw = city.aveW(k);
        if (aw < 3) continue;                        // needs a canyon wide enough to hang in
        var ax = city.aveX(k) + 0.5;
        for (j = j0; j <= j1; j++) {
          if (drawn > 1) return;   // two panels in one frame is already a crowded sky
          if (hk(k, j, HO.salt, 0) > 0.42) continue;

          var hx = ax + (hk(k, j, HO.salt, 1) - 0.5) * aw * 1.1;
          var hz = j * HZ + hk(k, j, HO.salt, 2) * (HZ - 6);
          var hy = 5.4 + hk(k, j, HO.salt, 3) * 4.6;   // between the facades, not above them
          var ph = hk(k, j, HO.salt, 4);
          if (!CC.reducedMotion) hy += Math.sin(t * 0.33 + ph * 6.283) * 0.28;

          if (!project(hx, hy, hz)) continue;
          var d = VP.dist;
          /* Under ~18 m one advert is half the frame. Fading it out instead of popping it lets
           * the viewer walk under it and watch it dissolve overhead, which is the nicer read
           * anyway. */
          if (d < 17) continue;
          var near = d < 34 ? clamp((d - 17) / 17, 0, 1) : 1;
          /* A projection is made of the air it is projected into, so fog takes it faster than it
           * takes a glass tube — but it is also the one object that gets a halo out of the murk
           * rather than only losing to it. Exactly 1.0 at the preset the panel was tuned under. */
          near *= clamp(AT.dim * 0.92 + 0.08 * AT.halo, 0.42, 1.12);
          /* AND THE FAR END, which the panel never had. 335 is the brightest value any cell of this
           * shader can carry — the dropout keeps h2 at or under 0.50, so the copy tops out at
           * 72 + 0.50*250 = 197, and the scan band multiplies that by at most 1.7 — so if that
           * cannot clear the luminance floor after fog, no cell of this panel can, at any phase of
           * its scan. Measured over eight seeds x 3000 frames at 400x100, that is exactly the
           * 120 m+ band where the panel's brightest printed cell is already 0: nothing visible is
           * being removed. What IS being removed is a panel that draws nothing and yet reaches
           * `drawn` below, which is the same defect the k range at the top of this loop was
           * narrowed to fix — an advert nobody can see spending the two-panel budget. */
          if (fog(335 * near, d) < 5) continue;

          var W = 3.4 + hk(k, j, HO.salt, 5) * 3.0;
          var H = 2.2 + hk(k, j, HO.salt, 6) * 2.2;
          var hw = colsFor(W * 0.5, VP.w);
          var hh = H * 0.5 * CO.scale / VP.w;
          if (hw < 0.8 || hh < 0.6) continue;

          /* The panel's own extent, kept UNCLAMPED — every index below is measured from it.
           * Indexing off the clamped bounds instead welded the copy to the VIEWPORT: the moment a
           * panel touched a frame edge, (x - xa) and (y - ya) jumped and the whole layout re-rolled
           * frame by frame, and the edge stroke was drawn along the screen border instead of along
           * the advert. That happens on every panel in the last seconds before the 17 m cull,
           * which is exactly when it is biggest. */
          var pL = VP.x - hw, pT = VP.y - hh;
          var xa0 = Math.floor(pL), xb0 = Math.ceil(VP.x + hw);
          var ya0 = Math.floor(pT), yb0 = Math.ceil(VP.y + hh);
          var xa = xa0 < 0 ? 0 : xa0, xb = xb0 > cols - 1 ? cols - 1 : xb0;
          var ya = ya0 < 0 ? 0 : ya0, yb = yb0 > rows - 1 ? rows - 1 : yb0;
          if (xb < xa || yb < ya) continue;

          /* The advert's own character grid, ~0.30 m a cell and fixed for the life of the panel
           * because W and H are. Copy is laid out in THIS grid, never in screen cells, so walking
           * towards a panel enlarges its lettering instead of re-rolling it — near, one grid cell
           * covers the two or three screen cells that make a letter read as a letter. */
          var NC = Math.round(W / 0.30); if (NC < 4) NC = 4;
          var NR = Math.round(H / 0.30); if (NR < 3) NR = 3;

          var hr = hk(k, j, HO.salt, 7);
          /* Weighted hard toward the pillars. One advert is a hundred-odd cells, so a green or
           * violet panel does not read as a garnish the way a green window does — it swings the
           * whole frame's colour balance on its own. Azure leads, ice backs it, and the two
           * accents are there to be caught once in a while and not to be expected. */
          var hue = hr < 0.54 ? P.azure : (hr < 0.86 ? P.ice : (hr < 0.94 ? P.violet : P.spring));
          /* The scan band is what sells it as projected rather than printed. Frozen under reduced
           * motion, which leaves a static band — still legible as a screen, just not moving.
           * 0.30 Hz, so the band itself is nowhere near the flash band; what mattered was its
           * EDGE, see the profile below. */
          var sweep = CC.reducedMotion ? ph : (ph + t * 0.30) % 1;
          var cover = 0;

          /* ---- the vertical resample, and the pop it exists to delete ------------------------
           * The panel bobs 0.28 m on a 19 s sine, so pT — and nothing else about the panel, since
           * hy does not enter VP.w or VP.dist — creeps down the screen raster and back. Until this
           * block the copy was point-sampled out of that creep: `ri = (gv * NR) | 0` picked ONE
           * character row per screen row, and every time gv*NR crossed an integer the screen row
           * swapped which row of the advert it was showing. The advert is 50% dropout by design and
           * its rows are independent hashes, so that swap lands a lit cell on what was a hole and a
           * hole on what was lit: measured by tools/flicker-rate.cjs part 2, up to 98.8% of full
           * scale in one frame in clear air (52.5% in mist, which only damps it), at 0.20-0.25
           * crossings a second. Part 3 of the same tool deletes the bob line from the source and the
           * worst step collapses to 1.6-3.1%, which is the scan band and nothing else — so the bob
           * was the whole of it. It PASSES the tool, because 0.25 Hz is nowhere near the 3 Hz
           * photosensitivity ceiling; it was the largest single-cell discontinuity in the build
           * anyway, and no statistic in the repo could see it because it is one cell wide.
           *
           * Neither of the other two obvious fixes works. Quantising the bob to whole cells makes
           * the teleport rarer and not smaller — it is still a full-scale step on every cell of the
           * panel at once, which is worse. Dithering the crossing over several frames spreads it
           * into exactly the high-frequency noise the whole file is built to avoid. What is left is
           * to stop point-sampling: reconstruct each screen row from the TWO character rows it
           * straddles, and CROSSFADE between them across a window HXF of a character row wide
           * centred on the boundary the old code stepped over. The two weights sum to 1 everywhere,
           * so the advert's integrated brightness is unchanged; outside the window one weight is
           * exactly 1 and the cell prints exactly what it printed before; inside it the cell walks
           * from one row's value to the other's instead of jumping.
           *
           * The travel rate is what makes a window that narrow enough: the bob's peak speed in
           * character rows is 0.28*0.33 * NR/H, and NR = round(H/0.30) fixes NR/H at 3.33, so it is
           * 0.31 character rows a second AT ANY DISTANCE — the scale and the depth cancel out of the
           * expression entirely. A smoothstep of width HXF therefore moves a weight by at most
           * 1.5*0.0051/HXF = 0.026 per frame at HXF 0.30, which on the brightest cell the shader can
           * paint is under 3% of full scale.
           *
           * MEASURED ON THE WHOLE ELEMENT, by running tools/flicker-rate.cjs part 2 against this file
           * and against a reconstruction of the point-sampled code it replaced — a reconstruction and
           * not the historical file, which this tree keeps no history of, so it reverts exactly the
           * four things described above and nothing else: point-sampled ri with the clamp, the row
           * loop back inside ya..yb with no margin, the stroke pinned to `y === Math.floor(pT)`, and
           * no lineOnly. Reverting the resample alone still measures 86-98% and reverting the stroke
           * alone 44.7-80.4%, so those are two independent full-scale faults and not one fault seen
           * twice — which is why both halves of this block have to stay.
           * Over the tool's own four seeds and
           * all six skies the worst per-cell frame step goes 45.9-98.0% -> 2.4-3.9%, and the rate
           * that decides the verdict goes 0.100-0.350 big steps a second -> 0.000 in every sky. Both
           * low ends are mist, which damps the panel and everything else; clear is the worst sky and
           * the one to quote, 86.3-98.0% before. There is ONE exception to the after range, it is not
           * this expression's, and it is written out below. Over
           * a 24-seed sweep in clear air (3001 + 137k) it goes min 45.5 / median 89.0 / p90 98.8 /
           * max 100.0% -> min 2.0 / median 3.9 / p90 3.9 / max 4.3%. Part 3's bob-deleted panel
           * reads 2.0-3.1% under the same skies, so the moving panel now sits at the still panel's
           * own floor, which is the definition of the bob no longer popping. The previous revision
           * of this paragraph quoted "2.7-3.9% ... over four seeds and six skies", which is the
           * range with seed 42 left out of it, and 51-98% for the old code where the reconstruction
           * measures 86-98 — quote the outlier or the next reader believes a bound that does not
           * hold.
           *
           * AND THE TRADE WAS CHECKED, because it is the one this fix could plausibly have made and
           * NEITHER number the tool prints can see it: a crossfade that shimmered permanently would
           * improve both the worst step and the over-34%/s rate while making the panel worse. So the
           * per-cell 3-20 Hz band — part 1's statistic, Hann-windowed, applied to the fixture instead
           * of to flick() — was measured over every painted cell, eight bearings, 20 s, in clear and
           * in storm: worst cell 1.24-2.44% of full scale before against 0.24-0.41% after, and three
           * cells over part 1's own 2% ceiling before (clear, seed 7) against none after. The mean
           * absolute frame-to-frame change over painted cells FELL in the same runs, 0.071-0.126% ->
           * 0.051-0.088%. The panel moves LESS on average, not more, so nothing was traded: the
           * crossfade did not spread the pop into a shimmer, it removed it.
           *
           * THE ONE RESIDUAL, and it belongs to the print floor rather than to the resample: seed 42,
           * yaw 0, t=3.033 s, cell (101,25) at 200x60 steps 42 -> 5 in a single frame, 14.5% of full
           * scale (11.4-14.5% across the five non-mist skies, 3.1% in mist), on 1 seed in the 28
           * measured and at 0.000 big steps a second. Two panels overlap there: a near one at 48 m
           * whose top stroke is crossfading onto an INTERLACED row at ew ~ 0.11, and a far one at
           * 93 m directly behind it. The near stroke's whole value on a lineOnly row is 74*ew*near
           * (band does not multiply a stroke), and the bob walks ew through the `lum < 5` floor
           * further down this loop: at ew 0.1086 that is 8.89, which fogs to 4 and is dropped, and
           * one frame later ew 0.1111 gives 9.09, which fogs to 5 and prints. On the frame it prints
           * it takes the depth slot and hides a 42-lum copy cell of the panel behind.
           * So the panel that MOVED changed by one unit and a different panel lost forty: a hard
           * threshold plus an occlusion, which no amount of resampling touches. The fix for it is to
           * make a hologram composite as light rather than as a surface — never darken a cell it
           * lands on — and that is a change to how this element meets the entire world pass, with a
           * real coverage risk against bright facades, so it is recorded here for whoever owns that
           * decision instead of being slipped in under a bob fix.
           *
           * The GLYPH still switches, at the instant the two contributions cross, and that is
           * deliberate: a glyph change at equal luminance is a shape change and not a luminance
           * edge, which is the same licence the ticker's 2 Hz scroll runs on.
           *
           * The panel's top and bottom rows fall out of the same machinery for free. A character row
           * outside 0..NR-1 simply contributes nothing, so the leading row fades in over the
           * crossing instead of switching on — where the old code clamped ri and printed the edge
           * row at full strength right up to the frame it vanished. */
          var NRi = NR / (2 * hh);             // character rows per screen row; constant per panel
          var pB = pT + 2 * hh;
          var edged = hh > 1.2, laced = hh > 1.6;
          /* One row of margin each side: the row just outside the old bounds is exactly the one the
           * crossfades are fading in, and clipping it back to the old bounds would put the switch
           * edge back at the panel's rim, which is where it is most visible. */
          var yLo = ya - 1; if (yLo < 0) yLo = 0;
          var yHi = yb + 1; if (yHi > rows - 1) yHi = rows - 1;
          var y, yc, ew, eT, eB, gv, band, gr, mA, mB, wA, wB, lwA, lwB, lwMax, lineOnly;
          var x, gu, cb, val, best, gsel, h2, vv, lum;

          for (y = yLo; y <= yHi; y++) {
            yc = y + 0.5;
            /* The top and bottom strokes are the panel's only continuous lines and they used to be
             * nailed to `y === Math.floor(pT)`, which is a cell index and therefore teleports a
             * whole stroke one row every time the bob crosses a boundary — 74 of 255 arriving on one
             * row and leaving another in a single frame. Spread over the two rows the stroke
             * straddles, with weights that sum to 1, it slides instead. */
            ew = 0;
            if (edged) {
              eT = 1 - (yc > pT ? yc - pT : pT - yc);
              eB = 1 - (yc > pB ? yc - pB : pB - yc);
              ew = eT > eB ? eT : eB;
              if (ew < 0) ew = 0;
            }
            /* Interlace, in SCREEN rows. A projection you cannot see the street through is a
             * billboard, and a billboard hanging in the air with nothing holding it up looks like
             * a bug. Screen rows and not panel rows: the missing lines are the display's, so they
             * hold still while the panel drifts across them, and there is no rate at which the
             * comb can beat against the panel's own grid. */
            if (ew <= 0 && (y & 1) === 1 && laced) continue;
            /* AND AN INTERLACED ROW THAT IS ONLY IN THE FRAME BECAUSE THE STROKE REACHED IT CARRIES
             * THE STROKE AND NOTHING ELSE. This one line is most of the 98.8% pop. The old code
             * pinned the stroke to `y === Math.floor(pT)`, so a bob crossing flipped an odd row from
             * skipped to drawn and an even row from stroke to copy — and copy is up to 322 against
             * the stroke's 74, so a cell went from black to 247 in one frame (probed at seed 0, yaw
             * 4.71, t=11.617, cell 58,23). Resampling the copy does not touch that: it is the row's
             * ROLE changing, not its content. An odd row that only ever carries a stroke whose
             * weight starts at zero can only ever fade in. */
            lineOnly = laced && (y & 1) === 1;
            gv = (yc - pT) / (2 * hh);
            /* The band's PROFILE, and it is a profile rather than a test for the same reason the
             * neon starter is a crossfade rather than a threshold. `Math.abs(gv - sweep) < 0.14`
             * put a hard edge on a smooth sweep: every cell the edge passed over jumped the full
             * 0.7 of the boost in one frame, which on a bright panel cell is 225 of 255 — the
             * largest single-frame change anywhere in this file, measured at 92% of full scale
             * happening 0.95 times a second per panel, worse than the neon step that started this
             * audit and hidden from every frame-level statistic because it is one cell wide.
             * A plateau inside 0.10 falling to nothing by 0.20 keeps the same integrated boost
             * (2*(0.10 + 0.10/2)*0.7 = 0.21 against the old 2*0.14*0.7 = 0.196, so the panel's
             * exposure does not move) and the same tight bright line, at 6.6% of full scale a
             * frame. The distance is measured the short way round the wrap: at 0.30 Hz the sweep
             * crosses 1 back to 0 every 3.3 s, and a band that teleports from the bottom of the
             * panel to the top is the same step edge in a different costume. */
            band = 1 + 0.7 * crest(gv - sweep, 0.10, 0.10);
            /* The two character rows this screen row straddles. gr is the row centre measured in
             * character rows with the half-row offset already taken out, so gr - mA - 0.5 is the
             * signed distance to the boundary between them and the crossfade is centred there: at
             * the character row's own centre one weight is 1 and the resample is a no-op, and only
             * within HXF of the boundary do both rows contribute. A tap off either end of the copy
             * is simply absent, which is what fades the panel's first and last row in and out. */
            gr = (yc - pT) * NRi - 0.5;
            mA = Math.floor(gr);
            mB = mA + 1;
            wB = CC.smooth(clamp((gr - mA - 0.5) / HXF + 0.5, 0, 1));
            wA = 1 - wB;
            if (mA < 0 || mA >= NR) wA = 0;
            if (mB < 0 || mB >= NR) wB = 0;
            if (lineOnly) { wA = 0; wB = 0; }
            if (wA <= 0 && wB <= 0 && ew <= 0) continue;
            /* Ragged right margin: each line stops somewhere different, which is what makes a
             * block of dropout read as lines of copy instead of as noise. It is a property of the
             * character row, so each tap carries its own and the scan runs to the longer of the
             * two — a line whose neighbour is longer now fades out along its own end rather than
             * being cut off at a hard column. */
            lwA = wA > 0 ? 0.42 + 0.58 * hk(mA, j * 31 + k, HO.salt, 8) : 0;
            lwB = wB > 0 ? 0.42 + 0.58 * hk(mB, j * 31 + k, HO.salt, 8) : 0;
            lwMax = ew > 0 ? 1 : (lwA > lwB ? lwA : lwB);
            for (x = xa; x <= xb; x++) {
              gu = (x + 0.5 - pL) / (2 * hw);
              if (gu > lwMax) break;
              cb = (gu * NC) | 0;
              if (cb < 0) cb = 0; else if (cb >= NC) cb = NC - 1;
              val = 0; best = 0; gsel = G_DASH;
              if (wA > 0 && gu <= lwA) {
                h2 = hk(cb + j * 13, mA + k * 7, HO.salt, 9);
                if (h2 <= 0.50) {
                  vv = wA * (72 + h2 * 250);
                  val += vv;
                  if (vv > best) { best = vv; gsel = HOLO_G[((h2 * 1361) | 0) % HOLO_N]; }
                }
              }
              if (wB > 0 && gu <= lwB) {
                h2 = hk(cb + j * 13, mB + k * 7, HO.salt, 9);
                if (h2 <= 0.50) {
                  vv = wB * (72 + h2 * 250);
                  val += vv;
                  if (vv > best) { best = vv; gsel = HOLO_G[((h2 * 1361) | 0) % HOLO_N]; }
                }
              }
              val *= band; best *= band;
              /* The top and bottom edges are the only continuous strokes on the panel. Without
               * them the dropout above reads as glyphs scattered in mid-air rather than as an
               * object with a boundary; with them it snaps into a rectangle immediately. Dashed,
               * so the frame stays a hint.
               *
               * The stroke TAKES THE ROW OVER in proportion to ew rather than adding to it, and
               * that is not cosmetic. At ew = 1 the row is exactly what it always was — dashes on
               * the even character columns and nothing else — so the panel's brightness and cell
               * count at rest are unchanged. Adding instead was measured and rejected: it made the
               * two boundary rows carry copy AND stroke, and the extra light was enough to push a
               * panel 114 m down the avenue over the lum floor for the first time. That panel then
               * counted against `drawn`, and the two-panel budget it consumed belonged to a panel
               * 23 m away — so a fixture nobody could see switched a big near advert on and off
               * bodily, at seed 3, frames 1221/1341/1536. A crossfade cannot do that because at
               * full weight it adds nothing. */
              if (ew > 0) {
                val *= 1 - ew; best *= 1 - ew;
                if ((cb & 1) === 0) {
                  vv = 74 * ew;
                  val += vv;
                  if (vv > best) { best = vv; gsel = G_DASH; }
                }
              }
              if (val <= 0) continue;
              lum = fog(val * near, d);
              /* LANDING IS A DEPTH FACT, NOT A BRIGHTNESS ONE, and `drawn` below counts landings.
               * Counting only cells that actually printed made the two-panel budget hinge on one
               * cell of the panel clearing the luminance floor this frame, which for a panel in
               * the 110-120 m band — where the brightest printed cell is 5 to 14 — is a coin the
               * scan band tosses several times a second. Frozen camera, seed 3, frame 1217: a panel
               * at 114 m flipped its landing every few frames and each flip handed or withdrew the
               * budget of a 700-cell advert 23 m away, which switched that advert on and off
               * bodily. `cover` records that a cell of this panel was in front of what the world
               * pass had already put there, whether or not it was bright enough to print, so an
               * occluded panel still costs nothing and a dim one stops blinking the budget. */
              if (lum < 5) {
                if (!cover && d < frame.dist[y * cols + x]) cover = 1;
                continue;
              }
              if (put(frame, x, y, gsel, hue, lum, d)) cover = 1;
            }
          }
          drawn += cover;
        }
      }
    }
  });

})(typeof CC !== 'undefined' ? CC : require('../core.js'));
