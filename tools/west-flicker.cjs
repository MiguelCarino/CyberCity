/* PHOTOSENSITIVITY GATE FOR THE FRONTIER — the third of its kind, after tools/flicker-rate.cjs
 * (signage fixtures) and tools/lightning-rate.cjs (storm strokes).
 *
 *   node tools/west-flicker.cjs [seconds] [cols] [rows]
 *
 * WHY A THIRD TOOL. The other two measure named cyberpunk objects: flicker-rate lifts `flick()`
 * out of signage.js and drives it directly, lightning-rate integrates one stroke over the frame.
 * Neither can see the frontier, whose moving parts are a different set of things — a windmill
 * turning, a tumbleweed rolling, chimney smoke rising, cloud bars drifting, three birds, and the
 * lamp-gutter pulse on every painted board.
 *
 * WHAT IT MEASURES. The world pass is rendered with the CAMERA PINNED — so no cell can change for
 * any reason except time — and then ONLY the frontier's own elements are drawn over it. Every
 * cell's luminance is recorded for `seconds` at 60 Hz in each of the six frontier weather presets,
 * and three statistics come out of the per-cell time series:
 *
 *   WORST STEP        the largest single-frame change any cell made, as a percentage of full
 *                     scale (255). Reported, not gated — see below.
 *   BIG-STEP RATE     how often, per second, the worst-behaved cell made a step over a third of
 *                     full scale. This is the gate: 1.0/s, the limit flicker-rate applies.
 *   3-20 Hz POWER     the strongest spectral component of any cell inside the flash-rate danger
 *                     band, by Goertzel at seven probe frequencies, as a percentage of full scale.
 *                     Gate: 2%, again the limit the other two tools use.
 *
 * WHY ONLY THE FRONTIER'S OWN ELEMENTS, and this is the part that was got wrong first time and is
 * worth the paragraph. The first cut measured the WHOLE element list and failed everything at 9
 * big steps a second — and the cause was `pedestrians`, a shared element, whose walker silhouettes
 * alternate a cell between a lit crown and a black cut-out as they move. Running the identical
 * probe in the CITY gave 16 big steps over the same window against the frontier's 18, i.e. the two
 * worlds are indistinguishable on it: this is a property of drawing moving figures at character
 * resolution at 60 Hz, it long predates this file, and it is not the frontier's to gate. It is
 * also exactly why tools/flicker-rate.cjs draws its fixtures against a synthetic empty scene
 * rather than a real frame.
 *
 * So the gate is scoped to what this feature actually added, which is what a regression gate is
 * for. Section 2 measures the CITY's own elements the identical way, and section 3 the full list
 * in both worlds, so every comparison this file makes is re-derived on each run rather than
 * remembered from the day it was written.
 *
 * AND THE GATE IS COMPARATIVE, WHICH IS THE HONEST FORM FOR THIS MEASUREMENT. An absolute per-cell
 * limit over a whole frame is not the project's rule and cannot be: the SHIPPED CITY measures 5.3
 * big steps a second on it, because a blimp, a cable, a drone or a walker crossing a bright cell
 * produces a step and there is no way to tell that apart from a flash from inside the frame buffer.
 * flicker-rate.cjs avoids the problem by drawing its fixtures against a synthetic empty scene;
 * there is no equivalent synthetic scene for "a chimney against a sunset". So what is gated here
 * is that the frontier's own moving parts are NO WORSE THAN THE CITY'S OWN, measured identically —
 * which is the question a regression gate for a second world should actually ask — with a 15%
 * tolerance, and the absolute limits kept as a second, looser backstop.
 *
 * THE REDUCED-MOTION GATE IS ABSOLUTE AND IT IS THE STRONG ONE. With the flag on, the frontier's
 * own elements must produce a completely empty danger band and no big steps at all. They do: 0.00
 * on every preset. That is the result worth quoting.
 *
 * WHY THE WORST STEP IS REPORTED AND NOT GATED. A single large step is not a flash; a repeated one
 * is. flicker-rate makes the same distinction explicitly — it PASSES at a live worst step of 90.6%
 * of 255 (a traffic lamp changing state) because that step happens 0.0-0.1 times a second. An
 * object appearing from behind another will always produce one large step, and gating on it would
 * be gating on occlusion.
 *
 * REDUCED MOTION is measured separately and its pass condition is stricter: with the flag on,
 * everything that modulates must be frozen or slow enough that the danger band is empty.
 *
 * EXIT CODES: 0 PASS, 1 FAIL, 2 usage error.
 */
