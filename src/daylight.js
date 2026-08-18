/* CyberCity daylight — the one place that decides what time of day it is.
 *
 * It is weather_state.js's sibling and it is deliberately built to the same pattern, because the
 * pattern is the thing that made the weather work: ONE fact, computed once per tick, read by
 * everybody. Rain, fog, the wetness of the road and whether a pedestrian has an umbrella were all
 * the same fact seen from eight files, and before the director existed each of those files picked
 * its own constant and the city ended up with heavy rain falling through a clear starfield. The
 * time of day is exactly the same shape of problem, one size larger: the sun's altitude decides
 * the sky, which wall is lit, whether a window has a lamp in it, whether there are stars, whether
 * the neon reads, how bright the road is and how many people are on it. Left to themselves, nine
 * files would disagree about what hour it is.
 *
 * ---- WHY THIS IS HARD HERE, AND WHAT THE ANSWER IS ---------------------------------------------
 * core.js prints through a fixed LUT built at load from the EXPOSURE table, and the whole art
 * direction is a frame that is more than half pure black with a thin scatter of very bright glyphs.
 * Daylight is the inverse of that picture, and the obvious implementation — rebuild the print curve
 * for the day — is not available: the LUT is 24 KB of Uint8Array built once and the curve is what
 * every other tuned constant in the project was fitted against.
 *
 * So DAYLIGHT IS NOT A CHANGE TO THE PRINT. It is a set of directions that surfaces and elements
 * multiply into the constants they already have, exactly as they already do with CC.Weather.rel().
 * What makes a daylight frame work inside a night-tuned print is not more light everywhere, it is
 * a REDISTRIBUTION: the sky becomes the bright mass and the lit windows go out. A city at noon is a
 * grey concrete canyon under a bright sky with dark glass in it — which is both what a city at noon
 * looks like and a picture this renderer can actually make.
 *
 * ---- WHAT IT EXPORTS ---------------------------------------------------------------------------
 * Every field of P is a DIRECTION, 0..1 unless stated, and none of them is a multiplier for any
 * particular element's constants:
 *
 *   phase   0..1 round the clock. 0.00 midnight, 0.25 sunrise, 0.50 noon, 0.75 sunset.
 *   alt     the sun's altitude in RADIANS. Negative at night. Peaks at ALT_MAX, deliberately not
 *           at the zenith — see ALT_MAX.
 *   az      the sun's azimuth as a world bearing, in the project's convention (yaw 0 faces +z).
 *           It SWINGS: sunrise in the east, sunset in the west, and the shadow direction turning
 *           through the day is most of what makes a cycle read as a cycle rather than as a dimmer.
 *   sun     direct sunlight, 0 below the horizon rising to 1 with altitude. The number a surface
 *           multiplies its lit-side brightness by.
 *   sky     how much light the SKY itself is emitting. Non-zero through twilight, when the sun is
 *           down and the sky is still the brightest thing in the frame — which is the state the
 *           frontier was originally built at and the best-looking hour in either world.
 *
 *           THE NAME IS WRONG ON A WORLD WITH NO SKY, and the author of src/surf_moon.js was right
 *           to raise it. This module reports `sky` = 1.0 at Moonwalk's local noon, on a body that
 *           has no atmosphere and therefore no sky luminance at all, and core.js's print hook uses
 *           exactly that number to decide how far up the daylight exposure ladder to blend.
 *
 *           The VALUE is nevertheless right and the output is good, which is why this is a note
 *           rather than a change. What the print hook actually needs to know is "how much of this
 *           frame is lit by daylight rather than by lamps", and on an airless world at noon the
 *           honest answer is "all of it" — the surfaces are in full unfiltered sun. `sky` tracks
 *           that closely enough on all three worlds to be the right input under the wrong name.
 *           What it is NOT right for is anything that models the medium: the aerial-perspective
 *           floor in surfaces.js's refog() read it too, and that one was genuinely wrong, so a
 *           painter now declares `airless` and refog() skips it.
 *
 *           If a fourth world ever separates the two — a lit surface under a black sky, or a bright
 *           sky over unlit ground — this parameter has to split into `skyLuminance` and
 *           `dayBlend`, and the two readers have to be sorted between them. Until then, splitting
 *           it would mean re-tuning surf_moon.js, which currently compensates for the blend with a
 *           documented CC.dayMix term and produces the best census in the project.
 *   warm    1 when the light is low and orange, 0 at noon and 0 in the dead of night. What a
 *           surface uses to choose between amber and white.
 *   lamp    artificial light: 1 at night, 0 in the day, WITH HYSTERESIS (see below).
 *   star    stars and moon, 0 by day.
 *   night   1 while the sun is down, as a hard flag for things that simply do not happen by day.
 *   name    'night' | 'dawn' | 'morning' | 'noon' | 'afternoon' | 'dusk', for the readout.
 *
 * ---- DETERMINISM -------------------------------------------------------------------------------
 * A frame must be a pure function of (seed, t) or tools/headless.cjs stops reproducing the browser,
 * which is what makes every offline measurement in this project worth anything. So the phase is
 * computed from t and a seeded offset, never accumulated; the two viewer controls are STAMPED
 * exactly the way weather_state.js stamps its override — T records an offset, Y records the instant
 * the clock stopped — and both are still pure functions of t afterwards. Nothing here integrates.
 */
