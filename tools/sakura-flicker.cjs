/* THE SAKURA RATE PROBE — tools/canal-flicker.cjs's method, aimed at the cherry.
 *
 * WHY THIS FILE EXISTS. CONTRACT.md's newest rule is that A GATE THAT CANNOT SEE THE FEATURE IS NOT
 * A GATE, and the sakura is the second feature in this world to fall through that hole. Measured on
 * the tree this file was written against: `node tools/west-flicker.cjs 4` pins the camera at
 * city.startX/startZ and rendered 20 sakura cells of 4,800 at seed 3 and 15 at seed 42, none of
 * which printed above the black line — its japan rows came back BYTE-IDENTICAL whether the crown
 * was drawing 0 visible cells a frame or 81. Quoting that PASS for a change to the tree is exactly
 * the failure the contract forbids, so this probe walks the autopilot until the element's own cells
 * are actually IN the frame, pins there, and scores only the cells that element owns.
 *
 * THOSE NUMBERS ARE NOT CONSTANTS, and this file learned it the embarrassing way. The very pass
 * that added this probe raised the cherry's accept rate, which put a crown at the map's start pose
 * and took west-flicker's blind spot from 15 cells to 80, 45 of them printing. Because the search
 * below stopped as soon as the target owned `--cells`, the threshold was met at frame 0 and this
 * tool silently became a second copy of the gate it exists to complement, on six of nine rows,
 * while its own header claimed otherwise. Hence two rules now enforced in the code: the pin
 * threshold counts cells that PRINT, never cells merely owned (proj.js emits fogged-to-zero cells
 * as real occluding mass, and about half a crown is those), and every row REPORTS ITS PIN FRAME so
 * a reader can see whether the walk walked. A gate's blindness is a property of the content as much
 * as of the camera; it has to be re-measured, not quoted.
 *
 * ATTRIBUTION IS BY WRAPPING CC.put BEFORE src/proj.js IS REQUIRED, and the order is load-bearing:
 * proj.js caches `var put = CC.put` at module scope, so a wrapper installed after that require is
 * never called by any world-space element and this probe would measure an empty set while printing
 * a confident PASS. The wrapper records which cells the named element wrote; every other element in
 * the world still draws, because a petal is only a hazard against what is behind it.
 *
 * THE MEASURED SET IS THE TREE'S OWN CELLS, not the frame. A crown is 1-3% of a frame and a whole-
 * frame worst-cell figure is dominated by the street behind it — which west-flicker already gates.
 *
 * EXIT CODES, four rather than two, following tools/flicker-rate.cjs rather than west-flicker:
 *   0 PASS   1 a MEASURED violation   2 usage   3 NOTHING WAS JUDGED.
 * 3 has TWO causes and both are "this run reached no verdict", which is why they share a code:
 * the walk never found the element, OR the window is not REF_WINDOW so the figures were printed
 * without being judged. Neither is a pass and neither is a failure of the tree; a silent 0 on an
 * unjudged run is the defect this scheme exists to prevent. The RESULT line always says which.
 *
 * usage: node tools/sakura-flicker.cjs [seconds] [element] [--time=<hour>] [--cells=<n>]
 * --cells is how many cells of the target must PRINT (v >= 9) before the walk pins. It counts
 * what prints and NOT what the element owns — see the note above the search loop — and it is a
 * REQUIRED knob rather than a constant because the two things this probe is aimed at differ by
 * two orders of magnitude: a crown prints 60-140 cells and a thirty-petal drift single figures.
 * A threshold
 * tuned for the crown reports NOT_MEASURED on the drift, which is the correct answer for that
 * threshold and a useless one for the question.
 * The window is an ARGUMENT because the rate figure is quantised by it: at 4 s a rate is a multiple
 * of 0.25/s, which is too coarse to ship a judgement on when the limit is 1.00/s. It is printed in
 * the RESULT line so a quoted number always carries the window it was measured over.
 */
'use strict';
const fs = require('fs'), path = require('path');
const R = path.join(__dirname, '..') + '/';