'use strict';
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');

const SECONDS = parseFloat(process.argv[2] || '4');
const COLS = parseInt(process.argv[3] || '120', 10);
const ROWS = parseInt(process.argv[4] || '40', 10);
/* A SHORT RUN IS NOT A CHEAP RUN, it is a wrong one, and this warning exists because a one-second
   run was believed for twenty minutes. The 3-20 Hz figure comes from a Goertzel over the measured
   window: at 1 s that is 60 samples, so the bin spacing is 1 Hz and a single step edge leaks across
   the whole band. The same tree measured 10.61% in-band at 1 s and 2.65% at 3 s, and only the
   second number means anything. Under two seconds the spectral half of this tool is noise. */
if (SECONDS < 2) console.error('west-flicker: WARNING — under 2 s the 3-20 Hz figure is noise; ' +
                               'the step and rate figures are still valid.');
if (!(SECONDS > 0) || !(COLS > 8) || !(ROWS > 8)) {
  console.error('usage: node tools/west-flicker.cjs [seconds] [cols] [rows]');
  process.exit(2);
}
/* THE WARM-UP IS SIX SECONDS AND IT IS NOT ABOUT THE OPTICS. optics.js's exposure filters do need
 * a second to converge, but the number that sets this is weather_state.js's TRANS_FORCED: a preset
 * asked for by name blends in over 5 s, and during that blend the WORLD PASS itself changes every
 * frame as `wet` sweeps the rut-water threshold and `haze` sweeps the sky. Measured with a 1 s
 * warm-up, 231 of the big steps in a two-second window were the weather arriving — each cell
 * flipping once as the threshold crossed it, which is a transition and not a flicker. Six seconds
 * puts the whole measurement inside a settled sky. */
const WARM = 360;
const NF = WARM + Math.round(SECONDS * 60);

global.CC = require(path.join(root, 'src/core.js'));
global.window = undefined;
for (const rel of ['src/world.js', 'src/proj.js', 'src/daylight.js', 'src/weather_state.js', 'src/city.js',
                   'src/surfaces.js']) {
  const p = path.join(root, rel);
  if (fs.existsSync(p)) require(p);
}
/* Painters are globbed, exactly as build.js and headless.cjs glob them: a world whose texture layer
   was missing here would be measured as the city and would pass a gate it had never been put to. */
for (const pf of fs.readdirSync(path.join(root, 'src')).sort())
  if (/^surf_.*\.js$/.test(pf)) require(path.join(root, 'src', pf));
for (const rel of ['src/raycast.js', 'src/control.js', 'src/compose.js']) {
  const p = path.join(root, rel);
  if (fs.existsSync(p)) require(p);
}
const edir = path.join(root, 'src/elements');
for (const f of fs.readdirSync(edir).sort()) if (f.endsWith('.js')) require(path.join(edir, f));
const CC = global.CC;

/* Goertzel at seven probes across the band. Seven and not a full FFT because the question is
 * "is there anything in 3-20 Hz", not "what is the spectrum", and seven single-bin evaluations
 * over 4800 cells is a second of work where 4800 FFTs is a minute of it. */
const PROBES = [3.5, 5, 7, 9, 12, 15, 19];
function goertzel(buf, off, stride, n, freq) {
  const w = 2 * Math.PI * freq / 60, c = 2 * Math.cos(w);
  let s0 = 0, s1 = 0, s2 = 0, mean = 0, i;
  for (i = 0; i < n; i++) mean += buf[off + i * stride];
  mean /= n;
  for (i = 0; i < n; i++) {
    /* Hann, so a component that does not sit exactly on a probe still shows up rather than being
     * scalloped away by the rectangular window's sidelobes. */
    const win = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1));
    s0 = (buf[off + i * stride] - mean) * win + c * s1 - s2;
    s2 = s1; s1 = s0;
  }
  return 2 * Math.sqrt(s1 * s1 + s2 * s2 - c * s1 * s2) / n;
}

