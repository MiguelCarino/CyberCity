/* PHOTOSENSITIVITY REGRESSION TEST for src/elements/weather.js's lightning.
 *
 *   node tools/lightning-rate.cjs [seed] [seconds]
 *
 * Drives the real element against a synthetic uniform wall, so what comes out is the element's own
 * intensity envelope with no city geometry modulating it, sampled once per 60 Hz frame. It prints
 * the series across the strongest stroke in the window, the position of every local maximum, the
 * gap between successive maxima in Hz, and the largest single-frame change as a fraction of the
 * peak. Then it checks them against the two rules the envelope is written to.
 *
 * THE RULES. No two maxima closer than 0.34 s, and no single frame may move the envelope by more
 * than a third of its peak. The first is the flash-rate ceiling (3 Hz, and lgEnv is built to sit at
 * half of it); the second is what stops a stroke arriving as a step edge across the whole viewport.
 * The envelope that shipped in the first cut failed both: two maxima 0.100 s apart — 10 Hz — and a
 * single 16 ms frame carrying 100% of the amplitude.
 *
 * EXIT CODES, and the third one is the whole reason this paragraph exists:
 *
 *     0   PASS            — strokes were measured and they obey both rules
 *     1   FAIL            — strokes were measured and one of the rules is broken
 *     2   usage error     — unknown sky, no lightning element
 *     3   NOT APPLICABLE  — the window contains no stroke at all, so NOTHING WAS MEASURED
 *
 * Code 3 is a bug fix. Under `--sky=mist` and `--sky=clear` weather.js scales the strike rate off
 * P.storm, which is 0.00 for both, so the window is legitimately empty — and this file used to
 * print "no strike in 600s" and `process.exit(0)` on the line that is now the NOT APPLICABLE
 * branch, BEFORE the sky-rate census below had run. Two of the six skies therefore reported
 * exactly what a clean storm reports, and any gate reading the exit code as a green light was
 * being told "this sky is safe" by a run that had measured nothing whatsoever. The absence of
 * strokes in those two skies is correct; a safety tool claiming to have verified it is not.
 *
 * Every run also prints one machine-readable last line, `RESULT: PASS|FAIL|NOT_APPLICABLE <sky>`,
 * for readers that would rather grep than switch on $?. A gate that treats any non-zero as a stop
 * will now stop on mist and clear, which is the honest reading: if you want "nothing to test is
 * fine" you have to say so, by special-casing 3 or by matching the RESULT line.
 */
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
/* Flags are filtered out of the positionals so that `--sky=storm` on its own still means seed 1.
 * Read straight off argv[2] it parsed to NaN, which flowed into CC.City.make(NaN) and produced a
 * degenerate city rather than an error — the tool reported a pass on a city that is not the one
 * that ships. Silent NaN is the worst failure mode a safety tool has. */
const ARGS = process.argv.slice(2).filter(function (a) { return a.indexOf('--') !== 0; });
const seed = parseInt(ARGS[0] || '1', 10);
const SECS = parseInt(ARGS[1] || '600', 10);
/* Which sky to test under. Default is `storm` and that is the point: weather.js scales both the
 * strike RATE and the amplitude off P.storm, and this file used to load no weather director at
 * all — so it exercised the element's REF fallback (the `rain` preset, storm 0.12) and the one
 * state that can actually hurt somebody went untested. `--sky=rain` reproduces the old reading. */
const skyArg = process.argv.find(a => a.indexOf('--sky=') === 0);
const SKY = skyArg ? skyArg.slice(6) : 'storm';

global.CC = require(path.join(root, 'src/core.js'));
global.window = undefined;
for (const rel of ['src/weather_state.js', 'src/city.js', 'src/surfaces.js', 'src/raycast.js',
                   'src/compose.js']) {
  const p = path.join(root, rel); if (fs.existsSync(p)) require(p);
}
const edir = path.join(root, 'src/elements');
for (const fn of fs.readdirSync(edir).sort()) if (fn.endsWith('.js')) require(path.join(edir, fn));
const CC = global.CC;

const MIN_PEAK_GAP = 0.34;      // seconds
const MAX_FRAME_STEP = 0.34;    // fraction of the stroke's peak

