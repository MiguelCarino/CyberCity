/* CyberCity police — a patrol car at the kerb with its bar running, a cruiser crossing the
 * junction ahead, and two or three officers on foot. Layer 25.
 *
 * DESIGN NOTE. Everything here obeys the same subtractive rule the rest of the pavement obeys: a
 * car and an officer are BLACK CUT-OUTS stamped at their true depth, and the only lit cells on
 * them are edges — a roofline, a cap brim, a hi-vis band — plus the one genuinely emissive thing
 * in the file, the lightbar. The bar's WASH on the road beside the car is worth more than the bar
 * itself, because it is the part that says "there is something happening here", and it is also
 * where every photosensitivity risk in this file lives, since it is the only part of it with area.
 *
 * WHAT THIS OBJECT IS AT EACH RANGE, because the first cut tried to be a car at every range and
 * was a grey rumour at most of them. Past 26 m it is a BAR OF LIGHTS on a black shape and nothing
 * else: no roofline, no wash, no officers. Inside 26 m the roofline appears, the pool of light on
 * the road appears and the car is standing in something, and an officer beside it has a rim bright
 * enough to be a silhouette instead of a smudge. All three gates are the same measurement — the
 * range past which fog takes that mark under v 120 IN THE FINISHED FRAME, i.e. after the exposure
 * pass, and into the muddy band this build is closest to overspending — so they are one number
 * rather than three. Every one of them replaced a mark that was being drawn, was costing budget,
 * and could not be seen. The house rule is bright and sparse or honestly black; 26 m is where this
 * object can be bright.
 *
 * THE ONE SAFETY IDEA, and it is the reason this file can carry a strobe at all: RED AND AZURE
 * ALTERNATE, they do not blink. The red half's envelope is e and the azure half's is 1-e, so the
 * bar's TOTAL emitted light is very nearly constant and the wash cells are laid down in an
 * alternating object-space pattern so that half of them rise while the other half fall. What
 * pulses is which colour is where, not how much light the frame is receiving. A bar that simply
 * flashed on and off would put the same energy through the frame's mean luminance at 2.2 Hz, and
 * that is the artifact the rules in CONTRACT.md exist to forbid.
 *
 * The second safety idea is that every envelope in this file is built in 0..1 and THEN scaled —
 * lum = PEAK * fade * (FLOOR + (1 - FLOOR) * e). The floor is folded into the envelope before the
 * multiply, never subtracted from an already-scaled intensity, which is the exact mistake that
 * shipped in this repo's lightning and stepped 36.6% of peak in one 16 ms frame.
 */
