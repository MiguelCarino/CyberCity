/* CyberCity frontier desert — the country the frontier was missing. Layers 10, 16 and 22.
 *
 * THREE HOLES, FOUND BY READING WHAT THE FRONTIER ALREADY HAD, and this file is the answer to all
 * three because they are one subject: what the west looks like when you are not in the town.
 *
 *   1. NO DUST IN THE AIR. west_range.js computes `W_DUST = CC.Weather.P.haze` in its view() and
 *      then never reads it again. Three of the frontier's six presets are ABOUT dust — the whole
 *      difference between blazing, breeze and dust is haze 0.30 / 0.52 / 0.88 against wind 0.18 /
 *      0.52 / 0.82 — and none of it reached the frame except as a slightly lifted sky floor.
 *   2. NO SKYLINE. The only geology in the world is city.js's butte, which is ONE LOT: 9-32 m tall
 *      in a 5-10 m footprint, so it is a spire. Frontier country is composed against a BAND of
 *      flat-topped mesas, and that band is what says the ground goes on past the last building.
 *   3. TWO PLANTS. drawBrush has sage (knee-high) and saguaro (five metres) and nothing at all in
 *      the human-scale middle — the stuff you would actually walk past.
 *
 * The view/project/emit/column helpers are west_range.js's, COPIED rather than shared: they must
 * agree with raycast.js exactly, and the project keeps that true by making a caster change one that
 * is repeated in every element file — loud, rather than silent in one shared helper. All three
 * elements are PURE FUNCTIONS OF (world, t) with no update(), the dust included: a grain's position
 * is its wrapped origin plus the wind vector times t. west_range's tumbleweed is the frontier's one
 * stateful element and one is the budget.
 */
