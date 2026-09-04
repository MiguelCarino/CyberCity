/* CyberCity EDO street furniture — the objects that make the fourth world a place. Layers 16-22.
 *
 * WHAT THIS FILE IS FOR, and it is the same argument west_town.js and moon_craft.js make about
 * their own worlds. src/surf_japan.js paints every wall and every square metre of ground, and when
 * it is finished the street is correct and empty: timber, plaster, tile, wet earth, and the light
 * from behind the paper. What it cannot paint is anything that stands OFF a surface, because the
 * texture layer is handed (u, v) on a plane and has no camera, no depth and no world. Everything
 * this setting is actually remembered by is exactly that kind of object —
 *
 *   THE LANTERN.   A chochin hung under the eave, at 2.1 m, half a metre proud of the wall. It is
 *     the source of surf_japan.js's whole lamp-wash lighting model, so drawing the wash without
 *     ever drawing the lamp would be a world lit by nothing visible. It is also where this world's
 *     highlights come from: measured before this file existed, a night frame censused 0.00% in the
 *     print's hot tail against a 3.5-5% target, because the brightest thing in it was a paper
 *     screen seen through fog. A lantern is the same light with nothing in front of it.
 *   THE NOREN.     The split curtain over a shop door. It is the one DARK object in a lit opening
 *     — indigo cloth hung across the brightest cells on the elevation — and a dark shape in front
 *     of a bright one is worth more to a frame at this resolution than any amount of extra light.
 *   THE TORII.     Two posts and two beams, vermilion, straddling the road at a temple. It is the
 *     only thing in this world that crosses the street rather than lining it, and it is the single
 *     most recognisable silhouette the setting has.
 *   THE PETALS.    Something that moves and is not weather. The frontier has one tumbleweed for
 *     this reason and says so; this has a drift of blossom, and it is off in the rain.
 *
 * WHERE THE LIGHT COMES FROM. Every one of these reads SUN_X/SUN_Z off the painter registry
 * through src/proj.js's litFace(), never off CC.Daylight, for the reason surf_moon.js states at
 * length: the ground and the objects standing on it must have got their geometry from the same
 * place. Whether a lantern is BURNING is `CC.Daylight.P.lamp` and nothing else — the same single
 * number surf_japan.js's lamp wash reads, so the light on a wall and the lamp hanging in front of
 * it come up together to the frame. (An earlier cut multiplied that by a night crossfade of its
 * own in both files and put the whole town out an hour before dusk; the director already owns the
 * fade and the hysteresis.) `CC.SurfJapan.night` is read too, but only for things that are not
 * artificial light: how far a torii has gone to silhouette, how bright a stone lantern's own
 * masonry is, how a petal reads against the sky.
 */
