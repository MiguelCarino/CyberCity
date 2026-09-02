/* CyberCity EDO festival banners — JP-NOBORI, layer 18.
 *
 * WHY THIS IS ITS OWN FILE AND NOT PART OF jp_town.js. It is the same street and the same walk, and
 * under any other constraint it would live beside the toro and the noren. It does not, for one
 * reason worth recording: this object was designed once, implemented, censused and refuted on every
 * claim it made, and the prose that justifies each surviving number is longer than the code. Putting
 * that inside a file which is already 34 KB of argument would bury both. The cost is one more
 * CC.Proj.make() basis (one small record, once, for the life of the page) and one more copy of the
 * street-walk helpers. Everything else — the placement rule, the light model, the glyph budget — is
 * jp_town.js's, deliberately, and where the two disagree jp_town.js is right.
 *
 * WHAT A NOBORI IS. One sheet of bleached cotton about 0.6 m across and two or three metres long,
 * laced down one edge to a bamboo pole and along its top to a short crossbar, with a dyed hem and a
 * brushed device on it. They stand in a RANK at the kerb on a temple approach or down a market
 * street at a festival, all facing the same way — which is to say facing the person walking up the
 * street, not the buildings opposite. That last fact is the whole geometry of this element and it
 * is why the cloth spans ACROSS the road rather than along it (see drawNobori).
 *
 * WHY IT EXISTS, and it is the one question this file has to answer honestly. The ask was COLOUR.
 * EDO's measured lit-energy split at night, seed 42, is warm 58.8% / white 16.4% / timber 9.8%,
 * with jade at 0.4% and gold at 0.0% — six of twenty swatches absent from the world entirely. The
 * setting is the reason: sumptuary law kept colour off the buildings, so what colour there was hung
 * in the air on cloth, paper and lacquer. Cloth hung in the air is exactly what an element drawn
 * through src/proj.js can put in front of a facade, and the facade is the one thing already taken.
 *
 * WHAT IT ACTUALLY BOUGHT, measured this session at 200x60, frame 300, against the same tree with
 * this element dropped from the list — so the comparison is this object and nothing else:
 *   seed 42 night   ember 3.0% -> 3.5% of lit energy, white 16.4% -> 17.6%, warm 58.8% -> 57.4%
 *   seed  7 night   ember 0.4% -> 1.1%
 *   seed  3 night   ember absent -> 0.7%, GOLD absent -> 0.6% (this world measures gold at 0.0%)
 *   seed  3 dusk    ember absent -> 0.4%, gold absent -> 0.3%
 * and on the print census (muddy 9-119, target under 30; hot v>=170, target 3.5-5) it is positive
 * or flat at all twelve seed/hour fixtures tried — muddy down at eleven of twelve, hot up at eight
 * and never down. The largest single move is noon, where the hot tail goes 0.73% -> 2.67% at seed
 * 42 and 0.34% -> 2.69% at seed 3: bleached cotton in sun is one of the few things in this world
 * that can print in the hot tail by day, and EDO's whole census problem is that it has almost
 * nothing there.
 *
 * ==================================================================================================
 * THE FIVE THINGS THAT WENT WRONG THE FIRST TIME, all measured by independent reviews of the design
 * this file replaces, all fixed here by name. This is not caution, it is the list.
 *
 *   1. THE POLE AND THE CLOTH FOUGHT FOR ONE CELL. The design stood the pole at the exact point the
 *      cloth was projected from, so the pole's column and the cloth's first column were the same
 *      screen cell at the same nominal depth. CC.put's test is strict (`dist < f.dist[i]`), so the
 *      winner was settled by float32 rounding and flipped from frame to frame: the cell alternated
 *      between timber at lum 114 and blank at about 26 Hz — 45% of full scale in the middle of the
 *      3-20 Hz flash band — and tools/west-flicker.cjs went from 0.50 big steps/s to 31.50 against
 *      an absolute cap of 8.0. FIXED TWICE OVER HERE: the pole is drawn only BELOW the cloth
 *      (0 -> NOB_BOT + 0.10) so the two barely share a row at all, and the cloth is emitted at
 *      d - 0.02 so that where they do meet the contest is decided by arithmetic, not by rounding.
 *   2. THE SWAY WAS A LUMINANCE FLASH, NOT A SHAPE MOVING. A 0.12 m positional wobble at 0.35 Hz
 *      moves a banner about 1.3 columns, and because the design wrote every sub-threshold cell as
 *      occluding black, each edge column stepped 0 <-> full scale, twenty-two cells at a time.
 *      Measured 30.25 big steps/s on six of six EDO presets; deleting the one sway line took it
 *      back to 0.50/s and a PASS. THERE IS NO SWAY IN THIS FILE. See the note above mk().
 *   3. THE BLANKING RULE ATE THE OBJECT. Writing a sub-threshold cell as occluding black is free in
 *      metrics.py's arithmetic (lum 0 counts as blank) but it deleted 74% of the cloth after dark,
 *      and it is the amplitude half of failure 2. THERE IS NO OCCLUDING BLACK HERE EITHER: a cell
 *      that cannot clear the print's muddy ceiling is simply not written and what is behind it
 *      shows through. That one rule is what this whole element is built on — see minLum().
 *   4. THE DEVICE WAS A FIXED CENTRE COLUMN. At the distances the placement actually delivered the
 *      banner was 1-3 columns wide, so "a centre column plus two hem rows, 27% of the object" was
 *      in fact 56% of it, all in swatches the noon ladder condemns. The device here is keyed on the
 *      banner's OWN measured width and does not exist below nw = 3.
 *   5. THE BANNERS WERE NEVER NEAR ENOUGH TO SEE. The measured nearest banner over a 301-frame
 *      replay was 23.45 m, and two seeds of three drew none at all after dark. The limiting terms
 *      were the pitch, the district gate and the acceptance rate — NOT the near cut, which never
 *      bound. All three are much more generous here, and the result is measured rather than argued:
 *      over fourteen seeds at night, twelve draw between 4 and 130 cells, and the nearest banner is
 *      between 9.0 m and 13.5 m at nine of them. Two seeds (9 and 13) still draw nothing, and that
 *      is stated rather than hidden — see NOB_R.
 * ==================================================================================================
 *
 * THE PRINT IS THE DESIGN. Every threshold in minLum() was re-derived against core.js's live LUT
 * this session — by writing one cell through Surf.fog + CC.put + CC.Compose.post and reading
 * max(r,g,b)*lum/255 back out, which is metrics.py's own definition of a printed value — because
 * the table the first version was designed against was measured to be 5-10% optimistic, and that is
 * exactly the margin between a colour cell and a muddy one.
 */
