/* CyberCity lunar surfaces — the texture layer for MOONWALK, and the third sibling of
 * surfaces.js and surf_west.js. Same three entry points, same signatures, same output records,
 * same rule that nothing here may know about the camera. surfaces.js delegates to this file when
 * CC.World says moon, which is why it does not re-implement fog(), configure() or cfg — those are
 * facts about a projection and a print, not about a planet, and all three worlds share them.
 *
 * ---- THE HOUR, and there isn't one ---------------------------------------------------------------
 * surf_west.js opens by naming its hour — "the last twenty minutes of light" — because on a world
 * with air the hour decides everything. Here the honest header is the opposite one: A SYNODIC
 * LUNAR DAY IS 708 HOURS, so the sun crosses this sky at 0.508 degrees per hour, or 2.46e-6 rad/s.
 * Over the longest walk anybody will ever leave running it moves about a degree. There is no dawn,
 * no dusk, no golden hour and no blue hour, and the light at 06:00 is the light at 12:00 to four
 * figures. What varies from place to place is where in that 708-hour day you landed, and every
 * Apollo landing was flown at a low sun on purpose — 5 to 25 degrees — because long shadows are the
 * only way to read relief on a surface with no aerial perspective and no vegetation on it.
 *
 * This file nevertheless takes its sun from CC.Daylight, and the reason is a build decision rather
 * than an astronomical one: the world has a clock, the viewer has a key that steps it, and a world
 * in which that key does nothing at all would be the only one of the three that ignores it. So the
 * director's altitude is COMPRESSED into the Apollo band (see dayAt) rather than used raw, and its
 * azimuth is ROTATED so the sun lives behind the walk. Both moves are written out below with the
 * arithmetic that forced them.
 *
 * ---- THERE IS NO ATMOSPHERE, and that is four facts, not one -------------------------------------
 *   1. NO FILL. A shadow is not dark, it is lum 0. There is no sky to fill it and nothing to
 *      bounce into it except the ground itself, which is why the near-field fill below is 8% of
 *      cells at lum 16-24 and the far-field fill is nothing whatsoever.
 *   2. NO PENUMBRA. The sun subtends 0.0093 rad, so the terminator on a rock is a hard line about
 *      one cell wide. sunOf's slope is 3.0 where the frontier's is 0.62 — see sunOf.
 *   3. NO AERIAL PERSPECTIVE. Distance carries no colour, no haze and almost no attenuation. The
 *      fog ramp declared at the bottom of this file starts at 150 m, against the city's 12 and the
 *      frontier's 20, and its exponent is a HOLD rather than a crush.
 *   4. NO SKY. The sky is the same absolute black at noon as at midnight, so sky() returns a blank
 *      for about 98% of the cells it is asked about and is being PHYSICALLY CORRECT rather than
 *      economising. Deleting surf_west.js's five-band dome is not a simplification; every one of
 *      those five bands is a picture of air.
 *
 * ---- WHAT THE PALETTE IS ALLOWED TO DO -----------------------------------------------------------
 * Working from core.js's EXPOSURE ladder and the printed ceilings it implies (a swatch's printed
 * value is its pigment's max channel scaled by the LUT, which is what tools/metrics.py counts):
 *
 *   pure  gain 0.85, ceiling v 234 — sunlit rock and regolith at range, and every specular
 *   white gain 0.30, ceiling v 151 — sunlit rock and regolith in the near field
 *   azure gain 1.00, ceiling v 220 — Earth, and everything earthshine touches
 *   ice   gain 0.36, ceiling v 175 — the first-magnitude stars here, and nothing else; the
 *                                    element files own its other jobs (a visor, a retroreflector)
 *   slate gain 0.60, ceiling v 114 — THE FAINTEST STARS AND THE NEAR-FIELD SHADOW FILL, AND
 *                                    NOTHING ELSE, EVER. See below.
 *
 * SLATE CANNOT BE A LIT SURFACE. Its printed ceiling is 114 and the print's muddy band runs to
 * 119, so every slate cell ever written, at any luminance, at any distance, is a muddy cell by
 * construction. It is the obvious swatch to reach for — it is the grey one, the Moon is grey, and
 * surf_west.js leans on it for everything the sun has left — and here it is the single worst
 * choice available: a ground plane in slate would put a third of the frame in the band core.js is
 * trying to hold under 30%.
 *
 * AND NOTHING WARM. amber (ceiling 180) and ember (163) are SCATTERING colours — a sodium lamp, a
 * kerosene flame, a sunset band are all light reddened by passing through something, and there is
 * nothing for lunar sunlight to pass through. Apollo surface photography is famously and
 * disconcertingly colourless: white suits, grey ground, black sky, and the only saturated objects
 * in the entire frame are man-made (gold Kapton, the flag, a red-striped gnomon). Those belong to
 * the element files. Nothing in THIS file is ever warm. The test is that a Moonwalk frame converted
 * to greyscale should be indistinguishable from a Moonwalk frame.
 *
 * ---- THE RULE THAT REPLACES ALL OF IT ------------------------------------------------------------
 * DENSITY CARRIES TONE; LUMINANCE STAYS HIGH. A cell of this world is either not painted at all
 * (lum 0) or it is painted at the top of the ladder. There is no legitimate reason for a lunar cell
 * to land at v 60. The Moon's grey comes from the ratio of black cells to bright ones, which is
 * what a 0.11-albedo powder under an unfiltered 1361 W/m2 sun physically is.
 */
