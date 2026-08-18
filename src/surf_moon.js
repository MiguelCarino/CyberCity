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

  /* ---- the two surfaces, and there are only two ---------------------------------------------------
   * city.js's style 7 is regolith and style 8 is rock, and nothing else exists. They are not two
   * materials so much as two SCALES of the same one: rock is a coherent block with fracture planes
   * and a hard rim, regolith is the powder that block breaks down into, and the difference the eye
   * actually reads at character resolution is the shape of the top edge — a rock has a hard one, a
   * mound of fines does not.
   *
   *   pitch    the lattice the face is broken up on, in metres. Rock is fractured at half a metre;
   *            regolith is smooth and only carries the coarse lumps of a mound.
   *   fill     how much of the lit face is painted at all. This is the DENSITY that carries the
   *            tone, and it is the whole difference between a lit basalt block (nearly solid) and a
   *            drift of fines (half painted, and its grey comes from the holes).
   *   cap      the lit crest, as a fraction of one printed row — see the note on capOf below.
   */
  var STYLE_M = [
    /* 7 regolith */ { pitch: 1.35, fill: 0.55, cap: 0.9, hard: 0 },
    /* 8 rock     */ { pitch: 0.52, fill: 0.86, cap: 1.0, hard: 1 }
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
    var st = STYLE_M[cell && (cell.style | 0) === 8 ? 1 : 0];
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
     * has to sit on the eroded edge or it draws the box straight back on. */
    var top = h - h * (0.06 + 0.20 * hash2(Math.floor(u * 0.42), 0, sd ^ 0x4D78)) *
                      hash2(Math.floor(u * 1.3), 0, sd ^ 0x4D77);
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
        return dim(specSet(crest < cap * 0.5 ? G_EQ : G_DASH, 0.55 + hv * 0.45, dist), soft);
      /* A mound of fines has no edge, so its crest is a fading-out rather than a flare: the
       * specular is dithered in at a third of the cells and the rest is ordinary lit surface. */
      if (hv < 0.34) return dim(specSet(G_QUOTE, hv, dist), soft);
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
    var seam = hash2(Math.floor(u / st.pitch), Math.floor(v / (st.pitch * 1.3)), sd ^ 0x4D42);
    if (seam < (st.hard ? 0.13 : 0.06)) return fset(0, P.shadow, 0);

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

  /* Stride 0.72 m and a 0.32 m sole: a walking human's pitch, and the reason these are drawn at all
   * is that they are the only thing on this ground that CONVERGES. The design brief spends a page on
   * it and west_range.js opens with the same sentence: empty ground rendered honestly is empty, and
   * a distance-quantised hash field with nothing straight in it does not read as a plain, it reads
   * as television static. The prints, the two rover rails and (in moon_alsep.js) the cable run are
   * this world's entire supply of straight lines. */
  var STRIDE = 0.72, TRACK = 1.03;

  function floorTex(wx, wz, dist, t) {
    weatherAt(t === undefined ? 0 : t); dayAt(t === undefined ? 0 : t);
    var C = cfg();
    var lane = wx - (C ? C.streetX : 4.0);
    var al = lane < 0 ? -lane : lane;
    var lod = dist < 22 ? 2 : (dist < 60 ? 1 : 0);
    /* THE LATTICE PITCH IS SOLVED RATHER THAN PICKED — see the block comment on qOf. The brief's
     * pitches (6.0/2.8/1.6/0.9) were measured at 400x100 and print in runs of five to eight
     * characters over the whole ground plane, which reads as corduroy. Hoisted to the top of the
     * cascade because the craters below dither on it too. */
    var q = qOf(dist);

    /* ---- the trail ----------------------------------------------------------------------------
     * DRAWN PALER THAN THE GROUND AROUND IT, which is the way round that surprised the frontier too
     * and then did not: churned fines are unpacked and porous, and unpacked powder backscatters
     * more than the packed surface it was lifted out of. Drawn darker they read as two cracks;
     * drawn paler they read as tracks. Every Apollo pan shows them as the bright thing.
     *
     * PAST 22 m THE DISCRETE PRINTS BECOME A CONTINUOUS STRIP, and that is a photosensitivity fix
     * rather than an LOD one. At 60 m one screen row spans about 1.4 m of ground and a 0.32 m sole
     * lands inside a cell or does not depending on sub-metre camera position — so a walking camera
     * would switch a v-130 cell on and off against a lum-0 background several times a second, which
     * is precisely the failure west_town.js records its windmill failing tools/west-flicker.cjs on.
     * Anything that MOVES ACROSS a bright/dark boundary in this world has to be continuous, so the
     * far trail is a strip that is always painted and only its texture changes. */
    if (al < 0.62) {
      var sp = wz / STRIDE, si = Math.floor(sp), fsp = sp - si;
      var hb = hash2(si, 0, 0x4D51);
      var foot = (si & 1) ? 0.17 : -0.17;
      var off = lane - foot; if (off < 0) off = -off;
      if (lod === 2) {
        if (fsp < 0.46 && off < 0.14)
          /* The sole. ':' and ';' because a Apollo boot sole is a lugged waffle and at one cell
           * across, two stacked dots is what a waffle prints as. */
          return rset(litSet(hb < 0.5 ? G_COLON : G_SEMI, 0.72 + hb * 0.28, dist, hb));
        /* The spray thrown forward out of each print, which is what makes a footprint on a body
         * with no air look the way it does: the ejecta lands in a sharp fan and stays exactly where
         * it landed, for a million years. */
        if (fsp < 0.72 && off < 0.30 && hash2(Math.floor(wx * 6), Math.floor(wz * 6), 0x4D52) < 0.16)
          return rset(litSet(G_DOT, 0.3, dist, hb));
        return rblank();
      }
      if (al < 0.34) {
        var hf = hash2(Math.floor(wx * 2.2), Math.floor(wz * 2.2), 0x4D53);
        if (hf < 0.62) return rset(litSet(hf < 0.3 ? G_COLON : G_DOT, 0.6 + hf * 0.4, dist, hf));
      }
      return rblank();
    }

    /* ---- the rover rails ----------------------------------------------------------------------
     * 2.06 m wheelbase, so 1.03 m either side of the centreline, and a 0.23 m chevron tread. These
     * are drawn as CONTINUOUS lines at every distance — a rail that is always painted, with the
     * chevron carried by which glyph it is rather than by whether there is one. Same reasoning as
     * the trail above, and it costs nothing because a line of alternating '=' and '-' reads as a
     * tread pattern anyway. */
    var tr = al - TRACK; if (tr < 0) tr = -tr;
    if (tr < 0.15) {
      var ch = (Math.floor(wz / 0.34) & 1) ? G_EQ : G_DASH;
      var hr = hash2(Math.floor(wz * 3), (al * 2) | 0, 0x4D54);
      return rset(litSet(ch, 0.35 + hr * 0.45, dist, hr));
    }

    /* ---- THE SMALL CRATERS, and they are the most valuable thing on this floor -----------------
     * city.js's crater branch builds the ones with a RIM you can walk round, 3 to 20 m across. It
     * cannot build the small ones, because a 1 m crater is smaller than a lot and the heightmap has
     * no negative heights — height 0 is the floor and the route walker requires it. But a real mare
     * surface is saturated with them: every square metre of regolith has been turned over by
     * impacts and the ground is pitted at every scale down to the millimetre.
     *
     * They matter here for a reason that is nothing to do with realism. The first render of this
     * file was an even speckle from the bottom of the frame to the horizon with no relief in it
     * anywhere, which is design-brief failure (c) exactly: a plain with no shadow in it has no
     * scale, and the eye cannot tell whether the texture is two metres away or two kilometres. A
     * bowl is a scale reference that costs four hashes and a square root, because HALF OF IT IS
     * DARK — the inner
     * wall on the sun's side of the bowl faces away from the light and is a hole, and the far wall
     * is in raking light and is the brightest thing on the ground. One crater tells you where the
     * light is, which way is down, and how big a metre is.
     *
     * NEAR FIELD ONLY (lod 2, i.e. inside 22 m), and that is the flicker gate rather than an LOD
     * saving. Past 22 m a 1 m crater is under a screen cell across, so its lit and dark halves land
     * in the SAME cell and that cell switches between v 150 and v 0 as the camera walks — a
     * 60%-of-full-scale step at walking pace, which is exactly the hazard west_town.js's windmill
     * failed on. Inside 22 m the smallest of them is three cells across and every cell it owns
     * stays owned.
     *
     * AND THEY DO NOT READ AS CIRCLES, which is worth writing down because the obvious reaction to
     * the render is that they are not working. The ground plane is foreshortened by a factor of
     * dist/eyeY: at 8 m one screen row spans 0.42 m of depth and one column spans 0.029 m, so a
     * 1.5 m bowl is 50 columns wide and 4 rows tall. What lands in the frame is a wide flat band
     * with a dark half and a pale half, not a ring — which is what a crater at boot height actually
     * looks like, and it still does the two jobs it is here for: relief, and scale. */
    if (lod === 2) {
      var CQ = 5.5;                          // one candidate every 5.5 m, 42% of them taken, radii
                                             // 0.5-2.4 m: about 8% of the ground ends up inside one
      var ci = Math.floor(wx / CQ), cj = Math.floor(wz / CQ);
      var ch1 = hash2(ci, cj, 0x4D61);
      if (ch1 < 0.42) {
        var ccx = (ci + 0.18 + 0.64 * hash2(ci, cj, 0x4D62)) * CQ;
        var ccz = (cj + 0.18 + 0.64 * hash2(ci, cj, 0x4D63)) * CQ;
        var ddx = wx - ccx, ddz = wz - ccz;
        var cr = 0.5 + 1.9 * (ch1 / 0.42);   // 0.5 to 2.4 m across the rim
        var rd = Math.sqrt(ddx * ddx + ddz * ddz);
        if (rd < cr) {
          /* Which way this piece of the bowl faces. The inward normal points at the centre, so a
           * point on the sun's side of the bowl has its wall turned away from the sun. */
          var fac = rd > 1e-4 ? -(ddx * SUN_X + ddz * SUN_Z) / rd : 0;
          /* WHERE THE TERMINATOR SITS INSIDE THE BOWL IS THE SUN'S ALTITUDE, and it is the one
           * place in this file where the altitude does visible work. A 6-degree sun leaves five
           * sixths of a bowl in shadow; a 26-degree sun leaves a bit over half. That swing is the
           * whole difference between the two ends of the clock on this world. */
          var lip = 0.62 - 1.5 * (SUN_ALT - ALT_LO);
          var cg = hash2(Math.floor(wx * q), Math.floor(wz * q), 0x4D64);
          if (fac < lip) {
            /* The shadowed wall, and the near-field fill is the same slate as darkFace's for the
             * same reason: it is a hole, but a hole two metres from your boot is not black. A
             * grazed lip on this side was tried and taken out again: it sits astride the sweeping
             * shadow line and so switches every cell it owns as the day turns, which is the one
             * thing this world's background luminance makes unaffordable. */
            return cg < 0.07 ? rset(fset(G_DOT, P.slate, 16 + cg * 96)) : rblank();
          }
          /* The same ramp facade() uses, for the same measured reason: `lip` moves with the sun's
           * altitude and `fac` with its bearing, so a bowl's shadow line sweeps across the ground
           * as the day turns, and every cell it crosses would otherwise step the full height of a
           * lit ground cell in one frame. A cell takes about 20 s to cross the 0.30 band. Only
           * reached with fac >= lip, so it can never go under its own 0.24 floor. */
          var cs = fac - lip < 0.30 ? 0.24 + 2.533 * (fac - lip) : 1;
          /* The lit wall. Denser than the plain around it — a fresh bowl exposes unweathered fines
           * and they are markedly brighter, which is why young craters photograph as pale spots. */
          if (cg < 0.62)
            return rset(dim(litSet(cg < 0.3 ? G_COMMA : (cg < 0.7 ? G_TICK : G_QUOTE),
                                   0.45 + 0.55 * (cg / 0.62), dist, cg), cs));
          return rblank();
        }
      }
    }


    /* ---- the fines ----------------------------------------------------------------------------
     * A SPARSE FIELD WHOSE DENSITY CARRIES THE TONE. 24% coverage, and the 76% that is not painted
     * is what makes the ground grey — a 0.11-albedo powder is dark, and the way to draw dark in
     * this print is to leave cells out, not to write dim ones. Writing this plane as a dense field
     * at lum 40-100 in slate is the single fatal mistake available in this world; it would put a
     * third of the frame in the band core.js is trying to hold under 30%, and no setting of GAMMA,
     * KNEE or SHOULDER can rescue it, because a knee can delete a shadow but never create a
     * highlight. */
    var dens = 0.34 * (lod === 2 ? 1 : (lod === 1 ? 0.80 : 0.55));
    dens *= 0.94 + 0.5 * wFines;             // levitated fines settle out; see weatherAt
    /* THE SWELL. A mare surface is not flat, it undulates on a scale of five to fifteen metres, and
     * an even field of grit from the bottom of the frame to the horizon is design-brief failure (c)
     * in its purest form: television static, with no way to tell whether the texture is two metres
     * off or two kilometres. There is no geometry available for it — city.js owns the heightmap and
     * a street cell is height 0 by construction — so the swell is carried by DENSITY instead, which
     * is the same trick the tone is carried by. Bilinear over a 9 m lattice rather than a hard cell,
     * because a hard cell gives the plain visible 9 m tiles; four hashes and three lerps buys a
     * surface that reads as gently rolling. 0.55 to 1.45 is a factor of 2.6 in coverage, which at
     * this density is the difference between bare ground and a drift. */
    var sxq = wx / 9.0, szq = wz / 9.0;
    var s0 = Math.floor(sxq), s1 = Math.floor(szq);
    var fx = sxq - s0, fz = szq - s1;
    fx = fx * fx * (3 - 2 * fx); fz = fz * fz * (3 - 2 * fz);
    var n00 = hash2(s0, s1, 0x4D71), n10 = hash2(s0 + 1, s1, 0x4D71);
    var n01 = hash2(s0, s1 + 1, 0x4D71), n11 = hash2(s0 + 1, s1 + 1, 0x4D71);
    var sw = (n00 + (n10 - n00) * fx) + ((n01 + (n11 - n01) * fx) - (n00 + (n10 - n00) * fx)) * fz;
    dens *= 0.55 + 0.90 * sw;
    var d1 = hash2(Math.floor(wx * q), Math.floor(wz * q), 0x4D01);
    if (d1 < dens) {
      var k1 = d1 / dens;                    // normalised, for the reason litSet's callers all are
      /* A GLASS SPHERULE. Micrometeorite impact melts regolith into millimetre beads of glass and
       * the surface is full of them; one catching the sun square is a true specular and it is the
       * only thing on this ground that reaches the print's hot band. 8% of the painted cells, so
       * about 2.7% of ground cells, which with the ground at 40% of the frame is 1.1% hot from the
       * floor. Measured at 400x100 seed 42 the whole frame runs 2.1-2.4% hot against the build's
       * 3.5-5% target, and the shortfall is deliberate: the remainder is meant to come from the LM
       * foil, the SWC foil, the crew suit and Earth, none of which exist yet. If those land and the
       * census overshoots, this threshold is the first thing to move back. */
      if (k1 > 0.92) return rset(specSet(G_STAR, (k1 - 0.92) / 0.08, dist));
      return rset(litSet(k1 < 0.34 ? G_DOT : (k1 < 0.68 ? G_COMMA : G_TICK), k1, dist, d1));
    }
    /* A pebble, and the one blank down-sun of it that is its shadow. Rare, near field only, and the
     * only object on this floor with an edge — which is the whole point of it: a 3 cm stone with a
     * 20 cm shadow is a scale reference, and an open plain with no scale reference in it has no
     * size. The shadow is drawn as an absence because on this world that is exactly what it is. */
    if (lod === 2) {
      var d2 = hash2(Math.floor(wx * q * 0.5), Math.floor(wz * q * 0.5), 0x4D03);
      if (d2 < 0.010) return rset(litSet(G_o, 0.9, dist, d2));
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
   * ONE THING THIS DOES NOT FIX, recorded because it is in somebody else's file. refog() also lifts
   * far cells onto a haze floor of `Daylight.P.sky * (0.30 + 0.55*fog) * 46`, which is aerial
   * perspective — the one thing this world does not have. It only bites past fogStart, so on the
   * Moon it touches the two screen rows between 150 m and the horizon and is close to invisible;
   * the correct fix is for daylight.js to publish sky 0 in a vacuum world, and that is in the report
   * rather than worked around here. */
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
