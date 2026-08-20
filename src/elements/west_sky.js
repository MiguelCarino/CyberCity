/* CyberCity frontier sky — the sun, the cloud bars it lights from underneath, and the birds.
 * Layers 4-9, i.e. under everything on the ground and over the sky pass that surf_west.js paints.
 *
 * WHY THE SKY NEEDS ITS OWN ELEMENTS OUT HERE AND DOES NOT IN THE CITY. The city's sky is a slot
 * between rooftops — two per cent of the frame — so sky.js can put a moon and a scatter of stars
 * in it and that is a complete answer. The frontier's sky is a THIRD of the frame and it is what
 * the whole world is composed against: a town of two-storey boxes has no verticals to look at, so
 * the eye goes up, and what it finds there has to be worth the trip. surf_west.js's gradient is
 * the ground of that picture; this file is the subject.
 *
 * THREE THINGS, in the order they matter:
 *   the SUN            one object, low, and the only thing in either world bright enough to be
 *                      looked at directly. It is also the source every other file's lighting model
 *                      already assumes — surf_west.js decides which wall is lit from SUN_AZ, and
 *                      before this element the viewer could see the effect and never the cause.
 *   the CLOUD BARS     horizontal, lit from beneath, and the single most characteristic thing about
 *                      a desert sunset. They are also what stops the sky being a gradient: a smooth
 *                      ramp has no scale in it and reads as a wash however carefully it is dithered.
 *   the BIRDS          three of them, turning. Sixty cells in the whole frame and they are what
 *                      makes the sky a place with air in it rather than a backdrop.
 */
