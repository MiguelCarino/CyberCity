/* CyberCity core — frame buffers, palette, glyph table, seeded noise, safe writes. */
var CC = (function () {
  'use strict';

  // Palette measured off the reference frames: two pillars (sodium amber, screen azure)
  // and three narrow accents. Brightness is NOT baked in here — `lum` scales these.
  var PALETTE = [
    [216, 232, 74],   //  0 amber   — sodium streetlight, the first pillar
    [ 74, 168, 232],  //  1 azure   — screenlight, the second pillar
    [224, 114, 74],   //  2 ember   — accent district, warning lamps
    [ 42, 197, 147],  //  3 spring  — accent district, foliage, transit
    [130, 86, 230],   //  4 violet  — rare; screens and signage only. Was 186,64,232, which is hue
                      //              288 — magenta, and with the bloom on top of it a blade sign in
                      //              it printed as hot pink across the top of the frame. The rule is
                      //              three NARROW accents and no magenta ever, so the swatch is
                      //              walked round to hue 257: unmistakably violet, never pink.
    [216, 226, 236],  //  5 white   — pavement, rails, structure
    [255, 92, 92],    //  6 red     — aerial lamps, stop signals
    [ 62,  98, 138],  //  7 slate   — unlit concrete and far haze. Deliberately NOT grey: it is the
                      //              most numerous swatch in the frame (a third of every lit cell),
                      //              so at 120,150,180 it printed a wash of neutral haze over the
                      //              whole picture — exactly the grey the distance must never fade
                      //              to. The same value read as cold structure lit by screenlight
                      //              carries the facades without ever competing with the pillars.
    [255, 214, 120],  //  8 warm    — interior spill, windows with someone home
    [ 90, 240, 255],  //  9 ice     — holo, glass, rain highlight
    [255, 255, 255],  // 10 pure    — specular hits only, use sparingly
    [ 40,  50,  66]   // 11 shadow  — occluded structure that must still read
  ];
  var P = { amber:0, azure:1, ember:2, spring:3, violet:4, white:5, red:6,
            slate:7, warm:8, ice:9, pure:10, shadow:11 };

  // Glyph table. Index 0 must stay blank — the frame is cleared to it.
  var GLYPHS = " .,:;'\"`^~-_=+*|/\\()[]{}<>!?#%&$@8OoQ0XZWMNHUVAKY".split('');
  var GI = {};
  for (var i = 0; i < GLYPHS.length; i++) GI[GLYPHS[i]] = i;
  function g(c) { var v = GI[c]; return v === undefined ? 0 : v; }

  function makeFrame(cols, rows) {
    var n = cols * rows;
    return {
      cols: cols, rows: rows, n: n,
      ch:   new Uint8Array(n),
      col:  new Uint8Array(n),
      lum:  new Uint8Array(n),
      dist: new Float32Array(n),
      kind: new Uint8Array(n)
    };
  }

  function clearFrame(f) {
    f.ch.fill(0); f.col.fill(0); f.lum.fill(0); f.kind.fill(0);
    f.dist.fill(Infinity);
  }

  // The only sanctioned write. Depth-tests so elements can never punch through a wall.
  function put(f, x, y, chIdx, colIdx, lum, dist, kind) {
    x = x | 0; y = y | 0;
    if (x < 0 || y < 0 || x >= f.cols || y >= f.rows) return false;
    var i = y * f.cols + x;
    if (!(dist < f.dist[i])) return false;
    f.ch[i] = chIdx; f.col[i] = colIdx;
    f.lum[i] = lum < 0 ? 0 : (lum > 255 ? 255 : lum | 0);
    f.dist[i] = dist; f.kind[i] = kind === undefined ? 3 : kind;
    return true;
  }

  // Unconditional write for the world pass, which owns the buffer and paints back-to-front.
  function poke(f, i, chIdx, colIdx, lum, dist, kind) {
    f.ch[i] = chIdx; f.col[i] = colIdx;
    f.lum[i] = lum < 0 ? 0 : (lum > 255 ? 255 : lum | 0);
    f.dist[i] = dist; f.kind[i] = kind;
  }

  /* ---- deterministic noise --------------------------------------------
   * Every multiply is Math.imul, and that is not a micro-optimisation — it is correctness.
   * With `*`, `x * 374761393` leaves the 2^53 mantissa the moment |x| passes ~2.4e7 and the
   * low bits, which are the ONLY bits (h >>> 13) and (h >>> 16) go on to mix, are quietly
   * rounded away. The symptom is not noise that looks slightly different; it is per-lot random
   * streams that COLLAPSE — at seed 2e9 the offsets S+601..S+615 used to land in just two
   * distinct streams, and 512 adjacent seeds gave 4 distinct cities. imul keeps the product
   * exact modulo 2^32, which is the arithmetic this hash was designed in.
   *
   * THE FINALIZER IS TWO ROUNDS AND THAT IS ALSO CORRECTNESS, not paranoia. imul(s, 2147483647)
   * is exactly (s << 31) - s, so changing the seed by a small constant changes the mixer's input
   * by that same small constant, and ONE multiply-xorshift round does not hide a small additive
   * offset. Measured over 24 base seeds x 8000 samples (noise floor 0.008): the old single round
   * gave mean |correlation| 0.78 at seed delta 64, 0.64 at 128, 0.48 at 32, and exceeded 0.04 for
   * 80 of the first 160 deltas. That is not an abstract worry, because this file's callers get
   * their "independent" streams by adding a SMALL constant to the seed — S+101, S+211, S+307 and
   * so on — and 389 of the 1026 stream pairs those offsets actually produce measured above 0.05,
   * worst 0.448 (S+211 against S+307). Two supposedly separate ambient systems were drawing the
   * same numbers. With the second round every one of those pairs sits at the noise floor (worst
   * 0.049) and the seed-delta sweep is flat at 0.007-0.011 out to delta 256. The cost is one imul
   * and one xorshift per call, measured at ~5% of hash2's own time, and hash2 is not the render
   * loop's bottleneck. elements/signage.js's hk() — vary the COORDINATE by a large odd offset
   * rather than the seed by a small one — was written to dodge exactly this and is still the
   * belt-and-braces convention, but it is no longer the only thing standing between the build
   * and correlated streams. */
  function hash2(x, y, s) {
    var h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) +
             Math.imul(s | 0, 2147483647)) | 0;
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function hash1(x, s) { return hash2(x, 0, s); }
  function mulberry(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function smooth(t) { return t * t * (3 - 2 * t); }
  function vnoise(x, s) {          // 1D value noise, for sways and flicker
    var i = Math.floor(x), f = x - i;
    return lerp(hash1(i, s), hash1(i + 1, s), smooth(f));
  }

  /* ---- exposure -------------------------------------------------------
   * The city was a full stop under-exposed: 82-85% of the frame was pure black against a
   * reference that sits at 54-60%, and the lum histogram explained why — 60% of every lit cell
   * landed under 32/255, which is a glyph drawn in a colour nobody can see. The surfaces were
   * not wrong, the print was. So this is a print stage, not a retouch: one curve over the
   * finished frame, applied exactly once, after the world pass and every element.
   *
   * Three things happen per cell, all of them in a lookup table built once at load:
   *
   *   1. a per-swatch EXPOSURE weight. This is the TONAL LADDER and it is the most powerful
   *      control in the file: `gain` multiplies lum before the curve, so gain*255 is the ceiling
   *      a swatch can ever print at, and no amount of light upstream gets a swatch past its own
   *      ceiling. The ladder therefore decides which swatches are allowed to be the brightest
   *      thing on screen. The rule it now encodes: LIGHT OUTRANKS STRUCTURE. The two pillars
   *      (sodium amber, screen azure) must be able to reach the top of the lit range; the three
   *      narrow accents must not out-top the pillars; white and warm are surfaces lit by that
   *      light and sit below it; slate and shadow are unlit concrete and sit below everything.
   *
   *   2. a gamma lift, which is where the stop comes from, with a KNEE that crushes the bottom
   *      instead of lifting it. A plain gamma would drag the 1-10 lum dither out of the dark and
   *      the whole frame would go to grey fog; below the knee the curve bends the other way and
   *      those cells stay black. The knee bites on x = lum*gain/255, so its lum threshold is
   *      GAIN-DEPENDENT — see the KNEE comment below, which used to quote one number as if it
   *      were the same for every swatch.
   *
   *   3. the lift fades out with DEPTH. Distant geometry must fade to BLACK, never to grey, and
   *      Surf.fog earns that in linear light — pushing a fixed x^0.33 over the top of it would
   *      hand the far end of the street its brightness back as haze. Far cells get gamma 1, so
   *      fog's ramp survives untouched and only the near and middle ground open up.
   *
   *   4. a SHOULDER on the highlights, so a swatch can be pushed hard without going flat.
   *
   * Everything upstream keeps reading and writing plain linear lum, which matters: optics.js
   * does read-modify-write gain passes on the frame, and a curve inside put()/poke() would
   * compound through every one of them.
   *
   * These weights are CALIBRATION, not taste: they were fitted by rendering a fixed set of
   * seeds and frames through tools/headless.cjs + tools/topng.py and measuring the printed
   * frame — share of lit energy per swatch, and the proportion of the picture that is pure
   * black. They therefore describe THIS surfaces.js. If the surfaces change what they paint,
   * re-measure and refit; do not adjust them by eye.
   *
   * AND MEASURE THEM OVER A WIDE SAMPLE, because the previous fit was taken over four seeds
   * (3/7/42/99) and this paragraph then asserted, for two rounds, a pillar balance that is true
   * on those four seeds and false everywhere else. The sample below is 32 seeds on a fixed
   * arithmetic rule — 3001 + 137k for k = 0..31 — crossed with frames 600/6000/12000/18000 at
   * 400x100, 128 warm frames rendered through tools/headless.cjs into a fresh directory, plus a
   * 24-seed hold-out on an unrelated rule (9001 + 211k). Four seeds cannot see a distribution and
   * a mean cannot see a spread; quote both or the next reader inherits this same bug.
   *
   * THE LADDER WAS INVERTED AND IT IS THE REASON THE CITY READ AS TEXTURE. The previous table
   * printed, at lum 255 and the near depth bucket: red 243, pure 237, white 228, ice 224, ember
   * 218, warm 204, violet 200, spring 195, azure 156, slate 137, amber 126, shadow 66. Both
   * pillars sat at the BOTTOM of the lit range and structure sat on top of them. Over the
   * canonical 16-frame sweep (seeds 3/7/42/99 x frames 600/3000/9000/18000 at 400x100, through
   * tools/headless.cjs) that produced ZERO amber cells and ZERO azure cells above v=170 in any
   * frame, while white, warm, ember, spring, red and ice all had hot cells. Measured on the near
   * ground (depth 12-25 world units, all 16 frames pooled) white printed 166.5 against azure
   * 105.3 and amber 80.6 — the swatch documented three lines below as "structure, not light" was
   * printing twice as bright as the first pillar on the same depth plane.
   *
   * The claim this paragraph used to make — that the weights "redistribute colour without moving
   * the stop" and that GAMMA and KNEE are the real brightness controls — is false, and it was
   * believed because it was checked against black%, which cannot see it. Swept over the same 16
   * frames: GAMMA 0.33 -> 0.75 moves black 41.30% -> 41.65% while the muddy 9-119 band RISES to
   * 53% and the hot tail COLLAPSES 1.86% -> 0.62%. KNEE 0.055 -> 0.24 drops mid to 37.6% and
   * leaves hot at exactly 1.86% — a knee can delete a shadow, never create a highlight. SHOULDER
   * 0.45 vs 0.90 is a no-op to 0.01 points, because almost nothing except slate ever reached it.
   * EXPOSURE alone, curve untouched, moved mid 51.1% -> 31.5% and hot 1.86% -> 3.29%. black% was
   * blind to all twelve settings because it is pinned by `blank` (glyph 0 or lum 0, which the
   * curve never touches) and `blank` sat at 41.2-41.7% under every one of them.
   *
   * SO THE NUMBERS TO MEASURE ARE NOT black%. They are the share of the frame in the muddy band
   * v=9-119 (28.4%, target under 30%) and the share above v=170 (3.86%, target 3.5-5%). A frame
   * can be 60% black and read beautifully — the strongest composition in the sweep is also one of
   * its blackest — and it can be 40% black and read as flat texture.
   *
   * AND black% NOW MEANS TWO DIFFERENT THINGS, which is worth stating because the old "40-55%"
   * band is quoted in briefs as though it still meant one. tools/metrics.py reports `blank` (no
   * glyph, or lum 0 — the curve cannot touch it) at 41.6% and `black(v<9)` (blank PLUS every cell
   * the print takes below visibility) at 56.8%. Those were the same number when KNEE was 0.055
   * and slate's gain was 2.00; raising the knee to 0.075 is what split them, and the 15.2 points
   * between them are the far haze being crushed to black on purpose — the doctrine is that
   * distance fades to BLACK, never to grey. 41.6% sits inside the 40-55% band and 56.8% sits
   * inside the 54-60% this comment's own opening quotes off the reference frames. Neither is out
   * of calibration; they are two censuses of the same picture, and a target has to name which.
   *
   * PILLAR BALANCE — READ THIS BEFORE TOUCHING EXPOSURE[0] OR EXPOSURE[1]. Over the 128 frames
   * the pillars take amber 45.3% and azure 35.6% of lit energy, i.e. the pillar pair splits
   * 56.0/44.0. THE PER-FRAME SPREAD IS THE REAL NUMBER AND IT IS ENORMOUS: amber runs 7.8% to
   * 95.0% of lit energy (median 46.0) and azure 3.6% to 75.9% (median 34.1), the per-frame
   * amber:azure ratio runs 0.10 to 26.3 with a median of 1.32, and only 46% of frames have the
   * two within a factor of two of each other. Pooled by seed it is 0.34 to 4.16. A previous
   * revision of this comment reported the pillars "within two points of each other"; that was
   * measured over seeds 3/7/42/99 and is false on every wider sample.
   *
   * THAT SPREAD IS NOT THIS FILE'S TO FIX AND NO SETTING OF THIS TABLE MOVES IT. Measured over
   * the same 128 frames: amber paints 557,598 cells against azure's 387,933, a 1.44:1 COVERAGE
   * ratio, and the correlation between a frame's log cell-count ratio and its log lit-energy
   * ratio is 0.997. The print is already the only thing holding the gap below coverage — amber
   * prints at a mean 131 against azure's 159 on the cells that count as lit. Sweeping every knob
   * in this file over its whole feasible range moves the mean |log2 ratio| only between 1.15 and
   * 1.32, because the gain enters the curve under an exponent of 0.33-1.00: a 2.2x change of
   * EXPOSURE[amber] (0.28 -> 0.62) moves amber's pooled share by 1.25x and nothing else. Which
   * districts a walk passes through is decided in city.js, and how many cells of each swatch a
   * facade paints is decided in surfaces.js (the window-hue roll alone is 42% amber against 30%
   * azure, and SHOP leans a district's shopfronts onto its own pillar). Bending this curve to
   * hide that is exactly how the table came to be overfitted; fix it there or leave it.
   *
   * WHAT THE REFIT DID FIX, all measured on the same 128 frames with only this file swapped:
   *   - the ladder, below, which had five swatches printing above the first pillar;
   *   - white's max share of a frame's lit energy 36.6% -> 32.4% and its ceiling 174 -> 151, so
   *     the white wall that was the brightest object in s4645_f18000 is grey structure again;
   *   - warm outranking a pillar 22/128 frames -> 17/128, pooled 11.1% -> 9.3%;
   *   - frames led by something that is neither pillar 6/128 -> 3/128;
   *   - ember's max share 33.8% -> 29.1% and its ceiling 203 -> 163, which is the print-side half
   *     of the accent-leads-the-frame bug city.js measured and could not bound from its side;
   *   - the pillar split 57.4/42.6 -> 56.0/44.0 and the median ratio 1.39 -> 1.32. That is the
   *     whole of what the centre had left in it at no cost to the ladder, and it is small.
   * Costs: hot 3.73% -> 3.86% (in band), muddy 28.8% -> 28.4%, black and blank unmoved.
   *
   * EXPOSURE IS NOT PRIVATE TO THIS FILE, so a refit is not a print-only change however much this
   * comment would like it to be: elements/optics.js's `mistfar` reads CC.EXPOSURE to rescale a
   * warm cell's lum when it repaints it to slate, on purpose, so that the hue swap costs the frame
   * no printed energy. Refitting therefore moves what that element writes, which moves the frame
   * an element measures, which moves the next tick — an offline table sweep is not exactly the
   * shipped walk. Measured, over the 32 most mist-loaded frames of the sweep (mistfar does nothing
   * in the other five skies): 0.53% of cells move before the print and every reported statistic
   * moves by at most 0.03 of a point, slate's own share being the largest. Small, but it is the
   * reason a refit has to be confirmed by re-rendering and not only by re-printing.
   *
   * A LEVER THAT WOULD DO MORE AND IS DELIBERATELY NOT SHIPPED. Amber's share and amber's ceiling
   * are the same knob here, so the two things wrong with amber pull opposite ways: amber-dominant
   * frames are also the COLDEST frames (the 12 frames with the least hot tail average 53.2% amber
   * and 0.87% hot against the 3.5-5 target, because amber's ceiling barely clears the hot line),
   * yet raising amber's gain to fix that raises its share too. Giving KNEE a per-swatch entry
   * separates them: amber at gain 0.72 with its own knee at 0.26 holds the share at 43.8% while
   * the hot tail goes 3.73% -> 6.91% and amber-frame hot 2.40% -> 7.03%. It was measured, it
   * works, and it is a new mechanism rather than a recalibration of an existing one, so it is
   * recorded here for whoever owns that decision instead of being slipped in under a refit. */
  /* THE LADDER. Printed ceilings under this table (lum 255, near bucket, scaled by the swatch's
   * own pigment): pure 234, azure 220, red 206, amber 180, ice 175, warm 167, ember 163, spring
   * 163, violet 154, white 151, slate 114, shadow 60.
   *
   * THE RULE, which the previous table stated and then broke in five places (ember 203, ice 209,
   * warm 195, violet 179 and red 214 all sat above the first pillar's 177): only `pure` and `red`
   * — a specular return and an actual lamp — may print above a pillar, and neither may print
   * above the HIGHER pillar. Every accent, and every surface that is merely lit by the pillars,
   * sits under the LOWER one. Read it as four tiers: specular and lamps; the two pillars; the
   * narrow accents and the lit surfaces beneath them; unlit concrete at the bottom.
   *
   * The 40-point gap between the two pillars is not sloppiness, it is the correction: amber
   * paints 1.44 cells for every azure cell (see PILLAR BALANCE above), so the more numerous
   * pigment gets the lower ceiling and the two arrive at comparable presence. Both still clear
   * the v=170 hot line, which is what "the pillars own the top of the lit range" has to mean. */
  var EXPOSURE = [
    0.50,   //  0 amber   — the first pillar, ceiling 180. The gain has a HARD FLOOR just under it
            //              and it is not a preference: at 0.44 the ceiling is 171 and at 0.42 it
            //              is 165, which is under the v=170 hot line, and amber is the swatch
            //              that decides whether an amber-district frame has any highlight at all
            //              (the 12 coldest frames of 128 average 62.9% amber and 0.87% hot). It
            //              also has a soft ceiling above: pushed to 0.62 the amber slabs that
            //              already fill those frames simply get yellower — rendered and looked at
            //              on s6700_f12000, which is 95% amber, and the picture got worse while
            //              every statistic improved. Amber is the most numerous lit swatch by
            //              1.44:1, so it takes the lowest gain of the lit tier; that is the
            //              coverage being corrected for, not the pillar being held down
    1.00,   //  1 azure   — the second pillar, ceiling 220. Higher than amber for the coverage
            //              reason above, not because the pigment is dimmer — amber and azure have
            //              the SAME max channel (232), so equal ceilings would mean equal gains
            //              and the split would go straight back to the raw 1.44:1. Raised from
            //              0.82 for the last of the centring that was available: it buys the
            //              pillar split 56.6/43.4 -> 56.0/44.0. Past here the return collapses
            //              (the cells are over the SHOULDER) and the frames that are already
            //              azure-led start to glare — at 1.10 the hottest frame in the sweep goes
            //              to 18.8% of cells above v=170 and the near screens read as a flat wall
            //              of blue rather than as windows
    0.42,   //  2 ember   — NARROW accent, ceiling 163, under the lower pillar. It was 0.80 for a
            //              ceiling of 203, ABOVE the first pillar's 177, and that is the print
            //              side of the bug city.js measured from the other end: in the near depth
            //              bucket ember printed a median 175.7 against amber's 139.2 in the SAME
            //              frame, so a small ember district on the near wall became the subject
            //              of the picture. Six district-table levers were swept in city.js and
            //              none of them bounded it, because dimming a slab that already fills the
            //              frame moves numerator and denominator together; the ceiling does bound
            //              it, and only in the frames that were failing
    0.60,   //  3 spring  — narrow accent, ceiling 163. It was once the highest weight in the whole
            //              table at 1.55, applied to the rarest accent, and wherever a spring
            //              district came into view it detonated. THE RULE: no accent's ceiling
            //              may exceed the LOWER pillar's, or the accent becomes the focal point
            //              of every frame its district appears in. Spring still reaches 24.4% of
            //              a frame's lit energy at its worst, which is coverage and belongs to
            //              whichever element paints that mass, not to this table
    0.34,   //  4 violet  — narrow accent, ceiling 154, and the one that goes gaudy the instant it
            //              is indulged: at the old 0.50 it printed 179, over the first pillar,
            //              and s5467_f6000 carries a violet slab across the top-left corner
            //              holding 24.9% of the frame's lit energy. The ceiling stops it leading;
            //              the slab itself is a paint fact
    0.30,   //  5 white   — structure, not light, and finally printed like it: ceiling 151, well
            //              under both pillars. At 1.15 it printed 228 and was the brightest broad
            //              swatch in the frame; at 0.44 it still printed 174, one point under the
            //              first pillar, and in s4645_f18000 a white wall was the brightest object
            //              on screen with 36.6% of the frame's lit energy. Specular hits belong to
            //              `pure`; white is the thing the light lands on. Worst-frame share is now
            //              32.4% and white leads no frame in the sweep
    0.56,   //  6 red     — aerial lamps read at their own brightness or they are not lamps, so red
            //              is allowed above the pillars — but not above the HIGHER one, which 0.62
            //              was (214 against azure's 211). At 206 it still tops amber, which is the
            //              point of a lamp, and cannot top a wall of screens. At 1.05 it printed
            //              243 and the single brightest object in the entire reference sweep was
            //              not a lamp at all but a red facade wall
    0.60,   //  7 slate   — unlit concrete. It was at 2.00 "for coverage", and 2.00 is past the
            //              SHOULDER, which silently cancelled its depth fade: slate printed 137.5
            //              at the near plane and 136.9 at the fog wall, a 0.4% fade, on 36% of
            //              every painted cell. That is why the canyon did not read — the
            //              geometry was there, the luminance gradient that lets an eye see it was
            //              not. INVARIANT: a swatch that is coverage rather than light must keep
            //              gain*lum under SHOULDER across the lums it actually gets written at,
            //              or it loses the one cue that makes far things far. At 2.00 slate was
            //              over it from lum 79 up, which is most of a facade. Coverage itself is
            //              untouched, because coverage is which cells surfaces.js paints and not
            //              how bright they print: `blank` moved 43.3% -> 42.3% over the sweep, so
            //              the facades are still slabs and not lattices
    0.32,   //  8 warm    — interior spill. At 30-38% it was a third pillar, and a yellow one; at
            //              0.48 it was still printing 195, above the first pillar's 177, and it
            //              outranked a pillar outright in 22 of 128 frames while reading to the
            //              eye as more amber. Ceiling 167 and 17 of 128, which is as far as a
            //              ceiling can take it: the frames where warm leads are frames standing
            //              in front of a lit interior, and that is surfaces.js's massing, not a
            //              print fault
    0.36,   //  9 ice     — rain highlight; belongs with azure. A GLINT, never a surface, and the
            //              old ceiling of 208 made it a surface: it sat above BOTH the first
            //              pillar and every accent on the strength of being rare, which is the
            //              same argument that put spring at 1.55. Rarity bounds how many cells a
            //              swatch owns, never how bright the frame's brightest thing is. At 175 it
            //              is still the top of the accent tier, still reads as a glint against wet
            //              road, and takes at most 2.7% of a frame's lit energy
    0.85,   // 10 pure    — specular only; it is already at the top of the scale
    0.80    // 11 shadow  — occluded structure must READ as occluded structure, not as a hole, and
            //              this one is deliberately NOT 0.60. shadow's pigment tops out at 66, so
            //              unlike slate it was never in the inverted ladder and could not compete
            //              with a pillar at any gain; its only real fault at 2.60 was the same
            //              fade cancellation, since from lum 61 up it sat past the SHOULDER, and
            //              it is 24% of every painted cell. At 0.60 the near facades that are in
            //              shadow stop being mass and become holes — the whole left half of
            //              s42_f18000 goes to flat black. 0.80 keeps them as dark blue-grey
            //              slabs (a typical shadow cell prints v 26-36 instead of 21) with the
            //              fade intact, since its working lum range 20-60 is nowhere near the
            //              shoulder, and the 16-frame muddy band still comes in under target at
            //              28.6%. THE INVARIANT is not "gain below SHOULDER" but "the swatch's
            //              WORKING lum range times its gain stays below SHOULDER" — that is what
            //              2.00 and 2.60 broke, from lum 79 and 61 up respectively
  ];
  /* GAMMA and KNEE are held at the values the previous round fitted, and that is a measurement
   * rather than an omission: re-swept over the 128 frames with the new EXPOSURE in place, GAMMA
   * 0.24 puts the hot tail at 7.12% (target 3.5-5) and 0.40 at 2.36%, so 0.33 is the only step on
   * the grid that lands in band. GAMMA and KNEE are also the only two knobs that move black% at
   * all — EXPOSURE cannot, because black is pinned by cells the curve never reaches — and every
   * setting that pulls black(v<9) down to the 40-55 band pushes the muddy band past 30% in the
   * same move (KNEE 0.065 -> black 55.0 / muddy 30.6; 0.058 -> 53.4 / 32.3). The two targets are
   * not jointly satisfiable on this tree and muddy is the one that describes what the picture
   * looks like, so muddy wins and black is reported honestly instead of being fitted to. */
  var GAMMA = 0.33;        // the lift; roughly the stop the frame was missing
  /* The knee bites on x = lum*gain/255, so the lum it crushes below is gain-dependent and there
   * is no single number to quote: at 0.075 it is lum 32 for slate (gain 0.60), lum 24 for shadow,
   * lum 19 for azure and lum 38 for amber. That is the right way round — the crush lands hardest
   * on the two swatches that fill the frame and never touches a bright pillar cell. Raised from
   * 0.055 because at the old value the crush was inactive where it mattered: with slate at gain
   * 2.00 a cell had to be under lum 7 to reach the knee at all, so the stage that says it crushes
   * the bottom was instead lifting 25 percentage points of near-invisible dither into the mid
   * band. Re-measured over the 128-frame sweep at the current weights, 0.055 -> 0.075 moves the
   * muddy v=9-119 band 32.3% -> 28.4% and costs zero hot cells. It is deliberately not 0.10: at
   * 0.10 the sweep also extinguishes floor and element cells, i.e. it starts eating the road
   * texture and the ambient systems rather than the haze. At 0.075, 99.7% of what goes dark is
   * slate and shadow. */
  var KNEE = 0.075;
  /* Above this the top rolls off instead of clipping — see the LUT below. IT IS A GUARD RAIL AND
   * NOT A WORKING CONTROL, and that is measured, not assumed: swept 0.45 -> 0.99 over the 128
   * frames with the current table it moves every reported statistic by at most 0.2 of a point,
   * because only azure's gain reaches it at all and only from lum 168 up. It earns its place by
   * bounding what a FUTURE gain can do — the previous table had slate at 2.00 and shadow at 2.60,
   * where the shoulder was live from lum 79 and 61 up and silently cancelled their depth fade —
   * so do not read its inertness today as permission to delete it. It also has a floor: below
   * about 0.50 it stops being a rail and starts eating the ladder's own top, taking azure from
   * 220 to 214 and pure from 234 to 228 at 0.45, which closes the gap the pillars need over the
   * accent tier. Above 0.62 it does nothing but widen azure's ceiling (232 at 0.99). */
  var SHOULDER = 0.62;
  var DBUCKETS = 8;        // depth quantisation for the fade-out of the lift
  var FOG_START = 12.0, FOG_END = 125.0;   // must track CC.Surf's ramp
  /* At or past this depth a cell is BACKDROP, not far geometry, and is printed at the near end of
   * the curve. FOG_END is the exact boundary and not a guess: the raycaster breaks its march at
   * FOG_END so no facade can carry a larger dist, a floor row that projects past it comes back
   * from Surf.fog at lum 0 and is skipped below, and every object in elements/sky.js is deliberately
   * given a distance beyond it so that it self-occludes against the world pass. */
  var SKY_D = FOG_END;

  /* ---- THE DAY LADDER ---------------------------------------------------------------------------
   * The table above is fitted to a NIGHT frame and says so at length: LIGHT OUTRANKS STRUCTURE, the
   * two pillars own the top of the lit range, white is 0.30 because "white is the thing the light
   * lands on" and slate is 0.60 because it is unlit concrete. Every one of those sentences is
   * false at noon, and the inversion is total rather than a scale:
   *
   *   THE PILLARS GO OFF.   Sodium and screenlight are what a city has INSTEAD of daylight. At noon
   *                         a sodium lamp is a grey tube and a screen is a dark rectangle, so amber
   *                         and azure drop to the bottom of the ladder — azure hardest, from 1.00
   *                         to 0.30, because it is the highest gain in the night table and a lit
   *                         window painted at that gain under a bright sky is the one cell that
   *                         gives away that nothing has really changed.
   *   STRUCTURE OUTRANKS LIGHT. White is render, board, bone and dust with the sun on it, and slate
   *                         is concrete and shadowed rock; between them they are most of a daylight
   *                         frame's area, so they take the top of the ladder — white 0.30 -> 0.92,
   *                         slate 0.60 -> 0.78.
   *   SHADOW STOPS BEING A HOLE. At night `shadow` is a swatch the print deletes on purpose. By day
   *                         a shadow is filled by the whole bright sky above it, so it lifts from
   *                         0.30 to 0.46 — which is what stops a daylight frame reading as a lit
   *                         object cut out of black paper.
   *   ICE AND PURE ARE THE SKY AND THE SPECULAR. Ice carries a daylight sky, which is the largest
   *                         bright surface in either atmospheric world, so it goes 0.36 -> 0.66.
   *
   * GAMMA AND KNEE MOVE WITH IT. The night curve exists to lift a frame that is 55% black and crush
   * its dither back down; a daylight frame has no dither to crush and no hole to lift, so the day
   * values are a much weaker lift (0.33 -> 0.62) and a much smaller crush (0.075 -> 0.030). The
   * muddy band that the night targets fight to keep under 30% is where a daylight picture LIVES —
   * a lit wall, dust, a blue sky are all mid-tones — so by day the census that matters is the hot
   * tail, not the muddy one, and tools/metrics.py's targets describe night and only night. */
  var EXPOSURE_DAY = [
    /* 0.42 and 0.52, not 0.30 and 0.30, and the correction was forced by a measurement rather than
     * by taste. At 0.30 the pillars' PRINTED CEILINGS fall to about 150 and 165 — both under the
     * 170 the census counts as a highlight — so from the moment the blend started, no amber or
     * azure cell in the frame could be hot however brightly it was written. At the dusk stop the
     * city had 3061 pillar cells in the frame, exactly none of them hot, against 1477 of 3403 at
     * night, and the max printed value was 165. A dusk with the neon lit and nothing in the frame
     * allowed to be bright is not a picture.
     *
     * The physical reading is also better at these values. A sodium lamp at noon is a grey tube,
     * which is what 0.42 says relative to white's 0.92; a large LED sign at noon is perfectly
     * visible and merely not dazzling, which is what 0.52 says. The swatch that carries a DAYLIGHT
     * sky is ice, not azure, so raising azure here costs the sky nothing. */
    0.42,   //  0 amber   — a sodium lamp in daylight: still there, no longer the brightest thing
    0.52,   //  1 azure   — a big screen in daylight: readable, and not a highlight
    0.46,   //  2 ember   — rust, brick, red rock: a real daylight surface, and it keeps its place
    0.70,   //  3 spring  — foliage, and by day there is enough of it to matter
    0.26,   //  4 violet  — still the rarest thing in the table, and daylight has no use for it
    0.92,   //  5 white   — THE daylight swatch: render, planed board, bone, dust, cloud
    0.50,   //  6 red     — paint and hazard, unchanged in kind
    0.78,   //  7 slate   — concrete and shadowed rock, and the second largest area by day
    0.62,   //  8 warm    — sunlit timber and skin; it stops being "interior spill" at noon
    0.66,   //  9 ice     — the daylight sky, which is the largest bright surface either world has
    0.85,   // 10 pure    — specular, and specular is what a sun makes
    0.46    // 11 shadow  — filled by the sky rather than empty; see the note above
  ];
  var GAMMA_DAY = 0.62, KNEE_DAY = 0.030;

  /* ---- how much of the day table is mixed in ------------------------------------------------------
   * Quantised, and that is the whole implementation trick. The LUT is 24 KB of pow() and exp() and
   * the file has always said it is "built once at load, never allocated again"; rebuilding it every
   * frame would put 24576 transcendental calls on the frame budget. Rebuilding it when a QUANTISED
   * mix changes puts them on one frame in every four hundred — the clock runs a 420 s cycle and
   * there are 32 steps across it, so the rebuild happens about once every thirteen seconds, costs
   * about a millisecond, and lands inside a 16 ms budget with room to spare.
   *
   * 32 steps and not 8: the mix moves fastest through dawn and dusk, which is exactly where the eye
   * is watching the light change, and at 8 steps the ladder visibly clunks between two frames. */
  var DAY_STEPS = 32;
  var dayMix = 0, daySun = 0, dayStep = -1;

  /* ---- THE BLEND IS NOT THE SAME SHAPE FOR EVERY SWATCH -------------------------------------
   * Surfaces gain their daylight EARLY and sources lose theirs LATE, and blending both linearly
   * against the same number is what made the transitional hours the flattest pictures in the build.
   *
   * The physics is ordinary: a wall starts being lit by the sky as soon as there is any sky, so
   * white and slate should climb from the first light of dawn. A neon sign, a sodium lamp or a lit
   * window, on the other hand, is still the brightest thing in the frame right through the golden
   * hour and only stops competing once the sun is properly up — anyone who has seen a lit shopfront
   * at sunset knows it reads. Under a linear blend the two pillars had already given up half their
   * gain at the dusk stop, and the city printed 0.68% of its cells hot there against 8.02% at
   * night and 3.20% at noon: the one hour with both neon AND a bright sky in it was the dimmest
   * frame of the three.
   *
   * Squaring the mix for the four SOURCE swatches holds them near their night gains until the mix
   * passes about 0.6 and then drops them quickly, which is the shape the eye expects and the shape
   * that keeps a lit sign lit through dusk. */
  function ladder(c, mix, sunMix) {
    /* SOURCES BLEND ON THE SUN, SURFACES ON THE SKY, and they are two different numbers because
     * they answer two different questions. "Is this wall lit?" is answered by the sky, which is
     * bright through the whole of twilight. "Has this lamp stopped being the brightest thing in
     * the frame?" is answered by the SUN, which is down for all of it — and a sodium lamp at dusk
     * has emphatically not stopped, which is the entire look of the hour.
     *
     * Blending both on the sky cost the city its dusk in a way no amount of tuning elsewhere could
     * reach: amber's gain had already fallen from 0.50 to 0.41 by the golden hour, which puts its
     * printed ceiling UNDER the 170 the census counts as a highlight, so no amber cell in the frame
     * could be hot however bright it was written. The measurement said 0.38% of cells hot at dusk
     * against 8.02% at night. Squared on top, because even direct sun takes a while to beat a neon
     * sign at close range. */
    var src = (c === 0 || c === 1 || c === 8 || c === 9);                   // amber azure warm ice
    var m = src ? sunMix * sunMix : mix;
    return EXPOSURE[c] + (EXPOSURE_DAY[c] - EXPOSURE[c]) * m;
  }

  // LUT[(bucket*12 + colour)*256 + lum] -> printed lum. 24 KB, rebuilt only when the day step moves.
  var LUT = new Uint8Array(DBUCKETS * PALETTE.length * 256);
  function buildLUT(mix, sunMix) {
    var np = PALETTE.length, t = LUT;
    var GM = GAMMA + (GAMMA_DAY - GAMMA) * mix;
    var KN = KNEE + (KNEE_DAY - KNEE) * mix;
    for (var b = 0; b < DBUCKETS; b++) {
      // bucket centre as a 0..1 depth fraction; the lift is retired linearly across it
      var df = (b + 0.5) / DBUCKETS;
      var gm = GM + (1 - GM) * df;
      for (var c = 0; c < np; c++) {
        var gain = ladder(c, mix, sunMix);
        for (var l = 0; l < 256; l++) {
          var x = l * gain / 255;
          /* A hard clamp here was quietly cancelling the whole point of EXPOSURE: a swatch
           * printed at 2.2 saturated everything over lum 116 to flat 255, so raising the gain
           * further bought no extra energy and only destroyed the modelling inside the sign.
           * The shoulder is an exponential rolloff that never reaches 1, so a swatch can be
           * pushed hard and still keep the difference between its bright and its brightest. */
          if (x > SHOULDER) x = SHOULDER + (1 - SHOULDER) * (1 - Math.exp(-(x - SHOULDER) / (1 - SHOULDER)));
          var k = x / KN; if (k > 1) k = 1;
          var y = Math.pow(x, gm) * (k * k * (3 - 2 * k));
          var v = (y * 255 + 0.5) | 0;
          t[(b * np + c) * 256 + l] = v > 255 ? 255 : v;
        }
      }
    }
  }
  buildLUT(0, 0);
  dayStep = 0;

  /* Called once per frame from Compose.post, before tone(). `mix` is the day/night blend the
   * daylight director publishes; everything else here is the quantiser. */
  function setDayMix(mix, sunMix) {
    if (!(mix >= 0)) mix = 0; else if (mix > 1) mix = 1;
    if (!(sunMix >= 0)) sunMix = 0; else if (sunMix > 1) sunMix = 1;
    /* Quantised on the PAIR, packed into one integer, so the table is still rebuilt only when the
     * light has actually moved a step rather than once per frame. */
    var step = Math.round(mix * DAY_STEPS) * (DAY_STEPS + 1) + Math.round(sunMix * DAY_STEPS);
    if (step === dayStep) return;
    dayStep = step;
    dayMix = Math.round(mix * DAY_STEPS) / DAY_STEPS;
    daySun = Math.round(sunMix * DAY_STEPS) / DAY_STEPS;
    buildLUT(dayMix, daySun);
  }

  var DSCALE = DBUCKETS / (FOG_END - FOG_START);

  function tone(f) {
    var n = f.n, lum = f.lum, col = f.col, dist = f.dist, ch = f.ch, np = PALETTE.length;
    for (var i = 0; i < n; i++) {
      var l = lum[i];
      if (l === 0 || ch[i] === 0) continue;
      var d = dist[i], b;
      // Sky carries Infinity and is not "far" in the fog sense — it is the backdrop, and it is
      // printed at the near end of the curve so the slot between the rooftops keeps its stars.
      //
      // This test has to come FIRST, and for two years of nobody reading it the comment above was
      // simply false: Infinity > FOG_START is true and Infinity < FOG_END is false, so every sky
      // cell fell through to the last bucket — the one place the gamma lift is fully retired —
      // and the backdrop was printed at the DARKEST setting on the curve rather than the
      // brightest. The slot between the rooftops had no stars because the print had taken them.
      // SKY_D also catches the sky elements (blimps, moon, aircraft), which carry a large finite
      // distance rather than Infinity so that they self-occlude against the world pass.
      if (d >= SKY_D) b = 0;
      else if (!(d > FOG_START)) b = 0;
      else if (!(d < FOG_END)) b = DBUCKETS - 1;
      else { b = ((d - FOG_START) * DSCALE) | 0; if (b > DBUCKETS - 1) b = DBUCKETS - 1; }
      lum[i] = LUT[((b * np + (col[i] % np)) << 8) + l];
    }
  }

  /* The frame's last stop before it is drawn. main.js and tools/headless.cjs both call
   * CC.Compose.post, which is precisely why the print lives behind that name — the offline
   * reference frame and the browser must be the same picture or verification means nothing.
   * A later src/compose.js taking this slot over MUST call CC.tone itself. */
  /* ---- the per-frame print hook ------------------------------------------------------------------
   * main.js and tools/headless.cjs have both always called this as `post(frame, cam, t)` while the
   * function took only `f` — the two extra arguments have been arriving and being dropped since the
   * day it was written. They are what the daylight cycle needs: the print ladder has to know what
   * time it is, and this is the one place in the pipeline that runs once per frame with the whole
   * frame in hand and nothing else to do.
   *
   * The DIRECTION it reads is `sky` rather than `sun`, and the difference matters at both ends of
   * the day. `sun` is direct light, which is zero for the whole of twilight — and twilight is not a
   * night frame: the sky is still the brightest thing in the world and the print has to be part way
   * up the day ladder to render it. `sky` is exactly that quantity.
   *
   * BOTH are passed, because they answer different questions and ladder() sorts them: a SURFACE
   * gains its daylight from the sky and a SOURCE loses its advantage only to the sun. See the note
   * on `sky` in daylight.js for why that parameter carries a misleading name on an airless world
   * and why it is still the right input here. */
  var Compose = {
    post: function (f, cam, t) {
      var D = CC && CC.Daylight;
      setDayMix(D ? D.P.sky : 0, D ? D.P.sun : 0);
      tone(f);
    }
  };

  /* HOW WIDE THE PAVEMENT IS, in metres from the building face to the kerb face, and it lives here
   * rather than in raycast.js because three files have to agree on it or the street comes apart:
   * raycast.js insets the carriageway by it (twice — once for the street the camera is in and once
   * for every junction mouth ahead of it), and street.js lays the crowd out against it. It was
   * written out as a literal 1.4 in all three, which is exactly the arrangement where one of them
   * gets changed and the kerb the pedestrians walk along stops being the kerb that is drawn.
   *
   * 2.15, up from 1.4. The kerb itself eats the first 0.34 m of it, so the walkable strip goes from
   * 1.06 m to 1.81 m — under two metres is still a narrow city pavement, but 1.06 m is narrower
   * than a doorway and it was the reason there was nowhere to put anything: a vending machine
   * standing 0.45 m off the wall and a bollard on the kerb line were the same object. */
  var PAVE = 2.15;

  return {
    PALETTE: PALETTE, P: P, GLYPHS: GLYPHS, g: g, GI: GI, PAVE: PAVE,
    tone: tone, Compose: Compose, EXPOSURE: EXPOSURE, EXPOSURE_DAY: EXPOSURE_DAY,
    setDayMix: setDayMix, get dayMix() { return dayMix; }, get daySun() { return daySun; },
    makeFrame: makeFrame, clearFrame: clearFrame, put: put, poke: poke,
    hash1: hash1, hash2: hash2, mulberry: mulberry,
    lerp: lerp, clamp: clamp, smooth: smooth, vnoise: vnoise,
    ELEMENTS: [], reducedMotion: false
  };
})();
if (typeof module !== 'undefined') module.exports = CC;
