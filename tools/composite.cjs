/* THE COMPOSITE, FOR THE PHOTOSENSITIVITY PROBES — what a cell actually puts on the glass, and the
 * WCAG general-flash rule measured over AREA rather than per cell.
 *
 *   const CP = require('./composite.cjs')(CC);
 *   const M  = CP.mode(argv, 200, 60);          // { comp, cols, rows, tag }
 *   ...render a frame; in composite mode call CC.Compose.world(f) after the world pass and
 *   CC.Compose.post(f, cam, t) after the elements, exactly as main.js does...
 *   CP.light(f, V, Y);                           // per-cell display value 0..255 and linear Y
 *   fl.push(Y);                                  // fl = CP.Flash(cols, rows)
 *
 * WHY THIS FILE EXISTS. Every probe in tools/ was written against f.lum, the glyph layer, and the
 * underpainting (CC.Compose's `under`) is not in f.lum — it never touches ch/col/lum, which is
 * precisely why every census and fixture fitted to the glyph layer still reads the frame it was
 * fitted to. But it FOLLOWS lum: its SPILL term spreads every lit emitter over a box nine
 * reference cells wide and five tall. A tube that steps half its brightness in one frame was one
 * cell of step edge; on the composite it is up to forty-five cells of wash stepping with it. The
 * lum probes cannot see that, and CONTRACT's newest rule is that a gate which cannot see the
 * feature is not a gate. So every probe now takes `--composite`, and in that mode it measures
 * THIS — the light the cell emits — instead of the number the painters wrote.
 *
 * WHAT A CELL EMITS. The canvas lays the under block first, one flat colour per cell, and adds the
 * glyph over it: ink at palette x lum/255 on the pixels the glyph covers, nothing on the rest.
 * Averaged over the cell, in LINEAR light because that is what an eye and the WCAG thresholds
 * integrate,
 *
 *     Y = (1 - cov) * lin(under) + cov * lin(min(255, under + palette * lum/255))
 *
 * with cov the glyph's ink share from tools/cov.json — the same table metrics.py --composite
 * weights with, measured by topng.py's calibrated rasteriser at the 9x16 reference cell — OR, when
 * the grid stands for a cell the canvas prints through its pixel path, that cell's own table with
 * the pixel path's ink compensation baked in (see CELL below). The
 * display value V is Y re-encoded to sRGB and scaled to 255, so a probe's existing "a third of full
 * scale" and "2% of full scale" rules read in the units they always have. Two things are knowingly
 * left out and are stated rather than hidden: the BLOOM, which is a wide blur of the glyph scene
 * and so moves only where the ink already moved (the glyph term here carries that amplitude, the
 * halo spreads it thinner), and per-pixel gamma inside the glyph, which this cell average smooths.
 *
 * In LUM mode (no --composite) a probe's own per-cell statistics are exactly what they were, and
 * light() is still called for the flash check with the under term zeroed — which is the glyph
 * layer as it prints, the frame CC.Compose.UNDER = 0 puts on the glass. Lum mode therefore also
 * switches the underpainting OFF for the run: it costs a raycast's worth of time per frame and,
 * by construction, cannot change one byte of f.lum. */
'use strict';
const fs = require('fs'), path = require('path');

