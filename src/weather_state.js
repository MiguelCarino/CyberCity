/* CyberCity weather director — the one place that decides what the sky is doing.
 *
 * WHY THIS IS A MODULE AND NOT FOUR CONSTANTS IN weather.js.
 * Rain, fog, steam, lightning, the wetness of the road, the haze on the far end of the street, the
 * stars in the slot between the rooftops and whether a pedestrian is carrying an umbrella are all
 * the SAME FACT seen from eight different files. Left to themselves each of those files picks its
 * own constant and the city ends up with heavy rain falling through a clear starfield onto a dry
 * road — which is precisely what it did before this file existed. So the fact lives here once and
 * everything else reads it.
 *
 * DETERMINISM. `state(t)` is a pure function of (seed, t): a seeded sequence of segments indexed by
 * segment number, exactly the way city.js indexes its route by arc length. Scrubbing to frame 9000
 * offline gives the weather the browser has at frame 9000, which is the whole reason the headless
 * harness is worth anything. The ONLY impurity is a deliberate one — `set()` and `cycle()`, which a
 * viewer reaches through the keyboard — and it is stamped with the time it happened so the blend
 * out of it is still a function of t.
 *
 * READING IT. Every parameter is 0..1 and every one of them is a DIRECTION, not a multiplier for
 * any particular element's constants. An element that was already tuned reads `rel(name)`, which is
 * that parameter divided by its value in the `rain` preset — the preset the whole build was tuned
 * under before this file landed — so `rel` returns 1.0 for the look that already shipped and the
 * element scales around it. That is the migration rule and it is not optional: an element that
 * multiplies by the raw parameter silently re-tunes itself to 65% of what it was.
 */
