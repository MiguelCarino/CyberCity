/* PHOTOSENSITIVITY / STEP-EDGE REGRESSION TEST for the flicker personalities in
 * src/elements/signage.js — the sibling of tools/lightning-rate.cjs, same rules, different unit.
 *
 *   node tools/flicker-rate.cjs [signage.js path] [seconds] [phases]
 *
 * lightning-rate.cjs measures the FRAME: it sums what the element adds over every cell, which is
 * the right unit for a stroke that lights the whole viewport at once. It is the wrong unit for a
 * sign. A street holds a hundred fixtures at a hundred phases and their sum is smooth however
 * badly any one of them behaves, so a single tube stepping half its brightness in one frame is
 * invisible to a frame-level statistic and perfectly visible to a person looking at that tube.
 *
 * So this measures the fixture. Two passes:
 *
 * 1. PERSONALITY — the real `flick()` is lifted out of the source file by brace matching and run
 *    directly (no copy of it lives in this tool; if the shipped function changes, the number
 *    changes). Each personality is sampled once per 60 Hz frame for `seconds`, at `phases`
 *    different values of ph, and reported as:
 *      - largest single-frame step, as a percentage of full scale (the multiplier is a fraction of
 *        the fixture's own peak brightness, so full scale is 1.0), plus the same step as a
 *        percentage of the value it came from — a jump from 0.43 to 0.88 is +45% of full scale and
 *        +105% relative, and both are worth knowing;
 *      - dropout rate per second and mean dropout depth, a dropout being an excursion below 0.60
 *        that has to climb back over 0.75 before another one can be counted;
 *      - the strongest spectral component between 3 and 20 Hz (Hann window, amplitude as a
 *        percentage of full scale) — the flash-rate danger band.
 *
 * 2. FIXTURE — the real `neon` element is drawn against a synthetic far wall with a FROZEN camera,
 *    so no cell can change for any reason except flicker, and the largest frame-to-frame change of
 *    any single cell's luminance is reported. That is the artifact as the eye actually receives it.
 *
 * THE RULES, inherited from lightning-rate.cjs: no single frame may move a fixture by more than a
 * third of full scale, nothing may beat between 3 and 20 Hz above 2% of full scale, and no more
 * than 3 dropouts a second. Reduced motion must additionally freeze every personality dead.
 *
 * EXIT CODES. 0 PASS, 1 FAIL, 2 usage error, and — new, and the same repair tools/lightning-rate.cjs
 * just had — 3 NOT APPLICABLE: every rule that ran passed, but at least one check MEASURED NOTHING
 * and so verified nothing. Three paths through this file could do that while still exiting 0:
 *
 *   - `fixture()` returns null when the named element is not in CC.ELEMENTS (a rename in
 *     signage.js is enough), and section 2 used to `continue` past it in silence;
 *   - a fixture that paints no cell in any of the eight bearings printed "no fixture in view" and
 *     was scored as a pass, because `bad` is gated on `r.painted > 0`;
 *   - section 3 prints "SKIP — the bob line has moved" when the string it patches out of
 *     signage.js no longer matches, and skipped the entire holo scan-band test.
 *
 * None of those is a violation, and none of them is a verification either. They now collect in
 * `notApplicable`, print as an explicit NOT MEASURED block at the end, and turn the exit code into
 * 3 so a gate cannot read "we never looked" as "we looked and it was fine". A real violation still
 * beats them to it: FAIL is exit 1 whatever else was skipped.
 *
 * The last two lines of a run are machine-readable:
 *     SUMMARY: live <pct>% of 255 <what> | reduced-motion <pct>% of 255
 *     RESULT: PASS|FAIL|NOT_APPLICABLE
 * SUMMARY names the worst LIVE per-cell step (section 2) and the worst reduced-motion step
 * (section 4) separately and always, because those two numbers have been confused in a report
 * before: "worst per-cell frame step 0/255 on both fixtures under every sky" is section 4's
 * result — reduced motion, where zero is the pass condition — and it is not section 2's, which
 * on this build runs to 74.1% of 255 under storm and 94.1% under drizzle and clear (signals, a
 * traffic lamp changing state, which passes on the RATE rule at 0.000-0.100 big steps/s against
 * the 1.0/s limit). Quote SUMMARY's own words or say which section you are quoting.
 */
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
/* Positionals are taken from the arguments that are NOT flags, and that is a bug fix, not tidying.
 * argv[2] used to be read as the source path unconditionally, so the `--sky=rain` invocation this
 * file's own header prescribes resolved to <root>/--sky=rain and the tool died in readFileSync
 * before it measured anything. A safety tool that cannot be run the way its documentation says to
 * run it is a safety tool nobody runs, so the flag is filtered out here and again below. */