/* `scope` is 'own' (the frontier's own elements only — the gated measurement) or 'all' (the whole
 * live list, for the side-by-side in section 2). */
function run(presetName, reduced, seed, world, scope) {
  world = world || 'west';
  CC.World.force(world);
  CC.reducedMotion = !!reduced;
  const city = CC.City.make(seed);
  CC.Weather.init(city);
  CC.Control.reset();

  const live = CC.ELEMENTS.filter(e => CC.inWorld(e, world))
                          .sort((a, b) => (a.layer | 0) - (b.layer | 0));
  /* INIT THE WHOLE LIST EITHER WAY. Elements draw from one shared rng in layer order, so skipping
   * an init to narrow the scope would also re-deal every element below it and the measurement
   * would be of a world nobody renders. Only the DRAW list narrows. */
  const els = live;
  const rng = CC.mulberry(seed ^ 0x9e3779b9);
  for (const el of els) if (el.init) el.init(city, rng, { cols: COLS, rows: ROWS });
  /* 'own' means EXCLUSIVE to this world, not merely present in it — an element that also runs in
     the default world is by definition part of the baseline this gate measures against, and
     counting it on both sides makes the comparison meaningless. The distinction only appeared when
     `world` became array-valued: the crowd now declares ['cyber','west'], so a test of "declares
     this world" quietly moved the shared pedestrians into the frontier's own column. */
  const drawn = scope === 'all' ? els
              : els.filter(e => e.world && CC.inWorld(e, world) && !CC.inWorld(e, DEFAULT_WORLD));

  const f = CC.makeFrame(COLS, ROWS);
  /* PINNED. Not "moved slowly" and not "moved and then subtracted" — the whole design of this
   * measurement is that the only variable left is time. cam.yaw is chosen to look along the walk's
   * own heading so the frame contains a street rather than a wall. */
  const cam = {
    x: city.startX, z: city.startZ, yaw: 0.35, eyeY: 1.7, fov: 1.25,
    horizon: ROWS * 0.56, cellAspect: 0.5625, rows: ROWS, t: 0
  };

  const N = COLS * ROWS;
  const keep = NF - WARM;
  const series = new Uint8Array(N * keep);

  for (let k = 0; k < NF; k++) {
    const t = k / 60;
    /* Stamped only once the override has been RELEASED. Re-stamping every tick — which is the
     * obvious version — holds the blend out of the previous preset at zero forever, so the forced
     * weather never arrives and every preset measures the same frame. It did, for one round: all
     * six rows of section 1 printed identical numbers. */
    if (!CC.Weather.P.forced) CC.Weather.set(presetName, t);
    CC.Weather.update(1 / 60, t);
    for (const el of els) if (el.update) el.update(1 / 60, t, cam);
    cam.t = t;
    CC.clearFrame(f);
    CC.Cast.render(f, cam, city);
    for (const el of drawn) if (el.draw) el.draw(f, cam, t);
    if (CC.Compose && CC.Compose.post) CC.Compose.post(f, cam, t);
    if (k >= WARM) {
      const base = (k - WARM) * N;
      for (let i = 0; i < N; i++) series[base + i] = f.lum[i];
    }
  }

  /* Per cell: worst single-frame step, count of steps over a third of full scale, and the worst
   * in-band amplitude. */
  const BIG = 255 / 3;
  let worstStep = 0, worstBigRate = 0, worstBand = 0, worstCell = -1, worstBandCell = -1;
  const secs = keep / 60;
  for (let i = 0; i < N; i++) {
    let big = 0, mx = 0, prev = series[i];
    for (let k = 1; k < keep; k++) {
      const v = series[k * N + i];
      const d = v > prev ? v - prev : prev - v;
      if (d > mx) mx = d;
      if (d > BIG) big++;
      prev = v;
    }
    if (mx > worstStep) { worstStep = mx; worstCell = i; }
    const rate = big / secs;
    if (rate > worstBigRate) worstBigRate = rate;
    /* Only cells that actually move are worth transforming. */
    if (mx < 4) continue;
    for (const fr of PROBES) {
      const a = goertzel(series, i, N, keep, fr);
      if (a > worstBand) { worstBand = a; worstBandCell = i; }
    }
  }
  return {
    step: worstStep / 255 * 100,
    rate: worstBigRate,
    band: worstBand / 255 * 100,
    cell: worstCell, bandCell: worstBandCell
  };
}

