/* CyberCity control — who is driving the camera.
 *
 * The piece began as a thing you watch, and the walk in city.js is still the author of it: a route
 * down the centreline of the street, indexed by arc length, a pure function of t. Taking the keys
 * away from that and handing them to a viewer is the one change in this project that can destroy
 * the whole brief, so it is done as an ARBITRATION rather than as a replacement. The autopilot is
 * never switched off. It keeps its own clock, it keeps producing a pose every frame, and the
 * viewer's pose is cross-faded over the top of it. Let go of the keys and the fade runs the other
 * way — back onto the route at the arc length nearest to where you are standing, which is why
 * city.js grew `nearestRouteS`. Nothing is ever reset, nothing teleports, and a viewer who never
 * touches the keyboard gets byte-identical frames to the ones the headless harness renders.
 *
 * THE PITCH IS THE HORIZON. There is no pitch in the raycaster and there does not need to be: at
 * character resolution a vertical rotation is indistinguishable from sliding the horizon row, and
 * every element already reads `cam.horizon` because the caster does. So looking up at the sign
 * tops costs one number. `cam.horizonBase` is the neutral row main.js computes from the grid;
 * this file owns `cam.horizon` from then on.
 *
 * NO INPUT IN THE MODEL. `update()` reads a bag of booleans that `attach()` fills in from DOM
 * events. Offline there is no attach(), the bag stays empty, mode never leaves auto, and the
 * harness drives exactly the walk it always drove.
 *
 * THREE INPUT DEVICES, ONE BAG. Keyboard, touch and gamepad all write into K and nothing below
 * that line knows which one is talking. That is why the analogue channels are SEPARATE fields
 * rather than being folded into K.fwd/K.left: a thumb resting on a stick and a finger on a key
 * are two independent claims on the same axis, and a device that writes over another device's
 * channel produces the classic bug where letting go of a stick cancels a held key. They are
 * summed once, in update(), and the sum is magnitude-clamped rather than normalised — see the
 * note there, because normalising is what throws an analogue stick's magnitude away.
 *
 * LOOK HAS INERTIA, AND THE INERTIA IS A QUEUE, NOT A FILTER. A low-pass on the pointer delta
 * loses rotation (the tail of every flick is thrown away) and a viewer notices that as the camera
 * not going where they put it. Instead every delta is BANKED into `qYaw`, and a fraction of the
 * bank is spent each tick. Total rotation is therefore exactly the total input, only spread over
 * two or three frames; and because the bank is a queue, it is also the natural place to enforce a
 * maximum turn rate — the excess is not discarded, it just waits its turn. That cap is the one
 * thing here that exists for the viewer's stomach rather than for the feel.
 */