(function (CC) {
  'use strict';

  var clamp = CC.clamp, smooth = CC.smooth, hash1 = CC.hash1;

  /* Eight directions. They are deliberately NOT independent — a downpour is windy and wet and
   * hides the stars, and a state that lets a viewer contradict that would only produce weather
   * nobody has ever stood in. */
  var KEYS = ['rain', 'wind', 'fog', 'wet', 'storm', 'haze', 'cloud', 'steam'];

  /*                    rain  wind   fog   wet  storm  haze cloud steam */
  var PRESETS_CYBER = [
    { name: 'clear',    p: [0.00, 0.25, 0.08, 0.12, 0.00, 0.10, 0.08, 0.55] },
    { name: 'drizzle',  p: [0.30, 0.35, 0.22, 0.62, 0.02, 0.26, 0.45, 0.72] },
    { name: 'rain',     p: [0.65, 0.55, 0.30, 0.90, 0.12, 0.40, 0.75, 0.85] },
    { name: 'downpour', p: [1.00, 0.85, 0.36, 1.00, 0.34, 0.56, 0.95, 1.00] },
    { name: 'mist',     p: [0.06, 0.15, 1.00, 0.46, 0.00, 0.95, 0.70, 0.92] },
    { name: 'storm',    p: [0.85, 1.00, 0.44, 1.00, 1.00, 0.60, 1.00, 0.78] }
  ];
  var REF_I = 2;                       // 'rain' — the preset the pre-weather build was tuned as

  /* ---- the frontier's own six ------------------------------------------------------------------
   * SAME EIGHT DIRECTIONS, DIFFERENT SKY. The parameters above are physical rather than cyberpunk
   * — wind is wind, haze is how far you can see, wet is how much the ground holds — so a desert
   * does not need a second director, it needs a second table. What changes is which combinations
   * exist: out here it is dry for weeks and then it is not, so the middle of this table is made of
   * DUST rather than of drizzle, and the wet states are short and violent.
   *
   * `haze` never goes below 0.30 in any row, and that is the frontier's signature: there is always
   * something in the air. The city's `clear` is 0.10 and reads as washed glass; a desert horizon
   * at 0.10 reads as a cardboard cut-out, because the one thing that tells you a mesa is eight
   * miles away rather than eight hundred metres is the amount of atmosphere stacked in front of it.
   *
   * WHAT rel() STILL MEANS. INV_REF below is deliberately NOT rebuilt from this table — it stays
   * pinned to the city's 'rain' row forever. rel() is the migration contract every element was
   * written against ("1.0 is the look that shipped"), so it has to denote the same physical
   * quantity in both worlds; rebasing it per world would silently re-tune rain.js and every optic
   * the moment the viewer pressed 2. These rows are therefore absolute values in the same units,
   * and a squall out here really is 0.70 of the rain the city was tuned under. */
  /*                       rain  wind   fog   wet  storm  haze cloud steam */
  var PRESETS_WEST = [
    { name: 'blazing',  p: [0.00, 0.18, 0.04, 0.04, 0.00, 0.30, 0.04, 0.24] },
    { name: 'breeze',   p: [0.00, 0.52, 0.08, 0.04, 0.00, 0.52, 0.16, 0.20] },
    { name: 'dust',     p: [0.00, 0.82, 0.34, 0.03, 0.10, 0.88, 0.36, 0.18] },
    { name: 'squall',   p: [0.72, 0.72, 0.24, 0.88, 0.22, 0.38, 0.86, 0.50] },
    { name: 'overcast', p: [0.06, 0.34, 0.26, 0.18, 0.00, 0.54, 0.94, 0.32] },
    { name: 'thunder',  p: [0.58, 0.98, 0.38, 0.82, 1.00, 0.46, 1.00, 0.42] }
  ];

  /* Out here the sequence is a drought broken by a storm and then a long dry-out, so the strong
   * pull is towards the top of the table and the wet states hand back to dust rather than to each
   * other. blazing -> squall is zero: a desert cloudburst arrives on a wind, and you always see
   * the dust come up the valley first. */
  var NEXT_WEST = [
    /* blazing  -> */ [0, 6, 3, 0, 2, 0],
    /* breeze   -> */ [5, 0, 6, 1, 2, 1],
    /* dust     -> */ [4, 6, 0, 3, 2, 2],
    /* squall   -> */ [1, 3, 4, 0, 3, 2],
    /* overcast -> */ [3, 4, 3, 3, 0, 3],
    /* thunder  -> */ [0, 2, 4, 4, 3, 0]
  ];

  /* ---- and the Moon has no weather at all ---------------------------------------------------------
   * ONE ROW, every parameter zero, and that is the honest answer rather than a placeholder. There
   * is no air on the Moon: no rain, no wind, no fog, no cloud, nothing suspended in anything. The
   * director still has to run — eight files read CC.Weather.P every frame and none of them should
   * have to know which world it is in — so it runs and reports that nothing is happening.
   *
   * A one-row table is also what makes the rest of the machinery behave. pickNext() can only ever
   * return row 0, the segment schedule advances through a single state forever, and the shift-digit
   * keys collapse to one because control.js gates them on PRESETS.length rather than on a literal
   * six. Nothing needed a special case; the data says it. */
  /*                       rain  wind   fog   wet  storm  haze cloud steam */
  var PRESETS_MOON = [
    { name: 'vacuum',   p: [0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00] }
  ];
  var NEXT_MOON = [[1]];

  /* ---- the table registry ------------------------------------------------------------------------
   * Keyed by world id. The two-way string compare this replaced meant a third world silently ran
   * the CITY's rain schedule — which on the Moon would have been a rainstorm in vacuum.
   *
   * BUILT INSIDE init() AND NOT HERE, and the reason is a real bug that this file was already
   * carrying: `var PRESETS = PRESETS_CYBER, NEXT = NEXT_CYBER;` sits ABOVE NEXT_CYBER's own
   * declaration, so NEXT was `undefined` from load until the first init(). That was harmless while
   * nothing read it in between; a registry literal in the same position captured the undefined and
   * handed it to every world, and pickNext threw on the first segment. Built on demand it cannot
   * capture anything that has not been declared. */
  var TABLES = null;
  function tables() {
    if (!TABLES) TABLES = { cyber: [PRESETS_CYBER, NEXT_CYBER],
                            west:  [PRESETS_WEST,  NEXT_WEST],
                            moon:  [PRESETS_MOON,  NEXT_MOON] };
    return TABLES;
  }

  /* The live tables. Reassigned by init() from CC.World, never mid-segment: a world change tears
   * the city down and rebuilds it, and init() is part of that rebuild. */
  var PRESETS = PRESETS_CYBER, NEXT = NEXT_CYBER;

  /* SIX PRESETS, FOUR LOOKS — a known and UNFIXED gap, recorded here so it is not re-derived by
   * eye. Pinning each preset from t=0 and rendering seeds 3/7/42/99 at frame 1800, 400x100, the
   * share of cells whose printed luminance differs by more than 10% of full scale is: clear vs
   * drizzle 5.2%, downpour vs storm 7.3%, against mist vs anything at 17-21%. The per-frame
   * particle noise floor is about 3%, so downpour and storm are very nearly the same picture and
   * only the lightning rate tells them apart. Lit coverage over the four seeds says the same
   * thing: clear 24.0%, drizzle 24.3%, rain 25.9%, downpour 26.2%, mist 22.1%, storm 26.3%.
   *
   * THE FIX IS NOT IN THIS TABLE, and that was measured rather than assumed. Widening the gap
   * here — downpour wind 0.85 -> 0.55, fog 0.36 -> 0.42, and storm fog 0.44 -> 0.24, haze 0.60
   * -> 0.38, so that the two presets disagree on wind by 45 points instead of 15 — moved the
   * rendered difference from 7.3% of cells to 8.5%. That is the elements spending the whole wind
   * and fog budget on things the print cannot see; until weather.js turns wind into continuously
   * visible travelling structure, a bigger number here only changes what downpour looks like
   * without making storm look like anything else. Widen it in the same change that gives the
   * elements something to do with it, and re-run the pinned comparison above. */

  /* A viewer who has just pressed a key to change the weather is owed a visible answer, but the
   * transition is also the best thing in the whole cycle to watch, so it is slow enough to BE
   * something: the leading edge of a downpour walking up the street. 14 s under the automatic
   * schedule, 5 s when somebody asked for it, because they are watching for it. */
  var TRANS = 14, TRANS_FORCED = 5;
  /* Long enough that weather is a mood rather than a strobe, short enough that a two-minute look
   * at the piece contains a change. */
  var DUR_MIN = 78, DUR_VAR = 92;

  var S = 0;                           // seed
  var segT = [], segI = [];            // segment start times and preset indices, extended on demand
  var forcedI = -1, forcedAt = -1e9;   // viewer override and when it was asked for

  /* Not every state follows every other. Sun does not come out in the middle of a downpour; it
   * dries off through rain and drizzle first. The row is the current preset, the values are the
   * relative weights of what may come next (self excluded at pick time). */
  var NEXT_CYBER = [
    /* clear    -> */ [0, 5, 2, 0, 3, 0],
    /* drizzle  -> */ [4, 0, 5, 1, 3, 1],
    /* rain     -> */ [1, 5, 0, 4, 2, 3],
    /* downpour -> */ [0, 2, 6, 0, 1, 4],
    /* mist     -> */ [4, 3, 2, 0, 0, 1],
    /* storm    -> */ [0, 2, 5, 3, 1, 0]
  ];

  function pickNext(prev, n) {
    var row = NEXT[prev], tot = 0, i, m = row.length;
    for (i = 0; i < m; i++) tot += row[i];
    if (tot <= 0) return prev;                 // a one-row table: there is nowhere else to go
    var r = hash1(n, S + 7717) * tot;
    for (i = 0; i < m; i++) { r -= row[i]; if (r <= 0) return i; }
    return prev;
  }

  function extend(tMax) {
    while (segT[segT.length - 1] <= tMax) {
      var n = segT.length;
      var prev = segI[n - 1];
      segI.push(pickNext(prev, n));
      segT.push(segT[n - 1] + DUR_MIN + hash1(n, S + 991) * DUR_VAR);
    }
  }

  /* The live parameter block. Elements hold a reference to THIS object and read fields off it
   * every frame; it is never reallocated, so nothing can end up pointing at last frame's weather. */
  var W = { name: 'rain', from: 'rain', to: 'rain', blend: 1, forced: false };
  for (var ki = 0; ki < KEYS.length; ki++) W[KEYS[ki]] = PRESETS_CYBER[REF_I].p[ki];

  function apply(a, b, f) {
    var A = PRESETS[a].p, B = PRESETS[b].p;
    for (var i = 0; i < KEYS.length; i++) W[KEYS[i]] = A[i] + (B[i] - A[i]) * f;
    W.from = PRESETS[a].name; W.to = PRESETS[b].name; W.blend = f;
    /* The name is what the frame's hint line prints, and printing the target the instant the
     * blend starts would name a downpour over a dry road. It flips at the halfway point, which is
     * about where the eye agrees. */
    W.name = PRESETS[f < 0.5 ? a : b].name;
  }

  function update(dt, t) {
    if (!(t >= 0)) t = 0;
    extend(t + 4);

    // Which scheduled segment t is in, and how far into its lead-in transition.
    var k = segT.length - 1;
    while (k > 0 && segT[k] > t) k--;
    var cur = segI[k], prev = k > 0 ? segI[k - 1] : cur;
    var into = t - segT[k];
    var f = k > 0 && into < TRANS ? smooth(into / TRANS) : 1;

    if (forcedI >= 0) {
      /* An override does not pause the schedule underneath it — it holds until the schedule
       * itself moves on, at which point the city takes its weather back. That is the difference
       * between a control and a mode: nothing here has to be switched off again. */
      var fi = t - forcedAt;
      if (fi < 0) { forcedI = -1; }                  // scrubbed backwards past the keypress
      else if (k > 0 && segT[k] > forcedAt) { forcedI = -1; }   // schedule moved on; release
      else {
        apply(prev, forcedI, fi < TRANS_FORCED ? smooth(fi / TRANS_FORCED) : 1);
        W.forced = true;
        return W;
      }
    }
    W.forced = false;
    apply(prev, cur, f);
    return W;
  }

  /* Reference-relative read. `rel('rain')` is 1.0 under the preset the build was tuned as, so an
   * element multiplies its existing constants by it and changes nothing until the weather does.
   *
   * The reciprocal of the reference row is precomputed and the key is resolved through an object
   * map rather than KEYS.indexOf. This is not micro-optimisation for its own sake: optics.js,
   * street.js, structure.js and signage.js each call rel() several times per element per frame,
   * so the old form ran a linear string scan over an eight-entry array plus a divide tens of
   * thousands of times a second, on the render path, for a number that cannot change between two
   * calls in the same frame. Both tables are built once at load, so this stays allocation-free. */
  var KI = {}, INV_REF = [];
  for (var kj = 0; kj < KEYS.length; kj++) {
    KI[KEYS[kj]] = kj;
    var rv = PRESETS_CYBER[REF_I].p[kj];
    INV_REF.push(rv > 1e-6 ? 1 / rv : 1);
  }
  function rel(key) {
    var i = KI[key];
    return i === undefined ? 1 : W[key] * INV_REF[i];
  }

  var Weather = {
    P: W,                              // the live parameter block; hold this, do not copy it
    KEYS: KEYS,
    /* Getters, because these two used to be captured at load time and a world switch swaps the
     * table underneath them — a reader holding the array it was handed at boot would be naming
     * the city's weather while standing in a dust storm. REF stays the CITY's reference row on
     * purpose: it is what rel() divides by, and that is a constant of the build, not of the
     * world (see PRESETS_WEST). */
    get PRESETS() { return PRESETS; },
    REF: PRESETS_CYBER[REF_I].p,
    /* Takes the city and NOTHING ELSE. Callers used to hand this an rng and the parameter was
     * never referenced — the director is a pure function of (seed, t) by design, because a
     * segment schedule that depended on draw order could not be scrubbed to frame 9000 offline.
     * The dead parameter is gone rather than documented, because a dead parameter is an
     * invitation: the first edit that starts using it silently makes the weather depend on how
     * many elements happened to init before it. If this ever needs randomness it must derive it
     * from `city.seed` the way segI does below. Extra arguments from existing callers are
     * ignored, which is exactly what they were already. */
    init: function (city) {
      S = city && city.seed !== undefined ? (city.seed | 0) : 0;
      /* The world's table is bound HERE and nowhere else. A world change is a rebuild — main.js
       * drops the city and calls this again — so the schedule, the override and the live block all
       * restart together and nothing can be left blending from a preset that no longer exists. */
      var TB = tables();
      var T = TB[(CC.World && CC.World.id) || 'cyber'] || TB.cyber;
      PRESETS = T[0]; NEXT = T[1];
      segT = [0];
      /* Never open on `clear`. The first thing anyone sees should have weather in it — a dry
       * still night is the one state that reads as "nothing is implemented yet".
       *
       * The cost of that, and of DUR_MIN/DUR_VAR being long enough to be a mood, is that the
       * canonical four-frame sweep (600/3000/9000/18000) very nearly never lands on `clear`. It
       * currently draws storm/storm/rain/drizzle for seed 3, rain/rain/mist/storm for 7,
       * storm/storm/mist/CLEAR for 42 and downpour/downpour/drizzle/rain for 99 — one clear frame
       * in sixteen, and under the hash this file shipped with it was zero in sixteen. That makes
       * the reference sweep all but blind to stars, moon, aircraft and cloudbase, every one of
       * which only appears in the weather the sweep cannot see. A segment runs 78-170 s
       * (4700-10200 frames) and clear is about 18% of wall time, so four point samples miss it
       * routinely rather than unluckily. Anything measuring elements/sky.js must add a fifth
       * column at the first settled `clear` frame for its seed, which is: seed 3 -> 22084,
       * seed 7 -> 26789, seed 42 -> 14911, seed 99 -> 55261. (First frame where W.name is 'clear'
       * and the blend has finished. These are a function of CC.hash1, PRESETS, NEXT, DUR_MIN and
       * DUR_VAR — recompute them whenever any of those moves, as the hash change that took them
       * off 122069/9595/31019/57290 shows.) */
      /* PRESETS.length - 1 rather than the literal 5, which was correct only because both tables
       * happened to be exactly six rows. A one-row table indexes 1 + 0*0 = 1 and walks off the end;
       * this makes it 0, which is the only row there is. */
      segI = [PRESETS.length > 1 ? 1 + ((hash1(0, S + 313) * (PRESETS.length - 1)) | 0) : 0];
      forcedI = -1; forcedAt = -1e9;
      update(0, 0);
    },
    update: update,
    rel: rel,
    /* Viewer control. Both are no-ops offline — the headless harness never calls them, so the
     * reference frame stays the frame the browser draws for an untouched keyboard. */
    set: function (nameOrIdx, t) {
      var i = typeof nameOrIdx === 'number' ? nameOrIdx | 0 : -1;
      if (i < 0) for (var j = 0; j < PRESETS.length; j++)
        if (PRESETS[j].name === nameOrIdx) { i = j; break; }
      if (i < 0 || i >= PRESETS.length) return false;
      forcedI = i; forcedAt = t === undefined ? 0 : t;
      return true;
    },
    cycle: function (t, dir) {
      var cur = forcedI >= 0 ? forcedI : PRESETS.map(function (p) { return p.name; }).indexOf(W.name);
      if (cur < 0) cur = REF_I;
      var n = (cur + (dir < 0 ? -1 : 1) + PRESETS.length) % PRESETS.length;
      return Weather.set(n, t);
    },
    get current() { return W.name; }
  };

  if (CC) CC.Weather = Weather;
  if (typeof module !== 'undefined') module.exports = Weather;
})(typeof CC !== 'undefined' ? CC : require('./core.js'));