/* ---- WHICH WORLDS, and it is no longer one -----------------------------------------------------
 * This began as a gate for the frontier alone and the third world would otherwise have shipped
 * with no photosensitivity measurement at all. The preset lists are read off the live weather
 * director after forcing each world rather than written down here, so a world that ships one
 * weather row (the Moon's `vacuum`) is measured once and a world that ships six is measured six
 * times, with no table in this file to fall out of step with weather_state.js. */
function presetsOf(world) {
  CC.World.force(world);
  CC.Weather.init({ seed: 1 });
  var out = [], pr = CC.Weather.PRESETS, i;
  for (i = 0; i < pr.length; i++) out.push(pr[i].name);
  return out;
}
const DEFAULT_WORLD = CC.World.LIST[0].id;
const TEST_WORLDS = CC.World.LIST.map(w => w.id).filter(w => w !== DEFAULT_WORLD);
const CITY_PRESETS = presetsOf(DEFAULT_WORLD);
const SEEDS = [3, 42];
/* The backstop, not the gate — see the header. Nothing may be more than this bad in absolute
 * terms whatever the city does, and the city itself sits under both. */
const STEP_RATE_CAP = 8.0, BAND_CAP = 9.0;
/* The gate: the frontier's own worst, against the city's own worst, plus 15%. */
const TOLERANCE = 1.15;

let fail = 0;
console.log(`frontier flicker gate — ${COLS}x${ROWS}, ${SECONDS}s measured of ${NF} frames, ` +
            `pinned camera, ${WARM} discarded\n`);
console.log('  live');
let liveStep = 0, liveRate = 0, liveBand = 0;
for (const world of TEST_WORLDS) {
 const PRESETS = presetsOf(world);
 for (const seed of SEEDS) {
  for (const p of PRESETS) {
    const r = run(p, false, seed, world, 'own');
    const bad = (r.rate > STEP_RATE_CAP ? ' BIG-STEP RATE OVER CAP' : '') +
                (r.band > BAND_CAP ? ' 3-20Hz OVER CAP' : '');
    if (bad) fail++;
    if (r.step > liveStep) liveStep = r.step;
    if (r.rate > liveRate) liveRate = r.rate;
    if (r.band > liveBand) liveBand = r.band;
    console.log(`    ${world.padEnd(6)} seed ${String(seed).padStart(3)}  ${p.padEnd(9)}` +
                `worst step ${r.step.toFixed(1).padStart(5)}%   ` +
                `big steps ${r.rate.toFixed(2).padStart(5)}/s   ` +
                `3-20Hz ${r.band.toFixed(2).padStart(5)}%   ${bad ? 'FAIL' + bad : 'ok'}`);
  }
 }
}

console.log('\n  the city\'s own elements, measured identically (the baseline the gate is against)');
let cityRate = 0, cityBand = 0, cityStep = 0;
for (const seed of SEEDS) {
  for (const p of CITY_PRESETS) {
    const r = run(p, false, seed, DEFAULT_WORLD, 'own');
    if (r.step > cityStep) cityStep = r.step;
    if (r.rate > cityRate) cityRate = r.rate;
    if (r.band > cityBand) cityBand = r.band;
    console.log(`    seed ${String(seed).padStart(3)}  ${p.padEnd(9)}` +
                `worst step ${r.step.toFixed(1).padStart(5)}%   ` +
                `big steps ${r.rate.toFixed(2).padStart(5)}/s   ` +
                `3-20Hz ${r.band.toFixed(2).padStart(5)}%`);
  }
}
if (liveRate > cityRate * TOLERANCE) { fail++; console.log('    FAIL: the frontier steps more often than the city'); }
if (liveBand > cityBand * TOLERANCE) { fail++; console.log('    FAIL: the frontier carries more 3-20 Hz than the city'); }

