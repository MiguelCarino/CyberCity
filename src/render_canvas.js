/* CyberCity canvas renderer — glyph atlas, one drawImage per lit cell, then bloom.
 *
 * This is the ONLY module that touches the DOM or a 2D context. Everything above it produced a
 * frame of typed arrays; everything here is about getting those ~13000 cells onto glass at 60 Hz
 * and then putting the light back into them.
 *
 * BLOOM IS NOT DECORATION. The art direction is 55%+ pure black with a thin scatter of very bright
 * glyphs; drawn flat, that reads as a text dump. The halo is what makes a sodium lamp look like it
 * is emitting rather than printed, and it is the only thing that fuses the dim mullion glyphs into
 * the massed slab a facade is supposed to be. The offline reference renderer (tools/topng.py) bakes
 * the same two-radius glow, so this pass exists to keep the browser honest against it.
 */
(function (CC) {
  'use strict';

  var PALETTE = CC.PALETTE, GLYPHS = CC.GLYPHS;
  var NG = GLYPHS.length, NP = PALETTE.length;

  /* Bold, because the references read as MASS. A regular weight at 9px leaves the mullion glyphs
   * too thin to fuse into a slab and the facade dissolves into a lattice. */
  var FAMILY = '"Liberation Mono","DejaVu Sans Mono","Menlo","Consolas","Courier New",monospace';

  /* Below this the glyph contributes less than one 8-bit level after the black background and the
   * bloom composite — drawing it is pure cost. Measured: skips ~4% of cells, no visible change. */
  var LUM_FLOOR = 4;

  /* globalAlpha, NOT a per-lum atlas tier. Two reasons, both load-bearing:
   *  1. On a pure black destination, source-over with alpha a is exactly dst = src*a — the same
   *     multiply the palette/lum model specifies, with no quantisation.
   *  2. lum carries depth here (Surf.fog ramps it over 113 m). Tiering it into 8 or 16 steps puts
   *     visible contour bands across every long wall and down the whole road surface, which is the
   *     one gradient in the frame the eye actually tracks.
   * The state change costs a few percent of the glyph pass; the banding would cost the image. */

  var canvas = null, ctx = null;
  var scene = null, sctx = null;              // glyph pass lands here, bloom reads it
  var b2 = null, b4 = null, b8 = null;        // 1/2, 1/4, 1/8 downsample chain
  var atlas = null, actx = null;

  var cols = 0, rows = 0, dw = 0, dh = 0, W = 0, H = 0, dpr = 1;
  var quality = 2;
  /* Bloom radii, in device pixels, recomputed from the cell in setGrid. They are NOT constants:
   * a fixed 1.2px halo is half a glyph wide at dpr 1 and a quarter of one at dpr 2, so the piece
   * would look softer on a cheap monitor than on a retina one. Expressed as a fraction of the cell
   * they hold the same look at every density and every column count. */
  var rTight = 1, rWide = 1, rMid = 1;
  var advance = 0.6;                          // measured monospace advance, em units

  /* ctx.filter is absent on older WebKit. Probed once: assigning an unsupported value leaves the
   * property at 'none', so a read-back is the only honest test. */
  var HAS_FILTER = false;
  function probeFilter() {
    try {
      var c = document.createElement('canvas').getContext('2d');
      c.filter = 'blur(2px)';
      HAS_FILTER = c.filter !== 'none' && c.filter !== '' && c.filter !== undefined;
    } catch (e) { HAS_FILTER = false; }
  }

  function mkCanvas(w, h) {
    var c = document.createElement('canvas');
    c.width = w < 1 ? 1 : w; c.height = h < 1 ? 1 : h;
    return c;
  }

  /* ---- glyph atlas ---------------------------------------------------------------------------
   * Every glyph pre-rendered once per palette colour. A cell then costs one drawImage of an
   * integer-aligned tile — no fillText in the frame loop, no per-cell fillStyle string, no shaping.
   * Rebuilt only when the cell box or the font size changes, i.e. on resize, not on frame. */
  function buildAtlas() {
    atlas = mkCanvas(NG * dw, NP * dh);
    actx = atlas.getContext('2d');

    /* The advance ratio is measured, never assumed 0.6: the family that actually resolves may be a
     * fallback with a different one, and guessing would leave the glyph either clipped by its cell
     * or floating in it. */
    actx.font = 'bold 100px ' + FAMILY;
    advance = actx.measureText('M').width / 100 || 0.6;

    var fontPx = dw / advance;
    if (fontPx > dh * 0.98) fontPx = dh * 0.98;   // never let a tall cell clip the ink vertically
    actx.font = 'bold ' + fontPx.toFixed(2) + 'px ' + FAMILY;
    actx.textAlign = 'center';
    actx.textBaseline = 'alphabetic';

    /* Centre the ink box of an ascender+descender pair rather than parking the baseline at a
     * fixed fraction: with a fallback font that would drop ',' and '_' out of the bottom of the
     * cell, and those two glyphs are most of the far-distance road texture. */
    var m = actx.measureText('Xg');
    var asc = m.actualBoundingBoxAscent || dh * 0.72;
    var desc = m.actualBoundingBoxDescent || dh * 0.20;
    var base = Math.round((dh - asc - desc) * 0.5 + asc);
    if (base > dh - 1) base = dh - 1;
    if (base < 1) base = 1;

    var cx = dw * 0.5;
    for (var p = 0; p < NP; p++) {
      var rgb = PALETTE[p];
      actx.fillStyle = 'rgb(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ')';
      var y = p * dh + base;
      for (var gI = 1; gI < NG; gI++)             // 0 is blank by contract; never drawn
        actx.fillText(GLYPHS[gI], gI * dw + cx, y);
    }
  }

  /* ---- sizing -------------------------------------------------------------------------------- */
  function setGrid(nCols, nRows, cellW, cellH, devicePR) {
    /* Compared AFTER the |0, not before: a caller handing in 19.0 and then 19 must not rebuild the
     * atlas, which is 588 fillText calls and the most expensive thing in this file. */
    var w = cellW | 0, h = cellH | 0;
    var reAtlas = (w !== dw || h !== dh);
    cols = nCols | 0; rows = nRows | 0;
    dw = w; dh = h; dpr = devicePR || 1;
    W = cols * dw; H = rows * dh;

    canvas.width = W; canvas.height = H;
    canvas.style.width = (W / dpr) + 'px';
    canvas.style.height = (H / dpr) + 'px';

    scene = mkCanvas(W, H); sctx = scene.getContext('2d', { alpha: false });
    /* Bloom taps are downsampled: a half-resolution blur of the whole frame is 4x cheaper than a
     * full one and the halo has no detail worth preserving anyway. The chain doubles as the
     * no-ctx.filter fallback — bilinear minification IS a box blur, so even with filters missing
     * these buffers come back genuinely blurred, just less smoothly. */
    b2 = mkCanvas(W >> 1, H >> 1);
    b4 = mkCanvas(W >> 2, H >> 2);
    b8 = mkCanvas(W >> 3, H >> 3);

    /* Each radius is expressed in ITS OWN buffer's pixels, so the 0.05/0.045 fractions below are
     * the cell-relative full-resolution radii divided by the buffer's downsample factor. Landed on
     * by matching tools/topng.py's 1.5px and 5.0px taps at its 9x16 cell, which is the render the
     * art direction was signed off against. */
    rTight = Math.max(0.6, dh * 0.05);      // on b2 (1/2)
    rWide  = Math.max(0.8, dh * 0.045);     // on b8 (1/8)
    rMid   = Math.max(0.7, dh * 0.06);      // on b4 (1/4), degraded mode only

    if (reAtlas || !atlas) buildAtlas();
  }

  function init(el) {
    canvas = el;
    ctx = canvas.getContext('2d', { alpha: false });
    probeFilter();
    return CC.Canvas;
  }

  function setQuality(q) { quality = q < 0 ? 0 : (q > 2 ? 2 : q | 0); }

  /* ---- the glyph pass ------------------------------------------------------------------------ */
  function glyphPass(f) {
    var c = sctx;
    c.globalCompositeOperation = 'source-over';
    c.fillStyle = '#000';
    c.fillRect(0, 0, W, H);

    var ch = f.ch, cl = f.col, lu = f.lum;
    var n = cols < f.cols ? cols : f.cols;
    var r = rows < f.rows ? rows : f.rows;
    var curA = -1, fc = f.cols;

    for (var y = 0; y < r; y++) {
      var row = y * fc, py = y * dh;
      for (var x = 0; x < n; x++) {
        var i = row + x, gI = ch[i];
        if (gI === 0) continue;
        var L = lu[i];
        if (L < LUM_FLOOR) continue;
        var a = L * (1 / 255);
        /* Only assign when it actually moves: globalAlpha is a context state change and this loop
         * runs 13k times a frame. */
        if (a !== curA) { c.globalAlpha = a; curA = a; }
        c.drawImage(atlas, gI * dw, cl[i] * dh, dw, dh, x * dw, py, dw, dh);
      }
    }
    c.globalAlpha = 1;
  }

  /* ---- bloom ---------------------------------------------------------------------------------
   * 'copy' rather than clearRect-then-draw: it replaces the destination in one op, which both
   * clears the buffer and writes it, and it is what makes the fallback path free. */
  function tap(dst, src, blurPx) {
    var c = dst.getContext('2d');
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = 'high';
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'copy';
    if (HAS_FILTER && blurPx > 0) c.filter = 'blur(' + blurPx + 'px)';
    c.drawImage(src, 0, 0, dst.width, dst.height);
    if (HAS_FILTER) c.filter = 'none';
    c.globalCompositeOperation = 'source-over';
    return dst;
  }

  function composite() {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'copy';
    ctx.drawImage(scene, 0, 0);
    if (quality <= 0) { ctx.globalCompositeOperation = 'source-over'; return; }

    /* Additive, not the alpha blend tools/topng.py uses. Light adds; blending would darken the
     * glyph cores it is supposed to be haloing, and the cores are the only pure-white in the
     * frame. The two alphas below are tuned so a lone lit window still reads as a point and a
     * whole lit facade blooms into a slab. */
    ctx.globalCompositeOperation = 'lighter';
    if (quality >= 2) {
      tap(b2, scene, rTight);                     // tight halo: gives glyphs an emissive edge
      ctx.globalAlpha = 0.55;
      ctx.drawImage(b2, 0, 0, W, H);
      tap(b4, b2, 0);                             // chained, so the wide tap inherits the tight blur
      tap(b8, b4, rWide);                         // wide haze: the canyon's ambient light
      /* 0.55 / 0.85 was picked by rendering the same frame at 0.40/0.60, 0.55/0.85 and 0.70/1.05
       * and looking: below this the dim mullions never lift off black and the facade goes back to
       * reading as a lattice; above it the halo starts eating the glyph cores and the blacks grey
       * out, which costs the negative space the whole composition is built on. */
      ctx.globalAlpha = 0.85;
      ctx.drawImage(b8, 0, 0, W, H);
    } else {
      /* Degraded mode: one mid tap. Keeps the piece emissive at half the bloom cost — going to
       * quality 0 is a last resort because a flat frame is a different artwork. */
      tap(b4, scene, rMid);
      ctx.globalAlpha = 0.95;
      ctx.drawImage(b4, 0, 0, W, H);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  function draw(f) {
    if (!ctx || !atlas) return;
    glyphPass(f);
    composite();
  }

  CC.Canvas = {
    init: init, setGrid: setGrid, setQuality: setQuality, draw: draw,
    get cellAspect() { return dh ? dw / dh : 0.5625; },
    get quality() { return quality; },
    get hasFilter() { return HAS_FILTER; },
    FAMILY: FAMILY, LUM_FLOOR: LUM_FLOOR
  };
  if (typeof module !== 'undefined') module.exports = CC.Canvas;
})(typeof CC !== 'undefined' ? CC : require('./core.js'));
