/* CyberCity frontier stock — the animals and the traffic of the west. Layers 20-22.
 *
 * WHAT THIS FILE IS FOR, and it starts with something the town got wrong.
 *
 * src/elements/west_town.js builds HITCHING RAILS and WATER TROUGHS down both sides of every
 * street that has frontage behind it, and until this file existed nothing was ever tied to one or
 * drinking out of one. That is worse than not building them: a hitching rail is a piece of
 * furniture whose entire meaning is the animal that is supposed to be standing at it, so an empty
 * one does not read as "a quiet morning", it reads as a fence somebody put in the road. The city
 * has `traffic` and `pedestrians` and a cat; the frontier had walkers and a tumbleweed, and a main
 * street with no horse on it is the single most conspicuous absence in that world.
 *
 * So: three things, in descending order of how much they cost and how often they are on screen.
 *
 *   HITCHED HORSES at the rails west_town already draws. This is the expensive one, and the
 *     expense is not the drawing — it is that the horses have to stand at the rails that ACTUALLY
 *     EXIST, which means re-deriving west_town's rail lattice bit for bit. See the long note over
 *     drawHitched(). A horse standing near a rail is worse than no horse at all, because the eye
 *     goes to the pair and finds them not touching.
 *   A WAGON AND TEAM crossing the junction ahead, on the same principle street.js's `traffic`
 *     element crosses cars through the city's intersections: never coming down the camera's own
 *     street, because a vehicle bearing down on the eye turns an ambient piece into an event.
 *   A DOG crossing the road. The cheap one, and it is cheap because it reuses the same quadruped
 *     the horses are built out of at 40% scale.
 *
 * EVERYTHING HERE IS A PURE FUNCTION OF (world, t). No update(), no simulation state, nothing
 * drawn from the shared rng — the same discipline west_town.js and west_range.js's static halves
 * keep, and for the same two reasons: an element that draws from the shared stream reshuffles the
 * noise of every element initialised after it, and an element with state cannot be scrubbed to an
 * arbitrary frame by the offline harness. The wagon and the dog MOVE, and they move by being
 * evaluated at t rather than by integrating: each one owns a lattice slot with its own period, and
 * its position is a function of (t / period) modulo 1. That is what lets `node tools/headless.cjs
 * <seed> 12345 --west` put the wagon exactly where the browser would have it at frame 12345
 * without replaying twelve thousand frames first.
 *
 * ---- THE FLICKER BUDGET, WHICH DECIDED FOUR PIECES OF THE DESIGN ---------------------------------
 * tools/west-flicker.cjs gates the frontier's own moving parts against the city's, and this file
 * adds the first large moving objects that world has had. Four consequences, written down here
 * because each of them is a place where the obvious drawing is the dangerous one. Measured at
 * 160x48, six seconds, pinned camera: without this file the frontier's own elements read 0.67
 * big steps a second and 1.70% in the 3-20 Hz band; with it, and with everything below applied,
 * 1.00/s and 1.73% against the city's own 2.00/s and 1.78%. The gate is comparative with a 15%
 * tolerance and it passes on both halves, and the reduced-motion half — which is absolute, and
 * the strict one — is 0.00 on every preset.
 *
 *   THE WAGON WHEELS HAVE NO SPOKES. A spoked wheel turning is the windmill in west_town.js all
 *     over again — dark radial bars chopping whatever is behind them at several hertz, which is
 *     the textbook photosensitive trigger and which that file measured at 4.7 big steps a second
 *     against a limit of 1.0. A wheel here is a RIM and a hub, both painted, neither rotating.
 *     At the size a wagon is ever seen (a 1.45 m wheel is 6 columns across at 30 m) a spoked wheel
 *     and a plain rim are the same picture anyway, which is exactly the argument the windmill
 *     ended on.
 *   THE TEAM WALKS, IT DOES NOT TROT, and neither the dog's legs nor its body cycle. The rule this project
 *     works to is that a thing crossing a bright background must be continuous or slow; a wagon
 *     body is continuous (the cells it covers stay covered while it passes) and at 0.9-1.9 m/s it
 *     is also slow. A four-beat leg animation at character resolution is neither: it is two cells
 *     alternating between road and hide at the gait frequency, which for a trot is 2-3 Hz and
 *     lands inside the danger band with the amplitude of a full cut-out. So the legs are a fixed
 *     stance and the WHOLE ANIMAL translates. That is stiffer than life and it is the trade.
 *   THE HORSES' ONLY ANIMATION IS A WEIGHT SHIFT, at 0.08 Hz and 3.5 cm. At 12 m that is 0.23 of
 *     a screen row, so most of the time it moves nothing at all and occasionally it moves the
 *     topline by one cell. It is under the danger band by a factor of forty and it is the whole
 *     difference between an animal standing and a cardboard cut-out of one.
 *   AND THE ONE NOBODY WOULD HAVE PREDICTED: THE RIM WAS AN ALIASING BEAT. The wheel was drawn
 *     spokeless from the first line, exactly as the paragraph above says — and it still failed the
 *     gate, at 2.10% in band against a 2.05% allowance, because a ring SAMPLED IN ANGLE and
 *     rounded to cells has holes in it whose sub-cell phase moves as the wagon translates. The
 *     cells blink at a rate set by the sampling rather than by the motion, and no amount of
 *     slowing the wagon touches it. Excluding each element in turn located it exactly: without the
 *     wagon 1.24%, without the horses or the dog no change at all. The rim is now walked in SCREEN
 *     COLUMNS and is closed by construction (see wheel()), which removes the mechanism instead of
 *     tuning it, and the same measurement reads 1.73%.
 *
 *     The lesson generalises past this file: "it does not rotate" is not the same as "it does not
 *     flicker". Any thin shape rasterised by point-sampling a curve is a flicker source the moment
 *     it moves, however slowly it moves.
 *
 * ---- WHAT IS DUPLICATED FROM west_town.js, AND WHY -----------------------------------------------
 * The view/project/emit/column/beam block below, and streetSpan/paveOf/frontage/objVisible with
 * it, are west_town.js's, copied. They are copied in west_range.js too, so this is the third
 * instance and it is a real cost. It is paid because the alternative is worse in both directions:
 * an element may not reach into another element's closure, and hoisting them into core.js would
 * put a projection that MUST match src/raycast.js exactly into a file that knows nothing about
 * cameras. If raycast.js's projection ever changes, all three of these copies change with it, and
 * that sentence is the reason this paragraph exists.
 */