module.exports = function (CC) {
  const CJ = JSON.parse(fs.readFileSync(path.join(__dirname, 'cov.json'), 'utf8'));
  const G = CC.GLYPHS, PAL = CC.PALETTE;
  const cov = new Float32Array(G.length);
  function useCov(COV, name) {
    for (let i = 1; i < G.length; i++) {
      /* A glyph with no coverage is a hole in the measurement, and a probe that weighted it at zero
       * would score a flashing new glyph as dark. Refuse, with the line that fixes it. */
      if (!COV || !(G[i] in COV)) throw new Error(`composite: no ${name} coverage for ${JSON.stringify(G[i])} — ` +
                                          'regenerate tools/cov.json (python3 tools/topng.py f.txt --cov > tools/cov.json)');
      cov[i] = COV[G[i]];
    }
  }
  useCov(CJ.cov, '9x16');
  /* sRGB decode per 8-bit level, and the luminance weights folded in per channel, so a cell is
   * six table reads and no pow(). ENC is the inverse on a 4096-step linear ramp, fine enough that
   * its quantisation is a twentieth of a display level at the dark end where it matters. */
  const LIN = new Float32Array(256), LR = new Float32Array(256), LG = new Float32Array(256), LB = new Float32Array(256);
  for (let c = 0; c < 256; c++) {
    const s = c / 255; LIN[c] = s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    LR[c] = 0.2126 * LIN[c]; LG[c] = 0.7152 * LIN[c]; LB[c] = 0.0722 * LIN[c];
  }
  const ENC = new Float32Array(4097);
  for (let k = 0; k <= 4096; k++) {
    const y = k / 4096; ENC[k] = 255 * (y <= 0.0031308 ? 12.92 * y : 1.055 * Math.pow(y, 1 / 2.4) - 0.055);
  }

  /* ---- MODE. One parser for every probe, so `--composite --cols=400 --rows=120` means the same
   * thing on all seven command lines and no probe grows its own spelling of it.
   *
   * CELL. A glyph's ink share is not one number: render_canvas.js prints cells of PX_CELL (7)
   * device px and under through its pixel path, which LIFTS coverage per pixel (cov' = 1-(1-cov)^k,
   * k = 1 + 1.6*(9-dw)/9) so a 5 px stroke does not print grey. Measured in Chromium with the
   * atlas's own recipe, that is +17% of mean ink at 6x11 and +25% at 5x9; weighting a 400-column
   * gate by the 9x16 table understated the glyph's share of every cell's light at exactly the size
   * that gate stands for. So the grid names a cell: by default the width it gets across a 1920 px
   * panel at dpr 1 (200 columns -> 10 px, the reference table, unchanged; 400 -> 5 px, the 5x9
   * compensated table), or `--cell=N` to ask about another panel — a 200-column grid is also what a
   * 1280 px window prints at 6 px. topng.py --cov writes the compensated tables (cov.json 'px'). */
  const PX_CELL = 7;
  function mode(argv, dc, dr) {
    const fl = argv.filter(a => a.slice(0, 2) === '--');
    const num = k => { const a = fl.find(x => x.indexOf('--' + k + '=') === 0); return a ? parseInt(a.slice(k.length + 3), 10) : NaN; };
    const comp = fl.indexOf('--composite') >= 0, cols = num('cols') || dc, rows = num('rows') || dr;
    if (!(cols > 8) || !(rows > 8)) { console.error('composite: --cols and --rows must be over 8'); process.exit(2); }
    const dw = num('cell') || Math.max(4, Math.round(1920 / cols));
    let cell = '9x16';
    if (dw <= PX_CELL) {
      const key = Object.keys(CJ.px || {}).find(k => parseInt(k, 10) === dw);
      if (!key) { console.error(`composite: no pixel-path coverage for a ${dw} px cell in tools/cov.json — regenerate it`); process.exit(2); }
      useCov(CJ.px[key], key); cell = key + ' ink-compensated';
    } else useCov(CJ.cov, '9x16');
    if (CC.Compose) CC.Compose.UNDER = comp ? 1 : 0;
    return { comp, cols, rows, cell, tag: `${comp ? 'COMPOSITE (glyph + underpainting)' : 'LUM (glyph layer)'} ${cols}x${rows}, cell ${cell}` };
  }

  /* ---- THE CELL'S LIGHT. V (display 0..255) and Y (linear 0..1), either may be null. */
  function light(f, V, Y) {
    const n = f.n, ch = f.ch, col = f.col, lum = f.lum, u = f.under, on = !!(u && CC.Compose && CC.Compose.UNDER);
    for (let i = 0; i < n; i++) {
      let r = 0, g = 0, b = 0;
      if (on) { const o = i * 3; r = u[o]; g = u[o + 1]; b = u[o + 2]; }
      let y = LR[r] + LG[g] + LB[b];
      const c = ch[i], L = lum[i];
      /* lum under 4 is not drawn by the canvas (LUM_FLOOR in render_canvas.js), so it emits nothing */
      if (c && L >= 4) {
        const p = PAL[col[i]], k = L / 255, w = cov[c];
        const R = Math.min(255, r + p[0] * k + 0.5) | 0, Gg = Math.min(255, g + p[1] * k + 0.5) | 0, B = Math.min(255, b + p[2] * k + 0.5) | 0;
        y = (1 - w) * y + w * (LR[R] + LG[Gg] + LB[B]);
      }
      if (Y) Y[i] = y;
      if (V) V[i] = ENC[(y >= 1 ? 1 : y) * 4096 + 0.5 | 0];
    }
  }

  /* ---- THE SPILL'S REACH. A probe that scores a SET of cells (the canal's water, the road, the
   * crown a walk pinned on) scores, in composite mode, that set grown by the spill box: the wash
   * a flickering reflection throws lands on the kerb beside it, and a mask that stops at the water
   * would measure the cause and not look at the effect. hx/hy are core.js's own, D-scaled. */
  function dilate(mask, cols, rows, D) {
    const hx = Math.round(4 * (D || 1)), hy = Math.round(2 * (D || 1)), out = new Uint8Array(mask.length);
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (mask[y * cols + x])
      for (let yy = Math.max(0, y - hy); yy <= Math.min(rows - 1, y + hy); yy++)
        out.fill(1, yy * cols + Math.max(0, x - hx), yy * cols + Math.min(cols - 1, x + hx) + 1);
    return out;
  }

  /* ---- THE GENERAL-FLASH RULE, AREA-WEIGHTED --------------------------------------------------
   * Every rule the probes had was PER CELL: one fixture's step, one cell's rate, one cell's band.
   * WCAG 2.3.1's general-flash threshold is not: a flash is a hazard when MORE THAN THREE happen in
   * one second AND the area flashing together is more than a quarter of any 10-degree field of
   * view. That second clause is the one the underpainting changes — the spill turns a one-cell
   * event into a forty-five-cell one without changing its rate — and no per-cell statistic can
   * see it. So:
   *
   *   TRANSITION  a change in a cell's relative luminance of at least 0.10 (10% of white), against
   *               the extreme since its last transition, with the darker side under 0.80. That is
   *               WCAG's own definition; the hysteresis against the running extreme is what stops a
   *               slow ramp being counted as a hundred small ones.
   *   FLASHING    a cell with SEVEN or more transitions inside the last 60 frames — more than three
   *               and a half flashes a second, which rounds the rule against the viewer's favour.
   *   AREA        the flashing cells' share of the worst window a third of the screen wide and a
   *               third tall. WCAG's note puts a 10-degree field at 341x256 on a 1024x768 screen,
   *               which is that third. The rule is a quarter of it; HAZARD_AREA below.
   *
   * It also prints SWING, the plan's literal measure: the largest share of the whole screen whose
   * luminance moved by 0.10 or more inside one third of a second. It is read at four lags, 3, 5, 10
   * and 20 frames, and not at 20 alone: a strobe whose period divides 20 frames is in the same phase
   * at both ends of the window, and the single-lag first cut scored a 6 Hz test sign at 0.0%. Swing is NOT judged — a
   * single lightning stroke moves most of the screen once and that is one flash, not a hazard —
   * but it is the number that shows how much area an event moves, so it is reported beside the
   * verdict that decides. Red flashes (WCAG's second clause) are not measured here; see CONTRACT. */
  const T = 0.10, DARK = 0.80, NTR = 7, WIN = 60, SWING_LAG = 20, HAZARD_AREA = 0.25;
  function Flash(cols, rows) {
    const n = cols * rows, hi = new Float32Array(n), lo = new Float32Array(n), s = new Int8Array(n);
    const ring = new Int32Array(n * 8).fill(-1e9), rp = new Uint8Array(n), hz = new Uint8Array(n);
    const lag = []; for (let k = 0; k < SWING_LAG; k++) lag.push(new Float32Array(n));
    const wc = Math.max(1, Math.round(cols / 3)), wr = Math.max(1, Math.round(rows / 3));
    const sat = new Int32Array((cols + 1) * (rows + 1));
    let k = 0, worst = 0, worstAt = -1, worstScreen = 0, swing = 0, swingAt = -1, trans = 0;
    function push(Y) {
      let any = 0, sw = 0;
      const old = lag[k % SWING_LAG], l3 = lag[(k + 17) % SWING_LAG], l5 = lag[(k + 15) % SWING_LAG], l10 = lag[(k + 10) % SWING_LAG];
      for (let i = 0; i < n; i++) {
        const y = Y[i];
        if (k >= SWING_LAG && (Math.abs(y - old[i]) >= T || Math.abs(y - l3[i]) >= T || Math.abs(y - l5[i]) >= T || Math.abs(y - l10[i]) >= T)) sw++;
        old[i] = y;
        if (!k) { hi[i] = lo[i] = y; continue; }
        let tr = 0;
        if (s[i] >= 0) { if (y > hi[i]) hi[i] = y; if (hi[i] - y >= T && y < DARK) { s[i] = -1; lo[i] = y; tr = 1; } }
        if (!tr && s[i] <= 0) { if (y < lo[i]) lo[i] = y; if (y - lo[i] >= T && lo[i] < DARK) { s[i] = 1; hi[i] = y; tr = 1; } }
        if (tr) { trans++; ring[i * 8 + (rp[i] = (rp[i] + 1) & 7)] = k; }
        /* the 7th most recent transition is still inside the last second */
        const h = ring[i * 8 + ((rp[i] + 8 - (NTR - 1)) & 7)] > k - WIN ? 1 : 0;
        hz[i] = h; any += h;
      }
      if (k >= SWING_LAG && sw / n > swing) { swing = sw / n; swingAt = k; }
      if (any) {
        if (any / n > worstScreen) worstScreen = any / n;
        for (let y = 0; y < rows; y++) for (let x = 0, run = 0; x < cols; x++) {
          run += hz[y * cols + x];
          sat[(y + 1) * (cols + 1) + x + 1] = sat[y * (cols + 1) + x + 1] + run;
        }
        let m = 0;
        for (let y = 0; y + wr <= rows; y++) for (let x = 0; x + wc <= cols; x++) {
          const a = sat[(y + wr) * (cols + 1) + x + wc] - sat[y * (cols + 1) + x + wc] - sat[(y + wr) * (cols + 1) + x] + sat[y * (cols + 1) + x];
          if (a > m) m = a;
        }
        if (m / (wc * wr) > worst) { worst = m / (wc * wr); worstAt = k; }
      }
      k++;
    }
    function result() {
      return { area: worst, at: worstAt, screen: worstScreen, swing, swingAt, frames: k, transitions: trans,
               bad: worst > HAZARD_AREA };
    }
    return { push, result };
  }
  /* One line, the same in every probe, so a report can quote it without translating between seven
   * spellings. The area is the verdict; swing and transitions are context. */
  function fmt(r) {
    return `flash area ${(r.area * 100).toFixed(1)}% of a 10° field (limit ${HAZARD_AREA * 100}%)` +
           `${r.area > 0 ? ' at f' + r.at : ''}, swing ${(r.swing * 100).toFixed(1)}% of screen per 1/3 s, ` +
           `${r.transitions} transitions`;
  }
  return { mode, light, dilate, Flash, fmt, HAZARD_AREA };
};