const ARGS = process.argv.slice(2).filter(function (a) { return a.indexOf('--') !== 0; });
const SRC = path.resolve(ARGS[0] || path.join(root, 'src/elements/signage.js'));
const SECS = parseFloat(ARGS[1] || '60');
const PHASES = parseInt(ARGS[2] || '24', 10);

const MAX_FRAME_STEP = 0.34;   // fraction of full scale
const MAX_BAND_AMP = 0.02;     // fraction of full scale, 3-20 Hz
const MAX_DROPOUTS = 3;        // per second

global.CC = require(path.join(root, 'src/core.js'));
global.window = undefined;
const CC = global.CC;

/* ---- lift flick() out of the shipped source ------------------------------------------------ */
function lift(file, name) {
  const src = fs.readFileSync(file, 'utf8');
  const at = src.indexOf('function ' + name + '(');
  if (at < 0) throw new Error('no function ' + name + ' in ' + file);
  let i = src.indexOf('{', at), depth = 0, end = -1;
  for (let k = i; k < src.length; k++) {
    const c = src[k];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) { end = k + 1; break; } }
  }
  if (end < 0) throw new Error('unbalanced braces in ' + name);
  const body = src.slice(at, end);
  /* The module aliases a handful of CC members at its top; hand the lifted function the same
   * names so it can be run outside its IIFE without editing a character of it. */
  const fn = new Function('CC', 'vnoise', 'clamp', 'hash2', body + '\nreturn ' + name + ';')(
    CC, CC.vnoise, CC.clamp, CC.hash2);
  return { fn: fn, text: body };
}
const lifted = lift(SRC, 'flick');
const flick = lifted.fn;
console.log(`source: ${path.relative(root, SRC)}   ${SECS}s @60Hz x ${PHASES} phases`);
console.log('lifted flick():\n' + lifted.text.split('\n').map(l => '    ' + l).join('\n') + '\n');

/* ---- the personalities, as the draw loops call them ----------------------------------------- */
const KINDS = [
  { label: 'kind 0  steady tube      ', kind: 0, j: 0, dead: -1 },
  { label: 'kind 1  failing starter  ', kind: 1, j: 0, dead: -1 },
  { label: 'kind 2  live character   ', kind: 2, j: 0, dead: -1 },
  { label: 'kind 2  DEAD character   ', kind: 2, j: 3, dead: 3 },
  { label: 'kind 3  slow breath      ', kind: 3, j: 0, dead: -1 },
];

const N = Math.round(SECS * 60);
const S = new Float64Array(N);

function spectrum(s) {                       // strongest component in 3..20 Hz, Hann windowed
  const n = s.length;
  let mean = 0; for (let k = 0; k < n; k++) mean += s[k]; mean /= n;
  const w = new Float64Array(n);
  for (let k = 0; k < n; k++) w[k] = (s[k] - mean) * 0.5 * (1 - Math.cos(2 * Math.PI * k / (n - 1)));
  const b0 = Math.ceil(3 * n / 60), b1 = Math.floor(20 * n / 60);
  let best = 0, bf = 0;
  for (let b = b0; b <= b1; b++) {
    let re = 0, im = 0;
    const wstep = 2 * Math.PI * b / n;
    for (let k = 0; k < n; k++) { const a = wstep * k; re += w[k] * Math.cos(a); im -= w[k] * Math.sin(a); }
    const amp = 2 * Math.sqrt(re * re + im * im) / n / 0.5;   // /0.5 undoes Hann coherent gain
    if (amp > best) { best = amp; bf = b * 60 / n; }
  }
  return { amp: best, hz: bf };
}