const city = CC.City.make(seed);
const rng = CC.mulberry(seed ^ 0x9e3779b9);
/* The sky is pinned by WRITING THE PARAMETER BLOCK, not through Weather.set(). set() is a viewer
 * control and the schedule is entitled to take it back — it releases the override the moment a
 * segment boundary passes the timestamp, which over a ten-minute window happens within the first
 * two minutes. The first version of this pin did exactly that and every sky converged on the same
 * 47-stroke reading, which is the scheduled weather, not the sky asked for. A regression test
 * wants the parameter held flat for the whole window, so it holds it itself.
 * P is the live block every element reads, and it is never reallocated, so overwriting the eight
 * fields in place after each director tick is what "this sky, for ten minutes" means. */
let PIN = null;
if (CC.Weather) {
  CC.Weather.init(city, CC.mulberry(seed ^ 0x5bf03635));
  PIN = CC.Weather.PRESETS.filter(p => p.name === SKY)[0];
  if (!PIN) { console.error('unknown sky: ' + SKY); process.exit(2); }
}
function pinSky() {
  if (!PIN) return;
  const P = CC.Weather.P, K = CC.Weather.KEYS;
  for (let i = 0; i < K.length; i++) P[K[i]] = PIN.p[i];
  P.name = P.from = P.to = PIN.name; P.blend = 1;
}
const els = CC.ELEMENTS.slice().sort((a, b) => (a.layer | 0) - (b.layer | 0));
for (const el of els) if (el.init) el.init(city, rng, { cols: 200, rows: 60 });
const lg = els.find(e => e.name === 'lightning');
if (!lg) { console.error('no lightning element'); process.exit(2); }

/* A flat wall at 8 m filling the frame. Every cell is eligible, so the sum of what the element adds
 * is proportional to its intensity and nothing else. */
const f = CC.makeFrame(60, 20);
const cam = { x: city.startX, z: city.startZ, yaw: 0, eyeY: 1.7, fov: 1.25,
              horizon: 11.2, cellAspect: 0.5625, t: 0 };
const N = SECS * 60, S = new Float64Array(N);
for (let k = 0; k < N; k++) {
  const t = k / 60;
  /* The director is ticked in lockstep, exactly as main.js does it, because the element reads the
   * live P block every frame and a stale one would freeze the storm ramp mid-transition. */
  if (CC.Weather) { CC.Weather.update(1 / 60, t); pinSky(); }
  lg.update(1 / 60, t, cam);
  for (let i = 0; i < f.n; i++) { f.ch[i] = 1; f.col[i] = 5; f.lum[i] = 40; f.dist[i] = 8; f.kind[i] = 1; }
  lg.draw(f, cam, t);
  let sum = 0; for (let i = 0; i < f.n; i++) sum += f.lum[i] - 40;
  S[k] = sum / f.n;
}

let bi = 0; for (let k = 0; k < N; k++) if (S[k] > S[bi]) bi = k;
/* An empty window is NOT a pass, and it used to exit 0 right here — see the exit-code table at the
 * top. The flag is carried down instead so that the sky-rate census below still runs and still
 * prints (it reports the honest zeros), and the verdict is decided once, at the bottom. */
const NOSTRIKE = S[bi] <= 0;
const a = Math.max(0, bi - 8), b = Math.min(N, bi + 84);

/* HOW OFTEN, across the WHOLE window, not just inside the one stroke printed below. The per-stroke
 * envelope is only half the safety question — a stroke that is individually gentle is still a
 * strobe if the next one lands a fifth of a second later — and the old version of this file could
 * not see that, because it only ever looked at 1.5 s around the single strongest stroke.
 *
 * The measure is the guideline's own: count FLASHES (local maxima carrying at least 5% of the
 * window's peak, the same threshold used below) and find the worst one-second sliding window.
 * Three in a second is the ceiling; this build is written to sit at half of it. A stroke is a run
 * of frames above 2% of peak, reported only so the strike RATE — which weather.js scales off
 * P.storm — is visible as a number rather than inferred. */