const argv = process.argv.slice(2);
const flags = argv.filter(a => a.slice(0, 2) === '--');
const pos = argv.filter(a => a.slice(0, 2) !== '--');
const SECONDS = parseFloat(pos[0] || '10');
const TARGET = pos[1] || 'jp-sakura';
const HOUR_RAW = (flags.find(f => f.startsWith('--time=')) || '').slice(7);
/* COERCED, because Daylight.set branches on `typeof === 'number'` and matches STOPS by name
   otherwise: a raw '0.25' matches no stop, returns false, and the clock free-runs while the
   header still prints the hour that was asked for. tools/headless.cjs normalises on its own
   line 155 for the same reason. Guards below test `!== ''` and not truthiness, so --time=0
   survives the coercion. */
const HOUR = HOUR_RAW !== '' && /^[0-9]*\.?[0-9]+$/.test(HOUR_RAW) ? parseFloat(HOUR_RAW) : HOUR_RAW;
const NEED = parseInt((flags.find(f => f.startsWith('--cells=')) || '--cells=60').slice(8), 10);
if (!(SECONDS > 0)) {
  console.error('usage: node tools/sakura-flicker.cjs [seconds] [element] [--time=hour]');
  process.exit(2);
}
if (SECONDS < 4) console.error('sakura-flicker: WARNING — under 4 s the 3-20 Hz figure is noise.');

global.CC = require(R + 'src/core.js');
global.window = undefined;

/* ---- the wrapper, installed before ANY consumer caches it ---------------------------------- */
let TAG = null, OWNED = null, COLS = 120, ROWS = 40;
const rawPut = CC.put;
/* ATTRIBUTION IS CC.put's OWN RETURN VALUE and nothing else. put depth-tests, and it already tells
 * the caller whether the write landed, so "did this element end up owning this cell" is answered
 * exactly rather than inferred.
 *
 * THE FIRST CUT INFERRED IT, and it is written down because the numbers looked entirely plausible.
 * It tested `f.dist[i] === d || (before && f.lum[i] === l)` where `before` was `f.lum` — an ALIAS of
 * the live array, not a copy, so the second clause read the state AFTER the write and the first
 * compared a double against a Float32Array slot that holds Math.fround of it. Measured on the runs
 * this tool was shipping: the dist clause was true 0 times in 497,490 emits, and of the 197,312
 * emits the heuristic did accept, 93,545 had LOST the depth test. Cell counts came out 92 where the
 * tree owned 13 (seed 3), 394 where it owned 103 (seed 404); for the petal drift it ran the other
 * way too, dropping 61 of 129 real cells because put stores `lum | 0` and a fractional l never
 * matched. The verdicts happened not to change, which is the whole hazard: a photosensitivity mask
 * that silently drops half an element's cells can drop the hot one and still print PASS.
 *
 * The kind argument is forwarded. Nothing this tool draws passes one today, but every put in
 * src/optics.js, moon_ground.js, moon_craft.js, structure.js and market.js does, and defaulting it
 * to 3 in a file the contract names as a pattern to copy is a trap for whoever copies it. */
CC.put = function (f, x, y, g, c, l, d, k) {
  const ix = x | 0, iy = y | 0;
  const ok = rawPut(f, x, y, g, c, l, d, k);
  if (ok && TAG && ix >= 0 && iy >= 0 && ix < COLS && iy < ROWS) OWNED[iy * COLS + ix] = 1;
  return ok;
};

['world', 'proj', 'daylight', 'weather_state', 'city', 'surfaces', 'raycast', 'control']
  .forEach(m => require(R + 'src/' + m + '.js'));
fs.readdirSync(R + 'src').sort().forEach(p => { if (/^surf_.*\.js$/.test(p)) require(R + 'src/' + p); });
fs.readdirSync(R + 'src/elements').sort().forEach(p => require(R + 'src/elements/' + p));

/* An unknown stop is a USAGE error, not a NOT_MEASURED: the run would silently free-run its
   clock and report an hour it never held. Checked against STOPS rather than by calling
   Daylight.set once, because set() moves a module-level offset that deliberately survives
   Daylight.init (src/daylight.js:263-272) and a validation call would leave residue on every
   row that follows. */
if (typeof HOUR === 'string' && HOUR !== '' &&
    !CC.Daylight.STOPS.some(st => st.name === HOUR)) {
  console.error(`sakura-flicker: unknown --time=${HOUR_RAW} — expected a phase 0..1 or one of ` +
                CC.Daylight.STOPS.map(st => st.name).join(', '));
  process.exit(2);
}

