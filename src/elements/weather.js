/* CyberCity weather — the visible face of CC.Weather.
 *
 * Five elements, one file, because they all read the same wind vector, the same projection helper
 * and the same weather block, and splitting them would mean five copies of all three.
 *
 * WHAT CHANGED WHEN CC.Weather LANDED. Every constant in here used to be tuned for one unchanging
 * sky. They are now functions of the live weather block, and the scaling rule is the one
 * weather_state.js states: an element multiplies its EXISTING tuned constant by the parameter
 * divided by that parameter's value in the `rain` preset — the preset the whole build was tuned
 * under — so the scale is 1.0 under `rain` and the file reproduces exactly what it printed before.
 * Multiplying by the raw 0..1 parameter instead would silently re-tune the whole file to 65% of
 * itself. Those reference values are the REF_* constants below; dividing by them here rather than
 * calling CC.Weather.rel() is the same arithmetic without an Array#indexOf per call, and it also
 * means this file still runs when weather_state.js is not loaded at all — which is exactly the
 * case in tools/lightning-rate.cjs, whose whole job is to measure the envelope under the reference
 * sky.
 *
 * PROJECTION. The raycaster's camera is planar, not cylindrical, and these elements must agree
 * with it EXACTLY or a raindrop lands one column off the wall it is supposed to be in front of.
 * The forward axis distance w comes from a plain dot product, the column falls out of r/w, and
 * the row uses the same `horizon - (y-eyeY)*scale/w` the wall tops use. `scale` is re-derived the
 * way raycast.js derives it — from fov and the cell aspect — because cam.scaleY is optional and
 * the harness sets a `cam.scale` that raycast.js deliberately ignores. Nothing here hardcodes the
 * horizon or the fov: the camera pitches and zooms, and a hardcoded rows*0.56 tears the rain away
 * from the city the moment somebody looks up.
 *
 * DEPTH. Every write goes through CC.put with the point's RADIAL distance sqrt(w^2+r^2), which is
 * the same quantity raycast.js stores in frame.dist (w*len). That is what makes rain fall in
 * front of the near facade and vanish behind the far one instead of raining through the city.
 *
 * BUDGET. Weather is allowed about a point and a half of lit coverage under the `rain` preset and
 * more under a downpour — a downpour that costs the same as a drizzle is not a downpour. Measured
 * at 200x60 against the same frame with these five elements' draw suppressed, seeds 3, 42 and 99
 * at frame 3000, in points of lit cells and in share of cells touched:
 *
 *     clear    +0.09 / +0.25 / +0.15     0.5-1.0% of cells touched
 *     drizzle  +0.54 / +0.52 / +0.40     0.8-1.5%
 *     rain     +1.15 / +1.17 / +1.12     2.0-2.7%      <- the reference sky
 *     downpour +1.79 / +2.06 / +2.14     5.3-7.3%
 *     mist     +0.85 / -0.85 / +0.64    28-45%
 *     storm    +1.41 / +1.18 / +1.75     4.1-5.3%
 *
 * Clear is steam and residual ledge drip and nothing else — the director keeps P.steam at 0.55 on
 * a dry night. Mist touches half the frame and can still come out NEGATIVE on lit coverage,
 * because the veil takes more of the city away than the bank puts back; that is the whole point of
 * it. A lightning peak is worth about +14 on top of any of those and lasts a fifth of a second.
 * The frame is 40-55% pure black and that is the look; every threshold below was pulled down until
 * that held.
 *
 * SAFETY. The lightning envelope at the bottom of this file is the one thing in the project that
 * can physically harm a viewer. It is measured, not tuned by eye, and `node tools/lightning-rate.cjs`
 * is the measurement. Read the block above lgEnv before touching any constant near it.
 */
