/* CyberCity skylanes — floating cars. Aerial traffic in the slot between the rooftops.
 *
 * WHAT IT IS. Lanes of airborne vehicles laid out ON THE STREET GRID, three altitudes deep. Every
 * avenue carries lanes running along +z above it and every cross street carries lanes running
 * along +x above it, so the traffic overhead is the same lattice as the traffic on the ground,
 * one storey-block up. That single decision buys both of the orientations the piece needs and it
 * buys them WITHOUT the element having to know which way the camera is facing:
 *
 *   - the lane over the corridor the camera is walking runs AWAY DOWN THE CANYON and converges on
 *     the vanishing point. This is the money shot — a line of tail lamps shrinking into the slot —
 *     and it is the only thing in the frame above the rooftops that reads as depth;
 *   - the lanes over the cross streets ahead run ACROSS the canyon mouth, so each one is a stream
 *     of lights sliding through the gap between the buildings and out again.
 *
 * A camera-relative bearing scheme (the one sky.js uses for blimps, drones and airliners) cannot
 * do this: a bearing has no vanishing point, so a "lane" laid out that way is a row of dots that
 * slides sideways, never a corridor. The cost of going world-anchored is that this file has to
 * reproduce raycast.js's projection exactly rather than sky.js's; that is the block below, copied
 * from elements/street.js, which is where the ground traffic does the same thing.
 *
 * THE SLOT IS TINY AND THAT SIZES EVERYTHING HERE. Measured on this build at 213x67, seeds 3001 /
 * 3275 / 3549 at frames 600 and 1800: the cells the world pass leaves as sky are ~2% of the frame
 * and they are one wedge about 25 columns wide at the top of the picture, tapering to nothing at
 * the horizon around column 100-130. Everything this file draws lands in that wedge or is
 * occluded, so twenty vehicles in the air is four on screen. Count is the parameter that decides
 * whether this reads as traffic or as a swarm of insects, and it is set at the bottom of the
 * constants block with the arithmetic that produced it.
 *
 * DEPTH, WHICH IS THE WHOLE OF THE OCCLUSION. Surf.FOG_END is 125 m and the raycaster breaks its
 * march there, so no facade cell ever carries a larger dist. Handing put() anything at or beyond
 * 125 therefore makes it self-occluding for free — it survives only where the world pass left
 * dist === Infinity, which is exactly the rooftop silhouette. So a vehicle's TRUE radial distance
 * is remapped onto 126 + 0.38*d (see SKY_NEAR/DSLOPE): monotone, so a near vehicle still occludes
 * a far one, past SKY_D so the print curve treats it as backdrop rather than crushing it in the
 * fog buckets, and under 320 m, which is the closest an elements/sky.js blimp can ever be, so a
 * blimp cannot swallow a car that is in front of it.
 *
 * PRINT BUDGET, MEASURED THROUGH core.js's LUT AT THE BACKDROP BUCKET (which is where every cell
 * this file writes lands, so the near-end gamma lift applies to all of it):
 *     P.shadow  lum 10 -> v 7      lum 12 -> v 10   lum 15 -> v 14   (and it tops out at v 60)
 *     P.amber   lum 100 -> v 127   lum 152 -> v 148   lum 174 -> v 156
 *     P.azure   lum  61 -> v 137   lum  92 -> v 158   (110 -> v 170, i.e. HOT: azure is capped)
 *     P.red     lum  78 -> v 133   lum 118 -> v 154   lum 138 -> v 164
 * The muddy band the build is over budget on is v 9-119 and the hot tail is v >= 170, so this file
 * aims every lit cell it writes into the 120-169 gap between them and keeps its one mid-tone —
 * the hull — as low in the band as a shape can be and still be a shape. Three consequences:
 *   - THE HULL IS A DIM SLAB AT v 14, NOT BLACK, AND THAT WAS A TRIM. It used to be P.shadow at
 *     lum 10 (v 7), i.e. invisible, on the argument that a hull only exists to occlude. Rendered
 *     and looked at, that argument was wrong, and the file contained its own A/B proof: the
 *     freighter's hull was ALREADY lifted to lum 15 (v 14) and the freighter was the only vehicle
 *     in the whole fixture that read as a vehicle — `o#####o`, two lamps joined by a body. Every
 *     car was `o` gap `o`, two specks with nothing between them, and a review looking at the sky
 *     slot at 6x could not find a vehicle at all. Two lamps do not make an object; the BODY
 *     BETWEEN THEM does. So the car hull is lum 15 too, and the count was cut to pay for it (see
 *     NPER). This is the one place in the file that deliberately spends the muddy band, it is
 *     10.7 cells a frame, and it is what buys the whole element its legibility.
 *   - NO LAMP IS EVER WRITTEN ABOVE RAW LUM 174, because elements/optics.js's lensbloom picks its
 *     sources at raw lum >= 175 and its horizontal streak writes 2-4 cells per side at ~30% of the
 *     source, which lands squarely in the muddy band. One bloomed lamp would cost more muddy cells
 *     than the vehicle that threw it.
 *   - A LAMP THAT CANNOT STAY ABOVE v 120 IS NOT DRAWN AT ALL. Distance and fog scale the lamp
 *     luminance, and when that scale falls under MIN_SCALE the whole vehicle is dropped instead of
 *     being drawn as a dim smudge. "Bright and sparse, or honestly black" — a fading lane is the
 *     grey veil this frame cannot afford. Note the hull does NOT scale with range: a body that
 *     fades out stops joining its own lamps, which is the failure this trim exists to fix.
 *   - NOTHING IS DRAWN NARROWER THAN THREE COLUMNS. A one-cell vehicle is a star. See NMIN.
 *
 * COLOUR. Three swatches only: amber and azure for head and underside lamps (the two pillars, so
 * the census does not move), red for tail lamps and the freighter beacon. ember, warm and white
 * were all tried and all rejected on the same measurement: under raw 175 their usable window
 * between v 120 and the bloom threshold is a few lum wide or empty (white tops out at v 131 at
 * raw 174 and is already muddy by raw 135), so a fading white lamp walks straight into the muddy
 * band. ice is a two-cell glint elsewhere in the build and adding six cells a frame of it here
 * would have doubled its share of the frame's lit energy; violet is signage-only.
 *
 * WHAT IT COSTS THE PRINT, measured with-vs-without over seeds 3001 + 137k for k = 0..5 crossed
 * with frames 600 and 1800 at 213x67 — twelve frames, the whole build rendered twice off a frozen
 * copy of src/, because the repo is edited under the measurement and three consecutive baselines
 * taken from the live tree disagreed by two and a half points of muddy on their own. Numbers are
 * for the trimmed file; the pre-trim column is what the same fixture said before:
 *                        without      pre-trim      trimmed
 *     muddy (v 9-119)    27.2698%     27.2049%      27.2750%   DELTA +0.005 points  (budget +0.0)
 *     hot   (v >= 170)    4.5290%      4.5232%       4.5272%   DELTA -0.002 points
 * The pre-trim muddy delta was NEGATIVE (-0.065) because the hulls were black and painted OUT
 * cloud-deck cells at v 20-46; the trim spends that credit back on making the hulls visible and
 * lands at break-even, because the count cut very nearly cancels the lift. The element prints 20.6
 * cells a frame on that fixture (0 under mist), of which 9.8 are lamps at v >= 120, 10.7 are hull
 * in the bottom of the muddy band and 0.2 are under v 9 — and the hull cells are now the point
 * rather than the tax.
 *
 * AND WHAT IT BOUGHT, on the same twelve frames, grouping the element's own cells into 8-connected
 * blobs so a vehicle is counted as one object rather than one row:
 *                                    pre-trim     trimmed
 *     blobs a frame                    5.7          4.1
 *     of those, >= 3 cells & >= 2 lit  31 of 68     36 of 49   (46% -> 73%)
 *     ONE-CELL blobs (i.e. stars)      24           6
 *     blobs printing NO lit cell        5           2
 * Fewer objects, and three quarters of them are now a body with a lamp at each end instead of
 * under half. That is the whole of the "I cannot find a VEHICLE" finding.
 *
 * PHOTOSENSITIVITY. THIS ELEMENT IS NOW INSIDE THE SHIPPED HARNESS, AND IT FAILED THE FIRST TIME
 * IT WAS RUN. The previous version of this section said that tools/flicker-rate.cjs looks up four
 * elements by name (`neon`, `shopSpill`, `signals`, `holo`), that its six PASSes therefore said
 * nothing whatever about this file, and that the numbers below had to be taken on a private fixture
 * rebuilt by hand. That gap is closed: `police`, `ads` and `skylanes` are on that tool's NAMES list
 * now, and the passes this file used to cite were about signage. Everything below is the shipped
 * tool's own output — element ALONE on an empty frame, camera FROZEN, seeds 0/7/42/555 x eight
 * bearings x 20 s at 60 Hz, steps on raw lum, MAX_FRAME_STEP 0.34 of 255 and MAX_CELL_RATE 1.0 big
 * steps a second in ONE cell. Run on the WORST preset for this element, which is `clear` and not
 * `storm` — clear has the least fog, so the range gate opens all the way and the most vehicles are
 * drawn. First honest run / after the two repairs and the speed cut below:
 *
 *     section 2, worst per-cell frame step      59.6% -> 59.6% of 255   (its ceiling is 34%)
 *     section 2, busiest cell over-34% rate      2.05 -> 0.90 /s        (its ceiling is 1.0)
 *     section 4, reduced motion, worst step   152/255 -> 0/255          (its ceiling is ZERO)
 *
 * TWO REAL DEFECTS WERE FOUND AND BOTH ARE FIXED. Neither was a matter of tuning:
 *   - REDUCED MOTION DID NOT STOP THE TRAFFIC. Position is a pure function of t, so damping the
 *     clock by 0.10 slowed the lanes and never stopped them; quantised motion has no small steps,
 *     so a lamp crossing a column boundary is a 152/255 cell step at any speed above zero. The
 *     clock is now stopped dead. The measurement, the arithmetic and the toggle behaviour are at
 *     the TT line in draw().
 *   - AN UNLIT BEACON WAS STILL TAKING ITS CELL. The freighter beacon is written at lamp depth, and
 *     put() resolves on depth rather than on brightness, so the near-zero tails of its envelope
 *     painted a black cell over whatever was behind it: 115 -> 3 -> 115 twice every 2.4 s, 0.80 big
 *     steps a second in one cell, with the traffic FROZEN. See BEACON_MIN.
 * Two earlier flicker bugs, both of the same family — a vehicle JUMPING columns instead of moving —
 * are written up where they live, at the aperture fit.
 *
 * WHAT IS LEFT IS THE TRAFFIC ITSELF, AND IT IS PAID FOR IN SPEED. A cell in the sky slot is lit
 * once per vehicle that crosses it and a crossing costs about four over-34% steps (sky to lamp,
 * lamp to hull, hull to the second lamp, lamp to hull), so the per-cell rate is set by how many
 * vehicles pass a cell per second — which is flow, i.e. count times speed. Count is what the
 * legibility work above bought and it is not for sale; speed is free in the picture (positions fold
 * into SPAN, so the number on screen never changes) and it is what carries the reduction, for the
 * second time in this file's life. The full lever table, measured, is at `spd`.
 *
 * AND THE ONE STRUCTURAL ALTERNATIVE, recorded because it is the right answer if a reviewer ever
 * wants this element's motion back at full speed. The tool's rule is that no cell may step more
 * than a third of full scale; 255/3 is 85. If NO cell this file writes could ever exceed raw 85,
 * a big step would be arithmetically impossible and the rate rule would never be reached, at any
 * speed or density — one clamp in plot() and the gate is closed for ever. It is not taken here for
 * one reason: through core.js's current exposure at the backdrop bucket an amber cell needs raw 69
 * to clear v 120 and stop being muddy (azure needs 34, red 60), so amber lamps would live in
 * 69..85 — a window narrower than the range fade alone — and in `storm`, where VIS is 0.77, amber
 * cannot clear v 120 at all under an 85 cap. Complying that way means taking amber out of the
 * element, and amber is a census pillar; that is a decision about the whole picture and not one
 * this file should make on its own.
 *
 * (Note for whoever re-derives the print numbers: the LUT table further up this header is STALE.
 * Measured through the current core.js at the backdrop bucket, P.shadow 15 prints v 56, not v 14;
 * P.azure 92 prints v 175, i.e. inside the hot tail; P.amber 152 prints v 163 and P.red 118 v 154.
 * The design decisions above still hold — the hull is still the dimmest thing that is a shape and
 * the lamps still land between the muddy band and the bloom threshold — but the exact figures in
 * the PRINT BUDGET block were taken against an older exposure and have not been re-derived.)
 *
 * DETERMINISM. Nothing is stored between frames and nothing is integrated. A vehicle's position is
 * a pure function of (t, lane index, slot index) folded into a span centred on the camera, so a
 * scrub to any t gives the same frame as replaying to it. Everything else about a vehicle is
 * hashed off (lane index, slot index) — world identity, never the screen cell and never the frame
 * — with one independent draw per decision on its own salt.
 */
