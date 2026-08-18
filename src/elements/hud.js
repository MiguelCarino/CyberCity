/* CyberCity hint overlay — the only text in the piece, and it is made of city.
 *
 * WHY IT IS AN ELEMENT AND NOT A DIV. A caption in HTML would sit on a sheet of glass in front of
 * the artwork: no fog, no bloom, no scanline, no vignette, wrong colour space, wrong font, and
 * crisp in a frame where nothing else is. Drawn through CC.put at layer 90 it is instead IN the
 * picture — optics.js vignettes it in the corner, the scanline rolls over it, the exposure breathe
 * lifts it with everything else, and CC.tone prints it through the same curve as a streetlight. It
 * reads as a readout stencilled on the inside of a visor, which is the only kind of UI a piece
 * like this can have.
 *
 * THE FONT IS THE WHOLE PROBLEM. CC.GLYPHS is 49 characters chosen for TEXTURE — the letters in it
 * are the ones that make good façade noise (A H K M N O Q U V W X Y Z) and no others. There is no
 * S, no D, no E, no R, no T, no I, no L. So not one of the six weather names is spellable, "MOVE"
 * is not spellable, and neither is any key label worth printing; and core.js is not this file's to
 * extend. The way out is that a glyph does not have to BE the letter — it can be a pixel of one.
 * Every character below is a 3x5 bitmap stamped one CC.GLYPHS cell per lit pixel, which is exactly
 * how the blade signs on the buildings are already made, one row up in the same frame. It costs
 * four columns per character, which is why every string here is terse to the point of rudeness and
 * why the whole overlay disappears rather than wrap on a grid too narrow to hold it.
 *
 * IT IS PURE. The envelope is CC.Control.hintAlpha(t), a stamped function of the simulation clock
 * rather than an accumulator, so tools/headless.cjs renders the overlay at frame 30 exactly as the
 * browser draws it at frame 30 and the thing can be tuned by looking at it offline like everything
 * else. The only impurity is H, which restamps the envelope — the same deal weather_state.js makes
 * for its preset keys.
 */