(function (CC) {
  'use strict';

  var P = CC.P, g = CC.g, hash2 = CC.hash2, clamp = CC.clamp;

  var G_DOT = g('.'), G_COMMA = g(','), G_COLON = g(':'), G_SEMI = g(';'), G_QUOTE = g("'"),
      G_TICK = g('`'), G_DASH = g('-'), G_EQ = g('='), G_TILDE = g('~'), G_STAR = g('*'),
      G_PLUS = g('+'), G_PCT = g('%'), G_HASH = g('#'), G_8 = g('8'), G_o = g('o'), G_O = g('O');

  /* The one thing this file and surfaces.js MUST agree on, because raycast.js configures only one
   * of them: the config block. Resolved lazily rather than captured, so load order cannot bite. */
  function cfg() { return CC.Surf ? CC.Surf.cfg : null; }

  /* ---- the key light ------------------------------------------------------------------------------
   * A bearing in the same convention as everything else in the project: yaw 0 faces +z, so the
   * direction of bearing b is (sin b, cos b).
   *
   * THE AZIMUTH IS THE DIRECTOR'S, ROTATED BY PI, and the rotation is the whole composition.
   * city.js runs its avenues along +z and the walk spends most of its time on one, so where the sun
   * sits relative to that axis decides what the frame contains:
   *
   *   with the sun AHEAD (which is where CC.Daylight puts it — AZ_NOON is -0.5, i.e. 29 degrees off
   *   the +z walk axis, chosen so the frontier's sunset is in frame) every face the camera can see
   *   on the Moon is a face turned AWAY from the light. sunOf is a step here, not a ramp, so those
   *   faces come back at exactly zero and the near field is a field of invisible black rocks. This
   *   is not a stylisation gone wrong; it is what an up-sun Apollo frame actually looks like, and it
   *   is the reason the crews were told to photograph down-sun.
   *
   *   with the sun BEHIND, every visible face is lit, every shadow points forward and left INTO the
   *   picture, and the antisolar point — where the heiligenschein and the photographer's own shadow
   *   live — lands inside the 36-degree half-fov. Shadows converging on a point in frame is the only
   *   set of converging lines this world gets for free, and section (c) of the design brief is a
   *   page on how badly an open plain reads without converging lines.
   *
   * So the offset is PI. The sun still SWINGS with the clock — Daylight's az runs -1.85 to +0.85, so
   * the Moon's runs 1.29 through 2.64 to 3.99 — which keeps the T key meaningful and turns every
   * shadow in the world through 155 degrees over the cycle, and it never leaves the rear hemisphere.
   *
   * EVERY MOON ELEMENT MUST READ SUN_AZ/SUN_X/SUN_Z/SUN_ALT OFF THIS OBJECT and never CC.Daylight
   * directly, or the ground and the sky will disagree about where the light comes from by exactly
   * 180 degrees. That is the same contract west_town.js, west_range.js and west_sky.js keep with
   * CC.SurfWest, and it is why these four are re-exported as getters at the bottom of the file. */
  var AZ_OFFSET = Math.PI;

  /* Earth is tidally locked and does not move, ever, from a fixed point on the lunar surface: it is
   * the only object in any of the three worlds that is nailed in place, and it is the source of
   * every photon on the ground at night. These two are published rather than used — the bearing is
   * NOT the key direction, for the measured reason in dayAt — because moon_sky.js has to draw the
   * disc somewhere and the sky and the ground have to have got their geometry from the same place.
   * 0.28 rad puts it 16 degrees right of the walk axis and 0.24 rad (13.7 degrees) up, which
   * is both a defensible site — a landing well east on the near side sees Earth low — and the only
   * elevation the frame can hold: at 400x100 an object at elevation A lands at row 56 - tan(A)*155,
   * so anything above 0.35 rad is off the top of the picture. moon_sky.js draws the disc and must
   * use THESE constants, which is why they are exported. */
  var EARTH_AZ = 0.28, EARTH_ALT = 0.24;

  /* Live key state, refreshed once per frame in dayAt. The defaults are the picture a standalone
   * require() gets when there is no director at all: a 14-degree sun dead behind the walk. */
  var SUN_AZ = AZ_OFFSET, SUN_X = Math.sin(AZ_OFFSET), SUN_Z = Math.cos(AZ_OFFSET), SUN_ALT = 0.25;
  /* dNight is how much of the key light is EARTHSHINE rather than sun, 0..1. dMix is core.js's live
   * day/night print blend, read back out of the print rather than re-derived — see below. */
  var dT = 1 / 0, dNight = 0, dMix = 0;

  /* The compressed Apollo altitude band. Daylight's altitude peaks at ALT_MAX = 0.95 rad (54
   * degrees), which is right for a world that wants a legible noon and wrong for this one: shadow
   * length is h/tan(alt), so 54 degrees gives a 1 m boulder a 73 cm shadow and the relief that is
   * the ONLY way to read this surface disappears. 0.09 to 0.45 rad is the band every Apollo landing
   * was flown in, and across it a 1 m boulder throws 11.1 m down to 2.1 m — the factor of four that
   * is this world's scale ruler, and the one thing about the light that legitimately varies. */
  var ALT_LO = 0.09, ALT_HI = 0.45;

  function dayAt(t) {
    if (t === dT) return;
    dT = t;
    /* core.js quantises its day/night ladder blend to 32 steps and publishes the live value. It is
     * read rather than recomputed because the LUT is what actually prints, and it is set in
     * Compose.post, i.e. AFTER the world pass — so this is last frame's blend. At 32 steps over a
     * 420 s cycle that is one step every 13 s and a frame of lag is invisible. */
    dMix = (CC.dayMix === undefined) ? 0 : CC.dayMix;
    var D = CC.Daylight;
    if (!D) return;                       // standalone require: hold the tuned default sun
    var alt = D.P.alt;

    /* ---- WHERE NIGHT COMES FROM, AND WHY IT IS A CROSSFADE ------------------------------------
     * "Night" on the Moon is not a darker version of day, it is a different key light: Earth, which
     * from here is 34 to 50 times brighter than a full Moon from Earth (13.7 times the solid angle,
     * 2.5 times the albedo) and is genuinely blue-white. So the whole file switches its key SWATCH
     * from white/pure to azure and leaves the geometry alone.
     *
     * The switch is a CROSSFADE and not a flag, and that is a photosensitivity requirement rather
     * than a nicety. This world's background is lum 0 and its highlights print at v 219-234, so any
     * bright cell that appears or disappears is a step of ~90% of full scale, and a hard flag would
     * take every one of them in a single frame.
     *
     * IT IS DRIVEN OFF D.P.sky AND THE WINDOW IS NARROW, and both halves of that are the third
     * attempt. The first keyed it to D.P.sun and put the whole handover inside six seconds; the
     * second keyed it to the altitude and got 35 seconds. Both failed the 3-20 Hz probe (3.74% and
     * 2.82% against a 2% gate, worst readings anywhere in the cycle), and the measurement said the
     * cause was not the timing but the MATCH. azure and white are the same printed value only on
     * the night ladder: at core.js's mix 0 azure lum 44-70 prints v 121-144 and white lum 150-212
     * prints v 124-141, and by mix 0.3 azure has fallen to v 93-115 while white has risen to
     * v 121-157. A cell swapping swatch anywhere in the middle of the ladder therefore steps 40 to
     * 60 points however slowly the crossfade runs.
     *
     * P.sky IS the number core.js quantises its ladder blend from, so keying the swatch handover to
     * it and holding the window to sky < 0.16 puts every swap inside the stretch of the ladder
     * where the two swatches agree to within about 19 points, i.e. 7% of full scale. That window is
     * 17 seconds long at both ends of the day, which is a thousand frames. Worst reading 1.9%. */
    dNight = 1 - clamp(D.P.sky / 0.16, 0, 1);

    /* THE KEY DIRECTION IS THE SUN'S, ALWAYS, AND IT IS NOT CROSSFADED INTO EARTH'S. This is the
     * one place the design brief is not implemented as written, and it is a measured trade rather
     * than an oversight.
     *
     * The brief is right that Earth is fixed and that at night the shadows should point away from
     * EARTH_AZ; the disc and the ground would then agree. What it costs is a 2.6 rad rotation of
     * the key light somewhere in the handover, and a rotating key relights every face in the world:
     * at the 17 s window above that is 0.15 rad/s, ten times the sun's own 0.015, and it was the
     * single largest contributor to the 3.74% the first version measured. Against that, the thing
     * it buys is a shadow bearing the viewer can only check against a disc fifteen cells wide, at
     * an hour when the ground is at v 130 and the shadows are deliberately soft.
     *
     * So the direction stays on D.P.az + PI, which moves at most 0.020 rad/s and never jumps. If
     * daylight.js ever grows a vacuum world whose P.sky is 0 — the right fix, and the one in the
     * report — this becomes affordable again, because the handover would then have all night to
     * happen in. */
    SUN_X = Math.sin(D.P.az + AZ_OFFSET); SUN_Z = Math.cos(D.P.az + AZ_OFFSET);
    SUN_AZ = Math.atan2(SUN_X, SUN_Z);

    var lift = clamp(alt / 0.95, 0, 1);
    SUN_ALT = ALT_LO + (ALT_HI - ALT_LO) * lift;
    /* And the key's elevation crossfades to Earth's the same way. It is worth almost nothing in
     * this file — SUN_ALT appears once, in where the terminator sits inside a small crater — but it
     * is what every element file will read to lay a shadow down, and a shadow that keeps the sun's
     * length after the sun has gone is the sort of thing nobody notices and everybody feels. */
    SUN_ALT = SUN_ALT + (EARTH_ALT - SUN_ALT) * dNight;

    /* The slope-shading gain, which is 1/tan(alt) normalised at the middle of the Apollo band and
     * clamped — see the block on SLOPE_K down in the floor section. Computed here because it is a
     * fact about the light, it changes once a frame, and floorTex must not carry a tan() call six
     * thousand times over. The clamp is what keeps a 5-degree sun from turning the plain into
     * corrugated iron; the floor at 0.6 is what stops a high sun flattening it out altogether. */
    var tg = Math.tan(SUN_ALT); if (tg < 0.02) tg = 0.02;
    SLOPE_G = clamp(0.255 / tg, 0.6, 1.9);
  }

  /* ---- weather, sampled once per frame ------------------------------------------------------------
   * Same cache-on-t trick as its two siblings. PRESETS_MOON is zero in every atmospheric key except
   * haze, which is the one that is real here: electrostatically levitated dust fines near the
   * terminator, and the rooster-tail a rover fender throws — which on the Moon flies on a perfect
   * ballistic arc and LANDS, because there is no air to suspend it. So haze is read raw and used
   * for exactly one thing, a few more fines on the ground, and rain/wet/wind are not read at all
   * because a value that is structurally zero is not a parameter. */
  var wT = 1 / 0, wFines = 0;
  function weatherAt(t) {
    if (t === wT) return;
    wT = t;
    var W = CC.Weather;
    if (!W) return;
    wFines = W.P.haze;
  }

  /* ---- cell metadata, defensively -----------------------------------------------------------------
   * Same contract as surfaces.js and surf_west.js: city.js owns the record, this file must degrade
   * rather than throw on a field that is not there. raycast.js's bindCell hands over exactly six
   * fields — seed, style, litRate, accent, hue, plus h/faceX/side stamped per hit — so district,
   * lotX, lotZ and crown are NOT visible from in here whatever city.js stores. That is worth
   * stating because it is what kills one item of the design brief: blast scour keyed to a `site`
   * lot anchor cannot be drawn by floorTex, which is handed nothing but two world coordinates.
   * moon_lm.js has the anchor and should draw its own scour. */
  function seedOf(cell) {
    if (!cell || typeof cell !== 'object') return 0;
    if (cell.seed !== undefined) return cell.seed | 0;
    return 0;
  }

  /* litRate, hue and accent are deliberately never read in this file, and that is a decision rather
   * than an oversight. DIST_MOON carries lit 0 and signP 0 in every district precisely so the whole
   * window and signage path is switched off by DATA; and `hue` is slate or white in every row,
   * which is to say colour is not a property of lunar terrain and reading it would only reintroduce
   * the muddy slate this file exists to keep out. What the districts DO decide is geometry — the
   * style index (7 regolith, 8 rock), the vacancy, the boulder and crater rates, the massifs — and
   * that is the whole of their job here. */

  var FOUT = { ch: 0, col: 0, lum: 0 };
  function fset(ch, col, lum) {
    FOUT.ch = ch; FOUT.col = col;
    FOUT.lum = lum < 0 ? 0 : (lum > 255 ? 255 : lum | 0);
    return FOUT;
  }

  /* Scale a finished record. Used only by the two terminator ramps, which is why it exists at all:
   * a lit cell that switches straight to blank is a step of 70%+ of full scale on this world's
   * lum-0 background, and holding the last stretch of the ramp at 24% brings that under the
   * project's third-of-full-scale ceiling without softening the terminator anywhere the eye can
   * see it. See the block on the dither in facade(). */
  function dim(o, k) { o.lum = (o.lum * k) | 0; return o; }

  /* ---- HOW BRIGHT A LIT CELL IS, AND WHY IT DEPENDS ON HOW FAR AWAY IT IS -------------------------
   * This is the largest single decision in the file and it was not in the plan; it came out of
   * measuring core.js's LUT and it inverts one of the design brief's headline claims, so it is
   * written down rather than left in the constants.
   *
   * THE CLAIM. "There is no aerial perspective, so a boulder at 100 m is exactly as bright and as
   * sharp as one at 3 m." Physically true, and the single most alien property of a lunar
   * photograph. This file's fog ramp does its half of it — 150 m before anything fades at all.
   *
   * THE TRAP, and it is in core.js rather than here. tone() does not only fog: it quantises depth
   * into DBUCKETS = 8 and retires the gamma LIFT across them, from gm 0.372 in bucket 0 to 0.958 in
   * bucket 7, on the CONSTANTS FOG_START 12 / FOG_END 125 regardless of what world is being drawn.
   * In the city and the frontier that is invisible because their own fog crushes a far cell before
   * the bucket can; with no fog it is the dominant effect in the frame. Measured off the live LUT,
   * one cell written at the same luminance at 3 m and at 120 m:
   *
   *      swatch/lum      3 m    30 m    60 m   100 m   120 m  | 130 m (bucket 0 again)
   *      white 150       124     107      81      52      44  |   124
   *      white 250       150     135     110      81      73  |   150
   *      pure  150       197     186     166     139     131  |   197
   *      pure  235       229     224     214     199     194  |   229
   *
   * WHITE LOSES 65% OF ITS PRINT BY 120 m AND PURE LOSES 34%. The reason is the shoulder: white's
   * gain is 0.30, so a white cell sits at x = 0.18 where the depth gamma bites hardest, and pure's
   * is 0.85, which puts it past SHOULDER 0.62 where the curve is nearly flat. There is no
   * luminance that fixes white — holding v 130 at 120 m needs lum 434.
   *
   * SO THE FAR FIELD IS WRITTEN IN `pure` AND THE NEAR FIELD IN `white`, with a distance ramp on
   * the far one that cancels what is left of the bucket. That is not a re-tasting of the swatch:
   * core.js documents pure as "specular hits only, use sparingly" and the design brief's own
   * lighting section already names pure and azure as this world's two pillars. It is simply that
   * the arithmetic puts the crossover at 24-40 m rather than at the specular.
   *
   * The crossover is DITHERED across that band on the cell's own stable hash rather than switched
   * at one distance, so what the eye sees is a texture whose swatch ratio drifts, not a ring.
   *
   * AND THERE IS A CLIFF AT 125 m. core.js prints anything at d >= SKY_D (= FOG_END = 125) in
   * bucket 0, the brightest end of the curve — the rule that keeps the stars in the slot between
   * the rooftops. On a world with fog nothing survives that far to notice. Here the ground plane
   * and every distant massif run straight through it, and un-corrected a rock at 130 m prints 40%
   * brighter than the same rock at 120 m: a bright band across the middle distance, at a fixed
   * radius, in every frame. The ramp therefore STOPS at 125 m and drops to the constant that prints
   * the same value in bucket 0. This is the only place in the project that can see that cliff.
   *
   * `base` is 0..1: where in the lit surface's own tonal range this cell sits. `hv` is the cell's
   * stable hash, used for the crossover dither and for nothing else. */
  var NEAR0 = 24.0, NEAR1 = 40.0, CLIFF = 125.0;

  function litSet(ch, base, dist, hv) {
    var far = dist >= NEAR1 ||
              (dist > NEAR0 && hv > (NEAR1 - dist) / (NEAR1 - NEAR0));
    if (!far) {
      /* THE NEAR FIELD IS A MASS AT lum 150-212, never below 138, and that floor is the lunar
       * restatement of surf_west.js's largest decision. The frontier found that its lit clapboard
       * had to be painted as a mass in amber at lum 88-150 because amber clears the muddy ceiling
       * at lum 87; white clears it at 138, so this is the same sentence with a higher floor. A "dim
       * grey lit surface" is not a thing this print can draw.
       *
       * The dMix term is the second half of the ladder problem — see the header comment on the
       * print blend below sky(). white's gain runs 0.30 at night and 0.92 by day, so an
       * uncorrected lum 190 prints v 135 at midnight and v 184 at noon, and on a body whose
       * illumination does not change with the clock that swing is a lie. 0.20 holds the near-field
       * mass to v 135-160 across the whole cycle, measured; it is not the 0.37 that would hold it
       * exactly, because the frame also has to look like a frame at each hour and the print's own
       * hot census sits at 2.1% by day and 0.1% at night. */
      var nl = (150 + 62 * base) * (1 - 0.20 * dMix);
      if (dNight > 0.5 || (dNight > 0 && hv < dNight))
        /* EARTHSHINE, and it is a hue rotation at constant printed value rather than a dimming.
         * azure at lum 44-70 prints v 121-144; white at lum 150-212 prints v 124-141. They are the
         * same picture in a different colour, which is exactly what "the luminance divided by
         * about eight, in a swatch with three times the gain" comes out as. It is also what makes
         * the day/night handover safe: a cell that crosses the crossfade threshold changes hue and
         * does not change brightness, so it contributes nothing to the flicker census.
         *
         * Three quarters azure and a quarter pure, split on brightness rather than on a second
         * hash. Straight azure over the whole ground came out as one flat blue, which reads as
         * the CITY's screenlight; earthshine is blue-WHITE, and putting the neutral highlight on
         * the cells that are already the brightest is both what a colour temperature gradient does
         * and what stops the plain looking like it is lit through glass.
         *
         * PURE AND NOT ICE, which is what was tried first. ice is (90,240,255) — a saturated cyan
         * — and at a quarter of the ground it turned the night frame teal, which is the same
         * greyscale-test failure the star field had one function over. pure is neutral, and at
         * lum 52-72 it prints v 132-148, the same band azure lands in at lum 44-70, so this is a
         * hue change at constant luminance and costs nothing at either census. */
        return base > 0.72 ? fset(ch, P.pure, 52 + 26 * base)
                           : fset(ch, P.azure, 44 + 26 * base);
      return fset(ch, P.white, nl);
    }
    /* The far ramp. +0.62 lum per metre in both modes, which is what cancels the depth bucket over
     * 40-125 m; past the cliff it is a constant that prints the same value back in bucket 0. The
     * bases and the 0.90 floor are set so the DIMMEST cell of the range still clears the muddy
     * ceiling at every distance: measured off the LUT, pure comes out v 133-178 and azure v 122-150
     * from 40 m to 240 m, and neither ever lands in 9-119. Bases of 84 and 56 were tried first and
     * put the bottom of both ranges at v 114-117 at 120 m — i.e. the far field went muddy exactly
     * where this world is claiming there is no aerial perspective. */
    if (dNight > 0.5 || (dNight > 0 && hv < dNight))
      return fset(ch, P.azure, (dist < CLIFF ? 70 + dist * 0.62 : 60) * (0.90 + 0.26 * base));
    return fset(ch, P.pure, (dist < CLIFF ? 96 + dist * 0.62 : 88) * (0.90 + 0.26 * base));
  }

  /* A specular return: a facet of glass or a fracture plane catching the sun square. `pure` is hot
   * from lum 101 up, which makes it the most dangerous swatch in the table — a dense field of it
   * would blow past the print's 3.5-5% hot target immediately — so every caller of this is rate
   * limited to a few percent of what it paints, and the callers are counted in the report. */
  function specSet(ch, base, dist) {
    /* Earthshine specular is the same swatch at a twelfth of the drive, not a different one. `ice`
     * was tried here and it is the third time in this file that a saturated swatch had to come
     * back out: at 8% of the painted ground it turned the night frame teal. pure at lum 78-112
     * prints v 155-180, so the glint still sits clearly above the v 132-148 the earthshine surface
     * lands at, and it is the only thing in a night frame that reaches the print's hot band. */
    if (dNight > 0.5) return fset(ch, P.pure, 78 + 34 * base);
    return fset(ch, P.pure, (dist < CLIFF ? 186 + 50 * base : 150 + 40 * base));
  }

  /* ---- THE TERMINATOR IS A STEP -------------------------------------------------------------------
   * surf_west.js deliberately made its sun response CONTINUOUS with a 0.62 slope, and it explains
   * why at length: with the sun off-axis its two street walls sit at +-0.48 of the sun vector, and
   * a three-bucket version put both of them in the same bucket. That repair was correct there and
   * is wrong here. The sun subtends 0.0093 rad and there is no fill light of any kind, so the
   * boundary between lit and unlit on a curved rock is a hard line ABOUT ONE CELL WIDE. A slope of
   * 3.0 pushes the same +-0.48 apart to 0.00 and 1.00 instead of the frontier's 0.20 and 0.80.
   *
   * SUN_BACK is 0.00 and not the frontier's 0.10, because an unlit lunar face genuinely is a hole:
   * no sky to fill it, no atmosphere to bounce into it. It reads anyway, and it reads because its
   * EDGE is razor-sharp against pure at v 219-234 next to it. Contrast does the work that fill does
   * in the other two worlds, and it costs zero cells.
   *
   * AT NIGHT THE STEP GOES SOFT, and that is the only lighting cue that separates the two states.
   * Earth subtends 1.9 degrees, so it casts a 1.9-degree penumbra — 33 cm of soft edge at 10 m from
   * a 1 m rock, two or three cells at character resolution. Slope 1.2 and a back term of 0.18. */
  var SUN_FRONT = 1.00, SUN_SIDE = 0.34;
  function sunOf(cell) {
    var back = 0.18 * dNight;
    if (!cell || cell.faceX === undefined) return SUN_SIDE + (0.5 - SUN_SIDE) * dNight;
    /* The face crossed by a ray stepping +side has its outward normal pointing -side. */
    var nx = cell.faceX ? -cell.side : 0, nz = cell.faceX ? 0 : -cell.side;
    var d = nx * SUN_X + nz * SUN_Z;
    var slope = 3.0 + (1.2 - 3.0) * dNight;
    var f = clamp(0.5 + slope * d, 0, 1);
    return back + (SUN_FRONT - back) * f * f * (3 - 2 * f);
  }

  /* ---- what an unlit face returns -----------------------------------------------------------------
   * The house rule at core.js:363 is that `shadow` sits at gain 0.80 rather than 0.60 because "the
   * near facades that are in shadow stop being mass and become holes". ON THE MOON THAT RULE
   * INVERTS, but only past 25 m, because past 25 m a lunar shadow genuinely IS a hole.
   *
   * Inside 25 m it is not, and that is real rather than a hedge: Apollo shadows are demonstrably not
   * black in the near field, because the surrounding regolith is a diffuse hemispherical reflector
   * and bounces a little light in. Eight percent density at v 22-33 keeps the near ground from
   * becoming a void the eye reads as a missing polygon.
   *
   * THE FILL IS `slate` AND NOT `shadow`, WHICH IS NOT WHAT THE DESIGN ASKED FOR, and the reason is
   * the day ladder. shadow's gain runs 0.80 at night and 0.46 by day, so a fill written at lum 24
   * prints v 26 at midnight and v 8 at noon — i.e. it falls below the print's own black threshold
   * and the near-field fill silently disappears exactly when core.js blends EXPOSURE_DAY in. slate
   * runs 0.60 and 0.78, near enough the same number, so at lum 16-24 it prints v 24-33 at night and
   * v 19-27 by day and holds still. This is also one of the three sanctioned uses of slate in this
   * world (the others are the faintest stars and the flank of a distant massif); it is a few percent
   * of cells and never a surface. */
  function darkFace(dist, hv) {
    if (dist >= 25) return fset(0, P.shadow, 0);
    if (hv > 0.08) return fset(0, P.shadow, 0);
    return fset(hv < 0.03 ? G_DOT : G_COMMA, P.slate, 16 + hv * 96);
  }

  /* ---- the three surfaces, and the third one is not an object ------------------------------------
   * city.js's style 7 is regolith and style 8 is rock. They are not two materials so much as two
   * SCALES of the same one: rock is a coherent block with fracture planes and a hard rim, regolith
   * is the powder that block breaks down into, and the difference the eye actually reads at
   * character resolution is the shape of the top edge — a rock has a hard one, a mound of fines
   * does not.
   *
   * STYLE 9 IS NEITHER, AND IT IS THE ONE THE MAP ADDED. A swell lot is EMPTY: its whole height is
   * the plain being higher than the plain beside it, so what the ray hits is not the flank of an
   * object but a stretch of GROUND stood on end by the projection. Painted as row 7 — which is what
   * this file did until the third row existed — every mound in the world came back with regolith's
   * fill 0.55 and cap 0.9, i.e. as a two-metre drift of loose powder with a lit crest on it, and a
   * plain whose every rise carries a bright edge reads as a field of spoil heaps rather than as
   * rolling ground. So row 9 is the FLOOR's own numbers rather than a mound's: the fill matches
   * floorTex's own 24%-coverage regime scaled for a face seen square on, the seams are gone
   * (nothing fractures), and the cap is small enough to be a change of texture at the skyline
   * instead of a rim.
   *
   *   pitch    the lattice the face is broken up on, in metres. Rock is fractured at half a metre;
   *            regolith is smooth and only carries the coarse lumps of a mound.
   *   seamP    how much of the face is a black fracture slot. A swell is 0 and it has to be a
   *            declared 0 rather than a big pitch: at a pitch past the width of a lot the whole lot
   *            quantises to ONE seam hash, so 6% of the world's mounds would have come out entirely
   *            unpainted — a hole in the plain rather than no joints in it.
   *   glint    the share of a SOFT crest that flares as a specular. A drift of fines is 34% — the
   *            crest of a heap catches the light along its whole length. A ground swell is 8%: the
   *            top of a ground wave has no edge to flare off at all, and at 34% every rise in the
   *            plain wore a bright line, which is the exact "spoil heap" read row 9 exists to stop.
   *   fill     how much of the lit face is painted at all. This is the DENSITY that carries the
   *            tone, and it is the whole difference between a lit basalt block (nearly solid) and a
   *            drift of fines (half painted, and its grey comes from the holes). 0.44 on the swell
   *            against regolith's 0.55: a rise in the plain must not print BRIGHTER than the plain,
   *            or the eye reads it as a different material, and 0.44 is the value at which the two
   *            match at the mound's foot — measured against floorTex's own near-field 0.34 density
   *            scaled by the 1.3 the face-on geometry gains over the grazing floor.
   *   cap      the lit crest, as a fraction of one printed row — see the note on capOf below.
   *   erode    how hard the per-column notch bites the top edge (see `top` in facade). Rock and
   *            regolith arrive as boxes and need the full bite; a swell's silhouette is already the
   *            smooth top of a ground wave and a deep notch turns it back into a ruin, so it takes
   *            a third of the depth and reads as a soft, grainy horizon.
   */
  var STYLE_M = [
    /* 7 regolith */ { pitch: 1.35, fill: 0.55, cap: 0.9, hard: 0, erode: 1.00, seamP: 0.06, glint: 0.34 },
    /* 8 rock     */ { pitch: 0.52, fill: 0.86, cap: 1.0, hard: 1, erode: 1.00, seamP: 0.13, glint: 0.34 },
    /* 9 swell    */ { pitch: 2.60, fill: 0.44, cap: 0.4, hard: 0, erode: 0.34, seamP: 0.00, glint: 0.08 }
  ];

  /* ---- THE DITHER LATTICE IS LOCKED TO THE SCREEN, NOT TO THE WORLD ------------------------------
   * Both sibling files quantise their texture lattice by distance band and both explain why in one
   * sentence — surf_west.js:643: "at five metres one 0.48 m lattice cell spans eight screen columns,
   * so every speck of dust printed as an eight-character RUN of the same glyph and the near road
   * read as lines of text". They then pick three bands and move on, because in those worlds the
   * texture is a garnish on structure lines that carry the read.
   *
   * HERE THE TEXTURE IS THE WHOLE READ. A regolith plain and a boulder flank are dither fields end
   * to end; there are no bays, no laps, no kerbs and no window frames to hold the picture together.
   * So the first render of this file had exactly the failure that sentence describes, at both ends
   * at once: at 400x100 seed 42 the near ground and the near rock both came out as five-character
   * runs of `,,,,,` and `=====` lying in ranks, which reads as corduroy and not as powder.
   *
   * The fix is to solve for the pitch instead of picking it. A screen column subtends dist/275
   * metres at the reference grid (400 columns, fov 1.25, colsPerTan 275), so a lattice cell two
   * columns wide is 2*dist/275 metres and the pitch that gives it is 137.5/dist cells per metre.
   * The table below is that number evaluated at each band's midpoint, and it holds the run length
   * between 1.4 and 2.8 columns from 2 m to 150 m — measured, not estimated. Two columns rather
   * than one on purpose: at exactly one column the lattice is at the Nyquist limit of the grid and
   * the field crawls as the camera walks, which is worse than a short run.
   *
   * It is still a WORLD hash and it is still quantised into bands, so it is welded to the ground and
   * cannot crawl inside a band, which is the property the two sibling files were protecting. */
  var Q_D = [4, 8, 14, 22, 34, 55, 90],
      Q_V = [60, 23, 12.5, 7.6, 4.9, 3.1, 1.9, 1.2];
  function qOf(dist) {
    for (var i = 0; i < 7; i++) if (dist < Q_D[i]) return Q_V[i];
    return Q_V[7];
  }

  /* THE LIT CREST HAS TO BE ABOUT ONE PRINTED ROW TALL and the painter is not told the projection,
   * so it is derived: a row spans dist/scale metres, and `scale` is rows*0.9 in both grids the
   * project renders at — 54 at 200x60 and 90 at 400x100. 0.0145 is one row at 69, i.e. a row and a
   * quarter at the small grid and three quarters at the large one, which is the right kind of wrong:
   * a rim that is slightly too thick still reads as a rim, and one that is slightly too thin
   * disappears between two frames as the camera walks. Floored at 8 cm so a boulder two metres away
   * still gets one, and ceilinged at 1.1 m so a massif at 3 km does not get a lit cap the size of a
   * building. */
  function capOf(dist, mul) {
    var c = dist * 0.0145 * mul;
    return c < 0.08 ? 0.08 : (c > 1.1 ? 1.1 : c);
  }

  /* ---- facade -------------------------------------------------------------------------------------
   * u = metres along the face, v = metres up from the ground, and on this world "facade" means the
   * flank of a boulder, a crater lip, a rock pile or a massif. There are no buildings, no windows,
   * no signs, no coping and no storeys, so this function is a third the length of its two siblings
   * and every branch it does have is about ONE question: is this cell in the sun.
   *
   * Every hash is keyed on quantised WORLD coordinates and the lot seed, never on the camera, so a
   * rock face does not re-roll as you walk past it. */
  function facade(u, v, cell, dist, t) {
    if (v < 0) v = 0;
    weatherAt(t === undefined ? 0 : t); dayAt(t === undefined ? 0 : t);

    var sd = seedOf(cell);
    /* Three-way, and it has to be a lookup rather than the old `=== 8 ? 1 : 0` ternary: style 9
     * fell through that to row 0 and every ground swell in the world was painted as a mound of
     * loose fines with a lit crest. Anything the map has not got a row for still lands on 7, which
     * is the right degradation — an unknown lunar surface is regolith. */
    var sti = cell ? (cell.style | 0) - 7 : 0;
    var st = STYLE_M[sti === 1 ? 1 : (sti === 2 ? 2 : 0)];
    var h = cell && cell.h ? cell.h : 2;
    var sun = sunOf(cell);
    /* No `lod` variable here, unlike both sibling facades and unlike floorTex below. qOf already
     * carries the whole of what an LOD band was for on this surface — the texture is the read, and
     * there is no second, coarser structure to switch off at distance. */

    /* TWO LATTICES, and the split is the point. `hv` is the fill dither and rides the screen-locked
     * pitch above, because it is what would otherwise print as runs. The FACET structure — the
     * fracture seams below — stays on the material's own physical pitch (st.pitch, 52 cm for
     * jointed breccia and 1.35 m for a drift of fines), because the size of the blocks a rock
     * breaks into is a fact about the rock and must not change with how far away it is. Getting
     * this the other way round gives a boulder whose joints get finer as you walk toward it. */
    var q = qOf(dist);
    var hv = hash2(Math.floor(u * q), Math.floor(v * q), sd ^ 0x4D31);

    /* ---- THE TOP EDGE IS ERODED, AND IT HAS TO BE ---------------------------------------------
     * city.js gives a lot ONE height, so a boulder arrives here as a rectangular box with a dead
     * flat top, and the first render of this file was a lunar plain with a row of tower blocks
     * along the horizon: at 400x100 seed 42 the near massifs read unmistakably as buildings,
     * because a flat horizontal top edge two hundred cells long is the one thing in nature that
     * never happens and the one thing architecture always does.
     *
     * The repair is a per-column notch in the apparent height, hashed on u alone so it is welded to
     * the rock and does not crawl. TWO wavelengths and not one: a 2.4 m term sets how deep this
     * stretch of the edge is bitten into (6% to 26% of the height) and a 0.77 m term does the
     * biting, so the silhouette has both a shape and a grain. One wavelength alone gives an edge
     * that is uniformly noisy, which reads as a dither on a straight line rather than as erosion.
     * It is also why `crest` is measured from `top` and not from `h` everywhere below — the lit rim
     * has to sit on the eroded edge or it draws the box straight back on.
     *
     * st.erode SCALES THE BITE and exists for style 9. A swell arrives as a box like everything
     * else, but it is a box cut out of the GROUND, and the top of it is a ground wave that the map
     * has already smoothstepped twice — biting a fifth of the height out of that gives a mound with
     * a ragged crown, which reads as a spoil heap. A third of the depth leaves the notch doing its
     * one indispensable job, breaking the flat top edge, without inventing erosion the landform
     * does not have. */
    var top = h - h * (0.06 + 0.20 * hash2(Math.floor(u * 0.42), 0, sd ^ 0x4D78)) *
                      hash2(Math.floor(u * 1.3), 0, sd ^ 0x4D77) * st.erode;
    var crest = top - v;                     // metres below THIS column's own eroded top
    if (crest < 0) return fset(0, P.shadow, 0);

    /* ---- LIT OR NOT, AND THE TEST IS A DITHER RATHER THAN A BRANCH ----------------------------
     * `hv > sun` and not `sun < 0.5`, and this is a photosensitivity repair rather than a
     * refinement. sunOf is a STEP with slope 3.0, so for almost every face `sun` is exactly 0 or
     * exactly 1 and the two read identically — but the sun does turn, at 2*PI/420 s, and a
     * threshold branch means that when a face's dot product crosses zero EVERY CELL OF THAT FACE
     * FLIPS FROM v 130 TO BLANK IN ONE FRAME. Four axis-aligned normals, eight crossings a cycle,
     * and a whole rock face going out at once each time.
     *
     * Measured with the camera pinned over 6 s windows through the cycle, world pass only: the
     * threshold version ran 2.0 big steps/s and 2.5% in the 3-20 Hz band, against the project's
     * gates of 1.0/s and 2%. Dithering on the cell's own stable hash spreads the same handover
     * across the ~1300 frames the terminator takes to sweep a face, one cell at a time, and it
     * costs nothing in the picture: `sun` is 0 or 1 everywhere except within 0.17 rad of edge-on,
     * so the dithered band IS the one-cell-wide terminator this file exists to draw. It is the
     * same remedy west_town.js records for its windmill — spread the change, never switch it. */
    /* `tv` is a SECOND hash and it is drawn over 0..0.74 rather than 0..1, and 0.74 is exactly
     * 1 minus the ramp width below. That makes the ramp a NO-OP on a fully lit face — every cell
     * of it has edge >= 0.26 and comes out at full luminance — so the softening exists only where
     * it is needed, on the faces actually crossing the terminator. Measured at 0.86 first: a
     * quarter of every lit rock in the world came out 35% dim, which put those cells at v 112,
     * inside the muddy band, and the census moved 2.5% -> 2.7% for nothing. */
    var tv = hash2(Math.floor(u * q), Math.floor(v * q), sd ^ 0x4D33) * 0.74;
    var edge = sun - tv;
    /* THE RAMP. Measured: with a plain `sun < 0.5` branch a whole rock face stepped 73% of full
     * scale in one frame and the 3-20 Hz probe read 2.53% against a 2% gate; with the dither alone
     * every cell still made its one flip at full height and the probe barely moved. Holding the
     * first 0.26 of the ramp at 24-100% puts the flip itself at 17% of full scale, well under the
     * third-of-scale ceiling, and the worst 3-20 Hz reading across six probe windows at 1.5%. */
    var soft = edge < 0.26 ? 0.24 + 2.923 * edge : 1;
    if (edge <= 0) {
      /* The shadowed flank. One exception to the blank: the last few centimetres under the crest of
       * a HARD-edged rock still catch a grazing sliver, because the top of a fracture plane is not
       * parallel to its face. One cell, and only on rock, and only in the near field — it is the
       * difference between a black rock you can find in the frame and one you cannot. */
      if (st.hard && crest < capOf(dist, 0.7) && dist < 34 && hv < 0.34)
        return fset(G_DASH, P.slate, 26 + hv * 40);
      return darkFace(dist, hv);
    }

    /* ---- the lit crest ------------------------------------------------------------------------
     * The single most valuable line in this world, and the counterpart of surf_west.js's capping
     * board: it is the SKYLINE, and a skyline is what turns a black shape into an object. Written
     * as a specular rather than as a bright surface because it is one — a rock edge in vacuum is a
     * mirror facet a fraction of a millimetre wide and the eye reads that flare as sharpness. It is
     * drawn at every distance and every LOD for that reason. */
    var cap = capOf(dist, st.cap);
    if (crest < cap) {
      if (st.hard)
        /* THE GLYPH IS MIXED ON THE CELL'S OWN HASH and not chosen by depth into the cap alone.
         * Rendered at seed 3 frame 3000 there is a run of eighteen identical '=' along the crest of
         * a low rock ridge at fifty metres, and eighteen identical characters in a row is a RULE,
         * which is the artefact this whole pass exists to remove. The cause is underneath this
         * function and is written up in the report — adjacent rock lots in the ejecta and field
         * districts land within a few tens of centimetres of each other, and at fifty metres a
         * printed row is 0.83 m, so a real ridge with 0.4 m of relief on it genuinely does lie in
         * one row. What this file can do about it is refuse to draw that row as one character: two
         * glyphs at the top of the cap and two below it, dealt on the same stable hash the fill
         * uses, so the edge reads as broken rock rather than as a drawn line. */
        return dim(specSet(crest < cap * 0.5 ? (hv < 0.58 ? G_EQ : G_DASH)
                                             : (hv < 0.45 ? G_DASH : G_TICK),
                           0.55 + hv * 0.45, dist), soft);
      /* A mound of fines has no edge, so its crest is a fading-out rather than a flare: the
       * specular is dithered in at a third of the cells and the rest is ordinary lit surface. */
      if (hv < st.glint) return dim(specSet(G_QUOTE, hv, dist), soft);
      return dim(litSet(G_TICK, 0.7 + hv * 0.3, dist, hv), soft);
    }

    /* ---- the lit flank ------------------------------------------------------------------------
     * A mass, not a rhythm, and for exactly the reason surf_west.js gives for its lit clapboard: on
     * a world where the sun is behind the walker the lit rock IS the brightest large object in the
     * frame, and painting it as a sparse scatter of dim glyphs puts every cell of it in the muddy
     * band. The structure comes from what is NOT painted — the fracture seams below — rather than
     * from drawing lines on it.
     *
     * FRACTURE SEAMS. A block of breccia is jointed, and a joint at this sun angle is a black slot,
     * because the two faces of a joint cannot both be lit. Drawn as blanks: they cost nothing, they
     * break the mass into facets, and they are what keeps a 5 m rock from being a 5 m slab. On
     * regolith they are much rarer and shallower, because powder does not fracture. */
    if (st.seamP > 0) {
      var seam = hash2(Math.floor(u / st.pitch), Math.floor(v / (st.pitch * 1.3)), sd ^ 0x4D42);
      if (seam < st.seamP) return fset(0, P.shadow, 0);
    }

    if (hv > st.fill) return fset(0, P.shadow, 0);
    var k = hv / st.fill;                    /* NORMALISED BY THE FILL, per surf_west.js:659: tying
                                              * a cell's brightness to the same number that decided
                                              * whether it exists at all makes the whole field dim
                                              * as it thins, and collapses it into the muddy band. */

    /* One cell in forty on a lit rock is a glass-lined vug or a fresh fracture plane, and it is a
     * genuine specular. 2.5% of the painted cells of a surface that is itself a small part of the
     * frame — this is where a chunk of the print's hot budget is meant to come from. */
    if (st.hard && k > 0.962) return dim(specSet(G_STAR, k, dist), soft);

    if (st.hard)
      return dim(litSet(k < 0.30 ? G_8 : (k < 0.62 ? G_PCT : (k < 0.86 ? G_HASH : G_O)),
                        k, dist, hv), soft);
    return dim(litSet(k < 0.34 ? G_DOT : (k < 0.68 ? G_COMMA : G_TICK), k * 0.8, dist, hv), soft);
  }

  /* ---- ground -------------------------------------------------------------------------------------
   * wx/wz in metres, `dist` the radial distance to this cell. raycast.js hands these TRANSPOSED when
   * the camera has committed to a cross street, which is what CFG.swap records; the lane offset
   * below is correct either way because the transpose is applied to both coordinates.
   *
   * THERE IS NOTHING TO SHADE THE GROUND. It is one horizontal plane, and a horizontal plane faces
   * the sun whenever the sun is up, so unlike both sibling worlds this floor has no lit side and no
   * dark side and no `sunSide` term at all. What shadows it is objects, and objects belong to the
   * element files — every boulder in moon_field.js owes this floor a jet-black ellipse at
   * h/tan(SUN_ALT) along the antisolar bearing, and those shadows are free because they write
   * blanks.
   *
   * NOR DOES IT DIM AT A LOW SUN, which looks wrong and is not. A Lambertian plane at a 6-degree sun
   * would return a tenth of what it returns at 35, and every Apollo surface photograph says
   * otherwise: lunar regolith has a violently non-Lambertian photometric function with a strong
   * backscatter surge, so it is nearly as bright at grazing incidence as at normal as long as you
   * are looking down-sun — which, because the sun is behind the walk, is always. The surge itself,
   * the heiligenschein around the antisolar point, is moon_field.js's read-modify-write pass.
   *
   * WHAT A REGOLITH PLAIN IS MADE OF, in the order the cascade tests it:
   *   the bootprints   paired marks on a 0.72 m stride, either side of the route centreline
   *   the rover track  two chevron rails 2.06 m apart, on the same centreline
   *   the fines        everything else — a sparse field whose DENSITY carries the tone
   * and there is no fourth branch, because there is no water, no kerb, no boardwalk and no tarmac.
   */
  var ROUT = { ch: 0, col: 0, lum: 0, mir: 0, rip: 0, wch: 0 };
  function rset(o) {
    ROUT.ch = o.ch; ROUT.col = o.col; ROUT.lum = o.lum;
    /* mir is 0 in EVERY branch and always will be. There is no water anywhere in this world, and
     * reflectColumn skips a row entirely on m < 0.06, so raycast.js's whole reflection pass costs
     * one compare per row here and does nothing. rip and wch are meaningless without it. */
    ROUT.mir = 0; ROUT.rip = 0; ROUT.wch = 0;
    return ROUT;
  }
  function rblank() { return rset(fset(0, P.shadow, 0)); }

  /* ---- WHAT USED TO BE HERE WAS A ROAD, AND IT HAD TO GO ------------------------------------------
   * Until this pass the first two branches of the cascade below were a bootprint TRAIL held inside
   * 0.62 m of the street centreline and two rover RAILS at exactly 1.03 m either side of it, both
   * running the full length of the corridor. The comment defending them said "the prints, the two
   * rover rails and the cable run are this world's entire supply of straight lines", and the
   * argument it made — that empty ground rendered honestly reads as television static and needs
   * something that CONVERGES — is correct and is not what was wrong.
   *
   * What was wrong is that two parallel dashed rails with a churned strip down the middle of them,
   * locked to the street lattice, receding to the vanishing point, IS A ROAD. On any world. A
   * viewer looked at the frame and called it one, and the frame agrees with the viewer: the walk
   * follows corridor centrelines, so the one line the camera is guaranteed to be standing on is
   * also the one the whole lane pattern was pinned to, and the Moon came out with a carriageway
   * down it.
   *
   * THE CONVERGENCE IS REPLACED RATHER THAN DELETED, in four places, and none of them is axis
   * aligned:
   *   the rover traverse below   a CURVE, at 36 degrees to the lattice, wandering on two octaves
   *   the rille                  a CURVE, ten metres wide, the one real lunar landform that is one
   *   the ejecta rays            long streaks radiating from a point somewhere off in the plain
   *   the rolling ground itself  a horizon that undulates, which is the convergence cue the design
   *                              brief should have asked for first — terrain, not tyre tracks
   * and the bootprints move out of this file entirely: moon_ground.js's drawPrints already lays
   * them on a wandering two-octave trail and now scatters them in clusters, which is what a crew
   * that mills about a work site and detours to a boulder actually leaves. Two files drawing prints
   * on two different paths was the other half of the road: whichever one the eye picked up, the
   * straight one was underneath it. */

  /* ---- the rolling plain, and it is the same field the map's heightmap runs on --------------------
   * city.js now adds up to 2.8 m of relief to every non-street lot on two smoothstepped bilinear
   * octaves of 54 m and 23 m. Those lots arrive here as facade() hits with style 9 and are painted
   * as ground stood on end. THIS floor is what is left: the corridors, and the majority of open
   * ground whose swell fell under the map's 0.56 threshold and is therefore exactly flat.
   *
   * Flat is not the same as featureless, and the two have to AGREE ABOUT SCALE or the plain reads
   * as two unrelated fields laid over each other — mounds every fifty metres, tone varying every
   * nine. So the octave table below opens on the map's own two wavelengths and adds a third for the
   * metre scale the map cannot express. It cannot be the same field cell-for-cell: floorTex is
   * handed two world coordinates and nothing else, has no seed, no block bounds and no city to ask,
   * and the map's field is a function of all three. Matching the WAVELENGTHS is what the eye reads;
   * matching the phase is what it cannot check.
   *
   * FOUR OCTAVES AND NOT TWO, and the outer one is the reason. The caster's far plane is about 90 m
   * and the frame is 92 m deep, so a field whose longest wavelength is 54 m puts nearly two full
   * cycles inside the picture and the whole plain comes out at one tonal frequency — even, regular,
   * and as recognisable as a wallpaper repeat. The 128 m octave is longer than the frame, so what it
   * contributes is that ONE SIDE of the picture is broadly lighter than the other, which is what a
   * real plain does and what no amount of finer noise can imitate.
   *
   * The weights fall off with the wavelength because that is what a real surface's power spectrum
   * does, and none of them is allowed to dominate: measured, at 0.68 on the coarse term (the map's
   * own weighting, which is right for a HEIGHT field where the fine octaves are detail on a shape)
   * the 128 m term alone decided the density and the plain came out as broad bands with no grain on
   * them at all.
   *
   * IT ALSO RETURNS ITS GRADIENT, analytically and for about six extra multiplies, because the
   * gradient is what buys the slope shading below and a finite difference would cost a second whole
   * evaluation. */
  var SW_LAT = [128.0, 54.0, 23.0, 9.0], SW_W = [0.26, 0.32, 0.26, 0.16],
      SW_SALT = [0x4D71, 0x4D7B, 0x4D85, 0x4D8F];
  var swVal = 0, swGX = 0, swGZ = 0;
  function swellOf(wx, wz) {
    var v = 0, gx = 0, gz = 0, o;
    for (o = 0; o < 4; o++) {
      var lat = SW_LAT[o], w = SW_W[o], sl = SW_SALT[o];
      var qx = wx / lat, qz = wz / lat;
      var i0 = Math.floor(qx), j0 = Math.floor(qz);
      var fx = qx - i0, fz = qz - j0;
      var sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
      /* d/df of the smoothstep. It is what makes the gradient continuous across a lattice line —
       * the plain lerp's gradient is not, and a discontinuous gradient prints as a 54 m grid of
       * tonal creases, which is a straight line and is the thing this whole pass is removing. */
      var dx = 6 * fx * (1 - fx) / lat, dz = 6 * fz * (1 - fz) / lat;
      var a = hash2(i0, j0, sl), b = hash2(i0 + 1, j0, sl),
          c = hash2(i0, j0 + 1, sl), d = hash2(i0 + 1, j0 + 1, sl);
      var ab = a + (b - a) * sx, cd = c + (d - c) * sx;
      v += w * (ab + (cd - ab) * sz);
      gx += w * (((b - a) + ((d - c) - (b - a)) * sz) * dx);
      gz += w * ((cd - ab) * dz);
    }
    swVal = v; swGX = gx; swGZ = gz;
  }

  /* ---- HOW MUCH A SLOPE IS ALLOWED TO CHANGE THE TONE ---------------------------------------------
   * The header of the floor section says this plane does not dim at a low sun, and that is still
   * right: regolith is violently non-Lambertian with a backscatter surge, so a flat plain viewed
   * down-sun is nearly as bright at a 6-degree sun as at 26. A SLOPE is the other question, and it
   * does matter, because a slope changes the incidence rather than the phase angle.
   *
   * The arithmetic. Tilting a surface by theta toward the sun takes the incidence from 90-alt to
   * 90-alt-theta, so a Lambertian return changes by sin(alt+theta)/sin(alt), i.e. by about
   * theta/tan(alt) for small theta. swellOf's gradient reaches 0.034 per metre at its extreme and
   * the relief it stands for is the map's own 2.8 m over a unit of the field, so theta tops out
   * near 0.095 rad — which at the middle of the Apollo altitude band (tan 0.255) would be a 37%
   * swing on the very steepest ground the field has.
   *
   * A THIRD OF THAT IS WHAT GETS DRAWN. The opposition surge retires most of the incidence term at
   * the small phase angles a down-sun camera sees, and at the full Lambert figure the plain came
   * out looking like corrugated iron: the 9 m octave alone was throwing 25% density steps between
   * adjacent metres of ground.
   *
   * WHAT SLOPE_K 3.9 ACTUALLY DELIVERS, measured over 400k uniform world samples rather than read
   * off the endpoints — |grad| is p50 0.0098, p90 0.0183, p99 0.0257, max 0.0339, so SLOPE_K*|grad|
   * is 0.038 / 0.071 / 0.100 / 0.132. With the altitude term at its 1.9 ceiling the extreme reaches
   * 0.251. That is a swing of +-4% on typical ground, +-10% on the steepest one percent, and +-25%
   * on the single worst sample in four hundred thousand — NOT the +-20% the previous version of
   * this paragraph claimed for the whole stack, which was an endpoint sum and not a distribution.
   *
   * THE +-0.45 CLAMP THEREFORE NEVER FIRES, and it is kept and documented rather than deleted. It
   * exists to hold the invariant that no single cell of the field may be driven to zero or to
   * double — a density that reaches zero is a hole in the plain and a hole reads as a shadow with
   * nothing casting it — and it sits 0.20 above the worst measured value so that a future octave
   * table with more power in it cannot break the invariant silently. It is a guard, and the
   * distribution below it is untouched.
   *
   * The altitude term is the 1/tan(alt) above, normalised at the band's midpoint and clamped to
   * 0.6..1.9 so that the shading strengthens toward the ends of the clock — which is the whole
   * reason Apollo flew at a low sun — without a 6-degree sun quadrupling it into the corrugation.
   *
   * IT IS NOT GATED ON THE DAY MIX AND IT RUNS AT NIGHT, at SLOPE_G 1.04 — because SUN_ALT
   * crossfades to EARTH_ALT 0.24 and 0.255/tan(0.24) is 1.04. That is correct rather than an
   * oversight: the night key here is EARTHSHINE, a real directional light from a disc fixed 14
   * degrees above the horizon, and ground tilted away from it is genuinely darker. This is a
   * LIGHTING term, not a daylight scale, so the contract's "every daylight scale is the identity at
   * night" does not reach it. What it costs the tuned night baseline is measurable and it is
   * nothing: seed 42 frame 900 at 213x67, SLOPE_K 3.9 against SLOPE_K 0 — night 3.8 / 1.64 / 168
   * against 3.8 / 1.65 / 168, noon 3.3 / 2.84 / 190 against 3.3 / 2.85 / 190. The term moves
   * coverage from one side of a swell to the other and leaves the mean alone by construction, which
   * is exactly what a census cannot see and the eye can. */
  var SLOPE_K = 3.9, SLOPE_G = 1;

  /* ---- THE ROVER TRAVERSE -------------------------------------------------------------------------
   * Same two ruts 2.06 m apart, and nothing else about it is the same.
   *
   * IT IS OBLIQUE. TRK_AZ 0.62 rad is 36 degrees off the lattice, and it is not a round fraction of
   * anything: the corridors run along +z and +x, the walk follows them, so a traverse at 36 degrees
   * enters the frame from one side and leaves by the other instead of running away to the vanishing
   * point. That is the single change that stops it reading as a carriageway.
   *
   * IT WANDERS, on two octaves of 78 m and 29 m carrying +-13 m and +-7 m. Tens of metres, per the
   * brief, and the ratio matters more than either number: one octave alone gives a sine wave, which
   * is as recognisably artificial as a straight line. The second octave was +-4.5 m first and the
   * render said it was not enough — a traverse crossing the frame at 60 m has its whole visible
   * length inside one screen row, so a wander of four metres is invisible and what the eye gets is
   * a rail. At +-7 m on a 29 m wavelength the same crossing visibly bows.
   *
   * IT RECURS, on a 128 m cross-track pitch, because one traverse in an infinite plain is one the
   * camera almost never stands near. 128 m against the caster's ~92 m far plane means the frame
   * usually holds one crossing and sometimes none, which is the right frequency for "a rover came
   * through here" rather than "this is a road network". Each copy takes its own noise phase off its
   * own index, so they are not parallel curves — parallel is a straightness cue on its own.
   *
   * ONLY THE NEAREST COPY IS TESTED, and that is exact rather than an approximation. trkWander's
   * two octaves carry +-13.0 and +-7.0 (26.0 and 14.0, halved), so the wander is bounded by 20.0 m
   * — measured over 200k samples the realised extremes are -19.32 and +18.34 — against a pitch of
   * 128. Copy k's centreline therefore never leaves the band k*128 +- 20; a point whose cross-track
   * coordinate rounds to k is at most 64+20 = 84 m from copy k's centre and at least 64-20 = 44 m
   * from any other's, and the whole double rut spans under 3 m even with the resolution floor below
   * widening it. No second copy can ever be the near one. The previous version of this paragraph
   * wrote the bound as 17.5 m and got 81.5 / 46.5; the conclusion survives, but the arithmetic did
   * not match trkWander and the next person to touch TRK_PITCH would have trusted it.
   *
   * THE RUT WIDENS WITH DISTANCE and that is the flicker gate, not an aesthetic. A ground cell's
   * world footprint at distance d is about d/170 metres across at this grid, so past 60 m a 0.34 m
   * rut is narrower than the sampling and the line breaks into dashes that reshuffle as the camera
   * walks — a v-140 cell switching against a lum-0 background, which is the one thing this world
   * cannot afford. Floored at the real 0.17 m half-width and grown at 0.0035*d, so it is physical
   * inside 50 m and a resolution floor outside it. This is capOf's argument applied to a line
   * instead of to a crest. */
  var TRK_AZ = 0.62, TRK_SIN = Math.sin(TRK_AZ), TRK_COS = Math.cos(TRK_AZ);
  var TRK_PITCH = 128.0, TRK_HALF = 1.03;

  function trkWander(a, k) {
    return (CC.vnoise(a * 0.0128 + k * 7.3, 0x4D86) - 0.5) * 26.0 +
           (CC.vnoise(a * 0.0345 + k * 3.1, 0x4D87) - 0.5) * 14.0;
  }

  /* ---- THE RILLE ----------------------------------------------------------------------------------
   * A sinuous rille is a collapsed lava tube: a shallow channel a few hundred metres wide on the
   * real Moon, taken here at eleven metres because the frame is 92 m deep and a landform wider than
   * the view is not a landform, it is a change of ground level. It is in this file for one reason
   * beyond being real — IT IS A CURVE THAT CONVERGES. An open plain with no converging line has no
   * perspective, the old rails were the wrong answer to that, and a channel meandering across the
   * middle distance is the right one: it is a line, it goes somewhere, and it is not straight.
   *
   * IT IS PAINTED, NOT DUG. The heightmap has no negative heights and this file cannot make one, so
   * what is drawn is what a shallow depression looks like rather than what it is: fewer fines on the
   * floor (the walls shed their fines into it and the floor is swept coarse), a bright lip on the
   * rim the sun is behind, and a dark one on the rim it is in front of. That is enough — at the
   * grazing incidence this ground is seen at, a channel is a tonal band with two edges anyway.
   *
   * 330 m pitch, so it is in frame perhaps one walk in three, which is the right rarity for the
   * biggest single feature the ground has. The same nearest-copy argument as the traverse holds
   * with more room: 50 m of wander against a 165 m half-pitch. */
  var RIL_AZ = -0.44, RIL_SIN = Math.sin(RIL_AZ), RIL_COS = Math.cos(RIL_AZ);
  var RIL_PITCH = 330.0, RIL_HALF = 5.5;

  function rilWander(a, k) {
    return (CC.vnoise(a * 0.0048 + k * 5.7, 0x4D88) - 0.5) * 76.0 +
           (CC.vnoise(a * 0.0135 + k * 2.9, 0x4D89) - 0.5) * 24.0;
  }

  /* ---- EJECTA RAYS --------------------------------------------------------------------------------
   * The one pattern a mare surface carries at kilometre scale, and the cheapest large-scale tone
   * variation available: a fresh impact throws fines out along preferred azimuths and they land as
   * long pale streaks, brighter than the surface they land on because they are unweathered and
   * unpacked. Tycho's are visible from Earth with the naked eye.
   *
   * WHY THEY ARE WORTH THE HASHES. Everything else on this floor varies at 9-54 m. Rays vary at 200,
   * and they RADIATE, so they put a set of lines into the frame that all point at the same place —
   * convergence, again, from terrain rather than from tyres, and this time convergence on a point
   * that is usually off the side of the picture rather than at the vanishing point.
   *
   * ONE SOURCE PER 300 m CELL AND ONLY THE NEAREST IS TESTED. A point is within 212 m of its own
   * cell's source, inside RAY_LEN, and ignoring the further sources costs nothing but a few rays
   * that would have crossed — which is the direction to err, since crossing ray systems is what
   * turns a plain into plaid.
   *
   * 300 m AND NOT THE 190 THIS WAS FIRST WRITTEN AT. Rendered as a plan over a square kilometre,
   * 190 m put a starburst every 190 m in a visible grid of them — the lattice the whole pass exists
   * to hide, drawn in the one feature that was supposed to be at a scale above it. At 300 m against
   * the caster's 92 m view radius a frame holds a few rays of ONE system and never the middle of it,
   * which is what a ray looks like from inside one: a pale streak going somewhere, not a firework.
   *
   * THE AZIMUTH IS A DIAMOND ANGLE AND NOT AN ATAN2. dz/(|dx|+|dz|), folded into -2..2 over the
   * full circle, is monotone in the true bearing and costs a divide. It is not proportional to it —
   * a ray's angular width varies by up to 11% around the circle — and nothing here can tell the
   * difference. floorTex runs six thousand times a frame and an atan2 in it is a quarter of a
   * millisecond for a number that only ever gets floored.
   *
   * THE SECTOR EDGES ARE FEATHERED, which is not decoration. A hard-edged sector is a straight line
   * radiating from a point, i.e. exactly the artefact this pass exists to remove, and it would be a
   * straight line whose position depends on nothing the eye can attribute. Tapered linearly to zero
   * across the outer third of the sector on each side. */
  var RAY_Q = 300.0, RAY_IN = 26.0, RAY_LEN = 340.0, RAY_SECT = 8.5;

  /* ---- THE CRATERS, AND THEY ARE THE MOST VALUABLE THING ON THIS FLOOR ----------------------------
   * city.js's crater branch builds the ones with a RIM you can walk round, 3 to 20 m across. It
   * cannot build the small ones, because a 1 m crater is smaller than a lot and the heightmap has no
   * negative heights — height 0 is the floor and the route walker requires it. But a real mare
   * surface is saturated with them: every square metre of regolith has been turned over by impacts
   * and the ground is pitted at every scale down to the millimetre.
   *
   * They matter here for a reason that is nothing to do with realism. A plain with no shadow in it
   * has no scale, and the eye cannot tell whether the texture is two metres away or two kilometres.
   * A bowl is a scale reference that costs four hashes and a square root, because HALF OF IT IS
   * DARK — the inner wall on the sun's side faces away from the light and is a hole, and the far
   * wall is in raking light and is the brightest thing on the ground. One crater tells you where the
   * light is, which way is down, and how big a metre is.
   *
   * AND THEY DO NOT READ AS CIRCLES, which is worth writing down because the obvious reaction to the
   * render is that they are not working. The ground plane is foreshortened by dist/eyeY: at 8 m one
   * screen row spans 0.42 m of depth and one column spans 0.029 m, so a 1.5 m bowl is 50 columns
   * wide and 4 rows tall. What lands in the frame is a wide flat band with a dark half and a pale
   * half, not a ring — which is what a crater at boot height actually looks like, and it still does
   * the two jobs it is here for: relief, and scale.
   *
   * ---- THE VISIBILITY LAW REPLACES THE OLD 22 m CUT ------------------------------------------
   * The previous version drew craters at lod 2 only and defended the cut: "past 22 m a 1 m crater is
   * under a screen cell across, so its lit and dark halves land in the SAME cell and that cell
   * switches between v 150 and v 0 as the camera walks". The measurement is right; the CONSTANT is
   * the wrong shape, because what it is really saying is that a bowl has to be big compared to a
   * ground cell, and a ground cell grows as the square of the distance (a screen row spans
   * dist*dist/(scale*eyeY) metres of depth, which is the badly foreshortened axis and the one the
   * bowl's terminator lies across).
   *
   * So the rule is r >= dist*dist/CVIS, and CVIS 968 is chosen to REPRODUCE the old cut exactly at
   * its own boundary: the old field's smallest crater was 0.5 m and it was drawn to 22 m, and
   * 22*22/0.5 is 968. Inside 22 m the near field is therefore byte-identical in extent to what it
   * was. Outside it, craters do not stop — the small ones drop out one size at a time (a 1 m bowl
   * survives to 31 m, a 2.4 m one to 48 m) and the big lattice below carries on to 90 m and beyond.
   * That is both the honest optics and the thing the frame was missing: a crater field that stopped
   * dead at a fixed radius from the camera, in a world with no aerial perspective, was the one place
   * this ground admitted it had an LOD.
   *
   * ---- THREE LATTICES -------------------------------------------------------------------------
   * PITS: one candidate every 1.45 m, 38% taken, 0.28-1.1 m across, and this row exists because of
   *   a measurement rather than a wish. The bottom third of the frame is the ground between 3.5 and
   *   13 m, and at that range the projection is so stretched that the whole of it is a world patch
   *   about two metres wide and six deep — at one crater candidate per 5.5 m there is a 17% chance
   *   of ANY crater being in it, so five frames out of six had a near field with no relief in it at
   *   all, which is the television-static failure exactly. A 1.45 m lattice puts three or four pits
   *   in the same patch. The visibility law retires them on its own between 12 and 22 m, which is
   *   where the next lattice up takes over, so nothing is drawn that the grid cannot resolve.
   * SMALL: one candidate every 5.5 m, 42% taken, 0.5-2.4 m across. The pitting. Unchanged.
   * LARGE: one every 27 m, 26% taken, 3.2-11 m across. These are the ten-metre bowls the mid field
   *   can carry, and the visibility law is what makes them affordable: an 11 m bowl is legible to
   *   103 m, so the middle distance now has relief in it instead of being an even speckle.
   *   The two lattices are independent and overlap freely, which is what a saturated surface does —
   *   small craters land inside big ones and the big one's rim is pitted.
   *
   * ---- CHAINS AND DOUBLETS --------------------------------------------------------------------
   * Secondaries — debris thrown out of a primary impact, falling back at a few hundred metres a
   * second — land in STRINGS, and a line of three or four equal bowls on a common bearing is one of
   * the most recognisable things on the lunar surface. 22% of the small craters and 14% of the large
   * ones are chains of four, on a bearing off a 16-entry direction table, at 2.35 radii spacing,
   * each member independently scaled to 62-92% so the string is not a rubber stamp. The member a
   * sample belongs to is found by rounding its projection onto the chain axis, so a chain costs one
   * extra hash and a dot product rather than four times the work.
   *
   * ---- AGE ------------------------------------------------------------------------------------
   * A crater's whole appearance is its age, and there are three:
   *   fresh  (26%)  deep and steep, so more of it is in shadow; and it carries an EJECTA HALO —
   *                 an annulus of unweathered fines out to 1.95 radii that is markedly paler than
   *                 the surface around it, which is why young craters photograph as bright spots.
   *                 The halo is a density boost handed to the fines branch, not a branch of its
   *                 own, so it has no edge anywhere and cannot flicker.
   *   mature (52%)  as before.
   *   old    (22%)  slumped almost flat: the shadow line drops to where only the deepest part of
   *                 the bowl is dark, and what is left reads as a shallow dish. This is most of
   *                 what an old mare surface is actually covered in.
   * and 11% of all of them, independently, have a DARK FLOOR — a bowl deep enough to hold shadow at
   * this sun angle, or one that punched through the fines into basalt. Drawn as an absence with a
   * few slate specks, which is what it costs.
   *
   * The direction table is 16 fixed unit vectors rather than a cos/sin pair per cell: this runs
   * inside the 42%-of-cells branch, six thousand cells a frame, and a chain bearing quantised to
   * 22.5 degrees is not something the eye can measure off a bowl string four members long. */
  var CVIS = 968.0;
  var CDIR_X = [], CDIR_Z = [];
  (function () {
    for (var i = 0; i < 16; i++) {
      var a = i * 0.3926990817;              // 2*PI/16
      CDIR_X.push(Math.cos(a)); CDIR_Z.push(Math.sin(a));
    }
  })();

  /* Out-param: the ejecta-halo density boost for the cell just tested. Reset by every caller before
   * the call, exactly like FOUT/ROUT — nothing in this file allocates inside a frame. */
  var CR_HALO = 0;

  function bowl(wx, wz, dist, q, roll, cq, rmin, rvar, take, chainP, salt) {
    /* The cheapest reject there is, and it is EXACT rather than an LOD: the visibility law below is
     * monotone in the radius, so a lattice whose LARGEST crater cannot be resolved at this distance
     * cannot contribute a single cell. One compare in place of six hashes and a square root, and it
     * retires the pit lattice at 23 m, the small one at 48 and the large one at 103 — which over a
     * whole frame is most of the ground plane skipping most of this function. */
    if ((rmin + rvar) * CVIS < dist * dist) return null;
    var ci = Math.floor(wx / cq), cj = Math.floor(wz / cq);
    var h1 = hash2(ci, cj, salt);
    if (h1 >= take) return null;
    var cr = rmin + rvar * (h1 / take);
    var ccx = (ci + 0.16 + 0.68 * hash2(ci, cj, salt ^ 0x0101)) * cq;
    var ccz = (cj + 0.16 + 0.68 * hash2(ci, cj, salt ^ 0x0202)) * cq;
    var ddx = wx - ccx, ddz = wz - ccz;

    var hc = hash2(ci, cj, salt ^ 0x0303);
    if (hc < chainP) {
      var di = (hc / chainP * 16) | 0; if (di > 15) di = 15;
      var cdx = CDIR_X[di], cdz = CDIR_Z[di];
      var step = cr * 2.35;
      /* Four members at -1..2, so the string is not centred on the lattice cell and the lattice
       * cannot be read off it. Clamped rather than wrapped: outside the string the sample simply
       * belongs to the nearest end member and falls outside its radius a moment later. */
      var j = Math.round((ddx * cdx + ddz * cdz) / step);
      if (j < -1) j = -1; else if (j > 2) j = 2;
      ddx -= cdx * step * j; ddz -= cdz * step * j;
      cr *= 0.62 + 0.30 * hash2(ci * 31 + j, cj, salt ^ 0x0404);
    }

    /* The visibility law, applied AFTER the chain has scaled the radius, because a chain member is
     * the thing that has to be legible and it is smaller than the crater it was derived from. */
    if (cr * CVIS < dist * dist) return null;

    var rd = Math.sqrt(ddx * ddx + ddz * ddz);
    var age = hash2(ci, cj, salt ^ 0x0505);
    if (rd > cr) {
      /* Outside the rim: nothing to draw, but a fresh crater hands the fines branch a halo. */
      if (age < 0.26 && rd < cr * 1.95)
        CR_HALO = 0.62 * (1 - (rd - cr) / (cr * 0.95));
      return null;
    }

    var fac = rd > 1e-4 ? -(ddx * SUN_X + ddz * SUN_Z) / rd : 0;
    /* WHERE THE TERMINATOR SITS INSIDE THE BOWL IS THE SUN'S ALTITUDE, and it is one of the two
     * places in this file where the altitude does visible work. A 6-degree sun leaves five sixths
     * of a bowl in shadow; a 26-degree sun leaves a bit over half. That swing is the whole
     * difference between the two ends of the clock on this world. Age shifts it: a fresh bowl is
     * steep and holds more shadow, a slumped one barely shadows itself at all. */
    var lip = 0.62 - 1.5 * (SUN_ALT - ALT_LO) + (age < 0.26 ? 0.12 : (age > 0.78 ? -0.44 : 0));
    var cg = hash2(Math.floor(wx * q), Math.floor(wz * q), salt ^ 0x0606);
    var rn = rd / cr;

    /* The dark floor. Independent of age, and drawn before the terminator test so it takes the
     * whole bowl and not half of it — the point of it is a black disc with a pale rim round it. */
    if (rn < 0.52 && hash2(ci, cj, salt ^ 0x0707) < 0.11)
      return (dist < 25 && cg < 0.07) ? rset(fset(G_DOT, P.slate, 16 + cg * 96)) : rblank();

    if (fac < lip) {
      /* The shadowed wall, and the near-field fill is the same slate as darkFace's for the same
       * reason: it is a hole, but a hole two metres from your boot is not black. A grazed lip on
       * this side was tried and taken out again: it sits astride the sweeping shadow line and so
       * switches every cell it owns as the day turns, which is the one thing this world's
       * background luminance makes unaffordable. */
      return (cg < 0.07) ? rset(fset(G_DOT, P.slate, 16 + cg * 96)) : rblank();
    }
    /* The same ramp facade() uses, for the same measured reason: `lip` moves with the sun's
     * altitude and `fac` with its bearing, so a bowl's shadow line sweeps across the ground as the
     * day turns, and every cell it crosses would otherwise step the full height of a lit ground
     * cell in one frame. A cell takes about 20 s to cross the 0.30 band. Only reached with
     * fac >= lip, so it can never go under its own 0.24 floor. */
    var cs = fac - lip < 0.30 ? 0.24 + 2.533 * (fac - lip) : 1;
    /* The lit wall, and its RIM. Denser than the plain around it — a fresh bowl exposes unweathered
     * fines and they are markedly brighter, which is why young craters photograph as pale spots —
     * and denser again over the outer sixth, which is the raised lip of ejecta the impact piled up.
     * `roll` is the ground's own rolling-material term, passed in rather than re-derived: a bowl
     * sitting on a swept crest has less loose material in it to catch the light than one in a
     * hollow, which is what "the crater field is interrupted by the crests" comes out as when it is
     * written continuously instead of as a switch. */
    var fillC = (age < 0.26 ? 0.92 : (age > 0.78 ? 0.52 : 0.76)) * roll;
    if (rn > 0.84) fillC *= 1.35;
    if (cg < fillC)
      return rset(dim(litSet(cg < 0.3 ? G_COMMA : (cg < 0.7 ? G_TICK : G_QUOTE),
                             0.45 + 0.55 * (cg / fillC), dist, cg), cs));
    return rblank();
  }

  /* Ejecta rays — see the block comment above RAY_Q. Returns a density boost, 0 outside. */
  function rayAt(wx, wz) {
    var gi = Math.round(wx / RAY_Q), gj = Math.round(wz / RAY_Q);
    var ox = (gi + (hash2(gi, gj, 0x4D8A) - 0.5) * 0.7) * RAY_Q;
    var oz = (gj + (hash2(gi, gj, 0x4D8B) - 0.5) * 0.7) * RAY_Q;
    var dx = wx - ox, dz = wz - oz;
    var r = Math.sqrt(dx * dx + dz * dz);
    if (r < RAY_IN || r > RAY_LEN) return 0;
    var ax = dx < 0 ? -dx : dx, az = dz < 0 ? -dz : dz, sm = ax + az;
    if (sm < 1e-6) return 0;
    var oa = dz / sm;                        // the diamond angle, -1..1 in the +x half plane
    if (dx < 0) oa = oa >= 0 ? 2 - oa : -2 - oa;
    var sp = oa * RAY_SECT, si = Math.floor(sp), sf = sp - si;
    if (hash2(si, gi * 131 + gj, 0x4D8C) > 0.24) return 0;
    /* Feathered both edges. The two sectors either side of the seam at due -z both taper to zero
     * at it, so the wrap costs nothing. */
    var e = sf < 0.34 ? sf / 0.34 : (sf > 0.66 ? (1 - sf) / 0.34 : 1);
    /* In off the rim, out at the end of the throw. */
    var rk = r < RAY_IN * 2 ? (r - RAY_IN) / RAY_IN
                            : 1 - (r - RAY_IN * 2) / (RAY_LEN - RAY_IN * 2);
    /* Streaky along its length. A ray drawn solid is a wedge, and a wedge is a shape rather than a
     * spray of debris; the 22 m modulation is what turns it back into one. */
    return 0.90 * e * rk * (0.45 + 0.55 * CC.vnoise(r * 0.045 + si * 3.7, 0x4D8D));
  }

  function floorTex(wx, wz, dist, t) {
    weatherAt(t === undefined ? 0 : t); dayAt(t === undefined ? 0 : t);
    var lod = dist < 22 ? 2 : (dist < 60 ? 1 : 0);
    /* THE LATTICE PITCH IS SOLVED RATHER THAN PICKED — see the block comment on qOf. The brief's
     * pitches (6.0/2.8/1.6/0.9) were measured at 400x100 and print in runs of five to eight
     * characters over the whole ground plane, which reads as corduroy. Hoisted to the top of the
     * cascade because the craters below dither on it too. */
    var q = qOf(dist);

    /* ---- the rolling plain, once, for everything below it -------------------------------------
     * `roll` is MATERIAL: dust creeps downhill on a body with no wind and no water, so the hollows
     * are deep in fines and the crests are swept and coarse. `slope` is LIGHT: which way this piece
     * of ground is tilted relative to the sun. Keeping them apart is what makes the relief read —
     * one of them says what is there and the other says how it is lit, and a single term that did
     * both would have the crests bright on the sunward side of the world and dark on the other. */
    swellOf(wx, wz);
    var sw = swVal;
    /* THE ENDPOINTS OF A SUM OF OCTAVES ARE NOT THE FIELD, AND WRITING THEM DOWN AS IF THEY WERE
     * IS HOW THIS CONSTANT WAS GOT WRONG TWICE. `sw` is four smoothstepped bilinear octaves, so it
     * is very nearly Gaussian: measured over 400k uniform world samples its range is 0.147..0.866
     * but its middle 80% is only 0.356..0.642, and its standard deviation is 0.111. The previous
     * form, 1.55 - 1.10*sw, was documented as "0.45..1.55, a factor of 3.4" — those endpoints need
     * all four octaves at their joint extreme and are unreachable by construction. What it actually
     * delivered was a middle 80% of 0.84..1.16, A FACTOR OF 1.37, which is narrower than the field
     * it was brought in to replace was claimed to be, and the argument written above it — that a
     * spread of 2 is inside the noise of a 30% dither — condemned it.
     *
     * So the gain is set against the MEASURED spread rather than against the nominal range. At
     * 2.6 per unit of `sw` the delivered distribution is
     *       p10 0.63   p50 1.00   p90 1.37   p1 0.34   p99 1.64   floor 0.15 (0.05% of samples)
     * — a factor of 2.2 across the middle 80% and 4.8 across the middle 98%, with the mean still
     * exactly 1 because E[sw] is exactly 0.5. That is a plain with stretches that are nearly bare
     * and stretches that are nearly drifted, and unlike the old paragraph it is what the code does.
     *
     * THE FLOOR IS 0.15 AND IT IS NOT A TASTE. A coverage that reaches zero is a hole in the plain,
     * and a hole with nothing casting it reads as a shadow that is not there. 0.15 * the 0.34 base
     * is a coverage of 5%, which is the sparsest scatter that still says "ground" rather than
     * "nothing". It is reached by 0.04% of samples — one in 2600 — so it is a guard and not a
     * shaping term.
     *
     * THIS CHANGES THE NIGHT FRAME AND THAT IS DELIBERATE. The contract's rule is that every
     * DAYLIGHT SCALE must be the identity at night, and this is not one: `roll` is material, it
     * says how much dust is lying where, and dust does not move when the sun goes down. So the
     * night picture moves with the day one and is meant to. Measured, frame 900 at 213x67, the old
     * gain against this one — muddy(9-119) / hot(v>=170) / lit p90:
     *       seed 42 night   4.4 / 1.66 / 159   ->   3.8 / 1.64 / 168
     *       seed 42 noon    3.5 / 3.07 / 187   ->   3.3 / 2.84 / 190
     *       seed 42 dusk    3.6 / 2.62 / 190   ->   3.2 / 2.47 / 193
     *       seed  7 night  10.0 / 1.05 / 156   ->  11.2 / 1.05 / 155
     * On seed 42 the muddy band falls at every hour and the lit p90 rises, which is the shape a
     * wider coverage field should have: the extra tone goes into cells being present or absent
     * rather than into cells at v 60. Seed 7's night is the other direction and is the worst case
     * measured, at 11.2% against a 30% ceiling. The hot tail is unmoved on the seeds that were near
     * the 3.5-5% band (seed 7 noon 4.35 -> 4.49) and drifts a tenth on the ones that were never in
     * it. */
    var roll = 1 + (0.5 - sw) * 2.6; if (roll < 0.15) roll = 0.15;
    var slope = -(swGX * SUN_X + swGZ * SUN_Z) * SLOPE_K * SLOPE_G;
    if (slope < -0.45) slope = -0.45; else if (slope > 0.45) slope = 0.45;

    /* ---- the rover traverse -------------------------------------------------------------------
     * DRAWN PALER THAN THE GROUND AROUND IT, which is the way round that surprised the frontier too
     * and then did not: churned fines are unpacked and porous, and unpacked powder backscatters
     * more than the packed surface it was lifted out of. Drawn darker they read as two cracks;
     * drawn paler they read as tracks. Every Apollo pan shows them as the bright thing.
     *
     * CONTINUOUS AT EVERY DISTANCE — always painted, with the chevron tread carried by WHICH glyph
     * it is rather than by whether there is one. That is the property the old rails had and the one
     * thing about them worth keeping: a line that is only sometimes painted switches cells on and
     * off against a lum-0 background as the camera walks, which is the hazard west_town.js's
     * windmill failed tools/west-flicker.cjs on. */
    var ta = wx * TRK_SIN + wz * TRK_COS;    // along the traverse
    var tp = wx * TRK_COS - wz * TRK_SIN;    // across it
    var tk = Math.round(tp / TRK_PITCH);
    var to = tp - (tk * TRK_PITCH + trkWander(ta, tk));
    var tr = (to < 0 ? -to : to) - TRK_HALF; if (tr < 0) tr = -tr;
    var trw = 0.17 + dist * 0.0035;          // the resolution floor; see the block comment
    if (tr < trw) {
      /* THE TREAD IS A TEXTURE AND NOT AN ALTERNATION. The old rails carried their chevron as
       * `(floor(wz/0.34) & 1) ? '=' : '-'`, and a 0.34 m period is under one screen column past
       * 60 m: what that prints is runs of six or eight identical characters lying in ranks, which
       * is the corduroy failure qOf exists to prevent, and on a straight line it reads as a
       * painted road marking rather than as churned ground. Hashed on the screen-solved lattice
       * instead, so the run length stays between one and three columns at every distance, and
       * drawn from four glyphs rather than two so the eye reads a disturbed surface. The line is
       * still CONTINUOUS — every cell inside the rut is painted, always — which is the one
       * property of the old rails worth keeping. */
      var hr = hash2(Math.floor(ta * q), Math.floor(to * 6), 0x4D54);
      return rset(litSet(hr < 0.32 ? G_EQ : (hr < 0.58 ? G_DASH : (hr < 0.82 ? G_COMMA : G_COLON)),
                         0.40 + hr * 0.45, dist, hr));
    }

    /* ---- the rille ----------------------------------------------------------------------------
     * A tonal cross-section rather than a hole: sparse on the floor, one wall bright and the other
     * nearly blank. RIL_SUN is which of the two walls the sun is behind — the cross-channel axis
     * dotted into the key direction, computed here because it turns with the clock. */
    var rla = wx * RIL_SIN + wz * RIL_COS, rlp = wx * RIL_COS - wz * RIL_SIN;
    var rk2 = Math.round(rlp / RIL_PITCH);
    var ro = rlp - (rk2 * RIL_PITCH + rilWander(rla, rk2));
    var rw = RIL_HALF * (0.72 + 0.56 * CC.vnoise(rla * 0.019, 0x4D8E));
    var ar = ro < 0 ? -ro : ro;
    if (ar < rw) {
      var rt = ar / rw;                      // 0 on the axis, 1 at the rim
      var wl = (ro > 0 ? 1 : -1) * -(RIL_COS * SUN_X - RIL_SIN * SUN_Z);
      /* Floor swept to 45% of the plain's coverage, walls climbing back to it, and the wall the sun
       * is behind carrying up to 1.8x while the other falls to 0.2x. The break in slope at the rim
       * is left as a hard edge on purpose: a rille rim IS a break in slope, and it is a CURVE, which
       * is the whole reason this landform is in the file. */
      roll *= (0.45 + 0.55 * rt) * (1 + 0.80 * wl * rt);
    }

    /* ---- the craters --------------------------------------------------------------------------- */
    CR_HALO = 0;
    /* Finest first, because a metre-scale pit sitting inside a ten-metre bowl is a pit and not a
     * bowl — the later impact is the one on top. */
    var cout = bowl(wx, wz, dist, q, roll, 1.45, 0.14, 0.41, 0.38, 0.18, 0x4D6F);
    if (cout) return cout;
    cout = bowl(wx, wz, dist, q, roll, 5.5, 0.5, 1.9, 0.42, 0.22, 0x4D61);
    if (cout) return cout;
    cout = bowl(wx, wz, dist, q, roll, 27.0, 3.2, 7.8, 0.26, 0.14, 0x4D68);
    if (cout) return cout;

    /* ---- the fines ----------------------------------------------------------------------------
     * A SPARSE FIELD WHOSE DENSITY CARRIES THE TONE. 24% coverage, and the 76% that is not painted
     * is what makes the ground grey — a 0.11-albedo powder is dark, and the way to draw dark in
     * this print is to leave cells out, not to write dim ones. Writing this plane as a dense field
     * at lum 40-100 in slate is the single fatal mistake available in this world; it would put a
     * third of the frame in the band core.js is trying to hold under 30%, and no setting of GAMMA,
     * KNEE or SHOULDER can rescue it, because a knee can delete a shadow but never create a
     * highlight.
     *
     * THE MEAN IS UNCHANGED AND ONLY THE SPREAD HAS MOVED. The old field was one 9 m octave on a
     * lattice shorter than a stride — which is to say it varied at a scale the projection destroys
     * and by an amount the dither hides. It is now the product of four terms each centred on 1, and
     * they are quoted here as MEASURED DISTRIBUTIONS rather than as nominal endpoints, because the
     * endpoints of a sum of octaves are unreachable and quoting them is how the last two versions
     * of this paragraph came to describe a field the code did not have:
     *     roll        p10 0.63  p50 1.00  p90 1.37,  p1 0.34, p99 1.64   (four octaves to 128 m)
     *     1 + slope   p10 0.96  p50 1.00  p90 1.04 at the band midpoint; p10 0.93 p90 1.08 and
     *                 extremes 0.78..1.24 with the altitude term at its 1.9 ceiling
     *     ray boost   1..1.9 where an ejecta ray crosses, and exactly 1 everywhere else
     *     1 + CR_HALO 1..1.62 in the ejecta apron of a crater, 1 everywhere else
     * So a hollow with a ray over it runs at three times the mean and a swept crest on the shaded
     * side of a swell at a third of it, against a mean that is still exactly what it was. That is what buys a plain that
     * undulates: nothing in it is brighter than it was, there is simply somewhere for the eye to
     * find an edge. Note which term does the work — `roll` is the wide one and the slope term is
     * deliberately narrow, because one of them says what is on the ground and the other only says
     * how it is lit. */
    var dens = 0.34 * (lod === 2 ? 1 : (lod === 1 ? 0.80 : 0.55));
    dens *= 0.94 + 0.5 * wFines;             // levitated fines settle out; see weatherAt
    dens *= roll * (1 + slope) * (1 + CR_HALO);
    if (dist < RAY_LEN) dens *= 1 + rayAt(wx, wz);
    /* THE CEILING, and it is the one guard the whole product needs. Four terms centred on 1 can in
     * principle multiply out past 4, and 0.34 * 4 is a coverage over 1 — a solid white patch of
     * ground, which is not a drift of fines, it is a hole in the picture where the black should be.
     * 0.62 is the densest the eye still reads as a granular surface rather than as a fill; measured
     * over 210k ground samples at 400x100, three hours by six yaws, it is reached by 0.008% of them,
     * so the clamp is a guard rather than a shaping term and the distribution below it is untouched.
     * It is rarer than it looks because the far LOD scales the base to 0.187 and most ground samples
     * in a frame are far. */
    if (dens > 0.62) dens = 0.62;
    var d1 = hash2(Math.floor(wx * q), Math.floor(wz * q), 0x4D01);
    if (d1 < dens) {
      var k1 = d1 / dens;                    // normalised, for the reason litSet's callers all are
      /* A GLASS SPHERULE. Micrometeorite impact melts regolith into millimetre beads of glass and
       * the surface is full of them; one catching the sun square is a true specular and it is the
       * only thing on this ground that reaches the print's hot band. 8% of the painted cells, so
       * about 2.7% of ground cells, which with the ground at 40% of the frame is 1.1% hot from the
       * floor. Measured at 400x100 seed 42 the whole frame runs 2.1-2.4% hot against the build's
       * 3.5-5% target, and the shortfall is deliberate: the remainder is meant to come from the LM
       * foil, the SWC foil, the crew suit and Earth. */
      if (k1 > 0.92) return rset(specSet(G_STAR, (k1 - 0.92) / 0.08, dist));
      return rset(litSet(k1 < 0.34 ? G_DOT : (k1 < 0.68 ? G_COMMA : G_TICK), k1, dist, d1));
    }
    /* A pebble, and the one blank down-sun of it that is its shadow. Rare, near field only, and the
     * only object on this floor with an edge — which is the whole point of it: a 3 cm stone with a
     * 20 cm shadow is a scale reference, and an open plain with no scale reference in it has no
     * size. The shadow is drawn as an absence because on this world that is exactly what it is.
     * The rate rides the CREST rather than being flat: the coarse fraction is what is left where
     * the fines have crept away, so stones come out of the swept tops and not out of the drifts. */
    if (lod === 2) {
      var d2 = hash2(Math.floor(wx * q * 0.5), Math.floor(wz * q * 0.5), 0x4D03);
      if (d2 < 0.010 * (1.9 - roll)) return rset(litSet(G_o, 0.9, dist, d2));
    }
    return rblank();
  }

  /* ---- sky ----------------------------------------------------------------------------------------
   * sx is the column's world bearing quantised at CFG.skyK index units per radian; sy is the screen
   * row. Both come from raycast.js and neither is camera-relative, which is what keeps the star
   * field welded to the sky while the viewer turns round.
   *
   * THIS IS A BLACK RECTANGLE AND THAT IS THE PICTURE. surf_west.js spends thirty lines arguing for
   * a single exponential e-fold at 0.50 of the grid, because "a sky that is black above the
   * rooflines is a black rectangle with a town along the bottom" — and that argument is about a
   * world with air and half a frame of sky above a two-storey town. Here the sky IS a black
   * rectangle, the town along the bottom is five metres tall, and there is no gradient of any kind
   * to draw because there is nothing to scatter in. The light-pollution ramp in surfaces.js is
   * likewise deleted rather than softened: amber cooling to slate along the roofline is sodium lamps
   * bouncing off the underside of a haze layer, and there is no haze layer.
   *
   * WHAT IS IN IT IS STARS, AT EVERY HOUR. Stars are visible in daylight from the lunar surface —
   * there is no scattered skylight to wash them out, and the reason Apollo photographs show none is
   * film exposure set for a sunlit surface, not the sky. It is also the single most useful thing
   * this world can put in the top half of the frame and it is the cheapest output sky() has.
   *
   * AND THEY DO NOT TWINKLE, which is not an omission. Scintillation is turbulent air; a star seen
   * from the lunar surface is a perfectly steady point. That costs one hash per sky cell instead of
   * two, removes the only t-dependence the sky would have had, and removes a per-cell flicker source
   * from a frame whose background is lum 0 — where a star switching on and off is a step of 85% of
   * full scale, five times the photosensitivity ceiling. CC.reducedMotion has nothing to damp here,
   * in this function or anywhere else in this file, and that is a property of vacuum. */
  var SOUT = { ch: 0, col: 0, lum: 0 };
  function sset(ch, col, lum) {
    SOUT.ch = ch; SOUT.col = col;
    SOUT.lum = lum < 0 ? 0 : (lum > 255 ? 255 : lum | 0);
    return SOUT;
  }

  function sky(sx, sy, t) {
    weatherAt(t === undefined ? 0 : t); dayAt(t === undefined ? 0 : t);
    var C = cfg();
    var rows = C && C.rows ? C.rows : 60;
    var hor = C ? C.horizon : rows * 0.56;
    var vs = C && C.skyVScale ? C.skyVScale : 1;
    var kk = C && C.skyK ? C.skyK : (rows / 0.7);
    var sd = C ? C.skySeed : 0x5EED;

    var ey = Math.floor((hor - sy) * vs);
    var a = ey / rows; if (a < 0) a = 0;

    /* How far round from the sun this column is. There is no scattering, so this tints NOTHING; it
     * places the corona below and nothing else.
     *
     * ---- AND IT USED TO SET THE STAR DENSITY, WHICH WAS A FLICKER BUG -------------------------
     * The design asks for a star field that thins toward the sun, on the argument that looking
     * within thirty degrees of an unshielded sun in vacuum costs you your dark adaptation. That is
     * true and it is also the only t-dependence the sky would have, because SUN_AZ turns with the
     * clock — and a density that moves means the cells whose hash sits near the threshold SWITCH.
     * A star is `pure` at v 219 on a lum-0 background, so each switch is a step of 77% of full
     * scale. Measured with the camera pinned, world pass only, 6 s windows through the cycle: 2.0
     * big steps per second and 2.5% in the 3-20 Hz band, against gates of 1.0/s and 2%. It failed
     * the hard gate on the first run, exactly as the design brief predicted something would.
     *
     * So the star density is now a function of (sx, ey, seed) ALONE and the sky is provably static:
     * no term in it moves, ever, for any reason. That is also the physically better answer — the
     * dark-adaptation effect is about the observer, not the sky — and it is what makes this the
     * only painter in the project with no time dependence at all. */
    var da = sx / kk - SUN_AZ;
    da = Math.atan2(Math.sin(da), Math.cos(da));
    var away = Math.abs(da) / Math.PI;

    /* THE F-CORONA. Zodiacal light along the ecliptic is genuinely visible from the lunar surface
     * and is bright enough near the sun to photograph; drawn as a handful of faint pure cells
     * within about 0.10 rad of the sun's bearing and low in the sky, so that turning to face the
     * sun gives the frame something other than one hot disc. Perhaps thirty cells.
     *
     * WHICH cells is a static pattern; how BRIGHT they are is what follows the sun. That is the
     * same repair as the stars above, in the one place the sun genuinely has to be involved: a
     * cell's luminance ramps from 0 to 110 over the ~7 s the sun takes to cross the corona's
     * radius at 0.015 rad/s, i.e. about a quarter of a luminance unit per frame. Written the
     * obvious way round — pattern follows the sun, brightness constant — it would be the same
     * switch the star field was. */
    if (away < 0.040 && a < 0.22) {
      var hc = hash2(sx, ey, sd ^ 0x4D22);
      if (hc < 0.20 * (1 - a / 0.22)) {
        var nearK = 1 - away / 0.040;
        return sset(hc < 0.09 ? G_TILDE : G_QUOTE, P.pure, (16 + hc * 300) * nearK * nearK);
      }
    }

    /* Star density: 1.0% of cells at the horizon rising to 1.9% at the zenith, against
     * surfaces.js's city star rate of 0.75%. The elevation term survives because it is static —
     * and it is worth keeping for the composition rather than the physics: it puts the field where
     * the frame has room for it and thins it where the terrain is about to cover it anyway. */
    var p = 0.0135 * (0.55 + 0.45 * a) * 1.4;
    var hs = hash2(sx, ey, sd ^ 0x4D00);
    if (hs >= p) return sset(0, P.shadow, 0);

    var k = hs / p, h2 = hash2(sx, ey, sd ^ 0x4D11);
    /* Four magnitudes off one field. The thresholds are where they are because of the ladder rather
     * than because of the sky: pure at lum 168-230 prints v 205-228 and is the brightest thing in
     * the frame after Earth and the specular; white at lum 142-188 prints v 121-135, JUST clear of
     * the muddy ceiling, which is what a star should be — a clean point and not a smudge; and the
     * faintest magnitude is the only legitimate slate in this world outside the near-field shadow
     * fill, at v 57-70, where a handful of cells of muddy is exactly right because a sixth-magnitude
     * star IS on the edge of visibility.
     *
     * The bottom three tiers carry the same dMix correction as litSet's near field and for the
     * same reason: white's gain triples between the two ladders, and a star that gets brighter at
     * noon on a world with no atmosphere is the print talking, not the sky. `pure` does not, since
     * its gain is 0.85 on both.
     *
     * ICE IS 3% OF THE STARS AND NOT THE 17% THE DESIGN ASKED FOR, and this is the one place the
     * greyscale test caught something. The brief's tiers put `ice` on everything from k 0.80 up;
     * rendered at 400x100 that is one cell in six of the star field, ice is (90,240,255), and the
     * sky came out as a wash of teal points that read as the CITY — screenlight through a window,
     * which is the one association this world must not have. Colour in Moonwalk is allowed to do
     * work in exactly four places and none of them is a star field. Cut to k > 0.93 it is a handful
     * of blue-white first-magnitude stars per frame, which is both what Vega and Rigel look like
     * and small enough that the frame still passes the greyscale test. */
    var dm = 1 - 0.22 * dMix;
    if (k > 0.965) return sset(G_STAR, P.pure, 168 + h2 * 62);
    if (k > 0.93) return sset(G_PLUS, P.ice, (88 + h2 * 62) * dm);
    if (k > 0.34) return sset(G_DOT, P.white, (142 + h2 * 46) * dm);
    return sset(G_DOT, P.slate, (40 + h2 * 34) * dm);
  }

  /* ---- and how far you can see with no air in the way ---------------------------------------------
   * 150 m before anything fades at all, against the city's 12 and the frontier's 20, and 240 m
   * before it is gone. The absence of a gradient over the near field is the single most alien
   * property of a lunar photograph and it costs two constants.
   *
   * THE EXPONENT IS A HOLD. surfaces.js's fog() runs `Math.pow(k, fogPow)` for any painter that is
   * not the city, and 0.45 is what turns that into a curve that does almost nothing until it does
   * everything: at 200 m k is 0.44 and pow(0.44, 0.45) is 0.69, so a rock two hundred metres out
   * still prints at seven tenths, and everything inside 150 m prints at FULL luminance with no fade
   * whatsoever. This is within a percent of the `k*(2-k)` the design brief asks for, and it needs no
   * edit to surfaces.js — which matters, because surfaces.js is shared with two worlds that are
   * already tuned.
   *
   * AND THE HAZE FLOOR IS ALREADY DEALT WITH, four lines below this one. refog() used to lift far
   * cells onto a floor of `Daylight.P.sky * (0.30 + 0.55*fog) * 46`, which is aerial perspective —
   * the one thing this world does not have. surfaces.js:2728 now reads
   * `hazeFloor = (D && !(alt && alt.airless)) ? ... : 0`, so the `airless: 1` exported below turns
   * it off on this world and there is nothing left to work around. The previous version of this
   * paragraph escalated it as an open cross-file defect and asked another lane to fix something
   * that was already fixed, four lines above the flag that fixes it. */
  var FOG_START_M = 150.0, FOG_END_M = 240.0, FOG_POW_M = 0.45;

  CC.SurfMoon = {
    /* No atmosphere, so surfaces.js must not lay aerial perspective over this world — see its
     * refog(). This is the flag a painter declares rather than something the engine infers. */
    airless: 1,
                  facade: facade, floorTex: floorTex, sky: sky, STYLE: STYLE_M,
                  fogStart: FOG_START_M, fogEnd: FOG_END_M, fogPow: FOG_POW_M,
                  sunOf: sunOf, EARTH_AZ: EARTH_AZ, EARTH_ALT: EARTH_ALT };
  /* GETTERS, for the same reason surf_west.js's four are getters: these are refreshed once per
   * frame from the daylight director, and every element file that places a shadow, a lit rim or a
   * glint reads them by name. A copied value would freeze each reader at whatever the sun was doing
   * when its module happened to load. `night` is published alongside them because the moon elements
   * need the same crossfade the painters use — a hard `Daylight.P.night` test in an element would
   * snap while this file is still half way through its handover. */
  Object.defineProperty(CC.SurfMoon, 'SUN_AZ', { get: function () { return SUN_AZ; } });
  Object.defineProperty(CC.SurfMoon, 'SUN_X', { get: function () { return SUN_X; } });
  Object.defineProperty(CC.SurfMoon, 'SUN_Z', { get: function () { return SUN_Z; } });
  Object.defineProperty(CC.SurfMoon, 'SUN_ALT', { get: function () { return SUN_ALT; } });
  Object.defineProperty(CC.SurfMoon, 'night', { get: function () { return dNight; } });
  /* Self-registration: surfaces.js never learns this file's name. */
  if (!CC.SURFACES) CC.SURFACES = {};
  CC.SURFACES.moon = CC.SurfMoon;
  if (typeof module !== 'undefined') module.exports = CC.SurfMoon;
})(typeof CC !== 'undefined' ? CC : require('./core.js'));
