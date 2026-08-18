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

  var P = CC.P, g = CC.g, hash2 = CC.hash2, clamp = CC.clamp, vnoise = CC.vnoise;

  var G_DOT = g('.'), G_COMMA = g(','), G_COLON = g(':'), G_SEMI = g(';'), G_QUOTE = g("'"),
      G_TICK = g('`'), G_DASH = g('-'), G_UNDER = g('_'), G_EQ = g('='), G_TILDE = g('~'),
      G_PIPE = g('|'), G_SLASH = g('/'), G_PCT = g('%'), G_AMP = g('&'), G_8 = g('8'),
      G_0 = g('0'), G_o = g('o');

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
  }
  var dT = 1 / 0, dSun = 0.64, dSky = 0.66, dWarm = 0.74, dLamp = 1, dStar = 0;
  function dAlt() { return SUN_ALT; }

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
    if (lod > 0 && hash2(Math.floor(u * 3.1), Math.floor(v * 2.7), sd ^ 0x9B) < 0.20 + 0.12 * bh) {
      return fset(bh < 0.4 ? G_COLON : (bh < 0.75 ? G_PCT : G_AMP),
                  sun > 0.6 && bh > 0.6 ? P.ember : P.slate,
                  (10 + bh * 16) * shade * (0.5 + 0.5 * sun));
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
     * it is: the swatch is 216,232,74 and low sun on weathered pine is very close to it. */
    var litHue = (hue === P.warm || hue === P.white || hue === P.ember) ? hue : P.amber;
    var sunHue = sun >= 0.62 ? P.amber : litHue;

    /* ---- the coping ---------------------------------------------------------------------------
     * The top 30 cm of a false front is a capping board, and it is the single most valuable line
     * in the world: it is the roofline, and a roofline is what turns a black shape into a
     * building. It is drawn at every distance and every LOD for that reason. */
    if (h - v < 0.34) {
      return fset(G_EQ, sun >= 0.62 ? P.amber : (sun > 0.30 ? litHue : P.slate),
                  (sun >= 0.62 ? 214 : (sun > 0.30 ? 82 : 32)) * gr);
    }
    /* And the shadow it throws — one board's worth of dark immediately under it, which is what
     * makes the coping read as PROUD of the wall rather than painted on it. */
    if (h - v < 0.62) return fset(0, P.shadow, 0);

    var bay = Math.floor(u / st.bay), fu = u / st.bay - bay;
    var bh = hash2(bay, sd, 0x3F1);              // this bay's identity, stable forever

    /* ---- the porch line -----------------------------------------------------------------------
     * Where the awning meets the wall. Above it the building; below it, shopfront in the shade of
     * its own porch. The dark band is the shadow line and it is what separates the two storeys
     * without drawing a cornice on a building that would never have had one. */
    if (v > st.gnd && v < st.gnd + 0.30) return fset(0, P.shadow, 0);
    if (v > st.gnd + 0.30 && v < st.gnd + 0.52)
      return fset(G_DASH, sun >= 0.62 ? P.amber : P.slate, (sun >= 0.62 ? 74 : 22) * gr);

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
          return fset(G_PIPE, P.slate, 20 * gr);
        if (!open) return fset(0, P.shadow, 0);
        var dk = 1 - v / 2.15;
        return fset(v < 0.35 ? G_UNDER : G_8, P.warm, (96 + 74 * dk) * (0.7 + 0.5 * gr));
      }

      var wv0 = 0.80, wv1 = wv0 + st.shopH;
      if (v > wv0 && v < wv1 && fu > w0 && fu < w1) {
        /* Glass. The frame first — a shopfront is a big pane in a heavy timber surround and the
         * surround is what carries the shape at distance. */
        if (v - wv0 < 0.14 || wv1 - v < 0.14 || fu - w0 < 0.04 || w1 - fu < 0.04)
          return fset(G_EQ, sun >= 0.62 ? P.white : P.slate, (sun >= 0.62 ? 66 : 26) * gr);
        if (!open) {
          /* Shuttered: boards nailed across, which is a diagonal, and the one place a diagonal
           * belongs on this facade. */
          var bd = Math.floor((v * 1.6 + fu * 2.2) * 2.4);
          return (bd & 1) ? fset(G_SLASH, P.slate, 15 * gr) : fset(0, P.shadow, 0);
        }
        /* Lit: a warm field with a mullion up the middle and the goods in the window reading as
         * broken dark. Held at lum 120-190 — warm's EXPOSURE weight is 0.32, so this lands in the
         * 130-165 print band that market.js measured as free on both the muddy and the hot count. */
        var mull = Math.abs(fu - (w0 + w1) * 0.5) < 0.022;
        if (mull) return fset(G_PIPE, P.slate, 30);
        var gl = hash2(Math.floor(u * 2.6), Math.floor(v * 2.6), sd ^ 0x77);
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
       * storey above it whichever way it faces, and that inversion is what makes a porch a porch. */
      return board(u, v, st, sd, lod, gr, sun * 0.42, sunHue, dist);
    }

    /* ---- upper storey -------------------------------------------------------------------------
     * One window per bay, centred, at a fixed height off the porch line. Fewer and smaller than
     * the city's, and mostly dark: a lit upstairs window at this hour is somebody turning in. */
    var uy = v - (st.gnd + 0.52);
    var storey = Math.floor(uy / st.up);
    var sv = uy - storey * st.up;
    if (storey >= 0 && sv > 0.55 && sv < 0.55 + st.winH) {
      var cw = st.winW / st.bay, c0 = 0.5 - cw * 0.5, c1 = 0.5 + cw * 0.5;
      if (fu > c0 && fu < c1) {
        var wh = hash2(bay * 7 + storey, sd, 0x8D2);
        if (sv - 0.55 < 0.11 || 0.55 + st.winH - sv < 0.11 || fu - c0 < 0.05 || c1 - fu < 0.05)
          return fset(G_DASH, sun >= 0.62 ? P.white : P.slate,
                      (sun >= 0.62 ? 58 : 22) * gr);
        if (wh < lit) {
          var lg = hash2(Math.floor(u * 3.4), Math.floor(v * 3.4), sd ^ 0xA3);
          if (lg < 0.16) return fset(G_o, P.shadow, 0);       // somebody at the glass
          if (lg > 0.66) return fset(lg > 0.92 ? G_o : G_8, P.amber, (204 + lg * 50) * gr);
          return fset(G_8, P.warm, (112 + lg * 84) * gr);
        }
        /* Dark glass still reflects the sky, and that is the only reason an unlit window is
         * visible at all — a faint cool cell in a warm wall. It is ice rather than azure because
         * ice is a GLINT weight (0.36) and azure is a pillar (1.00): one dark pane in azure at
         * this lum would be the brightest thing on the building. */
        if (hash2(Math.floor(u * 2.2), Math.floor(v * 2.2), sd ^ 0xB5) < 0.30)
          return fset(G_COLON, P.ice, 20 * gr);
        return fset(0, P.shadow, 0);
      }
      /* The sill and the head run the full bay on a painted front — a line of white across the
       * facade at window height, which is a strong horizontal and very much of the period. */
      if (st.rough === 0 && (sv - 0.55 < 0.10 || 0.55 + st.winH - sv < 0.10) && bh > 0.62)
        return fset(G_DASH, sun >= 0.62 ? P.white : P.slate, (sun >= 0.62 ? 50 : 18) * gr);
    }

    return board(u, v, st, sd, lod, gr, sun, sunHue, dist);
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
  function board(u, v, st, sd, lod, gr, sun, sunHue, dist) {
    if (st.rough) {
      /* Adobe and stone: no rhythm, a mottle. Rendered mud is nearly featureless in shade and
       * comes alive in raking light, which is exactly what `sun` does to the density below. */
      var m = hash2(Math.floor(u * 2.4), Math.floor(v * 2.4), sd ^ 0x4C1);
      var dens = 0.10 + 0.26 * sun;
      if (m > dens) return fset(0, P.shadow, 0);
      return fset(m < dens * 0.4 ? G_QUOTE : G_COLON,
                  sun >= 0.62 ? sunHue : P.slate, (10 + 62 * sun + m * 40) * gr);
    }

    var lap = st.lap * (lod === 2 ? 1 : (lod === 1 ? 2 : 4));
    if (st.vert) {
      /* Board and batten runs the other way: the rhythm is vertical and it is the batten, not a
       * shadow line, so it is a lit stroke on a dark wall rather than a dark one on a lit wall. */
      var bx = u / (lap * 1.4), fbx = bx - Math.floor(bx);
      if (fbx > 0.14) {
        return (sun >= 0.62 && hash2(Math.floor(u * 1.7), Math.floor(v * 1.7), sd ^ 0x2A) < 0.12)
             ? fset(G_QUOTE, sunHue, 26 * gr) : fset(0, P.shadow, 0);
      }
      return fset(G_PIPE, sun >= 0.62 ? sunHue : P.slate, (12 + 58 * sun) * gr);
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
    if (sun >= 0.62) {
      var body = hash2(Math.floor(u * 2.4), Math.floor(v * 2.4), sd ^ 0x66);
      if (fbv <= 0.30)
        return fset(wob < 0.22 ? G_UNDER : G_DASH, sunHue, (176 + wob * 68) * gr);
      if (body < 0.62)
        return fset(body < 0.20 ? G_DASH : (body < 0.44 ? G_UNDER : G_TICK), sunHue,
                    (124 + body * 74) * gr);
      return fset(0, P.shadow, 0);
    }

    if (fbv > 0.30) {
      /* Between the lines, on the shadow side. A very few specks — nail heads and knots — because
       * a perfectly empty field between two perfect lines reads as a stencil. */
      if (lod === 2 && hash2(Math.floor(u * 2.8), Math.floor(v * 2.8), sd ^ 0x66) < 0.10)
        return fset(G_DOT, P.slate, (10 + 46 * sun) * gr);
      return fset(0, P.shadow, 0);
    }
    /* The lap line, in shade. */
    return fset(wob < 0.22 ? G_UNDER : G_DASH, P.slate, (13 + 74 * sun + wob * 22) * gr);
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
        if (sunSide) return rset(G_UNDER, P.white, (62 + pw * 40));
        return (pw < 0.30) ? rset(G_UNDER, P.slate, 12 + pw * 20) : rset(0, P.shadow, 0);
      }
    }
    /* Past the walk: the ground under the buildings, which is only ever seen through a gap. */
    if (al >= half + BOARDWALK) {
      if (lod === 0) return rset(0, P.shadow, 0);
      var og = hash2(Math.floor(wx * 1.6), Math.floor(wz * 1.6), 0x2D9);
      if (og > 0.14) return rset(0, P.shadow, 0);
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
      if (rs < rd)
        return rset(rs < 0.14 ? G_UNDER : (rs < 0.34 ? G_COMMA : G_DOT),
                    sunSide ? P.white : P.slate,
                    (26 + rs * 150) * rut * (sunSide ? 1.15 : 0.72));
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
    var dens = (0.42 - 0.20 * n * n) * sideBias * lightK *
               (lod === 2 ? 1 : (lod === 1 ? 0.82 : 0.6));
    /* More dust in the air means more dust on the ground; a squall packs it down. */
    dens *= (0.82 + 0.5 * wDust) * (1 - 0.45 * clamp(wet - 0.3, 0, 1));

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
      /* WHITE ON BOTH SIDES ONCE THE SUN IS UP. The slate/white split is a dusk fact — one side of
       * the road in the light and one in the shade of the buildings — and at noon there is no shade
       * to be on the far side of. */
      var dayGround = dSun > 0.55;
      return rset(k1 < 0.3 ? G_DOT : (k1 < 0.62 ? G_COMMA : G_TICK),
                  hot ? P.amber : ((sunSide || dayGround) ? P.white : P.slate),
                  (hot ? 132 : 22 + k1 * 128) * (sunSide ? 1 : 0.78) *
                  (0.6 + 0.7 * lightK + 0.9 * dSun));
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
    var cap = 1 - 0.52 * wCloud;

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
    if (hs < 0.05 + 1.18 * e) {
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
      if (e > 0.80) return sset(G_EQ, P.white, 214 * (0.80 + 0.24 * e) * (0.88 + 0.18 * hs2));
      if (e > 0.62) return sset(G_DASH, P.white, 176 * (0.72 + 0.32 * e) * (0.86 + 0.22 * hs2));
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

  CC.SurfWest = { id: 'west',
                  facade: facade, floorTex: floorTex, sky: sky, STYLE: STYLE_W,
                  fogStart: FOG_START_W, fogEnd: FOG_END_W, fogPow: FOG_POW_W,
                  sunOf: sunOf, BOARDWALK: BOARDWALK };
  /* GETTERS, because these three stopped being constants when the sun started moving and five
   * call sites in three element files read them by name. A getter kept every one of them correct
   * without an edit; a copied value would have frozen each reader at whatever the sun was doing
   * when its module loaded. */
  Object.defineProperty(CC.SurfWest, 'SUN_AZ', { get: function () { return SUN_AZ; } });
  Object.defineProperty(CC.SurfWest, 'SUN_X', { get: function () { return SUN_X; } });
  Object.defineProperty(CC.SurfWest, 'SUN_Z', { get: function () { return SUN_Z; } });
  Object.defineProperty(CC.SurfWest, 'SUN_ALT', { get: function () { return SUN_ALT; } });
  /* Self-registration: surfaces.js never learns this file's name. */
  if (!CC.SURFACES) CC.SURFACES = {};
  CC.SURFACES.west = CC.SurfWest;
  if (typeof module !== 'undefined') module.exports = CC.SurfWest;
})(typeof CC !== 'undefined' ? CC : require('./core.js'));
