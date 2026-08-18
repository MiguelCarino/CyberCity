/* CyberCity optics — the glass between the city and the eye.
 *
 * Nothing in this file belongs to the city. It is the last thing that happens to a frame: light
 * hanging in the rain under a strong source, the wash a close lamp throws across the wall behind
 * it, the far end of the street going cold in mist, the fall-off at the edge of vision, fogged
 * glass, drops beaded on the lens, the flare off the hottest cells, the faint horizontal texture
 * of the display, and the eye adapting to all of it.
 *
 * THE BUDGET, which is the whole discipline of this file. The frame is 40-55% pure black and that
 * IS the look. So of the seven passes here, three cannot add a single lit cell by construction —
 * they only multiply cells the city already drew — and of the four that can write a glyph, three
 * write into black air alone and the fourth is rationed to twenty sources.
 *
 * SEVEN, not the nine this file was written with. Nothing was cut: the two edge-weighted
 * multipliers (vignette, condensation) are one pass and the two whole-frame multipliers
 * (scanlines, exposure) are another, because each pair was walking the same cells to apply what
 * is arithmetically a single number. See sections 4 and 8.
 *
 * The whole file, measured against the version that shipped before it, over seeds 3/7/42/99 at
 * frames 600/3000/9000 at 400x100 (exposure held out of both sides, because its free-running sine
 * is at a different phase in the two builds and would swamp the comparison): lit coverage
 * 59.43% -> 59.57%, +0.14 points, and mean printed luminance +0.31%. It is not evenly spread and
 * it is not meant to be — mist gains +0.48 points of coverage and LOSES 0.13% of its luminance,
 * because the shafts open up and the condensation takes more contrast off than they add; drizzle
 * loses 0.02 points and 0.61%; a downpour gains 1.27% of luminance almost entirely from the wash
 * off the near signage. Re-measure exactly this way before touching any constant below.
 *
 * MOST OF THESE PASSES MODULATE cells they did not create. put() only accepts a strictly nearer
 * depth, so see nearer() for how that rewrite is bought without opening a hole in the depth
 * buffer that a later element could fall through.
 */
