/* CyberCity EDO — THE CASTLE KEEP. One element, layer 15.
 *
 * WHAT THIS IS. A tenshu: the multi-tiered thing at the end of a street that tells you which town
 * you are in. src/city.js already builds the MASS — DIST_JAPAN's `castle` row carries
 * `landmark: 0.030`, the highest rate in the quarter, and TH_JAPAN's lmMin/lmVar turn that roll
 * into a 13-25 m lot against a 5.4-8.6 m machiya street. What the map cannot build is what makes
 * that slab a castle rather than a chimney: the STACK OF ROOFS. Each storey of a keep is capped by
 * a tiled eave that oversails the wall below it, each one narrower than the last, with the corners
 * turned up and a pair of gilt shachihoko on the top ridge. That is geometry standing OFF the wall
 * plane, which is exactly the class of object src/surf_japan.js cannot paint — it is handed (u, v)
 * on a face and has no camera, no depth and no world — and exactly what an element file is for.
 *
 * SO THIS FILE FINDS THE MAP'S OWN KEEP AND PUTS THE ROOFS ON IT. It builds nothing of its own and
 * it invents no site: it walks a world-aligned lattice, asks src/city.js for the record under each
 * sample, and accepts the lot only when the district is `castle` and the lot's interior height
 * clears 12.5 m — which, given the castle row's hMax of 12.0, is an EXACT detector for a landmark
 * roll rather than a threshold somebody guessed. src/elements/structure.js's rooftop plant and
 * masts locate the city's towers the same way and its comment says why: a lattice probe against
 * CITY.height is the only handle an element has on what the map decided.
 *
 * ============================================================================================
 * THE THREE THINGS THAT DECIDE EVERY NUMBER BELOW, all three measured rather than assumed.
 * ============================================================================================
 *
 * 1. A KEEP IS ONLY EVER FRAMED AT 40-110 m, so its detail has to be sized for that and nothing
 *    else. src/raycast.js and src/proj.js share scale = cols*cellAspect/(2*tan(fov/2)) = 77.4 at
 *    200 columns, and horizon = 0.56*rows. One screen ROW therefore spans d/77.4 metres of a far
 *    wall: 0.52 m at 40 m, 0.78 at 60, 1.16 at 90. Anything under a metre tall on this object is
 *    sub-row and draws nothing. That is why the tier spacing here is 4.3-4.9 m on a tall keep
 *    (five to six rows apart at the design range) and why every one-row detail — the soffit band,
 *    the upturned corner, the gable apex — is offset in SCREEN rows rather than in metres. A
 *    0.4 m soffit and a 0.55 m corner lift are the real dimensions and both are invisible out
 *    here at the sizes they really have; the row below and
 *    the row above are what those dimensions MEAN at the distance this object lives at.
 *    The other half of the same arithmetic: the top of an H-metre keep sits at row
 *    horizon - (H-1.7)*77.4/d, so a 25 m keep has six rows of sky over it only past 65 m and its
 *    ridge is off the top of the frame inside 54 — MEASURED on the seed-7 keep at 59 m, where the
 *    top eave projected to row -1 and only its soffit, one row below, was on the frame at all.
 *    This file does not fight that — it gates each tier separately (see 3),
 *    so the tiers that are off-screen simply are not drawn.
 *
 * 2. AT NIGHT, NOTHING ON A KEEP IS LIT, AND THAT IS BY CONSTRUCTION RATHER THAN BY OVERSIGHT.
 *    surf_japan.js's lampAt() is identically zero above 3.6 m — it is an envelope for lanterns
 *    hung at 2.1 m and it has to be — and sunOf() collapses to its dome term, 0.083, once the sun
 *    is down. So there is no light source in this world that reaches 20 m up. Measured through
 *    core.js's LUT with EDO's fog (14/150/1.15) applied first, a painter writing the maximum
 *    lum 255 at 60 m at night prints: white 84, sand 77, timber 68, stone 74, indigo 75, gold 89,
 *    warm 95, jade 98, and PURE 159 — pure being the one swatch whose max channel is 255, so its
 *    printed value IS its fogged luminance. Against a muddy ceiling of 119 and a hot line of 170,
 *    exactly one swatch in the palette can be seen at all at that range after dark, and it can only
 *    be HOT inside about 55 m. (The two numbers checked against the live renderer rather than
 *    against the table: this element's brightest cell measures 152 at 65 m and 194 at 45 m.)
 *    THE DECISION, taken explicitly because a previous pass at this object shipped 2,500 bytes of
 *    eave that never printed a cell above v=119: the TIERS ARE A DAYLIGHT READ AND A SILHOUETTE AT
 *    NIGHT, and the night read is bought with a handful of `pure` on the top ridge and the two
 *    shachihoko — five to twelve cells, which is the whole of what this world's own palette note
 *    means by "specular hits only, use sparingly". src/elements/jp_town.js spends its one `pure`
 *    cell per near lantern on the same argument. EDO's night hot tail censuses 0.21% against a
 *    3.5-5% target, so those cells are also the only contribution this object can make to a number
 *    that is an order of magnitude short.
 *    The eave lines themselves are NOT bright and are not trying to be. An eave seen from 65 m at
 *    an elevation of 17 degrees is its own UNDERSIDE: the honest mark is a dark line with a band of
 *    black beneath it, drawn across a pale plaster wall. That reads by day, which is when a keep is
 *    a keep, and src/elements/west_range.js's telegraph pole makes the identical argument for the
 *    identical reason — some objects read by getting DARKER than what is behind them.
 *
 * 3. THIS ELEMENT HAS NO TIME TERM AT ALL, AND ITS PHOTOSENSITIVITY GATE IS THEREFORE A GATE ON
 *    THE CAMERA. Nothing here reads `t`. Every cell is a pure function of (map, camera), so the
 *    object cannot flash: what changes is the ROW an eave lands on, as the walk closes the
 *    distance. That rate is the thing this world has failed on five times, and every one of those
 *    failures was invisible in a still and invisible in the census because the defect was purely in
 *    the rate. The arithmetic here is exact rather than sampled:
 *        row = horizon - (y - eyeY)*scale/d  =>  |drow/dt| = (y - eyeY)*scale*v / d^2
 *    with v = CITY.SPEED = 1.6 m/s. For a 24.5 m ridge that is 3.1 Hz at 30 m, 2.3 Hz at 35 m,
 *    1.8 Hz at 40 m and 0.78 Hz at 60 m — i.e. a near keep toggles a cell squarely inside the
 *    3-20 Hz band, and no amount of dimming or thinning touches it. THE LEVER IS DISTANCE. So each
 *    tier is cut at its OWN minimum distance, dMin = sqrt((y - eyeY)*scale*v/KEEP_HZ), which is the
 *    inverse of that expression solved for 2 Hz: 38 m for a 24.5 m ridge, 23 m for a 10 m one.
 *    A tall tier is cut further out than a low one,
 *    which is also exactly where a tall tier leaves the top of the frame, so the gate and the
 *    framing agree instead of fighting.
 *    THE HORIZONTAL DIRECTION IS FREE AND IT IS WORTH SAYING WHY, because it looks like the bigger
 *    number: the camera's sway and yaw wobble move a run of eave at up to five columns a second,
 *    which sounds alarming until you notice that a HORIZONTAL RUN SLIDING HORIZONTALLY DOES NOT
 *    TOGGLE ITS OWN INTERIOR CELLS — a cell that was on the line is still on the line. Only the two
 *    ends move on and off, and the wobble that moves them is 0.10 Hz (control.js's sin(s*0.41)
 *    term) and 0.02 Hz (its vnoise sway). The one motion that can put a whole run of cells on and
 *    off together is the vertical one, and that is what dMin gates.
 *    REDUCED MOTION: nothing is damped and nothing is frozen, because there is nothing here that
 *    moves. Said out loud rather than left implicit, since the house rule asks for one of the two:
 *    the correct answer for a static world-space object is neither, and CC.reducedMotion also
 *    damps the walk itself (control.js scales the gait by 0.15), which can only lower every rate
 *    above. This element is strictly safer under it than without it.
 *
 * ============================================================================================
 * WHAT IT ACTUALLY MEASURES, so the next reader does not have to take any of the above on trust.
 * Sampled every 300 frames over the first 30,000 of the walk, ten seeds (42, 3, 7, 1, 5, 11, 1234,
 * 99, 2, 17), 200x60, through the real element list with the real weather:
 *   COVERAGE   121 of 1,010 sampled frames draw at least one cell — 12.0% of the walk. Nine of the
 *              ten seeds draw it; seed 1 never does, because its four castle landmarks are all
 *              90-110 m out and behind a frontage every time the walk faces one. That is the rate
 *              `landmark: 0.030` on an 11%-weighted district buys, and it is the right rarity: a
 *              keep the walk meets every minute is not a landmark.
 *   SIZE       62.7 cells a frame averaged over the frames that draw it, 7.5 averaged over every
 *              sampled frame, peak 228 (seed 7 f11400) — i.e. under 2% of a 12,000-cell frame at
 *              its largest, which is the 7-9% target read honestly rather than overshot.
 *   PRINT      At noon 4,069 of those 7,585 cells print v >= 9, 121 print hot, max printed 208.
 *              At night 594 of 7,587 print v >= 9, 16 print hot, max 194 — and essentially every
 *              one of the night survivors is the `pure` ridge or a shachihoko. That asymmetry IS
 *              the design; see 2 above.
 *   CENSUS     Neutral, which is what a landmark that neither lights nor blacks out the frame
 *              should be. seed 7 f10500 at noon: muddy 38.88 -> 39.18, hot 2.283 -> 2.283, black
 *              48.89 -> 48.82. At night: muddy 36.62 -> 36.33, black 56.11 -> 56.37. The largest
 *              move on any measured fixture is 0.30 points of muddy.
 *   RATE       tools/west-flicker.cjs cannot see this object AT ALL and saying so is part of the
 *              measurement: it renders the world pass with the CAMERA PINNED, and a mass with no
 *              time term cannot change under a pinned camera. So the same comparison was run in
 *              that tool's own form with the camera WALKING — 1,200 consecutive frames, the world
 *              pass rendered twice, once alone and once with this element, per-cell printed-value
 *              time series, seven Goertzel probes at 3.5/5/7/9/12/15/19 Hz:
 *                seed 7 f10200-11400 noon : worst per-cell INCREASE in 3-20 Hz power 0.45% of full
 *                  scale, worst increase in big-step rate 0.20/s. Frame worst-cell figures
 *                  unchanged (3.20/s, 4.39%) with and without.
 *                seed 7 f10200-11400 night: +0.53% band, +0.20/s.
 *                seed 7 f11400-12600 night (the near approach, where the tier cuts fire): +0.16%
 *                  band, and NO cell anywhere gained a single big step.
 *                seed 17 f24900-26100 night: +0.56% band, +0.30/s.
 *                seed 2  f10200-11400 noon : +0.59% band, +0.25/s.
 *              Against the project's gates of 2% in band and 1.0 big steps a second, the worst of
 *              those is 30% of the band limit and 30% of the rate limit, and the object never moves
 *              the frame's own worst cell. The walking camera by itself measures 3.2-8.5 big steps
 *              a second and 4.4-5.5% in band on this world, which is the honest context: this
 *              element is far below the noise floor of the camera it is seen from.
 *
 * WHAT IT DOES NOT DO. It does not touch the heightmap, it does not add a terrace, and it does not
 * flatten a bailey. A separate proposal exists for a block-scale stepped mass in src/city.js with
 * an enclosure wall round it; it is not this file's to make, it is a district-scale change rather
 * than a building, and it was measured moving 18-52% of a walk frame. What is here stands on the
 * lot the map already put up, and if that proposal ever lands this file keeps working — it reads
 * a height and a district name and nothing else.
 */
