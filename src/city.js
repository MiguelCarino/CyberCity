/* CyberCity city — endless deterministic heightmap: street lattice, blocks, lots, districts.
   Everything is a pure function of (seed, gx, gz); chunks only cache what was already decided,
   so scrubbing time backwards or re-entering a chunk gives byte-identical geometry. */
(function () {
  'use strict';

  // Resolved late: this file must load even with no core present (the standalone parse check).
  var C = (typeof CC !== 'undefined' && CC) ? CC
        : (typeof globalThis !== 'undefined' && globalThis.CC) ? globalThis.CC : null;

  var hash2, clamp, vnoise, P;      // bound on first make(), never at load time
  var STYLE = null, SIGN_G = null, STYLE_W = null, SIGN_G_W = null;

  /* ---- salt spreading -------------------------------------------------
   * Every draw below is hash2(coord, coord, S + k) for a small literal k, and hash2 mixes its
   * salt through Math.imul(s, 2147483647). That multiplier is 2^31-1, so imul(s+d, 2147483647)
   * differs from imul(s, 2147483647) by only -d modulo 2^32: a salt step of 2 perturbs the
   * accumulator by MINUS TWO, and hash2's single xorshift-multiply finaliser cannot avalanche a
   * two-bit change into independence. The consequence is that adjacent salts on the SAME (x,z)
   * are not two random variables, they are one seen twice. Measured over 320x320 lots at seeds
   * 3/7/42/99, 128 of the 210 salt pairs city.js draws on a lot correlated past the 0.004 noise
   * floor, the worst at -0.44: a lot's setback roll (S+505) half-decided its style (S+601), the
   * district a cell got was 26% determined by where its own Voronoi site jitter landed (S+5 vs
   * S+7), and spring lots were 3.4x likelier on one side of their lattice cell than the other.
   *
   * The fix has to live here rather than in hash2, whose exact arithmetic other modules and the
   * shipped index.html depend on. Folding the salt into BOTH coordinates first routes it through
   * the coordinate multipliers, which are large and odd, so the effective salt multiplier becomes
   * imul(A,374761393) + imul(B,668265263) + 2147483647 -- and a step of 1 in k now moves every
   * bit of the accumulator instead of the bottom two. The constants were not picked for looks:
   * they were chosen by measuring all 780 pairs of the 40 salts this file actually draws, across
   * four seeds, and this pair is the one that leaves ZERO pairs above 0.02 (worst 0.018, which is
   * four sigma on 48841 samples and exactly what 3120 independent pairs should throw up by
   * chance). Still one hash, still two imuls, still a pure function of (seed, x, z). */
  function hash(x, y, s) {
    return hash2(x + Math.imul(s, 0x2545F491), y + Math.imul(s, 0x9E3779B1), s);
  }

  // Lattice spacing in world units, and 1 cell == 1 metre: eye 1.7, walk 1.6 m/s, a 5-wide
  // street with a 30 m wall on each side is the canyon proportion measured off the references.
  var AVE = 30, CROSS = 26, CH = 16;

  // [lit window, dim mullion, small-window alt]. The dim glyph is what makes a facade read as a
  // massed slab instead of a sparse lattice — surfaces fills every unlit cell with it.
  var STYLE_CH = [
    ['#', ':', 'o'],   // 0 grid       — dense office punch windows
    ['8', '=', 'o'],   // 1 slab glass — curtain wall, whole floors light at once
    ['=', '-', ':'],   // 2 louvre     — horizontal banding, low contrast
    ['X', '.', 'Z'],   // 3 mesh       — scaffold/lattice over a dark core
    ['0', '|', 'o'],   // 4 stripe     — vertical mullions, tower proportions
    ['O', "'", 'o']    // 5 industrial — mostly blind wall, rare lit port
  ];
  var SIGN_CH = ['#', '8', '0', 'X', 'O', '=', 'Z'];

  /* ---- the frontier's timber -------------------------------------------------------------------
   * Same triple, read the same way by surfaces: [lit opening, dim fill, small-window alt]. What
   * changes is that out here the DIM glyph is the wall rather than the mullion — a clapboard front
   * is a solid mass of horizontal boards with two or three openings punched in it, so the fill has
   * to carry the whole facade and the lit glyph is a rarity. The city's fills are lattices (':',
   * '=', '|') because a curtain wall IS a lattice; these are strokes, because a board is a stroke.
   *
   * '~' and '_' were both tried as the plank fill and both are too thin at 9 px to mass — a wall
   * of them prints as scan-lines and the building dissolves. '-' and '=' hold. */
  var STYLE_CH_WEST = [
    ['8', '-', 'o'],   // 0 clapboard  — horizontal boards, the main-street standard
    ['0', '|', 'o'],   // 1 batten     — vertical board-and-batten, barns and warehouses
    ['O', '=', ':'],   // 2 falsefront — planed and painted, the storefronts with money
    ['#', "'", 'o'],   // 3 adobe      — rendered mud brick, almost no openings
    ['X', '.', ':'],   // 4 fieldstone — rubble wall, a bank or a jail
    ['8', '=', 'o'],   // 5 log        — squared timber, the oldest buildings in town
    /* 6 is NOT a building. A `range` lot that drew a butte is marked with this style and nothing
     * else — surf_west.js switches to rock on it, and it is carried as a style index rather than
     * as a new record field because the style is the one piece of the record raycast.js already
     * copies into the scratch it hands the texture layer. One integer, no new plumbing. */
    ['%', '&', ':']    // 6 rock       — sandstone butte, bedded and weathered
  ];
  /* A painted board, not a neon tube: the glyphs that read as LETTERING at two cells tall. 'M',
   * 'W' and 'N' are in here because a shop board seen down the street is legible as the SHAPE of
   * writing long before it is legible as writing, and those three carry that shape. */
  var SIGN_CH_WEST = ['M', 'W', 'N', 'H', 'X', 'A', 'K'];

  /* ---- the Moon's two surfaces, and there are only two ------------------------------------------
   * A world with no buildings needs no styles: index 7 is regolith and index 8 is rock, and the
   * triple is read by surf_moon.js as [sunlit, shadowed, grain]. The indices continue the west
   * table's numbering rather than restarting, because city.js's `style` is one integer shared by
   * every world and a reader who sees 8 should be able to find it in one table. */
  var STYLE_CH_MOON = [
    ['%', '.', ':'],   // 7 regolith  — powder, and mostly not painted at all
    ['8', ':', '%']    // 8 rock      — breccia and basalt, blocky and hard-edged
  ];

  // Districts are the colour masses. Weights keep the two pillars dominant and violet rare,
  // which is the reference ratio (amber ~26% of lit pixels, azure ~27%, violet a garnish).
  var DIST = null, DIST_CYBER = null, DIST_WEST = null, DIST_MOON = null;
  function buildDistricts() {
    DIST_CYBER = [
      // hMin is the floor of the canyon wall, not the average: with the squared height curve most
      // lots sit near hMin, so this number is what sets how enclosed the street feels.
      // The lit/weight pairs were tuned against a 1.44 M-cell census until facade-area x litRate
      // landed near the reference split: the two pillars roughly level, slate carrying structure,
      // and the three accents narrow.
      // `mixP` is the share of a zone's buildings that take the zone hue; the rest fall back to
      // `mix`. Pillar zones stay nearly pure, accent zones are threaded with a pillar so a green
      // or ember quarter tints the frame without ever owning it.
      /* sodium 0.25 / screen 0.24 rather than 0.27 / 0.22, and this is a REPAIR of the census these
       * weights were fitted against, not a re-taste. That fit was done while districtType drew from
       * S+7 and the site jitter from S+5, salts two apart, which correlated the type a lattice cell
       * rolled with where its own Voronoi site sat — spring and ember landed on one side of their
       * cell 3.2-3.4x more often than the other, and the resulting area shares were not the ones
       * the weights asked for. With the draws decorrelated the table finally gets what it wrote
       * down, and what it wrote down leans amber: 27.6% of the ground to sodium against 22.4% to
       * screen. Measured over 480 frames across 60 seeds, that printed as amber 27.2% of lit energy
       * against azure 22.7% — the pillars a stop apart instead of level. At 0.25/0.24 the same 480
       * frames give 26.8/23.1, and nothing else moves: sky stays 2.0% of cells, facade 63.9%. */
      /* EVERY litRate BELOW IS THE OLD ONE TIMES 1.35, and the uniform factor is the whole point.
       * The frame was measured at 39.1% of its cells BLANK — no glyph written at all — and 30.1
       * points of that 39.1 were facade. Facade is 70% of the picture and 43% of it was nothing,
       * which is the "too much empty space" this change answers.
       *
       * It cannot be answered by painting the dark tiers instead. surfaces.js argues at length
       * that the unlit spandrel and the dead glass are held blank on purpose, and the print
       * histogram agrees: the muddy 9-119 band is already 32.4% against core.js's <30 target, so
       * every dim cell added there comes straight off a budget that is already overdrawn. A LIT
       * BAY is the opposite trade — it lands at v>119, where the frame is thin (11.7% upper, 3.4%
       * hot against a 3.5-5 target, i.e. under it).
       *
       * A uniform factor is what keeps the census these numbers were fitted to. The comment below
       * describes a fit of facade-area x litRate against the reference colour split; that product
       * is a RATIO between districts, so scaling all six by one constant moves every district's
       * share by exactly nothing and only the total energy changes. Anything else here — a bit
       * more on the pillars, a bit less on concrete — would be re-tasting a split that was
       * measured over 480 frames, and it is not what was wrong with the picture. */
      { name: 'sodium',   hue: P.amber,  mix: P.azure,  mixP: 0.86, accent: P.warm,  styles: [0, 3, 0],
        hMin: 15, hMax: 34, lit: 0.32, signP: 0.34, landmark: 0.010, w: 0.25 },
      { name: 'screen',   hue: P.azure,  mix: P.amber,  mixP: 0.86, accent: P.white, styles: [1, 4, 1],
        hMin: 24, hMax: 56, lit: 0.27, signP: 0.16, landmark: 0.030, w: 0.24 },
      { name: 'concrete', hue: P.slate,  mix: P.white,  mixP: 0.80, accent: P.white, styles: [2, 5],
        hMin: 16, hMax: 32, lit: 0.22, signP: 0.05, landmark: 0.006, w: 0.20 },
      // ember is the low industrial pocket — it exists to open the sky slot back up.
      { name: 'ember',    hue: P.ember,  mix: P.amber,  mixP: 0.55, accent: P.red,   styles: [5, 2],
        hMin: 8,  hMax: 19, lit: 0.22, signP: 0.13, landmark: 0.002, w: 0.11 },
      { name: 'spring',   hue: P.spring, mix: P.azure,  mixP: 0.50, accent: P.white, styles: [2, 0],
        hMin: 15, hMax: 29, lit: 0.24, signP: 0.16, landmark: 0.006, w: 0.12 },
      // The entertainment strip. Its facades are ordinary azure/amber on purpose: violet is a
      // signage colour only, and a whole wall of it turns the frame into the cliche the
      // references deliberately avoid.
      // ...and the accent obeys that too: it used to be P.violet, which put 16-column violet
      // walls in the frame in direct contradiction of the comment directly above it.
      { name: 'arcade',   hue: P.azure,  mix: P.amber,  mixP: 0.55, accent: P.warm,  styles: [1, 3],
        hMin: 13, hMax: 27, lit: 0.30, signP: 0.60, landmark: 0.004, w: 0.06 }
    ];

    /* ---- the frontier's five and a half ----------------------------------------------------------
     * Same job: districts are the colour masses, and they are what stops a town of timber boxes
     * printing as one timber box. Read against the city table above, three things are different and
     * all three are the setting rather than a taste:
     *
     * hMin/hMax are 4-11 against the city's 8-56. A frontier main street is TWO STOREYS, and the
     * whole reason to build this world is what that does to the frame — the city gives you a slot
     * of sky between rooflines, this gives you a horizon, and the horizon is the picture. It is
     * also why `landmark` is so much likelier here (a steeple or a water tank at 14-24 m is the
     * only vertical for a mile) and why the landmark heights below are a fifth of the city's.
     *
     * lit is a THIRD of the city's, because there is no grid out here. A window is lit when
     * somebody is in the room with a lamp, so the litRate numbers are what a kerosene town can
     * actually afford, and the mass of every facade is unlit board carried by the dim glyph.
     *
     * `range` is the district that is mostly NOT a district: 62% of its lots are empty ground and
     * one in fourteen is a butte instead of a building. It is 26% of the ground by weight, which
     * is what opens the town out into country every few blocks instead of tiling frontage to the
     * horizon. Its `hue` still matters — a butte is lit by the same low sun as everything else.
     */
    DIST_WEST = [
      { name: 'main',     hue: P.warm,   mix: P.amber,  mixP: 0.72, accent: P.amber, styles: [0, 2, 0, 2],
        hMin: 6.2, hMax: 10, lit: 0.20, signP: 0.66, landmark: 0.022, w: 0.21,
        vacant: 0.07, butte: 0 },
      { name: 'dust',     hue: P.slate,  mix: P.white,  mixP: 0.74, accent: P.white, styles: [0, 1, 5],
        hMin: 5.0, hMax: 8.5, lit: 0.11, signP: 0.18, landmark: 0.004, w: 0.19,
        vacant: 0.20, butte: 0 },
      { name: 'adobe',    hue: P.ember,  hue2: P.warm,  mix: P.warm,  mixP: 0.66, accent: P.warm, styles: [3, 3, 4],
        hMin: 4.4, hMax: 7.5, lit: 0.13, signP: 0.12, landmark: 0.010, w: 0.14,
        vacant: 0.16, butte: 0 },
      { name: 'ranch',    hue: P.ember,  mix: P.slate,  mixP: 0.58, accent: P.red,   styles: [1, 1, 5],
        hMin: 5.4, hMax: 9.5, lit: 0.09, signP: 0.09, landmark: 0.006, w: 0.13,
        vacant: 0.30, butte: 0.004 },
      /* The mission quarter: lime-washed plaster and the one place with trees in it. white leads,
       * spring is the cottonwood, and it carries the church — landmark 0.05 is by far the highest
       * in either world, because a mission IS its bell tower. */
      { name: 'mission',  hue: P.white,  mix: P.amber,  mixP: 0.60, accent: P.spring, styles: [3, 4, 2],
        hMin: 5.4, hMax: 9.5, lit: 0.14, signP: 0.07, landmark: 0.050, w: 0.07,
        vacant: 0.22, butte: 0 },
      { name: 'range',    hue: P.slate,  mix: P.ember,  mixP: 0.62, accent: P.ember, styles: [4, 1, 4],
        hMin: 4.4, hMax: 7.5, lit: 0.06, signP: 0.02, landmark: 0.000, w: 0.26,
        vacant: 0.62, butte: 0.072 }
    ];

    /* ---- MOONWALK: districts as TERRAIN TYPES rather than colour masses ---------------------
     * Every field means what it means everywhere else; what changes is that the thing being
     * described is ground rather than architecture. `lit: 0` and `signP: 0` on every row are
     * doing real work: signP 0 leaves rec.sign null, so raycast.js's signPixel is never entered
     * and the entire signage path — the brightest thing the caster can draw — is switched off by
     * DATA, with no code change and no way for a neon blade sign to appear on a crater rim.
     *
     * `hue` is white or slate and never anything warm, and that is the lighting doctrine in the
     * table: there is no atmosphere to redden anything, and core.js prints slate at a ceiling of
     * 114 — under the muddy band's own ceiling — so slate can never be the LIT face of anything.
     * It is the shadow swatch here and nothing else. */
    DIST_MOON = [
      /* The floor of a mare, and the district that IS the plain: 94% of its lots are open ground,
       * which is why it is the heaviest row in the table. */
      { name: 'mare',     hue: P.slate, mix: P.white, mixP: 0.70, accent: P.white, styles: [7],
        hMin: 0.5, hMax: 1.8, lit: 0, signP: 0, landmark: 0.000, w: 0.30,
        vacant: 0.94, boulder: 0.10, crater: 0.06 },
      /* Ejecta — the blanket thrown out of a crater, and the one place the ground has real relief
       * in it. Its lots are rock piles a metre to five metres high. */
      { name: 'ejecta',   hue: P.white, mix: P.slate, mixP: 0.62, accent: P.pure,  styles: [7, 8],
        hMin: 1.2, hMax: 5.0, lit: 0, signP: 0, landmark: 0.000, w: 0.20,
        vacant: 0.70, boulder: 0.55, crater: 0.10 },
      /* Rim. The crater branch in computeCell fires here: a raised ring round a flat walkable
       * floor, and the only district in any world that draws a SHAPE rather than a height. */
      { name: 'rim',      hue: P.white, mix: P.slate, mixP: 0.66, accent: P.pure,  styles: [8],
        hMin: 2.0, hMax: 7.0, lit: 0, signP: 0, landmark: 0.004, w: 0.16,
        vacant: 0.52, boulder: 0.18, crater: 0.46 },
      /* Highland — older, rougher, higher, and the only district that draws a massif. That is
       * what puts something on the horizon which is terrain rather than backdrop. */
      { name: 'highland', hue: P.white, mix: P.slate, mixP: 0.74, accent: P.pure,  styles: [8, 7],
        hMin: 3.5, hMax: 15.0, lit: 0, signP: 0, landmark: 0.030, w: 0.14,
        vacant: 0.58, boulder: 0.24, crater: 0.08 },
      /* The landing site: flat, scoured, and the district the hardware elements probe for. Its
       * ground is 96% empty because the descent engine cleared it. */
      { name: 'site',     hue: P.slate, mix: P.white, mixP: 0.60, accent: P.amber, styles: [7],
        hMin: 0.3, hMax: 1.2, lit: 0, signP: 0, landmark: 0.000, w: 0.08,
        vacant: 0.96, boulder: 0.04, crater: 0.02, hardware: 1 },
      /* Regolith plain — the transitional ground, and deliberately the dullest row in the table.
       * It exists so that two interesting districts are rarely adjacent. */
      { name: 'plain',    hue: P.slate, mix: P.white, mixP: 0.80, accent: P.white, styles: [7],
        hMin: 0.4, hMax: 1.4, lit: 0, signP: 0, landmark: 0.000, w: 0.12,
        vacant: 0.92, boulder: 0.14, crater: 0.04 }
    ];

    norm(DIST_CYBER); norm(DIST_WEST); norm(DIST_MOON);
    /* Hung on the themes, so make() reads TH.dist and nothing selects a table by comparing a
     * string. The three-line `west ? A : B` chain this replaced is the exact shape that made a
     * third world silently inherit the city's districts. */
    TH_CYBER.dist = DIST_CYBER; TH_WEST.dist = DIST_WEST; TH_MOON.dist = DIST_MOON;
    DIST = DIST_CYBER;
  }
  function norm(T) {
    var acc = 0;
    for (var i = 0; i < T.length; i++) { acc += T[i].w; T[i].acc = acc; }
    T.total = acc;
  }

  /* ---- what a world changes about the ground plan ----------------------------------------------
   * Only the numbers that ARE the setting, and each one is here because leaving it at the city's
   * value produced something that read wrong rather than because a table wanted filling.
   *
   *   AVE/CROSS   block pitch. The frontier's is 70% longer in both axes: a town is a handful of
   *               buildings on a long road, and at the city's 30 m pitch you get a crossroads
   *               every ten seconds of walking, which reads as a city with short buildings.
   *   half        street half-width, and this is the single biggest change in the file. A city
   *               street is a canyon 7-13 m across; a frontier main street is 17-21 m of dirt,
   *               wide enough to turn a wagon team in, and that width is most of what makes the
   *               frame read as open country rather than as a demolished city.
   *   lot*        footprints. Smaller and shallower — a shopfront is 5-9 m of frontage.
   *   alley/plaza the city's block-breakers. Alleys stay (a gap between two buildings is a
   *               frontier staple); plazas become the corral/square and get bigger and commoner.
   *   setback     INVERTED, and see computeCell: the city drops a lot's outer ring to a podium,
   *               the frontier raises the outer ring into a false front and drops the interior.
   *   butte*      the height band a `range` lot's rock rises to, when it draws one.
   */
  var TH_CYBER = {
    id: 'cyber', AVE: 30, CROSS: 26,
    aveJit: 15, aveOff: -7, crossJit: 13, crossOff: -6,
    aveWide: 6, aveMid: 4, aveNarrow: 3, aveMidP: 0.35, aveEvery: 4,
    crossWide: 3, crossMid: 2, crossNarrow: 1, crossMidP: 0.28, crossEvery: 5,
    lotW: 6, lotWVar: 7, lotD: 6, lotDVar: 8,
    alleyMin: 10, alleyP: 0.45, alleyDeepMin: 11, alleyDeepP: 0.35,
    plazaP: 0.13, plazaBigP: 0.26, plazaR: 5, plazaRVar: 7,
    vacant: 0.06, setbackP: 0.42, podMin: 7, podVar: 10, falseFront: 0,
    lmMin: 58, lmVar: 46, crownTall: 55, DG: 26, sky: 0,
    styleCh: STYLE_CH, signCh: SIGN_CH, styleBase: 0,
    setbackMode: 'podium', signShape: 'blade', signPalette: 'neon'
  };
  var TH_WEST = {
    id: 'west', AVE: 52, CROSS: 44,
    aveJit: 19, aveOff: -9, crossJit: 15, crossOff: -7,
    aveWide: 9, aveMid: 7, aveNarrow: 6, aveMidP: 0.42, aveEvery: 3,
    crossWide: 6, crossMid: 4, crossNarrow: 3, crossMidP: 0.34, crossEvery: 4,
    lotW: 5, lotWVar: 5, lotD: 6, lotDVar: 6,
    alleyMin: 9, alleyP: 0.52, alleyDeepMin: 10, alleyDeepP: 0.40,
    plazaP: 0.20, plazaBigP: 0.34, plazaR: 6, plazaRVar: 9,
    vacant: 0.14, setbackP: 0.68, podMin: 0, podVar: 0, falseFront: 1,
    lmMin: 14, lmVar: 10, crownTall: 13, DG: 34, sky: 1,
    butteMin: 9, butteVar: 23, rockStyle: 6,
    styleCh: STYLE_CH_WEST, signCh: SIGN_CH_WEST, styleBase: 0,
    setbackMode: 'falsefront', signShape: 'board', signPalette: 'painted'
  };
  /* ---- MOONWALK ---------------------------------------------------------------------------
   * The lattice is kept and made INVISIBLE, which is the only way an engine whose route walker
   * follows street centrelines can render an open plain. Three moves at once: the pitch roughly
   * doubles against the frontier, the corridors roughly double again, and the blocks go almost
   * entirely vacant. What is left is a plain with faint 25-40 m seams through it that nothing
   * marks — and a walk that still has somewhere to walk, because a corridor is still a corridor
   * even when there is nothing built along it.
   *
   *   AVE 96 / CROSS 84 — at SPEED 1.6 that is a crossing every 52-60 s against the frontier's
   *     30. A crossroads you meet twice a minute reads as a grid; one you meet once a minute
   *     reads as a coincidence.
   *   aveJit 38 / aveOff -18 — the jitter has to stay bounded well under AVE/2 or colX's block
   *     arithmetic breaks; 20 against 48 is safe, and it is large enough that no two consecutive
   *     corridors are the same distance apart, which is what kills the ruled-grid read.
   *   setbackP 0 — the setback/false-front branch is a BUILDING idea. A rock has no podium and no
   *     capping board, so the branch is skipped outright rather than asked to pick a half.
   *   lmMin/lmVar 26-60 m — a "landmark" here is a massif. raycast.js's HMAX is 108 and must never
   *     under-estimate the tallest thing emitted; 60 is comfortably under, so HMAX is untouched.
   *   startT 0.10 — see chooseStart. The city's threshold asks for a wall at 57 degrees on both
   *     sides, which nothing on the Moon clears, so every seed would scan all 64 candidates and
   *     then fall back to the argmax anyway.
   */
  var TH_MOON = {
    id: 'moon', AVE: 96, CROSS: 84,
    aveJit: 38, aveOff: -18, crossJit: 34, crossOff: -16,
    aveWide: 20, aveMid: 15, aveNarrow: 11, aveMidP: 0.55, aveEvery: 2,
    crossWide: 17, crossMid: 13, crossNarrow: 10, crossMidP: 0.50, crossEvery: 2,
    lotW: 7, lotWVar: 9, lotD: 7, lotDVar: 9,
    alleyMin: 12, alleyP: 0.70, alleyDeepMin: 12, alleyDeepP: 0.70,
    plazaP: 0.55, plazaBigP: 0.70, plazaR: 14, plazaRVar: 16,
    vacant: 0.62, setbackP: 0.00, podMin: 0, podVar: 0, falseFront: 0,
    lmMin: 26, lmVar: 34, crownTall: 999, DG: 58, sky: 1,
    rimMin: 1.4, rimVar: 4.2, startT: 0.10,
    styleCh: STYLE_CH_MOON, signCh: SIGN_CH_WEST, styleBase: 7,
    setbackMode: 'none', signShape: 'none', signPalette: 'none'
  };

  /* ---- the theme registry ---------------------------------------------------------------------
   * A MAP, not a ternary. The line this replaced was `id === 'west' ? TH_WEST : TH_CYBER`, and its
   * failure mode with a third world was not an error: an unknown id fell through to the city and
   * built a cyberpunk heightmap under somebody else's name. A missing key still falls back — a
   * world with no theme has to build SOMETHING — but adding a world is now one row. */
  var THEMES = { cyber: TH_CYBER, west: TH_WEST, moon: TH_MOON };
  function themeOf(id) { return THEMES[id] || TH_CYBER; }
  function worldId() {
    return (C && C.World && C.World.id) ? C.World.id : 'cyber';
  }

  function bind() {
    if (!C) C = (typeof globalThis !== 'undefined' && globalThis.CC) ? globalThis.CC : null;
    if (!C) throw new Error('CC.City needs core.js loaded first');
    hash2 = C.hash2; clamp = C.clamp; vnoise = C.vnoise; P = C.P;
    /* One pass over the registry rather than four named slots. `styleBase` is the index the
     * theme's first style row occupies in the world-wide numbering, so a record's `style` stays a
     * single integer that means the same thing wherever it is read. */
    for (var k in THEMES) {
      var T = THEMES[k];
      T.styles = glyphTable(T.styleCh);
      T.signs = signTable(T.signCh);
    }
    STYLE = THEMES.cyber.styles; STYLE_W = THEMES.west.styles;
    SIGN_G = THEMES.cyber.signs; SIGN_G_W = THEMES.west.signs;
    buildDistricts();
  }
  function glyphTable(src) {
    var out = [];
    for (var i = 0; i < src.length; i++)
      out.push([C.g(src[i][0]), C.g(src[i][1]), C.g(src[i][2])]);
    return out;
  }
  function signTable(src) {
    var out = [];
    for (var j = 0; j < src.length; j++) out.push(C.g(src[j]));
    return out;
  }

  function make(seed) {
    if (!STYLE) bind();
    var S = seed | 0;

    /* THE WORLD IS RESOLVED ONCE, HERE, and then shadowed into locals for the whole of make().
     * Every function below closes over these names, so a city built as the frontier stays the
     * frontier no matter what the viewer presses afterwards — main.js rebuilds on a world change
     * rather than mutating a live map, and this is what makes that safe. It is also why nothing
     * downstream ever reads CC.World to decide geometry: the map already decided. */
    /* THE BOOLEAN IS GONE. This used to read `west = TH.falseFront === 1`, and the whole of the
     * per-world behaviour of make() hung off it — the district table, the glyph tables, the sign
     * palette and the sign geometry — inferred from an unrelated geometry field. Every `if (west)`
     * below really meant "if not the city", so a third world would have inherited the city's
     * districts, its glyphs, its violet-bearing sign palette and its blade signs, silently. Each
     * of those is now a field the theme states about itself. */
    var TH = themeOf(worldId());
    var AVE = TH.AVE, CROSS = TH.CROSS;
    var DIST = TH.dist;
    var STY = TH.styles;
    var SIGNS = TH.signs;

    /* ---- street lattice ------------------------------------------------
       Avenues run along +z, cross streets along +x. Position jitter is a function of the
       street's index alone, so a street stays perfectly straight while spacing stays irregular
       — a curving street would break both the canyon read and the camera's collision guarantee. */
    // Half-widths, in metres. These set how much of the frame the walls can eat: at 9 m the near
    // facade bases projected below the horizon and swallowed the floor, so the boulevard is 13 m
    // and the meanest side street is 7. Spacing guarantees a >=6 m block between any two.
    function ax(k) { return k * AVE + ((hash(k, 0, S + 101) * TH.aveJit) | 0) + TH.aveOff; }
    function aw(k) {
      return (k % TH.aveEvery === 0) ? TH.aveWide
           : (hash(k, 0, S + 102) < TH.aveMidP ? TH.aveMid : TH.aveNarrow);
    }
    function cz(m) { return m * CROSS + ((hash(0, m, S + 201) * TH.crossJit) | 0) + TH.crossOff; }
    function cw(m) {
      return (m % TH.crossEvery === 0) ? TH.crossWide
           : (hash(0, m, S + 202) < TH.crossMidP ? TH.crossMid : TH.crossNarrow);
    }

    // Scratch records: computeCell is only ever called from buildChunk, never re-entrantly.
    var SX = { street: 0, k: 0, b: 0, x0: 0, x1: 0 };
    var SZ = { street: 0, m: 0, b: 0, z0: 0, z1: 0 };

    function colX(gx, o) {
      var k = Math.round(gx / AVE), kk, c, w;
      for (kk = k - 1; kk <= k + 1; kk++) {
        c = ax(kk); w = aw(kk);
        if (gx >= c - w && gx <= c + w) { o.street = 1; o.k = kk; return; }
      }
      // Jitter is bounded well under AVE/2, so gx always lands in block [b, b+1) here.
      var b = (gx > ax(k)) ? k : k - 1;
      o.street = 0; o.b = b;
      o.x0 = ax(b) + aw(b) + 1; o.x1 = ax(b + 1) - aw(b + 1) - 1;
    }
    function rowZ(gz, o) {
      var m = Math.round(gz / CROSS), mm, c, w;
      for (mm = m - 1; mm <= m + 1; mm++) {
        c = cz(mm); w = cw(mm);
        if (gz >= c - w && gz <= c + w) { o.street = 1; o.m = mm; return; }
      }
      var b = (gz > cz(m)) ? m : m - 1;
      o.street = 0; o.b = b;
      o.z0 = cz(b) + cw(b) + 1; o.z1 = cz(b + 1) - cw(b + 1) - 1;
    }

    /* ---- districts as jittered Voronoi ---------------------------------
       A plain modulo grid would tile the city into visible squares; nearest-site over a jittered
       lattice gives contiguous organic zones ~26 cells across, which is the size the reference
       study landed on. Neighbouring cells that draw the same type simply merge into a bigger mass. */
    var DG = TH.DG;
    function districtType(p, q) {
      var r = hash(p, q, S + 7) * DIST.total, i;
      for (i = 0; i < DIST.length - 1; i++) if (r < DIST[i].acc) return i;
      return DIST.length - 1;
    }
    function districtAt(gx, gz) {
      var p = Math.floor(gx / DG), q = Math.floor(gz / DG);
      var best = 1e18, bd = 0, dp, dq, pp, qq, sx, sz, ddx, ddz, d;
      for (dq = -1; dq <= 1; dq++) for (dp = -1; dp <= 1; dp++) {
        pp = p + dp; qq = q + dq;
        sx = pp * DG + hash(pp, qq, S + 5) * DG;
        sz = qq * DG + hash(pp, qq, S + 6) * DG;
        ddx = gx - sx; ddz = gz - sz; d = ddx * ddx + ddz * ddz;
        if (d < best) { best = d; bd = districtType(pp, qq); }
      }
      return bd;
    }

    /* ---- one cell ------------------------------------------------------ */
    var cH = 0, cD = 0, cLX = 0, cLZ = 0;   // computeCell's out-params, avoids an alloc per cell
    // Every cell of a lot asks for the same district; the Voronoi is 27 hashes, so remembering
    // the last answer removes most of the chunk-build cost (a lot is up to 13x13 cells).
    var lmX = 0x7fffffff, lmZ = 0x7fffffff, lmD = 0;

    function computeCell(gx, gz) {
      colX(gx, SX); rowZ(gz, SZ);
      if (SX.street || SZ.street) { cH = 0; cD = districtAt(gx, gz); return; }

      var x0 = SX.x0, x1 = SX.x1, z0 = SZ.z0, z1 = SZ.z1, bK = SX.b, bM = SZ.b;
      var bw = x1 - x0 + 1, bd = z1 - z0 + 1;
      var t, wid, pos;

      // Alleys split the block wall so the canyon breaks and you glimpse depth down a slot.
      if (bw >= TH.alleyMin && hash(bK, bM, S + 301) < TH.alleyP) {
        wid = hash(bK, bM, S + 302) < 0.25 ? 2 : 1;
        pos = x0 + 3 + ((hash(bK, bM, S + 303) * (bw - 6 - wid)) | 0);
        if (gx >= pos && gx < pos + wid) { cH = 0; cD = districtAt(gx, gz); return; }
      }
      if (bd >= TH.alleyDeepMin && hash(bK, bM, S + 304) < TH.alleyDeepP) {
        wid = hash(bK, bM, S + 305) < 0.25 ? 2 : 1;
        pos = z0 + 3 + ((hash(bK, bM, S + 306) * (bd - 6 - wid)) | 0);
        if (gz >= pos && gz < pos + wid) { cH = 0; cD = districtAt(gx, gz); return; }
      }

      // Plazas eat the corners around an intersection; this is what widens the sky slot. They are
      // twice as likely on a boulevard because that is where the camera spends most of its walk.
      var kk, mm, r, dxp, dzp;
      for (kk = bK; kk <= bK + 1; kk++) for (mm = bM; mm <= bM + 1; mm++) {
        if (hash(kk, mm, S + 401) < (kk % 4 === 0 ? TH.plazaBigP : TH.plazaP)) {
          r = TH.plazaR + ((hash(kk, mm, S + 402) * TH.plazaRVar) | 0);
          dxp = gx - ax(kk); if (dxp < 0) dxp = -dxp;
          dzp = gz - cz(mm); if (dzp < 0) dzp = -dzp;
          if (dxp < r && dzp < r && dxp + dzp < r * 1.4) { cH = 0; cD = districtAt(gx, gz); return; }
        }
      }

      // Lots: a whole footprint shares one height and one look, so buildings read as slabs.
      // 6-13 m frontages, never less: a 30 m tower on a 4 m footprint reads as a stick, and the
      // references are all wide masses.
      var lw = TH.lotW + ((hash(bK, bM, S + 307) * TH.lotWVar) | 0);
      var ld = TH.lotD + ((hash(bK, bM, S + 308) * TH.lotDVar) | 0);
      var lx = x0 + (((gx - x0) / lw) | 0) * lw;
      var lz = z0 + (((gz - z0) / ld) | 0) * ld;

      // District sampled at the lot centre, never per cell: one building is never two hues.
      var did;
      if (lx === lmX && lz === lmZ) did = lmD;
      else { did = districtAt(lx + (lw >> 1), lz + (ld >> 1)); lmX = lx; lmZ = lz; lmD = did; }
      var D = DIST[did];

      var h;
      /* Vacancy is the district's own now rather than one number for the whole map, because on the
       * frontier it is not an exception — `range` is 62% empty ground and that emptiness is the
       * entire reason the world has a horizon in it. The city's six districts all carry 0.06,
       * which is exactly the literal that used to be here. */
      var vac = D.vacant !== undefined ? D.vacant : TH.vacant;
      if (hash(lx, lz, S + 504) < vac) {
        h = 0;                                        // vacant lot / interior courtyard / open range
      } else if (D.butte && TH.butteMin !== undefined && hash(lx, lz, S + 507) < D.butte) {
        /* A BUTTE, and the only piece of geology in either world. It takes the whole lot at one
         * height with no setback and no record fields that mean anything to a facade — surf_west
         * reads `h` against the district and paints rock rather than boards. Flat-topped on
         * purpose: the silhouette is what does the work at 90 m, and a rounded top reads as a
         * spoil heap. */
        h = TH.butteMin + hash(lx, lz, S + 508) * TH.butteVar;
      } else if (D.crater && TH.rimMin !== undefined && hash(lx, lz, S + 509) < D.crater) {
        /* A CRATER RIM, and the only place in any world where a lot's height is a function of
         * position INSIDE the lot. Everything else in this file gives a lot one height, because a
         * building is a slab; a crater is a SHAPE, and it has to be, because the thing that reads
         * at character resolution is the RING — a flat floor with a raised lip round it, seen
         * edge-on from a metre seven off the ground.
         *
         * The floor is height 0, which is deliberate twice over: it is walkable, so the route can
         * cross a crater instead of being fenced out of one, and it costs the ray marcher nothing
         * until the ray actually reaches the rim.
         *
         * A sine profile rather than a step, for the same reason the frontier's rock strata are
         * not ruled lines: a step reads as masonry. */
        var ccx = lx + lw * 0.5, ccz = lz + ld * 0.5;
        var crr = (lw < ld ? lw : ld) * 0.5;
        var cdx = gx + 0.5 - ccx, cdz = gz + 0.5 - ccz;
        var cq = Math.sqrt(cdx * cdx + cdz * cdz) / crr;   // 0 at the centre, 1 at the rim
        if (cq > 1 || cq < 0.68) h = 0;
        else h = (TH.rimMin + hash(lx, lz, S + 510) * TH.rimVar) *
                 Math.sin(((cq - 0.68) / 0.32) * Math.PI);
      } else {
        t = hash(lx, lz, S + 501);
        h = D.hMin + t * t * (D.hMax - D.hMin);       // squared: most blocks modest, a few tall
        if (hash(lx, lz, S + 502) < D.landmark) h = TH.lmMin + hash(lx, lz, S + 503) * TH.lmVar;
        if (lw >= 4 && ld >= 4 && hash(lx, lz, S + 505) < TH.setbackP) {
          var ix = gx - lx, iz = gz - lz;
          var edge = (ix === 0 || iz === 0 || ix === lw - 1 || iz === ld - 1);
          if (TH.setbackMode === 'falsefront') {
            /* THE FALSE FRONT, and it is the city's setback turned inside out. A frontier
             * storefront is a shed with a flat board wall carried a metre and a half above its own
             * roofline so the building looks bigger from the street than it is — the defining
             * silhouette of the whole setting, and it is one comparison away from the podium rule
             * the city already had. The OUTER ring keeps the lot's height and the interior drops,
             * so every roofline in town steps DOWN away from the street instead of up. */
            if (!edge) {
              var drop = 1.1 + hash(lx, lz, S + 506) * 1.7;
              h -= drop; if (h < 2.4) h = 2.4;
            }
          } else if (TH.setbackMode === 'podium' && edge) {
            // Setback: the lot's outer ring drops to a podium, which is what gives the rooftop
            // silhouette its steps instead of one flat parapet per block.
            var pod = TH.podMin + hash(lx, lz, S + 506) * TH.podVar;
            if (pod < h) h = pod;
          }
        }
      }
      cH = h; cD = did; cLX = lx; cLZ = lz;
    }

    /* ---- per-cell record ------------------------------------------------ */
    function signHue(lx, lz, D) {
      var r = hash(lx, lz, S + 701);
      /* NO AZURE AND NO VIOLET OUT HERE, and that is the whole discipline of the frontier palette
       * in one function. Both of those swatches read as EMITTED light — they are the screen and
       * the tube, and the city earns them because it is lit by screens and tubes. A painted board
       * is lit by the sun or by a lamp behind it, so the frontier's signs live in the warm half of
       * the palette and the only cool thing in the frame is shadow. Put one azure sign on a
       * timber front and the whole world stops being a place and starts being a filter. */
      if (TH.signPalette === 'none') return P.white;      // no signs are rolled at all; see DIST_MOON
      if (TH.signPalette === 'painted') {
        if (r < 0.30) return P.warm;
        if (r < 0.58) return P.amber;
        if (r < 0.76) return P.white;
        if (r < 0.90) return P.ember;
        return P.red;
      }
      // Signage obeys the same two-pillar discipline as everything else; violet stays a garnish,
      // and the arcade strip is the one place it is allowed to lead.
      if (D.accent === P.violet) return r < 0.42 ? P.violet : (r < 0.74 ? P.azure : P.amber);
      if (r < 0.34) return P.amber;
      if (r < 0.64) return P.azure;
      if (r < 0.78) return D.hue;
      if (r < 0.86) return P.ember;
      if (r < 0.93) return P.spring;
      return P.violet;
    }

    function makeRec(gx, gz, h, did, lx, lz) {
      var D = DIST[did];
      var rock = !!(D.butte && TH.rockStyle !== undefined && hash(lx, lz, S + 507) < D.butte);
      var style = rock ? TH.rockStyle : D.styles[(hash(lx, lz, S + 601) * D.styles.length) | 0];
      /* THE STYLE INDEX IS WORLD-WIDE AND THE GLYPH TABLE IS PER-THEME, which is why this
       * subtraction exists. `style` travels on the record and out to the painters, and a reader who
       * sees 8 should be able to find row 8 in one table rather than having to know which world's
       * table it belongs to — the frontier's rock is 6, the Moon's regolith is 7 and its rock is 8,
       * and none of those numbers repeats. The theme's own glyph table is short and starts at
       * `styleBase`, so the lookup takes the offset off again. Without it the Moon indexed row 7 of
       * a two-row table and every cell record came back with an undefined glyph. */
      var g = STY[style - (TH.styleBase | 0)] || STY[0];
      var lit = rock ? 0 : clamp(D.lit * (0.5 + hash(lx, lz, S + 602) * 1.3), 0.02, 0.5);

      var sign = null;
      if (!rock && D.signP > 0 && TH.signShape !== 'none' && hash(lx, lz, S + 603) < D.signP) {
        if (TH.signShape === 'board') {
          /* A PAINTED BOARD, not a blade sign, and the two differ in every dimension. The city's
           * sign is TALL and NARROW and hung out over the street so it is legible down the canyon;
           * a frontier sign is WIDE and SHORT and nailed flat across the false front, because the
           * front is a flat board wall that exists to be written on and there is no canyon to be
           * legible down. The one vertical form out here is the hanging shingle over a doorway,
           * which is small and rare.
           *
           * It sits high: `y` is measured up from the false front's foot, so the board lands in the
           * top third of the building where the storey below can still be a lit window. */
          var vertW = hash(lx, lz, S + 604) < 0.14;
          /* 1.15-1.95 m tall, and the number is set by signPixel's reveal rather than by what a
           * shop board measures. That function keeps a fixed 22 cm dark margin all the way round —
           * right for a city blade sign five metres tall — so a 70 cm board, which is what a real
           * one is, came out with a 26 cm strip of lit paint down the middle and printed as a
           * dashed line. The box is drawn oversize so the LIT part of it is board-sized. */
          var shW = vertW ? 1.4 + hash(lx, lz, S + 605) * 1.0 : 1.00 + hash(lx, lz, S + 606) * 0.7;
          var roomW = h - shW - 2.6; if (roomW < 0.4) roomW = 0.4;
          sign = {
            y: vertW ? 2.3 + hash(lx, lz, S + 607) * 0.5 : 2.6 + hash(lx, lz, S + 607) * roomW,
            h: shW,
            w: vertW ? 0.9 : 2.4 + hash(lx, lz, S + 608) * 2.2,
            hue: signHue(lx, lz, D),
            glyph: SIGNS[(hash(lx, lz, S + 609) * SIGNS.length) | 0],
            vertical: vertW,
            board: 1,
            seed: hash(lx, lz, S + 610)
          };
        } else {
          var vert = hash(lx, lz, S + 604) < 0.45 && h > 16;
          var sh = vert ? 5 + hash(lx, lz, S + 605) * 7 : 2 + hash(lx, lz, S + 606) * 2.5;
          var room = h - sh - 4; if (room < 1) room = 1;
          sign = {
            y: 3 + hash(lx, lz, S + 607) * room,       // metres up the facade to the sign's foot
            h: sh,
            w: vert ? 1 : 2 + ((hash(lx, lz, S + 608) * 3) | 0),
            hue: signHue(lx, lz, D),
            glyph: SIGNS[(hash(lx, lz, S + 609) * SIGNS.length) | 0],
            vertical: vert,
            seed: hash(lx, lz, S + 610)
          };
        }
      }

      var cr = hash(lx, lz, S + 611);
      var tall = h > TH.crownTall;
      return {
        district: D.name, did: did, style: style, rock: rock,
        hue: rock ? D.hue : (hash(lx, lz, S + 615) < D.mixP ? D.hue : D.mix), accent: D.accent,
        glyph: g[0], dim: g[1], alt: g[2],
        dimLum: 22 + ((hash(lx, lz, S + 612) * 20) | 0),  // suggested brightness for the fill glyph
        litRate: lit, sign: sign,
        h: h, landmark: tall,
        /* 0 none 1 mast 2 tank 3 beacon in the city; 0 none 1 chimney 2 water tank 3 steeple on the
         * frontier. Same field, same three shapes at the same three rates — what differs is which
         * element reads it (structure.js against west_roof.js), and a rock never wears one. */
        crown: rock ? 0 : (tall ? 3 : (cr < 0.14 ? 1 : (cr < 0.24 ? 2 : 0))),
        lotX: lx, lotZ: lz,
        seed: hash(lx, lz, S + 613),      // stable per building — hash this for per-facade variety
        face: hash(gx, gz, S + 614)       // stable per cell — hash this for per-column variety
      };
    }

    /* ---- chunk cache ---------------------------------------------------- */
    var rows = new Map();                  // cz -> Map(cx -> chunk); numeric keys, no string alloc
    // CAP has to comfortably exceed one frame's working set or the FIFO turns into a thrash and
    // every sample pays a rebuild — 2048 chunks is a 720 m square, far past T_FAR.
    var order = [], CAP = 2048;
    var mcx = 0x7fffffff, mcz = 0x7fffffff, mch = null;   // last-chunk memo: rays march coherently

    // Only height and district are stored; the lot anchor is recomputed on the first cell() for
    // that cell and then lives in the cached record, which keeps a chunk down to 1.25 KB.
    function buildChunk(cx, cz2) {
      var h = new Float32Array(256), d = new Uint8Array(256);
      var bx = cx * CH, bz = cz2 * CH, i = 0, jz, jx;
      for (jz = 0; jz < CH; jz++) for (jx = 0; jx < CH; jx++, i++) {
        computeCell(bx + jx, bz + jz);
        h[i] = cH; d[i] = cD;
      }
      return { cx: cx, cz: cz2, h: h, d: d, recs: null };
    }

    function evict() {
      // FIFO by quarters. A frame touches a few hundred chunks at most, far under CAP, so this
      // can never drop something that is currently on screen.
      var n = CAP >> 2, i, c, row;
      for (i = 0; i < n; i++) {
        c = order[i]; row = rows.get(c.cz);
        if (row) { row.delete(c.cx); if (row.size === 0) rows.delete(c.cz); }
      }
      order = order.slice(n);
      mch = null; mcx = 0x7fffffff; mcz = 0x7fffffff;
    }

    function chunkAt(cx, cz2) {
      if (cx === mcx && cz2 === mcz) return mch;
      var row = rows.get(cz2), ck;
      if (row) {
        ck = row.get(cx);
        if (ck) { mcx = cx; mcz = cz2; mch = ck; return ck; }
      } else { row = new Map(); rows.set(cz2, row); }
      ck = buildChunk(cx, cz2);
      row.set(cx, ck);
      order.push(ck);
      if (order.length > CAP) evict();
      mcx = cx; mcz = cz2; mch = ck;
      return ck;
    }

    // Floor, not |0: the marcher hands us fractional world coords and |0 truncates the wrong way
    // for negative x, which would smear a one-cell seam across the whole left half of the city.
    function height(gx, gz) {
      gx = Math.floor(gx); gz = Math.floor(gz);
      var c = chunkAt(gx >> 4, gz >> 4);
      return c.h[((gz & 15) << 4) | (gx & 15)];
    }

    function cell(gx, gz) {
      gx = Math.floor(gx); gz = Math.floor(gz);
      var c = chunkAt(gx >> 4, gz >> 4), i = ((gz & 15) << 4) | (gx & 15);
      if (c.h[i] <= 0) return null;                   // street, alley, plaza, courtyard
      var recs = c.recs;
      if (!recs) { recs = c.recs = new Array(256); }
      var r = recs[i];
      // Records are cached, not rebuilt: cell() is hit thousands of times per frame and the
      // renderer is allowed to hold on to one across a column march.
      if (r === undefined || r === null) {
        computeCell(gx, gz);                          // only to recover this cell's lot anchor
        r = recs[i] = makeRec(gx, gz, c.h[i], c.d[i], cLX, cLZ);
      }
      return r;
    }

    function districtOf(gx, gz) {
      gx = Math.floor(gx); gz = Math.floor(gz);
      var c = chunkAt(gx >> 4, gz >> 4);
      return c.d[((gz & 15) << 4) | (gx & 15)];
    }

    /* ---- the walk -------------------------------------------------------
       The route is a polyline of street centrelines, extended on demand and indexed by arc
       length, so camera(t) stays a pure function of t: scrubbing to frame 0 gives frame 0. */
    var RX = [], RZ = [], RS = [], RK = 0, RM = 0;

    function pushPt(x, z) {
      var n = RX.length;
      if (n) {
        var dx = x - RX[n - 1], dz = z - RZ[n - 1];
        RS.push(RS[n - 1] + Math.sqrt(dx * dx + dz * dz));
      } else RS.push(0);
      RX.push(x); RZ.push(z);
    }

    function routeStep() {
      var k = RK, m = RM;
      pushPt(ax(k) + 0.5, cz(m) + 0.5);
      // A turn only happens where both streets are wide enough that the smoothed corner arc
      // still clears the corner building. Narrow crossings are always walked straight through.
      // Was 0.32 with cw>=2 on both, which passed ~13% of crossings: at one crossing per ~16 s
      // the expected first corner was ~120 s, and seeds 3, 7 and 42 walked straight for over 90 s.
      // An ambient piece cannot go two minutes without a large-scale event.
      if (hash(k, m, S + 41) < 0.5 && aw(k) >= 2 && (cw(m) >= 2 || aw(k) >= 4)) {
        var dir = hash(k, m, S + 42) < 0.5 ? -1 : 1;
        if (aw(k + dir) >= 2) { pushPt(ax(k + dir) + 0.5, cz(m) + 0.5); RK = k + dir; }
      }
      RM = m + 1;
    }

    function ensureRoute(sMax) {
      while (RS[RS.length - 1] < sMax) routeStep();
    }

    var _pa = { x: 0, z: 0 }, _pb = { x: 0, z: 0 }, _pc = { x: 0, z: 0 }, _pr = { x: 0, z: 0 };

    function posAt(s, o) {
      var n = RS.length;
      if (s <= RS[0]) {                                 // before the start: extrapolate straight
        var f0 = s - RS[0];
        o.x = RX[0]; o.z = RZ[0] + f0;                  // the first leg always runs +z
        return;
      }
      var lo = 0, hi = n - 1, mid;
      while (lo + 1 < hi) { mid = (lo + hi) >> 1; if (RS[mid] <= s) lo = mid; else hi = mid; }
      var seg = RS[hi] - RS[lo], f = seg > 1e-6 ? (s - RS[lo]) / seg : 0;
      o.x = RX[lo] + (RX[hi] - RX[lo]) * f;
      o.z = RZ[lo] + (RZ[hi] - RZ[lo]) * f;
    }

    // Weighted taps either side of s. This rounds every corner into an arc for free, and the
    // window is short enough that the inward cut stays under a half cell on a 5-wide street.
    // Nine taps on a Hann window over +/-2 m instead of five on a box over +/-1.5 m. posAt is
    // piecewise LINEAR between route knots, so a box window leaves a hard break in the second
    // derivative at every knot; sampled at 60 Hz the yaw rate stepped -29.6 -> ramp -> -36.7 ->
    // ramp -> -47.8 deg/s with the breaks exactly 0.75 m apart. A tapered window sends those
    // breaks to zero weight, and it stays stateless so scrubbing to any frame is still exact.
    var OFF = [-2.0, -1.5, -1.0, -0.5, 0, 0.5, 1.0, 1.5, 2.0],
        WT  = [0.146, 0.5, 0.854, 1, 1, 1, 0.854, 0.5, 0.146], WTS = 6.0;
    function smoothPos(s, o) {
      var sx = 0, sz = 0, i;
      for (i = 0; i < 9; i++) { posAt(s + OFF[i], _pr); sx += _pr.x * WT[i]; sz += _pr.z * WT[i]; }
      o.x = sx / WTS; o.z = sz / WTS;
    }

    /* Where on the route a free-walking viewer is standing. This is what lets the autopilot be
     * RESUMED rather than restarted: a player who has wandered up an alley and let go of the keys
     * is handed back to the walk at the arc length nearest to where they are, so the camera eases
     * a metre or two sideways instead of teleporting to wherever the route clock happened to
     * reach while nobody was driving. Clamped per segment, so a point beside the middle of a leg
     * projects onto that leg rather than onto its nearer endpoint. */
    function nearestRouteS(x, z) {
      var best = 0, bd = Infinity;
      for (var i = 0; i + 1 < RX.length; i++) {
        var x0 = RX[i], z0 = RZ[i], bx = RX[i + 1] - x0, bz = RZ[i + 1] - z0;
        var L2 = bx * bx + bz * bz;
        if (L2 < 1e-9) continue;
        var u = ((x - x0) * bx + (z - z0) * bz) / L2;
        if (u < 0) u = 0; else if (u > 1) u = 1;
        var dx = x - (x0 + bx * u), dz = z - (z0 + bz * u), d = dx * dx + dz * dz;
        if (d < bd) { bd = d; best = RS[i] + Math.sqrt(L2) * u; }
      }
      return { s: best, d: Math.sqrt(bd) };
    }

    var SPEED = 1.6;                                    // slow walk, metres per second

    function camera(cam, city, t) {
      var s = SPEED * t;
      ensureRoute(s + 40);

      smoothPos(s, _pa);
      smoothPos(s + 1.2, _pb);   // baseline widened with the window; a short baseline re-sharpens
      smoothPos(s - 1.2, _pc);   // exactly the corners the window just rounded

      var dx = _pb.x - _pc.x, dz = _pb.z - _pc.z;
      var dl = Math.sqrt(dx * dx + dz * dz) || 1;
      dx /= dl; dz /= dl;

      var damp = C.reducedMotion ? 0.15 : 1;
      // Sway is driven by distance walked, not wall-clock, so it survives scrubbing intact.
      // The three salts below used to be S+301/302/303, and vnoise goes through hash1, which
      // cannot take the coordinate-spreading `hash` above -- so these are the one place the
      // salt-step problem has to be solved by choosing the salts far apart instead. Adjacent
      // salts correlated at -0.27, which meant the lateral sway, the yaw wobble and the eye bob
      // were substantially the SAME noise: the head leaned left exactly as it turned left and
      // dipped, three degrees of freedom moving as one and reading as a single lurch rather than
      // as a gait. Spread this way they measure 0.005, i.e. independent.
      var lat = (vnoise(s * 0.09, S + 0x0000012D) - 0.5) * 0.9 * damp;
      var x = _pa.x + dz * lat, z = _pa.z - dx * lat;

      // Last-resort guard. The centreline is on street by construction and the corner arc is
      // short, but a wide sway on a narrow leg must never end up inside a wall.
      if (height(x, z) > 0) {
        posAt(s, _pr);
        for (var i = 1; i <= 4; i++) {
          var f = i / 4;
          x = _pa.x + dz * lat * (1 - f) + (_pr.x - _pa.x) * f;
          z = _pa.z - dx * lat * (1 - f) + (_pr.z - _pa.z) * f;
          if (height(x, z) <= 0) break;
        }
        if (height(x, z) > 0) { x = _pr.x; z = _pr.z; }
      }

      cam.x = x; cam.z = z;
      // yaw 0 faces +z, matching the harness default of a camera walking +z with yaw 0.
      cam.yaw = Math.atan2(dx, dz)
              + ((vnoise(s * 0.13, S + 0x51ED2701) - 0.5) * 0.10 + Math.sin(s * 0.41) * 0.02) * damp;
      cam.eyeY = 1.66 + (Math.sin(s * 3.1) * 0.05 + (vnoise(s * 0.7, S + 0xA3C59AC3 | 0) - 0.5) * 0.04) * damp;
      return cam;
    }

    /* ---- where the walk begins ------------------------------------------
     * The opening ten seconds are the only ten seconds every viewer sees, and they used to be
     * the most OPEN view the piece ever renders. The route was bootstrapped at
     *     pushPt(ax(0) + 0.5, cz(0) + 0.5 - 18)
     * which is not a neutral choice, it is the worst one available, for three compounding
     * reasons. Avenue 0 satisfies k % 4 === 0, so aw(0) is 6 and the walk always started on the
     * WIDEST street class in the city, 13 m wall to wall. The 18 m offset is walked off in
     * 18/1.6 = 11.25 s, so at t = 10 s -- the canonical first look -- the camera stands two
     * metres short of the cross street, i.e. inside the mouth of an intersection. And plazas roll
     * at 0.26 rather than 0.13 on a boulevard corner, so those corners are twice as likely to be
     * eaten as well. Measured through tools/headless.cjs over 32 seeds (1000 + 7k, k = 0..31) at
     * 400x100 -- an arithmetic list, not the four seeds this project keeps re-fitting on -- frame
     * 600 printed facade 54.0%
     * / floor 25.7% of the frame against 75.5 / 11.5 at frame 3000 and 70.0 / 15.3 at 18000, and
     * the spread at frame 600 was 46.9-60.8: not a few unlucky seeds, EVERY seed opening in a gap,
     * and 31 of the 32 under 60% facade. Scored as enclosure (below), the old fixed start ranked
     * 157th, 172nd, 157th, 191st, 146th and 103rd of 192 candidates on the first six of those
     * seeds -- bottom quartile on five of six, and next to last on one.
     *
     * So the start is searched instead of assumed. Candidates are the first 8 avenues x first 8
     * cross streets x three approach distances, scored by how enclosed the first 24 m of the walk
     * actually is, and the search is a pure function of the seed: every input is hash-derived, no
     * rng is drawn, and the city is not re-rolled -- chooseStart only READS height(), so it warms
     * the chunk cache and decides nothing.
     *
     * The score is deliberately NOT maximised. Taking the argmax would hand every seed the same
     * answer in kind -- the narrowest street with the tallest walls -- and an opening that is
     * identical on every seed is its own failure. Instead candidates are visited in a
     * seed-dependent order and the FIRST one clearing START_T is taken, so the threshold
     * guarantees a canyon while the order supplies the variety. The argmax survives only as the
     * fallback for a seed where nothing clears the bar.
     *
     * What it costs: 3.7 candidates scored on the average seed and 16 on the worst of 128, never
     * anywhere near SCAN, because acceptance comes early. That is make() at 4.06 ms against 0.01 ms
     * before, paid once when the page loads or the seed in the hash changes and never again --
     * camera(), height() and cell() are untouched, and the frame budget does not see this. It
     * leaves the chunk cache warm rather than thrashed: 21 chunks built on the average seed and 85
     * on the worst, against a CAP of 2048, so nothing the first frame wants has been evicted. */
    var START_BACKS = [14, 20, 26];   // metres of straight canyon before the first cross street
    /* An ANGLE, not a height, because the angle is what the frame shows: a 20 m wall 4 m away
     * fills the view and the same wall across a plaza does not. 1.7 is the eye the camera breathes
     * around (see cam.eyeY below), so this is literally how far up the viewer has to look. 14 m is
     * the search reach -- past that the wall is on the far side of any street this lattice builds
     * and is enclosing nothing. Zero means open sky on that side, the case the score punishes. */
    function sideAngle(x, z, dx) {
      for (var d = 1; d <= 14; d += 0.5) {
        var h = height(x + dx * d, z);
        if (h > 0) return Math.atan2(h - 1.7, d);
      }
      return 0;
    }
    /* min(left, right), never the mean: a street walled on one side and open on the other is a
     * frontage, not a canyon, and averaging the two sides would score it the same as a corridor
     * half as tall on both. The run is sampled straight THROUGH where the cross street lands,
     * which is what makes the approach distance matter -- an intersection sitting inside the
     * opening 24 m scores itself down, and that alone is what would have rejected the old start.
     * These are the same world coordinates the route is built from a dozen lines below, half-cell
     * offset included, so the score is of the walk that actually happens and not of a near miss. */
    function startScore(k, m, back) {
      var x = ax(k) + 0.5, z0 = cz(m) + 0.5 - back, acc = 0, n = 0, s, L, R;
      for (s = 0; s <= 24; s += 1.5) {
        L = sideAngle(x, z0 + s, -1); R = sideAngle(x, z0 + s, 1);
        acc += (L < R ? L : R); n++;
      }
      return acc / n;
    }
    /* 1.00 rad of both-sides elevation is a wall whose parapet is at 57 degrees, and it sits above
     * the enclosure the walk averages over its whole length (0.85-0.99 measured on the same 32
     * seeds), which is the point: the opening should be at least as enclosed as the piece it is
     * introducing. About a quarter of the 192 candidates clear it on a typical seed.
     *
     * THIS IS THE KNOB, and raising it is not free. Swept over 128 seeds (500 + 11k), counting the
     * candidates scored, the seeds where nothing clears the bar and the search degenerates to
     * argmax, and the width class of the avenue it lands on:
     *     1.00 -> 3.8 scored, 0/128 fall back, avenues 82 narrow / 38 mid / 8 boulevard
     *     1.15 -> 16.8 scored, 3/128 fall back, 101 / 24 / 3
     *     1.22 -> 39.1 scored, 43/128 fall back, 102 / 25 / 1
     *     1.30 -> 56.3 scored, 100/128 fall back, 103 / 25 / 0
     * Past about 1.15 the threshold stops being a threshold: most seeds miss it, the fallback
     * argmax takes over, and the search hands every seed the same narrow street -- the flattening
     * this whole approach exists to avoid. What the extra strictness buys is the low tail of the
     * opening frame, over the 32-seed sweep at frame 600: 1.00 gives facade min 48.0 with 5 of 32
     * seeds under 60%, 1.15 gives 51.9 and 3 of 32, 1.22 gives 58.1 and 1 of 32. Two seeds of
     * thirty-two is not worth trading a third of the city's boulevards for. */
    /* THEMED, because 1.00 rad asks for a parapet at 57 degrees on BOTH sides within 14 m and
     * nothing on the Moon clears that. Left at the city's value, every lunar seed would scan all
     * 64 candidates — some 59,000 height() calls and a few hundred chunk builds on page load — and
     * then fall back to the argmax anyway, which is exactly the outcome this search exists to
     * avoid. The Moon asks for 0.10 rad instead: a 1.4 m boulder at 14 m, or a crater rim at 20,
     * which is enough that the opening frame has something in the near field. */
    var START_T = TH.startT !== undefined ? TH.startT : 1.00;
    var _start = { k: 0, m: 0, back: 18 };
    function chooseStart(o) {
      var N = 8 * 8 * START_BACKS.length, j, k, m, b, sc;
      // Visiting order is i -> i + st over Z_N, which hits DISTINCT candidates as long as st is
      // coprime with N = 192 = 2^6 * 3: force it odd, then off a multiple of three. A shuffled
      // array would allocate and sort for no gain, because the search almost always accepts within
      // its first few candidates. SCAN caps the fallback at a third of the cycle so a seed where
      // nothing clears the bar cannot turn make() into a 200 ms stall on page load; best-of-64 and
      // best-of-192 are the same answer in practice, and 128 seeds never needed more than 16.
      var SCAN = 64;
      var st = 5 + ((hash(0, 0, S + 901) * 88) | 0) * 2;
      if (st % 3 === 0) st += 2;
      var i = ((hash(1, 0, S + 902) * N) | 0) % N;
      var bestS = -1;
      o.k = 0; o.m = 0; o.back = START_BACKS[0];
      for (j = 0; j < SCAN; j++) {
        k = i & 7; m = (i >> 3) & 7; b = START_BACKS[(i / 64) | 0];
        sc = startScore(k, m, b);
        if (sc > bestS) { bestS = sc; o.k = k; o.m = m; o.back = b; }
        if (sc >= START_T) break;
        i = (i + st) % N;
      }
    }

    /* ---- boot the route so startX/startZ land on street ------------------ */
    chooseStart(_start);
    RK = _start.k; RM = _start.m;
    pushPt(ax(RK) + 0.5, cz(RM) + 0.5 - _start.back);
    ensureRoute(60);

    return {
      seed: S,
      startX: RX[0], startZ: RZ[0],
      height: height, cell: cell, camera: camera,
      nearestRouteS: nearestRouteS, ensureRoute: ensureRoute,
      districtAt: districtOf, DISTRICTS: DIST,
      isStreet: function (gx, gz) { return height(gx, gz) <= 0; },
      // Exposed for surfaces/elements that want to reason about the corridor itself.
      aveX: ax, aveW: aw, crossZ: cz, crossW: cw,
      AVE: AVE, CROSS: CROSS, SPEED: SPEED,
      /* WHICH WORLD THIS MAP IS, carried on the map rather than read off CC.World. An element that
       * asks the registry is asking what the viewer last pressed; an element that asks the city is
       * asking what it is actually standing in, and between the keypress and the rebuild those are
       * two different answers. */
      world: TH.id
    };
  }

  var City = { make: make };
  if (C) C.City = City;
  else if (typeof globalThis !== 'undefined' && globalThis.CC) globalThis.CC.City = City;
  if (typeof module !== 'undefined') module.exports = City;
})();