function run(label, kind, j, dead, reduced) {
  CC.reducedMotion = !!reduced;
  let maxStep = 0, maxStepRel = 0, maxAt = 0, drops = 0, depthSum = 0, bigSteps = 0;
  let band = { amp: 0, hz: 0 }, lo = 1e9, hi = -1e9, constAll = true;
  for (let p = 0; p < PHASES; p++) {
    const ph = (p + 0.5) / PHASES;
    for (let k = 0; k < N; k++) S[k] = flick(kind, ph, k / 60, j, dead);
    let armed = true;
    for (let k = 0; k < N; k++) {
      const v = S[k];
      if (v < lo) lo = v; if (v > hi) hi = v;
      if (k) {
        const d = Math.abs(v - S[k - 1]);
        if (d > maxStep) { maxStep = d; maxAt = k / 60; maxStepRel = d / Math.max(S[k - 1], 1e-9); }
        if (d > MAX_FRAME_STEP) bigSteps++;
        /* A dropout is a downward CROSSING, not a sample that happens to be low: a personality
         * that sits at 0.10 for ever (the dead character) is one dark glyph, not ten thousand
         * dropouts, and counting samples would have said the second thing. */
        if (armed && v < 0.60 && S[k - 1] >= 0.60) {
          armed = false; drops++;
          let mn = v;
          for (let q = k; q < N && S[q] < 0.75; q++) if (S[q] < mn) mn = S[q];
          depthSum += 1 - mn;
        } else if (!armed && v > 0.75) armed = true;
      }
    }
    if (hi - lo > 1e-12) constAll = false;
    if (!constAll) { const sp = spectrum(S); if (sp.amp > band.amp) band = sp; }
  }
  const secs = SECS * PHASES;
  return { label, maxStep, maxStepRel, maxAt, rate: drops / secs, depth: drops ? depthSum / drops : 0,
           bigRate: bigSteps / secs, band, lo, hi, constAll };
}

function report(r, checks) {
  const flags = [];
  if (checks) {
    if (r.maxStep > MAX_FRAME_STEP) flags.push('FAIL step');
    if (r.band.amp > MAX_BAND_AMP) flags.push('FAIL 3-20Hz');
    if (r.rate > MAX_DROPOUTS) flags.push('FAIL dropouts');
  }
  console.log(
    `${r.label} range ${r.lo.toFixed(3)}..${r.hi.toFixed(3)}` +
    `  step ${(r.maxStep * 100).toFixed(1)}% fs (${(r.maxStepRel * 100).toFixed(0)}% rel, ` +
    `${r.bigRate.toFixed(3)} over-${MAX_FRAME_STEP * 100 | 0}%/s)` +
    `  dropouts ${r.rate.toFixed(2)}/s @ ${(r.depth * 100).toFixed(0)}% deep` +
    `  3-20Hz ${(r.band.amp * 100).toFixed(2)}% fs${r.band.amp > 1e-9 ? ' @ ' + r.band.hz.toFixed(2) + 'Hz' : ''}` +
    (flags.length ? '   ' + flags.join(' ') : '   ok'));
  return !flags.length;
}

let ok = true;
/* Every check that could not be run, in the order it was skipped. Non-empty means the exit code is
 * 3 and the run verified less than its section headings claim — see the exit-code note at the top. */
const notApplicable = [];
console.log('1. PERSONALITY — flick() multiplier, one sample per frame');
for (const K of KINDS) ok = report(run(K.label, K.kind, K.j, K.dead, false), true) && ok;

console.log('\n   reduced motion (every personality must be frozen):');
for (const K of KINDS) {
  const r = run(K.label, K.kind, K.j, K.dead, true);
  const good = r.constAll && r.band.amp === 0;
  if (!good) ok = false;
  console.log(`${r.label} constant ${r.lo.toFixed(3)}   ${good ? 'ok' : 'FAIL — still moving'}`);
}
CC.reducedMotion = false;


/* ---- 2. the real element, frozen camera ------------------------------------------------------
 * The camera does not move, so a cell can only change because a fixture changed it, and the
 * largest frame-to-frame change of any ONE cell is the artifact as the eye receives it.
 *
 * The verdict is per cell and on the RATE, not on the existence of a big step. A frame-wide "did
 * anything jump" counter says a street of twenty junctions changes hard twice a second, which is
 * true and is not a defect: a traffic light going amber is supposed to be a hard cut, and no single
 * lamp does it more than about six times in its 46 s cycle. What separates a state change from a
 * flicker edge is how often ONE cell does it. Expected standing values on a clean build, so a
 * regression shows up against them: neon and shop spill 0.000/s, signals 0.04-0.10/s (the lamp
 * cycle), holo 0.25/s (see below).
 *
 * Holo is the one that needs saying. The advert bobs 0.28 m on a 19 s sine, so its own character
 * grid drifts across the screen raster at about a third of a grid row a second, and every crossing
 * re-registers a cell of a panel that is 50% dropout by design — full-scale, and unavoidable for
 * any object that moves across a character grid at all (the walking camera does far more of it than
 * the bob does). That drift would also MASK a regression in the scan band, which is a real flicker
 * edge, so the band is tested separately below with the bob patched out of the source.
 */
