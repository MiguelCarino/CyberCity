/* CyberCity EDO planting — the sakura, and it is the only object in this world with VOLUME.
 * Layer 18.
 *
 * WHY A TREE AND WHY THIS TREE. src/elements/jp_town.js draws four objects and every one of them
 * is a FACE or a stick: a paper bag under an eave, a curtain across a door, four posts of a gate,
 * a stone box on the kerb. src/surf_japan.js paints the walls and the ground and by construction
 * cannot paint anything that stands off them. So the frame this world ships is a corridor of flat
 * planes with small flat things hung on it, and the one thing missing from it is a mass — an object
 * that occupies a lump of air between the camera and the frontage, that is lit differently on its
 * top and its underside, and that the street has to be seen THROUGH. A cherry over a machi lane is
 * that object, and it is also the single most recognisable thing the setting owns.
 *
 * IT IS ALSO THE ONLY DAY-HOT SURFACE THIS WORLD HAS, which is the census half of the argument and
 * is measured rather than asserted. core.js's print ladder gives `white` a day ceiling of 209 and
 * the hot line is a printed v of 170, so white needs lum >= 207 by day to print hot. Nothing else
 * in EDO is licensed anywhere near it: `warm` tops out at 187, `sand` at 190, `ember` at 136, and
 * `pure` is spent one cell at a time on the core of a near lantern (jp_town.js:199-208). EDO's noon
 * hot tail measures 0.71% at seed 42 and 0.07% at seed 7 against a project target of 3.5-5%. A
 * sunlit blossom mass in white at CB 246 prints v ~200 over a large area and is materially honest
 * about it: someiyoshino in full sun IS the brightest thing in the street.
 *
 * WHAT MAKES A TREE DANGEROUS HERE, AND WHAT WAS DONE ABOUT IT. This world has tripped the
 * photosensitivity rule — nothing above 2% of full scale between 3 and 20 Hz — five times, and
 * every trip was invisible in a still frame and invisible in the census, because the defect was
 * purely in the RATE. jp_town.js's blossom drift records the shape of it at length (lines 512-558:
 * dimming and thinning the pool moved the number not at all, and only an 11 m distance cut did),
 * and moon_craft.js records the same failure on a static object with a screen-keyed dither
 * (lines 244-250: 33 big steps a second, 6.3% in band, from a lattice that RE-DEALT as the object
 * moved a fraction of a cell). A canopy is that hazard at four hundred times the area, so this file
 * takes the fix moon_craft's quad() takes and states as a rule at its line 385: THE DITHER IS KEYED
 * IN WORLD METRES. Every luminance in the crown is a function of the world point the cell is
 * looking at — never of dx/dy from a projected centre, never of floor(PJ.x), never of iw or ih, and
 * never of t. See the block over billow() for the arithmetic, which is the most important reasoning
 * in this file.
 *
 * NOTHING IN HERE MOVES. Not the crown, not a limb, not a leaf. The arithmetic is in the sway note
 * below drawTrees(); the short version is that a crown at 14 m subtends 63 columns and a 0.6 Hz
 * sway of +/-0.12 m would put every one of its ~150 rim cells across a cell boundary at 1.2 Hz with
 * a third harmonic inside the band, at day contrast against sky. The motion in this world stays
 * where jp_town.js already gated it: the petals, cut at 11 m.
 */
