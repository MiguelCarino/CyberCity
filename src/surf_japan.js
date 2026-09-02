/* CyberCity EDO surfaces — the texture layer for the fourth world, and the fourth sibling of
 * surfaces.js, surf_west.js and surf_moon.js. Same three entry points, same signatures, same
 * output records, same rule that nothing here may know about the camera. surfaces.js delegates to
 * this file when CC.World says japan, and it keeps owning fog(), configure() and cfg — those are
 * facts about a projection and a print rather than about a place.
 *
 * ---- THE HOUR, AND THE WEATHER, AND THEY ARE THE SAME QUESTION HERE -----------------------------
 * Each of the three worlds before this one opens by naming its light and every one of them names a
 * DIRECTION: the city is lit from the street by sodium and screens, the frontier by one low sun
 * that decides which side of the road you are on, the Moon by an unfiltered sun with nothing to
 * soften it. This world's light has no direction worth speaking of, and that is the whole of its
 * look: a castle town in the sixth month is under cloud, and cloud is not a filter over a sun, it
 * is a LIGHT SOURCE THE SIZE OF THE SKY. Everything below follows from that one fact.
 *
 *   1. THE KEY IS THE DOME. `sunOf` below reads the same face normal every other painter reads and
 *      then throws most of it away, because under a deck the two sides of a street are within a
 *      stop of each other. What is left of the directional term is scaled by how much of the sky
 *      is open (see `openSky`), so the split comes BACK on the two dry rows of the weather table
 *      and the world gets a hard-lit hour on the days it is not raining. That is the same lever
 *      surf_west.js pulls with SUN_ALT, pulled with cloud instead.
 *   2. WHAT MODELS A SURFACE IS ITS ANGLE TO THE SKY, not to the sun. A horizontal takes the whole
 *      hemisphere and a vertical takes half of it, so under cloud a tiled roof is roughly twice the
 *      wall beneath it — and since the eaves in this world are enormous, that ratio IS the
 *      building. It is why `SKY_UP` below is 1.00 and `SKY_SIDE` is 0.52 and why the eave course
 *      gets the brightest band on every facade at every hour.
 *   3. THE OTHER HALF OF THE LIGHT COMES FROM INDOORS. A machiya front at dusk is a rank of paper
 *      screens with an oil lamp behind each one, and paper is not a window: the whole sheet emits.
 *      So `lit` in this world does not mean "a hole with a lamp in it", it means the wall itself is
 *      the lamp over a 0.9 x 1.7 m panel, which is why the lit glyphs in city.js's STYLE_CH_JP are
 *      the two heaviest the print will take.
 *   4. AND EVERYTHING IS WET. Not as an effect — as the ground state. weather_state.js's
 *      PRESETS_JAPAN has no row with `wet` under 0.20, so the road below always has standing water
 *      in it and always returns a mirror strength, and the single most valuable thing this file
 *      does is hand raycast.js's reflect pass a puddle under a lit shopfront.
 *
 * ---- WHAT THE PALETTE IS ALLOWED TO DO ----------------------------------------------------------
 * The trap this world sets is vermilion. It is the colour everyone has in mind for the setting, it
 * is `ember` and `red` in core.js's table, and a painter that reaches for it paints a town that
 * exists on a poster and nowhere else. The real materials are: unpainted cedar weathered to grey,
 * lime plaster, grey clay tile, rammed earth, moss and wet stone. So:
 *
 * Printed ceilings, night and day, measured through core.js's own LUT rather than guessed — a
 * swatch's printed value is its pigment's max channel scaled by the live ladder, which is what
 * tools/metrics.py counts and what decides everything below:
 *
 *   timber  111 / 120 — the frame, the post, the lattice, the shutter. The most numerous swatch in
 *                       this world by a wide margin, and one that can never be bright
 *   sand    138 / 190 — the same cedar with light on it, and wet earth under a lamp. The swatch
 *                       that gains most between the two ladders after white
 *   white   151 / 209 — lime render, the kura, wet stone under a lantern
 *   stone   122 / 145 — clay tile, the castle base, dry flagstone
 *   warm    167 / 187 — THE LAMP BEHIND THE PAPER, and the brightest thing in the town
 *   moss     94 / 102 — the garden, the algae on a north wall, the rain on old wood
 *   ember   163 / 136 — lacquer, and ONLY on a temple lot, a torii or a sign
 *   indigo  115 / 104 — the shade swatch, and the dye of every piece of cloth here
 *   pure    234 / 220 — specular ONLY, and see the note below
 *   ice     174 / 195 — core.js licenses it for "rain highlight" and that is the whole of its job
 *                       here: the glint off running water and off a wet kerb
 *
 * AND THE ARITHMETIC THAT COMES OUT OF THAT COLUMN, because it decided two things in this file.
 * The print's hot line is v 170. At NIGHT the only swatches in the whole palette that can reach it
 * are amber 179, azure 219, red 206, ice 174 and pure 234 — and the first three are a sodium lamp,
 * a screen and a signal, none of which exists in this century. `warm` tops out at 167: a paper
 * lantern painted in the materially correct swatch is three points under the line at any luminance
 * whatsoever, and a night frame of this world censused 0.00% hot with two hundred cells of lantern
 * in it. That is not a tuning error, it is the ladder, and the answer is not to repaint the lantern
 * in a swatch that lies about what it is. It is to spend the two swatches that ARE licensed for
 * this, sparingly and where they are physically right: the blown-out core of a near lantern (pure —
 * core.js says "specular hits only, use sparingly", and the paper directly over a flame is exactly
 * that in every photograph ever taken of one) and the glint off moving water (ice). Both are one
 * cell at a time.
 *
 * INDIGO IS THIS WORLD'S SHADOW SWATCH and that is worth stating rather than deriving. surf_west
 * uses `slate` after dark because slate is the night's shade swatch and its whole frame was tuned
 * on it; this world is wet, and wet shade under an overcast sky has the SKY in it, which is what
 * core.js says indigo is for ("shade with sky in it"). It also happens to be the colour the entire
 * population of this setting is dressed in, which is a coincidence the element file gets to use.
 *
 * ---- THE RULE THAT REPLACES ALL OF IT -----------------------------------------------------------
 * TONE IS FLAT AND EDGES ARE EVERYTHING. This world has no contrast to spend: an overcast frame is
 * a narrow band of mid-greys with two or three warm holes punched in it, and the print's muddy band
 * is exactly where a narrow band of mid-greys lands. What keeps it out of the mud is LINES — the
 * eave course, the drip edge under it, the sill, the ridge of the flagstone, the gutter, the batter
 * line of the castle wall — drawn hard and drawn bright, with the fields between them left thin.
 * A cell of this world is a line or it is nearly nothing.
 */
