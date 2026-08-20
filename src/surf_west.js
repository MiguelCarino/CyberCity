/* CyberCity frontier surfaces — the texture layer for the west, and the counterpart of
 * surfaces.js in every respect: same three entry points, same signatures, same output records,
 * same rule that nothing here may know about the camera. surfaces.js delegates to this file when
 * CC.World says west, which is why it does not re-implement fog(), configure() or cfg — those are
 * facts about a street and a print, not about a century, and both worlds share them.
 *
 * ---- THE HOUR, and it decides everything below --------------------------------------------------
 * It is the last twenty minutes of light. The sun is on or just under the horizon in the -x
 * direction and nothing in this world emits except lamps in windows, so the picture is built out
 * of exactly two things: which surfaces the low sun still reaches, and which do not.
 *
 * That is a choice with a reason. A frontier town at HIGH NOON is the postcard, and it is
 * unrenderable here: core.js prints a frame whose art direction is 55%+ pure black with a thin
 * scatter of bright glyphs, and a noon desert is the exact inverse — a full field of mid-tone with
 * no black in it at all. Every constant in the print, the bloom and the eleven optics passes is
 * fitted to the first picture, and the second one would come out of them as flat grey mush. Dusk
 * is the hour that is genuinely both: black ground, black timber, a sky with all the light in the
 * frame in it, and a hard warm rim down the west face of every building on the street. The whole
 * of this file is that one sentence, spent.
 *
 * ---- WHAT THE PALETTE IS ALLOWED TO DO ----------------------------------------------------------
 * No azure and no violet on any SURFACE. Both read as emitted light — they are the screen and the
 * tube, and they are what makes the city look like the city. Out here they appear in the sky and
 * nowhere else, azure as the cold top of the dome and violet as the earth-shadow band that sits
 * over the sunset for about ten minutes of real dusk and is the best thing in it.
 *
 * The working swatches are therefore amber (sunlit timber, the hot core of the sunset), ember
 * (dirt, rust, adobe, the sunset band), warm (lamplight through glass), white (planed board,
 * bone, dust), slate (everything the sun has left) and red (paint, the last of the sun on a high
 * rock). core.js's EXPOSURE weights matter here more than they do in the city, because the west
 * is drawing on the LOW half of that ladder: amber 0.50 and slate 0.60 are the only two weights
 * over 0.42 in the warm/neutral half, so those two carry the frame and everything else is a
 * garnish on them. Painting a whole dirt road in warm (0.32) is how you get a picture that is
 * correct and invisible.
 */