(function (CC) {
  'use strict';

  /* One projector per element — see src/proj.js for why there is exactly one copy of the camera and
   * why each element holds its own basis. V and PJ are this file's own; the helpers are closed over
   * them. litFace() is deliberately NOT pulled in: see the lighting note over billow(). */
  var PR = CC.Proj.make(), V = PR.V, PJ = PR.PJ;
  var project = PR.project, emit = PR.emit, column = PR.column;

  var P = CC.P, hash2 = CC.hash2, vnoise = CC.vnoise;

  /* THE CANOPY RAMP IS BUILT FROM MARKS WITH A HOLE IN THEM, never from block glyphs, and that is
   * the whole "blossom, not blob" argument. A blossom mass at 9x16 px per cell is a stipple of
   * small round marks with air between them; '#', '%', '&', '$', 'M' and 'W' fill the cell corner
   * to corner and turn a crown into masonry. surf_japan.js's own INK ramp stops at '=' for exactly
   * this reason. So:
   *   '@'  the heaviest glyph in the table that still has a HOLE in it — a dense knot of flowers
   *        seen small is a knot with light in it, which is what '@' draws and '#' does not.
   *   '8'  two stacked lobes: two clusters on one twig. Already the chochin's body glyph.
   *   '*'  five arms round a centre. It is the only glyph in GLYPHS that is literally a flower.
   *   'o'  one open bloom, for the mid tier.
   *   '`' and "'"  the feathered rim, paired so the edge alternates lean and does not comb.
   * The trunk takes '|', the limbs '/' '|' '\' so the three read as a splay rather than a post, and
   * 'Y' — the last glyph in the table and literally a fork — goes at the crotch. One cell, and it
   * is the difference between a lollipop and a tree. '-' bands the near trunk: sakura bark is
   * horizontally lenticelled where cryptomeria is vertically fibred, and two rows of it is what
   * names the species at a glance. */
  var G_PIPE = CC.g('|'), G_DASH = CC.g('-'), G_TICK = CC.g('`'), G_QUOTE = CC.g("'"),
      G_STAR = CC.g('*'), G_AT = CC.g('@'), G_8 = CC.g('8'), G_o = CC.g('o'),
      G_SLASH = CC.g('/'), G_BSL = CC.g('\\'), G_Y = CC.g('Y');

  /* Bound once per rebuild from the MAP, never from CC.World: between a keypress and the rebuild
   * those are two different answers and this file has to agree with the map it is standing on.
   * BASE goes through the same imul-and-shift spread city.js:14-34 argues for — a raw adjacent salt
   * is how two "independent" streams end up drawing the same numbers. */
  var CITY = null, BASE = 0, JP = null, LAT = 3.93;
  function boot(city) {
    CITY = (city && city.aveX && city.world === 'japan') ? city : null;
    BASE = CITY ? ((Math.imul(CITY.seed | 0, 40503) >>> 6) & 0x3fffff) : 0;
    JP = null;
    /* STALE ANCHORS ACROSS A REBUILD, and this one line is a shipped-class bug closed by hand.
     * main.js re-runs every element's init() on any seed or world change, and jp-blossom's init
     * seeds thirty petals through respawn() BEFORE this element has drawn a single frame of the new
     * city. If the anchor count survived the rebuild, those thirty petals would be seeded at tree
     * positions from a map that no longer exists — and a fresh headless process, which starts at
     * n = 0, would never see it. That is precisely the browser-diverges-from-the-harness class the
     * fixture comparison exists to catch. */
    FL.n = 0;
  }

  /* Per-frame caches. EVERY ONE OF THESE IS ASSIGNED INSIDE view(). The contract asks for that by
   * name after two frontier files were left holding their declared defaults and silently stopped
   * following the clock; the declared values here are the NIGHT end, so a file that somehow drew
   * without a view() would draw a black tree rather than a noon-white one in the dark. */
  var NIGHT = 1, DAYF = 0, LAMP = 1;
  function view(f, cam, t) {
    PR.view(f, cam, t);
    /* Resolved off the painter registry rather than by CC.SurfJapan's name, so the getters come
     * from whichever painter actually owns the live world. Same shape as jp_town.js:64. */
    if (!JP) JP = (CC.SURFACES && CC.World) ? CC.SURFACES[CC.World.id] : null;
    NIGHT = (JP && JP.night !== undefined) ? JP.night : 1;
    DAYF = (JP && JP.dayFill !== undefined) ? JP.dayFill : 0;
    /* LAMP ALONE, and never NIGHT * LAMP. That is a shipped-and-fixed bug documented three times in
     * this tree (surf_japan.js:242-249 and 580-584, jp_town.js:144-146): the director's `lamp`
     * already carries the hysteresis, and a second night crossfade over the top of it put the whole
     * town out an hour before dusk. */
    LAMP = CC.Daylight ? CC.Daylight.P.lamp : 1;
    /* The lateral cull's slack, once a frame, because it is a function of the LIVE fov and the
     * viewer can change that. See the derivation above the cull itself. */
    LAT = RAD_F * CR_MAX + OFF_F * CR_MAX * Math.sqrt(1 + V.hp * V.hp);
  }

  /* The street-lattice helpers, in the same shape jp_town.js and west_range.js use them. They are
   * repeated here rather than reached for across files because an element file in this project owns
   * its own scaffolding and nothing exports these; the six of them strip to under 300 bytes.
   *
   * WHICH AXIS IS WHICH is the distinction that had every lantern in jp_town.js placed two hundred
   * metres up the wrong road, so it is restated: an avenue is INDEXED by x and RUNS along z, so
   * nearIdx reads V.ox and alongOf reads V.oz. They are one axis apart and nothing in either name
   * says so. */
  function wxOf(axis, along, cross) { return axis ? along : cross; }
  function wzOf(axis, along, cross) { return axis ? cross : along; }
  function nearIdx(axis) {
    return Math.round((axis ? V.oz : V.ox) / (axis ? CITY.CROSS : CITY.AVE));
  }
  function centreOf(axis, idx) { return axis ? CITY.crossZ(idx) : CITY.aveX(idx); }
  function halfOf(axis, idx) { return axis ? CITY.crossW(idx) : CITY.aveW(idx); }
  function alongOf(axis) { return axis ? V.ox : V.oz; }
  /* Where the building face actually is, in world metres. city.js's colX() marks cells [c-hw, c+hw]
   * as corridor and a cell `g` covers world [g, g+1), so the frontage plane on the +side is
   * x = c + hw + 1 and on the -side x = c - hw — which is this one expression. A tenth of a metre
   * wrong here is not cosmetic: an object on the far side of that plane is INSIDE the building and
   * CC.put's depth test deletes it without a word. */
  function faceOf(axis, idx, side) {
    return centreOf(axis, idx) + 0.5 + side * (halfOf(axis, idx) + 0.5);
  }

  /* ============================================================================= THE ANCHOR LIST ===
   * WHAT THIS IS FOR AND WHY IT LIVES IN A GLOBAL. jp_town.js's blossom drift spawns its petals on
   * a ring 4-24 m round the CAMERA (respawn(), line 410-422) — that is, from nowhere. It is the
   * shipped look and it censuses fine, but with trees in the world it is plainly wrong: the petals
   * should come off a crown. This file cannot edit jp_town.js, so instead it PUBLISHES where its
   * crowns are and a later one-line change in respawn() can read them. Nothing here breaks if that
   * change is never made — the list is written every frame and, if nobody looks, thrown away.
   *
   * WHAT A CONSUMER MUST HONOUR, and it is one rule: only trees beyond 13 m are recorded. The 11 m
   * cut in jp_town.js:532 is a measured photosensitivity gate (without the drift the world scores
   * 1.27% in band, with it and no cut 2.59%), and a petal born on a crown at 6 m would spend its
   * whole life inside that cut and be drawn never. So the nearest and best-seen tree sheds nothing.
   * That is the trade, stated plainly, and the alternative is reopening a gate that took five
   * failures to close.
   *
   * ALLOCATED ONCE, at module load, never per frame — same rule as everything else in draw(). */
  var ANC_N = 8;
  var FL = {
    n: 0, cap: ANC_N,
    x: new Float64Array(ANC_N), y: new Float64Array(ANC_N),
    z: new Float64Array(ANC_N), r: new Float64Array(ANC_N)
  };
  CC.JPFlora = FL;

  /* =================================================================================== placement ===
   * A STREET WALK, NOT A LATTICE, and jp_town.js:341-348 already records why: two lattice cuts of
   * the stone lantern failed for two compounding reasons — this world's open ground is mostly
   * INSIDE a block, so the frontage occludes it, and the thin strip beside the road where it is not
   * is a small fraction of a lattice cell's area, so almost nothing lands in it. Walking the along-
   * street index the way the lanterns and the toro do puts the object exactly where it can be seen,
   * at a rate that is a PITCH rather than an area fraction, for less code.
   *
   * THE PITCH LADDER IN THIS WORLD ALREADY RUNS FROM lantern-per-bay TO object-per-lot — LAN_PITCH
   * 2.4, NOREN_PITCH 5.4, TORO_PITCH 7.4 — and a tree belongs at the far end of it. Below about
   * 8 m it reads as a planted boulevard, which is a park and not a castle town.
   *
   * THE ELIGIBLE QUARTERS ARE NOT ISH_OK. The stone lantern's table includes `kura`, a fireproof
   * warehouse yard, which is the one place in town nobody plants a flowering tree, and `castle`,
   * which measured out nearly inert as a placement quarter — hMin 7.0 / hMax 12.0 with vacant 0.22
   * means its frontage is a battered stone wall you cannot see over and its open lots are behind it.
   * What is left is the four quarters where a tree is both plausible and visible: `garden` (58%
   * vacant, so the setback placement fires there and the crown is seen over the wall), `temple`
   * (the approach tree), and `machiya` + `market`, which are the two dense frontages where the tree
   * goes to the KERB and overhangs the carriageway. Those four are 0.59 of quarters by district
   * weight (0.26 + 0.11 + 0.10 + 0.12), which is why the accept rate below is 0.19 and not the 0.34
   * a three-quarter table would want.
   *
   * THE DENSITY, WORKED AND THEN MEASURED. The walk covers 2*TREE_R = 84 m of frontage per street
   * index per side, which is 7 slots at a 12 m pitch; times 0.59 eligible times 0.19 accepted is
   * 0.79 trees per side per street index — call it one, which is the density the brief's own
   * arithmetic lands on once `castle` comes out and `machiya` goes in. MEASURED over 41 frames of
   * the autopilot at 200x60, counting every tree that passes the frustum test: seed 1 gives 0.51
   * trees a frame, seed 7 gives 3.22, seed 42 gives 4.12 and seed 404 gives 6.78, with a quarter to
   * a half of them inside 20 m. That spread is the map's, not the pitch's — a walk that spends its
   * time in `nagaya` and `kura` sees no trees at all and should not — and it is why the pitch was
   * not raised to flatter the poor seeds: an avenue of them is a park, and this is a town.
   *
   * TREE_R = 42 m rather than the brief's 62. A crown at 42 m is still 2.6*2*137.6/42 = 17 columns
   * and a perfectly legible shape down a street; beyond that fog has it at under 71% and the tier
   * structure collapses into the muddy band faster than the gap threshold's distance walk can
   * rescue it. Measured, extending the reach from 42 to 54 m added 6% more cells and moved neither
   * the census nor the picture. It is also 12 m inside the projection's own cull at
   * CC.Surf.FOG_END = 125, so nothing here is ever fighting the far plane.
   *
   * THE ACCEPT RATE WAS RAISED 0.19 -> 0.32, AND THIS MOVES THE EDO NIGHT, DAWN AND DUSK FRAMES.
   * All three, said plainly: the contract gives a declared signature hour the same protection as
   * night, EDO's dawn and dusk differ from the previous tree at five of six seeds, and the only
   * other place in this pass that discusses those two stops is surf_japan.js's note arguing that
   * its daylight FILL leaves them byte-identical. That argument is true and it is about a different
   * term; what moves the golden hours is this constant and the two edits below it. Said here because
   * CONTRACT.md's rule is that a MATERIAL change may move the night frame provided the source
   * declares it; this one is material (there is more tree) and is not read off the clock, so it is
   * not the scale case that rule forbids.
   *
   * WHAT IT BUYS AT NOON, WHICH IS THE HALF THAT GENERALISES. The sunlit crown is this world's only
   * day-hot surface and there is now reliably one in shot: at seed 42 the visible crown roughly
   * quadruples (measured 29.4 -> 133.7 cells a frame over a 601-frame walk at 200x60) and the same
   * holds at every seed looked at, including seed 512 where it goes from a few cells to nearly two
   * hundred. Census at 200x60 f300 seed 42 noon: muddy 49.6 -> 48.5, hot 2.67 -> 3.40, lit p90
   * 117 -> 139.
   *
   * WHAT IT BUYS AT NIGHT IS ONE SEED, AND THE FIRST VERSION OF THIS NOTE PRESENTED THAT AS THE
   * GENERAL RESULT. It is not. At seed 42 — the seed in every fixture and every README table — the
   * night crown goes from ZERO cells above the v = 9 black line (330.7 owned cells a frame, max
   * printed value 4: a hole in the frontage, not a tree) to a legible cherry in 82.2% of frames at
   * max printed v 91, because the lamp exception below finally has a kerb trunk near enough to fire
   * on. At seeds 7, 1337, 512 and 3 the night crown is STILL exactly zero cells above the black
   * line. The tree got bigger at four of six seeds and stayed invisible at four of six.
   *
   * AND AT ONE SEED THAT COSTS THE PICTURE. At seed 512, frame 300, night, the change is a pure
   * subtraction: 428 cells darker by more than 8, ZERO cells brighter, all of it one crown-shaped
   * bite taken out of the lit frontage by a canopy that prints nothing. The night census reads
   * better for it (muddy 36.4 -> 32.9) because deleting dim texture always does, which is a good
   * demonstration that the census cannot see this class of defect at all. The honest lever for the
   * night image is not this constant — it is the lamp exception's REACH, which is where a later
   * pass should go; the accept rate is kept because the noon result above stands on its own.
   *
   * The density argument above is unchanged in kind — 0.79 trees per side per street index becomes
   * 1.33, which is still a town with cherries in it and not an avenue of them. The pitch was
   * deliberately NOT touched; the boulevard argument above still holds. */
  var TREE_PITCH = 12.0, TREE_R = 42, TREE_ACCEPT = 0.32, CR_MAX = 3.4;

  /* ---- THE CROWN'S PROPORTIONS, named because FOUR places read them and two of them used to
   * carry their own copy of the number. The lateral cull's slack (LAT) and the night lamp
   * exception's underside (lowY) are both functions of this shape, and when the factors lived
   * as literals at the billow call the cull deleted crowns that were still on screen and the
   * lamp fired against an underside the crown no longer had.
   *
   * A SOMEIYOSHINO IS MUCH WIDER THAN IT IS TALL AND IT IS MOUNDED. The first cut of this file
   * put three equal billows on a 120-degree ring at a flat random height, which unions to
   * 1.42:1 — near enough a ball, and a ball on a post is a lollipop whatever the trunk does.
   * The reference read is 1.6-2.0:1 with the mass high in the middle and sweeping down and out
   * to thin ragged edges, so: one billow pulled IN to the axis and raised (MOUND[0], OFF_MID)
   * and two pushed OUT and dropped. RAD_F and RY_F are chosen to hold rad*ry constant against
   * the old 0.66/0.528 pair — 0.76*0.456 = 0.347 against 0.348 — so the billow's own cell count
   * and therefore its census contribution is unchanged; only the SHAPE moves. */
  /* The three centres, hoisted to module scope and filled once per tree. They are computed
   * BEFORE anything is drawn because the leaders have to aim at them, and they are module-level
   * typed arrays rather than a per-tree literal because this file allocates nothing inside
   * view() — the same rule the anchor block and the billow walk already keep. */
  var CBX = new Float64Array(3), CBY = new Float64Array(3), CBZ = new Float64Array(3);

  var RAD_F = 0.76, RY_F = 0.60;         // horizontal radius, and vertical as a fraction of it
  var OFF_F = 0.50, OFF_MID = 0.16;      // ring offset for the outer billows, and for the peak
  var MOUND = [0.60, 0.42, 0.42];        // billow 0 is the peak; 1 and 2 are the shoulders
  var TREE_OK = { garden: 1, temple: 1, machiya: 1, market: 1 };

  /* THE NEAR CUT, and it is the single most load-bearing constant in this file. Inside CAN_NEAR the
   * TRUNK is drawn and the canopy is not.
   *
   * The picture reason first, because it is the one that decides the number. At 200x60 the horizon
   * is row 33.6 and V.scale is 77.4, so a crown centred at 5.8 m of height projects to row
   * 33.6 - (5.8-1.7)*77.4/d. At d = 6 that is row -19; at d = 8, row -6; at d = 9.5, row +0.2. So
   * anywhere inside about nine metres the entire crown is off the top of a 60-row frame and all the
   * viewer gets is a wall of white sweeping the frame edge — while the billow loop is at its
   * LARGEST and emitting almost nothing. Nine and a half metres is where the crown starts to be a
   * crown rather than a ceiling.
   *
   * The rate reason second. The world-keyed field below makes a screen cell's crossing rate
   * independent of distance (see the arithmetic over billow()), so distance is no longer the lever
   * it is for the petals — but the SILHOUETTE still sweeps across the frame at speed*colK/d columns
   * per second, and at 6 m on the autopilot's 1.6 m/s that is 37 columns/s of a hard crown/sky
   * boundary passing over the near half of the frame. Nine and a half metres holds it to 23, and
   * the manual walk at 2.7 m/s to 39.
   *
   * The cost reason third, and it is the one the critique of this design was loudest about. The
   * per-billow ellipse is 400-660 cells at 20 m, 800-1,300 at 14 m, 1,500-2,400 at 10 m and would
   * be 4,000-4,900 at 6 m. The bound that actually bounds it is not this cut but the per-column row
   * clip inside billow() — an off-frame row is never iterated at all — and this cut is what stops
   * the loop paying for a shape nobody can see. */
  var CAN_NEAR = 9.5;

  /* THE UP-FACTOR, WHICH IS THE MUDDY LEVER AND IS SHIPPED AT THE HIGHER OF THE TWO CANDIDATE
   * SETTINGS. A crown at noon lands most of its cells in the print's muddy band (9 <= v < 120)
   * whatever is done, and EDO's noon muddy is 44-52% against a project target under 30%, so this is
   * the number that decides whether the element is a census win or a census cost.
   *
   * The two candidates were 0.46 + 0.54*up and 0.60 + 0.40*up, and 0.60 is what ships. Measured
   * here, pooled over eight frames at seed 42 noon with the element rendered twice — once with, once
   * without, and the frames differenced cell by cell — 0.46 puts 4-6 more points of the element's
   * own cells in the band and takes the same off its hot tail. The cost is a flatter crown: 0.60 is
   * about 1.7:1 top-to-underside where 0.46 is 2.2:1. That is a fair reading of surf_japan.js's own
   * dome model anyway — SKY_UP 1.00 against SKY_SIDE 0.52 applied to a sphere, under an overcast
   * where the SKY is the key light and there is no sun term at all.
   *
   * IT FLATTENS FURTHER WITH DISTANCE. See the `dim` term inside billow(): fog takes a crown at 40 m
   * to 71% of its luminance, so an underside at 0.60 of base slides into the band however clean it
   * was at 14 m — and at forty metres a 5 m crown is nine columns wide, where a top-to-underside
   * gradient is not resolvable and haze has flattened it in life as well as in the ladder.
   *
   * RIM_F and MID_F are what is LEFT of the brief's rim x0.62 / mid x0.78 after the tier identity
   * moved to the gap threshold — see the T_RIM block below, which is where that 0.62 went and why. */
  var UP_FLOOR = 0.60, UP_SPAN = 0.40, RIM_F = 0.88, MID_F = 0.95;

  /* The two tier radii, as normalised radius-squared inside the billow's silhouette disc. q 0.28
   * puts about 28% of the disc's area in the core, q 0.62 another 34% in the mid and the remaining
   * 38% in the rim. That three-way split is the same one surf_japan.js's walls already use
   * (lit / mid / shd at line 452-454) and the mapping notes name a missing third tier as the
   * highest-leverage census change available anywhere in this world. */
  var Q_CORE = 0.28, Q_MID = 0.62;

  /* ---- WHY THE OUTER TIERS THIN OUT INSTEAD OF DIMMING DOWN, WHICH IS THIS FILE'S ONE REAL
   * DEPARTURE FROM THE BRIEF IT WAS BUILT TO, AND IT IS A MEASUREMENT AND NOT A PREFERENCE --------
   * The brief writes the three tiers as LUMINANCE factors — rim x0.62, mid x0.78, core x1.00 — on
   * top of an up-factor floor of 0.60. Multiply those out and the dimmest lit cell in the crown is
   * 0.60 * 0.62 = 0.372 of base, which at noon is raw lum 92.
   *
   * THE PRINT LADDER, MEASURED, IS WHY THAT DOES NOT WORK. Poked cell by cell through the shipped
   * exposure LUT at this world's noon exposure (which applies a GAMMA LIFT and a knee, so the naive
   * `ceiling * lum/255` is not the print and is wrong by a factor of two at the bottom):
   *
   *      raw lum      8    24    60   100   140   180   220   246
   *      white v     24    49    88   122   152   179   198   206
   *      sand  v     21    44    80   110   137   161   180   187
   *      timber v    11    26    48    66    82    97   111   118
   *      moss   v    10    23    41    57    71    83    94   100
   *
   * So `white` clears the muddy ceiling of 120 at raw lum ~98 and reaches the hot line of 170 at
   * ~166, and it is black only under raw lum ~3. THERE IS NO SUCH THING AS A DIM CELL: everything
   * between raw 3 and raw 98 prints into the band. Raw 92 is the last rung below the line, so the
   * rim — 38% of every crown's area — was manufacturing mud by construction. Measured pooled over
   * eight frames at seed 42 noon by rendering the world twice and differencing, the multiplicative
   * version put 88.4% of the element's own cells in the band and moved the FRAME's muddy share the
   * WRONG WAY at six of the eight frames.
   *
   * So the tiers move the GAP THRESHOLD instead of the luminance. A rim cell is either full blossom
   * or black; what makes the rim a rim is that far more of it is black. That is bimodal by
   * construction, it is what a feathered edge actually looks like (clusters against sky, not a grey
   * wash), and it is the same idea the brief argues for when it says the porosity must live in the
   * mixture rather than in missing cells — carried one step further, into the luminance. With the
   * same eight frames the element measures 70.3% black / 24.6% muddy / 5.1% clean, and the frame's
   * muddy share moves -1.03 points rather than up.
   *
   * The luminance factors are kept, at 0.88 and 0.95, because a rim exactly as bright as the core
   * reads flat; they are a shading nudge now rather than the tier's whole identity, and
   * 0.60 * 0.88 = 0.53 of base is raw lum 130 at noon, comfortably the first clean rung. */
  var T_RIM = 0.22, T_MID = 0.07;
  /* THE UNDERSIDE IS NOT THE TOP EDGE, and until this the rim thinned identically all the way
   * round because the tier is a function of q — normalised radius — alone. A cherry's top is a
   * clean mound and its bottom is ragged: clumps of blossom hanging BELOW the mass with gaps
   * where the branches show through. Tilting the RIM THRESHOLD with the cell's own normalised
   * world height buys exactly that, and it costs nothing to key: vy is already computed for q.
   * It is asymmetric on purpose — the underside gets the full tilt and the top three tenths of
   * it — so the mound's upper edge stays clean and almost no hot core cells are lost.
   * SCALLOPS RATHER THAN A FRINGE, because nf is a CLUSTERED field: lowering the threshold
   * under a clustered field lets whole clumps survive where a uniform one would grow an even
   * fuzz. The ramp width SH_W is deliberately untouched — this shifts the threshold, it does
   * not widen the transition, so no cell's ramp gets faster and no rate can move.
   *
   * WHAT IT COSTS, MEASURED AND NOT ARGUED, because lowering a threshold under a clustered
   * field lands cells anywhere on the ramp and the rim is painted in `blossom`, not white —
   * so the cells this buys arrive at raw lum 0..73, which is squarely inside the muddy band.
   * At 200x60 frame 300: seed 42 moves muddy 51.2 -> 51.5 at noon and 43.6 -> 43.8 at dusk,
   * hot 3.28 -> 3.23, and night is unchanged because the crown is black there anyway; seed 7
   * does not move at any hour. That is 0.3 points of mud for the one feature that separates
   * a cherry's silhouette from a shrub's, and it is spent knowingly. If a later pass needs
   * the budget back, damp T_LOB rather than widening SH_W — the ramp width is load-bearing
   * for the rate gate and the threshold is not. */
  var T_LOB = 0.10;

  /* THE CLUSTER FIELD'S RAMP. `nf` below is a smooth world-space value-noise field in 0..1; cells
   * under SH_LO are the gaps between clusters and are written as BLACK OCCLUDING MASS, cells over
   * SH_HI are full blossom, and in between the luminance ramps. Three things are being bought:
   *   THE GAP IS WRITTEN, NOT SKIPPED. moon_craft.js's quad states the rule at line 385: a cell
   *     that is always painted can never alternate with what is behind it. A canopy that leaves 30%
   *     of its cells unwritten shows sky through them and every one of them alternates with the
   *     crown as the walk moves it — the windmill failure (west_town.js:470-500) reproduced over
   *     four hundred cells instead of twelve. metrics.py does not count ink; the eye does. That
   *     asymmetry is the whole trick: it LOOKS porous and it is solid.
   *   THE GAP IS LUM 0 AND NOT LUM 9. The brief pins the shade tier at lum 9 and calls it "the one
   *     number that must not drift", on the arithmetic `ceiling * lum/255`. That is not the print:
   *     the measured ladder in the T_RIM block above has timber at raw lum 8 printing v 11 and
   *     `shadow` at raw 8 printing v 2, so lum 9 in any of this world's timbers is INSIDE the muddy
   *     band and the tier that was meant to be the element's best census property would have been
   *     its worst. Lum 0 in `shadow` is genuinely black at every hour and still occludes, because
   *     CC.put writes f.dist unconditionally whatever the luminance is.
   *   THE RAMP WIDTH IS A PHOTOSENSITIVITY NUMBER AND IT IS SOLVED, NOT PICKED. What the ramp buys
   *     is that a cell being crossed by a gap boundary takes several FRAMES to make the transition
   *     instead of one, so no single frame's step reaches the project's big-step line of a third of
   *     full scale. The number of frames is
   *         frames = ramp_metres * 60 / s
   *     where s is the camera's lateral speed — the distance term cancels exactly, for the same
   *     reason it cancels in the crossing rate over billow(). The field's gradient is about 1.25
   *     per metre, so a ramp of SH_W = 0.18 in field value is 0.144 m of world, i.e. 5.4 frames at
   *     the autopilot's 1.6 m/s and 3.2 frames at the manual walk's 2.7 m/s. Three frames is the
   *     floor: at three, a full-swing transition is 33% of scale per frame, exactly the big-step
   *     line. SH_W is set at the narrowest value that still clears it, because every hundredth
   *     wider is another band of half-lit cells landing in the muddy band — the first cut ran the
   *     ramp at 0.36 and measured 59.5% of the element's cells muddy against 24.6% at 0.18. */
  var SH_LO = 0.34, SH_W = 0.18;

  /* ---- AND THE THRESHOLD WALKS OUT WITH DISTANCE, which is a census lever and a picture fix at
   * the same time and was the single largest measured improvement in this file.
   *
   * MEASURED FIRST. Fog on this world's ramp (14 m / 150 m / pow 1.5) takes a crown at 30 m to 83%
   * of its raw luminance and one at 44 m to 71%, and `white` needs raw lum 98 to clear the muddy
   * ceiling — so a crown that lands cleanly at 14 m slides bodily INTO the band at 30 and sits
   * there. Walking the gap threshold out with the billow's own depth pushes the cells that would
   * have gone dim to black instead and leaves the ones that would have stayed clean alone.
   *
   * THE PICTURE ARGUMENT IS THE SAME ARGUMENT AND IT IS west_range.js's, made about a telegraph
   * pole at line 102-107: by day the honest reading of a distant object under haze is that it gets
   * DARKER against its surroundings, not fainter. A cherry at forty metres in humid spring air is a
   * dark mass with a bright top edge, and that is what a raised gap threshold draws — the dim half
   * of the crown falls out to occluding black and what survives is the lit crown and the sunward
   * rim. What it must never do is pop, so it is a linear ramp in distance from 18 m over the next
   * 26 m: at the autopilot's 1.6 m/s the threshold moves 0.0074 per second against a field ramp
   * SH_W = 0.18 wide, so a cell's luminance changes by at most 4% of its swing per second from this
   * term. That is well over an octave below the bottom of the flash band, and it is the reason this
   * one term is allowed to be keyed on the camera at all when nothing else in the file is.
   *
   * SH_LEAF is the same lever spent on the leaf trees, and its arithmetic is in the `bloom` note
   * inside drawTrees(): `moss` prints v 100 at raw lum 246, which is UNDER the muddy ceiling of
   * 120, so no luminance of it is ever clean and every visible moss cell is a muddy cell. The only
   * thing that can be done about that is to have fewer of them, which is what a raised gap
   * threshold on a leaf crown does. */
  var SH_FAR = 0.12, SH_D0 = 18, SH_DK = 1 / 26, SH_LEAF = 0.16;

  /* ================================================================================= ONE BILLOW ===
   * A crown is drawn as three overlapping ellipsoids and this draws one of them: centre (bx,by,bz),
   * horizontal radius `rad`, vertical radius `ry`. THREE AND NOT ONE, because a someiyoshino crown
   * is a cluster of distinct billows on radiating limbs and the union of three offset ellipses has
   * a naturally ragged outline where one ellipse never does; and because a crown spans three metres
   * of DEPTH, so at ten metres its near and far sides differ 30% in size and a single screen-space
   * ellipse is simply the wrong shape up close.
   *
   * ---- HOW IT IS WALKED, AND WHY IT IS WALKED THIS WAY -------------------------------------------
   * This is moon_craft.js's quad() generalised from a flat face to a silhouette: sample ACROSS the
   * object in world metres, one sample per screen column solved off the projected width, and for
   * each sample project the two ENDS of a vertical and fill between them. proj.js's column() gives
   * the reason — sampling a grid of world points and projecting each separately puts them in
   * different columns whenever the object is off-axis, and the object shears as the camera pans.
   *
   * The sample axis is the camera's own right vector (V.rgx, V.rgz), which is what makes the sample
   * count solvable and the fill gapless: sample i lands in screen column i, near enough. The world
   * point it names, (bx + rgx*u, wy, bz + rgz*u), is a point on the disc through the billow's
   * centre perpendicular to the view — i.e. very nearly the point the ray through that cell would
   * hit on the near surface of the ellipsoid.
   *
   * ---- AND THAT WORLD POINT IS THE KEY TO EVERY HASH IN HERE, WHICH IS THE POINT OF THE FILE -----
   * THE FAILURE THIS AVOIDS, stated exactly. The obvious way to texture a projected blob is to hash
   * the SCREEN offset from its centre cell: hash2(dx + salt, dy - salt, ...) where dx, dy are
   * offsets from floor(PJ.x) and floor(PJ.y). Every element in this tree that has done that has
   * failed the gate, because floor(PJ.x), floor(PJ.y), and the half-widths derived from the
   * projected size ALL STEP CONTINUOUSLY as the camera walks, and each step RE-DEALS the entire
   * lattice at once. For a kerb tree 3 m off the walk line at the autopilot's 1.6 m/s (control.js
   * SPEED), floor(PJ.x) steps at p*s*colK/w^2 — 10.3 Hz at 8 m, 4.6 Hz at 12 m, 2.6 Hz at 16 m —
   * and floor(PJ.y) at very nearly the same rate. At the manual WALK speed of 2.7 m/s every one of
   * those doubles. Each re-deal changes state on a large fraction of several hundred canopy cells,
   * so a given cell alternates six or seven times a second, squarely in the 3-20 Hz band, at a day
   * contrast of black-gap against white-core which is 76% of full scale. That is moon_craft.js:
   * 244-250 verbatim (33 big steps/s, 6.3% in band) on an object forty times the area.
   *
   * WHAT IS DONE INSTEAD. Every field below is sampled at the CELL'S WORLD POINT in metres. The
   * crown does not move and the world point does not move, so nothing re-deals, ever. What is left
   * is only the honest thing — as the camera translates, a fixed screen cell looks at a different
   * part of a stationary object — and its rate is a pure function of world speed and world feature
   * size, with the distance term cancelling exactly:
   *
   *     cell's rate of crossing one feature = (s * colK / d) / (L * colK / d) = s / L
   *
   * where s is the camera's lateral speed and L the feature size in metres. At L = 1.6 m (the field
   * frequency below is 0.62 per metre, so a period is 1.6 m) that is 1.0 Hz on the 1.6 m/s
   * autopilot and 1.7 Hz at the 2.7 m/s manual walk. Both are BELOW the 3 Hz floor of the band, at
   * every distance, which is a property no screen-keyed lattice can have at any distance at all.
   *
   * AND THE FIELD IS SMOOTH, NOT BINARY, which is the second half of it. vnoise interpolates, so
   * adjacent cells differ by a fraction of the swing rather than by all of it, and the transition
   * from black gap to full blossom is spread over SH_W = 0.18 of field value — see that constant
   * for the frames-per-transition solve, which is the number that actually bounds the per-frame
   * step. This is west_town.js's and surf_moon.js's standing remedy — SPREAD THE CHANGE, NEVER
   * SWITCH IT — applied to a texture instead of to a terminator.
   *
   * THE ONE HIGH-FREQUENCY TERM, and its budget. `fw` is a second octave at 2.7 per metre (period
   * 0.37 m) whose whole job is to keep the crown from reading as three smooth blobs. Its crossing
   * rate is s/0.37 = 4.3 Hz on autopilot, which IS in the band, so its AMPLITUDE is what has to be
   * legal rather than its rate: it is worth +/-0.10 of the tier luminance, and because it too is
   * interpolated the change a cell sees in one frame is (its own period in frames)^-1 times that
   * swing = s/(0.37*60) * 0.20 = 1.4% of the tier value at 1.6 m/s and 2.4% at 2.7 m/s, i.e. at or
   * under 2% of full scale even where the crown is at its brightest. That is the budget and it is
   * spent deliberately; it is also why there is no third octave.
   *
   * NO PER-CELL HASH DECIDES A LUMINANCE OR A GLYPH ANYWHERE IN THIS LOOP. Both come from the two
   * smooth fields and from the cell's geometric position in the disc. That is a stronger guarantee
   * than world-keying alone and it costs nothing: two vnoise calls per cell is four hash2 calls,
   * exactly what quad() spends.
   *
   * ---- MEASURED, WITH THE CAMERA WALKING, WHICH NO TOOL IN THIS TREE DOES --------------------------
   * tools/west-flicker.cjs PINS the camera and says so at its line 156 ("the only variable left is
   * time"), and this object has no time dependence at all beyond the daylight clock — so the shipped
   * gate sees it and reports nothing: measured under that condition the element's worst cell adds
   * +0.00 big steps/s and +0.00% in band at night, +0.56% at noon (which is the daylight clock, not
   * the tree). That is a PASS the hazard would have walked straight through, so the measurement was
   * redone with west-flicker's own metric — BIG = 255/3, the same seven Goertzel probes on f.lum,
   * 180 frames — and the camera driven by CC.Control exactly as main.js drives it. Worst per-cell
   * increase attributable to this element, seed 42 noon, 200x60:
   *
   *      jp-sakura         step +64.7%   big steps +2.00/s   3-20 Hz +3.76%
   *      jp-stonelantern   step +70.2%   big steps +2.00/s   3-20 Hz +3.99%
   *      jp-torii          step +60.8%   big steps +1.67/s   3-20 Hz +3.57%
   *      jp-lanterns       step +38.0%   big steps +2.67/s   3-20 Hz +1.87%
   *      jp-noren          step +26.3%   big steps +1.33/s   3-20 Hz +2.03%
   *      jp-blossom        step  +0.0%   big steps +0.00/s   3-20 Hz +0.00%  (its 11 m cut, working)
   *
   * The whole frame with no element at all measures 5.67 big steps/s and 7.26% in band under a
   * walking camera, so every one of these is a fraction of a baseline that is a property of a
   * character grid with a camera moving across it — which is the stance flicker-rate.cjs:266-271
   * already records. What matters is that the sakura sits WITH the two shipped static objects and
   * not an order above them, which is exactly what world-keying buys and exactly what a screen-keyed
   * lattice would have destroyed: moon_craft.js measured 33 big steps/s from that mistake.
   *
   * ---- THE LIGHTING IS TOP-DOWN AND THERE IS NO SUN TERM -----------------------------------------
   * litFace() is not used and that is deliberate: a crown presents every normal at once, which is
   * west_range.js's saguaro argument (lines 243-249) about a cylinder, only more so for a sphere.
   * surf_japan.js's whole thesis is that under an overcast deck what models a surface is its angle
   * to the SKY and not to the sun — SKY_UP 1.00 against SKY_SIDE 0.52 — so the crown is lit purely
   * top-down at UP_FLOOR..1. That is also what a cherry under Japanese spring overcast looks like.
   *
   * ---- AND THE DEPTH IS CONVEX -------------------------------------------------------------------
   * The lantern sprite in jp_town.js writes every cell at the single depth of its projected centre,
   * which is invisible on a 0.3 m paper bag and would be very visible on a 4 m crown: the whole
   * billow would win or lose the depth test against a wall as one unit, so a kerb tree would read as
   * a decal pasted flat on the shopfront. Instead each cell is pushed toward the camera by the
   * ellipsoid's own bulge, rad*sqrt(1-q), so the crown occupies a real lump of depth and the
   * frontage behind it is occluded cell by cell as geometry says it should be. */
  function billow(f, bx, by, bz, rad, ry, salt, base, lampB, cA, cB, shLo, shK, dim) {
    var rx = bx - V.ox, rz = bz - V.oz;
    var w = rx * V.fwx + rz * V.fwz;
    if (w < 1.2 || w > V.far) return;

    /* One sample per projected column, capped. The cap is not a quality knob — a billow asking for
     * more than 120 samples is wider than half a 200-column frame and is being drawn from inside
     * itself, which CAN_NEAR already refuses; it is here so a future camera with a wider fov or a
     * bigger frame cannot turn this loop into a hang. */
    var n = Math.ceil(2 * rad * V.colK / w) + 2;
    if (n < 3) n = 3; else if (n > 120) n = 120;

    var i, r;
    for (i = 0; i <= n; i++) {
      /* uu is the lateral offset in WORLD METRES from the billow centre, along the camera's right
       * vector. Everything downstream is keyed off the world point it names. */
      var uu = ((i / n) * 2 - 1) * rad;
      var un = uu / rad;
      var s2 = 1 - un * un; if (s2 < 0) s2 = 0;
      var hv = ry * Math.sqrt(s2);             // world half-height of the silhouette at this offset
      var wpx = bx + V.rgx * uu, wpz = bz + V.rgz * uu;

      /* Project the two ENDS of this vertical, exactly as column() and quad() do. */
      if (!project(wpx, by - hv, wpz)) continue;
      var x = Math.floor(PJ.x), yb = PJ.y, dc = PJ.d;
      if (x < 0 || x >= V.cols) continue;
      if (!project(wpx, by + hv, wpz)) continue;
      var yt = PJ.y;
      if (yt > yb) { var sw = yt; yt = yb; yb = sw; }
      var span = yb - yt; if (span < 1e-4) span = 1e-4;

      /* THE ROW CLIP IS THE REAL COST BOUND. An off-frame row is never entered, so a crown whose
       * centre is above the top of the frame costs only the columns it actually fills. Without this
       * the loop pays a q, two vnoise and an emit for every row of a shape that emit() would reject
       * on entry anyway (proj.js:82). */
      var r0 = Math.floor(yt), r1 = Math.floor(yb);
      if (r1 < 0 || r0 >= V.rows) continue;
      if (r0 < 0) r0 = 0;
      if (r1 >= V.rows) r1 = V.rows - 1;

      /* The per-COLUMN half of the cluster field, hoisted out of the row loop: it depends only on
       * the horizontal world position, which is constant down a column. `ph` shears the vertical
       * octave by the same horizontal position so the two do not stack into a plaid — a separable
       * field a + b draws a grid, and a grid is the one thing a canopy must not be. */
      var fu = vnoise(wpx * 0.62 + wpz * 0.41, salt);
      var ph = wpx * 0.53 + wpz * 0.29;

      for (r = r0; r <= r1; r++) {
        /* The cell's world height. The column runs from by+hv at row yt down to by-hv at row yb, so
         * this is a straight inverse-lerp on the cell CENTRE. It is a world metre, which is what
         * every field below wants. */
        var wy = by + hv * (1 - 2 * ((r + 0.5 - yt) / span));
        var vy = (wy - by) / ry;
        /* Normalised radius-squared inside the silhouette disc, in world units on both axes. At the
         * disc's edge hv is 0 and this is exactly 1, so the tiers are continuous with the outline
         * rather than approximating it. */
        var q = un * un + vy * vy;
        if (q > 1.0) q = 1.0;

        var fv = vnoise(wy * 0.62 + ph, salt ^ 0x2B);
        var fw = vnoise(wy * 2.7 + ph * 1.9, salt ^ 0x5D);
        var nf = fu * 0.46 + fv * 0.54;

        /* The gap ramp. Below SH_LO the cell is a hole between clusters; above SH_HI it is full
         * blossom; between them it ramps, which is the whole photosensitivity argument above. */
        /* The tier the cell is in, decided in world units on both axes, and it shifts the gap
         * threshold rather than scaling the luminance — see the T_RIM note above. */
        var tier = q > Q_MID ? 2 : (q > Q_CORE ? 1 : 0);
        var lob = vy < 0 ? T_LOB * vy : T_LOB * 0.30 * vy;
        var rimT = tier === 2 ? T_RIM + lob : (tier === 1 ? T_MID + 0.45 * lob : 0);
        var shF = (nf - shLo - rimT) * shK;
        if (shF < 0) shF = 0; else if (shF > 1) shF = 1;

        /* Convex depth: this cell is on the NEAR surface of the ellipsoid, so it sits up to `rad`
         * closer than the disc plane the column was projected on. 0.86 rather than 1.0 keeps the
         * very front of the crown from poking through anything it is legitimately touching. */
        var d = dc - rad * 0.86 * Math.sqrt(1 - q);
        if (d < 0.6) d = 0.6;

        if (shF <= 0.02) {
          /* THE GAP, and it is written. Glyph 0 at lum 0 in shadow: genuinely black at every hour,
           * and CC.put still stamps f.dist so it occludes the frontage behind it. */
          emit(f, x, r, 0, P.shadow, 0, d);
          continue;
        }

        /* Top-down only. `up` is 0 at the underside of the billow and 1 at its crown, computed from
         * the world height rather than from a screen row — rows increase DOWNWARD in this renderer
         * (proj.js:73), and a design specified in screen rows inverts the gradient and puts the one
         * cell the whole feature is justified by, the hot sunlit core, on the shaded underside. */
        var up = (wy - by + ry) * (0.5 / ry);
        if (up < 0) up = 0; else if (up > 1) up = 1;

        /* THE UP-FACTOR FLATTENS WITH DISTANCE, and that is the same measurement as the gap
         * threshold's distance walk. Fog takes a crown at 40 m to 71% of its luminance, so an
         * underside at 0.60 of base slides into the band however clean it was at 14 m — and at
         * forty metres a 5 m crown is nine columns wide, where a top-to-underside gradient is not
         * resolvable and haze has flattened it anyway. `dim` is the distance term computed by the
         * caller; at its far end the crown is lit almost uniformly, which is both what is legible
         * and what keeps the far half of the element out of the mud. */
        var upF = UP_FLOOR + UP_SPAN * up;
        upF = upF + (1 - upF) * dim;
        var tierF = tier === 2 ? RIM_F : (tier === 1 ? MID_F : 1);
        /* THE LAMP TERM RUNS THE OTHER WAY UP THE CROWN, and that is the whole reason it is a
         * separate argument rather than part of `base`. The sky is above the tree and the lantern
         * is under it, so one lights the crown and the other lights the UNDERSIDE — and multiplying
         * a lamp contribution by the same top-weighted factor as the sky, which is what the first
         * cut of this did, lit an entire small crown evenly and put a glowing ball over a night
         * street with nothing under it to explain the light. (1 - 0.78*up) puts nearly all of it on
         * the branches a lantern can actually reach and leaves the crown dark, which is both the
         * physics and the photograph. */
        var lum = (base * upF + lampB * (1 - 0.78 * up)) * tierF * shF * (0.90 + 0.20 * fw);

        /* Colour and glyph, both off the smooth fields and the tier — no per-cell hash. The mid
         * tier flecks the pink mass with its highlight swatch on `fw`. */
        emit(f, x, r,
             tier === 2 ? (fw > 0.5 ? G_QUOTE : G_TICK)
                        : (tier === 1 ? (fw > 0.5 ? G_STAR : G_o)
                                      : (nf > 0.52 ? G_AT : G_8)),
             /* 0.72 AND NOT 0.5: the highlight is a FLECK, so it gets under a third of the mid
              * tier and the pink keeps the rest. At 0.5 the crown read as two interleaved bands of
              * equal weight rather than as a pink mass with light coming through it. The glyph
              * split above stays at 0.5 deliberately — mark and hue changing on different isolines
              * of `fw` is what stops the canopy banding, since a cell that changed shape AND colour
              * together drew the two fields as one edge.
              * THIS MOVES THE EDO NIGHT, DAWN AND DUSK FRAMES, declared as the contract requires;
              * `fw` is spatial noise on world height and not a clock quantity, so it is the
              * material case and not the forbidden scale one. */
             tier === 1 ? (fw > 0.72 ? cB : cA) : cA,
             lum, d);
      }
    }
  }

  /* ==================================================================================== the tree ===
   * Trunk, three limbs, a fork, and three billows of canopy.
   *
   * ---- IT DOES NOT SWAY, AND THE ARITHMETIC IS WHY ----------------------------------------------
   * A crown at 14 m subtends 2*3.2*colK/d = 63 columns (colK is 137.6 at 200 columns and fov 1.25)
   * with roughly 150 cells on its rim. A gentle 0.6 Hz sway of +/-0.12 m is +/-1.2 columns at that
   * range, so every one of those rim cells would alternate crown-against-sky at 1.2 Hz — with a
   * second harmonic at 2.4 and a third at 3.6, and the third one is inside the band — at a day
   * contrast of white at printed v ~200 against sky, i.e. about 70% of full scale. That is
   * catastrophic and it is exactly the shape jp_town.js:526-535 and west_town.js's windmill note
   * already describe. The tree is static.
   *
   * CC.reducedMotion therefore needs no branch here, and the house rule "damp or freeze, and say
   * which and why" is answered: this element is FROZEN, by construction, at every setting. There is
   * nothing in it that moves for a reduced-motion viewer to be spared.
   *
   * ---- THE TWO PLACEMENTS, ON ONE PROBE ---------------------------------------------------------
   * The heightmap is probed at face + side*0.8 — the first cell of the block, which is the idiom
   * every hanging object in jp_town.js uses:
   *   THERE IS A BUILDING (hB > 1.2): the tree is a KERB tree, 1.35 m out from the frontage into
   *     the carriageway. The toro sits at 0.85; a tree needs another half metre because its canopy
   *     has to clear the eave the toro stands under. Trunk against the wall, crown over the street.
   *     It is IN FRONT of the frontage plane, so nothing can occlude it and no clearance test is
   *     needed or wanted — an earlier version of this design carried one and it did nothing but
   *     delete trees that would have rendered fine.
   *   THERE IS NOT (hB <= 1.2): the tree stands 3.2 m BACK inside the lot and the crown is seen
   *     over the wall. This is the courtyard tree and it is viable only because a crown is TALL:
   *     jp_town.js:108-115's courtyard failure was a ground object at 0-1.3 m behind a frontage,
   *     where a crown at 4.5-7.5 m over a garden quarter whose own hMax is 5.0 projects into cells
   *     the world pass left as SKY at dist Infinity, so CC.put takes it. Same mechanism as
   *     structure.js's masts. This is the case with a real line-of-sight hazard, so it gets a SECOND
   *     probe at the trunk's own cell 3.2 m in — the first probe only says the outer ring is clear,
   *     and TH_JAPAN is setbackMode 'podium' with lots 5-9 m deep, so "outer ring clear" and
   *     "trunk cell clear" are genuinely different questions.
   */
  /* ================================================================================ A LEADER ===
   * One woody stroke from (x0,y0,z0) to (x1,y1,z1), sampled in WORLD space and projected per
   * sample, which is what the three straight stubs this replaced could not be: column() takes
   * one ground position and two heights, so three of them at offset bases draw three parallel
   * vertical bars beside the trunk and the object stays a lollipop. Same method as
   * west_range.js's catenary and jp_town.js's kasagi curve, and it takes the perspective free.
   *
   * THE CURVE IS TWO SEPARATED EXPONENTS AND THAT IS THE WHOLE OF THE S. A cherry leader leaves
   * the fork close to horizontal and arrives at the crown close to vertical; interpolating both
   * axes linearly gives a straight ray, which is a fan, not a tree. Advancing the horizontal on
   * u^0.55 and the vertical on u^1.6 spends the early samples going OUT and the late ones going
   * UP, so the stroke leaves the bole shallow and stands up under the mass it carries.
   *
   * u0 lets the caller re-walk only the upper section — see the through-crown pass, which draws
   * the same world line a second time with a depth bias so it prints INSIDE the blossom.
   *
   * THE GLYPH COMES OFF THE PROJECTED STEP, which is the one place in this file that reads a
   * screen delta, and it is allowed here for a reason the crown could never claim: tlum is a
   * constant across all three glyphs, so a glyph that changes as the camera walks carries NO
   * luminance step with it. The header's world-keying rule exists to stop a cell's BRIGHTNESS
   * crawling; a '/' becoming a '|' at the same value cannot register on a rate gate. */
  function leader(f, x0, y0, z0, x1, y1, z1, u0, w, bias, col, lum) {
    var dh = Math.sqrt((x1 - x0) * (x1 - x0) + (z1 - z0) * (z1 - z0));
    /* Sample off the PROJECTED span, and the vertical dominates it: 3.5 m of rise at 14 m with
     * V.scale 77.4 is 19 rows, which the eight-to-fourteen samples the stubs used could not
     * cover without dashing the stroke. */
    var ns = Math.ceil((Math.abs(y1 - y0) * V.scale + 1.4 * dh * V.colK) / w) + 4;
    if (ns > 30) ns = 30;
    var lx = -1, ly = -1, i;
    for (i = 0; i <= ns; i++) {
      var u = u0 + (1 - u0) * (i / ns);
      var hu = Math.pow(u, 0.55), vu = Math.pow(u, 1.6);
      if (!project(x0 + (x1 - x0) * hu, y0 + (y1 - y0) * vu, z0 + (z1 - z0) * hu)) { lx = -1; continue; }
      var xx = Math.floor(PJ.x), yy = Math.floor(PJ.y), g = G_PIPE;
      if (lx >= 0) {
        var ddx = xx - lx, ddy = yy - ly;
        /* The lean is the SIGN PAIR, not the sign of ddx: '\\' runs top-left to bottom-right, so a
         * stroke leans that way whenever x and y move together on screen. Keying on ddx alone was
         * right for the leaders, which always rise, and inverted for the root flare, which does
         * not — the buttresses came out leaning into the trunk instead of away from it. */
        if (Math.abs(ddx) * 1.6 > Math.abs(ddy)) g = (ddx > 0) === (ddy > 0) ? G_BSL : G_SLASH;
      }
      emit(f, xx, yy, g, col, lum, bias > 0 ? Math.max(0.6, PJ.d - bias) : PJ.d);
      lx = xx; ly = yy;
    }
  }

  function drawTrees(f, axis, idx) {
    var here = alongOf(axis);
    var lo = Math.floor((here - TREE_R) / TREE_PITCH), hi = Math.floor((here + TREE_R) / TREE_PITCH);
    /* The same defensive cap the toro and the lanterns carry: a degenerate camera position must not
     * be able to ask for ten thousand slots. 2*TREE_R/TREE_PITCH is 7, so this only ever fires on
     * a NaN or an infinity coming out of the camera. */
    if (hi - lo > 10) hi = lo + 10;

    /* THE TRUNK IS DRAWN AS BLACK MASS AND THAT IS FORCED BY THE PRINT LADDER, not chosen. Measured
     * through the shipped LUT at this exposure, `timber` prints v 118 at raw lum 246 and `indigo`
     * 102 — both UNDER the muddy band's ceiling of 120 — so there is no luminance of either swatch,
     * at any hour, that prints clean. A trunk is therefore either black or it is mud, and at raw
     * lum 5 timber prints v 7 and indigo v 2, which is black. Everything above about lum 6 lands in
     * the band: the first cut of this file drew the trunk at 116 (v 55) and measured 113 muddy
     * cells from the trunks alone in a single frame, more than the entire canopy contributed.
     *
     * It is also the better picture, which is the usual outcome when the ladder is right.
     * west_range.js's telegraph pole makes the identical call for the identical reason at its lines
     * 102-107 — by day a creosoted pole is DARK against a bright sky, and that inversion is what
     * makes it read at midday. A cherry trunk at noon against a lit street is a black stroke; at
     * night it is a black stroke against a dark one, and the crown above it is black too, which is
     * what surf_japan.js's lampAt says a 3-9 m object must be when the wash is zero above 3.6 m.
     * The glyph and swatch are kept rather than collapsing to shadow-at-zero so that a future
     * exposure pass which lifts the bottom of the ladder gets a trunk with grain in it. */
    var tlum = 4 + 2 * (1 - NIGHT) + 1 * DAYF;
    var tcol = NIGHT > 0.5 ? P.indigo : P.timber;

    for (var side = -1; side <= 1; side += 2) {
      var face = faceOf(axis, idx, side);
      var back = face + side * 0.8;
      for (var k = lo; k <= hi; k++) {
        /* 4.0 m of jitter on a 12 m pitch, so the row is a scatter and not a colonnade. */
        var along = k * TREE_PITCH + hash2(k, side, BASE + 0x61) * 4.0;
        /* The decorrelation term is this file's neighbours' idiom — the toro uses
         * side*3 + (axis?5:0), the noren side*5 + (axis?2:0) — so the two sides of a street and the
         * two axes are independent rolls rather than four views of the same one. */
        if (hash2(k, side * 9 + (axis ? 4 : 0), BASE + 0x62) > TREE_ACCEPT) continue;

        var bx = wxOf(axis, along, back), bz = wzOf(axis, along, back);
        var D = CITY.DISTRICTS && CITY.DISTRICTS[CITY.districtAt(bx, bz)];
        if (!D || TREE_OK[D.name] !== 1) continue;

        var hB = CITY.height(bx, bz);
        var kerb = hB > 1.2;
        var cross = face + side * (kerb ? -1.35 : 3.2);
        var px = wxOf(axis, along, cross), pz = wzOf(axis, along, cross);
        /* The setback tree's second probe — see the placement note above. */
        if (!kerb && CITY.height(px, pz) > 1.2) continue;

        /* Is it worth any work at all? The same three tests moon_craft.js's seeAt() makes: in front
         * of the eye plane, inside the walk's own reach, and not so far off to the side that
         * nothing it owns can land in the frame.
         *
         * THE SLACK IS ADDITIVE AND IT IS SIZED IN METRES OFF THE OBJECT, which is the correction
         * a proportional version taught. The exact frustum edge is |sp| = w * V.hp.
         *
         * THE DERIVATION, and the first version of this note got it wrong twice. It said the reach
         * was 0.40*cr of billow offset plus 0.66*cr of billow radius = 1.06*cr = 3.60 m at the cr
         * ceiling, and shipped 3.6 — which is under even its own figure of 3.604, and the figure
         * itself was wrong. The billow offset points in an ARBITRARY world direction, not a lateral
         * one, so a billow pushed partly away from the eye sits at a larger w and is judged against
         * a WIDER frustum. A sample is visible while |sp + off*cS + uu| < hp*(w + off*cF) with
         * cF^2 + cS^2 = 1 and |uu| <= 0.66*cr, and the worst case over that circle is
         *   0.66*cr + 0.40*cr*sqrt(1 + hp^2) = 1.1544*cr at the default fov = 3.93 m at cr 3.4.
         * That is why LAT is computed in view() from the LIVE V.hp rather than frozen: the viewer
         * can change fov, and a slack fitted to one fov is wrong at the others.
         *
         * The 0.33 m that 3.6 was short cost four poses out of 46,128 scanned per seed, one cell
         * each, every one of them fogged to lum 0 — measured, not assumed. It is corrected anyway
         * because a note that states a bound as proven should state the right one.
         *
         * The version this replaced, `w * (V.hp + 0.10)`, was written as a tightening of a slack
         * that said 14 metres where the line above it said "a crown's own half-width", and it is
         * recorded here because it looked equivalent and was not. 0.10*w only reaches 3.6 m at
         * w = 36 m, so across almost the whole operating range (CAN_NEAR 9.5 m to TREE_R 42 m) a
         * tree whose trunk was just outside the frustum but whose canopy was inside it was culled
         * ENTIRELY — and this cull is per-tree and all-or-nothing, so the canopy did not fade at
         * the frame edge, it vanished between two frames. Measured at seed 42 over 1201 frames,
         * 16 frames differed and the worst lost 316 cells at once across 33 columns; on the cells
         * the tree owned the frame before, that pop is a step of 153/255 with 61 cells over
         * west-flicker's own 85/255 big-step line, at noon. A cull that is invisible to both pinned
         * gates is exactly where a rate defect hides. At this slack the tree draws the same cells as
         * the old +14 rule on every one of 1201 frames at seeds 42, 7 and 404, and still culls far
         * earlier than 14 m of slack ever did.
         *
         * THIS CULL IS NOW LOAD-BEARING FOR SOMETHING ELSE, and that is worth knowing before anyone
         * tunes it again. The anchor publish at the foot of this loop sits BELOW this `continue`, so
         * jp_town.js's petal drift can only shed from crowns that survive this test: a drawing
         * optimisation is now simulation input, and a change here moves the frame through the
         * petals even where it moves no canopy. Measured: +3.6 and +14 give byte-identical EDO
         * frames at f300 and f600 and differ at f900, f1200, f1500 and f1800, and the differing
         * cells are mostly kind 3 while the tree's own owned-cell set is identical at all but 7 of
         * 184,512 scanned poses. If that coupling is ever unwanted, publish the anchor above this
         * line rather than below it. */
        var rx = px - V.ox, rz = pz - V.oz;
        var w = rx * V.fwx + rz * V.fwz;
        if (w < 1.0 || w > TREE_R) continue;
        var sp = rx * V.rgx + rz * V.rgz, lim = w * V.hp + LAT;
        if (sp < -lim || sp > lim) continue;

        /* HEIGHT AND CROWN RADIUS SHARE ONE HASH, which saves a draw and is physically right: a
         * taller tree is a wider tree. th is 3.0-4.9 m of clear trunk — the lower bound is set by
         * lampAt's 3.6 m falloff (surf_japan.js:241-254) and by the eave, because a kerb tree
         * standing 1.35 m off a 2.9-5.0 m frontage needs its crown to start where the eave ends or
         * the canopy is inside the roof and CC.put deletes it. cr is 1.9-3.4 m, i.e. a crown 3.8 to
         * 6.8 m across against a 6-11 m street: the canopy meets the eaves on the far side, which is
         * the read. Crown top is th + cr*1.3 = 5.5-9.3 m, above garden's hMax of 5.0 so the setback
         * tree clears its own quarter's wall. */
        var rr = hash2(k, side, BASE + 0x63);
        var th = 3.0 + rr * 1.9, cr = 1.9 + rr * 1.5;   // CR_MAX below is this line's ceiling

        /* ---- WHERE THE THREE BILLOWS ARE, computed before anything is drawn ------------------
         * The leaders aim at the crown, so the crown's centres have to exist first. This is the
         * same arithmetic the billow loop used to do inline; it moved up here and the loop below
         * now reads the arrays rather than re-deriving them, so there is exactly one definition of
         * where a billow sits and the woody structure cannot drift away from the mass it carries. */
        /* THE SHOULDERS SPREAD ACROSS THE LANE, NOT ON A FREE RING, and this is what makes the
         * fork legible rather than merely present. On a uniform 120-degree ring the two shoulders
         * take a random world bearing, so about as often as not a leader points along the street —
         * which is the view direction for a camera walking it — and a leader that runs into DEPTH
         * projects to no screen spread at all. Measured on the free-ring version: the leaders came
         * out as near-vertical parallel bars, i.e. the fan-seen-edge-on failure the old three-stub
         * comment worried about, reproduced by a different route.
         * Anchoring the two shoulders to the CROSS-street axis is also the truer shape — a lane
         * cherry spreads over the road and into the frontage, not along the kerb — and it is still
         * world-keyed: crossAng is a property of the street, and the jitter is the tree's own hash.
         * The peak keeps a free bearing because at OFF_MID it barely leaves the axis anyway. */
        var crossAng = axis ? 1.5708 : 0;
        var bi;
        for (bi = 0; bi < 3; bi++) {
          var bang = bi === 0
            ? hash2(k, side + 5, BASE + 0x65) * 6.2832
            : crossAng + (bi === 1 ? 0 : 3.1416) + (hash2(k, side + bi * 5, BASE + 0x65) - 0.5) * 1.2;
          /* The peak sits close to the axis; the shoulders swing out. The jitter is halved from the
           * old 0.36 because it is now a jitter ON a profile rather than the profile itself — at
           * 0.36 a shoulder still out-topped the peak on a third of the rolls. */
          var boff = cr * (bi === 0 ? OFF_MID : OFF_F);
          CBX[bi] = px + Math.cos(bang) * boff;
          CBZ[bi] = pz + Math.sin(bang) * boff;
          CBY[bi] = th + cr * (MOUND[bi] + 0.18 * hash2(k, side + bi * 11, BASE + 0x66));
        }

        /* ---- the bole, the fork, the leaders, the flare and the bark -------------------------
         * THE BOLE STOPS AT THE FORK AND THE FORK IS LOW. What this replaced ran one unbroken
         * vertical from the ground to the crown's own underside and then splayed three 0.62 m stubs
         * off the top of it — a post with a ball on it, which is the lollipop read exactly, and the
         * stubs were six screen columns at 14 m inside a crown fifty columns wide. A cherry divides
         * its bole at a third to a half of its height into TWO heavy leaders that carry the rest,
         * and everything the eye uses to name the tree is in that division.
         *
         * fh is 0.40 of the whole tree — bole to crown top is th + cr*1.24 with the mound above —
         * so the fork lands at 2.2-3.7 m, below the crown's underside at th - 0.036cr, which is
         * what puts a visibly FORKED silhouette in the gap between the street and the mass. */
        var fh = 0.40 * (th + cr * 1.24);
        column(f, px, pz, 0, fh + 0.10, G_PIPE, tcol, tlum, 0);

        /* THE FLARE, and the bole's real width, both in WORLD metres on the CROSS-street axis.
         * The `wide` flag column() carries is a step function in apparent thickness — two cells at
         * 19.9 m and one at 20.1 — where a bole is a continuous taper, and at 6 m a 0.35 m trunk
         * genuinely subtends eight columns and was drawn as two. Two short columns straddling the
         * bole give it width that shrinks with distance for free, and they stop at 0.80 of the fork
         * so the bole is three cells at the foot and one at the fork: a taper, not a slab. They
         * REPLACE column()'s `wide` flag rather than adding to it — carrying both made the foot four
         * cells across, which is a pillar.
         *
         * THE AXIS IS THE CROSS-STREET ONE AND THAT IS NOT A DETAIL. Along-street is the view
         * direction for a camera walking the lane, so an along-street offset differs almost purely
         * in DEPTH and lands in the same screen column, widening nothing. They are drawn
         * unconditionally rather than under a distance gate, because a gate only relocates the step
         * it was meant to remove — past a few tens of metres their separation falls under a column
         * and the depth test dedupes them at no cost. */
        var hb = 0.16;
        /* HOW MANY COLUMNS THE HALF-WIDTH IS WORTH, rather than two fixed world offsets. A bole is
         * a solid, so its width has to be FILLED in screen terms: at 0.16 m and colK 137.6 the two
         * offsets are one column apart only near 22 m, and closer in they separate — the first cut
         * of this drew three posts with gaps between them at every near tree, which is worse than
         * the slab it replaced. Stepping the offsets so their projections land about a column apart
         * fills it at any range, and the count collapses to one pair far out, where the depth test
         * dedupes them for free. Capped at four pairs: nine cells is the widest a 0.35 m bole is
         * ever worth, and the cap is what stops a degenerate near camera asking for hundreds. */
        var hbc = Math.ceil(hb * V.colK / w);
        if (hbc < 1) hbc = 1; else if (hbc > 4) hbc = 4;
        var q, qo;
        for (q = 1; q <= hbc; q++) {
          qo = hb * (q / hbc);
          /* The outer pairs stop shorter, so the bole narrows as it rises instead of ending in a
           * flat shoulder — the taper is in the silhouette, not only in the count. */
          var qh = fh * (0.82 - 0.10 * (q / hbc));
          column(f, wxOf(axis, along, cross + qo), wzOf(axis, along, cross + qo),
                 0, qh, G_PIPE, tcol, tlum, 0);
          column(f, wxOf(axis, along, cross - qo), wzOf(axis, along, cross - qo),
                 0, qh, G_PIPE, tcol, tlum, 0);
        }
        if (w < 15) {
          /* The root flare, as two short leaders rather than two columns of '/': column() with a
           * diagonal glyph draws a vertical stack of them, which reads as a dashed post and not as
           * a buttress leaning out of the foot. Sampled in world space, so they lean. */
          leader(f, px, 0.34, pz, wxOf(axis, along, cross + 0.36), 0.02,
                 wzOf(axis, along, cross + 0.36), 0, w, 0, tcol, tlum);
          leader(f, px, 0.34, pz, wxOf(axis, along, cross - 0.36), 0.02,
                 wzOf(axis, along, cross - 0.36), 0, w, 0, tcol, tlum);
        }

        /* THE LEADERS. Two off the fork to the two shoulder billows, and one tertiary off the first
         * leader's midpoint to the peak — so the bole divides in two, which is what the eye reads,
         * and the middle of the crown is carried by a branch rather than by a third ray from the
         * same point. Three rays from one point is the fan this file started with.
         *
         * They stop at 30 m, where a leader is one or two cells inside a canopy that is already
         * writing every one of them. */
        if (w < 30) {
          leader(f, px, fh, pz, CBX[1], CBY[1], CBZ[1], 0, w, 0, tcol, tlum);
          leader(f, px, fh, pz, CBX[2], CBY[2], CBZ[2], 0, w, 0, tcol, tlum);
          /* The tertiary leaves leader 1 at its u = 0.45 point, evaluated on the same two exponents
           * so it starts ON the curve it branches from and not beside it. */
          var mhu = Math.pow(0.45, 0.55), mvu = Math.pow(0.45, 1.6);
          var mx = px + (CBX[1] - px) * mhu, mz = pz + (CBZ[1] - pz) * mhu;
          var my = fh + (CBY[1] - fh) * mvu;
          leader(f, mx, my, mz, CBX[0], CBY[0], CBZ[0], 0, w, 0, tcol, tlum);

          /* One cell at the crotch. 'Y' is the last glyph in GLYPHS and it is literally a fork. */
          if (project(px, fh + 0.06, pz))
            emit(f, Math.floor(PJ.x), Math.floor(PJ.y), G_Y, tcol, tlum, PJ.d);

          /* THE BARK, inside 15 m, and it is what names the species. Sakura is horizontally
           * lenticelled where cryptomeria is vertically fibred, so two rows of '-' across the near
           * bole is the difference between a cherry and a cedar at a glance. Placed at FIXED WORLD
           * HEIGHTS rather than on a screen-row parity, so the banding cannot crawl up the trunk as
           * the camera walks — the same world-keying rule the canopy is built on, for two cells.
           * Keyed to fh and not to th now that the bole ends at the fork, or both dashes would land
           * above the wood they are meant to be on. */
          if (w < 15) {
            if (project(px, fh * 0.42, pz))
              emit(f, Math.floor(PJ.x), Math.floor(PJ.y), G_DASH, tcol, tlum, PJ.d);
            if (project(px, fh * 0.72, pz))
              emit(f, Math.floor(PJ.x), Math.floor(PJ.y), G_DASH, tcol, tlum, PJ.d);
          }
        }

        /* ---- the near cut ----------------------------------------------------------------------
         * Trunk only inside CAN_NEAR. See the constant's own note: inside about nine metres the
         * whole crown is off the top of a 60-row frame and the loop is at its largest. */
        if (w < CAN_NEAR) continue;

        /* ---- SEASON BY MIXTURE, BECAUSE THIS WORLD HAS NO SEASON CLOCK -------------------------
         * 82% of trees are in blossom and 18% are in leaf. A street where every tree is white is a
         * postcard — jp_town.js's header warns about exactly that failure mode with vermilion —
         * and four white with one green is spring.
         *
         * THE LEAF TREE IS DARK ON PURPOSE AND IT IS A MINORITY BECAUSE IT HAS TO BE. Measured
         * through the shipped LUT, `moss` prints v 100 at raw lum 246 and v 93 at night — both
         * UNDER the muddy band's ceiling of 120. So there is no luminance of moss, at any hour,
         * that prints clean: every VISIBLE moss cell is a muddy cell, and the only lever available
         * is how many of them there are. Hence 18% rather than the brief's 32%, x0.62 on the base,
         * and SH_LEAF raising the gap threshold so most of a leaf crown is black mass with a green
         * tint on the lit edge rather than a green fill. Measured, a leaf crown at 14 m contributes
         * 25-40 muddy cells where the brief's 32%-at-x0.72 version contributed roughly four times
         * that and was the single largest muddy source in the element.
         *
         * WHAT THAT COST BUYS IS REAL. Measured night energy at seed 42 has
         * jade at 0.4% and gold, moss, rose, spring and red all at 0.0%, so six of the then-twenty
         * are absent from this world, and a leaf tree is the only large legitimate moss surface EDO
         * has. core.js calls moss "the darkest pigment in the table after shadow, which is what a
         * leaf in ordinary light actually is" — a green tree in this frame IS a dark object.
         *
         * NOT `spring`: core.js fits it as a district accent and west_range.js has already claimed
         * it as "the one living colour in the frame" out on the frontier. NOT `rose`: core.js
         * carries an explicit prohibition on it outside signage and screens, and someiyoshino reads
         * white anyway, which jp_town.js:397-402 already argues. */
        var bloom = hash2(k, side * 3, BASE + 0x64) < 0.82;

        /* Three billows, at the centres the leader pass already fixed — the peak pulled in to
         * OFF_MID and raised, the two shoulders pushed out to OFF_F and dropped. rad RAD_F*cr each,
         * so the union is close to a crown of radius cr with some overdraw, and overdraw is nearly
         * free here because CC.put depth-rejects the second write. See the constants' own note for
         * why the union is mounded and much wider than tall rather than the ball it was. */
        for (bi = 0; bi < 3; bi++) {
          var cbx = CBX[bi], cby = CBY[bi], cbz = CBZ[bi];

          /* ---- THE CANOPY'S LUMINANCE ACROSS THE DAY ----------------------------------------
           * The only time dependence in this whole element is NIGHT, DAYF and LAMP, which are the
           * daylight director's minute-scale clock, and they are split the way drawToro and
           * drawNoren split theirs — a (1-NIGHT) ramp plus a DAYF top end — so the tree comes up
           * with the town rather than on a curve of its own.
           *   NOON  (NIGHT 0, DAYF 1): base 246. The crown-top core prints v ~200 in white, over
           *     the hot line of 170, which is the entire census argument for this element.
           *   DUSK  (NIGHT 0, DAYF 0): base 180. surf_japan.js:143 makes dNight a smoothstep on
           *     (0.30 - dSky)/0.30 and the director reports dSky 0.657 at the dusk stop, so dNight
           *     is exactly 0 there and dFill exactly 0: the canopy is 180, not the 96 a naive
           *     "NIGHT = 0.5" reading would give. Read off the director at all six stops, the
           *     canopy base is dawn 180 / morning 237 / noon 246 / afternoon 237 / dusk 180 /
           *     night 12 — dNight is a two-state quantity over almost the whole clock and the
           *     canopy is never at any intermediate value. Dusk is the hour the element is worst
           *     at: measured, its hot tail is 0.0% at every seed tried because `white` reaches only
           *     v 191 at raw 246 on the dusk ladder and the tiers never leave it there. What it
           *     does instead is black: 43-77% of its cells, and the frame's muddy share still moves
           *     -0.79 to -1.28 points. Stated rather than dodged.
           *   NIGHT (NIGHT 1, DAYF 0): base 12. The crown prints v 3-7 and is pure occluding mass.
           *     That is not a compromise, it is what lampAt says: it is full below 1.0 m and exactly
           *     zero above 3.6 m, and a crown sits at 3.0-9.3 m, so the lamp wash does not reach it
           *     at all. A cherry tree in an unlit lane at night IS a silhouette, and it reads where
           *     it crosses the lit paper frontage.
           *     WHAT THAT COSTS THE VIEWER, WRITTEN DOWN because the line above states the design
           *     and not the price. The canopy base is 12 + 168*(1-NIGHT) + 66*DAYF, which is exactly
           *     12 for the whole night half of a 420 s cycle — 43% of the clock — and the landing
           *     phase is seeded per city, so a large share of first loads open inside it. At the
           *     shipped accept rate this was not a silhouette, it was nothing: seed 42 — the seed in
           *     every fixture and every README table — drew 330.7 crown cells a frame at night with
           *     ZERO of them above the v = 9 black line, max printed value 4, over 1801 frames.
           *     The fix is NOT a night term on this base. NIGHT is read straight off the director's
           *     clock, so `+ 190 * NIGHT` is precisely the scale CONTRACT.md forbids; it was built
           *     and it also makes the crown brighter at night (202) than at dusk (180), the hour
           *     this note calls the element's worst, and takes seed 404's night muddy from 25.6 to
           *     30.8, across the target. The legal version of the same image is to give the LAMP
           *     EXCEPTION below a kerb tree near enough to fire on, which is what raising the accept
           *     rate to 0.32 does: at seed 42 that exception fired zero times in 601 frames on the
           *     shipped tree, and now yields 81.4 visible warm cells a frame.
           *
           * THE ONE EXCEPTION, and it is the one image this element exists for after dark: a lantern
           * lighting the underside of a branch hanging over the street. The low billow of a KERB
           * tree takes a warm lamp term, and only that one — never a setback tree, whose crown is
           * inside a garden with no lantern in it.
           *
           * IT IS GATED ON THE BILLOW'S UNDERSIDE, NOT ITS CENTRE, and that is a bug this file had
           * for one measured round. With th at 3.0-4.9 m and the billow centres at th + 0.44..0.80
           * of cr, a CENTRE is essentially never under lampAt's 3.6 m ceiling: the exception fired
           * on nothing and the night frame measured 100.0% black element cells at both seeds. The
           * UNDERSIDE of the lowest billow is at 2.5-3.4 m, which is the branch a lantern actually
           * lights. The falloff is lampAt's own shape (surf_japan.js:241-254) — full below, smooth-
           * stepped out, zero above — carried to 4.6 m rather than lampAt's 3.6 because lampAt is
           * modelling the wash on a WALL and a branch four metres up over a lantern at 2.12 m is
           * still visibly lit. 132 rather than 96 for the same reason the number had to move at
           * all: measured, warm on the NIGHT ladder needs raw lum ~150 to clear the muddy ceiling,
           * so a term that peaks at 108 could only ever have produced mud.
           *
           * THE COST IS BUDGETED AND IT IS THE ONE PLACE THIS ELEMENT ADDS MUD ON PURPOSE. Measured
           * pooled over eight night frames: seed 42 gives 0.4% of its cells muddy (its walk has few
           * kerb trees low enough), seed 7 gives 26.6%, which is 40-80 cells on the near tree and
           * 0.3-0.7% of a night frame. The frame's muddy share still moves DOWN, -0.34 points at
           * seed 7 and -1.06 at seed 42, because the crown's own black mass more than pays for it.
           * That was the brief's own budget for this exception and it is met. */
          var lowY = cby - cr * RAD_F * RY_F;
          var lf = lowY >= 4.2 ? 0 : (lowY <= 2.0 ? 1 : (4.2 - lowY) * 0.4545);
          var lampT = (kerb && LAMP > 0.02 && lf > 0) ? 148 * LAMP * lf * lf * (3 - 2 * lf) : 0;
          var cb = (12 + 168 * (1 - NIGHT) + 66 * DAYF) * (bloom ? 1 : 0.62);
          /* THE CROWN IS PINK, in `blossom` — core.js slot 20, the pale-pink SURFACE swatch that
           * was appended for exactly this and is the first pink in the table allowed to cover area.
           * It is NOT `rose`: rose is a neon tube, gain-bounded to 0.20/0.18 so it can never clear
           * the hot line, and it prints 85 at noon against blossom's 221 — a rose crown is 100%
           * muddy by construction. Measured through the shipped LUT at dist 6, printed ceilings:
           * blossom 159 night / 203 dawn and dusk / 221 noon, against white's 163/209/226 and
           * sand's 163/207/224. So the pink sits a shade under the white it is stippled with at
           * every hour, which is the right way round, and it still crosses the census hot line of
           * 170 by day — the crown stays EDO's only day-hot surface, which is the whole reason the
           * previous white version was defensible.
           *
           * WHITE IS THE MINORITY AND IT IS THE HIGHLIGHT. A someiyoshino mass is not flat: it is
           * pink with pale flecks where the light comes through, which is what the reference pixel
           * art draws and what the fw split below produces. cA carries the core and the rim, cB
           * flecks the mid tier only.
           *
           * When the lamp term is what is actually lighting this billow the light does start to own
           * the hue — warm paper light on a pale flower is warm — but the whole crown going `warm`
           * turned a cherry into a yellow ball hanging over the street. So the lamp case keeps the
           * pink in the mass and spends `warm` on the flecks instead: a pink tree with a lantern
           * under it, rather than a lantern-coloured tree. */
          var warmLit = lampT > 18 && NIGHT > 0.5;
          var cA = bloom ? P.blossom : P.moss;
          var cB = warmLit ? P.warm : (bloom ? P.white : P.moss);

          /* The gap threshold for this billow, walked out with its own depth — see SH_FAR. shK is
           * the reciprocal of the ramp width, hoisted here so the inner loop is one multiply. */
          var far = (w - SH_D0) * SH_DK;
          if (far < 0) far = 0; else if (far > 1) far = 1;

          billow(f, cbx, cby, cbz, cr * RAD_F, cr * RAD_F * RY_F,
                 BASE + 0x67 + bi, cb, lampT * (bloom ? 1 : 0.62), cA, cB,
                 SH_LO + SH_FAR * far + (bloom ? 0 : SH_LEAF), 1 / SH_W, far * 0.85);
        }

        /* ---- the branches SEEN THROUGH the blossom ---------------------------------------------
         * THE MOST DISTINCTIVE THING ABOUT THE REFERENCE IS STRUCTURE VISIBLE INSIDE THE MASS —
         * dark strokes crossing the pink, heaviest in the upper middle — and until this pass it was
         * not merely absent but structurally impossible. The leaders are drawn at the trunk's own
         * depth, while every billow cell is pushed toward the camera by up to off + rad*0.86; CC.put
         * tests strict `dist < f.dist[i]`, so the canopy overwrote the whole splay wherever it
         * covered it, which was everywhere. Measured on the tree this replaced, over 1200 autopilot
         * frames: 82.6% of the limb cells the element wrote never reached the frame at seed 404, and
         * the `Y` the old comment called "the difference between a lollipop and a tree" landed in
         * 5.3% of its attempts — 0.07 cells a frame.
         *
         * So the upper half of each leader is walked a SECOND time with a depth bias, and the bias
         * is derived rather than picked: it must exceed the furthest forward any billow cell can be
         * pushed (off + rad*0.86) so the stroke wins inside the mass, and exceed it by only a few
         * centimetres of cr so the stroke stays within the tree's own volume and cannot print in
         * front of something standing between the camera and the crown. At cr*1.19 it lands about
         * 4 cm of cr ahead of the crown's own frontmost cell, which the crown already occludes —
         * nothing new is punched through the picture.
         *
         * Only from u = 0.45, because below that the leader is already in clear air and drawn; only
         * inside 26 m, beyond which it is one or two cells inside a mass that is writing them
         * anyway; and one cell wide, never `wide`. */
        if (w < 26) {
          var BR_D = cr * (OFF_F + 0.86 * RAD_F + 0.04);
          leader(f, px, fh, pz, CBX[1], CBY[1], CBZ[1], 0.45, w, BR_D, tcol, tlum);
          leader(f, px, fh, pz, CBX[2], CBY[2], CBZ[2], 0.45, w, BR_D, tcol, tlum);
          var thu = Math.pow(0.45, 0.55), tvu = Math.pow(0.45, 1.6);
          leader(f, px + (CBX[1] - px) * thu, fh + (CBY[1] - fh) * tvu, pz + (CBZ[1] - pz) * thu,
                 CBX[0], CBY[0], CBZ[0], 0.30, w, BR_D, tcol, tlum);
        }

        /* ---- publish the anchor ----------------------------------------------------------------
         * Recorded AFTER the draw, only beyond 13 m, and only while there is room. See the anchor
         * block above for why 13 and not 0. aY is the crown top and aR is 1.2*cr so a consumer that
         * spawns inside that radius spreads the drift slightly wider than the crown rather than
         * dropping a column of petals down one trunk. */
        if (FL.n < ANC_N && w > 13) {
          FL.x[FL.n] = px; FL.y[FL.n] = th + cr * 1.05;
          FL.z[FL.n] = pz; FL.r[FL.n] = cr * 1.2;
          FL.n++;
        }
      }
    }
  }

  /* ================================================================================ registration ===
   * LAYER 18, which is free in this world: 16 is the torii, 17 the toro and the market, 19 the
   * lanterns, 20 the noren and street.js's crowd, 21 and 22 street.js and the blossom. The only
   * other element at 18 is street.js's foodstalls, which is world 'cyber' and is filtered out
   * before the layer sort, so no tie is created and main.js:157-164's readdirSync tie-break hazard
   * is not touched.
   *
   * IT DRAWS BEFORE THE BLOSSOM (18 < 22), which is what makes the anchor list this frame's rather
   * than last frame's for anything that reads it in draw(). A consumer that reads it from update()
   * gets the PREVIOUS frame's, because main.js runs every update() before every draw() — that is
   * one frame of staleness on a static object, i.e. none, and it is already this file's neighbour's
   * pattern (jp_town.js reads the previous frame's W_WIND for the same reason).
   *
   * ITS init() CONSUMES NO rng. main.js hands one shared generator to every element's init in layer
   * order, so an element that drew from it would shift the thirty draws jp-blossom makes and change
   * every fixture in the world. boot(city) draws nothing, so registering this element is neutral by
   * construction — the shared-init-rng trap closed rather than hoped about. */
  function mk(name, layer, fn) {
    return {
      name: name, layer: layer, world: 'japan',
      init: function (city) { boot(city); },
      draw: function (f, cam, t) {
        if (!CITY) return;
        view(f, cam, t === undefined ? (cam.t || 0) : t);
        fn(f);
      }
    };
  }

  CC.ELEMENTS.push(mk('jp-sakura', 18, function (f) {
    /* The anchor list is rebuilt from empty every frame. A consumer must therefore tolerate n = 0 —
     * which happens whenever the walk is between eligible quarters — by falling back to whatever it
     * did before. A drift that emptied its pool instead would blink out every time the camera left
     * a garden. */
    FL.n = 0;
    /* Three street indices either way on both axes, the same reach the toro and the lanterns walk.
     * THERE IS NO WEATHER BRANCH, deliberately. jp_town.js's drift switches off above rain 0.35
     * because a petal drawn through several hundred cells of elements/weather.js's rain only
     * muddles it; a TREE is the thing the rain falls past, and a cherry that vanished in a squall
     * would take the street's whole silhouette with it. The wet air reaches it through Surf.fog
     * inside emit(), which is where it belongs. */
    var i;
    for (i = -1; i <= 1; i++) drawTrees(f, 0, nearIdx(0) + i);
    for (i = -1; i <= 1; i++) drawTrees(f, 1, nearIdx(1) + i);
  }));

})(typeof CC !== 'undefined' ? CC : require('../core.js'));