const WARM = 360, NF = WARM + Math.round(SECONDS * 60), PROBES = [3.5, 5, 7, 9, 12, 15, 19];
const BIG = 255 / 3;                 // west-flicker's own definition of a big step
/* BAND_CAP IS THE PROJECT'S RULE — nothing above 2% of full scale between 3 and 20 Hz. RATE_CAP IS
   NOT: it is a house limit chosen for this probe, and it is an eighth of the 8.0/s absolute backstop
   tools/west-flicker.cjs applies. It is set here because a rate is the half of this measurement a
   still frame and a census both miss, and because the drift under test has tripped the band rule
   before by moving faster rather than by getting brighter. Anything failing on RATE_CAP alone is
   inside the project's stated rule and over this file's stricter one; say which when quoting it.

   NOTHING IS JUDGED EXCEPT AT ONE WINDOW, which is the rule tools/flicker-rate.cjs already states
   and this file twice failed to apply. A Goertzel amplitude on a broadband signal falls as one over
   the square root of the window, so the same unchanged tree measured 2.62% in band at 4 s, 1.82% at
   6 s, 0.97% at 10 s and 0.85% at 20 s — a verdict that flips with an argument is not a verdict.
   That much was fixed first, and the RATE was then exempted on the argument that it "has no bin
   width in it and is honest at any window". It is not. `big` is a MAXIMUM over cells of a big-step
   COUNT divided by the window, and the maximum of a small bursty count is biased upward as the
   window shrinks: the same six events on the same tree read 1.50/s at 4 s and 0.60/s at 10 s, and
   the 4 s run exits 1 — which this file's own table defines as a MEASURED VIOLATION, an accusation
   against the tree — for a difference that is entirely the divisor. So REF_WINDOW governs both, and
   at any other window both figures are PRINTED WITHOUT BEING JUDGED. */
const RATE_CAP = 1.00, BAND_CAP = 2.00, REF_WINDOW = 10;

function goertzel(x, f) {
  const n = x.length, w = 2 * Math.PI * f / 60, c = 2 * Math.cos(w);
  let s1 = 0, s2 = 0, m = 0;
  for (let i = 0; i < n; i++) m += x[i];
  m /= n;
  for (let i = 0; i < n; i++) {
    const v = (x[i] - m) * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1)));
    const s0 = v + c * s1 - s2; s2 = s1; s1 = s0;
  }
  return 2 * Math.sqrt(s1 * s1 + s2 * s2 - c * s1 * s2) / n;
}