(function (CC) {
  'use strict';

  var P = CC.P, g = CC.g, hash2 = CC.hash2, clamp = CC.clamp, vnoise = CC.vnoise, smooth = CC.smooth;

  var G_DOT = g('.'), G_COMMA = g(','), G_COLON = g(':'), G_SEMI = g(';'), G_QUOTE = g("'"),
      G_TICK = g('`'), G_DASH = g('-'), G_UNDER = g('_'), G_EQ = g('='), G_TILDE = g('~'),
      G_PIPE = g('|'), G_SLASH = g('/'), G_PCT = g('%'), G_AMP = g('&'), G_8 = g('8'),
      G_0 = g('0'), G_o = g('o'), G_HASH = g('#'), G_PLUS = g('+'), G_STAR = g('*'),
      G_CARET = g('^'), G_DQ = g('"');

  /* The one thing this file and surfaces.js MUST agree on, because raycast.js configures only one
   * of them: the config block. Resolved lazily rather than captured, so load order cannot bite. */
  function cfg() { return CC.Surf ? CC.Surf.cfg : null; }

  /* ---- the sun ---------------------------------------------------------------------------------
   * A bearing in the same convention as everything else in the project: yaw 0 faces +z, so the
   * direction of bearing b is (sin b, cos b) and -PI/2 is straight down -x. It is a CONSTANT and
   * not a function of seed or time, and that is deliberate on both counts. Seeded, two cities on
   * neighbouring seeds would light from different sides and the piece would lose the one thing
   * that makes a low sun read as a low sun — that it is in the same place in every frame you have
   * ever seen of the place. Animated, the whole world would have to re-decide which side of the
   * street is lit, and every element that reads SUN would have to be told; dusk is twenty minutes
   * and this walk is shorter than that. */
  /* -0.5 rad, and the exact number is a composition rather than a preference. city.js runs its
   * avenues along +z and the walk spends most of its time on one, so the sun's bearing decides
   * three things at once and they have to be traded against each other:
   *
   *   at 0 the sun sits dead centre at the end of every avenue, which is the postcard — and it
   *   flattens the town, because both walls of the street then face the sun equally and the one
   *   effect worth having, a lit side and a dark side, disappears;
   *
   *   at -PI/2 the sun is square on to the street, the lit/dark split is at its strongest, and the
   *   sunset is 90 degrees off the walk — never in frame, since the fov is 1.25 rad;
   *
   *   at -0.5 it is 29 degrees off the axis, comfortably inside the 36-degree half-fov, so the burn
   *   is in the left of the frame while the right-hand row of buildings takes the light and the
   *   left-hand row goes to silhouette. That is the shot.
   */
  var SUN_AZ = -0.5;
  var SUN_X = Math.sin(SUN_AZ), SUN_Z = Math.cos(SUN_AZ), SUN_ALT = 0.16;

  /* ---- the sun moves now ------------------------------------------------------------------------
   * The paragraph this replaced argued that the bearing must NOT be animated — "the whole world
   * would have to re-decide which side of the street is lit, and every element that reads SUN would
   * have to be told; dusk is twenty minutes and this walk is shorter than that". Both halves of
   * that were true and neither is any more. The world now HAS a clock, and re-deciding which side
   * of the street is lit as the day turns is not a cost of the feature, it is the feature: a
   * shadow that swings from one side of the road to the other over seven minutes is the single
   * most legible thing a day/night cycle can do in a frame made of characters.
   *
   * The five readers were told, and they were told in one place. west_town.js's litFace,
   * west_range.js's litFace, west_sky.js's sunAz and the two inside this file all go through
   * SUN_X/SUN_Z/SUN_AZ, which are now module variables refreshed once per frame from CC.Daylight
   * rather than constants — and they are re-exported as GETTERS, so every one of those call sites
   * kept working without being edited. */
  function dayAt(t) {
    if (t === dT) return;
    dT = t;
    var D = CC.Daylight;
    if (!D) return;                     // standalone require: hold the tuned dusk
    SUN_AZ = D.P.az; SUN_ALT = D.P.alt;
    SUN_X = Math.sin(SUN_AZ); SUN_Z = Math.cos(SUN_AZ);
    dSun = D.P.sun; dSky = D.P.sky; dWarm = D.P.warm; dLamp = D.P.lamp; dStar = D.P.star;
    dFill = smooth(clamp((dSky - 0.70) / 0.30, 0, 1));
  }
  /* dFill's standalone default is 0 and not smooth((0.66-0.70)/0.30) rounded up to something
   * plausible: the tuned hour this row of defaults exists to hold IS dusk, and dusk's fill is
   * exactly zero. It also has to be zero for a second reason. surfaces.js reads fogStart/fogPow off
   * this module inside refog(), which weatherAt() calls from beginFrame() BEFORE any painter has
   * run, so on frame 0 the ramp is built from whatever dFill happens to be — and a default of 0.062
   * moved five cells of the night reference frame through the exposure element's adaptation. Every
   * later frame reads a dFill that is one frame stale, which is 1/60 s of a 420 s clock and cannot
   * be seen. */
  var dT = 1 / 0, dSun = 0.64, dSky = 0.66, dWarm = 0.74, dLamp = 1, dStar = 0, dFill = 0;
  function dAlt() { return SUN_ALT; }

  /* ---- HOW MUCH DAY IS IN THE FRAME, and it is deliberately not dSky ----------------------------
   * Everything below that FILLS a surface — a wall, the road, the dome — is gated on this one
   * number, and it exists because the two things the gate has to do pull in opposite directions.
   *
   * The tuned baseline of this world is night and dusk. Night is a hard invariant (the project's
   * rule is that every daylight scale must be the identity at night) but DUSK is the world's
   * signature hour and it is not allowed to get muddier either — and dusk is not dark: the clock
   * reports sky 0.657 and sun 0.644 at the dusk stop, two thirds of the way to noon on both. Gating
   * on dSky raw would therefore have poured two thirds of the day treatment into the one hour that
   * was already right.
   *
   * So the fill is dSky pushed through a threshold and a smoothstep. The clock reports dSky at the
   * six stops it names as 0.000 night, 0.657 dawn AND dusk, 0.929 morning and afternoon, 1.000
   * noon, so the threshold decides exactly one thing: whether the two tuned hours get any of this
   * at all. Measured:
   *     threshold   night   dawn/dusk   morning   noon
   *       0.60      0.000     0.055      0.926    1.000
   *       0.70      0.000     0.000      0.840    1.000
   * 0.60 looked safe — a twentieth is under the dither's own noise floor — and it was not. Rendered
   * and censused at seed 42 frame 300, dusk moved blank 48.0% -> 41.7% and muddy 46.3% -> 51.6%,
   * because a twentieth of the fill is applied to EVERY blank cell of every wall, road and sky in
   * the frame and there are a great many of them. Dusk is this world's signature hour and the brief
   * for this pass is that it must not get muddier, so the threshold goes above dawn and dusk
   * outright: at 0.70 both are byte-identical to the shipped build, the same guarantee night has,
   * and the whole transition happens in the unnamed hours between dusk and morning where nothing is
   * fitted. Rejected 0.90, which leaves morning at 0.13 — the brightest hour of the day still
   * empty, and the entire crossover crammed into the twenty minutes before noon.
   *
   * It is a SLOW, CONTINUOUS ramp — the clock's cycle is 420 s, so the crossing takes about ninety
   * seconds of wall time — and it is only ever used as a DITHER PROBABILITY, never as a brightness
   * step. That matters for the photosensitivity gate: a wall does not switch on, it dissolves in a
   * few cells at a time, and no single cell changes more than once on the way through. */

  /* ---- WHAT A MATERIAL LOOKS LIKE IN DAYLIGHT --------------------------------------------------
   * city.js hands `hue` as a claim about SUBSTANCE now — sand, white, timber, stone or ember — and
   * this is the file that has to turn substance into ink. The line it replaced was a whitelist,
   *     var litHue = (hue === P.warm || hue === P.white || hue === P.ember) ? hue : P.amber;
   * written when the only surface swatches in the palette were the city's; every material city.js
   * has since learned to name fell off it and collapsed to amber. That one expression is why the
   * frontier census was byte-for-byte identical before and after the new district table landed, and
   * it is the whole of the "daylight is empty" complaint in a single line of code.
   *
   * THREE SWATCHES PER MATERIAL, because a board wall is never one colour and a flood fill in one
   * swatch is worse than a blank wall — it is a blank wall with a tint. The three are the planks
   * that took the sun, the ones that are dusty or split or sit a degree proud, and the ones with
   * only sky on them:
   *   SUN  direct sun. The pale end: sand (day ceiling 190) and white (151) are the only two
   *        swatches in the table that can carry a large bright surface at noon.
   *   MID  the broken half-tone. It is the swatch that carries the BROWNS and the GREYS the
   *        complaint asks for, and it is where the first cut of this table went wrong: timber's MID
   *        was timber, so a boards quarter — 24% of the frontier's lots lead on timber — printed
   *        2099 of a noon frame's 4231 facade cells in one swatch whose day ceiling is 120, and the
   *        whole middle of the picture came out as one dark brown band. Weathered board in full
   *        daylight is SILVER, not brown; the brown is what it is in shade. So MID is stone
   *        (ceiling 145) and SHD keeps timber, which is the same three-swatch story told the right
   *        way round.
   *   SHD  the same material with the sky on it and no sun. Never `shadow`: core.js lifts shadow
   *        from 0.80 to 0.46 by day precisely because a shadow under a bright hemisphere is filled,
   *        so the shade side of a timber wall is dark brown (timber, ceiling 120) or blue-grey
   *        (indigo, 104) and not a hole. It is also the row to be MEANEST with, because it is the
   *        one the largest share of cells lands on: sand leads 39.8% of the frontier's lots and its
   *        SHD was timber first, which put 2084 of a noon frame's 4231 facade cells into a swatch
   *        printing a mean max-channel of 54 — half the town, in the dark. It is stone now, which
   *        is what a pale wall in shade under a blue sky actually is; the browns come from the two
   *        rows that are genuinely brown.
   *
   * Twenty rows and not five, indexed by palette slot rather than by district, because a hue this
   * file has not been told about has to degrade to the nearest material rather than to `undefined`
   * — which is the fault surfaces.js's L_LOW/L_LIT/L_HOT carry to this day. Rows 0-11 can only be
   * reached through a theme edit; they are filled with the frontier material each legacy swatch
   * most resembles so that such an edit degrades quietly. */
  var MAT_SUN = [
    /*  0 amber  */ P.sand,  /*  1 azure  */ P.white, /*  2 ember  */ P.ember, /*  3 spring */ P.moss,
    /*  4 violet */ P.stone, /*  5 white  */ P.white, /*  6 red    */ P.ember, /*  7 slate  */ P.stone,
    /*  8 warm   */ P.sand,  /*  9 ice    */ P.white, /* 10 pure   */ P.white, /* 11 shadow */ P.stone,
    /* 12 stone  */ P.stone, /* 13 timber */ P.sand,  /* 14 sand   */ P.sand,  /* 15 jade   */ P.jade,
    /* 16 rose   */ P.sand,  /* 17 gold   */ P.gold,  /* 18 moss   */ P.moss,  /* 19 indigo */ P.stone
  ];
  var MAT_MID = [
    /*  0 amber  */ P.sand,  /*  1 azure  */ P.stone, /*  2 ember  */ P.timber, /*  3 spring */ P.moss,
    /*  4 violet */ P.indigo,/*  5 white  */ P.sand,  /*  6 red    */ P.timber, /*  7 slate  */ P.stone,
    /*  8 warm   */ P.sand,  /*  9 ice    */ P.stone, /* 10 pure   */ P.sand,   /* 11 shadow */ P.timber,
    /* 12 stone  */ P.stone, /* 13 timber */ P.stone, /* 14 sand   */ P.timber, /* 15 jade   */ P.moss,
    /* 16 rose   */ P.timber,/* 17 gold   */ P.sand,  /* 18 moss   */ P.moss,   /* 19 indigo */ P.indigo
  ];
  var MAT_SHD = [
    /*  0 amber  */ P.timber,/*  1 azure  */ P.indigo,/*  2 ember  */ P.timber, /*  3 spring */ P.moss,
    /*  4 violet */ P.indigo,/*  5 white  */ P.stone, /*  6 red    */ P.timber, /*  7 slate  */ P.indigo,
    /*  8 warm   */ P.timber,/*  9 ice    */ P.stone, /* 10 pure   */ P.stone,  /* 11 shadow */ P.indigo,
    /* 12 stone  */ P.indigo,/* 13 timber */ P.timber,/* 14 sand   */ P.stone,  /* 15 jade   */ P.indigo,
    /* 16 rose   */ P.timber,/* 17 gold   */ P.timber,/* 18 moss   */ P.moss,   /* 19 indigo */ P.indigo
  ];

  /* How much of the last light a face gets, by which way it points. CONTINUOUS rather than three
   * buckets, and that is a repair rather than a refinement: with the sun off-axis the two street
   * walls sit at +-0.48 of the sun vector, so a three-bucket version with its thresholds at +-0.5
   * put BOTH of them in the middle bucket and the lit/dark split that the whole angle was chosen
   * for did not happen at all. The curve is deliberately steep at the middle (the 0.62 slope
   * pushes +-0.48 apart to 0.20 and 0.80) and it never reaches zero: an unlit face is 10% lit, not
   * black, because a wall with nothing on it whatsoever stops reading as a wall and becomes a hole
   * in the frame.
   *
   * ---- AND NOW IT HAS AN ELEVATION TERM, which is what turns a fixed dusk into a day ------------
   * Three things change with the sun's height and all three are what the eye reads a time of day
   * off:
   *   the AZIMUTH SPLIT COLLAPSES toward noon. At 54 degrees up the light comes from above rather
   *     than from the side, so both walls of a street are lit and the difference between them is
   *     small — which is exactly why noon is the least interesting hour and why ALT_MAX is 54 and
   *     not 90. `split` runs 1 at the horizon to 0.35 overhead.
   *   the WHOLE LEVEL follows the sun. `dSun` is 0 at night, so at night this returns nothing but
   *     the ambient floor and the town is lit by its lamps alone, which is the correct picture and
   *     the one this world never had.
   *   the AMBIENT FLOOR is the SKY, not a constant. At noon a shadowed wall is filled by a very
   *     bright hemisphere and is nowhere near black; at midnight there is nothing to fill it with.
   *     That floor is what stops a daylight frame reading as cut-out paper. */
  var SUN_FRONT = 1.00, SUN_BACK = 0.10, SUN_SIDE = 0.42;
  function sunOf(cell) {
    /* THE AMBIENT FLOOR IS THE SKY, and it is deliberately mean. A shadow at noon under a bright
     * hemisphere is filled — that is what stops a daylight frame reading as cut-out paper — but the
     * first cut put the floor at 0.36 at noon and the consequence was that NOTHING in a midday
     * frame was dark: every surface sat inside a stop of every other and the picture came out as
     * one field of mid-tone, which the print counts as 55% muddy. Halving it puts the shadow side
     * of the street back under the lit side by a factor of three, which is roughly what a
     * photograph of a sunlit street shows and is the difference between a picture with modelling
     * in it and a texture. */
    var floor = 0.05 + 0.16 * dSky;
    if (!cell || cell.faceX === undefined) return floor + (SUN_SIDE - 0.10) * dSun;
    /* The face crossed by a ray stepping +side has its outward normal pointing -side. */
    var nx = cell.faceX ? -cell.side : 0, nz = cell.faceX ? 0 : -cell.side;
    var d = nx * SUN_X + nz * SUN_Z;
    var split = 1 - 0.65 * clamp(SUN_ALT / 0.95, 0, 1);
    var f = clamp(0.5 + 0.62 * d * split, 0, 1);
    /* THE SQUARE ROOT IS THE DIFFERENCE BETWEEN A LIGHT LEVEL AND A LIT SURFACE. `dSun` is how much
     * direct light there IS, which falls to 0.64 at the golden hour — and scaling a surface by it
     * linearly made the frontier's best hour a third darker than the fixed dusk this world was
     * originally tuned as. A surface's apparent brightness is not linear in illuminance and the
     * eye's is less linear still; sqrt puts 0.64 back at 0.80 and leaves 0 at 0, which keeps the
     * night honest while giving the tuned hour its look back. */
    var direct = (SUN_FRONT - SUN_BACK) * f * f * (3 - 2 * f) * Math.sqrt(dSun);
    /* A roof-facing surface takes the sun almost regardless of bearing once it is high; a wall
     * takes the cosine. The 0.42 is the share of the vertical component a vertical face keeps. */
    return clamp(floor + direct * (0.42 + 0.58 * (1 - clamp(SUN_ALT / 0.95, 0, 1))) +
                 dSun * 0.34 * clamp(SUN_ALT / 0.95, 0, 1), 0, 1.25);
  }

  /* ---- weather, sampled once per frame ---------------------------------------------------------
   * Same cache-on-t trick and the same rel() migration rule as surfaces.js: 1.0 is the look the
   * build was tuned under, so a constant multiplied by rel('wet') keeps its value until the
   * weather actually moves. `dust` has no equivalent in the city and is read raw off P.haze,
   * because there is no reference value for it to be relative to — the frontier invented it. */
  var wT = 1 / 0, wWet = 1, wRain = 1, wWind = 1, wDust = 0.3, wCloud = 0.1;
  function weatherAt(t) {
    if (t === wT) return;
    wT = t;
    var W = CC.Weather;
    if (!W) return;
    wWet = W.rel('wet'); wRain = W.rel('rain'); wWind = W.rel('wind');
    wDust = W.P.haze; wCloud = W.P.cloud;
  }

  /* ---- cell metadata, defensively --------------------------------------------------------------
   * Same contract as surfaces.js: city.js owns the record, this file must degrade rather than
   * throw on a field that is not there. */
  function seedOf(cell) {
    if (!cell || typeof cell !== 'object') return 0;
    if (cell.seed !== undefined) return cell.seed | 0;
    return 0;
  }

  /* ---- what a wall is made of ------------------------------------------------------------------
   * Indexed by the style city.js rolled. `lap` is the board pitch in metres and it is the single
   * most visible number in the file: it is the rhythm the eye reads a timber wall by, and at 0.34
   * a two-storey front carries about twenty lines, which is what a photograph of one has.
   *
   * `bay` is the frontage each opening owns. A frontier storefront is ONE door and ONE big window
   * in 4-6 m, against the city's punched grid at 2-4 — the openings are fewer, bigger and lower,
   * and that proportion is most of what says "1880" rather than "2080".
   *
   * `rough` turns the boards off: adobe and fieldstone are not clad, they are mottled, so those
   * two draw a noise field instead of a rhythm and get their own glyph set. */
  var STYLE_W = [
    /* 0 clapboard  */ { lap: 0.34, bay: 4.4, gnd: 2.90, up: 2.55, winW: 1.05, winH: 1.35,
                         shopW: 2.30, shopH: 1.75, rough: 0, vert: 0 },
    /* 1 batten     */ { lap: 0.62, bay: 5.2, gnd: 3.20, up: 2.70, winW: 0.90, winH: 1.20,
                         shopW: 1.90, shopH: 1.60, rough: 0, vert: 1 },
    /* 2 falsefront */ { lap: 0.28, bay: 4.0, gnd: 3.05, up: 2.60, winW: 1.20, winH: 1.50,
                         shopW: 2.60, shopH: 1.95, rough: 0, vert: 0 },
    /* 3 adobe      */ { lap: 0.90, bay: 5.0, gnd: 2.60, up: 2.30, winW: 0.75, winH: 0.95,
                         shopW: 1.10, shopH: 1.20, rough: 1, vert: 0 },
    /* 4 fieldstone */ { lap: 0.50, bay: 4.6, gnd: 2.85, up: 2.45, winW: 0.85, winH: 1.10,
                         shopW: 1.40, shopH: 1.45, rough: 1, vert: 0 },
    /* 5 log        */ { lap: 0.42, bay: 5.6, gnd: 2.70, up: 2.40, winW: 0.80, winH: 1.05,
                         shopW: 1.30, shopH: 1.35, rough: 0, vert: 0 }
  ];

  /* ---- THE INK RAMP -----------------------------------------------------------------------------
   * A glyph is not a pixel, and this is the one place in the project where that bites hardest.
   *
   * Measured, by rasterising every entry of core.js's GLYPHS at the size the print uses (Liberation
   * Mono Bold at 15 px in a 9x16 cell, which is what tools/topng.py draws and what
   * render_canvas.js's atlas bakes) and taking the mean alpha:
   *     '`' 2.6%   '.' 3.0%   '_' 4.4%   '-' 5.3%   ':' 5.9%   ',' 6.2%   '~' 8.6%   ';' 9.2%
   *     '"' 12.1%  '+' 15.5%  '=' 17.1%  '|' 18.7%  '#' 23.9%  '%' 27.1%  '8' 31.6%  'Q' 38.4%
   * So two cells written at the same lum in the same swatch can differ by a factor of TEN in what
   * the eye actually receives, and every measurement this file has ever taken — muddy, hot, lit —
   * is blind to it, because they all count lum and swatch and nothing counts area.
   *
   * That is the whole of the "daylight is empty" complaint. The night look is built out of '-',
   * '_', '`' and '.' — 2.6 to 5.3 per cent ink — and it is CORRECT: a dark frame wants thin ink and
   * a scatter of it. The first cut of this day pass filled the walls, filled the road and filled the
   * sky in the same four glyphs at three times the lum, and the census scored the result 45.2% lit
   * and 10.5% hot while the picture on screen was still black. 45% of a frame at 4% ink is 1.8% of
   * the frame's area with anything on it at all.
   *
   * So a daylight surface picks its glyph off this ramp instead, keyed on its own tone. The heavy
   * end stops at '%' (27.1%) rather than going on to '8', 'M' or 'Q': those three are already
   * spoken for in this world — '8' and 'o' are a lit window and a stone in the road, and reading a
   * wall in them would say "there is a lamp in it" — and past about 30% ink the bloom in
   * render_canvas.js starts to weld neighbouring cells into a solid block.
   *
   * NOT A FLICKER RISK, and the arithmetic matters: within one surface the ramp index moves by at
   * most three steps (about 12% ink to 27%, under 2x), because the spread term below is +-0.15 of
   * the ramp. The step this file actually has to fear is surface-to-blank, and filling the surface
   * is what removes it. */
  var INK = [G_TICK, G_DOT, G_UNDER, G_DASH, G_COLON, G_TILDE, G_DQ, G_PLUS, G_EQ, G_HASH, G_PCT];
  function ink(t) {
    var i = (t * 11) | 0;
    return INK[i < 0 ? 0 : (i > 10 ? 10 : i)];
  }

  var FOUT = { ch: 0, col: 0, lum: 0 };
  function fset(ch, col, lum) {
    FOUT.ch = ch; FOUT.col = col;
    FOUT.lum = lum < 0 ? 0 : (lum > 255 ? 255 : lum | 0);
    return FOUT;
  }

  /* Weathering at ~9 cm: knots, nail bleed, the dark run under a leaking gutter. Keyed on
   * quantised WORLD coordinates so it is welded to the building, exactly as the city's grain is. */
  function grain(u, v, sd, lod) {
    if (lod < 2) return 1;
    var h = hash2(Math.floor(u * 11), Math.floor(v * 11), sd ^ 0x6A11);
    return h < 0.14 ? 0.34 : 0.72 + h * 0.56;
  }

  /* ---- rock ------------------------------------------------------------------------------------
   * A butte is the one thing in either world that is not built, and it gets its own branch rather
   * than a style row because nothing about a wall applies to it: no bays, no openings, no lap, no
   * ground floor. What it has is BEDDING — horizontal strata a metre or two thick, each one a
   * slightly different colour of the same rock — and vertical erosion channels cut down the face.
   * Those two crossing rhythms are the whole read, and they are why a butte at 80 m is a butte and
   * not a brown building.
   *
   * The top two rows catch the sun after the town has lost it, which is the reason to have rock in
   * this world at all: it is the only thing tall enough to still be lit, and a lit rim at the top
   * of an otherwise black silhouette is what tells you how low the sun is. */
  function rockFace(u, v, cell, dist, sd) {
    var h = cell && cell.h ? cell.h : 12;
    var lod = dist < 26 ? 2 : (dist < 60 ? 1 : 0);
    var sun = sunOf(cell);

    /* Strata. The band boundary wanders with u so the beds are not ruled lines — a ruled line
     * reads as masonry, and the whole point is that this is not masonry. */
    var wob = vnoise(u * 0.10 + sd * 0.017, 0x7A) * 1.3;
    var bandF = (v + wob) / 1.55;
    var band = Math.floor(bandF), inB = bandF - band;
    var bh = hash2(band, sd & 1023, 0x51C);

    /* Erosion channels: whole vertical strips of face turned away from the light. */
    var chan = hash2(Math.floor(u * 0.55), 0, sd ^ 0x2C4);
    var shade = chan < 0.22 ? 0.42 : (chan < 0.36 ? 0.72 : 1);

    /* The lit crest. `h` is this column's own height, so a stepped butte lights every step. */
    var crest = h - v;
    if (crest < 0.9) {
      var k = 1 - crest / 0.9;
      return fset(inB < 0.5 ? G_PCT : G_AMP, sun > 0.6 ? P.amber : P.ember,
                  (26 + 88 * k) * (0.5 + 0.5 * sun) * shade);
    }

    /* The bed line itself is the only guaranteed ink; the body of a bed is mostly blank, which is
     * what keeps a 30 m rock from being 30 m of muddy fill. */
    if (inB < 0.13) {
      return fset(bh < 0.5 ? G_DASH : G_UNDER, P.slate,
                  (13 + bh * 15) * shade * (0.55 + 0.45 * sun));
    }
    /* THE BODY OF A BED IS MOSTLY BLANK AT NIGHT AND SOLID BY DAY, for the reason the wall one
     * function down spends a paragraph on: 30 m of dim glyphs is 30 m of muddy band after dark, and
     * 30 m of black is a hole cut in a bright sky at noon. A butte is the largest single object
     * this world contains and it is the one that suffers most from being drawn as a rhythm.
     *
     * The swatch is the rock's own: stone for the shaded and grey beds, ember and timber for the
     * red ones, sand where the sun is square on. That is a red-rock country in three swatches and
     * it is the range the complaint asks for. */
    var rd = 0.20 + 0.12 * bh;
    rd += (0.95 - rd) * dFill;
    if (lod > 0 && hash2(Math.floor(u * 3.1), Math.floor(v * 2.7), sd ^ 0x9B) < rd) {
      var rn = (10 + bh * 16) * shade * (0.5 + 0.5 * sun);
      var rday = (30 + 150 * sun * sun + bh * 40) * shade;
      var rcol = P.slate;
      if (dFill > 0.002 && hash2(Math.floor(u * 1.9), Math.floor(v * 1.9), sd ^ 0x7D3) < dFill)
        rcol = sun > 0.66 && bh > 0.55 ? (bh > 0.80 ? P.sand : P.ember)
                                       : (bh < 0.30 ? P.timber : P.stone);
      else if (sun > 0.6 && bh > 0.6) rcol = P.ember;
      return fset(bh < 0.4 ? G_COLON : (bh < 0.75 ? G_PCT : G_AMP), rcol,
                  rn + (rday - rn) * dFill);
    }
    return fset(0, P.shadow, 0);
  }

  /* ---- facade ----------------------------------------------------------------------------------
   * u = metres along the wall, v = metres up from the street. Every hash is keyed on the bay index
   * and the building seed and never on u/v directly — a facade whose windows re-roll as you walk
   * destroys the illusion faster than any other error available. */
  function facade(u, v, cell, dist, t) {
    if (v < 0) v = 0;
    weatherAt(t === undefined ? 0 : t); dayAt(t === undefined ? 0 : t);
    var sd = seedOf(cell);
    if (cell && cell.style === 6) return rockFace(u, v, cell, dist, sd);

    var st = STYLE_W[cell ? (((cell.style | 0) % 6 + 6) % 6) : 0];
    var h = cell && cell.h ? cell.h : 6;
    var lit = cell && typeof cell.litRate === 'number' ? cell.litRate : 0.1;
    var hue = cell && typeof cell.hue === 'number' ? cell.hue : P.slate;
    var accent = cell && typeof cell.accent === 'number' ? cell.accent : P.warm;
    var sun = sunOf(cell);
    var lod = dist < 20 ? 2 : (dist < 46 ? 1 : 0);
    var gr = grain(u, v, sd, lod);

    /* The sunlit swatch of THIS building. A frontier wall is bare wood going silver, painted
     * board, or mud — so the lit colour is the district's hue where that hue is a surface colour,
     * and amber where it is not. Amber is doing double duty as "sunlight on timber", which is what
     * it is: the swatch is 216,232,74 and low sun on weathered pine is very close to it.
     *
     * ---- AND BY DAY IT IS THE MATERIAL, dithered across ------------------------------------------
     * Amber goes back to meaning LOW SUN ON A SURFACE, which is the only thing it was ever right
     * for: 216,232,74 is close to weathered pine at four degrees of elevation and nothing like it
     * at fifty. So the choice between the old answer and the material is made PER CELL against
     * dFill, on a hash keyed to the wall the way every other hash in this function is. At dFill 0
     * every cell takes the old answer and the night frame is unchanged by construction; at dFill 1
     * every cell takes the material; in between the wall dissolves from one to the other. That is
     * the only cross-fade available — this renderer cannot blend two palette indices, so the dither
     * does the mixing, exactly as sky() below already does it between its two ladders.
     *
     * `ms` is the same hash renormalised over the cells that have crossed over, which makes it a
     * free second uniform variate rather than a second hash: dividing by dFill maps [0,dFill) onto
     * [0,1). It is what picks between the three material swatches below. */
    var mh = hash2(Math.floor(u * 3.1), Math.floor(v * 3.1), sd ^ 0x1D5);
    var dayMat = mh < dFill;
    var ms = dFill > 0.002 ? mh / dFill : 0;

    /* WHERE THIS FACE SITS BETWEEN SHADE AND SUN, as a ramp and not a threshold. `sun >= 0.62`
     * elsewhere in this file is a whole wall changing swatch at one instant of the clock — which is
     * the large-area step the photosensitivity gate exists to catch, and it is tolerable only
     * because at dusk the two sides of the street are nowhere near the threshold. The day branch
     * must not add another one, so the three material swatches are dithered on `k` instead and the
     * wall crosses over a few cells at a time as the sun climbs.
     *
     * The share of SUN cells is k*k rather than k: a wall at half illumination is not half covered
     * in highlight, it is mostly its own colour with the sun catching the proud edges. MID never
     * drops below a quarter, so even a fully shaded wall keeps some broken tone in it and does not
     * read as one flat swatch. */
    var k = clamp((sun - 0.22) / 0.52, 0, 1);
    var mat = ms < 0.72 * k * k ? MAT_SUN[hue]
            : (ms < 0.72 * k * k + 0.24 + 0.20 * k ? MAT_MID[hue] : MAT_SHD[hue]);

    var litHue = dayMat ? mat
               : ((hue === P.warm || hue === P.white || hue === P.ember) ? hue : P.amber);
    var sunHue = dayMat ? mat : (sun >= 0.62 ? P.amber : litHue);
    /* The swatch every "in shade" branch below reaches for. slate at night, because slate IS the
     * night's shade swatch and the whole tuned frame is built on it; the material's own shade by
     * day, because a shaded wall at noon is a dark BROWN wall and not a blue-grey one. */
    var shdHue = dayMat ? MAT_SHD[hue] : P.slate;

    /* ---- the coping ---------------------------------------------------------------------------
     * The top 30 cm of a false front is a capping board, and it is the single most valuable line
     * in the world: it is the roofline, and a roofline is what turns a black shape into a
     * building. It is drawn at every distance and every LOD for that reason. */
    if (h - v < 0.34) {
      return fset(G_EQ, sun >= 0.62 ? sunHue : (sun > 0.30 ? litHue : shdHue),
                  (sun >= 0.62 ? 214 : (sun > 0.30 ? 82 : 32)) * gr);
    }
    /* And the shadow it throws — one board's worth of dark immediately under it, which is what
     * makes the coping read as PROUD of the wall rather than painted on it.
     *
     * BY DAY IT IS ALSO THE WEATHERING RUN. Everything that has ever come off that capping board
     * has run down the two feet under it, so this is the dirtiest band on the building and it is
     * STREAKED rather than flat: the hash is keyed on u alone, so a column is either running or it
     * is not and the band comes out as vertical stains. It stays the darkest band on the wall,
     * which is the whole job of the line it replaced. */
    if (h - v < 0.62) {
      if (dFill <= 0.002) return fset(0, P.shadow, 0);
      var wr = hash2(Math.floor(u * 4.3), 0, sd ^ 0x3E9);
      if (wr > 0.86 * dFill) return fset(0, P.shadow, 0);
      return fset(wr < 0.30 ? G_PIPE : G_COLON, wr < 0.50 ? P.timber : shdHue,
                  (12 + 54 * sun) * gr);
    }

    var bay = Math.floor(u / st.bay), fu = u / st.bay - bay;
    var bh = hash2(bay, sd, 0x3F1);              // this bay's identity, stable forever

    /* ---- the porch line -----------------------------------------------------------------------
     * Where the awning meets the wall. Above it the building; below it, shopfront in the shade of
     * its own porch. The dark band is the shadow line and it is what separates the two storeys
     * without drawing a cornice on a building that would never have had one. */
    if (v > st.gnd && v < st.gnd + 0.30) {
      if (dFill <= 0.002) return fset(0, P.shadow, 0);
      /* By day the deepest shadow on the building is still not a hole — core.js lifts `shadow`
       * from 0.80 to 0.46 by day for exactly this reason — so the porch line is drawn in indigo,
       * the palette's own "shade with the sky in it", at a lum well under the wall either side of
       * it. It has to stay the darkest thing at that height or the two storeys merge. */
      var pz = hash2(Math.floor(u * 3.3), Math.floor(v * 6), sd ^ 0x91);
      if (pz > 0.82 * dFill) return fset(0, P.shadow, 0);
      return fset(pz < 0.5 ? G_UNDER : G_DASH, P.indigo, (14 + 38 * dSky) * gr);
    }
    if (v > st.gnd + 0.30 && v < st.gnd + 0.52)
      return fset(G_DASH, sun >= 0.62 ? sunHue : shdHue, (sun >= 0.62 ? 74 : 22) * gr);

    /* ---- ground floor: the shopfront ---------------------------------------------------------- */
    if (v <= st.gnd) {
      /* A door and a window per bay, the door on whichever side this bay's hash puts it. Both are
       * held clear of the bay edges so two neighbouring bays never merge into one opening. */
      var doorL = bh < 0.5;
      var dw = 0.34, ww = st.shopW / st.bay;
      var d0 = doorL ? 0.10 : 0.86 - dw, d1 = d0 + dw;
      var w0 = doorL ? 0.52 : 0.10, w1 = w0 + ww; if (w1 > 0.90) w1 = 0.90;

      /* IS THERE ANYBODY IN. The city's shopfronts are open at a flat rate because a city is open;
       * out here it is the district's own lit rate, tripled, because a ground floor is where the
       * lamp is — an upstairs room lit at this hour is the exception and a lit bar is not. */
      var open = hash2(bay, sd, 0x5E1) < clamp(lit * 3.1, 0.05, 0.62);

      if (v < 2.15 && fu > d0 && fu < d1) {
        /* The doorway. Open ones are a slot of lamplight with a dark head above; shut ones are
         * boards, and the frame is the only thing that reads. */
        if (fu - d0 < 0.05 || d1 - fu < 0.05 || v > 2.02)
          return fset(G_PIPE, shdHue, (20 + 44 * dFill * sun) * gr);
        if (open && dFill > 0.002 &&
            hash2(Math.floor(u * 3.9), Math.floor(v * 3.9), sd ^ 0x2E7) < dFill) {
          /* AN OPEN DOOR AT NOON IS A HOLE, and that is the whole inversion. At dusk it is a slot
           * of lamplight and the brightest thing at street level; at midday the room behind it is
           * three or four stops under the street, so it is the DARKEST rectangle on the building.
           * Getting this the wrong way round is what a lamp burning at noon looks like. A little of
           * the floor just inside the threshold catches the light off the road, and that one bright
           * line at the bottom is what stops the doorway reading as a painted black rectangle. */
          var dv2 = 1 - v / 2.15;
          return fset(v < 0.30 ? G_EQ : (dv2 > 0.62 ? G_COLON : G_DOT),
                      v < 0.30 ? P.timber : P.indigo,
                      v < 0.30 ? 96 : (34 + 44 * dv2) * (0.5 + 0.5 * dSky));
        }
        if (!open) {
          /* A shut door by day is a panelled or ledged door in the porch's shade: vertical boards
           * with a rail across them, and dark, because it is under the awning at every hour the
           * sun is up. It was a hole, and a hole in the middle of a shopfront is the one place the
           * eye goes. */
          if (dFill <= 0.002) return fset(0, P.shadow, 0);
          var dz = (fu - d0) / dw * 5;
          return fset(Math.abs(v - 1.18) < 0.09 ? G_EQ : (dz - Math.floor(dz) < 0.16 ? G_PIPE : G_UNDER),
                      P.timber, (16 + 66 * sun) * gr);
        }
        var dk = 1 - v / 2.15;
        return fset(v < 0.35 ? G_UNDER : G_8, P.warm, (96 + 74 * dk) * (0.7 + 0.5 * gr));
      }

      var wv0 = 0.80, wv1 = wv0 + st.shopH;
      if (v > wv0 && v < wv1 && fu > w0 && fu < w1) {
        /* Glass. The frame first — a shopfront is a big pane in a heavy timber surround and the
         * surround is what carries the shape at distance. */
        if (v - wv0 < 0.14 || wv1 - v < 0.14 || fu - w0 < 0.04 || w1 - fu < 0.04)
          return fset(G_EQ, sun >= 0.62 ? P.white : (dayMat ? P.white : P.slate),
                      ((sun >= 0.62 ? 66 : 26) + 78 * dFill * sun) * gr);
        if (!open) {
          /* Shuttered: boards nailed across, which is a diagonal, and the one place a diagonal
           * belongs on this facade. */
          var bd = Math.floor((v * 1.6 + fu * 2.2) * 2.4);
          if (bd & 1) return fset(G_SLASH, dayMat ? P.timber : P.slate,
                                  (15 + 74 * dFill * sun) * gr);
          /* The dark between the nailed boards is the empty shop behind the glass, and by day that
           * is a deep reflection of the street rather than nothing at all. */
          return dFill <= 0.002 ? fset(0, P.shadow, 0)
                                : fset(G_DOT, P.indigo, (10 + 44 * dSky) * gr);
        }
        /* Lit: a warm field with a mullion up the middle and the goods in the window reading as
         * broken dark. Held at lum 120-190 — warm's EXPOSURE weight is 0.32, so this lands in the
         * 130-165 print band that market.js measured as free on both the muddy and the hot count. */
        var mull = Math.abs(fu - (w0 + w1) * 0.5) < 0.022;
        if (mull) return fset(G_PIPE, shdHue, 30 + 52 * dFill * sun);
        var gl = hash2(Math.floor(u * 2.6), Math.floor(v * 2.6), sd ^ 0x77);
        /* ---- AND BY DAY THE PANE IS A MIRROR, NOT A LAMP -------------------------------------
         * What follows is a lit shopfront at dusk, and it is the best thing at street level in this
         * world: warm at 120-216 with the flame drawn in amber over it. At NOON it is a kerosene
         * lamp burning at midday. Measured at seed 42 frame 300 with the camera on a near
         * shopfront, it was the brightest object in the frame in blocks eight cells wide, and a
         * large share of a 22% hot tail.
         *
         * What a shop window at noon actually is: the top of the pane holds the SKY, which is the
         * brightest thing there is, and the rest holds a dark interior with the street across it.
         * So the pane splits at 0.58 of its height — sky above, room below — and the SPLIT is the
         * read: a pale rectangle over a dark one is a window at any distance, in a way that a field
         * of one tone is not.
         *
         * Dithered on the fill like everything else, so the lamps go out one cell at a time through
         * the morning rather than all on one frame, and at dFill 0 not one cell of this exists. */
        if (dFill > 0.002 &&
            hash2(Math.floor(u * 3.1), Math.floor(v * 3.1), sd ^ 0x6A3) < dFill) {
          var rv = (v - wv0) / st.shopH;
          if (rv > 0.58) {
            var rk = (rv - 0.58) / 0.42;
            return fset(ink(0.44 + 0.38 * rk + 0.14 * (gl - 0.5)),
                        gl < 0.62 ? P.white : P.ice, (108 + 84 * rk) * (0.5 + 0.5 * dSky));
          }
          /* The room. Goods against the glass read as broken dark, and one cell in seven catches
           * the road behind the viewer — which is what makes a dark pane read as glass rather than
           * as a hole cut in the wall. */
          /* 52 + 78, not 18 + 44. The first cut put the room at a printed 18-62 in indigo, whose
           * day ceiling is 104, and the lower half of every shopfront on the street came out as a
           * solid black rectangle — a hole again, in the one place this pass had just finished
           * removing one. What is actually in the bottom of a shop window at midday is the STREET,
           * reflected: a bright road four metres away, laid over the dark of the room. It is still
           * the darkest large area on the building, by about two stops from the wall beside it. */
          if (gl > 0.86) return fset(G_UNDER, P.sand, (86 + 54 * gl) * (0.4 + 0.6 * dSky));
          return fset(gl < 0.34 ? G_HASH : (gl < 0.66 ? G_COLON : G_DOT),
                      gl < 0.34 ? P.timber : P.indigo,
                      (52 + 78 * gl) * (0.5 + 0.5 * dSky));
        }
        if (gl < 0.17) return fset(G_0, P.shadow, 0);          // stock, in silhouette
        /* THE LAMP. Every other lit cell in this world is a SURFACE catching a dying sun, and
         * core.js's ladder makes surfaces dim on purpose — warm is 0.32 and white is 0.30, so
         * neither can reach the v>=170 hot band however hard it is driven. A frame with nothing in
         * that band reads flat, and the census agreed: the first cut of this file printed 0.05% hot
         * against the build's 3.5-5% target. So the SOURCE is drawn, as amber (0.50, and the only
         * warm swatch that can get there) at the few cells nearest the middle of the pane — the
         * flame in the glass rather than the light on the room. Small by construction: a couple of
         * cells per window, and only in windows that are lit at all. */
        /* AMBER LEADS AND WARM FOLLOWS, which is the other way round from the city and is a
         * consequence of the print rather than of the light. core.js gives warm a gain of 0.32, so
         * a warm cell CANNOT reach the v>=170 highlight band however hard it is driven — and a lit
         * window at dusk is the brightest thing at street level out here, so if it cannot be hot
         * then nothing on the ground can. Amber is 0.50 and reaches 180. Physically they are the
         * same lamp; the split is which part of it is the flame and which is the room. */
        if (gl > 0.62) return fset(gl > 0.90 ? G_o : G_8, P.amber, (208 + gl * 46) * gr);
        return fset(gl < 0.42 ? G_8 : G_0, gl > 0.56 ? accent : P.warm, (120 + gl * 96) * gr);
      }

      /* The rest of the ground floor is board, in the porch's shade — so it is DARKER than the
       * storey above it whichever way it faces, and that inversion is what makes a porch a porch.
       *
       * 0.42 AT NIGHT AND 0.62 BY DAY, because what fills a porch is not the sun. At dusk the only
       * light under an awning is the sky behind the viewer and 0.42 is generous. At noon there is a
       * bone-white dirt road four metres in front of it throwing light straight back up under the
       * boards, and that bounce is most of what a shaded shopfront is lit by — measured the other
       * way round: at 0.42 the ground floors of the near buildings were the darkest band in a noon
       * frame at a mean lum of 82, under both the wall above them and the road below. The porch has
       * to stay the darker of the two or it stops being a porch, and at 0.62 it still is, by about
       * a stop and a half. */
      return board(u, v, st, sd, lod, gr, sun * (0.42 + 0.20 * dFill), sunHue, shdHue, dayMat, dist);
    }

    /* ---- upper storey -------------------------------------------------------------------------
     * One window per bay, centred, at a fixed height off the porch line. Fewer and smaller than
     * the city's, and mostly dark: a lit upstairs window at this hour is somebody turning in. */
    var uy = v - (st.gnd + 0.52);
    var storey = Math.floor(uy / st.up);
    var sv = uy - storey * st.up;
    /* ---- TWO STOREYS OF WINDOWS AND NOT ONE MORE -------------------------------------------------
     * This loop had no cap, so it repeated its window band all the way up whatever height city.js
     * handed it — and city.js's `landmark` roll hands it 14-24 m. The result was an eight-storey
     * grid of lit windows on a frontier main street: an apartment block, in 1880, and the single
     * most wrong thing in that world.
     *
     * A frontier building is two storeys. What makes the tall ones tall is a FALSE FRONT or a
     * TOWER, and both of those are blank boarded wall — which is what falling through to board()
     * below gives, for free. The verticality that world is entitled to comes from the crowns
     * element on the roof (a steeple, a water tank, a windmill), not from more rows of glass. */
    if (storey >= 0 && storey < 2 && sv > 0.55 && sv < 0.55 + st.winH) {
      var cw = st.winW / st.bay, c0 = 0.5 - cw * 0.5, c1 = 0.5 + cw * 0.5;
      if (fu > c0 && fu < c1) {
        var wh = hash2(bay * 7 + storey, sd, 0x8D2);
        if (sv - 0.55 < 0.11 || 0.55 + st.winH - sv < 0.11 || fu - c0 < 0.05 || c1 - fu < 0.05)
          return fset(G_DASH, sun >= 0.62 ? P.white : (dayMat ? P.white : P.slate),
                      ((sun >= 0.62 ? 58 : 22) + 82 * dFill * sun) * gr);
        if (wh < lit) {
          var lg = hash2(Math.floor(u * 3.4), Math.floor(v * 3.4), sd ^ 0xA3);
          /* The upstairs lamp goes out with the downstairs one and for the same reason — see the
           * shopfront pane above. What replaces it is the dark-glass treatment two branches down,
           * which is what an unlit sash at noon is, so a lit window and an unlit one converge as
           * the day comes up. That is correct: at midday you cannot tell them apart. */
          if (dFill > 0.002 &&
              hash2(Math.floor(u * 3.1), Math.floor(v * 3.1), sd ^ 0x6A3) < dFill) {
            if (Math.abs(sv - (0.55 + st.winH * 0.5)) < 0.06)
              return fset(G_DASH, P.white, (30 + 96 * sun) * gr);
            if (lg > 0.80) return fset(G_UNDER, P.white, (96 + 60 * lg) * (0.4 + 0.6 * dSky));
            return fset(lg < 0.40 ? G_COLON : G_DOT, P.indigo,
                        (34 + 62 * dSky + lg * 34) * gr);
          }
          if (lg < 0.16) return fset(G_o, P.shadow, 0);       // somebody at the glass
          if (lg > 0.66) return fset(lg > 0.92 ? G_o : G_8, P.amber, (204 + lg * 50) * gr);
          return fset(G_8, P.warm, (112 + lg * 84) * gr);
        }
        /* Dark glass still reflects the sky, and that is the only reason an unlit window is
         * visible at all — a faint cool cell in a warm wall. It is ice rather than azure because
         * ice is a GLINT weight (0.36) and azure is a pillar (1.00): one dark pane in azure at
         * this lum would be the brightest thing on the building. */
        var dg = hash2(Math.floor(u * 2.2), Math.floor(v * 2.2), sd ^ 0xB5);
        if (dg < 0.30) return fset(G_COLON, P.ice, (20 + 46 * dFill) * gr);
        /* AND BY DAY THE REST OF THE PANE IS NOT A HOLE EITHER. An unlit window at noon is the
         * darkest rectangle on a bright wall — which is what makes a daylight building read — but
         * it is glass with a sky in it, so it is indigo at a low lum and not black. A glazing bar
         * across the middle of it, because a frontier sash is two lights over two. */
        if (dFill <= 0.002) return fset(0, P.shadow, 0);
        if (Math.abs(sv - (0.55 + st.winH * 0.5)) < 0.06)
          return fset(G_DASH, P.white, (30 + 96 * sun) * gr);
        return fset(dg < 0.62 ? G_COLON : G_DOT, P.indigo, (18 + 50 * dSky + dg * 26) * gr);
      }
      /* The sill and the head run the full bay on a painted front — a line of white across the
       * facade at window height, which is a strong horizontal and very much of the period. */
      if (st.rough === 0 && (sv - 0.55 < 0.10 || 0.55 + st.winH - sv < 0.10) && bh > 0.62)
        return fset(G_DASH, sun >= 0.62 ? P.white : (dayMat ? P.white : P.slate),
                    ((sun >= 0.62 ? 50 : 18) + 76 * dFill * sun) * gr);
    }

    /* ---- THE GHOST SIGN, one front in six and day only -------------------------------------------
     * A false front is a large blank board, and after the coping and the two storeys of windows it
     * is the single biggest empty area in this world — which is most of what the complaint is
     * about. What actually went on those boards was PAINT: a merchant's name in three-foot letters,
     * half gone.
     *
     * It is drawn as a LATTICE and not as glyphs, and that is forced rather than chosen: the frame
     * is 200 columns across a 17 m street, so a three-foot letter is one cell and any attempt to
     * spell something reads as one speck. What the eye recognises a painted sign by at fifty metres
     * is a BAND OF BLOCKY MARKS AT A REGULAR PITCH with the wear punched through it, and that is
     * what this is: a 0.62 m letter pitch, three rows of stroke, and a third of it worn away.
     *
     * Day only, and the reason is not budget. At dusk this wall is either a hard amber rim or a
     * silhouette, and a painted sign is neither — there is no light on it to be a different colour
     * FROM. One front in six, because a street where every board carries lettering is a high street
     * and not a frontier town; and only on fronts over 6.2 m, because that is where the blank board
     * actually is. */
    var gs = hash2(sd, 0x51, 0x6C7);
    if (dFill > 0.002 && gs < 0.17 && h > 6.2) {
      var gy0 = st.gnd + 1.35, gy1 = gy0 + 1.60;
      if (v > gy0 && v < gy1 && h - v > 1.10) {
        var gu = u / 0.62, fgu = gu - Math.floor(gu);
        var gvb = Math.floor((v - gy0) / 0.40);           // four rows of stroke per letter
        var gw = hash2(Math.floor(gu), gvb, sd ^ 0x5A3);
        /* The stroke pattern: the outer rows are the tops and bottoms of the letters and are nearly
         * continuous, the middle two are the uprights and are mostly gaps. That asymmetry is what
         * stops the band reading as a chequer. */
        var inkP = (gvb === 0 || gvb === 3) ? 0.80 : 0.42;
        if (fgu < 0.58 && gw < inkP &&
            hash2(Math.floor(u * 3.4), Math.floor(v * 3.4), sd ^ 0x9E1) < 0.74 * dFill)
          return fset(gw < 0.34 ? G_HASH : G_8,
                      gs < 0.085 ? P.ember : P.white, (54 + 128 * sun + gw * 30) * gr);
      }
    }

    return board(u, v, st, sd, lod, gr, sun, sunHue, shdHue, dayMat, dist);
  }

  /* ---- bare wall -------------------------------------------------------------------------------
   * MOSTLY NOTHING, and that is the discipline the city taught this file. A facade drawn as a full
   * field of dim glyphs lands every one of its cells in the muddy print band (v 9-119), and a
   * two-storey town has a lot of blank wall in it. So what is painted is the RHYTHM — the shadow
   * line under each board lap — and the wall between the lines is left black. The eye assembles a
   * clad wall out of the lines alone; it has been doing that with siding since photography.
   *
   * The lap pitch coarsens with distance rather than being hashed finer, for the same reason
   * surfaces.js coarsens its bay lattice: at 40 m one cell spans half a metre of wall and a 34 cm
   * rhythm aliases into a crawling moire that is worse than no texture at all. */
  function board(u, v, st, sd, lod, gr, sun, sunHue, shdHue, dayMat, dist) {
    if (st.rough) {
      /* Adobe and stone: no rhythm, a mottle. Rendered mud is nearly featureless in shade and
       * comes alive in raking light, which is exactly what `sun` does to the density below. */
      var m = hash2(Math.floor(u * 2.4), Math.floor(v * 2.4), sd ^ 0x4C1);
      /* DENSITY CARRIES THE TONE AT NIGHT AND BRIGHTNESS CARRIES IT BY DAY, which is the same
       * lesson the road one function down learned and wrote out at length. A rendered wall at noon
       * is a CONTINUOUS surface; drawn as a sparse field of specks it reads as dirt on glass, not
       * as adobe. So the coverage goes to 0.94 as the day comes up and the lum ladder below takes
       * over the job of saying how bright it is. 0.94 rather than 1.00 leaves the pitting and the
       * blown render in it — mud that is perfectly covered stops being mud. */
      var mdens = 0.10 + 0.26 * sun;
      mdens += (0.94 - mdens) * dFill;
      if (m > mdens) return fset(0, P.shadow, 0);
      var mn = 10 + 62 * sun + m * 40;
      /* The day figure is fitted against the swatch and not against the night one: sand's day
       * ceiling is 190 and the sun-facing wall of an adobe at noon is the brightest large surface
       * in the frame, so it is written where it prints near that. The square on `sun` is what keeps
       * three stops between the two walls of the street — see sunOf()'s ambient floor. */
      var md = 40 + 44 * dSky + 184 * sun * sun + 44 * m;
      /* The thresholds carry dFill so that the third glyph only exists by day: at dFill 0 the
       * second test is `m < mdens`, which the density test above has already guaranteed, so the
       * cascade collapses to the two glyphs the night frame was tuned with. Written as a constant
       * 0.28/0.62 it moved 41 cells of the night reference frame — glyph only, lum identical — and
       * that is exactly the class of silent re-tune the day-ladder rule exists to forbid. */
      return fset(dayMat ? ink(0.32 + 0.76 * sun * sun + 0.26 * (m / mdens - 0.5))
                         : (m < mdens * (0.40 - 0.12 * dFill) ? G_QUOTE
                            : (m < mdens * (1 - 0.38 * dFill) ? G_COLON : G_DOT)),
                  sun >= 0.62 ? sunHue : shdHue, (mn + (md - mn) * dFill) * gr);
    }

    var lap = st.lap * (lod === 2 ? 1 : (lod === 1 ? 2 : 4));
    if (st.vert) {
      /* Board and batten runs the other way: the rhythm is vertical and it is the batten, not a
       * shadow line, so it is a lit stroke on a dark wall rather than a dark one on a lit wall. */
      var bx = u / (lap * 1.4), fbx = bx - Math.floor(bx);
      if (fbx > 0.14) {
        return (sun >= 0.62 && hash2(Math.floor(u * 1.7), Math.floor(v * 1.7), sd ^ 0x2A) < 0.12)
             ? fset(G_QUOTE, sunHue, 26 * gr)
             : fillCell(u, v, sd, gr, sun, sun >= 0.62 ? sunHue : shdHue, lod);
      }
      /* The batten itself. By day it is the one thing on this wall that stands proud of it, so it
       * keeps a shadow down one side — which is `dark` below, and is what makes a batten wall read
       * as ribbed at noon instead of as striped. */
      var dark = fbx > 0.085 && dFill > 0.002 && lod === 2;
      return fset(G_PIPE, sun >= 0.62 && !dark ? sunHue : shdHue,
                  ((12 + 58 * sun) + ((dark ? 30 : 128) + 110 * sun * sun - 12 - 58 * sun) * dFill) * gr);
    }

    var bv = v / lap, fbv = bv - Math.floor(bv);
    var wob = hash2(Math.floor(u * 1.3), Math.floor(v / lap), sd ^ 0x31);

    /* ---- THE LIT SIDE IS A SURFACE; THE DARK SIDE IS A RHYTHM ---------------------------------
     * This is the largest single decision in the file and it was got wrong first time round, so
     * the reasoning is written down rather than left in the constants.
     *
     * The house discipline — inherited from surfaces.js and correct there — is that a facade is
     * MOSTLY BLANK with only its structure lines painted, because a full field of dim glyphs puts
     * every one of its cells in the print's muddy band (v 9-119) and a city has a great deal of
     * wall in it. Applied uniformly here it produced a town in which nothing had any mass at all:
     * measured at seed 42 frame 600, the whole frontier printed 0.13% of cells above v=170 against
     * the build's 3.5-5% target, and every reference frame of the city has a THIRD of its picture
     * in solid blocks of lit window.
     *
     * The frontier's answer cannot be lit windows — there are barely any — so it has to be the one
     * thing it does have that the city does not: a low sun square onto one side of the street. A
     * clapboard wall at this hour is not a dim surface, it is the brightest large object in the
     * frame, and it belongs painted as a MASS.
     *
     * The muddy-band objection does not apply to it, and that is arithmetic rather than hope:
     * core.js prints amber at gain 0.50, where lum 100 lands at v=126 — already clear of the muddy
     * ceiling at 119. So the lit wall is written at lum 88-150, which is out of the band on both
     * sides, and the SHADOW wall keeps the sparse-lines treatment exactly as before, because slate
     * at any lum is inside the band and there is no way to spend cells there cheaply. One side of
     * the street is a surface, the other is a silhouette, and the print pays for both. */
    /* ---- THE JOINTS AND THE NAILS, and both are day-only ----------------------------------------
     * A frontier board is 12 to 16 feet long, so a wall wider than that has BUTT JOINTS in it —
     * verticals every 4 m or so, staggered course by course, and they are the one thing that tells
     * the eye the wall is made of boards rather than printed with stripes. Nails go in at the studs
     * at 0.6 m centres and bleed rust down the board under them.
     *
     * Both are lod 2 only and both are gated on the fill: at distance they alias into the lap
     * rhythm and at night there is nothing for them to be a variation OF. They are drawn DARK
     * against the wall rather than bright, which is both what they look like and what keeps them
     * off the photosensitivity gate — a one-cell-wide bright vertical that a walking camera steps
     * across is the exact failure the gate is written for. */
    if (lod === 2 && dFill > 0.002) {
      var course = Math.floor(v / lap);
      /* The stagger: each course of boards starts at a different offset, so the joints do not line
       * up into one continuous seam. Four metres is a sixteen-foot board with a bit off the end. */
      var ju = (u + hash2(course, sd, 0x4B7) * 3.7) / 4.1;
      var fju = ju - Math.floor(ju);
      if (fju < 0.045 && hash2(Math.floor(ju), course, sd ^ 0x7C1) < dFill)
        return fset(G_PIPE, shdHue, (26 + 74 * sun * sun) * gr);
      var stud = u / 0.61, fst = stud - Math.floor(stud);
      if (fst < 0.10 && fbv > 0.30 && fbv < 0.52 &&
          hash2(Math.floor(stud), course, sd ^ 0x2B9) < 0.44 * dFill)
        return fset(G_COLON, P.timber, (22 + 62 * sun) * gr);
    }

    if (sun >= 0.62) {
      var body = hash2(Math.floor(u * 2.4), Math.floor(v * 2.4), sd ^ 0x66);
      /* THE LAP LINE INVERTS ACROSS THE DAY, and it has to. At a grazing sun the lower edge of each
       * board is the part of the wall pointing most nearly at the light, so it is the BRIGHT line
       * and the wall behind it is dark — which is what the 176-244 below draws and why a dusk
       * clapboard reads. With the sun overhead the same edge is the part in its own shadow, so the
       * line is DARK on a bright wall. Blended rather than switched, because a whole wall's rhythm
       * inverting at one instant of the clock is a large-area step. */
      if (fbv <= 0.30) {
        var lapN = 176 + wob * 68;
        var lapD = 42 + 96 * sun * sun + wob * 30;
        return fset(wob < 0.22 ? G_UNDER : G_DASH,
                    dFill > 0.5 ? shdHue : sunHue, (lapN + (lapD - lapN) * dFill) * gr);
      }
      if (body < 0.62)
        return fset(dayMat ? ink(0.34 + 0.72 * sun * sun + 0.28 * (body / 0.62 - 0.5))
                           : (body < 0.20 ? G_DASH : (body < 0.44 ? G_UNDER : G_TICK)), sunHue,
                    ((124 + body * 74) +
                     ((58 + 46 * dSky + 168 * sun * sun + body * 40) - 124 - body * 74) * dFill) * gr);
      return fillCell(u, v, sd, gr, sun, sunHue, lod);
    }

    if (fbv > 0.30) {
      /* Between the lines, on the shadow side. A very few specks — nail heads and knots — because
       * a perfectly empty field between two perfect lines reads as a stencil. */
      if (lod === 2 && hash2(Math.floor(u * 2.8), Math.floor(v * 2.8), sd ^ 0x66) < 0.10)
        return fset(G_DOT, shdHue, (10 + 46 * sun) * gr);
      return fillCell(u, v, sd, gr, sun, shdHue, lod);
    }
    /* The lap line, in shade. */
    return fset(wob < 0.22 ? G_UNDER : G_DASH, shdHue,
                ((13 + 74 * sun + wob * 22) +
                 ((22 + 88 * sun * sun + wob * 24) - 13 - 74 * sun - wob * 22) * dFill) * gr);
  }

  /* ---- THE BLANK BETWEEN THE STRUCTURE LINES, WHICH IS ONLY BLANK AT NIGHT ----------------------
   * board() paints a rhythm and leaves the wall between the lines black, and the two long comments
   * around it say why: a full field of dim glyphs lands every one of its cells in the print's muddy
   * band, and a two-storey town has a great deal of blank wall in it. That is a NIGHT argument, and
   * the README already concedes as much — "by day the census that matters is the hot tail, not the
   * muddy one". A wall at noon is a continuous surface with the whole sky on it; drawn as a rhythm
   * of lines over black it is a hole with a ladder in it, which is exactly what the frontier
   * printed at noon and exactly what the complaint describes.
   *
   * So every blank site on a WALL goes through here. At dFill 0 it returns the blank it replaced,
   * byte for byte, and the night frame is unchanged by construction rather than by measurement.
   *
   * AND IT MAKES THE FLICKER GATE EASIER, not harder, which is worth writing down because the
   * instinct is the other way. The worst per-cell step a walking camera can take is between a
   * blank cell and a bright one, and every blank cell of a lit wall was the dark half of one of
   * those pairs. Filling the wall replaces a 0-to-200 step with a 150-to-200 one. Measured with
   * tools/west-flicker.cjs before and after; the worst step went DOWN.
   *
   * 0.93 and not 1.00: a wall with no holes in it has no grain, and the few per cent that stay
   * black are the gaps, the knots and the boards that have dropped out. */
  function fillCell(u, v, sd, gr, sun, hue, lod) {
    if (dFill <= 0.002) return fset(0, P.shadow, 0);
    var h = hash2(Math.floor(u * 3.7), Math.floor(v * 3.7), sd ^ 0xC13);
    var cov = 0.93 * dFill;
    if (h > cov) return fset(0, P.shadow, 0);
    var q = h / cov;                                  // renormalised over the painted cells
    /* THE SQUARE ON `sun` IS THE THREE STOPS. A wall in sun and the same wall in its own porch
     * shade are about three stops apart at noon, and a linear ramp put them inside one of each
     * other — the "one field of mid-tone" failure sunOf()'s ambient floor spends a paragraph on.
     * Squared, the porch (sun*0.42) comes out at a fifth of the front, which is right. */
    /* Tone drives BOTH the ramp and the lum, and the spread is what keeps the wall from being one
     * glyph repeated: +-0.15 of the ramp is about three steps, which reads as grain in the boards.
     *
     * THE 46*dSky IS THE HEMISPHERE AND IT IS NOT OPTIONAL. Everything else here is proportional to
     * the SUN, and a wall that only has the sun in it is a wall in a vacuum: at noon the ground
     * floors under the verandas came out at a mean printed lum of 93 in timber, whose day ceiling
     * is 120, so the whole band under the awnings was 54 on a 255 scale — a black stripe across the
     * middle of a midday street. What fills a porch is the sky, which is why this term keys on
     * dSky and not on dSun, and why it is a FLOOR added rather than a factor: it is light that
     * arrives whether or not this face can see the sun. */
    return fset(ink(0.34 + 0.72 * sun * sun + 0.30 * (q - 0.5)),
                hue, (34 + 46 * dSky + 178 * sun * sun + 40 * q) * gr);
  }

  /* ---- ground ----------------------------------------------------------------------------------
   * wx/wz in metres, `dist` the radial distance to this cell. The street runs along wz with its
   * centreline at CFG.streetX and its carriageway half-width in CFG.half; CFG.xc/xw carry where
   * the cross streets cut it. All of that is raycast.js's, and it is the same for both worlds —
   * what changes is that there is no tarmac, no kerb, no lane marking and no tram rail out here.
   *
   * WHAT A DIRT STREET IS MADE OF, in the order the cascade tests it:
   *   the boardwalk    a raised plank walk in front of the buildings, with a step down to the dirt
   *   the ruts         two wheel tracks either side of the centre, worn in and holding the water
   *   the crown        the road is domed, so the middle is dry and pale and the edges are not
   *   the dust         everything else — sparse grit, hoof scuff, a stone
   * and after rain, the ruts fill and become the only mirrors in the world.
   */
  var ROUT = { ch: 0, col: 0, lum: 0, mir: 0, rip: 0, wch: 0 };
  var mirNow = 0, ripNow = 0, wchNow = 0;
  function rset(ch, col, lum) {
    ROUT.ch = ch; ROUT.col = col;
    ROUT.lum = lum < 0 ? 0 : (lum > 255 ? 255 : lum | 0);
    ROUT.mir = mirNow; ROUT.rip = ripNow; ROUT.wch = wchNow;
    return ROUT;
  }

  var BOARDWALK = 1.72;          // plank width of the walk, inside CC.PAVE's 2.15 m strip

  /* Is this z inside a junction mouth? Indexed rather than scanned — see loadCrossings. */
  function inCross(C, wz) {
    if (!C.xn) return 0;
    var i = Math.round((wz - C.xz0) / (C.xpitch || 26));
    if (i < 0) i = 0; else if (i >= C.xn) i = C.xn - 1;
    var d = wz - C.xc[i]; if (d < 0) d = -d;
    if (d <= C.xw[i] + 1.1) return 1;
    /* One neighbour either side, because the arithmetic guess can be a slot out on a jittered
     * lattice and a junction mouth that vanishes for two metres is a hole in the road. */
    if (i > 0) { d = wz - C.xc[i - 1]; if (d < 0) d = -d; if (d <= C.xw[i - 1] + 1.1) return 1; }
    if (i < C.xn - 1) { d = wz - C.xc[i + 1]; if (d < 0) d = -d; if (d <= C.xw[i + 1] + 1.1) return 1; }
    return 0;
  }

  function floorTex(wx, wz, dist, t) {
    weatherAt(t === undefined ? 0 : t); dayAt(t === undefined ? 0 : t);
    var C = cfg();
    var half = C ? C.half : 3.1;
    var lane = wx - (C ? C.streetX : 4.0);
    var al = lane < 0 ? -lane : lane;
    var lod = dist < 20 ? 2 : (dist < 46 ? 1 : 0);
    mirNow = 0; ripNow = 0; wchNow = 0;

    /* Sun side. The whole street is one plane so it cannot shade itself, but the buildings on the
     * sunward side throw their shadow across the near half of the road at this hour, and that
     * diagonal is worth having: it is why the road is not one flat tone from kerb to kerb. */
    /* WHICH AXIS THE LANE IS IN. raycast.js hands floorTex its coordinates TRANSPOSED when the
     * camera has committed to a cross street, so `lane` is an x offset on an avenue and a z offset
     * on a cross street — and the sun has a different component along each. Without this the sunlit
     * side of the road swaps to the wrong side every time the walk turns a corner.
     *
     * It also falls out for free that a street running along the sun's own bearing has no lit side
     * and no dark one: `comp` goes to nearly zero, `bright` collapses to a half, and the light
     * comes straight down the road at both walks equally. That is exactly what happens, and it is
     * the best-looking street in the world when the walk finds one. */
    var comp = (C && C.swap) ? SUN_Z : SUN_X;
    var lit = -lane * comp;                  // >0 on the side the sun is on
    var sunSide = lit > 0.4 ? 1 : (lit < -0.4 ? 0 : (Math.abs(comp) < 0.35 ? 1 : 0));

    /* ---- the boardwalk ------------------------------------------------------------------------ */
    if (al > half && al < half + BOARDWALK) {
      if (inCross(C, wz)) {
        /* A junction has no walk across it — you step down into the road. That gap is the reason
         * the crossings are loaded at all in this world. */
      } else {
        var into = al - half;
        /* The step down at the road edge: one bright line, because it is an EDGE lit from the
         * side and it is what gives the street its two long converging rails. */
        if (into < 0.16)
          return rset(G_UNDER, sunSide ? P.amber : P.white, (sunSide ? 214 : 60) * (0.8 + 0.4 * hash2((wz * 3) | 0, 0, 0x11)));
        /* Planks run ACROSS the walk, so the joints are lines of constant wz — which is to say
         * they converge to the same vanishing point as the street and carry the perspective. */
        var pj = wz / 0.92, fpj = pj - Math.floor(pj);
        var pw = hash2(Math.floor(pj), (al * 2) | 0, 0x5B);
        if (fpj < 0.10)
          return rset(G_DASH, P.slate, (14 + pw * 12));
        if (lod === 2 && pw < 0.10)
          return rset(pw < 0.04 ? G_COMMA : G_DOT, P.slate, 12 + pw * 60);   // a knot, a gap
        /* The deck itself. Planed board takes the low sun better than dirt does, so the walk on
         * the sunward side is one of the brightest surfaces in the frame and the one opposite is
         * nearly black — the two sides of a main street at dusk do not match and should not. */
        /* THE DECK BY DAY. A plank walk at noon is a continuous pale board surface with the joints
         * dark in it, and it is the one large horizontal the eye uses to read the street's edge —
         * so it takes the ramp and it takes `sand`, which is planed board with dust on it. At night
         * this is `_` in white on the sunward side and mostly nothing opposite, unchanged. */
        if (dFill > 0.002 && hash2(Math.floor(wz * 4.1), (al * 3) | 0, 0x2F7) < 0.94 * dFill)
          return rset(ink((sunSide ? 0.60 : 0.36) + 0.26 * (pw - 0.5)),
                      sunSide ? P.sand : P.timber,
                      (sunSide ? 150 : 78) + pw * 52);
        if (sunSide) return rset(G_UNDER, P.white, (62 + pw * 40));
        return (pw < 0.30) ? rset(G_UNDER, P.slate, 12 + pw * 20) : rset(0, P.shadow, 0);
      }
    }
    /* Past the walk: the ground under the buildings, which is only ever seen through a gap. */
    if (al >= half + BOARDWALK) {
      if (lod === 0) return rset(0, P.shadow, 0);
      var og = hash2(Math.floor(wx * 1.6), Math.floor(wz * 1.6), 0x2D9);
      /* Dirt in the shade of the buildings. By day it fills — it is the same ground as the road,
       * two stops down because it never sees the sun — and by night it stays the fourteen per cent
       * scatter it was. */
      var od = 0.14 + (0.82 - 0.14) * dFill;
      if (og > od) return rset(0, P.shadow, 0);
      if (dFill > 0.002 && og < od * dFill)
        return rset(ink(0.30 + 0.24 * (og / od - 0.5)), P.timber, 46 + og * 90);
      return rset(og < 0.05 ? G_COMMA : G_DOT, P.slate, 10 + og * 60);
    }

    /* ---- the roadway -------------------------------------------------------------------------- */
    var n = al / half;                       // 0 at the crown, 1 at the edge

    /* Standing water. Out here it is not a sheet — a dry street sheds and the only water that
     * stays is in the ruts and the low corners, so `wet` buys DEPTH in the ruts rather than a
     * mirror everywhere. Under `blazing` (rel wet 0.04) this is zero and the road is bone dry. */
    var wet = wWet * 1.05;
    var rut = 0;
    if (lod > 0) {
      /* Two ruts, at 0.44 of the half-width either side, wandering slowly along the street the way
       * a wheel track does. Placed on a world lattice so they hold still as you walk. */
      var rc = 0.44 + vnoise(wz * 0.055, 0x3B) * 0.10;
      var dr = Math.abs(n - rc);
      rut = dr < 0.075 ? 1 - dr / 0.075 : 0;
    }

    if (rut > 0.25 && wet > 0.45) {
      /* A rut with water in it. This is the frontier's puddle and it is the only mirror in the
       * world — which makes it precious rather than a limitation: after a squall the whole town
       * hangs upside down in two thin lines running away up the street. */
      var wsurf = rut * clamp(wet - 0.4, 0, 1);
      if (wsurf > 0.12) {
        mirNow = clamp(wsurf * 1.25, 0, 1);
        ripNow = CC.reducedMotion ? 0 : Math.sin(wz * 1.7 + t * 1.4) * 0.9 * wWind;
        wchNow = G_TILDE;
        var ws = hash2(Math.floor(wx * 3), Math.floor(wz * 3), 0x71C);
        return rset(ws < 0.5 ? G_TILDE : G_SEMI, P.slate, 12 + ws * 22);
      }
    }

    /* ---- the dry rut ---------------------------------------------------------------------------
     * TWO LINES RUNNING AWAY UP THE STREET, and they are the most important thing on this floor.
     * A dirt road drawn as one field of noise has no perspective in it at all — the first cut of
     * this file did exactly that and the ground read as static, because nothing on it converged.
     * The ruts are the road's only long straight lines and they do the job the city's centreline,
     * kerb and rails do between them.
     *
     * They are PALER than the road around them, which is the way round that surprised me and then
     * did not: a wheel track in dry ground is broken, churned, unpacked dust, and unpacked dust
     * catches a low sun far better than the packed crown does. Drawn darker they read as two
     * cracks; drawn paler they read as two tracks. */
    if (rut > 0.22) {
      var rs = hash2(Math.floor(wx * (lod === 2 ? (dist < 9 ? 6.2 : 3.0) : 1.7)),
                     Math.floor(wz * (lod === 2 ? (dist < 9 ? 6.2 : 3.0) : 1.7)), 0x18F);
      var rd = (0.34 + 0.42 * rut) * (lod === 2 ? 1 : 0.8);
      rd += (0.96 - rd) * dFill;                 // a wheel track at noon is churned dust, not grit
      if (rs < rd) {
        /* THE RUTS ARE THE ROAD'S ONLY LONG STRAIGHT LINES and by day they have to stay legible as
         * lines while the ground either side of them fills in — which means they cannot simply get
         * brighter with everything else. So they keep the paler-than-the-road relationship the
         * comment above argues for, and take it in INK rather than in lum: two bands of churned
         * dust at a heavier ramp step than the packed crown beside them. */
        var rk = rs / rd;
        var rn = (26 + rs * 150) * rut * (sunSide ? 1.15 : 0.72);
        var rdy = (108 + rk * 104) * (0.55 + 0.45 * rut) * (sunSide ? 1.10 : 0.80);
        return rset(dFill > 0.002 && hash2(Math.floor(wx * 2.7), Math.floor(wz * 2.7), 0x3C8) < dFill
                      ? ink((sunSide ? 0.66 : 0.50) + 0.26 * (rk - 0.5))
                      : (rs < 0.14 ? G_UNDER : (rs < 0.34 ? G_COMMA : G_DOT)),
                    sunSide ? (dFill > 0.5 ? P.sand : P.white) : (dFill > 0.5 ? P.timber : P.slate),
                    rn + (rdy - rn) * dFill);
      }
      /* The stones the wheels turn up sit in the track, not beside it. */
      if (lod === 2 && dist > 8 && rs > 0.988) return rset(G_o, P.slate, 30 + (1 - rs) * 3200);
      return rset(0, P.shadow, 0);
    }

    /* The crown, and the shoulders. Dust is the surface: pale, fine and almost featureless, so it
     * is drawn as a sparse field whose DENSITY carries the tone rather than a fill whose lum does.
     * Density falls off toward the edges, which is what domes the road. */
    /* ---- THE GROUND FOLLOWS THE SUN, in density AND in how much the two sides differ ------------
     * At dusk the road has a lit side and a dark side and the difference between them is most of
     * what the frame is made of. At noon the sun is overhead: both sides are lit, the shadow of
     * the buildings has pulled back under their own eaves, and the road is the brightest large
     * surface in the world — which is what a desert at midday IS, and what the fixed-dusk version
     * of this function could not draw at all.
     *
     * `sideK` is how much of the lit/dark split survives the hour: 1 at a grazing sun, 0.25
     * overhead. `lightK` is the overall level, and it does not go to zero at night — a dirt road
     * under a lamp-lit town and a sky full of stars is dim, not absent. */
    var sideK = 0.25 + 0.75 * clamp(1 - dAlt() / 0.95, 0, 1);
    /* CAPPED AT 1, and the cap is the point. Density carries tone when there is little light —
     * that is this file's own house rule and the road was built on it — but once the sun is up the
     * tone has to be carried by BRIGHTNESS instead, or a lit road is simply more cells at the same
     * mid value, which is the muddy band by definition. Past noon this stops adding grains and the
     * lum term below keeps going. */
    var lightK = clamp(0.18 + 0.62 * dSky + 0.26 * dSun, 0, 1.0);
    var sideBias = sunSide ? (1 + 0.25 * sideK) : (1 - 0.28 * sideK);
    var lodQ = lod === 2 ? 1 : (lod === 1 ? 0.82 : 0.6);
    /* ---- AND BY DAY THE ROAD IS A SURFACE, not a scatter -----------------------------------------
     * The paragraph above is right about the CAP and wrong about what to do once the cap is
     * reached. Measured at seed 42 frame 300 with a probe over the carriageway: at noon this road
     * came out 35.7% covered. Sixty-four per cent of the brightest large surface in the world was
     * the black the frame is cleared to — which is the complaint, in the one place it is easiest to
     * check, because a dirt road at midday is not a dark thing with pale specks on it.
     *
     * So there are two densities and the day mixes between them. The night one is unchanged and is
     * the tuned figure. The day one is 0.94 at the crown falling to 0.72 at the kerb: the road is
     * still domed — the shoulders are where the loose stuff and the weeds are and they stay broken
     * — but the middle of it is a surface. */
    var dnight = (0.42 - 0.20 * n * n) * sideBias * lightK * lodQ;
    /* THE LOD TERM IS NOT THE SAME FACT BY DAY. Thinning the field with distance is a DETAIL
     * decision — one lattice cell spans several screen columns out there and the grain stops being
     * resolvable — and at night, where density carries the tone, thinning it also correctly makes
     * the far road darker. By day it does not: the far half of a road at noon is exactly as
     * continuous a surface as the near half and merely less detailed, so the day term only falls to
     * 0.82 where the night one falls to 0.60. */
    var dday = (0.94 - 0.22 * n * n) * sideBias * (lod === 2 ? 1 : (lod === 1 ? 0.92 : 0.82));
    var dens = dnight + (dday - dnight) * dFill;
    /* More dust in the air means more dust on the ground; a squall packs it down. The packing is
     * worth 45% of the field at night and 18% of it by day, for the same reason as the LOD term
     * above: wet ground at noon is a DARKER continuous surface, not a sparser one. Left at 45% the
     * schedule's ordinary damp put 27% of the carriageway back to black in the middle of the day. */
    dens *= (0.82 + 0.5 * wDust) * (1 - (0.45 - 0.27 * dFill) * clamp(wet - 0.3, 0, 1));

    /* THE LATTICE PITCH IS A FUNCTION OF THE DISTANCE BAND, and this is the same lesson the city's
     * floor learned one file over. A world hash at a fixed pitch is stable — which is the point —
     * but at five metres one 0.48 m lattice cell spans eight screen columns, so every speck of dust
     * printed as an eight-character RUN of the same glyph and the near road read as lines of text.
     * Finer up close, coarser far away, quantised by band so it cannot crawl between two frames of
     * the same walk. */
    var q = lod === 2 ? (dist < 9 ? 5.6 : 2.6) : (lod === 1 ? 1.5 : 0.85);
    var d1 = hash2(Math.floor(wx * q), Math.floor(wz * q), 0x4A7);
    if (d1 < dens) {
      var hot = d1 < dens * 0.16 && sunSide;
      /* NORMALISED BY THE DENSITY, not by the raw draw. Writing lum = 18 + d1*150 tied a grain's
       * brightness to the same number that decided whether it existed at all, so as the density
       * fell toward the kerb every surviving grain also got dimmer — and the whole field collapsed
       * into lum 18-80, which is slate's muddy band end to end, over a third of the frame.
       * Dividing through by `dens` decouples them: the road still thins toward its edges and the
       * grains that remain keep the full tonal range. */
      var k1 = d1 / dens;
      /* THE DESERT'S OWN SWATCH BY DAY. `white` is 216,226,236, a cool render-grey: right for a
       * plank walk catching a low sun, wrong for a dirt road at noon, which is 216,186,132 and is
       * the exact thing `sand` was put in the palette to spell. Its day gain of 0.90 also makes it
       * the only swatch that can carry a large bright ground plane without going to white — white's
       * own 0.92 puts the road level with the render on the wall beside it, which is the fault
       * core.js's sand entry documents from the other end. Dithered on its own hash so the road
       * crosses over grain by grain rather than as one plane changing colour at an instant. */
      var sc = hash2(Math.floor(wx * q * 1.7), Math.floor(wz * q * 1.7), 0x1C5);
      /* WHITE ON BOTH SIDES ONCE THE SUN IS UP. The slate/white split is a dusk fact — one side of
       * the road in the light and one in the shade of the buildings — and at noon there is no shade
       * to be on the far side of. */
      var dayGround = dSun > 0.55;
      /* THE LUM FLOOR HAS TO COME UP WITH THE COVERAGE OR THE EXTRA CELLS ARE ALL MUD. The cells
       * the day density adds are the low-k1 ones — the faintest grains — and at the night ladder's
       * 22 + k1*128 they arrive in the 40s, which is the middle of the muddy band and is precisely
       * the "more cells at the same mid value" failure the cap above was defending against. Lifting
       * the base to 88 puts the whole day field over the band's ceiling once the exposure
       * multiplier is on it, so the extra coverage buys surface rather than mush. */
      var gn = (hot ? 132 : 22 + k1 * 128);
      var gd = (hot ? 176 : 88 + k1 * 96);
      /* The road takes the ink ramp on the same crossover as the swatch, and it needs it more than
       * the walls do: '.' ',' and '`' are the three THINNEST entries in the table at 3.0, 6.2 and
       * 2.6 per cent, which is exactly right for grit scattered on a dark road and is a third of a
       * per cent of area for a bright one. A dirt road at noon is packed dust, not grit. Held under
       * the walls' end of the ramp on purpose — ground that out-inks the buildings standing on it
       * inverts the picture. */
      var gsc = sunSide ? 0.62 : 0.44;
      /* ---- AND THE LIGHT TERM IS COUNTED ONCE, WHICH IT WAS NOT ---------------------------------
       * `0.6 + 0.7 * lightK + 0.9 * dSun` is how much light there is, and it is the night ladder's:
       * 0.73 at midnight, which is what `gn` was fitted under. At noon it is 2.20 — and `gd` above
       * is already a DAYLIGHT level, written to print near sand's own ceiling. Multiplying the two
       * put the carriageway at lum 194-405, i.e. clipped, and sand goes over the print's highlight
       * line at lum 201. Measured at seed 42 frame 300, 200x60: 1390 of the frame's 1633 hot cells
       * were the floor, the hot tail was 13.6% against the census's 3.5-5% target and the README's
       * published 5.6% for this world and hour, and the consequence is the one the eye actually
       * sees — the road, the sunlit walls and the sky all printing at the top of the ladder, so the
       * street has no tonal hierarchy left. A road is DARKER than the sky above it at every hour
       * there has ever been.
       *
       * So the light term blends to a day value of its own on the fill, exactly as every other
       * scale in this file does, and is the identity at dFill 0. 1.40 is chosen off the ORDERING
       * and confirmed by the census. Mean printed value by kind at seed 42 frame 300 noon:
       *     2.20   sky 135.8   floor 153.4   facade 84.6      hot 13.61%
       *     1.40   sky 135.5   floor 134.0   facade 84.5      hot  5.65%
       *     1.15   sky 135.5   floor 121.1   facade 84.8      hot  3.04%
       * At 2.20 the ground is brighter than the sky it is lit BY, which is the inversion. 1.40 is
       * the value that puts the road just under the dome and leaves it the second-brightest plane
       * in the frame, where a sunlit road belongs, and it lands on the 5.6% the README already
       * publishes for this world and hour. 1.15 keeps the ordering but drops the tail under the
       * census's own 3.5% floor and takes the road's whole highlight with it. Morning comes out at
       * 5.54% and afternoon at 4.28% off the same number, both inside the band, because the fill
       * carries them. */
      var lightMul = 0.6 + 0.7 * lightK + 0.9 * dSun;
      lightMul += (1.40 - lightMul) * dFill;
      return rset(sc < dFill * 0.86
                    ? ink(gsc + 0.30 * (k1 - 0.5) + 0.16 * dSun)
                    : (k1 < 0.3 ? G_DOT : (k1 < 0.62 ? G_COMMA : G_TICK)),
                  hot ? P.amber
                      : (sc < dFill * 0.86 ? P.sand : ((sunSide || dayGround) ? P.white : P.slate)),
                  (gn + (gd - gn) * dFill) * (sunSide ? 1 : 0.78) * lightMul);
    }
    /* A stone, a dry weed, a hoofprint. Rare, and the only things on the road with an edge. */
    if (lod === 2) {
      var d2 = hash2(Math.floor(wx * q * 0.5), Math.floor(wz * q * 0.5), 0x6E3);
      if (d2 < 0.014) return rset(G_o, P.slate, 26 + d2 * 1300);
      if (d2 > 0.990) return rset(G_QUOTE, P.spring, 22 + (1 - d2) * 1300);
    }
    return rset(0, P.shadow, 0);
  }

  /* ---- sky -------------------------------------------------------------------------------------
   * sx is the column's world bearing quantised at CFG.skyK index units per radian; sy is the screen
   * row. Both come from raycast.js and neither is a camera-relative quantity, which is what keeps
   * the sunset welded to the west while the viewer turns round.
   *
   * THIS IS THE PICTURE. The city's sky is a slot between rooftops and it is mostly black by
   * design; the frontier's is half the frame, and if it is black the world is a black rectangle
   * with a thin strip of town along the bottom. So the dome is BANDED — five bands, each one a
   * different swatch, and the bands are the composition:
   *
   *   0.00-0.05  the core       amber, dithered dense. Where the sun went down.
   *   0.05-0.20  the burn       ember, the classic sunset band, wide and warm
   *   0.20-0.36  the fade       slate, cooling and thinning
   *   0.36-0.46  earth shadow   violet, and the reason the palette has violet in it at all
   *   0.46+      the dome       azure at the bottom of its range, plus whatever stars.js adds
   *
   * All five are measured in FRACTIONS OF THE GRID (CFG.rows), never in rows, so a 100-row frame
   * gets the same sky a 60-row one does — the same rule surfaces.js's light-pollution ramp learned
   * the hard way.
   *
   * THE BANDS ARE THIS WIDE BECAUSE THE TOWN IS IN THE WAY, and the first cut of them was not.
   * They were originally sized as fractions of the SKY (core to 0.03, dome from 0.30), which is
   * roughly what a sunset subtends in real elevation — and almost none of it was ever visible,
   * because a two-storey building thirty metres away covers everything under about 12 degrees and
   * the only sky the frame actually contains is the part above it. Measured at 200x60: the visible
   * dome runs to a = 0.56 and the buildings ate everything under 0.30, so four of the five bands
   * were behind the town and the whole sky printed as the fifth one, which is the empty one. What
   * is sized here is therefore the PICTURE, not the atmosphere: the burn has to be where the sky
   * that can be seen is.
   *
   * And all five are gated on the BEARING: the core is only where the sun is, and the bands narrow
   * and dim round the compass until the eastern sky is nearly out. A sunset that is the same in
   * every direction is a gradient, not a sunset. */
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

    /* Elevation, in the pitch- and zoom-invariant units surfaces.js established, then normalised
     * to the grid so the gradient below is a fraction of the picture. */
    var ey = Math.floor((hor - sy) * vs);
    var a = ey / rows;
    if (a < 0) a = 0;

    /* How far round from the sun this column is, 0 at the sunset and 1 opposite it. */
    var bear = sx / kk;
    var da = bear - SUN_AZ;
    da = Math.atan2(Math.sin(da), Math.cos(da));       // wrapped to -PI..PI
    var away = Math.abs(da) / Math.PI;
    /* The sunset's reach round the horizon. Squared, so the glow is concentrated in the western
     * quadrant and gone by due east rather than tapering all the way round. */
    var west = 1 - away; west = west * west * (0.55 + 0.45 * west);

    /* Dust and cloud both eat the sky. Dust raises the floor of the whole dome (more scatter, so
     * more light everywhere and less contrast); cloud takes the top off. */
    var lift = 0.90 + 0.50 * wDust;
    /* CLOUD TAKES THE TOP OFF AT NIGHT AND DOES NOT BY DAY, and the two are the same physical fact
     * read at two light levels. At night the deck is a lid: there is nothing above it, so covering
     * the sky removes the sky. At noon the deck is LIT FROM ABOVE — an overcast midday sky is the
     * brightest large surface in any frame that contains one, and it is the whole hemisphere rather
     * than a hole in it. Measured: the schedule had wCloud at 1.00 at seed 42 frame 300, so `cap`
     * was 0.48 and it was halving every term below at noon; the sky came out 47.9% covered with a
     * mean lum of 112, i.e. half a sky. 0.80 of the cut removed leaves cloud still costing about a
     * tenth by day, which is the difference between an overcast noon and a clear one. */
    var cap = 1 - 0.52 * wCloud * (1 - 0.80 * dFill);

    /* ---- THE HOUR, and it is the largest term in this function ----------------------------------
     * Everything below was written at a fixed dusk and reads as one: an exponential falling away
     * from a burn on the horizon. That IS a dusk sky, and it is wrong at every other hour.
     *
     *   dSky scales the whole thing, so at night the dome goes out and the stars have something to
     *     be seen against.
     *   dWarm decides whether the gradient is a SUNSET or a DAY SKY. At dawn and dusk it is 1 and
     *     the tiers below run amber-ember-slate-azure, which is what they were built to do. Toward
     *     noon it goes to 0 and they re-swatch to white-white-ice-ice — a pale band at the horizon
     *     under a deep blue dome, which is what a desert sky at midday is.
     *   The e-fold OPENS UP toward noon for the same reason: a sunset is concentrated at the
     *     horizon because the light is coming through a great deal of air, and at noon the sky is
     *     nearly uniform with only a slow darkening upward. */
    var warmK = dWarm;
    var efold = 0.50 + 0.95 * (1 - warmK);

    /* THE GRADIENT, and it is one exponential rather than five bands. The banded version is in the
     * history of this file and it did not survive contact with the town: bands sized as fractions
     * of the SKY put four of their five behind a roofline, because the only sky a street canyon
     * contains is the part high enough to clear the buildings — measured at 200x60, the visible
     * dome ran a = 0.08 to 0.56 and every warm band was under 0.20.
     *
     * An e-fold at 0.50 of the grid keeps two thirds of the light at the top of the frame, which is
     * both what a real dusk does (the sky does not go out at 25 degrees) and what this frame needs:
     * the sky is half the picture out here and a sky that is black above the rooflines is a black
     * rectangle with a town along the bottom. The COLOUR then comes off the same number, so the
     * bands still exist — they are just level sets of one field instead of five hard edges, which
     * also means they bend correctly round the compass instead of running level all the way to
     * due east. */
    var e = Math.exp(-a / efold) * (0.30 + 0.70 * (warmK * west + (1 - warmK) * 0.55)) *
            lift * cap * (0.10 + 1.05 * dSky);

    var hs = hash2(sx, ey, C ? C.skySeed : 0x5EED);
    var hs2 = hash2(sx, ey, (C ? C.skySeed : 0x5EED) ^ 0x11);

    /* THE EARTH SHADOW, taken first because it is the one feature that is strongest AWAY from the
     * sun and would otherwise never win a test against the gradient. It is the band of the planet's
     * own shadow rising in the east, pink-violet over blue: real, about ten minutes long, and the
     * only reason this world touches violet at all. Dithered to a few cells per column — violet's
     * EXPOSURE weight is 0.34 and it goes gaudy the instant it is given area. */
    var band = a > 0.16 && a < 0.44 ? 1 - Math.abs(a - 0.30) / 0.14 : 0;
    if (band > 0) {
      var ve = band * away * away * cap * lift;
      if (hs < 0.075 * ve) return sset(G_DOT, P.violet, (70 + 96 * ve) * (0.7 + 0.5 * hs2));
    }

    /* Coverage climbs steeply with the field: the burn is a BAND, dense enough to be a mass, and
     * the upper dome is a scatter. A uniform dither over both gives a sky with a colour ramp and no
     * structure, which reads as a gradient rather than as weather. */
    /* ---- AND THE DOME FILLS ----------------------------------------------------------------------
     * The dither is the sky's structure at dusk: the burn is a mass, the upper dome is a scatter,
     * and the black between the cells is the night the frame is going into. At noon there is no
     * black between the cells — a daylight sky is a continuous surface and the largest single
     * object in a frontier frame — so the coverage goes to 0.96, and what carries the tone is the
     * four-tier ladder below rather than how much of the dome got painted. 0.96 and not 1.00: the
     * few per cent that stay open are what stop the dome reading as a flat card, and they are where
     * stars.js and west_sky.js's own passes have somewhere to land. */
    var covr = 0.05 + 1.18 * e;
    covr += (0.96 - covr) * dFill;
    if (hs < covr) {
      /* Four swatches off one field. The thresholds are where they are because of core.js's
       * EXPOSURE ladder rather than because of the sky: amber (0.50) and ember (0.42) can carry a
       * bright band, slate (0.60) is the workhorse of the middle, and azure (1.00) is the highest
       * gain in the table — which is why the top of the dome is written at lum 14-40 and still
       * reads as deep blue rather than as nothing. Written any brighter, azure at the top of the
       * frame is the loudest thing in the picture and the sky stops being behind the town. */
      /* THE HOT LINE IS A FACT ABOUT THE SWATCH, NOT ABOUT THE LIGHT. core.js caps ember at a
       * printed 163 whatever lum it is handed, so the sunset band — which is the brightest thing in
       * this world by any physical reading — can never reach the v>=170 the print counts as a
       * highlight. Only amber (ceiling 180) and pure (255) can, and only over lum ~215. So the core
       * of the burn is written in those two and its surround in ember, which is also what it looks
       * like: a sunset has a white-hot middle and an orange rest, and the rest is not a highlight. */
      /* THE SAME FOUR TIERS, RE-SWATCHED BY THE HOUR. A sunset's ladder is amber-ember-slate-azure;
       * a midday sky's is white-white-ice-ice, and the two share their SHAPE because the shape is
       * "brightest where you are looking through the most air". Blending the swatch rather than the
       * geometry is what lets one function be both — and it is also the only way to do it, because
       * this renderer cannot blend two palette indices. The choice is made per tier and per hour,
       * and the dither does the mixing. */
      /* TWO LADDERS OVER ONE FIELD, chosen by the hour, because a sunset and a midday sky are not
       * the same picture at different brightnesses. They share the field `e` — "how much air am I
       * looking through" — and nothing else.
       *
       * THE SUNSET LADDER is amber over ember over slate over azure, concentrated near the horizon
       * by a short e-fold. THE DAY LADDER is a pale band low down and then blue all the way up,
       * and its thresholds are pushed HIGHER so that white is confined to the horizon band: the
       * first cut used the same thresholds for both and painted the whole dome white, which is a
       * sky with the sun in every part of it. A desert sky at noon is deep blue overhead and pale
       * only where it meets the ground.
       *
       * Ice rather than azure by day, and that is the day EXPOSURE table talking: core.js drops
       * azure from 1.00 to 0.30 in daylight and lifts ice from 0.36 to 0.66, so the swatch that
       * carries a blue sky swaps over with the ladder. */
      if (warmK > 0.42) {
        if (e > 0.80) return sset(G_EQ, P.pure, 168 * (0.7 + 0.4 * hs2));
        if (e > 0.58) return sset(G_EQ, P.amber, 248 * (0.72 + 0.32 * e) * (0.86 + 0.22 * hs2));
        if (e > 0.32) return sset(e > 0.46 ? G_EQ : G_DASH, P.ember,
                                  204 * (0.50 + 0.72 * e) * (0.78 + 0.40 * hs2));
        if (e > 0.13) return sset(G_TICK, P.slate, 138 * (0.52 + 0.78 * e) * (0.78 + 0.38 * hs2));
        return sset(G_DOT, P.azure, (16 + 46 * e) * (0.7 + 0.6 * hs2));
      }
      /* ---- AND THE PALE BAND IS NOT PAPER ---------------------------------------------------
       * The two white tiers were written at 214 and 176 and print at 186-236 and 139-185, and
       * white's hot line is lum 184 — so nearly all of the first tier and the top of the second sit
       * above the census's highlight line. On a frame with a lot of visible dome that is the other
       * half of the hot tail the road was carrying: measured at seed 7 frame 900 noon, 684 of 1450
       * hot cells were sky, and under `dust` — where `lift` puts the horizon into the top tier
       * outright — 885 of 1383.
       *
       * A midday sky IS the brightest thing in a frontier frame and it stays that way; what it
       * must not be is CLIPPED, because a clipped band has no gradient in it and the dome stops
       * receding upward. 0.80 measured across the day frames: seed 7 12.21% -> 7.45%, seed 42 under
       * dust 13.18% -> 7.34%, seed 42 clear 5.66% -> 5.31%, with muddy moving less than half a
       * point at any of them. Rejected 0.74, which is another point of tail for a horizon band that
       * has started to read as overcast; rejected scaling the two ICE tiers with them, which is the
       * blue dome and is nowhere near the line — that version put a point of muddy back on.
       *
       * On the fill, so night and both twilights are the identity: at dFill 0 this is exactly 1 and
       * the sunset ladder above is the one being used anyway. */
      var dayHz = 1 - 0.20 * dFill;
      if (e > 0.80) return sset(G_EQ, P.white, dayHz * 214 * (0.80 + 0.24 * e) * (0.88 + 0.18 * hs2));
      if (e > 0.62) return sset(G_DASH, P.white, dayHz * 176 * (0.72 + 0.32 * e) * (0.86 + 0.22 * hs2));
      if (e > 0.38) return sset(G_TICK, P.ice, 168 * (0.62 + 0.50 * e) * (0.82 + 0.30 * hs2));
      return sset(hs2 > 0.6 ? G_COLON : G_DOT, P.ice, (54 + 150 * e) * (0.78 + 0.36 * hs2));
    }
    return sset(0, P.shadow, 0);
  }

  /* 210 m against the city's 125, and a gentler curve on top of it. These used to live in
   * surfaces.js as WEST_START/WEST_END, selected by a boolean; they belong to the painter, and a
   * painter that does not declare them inherits the city's. A frontier main street is 17 m wide
   * with two-storey buildings on it, so the far end of it is 150 m away and IN FRAME — under the
   * city's ramp all of it, plus every butte behind it, printed as black. The exponent moves with
   * the range because the point of a long ramp is its far end. */
  var FOG_START_W = 20.0, FOG_END_W = 210.0, FOG_POW_W = 1.25;

  /* ---- AND THE RAMP OPENS UP BY DAY, because distance stops meaning darkness ---------------------
   * surfaces.js's fog() is honest about what it is: "attenuation toward BLACK, never toward grey —
   * there is no atmospheric scatter colour in the references, distant buildings simply stop
   * emitting". That is a true statement about a city at night and a false one about a desert at
   * noon, where the air between the eye and the far end of the street is the BRIGHTEST thing in the
   * frame — a mesa fifteen kilometres out is pale blue-grey, not black. The renderer can only scale
   * lum, so the nearest thing to aerial perspective available is to stop taking so much away, and
   * that is these two numbers.
   *
   * `fogPow` 1.25 -> 0.72 is the whole of it. The ramp is k^p with k running 1 at fogStart to 0 at
   * fogEnd, so a smaller exponent lifts the MIDDLE of the ramp and leaves both ends pinned: at the
   * half-way mark k^1.25 keeps 42% of a cell's lum and k^0.72 keeps 61%, and at three quarters out
   * it is 18% against 38%. That band — 60 to 150 m, the far half of a main street and every butte
   * behind it — is where a frontier noon frame was still coming out black after the walls, the road
   * and the sky had all been filled.
   *
   * `fogStart` 20 -> 40 m holds the near half of the street at full strength, which is what makes
   * the ramp read as DEPTH rather than as an overall dimming. Rejected pushing fogEnd out with them
   * (raycast.js marches to whatever this returns, so it is the one of the three that costs time)
   * and rejected fogPow 0.5, which flattens the ramp far enough that the far end of the street
   * stops receding at all — the depth cue that the slate entry in core.js spends a paragraph on.
   *
   * GETTERS, for the same reason SUN_AZ became one: surfaces.js re-reads all three in refog(),
   * which weatherAt() calls once per frame, so a getter is picked up every frame and a copied value
   * would freeze the ramp at whatever the sun was doing when this module loaded. At dFill 0 they
   * return the shipped constants exactly. */
  CC.SurfWest = { id: 'west',
                  facade: facade, floorTex: floorTex, sky: sky, STYLE: STYLE_W,
                  fogEnd: FOG_END_W,
                  sunOf: sunOf, BOARDWALK: BOARDWALK };
  Object.defineProperty(CC.SurfWest, 'fogStart',
    { get: function () { return FOG_START_W + 20.0 * dFill; } });
  Object.defineProperty(CC.SurfWest, 'fogPow',
    { get: function () { return FOG_POW_W - 0.53 * dFill; } });
  /* GETTERS, because these three stopped being constants when the sun started moving and five
   * call sites in three element files read them by name. A getter kept every one of them correct
   * without an edit; a copied value would have frozen each reader at whatever the sun was doing
   * when its module loaded. */
  Object.defineProperty(CC.SurfWest, 'SUN_AZ', { get: function () { return SUN_AZ; } });
  Object.defineProperty(CC.SurfWest, 'SUN_X', { get: function () { return SUN_X; } });
  Object.defineProperty(CC.SurfWest, 'SUN_Z', { get: function () { return SUN_Z; } });
  Object.defineProperty(CC.SurfWest, 'SUN_ALT', { get: function () { return SUN_ALT; } });
  /* THE DAY FILL, published for the same reason the three above are: this world's element files
   * need the same "how much day is in the frame" number the painter uses, and two definitions of it
   * is two clocks. west_sky.js and west_town.js read it through here. A GETTER, not a value —
   * dayAt() refreshes it once per frame and a copied number freezes at load. */
  Object.defineProperty(CC.SurfWest, 'dayFill', { get: function () { return dFill; } });
  /* And the refresher itself, because an element draws BEFORE the world pass has run in exactly one
   * case — an element at a layer under the caster — and a stale dFill there is a frame of the wrong
   * hour. Cached on t, so calling it costs one compare. */
  CC.SurfWest.dayAt = dayAt;
  /* Self-registration: surfaces.js never learns this file's name. */
  if (!CC.SURFACES) CC.SURFACES = {};
  CC.SURFACES.west = CC.SurfWest;
  if (typeof module !== 'undefined') module.exports = CC.SurfWest;
})(typeof CC !== 'undefined' ? CC : require('./core.js'));