(function (CC) {
  'use strict';

  /* One projector per element — see src/proj.js for why there is exactly one copy of the camera
   * basis in the tree. V and PJ are this element's own basis and scratch. */
  var PR = CC.Proj.make(), V = PR.V, PJ = PR.PJ;
  var project = PR.project, emit = PR.emit, litFace = PR.litFace;

  var P = CC.P;

  /* G_TICK is the one mark in GLYPHS that reads as the end of a horizontal run turning UP, which
   * is the whole recognition of a Japanese eave; G_CARET is what west_town.js:514 uses for a
   * steeple apex and does the same job on a chidori-hafu gable; G_o is the shachihoko. There is no
   * diagonal anywhere in this object on purpose — city.js's own note on SIGN_CH_JP is right that a
   * diagonal reads wrong in this world, and a roof slope at a 9x16 cell is a staircase of
   * horizontals in any case. */
  var G_EQ = CC.g('='), G_UNDER = CC.g('_'), G_TICK = CC.g('`'),
      G_CARET = CC.g('^'), G_QUOTE = CC.g("'"), G_o = CC.g('o');

  /* Bound once per rebuild, off `city.world` and never off CC.World: between a keypress and the
   * rebuild those are two different answers, and this file has to agree with the map it is
   * measuring heights in. */
  var CITY = null, JP = null;
  function boot(city) {
    CITY = (city && city.aveX && city.world === 'japan') ? city : null;
    JP = null;
  }

  /* Per-frame caches. EVERY ONE OF THESE IS ASSIGNED INSIDE view(). The contract names this after
   * two frontier files kept a cache with one field left on its declared default and quietly
   * stopped following the clock while the street behind them still did; nothing reported it. */
  var NIGHT = 1, DAYF = 0, WALK = 1.6;
  function view(f, cam, t) {
    PR.view(f, cam, t);
    if (!JP) JP = (CC.SURFACES && CC.World) ? CC.SURFACES[CC.World.id] : null;
    /* `night` is surf_japan's own crossfade rather than the director's hard P.night flag, for the
     * reason that file states: a hard flag snaps while the painter is still halfway through its
     * handover, and this object is a large area. */
    NIGHT = (JP && JP.night !== undefined) ? JP.night : 1;
    DAYF = (JP && JP.dayFill !== undefined) ? JP.dayFill : 0;
    /* The walk speed comes off the MAP, not off a literal: city.js exports SPEED and the whole
     * photosensitivity gate below is solved for it. A copied 1.6 here would silently stop being
     * the gate the moment that constant moved. */
    WALK = (CITY && CITY.SPEED) ? CITY.SPEED : 1.6;
  }

  /* ============================================================================== the search ===
   * A world-aligned lattice, 4 m across and 8 m along, out to just inside src/proj.js's own far
   * plane. Both steps are chosen against city.js's EDO lot size rather than for tidiness: TH_JAPAN
   * gives lotW 4 + 0..3 and lotD 9 + 0..8, so a lot is 4-6 cells wide by 9-16 deep, and a step of 4
   * in x and 8 in z therefore cannot step OVER one. That is the whole placement rule — a keep is
   * wherever the map put a castle landmark, and this lattice is guaranteed to find every one of
   * them within range.
   *
   * ALIGNED TO THE WORLD, NOT TO THE CAMERA, which is the bug that would otherwise be here. A
   * lattice keyed on floor((ox - R)/4) re-deals its sample set every time the camera moves a metre,
   * so a lot found on one frame is missed on the next and a 200-cell object strobes at walking
   * pace — the exact defect class this world's blossom note is written about. Snapping the bounds
   * to multiples of the step makes the sample set a property of the MAP.
   *
   * DEDUPE IS BY LOT ANCHOR AND IS EXACT. Several lattice points can land in one lot, and each
   * would build a second keep on top of the first. west_town.js's drawCrowns solves the same
   * problem with an `abs(cx - gx) > 4` proximity test, which is approximate; here the record hands
   * back lotX/lotZ, so the answer is just "have I already BUILT on this anchor" against a fixed
   * three-slot list.
   *
   * THE LIST HOLDS BUILT KEEPS AND NOTHING ELSE, and that distinction is the one bug this scan has
   * already had. The first cut recorded every castle lot it looked at — ordinary 7-12 m ishigaki
   * included — and used the same counter as the work cap, so the loop returned after the third
   * castle lot of any kind. In a castle quarter that is three ordinary walls, and MEASURED across
   * ten named (seed, frame) fixtures ONE drew the keep — seed 7, where a landmark happened to fall
   * in the first three castle lots the scan met — and NINE DREW ZERO CELLS. Rejecting a lot has to
   * cost nothing but the one interior height probe that rejects it.
   *
   * Three slots because that is the WORK cap and not a dedupe limit: a forward cone rarely holds
   * more than one keep, two is a corner of the castle quarter, and a fourth would be out past
   * 110 m where the fog has it anyway.
   * ============================================================================================ */
  var KEEP_R = 124;                 // just inside V.far (Surf.FOG_END, 125): the far cut is then
                                    // project()'s own, shared with every other element, rather than
                                    // a second edge of this file's invention.
  var STEP_X = 4, STEP_Z = 8;
  var MAX_KEEPS = 3;
  /* 12.5 m. NOT a taste threshold: DIST_JAPAN's castle row is hMin 7.0 / hMax 12.0, and the only
   * other branch that can raise a castle lot is `hash(lx,lz,S+502) < D.landmark`, which sets
   * h = TH_JAPAN.lmMin + rand*lmVar = 13-25 m. EDO declares no swellAmp so nothing adds relief on
   * top. A castle lot over 12.5 m is therefore a landmark roll and nothing else — an exact
   * detector, and it will stay exact as long as those two bands do not overlap. */
  var KEEP_MIN_H = 12.5;
  /* Allocated at load rather than in init(): the length is a literal and there is nothing
   * per-city about it, so there is no second allocation to avoid. */
  var builtX = new Int32Array(MAX_KEEPS), builtZ = new Int32Array(MAX_KEEPS), builtN = 0;

  /* ============================================================================== the tiers ===
   * TIER_SPAN 0.58 — the roofs occupy the top 58% of the mass and the bottom 42% is the ishigaki
   * and the first storey, which is where a real tenshu's stonework stops. On a 24.5 m keep that
   * puts the lowest eave at 10.3 m and the top one at 24.5, four eaves 4.7 m apart: six rows apart
   * at 60 m and nine at 40, which is the whole reason the object reads as stacked rather than as
   * one striped slab. It is a FRACTION of the height rather than a fixed step for exactly that
   * reason: a fixed 3.9 m would put two eaves on a 13 m keep 1.5 rows apart at 90 m, which is one
   * thick line and not a tier.
   * FLY0 / FLY_D — how far each eave oversails the wall below it, 1.10 m at the top growing by
   * 0.78 m a storey downward. This is the ONLY thing that makes the silhouette a pyramid, because
   * the mass under it is a single-width slab all the way up: the eaves are what step outward. On a
   * 3 m core the base tier finishes 9.9 m across, which is a tenshu footprint (Himeji is about 20),
   * and at 60 m it stands about eight columns proud of the wall on each side. It is also what puts
   * the eave IN FRONT of its own wall in depth, which is what lets it print at all — see runEave.
   * NTIER — four storeys over 19 m, three over 15, two under. Not a look: with TIER_SPAN fixed, a
   * fourth eave on a 14 m keep lands 2.7 m from its neighbour, which is under two rows at 80 m.
   * ============================================================================================ */
  var TIER_SPAN = 0.58, FLY0 = 1.10, FLY_D = 0.78;

  /* ===================================================================== the rate gate, again ===
   * KEEP_HZ 2.0 is the target ceiling for how fast the walk may drag a tier across a row boundary,
   * and 2.0 rather than 3.0 because 3.0 is the EDGE of the flash band and this object is 200 cells
   * wide — the gate wants headroom on the shoulder, exactly as jp_town.js's blossom takes its cut
   * at 2.1 Hz rather than at 3.0. Solved for distance: dMin = sqrt((y - eyeY)*scale*WALK/KEEP_HZ),
   * which is 38 m for a 24.5 m ridge and 23 m for a 10 m one.
   * RIDGE_HZ 1.6 is the same gate, stricter, for the `pure` cells alone. They are the only cells in
   * this object with real amplitude — pure prints exactly what its luminance says, because its max
   * channel IS 255, so a ridge cell is a 60%-of-full-scale step against a night sky — and amplitude
   * is the other axis of the rule. 1.6 Hz is half the low edge of the band and well clear of the
   * 3.5 Hz probe whose shoulder jp_town.js's blossom note had to move away from; it puts a 25 m
   * keep's ridge cut at 44 m and full brightness at 53.
   * THE WINDOW IS NARROW AND IT IS WORTH STATING EXACTLY. `pure` written at 255 prints 255*T where
   * T is EDO's fog transmittance (14/150/1.15): 190 at 44 m, 173 at 53, 150 at 65, 120 at 79, and
   * 105 at 88. So the top ridge clears the muddy ceiling of 119 only inside 79 m and can be HOT
   * (v >= 170) only inside about 55. Between the 53 m the rate gate allows and the 79 m the fog
   * allows there is a 26 m window — about sixteen seconds of walk — in which this object has cells
   * a night frame can see. That is the whole of what a keep can be after dark here, and it is
   * the reason RIDGE_FAR is 82 rather than the 110 the geometry would allow: past it a `pure`
   * cell is under the muddy ceiling and is a specular spent on nothing.
   * FADE_M 9 m is the luminance ramp above each cut, the same shape as the blossom's 11->16 m
   * fade-in, so a tier arrives over about six seconds of walk rather than on one frame. It fades
   * the LUMINANCE; the black soffit band under each eave is an occluder and cannot be faded (a
   * cell written at lum 0 still claims the cell), so the honest statement is that each tier's
   * arrival is a step of 30-60 black cells — 0.25-0.5% of a 200x60 frame — and that the
   * per-tier gating is what stops all four arriving on the same frame. They arrive at four
   * distances 6-14 m apart, i.e. four separate steps several seconds apart.
   * ============================================================================================ */
  var KEEP_HZ = 2.0, RIDGE_HZ = 1.6, RIDGE_FAR = 82, FADE_M = 9;
  /* 2.6 m of crown roof above the top eave. Set by the row size at the FAR end of the range, not
   * by the near: one row is 1.29 m at 100 m, so anything under 2.6 m puts the ridge on the same
   * screen row as the eave it is supposed to sit above — and the eave, being a metre and a half
   * further out, is NEARER, so CC.put keeps the eave and drops the ridge. The first cut used
   * 1.55 m, which is under two rows at 65 m and one row at 100, and it was raised together with the
   * ridge-axis correction below when a 65 m fixture came back with zero `pure` cells. It is also
   * the honest dimension: a tenshu's top roof stands about three metres over its top wall plate. */
  var RIDGE_H = 2.6;

  /* ================================================================================ one eave ===
   * A horizontal run in world space, plus the two marks that make it Japanese.
   *
   * SAMPLED IN WORLD SPACE AND SIZED IN SCREEN SPACE. The ends are projected first, purely to
   * count how many samples the run needs: a 15 m eave seen at a glancing 16 degrees covers nine
   * columns, and sizing the loop off the world length would emit it thirty-three times into the
   * same nine cells. Every sample then carries its OWN depth, which is what makes the run occlude
   * correctly where it crosses in front of its own building and lose correctly where a nearer
   * frontage is in the way.
   *
   * THE SOFFIT IS DRAWN ONE SCREEN ROW BELOW, NOT 0.4 m BELOW. A real eave has about forty
   * centimetres of shadowed underside; at 60 m that is half a row and it lands on the same cell as
   * the eave itself, where CC.put's strictly-less depth test throws it away. The row below is what
   * 0.4 m MEANS at the distance this object is framed at. It is written at lum 0 in P.shadow, the
   * same true-black cap jp_town.js puts on its lanterns: it prints as nothing and it OCCLUDES,
   * which for a projecting eave is the correct and the entire contribution.
   *
   * THE UPTURNED CORNER is one G_TICK one row ABOVE each end, for the same reason — the real lift
   * is 0.55 m and is sub-row out here. It is emitted at d - 0.01 because it may land on a cell the
   * eave of the tier above already wrote at the same depth, and CC.put rejects an equal-depth
   * write; jp_town.js's chochin core draws five cells a frame for exactly that reason. */
  function runEave(f, ax, az, bx, bz, y, col, lum, soffit, tick) {
    var n, i, u, px, pz, x, yy;
    /* Both ends, only to size the loop. If either is behind the eye plane or past the far plane
     * the run is still drawn — it is sized off its world length instead and the samples that fall
     * outside are dropped one at a time by project(). */
    var okA = project(ax, y, az), sx = PJ.x, sy = PJ.y, sd = PJ.d;
    var okB = project(bx, y, bz), ex = PJ.x, ey = PJ.y, ed = PJ.d;
    if (okA && okB) {
      n = ex > sx ? ex - sx : sx - ex;
      var m = ey > sy ? ey - sy : sy - ey;
      if (m > n) n = m;
      /* AND THEN MULTIPLIED BY THE DEPTH RATIO, which is not a fudge factor. The loop steps
       * uniformly in WORLD space and the projection is not uniform: on a 15 m eave running away
       * from the camera from 58 m to 72 m, equal world steps land 24% further apart on screen at
       * the near end than at the far one, so a count sized off the screen extent alone leaves
       * single-column holes down the near half of every run, which is what the first render showed
       * on the oblique sides. Scaling by far/near oversamples the far end, where the duplicate
       * write is simply rejected by CC.put's own depth test and costs one comparison. MEASURED over
       * eight seeds x 101 sampled frames at noon it is worth +85 cells across the 114 frames that
       * draw anything, i.e. about 1% — small, because the broad face of a keep is usually close to
       * perpendicular and its depth ratio is close to 1, and it is the oblique side, the one
       * running away from the eye, that this repairs. Single-cell gaps remain where two facing
       * sides meet at a corner and the two runs round to different columns. */
      n = Math.ceil(n * (ed > sd ? ed / sd : sd / ed));
    } else {
      var dx = bx - ax, dz = bz - az;
      n = Math.ceil(Math.sqrt(dx * dx + dz * dz) * 2);
    }
    if (n < 1) n = 1;
    if (n > 96) n = 96;              // a 96-cell eave is already half the width of the frame

    for (i = 0; i <= n; i++) {
      u = i / n;
      px = ax + (bx - ax) * u; pz = az + (bz - az) * u;
      if (!project(px, y, pz)) continue;
      x = Math.floor(PJ.x); yy = Math.floor(PJ.y);
      emit(f, x, yy, G_EQ, col, lum, PJ.d);
      if (soffit) emit(f, x, yy + 1, G_UNDER, P.shadow, 0, PJ.d);
      if (tick && (i === 0 || i === n))
        emit(f, x, yy - 1, G_TICK, col, lum * 1.25, PJ.d - 0.01);
    }
  }

  /* ================================================================================= one keep ===
   * Everything below is a pure function of the lot and the camera. Returns 1 if it built anything,
   * so the caller can cap the work.
   * ============================================================================================ */
  function drawKeep(f, rec) {
    var lx = rec.lotX, lz = rec.lotZ;

    /* THE INTERIOR PROBE, and the offset is not arbitrary. A landmark lot with TH_JAPAN's podium
     * setback has its outer ring dropped to 3.2-5.4 m, so a cell on the lot boundary reports the
     * PLINTH height and not the keep's. lotW is at least 4 and lotD at least 9, so (lx+2, lz+4) is
     * inside the ring on every lot this world can produce, which makes it the one probe that is
     * always the real height. */
    var H = CITY.height(lx + 2, lz + 4);
    if (H < KEEP_MIN_H) return 0;

    /* THE CORE FOOTPRINT, grown outward from that probe while the height holds. This is what the
     * roofs are hung on, and it has to be the CORE rather than the lot: the plinth ring is a metre
     * of 4 m stonework round the outside and an eave measured from the lot boundary would oversail
     * from a metre too far out on every side. The walk is bounded by the largest lot EDO can make
     * (6 x 16) so it cannot run away, and it costs at most 26 height lookups on a cached chunk. */
    var floorH = H - 0.6, x0 = lx + 2, x1 = lx + 2, z0 = lz + 4, z1 = lz + 4, xm;
    while (x0 > lx && CITY.height(x0 - 1, lz + 4) > floorH) x0--;
    while (x1 < lx + 5 && CITY.height(x1 + 1, lz + 4) > floorH) x1++;
    xm = (x0 + x1) >> 1;
    while (z0 > lz && CITY.height(xm, z0 - 1) > floorH) z0--;
    while (z1 < lz + 15 && CITY.height(xm, z1 + 1) > floorH) z1++;
    /* A cell `g` covers world [g, g+1), which is the same half-open convention jp_town.js's faceOf
     * is written against — an object placed on the wrong side of that plane is inside the building
     * and CC.put deletes it silently. */
    var wx0 = x0, wx1 = x1 + 1, wz0 = z0, wz1 = z1 + 1;

    var kx = (wx0 + wx1) * 0.5, kz = (wz0 + wz1) * 0.5;
    var rx = kx - V.ox, rz = kz - V.oz;
    var d = Math.sqrt(rx * rx + rz * rz);
    if (d > KEEP_R) return 0;

    /* Per-lot variation, from the record's own hash rather than from an rng: this file draws no
     * random numbers at all and the harness at frame 9000 has to get the browser's frame 9000. */
    var sd = rec.seed;
    var nt = H >= 19 ? 4 : (H >= 15 ? 3 : 2);
    var step = H * TIER_SPAN / (nt - 1);
    var fly0 = FLY0 + sd * 0.30;

    /* The two lit faces, off src/proj.js's litFace, which resolves SUN_X/SUN_Z from whichever
     * painter owns the live world rather than from CC.Daylight — surf_moon.js's argument, and it
     * is the reason the roofs and the wall under them agree about where the light is. */
    var sunPX = litFace(1, 0), sunNX = litFace(-1, 0);
    var sunPZ = litFace(0, 1), sunNZ = litFace(0, -1);

    var built = 0, i, s;
    for (i = 0; i < nt; i++) {
      var y = H - i * step;
      var fly = fly0 + i * FLY_D;

      /* THE GATE, per tier, solved from |drow/dt| = (y - eyeY)*scale*WALK/d^2. See the header. */
      var dMin = Math.sqrt((y - V.eyeY) * V.scale * WALK / KEEP_HZ);
      if (d < dMin) continue;
      var fade = d < dMin + FADE_M ? (d - dMin) / FADE_M : 1;
      fade = fade * fade * (3 - 2 * fade);           // smoothstep, so the ramp has no corner in it

      var ex0 = wx0 - fly, ex1 = wx1 + fly, ez0 = wz0 - fly, ez1 = wz1 + fly;

      /* Which side is the BROAD one — the face most square to the view. The gable goes on that one
       * and nowhere else: a chidori-hafu on a face seen at fifteen degrees is two cells of
       * noise. */
      var fx = V.fwx < 0 ? -V.fwx : V.fwx, fz = V.fwz < 0 ? -V.fwz : V.fwz;
      var broadIsX = fx > fz;

      for (s = 0; s < 4; s++) {
        /* 0:+x 1:-x 2:+z 3:-z. A side is drawn only when its outward normal faces the camera. The
         * far two are hidden behind the roof in front of them — we are looking UP at this object
         * from 17 degrees below its eaves — and drawing them would scatter marks in the sky above
         * every tier, which is what the first cut did. */
        var ax, az, bx, bz, sun, isBroad;
        if (s === 0) {
          if (V.ox <= ex1) continue;
          ax = ex1; az = ez0; bx = ex1; bz = ez1; sun = sunPX; isBroad = broadIsX;
        } else if (s === 1) {
          if (V.ox >= ex0) continue;
          ax = ex0; az = ez0; bx = ex0; bz = ez1; sun = sunNX; isBroad = broadIsX;
        } else if (s === 2) {
          if (V.oz <= ez1) continue;
          ax = ex0; az = ez1; bx = ex1; bz = ez1; sun = sunPZ; isBroad = !broadIsX;
        } else {
          if (V.oz >= ez0) continue;
          ax = ex0; az = ez0; bx = ex1; bz = ez0; sun = sunNZ; isBroad = !broadIsX;
        }

        /* ONE SWATCH, P.stone, AND THE HOUR IS CARRIED ENTIRELY IN THE LUMINANCE. The obvious
         * alternative is west_range.js's `sun > 0.6 ? A : B` swatch switch, and on a telegraph pole
         * that is right because a pole is four cells. Here the run is 20-40 cells wide on a face
         * that all changes at once, and a swatch that flips as the sun crosses an azimuth is the
         * large-area single-frame step surf_japan.js:449 names by name. MEASURED, these cells
         * print v 30-70 at 60 m by day against a frame whose lit p90 is 130 — so the eave is a DARK
         * line on a pale mass, which is what an eave seen from seventeen degrees below actually is,
         * and stone's max channel of 170 could not make it a bright one at this range even at
         * lum 255. At night it prints under 20 and the tiers go to silhouette — deliberately, and
         * see the header. */
        var lum = 18 + 120 * sun * (0.22 + 0.78 * (1 - NIGHT)) + 26 * DAYF;
        runEave(f, ax, az, bx, bz, y, P.stone, lum * fade, 1, 1);

        /* THE CHIDORI-HAFU, on the two middle tiers of the broad face only: the dormer gable that
         * breaks a keep's roofline, and the one piece of this object that is a SHAPE rather than a
         * line. Three cells — an apex two rows up and a barge-board mark either side one row up —
         * because at 60 m a 2 m gable is two and a half rows and there is nothing else in it. */
        if (isBroad && i > 0 && i < nt - 1) {
          var mx = (ax + bx) * 0.5, mz = (az + bz) * 0.5;
          if (project(mx, y, mz)) {
            var gxp = Math.floor(PJ.x), gyp = Math.floor(PJ.y), gd = PJ.d - 0.01;
            emit(f, gxp, gyp - 2, G_CARET, P.stone, lum * fade * 1.3, gd);
            emit(f, gxp - 1, gyp - 1, G_QUOTE, P.stone, lum * fade, gd);
            emit(f, gxp + 1, gyp - 1, G_TICK, P.stone, lum * fade, gd);
          }
        }
        built = 1;
      }
    }

    /* ============================================================== the ridge and the fish ===
     * The crown roof, and the only thing on this object that a night frame can see.
     *
     * The ridge is a short horizontal run across the core, inset 12% at each end so it reads as a
     * ridge sitting on a hip roof rather than as a fifth eave — which axis it takes is decided
     * below and is a correction worth its own paragraph. `pure` at 255 prints what its luminance
     * says, because its max channel IS 255 and the printed value is therefore just the fogged
     * luminance, which is why the two numbers here are the only ones in this file set by aiming at
     * the census rather than at the light. MEASURED over ten seeds: 5-16 `pure` cells on the frames
     * that carry them, printing 128-165 in the 60-70 m band and reaching 170-194 inside 55 m, which
     * is the only hot tail a keep can contribute to a night frame censusing 0.21% against a 3.5-5%
     * target.
     *
     * The shachihoko are one cell each, one row above the ridge ends, in `pure` with a `gold` mark
     * under them at d - 0.01 — the gilt body, which is the material claim, drawn where the ridge
     * has already written the cell and would otherwise be rejected at equal depth. gold's max
     * channel is 240, so at 65 m through EDO's fog it prints around 82: inside the muddy band. It
     * is there for the day and the `pure` cell above it is there for the night, and neither is a
     * substitute for the other. */
    var dRidge = Math.sqrt((H + RIDGE_H - V.eyeY) * V.scale * WALK / RIDGE_HZ);
    if (built && d >= dRidge && d <= RIDGE_FAR) {
      var rf = d < dRidge + FADE_M ? (d - dRidge) / FADE_M : 1;
      rf = rf * rf * (3 - 2 * rf);
      /* Fades out again over the last 14 m as well: `pure` at 255 prints 120 at 79 m, so from 68 m
       * outward these cells are on their way under the muddy ceiling and a specular that cannot be
       * seen should not be spent. */
      if (d > RIDGE_FAR - 14) rf *= (RIDGE_FAR - d) / 14;

      /* THE RIDGE RUNS ACROSS THE VIEW, NOT ALONG THE CORE'S LONGER AXIS, and that is a correction
       * rather than a preference. A tenshu's main ridge does run along its long axis, and the first
       * cut drew it that way — on the seed-7 keep, whose 3x8 m core is seen almost end-on, that put
       * the whole ridge along the line of sight, where it projected to FOUR cells stacked
       * vertically in one column, three of which lost the depth test to the top eave in front of
       * them and the fourth to a raindrop. Measured: zero `pure` cells in the frame. A ridge is
       * only ever a horizontal mark at this resolution, so it is drawn on whichever core axis is
       * more square to the camera — the irimoya gable end facing the approach, which is what a
       * keep on the far side of a bailey actually presents. */
      var ry = H + RIDGE_H;
      var rax, raz, rbx, rbz;
      var afx = V.fwx < 0 ? -V.fwx : V.fwx, afz = V.fwz < 0 ? -V.fwz : V.fwz;
      if (afz >= afx) {
        rax = wx0 + (wx1 - wx0) * 0.12; rbx = wx1 - (wx1 - wx0) * 0.12;
        raz = rbz = (wz0 + wz1) * 0.5;
      } else {
        raz = wz0 + (wz1 - wz0) * 0.12; rbz = wz1 - (wz1 - wz0) * 0.12;
        rax = rbx = (wx0 + wx1) * 0.5;
      }
      /* 214, not 255: at 60 m EDO's fog transmits about 0.62, so 214 prints ~133 — clear of the
       * muddy ceiling of 119 and deliberately UNDER the hot line, because a whole RUN of hot cells
       * on one object is not the shape a 0.21% hot tail is short of. The two fish are what go over
       * it, and only inside 55 m. */
      runEave(f, rax, raz, rbx, rbz, ry, P.pure, 214 * rf, 0, 0);

      var q;
      for (q = 0; q < 2; q++) {
        var fxp = q ? rbx : rax, fzp = q ? rbz : raz;
        if (!project(fxp, ry + 0.55, fzp)) continue;
        var fxc = Math.floor(PJ.x), fyc = Math.floor(PJ.y), fd = PJ.d;
        emit(f, fxc, fyc, G_o, P.pure, 255 * rf, fd);
        /* The gilt body, one row down, at d - 0.01 so it beats the ridge cell already written
         * there. CC.put's depth test is strictly-less and an equal-depth write is dropped. */
        emit(f, fxc, fyc + 1, G_TICK, P.gold, (150 + 80 * DAYF) * rf, fd - 0.01);
      }
    }

    return built;
  }

  /* ============================================================================ the scan pass ===
   * See the essay at `the search` above for why the lattice is world-aligned and why the two steps
   * are 4 and 8. The order of the two loops is z-then-x so the sample order is a property of the
   * map: with MAX_KEEPS capping the work, which keeps get built has to be reproducible, and a scan
   * ordered by camera position would build a different three from one frame to the next.
   * ============================================================================================ */
  function drawKeeps(f) {
    var R = KEEP_R;
    var gx0 = Math.floor((V.ox - R) / STEP_X) * STEP_X;
    var gx1 = Math.floor((V.ox + R) / STEP_X) * STEP_X;
    var gz0 = Math.floor((V.oz - R) / STEP_Z) * STEP_Z;
    var gz1 = Math.floor((V.oz + R) / STEP_Z) * STEP_Z;
    /* 1.8 half-planes of slop on the cone. The frame edge is |sp| = tan(fov/2); a keep whose CENTRE
     * is outside the frame can still have half its base tier inside it, because the eaves oversail
     * three metres and the object is twenty columns wide. */
    var cone = V.hp * 1.8;
    var gx, gz, rx, rz, w, sp, rec, k, dup;

    builtN = 0;
    for (gz = gz0; gz <= gz1; gz += STEP_Z) {
      for (gx = gx0; gx <= gx1; gx += STEP_X) {
        rx = gx + 0.5 - V.ox; rz = gz + 0.5 - V.oz;
        w = rx * V.fwx + rz * V.fwz;
        if (w < 8) continue;                        // behind, or too close to be a keep at all
        sp = (rx * V.rgx + rz * V.rgz) / w;
        if (sp > cone || sp < -cone) continue;
        if (rx * rx + rz * rz > R * R) continue;
        /* The hash-free tests first and the map lookups last: height() is a chunk fetch and cell()
         * can build a record, and this loop runs a few hundred times a frame. */
        if (CITY.height(gx, gz) <= 0) continue;     // street, alley, plaza or vacant: no record
        rec = CITY.cell(gx, gz);
        if (!rec || rec.district !== 'castle') continue;

        dup = 0;
        for (k = 0; k < builtN; k++)
          if (builtX[k] === rec.lotX && builtZ[k] === rec.lotZ) { dup = 1; break; }
        if (dup) continue;

        /* An ordinary castle lot is rejected inside drawKeep by one height probe and costs nothing
         * else; only a landmark reaches the footprint walk. That is why the reject is NOT cached —
         * caching it is what broke the scan, see the essay above. */
        if (!drawKeep(f, rec)) continue;
        builtX[builtN] = rec.lotX; builtZ[builtN] = rec.lotZ; builtN++;
        if (builtN >= MAX_KEEPS) return;
      }
    }
  }

  /* Registered at layer 15, which is free IN EDO — the world-filtered list has 26 elements in it
   * and none of them was on 15 (jp_town.js takes 16, 17, 19, 20 and 22; weather.js 14; street.js
   * 18 and up). west_range.js's brush and moon_ground.js's boulders are both on 15, and that is
   * fine and worth saying so nobody "fixes" it: the layer sort runs on the list AFTER CC.inWorld
   * has filtered it, so two elements in two different worlds can never be adjacent in one sort.
   * Being alone on its layer is what matters, because it means the sort cannot reorder an existing
   * pair. init() draws nothing from the shared rng either, so no downstream element's stream
   * moves: jp-blossom gets the same thirty draws it had. Checked, not assumed. */
  CC.ELEMENTS.push({
    name: 'jp-keep',
    layer: 15,
    world: 'japan',
    init: function (city) { boot(city); },
    draw: function (f, cam, t) {
      if (!CITY) return;
      view(f, cam, t === undefined ? (cam.t || 0) : t);
      drawKeeps(f);
    }
  });

})(typeof CC !== 'undefined' ? CC : require('../core.js'));