(function (CC) {
  'use strict';

  var P = CC.P, put = CC.put, hash2 = CC.hash2, clamp = CC.clamp, vnoise = CC.vnoise,
      lerp = CC.lerp, smoothstep = CC.smooth;

  var G_DOT = CC.g('.'), G_TICK = CC.g('`'), G_QUOTE = CC.g("'"), G_COLON = CC.g(':'),
      G_o = CC.g('o'), G_O = CC.g('O'), G_DASH = CC.g('-');

  /* Weather, read the ONLY sanctioned way. rel(k) is the parameter divided by its value in the
   * 'rain' preset, which is the preset every constant below was tuned under, so each expression
   * here is written to come out at exactly its old value when rel() is 1 — grep for `rel=1` in the
   * comments. Multiplying a tuned constant by the raw P.rain instead would silently re-tune this
   * whole file to 65% of what shipped.
   * The guard is not defensive noise: tools/headless.cjs loads whatever modules exist so the
   * harness stays useful mid-rewrite, and an optics pass that throws takes the entire frame down. */
  function rel(k) { return CC.Weather ? CC.Weather.rel(k) : 1; }

  /* How much there is in the air to catch light — the one number the volumetrics in this file all
   * scale by, so a shaft, the wash off a headlamp and the halo on the lens can never disagree
   * about whether the street is clear or full of water. Fog is the strong term because fog is
   * suspended droplets, which is what actually scatters; haze is the weak one because it is
   * mostly distance. At rel=1 this is 0.22+0.46+0.32 = 1.00 exactly. Clear air lands near 0.42
   * and mist saturates the ceiling, which is a beam five times as thick as a clear-night one. */
  function airDensity() {
    return clamp(0.22 + 0.46 * rel('fog') + 0.32 * rel('haze'), 0.26, 2.40);
  }

  /* A modulation pass has to rewrite a cell it did not author, and put() rejects an equal depth.
   * Shaving a part in ten thousand off the existing depth satisfies the test while leaving the
   * cell at effectively the same place in the queue, so a sibling element that would have drawn
   * in front of it still can.
   * Sky carries Infinity and has no representable nudge, so this refuses it — which is the right
   * answer for the passes that WRITE A GLYPH (a shaft, a mote, a bead, a flare streak): those add
   * lit cells, the backdrop is not theirs to add to, and the budget at the top of this file counts
   * on them staying out of it. The passes that only multiply an existing cell need the backdrop
   * and go through gainDepth() below instead. Note that a backdrop cell one of them has already
   * touched carries BACKDROP_D, which is past 1e30 and so is still refused here: a glyph writer
   * sees the same sky whether a gain pass has been over it or not. */
  function nearer(d) {
    if (!(d < 1e30)) return -1;
    var n = d - d * 1e-4;
    return n < d ? n : -1;
  }

  /* The depth a modulation pass writes the BACKDROP back at.
   *
   * Sky is stored at Infinity, which has nothing representable below it, so for as long as gain()
   * went through nearer() the four whole-frame multipliers in this file — vignette, condensation,
   * scanlines, exposure — could not touch one sky cell. The sky ELEMENTS could: the moon, the
   * blimps, the beacons and the drones are deliberately given a large FINITE depth (~1e5) so they
   * self-occlude against the world pass, and every one of those passes modulated them normally.
   * Measured at 400x100 frame 600, that split 882/1123/1950/784 backdrop cells on seeds 3/7/42/99
   * away from 652/219/126/603 sky-element cells sitting in the same slot, so the corners of the
   * frame carried a vignetted moon inside an unvignetted starfield and the scanline dip stopped at
   * the edge of every sky object. The backdrop has to breathe with the rest of the picture.
   *
   * A sentinel past 1e30 rather than a small finite depth, because "past 1e30" is what the rest of
   * this file and core.js's tone() already read as backdrop: mistfar's `d > 1e30` still skips it,
   * tone()'s `d >= SKY_D` still prints it at the near end of the curve, nearer() still refuses it
   * to glyph writers, and no element in the build draws at any depth remotely near it — so making
   * the depth finite opens no hole for a later element to fall through. It is small enough for the
   * part-in-ten-thousand nudge to stay representable in float32, which is what lets the second,
   * third and fourth pass over the same cell keep working. */
  var BACKDROP_D = 1e34;

  function gainDepth(d) {
    if (d === Infinity) return BACKDROP_D;
    if (!(d < 1e35)) return -1;              // NaN, and nothing else can reach here
    var n = d - d * 1e-4;
    return n < d ? n : -1;
  }

  /* Multiply one cell's brightness in place. Cells already at zero are skipped — there is no
   * such thing as a darker black — and so is any gain too small to survive the 0..255
   * quantisation, which keeps four chained passes from writing thousands of cells for nothing. */
  function gain(f, x, y, g) {
    var i = y * f.cols + x, lum = f.lum[i];
    if (lum === 0) return;
    var nl = (lum * g + 0.5) | 0;
    if (nl === lum) return;
    var d = gainDepth(f.dist[i]);
    if (d < 0) return;
    put(f, x, y, f.ch[i], f.col[i], nl, d, f.kind[i]);
  }

  /* =====================================================================================
   * 1. Volumetric shafts
   *
   * There is no lamp registry to read — streetlights and signage belong to other files — so the
   * sources are found in the FRAME. A column carrying several very bright chromatic cells above
   * the horizon is, by construction, a sign or a lit storey, and that is exactly what throws a
   * shaft down through the rain. Reading the frame also means the shaft can never disagree with
   * the picture about where the light is.
   *
   * Three shafts, never more. They only fill cells that are already black, so a shaft can never
   * dim or recolour anything the city drew — it is pure addition into empty air, and the dither
   * keeps it reading as motes rather than as the grey veil that would wreck the whole aesthetic.
   * ===================================================================================== */
  var SHAFTS = 3;

  var shaft = {
    name: 'lightshafts',
    layer: 78,          // before every modulation pass: the shafts are in the world, not on the lens
    /* THE TWO WORLDS WITH AIR IN THEM. A shaft is light scattering off something in the air.
     * See src/world.js: `world` may be a string or a set, and absent means every world. */
    world: ['cyber', 'west'],

    init: function (city, rng) {
      this.seed = ((rng() * 4294967296) | 0) ^ 0x5A17;
      this.primed = false;
      this.found = 0;
      this.cols = 0;
      // Per-column detection scratch. Sized on first draw and only ever regrown, never per frame.
      this.score = null; this.smooth = null; this.srcY = null; this.srcC = null; this.hits = null;
      // Live shaft slots, eased frame to frame so a sign passing behind a pillar fades out
      // instead of blinking off.
      this.sx = new Float32Array(SHAFTS);
      this.sy = new Float32Array(SHAFTS);
      this.sc = new Uint8Array(SHAFTS);
      this.ss = new Float32Array(SHAFTS);
      this.pkX = new Int32Array(SHAFTS);
      this.pkY = new Int32Array(SHAFTS);
      this.pkC = new Uint8Array(SHAFTS);
      this.pkS = new Float32Array(SHAFTS);
      this.tilt = new Float32Array(SHAFTS);
      for (var i = 0; i < SHAFTS; i++) this.tilt[i] = (rng() - 0.5) * 0.62;
    },

    /* The easing lives HERE, on the simulation tick, and not in draw(). main.js runs a fixed-step
     * accumulator: update() is called at a constant 1/60 s while draw() is called once per rendered
     * frame at whatever rate the panel does, so easing where the frame is drawn made a shaft slide
     * and fade twice as fast on a 120 Hz screen as on a 60 Hz one — the exact class of bug the
     * accumulator exists to prevent. The targets are the ones the previous draw detected, which is
     * one tick of lag on a quantity whose own time constant is a third of a second.
     * Nothing is allocated and nothing is drawn; the frame is not even visible from here. */
    update: function (dt) {
      if (!this.primed) return;            // no detection has run yet: nothing to ease toward
      var d = dt > 0.25 ? 0.25 : dt;
      var eP = 1 - Math.exp(-d * 6.0);     // position
      var eS = 1 - Math.exp(-d * 2.2);     // strength
      var found = this.found;
      for (var s = 0; s < SHAFTS; s++) {
        var tgt = s < found ? clamp((this.pkS[s] - 150) / 420, 0, 1) : 0;
        if (s < found) {
          var dxs = this.pkX[s] - this.sx[s];
          // A jump of more than a few columns is a different source, not the same one moving.
          if (this.ss[s] < 0.06 || dxs > 14 || dxs < -14) {
            this.sx[s] = this.pkX[s]; this.sy[s] = this.pkY[s];
          } else {
            this.sx[s] += dxs * eP;
            this.sy[s] += (this.pkY[s] - this.sy[s]) * eP;
          }
          this.sc[s] = this.pkC[s];
        }
        this.ss[s] += (tgt - this.ss[s]) * eS;
      }
    },

    sizeTo: function (cols) {
      if (this.cols === cols) return;
      this.cols = cols;
      // Allocation on RESIZE only, which is a DOM event, not a frame. There is no honest way to
      // size these at init(): the element interface hands init a city, not a viewport.
      this.score = new Float32Array(cols);
      this.smooth = new Float32Array(cols);
      this.srcY = new Int32Array(cols);
      this.srcC = new Uint8Array(cols);
      this.hits = new Uint8Array(cols);
    },

    /* Sources are chromatic and bright. Slate, white and shadow are structure and pavement —
     * a kerb catching a highlight is not a lamp and must not grow a beam. */
    isSource: function (c) {
      return c !== P.slate && c !== P.white && c !== P.shadow && c !== P.pure;
    },

    detect: function (f, hz) {
      var cols = f.cols, rows = f.rows, x, y, i;
      var score = this.score, srcY = this.srcY, srcC = this.srcC, hits = this.hits;
      for (x = 0; x < cols; x++) { score[x] = 0; srcY[x] = -1; srcC[x] = 0; hits[x] = 0; }

      var yEnd = (hz + rows * 0.12) | 0;
      if (yEnd > rows - 1) yEnd = rows - 1;
      for (y = 0; y <= yEnd; y++) {
        for (x = 0; x < cols; x++) {
          i = y * cols + x;
          var l = f.lum[i];
          if (l < 150) continue;
          var c = f.col[i];
          if (!this.isSource(c)) continue;
          score[x] += l - 150;
          if (hits[x] < 255) hits[x]++;
          // The shaft hangs below the source, so the anchor is the LOWEST bright row, not the
          // brightest: a beam that starts at the middle of a blade sign reads as a mistake.
          if (y > srcY[x]) { srcY[x] = y; srcC[x] = c; }
        }
      }

      /* A sign is several columns wide and a single hot column is a lit window, which is far too
       * small to throw a visible beam. Smoothing over +-2 columns is what discriminates them. */
      var sm = this.smooth;
      for (x = 0; x < cols; x++) {
        var a = 0, n = 0;
        for (i = x - 2; i <= x + 2; i++) if (i >= 0 && i < cols) { a += score[i]; n++; }
        sm[x] = a / n;
      }

      var found = 0, k, best, bv;
      for (k = 0; k < SHAFTS; k++) {
        best = -1; bv = 170;                       // ~6 bright cells across the window; below that
        for (x = 0; x < cols; x++) if (sm[x] > bv) { bv = sm[x]; best = x; }
        if (best < 0) break;                       // nothing left worth a beam
        // The smoothed peak can land a column or two off the actual glyphs, which would leave the
        // anchor row unset. Snap back onto the hottest real column inside the window.
        var pick = best, pv = -1;
        for (i = best - 2; i <= best + 2; i++)
          if (i >= 0 && i < cols && srcY[i] >= 0 && score[i] > pv) { pv = score[i]; pick = i; }
        if (srcY[pick] < 0 || hits[pick] < 3) { sm[best] = 0; k--; continue; }
        this.pkX[found] = pick; this.pkY[found] = srcY[pick];
        this.pkC[found] = srcC[pick]; this.pkS[found] = bv;
        found++;
        for (i = best - 9; i <= best + 9; i++) if (i >= 0 && i < cols) sm[i] = 0;
      }

      // Sorted by column so slot i keeps tracking the same physical source between frames; an
      // unsorted assignment makes shafts swap places and strobe.
      for (k = 1; k < found; k++) {
        var jx = this.pkX[k], jy = this.pkY[k], jc = this.pkC[k], js = this.pkS[k], j = k - 1;
        while (j >= 0 && this.pkX[j] > jx) {
          this.pkX[j + 1] = this.pkX[j]; this.pkY[j + 1] = this.pkY[j];
          this.pkC[j + 1] = this.pkC[j]; this.pkS[j + 1] = this.pkS[j]; j--;
        }
        this.pkX[j + 1] = jx; this.pkY[j + 1] = jy; this.pkC[j + 1] = jc; this.pkS[j + 1] = js;
      }
      return found;
    },

    draw: function (f, cam, t) {
      var cols = f.cols, rows = f.rows;
      this.sizeTo(cols);
      var hz = cam && cam.horizon !== undefined ? cam.horizon : rows * 0.56;
      var found = this.detect(f, hz);
      /* Handed to update(), which owns the easing. draw() only ever READS the eased slots. */
      this.found = found;

      var s, i, x, y;
      /* The very first frame has nothing to ease from, and a shaft easing up out of nothing over
       * half a second means the piece opens on a street whose lamps have no beams. So the first
       * detection lands directly on the slots and every later one is eased in update(). Note this
       * is genuinely the FIRST frame now: while tools/headless.cjs drew once at the end of a
       * replay, every offline frame took this branch and no offline frame ever showed an eased
       * shaft — the easing below existed only in the browser. */
      if (!this.primed) {
        this.primed = true;
        for (s = 0; s < SHAFTS; s++) {
          this.ss[s] = s < found ? clamp((this.pkS[s] - 150) / 420, 0, 1) : 0;
          if (s < found) {
            this.sx[s] = this.pkX[s]; this.sy[s] = this.pkY[s]; this.sc[s] = this.pkC[s];
          }
        }
      }

      /* A beam is only as visible as the air it is crossing. On a clear night there is nothing
       * between the lamp and the eye and the shaft is barely a suggestion round the glyphs; in
       * mist the same lamp fills the street. Three separate terms move, and they have to move
       * together or the beam changes shape instead of changing density: how far it reaches, how
       * wide it spreads, and how solid it is at the core. All three are 1.0 at rel=1. */
      var air = airDensity();
      var reach = 0.80 + 0.20 * air;      // length: the least sensitive, or a clear night loses the beam
      var spread = 0.66 + 0.34 * air;     // half-width
      var dense = 0.35 + 0.65 * air;      // alpha, and therefore very nearly the cell count
      /* And the beam's own brightness, which is the term that decides whether it reads at all:
       * the shafts print in the SOURCE's swatch, and the source is usually amber, whose print
       * weight is the most held-down in the table (0.19). At the old flat lum a mist beam landed
       * at 17/255 on screen, which the bloom smeared into nothing. */
      var glow = 0.45 + 0.55 * air;
      /* Rain crossing the beam. The rain is already in the frame — weather.js drew it thirty
       * layers ago — so the light does not need to invent a drop, it needs to find the one that
       * is there and make it brighter than its neighbours outside the beam. That contrast IS the
       * volumetric read, and it costs no coverage at all. */
      var wet = clamp(0.55 * rel('rain') + 0.45 * rel('steam'), 0, 1.6);

      for (s = 0; s < SHAFTS; s++) {
        var str = this.ss[s];
        if (str < 0.07) continue;

        var x0 = this.sx[s], y0 = this.sy[s], hue = this.sc[s], tilt = this.tilt[s];
        var L = (8 + 10 * str) * reach;
        // Rain drifting through the beam. Frozen to a constant under reduced motion — a shaft
        // that pulses is the single most distracting thing this file can do.
        var moving = !CC.reducedMotion;

        for (var k = 1; k <= L; k++) {
          y = (y0 + k) | 0;
          if (y >= rows) break;
          if (y < 0) continue;
          var fall = 1 - k / L;
          /* Only down to 30% at the far end, not to zero. A shaft that fades out along its length
           * as fast as it widens dies inside six rows and reads as dust round the lamp; keeping a
           * floor under it is what makes the beam reach the ground, which is the whole point. */
          var along = 0.30 + 0.70 * fall;
          var hw = (0.62 + k * 0.22) * spread;
          var cxr = x0 + k * tilt;
          // Minus t, not plus: the sampling point has to travel DOWN the beam for the thickenings
          // to read as rain falling through it rather than as smoke rising out of the street.
          var breathe = moving ? 0.70 + 0.44 * vnoise(k * 0.42 - t * 1.7 + s * 13.7, this.seed)
                               : 0.90;
          var xa = Math.ceil(cxr - hw), xb = Math.floor(cxr + hw);
          for (x = xa; x <= xb; x++) {
            if (x < 0 || x >= cols) continue;
            var dn = (x - cxr) / hw;
            var e2 = 1 - dn * dn;
            if (e2 <= 0) continue;
            // sqrt, not the parabola it is derived from: squared, the cross-section is under the
            // 0.06 floor everywhere but dead centre and a full-strength shaft lands three cells
            // in the whole frame — measured, not guessed.
            var a = str * along * Math.sqrt(e2) * breathe * dense;
            if (a < 0.06) continue;
            i = y * cols + x;
            /* Something is already here. If it is faint and it is an ELEMENT — rain, sleet,
             * steam, a mote — then it is airborne water inside the cone and it lights up; that is
             * the one case where a shaft is allowed to touch a cell it did not author. The lum
             * ceiling is the guard that keeps this to the air: a lamp, a sign or a car at 130+ is
             * a source in its own right and a beam crossing it must not make it hotter. */
            if (f.ch[i] !== 0 && f.lum[i] > 4) {
              if (f.kind[i] === 3 && f.lum[i] < 130 && wet > 0.05)
                gain(f, x, y, 1 + a * 0.85 * wet);
              continue;
            }
            /* Dither welded to the shaft's own seed: a solid cone is a veil, and a cone that
             * re-rolls every frame is static. The pattern is fixed; only `a` breathes.
             * Scaled past 1 on purpose, so the beam's core column is continuous while its edges
             * stay scattered. A uniformly sampled cone at this density is not a shaft, it is
             * confetti — coherence down the middle is the entire read. */
            if (hash2(x, y * 3 + s * 97, this.seed) > a * 1.15) continue;
            var d = nearer(f.dist[i]);
            if (d < 0) continue;
            /* Thick air also changes the GLYPH, not just the value. A colon is two marks in the
             * cell where a backtick is one, so the beam gains body in mist by covering more of
             * the cell rather than by turning up a number the print curve would only crush. */
            put(f, x, y, a > 0.62 && air > 1.25 ? G_COLON : (a > 0.46 ? G_QUOTE : G_TICK),
                hue, (7 + a * 17) * glow, d, 3);
          }
        }
      }
    }
  };

  /* =====================================================================================
   * 2. The wash off a bright thing that is CLOSE.
   *
   * A headlamp swinging through an intersection does not only light its own cells: it drags a
   * wedge of light across the facade behind it, and the wedge arrives before the lamp does and
   * leaves after it. The cars themselves belong to street.js and this file may not touch them, so
   * the pass works the way a real lens does — over the FINISHED frame, reading dist and col. Any
   * bright near thing qualifies: a headlamp, a shopfront two metres away, a blade sign at the
   * corner. That is not a compromise, it is the honest generalisation.
   *
   * This pass is PURE GAIN. It never writes a glyph, so it cannot cost a single cell of coverage
   * and cannot recolour anything; all it does is decide that some cells the city already drew are
   * standing in somebody's light. The wedge leans in the direction the source is travelling,
   * which costs nothing to know: the eased position lags the detected one, and that lag IS the
   * screen velocity.
   * ===================================================================================== */
  var WASH = 2;               // two at once. Three sources this near is a fairground, not a street
  var W_NEAR = 26;            // metres. Past this a lamp is scenery and lights nothing but itself
  var W_ON = 70, W_FULL = 320; // tile energy for a wash to start, and for it to reach full strength

  var wash = {
    name: 'lightwash',
    layer: 79,                // still in the world: this is light on surfaces, not dirt on glass
    /* THE TWO WORLDS WITH AIR IN THEM. Likewise: this is airglow round a bright source.
     * See src/world.js: `world` may be a string or a set, and absent means every world. */
    world: ['cyber', 'west'],

    init: function (city, rng) {
      // Small seed, varied additively — see the note in weather.js about hash2 and large seeds.
      this.seed = (rng() * 30011) | 0;
      this.cols = 0; this.rows = 0; this.tw = 0; this.th = 0;
      this.te = null; this.tx = null; this.ty = null;      // tile energy and its centroid
      this.tc = null; this.tl = null; this.td = null;      // hue, lum and depth of the tile's peak
      this.found = 0; this.primed = false;
      this.pkX = new Float32Array(WASH); this.pkY = new Float32Array(WASH);
      this.pkS = new Float32Array(WASH); this.pkD = new Float32Array(WASH);
      this.pkC = new Uint8Array(WASH);
      this.sx = new Float32Array(WASH); this.sy = new Float32Array(WASH);
      this.ss = new Float32Array(WASH); this.sd = new Float32Array(WASH);
      this.sc = new Uint8Array(WASH);
      this.lead = new Float32Array(WASH);
    },

    /* Same division of labour as the shafts: draw() detects into pk*, update() eases into s*.
     * The easing has to run on the fixed simulation tick or the wedge crosses a facade at twice
     * the speed on a 120 Hz panel. */
    update: function (dt) {
      if (!this.primed) return;
      var d = dt > 0.25 ? 0.25 : dt;
      var eP = 1 - Math.exp(-d * 7.0), eS = 1 - Math.exp(-d * 2.6);
      var found = this.found;
      for (var s = 0; s < WASH; s++) {
        var tgt = s < found ? clamp((this.pkS[s] - W_ON) / (W_FULL - W_ON), 0, 1) : 0;
        if (s < found) {
          var dxs = this.pkX[s] - this.sx[s];
          // Beyond a slot's tracking window this is a different lamp, not the same one moving.
          if (this.ss[s] < 0.05 || dxs > 20 || dxs < -20) {
            this.sx[s] = this.pkX[s]; this.sy[s] = this.pkY[s]; this.lead[s] = 0;
          } else {
            this.sx[s] += dxs * eP;
            this.sy[s] += (this.pkY[s] - this.sy[s]) * eP;
            /* The wedge leans ahead of the lamp by its own lag. A parked sign has zero lag and
             * gets a symmetric pool; something crossing the frame gets a wedge that runs ahead
             * of it, which is what makes a pass read as a sweep rather than as a lamp with a
             * glow stuck to it. */
            this.lead[s] += (clamp(dxs * 1.7, -10, 10) - this.lead[s]) * eP;
          }
          this.sc[s] = this.pkC[s]; this.sd[s] = this.pkD[s];
        }
        this.ss[s] += (tgt - this.ss[s]) * eS;
      }
    },

    sizeTo: function (cols, rows) {
      if (this.cols === cols && this.rows === rows) return;
      this.cols = cols; this.rows = rows;
      // Resize-time allocation only; a tile is 6x3 cells, which is about the size of a car at
      // fifteen metres and small enough that one shopfront does not swallow the whole frame.
      this.tw = Math.ceil(cols / 6); this.th = Math.ceil(rows / 3);
      var n = this.tw * this.th;
      this.te = new Float32Array(n); this.tx = new Float32Array(n); this.ty = new Float32Array(n);
      this.tc = new Uint8Array(n); this.tl = new Uint8Array(n); this.td = new Float32Array(n);
    },

    detect: function (f) {
      var cols = f.cols, rows = f.rows, tw = this.tw;
      var te = this.te, tx = this.tx, ty = this.ty, tc = this.tc, tl = this.tl, td = this.td;
      var n = tw * this.th, i, x, y;
      for (i = 0; i < n; i++) { te[i] = 0; tx[i] = 0; ty[i] = 0; tc[i] = 0; tl[i] = 0; td[i] = 0; }

      for (y = 0; y < rows; y++) {
        var ry = ((y / 3) | 0) * tw;
        for (x = 0; x < cols; x++) {
          i = y * cols + x;
          var l = f.lum[i];
          if (l < 150) continue;
          var c = f.col[i];
          // Structure is not light. Same test the shafts use, and for the same reason: a kerb
          // catching a highlight must not start washing the wall behind it.
          if (c === P.slate || c === P.white || c === P.shadow) continue;
          var dd = f.dist[i];
          if (!(dd < W_NEAR)) continue;
          /* Squared fall-off with distance, so the wash is dominated by whatever is genuinely
           * close. Linear weighting handed the whole frame to the parade of shopfronts at
           * fifteen metres, which is exactly the thing that is NOT a passing light. */
          var w = 1 - dd / W_NEAR; w *= w;
          var e = (l - 150) * w;
          var ti = ry + ((x / 6) | 0);
          te[ti] += e; tx[ti] += x * e; ty[ti] += y * e;
          if (l > tl[ti]) { tl[ti] = l; tc[ti] = c; td[ti] = dd; }
        }
      }

      var found = 0, k, best, bv, tj;
      for (k = 0; k < WASH; k++) {
        best = -1; bv = W_ON;
        for (i = 0; i < n; i++) if (te[i] > bv) { bv = te[i]; best = i; }
        if (best < 0) break;
        this.pkX[found] = tx[best] / te[best];
        this.pkY[found] = ty[best] / te[best];
        this.pkC[found] = tc[best]; this.pkD[found] = td[best]; this.pkS[found] = bv;
        found++;
        // Suppress the neighbourhood, or a wide sign wins both slots and the second wash sits
        // on top of the first.
        var bx = best % tw, by = (best / tw) | 0;
        for (var oy = -2; oy <= 2; oy++)
          for (var ox = -3; ox <= 3; ox++) {
            var nx = bx + ox, ny = by + oy;
            if (nx < 0 || ny < 0 || nx >= tw || ny >= this.th) continue;
            te[ny * tw + nx] = 0;
          }
      }
      // Sorted by column, so a slot keeps tracking the same physical lamp between frames.
      for (k = 1; k < found; k++) {
        var jx = this.pkX[k], jy = this.pkY[k], jc = this.pkC[k], js = this.pkS[k], jd = this.pkD[k];
        tj = k - 1;
        while (tj >= 0 && this.pkX[tj] > jx) {
          this.pkX[tj + 1] = this.pkX[tj]; this.pkY[tj + 1] = this.pkY[tj];
          this.pkC[tj + 1] = this.pkC[tj]; this.pkS[tj + 1] = this.pkS[tj];
          this.pkD[tj + 1] = this.pkD[tj]; tj--;
        }
        this.pkX[tj + 1] = jx; this.pkY[tj + 1] = jy; this.pkC[tj + 1] = jc;
        this.pkS[tj + 1] = js; this.pkD[tj + 1] = jd;
      }
      return found;
    },

    draw: function (f, cam, t) {
      var cols = f.cols, rows = f.rows;
      this.sizeTo(cols, rows);
      var found = this.detect(f);
      this.found = found;

      var s, x, y, i;
      // As with the shafts: the first frame has nothing to ease from, so it lands directly and the
      // piece opens with the wash already on the wall instead of half a second of bare facade.
      // this.lead is the eased position's LAG, so it is identically zero on this branch — which is
      // why no offline frame rendered before tools/headless.cjs drew every tick has ever shown the
      // wedge leaning, however fast the source was crossing.
      if (!this.primed) {
        this.primed = true;
        for (s = 0; s < WASH; s++) {
          this.ss[s] = s < found ? clamp((this.pkS[s] - W_ON) / (W_FULL - W_ON), 0, 1) : 0;
          if (s < found) {
            this.sx[s] = this.pkX[s]; this.sy[s] = this.pkY[s];
            this.sc[s] = this.pkC[s]; this.sd[s] = this.pkD[s];
          }
        }
      }

      /* Thick air spreads the wash and lifts it; on a clear night a headlamp lights the wall and
       * almost nothing else. 1.0 at rel=1, as everywhere in this file. */
      var air = airDensity();
      var reach = 0.78 + 0.22 * air;
      var amp0 = 0.52 * (0.72 + 0.28 * air);
      /* The air inside the wedge, and the only part of this pass that can cost coverage. It is
       * held to the inner half of the wedge and dithered against a fixed screen pattern, so what
       * lands is a scatter of motes in the beam rather than a disc of fog — measured at 40-90
       * cells in a 400x100 frame, against the 500-odd cells the gain half of the pass touches.
       * Nothing at all in clear air: with no water in it there is nothing there to light. */
      var motes = clamp((air - 0.85) * 0.55, 0, 0.42);
      var S = this.seed;

      for (s = 0; s < WASH; s++) {
        var str = this.ss[s];
        if (str < 0.06) continue;
        var cx = this.sx[s], cy = this.sy[s], srcD = this.sd[s], hue = this.sc[s];
        // Under reduced motion the wedge stops leaning about; the pool stays, the sweep does not.
        var lead = CC.reducedMotion ? this.lead[s] * 0.25 : this.lead[s];
        var rx = (8 + 10 * str) * reach, ry = (2.4 + 2.6 * str) * reach;
        var amp = amp0 * str;
        var skew = 1 + (lead < 0 ? -lead : lead) / rx * 1.6;
        var ya = Math.ceil(cy - ry), yb = Math.floor(cy + ry);
        if (ya < 0) ya = 0; if (yb > rows - 1) yb = rows - 1;
        for (y = ya; y <= yb; y++) {
          var dy = (y - cy) / ry;
          var room = 1 - dy * dy;
          if (room <= 0) continue;
          var xa = Math.ceil(cx - rx * skew), xb = Math.floor(cx + rx * skew);
          if (xa < 0) xa = 0; if (xb > cols - 1) xb = cols - 1;
          for (x = xa; x <= xb; x++) {
            var dx = (x - cx) / rx;
            // The wedge is longer on the side the lamp is heading for and clipped short behind.
            if (dx * lead > 0) dx /= skew;
            var r2 = dx * dx + dy * dy;
            if (r2 >= 1) continue;
            i = y * cols + x;
            var fall = 1 - r2; fall *= fall;
            if (f.lum[i] === 0) {
              /* Empty air inside the wedge. This is the only part of the pass that can add a
               * cell, so it is confined to the core of the wedge and thrown away by a fixed
               * screen dither — a continuous disc here would be exactly the veil of fog this
               * project has already had once. */
              if (motes < 0.01 || fall < 0.30) continue;
              if (hash2(x, y * 5 + s * 131, S) > motes * fall) continue;
              var dm = nearer(f.dist[i]);
              if (dm < 0) continue;                // sky keeps its Infinity, see nearer()
              put(f, x, y, fall > 0.62 ? G_QUOTE : G_TICK, hue, 6 + 16 * fall * amp, dm, 3);
              continue;
            }
            /* Only what is BEHIND the lamp is in its light. Without this the wash lands on the
             * rain between the lamp and the eye and the whole effect reads as a smear on the
             * glass rather than as a beam landing on a wall. */
            if (f.dist[i] < srcD * 0.72) continue;
            gain(f, x, y, 1 + amp * fall);
          }
        }
      }
    }
  };

  /* =====================================================================================
   * 3. The far field goes cold in mist.
   *
   * Water in the air scatters the short wavelengths back at you and swallows the long ones, so
   * the far end of a misty street loses its sodium first: the lamps at the end of the block are
   * blue-white long before they are dim. This pass says exactly that and nothing more — it moves
   * a warm cell's colour INDEX to slate, which is the swatch this palette already keeps for cold
   * distance, and invents no new colour at all.
   *
   * The lum is rescaled by the ratio of the two swatches' print weights, so the swap costs the
   * frame no energy: it is a hue change, not a brightening. Reading CC.EXPOSURE rather than
   * hard-coding 0.19/2.00 matters — those weights are refitted whenever the surfaces change, and
   * a copy of them here would silently become a brightening pass the day somebody refits.
   * ===================================================================================== */
  var mistfar = {
    name: 'mistfar',
    layer: 80,
    /* THE TWO WORLDS WITH AIR IN THEM. Mist.
     * See src/world.js: `world` may be a string or a set, and absent means every world. */
    world: ['cyber', 'west'],

    init: function (city, rng) { this.seed = (rng() * 30011) | 0; },

    draw: function (f) {
      /* Nothing at all until the air is genuinely thick — at rel=1 this is zero and the pass
       * returns on its first line, which is what keeps it off eleven frames in twelve. */
      var str = clamp((rel('fog') - 1.30) / 1.70, 0, 1);
      if (str < 0.02) return;
      var EX = CC.EXPOSURE, kS = EX[P.slate];
      var cols = f.cols, rows = f.rows, S = this.seed, x, y, i;
      /* WHERE the far field starts is itself a function of the fog, and by a long way — measured
       * on seed 7 in full mist, only 39 lit warm cells in a 400x100 frame are past 32 m at all,
       * because Surf.fog has already taken everything behind them. A "far field" fixed at 32 m
       * therefore repaints nothing precisely when the effect is supposed to be at its strongest.
       * In mist the distance goes cold at twelve metres, which is also how mist looks. */
      var D0 = 30 - 18 * str, DR = 60 - 30 * str;
      for (y = 0; y < rows; y++)
        for (x = 0; x < cols; x++) {
          i = y * cols + x;
          var l = f.lum[i];
          if (l === 0 || f.ch[i] === 0) continue;
          var c = f.col[i];
          // Only the warm half of the palette has anything to lose. Azure and ice are already the
          // colour mist would turn them, and slate is the destination.
          if (c !== P.amber && c !== P.warm && c !== P.ember && c !== P.spring) continue;
          var d = f.dist[i];
          if (!(d > D0) || d > 1e30) continue;
          /* A fraction of the cells, not all of them, and the fraction grows with depth. A solid
           * repaint of the far field turns the end of the street into one flat slab; leaving warm
           * cells scattered through it is what still reads as sodium seen THROUGH something. */
          var p = clamp((d - D0) / DR, 0, 1) * str * 0.78;
          /* The dither is keyed to the SCREEN cell, not to the world, which is deliberate: a
           * pattern keyed to world position would swim across the picture as the viewer walks,
           * and there is no world identity to key to here anyway — a post pass sees a screen.
           * What moves as the camera moves is only p, the density, so the far field thickens and
           * thins with the depth of what is behind it instead of crawling. */
          if (hash2(x, y, S) > p) continue;
          var nl = (l * EX[c] / kS + 0.5) | 0;
          if (nl < 1) continue;              // it would print as a hole; leave the warm cell alone
          var dd = nearer(d);
          if (dd < 0) continue;
          put(f, x, y, f.ch[i], P.slate, nl, dd, f.kind[i]);
        }
    }
  };

  /* =====================================================================================
   * 4. The fall-off at the edge of vision, and the glass fogging over it.
   *
   * TWO EFFECTS, ONE WALK, and the fusion is the point rather than a micro-optimisation.
   *
   * The vignette is corner fall-off. Its map is a pure function of the viewport, so it is built
   * once per size and then read. The shape is deliberately weak at the mid-edges (~3%) and only
   * real in the corners (~32%): a vignette strong enough to see as a ring reads as a lens fault,
   * whereas this one just keeps the eye off the four places where the raycaster's frustum is
   * least honest.
   *
   * The condensation is the glass itself fogging, and only in real fog — the one term in this
   * file that is pure subtraction. Mist does not put light on a lens, it takes contrast off one,
   * in slow soft patches that sit still while the city moves behind them. The pattern is
   * therefore built ONCE per viewport and never re-rolled: condensation that crawls is a
   * screensaver, condensation that sits there is a window. It is weighted to the edges of the
   * frame because that is where a real one survives — the middle of any glass anybody is looking
   * through gets wiped, by a hand, a blower or the heat of whatever is behind it.
   *
   * WHY THEY ARE ONE PASS. They are both edge-weighted scalar multipliers over the whole frame
   * with nothing between them in the layer order, so run separately they cost two full-frame
   * traversals and two read-modify-writes of the same cell to apply what is arithmetically one
   * number. Measured over the canonical sweep, condensation on its own reached 12-17% of the
   * frame at mean |dV| 3.5-5.2 — real, but the same shape and the same order of magnitude as the
   * vignette that had just walked the identical cells. Folding the fog term into the vignette's
   * own multiplier keeps the weather (the patches are still there, still only in mist) and pays
   * for it once. The condensation map stays lazily allocated: most weather never asks for it, and
   * a cols*rows Float32Array for a term that is switched off is a page per viewport spent on
   * nothing.
   * ===================================================================================== */
  /* Two-dimensional value noise, built from the same hash the rest of the file uses so the patch
   * pattern is a pure function of the seed. Only ever called from build(), never per frame. */
  function vn2(x, y, s) {
    var xi = Math.floor(x), yi = Math.floor(y);
    var fx = smoothstep(x - xi), fy = smoothstep(y - yi);
    var a = lerp(hash2(xi, yi, s), hash2(xi + 1, yi, s), fx);
    var b = lerp(hash2(xi, yi + 1, s), hash2(xi + 1, yi + 1, s), fx);
    return a + (b - a) * fy;
  }

  var vignette = {
    name: 'vignette',
    layer: 92,

    /* One rng draw, and it is the one the condensation patches used to take when they were their
     * own element at layer 93. Every element in this file shares one stream, so the COUNT and the
     * ORDER of draws here is load-bearing: take one fewer and lensrain, lensbloom and the
     * exposure phases all shift onto somebody else's numbers and the offline reference frames
     * stop matching the browser. */
    init: function (city, rng) {
      this.seed = (rng() * 30011) | 0;
      this.w = 0; this.h = 0; this.map = null; this.cond = null;
    },

    build: function (cols, rows) {
      if (this.w === cols && this.h === rows) return;
      this.w = cols; this.h = rows;
      this.map = new Float32Array(cols * rows);   // resize-time only, see shaft.sizeTo
      this.cond = null;                           // rebuilt on demand at the new size
      for (var y = 0; y < rows; y++) {
        var ny = (y + 0.5) / rows * 2 - 1;
        for (var x = 0; x < cols; x++) {
          var nx = (x + 0.5) / cols * 2 - 1;
          var r = Math.sqrt(nx * nx + ny * ny) * 0.70710678;   // 0 at centre, 1 at a corner
          var k = clamp((r - 0.52) / 0.48, 0, 1);
          this.map[y * cols + x] = 1 - 0.32 * k * k;
        }
      }
    },

    buildCond: function (cols, rows) {
      if (this.cond) return;
      this.cond = new Float32Array(cols * rows);  // first mist at this size only, never per frame
      var S = this.seed;
      for (var y = 0; y < rows; y++) {
        var ny = (y + 0.5) / rows * 2 - 1;
        for (var x = 0; x < cols; x++) {
          var nx = (x + 0.5) / cols * 2 - 1;
          var r = Math.sqrt(nx * nx + ny * ny) * 0.70710678;
          // Two octaves: broad patches with a finer break-up on top, or the edges of the patches
          // read as a shape rather than as weather.
          var v = vn2(x * 0.055, y * 0.10, S) * 0.68 + vn2(x * 0.16, y * 0.30, S + 41) * 0.32;
          v = clamp((v - 0.34) / 0.52, 0, 1);
          // Stored as the DEPTH of the dip, so the per-frame strength can scale it directly.
          this.cond[y * cols + x] = v * v * clamp((r - 0.30) / 0.62, 0, 1) * 0.30;
        }
      }
    },

    draw: function (f) {
      this.build(f.cols, f.rows);
      /* No fog term at all until the air is properly wet. At rel=1 this is 0 and the term costs
       * one compare for the whole frame; it is a mist effect and has no business in ordinary rain. */
      var str = clamp((rel('fog') - 1.55) / 1.45, 0, 1);
      var cond = null;
      if (str >= 0.02) { this.buildCond(f.cols, f.rows); cond = this.cond; }
      var map = this.map, cols = f.cols, rows = f.rows, i = 0;
      for (var y = 0; y < rows; y++)
        for (var x = 0; x < cols; x++, i++) {
          var g = map[i];
          if (cond) g *= 1 - cond[i] * str;
          if (g > 0.995) continue;             // the whole middle of the frame, untouched
          gain(f, x, y, g);
        }
    }
  };

  /* =====================================================================================
   * 6. Rain beading on the lens.
   *
   * A drop is not a bright dot; it is a small bad lens. Each bead drags the cell behind and below
   * it into its own cell and softens both, so a bead only announces itself when it crosses
   * something lit — which is precisely when a real one does. Over black it leaves the faintest
   * catch-light, and that is all.
   *
   * Positions are normalised, so a resize moves the drops with the frame instead of stranding
   * them off-screen or forcing a reallocation.
   *
   * HOW MANY there are is the weather's business, and the count is a RATCHET, not a mirror of
   * P.rain: glass that has been rained on stays rained on. It fills fast when it starts (12 s)
   * and clears at the speed water actually leaves a vertical surface (a minute and a half), which
   * is why a drizzle that follows a downpour still looks like the downpour just ended. The
   * boundary drop fades in and out over its last unit of count rather than popping, so the
   * ratchet never shows a seam.
   * ===================================================================================== */
  var BEADS = 14;                      // allocated once; `want` decides how many are drawn

  var beads = {
    name: 'lensrain',
    layer: 94,
    /* THE TWO WORLDS WITH AIR IN THEM. Beads of rain on the lens.
     * See src/world.js: `world` may be a string or a set, and absent means every world. */
    world: ['cyber', 'west'],

    init: function (city, rng) {
      var s = ((rng() * 4294967296) | 0) ^ 0x0F71C5;
      this.rnd = CC.mulberry(s);
      this.n = BEADS;
      this.nx = new Float32Array(this.n);
      this.ny = new Float32Array(this.n);
      this.r = new Float32Array(this.n);
      this.age = new Float32Array(this.n);
      this.life = new Float32Array(this.n);
      // 9 was the measured ceiling before more than ten drops read as a dirty lens rather than a
      // wet one, and 9 is exactly what the reference preset still asks for — see want().
      this.want = this.target();
      for (var i = 0; i < this.n; i++) {
        this.spawn(i);
        this.age[i] = this.rnd() * this.life[i];   // staggered, or every drop renews at once
      }
    },

    // 9 at rel=1 — the count the lens was tuned with. A dry night keeps four old drops, a
    // downpour beads the whole viewport.
    target: function () { return clamp(9 * (0.45 + 0.55 * rel('rain')), 3.2, BEADS); },

    spawn: function (i) {
      var R = this.rnd;
      this.nx[i] = 0.04 + R() * 0.92;
      // Slight upper bias: the lens is vertical, so the lower half is where drops have already
      // run off. It also keeps them off the road, which is meant to be the darkest thing in frame.
      this.ny[i] = 0.03 + R() * R() * 0.94;
      // Heavier rain beads fatter drops, and a fat drop is the only kind that creeps.
      this.r[i] = (0.5 + R() * R() * 1.1) * (0.86 + 0.14 * rel('rain'));
      this.age[i] = 0;
      this.life[i] = 9 + R() * 17;
    },

    update: function (dt) {
      var d = dt > 0.25 ? 0.25 : dt;
      var tgt = this.target();
      // The asymmetry IS the effect: water arrives quickly and leaves slowly.
      var e = 1 - Math.exp(-d / (tgt > this.want ? 12 : 90));
      this.want += (tgt - this.want) * e;
      if (CC.reducedMotion) return;      // frozen glass; the drops are simply already there
      for (var i = 0; i < this.n; i++) {
        this.age[i] += dt;
        // Only the fat ones have the mass to creep, and even they take a minute to cross a frame.
        if (this.r[i] > 1.0) this.ny[i] += dt * 0.006;
        if (this.age[i] > this.life[i] || this.ny[i] > 0.99) this.spawn(i);
      }
    },

    cell: function (f, x, y, str) {
      var cols = f.cols, rows = f.rows;
      if (x < 0 || y < 0 || x >= cols || y >= rows) return;
      var i = y * cols + x;
      var d = nearer(f.dist[i]);
      if (d < 0) return;                 // sky: a drop against the empty slot has nothing to bend
      var la = f.lum[i], ca = f.col[i];
      var jy = y + 1 < rows ? y + 1 : y - 1;
      var j = jy * cols + x;
      var lb = f.lum[j], cb = f.col[j];
      var out = (la * 0.42 + lb * 0.44) * str;
      var top = la > lb ? la : lb;
      if (out < 4.5) {
        if (str < 0.9) return;           // the tail of a drop over black is nothing at all
        put(f, x, y, G_DOT, P.ice, 10 + top * 0.08, d, 3);
        return;
      }
      var hue = la >= lb ? ca : cb;
      // Water beads a strong source towards white-blue before it beads it towards its own hue.
      if (top > 118) { hue = P.ice; out *= 0.74; }
      put(f, x, y, out > 46 ? G_O : (out > 16 ? G_o : G_COLON), hue, out, d, 3);
    },

    draw: function (f) {
      var cols = f.cols, rows = f.rows;
      // Priming here, not in init(), because init() runs before the first Weather.update in some
      // hosts and a want of 0 would open on a bone-dry lens in a downpour.
      if (!(this.want > 0)) this.want = this.target();
      var want = this.want;
      for (var i = 0; i < this.n; i++) {
        // The last drop in the count is a partial one and fades rather than pops.
        var edge = want - i;
        if (edge <= 0) break;
        var str = edge < 1 ? edge : 1;
        var x = (this.nx[i] * cols) | 0, y = (this.ny[i] * rows) | 0;
        this.cell(f, x, y, str);
        // A drop elongates downward under its own weight once it is big enough to.
        if (this.r[i] > 1.05) this.cell(f, x, y + 1, 0.62 * str);
      }
    }
  };

  /* =====================================================================================
   * 7. Lens bloom — the halo, and the streak off the very hottest cells.
   *
   * Two things a real lens does with a light it cannot quite contain, and they are two ends of
   * one mechanism, so they are one pass:
   *
   *   the HALO is scatter inside the glass, it is a gain on the cells immediately around a source
   *   and therefore costs no coverage at all, and it grows with haze because haze is what puts
   *   the scattering medium in front of the lens in the first place;
   *
   *   the STREAK is the anamorphic one — a horizontal flare off the brightest handful of cells
   *   only. It is the single loudest thing in this file, so it is rationed to eight sources that
   *   have to be local peaks, it writes only into cells nothing else wanted, and it leans with
   *   the pan: the smear on wet glass runs the way the world is sliding, which is the way the
   *   camera is turning.
   *
   * Both are anchored to lum >= 175 BEFORE the print curve, which is where the sources actually
   * are: signage, headlamps, the hot core of a shopfront. At eight sources the halo was a private
   * joke — 56 cells in a 400x100 frame, which is not a property of the lens, it is a coincidence.
   * Twenty is enough for the frame to read as being seen THROUGH something and still small enough
   * that the streaks stay countable.
   * ===================================================================================== */
  var BSRC = 20;

  var lensbloom = {
    name: 'lensbloom',
    layer: 95,

    init: function (city, rng) {
      this.seed = (rng() * 30011) | 0;
      this.bx = new Int32Array(BSRC); this.by = new Int32Array(BSRC);
      this.bl = new Int32Array(BSRC); this.bc = new Uint8Array(BSRC);
      this.n = 0;
      // Pan tracking. The smear DIRECTION is the camera's own turn rate and stays that way even
      // now that weather.js exports CC.Wind: a streak across a lens is drawn by the lens moving,
      // not by the weather, and reaching for the wind vector here would smear the glass sideways
      // while the camera was standing still. rel('wind') is read further down, for the streak's
      // LENGTH, because wind is what puts the water on the glass in the first place — that is the
      // one part of this effect the sky has any say in.
      this.yaw = 0; this.panned = false; this.pan = 0;
    },

    update: function (dt, t, cam) {
      if (!cam) return;
      var y = cam.yaw || 0;
      if (!this.panned) { this.yaw = y; this.panned = true; return; }
      var d = y - this.yaw;
      // Yaw is unwrapped by whoever owns the camera, so a lap of the block can hand us +-2pi.
      while (d > 3.14159265) d -= 6.28318531;
      while (d < -3.14159265) d += 6.28318531;
      this.yaw = y;
      var rate = dt > 1e-4 ? d / dt : 0;
      // Eased hard: the smear must not flicker on one frame of camera jitter.
      var e = 1 - Math.exp(-(dt > 0.25 ? 0.25 : dt) * 3.0);
      this.pan += (clamp(rate * 1.1, -1, 1) - this.pan) * e;
    },

    draw: function (f) {
      var cols = f.cols, rows = f.rows, x, y, i, k;
      var haze = rel('haze'), windy = rel('wind');
      // 0.32 at rel=1. The halo is the safe half of this pass and carries most of the read.
      var halo = clamp(0.14 + 0.18 * haze, 0.10, 0.46);
      /* The streak's length. Wind is in it because wind is what puts the water ON the glass that
       * the flare smears through; the pan supplies the direction and a little more length. */
      var pan = CC.reducedMotion ? this.pan * 0.3 : this.pan;
      var reach = 2.2 + 1.5 * haze + 1.2 * windy * (0.4 + 0.6 * (pan < 0 ? -pan : pan));
      var TH = 175;

      // ---- pick the sources: local peaks only, brightest first, at most BSRC of them.
      var n = 0, bl = this.bl, bx = this.bx, by = this.by, bc = this.bc;
      for (y = 1; y < rows - 1; y++)
        for (x = 1; x < cols - 1; x++) {
          i = y * cols + x;
          var l = f.lum[i];
          if (l < TH) continue;
          var c = f.col[i];
          if (c === P.slate || c === P.shadow) continue;   // concrete does not flare
          /* Local peak, or one blade sign fills all eight slots and the other seven lights in
           * the frame get nothing. >= on one side and > on the other breaks ties along a run of
           * equal cells so exactly one of them wins. */
          if (f.lum[i - 1] > l || f.lum[i + 1] >= l) continue;
          if (f.lum[i - cols] > l || f.lum[i + cols] >= l) continue;
          if (n < BSRC) {
            k = n++;
          } else {
            // Full: replace the weakest, and only if this one beats it.
            var worst = 0;
            for (k = 1; k < BSRC; k++) if (bl[k] < bl[worst]) worst = k;
            if (bl[worst] >= l) continue;
            k = worst;
          }
          bx[k] = x; by[k] = y; bl[k] = l; bc[k] = c;
        }
      this.n = n;

      for (k = 0; k < n; k++) {
        var sx = bx[k], sy = by[k], hue = bc[k];
        var s = clamp((bl[k] - TH) / 70, 0.30, 1);

        // ---- halo: gain on the ring around the source. Orthogonal neighbours get the full
        // scatter, diagonals about half, which is what keeps the halo round rather than square.
        var g1 = 1 + halo * s, g2 = 1 + halo * s * 0.45;
        gain(f, sx - 1, sy, g1); gain(f, sx + 1, sy, g1);
        gain(f, sx, sy - 1, g1); gain(f, sx, sy + 1, g1);
        gain(f, sx - 1, sy - 1, g2); gain(f, sx + 1, sy - 1, g2);
        gain(f, sx - 1, sy + 1, g2); gain(f, sx + 1, sy + 1, g2);

        // ---- streak: horizontal only, and longer on the side the world is sliding towards.
        for (var side = -1; side <= 1; side += 2) {
          var len = reach * s * (side * pan > 0 ? 1.45 : 0.75);
          var L = len | 0;
          for (var j = 1; j <= L; j++) {
            x = sx + side * j;
            if (x < 0 || x >= cols) break;
            i = sy * cols + x;
            var a = (1 - j / (len + 0.6));
            a *= a;
            var lum = bl[k] * a * 0.30;
            if (lum < 6) break;
            // Only into cells that have nothing brighter to say. A flare that overwrites the
            // glyph next to it eats the sign it came from.
            if (f.ch[i] !== 0 && f.lum[i] > lum) continue;
            var d = nearer(f.dist[i]);
            if (d < 0) continue;
            put(f, x, sy, j < 2 ? G_DASH : G_TICK, hue, lum, d, 3);
          }
        }
      }
    }
  };

  /* =====================================================================================
   * 8. The display, and the eye in front of it — scanlines and exposure in one walk.
   *
   * THE SCANLINES are two terms. A fixed every-other-row dip, which is the display itself and
   * never moves, and one very broad bar rolling once every ~25 seconds at a third of that depth.
   * The bar is the part that is easy to overdo: at 2.6% it is invisible as an object and only
   * registers as the frame being faintly alive.
   *
   * WHY THE TWO ARE ONE PASS. The scanline factor is per-ROW and the exposure factor is per-FRAME,
   * so their product is per-row too, and nothing in the build draws between layer 96 and layer 98.
   * Kept apart they walked the whole frame twice and read-modify-wrote every cell twice to apply
   * one number per row. Multiplied together first, the row factor is computed once for the row and
   * the frame is touched once. ANYONE ADDING AN ELEMENT AT LAYER 97 has to split them again, which
   * is the one thing this fusion assumes.
   *
   * The exposure measurement now happens BEFORE the scanline dip is applied rather than after it,
   * which is the only behavioural difference and it cancels: the adaptation below is a RATIO of two
   * lagged copies of that measurement, so a near-constant ~1.5% scale on both terms divides out.
   *
   * THE BREATHE is unchanged in shape: two incommensurate sines so the loop never closes audibly.
   * It is the one effect meant to be felt and never seen, and its amplitude is down a third to
   * make room for the term below without the two of them ever summing past the +-4.6% the frame
   * was built to tolerate.
   *
   * THE ADAPTATION is new and it is a response, not an oscillation. It measures the frame's own
   * energy and keeps two lagged copies of it: a FAST one, which is roughly the retina, and a SLOW
   * one, which is the adapted state the retina is being compared against. The printed gain is the
   * ratio of the two. Stand still and they converge, the ratio is 1 and the pass does nothing at
   * all. Walk out of a dark block into a lit parade and the fast term jumps while the slow one is
   * still in the dark, so the frame is pulled DOWN for a second or two and then released as the
   * eye catches up — which is what walking into a bright street actually feels like. Walking into
   * the dark does the same in reverse, and more slowly, because dark adaptation is slower than
   * light adaptation in the eye as well.
   *
   * WHY IT CANNOT PUMP. The fast term's time constant is half a second, which is four times the
   * length of the longest lightning stroke in weather.js, so the biggest transient this city can
   * produce moves it by a few percent. The exponent is a fractional power, so even a doubling of
   * scene energy asks for well under a stop. And the whole thing is clamped: nothing this pass
   * does can move the frame by more than the CLAMP below, ever.
   *
   * WHERE IT IS MEASURED. In draw(), because that is the only place the frame exists — and then
   * integrated in update(), on the fixed tick, so the adaptation takes the same time in seconds
   * whatever the panel is doing. That is one tick of lag on a quantity whose own time constant is
   * half a second. The very first draw seeds BOTH filters from the same measurement, so the frame
   * the viewer opens on is the fully-adapted one and the piece never fades up out of a start-up
   * transient; everything after it is history.
   *
   * KNOWN-BUG NOTE. This element is not the source of the reduced-motion breathing report. Before
   * this rewrite it returned on its first line under CC.reducedMotion and contributed nothing at
   * all; measured over 5 s of wall clock at three seeds, the frame's mean-luminance sigma was
   * 20.7%/21.4%/8.9% in normal motion against 6.1%/1.7%/2.9% under reduced motion, i.e. the frame
   * already breathed far LESS with reduced motion on. It still does: the sines stay off there and
   * the adaptation, which is a stabiliser, is the only term left.
   *
   * HOW TO MEASURE THIS PASS, because the obvious way reports zero and a review has already been
   * misled by it. The measurement this element integrates can only be taken in draw(), so a
   * harness that replays update() and calls draw() once leaves this.meas at -1 for the entire
   * replay, update() returning on its first line and `adapt` pinned at exactly 1. That is what
   * tools/headless.cjs used to do, and it is why every palette share and every luminance
   * histogram this project published before the harness was fixed was taken with this pass
   * switched off; the fix was to draw every tick, not to touch anything here, because measuring
   * in draw and integrating on the fixed tick is what main.js actually does. A still-frame census
   * run the old way measures the breathe alone: mean |dV| 1.0-1.9 over the canonical sweep,
   * nothing moving by 10, which reads as a pass that does nothing. Replayed the way main.js runs
   * it, `adapt` sits between 0.93 and 1.10 at 400x100 and swings 6.9%/8.7%/15.1% over four
   * seconds on seeds 42/3/99, reaching its clamp. At seed 42 frame 3180 that is the whole frame's
   * printed mean moving 2.9% with no single cell moving by 10, which is exactly the signature of
   * an exposure change and exactly what a per-cell threshold cannot see: you cannot detect a fade
   * by asking whether any one cell jumped.
   *
   * AND WHAT THAT COSTS THE READER OF A SINGLE OFFLINE FRAME. `adapt` is a full-frame multiplier
   * with a history, so the frame at (seed, tick) now carries whatever gain the walk up to that
   * tick earned — near 1.00 on a steady block, down at the 0.88 clamp a second after stepping out
   * into a lit parade. Two frames of the same seed a few hundred ticks apart are no longer at the
   * same exposure, and a threshold census (black%, hot%) will move by more than the geometry did.
   * That is the honest picture and not a defect, but anything fitting a curve to a single frame
   * has to know it is fitting to that frame's adaptation as well.
   * ===================================================================================== */
  var exposure = {
    name: 'exposure',
    layer: 96,          // truly last: this is the gain on everything above it, scanlines included

    /* Three rng draws in this order because that is what the two elements this one replaces took
     * between them — scanlines' phase at layer 96, then the two breathe phases at layer 98. One
     * shared stream feeds every element, so changing the count or the order here re-rolls nothing
     * in this file (it is last) but would still move the reference frames off the browser's. */
    init: function (city, rng) {
      this.phase = rng();
      this.p0 = rng() * 6.2831853;
      this.p1 = rng() * 6.2831853;
      this.rows = 0;
      this.g = null;      // per-row multiplier: scanline dip x this frame's exposure
      this.meas = -1;     // scene energy, written by draw() and read by update()
      this.fast = -1; this.slow = -1;
      this.adapt = 1;     // the gain update() has settled on; draw() only reads it
    },

    update: function (dt) {
      if (this.meas < 0) return;         // no frame has been measured yet
      var d = dt > 0.25 ? 0.25 : dt;
      this.fast += (this.meas - this.fast) * (1 - Math.exp(-d / 0.5));
      /* Light adaptation in about two and a half seconds, dark adaptation in five. Both are far
       * slower than anything in the frame moves, which is the whole defence against pumping. */
      var tau = this.meas > this.slow ? 2.5 : 5.0;
      this.slow += (this.fast - this.slow) * (1 - Math.exp(-d / tau));
      var f = this.fast, s = this.slow;
      if (!(f > 0.01) || !(s > 0.01)) { this.adapt = 1; return; }
      /* Thick air is a low-contrast world with nothing much to adapt to, and a viewer in mist who
       * walks past a lit window should not have the whole street dip. k is 0.34 at rel=1. */
      var k = clamp(0.34 - 0.09 * (airDensity() - 1), 0.16, 0.44);
      if (CC.reducedMotion) k *= 0.5;
      var e = Math.pow(s / f, k);
      var lo = CC.reducedMotion ? 0.94 : 0.88, hi = CC.reducedMotion ? 1.05 : 1.11;
      this.adapt = e < lo ? lo : (e > hi ? hi : e);
    },

    draw: function (f, cam, t) {
      /* The measurement is deliberately over EVERY cell, not over the lit ones: the share of the
       * frame that is black is exactly what changes when you walk into a bright block, and a mean
       * taken over lit cells only would report the same number for a dark street with one sign in
       * it as for a street that is all sign. This is also the whole of the "place" term — where
       * you are standing is not a coordinate, it is how much light is arriving. */
      var n = f.n, lum = f.lum, ch = f.ch, sum = 0, i;
      for (i = 0; i < n; i++) if (ch[i] !== 0) sum += lum[i];
      this.meas = sum / n;
      if (this.fast < 0) { this.fast = this.meas; this.slow = this.meas; }

      var e = this.adapt;
      // The free-running breathe, which reduced motion switches off exactly as it always did.
      if (!CC.reducedMotion)
        e *= 1 + 0.020 * Math.sin(t * 0.61 + this.p0) + 0.011 * Math.sin(t * 0.233 + this.p1);

      var cols = f.cols, rows = f.rows, x, y;
      if (this.rows !== rows) { this.rows = rows; this.g = new Float32Array(rows); }
      var g = this.g;
      // Frozen roll under reduced motion; the static line texture stays, because it does not move.
      var ph = CC.reducedMotion ? this.phase : this.phase + t * 0.040;
      /* The whole modulation for a row, resolved before a single cell is touched: the display's
       * every-other-row dip, the slow bar, and the eye's gain on top of all of it. */
      for (y = 0; y < rows; y++) {
        var bar = 0.5 + 0.5 * Math.cos((y / rows * 1.6 - ph) * 6.2831853);
        g[y] = (1 - 0.070 * (y & 1)) * (1 - 0.026 * bar) * e;
      }
      for (y = 0; y < rows; y++) {
        var gy = g[y];
        if (gy > 0.9975 && gy < 1.0025) continue;   // this row is already what it should be
        for (x = 0; x < cols; x++) gain(f, x, y, gy);
      }
    }
  };

  var LIST = [shaft, wash, mistfar, vignette, beads, lensbloom, exposure];
  for (var q = 0; q < LIST.length; q++) CC.ELEMENTS.push(LIST[q]);
  if (typeof module !== 'undefined') module.exports = LIST;
})(typeof CC !== 'undefined' ? CC : require('../core.js'));
