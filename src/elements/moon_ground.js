/* CyberCity Moonwalk — the sky and the things standing on the plain. Layers 3-15.
 *
 * surf_moon.js paints the SURFACE: regolith, rock flanks, small craters, the star field, and it
 * owns the key light. This file paints the six OBJECTS that surface has no way to draw, and every
 * one of them is here because a lunar frame without it reads as a black rectangle with grit in it:
 *
 *   the MASSIF     layer  3   the far wall of the mare, a pure function of bearing
 *   the STARS      layer  4   the bright ones, as objects rather than as a hash field
 *   EARTH          layer  5   nailed to the sky, and the reason this is a different world
 *   the SUN        layer  6   three cells, no halo, and the halo's absence is the whole point
 *   the BOOTPRINTS layer 14   two traverses wandering off across the plain, crossing at a right angle
 *   the BOULDERS   layer 15   rocks, and — far more importantly — the shadows they throw
 *
 * ---- THE ONE ARGUMENT THIS FILE IS BUILT ON ------------------------------------------------------
 * west_range.js opens with "empty ground rendered honestly is empty", and the Moon is the worse
 * case of that sentence: no vegetation, no fences, no telegraph line, no wind, and — because there
 * is no air — NO AERIAL PERSPECTIVE, so distance carries no colour and no softening either. A
 * regolith plain drawn honestly is a distance-quantised hash field with nothing straight in it,
 * which is television static. Three of the six objects above exist purely to fix that:
 *
 *   the SHADOWS give the plain relief and a light direction. A 1 m boulder at a 8-degree sun throws
 *     7 m of jet black, and that black wedge says where the ground is, where the light is and how
 *     big the rock is in three cells and one filled ellipse. On this world a shadow is FREE — it is
 *     an absence — which makes it the cheapest content in the build.
 *   the BOOTPRINT TRAILS give it lines that converge. It is the same job west_range.js:108's
 *     telegraph does and surf_moon.js's centreline prints do, with one difference that is the
 *     reason it is worth writing twice: the painter's trail is welded to CFG.streetX, i.e. to the
 *     route the camera is walking, so it always runs straight up the middle of the frame and always
 *     will. These WANDER, across the blocks and out of frame and back, and a line that leaves the
 *     picture is what says the place is bigger than the picture.
 *   the MASSIF gives it a horizon that is not a ruled line, and gives the frame a top edge.
 *
 * ---- EVERY CONSTANT ABOUT THE LIGHT COMES OFF CC.SurfMoon ----------------------------------------
 * SUN_AZ, SUN_X, SUN_Z, SUN_ALT, EARTH_AZ, EARTH_ALT and `night` are read through the getters
 * surf_moon.js publishes and are NEVER re-derived from CC.Daylight here. That file rotates the
 * director's azimuth by PI so the sun sits behind the walk, and it compresses the altitude into the
 * Apollo 5-25 degree band; an element that went to the director directly would light its rocks from
 * exactly the opposite side of the world from the ground they stand on. This is the same contract
 * west_town.js / west_range.js / west_sky.js keep with CC.SurfWest.
 *
 * ---- AND EVERY MOVING EDGE IS RAMPED, WHICH IS NOT OPTIONAL --------------------------------------
 * This world's background is lum 0 and its highlights print at v 219-234, so ANY bright cell that
 * appears or disappears is a step of ~90% of full scale — against the project's ceiling of a third.
 * Nothing in this file moves under its own power; what moves is the director's sun, at up to
 * 0.020 rad/s (daylight.js: AZ_SWING 1.35 over a 420 s cycle), and that is enough to sweep a
 * terminator across a rock face, a shadow across the ground and the solar disc across 5.6 columns a
 * second at the reference grid. Three remedies, all of them measured elsewhere in the project and
 * re-used here rather than re-invented:
 *
 *   1. THE SOLAR DISC IS AREA-SAMPLED. A hard-edged three-cell disc travelling 5.6 columns/s turns
 *      each cell on and off in 0.18 s, i.e. at ~5 Hz in the middle of the flash band at ~90%
 *      amplitude. Coverage anti-aliasing turns that switch into a ramp: the per-frame step becomes
 *      255 * 5.6/60 = 24, under 10% of full scale, and the fundamental drops below 3 Hz.
 *   2. EVERY TERMINATOR IS DITHERED AND THEN RAMPED, exactly as surf_moon.js's facade() does and
 *      for the reason it measured: a threshold branch flips a whole face in one frame (2.5% in the
 *      3-20 Hz band against a 2% gate), a per-cell dither on a stable hash spreads the same
 *      handover over the ~1300 frames the terminator takes to cross, and holding the last 0.26 of
 *      the ramp at 24-100% puts the individual flip at 17% of full scale.
 *   3. THE SHADOWS HAVE A PENUMBRA, and unusually it is the honest one. The sun subtends 0.0093 rad,
 *      which at normal incidence is 5 cm at 6 m and sub-cell — but a shadow on the ground is a
 *      GRAZING intersection, so the penumbra is stretched by 1/sin(alt): 0.0093 * L / sin(alt) is
 *      40 cm at the tip of a 6 m shadow at an 8-degree sun, which is eleven columns at 10 m. The
 *      physically correct soft edge is comfortably wider than the flicker gate needs.
 *   4. NOTHING ANYWHERE MAY TAKE THE SIGN OF A SUN-RELATIVE ANGLE, and this file learned that the
 *      expensive way. The massif's first lighting model multiplied two signs together, one of them
 *      sign(sun bearing - column bearing); the sun crosses a column's bearing about twice a second,
 *      and every time it did, thirteen rows of mountain inverted in one frame. Measured with the
 *      camera pinned and the daylight clock running, 120x40, 4 s: 32.5 big steps per second and
 *      5.94% in the 3-20 Hz band, against gates of 1.0/s and 2%. The replacement is a cosine — see
 *      drawMassif. If you are tempted by a `> 0 ? 1 : -1` anywhere near the sun, this is the fault.
 *
 * MEASURED AFTER ALL FOUR, with the camera pinned and the clock running, at midnight, dawn and noon,
 * and at a yaw with the solar disc in frame: worst step 21.2% of full scale, BIG-STEP RATE 0.00/s on
 * every one of the six, worst 3-20 Hz 0.67% (the sun's own AA ramp). Gates are 1.0/s and 2%.
 */
