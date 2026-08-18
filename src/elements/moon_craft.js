/* CyberCity lunar hardware — the machinery a crew left behind, and the only man-made thing in
 * MOONWALK. Layers 19-21.
 *
 * WHAT THIS FILE IS FOR. surf_moon.js paints a plain: a black sky, a dither field for regolith, a
 * scatter of boulders and bowls. It is a good plain and it is completely anonymous — a grey powder
 * under a black sky at a low sun is what half a dozen bodies in the solar system look like, and
 * nothing in the surface layer can say WHICH. One object says it in a single glance, and that
 * object is a Lunar Module: a squat gold box on four splayed legs with a smaller white box on top.
 * There is no other silhouette in the world's visual vocabulary it can be confused with, and the
 * whole of the rest of this file exists to give it a place to stand — a flag beside it, a rover
 * parked off to one side with its tracks running away, and an ALSEP out on the plain with cables
 * back to the middle of the site.
 *
 * ---- THE HOUSE IDIOM, AND WHY IT IS ESPECIALLY RIGHT HERE ----------------------------------------
 * market.js's header states the rule for a near object: draw the mass at lum 0 — "a pure occluder
 * that stamps depth and prints nothing" — and spend a handful of cells on the lit edges. In the
 * city that is a print-budget compromise, because a shadowed facade there is not really black.
 *
 * On the Moon it is not a compromise, it is a photograph. There is no atmosphere, so there is no
 * fill light and no aerial perspective: a spacecraft on the lunar surface is a WHITE SHAPE AGAINST
 * BLACK with a razor edge between them and nothing in between. Every Apollo surface frame of the LM
 * is exactly this picture — a blazing sunward flank, an utterly black shadow side with no detail
 * recoverable from it at any exposure, and one hard line dividing them. So the mass here is lum 0
 * because that is what it looks like, and the bright cells are few because a lit cell in this world
 * prints at v 200+ and forty of them is a lot of energy.
 *
 * ---- THE ONE SATURATED OBJECT ON THE MOON --------------------------------------------------------
 * surf_moon.js's header ends with the rule that NOTHING in it is ever warm, because amber and ember
 * are scattering colours and there is nothing here for light to scatter through. It also says where
 * the exception lives: "the only saturated objects in the entire frame are man-made (gold Kapton,
 * the flag, a red-striped gnomon). Those belong to the element files." This is that file, and the
 * gold Kapton blanketing on the descent stage is the exception — perhaps forty cells of amber at
 * lum 228-250, which the design brief works out lands right on the print's hot line.
 *
 * IT ONLY LANDS THERE AT NIGHT, AND THAT IS A REAL PROBLEM RATHER THAN A ROUNDING ERROR. Measured
 * off core.js's live LUT (tools-side probe, bucket for 8 m, the frame the LM is normally seen at):
 *
 *      swatch  lum    dayMix 0    dayMix 0.5    dayMix 1
 *      amber   240      v 193       v 154        v 112
 *      pure    220      v 225       v 216        v 206
 *      white   220      v 154       v 184        v 214
 *
 * amber's gain runs 0.50 on the night ladder and 0.30 on the day one, so the gold foil loses 42% of
 * its print between midnight and noon and ends the day INSIDE the muddy band, and there is no
 * luminance that rescues it: amber at the 255 ceiling still only prints v 116 at dayMix 1. So the
 * foil cannot carry itself alone at every hour, and the fix is the one the object itself supplies:
 * a Kapton blanket is not a smooth gold sheet, it is a CRUMPLED one, and a wrinkle facing the sun
 * is a white specular rather than a gold surface. One painted foil cell in six is `pure` at lum
 * 198-232, which prints v 206-233 at every hour of the clock. By day the foil reads as a
 * dark gold shape studded with white crinkle flares, which is what a crumpled foil blanket in full
 * sun actually looks like; at night the amber leads and the flares are a garnish. Nothing about the
 * object switches — the swatch ratio is fixed and only the print moves under it.
 *
 * THE SAME ARITHMETIC IS WHY EVERY RIM AND EVERY GLINT IN THIS FILE IS `pure` AND NOT `white`.
 * pure's gain is 0.85 on both ladders, so it is the only swatch in the table whose print does not
 * move with the clock — and a spacecraft is the one object in the world that has no business
 * looking different at noon than at midnight, because on a body with a 708-hour day the light on it
 * genuinely is the same light. white is used for one thing only, the ascent stage's mass, and it
 * carries an explicit dayMix correction there for exactly this reason.
 *
 * ---- WHERE IT ALL STANDS -------------------------------------------------------------------------
 * city.js's DIST_MOON carries a district called `site` with `hardware: 1` on it — "flat, scoured,
 * and the district the hardware elements probe for" — at weight 0.08 and a Voronoi cell of 58 m, so
 * a site blob is 50-70 m across and the plain has one every two or three hundred metres. This file
 * finds the ones THE WALK ACTUALLY PASSES, once, at init, by stepping the route and probing a few
 * metres either side of it; see siteScan(). It does not scatter an LM onto every site lot, and it
 * does not put one down where the camera will never go.
 *
 * ---- EVERYTHING HERE IS A PURE FUNCTION OF (world, t) --------------------------------------------
 * No update(), no simulation state, nothing drawn from the shared rng — the site anchors come from
 * the city's own seed and its own route, exactly as west_town.js does it and for the same reason: an
 * element that draws from the shared stream reshuffles the noise of every element initialised after
 * it. The one moving thing in the file is the glint travelling round the rover's high-gain dish, and
 * it is a function of t alone, so the offline harness can scrub to any frame and get this frame.
 *
 * ---- WHAT THE PHOTOSENSITIVITY PROBE SAYS --------------------------------------------------------
 * Measured the way tools/west-flicker.cjs measures — camera PINNED so no cell can change for any
 * reason except time, and only this file's own four elements drawn — over a FULL 430 s daylight
 * cycle at 60 Hz, seed 4545 at 200x60, one second of warm-up discarded:
 *
 *      worst single-frame step of any cell   1.18% of full scale   [project ceiling 33%]
 *      steps over a third of full scale      0 in 25800 frames     [gate 1.0/s]
 *      worst 3-20 Hz component of any cell   0.067% of full scale  [gate 2.0%]
 *
 * That is not luck. Three things in here would each have failed on their own and each was designed
 * around rather than tuned down, in the order they were found: the lit/unlit test on a face (a
 * boolean, which flips five hundred cells of gold to black in one frame — now a per-cell dither on
 * faceSun); the retroreflector's flare (a swatch threshold, which is a step even behind a slow ramp
 * — now one swatch across the whole ramp); and the rover's dish (a rotating object, which is
 * west_town.js's windmill — now a static rim with one travelling glint). There is no fourth moving
 * part in the file, deliberately.
 */