(function (CC) {
  'use strict';

  /* One projector per element — see src/proj.js. V and PJ are this element's own basis and
   * scratch; the four helpers are closed over them. */
  var PR = CC.Proj.make(), V = PR.V, PJ = PR.PJ;
  var project = PR.project, emit = PR.emit, column = PR.column, litFace = PR.litFace;

  var P = CC.P, hash2 = CC.hash2, clamp = CC.clamp, vnoise = CC.vnoise;

  var G_PIPE = CC.g('|'), G_DASH = CC.g('-'), G_TICK = CC.g('`'), G_COLON = CC.g(':'),
      G_EQ = CC.g('='), G_8 = CC.g('8'), G_O = CC.g('O'), G_o = CC.g('o');

  /* Bound once per rebuild. `city.world`, never CC.World: between a keypress and the rebuild those
   * are two different answers and this file must agree with the map it is standing on. */
  var CITY = null, BASE = 0, JP = null;
  function boot(city) {
    CITY = (city && city.aveX && city.world === 'japan') ? city : null;
    BASE = CITY ? ((Math.imul(CITY.seed | 0, 40503) >>> 6) & 0x3fffff) : 0;
    JP = null;
  }

  /* Per-frame caches. EVERY ONE OF THESE IS ASSIGNED INSIDE view(), which the contract asks for by
   * name after two frontier files were left holding their declared defaults and silently stopped
   * following the clock. */
  var W_RAIN = 0, W_WIND = 1, W_WET = 1, NIGHT = 1, LAMP = 1, DAYF = 0;
  function view(f, cam, t) {
    PR.view(f, cam, t);
    if (!JP) JP = (CC.SURFACES && CC.World) ? CC.SURFACES[CC.World.id] : null;
    W_RAIN = CC.Weather ? CC.Weather.P.rain : 0;
    W_WIND = CC.Weather ? CC.Weather.rel('wind') : 1;
    W_WET = CC.Weather ? CC.Weather.rel('wet') : 1;
    NIGHT = (JP && JP.night !== undefined) ? JP.night : 1;
    DAYF = (JP && JP.dayFill !== undefined) ? JP.dayFill : 0;
    LAMP = CC.Daylight ? CC.Daylight.P.lamp : 1;
  }

  /* Which street the camera is nearest, in either axis, and the two helpers that turn an
   * (along, cross) pair into world coordinates. Identical in shape to west_range.js's, because the
   * lattice they are indexing is the same lattice. */
  function wxOf(axis, along, cross) { return axis ? along : cross; }
  function wzOf(axis, along, cross) { return axis ? cross : along; }
  function nearIdx(axis) {
    return Math.round((axis ? V.oz : V.ox) / (axis ? CITY.CROSS : CITY.AVE));
  }
  function centreOf(axis, idx) { return axis ? CITY.crossZ(idx) : CITY.aveX(idx); }
  function halfOf(axis, idx) { return axis ? CITY.crossW(idx) : CITY.aveW(idx); }
  /* WHERE THE CAMERA IS ALONG THE STREET, which is the OTHER axis from the one nearIdx reads and
   * is the distinction that had every lantern in this file placed two hundred metres up the wrong
   * road. An avenue is indexed by x and runs along z, so the index comes off V.ox and the walk
   * range comes off V.oz; a cross street is the transpose. west_range.js gets this right and reads
   * `axis ? V.ox : V.oz` — one axis apart from `nearIdx` directly above it, and nothing in either
   * function's name says so, which is why it is named here. */
  function alongOf(axis) { return axis ? V.ox : V.oz; }

  /* WHERE THE WALL ACTUALLY IS, in world metres, on a given side of a given street. city.js's
   * colX() marks cells [c-hw, c+hw] as corridor, and a cell `g` covers world [g, g+1) — so the
   * building face on the +side is the plane x = c + hw + 1 and on the -side it is x = c - hw,
   * which is this one expression. Getting it wrong by a tenth of a metre is not a cosmetic error:
   * an object placed on the far side of that plane is INSIDE the building, and CC.put's depth test
   * removes it silently. Every hanging thing in this file is positioned relative to `faceOf` and
   * probes the heightmap at `faceOf + 0.8*side`, which is the first cell of the block. */
  function faceOf(axis, idx, side) {
    return centreOf(axis, idx) + 0.5 + side * (halfOf(axis, idx) + 0.5);
  }

  /* Is there a building face here, and how tall is it? A lantern hangs off a WALL, so the probe is
   * the cell one step behind the frontage line — and it returns the height, because the eave the
   * lantern hangs under is at the top of it and a lantern nailed above its own roof is worse than
   * no lantern. */
  function wallH(axis, along, cross) {
    return CITY.height(wxOf(axis, along, cross), wzOf(axis, along, cross));
  }

  /* ================================================================================= lanterns ===
   * A chochin every 2.4 m along both frontages of whichever street the camera is on, on the lots
   * that have a shop in them — which is to say wherever the map put a sign, plus a share of the
   * rest. The pitch is the one number here worth arguing about: at 4 m the street reads as
   * occasionally lit and at 1.5 m it reads as a festival. 2.4 is a lantern per shopfront bay and a
   * bit, which is what a photograph of a lit machi street shows.
   *
   * THE SHAPE IS FOUR CELLS AND IT HAS TO BE. A chochin is a vertical ellipse of ribbed paper with
   * a dark cap and base, and at 2.1 m up and 6 m away that is about two cells wide and three tall.
   * So it is drawn as an explicit little sprite rather than through column(): a bright core, a
   * darker rib down each side, and one cell of black at each end. The black ends are what make it
   * an OBJECT — a warm blob with no cap reads as a window.
   *
   * THE FLAME. Every lit thing in this project is gated by the photosensitivity rule — nothing
   * above 2% of full scale between 3 and 20 Hz — and a flame is the obvious way to break it. This
   * one is a single vnoise sampled at 0.55 Hz with a 9% swing, so its whole spectrum sits an octave
   * and a half BELOW the danger band and its amplitude would be legal even inside it. A candle in
   * a paper box is heavily damped by the paper anyway: what you see move is the glow, not the
   * flame, and it moves slowly.
   *
   * THE HALO. Two cells of dim warm either side, in wet weather only. That is not a bloom (the
   * canvas does its own) — it is the air: rain and river mist round a lamp is the reason this
   * world's `steam` never drops below 0.44, and a lamp with no halo in a downpour reads as a hole
   * cut in the frame rather than as a light in it. */
  var LAN_PITCH = 2.4, LAN_Y = 2.12, LAN_OUT = 0.42;

  function drawLanterns(f, axis, idx) {
    var here = alongOf(axis);
    var lo = Math.floor((here - 46) / LAN_PITCH), hi = Math.floor((here + 46) / LAN_PITCH);
    if (hi - lo > 40) hi = lo + 40;
    /* Off by day, and by DAYF rather than by a hard test on the hour: a street that puts every
     * lantern out on one frame is the large-area step the whole project's flicker rule is about.
     * A paper lantern in daylight is still THERE, so it does not vanish — it goes to the pale
     * unlit sand-coloured bag it actually is. */
    /* LAMP alone — see surf_japan.js's lampAt, which had this same bug and the same fix. The
     * director's `lamp` already has the hysteresis; a second night crossfade over the top of it
     * puts the lanterns out an hour before dusk. */
    var lampK = LAMP;

    for (var side = -1; side <= 1; side += 2) {
      var face = faceOf(axis, idx, side);
      var cross = face - side * 0.45;                  // hung half a metre proud of the wall
      var back = face + side * 0.8;                    // one step into the block: the wall itself
      for (var k = lo; k <= hi; k++) {
        var along = k * LAN_PITCH + hash2(k, side, BASE + 0x11) * 0.7;
        var h = wallH(axis, along, back);
        if (h < 2.9) continue;                         // no wall, or too low to hang one under
        var r = hash2(k, side * 7 + (axis ? 3 : 0), BASE + 0x12);
        if (r > 0.52) continue;
        var px = wxOf(axis, along, cross), pz = wzOf(axis, along, cross);
        /* Hung just under the eave, but never higher than the wall it is on. */
        var y = LAN_Y + hash2(k, side, BASE + 0x13) * 0.30;
        if (y > h - 0.9) y = h - 0.9;
        if (y < 1.5) continue;

        if (!project(px, y, pz)) continue;
        var x = Math.floor(PJ.x), yy = Math.floor(PJ.y), d = PJ.d;
        if (x < -3 || x >= V.cols + 3) continue;

        /* Its apparent size, from the same projection the caster uses: a 0.30 m body. */
        var rw = 0.15 * V.colK / d, rh = 0.24 * V.scale / d;

        var flick = CC.reducedMotion ? 1
                  : 0.955 + 0.09 * vnoise(t0 * 0.55 + k * 3.7 + side * 1.9, BASE & 0xffff);
        /* ---- THE AKACHOCHIN, AND IT IS THE BEST THREE LINES IN THIS WORLD ------------------------
         * Three lanterns in ten are papered RED, which is the mark of a place that sells food and
         * drink and is the one piece of saturated colour an Edo street reliably had. It is also,
         * measured, the single best print trade in the tree.
         *
         * WHY `red` AND NOT `ember`, and it is core.js's ladder() rule rather than a taste. ladder()
         * splits the palette on "does it EMIT": sources — amber, azure, warm, ice, jade, rose, gold,
         * red — blend along the sun curve, surfaces blend along the sky curve. An akachochin is a
         * red LAMP (core.js's own gloss on slot 6 is "aerial lamps, stop signals"), so red is the
         * correct half of the table. A piece of dyed CLOTH in the same colour is `ember`, on the
         * other curve — which is why the banners in jp_banner.js use ember and this does not.
         *
         * AND IT IS WRITTEN DIMMER AND PRINTS HOTTER, which is the ladder doing its job rather than
         * the paint lying. Red paper over the same candle is materially dimmer than white, so the
         * luminance is scaled by 0.90 — and core.js gives red a night gain of 0.56 against warm's
         * 0.32, so the red lantern goes in at 198 against 220 and comes out of the print at v 183
         * against v 154. Measured on the seed 42 night frame: 72 of 181 lantern cells repaint, the
         * core and rib cells cross the print's hot line (v 157 -> 185, v 144 -> 173), and the census
         * moves hot 0.38% -> 0.69% and muddy 38.6% -> 38.3%. Those are the first non-`pure` hot
         * cells this world has ever had.
         *
         * THE SHARE IS CAPPED AT 0.30 ON PURPOSE. Each ten points is worth about +0.07 points of hot
         * tail, and red is the only swatch here that can outrank the paper shopfronts the world's
         * whole lighting model is built on. Past about 0.35 the lanterns start to lead the frame.
         * Rendered through topng.py at 0.30 it reads as red lanterns rather than as pink, so the
         * magenta-bloom failure that walked `violet` off hue 288 is not reproduced. */
        var red = hash2(k, side * 11 + (axis ? 1 : 0), BASE + 0x15) < 0.30;
        var warm = (196 + 44 * hash2(k, side, BASE + 0x14)) * (red ? 0.90 : 1);
        var lum = lampK > 0.02 ? warm * lampK * flick : 0;
        var col = lampK > 0.02 ? (red ? P.red : P.warm) : P.sand;
        if (lum < 6) lum = 26 + 60 * DAYF;             // unlit: a pale bag under the eave

        /* The cord and the cap. One cell of nothing above the body is what stops it floating. */
        if (project(px, y + 0.34, pz))
          emit(f, Math.floor(PJ.x), Math.floor(PJ.y), G_DASH, P.timber, 22 + 40 * DAYF, PJ.d);

        if (rw < 0.7) { emit(f, x, yy, G_o, col, lum, d); }
        else {
          var iw = rw < 1.4 ? 1 : 2, ih = rh < 1.2 ? 1 : (rh < 2.4 ? 2 : 3), dx, dy;
          for (dy = -ih; dy <= ih; dy++) for (dx = -iw; dx <= iw; dx++) {
            var uq = dx / (iw + 0.35), vq = dy / (ih + 0.35);
            if (uq * uq + vq * vq > 1.05) continue;
            /* The ribs. A chochin is a spiral of split bamboo under the paper and it prints as
             * horizontal banding, so the glyph alternates by ROW rather than being one fill. */
            var rib = ((dy + 64) & 1) === 0;
            var edge = uq * uq + vq * vq > 0.55;
            emit(f, x + dx, yy + dy, edge ? G_COLON : (rib ? G_EQ : G_8),
                 col, lum * (edge ? 0.52 : (rib ? 0.86 : 1)), d);
          }
          /* Cap and base: black, always, at both ends. */
          emit(f, x, yy - ih - 1, G_DASH, P.shadow, 0, d);
          emit(f, x, yy + ih + 1, G_DASH, P.timber, 30 * (0.4 + DAYF), d);
          /* THE CORE, one cell, and it is the only `pure` in this world. surf_japan.js's header
           * carries the arithmetic: at night the print's hot line is v 170 and `warm` — the swatch
           * a paper lantern is materially made of — tops out at 167, so a town lit entirely by
           * lanterns censused 0.00% in the hot tail with two hundred cells of lantern in the frame.
           * The paper directly over a flame is blown out in every photograph of one ever taken,
           * which is what core.js's "specular hits only, use sparingly" describes, and one cell per
           * near lantern is as sparing as it is possible to be. Gated on the lamp being lit and on
           * the lantern being resolved at all, so a distant one never gets a white pixel in it. */
          if (lampK > 0.4 && rw > 0.7)
            emit(f, x, yy, G_8, P.pure, lum * 0.86, d);
        }

        /* The halo in wet air. Two cells out, dim, and only where the frame is not already full. */
        if (lum > 40 && W_WET > 0.5) {
          var hk = clamp((W_WET - 0.5) * 0.9, 0, 0.5);
          for (var q = -2; q <= 2; q++) {
            if (q === 0) continue;
            /* `col`, not P.warm: the air scatters the lamp's own colour, so a red lantern gets a
             * red halo. Costs nothing — it is the same expression with a shorter name in it. */
            emit(f, x + q, yy, G_TICK, col, lum * hk * 0.16, d + 0.01);
            emit(f, x, yy + q, G_TICK, col, lum * hk * 0.13, d + 0.01);
          }
        }
      }
    }
  }

  /* ==================================================================================== noren ===
   * The split curtain hung across a shop doorway: two or three panels of indigo-dyed cloth from
   * about 1.9 m down to 1.1 m, with gaps you can see the lit interior through.
   *
   * IT IS DRAWN AS A HOLE, NOT AS A THING. The cells are written dark over whatever the wall behind
   * them is — which, at a shopfront, is surf_japan.js's paper panel at the top of the ladder — so
   * what the frame gains is a silhouette of hanging cloth against light. That is the entire object,
   * it costs about twenty cells, and it is the cheapest identity in this file.
   *
   * THE HEM MOVES. A noren hangs free at the bottom and the draught off the street lifts it, so the
   * bottom row is offset by a slow noise per panel. The rate is deliberately under 1 Hz for the
   * same photosensitivity reason the lantern's flame is, and the amplitude is a fraction of a cell
   * — this is a shape moving, not a luminance flashing, which is the distinction the gate cares
   * about. */
  var NOREN_TOP = 1.92, NOREN_BOT = 1.06, NOREN_PITCH = 5.4;

  function drawNoren(f, axis, idx) {
    var here = alongOf(axis);
    var lo = Math.floor((here - 34) / NOREN_PITCH), hi = Math.floor((here + 34) / NOREN_PITCH);
    if (hi - lo > 16) hi = lo + 16;

    for (var side = -1; side <= 1; side += 2) {
      var wall = faceOf(axis, idx, side);
      var face = wall - side * 0.14;                   // the cloth hangs against the frontage
      var back = wall + side * 0.8;
      for (var k = lo; k <= hi; k++) {
        var along = k * NOREN_PITCH + hash2(k, side, BASE + 0x21) * 2.2;
        if (wallH(axis, along, back) < 3.2) continue;
        if (hash2(k, side * 5 + (axis ? 2 : 0), BASE + 0x22) > 0.46) continue;

        /* Three panels over 1.3 m of doorway, each 0.34 m wide with a finger of gap between. */
        var np = 3, w = 0.40;
        for (var pi = 0; pi < np; pi++) {
          var off = (pi - (np - 1) * 0.5) * w;
          var a = along + off;
          var sway = CC.reducedMotion ? 0
                   : vnoise(t0 * 0.7 + k * 2.3 + pi * 0.9, BASE + 0x23) * 0.10 * (0.4 + W_WIND);
          /* A dyed cloth is the darkest thing on a lit frontage and the crest at the top is the
           * one part of it that catches the lamp inside — which is why the top row is drawn a
           * shade up and in `stone` rather than in the cloth's own indigo. */
          column(f, wxOf(axis, a, face), wzOf(axis, a, face),
                 NOREN_BOT + sway, NOREN_TOP, G_PIPE, P.indigo,
                 (26 + 54 * LAMP) + 40 * DAYF, 0);
          if (project(wxOf(axis, a, face), NOREN_TOP + 0.04, wzOf(axis, a, face)))
            emit(f, Math.floor(PJ.x), Math.floor(PJ.y), G_DASH, P.stone,
                 54 + 70 * LAMP + 60 * DAYF, PJ.d);
        }
      }
    }
  }

  /* ==================================================================================== torii ===
   * Two posts, a curved lintel, a straight tie-beam under it, and it straddles the road. Placed at
   * a cross-street mouth in a `temple` quarter and nowhere else, which is both correct and rare —
   * a torii marks an approach, and one on every corner would be wallpaper.
   *
   * THE CURVE IS THE RECOGNITION and it is four extra samples. A straight top beam is a football
   * goal; the kasagi rises toward its ends, and drawing it as a shallow arc sampled along its
   * length is what makes the silhouette read at forty metres in a frame made of characters. It is
   * sampled in WORLD space and projected per sample, exactly as west_range.js's catenary is, so it
   * takes the perspective for free.
   *
   * VERMILION IS SPENT HERE. city.js's district table holds `ember` to one quarter at a mixP of
   * 0.42 precisely so that this object can be the red thing in the frame — and it still gets a
   * lit face and a shaded face off litFace(), because a painted post in flat light is not one
   * flat colour and the whole point of the shape is that it is round. */
  var TORII_H = 4.6;

  function drawTorii(f, axis, idx) {
    var c = centreOf(axis, idx), hw = halfOf(axis, idx);
    /* Where the cross streets cut this one — the mouths are the only places a gate can stand. */
    var oIdx = nearIdx(axis ? 0 : 1);
    for (var m = oIdx - 1; m <= oIdx + 1; m++) {
      var along = centreOf(axis ? 0 : 1, m) + 0.5;
      var px0 = wxOf(axis, along, c + 0.5), pz0 = wzOf(axis, along, c + 0.5);
      var di = CITY.districtAt(px0, pz0);
      var D = CITY.DISTRICTS && CITY.DISTRICTS[di];
      if (!D || D.name !== 'temple') continue;
      if (hash2(m, idx, BASE + 0x31) > 0.40) continue;

      /* The posts stand at the very edge of the carriageway, not beyond it: a torii is a gate
       * across a road, and posts set back into the frontage would both be occluded by the wall and
       * stop the thing straddling anything. */
      var span = hw + 0.35;
      var lit = litFace(axis ? 1 : 0, axis ? 0 : 1);
      var shd = litFace(axis ? -1 : 0, axis ? 0 : -1);
      var base = 96 + 120 * (lit > shd ? lit : shd) * (0.35 + 0.65 * (1 - NIGHT));
      /* At night it is lit by the lanterns on the approach rather than by the sky, so it keeps a
       * floor — a black torii is a torii nobody can see, and this is the object the quarter is
       * for. */
      if (base < 84) base = 84;

      var s;
      for (s = -1; s <= 1; s += 2) {
        var cx = c + 0.5 + s * span;
        column(f, wxOf(axis, along, cx), wzOf(axis, along, cx), 0, TORII_H,
               G_PIPE, P.ember, base, 1);
      }
      /* The nuki — the straight tie-beam, at four fifths height. */
      var i, N = 22;
      for (i = 0; i <= N; i++) {
        var q = i / N, cxx = c + 0.5 + (q * 2 - 1) * span;
        if (project(wxOf(axis, along, cxx), TORII_H * 0.80, wzOf(axis, along, cxx)))
          emit(f, Math.floor(PJ.x), Math.floor(PJ.y), G_DASH, P.ember, base * 0.86, PJ.d);
        /* The kasagi: the same sweep 0.55 m higher, rising 0.42 m toward each end. */
        var ky = TORII_H + 0.42 * (2 * q - 1) * (2 * q - 1);
        if (project(wxOf(axis, along, cxx), ky, wzOf(axis, along, cxx)))
          emit(f, Math.floor(PJ.x), Math.floor(PJ.y), G_EQ, P.ember, base, PJ.d);
      }
    }
  }

  /* ============================================================================ stone lantern ===
   * A toro standing against the wall on a temple approach or outside a compound: a squat stone
   * pedestal, a fire box with a small warm eye in it, and a wide cap. It is the counterpart to the
   * chochin — the same light in stone rather than paper, standing on the ground rather than hung —
   * and it is what gives the quiet quarters something of their own after dark.
   *
   * IT IS PLACED ALONG THE STREET AND NOT ON A LATTICE, and that is the third and last version of
   * this placement. The first two scattered candidates on a 2D lattice the way west_range.js
   * scatters brush, which is right for open country and wrong here for two compounding reasons:
   * this world's open ground is mostly INSIDE a block (so the frontage occludes it), and the thin
   * strip where it is not is a small fraction of a lattice cell's area (so almost nothing lands in
   * it). Walking the street the way the lanterns above do puts the object exactly where it can be
   * seen, at a rate that is a pitch rather than an area fraction, for less code. */
  var TORO_PITCH = 7.4;
  var ISH_OK = { garden: 1, temple: 1, kura: 1, castle: 1 };

  function drawToro(f, axis, idx) {
    var here = alongOf(axis);
    var lo = Math.floor((here - 40) / TORO_PITCH), hi = Math.floor((here + 40) / TORO_PITCH);
    if (hi - lo > 14) hi = lo + 14;
    var lampK = LAMP;

    for (var side = -1; side <= 1; side += 2) {
      var face = faceOf(axis, idx, side);
      var cross = face - side * 0.85;                 // against the wall, inside the carriageway
      var back = face + side * 0.8;
      for (var k = lo; k <= hi; k++) {
        var along = k * TORO_PITCH + hash2(k, side, BASE + 0x41) * 2.6;
        if (hash2(k, side * 3 + (axis ? 5 : 0), BASE + 0x42) > 0.40) continue;
        var px = wxOf(axis, along, cross), pz = wzOf(axis, along, cross);
        var D = CITY.DISTRICTS && CITY.DISTRICTS[CITY.districtAt(wxOf(axis, along, back),
                                                                 wzOf(axis, along, back))];
        if (!D || ISH_OK[D.name] !== 1) continue;

        var sun = litFace(0, 1);
        var scol = sun > 0.55 ? P.stone : P.indigo;
        var slum = (26 + 132 * sun) * (0.30 + 0.70 * (1 - NIGHT)) + 20;
        column(f, px, pz, 0, 0.70, G_O, scol, slum, 0);            // the pedestal
        column(f, px, pz, 1.04, 1.32, G_EQ, scol, slum * 1.15, 1);  // the cap
        /* The fire box, and the eye in it. One cell, warm, and it is the whole reason the object is
         * here — a stone lantern that is not lit is a bollard. */
        if (project(px, 0.90, pz))
          emit(f, Math.floor(PJ.x), Math.floor(PJ.y), lampK > 0.1 ? G_o : G_COLON,
               lampK > 0.1 ? P.warm : scol,
               lampK > 0.1 ? (146 + 64 * lampK) * lampK : slum * 0.7, PJ.d);
      }
    }
  }

  /* =================================================================================== bridge ===
   * A taiko-bashi, the drum bridge, where an avenue crosses the canal. Hiroshige drew this object
   * more than any other in the setting and it is the single most recognisable silhouette it has.
   *
   * IT IS ALSO NOT DECORATION. city.js's river branch floods the avenue — deliberately, because a
   * coping across the road would be a wall the route walks into — so without this element the walk
   * crosses nine metres of open water on nothing at all. The deck is what the walk is standing on.
   *
   * THE ARCH IS THE WHOLE RECOGNITION and it is four extra samples, exactly as the torii's kasagi
   * is above. A flat deck with rails is a jetty; a deck that RISES to a crown and comes down again
   * is a drum bridge, and at character resolution the rise is the only thing carrying it. The rail
   * runs 1.25 m at the abutments to 1.80 m at the crown — ABOVE the 1.66 m eye, which is what puts
   * it on the silhouette against the far bank instead of lying flat on the water.
   *
   * THE DECK IS DRAWN BEFORE THE RAIL AND AT A SLIGHTLY NEARER DEPTH, because CC.put's depth test
   * is strict and a deck plank and a rail post that land on one cell at one distance is the
   * contention that cost the banners their flicker margin.
   *
   * NOTHING HERE MOVES. There is no t term anywhere in this element: a bridge is a static object
   * and the only reason its cells ever change is the camera walking, which no gate measures and
   * which is bounded by the walk's own 1.6 m/s. That is the cheapest possible photosensitivity
   * story and it is worth having on the one object that spans the whole frame. */
  var BR_SPAN = 5.6, BR_RISE = 0.55, BR_N = 30;

  function drawBridge(f, axis, idx) {
    if (!CITY.rivD) return;
    var c = centreOf(axis, idx), hw = halfOf(axis, idx);
    var here = alongOf(axis);
    /* Where this street crosses the channel: march the channel's own distance function along the
     * street from the camera and take the zero. Cheaper and more robust than inverting the meander,
     * and it lands on the right crossing when several are in range. */
    var cx0 = c + 0.5, best = -1, bd = 1e9, a;
    for (a = here - 120; a < here + 120; a += 2) {
      var dd = CITY.rivD(wxOf(axis, a, cx0), wzOf(axis, a, cx0));
      if (dd < bd) { bd = dd; best = a; }
    }
    if (best < 0 || bd > 3.0) return;

    var half = hw + 0.5;                       // the deck spans the carriageway, kerb to kerb
    var lit = litFace(0, 1);
    /* indigo after dark and timber by day, which is the same pair surf_japan's own SHD
     * table resolves timber to — spelled out here because that table is private to the painter. */
    var wood = NIGHT > 0.5 ? P.indigo : P.timber;
    /* THE DECK IS IN THE LAMP WASH AND MUST SAY SO. It sits at 0.30-0.85 m, which is inside the
     * band where surf_japan's lampAt() is the identity — the brightest strip in this whole world
     * after dark. Lit by the sky term alone the bridge came out at a printed luminance of 49 and
     * read as a smudge over the water; the lantern term is what makes it the thing you can see you
     * are about to walk across. Zero at noon, so the daylight scale stays the identity. */
    var base = 26 + 150 * lit * (0.35 + 0.65 * (1 - NIGHT)) + 40 * DAYF + 96 * LAMP;
    var i, q, y;
    /* The deck. Sampled across the span in the ALONG axis so the planks run across the bridge,
     * which is what carries the arch — a plank line at constant `a` converges to the same vanishing
     * point the street does. */
    for (i = 0; i <= BR_N; i++) {
      q = i / BR_N;
      y = 0.30 + BR_RISE * (1 - (2 * q - 1) * (2 * q - 1));
      var aa = best + (q * 2 - 1) * BR_SPAN;
      column(f, wxOf(axis, aa, cx0 - half), wzOf(axis, aa, cx0 - half), y - 0.22, y,
             G_EQ, wood, base, 0);
      column(f, wxOf(axis, aa, cx0 + half), wzOf(axis, aa, cx0 + half), y - 0.22, y,
             G_EQ, wood, base, 0);
      if (project(wxOf(axis, aa, cx0), y, wzOf(axis, aa, cx0)))
        emit(f, Math.floor(PJ.x), Math.floor(PJ.y), G_EQ, wood, base * 0.86, PJ.d - 0.02);
    }
    /* The two rails, and the posts under them. Vermilion on a temple approach and plain timber
     * everywhere else — the same one-quarter-gets-the-lacquer rule the torii follows. */
    var D = CITY.DISTRICTS && CITY.DISTRICTS[CITY.districtAt(wxOf(axis, best, cx0),
                                                             wzOf(axis, best, cx0))];
    var rc = (D && D.name === 'temple') ? P.ember : wood;
    var rl = (D && D.name === 'temple') ? base * 1.25 + 30 : base;
    for (i = 0; i <= BR_N; i++) {
      q = i / BR_N;
      y = 0.30 + BR_RISE * (1 - (2 * q - 1) * (2 * q - 1));
      var ab = best + (q * 2 - 1) * BR_SPAN;
      var ry = y + 0.95 + 0.55 * (1 - (2 * q - 1) * (2 * q - 1));
      for (var sd2 = -1; sd2 <= 1; sd2 += 2) {
        var rx = cx0 + sd2 * half;
        if (project(wxOf(axis, ab, rx), ry, wzOf(axis, ab, rx)))
          emit(f, Math.floor(PJ.x), Math.floor(PJ.y), G_EQ, rc, rl, PJ.d - 0.03);
        /* A post every fifth sample, from the deck to the rail. */
        if (i % 5 === 0)
          column(f, wxOf(axis, ab, rx), wzOf(axis, ab, rx), y, ry, G_PIPE, rc, rl * 0.78, 0);
      }
    }
  }

  /* ================================================================================== blossom ===
   * A drift of petals, and it is this world's tumbleweed: the one thing in the frame that moves and
   * is not weather. west_range.js argues the case for having exactly one such object and the
   * argument holds here — a still frame of a wet street is a photograph, and a photograph is not
   * what this piece is.
   *
   * IT IS OFF IN THE RAIN, which is the whole of its weather logic and is not a dodge. Blossom
   * comes down on a still spring day and it comes down in a wind; in a squall it is on the ground
   * inside a minute, and elements/weather.js is already drawing several hundred cells of rain that
   * a petal drawn through would only muddle. So the pool fades out above `rain` 0.35 and the frame
   * gets its motion from the weather instead.
   *
   * PINK, AND NEVER `rose` — WHICH ARE TWO DIFFERENT STATEMENTS AND THE FIRST VERSION OF THIS NOTE
   * CONFLATED THEM. The prohibition in core.js is on the ROSE SWATCH: "SIGNAGE AND SCREENS ONLY",
   * because hue 337 at 57% saturation under this build's bloom is the failure that walked violet
   * off magenta, and rose's gain is bounded at 0.20/0.18 so that a large area of it can never clear
   * the hot line. All of that is still true and rose is still forbidden here. What did not follow —
   * and what this note used to claim — is that the drift therefore had to be white.
   *
   * It had to be white only because the palette could not spell a pale pink SURFACE, and that was a
   * gap in the table rather than a fact about cherry blossom. core.js slot 20 `blossom` now fills
   * it: 240,168,196 at 30% saturation, which blooms toward white-pink instead of magenta, on the
   * SKY curve like every other surface, printing 159 at night and 221 at noon against rose's 140
   * and 85. So the drift is pink because the flower is pink, and the swatch that carries it is a
   * surface rather than a tube.
   *
   * The `sand` half survives, for the lantern case only: a petal crossing a lantern's light takes
   * the light's colour and not its own, which is the one time a viewer does not see the flower.
   *
   * DETERMINISTIC FROM t. The state is a small pool integrated in update(), the same shape the
   * tumbleweed uses, and every respawn draws from hash2 on (index, quantised t) rather than from
   * an rng — so the offline harness at frame 9000 gets the browser's frame 9000. */
  var NPET = 30;
  var pX = null, pY = null, pZ = null, pPh = null, pVy = null, pSp = null, pLife = null;

  /* THE DRIFT COMES OFF THE CROWNS, and until now it did not. src/elements/jp_flora.js publishes
   * CC.JPFlora — up to eight live crown anchors, refilled every frame, with a centre, a top and a
   * radius — and its own note says a consumer must tolerate n = 0 because the walk is often between
   * eligible quarters. That consumer was never written: grep for JPFlora across src/ and the built
   * bundle returned only the two lines that WRITE it. So the world drew cherries in one place and
   * petals in another, on a ring round the camera, which is the one arrangement that guarantees the
   * two are never seen in the same shot.
   *
   * A SECOND HASH, NOT A SECOND rng() CALL, and this is the constraint that shapes the code. init()
   * seeds the pool from the SHARED element rng and nine EDO elements initialise after this one at
   * layer 22; one extra draw here shifts every one of their noise streams, which is the failure
   * CONTRACT.md records about elements drawing from one rng in layer order. hash2 is a pure
   * function and costs the stream nothing.
   *
   * IT ALSO DECORRELATES RADIUS FROM BEARING, which was a real defect in its own right. Every one
   * of the seven state fields below was derived from the single scalar `r`, so bearing (r * 6.2832)
   * and radius (4 + r * 20) were welded together: a petal's distance from the camera DETERMINED its
   * direction. Once the 11 m near cut below removes everything with r under about 0.35, what is
   * left is a fixed 234-degree arc of world bearings — the drift had a hole in it in the same
   * compass direction on every seed and at every hour. `q` is a second HASH, decorrelated from the
   * bearing rather than independent of it — its varying input is a 1/4096 quantisation of the same
   * r, so two petals inside one bucket share a radius. That is enough to break the weld and nothing
   * observable follows from the residue; it is written down because the paragraph above argues from
   * decorrelation and should not be read as claiming a second random draw. It is sqrt-distributed
   * so petals spread evenly over the disc of the crown rather than bunching at its centre.
   *
   * BE HONEST ABOUT WHAT THIS BUYS, AND IT IS LESS THAN IT SOUNDS. Under the 11 m cut, a pool of 30
   * and the frustum, the drift is structurally incapable of more than a few cells a frame — raising
   * NPET to 96 with this coupling in place moved seed 42 from 0.09 to 0.09 visible cells a frame,
   * so the pool size is not the constraint and never was. Measured after this change over 601-frame
   * walks at 200x60, petal cells printing above the black line run 0.1 a frame at seed 42 and 0.0 at
   * seeds 512 and 3 — the drift is still BELOW THE VISIBILITY FLOOR of the shipped picture, exactly
   * as the camera-ring version was. Written down so a later pass does not re-derive it: the blossom
   * MASS in this world is the crown, at 300-425 cells a frame. This makes the drift correct and
   * located, not visible.
   *
   * ITS RATE MOVED AND THE NUMBER IS HERE. Petals born on a crown 13-42 m out cross cells at
   * different speeds than petals born on a ring 4-24 m round the camera, and this element has
   * tripped the photosensitivity rule before. Measured with tools/sakura-flicker.cjs at its 10 s
   * reference window, worst over seeds 42/3/404 x kiri/clear/tsuyu: the drift's own cells go from
   * 0.20 to 0.60 big steps a second, and 1.04% to 0.97% in the 3-20 Hz band. The band — which is the
   * project's actual rule — improved; the step rate tripled and is still well under the 1.00/s the
   * probe holds a non-default world to and an order under west-flicker's 8.0/s backstop. */
  function respawn(i, r) {
    var a = r * 6.2832;
    var FL = CC.JPFlora;
    if (FL && FL.n > 0) {
      var j = (hash2(i, 7, BASE + 0x53) * FL.n) | 0;
      if (j >= FL.n) j = FL.n - 1;
      /* THE ANCHOR HAS TO BE INSIDE THIS ELEMENT'S OWN RECYCLE RADIUS or the spawn is thrown away
       * on the next tick. update() below retires a petal at dx*dx + dz*dz > 1600, i.e. 40 m, while
       * the publisher accepts a tree at a FORWARD distance of up to 42 m — and forward is not
       * radial, so an accepted anchor reaches about 1.30 * w, near 54 m off to the side. Measured
       * before this guard: at seed 42, 75 of 135 crown spawns in one window landed outside the
       * recycle radius, against zero for the camera ring the old path used (its own 4-24 m ring
       * could not reach it). Worse than the waste, the respawn draw is quantised at 2 Hz, so a
       * petal born outside is re-placed on the same dead point for up to half a second before it
       * moves at all. 1444 is 38 m squared — inside 40 with a margin for the crown radius the
       * spawn then adds. Out-of-range anchors fall through to the ring, which is the same
       * behaviour the publisher's own note asks for when there is no usable crown.
       *
       * THE NEAR BOUND IS A RATE BOUND AND IT WAS ADDED BECAUSE THE FAR ONE ALONE FAILED THE GATE.
       * With only `< 1444` the drift concentrated on whichever crown was nearest, and at seed 3
       * under tsuyu that doubled the drift's own cell count (118 -> 234) and took it to 2.03% in
       * the 3-20 Hz band, over the project's 2% rule — a photosensitivity regression introduced by
       * a change whose only stated purpose was to stop wasting petals. How fast a petal crosses a
       * cell is a function of how near it is, which is the whole argument behind the 11 m cut
       * further down; birthing the pool nearer is the same defect arriving by a different route.
       * 400 is 20 m squared, and it puts the drift back at 0.97% in band and 0.60 big steps a
       * second. Both ends of this bound are measured, and neither is a look. */
      var adx = FL.x[j] - V.ox, adz = FL.z[j] - V.oz, ad2 = adx * adx + adz * adz;
      if (ad2 > 400 && ad2 < 1444) {
      var q = Math.sqrt(hash2(i * 13 + 5, (r * 4096) | 0, BASE + 0x54));
      pX[i] = FL.x[j] + Math.cos(a) * FL.r[j] * q;
      pZ[i] = FL.z[j] + Math.sin(a) * FL.r[j] * q;
      pY[i] = FL.y[j] - q * 0.9;
      pPh[i] = r * 6.2832;
      pVy[i] = 0.32 + r * 0.36;
      pSp[i] = 0.7 + r * 1.1;
      pLife[i] = 7 + r * 9;
      return;
      }
    }
    /* 4-24 m, not 6-32. A petal at thirty metres is a sub-cell object that projects to one dim
     * mark and is then culled by whatever is in front of it: measured at four seeds the wider ring
     * put 0-8 of forty-six petals on screen, which is not a drift, it is a speck.
     * This is the fallback the publisher requires: no crown in shot, so the ring round the camera
     * is still what a viewer sees, exactly as it was before. */
    pX[i] = V.ox + Math.cos(a) * (4 + r * 20);
    pZ[i] = V.oz + Math.sin(a) * (4 + r * 20);
    pY[i] = 3.4 + r * 4.2;
    pPh[i] = r * 6.2832;
    pVy[i] = 0.32 + r * 0.36;                    // terminal velocity of a petal, near enough
    pSp[i] = 0.7 + r * 1.1;
    pLife[i] = 7 + r * 9;
  }

  var t0 = 0;

  function mk(name, layer, fn) {
    return {
      name: name, layer: layer, world: 'japan',
      init: function (city) { boot(city); },
      draw: function (f, cam, t) {
        if (!CITY) return;
        t0 = t === undefined ? (cam.t || 0) : t;
        view(f, cam, t0);
        fn(f);
      }
    };
  }

  /* Layer 14: below the torii at 16 and the keep at 15, because a bridge is the thing everything
   * else on the crossing stands in front of. */
  CC.ELEMENTS.push(mk('jp-bridge', 14, function (f) {
    var i;
    for (i = -1; i <= 1; i++) drawBridge(f, 0, nearIdx(0) + i);
    for (i = -1; i <= 1; i++) drawBridge(f, 1, nearIdx(1) + i);
  }));
  CC.ELEMENTS.push(mk('jp-torii', 16, function (f) {
    var i;
    for (i = -1; i <= 1; i++) drawTorii(f, 0, nearIdx(0) + i);
    for (i = -1; i <= 1; i++) drawTorii(f, 1, nearIdx(1) + i);
  }));
  CC.ELEMENTS.push(mk('jp-stonelantern', 17, function (f) {
    var i;
    for (i = -1; i <= 1; i++) drawToro(f, 0, nearIdx(0) + i);
    for (i = -1; i <= 1; i++) drawToro(f, 1, nearIdx(1) + i);
  }));
  CC.ELEMENTS.push(mk('jp-lanterns', 19, function (f) {
    var i;
    for (i = -1; i <= 1; i++) drawLanterns(f, 0, nearIdx(0) + i);
    for (i = -1; i <= 1; i++) drawLanterns(f, 1, nearIdx(1) + i);
  }));
  CC.ELEMENTS.push(mk('jp-noren', 20, function (f) {
    var i;
    for (i = -1; i <= 1; i++) drawNoren(f, 0, nearIdx(0) + i);
    for (i = -1; i <= 1; i++) drawNoren(f, 1, nearIdx(1) + i);
  }));

  CC.ELEMENTS.push({
    name: 'jp-blossom',
    layer: 22,
    world: 'japan',
    init: function (city, rng) {
      boot(city);
      pX = new Float64Array(NPET); pY = new Float64Array(NPET); pZ = new Float64Array(NPET);
      pPh = new Float64Array(NPET); pVy = new Float64Array(NPET); pSp = new Float64Array(NPET);
      pLife = new Float64Array(NPET);
      /* Placed relative to the map's start rather than to the camera: init() runs before the first
       * camera update and V is still zeroed. */
      V.ox = city && city.startX !== undefined ? city.startX : 0;
      V.oz = city && city.startZ !== undefined ? city.startZ : 0;
      for (var i = 0; i < NPET; i++) respawn(i, rng());
    },
    update: function (dt, t, cam) {
      if (!CITY) return;
      V.ox = cam.x; V.oz = cam.z;
      var damp = CC.reducedMotion ? 0.3 : 1;
      var gust = 0.5 + 1.1 * W_WIND;
      for (var i = 0; i < NPET; i++) {
        pLife[i] -= dt;
        /* A petal does not fall, it SLIPS: it slides sideways, stalls, and slides the other way,
         * which is what the phase term is. The horizontal motion is the same order as the vertical
         * and that ratio is the whole read — anything that drops straight down is snow. */
        pPh[i] += dt * pSp[i] * damp;
        pY[i] -= pVy[i] * dt * damp;
        pX[i] += Math.cos(pPh[i]) * 0.42 * dt * gust * damp;
        pZ[i] += (Math.sin(pPh[i] * 0.7) * 0.30 + 0.22) * dt * gust * damp;
        var dx = pX[i] - cam.x, dz = pZ[i] - cam.z;
        if (pY[i] < 0.05 || pLife[i] < 0 || dx * dx + dz * dz > 1600)
          respawn(i, hash2(i, (t * 2) | 0, BASE + 0x51));
      }
    },
    draw: function (f, cam, t) {
      if (!CITY) return;
      t0 = t === undefined ? (cam.t || 0) : t;
      view(f, cam, t0);
      if (W_RAIN > 0.35) return;
      /* NOT DRAWN UNDER REDUCED MOTION, rather than damped. The house rule is "damp or freeze", and
       * for most elements damping is the right half of it — a slower rain is still rain. This one
       * is different in kind: a drift of blossom IS the motion, and thirty petals frozen in
       * mid-air are not a quieter version of it, they are a scatter of dots hanging in the sky.
       * Damping it also does not make it safe, which is the measured half of this note: at the
       * 0.3 factor the frontier's tumbleweed uses, the petals still crossed cells about four times
       * a second and tools/west-flicker.cjs scored the world 90 big steps over its world pass
       * alone. This is an ornament; the honest answer for a viewer who has asked for less motion is
       * to leave it out. */
      if (CC.reducedMotion) return;
      var fade = clamp(1 - W_RAIN / 0.35, 0, 1);
      for (var i = 0; i < NPET; i++) {
        if (!project(pX[i], pY[i], pZ[i])) continue;
        /* NOTHING INSIDE ELEVEN METRES, AND IT IS A RATE GATE RATHER THAN A LOOK. How fast a petal
         * crosses a CELL is its screen speed, which is its world speed times scale over distance —
         * so the near ones are the only ones that switch a cell inside the 3-20 Hz flash band. At
         * 3 m a petal covers a cell for a twelfth of a second (12 Hz, squarely in it); at 8 m it is
         * still about 2.9 Hz, which the gate's lowest probe at 3.5 Hz can still see the shoulder
         * of; at 11 m it is 2.1 Hz and clear of it. Eleven metres is therefore the cut, faded in
         * over the next five.
         *
         * IT HAD TO BE THE RATE AND NOT THE AMPLITUDE, which was measured rather than assumed.
         * Dimming the petals (150 -> 96) and thinning the pool (64 -> 40 -> 22 -> 10) left
         * tools/west-flicker.cjs reporting the identical 2.59% at the identical cell every time:
         * the worst cell is ONE petal's trajectory, so the pool size does not touch it at all, and
         * the amplitude term is not what the Goertzel is picking up. Distance is the only lever
         * that changes how fast a cell switches. Without this element the same world measures
         * 1.27%; with it and this cut, it clears.
         *
         * It is also the better picture. A petal a metre from the eye is a fast pale streak across
         * a third of the frame and reads as a bug on the lens; the drift is a thing you see at
         * middle distance, against the buildings, which is where every photograph of it is taken
         * from. */
        if (PJ.d < 11) continue;
        var near = PJ.d < 16 ? (PJ.d - 11) / 5 : 1;
        /* Edge-on for part of every turn, which is why the glyph alternates: a petal seen flat is
         * a mark and a petal seen edge-on is a line, and that flip at a slow rate is the single
         * most legible thing about falling blossom. */
        var e = Math.cos(pPh[i]);
        var flat = e > 0.3 || e < -0.3;
        var warm = hash2(i, 0, BASE + 0x52) < 0.34;
        /* THE LUMINANCE IS A PHOTOSENSITIVITY NUMBER AS MUCH AS A LOOK ONE. A petal is a small
         * object crossing a cell in about a fifth of a second at conversational distance, which
         * puts its on/off at roughly 5 Hz — the middle of the 3-20 Hz flash band — and the flash
         * AMPLITUDE is whatever this line writes. At the first cut's 150 that is 59% of full scale
         * blinking at 5 Hz on every cell the drift crosses, and tools/west-flicker.cjs scored the
         * world 2.54% in band against 1.60% for its world pass alone. The rate cannot be fixed —
         * slowing a petal to leave the band would make it fall at a centimetre a second — so the
         * amplitude is what gives, along with the pool size (64 -> 40 petals).
         *
         * It is also the better picture, which is the usual outcome when a gate is right. A petal
         * is not a light: it is a pale scrap in whatever the ambient happens to be, and at 150 in
         * `sand` it was outshining the paper screens behind it. */
        /* ONE CELL. A two-cell streak was tried — a petal at a sixtieth of a second IS a short
         * blur, and doubling how long a cell is covered should halve the switching rate out of the
         * 3-20 Hz band — and MEASURED it made the gate worse, 2.81% to 3.55%, because a trailing
         * cell does not halve the transitions, it adds a second partial one to every crossing. The
         * lever that actually moves this number is how OFTEN a cell is hit at all, which is the
         * pool size, and that is where the cut was taken instead. Written down because the reasoning
         * for the streak is sound and the next person will have it too. */
        emit(f, Math.floor(PJ.x), Math.floor(PJ.y),
             /* PINK, in core.js's `blossom` (slot 20) — the drift is the same flower as the crown
              * and has to be the same swatch or the petals read as ash coming off a cherry. The
              * warm case keeps `sand`: a petal passing through a lantern's own light takes that
              * light's colour, which is the one place the flower's own hue is not what a viewer
              * sees. The prohibition this replaces was on `rose`, and it still stands — see the
              * note by the swatch in core.js for why a tube and a petal are different objects. */
             flat ? G_o : G_TICK, warm ? P.sand : P.blossom,
             (flat ? 96 : 62) * fade * near * (0.42 + 0.58 * (1 - 0.6 * NIGHT)), PJ.d);
      }
    }
  });

})(typeof CC !== 'undefined' ? CC : require('../core.js'));