function run(preset, seed, reduced, pinned) {
  CC.World.force('japan');
  CC.reducedMotion = !!reduced;
  const city = CC.City.make(seed);
  CC.Daylight.init(city);
  /* --time IS RE-PINNED EVERY TICK, not stamped once. Daylight.set moves an OFFSET against a t it
     defaults to 0, so a single call at init holds the requested stop only until the first
     Daylight.update — after which the clock runs on its 420 s cycle straight through a search that
     may last 40,000 frames (eleven minutes of clock, 1.6 full days) and out the far side into the
     measured window, while the header still prints the hour that was asked for. tools/headless.cjs
     re-pins inside its own loop for exactly this reason. Both loops below do the same. */
  if (HOUR !== '' && CC.Daylight.set) CC.Daylight.set(HOUR, 0);
  CC.Weather.init(city); CC.Control.reset();
  const live = CC.ELEMENTS.filter(e => CC.inWorld(e, 'japan')).sort((a, b) => (a.layer | 0) - (b.layer | 0));
  const rng = CC.mulberry(seed ^ 0x9e3779b9);
  for (const el of live) if (el.init) el.init(city, rng, { cols: COLS, rows: ROWS });
  /* Scoped as west-flicker and canal-flicker scope it: only elements EXCLUSIVE to this world. */
  const drawn = live.filter(e => e.world && CC.inWorld(e, 'japan') && !CC.inWorld(e, 'cyber'));
  const tgt = drawn.filter(e => e.name === TARGET);
  const rest = drawn.filter(e => e.name !== TARGET);

  const N = COLS * ROWS;
  const f = CC.makeFrame(COLS, ROWS);
  OWNED = new Uint8Array(N);
  const cam = { x: city.startX, z: city.startZ, yaw: 0, eyeY: 1.7, fov: 1.25,
                horizon: ROWS * 0.56, cellAspect: 0.5625, rows: ROWS, t: 0 };

  /* ---- WALK UNTIL THE TREE IS ACTUALLY IN SHOT, then pin. This is the whole point of the file.
     THE PIN FRAME IS REPORTED, because a walk that pins at frame 0 has not walked and is measuring
     the same pose the shipped pinned gates already measure. That is not hypothetical: with the
     over-counting attribution this file first shipped, every crown row met its threshold at k = 0
     and the tool was quietly a second copy of west-flicker while claiming to be its complement. */
  let best = 0, pinFrame = 0;
  if (!pinned) {
    let found = false;
    /* EVERY ELEMENT IS UPDATED ON EVERY FRAME OF THE SEARCH, not only on the frames that are
       sampled. A draw-only element like the crown does not notice; a SIMULATED one does, and this
       is where the first cut of this probe was wrong: with update() left out of the search loop,
       jp-blossom's pool never integrated, so the walk reported "no crown reached — best 0 cells"
       for a drift that the pinned run in the same process measured at 41 cells. An element that
       moves cannot be found by a search that does not let it move. */
    for (let k = 0; k < 40000 && !found; k++) {
      const t = k / 60;
      if (HOUR !== '' && CC.Daylight.set) CC.Daylight.set(HOUR, t);
      /* THE SEARCH WALKS IN THE WEATHER THE ROW IS ABOUT TO BE SCORED IN. Without this the
         search ran on the free-running schedule, so all three presets of a seed walked a
         byte-identical search and pinned at the same frame — and Surf.fog is exactly what
         decides whether a crown cell prints, so the '>=NEED cells print here' guarantee was
         being asserted in weather that was not the weather under test. tsuyu was the row that
         showed it: the same pose, a quarter of the lit cells of clear. */
      if (!CC.Weather.P.forced) CC.Weather.set(preset, t);
      CC.Daylight.update(1 / 60, t); CC.Weather.update(1 / 60, t);
      CC.Control.update(1 / 60, t, cam, city);
      for (const el of live) if (el.update) el.update(1 / 60, t, cam);
      if (k % 10) continue;
      cam.t = t; CC.clearFrame(f); CC.Cast.render(f, cam, city);
      for (const el of rest) if (el.draw) el.draw(f, cam, t);
      OWNED.fill(0); TAG = TARGET;
      for (const el of tgt) if (el.draw) el.draw(f, cam, t);
      TAG = null;
      /* THE THRESHOLD COUNTS CELLS THAT PRINT, not cells that are owned, and the print is what
         Compose.post decides — so it is run here exactly as it is in the measured loop. Counting
         owned cells let the search stop on invisible mass: at seed 3 the crown reached 64 owned
         cells of which ZERO printed above the v = 9 black line, and the probe pinned there and
         called it a measurement. A gate that pins on something the viewer cannot see is the same
         defect as a gate that never reaches the feature at all. */
      if (CC.Compose && CC.Compose.post) CC.Compose.post(f, cam, t);
      let n = 0; for (let i = 0; i < N; i++) if (OWNED[i] && f.lum[i] >= 9) n++;
      if (n > best) best = n;
      if (n >= NEED) found = true;
      if (found) pinFrame = k;
    }
    if (!found) return { cells: best, notFound: true };
  }

  /* THE MEASURED WINDOW CONTINUES THE SEARCH'S CLOCK, IT DOES NOT REWIND IT, and this is the
     defect that made the walk decorative. The search stops at the first frame where >=NEED of
     the element's cells PRINT, which is a statement about one instant of a 420 s daylight
     cycle; restarting t at 0 for the measured window then scored a different hour entirely.
     Measured on the tree this landed against: seed 3 pinned at f8000 (t = 133 s) with 63
     printing cells and was then scored at t = 0-10 s, where the same crown printed 9 cells on
     kiri and 2 on tsuyu — a black crown, contributing 0.00/s and 0.00% to a PASS. Carrying the
     clock over takes those rows to 68 and 64 lit and surfaces real signal that was invisible
     before (seed 3 clear reads 0.20/s and 0.56% in band where it read 0.00).
     The file already knew this failure mode — the --time note above re-pins the hour every tick
     for exactly this reason — but that guard only fires when an hour was ASKED for, and the two
     invocations CONTRACT.md gates on pass no --time at all.
     Nothing else moves: Control.update is not called in this loop, so the camera stays pinned;
     `keep`, `WARM` and the sampling index are untouched; and the pinned baseline run has
     pinFrame = 0, so its numbers are byte-identical to before. */
  const keep = NF - WARM, s = new Uint8Array(N * keep), mask = new Uint8Array(N);
  for (let k = 0; k < NF; k++) {
    const t = (pinFrame + k) / 60;
    if (!CC.Weather.P.forced) CC.Weather.set(preset, t);
    if (HOUR !== '' && CC.Daylight.set) CC.Daylight.set(HOUR, t);
    CC.Daylight.update(1 / 60, t); CC.Weather.update(1 / 60, t);
    for (const el of live) if (el.update) el.update(1 / 60, t, cam);
    cam.t = t; CC.clearFrame(f); CC.Cast.render(f, cam, city);
    for (const el of rest) if (el.draw) el.draw(f, cam, t);
    OWNED.fill(0); TAG = TARGET;
    for (const el of tgt) if (el.draw) el.draw(f, cam, t);
    TAG = null;
    /* A cell counts if the tree owned it at ANY point in the window: a petal that arrives and
       leaves is precisely the transient this gate is for, and a per-frame mask would drop it. */
    for (let i = 0; i < N; i++) if (OWNED[i]) mask[i] = 1;
    if (CC.Compose && CC.Compose.post) CC.Compose.post(f, cam, t);
    if (k >= WARM) { const b = (k - WARM) * N; for (let i = 0; i < N; i++) s[b + i] = f.lum[i]; }
  }

  let cells = 0, lit = 0, big = 0, band = 0, worst = 0;
  const x = new Float64Array(keep);
  for (let i = 0; i < N; i++) {
    if (!mask[i]) continue;
    cells++;
    /* OWNED IS NOT THE SAME AS SEEN, WHICH IS WHY THE PIN THRESHOLD COUNTS PRINTING CELLS AND
       NOT OWNED ONES (see the search loop). proj.js's
       emit() calls put for a cell fogged to lum 0 — real occluding mass that the element does own —
       so about half a crown's owned cells print nothing, and a threshold met on those is met on
       something invisible. Both counts are printed so the row cannot overstate what is on screen. */
    for (let k = 0; k < keep; k++) if (s[k * N + i] >= 9) { lit++; break; }
    let b = 0, mx = 0, prev = s[i];
    for (let k = 1; k < keep; k++) {
      const v = s[k * N + i], d = Math.abs(v - prev);
      if (d > mx) mx = d;
      if (d > BIG) b++;
      prev = v; x[k] = v;
    }
    x[0] = s[i];
    const rate = b / (keep / 60);
    if (rate > big) big = rate;
    if (mx > worst) worst = mx;
    for (const fq of PROBES) { const a = goertzel(x, fq); if (a > band) band = a; }
  }
  return { cells, lit, worst: 100 * worst / 255, big, band: 100 * band / 255, pinFrame };
}

