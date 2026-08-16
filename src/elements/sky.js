/* CyberCity sky — everything that lives above the rooftop line: a cloud deck, stars, a low moon,
 * far aircraft, obstruction beacons on towers past the end of the world, searchlights, advertising
 * blimps, delivery drones, and — rarely — a flock or an orbital burn.
 *
 * WEATHER IS THE SUBJECT UP HERE, not a filter over it. Every object in this file is a different
 * object under cloud, under mist and under a clear sky: the stars are masked by a deck rather than
 * dimmed by it, the moon trades its disc for a halo and then loses both, the airliners go out
 * because they are above the weather, and a searchlight stops being a dot on a far roof and
 * becomes a visible shaft. The parameters all come off CC.Weather.P — see the weather block below
 * for why these read the raw directions where the rest of the build reads rel().
 *
 * DEPTH. Every object in this file is further away than the raycaster can march (Surf.FOG_END is
 * 125 m, so no facade cell ever carries a larger dist). Handing CC.put a distance beyond that is
 * what makes the whole batch self-occluding for free: it survives only where the world pass left
 * dist === Infinity. Nothing here needs to know the skyline, and nothing here can bleed through
 * a wall.
 *
 * THE SLOT IS TINY, AND THAT IS WHAT SIZES THIS FILE. Measured on the headless harness at 200x60,
 * seeds 1 and 3: sky is 5.8-6.7% of the frame and it is not spread around the top of the screen —
 * it is one vertical wedge 12-24 columns wide at the canyon's vanishing point, running from the
 * horizon to the top edge. So the visible sky is a window about 0.15 rad wide, and an object at a
 * uniformly random bearing lands in it 2.4% of the time, i.e. never. Two consequences run through
 * everything below:
 *   - bearings are drawn on the STREET AXES (the lattice runs along x and z, so the camera's yaw
 *     is near-cardinal on every leg of the walk) plus a small jitter, not uniformly on the circle;
 *   - the traffic TRAVELS rather than hovering, so each craft sweeps its own bearing through the
 *     window and back out again. A parked sky empties out the moment the camera turns a corner.
 *
 * ANCHORING. Stars and the moon are directions, not points, so they stay welded to the sky as the
 * camera walks and yaws. The traffic is anchored to a bearing at a distance from the CAMERA rather
 * than to a fixed world point: at 100-2000 m the parallax of a 1.6 m/s walk is under a tenth of a
 * cell per second, so the two are indistinguishable — but a world-fixed craft would be left behind
 * for good after four minutes of an endless walk.
 */