(function (CC) {
  'use strict';

  var P = CC.P, g = CC.g, hash2 = CC.hash2, put = CC.put;

  /* Resolved once — g() is a string lookup and these are hit a few hundred times a frame. */
  /* G_DOT ('.') was resolved here and is gone with the three marks that used it — the headlamp's
   * third smear cell, the officer's second ice glint and the officer's road reflection. All three
   * were specks in the muddy band, which is the least visible combination this glyph set has. */
  var G_QUOTE = g("'"), G_DASH = g('-'), G_EQ = g('='),
      G_8 = g('8'), G_o = g('o'), G_0 = g('0');

  /* The 'rain' preset, which is what every constant below was tuned under — same fallback block
   * street.js carries, and for the same reason: a harness that never loaded the director must
   * render the frame the director's reference preset would have produced. */
  var W_STILL = { rain: 0.65, wind: 0.55, fog: 0.30, wet: 0.90, storm: 0.12, haze: 0.40,
                  cloud: 0.75, steam: 0.85 };
  function wp() { return CC.Weather ? CC.Weather.P : W_STILL; }
  function wrel(k) { return CC.Weather ? CC.Weather.rel(k) : 1; }

  /* ---- camera basis ---------------------------------------------------------------------------
   * Copied from street.js rather than imported: those helpers are module-private there, the house
   * rules say to copy the pattern, and the projection has to match the caster EXACTLY or a car
   * parks half a metre inside the kerb it is meant to be against. Planar camera: `w` is the
   * forward-axis distance and the radial distance the depth test wants is w*sqrt(1+sp*sp). */
  var CX = 0, CZ = 0, FWX = 0, FWZ = 1, RGX = 1, RGZ = 0, HP = 0.7, EYE = 1.7;
  var COLS = 0, ROWS = 0, HOR = 0, SCALE = 1, CPM = 1;

  function camBasis(cam) {
    var yaw = cam.yaw || 0;
    FWX = Math.sin(yaw); FWZ = Math.cos(yaw);
    RGX = Math.cos(yaw); RGZ = -Math.sin(yaw);
    CX = cam.x; CZ = cam.z;
    HP = Math.tan((cam.fov || 1.25) * 0.5);
    EYE = cam.eyeY !== undefined ? cam.eyeY : 1.7;
  }
  /* Split out from camScreen because update() is handed a camera and no frame, and the retirement
   * below is written in SCREEN AREA — it has to compute that area the same way the drawing code
   * does or the cull and the draw disagree at exactly the moment it matters. */
  function camScreenAt(cam, cols, rows) {
    camBasis(cam);
    COLS = cols; ROWS = rows;
    HOR = cam.horizon !== undefined ? cam.horizon : ROWS * 0.56;
    SCALE = cam.scaleY !== undefined ? cam.scaleY
          : (COLS * (cam.cellAspect || 0.5625)) / (2 * HP);
    CPM = COLS * 0.5 / HP;               // screen columns per metre of lateral offset, times 1/w
  }
  function camScreen(frame, cam) { camScreenAt(cam, frame.cols, frame.rows); }

  var PJ = { ok: 0, w: 0, sp: 0, x: 0, dist: 0 };
  /* Module scratch. The caller must read what it needs out of PJ before projecting anything else —
   * the car body, which projects two flanks and a centre per slice, is where that matters. */
  function project(px, pz) {
    var dx = px - CX, dz = pz - CZ;
    var w = dx * FWX + dz * FWZ;
    if (w < 0.45) { PJ.ok = 0; return PJ; }
    var sp = (dx * RGX + dz * RGZ) / w;
    PJ.ok = 1; PJ.w = w; PJ.sp = sp;
    PJ.x = (sp / HP + 1) * COLS * 0.5 - 0.5;
    PJ.dist = w * Math.sqrt(1 + sp * sp);
    return PJ;
  }
  function rowOf(y, w) { return HOR - (y - EYE) * SCALE / w; }
  /* Depth of the TARMAC at a screen row. The wash pools on road that is NEARER than the car
   * casting it, so handing put() the car's own distance loses the depth test every time and the
   * whole wash silently never appears — the same trap street.js documents for its stall spill.
   *
   * IT IS THE ROW'S CENTRE, NOT ITS TOP EDGE, and that half cell is the whole of a bug that made
   * this file's road wash unreachable rather than merely dim. The floor pass writes each row at the
   * depth of the row CENTRE, so `row - HOR` came back systematically 4.3% FARTHER than what was
   * already in the cell — measured at seed 4508 frame 1800, row 49: this function returned 13.26
   * where the floor had written 12.72 — and near()'s 0.6% bias cannot close a 4.3% gap. Every
   * single cell of the wash lost the depth test: 36 of 36 attempted puts in that frame, and ZERO
   * surviving wash cells in all five police frames sampled. The pool the lightbar exists to cast
   * had never once appeared on screen. Half a row is also the right answer physically: a row is a
   * band of road and its depth is the depth of its middle. */
  function roadDist(row, sp) {
    var den = row + 0.5 - HOR;
    if (den < 0.5) return 1e6;
    return (EYE * SCALE / den) * Math.sqrt(1 + sp * sp);
  }
  function fg(lum, dist) {
    var S = CC.Surf;
    return S ? S.fog(lum, dist) : lum;
  }
  /* Depth ties LOSE in put(), and a car's wheels stand on tarmac at almost exactly the car's own
   * distance. near() is the body's bias toward the eye; nearer() is for anything printed ON a
   * shape this file has already stamped (a roofline, the bar, a cap brim) or it ties with its own
   * body and is thrown away. */
  function near(d) { return d * 0.994; }
  function nearer(d) { return d * 0.982; }

  /* ---- which corridor the camera is standing in -----------------------------------------------
   * Mirrors raycast.configureFor, exactly as street.js does. Police are laid out in corridor space
   * (along, lateral) and converted to world at spawn, because "at the kerb" is a statement about
   * the corridor and not about x or z. */
  var COR = { axis: 0, ctr: 0, half: 3.5, along: 0, dir: 1 };
  function corridor(city, cam) {
    if (!city || !city.aveX) {
      COR.axis = 0; COR.ctr = 0.5; COR.half = 3.5;
      COR.along = cam.z; COR.dir = FWZ < 0 ? -1 : 1;
      return COR;
    }
    var k = Math.round(cam.x / city.AVE), m = Math.round(cam.z / city.CROSS);
    var aC = 0, aW = 0, cC = 0, cW = 0, bA = 1e18, bC = 1e18, i, c, d;
    for (i = k - 1; i <= k + 1; i++) {
      c = city.aveX(i) + 0.5; d = cam.x - c; if (d < 0) d = -d;
      if (d < bA) { bA = d; aC = c; aW = city.aveW(i) + 0.5; }
    }
    for (i = m - 1; i <= m + 1; i++) {
      c = city.crossZ(i) + 0.5; d = cam.z - c; if (d < 0) d = -d;
      if (d < bC) { bC = d; cC = c; cW = city.crossW(i) + 0.5; }
    }
    var afz = FWZ < 0 ? -FWZ : FWZ, afx = FWX < 0 ? -FWX : FWX;
    if (bC <= cW && (bA > aW || afx > afz)) {
      COR.axis = 1; COR.ctr = cC; COR.half = cW; COR.along = cam.x; COR.dir = FWX < 0 ? -1 : 1;
    } else {
      COR.axis = 0; COR.ctr = aC; COR.half = aW; COR.along = cam.z; COR.dir = FWZ < 0 ? -1 : 1;
    }
    return COR;
  }
  /* Corridor space -> world, for an object that carries its OWN axis and centreline rather than
   * borrowing the live one. A parked car outlives the corner the camera turns, and rebuilding its
   * wall wash off the new corridor would throw the light onto a building on the wrong street. */
  function wX(axis, ctr, a, l) { return axis ? a : ctr + l; }
  function wZ(axis, ctr, a, l) { return axis ? ctr + l : a; }

  /* THE CARRIAGEWAY half-width: the kerb sits CC.PAVE in from the building line. Three files have
   * to agree on this number, so it is read from the shared constant and never written out again —
   * a car parked against a kerb this file invented would sit on the pavement the caster drew. */
  function carriage() {
    var p = COR.half - CC.PAVE;
    if (p < 1.7) p = 1.7;                          // raycast.configureFor's floor, to the centimetre
    if (p > COR.half * 0.86) p = COR.half * 0.86;  // ...and an alley has no kerb to speak of
    return p;
  }

  /* =============================================================================================
   * THE LIGHTBAR ENVELOPE — the one safety-critical function in this file.
   * ============================================================================================ */
  /* 2.2 Hz: the rate at which the bar ALTERNATES, i.e. how often the lit half swaps sides. Each
   * half therefore completes one bright-dark cycle at 1.1 Hz. The house ceiling is 2.6 Hz and the
   * project-wide limit is 3 Hz; a real lightbar runs 2-4 Hz and this sits at the bottom of that
   * band on purpose. DO NOT RAISE IT.
   *
   * THE WAVEFORM IS A PURE COSINE AND THAT IS A MEASUREMENT, NOT A DEFAULT. The first cut shaped
   * it with a smoothstep to buy some dwell at each end, which is what a real bar looks like — and
   * a smoothstep is a nonlinearity, so it manufactures harmonics of the 1.1 Hz fundamental. The
   * third of them lands at 3.30 Hz, inside the 3-20 Hz flash-rate danger band, and it measured
   * 6.25% of full scale against the 2% ceiling tools/flicker-rate.cjs enforces on that band. A
   * pure cosine has NO energy anywhere except at its fundamental, measured 0.000% over 3-20 Hz,
   * and it is also gentler: its steepest slope is pi*f = 3.46 per second, i.e. 5.76% of full scale
   * in one 60 Hz frame, which through the 0.80 span below is a step of 8.01 raw lum, 3.14% of 255,
   * in the brightest cell of the bar, against a 33% ceiling. (It was 4.2% when the peak was 232;
   * lowering the peaks to clear lensbloom lowered this in the same proportion.) A square
   * alternation — which is what a real lightbar actually does — would step 100% and is not
   * available here at any frequency.
   *
   * The pair also sums almost flat. Measured through the print curve rather than in raw lum, which
   * is the number that matters because raw lum is not what the frame receives: the red cell and the
   * azure cell together run v 283 to v 306 over a cycle, a 7.6% swing in the bar's TOTAL output
   * while each half swings the full 0.20-1.00 (red v 98-178, azure v 105-190). That is the whole
   * point of alternating rather than blinking.
   *
   * ALL FOUR OF THOSE FIGURES ARE STILL RE-DERIVED BY HAND, but the file is no longer invisible to
   * the safety tool: 'police' is now on tools/flicker-rate.cjs's NAMES line, so sections 2 and 4
   * render this element for real and measure the largest per-cell luminance step it produces
   * between frames. What that does NOT do is sample barEnv directly — the per-cell step through a
   * fogged, capped, print-curved bar is not the envelope's own waveform — so the 1.1 Hz
   * fundamental, the 0.000% over 3-20 Hz and the 7.6% sum-swing above remain hand-derived. If the
   * bar stays, it still wants a named fixture that lifts this function out and samples it at 60 Hz
   * across phases, the way lightning got one. That change belongs in tools/, which this file does
   * not own. */
  var BAR_ALT_HZ = 2.2;
  var BAR_FLOOR = 0.20;         // the dim half still glows; folded INTO the envelope, see below
  /* THE DIM HALF IS MUDDY FOR PART OF EVERY CYCLE AND THAT IS BOUGHT DELIBERATELY. Counted over the
   * 24-frame fixture the bar prints 64 lit cells, 5 hot and 52 in the muddy band, and the 52 are
   * the half that is on its way down. It cannot be otherwise: a pair that crossfades has to pass
   * through the middle of its range, and the middle of a lamp's range IS the muddy band. The two
   * ways out are both worse. Raising the floor to 0.34 would hold both halves over v 120 and take
   * the printed contrast from 2.4:1 to 1.4:1 — the alternation is the whole read of this object, so
   * that trade buys 0.015 points of muddy with the object itself. Dropping the floor to 0 would
   * make sixteen cells switch off and on at 1.1 Hz, which is a photosensitivity regression traded
   * for a budget win, and this file does not make that trade in either direction. */
  /* THE BAR'S PEAK LUMINANCES, AND WHY THEY ARE BELOW 175 RATHER THAN AS BRIGHT AS THEY LOOK GOOD.
   * elements/optics.js's lensbloom picks its sources at raw lum >= 175 (optics.js:957 `var TH =
   * 175`). The first cut wrote 232 red and 210 azure, so the bar's brightest cells crossed that
   * threshold and fell back under it TWICE PER 1.1 Hz CYCLE — switching a halo and a horizontal
   * streak on and off at 1.1 Hz. Two things made that worse than it sounds: the source strength is
   * floored at clamp((lum-175)/70, 0.30, 1) (optics.js:983), so the halo does not fade in from
   * zero, it SWITCHES ON at 30% strength, a ~10% gain step landing on eight neighbour cells in one
   * frame; and lensbloom keeps only its top 20 sources, so the bar entering and leaving that set
   * evicts and restores OTHER lights' halos at the same rate. 1.1 Hz is well inside the 3 Hz limit
   * so this was never a violation, but it was an unbudgeted flicker source that no measurement in
   * this project covers. elements/skylanes.js:51-54 caps every lamp it writes at raw 174 for
   * exactly this reason; this file now does the same and says so.
   *
   * A CLAMP AT 174 WOULD HAVE BEEN THE WRONG FIX, and it is worth writing down why, because it is
   * the obvious one. Clipping the top off a cosine is a nonlinearity, and the note above is that a
   * nonlinearity manufactures harmonics of the 1.1 Hz fundamental — the third lands at 3.30 Hz,
   * inside the 3-20 Hz danger band that tools/flicker-rate.cjs holds to 2% of full scale. At 22 m
   * a clamp would have been shaving 24% off the peak, which is a great deal of clipping. Lowering
   * the PEAK instead leaves the waveform a pure cosine with no energy anywhere but its fundamental.
   *
   * What it costs: the near bar prints v~160 where it printed v~178, and the far bar goes muddy
   * sooner, which is what pulled the parked car's spawn range in from 36-60 m to 30-48 m and the
   * cruiser's junction from 14-58 m to 14-40 m (see crossAhead). Measured through the curve, red
   * 174 holds v >= 120 out to about 42 m and azure 150 well past 60 m; red is the limiting half. */
  var BAR_PEAK_RED = 174, BAR_PEAK_AZURE = 150;
  var TAU = 6.283185307179586;
  /* Returns 0..1 for the RED half. The azure half takes 1 - this, so the pair sums to 1 and the
   * bar's total output is constant to within the smoothstep's own curvature. */
  function barEnv(t, ph) {
    /* Reduced motion holds the bar at a steady half-lit value and does not strobe at all. A frozen
     * half-lit bar is the correct answer here and a slowed strobe is not: slowing a flash changes
     * what is in the frame instead of calming it, which is the lesson traffic's respawn gap
     * already carries in street.js. */
    if (CC.reducedMotion) return 0.5;
    var u = t * (BAR_ALT_HZ * 0.5) + ph;       // per-HALF cycles; the swap rate is twice this
    return 0.5 - 0.5 * Math.cos(u * TAU);      // and nothing else — see the harmonics note above
  }
  /* THE ONLY WAY AN ENVELOPE IS ALLOWED TO BECOME A LUMINANCE IN THIS FILE. peak and fade scale a
   * quantity that is already in 0..1; nothing is ever subtracted afterwards. */
  function barLum(peak, fade, e) { return peak * fade * (BAR_FLOOR + (1 - BAR_FLOOR) * e); }

  /* =============================================================================================
   * PATROL CARS — one parked slot, one cruiser slot.
   * ============================================================================================ */
  var cars = null, CAR_N = 2, PARKED = 0, CRUISER = 1;

  /* How wide the bar is allowed to print, in COLUMNS. The bar is 1.7 m of roof, so at 20 m it is
   * 12 columns and at 8 m it is 30 — and thirty cells of a lamp at the top of the print curve is a
   * measurable slice of the hot tail from one object. (It was worth 0.2 points when the peaks were
   * 232/210; at the 174/150 they are now, the BAR's hot contribution over the 24-frame fixture is
   * 5 cells — the file's other 32 hot cells are officers' visors — so the cap is now about not
   * letting ONE near car own the tail rather than about the standing cost.) The cap truncates the
   * ENDS of the bar rather
   * than dimming it, because dimming a lamp as it comes closer is backwards and lands the whole
   * strip in the muddy band on the way down. The approach dissolve retires the car not long after
   * the cap starts biting, so the truncation is visible for about two seconds of walking. */
  var BAR_COLS_MAX = 15;
  /* THE APPROACH DISSOLVE, in the same currency the pedestrians retire in: SCREEN AREA. A car at
   * the kerb is a 1.85 x 1.45 m box and the walk passes within about three metres of it, so it
   * ends up covering a quarter of the frame — and a black cut-out cannot be faded down, because it
   * has no brightness to take away. It is faded in COVERAGE instead (structure.js's clipNear does
   * the same for its kerb props): every cell holds a fixed rank on the CAR'S OWN lattice — slice
   * index, quantised fraction across the width, rows down from the roof — and the car drops the
   * cells whose rank is above the fade, so cells leave one at a time over the last four metres
   * instead of the whole slab vanishing on one tick. Keyed on the screen it would boil; keyed on
   * the frame index it would not survive a scrub.
   *
   * 0.020 is ~10 m away and 0.048 is ~6.5 m, so the dissolve runs about 2.5 s at walking pace.
   * The numbers are areas rather than distances for the reason PED_COVER_MAX is: they are correct
   * at every grid size and every fov, and they are also what actually bounds the luminance step. */
  var CAR_FADE_AT = 0.020, CAR_HIDE_AT = 0.048;

  /* Scratch for the bar's two endpoints; hoisted because nothing in the frame path may allocate.
   * BDN is the depth the bar is STAMPED at, and it is the car's nearest roof corner rather than
   * the bar's own centre — see the long note in barEnds. */
  var BX0 = 0, BR0 = 0, BD0 = 0, BX1 = 0, BR1 = 0, BD1 = 0, BDN = 0, BOK = 0;

  /* An intersection CROSS_NEAR..CROSS_FAR ahead, picked by a 0..1 hash — the cruiser crosses one of
   * these, the same way street.js's ordinary traffic does. Counted then re-walked rather than
   * collected, because an element may not allocate.
   *
   * THE FAR END CAME IN FROM 58 TO 40 when the bar's peaks came down to stay out of lensbloom (see
   * BAR_PEAK_RED). Red is the limiting half and red at raw 174 holds v >= 120 out to about 42 m;
   * a cruiser sent across a junction at 55 m arrives as a pair of muddy smudges, which is the one
   * thing this budget cannot afford. Fewer cruisers, all of them legible. */
  var CROSS_NEAR = 14, CROSS_FAR = 40;
  function crossAhead(city, pick) {
    if (!city || !city.aveX) return NaN;
    var period = COR.axis ? city.AVE : city.CROSS;
    var i0 = Math.round(COR.along / period), i, c, dd, cnt = 0, want;
    for (i = i0 - 4; i <= i0 + 4; i++) {
      c = (COR.axis ? city.aveX(i) : city.crossZ(i)) + 0.5;
      dd = (c - COR.along) * COR.dir;
      if (dd >= CROSS_NEAR && dd <= CROSS_FAR) cnt++;
    }
    if (!cnt) return NaN;
    want = (pick * cnt) | 0; if (want >= cnt) want = cnt - 1;
    for (i = i0 - 4; i <= i0 + 4; i++) {
      c = (COR.axis ? city.aveX(i) : city.crossZ(i)) + 0.5;
      dd = (c - COR.along) * COR.dir;
      if (dd >= CROSS_NEAR && dd <= CROSS_FAR) { if (want === 0) return c; want--; }
    }
    return NaN;
  }
  function crossHalf(city, c) {
    if (!city || !city.aveX) return 2.0;
    var period = COR.axis ? city.AVE : city.CROSS;
    var i = Math.round((c - 0.5) / period);
    return (COR.axis ? city.aveW(i) : city.crossW(i)) + 0.5;
  }

  /* The clipped screen area of a car's box, as a fraction of the frame. Clipped deliberately, the
   * way pedCover clips: a car half off the left edge blacks out half as much picture, and it is
   * the picture this budget is about. Returns 1 (retire now) for a box with a corner behind the
   * eye, which is what happens as the walk draws level with a parked car. */
  function carCover(c) {
    var hx = c.hx, hz = c.hz, lx = -hz, lz = hx;
    var hw = c.wid * 0.5, hl = c.len * 0.5;
    var x0 = 1e9, x1 = -1e9, wmin = 1e9, k, sx, sz, pr;
    for (k = 0; k < 4; k++) {
      sx = c.x + hx * (k < 2 ? hl : -hl) + lx * ((k & 1) ? hw : -hw);
      sz = c.z + hz * (k < 2 ? hl : -hl) + lz * ((k & 1) ? hw : -hw);
      pr = project(sx, sz);
      if (!pr.ok) return 1;
      if (pr.x < x0) x0 = pr.x;
      if (pr.x > x1) x1 = pr.x;
      if (pr.w < wmin) wmin = pr.w;
    }
    if (x0 < 0) x0 = 0;
    if (x1 > COLS - 1) x1 = COLS - 1;
    if (x1 <= x0) return 0;
    var rr = (c.tall + 0.35) * SCALE / wmin;
    if (rr > ROWS) rr = ROWS;
    return (x1 - x0) * rr / (COLS * ROWS);
  }

  /* ---- the body ------------------------------------------------------------------------------
   * Sliced along its own length, one black quad per slice at that slice's depth, so a car parked
   * end-on to the view occludes correctly along its four metres instead of being flattened onto
   * one plane. The roofline is the only lit part of the shell: a cut-out is only a silhouette if
   * SOMETHING lights its edge, which is the lesson street.js's traffic element learned by blanking
   * 89 cells to paint 8.
   *
   * THE SLICE COUNT FOLLOWS THE SCREEN SPAN, and a fixed six was wrong in the case that matters
   * most. A car parked end-on projects its whole length into a couple of columns, so six slices
   * overlap and read as one solid box; a CRUISER crossing the junction is broadside, so its length
   * spans forty columns while each slice's WIDTH is foreshortened to three — and six of those are
   * six narrow black posts with gaps between them, which is what the first render of the crossing
   * actually showed. street.js's traffic element solves it the same way, one sample per screen
   * column of the span, and the cost is bounded at 72 because a car nearer than that is retired. */
  var CAR_SLICES_MIN = 6, CAR_SLICES_MAX = 72;
  /* Past this the shell is a black cut-out and nothing else: no roofline, no wash. That is not an
   * omission, it is the whole content of the object at that range — a bar of lights on something
   * dark, which is what a patrol car at thirty metres in the rain actually is. It is deliberately
   * the same number as WASH_D_MAX: both marks fail for the same reason at the same range, and two
   * gates a few metres apart would only mean the car acquired a roof and then a floor. See the
   * roofline note in carBody for the measurement. */
  var ROOF_READ_D = 26;
  function carBody(f, c, fade, S) {
    var hx = c.hx, hz = c.hz, lx = -hz, lz = hx;
    var hw = c.wid * 0.5, hl = c.len * 0.5, i, j, r;
    var pn0 = project(c.x + hx * hl, c.z + hz * hl);
    var sp0 = pn0.ok ? pn0.x : 0, ok0 = pn0.ok;
    var pn1 = project(c.x - hx * hl, c.z - hz * hl);
    var lspan = (ok0 && pn1.ok) ? (pn1.x - sp0) : 0;
    if (lspan < 0) lspan = -lspan;
    var NS = (lspan + 2) | 0;
    if (NS < CAR_SLICES_MIN) NS = CAR_SLICES_MIN;
    if (NS > CAR_SLICES_MAX) NS = CAR_SLICES_MAX;
    for (i = 0; i < NS; i++) {
      var s = ((i + 0.5) / NS - 0.5) * c.len;
      var mx = c.x + hx * s, mz = c.z + hz * s;
      var pa = project(mx + lx * hw, mz + lz * hw); if (!pa.ok) continue;
      var xa = pa.x;
      var pb = project(mx - lx * hw, mz - lz * hw); if (!pb.ok) continue;
      var xb = pb.x;
      var pc = project(mx, mz); if (!pc.ok) continue;
      var w = pc.w, d = near(pc.dist), dd = pc.dist;
      /* The cabin is set back from both ends. At this size that step is the only thing on the
       * shell that says car rather than skip, and it is the only shape a broadside cruiser has. */
      var cab = s > -c.cab && s < c.cab;
      var rT = rowOf(cab ? c.tall + 0.30 : c.tall, w), rB = rowOf(0.04, w);
      var x0 = Math.round(xa < xb ? xa : xb), x1 = Math.round(xa < xb ? xb : xa);
      if (x1 < 0 || x0 > COLS - 1) continue;
      var span = xb - xa;
      if (x0 < 0) x0 = 0;
      if (x1 > COLS - 1) x1 = COLS - 1;
      var r0 = Math.round(rT), r1 = Math.round(rB);
      if (r1 < r0) r1 = r0;
      if (r0 < 0) r0 = 0;
      if (r1 > ROWS - 1) r1 = ROWS - 1;
      /* The dissolve rank lives on the CAR'S OWN LATTICE, never on the screen and never on the
       * slice index: `si` is a sixteenth of the way along the car and `q` a twelfth of the way
       * across it, so the rank of a given patch of bodywork is the same however many slices the
       * span happened to ask for at this distance. Keyed on `i` it would re-roll every time NS
       * changed — which is every couple of metres of approach — and the dissolve would boil
       * instead of thinning. */
      var si = (((s / c.len) + 0.5) * 16) | 0;
      for (j = x0; j <= x1; j++) {
        var q = fade < 1 ? (((j - xa) / (span === 0 ? 1 : span) * 12) | 0) : 0;
        for (r = r0; r <= r1; r++) {
          if (fade < 1 && hash2(si * 16 + q, r - r0, S + 1601) > fade) continue;
          put(f, j, r, 0, P.shadow, 0, d);
        }
      }
      /* THE ROOFLINE, one run per slice along the top edge of that slice. Because the slices now
       * follow the screen span it comes out right in both orientations for free: end-on it is a
       * dozen cells across the boot lid (the depth test hands the columns to whichever slice is
       * nearest, which is the end facing us), broadside it is a continuous edge running the length
       * of the car. It is the only lit part of the shell, and a black cut-out is only a silhouette
       * if something lights its edge.
       *
       * IT IS DRAWN ONLY INSIDE ROOF_READ_D, and that gate is the single biggest muddy trim in
       * this file. 112/92 was fitted at 22 m and is a fair number there — but a parked car spends
       * most of its life beyond thirty metres, and fog is multiplicative: measured over the police
       * frames of the 24-frame fixture, the roofline was the largest muddy contributor in the file
       * by a wide margin — 23 cells at v 116 and 39 cells at v 84-99 in two single frames, i.e. a
       * long amber run sitting just under the 120 line, which is precisely the grey veil this
       * budget cannot afford. Amber cannot be rescued at that range by driving the lum: at 45 m,
       * v 120 would need a post-fog lum of ~155, i.e. a raw 262, and anything over 174 walks into
       * lensbloom (see BAR_PEAK_RED). So the far roofline is DELETED rather than dimmed, exactly as
       * the house rule says, and the near one is lifted to where it clearly reads.
       *
       * 172 over the cabin and 148 over the ends, both under the 174 lensbloom cap, and the gate is
       * 26 m — the same range the wash uses, so inside 26 m the car has a roof and a pool of light
       * and outside it the car is a bar and a shape. At the gate they print v 135 and v 128 AFTER
       * the exposure pass's adaptation, and that last clause is the whole reason these numbers were
       * fitted twice: the print curve read straight out of core.js is PRE-adaptation, and
       * elements/optics.js's exposure gain then takes another 5-6% off in a typical frame. A
       * roofline fitted to v 122 on the curve measured v 115 in the finished frame, and v 115 is
       * muddy. Everything lit in this file is now fitted with that margin in it. The ends stay under
       * the cabin so the line reads as a roof falling away to a boot rather than as a bar.
       *
       * AND IT DISSOLVES IN COVERAGE, NOT IN BRIGHTNESS — it used to be multiplied by `fade`, which
       * is the one thing this file says twice over not to do. The approach dissolve is a coverage
       * fade precisely because a mark cannot be dimmed out without spending the whole way down in
       * the muddy band, and multiplying the roofline by fade did exactly that: at seed 3960 frame
       * 1800 the dissolving car's roofline printed 8 cells at v 110-115, dim because fade was 0.63
       * rather than because anything was far away. It now takes the SAME rank test the bodywork
       * under it takes — deliberately the same hash, because it is the same decision: this is the
       * lit edge OF that patch of roof, and an edge that outlived its own bodywork would be a line
       * floating over a hole. (The house rule about welding two decisions to one draw is about two
       * DIFFERENT decisions. This is one decision read twice.)
       *
       * THERE IS NO SILL. The first cut carried one at lum 30x wetness, which rendered at v 41 —
       * squarely muddy, seven cells of it per car, and invisible in the frame it was measured in.
       * The bottom edge of the body is already legible against the road it is standing on. */
      if (dd <= ROOF_READ_D) {
        var rl = fg(cab ? 172 : 148, dd);
        if (rl >= 5)
          for (j = x0; j <= x1; j++) {
            var rq = fade < 1 ? (((j - xa) / (span === 0 ? 1 : span) * 12) | 0) : 0;
            if (fade < 1 && hash2(si * 16 + rq, 0, S + 1601) > fade) continue;
            put(f, j, r0, G_DASH, P.amber, rl, nearer(dd));
          }
      }
    }
  }

  /* ---- the bar itself -------------------------------------------------------------------------
   * Solved as a LINE between two endpoints in the car's own object space, and which two is chosen
   * by whichever pair projects further apart in screen x. That is not a shortcut: a parked car
   * points down the street, so the bar's 1.7 m width is what spans the screen; a cruiser crossing
   * the junction is broadside, so its width is foreshortened to nothing and the bar's short axis
   * is what spans instead. Picking the wider pair gets both right with one piece of code.
   *
   * THE COLOUR SPLIT IS KEYED ON OBJECT SPACE, NOT ON SCREEN ORDER. Endpoint A is a fixed corner
   * of the car, so red stays on the same end of the bar for that car's whole life. Keyed on which
   * projected x happened to be smaller, the two halves would swap the instant the car turned
   * through edge-on — and a swap is a full-amplitude step on every cell of the bar, which is
   * exactly the artifact the smooth envelope exists to avoid. */
  function barEnds(c) {
    var hx = c.hx, hz = c.hz, lx = -hz, lz = hx;
    var hw = c.wid * 0.5 * 0.86, hl = c.len * 0.13;
    var y = c.tall + 0.22;
    BOK = 0;
    var pa = project(c.x + lx * hw, c.z + lz * hw); if (!pa.ok) return;
    var ax1 = pa.x, aw1 = pa.w, ad1 = pa.dist;
    var pb = project(c.x - lx * hw, c.z - lz * hw); if (!pb.ok) return;
    var bx1 = pb.x, bw1 = pb.w, bd1 = pb.dist;
    var pc = project(c.x + hx * hl, c.z + hz * hl); if (!pc.ok) return;
    var ax2 = pc.x, aw2 = pc.w, ad2 = pc.dist;
    var pd = project(c.x - hx * hl, c.z - hz * hl); if (!pd.ok) return;
    var bx2 = pd.x, bw2 = pd.w, bd2 = pd.dist;
    /* THE DEPTH THE BAR IS STAMPED AT, and getting this wrong is how the whole lightbar came to be
     * missing from the first render of this file. The body is drawn as SIX depth-sorted slices, so
     * the near end of a 4.4 m car is stamped two metres closer than the car's centre — and the bar
     * sits over the middle of the roof, in the SAME screen columns as that near slice, at the
     * centre's depth. put() wants a strict improvement, so every cell of the bar lost the test to
     * the car it is bolted to and the element painted a black box with a roofline and no lamps.
     * The car is ONE object: the bar takes the depth of its nearest roof corner, which is what
     * puts it in front of every slice of its own shell and behind everything that is genuinely in
     * front of the car. The 2 m of error against a pedestrian standing beside the bonnet is a
     * centimetre of screen at any distance this draws at. */
    var hl2 = c.len * 0.5, k, dn = 1e9, pe;
    for (k = 0; k < 4; k++) {
      pe = project(c.x + hx * (k < 2 ? hl2 : -hl2) + lx * ((k & 1) ? hw : -hw),
                   c.z + hz * (k < 2 ? hl2 : -hl2) + lz * ((k & 1) ? hw : -hw));
      if (pe.ok && pe.dist < dn) dn = pe.dist;
    }
    BDN = dn < 1e8 ? dn : ad1;
    var s1 = ax1 - bx1; if (s1 < 0) s1 = -s1;
    var s2 = ax2 - bx2; if (s2 < 0) s2 = -s2;
    if (s1 >= s2) {
      BX0 = ax1; BR0 = rowOf(y, aw1); BD0 = ad1;
      BX1 = bx1; BR1 = rowOf(y, bw1); BD1 = bd1;
    } else {
      BX0 = ax2; BR0 = rowOf(y, aw2); BD0 = ad2;
      BX1 = bx2; BR1 = rowOf(y, bw2); BD1 = bd2;
    }
    BOK = 1;
  }

  function lightbar(f, c, fade, t) {
    barEnds(c);
    if (!BOK) return;
    var e = barEnv(t, c.ph);
    var lo = BX0 < BX1 ? BX0 : BX1, hi = BX0 < BX1 ? BX1 : BX0;
    var ctr = (lo + hi) * 0.5;
    /* THE CAP. Truncates the ends; the interpolation below still runs on the true endpoints, so
     * the piece that is drawn stays in the right place and at the right slope. */
    if (hi - lo > BAR_COLS_MAX) { lo = ctr - BAR_COLS_MAX * 0.5; hi = ctr + BAR_COLS_MAX * 0.5; }
    var j0 = Math.round(lo), j1 = Math.round(hi);
    if (j1 < 0 || j0 > COLS - 1) return;
    if (j0 < 0) j0 = 0;
    if (j1 > COLS - 1) j1 = COLS - 1;
    var dx = BX1 - BX0, j;
    for (j = j0; j <= j1; j++) {
      var u = dx === 0 ? 0.5 : (j - BX0) / dx;
      if (u < 0) u = 0; else if (u > 1) u = 1;
      var row = Math.round(BR0 + (BR1 - BR0) * u);
      var dd = BD0 + (BD1 - BD0) * u;
      var red = u < 0.5;
      /* The two halves take e and 1-e, so the bar's total output barely moves and only its
       * DISTRIBUTION does. That is the whole safety argument of this file. */
      var lum = fg(barLum(red ? BAR_PEAK_RED : BAR_PEAK_AZURE, fade, red ? e : 1 - e), dd);
      if (lum < 5) continue;
      /* A lamp, so a round blocky glyph — the same choice the headlamps in street.js make. The
       * glyph does NOT change with the envelope: a shape that swapped at 2.2 Hz would be a second
       * flicker source riding on the first, and it would not show up in a luminance statistic. */
      put(f, j, row, G_8, red ? P.red : P.azure, lum, nearer(BDN));
    }
  }

  /* ---- the wash --------------------------------------------------------------------------------
   * THE FIRST CUT SAMPLED A GRID IN THE CAR'S OBJECT SPACE — five points 2.3 m apart along the car
   * and three 1.5 m apart out into the road — and it was wrong in a way only a rendered frame
   * shows: at 22 m, 2.3 m is fifteen columns, so the "pool" printed as nine coloured cells strewn
   * across a third of the screen width. That is grit, not light. A wash has to be CONTIGUOUS or it
   * does not read as a wash at any brightness.
   *
   * So the pool is walked in SCREEN COLUMNS and each cell is un-projected back onto the road plane
   * to find the world point it is actually standing on. Everything that has to be stable then keys
   * on that world point rather than on the cell: the distance falloff, and the red/azure checker.
   * A checker keyed on the screen cell re-rolls every frame and boils; keyed on the world it holds
   * still under the camera exactly the way a puddle of light does.
   *
   * BOUNDED ON BOTH ENDS, because this is the one part of the file with area: two rows, at most
   * WASH_COLS_MAX columns, and nothing past WASH_REACH from the car. A near car therefore prints
   * the SAME cell count as a far one and only its brightness and its position change.
   *
   * THE POOL IS SMALL AND BRIGHT RATHER THAN BROAD AND DIM, and the numbers below are what came
   * back from the print curve once the wash could be seen at all (see roadDist: until the row-
   * centre fix every cell of it was silently losing the depth test). The reach came in from 6.2 m
   * to 3.4 m, the falloff flattened from 0.115/m to 0.05/m and the envelope floor rose from 0.62 to
   * 0.66, all for one reason: a spatial falloff spends its outer half in the muddy band. With this
   * set the DIMMEST cell of the pool — outer edge, dim phase of the envelope, dry-ish road, at the
   * WASH_D_MAX gate — still prints v ~124 (red) and v ~122 (azure), and the brightest prints v 166.
   * Counted over the 24-frame fixture the pool lands 32 lit cells and ONE muddy one, against a
   * before state of zero cells of either: nothing in it is a grey veil and nothing in it blooms.
   *
   * WASH_D_MAX IS 26 m AND THAT IS THE FIRST FOG BUCKET'S EDGE, not a round number: past it the
   * print curve starts retiring its gamma lift AND CC.Surf.fog has taken a fifth of the luminance,
   * and the dim end of the pool cannot be held over v 120 by any peak under the 174 lensbloom cap.
   * Beyond 26 m the car is a bar of lights on a black shape and nothing else.
   *
   * ONE CELL IN THREE IS RED and the rest are azure, which is a print-budget decision and not a
   * styling one: red is capped at ~1.5% of the frame's lit energy fleet-wide, the pool is at most
   * 22 cells of which ~7 are red, and that is what fits. Azure is a pillar and has room. */
  var WASH_ROWS = 2, WASH_COLS_MAX = 11, WASH_REACH = 3.4, WASH_D_MAX = 26;
  function washRoad(f, c, fade, t, wetR) {
    var e = barEnv(t, c.ph);
    var hx = c.hx, hz = c.hz, lx = -hz, lz = hx;
    /* The pool lies on the ROAD side of the car — a car at the kerb throws its light out across
     * the carriageway, not through the building it is parked against. c.out is fixed AT SPAWN and
     * not derived from the live lateral offset, which is a bug fix rather than a tidy-up: a
     * cruiser's lateral offset changes sign halfway through its crossing, so a wash keyed on it
     * would flip to the other side of the car in one tick, in the middle of the junction. */
    var out = c.out;
    var pc = project(c.x, c.z); if (!pc.ok) return;
    var baseRow = Math.round(rowOf(0, pc.w));
    /* THE POOL STARTS AT THE CAR'S OUTER FLANK, NOT AT ITS CENTRE, and that is a bug fix rather
     * than a nicety: run from the centre, the whole column budget lands INSIDE the car's own
     * screen footprint once the car is nearer than about 18 m, where the body's cut-out wins the
     * depth test outright — measured at 13 m, the pool printed two cells and the car sat in the
     * road throwing no light at all. */
    var pn = project(c.x + lx * out * (c.wid * 0.5 + 0.3), c.z + lz * out * (c.wid * 0.5 + 0.3));
    if (!pn.ok) return;
    var xc = pn.x;
    var pf = project(c.x + lx * out * WASH_REACH, c.z + lz * out * WASH_REACH); if (!pf.ok) return;
    var xf = pf.x;
    /* Truncate the FAR end, always: it is the dim end, and the near end is the one that has to
     * stay attached to the car or the pool reads as an unrelated smear on the tarmac. */
    if (xf > xc + WASH_COLS_MAX) xf = xc + WASH_COLS_MAX;
    else if (xf < xc - WASH_COLS_MAX) xf = xc - WASH_COLS_MAX;
    var lo = xc < xf ? xc : xf, hi = xc < xf ? xf : xc;
    var j0 = Math.round(lo), j1 = Math.round(hi), j, r;
    if (j1 < 0 || j0 > COLS - 1) return;
    if (j0 < 0) j0 = 0;
    if (j1 > COLS - 1) j1 = COLS - 1;
    var halfC = COLS * 0.5;
    for (r = 0; r < WASH_ROWS; r++) {
      var row = baseRow + r;
      if (row < 0 || row > ROWS - 1) continue;
      /* The row CENTRE, for the reason roadDist spells out — the floor pass writes this row at the
       * depth of its middle, and half a cell of disagreement is enough to lose every put. */
      var den = row + 0.5 - HOR;
      if (den < 0.5) continue;
      var w = EYE * SCALE / den;             // the road's forward distance at this screen row
      for (j = j0; j <= j1; j++) {
        /* The exact inverse of project(): the basis is orthonormal, so the world point is just
         * w along forward plus sp*w along right. */
        var sp = ((j + 0.5) / halfC - 1) * HP;
        var pxw = CX + (FWX + sp * RGX) * w, pzw = CZ + (FWZ + sp * RGZ) * w;
        var ddx = pxw - c.x, ddz = pzw - c.z;
        var dd2 = Math.sqrt(ddx * ddx + ddz * ddz);
        if (dd2 > WASH_REACH) continue;
        var fall = 1 - dd2 * 0.05;
        var key = (Math.floor(pxw * 1.15) + Math.floor(pzw * 1.15)) % 3;
        if (key < 0) key += 3;
        var red = key === 0;
        var rd = w * Math.sqrt(1 + sp * sp);
        /* 150/112, and the split is the print curve rather than taste: red carries a 0.56 exposure
         * against azure's 1.00, so the same lum lands red forty points of v lower — azure at 112
         * and red at 150 both top out at v 166 and both bottom out around v 122. Neither peak may
         * pass 174, for the lensbloom reason under BAR_PEAK_RED.
         *
         * The 0.66 floor inside the envelope does two jobs: it holds the dim phase above v 120 —
         * a pool whose dark half is muddy is worse than no pool — and it holds the modulation of
         * this whole patch to 34% of peak, which is what makes an area this size safe to pulse at
         * 1.1 Hz. It is folded INTO the envelope and then scaled; nothing is subtracted after. */
        var lum = fg((red ? 150 : 112) * fall * (0.62 + 0.38 * wetR) * fade *
                     (0.66 + 0.34 * (red ? e : 1 - e)), rd);
        if (lum < 5) continue;
        put(f, j, row, r === 0 ? G_EQ : G_DASH, red ? P.red : P.azure, lum, near(rd));
      }
    }
  }
  /* THERE IS NO WALL WASH ANY MORE, and the deletion is a measurement rather than a preference.
   * It was two horizontal runs of up to 13 columns on the building line the car is parked against,
   * and the argument for it was good — the wall is the only near, vertical, dark surface down here,
   * so a coloured patch on it says the light has a source at street level. What it actually did,
   * counted cell by cell over the police frames of the 24-frame fixture, was print FIVE surviving
   * cells in five frames (two of them muddy, at v 112-113) out of 23 attempted puts; the rest lost
   * the depth test to the facade the wall belongs to, which the world pass has already drawn at its
   * own depth with no room in front of it. Twenty-six cells of budget for one visible cell a frame
   * is exactly the rent the house rule says to stop paying, so the road pool — which now survives,
   * see roadDist — carries the whole read on its own.
   *
   * If it is ever wanted back it needs the facade's OWN distance, not the wall plane's, or it will
   * keep losing the same test for the same reason. */

  /* Head and tail lamps, for the cruiser only — a parked car has its lamps off and its bar on,
   * which is exactly why it is the cheaper of the two. Both are short horizontal smears trailing
   * the direction of travel rather than points: at 12 m/s a lamp is a streak, and one isolated
   * bright cell in a black intersection reads as a stuck pixel.
   *
   * THE HEADLAMP AT 236 IS THE ONE THING IN THIS FILE ABOVE THE 174 BLOOM CAP, and it is deliberate.
   * The rule under BAR_PEAK_RED is about MODULATING sources: a light that crosses optics.js's
   * lensbloom threshold twice a cycle switches a halo on and off at that cycle's rate. A headlamp
   * is steady — it crosses the threshold once, when the cruiser spawns beyond the far building
   * line, and once when it leaves — so its halo is a halo and not a flicker. street.js's traffic
   * headlamps sit at 240 for the same reason and this matches them rather than inventing a second
   * convention. The SMEAR cells behind it are a different matter: the third one used to be drawn at
   * 0.20 of the lamp, which is a G_DOT speck printing at v ~95, a mark in the muddy band that the
   * glyph set cannot make visible at any brightness. It is gone; two cells is a streak. */
  function carLamps(f, c, wetR) {
    var hx = c.hx, hz = c.hz;
    var hl = c.len * 0.5;
    var pn = project(c.x + hx * hl, c.z + hz * hl); if (!pn.ok) return;
    var xn = pn.x, wn = pn.w, dn = pn.dist;
    var pt = project(c.x - hx * hl, c.z - hz * hl); if (!pt.ok) return;
    var xt = pt.x, wt = pt.w, dtl = pt.dist, spt = pt.sp;
    var back = xn > xt ? -1 : 1;
    var hl2 = fg(236, dn), tl = fg(188, dtl);
    var rHl = Math.round(rowOf(0.62, wn)), rTl = Math.round(rowOf(0.78, wt));
    if (hl2 >= 5) {
      put(f, Math.round(xn), rHl, G_0, P.ice, hl2, nearer(dn));
      put(f, Math.round(xn) + back, rHl, G_o, P.ice, hl2 * 0.46, nearer(dn));
    }
    if (tl >= 5) {
      put(f, Math.round(xt), rTl, G_o, P.red, tl, nearer(dtl));
      /* G_o and not a dot: '.' is a speck glyph and the house rules say twice over that a speck is
       * invisible at any brightness. The streak is carried by the second lamp being dimmer, not by
       * it being made of a smaller mark. */
      put(f, Math.round(xt) + back, rTl, G_o, P.red, tl * 0.44, nearer(dtl));
      /* In the wet road under the skirt, at the TARMAC's depth — the road there is nearer than the
       * car, so the lamp's own distance would lose the test outright. */
      var rr0 = Math.round(rowOf(0, wt)) + 1;
      var rd = roadDist(rr0, spt);
      var rl = fg(66 * (0.55 + 0.45 * wetR), rd);
      if (rl >= 5) put(f, Math.round(xt), rr0, G_QUOTE, P.red, rl, near(rd));
    }
  }

  /* =============================================================================================
   * OFFICERS ON FOOT — layer 25, drawn with the same convention as the crowd in street.js.
   * A near-black cut-out with a LIT TOP EDGE, because that is the only thing that reads against a
   * black road. What makes one an OFFICER rather than a pedestrian at ten rows tall is three
   * things and no more: a cap brim drawn as a hard horizontal DASH wider than the head, shoulders
   * that are square and high instead of tapered, and exactly ONE accent.
   * ============================================================================================ */
  var offs = null, OFF_N = 3;
  var OFF_COVER_MAX = 0.030;    // the same idea as PED_COVER_MAX, a shade tighter: an officer is
                                // broader than a pedestrian, so the same distance costs more area

  function offCover(o, pr) {
    var shw = offShoulder(pr.w);
    var xw = shw * 1.34;                       // the brim is the widest thing on the figure
    var x0 = pr.x - xw, x1 = pr.x + xw;
    if (x0 < 0) x0 = 0;
    if (x1 > COLS - 1) x1 = COLS - 1;
    if (x1 <= x0) return 0;
    var rr = o.tall * SCALE / pr.w;
    if (rr > ROWS) rr = ROWS;
    return (x1 - x0) * rr / (COLS * ROWS);
  }
  /* Half a SHOULDER width in columns. 0.29 m against the crowd's 0.24: a stab vest and a squared
   * jacket, and the extra width is most of what makes the silhouette read as uniformed. Same
   * function is used by the draw and by the area budget — two formulas for one box is how
   * street.js's cull came to let through the case it existed to catch. */
  function offShoulder(w) {
    var shw = 0.29 * CPM / w;
    return shw < 0.5 ? 0.5 : shw;
  }

  function offSpawn(o, i, S, fresh, city, car) {
    o.n++;
    var n = o.n;
    /* ONE INDEPENDENT DRAW PER DECISION, additive salts, spread — the house rule. Sharing a draw
     * between the post/beat choice and the accent would make every officer at a checkpoint carry
     * the same accent, which is the same welding bug street.js documents three times. */
    var h1 = hash2(i, n, S + 101), h2 = hash2(i, n, S + 211), h3 = hash2(i, n, S + 307),
        h4 = hash2(i, n, S + 401), h5 = hash2(i, n, S + 503), h6 = hash2(i, n, S + 601),
        h7 = hash2(i, n, S + 701), h8 = hash2(i, n, S + 809), h9 = hash2(i, n, S + 907);
    /* h10-h12 are drawn where they are used, at the bottom of this function. */
    var cw = carriage();
    var a, l, side;
    o.chk = 0;
    var atCar = car && car.live && car.chk && h1 < 0.78;
    if (atCar) {
      /* A CHECKPOINT: the officer stands out from the car, into the road, facing across it. This
       * is the strongest thing this file can put on screen — a parked car with its bar running, a
       * figure beside it and the light of the bar landing on both — and it is deliberately not
       * always available: it needs the parked slot to be live AND to have rolled a checkpoint. */
      a = (car.axis ? car.x : car.z) + (h2 - 0.5) * 5.6;
      l = car.lat - (car.lat < 0 ? -1 : 1) * (0.9 + h3 * 1.5);
      side = car.lat < 0 ? -1 : 1;
      o.vx = 0; o.vz = 0;
      o.chk = 1;
      o.axis = car.axis; o.ctr = car.ctr;
    } else {
      /* Slot 2 exists for checkpoints only. Without this the street carries three officers walking
       * a beat at all times, which is a police state rather than a city with police in it. */
      if (i === 2) { o.live = 0; o.wait = 6 + h4 * 14; return; }
      /* A BEAT on the pavement, spawned beyond OFF_DRAW_D so the figure walks into the drawn range
       * rather than being switched on in the middle of it. 30-42 m, in from 50-66: the draw cull
       * came in to 26 m when the rim was raised out of the muddy band, and an officer spawned at
       * 66 m spent forty seconds of walk costing update time while contributing nothing to any
       * frame. Four metres of margin over the cull is enough for the fog to hand it over. */
      var band = COR.half - cw - 0.7;
      if (band < 0.2) band = 0.2;
      side = h2 < 0.5 ? -1 : 1;
      a = COR.along + COR.dir * (fresh ? 9 + h3 * 22 : 30 + h3 * 12);
      l = side * (cw + 0.35 + h4 * band);
      /* Two in three walk; the rest hold a corner. A standing officer is worth more than a walking
       * one here — it is the one figure on the street that is not going anywhere, which is what
       * makes it read as on duty — but a street of statues reads as broken. */
      if (h5 < 0.66) {
        var sp = (1.02 + h6 * 0.26) * (1 - 0.14 * wp().rain);
        var go = (h7 < 0.55 ? -1 : 1) * COR.dir;
        o.vx = COR.axis ? go * sp : 0;
        o.vz = COR.axis ? 0 : go * sp;
      } else { o.vx = 0; o.vz = 0; }
      o.axis = COR.axis; o.ctr = COR.ctr;
    }
    o.x = wX(o.axis, o.ctr, a, l); o.z = wZ(o.axis, o.ctr, a, l);
    o.lat = l;
    o.tall = 1.74 + h8 * 0.12;
    o.walked = 0;
    /* h10, h11 and h12 exist because the first cut welded three decisions onto draws that already
     * had a job: the stride phase shared h3 with the spawn position (so an officer's gait was a
     * function of how far down the street it stood), the rim colour shared h5 with the walk/stand
     * gate (so nearly every walker came out amber and only the standing ones were ever lit by a
     * screen), and the accent shared h6 with the walking speed. That is the same welding bug
     * street.js documents three separate times, and it costs one hash each to not have. */
    o.phase = hash2(i, n, S + 1013) * TAU;
    o.side = h9 < 0.5 ? -1 : 1;                 // which shoulder the nearest lamp is over
    /* Rim colour follows the same two-pillar rule the crowd's does — sodium overhead most of the
     * time, screenlight where the frontage is throwing it. */
    o.rim = hash2(i, n, S + 1117) < 0.74 ? P.amber : P.azure;
    /* THE ONE ACCENT — a hi-vis band, a visor, or a shoulder lamp. One of the three, never two. */
    var h12 = hash2(i, n, S + 1301);
    o.acc = h12 < 0.42 ? 0 : (h12 < 0.74 ? 1 : 2);
    o.live = 1;
  }

  /* THE OFFICER CULL, as a function because there are two callers now. The ordinary per-frame
   * retirement is one; the reduced-motion refill below is the other, and it has to be able to ask
   * whether the placement it has just made is one the NEXT frame would throw away.
   *
   * THE NEAR RETIREMENT runs a long way ahead of project()'s w<0.45 cull for the reason
   * PED_COVER_MAX spells out: a cut-out cannot be faded down, so the only way one can leave quietly
   * is to be small when it goes. */
  function offGone(o) {
    var pro = project(o.x, o.z);
    if (!pro.ok || pro.w > 70 || pro.sp > HP * 1.8 || pro.sp < -HP * 1.8) return 1;
    /* offCover reads pro, which is the shared PJ scratch, and projects nothing itself — so this
     * order is load-bearing and nothing may be projected between the two lines. */
    return offCover(o, pro) > OFF_COVER_MAX ? 1 : 0;
  }
  /* FILL A SLOT NOW, AND KEEP ASKING UNTIL THE PLACEMENT SURVIVES ITS OWN CULL. Reduced motion
   * only, and it is a fix for a measured artifact rather than caution: a spawn is tested for
   * retirement on the tick AFTER it is placed, so a figure dropped 45 degrees off the view axis —
   * which is what a corridor-space `along` offset gives you on a diagonal bearing — was drawn for
   * exactly one frame and then culled and replaced. In a still shot that is a whole officer
   * appearing and moving: 167/255 in one cell, seed 0, first frame of the last bearing, with the
   * camera frozen and nothing else in the file moving at all. Asking the cull FIRST makes the
   * placement final, so the tableau composes inside one update and holds.
   *
   * Bounded at eight, because a bounded retry is a cost and an unbounded one is a hang. Every try
   * is one more spawn draw, i.e. keyed on the slot's spawn counter exactly as the house rule
   * requires, so this replays identically and survives a scrub. If all eight are culled the slot is
   * left EMPTY: an empty slot is still, and a bad placement is not. */
  function offSettle(o, i, S, city, park) {
    var tries = 0;
    do {
      /* `fresh` is forced, and it is the difference between having officers and not having them.
       * A beat spawns 30-42 m out and walks into the 26 m draw gate; with k at zero it cannot
       * walk, so every officer this element owns would stand four metres outside the range it is
       * drawn at for ever. Measured before this was forced: all three slots live, all three 32-43 m
       * out, zero officer cells in any of the eight bearings. The warm-up band, 9-31 m, puts them
       * where they can be seen. */
      offSpawn(o, i, S, 1, city, park);
      tries++;
    } while (o.live && offGone(o) && tries < 8);
    if (o.live && offGone(o)) o.live = 0;
  }

  /* One officer. Everything below the rim is a hole; everything at the rim is one cell.
   *
   * OFF_DRAW_D IS 26 AND IT WAS 66, and this is the officers' half of the same finding the roofline
   * carries: a figure was being drawn out to sixty-six metres and could not be seen there. What was
   * measured over the police frames of the 24-frame fixture is a review's exact words — "I found no
   * pedestrian-like figure associated with any police object". Two reasons, both fixed here. The
   * rim was 78-112 raw, which fog takes to 51-73 at 45 m and prints at v 71-99: the muddy band, so
   * the top edge that is the whole silhouette was a grey rumour on a black cut-out. And the cut-out
   * itself was 91-188 cells in a single frame, all of it P.shadow at lum 0 — free in the print
   * budget, but it is a hole with nothing on it, which is the definition of a cell that cannot be
   * seen. 26 m is where the raised rim below still clears v 120 in the FINISHED frame, i.e. after
   * the exposure pass has taken its 5-6%; past it the figure is not drawn at all rather than drawn
   * dim. (34 m was the first answer here and it was fitted on the bare print curve, which is 5-6%
   * optimistic — the same mistake the roofline made, found the same way.) It costs a small pop-in
   * as one crosses the gate — bounded at about 15 cells, 0.1% of the frame, far under any
   * luminance-step concern — and the crowd in street.js takes the same pop at its own cull. */
  var OFF_DRAW_D = 26;
  /* `t` and `wetR` used to be arguments here; both fell away with the road reflection, which
   * was the only thing in this function that asked the weather or the clock. The stride is keyed on
   * distance walked, not on t, so it survives a scrub. */
  function drawOfficer(f, o, i, S, bareLit) {
    var pr = project(o.x, o.z);
    if (!pr.ok || pr.dist > OFF_DRAW_D) return;
    var w = pr.w, dist = pr.dist, d = near(dist), cx = pr.x;
    var rFeet = rowOf(0, w), rHead = rowOf(o.tall, w);
    var tallRows = rFeet - rHead;
    if (tallRows < 2.2) return;                 // sub-cell: it would only salt the pavement
    if (offCover(o, pr) > OFF_COVER_MAX * 2) return;   // backstop for a resize between the two
    var shw = offShoulder(w);
    var x0 = Math.round(cx - shw * 1.34), x1 = Math.round(cx + shw * 1.34);
    if (x1 < 0 || x0 > COLS - 1) return;
    if (x0 < 0) x0 = 0;
    if (x1 > COLS - 1) x1 = COLS - 1;
    /* Stride keyed on distance walked, not on wall clock: it survives a scrub and it stays in step
     * with the legs rather than with the frame counter. */
    var st = CC.reducedMotion ? 0 : Math.sin(o.walked * 3.4 + o.phase);
    /* 148-170 raw, up from 78-112, and the range is NARROWER as well as brighter. Fitted the same
     * way as the roofline and with the same margin for the exposure pass: at the 26 m gate fog
     * leaves 121-139 of it, which the curve prints at v 136-145 and adaptation delivers at v 127-137
     * in the finished frame. The old 78-112 delivered v 71-99 at 45 m — a top edge nobody could see,
     * which is why the review found no officers at all. The top of the range stays under the 174
     * lensbloom cap even at the near retirement, where fog does nothing. */
    var rim = fg(148 + hash2(i, o.n, S + 5) * 22, dist);
    /* An officer standing in a running lightbar is lit BY it. Low amplitude on purpose — 12% of
     * the rim, on the handful of cells a figure's top edge occupies — because the alternative is a
     * whole person pulsing at 2.2 Hz, and a person is a shape the eye tracks.
     *
     * THE SENTINEL IS -1 AND NOT 0, and that is not fussiness. The envelope legitimately reaches
     * exactly 0 at its trough, so a `> 0` test would treat the darkest instant of every cycle as
     * "not at a checkpoint at all" and hand the figure its FULL rim — a 12% step on the one frame
     * the light is lowest, twice a second, which is precisely the artifact this whole file is
     * built to avoid. Not lit is a different state from lit-at-zero and has to be spelled so. */
    if (bareLit >= 0) rim *= 0.88 + 0.12 * bareLit;
    var x, v0, v1, q;
    for (x = x0; x <= x1; x++) {
      var u = (x - cx) / shw, au = u < 0 ? -u : u;
      v0 = 9; v1 = -9;
      if (au <= 1.0) {
        /* SQUARE, HIGH SHOULDERS: the shoulder line is flat all the way out to the full width
         * instead of tapering the way a coat does. That plus the brim is the whole silhouette. */
        v0 = au > 0.44 ? 0.145 : 0;
        v1 = au > 0.66 ? 0.60 : 1;
        /* The legs alternate rather than parting — one reaches while the other lifts. */
        if (au < 0.36 && tallRows > 6) {
          var lg = (u < 0 ? -1 : 1) * st;
          if (lg > 0.30) v1 = 0.95;
          else if (lg < -0.30) v1 = 0.87;
        }
      }
      /* THE CAP. A hard horizontal brim, wider than the head and narrower than the shoulders, and
       * it is drawn as a band of its own so that the rim loop below lands a DASH on its top edge.
       * A brim caught from above is a horizontal edge, and at this cell size the only mark that
       * says "edge" is one with width across the cell — the crowd's costumes were a dotted rumour
       * until that was fixed, and this is the same fix applied to the one feature that has to
       * carry "police" on its own. */
      if (au > 0.44 && au <= 1.34) {
        if (0.055 < v0) v0 = 0.055;
        if (0.115 > v1) v1 = 0.115;
      }
      if (v1 < v0) continue;
      var rt = rHead + v0 * tallRows, rb = rHead + v1 * tallRows;
      var r0 = Math.round(rt), r1 = Math.round(rb);
      if (r1 < r0) r1 = r0;
      if (r0 < 0) r0 = 0;
      if (r1 > ROWS - 1) r1 = ROWS - 1;
      for (q = r0; q <= r1; q++) put(f, x, q, 0, P.shadow, 0, d);
      if (rim >= 5) {
        /* Every cell lit here is the TOP EDGE of its own column: the crown, the brim, the square
         * shoulder line. They all face the same lamp, so none of them may be a third as bright as
         * the others — the ramp only takes the outer bands slightly under the crown. */
        var rl = au < 0.44 ? 1 : (au <= 1.0 ? 0.90 : 0.95);
        put(f, x, r0, au < 0.44 ? G_o : G_DASH, o.rim, rim * rl, nearer(dist));
      }
    }
    if (rim < 5) return;
    /* One shoulder is turned to the lamp, so that side gets a short contiguous rim down the upper
     * body. It stops at the waist: carried to the feet it outlines the figure and turns it into a
     * neon sign.
     *
     * TWO CELLS AT 0.96 AND 0.88, WHERE IT WAS UP TO NINE RAMPED FROM 0.58 TO 0.16. The old ramp
     * was structurally muddy: its BRIGHTEST cell was 0.58 of a rim that is itself capped under 174,
     * which prints at v ~95, and its dimmest at v ~35. Nine cells per officer, every one of them in
     * the band this build is closest to overspending and none of them visible — the exact case the
     * house rule says to delete rather than dim. Two cells still read as a shoulder at this size;
     * the difference is that they read at all. */
    if (tallRows > 8) {
      var rx = Math.round(cx + o.side * shw);
      for (q = 1; q <= 2; q++)
        put(f, rx, Math.round(rHead + q + 1), G_QUOTE, o.rim, rim * (q === 1 ? 0.96 : 0.88),
            nearer(dist));
    }
    /* THE ONE ACCENT, and it is one and not three. */
    if (tallRows > 4) {
      if (o.acc === 0) {
        /* A hi-vis band across the chest. Spring rather than amber because it is the only thing
         * on the street that is a retroreflective yellow-green, and two cells of it is inside
         * spring's 1.2%-of-lit-energy standing share. */
        var a1 = fg(168, dist);
        if (a1 >= 5) {
          var by = Math.round(rHead + tallRows * 0.30);
          put(f, Math.round(cx - shw * 0.5), by, G_DASH, P.spring, a1, nearer(dist));
          /* 0.90 rather than 0.80: at 126 x 0.80 the far cell printed v 113, muddy, while the near
           * one printed v 131. Half a hi-vis band is not a hi-vis band. Spring carries one of the
           * lowest exposures in the table, which is why the band is written at 168 where azure's
           * visor is written at 112 for the same printed value. */
          put(f, Math.round(cx + shw * 0.5), by, G_DASH, P.spring, a1 * 0.90, nearer(dist));
        }
      } else if (o.acc === 1) {
        /* A visor. One horizontal cell across the face — a band, not a dot, because that is what
         * a visor is and because a dot at this size is a speck. */
        var a2 = fg(112, dist);
        if (a2 >= 5)
          put(f, Math.round(cx), Math.round(rHead + tallRows * 0.075), G_DASH, P.azure, a2,
              nearer(dist));
      } else {
        /* A shoulder lamp. Ice, doing ice's actual job: a GLINT — and ONE cell, not two. The second
         * cell was a G_DOT at 0.35 of the lamp, which measured v 96 at seed 3960: a speck glyph at
         * a muddy value, which is the least visible thing this glyph set can print. Ice takes 0.4%
         * of the frame's lit energy and it earns that by being a point of light, so the point is
         * what is kept. */
        var a3 = fg(150, dist);
        if (a3 >= 5)
          put(f, Math.round(cx + o.side * shw * 0.9), Math.round(rHead + tallRows * 0.17),
              G_o, P.ice, a3, nearer(dist));
      }
    }
    /* THERE IS NO REFLECTION UNDER THE FEET ANY MORE. It was up to four cells of the rim colour
     * ramped down by (0.48 - 0.11q) into the wet road, and the argument for it was that it lands in
     * empty black road rather than in the busy band at the horizon. What it printed, counted at
     * seed 3960 frame 1800, was 37 amber cells at v 9-44 — below v 60 is not "dim", it is a cell no
     * eye would call lit, and every one of them was in the muddy 9-119 band that this build is
     * closest to overspending. The ramp cannot be rescued by raising it either: its brightest step
     * is 0.37 of a rim that is itself capped under 174, so the whole tail is structurally muddy.
     * Deleted rather than dimmed, which is the house rule for exactly this case.
     *
     * NOTE FOR ANYONE RESTORING IT: it used to be nearly invisible for a second reason as well —
     * roadDist was half a row out and most of these puts lost the depth test outright. That bug is
     * fixed now, so a restored reflection would print roughly three times as many muddy cells as
     * the census above recorded. */
  }

  /* =============================================================================================
   * THE ELEMENT
   * ============================================================================================ */
  CC.ELEMENTS.push({
    name: 'police',
    /* CITY ONLY. See src/world.js: an element with no `world` belongs to both, and main.js
     * filters CC.ELEMENTS on this before the layer sort. */
    world: 'cyber',
    layer: 25,
    init: function (city, rng, dims) {
      this.city = city;
      /* EXACTLY ONE rng() call, always. The stream is shared with every element that loads after
       * this one, so drawing a second time here would re-roll the whole city's street furniture. */
      this.seed = (rng() * 30011) | 0;
      this.boot = 0;
      this.settled = 0;      // "the frozen tableau has been composed" — reduced motion only
      this.warm = 0;         // the first fill spreads over the visible street; every later one
                             // arrives from beyond the draw cull. See offSpawn's `fresh`.
      this.cols = dims && dims.cols ? dims.cols : 200;
      this.rows = dims && dims.rows ? dims.rows : 60;
      var i;
      cars = new Array(CAR_N);
      for (i = 0; i < CAR_N; i++)
        cars[i] = { x: 0, z: 0, hx: 0, hz: 1, vx: 0, vz: 0, live: 0, wait: 4 + i * 9, n: i * 67,
                    len: 4.4, wid: 1.85, tall: 1.42, cab: 1.0, ph: i * 0.37, chk: 0,
                    lat: 0, wl: 0, out: 1, go: 1, chalf: 2, axis: 0, ctr: 0, fade: 1 };
      offs = new Array(OFF_N);
      for (i = 0; i < OFF_N; i++)
        offs[i] = { x: 0, z: 0, vx: 0, vz: 0, live: 0, wait: 2 + i * 5, n: i * 83,
                    tall: 1.78, walked: 0, phase: 0, side: 1, rim: P.amber, acc: 0, chk: 0,
                    lat: 0, axis: 0, ctr: 0 };
    },

    update: function (dt, t, cam) {
      /* The full screen basis, not just camBasis: both retirements below are written in screen
       * area, and an area budget has to be computed the way the draw computes it. The dimensions
       * are last frame's — one frame of lag on a resize, and nothing has moved in it. */
      camScreenAt(cam, this.cols, this.rows);
      var city = this.city;
      corridor(city, cam);
      var S = this.seed, i;
      /* ZERO, NOT 0.08, AND THAT IS THE CONTRACT RATHER THAN A TASTE. CC.reducedMotion means the
       * piece is STILL; tools/flicker-rate.cjs section 4 freezes the camera, turns it on and fails
       * this element on any per-cell luminance step at all, however small. A twelfth of a cruiser's
       * 9-15 m/s is still 1 m/s, and a twelfth of an officer's 1.1 m/s walk still carries the
       * figure 1 m in twelve seconds — which at 30 m is five screen columns, i.e. five rim cells
       * lit and five put out. Slow is not still. */
      var k = CC.reducedMotion ? 0 : 1;

      if (!this.boot) {
        /* Deferred to the first update because init() has no camera and therefore no corridor. */
        this.boot = 1;
        for (i = 0; i < OFF_N; i++) offs[i].wait = 1.5 + i * 4.5;
      }

      /* ---- the cars --------------------------------------------------------------------------- */
      for (i = 0; i < CAR_N; i++) {
        var c = cars[i];
        /* "Fill this slot in THIS tick, whatever its gap says." It is only ever set under reduced
         * motion; see the two places below and the long note on the gaps. */
        var now = 0;
        if (c.live) {
          c.x += c.vx * dt * k; c.z += c.vz * dt * k;
          var cov = carCover(c);
          var pr = project(c.x, c.z);
          var gone = 0;
          if (!pr.ok || pr.w > 78) gone = 1;
          if (i === PARKED) {
            /* The parked car retires on the AREA its cut-out blacks out, not on a distance, for
             * the reason PED_COVER_MAX gives: that is the number the luminance step is actually
             * made of, and it is correct at every grid size and fov. By the time it fires the
             * dissolve below has already taken most of the cells out one at a time. */
            if (cov > CAR_HIDE_AT) gone = 1;
            if (pr.sp > HP * 2.4 || pr.sp < -HP * 2.4) gone = 1;
            c.fade = cov <= CAR_FADE_AT ? 1
                   : (CAR_HIDE_AT - cov) / (CAR_HIDE_AT - CAR_FADE_AT);
            if (c.fade < 0) c.fade = 0;
          } else {
            /* The cruiser is retired well past the far building line — the depth test has been
             * hiding it for several metres by then, so nothing pops out of existence on screen. */
            var l = (c.axis ? c.z - c.ctr : c.x - c.ctr);
            if (l * c.go > c.chalf + 11) gone = 1;
            if (cov > CAR_HIDE_AT * 1.6) gone = 1;    // it cannot get near, but it may not slab
            c.fade = 1;
          }
          if (gone) {
            c.live = 0;
            /* The PARKED slot's gap is NOT damped by k and the cruiser's is, and that distinction
             * is the reduced-motion rule rather than a flourish: damp a timer by whatever damps
             * the thing it feeds. What retires a parked car is the CAMERA walking past it, and the
             * camera's speed is not this element's to slow (main.js:216 and control.js:265 slow the
             * walk under reduced motion, they do not stop it); what retires a cruiser is the
             * cruiser's own 9-15 m/s, which k has just taken to zero. Damping the parked gap by k
             * would leave the kerb empty for ever, and NOT damping the cruiser's would put a
             * headlamp at raw 236 in the junction permanently — the exact bug street.js's traffic
             * element documents at its own `c.wait -= dt * k`.
             *
             * AND UNDER REDUCED MOTION THE PARKED GAP IS NOT A DELAY AT ALL, it is refilled in the
             * SAME tick. That is the second half of the same rule and it is what tools/flicker-
             * rate.cjs section 4 caught: with the camera frozen the gap ran anyway, so a whole
             * patrol car — bar, roofline and road pool — SWITCHED ON mid-shot with nothing in the
             * frame having moved. Measured at seed 0 t=4.00 s, one wash cell 0 -> 78/255, and at
             * seed 555 0 -> 72/255; those were the only two non-zero steps this element produced
             * in the entire 8-bearing fixture. A frozen shot may not gain a car out of nowhere. It
             * may only lose one to the camera turning away, and then it gets the replacement in the
             * tick it lost it, so no frame is ever drawn with the gap open.
             *
             * What that refill costs where the camera IS moving (main.js still walks under reduced
             * motion, at 35% dt and 45% speed) is the same pop this element has always had at the
             * far end of the gap, only sooner: the replacement lands 30-48 m off, where the car is
             * its lightbar and nothing else — roofline and road pool both gate at 26 m — so it is
             * about eight cells, worst one 78/255. That is 30.6% of full scale against the tool's
             * 34% per-frame ceiling, and it is the cost of the arrival, not of the change of rule. */
            c.wait = i === PARKED ? 9 + hash2(i, c.n, S + 1409) * 17
                                  : (14 + hash2(i, c.n, S + 1511) * 26);
            if (CC.reducedMotion && i === PARKED) now = 1;
          }
          if (!now) continue;
        } else if (CC.reducedMotion) {
          /* THE STILL TABLEAU IS COMPOSED ONCE. `settled` is cleared on every live-motion frame and
           * set at the end of the first frozen one, so the kerb is filled on the tick reduced motion
           * comes on — including the very first tick of the run, where the old code sat on a 4 s
           * boot wait and then popped the car in at t=4.00 — and after that nothing arrives on a
           * timer. The CRUISER is deliberately not part of it: its entire content is a crossing, it
           * spawns 10 m outside the building line expecting to drive in, and frozen there it would
           * be a patrol car standing inside a facade. An absent cruiser is the honest still.
           *
           * The parked car gets no equivalent of offSettle's retry loop, and that is a measurement
           * rather than an oversight: it is placed 30-48 m straight down the corridor the camera is
           * standing in, so it clears every gate that retires it (w > 78, the cover budget, and
           * |sp| > 2.4*HP, which is 59 degrees off the view axis) by a wide margin on every bearing.
           * Checked over eight seeds x eight bearings x 12 s frozen: not one placement was culled on
           * the tick after it was made. An officer's is a real risk and is handled — see offSettle. */
          if (i === PARKED && !this.settled) now = 1;
          if (!now) continue;
        } else {
          c.wait -= dt * (i === PARKED ? 1 : k);
          if (c.wait > 0) continue;
        }
        c.n++;
        var n = c.n;
        /* One independent draw per decision, small seeds, additive salts, spread — the house rule
         * for hash2. Adjacent salts correlate up to -0.44, so the spacing is not decoration. */
        var h1 = hash2(i, n, S + 101), h2 = hash2(i, n, S + 211), h3 = hash2(i, n, S + 307),
            h4 = hash2(i, n, S + 401), h5 = hash2(i, n, S + 503), h6 = hash2(i, n, S + 701),
            h7 = hash2(i, n, S + 809);
        c.ph = hash2(i, n, S + 601);          // its own strobe phase: two cars never beat together
        c.axis = COR.axis; c.ctr = COR.ctr;
        if (i === PARKED) {
          var cw = carriage();
          var lane = cw - 1.0; if (lane < 0.85) lane = 0.85;
          var side = h2 < 0.5 ? -1 : 1;
          /* 30-48 m, in from 36-60. The far end of the old range put a parked car where nothing on
           * it can print out of the muddy band: no roofline and no wash (both gate at 26 m) and,
           * since the peaks came down to clear lensbloom, a bar that is itself marginal past 42 m.
           * A car spawned at 60 m was a dim rumour for the first twenty seconds of its life.
           * Spawning it at 30-48 puts it inside the read within a few seconds of walking, and the
           * walk is 1.6 m/s so it still arrives from a distance rather than appearing. */
          var a = COR.along + COR.dir * (30 + h1 * 18);
          c.lat = side * lane;
          c.out = -side;                       // the wash goes out across the road, never into
                                               // the building the car is parked against
          c.wl = side * COR.half;              // the building line on the car's own side
          c.x = wX(c.axis, c.ctr, a, c.lat);
          c.z = wZ(c.axis, c.ctr, a, c.lat);
          /* Parked cars face both ways along the street; which way is one independent draw. */
          var hd = (h3 < 0.5 ? 1 : -1) * COR.dir;
          c.hx = COR.axis ? hd : 0; c.hz = COR.axis ? 0 : hd;
          c.vx = 0; c.vz = 0;
          /* THE CHECKPOINT ROLL, and it is deliberately not always: a checkpoint every time makes
           * the city a cordon, and the composition is worth much more when the street has been
           * ordinary for a couple of minutes first. */
          c.chk = h4 < 0.46 ? 1 : 0;
          c.len = 4.3 + h5 * 0.5;
          c.wid = 1.82;
          c.tall = 1.40 + h6 * 0.10;
          c.cab = c.len * 0.22;
          c.fade = 1;
          c.live = 1;
        } else {
          var ca = crossAhead(city, h1);
          if (ca !== ca) { c.wait = 3.0; continue; }   // nothing crossing in range; ask again soon
          /* The CARRIAGEWAY half, not the corridor half: crossHalf reports to the building line,
           * and a lane offset taken as a fraction of that drives the car along the pavement. */
          var ch = crossHalf(city, ca) - CC.PAVE;
          if (ch < 1.7) ch = 1.7;
          c.chalf = ch;
          c.go = h2 < 0.5 ? -1 : 1;
          var a2 = ca + (ch > 1.6 ? 0.55 + h3 * (ch - 1.2) : 0) * -c.go;
          var l0 = -c.go * (COR.half + 10);
          c.x = wX(c.axis, c.ctr, a2, l0);
          c.z = wZ(c.axis, c.ctr, a2, l0);
          c.lat = l0;
          /* Fixed in the car's OWN frame, so it stays on the same side of the car for the whole
           * crossing — see the note in washRoad. Which side is one independent draw. */
          c.out = h6 < 0.5 ? 1 : -1;
          var sp2 = 9 + h4 * 6;
          c.vx = COR.axis ? 0 : c.go * sp2;
          c.vz = COR.axis ? c.go * sp2 : 0;
          c.hx = c.vx === 0 ? 0 : (c.vx > 0 ? 1 : -1);
          c.hz = c.vz === 0 ? 0 : (c.vz > 0 ? 1 : -1);
          c.len = 4.4 + h5 * 0.4;
          c.wid = 1.85;
          c.tall = 1.38 + h7 * 0.12;
          c.cab = c.len * 0.22;
          c.chk = 0;
          c.fade = 1;
          c.live = 1;
        }
      }

      /* ---- the officers ------------------------------------------------------------------------ */
      var park = cars[PARKED];
      for (i = 0; i < OFF_N; i++) {
        var o = offs[i];
        var onow = 0;                 // the same "fill it in THIS tick" flag the cars carry
        if (!o.live) {
          /* NOT damped by k, unlike the cruiser's gap above: what retires an officer is the camera
           * walking past, and damping the refill would empty the street for a reduced-motion
           * viewer and leave it empty.
           *
           * Under reduced motion the gap does not run at all and the slot is filled on the tick it
           * empties instead — same rule as the parked car above, same reason: with the camera
           * frozen nothing has changed, so nothing may appear. The countdown being FROZEN rather
           * than zeroed is what stops slot 2 churning: offSpawn declines that slot outright when
           * there is no checkpoint (it sets a 6-20 s retry), and a zeroed gap would call it again
           * on every single frame, walking o.n — and therefore every hash draw keyed on it —
           * forward sixty times a second in a shot where nothing is meant to change at all. */
          if (CC.reducedMotion) { if (!this.settled) onow = 1; }
          else o.wait -= dt;
          if (CC.reducedMotion ? !onow : o.wait > 0) continue;
          if (CC.reducedMotion) offSettle(o, i, S, city, park);
          else offSpawn(o, i, S, !this.warm, city, park);
          continue;
        }
        o.x += o.vx * dt * k; o.z += o.vz * dt * k;
        o.walked += (o.vx === 0 ? (o.vz < 0 ? -o.vz : o.vz) : (o.vx < 0 ? -o.vx : o.vx)) * dt * k;
        /* An officer posted at a car whose car has gone WALKS off, and the word is doing work: this
         * line used to set o.live = 0 on the spot, and it was the one retirement in this file that
         * was neither on screen area nor dissolved. An officer can be at OFF_COVER_MAX = 3.0% of
         * the frame at the instant its car crosses CAR_HIDE_AT, so a whole cut-out plus its lit rim
         * left in a single tick and whatever was behind it came back in that same tick. Everything
         * else here retires on area with a dissolve (cars via carCover, beat officers via
         * offCover), and now so does this: the post is dropped, the figure is handed an ordinary
         * beat's walking speed, and it leaves through the SAME area gate every other figure uses.
         * It costs nothing — it is already spawned and already moving-capable — and it removes the
         * only whole-object step in the file.
         *
         * The direction is one independent hash draw on its own salt, per the house rule, and not
         * the spawn's h1..h9: sharing one would weld which way an officer leaves to where it stood.
         * The residual step is the bar's own 12% rim modulation switching off with the car (see
         * bareLit in drawOfficer) — a tenth of a dozen cells, against a whole figure before.
         *
         * Under reduced motion the speed handed over here is multiplied by k = 0, so the figure
         * does not walk off: it stands where its checkpoint was until the camera's own approach
         * retires it on area. That is the right answer and not a leak — the alternative is a figure
         * sliding across a shot the viewer has asked to be still. */
        if (o.chk && !(park.live && park.chk)) {
          o.chk = 0;
          var away = hash2(i, o.n, S + 1607) < 0.5 ? -1 : 1;
          var wsp = 1.06 * (1 - 0.14 * wp().rain);
          o.vx = o.axis ? away * wsp : 0;
          o.vz = o.axis ? 0 : away * wsp;
        }
        if (offGone(o)) {
          o.live = 0; o.wait = 4 + hash2(i, o.n, S + 1223) * 13;
          /* Refilled in the tick it emptied, for the reason the parked car is: under reduced motion
           * the only thing that can have retired this figure is the camera, and a frame drawn with
           * the gap open would be a figure that vanished from a still shot. */
          if (CC.reducedMotion) offSettle(o, i, S, city, park);
        }
      }
      this.warm = 1;
      /* Set at the END of the update so the first frozen frame still sees 0 and fills the street;
       * cleared by every live-motion frame so that turning reduced motion off and on again composes
       * a fresh tableau rather than sitting on a stale one. */
      this.settled = CC.reducedMotion ? 1 : 0;
    },

    draw: function (frame, cam, t) {
      camScreen(frame, cam);
      /* Picked up here rather than only at init so a resized window re-scales the retirements on
       * the next frame instead of on the next rebuild; update() reads the same two back. */
      this.cols = frame.cols; this.rows = frame.rows;
      var S = this.seed, i;
      var wetR = wrel('wet');
      for (i = 0; i < CAR_N; i++) {
        var c = cars[i];
        if (!c.live || c.fade <= 0) continue;
        var pc = project(c.x, c.z);
        if (!pc.ok) continue;
        /* Read out of the shared PJ scratch NOW. carBody projects three points per slice and every
         * one of them overwrites it — testing pc.dist after the body was drawn was reading a
         * corner of the car's own shell and gating the wash on it. */
        var cdist = pc.dist;
        if (cdist > 74) continue;
        carBody(frame, c, c.fade, S);
        lightbar(frame, c, c.fade, t);
        /* The wash is what the bar is FOR, and it is also the only part of this file with area, so
         * it is bounded on both ends: a fixed sample count, and only inside WASH_D_MAX, the range
         * at which a cell of it still prints out of the muddy band. The old gate was 52 m, which
         * was twice as far as the pool can hold v 120 through the fog. */
        if (cdist < WASH_D_MAX) washRoad(frame, c, c.fade, t, wetR);
        if (i === CRUISER) carLamps(frame, c, wetR);
      }
      var park = cars[PARKED];
      for (i = 0; i < OFF_N; i++) {
        var o = offs[i];
        if (!o.live) continue;
        /* Standing in the bar's light, so the figure's rim carries a little of the bar's envelope.
         * Only for an officer that spawned at the checkpoint — a beat officer forty metres up the
         * street is lit by the sodium overhead and by nothing else. */
        var bl = (o.chk && park.live) ? barEnv(t, park.ph) : -1;   // -1 means "not lit by a bar"
        drawOfficer(frame, o, i, S, bl);
      }
    }
  });
})(typeof CC !== 'undefined' ? CC : require('../core.js'));