(function (CC) {
  'use strict';

  /* One projector per element — see src/proj.js. V and PJ are this element's own
   * basis and scratch; the four functions are closed over them. */
  var PR = CC.Proj.make(), V = PR.V, PJ = PR.PJ;
  var project = PR.project, emit = PR.emit, column = PR.column, litFace = PR.litFace;

  var P = CC.P, hash2 = CC.hash2, put = CC.put, clamp = CC.clamp;

  var G_PIPE = CC.g('|'), G_DASH = CC.g('-'), G_EQ = CC.g('='), G_DOT = CC.g('.'),
      G_TICK = CC.g('`'), G_QUOTE = CC.g("'"), G_UNDER = CC.g('_'), G_o = CC.g('o'),
      G_HASH = CC.g('#'), G_SLASH = CC.g('/'), G_BSLASH = CC.g('\\'), G_CARET = CC.g('^'),
      G_COMMA = CC.g(',');

  var CITY = null, BASE = 0, RAIL_BASE = 0, Surf = null, WEST = null;

  function boot(city) {
    CITY = (city && city.aveX && city.world === 'west') ? city : null;
    /* TWO BASES, and the split is the whole safety property of this file.
     *
     * RAIL_BASE is west_town.js's, arrived at by the identical arithmetic — imul by 40503, shift
     * 8, mask 22 bits — because every hash this file takes off it has to land on the same number
     * that file's hash took, or the horses stand at rails that are not there. It is used for
     * EXACTLY the two salts west_town spends on the rail lattice (0x61 and 0x62) and for nothing
     * else, so that the day somebody adds a prop to that lattice they can grep 0x6 and find both
     * readers.
     *
     * BASE is this file's own, off a different multiplier, and everything that is a decision of
     * THIS file — how many horses on a rail, which way one faces, when a wagon crosses — comes off
     * it. Rolling those off RAIL_BASE would have worked and would have been a trap: any new salt
     * added here could silently collide with a new salt added there and start correlating a
     * horse's head carriage with whether its rail is a rail. */
    RAIL_BASE = CITY ? ((Math.imul(CITY.seed | 0, 40503) >>> 8) & 0x3fffff) : 0;
    BASE = CITY ? ((Math.imul(CITY.seed | 0, 19477) >>> 6) & 0x3fffff) : 0;
  }

  /* ---- the view — mirrors raycast.js exactly, and west_town.js line for line ------------------- */

  /* The hour, held as three numbers because every lit cell in this file is one of them times a
   * constant. SUN is direct light (0 at night, 1 from mid-morning to mid-afternoon), LAMP is the
   * porch lanterns being on, and WARM is how orange that light is — 1 with the sun on the horizon
   * and 0 once it is properly up.
   *
   * WARM RATHER THAN SUN IS WHAT PICKS BETWEEN THE AMBER AND THE WHITE SWATCH, and that is a fix
   * rather than a preference. Measured off CC.Daylight at the six named stops, SUN reads night
   * 0.00, dawn 0.64, morning 1.00, noon 1.00, afternoon 1.00, dusk 0.64 — so it cannot tell dusk
   * from dawn OR from mid-morning, and a threshold on it printed the frontier's signature hour,
   * the one the whole of surf_west.js is built round, in daylight white. WARM can tell them
   * apart, because separating a low sun from a high one is the only thing it is for.
   *
   * The fallback is the frontier's own signature hour rather than zeroes, so a harness that never
   * loaded the daylight director still renders a horse lit the way surf_west.js's header describes
   * the world: the last twenty minutes of light. */
  var SUN = 0.64, LAMP = 1.00, WARM = 0.90;

  /* The camera basis and its four helpers live in src/proj.js — see that file for
   * why there is only one copy of them. What stays here is whatever THIS element
   * caches per frame on top of it. */
  function view(f, cam, t) {
    PR.view(f, cam, t);
    /* THE DAY CACHE, restored after the projection factoring took the body it lived in. SUN, LAMP
     * and WARM are read nine times below and were left sitting at their declared dusk defaults,
     * which meant the horses at the rails were lit by a sun that had stopped moving while the
     * street behind them was not. */
    var Dm = CC.Daylight;
    SUN = Dm ? Dm.P.sun : 0.64;
    LAMP = Dm ? Dm.P.lamp : 1.00;
    WARM = Dm ? Dm.P.warm : 0.90;
    /* The two module handles the old in-file view() used to set. They were assigned
     * inside the body that moved to src/proj.js, and leaving them null took the
     * fallback branch at every site that reads WEST — which is how a refactor that was
     * supposed to be byte-identical moved 1105 cells of a frontier frame. Resolved off
     * the painter registry rather than by CC.SurfWest's name, so an element copied into
     * another world picks up that world's painter. */
    if (!Surf) Surf = CC.Surf;
    if (!WEST) WEST = (CC.SURFACES && CC.World) ? CC.SURFACES[CC.World.id] : null;
  }






  /* ---- street geometry — west_town.js's, and it has to be ------------------------------------- */
  var SPAN = { c0: 0, c1: 0, mid: 0, w: 0 };
  function streetSpan(axis, idx) {
    var c, h;
    if (axis) { c = CITY.crossZ(idx); h = CITY.crossW(idx); }
    else      { c = CITY.aveX(idx);   h = CITY.aveW(idx); }
    SPAN.c0 = c - h; SPAN.c1 = c + h + 1;
    SPAN.mid = c + 0.5; SPAN.w = SPAN.c1 - SPAN.c0;
  }
  function wx(axis, along, cross) { return axis ? along : cross; }
  function wz(axis, along, cross) { return axis ? cross : along; }
  function paveOf(spanW) {
    var p = CC.PAVE, avail = spanW * 0.5 - 1.7;
    return avail < p ? avail : p;
  }
  function frontage(axis, a0, len, cross, dirIn) {
    var i, a, c = cross - dirIn * 0.7;
    for (i = 0; i <= 3; i++) {
      a = a0 + len * (i / 3);
      if (CITY.height(wx(axis, a, c), wz(axis, a, c)) < 2.5) return 0;
    }
    return 1;
  }
  function objVisible(axis, along, cross, near) {
    var px = wx(axis, along, cross), pz = wz(axis, along, cross);
    var rx = px - V.ox, rz = pz - V.oz;
    var w = rx * V.fwx + rz * V.fwz;
    if (w < near || w > V.far) return 0;
    var s = rx * V.rgx + rz * V.rgz, lim = w * V.hp + 14;
    if (s < -lim || s > lim) return 0;
    return w;
  }
  function nearIdx(axis) {
    return Math.round((axis ? V.oz : V.ox) / (axis ? CITY.CROSS : CITY.AVE));
  }



  /* A horizontal run along a street axis, sampled rather than projected end to end. Breaks the run
   * on a sample that fails to project and on a depth jump of more than double — both of which mean
   * the span has crossed the eye plane, and joining across either draws a rail across the sky.
   * Same reasoning, same constants, as west_town.js's. */
  function beam(f, axis, a0, a1, cross, y, ch, col, lum) {
    var n = 20, i, a, lx = -1, ly = 0, ld = 0;
    for (i = 0; i <= n; i++) {
      a = a0 + (a1 - a0) * (i / n);
      if (!project(wx(axis, a, cross), y, wz(axis, a, cross))) { lx = -1; continue; }
      var x = Math.floor(PJ.x), r = Math.floor(PJ.y), d = PJ.d;
      if (lx >= 0 && (d > ld * 2 || ld > d * 2)) lx = -1;
      if (lx >= 0) {
        var dx = x - lx, dy = r - ly;
        var steps = Math.abs(dx) > Math.abs(dy) ? Math.abs(dx) : Math.abs(dy);
        if (steps > 4 * V.cols) steps = 0;
        for (var q = 1; q < steps; q++) {
          var t2 = q / steps;
          emit(f, lx + Math.round(dx * t2), ly + Math.round(dy * t2), ch, col, lum,
               ld + (d - ld) * t2);
        }
      }
      emit(f, x, r, ch, col, lum, d);
      lx = x; ly = r; ld = d;
    }
  }

  /* ================================================================================================
   * THE QUADRUPED
   *
   * One body, three animals: a horse at a rail, a horse in the traces, a dog in the road. They
   * differ by four numbers (overall length, withers height, head carriage, tail carriage) and by
   * nothing else, which is the entire argument for the dog being the cheap third element rather
   * than chickens or a corral — it is 40% of a horse and about fifteen lines of its own.
   *
   * HOW IT IS DRAWN, and it is the house idiom for a near object with one addition. The body is a
   * BLACK CUT-OUT stamped at its true depth, exactly as street.js draws a pedestrian and for the
   * identical reason: at night the frontier's road is the darkest thing in the frame, so an animal
   * drawn as a lit shape would be the brightest object on the street and would read as a paper
   * cut-out lit from the front. What lights it is the TOPLINE — one cell per column along the back,
   * the croup and the crest of the neck, which is where a horse actually catches a low sun or a
   * porch lantern — plus whichever END faces the light.
   *
   * THE ADDITION IS THE DAYLIGHT FILL. A pure cut-out is right at dusk and wrong at noon: at high
   * sun the street behind the animal is a bright dirt road and a hole in it reads as a hole in the
   * paper, not as a horse. So above about a third of full sun the barrel fills with ember at a low
   * luminance — ember is (224,114,74), which is a bay horse to three figures — and the silhouette
   * becomes a dark warm mass instead of a void. It is a fill, not a light: it never rises far
   * enough to compete with the topline, so the shape the eye reads is still the outline.
   *
   * ---- THE PROFILE, in fractions ------------------------------------------------------------------
   * u runs 0 at the root of the tail to 1.20 at the muzzle and the animal's overall nose-to-tail
   * length is 1.20 * len, so `len` is the barrel unit and not the animal. Heights are fractions of
   * `wy`, the withers height. The numbers are a horse read off a side elevation: croup a little
   * higher than the back's dip, withers the high point of the body, belly at 55-62% of the withers
   * (a horse has a lot of daylight under it and getting that wrong makes a pony), neck leaving the
   * withers at 36% depth and tapering to a 22% muzzle.
   */
  var B = {
    x: 0, z: 0,          // the ground point under u = 0.5
    ux: 0, uz: 1,        // unit heading, tail to head
    len: 2.0, wy: 1.6,   // barrel unit (overall length is 1.2 x this) and withers height
    head: 0,             // 0 head up and alert, 1 head low and dozing
    tail: 0,             // 0 tail hangs, 1 tail carried up over the back
    lift: 0,             // metres added to every height: the weight shift, and nothing else
    fill: 0, fillLum: 0, // the daylight body fill
    rim: 0, rimLum: 0,   // the topline
    legW: 0              // 1 to draw the legs two cells wide
  };

  /* ---- WHERE THE READ ACTUALLY COMES FROM, measured on the frame rather than assumed ------------
   * A hitched horse at 15 m at 200x60 is 26 columns by 8 rows. Over that, the BARREL is flat:
   * croup 0.92, the dip in the back 0.86, withers 0.98 — 0.12 of a 1.55 m withers is 19 cm, which
   * is ONE screen row. The belly is flatter still. So the barrel contributes no shape at all, and
   * the first cut of this profile — which spent its detail there and put the head DOWN on two
   * horses in three — printed exactly what that arithmetic predicts: a 26-column dark bar with a
   * dashed line along the top, rendered and looked at on seed 3001 at dusk, and it read as a low
   * wall with legs.
   *
   * Everything legible at that size is at the ENDS. The neck and head rise 0.34 of the withers
   * above the topline, which is 53 cm and two and a half rows; the legs hang five rows below the
   * belly with a ten-column gap between the pairs; the tail closes the other end. So the profile
   * is built to spend its shape there, and head-down is now the MINORITY carriage rather than the
   * majority — a dozing horse is the commoner sight at a rail and it is also the one that throws
   * away the single most recognisable thing the animal has.
   */
  function topF(u, head) {
    if (u <= 0.72) {
      /* Barrel. Three straight runs, because the curve between them is under one screen row at
       * every size this is ever drawn at and a curve costs a multiply per rib. */
      if (u < 0.14) return 0.88 + (0.92 - 0.88) * (u / 0.14);          // tail root up to the croup
      if (u < 0.45) return 0.92 + (0.86 - 0.92) * ((u - 0.14) / 0.31); // the dip in the back
      return 0.86 + (0.98 - 0.86) * ((u - 0.45) / 0.27);               // up to the withers
    }
    var q, up, dn;
    if (u <= 1.06) {
      /* The NECK, withers to poll. Straight either way: a horse's crest is a straight line under
       * saddle-height tension, and the difference between up and down is which way it leans, not
       * how it curves. */
      q = (u - 0.72) / 0.34;
      up = 0.98 + 0.34 * q;                        // poll at 1.32, i.e. 2.05 m on a 1.55 m horse
      dn = 0.98 - 0.30 * q;                        // poll at 0.68, i.e. just above the rail
    } else {
      /* The HEAD, which tips forward off the poll in both carriages — that break is the whole
       * difference between a head and the end of a neck. */
      q = (u - 1.06) / 0.20; if (q > 1) q = 1;
      up = 1.32 - 0.12 * q;
      dn = 0.68 - 0.08 * q;
    }
    return up + (dn - up) * head;
  }
  function botF(u, head) {
    if (u <= 0.72) {
      if (u < 0.25) return 0.60 + (0.55 - 0.60) * (u / 0.25);
      return 0.55 + (0.62 - 0.55) * ((u - 0.25) / 0.47);
    }
    /* Depth under the topline: 36% of the withers where the neck leaves the shoulder, 18% at the
     * poll, thickening again to 24% at the jowl. Tapering it is what makes the neck read as a neck
     * rather than as a second barrel stuck on the front. */
    var d;
    if (u <= 1.06) d = 0.36 - 0.18 * ((u - 0.72) / 0.34);
    else { d = (u - 1.06) / 0.20; if (d > 1) d = 1; d = 0.18 + 0.06 * d; }
    return topF(u, head) - d;
  }
  /* How thick the animal is across, in metres, as a function of u. Full through the barrel and
   * tapering at both ends. Without it a horse seen end-on — which is every horse in the traces of
   * a wagon crossing straight in front of the camera — is one column wide, which is the failure
   * mode of building a solid out of a single line of ribs. */
  function wideF(u, len) {
    var k;
    if (u < 0.06) k = 0.20 + 0.08 * (u / 0.06);           // the tail root, narrowing off the rump
    else if (u <= 0.70) k = 0.28;                         // 0.56 m across a len-2.0 horse's barrel
    else k = 0.28 - 0.17 * ((u - 0.70) / 0.54);           // neck to muzzle
    /* The floor is 0.11 and not lower on purpose: a horse's head is about 22 cm across, and once
     * the taper takes it under that the head is a single column and vanishes at the exact size the
     * head is the only feature left. */
    if (k < 0.11) k = 0.11;
    return k * len;
  }

  /* ---- THE COLUMN BUFFER, AND WHY THE FIRST VERSION OF THIS FUNCTION WAS THROWN AWAY ------------
   * beast() used to walk the ribs and emit each one's bar straight into the frame, widened by the
   * animal's thickness in screen columns. Rendered and looked at, on seed 3001 at dusk: a horse at
   * 17 m printed as a 34-column dark bar four rows deep with the topline stepped through it in two
   * disconnected runs, and it read as a low wall. The cause is that a rib is a slice across the
   * BODY AXIS, and widening it by the body's thickness smears it along the SCREEN axis, so every
   * column ends up owning five ribs' worth of top edges at five different rows and the outline is
   * whichever one happened to be drawn last.
   *
   * The fix is street.js's: resolve the silhouette PER SCREEN COLUMN and only then draw it. The
   * ribs accumulate a top row, a bottom row and a depth into a per-column buffer, and the drawing
   * pass walks columns — so every column has exactly one top edge, the rim is one cell, and the
   * slope between neighbouring columns is available to pick the glyph. Same picture in principle,
   * a horse instead of a wall in practice.
   *
   * The buffers are module-level and never reallocated (an element may not allocate in draw), and
   * they are not cleared between animals either: CB_G holds a generation stamp per column and a
   * column whose stamp is stale is empty. Clearing 1024 entries per animal, with up to a dozen
   * animals on screen, is 12k writes a frame to avoid one comparison.
   *
   * KNOWN LIMIT, stated rather than guarded around: 1024 is a hard ceiling on the SCREEN COLUMN an
   * animal can occupy, not on the frame. A frame wider than 1024 cells would silently lose the
   * animals past that column — everything else in the file would keep drawing. Nothing renders
   * near that width today (400x100 is the largest fixture in the repo) and the honest fix is a
   * base offset rather than a bigger array, so it is written down here instead of half-solved. */
  var CB_N = 1024;
  var CB_TOP = new Int16Array(CB_N), CB_BOT = new Int16Array(CB_N),
      CB_D = new Float32Array(CB_N), CB_END = new Uint8Array(CB_N),
      CB_BAR = new Uint8Array(CB_N), CB_G = new Int32Array(CB_N), CB_GEN = 0;

  function beast(f) {
    var lx = B.ux, lz = B.uz;
    var px = lz, pz = -lx;                          // across the body, unit
    /* Both ends first, only to size the sampling. A rib per screen column is what stops a near
     * animal printing as a comb; more than that is overdraw the buffer would throw away anyway. */
    if (!project(B.x - lx * 0.5 * B.len, B.wy * 0.85, B.z - lz * 0.5 * B.len)) return;
    var sx0 = PJ.x;
    if (!project(B.x + lx * 0.7 * B.len, B.wy * 0.85, B.z + lz * 0.7 * B.len)) return;
    var span = PJ.x - sx0; if (span < 0) span = -span;
    var n = (span + 4) | 0; if (n < 8) n = 8; if (n > 140) n = 140;

    /* WHICH END IS LIT. A flank is never lit here — it stays a cut-out whatever the sun is doing,
     * because the silhouette is the whole read and a lit broadside turns the animal straight back
     * into a cardboard cut-out lit from the front. What does get light is the END facing the sun:
     * the rump when the light is behind it, the face and chest when it is in front. The rump gets
     * the wider band of the two because it IS wider — a horse's quarters are the biggest single
     * curved surface on it and a head is a wedge. */
    var rumpL = litFace(-lx, -lz), chestL = litFace(lx, lz);
    var endLit = rumpL > chestL ? 0 : 1;
    var endStr = (rumpL > chestL ? rumpL : chestL) * SUN;

    CB_GEN++;
    var lo = 1e9, hi = -1e9;
    var i, u, y0, y1, wxp, wzp, cx, rt, rb, dd, hw, r, q;
    for (i = 0; i <= n; i++) {
      u = -0.06 + 1.32 * (i / n);            // the tail root at -0.06 to the muzzle at 1.26
      y0 = topF(u, B.head) * B.wy + B.lift;
      y1 = botF(u, B.head) * B.wy + B.lift;
      wxp = B.x + lx * (u - 0.5) * B.len; wzp = B.z + lz * (u - 0.5) * B.len;
      if (!project(wxp, y0, wzp)) continue;
      cx = PJ.x; rt = Math.floor(PJ.y); dd = PJ.d;
      if (!project(wxp, y1, wzp)) continue;
      rb = Math.floor(PJ.y);
      if (rb < rt) { r = rt; rt = rb; rb = r; }
      hw = wideF(u, B.len) * 0.5 * V.colK / dd;
      if (hw > 20) hw = 20;
      var q0 = Math.round(cx - hw), q1 = Math.round(cx + hw);
      if (q0 < 0) q0 = 0;
      if (q1 > V.cols - 1) q1 = V.cols - 1;
      if (q1 >= CB_N) q1 = CB_N - 1;
      var isEnd = endStr > 0.30 &&
                  ((endLit === 0 && u < 0.11) || (endLit === 1 && u > 1.02));
      var isBar = u > 0.02 && u < 0.74;
      for (q = q0; q <= q1; q++) {
        if (CB_G[q] !== CB_GEN) {
          CB_G[q] = CB_GEN; CB_TOP[q] = rt; CB_BOT[q] = rb; CB_D[q] = dd;
          CB_END[q] = 0; CB_BAR[q] = 0;
        } else {
          if (rt < CB_TOP[q]) CB_TOP[q] = rt;
          if (rb > CB_BOT[q]) CB_BOT[q] = rb;
          if (dd < CB_D[q]) CB_D[q] = dd;
        }
        if (isEnd) CB_END[q] = 1;
        if (isBar) CB_BAR[q] = 1;
        if (q < lo) lo = q;
        if (q > hi) hi = q;
      }
    }
    if (hi < lo) return;

    var el = 24 + 82 * endStr, elCol = WARM > 0.45 ? P.amber : P.white;
    var headEnd = (lx * V.rgx + lz * V.rgz) > 0 ? hi : lo;
    for (q = lo; q <= hi; q++) {
      if (CB_G[q] !== CB_GEN) continue;
      rt = CB_TOP[q]; rb = CB_BOT[q]; dd = CB_D[q];
      for (r = rt; r <= rb; r++) emit(f, q, r, G_HASH, B.fill, B.fillLum, dd);

      /* The lit end, filled DOWN from the topline rather than outlined: a rump is a big round
       * surface and what makes it read is mass, not a line round it. Two thirds of the column, so
       * the belly stays dark and the animal keeps a bottom edge. */
      if (CB_END[q] && el >= 5) {
        var eb = rt + (((rb - rt) * 0.66) | 0);
        for (r = rt + 1; r <= eb; r++)
          emit(f, q, r, G_o, elCol, el * (r === rt + 1 ? 1 : 0.60), dd * 0.988);
      }

      /* THE TOPLINE. One cell per column, and the glyph comes off the slope for the reason
       * street.js gives for a coat's hem: a diagonal edge drawn one dash per column is a dotted
       * line wherever it falls faster than a row per cell, and a horse's croup and the crest of
       * its neck are exactly that. Dashes read as an edge, slashes read as a slope. */
      if (B.rimLum >= 4) {
        var gl = G_DASH, drop = 0;
        if (q > lo && CB_G[q - 1] === CB_GEN) drop = rt - CB_TOP[q - 1];
        if (drop > 1) gl = G_BSLASH;
        else if (drop < -1) gl = G_SLASH;
        /* The head takes a round `o` for the same reason a pedestrian's crown does: it is reading
         * a curve rather than an edge, and it is the last feature left when the animal is six rows
         * tall. WHICH end of the buffer the head is at depends on which way the animal is facing
         * ACROSS THE SCREEN, so it comes off the heading projected onto the camera's right axis —
         * not off u, which has no idea where the camera is. */
        if (q === headEnd) gl = G_o;
        emit(f, q, rt, gl, B.rim, B.rimLum, dd * 0.988);

        /* THE UNDERLINE, and it is the cheapest legibility this file buys. The barrel is four
         * rows deep at 15 m and the legs start where it ends, so with only a topline the mass and
         * the legs run together into one column of dark and the animal has no bottom. One dim `_`
         * on the belly row of the barrel columns gives it one, at a fifth of the topline's
         * brightness so it can never compete with it — the same argument street.js makes for a
         * car's sill against its roofline. Barrel only: a neck has no underline worth drawing and
         * a line under the head turns it into a beard. */
        if (CB_BAR[q] && B.rimLum >= 12)
          emit(f, q, rb, G_UNDER, B.rim, B.rimLum * 0.22, dd * 0.988);
      }
    }

    /* ---- legs, tail --------------------------------------------------------------------------
     * Four legs at a fixed stance. See the flicker note in the header: a gait cycle at this cell
     * size is two cells alternating between road and hide at 2-3 Hz, which is inside the band the
     * project refuses outright, so what moves is the whole animal and never its parts.
     *
     * The pairs stand 16 cm either side of the centreline on a full-sized horse — the lateral
     * offset is a fraction of B.len, so it scales with the animal and a dog gets 6 cm, which is a
     * dog's chest. Seen broadside the near and far leg of a pair land in the same column and the
     * second draw costs nothing; seen at an angle they separate, and that is most of what says
     * four legs rather than two. Where they sit ALONG the barrel is the next comment. */
    var lat, uL, k2;
    for (k2 = 0; k2 < 4; k2++) {
      /* 0.66 and 0.10 rather than 0.62 and 0.13: pushing the pairs apart to 56% of the barrel puts
       * ten columns of daylight between them at 15 m, and that gap is what says four legs. Closer
       * together they merge into one dark pillar under the middle of the animal, which is a trestle
       * rather than a horse. */
      uL = (k2 < 2) ? 0.66 : 0.10;
      lat = (k2 & 1) ? 0.16 : -0.16;
      column(f, B.x + lx * (uL - 0.5) * B.len + px * lat * B.len * 0.5,
             B.z + lz * (uL - 0.5) * B.len + pz * lat * B.len * 0.5,
             0, botF(uL, B.head) * B.wy + B.lift + 0.04,
             G_PIPE, B.fill, B.fillLum, B.legW);
    }
    /* The tail. Hanging is a horse standing still; carried up is the dog. One column either way,
     * and it is the cell that turns a four-legged lump into an animal — the same job street.js's
     * cat gets out of a single kicked-up cell behind it. */
    var tx = B.x - lx * 0.56 * B.len, tz = B.z - lz * 0.56 * B.len;
    if (B.tail > 0.5)
      column(f, tx, tz, topF(0.02, B.head) * B.wy + B.lift,
             (topF(0.02, B.head) + 0.30) * B.wy + B.lift, G_QUOTE, B.rim, B.rimLum * 0.7, 0);
    else
      column(f, tx, tz, 0.30 * B.wy + B.lift, topF(0.02, B.head) * B.wy + B.lift,
             G_PIPE, B.fill, B.fillLum, 0);
  }

  /* How the light of the hour lands on a hide. One place, because a hitched horse, a wagon team
   * and a dog have to agree — and because at night the answer is not "dimmer", it is a DIFFERENT
   * LIGHT: a horse at a rail after dark is a silhouette with a porch lantern's warm edge along its
   * back, not a grey horse. */
  function hideLight() {
    /* Topline. Sun-driven by day, lamp-driven after it, and the two terms are cross-faded rather
     * than added so that dusk — when both the sun and the lanterns are up — does not read brighter
     * than noon. The lamp term is 72 and not lower: rendered at --time=night and looked at, at 44
     * the whole animal was a row of faint dashes on a black street and the only cell of it anybody
     * could find was the `o` on the poll. A horse standing under a porch lantern is two metres from
     * the brightest object in the world; 102 at full dark is still well under west_town's lit
     * timber at 96 plus its flame at 236, so the hierarchy of the street is unchanged. */
    B.rimLum = 30 + 128 * SUN + (1 - SUN) * (72 * LAMP);
    B.rim = WARM > 0.45 ? P.amber : P.white;
    /* The fill. Nothing below a third of full sun — after that the body is a true cut-out, which
     * is the world's own idiom and also the cheapest thing in this file. It tops out at 46 against
     * a topline of 158, i.e. a bit over a quarter of it, and that ratio is the whole point rather
     * than a spare number: the first cut ran the fill at 40 against a dusk topline of 128 and the
     * horse printed as a solid orange slab with a line on top, because at three to one the eye
     * reads the MASS and not the outline. The shape of this animal lives in its edges — the crest
     * of the neck, the underline, the gap between the leg pairs — so the fill has to be enough to
     * say "there is a body here" and not enough to be looked at. */
    B.fill = P.ember;
    B.fillLum = SUN > 0.33 ? (12 + 34 * (SUN - 0.33) / 0.67) : 0;
  }

  /* ================================================================================================
   * HITCHED HORSES — layer 20
   *
   * ---- THE RAIL LATTICE, AND WHY IT IS COPIED RATHER THAN COMPUTED ---------------------------------
   * Everything from `lo` to the `kind < 0.52` test below is west_town.js's drawStreetProps, walked
   * again with the same salts off the same base. Not similar: the same. RAIL_PITCH is 15.0 there
   * and here; the slot gate is hash2(k, idx*2+s, RAIL_BASE + 0x61) > 0.62 there and here; the
   * jitter along the street is that same hash times 9 there and here; the cross-offset is
   * paveOf(SPAN.w) + 0.15 in from the building face there and here; the frontage probe is 5.2 m
   * there and here; and the object at the slot is a rail only when hash2(k, idx*2+s, RAIL_BASE +
   * 0x62) < 0.52 — the other 48% are troughs and barrels and nothing may be tied to those.
   *
   * That is a fragile coupling and it is the correct one. The alternatives were both worse: having
   * west_town publish a list of rails means allocating one per frame in an element that is
   * forbidden to allocate, and having this file place its own rails means two rails per slot.
   * A horse that is not standing at a rail is worse than no horse, because the eye finds the pair
   * and finds them not touching, so the coupling is where the risk belongs. If the lattice in
   * west_town.js moves, this moves with it or the horses come untied.
   *
   * ---- WHICH WAY A HORSE FACES ---------------------------------------------------------------------
   * At the rail, and that means ACROSS the street rather than along it: the reins are tied to the
   * bar, so the animal's nose is over it and its body runs out into the road. From a camera walking
   * down the middle of the street that is close to broadside, which is the silhouette worth having
   * — a horse seen from directly behind is a rump and four legs and reads as a barrel.
   *
   * It costs something and the cost is written down here rather than hidden: the rump ends up 2.5 m
   * out from the kerb, which on the frontier's widest avenues (19 m) is comfortably inside the
   * carriageway and on its narrowest cross streets (7 m) is about 80 cm past the centreline. A
   * horse tied on a narrow side street therefore stands in the middle of it. That is what happens
   * on a narrow street and it is better than the alternative, which is a horse standing in the
   * boardwalk.
   */
  var RAIL_PITCH = 15.0;

  function drawHitched(f, axis, idx) {
    streetSpan(axis, idx);
    var pave = paveOf(SPAN.w);
    var lo = Math.floor(((axis ? V.ox : V.oz) - 48) / RAIL_PITCH);
    var hi = Math.floor(((axis ? V.ox : V.oz) + 48) / RAIL_PITCH);

    for (var s = 0; s < 2; s++) {
      var face = s ? SPAN.c1 : SPAN.c0, dirIn = s ? -1 : 1;
      var edge = face + dirIn * (pave + 0.15);
      /* Which way the rail runs in world axes, so a horse can be turned to face it. dirIn points
       * from the building line toward the middle of the road, so the horse's heading is -dirIn. */
      var hx = axis ? 0 : -dirIn, hz = axis ? -dirIn : 0;

      for (var k = lo; k <= hi; k++) {
        var h0 = hash2(k, idx * 2 + s, RAIL_BASE + 0x61);
        if (h0 > 0.62) continue;
        var along = k * RAIL_PITCH + h0 * 9;
        if (!objVisible(axis, along, edge, 0.8)) continue;
        if (!frontage(axis, along, 5.2, face, dirIn)) continue;
        var kind = hash2(k, idx * 2 + s, RAIL_BASE + 0x62);
        if (kind >= 0.52) continue;                       // a trough or a barrel: nothing to tie to
        var L = 3.6 + kind * 3.2;

        /* A rail holds one to three, weighted 70/24/6. Three is a busy morning outside a saloon
         * and one is the rest of the day, and the weighting is not only about how busy the town
         * looks: horses are spaced ALONG the rail, the rail runs along the street, and the camera
         * walks down the street — so two horses on one rail are two horses one behind the other in
         * depth, at almost the same screen position and almost the same size. Rendered and looked
         * at at 15 m, a pair read as one horse with a confusion of extra legs. They separate
         * properly only when the street is seen at an angle, which is why a pair is worth having at
         * all and why it is a quarter of the rolls rather than half. */
        var occ = hash2(k, idx * 2 + s, BASE + 0x11);
        var nH = occ < 0.70 ? 1 : (occ < 0.94 ? 2 : 3);

        for (var j = 0; j < nH; j++) {
          var a = along + 0.72 + j * 1.45;
          if (a > along + L - 0.5) break;                  // ran out of rail
          var hA = hash2(k * 5 + j, idx * 2 + s, BASE + 0x12);
          var hB = hash2(k * 5 + j, idx * 2 + s, BASE + 0x13);
          /* The horse's body centre. 1.50 m out from the rail puts the muzzle within about 10 cm
           * of the bar at u = 1.20, which is where the reins are. */
          var cross = edge + dirIn * 1.50;
          var w = objVisible(axis, a, cross, 0.9);
          if (!w) continue;

          B.x = wx(axis, a, cross); B.z = wz(axis, a, cross);
          B.ux = hx; B.uz = hz;
          B.len = 1.92 + hA * 0.22;                        // 2.30-2.57 m nose to tail
          B.wy = 1.52 + hB * 0.16;                         // 1.52-1.68 m at the withers
          /* ONE HORSE IN THREE dozes with its head low, and it used to be two in three. The
           * dozing posture is the commoner sight at a rail and it is also the one that puts the
           * muzzle down on the bar, which is the thing being illustrated — but see the note over
           * topF(): the raised head and neck are the only feature this animal has that is more
           * than a row tall at street distance, and a street of horses that have all put theirs
           * down is a street of dark bars. One in three keeps the posture and keeps the read. */
          B.head = hA < 0.34 ? 1 : 0;
          B.tail = 0;
          /* THE WEIGHT SHIFT, and it is the only animation a hitched horse gets. 3.5 cm at 0.08 Hz
           * with a per-horse phase, so a row of three at a rail are never in step — which is the
           * whole of what makes them read as three animals rather than one drawn three times. At
           * 12 m it is 0.23 of a screen row, so on most frames it moves nothing and occasionally
           * it lifts the topline by a cell. Forty times under the flash band, and frozen outright
           * under reduced motion rather than slowed, because a 0.08 Hz motion slowed further is a
           * motion nobody could see anyway. */
          B.lift = CC.reducedMotion ? 0
                 : 0.035 * Math.sin(V.t * 0.50 + (hA + hB) * 6.283);
          B.legW = w < 16 ? 1 : 0;
          hideLight();
          beast(f);

          /* THE REIN, and it is what actually ties the animal to the furniture. The horse's
           * muzzle sits 10 cm off the bar horizontally — the whole placement above is built so
           * that it does — so the gap the eye sees is VERTICAL: a head-up horse's mouth is at
           * 2.05 m and the bar is at 1.06, which is five screen rows at 15 m. A short horizontal
           * tick between them, which is what this was first, bridged none of that and read as a
           * speck of grit on the nose. A dropped line does bridge it, and a rein dropping from a
           * bit to a rail is a vertical line in life too.
           *
           * Dim, at a third of the topline, and only inside 15 m: any brighter or any further and
           * a thin bright vertical under a horse's head is another veranda post. */
          if (w < 15) {
            var muzz = topF(1.16, B.head) * B.wy - 0.10;
            var mc = cross - dirIn * 1.30;                 // just behind the muzzle, at the throat
            var rx2 = wx(axis, a, mc), rz2 = wz(axis, a, mc);
            /* Drawn with its own depth bias rather than through column(), and that is not a
             * flourish either: the rein hangs in the same world column as the horse's throat, so
             * at the throat's own depth every cell of it TIES with the body already stamped there
             * and CC.put wants a strict improvement. Written the obvious way it was in the buffer
             * and absent from the picture — the same failure street.js records for every rim light
             * it draws on its own silhouettes. */
            if (muzz > 1.16 && project(rx2, muzz, rz2)) {
              var rcx = Math.floor(PJ.x), rr0 = Math.floor(PJ.y), rdd = PJ.d;
              if (project(rx2, 1.04, rz2)) {
                var rr1 = Math.floor(PJ.y), rr;
                for (rr = rr0; rr <= rr1; rr++)
                  emit(f, rcx, rr, G_QUOTE, B.rim, B.rimLum * 0.34, rdd * 0.97);
              }
            }
          }
        }
      }
    }
  }

  /* ================================================================================================
   * THE WAGON AND TEAM — layer 22
   *
   * Built on street.js's `traffic`, whose two structural decisions are taken over whole:
   *
   *   IT CROSSES A JUNCTION AHEAD, never comes down the camera's own street. traffic's comment is
   *     the reason and it holds here twice over — "a car bearing down on the eye would turn an
   *     ambient piece into an event" — and out here the event would be worse, because a team of
   *     horses filling the street is the most dramatic thing either world can draw.
   *   OCCLUSION IS FREE. The corner buildings are already in the depth buffer, so the wagon simply
   *     is not there until it enters the junction mouth and is gone again when it leaves. Nothing
   *     has to cull it and nothing pops.
   *
   * WHAT IS DIFFERENT is that it has no state. traffic keeps two car records and integrates them;
   * this evaluates a position from t. Each junction owns a period T and a phase offset, both hashed
   * off the street index, and the wagon walks an 80 m stretch of the crossing street centred on the
   * junction once per period. The direction is hashed off the CYCLE NUMBER as well as the index, so
   * successive wagons through the same junction do not all go the same way — that is the one thing
   * a stateless crossing loses for free and it costs one hash to get back.
   *
   * The speed falls out of the geometry rather than being chosen: 80 m in 42-86 s is 0.9-1.9 m/s,
   * which is a team at a walk, which is what a loaded wagon does. That it is also comfortably on
   * the safe side of the flicker rule is the happy part of the arithmetic and not the reason for it.
   */
  var COR = { axis: 0, ctr: 0, along: 0, dir: 1 };

  /* Which corridor the camera is standing in — street.js's corridor(), reduced to the four fields
   * this file reads. Avenues run along +z and cross streets along +x; standing in a junction both
   * are true, so the tiebreak is which way the camera is looking. This has to agree with
   * raycast.configureFor or the wagon crosses a junction the frame is not looking at. */
  function corridor() {
    var k = Math.round(V.ox / CITY.AVE), m = Math.round(V.oz / CITY.CROSS);
    var aC = 0, aW = 0, cC = 0, cW = 0, bA = 1e18, bC = 1e18, i, c, d;
    for (i = k - 1; i <= k + 1; i++) {
      c = CITY.aveX(i) + 0.5; d = V.ox - c; if (d < 0) d = -d;
      if (d < bA) { bA = d; aC = c; aW = CITY.aveW(i) + 0.5; }
    }
    for (i = m - 1; i <= m + 1; i++) {
      c = CITY.crossZ(i) + 0.5; d = V.oz - c; if (d < 0) d = -d;
      if (d < bC) { bC = d; cC = c; cW = CITY.crossW(i) + 0.5; }
    }
    var afz = V.fwz < 0 ? -V.fwz : V.fwz, afx = V.fwx < 0 ? -V.fwx : V.fwx;
    if (bC <= cW && (bA > aW || afx > afz)) {
      COR.axis = 1; COR.ctr = cC; COR.along = V.ox; COR.dir = V.fwx < 0 ? -1 : 1;
    } else {
      COR.axis = 0; COR.ctr = aC; COR.along = V.oz; COR.dir = V.fwz < 0 ? -1 : 1;
    }
  }

  /* A wheel. A RIM and a hub, and NO SPOKES — see the header; this is the windmill lesson applied
   * before it could be re-learned. It does not rotate either, which means no cell of it ever
   * alternates with what is behind it for any reason except the wagon moving past.
   *
   * Painted rather than cut out, because a wheel is open: there is nothing behind the rim to
   * remove, and a black disc where a wheel should be is a wheel with a board nailed over it. Pale,
   * because a wagon wheel is unpainted ash and it is the one part of the vehicle that catches
   * light from every angle at once. */
  function wheel(f, px, pz, cy, rad, col, lum) {
    if (!project(px, cy, pz)) return;
    var x = Math.floor(PJ.x), y = Math.floor(PJ.y), d = PJ.d;
    var rw = rad * V.colK / d, rh = rad * V.scale / d;
    if (rw < 1.1 || rh < 0.8) {
      /* Too small for a ring: two cells at the hub. Drawing a one-cell "circle" is what makes a
       * distant wagon look like it is on skids. */
      emit(f, x, y, G_o, col, lum, d);
      emit(f, x, y + 1, G_COMMA, col, lum * 0.6, d);
      return;
    }
    /* ---- THE RIM IS WALKED IN COLUMNS, NOT IN ANGLE, AND THAT IS A FLICKER FIX -----------------
     * The first version stepped a fixed number of angles round the ellipse and rounded each one to
     * a cell. That is a ring with HOLES in it whose sub-cell phase changes as the wagon translates,
     * so a given cell goes on, off, on, off as the wheel slides past by fractions of a column — an
     * aliasing beat whose rate is set by the sampling, not by the motion, and it lands wherever it
     * likes. Measured on tools/west-flicker.cjs at 160x48, seed 3, `squall`, with the wagon element
     * excluded and included: the frontier's own 3-20 Hz worst went 1.24% -> 2.10% against a gate of
     * 2.05%, and the worst cell was on the road at the wheels' own height. Excluding the horses or
     * the dog instead moved nothing. The wheel was the whole of it.
     *
     * Walking COLUMNS removes the mechanism rather than tuning it. For each column the top and
     * bottom arcs are evaluated at both of its edges and the rows BETWEEN those two values are
     * filled, so the ring is closed by construction at any radius: no holes to shift, no sampling
     * rate to beat against the translation, and the cells the rim occupies stay occupied while it
     * passes, which is the rule this project applies to anything crossing a bright background.
     * It is also cheaper — two short runs per column instead of forty rounded transcendentals.
     *
     * The bottom of the rim is dimmed: it is in the wagon's own shadow and lying on the road, and
     * a ring that is equally bright all the way round reads as a hoop rolling on nothing. */
    var iw = Math.ceil(rw); if (iw > 26) iw = 26;
    var i, r;
    for (i = -iw; i < iw; i++) {
      var u0 = i / rw, u1 = (i + 1) / rw;
      if (u0 < -1) u0 = -1; if (u0 > 1) u0 = 1;
      if (u1 < -1) u1 = -1; if (u1 > 1) u1 = 1;
      var a0 = Math.sqrt(1 - u0 * u0) * rh, a1 = Math.sqrt(1 - u1 * u1) * rh;
      var t0 = Math.round(y - a0), t1 = Math.round(y - a1);
      if (t1 < t0) { r = t0; t0 = t1; t1 = r; }
      /* A run more than a cell tall is the near-vertical side of the rim and takes a pipe; a run
       * one cell tall is the top or the bottom of it and takes a dash. Same edge-versus-slope
       * argument street.js makes for a coat's hem. */
      var g = (t1 - t0) > 1 ? G_PIPE : G_DASH;
      for (r = t0; r <= t1; r++) emit(f, x + i, r, g, col, lum, d * 0.99);
      var b0 = Math.round(y + a0), b1 = Math.round(y + a1);
      if (b1 < b0) { r = b0; b0 = b1; b1 = r; }
      g = (b1 - b0) > 1 ? G_PIPE : G_DASH;
      for (r = b0; r <= b1; r++) emit(f, x + i, r, g, col, lum * 0.45, d * 0.99);
    }
    emit(f, x, y, G_o, col, lum * 0.7, d * 0.99);
  }

  var WAG_SPAN = 40.0;                 // half the stretch of crossing street a wagon walks, metres

  function drawWagons(f) {
    corridor();
    var wA = 1 - COR.axis;                                  // the family the wagon drives on
    var period = wA ? CITY.CROSS : CITY.AVE;
    var i0 = Math.round(COR.along / period), m;

    for (m = i0 - 3; m <= i0 + 3; m++) {
      var jc = (wA ? CITY.crossZ(m) : CITY.aveX(m)) + 0.5;  // the junction, along the camera's street
      var ahead = (jc - COR.along) * COR.dir;
      /* 11 m is inside the near frontage and 78 m is past where a wagon is four cells tall. The
       * near end matters more than the far: a team arriving at 6 m would fill the frame. */
      if (ahead < 11 || ahead > 78) continue;

      var T = 42 + hash2(m, wA, BASE + 0x21) * 44;
      var uu = V.t / T + hash2(m, wA, BASE + 0x22);
      var cyc = Math.floor(uu), ph = uu - cyc;
      /* REDUCED MOTION PINS THE PHASE RATHER THAN SLOWING IT. Slowing a t-pure cycle means
       * multiplying t, which does not calm the wagon so much as reschedule it — it would still
       * cross, just later, and a viewer who asked for less motion would get the same crossing at
       * one twelfth speed spread over ten minutes. Pinned at 0.44 the team is standing in the
       * junction mouth, which is a picture rather than an absence. */
      if (CC.reducedMotion) ph = 0.44;
      var go = hash2(m, cyc, BASE + 0x23) < 0.5 ? -1 : 1;
      var off = (ph * 2 - 1) * WAG_SPAN * go;               // 0 is the middle of the junction

      streetSpan(wA, m);
      /* The lane, offset AGAINST the direction of travel so that two wagons on the same street in
       * successive cycles are not in the same ruts. Clamped to the carriageway the raycaster
       * actually paints: paveOf() is the boardwalk and driving on it is what happens if the offset
       * is taken off the full span, which is the bug street.js records in `crossHalf`. */
      var road = SPAN.w * 0.5 - paveOf(SPAN.w);
      if (road < 1.7) road = 1.7;
      var lane = road * 0.42; if (lane > 1.5) lane = 1.5;
      var cross = SPAN.mid - go * lane;
      var aw = COR.ctr + off;                               // the wagon's position along its street

      var w = objVisible(wA, aw, cross, 2.0);
      if (!w) continue;
      drawWagon(f, wA, aw, cross, go, m, cyc);
    }
  }

  /* The vehicle itself. A flat bed, two big wheels and one small pair, a seat, a driver, a tongue
   * and a pair in the traces — drawn back to front along its own axis so nothing has to be sorted.
   * Every dimension is a real farm wagon: 3.2 m bed on a 1.02 m deck, 1.45 m rear wheels, 1.00 m
   * front wheels (small so they can turn under the bed, which is why a wagon has two sizes and a
   * cart has one). */
  function drawWagon(f, axis, a, cross, go, m, cyc) {
    var rear = a - go * 1.6, front = a + go * 1.6;
    /* WHICH SIDE OF THE BED THE CAMERA IS ON, and it is worth taking the four lines rather than
     * guessing. A wagon's sideboard is the biggest flat face on it — 3.2 m by 46 cm of planking —
     * and it is the one surface that can be LIT rather than cut out, which at this cell size is
     * the difference between a vehicle and a gap in the road. But which of the two long faces is
     * showing is a fact about the camera, not about the sun: the first cut took the brighter of
     * the two and painted that, which lights the near side off the far side's normal and puts a
     * sunlit board on a wagon the sun is behind. So the normal is picked by which way the camera
     * is, and THEN handed to the same litFace() every facade in this world uses. */
    var wcx = wx(axis, a, cross), wcz = wz(axis, a, cross);
    var nx = axis ? 0 : 1, nz = axis ? 1 : 0;
    if (nx * (V.ox - wcx) + nz * (V.oz - wcz) < 0) { nx = -nx; nz = -nz; }
    var side = litFace(nx, nz);
    var boardLum = (14 + 92 * side * SUN + 26 * LAMP * (1 - SUN)) | 0;
    var boardCol = WARM > 0.45 ? P.amber : P.white;

    /* THE BED, and it is a LIT SLAB rather than a cut-out with a line on top. Everything else in
     * this file is a cut-out because everything else in this file is an animal, and an animal at
     * character resolution is an outline; a wagon is a box of planed timber standing side-on to
     * the street, and rendered as a black box with a bright cap rail — looked at, seed 3001 frame
     * 1600 at dusk — it was a hyphen floating over a hole. Painted at 55% of the cap rail's value
     * it is a horizontal mass with a bright top edge, which is what a wagon bed is, and the cap
     * rail still reads as the edge because it is nearly twice as bright as the board under it.
     *
     * The underside stays a cut-out. There is nothing under a wagon but shadow and the road. */
    var deck = 1.02, capY = 1.48;
    var n = 26, i;
    for (i = 0; i <= n; i++) {
      var aa = rear + (front - rear) * (i / n);
      column(f, wx(axis, aa, cross), wz(axis, aa, cross), deck, capY - 0.06,
             G_HASH, boardCol, boardLum * 0.55, 0);
      column(f, wx(axis, aa, cross), wz(axis, aa, cross), deck - 0.20, deck,
             G_HASH, P.shadow, 0, 0);
    }
    beam(f, axis, rear, front, cross, capY, G_EQ, boardCol, boardLum);

    /* The seat, up at the front over the fore-carriage, and the driver on it. The driver is three
     * cells: a body, a hat and one lit cell on the crown. That is the same budget street.js's
     * pedestrians spend on a figure eight rows tall, and it is enough because a shape sitting where
     * a driver sits is read as a driver by position alone. */
    var seatA = front - go * 0.42;
    column(f, wx(axis, seatA, cross), wz(axis, seatA, cross), capY, 1.72, G_HASH, P.shadow, 0, 1);
    column(f, wx(axis, seatA, cross - 0.1), wz(axis, seatA, cross - 0.1), 1.72, 2.34,
           G_PIPE, P.shadow, 0, 1);
    if (project(wx(axis, seatA, cross - 0.1), 2.36, wz(axis, seatA, cross - 0.1))) {
      var dx0 = Math.floor(PJ.x), dy0 = Math.floor(PJ.y), dd0 = PJ.d;
      emit(f, dx0, dy0, G_CARET, boardCol, boardLum * 1.2, dd0 * 0.98);
      emit(f, dx0 - 1, dy0, G_DASH, boardCol, boardLum * 0.7, dd0 * 0.98);   // the brim
      emit(f, dx0 + 1, dy0, G_DASH, boardCol, boardLum * 0.7, dd0 * 0.98);
    }

    /* The wheels. Rear pair at the back of the bed, front pair under the seat, both drawn on both
     * sides of the wagon — the far one loses the depth test against the bed at most angles and
     * costs nothing when it does. */
    var wl = 0.62;
    var rw = 0.725, fw = 0.50;
    var wheelLum = 30 + 96 * side * SUN + 30 * LAMP * (1 - SUN);
    var wheelCol = WARM > 0.45 ? P.amber : P.white;
    var rA = rear + go * 0.75, fA = front - go * 0.30;
    wheel(f, wx(axis, rA, cross - wl), wz(axis, rA, cross - wl), rw, rw, wheelCol, wheelLum);
    wheel(f, wx(axis, rA, cross + wl), wz(axis, rA, cross + wl), rw, rw, wheelCol, wheelLum * 0.7);
    wheel(f, wx(axis, fA, cross - wl), wz(axis, fA, cross - wl), fw, fw, wheelCol, wheelLum);
    wheel(f, wx(axis, fA, cross + wl), wz(axis, fA, cross + wl), fw, fw, wheelCol, wheelLum * 0.7);

    /* The tongue, running forward between the pair at swingle height. Drawn at a third of the
     * board's value — dark enough that nobody looks at it, bright enough to EXIST, and that second
     * half is the whole reason it is not a cut-out. Rendered dark and looked at, the team stood a
     * clear five columns clear of the bed with nothing between them and read as a wagon that had
     * happened to stop behind two loose horses. One dim line closes it. */
    beam(f, axis, front, front + go * 2.6, cross, 0.74, G_DASH, boardCol, boardLum * 0.34);

    /* THE LANTERN, and it is the reason this element earns its place after dark. core.js's
     * EXPOSURE ladder puts every frontier SURFACE under 0.42 gain, so a night frame out here has
     * almost nothing in the hot band; west_town.js's porch lanterns are the answer on the
     * boardwalk and this is the answer in the road. Four cells, hung on the front corner of the
     * bed, and it only exists once the lamps are on.
     *
     * It MOVES, which the porch lanterns do not, so it is worth saying why it is not a flicker
     * source: at 1.4 m/s and 30 m it crosses six columns a second, so a cell it lights is lit for
     * about a sixth of a second, ONCE, as the wagon goes by. A single pulse is not a beat, and the
     * cell is never revisited within the same crossing. */
    if (LAMP > 0.12) {
      var lanA = front - go * 0.15;
      if (project(wx(axis, lanA, cross - 0.66), capY + 0.16, wz(axis, lanA, cross - 0.66))) {
        var lx2 = Math.floor(PJ.x), ly2 = Math.floor(PJ.y), ld2 = PJ.d;
        emit(f, lx2, ly2, G_o, P.amber, 210 * LAMP, ld2 * 0.97);
        emit(f, lx2, ly2 - 1, G_DOT, P.warm, 128 * LAMP, ld2 * 0.97);
        if (ld2 < 26) {
          emit(f, lx2 - 1, ly2, G_TICK, P.warm, 90 * LAMP, ld2 * 0.97);
          emit(f, lx2 + 1, ly2, G_TICK, P.warm, 90 * LAMP, ld2 * 0.97);
        }
      }
    }

    /* THE PAIR IN THE TRACES. Rumps 0.6 m ahead of the bed, 0.55 m either side of the tongue, both
     * facing the way the wagon is going. Same beast(), same light, and the near one is drawn second
     * so it wins the depth test cleanly against the far one's legs. */
    var hx2 = axis ? go : 0, hz2 = axis ? 0 : go;
    var teamA = front + go * 2.05;
    var h;
    for (h = 0; h < 2; h++) {
      var lat2 = h ? 0.55 : -0.55;
      B.x = wx(axis, teamA, cross + lat2); B.z = wz(axis, teamA, cross + lat2);
      B.ux = hx2; B.uz = hz2;
      B.len = 1.98 + hash2(m + h, cyc, BASE + 0x24) * 0.18;
      B.wy = 1.56 + hash2(m + h, cyc, BASE + 0x25) * 0.14;
      B.head = 0;                                     // a horse in draught carries its head up
      B.tail = 0;
      B.lift = 0;                                     // the wagon's own motion is animation enough
      B.legW = objVisible(axis, teamA, cross + lat2, 0.5) < 18 ? 1 : 0;
      hideLight();
      beast(f);
    }
  }

  /* ================================================================================================
   * A DOG CROSSING THE ROAD — layer 22
   *
   * The cheap one, and it is cheap for one reason: it is beast() at 40% with the tail carried up.
   * Fifteen lines of its own against the wagon's hundred and thirty.
   *
   * It is laid out on its own along-street lattice rather than relative to the camera, which is
   * where it differs from street.js's cat and is the whole reason it needs no state. A dog belongs
   * to a PLACE — the gap between two stores where it lives — and it crosses from that place on its
   * own clock. Walking away and coming back finds the same dog crossing the same gap.
   *
   * It starts and ends 0.9 m BEHIND the building line on either side, which is street.js's trick
   * for the cat and it is worth restating: the frontage the raycaster has already painted owns
   * those cells, so the dog walks out from under a building and vanishes under the one opposite
   * instead of appearing and disappearing in the open. A slot with frontage on NEITHER side is
   * therefore skipped outright — a crossing that starts on a vacant lot has nothing to come out
   * of — and where only one side has it, that side is the side the dog starts from.
   */
  var DOG_PITCH = 31.0;

  function drawDogs(f, axis, idx) {
    streetSpan(axis, idx);
    var here = axis ? V.ox : V.oz;
    var lo = Math.floor((here - 22) / DOG_PITCH), hi = Math.floor((here + 44) / DOG_PITCH);

    for (var k = lo; k <= hi; k++) {
      /* idx*2 + axis, not idx — the SAME mistake west_town.js's rail lattice avoids by keying on
       * idx*2+s. Keyed on idx alone, avenue 5 and cross street 5 draw the identical hash and every
       * dog in the town comes in matched pairs, one on each family, at the same offset and on the
       * same clock. Caught by printing the slot rolls: idx=5 k=3 gave 0.17 on both axes. */
      var slot = idx * 2 + axis;
      var g0 = hash2(k, slot, BASE + 0x31);
      if (g0 > 0.60) continue;                     // most of the lattice never has a dog on it
      var along = k * DOG_PITCH + g0 * 22;
      /* WHICH SIDE IT COMES OUT FROM is decided by where there is something to come out from, and
       * only then by the coin. Requiring frontage on BOTH sides was the first cut and it was too
       * strong by half — over a 78 m window on six streets it left about one slot in three alive,
       * and with the duty cycle on top of that a dog appeared roughly never. */
      var f0 = frontage(axis, along - 1.0, 2.0, SPAN.c0, 1);
      var f1 = frontage(axis, along - 1.0, 2.0, SPAN.c1, -1);
      if (!f0 && !f1) continue;

      var T = 24 + hash2(k, slot, BASE + 0x32) * 26;
      var uu = V.t / T + hash2(k, slot, BASE + 0x33);
      var cyc = Math.floor(uu), ph = uu - cyc;
      /* Frozen mid-road under reduced motion, for the same reason the wagon is: a t-pure cycle
       * cannot be slowed without being rescheduled, and half a dog is better than a dog that
       * crosses once every four minutes. */
      if (CC.reducedMotion) ph = 0.11;
      if (ph > 0.26) continue;                     // the other 74% of the time it is somewhere else
      var q = ph / 0.26;

      var go = (f0 && f1) ? (hash2(k, cyc, BASE + 0x34) < 0.5 ? 1 : -1) : (f0 ? 1 : -1);
      var c0 = SPAN.c0 - 0.9, c1 = SPAN.c1 + 0.9;
      var cross = go > 0 ? c0 + (c1 - c0) * q : c1 - (c1 - c0) * q;
      var w = objVisible(axis, along, cross, 0.9);
      if (!w) continue;

      B.x = wx(axis, along, cross); B.z = wz(axis, along, cross);
      B.ux = axis ? 0 : go; B.uz = axis ? go : 0;
      B.len = 0.80; B.wy = 0.56;                   // 0.96 m nose to tail, 56 cm at the shoulder
      B.head = 0.25;                               // head level and forward, the way a dog trots
      B.tail = 1;
      /* NO BOB, AND THE HONEST VERSION OF WHY. The dog used to carry 2.5 cm of vertical bob at
       * 1.6 Hz. That is under the 3 Hz floor of the flash band, but the argument does not hold for
       * a SUB-CELL displacement: 2.5 cm at 15 m is 0.13 of a screen row, so the bob cannot move
       * the topline smoothly — it holds it on one row and then flips it to the next, which is a
       * SQUARE wave at 1.6 Hz, and a square wave's third and fifth harmonics are at 4.8 and 8 Hz,
       * both inside the band.
       *
       * SO IT WAS TAKEN OUT AND IT MADE NO MEASURABLE DIFFERENCE, and that is recorded rather than
       * quietly dropped, because the reasoning above is what a plausible fix looks like when it is
       * aimed at the wrong object. tools/west-flicker.cjs at 160x48, seed 3, `squall` read 2.10%
       * in band with the bob and 2.10% without it. Excluding whole elements in turn found the real
       * source in the wagon's wheel rim — see the note in wheel() — and fixing THAT took the same
       * measurement to 1.73%.
       *
       * The bob stays out anyway. The mechanism is real even where the amplitude turned out not to
       * matter, the dog is already translating across the road at two metres a second, and a
       * centimetre and a half of bounce was never visible at any distance this animal is drawn
       * at. */
      B.lift = 0;
      B.legW = 0;
      hideLight();
      B.rimLum *= 0.85;                            // a dog is not shiny; keep it under the horses
      beast(f);
    }
  }

  /* ---- which streets to draw ------------------------------------------------------------------
   * The same three-and-three window west_town.js walks, so the horses can only ever appear on a
   * street whose rails were drawn. */
  function eachStreet(f, fn) {
    var i;
    for (i = -1; i <= 1; i++) fn(f, 0, nearIdx(0) + i);
    for (i = -1; i <= 1; i++) fn(f, 1, nearIdx(1) + i);
  }

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

  /* 20 alongside the pedestrians, because a horse at a rail and a walker on the boardwalk are the
   * same kind of object at the same depth; 22 for the wagon and the dog, which is the layer the
   * city's own `traffic` uses and for the same reason — they are in the road, in front of
   * everything the street furniture draws. */
  CC.ELEMENTS.push(mk('west-hitched', 20, function (f) { eachStreet(f, drawHitched); }));
  CC.ELEMENTS.push(mk('west-wagon', 22, drawWagons));
  CC.ELEMENTS.push(mk('west-dog', 22, function (f) { eachStreet(f, drawDogs); }));

})(typeof CC !== 'undefined' ? CC : require('../core.js'));