console.log(`sakura rate gate — ${TARGET}, ${COLS}x${ROWS}, ${SECONDS}s measured of ${NF} frames, ` +
            `${WARM} discarded, pin at >=${NEED} PRINTING cells (v>=9)` +
            `${HOUR !== '' ? ', hour ' + HOUR : ''}\n`);
const rows = [];
for (const seed of [42, 3, 404])
  for (const p of ['kiri', 'clear', 'tsuyu']) {
    const r = run(p, seed, false, false);
    rows.push(r);
    console.log(`  seed ${String(seed).padStart(4)}  ${p.padEnd(7)}` +
      (r.notFound
        ? `(no crown reached — best ${r.cells} cells)`
        : `cells ${String(r.cells).padStart(4)}(${String(r.lit).padStart(3)} lit)  worst step ${r.worst.toFixed(1).padStart(5)}%   ` +
          `big steps ${r.big.toFixed(2).padStart(5)}/s   3-20Hz ${r.band.toFixed(2).padStart(5)}%   ` +
          `pinned f${String(r.pinFrame).padStart(5)}${r.pinFrame === 0 ? ' (DID NOT WALK)' : ''}`));
  }
const pin = run('kiri', 42, false, true);
console.log(`\n  pinned at start (what west-flicker sees): cells ${pin.cells}`);
const rm = run('tsuyu', 42, true, false);
console.log(`  reduced motion: ` + (rm.notFound ? '(no crown)' :
  `cells ${rm.cells}  big steps ${rm.big.toFixed(2)}/s  3-20Hz ${rm.band.toFixed(2)}%`));