(function (CC) {
  'use strict';

  /* One projector per element — see src/proj.js. V and PJ are this element's own basis and scratch;
   * the three helpers are closed over them. litFace() is deliberately not used: a sheet of hanging
   * cloth has no face normal worth computing at three columns wide, and this object is lit by the
   * lamp wash and the sky fill alone, exactly as the wall behind it is. */
  var PR = CC.Proj.make(), V = PR.V, PJ = PR.PJ;
  var project = PR.project, emit = PR.emit, column = PR.column;

  var P = CC.P, hash2 = CC.hash2, clamp = CC.clamp;

  /* GLYPHS, all from core.js's existing set and every one chosen by an argument already written down
   * in city.js or surf_japan.js rather than by eye:
   *   '=' the cloth field — the top of surf_japan.js's own INK ramp at 17% ink, which is as heavy as
   *       this world lets a non-emitting surface go.
   *   '|' the pole, and the luff and fly edges of the cloth. city.js records '|' as the most
   *       important glyph in this world, at 18.7% measured ink against '-' at 5.3.
   *   '-' the hem rows and the top lacing band. A hem is a horizontal edge caught from above, and
   *       the mark that says "edge" at this resolution is one with width across the cell.
   *   '8' the device. city.js reserves '#' and '8' as "the two heaviest glyphs the print will take
   *       without the bloom welding cells together", and a brushed mon on cloth is exactly that kind
   *       of solid mark. '#' is NOT used here: it is the shoji's lit paper and must stay unique.
   *   '`' the one wet glint, the same mark the gutter glint and the lantern core already use.
   * No diagonals anywhere, for city.js's reason: a kanji is built out of horizontals and verticals
   * and reads wrong the instant an 'X' or a 'Z' appears in it. */
  var G_PIPE = CC.g('|'), G_DASH = CC.g('-'), G_EQ = CC.g('='), G_8 = CC.g('8'),
      G_TICK = CC.g('`');

  /* Bound once per rebuild. `city.world`, never CC.World: between a keypress and the rebuild those
   * are two different answers and this file must agree with the map it is standing on. The salt is
   * this element's own — a different multiplier and shift from jp_town.js's — so a banner and a
   * stone lantern that happen to be walked with the same k do not roll correlated hashes. */
  var CITY = null, BASE = 0, JP = null;
  function boot(city) {
    CITY = (city && city.aveX && city.world === 'japan') ? city : null;
    BASE = CITY ? ((Math.imul(CITY.seed | 0, 52711) >>> 5) & 0x3fffff) : 0;
    JP = null;
  }

  /* Per-frame caches. EVERY ONE OF THESE IS ASSIGNED INSIDE view(), which the contract asks for by
   * name after two frontier files were left holding their declared defaults and silently stopped
   * following the clock. There is no wind cache here and that is not an omission: nothing in this
   * element moves, so the wind has nothing to act on.
   *
   * NIGHT is surf_japan.js's dNight and DAYF its dFill, read off the painter registry rather than
   * by CC.SurfJapan's name, so an element copied into another world picks up that world's painter.
   * Probed live at all four stops: NIGHT is 1 at night and 0 at dusk AND noon; DAYF is 0 at night
   * AND dusk and 1 at noon. That pair is what lets the daylight terms in groundLum() be ADDITIVE
   * and still satisfy the contract's "every daylight scale is the identity at night".
   *
   * LAMP is CC.Daylight.P.lamp and nothing else — never multiplied by a second night crossfade of
   * this file's own. That mistake is shipped, documented three times, and put the whole town out an
   * hour before dusk; the director already owns the fade and the hysteresis. Measured: LAMP is
   * 1.000 at night, 1.000 at dusk and 0.000 at noon, which is why dusk is the brightest hour this
   * object has — lamp wash and sky fill at once. */
  var W_WET = 1, NIGHT = 1, LAMP = 1, DAYF = 0;
  function view(f, cam, t) {
    PR.view(f, cam, t);
    if (!JP) JP = (CC.SURFACES && CC.World) ? CC.SURFACES[CC.World.id] : null;
    W_WET = CC.Weather ? CC.Weather.rel('wet') : 1;
    NIGHT = (JP && JP.night !== undefined) ? JP.night : 1;
    DAYF = (JP && JP.dayFill !== undefined) ? JP.dayFill : 0;
    LAMP = CC.Daylight ? CC.Daylight.P.lamp : 1;
  }

  /* The street-walk helpers, identical in shape and in argument to jp_town.js's — see that file's
   * notes, which are the authority. The one that is easy to get wrong is alongOf: an avenue is
   * indexed by x and RUNS along z, so the index comes off V.ox and the walk range comes off V.oz,
   * one axis apart from nearIdx directly above it, and nothing in either name says so. */
  function wxOf(axis, along, cross) { return axis ? along : cross; }
  function wzOf(axis, along, cross) { return axis ? cross : along; }
  function nearIdx(axis) {
    return Math.round((axis ? V.oz : V.ox) / (axis ? CITY.CROSS : CITY.AVE));
  }
  function centreOf(axis, idx) { return axis ? CITY.crossZ(idx) : CITY.aveX(idx); }
  function halfOf(axis, idx) { return axis ? CITY.crossW(idx) : CITY.aveW(idx); }
  function alongOf(axis) { return axis ? V.ox : V.oz; }
  /* WHERE THE WALL ACTUALLY IS, in world metres. city.js's colX() marks cells [c-hw, c+hw] as
   * corridor and a cell `g` covers world [g, g+1), so the building face on the +side is the plane
   * x = c + hw + 1 and on the -side it is x = c - hw. A tenth of a metre wrong here is not a
   * cosmetic error: the object ends up INSIDE the building and CC.put's depth test removes it
   * silently, with nothing anywhere reporting it. */
  function faceOf(axis, idx, side) {
    return centreOf(axis, idx) + 0.5 + side * (halfOf(axis, idx) + 0.5);
  }
  function heightAt(axis, along, cross) {
    return CITY.height(wxOf(axis, along, cross), wzOf(axis, along, cross));
  }

  /* ---- THE CONSTANTS, AND THE ARITHMETIC EACH ONE CAME OUT OF -------------------------------- */

  /* NOB_PITCH — metres between banner positions along a frontage, and the direct answer to measured
   * failure 5. The lanterns in jp_town.js are at 2.4, the noren at 5.4, the toro at 7.4; this is the
   * second tightest pitch of any object in this world and it has to be.
   *
   * THE ARITHMETIC. The banner is only drawn between 9 and 26 m (see NOB_NEAR/NOB_FAR), so the
   * window that matters is a 17 m annulus on each frontage, forward of the camera. At the original
   * design's 6.2 m pitch that annulus holds 2.7 candidate slots per side; after the frontage gate
   * (about a third of slots are vacant lot), the district gate and the acceptance rate, the expected
   * number of banners in view was well under one — which is exactly what the census of that version
   * found: 0.83 per frame at night, and none at all at two seeds of three. At 3.2 the same annulus
   * holds 5.3 slots per side, and measured over fourteen seeds twelve of them now draw. It is not a
   * picket fence: 3.2 m is a banner every shopfront bay and a half, and the distance gate removes
   * all but the two or three nearest, so what reaches the frame is a rank of two to four. The 1.2 m
   * jitter on top keeps the rank from reading as a comb — a festival street is set out by hand —
   * and is the same device, at the same fraction of the pitch, as the toro's 2.6 on 7.4. */
  var NOB_PITCH = 3.2;

  /* NOB_BOT / NOB_TOP — the cloth's foot and head in metres, so 2.05 m of cotton.
   *
   * THE HEIGHT IS A PRINT DECISION AND NOT A PROPORTION. surf_japan.js's lamp wash is a function of
   * HEIGHT and nothing else: identity below 1.0 m, smoothstepped to zero at 3.6 m, times 0.86. So
   * after dark a cell's write luminance falls off with how high up the cloth it is, and measured
   * against the live LUT a `white` cell needs 138 at 14 m to clear the print's muddy ceiling of
   * v = 119. groundLum() reaches 223 at NOB_BOT and crosses the 159 it needs after the margin at
   * about 2.03 m, so a 2.05 m banner is very nearly exactly as much cloth as the night can print,
   * and every centimetre above it would be cloth drawn only to be discarded. The design this
   * replaces put the top at 4.05 m and then blanked the upper 72% of it in every night frame.
   *
   * NOB_BOT 1.10 keeps the foot just inside the band where the lamp wash is still at full strength,
   * which is the only band in this world where a colour cell can clear v = 120 after dark. */
  var NOB_BOT = 1.10, NOB_TOP = 3.15;

  /* NOB_W — the cloth's width in metres, measured across the road. A real nobori is 0.55-0.70 m. At
   * V.colK 137.6 (200 columns, fov 1.25) that is 8.9 screen columns at 9 m and 3.1 at 26 m, so
   * across the whole range this object is drawn at it is 3 to 8 columns wide — enough for a device
   * column with cloth either side of it, narrow enough that three of them are not a wall. */
  var NOB_W = 0.58;

  /* NOB_OUT — how far the pole stands out from the frontage plane. The lanterns hang at 0.45, the
   * noren at 0.14, the toro at 0.85. 1.00 puts the banner in front of every one of them so it wins
   * CC.put's strict depth test rather than fighting it, and city.js's TH_JAPAN gives the narrowest
   * corridor (crossNarrow 2) about 5 m, of which two facing banners take 1.16 m of cloth and 2 m of
   * standoff — a festival street, not a blocked one. */
  var NOB_OUT = 1.00;

  /* NOB_NEAR / NOB_FAR — the only two distance numbers in the file, and both are print constants.
   *
   * NOB_FAR 26 IS core.js's FIRST DEPTH-BUCKET BOUNDARY. tone() quantises the print into DBUCKETS 8
   * across FOG_START 12 .. FOG_END 125, so the gamma lift retires in steps and every threshold in
   * minLum() jumps by 40-60% at d = 26.125 m: measured on the live LUT, `white` at night needs 153
   * at 25 m and 219 at 28 m. This element's maximum night write luminance is 223. So past 26 m after
   * dark there is no luminance that prints a banner at all, and the far cut is where the print puts
   * it rather than where a taste puts it. Keeping the same cut by day costs a few two-column smears
   * at 26-40 m and buys one number instead of a second threshold table for the far bucket.
   *
   * NOB_NEAR 9 is an AREA bound. At 9 m one banner is 8 columns by 18 rows before the threshold
   * takes rows off it, about 140 cells; at 6 m it would be 300, a quarter of a 200x60 frame in one
   * object. It was measured against the alternatives rather than picked: at 13 m only five of eight
   * test seeds drew a banner at all and at 11 m six did, because the nearest accepted slot usually
   * sits just inside the cut; at 9 m it is twelve of fourteen. That is the whole reason it is not a
   * rounder number.
   *
   * WHY THE NEAR CUT IS NOT ALSO A RATE BOUND HERE, which the blossom's note in jp_town.js is about
   * and which is worth being explicit on. A banner is RIGID and STATIC in world space, so as the
   * camera walks it sweeps ACROSS cells once and leaves them; it does not re-deal, oscillate or
   * dither in place, and a single pulse is not sustained energy in the 3-20 Hz band. That is the
   * difference between it and the petal, which crosses and re-crosses the same cells four times a
   * second, and between it and this design's own deleted sway. Verified rather than assumed:
   * `node tools/west-flicker.cjs 4` with this element in the tree returns japan seed 42 at
   * 0.50-0.75 big steps/s and 0.53-1.16% in the 3-20 Hz band on all six EDO presets — the same
   * numbers the tree measured before it existed — and RESULT: PASS.
   *
   * There is one thing near banners DO cost, and it is not flicker. At seed 1 a banner at 9.2 m
   * stands directly in front of a lit shoji and overwrites 33 cells that were in the print's hot
   * tail. The frame's hot percentage does not move (0.24% -> 0.24%) because the banner's own cells
   * take their place, but the trade is real and it is the argument for not going below 9 m. */
  var NOB_NEAR = 9, NOB_FAR = 26;

  /* NOB_R — per-district acceptance rate, keyed on CITY.DISTRICTS[districtAt()].name. A TABLE and
   * not a set, because a temple approach and a back lane want opposite densities and the same
   * literal cannot give both: a rank of four banners is what a matsuri looks like and one lone
   * banner is what a shop looks like, and both have to come out of one rule.
   *
   * ALL SEVEN ROWS ARE IN IT, and that is a repair rather than a taste. The design this replaces
   * listed three (temple, market, machiya — 49% of the ground by city.js's weights) and was measured
   * drawing nothing at all at two seeds of three. Traced: the camera was standing on a street whose
   * near frontages happened to be kura and castle for the whole replay, so the closest accepted
   * banner in any frame was 28.6 m away and the near half of the picture had none. A district gate
   * that can switch the object off for a whole street is the wrong shape for something meant to be
   * characteristic of the world. The rates instead say how OFTEN each quarter flies one: a temple
   * approach nearly always, a market street usually, a merchant row often, a storehouse district and
   * a back lane occasionally, a garden rarely, and the castle enclosure least of all — a wall you
   * cannot see over gets the standards at its gate and nowhere else.
   *
   * The absolute values are high because the frontage gate, the 9-26 m annulus and the occlusion
   * behind them throw away roughly three quarters of every candidate. Measured at these rates over
   * fourteen seeds at night: twelve draw, at 4 to 130 cells; seeds 9 and 13 draw nothing, in both
   * cases because the two accepted slots inside 26 m are hidden behind a corner building. */
  var NOB_R = { temple: 0.72, market: 0.64, machiya: 0.46, kura: 0.30, nagaya: 0.26, garden: 0.20,
                castle: 0.16 };

  /* NOB_DEV — the hem and device swatch, one roll per banner, and it is TWO swatches where the
   * design that preceded this had four.
   *
   * INDIGO WAS CUT OUTRIGHT. Measured through the live LUT, `indigo` cannot print v >= 120 at ANY
   * write luminance at ANY hour — night, dusk and noon all come back with no solution. A field of it
   * is a field of muddy cells by construction, and the census of the earlier version bore that out:
   * 15 indigo cells sitting in the muddy band at noon, from a guard whose entire purpose was to
   * prevent exactly that.
   *
   * ember IS THREE ROLLS IN FOUR AND IT IS THE LADDER'S CHOICE, NOT A TASTE. core.js's ladder()
   * splits the palette into SOURCES that blend on the sun curve and SURFACES that blend on the sky
   * curve, and the test for membership is "does it emit". A dyed cotton hem is a surface, so it is
   * `ember` (the lacquer and dyed-cloth vermilion) and not `red` (the lamp vermilion, which
   * jp_town.js's akachochin correctly spends on the paper lantern hanging next to it). Putting cloth
   * on the source curve would be the exact mistake ladder()'s own essay is written about. It is also
   * the cheapest accent to print in this world after dark: ember needs 114 at 14 m against white's
   * 138, so the dyed parts of a night banner clear before the cotton does.
   *
   * gold IS ONE ROLL IN FOUR — the gilt device of a temple banner. It is expensive (124 at night,
   * 229 at noon) and it is the swatch this world measures at 0.0% of lit energy, so one banner in
   * four carrying it is the difference between the palette having a slot and using it: at seed 3
   * night it puts gold on screen at 0.6% of lit energy, and at seed 3 dusk at 0.3%. */
  var NOB_DEV = [P.ember, P.ember, P.ember, P.gold];

  /* ---- THE PRINT THRESHOLDS, MEASURED, AND THE ONE RULE THIS ELEMENT IS BUILT ON ---------------
   *
   * A cell is written if and only if it will print at v >= 120. Otherwise nothing is written at all
   * — not a dim cell, and NOT occluding black. That is the whole of it, and it has three
   * consequences worth stating out loud because each was a defect in the version this replaces:
   *   - This element essentially cannot add a muddy cell. metrics.py's muddy band is 9 <= v < 120
   *     and every cell here is aimed over 120 or dropped, so the way it moves the muddy count is
   *     DOWN, by overpainting a muddy facade cell. Measured per frame at four seeds and three hours:
   *     it overpaints 8 to 133 muddy cells and adds between 0 and 9 of its own. The residue is not
   *     zero and the reason is honest: optics.js's per-row scanline gain and its exposure adaptation
   *     are applied to f.lum AFTER this element writes and this element cannot see them, so a cell
   *     aimed a point or two over the line can be pushed back under it. The 1.15 margin below is
   *     sized for that and mostly wins.
   *   - This element has no full-scale flash mechanism. Occluding black against a lit wall is a
   *     0 <-> 255 step every time an edge crosses a cell; a cell that is simply not written leaves
   *     the wall exactly where it was and steps by nothing at all.
   *   - The banner is SHORTER after dark than at noon, and nearer banners are taller than far ones.
   *     That is not a defect, it is the lamp wash made visible: a cloth lit from below fades into
   *     the dark above it, which is what a nobori under a lantern rank looks like.
   *
   * THE NUMBERS. Measured this session by writing one cell through Surf.fog -> CC.put ->
   * CC.Compose.post with the daylight pinned, and reading max(r,g,b)*lum/255 back out. Write
   * luminance needed for v >= 120 at 14 m:
   *
   *              night   dusk   noon
   *     white     138     106     97
   *     ember     114     184    210
   *     gold      124     210    229
   *     sand      175     127    114
   *
   * and the same table at 25 m is 153/116/105, 126/202/230, 137/230/251, 193/139/124.
   *
   * THE FOG RAMP INSIDE ONE DEPTH BUCKET IS ONE COMMON FACTOR FOR EVERY SWATCH AT EVERY HOUR, and
   * that measurement is what makes this a four-row table instead of a twelve-row one: the ratio of
   * the 25 m figure to the 14 m figure is 1.109 for white at night, 1.105 for ember, 1.105 for gold
   * and 1.105 for sand, and 1.082/1.095/1.096/1.088 at noon. `1 + 0.0095 * (d - 14)` reproduces all
   * sixteen to within 2%.
   *
   * THE 1.15 MARGIN IS NOT SLACK, IT IS THE TWO GAINS THIS FILE CANNOT SEE. optics.js multiplies
   * f.lum by the eye's adaptation (measured between 0.937 and 1.016 across the seeds used here) and
   * by a per-row modulation whose worst row carries the scanline dip of (1 - 0.070). Their worst-case
   * product is about 0.87, and 1/0.87 is 1.15. It also absorbs the 2% the fog approximation above
   * gives away, and the fact that the table was probed at the default weather while a fixture runs
   * whatever the schedule hands it.
   *
   * THE ONE ARITHMETIC RESULT WORTH CARRYING AWAY, and it inverts the naive plan: VERMILION AND GOLD
   * ARE NIGHT COLOURS IN THIS PRINT AND WHITE IS A DAY COLOUR. ladder() blends toward EXPOSURE_DAY
   * while GAMMA goes 0.33 -> 0.62 and crushes the mid out from under them, so an ember cell that
   * clears comfortably at midnight cannot be made to clear at midday at any luminance this object
   * writes. That is why the banner's ground is white and its dye is a line — and it is why, at noon,
   * the dye is quietly demoted to cloth by the rule below and the object is a plain white cotton
   * banner. That is not a defect being hidden: it is the measurement, and the alternative was tried
   * and priced. Writing the noon ground bright enough to carry the ember device (0.62 -> 0.70 in
   * groundLum, or the margin down to 1.10) does put 22-43 ember cells per frame back into the noon
   * picture, and it costs 0.35 points of muddy and 0.37 points of hot tail averaged over the four
   * noon fixtures, because every device cell it saves is a cell that would otherwise have printed
   * white in the hot tail. Anyone who wants the noon colour more than the noon census has one
   * constant to change and the price of it is written here. */
  var NOB_TN = [138, 114, 124, 175];     // night, at 14 m: white, ember, gold, sand
  var NOB_TE = [106, 184, 210, 127];     // dusk
  var NOB_TD = [97, 210, 229, 114];      // noon

  function minLum(si, d) {
    var th = NOB_TN[si] * NIGHT + (1 - NIGHT) * (NOB_TE[si] + (NOB_TD[si] - NOB_TE[si]) * DAYF);
    return th * (d > 14 ? 1 + 0.0095 * (d - 14) : 1) * 1.15;
  }

  /* ---- THE LIGHT ON THE CLOTH ------------------------------------------------------------------
   * lampAt REPRODUCED BY HAND, including the 0.86 the first version of this dropped. surf_japan.js
   * exports no lamp function to call, and a banner lit by a different town than the wall behind it
   * is the most visible possible error, so the shape is copied exactly: identity below 1.0 m,
   * smoothstepped to zero at 3.6 m, scaled by 0.86.
   *
   * The whole census turns on the expression under it. BOTH daylight terms are ADDITIVE and both are
   * zero at night — NIGHT is 1 at night, DAYF is 0 at night and at dusk — so the contract's "every
   * daylight scale is the identity at night" holds by construction rather than by inspection. The
   * three stops it produces, against the threshold table above:
   *   NIGHT  foot 223 (white needs 159 after the margin: clears), 2.03 m 159 (the last row that
   *          clears), head 45 (never written). So a night banner is its lower 45%, and the ember hem
   *          and gold device — which need only 131 and 143 — are the first things on it to print.
   *          Measured 43-130 cells per frame.
   *   DUSK   foot 255 (white needs 122 to clear and 199 to be HOT, so a near banner's foot is the
   *          first non-`pure` hot cloth this world has had), 2.05 m 222, head 113, which is just
   *          under and drops the top row or two. Lamp and sky at once make this the object's
   *          brightest hour: measured 118-255 cells per frame, of which 21-96 print hot.
   *   NOON   uniform 237 (white needs 112 to clear and 192 to be HOT at 14 m, so the whole banner
   *          lands in the hot tail — the one number EDO is short of, measured at 0.73% against a
   *          3.5-5% target). ember needs 242 after the margin, so the device demotes to cloth; see
   *          the last paragraph of minLum() for what buying it back would cost.
   * The 30 floor and the 225 span are chosen so the night foot lands at 223 rather than at 255: a
   * banner is a lit surface and not a source, and it must not outprint the paper shopfronts this
   * world's whole lighting model is built on. */
  function lampAt(vy) {
    if (vy <= 1.0) return 0.86;
    if (vy >= 3.6) return 0;
    var k = (3.6 - vy) / 2.6;
    return 0.86 * k * k * (3 - 2 * k);
  }
  function groundLum(vy) {
    return 30 + 225 * clamp(lampAt(vy) * LAMP + (1 - NIGHT) * (0.30 + 0.62 * DAYF), 0, 1);
  }

  /* ==================================================================================== nobori ===
   * One frontage walk, exactly drawToro's, and then per accepted slot: a pole, a sheet of cloth, and
   * at most one wet glint.
   *
   * THE CLOTH SPANS ACROSS THE ROAD, NOT ALONG IT, and this is the geometry the object lives or dies
   * by. A nobori is laced to its pole down one edge and hangs from a crossbar at the top, so its
   * face normal is perpendicular to the pole. A rank of them lines an approach FACING THE PERSON
   * WALKING UP IT, which means the face points along the street and the cloth's width runs across
   * it. Hang it the other way and every banner in the rank is seen edge-on by the only camera this
   * project has, which is a one-column smear.
   *
   * THE TWO CORNERS ARE PROJECTED, NOT COMPUTED FROM colK. The obvious implementation takes one
   * projected point and steps `NOB_W * V.colK / d` columns sideways, and it is wrong in two ways at
   * once: it assumes the cloth is perpendicular to the view direction (it is not, except dead
   * ahead), and the screen direction of "outward across the road" flips sign with the side of the
   * street and again with the camera's yaw. Projecting both bottom corners costs one extra call and
   * gets the foreshortening, the sign and the width all correct for free. It is the same argument
   * west_range.js's catenary and jp_town.js's kasagi make for sampling in world space. */
  function drawNobori(f, axis, idx) {
    var here = alongOf(axis);
    /* The walk window is the far cut plus one pitch, not a fixed 40 m: every slot outside 26 m is
     * rejected by the distance gate below anyway, and walking 90 m of frontage to throw away 65 of
     * it is the kind of cost that does not show up until four elements are all doing it. */
    var lo = Math.floor((here - NOB_FAR - NOB_PITCH) / NOB_PITCH);
    var hi = Math.floor((here + NOB_FAR + NOB_PITCH) / NOB_PITCH);
    if (hi - lo > 24) hi = lo + 24;

    for (var side = -1; side <= 1; side += 2) {
      var wall = faceOf(axis, idx, side);
      var poleC = wall - side * NOB_OUT;              // the pole, a metre out from the frontage
      var clothC = wall - side * (NOB_OUT + NOB_W);   // far edge of the cloth, further into the road
      var lace = wall - side * (NOB_OUT + 0.06);      // near edge: 6 cm of daylight past the pole
      var back = wall + side * 0.8;                   // one step into the block: the wall itself

      for (var k = lo; k <= hi; k++) {
        var along = k * NOB_PITCH + hash2(k, side, BASE + 0x61) * 1.2;

        /* THE FRONTAGE GATE IS h > 1.6, NOT the design's 2.6. A banner is planted at the KERB and
         * does not hang off an eave, so all it needs is a building to stand in front of — and
         * city.js's `market` row has hMin 3.4 while `garden` has 2.6, so a 2.6 m floor was quietly
         * refusing the two lowest and busiest frontages in the world. What this really tests is "is
         * this a built frontage rather than a vacant lot", and 1.6 tests that and nothing else. */
        if (heightAt(axis, along, back) < 1.6) continue;

        /* THE DISTRICT IS PROBED AT THE WALL, not at the pole. The pole stands a metre into the
         * carriageway and the carriageway belongs to whichever district's cell happens to reach it;
         * the frontage behind it is the one that owns the shop the banner belongs to. */
        var D = CITY.DISTRICTS && CITY.DISTRICTS[CITY.districtAt(wxOf(axis, along, back),
                                                                 wzOf(axis, along, back))];
        var rate = D ? NOB_R[D.name] : 0;
        if (!rate) continue;
        if (hash2(k, side * 3 + (axis ? 7 : 0), BASE + 0x62) > rate) continue;

        /* Nothing standing inside a building. The pole is a metre off the frontage plane, which is
         * clear of the block on any ordinary street, but a corner lot can put a wall there. */
        if (heightAt(axis, along, poleC) > 0.5) continue;

        /* ---- the two bottom corners and the top -----------------------------------------------
         * Order matters: PJ is one shared scratch record, so every value has to be copied out
         * before the next project() overwrites it. */
        if (!project(wxOf(axis, along, lace), NOB_BOT, wzOf(axis, along, lace))) continue;
        var xa = PJ.x, rb = PJ.y, d = PJ.d;
        if (d < NOB_NEAR || d > NOB_FAR) continue;
        if (!project(wxOf(axis, along, clothC), NOB_BOT, wzOf(axis, along, clothC))) continue;
        var xb = PJ.x;
        if (!project(wxOf(axis, along, lace), NOB_TOP, wzOf(axis, along, lace))) continue;
        var rt = PJ.y;

        var c0 = Math.floor(xa < xb ? xa : xb), c1 = Math.floor(xa < xb ? xb : xa);
        var r0 = Math.floor(rt), r1 = Math.floor(rb);
        if (r1 < r0) { var sw = r0; r0 = r1; r1 = sw; }
        /* Off the side of the frame entirely, and a defensive bound on the row span: a banner that
         * projects to more rows than the frame has is one the near cut should already have removed,
         * and looping over it would be the one path here that is not cheap. */
        if (c1 < 0 || c0 >= V.cols) continue;
        var nw = c1 - c0 + 1;
        if (nw > 8) nw = 8;
        if (r1 - r0 > V.rows) continue;

        /* ---- the pole ------------------------------------------------------------------------
         * ONLY THE PART BELOW THE CLOTH, 0 to NOB_BOT + 0.10. That is a metre and a bit of bamboo
         * standing on the road under the banner, which is what you actually see of it, and it is the
         * first half of the fix for measured failure 1: the pole and the cloth cannot contend for a
         * cell they never share. (The second half is the -0.02 depth bias on the cloth below.)
         *
         * `sand` AND NOT `timber`, AND IT IS THE PRINT THAT DECIDES. Measured on the live LUT,
         * timber cannot reach v = 120 at any luminance at night and needs 254 at noon inside 14 m —
         * so a timber pole is a column of guaranteed muddy cells at every hour, which is exactly
         * what the census caught the first version of this doing, 17-23 of them per frame, appearing
         * nowhere in that design's own reasoning. sand is scraped bamboo, it needs 175 at night and
         * 114 at noon, and the luminance below reaches both.
         *
         * The 0.92 is the pole's own shading and it is a measured number as much as a physical one.
         * A round pole turns away from the light over most of its circumference, so it has to be
         * written under the flat sheet beside it; but bamboo is smooth and picks up a sheen down its
         * length, so it must not be written far under. At 0.80 the night pole landed at 179 against
         * sand's margined 201 and was dropped at every hour after dark, which left the banner
         * floating; at 0.92 it lands at 206 and prints inside about 14 m and not beyond, so near
         * banners stand on something and far ones do not. Measured 5-15 sand cells per frame. */
        var plum = groundLum(0.55) * 0.92;
        if (plum >= minLum(3, d))
          column(f, wxOf(axis, along, poleC), wzOf(axis, along, poleC),
                 0, NOB_BOT + 0.10, G_PIPE, P.sand, plum, 0);

        /* ---- the cloth -----------------------------------------------------------------------
         * THE DEVICE COLUMN IS KEYED ON THE BANNER'S OWN WIDTH. The design this replaces put it at a
         * fixed centre column and assumed a 7-column banner; at the distances that placement
         * actually delivered, nw was 1-3, so "the device plus two hem rows is 27% of the object"
         * came out at 56% and every one of those cells was in a swatch the noon ladder condemns.
         * Here: no device at all below nw = 3 (there is no room for one that is not the whole
         * banner) and no edge columns below nw = 4, for the same reason. Over the 9-26 m this
         * element is drawn at, nw runs 3 to 8. */
        var dev = NOB_DEV[(hash2(k, side, BASE + 0x63) * 4) | 0];
        var devI = dev === P.gold ? 2 : 1;              // index into the threshold table
        var cd = nw >= 3 ? (nw >> 1) : -1;              // the device column, or none
        var hemR = (r1 - r0) >= 8 ? 1 : 0;              // two hem rows on a tall banner, one on a short
        var cdq = (k * 7 + side * 3) | 0;               // the device's own hash lane
        var c, r;

        for (r = r0; r <= r1; r++) {
          /* The cloth's world height for this row, which is what the lamp wash is a function of.
           * Guarded for the one-row case, where the banner is its own foot. */
          var vy = r1 > r0 ? NOB_BOT + (NOB_TOP - NOB_BOT) * (r1 - r) / (r1 - r0) : NOB_BOT;
          var gl = groundLum(vy);
          var top = r === r0, hem = r >= r1 - hemR;

          for (c = 0; c < nw; c++) {
            var edge = nw >= 4 && (c === 0 || c === nw - 1);
            var ch, si, col, lm;

            if (hem || top) {
              /* The hem and the top lacing band: the dyed edge, all the way across. Two rows out of
               * eighteen, or one out of eight — a LINE and not a field, which is the only form ember
               * and gold are licensed in by the table above. */
              ch = G_DASH; si = devI; col = dev; lm = gl;
            } else if (c === cd &&
                       /* THE DEVICE IS A BROKEN VERTICAL RUN, AND IT IS KEYED IN WORLD SPACE. A
                        * column of brushed kanji at three columns and ten rows is not a shape, it is
                        * a rhythm of ink and gap — the same argument city.js makes for SIGN_CH_JP
                        * having no diagonals. The hash is taken on the cloth's own HEIGHT quantised
                        * into 17 cm bands, `(vy * 6) | 0`, and NOT on the screen row `r`. That
                        * distinction is the entire photosensitivity story of this element: a dither
                        * keyed on a screen row RE-DEALS every time the camera moves the banner up or
                        * down a cell, which is a broadband per-frame flash exactly like the one that
                        * has tripped this world five times; keyed on world height, a given band of
                        * cloth keeps its ink for as long as it is on screen and the only thing that
                        * changes is which cell it lands in. 0.62 is 62% ink, which over ten rows is
                        * six marks and four gaps — a brush stroke rather than a dotted line. */
                       hash2(cdq, (vy * 6) | 0, BASE + 0x64) < 0.62) {
              ch = G_8; si = devI; col = dev; lm = gl;
            } else if (edge) {
              /* The luff and the fly. A hanging sheet curls at its free edges and turns away from
               * the light, so they are the same cotton written at 0.86 — which also means they are
               * the first cells minLum drops as the banner climbs into the dark, and the object
               * narrows toward the top the way a real one does as it goes out of the lamp. */
              ch = G_PIPE; si = 0; col = P.white; lm = gl * 0.86;
            } else {
              ch = G_EQ; si = 0; col = P.white; lm = gl;
            }

            /* THE ONE RULE. Under threshold in its own swatch, the cell falls back to cloth — a dye
             * this print cannot resolve at this hour is still a piece of cotton — and under
             * threshold as cloth it is not written at all. No dim cells and no occluding black. */
            if (lm < minLum(si, d)) {
              if (si === 0) continue;
              ch = G_EQ; col = P.white; lm = gl;
              if (lm < minLum(0, d)) continue;
            }
            /* -0.02 m of depth bias, and it is the second half of the fix for measured failure 1.
             * The pole is already drawn below the cloth so the two barely meet, but where they do —
             * the hem row sitting on the head of the pole — this makes CC.put's strict
             * `dist < f.dist[i]` a decided question instead of a float32 coin toss that lands
             * differently every frame. 2 cm is seven hundred times finer than the print's own depth
             * quantiser (DBUCKETS 8 over 113 m, i.e. 14 m to a bucket), so it changes the fog, the
             * bucket and the printed value by exactly nothing. */
            emit(f, c0 + c, r, ch, col, lm, d - 0.02);
          }
        }

        /* ---- the one wet glint ---------------------------------------------------------------
         * `pure` is the only swatch in this palette that prints in the hot tail after dark at a
         * luminance an ordinary object can write — 101 at 14 m for v >= 170, against red's 152 — and
         * core.js's own note on it is "specular hits only, use sparingly". One cell per near banner
         * in wet air is as sparing as it is possible to be, and it is the discipline the lantern
         * core and the gutter glint already keep.
         *
         * IT IS WRITTEN AT c0 + nw, ONE COLUMN PAST THE CLOTH, AND THAT IS NOT A DETAIL. The cloth
         * loop covers c0 .. c0 + nw - 1 at depth d - 0.02, so a glint aimed inside it would be
         * rejected by CC.put's strict depth test at the same d — which is measurably what happens to
         * the existing lantern core, and why that one prints five cells in a night frame instead of
         * one per lantern. Here the target is a cell this object has not touched, and it is written
         * at d - 0.04 so it also wins against whatever is behind it. Measured 1-2 per frame at night
         * and at dusk, and each one is hot. The physical reading is a drop running off the fly edge
         * and catching the lantern the banner is standing under, which is why it is gated on the
         * lamp being lit and on the air actually being wet. */
        if (LAMP > 0.4 && W_WET > 0.5 && d < 20 && r1 > r0)
          emit(f, c0 + nw, r1 - 1, G_TICK, P.pure, 132 * LAMP, d - 0.04);
      }
    }
  }

  /* ---- registration ---------------------------------------------------------------------------
   * Layer 18, between jp_town.js's toro (17) and its lanterns (19), which is where a thing standing
   * a metre into the road belongs in the paint order: in front of the stone lantern against the wall
   * and behind the chochin hung out over it. Its own layer rather than folded into a neighbour's,
   * because the layer sort is what decides that order. init consumes no rng, so nothing downstream
   * of it in the shared stream moves — and because main.js filters on world BEFORE the layer sort, a
   * `world: 'japan'` element cannot touch any other world's list or stream at all. Verified rather
   * than asserted: all twenty-seven standing fixtures (cyber/west/moon x night/dusk/noon x seeds
   * 3/42/7) render byte-identical with this file present and with it absent.
   *
   * NOTHING IN THIS ELEMENT MOVES, AND THAT IS THE MOST IMPORTANT LINE IN THE FILE. There is no
   * update(), no state, no vnoise and no use of t: the banner is a pure function of (map, camera,
   * hour). The design this replaces carried a 0.12 m sway at 0.35 Hz, argued at length as "the
   * noren's shape an octave lower, no risk", and tools/west-flicker.cjs measured it at 30.25 big
   * steps per second against an absolute cap of 8.0, on six of six EDO presets, with the world's
   * 3-20 Hz band energy going 1.87% -> 4.28%. Deleting the one sway line took it back to 0.50/s and
   * a PASS. The mechanism was not the one that design analysed: it computed the amplitude as a
   * printed LUMINANCE change of a couple of percent, but the sway was POSITIONAL and the object's
   * own blanking rule wrote every sub-threshold cell at lum 0 — so a 1.3-column wobble stepped a
   * whole column of a 22-row banner between 0 and full scale, twenty-two cells at once. A sub-cell
   * position wobble on a blanked object is a full-scale luminance flash and not a shape moving, and
   * the two features that design was proudest of cancelled each other exactly.
   *
   * So: no sway, and no occluding black either, which removes both halves of it. CC.reducedMotion
   * therefore needs no branch here — the element is FROZEN by construction at every setting, which
   * satisfies the reduced-motion absolutes (band <= 0.5%, rate <= 0.05/s) trivially rather than by a
   * damping factor that would itself have to be measured; the gate reports japan at 0.00% and
   * 0.00/s under reduced motion on all six presets with this element in the tree. Any future motion
   * on this object has to be run through tools/west-flicker.cjs BEFORE it is written down as safe. */
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

  CC.ELEMENTS.push(mk('jp-nobori', 18, function (f) {
    var i;
    for (i = -1; i <= 1; i++) drawNobori(f, 0, nearIdx(0) + i);
    for (i = -1; i <= 1; i++) drawNobori(f, 1, nearIdx(1) + i);
  }));

})(typeof CC !== 'undefined' ? CC : require('../core.js'));