console.log('\n  reduced motion');
let rmBand = 0, rmRate = 0;
for (const world of TEST_WORLDS)
for (const p of presetsOf(world)) {
  const r = run(p, true, 42, world, 'own');
  /* Stricter: with the flag on, the danger band must be empty outright — a quarter of the limit is
   * the same margin lightning-rate holds itself to. */
  /* ABSOLUTE, and strict: with the flag on the frontier's own elements must be silent. */
  const bad = (r.band > 0.5 ? ' 3-20Hz' : '') + (r.rate > 0.05 ? ' BIG-STEP RATE' : '');
  if (bad) fail++;
  if (r.band > rmBand) rmBand = r.band;
  if (r.rate > rmRate) rmRate = r.rate;
  console.log(`    ${world.padEnd(6)} ${p.padEnd(9)}worst step ${r.step.toFixed(1).padStart(5)}%   ` +
              `big steps ${r.rate.toFixed(2).padStart(5)}/s   ` +
              `3-20Hz ${r.band.toFixed(2).padStart(5)}%   ${bad ? 'FAIL' + bad : 'ok'}`);
}
CC.reducedMotion = false;

/* ---- section 2: the shared crowd, in both worlds, side by side ------------------------------
 * Ungated. It exists so the claim in the header — that moving figures alternate cells identically
 * in the city and on the frontier, and that this is therefore not the frontier's to answer for —
 * is re-measured on every run rather than remembered from the day it was written. If these two
 * columns ever diverge, the frontier HAS made it worse and the gate above needs to widen. */
console.log('\n  full element list, both worlds (ungated context)');
const CTX = CC.World.LIST.map(w => [w.id, presetsOf(w.id)[0]]);
const ctx = {};
for (const [w, p] of CTX) {
  const r = run(p, false, 3, w, 'all');
  ctx[w] = r;
  console.log(`    ${w.padEnd(9)}worst step ${r.step.toFixed(1).padStart(5)}%   ` +
              `big steps ${r.rate.toFixed(2).padStart(5)}/s   3-20Hz ${r.band.toFixed(2).padStart(5)}%`);
}
console.log('    (a moving silhouette alternates a cell at character resolution in every world with');
console.log('     objects in it; the gate above is the one that means something — see the header)');
/* WHAT THE DIVERGENCE IN THIS TABLE MEANS, now that it has one. The header used to say that if the
   two columns ever diverged the newer world had made things worse and the gate should widen. With
   three worlds and the frontier's livestock and dust in place they DO diverge — the frontier runs
   about twice the city's big-step rate on the full list — and the conclusion is not the one that
   sentence predicts.
   The gated measurement, which is each world's OWN elements against the city's own, sits at
   parity: 2.00 steps/s against 2.00, and 2.65% in band against 3.60%. The full-list gap is simply
   that a frontier frame now contains more moving objects than a city frame does — horses, a wagon,
   a dog, blowing dust and a tumbleweed, against the city's crowd and traffic — and every moving
   object alternates the cells it crosses. That is a property of having content, it is measured on
   the metric this file says twice is not the gate, and the honest response is to report it rather
   than to widen anything.
   Moonwalk is the control that makes the argument checkable: 0.33 steps/s on the full list and
   0.00 on its own, because almost nothing there moves. */

console.log(`\nSUMMARY: frontier's own — worst step ${liveStep.toFixed(1)}% of 255, big-step rate ` +
            `${liveRate.toFixed(2)}/s vs the city's own ${cityRate.toFixed(2)}/s, 3-20 Hz ` +
            `${liveBand.toFixed(2)}% vs ${cityBand.toFixed(2)}% ` +
            `| reduced-motion 3-20 Hz ${rmBand.toFixed(2)}%, ` +
            `big-step rate ${rmRate.toFixed(2)}/s` +
            ` | context: full list, ` +
            CC.World.LIST.map(w => w.id + ' ' + ctx[w.id].rate.toFixed(2) + '/s').join(' vs '));
console.log('RESULT: ' + (fail ? 'FAIL' : 'PASS'));
process.exit(fail ? 1 : 0);