/* A ROW IS A MEASUREMENT ONLY IF SOMETHING PRINTED IN IT. `cells` is the sticky OWNED mask and
   owned includes cells proj.js fogged to lum 0, so gating on it let a row that printed nothing
   at all across the whole window contribute 0.00/s and 0.00% to the maxima and carry the run to
   PASS — this tool's own defect, one level below the one it was written to close. THIN is the
   same argument short of zero: a handful of lit cells cannot clear or fail a rate gate, and a
   verdict taken on them is a verdict taken on nothing. Both are NOT_MEASURED and exit 3, which
   the header defines as 'this run reached no verdict' — not as a failure of the tree. */
const THIN = Math.max(4, NEED >> 2);
const seen = rows.filter(r => !r.notFound && r.lit > 0);
const thin = seen.filter(r => r.lit < THIN);
if (!seen.length) {
  console.log('\nRESULT: NOT_MEASURED — no walk reached a crown that PRINTS; this is the probe failing, not a PASS');
  process.exit(3);
}
if (thin.length) {
  console.log(`\nRESULT: NOT_MEASURED — ${thin.length} row(s) pinned on a crown printing under ` +
              `${THIN} cells (worst ${Math.min(...thin.map(r => r.lit))}); this is the probe failing, not a PASS`);
  process.exit(3);
}
const wBig = Math.max(...seen.map(r => r.big)), wBand = Math.max(...seen.map(r => r.band));
const rmBad = !rm.notFound && (rm.big > 0 || rm.band > 0.5);
const judging = SECONDS === REF_WINDOW;
/* A BIG-STEP RATE IS NOT A FLASH RATE, and the RESULT line has to say so or the two get quoted
   as if they were the same number. `big` counts frame-to-frame jumps over 85/255 on the worst
   cell, so a rate of r/s is about r/2 on-off events a second: the drift's 1.00/s is roughly half
   a hertz, an object crossing a cell, and the flash band this project actually rules on starts at
   3 Hz — which is what the separate 3-20 Hz figure measures. RATE_CAP is this file's house limit
   at an eighth of west-flicker's 8.0/s backstop, and the header above already says to name which
   rule a failure is under; until now the verdict line did not. */
const impliedHz = wBig / 2;
const bad = judging
  ? ((wBig > RATE_CAP ? ` big steps ${wBig.toFixed(2)}/s over this file's house limit of ` +
      `${RATE_CAP.toFixed(2)}/s (~${impliedHz.toFixed(2)} Hz of switching; the project's own ` +
      `backstop is 8.0/s and its flash band starts at 3 Hz)` : '') +
     (wBand > BAND_CAP ? ` 3-20Hz ${wBand.toFixed(2)}% over ${BAND_CAP.toFixed(2)}%` : '') +
     (rmBad ? ' reduced motion is not still' : ''))
  : '';
const walked = seen.filter(r => r.pinFrame > 0).length;
const wLit = Math.min(...seen.map(r => r.lit));   // the thinnest row a verdict was taken on
console.log(`\nRESULT: ${!judging ? 'NOT_JUDGED' : bad ? 'FAIL' + bad : 'PASS'}  ` +
            `(worst big steps ${wBig.toFixed(2)}/s, worst 3-20Hz ${wBand.toFixed(2)}%` +
            `${judging ? '' : `; both PRINTED NOT JUDGED — a verdict is only taken at the ${REF_WINDOW}s reference window`}` +
            `, i.e. ~${impliedHz.toFixed(2)} Hz of switching on the worst cell` +
            `, over a ${SECONDS}s window; thinnest row ${wLit} lit cells; ${walked}/${seen.length} rows walked off the start pose` +
            `${rm.notFound ? '; reduced-motion row found nothing — frozen by design, NOT a measured pass' : ''})`);
if (!judging) process.exit(3);
process.exit(bad ? 1 : 0);