/* weather_state.js is loaded, and that is a change: without it CC.Weather is absent, rel() falls
 * back to 1.0 everywhere, and signage.js's AT.gust comes out at exactly 1 — which switches the
 * wind gutter OFF at its `AT.gust <= 1.02` guard. The gutter is a per-fixture luminance carrier
 * that exists only in wind, so the tool that guards the 34% ceiling was measuring the one sky in
 * which the newest flicker source in the file does nothing at all. It is pinned to `storm` by
 * default for the same reason lightning-rate.cjs is: test the worst case, not the average one.
 * `--sky=rain` reproduces the reading this tool gave before the director was wired in. */
for (const rel of ['src/weather_state.js', 'src/city.js', 'src/surfaces.js', 'src/raycast.js',
                   'src/compose.js']) {
  const p = path.join(root, rel); if (fs.existsSync(p)) require(p);
}
const skyArg = process.argv.find(a => a.indexOf('--sky=') === 0);
const SKY = skyArg ? skyArg.slice(6) : 'storm';
let PIN = null;
/* The parameter block is written directly rather than through Weather.set(), because set() is a
 * viewer control the schedule is entitled to revoke at the next segment boundary — see the same
 * note in lightning-rate.cjs, where a pin through set() silently released after two minutes. */
function pinSky() {
  if (!CC.Weather) return;
  if (!PIN) {
    PIN = CC.Weather.PRESETS.filter(function (q) { return q.name === SKY; })[0];
    if (!PIN) { console.error('unknown sky: ' + SKY); process.exit(2); }
  }
  const P = CC.Weather.P, K = CC.Weather.KEYS;
  for (let i = 0; i < K.length; i++) P[K[i]] = PIN.p[i];
  P.name = P.from = P.to = PIN.name; P.blend = 1;
}
const edir = path.join(root, 'src/elements');
for (const fn of fs.readdirSync(edir).sort()) if (fn.endsWith('.js')) require(path.join(edir, fn));

const SEEDS = [0, 7, 42, 555];
const NAMES = ['neon', 'shopSpill', 'signals', 'holo'];
const MAX_CELL_RATE = 1.0;      // big steps a second in one cell, above which it is flicker
const COLS = 200, ROWS = 60;

/* One element, one seed, eight compass bearings, 20 s each at 60 Hz. */
function fixture(name, seed, els, secsEach) {
  const el = els.find(e => e.name === name);
  if (!el) return null;
  const f = CC.makeFrame(COLS, ROWS);
  const big = new Uint32Array(f.n);
  let worst = 0, worstYaw = 0, worstT = 0, painted = 0, rate = 0;
  for (let yi = 0; yi < 8; yi++) {
    const yaw = yi * Math.PI / 4;
    /* Per bearing: a cell index is a different fixture in every direction, so the counts cannot be
     * pooled across them without diluting the one view that has a sign in it. */
    big.fill(0);
    const cam = { x: city_.startX, z: city_.startZ, yaw: yaw, eyeY: 1.7, fov: 1.25,
                  horizon: ROWS * 0.56, cellAspect: 0.5625, t: 0 };
    let prev = null;
    const N2 = Math.round(secsEach * 60);
    for (let k = 0; k < N2; k++) {
      const t = k / 60;
      // Every tick, exactly as main.js does it: the element reads the live P block from update().
      if (CC.Weather) { CC.Weather.update(1 / 60, t); pinSky(); }
      for (let i = 0; i < f.n; i++) { f.ch[i] = 1; f.col[i] = 5; f.lum[i] = 0; f.dist[i] = 1e6; f.kind[i] = 1; }
      if (el.update) el.update(1 / 60, t, cam);
      el.draw(f, cam, t);
      const cur = Float64Array.from(f.lum);
      for (let i = 0; i < f.n; i++) if (cur[i] > 0) painted++;
      if (prev) {
        let fw = 0;
        for (let i = 0; i < f.n; i++) {
          const d = Math.abs(cur[i] - prev[i]) / 255;
          if (d > MAX_FRAME_STEP) big[i]++;
          if (d > fw) fw = d;
        }
        if (fw > worst) { worst = fw; worstYaw = yaw; worstT = t; }
      }
      prev = cur;
    }
    let mx = 0; for (let i = 0; i < big.length; i++) if (big[i] > mx) mx = big[i];
    if (mx / secsEach > rate) rate = mx / secsEach;
  }
  return { worst, rate, painted, worstYaw, worstT };
}