(function (CC) {
  'use strict';

  var P = CC.P, g = CC.g, put = CC.put, hash2 = CC.hash2, vnoise = CC.vnoise, clamp = CC.clamp;

  var G_DOT = g('.'), G_TICK = g('`'), G_QUOTE = g("'"), G_DASH = g('-'), G_EQ = g('='),
      G_o = g('o'), G_8 = g('8'), G_TILDE = g('~'), G_PLUS = g('+'), G_DQ = g('"'),
      G_HASH = g('#'), G_COLON = g(':'), G_UNDER = g('_'), G_PCT = g('%');

  /* Past Surf.FOG_END so any facade wins the depth test, and ordered among themselves: the sun is
   * behind the cloud, the cloud is behind the birds. Same mechanism sky.js uses. */
  var D_SUN = 1.02e5, D_CLOUD = 9.6e4, D_BIRD = 8.0e4;
  /* ---- AND ONE DEPTH IN FRONT OF sky.js's DECK, for the day cells only ---------------------------
   * sky.js's `cloudbase` runs at layer 3 with its own D_CLOUD of 9.5e4 and paints the whole slot in
   * P.shadow at lum 26-42, which is correct in the city and at night out here and flatly wrong at
   * noon: an overcast midday sky is the BRIGHTEST large surface any frame containing one has, and
   * it was arriving as 1538 cells of dark blue-grey over the top of a frontier noon (tallied at
   * seed 42 frame 300). CC.put tests `dist < f.dist[i]` strictly, so this file's 9.6e4 loses to it
   * everywhere the two overlap however late this element draws.
   *
   * 9.4e4 is used ONLY by the daylight branch below, so the night frame keeps sky.js's deck exactly
   * as it has it and nothing about the tuned hour moves. sky.js is not mine to edit; if it ever
   * learns the clock, this constant goes back to D_CLOUD and the branch stays. */
  var D_CLOUD_DAY = 9.4e4;

  /* The one published day number, from the painter that owns it — see surf_west.js's dFill. Two
   * definitions of "how much day is in the frame" is two clocks, and they disagree for one frame
   * every time the viewer presses T. */
  function dayFill() {
    if (!CC.SurfWest) return 0;
    return CC.SurfWest.dayFill;
  }
  var INK = [G_TICK, G_DOT, G_UNDER, G_DASH, G_COLON, G_TILDE, G_DQ, G_PLUS, G_EQ, G_HASH, G_PCT];
  function ink(t) { var i = (t * 11) | 0; return INK[i < 0 ? 0 : (i > 10 ? 10 : i)]; }

  var W_CLOUD = 0.1, W_HAZE = 0.3, W_WIND = 0.2, W_RAIN = 0;
  function bindWeather() {
    var p = CC.Weather ? CC.Weather.P : null;
    W_CLOUD = p ? p.cloud : 0.1;
    W_HAZE = p ? p.haze : 0.3;
    W_WIND = p ? p.wind : 0.2;
    W_RAIN = p ? p.rain : 0;
  }

  /* ---- camera basis, copied from sky.js so the two can never disagree ------------------------- */
  var CB = { fwx: 0, fwz: 1, rgx: 1, rgz: 0, half: 0.71, cols: 0, rows: 0,
             horizon: 0, eyeY: 1.7, scale: 1, colsPerTan: 1 };
  function setup(frame, cam) {
    bindWeather();
    var yaw = cam.yaw || 0, fov = cam.fov || 1.25;
    CB.fwx = Math.sin(yaw); CB.fwz = Math.cos(yaw);
    CB.rgx = Math.cos(yaw); CB.rgz = -Math.sin(yaw);
    CB.half = Math.tan(fov * 0.5);
    CB.cols = frame.cols; CB.rows = frame.rows;
    CB.horizon = cam.horizon !== undefined ? cam.horizon : frame.rows * 0.56;
    CB.eyeY = cam.eyeY !== undefined ? cam.eyeY : 1.7;
    CB.colsPerTan = frame.cols / (2 * CB.half);
    CB.scale = cam.scaleY !== undefined ? cam.scaleY : CB.colsPerTan * (cam.cellAspect || 0.5625);
  }

  /* Planar projection of a DIRECTION (not a point): w is the forward component, and a direction
   * with w <= 0 is behind the eye plane. */
  var VP = { ok: 0, x: 0, y: 0, w: 0 };
  function proj(dx, dy, dz) {
    var w = dx * CB.fwx + dz * CB.fwz;
    if (w <= 0.02) { VP.ok = 0; return VP; }
    var s = dx * CB.rgx + dz * CB.rgz;
    VP.ok = 1; VP.w = w;
    VP.x = (s / w) * CB.colsPerTan + CB.cols * 0.5;
    VP.y = CB.horizon - (dy / w) * CB.scale;
    return VP;
  }

  function plot(frame, x, y, ch, col, lum, d) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= CB.cols || y >= CB.rows) return;
    if (lum < 3) return;
    put(frame, x, y, ch, col, lum > 255 ? 255 : lum | 0, d, 3);
  }

  function sunAz() { return CC.SurfWest ? CC.SurfWest.SUN_AZ : -0.5; }

  /* ================================================================================= the sun ===
   * ALTITUDE 0.16 RAD, and that is nine degrees rather than the half a degree a sun "on the
   * horizon" actually sits at. The reason is occlusion: a two-storey false front sixty metres down
   * the street subtends about six degrees, so a sun placed where it physically belongs is behind
   * the town in every frame the walk ever takes and the one object the whole lighting model refers
   * to is never seen. Nine degrees clears a seven-metre roofline at forty-four metres, which is
   * where the street usually opens out, and it still reads as low — the give-away for a low sun is
   * not its height, it is that everything vertical is rimmed down one side, and surf_west.js has
   * already done that.
   *
   * IT IS NOT AN EMITTER, IT IS A DISC WITH A HALO. A filled bright circle at this size prints as
   * a hole punched in the sky; what makes a sun read is the graded surround, so most of the cells
   * here are the halo and the disc itself is small. */
  var SUN_ALT = 0.16, SUN_R = 0.030;

  /* ---- AND IT CLIMBS, once there is a day for it to climb through ------------------------------
   * The paragraph above is an argument for pinning the sun at nine degrees, and it is right about
   * dusk and wrong about every other hour: at noon the clock puts the sun at 0.95 rad, the frame
   * reaches atan(horizon/scale) = 0.56 rad, and a sun drawn at 0.16 is an amber blob sitting on the
   * rooftops in the middle of the day. What the eye reads noon by is that there is NO sun in the
   * picture and everything below is lit from straight above.
   *
   * So the drawn altitude is the pinned one blended toward the clock's by the day fill. At dFill 0
   * it is exactly 0.16 and the tuned frame is untouched — including at night, where this element
   * currently draws a halo and where removing it is not mine to decide. At dusk (dFill 0.055) it
   * moves by a seventh of a degree. By morning the sun has climbed out of the top of the frame and
   * plot() clips it, which costs nothing and is the correct picture. */
  function drawAlt() {
    var live = CC.SurfWest ? CC.SurfWest.SUN_ALT : SUN_ALT;
    return SUN_ALT + (live - SUN_ALT) * dayFill();
  }

  CC.ELEMENTS.push({
    name: 'west-sun',
    layer: 5,
    world: 'west',
    draw: function (frame, cam) {
      setup(frame, cam);
      var al = drawAlt(), az = sunAz(), ca = Math.cos(al);
      var p = proj(Math.sin(az) * ca, Math.sin(al), Math.cos(az) * ca);
      if (!p.ok) return;
      var cx = p.x, cy = p.y;
      var rw = SUN_R * CB.colsPerTan / p.w, rh = SUN_R * CB.scale / p.w;
      if (rw < 0.6) return;

      /* Cloud takes the sun out, haze does not — it spreads it. Under a full overcast there is no
       * disc at all and the halo is the whole of it, which is exactly what a sun behind a deck
       * looks like and is the only way this sky changes rather than being recoloured. */
      var disc = 1.20 - 1.25 * W_CLOUD; if (disc > 1) disc = 1; if (disc < 0) disc = 0;
      var halo = clamp(0.35 + 0.85 * W_HAZE + 0.5 * W_CLOUD, 0, 1.35) * (0.35 + 0.65 * disc);

      /* The halo, dithered, out to four radii and falling off as the square. It is drawn first so
       * the disc always wins the cells they share. */
      var hr = 4.4, hiw = Math.ceil(rw * hr), hih = Math.ceil(rh * hr), hx, hy, hu, hv, h2;
      if (hiw > CB.cols) hiw = CB.cols;
      if (hih > CB.rows) hih = CB.rows;
      for (hy = -hih; hy <= hih; hy++) {
        for (hx = -hiw; hx <= hiw; hx++) {
          hu = hx / rw; hv = hy / rh; h2 = hu * hu + hv * hv;
          if (h2 < 0.98 || h2 > hr * hr) continue;
          var fall = 1 - (Math.sqrt(h2) - 1) / (hr - 1);
          fall = fall * fall;
          if (hash2(hx, hy, 0x5A17) > 0.30 + 0.62 * fall) continue;
          plot(frame, cx + hx, cy + hy,
               fall > 0.6 ? G_EQ : (fall > 0.3 ? G_DASH : G_TICK),
               fall > 0.55 ? P.amber : P.ember,
               (166 * fall + 20) * halo, D_SUN);
        }
      }
      if (disc <= 0.03) return;

      var iw = Math.ceil(rw), ih = Math.ceil(rh), dx, dy;
      for (dy = -ih; dy <= ih; dy++) {
        for (dx = -iw; dx <= iw; dx++) {
          var u = dx / rw, v = dy / rh, r2 = u * u + v * v;
          if (r2 > 1.02) continue;
          /* Flattened at the base by refraction — the classic squashed setting sun — and banded
           * across by whatever is on the horizon. Both are cheap and both are the difference
           * between a sun and a circle. */
          var bandK = hash2(0, Math.floor(dy * 1.3), 0x77) < 0.22 ? 0.42 : 1;
          plot(frame, cx + dx, cy + dy, r2 > 0.78 ? G_o : G_8,
               r2 > 0.86 ? P.amber : P.pure, (236 - 40 * r2) * disc * bandK, D_SUN);
        }
      }
    }
  });

  /* ============================================================================== cloud bars ===
   * HORIZONTAL, and that is the whole design. Cumulus over a city is a lumpy field; what a desert
   * sunset has is altocumulus in long parallel bars, lit orange along the bottom edge and dark
   * slate on top, stacked up from the horizon. That underlit edge is the single most recognisable
   * thing in the sky at this hour and it is one row of cells per bar.
   *
   * The field is sampled in ELEVATION and BEARING rather than in a direction vector, because bars
   * are a function of height above the horizon and nothing else — a noise in three dimensions
   * would give clouds that are not bars. */
  var NBAR = 7;

  CC.ELEMENTS.push({
    name: 'west-cloudbars',
    layer: 6,
    world: 'west',
    draw: function (frame, cam, t) {
      setup(frame, cam);
      if (W_CLOUD < 0.03) return;
      var dF = dayFill();
      var tt = CC.reducedMotion ? 0 : t * (0.004 + 0.016 * W_WIND);
      var az0 = sunAz();
      /* One pass over the sky rows of the frame. Cheaper than walking a sphere and exact: every
       * cell that could carry a bar is a cell of this frame. */
      var x, y, y0 = 0, y1 = Math.floor(CB.horizon);
      if (y1 > CB.rows) y1 = CB.rows;
      for (x = 0; x < CB.cols; x++) {
        var sp = (2 * (x + 0.5) / CB.cols - 1) * CB.half;
        var bear = (cam.yaw || 0) + Math.atan(sp);
        var da = bear - az0;
        da = Math.atan2(Math.sin(da), Math.cos(da));
        var west = 1 - Math.abs(da) / Math.PI;
        for (y = y0; y < y1; y++) {
          /* Elevation of this row, in radians, from the same projection the caster uses. */
          var el = (CB.horizon - y - 0.5) / CB.scale;
          if (el < 0.02 || el > 0.62) continue;
          /* Bars: a sine ladder in elevation, jittered by a slow noise so they are not ruled. The
           * ladder's pitch grows with elevation because perspective foreshortens a flat deck —
           * bars near the horizon are far away and crowd together. */
          var lad = Math.log(el * 14 + 1) * NBAR + vnoise(bear * 1.7 + tt * 3, 0x81) * 1.4;
          var fb = lad - Math.floor(lad);
          /* CONTINUOUS, NOT HASHED, and this is the photosensitivity rule rather than a taste.
           * A hash keyed on a quantised time re-rolls whether a rung is cloud, so a cell steps from
           * lum 150 to 0 between two frames — 59% of full scale in one frame, against a limit of a
           * third. A value noise drifting through the same range moves the EDGE of a bar instead:
           * any given cell changes state at most a couple of times as the edge sweeps over it, at
           * the drift rate, which is 0.004-0.02 of a cycle a second. */
          var body = vnoise(Math.floor(lad) * 3.1 + bear * 2.0 + tt * 3, 0x9C1);
          /* Not every rung of the ladder is cloud; cover is the weather. */
          /* Cover is the weather at every hour; what the DAY changes is that the cells inside a
           * cloud get painted. See the two branches below. */
          if (body > 0.22 + 0.68 * W_CLOUD) continue;
          /* Keyed on the SKY, not on the glass. hash2(x, y) welds the dither to the screen, so
           * turning the camera slides the cloud through a fixed stipple — the same bug the star
           * field had before surfaces.js started hashing on bearing and elevation. */
          var d = hash2(Math.floor(bear * 220), Math.floor(el * 900), 0x33B);
          if (fb > 0.66) continue;                       // the gap between two bars
          /* ---- THE DECK TURNS OVER WITH THE DAY -----------------------------------------------
           * A cloud at dusk is lit FROM UNDERNEATH and is a silhouette everywhere else, which is
           * what the two night branches draw and why they are the best thing in this sky. A cloud
           * at noon is the exact inverse: lit from ABOVE, so the top of every bar is the brightest
           * white in the frame and the underside is the shaded part — and it is OPAQUE, where a
           * dusk cloud is a shape you read off one bright edge.
           *
           * Both facts are drawn on the same ladder, because the geometry of a stacked deck does
           * not change with the hour; what changes is which end of each bar has the light on it and
           * how much of the bar gets ink. The crossover is dithered on the day fill exactly as the
           * walls are, so the sky turns over cell by cell rather than as one plane.
           *
           * The day cells go in at D_CLOUD_DAY so they win against sky.js's own deck; the night
           * cells keep D_CLOUD and lose to it, which is the shipped behaviour. */
          var isDay = hash2(Math.floor(bear * 111), Math.floor(el * 640), 0x6B2) < dF;
          if (isDay) {
            /* Opaque: 0.86 of the bar takes ink against the night branch's 0.16-0.34. A midday deck
             * with holes in it reads as a stipple over black, which is what the dusk treatment
             * looked like when the day arrived and it did not survive being looked at. */
            if (d > 0.86) continue;
            if (fb > 0.50) {
              /* The underside, in shade. Never `shadow` — core.js lifts shadow by day precisely
               * because a shaded thing under a bright sky is filled — so it is stone going to
               * indigo, which is the palette's own "shade with the sky in it". */
              plot(frame, x, y, ink(0.30 + 0.26 * d), d > 0.55 ? P.stone : P.indigo,
                   (54 + 46 * d) * (0.5 + 0.5 * W_CLOUD), D_CLOUD_DAY);
            } else {
              /* The top, in full sun. This is the brightest large surface a frontier noon has and
               * it is written like one: white at the crown, sand where the bar thins, on the heavy
               * half of the ink ramp. */
              /* THE TOP IS HELD UNDER THE SKY IT SITS IN, and that is a photosensitivity number
               * before it is an aesthetic one. `body` jumps discontinuously whenever the ladder's
               * integer part steps, so a whole rung of the deck can switch on or off between two
               * frames — which is fine when the rung is a dark silhouette against a dark sky (26 to
               * 56, the night branch below) and is a large-area step when it is a white mass
               * against a blue one. Measured with tools/west-flicker.cjs pinned at noon, this
               * element carried the frontier's worst per-cell step from 79.2% to 84.3%; written at
               * 180 rather than 220 it is back inside surf_west.js's own day sky ladder, which
               * tops out at 214, and the deck stops being able to out-step the dome behind it. */
              var top = 1 - fb / 0.50;
              plot(frame, x, y, ink(0.52 + 0.34 * top + 0.14 * (d - 0.5)),
                   top > 0.45 ? P.white : P.sand,
                   (104 + 72 * top) * (0.76 + 0.30 * d), D_CLOUD_DAY);
            }
            continue;
          }
          if (fb > 0.50) {
            /* THE LIT UNDERSIDE. One or two rows, ember going to amber where the sun is, and the
             * brightest thing in the sky after the disc itself. */
            if (d > 0.72) continue;
            plot(frame, x, y, G_DASH, west > 0.68 ? P.amber : P.ember,
                 (86 + 132 * west) * (0.7 + 0.5 * d), D_CLOUD);
          } else {
            /* The body: dark, and mostly not painted at all. A cloud at dusk is a silhouette. */
            if (d > 0.34 - 0.18 * fb) continue;
            plot(frame, x, y, fb > 0.28 ? G_TICK : G_DOT, P.slate,
                 (26 + 30 * (1 - fb)) * (0.6 + 0.6 * d), D_CLOUD);
          }
        }
      }
    }
  });

  /* ========================================================================= the deck by day ===
   * A REPAIR, and a narrow one. sky.js's `cloudbase` is the only element in this project that can
   * cover the whole slot, and it paints in P.shadow at lum 26-42 on purpose — its own comment
   * explains that slate at that lum printed as a LIT cell and turned the sky into the brightest
   * flat area in a picture whose subject is a dark street. That is right in the city, right on this
   * frontier at night, and wrong at noon by the widest margin anything in this world gets wrong:
   * an overcast midday sky is the brightest large surface any frame containing one has, and 1538
   * cells of dark blue-grey were arriving over the top of a frontier noon (tallied at seed 42
   * frame 300, which is 13% of the whole frame).
   *
   * sky.js is not mine to edit, and the deck belongs to two worlds so it should not simply be
   * turned off out here either. So this walks the slot AFTER cloudbase and after the bars, finds
   * the cells that are still the night deck, and repaints them as the sky they are covering. It
   * identifies them by what they are — a cell painted by an element, in P.shadow, at a depth out
   * past the world — rather than by a constant copied from another file, so it repairs the deck and
   * nothing else, and it cannot touch a bird (D_BIRD is 8.0e4, inside the test) or a facade.
   *
   * It costs nothing at night: dF is 0 and the function returns on its first line.
   *
   * WHAT I WOULD RATHER HAVE DONE: give cloudbase's `base`, `hue` and `dens` a daylight branch off
   * CC.Daylight, the way this file's own deck now has one. That is four lines in sky.js and it
   * would fix the city's noon as well, which has the same fault for the same reason.
   * ========================================================================================== */
  CC.ELEMENTS.push({
    name: 'west-daysky',
    layer: 7,
    world: 'west',
    draw: function (frame, cam) {
      var dF = dayFill();
      if (dF <= 0.002) return;
      setup(frame, cam);
      var cols = frame.cols, col = frame.col, lum = frame.lum, dist = frame.dist, kind = frame.kind;
      var maxRow = Math.floor(CB.horizon); if (maxRow > CB.rows - 1) maxRow = CB.rows - 1;
      var x, y, i, h;
      for (y = 0; y <= maxRow; y++) {
        for (x = 0; x < cols; x++) {
          i = y * cols + x;
          if (kind[i] !== 3 || col[i] !== P.shadow || dist[i] < 9.0e4) continue;
          /* Dithered against dF on the SKY rather than on the screen, so the repair crosses over
           * with the hour instead of switching, and so it does not crawl when the camera turns.
           *
           * THE ANCHOR IS THE PROJECTION'S OWN, and it was a hardcoded 260. Turning the camera by
           * dyaw slides a fixed world bearing LEFT by colsPerTan * dyaw columns — that is proj()'s
           * own arithmetic, VP.x = (s/w) * colsPerTan + cols/2 — so x + yaw * colsPerTan is the
           * quantity that stands still while the frame moves under it. 260 is that number for no
           * grid this build ever draws: colsPerTan is cols / (2 tan(fov/2)), which is 84 at 120
           * columns, 139 at 200 and 279 at 400, so the constant over-compensated by 87% at the
           * default size and under-compensated by 7% at the largest, and the comment above claimed
           * the opposite of what the code did at the size it is drawn at. The live value is exact
           * at the centre of the frame and 34% short at the edges, where the tangent stretches and
           * the true rate is colsPerTan * sec^2(fov/2) — the same linearisation proj() lives with,
           * and well inside a dither's own noise. Parenthesised because `+` binds tighter than `|`:
           * the |0 was always applying to the whole sum, which is what was wanted and what nothing
           * said. */
          h = hash2((x + (cam.yaw || 0) * CB.colsPerTan) | 0, y, 0x4D77);
          if (h > dF) continue;
          /* The deck's own depth is kept in the cell, and the repair goes in one metre nearer so a
           * later pass of cloudbase in the same frame cannot win it back. Written as ice going to
           * white with height, which is the same pair surf_west.js's day sky ladder uses — this is
           * the same sky, seen through a hole in a deck that is lit from above. */
          var up = 1 - y / (maxRow + 1);
          /* WHITE LEADS AND ICE FOLLOWS. ice is 90,240,255 — the most saturated swatch in the
           * table — and at the lums a daylight sky wants it prints as a cyan that no sky has ever
           * been; written as the majority it turned the top of the frame turquoise. It is the right
           * swatch for the COLD part of a dome (core.js lifts it 0.36 -> 0.66 for exactly that) but
           * a repaired deck cell is a HOLE IN A CLOUD, and the light coming through one is white
           * with a little of the sky in it. So ice is a third of the cells and it goes to the ones
           * high in the frame, where the dome actually is blue. */
          plot(frame, x, y, ink(0.30 + 0.26 * up + 0.20 * h),
               h < 0.60 ? P.white : (up > 0.45 ? P.ice : P.stone),
               (96 + 74 * up) * (0.80 + 0.34 * h), dist[i] - 1);
        }
      }
    }
  });

  /* =================================================================================== birds ===
   * Three turkey vultures on one thermal, which is a real thing and also the cheapest way to put a
   * living creature in the sky: a vulture on a thermal does not flap, so the whole animation is a
   * circle and a shape that changes with the angle you see it from. Two cells each, most of the
   * time. */
  var NBIRD = 3;
  var bSeed = 0;

  CC.ELEMENTS.push({
    name: 'west-birds',
    layer: 9,
    world: 'west',
    init: function (city, rng) {
      /* One draw from the shared stream, and it is declared: this element needs a thermal centre
       * that is not the same in every town, and the city seed alone would put the birds over the
       * same corner of every map. One draw shifts the streams below layer 9, which is optics only
       * in this world. */
      bSeed = (rng() * 4294967296) | 0;
    },
    draw: function (frame, cam, t) {
      setup(frame, cam);
      if (W_RAIN > 0.35) return;                  // nothing is up there in the wet
      var tt = CC.reducedMotion ? 12.0 : t;
      for (var i = 0; i < NBIRD; i++) {
        var ph = tt * (0.055 + 0.014 * i) + i * 2.3 + (bSeed & 255) * 0.01;
        /* The thermal: a circle in azimuth about a fixed bearing, slowly rising and falling. */
        var az = -1.1 + (bSeed >> 8 & 255) * 0.012 + Math.sin(ph) * 0.30;
        var alt = 0.30 + 0.09 * i + Math.cos(ph * 0.7) * 0.05;
        var ca = Math.cos(alt);
        var p = proj(Math.sin(az) * ca, Math.sin(alt), Math.cos(az) * ca);
        if (!p.ok) continue;
        /* The silhouette turns with the bird: broadside it is a shallow V three cells wide,
         * end-on it is a single dot. cos of the phase IS the aspect. */
        var asp = Math.abs(Math.cos(ph));
        var x = p.x, y = p.y;
        /* A vulture against a bright sky is a SILHOUETTE, and slate at lum 62 is neither: by
         * day slate prints at gain 0.78 and the bird comes out lighter than the cloud behind it.
         * timber at a low lum is the darkest warm ink available and reads as a shape with the sun
         * behind it, which is what one actually looks like. */
        var dF = dayFill();
        var bc = dF > 0.5 ? P.timber : P.slate, bl = 62 - 22 * dF;
        plot(frame, x, y, dF > 0.5 ? G_TILDE : G_DOT, bc, bl, D_BIRD);
        if (asp > 0.45) {
          plot(frame, x - 1, y - (asp > 0.8 ? 1 : 0), G_TICK, bc, bl - 8, D_BIRD);
          plot(frame, x + 1, y - (asp > 0.8 ? 1 : 0), G_QUOTE, bc, bl - 8, D_BIRD);
        }
      }
    }
  });

})(typeof CC !== 'undefined' ? CC : require('../core.js'));