(function (CC) {
  'use strict';

  var GH = CC.g('@');          // one lit pixel of a letter. Compared side by side against '#' and
                             // '8' at this size: '#' is a lattice with more hole than ink and the
                             // letterforms fell apart into texture, '8' reads as two stacked
                             // bowls, and '@' is the only glyph in the table that fills its cell
                             // as a single mass. At 3x5 the eye is reading mass, not shape.
  var SLATE = CC.P.slate, WHITE = CC.P.white;

  /* In front of everything. The raycaster's nearest façade is metres away and every element is
   * further, so any depth below the near plane wins the test in CC.put; these are small enough to
   * be unambiguous and non-zero so nothing can tie with them.
   *
   * TWO depths, and the gap between them is what makes the overlay readable at all. The bottom of
   * the frame is the brightest and busiest part of the picture — it is near pavement, painted in
   * white '8' at high lum — and the first version of this file put dim slate letters straight on
   * top of it, where they were simply invisible: every glyph was present in the buffer and the
   * eye could not find a single one of them. So each character first BLANKS its own box (see
   * plate()) and then draws into it. The blanks go at PLATE_D and the letters at the nearer
   * HUD_D, which means a blank can never erase a letter that has already been drawn — CC.put's
   * own depth test refuses it — and the clearing can therefore be interleaved with the drawing in
   * one pass rather than needing a separate one over the whole line. A blank is a real write: the
   * cell becomes glyph 0 at lum 0, which CC.tone and the canvas both skip. */
  var HUD_D = 0.02, PLATE_D = 0.03;

  /* ---- the 3x5 face ---------------------------------------------------------------------------
   * Packed to one int per character, five rows of three bits, row 0 at the top and bit 2 of each
   * row at the left. FONT is indexed by charCode-32 and read with charCodeAt, which returns a
   * number — charAt would allocate a one-character string per letter per frame, and this runs
   * inside draw(). Everything not defined here is a blank, which is also what a space is. */
  var FONT = new Int32Array(96);

  function face(ch, r0, r1, r2, r3, r4) {
    var rows = [r0, r1, r2, r3, r4], bits = 0;
    for (var r = 0; r < 5; r++)
      for (var c = 0; c < 3; c++)
        if (rows[r].charAt(c) === '#') bits |= 1 << (r * 3 + (2 - c));
    FONT[ch.charCodeAt(0) - 32] = bits;
  }

  face('A', '.#.', '#.#', '###', '#.#', '#.#');
  face('B', '##.', '#.#', '##.', '#.#', '##.');
  face('C', '.##', '#..', '#..', '#..', '.##');
  face('D', '##.', '#.#', '#.#', '#.#', '##.');
  face('E', '###', '#..', '##.', '#..', '###');
  face('F', '###', '#..', '##.', '#..', '#..');
  face('G', '.##', '#..', '#.#', '#.#', '.##');
  face('H', '#.#', '#.#', '###', '#.#', '#.#');
  face('I', '###', '.#.', '.#.', '.#.', '###');
  face('J', '..#', '..#', '..#', '#.#', '.#.');
  face('K', '#.#', '#.#', '##.', '#.#', '#.#');
  face('L', '#..', '#..', '#..', '#..', '###');
  /* M and N differ by one row and nothing else — three columns is not enough width for the real
   * distinction, so M gets the doubled middle and N a single one. In the words this file prints
   * (MOVE, MANUAL, RAIN, N CITY) context settles it long before the letterform has to. */
  face('M', '#.#', '###', '###', '#.#', '#.#');
  face('N', '#.#', '###', '#.#', '#.#', '#.#');
  face('O', '.#.', '#.#', '#.#', '#.#', '.#.');
  face('P', '##.', '#.#', '##.', '#..', '#..');
  face('Q', '.#.', '#.#', '#.#', '##.', '.##');
  face('R', '##.', '#.#', '##.', '#.#', '#.#');
  face('S', '.##', '#..', '.#.', '..#', '##.');
  face('T', '###', '.#.', '.#.', '.#.', '.#.');
  face('U', '#.#', '#.#', '#.#', '#.#', '###');
  face('V', '#.#', '#.#', '#.#', '.#.', '.#.');
  face('W', '#.#', '#.#', '###', '###', '#.#');
  face('X', '#.#', '#.#', '.#.', '#.#', '#.#');
  face('Y', '#.#', '#.#', '.#.', '.#.', '.#.');
  face('Z', '###', '..#', '.#.', '#..', '###');
  face('0', '###', '#.#', '#.#', '#.#', '###');
  face('1', '.#.', '##.', '.#.', '.#.', '###');
  face('2', '##.', '..#', '.#.', '#..', '###');
  face('3', '##.', '..#', '.#.', '..#', '##.');
  face('4', '#.#', '#.#', '###', '..#', '..#');
  face('5', '###', '#..', '##.', '..#', '##.');
  face('6', '.##', '#..', '##.', '#.#', '.#.');
  face('7', '###', '..#', '.#.', '.#.', '.#.');
  face('8', '.#.', '#.#', '.#.', '#.#', '.#.');
  face('9', '.#.', '#.#', '.##', '..#', '##.');
  face('-', '...', '...', '###', '...', '...');
  face('/', '..#', '..#', '.#.', '#..', '#..');
  face('.', '...', '...', '...', '...', '.#.');

  var CW = 4;                  // 3 columns of letter and one of air. Anything less and two capitals
                               // in a row merge into a single blot at this cell aspect.
  var LH = 5, LGAP = 1;        // line box and the row between lines

  function textW(s) { return s.length * CW - 1; }

  /* The dark a single character stands on: its 3x5 box plus a ring of one, laid down cell by cell
   * as the line is walked so the field of black ends exactly where the writing does. The first
   * attempt spared the SPACES between words, on the theory that letting the street show through
   * them would keep the overlay from being a panel — and what came through the gap between MOVE
   * and SHIFT was a bar of white pavement at full brightness, which the eye read as part of the
   * word. So the spaces are blanked too, and the shape of the dark is the shape of the line.
   *
   * It DISSOLVES rather than switching. A blank is binary — the cell is cleared or it is
   * not — so a plate that simply appeared put a hard black box on the pavement a full second
   * before the lettering inside it was bright enough to see, and the fade-out ended with an empty
   * black box sitting there after the last letter had gone. Thresholding each cell against a
   * fixed per-cell hash turns that switch into a stipple that eats in and lets go again, which
   * costs nothing and reads as a panel warming up. The seed is small and constant on purpose:
   * CC.hash2 multiplies its seed in floating point, so a large one loses its low bits and the
   * dither collapses into stripes. */
  var PSEED = 1471;

  function plate(f, x, y, a) {
    for (var r = -1; r <= LH; r++)
      for (var c = -1; c <= CW - 1; c++)
        if (a > 0.995 || CC.hash2(x + c, y + r, PSEED) < a)
          CC.put(f, x + c, y + r, 0, 0, 0, PLATE_D);
  }

  function text(f, s, x, y, ci, lum, a) {
    for (var i = 0; i < s.length; i++) {
      var code = s.charCodeAt(i) - 32;
      plate(f, x, y, a);              // before the letter, and for spaces too — see plate()
      if (code > 0 && code < 96) {
        var bits = FONT[code];
        if (bits) {
          for (var r = 0; r < LH; r++) {
            var row = (bits >> (r * 3)) & 7;
            if (!row) continue;
            if (row & 4) CC.put(f, x, y + r, GH, ci, lum, HUD_D);
            if (row & 2) CC.put(f, x + 1, y + r, GH, ci, lum, HUD_D);
            if (row & 1) CC.put(f, x + 2, y + r, GH, ci, lum, HUD_D);
          }
        }
      }
      x += CW;
    }
    return x;
  }

  /* ---- what it says ---------------------------------------------------------------------------
   * Three widths of the same list, not a truncation of one: dropping words off the end of a line
   * leaves whichever hint happens to be last looking like a typo, whereas these are each a
   * complete thought at their size. The widest is chosen that FITS, measured, not assumed — a tier
   * table with the arithmetic done by hand is a tier table that is wrong the first time a string
   * is edited. */
  var TIERS = [
    ['WASD MOVE',                        'DRAG LOOK'],
    ['WASD MOVE  SHIFT RUN',             'DRAG LOOK  1-3 WORLD  T TIME'],
    ['WASD MOVE  SHIFT RUN  C CROUCH',   'DRAG LOOK  1-3 WORLD  T TIME  Y HOLD  N SEED']
  ];

  /* THE SAME LIST FOR A DEVICE WITH NO KEYS ON IT. Every string above names a key — WASD, SHIFT,
   * C, 1-6, N, P — and a phone has none of them; printing 'WASD MOVE' on a touchscreen is only
   * marginally better than printing nothing, and it is the one device whose controls are
   * genuinely invisible (control.js gives touch a screen-split virtual stick that is centred
   * wherever the thumb lands and draws nothing at all). So touch gets its own vocabulary, made of
   * gestures and of the two halves of the screen. There is no third fact to tell a thumb: the
   * weather presets, the reseed and photo mode are keyboard-only, which is why the wider touch
   * tiers elaborate the same two halves rather than inventing controls that do not exist. */
  var TOUCH = [
    ['LEFT WALK',                        'RIGHT LOOK'],
    ['LEFT WALK  PUSH FAR RUNS',         'RIGHT LOOK  TAP FULLSCREEN'],
    ['LEFT HALF WALKS  PUSH FAR RUNS',   'RIGHT HALF LOOKS  TAP FULLSCREEN']
  ];

  var MARGIN_X = 3, MARGIN_Y = 2;
  /* Below this the overlay is not shortened, it is ABANDONED — but the number used to be 70, and
   * 70 is a width no phone in portrait ever reaches: main.js pins the cell to 6.4 CSS px under
   * 560 px of viewport and clamps dpr to 2, so a 390 px phone renders 60 columns and a 455 px one
   * is the break-even. The hint was therefore hidden on exactly the devices that need it most.
   * 48 is main.js's own MINC, i.e. the narrowest grid the piece can be rendered at, and at 48 the
   * shortest line is 35 columns of a 42-column writing area: a note in the corner of a small
   * frame is still a note. */
  var MIN_COLS = 48;
  /* And no line may take more than this share of the width even where it technically fits. The
   * fit test on its own picked the longest tier at 200 columns, where its 139 characters ran
   * seven tenths of the way across the frame and the hint stopped being a note in the corner —
   * the measured black went with it, 3.4 points of the picture blanked out to hold the text.
   *
   * THE SHORTEST TIER IS EXEMPT, and that exemption is the other half of the phone fix: at 60
   * columns 0.55 of the width is 33 and the shortest line is 35, so the share test — not
   * MIN_COLS — was what silenced the overlay on every handset. The rule exists to stop a LONG
   * line from crossing the picture; it has no business vetoing the one line that is the whole
   * hint, because the alternative to a wide note on a narrow frame is no note at all. */
  var MAX_SHARE = 0.55;
  /* Lines are six rows each and the grid can be as short as 22, so how many the overlay is
   * allowed is a question about the SHORT dimension, not about how much there is to say. Three
   * lines under 64 rows is a caption with a city behind it; one line is the weather and who is
   * driving, which is the part that is still worth having at any size. */
  var ROWS_3 = 64, ROWS_2 = 40;

  var LUM_KEYS = 58;           // slate is printed at EXPOSURE 2.00, the loudest weight in the
                               // table, so its raw lum has to sit far lower than white's to land
                               // at the same place on the page
  var LUM_STAT = 92;           // white, EXPOSURE 1.15 — the status line is the one datum a viewer
                               // is meant to be able to read at a glance

  var hud = {
    name: 'hud',
    layer: 90,

    /* No rng draw of any kind, and that is load-bearing rather than incidental: every element
     * pulls from ONE shared stream in init order, so a single rng() here would shift the noise of
     * everything that initialises after layer 90 — the whole of optics.js — and silently change
     * every reference frame in the project. */
    init: function () {
      /* Uppercased once. CC.Weather.P.name is lower case and toUpperCase() in draw() would
       * allocate a string sixty times a second. */
      this.wnames = [];
      /* Read through the getter, so a world whose table is one row long (the Moon's `vacuum`) caches
       * one name rather than the previous world's six. */
      var pr = CC.Weather ? CC.Weather.PRESETS : null;
      if (pr) for (var i = 0; i < pr.length; i++) this.wnames.push(pr[i].name.toUpperCase());
      // Pre-split so the speed readout is a table lookup rather than a concatenation.
      this.dig = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
      this.spd = 0;
    },

    update: function (dt, t, cam) {
      /* The printed speed is smoothed hard. It is a one-digit readout, so an unsmoothed value
       * sitting on a boundary flickers between 2 and 3 for as long as somebody walks in a straight
       * line, and a number that will not hold still is the most distracting thing on a screen. */
      var s = CC.Control ? CC.Control.speed : 0;
      this.spd += (s - this.spd) * Math.min(1, dt * 2.2);
    },

    draw: function (f, cam, t) {
      if (!CC.Control || !CC.Control.hintAlpha) return;
      var a = CC.Control.hintAlpha(t);
      if (a <= 0.01) return;
      var cols = f.cols, rows = f.rows;
      if (cols < MIN_COLS) return;

      /* Two widths, not one. `room` is the writing area between the margins and is what the
       * shortest tier is measured against; `avail` is the same thing capped at MAX_SHARE and is
       * what every tier above it must fit inside. See MAX_SHARE for why the short one is exempt. */
      var room = cols - MARGIN_X * 2;
      var avail = cols * MAX_SHARE;
      if (room < avail) avail = room;
      /* A phone is not a keyboard with a small screen — see TOUCH. Control.touch is set by the
       * first touch pointerdown and is 0 everywhere there is no DOM, so the offline reference
       * frame is untouched by this line. */
      var set = (CC.Control.touch ? TOUCH : TIERS);
      var tier = 0;
      for (var i = set.length - 1; i > 0; i--) {
        if (textW(set[i][0]) <= avail && textW(set[i][1]) <= avail) { tier = i; break; }
      }
      /* Cannot even spell the short one inside the margins: say nothing. BOTH of its lines are
       * measured, not just the first — a tall grid prints them both, and a rule that only checked
       * the movement line would let the look line run off the right-hand edge the first time
       * somebody edits it. */
      if (textW(set[0][0]) > room || textW(set[0][1]) > room) return;

      var lines = rows >= ROWS_3 ? 3 : rows >= ROWS_2 ? 2 : 1;

      var mode = CC.Control.mode || CC.Control.blend > 0.02;
      var paused = !!CC.Control.paused;

      var y = rows - MARGIN_Y - LH;                // the status line, along the bottom
      var kl = (LUM_KEYS * a) | 0, sl = (LUM_STAT * a) | 0;
      if (sl < 1) return;                          // wholly faded; nothing would print anyway

      // ---- status: what the sky is doing, and who is driving --------------------------------
      var x = MARGIN_X;
      if (paused) x = text(f, 'PAUSED', x, y, WHITE, sl, a) + CW;
      else if (mode) {
        x = text(f, 'MANUAL', x, y, WHITE, sl, a) + CW;
        /* The speed only appears where there is room for it. On the narrow tier those four extra
         * characters are the difference between a status line and a status line and a half. */
        if (tier > 0) {
          // One digit, so it is clamped rather than allowed to index off the end of the table.
          var d = Math.round(this.spd);
          if (!(d > 0)) d = 0; else if (d > 9) d = 9;
          x = text(f, this.dig[d], x, y, SLATE, kl, a);
          x = text(f, 'M/S', x, y, SLATE, kl, a) + CW;
        }
      }
      /* WHICH WORLD, ahead of what the sky is doing, and only when the frame is wide enough to
       * carry both.
       *
       * WHAT IT COSTS THE CITY'S REFERENCE FRAMES, written down rather than discovered later, and
       * re-measured now that a third world and a clock have been added to the same line.
       *
       * THIS FILE IS THE ONLY THING IN EITHER PASS THAT MOVES A NIGHT FRAME THE CITY ALREADY HAD.
       * The mechanism is indirect and worth stating because it is not obvious: the overlay is drawn
       * for the eight seconds it is up, optics.js's exposure pass integrates the whole frame's
       * luminance over those frames, and a different number of lit cells in the corner lands the
       * adaptation gain a fraction of a percent elsewhere — which then multiplies every cell in the
       * frame, forever after.
       *
       * Measured at seed 42, 200x60, frame 600: with the two-world hint strings, 15 cells of 12000
       * differed by 1 lum. With the three-world strings plus the clock readout, 331 cells differ,
       * the largest by 8 lum. Reverting ONLY the hint strings takes it back to byte-identical, so
       * the whole of it is the help text being correct rather than any change to what the city
       * draws — every other file in both passes was checked against the same fixture and came back
       * byte-identical. It is the price of the overlay saying true things, and it is worth paying. It is first because it is the larger fact and because it is the one a viewer
       * who has just pressed a digit is looking for confirmation of; it is conditional because on
       * a 48-column grid the status line has room for one word and that word is the weather, which
       * changes on its own and therefore has something to say every time you look at it.
       *
       * Read off CC.World rather than off the city, unlike everything else in the build: this is a
       * readout of what the VIEWER chose, and between the keypress and the rebuild those differ by
       * one frame. Naming the old world in that frame is the one wrong answer available here. */
      if (tier > 0 && CC.World && CC.World.name) {
        var wn = CC.World.name;
        if (x + textW(wn) + CW + 44 <= cols - MARGIN_X) x = text(f, wn, x, y, SLATE, kl, a) + CW;
      }
      /* THE HOUR, between the world and the weather, and only on the widest tier. The status line
       * is read left to right as "where, when, what" — CYBERCITY NOON RAIN — which is the order a
       * viewer who has just pressed a key wants the confirmation in. A frozen clock is marked with
       * a leading dash rather than a word: Y is a hold, and a hold is best shown as the readout
       * having stopped rather than as a second thing to read. */
      if (tier > 1 && CC.Daylight) {
        var dn = CC.Daylight.P.name.toUpperCase();
        if (CC.Daylight.P.frozen) dn = '-' + dn;
        if (x + textW(dn) + CW + 24 <= cols - MARGIN_X) x = text(f, dn, x, y, SLATE, kl, a) + CW;
      }
      var w = CC.Weather ? CC.Weather.P.name : '';
      for (var wi = 0; wi < this.wnames.length; wi++) {
        if (CC.Weather.PRESETS[wi].name === w) {
          /* Right off the end is not a wrap, it is a mess, so a status line that has run out of
           * room simply loses the weather rather than printing half of it. */
          if (x + textW(this.wnames[wi]) <= cols - MARGIN_X)
            text(f, this.wnames[wi], x, y, WHITE, sl, a);
          break;
        }
      }

      // ---- the key list, stacked upwards from the status line ---------------------------------
      if (lines > 1) {
        y -= LH + LGAP;
        /* With room for only one of the two, it is the movement line. A viewer who has worked out
         * that the city is walkable will find the look control by dragging within seconds; a
         * viewer who has not never drags at all. */
        text(f, set[tier][lines > 2 ? 1 : 0], MARGIN_X, y, SLATE, kl, a);
      }
      if (lines > 2) {
        y -= LH + LGAP;
        text(f, set[tier][0], MARGIN_X, y, SLATE, kl, a);
      }
    }
  };

  CC.ELEMENTS.push(hud);
  if (typeof module !== 'undefined') module.exports = hud;
})(typeof CC !== 'undefined' ? CC : require('../core.js'));