let city_ = null;
/* The worst LIVE per-cell step of the whole run, kept so the summary at the bottom can name it.
 * Section 4's number is tracked separately and deliberately: the two get quoted as one. */
let liveWorst = 0, liveWorstWhat = 'nothing measured';
console.log('\n2. FIXTURE — real element, frozen camera, largest per-cell luminance change between frames');
for (const seed of SEEDS) {
  city_ = CC.City.make(seed);
  if (CC.Weather) { CC.Weather.init(city_, CC.mulberry(seed ^ 0x5bf03635)); pinSky(); }
  const rng = CC.mulberry(seed ^ 0x9e3779b9);
  const els = CC.ELEMENTS.slice().sort((a, b) => (a.layer | 0) - (b.layer | 0));
  for (const el of els) if (el.init) el.init(city_, rng, { cols: COLS, rows: ROWS });
  for (const name of NAMES) {
    const r = fixture(name, seed, els, 20);
    /* An element this tool cannot find is a hole in the coverage, not a clean bearing: `continue`
     * here used to drop the whole fixture out of the run without touching `ok`. */
    if (!r) {
      console.log(`  seed ${String(seed).padStart(3)}  ${name.padEnd(10)} NOT MEASURED — no element named '${name}' in CC.ELEMENTS`);
      notApplicable.push(`2. seed ${seed} ${name}: element not present, nothing measured`);
      continue;
    }
    if (r.painted === 0)
      notApplicable.push(`2. seed ${seed} ${name}: painted no cell in any of the 8 bearings, nothing measured`);
    if (r.painted > 0 && r.worst > liveWorst) { liveWorst = r.worst; liveWorstWhat = `seed ${seed} ${name}, yaw ${r.worstYaw.toFixed(2)}, t=${r.worstT.toFixed(2)}s, sky '${SKY}'`; }
    const bad = r.painted > 0 && r.worst > MAX_FRAME_STEP && r.rate > MAX_CELL_RATE;
    if (bad) ok = false;
    console.log(`  seed ${String(seed).padStart(3)}  ${name.padEnd(10)} cells painted ${String(r.painted).padStart(7)}` +
                `   worst per-cell frame step ${(r.worst * 100).toFixed(1)}% of 255` +
                `   busiest cell over-${MAX_FRAME_STEP * 100 | 0}% ${r.rate.toFixed(3)}/s` +
                `  (yaw ${r.worstYaw.toFixed(2)}, t=${r.worstT.toFixed(2)}s)   ` +
                (r.painted === 0 ? 'NOT MEASURED — no fixture in view' : bad ? 'FAIL' : 'ok'));
  }
}

/* ---- 3. the holo scan band, with the panel's drift patched out ------------------------------- */
const HOLO_STILL_MAX = 0.10;
const bobLine = 'if (!CC.reducedMotion) hy += Math.sin(t * 0.33 + ph * 6.283) * 0.28;';
const src = fs.readFileSync(SRC, 'utf8');
console.log('\n3. HOLO SCAN BAND — same element with the 0.28 m bob deleted from the source, so the' +
            '\n   panel is nailed to the raster and the only thing left that can move a cell is the band');
if (src.indexOf(bobLine) < 0) {
  /* A skip is not a pass. This branch used to print and leave `ok` alone, so a one-character edit
   * to that line in signage.js silently deleted the scan-band test from every future run. */
  console.log('   NOT MEASURED — the bob line has moved; update `bobLine` in this tool');
  notApplicable.push('3. holo scan band: bob line not found in signage.js, section not run');
} else {
  const tmp = path.join(require('os').tmpdir(), 'signage-nobob-' + process.pid + '.js');
  fs.writeFileSync(tmp, src.replace(bobLine, ''));
  const before = CC.ELEMENTS.length;
  require(tmp);
  const still = CC.ELEMENTS.slice(before);
  for (const seed of SEEDS) {
    city_ = CC.City.make(seed);
  if (CC.Weather) { CC.Weather.init(city_, CC.mulberry(seed ^ 0x5bf03635)); pinSky(); }
    const rng = CC.mulberry(seed ^ 0x9e3779b9);
    for (const el of still) if (el.init) el.init(city_, rng, { cols: COLS, rows: ROWS });
    const r = fixture('holo', seed, still, 20);
    /* The patched copy has to actually register an element; if requiring it added nothing named
     * holo, `fixture` returns null and this line used to throw on r.painted — a crash reads as a
     * broken tool rather than as an unmeasured rule, so it is reported as the latter. */
    if (!r) {
      console.log(`  seed ${String(seed).padStart(3)}  holo (still)  NOT MEASURED — the patched source registered no 'holo' element`);
      notApplicable.push(`3. seed ${seed} holo (still): patched source has no holo element, nothing measured`);
      continue;
    }
    if (r.painted === 0)
      notApplicable.push(`3. seed ${seed} holo (still): no panel in view, nothing measured`);
    const bad = r.painted > 0 && r.worst > HOLO_STILL_MAX;
    if (bad) ok = false;
    console.log(`  seed ${String(seed).padStart(3)}  holo (still)  worst per-cell frame step ` +
                `${(r.worst * 100).toFixed(1)}% of 255   busiest cell ${r.rate.toFixed(3)}/s   ` +
                (r.painted === 0 ? 'NOT MEASURED — no panel in view' : bad ? `FAIL (> ${HOLO_STILL_MAX * 100}%)` : 'ok'));
  }
  fs.unlinkSync(tmp);
}