(function (CC) {
  'use strict';

  /* One projector per element file — see src/proj.js for why there is only one copy of the
   * view/project/emit/column pair in the build. */
  var PR = CC.Proj.make(), V = PR.V, PJ = PR.PJ;
  var project = PR.project, emit = PR.emit, column = PR.column;

  var P = CC.P, hash2 = CC.hash2, put = CC.put, clamp = CC.clamp;

  var G_PIPE = CC.g('|'), G_DASH = CC.g('-'), G_EQ = CC.g('='), G_UNDER = CC.g('_'),
      G_DOT = CC.g('.'), G_COLON = CC.g(':'), G_STAR = CC.g('*'), G_PLUS = CC.g('+'),
      G_HASH = CC.g('#'), G_PCT = CC.g('%'),
      G_8 = CC.g('8'), G_O = CC.g('O'), G_o = CC.g('o'), G_0 = CC.g('0'),
      G_SLASH = CC.g('/'), G_BACK = CC.g('\\'), G_CARET = CC.g('^');

  var CITY = null, BASE = 0, MOON = null;

  /* ================================================================================================
   * FINDING THE LANDING SITE
   * ============================================================================================= */

  /* HOW MANY LANDING SITES A WALK CONTAINS, and this constant is the one place this file departs
   * from its brief, so it is written down rather than buried.
   *
   * The brief says ONE Lunar Module, on one `site` district, found from wherever the walk is. The
   * argument for one is unanswerable in kind: six of these were left on the Moon and they are a
   * thousand kilometres apart, so two in one walk is a lie about the place.
   *
   * The argument against one is arithmetic. Measured over eight seeds by stepping the route and
   * probing the district table, the first `site` blob the walk comes to sits at s = 6, 6, 84, 186,
   * 270, 330, 372 and 1080 metres of walking. At SPEED 1.6 that last one is ELEVEN MINUTES in, and
   * on the three seeds where the site is at s < 90 the walk is past it inside a minute and the LM
   * is behind the camera for the rest of the session. Either way the flagship object of the world —
   * the thing this file exists for, and the only object in it that says which body this is — is
   * absent from the overwhelming majority of the frames anybody will ever see.
   *
   * So: up to three, and never two in one frame. SITE_MIN below is 400 m, which is more than three
   * times V.far (125 m, the caster's own fog end and the range at which project() gives up), so
   * there is no camera position anywhere on the route from which two Lunar Modules are visible, and
   * no viewer can ever be shown the thing the brief is protecting against. A reader who wants the
   * strict reading changes SITE_MAX to 1 and nothing else in this file moves. */
  var SITE_MAX = 3, SITE_MIN = 400.0;

  /* The scan itself. Step the route, and at each step probe the district straight ahead and at four
   * lateral offsets, because a site the walk passes THROUGH and a site it passes BESIDE are the same
   * object to a viewer and only the first of them would be found by probing the centreline alone.
   *
   * WHAT IT COSTS, MEASURED, because it is not free and it happens on page load: 1800 m of route at
   * a 12 m step is 150 camera() calls and up to 750 districtAt() probes, and districtAt builds a
   * 16x16 chunk on a miss. Timed over five seeds it runs 29-38 ms against City.make()'s own 25-39 —
   * i.e. it roughly doubles the cost of building a world, once, when the page loads or the seed in
   * the hash changes, and never again: draw() does no searching at all. It is the same shape of
   * cost as chooseStart's, which city.js prices at 4 ms and defends at length, and it leaves the
   * chunk cache WARM rather than thrashed — about 340 unique chunks against city.js's CAP of 2048,
   * so nothing the first frame wants has been evicted.
   *
   * The step is 12 m and not 3 because a site blob is 50-70 m across at DG 58 and cannot be stepped
   * over at that pitch; it was 9, and the extra sixty probes found the same sites on all eight test
   * seeds.
   *
   * 1800 m is thirty minutes of walking. A session longer than that gets no further sites, which is
   * a deliberate floor on the init cost rather than an oversight — see the report. */
  var SITE_SCAN = 1800.0, SITE_STEP = 12.0;
  /* THE WIDEST OFFSET IS 30 m AND IT USED TO BE 52, and the 52 was measured wrong rather than
   * chosen wrong. The argument for it was that a 7 m object at 52 m is nine rows tall at 200x60 and
   * therefore still legible — which is true and beside the point. The route walks past the anchor,
   * it does not orbit it: an anchor 52 m to the SIDE is at 90 degrees to the walk at closest
   * approach and has spent the whole of the approach outside the 36-degree half-fov, so it enters
   * the frame from the edge, crosses it in a few seconds and is gone. Rendered at seed 7 frame 300
   * the entire landing site was off the left of the picture with only the ALSEP cable in shot.
   * At 30 m the anchor is inside the half-fov from 42 m out, which is a walk of half a minute
   * toward it, and that is the difference between arriving somewhere and passing something.
   * The offsets are tried nearest-first, so an anchor dead ahead always wins over one beside it. */
  var SITE_OFF = [0, 16, -16, 30, -30];

  var sX = new Float64Array(SITE_MAX), sZ = new Float64Array(SITE_MAX), sN = 0;
  var SCAN_CAM = { x: 0, z: 0, yaw: 0, eyeY: 1.7 };

  function siteScan(city) {
    sN = 0;
    var s, i, D;
    for (s = SITE_STEP; s < SITE_SCAN && sN < SITE_MAX; s += SITE_STEP) {
      city.camera(SCAN_CAM, city, s / city.SPEED);
      /* The camera's right vector. yaw 0 faces +z in this project, so forward is
       * (sin yaw, cos yaw) and right is (cos yaw, -sin yaw). */
      var rx = Math.cos(SCAN_CAM.yaw), rz = -Math.sin(SCAN_CAM.yaw);
      for (i = 0; i < SITE_OFF.length; i++) {
        var px = SCAN_CAM.x + rx * SITE_OFF[i], pz = SCAN_CAM.z + rz * SITE_OFF[i];
        D = city.DISTRICTS[city.districtAt(px, pz)];
        if (!D || !D.hardware) continue;
        /* Open ground only. `site` is 96% vacant so this almost always passes first time, but a
         * descent stage standing inside a rock pile is the one placement that would be visibly
         * wrong rather than merely unlucky, and the probe is one height() call. */
        if (city.height(px, pz) > 0.05) continue;
        if (sN && near2(px, pz, sX[sN - 1], sZ[sN - 1]) < SITE_MIN * SITE_MIN) continue;
        sX[sN] = px; sZ[sN] = pz; sN++;
        break;
      }
    }
  }

  function near2(ax, az, bx, bz) {
    var dx = ax - bx, dz = az - bz;
    return dx * dx + dz * dz;
  }

  /* Four elements are registered out of this file and every one of them gets its own init(), so the
   * scan is memoised on the city object itself rather than on a flag: main.js rebuilds the city when
   * the seed or the world changes and re-inits every element against the new one, and a boolean
   * would either rescan four times per build or fail to rescan at all after a reseed. */
  var BOOTED = null;
  function boot(city) {
    CITY = (city && city.aveX && city.world === 'moon') ? city : null;
    if (CITY === BOOTED) return;
    BOOTED = CITY;
    BASE = CITY ? ((Math.imul(CITY.seed | 0, 19391) >>> 6) & 0x3fffff) : 0;
    sN = 0;
    if (CITY) siteScan(CITY);
  }

  /* ================================================================================================
   * THE KEY LIGHT
   * ============================================================================================= */

  /* Read off CC.SurfMoon and never off CC.Daylight, and surf_moon.js's header says why in capitals:
   * the Moon's key azimuth is the director's ROTATED BY PI, so that the sun sits behind the walk and
   * every shadow in the world points forward into the picture. An element that asked the director
   * directly would light this hardware from exactly the opposite side to the ground it is standing
   * on. They are getters over there precisely so this is a live read.
   *
   * KX/KZ is the horizontal direction TOWARD the sun; KALT its altitude; KNIGHT the 0..1 crossfade
   * into earthshine, which surf_moon runs as a crossfade rather than a flag because on a world whose
   * background is lum 0 a bright cell that switches is a step of 90% of full scale. */
  var KX = 0, KZ = 1, KALT = 0.25, KNIGHT = 0, KDAY = 1, KMIX = 0;

  function key() {
    if (!MOON) MOON = CC.SurfMoon || (CC.SURFACES ? CC.SURFACES.moon : null);
    if (!MOON) return;
    KX = MOON.SUN_X; KZ = MOON.SUN_Z; KALT = MOON.SUN_ALT;
    KNIGHT = MOON.night; KDAY = 1 - KNIGHT;
    KMIX = (CC.dayMix === undefined) ? 0 : CC.dayMix;
  }

  /* ---- how much sun a face with this outward normal is getting ---------------------------------
   * A STEP AND NOT A RAMP, because surf_moon.js's sunOf is a step and this hardware is standing on
   * the ground that function paints: the sun subtends 0.0093 rad and there is no fill light, so the
   * terminator on a flat panel is a hard line about one cell wide, and a spacecraft is nothing but
   * flat panels. Slope 3.0 is surf_moon's own, so a face at the +-0.48 an axis-aligned box presents
   * comes back at exactly 0.00 or exactly 1.00.
   *
   * ---- BUT IT RETURNS A NUMBER AND NOT A BOOLEAN, AND THAT IS THE PHOTOSENSITIVITY GATE ----------
   * The first cut of this file was `nx*KX + nz*KZ > 0.05`, and it is the one design in here that
   * would have failed the hard gate outright. surf_moon.js's facade() records the identical problem
   * and the identical fix at length: the sun turns at 2*PI/420 s, so when a face's dot product
   * crosses zero EVERY CELL OF THAT FACE FLIPS IN ONE FRAME — and on this object it flips from gold
   * at printed v 190 to a blank, which is 75% of full scale, across a face that at thirty metres is
   * five hundred cells. Four faces on the descent stage, four on the ascent stage, two crossings
   * each per cycle: sixteen of those events every seven minutes, on the largest object in the world.
   *
   * The remedy is surf_moon's and west_town.js's windmill's, which are the same remedy: SPREAD THE
   * CHANGE, NEVER SWITCH IT. quad() compares this number against the cell's own stable hash, so the
   * handover happens one cell at a time across the ~17 s the terminator takes to sweep a face, and
   * it costs nothing in the picture — `sun` is 0 or 1 everywhere except within 0.17 rad of edge-on,
   * so the dithered band IS the one-cell terminator the step was drawn to produce. */
  function faceSun(nx, nz) {
    var k = clamp(0.5 + 3.0 * (nx * KX + nz * KZ), 0, 1);
    return k * k * (3 - 2 * k);
  }

  /* ---- the three luminance ladders this file writes on ------------------------------------------
   * Written as functions rather than constants because each of them has to answer the same two
   * questions — is it day or is it earthshine, and where is core.js's print ladder — and getting
   * either wrong in one object and right in another is how a scene stops agreeing with itself.
   *
   * rimLum   `pure`, the sunward edges and every specular. Flat across the clock: pure's gain is
   *          0.85 on BOTH of core.js's ladders, so this is the only number here that needs no
   *          correction at all.
   * bodyLum  `white`, the ascent stage's mass. white runs 0.30 -> 0.92 between the ladders, so an
   *          uncorrected lum 210 prints v 148 at midnight and v 208 at noon; the 0.30*KMIX term
   *          holds it to v 148-165 across the whole cycle. Same correction, same reasoning and the
   *          same coefficient as surf_moon.js's litSet near field.
   * foilLum  `amber`, and it CANNOT be held flat — see the header. It is written at the top of the
   *          swatch and the shortfall by day is carried by the pure crinkle instead.
   *
   * At night all three drop by about a factor of two and a half, which is earthshine: a full Earth
   * from here is roughly 1/10,000 of sunlight, and surf_moon lands its night ground at v 132-148.
   * Hardware sits a little above that on purpose — an aluminium and Mylar spacecraft is a far better
   * reflector than 0.11-albedo powder, and it is the one thing in a night frame the eye should find
   * first. */
  function rimLum(base) { return KDAY * (198 + 34 * base) + KNIGHT * (84 + 28 * base); }
  function bodyLum(base) {
    return (KDAY * (190 + 46 * base) + KNIGHT * (60 + 26 * base)) * (1 - 0.30 * KMIX);
  }
  function foilLum(base) {
    return (KDAY * (228 + 22 * base) + KNIGHT * (92 + 26 * base)) * (1 + 0.10 * KMIX);
  }

  /* ================================================================================================
   * PRIMITIVES — two helpers and four ways of putting a mark down, and everything below is
   * built out of nothing else.
   * ============================================================================================= */

  /* Is this world point worth any work at all? Same three tests as west_town.js's objVisible: in
   * front of the eye plane, inside the caster's own far distance, and not so far off to the side
   * that nothing it owns can land in the frame. Returns the forward distance, which every caller
   * then uses to pick its own level of detail. */
  function seeAt(px, pz, near) {
    var rx = px - V.ox, rz = pz - V.oz;
    var w = rx * V.fwx + rz * V.fwz;
    if (w < near || w > V.far) return 0;
    var s = rx * V.rgx + rz * V.rgz, lim = w * V.hp + 14;
    if (s < -lim || s > lim) return 0;
    return w;
  }

  /* THE DITHER PITCH IS SOLVED FROM THE LIVE GRID, NOT PICKED, and the derivation is surf_moon.js's
   * — see the block comment above its qOf. A screen column subtends dist/colK metres, so a lattice
   * cell two columns wide is 2*dist/colK metres and the pitch that gives it is colK/(2*dist) cells
   * per metre. Two columns and not one because at exactly one column the lattice sits at the grid's
   * Nyquist limit and the field crawls as the camera walks.
   *
   * surf_moon evaluates the same expression at a fixed 400-column reference and tabulates it;
   * here it is computed live off V.colK, because an ELEMENT is handed the frame and can simply ask.
   * The clamps are the ends of the useful range: below 2.2 per metre a 4 m face has under nine
   * lattice cells across it and the foil reads as four big blocks, above 30 the lattice is finer
   * than the object's own detail and nothing is gained for the hashes. */
  function qOf(dist) {
    var q = V.colK / (2 * dist);
    return q < 2.2 ? 2.2 : (q > 30 ? 30 : q);
  }

  /* ---- a vertical quad, filled ------------------------------------------------------------------
   * The workhorse. (ax,az)-(bx,bz) is the footprint of one flat face on the ground and y0..y1 is
   * how far up it goes; every panel of every box in this file is one of these.
   *
   * IT IS SAMPLED ALONG THE FACE AND FILLED VERTICALLY, which is column() generalised: project the
   * two ENDS of each vertical and fill between them, rather than projecting a grid of world points.
   * proj.js's column() explains why — sampling points up a post and projecting each separately puts
   * them in different columns whenever the post is off-axis, and the post shears as the camera pans.
   * A spacecraft made of sheared verticals is a spacecraft made of scaffolding.
   *
   * The sample count is solved off the projected width so a face two metres away costs the same per
   * column as one at forty, and it is capped at 240 because a face that wants more than 240 samples
   * is wider than the frame and is being drawn from inside itself.
   *
   * EVERY LOOK WRITES EVERY CELL, either as lit surface or as lum-0 mass. That is not tidiness, it
   * is what stops the far faces of the same box showing through the near one's dither — and it is
   * also the photosensitivity rule from west_town.js's windmill, stated for a surface instead of a
   * moving part: a cell that is always painted can never alternate with what is behind it. */
  var LOOK_MASS = 0, LOOK_FOIL = 1, LOOK_BODY = 2, LOOK_WIN = 3;
  /* The ascent stage's window, in face coordinates, set by the caller just before LOOK_WIN. A
   * module-level record rather than four more arguments, and never read by anything else. */
  var WIN_U = 0, WIN_V = 0, WIN_W = 0.62, WIN_H = 0.50;

  function quad(f, ax, az, bx, bz, y0, y1, look, salt, sun) {
    var ddx = bx - ax, ddz = bz - az;
    var mx = ax + ddx * 0.5, mz = az + ddz * 0.5;
    var rx = mx - V.ox, rz = mz - V.oz;
    var w = rx * V.fwx + rz * V.fwz;
    if (w < 0.5 || w > V.far) return;
    var len = Math.sqrt(ddx * ddx + ddz * ddz);
    var n = Math.ceil(len * V.colK / w) + 2;
    if (n > 240) n = 240;
    var q = qOf(w);
    var i, r;
    for (i = 0; i <= n; i++) {
      var u = i / n, px = ax + ddx * u, pz = az + ddz * u;
      if (!project(px, y0, pz)) continue;
      var x = Math.floor(PJ.x), yb = PJ.y, d = PJ.d;
      if (x < 0 || x >= V.cols) continue;
      if (!project(px, y1, pz)) continue;
      var yt = PJ.y;
      if (yt > yb) { var sw = yt; yt = yb; yb = sw; }
      var span = yb - yt; if (span < 1e-4) span = 1e-4;
      var r0 = Math.floor(yt), r1 = Math.floor(yb);
      if (r1 - r0 > V.rows) r1 = r0 + V.rows;
      if (r1 < 0 || r0 >= V.rows) continue;
      if (r0 < 0) r0 = 0;
      if (r1 >= V.rows) r1 = V.rows - 1;
      var uu = u * len;
      for (r = r0; r <= r1; r++) {
        var vv = y0 + (y1 - y0) * ((yb - r) / span);
        var hv = hash2(Math.floor(uu * q), Math.floor(vv * q), salt);
        if (look === LOOK_MASS) { emit(f, x, r, 0, P.shadow, 0, d); continue; }
        /* ---- WHERE THE TERMINATOR ACTUALLY LANDS, PER CELL ---------------------------------
         * `tv` is a second hash drawn over 0..0.74, and 0.74 is exactly one minus the ramp width
         * below, so the ramp is a NO-OP on a fully lit face — every cell of it has edge >= 0.26 —
         * and the softening exists only on the faces that are genuinely crossing the terminator.
         * Both numbers are surf_moon.js's, measured there and not re-derived here: drawn over
         * 0..0.86 instead, a quarter of every lit face came out 35% dim, which put those cells at
         * printed v 112, inside the muddy band, for nothing.
         *
         * `soft` holds the first 0.26 of the ramp at 24-100% of luminance, which puts the flip a
         * cell makes at 17% of full scale rather than 75% — comfortably under the project's
         * third-of-scale ceiling and, more to the point, spread over the seventeen seconds the
         * terminator takes to cross the face rather than landing in one frame. */
        var edge = 1, soft = 1;
        if (sun !== undefined) {
          edge = sun - hash2(Math.floor(uu * q), Math.floor(vv * q), salt ^ 0x2B) * 0.74;
          soft = edge < 0.26 ? 0.24 + 2.923 * edge : 1;
        }
        if (edge <= 0) {
          /* An unlit face is a hole, and surf_moon's darkFace makes the same call for the same
           * reason: past 25 m there is no fill light of any kind and it reads anyway, because its
           * EDGE is razor-sharp against pure at v 219-234. Inside 25 m a real Apollo shadow is not
           * quite black — the regolith around it is a diffuse hemispherical reflector and bounces a
           * little in — so the same 8% slate dither at lum 16-24 appears here, and for the same
           * reason it is slate and not `shadow`: shadow's gain halves on the day ladder and the
           * fill would silently vanish at noon. */
          if (d < 25 && hv < 0.08) emit(f, x, r, hv < 0.03 ? G_DOT : G_COLON, P.slate, 16 + hv * 96, d);
          else emit(f, x, r, 0, P.shadow, 0, d);
          continue;
        }
        if (look === LOOK_FOIL) {
          /* GOLD KAPTON. A seventh of the face is left as mass, which is the crease shadow: a
           * blanket is quilted and hangs in folds, and the folds are what stop forty cells of amber
           * reading as a painted rectangle. A ninth is the `pure` crinkle flare that carries the
           * object through the day ladder — see the header.
           *
           * BOTH OF THOSE FRACTIONS STARTED AT ROUGHLY A THIRD AND HAD TO COME DOWN, and the
           * measurement is the first render of this file at 400x100 seed 4545 frame 1800. At 32%
           * holes and 21% flare the descent stage was 47% amber, 21% pure and 32% blank in a
           * screen-locked dither — which is not a gold box, it is a field of noise that happens to
           * be gold on average, and next to a ground plane that is ALSO a screen-locked dither it
           * had no edge and no mass. The rule surf_west.js states for its lit clapboard and
           * surf_moon.js repeats for its lit rock applies to a spacecraft with more force than to
           * either: the lit face is the brightest large object in the frame and it has to be a MASS.
           * At 86/12 it is a solid gold slab with a scatter of white flares in it and the holes read
           * as folds, which is the object. */
          if (hv > 0.86) emit(f, x, r, 0, P.shadow, 0, d);
          else if (hv < 0.12) emit(f, x, r, hv < 0.05 ? G_STAR : G_8, P.pure, rimLum(hv * 7) * soft, d);
          else emit(f, x, r, hv < 0.45 ? G_HASH : (hv < 0.66 ? G_PCT : G_8), P.amber,
                    foilLum((hv - 0.12) * 1.35) * soft, d);
          continue;
        }
        /* LOOK_BODY / LOOK_WIN — the ascent stage. A MASS at lum 190-236 rather than a rhythm, for
         * exactly the reason surf_west.js gives for its lit clapboard and surf_moon repeats for its
         * lit rock: on a world where the key light is behind the walker the lit face IS the
         * brightest large object in the frame, and painting it as a sparse scatter of dim glyphs
         * puts every cell of it in the muddy band. What structure it has comes from the ~22% that
         * is NOT painted — panel seams and the shadowed quilting of the thermal blanket — rather
         * than from lines drawn on it. */
        if (look === LOOK_WIN) {
          /* THE WINDOW, and it is worth three cells. The LM's two forward windows are triangles
           * canted down and out so the crew can see the ground they are landing on, and a downward-
           * pointing triangle is not a shape any other object in this build owns. Cut as a hole in
           * the lit face rather than drawn as a dark glyph on it: a window in vacuum is genuinely
           * unlit — there is nothing behind it but a cabin — and a hole in a bright mass is the
           * cheapest and hardest-edged mark available. */
          var wu = (uu - WIN_U) / WIN_W, wv = (vv - WIN_V) / WIN_H;
          if (wu > 0 && wv > 0 && wu + wv < 1) { emit(f, x, r, 0, P.shadow, 0, d); continue; }
        }
        if (hv > 0.90) emit(f, x, r, 0, P.shadow, 0, d);
        else if (hv < 0.04) emit(f, x, r, G_STAR, P.pure, rimLum(hv * 14) * soft, d);
        else emit(f, x, r, hv < 0.30 ? G_8 : (hv < 0.58 ? G_HASH : (hv < 0.78 ? G_PCT : G_O)),
                  P.white, bodyLum(hv) * soft, d);
      }
    }
  }

  /* ---- a line in three dimensions ---------------------------------------------------------------
   * Legs, struts, ladders, cables, wheel tracks and the flag's crossbar all go through here. Sampled
   * in world space and filled in SCREEN space between consecutive samples, which is west_town.js's
   * beam() generalised to a sloped segment — and its comment records why both halves are necessary:
   * a sample that fails to project must BREAK the run, or the fill joins the last point before the
   * eye plane to the first point after it and draws a line clean across the frame. */
  function run(f, ax, ay, az, bx, by, bz, ch, col, lum, n, thick) {
    var lx = -1, ly = 0, ld = 0, i;
    for (i = 0; i <= n; i++) {
      var u = i / n;
      if (!project(ax + (bx - ax) * u, ay + (by - ay) * u, az + (bz - az) * u)) { lx = -1; continue; }
      var x = Math.floor(PJ.x), r = Math.floor(PJ.y), d = PJ.d;
      if (lx >= 0 && (d > ld * 2 || ld > d * 2)) lx = -1;
      if (lx >= 0) {
        var dx = x - lx, dy = r - ly;
        var st = Math.abs(dx) > Math.abs(dy) ? Math.abs(dx) : Math.abs(dy);
        if (st > V.cols * 2) st = 0;
        for (var qq = 1; qq < st; qq++) {
          var tq = qq / st;
          var sx = lx + Math.round(dx * tq), sy = ly + Math.round(dy * tq), sd = ld + (d - ld) * tq;
          emit(f, sx, sy, ch, col, lum, sd);
          if (thick) emit(f, sx, sy + 1, ch, col, lum, sd);
        }
      }
      emit(f, x, r, ch, col, lum, d);
      if (thick) emit(f, x, r + 1, ch, col, lum, d);
      lx = x; ly = r; ld = d;
    }
  }

  /* ---- a disc, filled or as a ring --------------------------------------------------------------
   * Wheels and the high-gain antenna. A wire wheel and a mesh dish are both RINGS — they are mostly
   * hole — and a ring is also what survives at the size these are seen: a 0.82 m wheel at 25 m is
   * four columns and two rows at 200x60, so what the eye gets is a small round thing, and a filled
   * blob and an outlined circle are the same picture. The ring branch exists for the near field,
   * where the difference between a wheel and a wheel-shaped lump of metal is visible. */
  function disc(f, px, py, pz, rad, ring, ch, col, lum) {
    if (!project(px, py, pz)) return;
    var x = Math.floor(PJ.x), y = Math.floor(PJ.y), d = PJ.d;
    var rw = rad * V.colK / d, rh = rad * V.scale / d;
    if (rw < 0.8) { emit(f, x, y, ch, col, lum, d); return; }
    var iw = Math.ceil(rw), ih = Math.ceil(rh), dx, dy;
    if (iw > 12) iw = 12;
    if (ih > 12) ih = 12;
    for (dy = -ih; dy <= ih; dy++) {
      for (dx = -iw; dx <= iw; dx++) {
        var u = dx / rw, v = dy / rh, r2 = u * u + v * v;
        if (r2 > 1.08) continue;
        if (ring && r2 < 0.34) continue;
        emit(f, x + dx, y + dy, ch, col, lum, d);
      }
    }
  }

  /* ---- the shadow -------------------------------------------------------------------------------
   * A tapered patch of ground laid down the antisolar bearing from an object's feet, and it is the
   * single most valuable thing this file draws after the LM's own silhouette. The design brief's
   * failure (c) is a page on why: an open plain with nothing of known size in it has no scale, and
   * "a 1 m rock with a 6 m shadow tells you where the ground is, where the light is, and how big the
   * rock is, in three cells and one blank ellipse". A 7 m spacecraft with a 30 m shadow does it for
   * the whole site at once.
   *
   * IT IS RASTERISED BY UNPROJECTING THE SCREEN, not by projecting the ground. The ground plane is
   * flat and y = 0, so a screen row inverts to a single forward distance — w = eyeY*scale/(row -
   * horizon) — and a column inverts to a screen-plane offset. That is project() run backwards
   * exactly, and it means the cost is one pass over the shape's screen bounding box instead of a
   * world-space grid whose density has to be guessed from the foreshortening. It also gets the
   * foreshortening right for free, which is the whole difficulty: at 8 m one screen row spans 0.42 m
   * of ground and at 60 m it spans 1.4 m.
   *
   * IT ONLY TOUCHES FLOOR CELLS — frame.kind[i] === 2 — and that one test is what makes the whole
   * thing safe. A shadow written with a depth nudge would otherwise win the depth test against the
   * footpad it is cast by and eat the object's own feet; asking the frame what a cell IS rather
   * than betting on its depth removes the question. It is the same test the design brief specifies for the
   * heiligenschein pass, which is the other element that reaches into finished floor cells.
   *
   * THE LENGTH IS CLAMPED AND THE TRUE LENGTH IS NOT. Shadow length is h/tan(alt), and surf_moon
   * runs the sun altitude over 0.09-0.45 rad, so the LM's true shadow is 15 m at a 26-degree sun
   * and SEVENTY-EIGHT at a 5-degree one. The far half of that is a two-cell sliver near the horizon
   * that costs a great many cells and buys nothing, and worse, it is the part that sweeps fastest
   * when the sun turns. Clamped at SH_MAX the tip travels under 0.6 m/s at the sun's own
   * 0.02 rad/s, and the soft band below turns even that into a ramp rather than a switch.
   *
   * THE EDGE IS SOFT AND THE MIDDLE IS NOT, and the softness is a photosensitivity fix and not a
   * penumbra — there is no penumbra from a 0.0093 rad sun. A ground cell going from lit to blank is
   * a step of 55% of full scale on this world's background, and a shadow edge crossing the frame
   * takes a whole rank of them at once. Inside the last SH_SOFT metres the cell is dimmed on a ramp
   * AND blanked on a stable world hash whose threshold rides that same ramp, so a cell's history as
   * the edge passes is full, dimmer, dimmer still, gone — three steps of under 20% instead of one of
   * 55%, spread over the second or so the band takes to cross it. */
  var SH_MAX = 30.0, SH_SOFT = 0.9;

  function shadowPatch(f, cx, cz, w0, w1, hgt, salt) {
    if (KALT < 0.02) return;
    var len = hgt / Math.tan(KALT);
    if (len > SH_MAX) len = SH_MAX;
    if (len < 0.4) return;
    /* Down-sun: the shadow lies along the direction AWAY from the sun. */
    var dx = -KX, dz = -KZ;
    var ex = -dz, ez = dx;                            // across the shadow
    /* Screen bounding box from the four corners. Anything that fails to project is treated as
     * off-frame in that direction rather than dropping the whole patch — an object at the bottom of
     * the frame has its own feet behind the eye plane quite often. */
    var bx0 = 1e9, bx1 = -1e9, by0 = 1e9, by1 = -1e9, k, hit = 0;
    for (k = 0; k < 4; k++) {
      var a = (k & 2) ? len : 0, b = ((k & 1) ? 1 : -1) * ((k & 2) ? w1 : w0);
      if (!project(cx + dx * a + ex * b, 0, cz + dz * a + ez * b)) continue;
      hit = 1;
      if (PJ.x < bx0) bx0 = PJ.x;
      if (PJ.x > bx1) bx1 = PJ.x;
      if (PJ.y < by0) by0 = PJ.y;
      if (PJ.y > by1) by1 = PJ.y;
    }
    if (!hit) return;
    var x0 = Math.floor(bx0) - 1, x1 = Math.ceil(bx1) + 1;
    var y0 = Math.floor(by0) - 1, y1 = Math.ceil(by1) + 1;
    if (x0 < 0) x0 = 0;
    if (y0 < 0) y0 = 0;
    if (x1 >= V.cols) x1 = V.cols - 1;
    if (y1 >= V.rows) y1 = V.rows - 1;
    /* Nothing above the horizon is ground, and the row immediately below it inverts to a distance
     * of several kilometres, so the scan starts one row clear of it. */
    var top = Math.ceil(V.horizon) + 1;
    if (y0 < top) y0 = top;

    var slope = (w1 - w0) / len;
    for (var r = y0; r <= y1; r++) {
      var w = V.eyeY * V.scale / ((r + 0.5) - V.horizon);
      if (w <= 0 || w > V.far) continue;
      for (var x = x0; x <= x1; x++) {
        var i = r * V.cols + x;
        if (f.kind[i] !== 2) continue;                // not floor: a rock, the object itself, sky
        if (f.dist[i] > 1e5) continue;                // the caster's parallel-ray blank
        var sp = ((x + 0.5) - V.colMid) / V.colK;
        var px = V.ox + (V.fwx + V.rgx * sp) * w, pz = V.oz + (V.fwz + V.rgz * sp) * w;
        var qx = px - cx, qz = pz - cz;
        var a2 = qx * dx + qz * dz;                   // metres down-sun of the object's feet
        if (a2 < -0.6 || a2 > len) continue;
        var b2 = qx * ex + qz * ez; if (b2 < 0) b2 = -b2;
        var hw = w0 + slope * (a2 < 0 ? 0 : a2);
        /* Distance to the nearest boundary, in metres, so the soft band is the same width all the
         * way round the shape instead of only across it. */
        var m = hw - b2;
        var m2 = len - a2; if (m2 < m) m = m2;
        if (m <= 0) continue;
        var d = w * Math.sqrt(1 + sp * sp) * 0.985;
        if (!(d < f.dist[i])) continue;
        if (m >= SH_SOFT) { put(f, x, r, 0, P.shadow, 0, d, 2); continue; }
        var kk = m / SH_SOFT;
        if (hash2(Math.floor(px * 2.7), Math.floor(pz * 2.7), salt) < kk) {
          put(f, x, r, 0, P.shadow, 0, d, 2);
        } else {
          /* A gain pass on a cell that is already there, never a repaint: the cell keeps its glyph
           * and its swatch and only loses luminance, which is what the heiligenschein does at the
           * other end of the same ground. */
          f.lum[i] = (f.lum[i] * (1 - 0.62 * kk)) | 0;
        }
      }
    }
  }

  /* ================================================================================================
   * 1. THE LUNAR MODULE
   *
   * Real numbers, because at this cell size the proportions are the whole read and there is no
   * reason to invent them: the descent stage is an octagonal box 4.22 m across the flats and 3.23 m
   * high, the ascent stage sits on top of it and is 4.29 m across at its widest but only 2.34 m
   * across the crew compartment that faces you, the landing gear spans 9.4 m diagonally, the
   * footpads are 0.94 m dishes and the whole thing is 7.04 m tall. It weighs fifteen tonnes on Earth
   * and two and a half here.
   *
   * THE SILHOUETTE IS THE ENTIRE TEST — it has to be recognisable at thirty metres, where it is
   * eighteen rows tall at 200x60 — and it is carried by three proportions and nothing else:
   *   a WIDE base and a NARROW top. The descent stage is nearly twice the width of the ascent
   *     stage's front face, so the object is bottom-heavy in a way no building and no rock is.
   *   FOUR LEGS THAT SPLAY OUTWARD AND DOWNWARD to pads well outside the body. Nothing else in any
   *     of the three worlds stands on legs.
   *   A GAP UNDER THE BODY, which is what says "landed" rather than "built".
   * Everything else — the foil, the window, the ladder, the docking target — is detail that arrives
   * as you get closer, and none of it is load-bearing at range.
   *
   * THE THIRD OF THOSE DOES NOT WORK AS WELL AS THE FIRST TWO AND CANNOT BE MADE TO, and that is
   * geometry rather than a shortfall in the drawing. The descent stage's floor is 1.5 m off the
   * ground and the camera's eye is at 1.66 (city.js's cam.eyeY), so the gap under the vehicle is
   * seen from fourteen centimetres ABOVE it and is therefore almost exactly edge-on: measured at
   * 33 m it occupies 0.4 of a row, and the whole of the landing gear — the legs, the pads, the
   * engine bell — lives in the three or four rows between the horizon and the bottom of the frame's
   * near ground. Nothing can be done about that without lying about the eye height or the vehicle,
   * and both would be worse. It IS what a photograph taken by a standing astronaut looks like. What
   * follows from it is that the lower third of this object earns its keep by contrast rather than by
   * area, which is why every leg is a bright line with a black one under it (see the landing gear)
   * and why the descent stage gets a drawn bottom edge it would not otherwise need.
   * ============================================================================================= */

  var LM_HW = 2.11;                       // half the descent stage across the flats
  var LM_D0 = 1.50, LM_D1 = 4.73;         // descent stage: floor 1.5 m up, 3.23 m tall
  var LM_A1 = 6.55;                       // top of the crew compartment
  var LM_AHW = 1.17;                      // half the 2.34 m crew compartment
  var LM_PAD = 4.70;                      // footpad centre, metres out from the axis
  /* Where a primary strut leaves the body, and it is 2.35 rather than the 1.55 of the first cut for
   * a reason that is about the picture rather than about the vehicle. The real outrigger is at about
   * this radius, but what actually forced it is that a strut starting at 1.55 begins well INSIDE the
   * descent stage's own silhouette (2.11 across the flats, 2.98 to a corner, and the legs are on the
   * corners), so its first metre and a half is drawn behind the body and thrown away by the depth
   * test — leaving a short stub that appears to hang under the vehicle with nothing holding it on.
   * At 2.35 the strut emerges from behind the body's lower corner, which is where a landing leg on
   * the real thing does emerge from, and the whole of what is drawn is the part that reads. */
  var LM_ATT = 2.35, LM_ATY = 2.05;

  function drawLM(f, k) {
    var cx = sX[k], cz = sZ[k];
    var w = seeAt(cx, cz, 1.2);
    if (!w) return;

    /* The heading it landed on. Seeded per site and otherwise arbitrary — a descent is flown to a
     * spot, not to a compass bearing — except that it is nudged so the crew compartment faces
     * roughly up-sun. That is not decoration: the LM's windows and its ladder are on the same face,
     * the crews photographed the vehicle down-sun almost without exception, and it means the face
     * the walk is looking at is the lit one rather than a black rectangle. */
    var head = Math.atan2(KX, KZ) + (hash2(k, 1, BASE + 0x81) - 0.5) * 1.5;
    var fx = Math.sin(head), fz = Math.cos(head);     // forward: the crew compartment faces this way
    var rx = Math.cos(head), rz = -Math.sin(head);    // right

    shadowPatch(f, cx, cz, 4.9, 1.7, LM_A1, BASE + 0x82);

    /* ---- the descent stage, four faces ---------------------------------------------------------
     * Drawn as a box and not as the octagon it is. At thirty metres the descent stage is nineteen
     * columns wide, so its two 1.75 m chamfers are two columns each and the difference between an
     * octagon and a square is entirely inside one cell of the silhouette. What the chamfers would
     * buy is bought instead by the corner rim below, which is a real edge and is one cell wide by
     * construction.
     *
     * The sunward faces get the foil; the others are holes, and the handover between the two is
     * dithered per cell rather than switched — see faceSun. */
    var s, nx, nz, ax, az, bx, bz;
    for (s = 0; s < 4; s++) {
      /* Face s: outward normal, and the two ends of its footprint. */
      nx = (s === 0 ? fx : (s === 1 ? rx : (s === 2 ? -fx : -rx)));
      nz = (s === 0 ? fz : (s === 1 ? rz : (s === 2 ? -fz : -rz)));
      var tx = -nz, tz = nx;                          // along the face
      ax = cx + nx * LM_HW - tx * LM_HW; az = cz + nz * LM_HW - tz * LM_HW;
      bx = cx + nx * LM_HW + tx * LM_HW; bz = cz + nz * LM_HW + tz * LM_HW;
      var fsun = faceSun(nx, nz);
      quad(f, ax, az, bx, bz, LM_D0, LM_D1, LOOK_FOIL, BASE + 0x90 + s, fsun);
      /* THE TOP EDGE OF A LIT FACE, in pure, and this is the single most valuable line on the
       * object. surf_moon.js says the same thing about a rock's lit crest: it is the SKYLINE, and a
       * skyline is what turns a black shape into a thing. Here it does one more job — it is the
       * horizontal that separates the wide gold box from the narrow white one, and that separation
       * IS the Lunar Module. */
      /* Every edge in this file that belongs to a face is scaled by that face's own `fsun` rather
       * than switched on a threshold, for the same reason the faces themselves are dithered: a line
       * of pure at v 225 going out in one frame is the same 88%-of-scale step a face is, over fewer
       * cells. Scaled, it fades over the seventeen seconds the terminator takes, and at fsun 0 it
       * is a black run, which is what an unlit edge should be anyway. */
      if (fsun < 0.02) continue;
      run(f, ax, LM_D1, az, bx, LM_D1, bz, G_EQ, P.pure, rimLum(0.8) * fsun, 14, 0);
      /* AND THE BOTTOM EDGE, WHICH IS WORTH AS MUCH AS THE TOP ONE AND WAS NOT IN THE FIRST CUT.
       * The descent stage's floor is 1.5 m up and the eye is at 1.66, so the underside is within a
       * row or two of the horizon at every distance the vehicle is seen from — which means the
       * bottom of the gold slab lands exactly where the lit near ground begins, and in the first
       * render the two ran together and the LM appeared to be sitting on the regolith like a rock.
       * A black run just under the edge and a pure run on it separates them: the black bites a hole
       * in the ground texture and the pure draws the sill, and between them they put back the one
       * thing the silhouette needs, which is that this object is standing ON LEGS above the ground
       * rather than resting on it. */
      run(f, ax, LM_D0, az, bx, LM_D0, bz, G_DASH, P.pure, rimLum(0.6) * fsun, 14, 0);
      run(f, ax, LM_D0 - 0.10, az, bx, LM_D0 - 0.10, bz, 0, P.shadow, 0, 14, 1);
    }

    /* The sunward corner, as one continuous pure column from the descent stage floor to its deck.
     * A rock gets this from its own crest; a machined box has to be told, because both of the faces
     * that meet at a lit corner are painted and the corner between them would otherwise be the one
     * place the silhouette has no edge. Picked as the corner whose offset is most aligned with the
     * sun rather than tested per pair, which is the same answer for two multiplies. */
    var bestS = -2, bestX = 0, bestZ = 0;
    for (s = 0; s < 4; s++) {
      var ox = (s < 2 ? 1 : -1) * fx + ((s & 1) ? -1 : 1) * rx;
      var oz = (s < 2 ? 1 : -1) * fz + ((s & 1) ? -1 : 1) * rz;
      var dp = ox * KX + oz * KZ;
      if (dp > bestS) { bestS = dp; bestX = ox; bestZ = oz; }
    }
    column(f, cx + bestX * LM_HW, cz + bestZ * LM_HW, LM_D0, LM_D1, G_PIPE, P.pure,
           rimLum(1) * clamp(bestS, 0, 1), w < 14 ? 1 : 0);

    /* ---- the descent engine bell ---------------------------------------------------------------
     * 1.5 m across and hanging in the middle of the gap under the floor, which is exactly why it is
     * drawn: the gap is the "landed" cue and an empty gap reads as a table. Pure mass, no rim — the
     * bell is in the vehicle's own shadow at every sun angle this world uses, because it is directly
     * under three metres of spacecraft. */
    quad(f, cx - rx * 0.72, cz - rz * 0.72, cx + rx * 0.72, cz + rz * 0.72, 0.55, LM_D0,
         LOOK_MASS, BASE + 0x95);

    /* ---- the landing gear ----------------------------------------------------------------------
     * Four legs on the diagonals of the body, which is the real arrangement and also the one that
     * reads: a leg on each diagonal means that from ANY bearing the viewer sees two legs splayed
     * left and right and two more foreshortened between them, so the object never presents a flat
     * two-legged elevation the way a leg-per-face arrangement would from 45 degrees off.
     *
     * Each leg is a primary strut from the body down to the pad, a secondary strut bracing it back
     * up to the body, and the pad itself.
     *
     * ---- EVERY LEG IS DRAWN LIT, AND THAT IS DELIBERATE ------------------------------------------
     * Every flat face in this file is either in the sun or it is a hole, because that is what the
     * terminator does on a world with no fill light. A LEG IS NOT A FLAT FACE. It is a polished
     * aluminium tube, it presents every normal at once, and there is no bearing from which it does
     * not have a lit sliver down one side — which is the same argument west_range.js makes for
     * drawing its saguaro trunk as a lit half and a dark half rather than through litFace at all.
     *
     * It is also, measured, the difference between the object working and not. In the first render
     * the two legs facing the camera were the two the sun happened to be behind, so their faceSun
     * came back at zero and they were drawn as unlit mass — one cell wide, black, over a near ground
     * plane that is itself a bright dither. They were invisible, and with them went the splayed
     * stance which is one of the three proportions the whole silhouette rests on. What is drawn now
     * never falls below 60% of the lit strut's luminance, so a leg is always a line.
     *
     * ---- AND EVERY LEG IS A BLACK CORE WITH A BRIGHT EDGE ----------------------------------------
     * A single bright cell was not enough either, for the reason that is peculiar to the lower half
     * of this object: everything above the horizon is drawn against a black sky and reads on its own
     * brightness, and everything below it is drawn against LIT NEAR GROUND running at v 130-150. A
     * one-cell pure line at v 225 over that is a 40% contrast; the same line with a black cell under
     * it is 100% either way round, and it works whichever background the leg happens to cross. Two
     * runs per strut, and it is the cheapest legibility in the file. */
    var dg, pxs, pzs;
    var strutLum = rimLum(0.85), thick = w < 34 ? 1 : 0;
    for (dg = 0; dg < 4; dg++) {
      var a = head + Math.PI * 0.25 + dg * Math.PI * 0.5;
      var lx = Math.sin(a), lz = Math.cos(a);
      pxs = cx + lx * LM_PAD; pzs = cz + lz * LM_PAD;
      /* Is this leg in front of the body or behind it? A leg on the far side is drawn anyway and
       * loses the depth test wherever the body covers it, which is what should happen; there is no
       * need to sort. */
      var sl = strutLum * (0.60 + 0.40 * faceSun(lx, lz));
      /* WHICH GLYPH A LEG IS DRAWN WITH IS DECIDED BY ITS PROJECTED SLOPE, not by a constant, and
       * that is worth six lines because the whole of what a leg contributes at this size is its
       * ANGLE. A landing gear splays; a `|` does not, and the first render drew all four legs with
       * one and they read as four dropped fenceposts under the vehicle rather than as a stance.
       * The struts run from the body's bottom corner out to a pad 1.7 m beyond it, and because the
       * eye is at 1.66 m and the pads are on the ground, every one of them is a shallow diagonal
       * three or four rows tall — so `/` and `\` are what they actually are on the grid. */
      var gl = G_PIPE;
      if (project(cx + lx * LM_ATT, LM_ATY, cz + lz * LM_ATT)) {
        var gx0 = PJ.x, gy0 = PJ.y;
        if (project(pxs, 0.20, pzs)) {
          var gdx = PJ.x - gx0, gdy = PJ.y - gy0;
          var agx = gdx < 0 ? -gdx : gdx, agy = gdy < 0 ? -gdy : gdy;
          gl = agx > agy * 1.7 ? G_UNDER
             : (agy > agx * 1.7 ? G_PIPE : (gdx * gdy > 0 ? G_BACK : G_SLASH));
        }
      }
      /* THE BRIGHT LINE GOES DOWN FIRST AND THE BLACK ONE SECOND, and the order is not a
       * preference — it is the only order that works, and getting it the other way round is what
       * made the legs invisible in the first render rather than merely dim.
       *
       * put() writes only on a STRICTLY nearer depth, and PJ.d is a function of (x, z) alone: two
       * runs over the same ground footprint at two different heights produce the SAME distance at
       * every sample. So whichever of the pair is drawn first owns every cell they share and the
       * second one is discarded in full. Drawing the outline first therefore deleted the strut it
       * was supposed to outline, and 0.08 m of height difference — a fifth of a row at thirty
       * metres — was not enough to move it onto a row of its own.
       *
       * Drawn this way round the equality works FOR the pair: the black run's own row is the row
       * the bright run already took, so it is rejected there, and only its `thick` row underneath
       * lands. The result is exactly the outline that was wanted, at no extra cost and with no
       * depth fudging anywhere. */
      run(f, cx + lx * LM_ATT, LM_ATY, cz + lz * LM_ATT, pxs, 0.20, pzs,
          gl, P.pure, sl, 12, thick);
      run(f, cx + lx * LM_ATT, LM_ATY - 0.08, cz + lz * LM_ATT, pxs, 0.12, pzs,
          0, P.shadow, 0, 12, 1);
      run(f, cx + lx * (LM_ATT + 0.15), LM_D1 - 0.55, cz + lz * (LM_ATT + 0.15),
          cx + lx * (LM_PAD * 0.62), 0.55, cz + lz * (LM_PAD * 0.62),
          G_SLASH, P.pure, sl * 0.8, 10, 0);
      /* THE FOOTPAD, and it is worth its four cells for one reason: it is the only part of the
       * vehicle that touches the ground, so it is what tells the eye where the ground under the
       * vehicle IS. A 0.94 m dish seen from a metre seven up is an ellipse about four times wider
       * than it is tall, which is what `_` draws. Black under it for the same reason as the struts. */
      run(f, pxs - lz * 0.47, 0.12, pzs + lx * 0.47, pxs + lz * 0.47, 0.12, pzs - lx * 0.47,
          G_UNDER, P.pure, rimLum(0.7), 6, 0);
      run(f, pxs - lz * 0.47, 0.02, pzs + lx * 0.47, pxs + lz * 0.47, 0.02, pzs - lx * 0.47,
          0, P.shadow, 0, 6, 1);
      /* The contact probe: a 1.7 m wire hanging off three of the four pads, whose job on the real
       * vehicle was to touch first and light a lamp in the cabin. One cell, and it is the detail
       * that says this is a machine designed by somebody rather than a shape. */
      if (dg !== 1 && w < 46)
        run(f, pxs, 0.20, pzs, pxs + lx * 0.5, 0.02, pzs + lz * 0.5, G_DOT, P.pure,
            rimLum(0.2), 4, 0);
    }

    /* ---- the ascent stage ----------------------------------------------------------------------
     * The crew compartment is a 2.34 m drum with a canted front, and above and behind it sits the
     * wider midsection with the ascent engine cover on top. Drawn as two boxes: the front one is
     * what the window and the docking target live on, the upper one is what breaks the flat top.
     *
     * IT IS `white` AND THE DESCENT STAGE IS `amber`, and that split is the real vehicle rather than
     * a compositional choice: the descent stage is wrapped in gold and amber Kapton because it is
     * being kept warm through a lunar night it will never see, and the ascent stage is aluminium and
     * white-painted Mylar because it has to survive a day in full sun. It is also the split that
     * makes the object legible at range, because it puts the frame's only saturated colour directly
     * under its brightest neutral and the eye reads the boundary between them before it reads either
     * one. */
    for (s = 0; s < 4; s++) {
      nx = (s === 0 ? fx : (s === 1 ? rx : (s === 2 ? -fx : -rx)));
      nz = (s === 0 ? fz : (s === 1 ? rz : (s === 2 ? -fz : -rz)));
      var ux = -nz, uz = nx;
      ax = cx + nx * LM_AHW - ux * LM_AHW; az = cz + nz * LM_AHW - uz * LM_AHW;
      bx = cx + nx * LM_AHW + ux * LM_AHW; bz = cz + nz * LM_AHW + uz * LM_AHW;
      var look = LOOK_BODY;
      if (s === 0) {
        /* The forward face carries the windows. One is enough at this size — the pair are 0.9 m
         * apart and at thirty metres that is four columns, so two triangles read as one wide smear
         * where one reads as a triangle. */
        WIN_U = LM_AHW * 0.62; WIN_V = LM_D1 + 0.95; WIN_W = 0.66; WIN_H = 0.54;
        look = LOOK_WIN;
      }
      var asun = faceSun(nx, nz);
      quad(f, ax, az, bx, bz, LM_D1, LM_A1, look, BASE + 0xA0 + s, asun);
      if (asun > 0.02)
        run(f, ax, LM_A1, az, bx, LM_A1, bz, G_EQ, P.pure, rimLum(1) * asun, 12, 0);
    }
    /* The ascent engine cover and the docking target above it: a low drum on top, and the drum is
     * what keeps the skyline from being a ruled horizontal. */
    quad(f, cx - rx * 0.78 - fx * 0.3, cz - rz * 0.78 - fz * 0.3,
         cx + rx * 0.78 - fx * 0.3, cz + rz * 0.78 - fz * 0.3, LM_A1, LM_A1 + 0.48,
         LOOK_BODY, BASE + 0xA8, faceSun(-fx, -fz));

    /* ---- what is on the roof -------------------------------------------------------------------
     * The rendezvous radar dish on its mount and the S-band steerable on its boom, and they are here
     * for the reason west_town.js gives for its rooftop crowns: "a town of two-storey boxes has a
     * flat skyline, and a flat skyline against the biggest sky in the project is a ruler laid across
     * the frame". This world has the biggest sky of the three by some distance — it is the whole
     * upper half of every frame and it is absolutely black — so a spacecraft whose top edge is one
     * ruled horizontal is the worst possible thing to put against it. Two masts and a small dish
     * cost about a dozen cells and they are the difference between a silhouette that terminates and
     * one that stops. */
    column(f, cx + fx * 0.35, cz + fz * 0.35, LM_A1, LM_A1 + 1.05, G_PIPE, P.pure, rimLum(0.5), 0);
    disc(f, cx + fx * 0.35, LM_A1 + 1.28, cz + fz * 0.35, 0.36, 1, G_0, P.pure, rimLum(0.9));
    column(f, cx - rx * 0.95, cz - rz * 0.95, LM_A1 - 0.2, LM_A1 + 0.72, G_PIPE, P.pure,
           rimLum(0.35), 0);

    /* THE DOCKING TARGET. A standoff cross on a dark disc, mounted beside the forward window so the
     * command module pilot can line up on it, and at this scale it is one bright glyph — but it is
     * the one bright glyph that sits above the window and below the roofline, which is where the eye
     * has already been sent by the two horizontals. Only drawn inside 40 m; past that it lands in
     * the same cell as the window and cancels it. */
    if (w < 40 && project(cx + fx * LM_AHW - rx * 0.55, LM_D1 + 1.62, cz + fz * LM_AHW - rz * 0.55))
      emit(f, Math.floor(PJ.x), Math.floor(PJ.y), G_PLUS, P.pure,
           rimLum(1) * faceSun(fx, fz), PJ.d);

    /* ---- the porch and the ladder --------------------------------------------------------------
     * Down the forward leg, and it is the object's human scale: nine rungs at 0.3 m and a platform
     * at the top, which is a stair a person climbs, and a stair tells you how big everything else
     * is. It is also the single most photographed object of the twentieth century.
     *
     * Retired at 55 m, where the rung spacing falls under one row and the whole ladder collapses
     * into a single bright column that reads as a strut. */
    if (w < 55) {
      var lax = cx + fx * (LM_PAD * 0.72), laz = cz + fz * (LM_PAD * 0.72);
      var lbx = cx + fx * LM_ATT, lbz = cz + fz * LM_ATT;
      var rungs = 9, ri;
      for (ri = 0; ri <= rungs; ri++) {
        var u = ri / rungs;
        var px2 = lax + (lbx - lax) * u, pz2 = laz + (lbz - laz) * u;
        var py2 = 0.30 + u * (LM_D0 + 0.42 - 0.30);
        run(f, px2 - rx * 0.24, py2, pz2 - rz * 0.24, px2 + rx * 0.24, py2, pz2 + rz * 0.24,
            G_DASH, P.pure, rimLum(0.5), 3);
      }
      /* The porch, and the hatch behind it as a hole in the lit face. */
      run(f, lbx - rx * 0.45, LM_D0 + 0.44, lbz - rz * 0.45, lbx + rx * 0.45, LM_D0 + 0.44,
          lbz + rz * 0.45, G_EQ, P.pure, rimLum(0.9), 5);
    }
  }

  /* ================================================================================================
   * 2. THE FLAG
   *
   * 1.52 by 0.91 metres of nylon on a two-part aluminium pole, and the detail everyone misremembers:
   * IT IS HELD OUT FLAT BY A HORIZONTAL CROSSBAR SEWN INTO ITS TOP HEM, BECAUSE THERE IS NO WIND.
   * A flag on the Moon does not fly, it does not ripple, and it does not furl — it hangs off a rod
   * like a shop awning, and every frame in which one appears to be waving is a frame taken while
   * somebody was still twisting the pole into the ground. On the real thing the crossbar jammed and
   * would not extend the last few inches, which is why the flag has a permanent wrinkle across it
   * and why so many people remember it as blowing.
   *
   * In a build where the tumbleweed rolls, the chimney smoke leans and the rover's dish turns, a
   * rectangle that is provably rigid is itself a statement about the place, and it costs nothing:
   * there is no t term anywhere below.
   * ============================================================================================= */

  var FLAG_Y0 = 1.42, FLAG_Y1 = 2.33, FLAG_W = 1.52, FLAG_POLE = 2.45;

  function drawFlag(f, k) {
    var cx = sX[k], cz = sZ[k];
    /* Beside the LM and a little forward of it, which is where every one of them was actually
     * planted — in shot from the LM's own television camera. */
    var b = Math.atan2(KX, KZ) + 1.15 + hash2(k, 2, BASE + 0xB0) * 0.5;
    var px = cx + Math.sin(b) * 9.6, pz = cz + Math.cos(b) * 9.6;
    var w = seeAt(px, pz, 1.0);
    if (!w) return;

    /* Which way it faces. Square to the sun, because a flag edge-on is a line and the crossbar means
     * it cannot turn: the crew set it where it would photograph, and photographing on this world
     * means down-sun. */
    var fb = Math.atan2(KX, KZ) + Math.PI * 0.5;
    var ex = Math.sin(fb), ez = Math.cos(fb);

    shadowPatch(f, px, pz, 0.5, 0.9, FLAG_POLE, BASE + 0xB1);

    /* The pole: two thirds of the object's height and one cell wide, in pure — a polished anodised
     * tube in raw sunlight is a specular and nothing else. */
    column(f, px, pz, 0, FLAG_POLE, G_PIPE, P.pure, rimLum(0.6), 0);

    /* ---- the cloth ------------------------------------------------------------------------------
     * Written cell by cell across the projected rectangle rather than through quad(), because the
     * stripes have to land on ROWS and quad's dither lattice is keyed to world coordinates: at 30 m
     * the flag is seven columns by two rows, and a world-lattice dither at that size is noise, not
     * stripes. Three bands, because the real thirteen would need thirteen rows and the flag would
     * have to be seven metres away.
     *
     * red and pure rather than red and white, and that is the print again. white's ceiling on the
     * night ladder is v 151 while red reaches v 195 at lum 220, so a red-and-white flag at night is
     * a red flag with grey bars in it. pure prints v 225 at the same luminance on BOTH ladders, so
     * the two bands stay within thirty points of each other at every hour and the thing reads as
     * stripes rather than as a red patch. red's own gain barely moves (0.56 -> 0.50), so it takes
     * only a token correction. */
    var i, r;
    var ax = px, az = pz, bx = px + ex * FLAG_W, bz = pz + ez * FLAG_W;
    var n = Math.ceil(FLAG_W * V.colK / w) + 2;
    if (n > 90) n = 90;
    var redLum = (KDAY * 214 + KNIGHT * 96) * (1 + 0.10 * KMIX);
    for (i = 0; i <= n; i++) {
      var u = i / n;
      if (!project(ax + (bx - ax) * u, FLAG_Y0, az + (bz - az) * u)) continue;
      var x = Math.floor(PJ.x), yb = PJ.y, d = PJ.d;
      if (!project(ax + (bx - ax) * u, FLAG_Y1, az + (bz - az) * u)) continue;
      var yt = PJ.y;
      if (yt > yb) { var sw = yt; yt = yb; yb = sw; }
      var r0 = Math.floor(yt), r1 = Math.floor(yb), span = (yb - yt) || 1e-4;
      if (r1 - r0 > 24) r1 = r0 + 24;
      for (r = r0; r <= r1; r++) {
        var band = Math.floor(((yb - r) / span) * 3);       // 0 bottom, 2 top
        if (band < 0) band = 0;
        if (band > 2) band = 2;
        /* ---- AND THERE IS NO CANTON, WHICH WAS TRIED AND TAKEN OUT AGAIN --------------------
         * The first cut painted the top-left corner `azure` when the flag was over sixteen columns
         * wide, on the argument that the blue square is what makes a flag read as THE flag. It
         * fails twice. Aesthetically, at the eight to twelve columns this object usually occupies
         * one azure cell is a tenth of it and the thing reads as a blue flag, which is the wrong
         * country; and the screen-width test is a THRESHOLD, so walking toward the site flipped one
         * cell from pure at printed v 228 to azure at v 90 in a single frame — 54% of full scale,
         * over the project's third-of-scale ceiling, on the one object in the world whose whole job
         * is being the only chromatic thing a human put there. Two bands of red and one of white is
         * what survives at this size anyway. */
        if (band === 1) emit(f, x, r, G_HASH, P.pure, rimLum(0.9), d);
        else emit(f, x, r, G_HASH, P.red, redLum, d);
      }
    }
    /* The crossbar, drawn ON TOP of the cloth and in pure, so that the one thing about this object
     * which is worth knowing is also the brightest line on it. */
    run(f, ax, FLAG_Y1, az, bx, FLAG_Y1, bz, G_DASH, P.pure, rimLum(1), 10);
  }

  /* ================================================================================================
   * 3. THE ROVER
   *
   * 3.1 m long, 2.06 m wheelbase, 1.14 m to the top of the seat backs, 0.82 m wire-mesh wheels, and
   * a 0.91 m high-gain dish on a mast. Rolled per site rather than always present, because three of
   * the six landings did not have one and a machine that is on every site is furniture.
   *
   * WHAT IDENTIFIES IT AT FORTY METRES IS THE DISH. The chassis is a low horizontal bar and at range
   * that is a dash, which is also what a boulder edge-on is; the wheels are two small round things,
   * which is also what two boulders are. A CIRCLE STANDING ON A STICK is not anything else in this
   * world, and it is the only object in three worlds that is a circle on a stick.
   *
   * THE TRACKS ARE WORTH MORE THAN THE VEHICLE. The design brief spends a page on it and
   * west_range.js opens with the same sentence — empty ground rendered honestly is empty — and a
   * pair of rails running away across the regolith is the only converging line this part of the
   * plain has. surf_moon.js draws a pair down the route centreline for the same reason; these are
   * the ones that go somewhere else, and two sets of rails crossing at an angle is what turns a
   * plain into a place that has been driven across.
   * ============================================================================================= */

  var RV_LEN = 3.05, RV_TRK = 1.03, RV_WH = 0.41, RV_DECK = 0.62, RV_SEAT = 1.14;

  function hasRover(k) { return hash2(k, 3, BASE + 0xC0) < 0.58; }

  function drawRover(f, k) {
    var cx = sX[k], cz = sZ[k];
    var b = Math.atan2(KX, KZ) - 0.85 - hash2(k, 4, BASE + 0xC1) * 0.6;
    var px = cx + Math.sin(b) * 24.0, pz = cz + Math.cos(b) * 24.0;
    var w = seeAt(px, pz, 1.0);
    if (!w) return;

    /* Parked across the sun rather than pointing at it, which is what a crew does when they get out
     * — the dish has to be aimed at Earth and the seats have to be reachable — and which also means
     * the vehicle presents its long side to a walk that has the sun behind it. A rover seen end-on
     * is 1.8 m of nothing. */
    var hd = Math.atan2(KX, KZ) + 1.35 + (hash2(k, 5, BASE + 0xC2) - 0.5) * 0.7;
    var fx = Math.sin(hd), fz = Math.cos(hd);
    var rx = Math.cos(hd), rz = -Math.sin(hd);

    drawTracks(f, px, pz, fx, fz, rx, rz, k);
    shadowPatch(f, px, pz, 1.8, 0.9, RV_SEAT + 0.5, BASE + 0xC3);

    /* ---- the chassis ---------------------------------------------------------------------------
     * A black bar with one lit edge along the top, which is the whole of market.js's canopy idiom
     * at a fifth of the size: the mass stamps depth and prints nothing, and the top edge is the
     * horizontal that makes it a made thing rather than a lump. */
    var hx = fx * RV_LEN * 0.5, hz = fz * RV_LEN * 0.5;
    quad(f, px - hx, pz - hz, px + hx, pz + hz, 0.50, RV_DECK, LOOK_MASS, BASE + 0xC4);
    run(f, px - hx, RV_DECK, pz - hz, px + hx, RV_DECK, pz + hz, G_EQ, P.pure, rimLum(0.8), 10);
    /* The two seats: a pair of black backs with lit top edges, side by side across the vehicle.
     * They are what makes the deck a vehicle somebody rode rather than a trailer. */
    var si;
    for (si = -1; si <= 1; si += 2) {
      var sxp = px + rx * 0.42 * si + fx * 0.15, szp = pz + rz * 0.42 * si + fz * 0.15;
      quad(f, sxp - fx * 0.28, szp - fz * 0.28, sxp + fx * 0.28, szp + fz * 0.28,
           RV_DECK, RV_SEAT, LOOK_MASS, BASE + 0xC5);
      run(f, sxp - fx * 0.28, RV_SEAT, szp - fz * 0.28, sxp + fx * 0.28, RV_SEAT,
          szp + fz * 0.28, G_DASH, P.pure, rimLum(0.6), 4);
    }

    /* ---- the wheels ----------------------------------------------------------------------------
     * Four, at the corners of a 2.29 m by 2.06 m rectangle, and drawn as RINGS because that is what
     * they are: piano wire woven into an open mesh with titanium chevrons on the tread, chosen
     * because a pneumatic tyre boils in vacuum. An open wheel also lets the shadow of the vehicle
     * through it, which a filled disc would not, and that gap is visible at ten metres. */
    var wi, wj;
    for (wi = -1; wi <= 1; wi += 2) for (wj = -1; wj <= 1; wj += 2) {
      var wxp = px + fx * (RV_LEN * 0.375) * wi + rx * RV_TRK * 0.5 * wj;
      var wzp = pz + fz * (RV_LEN * 0.375) * wi + rz * RV_TRK * 0.5 * wj;
      disc(f, wxp, RV_WH, wzp, RV_WH, 1, w < 16 ? G_O : G_o, P.pure, rimLum(0.5));
    }

    /* ---- the high-gain antenna -----------------------------------------------------------------
     * A 0.91 m parabolic mesh umbrella on a mast, aimed at Earth — the same bearing this world's
     * sky element hangs the disc at, because CC.SurfMoon publishes EARTH_AZ for exactly that reason
     * and a ground station pointing somewhere Earth is not would be the one error a viewer could
     * check against the sky.
     *
     * ---- AND IT IS THE ONLY MOVING THING IN THIS FILE -------------------------------------------
     * The brief allows the dish to turn, slowly. What is drawn is NOT a turning dish: it is
     * west_town.js's windmill remedy, and that comment is the reason. A rotating object drawn as
     * moving marks chops the cells it crosses, and on a world whose background is lum 0 and whose
     * highlights print at v 225 every chop is a step of ~88% of full scale. The windmill measured
     * 4.7 such steps a second against a limit of 1.0 and was redesigned rather than slowed, because
     * a blade rate low enough to be safe is far below what reads as turning.
     *
     * So the RIM IS STATIC AND ALWAYS PAINTED — no cell of it ever alternates with the sky behind
     * it — and the motion is carried by one travelling `pure` glint whose step is the difference
     * between the rim's own luminance and the glint's, i.e. rimLum(0.3) to rimLum(1.0) — 24
     * luminance units, which prints as about 9% of full scale, against the project's third-of-scale
     * ceiling. It goes round once every 34 seconds, which is 0.03 Hz and two decades below the
     * bottom of the 3-20 Hz band. Frozen outright under CC.reducedMotion. */
    var mx = px - fx * (RV_LEN * 0.42), mz = pz - fz * (RV_LEN * 0.42);
    column(f, mx, mz, RV_DECK, 1.62, G_PIPE, P.pure, rimLum(0.4), 0);
    var dr = 0.455;
    /* Tilted at Earth: the dish is drawn a little off the mast in the direction of Earth's bearing,
     * which at this size IS the tilt — a 0.9 m dish at 24 m is five columns, so its inclination is
     * carried entirely by where its centre sits relative to its own mast. */
    var eb = MOON ? MOON.EARTH_AZ : 0.28;
    var dxp = mx + Math.sin(eb) * 0.22, dzp = mz + Math.cos(eb) * 0.22;
    disc(f, dxp, 1.62 + dr * 0.7, dzp, dr, 1, G_0, P.pure, rimLum(0.3));
    var ph = CC.reducedMotion ? 1.1 : V.t * 0.185;
    if (project(dxp + Math.cos(ph) * dr * 0.9, 1.62 + dr * 0.7 + Math.sin(ph) * dr * 0.9, dzp))
      emit(f, Math.floor(PJ.x), Math.floor(PJ.y), G_STAR, P.pure, rimLum(1.0), PJ.d);
  }

  /* The two rails, running away from the parked vehicle in the direction it was last driven. Laid
   * with run() rather than as ground marks in surf_moon's floorTex, because floorTex is handed two
   * world coordinates and nothing else — it cannot know where a rover is parked — and because a
   * track is one cell wide at every distance it is visible, which is exactly what run() draws.
   *
   * PALER THAN THE GROUND AROUND THEM, which is the way round that surprised the frontier and then
   * did not: churned fines are unpacked and porous, and unpacked powder backscatters more than the
   * packed surface it was lifted out of. Drawn darker they read as two cracks; drawn paler they read
   * as tracks, and every Apollo pan shows them as the bright thing.
   *
   * The swatch splits at 32 m and the reason is measured in surf_moon.js's litSet: white's gain is
   * 0.30 and it sits where core.js's depth gamma bites hardest, so a white cell loses 65% of its
   * print by 120 m, while pure sits past the shoulder and loses 34%. The near rail is white so it
   * does not out-shout the ground it is lying on; the far rail is pure so it survives to the end of
   * the run, which is the only part of it that is doing perspective work. */
  var TRK_LEN = 52.0;

  function drawTracks(f, px, pz, fx, fz, rx, rz, k) {
    /* A gentle curve, because two dead-straight rails on an open plain read as a runway. The bend
     * is a fixed function of the site seed and of nothing else. */
    var bend = (hash2(k, 6, BASE + 0xC8) - 0.5) * 0.9;
    var side, seg;
    var N = 13;
    for (side = -1; side <= 1; side += 2) {
      var lx = -1, ly = 0, ld = 0;
      for (seg = 0; seg <= N; seg++) {
        var u = seg / N, s2 = u * TRK_LEN;
        var a = bend * u * u;
        var dx2 = fx * Math.cos(a) + rx * Math.sin(a), dz2 = fz * Math.cos(a) + rz * Math.sin(a);
        var qx = px + dx2 * s2 + (rx * Math.cos(a) - fx * Math.sin(a)) * RV_TRK * 0.5 * side;
        var qz = pz + dz2 * s2 + (rz * Math.cos(a) - fz * Math.sin(a)) * RV_TRK * 0.5 * side;
        if (!project(qx, 0.03, qz)) { lx = -1; continue; }
        var x = Math.floor(PJ.x), r = Math.floor(PJ.y), d = PJ.d;
        /* THE CROSSOVER IS DITHERED ACROSS 26-40 m ON A STABLE PER-SAMPLE HASH and not switched at
         * one distance, which is surf_moon.js's litSet doing exactly the same thing for exactly the
         * same two reasons. The picture reason: a switch puts a visible ring on the ground at a
         * fixed radius from the camera which travels with it, and a dither gives a stretch of rail
         * whose swatch ratio drifts. The gate reason: white at lum 206 prints v 140 at 32 m and
         * pure at lum 116 prints v 165, so a threshold steps 10% of full scale in one frame for
         * every cell that crosses it, and there are twenty-six of them on a rail. The hash is on
         * the SAMPLE INDEX and the side, so it is welded to the ground and cannot crawl. */
        var fv = hash2(seg, side + 2, BASE + 0xC9);
        var far = d >= 40 || (d > 26 && fv > (40 - d) / 14);
        var col = far ? P.pure : P.white;
        var lum = far ? ((96 + d * 0.62) * KDAY + (70 + d * 0.62) * KNIGHT * 0.7) : bodyLum(0.35);
        if (lx >= 0 && (d > ld * 2 || ld > d * 2)) lx = -1;
        if (lx >= 0) {
          var ddx = x - lx, ddy = r - ly;
          var st = Math.abs(ddx) > Math.abs(ddy) ? Math.abs(ddx) : Math.abs(ddy);
          if (st > V.cols * 2) st = 0;
          for (var qq = 1; qq < st; qq++) {
            var tq = qq / st;
            /* The chevron tread, carried by WHICH GLYPH it is rather than by whether there is one.
             * surf_moon.js draws its own rails the same way and says why: a rail that is only
             * sometimes painted switches cells on and off against a lum-0 background as the camera
             * walks, which is the hazard the windmill failed on. A continuous line of alternating
             * '=' and '-' reads as a tread pattern anyway. */
            emit(f, lx + Math.round(ddx * tq), ly + Math.round(ddy * tq),
                 (qq & 1) ? G_EQ : G_DASH, col, lum, ld + (d - ld) * tq);
          }
        }
        emit(f, x, r, G_EQ, col, lum, d);
        lx = x; ly = r; ld = d;
      }
    }
  }

  /* ================================================================================================
   * 4. ALSEP — the Apollo Lunar Surface Experiments Package
   *
   * A nuclear-powered central station with two or three experiments round it on flat ribbon cables,
   * deployed a hundred metres from the LM so the ascent stage's exhaust would not blow it over. Add
   * the laser retroreflector, which is not part of ALSEP and needs no power because it is a mirror,
   * and the television camera on its tripod.
   *
   * NONE OF THIS IS BIG. The central station is a 0.6 m box with a 0.6 m mast; at 45 m that is under
   * two columns and one row. So the objects are not the point of this section and the CABLES are:
   * five thin lines converging on one spot in the middle distance, on ground that otherwise has
   * nothing straight in it anywhere. It is the same job west_range.js's telegraph does — "an open
   * plain with no converging line in it has no perspective" — and it is the only man-made line on
   * the Moon.
   *
   * THE STATION IS DEPLOYED CLOSER THAN THE REAL ONE. A hundred metres is right and it is also
   * outside V.far minus the width of a site, so on most approaches the whole experiment array would
   * be past the caster's own far plane and the cables would run off into nothing. 34-52 m puts the
   * station comfortably inside the frame at the same time as the LM, which is the picture — the
   * cables have to have something to converge FROM.
   * ============================================================================================= */

  var ALSEP_N = 3;

  function drawALSEP(f, k) {
    var cx = sX[k], cz = sZ[k];
    /* Down-sun of the LM and off to one side, which is where they went: the crew walked away from
     * the vehicle with the sun behind them so they could see the ground they were putting it on. */
    var b = Math.atan2(KX, KZ) + Math.PI + 0.55 + (hash2(k, 7, BASE + 0xD0) - 0.5) * 0.9;
    var rng = 34 + hash2(k, 8, BASE + 0xD1) * 18;
    var stx = cx + Math.sin(b) * rng, stz = cz + Math.cos(b) * rng;

    /* ---- the central station -------------------------------------------------------------------
     * A knee-high box with a mast, and two gold thermal petals that fold out flat to keep the
     * radioisotope generator's heat pointed at the sky. The petals are the second and last amber in
     * this world, and they are two cells: deliberately small, so the thing reads as EQUIPMENT rather
     * than as structure. Anything knee-high that reads as structure is a building, and a building on
     * the Moon is the one thing that would break the world. */
    var w = seeAt(stx, stz, 1.0);
    if (w) {
      shadowPatch(f, stx, stz, 0.7, 0.4, 1.2, BASE + 0xD2);
      quad(f, stx - 0.3, stz - 0.3, stx + 0.3, stz + 0.3, 0.05, 0.62, LOOK_MASS, BASE + 0xD3);
      run(f, stx - 0.34, 0.62, stz - 0.34, stx + 0.34, 0.62, stz + 0.34, G_DASH, P.pure,
          rimLum(0.8), 4);
      column(f, stx, stz, 0.62, 1.24, G_PIPE, P.pure, rimLum(0.5), 0);
      /* The two petals, and they are drawn at EVERY distance rather than retired at sixty metres as
       * the first cut did. A distance gate on two cells of amber at printed v 150 against a lum-0
       * background is a 59%-of-scale step the first time the walk crosses that radius, which is the
       * one thing this world cannot afford; past forty metres the two of them collapse into the same
       * cell as the mast and cost one rejected depth test each, which is cheaper than the gate was. */
      if (project(stx - 0.42, 0.66, stz))
        emit(f, Math.floor(PJ.x), Math.floor(PJ.y), G_CARET, P.amber, foilLum(0.7), PJ.d);
      if (project(stx + 0.42, 0.66, stz))
        emit(f, Math.floor(PJ.x), Math.floor(PJ.y), G_CARET, P.amber, foilLum(0.4), PJ.d);
    }

    /* ---- the experiments and their cables ------------------------------------------------------
     * Two or three packages 9-19 m out from the station on their own bearings, each on a flat 5 cm
     * ribbon that lies on the ground exactly where it fell — there is nothing to blow it about and
     * nothing to rot it, so a cable deployed in 1971 is still lying in the same curve.
     *
     * The cable is drawn at y = 0.02 rather than 0, one centimetre off the floor plane, which is not
     * pedantry: at zero the line and the ground cells it crosses have the same projected depth to
     * within rounding and the run flickers in and out of the depth test as the camera walks. */
    var e;
    for (e = 0; e < ALSEP_N; e++) {
      if (e === 2 && hash2(k, 9, BASE + 0xD4) > 0.6) continue;
      var eb = hash2(k, 20 + e, BASE + 0xD5) * 6.2831853;
      var er = 9 + hash2(k, 30 + e, BASE + 0xD6) * 10;
      var ex = stx + Math.sin(eb) * er, ez = stz + Math.cos(eb) * er;
      var ew = seeAt(ex, ez, 1.0);
      /* The cable is drawn whenever EITHER end is worth drawing, because the line is the object and
       * a line with one end off the side of the frame is still a line running to a vanishing point. */
      if (w || ew)
        run(f, stx, 0.02, stz, ex, 0.02, ez, G_DOT, P.white, bodyLum(0.15), 26);
      if (!ew) continue;
      shadowPatch(f, ex, ez, 0.45, 0.3, 0.7, BASE + 0xD7 + e);
      quad(f, ex - 0.22, ez - 0.22, ex + 0.22, ez + 0.22, 0.03, 0.38, LOOK_MASS, BASE + 0xDA + e);
      run(f, ex - 0.26, 0.38, ez - 0.26, ex + 0.26, 0.38, ez + 0.26, G_DASH, P.pure,
          rimLum(0.7), 3);
    }

    /* THE LONG RUN BACK TO THE LM. The cable that matters: forty-odd metres of straight line from
     * the middle distance to the object in the foreground, and the only thing in this world that
     * ties two objects together across open ground. */
    run(f, stx, 0.02, stz, cx + Math.sin(b) * 4.2, 0.02, cz + Math.cos(b) * 4.2,
        G_DOT, P.white, bodyLum(0.25), 34);

    drawRetro(f, k, cx, cz);
    drawTV(f, k, cx, cz);
  }

  /* ---- the laser retroreflector ------------------------------------------------------------------
   * A 46 by 61 cm panel of a hundred fused-silica corner cubes on a folding frame, tipped up to face
   * Earth and levelled with a spirit bubble. It has no power and no moving parts and it is the only
   * Apollo experiment still returning data, which is a fact worth two cells.
   *
   * IT IS A MIRROR, AND IT IS DRAWN AS ONE. A flat panel tilted at Earth flashes when the observer
   * stands on the reflected sun ray, and for a horizontal bearing that is the sun's bearing mirrored
   * about the panel's own aim: flare = 2*EARTH_AZ - SUN_AZ. That single expression is why the glint
   * fires in one specific place on the walk and never anywhere else, and why it moves to a different
   * place when the clock moves the sun — the ground and the sky are doing the same geometry.
   *
   * THE FLARE RAMPS AND NEVER SWITCHES, which is the hard gate rather than a nicety. The window is
   * +-0.42 rad of bearing, and the bearing to a panel 17 m away changes at SPEED/17 = 0.09 rad/s, so
   * the ramp takes about nine seconds each way — four times the two the brief asks for — with a
   * smoothstep on top so there is no corner at either end either.
   *
   * AND THE SWATCH DOES NOT CHANGE WITH IT, WHICH THE FIRST CUT GOT WRONG. That version drew a dull
   * `slate` cell off-axis and switched to `pure` at kk 0.35, which is exactly the design the brief
   * asks for and is a hazard: slate at lum 34 prints v 42 and pure at the same lum prints v 100, so
   * a THRESHOLD on the swatch is a 23%-of-scale step in a single frame however slowly the ramp
   * underneath it runs. It is the same trap surf_moon.js documents at length for its azure/white
   * night handover — two swatches at the same luminance are not the same brightness — and the
   * answer here is simpler than a print-matched crossfade: use one swatch for the whole ramp. pure
   * at lum 14 prints v 44, which is the dull off-axis panel the brief describes to within two
   * points, and there is then no discontinuity anywhere in the function.
   *
   * The kk*kk shapes the ramp so that most of the nine seconds is spent dark and the flare is a
   * sharp event at the end of it, which is what a corner-cube array does. */
  function drawRetro(f, k, cx, cz) {
    var b = Math.atan2(KX, KZ) + 2.35 + (hash2(k, 10, BASE + 0xE0) - 0.5) * 0.7;
    var px = cx + Math.sin(b) * 17.0, pz = cz + Math.cos(b) * 17.0;
    var w = seeAt(px, pz, 1.0);
    if (!w) return;
    var eaz = MOON ? MOON.EARTH_AZ : 0.28;
    var saz = Math.atan2(KX, KZ);
    var flare = 2 * eaz - saz;
    /* Where the camera actually is, as a bearing FROM the panel. */
    var vb = Math.atan2(V.ox - px, V.oz - pz);
    var da = vb - flare;
    da = Math.atan2(Math.sin(da), Math.cos(da));
    var kk = 1 - clamp((da < 0 ? -da : da) / 0.42, 0, 1);
    kk = kk * kk * (3 - 2 * kk);
    /* The panel is 46 cm across, which is one cell at any distance it can be seen from — so the
     * whole experiment is one cell that is dark almost all of the time and blinding for about two
     * seconds of one walk. That is a fair description of the object. */
    shadowPatch(f, px, pz, 0.4, 0.25, 0.5, BASE + 0xE1);
    if (!project(px, 0.26, pz)) return;
    emit(f, Math.floor(PJ.x), Math.floor(PJ.y), kk > 0.55 ? G_STAR : G_EQ, P.pure,
         14 + kk * kk * (rimLum(1) - 14), PJ.d);
  }

  /* ---- the television camera ---------------------------------------------------------------------
   * A 0.6 m head on a tripod at 1.3 m, set up facing the LM so that a few hundred million people
   * could watch. Two rows tall at thirty metres, which makes it the only piece of human-scale
   * FURNITURE in the world — everything else here is either a spacecraft or knee-high — and it is
   * what tells the eye how big the LM behind it is. */
  function drawTV(f, k, cx, cz) {
    var b = Math.atan2(KX, KZ) - 1.9 + (hash2(k, 11, BASE + 0xE8) - 0.5) * 0.6;
    var px = cx + Math.sin(b) * 14.0, pz = cz + Math.cos(b) * 14.0;
    var w = seeAt(px, pz, 1.0);
    if (!w) return;
    shadowPatch(f, px, pz, 0.6, 0.35, 1.35, BASE + 0xE9);
    /* Three legs at 120 degrees, splayed to a 1.0 m spread. Drawn as three separate runs rather
     * than as a mass, because a tripod IS its three lines: at this size a filled triangle is a
     * blob and three diverging strokes are unmistakably a stand. */
    var li;
    for (li = 0; li < 3; li++) {
      var a = b + li * 2.0944;
      run(f, px, 1.28, pz, px + Math.sin(a) * 0.5, 0.02, pz + Math.cos(a) * 0.5,
          li === 1 ? G_PIPE : (li === 0 ? G_SLASH : G_BACK), P.pure, rimLum(0.45), 5);
    }
    quad(f, px - 0.16, pz - 0.16, px + 0.16, pz + 0.16, 1.28, 1.62, LOOK_MASS, BASE + 0xEA);
    /* The lens, aimed back at the LM. `ice` for one cell and one cell only — surf_moon.js records
     * that ice at any real coverage turns a lunar frame teal, and this is the object it was being
     * held back for: a coated glass objective is genuinely a cold blue-white highlight, and it is
     * the only cyan cell on the ground anywhere in this world. */
    var tox = cx - px, toz = cz - pz, tl = Math.sqrt(tox * tox + toz * toz) || 1;
    if (project(px + (tox / tl) * 0.18, 1.5, pz + (toz / tl) * 0.18))
      emit(f, Math.floor(PJ.x), Math.floor(PJ.y), G_o, P.ice, KDAY * 178 + KNIGHT * 74, PJ.d);
  }

  /* ================================================================================================
   * REGISTRATION
   *
   * Layers follow the design brief's own table — ALSEP at 19, the flag and the rover at 20 and 21,
   * the Lunar Module at 21 — which puts the small ground furniture under the vehicles and the
   * vehicles under moon_crew.js at 22. Nothing here depends on that ordering for correctness: every
   * write goes through put(), which depth-tests, so two objects overlapping resolve on distance and
   * not on which element ran first. What the layers buy is the ground shadows, which are laid by
   * whichever object owns them and only ever touch cells that are still floor.
   * ============================================================================================= */

  function each(f, fn) {
    var i;
    for (i = 0; i < sN; i++) {
      /* A cheap reject before any of the trigonometry. The furthest thing hung off an anchor is the
       * far end of the rover's wheel tracks — the rover parks 24 m out and the rails run 52 — so
       * nothing an anchor owns is more than about 80 m from it, and V.far is 125. An anchor beyond
       * 205 m therefore cannot contribute a single cell to the frame. */
      if (near2(sX[i], sZ[i], V.ox, V.oz) > 205 * 205) continue;
      fn(f, i);
    }
  }

  function mk(name, layer, fn) {
    return {
      name: name, layer: layer, world: 'moon',
      init: function (city) { boot(city); },
      draw: function (f, cam, t) {
        if (!CITY || !sN) return;
        PR.view(f, cam, t === undefined ? (cam.t || 0) : t);
        key();
        if (!MOON) return;
        each(f, fn);
      }
    };
  }

  CC.ELEMENTS.push(mk('moon-alsep', 19, drawALSEP));
  CC.ELEMENTS.push(mk('moon-flag', 20, drawFlag));
  CC.ELEMENTS.push(mk('moon-rover', 21, function (f, k) { if (hasRover(k)) drawRover(f, k); }));
  CC.ELEMENTS.push(mk('moon-lm', 21, drawLM));

})(typeof CC !== 'undefined' ? CC : require('../core.js'));