(function (CC) {
  'use strict';

  var P = CC.P, put = CC.put, hash1 = CC.hash1, hash2 = CC.hash2,
      clamp = CC.clamp, lerp = CC.lerp, smooth = CC.smooth, vnoise = CC.vnoise;

  var G_PIPE = CC.g('|'), G_SLASH = CC.g('/'), G_BSL = CC.g('\\'), G_DOT = CC.g('.'),
      G_COMMA = CC.g(','), G_COLON = CC.g(':'), G_QUOTE = CC.g("'"), G_TICK = CC.g('`'),
      G_DASH = CC.g('-'), G_UNDER = CC.g('_'), G_TILDE = CC.g('~'), G_STAR = CC.g('*'),
      G_SEMI = CC.g(';'), G_EQ = CC.g('=');

  /* ---- the weather block --------------------------------------------------------------------
   * Held, never copied: CC.Weather.P is a live object and a copy taken at init would freeze the
   * city under the sky it was born in. The REF_* row is the `rain` preset, which is the tuning
   * reference for every constant in this file. */
  var REF_RAIN = 0.65, REF_WIND = 0.55, REF_FOG = 0.30, REF_WET = 0.90,
      REF_STORM = 0.12, REF_HAZE = 0.40, REF_CLOUD = 0.75, REF_STEAM = 0.85;
  /* Stand-in for a harness that does not load weather_state.js. It is the reference preset itself,
   * so a file rendered without the director prints the sky the build was tuned as. */
  var WFALL = { rain: REF_RAIN, wind: REF_WIND, fog: REF_FOG, wet: REF_WET,
                storm: REF_STORM, haze: REF_HAZE, cloud: REF_CLOUD, steam: REF_STEAM };

  var pRain = REF_RAIN, pWind = REF_WIND, pFog = REF_FOG, pWet = REF_WET,
      pStorm = REF_STORM, pHaze = REF_HAZE, pCloud = REF_CLOUD, pSteam = REF_STEAM;
  /* The same eight, divided by their reference value: 1.0 means "what this file already did". */
  var dRain = 1, dWind = 1, dFog = 1, dSteam = 1;
  /* Derived weather that has no parameter of its own. See the comment on syncWeather. */
  var wChill = 0, wSleet = 0, wBreath = 0;

  /* ---- one wind for the whole system, and it gusts -------------------------------------------
   * Rain slant, splash lean, drip drift, steam drift, fog travel and cloud scud all read this.
   * Independent wind per element looked like five unrelated effects sharing a screen.
   *
   * EXPORTED, because it is not only this file's business: banners, cables, litter, awnings and
   * anything else that hangs in the street should lean the same way the rain does, and a second
   * wind rolled somewhere else would be visibly out of phase with this one. The object is live and
   * is never reallocated — hold it, do not copy it:
   *
   *     CC.Weather.wind === CC.Wind === { x, z, dirX, dirZ, base, speed, gust, mult }
   *
   *     x, z        metres per second along world X and Z, gust included. This is the vector to
   *                 use; multiply it by a time and you get a displacement.
   *     dirX, dirZ  unit direction the wind blows TOWARD, constant for the life of a city.
   *     base        mean speed in m/s for the current weather, gust excluded.
   *     speed       |(x,z)|, i.e. base*mult, which is what a travel rate wants.
   *     gust        the live wind STRENGTH on the director's own 0..1 scale: P.wind beaten by the
   *                 gust envelope. This is the number to scale a swing, a lean or a flutter by —
   *                 0.55 under the reference sky, near nothing on a still night, up to about 1.6
   *                 on the hardest gust of a storm. structure.js's banners and lanterns read
   *                 exactly this field and fall back to `P.wind * (0.70 + 0.66*noise)` without it,
   *                 which is the same quantity and the same range; keep it that way.
   *     mult        the raw gust multiplier on `base`, mean 1 by construction. Only wanted if you
   *                 are computing a speed rather than a magnitude.
   *
   * It is refreshed once per t by syncWeather() below, from whichever element runs first; every
   * reader in the same frame therefore sees the same vector.
   *
   * The init guard is keyed on the CITY OBJECT, never on a boolean. A `if (windSet) return` latch
   * does the right thing for the elements of one init round and the wrong thing forever after: a
   * #hashchange rebuilds the world and calls init() again with a fresh rng, and a latched wind
   * meant the new city kept the previous one's weather. Comparing the city identity keeps the
   * "one wind shared by every element" property — they are all handed the SAME object in one
   * round, so exactly one of them draws from the rng — while still re-rolling on a real rebuild. */
  var WIND = { x: 0.0, z: 0.0, dirX: 0.0, dirZ: 1.0, base: 0.0, speed: 0.0, gust: 0.55, mult: 1.0 };
  var WBASE = 2.4, windWorld, wSeed = 0;
  function initWind(rng) {
    if (windWorld === WCITY) return;
    windWorld = WCITY;
    var a = rng() * 6.283185;
    WBASE = 1.6 + rng() * 2.6;
    WIND.dirX = Math.cos(a); WIND.dirZ = Math.sin(a);
    wSeed = smallSeed(rng);
    wxT = -1e9;                                      // force a resync; the gust seed just moved
  }

  /* ---- derived weather ----------------------------------------------------------------------
   * CHILL has no parameter in CC.Weather and deliberately so: temperature is not something the
   * eight directions can carry, and adding a ninth would mean editing a file this module does not
   * own. It is inferred instead, the way you would infer it standing there — a slow front that
   * takes about four minutes to pass, colder when the air is full of fog and haze, warmer when it
   * is raining hard, since the rain that is falling as water is by definition above freezing.
   * Two things read it: sleet (which needs rain AND cold) and breath (which needs only cold).
   * Under the `rain` preset a cold front reaches the sleet threshold about one pass in eight, so
   * sleet stays an event rather than a look. */
  var wxT = -1e9;
  function syncWeather(t) {
    if (t === wxT) return;                           // idempotent per frame; any element may call
    wxT = t;
    /* Resolved every sync rather than cached at init, because load order is not guaranteed and a
     * cached null would leave the city permanently under the fallback sky. */
    var W = (CC.Weather && CC.Weather.P) || WFALL;
    if (CC.Weather && CC.Weather.wind !== WIND) CC.Weather.wind = WIND;
    pRain = W.rain; pWind = W.wind; pFog = W.fog; pWet = W.wet;
    pStorm = W.storm; pHaze = W.haze; pCloud = W.cloud; pSteam = W.steam;
    dRain = pRain / REF_RAIN; dWind = pWind / REF_WIND;
    dFog = pFog / REF_FOG; dSteam = pSteam / REF_STEAM;

    /* Gust. Two octaves: a slow envelope that walks the whole curtain up the street over ten
     * seconds or so, and a faster ripple on top of it. Its mean is 1 by construction — (raw-0.5)
     * around a unit centre — so the slant, drift and travel rates every reader derives from it
     * still average what they averaged before the wind gusted at all. Amplitude scales with the
     * wind parameter, which is what makes a still night still and a storm ragged. */
    var gt = CC.reducedMotion ? 0 : t;
    var raw = vnoise(gt * 0.107 + 4.1, wSeed + 3) * 0.68 + vnoise(gt * 0.39, wSeed + 8) * 0.32;
    var amp = clamp(dWind, 0, 1.85) * (CC.reducedMotion ? 0.12 : 1);
    var g = 1 + (raw - 0.5) * 1.30 * amp;
    /* Floored well above zero, and not only to keep the vector from reversing on a deep lull —
     * which would be a gale blowing backwards, not a breeze. At the reference sky the swing bottoms
     * out at exactly 0.35 so the floor never bites; it exists for a storm, where the amplitude is
     * nearly twice that and an unfloored lull briefly stops the wind dead in the middle of a gale. */
    if (g < 0.30) g = 0.30;
    WIND.mult = g;
    /* Published on the director's own scale, not as the multiplier: a consumer that wants to swing
     * a banner wants "how windy is it", which is P.wind beaten by the gust, and a mean-1 multiplier
     * would have swung the banners just as hard on a still night as in a gale. */
    WIND.gust = clamp(pWind * g, 0, 1.6);
    WIND.base = WBASE * (0.35 + 0.65 * clamp(dWind, 0, 1.85));
    WIND.speed = WIND.base * g;
    WIND.x = WIND.dirX * WIND.speed; WIND.z = WIND.dirZ * WIND.speed;

    /* The cold front. Squared, so the cold end is a visit rather than half of all weather. */
    var cf = vnoise(t * 0.0037 + 11.3, wSeed + 17) * 0.66 + vnoise(t * 0.0119, wSeed + 23) * 0.34;
    cf *= cf;
    wChill = clamp(0.10 + cf * 1.05 - pRain * 0.25 + (pFog + pHaze) * 0.20, 0, 1);
    /* Sleet needs both: cold air and something falling through it. */
    wSleet = clamp((wChill - 0.68) / 0.25, 0, 1) * clamp(pRain / 0.30, 0, 1);
    wBreath = clamp((wChill - 0.50) / 0.28, 0, 1);
  }

  /* ---- view binding -------------------------------------------------------------------------
   * Refreshed once per draw(); every projection in the file reads these module-level slots so
   * nothing has to allocate a camera record per particle. */
  var vCols = 0, vHorizon = 0, vScale = 0, vHalf = 0, vCellA = 0.5625,
      vEyeY = 1.7, vX = 0, vZ = 0, vFwx = 0, vFwz = 1, vRgx = 1, vRgz = 0, vFar = 125;
  var SURF = null;

  function bindView(frame, cam) {
    SURF = CC.Surf || null;
    vCols = frame.cols;
    var fov = cam.fov || 1.25;
    vHalf = Math.tan(fov * 0.5);
    vHorizon = cam.horizon !== undefined ? cam.horizon : frame.rows * 0.56;
    vEyeY = cam.eyeY !== undefined ? cam.eyeY : 1.7;
    vCellA = cam.cellAspect || 0.5625;
    vScale = cam.scaleY !== undefined ? cam.scaleY : (frame.cols * vCellA) / (2 * vHalf);
    var yaw = cam.yaw || 0;
    vFwx = Math.sin(yaw); vFwz = Math.cos(yaw);
    vRgx = Math.cos(yaw); vRgz = -Math.sin(yaw);
    vX = cam.x; vZ = cam.z;
    vFar = SURF ? SURF.FOG_END : 125;
  }

  function fogLum(lum, dist) { return SURF ? SURF.fog(lum, dist) : lum; }

  /* Scratch projection result. Never returned to a caller, never retained across a call. */
  var pjW = 0, pjX = 0, pjY = 0, pjD = 0;
  /* Returns 0 for a point that cannot possibly be on screen. The 1.25 slack on the horizontal
   * bound keeps a near particle whose STREAK reaches back into frame from being culled. */
  function project(wx, wy, wz) {
    var rx = wx - vX, rz = wz - vZ;
    var w = rx * vFwx + rz * vFwz;
    if (w < 0.45 || w > vFar) return 0;
    var r = rx * vRgx + rz * vRgz;
    var sp = r / w;
    if (sp < -vHalf * 1.25 || sp > vHalf * 1.25) return 0;
    pjW = w;
    pjX = (sp / vHalf + 1) * 0.5 * vCols - 0.5;
    pjY = vHorizon - (wy - vEyeY) * vScale / w;
    pjD = Math.sqrt(w * w + r * r);
    return 1;
  }

  /* Wrap into [-b/2, b/2). This is what lets a fixed particle array cover an endless city: the
   * drop the camera walked past reappears the same distance behind it. */
  function wrap(v, b) { return v - b * Math.floor(v / b + 0.5); }
  function frac(v) { return v - Math.floor(v); }

  /* core.js's hash2 multiplies its seed by 2147483647 in floating point, so a full 32-bit seed
   * pushes the product past 2^53 and the low bits — the only bits that distinguish `s` from
   * `s ^ 0x66` — are rounded away. Every seed in this file is therefore drawn SMALL and its
   * variants are ADDITIVE. Getting this wrong is silent and vicious: the first cut of the steam
   * used `stSeed ^ 0x66` to pick steam-vs-smoke and got the identical hash it had just used to
   * place the vent, so every single vent in the city came out as smoke. */
  function smallSeed(rng) { return (rng() * 30011) | 0; }

  /* A PRIVATE stream, bought with exactly one draw from the shared one. Every element in the build
   * pulls from a single rng handed round in layer order, so the number of draws an init() takes is
   * part of the seed of every element that inits after it. That is a live trap for anything that
   * loops to a tuning constant: RN_MAX below is a capacity, nothing more, and moving it from 1800
   * to 2800 changed 31.9-41.5% of the cells of a frame across the canonical seed 3/7/42/99 sweep at
   * 200x60 — including a `mist` frame where the rain element draws nothing at all, so the entire
   * difference was the 29 elements downstream of it being re-seeded. Behind a fork the drop table
   * costs the shared stream one number whatever RN_MAX is, and slot i's attributes depend only on
   * i, which is what makes the constant safe to tune. sky.js:174 does the same thing for the same
   * reason; the salt matches so the two files read as one idiom. */
  function fork(rng) { return CC.mulberry(((rng() * 4294967296) | 0) ^ 0x5C1E); }

  /* Smooth 2D value noise. core.js only exposes the 1D one, and summing two 1D fields gives
   * plaid-looking banks that read as a texture rather than as weather. */
  function n2(x, z, s) {
    var xi = Math.floor(x), zi = Math.floor(z);
    var fx = smooth(x - xi), fz = smooth(z - zi);
    return lerp(lerp(hash2(xi, zi, s), hash2(xi + 1, zi, s), fx),
                lerp(hash2(xi, zi + 1, s), hash2(xi + 1, zi + 1, s), fx), fz);
  }

  /* ============================================================================================
   * RAIN
   * Two shells of drops, not one. A single uniform box either starves the near field (where rain
   * is supposed to be a legible streak) or floods the far field (where it turns the canyon into
   * static). The near shell is 13 m across and carries the streaks; the far shell is 34 m and
   * contributes single dim cells that only register as texture.
   *
   * Everything about it now tracks the sky: the population, the fall speed, the streak length,
   * the near/far balance, the slant (through the gusting wind), whether the drops are water or
   * sleet, whether they splash, and whether the ledges are still dripping after it stopped.
   * At P.rain 0 the whole element returns before it draws a single cell — a thin rain under a
   * clear sky was the single most obviously wrong thing in the build before the director existed.
   * ==========================================================================================*/
  /* The array is allocated once at the maximum and only a PREFIX of it is walked, because the
   * drop count has to track the grid AND the weather: a streak is measured in cells, so a 400x100
   * grid draws each drop twice as long but has four times the cells to fill, and a world-fixed
   * population that reads as rain at 200x60 disappears at 400x100. The shells are interleaved for
   * exactly this reason — any prefix has to be a valid mix of near and far, and a near-then-far
   * layout would have made the small-window case pure near shell.
   *
   * RN_MAX IS A CAPACITY AND NOTHING ELSE — see fork() above for why that sentence needs saying.
   * It is sized so the cap never bites at any size the project renders at, because a cap that
   * bites is a cap that flattens the difference between rain and a downpour, which is the one
   * difference this file exists to draw. The largest request the presets can make is a downpour
   * (P.rain 1.00, so dens 1.5385 and dens^1.55 1.9497) at the canonical verification size of
   * 400x100: 640 * 1.9497 * 40000/12000 = 4159 drops. At 2800 that request was clamped by a third,
   * and the cap is not a neutral one — it flattened the two heaviest skies into each other. Drawn
   * drops per frame at 400x100, seeds 3/42/99: downpour 947/925/1038 against storm 931/905/997,
   * a ratio of 1.03, where at 200x60 (which neither sky clamps at) the same measurement gives
   * 1.36. Uncapped, 400x100 comes back at 1.32 and agrees with the smaller frame again. Every
   * offline comparison of downpour with storm at the size this project verifies at was reading
   * the cap. The browser never comes near it (main.js caps columns at MAXC and a 4K display gives
   * ~20500 cells, where a downpour asks for 640*1.9497*1.708 = 2131), so this headroom is bought
   * purely so that the size the project verifies at measures the weather and not the cap. The
   * seven arrays cost 25 bytes a slot, i.e. 105 KB allocated once. */
  var RN_MAX = 4200, RN_AT_REF = 640, REF_CELLS = 200 * 60;
  var rOx = null, rOz = null, rBox = null, rSpd = null, rPh = null, rHue = null, rFall = null;
  var rainT = 0;
  /* The city arrives at init() and is wanted in draw() — the drop needs the ground height under
   * it and the vent needs to know it is standing on street. cam.city wins if a caller ever puts
   * one there.
   *
   * ALWAYS assign. The first cut pinned the first city forever (`if (!WCITY) WCITY = city`), and
   * after a #hashchange rebuilt the world the rain was still asking the PREVIOUS city for ground
   * heights while the raycaster drew the new one — drops landing on buildings that were no longer
   * there, vents opening inside walls — and the dead city's chunk cache could never be collected.
   * A stale world reference is not a cosmetic bug; it is a leak with a picture attached. */
  var WCITY = null;
  function bindWorld(city, rng) { WCITY = city || null; initWind(rng); }

  /* ---- how long the city keeps dripping ------------------------------------------------------
   * A street does not dry the moment the rain stops. P.wet already lags rain a little through the
   * director's 14 s blend, but only by that blend, so this is a one-pole low-pass over it with a
   * deliberately asymmetric time constant: wets in about three seconds, dries over three quarters
   * of a minute. That gap IS the post-storm drip period — ledges and awnings go on releasing beads
   * long after the last drop has fallen, and it is the only part of the weather that outlives the
   * weather.
   *
   * Integrated in update() rather than derived from t, because a low-pass has no closed form over
   * a schedule this file cannot see. That is safe for determinism here: main.js and
   * tools/headless.cjs both replay every tick from t=0 in order, so the same seed and the same
   * frame give the same value. The two guards below are what make that true in the edge cases —
   * a dt spike after a tab has been in the background must not integrate a minute in one step,
   * and a viewer scrubbing backwards must not have to wait for the filter to unwind. */
  var wetEma = REF_WET, wetLastT = -1e9, dripAmt = 0;
  function wetIntegrate(dt, t) {
    if (t < wetLastT - 0.001) wetEma = pWet;         // scrubbed backwards; resync, do not unwind
    wetLastT = t;
    if (!(dt > 0)) return;
    if (dt > 0.1) dt = 0.1;
    var k = dt / (pWet > wetEma ? 3.0 : 42.0);
    if (k > 1) k = 1;
    wetEma += (pWet - wetEma) * k;
    /* Clear sits at wet 0.12, and 0.12 has to mean a dry street, not a slow drip forever. */
    dripAmt = clamp((wetEma - 0.22) / 0.52, 0, 1);
  }

  CC.ELEMENTS.push({
    name: 'rain',
    layer: 12,
    /* THE TWO WORLDS WITH AIR IN THEM. Vacuum has no weather; rain on the Moon was diagonal streaks across a black sky.
     * See src/world.js: `world` may be a string or a set, and absent means every world. */
    world: ['cyber', 'west'],
    init: function (city, rng) {
      bindWorld(city, rng);
      /* The drop table is filled from a fork, not from `rng`, so that RN_MAX cannot re-seed the
       * rest of the build — this element takes five numbers per slot and is the only init in the
       * project whose draw count runs to five figures. */
      var r = fork(rng);
      rOx = new Float32Array(RN_MAX); rOz = new Float32Array(RN_MAX);
      rBox = new Float32Array(RN_MAX); rSpd = new Float32Array(RN_MAX);
      rPh = new Float32Array(RN_MAX);  rHue = new Uint8Array(RN_MAX);
      rFall = new Float32Array(RN_MAX);
      for (var i = 0; i < RN_MAX; i++) {
        var near = (i & 1) === 0;
        var b = near ? 13 : 34;
        rBox[i] = b;
        /* The wrap height is per shell and it is NOT a cloud base — it is the shortest cycle that
         * still recycles a drop off the top of the frame. Measured: at forward distance w the
         * visible band of world height is only ~0.77*w metres tall, so an 18 m cycle left a near
         * drop on screen for a tenth of its life and the near field came out empty. These two
         * numbers are the largest that still keep the reset above the top row for their shell. */
        rFall[i] = near ? 6 : 11;
        rOx[i] = r() * b; rOz[i] = r() * b;
        rSpd[i] = 6.5 + r() * 4.5;
        rPh[i] = r();
        /* Almost all rain is achromatic — it is only visible because the city is behind it. The
         * one-in-eight tinted drop is a drop passing through a sign's spill, and it is what stops
         * the rain reading as grey dust. */
        var h = r();
        /* THE TINTED FIFTH IS A DROP PASSING THROUGH A SIGN'S SPILL, so it takes the colour of the
         * light there is. In the city that is neon — ice and azure. On the frontier it is a lantern
         * or a lit window, and both of those are warm; a cyan raindrop over a timber town is the
         * city's palette leaking into a world that has no source for it.
         *
         * `world` is read once at init, from the city, rather than per drop: the pool is built once
         * and a rebuild is what a world change is. */
        var wWest = !!(city && city.world === 'west');
        rHue[i] = h < 0.70 ? P.slate
                : wWest ? (h < 0.86 ? P.white : (h < 0.94 ? P.amber : P.warm))
                        : (h < 0.86 ? P.ice   : (h < 0.94 ? P.amber : P.azure));
      }
      syncWeather(0);
      wetEma = pWet; wetLastT = -1e9;
      dripAmt = clamp((wetEma - 0.22) / 0.52, 0, 1);
      drSeed = smallSeed(rng);
    },
    update: function (dt, t) { rainT = t; syncWeather(t); wetIntegrate(dt, t); },
    draw: function (frame, cam, t) {
      if (!rOx) return;
      var tt0 = t !== undefined ? t : rainT;
      syncWeather(tt0);
      bindView(frame, cam);
      /* Frozen, not slowed: a reduced-motion viewer still gets the wet-street read from the
       * static streaks, and a slow drift is more nauseating than no drift at all. */
      var tt = CC.reducedMotion ? 0 : tt0;
      var city = cam.city || WCITY;
      var rows = frame.rows, cols = frame.cols;

      /* Density relative to the reference sky. Below a fiftieth of it there is no rain at all,
       * which is the whole point of the clear preset: not a thin rain, none. */
      var dens = clamp(dRain, 0, 1.62);
      if (dens > 0.02) {
        /* Screen lean per row is distance-independent — the ratio of crosswind to fall speed,
         * corrected for the cell being 0.5625 as wide as it is tall. It reads the gusting wind, so
         * the whole curtain leans and straightens as the gust walks through. */
        var wRight = WIND.x * vRgx + WIND.z * vRgz;

        /* The population is the density to the power of 1.55, not the density. Linear scaling made
         * every sky between drizzle and downpour look like the same rain at slightly different
         * brightness — the ratio between the lightest and the heaviest is only 1.54 as a raw
         * parameter, and the eye does not read a 54% change in a field of streaks as weather. The
         * exponent stretches that to 1.95x at a downpour and 0.30x at a drizzle while leaving 1.0
         * exactly 1.0, which is the whole trick: the reference sky is a fixed point of x^n. */
        var use = (RN_AT_REF * Math.pow(dens, 1.55) * cols * rows / REF_CELLS) | 0;
        if (use > RN_MAX) use = RN_MAX; else if (use < 24) use = 24;
        /* The far shell is what fills the canyon with static, and a drizzle has no business
         * filling anything. Below the reference sky it thins out first and the near streaks are
         * the last thing left, which is what light rain actually looks like down a long street. */
        var farUse = use * clamp(0.55 + 0.45 * dens, 0, 1);
        /* The streak cap is in cells, so it has to grow with the grid too, or a 100-row frame gets
         * the same four-cell stub a 60-row frame does and the near rain stops reading as fast. It
         * also grows with the rain: a downpour falls faster and exposes longer. */
        var nMax = ((rows / 15) * (0.55 + 0.45 * dens)) | 0;
        if (nMax < 2) nMax = 2; else if (nMax > 8) nMax = 8;
        /* Sleet is a hard little particle: it falls faster, streaks shorter and is brighter than
         * water because it is a scatterer rather than a lens. */
        var fallK = (0.72 + 0.28 * dens) * (1 + 0.28 * wSleet);
        /* Gust sheets. A curtain of rain is not uniform — the wind walks it up the street in
         * bands, and this is that band pattern sampled in WORLD space along the wind direction so
         * that it travels at the wind's own speed and every drop inside a band agrees about it.
         *
         * THE BAND MUST BE SMALLER THAN THE SHELL IT MODULATES, and the first cut was not. At
         * SH_K 0.085 one band was 11.8 m of world distance while the near shell is only 13 m
         * across and both shells are wrapped around the camera, so every drop in the frame was
         * standing in the SAME band and the "sheet" was a global brightness dial. Measured at
         * 400x100 with a frozen camera and a frozen sky, counting this element's CC.put calls per
         * frame over 60 s: downpour at seed 3 had a median of 947 drops and a minimum of 14, in
         * five off-cycles of a third of a second each; seed 42 was worse, seventeen of them and a
         * minimum of ZERO — a downpour with no rain in it for two and a half continuous seconds,
         * and a storm at the same seed for four and a half. Seed 99 never blinked at all, which is
         * what made it survive review: the wind direction and base speed are per-city, so whether
         * the piece's heaviest sky switches itself off depends on the seed. At 0.24 a band is
         * 4.2 m, so three sit across the near shell and eight across the far one, and a gust
         * becomes a thing that walks past you rather than a light being turned off.
         *
         * The travel term MUST use the same constant: shPh is in the same noise-space units as the
         * sample, so the pair is what makes the bands move at exactly WIND.speed. Two literal
         * 0.085s meant one of them could be tuned without the other, at which point the sheets
         * start sliding at the wrong speed for the wind that is drawing them.
         *
         * SH_MIN is the floor, and it is what stops the modulation ever being an extinction: the
         * old code culled the drop outright below 0.30, which is not a gust, it is the rain being
         * switched off. A gust thins a curtain. Mean is now a shade over 1 rather than exactly 1,
         * which is the right side to err on — the cull it replaces took brightness away. */
        var SH_K = 0.24, SH_MIN = 0.30;
        var shAmp = clamp(0.62 * dWind, 0, 1.0);
        var shPh = -tt * WIND.speed * SH_K;
        var splash = clamp((pRain - 0.60) / 0.40, 0, 1);

        for (var i = 0; i < use; i++) {
          if ((i & 1) === 1 && i >= farUse) continue;   // far shell thinned; near shell never is
          var b = rBox[i];
          var wx = vX + wrap(rOx[i] - vX, b);
          var wz = vZ + wrap(rOz[i] - vZ, b);

          var rx = wx - vX, rz = wz - vZ;
          var w = rx * vFwx + rz * vFwz;
          if (w < 0.5) continue;                       // behind the eye; cheapest possible cull
          var rr = rx * vRgx + rz * vRgz;
          if (rr > vHalf * 1.3 * w || rr < -vHalf * 1.3 * w) continue;

          /* The band this drop is standing in. Sampled at the drop's absolute world position, not
           * at its wrapped offset, so a drop that has just recycled across the box joins the band
           * that is passing over it rather than carrying the old one with it. */
          var sh = vnoise((wx * WIND.dirX + wz * WIND.dirZ) * SH_K + shPh, wSeed + 61);
          var sm = 1 - shAmp + 2 * shAmp * sh;
          /* The near shell is lifted FIRST and then floored, in that order. Written the other way
           * round — which is how it shipped — the lift ran after a `continue` that had already
           * thrown the drop away, and since the lift's own output floor of 0.35 sits above the old
           * 0.30 cutoff it could not have rescued a single drop even if it had run. The line said
           * "near streaks blink if fully modulated" and then let them blink. */
          if ((i & 1) === 0) sm = 0.35 + 0.65 * sm;    // near streaks read as fast or not at all
          if (sm < SH_MIN) sm = SH_MIN;                // the gap between two curtains is thin, not empty

          var spd = rSpd[i] * fallK;
          /* Rain lands ON things. Cycling the drop between the LOCAL surface height and the wrap
           * height above it means a drop over a roof stops at the parapet instead of sinking into
           * the building, where CC.put would have hidden it anyway and the near field would have
           * thinned out. */
          var fall = rFall[i];
          var gh = city ? city.height(wx, wz) : 0;
          var ph = frac(rPh[i] + tt * spd / fall);
          var y = gh + fall * (1 - ph);
          var sleet = wSleet > 0.02 && hash1(i, wSeed + 71) < wSleet;

          if (!project(wx, y, wz)) continue;
          var xf = pjX, yf = pjY, d = pjD;

          /* Exposure streak: how far this drop falls in one 20 ms shutter, in rows. Near drops get
           * a long streak and far drops a single cell, which is the whole "heavier near" read —
           * no density gradient needed. */
          var n = (spd * 0.021 * vScale / pjW) | 0;
          if (sleet) n = (n * 0.45) | 0;
          if (n > nMax) n = nMax;
          var lean = (wRight / spd) / vCellA;
          if (sleet) lean *= 0.55;                     // heavier than water; the wind gets less of it

          var base = (b < 20 ? 118 : 68 * (0.70 + 0.30 * dens)) *
                     (1 - clamp(pjW / (b < 20 ? 15 : 30), 0, 0.68)) * sm;
          var hue = sleet ? (hash1(i, wSeed + 73) < 0.45 ? P.ice : P.white) : rHue[i];
          var gl = lean > 0.55 ? G_BSL : (lean < -0.55 ? G_SLASH : G_PIPE);
          if (sleet) gl = n === 0 ? G_STAR : G_SEMI;   // a hailstone is a grain, not a stroke
          else if (n === 0) gl = d > 14 ? G_DOT : G_QUOTE;

          for (var k = 0; k <= n; k++) {
            var sy = Math.floor(yf - k);
            if (sy < 0 || sy >= rows) continue;
            var sx = Math.floor(xf + lean * k);
            if (sx < 0 || sx >= cols) continue;
            /* The tail is the older, more spread part of the streak, so it fades. */
            var lm = fogLum(base * (1 - k * 0.19), d);
            if (lm < 5) continue;
            put(frame, sx, sy, gl, hue, lm, d);
          }

          /* Splash-back. The drop is about to reach the surface it is falling onto — ph runs to 1
           * at the moment of impact — so the crown is drawn at the drop's own landing point, which
           * costs no search and puts the splash exactly where the eye just watched something land.
           * Only the near shell: a splash 30 m down the street is a quarter of a cell.
           * Gated hard, because at a downpour's density every near drop landing in the same sixth
           * of a second would carpet the road: a quarter of them splash, and only above the
           * reference rain, so `rain` keeps the road it already had and a downpour gets the band of
           * ticks that says how hard it is coming down. */
          if (splash > 0 && (i & 1) === 0 && ph > 0.94 && hash1(i, wSeed + 79) < 0.30 * splash) {
            var sa = (ph - 0.94) / 0.06;               // 0 at contact, 1 as the crown collapses
            var slum = fogLum(126 * splash * (1 - sa * 0.75), d);
            if (slum > 6 && project(wx, gh + 0.05, wz)) {
              var bx = Math.floor(pjX), by = Math.floor(pjY);
              var shue = hash1(i, wSeed + 83) < 0.6 ? P.amber : P.ice;
              put(frame, bx, by, sleet ? G_DOT : G_UNDER, shue, slum, pjD);
              var lift = sa < 0.5 ? 1 : 2;              // the crown climbs as it opens out
              put(frame, bx - 1, by - lift, G_QUOTE, shue, slum * 0.7, pjD);
              put(frame, bx + 1, by - lift, G_TICK, shue, slum * 0.7, pjD);
            }
          }
        }
      }

      /* Drips run off the same element because they are the same water, and because they must
       * outlive the drops: this is the whole post-storm period. */
      if (dripAmt > 0.02 && city) drips(frame, city, tt);
    }
  });

  /* ---- ledges and awnings --------------------------------------------------------------------
   * Sources are found the way the steam finds its grates — by hashing a world lattice around the
   * camera each frame — but with one extra condition that makes them ledges rather than puddles:
   * the point must be standing on the street with a WALL within reach of it. That is the awning
   * line, the strip of pavement under the overhang, and it is where a city drips from.
   *
   * The fall is real: y = h - g*t^2/2, so the bead accelerates and the last few centimetres are
   * two cells instead of one. A linear fall reads as a lift descending. */
  var DR_PITCH = 3.0, DR_R = 21, DR_P = 0.30, drSeed = 0;
  function drips(frame, city, tt) {
    var gi0 = Math.floor((vX - DR_R) / DR_PITCH), gi1 = Math.floor((vX + DR_R) / DR_PITCH);
    var gj0 = Math.floor((vZ - DR_R) / DR_PITCH), gj1 = Math.floor((vZ + DR_R) / DR_PITCH);
    var rows = frame.rows;

    for (var gj = gj0; gj <= gj1; gj++) {
      for (var gi = gi0; gi <= gi1; gi++) {
        if (hash2(gi, gj, drSeed) > DR_P) continue;
        var px = gi * DR_PITCH + hash2(gi, gj, drSeed + 11) * DR_PITCH * 0.9;
        var pz = gj * DR_PITCH + hash2(gi, gj, drSeed + 22) * DR_PITCH * 0.9;

        /* Frustum reject before any heightmap work: city.height() is a chunk lookup and this
         * lattice is 15x15 points a frame. */
        var rx = px - vX, rz = pz - vZ;
        var w0 = rx * vFwx + rz * vFwz;
        if (w0 < 0.8 || w0 > 26) continue;
        var r0 = rx * vRgx + rz * vRgz;
        if (r0 > vHalf * 1.4 * w0 + 3 || r0 < -(vHalf * 1.4 * w0 + 3)) continue;
        if (city.height(px, pz) > 0) continue;         // inside a building; there is no pavement here

        /* One of the four cardinal directions, and the wall has to be in it. Testing all four
         * would double the heightmap traffic to find the same ledges twice as often. */
        var q = hash2(gi, gj, drSeed + 33);
        var dx = q < 0.25 ? 1 : (q < 0.5 ? -1 : 0);
        var dz = q < 0.5 ? 0 : (q < 0.75 ? 1 : -1);
        if (!(city.height(px + dx * 1.4, pz + dz * 1.4) > 0)) continue;

        /* Sit the drip line just under the overhang rather than out in the road. */
        var lx = px + dx * 0.55, lz = pz + dz * 0.55;
        var h = 2.5 + hash2(gi, gj, drSeed + 44) * 1.2;
        var tf = Math.sqrt(h / 4.9);                   // seconds of fall, real gravity
        /* Drying slows the drip rate before it stops it, which is what a ledge does. */
        var per = (0.55 + hash2(gi, gj, drSeed + 55) * 1.30) / (0.25 + 0.75 * dripAmt);

        /* Ice is a GLINT, never a surface, and a bead of water catching a streetlight is the
         * definition of one — but only a third of them are angled to catch it. The rest are the
         * slate of unlit water, and the ones that land are the amber of the lamp that lit the
         * pavement they landed on. */
        var hue = hash2(gi, gj, drSeed + 66) < 0.35 ? P.ice : P.slate;
        var lhue = hash2(gi, gj, drSeed + 88) < 0.55 ? P.amber : P.ice;

        for (var k = 0; k < 2; k++) {
          /* The lattice cell goes in as a COORDINATE, never as an addition to the seed: a walk long
           * enough takes gi into the thousands, and folding that into the seed slides every drip in
           * the city onto a different hash stream as the camera travels. */
          var p = frac(tt / per + k * 0.5 + hash2(gi * 2 + k, gj, drSeed + 77));
          var age = p * per;
          if (age > tf + 0.14) continue;               // gone; the bead has not re-formed yet
          if (age > tf) {
            /* Landed. A single bright tick on the wet pavement, for two frames' worth of time. */
            if (!project(lx, 0.04, lz)) continue;
            var ll = fogLum(150 * dripAmt * (1 - (age - tf) / 0.14), pjD);
            if (ll < 6) continue;
            put(frame, Math.floor(pjX), Math.floor(pjY), G_UNDER, lhue, ll, pjD);
            continue;
          }
          var y = h - 4.9 * age * age;
          /* Drift is tiny — the drip is heavy and the fall is short — but a ledge in a gale does
           * not drip straight down, and it comes free from the shared wind. */
          if (!project(lx + WIND.x * age * 0.05, y, lz + WIND.z * age * 0.05)) continue;
          var lum = fogLum((66 + 90 * (age / tf)) * dripAmt, pjD);
          if (lum < 6) continue;
          var cy = Math.floor(pjY), cx = Math.floor(pjX);
          put(frame, cx, cy, age < tf * 0.35 ? G_DOT : G_QUOTE, hue, lum, pjD);
          /* Past halfway it is moving fast enough to expose as a short streak. */
          if (age > tf * 0.55 && cy - 1 >= 0 && cy - 1 < rows)
            put(frame, cx, cy - 1, G_QUOTE, hue, lum * 0.55, pjD);
        }
      }
    }
  }

  /* ============================================================================================
   * STEAM — grates, street vents, and the viewer's own breath
   * Sources are found by hashing a world lattice around the camera each frame rather than being
   * stored, so the walk can go on forever without a spawn list that grows without bound. The
   * plume itself is a pure function of t, which means no accumulated state to drift out of sync
   * when the frame rate changes or the viewer scrubs.
   * ==========================================================================================*/
  /* Most lattice points land inside a building and are thrown away, so the hit rate below is not
   * the vent density on the street — it is about a fifth of it. At pitch 4 and p=0.28 the walk
   * passes a working grate every twenty seconds or so, which is what "occasional" means here. */
  var ST_PITCH = 4, ST_R = 24, ST_NP = 5, ST_P = 0.28;
  var stSeed = 0, stT = 0;

  CC.ELEMENTS.push({
    name: 'steam',
    /* CITY ONLY. See src/world.js: an element with no `world` belongs to both, and main.js
     * filters CC.ELEMENTS on this before the layer sort. */
    world: 'cyber',
    layer: 14,
    init: function (city, rng) {
      bindWorld(city, rng);
      stSeed = smallSeed(rng);
    },
    update: function (dt, t) { stT = t; syncWeather(t); },
    draw: function (frame, cam, t) {
      var tt0 = t !== undefined ? t : stT;
      syncWeather(tt0);
      bindView(frame, cam);
      var city = WCITY;
      if (!city) return;
      var tt = CC.reducedMotion ? 7.3 : tt0;
      /* Cold air condenses more of it and warm air takes it back before it clears the grate, so
       * the volume tracks P.steam and the chill together. */
      var vol = clamp(0.35 + 0.65 * dSteam, 0, 1.5) * (1 + 0.25 * wBreath);
      var gate = ST_P * vol;
      var gi0 = Math.floor((vX - ST_R) / ST_PITCH), gi1 = Math.floor((vX + ST_R) / ST_PITCH);
      var gj0 = Math.floor((vZ - ST_R) / ST_PITCH), gj1 = Math.floor((vZ + ST_R) / ST_PITCH);

      for (var gj = gj0; gj <= gj1; gj++) {
        for (var gi = gi0; gi <= gi1; gi++) {
          if (hash2(gi, gj, stSeed) > gate) continue;
          var sx = gi * ST_PITCH + hash2(gi, gj, stSeed + 11) * ST_PITCH * 0.9;
          var sz = gj * ST_PITCH + hash2(gi, gj, stSeed + 22) * ST_PITCH * 0.9;

          /* Cheap frustum reject before touching the heightmap: city.height() is a chunk lookup
           * and the lattice is 13x13 points a frame. */
          var rx = sx - vX, rz = sz - vZ;
          var w0 = rx * vFwx + rz * vFwz;
          if (w0 < -2 || w0 > 42) continue;
          var r0 = rx * vRgx + rz * vRgz;
          if (r0 > vHalf * 1.5 * w0 + 6 || r0 < -(vHalf * 1.5 * w0 + 6)) continue;
          if (city.height(sx, sz) > 0) continue;      // a vent inside a building is a vent nobody sees

          var sd = (hash2(gi, gj, stSeed + 33) * 30011) | 0;
          /* Cold air holds the plume together for longer; wind shears it apart and flattens its
           * climb, which is why the rise falls off as the wind rises rather than rising with it. */
          var life = (3.2 + hash2(gi, gj, stSeed + 44) * 2.4) * (1 + 0.45 * wBreath);
          /* Both factors are 1.0 at the reference sky — 0.70+0.30 and 1-0 — which is the migration
           * rule: a scale that comes out at 1.15 under `rain` has quietly re-tuned the element. */
          var rise = (0.72 + hash2(gi, gj, stSeed + 55) * 0.55) *
                     (0.70 + 0.30 * clamp(dSteam, 0, 1.4)) * (1 - 0.22 * clamp(dWind - 1, 0, 1));
          /* A third of the sources are a dry exhaust rather than a steam grate: same shape, much
           * dimmer and colder, so the street does not read as a laundry. */
          var smoke = hash2(gi, gj, stSeed + 66) < 0.34;
          var pk = (smoke ? 46 : 88) * clamp(0.55 + 0.45 * dSteam, 0, 1.35);
          plume(frame, sx, sz, sd, life, rise, pk, smoke, tt);
        }
      }

      /* The viewer is standing in the same cold air as the grates are. */
      if (wBreath > 0.15) breath(frame, tt);
    }
  });

  function plume(frame, sx, sz, sd, life, rise, peak, smoke, tt) {
    var rows = frame.rows, cols = frame.cols;
    for (var k = 0; k < ST_NP; k++) {
      var p = frac(tt / life + k / ST_NP + hash2(k, 0, sd));
      var age = p * life;
      var y = 0.12 + age * rise;
      /* Drift is the puff's whole history of wind, so it integrates: the top of a plume trails
       * further downwind than its root, which is what makes it read as rising and not sliding.
       * It reads the gusting vector, so a gust bends the whole column over and it straightens
       * again from the root up as the gust passes. */
      var wob = (vnoise(age * 0.9 + k * 3.7, sd) - 0.5) * age * 0.55;
      var px = sx + WIND.x * age * 0.34 + wob;
      var pz = sz + WIND.z * age * 0.34 - wob * 0.6;
      if (!project(px, y, pz)) continue;

      /* Fade in fast off the grate, out slowly: a puff appears already formed and then thins.
       * Multiplying the two ramps rather than squaring one keeps the middle of the puff's life at
       * full brightness — squaring it left the whole plume at a third of peak and invisible. */
      var a = clamp(p / 0.12, 0, 1) * clamp((1 - p) / 0.55, 0, 1);
      /* GUTTERING. A vent does not breathe evenly; it surges and lulls. The surge is sampled at
       * the time this puff LEFT the grate — tt-age, not tt — so it travels up the column with the
       * air that carried it. Sampling it at the current time instead brightens and dims the whole
       * plume at once, which is a pulse: exactly the uniform throb this replaces. */
      var gut = vnoise((tt - age) * 0.42 + sd * 0.013, sd + 77);
      /* 0.66 + 1.09*u^2 has MEAN 1 over this noise, which is the whole reason those two numbers
       * are not round: E[u^2] for a smoothstep-interpolated value field is 0.312, not the 0.333 a
       * uniform would give. A gutter that averages 0.65 is not a gutter, it is a 35% dimmer on the
       * whole element, and it would have re-tuned the steam under the very preset it was tuned in. */
      var lum0 = peak * a * (0.66 + 1.09 * gut * gut);
      if (lum0 < 5) continue;
      /* Sodium light only reaches the first couple of metres above the road. Above that the plume
       * is lit by nothing and goes slate — that vertical colour break is most of the depth cue,
       * and the amber root is what ties the steam to the street lighting instead of leaving it a
       * grey smudge floating in the canyon. */
      var hue = (!smoke && y < 2.2) ? P.amber : P.slate;

      var rad = 0.22 + age * 0.30;
      var rv = rad * vScale / pjW;
      var kv = rv < 0.75 ? 0 : 1;
      var rh = rv / vCellA;
      var kh = rh < 0.75 ? 0 : (rh < 1.9 ? 1 : 2);
      var cx = Math.floor(pjX), cy = Math.floor(pjY), d = pjD;

      for (var dy = -kv; dy <= kv; dy++) {
        var yy = cy + dy; if (yy < 0 || yy >= rows) continue;
        for (var dx = -kh; dx <= kh; dx++) {
          var xx = cx + dx; if (xx < 0 || xx >= cols) continue;
          /* Keyed on the puff and the offset, never on screen position, so the holes in the puff
           * travel with it instead of shimmering in place. */
          var hh = hash2(k * 17 + dx, dy * 5, sd + 401);
          if (hh > 0.42) continue;
          var lm = fogLum(lum0 * (0.55 + hh * 1.05), d);
          if (lm < 5) continue;
          /* In cold air a few cells go white — condensed water rather than warm vapour. It is a
           * handful of cells and it is the difference between steam and breath. */
          var hue2 = (hue === P.slate && wBreath > 0.5 && hh < 0.10) ? P.white : hue;
          put(frame, xx, yy, hh < 0.14 ? G_COLON : (hh < 0.28 ? G_DOT : G_COMMA), hue2, lm, d);
        }
      }
    }
  }

  /* ---- the viewer's breath --------------------------------------------------------------------
   * The one thing in the file that is camera-relative rather than world-fixed, and deliberately:
   * it is attached to the person doing the looking. Three puffs on a 4.4 s cycle, launched a metre
   * in front of the eye, drifting off with the wind and dying inside two metres. It only exists
   * when the derived chill says the air is cold enough to condense it, so most nights never see it.
   * It sits BELOW the eye line — breath leaves a mouth, not a forehead — which also keeps it out of
   * the middle of the picture. */
  function breath(frame, tt) {
    var rows = frame.rows, cols = frame.cols;
    var per = 4.4;
    for (var k = 0; k < 3; k++) {
      var p = frac(tt / per + k * 0.16);
      if (p > 0.55) continue;                          // most of the cycle is between breaths
      var age = p * per;
      var fwd = 0.85 + age * 0.55;
      var px = vX + vFwx * fwd + WIND.x * age * 0.22;
      var pz = vZ + vFwz * fwd + WIND.z * age * 0.22;
      var y = vEyeY - 0.26 + age * 0.16;
      if (!project(px, y, pz)) continue;
      var a = clamp(age / 0.25, 0, 1) * clamp((2.4 - age) / 1.6, 0, 1);
      var lum0 = 58 * a * wBreath;
      if (lum0 < 5) continue;
      var rad = 0.07 + age * 0.16;
      var rv = rad * vScale / pjW;
      var kv = rv < 0.8 ? 0 : 1;
      var rh = rv / vCellA;
      var kh = rh < 0.8 ? 0 : (rh < 2.2 ? 1 : 2);
      var cx = Math.floor(pjX), cy = Math.floor(pjY), d = pjD;
      for (var dy = -kv; dy <= kv; dy++) {
        var yy = cy + dy; if (yy < 0 || yy >= rows) continue;
        for (var dx = -kh; dx <= kh; dx++) {
          var xx = cx + dx; if (xx < 0 || xx >= cols) continue;
          var hh = hash2(k * 13 + dx, dy * 7, wSeed + 503);
          if (hh > 0.38) continue;
          /* White for the core of the puff and slate for its edge: white is structure, not light,
           * and a breath that is white all through reads as a printed shape rather than as vapour. */
          put(frame, xx, yy, hh < 0.16 ? G_DOT : G_COMMA,
              hh < 0.18 ? P.white : P.slate, lum0 * (0.5 + hh), d);
        }
      }
    }
  }

  /* ============================================================================================
   * FOG BANKS, and the collapse of visibility
   * The bank is drawn as the top surface of a shallow layer of air, sampled per screen row by the
   * same inverse projection the road uses. Because the layer sits at 0.85 m and the eye at 1.7 m,
   * its depth at any row is roughly half the road's depth at that row, so it wins the depth test
   * against the tarmac and loses it against anything standing on the tarmac. That is exactly the
   * behaviour wanted and it falls out of the geometry rather than out of a fudge factor.
   *
   * Above the reference sky it stops being a bank at all and becomes the medium the city is
   * standing in: the VEIL pass at the bottom re-reads what is already in the frame and takes it
   * away with distance. That is the difference between `mist` and everything else — mist is not
   * rain with fewer drops, it is a state where the far end of the street is simply not there.
   * ==========================================================================================*/
  var fgSeed = 0, fgT = 0;
  /* Fewer cells, brighter each. At a 0.40 dither the bank cost 1.2 points of coverage and was
   * still invisible — a lot of lum-12 slate is just an expensive way to draw nothing. */
  var FG_TOP = 0.85, FG_TH = 0.44, FG_DITHER = 0.34;

  CC.ELEMENTS.push({
    name: 'fogbank',
    layer: 8,
    /* THE TWO WORLDS WITH AIR IN THEM. Fog is suspended water. There is none.
     * See src/world.js: `world` may be a string or a set, and absent means every world. */
    world: ['cyber', 'west'],
    init: function (city, rng) {
      bindWorld(city, rng);
      fgSeed = smallSeed(rng);
    },
    update: function (dt, t) { fgT = t; syncWeather(t); },
    draw: function (frame, cam, t) {
      var tt0 = t !== undefined ? t : fgT;
      syncWeather(tt0);
      bindView(frame, cam);
      var tt = CC.reducedMotion ? 0 : tt0;
      var rows = frame.rows, cols = frame.cols;
      var thick = clamp(dFog, 0, 3.4);
      /* The layer deepens with the fog: a floor mist at 0.85 m, and by the `mist` preset it is up
       * around the shoulders, which is what actually removes the road from the picture rather than
       * decorating it. Capped below the eye — once the camera is inside the layer the top surface
       * is behind the viewer and there is nothing left to draw. */
      var top = FG_TOP + 0.42 * clamp(thick - 1, 0, 2.4) - 0.30 * clamp(1 - thick, 0, 1);
      /* The top surface must stay below the eye by a real margin. Let it climb to the eye line and
       * the inverse projection degenerates — every row below the horizon returns almost the same
       * distance — and the bank prints as one hard bar ruled across the street instead of a floor
       * that recedes. Thick fog is sold by the veil below, not by pushing this to the eye. */
      if (top > vEyeY - 0.45) top = vEyeY - 0.45;
      var rise = vEyeY - top;
      if (rise < 0.15) return;                       // camera has ducked into the layer
      /* Threshold down and dither up together: the bank both spreads and fills in. Every one of the
       * three moves in BOTH directions around the reference — `hi` for skies thicker than `rain`,
       * `lo` for thinner ones — because a coefficient that only reads clamp(thick-1,0,..) is zero
       * for every sky below the reference and `clear` at P.fog 0.08 would draw the identical floor
       * mist `rain` does at 0.30. The thin end is as much of this element's job as the thick end.
       *
       * The thick-end coefficients are deliberately modest: the first cut ran them to a 0.10
       * threshold, a 0.95 dither and a 2.3x glow, and mist cost four and a half points of lit
       * coverage in the floor bank alone — a white carpet down the road, not a fog. The collapse of
       * visibility is the veil's job; the bank only has to thicken enough to say the air is full. */
      var hi = clamp(thick - 1, 0, 2.4), lo = clamp(1 - thick, 0, 1);
      var th = clamp(FG_TH - 0.075 * hi + 0.17 * lo, 0.10, 0.90);
      var dith = clamp(FG_DITHER * (1 + 0.28 * hi - 0.60 * lo), 0, 0.95);
      var glow = 1 + 0.16 * hi - 0.30 * lo;
      /* Near and far limits of the bank. In thick fog it starts at your feet. */
      var nearW = lerp(4.5, 1.6, clamp(thick - 1, 0, 1));
      var farW = lerp(70, 96, clamp(thick - 1, 0, 1));

      /* Only the low-frequency octave travels — the fine one is welded to the ground, so the bank
       * evolves instead of sliding past as one rigid sheet. It moves at 0.18 of the wind, converted
       * into noise-space units by the same 0.058 the sample uses: fog in the lee of a canyon barely
       * moves, and at full wind speed the bank read as a scrolling texture. */
      var drx = WIND.x * tt * 0.18 * 0.058, drz = WIND.z * tt * 0.18 * 0.058;
      var r0 = Math.ceil(vHorizon);

      for (var r = r0; r < rows; r++) {
        var den = r + 0.5 - vHorizon;
        if (den < 0.85) continue;
        var w = rise * vScale / den;
        if (w > farW) continue;
        if (w < nearW) break;                          // nearer rows are inside the layer, not under it
        /* Thin the bank out at both ends of its range: a hard edge at the near limit reads as a
         * line ruled across the street. */
        var band = clamp((w - nearW) / 6, 0, 1) * clamp((farW - w) / 22, 0, 1);
        /* The most a cell on this row can be dithered against. `amt` below is
         * (bank-th)/(1-th)*band and both noises land in [0,1), so amt is strictly under `band` and
         * this product is strictly above amt*dith — which makes the cheap test in the loop an
         * EXACT rejection rather than an approximation of one. See the comment there. */
        var bandDith = band * dith;

        for (var x = 0; x < cols; x++) {
          var sp = (2 * (x + 0.5) / cols - 1) * vHalf;
          var dx = vFwx + vRgx * sp, dz = vFwz + vRgz * sp;
          var px = vX + dx * w, pz = vZ + dz * w;

          /* THE DITHER IS TESTED FIRST, and that ordering is the whole cost of this element.
           * The bank is dithered, never filled, so the great majority of the cells this loop walks
           * were always going to be thrown away by the `hh > amt * dith` test at the bottom — and
           * hh is ONE hash2 where the coarse octave below is four of them plus three lerps.
           * Measured at 260x100, seed 42, one frame per sky: the loop evaluated 4680-7280 cells to
           * draw 6 of them at `clear`, 45 at `rain` and 119 at `mist`. Hoisting the hash and
           * testing it against the row's upper bound rejects the doomed cells for a quarter of the
           * arithmetic. Nothing about the picture moves: hh > bandDith implies hh > amt*dith, so
           * every cell rejected here is a cell the old order rejected too, and the canonical
           * 16-frame sweep at 400x100 is byte-identical before and after.
           *
           * This is also why the bank has no weather gate and must not grow one. It is cheap at a
           * clear sky because almost nothing survives the dither, not because it is switched off,
           * and the thin floor mist a dry night gets is as much this element's job as a mist is. */
          var hh = hash2(Math.floor(px * 1.7), Math.floor(pz * 1.7), fgSeed + 7);
          if (hh > bandDith) continue;

          /* The coarse octave carries 0.70 of the weight, so once it is under this the fine octave
           * cannot lift the sum over the threshold however it lands — and skipping it saves four
           * more hashes on the cell. The radial distance is derived BELOW this test and not above
           * it for the same reason: `d` costs a sqrt and only a surviving cell has any use for it.
           * Moving a test that can only reject to a later point in the same iteration cannot
           * change which cells are drawn. */
          var coarse = n2(px * 0.058 + drx, pz * 0.058 + drz, fgSeed);
          if (coarse * 0.70 + 0.30 <= th) continue;
          var d = w * Math.sqrt(1 + sp * sp);
          if (d > farW + 2) continue;
          var bank = coarse * 0.70 + n2(px * 0.185, pz * 0.185, fgSeed + 5) * 0.30;
          if (bank <= th) continue;
          var amt = (bank - th) / (1 - th) * band;
          /* Dithered, never filled. A solid low-lum fill here is the grey veil the whole project
           * is built to avoid — it flattens the canyon in one pass. `hh` was already drawn at the
           * top of the loop against this row's upper bound; this is the exact test it approximated. */
          if (hh > amt * dith) continue;
          var lm = fogLum((14 + amt * 42) * glow, d);
          if (lm < 5) continue;
          put(frame, x, r, hh < 0.06 ? G_TILDE : (hh < 0.12 ? G_UNDER : G_DASH), P.slate, lm, d);
        }
      }

      veil(frame);
    }
  });

  /* ---- the veil ------------------------------------------------------------------------------
   * Aerial perspective as a medium rather than as a curve: every cell already in the frame is
   * asked how far away it is, and past a distance that shortens as the fog thickens it is either
   * dimmed toward extinction or replaced outright by fog grain. That is what makes `mist` collapse
   * — the far facades, the far signs and the far road do not fade to a tasteful haze, they stop
   * being in the picture.
   *
   * IT DOES NOTHING AT OR BELOW THE REFERENCE SKY. The drive is 0.3165 under `rain` against a gate
   * that opens at 0.34, so drizzle, rain and clear print exactly what they printed before this pass
   * existed; mist pays for almost all of it and a downpour, whose own falling water is a medium
   * whatever the fog parameter says, pays for the rest.
   *
   * Depth is honoured, not faked: a replaced cell is written at 0.999 of its own distance, so it
   * still occludes correctly against everything drawn after it and the tone curve still treats it
   * as far geometry. Writing the grain at a near distance instead would have let it swallow signs
   * and rain that are physically in front of it. */
  function veil(frame) {
    /* A downpour carries its own haze; it is a small term next to fog's, and it is why the far end
     * of a heavy rain closes in even though the fog parameter has barely moved. */
    var drive = pFog + 0.55 * clamp(pRain - 0.62, 0, 0.38);
    var v = clamp((drive - 0.34) / 0.50, 0, 1);
    if (v < 0.015) return;
    var cols = frame.cols, rows = frame.rows;
    var ch = frame.ch, kind = frame.kind, dist = frame.dist, lum = frame.lum, col = frame.col;
    /* Where the medium starts to bite and where it has finished. At full mist the street is gone
     * by thirty metres, which is about four shopfronts. */
    var v0 = lerp(52, 7, v), v1 = lerp(120, 30, v);
    var inv = 1 / (v1 - v0);
    /* The sky slot fills in last and only in deep fog — a low cloud ceiling you cannot see past.
     * It is written at 45 m rather than at the fog's near edge so that the rain, the steam and the
     * signage in the first forty metres still draw over it; parking it at FOG_START would have cut
     * the top off every raindrop above the rooftop line. */
    var skyV = clamp((v - 0.35) / 0.5, 0, 1);
    var skyD = 45;

    for (var y = 0; y < rows; y++) {
      for (var x = 0; x < cols; x++) {
        var i = y * cols + x, d = dist[i];
        if (d >= vFar) {
          if (skyV < 0.02) continue;
          var sh = hash2(x, y, fgSeed + 61);
          if (sh > skyV * 0.34) continue;
          put(frame, x, y, sh < 0.05 ? G_TILDE : (sh < 0.14 ? G_DASH : G_DOT),
              P.slate, (11 + 26 * skyV) * (0.6 + sh), skyD);
          continue;
        }
        if (d <= v0 || ch[i] === 0) continue;
        var a = (d - v0) * inv;
        if (a > 1) a = 1;
        a *= v;
        /* Screen-stable grain, not a per-frame reroll: the medium is between the eye and the wall,
         * so its texture belongs to the view, and a hash including t would boil. */
        var hh = hash2(x, y, fgSeed + 51);
        if (hh < a * 0.34) {
          /* Taken by the fog. Ambient back-scatter rises with the depth of medium in front of the
           * cell and then falls away again with distance, which is what makes a fog bright near a
           * streetlight and black at the end of the road.
           *
           * A CELL THAT WAS CARRYING A LIGHT KEEPS ITS COLOUR. Fog does not turn a sodium lamp
           * grey, it turns it into a sodium-coloured smudge twice the size — so where the cell
           * underneath is brighter than the ambient the grain inherits its swatch at a fraction of
           * its luminance, and everywhere else it is slate. That single branch is the difference
           * between a fog with a city glowing inside it and a grey sheet pulled over the frame. */
          var amb = (9 + 30 * a) * (1 - 0.55 * clamp(d / 70, 0, 1));
          var halo = lum[i] * 0.40;
          var lm = halo > amb ? halo : amb;
          var hue = halo > amb ? col[i] : P.slate;
          if (lm < 4) lm = 4;
          put(frame, x, y, hh < 0.05 * a ? G_TILDE : (hh < 0.20 * a ? G_DASH : G_DOT),
              hue, lm, d * 0.999, 3);
        } else {
          var l0 = lum[i];
          if (l0 < 3) continue;
          var nl = l0 * (1 - 0.86 * a);
          if (nl >= l0 - 0.5) continue;                // nothing to gain from rewriting the cell
          put(frame, x, y, ch[i], col[i], nl, d * 0.999, kind[i]);
        }
      }
    }
  }

  /* ============================================================================================
   * LOW CLOUD
   * The sky slot between the rooftops is the frame's biggest reservoir of black and it is not
   * spent lightly — so this only exists ABOVE the reference sky. P.cloud is 0.75 under `rain` and
   * the gate opens at 0.78, which means the four ordinary presets keep their stars and only a
   * downpour and a storm get a ceiling scudding over the canyon.
   *
   * Geometry is the fog bank's, mirrored: a horizontal plane, this one 46 m up, inverse-projected
   * per screen row above the horizon. Rows near the horizon are cloud a kilometre down the street,
   * rows near the top of the frame are cloud directly overhead, and the perspective foreshortening
   * that falls out of that is what makes it scud rather than slide.
   * ==========================================================================================*/
  var clSeed = 0, clT = 0, CL_BASE = 46;

  CC.ELEMENTS.push({
    name: 'lowcloud',
    layer: 7,
    /* THE TWO WORLDS WITH AIR IN THEM. A cloud deck needs an atmosphere to hold it up.
     * See src/world.js: `world` may be a string or a set, and absent means every world. */
    world: ['cyber', 'west'],
    init: function (city, rng) {
      bindWorld(city, rng);
      clSeed = smallSeed(rng);
    },
    update: function (dt, t) { clT = t; syncWeather(t); },
    draw: function (frame, cam, t) {
      var tt0 = t !== undefined ? t : clT;
      syncWeather(tt0);
      var scud = clamp((pCloud - 0.78) / 0.22, 0, 1);
      if (scud < 0.02) return;
      bindView(frame, cam);
      var tt = CC.reducedMotion ? 0 : tt0;
      var cols = frame.cols, rows = frame.rows;
      var dist = frame.dist;
      var rise = CL_BASE - vEyeY;
      /* Cloud runs ahead of the street-level wind — it is in the part of the air nothing is
       * sheltering — and the 1.8 is what makes it read as weather passing over rather than as a
       * texture pinned to the city. */
      var drx = WIND.x * tt * 1.8 * 0.0075, drz = WIND.z * tt * 1.8 * 0.0075;
      var th = 0.52 - 0.16 * scud;
      var r1 = Math.floor(vHorizon);
      if (r1 > rows) r1 = rows;

      for (var r = 0; r < r1; r++) {
        var den = vHorizon - (r + 0.5);
        if (den < 0.9) continue;                       // the horizon itself is infinitely far
        var w = rise * vScale / den;
        if (w > 900) continue;                         // beyond this a row is one cloud smear
        /* Fade the ceiling out as it approaches the horizon, or the last row before the rooftops
         * prints as a hard bar of cloud ruled across the frame. */
        var band = clamp((900 - w) / 420, 0, 1);
        if (band < 0.04) continue;

        for (var x = 0; x < cols; x++) {
          var i = r * cols + x;
          /* Sky and sky elements only. Anything nearer than 200 m is the city or something
           * standing in it, and a cloud in front of a rooftop is not a cloud. */
          if (dist[i] < 200) continue;
          var sp = (2 * (x + 0.5) / cols - 1) * vHalf;
          var dx = vFwx + vRgx * sp, dz = vFwz + vRgz * sp;
          var px = vX + dx * w, pz = vZ + dz * w;
          /* 0.0075 is a 130 m feature; anything finer turns into noise at this distance. */
          var c = n2(px * 0.0075 + drx, pz * 0.0075 + drz, clSeed);
          if (c <= th) continue;
          var amt = (c - th) / (1 - th) * band * scud;
          var hh = hash2(x, r, clSeed + 9);
          if (hh > amt * 0.55) continue;
          /* Lit from below by the city, so the underside near the rooftops carries more of it. */
          var lm = (9 + 26 * amt) * (0.65 + 0.35 * (r / (r1 + 1)));
          put(frame, x, r, hh < 0.07 ? G_TILDE : (hh < 0.16 ? G_EQ : (hh < 0.34 ? G_DASH : G_UNDER)),
              P.slate, lm, 60);
        }
      }
    }
  });

  /* ============================================================================================
   * LIGHTNING
   * The one element that does not add geometry: it re-reads what is already in the frame and
   * re-puts it brighter, at a hair less than its own depth so CC.put accepts the overwrite. That
   * keeps the flash physically honest — a wall the camera cannot see does not light up — and it
   * costs no new silhouette.
   * Strikes are far away, so the light arrives attenuated by the same fog curve the city uses,
   * which means a flash reveals the near façades and leaves the far ones dark. That is what makes
   * it read as a strike behind the skyline rather than a global brightness knob.
   * ==========================================================================================*/
  var lgSeed = 0, lgI = 0, lgSide = 0, lgBear = 0, lgChan = 0;
  var LG_PER = 5.5;                                  // seconds per candidate strike window
  var LG_DUR = 1.20;                                 // seconds a stroke stays above zero
  var LG_W = 6.8, LG_RISE = 0.15, LG_DECAY = 2.7, LG_FADE = 0.18;
  var LG_JIT = 0.5;                                  // earliest a stroke may start inside a window
  /* A window fires at full strength when its requirement q is under P.storm*LG_K and fades out
   * over the LG_BAND above it. The pair is FITTED, not chosen: the expected strength of a window
   * is P.storm*LG_K + LG_BAND/2, and at the reference storm of 0.12 that has to come out at
   * LG_PER/25.8 = 0.213 — one full-strength stroke every 25.8 s, which is the rate the 16 s
   * window and its 0.62 chance produced before the storm had a rate at all. At P.storm 1 the same
   * expression gives 0.90, a stroke every six seconds, and that is the headline. */
  var LG_K = 0.78, LG_BAND = 0.24;
  /* Subtracted from every stroke, never used as a cutoff. `if (I < LG_FLOOR) return` reads like the
   * same thing and is not: it makes the flash APPEAR at LG_FLOOR, a step edge whose size relative
   * to the stroke grows without bound as the stroke gets weaker, and the regression test caught it
   * at 44% of peak on a stroke near the gate's edge. Subtracting instead means the visible
   * intensity leaves and returns to zero continuously whatever the amplitude, which is the property
   * that actually matters, and it costs a full stroke 2% of itself.
   *
   * IT IS SUBTRACTED FROM THE ENVELOPE, NOT FROM THE SCALED INTENSITY, and that distinction is the
   * whole of the fix that landed here at integration. Taken off the intensity, the floor is a
   * FIXED amount off a VARIABLE peak, so on a weak sky it is a large fraction of the stroke and
   * eats the first frames of the 0.15 s attack: under `drizzle` (storm 0.02) it clipped the ramp
   * to 0.00 -> 6.12 -> 9.80, a 36.6%-of-peak step edge in one frame, over the 34% ceiling this
   * file is written to. Nothing about that was visible before, because tools/lightning-rate.cjs
   * loaded no weather director and so only ever measured the reference sky. Taken off the
   * envelope — which is amplitude-invariant by construction, see lgEnv — the floor is the same
   * 3.7% of peak on every stroke at every storm level, the attack keeps all of its frames, and the
   * worst step stays at the envelope's own 21% whatever the sky is doing. At full amplitude, which
   * is what the reference measurement samples, the two forms are the same number. */
  var LG_FLOOR = 0.02;

  /* PHOTOSENSITIVITY. THIS FUNCTION IS THE ONE PLACE IN THE PROJECT THAT CAN HURT SOMEBODY.
   * It is written to a hard rule, not to taste: NO TWO BRIGHT PEAKS CLOSER THAN 0.34 s AND NO
   * STEP EDGES ANYWHERE. Nothing below may be retuned by eye — retune it, then re-run
   *   node tools/lightning-rate.cjs <seed>
   * and read the printed peak gap and single-frame step back out.
   *
   * The first cut multiplied the decay by a piecewise-CONSTANT table of returns,
   *   e * (u<0.045 ? 1 : u<0.085 ? 0.16 : u<0.15 ? 0.88 : u<0.22 ? 0.28 : 0.46)
   * and it strobed. Sampled per 60 Hz frame across a stroke it ran 57.4, 52.3, 47.7, 6.6, 5.9,
   * 5.4, 28.9, 26.3, 24.0, 6.6 added lum per cell — bright/dark/bright/dark with its two maxima
   * 0.100 s apart, 10 Hz instantaneous against a 3 Hz ceiling, and one 16 ms frame dropping
   * 47.7 -> 6.6, the entire amplitude of the flash in a single frame across the whole viewport.
   * Every one of those edges came from the ternaries: a constant multiplier that changes value at
   * a threshold IS a step, however smooth the exponential it multiplies.
   *
   * What replaced it is one continuous function with a bounded derivative everywhere.
   *   - cos(u*LG_W) rides on a 0.55 floor, so the trough between the returns dims rather than
   *     extinguishes and the eye reads a pulse instead of a blink;
   *   - max(0, cos) flattens the negative lobe into a plateau rather than inverting it into a
   *     third peak, which is what keeps the count at exactly two maxima;
   *   - LG_W = 6.8 puts the second return 0.924 s after the first in the raw cosine; the decay
   *     drags it forward and the onset ramp pushes the first back, and the MEASURED gap is
   *     0.667 s = 1.50 Hz, half the ceiling, with the second return at 14% of the first;
   *   - the 0.15 s raised-cosine attack replaces an onset that stepped 0 -> full amplitude in one
   *     frame. It brings the largest single-frame change down from 100% of peak to 20.9%;
   *   - LG_FADE does the same job at the other end, because a hard cutoff at LG_DUR is a step
   *     edge too, just a dimmer one.
   *
   * NOTHING IN THIS FUNCTION IS ALLOWED TO DEPEND ON THE WEATHER. The storm parameter moves how
   * OFTEN a stroke fires and how BRIGHT it is, never the shape or the timing of one, because the
   * shape and the timing are the only things the safety measurement can check. A storm that also
   * shortened LG_DUR or widened LG_W would be a different envelope on every frame and the
   * regression test would be measuring a sky nobody ever sees.
   *
   * The strike windows are the outer guarantee, and they got TIGHTER rather than looser when the
   * storm gained a rate: the window is 5.5 s and the start jitter runs from LG_JIT to LG_PER-1.2,
   * so two strokes from adjacent windows can be no closer than LG_JIT + 1.2 = 1.7 s — half a
   * second further apart than the 1.2 s the old 16 s window allowed. update() takes the MAXIMUM of
   * the overlapping windows and never their sum, so two strokes cannot add into a brighter one,
   * and the maxima of a maximum are the maxima of its arguments: overlapping strokes cannot
   * manufacture a peak that neither of them has. */
  function lgEnv(u) {
    if (u < 0 || u > LG_DUR) return 0;
    var e = Math.exp(-u * LG_DECAY);
    if (u < LG_RISE) e *= smooth(u / LG_RISE);       // soft attack, never a step
    /* The tail has to reach zero on its own or the cutoff at LG_DUR is itself a step edge. */
    if (u > LG_DUR - LG_FADE) e *= smooth((LG_DUR - u) / LG_FADE);
    if (CC.reducedMotion) return e;                  // no returns at all for a viewer who asked
    var c = Math.cos(u * LG_W);
    return e * (0.55 + 0.45 * (c > 0 ? c : 0));
  }

  CC.ELEMENTS.push({
    name: 'lightning',
    layer: 40,
    /* THE TWO WORLDS WITH AIR IN THEM. A stroke needs a charged medium to travel through.
     * See src/world.js: `world` may be a string or a set, and absent means every world. */
    world: ['cyber', 'west'],
    init: function (city, rng) {
      bindWorld(city, rng);
      lgSeed = smallSeed(rng);
    },
    update: function (dt, t) {
      syncWeather(t);
      lgI = 0;
      /* A sky with no storm in it has no lightning in it. Not rare lightning: none. */
      if (pStorm < 0.004) return;
      /* Amplitude relative to the reference sky, which is `rain` at storm 0.12 — a distant,
       * occasional flicker. Above that the strokes get a little brighter and a lot more frequent;
       * below it they fade out before the gate closes on them. */
      var ampS = 0.55 + 0.45 * clamp(pStorm / REF_STORM, 0, 1) +
                 0.28 * clamp((pStorm - REF_STORM) / (1 - REF_STORM), 0, 1);
      var best = 0, side = 0, bear = 0, chan = 0, bestE = 0, bestA = 0;
      var n = Math.floor(t / LG_PER);
      /* Look at the previous window too: a strike late in it can still be decaying now. One window
       * back is enough and provably so — the latest a stroke can start is (LG_PER-1.2) into its
       * window and it lasts 1.2 s, so it cannot survive past that window's end. */
      for (var j = n - 1; j <= n; j++) {
        /* Each window has a fixed storm REQUIREMENT rather than a fixed chance, and the ramp over
         * it is smooth. That is what lets the rate rise with the storm without any stroke ever
         * switching on or off in the middle of itself: as P.storm crosses a window's requirement
         * the stroke fades up from nothing over a tenth of the parameter, and P.storm itself only
         * moves on the director's 14 s blend. A hard `hash > threshold(storm)` test instead would
         * extinguish a stroke mid-decay the moment the threshold crossed it — a step edge across
         * the whole viewport, which is the one thing this file may never print. */
        var q = hash1(j, lgSeed + 5);
        var gate = (pStorm * LG_K - q) / LG_BAND + 1;
        if (gate <= 0) continue;
        gate = gate >= 1 ? 1 : smooth(gate);
        var st = j * LG_PER + LG_JIT + hash1(j, lgSeed + 1) * (LG_PER - 1.2 - LG_JIT);
        var amp = (0.42 + hash1(j, lgSeed + 2) * 0.58) * ampS * gate;
        var ev = lgEnv(t - st);
        var v = ev * amp;
        if (v > best) {
          best = v; bestE = ev; bestA = amp;
          side = hash1(j, lgSeed + 3) < 0.5 ? -1 : 1;
          bear = hash1(j, lgSeed + 4) * 6.283185;
          chan = hash1(j, lgSeed + 6);
        }
      }
      /* The floor comes off the envelope and the amplitude goes back on afterwards — see LG_FLOOR.
       * Taking the max over the SCALED strokes and then flooring the winner's own envelope is
       * exact, not an approximation: both values belong to the same stroke. */
      best = bestE > LG_FLOOR ? bestA * (bestE - LG_FLOOR) : 0;
      lgI = best <= 0 ? 0 : (CC.reducedMotion ? best * 0.28 : best);
      lgSide = side; lgBear = bear; lgChan = chan;
    },
    draw: function (frame, cam) {
      var I = lgI;
      if (I <= 0) return;                            // the overwhelming majority of frames
      bindView(frame, cam);
      var cols = frame.cols, rows = frame.rows;
      var ch = frame.ch, kind = frame.kind, dist = frame.dist, lum = frame.lum, col = frame.col;
      var hz = vHorizon;
      /* How far up the sky the cloudbase lights. A distant flicker under `rain` reaches the
       * rooftop line and no further; a full storm lights the ceiling to the top of the frame. */
      var reach = 14 + 16 * clamp((pStorm - REF_STORM) / (1 - REF_STORM), 0, 1);

      for (var y = 0; y < rows; y++) {
        var above = hz - y;
        var sky = above > 0 && above <= reach ? I * 0.13 * (1 - above / reach) : 0;
        for (var x = 0; x < cols; x++) {
          var i = y * cols + x, k = kind[i], d = dist[i];

          if (k === 0) {
            /* Cloudbase, lit from behind. Only the sky near the rooftop line — a flash that lights
             * the zenith turns the frame's biggest reservoir of black into grey. */
            if (sky === 0 || ch[i] !== 0) continue;
            var sg = hash2(x, y, lgSeed + 193);
            if (sg > sky) continue;
            /* Sky is stored at Infinity and CC.put needs a strictly smaller depth, so the glow
             * has to claim SOME finite distance. FOG_START is the only safe choice: anything past
             * it would be crushed to black by a second, blanket fog pass, which surfaces.js
             * explicitly says a caller is allowed to run. */
            put(frame, x, y, sg < 0.02 ? G_TICK : G_DOT, P.slate,
                14 + I * 40 * hash2(x, y, lgSeed + 197), SURF ? SURF.FOG_START : 12, 0);
            continue;
          }
          if (d >= vFar) continue;
          /* The flash obeys the city's own depth attenuation, so it cannot reach a wall the fog
           * has already taken. */
          var att = fogLum(255, d) / 255;
          if (att < 0.06) continue;
          /* Light falls off across the frame away from the strike, which is what tells the viewer
           * the storm has a direction. */
          var lat = 0.55 + 0.45 * (lgSide > 0 ? x / cols : 1 - x / cols);
          var g = I * att * lat;

          if (ch[i] !== 0) {
            var add = (k === 2 ? 46 : 78) * g;       // wet tarmac takes the flash at a glancing angle
            if (add < 4) continue;
            put(frame, x, y, ch[i], col[i], lum[i] + add, d * 0.999, k);
          } else if (k === 1) {
            /* Black façade cells briefly show their structure. Dithered and dim: a full fill here
             * doubles the frame's coverage for a third of a second and the flash reads as a
             * white-out rather than as a building. */
            var fh = hash2(x, y, lgSeed + 211);
            if (fh > g * 0.30) continue;
            put(frame, x, y, fh < 0.10 ? G_PIPE : (fh < 0.20 ? G_COLON : G_QUOTE),
                P.slate, 8 + g * 34, d * 0.999, k);
          }
        }
      }

      /* The channel itself, at the top of the storm range only. It carries NO time structure of
       * its own — its brightness is the same lgEnv the flash uses, so it cannot introduce a flash
       * rate the measurement has not already checked — and it is one or two cells wide, so it is
       * a thousandth of the viewport rather than a viewport-wide luminance step. */
      if (pStorm > 0.45 && I > 0.30 && lgChan < 0.55) bolt(frame, I, cols, rows);
    }
  });

  /* The bolt is anchored to a world BEARING, not to a screen column: the storm is somewhere in
   * particular, and turning your head has to be able to put it out of frame. */
  function bolt(frame, I, cols, rows) {
    var yaw = Math.atan2(vFwx, vFwz);
    var rel0 = lgBear - yaw;
    while (rel0 > 3.14159265) rel0 -= 6.283185;
    while (rel0 < -3.14159265) rel0 += 6.283185;
    if (rel0 > 1.35 || rel0 < -1.35) return;           // behind the viewer, or nearly
    var sx0 = (Math.tan(rel0) / vHalf + 1) * 0.5 * cols;
    if (sx0 < -4 || sx0 > cols + 4) return;
    var strength = clamp((pStorm - 0.45) / 0.4, 0, 1) * clamp((I - 0.30) / 0.35, 0, 1);
    var bottom = Math.floor(vHorizon) - 1;
    if (bottom > rows - 1) bottom = rows - 1;
    var x = sx0, dxs = (lgChan - 0.27) * 1.4;          // the channel's overall lean
    for (var y = 0; y <= bottom; y++) {
      /* Keyed on the row and the stroke, so the channel is the same shape for the whole flash
       * instead of re-drawing itself every frame. */
      x += dxs + (hash2(y, 0, lgSeed + 313 + ((lgChan * 811) | 0)) - 0.5) * 2.6;
      var cx = Math.floor(x);
      if (cx < 0 || cx >= cols) continue;
      var i = y * cols + cx;
      /* Stop at the skyline. 55 m is the test rather than the sky's own distance because the low
       * cloud sits at 60 and a bolt that stopped at the cloud deck would be invisible in exactly
       * the weather that fires it — the channel is BEHIND the cloud it is lighting up. */
      if (frame.dist[i] < 55) break;
      var lm = (70 + 150 * I) * strength * (0.55 + 0.45 * (y / (bottom + 1)));
      put(frame, cx, y, hash2(y, 1, lgSeed + 317) < 0.4 ? G_SLASH : G_PIPE, P.white, lm, 58);
      /* A single fork, low down, on rather less than half the strokes. */
      if (lgChan < 0.22 && y > bottom * 0.55) {
        var fx = (cx + (y - bottom * 0.55) * (lgChan < 0.11 ? -0.9 : 0.9)) | 0;
        if (fx >= 0 && fx < cols && frame.dist[y * cols + fx] >= 55)
          put(frame, fx, y, G_BSL, P.white, lm * 0.5, 58);
      }
    }
  }

  if (CC) CC.Wind = WIND;

})(typeof CC !== 'undefined' ? CC : require('../core.js'));