(function (CC) {
  'use strict';

  var clamp = CC.clamp, smooth = CC.smooth;

  /* ---- the length of a day ----------------------------------------------------------------------
   * Seven minutes. The constraint from below is that a viewer who watches for two minutes must see
   * the light MOVE; the constraint from above is that this is an ambient piece and the sun crossing
   * the sky in ninety seconds is a time-lapse, which is a different thing to look at and a worse
   * one. Seven minutes puts about a hundred seconds in each of dawn, day, dusk and night, which is
   * the same order as weather_state.js's 78-170 s segments — the two clocks are comparable rather
   * than one visibly outrunning the other. */
  var PERIOD = 420;

  /* ---- how high the sun gets ---------------------------------------------------------------------
   * 0.95 rad, i.e. 54 degrees, and NOT the zenith. This is the single most load-bearing constant in
   * the file and it is a composition decision rather than an astronomical one.
   *
   * A sun overhead lights every vertical face equally, and both worlds get their entire sense of
   * form from the fact that one side of the street is lit and the other is not — surf_west.js's
   * whole lighting model is one dot product, and surfaces.js's facades are read against the sky
   * behind them. At the zenith all of that flattens into one tone and the frame reads as a
   * technical drawing. At 54 degrees there is always a lit face and a shadowed face, shadows are
   * always shorter than the thing casting them at noon and longer than it near the ends of the day,
   * and the picture keeps its modelling at every hour. It is also a perfectly ordinary sun altitude
   * for most of the inhabited world outside high summer. */
  var ALT_MAX = 0.95;
  /* How far below the horizon the sun goes. It only has to be far enough that `sun` and `sky` are
   * both properly zero in the middle of the night; the depth of the anti-solar point is not a thing
   * the frame can see. */
  var ALT_MIN = -0.42;

  /* The sun's bearing at local noon, and how far either side of it the day swings. The project's
   * convention is that yaw 0 faces +z, so this is "south" for a northern-hemisphere sun. SWING is
   * 1.35 rad (77 degrees), which puts sunrise at bearing -1.85 and sunset at +0.85 — both of them
   * comfortably off the avenue axis, so the low sun is in frame at the ends of the day without
   * being straight down the street. */
  var AZ_NOON = -0.5, AZ_SWING = 1.35;

  var S = 0;                       // seed
  /* The seeded starting hour currently folded into `off`, kept so a rebuild can swap one city's
   * base for another's without disturbing the viewer's own offset on top of it. */
  var base = 0;
  /* The two stamped impurities, and the ONLY ones. `off` is added to t before the phase is taken,
   * so T moves the clock without ever making the phase depend on anything but t. `holdAt` is the
   * instant Y stopped it: while frozen the phase is evaluated at holdAt instead of at t, which is
   * still a pure function — just of a constant. */
  var off = 0, holdAt = -1, frozen = 0;

  var KEYS = ['alt', 'az', 'sun', 'sky', 'warm', 'lamp', 'star', 'night'];
  /* The live block. Elements hold a reference to THIS object and read fields off it every frame; it
   * is never reallocated, so nothing can end up pointing at last frame's sky. */
  var P = { phase: 0.78, name: 'dusk', alt: 0, az: AZ_NOON, sun: 0, sky: 0, warm: 0,
            lamp: 1, star: 1, night: 1, frozen: false, period: PERIOD };

  /* ---- the six names, and where they sit on the clock ---------------------------------------------
   * These are what T steps between and what the HUD prints. They are phases rather than hours
   * because the interesting moments of a day are not evenly spaced: dawn and dusk are minutes long
   * and are where the whole picture lives, and 'morning' and 'afternoon' exist so that stepping
   * from dawn does not jump straight over the best-lit hour of the day. */
  /* THE STOPS ARE NOT AT THE OBVIOUS PHASES, and the two that matter are dawn and dusk. Sunrise is
   * phase 0.25 by construction — the sun exactly on the horizon, where `sun` is 0.10. That is the
   * blue hour, not the golden one, and the look both worlds are built around is a LOW sun rather
   * than a set one: the frontier's entire lighting model is a dot product that needs the sun ABOVE
   * the horizon for one side of the street to be lit at all. So the dawn and dusk stops sit two
   * hundredths of a cycle inside the day, where `sun` reaches 0.65 and the light is grazing —
   * which is the hour a viewer pressing T for "dusk" is actually asking for. */
  var STOPS = [
    { name: 'night',     phase: 0.00 },
    { name: 'dawn',      phase: 0.27 },
    { name: 'morning',   phase: 0.36 },
    { name: 'noon',      phase: 0.50 },
    { name: 'afternoon', phase: 0.64 },
    { name: 'dusk',      phase: 0.73 }
  ];

  function nameOf(ph) {
    if (ph < 0.225 || ph >= 0.795) return 'night';
    if (ph < 0.315) return 'dawn';
    if (ph < 0.435) return 'morning';
    if (ph < 0.575) return 'noon';
    if (ph < 0.695) return 'afternoon';
    return 'dusk';
  }

  function frac(x) { return x - Math.floor(x); }

  /* ---- the sky model ------------------------------------------------------------------------------
   * Three curves and no more, because everything downstream is a multiplier on a constant somebody
   * has already tuned and a fourth curve would only give nine files a fourth thing to disagree about.
   *
   *   alt   a sine on the phase. Not a physical solar declination model: the frame cannot tell the
   *         difference and a sine is what makes dawn and dusk symmetrical, which they are not in
   *         life but are in every viewer's expectation.
   *   sun   smoothstep of the altitude above the horizon, so direct light arrives and leaves over a
   *         few degrees rather than switching. The 0.06 rad shoulder below zero is refraction and
   *         is why the sun's disc is still visible after it has technically set.
   *   sky   the one that is NOT a function of `sun`, and the reason this file has three curves
   *         rather than two. Civil twilight is the sun 0 to -6 degrees, where there is no direct
   *         light at all and the sky is still the brightest object in the world. That state is the
   *         frontier's original look and the best hour either world has, so it gets its own curve:
   *         it peaks a little BELOW sunrise and decays over about 12 degrees of depression.
   */
  function stateAt(tt) {
    var ph = frac(tt / PERIOD);
    var a = Math.sin((ph - 0.25) * 6.283185307);            // -1 at midnight, +1 at noon
    /* The two halves take DIFFERENT scales, and writing it as one expression is how this got wrong
     * twice: the sun climbs to ALT_MAX by day and only sinks to ALT_MIN by night, because how far
     * below the horizon it goes is invisible past the point where the twilight has gone but how
     * high it gets decides the shadows all day. */
    var alt = a >= 0 ? a * ALT_MAX : a * (-ALT_MIN);

    var sun = clamp((alt + 0.06) / 0.30, 0, 1);
    sun = sun * sun * (3 - 2 * sun);

    /* Twilight, in radians of depression below the horizon. */
    var depr = -alt;
    var sky;
    if (alt >= 0) sky = clamp(0.55 + 0.45 * (alt / ALT_MAX), 0, 1);
    else sky = clamp(1 - depr / 0.21, 0, 1) * 0.55;
    sky = sky * sky * (3 - 2 * sky);

    /* Warmth peaks where the light is grazing — a low sun, up or down — and is zero at noon and
     * zero once the sky has gone. The band is 0.35 rad wide either side of the horizon. */
    var warm = clamp(1 - Math.abs(alt) / 0.36, 0, 1);
    warm = warm * warm * (3 - 2 * warm) * clamp((alt + 0.30) / 0.24, 0, 1);

    /* ---- LAMPS COME ON LATE AND GO OFF LATER, which is the point of giving them their own curve
     * instead of using 1-sun. The evening and the morning are not mirror images: a lamp goes on
     * when somebody can no longer see, and goes off when somebody eventually notices it is still
     * burning, which is a good deal further into the morning. Two offsets, and the morning's being
     * the LOWER of the two is the whole asymmetry — it holds the lamps on to a higher sun on the
     * way up than the way down.
     *
     * BOTH ARE GENEROUS ENOUGH THAT THE GOLDEN HOURS ARE LIT, and that is a composition decision
     * on top of the behavioural one. A lamp in a window is the brightest cell either world has at
     * street level; the dawn and dusk stops are where the light is best; and a version of this
     * curve that switched the lamps off at a sun 7 degrees up took the porch lanterns out of the
     * exact frame they were designed for. Lamps are lit whenever the sun is low. */
    var evening = ph > 0.5;
    var lampAlt = alt + (evening ? -0.16 : -0.24);
    var lamp = clamp(1 - (lampAlt + 0.02) / 0.26, 0, 1);
    lamp = lamp * lamp * (3 - 2 * lamp);

    /* Stars need a genuinely dark sky, so they key on the twilight curve rather than on the sun. */
    var star = clamp(1 - sky / 0.34, 0, 1);
    star = star * star * (3 - 2 * star);

    /* Sunrise in the east, sunset in the west, with a cosine between so the bearing moves fastest
     * at noon — backwards from a real sun, and the right way round for this frame, because the
     * shadow direction at the ends of the day is what the eye reads and it wants to hold still
     * there long enough to be seen.
     *
     * The phase is measured from SUNRISE, not from midnight. Taken from midnight the sun came up
     * due south and was pointing east in the middle of the night, which is a sun going round the
     * wrong way at half the speed. */
    var az = AZ_NOON + AZ_SWING * -Math.cos((ph - 0.25) * 6.283185307);

    return { ph: ph, alt: alt, az: az, sun: sun, sky: sky, warm: warm, lamp: lamp, star: star };
  }

  function apply(s) {
    P.phase = s.ph; P.alt = s.alt; P.az = s.az;
    P.sun = s.sun; P.sky = s.sky; P.warm = s.warm;
    P.lamp = s.lamp; P.star = s.star;
    P.night = s.alt < 0 ? 1 : 0;
    P.name = nameOf(s.ph);
    P.frozen = !!frozen;
    return P;
  }

  function update(dt, t) {
    if (!(t >= 0)) t = 0;
    return apply(stateAt((frozen ? holdAt : t) + off));
  }

  var Daylight = {
    P: P, KEYS: KEYS, STOPS: STOPS, PERIOD: PERIOD,
    ALT_MAX: ALT_MAX, AZ_NOON: AZ_NOON, AZ_SWING: AZ_SWING,

    /* Takes the city, like CC.Weather.init, and for the same reason: the starting hour is a pure
     * function of the seed, so #42 opens at the same time of day every time anyone loads it.
     *
     * IT DOES NOT CLEAR THE VIEWER'S OVERRIDE, and that is the one place this file deliberately
     * differs from the weather director. The weather belongs to the city, so a new city gets new
     * weather; the time of day belongs to the VIEWER, and somebody who has pressed T to stand in
     * the noon light and then presses 2 to see the frontier means to see the frontier at noon. The
     * offset and the freeze therefore survive a rebuild, and only the seeded base moves. */
    init: function (city) {
      S = city && city.seed !== undefined ? (city.seed | 0) : 0;
      /* Spread over the clock by the seed, but never opening in the dead of night: the first thing
       * anyone sees should be a picture, and a black frame reads as a page that has not loaded.
       * 0.62-0.97 of the cycle is afternoon through dusk into early night, which is the band both
       * worlds look best in. */
      var h = CC.hash1 ? CC.hash1(0, (S + 4177) | 0) : 0.5;
      /* Folded straight into `off`, minus whatever base a previous city put there, so the viewer's
       * own T and Y stamps ride on top of it undisturbed across a rebuild. */
      off += (0.62 + h * 0.35) * PERIOD - base;
      base = (0.62 + h * 0.35) * PERIOD;
      return update(0, 0);
    },
    update: update,

    /* T. Steps to the next named stop, which is a toggle a viewer can hold down a rhythm on: four
     * presses from dusk gets you back to dusk through night, dawn and noon. Stamped as an OFFSET,
     * so the clock keeps running from wherever it was put unless Y has stopped it. */
    step: function (t, dir) {
      if (!(t >= 0)) t = 0;
      var cur = frac(((frozen ? holdAt : t) + off) / PERIOD);
      var d = dir < 0 ? -1 : 1, i, want = -1, bestGap = 2;
      /* THE NEAREST STOP AHEAD, not the first one in the array with a gap — which is what this did
       * first, and it made T alternate between night and dawn forever instead of walking the clock
       * round. The 0.02 margin stops a second press a frame or two later from landing on the stop
       * it is already standing on. */
      for (i = 0; i < STOPS.length; i++) {
        var gap = d > 0 ? frac(STOPS[i].phase - cur) : frac(cur - STOPS[i].phase);
        if (gap > 0.02 && gap < bestGap) { bestGap = gap; want = STOPS[i].phase; }
      }
      if (want < 0) want = STOPS[0].phase;
      off += (want - cur) * PERIOD;
      /* Frozen, the stop has to be written into holdAt as well or the clock would jump back the
       * moment it was released. Not needed — off carries it — but keeping holdAt in step with the
       * displayed phase is what makes `resume` behave. */
      return P.name;
    },

    /* Y. Stops and restarts the automatic cycle. Stopping stamps the instant; starting again moves
     * `off` so the clock picks up from the hour it was stopped at rather than snapping to wherever
     * the world clock has got to in the meantime — which is the difference between a pause and a
     * skip. */
    freeze: function (t) {
      if (!(t >= 0)) t = 0;
      if (frozen) { off -= (t - holdAt); frozen = 0; holdAt = -1; }
      else { holdAt = t; frozen = 1; }
      P.frozen = !!frozen;
      return !!frozen;
    },
    get frozen() { return !!frozen; },
    get current() { return P.name; },

    /* For the offline harness and for tests: put the clock at a named stop, or at a phase, with no
     * reference to a viewer. Returns false for a name it does not know. */
    set: function (nameOrPhase, t) {
      if (!(t >= 0)) t = 0;
      var want = -1;
      if (typeof nameOrPhase === 'number') want = frac(nameOrPhase);
      else for (var i = 0; i < STOPS.length; i++)
        if (STOPS[i].name === nameOrPhase) { want = STOPS[i].phase; break; }
      if (want < 0) return false;
      var cur = frac(((frozen ? holdAt : t) + off) / PERIOD);
      off += (want - cur) * PERIOD;
      update(0, t);
      return true;
    }
  };

  Object.defineProperty(Daylight, 'offset', { get: function () { return off; } });

  CC.Daylight = Daylight;
  if (typeof module !== 'undefined') module.exports = Daylight;
})(typeof CC !== 'undefined' ? CC : require('./core.js'));