/* ---- 4. reduced motion ----------------------------------------------------------------------
 * flick() being frozen is not the whole claim. Every other moving part in the file has its own
 * guard — the shop pool's breath, the signal cycle and its amber blink, the advert's bob and its
 * scan sweep — and the contract says every element must damp or freeze. With the camera frozen
 * too, nothing in any of these four elements may move a single cell by a single unit. */
console.log('\n4. REDUCED MOTION — frozen camera, CC.reducedMotion = true, nothing may move at all');
CC.reducedMotion = true;
let rmWorst = 0;
for (const seed of [0, 555]) {
  city_ = CC.City.make(seed);
  if (CC.Weather) { CC.Weather.init(city_, CC.mulberry(seed ^ 0x5bf03635)); pinSky(); }
  const rng = CC.mulberry(seed ^ 0x9e3779b9);
  const els = CC.ELEMENTS.slice().sort((a, b) => (a.layer | 0) - (b.layer | 0));
  for (const el of els) if (el.init) el.init(city_, rng, { cols: COLS, rows: ROWS });
  for (const name of NAMES) {
    const r = fixture(name, seed, els, 12);
    if (!r) {
      console.log(`  seed ${String(seed).padStart(3)}  ${name.padEnd(10)} NOT MEASURED — no element named '${name}' in CC.ELEMENTS`);
      notApplicable.push(`4. seed ${seed} ${name}: element not present, nothing measured`);
      continue;
    }
    /* A frozen element that painted nothing is the one case where "worst step 0" is arithmetic
     * about an empty set. It is the exact shape of claim this tool exists to stop being made. */
    if (r.painted === 0)
      notApplicable.push(`4. seed ${seed} ${name}: painted no cell, its 0/255 is an empty set`);
    if (r.worst > rmWorst) rmWorst = r.worst;
    const bad = r.worst > 0;
    if (bad) ok = false;
    console.log(`  seed ${String(seed).padStart(3)}  ${name.padEnd(10)} cells painted ${String(r.painted).padStart(7)}` +
                `   worst per-cell frame step ${(r.worst * 255).toFixed(0)}/255   ` +
                (r.painted === 0 ? 'NOT MEASURED — no fixture in view' : bad ? 'FAIL — still moving' : 'ok'));
  }
}
CC.reducedMotion = false;

if (notApplicable.length) {
  console.log('\nNOT MEASURED (these checks verified nothing; they are not passes):');
  for (const s of notApplicable) console.log('   ' + s);
}
/* Two numbers, always both, always labelled with which section they came from — section 2 is the
 * live build and section 4 is reduced motion, and a report has already quoted the second as if it
 * were the first. See the note at the top of this file. */
console.log(`\nSUMMARY: live worst per-cell step ${(liveWorst * 100).toFixed(1)}% of 255 (${liveWorstWhat}) | ` +
            `reduced-motion worst ${(rmWorst * 255).toFixed(0)}/255`);
const verdict = !ok ? 'FAIL' : (notApplicable.length ? 'NOT_APPLICABLE' : 'PASS');
console.log(verdict === 'NOT_APPLICABLE' ? 'NOT APPLICABLE' : verdict);
console.log(`RESULT: ${verdict} ${SKY}`);
process.exit(verdict === 'PASS' ? 0 : verdict === 'FAIL' ? 1 : 3);
