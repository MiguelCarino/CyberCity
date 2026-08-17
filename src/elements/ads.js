/* CyberCity ads — storey-scale lit media bolted to the building faces. Layer 34.
 *
 * WHAT THIS IS AND WHAT IT IS NOT. elements/signage.js owns everything at SHOPFRONT scale: the
 * tubes over a door (neon, 30), the junction heads (31), the translucent panels (holo, 33) and the
 * pool a shop throws on the pavement (28). Its fixtures are 1.5-2.5 m across and hang 3-8 m up.
 * This file owns the scale ABOVE that and nothing else: one board 4.7-10.7 m wide and 4.2-7.0 m
 * tall — one and a half to two and a half storeys — bolted flat to a facade with its foot 4.6-7.8 m
 * up and its top never above 12 m, and read from across the street. Different object, different
 * placement rule, different budget. If you find yourself writing anything under 4 m here, it
 * belongs in signage.js.
 *
 * WHY CONTENT IS THE WHOLE POINT. A lit rectangle on a wall is not an advertisement, it is a lit
 * wall, and the first draft of this file was exactly that. What makes a canyon read as a canyon is
 * that the bright rectangles have PICTURES in them. So every board carries one of three
 * constructions in its own fixed grid — a figure, a word, or a product — and cuts between them.
 * At character resolution a face is not modelled, it is a light mass with three dark marks cut out
 * of it; a word is a 5x7 bitmap blown up until one letter is four to seven cells wide; body copy is
 * not written, it is a texture of marks on alternate rows that reads as text you cannot resolve.
 * Everything here is sized for the board a viewer actually gets, which the sweep says is 10-35
 * screen columns and 20-45 rows, most of them wedges on a grazing wall — not for the flat
 * fifty-column board that only exists head-on.
 *
 * THE PRINT BUDGET, WHICH IS THE HARD PART. Measured on the RENDERED value v (see core.js's print
 * curve): muddy is 9 <= v < 120 and hot is v >= 170, and BOTH are over-subscribed frame-wide. The
 * band between them, v 120-169, is free — it is bright, it is neither statistic — and this whole
 * file is built to live in it. Two rules follow and neither is negotiable:
 *
 *   1. INK IS BINARY, EXCEPT ACROSS A CUT. Every lit cell of a board prints at v 120-163 (see PEAK
 *      below, measured per swatch through the curve at six distances) for every frame of the
 *      15-20 s a picture is held: what separates body copy from a face is the GLYPH and the
 *      swatch, never the brightness, and a standing dim ink level would put the largest object in
 *      the frame straight into the muddy band. The one exception is the CELL_FADE ramp a cell runs
 *      while the board is changing picture, which is the fix for this element's worst measured
 *      artifact and is argued at the constant. It is bounded and it was costed, on metrics.py's
 *      own v (max(r,g,b) scaled by the printed lum), over 20 s of the flicker-rate fixture — 4
 *      seeds x 8 bearings, one full cut — counting only this element's own cells:
 *          black(v<9)  79.953% -> 80.380%      muddy(9-119)  0.000% -> 0.211%
 *          free(120-169) 17.209% -> 16.673%    hot(v>=170)   2.838% -> 2.736%
 *      Two tenths of a point of muddy is what a cut costs, and it buys a tenth of a point back
 *      out of the over-subscribed hot tail, because a cell on its way down spends a few frames in
 *      the free band instead of sitting at its peak. On the whole frame it does not show at all:
 *      over the 32-frame fixture below, muddy 27.8% -> 27.8% and hot 4.19% -> 4.19%, with black
 *      and every palette share inside a tenth of a point.
 *   2. EVERYTHING ELSE IS HONESTLY BLACK. The board's body and bezel are P.shadow at lum 9, which
 *      prints v 5.7 at the near end of the curve — under the v=9 black line at every distance.
 *      P.shadow at lum 12 prints 9.8 and is muddy, so the margin here is three units of lum and
 *      that is why the constant is written out rather than eyeballed. The board is therefore a
 *      BLACK CUT-OUT with bright marks on it, which is the house style for every dark object in
 *      this project, and it costs nothing but the cells it takes off the facade.
 *
 * MOTION. One wipe — a soft crest travelling across the board in 4.5 s, 0.22 Hz — and one content
 * cut every 15-20 s. The cut is a large area changing, so it is spread THREE ways and it used to be
 * spread only two, which was this element's defect and is the whole of this round's repair:
 *   - over the board: each cell takes its own hashed moment out of the DISSOLVE window, so the
 *     panel never changes as a body;
 *   - over time: the window is DISSOLVE = 2.6 s;
 *   - and, new, WITHIN THE CELL: a cell ramps its ink off over CELL_FADE = 0.36 s, swaps picture
 *     at the bottom of the ramp, and ramps the new ink on over another 0.36 s.
 * The third of those was missing. Each cell's change was a single binary flip, so a cell whose new
 * code was an accent went from the dark panel at lum 9 to violet ink clamped at 255 inside ONE
 * frame — 246 units, 96.5% of full scale, the largest single-cell step in the entire piece as
 * measured by tools/flicker-rate.cjs section 2 (seed 0, yaw 0.00, t=0.43 s under 'clear',
 * t=0.75 s under 'storm'). Spreading a cut over the board is not the same thing as spreading it
 * over the cell, and only the second of those is what a person staring at one cell receives.
 * With the ramp in, the same measurement over all four seeds and eight bearings reads 7.1% of 255
 * under 'clear' and 6.3% under 'storm', with no cell at all exceeding the harness's 34% ceiling.
 * A SECOND, INDEPENDENT DEFECT was found in the same measurement and is written out at the cut
 * scheduling in setup(): the picture the dissolve was heading for was not the picture the next
 * hold showed, so on half the boards the whole panel jumped construction in one frame at every
 * cut boundary with no dissolve at all — 182 cells over the ceiling in a single frame at seed 0,
 * yaw 0, t=15.35 s. That is now impossible by construction rather than by tuning.
 * Nothing in this file pulses, and the fastest thing in it is the wipe at 0.22 Hz — two orders
 * under the 3 Hz line.
 * The other way a board can change a lot of cells at once is by ARRIVING or LEAVING, and the two
 * places that can happen are both ramps rather than thresholds: the far end dissolves over the
 * last DISS_W metres of the range, and the near end — a board rising out of the top of the frame
 * as you walk under it — dissolves over the last 15% of the clipped-height test (clipFrac). See
 * the measurement quoted at clipFrac's use in drawAd(); the second of those was a hard edge until
 * this round and it was this element's largest single-frame move.
 *
 * AT MOST TWO BOARDS. Enforced in draw() by a two-slot selection (SEL) ranked on CLIPPED SCREEN
 * AREA — not by a counter that stops mid-scan, which would give the budget to whichever board the
 * gz-then-gx loop reached first, and not by distance, for the photosensitivity reason written out
 * at the ranking itself. Three lit billboards in one frame is a Times Square; this is a back
 * street.
 *
 * HOW OFTEN ONE IS IN SHOT, which is the number this file was reviewed on and failed. Over a
 * 32-frame fixture (seeds 3001 + 137k for k=0..7, frames 600/1200/1800/2400, 213x67) the first
 * cut of this file put a board in the picture in ELEVEN frames, i.e. an advertising city with no
 * advertisement in it two thirds of the time. It is now seventeen, fifteen of which carry 20+ lit
 * cells of board (the other two are boards mid-dissolve on their way out of the top of the frame),
 * and two frames carry two boards. The three changes that bought that are each argued where they
 * are written: the rate gate in setup() is gone, the width want is 7.2-11.0 m rather than 5.4-11.0,
 * and the top rail is capped at 12 m rather than 13.5 with the height capped at 7 m rather than
 * 8.5. Mean drawn board went from 12.4 to 22.4 screen columns on the same fixture, and mean lit
 * cells per drawn board from 79 to 80 — i.e. the ink per board is unchanged and the board it sits
 * on is nearly twice as wide, which is what the near retirement (AREA_MAX) is there to hold.
 * WHAT DID NOT CHANGE, because it was measured and it does not help: the occlusion floor (raising
 * it from 0.45 to 0.70 does not remove a single drawn board — every board that survives the
 * framing tests is already 70%+ unoccluded), and the depth-ratio gate at 1.8 (tightening it to 1.5
 * takes the fixture from seventeen frames to three, because the walls this city offers a walker
 * are grazing ones and a board on one is a wedge or it is nothing).
 *
 * WHAT IT COSTS, measured with-vs-without on those same 32 frames. Both arms run in ONE process,
 * the 'without' arm still calling this element's init() so that the single rng() draw lands and
 * every other element sees an identical world — moving the file out of src/elements/ instead
 * re-rolls the shared stream and regenerates half the frame, which is why the review that ran that
 * way could only call this file's cost "inside the noise floor":
 *
 *     muddy (v 9-119)  26.371%  vs  26.667%   ->  -0.296 points
 *     hot   (v >= 170)  4.182%  vs   4.204%   ->  -0.021 points
 *     black (v < 9)    55.118%  vs  54.912%   ->  +0.206
 *     amber lit energy 44.306%  vs  44.462%   ->  -0.156
 *     azure lit energy 31.382%  vs  31.296%   ->  +0.086
 *     ember            2.228%   vs   2.141%   ->  +0.088
 *     violet           0.551%   vs   0.494%   ->  +0.056   (signage garnish, see the hue block)
 *     warm            12.178%   vs  12.207%   ->  -0.030   (there is no warm in this file at all)
 *
 * BOTH BUDGET DELTAS ARE NEGATIVE and that is not an accident, it is the design: a board puts
 * 250-500 cells of honest black over a facade that was printing window lattice in the muddy band,
 * and lands 60-150 cells of ink in the free band between the two statistics. The city's largest
 * lit objects are, on this census, cheaper than the wall they cover — and they got BIGGER and
 * twice as frequent this round while the deltas went further negative, which is the whole argument
 * for the v 120-169 band restated as a measurement.
 *
 * THE SAFETY HARNESS NOW SAMPLES THIS ELEMENT BY NAME, and the paragraph that used to stand here
 * did not know that. It said "all six sky presets pass tools/flicker-rate.cjs with this file
 * present, and the worst per-cell step in every one of them is attributed to signals, not to a
 * board", and then explained that the harness looks up neon/shopSpill/signals/holo and so does not
 * measure this element at all. Both halves were true and together they were worthless: the passes
 * being quoted were statements about signage. 'ads' is on that tool's NAMES list now, and the
 * first run that actually looked at this file put the largest single-cell step in the whole piece
 * here — see MOTION above for what it was and what fixed it. The standing numbers to regress
 * against, seeds 0/7/42/555 x 8 bearings x 20 s: worst per-cell step 7.1% of 255 under 'clear' and
 * 6.3% under 'storm' (ceiling 34%), busiest cell 0.000 steps/s over that ceiling (limit 1.0/s),
 * and 0/255 under reduced motion on both skies.
 * The whole-frame check is still worth keeping separately, because a per-cell ceiling says nothing
 * about an object arriving: over seed 3549 frames 1700-1860, the walk that carries the largest
 * board in the fixture, the worst single-frame move in whole-frame mean printed value attributable
 * to ads is 0.78 of a unit against 1.20 for the same stretch with this file absent — i.e. under
 * the frame's own ambient step. Three other approach stretches put it at 0.17-0.46.
 */
