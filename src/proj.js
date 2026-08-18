/* CyberCity element projection — the one copy of the camera the world-space elements share.
 *
 * WHY THIS FILE EXISTS AT ALL, and it is two reasons, one of which is the important one.
 *
 * THE CHEAP REASON is bytes. Six element files draw objects in world space — the frontier's
 * veranda, props, brush, telegraph, desert and livestock, and Moonwalk's ground and hardware — and
 * every one of them was written by copying the previous one, so every one carried its own byte-
 * identical copy of the same view/project/emit/column pair. Measured across the four frontier files
 * alone that is about 14 KB of the shipped bundle, against a budget build.js has now had to raise
 * three times. This is the cut that note asks the next pass to take before it edits the line again.
 *
 * THE IMPORTANT REASON is that six copies of a projection which MUST match src/raycast.js exactly
 * is six places for it to stop matching. The comment those copies all carry says so out loud —
 * "elements are handed `cam` and nothing else, and a projection that disagrees with the caster by
 * one term puts a stall through the wall it is standing against" — and the way that goes wrong is
 * never a crash. It is one file quietly keeping an old term after the caster changes: objects in
 * one element sink half a metre into the ground and nothing anywhere reports it. One copy can be
 * wrong; it cannot be inconsistent.
 *
 * WHAT IT IS NOT. It is not a scene graph and it does not own anything. `make()` hands back a small
 * record with a per-element basis in it and four functions closed over that basis, because two
 * elements drawing in the same frame need two bases — the pedestrians retire on screen area and
 * the brush does not, and both have to be able to hold their own `far`. Nothing here allocates
 * after init: the basis and the projection scratch are each made once per element, for the life of
 * the page.
 */
(function (CC) {
  'use strict';

  var put = CC.put, clamp = CC.clamp;

  CC.Proj = {
    /* One per element. The returned object is held for the life of the page; view() refills it in
     * place at the top of every draw. */
    make: function () {

      /* Mirrors raycast.js, exactly. Planar camera: w is the perpendicular distance and the
       * projection divisor, and the radial distance the depth test wants is w*sqrt(1+sp^2). */
      var V = {
        ox: 0, oz: 0, eyeY: 1.7, fwx: 0, fwz: 1, rgx: 1, rgz: 0,
        hp: 0.7265, colK: 0, colMid: 0, scale: 77, horizon: 33, cols: 0, rows: 0, far: 125, t: 0
      };
      var PJ = { x: 0, y: 0, d: 0 };
      var Surf = null;

      function view(f, cam, t) {
        if (!Surf) Surf = CC.Surf;
        var fov = cam.fov || 1.25, hp = Math.tan(fov * 0.5);
        var cellA = cam.cellAspect || 0.5625;
        V.cols = f.cols; V.rows = f.rows; V.hp = hp;
        V.colK = f.cols * 0.5 / hp; V.colMid = f.cols * 0.5;
        V.scale = cam.scaleY !== undefined ? cam.scaleY : (f.cols * cellA) / (2 * hp);
        V.horizon = cam.horizon !== undefined ? cam.horizon : f.rows * 0.56;
        V.eyeY = cam.eyeY !== undefined ? cam.eyeY : 1.7;
        var yaw = cam.yaw || 0;
        V.fwx = Math.sin(yaw); V.fwz = Math.cos(yaw);
        V.rgx = Math.cos(yaw); V.rgz = -Math.sin(yaw);
        V.ox = cam.x; V.oz = cam.z;
        V.far = Surf ? Surf.FOG_END : 125;
        V.t = t;
        return V;
      }

      /* Continuous cell coordinates: column i covers [i, i+1). The caller floors; this returns the
       * real number so a caller that wants a sub-cell position can have one. */
      function project(px, py, pz) {
        var rx = px - V.ox, rz = pz - V.oz;
        var w = rx * V.fwx + rz * V.fwz;
        if (w < 0.4) return false;                       // at or behind the eye plane
        var sp = (rx * V.rgx + rz * V.rgz) / w;
        PJ.d = w * Math.sqrt(1 + sp * sp);
        PJ.x = sp * V.colK + V.colMid;
        PJ.y = V.horizon - (py - V.eyeY) * V.scale / w;
        return PJ.d < V.far;
      }

      /* The only write. Fog is applied here because the world pass has already fogged its own
       * cells; an unfogged object at 40 m would read nearer than the wall behind it. A cell fogged
       * to nothing is still written: it is unlit mass in front of something, and that occlusion is
       * most of what these files contribute. */
      function emit(f, x, y, ch, col, lum, d) {
        if (x < 0 || y < 0 || x >= V.cols || y >= V.rows) return;
        if (lum > 0 && Surf) { lum = Surf.fog(lum, d); if (lum <= 0) ch = 0; }
        put(f, x, y, ch, col, lum, d, 3);
      }

      /* A vertical. Every post, leg, pole and trunk goes through here: it projects the two ENDS and
       * fills between them, which is the only way to get a vertical that stays one cell wide and
       * does not shear as the camera pans — sampling world points up the post and projecting each
       * one separately puts them in different columns whenever the post is off-axis. */
      function column(f, px, pz, y0, y1, ch, col, lum, wide) {
        if (!project(px, y0, pz)) return;
        var x = Math.floor(PJ.x), yb = PJ.y, d = PJ.d;
        if (x < -2 || x >= V.cols + 2) return;
        if (!project(px, y1, pz)) return;
        var yt = PJ.y;
        if (yt > yb) { var s = yt; yt = yb; yb = s; }
        var r0 = Math.floor(yt), r1 = Math.floor(yb);
        if (r1 - r0 > V.rows) r1 = r0 + V.rows;
        for (var r = r0; r <= r1; r++) {
          emit(f, x, r, ch, col, lum, d);
          if (wide) emit(f, x + 1, r, ch, col, lum, d);
        }
      }

      /* How lit a face pointing (nx, nz) is, against whichever painter owns the live world. It
       * lives here rather than in each element because a post and the wall behind it disagreeing
       * about where the light is coming from is the most visible possible error, and it happened
       * once already when the sun stopped being a constant. */
      function litFace(nx, nz) {
        var W = CC.SURFACES && CC.World ? CC.SURFACES[CC.World.id] : null;
        if (!W || W.SUN_X === undefined) return 0.5;
        var d = nx * W.SUN_X + nz * W.SUN_Z;
        var k = clamp(0.5 + 0.62 * d, 0, 1);
        return 0.10 + 0.90 * k * k * (3 - 2 * k);
      }

      return { V: V, PJ: PJ, view: view, project: project, emit: emit,
               column: column, litFace: litFace };
    }
  };

  if (typeof module !== 'undefined') module.exports = CC.Proj;
})(typeof CC !== 'undefined' ? CC : require('./core.js'));