const MAX_FLASH_HZ = 3;
const allPk = [], starts = [];
for (let k = 1; k < N - 1; k++) {
  if (S[k] >= S[k - 1] && S[k] > S[k + 1] && S[k] > S[bi] * 0.05) allPk.push(k);
  if (S[k] > S[bi] * 0.02 && S[k - 1] <= S[bi] * 0.02) starts.push(k);
}
let worstHz = 0, worstAt = 0;
for (let i = 0, j = 0; i < allPk.length; i++) {
  while (allPk[i] - allPk[j] > 60) j++;            // widest window ending at flash i, one second
  if (i - j + 1 > worstHz) { worstHz = i - j + 1; worstAt = allPk[j]; }
}
const rateBad = worstHz > MAX_FLASH_HZ;
if (rateBad) { /* fall through to the report; ok is cleared below */ }
/* The verdict token on this line says `not measured` rather than `ok` when the window is empty,
 * because a rate census over zero strokes is not a rate anybody checked. */
console.log(`sky '${SKY}': ${starts.length} strokes in ${SECS}s = one per ` +
            `${starts.length ? (SECS / starts.length).toFixed(1) : '-'}s, ${allPk.length} flashes, ` +
            `worst second holds ${worstHz} at t=${(worstAt / 60).toFixed(2)}s   ` +
            (NOSTRIKE ? 'not measured (no strokes in window)' : rateBad ? `FAIL (> ${MAX_FLASH_HZ} Hz)` : 'ok'));

if (NOSTRIKE) {
  console.log(`no strike in ${SECS}s for seed ${seed} under '${SKY}': the envelope rules below were ` +
              `NOT exercised — nothing to measure, so nothing is verified. Try another seed, or a ` +
              `sky whose P.storm is non-zero (storm, rain, drizzle) if you meant to test them.`);
  console.log('NOT APPLICABLE');
  console.log(`RESULT: NOT_APPLICABLE ${SKY}`);
  process.exit(3);
}

console.log(`seed ${seed}: strongest stroke peaks at t=${(bi / 60).toFixed(2)}s.`);
console.log('added luminance per cell, one value per 60 Hz frame:');
const ser = []; for (let k = a; k < b; k++) ser.push(S[k].toFixed(2).padStart(6));
for (let i = 0; i < ser.length; i += 12) console.log('   ' + ser.slice(i, i + 12).join(''));

const pk = [];
for (let k = a + 1; k < b - 1; k++)
  if (S[k] >= S[k - 1] && S[k] > S[k + 1] && S[k] > S[bi] * 0.05) pk.push(k);
console.log('maxima above 5% of peak: ' + (pk.map(k => (k / 60).toFixed(3) + 's').join(', ') || 'one only'));

let ok = !rateBad;
for (let i = 1; i < pk.length; i++) {
  const dt = (pk[i] - pk[i - 1]) / 60;
  const bad = dt < MIN_PEAK_GAP;
  if (bad) ok = false;
  console.log(`  gap ${dt.toFixed(3)}s = ${(1 / dt).toFixed(2)} Hz   ${bad ? 'FAIL (< ' + MIN_PEAK_GAP + 's)' : 'ok'}`);
}
let ms = 0, msk = 0;
for (let k = a + 1; k < b; k++) { const d = Math.abs(S[k] - S[k - 1]) / S[bi]; if (d > ms) { ms = d; msk = k; } }
const stepBad = ms > MAX_FRAME_STEP;
if (stepBad) ok = false;
console.log(`largest single-frame step ${(ms * 100).toFixed(1)}% of peak at t=${(msk / 60).toFixed(3)}s   ` +
            (stepBad ? `FAIL (> ${MAX_FRAME_STEP * 100}%)` : 'ok'));
/* The step above is RELATIVE, which is the conservative reading and the one that gates the build,
 * but on a weak sky it is relative to a peak that is itself nearly nothing. Printing the peak in
 * absolute terms is what stops a 32%-of-peak step on a 6%-of-full-scale drizzle stroke being read
 * as the same event as a 32% step on a storm. Full scale is 255, the whole luminance range. */
console.log(`  stroke peak ${(100 * S[bi] / 255).toFixed(1)}% of full scale; that step is ` +
            `${(100 * ms * S[bi] / 255).toFixed(2)}% of full scale`);
console.log(ok ? 'PASS' : 'FAIL');
console.log(`RESULT: ${ok ? 'PASS' : 'FAIL'} ${SKY}`);
process.exit(ok ? 0 : 1);