(function (CC) {
  'use strict';

  var clamp = CC.clamp, smooth = CC.smooth;

  var K = {                                   // the input bag; attach() writes, update() reads
    fwd: 0, back: 0, left: 0, right: 0, run: 0, crouch: 0,
    yawL: 0, yawR: 0, pitchU: 0, pitchD: 0,
    mdx: 0, mdy: 0,                           // accumulated pointer delta, consumed each tick
    tx: 0, tz: 0, trun: 0,                    // touch stick: strafe, forward, and pushed-to-run
    gx: 0, gz: 0, grun: 0,                    // gamepad left stick, same axes
    glx: 0, gly: 0,                           // gamepad right stick, as a look RATE not a delta
    any: 0,                                   // somebody is DRIVING: resets idle and takes over
    act: 0                                    // somebody is present but not driving: idle only
  };

  var mode = 0;                               // 0 auto, 1 manual
  var blend = 0;                              // 0 = pure autopilot pose, 1 = pure viewer pose
  /* The autopilot's clock is not integrated, it is OFFSET: autoT = t - autoOff, and autoOff only
   * grows while a viewer is driving. Integrating it separately drifts by a tick per tick against
   * the t the elements are given, and re-anchoring on resume then becomes an assignment to an
   * accumulator that the next frame immediately adds to. As an offset both are exact. */
  var autoOff = 0;
  var idle = 0;                               // seconds since the last input
  var IDLE_RESUME = 15;                       // ...after which the city takes itself back
  var BLEND_IN = 0.18, BLEND_OUT = 1.6;       // taking over is instant-ish; giving back is a fade

  // Viewer pose, integrated in metres and radians.
  var px = 0, pz = 0, pyaw = 0, pitch = 0, vx = 0, vz = 0, bob = 0, crouchK = 0;
  var fovT = 1.25;
  var placed = 0;                             // has the viewer pose ever been seeded from the auto one

  var WALK = 2.7, RUN = 5.8, CROUCH = 1.25;   // metres/second. Faster than the 1.6 m/s autopilot:
                                              // somebody holding a key is trying to get somewhere.
  var ACCEL = 9.0;                            // velocity smoothing, 1/s. Instant response reads as
                                              // a camera on rails rather than as a person walking.
  var MOUSE = 0.0022, KEYLOOK = 1.35;         // radians per pixel / per second
  var PADLOOK = 2.30;                         // radians/second at full right-stick deflection
  var PITCH_MAX = 0.30;                       // as a fraction of the grid height, either way

  /* The look queue. LOOK_LAG is a rate, so at 60 Hz it spends 37% of the bank per tick and the
   * whole of a flick has landed inside three frames — enough that the camera has weight, far
   * short of the ~120 ms where input latency stops reading as inertia and starts reading as a
   * broken page. YAW_MAX is the stomach: 3.1 rad/s is about 180 deg/s, which is a brisk but
   * survivable turn, and anything the viewer asks for above it is banked rather than dropped so a
   * fast flick still arrives in full, just over four frames instead of one. */
  var qYaw = 0, qPitch = 0;
  var LOOK_LAG = 22, YAW_MAX = 3.1, YAW_MAX_RM = 1.15;
  var paused = 0;                             // photo mode; main.js reads Control.paused

  /* Collision is a radius, not a point. A point slides through the diagonal gap where two
   * buildings meet at a corner, and at 5.8 m/s that gap is wide enough to walk through a block. */
  var RAD = 0.34;
  function solid(city, x, z) {
    if (!city || !city.height) return false;
    return city.height(x, z) > 0 ||
           city.height(x + RAD, z) > 0 || city.height(x - RAD, z) > 0 ||
           city.height(x, z + RAD) > 0 || city.height(x, z - RAD) > 0;
  }

  /* Axis-separated: a viewer walking into a wall at an angle slides along it instead of stopping
   * dead, which is the difference between a camera and a bumper car. */
  function move(city, nx, nz) {
    if (!solid(city, nx, pz)) px = nx;
    if (!solid(city, px, nz)) pz = nz;
  }

  function angDelta(a, b) {                   // shortest signed way round from a to b
    var d = b - a;
    while (d > Math.PI) d -= 6.283185307;
    while (d < -Math.PI) d += 6.283185307;
    return d;
  }

  /* Scratch for the autopilot pose. The autopilot writes a full camera, so it is given a private
   * one and the result is mixed into the real cam below. */
  var A = { x: 0, z: 0, yaw: 0, eyeY: 1.7, fov: 1.25 };

  function seedFromAuto() {
    px = A.x; pz = A.z; pyaw = A.yaw; vx = 0; vz = 0; placed = 1; seedWanted = 0;
    /* The pitch is seeded too, and for the same reason the yaw is: the autopilot now glances up
     * (see autoLook), so a take-over that started the viewer at pitch 0 would snap the horizon
     * back to level over the 0.18 s blend the moment somebody pressed W under a tall block. */
    pitch = apitch;
  }

  /* ---- the autopilot's own pitch ---------------------------------------------------------------
   * WHY THIS EXISTS. `cam.horizon = hb + pitch * rows * b` multiplied the whole pitch by the
   * manual-control blend, and b is 0 whenever no human is driving — so on autopilot the horizon
   * was nailed to rows*0.56 forever and a passive viewer, who is the entire audience for an
   * ambient piece, could never see the sky. Measured over the canonical 4x4 sweep at 400x100: the
   * deepest sky row was 55 in every single frame and sky was 2.1% of cells. Nine elements draw up
   * there.
   *
   * WHY IT IS DRIVEN BY THE BUILDINGS AND NOT BY A CLOCK. A camera that pans up and down on a
   * timer reads as a camera on a motor. A walker looks up when there is something above them to
   * look at, so the target is the tallest mass beside and just ahead of the autopilot pose:
   * flanking samples, because in a street canyon the height AHEAD is the road (measured: the
   * forward samples are 0 for three quarters of the walk) and the towers are to the sides. The
   * lookup is four calls to city.height per tick against the thousands the raycaster already
   * makes, and it allocates nothing.
   *
   * The result is smoothed with a time constant near two seconds, so a block edge — which is a
   * step in the height field — arrives as a glance rather than as a jerk, and it is FROZEN while
   * paused, because photo mode is a still and a horizon that keeps creeping after P is not one. */
  var apitch = 0;
  var AUTO_PITCH = 0.15;                      // fraction of the grid height at a full glance up
  var AUTO_LO = 26, AUTO_HI = 52;             // the height band that earns one; medians sit at ~22
  var AUTO_RATE = 0.55;                       // 1/s toward the target
  var SWAY = 0.025;                           // the head is never perfectly level, even level

  function autoLook(dt, city, ta) {
    var tgt = 0;
    if (city && city.height) {
      var fx = Math.sin(A.yaw), fz = Math.cos(A.yaw);
      /* Left and right of the walk at two ranges. Two ranges rather than one because a single
       * sample distance flickers on and off as the walk passes a gap between two towers. */
      var h = 0, hh;
      hh = city.height(A.x + fx * 5 + fz * 4.5, A.z + fz * 5 - fx * 4.5); if (hh > h) h = hh;
      hh = city.height(A.x + fx * 5 - fz * 4.5, A.z + fz * 5 + fx * 4.5); if (hh > h) h = hh;
      hh = city.height(A.x + fx * 13 + fz * 5, A.z + fz * 13 - fx * 5); if (hh > h) h = hh;
      hh = city.height(A.x + fx * 13 - fz * 5, A.z + fz * 13 + fx * 5); if (hh > h) h = hh;
      var u = (h - AUTO_LO) / (AUTO_HI - AUTO_LO);
      if (u < 0) u = 0; else if (u > 1) u = 1;
      tgt = smooth(u) * AUTO_PITCH;
    }
    /* Indexed on the autopilot clock, not on wall time, so scrubbing to frame 9000 gives the same
     * horizon the browser had at second 150 — the harness has to render the frame the browser
     * draws or none of the measurement in this project means anything. */
    tgt += (CC.vnoise(ta * 0.043, 1913) - 0.5) * 2 * SWAY;
    if (CC.reducedMotion) tgt *= 0.45;
    apitch += (tgt - apitch) * Math.min(1, dt * AUTO_RATE);
  }

  /* THE SEED IS DEFERRED, and this is a real bug rather than a tidy-up. takeOver() can be called
   * from a key handler, i.e. between two updates, and it used to seed the viewer pose out of A
   * there and then — but A holds LAST tick's autopilot pose, and on the very first tick after a
   * reset it holds no pose at all, just the {0,0} the object was declared with. Pressing W inside
   * the first frame of a new city therefore seeded the viewer at the corner of the map and the
   * blend flew the camera off the street at 90 m/s. So take-over only raises a flag, and the
   * seeding happens in update() at the one point where A is known to be this tick's. */
  var seedWanted = 0;

  function takeOver() {
    if (mode) return;
    mode = 1;
    vx = 0; vz = 0;
    seedWanted = 1;                           // start from exactly where the eye already is
  }

  function giveBack(city, t) {
    if (!mode) return;
    mode = 0;
    if (t === undefined) t = 0;
    /* Re-anchor the autopilot clock to the arc length nearest the viewer, so the pose it starts
     * producing is a couple of metres away rather than wherever the frozen clock left off. */
    if (city && city.nearestRouteS) {
      var sp = city.SPEED || 1.6;
      if (city.ensureRoute) city.ensureRoute(sp * (t - autoOff) + 80);
      autoOff = t - city.nearestRouteS(px, pz).s / sp;
    }
  }

  /* Dead zone, rescaled rather than subtracted: a stick that starts moving at 0.16 and jumps
   * straight to 0.16 of walking speed has a step in it you can feel through your thumb. */
  function dead(v, d) {
    if (v > d) return (v - d) / (1 - d);
    if (v < -d) return (v + d) / (1 - d);
    return 0;
  }
  var PAD_DZ = 0.16;

  /* ---- gamepad ---------------------------------------------------------------------------
   * There is no gamepad event stream worth having — the spec gives you `gamepadconnected` and
   * then expects you to POLL — so this runs from update() and writes the same K channels the
   * keyboard does. Two guards matter. The whole body is skipped when the API is absent, which is
   * what keeps Node (which has a `navigator` since 21, but never a getGamepads on it) and the
   * headless harness on the pure autopilot. And it is skipped when no pad has ever announced
   * itself: navigator.getGamepads() allocates a fresh array on every call, and paying for that
   * 60 times a second for the ~99% of viewers with no controller plugged in is exactly the kind
   * of per-frame garbage the frame path is not allowed to make. `padSeen` is set by the connect
   * event; the once-a-second probe underneath it is the fallback for a browser that fires the
   * event before we attach, or not at all. */
  var padSeen = 0, padProbe = 0;
  function pollPad(dt) {
    K.gx = 0; K.gz = 0; K.grun = 0; K.glx = 0; K.gly = 0;
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return;
    if (!padSeen) {
      padProbe -= dt;
      if (padProbe > 0) return;
      padProbe = 1;
    }
    var pads = navigator.getGamepads();
    if (!pads) return;
    for (var i = 0; i < pads.length; i++) {
      var p = pads[i];
      if (!p || !p.connected || !p.axes || p.axes.length < 2) continue;
      padSeen = 1;
      var lx = dead(p.axes[0] || 0, PAD_DZ), ly = dead(p.axes[1] || 0, PAD_DZ);
      // Stick up is -1 on axis 1, and up is forwards. The sign flip is the whole mapping.
      K.gx += lx; K.gz += -ly;
      if (p.axes.length >= 4) {
        K.glx += dead(p.axes[2] || 0, PAD_DZ);
        K.gly += -dead(p.axes[3] || 0, PAD_DZ);
      }
      var b = p.buttons;
      if (b) {
        /* Triggers are analogue on every pad worth the name and digital on the cheap ones, so
         * they are read as a value with a threshold rather than as `.pressed`; bumpers are
         * offered alongside because a viewer holding a trigger to run for a minute is a viewer
         * with a cramp. */
        for (var j = 4; j <= 7; j++) {
          var bb = b[j];
          if (!bb) continue;
          var v = typeof bb === 'number' ? bb : (bb.value !== undefined ? bb.value : (bb.pressed ? 1 : 0));
          if (v > 0.35) K.grun = 1;
        }
      }
    }
    /* Only a deflected stick counts as somebody driving. A pad sitting on a sofa with a sticky
     * axis would otherwise hold the city in manual mode forever and the walk would never resume. */
    if (K.gx || K.gz || K.glx || K.gly || K.grun) K.any = 1;
  }

  function update(dt, t, cam, city) {
    if (!(dt > 0)) dt = 1 / 60;
    var k = CC.reducedMotion ? 0.5 : 1;

    /* Before the idle bookkeeping, because a stick deflection has to be able to take the camera
     * over on the same tick a keypress would. */
    pollPad(dt);

    // ---- idle bookkeeping -------------------------------------------------------------------
    /* Two kinds of input. K.any is somebody DRIVING — a key, a thumb, a stick — and it takes the
     * camera over. K.act is somebody pressing a key that is not a control at all: H, P, F, N, a
     * weather preset. Those must reset the idle timer, because a viewer flicking through the
     * presets is plainly still there, but they must not seize the camera: changing the sky is not
     * a reason for the walk to stop. Folding both into one flag is why pressing P used to hand the
     * viewer a camera they had not asked for, standing still. */
    if (K.any || K.act) {
      idle = 0;
      if (K.any && !mode) takeOver();
      K.any = 0; K.act = 0;
    } else idle += dt;
    /* Not while paused. Photo mode is somebody holding still on purpose, and fifteen seconds of
     * holding still is exactly what the idle timer was built to punish. */
    if (mode && !paused && idle > IDLE_RESUME) giveBack(city, t);

    // ---- the autopilot always runs ----------------------------------------------------------
    /* Its clock does not run while somebody else drives. That case needs the offset: `t` is still
     * advancing, so autoOff has to advance with it for `t - autoOff` to hold still.
     *
     * IT MUST NOT ADVANCE WHILE PAUSED, and the `|| paused` that used to be here was a real bug
     * that had never executed anywhere — the browser path had no test until tools/domshim.cjs.
     * Photo mode froze the street BACKWARDS. main.js holds simT itself while paused, and it has to:
     * an element whose draw() is a pure function of t (the sky, a sign's flicker, the scanline
     * roll) would go on animating no matter how many updates were skipped. So the t arriving here
     * is ALREADY frozen, and advancing autoOff on top of a frozen t makes `t - autoOff` DECREASE
     * by dt every tick. city.camera duly walked the route in reverse at exactly its own 1.6 m/s:
     * press P on autopilot and the camera slid back down the street at walking pace, which is the
     * one thing a photo mode may not do. Freezing the pose takes one clock stopped, not two. */
    if (mode && !paused) autoOff += dt;
    if (city && city.camera) city.camera(A, city, t - autoOff);
    else { A.x = cam.x; A.z = cam.z; A.yaw = cam.yaw; A.eyeY = 1.7; }
    /* Before seedFromAuto, which copies apitch into the viewer's pitch: the glance has to be this
     * tick's for the same reason the position does. Frozen under P — see autoLook. */
    if (!paused) autoLook(dt, city, t - autoOff);
    // A is this tick's now, so a take-over raised since the last one can safely be honoured.
    if (!placed || seedWanted) seedFromAuto();

    // ---- the viewer ---------------------------------------------------------------------------
    /* Everything the devices asked for this tick, banked. K.mdx is a pixel delta and is consumed;
     * the key and stick terms are rates and are integrated. */
    /* The stick terms are SQUARED (with the sign kept), the keys are not. A key is one speed and
     * there is nothing to gain from bending it; a stick is asked to do both a slow pan across a
     * skyline and a whip round to see what is behind you, and a linear stick can only be tuned
     * for one of the two. */
    qYaw += (K.mdx * MOUSE) + (K.yawR - K.yawL) * KEYLOOK * dt +
            K.glx * (K.glx < 0 ? -K.glx : K.glx) * PADLOOK * dt;
    qPitch += (-K.mdy * MOUSE * 0.62) + (K.pitchU - K.pitchD) * KEYLOOK * 0.5 * dt +
              K.gly * (K.gly < 0 ? -K.gly : K.gly) * PADLOOK * 0.42 * dt;
    K.mdx = 0; K.mdy = 0;

    /* Spend the bank. The rate cap is applied to what is SPENT, so the remainder stays queued and
     * arrives on the following ticks — a flick of the wrist still turns you all the way round, it
     * simply cannot do it inside one frame. Reduced motion buys a much lower ceiling, because the
     * whole point of the preference is that fast whole-field rotation is the thing that hurts. */
    var lag = Math.min(1, dt * LOOK_LAG);
    var maxYaw = (CC.reducedMotion ? YAW_MAX_RM : YAW_MAX) * dt;
    var dy = qYaw * lag;
    if (dy > maxYaw) dy = maxYaw; else if (dy < -maxYaw) dy = -maxYaw;
    var dp = qPitch * lag;
    /* Below this the residual is a rounding error pretending to be motion, and leaving it in
     * means a camera that never quite stops creeping after the last input. */
    if (dy > -1e-7 && dy < 1e-7) { dy = qYaw; qYaw = 0; } else qYaw -= dy;
    if (dp > -1e-7 && dp < 1e-7) { dp = qPitch; qPitch = 0; } else qPitch -= dp;

    /* ONLY WHILE DRIVING, and this is a deliberate reversal of what used to be here. The old test
     * was `if (mode || look)`, which let a held arrow key keep turning pyaw after the viewer had
     * pressed Escape — invisible at blend 0, but during the 1.6 s hand-back blend is not 0 yet
     * and the camera visibly swung as it slid home. The viewer pose is frozen the instant they
     * let go; takeOver() re-seeds it from the autopilot anyway, so nothing is lost by freezing. */
    if (mode) {
      pyaw += dy;
      pitch = clamp(pitch + dp, -PITCH_MAX, PITCH_MAX);
    }

    var tgtC = K.crouch ? 1 : 0;
    crouchK += (tgtC - crouchK) * Math.min(1, dt * 7);

    var mf = (K.fwd - K.back) + K.tz + K.gz, ms = (K.right - K.left) + K.tx + K.gx;
    var sp = (K.crouch ? CROUCH : ((K.run || K.trun || K.grun) ? RUN : WALK)) * k;
    /* CLAMPED, not normalised. Normalising unconditionally was correct while every input was a
     * boolean — it is what stops a diagonal from being sqrt(2) times faster than a straight line
     * — but it also rescales a stick held half way UP to full speed, and an analogue stick with
     * no analogue in it is just a slow keyboard. Above 1 the clamp is the old normalisation
     * exactly (a keyboard diagonal is still 1.0, a single key still 1.0); below it, magnitude is
     * whatever the thumb said. */
    var ml = Math.sqrt(mf * mf + ms * ms);
    if (ml > 1) { mf /= ml; ms /= ml; }
    var tvx = 0, tvz = 0;
    if (ml > 0.001) {
      // yaw 0 faces +z, matching city.js and the caster.
      var fx = Math.sin(pyaw), fz = Math.cos(pyaw);
      tvx = (fx * mf + fz * ms) * sp;
      tvz = (fz * mf - fx * ms) * sp;
    }
    var a = Math.min(1, dt * ACCEL);
    vx += (tvx - vx) * a; vz += (tvz - vz) * a;

    if (mode) move(city, px + vx * dt, pz + vz * dt);
    else { px = A.x; pz = A.z; }               // parked on the autopilot so a take-over is seamless

    var spd = Math.sqrt(vx * vx + vz * vz);
    bob += spd * dt * 2.1;
    /* Head bob scales with speed and dies with it; a fixed-amplitude bob on a stopped camera is
     * the single most nauseating thing a first-person view can do. */
    var bobA = CC.reducedMotion ? 0.012 : 0.034;
    var pEye = 1.66 - crouchK * 0.52 + Math.sin(bob * 3.1) * bobA * Math.min(1, spd / WALK);

    // ---- mix -----------------------------------------------------------------------------------
    var tgtB = mode ? 1 : 0;
    var rate = mode ? BLEND_IN : BLEND_OUT;
    blend += clamp((tgtB - blend), -1, 1) * Math.min(1, dt / rate);
    if (blend < 0.0005) blend = 0; else if (blend > 0.9995) blend = 1;
    var b = smooth(blend);

    cam.x = A.x + (px - A.x) * b;
    cam.z = A.z + (pz - A.z) * b;
    cam.yaw = A.yaw + angDelta(A.yaw, pyaw) * b;
    cam.eyeY = A.eyeY + (pEye - A.eyeY) * b;

    /* THE NEUTRAL ROW MUST NOT BE THE LAST FRAME'S HORIZON. main.js publishes cam.horizonBase and
     * cam.rows from layout(), but tools/headless.cjs builds its own camera literal with neither —
     * and the old fallback `cam.horizonBase !== undefined ? ... : cam.horizon` then read back the
     * horizon THIS FUNCTION WROTE last tick, so the pitch was added to itself sixty times a second.
     * It never fired before because the only pitch was the viewer's, which is multiplied by a blend
     * that is zero with no DOM attached; the autopilot glance below made it fire on every offline
     * frame, and the sweep showed the horizon off the bottom of the grid (100% sky) by frame 18000.
     * Latching the neutral row onto the camera the first time we see one fixes every caller at once
     * rather than only the one harness that happens to be in the tree. */
    if (cam.horizonBase === undefined) cam.horizonBase = cam.horizon;
    var hb = cam.horizonBase;
    /* Same story for the grid height. 0.56 is main.js's neutral fraction and this is the only line
     * in the file that knows it: a camera that publishes no row count still publishes a neutral
     * horizon, and recovering rows from it is what keeps the offline reference frame equal to the
     * browser's rather than pitching by a hardcoded 60 rows on a 100-row grid. */
    var rows = cam.rows || (hb / 0.56);
    /* The two pitches are CROSS-FADED, not scaled. The old line was `hb + pitch * rows * b`, which
     * is the viewer's pitch faded up from a level horizon — fine while the autopilot had no pitch
     * of its own, and the reason it never had one: b is 0 with nobody driving, so any glance the
     * walk wanted was multiplied away. Mixing apitch in at (1-b) hands the walk's own horizon to a
     * passive viewer and still gives a driver the full authority they had, because at b = 1 this
     * is exactly the old expression. */
    cam.horizon = hb + (apitch + (pitch - apitch) * b) * rows;
    /* A.fov, not a literal 1.25: the neutral fov belongs to whatever pose the autopilot is
     * producing, and writing the number twice is how the wheel ends up fighting a walk that has
     * decided to widen out on its own. */
    cam.fov = A.fov + (fovT - A.fov) * b;

    /* Published for the hint element and for anything that wants to know whether a human is
     * driving — the crowd, for instance, has no business parting for an autopilot. `speed` is
     * scaled by the blend on purpose: it is the speed of the CAMERA, not of the viewer's intent,
     * and mid-hand-back a HUD printing 5.8 m/s over a pose drifting home at 1.6 would be a
     * readout of something nobody in the frame can see. */
    Control.mode = mode; Control.blend = b; Control.speed = spd * b; Control.idle = idle;
    Control.paused = paused;
    return cam;
  }

  /* ---- the hint's clock -----------------------------------------------------------------------
   * Two timestamps and no accumulator, for the same reason the weather override is stamped rather
   * than counted down: `alpha` has to be a pure function of t or the overlay is the one thing in
   * the frame that the headless harness cannot reproduce, and a hint that only exists in the
   * browser is a hint nobody can look at while tuning it. Opening the overlay stamps hintOpen and
   * schedules hintClose; H closes it by moving hintClose to now. Nothing here is DOM, so it sits
   * above the line. */
  var HINT_IN = 1.0, HINT_HOLD = 7.0, HINT_OUT = 1.2;
  var hintOpen = 0, hintClose = HINT_IN + HINT_HOLD;

  function hintAlpha(t) {
    if (!(t >= 0)) t = 0;
    var a = (t - hintOpen) / HINT_IN; if (a > 1) a = 1; else if (a < 0) a = 0;
    var b = 1 - (t - hintClose) / HINT_OUT; if (b > 1) b = 1; else if (b < 0) b = 0;
    return a * b;
  }

  function hintToggle(t) {
    if (!(t >= 0)) t = 0;
    if (t < hintClose) { hintClose = t; return; }        // visible or still holding: start the fade
    /* Re-opening BACK-DATES the fade-in by however much of it is already on screen, so pressing H
     * halfway through a fade-out picks the overlay back up from where it is instead of snapping
     * it to nothing and climbing again. */
    var cur = hintAlpha(t);
    hintOpen = t - HINT_IN * cur;
    hintClose = t + HINT_IN + HINT_HOLD;
  }

  /* ---- DOM ------------------------------------------------------------------------------------
   * Everything below this line is skipped entirely when there is no window, which is what keeps
   * the offline reference frame honest. */
  var el = null;

  function attach(win, doc, canvas, hooks) {
    if (!win || !doc) return;
    el = canvas || doc.documentElement;

    function set(e, down) {
      var c = e.code || '', h = e.key || '';
      var hit = 1;
      switch (c) {
        case 'KeyW': case 'Numpad8': K.fwd = down; break;
        case 'KeyS': case 'Numpad5': K.back = down; break;
        case 'KeyA': K.left = down; break;
        case 'KeyD': K.right = down; break;
        case 'ArrowLeft': K.yawL = down; break;
        case 'ArrowRight': K.yawR = down; break;
        case 'ArrowUp': K.pitchU = down; break;
        case 'ArrowDown': K.pitchD = down; break;
        case 'ShiftLeft': case 'ShiftRight': K.run = down; break;
        case 'KeyC': case 'ControlLeft': K.crouch = down; break;
        default: hit = 0;
      }
      if (!hit && down) {
        hit = 2;                              // 2 = "handled, but not a drive input"; see below
        switch (c) {
          case 'Tab':
            if (mode) { giveBack(hooks && hooks.city && hooks.city(),
                                 hooks && hooks.now ? hooks.now() : 0); idle = 0; }
            else { takeOver(); hit = 1; }
            e.preventDefault();
            break;
          case 'Escape': giveBack(hooks && hooks.city && hooks.city(),
                                  hooks && hooks.now ? hooks.now() : 0); idle = 0;
            if (doc.exitPointerLock) doc.exitPointerLock();
            break;
          case 'KeyH': hintToggle(hooks && hooks.now ? hooks.now() : 0); break;
          /* Photo mode. The flag is all this file owns — main.js reads Control.paused and stops
           * stepping the world; what happens HERE is that the autopilot's clock is frozen with it
           * (see update), so the pose under a paused city holds still whether or not a viewer is
           * driving. Look and walk both keep working, which is the point: a still is something
           * you compose, not something you take by accident. */
          case 'KeyP': paused = paused ? 0 : 1; Control.paused = paused; break;
          case 'KeyF': if (hooks && hooks.fullscreen) hooks.fullscreen(); break;
          case 'KeyN': if (hooks && hooks.reseed) hooks.reseed(); break;
          case 'BracketLeft': if (CC.Weather) CC.Weather.cycle(hooks && hooks.now ? hooks.now() : 0, -1); break;
          case 'BracketRight': if (CC.Weather) CC.Weather.cycle(hooks && hooks.now ? hooks.now() : 0, 1); break;
          default: hit = 0;
        }
        if (!hit && /^Digit[1-6]$/.test(c) && CC.Weather) {
          CC.Weather.set(parseInt(c.slice(5), 10) - 1, hooks && hooks.now ? hooks.now() : 0);
          hit = 2;
        }
        if (!hit && h && h.length === 1 && h >= '1' && h <= '6' && CC.Weather) {
          CC.Weather.set(h.charCodeAt(0) - 49, hooks && hooks.now ? hooks.now() : 0);
          hit = 2;
        }
      }
      /* THE RELEASE KEYS MUST NOT RE-ARM THE TAKE-OVER, and for a long time they did: Escape and
       * Tab both cleared K.any inside their own case and then fell through to an unconditional
       * `K.any = 1` down here, so the next update() saw a fresh input, called takeOver(), and the
       * camera was handed straight back to a viewer who had just pressed the key that means stop.
       * Escape did nothing at all. `hit` now carries three states rather than a boolean: 0 not
       * ours, 1 a drive input, 2 handled but not driving — and the release keys return their own
       * value of 1 only in the branch where Tab means TAKE the camera.
       *
       * The hint is also no longer killed by the first keypress. It used to be — one keystroke and
       * the overlay vanished — which meant that the viewer who pressed W to see whether the thing
       * was walkable at all was precisely the viewer who never got to read the rest of the list.
       * Eight seconds is eight seconds; it is three rows of dim slate in a corner and it can share
       * the screen with somebody walking. */
      if (hit === 1) K.any = 1;
      else if (hit === 2) K.act = 1;
      return hit;
    }

    win.addEventListener('keydown', function (e) {
      if (e.metaKey || e.ctrlKey && e.code !== 'ControlLeft' || e.altKey) return;
      if (e.repeat) { K.any = 1; return; }
      if (set(e, 1) && e.code !== 'Tab') { /* handled */ }
    });
    win.addEventListener('keyup', function (e) { set(e, 0); });
    /* A window that loses focus mid-stride keeps the key down forever otherwise, and the camera
     * walks into the far wall of the city while somebody is reading their email. */
    win.addEventListener('blur', function () {
      K.fwd = K.back = K.left = K.right = K.run = K.crouch = 0;
      K.yawL = K.yawR = K.pitchU = K.pitchD = 0;
      K.tx = K.tz = K.trun = 0;
      stickId = -1; lookId = -1; mouseDrag = 0;
    });

    /* ---- pointers, mouse and touch ------------------------------------------------------
     * A phone gets a screen split down the middle: the left half is a virtual stick, the right
     * half is a look pad, and BOTH AT ONCE has to work or the piece is unplayable one-handed —
     * which is why every pointer is tracked by its pointerId rather than by a single `dragging`
     * boolean. Two fingers on a shared flag is the bug where strafing sideways also spins the
     * camera, because the walking finger's deltas were being read as look.
     *
     * The stick is CENTRED WHERE THE THUMB LANDED, not on a fixed circle: a fixed on-screen stick
     * needs to be drawn to be usable, and this piece has no UI. Its dead zone is the reason a TAP
     * cannot start a walk — under 13 px of travel it produces exactly zero, so the tap that takes
     * the page fullscreen does not also send the camera off down the street.
     *
     * Mouse behaviour is untouched: one button-held drag looks, exactly as it did. */
    var STICK_DEAD = 13, STICK_FULL = 78, STICK_RUN = 0.93;   // CSS px, and a fraction of full
    var TOUCH_LOOK = 0.0038;                  // rad/px; a thumb has less travel than a mouse arm
    var mouseDrag = 0, mlx = 0, mly = 0;
    var stickId = -1, stickX0 = 0, stickY0 = 0;
    var lookId = -1, llx = 0, lly = 0;

    function isTouch(e) { return e.pointerType === 'touch' || e.pointerType === 'pen'; }

    el.addEventListener('pointerdown', function (e) {
      if (el.setPointerCapture) { try { el.setPointerCapture(e.pointerId); } catch (err) {} }
      if (!isTouch(e)) { mouseDrag = 1; mlx = e.clientX; mly = e.clientY; return; }
      /* The one bit elements/hud.js needs to know: this viewer has a thumb, not a keyboard, so the
       * hint must talk about halves of the screen rather than about WASD. It is latched on the
       * FIRST touch and never cleared — a device does not stop having a touchscreen, and clearing
       * it in reset() would make N (which a touch viewer cannot press anyway) rewrite the hint.
       * Never set without a DOM, so the offline reference frame keeps the keyboard wording. */
      Control.touch = 1;
      var w = win.innerWidth || el.clientWidth || 800;
      if (e.clientX < w * 0.5) {
        if (stickId < 0) { stickId = e.pointerId; stickX0 = e.clientX; stickY0 = e.clientY; }
      } else if (lookId < 0) { lookId = e.pointerId; llx = e.clientX; lly = e.clientY; }
      /* No K.any here on purpose. Touching the screen is how you go fullscreen, and a viewer who
       * wanted a bigger picture has not asked to take the camera off the autopilot. */
    });

    function release(e) {
      if (e.pointerId === stickId) { stickId = -1; K.tx = 0; K.tz = 0; K.trun = 0; }
      else if (e.pointerId === lookId) lookId = -1;
      else mouseDrag = 0;
    }
    win.addEventListener('pointerup', release);
    win.addEventListener('pointercancel', release);

    win.addEventListener('pointermove', function (e) {
      if (doc.pointerLockElement === el) {
        K.mdx += e.movementX || 0; K.mdy += e.movementY || 0;
        if (e.movementX || e.movementY) K.any = 1;
        return;
      }
      if (e.pointerId === stickId) {
        var dx = e.clientX - stickX0, dy = e.clientY - stickY0;
        var m = Math.sqrt(dx * dx + dy * dy);
        if (m <= STICK_DEAD) { K.tx = 0; K.tz = 0; K.trun = 0; return; }
        /* Rescaled out of the dead zone and clamped at 1, so the thumb's usable travel is the
         * ~65 px between the two radii and pushing past the rim just means "and run". */
        var g = (m - STICK_DEAD) / (STICK_FULL - STICK_DEAD);
        if (g > 1) g = 1;
        K.tx = dx / m * g;
        K.tz = -dy / m * g;                   // up the screen is forwards
        K.trun = g >= STICK_RUN ? 1 : 0;
        K.any = 1;
        return;
      }
      if (e.pointerId === lookId) {
        K.mdx += (e.clientX - llx) * (TOUCH_LOOK / MOUSE);
        K.mdy += (e.clientY - lly) * (TOUCH_LOOK / MOUSE);
        llx = e.clientX; lly = e.clientY;
        K.any = 1;
        return;
      }
      if (!mouseDrag) return;
      K.mdx += e.clientX - mlx; K.mdy += e.clientY - mly;
      mlx = e.clientX; mly = e.clientY;
      K.any = 1;
    });
    win.addEventListener('wheel', function (e) {
      fovT = clamp(fovT + (e.deltaY > 0 ? 0.045 : -0.045), 1.02, 1.52);
      K.any = 1;
    }, { passive: true });

    /* Without this the browser's own gestures win: a drag on the left half scrolls the page (or
     * pulls to refresh) instead of walking, and a two-finger anything zooms the document. The
     * canvas is the whole viewport, so there is nothing here anyone could want to scroll. */
    if (el.style) { el.style.touchAction = 'none'; }

    /* The pad announces itself once and then it is a poll API — see pollPad(). All this listener
     * does is authorise the polling, so the no-controller case costs nothing per frame. */
    win.addEventListener('gamepadconnected', function () { padSeen = 1; });

    Control.requestLook = function () {
      if (el.requestPointerLock && doc.pointerLockElement !== el) {
        /* Same shape as main.js's goFullscreen and the same never-executed bug: since Chrome 113
         * requestPointerLock returns a PROMISE, so the try/catch only covers the engines where it
         * still returns undefined. A refused lock — no user activation, the user pressed Escape
         * within the lock-out window, a sandboxed frame — rejects, and an unhandled rejection
         * prints in the console. A mouse-look nobody granted is a fine outcome; a console error
         * for it is not. */
        try {
          var p = el.requestPointerLock();
          if (p && p.catch) p.catch(function () { });
        } catch (err) {}
      }
    };
  }

  var Control = {
    attach: attach, update: update,
    mode: 0, blend: 0, speed: 0, idle: 0,
    /* 1 once a touch pointer has been seen; read by elements/hud.js to pick which vocabulary the
     * hint speaks. Declared here so the field exists before any DOM event ever fires. */
    touch: 0,
    /* Photo mode, published for main.js to read. This file only owns the flag — see the KeyP
     * case for what still has to happen at the other end. */
    paused: 0,
    /* The hint overlay's envelope, as a pure function of the simulation clock. elements/hud.js is
     * the only caller; it gets t handed to its draw() and asks here rather than keeping a clock of
     * its own, so that H and the eight-second timer have exactly one implementation. */
    hintAlpha: hintAlpha,
    /* Kept only because main.js calls it every tick. The hint used to be a countdown and this was
     * where it counted; it is a stamped envelope now, so there is nothing left to tick. Removing
     * the method would mean editing main.js, which this file does not own. */
    tickHint: function () {},
    // Introspection for the harness and for tests; never an input path.
    get pose() { return { x: px, z: pz, yaw: pyaw, pitch: pitch, mode: mode, blend: blend }; },
    reset: function () {
      mode = 0; blend = 0; autoOff = 0; idle = 0; placed = 0; pitch = 0; apitch = 0; fovT = 1.25;
      vx = 0; vz = 0; bob = 0; crouchK = 0; qYaw = 0; qPitch = 0;
      K.fwd = K.back = K.left = K.right = K.run = K.crouch = 0;
      K.yawL = K.yawR = K.pitchU = K.pitchD = 0; K.mdx = 0; K.mdy = 0; K.any = 0; K.act = 0;
      K.tx = K.tz = K.trun = 0; K.gx = K.gz = K.grun = 0; K.glx = K.gly = 0;
      seedWanted = 0;
      /* N rebuilds the city and calls through here, and a new city that arrives paused is a viewer
       * staring at a still they did not ask for. */
      paused = 0; Control.paused = 0;
      hintOpen = 0; hintClose = HINT_IN + HINT_HOLD;
    }
  };

  if (CC) CC.Control = Control;
  if (typeof module !== 'undefined') module.exports = Control;
})(typeof CC !== 'undefined' ? CC : require('./core.js'));