(function (CC) {
  'use strict';

  /* One projector per element — see src/proj.js. V and PJ are this element's own
   * basis and scratch; the four functions are closed over them. */
  var PR = CC.Proj.make(), V = PR.V, PJ = PR.PJ;
  var project = PR.project, emit = PR.emit, column = PR.column, litFace = PR.litFace;

  var P = CC.P, hash2 = CC.hash2, put = CC.put, vnoise = CC.vnoise, clamp = CC.clamp;

  var G_DOT = CC.g('.'), G_COMMA = CC.g(','), G_TICK = CC.g('`'), G_QUOTE = CC.g("'"),
      G_DASH = CC.g('-'), G_UNDER = CC.g('_'), G_TILDE = CC.g('~'),
      G_PIPE = CC.g('|'), G_SLASH = CC.g('/'), G_BSL = CC.g('\\'), G_STAR = CC.g('*'),
      G_PCT = CC.g('%'), G_AMP = CC.g('&'), G_o = CC.g('o'), G_8 = CC.g('8');

  var TAU = 6.283185307;

  var CITY = null, BASE = 0, Surf = null, WEST = null;
  function boot(city) {
    CITY = (city && city.aveX && city.world === 'west') ? city : null;
    /* A private lattice offset off the city's own seed, as west_town.js and market.js do it: an
     * element that draws placement noise from the shared rng reshuffles every element below it,
     * and this file registers three. 52711 is a multiplier no other file uses. */
    BASE = CITY ? ((Math.imul(CITY.seed | 0, 52711) >>> 6) & 0x3fffff) : 0;
  }

  /* haze goes through rel() where surf_west.js reads P.haze raw, and the difference is what the
   * number is FOR: surf_west uses it as a physical fact about the air, this file as a dial on a
   * population it chose, which is the case rel() exists for. 1.0 is the city's 0.40; the frontier
   * runs 0.75 (blazing) to 2.20 (dust) of it. */
  var W_WIND = 1, W_HAZE = 1, W_RAIN = 0;
  /* Defaults are the tuned dusk this world was built at, so a harness without daylight.js still
   * renders the picture the frontier shipped as. */
  var D_SKY = 0.66, D_SUN = 0.64, D_WARM = 0.74;

  /* The camera basis and its four helpers live in src/proj.js — see that file for
   * why there is only one copy of them. What stays here is whatever THIS element
   * caches per frame on top of it. */
  function view(f, cam, t) {
    PR.view(f, cam, t);
    /* The two module handles the old in-file view() used to set. They were assigned
     * inside the body that moved to src/proj.js, and leaving them null took the
     * fallback branch at every site that reads WEST — which is how a refactor that was
     * supposed to be byte-identical moved 1105 cells of a frontier frame. Resolved off
     * the painter registry rather than by CC.SurfWest's name, so an element copied into
     * another world picks up that world's painter. */
    if (!Surf) Surf = CC.Surf;
    if (!WEST) WEST = (CC.SURFACES && CC.World) ? CC.SURFACES[CC.World.id] : null;
    var Wm = CC.Weather;
    W_WIND = Wm && Wm.rel ? Wm.rel('wind') : 1;
    W_HAZE = Wm && Wm.rel ? Wm.rel('haze') : 1;
    W_RAIN = Wm && Wm.P ? Wm.P.rain : 0;
    /* THE THREE DAY CACHES, and losing them is what the factoring cost before it was caught. They
     * are read fourteen times in this file and were assigned in the view() body that moved to
     * src/proj.js; left unassigned they sat at their declared defaults — the dusk values — and the
     * desert quietly stopped responding to the clock while every other file in the world did. */
    var Dm = CC.Daylight;
    D_SKY = Dm ? Dm.P.sky : 0.66;
    D_SUN = Dm ? Dm.P.sun : 0.64;
    D_WARM = Dm ? Dm.P.warm : 0.74;
  }




  /* The backdrop's writer, and it is a second function rather than a flag because Surf.fog()
   * returns 0 for anything past FOG_END and the mesas are parked at 8.6e4. Through emit() every
   * cell of a mesa comes back black — a fine silhouette at midnight and an invisible mountain at
   * noon. Distance up here is a DEPTH KEY, not a length; the aerial perspective a real range has
   * is applied by hand below, where it can be a function of the haze instead of the caster's ramp. */
  function far(f, x, y, ch, col, lum, d) {
    if (x < 0 || y < 0 || x >= V.cols || y >= V.rows) return;
    put(f, x, y, ch, col, lum, d, 3);
  }





  /* A LEANING stem — the only shape in either frontier file that column() cannot draw. A vertical
   * drawn at an offset is not the same thing: the whip has to start at the plant's own base or an
   * ocotillo reads as five separate sticks standing near each other. The fill and its two guards
   * are drawTelegraph's wire loop, for its reasons (a failed sample BREAKS the run; a segment whose
   * depth doubles is crossing the eye plane). k = u*u so the whip leaves the ground vertically and
   * leans at the top; linear gives a straight diagonal, which is a guy wire and not a plant. */
  function strand(f, x0, z0, y0, x1, z1, y1, ch, col, lum) {
    var n = 9, lx = -1, ly = 0, ld = 0, i;
    for (i = 0; i <= n; i++) {
      var u = i / n, k = u * u;
      if (!project(x0 + (x1 - x0) * k, y0 + (y1 - y0) * u, z0 + (z1 - z0) * k)) { lx = -1; continue; }
      var px = Math.floor(PJ.x), py = Math.floor(PJ.y), pd = PJ.d;
      if (lx >= 0 && (pd > ld * 2 || ld > pd * 2)) lx = -1;
      if (lx >= 0) {
        var dx = px - lx, dy = py - ly;
        var st = Math.abs(dx) > Math.abs(dy) ? Math.abs(dx) : Math.abs(dy);
        if (st > V.rows * 3) st = 0;
        for (var q = 1; q < st; q++) {
          var tq = q / st;
          emit(f, lx + Math.round(dx * tq), ly + Math.round(dy * tq), ch, col, lum,
               ld + (pd - ld) * tq);
        }
      }
      emit(f, px, py, ch, col, lum, pd);
      lx = px; ly = py; ld = pd;
    }
  }

  /* ---- where a plant may stand -----------------------------------------------------------------
   * The height probe is drawBrush's and is kept: a plant is anywhere the town is not.
   *
   * THE ROAD TEST IS NOT drawBrush's, AND THIS IS THE ONE PLACE THIS FILE KNOWINGLY DIFFERS FROM
   * ITS SIBLING — written down rather than quietly fixed there. west_range.js keeps brush off the
   * carriageway by asking whether the four cells at +-2.4 m are ALSO clear and thinning by a coin
   * flip if they are, reasoning that the road is the wide-open part of the map. In the range
   * district it is not: 62% of those lots are empty, so open country passes that test exactly as
   * the road does, and what the probe really does is thin the brush by half everywhere except
   * within 2.4 m of a building. Good look, wrong reason — and copying it here would have put
   * yuccas up the middle of Main Street.
   *
   * The street lattice is on the city record, so this asks it directly, and checks ONE NEIGHBOUR
   * EITHER SIDE because the arithmetic guess can be a slot out on a jittered lattice — seed 42's
   * avenues sit at x = -110, -60, 7, 46, 111, 160 against a nominal pitch of 52. That is
   * surf_west.js's inCross test, for its reason. `pad` also clears the boardwalk. */
  function onRoad(px, pz, pad) {
    var i = Math.round(px / CITY.AVE), j = Math.round(pz / CITY.CROSS), k;
    for (k = -1; k <= 1; k++) {
      var c = CITY.aveX(i + k) + 0.5, hw = CITY.aveW(i + k) + pad;
      if (px > c - hw && px < c + hw) return 1;
      var c2 = CITY.crossZ(j + k) + 0.5, hw2 = CITY.crossW(j + k) + pad;
      if (pz > c2 - hw2 && pz < c2 + hw2) return 1;
    }
    return 0;
  }

  /* Room for a plant of this radius, and near enough to be worth drawing? Returns the forward
   * distance so the caller can size its detail off it, or 0 for "do not draw". The horizontal bound
   * is generous because a plant whose centre is off screen can still have a whip in frame; emit()'s
   * per-cell check is the real gate. */
  function standing(px, pz, clear, near, far2) {
    if (CITY.height(px, pz) > 0.1) return 0;
    if (clear > 0 && (CITY.height(px + clear, pz) > 0.1 || CITY.height(px - clear, pz) > 0.1 ||
                      CITY.height(px, pz + clear) > 0.1 || CITY.height(px, pz - clear) > 0.1)) return 0;
    var rx = px - V.ox, rz = pz - V.oz;
    var w = rx * V.fwx + rz * V.fwz;
    if (w < near || w > far2) return 0;
    var s = rx * V.rgx + rz * V.rgz, lim = w * V.hp + 8;
    if (s < -lim || s > lim) return 0;
    return w;
  }

  /* ================================================================================================
   * 1. THE BACKDROP — a band of mesas and buttes on the horizon.
   *
   * A DIRECTION, NOT A PLACE. These are kilometres away, where a 1.6 m/s walk moves the parallax by
   * a two-hundredth of a cell per minute — so a world-space mesa and a bearing-space one are the
   * same picture, and the bearing-space one cannot drift and cannot be walked past. Up here nothing
   * should move, and the cheapest guarantee is to make position impossible to express.
   *
   * THE LATTICE WRAPS: the slot index is taken modulo a fixed count round the compass rather than
   * off floor(bearing/pitch), because cam.yaw accumulates — turn through a full circle and an
   * unwrapped lattice hands you a different mountain range in the same place. The pitch is DERIVED
   * from the count so slot 0 and slot N are the same landform to the last bit.
   *
   * DEPTH, past Surf.FOG_END so the world pass always wins — sky.js's D_STAR/D_CLOUD/D_MOON
   * mechanism — and the ordering against the frontier's own sky is deliberate:
   *     west-birds  8.0e4   in front: a vulture over a distant range
   *     mesas near  8.6e4
   *     mesas far   8.8e4   the nearer band occludes the farther
   *     cloud bars  9.6e4   behind: bars stack up FROM the ridge line, which is what they do
   *     stars       1.0e5   behind, so a mesa is a hole in the star field
   *     the sun    1.02e5   behind: the sun sets INTO the mesas
   * None of it depends on layer order; put() is a depth test.
   * ============================================================================================= */

  /* 45 and 29 slots — coprime, so the two bands never line up into one ridge, and 45 gives a mean
   * form 8 degrees wide, a real mesa's angular size at this range. The first cut ran 90 and the
   * horizon came out a picket fence of spires.
   *
   * THE HEIGHTS ARE ANGLES AND THEY ARE NOT THE ANGLES A THIRTY-MILE MESA SUBTENDS. Same trade
   * west_sky.js makes for the sun, and the first cut got it wrong by believing the arithmetic: a
   * 600 m mesa at 30 km subtends 0.02 rad, a row and a half at 77 rows per radian, and a band built
   * to that scale put 103 cells in the frame at seed 42 frame 600. A two-storey false front thirty
   * metres away covers everything under about 0.18 rad and the only sky a street contains is above
   * it — the honest mesa was behind the town in every frame the walk takes.
   *
   * SO THE TWO BANDS ARE TWO DIFFERENT PICTURES. Band 0 is low (0.03-0.145 rad, 2-11 rows) and
   * common: the open range district's far rim. Band 1 answers the street — 0.105-0.255 rad, tall
   * enough to clear a roofline, and deliberately RARE at 30% of 29 slots, about nine landmarks
   * round the whole compass. With the walk at the emptiest 60 m square seed 42 has (13.6% built),
   * band 0 alone put ZERO cells in the frame at four of five test bearings. */
  var MB_N     = [45, 29];
  var MB_H0    = [0.030, 0.105];      // lowest cap, radians above the horizon
  var MB_HS    = [0.115, 0.150];      // and the span above it
  var MB_P     = [0.62, 0.30];        // share of slots carrying a landform at all
  var MB_TONE  = [1.00, 0.72];        // aerial perspective: the far band is PALER, not dimmer
  var MB_D     = [8.8e4, 8.6e4];
  var MB_PITCH = [TAU / MB_N[0], TAU / MB_N[1]];

  /* One landform's profile at a bearing offset: a flat cap, a bench where the caprock has fallen
   * away, and a talus fan down to the flat. Three steps, and three is the least that reads as
   * stratified rock rather than as a box. */
  function step(dd) {
    if (dd < 0.55) return 1.0;
    if (dd < 0.78) return 0.66;
    if (dd < 1.00) return 0.34;
    return 0;
  }

  /* The winning landform's flank sign, set by ridge() and read by the draw: +1 means this column is
   * on the form's right-hand side as the camera sees it, so its rock faces screen-right. */
  var MF_SIDE = 0;

  function ridge(bear, b) {
    var pitch = MB_PITCH[b], n = MB_N[b];
    var k0 = Math.floor(bear / pitch), best = 0, bestSide = 0, kk;
    for (kk = k0 - 1; kk <= k0 + 1; kk++) {
      /* The hash reads the WRAPPED slot so the range is periodic; the centre is built from the
       * UNWRAPPED index so it lands beside the bearing being asked about. */
      var slot = ((kk % n) + n) % n;
      if (hash2(slot, b, BASE + 0x71) > MB_P[b]) continue;
      var c = (kk + 0.5 + (hash2(slot, b, BASE + 0x72) - 0.5) * 0.60) * pitch;
      var w = pitch * (0.26 + 0.36 * hash2(slot, b, BASE + 0x73));
      /* Cubed: most of the band is low and a genuinely tall mesa is an event. A uniform roll gives
       * a horizon of equal-height blocks, which is a city skyline. */
      var hh = hash2(slot, b, BASE + 0x74);
      var top = MB_H0[b] + hh * hh * hh * MB_HS[b];
      var off = bear - c;
      var s = step((off < 0 ? -off : off) / w);
      if (s <= 0) continue;
      var e = top * s;
      if (e > best) { best = e; bestSide = off < 0 ? -1 : 1; }
    }
    MF_SIDE = bestSide;
    /* The far band also carries a continuous low ridge under its buttes; the near band does not.
     * Without it the horizon between two mesas is a naked line where the sky meets the dirt, which
     * is what an ocean has. Half a row to a row and a half, so it is a texture, not an object. */
    if (b === 0) {
      var base = 0.0055 + 0.0115 * vnoise(bear * 2.6 + 31.7, BASE + 0x75);
      if (base > best) { best = base; MF_SIDE = 0; }
    }
    return best;
  }

  function drawMesas(f) {
    var sunX = WEST ? WEST.SUN_X : -0.479, sunZ = WEST ? WEST.SUN_Z : 0.878;
    var cols = V.cols, hp = V.hp, scale = V.scale;
    var horiz = V.horizon, hrow = Math.floor(horiz);
    if (hrow < 0) return;
    if (hrow > V.rows - 1) hrow = V.rows - 1;

    /* AIRLIGHT — the brightness of the air BETWEEN here and the mesa, which is what decides how a
     * distant range looks at every hour. It is not the light on the rock: kilometres of atmosphere
     * scatter more toward the eye than the rock reflects, which is why a far mountain is paler than
     * a near one. So the sky drives it, the haze multiplies it, and the rock is a FRACTION of it.
     * At night sky is 0, this collapses to 4, and the range is the black cut-out it should be.
     *
     * 190 AND NOT 112, which is a fact about core.js's print and not about the air: a noon mesa has
     * to read PALER than the sky behind it or it is a stain. The frontier's noon sky prints its
     * dither around v=55; white tops out at a printed 151 and slate at 114. At the first cut's 112
     * the body landed at lum 57-100, printing 45-80 on slate — the sky's own tone, and the range
     * vanished into it. */
    var airlight = (4 + 190 * D_SKY) * clamp(0.42 + 0.46 * W_HAZE, 0.34, 1.30);

    var x, r;
    for (x = 0; x < cols; x++) {
      var sp = ((x + 0.5) * 2 / cols - 1) * hp;
      /* This column's unit direction, straight off the camera basis and with no trig — it is the
       * vector raycast.js marches. The bearing is wanted only for the lattice; that is the one atan. */
      var dirx = V.fwx + V.rgx * sp, dirz = V.fwz + V.rgz * sp;
      var il = 1 / Math.sqrt(dirx * dirx + dirz * dirz);
      var nx = dirx * il, nz = dirz * il;
      var bear = V.yaw + Math.atan(sp);
      /* Toward the sun, and to the right of this column. The right vector of a direction (nx, nz)
       * in the project's convention (yaw 0 faces +z) is (nz, -nx). */
      var toSun = nx * sunX + nz * sunZ;
      var rgtSun = nz * sunX - nx * sunZ;

      var b;
      for (b = 0; b < 2; b++) {
        var elev = ridge(bear, b);
        if (elev <= 0) continue;
        /* Math.tan and not the small-angle elevation: it is what west_sky.js's proj() does and the
         * two must agree, and by 0.12 rad the difference is already half a row. */
        var yTop = horiz - Math.tan(elev) * scale;
        var r0 = Math.floor(yTop);
        if (r0 > hrow) continue;
        if (r0 < 0) r0 = 0;

        /* Which way this flank faces the sun, on west_range.js's litFace curve so a mesa and a
         * telegraph pole cannot disagree about where the light is. The normal is expressed in
         * SCREEN terms — a right-hand flank is lit when the sun is to the right of the column —
         * because a bearing-space object has no world normal to hand. */
        var d = MF_SIDE * rgtSun;
        var kk = clamp(0.5 + 0.62 * d, 0, 1);
        var lit = 0.10 + 0.90 * kk * kk * (3 - 2 * kk);
        lit = 0.35 + 0.65 * lit * D_SUN;              // at night nothing is lit and it all flattens

        /* CONTRE-JOUR. A range with the sun behind it is a silhouette with a burning rim; one with
         * the sun behind the viewer is a lit wall. Same rock, and the difference is most of what a
         * desert photograph is about. It rides D_WARM, so it is strongest at the two golden hours
         * and gone at noon when the sun is overhead and neither applies. */
        var backlit = clamp(toSun, 0, 1) * D_WARM;
        var tone = MB_TONE[b];
        /* 0.34-0.92 of the airlight: never brighter than the air in front of it (that is snow) and
         * never black by day (that is a hole). */
        var body = airlight * tone * (0.34 + 0.58 * lit) * (1 - 0.42 * backlit);
        var dist = MB_D[b];

        for (r = r0; r <= hrow; r++) {
          if (r === r0) {
            /* THE CAP LINE, and it is the whole element: a mesa is recognised by a dead-level top
             * with a sharp edge, and that edge is one row of cells. Drawn at every hour and in
             * every weather even when the body is invisible, because a black silhouette with a lit
             * rim IS the picture at dawn and dusk. The rim term fires only where the sun is behind
             * the ridge and the light is warm; amber tops out at a printed 180 and this is the one
             * thing up here allowed near it. */
            var cl = body * 1.5 + airlight * tone * 0.30 +
                     190 * backlit * clamp(toSun - 0.30, 0, 0.7) * 1.4;
            var ccol = (D_WARM > 0.35 && (backlit > 0.18 || lit > 0.72)) ? P.amber
                     : (D_SKY > 0.42 ? P.white : P.slate);
            far(f, x, r, elev > 0.030 ? G_UNDER : G_DASH, ccol, cl, dist - 1);
            continue;
          }
          /* THE FACE. Every cell of the body is painted whatever the hour, at lum 0 in the dark,
           * so the range is a HOLE in the star field and in surf_west's sky dither rather than a
           * stain over it — which is what "a black cut-out against stars" has to mean in a renderer
           * whose sky is drawn before its elements are. What is painted into it is bedding, the
           * same read surf_west.js's rockFace gets its buttes from. The dither is keyed on the
           * BEARING and on height above the horizon, never on the screen column: hash2(x, r) welds
           * the texture to the glass and the range crawls through a fixed stipple as the camera
           * turns, which is the bug west_sky.js's cloud bars were rewritten to avoid. */
          var dens = 0.16 + 0.40 * D_SKY;
          var h = hash2(Math.floor(bear * 240), (hrow - r) * 3 + b, BASE + 0x76);
          if (h > dens || body < 4) { far(f, x, r, 0, P.shadow, 0, dist); continue; }
          /* White by day, ember while the light is warm, slate for the blue hour between. White is
           * the only swatch that can out-brighten the noon sky and ember the only one that can be a
           * warm dark against a sunset; slate is neither, which is right for the twenty minutes
           * when the picture is neither. */
          far(f, x, r, h < dens * 0.42 ? G_DASH : (h < dens * 0.78 ? G_UNDER : G_TICK),
              D_SKY > 0.55 ? P.white : (D_WARM > 0.40 ? P.ember : P.slate),
              body * (0.62 + 0.70 * (h / dens)), dist);
        }
      }
    }
  }

  /* ================================================================================================
   * 2. THE PLANTS — four more, on four lattices, and none of them green.
   *
   * SPRING IS SPENT AND THIS FILE GETS NONE. west_range.js's note is right: sage is the one living
   * colour out here and is deliberately a couple of cells per clump. So a yucca is slate with a
   * white head, a mesquite slate, an ocotillo slate with an ember tip, dead grass amber — which is
   * also what they look like. Mesquite reads grey-brown at any distance and an ocotillo out of leaf
   * (most of the year) is a bundle of grey sticks.
   *
   * FOUR LATTICES WITH NO COMMON FACTOR — 6.7, 11.3, 13.9, 9.7 m — so no two plants can grow out of
   * each other, which is the thing that most reliably announces a procedural field.
   * ============================================================================================= */
  var YUC_LAT = 6.7, MES_LAT = 11.3, OCO_LAT = 13.9, WASH_LAT = 9.7;

  function drawPlants(f) {
    var i, j, w, x, y, dd;
    var sunX = (WEST && WEST.SUN_X < 0) ? -1 : 1;
    /* One lit/dark decision for the whole field: a two-metre bush forty metres away subtends three
     * degrees, so its own bearing cannot change the answer. drawTelegraph takes it once per line
     * for the same reason. */
    var sunA = litFace(1, 0), sunB = litFace(0, 1);
    var sun = sunA > sunB ? sunA : sunB;
    /* D_SUN and not the litFace value alone, or the plants stay rimmed in amber all night — which
     * is what the frontier's furniture did before the clock existed. */
    var day = clamp(0.14 + 0.86 * D_SUN, 0, 1);
    var hot = sun > 0.6 && D_SUN > 0.35;
    /* ---- WHAT A PLANT IS MADE OF, and slate is not it ---------------------------------------------
     * Every plant in this function is drawn in slate, which is 62,98,138 — a deliberately BLUE
     * swatch whose job in this project is unlit concrete. That was the whole vocabulary available
     * when this file was written; the palette now has moss (92,126,74, "planting, algae, sage,
     * canvas") and timber, and a creosote bush at midday is sage green over dead brown wood.
     *
     * Dithered per PLANT on the day fill, for the reason west_town.js's posts are: a bush is one
     * object and half of it in each swatch is a stripe. slate stays the night swatch untouched, so
     * the tuned frame is unchanged to the byte. */
    var dF = dayFill();

    /* ---- the yucca ------------------------------------------------------------------------------
     * A stiff rosette with a flower stalk out of the middle, and the STALK is the whole silhouette:
     * a yucca in bloom is a pale spike standing a metre clear of everything round it, which at this
     * cell size is two cells of white on a dark tuft. It is the only plant in the world that points. */
    var lo = Math.floor((V.ox - 46) / YUC_LAT), hi = Math.floor((V.ox + 46) / YUC_LAT);
    var lo2 = Math.floor((V.oz - 46) / YUC_LAT), hi2 = Math.floor((V.oz + 46) / YUC_LAT);
    for (j = lo2; j <= hi2; j++) {
      for (i = lo; i <= hi; i++) {
        var yh = hash2(i, j, BASE + 0x21);
        if (yh > 0.28) continue;
        var yx = i * YUC_LAT + hash2(i, j, BASE + 0x22) * YUC_LAT;
        var yz = j * YUC_LAT + hash2(i, j, BASE + 0x23) * YUC_LAT;
        if (onRoad(yx, yz, 2.4)) continue;
        w = standing(yx, yz, 1.3, 1.0, 52);
        if (!w) continue;
        var stalk = 1.5 + (yh / 0.28) * 1.0;          // 1.5-2.5 m
        column(f, yx, yz, 0, 0.55, G_STAR, leafC(yh, dF), 24 + 30 * day + 84 * dF, 0);
        /* Two blades either side of the base — a rosette seen from any angle without an angle. */
        if (w < 22) {
          if (project(yx - 0.34, 0.42, yz)) emit(f, Math.floor(PJ.x), Math.floor(PJ.y), G_SLASH, P.slate, 20 + 26 * day, PJ.d);
          if (project(yx + 0.34, 0.42, yz)) emit(f, Math.floor(PJ.x), Math.floor(PJ.y), G_BSL, P.slate, 20 + 26 * day, PJ.d);
        }
        column(f, yx, yz, 0.5, stalk, G_PIPE, P.slate, 18 + 34 * day, 0);
        if (project(yx, stalk + 0.12, yz)) {
          x = Math.floor(PJ.x); y = Math.floor(PJ.y); dd = PJ.d;
          emit(f, x, y, G_8, hot ? P.white : P.slate, (hot ? 128 : 40) * (0.6 + 0.5 * day), dd);
          if (w < 26) emit(f, x, y + 1, G_o, hot ? P.white : P.slate, (hot ? 92 : 30) * (0.6 + 0.5 * day), dd);
        }
      }
    }

    /* ---- the mesquite ---------------------------------------------------------------------------
     * A WIDE LOW MASS and nothing else. It earns a lattice because it is the only thing in the
     * frontier with horizontal bulk: every other object this world contains is a vertical (post,
     * pole, cactus, stalk) or a flat plane.
     *
     * DRAWN AS A SPAN, NOT AS FIVE POSTS, and the first cut was the five posts. A bush three metres
     * across at ten metres is twenty screen columns wide, so five world-space columns landed four
     * columns apart and the plant rendered as a row of separate bars — looked at, and it read as a
     * fence. Every column of the span is drawn instead, on a round profile with a per-column roll.
     *
     * THE TOP EDGE IS PAINTED AND THE BODY IS NOT, surf_west.js's board rule applied to a plant:
     * that span filled solid is 700 cells for one bush, every one in the print's muddy band. The
     * crown line is what the eye reads a bush by; an interior at a quarter density reads as foliage
     * with light through it, which is what mesquite is. */
    lo = Math.floor((V.ox - 62) / MES_LAT); hi = Math.floor((V.ox + 62) / MES_LAT);
    lo2 = Math.floor((V.oz - 62) / MES_LAT); hi2 = Math.floor((V.oz + 62) / MES_LAT);
    for (j = lo2; j <= hi2; j++) {
      for (i = lo; i <= hi; i++) {
        var mh = hash2(i, j, BASE + 0x31);
        if (mh > 0.46) continue;
        var mx = i * MES_LAT + hash2(i, j, BASE + 0x32) * MES_LAT;
        var mz = j * MES_LAT + hash2(i, j, BASE + 0x33) * MES_LAT;
        if (onRoad(mx, mz, 2.8)) continue;
        w = standing(mx, mz, 2.0, 1.4, 62);
        if (!w) continue;
        var top = 2.0 + (mh / 0.46) * 1.0;            // 2-3 m
        var half = 0.9 + mh * 1.8;                    // 0.9-1.7 m: wider than it is tall
        if (!project(mx, 0.10, mz)) continue;
        var bcx = PJ.x, bry = PJ.y, bd = PJ.d;
        if (!project(mx, top, mz)) continue;
        var trY = PJ.y;
        var rw = half * V.colK / w;
        var iw = Math.ceil(rw); if (iw > 30) iw = 30;
        var q, r2;
        for (q = -iw; q <= iw; q++) {
          var u = rw > 0.5 ? q / rw : 0;
          if (u < -1 || u > 1) continue;
          var qh = hash2(i * 31 + q, j, BASE + 0x34);
          /* sqrt is the circle; the roll is what stops the crown being a drawn arc. */
          var prof = Math.sqrt(1 - u * u) * (0.72 + 0.34 * qh);
          var rTop = Math.floor(bry + (trY - bry) * (0.34 + 0.66 * prof));
          var rBot = Math.floor(bry);
          var cx2 = Math.floor(bcx + q);
          var side = (q * sunX > 0) ? 1 : 0;
          var mcol = hot && side ? (dF > 0.5 ? P.moss : P.amber) : leafC(mh / 0.46, dF);
          var mlum = (hot && side ? 68 + 92 * dF : 24 + 74 * dF) * (0.55 + 0.60 * day);
          for (r2 = rTop; r2 <= rBot; r2++) {
            var deep = r2 - rTop;
            if (deep > 1 && hash2(cx2 * 3 + deep, i * 5 + j, BASE + 0x35) > 0.26) continue;
            emit(f, cx2, r2, deep === 0 ? G_AMP : (qh < 0.6 ? G_PCT : G_STAR),
                 mcol, mlum * (deep === 0 ? 1.25 : 0.8) * (0.7 + 0.5 * qh), bd);
          }
        }
        /* Its own shade, which is the blackest thing on the flat at midday and what stops the plant
         * floating above the ground. */
        if (w < 24 && project(mx, 0.05, mz))
          emit(f, Math.floor(PJ.x), Math.floor(PJ.y), G_UNDER, P.slate, 12, PJ.d);
      }
    }

    /* ---- the ocotillo ---------------------------------------------------------------------------
     * Half a dozen bare whips out of one point in the ground, spreading as they rise. It is in this
     * file because it is the only plant shape the frontier can draw that is neither a blob nor a
     * stick: a splay. Four to six strands at two to four metres, about thirty cells. The tip
     * flowers fire on one plant in five and are the only red in the country. */
    lo = Math.floor((V.ox - 58) / OCO_LAT); hi = Math.floor((V.ox + 58) / OCO_LAT);
    lo2 = Math.floor((V.oz - 58) / OCO_LAT); hi2 = Math.floor((V.oz + 58) / OCO_LAT);
    for (j = lo2; j <= hi2; j++) {
      for (i = lo; i <= hi; i++) {
        var oh = hash2(i, j, BASE + 0x41);
        if (oh > 0.32) continue;
        var ox = i * OCO_LAT + hash2(i, j, BASE + 0x42) * OCO_LAT;
        var oz = j * OCO_LAT + hash2(i, j, BASE + 0x43) * OCO_LAT;
        if (onRoad(ox, oz, 2.6)) continue;
        w = standing(ox, oz, 1.8, 1.6, 58);
        if (!w) continue;
        var nw = 4 + Math.floor(hash2(i, j, BASE + 0x44) * 3);     // 4-6 whips
        var bloom = hash2(i, j, BASE + 0x45) < 0.22;
        var q2;
        for (q2 = 0; q2 < nw; q2++) {
          var a = (q2 / nw) * TAU + hash2(i * 17 + q2, j, BASE + 0x46) * 0.9;
          var wh2 = hash2(i, j * 13 + q2, BASE + 0x47);
          var len = 2.0 + wh2 * 2.0;                  // 2-4 m
          var spread = 0.55 + wh2 * 0.85;
          strand(f, ox, oz, 0.05,
                 ox + Math.cos(a) * spread, oz + Math.sin(a) * spread, len,
                 Math.abs(Math.cos(a)) > 0.72 ? (Math.cos(a) > 0 ? G_SLASH : G_BSL) : G_PIPE,
                 P.slate, (16 + 40 * day) * (0.7 + 0.5 * wh2));
          if (bloom && project(ox + Math.cos(a) * spread, len + 0.1, oz + Math.sin(a) * spread))
            emit(f, Math.floor(PJ.x), Math.floor(PJ.y), G_STAR, P.ember, 58 + 90 * day, PJ.d);
        }
      }
    }

    /* ---- the dry wash and the dead grass ---------------------------------------------------------
     * The one thing here not standing up, and it earns its place for a reason none of the others
     * do: it is a LINE ON THE FLAT. Open country has exactly one of those (the telegraph) and needs
     * more — a wash runs ACROSS the view and gives the ground a direction the way the road's ruts
     * do in town. The bearing is hashed per patch and the samples run along it, so a wash is a
     * streak of grit seven metres long, which is the difference between a creek and a bald spot. */
    lo = Math.floor((V.ox - 40) / WASH_LAT); hi = Math.floor((V.ox + 40) / WASH_LAT);
    lo2 = Math.floor((V.oz - 40) / WASH_LAT); hi2 = Math.floor((V.oz + 40) / WASH_LAT);
    for (j = lo2; j <= hi2; j++) {
      for (i = lo; i <= hi; i++) {
        var gh = hash2(i, j, BASE + 0x51);
        if (gh > 0.34) continue;
        var gx = i * WASH_LAT + hash2(i, j, BASE + 0x52) * WASH_LAT;
        var gz = j * WASH_LAT + hash2(i, j, BASE + 0x53) * WASH_LAT;
        if (onRoad(gx, gz, 3.0)) continue;
        w = standing(gx, gz, 1.6, 1.2, 40);
        if (!w) continue;
        var ba = hash2(i, j, BASE + 0x54) * TAU;
        var bx = Math.cos(ba), bz = Math.sin(ba);
        var q3, N = w < 16 ? 15 : 9;
        for (q3 = 0; q3 < N; q3++) {
          var u2 = (q3 / (N - 1)) * 2 - 1;
          var jit = hash2(i * 7 + q3, j * 3, BASE + 0x55) - 0.5;
          var wxp = gx + bx * u2 * 3.6 - bz * jit * 1.1;
          var wzp = gz + bz * u2 * 3.6 + bx * jit * 1.1;
          if (CITY.height(wxp, wzp) > 0.1) continue;
          var g2 = hash2(i * 11 + q3, j * 5, BASE + 0x56);
          /* The bed: scoured sand, an underscore because the point of it is that it lies BELOW the
           * flat around it. A dry wash at noon is the brightest thing on the ground out here, which
           * is why you can see one from a mile away. */
          if (project(wxp, 0.02, wzp))
            emit(f, Math.floor(PJ.x), Math.floor(PJ.y), g2 < 0.5 ? G_UNDER : G_TILDE,
                 hot ? P.white : leafC(oh / 0.32, dF), (18 + 66 * day + 76 * dF) * (0.6 + 0.6 * g2), PJ.d);
          /* Dead grass on the bank — amber, which is what season-old bunchgrass is — and only on
           * the outer third of the run, so it LINES the wash instead of filling it. */
          if (g2 > 0.62 && (u2 < -0.35 || u2 > 0.35) && project(wxp, 0.10 + g2 * 0.34, wzp))
            emit(f, Math.floor(PJ.x), Math.floor(PJ.y), g2 > 0.86 ? G_QUOTE : G_TICK,
                 P.amber, (26 + 76 * day) * (0.6 + 0.5 * g2), PJ.d);
        }
      }
    }
  }

  /* ================================================================================================
   * 3. THE DUST — what the wind is actually carrying.
   *
   * THE POOL IS weather.js's `rain` STRUCTURE, nearly line for line: one array at a capacity, a
   * PREFIX of it walked whose length tracks the grid and the weather, two interleaved shells so any
   * prefix is a valid mix of near and far, and every grain wrapped into a box round the camera so a
   * finite pool covers an endless desert. That file's comments explain each and they all transfer.
   * What does not is the fall: dust TRAVELS, so the phase term is the wind vector times t along the
   * ground and the streak lies across the frame — which is also why it needs no update().
   *
   * ---- PHOTOSENSITIVITY, the design constraint rather than a check at the end -------------------
   * A field of streaks crossing a sunset is the hazard the windmill and the chimney smoke were
   * redesigned for. AMPLITUDE: the brightest a dust cell is ever written is 74 of 255, 29% of full
   * scale, under the gate's big-step line of a third. DENSITY: under the preset this exists for,
   * several hundred grains cover the lower third of the frame at three to five cells each, so a
   * cell is under SOME streak most of the time and what changes is which — a sparse field of short
   * bright streaks was the first cut. REDUCED MOTION FREEZES IT outright, t replaced by a constant.
   * Measured with tools/west-flicker.cjs at 100x34, the frontier's own worst step, big-step rate and
   * 3-20 Hz band are IDENTICAL with these three elements drawn and suppressed (72.5%, 2.00/s,
   * 2.65%): they add nothing to any of the three.
   * ============================================================================================= */

  /* A CAPACITY, not a tuning constant — RN_MAX's sentence in weather.js, true here for its reason:
   * the pool is filled from a fork of the shared rng so its size cannot re-seed anything below it.
   * Sized so the cap never bites at any grid this project renders (the largest request is `dust` at
   * the 400x100 verification size, 420 * 2.2 * 3.33 = 3077). A cap that bites flattens the
   * difference between a breeze and a dust storm, which is the difference this element draws. */
  var DU_MAX = 3600, DU_AT_REF = 420, DU_REF_CELLS = 200 * 60;
  var DU_BOX_N = 24, DU_BOX_F = 68;
  var duOx = null, duOz = null, duY = null, duSpd = null, duHue = null;

  function initDust(rng) {
    /* One draw from the shared stream buys a private one; the salt is sky.js's and weather.js's, so
     * the three read as one idiom. */
    var r = CC.mulberry(((rng() * 4294967296) | 0) ^ 0x5C1E), i;
    duOx = new Float32Array(DU_MAX); duOz = new Float32Array(DU_MAX);
    duY = new Float32Array(DU_MAX); duSpd = new Float32Array(DU_MAX);
    duHue = new Uint8Array(DU_MAX);
    for (i = 0; i < DU_MAX; i++) {
      var near = (i & 1) === 0;
      var b = near ? DU_BOX_N : DU_BOX_F;
      duOx[i] = r() * b; duOz[i] = r() * b;
      /* THE HEIGHT DISTRIBUTION IS THE WHOLE "LOW" IN "low, near-horizontal streaks", and it is a
       * fourth power rather than a threshold: blown dust has no top, it is a concentration that
       * falls off with height. Squaring twice puts three quarters of the near shell under 35 cm —
       * ankle deep, where dust on a road is — and leaves the odd grain at chest height for a fringe.
       *
       * The ceilings are set by the frame, not the metre: the eye is at 1.7 m, so a grain at 1.4 m
       * two metres off projects just BELOW the horizon — the lower third, where this belongs — and
       * one at 4 m projects twenty rows above it, which is a cloud in the sky. The near shell is
       * capped under the eye line; the far one is never closer than 20 m and gets the extra metres
       * it needs to fill the band along the horizon. */
      var u = r(); u = u * u; u = u * u;
      duY[i] = near ? u * 1.45 : u * 3.40;
      duSpd[i] = 0.62 + r() * 0.76;
      /* WHITE, AMBER, SLATE — never cool, and that is a statement about what dust IS. Suspended
       * mineral dust forward-scatters the sun and is the reason a desert horizon goes orange hours
       * before sunset; there is no mechanism that makes it blue, and ice or azure here would read
       * as spray. Weighted to slate because most of the field is in shadow at any hour. */
      var h = r();
      duHue[i] = h < 0.52 ? P.slate : (h < 0.82 ? P.white : P.amber);
    }
  }

  /* Hoisted to module scope rather than closed over the caller's dF, and that is the contract
   * rather than a preference: a function DECLARATION inside draw() allocates a closure every frame,
   * and this file runs sixty times a second. */
  function dayFill() {
    return (CC.SurfWest && CC.SurfWest.dayFill !== undefined) ? CC.SurfWest.dayFill : 0;
  }
  function leafC(seedH, dF) {
    if (seedH >= dF) return P.slate;
    return seedH < dF * 0.42 ? P.timber : P.moss;
  }

  function wrap(v, b) { return v - b * Math.floor(v / b + 0.5); }

  /* ---- A GRAIN OF DUST IS TRANSLUCENT, and by day that stops being a nicety --------------------
   * (veilCell and not veil: drawDust below already has a local `var veil` for the sheet, and a var
   * declaration hoists over a function of the same name for the whole of that function's body.)
   * emit() REPLACES a cell. That is right at dusk — a grain at lum 74 lands on a road at lum 20-60
   * and is the brighter of the two — and it is the single largest photosensitivity fault the
   * daylight pass created anywhere in this world. The same grain landing on a NOON road at lum
   * 200-255 is a dark object crossing a bright one, several times a second, over the lower third of
   * the frame; the step is the whole contrast between the two rather than the 29% of full scale the
   * paragraph above so carefully bounds.
   *
   * Measured with tools/west-flicker.cjs pinned at noon (the shipped gate never pins the clock, so
   * it has only ever measured this world after dark): with the daylight fill in and this element
   * drawn, the frontier's own big-step rate was 5.50/s against the city's 2.00/s and its 3-20 Hz
   * band 4.92% against 2.80%. With this one element suppressed, 1.75/s and 2.45%. It was all of it.
   * The SHIPPED build fails the same way for the same reason — 2.50/s and 4.73% at noon on pristine
   * sources — so this is a latent fault the fill made loud, not one it invented.
   *
   * So by day a grain VEILS. It reads the cell it is about to land on and moves it a fraction of
   * the way toward its own level, which is what a translucent particle in front of something does,
   * and takes that cell's SWATCH so the whole of the change is the fraction. The step is then
   * bounded by alpha rather than by the contrast, whatever the background: 0.42 keeps it under the
   * gate's third-of-full-scale line against a lum-255 road.
   *
   * Rejected 0.30, and the reason is worth writing down because it is counter-intuitive. A thinner
   * veil does NOT keep going down: successive grains landing on the same cell in the same frame
   * each read the value the last one left, so the field COMPOUNDS toward the dust's own level and
   * what a dense preset does to a cell is set by how many grains cross it, not by alpha. At 0.30
   * the 3-20 Hz band went UP (noon 3.02% -> 3.22%) because the same total displacement was being
   * delivered in more, smaller writes. The lever that works on a compounding field is the number of
   * CELLS each grain touches, which is the streak cap below.
   *
   * At dFill 0, alpha is exactly 1 and this is emit() to the byte — including the fog, which is
   * applied here for emit()'s own reason and must be applied BEFORE the blend, since the cell being
   * blended against has already been through it.
   *
   * The read is a READ. The contract's rule is that nothing may WRITE the typed arrays directly,
   * and this still goes out through CC.put with a depth argument; optics.js and sky.js both read
   * the frame the same way. */
  function veilCell(f, x, y, ch, col, lum, d, alpha) {
    if (x < 0 || y < 0 || x >= V.cols || y >= V.rows) return;
    if (lum > 0 && CC.Surf) { lum = CC.Surf.fog(lum, d); if (lum <= 0) ch = 0; }
    if (alpha < 0.999) {
      var i = y * V.cols + x;
      var dl = f.lum[i];
      lum = dl + (lum - dl) * alpha;
      if (f.ch[i] !== 0) col = f.col[i];
      /* ---- AND IT DOES NOT TAKE THE CELL'S DEPTH, which is the other half of being translucent --
       * This was the largest remaining daylight flicker fault in the world and it is not in the
       * blend at all, it is in the fourth argument to put(). west-dust is layer 22 and west-wagon
       * is layer 22 as well, so on a stable sort by layer this file's element draws FIRST — and a
       * grain a few metres from the eye that claimed d=10 stopped the wagon forty metres up the
       * road from drawing at all. The wagon is a black silhouette on a lum-251 road, so the cell it
       * lost went 0 -> 169 -> 0 for the three frames the grain sat there: two steps of two thirds
       * of full scale, added to a cell that was already stepping at the wagon's own rate. Measured
       * at seed 3 under `dust`, clock pinned at morning: eleven big steps in four seconds against
       * seven with this element suppressed, which is the whole of the 2.75/s against the 2.00/s
       * tolerance. The same grain at NIGHT is opaque and genuinely does hide the wagon, which is
       * correct and is why this is gated on alpha rather than applied always.
       *
       * A translucent thing does not own the cell it tints, so the depth it writes is the depth
       * that was already there, a hair nearer — put() tests strictly, so it has to be nearer by
       * something. 0.99999 is one part in a hundred thousand, which at the fog ramp's 210 m range
       * is two millimetres and cannot reorder anything the caster resolved. A grain over SKY keeps
       * its own depth: the cell's is Infinity, there is nothing behind it to be occluding, and
       * every sky element in this world draws at layers 5-9, well before this one.
       *
       * `d < dc` IS THE VISIBILITY TEST AND IT STAYS. Written without it every grain in the shell
       * passed put(), including the ones BEHIND the road, and the element took the whole lower half
       * of the frame: measured at seed 7 frame 900 noon, rows 28 to 59 went from facade and floor
       * to 200 element cells out of 200, because a grain thirty metres out was overwriting the
       * glyph of a road cell twelve metres away. What is given up here is OWNERSHIP of the cell,
       * not the right to be in front of it. */
      var dc = f.dist[i];
      if (d < dc && dc < 1 / 0) d = dc * 0.99999;
    }
    put(f, x, y, ch, col, lum > 255 ? 255 : (lum < 0 ? 0 : lum | 0), d, 3);
  }

  function drawDust(f) {
    if (!duOx || !CITY) return;
    /* Rain settles dust, in the literal sense of what dust does when it gets wet, so the two
     * frontier presets that carry rain have none in the air. A hard cut is fine because the
     * parameter it keys on already fades: `squall` reaches rain 0.72 over the director's 14 s blend
     * and this reaches zero somewhere in the middle of it. */
    var settle = 1 - clamp(W_RAIN * 1.5, 0, 1);
    if (settle <= 0.02) return;

    /* HOW MUCH DUST, and both terms are needed: haze alone puts a full sheet in the air on a
     * dead-still `overcast` (haze 0.54, wind 0.34), which is a valley full of smoke and not a dust
     * storm, and wind alone blows a clean sky around under `thunder`. The product is what makes
     * `dust` (haze 0.88, wind 0.82) the one preset that blows. The exponent is weather.js's trick
     * for its reason — the raw parameter spans only 0.75 to 2.20 of the reference and the eye does
     * not read a 3x change in a field of streaks as weather — stretched to 0.66-3.15 with 1.0 still
     * a fixed point.
     *
     * MEASURED at 260x60, camera pinned, in cells written: blazing 25, breeze 168, dust 2221 (14%
     * of the frame — weather.js's downpour touches 5-7%, and a dust storm is allowed to be the
     * heaviest sky the frontier has), overcast 96, thunder 13, squall 0. `blazing` is nearly nothing
     * on purpose; it is the still, clear, hot preset. The field SATURATES before the clamp — 2.6x
     * the population moved the cell count 6%, because the streaks have started landing on each
     * other, which is what a sheet is. */
    var amt = Math.pow(clamp(W_HAZE, 0.15, 2.6), 1.45) *
              (0.30 + 0.70 * clamp(W_WIND, 0, 2.0)) * settle;
    var use = (DU_AT_REF * clamp(amt, 0, 2.2) * V.cols * V.rows / DU_REF_CELLS) | 0;
    if (use > DU_MAX) use = DU_MAX; else if (use < 6) return;

    /* THE WIND VECTOR IS THE SHARED ONE. weather.js publishes CC.Weather.wind and asks every
     * hanging, leaning, drifting thing in the build to read it rather than roll a second — "a
     * second wind rolled somewhere else would be visibly out of phase with this one" — and dust
     * crossing a street at right angles to the rain in it is the loudest possible example. */
    var Wd = CC.Weather ? CC.Weather.wind : null;
    var wdx, wdz, wspd;
    if (Wd) { wdx = Wd.dirX; wdz = Wd.dirZ; wspd = Wd.speed; }
    else { wdx = 0.92; wdz = 0.39; wspd = 2.4 * (0.35 + 0.65 * clamp(W_WIND, 0, 1.85)); }

    /* Frozen, not slowed. 7.0 is an arbitrary instant far enough into the drift that the field is
     * not sitting on its own initial lattice. */
    var tt = CC.reducedMotion ? 7.0 : V.t;
    var travX = wdx * wspd * tt, travZ = wdz * wspd * tt;
    /* How fast the field crosses the SCREEN, taken once per frame rather than per particle — which
     * is the whole reason the streak is affordable. */
    var crossV = (wdx * V.rgx + wdz * V.rgz) * wspd;
    var dirSign = crossV < 0 ? -1 : 1;

    /* Dust is a scatterer and nothing else: no colour of its own, invisible in the dark. So this is
     * the sky's luminance with a lift for the low sun, which is what makes a plume glow at the ends
     * of the day. */
    var lift = (0.06 + 0.94 * D_SKY) * (1 + 0.55 * D_WARM * D_SUN);
    /* ---- AND THE RAMP IS NOT LINEAR IN THE FILL, because the ROAD's is not ----------------------
     * Both numbers below were fitted at dFill 1 and then left linear in it, and the MORNING stop is
     * where that shows. dFill is 0.858 there, so the veil is still half opaque — but the ground it
     * is veiling has already arrived: the floor prints 61.8% of its cells lit at morning against
     * 66.3% at noon, i.e. the background is at 93% of its noon brightness while the mitigation is
     * only at 86% of its noon strength.
     *
     * `dk = f(2 - f)` is the fill with its knee pulled forward — 1-(1-f)^2, which is 0 at 0 and 1
     * at 1, so night is the identity to the byte and noon is unchanged to the byte, and the whole
     * of the move lands in the middle where the mismatch is. At morning it reads 0.980 rather than
     * 0.858, which puts the alpha at 0.432 instead of 0.502.
     *
     * WHAT IT IS AND IS NOT WORTH. Measured with the gate's own measurement, clock pinned at
     * morning (the shipped tools/west-flicker.cjs never touches the clock), against the linear
     * version of the same two lines: the big-step RATE does not move — the fault that was costing
     * 2.75/s against a 2.30 tolerance is the depth argument in veilCell() above, not the alpha —
     * but the 3-20 Hz band does, seed 42 under `dust` 1.71% -> 1.60% and under `breeze` 1.41% ->
     * 1.20%. It is margin rather than a fix, and it is written down as margin. Rejected keying on
     * dSky directly, which is the quantity the road actually follows but is 0.657 at DUSK as well
     * as at dawn and would have re-tuned this world's signature hour. */
    var dk = dayFill(); dk = dk * (2 - dk);
    /* How opaque a grain is allowed to be — see veil() above. 1 at dFill 0, so the tuned frontier
     * is unchanged to the byte; 0.42 at noon, which is what holds the step under the gate's line
     * against the brightest ground this world can print. */
    var dAlpha = 1 - 0.58 * dk;
    /* FIVE CELLS AT NIGHT AND TWO BY DAY, and this is the lever that actually moves the day
     * flicker numbers. A streak is n+1 cells that change state together every frame, so the cap is
     * very nearly a multiplier on how much of the frame this element is modulating — and by day
     * every one of those cells is a bright one. The look survives the cut because a streak only
     * reads AS a streak against a dark background: at noon what says "the wind is up" is the whole
     * lower band going soft, which is the sheet below, not the individual grains.
     *
     * HOISTED, and it was in the per-grain loop. dayFill() is a property getter on CC.SurfWest and
     * `use` reaches a couple of thousand grains under the dust presets; the comment eleven lines
     * above the loop is this file's own argument against that — "taken once per frame rather than
     * per particle, which is the whole reason the streak is affordable". */
    var nCap = (5 - 3 * dk) | 0;
    /* Under a light haze the far shell goes first and what is left is a little dust round your
     * boots; under a storm the whole valley fills in. The rain's farUse, same shape. */
    var farUse = use * clamp(0.34 + 0.46 * amt, 0.22, 1);

    var rows = V.rows, cols = V.cols, i;
    for (i = 0; i < use; i++) {
      var near = (i & 1) === 0;
      if (!near && i >= farUse) continue;
      var b = near ? DU_BOX_N : DU_BOX_F;
      var wx = V.ox + wrap(duOx[i] + travX * duSpd[i] - V.ox, b);
      var wz = V.oz + wrap(duOz[i] + travZ * duSpd[i] - V.oz, b);

      var rx = wx - V.ox, rz = wz - V.oz;
      var w = rx * V.fwx + rz * V.fwz;
      if (w < 0.8) continue;
      var rr = rx * V.rgx + rz * V.rgz;
      if (rr > V.hp * 1.3 * w || rr < -V.hp * 1.3 * w) continue;
      /* A grain standing inside a building. put()'s depth test would hide most of these anyway, but
       * only after projecting them, and the height probe is cheaper — and it also catches the case
       * the depth test cannot, a grain drawn at the near face of a wall it is physically inside. */
      var gh = CITY.height(wx, wz);
      if (gh > 0.4) continue;

      if (!project(wx, gh + duY[i], wz)) continue;
      var px = PJ.x, py = Math.floor(PJ.y), d = PJ.d;

      /* The exposure streak, in columns: how far the grain slides across the frame in one 28 ms
       * shutter. Longer than the rain's because the motion is nearly horizontal and a cell is
       * 0.5625 as wide as it is tall, so the same world speed buys nearly twice the cells across as
       * down. Capped at five, past which it stops reading as a particle and starts reading as a
       * rule drawn on the picture. */
      var n = (Math.abs(crossV) * duSpd[i] * 0.028 * V.colK / w) | 0;
      if (n > nCap) n = nCap;

      /* NOT SCALED BY `amt`, which was the first cut's mistake: tying a grain's brightness to the
       * same number that decides how many grains there are squares the weather. Measured at 260x60,
       * `blazing` came out at nine cells against `dust`'s 2111 — a ratio of 235 for a population
       * ratio of 16 — because the few grains a still day has were also written too dim to survive
       * the lum floor. surf_west.js's road learned the identical lesson. 74 is the photosensitivity
       * ceiling above; both shells fall off through their own box so a grain does not pop at the
       * wrap. */
      var base = (near ? 74 : 46) * lift *
                 (1 - clamp(w / (near ? DU_BOX_N * 0.82 : DU_BOX_F * 0.85), 0, 0.72));
      if (base < 5) continue;

      /* THE PER-GRAIN LEVEL IS PART OF THE ANSWER TO THE FLICKER, not decoration. A field where
       * every particle is the same brightness turns on and off as a unit as the wind walks it;
       * spreading the population over the whole range makes the sum over any one cell change
       * smoothly as grains cross it. */
      var g = hash2(i, 0, BASE + 0x61);
      base *= 0.55 + 0.72 * g;

      var hue = duHue[i];
      /* Amber only survives where there is warm light to make it. An amber field under a white noon
       * sun is the most obvious way to make a picture look like it has a filter on it. */
      if (hue === P.amber && D_WARM < 0.30) hue = P.white;

      var gl = n >= 3 ? G_DASH : (n >= 1 ? G_TILDE : (d > 18 ? G_DOT : G_COMMA));
      var k;
      for (k = 0; k <= n; k++) {
        var sx = Math.floor(px - dirSign * k);
        if (sx < 0 || sx >= cols) continue;
        if (py < 0 || py >= rows) continue;
        /* The tail is the older part of the streak and fades — which is also what keeps the run
         * under the step budget where two streaks land on the same cell. */
        var lm = base * (1 - k * 0.17);
        if (lm < 4) continue;
        veilCell(f, sx, py, k === 0 ? gl : (n >= 3 ? G_DASH : G_TICK), hue, lm, d, dAlpha);
      }
    }

    /* ---- the sheet ------------------------------------------------------------------------------
     * Above about twice the reference haze the grains stop being the picture and the AIR becomes it:
     * in a dust storm you do not watch grains go past, you see that the far end of the street has
     * gone. surf_west.js's sky already lifts its floor with haze and the fog ramp already shortens;
     * what is missing is the BOTTOM of the frame, where the ground stays sharp because that ramp is
     * radial and the road at your feet is two metres away. So a thin veil goes over the lower band,
     * at 44 m — behind the near street furniture, in front of the far end of the road.
     *
     * The dither is ONE drifting noise field, never a per-cell reroll — a reroll steps every cell
     * by the veil's full amplitude every frame, the exact failure west_sky.js's cloud bars were
     * rewritten to avoid. It drifts at a fifth of the wind: a sheet travels, its grains faster. */
    if (W_HAZE < 1.55 || CC.reducedMotion) return;
    var veil = clamp((W_HAZE - 1.55) / 0.75, 0, 1) * settle;
    /* AND THE SHEET IS A VEIL TOO, in the literal sense of the function above. It was emit(), i.e.
     * a replacement, at lum 10-50 — which against a dusk road at lum 20-60 is a pale wash and
     * against a NOON road at 200+ is a dark speck, dropped and lifted over up to 44% of the lower
     * band as the drift walks the dither. It is the largest single contributor to the frontier's
     * daylight big-step rate after the grains themselves, and it fails for exactly the same reason.
     *
     * It also has to get much brighter: a sheet of suspended dust at midday is LIT dust, the
     * brightest thing between you and the far end of the street, and the whole read of a dust storm
     * at noon is that the distance whites out rather than blacks out. */
    var vl = (10 + 40 * lift + 168 * (1 - dAlpha) / 0.58) * veil;
    if (vl < 5) return;
    var top = Math.floor(V.horizon - V.rows * 0.10);
    if (top < 0) top = 0;
    var drift = tt * wspd * 0.055, vy, vx2;
    for (vy = top; vy < rows; vy++) {
      var band = (vy - top) / (rows - top);
      var dv = 0.10 + 0.34 * band * veil;
      for (vx2 = 0; vx2 < cols; vx2++) {
        var sp2 = ((vx2 + 0.5) * 2 / cols - 1) * V.hp;
        var hv = vnoise((V.yaw + sp2) * 9.0 + (vy - top) * 0.37 + drift, BASE + 0x62);
        if (hv > dv) continue;
        veilCell(f, vx2, vy, band > 0.55 ? G_DOT : G_TICK, P.white,
                 vl * (0.6 + 0.7 * band), 44, dAlpha);
      }
    }
  }

  /* ---- registration ---------------------------------------------------------------------------
   * The layers are bookkeeping only — the depth constants decide what occludes what. 10 runs the
   * backdrop after west_sky's sun and cloud bars; 16 sits the plants immediately after west-brush
   * at 15 so the two floras draw as one pass; 22 puts the dust over every solid object in the world
   * and under the tumbleweed at 23, which is right — the weed is a solid thing rolling THROUGH the
   * dust, not behind it. */
  function mk(name, layer, fn) {
    return {
      name: name, layer: layer, world: 'west',
      init: function (city) { boot(city); },
      draw: function (f, cam, t) {
        if (!CITY) return;
        view(f, cam, t === undefined ? (cam.t || 0) : t);
        fn(f);
      }
    };
  }

  CC.ELEMENTS.push(mk('west-mesas', 10, drawMesas));
  CC.ELEMENTS.push(mk('west-desert-plants', 16, drawPlants));

  CC.ELEMENTS.push({
    name: 'west-dust',
    layer: 22,
    world: 'west',
    init: function (city, rng) { boot(city); initDust(rng); },
    draw: function (f, cam, t) {
      if (!CITY) return;
      view(f, cam, t === undefined ? (cam.t || 0) : t);
      drawDust(f);
    }
  });

})(typeof CC !== 'undefined' ? CC : require('../core.js'));