(function (CC) {
  'use strict';

  var P = CC.P, g = CC.g, put = CC.put, hash1 = CC.hash1, hash2 = CC.hash2, clamp = CC.clamp;

  /* No `'` and no backtick, which is worth one line: surf_moon.js leans on both for the soft crest
   * of a mound of fines, and nothing in THIS file is a mound of fines. Everything here is either a
   * rock, a mountain, a mark pressed into powder or a body in the sky, and all four have edges. */
  var G_DOT = g('.'), G_COMMA = g(','), G_COLON = g(':'), G_SEMI = g(';'),
      G_DASH = g('-'), G_UNDER = g('_'), G_EQ = g('='), G_PLUS = g('+'),
      G_STAR = g('*'), G_HASH = g('#'), G_PCT = g('%'), G_8 = g('8'), G_O = g('O'), G_o = g('o'),
      G_X = g('X'), G_AT = g('@');

  /* Parked past Surf.fogEnd so any facade, any rock and any grain of regolith wins the depth test
   * against them, and ordered among themselves so the sky stacks correctly: the massif stands in
   * front of the stars, Earth stands in front of the massif, and the sun stands in front of
   * everything. sky.js and west_sky.js use the identical mechanism with the identical magnitudes,
   * which is why these numbers look arbitrary and are not — D_STAR 1.0e5 is sky.js:57's own value
   * and the rest are hung off it. */
  var D_STAR = 1.00e5, D_RIDGE = 9.2e4, D_EARTH = 8.4e4, D_SUN = 8.0e4;

  var CITY = null, BASE = 0, Surf = null, MOON = null;
  function boot(city) {
    CITY = (city && city.aveX && city.world === 'moon') ? city : null;
    /* Derived from the city seed, never drawn from the shared rng, and that is deliberate on a
     * world whose element files are being written in parallel. main.js:147 warns that every
     * element pulls from ONE stream in layer order, so a single rng() draw in here would re-deal
     * every moon element below layer 15 — including files this one has never seen. hash1 of the
     * seed costs the same and shifts nothing. */
    BASE = CITY ? ((Math.imul(CITY.seed | 0, 40507) >>> 6) & 0x3fffff) : 0;
  }

  /* ---- camera basis, and the inverse of it --------------------------------------------------------
   * The forward half is west_range.js:36-72 verbatim, because it must be: any disagreement with
   * raycast.js's projection and an object sinks into the ground or floats over it. The INVERSE half
   * (groundAt, below) is new in this file and is what makes the shadows and the bootprints exact. */
  var V = {
    cols: 0, rows: 0, half: 0.7265, colK: 0, colMid: 0, scale: 77, horizon: 33, eyeY: 1.7,
    fwx: 0, fwz: 1, rgx: 1, rgz: 0, ox: 0, oz: 0, yaw: 0, far: 240
  };

  /* `t` is not a parameter of this view block and that is not an oversight: nothing in this file is
   * a function of time except through CC.Daylight, which every draw reads fresh off CC.SurfMoon.
   * There is no phase to advance and no state to carry. */
  function view(f, cam) {
    if (!Surf) { Surf = CC.Surf; MOON = CC.SurfMoon; }
    var fov = cam.fov || 1.25;
    V.half = Math.tan(fov * 0.5);
    V.cols = f.cols; V.rows = f.rows;
    V.colK = f.cols * 0.5 / V.half; V.colMid = f.cols * 0.5;
    V.scale = cam.scaleY !== undefined ? cam.scaleY : (f.cols * (cam.cellAspect || 0.5625)) / (2 * V.half);
    V.horizon = cam.horizon !== undefined ? cam.horizon : f.rows * 0.56;
    V.eyeY = cam.eyeY !== undefined ? cam.eyeY : 1.7;
    V.yaw = cam.yaw || 0;
    V.fwx = Math.sin(V.yaw); V.fwz = Math.cos(V.yaw);
    V.rgx = Math.cos(V.yaw); V.rgz = -Math.sin(V.yaw);
    V.ox = cam.x; V.oz = cam.z;
    V.far = Surf ? Surf.FOG_END : 240;
  }

  /* The key light, always through surf_moon.js's getters. The fallbacks are the picture a
   * standalone require() gets with no painter loaded: a 14-degree sun dead behind the walk, which
   * is that file's own default. */
  function sunAz()  { return MOON ? MOON.SUN_AZ  : Math.PI; }
  function sunX()   { return MOON ? MOON.SUN_X   : Math.sin(Math.PI); }
  function sunZ()   { return MOON ? MOON.SUN_Z   : Math.cos(Math.PI); }
  function sunAlt() { return MOON ? MOON.SUN_ALT : 0.25; }
  function night()  { return MOON ? MOON.night   : 0; }
  function dayMix() { return CC.dayMix === undefined ? 0 : CC.dayMix; }

  var PJ = { x: 0, y: 0, d: 0, w: 0 };
  function project(px, py, pz) {
    var rx = px - V.ox, rz = pz - V.oz;
    var w = rx * V.fwx + rz * V.fwz;
    if (w < 0.40) return false;
    var sp = (rx * V.rgx + rz * V.rgz) / w;
    PJ.w = w;
    PJ.d = w * Math.sqrt(1 + sp * sp);
    PJ.x = sp * V.colK + V.colMid;
    PJ.y = V.horizon - (py - V.eyeY) * V.scale / w;
    return PJ.d < V.far;
  }

  /* Ground-level objects go through the fog ramp; sky objects must NOT, because at d = 9.2e4 the
   * ramp returns zero and a massif would be invisible. Two writers, one line apart, and mixing them
   * up is the mistake the design brief warns about by name. */
  function emit(f, x, y, ch, col, lum, d) {
    if (x < 0 || y < 0 || x >= V.cols || y >= V.rows) return;
    if (lum > 0 && Surf) { lum = Surf.fog(lum, d); if (lum <= 0) ch = 0; }
    put(f, x, y, ch, col, lum, d, 3);
  }
  function plot(f, x, y, ch, col, lum, d) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= V.cols || y >= V.rows) return;
    put(f, x, y, ch, col, lum > 255 ? 255 : lum | 0, d, 3);
  }

  /* ---- THE INVERSE PROJECTION, and why it reads the frame instead of recomputing it ---------------
   * A shadow lying on the ground and a bootprint pressed into it are both FLOOR cells, and the only
   * honest way to draw one is to ask, for each floor cell the caster has already painted, where in
   * the world that cell is. The alternative — rasterising a world-space polygon forward — leaves
   * gaps at grazing incidence, where one screen row spans a metre and a half of ground, and gaps in
   * a shadow are exactly the artefact that makes it stop reading as a shadow.
   *
   * `w` is recovered from the frame's own depth buffer rather than from eyeY/horizon/scale.
   * raycast.js:242 writes `d = w * len` where len = sqrt(1+sp^2) for that column, so dividing the
   * stored distance by len gives back the caster's own forward depth EXACTLY, and the world point
   * agrees with the one floorTex was handed to the last bit. Deriving it from the projection
   * instead would agree to about a part in a thousand, which is a whole cell at 40 m.
   *
   * kind 2 is the floor. Testing it is what keeps a shadow off a rock face, off a bootprint's own
   * bright rim (which is written as kind 2 on purpose, so shadows CAN fall on it) and off the sky. */
  var GP = { wx: 0, wz: 0, d: 0 };
  function groundAt(f, x, y, i) {
    if (f.kind[i] !== 2) return false;
    var d = f.dist[i];
    /* The horizon row is parked at 1e6 by raycast.js:241 — a finite stand-in for "unboundedly far
     * tarmac" — and inverse-projecting it would put a world point a thousand kilometres away. */
    if (!(d > 0.2) || d > 260) return false;
    var sp = (2 * (x + 0.5) / V.cols - 1) * V.half;
    var w = d / Math.sqrt(1 + sp * sp);
    GP.wx = V.ox + (V.fwx + V.rgx * sp) * w;
    GP.wz = V.oz + (V.fwz + V.rgz * sp) * w;
    GP.d = d;
    return true;
  }

  /* ---- the lit swatch, restated from surf_moon.js -------------------------------------------------
   * surf_moon.js's litSet() is a hundred lines of measurement and it is not exported, so this is the
   * same rule written out again for the objects in this file. THAT IS A DEFECT AND IT IS IN THE
   * REPORT: two copies of a tuned ladder will drift. What the copy has to preserve is the finding,
   * which is that core.js's tone() retires its gamma lift across eight depth buckets on the
   * CONSTANTS FOG_START 12 / FOG_END 125 whatever world is drawing, so on a world with no fog to
   * hide it a `white` cell loses 65% of its print by 120 m while a `pure` cell loses 34%. Hence:
   * near field in white, far field in pure with a +0.62/m ramp that cancels the bucket, crossover
   * dithered over 24-40 m so the eye sees a drifting texture rather than a ring, and a constant past
   * the 125 m cliff where core.js hands everything back to bucket 0.
   *
   * At night the swatch rotates to azure at a twelfth of the drive and the SAME printed value —
   * azure lum 44-70 prints v 121-144, white lum 150-212 prints v 124-141 — which is what makes the
   * day/night handover cost nothing at the flicker census. */
  var LC = { col: 0, lum: 0 };
  function litOf(base, dist, hv) {
    var far = dist >= 40 || (dist > 24 && hv > (40 - dist) / 16);
    var nt = night();
    var dark = nt > 0.5 || (nt > 0 && hv < nt);
    if (!far) {
      if (dark) {
        LC.col = base > 0.72 ? P.pure : P.azure;
        LC.lum = base > 0.72 ? 52 + 26 * base : 44 + 26 * base;
      } else {
        LC.col = P.white; LC.lum = (150 + 62 * base) * (1 - 0.20 * dayMix());
      }
      return LC;
    }
    LC.col = dark ? P.azure : P.pure;
    LC.lum = (dark ? (dist < 125 ? 70 + dist * 0.62 : 60) : (dist < 125 ? 96 + dist * 0.62 : 88)) *
             (0.90 + 0.26 * base);
    return LC;
  }

  /* A specular: a fracture plane or a rim catching the sun square. pure is hot from lum 101 up, so
   * this is the most dangerous call in the file and every caller is rate-limited to a few percent of
   * what it paints. */
  function specOf(base, dist) {
    if (night() > 0.5) { LC.col = P.pure; LC.lum = 78 + 34 * base; return LC; }
    LC.col = P.pure; LC.lum = dist < 125 ? 186 + 50 * base : 150 + 40 * base;
    return LC;
  }

  /* The ramp that every terminator in this file ends with, lifted from surf_moon.js:566 with its
   * constants intact: hold the last 0.26 of the transition between 24% and 100% so the cell's own
   * final flip to blank is a step of 17% of full scale rather than 73%. */
  function softOf(edge) { return edge < 0.26 ? 0.24 + 2.923 * edge : 1; }

  /* ===================================================================== 1. THE DISTANT MASSIF ===
   * THE FAR WALL OF THE MARE, and it is a pure function of bearing and nothing else — no position,
   * no time, no camera. Walk two hundred metres and it does not shift, because it is eight
   * kilometres away and two hundred metres of parallax at eight kilometres is 0.025 rad. Parking it
   * at D_RIDGE = 9.2e4 gets that for free and gets the depth ordering with it.
   *
   * IT IS AS SHARP AND AS BRIGHT AS A PEBBLE AT YOUR FEET, and that one fact is the most alien
   * property of a lunar photograph. Every terrestrial cue for distance is atmospheric: things far
   * away are paler, bluer, softer, lower in contrast. With no air, a mountain front at 8 km and a
   * rock at 3 m are rendered by the identical physics, so the eye — which has no other ranging
   * mechanism at this scale — simply cannot tell them apart. Apollo crews consistently
   * underestimated distances by a factor of two to three, and this is why. So there is no fade
   * applied here of any kind: `plot` is used rather than `emit` and the luminance is the same
   * luminance a near rock would get.
   *
   * ITS BASE IS CUT OFF BY THE NEAR HORIZON, so it appears to float. That is also correct and also
   * free: the Moon's horizon is 2.4 km away for a 1.7 m eye (against Earth's 4.7 km), so anything
   * beyond it has its feet below the curve. The frame simply stops drawing at the horizon row and
   * the mountain hangs there with no ground under it, which is what the photographs look like.
   *
   * ---- THE PROFILE IS A FOURIER SERIES AND NOT A NOISE, and that is a correctness fix ----------
   * The obvious construction is octaves of CC.vnoise on the bearing. It is wrong here, because
   * vnoise is not periodic: at bearing +PI and -PI it returns two unrelated values, so turning all
   * the way round walks the viewer into a vertical seam where the skyline jumps. A sum of sines at
   * INTEGER frequencies is exactly 2*PI-periodic by construction and cannot have a seam. The
   * frequencies are Fibonacci so that no two of them share a factor and the silhouette does not
   * repeat inside one turn; the 1/k amplitude taper is what makes the result read as a mountain
   * front — big shapes with small detail on them — rather than as noise.
   *
   * The derivative is analytic (dEl below) rather than a finite difference, which costs the same and
   * is what decides which flank of every fold is lit. */
  var NH = 7;
  /* THE FUNDAMENTAL IS 3, NOT 1, and the low harmonics are gone on purpose. The frame is 1.25 rad
   * of a 6.28 rad profile — a fifth of it — so a k=1 term is a shape the viewer can never see the
   * whole of: it arrives as a slow tilt across the picture and reads as nothing. Everything the
   * frame can resolve as SHAPE lives between k=3 (two peaks across the view) and k=55 (a ripple
   * every 36 columns), and spending the amplitude there instead is what turned this object from
   * three flat-topped slabs into a range. The frequencies are Fibonacci so no two share a factor
   * and the silhouette does not repeat inside one turn. */
  var HF = [3, 5, 8, 13, 21, 34, 55];
  var HA = [0, 0, 0, 0, 0, 0, 0], HP = [0, 0, 0, 0, 0, 0, 0];
  /* 0.055 rad of DC against 0.140 of harmonic, so the crest runs from nothing at all — the harmonic
   * sum goes below the DC over about a quarter of all bearings, and where it does the wall drops to
   * the horizon and the mare opens out — up to about 0.15 rad, a 1.6 km massif at 10 km, which is
   * Hadley Delta from the Apollo 15 site almost exactly. At the reference grid (scale 90) the
   * measured profile at seed 42 runs from row 43 to the horizon at 56, i.e. thirteen rows; at the
   * harness's 200x60 (scale 54) it is eight.
   *
   * TWICE MEASURED AND TWICE TOO SHORT, which is worth recording because the arithmetic that looks
   * right is not. The first cut ran DC 0.026 / amp 0.040 (0.066 rad, 3.5 rows at 200x60) and the
   * massif was not subtle, it was absent; the second at 0.090 rad drew 1721 cells at seed 42 and
   * every one of them lost the depth test. The cause is that city.js's own terrain in THIS world is
   * not small: highland lots run to 15 m and landmarks to 60 m, at forty to a hundred metres, and
   * at seed 42 that puts the near skyline ten rows above the horizon — 0.11 rad. A backdrop that
   * does not clear the foreground is not a backdrop, it is an expensive way to write to cells
   * something else already owns. 0.15 rad clears it with room to spare and still leaves half the
   * sky empty above it. Anything much taller stops being a horizon and becomes a wall. */
  var RIDGE_DC = 0.055, RIDGE_AMP = 0.140;

  /* THE TAPER IS k^-0.35, WHICH IS ALMOST FLAT, and it is the second half of the same fix. A 1/k
   * spectrum is the classic pink-noise ridge and it is genuinely what terrain looks like — but with
   * only a fifth of the profile on screen, 1/k gives the lowest surviving harmonic four fifths of
   * the amplitude and the crest ran dead flat for twenty columns at a time. Measured at 400x100,
   * yaw 3.68: the whole massif varied by SIX rows across the entire frame, which is a plateau.
   * k^-0.35 over k = 3 to 55 spreads it, and the same measurement now runs 43 to 56 — thirteen rows
   * of peaks, saddles and two places where the wall drops to nothing and the mare opens out. */
  function ridgeInit() {
    var i, s = 0;
    for (i = 0; i < NH; i++) {
      HA[i] = (0.55 + 0.9 * hash1(BASE + i, 0x4DA0)) / Math.pow(HF[i], 0.35); s += HA[i];
    }
    for (i = 0; i < NH; i++) { HA[i] *= RIDGE_AMP / s; HP[i] = hash1(BASE + i, 0x4DA1) * 6.2831853; }
  }
  function ridgeEl(b) {
    var e = RIDGE_DC, i;
    for (i = 0; i < NH; i++) e += HA[i] * Math.sin(HF[i] * b + HP[i]);
    return e;
  }
  function ridgeSlope(b) {
    var e = 0, i;
    for (i = 0; i < NH; i++) e += HA[i] * HF[i] * Math.cos(HF[i] * b + HP[i]);
    return e;
  }

  function drawMassif(f) {
    var y1 = Math.floor(V.horizon); if (y1 > V.rows) y1 = V.rows;
    if (y1 <= 0) return;
    var saz = sunAz(), x, y;
    for (x = 0; x < V.cols; x++) {
      var sp = (2 * (x + 0.5) / V.cols - 1) * V.half;
      var bear = V.yaw + Math.atan(sp);
      var el = ridgeEl(bear);
      if (el <= 0.002) continue;                       // a gap in the wall: the mare opens out
      /* ---- WHICH FLANK IS LIT, AND THE FIRST VERSION OF THIS FAILED THE FLICKER GATE OUTRIGHT ---
       * The obvious model is "the profile is falling, so this flank faces +bearing; the sun is
       * toward +bearing when the wrapped difference is positive; multiply the two signs". It is
       * cheap, it looks right in a still, and it contains a `sign(da)` — a step function of the
       * sun's own bearing. When the sun's bearing crosses a column's bearing, that step inverts the
       * lighting of the ENTIRE COLUMN in one frame, thirteen rows of pure at v 130-200 going to
       * blank together. Measured with the camera pinned and the daylight clock running, 120x40,
       * 4 s: 32.5 big steps per second and 5.94% in the 3-20 Hz band, against gates of 1.0/s and
       * 2%. The arithmetic agrees — the sun sweeps 0.02 rad/s, the frame spans 1.25 rad over 120
       * columns, so the crossing walks about two columns a second and takes thirteen cells with it.
       *
       * THE REPLACEMENT IS CONTINUOUS AND IT IS ALSO THE HONEST GEOMETRY. A mountain front is a
       * row of spurs, and the face of a spur is turned in BEARING away from the mean by roughly the
       * arctangent of the local relief. So the outward normal of this column's face points along
       * bearing (b + PI + phi) with phi = -atan(RELIEF * el'), and the illumination is the cosine
       * between that and the sun: -cos(da - phi). It has no branch in it anywhere, it is exactly
       * +1 when the sun is directly behind the observer (which is where surf_moon.js puts it, so
       * the middle of the frame is fully lit — correct, and why the shadows have to carry the near
       * field), and it goes to -1 on the flanks that turn far enough round to lose the sun.
       *
       * RELIEF IS 14 AND IT IS NOT A FUDGE FACTOR, it is the ratio between the silhouette's slope
       * and the real face's. The profile is smoothed by being 8 km away and by having seven
       * harmonics in it: its gradient has an RMS of 0.07 rad per rad, which is a 4-degree slope, and
       * no mountain looks like that. 14 turns that into atan(0.98) = 44 degrees of face tilt, which
       * is what the front of a lunar massif actually stands at, and it is also the value at which
       * the terminator starts landing inside the 72-degree field of view instead of outside it.
       *
       * The lighting now changes at d(litK)/dt = 2.2 * sin(da - phi) * 0.02 = 0.044/s at worst, so
       * a cell takes six seconds to cross the 0.26 of softOf's ramp. Measured after the change:
       * see the report. */
      var da = saz - bear - Math.atan(14.0 * ridgeSlope(bear));
      da = Math.atan2(Math.sin(da), Math.cos(da));
      var litK = clamp(0.5 - 2.2 * Math.cos(da), 0, 1);
      var top = V.horizon - el * V.scale;
      var span = V.horizon - top;
      var y0 = Math.floor(top); if (y0 < 0) y0 = 0;
      for (y = y0; y < y1; y++) {
        /* Keyed on BEARING and ELEVATION, never on the screen cell. hash2(x, y) would weld the
         * dither to the glass, so turning the camera would slide the mountain through a fixed
         * stipple — the same bug west_sky.js:201 records fixing in its cloud bars. */
        var elr = (V.horizon - y - 0.5) / V.scale;
        var hv = hash2(Math.floor(bear * 900), Math.floor(elr * 4200), BASE + 0x4DA2);
        var edge = litK - hv * 0.74;
        var depth = (y - top) / (span + 1e-6);         // 0 at the crest, 1 at the horizon cut
        var crest = y <= top + 1.0;
        if (edge <= 0) {
          /* THE DARK FLANK IS A HOLE, and it is still a solid body: it writes ch 0 at D_RIDGE, so
           * it OCCLUDES the stars behind it. A silhouette that lets the sky through is a hole in
           * the picture, not a mountain. The sparse slate is surf_moon.js's third sanctioned use of
           * that swatch — the flank of a distant massif — and it is 7% of cells, never a surface:
           * enough that the eye can find the mass, not enough to put anything in the muddy band.
           *
           * BUT THE CREST IS DRAWN ANYWAY, at a tenth of the luminance, and this is the line that
           * fixed the object. Painting the whole shadowed flank as nothing meant the ridge appeared
           * only where it happened to be lit — bright blocks with vertical sides and dead flat tops,
           * separated by gaps of sky, which reads as a row of buildings and not as terrain. A
           * mountain has ONE continuous top edge whatever the light is doing to its flanks; the
           * far side of the crest is always in the sun even when the near side is not, and the
           * sliver of it that shows over the ridge line is what makes the silhouette continuous. */
          if (crest) plot(f, x, y, G_DOT, P.slate, 30 + hv * 22, D_RIDGE);
          else if (hv > 0.93) plot(f, x, y, hv > 0.965 ? G_DOT : G_COMMA, P.slate, 18 + hv * 14, D_RIDGE);
          else plot(f, x, y, 0, P.shadow, 0, D_RIDGE);
          continue;
        }
        var soft = softOf(edge);
        /* AT NIGHT THE WHOLE RANGE GOES OVER TO EARTHSHINE, on the same per-cell dither litOf uses
         * and for the same measured reason. The first night render had a mountain front in `pure`
         * standing over a plain in `azure` — the sky said midnight, the ground said earthshine, and
         * the one object on the horizon said full sunlight. The 0.80 on the luminance is what holds
         * the printed value: azure's gain is 1.00 against pure's 0.85, so four fifths of the drive
         * in azure prints the same number, which is what makes the handover cost nothing at the
         * flicker census. */
        var nt = night();
        var dk = nt > 0.5 || (nt > 0 && hv < nt);
        var col = dk ? P.azure : P.pure, nk = dk ? 0.80 : 1;
        if (crest)
          /* THE CREST IS A SPECULAR AND NOT A BRIGHT SURFACE, for the reason surf_moon.js gives for
           * its own lit rims: a rock edge in vacuum is a mirror facet a fraction of a millimetre
           * wide, and the eye reads that flare as sharpness. It is also the SKYLINE, and a skyline
           * is what turns a black shape into an object. One row per column, so it is the only part
           * of this object that is allowed into the print's hot band. */
          plot(f, x, y, hv < 0.4 ? G_DASH : G_EQ, col, (198 + 44 * hv) * nk * soft, D_RIDGE);
        else if (hv < 0.66)
          /* THE FLANK IS DELIBERATELY NOT HOT, and that is the print census talking rather than the
           * light. A 1.6 km massif fills thirteen rows across the whole frame — thirteen per cent
           * of the cells — and painting a body that size at the luminance the light deserves put
           * the frame at 5.5% above v 170 against a 3.5-5% target, on its own, before the ground
           * and the rocks had contributed anything. pure at lum 58-98 prints v 129-162: clear of
           * the muddy ceiling at 119 by ten points, clear of the hot line by eight, and the whole
           * band is the one place in this world where a mid-tone is the right answer, because it is
           * the only object big enough for the census to notice. */
          plot(f, x, y, hv < 0.22 ? G_PCT : (hv < 0.44 ? G_HASH : G_8), col,
               (58 + 40 * hv) * nk * (0.80 + 0.28 * (1 - depth)) * soft, D_RIDGE);
        else
          plot(f, x, y, 0, P.shadow, 0, D_RIDGE);      // the holes: density carries the tone here too
      }
    }
  }

  /* ============================================================================ 2. THE STARS ===
   * THERE IS NO AIR, SO THE STARS ARE THERE AT NOON. This is the single most useful thing this
   * world can put in the top half of the frame and it is physically exact: there is no scattered
   * skylight to wash them out, and the reason Apollo photographs show a black empty sky is film
   * exposure set for a sunlit surface at f/11, not the sky. Nothing in this element is gated on the
   * hour, and that absence of a gate IS the feature.
   *
   * ---- WHAT THIS DRAWS THAT surf_moon.js's SKY FIELD DOES NOT ---------------------------------
   * The painter already puts 1.0-1.9% of sky cells down as stars, keyed on quantised bearing and
   * screen row, four magnitudes deep. That field is the Milky Way's worth of faint points and it is
   * the right way to draw them: one hash per cell, no time dependence, welded to the sky.
   *
   * What a per-cell hash structurally cannot do is put down an OBJECT. Every star it draws is one
   * cell, uncorrelated with its neighbours, so there is no Sirius — no point that is bigger than a
   * cell, that has a shape, and that the eye can use as a landmark to tell that the sky it is
   * looking at now is the sky it looked at two minutes ago. That is what these ninety are: the first
   * and second magnitude, as real directions on the celestial sphere, at one to five cells each.
   * They are also what makes the sky's brightest points survive a redraw at a different grid size,
   * which a screen-row hash does not.
   *
   * They are SPARSE (ninety over the sphere, so about a dozen in a 72-degree frame — measured at 9
   * and 4 with the first cut's sixty, thin enough that a frame could hold none at all), HARD (a
   * cross of full-luminance cells, no falloff, no halo — there is nothing to scatter in) and they
   * are NOT `ice`. surf_moon.js records measuring that: ice is (90,240,255), a saturated cyan, and
   * at one cell in six of a star field the sky came out a wash of teal points that read as the
   * CITY's screenlight through a window, which is the one association this world must not have.
   * Colour is allowed to do work in exactly four places on the Moon and a star field is not one of
   * them, so these are `pure` and `white` only.
   *
   * THE CATALOGUE IS NOT SEEDED OFF THE CITY, on purpose. Every other placement in this file hangs
   * off BASE so that two seeds are two places; the sky does not, because the sky is not a property
   * of where you landed. Orion is Orion at every landing site, and a viewer who steps the seed and
   * watches the ground change under an unchanged sky has been told something true. */
  var NSTAR = 90;

  function drawStars(f) {
    var i;
    for (i = 0; i < NSTAR; i++) {
      var az = hash1(i, 0x4DB0) * 6.2831853;
      /* Elevation biased low by the cube: the visible sky band tops out around 0.35 rad (at the
       * reference grid an object at elevation A lands at row 56 - tan(A)*90, so 0.35 is off the top
       * of the frame), and a catalogue spread uniformly over the hemisphere would put five sixths
       * of itself where the frame cannot show it. */
      var hu = hash1(i, 0x4DB1);
      var alt = 0.015 + hu * hu * hu * 0.62;
      var ca = Math.cos(alt);
      if (!projDir(Math.sin(az) * ca, Math.sin(alt), Math.cos(az) * ca)) continue;
      var mag = hash1(i, 0x4DB2);
      var x = VP.x, y = VP.y;
      if (mag > 0.88) {
        /* First magnitude — six of them. A cross, because at this size the only way to say "this
         * point is brighter than that point" when both are already at the top of the ladder is to
         * make it BIGGER. The arms are `pure` at half the core, which is what a bright point looks
         * like through any optic and is not a halo: a halo is a graded surround out to several
         * radii and it is forward scattering by aerosols, of which there are none. */
        plot(f, x, y, G_PLUS, P.pure, 244, D_STAR);
        plot(f, x - 1, y, G_DASH, P.pure, 120, D_STAR);
        plot(f, x + 1, y, G_DASH, P.pure, 120, D_STAR);
      } else if (mag > 0.62) {
        plot(f, x, y, G_STAR, P.pure, 176 + mag * 70, D_STAR);
      } else {
        /* Second magnitude, in white at lum 150-190: prints v 126-135, just clear of the muddy
         * ceiling at 119, which is exactly what a star should be — a clean point and not a smudge. */
        plot(f, x, y, G_DOT, P.white, (150 + mag * 64) * (1 - 0.22 * dayMix()), D_STAR);
      }
    }
  }

  /* Planar projection of a DIRECTION rather than a point, west_sky.js:62 verbatim. A direction with
   * a forward component at or below zero is behind the eye plane and has no image. */
  var VP = { x: 0, y: 0, w: 0 };
  function projDir(dx, dy, dz) {
    var w = dx * V.fwx + dz * V.fwz;
    if (w <= 0.02) return false;
    var s = dx * V.rgx + dz * V.rgz;
    VP.w = w;
    VP.x = (s / w) * V.colK + V.colMid;
    VP.y = V.horizon - (dy / w) * V.scale;
    return true;
  }

  /* =============================================================================== 3. EARTH ===
   * IT DOES NOT MOVE. Not slowly, not imperceptibly — not at all, ever, for any reason. The Moon is
   * tidally locked, so from a fixed point on the near side the Earth hangs at one fixed bearing and
   * one fixed elevation for the whole 708-hour day and for every day after it. It does not rise, it
   * does not set, it does not cross the sky. A crew that walked two kilometres and looked back found
   * it in the same place in the same patch of sky, and there is no other experience like it anywhere
   * a human has been.
   *
   * That is the single most alien fact this build has access to and it is worth stating in code:
   * there is no update(), no drift term, no t anywhere in this element's geometry, and EARTH_AZ and
   * EARTH_ALT are constants read straight off surf_moon.js. Every other celestial object in all
   * three worlds moves — sky.js's moon drifts at 7.3e-5 rad/s, west_sky.js's sun follows the
   * director, the birds circle. This one is nailed, and a viewer who notices is being told exactly
   * where they are standing.
   *
   * ---- IT MUST NOT LOOK LIKE sky.js's MOON, AND FIVE INVERSIONS ARE WHAT DO THAT --------------
   *   1. NO HALO. NONE. sky.js:399 builds a dithered `ice` ring "the way a real halo sits against
   *      the murk that makes it" — and a halo IS murk: it is forward scattering by ice crystals or
   *      aerosols in an atmosphere. There is no atmosphere. This is the strongest single
   *      differentiator in the frame and it costs a deletion rather than a line.
   *   2. It does not move (above).
   *   3. THE PHASE IS DERIVED, NOT ROLLED. sky.js:365 rolls its phase off the seed. Here the
   *      terminator must be perpendicular to the sun and the lit limb must face it, or the sky and
   *      the ground are lit from different directions and the frame quietly falls apart. It is
   *      computed from the actual angle between the direction to Earth and the direction to the
   *      sun, below, and it is the COMPLEMENT of the lunar day: when the sun is up and near Earth's
   *      bearing, Earth is new; at lunar midnight it is full and it is the only light there is.
   *   4. THREE SWATCHES, NOT ONE, and this is what turns a lozenge into a planet. Nothing else in
   *      this build is blue and white.
   *   5. THE DARK LIMB IS A HOLE. The unlit fraction writes ch 0 at D_EARTH, which is INSIDE
   *      D_STAR — so it bites a black crescent out of the star field, and that missing piece of sky
   *      is what says the disc is a solid body and not a lamp.
   *
   * ---- SIZE, MEASURED --------------------------------------------------------------------------
   * Earth's radius is 6371 km at a mean 384,400 km, so the true angular RADIUS is
   * atan(6371/384400) = 0.01657 rad — a disc 1.9 degrees across, 3.7 times the width of the Moon
   * seen from Earth. At the reference grid (400 cols, fov 1.25) that is colsPerTan 275 and scale 90,
   * i.e. 4.6 columns by 1.5 rows: a true-size Earth is a nine-by-three lozenge and cannot carry a
   * terminator, let alone three swatches. EARTH_R below is 0.030, which is 1.8x life and gives
   * 16 x 5 at the reference grid and 8 x 3 at the harness's 200x60.
   *
   * THE EXAGGERATION IS DECLARED AND IT IS THE SMALLEST IN THE BUILD. sky.js:353 runs its moon at
   * moR = 0.026 + r()*0.008 against the real Moon's 0.00436 rad, which is a six-to-seven-fold fake.
   * At 1.8x Earth is the most honest celestial object anywhere in this project. */
  var EARTH_R = 0.030;

  function drawEarth(f) {
    var eaz = MOON ? MOON.EARTH_AZ : 0.28, ealt = MOON ? MOON.EARTH_ALT : 0.24;
    var eca = Math.cos(ealt);
    var ex = Math.sin(eaz) * eca, ey = Math.sin(ealt), ez = Math.cos(eaz) * eca;
    if (!projDir(ex, ey, ez)) return;
    var cx = VP.x, cy = VP.y, w = VP.w;
    var rw = EARTH_R * V.colK / w, rh = EARTH_R * V.scale / w;
    if (rw < 0.7) return;

    /* The sun as a unit direction, from the painter's own key light. */
    var salt = sunAlt(), sca = Math.cos(salt);
    var sx = sunX() * sca, sy = Math.sin(salt), sz = sunZ() * sca;

    /* THE PHASE ANGLE, done properly. The direction from Earth to the Moon is -E; the sun is 390
     * times further away than the Moon is, so the direction from Earth to the sun is the same S the
     * observer sees to four figures. cos(phase) = (-E).S, and the illuminated fraction of a sphere
     * at phase angle a is (1 + cos a)/2 — so f = (1 - E.S)/2 and no trigonometry is needed at all.
     *
     * CLAMPED TO 0.30-0.96, and that is composition overriding physics for two reasons that are
     * both about the frame rather than the sky. A new Earth is a black hole punched in the star
     * field and the picture loses its only object of any size; a dead-full Earth is a flat disc
     * with no terminator on it, and the terminator is what makes it read as a sphere rather than a
     * sticker. Both extremes are reachable — the sun swings 2.7 rad over the cycle and Earth is
     * fixed — so both are clamped, and the honest value is what the clamp is applied to. */
    var cosPA = ex * sx + ey * sy + ez * sz;
    var frac = clamp((1 - cosPA) * 0.5, 0.30, 0.96);

    /* Which way the lit limb points, in the disc's own normalised coordinates. T is the component
     * of the sun direction perpendicular to Earth's, i.e. the tangent-plane bearing of the sun as
     * seen from the disc. In (u, v) — u to the right in units of rw, v DOWN in units of rh — an
     * angular offset along a unit direction (a_right, a_up) lands at (a_right, -a_up), because rw
     * and rh are the same angular radius scaled by the same two projection constants. So the aspect
     * ratio cancels exactly and no correction is needed. */
    var tx = sx - cosPA * ex, ty = sy - cosPA * ey, tz = sz - cosPA * ez;
    var tn = Math.sqrt(tx * tx + ty * ty + tz * tz);
    if (tn < 1e-5) { tx = 1; ty = 0; tz = 0; tn = 1; }
    tx /= tn; ty /= tn; tz /= tn;
    var lu = tx * V.rgx + tz * V.rgz, lv = -ty;
    var ln = Math.sqrt(lu * lu + lv * lv); if (ln < 1e-5) { lu = 1; lv = 0; ln = 1; }
    lu /= ln; lv /= ln;

    var sd = 0x4DC0;
    var iw = Math.ceil(rw) + 1, ih = Math.ceil(rh) + 1, dx, dy;
    for (dy = -ih; dy <= ih; dy++) {
      for (dx = -iw; dx <= iw; dx++) {
        var u = (Math.round(cx) + dx - cx) / rw, v = (Math.round(cy) + dy - cy) / rh;
        var r2 = u * u + v * v;
        if (r2 > 1.04) continue;
        var px = Math.round(cx) + dx, py = Math.round(cy) + dy;
        /* p runs along the lit direction, s across it. The terminator of a sphere projects to a
         * half-ellipse: p_t = (1 - 2f) * sqrt(1 - s^2), which is the limb itself at f = 1 and the
         * centre line at f = 0.5. */
        var p = u * lu + v * lv, s = -u * lv + v * lu;
        var ss = 1 - s * s; if (ss < 0) ss = 0;
        var pt = (1 - 2 * frac) * Math.sqrt(ss);
        var lit = p - pt;
        if (lit <= 0) {
          /* The night side. One slate cell in eight on the extreme dark limb — Earth's night side
           * in 1969 has no city lights worth a photon at this exposure, so this is the last sliver
           * of the crescent's own scattering and nothing more — and a true blank everywhere else. */
          if (r2 > 0.72 && hash2(px, py, sd ^ 0x11) < 0.13)
            plot(f, px, py, G_DOT, P.slate, 24, D_EARTH);
          else plot(f, px, py, 0, P.shadow, 0, D_EARTH);
          continue;
        }
        /* The terminator softens over the last 0.22 of the disc's width. Earth's terminator really
         * is soft — it is 40 km of atmosphere seen edge-on, the one place in this world where a
         * gradient is honest — and it is also the only edge of this object that moves, at the sun's
         * 0.02 rad/s, so it is ramped for the same reason everything else here is. */
        var soft = lit < 0.22 ? 0.30 + 3.18 * lit : 1;
        var hb = hash2(Math.floor((u + 1) * 2.6), Math.floor((v + 1) * 2.6), sd);
        var hf = hash2(px * 7, py * 13, sd ^ 0x22);
        /* Limb darkening: a sphere lit by a point source falls off as the cosine, and at 16 cells
         * across that is the difference between a disc and a ball. */
        var lam = 0.55 + 0.45 * Math.sqrt(clamp(1 - r2, 0, 1));
        if (hb < 0.45) {
          /* CLOUD, on a coarse 2.6-per-radius lattice so it bands into weather systems rather than
           * dithering into static. pure at lum 190-235 prints v 215-230 — after direct sunlight
           * this is the brightest thing in the frame, which is what a cloud deck at zero phase
           * angle actually is. */
          plot(f, px, py, hf < 0.4 ? G_AT : G_8, P.pure, (190 + 45 * hf) * lam * soft, D_EARTH);
        } else if (hb < 0.82) {
          /* OCEAN. azure is hot from lum 110 up, so the brightest ocean cells clear the print's hot
           * line and Earth is genuinely the second-brightest object in the frame. It is also the
           * only large azure mass in any of the three worlds. */
          plot(f, px, py, hf < 0.5 ? G_O : G_o, P.azure, (96 + 34 * hf) * lam * soft, D_EARTH);
        } else {
          /* CONTINENT AND DESERT, in white — which on the day ladder is the one swatch that reads
           * as ochre against azure without ever being warm. */
          plot(f, px, py, hf < 0.5 ? G_PCT : G_HASH, P.white, (150 + 32 * hf) * lam * soft, D_EARTH);
        }
      }
    }
  }

  /* ================================================================================= 4. THE SUN ===
   * HALF A DEGREE ACROSS, PURE, AND WITH NOTHING AROUND IT. The sun's true angular radius is
   * 0.00465 rad, which at the reference grid is 1.28 columns and 0.42 rows — a disc about three
   * cells wide and one row tall. It is drawn at its real size, which makes it the only celestial
   * object in this project that is not exaggerated at all.
   *
   * THE ABSENCE OF THE HALO IS THE POINT, and it says vacuum louder than anything else in the frame.
   * west_sky.js:91 spends a paragraph arguing the opposite case and is right about its own world:
   * "a filled bright circle at this size prints as a hole punched in the sky; what makes a sun read
   * is the graded surround", and that file spends four fifths of its cells on the halo. But a halo
   * is forward scattering by aerosols and water in an atmosphere; on the Moon there is nothing
   * between the eye and the photosphere, so the sun is a hard-edged white-hot dot in a black sky
   * with stars right up against its limb. It does not read as a sun. It reads as WRONG, and that
   * wrongness is the most valuable thing this element contributes.
   *
   * The one legitimate surround is the F-corona, which is real — zodiacal dust along the ecliptic,
   * genuinely photographable from the surface — and surf_moon.js's sky() already draws it, keyed on
   * bearing, at about thirty cells. It is deliberately not repeated here.
   *
   * ---- AND IT IS AREA-SAMPLED, WHICH IS A PHOTOSENSITIVITY FIX --------------------------------
   * The sun is the fastest-moving bright thing in this world: daylight.js swings the azimuth
   * 1.35 rad either side of noon over a 420 s cycle, i.e. up to 0.020 rad/s, which at 275 columns
   * per radian is 5.6 columns a second. A hard-edged disc three cells wide therefore switches each
   * cell it passes over on and off inside 0.18 s — 5.5 Hz, dead centre of the 3-20 Hz flash band, at
   * an amplitude of 90% of full scale against a lum-0 sky. That is the single worst thing this file
   * could have shipped.
   *
   * Coverage anti-aliasing converts the switch into a ramp: a cell's luminance is the fraction of it
   * the disc covers, which changes by 5.6/60 = 0.093 of a cell per frame, so the per-frame step is
   * 24 of 255 — under 10% of full scale and comfortably inside the third-of-scale ceiling — and the
   * fundamental of the resulting triangle drops to about 1.5 Hz, below the band. */
  var SUN_R = 0.00465;

  function drawSun(f) {
    /* Faded out rather than set. The director's altitude is compressed by surf_moon.js into the
     * Apollo 5-25 degree band and never goes below the horizon, so there is no sub-horizon
     * elevation to slide the disc down to — and sliding it down would be far worse anyway, because
     * a disc at v 234 crossing the massif's crest and the horizon line is a much larger event than
     * a fade. The fade rides surf_moon.js's own 17-second day/night crossfade, which puts the
     * per-frame step at 255/(17*60) = 0.25. */
    var k = 1 - night();
    if (k <= 0.02) return;
    var salt = sunAlt(), ca = Math.cos(salt);
    if (!projDir(sunX() * ca, Math.sin(salt), sunZ() * ca)) return;
    var cx = VP.x, cy = VP.y, w = VP.w;
    var rw = SUN_R * V.colK / w, rh = SUN_R * V.scale / w;
    /* THE COVERAGE IS SEPARABLE AND EACH AXIS IS NORMALISED BY ITS OWN EXTENT, and getting this
     * wrong is what the first cut did. A radial `(1 - r) * rw + 0.5` measure looks right and is
     * not, because rh is 0.47 rows at the reference grid and 0.28 at 200x60 — the disc is UNDER
     * HALF A ROW TALL at every size this renders at, so the vertical term put every cell's
     * normalised radius above 1 and the whole sun came out at lum 56-102: four dim cells where the
     * brightest object in the solar system should be. Measured at seed 42, noon, yaw 2.64.
     *
     * Normalising each axis by min(1, 2r) says: a cell that the disc lies wholly inside is FULLY
     * lit. That is not a cheat even though it double-counts area, because the sun's surface
     * brightness is six orders of magnitude past anything else in the frame — a tenth of a cell of
     * photosphere blows the whole cell out, which is precisely why every Hasselblad frame with the
     * sun in it has a white blob and no detail. The anti-aliasing that matters is the one along the
     * direction of travel, and that is exact. */
    var wx2 = 2 * rw < 1 ? 2 * rw : 1, wy2 = 2 * rh < 1 ? 2 * rh : 1;
    var iw = Math.ceil(rw) + 1, ih = Math.ceil(rh) + 1, dx, dy;
    var x0 = Math.round(cx), y0 = Math.round(cy);
    for (dy = -ih; dy <= ih; dy++) {
      for (dx = -iw; dx <= iw; dx++) {
        var px = x0 + dx, py = y0 + dy;
        var ax = (px + 0.5 < cx + rw ? px + 0.5 : cx + rw) - (px - 0.5 > cx - rw ? px - 0.5 : cx - rw);
        if (ax <= 0) continue;
        var ay = (py + 0.5 < cy + rh ? py + 0.5 : cy + rh) - (py - 0.5 > cy - rh ? py - 0.5 : cy - rh);
        if (ay <= 0) continue;
        /* THE GAIN OF 1.8 IS THE EXPOSURE, and it is the last piece. A box filter is energy
         * conserving, so a disc that straddles a row boundary — which it does about half the time,
         * being 0.47 rows tall — splits its light evenly and no cell ever exceeds half. Measured:
         * peak lum 134, which prints v 186 and reads as a bright star rather than as the sun. The
         * gain lifts the peak to saturation and lets the clamp hold it there, which is exactly what
         * a camera set for a sunlit surface does to the sun. It also halves the width of the AA
         * ramp, so the per-frame step at the disc's 5.6 columns a second goes from 24 to 42 of 255
         * — 17% of full scale, still comfortably under the project's third-of-scale ceiling, which
         * is what set the ceiling on the gain. */
        var cov = clamp(1.8 * (ax / wx2) * (ay / wy2), 0, 1);
        if (cov <= 0.02) continue;
        plot(f, px, py, cov > 0.6 ? G_AT : (cov > 0.3 ? G_8 : G_o), P.pure, 255 * cov * k, D_SUN);
      }
    }
  }

  /* =========================================================================== 5. BOOTPRINTS ===
   * NOTHING ELSE IN THIS PROJECT SAYS "SOMEBODY WAS HERE" FOR SO LITTLE. A trail of prints is two
   * hashes and a lateral offset, and it does three jobs at once: it converges, so the plain gets a
   * perspective cue; it is 0.32 m across, so the plain gets a ruler; and it is the only evidence in
   * the world that the viewer is not the first thing to walk on it.
   *
   * ---- WHY THERE ARE TWO TRAILS AND THIS IS THE SECOND ----------------------------------------
   * surf_moon.js's floorTex draws prints too, on `lane = wx - CFG.streetX`, i.e. welded to the route
   * centreline the camera is walking. That is the right trail to have — you are walking in your own
   * tracks and they run to the vanishing point — and it is also, structurally, a trail that can only
   * ever be a straight line up the middle of the frame, because CFG.streetX IS the middle of the
   * frame. These wander, on a two-octave meander, so they cross the corridor at an angle, run out
   * over the blocks, leave the frame and come back. A line that leaves the picture is what says the
   * place is bigger than the picture, and it is the difference between a track and a road.
   *
   * ---- THERE ARE TWO OF THEM AND THEY CROSS AT RIGHT ANGLES -----------------------------------
   * One traverse runs along +z with its lateral offset a function of z; the other runs along +x with
   * its offset a function of x. That is not decoration, it is a measurement. A single trail
   * parallel to +z is INVISIBLE from a camera looking along +x, because everything a camera can see
   * has a positive forward component and the trail sits behind it: at seed 42, yaw 1.2, the nearest
   * point of the one-trail version was 6.45 m outside the visible ground and the element drew
   * literally nothing. Two orthogonal traverses put one of them in view from any bearing, and they
   * are also what a landing site actually looks like — the crews walked out and back on radials,
   * and the tracks a hundred metres from an LM cross each other constantly.
   *
   * Keeping the offset a function of the ALONG coordinate is what makes both of them cheap: the
   * trail is a graph, not a curve, so "is this ground cell on the trail" is one evaluation and one
   * subtraction rather than a distance-to-polyline search.
   *
   * They are anchored at the map's start point, so they are the same two trails on every visit to
   * that seed and they cross within a few metres of where the walk begins.
   *
   * ---- DRAWN PALER THAN THE GROUND, WHICH SURPRISES EVERY TIME --------------------------------
   * A footprint is not a dark mark. Churned fines are unpacked and porous, and unpacked powder
   * backscatters far more than the packed surface it was lifted out of, so every Apollo pan shows
   * the tracks as the BRIGHT thing on the ground. surf_west.js:567 records reaching the same
   * conclusion about its wheel ruts. What is dark is the print's own depression — the sole compacts
   * a 2 cm pit whose sunward wall is in shadow — so the shape that actually reads is a dark core
   * with a bright rim, which is what is drawn here.
   *
   * ---- AND PAST 20 m IT BECOMES CONTINUOUS ----------------------------------------------------
   * That is a flicker fix and not an LOD saving, and surf_moon.js:686 records the measurement. At
   * 60 m one screen row spans about 1.4 m of ground, so a 0.32 m sole lands inside a cell or does
   * not depending on sub-metre camera position, and a walking camera would switch a v-130 cell on
   * and off against a lum-0 background several times a second. Anything that moves across a
   * bright/dark boundary in this world has to be continuous, so beyond 20 m the discrete prints
   * become a strip that is always painted and only its texture changes. */
  var STRIDE = 0.72, PRINT_FAR = 72.0, PRINT_NEAR = 20.0;
  var trailX0 = 0, trailZ0 = 0;

  /* TWO OCTAVES, +-6.5 m ON A 45 m WAVELENGTH AND +-2 m ON A 13 m ONE. The first cut ran +-11 and
   * +-2.5 on wavelengths of 80 m and 18 m, and it measured 46 cells in a 400x100 frame at yaw 0.3
   * and ZERO at yaw 1.2 and 2.4 — the trail spent most of its length far enough off the corridor to
   * be out of the picture altogether, which is the wandering taken past the point where it is worth
   * anything. At +-8.5 m total it is inside the 72-degree view from about eight metres out, crosses
   * the walk every forty metres or so, and still leaves the frame at the sides, which was the whole
   * point of it. */
  function trailX(wz) {
    return trailX0 +
           (CC.vnoise(wz * 0.0222, BASE + 0x51) - 0.5) * 13.0 +
           (CC.vnoise(wz * 0.0750, BASE + 0x52) - 0.5) * 4.0;
  }
  function trailZ(wx) {
    return trailZ0 +
           (CC.vnoise(wx * 0.0222, BASE + 0x53) - 0.5) * 13.0 +
           (CC.vnoise(wx * 0.0750, BASE + 0x54) - 0.5) * 4.0;
  }

  /* ---- THE GROUND LATTICE HAS TO BE SOLVED FOR, NOT PICKED ---------------------------------------
   * Copied, with its reasoning, from surf_moon.js's qOf, because the same failure showed up here the
   * moment the far strip was rendered: at 400x100, dawn, the trail past twenty metres printed as
   * ladders of six identical characters lying in ranks, which reads as corduroy and not as a track.
   * The cause is a FIXED WORLD PITCH. A screen column subtends dist/275 metres at the reference grid
   * (400 columns, fov 1.25), so a 0.42 m lattice cell is 5.7 columns wide at 20 m and every hash
   * value prints as a six-character run. The pitch that keeps a lattice cell two columns wide is
   * 137.5/dist cells per metre, and the table below is that number evaluated at each band's
   * midpoint. Two columns rather than one on purpose: at exactly one column the lattice sits at the
   * grid's Nyquist limit and the field crawls as the camera walks.
   *
   * IT IS BANDED RATHER THAN CONTINUOUS so that it is still a WORLD hash inside a band and cannot
   * crawl. THAT THIS IS A COPY IS A DEFECT and it is in the report: surf_moon.js should export qOf.
   */
  var Q_D = [4, 8, 14, 22, 34, 55, 90], Q_V = [60, 23, 12.5, 7.6, 4.9, 3.1, 1.9, 1.2];
  function qOf(dist) {
    for (var i = 0; i < 7; i++) if (dist < Q_D[i]) return Q_V[i];
    return Q_V[7];
  }

  /* One ground cell of one traverse. `along` is the distance walked (z for the +z traverse, x for
   * the +x one) and `off` is how far this cell is from the trail's centreline; everything below is
   * in those two coordinates and knows nothing about which traverse it belongs to. `salt` separates
   * the two hash streams so the two trails do not print the same sequence of prints. */
  /* ---- A CREW DOES NOT MARCH ------------------------------------------------------------------
   * The trail as it stood was continuous from one end of the frame to the other: an unbroken double
   * line of prints, every stride accounted for, running the whole 72 m of PRINT_FAR. That is a
   * procession, and it was the other half of what made this world read as having a ROAD — the eye
   * does not care that the line curves if it never stops.
   *
   * What an EVA actually leaves is intermittent. The crew walk somewhere, mill about while one of
   * them photographs, detour to a rock, come back on a slightly different line, and cross forty
   * metres of untouched ground on the way to the next station. So the trail is cut into 9.4 m
   * segments and 58% of them carry prints; the rest are ground nobody stepped on.
   *
   * 9.4 m IS THIRTEEN STRIDES and the number matters. At 4 m the trail reads as a dashed line,
   * which is a road marking and worse than what it replaced. At 30 m the gaps are longer than the
   * part of the trail the frame can hold and the whole thing is present or absent per walk. Thirteen
   * strides is long enough to read as a stretch of walking and short enough that a single frame
   * usually holds two of them with a gap between.
   *
   * A GAP IS SAFE, which is the thing to check before cutting anything on this world. The mask is a
   * function of world position and the seed alone — no camera, no time — so a cell either is or is
   * not inside a walked segment for as long as the map exists. Nothing switches. */
  function walked(along, salt) {
    return hash2(Math.floor(along / 9.4), 0, BASE + salt + 0x0A) < 0.58;
  }

  function printAt(f, x, y, d, along, off, salt) {
    if (!walked(along, salt)) return;
    if (d > PRINT_NEAR) {
      /* The continuous far strip. Always painted, so no cell it owns can ever switch. */
      if (off < -0.34 || off > 0.34) return;
      var q = qOf(d);
      var hc = hash2(Math.floor(along * q), Math.floor(off * 40), BASE + salt + 0x05);
      if (hc > 0.66) return;
      var lf = litOf(0.58 + hc * 0.42, d, hc);
      emit(f, x, y, hc < 0.30 ? G_COLON : (hc < 0.5 ? G_DOT : G_SEMI), lf.col, lf.lum, d * 0.996);
      return;
    }
    var sp = along / STRIDE, si = Math.floor(sp), fz = sp - si;
    /* 0.19 m either side of the trail's own centreline, alternating: a walking human's feet are
     * about 38 cm apart, and the alternation is the whole reason a line of marks reads as somebody
     * walking rather than as a groove. */
    var lat = off - ((si & 1) ? 0.19 : -0.19);
    if (lat < 0) lat = -lat;
    var hp = hash2(si, 0, BASE + salt + 0x06);
    if (fz < 0.42 && lat < 0.13) {
      /* THE SOLE — the compacted pit, and on this world a pit two metres from your boot is not
       * quite black: the surrounding regolith is a diffuse hemispherical reflector and bounces a
       * little light into it. Same 8% slate fill surf_moon.js's darkFace uses inside 25 m, and the
       * same reason. */
      var hd = hash2(Math.floor(along * 40), Math.floor(off * 40), BASE + salt + 0x07);
      if (hd < 0.09) emit(f, x, y, G_DOT, P.slate, 16 + hd * 110, d * 0.996);
      else emit(f, x, y, 0, P.shadow, 0, d * 0.996);
      return;
    }
    if (fz < 0.54 && lat < 0.21) {
      /* THE RIM: the ridge of fines the boot pushed out sideways. This is the bright half of the
       * object and it is where the whole read lives — a dark mark alone is a hole in the ground, a
       * dark mark with a bright collar is a footprint. */
      var lr = litOf(0.80 + hp * 0.20, d, hp);
      emit(f, x, y, hp < 0.5 ? G_UNDER : G_DASH, lr.col, lr.lum, d * 0.996);
      return;
    }
    /* The spray thrown forward out of each print, which is what a footprint on an airless body
     * looks like: the ejecta leaves on a ballistic arc, lands in a sharp fan, and stays exactly
     * where it landed for a million years because there is no wind to move it and no water to wash
     * it. */
    if (fz < 0.80 && lat < 0.36) {
      var hs = hash2(Math.floor(along * 14), Math.floor(off * 14), BASE + salt + 0x08);
      if (hs < 0.20) {
        var ls = litOf(0.35 + hs, d, hs);
        emit(f, x, y, G_DOT, ls.col, ls.lum * 0.8, d * 0.996);
      }
    }
  }

  function drawPrints(f) {
    var y0 = Math.floor(V.horizon); if (y0 < 0) y0 = 0;
    var x, y;
    for (y = y0; y < V.rows; y++) {
      var row = y * V.cols;
      for (x = 0; x < V.cols; x++) {
        var i = row + x;
        if (!groundAt(f, x, y, i)) continue;
        var d = GP.d;
        if (d > PRINT_FAR) continue;
        /* The +z traverse first, then the +x one, and the first to claim the cell keeps it. Where
         * they cross, that means the +z prints are on top — which is right either way round, since
         * a crossing is two sets of prints and only one of them can be the later one. */
        var o1 = GP.wx - trailX(GP.wz);
        if (o1 > -0.8 && o1 < 0.8) { printAt(f, x, y, d, GP.wz, o1, 0x50); continue; }
        var o2 = GP.wz - trailZ(GP.wx);
        if (o2 > -0.8 && o2 < 0.8) { printAt(f, x, y, d, GP.wx, o2, 0x60); continue; }
        millAt(f, x, y, d, GP.wx, GP.wz);
      }
    }
  }

  /* ---- THE MILLING PATCHES ---------------------------------------------------------------------
   * The other thing a crew leaves, and the one that says most about what they were doing: a ROUND
   * patch of churned ground three or four metres across, with no line to it, where somebody stood
   * and turned round and set a camera down and picked it up again. Every Apollo station photograph
   * has one and it is the most human mark on the surface — a trail says a route, a milling patch
   * says a person.
   *
   * On a 34 m lattice at 26% occupancy, radius 1.6-4.4 m, jittered off the lattice cell so the
   * spacing does not read. Inside one, prints are scattered on a 2D hash rather than laid out on a
   * stride: nobody walks in a circle, they shuffle. Coverage falls off toward the rim (the middle is
   * where the boots were) so the patch has no edge, which is both what it looks like and what keeps
   * it off the flicker census — an edgeless world-locked feature has nothing to switch.
   *
   * NEAR FIELD ONLY, at PRINT_NEAR. A milling patch past 20 m is a handful of cells that the strip
   * treatment cannot help, because it has no length to be continuous ALONG. */
  var MILL_LAT = 34.0;

  function millAt(f, x, y, d, wx, wz) {
    if (d > PRINT_NEAR) return;
    var mi = Math.floor(wx / MILL_LAT), mj = Math.floor(wz / MILL_LAT);
    var hm = hash2(mi, mj, BASE + 0x70);
    if (hm > 0.26) return;
    var cx = (mi + 0.2 + 0.6 * hash2(mi, mj, BASE + 0x72)) * MILL_LAT;
    var cz = (mj + 0.2 + 0.6 * hash2(mi, mj, BASE + 0x73)) * MILL_LAT;
    var rr = 1.6 + 2.8 * (hm / 0.26);
    var dx = wx - cx, dz = wz - cz;
    var rd = Math.sqrt(dx * dx + dz * dz);
    if (rd > rr) return;
    var k = 1 - rd / rr;                     // 1 at the centre, 0 at the rim
    var hp = hash2(Math.floor(wx * 7), Math.floor(wz * 7), BASE + 0x74);
    if (hp > 0.30 + 0.40 * k) return;
    /* Same object as one print of the trail and drawn the same way round: a compacted dark core
     * with a bright collar. Here the two are dithered against each other rather than laid out,
     * because at 14 cm of lattice a shuffled patch has no stride to hang them on. */
    if (hp < 0.09) {
      emit(f, x, y, hp < 0.03 ? G_DOT : 0, P.slate, hp < 0.03 ? 20 + hp * 300 : 0, d * 0.996);
      return;
    }
    var lm = litOf(0.72 + hp * 0.28, d, hp);
    emit(f, x, y, hp < 0.19 ? G_UNDER : (hp < 0.26 ? G_COLON : G_DOT), lm.col, lm.lum, d * 0.996);
  }

  /* ============================================================================= 6. BOULDERS ===
   * THE SHADOWS ARE THE OBJECT. A rock on a scaleless grey plain is a grey blob on a grey plain; the
   * same rock with seven metres of jet black lying beside it is a rock of known height, on ground of
   * known slope, lit from a known direction. Every one of those three readings comes out of the
   * shadow and none of them comes out of the rock, which is why this element spends most of its
   * cells and all of its geometry on the black part.
   *
   * They are also FREE. A shadow on the Moon is an absence — there is no sky to fill it and no air
   * to bounce into it — so drawing one costs a write of lum 0, and it improves the print census in
   * the same stroke because it converts painted ground into black. This is the only content in the
   * project that makes the frame both better and cheaper.
   *
   * SHADOW LENGTH IS 2r/tan(alt) and that is the scale ruler this world runs on. surf_moon.js
   * compresses the director's altitude into the Apollo 0.09-0.45 rad band because every Apollo
   * landing was flown at a low sun on purpose, so across the clock a 1 m boulder's shadow runs from
   * 11 m down to 2 m — a factor of four, and the only thing about the light here that legitimately
   * changes.
   *
   * ---- THE FIELD ------------------------------------------------------------------------------
   * A 4.2 m lattice at 46% occupancy, radius 0.15-1.5 m — so 0.3 m to 3 m across, which is the size
   * range the heightmap cannot express (city.js gives a lot ONE height and its smallest lot is 7 m
   * square, so anything under a couple of metres has to be an element). The radius is the CUBE of
   * the hash, which is not decoration: a real boulder-size distribution is a steep power law, and
   * the cube puts about seven eighths of them under 0.4 m and one in a hundred over a metre. A field
   * of evenly-sized rocks reads as gravel poured out of a bag.
   *
   * ---- AND THEY KEEP OFF THE CENTRELINES, BY AN AMOUNT THAT DEPENDS ON THEIR SIZE --------------
   * city.js's route walks street centrelines, so a boulder sitting on one is a boulder the camera
   * walks through — and a 3 m rock passing through the eye is not a graceful failure, it is a
   * full-frame luminance event. The clearance is 1.1 m plus 1.7 radii rather than a flat number,
   * which is both what a rock needs (a 3 m boulder wants three metres of room; a 30 cm one wants a
   * stride) and what keeps the near field from being swept empty: a flat 2.6 m cleared EVERY size
   * out of the corridor, and the first render of this element had a near field with no rock in it
   * at all, which is the exact failure this element exists to prevent.
   *
   * The test is against the LATTICE (aveX/crossZ), not against CFG.streetX: the latter is which
   * street the camera is on right now, so keying off it would make whole rock fields appear and
   * vanish every time the walk turned a corner. Off the lattice the field is a property of the map
   * and never changes. It also, for free, leaves clear lanes through the boulders exactly where the
   * walk goes, which is what a much-driven landing site looks like. */
  var BLD_LAT = 4.2, BLD_R = 92.0, BLD_P = 0.46;

  /* The block-field modulation. Bilinear over nine boulder-lattice cells, i.e. 37.8 m, smoothstepped
   * on both axes so the field has no crease anywhere and no visible tile. Returns 0.20..1.80 with a
   * mean of 1, so the boulder count over any large patch is exactly what it was and only its
   * DISTRIBUTION has changed. */
  function bldField(i, j) {
    var qx = i / 9, qz = j / 9;
    var i0 = Math.floor(qx), j0 = Math.floor(qz);
    var fx = qx - i0, fz = qz - j0;
    fx = fx * fx * (3 - 2 * fx); fz = fz * fz * (3 - 2 * fz);
    var a = hash2(i0, j0, BASE + 0x6D), b = hash2(i0 + 1, j0, BASE + 0x6D),
        c = hash2(i0, j0 + 1, BASE + 0x6D), d = hash2(i0 + 1, j0 + 1, BASE + 0x6D);
    var ab = a + (b - a) * fx;
    return 0.20 + 1.60 * (ab + ((c + (d - c) * fx) - ab) * fz);
  }

  function drawBoulders(f) {
    if (!CITY) return;
    var lo0 = Math.floor((V.ox - BLD_R) / BLD_LAT), hi0 = Math.floor((V.ox + BLD_R) / BLD_LAT);
    var lo1 = Math.floor((V.oz - BLD_R) / BLD_LAT), hi1 = Math.floor((V.oz + BLD_R) / BLD_LAT);
    var i, j;
    var salt = sunAlt(), tanA = Math.tan(salt), sinA = Math.sin(salt);
    if (tanA < 0.02) tanA = 0.02;
    if (sinA < 0.02) sinA = 0.02;
    var sX = sunX(), sZ = sunZ();
    for (j = lo1; j <= hi1; j++) {
      for (i = lo0; i <= hi0; i++) {
        var h = hash2(i, j, BASE + 0x61);
        /* ---- AND THEY COME IN FIELDS ----------------------------------------------------------
         * A flat 46% over a 4.2 m lattice is a boulder every nine square metres EVERYWHERE, which
         * is a gravel bed, not a mare surface. Real ejecta lies in patches: a block field round the
         * rim of the crater that threw it, and bare regolith between the fields. So the occupancy
         * is modulated by a bilinear field on a 9-cell (38 m) lattice, running 0.20 to 1.80 of the
         * nominal rate — bare stretches at 9% and block fields at 83%, mean unchanged at 46%.
         *
         * 38 m and not the swell's 54: the two must NOT be commensurate, or every block field
         * lands on the same crest as every drift of fines and the whole plain acquires one
         * frequency. Bilinear rather than per-cell for the reason every other lattice in this
         * project is — a hard cell puts visible 38 m tiles on the ground. */
        if (h > BLD_P * bldField(i, j)) continue;
        var px = (i + 0.12 + 0.76 * hash2(i, j, BASE + 0x62)) * BLD_LAT;
        var pz = (j + 0.12 + 0.76 * hash2(i, j, BASE + 0x63)) * BLD_LAT;
        /* Behind the eye plane or out past the field radius: the cheapest two rejects, first. */
        var rx = px - V.ox, rz = pz - V.oz;
        var w = rx * V.fwx + rz * V.fwz;
        if (w < 0.9 || w > BLD_R) continue;
        /* On the heightmap, i.e. inside a crater rim or a rock pile city.js already drew. */
        if (CITY.height(px, pz) > 0.1) continue;

        var hr = hash2(i, j, BASE + 0x64);
        var r = 0.15 + hr * hr * hr * 1.35;
        /* On a route centreline, by its own size — see the block comment. */
        var clr = 1.1 + 1.7 * r;
        var ka = Math.round(px / CITY.AVE), kc = Math.round(pz / CITY.CROSS);
        var da = px - (CITY.aveX(ka) + 0.5); if (da < 0) da = -da;
        if (da < clr) continue;
        var dc = pz - (CITY.crossZ(kc) + 0.5); if (dc < 0) dc = -dc;
        if (dc < clr) continue;
        /* ---- THE EDGE OF THE CLEARED LANE IS FEATHERED, AND ONLY OUTWARD ----------------------
         * The two tests above are exact rectangles centred on the route lattice, so what they leave
         * on the ground is a swept corridor with a DEAD STRAIGHT EDGE running the length of every
         * avenue and every cross street in the world. On a plain with nothing else straight in it
         * that reads as a kerb — a line of absence is as much a line as a line of paint, and this
         * one is axis-aligned and infinite. It is the last surviving artefact of the street lattice
         * on this world and it is the thing the map spent a whole pass hiding.
         *
         * The repair is a probabilistic taper outside the hard clearance: a boulder between clr and
         * clr+fw survives with probability (da-clr)/fw, so the field thins into the lane over four
         * metres or so instead of stopping at a line. The width itself wanders on a 44 m noise, so
         * the OUTER edge of the taper is not straight either.
         *
         * IT CAN ONLY EVER REMOVE A BOULDER. The hard clearance above is untouched and is still the
         * thing that keeps a three-metre rock out of the camera's path; this runs after it and
         * subtracts. A version that let the wobble push the clearance inward was written first and
         * thrown away — the whole safety argument for that constant is that it is a floor. */
        var fh = hash2(i, j, BASE + 0x6C);
        var fw = 4.2 * (0.45 + 1.1 * CC.vnoise(pz * 0.023, BASE + 0x6A));
        if (da < clr + fw && fh > (da - clr) / fw) continue;
        fw = 4.2 * (0.45 + 1.1 * CC.vnoise(px * 0.023, BASE + 0x6B));
        if (dc < clr + fw && fh > (dc - clr) / fw) continue;

        var sd = (BASE + i * 7919 + j * 104729) & 0x3fffff;
        drawShadow(f, px, pz, r, sX, sZ, tanA, sinA, sd);
        drawRock(f, px, pz, r, sX, sZ, sd);
      }
    }
  }

  /* ---- the shadow ---------------------------------------------------------------------------------
   * Rasterised BACKWARD: the screen bounding box of the shadow is found first, and then every floor
   * cell inside it is inverse-projected and tested analytically against the shadow ellipse. Forward
   * rasterisation of a world-space polygon is the obvious way and it is wrong here, because a shadow
   * lies on the ground and the ground is seen at grazing incidence — at 40 m one screen row spans
   * one and a half metres of world, so a forward scan either leaves holes or has to oversample by
   * fifty to one. Backward, every cell is visited exactly once and there are no holes by
   * construction.
   *
   * The axis is clipped to the visible half-space FIRST, and that clip is what makes the bounding
   * box safe. The shadow points away from the sun and the sun is behind the walk, so shadows come
   * TOWARD the camera — a boulder ten metres ahead with an eleven-metre shadow has that shadow's tip
   * behind the eye plane, where the projection is meaningless and a bounding box built from it would
   * be garbage. w along the axis is linear in the axis parameter, so the clip is one division. */
  function drawShadow(f, px, pz, r, sX, sZ, tanA, sinA, sd) {
    var ax = -sX, az = -sZ;                            // antisolar: the direction shadows lie in
    var L = 2 * r / tanA;
    if (L > 44) L = 44;
    var w0 = (px - V.ox) * V.fwx + (pz - V.oz) * V.fwz;
    var aw = ax * V.fwx + az * V.fwz;
    var s0 = 0, s1 = L;
    if (aw > 1e-6) { var c0 = (0.6 - w0) / aw; if (c0 > s0) s0 = c0; }
    else if (aw < -1e-6) { var c1 = (0.6 - w0) / aw; if (c1 < s1) s1 = c1; }
    else if (w0 < 0.6) return;
    if (s1 <= s0) return;

    /* Ten boundary samples, all of them now guaranteed in front of the eye plane, give the screen
     * bounding box. Padded by two cells because the projection of a convex region is convex but its
     * bounding box is not exactly the box of a few boundary samples. */
    var bx0 = 1e9, bx1 = -1e9, by0 = 1e9, by1 = -1e9, k, q;
    var qx = -az, qz = ax;                             // the across-shadow unit (the axis is unit)
    for (k = 0; k <= 4; k++) {
      var s = s0 + (s1 - s0) * (k / 4);
      for (q = -1; q <= 1; q += 2) {
        if (!project(px + ax * s + qx * r * q, 0, pz + az * s + qz * r * q)) continue;
        if (PJ.x < bx0) bx0 = PJ.x; if (PJ.x > bx1) bx1 = PJ.x;
        if (PJ.y < by0) by0 = PJ.y; if (PJ.y > by1) by1 = PJ.y;
      }
    }
    if (bx1 < bx0) return;
    var X0 = Math.floor(bx0) - 2, X1 = Math.ceil(bx1) + 2;
    var Y0 = Math.floor(by0) - 2, Y1 = Math.ceil(by1) + 2;
    if (X0 < 0) X0 = 0; if (X1 >= V.cols) X1 = V.cols - 1;
    if (Y0 < Math.floor(V.horizon)) Y0 = Math.floor(V.horizon);
    if (Y0 < 0) Y0 = 0;
    if (Y1 >= V.rows) Y1 = V.rows - 1;
    if (X1 < X0 || Y1 < Y0) return;

    var hl = L * 0.5, mx = px + ax * hl, mz = pz + az * hl;
    /* THE PENUMBRA, and it is the honest one. The sun subtends 0.0093 rad, so a shadow edge on the
     * ground is blurred by 0.0093 * (distance from the occluder), stretched by 1/sin(alt) because
     * the ground is grazed rather than square-on. At the tip of a 6 m shadow under an 8-degree sun
     * that is 0.40 m — eleven columns at 10 m, and comfortably more than the flicker gate needs.
     * Floored at 4 cm so a pebble still gets a soft cell, ceilinged at the rock's own radius so a
     * long shadow does not become all edge. */
    var pen = 0.0093 * L / sinA;
    if (pen < 0.04) pen = 0.04;
    if (pen > r * 1.4) pen = r * 1.4;

    var x, y;
    for (y = Y0; y <= Y1; y++) {
      var row = y * V.cols;
      for (x = X0; x <= X1; x++) {
        var i = row + x;
        if (!groundAt(f, x, y, i)) continue;
        var lum = f.lum[i];
        if (lum <= 0) continue;                        // already black: nothing to take away
        var ex = GP.wx - mx, ez = GP.wz - mz;
        var u = (ex * ax + ez * az) / hl, v = (ex * qx + ez * qz) / r;
        var rq = Math.sqrt(u * u + v * v);
        if (rq >= 1.001) continue;
        /* How far inside the shadow, in metres across the edge, normalised by the penumbra. */
        var kk = (1 - rq) * r / pen;
        if (kk >= 1) {
          if (GP.d < 25) {
            /* Inside 25 m a lunar shadow is demonstrably not black — the regolith around it is a
             * diffuse hemispherical reflector and bounces a little light in. Eight percent at
             * v 22-33 keeps the near ground from becoming a void the eye reads as a missing
             * polygon. Same numbers as surf_moon.js's darkFace, and slate rather than shadow for
             * the reason that file measured: shadow's gain halves on the day ladder and the fill
             * would silently disappear at noon. */
            var hf = hash2(Math.floor(GP.wx * 30), Math.floor(GP.wz * 30), sd ^ 0x91);
            if (hf < 0.08) { put(f, x, y, G_DOT, P.slate, 16 + hf * 110, GP.d * 0.99, 2); continue; }
          }
          put(f, x, y, 0, P.shadow, 0, GP.d * 0.99, 2);
          continue;
        }
        /* The ramp, and the reason it stops at 0.24 rather than at 0. A cell crossing the edge as
         * the sun turns would otherwise step the full height of a lit ground cell in one frame;
         * held to 24% first, the flip itself is 17% of full scale, which is surf_moon.js's measured
         * remedy applied to the one geometry in this file that sweeps. */
        put(f, x, y, f.ch[i], f.col[i], lum * (0.24 + 0.76 * (1 - kk)), GP.d * 0.99, 2);
      }
    }
  }

  /* ---- the rock ------------------------------------------------------------------------------------
   * AN ANGULAR FRAGMENT, AND EMPHATICALLY NOT A SPHERE. The first cut of this drew each boulder as a
   * filled disc — `r2 = u*u + v*v; if (r2 > 1) continue;` — with a smooth sphere normal
   * (u*right - v*up + sqrt(1-r2)*(-viewdir)) and a specular ring round its limb. The arithmetic was
   * right and the object was wrong: what it produced was a small round grey body with a terminator
   * across it and a bright rim, which is a picture of a MOON. Scattering a few hundred of them
   * across a lunar plain read exactly as it sounds.
   *
   * Nothing on the Moon is round. Lunar surface rocks are impact breccia and fractured basalt:
   * they are chipped, they are faceted, and they have corners. There is also no weathering to round
   * them off — no water, no wind, no frost — so a fragment that broke ten million years ago still
   * has the shape it broke in. A sphere is the one silhouette that cannot occur.
   *
   * So the outline is a POLYGON: seven vertices at hashed radii, with straight chords between them,
   * and the boundary radius along any ray is the exact chord intersection rather than a constant.
   * The shading is FLAT PER FACET — one normal for each sector, held constant across it — which is
   * what puts a hard-edged tonal step between two faces of the same rock and is the single thing
   * that says "angular" at character resolution. The specular is on the facet that happens to face
   * the sun rather than round a limb, because a facet catches the light and a limb is a thing
   * spheres have.
   *
   * WITH THE SUN BEHIND THE WALK, MOST ROCKS ARE FULLY LIT AND ONLY ONE OR TWO FACETS TURN AWAY.
   * That is not a bug and not a waste: it is what down-sun Apollo photography looks like, it is why
   * the crews were told to shoot down-sun, and it is why the shadows above carry the relief. Turn
   * round and the same rocks are black cut-outs with a chipped edge. */
  var NFACET = 7, TAU_F = 6.283185307;
  /* Facet scratch, allocated once for the life of the page: drawRock runs for every rock in the
   * frame and this file is allocation-free in draw() by contract. */
  var FU = new Float64Array(NFACET), FV = new Float64Array(NFACET), FB = new Float64Array(NFACET);

  /* The vertex radius of facet k, 0.58-1.00 of the rock's nominal size. The spread is what stops
   * seven equal radii from being a heptagon, which at this cell size is a circle again. */
  function facetR(k, sd) {
    return 0.58 + hash2(((k % NFACET) + NFACET) % NFACET, 3, sd ^ 0x5C13) * 0.42;
  }
  function drawRock(f, px, pz, r, sX, sZ, sd) {
    if (!project(px, r, pz)) return;
    var cx = PJ.x, cy = PJ.y, d = PJ.d, w = PJ.w;
    var rw = r * V.colK / w, rh = r * V.scale / w;

    /* The unit direction from eye to rock, needed for the bulge term. */
    var vx = px - V.ox, vy = r - V.eyeY, vz = pz - V.oz;
    var vn = Math.sqrt(vx * vx + vy * vy + vz * vz); if (vn < 1e-4) return;
    vx /= vn; vy /= vn; vz /= vn;
    var salt = sunAlt(), sca = Math.cos(salt);
    var Sx = sX * sca, Sy = Math.sin(salt), Sz = sZ * sca;
    var sr = V.rgx * Sx + V.rgz * Sz;                  // right . sun
    var su = Sy;                                       // up . sun
    var sf = -(vx * Sx + vy * Sy + vz * Sz);           // (-viewdir) . sun

    if (rw < 0.75) {
      /* Under a cell across. Drawn as ONE cell rather than skipped, because at this size the rock's
       * shadow is still several cells long and a shadow with nothing at the end of it reads as a
       * scratch. The lighting collapses to the bulge term, which is what a sphere under a cell wide
       * actually integrates to. */
      var lk = clamp(0.5 + 3.0 * sf, 0, 1);
      if (lk < 0.25) return;
      var hs = hash2(Math.floor(px * 4), Math.floor(pz * 4), sd ^ 0x71);
      var l1 = litOf(0.55 + hs * 0.45, d, hs);
      /* NOT G_o. At one cell the glyph IS the silhouette, and 'o' is a ring — the same mistake as
       * the disc one scale up. A chip of rock under a cell across is a blob of ink, which is what
       * '%' and '8' are and what '.' is when it is smaller still. */
      emit(f, Math.floor(cx), Math.floor(cy), hs < 0.35 ? G_PCT : (hs < 0.7 ? G_8 : G_DOT),
           l1.col, l1.lum * lk, d);
      return;
    }

    var iw = Math.ceil(rw), ih = Math.ceil(rh), dx, dy;
    var x0 = Math.floor(cx), y0 = Math.floor(cy);
    /* CLIPPED TO THE FRAME BEFORE THE LOOP, NOT INSIDE emit(). A 3 m boulder two metres from the eye
     * projects to a disc 400 columns across and 300 rows tall, so the naive nested loop is a quarter
     * of a million iterations for ONE rock — every frame, while the camera walks past it, with
     * ninety per cent of them thrown away by a bounds test. Intersecting the ranges with the frame
     * first costs four compares and makes the worst case the size of the screen, which is the most
     * an object can ever legitimately cost. */
    var dx0 = -iw, dx1 = iw, dy0 = -ih, dy1 = ih;
    if (x0 + dx0 < 0) dx0 = -x0;
    if (x0 + dx1 > V.cols - 1) dx1 = V.cols - 1 - x0;
    if (y0 + dy0 < 0) dy0 = -y0;
    if (y0 + dy1 > V.rows - 1) dy1 = V.rows - 1 - y0;
    /* The seven facet normals, resolved once per rock rather than once per cell. Each is the
     * outward direction of its own chord, tilted toward the eye by a hashed amount so no two faces
     * of the same rock catch the light equally — which is the whole read. `nb` is how far the facet
     * leans toward the viewer; a low value is a face seen almost edge-on and it is what makes one
     * side of a rock go dark while the rest stays lit. */
    var fu = FU, fv = FV, fb = FB, fk;
    for (fk = 0; fk < NFACET; fk++) {
      var mid = (fk + 0.5) * TAU_F / NFACET;
      var lean = 0.34 + hash2(fk, 7, sd ^ 0x6D2) * 0.52;
      var cxn = Math.cos(mid) * lean, cyn = Math.sin(mid) * lean;
      var cbn = Math.sqrt(1 - lean * lean * 0.92);
      var nn = Math.sqrt(cxn * cxn + cyn * cyn + cbn * cbn);
      fu[fk] = cxn / nn; fv[fk] = cyn / nn; fb[fk] = cbn / nn;
    }
    /* Which facet is most nearly square-on to the sun; that one gets the specular, in place of the
     * limb ring a sphere would have had. */
    var bestF = 0, bestD = -2;
    for (fk = 0; fk < NFACET; fk++) {
      var bd = fu[fk] * sr - fv[fk] * su + fb[fk] * sf;
      if (bd > bestD) { bestD = bd; bestF = fk; }
    }

    for (dy = dy0; dy <= dy1; dy++) {
      for (dx = dx0; dx <= dx1; dx++) {
        var u = (x0 + dx - cx) / rw, v = (y0 + dy - cy) / rh;
        var r2 = u * u + v * v;
        if (r2 > 1.0) continue;                        // cheap reject before the polygon test
        /* ---- THE POLYGON, and it is an exact chord intersection rather than a stepped radius.
         * Quantising the boundary to one radius per sector gives a shape made of arcs, which is a
         * circle with dents in it; the straight chord between two vertices is what gives a rock a
         * flat edge and a corner. For a ray at angle t between vertices at a0 and a1 with radii r0
         * and r1, the chord is hit at  r0*r1*sin(d) / (r0*sin(t-a0) + r1*sin(a1-t)). */
        var ang = Math.atan2(v, u); if (ang < 0) ang += TAU_F;
        var tt = ang * NFACET / TAU_F;
        var kk0 = Math.floor(tt), ff = tt - kk0;
        var a0 = kk0 * TAU_F / NFACET, dA = TAU_F / NFACET;
        var r0 = facetR(kk0, sd), r1 = facetR(kk0 + 1, sd);
        var den = r0 * Math.sin(ff * dA) + r1 * Math.sin(dA - ff * dA);
        var lim = den > 1e-6 ? (r0 * r1 * Math.sin(dA)) / den : 1;
        if (r2 > lim * lim) continue;

        var fi = kk0 % NFACET;
        /* Per-cell depth: a mild bulge, for ordering only — enough that the rock's own silhouette
         * does not overwrite the ground in front of its base, without reintroducing a sphere. */
        var bulge = (1 - r2) * 0.55;
        var dd = d - bulge * r;
        var dot = fu[fi] * sr - fv[fi] * su + fb[fi] * sf;
        var litK = clamp(0.5 + 3.0 * dot, 0, 1);
        /* Keyed on the rock's own surface parameterisation, not on the screen cell: the field has to
         * be welded to the rock or it crawls as the camera walks past. It is not perfect — u and v
         * do rotate slowly as the viewer moves round the rock — but a boulder is passed, not
         * orbited, and this is the same compromise west_range.js's tumbleweed makes. */
        var hv = hash2(Math.floor((u + 1.2) * 9), Math.floor((v + 1.2) * 9), sd ^ 0x72);
        var edge = litK - hv * 0.74;
        if (edge <= 0) {
          /* The unlit flank: a hole, and it reads because its EDGE is razor-sharp against pure at
           * v 219-234 next to it. Contrast does the work that fill light does in the other two
           * worlds and it costs zero cells. */
          if (d < 25 && hv > 0.94) emit(f, x0 + dx, y0 + dy, G_COMMA, P.slate, 18 + hv * 40, dd);
          else emit(f, x0 + dx, y0 + dy, 0, P.shadow, 0, dd);
          continue;
        }
        var soft = softOf(edge);
        /* The lit limb — where the surface turns away from the eye — is a grazing reflection off a
         * fracture plane and is a genuine specular. About 6% of the painted cells of an object that
         * is itself a small part of the frame, which is where a slice of the print's hot budget is
         * meant to come from. */
        /* THE SPECULAR IS ON A FACET, NOT ROUND A LIMB. `r2 > 0.80` put a bright annulus at the
         * edge of every rock, which is the single most sphere-like mark available and was half of
         * why these read as little moons. A fracture plane that happens to face the sun glints;
         * that is one face of the rock, and it is a patch rather than a ring. */
        if (fi === bestF && bestD > 0.15 && hv < 0.26) {
          var ls = specOf(0.55 + hv, d);
          emit(f, x0 + dx, y0 + dy, G_EQ, ls.col, ls.lum * soft, dd);
          continue;
        }
        /* A mass, not a rhythm: on a world where the sun is behind the walker the lit rock is the
         * brightest large object in the frame, and painting it as a sparse scatter of dim glyphs
         * puts every cell of it in the muddy band. The structure comes from what is NOT painted. */
        if (hv > 0.86) { emit(f, x0 + dx, y0 + dy, 0, P.shadow, 0, dd); continue; }
        var k = hv / 0.86;
        var lf = litOf(k * 0.85 + 0.15 * bulge, d, hv);
        emit(f, x0 + dx, y0 + dy,
             k < 0.28 ? G_8 : (k < 0.56 ? G_PCT : (k < 0.82 ? G_HASH : G_X)),
             lf.col, lf.lum * soft, dd);
      }
    }
  }

  /* =========================================================== 7. THE SHADOWS THE GROUND CASTS ===
   * THE SINGLE LARGEST LEGIBILITY LEVER ON THIS WORLD, and until this pass nothing drew it.
   *
   * Every Apollo landing was flown at a sun between 5 and 25 degrees, and the reason is one
   * sentence: with no air, no aerial perspective and no vegetation, THE ONLY WAY TO READ RELIEF ON
   * A REGOLITH PLAIN IS THE LENGTH OF ITS SHADOWS. A crew standing on a rise at local noon cannot
   * tell it is on a rise. surf_moon.js's floor already knows this — it is why the whole file exists
   * in shades of coverage rather than of luminance — but it is handed two world coordinates and
   * cannot see a metre in any direction, so the one thing it can never draw is the shadow of
   * something ELSE.
   *
   * This element can, because it has the map. city.js puts up to 2.8 m of rolling relief on every
   * non-street lot on the Moon, plus rock piles to 5.4 m and crater rims.
   *
   * ---- HOW ------------------------------------------------------------------------------------
   * For each floor cell the caster has already painted, inverse-project it (groundAt, which recovers
   * the caster's own forward depth out of the depth buffer and is therefore exact), then march the
   * SUN RAY back from that point: at u metres toward the sun the ray is u*tan(alt) above the ground,
   * so any terrain higher than that blocks it. What comes out is `k`, a coverage in 0..1 — how much
   * of this cell's regolith the terrain up-sun of it has taken.
   *
   * ---- THE BLOCKER FIELD IS NOT city.height, AND THAT IS THE PHOTOSENSITIVITY FIX --------------
   * The first cut of this pass read CITY.height directly at each sample, and it was the largest
   * in-band flicker source on the world. The mechanism is worth writing out because it is not
   * obvious and it is general.
   *
   * CITY.height is PIECEWISE CONSTANT: it floors its arguments to a metre and a whole lot shares
   * one slab. The march's sample points are `s * reach / n` metres along (sX,sZ), and BOTH of those
   * move continuously with the clock — `reach` off the altitude, (sX,sZ) off the bearing. So the
   * sample points slide across the lattice, and a max over samples of a piecewise-constant field is
   * a STEP FUNCTION OF TIME. Worse, it is a non-monotonic one: as one sample leaves a slab and the
   * next enters it, `best` falls and rises again, so a cell does not switch once as a shadow edge
   * passes over it — it chatters. Measured with the camera pinned and the clock RUNNING — which is
   * the thing tools/west-flicker.cjs does NOT do, see the note at the registration block — the pass
   * alone ran to 2.80% in the 3-20 Hz band and 0.75 big steps a second, against gates of 2% and
   * 1.0/s, on a background of lum 0 where every step is most of full scale. The dithered edge below
   * is no defence: it spreads the SPATIAL handover, and gives nothing at all when `best` jumps
   * across zero and takes every cell of an edge in one frame.
   *
   * So the march reads bgSample: a BILINEAR interpolation over a 2 m lattice whose nodes are the
   * max of the four metre cells under them. Bilinear over any lattice is continuous, so the sampled
   * height is a continuous function of position, `best` is a continuous function of the clock, and
   * a sample crossing a lot boundary ramps over the 2 m it takes to cross instead of jumping. The
   * node max rather than a point sample because a lot is 7-16 m across but a crater rim is not:
   * point-sampling a 2 m lattice can step over a rim ring, and a max cannot. The cost of the max is
   * that every blocker is dilated by up to 2 m, which lengthens its shadow by 2 m in a field whose
   * shadows are 12-28 m long.
   *
   * The nodes are cached direct-mapped on a 128x128 wrap, stamped per frame. The wrap is safe
   * because the region a frame touches is bounded by TS_FAR + TS_REACH = 73 m, i.e. 37 nodes each
   * side of the camera against the 64 the wrap allows; if TS_FAR and TS_REACH ever grow past 128 m
   * between them, two different pieces of ground start sharing a slot. Measured at 400x100 noon,
   * the cache turns 150,196 CITY.height calls in one drawRelief into 1,868 — and, measured on the
   * clock rather than on the call count, that saving pays for the four-tap bilinear exactly: the
   * pass costs 2.50 ms where the point-sampled version cost 2.49. The cache is not an optimisation
   * that was wanted, it is the price of the interpolation being affordable at all.
   *
   * ---- THE EDGE IS DITHERED AND THEN RAMPED ---------------------------------------------------
   * A lunar shadow has no penumbra — that is one of the four facts at the top of surf_moon.js — and
   * a shadow edge drawn as a hard test is a line of cells switching between v 130 and lum 0 as it
   * sweeps. Two remedies stacked, and the second one is what actually bought the measurement:
   *
   *   THE DITHER, on the cell's own stable world hash, so the edge is a one-cell scatter rather
   *   than a line and the handover is spread over every cell of it. This is facade()'s terminator
   *   remedy, verbatim.
   *
   *   THE RAMP. A dither alone still takes each individual cell from its lit luminance to zero in
   *   ONE frame, and on this world that is 56% of full scale. So the last TS_EDGE of the coverage
   *   ramp DIMS THE CELL'S OWN PAINT instead of deleting it: e runs 0..1 across the band and the
   *   cell is written back at lum * (1-e), so what used to be one 144-point drop is spread over the
   *   whole time `k` takes to sweep TS_EDGE.
   *
   *   MEASURED, seeds 42/7/1234 at all six stops, 120x40, pinned camera, clock RUNNING, against
   *   gates of 1.0 big steps/s and 2% in the 3-20 Hz band. BEFORE: the pass alone ran to 2.80% in
   *   band and 0.75 big steps/s. AFTER, and this is the form the claim should always have taken —
   *   the world pass alone at the same eighteen (seed, hour) pairs measures 0.04-1.81% in band,
   *   0.00-0.25/s, worst step 20.4-85.9%; with this element drawn on top of it the figures are
   *   0.34-1.81%, 0.00-0.25/s, worst step 20.4-85.9%. The worst step and the big-step rate are
   *   IDENTICAL at every one of the eighteen or lower (the element dims cells the world pass was
   *   stepping), and the largest in-band increment it adds anywhere is 0.52 points.
   *
   *   A handover cell is written back as kind 2 and not kind 3, because it is still floor and is
   *   only partly shaded — a bootprint may legitimately be drawn on it. Only a cell at full
   *   coverage becomes kind 3.
   *
   * ---- THE REACH IS 28 m, AND IT IS NOT 6/tan(alt) --------------------------------------------
   * The obvious reach is "far enough to catch the tallest thing on the map", i.e. 6.0/tan(alt),
   * which is 12 m at the top of the Apollo band and 44 m at the bottom. It is wrong, and the render
   * says so louder than any census: at the dusk and dawn stops the sun is 7.7 degrees up, a 2.8 m
   * mound throws 20 m and a 5 m rock pile throws 37, shadows merge, and a camera that happens to be
   * looking up-sun gets a frame with NO GROUND IN IT. Measured at seed 42, dusk, yaw 4.5 — a pose
   * looking straight into the low sun — the 40 m version took 90% of the visible floor and the near
   * field went black.
   *
   * It is worth being clear that this is not an error in the shadow arithmetic. It is what a 7.7
   * degree sun does to ground with 2.8 m of relief on it, and standing in the shade of a rock pile
   * is a real thing to be doing on the Moon. It is simply not a frame, and this renderer has no
   * cut to another one. The autopilot walk itself rarely gets there — over a whole 420 s day it
   * never once looked at a frame that bad — but the viewer has a mouse, and "only if you do not
   * look that way" is not a defence.
   *
   * ---- WHAT IS STILL BEARING-DEPENDENT, AND IT IS NOT GOING AWAY ------------------------------
   * The share this pass takes still swings enormously with where the camera is pointed. Measured,
   * seed 42 at the start pose, share of the visible ground's light removed, over six yaws:
   *       dawn     0.0  0.7  51.9  73.8  40.6   6.5 %
   *       morning  0.0 19.3  73.6  63.0  13.8   0.0 %
   *       dusk    25.1 12.3   3.9   0.0  21.3  77.4 %
   * That is not noise and it is not fixable here. city.js's corridors are straight, 10-20 m wide,
   * flat by construction, and lie in shallow valleys because swellEdge fades the relief to zero at
   * the block boundary; the walk follows those corridors, so most of the visible floor in any frame
   * IS a corridor. A shallow straight valley lit ALONG its axis has no cast shadow on its floor and
   * lit ACROSS it is entirely shadowed, so the answer is a function of the angle between the sun
   * and the corridor. It is correct terrain behaviour on a map whose terrain has a lattice in it.
   *
   * The same measurement made over the OPEN GROUND rather than over a frame shows how much of the
   * swing is the corridor and how much is the sun: marching this same law over a 121x121 m patch
   * of flat ground at the dawn/dusk altitude, the shadowed share runs 11.4% to 26.0% over a full
   * turn of the bearing — a factor of 2.3, against the frame's 0 to 77. The other factor of thirty
   * is the corridor, and the only place it could be fixed is city.js.
   *
   * BE CLEAR ABOUT WHICH KNOB DID WHAT, because the reach is the smaller half of it. What actually
   * stops the frame emptying is the RAMP and the FILL below: at the same yaw-4.5 dusk pose, the
   * share of the visible ground's LIGHT this pass removes goes 86.2% before this round to 73.0%
   * with the ramp and the fill in and the reach still at 40. The reach then sets how much of the
   * middle of the distribution it takes. Measured over a full 420 s day of the real autopilot walk,
   * sampled once a second at 140x44, seeds 42/7/3/1234, the share of the visible floor whose
   * luminance the pass changes —
   *       reach 40   p50 0.0-0.1   p90 0.5-11.9   max 9.9-34.2   mean 0.3-2.9
   *       reach 28   p50 0.0-0.1   p90 0.5- 7.5   max 9.8-33.7   mean 0.3-2.3
   *       reach 18   p50 0.0-0.1   p90 0.4- 2.5   max 3.2-27.0   mean 0.1-1.3
   * (the pre-round tree, for the same walk: p90 0.7-14.4, max 14.0-36.1, mean 0.5-3.6.)
   *
   * 28 IS CHOSEN ON ATTRIBUTION RATHER THAN ON THE TAIL. At the worst pose 28 and 40 are within
   * four points of each other (77.4% against 73.0%) and neither is the problem any more. What 40
   * buys is shadow from casters 30-40 m up-sun, and at 40 m one floor row already spans 7 m of
   * ground — the caster and its shadow are never in the same part of the picture, so what arrives
   * is a tonal wash the eye cannot attribute to anything. 28 m holds the day's p90 under 8% and
   * still runs the full 20.6 m shadow a 2.8 m mound throws at the dusk sun. 18 was measured and
   * rejected the other way: it holds the tail down by giving up the content, and an element costing
   * 2.5 ms a frame has to do something with it.
   *
   * TS_FAR 45 m is the same argument seen down the barrel of the projection. At the reference grid
   * (400x100) a floor row spans d^2/263 metres, so a 28 m shadow is 3.6 rows deep at 45 m and 1.6
   * at 68; past 45 the whole shadow is inside a row and is doing nothing the fines are not.
   *
   * SIX SAMPLES NEAR AND FOUR FAR, EVENLY SPACED. Geometric spacing is the obvious choice and is
   * wrong: it puts three samples in the first two metres, where nothing on this map is ever tall
   * enough to matter, and leaves the gaps at the far end where the mounds are. Even spacing over a
   * 28 m reach gives a step of 4.7 m near and 7 m far, against blockers that are lots 7-16 m across
   * on a field that has already been smoothed to a 2 m lattice — so nothing is missed. Ten and six
   * were the first cut's numbers and they were sized for a 40 m reach; at 28 m they oversample the
   * 2 m lattice by a factor of three and cost 15% of the pass for nothing.
   *
   * ---- THE FALLOFF AND THE FILL, WHICH ARE THE SAME ARGUMENT ----------------------------------
   * A shadow whose caster is 4 m away is a hole: you can see the rock and you can see its shadow,
   * and the two agree. A shadow whose caster is 25 m away is not, and the reason is roughness. A
   * natural crest is not a knife edge; its own sub-metre relief is smeared along the shadow by
   * 1/tan(alt), which at the dusk sun is a factor of seven, so what a distant crest actually throws
   * is a LACE of light and dark rather than a solid band. So the coverage a sample can contribute
   * falls from 1 at TS_HARD to TS_RAG at the reach — applied INSIDE the max over samples, never to
   * the winning sample's distance afterwards, because the argmax jumps between samples and a term
   * keyed on it would put the step function straight back.
   *
   * And a cell at full coverage is not empty. Inside TS_FILL_D the shadow keeps a TS_FILL scatter
   * of slate at lum 14-40 — the same swatch and the same argument as surf_moon.js's darkFace fill,
   * which is light bounced off the sunlit ground around it — tapering to nothing by TS_FILL_E.
   * Without it a deep shadow is a rectangle of absolutely nothing, and this world already has more
   * of those than it can spend.
   *
   * ---- WHAT IT COSTS --------------------------------------------------------------------------
   * Measured at 400x100, seed 42 noon, best of six runs of 200 replayed frames, pinned camera,
   * clock running:
   *       world pass alone                      7.95 before / 8.06 now   (untouched)
   *       world pass + this element alone      10.44 / 10.56             (the pass is 2.5 ms)
   *       moon element set WITHOUT this pass   10.67 / 10.64             (untouched)
   *       moon element set with everything     11.72 / 13.16
   * The pass costs the same 2.5 ms it always did. What moved is its MARGINAL cost — 1.05 ms before,
   * 2.52 now — and the difference is somebody else's work: a fully shadowed cell becomes kind 3,
   * drawPrints and drawBoulders both skip kind 3, so the first cut of this pass partly paid for
   * itself by blacking out enough ground to make the two passes below it cheaper. Shading less
   * costs more, which is not a sentence anybody expects, and it is the whole gap. The frame budget
   * is 16.7 ms and the moon world sits at 13.2 on this machine; the dials if it ever has to come
   * down are TS_FAR and TS_NEAR, in that order.
   *
   * ---- LAYER 13, BEFORE THE PRINTS AND THE BOULDERS, AND THAT IS LOAD-BEARING ------------------
   * A cell at FULL coverage is written by `emit`, so it stops being kind 2. drawPrints and
   * drawShadow both gate on groundAt, which tests kind 2 — so a bootprint inside a terrain shadow
   * is not drawn dim, it is not drawn at all, and a boulder's own shadow does not get rasterised
   * over ground that is already dark. Both of those fall out of the ordering for free. Drawn the
   * other way round, the prints would sit on top of the shadow and each one would be a print with
   * its own light source.
   */
  var TS_FAR = 45.0, TS_NEAR = 6, TS_FARN = 4, TS_SOFT = 0.55;
  var TS_REACH = 28.0, TS_HARD = 4.0, TS_RAG = 0.18;
  var TS_FILL = 0.20, TS_FILL_D = 20.0, TS_FILL_E = 45.0;
  var TS_EDGE = 0.45, TS_EDGE_I = 1 / TS_EDGE;

  var BG_PITCH = 2.0, BG_INV = 1 / BG_PITCH, BG_N = 128, BG_MASK = BG_N - 1, BG_SH = 7;
  var bgH = new Float32Array(BG_N * BG_N), bgS = new Int32Array(BG_N * BG_N), bgStamp = 0;

  function bgAt(gi, gj) {
    var idx = ((gj & BG_MASK) << BG_SH) | (gi & BG_MASK);
    if (bgS[idx] === bgStamp) return bgH[idx];
    var wx = gi * BG_PITCH, wz = gj * BG_PITCH;
    var h = CITY.height(wx, wz), h2;
    h2 = CITY.height(wx + 1, wz);     if (h2 > h) h = h2;
    h2 = CITY.height(wx, wz + 1);     if (h2 > h) h = h2;
    h2 = CITY.height(wx + 1, wz + 1); if (h2 > h) h = h2;
    bgS[idx] = bgStamp; bgH[idx] = h;
    return h;
  }

  function bgSample(wx, wz) {
    var qx = wx * BG_INV, qz = wz * BG_INV;
    var i0 = Math.floor(qx), j0 = Math.floor(qz);
    var fx = qx - i0, fz = qz - j0;
    var a = bgAt(i0, j0), b = bgAt(i0 + 1, j0), c = bgAt(i0, j0 + 1), d = bgAt(i0 + 1, j0 + 1);
    var ab = a + (b - a) * fx;
    return ab + ((c + (d - c) * fx) - ab) * fz;
  }

  var TS_UN = new Float64Array(TS_NEAR), TS_RN = new Float64Array(TS_NEAR),
      TS_UF = new Float64Array(TS_FARN), TS_RF = new Float64Array(TS_FARN);

  function drawRelief(f) {
    if (!CITY) return;
    bgStamp++; if (bgStamp > 2000000000) { bgStamp = 1; bgS.fill(0); }
    var ta = Math.tan(sunAlt()); if (ta < 0.05) ta = 0.05;
    var sX = sunX(), sZ = sunZ();
    var reach = 6.0 / ta; if (reach > TS_REACH) reach = TS_REACH;
    var x, y, s, u;
    for (s = 0; s < TS_NEAR; s++) {
      u = (s + 1) * reach / TS_NEAR; TS_UN[s] = u;
      TS_RN[s] = u <= TS_HARD ? 1 : 1 - (1 - TS_RAG) * (u - TS_HARD) / (TS_REACH - TS_HARD);
    }
    for (s = 0; s < TS_FARN; s++) {
      u = (s + 1) * reach / TS_FARN; TS_UF[s] = u;
      TS_RF[s] = u <= TS_HARD ? 1 : 1 - (1 - TS_RAG) * (u - TS_HARD) / (TS_REACH - TS_HARD);
    }
    var y0 = Math.floor(V.horizon); if (y0 < 0) y0 = 0;
    for (y = y0; y < V.rows; y++) {
      var row = y * V.cols;
      for (x = 0; x < V.cols; x++) {
        var i = row + x;
        if (!groundAt(f, x, y, i)) continue;
        var d = GP.d;
        if (d > TS_FAR) continue;
        var near = d < 30, n = near ? TS_NEAR : TS_FARN;
        var k = 0;
        for (s = 0; s < n; s++) {
          u = near ? TS_UN[s] : TS_UF[s];
          var rise = bgSample(GP.wx + sX * u, GP.wz + sZ * u) - u * ta;
          if (rise <= 0) continue;
          var c = (rise < TS_SOFT ? rise / TS_SOFT : 1) * (near ? TS_RN[s] : TS_RF[s]);
          if (c > k) k = c;
        }
        if (k <= 0) continue;
        var q = qOf(d);
        var hv = hash2(Math.floor(GP.wx * q), Math.floor(GP.wz * q), BASE + 0x71);
        var e = (k * (1 + TS_EDGE) - hv) * TS_EDGE_I;
        if (e <= 0) continue;
        if (e < 1) {
          if (f.lum[i] > 0) put(f, x, y, f.ch[i], f.col[i], f.lum[i] * (1 - e), d * 0.996, 2);
          continue;
        }
        var ff = d < TS_FILL_D ? 1 : (d > TS_FILL_E ? 0 : (TS_FILL_E - d) / (TS_FILL_E - TS_FILL_D));
        if (hv < TS_FILL * k * ff)
          emit(f, x, y, hv < 0.06 ? G_DOT : G_COMMA, P.slate, 14 + hv * 130, d * 0.996);
        else
          emit(f, x, y, 0, P.shadow, 0, d * 0.996);
      }
    }
  }

  /* ---- registration -------------------------------------------------------------------------------
   * All seven are pure functions of (world, t) with NO update(). That is the property the offline
   * harness needs to scrub to any frame, and on this world it is easy to keep: nothing here has a
   * velocity. The only thing that changes between two frames is where CC.Daylight has put the sun,
   * and every element reads that fresh through surf_moon.js's getters.
   *
   * CC.reducedMotion IS NOT TESTED ANYWHERE IN THIS FILE, and that is a statement rather than an
   * omission. There is nothing here to damp: no sway, no drift, no phase, no spawn. What moves is
   * the director's clock, which belongs to daylight.js, and freezing it in one element while the
   * painter kept turning the same sun would light the ground and the sky from two different places.
   * If the sun should stop under reduced motion, it has to stop in daylight.js — one line in its
   * update(), holding the phase at the instant the flag came on exactly as `Y` already does. That
   * is a request to whoever owns daylight.js and it is written out as such in the report; the
   * previous round's comment said "it is in the report" about an item that was never filed, which
   * is how a whole world came to ship with no reduced-motion damping and nobody downstream told.
   *
   * WHAT THAT COSTS TODAY, measured rather than assumed: with the clock running, camera pinned,
   * 120x40, 4 s, seeds 42 and 7 at noon and dusk, THE MOON'S OWN TWELVE ELEMENTS give identical
   * worst step, big-step rate and 3-20 Hz figures to the last digit with the flag on and with it
   * off. It is not that the damping is working; it is that there is nothing here for the flag to
   * reach. (The full moon list also carries the shared optics chain, whose exposure pass is a
   * feedback loop on the frame and moves the third digit either way; that is not this file's.)
   * The figures themselves pass — see the block on drawRelief — so this is a gap in the contract
   * rather than a hazard. */
  function mk(name, layer, fn) {
    return {
      name: name, layer: layer, world: 'moon',
      init: function (city) {
        boot(city);
        ridgeInit();
        trailX0 = (city && city.startX !== undefined ? city.startX : 0) - 0.6;
        trailZ0 = (city && city.startZ !== undefined ? city.startZ : 0) + 0.9;
      },
      draw: function (f, cam) {
        view(f, cam);
        fn(f);
      }
    };
  }

  CC.ELEMENTS.push(mk('moon-massif',     3,  drawMassif));
  CC.ELEMENTS.push(mk('moon-stars',      4,  drawStars));
  CC.ELEMENTS.push(mk('moon-earth',      5,  drawEarth));
  CC.ELEMENTS.push(mk('moon-sun',        6,  drawSun));
  /* Bootprints BEFORE boulders, and the order is load-bearing: both write kind 2, so a boulder's
   * shadow falling across the trail dims and then erases the prints under it. A print you can see
   * inside a shadow is a print with its own light source. */
  /* Terrain shadow FIRST of the three ground passes — see the block comment on drawRelief. It
   * turns the cells it owns into kind 3, and both of the passes below gate on kind 2, so the
   * ordering is what stops a bootprint or a boulder's shadow being drawn inside a dark band. */
  CC.ELEMENTS.push(mk('moon-relief',     13, drawRelief));
  CC.ELEMENTS.push(mk('moon-bootprints', 14, drawPrints));
  CC.ELEMENTS.push(mk('moon-boulders',   15, drawBoulders));

})(typeof CC !== 'undefined' ? CC : require('../core.js'));