(function (CC) {
  'use strict';

  var P = CC.P, g = CC.g, put = CC.put, hash2 = CC.hash2, hash1 = CC.hash1, vnoise = CC.vnoise;

  /* g() is a string-keyed lookup and these are hit thousands of times per frame. */
  var G_DOT = g('.'), G_COLON = g(':'), G_QUOTE = g("'"), G_TICK = g('`'),
      G_DASH = g('-'), G_EQ = g('='), G_PLUS = g('+'), G_PIPE = g('|'), G_SLASH = g('/'),
      G_BSLASH = g('\\'), G_HASH = g('#'), G_UNDER = g('_'),
      G_8 = g('8'), G_OO = g('O'), G_o = g('o'), G_0 = g('0'), G_X = g('X'), G_Z = g('Z'),
      G_W = g('W'), G_M = g('M'), G_N = g('N'), G_H = g('H'), G_A = g('A'), G_V = g('V'),
      G_K = g('K'), G_Y = g('Y'), G_U = g('U'), G_TILDE = g('~'), G_CARET = g('^'),
      G_COMMA = g(','), G_STAR = g('*');

  var TAU = 6.283185307, QUARTER = 1.570796327;

  /* Beyond Surf.FOG_END, so a facade always wins the depth test. The three are ORDERED, and the
   * order is load-bearing: the moon occludes the cloud deck, the cloud deck occludes a star, and
   * none of the element layers has to know about any of the others to make that happen. A star at
   * D_STAR simply loses the depth test against a cloud cell already written at D_CLOUD, which is
   * the entire overcast mechanism — see the star draw, which only has to handle the THIN cloud the
   * deck was too sparse to paint. */
  var D_STAR = 1.0e5, D_CLOUD = 9.5e4, D_MOON = 9.0e4;

  /* ---- weather --------------------------------------------------------------------------------
   * The sky is the one place in the build where the weather is not a modifier on top of a look but
   * the look itself: a star field, a moon and a searchlight are three completely different objects
   * under cloud, under mist and under a clear sky, and the transitions between them are the best
   * drama available up here for the price.
   *
   * These are RAW parameters, deliberately, and that is a departure from the migration rule
   * weather_state.js sets out. rel() exists so an element that was TUNED under the 'rain' preset
   * keeps its tuning; these five are not tuning, they are the axes the new behaviour is defined
   * along — "gone entirely in mist" is a statement about fog reaching 1.0, and dividing it by the
   * 0.30 fog the reference preset happens to carry would make it a statement about nothing.
   * Where an EXISTING tuned constant is scaled — the searchlight's mote brightness — rel() is used
   * and is named as such at the site. */
  var W_CLOUD = 0.75, W_FOG = 0.30, W_HAZE = 0.40, W_RAIN = 0.65, W_WIND = 0.55, W_FOGREL = 1;
  function bindWeather() {
    var Wm = CC.Weather, p = Wm ? Wm.P : null;
    W_CLOUD = p ? p.cloud : 0.75;
    W_FOG = p ? p.fog : 0.30;
    W_HAZE = p ? p.haze : 0.40;
    W_RAIN = p ? p.rain : 0.65;
    W_WIND = p ? p.wind : 0.55;
    W_FOGREL = Wm ? Wm.rel('fog') : 1;
  }

  /* ---- one cloud deck -------------------------------------------------------------------------
   * ONE field, read by the scud that paints the cloud and by the stars that hide behind it, so the
   * two can never disagree about where the gaps are. Two independent fields would have produced
   * stars shining out of the middle of a painted cloud, which is the single most obvious way to
   * announce that a sky is made of unrelated layers.
   *
   * The inputs are the DIRECTION's own components rather than an azimuth, for two reasons: it is
   * welded to the sky exactly the way the star field is — turn the camera and the deck stays put —
   * and it costs no atan2 in a loop that may run over every sky cell in the frame.
   *
   * The whole deck slides downwind, which is the only motion up here that responds to the weather
   * rather than to a clock, and it is what makes a star wink out and come back. */
  /* THE FREQUENCIES ARE SET BY THE SLOT, NOT BY THE SPHERE. The first cut ran at 2.6 cycles per
   * radian, which is a perfectly good cloudscape over a whole sky and completely wrong for this
   * one: the visible sky here is a wedge about 0.15 rad wide, so across the entire slot the field
   * moved through less than half a period and the deck was either all on or all off with nothing
   * but the dither varying inside it. It read as static, not as cloud. At 9 per radian the slot
   * holds a full clump and a gap, which is the least that reads as weather having a shape. */
  function cloudAt(dx, dy, dz, t) {
    /* Reduced motion stops the deck outright rather than slowing it. A field this large moving
     * slowly is worse than one not moving at all: it is the whole sky drifting, which is exactly
     * the kind of large-area motion the flag exists to remove, and a still overcast is still a
     * perfectly good overcast. */
    var d = CC.reducedMotion ? 0 : t * (0.045 + 0.14 * W_WIND);
    return vnoise(dx * 9.0 + dz * 2.5 + d, 0x6C1) * 0.56 +
           vnoise(dz * 7.5 - dx * 3.0 + dy * 6.5 - d * 0.62, 0x6C2) * 0.44;
  }
  /* Where the deck starts. The field is a sum of two value noises, so it piles up around 0.5 and a
   * threshold swept across that range covers the sky far faster than a linear read of it suggests.
   * These two constants were therefore FITTED by counting covered samples over the whole sphere,
   * not chosen: they give 2% cover on a clear night (a wisp or two), 34% at drizzle, 79% at the
   * 'rain' preset the build was tuned in, and 97% — a lid, with no hole anywhere — under storm. */
  function cloudThr() { return 0.88 - W_CLOUD * 0.72; }

  /* ---- camera basis, rebuilt once per element draw --------------------------------------------
   * This mirrors raycast.js exactly, including its reconciliation of the vertical scale to the
   * horizontal fov. If the two ever disagree the moon drifts off the rooftop it was placed behind,
   * so the derivation is copied rather than approximated. */
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

  /* Planar projection, matching the raycaster's un-normalised ray: w IS the forward-axis distance
   * and needs no cosine fix-up, so a blimp's hull stays a straight-sided ellipse at the frame edge
   * instead of bowing. ey is metres above the EYE, not above the street. */
  var VP = { ok: 0, x: 0, y: 0, w: 0, d: 0 };
  function proj(ex, ey, ez) {
    VP.ok = 0;
    var w = ex * CB.fwx + ez * CB.fwz;
    if (w <= 1e-3) return VP;                        // behind the camera, or exactly abeam
    var sp = (ex * CB.rgx + ez * CB.rgz) / w;
    if (sp > 8 * CB.half || sp < -8 * CB.half) return VP;
    VP.x = (sp / CB.half + 1) * CB.cols * 0.5 - 0.5;
    VP.y = CB.horizon - ey * CB.scale / w;
    VP.w = w;
    VP.d = w * Math.sqrt(1 + sp * sp);               // radial, which is what frame.dist holds
    VP.ok = 1;
    return VP;
  }

  /* Rounding and bounds live here rather than in CC.put: put() coerces with |0, which truncates
   * toward zero, so an object at x = -0.4 would reappear glued to column 0. */
  function plot(f, x, y, ch, col, lum, dist) {
    if (lum < 3 || ch === 0) return;
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= CB.cols || y >= CB.rows) return;
    if (y > CB.horizon) return;                      // nothing here exists below the skyline
    put(f, x, y, ch, col, lum, dist);
  }

  /* Bearings below are dealt round the four street axes as `i * QUARTER + jitter` rather than
   * rolled uniformly. See the header: the sky window is ~0.15 rad wide and always sits on the axis
   * the camera is walking, so dealing them is the difference between traffic that is occasionally
   * overhead and traffic that is statistically never seen at all. Dealing also beats rolling an
   * axis at random — with only a handful of craft, a random roll regularly leaves a whole quarter
   * of the city's sky empty for a whole seed.
   *
   * One private stream, so the look of the sky does not shift every time a sibling element file
   * lands ahead of this one and eats a different number of draws from the shared rng. */
  function fork(rng) { return CC.mulberry(((rng() * 4294967296) | 0) ^ 0x5C1E); }

  /* The elements added after this file first shipped seed themselves off the CITY instead, and the
   * reason is politeness to every module downstream: CC.ELEMENTS is init'd in layer order off ONE
   * shared rng, so an element that takes three draws from it at layer 7 shifts the stream under
   * the blimps, the rain, the crowd and every sign in the city. Nothing breaks — they all get
   * perfectly good numbers — but every tuned frame anybody else has looked at changes, and a
   * change like that has to be worth something. A city-derived stream costs the shared one
   * nothing and is just as deterministic. */
  function forkCity(city, salt) {
    return CC.mulberry((((city && city.seed !== undefined ? city.seed : 0) | 0) ^ salt) >>> 0);
  }

  /* ============================================================================== cloud deck ==
   * Low scud, and the only element in this file that can cover the whole slot. It exists because
   * the slot was the one part of the frame that never changed: whatever the weather did to the
   * road, the road's reflections and the rain, the sky above it stayed the same handful of stars.
   *
   * It is drawn as a DITHERED field over the sky cells the world pass left empty, never as a
   * filled sheet, and the two numbers that keep it honest are the dither (a bit under half the
   * covered cells) and the luminance (slate in the 20s, which prints as the coverage swatch it is
   * rather than as light). A solid deck at any brightness is a grey lid over a piece whose whole
   * subject is dark, and it was the first thing tried here.
   *
   * Reading frame.dist is a READ, and the only one in this file: it is the depth pre-test CC.put
   * would do anyway, hoisted out so that a clear night costs one array compare per sky cell rather
   * than a noise evaluation. Nothing is written except through put().
   * ========================================================================================== */
  CC.ELEMENTS.push({
    name: 'cloudbase',
    layer: 3,
    draw: function (frame, cam, t) {
      setup(frame, cam);
      /* Under about 0.4 the deck is a few wisps nobody would notice and 20 000 noise evaluations
       * a frame to draw them with. The stars keep their own thin-cloud mask below this. */
      if (W_CLOUD < 0.40) return;
      var thr = cloudThr(), cols = CB.cols;
      var maxRow = Math.floor(CB.horizon); if (maxRow > CB.rows - 1) maxRow = CB.rows - 1;
      /* Density and brightness both ride the cover, so the deck arrives as an overcast rather than
       * switching on at full strength the moment the threshold is crossed. */
      /* Measured down, not chosen. At 0.20 + 0.26 the deck cost 1.3 points of lit coverage on its
       * own — the whole budget for a single element, spent on the one thing in the frame that is
       * supposed to be a backdrop — and it reads the same here, because what makes a deck read is
       * the SHAPE of the field and not how many of its cells got painted. */
      var dens = 0.15 + 0.19 * W_CLOUD;
      /* THE SWATCH IS shadow AND THAT IS THE WHOLE BUDGET STORY. This was slate first, which is
       * the obvious choice and the wrong one: slate is the coverage swatch, printed UP at
       * EXPOSURE 2.00 precisely so a facade masses, so a cloud cell at lum 22 came out of the
       * print at 141 and counted as a LIT cell. Seven hundred of them turned the sky into the
       * brightest flat area in a picture whose subject is a dark street. shadow is the swatch for
       * "something is there and it is occluding" — same coverage, printed to a value the eye reads
       * as mass rather than as light. */
      var base = 26 + 16 * W_CLOUD;
      /* Where the sodium underglow is allowed: the bottom sixth of the sky, near the rooftops,
       * where ten thousand streetlights are actually pointing. */
      var lowRow = CB.horizon - CB.rows * 0.17;
      var dist = frame.dist, col, row, sp, dirx, dirz, dy, len, nx, ny, nz, v, i, lum, gl, hue;
      for (col = 0; col < cols; col++) {
        sp = ((col + 0.5) * 2 / cols - 1) * CB.half;
        dirx = CB.fwx + CB.rgx * sp; dirz = CB.fwz + CB.rgz * sp;
        for (row = 0; row <= maxRow; row++) {
          i = row * cols + col;
          if (dist[i] < D_CLOUD) continue;              // a rooftop, a blimp, the moon: not sky
          dy = (CB.horizon - row) / CB.scale;
          len = Math.sqrt(dirx * dirx + dirz * dirz + dy * dy);
          nx = dirx / len; ny = dy / len; nz = dirz / len;
          v = cloudAt(nx, ny, nz, t);
          if (v <= thr) continue;
          /* How far past the threshold this cell is, i.e. how deep into the cloud it is looking.
           * The core gets the heavier glyph; the edge gets a tick, which is what gives the deck a
           * ragged boundary instead of a contour line. */
          v = (v - thr) * 4; if (v > 1) v = 1;
          /* The dither RIDES that depth, and at a flat density it did not: a deck painted at one
           * probability everywhere has an edge as hard as its threshold and reads as a stencil.
           * Thinning the fringe to a tenth and massing the core to two fifths is what turns the
           * same cell budget into something with an inside and an outside.
           * The lattice is the DIRECTION, quantised — the same anchoring the field itself uses.
           * Keyed on (col,row) instead it would be welded to the viewport and the whole deck would
           * crawl with the camera while the cloud shape stayed put. */
          if (hash2((nx * 190) | 0, (ny * 260) | 0, 0x71C3) > dens * (0.30 + 1.2 * v)) continue;
          gl = v > 0.62 ? G_TILDE : (v > 0.3 ? G_DASH : G_TICK);
          lum = base * (0.55 + 0.75 * v);
          hue = P.shadow;
          /* The underside of a city's cloud base is lit by the city, and that is the whole reason
           * the sky over a town is orange. It is a MINORITY of the low cells and not a band: a
           * continuous amber strip along the rooftops is a sunset, and this is one in the morning
           * in the rain. Amber has to be given real luminance to survive its own print weight of
           * 0.19, so the cells that get it are counted rather than spread. */
          if (row > lowRow && v > 0.55 && hash2((nx * 190) | 0, (ny * 260) | 0, 0x71C4) < 0.30) {
            hue = P.amber; lum = 44 + 30 * v;
          }
          plot(frame, col, row, gl, hue, lum, D_CLOUD);
        }
      }
    }
  });

  /* =================================================================================== stars ==
   * surfaces.js already salts the sky with a very faint per-cell field. This is the second layer:
   * brighter stars fixed to the celestial sphere, so they hold still while the camera turns
   * instead of swimming with the view.
   * Altitudes are pushed low on purpose. The frame only reaches atan(horizon/scale) ~= 23 degrees
   * above the horizon, so a star placed higher is simply never rendered. 400 over the whole sphere
   * puts about ten of them in the slot, which is as many as 700 cells of sky will carry. */
  var NSTAR = 400;
  var stX, stY, stZ, stL, stC, stG, stPh, stTw;

  CC.ELEMENTS.push({
    name: 'stars',
    layer: 4,
    init: function (city, rng) {
      var r = fork(rng), i;
      stX = new Float32Array(NSTAR); stY = new Float32Array(NSTAR); stZ = new Float32Array(NSTAR);
      stL = new Float32Array(NSTAR); stC = new Uint8Array(NSTAR); stG = new Uint8Array(NSTAR);
      stPh = new Float32Array(NSTAR); stTw = new Float32Array(NSTAR);
      for (i = 0; i < NSTAR; i++) {
        var az = r() * TAU, u = r();
        var alt = 0.03 + u * u * 0.39;               // squared: crowded near the rooftop line
        var ca = Math.cos(alt);
        stX[i] = Math.sin(az) * ca; stY[i] = Math.sin(alt); stZ[i] = Math.cos(az) * ca;
        var m = r();
        // A magnitude curve, not a uniform spread: a sky of equally bright dots reads as noise.
        stL[i] = 30 + m * m * m * 118;
        stC[i] = m > 0.94 ? P.ice : (m > 0.55 ? P.white : P.slate);
        stG[i] = m > 0.97 ? G_PLUS : (m > 0.62 ? G_DOT : (r() < 0.5 ? G_QUOTE : G_TICK));
        stPh[i] = r() * 60;
        stTw[i] = 1;
      }
    },
    update: function (dt, t) {
      var still = CC.reducedMotion;
      for (var i = 0; i < NSTAR; i++)
        stTw[i] = still ? 0.88 : 0.52 + 0.48 * vnoise(t * 0.6 + stPh[i], 0x2A7 + i);
    },
    draw: function (frame, cam, t) {
      setup(frame, cam);
      /* Two separate things take the stars away, and they take them away differently.
       *
       * CLOUD is a MASK, not a dimmer: a star behind cloud is gone and the one in the gap beside it
       * is at full brightness. Dimming the whole field instead — which is what this did first —
       * reads as somebody turning the sky down, and the eye reads it as an exposure change rather
       * than as weather. The threshold sits slightly UNDER the deck's own, so the thin cloud the
       * scud was too sparse to paint still takes the stars behind it; the deck itself has already
       * taken the rest by winning the depth test at D_CLOUD.
       *
       * FOG is a dimmer, because that is what fog physically is between here and the star, and it
       * goes to zero: in mist there are no stars, only the glow of the street on the underside of
       * the murk.
       *
       * THE MASK HAS AN EDGE ON IT, though, and it is the last hard switch in this file. `> thr`
       * against a drifting noise field is a pass/fail test, so a star does not go behind cloud, it
       * is deleted: measured with this element alone on an empty frame, frozen camera, through
       * CC.Compose.post, the worst single-frame per-cell step was 51.0% of full scale under clear,
       * 56.5% under drizzle and 51.4% under rain (0.0% under mist, where the element returns at
       * the `vis` test above). One character cell at 0.07 Hz is nowhere near a photosensitivity
       * hazard, but it is exactly the "star field that switches off" the brief asks about, and the
       * cure is four lines: the last 0.05 of the approach to the threshold is a smoothstep on the
       * star's luminance instead of a cliff. The deck drifts at 0.045-0.185 field units per second
       * depending on the wind, so that ramp is between a quarter of a second and a second and a
       * half of fading — a star going behind a cloud edge, which is what it is. */
      var thr = cloudThr() - 0.05, FEATHER = 0.05;
      var vis = 1 - W_FOG * 1.25; if (vis <= 0) return; if (vis > 1) vis = 1;
      for (var i = 0; i < NSTAR; i++) {
        var p = proj(stX[i], stY[i], stZ[i]);
        if (!p.ok) continue;
        var m = (thr - cloudAt(stX[i], stY[i], stZ[i], t)) / FEATHER;
        if (m <= 0) continue;
        if (m > 1) m = 1; else m = m * m * (3 - 2 * m);
        plot(frame, p.x, p.y, stG[i], stC[i], stL[i] * stTw[i] * vis * m, D_STAR);
      }
    }
  });

  /* ==================================================================================== moon ==
   * One moon, low, sitting at the end of the avenue. The bearing is NOT random: the only sky the
   * viewer ever sees is the wedge straight down the street they are walking, so a moon placed on
   * any other bearing is a moon nobody will ever look at. It gets the real lunar drift rate
   * (~0.07 mrad/s) and nothing more — a moon you can watch move is not a moon.
   * Drawn as a crescent plus a dim rim. The rim is what makes the whole disc read; leaving the
   * shadowed three-quarters black is what stops it becoming the brightest slab in the frame. */
  var moAz0 = 0, moAlt = 0.2, moR = 0.030, moSeed = 0, moPhase = 0.42, moAz = 0;

  CC.ELEMENTS.push({
    name: 'moon',
    layer: 5,
    init: function (city, rng) {
      var r = fork(rng);
      moAz0 = (r() - 0.5) * 0.26;                    // the avenue runs +z, which is yaw 0
      moAlt = 0.17 + r() * 0.08;                     // ~10-14 degrees: rooftop height, not overhead
      moR = 0.026 + r() * 0.008;
      moSeed = (r() * 4294967296) | 0;
      // Terminator offset, held past 0.30 so the lit sliver never closes into a dead disc.
      moPhase = 0.34 + r() * 0.24;
      moAz = moAz0;
    },
    update: function (dt, t) {
      moAz = moAz0 + (CC.reducedMotion ? 0 : t * 7.3e-5);
    },
    draw: function (frame, cam) {
      setup(frame, cam);
      var ca = Math.cos(moAlt);
      var p = proj(Math.sin(moAz) * ca, Math.sin(moAlt), Math.cos(moAz) * ca);
      if (!p.ok) return;
      var cx = p.x, cy = p.y;
      var rw = moR * CB.colsPerTan / p.w, rh = moR * CB.scale / p.w;
      if (rw < 1 || cx + rw < 0 || cx - rw >= CB.cols) return;

      /* The moon under weather, which is two effects and not one.
       *
       * The DISC goes out under cloud. Not gradually and not politely: at the 'rain' preset it is
       * already a fifth of itself and by the time the cover is a lid there is no moon at all,
       * which is correct and is also the only way the sky over this city can ever look like it
       * has changed rather than been recoloured.
       *
       * The HALO is the opposite shape: it needs something to scatter off, so it is nothing on a
       * clear night, strongest through thin cloud and haze, and gone again once the deck is thick
       * enough to swallow the moon whole. That rise-and-fall is why it is a product of the haze
       * and the REMAINING disc rather than a function of either alone. */
      var disc = 1.18 - 1.28 * W_CLOUD; if (disc <= 0.02) return; if (disc > 1) disc = 1;
      /* sqrt, not the disc itself. Multiplying by disc linearly made the halo strongest exactly
       * where the moon was already bright and killed it at the mid-cover the effect belongs to —
       * the square root keeps a scattering term that is still worth something when the disc behind
       * it is down to a quarter, which is what a moon in mist actually looks like. */
      var halo = (W_HAZE * 0.75 + W_CLOUD * 0.45) * Math.sqrt(disc); if (halo > 1) halo = 1;
      if (halo > 0.10) {
        /* A ring, dithered, and never a filled disc — a solid glow round the moon is the one thing
         * that would make the brightest object in the frame twice the size. It is drawn FIRST so
         * the disc itself always wins the cells they share. */
        var hr = 2.1, hiw = Math.ceil(rw * hr), hih = Math.ceil(rh * hr), hx, hy, hu, hv, h2;
        for (hy = -hih; hy <= hih; hy++) {
          for (hx = -hiw; hx <= hiw; hx++) {
            hu = hx / rw; hv = hy / rh; h2 = hu * hu + hv * hv;
            if (h2 < 1.05 || h2 > hr * hr) continue;
            if (hash2(hx, hy, moSeed ^ 0x5D) > 0.34) continue;
            /* Falls off from the limb outward, so the ring has an inside edge and a soft outside
             * one — the way a real halo sits against the murk that makes it. */
            plot(frame, cx + hx, cy + hy, h2 > 2.6 ? G_DOT : G_COMMA, P.ice,
                 70 * halo * (1 - (h2 - 1.05) / (hr * hr - 1.05)), D_MOON + 1);
          }
        }
      }

      var iw = Math.ceil(rw), ih = Math.ceil(rh), dx, dy;
      for (dy = -ih; dy <= ih; dy++) {
        for (dx = -iw; dx <= iw; dx++) {
          var u = dx / rw, v = dy / rh, r2 = u * u + v * v;
          if (r2 > 1.02) continue;
          var su = u + moPhase;
          if (su * su + v * v < 1.0) {
            /* Earthshine: the unlit disc is a sparse rim, never a filled grey circle. */
            if (r2 > 0.72 && hash2(dx, dy, moSeed ^ 0x3B) < 0.55)
              plot(frame, cx + dx, cy + dy, G_DOT, P.slate, 13 * disc, D_MOON);
            continue;
          }
          var lum = (124 + 76 * (1 - r2 * 0.6)) * disc;
          // Maria, at a coarse pitch so they read as markings rather than as dither.
          if (hash2(Math.floor(u * 2.6), Math.floor(v * 2.6), moSeed) < 0.24) lum *= 0.44;
          var gl = r2 > 0.80 ? G_o : (hash2(dx, dy, moSeed ^ 0x91) < 0.5 ? G_8 : G_OO);
          plot(frame, cx + dx, cy + dy, gl, P.white, lum, D_MOON);
        }
      }
    }
  });

  /* ================================================================================ aircraft ==
   * Lights at airline distance. No hull and no contrail — at two kilometres the only honest thing
   * to draw is the beacon, and one blinking cell is the cheapest depth cue in the file. */
  var NAIR = 6, AIR_SPAN = 3200;
  var acB, acD, acY, acS, acPh, acOff;

  CC.ELEMENTS.push({
    name: 'aircraft',
    layer: 6,
    init: function (city, rng) {
      var r = fork(rng), i;
      acB = new Float32Array(NAIR); acD = new Float32Array(NAIR); acY = new Float32Array(NAIR);
      acS = new Float32Array(NAIR); acPh = new Float32Array(NAIR); acOff = new Float32Array(NAIR);
      for (i = 0; i < NAIR; i++) {
        acB[i] = (i & 3) * QUARTER + (r() - 0.5) * 0.6;   // dealt round the axes as above
        acD[i] = 1400 + r() * 1400;
        acY[i] = acD[i] * (0.10 + r() * 0.15);       // 6-14 degrees up: high, but still in frame
        acS[i] = (r() < 0.5 ? -1 : 1) * (58 + r() * 40);      // m/s, real cruise
        acPh[i] = r() * AIR_SPAN;
        acOff[i] = 0;
      }
    },
    update: function (dt, t) {
      var tt = CC.reducedMotion ? t * 0.08 : t;
      for (var i = 0; i < NAIR; i++) {
        var s = (acS[i] * tt + acPh[i]) % AIR_SPAN;
        if (s < 0) s += AIR_SPAN;
        acOff[i] = s - AIR_SPAN * 0.5;
      }
    },
    draw: function (frame, cam, t) {
      setup(frame, cam);
      var tt = CC.reducedMotion ? 0 : t;
      /* An airliner is at cruise, which is ABOVE the weather: put a lid on the sky and there is
       * nothing to see, which is why this is a hard cut-off and not a dimming. Between the two the
       * beacon survives longer than the hull does, because a light does. */
      var seen = 1.25 - 1.30 * W_CLOUD; if (seen <= 0.03) return; if (seen > 1) seen = 1;
      /* Fog does the opposite of hiding it: two kilometres of murk turns one blinking cell into a
       * smear a few cells across. The glow is only worth drawing once the fog is real, and it is
       * four cells even then — this is a point source at 2 km, not a landing light. */
      var glow = W_FOG > 0.34 ? (W_FOG - 0.34) * 1.5 : 0; if (glow > 1) glow = 1;
      for (var i = 0; i < NAIR; i++) {
        var b = acB[i], sb = Math.sin(b), cb = Math.cos(b), s = acOff[i];
        var p = proj(acD[i] * sb + s * cb, acY[i] - CB.eyeY, acD[i] * cb - s * sb);
        if (!p.ok) continue;
        var px = p.x, py = p.y, pd = p.d;            // VP is one scratch; copy before re-plotting
        plot(frame, px, py, G_DOT, P.slate, 17 * seen, pd);
        var ph = tt * 0.55 + i * 0.4; ph -= Math.floor(ph);
        var on = CC.reducedMotion ? 0.33 : (ph < 0.06 ? 1 : 0);
        if (!on) continue;
        plot(frame, px, py, G_DOT, P.red, 176 * on * seen, pd - 1);
        if (glow > 0.02) {
          /* The halo is drawn on the four sides only. A ring of eight puts light on the diagonals
           * where a two-cell-wide source has none, and at this size that reads as a cross. */
          var gl = 74 * glow * on * seen;
          plot(frame, px - 1, py, G_DOT, P.red, gl, pd - 0.5);
          plot(frame, px + 1, py, G_DOT, P.red, gl, pd - 0.5);
          plot(frame, px, py - 1, G_DOT, P.red, gl * 0.7, pd - 0.5);
          plot(frame, px, py + 1, G_DOT, P.red, gl * 0.7, pd - 0.5);
        }
      }
    }
  });

  /* ============================================================================ searchlights ==
   * Beams raking the underside of the sky. The one element here with a real coverage risk, so it
   * is a dithered line and not a filled cone — and the dither is keyed on the step index alone,
   * never on the screen cell, or the motes boil as the beam sweeps.
   * A beam reaches the slot from a mast well outside it, which is why these carry most of the
   * sky's visible motion even though a mast itself is almost never in frame. */
  var NBEAM = 8, BEAM_LEN = 460;
  var bmB, bmR, bmYb, bmAz0, bmAmp, bmW, bmPh, bmEl0, bmSeed, bmAz, bmEl;
  /* Set once per draw from the weather; module scope rather than arguments because the sample loop
   * is the hot path in this file and reads them a hundred and forty times per beam. */
  var BEAM_DENS = 0.46, BEAM_GAIN = 1;

  CC.ELEMENTS.push({
    name: 'searchlights',
    layer: 8,
    init: function (city, rng) {
      var r = fork(rng), i;
      bmB = new Float32Array(NBEAM); bmR = new Float32Array(NBEAM); bmYb = new Float32Array(NBEAM);
      bmAz0 = new Float32Array(NBEAM); bmAmp = new Float32Array(NBEAM);
      bmW = new Float32Array(NBEAM); bmPh = new Float32Array(NBEAM); bmEl0 = new Float32Array(NBEAM);
      bmSeed = new Int32Array(NBEAM); bmAz = new Float32Array(NBEAM); bmEl = new Float32Array(NBEAM);
      for (i = 0; i < NBEAM; i++) {
        /* Two masts per axis, at different ranges and on unrelated phases. One was not enough:
         * a beam has to sweep INTO a 20-column window, and a single lamp spends most of its arc
         * raking sky the canyon walls have already eaten. */
        bmB[i] = (i & 3) * QUARTER + (r() - 0.5) * 0.40;
        bmR[i] = (i < 4 ? 230 : 420) + r() * 200;
        bmYb[i] = bmR[i] * (0.13 + r() * 0.13);      // a rooftop lamp, not a street one
        bmAz0[i] = bmB[i] + (r() - 0.5) * 0.4;
        bmAmp[i] = 0.30 + r() * 0.26;
        bmW[i] = 0.20 + r() * 0.14;                  // ~25 s a sweep, slow enough to feel idle
        bmPh[i] = r() * TAU;
        bmEl0[i] = 0.60 + r() * 0.24;
        bmSeed[i] = (r() * 4294967296) | 0;
        bmAz[i] = bmAz0[i]; bmEl[i] = bmEl0[i];
      }
    },
    update: function (dt, t) {
      var tt = CC.reducedMotion ? 0 : t;
      for (var i = 0; i < NBEAM; i++) {
        bmAz[i] = bmAz0[i] + Math.sin(tt * bmW[i] + bmPh[i]) * bmAmp[i];
        // Elevation drifts on its own, unrelated period, so a sweep never traces the same arc back.
        bmEl[i] = bmEl0[i] + Math.sin(tt * bmW[i] * 0.37 + bmPh[i] * 1.7) * 0.20;
      }
    },
    draw: function (frame, cam) {
      setup(frame, cam);
      /* THE FREE DRAMA IN THIS FILE. A searchlight in clear air is not a beam — there is nothing
       * between the lamp and your eye to light up — it is a bright dot on a distant roof and a few
       * motes near the lens. Put fog in the air and the whole shaft becomes visible along its
       * length, which is the one weather transition up here that changes what an object IS rather
       * than how bright it is. Both ends of it come out of the same two numbers:
       *   BEAM_DENS  — how much of the shaft has anything in it to scatter off
       *   BEAM_GAIN  — how hard what is there scatters, scaled off rel('fog') so the tuned 62 in
       *                the loop below still means 62 under the preset it was measured in.
       * In mist rel('fog') is 3.3, and the clamp is what stops a wall of white. */
      var k = W_FOGREL; if (k > 2.6) k = 2.6;
      BEAM_DENS = 0.16 + 0.30 * k; if (BEAM_DENS > 0.80) BEAM_DENS = 0.80;
      BEAM_GAIN = 0.40 + 0.60 * k; if (BEAM_GAIN > 1.9) BEAM_GAIN = 1.9;
      for (var i = 0; i < NBEAM; i++) {
        var sb = Math.sin(bmB[i]), cb = Math.cos(bmB[i]);
        var ox = bmR[i] * sb, oz = bmR[i] * cb, oy = bmYb[i] - CB.eyeY;
        var p = proj(ox, oy, oz);
        if (!p.ok) continue;
        var bx = p.x, by = p.y, bd = p.d;             // VP is one scratch; copy before re-projecting

        var el = bmEl[i], az = bmAz[i], ce = Math.cos(el);
        var dx = Math.sin(az) * ce, dy = Math.sin(el), dz = Math.cos(az) * ce;
        /* A beam leaning back over the camera puts its tip behind the near plane. Shortening it is
         * the right answer — the stub that survives is the part actually in front of us. */
        var len = BEAM_LEN, k, ok = 0, tx = 0, ty = 0, td = 0;
        for (k = 0; k < 5; k++) {
          p = proj(ox + dx * len, oy + dy * len, oz + dz * len);
          if (p.ok) { ok = 1; tx = p.x; ty = p.y; td = p.d; break; }
          len *= 0.5;
        }
        if (!ok) continue;

        var sx = tx - bx, sy = ty - by;
        var asx = sx < 0 ? -sx : sx, asy = sy < 0 ? -sy : sy;
        var n = Math.round(asx > asy ? asx : asy);
        if (n < 3) continue;
        if (n > 140) n = 140;
        // The slope picks the stroke, so a near-vertical beam is not a staircase of slashes.
        var gl = asy > asx * 1.4 ? G_PIPE : (sx * sy > 0 ? G_BSLASH : G_SLASH);
        for (k = 0; k <= n; k++) {
          // motes fixed to the beam, not the screen — and thinned out when there is nothing to
          // scatter off, which is the clear-air half of the transition described above.
          if (hash2(k, i, bmSeed[i]) > BEAM_DENS) continue;
          var f = k / n, ff = 1 - f;
          /* 62 at the root, not the 46 this started at: a beam only ever shows through a
           * dozen cells of slot before a parapet eats the rest, and at 46 those cells were below
           * the threshold where the canvas bloom picks them up at all. It is scaled by rel('fog'),
           * which is 1.0 under the preset that 62 was measured in — the migration rule — so the
           * number above is unchanged on the day it shipped and only moves when the air does. */
          plot(frame, bx + sx * f, by + sy * f, k < 3 ? G_COLON : gl,
               f < 0.34 ? P.white : P.slate, 62 * BEAM_GAIN * ff * ff * Math.sqrt(ff),
               bd + (td - bd) * f);
        }
        plot(frame, bx, by, G_OO, P.white, 96, bd);      // the lamp itself
      }
    }
  });

  /* ========================================================================== tower beacons ==
   * The far end of the canyon, six or seven kilometres of city past where the raycaster stops
   * marching. Nothing in the build says anything about what is out there: the world pass ends at
   * 125 m and the slot above the vanishing point is simply empty, which quietly says the city is
   * a hundred metres across.
   *
   * A handful of masts at half a kilometre to two, each with red obstruction lamps on ITS OWN
   * period, fixes that for about sixty cells. Out of sync is the entire point — a row of lamps
   * blinking together reads as one object and a decoration; blinking independently they read as
   * separate structures at different distances, which is the depth cue this end of the frame has
   * never had.
   *
   * They sit at D_TOWER, between the moon and the cloud deck, because that is where they are: a
   * kilometre away and UNDER the weather, so the deck must not occlude them — but fog must eat
   * them, and does, from the front.
   * ========================================================================================== */
  var D_TOWER = 9.2e4, NTOWER = 7;
  var twB, twR, twH, twPer, twPh, twSeed;

  CC.ELEMENTS.push({
    name: 'beacons',
    layer: 7,
    init: function (city) {
      var r = forkCity(city, 0x2B9A31), i;
      twB = new Float32Array(NTOWER); twR = new Float32Array(NTOWER); twH = new Float32Array(NTOWER);
      twPer = new Float32Array(NTOWER); twPh = new Float32Array(NTOWER);
      twSeed = new Int32Array(NTOWER);
      for (i = 0; i < NTOWER; i++) {
        // Dealt round the street axes, for the reason in the file header: anywhere else is nowhere.
        twB[i] = (i & 3) * QUARTER + (r() - 0.5) * 0.34;
        twR[i] = 520 + r() * 1500;
        twH[i] = twR[i] * (0.10 + r() * 0.13);       // 6-13 degrees: a tower, not a mountain
        /* Real obstruction lamps run at 20-60 flashes a minute and no two installations agree.
         * Irrational-ish periods keep any two of them from finding a common beat over a walk. */
        twPer[i] = 1.35 + r() * 1.9;
        twPh[i] = r() * 10;
        twSeed[i] = (r() * 30011) | 0;
      }
    },
    draw: function (frame, cam, t) {
      setup(frame, cam);
      /* A kilometre of murk. This is the one element in the file that fog hides completely rather
       * than diffusing, because there is nothing to diffuse: it is unlit structure and two lamps. */
      var vis = 1 - W_FOG * 1.5 - W_HAZE * 0.35; if (vis <= 0.02) return; if (vis > 1) vis = 1;
      var tt = CC.reducedMotion ? 0 : t;
      for (var i = 0; i < NTOWER; i++) {
        var sb = Math.sin(twB[i]), cb = Math.cos(twB[i]);
        var ox = twR[i] * sb, oz = twR[i] * cb;
        var p = proj(ox, twH[i] - CB.eyeY, oz);
        if (!p.ok) continue;
        var cx = Math.round(p.x), yTop = p.y, d = p.d;
        if (cx < 0 || cx >= CB.cols) continue;
        p = proj(ox, twH[i] * 0.42 - CB.eyeY, oz);
        if (!p.ok) continue;
        var yBot = p.y, row;
        if (yBot - yTop < 2) continue;               // too far to be anything but its own lamp
        if (yBot - yTop > 46) yBot = yTop + 46;
        /* Dashed, and dim enough that it is a suggestion of a mast rather than a line drawn on the
         * sky. Every other cell, keyed off the tower's own top row so the pattern cannot crawl. */
        for (row = Math.round(yTop) + 1; row <= yBot; row++)
          if (!((row - Math.round(yTop)) & 1))
            plot(frame, cx, row, G_PIPE, P.slate, 15 * vis, D_TOWER);
        var ph = tt / twPer[i] + twPh[i]; ph -= Math.floor(ph);
        var on = CC.reducedMotion ? 0.5 : (ph < 0.16 ? 1 : 0.10);
        plot(frame, cx, yTop, on > 0.5 ? G_STAR : G_DOT, P.red, (40 + 150 * on) * vis, D_TOWER - 1);
        // The mid-height lamp, which is what makes a tower read as tall rather than as far.
        if (yBot - yTop > 9)
          plot(frame, cx, (yTop + yBot) * 0.5, G_DOT, P.red, (24 + 84 * on) * vis, D_TOWER - 1);
      }
    }
  });

  /* ============================================================================ rare traffic ==
   * Two things that are not there most of the time: a flock crossing the slot, and once in a very
   * long while an orbital burn climbing out over the city.
   *
   * BOTH ARE SCHEDULED, NOT RANDOM, and the schedule is a pure function of t: the cycle index is
   * floor(t / period) and everything about that appearance is hashed off the index. That is what
   * keeps them scrub-safe — jump the harness to frame 9000 and the same flock is in the same place
   * as it was in the browser — and it is also the only honest way to make something rare. A
   * per-frame probability gives an event whose spacing is exponential, which in practice means two
   * in ten seconds and then nothing for a quarter of an hour.
   * ========================================================================================== */
  var D_BIRD = 9.3e4, NBIRD = 7, BIRD_CYCLE = 96, SHUTTLE_CYCLE = 214;
  var bdSeed = 0, shSeed = 0;

  CC.ELEMENTS.push({
    name: 'skyrare',
    layer: 9,
    init: function (city) {
      var r = forkCity(city, 0x77E115);
      bdSeed = (r() * 30011) | 0;
      shSeed = (r() * 30011) | 0;
    },
    draw: function (frame, cam, t) {
      setup(frame, cam);
      /* Reduced motion slows the schedule rather than freezing it, the way the aircraft and the
       * drones above do: a frozen flock is seven dots parked in the sky, which reads as a defect,
       * where a slow one is simply rarer. It also makes these events eight times rarer, which for
       * something that is already rare is the right direction to be wrong in. */
      t = CC.reducedMotion ? t * 0.12 : t;
      var i, k, u, az, el, ca, p;

      /* ---- the flock ----------------------------------------------------------------------
       * Birds are drawn as SILHOUETTES — dim slate against whatever the sky is doing — because
       * that is what a bird over a lit city is at night. A lit bird would be the only object in
       * the frame emitting light for no reason.
       * Nothing flies in a downpour, which is worth one line of gate and is the kind of detail
       * that makes the weather feel like it is being obeyed rather than displayed. */
      if (W_RAIN < 0.45) {
        k = Math.floor(t / BIRD_CYCLE);
        u = t / BIRD_CYCLE - k;
        if (hash1(k, bdSeed + 3) < 0.42 && u > 0.10 && u < 0.30) {
          var q = (u - 0.10) / 0.20;                 // 0..1 across the pass, ~19 s of it
          var fb = ((k & 3) * QUARTER) + (hash1(k, bdSeed + 9) - 0.5) * 0.5;
          var fel = 0.11 + hash1(k, bdSeed + 17) * 0.16;
          var dirn = hash1(k, bdSeed + 23) < 0.5 ? -1 : 1;
          for (i = 0; i < NBIRD; i++) {
            /* The flock is a loose diagonal, not a rank: each bird carries its own lag along the
             * course and its own altitude, and the two together are what make seven cells read as
             * one flock rather than as seven marks. */
            az = fb + dirn * (q - 0.5) * 0.62 + (hash1(i, bdSeed) - 0.5) * 0.10 - i * 0.017 * dirn;
            el = fel + (hash1(i, bdSeed + 5) - 0.5) * 0.045;
            ca = Math.cos(el);
            p = proj(Math.sin(az) * ca, Math.sin(el), Math.cos(az) * ca);
            if (!p.ok) continue;
            /* The wingbeat is the whole animation and it is one glyph swapping for another: down
             * stroke reads as a caret, the glide as a dash. Per-bird phase, or the flock flaps in
             * unison like a clockwork toy. */
            var wb = CC.reducedMotion ? 0.5
                   : (t * 3.4 + i * 0.7) - Math.floor(t * 3.4 + i * 0.7);
            plot(frame, p.x, p.y, wb < 0.45 ? G_CARET : G_DASH, P.slate,
                 (26 + 16 * hash1(i, bdSeed + 11)) * (1 - W_FOG * 0.8), D_BIRD);
          }
        }
      }

      /* ---- the burn -----------------------------------------------------------------------
       * An orbital departure: a very slow, very bright head climbing out of the far skyline with a
       * short trail under it. Once every three or four minutes at most, and only when there is a
       * gap in the cloud to see it through — a rocket that punches through an overcast would be
       * the one object in the sky that ignores the weather everything else obeys. */
      if (W_CLOUD > 0.80) return;
      k = Math.floor(t / SHUTTLE_CYCLE);
      u = t / SHUTTLE_CYCLE - k;
      if (hash1(k, shSeed + 1) > 0.5) return;        // most cycles have no launch in them
      if (u < 0.14 || u > 0.30) return;
      var s = (u - 0.14) / 0.16;                     // 0..1 over about 34 s of climb
      var sb2 = ((k & 3) * QUARTER) + (hash1(k, shSeed + 7) - 0.5) * 0.30;
      /* Accelerating, because that is what a launch does and because a constant-rate dot reads as
       * an aircraft. s*s takes it off the rooftops slowly and out of the top of the frame fast. */
      var sel = 0.035 + s * s * 0.42;
      var fade = 1 - W_CLOUD * 0.9;
      for (i = 0; i < 9; i++) {
        el = sel - i * i * 0.0042;                   // the trail bunches up under the head
        if (el < 0.02) break;
        az = sb2 + i * 0.0026;
        ca = Math.cos(el);
        p = proj(Math.sin(az) * ca, Math.sin(el), Math.cos(az) * ca);
        if (!p.ok) continue;
        plot(frame, p.x, p.y,
             i === 0 ? G_STAR : (i < 3 ? G_o : G_DOT),
             i === 0 ? P.pure : (i < 4 ? P.ember : P.slate),
             (i === 0 ? 235 : 150 / (1 + i * 0.9)) * fade, D_STAR - 2);
      }
    }
  });

  /* ================================================================================== blimps ==
   * Advertising blimps on long straight courses, five metres a second, wrapping over a kilometre
   * of run so the sky never empties. They fly rather than hover for the reason in the header: a
   * craft parked on a bearing is either always in the slot or never in it, and both are wrong.
   *
   * The hull is a filled ellipse, not an outline — the massed-slab rule applies to anything lit,
   * and an outlined blimp reads as a wireframe balloon. The fill is nearly black, the rim carries
   * the silhouette, and only the marquee is allowed to be bright.
   * The marquee steps in CELLS, not in hull fractions, so the text scrolls at a constant rate
   * rather than stretching as the blimp closes. */
  var NBLIMP = 8, TXTN = 44, BL_SPAN = 1100;
  var blB, blD, blY, blL, blH, blSpd, blPh, blHue, blSeed, blOff, blTxt;
  var TXT_POOL = null;

  CC.ELEMENTS.push({
    name: 'blimps',
    layer: 12,
    init: function (city, rng) {
      var r = fork(rng), i, j;
      if (!TXT_POOL) TXT_POOL = [G_8, G_0, G_OO, G_X, G_Z, G_HASH, G_H, G_N, G_A, G_V,
                                 G_K, G_Y, G_U, G_M, G_W, G_EQ];
      blB = new Float32Array(NBLIMP); blD = new Float32Array(NBLIMP); blY = new Float32Array(NBLIMP);
      blL = new Float32Array(NBLIMP); blH = new Float32Array(NBLIMP);
      blSpd = new Float32Array(NBLIMP); blPh = new Float32Array(NBLIMP);
      blHue = new Uint8Array(NBLIMP); blSeed = new Int32Array(NBLIMP);
      blOff = new Float32Array(NBLIMP); blTxt = new Uint8Array(NBLIMP * TXTN);
      for (i = 0; i < NBLIMP; i++) {
        blB[i] = (i & 3) * QUARTER + (r() - 0.5) * 0.5;   // two to each axis
        blD[i] = 320 + r() * 300;
        blY[i] = blD[i] * (0.16 + r() * 0.13);       // 9-16 degrees up, clear of the landmarks
        blL[i] = 46 + r() * 26;
        blH[i] = blL[i] * 0.23;
        blSpd[i] = (r() < 0.5 ? -1 : 1) * (3.4 + r() * 2.4);
        blPh[i] = r() * BL_SPAN;
        /* The two pillars carry the advertising. Violet is a signage colour and a blimp flank is
         * signage, so exactly one hull gets it — a sky with two violet blimps is the cliche the
         * references refuse. */
        blHue[i] = i === 2 ? P.violet : (i & 1 ? P.azure : P.amber);
        blSeed[i] = (r() * 4294967296) | 0;
        for (j = 0; j < TXTN; j++) {
          var q = r();
          // A third of the band is blank. Solid text turns a 30-cell strip into a bright bar.
          blTxt[i * TXTN + j] = q < 0.32 ? 0 : TXT_POOL[(q * TXT_POOL.length) | 0];
        }
      }
    },
    update: function (dt, t) {
      var tt = CC.reducedMotion ? t * 0.12 : t;
      for (var i = 0; i < NBLIMP; i++) {
        var s = (blSpd[i] * tt + blPh[i]) % BL_SPAN;
        if (s < 0) s += BL_SPAN;
        blOff[i] = s - BL_SPAN * 0.5;
      }
    },
    draw: function (frame, cam, t) {
      setup(frame, cam);
      var tt = CC.reducedMotion ? 0 : t;
      for (var i = 0; i < NBLIMP; i++) {
        var b = blB[i], sb = Math.sin(b), cb = Math.cos(b), s = blOff[i];
        var p = proj(blD[i] * sb + s * cb, blY[i] - CB.eyeY, blD[i] * cb - s * sb);
        if (!p.ok) continue;
        var cx = p.x, cy = p.y, d = p.d;
        var rw = blL[i] * 0.5 / p.w * CB.colsPerTan;
        var rh = blH[i] * 0.5 / p.w * CB.scale;
        if (rw < 2.5 || cx + rw < 0 || cx - rw >= CB.cols) continue;
        /* 1.5, not 1.0. At exactly 1.0 the dy = +-1 cells sit at v = 1 and the ellipse test
         * u*u + v*v > 1 throws the entire skin away, leaving the marquee floating in the sky with
         * no craft under it. 1.5 keeps a skin row above and below across 75% of the length, which
         * is the least that still reads as a hull. */
        if (rh < 1.5) rh = 1.5;

        var sd = blSeed[i], hue = blHue[i], base = i * TXTN;
        var scroll = Math.floor(tt * 3.2);
        var iw = Math.ceil(rw), ih = Math.ceil(rh), dx, dy;
        for (dy = -ih; dy <= ih; dy++) {
          for (dx = -iw; dx <= iw; dx++) {
            var u = dx / rw, v = dy / rh, r2 = u * u + v * v;
            if (r2 > 1) continue;
            if (dy === 0) {
              if (u > -0.84 && u < 0.84) {
                var ti = (dx + scroll) % TXTN; if (ti < 0) ti += TXTN;
                var tg = blTxt[base + ti];
                if (tg) plot(frame, cx + dx, cy + dy, tg, hue, 132 + hash2(ti, i, sd) * 64, d - 1);
              } else {
                plot(frame, cx + dx, cy + dy, G_o, P.slate, 30 + hash2(dx, dy, sd) * 14, d);
              }
              continue;
            }
            if (r2 > 0.42) {
              /* The skin. The underside picks up the city's own sodium glow off the cloud base;
               * the top faces nothing but sky, so it stays achromatic. */
              if (v > 0) plot(frame, cx + dx, cy + dy, G_UNDER, P.amber,
                              25 + hash2(dx, dy, sd) * 13, d);
              else plot(frame, cx + dx, cy + dy, G_DASH, P.slate,
                        29 + hash2(dx, dy, sd ^ 0x7) * 15, d);
              continue;
            }
            if (hash2(dx, dy, sd ^ 0x2C) < 0.30)
              plot(frame, cx + dx, cy + dy, G_COLON, P.slate, 12, d);
          }
        }

        // Anti-collision strobes on nose and tail: two cells, dark far more often than lit.
        var ph = tt * 0.75 + i * 0.37; ph -= Math.floor(ph);
        if (CC.reducedMotion || ph < 0.13) {
          var al = CC.reducedMotion ? 80 : 204;
          plot(frame, cx - rw * 0.94, cy, G_DOT, P.red, al, d - 2);
          plot(frame, cx + rw * 0.94, cy, G_DOT, P.red, al, d - 2);
        }
        /* Gondola: one warm cell hung directly under the hull. Placed off floor(rh), not off
         * rh itself, or it detaches from the skin row by a gap of black and reads as a stray. */
        plot(frame, cx, cy + Math.floor(rh) + 1, G_DOT, P.warm, 70, d);
      }
    }
  });

  /* ================================================================================== drones ==
   * Delivery quads crossing the slot. One dark cell of airframe and a navigation light that is
   * off most of the time — the blink IS the element, so it has to stay a blink and not a lamp.
   * Fast enough (6-12 m/s) that one crosses the window in a couple of seconds. */
  var NDRONE = 26;
  var drB, drD, drY, drSpd, drPh, drSpan, drStrobe, drOff;

  CC.ELEMENTS.push({
    name: 'drones',
    layer: 13,
    init: function (city, rng) {
      var r = fork(rng), i;
      drB = new Float32Array(NDRONE); drD = new Float32Array(NDRONE); drY = new Float32Array(NDRONE);
      drSpd = new Float32Array(NDRONE); drPh = new Float32Array(NDRONE); drSpan = new Float32Array(NDRONE);
      drStrobe = new Uint8Array(NDRONE); drOff = new Float32Array(NDRONE);
      for (i = 0; i < NDRONE; i++) {
        drB[i] = (i & 3) * QUARTER + (r() - 0.5) * 0.7;   // six or seven to each axis
        drD[i] = 70 + r() * 80;
        /* 14-24 degrees up. Higher than it first looks right, and deliberately so: the sky
         * wedge is 12 columns wide down by the horizon and 24 at the top of the frame, so a
         * corridor flown low is a corridor nobody ever catches sight of. */
        drY[i] = drD[i] * (0.24 + r() * 0.18);
        drSpd[i] = (r() < 0.5 ? -1 : 1) * (6 + r() * 6);
        /* The run is sized to the drone's own range: just past the point where it leaves the
         * frustum, so it recycles as often as possible without ever popping into being on screen. */
        drSpan[i] = drD[i] * 2.2;
        drPh[i] = r() * drSpan[i];
        drStrobe[i] = r() < 0.4 ? 1 : 0;
      }
    },
    update: function (dt, t) {
      var tt = CC.reducedMotion ? t * 0.1 : t;
      for (var i = 0; i < NDRONE; i++) {
        var sp = drSpan[i], s = (drSpd[i] * tt + drPh[i]) % sp;
        if (s < 0) s += sp;
        drOff[i] = s - sp * 0.5;
      }
    },
    draw: function (frame, cam, t) {
      setup(frame, cam);
      var tt = CC.reducedMotion ? 0 : t;
      for (var i = 0; i < NDRONE; i++) {
        var b = drB[i], sb = Math.sin(b), cb = Math.cos(b), s = drOff[i];
        var p = proj(drD[i] * sb + s * cb, drY[i] - CB.eyeY, drD[i] * cb - s * sb);
        if (!p.ok) continue;
        var x = p.x, y = p.y, d = p.d;
        if (x < -2 || x >= CB.cols + 2) continue;

        plot(frame, x, y, G_DASH, P.slate, 30, d);
        if (CC.reducedMotion) {
          plot(frame, x - 1, y, G_DOT, P.red, 74, d);
          plot(frame, x + 1, y, G_DOT, P.spring, 66, d);
          continue;
        }
        // Port red, starboard green, offset in the cycle so the pair never reads as one wide lamp.
        var ph = tt * 1.5 + i * 0.41; ph -= Math.floor(ph);
        if (ph < 0.12) plot(frame, x - 1, y, G_DOT, P.red, 194, d - 0.5);
        if (ph > 0.50 && ph < 0.62) plot(frame, x + 1, y, G_DOT, P.spring, 174, d - 0.5);
        if (drStrobe[i] && ph > 0.83 && ph < 0.855)
          plot(frame, x, y, G_PLUS, P.pure, 242, d - 1);
      }
    }
  });

})(typeof CC !== 'undefined' ? CC : require('../core.js'));