(function (CC) {
  'use strict';

  var P = CC.P, g = CC.g, put = CC.put, hash2 = CC.hash2, clamp = CC.clamp, smooth = CC.smooth;

  /* Two banks. MASS is for the picture: every glyph here fills most of its cell, so a run of them
   * prints as one solid shape and a face reads as a mass rather than as a lattice. TEXT is for
   * copy you cannot resolve — mid-weight marks of varying width. Deliberately no '.' or ',': a
   * speck glyph is invisible at any brightness (it has cost this project two bugs) and body copy
   * drawn in specks is a board with nothing written on it. */
  var G_8 = g('8'), G_HASH = g('#'), G_M = g('M'), G_W = g('W'), G_X = g('X'),
      G_0 = g('0'), G_AT = g('@'), G_N = g('N'), G_Q = g('Q'), G_O = g('O');
  var G_EQ = g('='), G_DASH = g('-'), G_COLON = g(':'), G_STAR = g('*'),
      G_PLUS = g('+'), G_SEMI = g(';'), G_o = g('o'), G_PCT = g('%');
  var MASS_G = [G_8, G_HASH, G_M, G_W, G_X, G_0, G_AT, G_N, G_Q, G_O], MASS_N = 10;
  var TEXT_G = [G_EQ, G_DASH, G_COLON, G_STAR, G_PLUS, G_SEMI, G_o, G_PCT], TEXT_N = 8;

  /* ---- the ink ladder -------------------------------------------------------------------------
   * Peak lum PER SWATCH, chosen so that every one of them prints in the free band. Measured by
   * pushing one cell through CC.tone at six distances with the attenuation below applied:
   *
   *   at dist   24    30    36    42    48    53      (flat ink / under the wipe's crest)
   *   amber 196  161   147   146   132   130   129     175 162 160 147 146 145
   *   azure  95  159   145   143   129   127   126     173 160 158 146 143 142
   *   ember 220  152   138   136   122   121   120     165 152 150 137 136 135
   *   violet 255 152   138   136   122   121   120     154 141 141 129 129 129
   *
   * Two things this table says out loud. First, the swatches do NOT share a peak: amber needs 196
   * where azure needs 95 for the same printed value, because their exposures are 0.50 and 1.00 —
   * writing one constant for both would have put every azure board 50 units into the hot tail.
   * Second, violet cannot be pushed: at lum 255 it tops out at 154, which is exactly why it is
   * licensed here as signage and still forbidden as a surface — it can garnish a board and it can
   * never lead one. The two garnish swatches bottom out at v 120 at the far end of the range,
   * which is one unit inside the free band and is why FAR is where it is. Past it the answer is
   * the one this file uses everywhere: fade by taking cells AWAY, never by dimming them into the
   * mud. PEAK is indexed by PALETTE slot, so the unused swatches carry sane values rather than
   * holes — P.shadow's entry is the panel level and is read as PEAK[P.shadow] by nothing, since
   * the dark body writes PANEL_LUM directly. */
  var PEAK = [196, 95, 220, 150, 255, 205, 150, 255, 200, 180, 150, 9];

  var PANEL_LUM = 9;      // P.shadow -> v 5.7 near, less far. See the header: 12 would be muddy.
  /* The wipe's gain over the flat level. 1.30 x amber at the near end of the range prints v 179,
   * which is over the v=170 hot line — deliberately, because this is the ONLY thing in the file
   * that is allowed there and it is a band six columns wide crossing a board every 4.5 s. Per
   * frame a cell under the crest edge moves at most 0.9% of its own scale (smoothstep slope 1.5
   * over a soft width of 0.18 of the board, at 0.22 laps a second), so the travelling highlight is
   * two orders of magnitude under anything the photosensitivity rule is about. */
  var SWEEP_AMP = 0.30;
  var SWEEP_RATE = 0.22;  // laps per second == Hz. 4.5 s per lap. THE FASTEST THING IN THIS FILE.
  var CUT_MIN = 15.0, CUT_VAR = 5.0;   // seconds a frame of content is held
  /* THE CUT, AND THE TWO NUMBERS THAT BOUND WHAT ONE CELL CAN DO IN ONE FRAME.
   * DISSOLVE is how long the whole board takes to change picture; CELL_FADE is how long ONE cell
   * takes to ramp its ink off (and again to ramp the new ink on). The second constant did not
   * exist until tools/flicker-rate.cjs was extended to sample this element by name, and its
   * absence was this element's defect — see the MOTION paragraph in the header for the
   * measurement. A cell's ramp is CELL_FADE*60 = 21.6 frames long and covers at most lum 255 down
   * to PANEL_LUM, so the largest step one cell can take is (255-9)/21.6 = 11.4 lum = 4.5% of 255,
   * against the 34% ceiling the harness enforces.
   * CELL_CF is the same fade expressed in units of `mix`, which is what the per-cell schedule
   * below is written in. It MUST stay under 1 — 2*CELL_FADE < DISSOLVE — or the cells whose
   * hashed moment is at either end of the window would still be mid-ramp when the window closes
   * and the board would arrive at its new picture with a step in it after all. At 0.277 it is
   * also the fraction of changed cells that are mid-ramp at any instant, i.e. the board dips
   * about 6% in lit energy at the middle of a cut and no further; that is the whole visible cost
   * of the fix and it is why DISSOLVE was doubled rather than CELL_CF being widened towards 1. */
  var DISSOLVE = 2.6;     // seconds the per-cell cross-dissolve is spread over
  var CELL_FADE = 0.36;   // seconds ONE cell spends ramping its ink out, and again ramping it in
  var CELL_CF = 2 * CELL_FADE / DISSOLVE;   // = 0.277, in units of mix. Hoisted: no divide per cell.
  /* The half-width of one cell's ramp and the span its hashed moment is allowed to land in, both
   * in units of mix, both derived once here rather than per cell. A cell centred at CELL_CF*0.5
   * starts its ramp at mix 0 and one centred at 1-CELL_CF*0.5 finishes it at mix 1, which is what
   * leaves the board fully settled at BOTH ends of the window — without that inset the cells that
   * drew a moment near either edge would still be mid-ramp when the window closed and the picture
   * would arrive with a step in it after all, which is the thing this whole ramp exists to remove. */
  var FADE_H = CELL_CF * 0.5, FADE_SPAN = 1 - CELL_CF;

  /* Range, and the numbers here are set by a piece of geometry that is easy to get wrong. The
   * frame has 37 rows above the horizon at 213x67 and cam.scale is 82.4 cells per radian-ish, so
   * the highest point of the world that is ON SCREEN at distance d is about 0.45*d metres above
   * the eye. A board whose top sits 15 m up is therefore entirely off the top of the frame until
   * it is 33 m away, and the first cut of this file — FAR 44, boards 6-18 m up — spent most of
   * its candidates on boards that were geometrically perfect and completely above the viewport
   * (measured: seed 3275 drew 11 cells from two accepted boards). Two things follow. The window
   * where a board is BOTH big enough to read and low enough to be in shot is roughly 26-52 m, so
   * FAR is 52 and not 44; and the on-screen tests in the selection loop are not an optimisation,
   * they are what stops an invisible board taking one of the two slots.
   * 52 is also the print limit: at 53 m amber still prints v 129 and azure 126, and past ~54 the
   * curve's last depth bucket takes both under the v=120 muddy line. */
  var NEAR = 7.0, FAR = 52.0, DISS_W = 10.0;
  /* Screen-area retirement, in cells, as an absolute count rather than a fraction of the frame:
   * a board that covers more than this thins its own content (the holes are keyed in the board's
   * own grid, so they hold still as you walk). 620 cells is 4.3% of a 213x67 frame. The rule the
   * pedestrians retire on — screen AREA, never distance — because an object that suddenly covers
   * the frame is the worst case for whole-frame luminance and distance does not measure that.
   * IT STAYS AT 620 AND HERE IS WHAT RAISING IT COSTS. The widest board in the 32-frame fixture
   * covers 1827 cells, so it draws at idens 0.34: a big black cut-out carrying a handful of
   * five-cell blocks of ink rather than a picture, which is the least flattering thing this file
   * does. Raising the cap fixes the look — at 1800 the same board reads as a proper blocky mass —
   * and it moves the whole-frame luminance step this element can make in one frame in exact
   * proportion: on seed 3549 frames 1700-1860 the worst ads-attributable step went 1.01 (620) ->
   * 1.44 (900) -> 1.84 (1200) units of mean printed value, against 1.20 for that stretch with this
   * file absent. 620 is the value that keeps this element under the frame's own ambient step, and
   * a board that big is a second or two of a walk. Fix the look by not letting the board get that
   * big, never by letting its lit area grow. */
  var AREA_MAX = 620;

  /* ---- 5x7 letterforms ------------------------------------------------------------------------
   * Bit 4 is the leftmost column. Three letters across a board is 4-7 screen cells per letter and
   * 12-25 rows tall, which is the smallest scale at which a letterform survives this renderer at
   * all — signage.js measured that a glyph under ~3 cells is indistinguishable from the window
   * lattice behind it, and that scale gap is precisely what this file exists to fill. Narrow
   * boards drop to two letters rather than shrinking a third one under the floor. */
  var FONT = [
    0x0E,0x11,0x11,0x1F,0x11,0x11,0x11,   // 0 A
    0x0E,0x11,0x10,0x10,0x10,0x11,0x0E,   // 1 C
    0x1F,0x10,0x10,0x1E,0x10,0x10,0x1F,   // 2 E
    0x11,0x12,0x14,0x18,0x14,0x12,0x11,   // 3 K
    0x11,0x19,0x19,0x15,0x13,0x13,0x11,   // 4 N
    0x0E,0x11,0x11,0x11,0x11,0x11,0x0E,   // 5 O
    0x1E,0x11,0x11,0x1E,0x14,0x12,0x11,   // 6 R
    0x0F,0x10,0x10,0x0E,0x01,0x01,0x1E,   // 7 S
    0x1F,0x04,0x04,0x04,0x04,0x04,0x04,   // 8 T
    0x11,0x11,0x0A,0x04,0x0A,0x11,0x11,   // 9 X
    0x11,0x11,0x0A,0x04,0x04,0x04,0x04,   // 10 Y
    0x1F,0x01,0x02,0x04,0x08,0x10,0x1F    // 11 Z
  ];
  /* Three-letter marks. A real board says a WORD, and a word is not three letters rolled
   * independently — that reads as static, the same finding signage.js recorded for its lettering.
   * Eight fixed triples, one drawn per board. */
  var WORDS = [ 4,5,9,  1,0,8,  7,0,11,  2,3,5,  6,2,9,  8,5,3,  0,11,4,  5,6,1 ], WORD_N = 8;

  /* ---- weather ------------------------------------------------------------------------------
   * rel(k) is the parameter over its value under the 'rain' preset, so every expression here comes
   * out at exactly 1 under the look this file was tuned in. A board is a SOURCE and not a lit
   * surface, so haze does not dim it much — what haze does is shorten how far away one is worth
   * drawing, which is the second line. The guard is for tools/headless.cjs on a half-written tree,
   * where CC.Weather may not exist at all. */
  function rel(k) { return CC.Weather ? CC.Weather.rel(k) : 1; }
  var AT = { dim: 1, far: FAR };
  function airPrep() {
    var f = rel('fog');
    AT.dim = clamp(1 - 0.13 * (f - 1), 0.72, 1.06);
    AT.far = clamp(FAR * (1 - 0.22 * (f - 1)), 28, 54);
  }

  /* ---- projection ---------------------------------------------------------------------------
   * Copied from the pattern in signage.js/street.js rather than imported — those helpers are
   * private per file by house rule. It must agree with raycast.js cell for cell or the board
   * floats off its wall: same planar camera, same scale derivation (cam.scaleY is the escape
   * hatch, NOT cam.scale, which the raycaster ignores), same radial distance so CC.put's depth
   * test compares like with like. */
  var CO = { cols: 0, rows: 0, horizon: 0, hp: 0, scale: 1, eyeY: 1.7,
             ox: 0, oz: 0, fwx: 0, fwz: 1, rgx: 1, rgz: 0 };
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
  var VA = { x: 0, w: 0 }, VB = { x: 0, w: 0 };
  function projInto(px, py, pz, O) {
    var rx = px - CO.ox, rz = pz - CO.oz;
    var w = rx * CO.fwx + rz * CO.fwz;
    if (w < 1.2) return false;                     // at or behind the lens
    var sp = (rx * CO.rgx + rz * CO.rgz) / w;
    O.x = (sp / CO.hp + 1) * 0.5 * CO.cols - 0.5;
    O.w = w;
    return true;
  }

  /* Decorrelated per-board hashes. hash2 folds its salt in additively inside the mixer, so two
   * salts a small distance apart are correlated (measured to -0.44 in this tree) and conditioning
   * on one of them landing in its low tail — which is exactly what "is there a board on this cell"
   * does — drags its siblings into their low tails too. That failure has been found three times in
   * this repo and it always looks the same: every board comes out the same hue. So the varying
   * term is the COORDINATE, through a large odd offset, and there is ONE INDEPENDENT DRAW PER
   * DECISION. Offsets stay under 5e6 so the products stay exact in double precision.
   * Slot 0 is the unoffset stream and is currently SPARE: it used to carry the "does this wall get
   * a board" gate, which was deleted (see setup()). Slots 1-9 are one decision each. */
  var HKX = [0, 104729, 611953, 1999993, 3391993, 4796027, 7919, 2750159, 4256233, 1299709];
  var HKZ = [0, 4256233, 1299709, 4796027, 611953, 2750159, 3391993, 104729, 7919, 1999993];
  function hk(a, b, salt, i) { return hash2(a + HKX[i], b + HKZ[i], salt); }

  /* A travelling crest, wrap-aware: `d` is the signed distance to the crest measured the short way
   * round, and the answer is a flat top `hold` wide falling to nothing over `soft`. It is a profile
   * and not a test for the reason signage.js writes out at its own crest: a hard edge on a sweep
   * steps every cell it crosses the full height of the boost inside one frame, which on a board
   * cell is 40 units of v — invisible to every frame-level statistic and perfectly visible to
   * anyone looking at that cell. */
  function crest(d, hold, soft) {
    d -= Math.floor(d);
    if (d > 0.5) d = 1 - d;
    return smooth(clamp((hold + soft - d) / soft, 0, 1));
  }

  /* ---- the wall the board hangs on ------------------------------------------------------------
   * Same rule as signage.js: the dominant axis is tried first, because that is the face turned
   * towards the camera and the other one is inside the block. */
  var FACE = { nx: 0, nz: 0, fx: 0, fz: 0 };
  function faceOf(city, gx, gz, rx, rz) {
    var xFirst = (rx < 0 ? -rx : rx) > (rz < 0 ? -rz : rz);
    var i, nx, nz;
    for (i = 0; i < 2; i++) {
      if ((i === 0) === xFirst) { nx = rx > 0 ? -1 : 1; nz = 0; }
      else                      { nx = 0; nz = rz > 0 ? -1 : 1; }
      if (city.height(gx + nx, gz + nz) <= 0) {
        FACE.nx = nx; FACE.nz = nz;
        FACE.fx = gx + 0.5 + nx * 0.5; FACE.fz = gz + 0.5 + nz * 0.5;
        return true;
      }
    }
    return false;
  }

  /* ---- one board, fully described. No allocation past this point. --------------------------- */
  var AD = {
    ax: 0, az: 0, bx: 0, bz: 0,      // the two ends of the board, ON the wall, in world units
    v0: 0, H: 0,                     // foot height and height, metres
    NC: 0, NR: 0,                    // its own content grid, FIXED in the world
    hue: 0, hue2: 0, acc: 0,         // picture / body copy / accent swatches
    sd: 0, ph: 0,                    // hash seed and phase
    modeA: 0, modeB: 0, mix: 0,      // content frame, next content frame, dissolve progress
    w0: 0, w1: 0, w2: 0,             // the three letters, if this is a word board
    lamp: 0,                         // how many floodlamps on the bottom rail
    sweep: 0                         // where the wipe's crest is, 0..1 along the board
  };
  /* The three content frames. MODE_FIGURE is the default branch at the bottom of inkAt() rather
   * than a tested case, which is why it is named here and compared nowhere. */
  var MODE_FIGURE = 0, MODE_WORD = 1, MODE_PRODUCT = 2;

  /* Fill AD from a candidate cell. Returns 0 if the cell cannot carry a board. Deterministic in
   * (gx, gz, t) alone — it is called twice per drawn board, once to select and once to draw, and
   * the two calls MUST agree. */
  function setup(city, gx, gz, t) {
    var bh = city.height(gx, gz);
    if (bh < 15) return 0;                         // needs a building, not a shed

    var rx = gx + 0.5 - CO.ox, rz = gz + 0.5 - CO.oz;
    if (!faceOf(city, gx, gz, rx, rz)) return 0;
    var nx = FACE.nx, nz = FACE.nz;
    /* The face has to be turned towards the eye. rlen normalises so this is a real cosine and not
     * a distance in disguise. The threshold is LOW on purpose and it started at 0.34, which was a
     * mistake worth writing down: in a corridor the walls you actually walk past are nearly
     * edge-on to the eye — a wall 3 m to your left and 20 m ahead has facing 0.15 — so a 0.34 gate
     * deletes advertising from exactly the surfaces a canyon is made of and leaves it only on the
     * far side of junctions. This is therefore a sanity check and not the legibility test; the
     * legibility test is the projected size and the DEPTH RATIO, both measured on the real
     * projection in the selection loop, because those are what foreshortening actually costs. */
    var rlen = Math.sqrt(rx * rx + rz * rz);
    if (rlen < 1e-3) return 0;
    var facing = -(nx * rx + nz * rz) / rlen;
    if (facing < 0.18) return 0;

    /* THERE IS NO LONGER A RATE GATE HERE, and the deleted line is worth a paragraph because it
     * looked like the density knob and was not one. It used to read
     *     if (hk(gx, gz, SALT, 0) > 0.62) return 0;   // five eligible walls in eight
     * on the argument that the gate is world-building and the selection loop is what the viewer
     * gets. The second half of that is true and the first half cost the file its subject: measured
     * over a 32-frame fixture (seeds 3001 + 137k for k=0..7, frames 600/1200/1800/2400, 213x67),
     * an ADVERTISING city had an advertisement in eleven frames of thirty-two. Deleting the gate
     * outright — every eligible wall carries a board — takes that to thirteen and costs nothing
     * else, because the cap is structural: two slots, ranked on clipped screen area, and a third
     * eligible wall cannot draw however many of them exist. What "eligible" already means is
     * narrow enough to be the real rate: a built cell 15 m tall, with an open face turned at least
     * 0.18 towards the eye, 4.7 m of clear same-facing wall either side of it and 11.3 m of height
     * to hang 4.2 m of board on with a parapet left over. That is 2.5% of the tall cells in the
     * cone (measured: 1138 tall cells at seed 3001 frame 600, 28 of them eligible). The gate was
     * throwing away three walls in eight of an already 2.5% set, and the ones it threw away were
     * not the invisible ones — they were uniformly distributed, so a third of the time it threw
     * away the one wall in the frame that a viewer could actually see. */

    /* The run of wall the board can span, walked SYMMETRICALLY out from the anchor: a cell counts
     * only if it is built, tall enough, and open on the same side. Symmetric because the board is
     * centred on its anchor, and taking min(left, right) after two independent walks would let a
     * board hang off the end of the wall on the short side. minH is tracked across exactly the
     * cells the board will actually cover, so the top rail can be clamped under the LOWEST
     * parapet it crosses — that is what stops a board printing against the sky over a setback,
     * which CC.put cannot catch for us because sky carries dist Infinity and loses every test. */
    var tx = nz, tz = -nx;                         // unit vector along the wall; faces are axis-aligned
    var minH = bh, i, hx, hz, hA, hB;
    for (i = 1; i <= 5; i++) {
      hx = gx + tx * i; hz = gz + tz * i;
      hA = city.height(hx, hz);
      if (hA < 13 || city.height(hx + nx, hz + nz) > 0) break;
      hx = gx - tx * i; hz = gz - tz * i;
      hB = city.height(hx, hz);
      if (hB < 13 || city.height(hx + nx, hz + nz) > 0) break;
      if (hA < minH) minH = hA;
      if (hB < minH) minH = hB;
    }
    var half = i - 1;
    if (half < 2) return 0;                        // under 4.7 m of wall is a shopfront's job

    var r1 = hk(gx, gz, SALT, 1), r2 = hk(gx, gz, SALT, 2), r3 = hk(gx, gz, SALT, 3);
    var r4 = hk(gx, gz, SALT, 4), r5 = hk(gx, gz, SALT, 5), r6 = hk(gx, gz, SALT, 6);
    var r7 = hk(gx, gz, SALT, 7), r8 = hk(gx, gz, SALT, 8), r9 = hk(gx, gz, SALT, 9);

    /* 0.35 rather than 0.5 insets the board 15 cm inside the last verified cell, so its edge
     * column can never spill past the corner of the wall it is bolted to. */
    var W = 2 * (half + 0.35);
    /* 7.2-11.0 m and not 5.4-11.0. WIDTH IS THE ONE DIMENSION THAT BUYS LEGIBILITY HERE, because
     * the walls this city offers are grazing ones — the depth-ratio test below passes at up to 1.8
     * and tightening it to 1.5 emptied the fixture (32 frames with a board went from 13 to 3), so
     * the normal board is a wedge whose far half is squeezed into a few columns. Widening the
     * wanted range is what puts columns back: isolated on the 32-frame fixture with the other two
     * changes already in, it moved the mean drawn board from 13.3 to 17.9 screen columns and the
     * frames containing one from 13 to 14, since a board only draws at all if it clears 10 columns
     * and 8 clipped ones. Most walls cap it below
     * the want anyway — the run test above allows at most 10.7 m — so this is mostly "use the wall
     * you have" rather than a new size. */
    var wWant = 7.2 + r3 * 3.8;
    if (W > wWant) W = wWant;

    /* Landscape or portrait, and the split is 62/38 because a billboard is normally wider than it
     * is tall and a wrapped screen down a corner is the exception that makes the street. */
    var H = r2 < 0.62 ? W * (0.42 + 0.22 * r4) : W * (0.95 + 0.55 * r4);
    /* 7.0 m and not 8.5. Height is what pushes the top rail off the top of the viewport: with the
     * top capped at 12 m below, a board 8.5 m tall has to hang its foot at 3.5 m, under the 4.6 m
     * floor that keeps it clear of signage.js's fixtures, so it was simply rejected. Capping the
     * height instead of the foot keeps the tall-portrait roll alive as a 7 m board rather than
     * deleting it. Measured on the second half of the fixture (seeds 3549, 3686, 3823, 3960, the
     * four with the most eligible wall in them): mean lit cells per drawn board 85 -> 102 at
     * 213x67 with the same number of frames carrying a board, because the boards that used to be
     * rejected between these two caps are now drawn. */
    if (H > 7.0) H = 7.0;
    if (H > minH - 7.3) H = minH - 7.3;
    if (H < 4.2) return 0;

    /* HOW HIGH IT HANGS, and this is the constant the first cut got wrong twice over. The board's
     * TOP is capped at 12 m above the street, not at "wherever there is wall left": the frame
     * holds about 0.45*d metres above the eye (37 rows over the horizon at cam.scale 82.4), so a
     * board topping out at 24 m is off the top of the viewport until it is 50 m away, by which
     * time it is too far to read. Letting r9 walk the board up a 40 m tower produced exactly that
     * — accepted boards drawing eleven cells, and every board that did land clipped by the top of
     * the frame.
     * 12 AND NOT 13.5, which is the second half of the same finding and was measured rather than
     * argued. The cap sets the NEAR end of the window a board can be seen whole in: a top at 13.5 m
     * is in shot from 26 m, at 12 m from 23 m, and the boards this city actually offers sit at a
     * mean drawn distance of 17-20 m — i.e. most of them were being framed against the near limit
     * and thrown out by the clipped-height test below. Dropping the cap 1.5 m (with the height cap at
     * 7.0 m above, which is what makes the foot still fit over 4.6 m) moved the mean drawn board
     * from 85 to 102 lit cells with the same number of frames carrying one; the frequency came
     * from the deleted rate gate and the wider want, not from here.
     * Its foot at 4.6-7.8 m still clears signage.js's fixtures (3-8 m) and anything at street
     * level. Storeys two to four, which is where this kind of board lives.
     * The other bound is the building: 2.5 m of parapet must survive above the top rail, which at
     * 40 m is five screen rows of honest wall between the board and the roofline, and is what
     * stops a board printing against the sky — CC.put cannot catch that for us, because sky
     * carries dist Infinity and loses every depth test. */
    var v0hi = minH - H - 2.5;
    var tv = 12.0 - H;
    if (tv < v0hi) v0hi = tv;
    if (v0hi < 4.6) return 0;
    var v0 = 4.6 + r9 * (v0hi - 4.6);

    var cx = FACE.fx + nx * 0.34, cz = FACE.fz + nz * 0.34;   // 34 cm proud of the wall
    AD.ax = cx - tx * W * 0.5; AD.az = cz - tz * W * 0.5;
    AD.bx = cx + tx * W * 0.5; AD.bz = cz + tz * W * 0.5;
    AD.v0 = v0; AD.H = H;

    /* The content grid is FIXED IN THE WORLD at ~0.55 m a cell, never derived from the screen.
     * Walking towards a board therefore makes its picture BIGGER; deriving the grid from the
     * projected size instead re-rolls the picture every step, which is the mistake signage.js
     * documents at its own character grid. drawAd() coarsens a DRAWN grid off this one when the
     * screen cannot carry it and lifts every hash back into these indices, so the picture is
     * stable in both directions. */
    AD.NC = Math.round(W / 0.55); if (AD.NC < 8) AD.NC = 8; else if (AD.NC > 20) AD.NC = 20;
    AD.NR = Math.round(H / 0.55); if (AD.NR < 8) AD.NR = 8; else if (AD.NR > 18) AD.NR = 18;

    /* Hue. amber and azure lead here exactly as they lead everywhere else — 48/38 by board, which
     * is within two points of their frame-wide lit-energy split — and ember takes the last 14%.
     * warm is NOT USED ANYWHERE IN THIS FILE, and the comment that used to stand here said it
     * survived as the floodlamps on the bottom rail, which was false: the lamps draw ink code 3,
     * which is AD.acc, which is violet or the other pillar. It is worth saying why the file has
     * none rather than deleting the paragraph, because warm is the swatch this build is watching
     * (it took 24-25% of lit energy in three frames of the last census, second pillar territory).
     * At PEAK 200 warm prints v 107 at the far end of this file's range, i.e. inside the muddy
     * band, so a warm board would be both off-style and off-budget. There is no warm here at all.
     * VIOLET IS LICENSED IN THIS FILE and nowhere else in the city, because this is signage and
     * signage is the one place it belongs; it appears on 26% of boards as the ACCENT only (a
     * word's underline, a key light on a face, the highlight on a bottle), which is a handful of
     * cells. A violet picture mass would be a violet surface, and that is still forbidden. */
    AD.hue = r1 < 0.48 ? P.amber : r1 < 0.86 ? P.azure : P.ember;
    /* Body copy is the other pillar from the picture, so a board is two-tone the way a real one is
     * — an image in one colour and the small print in another. Independent draw: sharing r1 here
     * would weld the copy colour to the picture colour and every amber board would have azure
     * copy, forever. */
    AD.hue2 = r5 < 0.55 ? (AD.hue === P.azure ? P.amber : P.azure) : AD.hue;
    AD.acc = r6 < 0.26 ? P.violet : (AD.hue === P.amber ? P.azure : P.amber);

    AD.sd = 1 + ((hk(gx + 13, gz + 17, SALT, 2) * 29989) | 0);
    AD.ph = r7;
    AD.lamp = r8 < 0.55 ? 3 : 0;

    /* ONE INDEPENDENT DRAW PER DECISION. This started life sharing r8 with the floodlamps above,
     * which is the exact bug this repo has found three separate times: conditioning two decisions
     * on one number welds them, and every board with lamps would have carried one of the first
     * four words and every board without one of the last four. The extra stream comes from
     * OFFSETTING THE COORDINATE, never from a second salt — see the hk() note. */
    var wi = ((hk(gx + 9, gz - 7, SALT, 8) * WORD_N) | 0) * 3;
    AD.w0 = WORDS[wi]; AD.w1 = WORDS[wi + 1]; AD.w2 = WORDS[wi + 2];

    /* ---- the cut, and why it is a dissolve ---------------------------------------------------
     * A board holds a frame of content for 15-20 s and then changes. That is a large area changing
     * value at once, which is the one thing the safety rule in the brief singles out — so it is
     * spread three ways: over the board (each cell picks its own moment out of a hash), over time
     * (DISSOLVE), and within the cell itself (CELL_FADE, applied in drawAd). Keying the ramp on t
     * (never on an accumulator) is what makes it scrub-safe — the frame at time t is the same
     * frame whether it was replayed or jumped to.
     *
     * THE SEQUENCE HAS TO CLOSE, and it did not. modeB — the picture the dissolve is heading
     * towards — used to be (modeA + 1 + (r3*2|0)) % 3 while the next cut's modeA was simply
     * (cut+1) % 3. On the 50% of boards that drew r3 >= 0.5 those two are DIFFERENT pictures, so
     * at every cut boundary the board finished dissolving into one construction and then, in the
     * single frame that incremented `cut`, jumped to another one with no dissolve at all. It is
     * exactly the failure mode the brief calls "a cut landing without its crossfade", and it is
     * what tools/flicker-rate.cjs was pointing at: at seed 0, yaw 0, sky 'clear' the boundary at
     * t=15.35 s moved 182 cells of one board by more than a third of full scale in one frame.
     * The fix is to make the walk itself carry the stride, so the picture the dissolve arrives at
     * IS the picture the next hold shows: modeA = (cut*stride) % 3 and modeB = modeA + stride, so
     * modeA(cut+1) === modeB(cut) identically. stride is 1 or 2 and both are coprime with 3, so a
     * board still visits all three constructions and still does it in its own order — the variety
     * r3 was there to buy is kept, the discontinuity is not. */
    var period = CUT_MIN + AD.ph * CUT_VAR;
    var tt = t / period + AD.ph * 7.0;
    var cut = Math.floor(tt);
    var frac = (tt - cut) * period;               // seconds into this cut
    var stride = 1 + ((r3 * 2) | 0);              // 1 or 2; gcd(stride,3)=1 so all three are shown
    AD.modeA = (((cut * stride) % 3) + 3) % 3;
    AD.modeB = (AD.modeA + stride) % 3;
    AD.mix = clamp(frac / DISSOLVE, 0, 1);
    AD.sweep = (AD.ph + t * SWEEP_RATE) % 1;
    if (CC.reducedMotion) {
      /* Freeze the CONTENT as well as the motion. Damping the wipe but leaving the cut running
       * would still hand a reduced-motion viewer a board that changes picture under them, and the
       * house rule is that a timer is damped by whatever damps the thing it feeds. */
      AD.modeA = ((AD.ph * 3) | 0) % 3; AD.modeB = AD.modeA; AD.mix = 0;
      AD.sweep = AD.ph;
    }
    return 1;
  }

  /* ---- the picture ---------------------------------------------------------------------------
   * Everything is evaluated in the board's own content grid, at the CENTRE of the grid cell, so a
   * construction is a bitmap that holds perfectly still while the viewer walks and simply gains
   * screen cells. Returns an ink code: 0 dark, 1 picture mass, 2 body copy, 3 accent/key light.
   *
   * Body copy is marks on ALTERNATE ROWS at 66% density. That is the whole trick: from across a
   * street real copy is not letters, it is banded texture, and drawing it as banded texture at
   * full brightness costs the same cells as drawing it dim but stays out of the muddy band. */
  function copyAt(cu, cv) {
    return ((cv & 1) === 0 && hash2(cu, cv, AD.sd + 7) < 0.66) ? 2 : 0;
  }
  function inkAt(mode, cu, cv, iu, iv) {
    var dx, dy, ex, hw, d, nL, fu, li, fx, bx, by, m, ltr;
    if (mode === MODE_WORD) {
      if (iv > 0.84) return copyAt(cu, cv);
      if (iv > 0.71 && iv < 0.78 && iu > 0.05 && iu < 0.95) return 3;   // the rule under the word
      if (iv < 0.05 || iv > 0.67) return 0;
      nL = AD.NC >= 15 ? 3 : 2;
      fu = iu * nL; li = fu | 0; if (li >= nL) li = nL - 1;
      fx = fu - li;
      if (fx > 0.84) return 0;                     // the gap between two letters
      bx = (fx / 0.84 * 5) | 0; if (bx > 4) bx = 4;
      by = ((iv - 0.05) / 0.62 * 7) | 0; if (by > 6) by = 6;
      ltr = li === 0 ? AD.w0 : (li === 1 ? AD.w1 : AD.w2);
      m = FONT[ltr * 7 + by];
      return ((m >> (4 - bx)) & 1) ? 1 : 0;
    }
    if (mode === MODE_PRODUCT) {
      if (iv > 0.82) return copyAt(cu, cv);
      /* Two columns of copy flanking the object, which is what half the boards in the reference
       * set actually are: a thing in the middle and small print down the sides. */
      if (iu < 0.20 || iu > 0.80) return (iv > 0.22 && iv < 0.76) ? copyAt(cu, cv) : 0;
      if (iv < 0.06) hw = 0;
      else if (iv < 0.13) hw = 0.055;                                  // cap
      else if (iv < 0.24) hw = 0.045;                                  // neck
      else if (iv < 0.34) hw = 0.045 + (iv - 0.24) * 1.80;             // shoulder
      else if (iv < 0.80) hw = 0.225;                                  // body
      else hw = 0;
      d = iu - 0.5; if (d < 0) d = -d;
      if (d > hw) return 0;
      if (iv > 0.46 && iv < 0.60) return 0;         // the label: a dark band across the body
      /* One specular stripe down the near side of the body — the single mark that turns a
       * silhouette into a bottle. Kept to the outer 45% of one half so it stays a stripe. */
      if (iv > 0.34 && iu < 0.5 && d > hw * 0.55) return 3;
      return 1;
    }
    /* MODE_FIGURE. A face at character resolution is not modelled, it is a light mass with two or
     * three dark marks cut out of it — eyes and a mouth — and a key light down one edge. Anything
     * more (a nose, shading) is smaller than a cell and prints as damage. */
    if (iv > 0.80) return copyAt(cu, cv);
    /* 0.38 and not 0.33: a board is 10-20 screen columns most of the time, and at 12 columns a
     * head of half-width 0.33 is five cells across with two of them eye. Everything in this
     * construction is sized to survive that. */
    dx = (iu - 0.50) / 0.38; dy = (iv - 0.40) / 0.42;
    d = dx * dx + dy * dy;
    if (d > 1) return 0;
    ex = iu < 0.5 ? 0.355 : 0.645;
    if ((iu > ex - 0.085 && iu < ex + 0.085) && iv > 0.270 && iv < 0.400) return 0;   // eyes
    if (iu > 0.35 && iu < 0.65 && iv > 0.545 && iv < 0.635) return 0;                 // mouth
    if (d > 0.74 && iv < 0.52) return 3;            // key light along the top of the head
    return 1;
  }

  /* ---- rasterise ------------------------------------------------------------------------------
   * The board is a rectangle standing on the segment (ax,az)-(bx,bz). Both ends are projected and
   * the interior is interpolated PERSPECTIVE-CORRECT — 1/w is what is linear in screen x — because
   * a board is metres wide and interpolating u linearly puts the lettering of a near one visibly
   * off-centre. u is measured from the LEFT screen end, never from end A, so a word always reads
   * left to right whichever side of the street its wall is on. */
  var M = { xL: 0, xR: 0, wL: 0, wR: 0, span: 0, hRows: 0, cy: 0, dist: 0 };
  function measure(cam) {
    if (!projInto(AD.ax, AD.v0, AD.az, VA)) return 0;
    if (!projInto(AD.bx, AD.v0, AD.bz, VB)) return 0;
    if (VA.x <= VB.x) { M.xL = VA.x; M.wL = VA.w; M.xR = VB.x; M.wR = VB.w; }
    else              { M.xL = VB.x; M.wL = VB.w; M.xR = VA.x; M.wR = VA.w; }
    M.span = M.xR - M.xL;
    if (M.span < 1) return 0;
    if (M.xR < 0 || M.xL > CO.cols - 1) return 0;
    var wMid = 2 / (1 / M.wL + 1 / M.wR);
    M.hRows = AD.H * CO.scale / wMid;
    M.cy = CO.horizon - (AD.v0 + AD.H * 0.5 - CO.eyeY) * CO.scale / wMid;
    var spC = (2 * ((M.xL + M.xR) * 0.5 + 0.5) / CO.cols - 1) * CO.hp;
    M.dist = wMid * Math.sqrt(1 + spC * spC);
    return 1;
  }

  /* HOW MUCH of it is in front of the wall it is bolted to, rather than behind the block in front.
   * CC.put does the honest per-cell occlusion for free, so this exists to decide whether the board
   * is worth one of the TWO slots. It returns a FRACTION and not a yes/no, and that is the whole
   * point: a board 80% hidden still draws through the gaps, as forty disconnected marks in the two
   * pillar hues out of the same glyph bank the window lattice is drawn from, and that is noise
   * rather than advertising. Sixteen probes on a 4x4 grid; the caller wants 45% of the ones that
   * land in frame. The alternative — draw it and count hits — cannot be done before the cap has
   * already been spent. */
  function visibleFrac(frame) {
    var q, s, x, y, i, n = 0, seen = 0, fr, iw, lim, sp;
    for (q = 0; q < 4; q++) {
      y = Math.round(M.cy + (q - 1.5) * M.hRows * 0.26);
      /* Probes off the frame are SKIPPED, never clamped to the edge. Clamping was the first
       * version and it is a real bug rather than a nicety: a board high on a near wall has its
       * centre row above the top of the frame, all the clamped probes land on row 0 — sky, or
       * whatever building happens to be up there — and the board is declared invisible and never
       * drawn. That is why two of the first four sample seeds rendered no advertising at all. */
      if (y < 0 || y > CO.rows - 1) continue;
      for (s = 0; s < 4; s++) {
        fr = 0.10 + 0.2667 * s;
        x = Math.round(M.xL + M.span * fr);
        if (x < 0 || x > CO.cols - 1) continue;
        n++;
        /* The probe's depth is the board's depth AT THAT COLUMN, interpolated the same
         * perspective-correct way the raster does it, not the board's mid depth. On a strongly
         * foreshortened board — which is most of them, since the walls you walk past are nearly
         * edge-on — the two ends can be 20 m and 45 m apart in depth, and testing the near end
         * against the mid depth declares the whole board occluded by its own wall.
         * RADIAL, like everything in frame.dist: the buffer stores w * sqrt(1 + sp^2), and at the
         * edge of a 1.25 rad frame that factor is 1.23. Comparing the two directly made lim 23%
         * too small, which is a false NEGATIVE on occlusion — boards passed this test and then
         * lost every one of their own depth tests. */
        iw = (1 - fr) / M.wL + fr / M.wR;
        sp = (2 * (x + 0.5) / CO.cols - 1) * CO.hp;
        lim = 0.90 * Math.sqrt(1 + sp * sp) / iw;
        i = y * CO.cols + x;
        if (!(frame.dist[i] < lim)) seen++;
      }
    }
    /* No probe landed anywhere useful — a board wider or taller than the frame. Assume visible and
     * let CC.put's per-cell depth test settle it honestly. */
    return n === 0 ? 1 : seen / n;
  }

  /* How much of the board's own height is inside the viewport, ramped 0 at 55% to 1 at 70%. Pure
   * function of the projection and the frame, so the selection loop and drawAd() derive the same
   * number from the same M without having to carry it between them. */
  function clipFrac(cy, hRows, rows) {
    var vy0 = cy - hRows * 0.5, vy1 = cy + hRows * 0.5;
    if (vy0 < 0) vy0 = 0;
    if (vy1 > rows - 1) vy1 = rows - 1;
    if (hRows < 1) hRows = 1;
    return clamp(((vy1 - vy0) / hRows - 0.55) / 0.15, 0, 1);
  }

  function drawAd(frame) {
    var cols = CO.cols, rows = CO.rows;
    var xL = M.xL, xR = M.xR, wL = M.wL, wR = M.wR, span = M.span;
    var xa = Math.floor(xL), xb = Math.ceil(xR);
    if (xa < 0) xa = 0; if (xb > cols - 1) xb = cols - 1;
    if (xb < xa) return;

    /* Two thinnings. Both take cells AWAY rather than dimming them, which is the only fade this
     * frame's print budget can afford, and both are keyed in the board's own grid so the holes sit
     * still on the board while the viewer walks instead of crawling across it. `dens` dissolves the
     * WHOLE board — dark cells included — in over the last stretch of its range, so it materialises
     * out of the haze instead of switching on as a black rectangle over a lit facade. `idens`
     * retires the LIT CONTENT ONLY on screen area, which is the pedestrians' rule and for the same
     * reason: a near object that suddenly covers the frame is the worst case for whole-frame
     * luminance and distance does not measure area. It leaves the dark body whole, because it is
     * the bright area a luminance step is made of, and punching holes in the black would let the
     * window lattice back through a board standing ten metres from the eye.
     *
     * The far dissolve runs over the last DISS_W metres of the range the WEATHER allows, not over
     * a fixed pair of distances. Written as a constant DISS_D=42 against a constant FAR=52 it was
     * a real bug and a silent one: airPrep shortens AT.far in fog, and the moment AT.far dropped
     * under 42 the ratio below flipped sign, came back +1 for every board in the street and set
     * dens to 0, so a misty night had no advertising in it at all and nothing said why. */
    var d0 = AT.far - DISS_W; if (d0 < 14) d0 = 14;
    var dens = 1 - clamp((M.dist - d0) / (AT.far - d0), 0, 1);
    /* THE NEAR EXIT, and it is a ramp because the measurement said the alternative was a step. A
     * board you are walking up to grows until its top rail leaves the viewport; the selection used
     * to delete it outright the frame its visible height crossed 70% of its projected height, and
     * that is a whole object leaving in one frame. Measured on seed 3549 over frames 1700-1860 at
     * 213x67 the exit was the largest single-frame move this element made: 1.01 units of
     * whole-frame mean printed value as 1280 cells stopped being drawn, against 1.20 for the worst
     * step the same stretch makes with this file absent. Under the ceiling, but it was the file's
     * own worst behaviour and it is free to remove. clipFrac() is the same ramp the selection
     * ranks with, so the board thins over the last 15% of the test instead of vanishing at it, and
     * gives its slot up gradually to a better-framed board. It multiplies dens, i.e. it takes
     * cells away from the WHOLE board, dark included — the same fade the far end uses. */
    dens *= clipFrac(M.cy, M.hRows, rows);
    if (dens < 0.06) return;
    var area = span * (M.hRows < 1 ? 1 : M.hRows);
    var idens = area > AREA_MAX ? AREA_MAX / area : 1;
    if (idens > dens) idens = dens;

    /* ---- the grid the screen can actually sample -----------------------------------------------
     * The board's content grid is fixed in the WORLD — that is what stops the picture reshuffling
     * as you walk towards it — but the shader is point-sampled once per screen cell, and a board
     * carrying 19 content columns across 11 screen columns has eight of its columns never asked
     * about. WHICH eight depends on where the board's edge happens to fall between two cells, so
     * an eye loses a pupil, a letter loses a stroke, and the construction stops reading. It is the
     * same finding signage.js records at its own character grid and the same answer: coarsen the
     * DRAWN grid to what the screen can carry, so a face always has two eyes at any size.
     * CONTENT does not follow the coarsening. Every hash below is lifted back into the WORLD grid
     * through (wu, wv), so the copy texture, the glyph choice, the dissolve pattern and the
     * dropout all stay pinned to the board rather than crawling across it on approach. */
    var NCW = AD.NC, NRW = AD.NR, mix = AD.mix, sd = AD.sd;
    var NC = Math.round(span); if (NC < 6) NC = 6; if (NC > NCW) NC = NCW;
    var NR = Math.round(M.hRows); if (NR < 6) NR = 6; if (NR > NRW) NR = NRW;
    var x, r, s, iw, w, u, sp, dist, yBot, yTop, vspan, vv, cu, cv, iu, iv, r0, r1, lp;
    var code, colr, glyph, k, lum, boost, atten, wu, wv, fade, fp, cA, cB;
    for (x = xa; x <= xb; x++) {
      s = (x + 0.5 - xL) / span;
      if (s < 0) s = 0; else if (s > 1) s = 1;
      iw = (1 - s) / wL + s / wR;
      w = 1 / iw;
      u = (s / wR) / iw;
      sp = (2 * (x + 0.5) / cols - 1) * CO.hp;
      /* 0.996 on top of the 34 cm standoff. The raycaster's march quantises a facade's depth by up
       * to half a step, so a board that is only geometrically nearer than its wall loses the depth
       * test at grazing angles and prints in stripes. Same bias signage.js uses, same reason. */
      dist = w * Math.sqrt(1 + sp * sp) * 0.996;
      yBot = CO.horizon - (AD.v0 - CO.eyeY) * CO.scale / w;
      yTop = yBot - AD.H * CO.scale / w;
      vspan = yBot - yTop;
      if (vspan < 0.5) vspan = 0.5;
      /* The wipe. A crest travelling across the board in 4.5 s, 0.22 Hz, and the ONLY thing here
       * that moves. It scales the ink envelope — it is never subtracted off an already-scaled
       * intensity, which is the bug this project shipped once and wrote a rule about. */
      boost = 1 + SWEEP_AMP * crest(u - AD.sweep, 0.06, 0.18);
      /* A gentle distance falloff, on top of the fade the print curve's own depth buckets already
       * apply. 0.12 and not more: at 0.22 the far end of the range printed at v 119, one unit
       * inside the muddy band, which is the entire thing this file is built to avoid. Distance is
       * paid for in CELLS (dens, above), not in brightness. */
      atten = AT.dim * (1 - 0.12 * clamp((dist - 20) / 30, 0, 1));

      r0 = Math.ceil(yTop); r1 = Math.floor(yBot);
      if (r0 < 0) r0 = 0; if (r1 > rows - 1) r1 = rows - 1;
      for (r = r0; r <= r1; r++) {
        vv = ((r + 0.5) - yTop) / vspan;            // 0 at the top rail, 1 at the bottom
        if (vv < 0) vv = 0; else if (vv > 1) vv = 1;
        cu = (u * NC) | 0; if (cu > NC - 1) cu = NC - 1;
        cv = (vv * NR) | 0; if (cv > NR - 1) cv = NR - 1;
        wu = (u * NCW) | 0; if (wu > NCW - 1) wu = NCW - 1;
        wv = (vv * NRW) | 0; if (wv > NRW - 1) wv = NRW - 1;
        /* The FAR dissolve takes the whole board, dark cells included, so a board materialises out
         * of the haze rather than switching on as a black rectangle over a lit facade. */
        if (dens < 1 && hash2(wu + 5, wv + 3, sd + 19) > dens) continue;

        fade = 1;                                  // 1 = settled; below 1 only mid-cross-dissolve
        if (cu === 0 || cu === NC - 1 || cv === 0 || cv === NR - 1) {
          /* THE BEZEL. Dark, always — the board is an object bolted to a wall, and what makes it
           * read as one is that the window lattice behind it stops dead at its edge. The only lit
           * part is the bottom rail's floodlamps: three marks, which is the house cue for "this
           * thing is lit" and costs six screen cells rather than a lit border's hundred. */
          code = 0;
          if (AD.lamp && cv === NR - 1) {
            lp = ((cu * 4) / NC) | 0;
            if (lp >= 1 && lp <= 3 && ((cu * 4) % NC) < 4) { code = 3; }
          }
        } else {
          iu = (cu - 0.5) / (NC - 2); if (iu < 0) iu = 0; else if (iu > 1) iu = 1;
          iv = (cv - 0.5) / (NR - 2); if (iv < 0) iv = 0; else if (iv > 1) iv = 1;
          /* ---- the cross-dissolve, per cell ------------------------------------------------
           * One hash gives this cell its own moment in the window; the cell then ramps its ink
           * OFF over CELL_FADE, swaps picture at the bottom of the ramp where the swap costs
           * nothing, and ramps the new ink ON over another CELL_FADE. `fp` runs -1 -> +1 across
           * the whole of that, so its sign is which picture the cell is showing and its magnitude
           * is how bright the cell is allowed to be.
           *
           * WHY IT IS NO LONGER A BARE FLIP, and this is the measurement the fix exists for. The
           * flip that stood here — `mode = hash < mix ? modeB : modeA`, one inkAt call, ink
           * strictly binary — spread the cut correctly over the BOARD and not at all over the
           * CELL. A cell whose new code was an accent went from the dark panel at lum 9 to violet
           * ink clamped at lum 255 inside one frame: 246 units, 96.5% of full scale, which
           * tools/flicker-rate.cjs section 2 measured as the largest single-cell step in the
           * entire piece (seed 0, yaw 0.00, t=0.43 s under 'clear', t=0.75 s under 'storm'). It
           * passed the harness's verdict only because that verdict is on the RATE as well as the
           * size and a cell only does this once per 15-20 s cut — a rate of 0.15/s against a
           * ceiling of 1.0/s. Passing on a technicality is not the contract, and forty small
           * steps are free where one enormous one is not.
           *
           * The comment that used to stand here rejected exactly this fix, and it was right about
           * the wrong thing: blending the two pictures across the FULL dissolve window would indeed
           * have left every changed cell at half brightness for most of a second, which is a field
           * of mid-tone in the muddy band this file is built to stay out of. The ramp is not that.
           * It is CELL_FADE = 0.36 s per side against a 2.6 s window, and only CELL_CF = 28% of the
           * cells are anywhere off their end stops at any instant. The bill is in the header at
           * rule 1: two tenths of a point of muddy on this element's own cells, nothing measurable
           * on the whole frame.
           *
           * A CELL WHOSE TWO PICTURES AGREE DOES NOT FADE. That is not an optimisation either: on
           * a board mid-cut most cells carry the same code in both constructions (both dark, both
           * body copy), and dipping those would turn a dissolve into a whole-board blink. So both
           * codes are evaluated inside the ramp window and the fade is applied only where they
           * actually differ. Outside the window — which is every frame of the 15-20 s hold — this
           * is still ONE inkAt call, unchanged. */
          if (mix <= 0) { code = inkAt(AD.modeA, wu, wv, iu, iv); }
          else if (mix >= 1) { code = inkAt(AD.modeB, wu, wv, iu, iv); }
          else {
            fp = (mix - (FADE_H + hash2(wu + 61, wv + 29, sd + 5) * FADE_SPAN)) / FADE_H;
            if (fp <= -1) { code = inkAt(AD.modeA, wu, wv, iu, iv); }
            else if (fp >= 1) { code = inkAt(AD.modeB, wu, wv, iu, iv); }
            else {
              cA = inkAt(AD.modeA, wu, wv, iu, iv);
              cB = inkAt(AD.modeB, wu, wv, iu, iv);
              if (cA === cB) { code = cA; }
              else if (fp < 0) { code = cA; fade = -fp; }
              else { code = cB; fade = fp; }
            }
          }
          /* The near retirement, lit content only — see idens above. A dropped cell becomes dark
           * board rather than a hole, so the silhouette is never broken. */
          if (code !== 0 && idens < 1 && hash2(wu + 23, wv + 41, sd + 29) > idens) code = 0;
        }

        if (code === 0) {
          /* Honestly black. P.shadow at lum 9 prints v 5.7 at the near end of the curve and less
           * further out, so the whole dark body of the board is under the v=9 line and contributes
           * nothing at all to the muddy band while still occluding, still carrying a silhouette,
           * and still taking a lit facade cell off the census. */
          put(frame, x, r, ((wu + wv) & 1) ? G_HASH : G_8, P.shadow, PANEL_LUM, dist);
          continue;
        }
        if (code === 2) { colr = AD.hue2; glyph = TEXT_G[(hash2(wu, wv, sd + 11) * TEXT_N) | 0]; k = 1.0; }
        else if (code === 3) { colr = AD.acc; glyph = MASS_G[(hash2(wu, wv, sd + 13) * MASS_N) | 0]; k = 1.06; }
        else { colr = AD.hue; glyph = MASS_G[(hash2(wu, wv, sd + 17) * MASS_N) | 0]; k = 1.0; }
        lum = PEAK[colr] * atten * boost * k * fade;
        if (lum > 255) lum = 255;
        /* THE FADE'S FLOOR IS THE PANEL, not zero, and that is what makes the swap at the bottom
         * of the ramp free. A cell running its ink down hands over to the dark body the moment its
         * ink is dimmer than the body is, so the step across the handover is ZERO in lum — which
         * is the unit tools/flicker-rate.cjs measures — and 1.6 in printed v, from amber ink at
         * lum 9 (v 7.3 at the near end of the curve) to the panel's own v 5.7. Both of those are
         * under the v=9 black line, i.e. the handover happens entirely inside black and no eye can
         * be at the other end of it. Letting the ink run on down to lum 0 instead would punch a
         * hole through the board and let the window lattice behind it back through for a third of
         * a second, which is the one thing the dark body is here to stop. */
        if (lum <= PANEL_LUM) {
          put(frame, x, r, ((wu + wv) & 1) ? G_HASH : G_8, P.shadow, PANEL_LUM, dist);
          continue;
        }
        put(frame, x, r, glyph, colr, lum, dist);
      }
    }
  }

  /* ---- selection: the two best-framed, and never a third ------------------------------------- */
  var SEL = { n: 0, ax: 0, az: 0, as: 0, bx: 0, bz: 0, bs: 0 };
  var SALT = 0;

  CC.ELEMENTS.push({
    name: 'ads',
    layer: 34,

    /* EXACTLY ONE rng() call, always. The stream is shared across every element and drawing a
     * different number of times from it re-rolls every element that loads after this one. */
    init: function (city, rng) {
      this.city = city;
      SALT = (rng() * 2147483647) | 0;
    },

    update: function () {},

    draw: function (frame, cam, t) {
      var city = this.city;
      if (!city) return;
      setCam(frame, cam);
      airPrep();

      var R = AT.far;
      var gx0 = Math.floor(CO.ox - R), gx1 = Math.ceil(CO.ox + R);
      var gz0 = Math.floor(CO.oz - R), gz1 = Math.ceil(CO.oz + R);
      var gx, gz, rx, rz, w, side, lim, vy0, vy1, vx0, vx1, visR, visC, score, cf;
      var rows = frame.rows, cols = frame.cols;
      SEL.n = 0; SEL.as = 0; SEL.bs = 0;

      for (gz = gz0; gz <= gz1; gz++) {
        for (gx = gx0; gx <= gx1; gx++) {
          rx = gx + 0.5 - CO.ox; rz = gz + 0.5 - CO.oz;
          w = rx * CO.fwx + rz * CO.fwz;
          if (w < NEAR || w > R) continue;
          side = rx * CO.rgx + rz * CO.rgz; lim = w * CO.hp + 4;
          if (side > lim || side < -lim) continue;
          /* THE ORDER OF THESE TWO TESTS IS THE DENSITY KNOB, and it was wrong first time.
           * signage.js gates on a hash BEFORE any heightmap lookup, which is right for signage,
           * because a shopfront can sit on almost any built cell. It is wrong here: a board needs
           * a TALL cell with an OPEN face, and in a dense block that is about 4% of what the cone
           * contains — measured at 213x67, seed 3001: 1847 cells in the cone, ~1090 tall enough,
           * ~68 of those with a face onto the street. Gating on the hash first therefore threw the
           * dice 1847 times to fill 68 slots, and the city came out with no advertising in it at
           * all (0 boards over three of four sample seeds at a 1.1% rate). Gating AFTER the
           * geometry throws the dice once per genuinely eligible wall, so the rate in setup()
           * means what it reads as. The cost is one chunk-cached height lookup per cell in the
           * cone,
           * which is a rounding error against the raycaster's own thousands per frame. */
          if (city.height(gx, gz) < 15) continue;
          if (!setup(city, gx, gz, t)) continue;
          if (!measure(cam)) continue;
          /* Too small on screen to carry a picture at all. Under 10 columns or 5 rows there is no
           * construction left to see, only its ink, and its ink is indistinguishable from the lit
           * windows behind it — the same finding signage.js records for its own small fixtures. */
          if (M.span < 10 || M.hRows < 5) continue;
          /* HOW SKEWED THE PERSPECTIVE IS, which is a different question from how wide the board
           * is on screen and is the fifth thing that had to be found by looking. u is interpolated
           * perspective-correct, so on a board whose two ends are 15 m and 38 m away the far half
           * of the picture is squeezed into two screen columns: a face 8 content cells across
           * prints as a 2-cell smear with an eye missing, at the same time as the board measures a
           * perfectly respectable 11 columns wide. The depth RATIO is what that costs, so the
           * depth ratio is what is tested. 1.8 keeps the compression under two to one across the
           * whole picture, which every construction here survives; at 3.0 the far half of a face
           * lands in two columns. Tightening it to 1.6 and the framing test to 0.85 gave visibly
           * better boards and cut how often one is in frame from 46% of the sample to 15%, which
           * is too high a price for a city whose whole subject is advertising. */
          if (M.wR > M.wL * 1.8 || M.wL > M.wR * 1.8) continue;

          /* ---- how much of it is actually IN THE FRAME ----------------------------------------
           * Three separate things were wrong here before this block existed, and all three had the
           * same symptom: boards were accepted, spent a slot, and drew nothing worth looking at.
           *   - vertically, a board 15 m up on a wall 18 m away is forty rows above the top of the
           *     frame (the viewport holds about 0.45*d metres above the eye);
           *   - a near wall at a grazing angle throws up a board 49 rows tall of which the bottom
           *     19 are in shot, and the bottom 19 rows are three rows of its content grid — three
           *     rows of a face is a chin;
           *   - horizontally, a board can project 63 columns wide with 57 of them off the left of
           *     the frame, which passed a test on M.span and drew a seven-column sliver.
           * So the size tests are done on the CLIPPED rectangle, and the clipped area is also what
           * ranks the two slots below. */
          vy0 = M.cy - M.hRows * 0.5; vy1 = M.cy + M.hRows * 0.5;
          if (vy0 < 0) vy0 = 0; if (vy1 > rows - 1) vy1 = rows - 1;
          vx0 = M.xL; vx1 = M.xR;
          if (vx0 < 0) vx0 = 0; if (vx1 > cols - 1) vx1 = cols - 1;
          visR = vy1 - vy0; visC = vx1 - vx0;
          if (visR < 8 || visC < 8) continue;
          /* At least 55% of the board's own height in shot, and the last 15% of that is a RAMP and
           * not a threshold: what is drawn should be a picture and not a strip of one, but a board
           * you are walking under crosses this test in one frame while covering a thousand cells,
           * and deleting a thousand cells in one frame is the step measured and quoted at
           * clipFrac()'s use in drawAd(). So cf thins the board over the window 0.55-0.70 and
           * scales its rank as well, and by the time the board is deleted here it is drawing
           * almost nothing.
           * There is deliberately no matching test on the WIDTH: a board sliding off the side of
           * the frame as you walk past it is the normal way one leaves, and cutting it off at a
           * threshold would make it vanish mid-stride. The area ranking below handles that case
           * instead — it demotes rather than deletes. */
          cf = clipFrac(M.cy, M.hRows, rows);
          if (cf <= 0) continue;
          /* MOSTLY UNOCCLUDED, not merely glimpsed, and this is the fourth thing that had to be
           * learned by looking at the output rather than at the statistics. CC.put does the honest
           * per-cell occlusion for free, so a board 80% hidden behind the near block still draws —
           * as forty disconnected marks scattered through the gaps, in the two pillar hues, out of
           * the same glyph bank the window lattice behind it is drawn from. That is not a
           * billboard, it is noise, and it was what most accepted boards looked like (measured on
           * seed 3412 frame 2100: 1040 cells attempted, 205 drawn, 32 of them lit). Sixteen probes
           * across the rectangle, and at least 45% of the ones that land in frame have to see past
           * the board's own depth. A board that fails takes no slot, so the second-best board —
           * which may be perfectly visible — gets one. */
          if (visibleFrac(frame) < 0.45) continue;

          /* ---- the two slots ------------------------------------------------------------------
           * Ranked by CLIPPED SCREEN AREA and not by distance, which is the one decision here with
           * a photosensitivity argument behind it. Whichever key is used, the set of drawn boards
           * changes as the walk goes on, and a change means one board's cells appear in a single
           * frame. Under a nearest-first key the incumbent leaves when it slides off the side of
           * the frame — at which point it may still be covering three hundred cells — and the
           * replacement arrives at whatever size it happens to be, so the step is unbounded in
           * either direction. Under an area key a swap can only happen at the crossing point,
           * where the two boards cover the SAME number of cells: the frame loses n cells of board
           * and gains n cells of board in the same frame, and the whole-frame luminance step is
           * the difference between two boards' ink densities rather than a whole board's worth.
           * It also picks the better-framed board when there is a choice, which is what a viewer
           * would call the right answer anyway.
           * cf is in the key because a board on its way out of the top of the frame is drawing cf
           * of its cells: ranking it on the area it no longer fills would let it hold a slot
           * against a board that would fill one. */
          score = visR * visC * cf;
          if (score > SEL.as) {
            /* Two anchors on the same stretch of wall are one board with a seam down it. Within 8
             * cells in both axes — a board is at most 10.7 m wide — the newcomer REPLACES the
             * incumbent instead of taking the second slot. */
            if (SEL.n > 0 && Math.abs(gx - SEL.ax) <= 8 && Math.abs(gz - SEL.az) <= 8) {
              SEL.ax = gx; SEL.az = gz; SEL.as = score;
            } else {
              if (SEL.n > 0) { SEL.bx = SEL.ax; SEL.bz = SEL.az; SEL.bs = SEL.as; SEL.n = 2; }
              else SEL.n = 1;
              SEL.ax = gx; SEL.az = gz; SEL.as = score;
            }
          } else if (score > SEL.bs &&
                     (SEL.n === 0 || Math.abs(gx - SEL.ax) > 8 || Math.abs(gz - SEL.az) > 8)) {
            SEL.bx = gx; SEL.bz = gz; SEL.bs = score; SEL.n = 2;
          }
        }
      }

      /* THE CAP, and it is structural rather than a counter: there are two slots and there is no
       * third variable to put a board in. setup() is re-run because it is deterministic in
       * (gx, gz, t) and re-deriving is cheaper than keeping a pool of board records alive. */
      if (SEL.n >= 1 && setup(city, SEL.ax, SEL.az, t) && measure(cam)) drawAd(frame);
      if (SEL.n >= 2 && setup(city, SEL.bx, SEL.bz, t) && measure(cam)) drawAd(frame);
    }
  });

})(typeof CC !== 'undefined' ? CC : require('../core.js'));