(function (CC) {
  'use strict';

  var P = CC.P, g = CC.g, put = CC.put, hash2 = CC.hash2;

  /* g() is a string lookup and these are hit a few hundred times a frame. */
  var G_DASH = g('-'), G_EQ = g('='), G_HASH = g('#'), G_o = g('o'), G_UNDER = g('_');

  /* ---- the lanes ------------------------------------------------------------------------------
   * THREE ALTITUDES, and they are set by what the frame can actually see rather than by what a
   * city would plausibly stack. The picture reaches atan(horizon/scale) ~= 24.5 degrees above the
   * eye, so a lane at height Y only enters the frame at all beyond w = (Y - 1.7) / 0.455 metres:
   * 60 m for the low lane, 80 m for the middle one, 104 m for the high one. That is the mechanism
   * that keeps the near half of every lane out of shot without a single distance test — a lane
   * flies over the top of the frame until it is far enough away to be small.
   *
   * Directions alternate with altitude, which is how a real stack of one-way levels works and is
   * also the only way to get both a receding stream and an approaching one in the same view. */
  var NLEV = 3;
  var ALT = [29.0, 38.0, 49.0];
  var DIRS = [1, -1, 1];

  /* Not every street carries every level: with all three running on every street the crossing
   * lanes stacked three deep over the same junction and read as a ladder rather than as traffic.
   * 0.74 leaves most streets with one or two levels live and the occasional one with all three,
   * which is what gives the sky above a junction any variety at all. */
  var LANE_P = 0.74;

  /* HOW MANY VEHICLES, and this is the arithmetic the file header promises — plus the count that
   * was actually measured off a rendered frame, because the arithmetic below only predicts the
   * ones that are in the frustum and the wedge throws most of those away.
   *
   * One lane's slots are spread over SPAN metres of run, so the mean spacing is SPAN/NPER = 69 m.
   * The visible lateral window of a CROSSING lane is a constant in metres regardless of range,
   * because the sky wedge widens with the same 1/w the vehicle shrinks with: half-window =
   * (ALT - eye)*SCALE / (1.9*CPM) ~= 7 m. So ~14 m of a lane's 69 m spacing is on screen and a
   * crossing lane-level shows a vehicle about 20% of the time; with ~13 cross streets inside W_MAX
   * and 3 levels at LANE_P that is 13*3*0.74*0.20 ~= 6 crossing vehicles in the frustum, and the
   * along lane contributes another 4 over its 78..380 m of visible run. Most of those are behind a
   * building — that is what the wedge does — so the number to trust is the next paragraph's.
   *
   * NPER WAS 10 AND THE TRIM CUT IT TO 7, and the reason is not the print budget — the element was
   * measured free at 10 — it is that ten was buying the wrong thing. Counted off the isolated diff
   * over the twelve-frame fixture, NPER 10 printed 9.6 separate horizontal RUNS a frame and 52 of
   * the 115 runs in the fixture were ONE CELL LONG, with only 6 runs anywhere carrying three lit
   * cells. That is not traffic, it is a second star field laid over the first one, and a review
   * looking at the slot at 6x reported exactly that. Seven slots with a visible body and a
   * guaranteed three-column footprint (see NMIN and HULL_CAR) puts about the same number of CELLS
   * on screen in a third fewer OBJECTS, each of which is an object. Fewer, better-placed, still
   * bright is the house rule and this is the line it applies to.
   *
   * BOTH ENDS OF THE RANGE WERE RENDERED AND LOOKED AT, which is the only way to set this. A cut
   * at NPER 6 / LANE_P 0.58 printed 4 cells on s3001_f600 and 20 on s3001_f1800 — two vehicles,
   * indistinguishable from a pair of stray stars in a field that already has four hundred of them.
   * A trial at NPER 12 with every street carrying every level put fifteen lamps into the apex of
   * the wedge at once, which is where perspective piles the whole far half of the along lane, and
   * read as midges. */
  var NPER = 7, SPAN = 480.0, SLOT = SPAN / NPER;

  /* One in seven is a freighter: longer, a third of the speed, and the only thing in this file
   * that pulses. Below about one in ten they stop being a feature of the traffic and become a
   * surprise; above one in four the lanes stop looking like commuting. */
  var FREIGHT_P = 0.15;

  /* Vehicle boxes in metres. The car is a large saloon in PLAN; the freighter is a box van the
   * length of an articulated lorry, which at these ranges is the 7-9 cell slab it needs to be to
   * read as heavy next to a 3-cell car.
   *
   * THE WIDTHS ARE SPANS, NOT TRACK WIDTHS, AND THAT IS THE OTHER HALF OF THE LEGIBILITY FIX.
   * These are aircraft: what an airframe shows you end-on is the span of whatever holds it up —
   * ducted fans on outriggers — not the width of the cabin. It was written as a road car's 2.0 m
   * and that number is what killed the money shot. The along lane is seen END-ON, so its screen
   * width is 0.5*W*CPM/w: at 2.0 m that is 148/w columns, i.e. under half a column past 296 m, so
   * every car in the receding lane collapsed to a SINGLE cell and the "line of tail lamps
   * shrinking into the slot" printed as scattered red dots. 3.2 m gives 236/w, which stays over
   * half a column to 473 m — past the far end of the gate — so an along-lane car is three columns
   * wide at every range this element draws it and its two tail lamps have a body between them.
   * 5.4 for the freighter keeps the same 1.7x proportion the pair had before. */
  var CAR_L = 4.8, CAR_W = 3.2, CAR_H = 1.5;
  var FR_L = 17.0, FR_W = 5.4, FR_H = 3.4;

  /* Range gate. W_MIN is one storey-block: nearer than that a lane is overhead and out of frame
   * anyway (see the altitude note above), and the area retire below has already fired. W_MAX is
   * set by the fade: past 380 m the lamp scale is under MIN_SCALE and the vehicle would be
   * dropped on the next line regardless, so the cull saves the projection. */
  var W_MIN = 78.0, W_MAX = 380.0;

  /* THE PHOTOSENSITIVITY RETIRE, AND IT IS ON AREA, NOT ON DISTANCE. Anything that can approach
   * the camera has to retire on the share of the frame it covers, because a near object that
   * suddenly fills the view is the worst case for a whole-frame luminance step.
   *
   * TWO SEPARATE THINGS BOUND IT AND IT IS WORTH SAYING WHICH DOES WHAT. The hard bound is the
   * CLAMP on nx (2 for a car, 4 for a freighter): whatever the geometry says, no vehicle is ever
   * drawn wider than nine columns or taller than two rows, so one vehicle can never cover more
   * than 18 cells, 0.13% of a 213x67 frame. MAXCELLS is the second bound and it is about honesty
   * rather than safety: when the true, unclamped footprint is much bigger than the clamp can
   * honour, drawing it clamped puts a five-cell stub where a twenty-cell object belongs, so the
   * vehicle is dropped instead. 14 is the smallest value that still lets a 17 m freighter be seen
   * BROADSIDE — it is 9 columns across even at the far end of the gate — which is the whole point
   * of having a freighter. In practice the retire fires on crossing cars inside ~55 m (already
   * under W_MIN, so never) and on crossing freighters inside 150-240 m depending on the length
   * roll.
   * Retiring one costs the frame at most three lit cells, so the step it can produce is 0.02% of
   * the picture — three orders of magnitude below anything the flag is about. */
  var MAXCELLS = 14;

  /* THE OTHER END OF THE SAME BOUND: the smallest footprint that is allowed to exist. Below three
   * columns a vehicle is one lamp, or two lamps with nothing between them, and the frame already
   * contains four hundred stars for it to be confused with — a review at 6x could not tell this
   * element's output from stray facade specks and that is the finding this constant answers. So
   * the half-width is floored at 1 and the body is drawn even when the geometry says it is
   * sub-cell. With CAR_W at 3.2 the true half-width only falls under 0.5 columns past 473 m, which
   * is outside the range gate at 213 columns, so at fullscreen this floor is a guarantee that
   * never fires; it earns its place on NARROW grids, where CPM shrinks with the column count and a
   * 160-column render puts the along lane's far half under half a cell. The aperture fit further
   * down enforces the same three columns against OCCLUSION rather than against range, and drops
   * the vehicle outright when the sky it is seen through is narrower than that. */
  var NMIN = 1;

  /* How many lattice steps out to look. 12 avenues at the 30 m pitch and 14 cross streets at 26 m
   * both reach past W_MAX; the per-lane cull below throws away all but two or three of them before
   * a single vehicle is hashed. */
  var KSPAN = 12, MSPAN = 14;
  /* A lane further off to the SIDE than this can only ever appear at long range and at a lateral
   * screen offset the sky wedge has already closed over, so it is culled outright unless it is a
   * crossing lane (which is caught by the forward test beside it). Measured: at 300 m a 22 m
   * offset is 10.7 columns from the centre, and the wedge at the row a 38 m lane prints on at that
   * range is about 6 columns wide. */
  var LANE_SIDE = 22.0;

  /* THE DEPTH REMAP. See the header. 126 keeps every cell past core.js's SKY_D (which is FOG_END,
   * 125.0) so the print treats them as backdrop, and the slope keeps the far end under the 320 m
   * floor of elements/sky.js's blimps so a blimp can never swallow a car in front of it.
   *
   * 0.38 AND NOT 0.5, AND THE DIFFERENCE IS THE COSINE. The quantity remapped here is the RADIAL
   * distance PJ.dist = w * sqrt(1 + sp*sp), not the forward distance w: at the edge of the gate
   * (w = 380, |sp| = 0.75 at the frame edge) that is 475 m, so a 0.5 slope put the far corner of
   * the lane at 363 — thirteen percent past the blimp floor the line was written to stay under.
   * 0.38 puts the whole range in 155..306, still monotone in the true distance, which is what
   * makes two vehicles in the same column resolve correctly. */
  var SKY_NEAR = 126.0, DSLOPE = 0.38;

  /* Lamp luminances, chosen off the LUT table in the header so that every one of them prints
   * between v 120 and v 169 at full scale AND still clears v 120 at MIN_SCALE. That second
   * condition is what fixes MIN_SCALE at 0.66 rather than at something more generous: amber 152
   * falls to raw 100 (v 127) and azure 92 to raw 61 (v 137), and one step further down the fade
   * both are in the muddy band. */
  var HEAD_AMBER = 152, HEAD_AZURE = 92, TAIL_RED = 118, UNDER_AMBER = 132, BEACON_RED = 138;
  var MIN_SCALE = 0.66;
  /* The lamp fade with range: full out to 90 m, MIN_SCALE at W_MAX. It is a visibility term, not
   * an inverse square — at ASCII resolution a distant lamp loses SIZE, not brightness, and a real
   * 1/d^2 would have every vehicle past 150 m sitting in the muddy band. */
  var FADE = 0.00117;

  /* Hull luminance, and this is the constant the trim turned over. P.shadow prints 10 -> v 7,
   * 12 -> v 10, 15 -> v 14, 17 -> v 18 at the backdrop bucket, and it tops out at v 60 however
   * hard it is driven, which is why it is the only swatch that may carry area at all.
   *
   * HULL_CAR WAS 10 (v 7, i.e. black) ON THE ARGUMENT THAT A HULL ONLY HAS TO OCCLUDE. That is
   * true of the depth test and false of the picture. The evidence was already inside this file:
   * the freighter alone was lifted to 15 and the freighter alone read as a vehicle in the twelve
   * frame fixture — `o#####o`, two lamps with a body joining them — while every car printed `o`,
   * an invisible cell, `o`, which the eye resolves as two unrelated specks, not as one object
   * three columns wide. So the car hull is 15 too. It is one to three mid-tone cells per vehicle
   * at the very bottom of the muddy band, about 13 cells a frame across the whole element, and
   * NPER was cut from 10 to 7 in the same change so the file still measures at break-even.
   *
   * The freighter keeps its separation by GLYPH and by SIZE rather than by luminance — '#' is a
   * blocky fill and '=' is two thin strokes, and a freighter is 7-9 columns against a car's 3-5 —
   * so both bodies can sit on the same 15 and neither has to be pushed further up the band. The
   * freighter's roof row is HULL_FR - 3 (v 10): a top face catches less than a side, and it only
   * has to be present, not modelled. */
  var HULL_CAR = 15, HULL_FR = 15, HULL_ROOF = 12;

  /* THE ONE THING IN THIS FILE THAT PULSES: the freighter's beacon, at 0.42 Hz — a 2.4 s period
   * with a 24% duty cycle, so roughly one flash every two and a half seconds. The ceiling in this
   * project is 2.6 Hz and the hard limit is 3 Hz, so this sits at a sixth of the ceiling. It is
   * ONE CELL. The envelope is a squared half-sine that is scaled by the peak (never a floor
   * subtracted from an already-scaled intensity — that is the exact shape of the lightning bug
   * this rule was written for), so the amplitude is invariant under the range fade.
   *
   * UNDER CC.reducedMotion IT DOES NOT BLINK AT ANY RATE. 0.42 Hz is a sixth of the flash-rate
   * ceiling and was never a seizure risk, but reduced motion is a separate contract and it says
   * still, not slow: the timer used to be damped by the same 0.10 that damped the traffic, which
   * is a beacon blinking every 24 s rather than a beacon that has stopped. Both clocks are now
   * stopped (see draw()), and the beacon holds at RM_BEACON of peak on every freighter rather than
   * at the phase its hash happens to freeze on — the reasoning is at the branch that draws it.
   *
   * BEACON_MIN IS A FLICKER FIX AND IT IS THE THIRD ONE THIS FILE HAS NEEDED. The two ends of the
   * envelope are worth almost nothing — e*e under 0.45 is raw 62 down to raw 0 — and drawing them
   * was not free, because the beacon is written at the LAMP depth (dl), which is nearer than any
   * hull. put() resolves on depth and not on brightness, so a beacon at raw 3 still WON its cell
   * and painted out whatever was behind it. Measured on the section-2 fixture with the traffic
   * frozen (speed forced to zero, so nothing in the element moved at all): seed 42, yaw 1, cell
   * 143,24 ran 115 -> 3 -> 115, twice every 2.383 s, i.e. 0.80 big steps a second in ONE cell out
   * of a ceiling of 1.0 — the whole of that seed's reduced-traffic score, produced by a lamp that
   * was to all appearances off. An unlit lamp is not an object and must not take the cell.
   *
   * So the beacon is drawn only above BEACON_MIN of peak, which is the file's own rule for every
   * other lamp ("a lamp that cannot hold v 120 is not drawn at all") finally applied to this one:
   * 138 * 0.45 is raw 62, which prints v 121 through the backdrop bucket. Two consequences, both
   * wanted: the beacon's edges are now steps of 62/255 = 24% rather than 44%, under the 34% frame
   * ceiling; and the flash is 0.30 s of visible light rather than 0.58 s of envelope of which the
   * first and last quarter were below the print floor anyway. The envelope inside the window is
   * untouched and is still scaled by the peak, so the amplitude stays invariant under the fade. */
  var BEACON_HZ = 0.42, BEACON_DUTY = 0.24, RM_BEACON = 0.70, BEACON_MIN = 0.45;

  /* Salts. Additive off the city seed and one independent draw per decision, per the house rule.
   * The 2000s band is deliberately clear of the salts city.js (101-902), street.js and police.js
   * (101-1709) already spend against this same hash — those two key on (car index, spawn counter),
   * which is a coordinate space this file's (lane index, slot index) overlaps, so sharing a salt
   * would have welded a skycar's spacing to a pedestrian's gait for the pairs where the two
   * coordinates happen to coincide. */
  var SALT_JIT = 2003, SALT_SPD = 2111, SALT_FRT = 2221, SALT_LAT = 2333,
      SALT_ALT = 2441, SALT_HUE = 2551, SALT_LEN = 2663, SALT_BCN = 2777, SALT_LANE = 2887;

  /* ---- camera basis ---------------------------------------------------------------------------
   * Copied from elements/street.js, which copied it from raycast.js, and it has to be exact: the
   * along lane's whole job is to converge on the vanishing point the world pass draws, and a
   * projection that disagrees with the caster by a percent puts the lane beside the canyon instead
   * of over it. Planar camera — w is the forward-axis distance and needs no cosine fix-up — and
   * the vertical scale is reconciled to the horizontal fov exactly as the caster reconciles it. */
  var CX = 0, CZ = 0, FWX = 0, FWZ = 1, RGX = 1, RGZ = 0, HP = 0.7, EYE = 1.7;
  var COLS = 0, ROWS = 0, HOR = 0, SCALE = 1, CPM = 1;

  function camScreen(frame, cam) {
    var yaw = cam.yaw || 0;
    FWX = Math.sin(yaw); FWZ = Math.cos(yaw);
    RGX = Math.cos(yaw); RGZ = -Math.sin(yaw);
    CX = cam.x; CZ = cam.z;
    HP = Math.tan((cam.fov || 1.25) * 0.5);
    EYE = cam.eyeY !== undefined ? cam.eyeY : 1.7;
    COLS = frame.cols; ROWS = frame.rows;
    HOR = cam.horizon !== undefined ? cam.horizon : ROWS * 0.56;
    SCALE = cam.scaleY !== undefined ? cam.scaleY
          : (COLS * (cam.cellAspect || 0.5625)) / (2 * HP);
    CPM = COLS * 0.5 / HP;               // screen columns per metre of lateral offset, times 1/w
  }

  /* Module scratch, read out by the caller before anything else is projected. */
  var PJ = { ok: 0, w: 0, sp: 0, x: 0, dist: 0 };
  function project(px, pz) {
    var dx = px - CX, dz = pz - CZ;
    var w = dx * FWX + dz * FWZ;
    if (w < 0.45) { PJ.ok = 0; return PJ; }
    var sp = (dx * RGX + dz * RGZ) / w;
    PJ.ok = 1; PJ.w = w; PJ.sp = sp;
    PJ.x = (sp / HP + 1) * COLS * 0.5 - 0.5;
    PJ.dist = w * Math.sqrt(1 + sp * sp);
    return PJ;
  }
  function rowOf(y, w) { return HOR - (y - EYE) * SCALE / w; }

  /* Rounding and bounds live here rather than in CC.put, which coerces with |0 and truncates
   * toward zero — a vehicle at x = -0.4 would otherwise reappear glued to column 0. The horizon
   * test is the same one sky.js's plot() makes: nothing in this file exists below the skyline. */
  function plot(f, x, y, ch, col, lum, dist) {
    if (lum < 3) return;
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return;
    if (y > HOR) return;
    put(f, x, y, ch, col, lum, dist);
  }

  /* ---- weather --------------------------------------------------------------------------------
   * Raw directions, not rel(): "the lanes are gone in mist" is a statement about fog reaching 1.0
   * and there is no previously tuned constant here to preserve. Fallback is the 'rain' preset the
   * build was tuned under, so a harness with no director renders the reference frame. */
  var W_FOG = 0.30, W_HAZE = 0.40;
  function bindWeather() {
    var p = CC.Weather ? CC.Weather.P : null;
    W_FOG = p ? p.fog : 0.30;
    W_HAZE = p ? p.haze : 0.40;
  }

  /* ---- per-draw state, hoisted so nothing is allocated in the frame path ---------------------- */
  var CITY = null, S = 0, AVE = 30, CROSS = 26;
  var FRAME = null, TT = 0, VIS = 1;

  /* One lane: a line at fixed coordinate `c` on axis `ax` (0 = an avenue, running along z; 1 = a
   * cross street, running along x), at lattice index `idx`, half-width `hw` metres to the building
   * line. Every level of it is walked here. */
  function lane(ax, idx, c, hw) {
    /* THE LANE CULL, and it has to catch two completely different cases with one test because
     * which case a lane is in depends on where the camera is looking, and a test that changed its
     * answer as the camera turned would pop a whole lane in and out of existence.
     *   - a lane running roughly ALONG the view is only ever visible if it is nearly overhead,
     *     because the sky wedge closes within a few metres of the corridor centreline;
     *   - a lane running ACROSS the view is visible if the point of it directly ahead sits inside
     *     the range gate.
     * `p` is the lane's perpendicular offset from the camera and `p * fp` is how far ahead that
     * offset puts it, so the two tests are the two halves of the same quantity. */
    var p = ax === 0 ? c - CX : c - CZ;
    var fp = ax === 0 ? FWX : FWZ;
    var ap = p < 0 ? -p : p;
    var wp = p * fp;
    if (ap > LANE_SIDE && (wp < W_MIN * 0.5 || wp > W_MAX)) return;

    /* The lane is as wide as the street under it, capped: a 3 m alley gets a 1.6 m spread and a
     * boulevard gets 4 m. Reading the corridor width rather than writing a constant is the same
     * discipline CC.PAVE exists for — the traffic overhead is the traffic below, one block up. */
    var lanew = hw * 1.1; if (lanew > 4.0) lanew = 4.0; if (lanew < 1.2) lanew = 1.2;

    var camAlong = ax === 0 ? CZ : CX;
    var lv, j, ky;
    for (lv = 0; lv < NLEV; lv++) {
      if (hash2(idx, lv * 97 + ax * 13, S + SALT_LANE) > LANE_P) continue;
      var dir = DIRS[lv];
      var alt0 = ALT[lv];
      for (j = 0; j < NPER; j++) {
        /* The vehicle's world identity. lv < 4 and j < 32, so slot / level / axis pack into one
         * coordinate without colliding, and the lane index is the other. Nothing here is keyed on
         * the screen or on the frame index. */
        ky = j + lv * 32 + ax * 256;

        var jit = hash2(idx, ky, S + SALT_JIT);
        var sp0 = hash2(idx, ky, S + SALT_SPD);
        var freight = hash2(idx, ky, S + SALT_FRT) < FREIGHT_P;

        /* Slot spacing is irregular WITHIN its slot rather than uniformly random over the span, so
         * the traffic clumps and gaps without two vehicles ever being laid on top of each other.
         *
         * 0.62, AND THE REMAINING 0.38 OF A SLOT IS A PHOTOSENSITIVITY GUARANTEE, not tidiness. A
         * screen cell that a lane sweeps across is lit once per vehicle that passes it, so the
         * headway inside a lane IS the flash rate at that cell. At 0.88 the tightest pair the
         * hashes could produce was 0.12 of a slot apart, which at the then 25 m/s top speed was
         * two pulses 0.23 s apart — 4.3 Hz, over the 3 Hz limit, even though it is a doublet
         * rather than a train. 0.38 of a slot is the guaranteed clearance, and the trim improved
         * it twice over: cutting NPER from 10 to 7 widened the slot from 48 m to 68.6 m, so the
         * clearance went from 18 m to 26.1 m, and cutting the top speed from 25 m/s to 16 m/s made
         * that 1.63 s rather than 0.73 s. The second speed cut below (16 -> 4.8 m/s) takes the same
         * 26.1 m of clearance to 5.4 s, i.e. a worst case of 0.18 Hz against the 2.6 Hz house
         * ceiling. It also spaces the traffic better, which is the second reason it was kept after
         * the first was fixed. */
        var base = (j + jit * 0.62) * SLOT;
        /* A range of speeds inside a lane, which is most of what makes a stream look like traffic
         * rather than like a conveyor: 2.55-4.8 m/s for cars, a third of that for a freighter.
         *
         * THIS WAS 13-25, THEN 8.5-16, AND IS NOW 2.55-4.8 m/s. EVERY CUT IS A PHOTOSENSITIVITY
         * ONE, not a styling one, and this one was forced by the first honest measurement the
         * element has ever had. Everything this file does to a screen cell is proportional to how
         * fast a vehicle sweeps across it, so speed — not count — is the lever on the per-cell
         * re-light rate, and it is the only lever that is free in the picture: positions are folded
         * into SPAN, so the number of vehicles on screen at any instant, their spacing and their
         * spread over the lattice are all unchanged. A still frame is statistically identical
         * before and after this line; only the rate at which it changes moves.
         *
         * THE MEASUREMENT, and it is now the SHIPPED tool rather than a private fixture:
         * tools/flicker-rate.cjs section 2 (--sky=clear, seeds 0/7/42/555, eight bearings, 20 s
         * each, worst cell in each), which scored `skylanes` for the first time this round because
         * its NAMES list had never contained this element. Its rule is that no ONE cell may take
         * more than 1.0 steps of over 34% of full scale per second. Busiest cell, worst of the four
         * seeds, with the beacon fix above already in:
         *     speed x1.00 (8.5-16 m/s)   2.05 /s   FAIL
         *     speed x0.65                1.55 /s   FAIL
         *     speed x0.50                1.40 /s   FAIL
         *     speed x0.40                1.20 /s   FAIL
         *     speed x0.30 (2.55-4.8)     0.90 /s   ok      <- taken
         *     speed x0.25                0.80 /s   ok
         * and the levers that were measured and NOT taken, because each of them costs content that
         * this file's own rendered A/B work says is the difference between traffic and a star field:
         *     NPER 7 -> 4                1.40 /s   and 40% fewer cells on screen
         *     LANE_P 0.74 -> 0.45        1.85 /s   and 37% fewer
         *     W_MAX 380 -> 240 m         2.05 /s   and 50% fewer, i.e. it buys nothing at all
         *     HULL_CAR 15 -> 66          1.50 /s   and the body stops being a dark body (v 142)
         * The only structural alternative — capping every lamp under 85 raw, which is exactly a
         * third of 255 and so makes a big step arithmetically impossible — is written up at the top
         * of the file under WHAT IS LEFT. It is not taken here because it forces amber out of the
         * element, and this file cannot make that call on its own.
         *
         * WHAT THE CUT COSTS IN THE PICTURE, said plainly because it is not nothing: at 200 m a car
         * now crosses the sky wedge in about ten seconds where it used to take two. The traffic
         * drifts rather than streams. It is 1.6-3.0x the autopilot's own 1.6 m/s and about the
         * speed of a player walking the street at control.js's WALK of 2.7, so the lanes still move
         * over the city rather than hang in it, but a viewer who watches one car will now see it
         * cross rather than flash past. That is the price of the rate rule and it is paid here
         * because the alternatives all cost vehicles, and vehicles are what the file is for. */
        var spd = freight ? (0.96 + sp0 * 0.66) : (2.55 + sp0 * 2.25);

        /* Fold the run into a span centred on the camera. The wrap point is 240 m away on a lane
         * that is culled past 380 m in front and is behind the eye behind, so no vehicle ever
         * teleports on screen; and it is a pure function of t and the camera pose, so a scrub
         * lands on the same frame a replay does. */
        var a = base + dir * spd * TT - camAlong;
        a -= SPAN * Math.floor(a / SPAN + 0.5);
        a += camAlong;

        var lat = (hash2(idx, ky, S + SALT_LAT) - 0.5) * lanew;
        var px, pz, dirx, dirz;
        if (ax === 0) { px = c + lat; pz = a; dirx = 0; dirz = dir; }
        else          { px = a; pz = c + lat; dirx = dir; dirz = 0; }

        project(px, pz);
        if (!PJ.ok) continue;
        var w = PJ.w;
        if (w < W_MIN || w > W_MAX) continue;
        var sp = PJ.sp;
        if (sp > HP * 1.15 || sp < -HP * 1.15) continue;
        var sx = PJ.x, dTrue = PJ.dist;

        var ay = alt0 + (hash2(idx, ky, S + SALT_ALT) - 0.5) * 2.2;
        var row = rowOf(ay, w);
        if (row < -1 || row > HOR) continue;

        /* Screen footprint. (dir, perp) is an orthonormal pair in plan and (RGX, RGZ) is the unit
         * screen-right vector, so dR and pR are how much of the vehicle's LENGTH and how much of
         * its WIDTH each contribute to its horizontal extent. That one line covers both
         * orientations: a crossing vehicle is all length, an along vehicle is all width and
         * collapses to the 3.2 m span it actually is seen end-on. */
        var L = CAR_L, WD = CAR_W, HT = CAR_H;
        if (freight) {
          /* A freighter's length varies; a fleet of identical boxes reads as a repeated sprite. */
          L = FR_L * (0.82 + hash2(idx, ky, S + SALT_LEN) * 0.42); WD = FR_W; HT = FR_H;
        }
        var dR = dirx * RGX + dirz * RGZ; if (dR < 0) dR = -dR;
        var pR = -dirz * RGX + dirx * RGZ; if (pR < 0) pR = -pR;
        var hx = 0.5 * (L * dR + WD * pR) * CPM / w;
        var hy = 0.5 * HT * SCALE / w;

        /* THE AREA RETIRE, on the UNCLAMPED cell count and on the row count that is actually
         * DRAWN. Getting the second half of that wrong is what killed the crossing freighter for a
         * whole round: the test used to multiply by the unclamped ROW extent (2*hy + 1), and a
         * 3.4 m tall freighter seen side-on is 1.7 rows at 380 m, so every freighter that was not
         * pointed at the camera scored 13 against a cap of 12 and was retired at EVERY range in
         * the gate. The heavy traffic existed, flew, and was never once drawn broadside. This file
         * never draws more than two rows, so two rows is what the test has to charge for. */
        var nxT = Math.round(hx);
        var nmax = freight ? 4 : 2;
        // A freighter shows a top face when it is deep enough on screen AND there is room in the
        // budget for the second row; a car is one row at every range this element draws it.
        var two = (freight && hy >= 0.62 && (2 * nxT + 1) * 2 <= MAXCELLS) ? 1 : 0;
        if ((2 * nxT + 1) * (two ? 2 : 1) > MAXCELLS) continue;
        /* Clamped at both ends: nmax is the photosensitivity cap, NMIN is the legibility floor.
         * The retire above is charged on the UNCLAMPED nxT, so widening the floor cannot smuggle
         * area past it. */
        var nx = nxT > nmax ? nmax : (nxT < NMIN ? NMIN : nxT);

        /* Range and weather fade. Below MIN_SCALE the whole vehicle goes rather than being drawn
         * dim: see the header — a lamp that cannot hold v 120 is muddy, and muddy is the one thing
         * this frame cannot buy. */
        var scale = VIS * (1 - (w - 90) * FADE);
        if (scale > 1) scale = 1;
        if (scale < MIN_SCALE) continue;

        var dh = SKY_NEAR + dTrue * DSLOPE;
        var dl = dh * 0.996;      // the lamps sit on the front face of their own hull
        var r0 = Math.round(row);
        var q;
        if (r0 < 0 || r0 >= ROWS) continue;

        /* THE APERTURE FIT, AND IT IS THE OTHER HALF OF THE "NOT VISIBLE" FIX. Making the body
         * bright enough to join the lamps is not enough on its own, because the sky slot is not a
         * clean wedge — it is a comb. A mast, a parapet corner or a single column of facade one
         * cell wide punches a hole through the middle of a vehicle, and what survives is two
         * disconnected specks, which is precisely the "scattered red O, indistinguishable from
         * stars" the review reported. Traced on s3275_f1800 before this block existed: a car at
         * row 28 printed its two tail lamps at columns 110 and 112 and lost 111 to a facade edge;
         * a car at row 21 lost both lamps and its centre and printed two lone hull cells and no
         * light at all; a freighter at row 8 lost one column and came apart into a lone red lamp
         * and a six-cell body with nothing lit on it.
         *
         * So the vehicle is fitted to the APERTURE it is actually seen through: ask the depth
         * buffer which columns of this row would accept the write, and draw the whole vehicle —
         * body, both lamps, belly, beacon — inside the unbroken run of open columns that CONTAINS
         * ITS CENTRE. Centre blocked, or the run under three columns, and the vehicle is dropped
         * outright. Two consequences, both wanted: what prints is always ONE connected object with
         * a lit cell at each end, never a fragment; and a vehicle passing behind a mast shortens
         * rather than shattering, which at three to nine cells is what a partly hidden object
         * looks like anyway.
         *
         * GROWN FROM THE CENTRE AND NOT "THE LONGEST RUN", AND THAT IS A FLICKER FIX, NOT A STYLE
         * CHOICE. Longest-run was the first version and it ties: with an occluder splitting a
         * nine-column freighter into a four and a five, the winner flips the moment the occluder
         * drifts one column, and the whole vehicle — lamps, belly, beacon — teleports several
         * columns to the other side of it and back. Caught in the frozen-camera fixture on seed 7:
         * a belly lamp alternating between columns 24 and 27 with dwell times of 0.08-0.1 s, i.e.
         * a 6-12 Hz flash in two cells, which is over the 3 Hz limit and was entirely an artifact
         * of the tie-break. Growing outward from the centre has no tie to break: lx and rx are
         * each a contiguous walk from a point that moves smoothly, so they move smoothly too.
         *
         * WHAT COUNTS AS BLOCKED IS "NEARER THAN SKY_NEAR", NOT "NEARER THAN ME", AND THAT IS THE
         * SECOND FLICKER FIX. The obvious test is `dh < FRAME.dist[cell]` — would put() accept
         * this write — but that makes one skycar's aperture depend on ANOTHER skycar, and the two
         * move relative to each other every frame. Caught in the same fixture: a one-cell car
         * drifting across a nine-cell freighter's row took the freighter from nine cells drawn, to
         * five (aperture stopped at the car), to none (car on the freighter's centre column), and
         * back, inside a fifth of a second — the freighter's lamps jumping four columns at 6-12 Hz
         * because of a neighbour. Every vehicle this file draws is at dh >= SKY_NEAR by
         * construction, so testing against SKY_NEAR admits exactly the near-field geometry that
         * should close an aperture — facade, parapet, mast, cable, rain — and ignores everything
         * already at backdrop depth, which is other skycars and the cloud/star field this element
         * exists to draw over. put()'s own depth test still resolves two overlapping vehicles cell
         * by cell; what it no longer does is let them re-cut each other's silhouettes.
         *
         * THIS IS NOT A PATTERN KEYED ON THE SCREEN, which the house rule forbids, and the
         * distinction matters: nothing random is drawn here and no per-cell decision is stored or
         * carried between frames. It is an occlusion query against a buffer that is itself a pure
         * function of (seed, t, camera), so the answer at a given t is the same whether that t was
         * replayed to or scrubbed to, which is the property that rule exists to protect. */
        var xi = Math.round(sx), xx, lx = 0, rx = 0, rowBase = r0 * COLS;
        if (!(xi >= 0 && xi < COLS && FRAME.dist[rowBase + xi] >= SKY_NEAR)) continue;
        for (q = -1; q >= -nx; q--) {
          xx = xi + q;
          if (!(xx >= 0 && xx < COLS && FRAME.dist[rowBase + xx] >= SKY_NEAR)) break;
          lx = q;
        }
        for (q = 1; q <= nx; q++) {
          xx = xi + q;
          if (!(xx >= 0 && xx < COLS && FRAME.dist[rowBase + xx] >= SKY_NEAR)) break;
          rx = q;
        }
        if (rx - lx + 1 < 3) continue;

        /* Which screen end the vehicle is pointing at. Needed by the hull as well as the lamps
         * now, because the freighter's roof light goes on its nose. */
        var rr = dirx * RGX + dirz * RGZ;
        var sgn = rr > 0 ? 1 : -1;

        /* ---- the hull. A DIM SLAB, not a black cut-out — see HULL_CAR for the measurement that
         * turned that over. It still does the occluding (the depth test does not care how bright
         * it is); what the luminance buys is the body that joins the two lamps into one object.
         * Everything from here on is drawn between lx and rx — the aperture, never the raw
         * footprint — which is at least three columns wide by the test above. */
        var hlum = freight ? HULL_FR : HULL_CAR;
        var hg = freight ? G_HASH : G_EQ;
        for (q = lx; q <= rx; q++) plot(FRAME, sx + q, r0, hg, P.shadow, hlum, dh);
        if (two) {
          for (q = lx + 1; q <= rx - 1; q++)
            plot(FRAME, sx + q, r0 - 1, G_DASH, P.shadow, HULL_ROOF, dh);
          /* One lit cell ON the roof, at the nose. Without it the roof row is a run of mid-tone
           * cells with nothing bright in it anywhere — the fixture had 21 such runs out of 115 and
           * a run that prints no light is the "absent, not sparse" finding in miniature. It is
           * also the house pattern for a dark object: a black cut-out with a lit top edge. Written
           * after the roof dashes and at the lamp depth, so the depth test lets it win the cell.
           * 0.86 of the underside lamp: a roof face catches less than a belly does, and the roof
           * only exists inside 227 m (that is where hy clears 0.62), where the range fade is still
           * 0.84, so the worst case is raw 95 and prints v 124 — clear of the muddy band. */
          plot(FRAME, sx + (sgn > 0 ? rx - 1 : lx + 1), r0 - 1, G_o, P.amber,
               UNDER_AMBER * 0.86 * scale, dl);
        }

        /* ---- the lamps. Which ones are lit is decided by the aspect, because that is what a
         * vehicle actually shows you: driving away it is two tail lamps, coming at you it is a
         * pair of heads, side on it is a lit nose and a dim tail with the underside glowing.
         *
         * ALL THREE ASPECTS NOW PUT A LAMP AT EACH VISIBLE END rather than sometimes at a fixed
         * +-1 and sometimes at the centre. The old centre fallbacks fired whenever nx was 0 or 1,
         * which before the CAR_W fix was the common case at range, and they are exactly what
         * printed the single unattached specks the review could not tell from stars. Two lamps
         * bracketing a visible body is the signature; nothing here draws less than that. */
        var dot = dirx * FWX + dirz * FWZ;          // > 0 means it is running away from the eye
        var hue = hash2(idx, ky, S + SALT_HUE);
        var headC = hue < 0.52 ? P.amber : P.azure;
        var headL = (hue < 0.52 ? HEAD_AMBER : HEAD_AZURE) * scale;

        if (dot > 0.55) {
          // Receding: tail lamps only, and this is the line of red converging on the slot.
          plot(FRAME, sx + lx, r0, G_o, P.red, TAIL_RED * scale, dl);
          plot(FRAME, sx + rx, r0, G_o, P.red, TAIL_RED * scale, dl);
        } else if (dot < -0.55) {
          /* Approaching: the lit face is the front, so a pair of heads and no red anywhere on it.
           * 0.80 on the far one is modelling, not a fade, and it is floored there rather than at
           * the old 0.72 by the print: azure is the dimmer head colour, and 92 * MIN_SCALE * 0.80
           * is raw 49, which prints v 126 — one step under and the second head is in the muddy
           * band at the far end of the gate, which is the one thing the file will not buy. */
          plot(FRAME, sx + lx, r0, G_o, headC, headL, dl);
          plot(FRAME, sx + rx, r0, G_o, headC, headL * 0.80, dl);
        } else {
          /* Crossing. The nose is whichever screen end the vehicle is travelling toward, which is
           * the sign of the direction projected onto screen-right — get this backwards and every
           * crossing vehicle is driving tail first. */
          plot(FRAME, sx + (sgn > 0 ? rx : lx), r0, G_o, headC, headL, dl);
          plot(FRAME, sx + (sgn > 0 ? lx : rx), r0, G_o, P.red, TAIL_RED * 0.82 * scale, dl);
          /* The underside glow: one cell of sodium hung under the belly. This is the cell that
           * says the object has a bottom, which is the whole difference between a car and a star,
           * so it is now drawn on every crossing vehicle rather than only on ones nx >= 2 wide —
           * the aperture is three columns at minimum, so there is always a body for it to hang
           * under, and the three lit cells it completes make an L that no star field contains.
           * It hangs off the vehicle's TRUE centre column, which the aperture test has already
           * proved open, and not off the middle of the aperture: the aperture is asymmetric
           * whenever a vehicle is half behind something, and a belly lamp that slid about under
           * its own hull as the occluder moved was a second cell jumping for no reason. */
          plot(FRAME, sx, r0 + 1, G_UNDER, P.amber, UNDER_AMBER * scale, dl);
        }

        /* ---- the freighter beacon. One cell, 0.42 Hz, squared half-sine scaled by the peak. */
        if (freight) {
          if (CC.reducedMotion) {
            /* HELD, NOT FROZEN MID-PHASE, and the difference is the whole of this branch. TT is
             * stopped above, so the live expression would freeze the phase along with everything
             * else — but a PULSE frozen at whatever phase its hash landed on is not stillness, it
             * is a lamp stuck at an arbitrary brightness: with BEACON_DUTY at 0.24, three quarters
             * of the freighters would hold at exactly zero (no beacon at all) and the rest anywhere
             * from zero to peak. Peak is a light left on and zero is a lamp deleted; a held mid
             * value is what the flag actually asks for, and it is what sky.js does with its mast
             * and airliner lamps (`CC.reducedMotion ? 0.5 : ...`).
             *
             * RM_BEACON is above that 0.5 and the floor is the print, not taste. Red needs raw 60
             * to clear v 120 and stop being muddy, and a HELD lamp is looked at for as long as the
             * viewer looks — unlike a 0.24 s flash it never gets to pass through the muddy band on
             * its way somewhere. 138 * 0.70 * MIN_SCALE = 64 raw, so it prints as a lamp at the far
             * end of the range gate as well as the near end. */
            plot(FRAME, sx, r0 - two - 1, G_o, P.red, BEACON_RED * RM_BEACON * scale, dl);
          } else {
            var ph = TT * BEACON_HZ + hash2(idx, ky, S + SALT_BCN);
            ph -= Math.floor(ph);
            if (ph < BEACON_DUTY) {
              var e = Math.sin(ph * Math.PI / BEACON_DUTY);
              e *= e;
              /* Below BEACON_MIN the beacon is OFF, not dim — see the constant. Drawing the dim
               * tails of the envelope put a near-black cell at lamp depth over whatever was
               * behind it, which measured as a 112/255 step twice a flash. */
              if (e >= BEACON_MIN) plot(FRAME, sx, r0 - two - 1, G_o, P.red, BEACON_RED * e * scale, dl);
            }
          }
        }
      }
    }
  }

  CC.ELEMENTS.push({
    name: 'skylanes',
    layer: 16,

    /* ZERO draws from the shared rng, on purpose. CC.ELEMENTS is init'd in layer order off one
     * stream, so an element that takes even one draw shifts the numbers under every element that
     * loads after it — the sky, the rain, the crowd and every sign in the city all get different
     * numbers and every tuned frame anybody has looked at changes. This file needs no stream at
     * all: every decision it makes is a hash of a world coordinate. */
    init: function (city) {
      CITY = city || null;
      S = city && city.seed !== undefined ? (city.seed | 0) : 0;
      AVE = city && city.AVE ? city.AVE : 30;
      CROSS = city && city.CROSS ? city.CROSS : 26;
    },

    draw: function (frame, cam, t) {
      var city = CITY;
      if (!city || !city.aveX) return;
      camScreen(frame, cam);
      bindWeather();

      /* Fog is the one weather direction that takes the lanes away outright, and it should: they
       * are 80-380 m of murk away and they are two lit cells each. Under the 'mist' preset this
       * returns before a single hash is taken.
       *
       * THE KNEE AT 0.34 IS THE WHOLE OF THIS LINE AND IT WAS WRONG FIRST. A plain `1 - fog*1.15`
       * looks reasonable and switches the element off in every weather this build ever renders:
       * the presets carry fog 0.08 (clear), 0.22 (drizzle), 0.30 (rain), 0.36 (downpour), 0.44
       * (storm) and 1.00 (mist), so the reference preset alone took VIS to 0.58, under MIN_SCALE,
       * and the first six-frame fixture measured a delta of exactly zero because the lanes had
       * never once been drawn. Only mist has fog worth attenuating for, so the term does nothing
       * until 0.34 and then goes hard: VIS is 0.99 clear, 0.96 rain, 0.91 downpour, 0.77 storm
       * (which shortens the lanes to about 210 m through the range fade below) and 0.06 in mist,
       * i.e. gone. */
      VIS = 1 - (W_FOG > 0.34 ? (W_FOG - 0.34) * 1.70 : 0) - W_HAZE * 0.10;
      if (VIS <= MIN_SCALE) return;
      if (VIS > 1) VIS = 1;

      /* REDUCED MOTION IS A HARD FREEZE, AND A DAMP DEMONSTRABLY WILL NOT DO. This line read
       * `t * 0.10` on the argument that a still sky full of parked cars is a diorama. That argument
       * is about the picture; the flag is a contract. Measured by tools/flicker-rate.cjs section 4
       * — this element alone on a frozen camera with CC.reducedMotion set, where the pass mark is
       * that NO cell moves by ONE unit — the damped clock scored 152/255 under 'clear' and 118/255
       * under 'storm'. Both numbers are the SAME lamp: HEAD_AMBER at full scale is 152, and 152
       * under storm's VIS of 0.77 is 117-119. So the step was one head lamp, off to on, as a
       * vehicle crept over a column boundary — not a pulse, not a fade, a lamp arriving in a cell.
       *
       * WHICH IS WHY NO DAMPING FACTOR CAN PASS THIS, and it is the whole reason the fix is
       * structural. A lamp is one cell at a ROUNDED column. Slowing the traffic changes how OFTEN a
       * lamp crosses a column boundary; it cannot change what happens when it does, which is a cell
       * going 0 -> 152 in a single frame. Quantised motion has no small steps, so every damping
       * factor above zero fails identically and only the interval between failures differs — at
       * 0.10 a 16 m/s car still covers 0.027 m a frame, which at the near end of the gate (78 m,
       * ~1.9 columns/m) is a boundary crossing roughly every twenty frames.
       *
       * SO THE CLOCK STOPS DEAD, at zero, and the element keeps every property the freeze was
       * feared to cost. Position is still a pure function of (clock, lane, slot): nothing is
       * integrated, nothing is stored, and a scrub to any t still lands on the same frame a replay
       * does. Zero is chosen over an arbitrary held constant because it is the ONE value at which
       * the slot structure is intact — a vehicle sits at (j + jit*0.62)*SLOT, so consecutive
       * vehicles in a lane are guaranteed 0.38 of a slot (26 m) apart, a guarantee that only holds
       * before the speed spread has had time to scramble the slots. The frozen sky is therefore the
       * evenly spaced one rather than one with two hulls overlapping in a random clump.
       *
       * THE TOGGLE MOMENT, deliberately: flipping the preference mid-run re-lays the traffic once,
       * in the frame it flipped. That is one rearrangement at the instant the viewer asked for
       * stillness. The alternative that avoids it — freezing at whatever t the flag came on — is
       * per-session state, and state is exactly what breaks the scrub-equals-replay property this
       * file is built around. A slow drift was also considered and is not available: see above, it
       * cannot reach 0/255.
       *
       * Rendered and looked at, because a frozen element that has quietly emptied the sky would
       * pass the tool and ruin the picture. Counted at 213x67 through the world's real depth
       * buffer, camera at the start pose, seeds 3001/3275/3549 averaged over three times: the
       * frozen sky carries 31/39/16 lit cells against the live 36/27/15, and 23/33/14 body cells
       * against 30/30/11. Nothing here is switched off, only stopped — the lanes still cross the
       * slot and the along lane still recedes to the vanishing point. */
      TT = CC.reducedMotion ? 0 : t;
      FRAME = frame;

      var kc = Math.round(cam.x / AVE), mc = Math.round(cam.z / CROSS), i;
      for (i = kc - KSPAN; i <= kc + KSPAN; i++)
        lane(0, i, city.aveX(i) + 0.5, city.aveW(i) + 0.5);
      for (i = mc - MSPAN; i <= mc + MSPAN; i++)
        lane(1, i, city.crossZ(i) + 0.5, city.crossW(i) + 0.5);

      FRAME = null;
    }
  });

})(typeof CC !== 'undefined' ? CC : require('../core.js'));