(function (CC) {
  'use strict';

  var P = CC.P, g = CC.g, hash2 = CC.hash2, clamp = CC.clamp, vnoise = CC.vnoise, smooth = CC.smooth;

  var G_DOT = g('.'), G_COMMA = g(','), G_COLON = g(':'), G_QUOTE = g("'"),
      G_TICK = g('`'), G_DASH = g('-'), G_UNDER = g('_'), G_EQ = g('='), G_TILDE = g('~'),
      G_PIPE = g('|'), G_PLUS = g('+'), G_8 = g('8'), G_o = g('o'), G_X = g('X'), G_STAR = g('*'),
      G_DQ = g('"');

  /* The one thing this file and surfaces.js MUST agree on, because raycast.js configures only one
   * of them: the config block. Resolved lazily rather than captured, so load order cannot bite. */
  function cfg() { return CC.Surf ? CC.Surf.cfg : null; }

  /* ---- the key light -----------------------------------------------------------------------------
   * The bearing is the director's, unrotated. surf_moon.js turns its sun through PI because an
   * airless world only reads down-sun, and surf_west.js takes the director's -0.5 rad as the whole
   * composition of a sunset in frame. Neither argument applies here: under a deck there is no
   * sunset to place and no shadow to converge, so the sun goes where the clock puts it and the two
   * dry rows of the weather table get an ordinary raking light down an ordinary street.
   *
   * These four are exported as GETTERS at the bottom of the file for the same reason the other two
   * painters export theirs: src/proj.js's litFace() and every element that places a lit face read
   * SUN_X/SUN_Z off whichever painter owns the live world, and a copied value freezes each reader
   * at whatever the sun was doing when its module loaded. */
  var SUN_AZ = -0.5;
  var SUN_X = Math.sin(SUN_AZ), SUN_Z = Math.cos(SUN_AZ), SUN_ALT = 0.16;

  /* ---- the clock, sampled once per frame ---------------------------------------------------------
   * EVERY FIELD DECLARED BELOW IS ASSIGNED INSIDE THIS BODY, which is not a style note: the
   * contract records two frontier files that kept a per-frame cache, had one field left unassigned
   * when the projection scaffolding moved out, and quietly stopped following the clock while the
   * street behind them still did. Nothing reported it; a byte comparison caught it.
   *
   * `dFill` is the same threshold-and-smoothstep surf_west.js uses and the threshold is the same
   * 0.70, because the reason for it is the same: the clock reports sky 0.657 at BOTH dawn and dusk,
   * and those two hours are this world's signature exactly as they are the frontier's. Gating on
   * dSky raw would pour two thirds of the day treatment into the one hour that is already right.
   *
   * `dNight` is a crossfade rather than the director's hard `P.night` flag, for the same reason
   * surf_moon.js publishes one. It is NOT what gates the lamps — see lampAt, where using it was a
   * bug — it is published for the element files, which want a smooth "how dark is it" for things
   * that are not artificial light: how bright a stone lantern's own masonry is, how far a torii
   * has gone to silhouette, how a petal reads against the sky. A hard `P.night` in any of those
   * would snap while this file is still halfway through its own handover. */
  var dT = 1 / 0, dSun = 0.10, dSky = 0.12, dWarm = 0.30, dLamp = 1, dStar = 1,
      dFill = 0, dNight = 1;
  function dayAt(t) {
    if (t === dT) return;
    dT = t;
    var D = CC.Daylight;
    if (!D) return;                     // standalone require: hold the tuned wet evening
    SUN_AZ = D.P.az; SUN_ALT = D.P.alt;
    SUN_X = Math.sin(SUN_AZ); SUN_Z = Math.cos(SUN_AZ);
    dSun = D.P.sun; dSky = D.P.sky; dWarm = D.P.warm; dLamp = D.P.lamp; dStar = D.P.star;
    dFill = smooth(clamp((dSky - 0.70) / 0.30, 0, 1));
    dNight = smooth(clamp((0.30 - dSky) / 0.30, 0, 1));
  }

  /* ---- weather, sampled once per frame -----------------------------------------------------------
   * Same cache-on-t trick and the same rel() migration rule as everywhere else: 1.0 is the look the
   * build was tuned under, so a constant multiplied by rel('wet') keeps its value until the weather
   * actually moves. `wCloud` and `wHaze` are read RAW off P, because neither has a reference value
   * to be relative to — the frontier's note about `dust` applies verbatim, and cloud cover is the
   * single most important number in this file. */
  var wT = 1 / 0, wWet = 1, wRain = 1, wWind = 1, wCloud = 0.82, wHaze = 0.52;
  function weatherAt(t) {
    if (t === wT) return;
    wT = t;
    var W = CC.Weather;
    if (!W) return;
    wWet = W.rel('wet'); wRain = W.rel('rain'); wWind = W.rel('wind');
    wCloud = W.P.cloud; wHaze = W.P.haze;
  }

  /* HOW MUCH OF THE SKY IS A SUN, 0 under a lid and 1 on the two dry rows. Everything directional
   * in this file is multiplied by it and everything ambient is not, which is the one lever that
   * turns this world's light from "an overcast day" into "a bright one" without a second code path.
   * The curve is deliberately steep at the top: a tenth of cloud does almost nothing to a shadow
   * and three quarters of it removes the shadow entirely, which is what a thin overcast and a thick
   * one respectively do. */
  function openSky() { var k = 1 - wCloud; return k * k * (0.35 + 0.65 * k); }

  /* ---- what a face is worth ----------------------------------------------------------------------
   * The dome first, the sun second, and the ratio between them is `openSky`.
   *
   * THE DOME TERM IS AN ANGLE TO THE ZENITH AND NOT TO ANYTHING ELSE. A horizontal surface sees the
   * whole hemisphere; a vertical sees half of it, less whatever the building opposite is blocking —
   * and on a 6 m street with 6 m eaves, what the building opposite is blocking is most of it. That
   * is why SKY_SIDE is 0.52 rather than the geometric 0.50: the extra two points are the light
   * coming off the wet road, which under a bright overcast is a real and visible upward bounce and
   * is the only reason the bottom metre of a machiya front is not black.
   *
   * THE SUN TERM IS surf_west's, SCALED DOWN AND SCALED BY `openSky`. Its slope is 0.44 against the
   * frontier's 0.62, because even in clear air this is a maritime sky with water in it and the
   * shadows have edges you can put your hand through; the split is nothing like a desert's.
   *
   * AND THE FLOOR IS NOT MEAN. surf_west.js's floor is 0.05 + 0.16*dSky and its own comment
   * explains at length that halving it was what stopped a noon frame reading as one field of
   * mid-tone. This world needs the opposite: under a deck the shaded side of a street is genuinely
   * only a stop under the lit side, and a mean floor would have printed the entire town at the
   * bottom of the ladder in exactly the weather it is supposed to be seen in. So the floor here is
   * the DOME, which is a real quantity, and the contrast the frame needs is bought back in the
   * glyphs instead — see the header's note on lines. */
  var SKY_UP = 1.00, SKY_SIDE = 0.52;
  function sunOf(cell) {
    var dome = SKY_SIDE * (0.16 + 0.84 * dSky);
    var op = openSky();
    if (!cell || cell.faceX === undefined) return dome + 0.18 * dSun * op;
    /* The face crossed by a ray stepping +side has its outward normal pointing -side. */
    var nx = cell.faceX ? -cell.side : 0, nz = cell.faceX ? 0 : -cell.side;
    var d = nx * SUN_X + nz * SUN_Z;
    var split = 1 - 0.58 * clamp(SUN_ALT / 0.95, 0, 1);
    var f = clamp(0.5 + 0.44 * d * split, 0, 1);
    /* sqrt(dSun) for the same reason surf_west.js takes it: apparent brightness is not linear in
     * illuminance, and scaling a surface linearly by a sun that falls to 0.64 at the golden hour
     * made the frontier's best hour a third darker than the fixed dusk it was tuned as. */
    var direct = 0.62 * f * f * (3 - 2 * f) * Math.sqrt(dSun) * op;
    return clamp(dome + direct, 0, 1.25);
  }

  /* ---- THE LAMP WASH, and it is the piece of light this project did not have -----------------------
   * Every other world in this tree is lit from ABOVE or from a long way OFF: the city by its own
   * signage and a sodium grid, the frontier by one low sun, the Moon by another. What none of them
   * has is a light source at chest height a metre from the wall — and that is the entire lighting
   * situation of a machi street after dark. The lanterns are hung under the eaves at about 2.1 m,
   * every shopfront is a paper screen with an oil lamp behind it, and both of those are INSIDE the
   * street rather than over it.
   *
   * What that does to a wall is the whole look, and it is a thing worth naming: A LAMPLIT STREET IS
   * BRIGHT AT THE BOTTOM AND BLACK AT THE TOP. Sun and sky do the opposite — they light the eave
   * course and leave the ground in shadow — so this term is not a brightness adjustment, it is the
   * second of two lighting models running at once, and which of the two the frame is under is what
   * the clock decides.
   *
   * THE PROFILE. Full to 1.0 m, falling to nothing by 3.6 m. That is a 1/r^2 rolled flat: the real
   * falloff from a point source at 2.1 m is far steeper than this and it looked wrong, because a
   * real street has a lantern every few metres and what you actually stand in is the sum of a dozen
   * of them. So the curve is the ENVELOPE rather than one lamp, and the one lamp's own falloff is
   * in the element file where the lantern is.
   *
   * WHY IT ALSO SOLVES THE PRINT. Measured before this existed: a night frame censused 44-62% muddy
   * across four seeds against a target of 30, with a hot tail of 0.00%, and the cause was
   * structural rather than a wrong constant. With the dome as the only key, `sunOf` returns 0.083
   * at night, so every `(A + B*sun)` in the file collapsed onto its A — and the A's are 14 to 52,
   * which is the middle of the print's range, drawn over the whole of every wall. The frame was one
   * flat field of exactly the tone core.js's ladder is trying to keep out of the picture. The wash
   * splits it in two: the bottom metre and a half of every wall comes UP out of the muddy band and
   * the rest of it goes DOWN out of it, which is both a better picture and a better census, and it
   * is the same trade the ladder itself makes.
   *
   * ZERO BY DAY, which is the project's standing invariant read the other way round. The rule is
   * that a daylight scale must be the identity at night; this is a NIGHT scale, so it must be the
   * identity at noon, and `dLamp` is exactly zero once the sun is up. */
  function lampAt(v) {
    /* `dLamp` ALONE, and never `dNight * dLamp`, and this is the contract's "read the RIGHT
     * direction" rule catching a real error rather than a style point. daylight.js says `lamp` is
     * "artificial light: 1 at night, 0 in the day, WITH HYSTERESIS", and it spends a paragraph on
     * why the curve is asymmetric — a lamp goes on before it is properly dark and stays on after it
     * is properly light, which is what people do. Multiplying it by a second night crossfade of my
     * own put every lantern in the town out at dSky 0.30, which the clock reaches an hour before
     * dusk: the frame lost its whole lighting model at exactly the hour the world is built around.
     * The director already owns the crossfade; nothing here needs to invent one. */
    var k = dLamp;
    if (k <= 0.001) return 0;
    var f = v <= 1.0 ? 1 : (v >= 3.6 ? 0 : (3.6 - v) / 2.6);
    return k * f * f * (3 - 2 * f) * 0.86;
  }

  /* ---- cell metadata, defensively ----------------------------------------------------------------
   * Same contract as the other two painters: city.js owns the record, this file degrades rather
   * than throws on a field that is not there. */
  function seedOf(cell) {
    if (!cell || typeof cell !== 'object') return 0;
    return cell.seed !== undefined ? (cell.seed | 0) : 0;
  }

  /* ---- what a wall is made of --------------------------------------------------------------------
   * Indexed by city.js's style with EDO's base of 10 taken off. The fields are the frontier's
   * vocabulary read against a different building:
   *
   *   `pitch` is the rhythm the eye reads the wall by and it is the most visible number in the file.
   *     A koshi lattice is slats at 11-14 cm centres, which at the ~4 cm a screen column covers at
   *     6 m is a three-cell beat — dense enough to mass, coarse enough not to alias into a moire.
   *     A shoji grid is 30 cm; a tile course 24 cm; a plaster wall has no rhythm at all and says so
   *     with `flat`.
   *   `bay` is the frontage one structural span owns, and it is 2.7-3.4 m — the ken, near enough,
   *     and about half the frontier's 4.0-5.6. A machiya is a frame building on a module and the
   *     module is small; that is what makes the wall read as CARPENTRY rather than as cladding.
   *   `gnd` is the height of the ground storey and `up` of the one over it, and both are LOW: 2.3
   *     and 1.9 against the frontier's 2.9 and 2.55. The upper floor of a machiya is a half-storey
   *     under the roof that you cannot stand up in at the eaves, and that squatness is most of
   *     what says "not a western town built out of the same timber".
   *   `vert` turns the rhythm through ninety degrees: lattice and batten run up, tile and beam run
   *     across, and `flat` draws neither.
   *   `panel` is how much of the bay is opening rather than wall, and it is where this world is
   *     furthest from every other one — 0.72 on the two street rows, against a punched window's
   *     0.2. A machiya front IS its opening; the wall is what is left over. */
  var JP_ST = [
    /* 0 machiya  */ { pitch: 0.13, bay: 2.90, gnd: 2.30, up: 1.90, panel: 0.72, vert: 1, flat: 0 },
    /* 1 shoji    */ { pitch: 0.30, bay: 2.70, gnd: 2.20, up: 1.85, panel: 0.80, vert: 1, flat: 0 },
    /* 2 kura     */ { pitch: 0.90, bay: 3.40, gnd: 2.60, up: 2.10, panel: 0.16, vert: 0, flat: 1 },
    /* 3 namako   */ { pitch: 0.34, bay: 3.20, gnd: 2.55, up: 2.05, panel: 0.22, vert: 0, flat: 0 },
    /* 4 temple   */ { pitch: 0.42, bay: 3.30, gnd: 3.10, up: 2.40, panel: 0.34, vert: 0, flat: 0 },
    /* 5 ishigaki */ { pitch: 0.62, bay: 3.60, gnd: 3.60, up: 3.60, panel: 0.00, vert: 0, flat: 1 }
  ];

  /* ---- the material tables -----------------------------------------------------------------------
   * INDEXED BY PALETTE SLOT WITH EVERY SLOT FILLED, which the contract requires by name and for a
   * measured reason: surf_west.js once carried `hue === P.warm || hue === P.white || hue === P.ember
   * ? hue : P.amber` and every material the district table learned to name after that line was
   * written fell off the end and printed as amber. A hue this file has no opinion about degrades to
   * its nearest neighbour here, never to a default.
   *
   * Three tiers rather than surf_west's three-with-a-sun-tier, and they mean something slightly
   * different because the light does: LIT is a surface facing the open sky, MID is the same surface
   * in the general shade of the street, SHD is under an eave or inside a recess. Under a deck those
   * are perhaps a stop apart rather than four, and the swatches are chosen to be a stop apart —
   * sand/timber/indigo rather than sand/timber/shadow. Nothing in this world goes to black except
   * the shadow under an eave, which gets `shadow` explicitly and by name. */
  var LIT = [
    /*  0 amber  */ P.sand,  /*  1 azure  */ P.stone, /*  2 ember  */ P.ember, /*  3 spring */ P.moss,
    /*  4 violet */ P.indigo,/*  5 white  */ P.white, /*  6 red    */ P.ember, /*  7 slate  */ P.stone,
    /*  8 warm   */ P.warm,  /*  9 ice    */ P.white, /* 10 pure   */ P.white, /* 11 shadow */ P.stone,
    /* 12 stone  */ P.stone, /* 13 timber */ P.sand,  /* 14 sand   */ P.sand,  /* 15 jade   */ P.jade,
    /* 16 rose   */ P.sand,  /* 17 gold   */ P.gold,  /* 18 moss   */ P.moss,  /* 19 indigo */ P.stone
  ];
  var MID = [
    /*  0 amber  */ P.timber,/*  1 azure  */ P.stone, /*  2 ember  */ P.timber,/*  3 spring */ P.moss,
    /*  4 violet */ P.indigo,/*  5 white  */ P.stone, /*  6 red    */ P.timber,/*  7 slate  */ P.stone,
    /*  8 warm   */ P.sand,  /*  9 ice    */ P.stone, /* 10 pure   */ P.stone, /* 11 shadow */ P.indigo,
    /* 12 stone  */ P.stone, /* 13 timber */ P.timber,/* 14 sand   */ P.timber,/* 15 jade   */ P.moss,
    /* 16 rose   */ P.timber,/* 17 gold   */ P.sand,  /* 18 moss   */ P.moss,  /* 19 indigo */ P.indigo
  ];
  var SHD = [
    /*  0 amber  */ P.timber,/*  1 azure  */ P.indigo,/*  2 ember  */ P.timber,/*  3 spring */ P.moss,
    /*  4 violet */ P.indigo,/*  5 white  */ P.stone, /*  6 red    */ P.timber,/*  7 slate  */ P.indigo,
    /*  8 warm   */ P.timber,/*  9 ice    */ P.indigo,/* 10 pure   */ P.stone, /* 11 shadow */ P.indigo,
    /* 12 stone  */ P.indigo,/* 13 timber */ P.timber,/* 14 sand   */ P.timber,/* 15 jade   */ P.indigo,
    /* 16 rose   */ P.timber,/* 17 gold   */ P.timber,/* 18 moss   */ P.moss,  /* 19 indigo */ P.indigo
  ];

  /* ---- the ink ramp ------------------------------------------------------------------------------
   * The same device surf_west.js's INK introduced and the same census behind it — a glyph is not a
   * pixel, and two cells at the same lum in the same swatch can differ tenfold in the ink the eye
   * actually receives. What differs is where this ramp STOPS. The frontier's runs to '%' at 27%
   * ink because a sunlit adobe wall is a solid surface; this one stops at '=' at 17%, because
   * under an overcast sky nothing in this world is a solid surface — a plaster wall in flat light
   * is a field with almost nothing in it, and filling it is precisely how a wet grey town turns
   * into a wall of mush. The heavy glyphs are reserved, here, for the things that emit: the paper,
   * the lattice over it, and the lamp. */
  var INK = [G_TICK, G_DOT, G_UNDER, G_DASH, G_COLON, G_TILDE, G_DQ, G_PLUS, G_EQ];
  function ink(k) { var i = (k * 9) | 0; return INK[i < 0 ? 0 : (i > 8 ? 8 : i)]; }

  var FOUT = { ch: 0, col: 0, lum: 0 };
  function fset(ch, col, lum) {
    FOUT.ch = ch; FOUT.col = col;
    FOUT.lum = lum < 0 ? 0 : (lum > 255 ? 255 : lum | 0);
    return FOUT;
  }

  /* Weathering at ~8 cm. Cedar left unpainted in this climate does not crack the way it does in a
   * desert, it goes BLOTCHY — dark where the water runs and silver where the sun gets at it — so
   * this is a wider spread than surf_west's grain and it never goes as dark. */
  function grain(u, v, sd, lod) {
    if (lod < 2) return 1;
    var h = hash2(Math.floor(u * 13), Math.floor(v * 13), sd ^ 0x71A3);
    return h < 0.18 ? 0.52 : 0.74 + h * 0.48;
  }

  /* ---- the castle wall ---------------------------------------------------------------------------
   * Ishigaki gets its own branch for the same reason the frontier's butte does: nothing about a
   * building applies to it. No bays, no storeys, no openings, no eave. What it has instead is the
   * one thing no other surface in this project has — a BATTER. A castle base is not vertical: it
   * curves, steeply at the top and almost flat at the bottom, and the curve is the whole
   * recognition. This renderer cannot lean a wall (the heightmap is prismatic), so the batter is
   * drawn as TEXTURE: the stone courses get taller and the blocks wider toward the foot, which is
   * what the real curve does to the coursing and is what the eye is actually reading.
   *
   * The blocks are irregular by construction — a `nozurazumi` wall is undressed rock fitted where
   * it lands — so the course offset is hashed per course and the joints never line up vertically.
   * That, and the fact that the joints are the only bright thing on it, is the read. */
  function stoneFace(u, v, cell, dist, sd, sun) {
    var h = cell && cell.h ? cell.h : 8;
    var q = clamp(v / (h > 1 ? h : 1), 0, 1);          // 0 at the foot, 1 at the top
    /* Courses 0.42 m at the top opening to 0.86 at the foot. Integrated rather than stepped, so
     * there is no seam where the pitch changes: the course index is the integral of 1/pitch. */
    var cy = v / (0.86 - 0.44 * q);
    var cr = Math.floor(cy), fy = cy - cr;
    var wide = 0.90 + 0.85 * (1 - q);
    var cx = u / wide + hash2(cr, sd, 0x2B71) * 3.1;
    var bx = Math.floor(cx), fx = cx - bx;
    var bh = hash2(bx, cr, sd ^ 0x51D);

    var lit = LIT[cell && cell.hue !== undefined ? cell.hue : P.stone];
    var mid = MID[cell && cell.hue !== undefined ? cell.hue : P.stone];
    var shd = SHD[cell && cell.hue !== undefined ? cell.hue : P.stone];

    /* The joint. It is a RECESS, so it is darker than the block in flat light and it is the line
     * that makes the wall read as masonry rather than as noise — drawn at every LOD for the same
     * reason the frontier's coping is. */
    /* A castle wall has no lantern under it — there is a moat and a ditch and thirty metres of
     * cleared ground, which is the point of a castle wall — so this branch reads `sun` alone where
     * the town's walls read `sun + lampAt`. What that buys the frame is the one large mass in the
     * world that is a SILHOUETTE at night, which is what a keep should be. */
    var cv = clamp(sun * 1.25, 0, 1); cv = cv * cv;
    if (fy < 0.13 || fx < 0.09)
      return fset(G_DASH, shd, (8 + 108 * sun) * (0.7 + 0.6 * bh));
    /* Moss in the wet courses, which is the bottom third of every castle wall in the country. */
    if (dist < 34 && q < 0.34 && bh < (0.20 + 0.24 * wWet) * (0.25 + 0.75 * cv))
      return fset(bh < 0.10 ? G_COMMA : G_QUOTE, P.moss, (24 + 130 * sun) * (0.6 + 0.8 * bh));
    /* The block face. Thin: a dressed-stone field at any density is the mush this world cannot
     * afford, and the joints above are carrying the picture. */
    if (bh > 0.62 * cv) return fset(0, P.shadow, 0);
    return fset(ink(0.16 + 0.40 * sun + 0.22 * bh),
                bh < 0.24 ? lit : (bh < 0.46 ? mid : shd),
                (18 + 200 * sun) * (0.72 + 0.5 * bh));
  }

  /* ---- one cell of a wall ------------------------------------------------------------------------ */
  function facade(u, v, cell, dist, t) {
    if (v < 0) v = 0;
    weatherAt(t === undefined ? 0 : t); dayAt(t === undefined ? 0 : t);
    var sd = seedOf(cell);
    var si = cell ? (((cell.style | 0) - 10) % 6) : 0;
    if (si < 0) si += 6;
    var sun = sunOf(cell);
    if (si === 5) return stoneFace(u, v, cell, dist, sd, sun);

    var st = JP_ST[si];
    var h = cell && cell.h ? cell.h : 6;
    var litR = cell && typeof cell.litRate === 'number' ? cell.litRate : 0.2;
    var hue = cell && typeof cell.hue === 'number' ? cell.hue : P.timber;
    var accent = cell && typeof cell.accent === 'number' ? cell.accent : P.warm;
    var lod = dist < 18 ? 2 : (dist < 44 ? 1 : 0);
    var gr = grain(u, v, sd, lod);
    var lit = LIT[hue], mid = MID[hue], shd = SHD[hue];

    /* THE TWO LIGHTS, SUMMED ONCE, AND EVERY LUMINANCE BELOW IS A FUNCTION OF THE SUM. `sun` is the
     * sky and whatever direct light gets through the deck; `lampAt` is the street's own lanterns,
     * which are a function of HEIGHT and of nothing else. `L` is what this cell is actually lit by
     * and it is the only illumination term the rest of this function is allowed to read.
     *
     * `cov` is the other half of the same idea and it is what keeps the print honest: how much of a
     * surface gets a glyph at all is a function of how lit it is. A wall in the dark is not a dim
     * wall, it is an ABSENT wall with a few edges catching something, and drawing it as a dim field
     * is precisely the muddy band the census complains about. Squared, so the fill falls away
     * faster than the brightness does — which is what makes an unlit upper storey go to nothing
     * while its lit ground floor is still a solid surface. */
    var L = clamp(sun + lampAt(v), 0, 1.3);
    /* CUBED, not squared, and the exponent is the difference between a picture and a field of
     * noise. With the square, `cov` at the foot of a lamplit wall is 0.81 — four cells in five get
     * a glyph — and a rendered night frame came back as an unbroken mat of ':' and '-' across the
     * whole lower half, with the lit shopfronts lost inside it. The lamp wash is supposed to make
     * the bottom of a wall READ, and what makes something read at this resolution is contrast
     * against blank, not coverage. Cubed it is 0.73 at the very foot, 0.35 at chest height and
     * nothing above the eaves, so the wash prints as a scatter that thickens toward the ground —
     * which is also what a lantern actually does to a wall it is hanging half a metre from. */
    var cov = clamp(L * 1.02, 0, 1); cov = cov * cov * cov;

    /* WHICH TIER THIS CELL TAKES, dithered rather than thresholded. The frontier's note on this is
     * the argument and it is the same argument: a whole wall changing swatch at one instant of the
     * clock is the large-area step the photosensitivity gate exists to catch. `k` is where this
     * face sits between shade and open sky; the share of LIT cells is k*k, because a wall at half
     * illumination is not half covered in highlight. */
    var mh = hash2(Math.floor(u * 3.7), Math.floor(v * 3.7), sd ^ 0x1F5);
    var k = clamp((L - 0.18) / 0.56, 0, 1);
    var mat = mh < 0.66 * k * k ? lit : (mh < 0.66 * k * k + 0.26 + 0.16 * k ? mid : shd);

    /* ---- THE EAVE, and it is the most important twelve lines in this file ----------------------
     * A machiya is a roof with a building under it. The eave oversails by 0.9-1.5 m, it is the
     * lowest thing on the elevation that catches the sky, and the deep band of shade it throws is
     * what separates one building from the next down a street where every building is the same
     * colour. city.js gives every lot a podium ring at 3.2-5.4 m under a taller core, so most
     * facades in this world present TWO of these — the eave of the skirt and the ridge above it —
     * and getting both right is most of the silhouette.
     *
     * Three courses, top to bottom:
     *   the ridge tile, 12 cm, the brightest line on the building at every hour and every LOD;
     *   the pantile field, 30 cm, a coarse across-the-wall beat — hongawara alternates a round cap
     *     with a flat pan and the beat of that is legible from the far end of a street;
     *   the drip edge, where the water comes off. In the wet it is LIT FROM UNDER by whatever the
     *     road is reflecting, which is the one place this world's light comes from below.
     * Then the shadow under it, which is 40 cm of near-nothing and is drawn as `shadow` on purpose
     * — it is the only true black on the elevation and the wall needs exactly one. */
    var top = h - v;
    /* THE RIDGE IS DRAWN BRIGHT AT EVERY HOUR AND IT IS THE ONE LINE HERE THAT IGNORES `cov`. A
     * roofline is what turns a black shape into a building — surf_west.js says the same thing about
     * its capping board and draws that at every distance and every LOD for the same reason. Its
     * floor is 126 rather than the 30-ish everything else on this wall gets in the dark, which puts
     * it clear of the print's muddy ceiling of 119 by construction: a night roofline is a LINE, and
     * a line at 100 is a smudge. */
    if (top < 0.12)
      return fset(G_EQ, L > 0.42 ? lit : mid, (126 + 96 * L) * gr);
    if (top < 0.42) {
      /* The pantile field. Under the lamps it is out of reach (a roof is 5 m up and the lanterns
       * are at 2), so this band takes `sun` alone and NOT L — which is the one place in the file
       * where the distinction is visible: at night the tile goes dark and the ridge line above it
       * stays lit, and the roof reads as an edge rather than as a surface. */
      var tw = hash2(Math.floor(u / 0.26), 0, sd ^ 0x3C1);
      if (tw > 0.28 + 0.72 * sun) return fset(0, P.shadow, 0);
      return fset(tw < 0.42 ? G_TILDE : G_DASH, tw < 0.42 ? mid : mat,
                  (34 + 168 * sun) * (0.7 + 0.5 * tw) * gr);
    }
    if (top < 0.58) {
      /* The drip. Wet, so it is picking up whatever the road is reflecting — which after dark is
       * the lanterns, and this is the only cell on the elevation lit from underneath. Dry, it is a
       * plain dark line. */
      var dw = hash2(Math.floor(u * 5.1), 0, sd ^ 0x7D3);
      if (wWet > 0.30 && dw < 0.34 * wWet)
        return fset(G_DOT, P.white, (40 + 96 * wWet) * (0.6 + 0.8 * dw));
      if (sun < 0.20) return fset(0, P.shadow, 0);
      return fset(G_UNDER, shd, 16 + 46 * sun);
    }
    if (top < 0.98) {
      /* Under the eave. Nearly nothing, and what little there is is the rafter ends — a rank of
       * short verticals on the bay module, which is one of the few pieces of Japanese carpentry
       * that is legible at this resolution. */
      var ru = u / (st.bay * 0.25), rf = ru - Math.floor(ru);
      if (lod === 2 && rf < 0.24 && top < 0.80 && sun > 0.16)
        return fset(G_PIPE, shd, 20 + 52 * sun);
      return fset(0, P.shadow, 0);
    }

    var bay = Math.floor(u / st.bay), fu = u / st.bay - bay;
    var bh = hash2(bay, sd, 0x3B7);                    // this bay's identity, stable forever

    /* THE POST. Every bay is bounded by a structural column and on an unpainted building it is the
     * darkest vertical on the wall; on a temple it is vermilion and the brightest. Either way it is
     * the line that says the wall is a FRAME, which is the single distinction between this world's
     * facades and the frontier's.
     *
     * AND IT IS WHERE THE DISTRICT'S `accent` GOES. raycast.js's own note says that dropping the
     * record's district fields "silently reduces the whole district system to dead code", and an
     * `accent` read out of the record and never used is the same failure one field along. One bay
     * in five takes it, which puts the quarter's own colour on a narrow vertical rather than on a
     * wall — gold on a temple bracket, jade on a market post, warm on a machiya's, stone on a
     * storehouse's — and keeps it to about a twentieth of the facade cells in the frame. */
    /* ONE BAY IN THREE, NOT ONE IN FIVE, AND WITH A FLOOR. The accent share was 0.22 and the accent
     * post took the same luminance as an ordinary one, which meant the quarter's own colour was on
     * screen at a rate of about one cell in ninety and at a luminance that mostly did not clear the
     * print's muddy ceiling — measured, `gold` was 0.0% of a night frame's lit energy and `jade`
     * 0.4%, i.e. the two swatches this accent exists to spend were effectively absent. 0.34 with a
     * floor of 34 puts them on the wall: gold needs 135 to print v 120 at 18 m and 12 + 104*L only
     * reaches that at the very foot of a lamplit wall, where 34 + 104*L reaches it over the whole
     * lit band. Nineteen bytes, ~86 facade cells moved, and it is the only change in the colour
     * pass that puts the district table's `accent` column on a surface at all. */
    var postW = 0.13 / st.bay;
    if (fu < postW || fu > 1 - postW)
      return fset(G_PIPE, si === 4 ? P.ember : (bh < 0.34 ? accent : shd),
                  (si === 4 ? 54 + 150 * L : (bh < 0.34 ? 34 : 12) + 104 * L) * gr);

    /* ---- the floor line ---------------------------------------------------------------------- */
    var storey = v < st.gnd ? 0 : 1;
    if (v > st.gnd && v < st.gnd + 0.22) {
      /* The mid-rail, and on a machiya it carries the little roof over the shopfront. Drawn as a
       * hard bright line with nothing under it, which is the same trick the eave plays at a
       * quarter of the size. */
      return fset(G_EQ, mid, (34 + 168 * L) * gr);
    }
    if (v > st.gnd + 0.22 && v < st.gnd + 0.42)
      return fset(0, P.shadow, 0);

    /* ---- a plaster wall has no openings and no rhythm ------------------------------------------
     * The kura is the one building type here that is a MASS, and the whole point of it in the frame
     * is that it is the only thing on the street with nothing drawn on it. Two small barred
     * openings per elevation and otherwise a field so thin it is mostly blank — which is exactly
     * what a 40 cm lime wall in flat light looks like, and is why `white` can carry it: a big
     * near-empty pale shape reads bright without ever printing a bright cell. */
    if (st.flat) {
      var ph = hash2(Math.floor(u * 1.9), Math.floor(v * 1.9), sd ^ 0x5A9);
      /* The band at the foot: a kura's plinth is dark stone or black-tarred board, always, and it
       * is what stops the white mass floating. It is also the one band of a kura the lanterns
       * reach, so it takes L while the mass above it takes the sky. */
      if (v < 0.9) return fset(ph < 0.42 ? G_DASH : 0, ph < 0.42 ? shd : P.shadow, 14 + 70 * L);
      if (bh < 0.34 && fu > 0.40 && fu < 0.60 && v > st.gnd + 1.0 && v < st.gnd + 1.7) {
        /* The barred opening. Its bars are the only fine vertical on the whole building. */
        var bu = (u / 0.13); bu -= Math.floor(bu);
        return bu < 0.42 ? fset(G_PIPE, shd, 18 + 60 * L)
                         : fset(G_COLON, mid, 26 + 104 * L);
      }
      if (ph > 0.62 * cov) return fset(0, P.shadow, 0);
      return fset(ink(0.10 + 0.46 * L), mat, (30 + 186 * L) * gr);
    }

    /* ---- everything else is a FRAME WITH SOMETHING IN IT ---------------------------------------
     * `panel` is the share of the bay that is opening. Inside it: lattice, paper, tile, or the
     * shutter that is closed over the lot of it after dark. Outside it: the plaster or board that
     * fills between the posts, which is thin by construction because it is not what anyone is
     * looking at. */
    var inPanel = fu > (1 - st.panel) * 0.5 && fu < 1 - (1 - st.panel) * 0.5;
    if (!inPanel) {
      var wh = hash2(Math.floor(u * 4.3), Math.floor(v * 4.3), sd ^ 0x2E1);
      if (wh > 0.56 * cov) return fset(0, P.shadow, 0);
      return fset(ink(0.12 + 0.42 * L), mat, (26 + 190 * L) * gr);
    }

    /* IS THERE A LAMP BEHIND IT. The roll is per BAY and per STOREY, not per cell — a room is lit
     * or it is not — and it is gated on the lamp being lit at all. `dLamp` is what the clock says
     * about artificial light, and it already carries the crossfade AND the hysteresis. */
    var roomLit = hash2(bay, storey, sd ^ 0x6F3) < litR * (0.6 + 1.5 * (storey ? 0.5 : 1)) &&
                  dLamp > 0.02;
    /* `dLamp` ALONE — the third and last instance of the same error, and the most visible of the
     * three. With `dNight * dLamp` the whole town's frontage went dark at dSky 0.30, so a dusk
     * frame of the world whose signature hour is dusk had not one lit paper screen in it while the
     * lanterns hanging in front of them were still burning. The clock's `lamp` is the crossfade;
     * nothing here gets to invent a second one. */
    var glow = roomLit ? dLamp : 0;

    /* ---- the paper ------------------------------------------------------------------------------
     * A shoji is a grid of 30 cm panes and the paper between them is a SHEET OF LIGHT — not a
     * window with a lamp visible through it, a diffuser the size of the wall. So the panel is
     * filled at the top of the ladder in `warm` and the mullions are drawn dark OVER it, which is
     * the opposite way round from every window in the other three worlds and is the whole reason
     * city.js's STYLE_CH_JP lights in '#' and '8'.
     *
     * THE MULLION GRID IS DRAWN AT EVERY LOD it can be seen at, because it is the recognition. A
     * warm rectangle with no grid on it is a window; a warm rectangle with a grid on it is a shoji,
     * and the difference is four cells. Past 44 m the grid is finer than a cell and drawing it
     * would alias into a moire, so the panel goes to a flat glow — which is what it looks like from
     * the end of the street anyway. */
    var pu = u / st.pitch, pv = v / (st.pitch * 1.15);
    var fpu = pu - Math.floor(pu), fpv = pv - Math.floor(pv);

    if (glow > 0.02) {
      var flick = CC.reducedMotion ? 1 : 0.90 + 0.10 * vnoise(t * 0.9 + bay * 7.3 + sd * 0.01, 0x2D);
      var base = (168 + 62 * hash2(bay, storey, sd ^ 0x11)) * glow * flick;
      /* Rain across a lit panel: the water on the OUTSIDE of the paper, which is the detail that
       * puts the weather in front of the light instead of behind it.
       *
       * ---- AND IT IS THE ONE THING IN THIS WORLD THAT FAILED THE PHOTOSENSITIVITY GATE ----------
       * The first cut ran the hash index at `v*5 - t*11`, which steps a cell's draw at ELEVEN HERTZ
       * — dead centre of the 3-20 Hz flash band the whole project is gated on — and did it as a
       * jump from a lit paper panel to a bright white line, about a fifth of full scale, over the
       * largest lit area in the frame. tools/west-flicker.cjs caught it at 440 big steps against
       * 69 in dry weather and 63 for the frontier's own world pass. It is worth writing down that
       * this was NOT visible by eye in a still and not visible in any census: the frame is correct
       * at every instant and the defect is entirely in the rate.
       *
       * Two changes, and both were needed. The index now steps at 0.7 Hz, which is under the band
       * with its first three harmonics — the same sawtooth-harmonic argument the gutter's own note
       * makes, and 2.2 was not far enough under to survive it —
       * rather than in it; and the streak is DARKER than the paper behind it rather than brighter,
       * at 0.68 of base, so the worst delta is about 74 of 255 instead of the 85 the gate calls a
       * big step. Water on a lit paper screen seen from outside is in fact darker — it is a lens
       * scattering the light away from you — so the correct fix and the safe one are the same one.
       * Frozen entirely under reduced motion, which the first cut also missed. */
      if (wRain > 0.25 && lod === 2 && !CC.reducedMotion &&
          hash2(Math.floor(u * 9), Math.floor(v * 5 - t * 0.7), sd ^ 0x4C7) < 0.06 * wRain)
        return fset(G_PIPE, P.stone, base * 0.68);
      if (lod < 2) return fset(G_8, P.warm, base * 0.86);
      if (fpu < 0.16 || fpv < 0.13)
        return fset(fpv < 0.13 ? G_DASH : G_PIPE, P.timber, base * 0.30);
      /* The lower quarter of a shopfront panel is the noren or the shutter board — solid, so the
       * light is cut off at knee height. It is what stops a lit frontage reading as a hole. */
      if (storey === 0 && v < st.gnd * 0.34)
        return fset(G_EQ, P.timber, (24 + 60 * sun) * gr);
      return fset(G_8, P.warm, base);
    }

    /* ---- and unlit, it is a LATTICE ------------------------------------------------------------
     * This is where the world spends its ink. A koshi front with no lamp behind it is a rank of
     * slats with black between them — the densest dark texture in the project — and it is what
     * makes an unlit machiya read as a building rather than as a hole. The slats are drawn as
     * verticals at `pitch`, alternating in weight (a real koshi alternates a thick member with two
     * thin ones), and the gap is genuinely empty.
     *
     * By day the same panel is a shutter or an open shopfront and it takes the ramp instead, which
     * is what stops the whole street reading as one dark band at noon. */
    if (st.vert) {
      var sl = fpu;
      var heavy = (Math.floor(pu) % 3) === 0;
      /* THE SLATS THIN OUT WITH THE LIGHT, and this is where the muddy census was really being
       * spent: a koshi front drawn at full density at every hour puts a solid field of lum-20
       * timber over a third of the frame, which is one flat tone in the exact middle of the print's
       * range. Under a lantern it is the densest and best texture in the world; four metres up an
       * unlit wall there is nothing there to see and the honest answer is a blank cell. `cov` is
       * what says which of those this is, and the light half is the SLATS rather than the gaps —
       * so what survives at low light is the heavy member on the three-beat, alone, which is
       * exactly what a lattice looks like at the edge of visibility. */
      if (sl < (heavy ? 0.52 : 0.34) && (heavy ? cov > 0.06 : cov > 0.34))
        return fset(heavy ? G_PIPE : G_COLON, heavy ? shd : mid,
                    (14 + 176 * L) * (heavy ? 1 : 0.70) * gr);
      if (dFill > 0.02 && hash2(Math.floor(u * 6.1), Math.floor(v * 6.1), sd ^ 0x38B) < 0.62 * dFill)
        return fset(ink(0.10 + 0.34 * L), SHD[hue], (22 + 120 * L) * gr);
      return fset(0, P.shadow, 0);
    }

    /* A horizontal rhythm instead: the tile lattice of a namako wall, or the beam courses of a
     * temple. Both are lines of constant v, which is the one direction that carries no perspective
     * — so they are drawn brighter and sparser than the verticals above, or they would flatten the
     * elevation completely. */
    var course = fpv;
    if (course < 0.20 && cov > 0.05)
      return fset(G_DASH, si === 4 ? mid : lit, (30 + 190 * L) * gr);
    if (si === 3) {
      /* namako: the raised plaster joint runs on the diagonal, so the two lattices interleave and
       * the wall comes out as a field of diamonds. 'X' is the only glyph in the table that reads
       * as one. */
      var dgx = Math.floor((pu + pv) * 0.5), dgy = Math.floor((pu - pv) * 0.5);
      if (hash2(dgx, dgy, sd ^ 0x19B) < 0.34 * (0.3 + 0.7 * cov))
        return fset(G_X, lit, (34 + 190 * L) * gr);
    }
    var fh = hash2(Math.floor(u * 4.9), Math.floor(v * 4.9), sd ^ 0x6D1);
    if (fh > 0.52 * cov) return fset(0, P.shadow, 0);
    return fset(ink(0.10 + 0.40 * L), mat, (24 + 190 * L) * gr);
  }

  /* ================================================================================ the ground ==
   * A machi street is not paved. It is rammed earth with a stone-lined channel down each side, it
   * has been raining, and the two things it does in the frame are: hold a puddle under every lit
   * frontage, and carry the two converging lines of the gutters. Everything below is those two
   * plus enough texture to keep the middle from being empty.
   *
   * THE MIRROR IS THE POINT. raycast.js's reflect pass takes `mir` (how much of the wall above
   * comes back), `rip` (a row offset, which is what makes it water rather than a mirror) and `wch`
   * (the glyph the reflection is drawn in) and does the fetch itself, once the column above is
   * finished. This file decides WHERE the water is; the caster decides what colour it is. That
   * division is what makes a reflection actually match the lantern standing over it. */
  /* ---- WHICH SWATCHES THE GROUND IS ALLOWED, AND IT IS AN ARITHMETIC CONSTRAINT ------------------
   * `stone` is (156,162,170), so its max channel is 170 and the value a cell prints is 170*lum/255.
   * The print's hot line is v 170 and its muddy band runs 9-119: a stone cell can therefore NEVER
   * be hot at any luminance whatsoever, and it is muddy for every lum from 14 to 255. It is the
   * exact counterpart of the note in surf_moon.js about `slate`, which cannot be a lit surface
   * because its ceiling is 114 — and it caught this file the same way. Measured over four seeds at
   * night, `stone` was 42% of the frame's energy and the census came back at 43.5% muddy, because
   * the road, the kerb and the eave strip were all painted in the one swatch that is muddy by
   * construction.
   *
   * The fix is not to dim them, it is to name the material correctly under the light that is
   * actually on it. Wet granite under a paper lantern is very nearly WHITE (ceiling 236) and the
   * dirt beside it is warm tan, which is `sand` (216) — neither of which is a re-taste: both are
   * what those two materials look like wet and lit from a metre away, and `stone` is what they look
   * like dry under a grey sky. So the ground picks its swatch off the LIGHT rather than off the
   * substance, exactly as the walls' three material tiers already do, and the two versions swap
   * over as the lanterns come on. */
  var t0f = 0;
  var ROUT = { ch: 0, col: 0, lum: 0, mir: 0, rip: 0, wch: 0 };
  var mirNow = 0, ripNow = 0, wchNow = 0;
  function rset(ch, col, lum) {
    ROUT.ch = ch; ROUT.col = col;
    ROUT.lum = lum < 0 ? 0 : (lum > 255 ? 255 : lum | 0);
    ROUT.mir = mirNow; ROUT.rip = ripNow; ROUT.wch = wchNow;
    return ROUT;
  }

  /* Standing water, as a field rather than as a list of puddles. Two octaves on a metre-ish
   * lattice, thresholded — so a puddle has an EDGE, which is what makes it read as water rather
   * than as a wet patch — and the threshold moves with how wet the world is, so a road under
   * `kiri` has a few pools in the ruts and a road under `typhoon` is a sheet. Keyed on world
   * coordinates alone, so it holds still while the camera walks through it. */
  function water(wx, wz) {
    var a = vnoise(wx * 0.62, wz * 0.41 + 11.3);
    var b = vnoise(wx * 1.9 + 5.1, wz * 1.4);
    var n = a * 0.7 + b * 0.3;
    var thr = 0.72 - 0.34 * clamp(wWet, 0, 1.2);
    return n <= thr ? 0 : clamp((n - thr) / (1 - thr), 0, 1);
  }

  /* ================================================================================== the canal ==
   * A horikawa: 9.2 m of water on a 160 m pitch, met once every hundred seconds of walking. It is
   * the largest single surface this world paints and it is the reason the reflect pass exists here
   * at all — a puddle gives back three cells, a canal gives back a quarter of the floor rows.
   *
   * THE SURFACE IS WRITTEN DARK AND THIN AND ALMOST ENTIRELY BLANK, which is the puddle's own rule
   * taken as far as it goes. `indigo` tops out at a printed 115 at night and 104 by day, so it can
   * never be hot and is muddy from about lum 20 upward — and the only two places in this print that
   * are not muddy are below v 9 and above v 119. A large dark surface therefore has to be built out
   * of near-black and nothing at all, and everything bright about it has to arrive through the
   * mirror. 74% of the water is blank cells.
   *
   * WHY THE MIRROR IS 0.86 AND THE PUDDLE'S IS 0.62. That cap is argued in the puddle branch as "a
   * puddle on earth is not a mirror, it is a dirty film over a brown ground". A canal is deep water
   * seen at the grazing angle a street is looked at from, and it gives back most of what hits it.
   * It also lifts raycast's own fraction from 0.67 to 0.81 of the source cell.
   *
   * THE RIPPLE RATE IS THE FLASH GATE, NOT THE WATER. 0.5 + 0.4*rain lattice steps a second, i.e.
   * 0.9 Hz at the top, with harmonics at 1.8 and 2.7 — all under the 3-20 Hz band. The gutter three
   * branches down had to come from 2.6 to 0.9 for exactly this reason, and the canal is an order of
   * magnitude more area than the gutter, so it takes the gutter's number rather than the puddle's.
   * The offset stays FRACTIONAL: raycast floors the sum itself, and an integer here would make the
   * whole field step together.
   *
   * THE SPECULAR IS `pure`, on this file's own argument in the gutter branch: both pure and ice
   * clear the print's night hot line, and a scatter of ice rendered as NEON. A specular takes the
   * colour of its source and the source here is a paper lantern. `cj` is a position hash with no t
   * in it, so the glints hold still while the camera walks past them rather than boiling. */
  function water(wx, wz, ed, L, lod) {
    var cj = hash2(Math.floor(wx * 1.7), Math.floor(wz * 1.7), 0x6A31);
    /* ---- THE RIPPLE AMPLITUDE IS A FLASH NUMBER AND IT IS THE PRODUCT THAT MATTERS ---------------
     * This is the sixth photosensitivity failure this world has produced and the first one whose
     * mechanism is not the rate on its own. MEASURED with the camera pinned ON the water — which no
     * shipped gate can do, because tools/west-flicker.cjs pins at the map's start and the channel is
     * a hundred metres from there, so it renders ZERO canal cells and returns PASS — the first cut
     * of this branch scored 5.57% in the 3-20 Hz band against a 2% rule, 10.25 big steps a second
     * against a limit of 1.0, and a worst single-frame step of 91% of full scale.
     *
     * THE CAUSE IS NOT THE NOISE RATE, WHICH WAS ALREADY SLOW. `rip` is a row offset that raycast
     * floors to fetch a source row, so what the eye sees is not the offset, it is the offset
     * CROSSING AN INTEGER. A 4.3-row sweep at 1.1 Hz crosses about nine row boundaries a second,
     * and each crossing swaps the reflected cell between a lantern and the black beside it — which
     * is a near-full-scale step at nine hertz. The lesson the blossom taught was "distance is the
     * lever, not brightness"; the lesson here is the companion one: FOR A FLOORED OFFSET THE RATE
     * IS AMPLITUDE TIMES FREQUENCY, and shrinking either one shrinks the hazard.
     *
     * So the amplitude comes to 0.20 + 0.18*rain — a peak of 0.48 rows, half a row — and
     * a cell's source row now changes about twice a cycle instead of nine times a second. The
     * mirror comes off 0.86 to 0.58 on top of that, which shrinks what each remaining step is worth.
     * That costs the design's "a canal is deep water and gives back most of what hits it" argument
     * and it is the right thing to lose.
     *
     * MEASURED, on a probe that pins the camera 2 m and 8 m from the channel and scopes itself to
     * this world's own elements exactly as the shipped gate scopes itself (worst of two seeds, in
     * the worst two weather rows):
     *     mir 0.86  amp 1.2+2.0r   rate 0.5+0.4r    3-20 Hz 3.61%  big 2.50/s  <- FAILS both rules
     *     mir 0.70  amp 0.24+0.30r  rate 0.5+0.4r    3-20 Hz 1.94%  big 1.25/s
     *     mir 0.70  amp 0.20+0.18r  rate 0.5+0.4r    3-20 Hz 2.43%  big 1.25/s
     *     mir 0.58  amp 0.20+0.18r  rate 0.5+0.4r    3-20 Hz 2.31%  big 1.25/s
     *     mir 0.68  amp 0.20+0.18r  rate 0.22+0.10r  3-20 Hz 1.43%  big 0.50/s  <- ships
     *
     * AND THE LAST ROW IS THE ONE THAT TAUGHT SOMETHING. Cutting the amplitude six-fold and the
     * mirror by a third barely moved the number, because with a SUB-ROW amplitude the crossing rate
     * is no longer set by how far the offset swings — it is set by how often the noise wanders back
     * and forth across one boundary, which is the noise's own frequency. At 0.5 + 0.4*rain that is
     * 1.1 Hz, whose third harmonic is 3.3 and lands inside the band the gate probes from 3.5. The
     * rate is the lever; 0.22 + 0.10*rain tops out at 0.37 Hz and its first three harmonics are
     * 0.74, 1.11 and 1.48. With the rate fixed the mirror can come back up to 0.68 and the water
     * keeps most of its depth.
     * and reduced motion is 0.00% and 0.00/s at every setting, because ripNow is hard zero there.
     *
     * A WARNING FOR WHOEVER TOUCHES THESE TWO NUMBERS. No gate in this tree can see this. Both
     * photosensitivity tools pin the camera at the map's start, and the channel is a hundred metres
     * from there on a 160 m pitch — tools/west-flicker.cjs renders ZERO canal cells and returns
     * PASS. If you change the mirror or the ripple, re-run the probe with the camera ON the water
     * or you are changing an ungated number. */
    mirNow = 0.68 * clamp(0.25 + 0.9 * ed, 0, 1) * clamp(0.45 + 0.55 * wWet, 0, 1);
    ripNow = CC.reducedMotion ? 0
           : vnoise(wx * 0.9 + t0f * (0.22 + 0.10 * wRain), wz * 0.7) * (0.20 + 0.18 * wRain);
    wchNow = wRain > 0.4 ? G_TILDE : G_DASH;
    /* The one bright thing the water writes itself. Everything else it shows is the mirror. */
    if (L > 0.45 && lod === 2 && cj > 0.962)
      return rset(G_QUOTE, P.pure, 148 + 84 * clamp(L, 0, 1));
    /* A drop ring, in rain only, and keyed on position alone so it does not strobe. */
    if (wRain > 0.35 && cj < 0.035 * wRain)
      return rset(G_o, P.white, (54 + 96 * wRain) * (0.4 + 0.7 * L));
    if (cj > 0.26) return rset(0, P.shadow, 0);
    return rset(cj < 0.13 ? G_TILDE : G_DASH, P.indigo, (3 + 15 * L) * (0.7 + 0.6 * cj));
  }

  function floorTex(wx, wz, dist, t) {
    weatherAt(t === undefined ? 0 : t); dayAt(t === undefined ? 0 : t);
    t0f = t === undefined ? 0 : t;
    var C = cfg();
    var half = C ? C.half : 3.1;
    var lane = wx - (C ? C.streetX : 4.0);
    var al = lane < 0 ? -lane : lane;
    var lod = dist < 18 ? 2 : (dist < 44 ? 1 : 0);
    mirNow = 0; ripNow = 0; wchNow = 0;

    /* The ground takes SKY_UP rather than SKY_SIDE — it is a horizontal and it sees the whole
     * hemisphere, which under a deck is the difference between the road and the walls beside it and
     * is why an overcast street photograph is always brightest at your feet. */
    var sun = clamp(SKY_UP * (0.16 + 0.84 * dSky) * (0.55 + 0.45 * openSky()), 0, 1.1);
    /* And the lanterns reach it. `lampAt(0)` is the full wash, which is right: the road is exactly
     * where a hanging lantern's light lands, and after dark it is the brightest large surface in
     * the frame — the reason the reflections below are worth having at all. */
    var L = clamp(sun + lampAt(0) * 0.86, 0, 1.3);
    var cov = clamp(L * 1.02, 0, 1); cov = cov * cov * cov;   // see facade(): cubed, not squared
    /* The wet-and-lit pair. `gLit` is what a surface the light reaches takes; `gDim` is the same
     * surface where it does not. See the note above ROUT for why the bright half may not be
     * `stone`. */
    var warmish = L > 0.42;
    var gStone = warmish ? P.white : MID[P.stone];
    var gEarth = warmish ? P.sand : MID[P.timber];

    /* ---- THE CANAL, BEFORE ANY ROAD BRANCH ------------------------------------------------------
     * `C.rivD` is null in the three worlds that have no water, so this is one truthiness test per
     * floor cell there and nothing else.
     *
     * THE COORDINATES ARE UN-SWAPPED FIRST, and forgetting that is the one way this goes subtly
     * wrong. raycast.js hands floorTex its arguments TRANSPOSED when the camera has committed to a
     * cross street (`swapFloor ? floorTex(pz, px, ...)`), so on those frames `wx` is the world z.
     * The channel is a function of true world position, so it has to be asked in true world
     * coordinates or the canal rotates ninety degrees every time the walk turns a corner.
     *
     * The far edge test uses the QUAY width, not the water's: past the coping there is a stone
     * quay, and past that the ordinary road. The coping itself is never seen here — it has height,
     * so it is a facade and stoneFace paints it as the ishigaki it is. */
    if (C && C.rivD) {
      var rx = C.swap ? wz : wx, rz = C.swap ? wx : wz;
      var rr = C.rivD(rx, rz);
      if (rr < 4.6) {
        /* `ed` is how far into the channel this cell is, 0 at the bank and 1 mid-stream. The mirror
         * fades out at the edges because that is where the bank shelves and the water is broken. */
        return water(wx, wz, clamp((4.6 - rr) / 3.0, 0, 1), L, lod);
      }
      if (rr < 7.8) {
        /* The quay: dressed stone, walked on, wet. Brighter than the road because it is stone
         * rather than earth and because it is the line that separates the town from the water. */
        var qj = hash2(Math.floor(rx * 1.3), Math.floor(rz * 1.3), 0x5C7);
        if (qj < 0.14) return rset(G_DASH, SHD[P.stone], 14 + 66 * L);
        if (qj > 0.66 * cov) return rset(0, P.shadow, 0);
        return rset(ink(0.12 + 0.32 * L), gStone, (26 + 190 * L) * (0.7 + 0.5 * qj));
      }
    }

    /* ---- the gutter ------------------------------------------------------------------------------
     * A stone-lined channel a hand's width inside each kerb line, running the length of the street.
     * It is the strongest line in the whole frame — two of them, converging — and in this weather it
     * is running, which means it is the one part of the road that is unambiguously bright.
     *
     * It sits INSIDE `half` rather than outside it, unlike the frontier's boardwalk: there is no
     * pavement in a machi, the buildings come down to the street and the drain is in the street. */
    var gd = al - (half - 0.55);
    if (gd > -0.34 && gd < 0.34) {
      /* 0.9 CYCLES A SECOND, AND THE NUMBER IS THE FLASH GATE RATHER THAN THE WATER. `run` is in
       * whole cycles, so the coefficient IS the frequency at which every cell in the gutter toggles
       * between its two glyphs and sweeps its luminance — and a discrete toggle is not a sine, it
       * is a sawtooth whose second and third harmonics land at twice and three times it. At the
       * first cut's 2.6 those harmonics were 5.2 and 7.8 Hz, inside the 3-20 Hz band, and
       * tools/west-flicker.cjs scored this world 3.86% against the city's 2.28% and failed the
       * comparative gate. At 0.9 the fundamental and the first two harmonics are 0.9, 1.8 and 2.7,
       * all under the band. Water in a stone channel does run faster than that; what is being
       * slowed is the PATTERN, and a pattern this size is not something the eye clocks anyway. */
      var run = wz * 1.7 - (CC.reducedMotion ? 0 : t * 0.9);
      var fr = run - Math.floor(run);
      /* The kerb stones, and they are what carry the perspective: joints at constant wz. */
      if (gd < -0.18 || gd > 0.18) {
        var kj = wz / 0.62; kj -= Math.floor(kj);
        return rset(kj < 0.16 ? G_DASH : G_UNDER, kj < 0.16 ? SHD[P.stone] : gStone,
                    (kj < 0.16 ? 20 + 40 * L : 52 + 186 * L));
      }
      mirNow = 0.34 * clamp(wWet, 0, 1);
      ripNow = fr < 0.5 ? 0 : 1;
      wchNow = G_TILDE;
      /* THE GLINT, and it is `pure` rather than `ice`. Both clear the print's hot line after dark
       * (234 and 174 against warm's 167) and the first cut took ice, because core.js licenses it by
       * name for "rain highlight" — and rendered, a scatter of (90,240,255) down the gutter read as
       * NEON. That is the failure this file's own header warns about two hundred lines up: a swatch
       * chosen to clear an arithmetic line rather than to say what the thing is. A specular takes
       * the colour of its source, the source here is a paper lantern, and a blown-out highlight off
       * one is white — which is `pure`, is what a photograph shows, and needs an input luminance of
       * only 101 rather than ice's 237 to print hot. It is gated on there being a light to reflect
       * at all: `L` carries the lanterns, and a gutter in an unlit alley just runs. */
      /* 238 is not a taste, it is the threshold: measured through core.js's night LUT, `ice` needs
       * an input luminance of 237 before it prints v 170, so a glint written at 190 is a glint that
       * lands in the muddy band and does the opposite of its job. Anything specular in this world
       * is written at the very top of the range or it is not written at all. */
      if (L > 0.45 && lod === 2 && hash2(Math.floor(wz * 6.1), (gd * 9) | 0, 0x3B9) < 0.06)
        return rset(G_QUOTE, P.pure, 150 + 80 * fr);
      return rset(fr < 0.34 ? G_TILDE : G_DASH, P.white,
                  (36 + 190 * L) * (0.6 + 0.7 * fr) * (0.4 + 0.6 * clamp(wWet, 0, 1)));
    }

    /* Past the gutter: the strip of ground under the eaves, which is the only dry ground in the
     * world and is therefore where everybody is standing. Stone slabs where there is a building,
     * bare earth where there is not. */
    if (al > half - 0.2) {
      if (lod === 0) return rset(0, P.shadow, 0);
      var sj = hash2(Math.floor(wz * 1.4), Math.floor(al * 1.6), 0x4E1);
      if (sj < 0.16 * cov) return rset(G_DASH, SHD[P.stone], 12 + 60 * L);
      if (sj > 0.58 * cov) return rset(0, P.shadow, 0);
      /* Slab and earth, not all slab. This strip is the largest lit area on the ground after the
       * road and putting the whole of it on the wet-stone swatch took `white` to 47% of the frame's
       * lit energy — a wet grey town, which is right, printed as a WHITE one, which is not. A third
       * of it is the flag, the rest is the dirt between the flags and the dirt is warm. */
      return rset(ink(0.10 + 0.30 * L), sj < 0.38 ? gStone : gEarth,
                  (24 + 196 * L) * (0.7 + 0.5 * sj));
    }

    /* ---- the road ------------------------------------------------------------------------------
     * Rammed earth, crowned in the middle, rutted by cart wheels toward the sides. The ruts are
     * where the water goes, so the puddle field below is biased into them — which is what stops the
     * standing water reading as random blobs and makes it read as a road that has been used. */
    var rut = Math.abs(al - half * 0.52);
    var inRut = rut < 0.42;
    var w = water(wx, wz) * (inRut ? 1.35 : 0.82) * clamp(0.4 + 0.8 * wWet, 0, 1.4);

    if (w > 0.20) {
      /* WATER. The mirror strength is the payoff of the whole world and it is capped well under 1:
       * a puddle on earth is not a mirror, it is a dirty film over a brown ground, and reflecting
       * a lantern at full strength puts a second lantern in the road. 0.62 at the middle of a deep
       * pool is about what a photograph of one gives back.
       *
       * `rip` is the row offset the caster adds when it fetches the source cell, and it is what
       * turns a mirror into water. Under rain it is driven by the drop rate; in still weather it
       * is a slow swell off the wind. Both are pure functions of (world position, t), so the
       * offline harness reproduces the browser exactly. */
      var edge = w < 0.34;
      mirNow = edge ? 0.16 : 0.62 * clamp(0.5 + 0.6 * w, 0, 1);
      /* 0.8 + 0.6*rain rather than 0.8 + 2.4*rain, and the reason is the flash band rather than the
       * water. `rp` indexes a value-noise lattice, so the coefficient IS how many lattice steps a
       * second the ripple takes: at the first cut's 2.4 a downpour drove it to 4.5 Hz, and since
       * the caster floors this into a whole-row offset, the mirrored source row was jumping up to
       * four rows at four and a half hertz — a large luminance step, in band, on every reflecting
       * cell in the frame. 1.7 Hz at the top of the range is under it. A real puddle in a downpour
       * does chop faster than that; what the eye reads at this resolution is the reflection
       * breaking up, not the ripple rate, and the amplitude below is what carries that. */
      var rp = CC.reducedMotion ? 0
             : vnoise(wx * 2.1 + t * (0.8 + 0.6 * wRain), wz * 1.7) * (1 + 2.2 * wRain);
      /* Fractional, not `| 0`. raycast.js floors the sum itself, so an integer here bought nothing
       * and cost the offset its only smooth range: two neighbouring cells whose `rp` differ by a
       * tenth used to land on the same row, and the whole field stepped together. */
      ripNow = rp;
      wchNow = wRain > 0.4 ? G_TILDE : G_DASH;
      if (edge)
        return rset(G_DOT, SHD[P.stone], 14 + 80 * L);
      /* The surface itself is written DARK and thin. Everything bright about a puddle comes back
       * through the reflect pass; painting the water bright as well doubles it and the road turns
       * into a light box. */
      var wj = hash2(Math.floor(wx * 3.1), Math.floor(wz * 3.1), 0x27B);
      if (wRain > 0.3 && wj < 0.10 * wRain)
        return rset(G_o, P.white, (70 + 130 * wRain) * (0.4 + 0.7 * L));   // a ring where a drop landed
      return rset(wj < 0.4 ? G_TILDE : G_DASH, P.indigo, (10 + 96 * L) * (0.6 + 0.7 * wj));
    }

    /* Wet earth. Thin, dark, and mostly nothing — this is the largest single area in the frame and
     * every cell written into it comes straight off the print's muddy budget. What is drawn is the
     * rut lines and the stones the rain has washed clear. */
    if (lod === 0) return rset(0, P.shadow, 0);
    if (inRut && rut > 0.30 && cov > 0.10)
      return rset(G_UNDER, SHD[P.timber], 14 + 92 * L);
    var eh = hash2(Math.floor(wx * 2.6), Math.floor(wz * 2.6), 0x6C3);
    if (lod === 2 && eh < 0.05 * (0.3 + 0.7 * cov))
      return rset(G_o, gStone, 30 + 190 * L);                // a stone standing proud
    /* THE ROAD IS THE LARGEST SINGLE AREA IN THE FRAME and every cell written into it comes
     * straight off the print's muddy budget, so its fill is gated on the light exactly as the
     * walls' is. Under the lanterns it is a real surface; twenty metres up an unlit alley it is
     * nothing at all, which is what an unlit dirt road is. */
    if (eh > 0.44 * cov) return rset(0, P.shadow, 0);
    return rset(eh < 0.5 ? G_DOT : G_COMMA, gEarth, (14 + 196 * L) * (0.6 + 0.8 * eh));
  }

  /* ==================================================================================== the sky ==
   * Two things, and the second one is why this function is worth 90 lines rather than 20.
   *
   * THE DOME is a flat overcast: a value gradient with almost no hue in it, brightest a little
   * above the horizon (which is where an overcast sky IS brightest — the cloud base is nearer to
   * you at the zenith and further at the horizon, so it is thicker and paler out there) and going
   * to nothing at the top of the frame. Under the two dry rows of the weather table it opens up and
   * takes a sunward warm band, which is the same device surf_west.js uses and a fifth of the size.
   *
   * THE RIDGELINES are the identity. Every reference image of this setting has hills in it: three
   * or four ranges stacked behind one another, each one flatter and paler than the one in front,
   * with the mist lying in the gaps between them. It is the oldest depth cue in the medium and it
   * is nearly free here, because a ridge is a one-dimensional function of BEARING and the sky
   * function is already handed a bearing.
   *
   * They are drawn in sky() rather than as an element for one specific reason: an element draws
   * AFTER the world pass and would have to depth-test against a rooftop it cannot see behind, so a
   * ridge would either float over the town or be culled by it. Here they are simply the sky's own
   * value below a certain elevation, which is exactly what a distant hill is — and the caster's
   * silhouette handles the occlusion for free, because anything nearer has already been painted.
   *
   * Three ranges, at fixed elevations, each with its own bearing lattice so they are not scaled
   * copies of each other. The near one is the darkest and the far one nearly white, which is the
   * whole trick: aerial perspective drawn as three flat steps rather than as a gradient, which is
   * how the woodblock did it too because a block cannot hold a gradient either. */
  var SOUT = { ch: 0, col: 0, lum: 0 };
  function sset(ch, col, lum) {
    SOUT.ch = ch; SOUT.col = col;
    SOUT.lum = lum < 0 ? 0 : (lum > 255 ? 255 : lum | 0);
    return SOUT;
  }

  /* A ridge profile: a smooth pseudo-random function of bearing at a given lattice, in the same
   * units as `a` below (fractions of the grid above the horizon). Two octaves, because a single
   * one gives a row of identical humps and a mountain range is not periodic. */
  function ridge(b, lat, salt) {
    return (vnoise(b * lat, salt) * 0.72 + vnoise(b * lat * 2.7 + 3.1, salt + 7) * 0.28);
  }

  /* The three ranges. `base` is where the range sits above the horizon as a fraction of the grid,
   * `amp` how much it rises, `lat` the bearing lattice (bigger is more peaks), and the swatch and
   * luminance are the aerial-perspective step. Ordered NEAR FIRST, because the near one occludes:
   * the loop below takes the first range whose profile reaches this row and stops. */
  var RANGES = [
    { base: 0.020, amp: 0.130, lat: 2.1, salt: 0x1A, col: P.indigo, lum: 46, ink: 0.30 },
    { base: 0.070, amp: 0.155, lat: 1.4, salt: 0x2B, col: P.stone,  lum: 34, ink: 0.20 },
    { base: 0.115, amp: 0.175, lat: 0.9, salt: 0x3C, col: P.stone,  lum: 22, ink: 0.12 }
  ];
  /* HOW HIGH THE HILLS ARE ALLOWED TO GO, and the first cut had it wrong by a factor of two and a
   * half. The profiles above reached about a = 0.11, which is a hill on a flat horizon seen across
   * open country — and this world has no open country in front of it. The town's own rooflines
   * occupy everything below roughly a = 0.11 from inside a street, so every range was drawn behind
   * a building and the whole feature rendered SIXTEEN CELLS of a 3,700-cell sky. Measured, not
   * guessed: that is what the count came back as at dusk.
   *
   * The fix is the setting rather than a fudge. A machi is in a VALLEY — that is why it is where it
   * is — and from inside one the far ridge stands ten to twenty degrees up, well over the eaves.
   * At a = 0.28 the highest range clears the roofline by about as much again as the roofline
   * clears the horizon, which is what the reference prints show and is the whole reason they read
   * as depth. `RIDGE_TOP` is the search cut-off and must stay above the tallest profile the table
   * can produce (0.115 + 0.175 = 0.29) or the top of the far range is silently clipped flat. */
  var RIDGE_TOP = 0.32;

  var t0v = 0;
  function sky(sx, sy, t) {
    t0v = t === undefined ? 0 : t;
    weatherAt(t0v); dayAt(t0v);
    var C = cfg();
    var rows = C && C.rows ? C.rows : 60;
    var hor = C ? C.horizon : rows * 0.56;
    var vs = C && C.skyVScale ? C.skyVScale : 1;
    var kk = C && C.skyK ? C.skyK : (rows / 0.7);
    var sd = C ? C.skySeed : 0x5EED;

    var ey = Math.floor((hor - sy) * vs);
    var a = ey / rows;
    if (a < 0) a = 0;
    var bear = sx / kk;

    /* ---- the ranges ---------------------------------------------------------------------------
     * Near first. A range is drawn where the row is at or below its own profile; the FIRST match
     * wins, so a nearer ridge always covers a further one and the gaps between them show the pale
     * one behind. Everything above every profile falls through to the dome.
     *
     * They fade out toward noon rather than at night, which is the opposite way round from most of
     * this file and is correct: at night there is nothing to see anyway (dSky scales the dome to
     * nothing and the ranges with it), and by day the haze is what makes them read. `wHaze` moves
     * them the same way — thicker air, paler hills, which is the parameter doing exactly what its
     * name says. */
    var vis = dSky * (0.55 + 0.65 * wHaze);
    if (vis > 0.05 && a < RIDGE_TOP) {
      for (var i = 0; i < 3; i++) {
        var R = RANGES[i];
        var prof = R.base + R.amp * ridge(bear + i * 4.7, R.lat, R.salt);
        if (a > prof) continue;
        /* The silhouette edge: one bright row along the top of every ridge, which is the light on
         * the far side of it and is what stops three flat masses reading as one. */
        var edgeK = (prof - a) / (R.amp * 0.18 + 0.004);
        var hs = hash2(sx, ey, sd ^ (0x400 + i));
        if (edgeK < 1)
          return sset(G_DASH, i === 0 ? P.stone : P.white,
                      (R.lum + 84) * vis * (0.7 + 0.5 * hs));
        /* The body: a thin dither, not a fill. A hill at eight kilometres has no texture on it, and
         * the whole point of the three-step aerial perspective is that each range is FLAT. */
        if (hs > R.ink) return sset(0, P.shadow, 0);
        return sset(i === 0 ? G_COMMA : G_DOT, R.col, R.lum * vis * (0.6 + 0.8 * hs));
      }
    }

    /* ---- the dome ------------------------------------------------------------------------------
     * An overcast is brightest just above the horizon and falls away upward, which is the inverse
     * of a clear sky and is the one thing that tells the eye there is a lid on. `lift` is the
     * profile; `cap` is how much of it a heavy deck takes away — and unlike surf_west's cap it goes
     * the SAME way at every hour, because a lid at noon is still a lid: what changes with the hour
     * is dSky, which scales everything. */
    /* THE E-FOLD IS THE COVER, and it has to be, because the two skies this function draws are
     * shaped in opposite directions. Under a deck the light comes THROUGH a plane seen almost
     * edge-on: the cloud base is nearest overhead and furthest at the horizon, so it is thickest
     * and palest out there and the dome falls away as you look up — a steep e-fold. A clear sky is
     * the other way round and much flatter: it is bright everywhere, only mildly deeper at the
     * zenith, and it is BLUE up there.
     *
     * One constant did both, at 5.2, which is the overcast number — and a clear noon came out with
     * its zenith at a third of its horizon and printing through `indigo`, i.e. a black sky at
     * midday. 1.4 open to 5.2 covered, interpolated on the cover itself. */
    var lift = Math.exp(-Math.max(a - 0.04, 0) * (1.4 + 3.8 * wCloud));
    var dome = dSky * (0.30 + 0.62 * lift) * (0.42 + 0.58 * (1 - 0.55 * wCloud));

    /* The warm band, and it only exists on the open rows. Under a deck there is no sunward
     * anything, which is why this whole term is multiplied by openSky() — the difference between
     * the wet look and the dry look is a band of `sand` in the west and nothing else in this
     * function. */
    var da = bear - SUN_AZ;
    da = Math.atan2(Math.sin(da), Math.cos(da));
    var west = 1 - Math.abs(da) / Math.PI; west = west * west;
    var warmK = west * openSky() * dWarm * Math.exp(-a * 9.0);

    var h1 = hash2(sx, ey, sd), h2v = hash2(sx, ey, sd ^ 0x5B);

    /* THERE IS NO RAIN DRAWN IN HERE, and the paragraph that used to be is worth keeping as a
     * warning. It streaked the dome by re-dealing a hash at `floor(ey*1.7 - t*26)` — twenty-six
     * index steps a second, which is to say every sky cell it touched was re-rolled about every
     * other frame. That is not a moving streak, it is per-frame noise, and per-frame noise is
     * BROADBAND: it puts energy at every frequency including the whole of the 3-20 Hz flash band,
     * which is why tools/west-flicker.cjs scored this world 2.92% under `typhoon` against the
     * city's 2.28% with no element of its own drawing at all. It also duplicated work:
     * elements/weather.js already owns the rain in every world that has any, draws it as actual
     * particles with actual velocities, and is already tuned against these same gates. Deleted
     * rather than slowed — a second, cruder rain behind the real one was never worth a line. */

    var v = dome + warmK * 0.55;
    if (v < 0.012) {
      /* Night, and the deck decides whether there is anything up there at all. On the two dry rows
       * a few stars come through; under cloud there is nothing, which is honest and is also what
       * keeps the frame's black budget. */
      var opn = openSky();
      if (dStar > 0.05 && opn > 0.25 && h1 < 0.010 * dStar * opn)
        return sset(h2v > 0.7 ? G_STAR : G_DOT, h2v > 0.7 ? P.white : P.slate,
                    (60 + 110 * h2v) * dStar * opn);
      return sset(0, P.shadow, 0);
    }

    /* The dome's own texture is a DITHER and never a fill, for the reason the header gives: this
     * sky is a narrow band of mid-greys and a filled one is the mush. Density carries the value;
     * the glyph carries what kind of sky it is — '~' where the cloud has structure in it, '.'
     * where it is a flat lid. */
    /* ---- AND IT IS BANDED, NOT DITHERED --------------------------------------------------------
     * The first cut was a flat probability field: `cover = 0.20 + 0.62*v` against one hash, which
     * is a uniform scatter over the whole dome. Rendered at dusk that is not a sky, it is STATIC —
     * half the upper third of the frame filled with unrelated marks at the same tone, with no shape
     * anywhere in it. An overcast has a great deal of structure and all of it is HORIZONTAL: the
     * deck is a plane seen almost edge-on, so its texture stretches out along the horizon and
     * compresses vertically, which is why a grey sky reads as bars and never as noise.
     *
     * So the density is modulated by a two-octave band field whose lattice is ten times finer in
     * elevation than in bearing — one number, and it turns the same cells into cloud. The bands
     * DRIFT, slowly, on the wind: 0.006 rad/s at rel('wind') 1, which is about a degree a minute
     * and is under the threshold at which a viewer sees motion rather than notices later that it
     * has changed. Frozen under reduced motion, where a moving sky is exactly the wrong thing. */
    var drift = CC.reducedMotion ? 0 : t0v * 0.006 * (0.4 + 1.2 * wWind);
    var band = vnoise(bear * 0.55 + drift, a * 5.6) * 0.68 +
               vnoise(bear * 1.9 + drift * 2.3 + 9.1, a * 14.0) * 0.32;
    /* Under a lid the bands flatten out — a heavy overcast is one tone — and on the open rows they
     * are the whole sky. So the modulation depth follows the cover the other way round from
     * everything else in this function. */
    var depth = 0.30 + 0.55 * (1 - wCloud);
    var cover = (0.18 + 0.66 * v) * (1 - depth + depth * 2 * band);
    if (cover < 0) cover = 0;
    if (h1 > cover) return sset(0, P.shadow, 0);
    /* The value follows the band too, so a thick bar is both denser AND brighter than the gap
     * beside it — which is what makes it read as a cloud with a lit top rather than as a patch of
     * more dots. */
    var vb = v * (0.72 + 0.56 * band);
    /* ---- AND WHICH SWATCH, WHICH IS THE OTHER HALF OF THE SAME SPLIT --------------------------
     * A covered sky has no hue in it worth the name: it runs white through stone to indigo purely
     * on value, and that greyness IS this world's sky most of the time. An OPEN one is blue, and
     * blue with height — azure at altitude over a pale band at the horizon, which is what
     * surf_west.js's dome does at noon and what the README notes about it ("the sky dome takes
     * azure at altitude because a noon sky is blue"). `openSky()` picks between them, and because
     * it is a smooth function of cover the two dissolve into one another as the weather turns
     * rather than switching at a threshold — this frame is 30% of the picture and a step in it is
     * the largest area change the photosensitivity rule could ever be asked about. */
    var op = openSky();
    var col;
    if (warmK > 0.30) col = P.sand;
    else if (op > 0.35 && a > 0.10 && h2v < op)
      col = vb > 0.74 ? P.ice : P.azure;              // open sky, and higher than the horizon band
    else col = vb > 0.62 ? P.white : (vb > 0.30 ? P.stone : P.indigo);
    return sset(band > 0.58 ? G_TILDE : (h2v > 0.40 ? G_DOT : G_TICK),
                col, (40 + 200 * vb) * (0.66 + 0.5 * h2v));
  }

  /* ---- and how far you can see in wet air ---------------------------------------------------------
   * 14 m before anything fades and 150 m before it is gone, against the city's 12/125, the
   * frontier's 20/210 and the Moon's 150/240. The reasoning is the frontier's run in reverse: out
   * there the ramp had to be LONG because a main street is 17 m wide and its far end is 150 m away
   * and in frame. A machi street is 6-10 m wide with a corner every 38, so almost nothing is more
   * than 60 m off — but the RIDGELINES are, and they are drawn in sky() where fog never reaches
   * them, so the ramp does not have to carry the horizon either.
   *
   * What 150 buys instead is the wet-air look at middle distance: an exponent of 1.15 is the
   * gentlest of the four, so a wall forty metres down the street is still at 0.72 rather than the
   * city's 0.65, and it fades EVENLY instead of dropping off a cliff. Combined with the haze floor
   * — which this world very much does want, being the opposite of airless — that is aerial
   * perspective inside a single street, which is a thing only this world has: the city is too dark
   * for it and the frontier is too dry. */
  var FOG_START_J = 14.0, FOG_END_J = 150.0, FOG_POW_J = 1.15;

  CC.SurfJapan = {
    id: 'japan',
    facade: facade, floorTex: floorTex, sky: sky, STYLE: JP_ST,
    fogStart: FOG_START_J, fogEnd: FOG_END_J, fogPow: FOG_POW_J,
    sunOf: sunOf, dayAt: dayAt, openSky: openSky
  };
  /* GETTERS, for the same reason the other two painters' are: these are refreshed once per frame
   * from the daylight director, and src/proj.js's litFace() plus every element that places a lit
   * face reads them by name off whichever painter owns the live world. A copied value would freeze
   * each reader at whatever the sun was doing when its module happened to load. */
  Object.defineProperty(CC.SurfJapan, 'SUN_AZ', { get: function () { return SUN_AZ; } });
  Object.defineProperty(CC.SurfJapan, 'SUN_X', { get: function () { return SUN_X; } });
  Object.defineProperty(CC.SurfJapan, 'SUN_Z', { get: function () { return SUN_Z; } });
  Object.defineProperty(CC.SurfJapan, 'SUN_ALT', { get: function () { return SUN_ALT; } });
  Object.defineProperty(CC.SurfJapan, 'night', { get: function () { return dNight; } });
  Object.defineProperty(CC.SurfJapan, 'dayFill', { get: function () { return dFill; } });
  /* Self-registration: surfaces.js never learns this file's name. */
  if (!CC.SURFACES) CC.SURFACES = {};
  CC.SURFACES.japan = CC.SurfJapan;
  if (typeof module !== 'undefined') module.exports = CC.SurfJapan;
})(typeof CC !== 'undefined' ? CC : require('./core.js'));
