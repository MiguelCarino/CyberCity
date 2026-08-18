/* Render one frame with no browser. Usage:
     node tools/headless.cjs [seed] [frame] [cols] [rows] [--cold] > f.txt
   Loads whatever src modules exist, so it stays useful while the build is half-written.

   THIS HARNESS REPLAYS THE WHOLE FRAME, NOT JUST THE UPDATES. See the replay loop below: until
   this round it called update() on every tick and draw() exactly once at the end, which is not
   the shape of main.js and quietly pinned three optics passes at their cold-start values in every
   offline frame this project had measured up to that point. */
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
/* Flags are stripped before the positional args are read, so --cold can go anywhere on the line
   instead of having to come after four positionals nobody wants to type. Matched on the double
   dash and not on a leading '-', because a lone '-' is how a negative seed would arrive. */
const argv = process.argv.slice(2);
const flags = argv.filter(a => a.slice(0, 2) === '--');
const pos = argv.filter(a => a.slice(0, 2) !== '--');
const cold = flags.indexOf('--cold') >= 0;
const seed  = parseInt(pos[0] || '1', 10);
const frameN= parseInt(pos[1] || '0', 10);
const cols  = parseInt(pos[2] || '200', 10);
const rows  = parseInt(pos[3] || '60', 10);

global.CC = require(path.join(root, 'src/core.js'));
global.window = undefined;
const order = ['src/world.js','src/proj.js','src/daylight.js','src/weather_state.js','src/city.js','src/surfaces.js','src/raycast.js','src/control.js','src/compose.js'];
/* Painters are globbed, exactly as build.js globs them, so a new world's texture layer is present
   offline the moment the file exists — the harness rendering a different element/painter set from
   the browser is the one failure this whole tool exists to prevent. */
for (const pf of fs.readdirSync(path.join(root, 'src')).sort())
  if (/^surf_.*\.js$/.test(pf)) order.splice(order.indexOf('src/raycast.js'), 0, 'src/' + pf);
for (const rel of order) {
  const p = path.join(root, rel);
  if (fs.existsSync(p)) require(p);
}
const edir = path.join(root, 'src/elements');
if (fs.existsSync(edir))
  for (const f of fs.readdirSync(edir).sort()) if (f.endsWith('.js')) require(path.join(edir, f));

const CC = global.CC;

/* WHICH WORLD, and it has to be chosen BEFORE the city is made — city.js resolves CC.World once
   inside make() and the map is the frontier or the city from that moment on. `--world=west`, or
   just `--west`, because that is what gets typed. */
/* The bare shorthand is checked against the REGISTRY rather than against a pair of literals, so
   `--moon` works the day the world exists instead of being silently ignored and rendering the city
   under the new world's name. */
const wArg = flags.map(a => a.replace(/^--/, ''))
                  .find(a => a.slice(0, 6) === 'world=' ||
                             !!(CC.World && CC.World.at(a) && CC.World.at(a).id === a));
if (wArg && CC.World) CC.World.force(wArg.slice(0, 6) === 'world=' ? wArg.slice(6) : wArg);
const WORLD = CC.World ? CC.World.id : 'cyber';

/* ---- tuning overrides, and they are ONLY for tuning ------------------------------------------
   Neither of these is a thing the browser does on its own, so a frame rendered with either is not
   the frame the browser draws and stderr says so. They exist because the two questions this
   harness cannot otherwise answer are "what does the sunset look like" (the walk faces wherever
   the route sends it, and the sun is in one fixed direction) and "what does the dust storm look
   like" (a preset the schedule reaches once in several thousand frames).
     --yaw=<radians>    hold the camera's heading after every camera update
     --weather=<name>   force a preset, by name, from t=0                                       */
const yawArg = flags.find(a => a.slice(0, 6) === '--yaw=');
const YAW = yawArg ? parseFloat(yawArg.slice(6)) : null;
const wxArg = flags.find(a => a.slice(0, 10) === '--weather=');
if (wxArg && CC.Weather) CC.Weather.set(wxArg.slice(10), 0);
/* --time=<stop|0..1> pins the hour, which is not a thing the browser does on its own either: the
   clock runs on a 420 s cycle, so a fixture that wants noon cannot wait for it. */
const tmArg = flags.find(a => a.slice(0, 7) === '--time=');
const TIME = tmArg ? tmArg.slice(7) : null;
const f = CC.makeFrame(cols, rows);
const t = frameN / 60;

const city = CC.City ? CC.City.make(seed) : null;
if (CC.Daylight) CC.Daylight.init(city);
if (CC.Weather) CC.Weather.init(city, CC.mulberry(seed ^ 0x5bf03635));
if (CC.Control) CC.Control.reset();
const cam = {
  x: city && city.startX !== undefined ? city.startX : 0.5,
  z: city && city.startZ !== undefined ? city.startZ : 0.5,
  yaw: 0, eyeY: 1.7, fov: 1.25, horizon: rows * 0.56, scale: rows * 0.9, t: t
};
// The camera advance MUST come from the city itself, exactly as main.js drives it. An earlier
// version of this harness advanced cam.z here on its own, which faked motion the browser never
// had and hid a shipped bug where the walk never started at all.
// Camera is advanced inside the replay loop below, once per tick, exactly as main.js's step()
// does — see the comment there. Advancing it once to the final pose and then replaying updates
// against that frozen pose is what the second review caught: five street elements spawn and cull
// relative to the camera basis inside update(), so a pinned pose gives them a history that never
// happened.

const rng = CC.mulberry(seed ^ 0x9e3779b9);
// Layer-sorted BEFORE init, because main.js does the same and every element pulls from this one
// shared rng: a different init order gives every downstream element a different stream, and the
// offline reference frame stops being the frame the browser draws.
/* Gated on world exactly as main.js gates it, and gated BEFORE the layer sort so the shared rng
   is drawn in the same order the browser draws it. An element with no `world` belongs to both. */
const els = CC.ELEMENTS.filter(e => CC.inWorld(e, WORLD))
                       .sort((a, b) => (a.layer | 0) - (b.layer | 0));
for (const el of els) { if (el.init) el.init(city, rng, {cols, rows}); }

/* One rendered frame, in main.js's render() order and with main.js's clear. Nothing here is
   optional on a warm-up tick: an element that measures the frame measures the FINISHED frame, so
   the world pass and every element below it have to have run before it looks. */
function renderAt(kt) {
  cam.t = kt;
  CC.clearFrame(f);
  if (CC.Cast) CC.Cast.render(f, cam, city);
  for (const el of els) if (el.draw) el.draw(f, cam, kt);
  if (CC.Compose && CC.Compose.post) CC.Compose.post(f, cam, kt);
}

/* THE REPLAY. One outer loop over ticks: camera, then every element's update(), then the frame is
 * DRAWN — the exact shape of main.js's tick(), which calls step() and then render() every time
 * round. Element updates must see the camera pose of THEIR OWN tick, not the final one.
 *
 * WHY THE WARM-UP DRAWS ARE NOT WASTE, which is the bug this loop was rewritten to fix. Three
 * passes in src/elements/optics.js measure the FRAME inside draw() and integrate that measurement
 * inside update(): the exposure pass's two lagged luminance filters, the light-shaft detector, and
 * the light-wash detector. Their update() opens by returning if no frame has been measured yet, so
 * a replay that called update() 9000 times and draw() once left all three sitting at exactly their
 * cold-start values — exposure's adaptation pinned at 1.000 with its filters never seeded, the
 * shafts landing on a first detection with no easing history behind them, and the wash's lean term
 * (which IS the eased position's lag, so it can only exist once easing has run) at a flat zero, so
 * no offline frame ever rendered has shown the wedge leaning. Every palette share, black
 * percentage and luminance histogram this project has published was therefore measured on a frame
 * the browser only draws once, at start-up.
 *
 * The audit behind that list was run over all 38 elements by proxying every element object and
 * recording which fields are written in draw() and read in update(); those three are the whole
 * set. (pedestrians also refreshes this.cols/rows/cells in draw(), but init() is handed the same
 * dims by this harness, so it reads the right numbers from its first tick and has no hole.)
 *
 * WHAT IT COST THE OLD NUMBERS, measured cold against warm over seeds 5,10,...,150 (thirty seeds,
 * an arithmetic list, not four hand-picked ones) at 400x100. POOLED, almost nothing: at frame 600
 * the lit-energy pillars move amber 38.62% -> 38.55% and azure 33.90% -> 33.97%, black 60.58% ->
 * 60.66%. PER SEED, quite a lot: the exposure gain at frame 600 runs from 0.897 (seed 150) to
 * 1.060 (seed 80) where the old harness reported exactly 1.000 for every seed, and half the seeds
 * are more than 2% off it. That moves one frame's census by up to 1.8 points of black, 1.1 points
 * of hot tail and 2.3 of mean printed value at frame 600, and up to 3.8 / 1.6 / 3.1 at frame 3000.
 * So: a pooled palette share fitted the old way is still good, and any threshold fitted to a
 * SINGLE frame was fitted to that frame's adaptation as much as to the print curve.
 *
 * The cost is honest and it is the raycast's: a warm tick is a full 400x100 render, about 8 ms, of
 * which 5.8 ms is CC.Cast.render. --cold skips the warm-up and restores the old behaviour for the
 * cases where only the seed's geometry matters and the wait does not pay — it is NOT the frame the
 * browser draws, and it says so on stderr. Sweeps are per-seed independent, so the wait is a
 * `seq ... | xargs -P 8` away from being eight times shorter. */
const t0 = Date.now();
for (let k = 0; k <= frameN; k++) {
  const kt = k / 60;
  // Weather first: an element's update() this tick must see this tick's weather.
  if (CC.Daylight) {
    /* Re-pinned every tick, unlike the weather: the clock has no "forced" flag to test because it
       has no schedule to release an override back to — set() only moves an offset, so re-setting
       to the same stop is idempotent and costs one frac(). */
    if (TIME !== null) CC.Daylight.set(/^[\d.]+$/.test(TIME) ? parseFloat(TIME) : TIME, kt);
    CC.Daylight.update(1 / 60, kt);
  }
  if (CC.Weather) {
    /* Re-stamped only once the override has been RELEASED — the schedule drops it whenever the
       segment under it moves on, which is right for a viewer and wrong for a fixture. Stamping it
       every tick instead is the obvious version and it is broken: the blend out of the previous
       preset is measured from the stamp, so re-stamping holds it at zero forever and the forced
       weather never arrives. */
    if (wxArg && !CC.Weather.P.forced) CC.Weather.set(wxArg.slice(10), kt);
    CC.Weather.update(1 / 60, kt);
  }
  // Through Control, exactly as main.js drives it. With no DOM attached it is pure autopilot,
  // so this is the same walk city.camera produced before control.js existed -- and that is the
  // point: an untouched keyboard has to render the frame this harness renders.
  if (CC.Control) CC.Control.update(1 / 60, kt, cam, city);
  else if (city && city.camera) city.camera(cam, city, kt);
  if (YAW !== null) cam.yaw = YAW;
  for (const el of els) if (el.update) el.update(1 / 60, kt, cam);
  // The last tick's draw is the frame we print, and it happens below so that cam.t is the
  // requested t exactly. Every earlier tick is drawn and thrown away, for its side effects on the
  // three measuring passes above.
  if (!cold && k < frameN) renderAt(kt);
}
renderAt(t);
const ms = Date.now() - t0;

const out = [];
out.push('CCFRAME 2');   // v2 adds the kind byte as a fourth field per cell
out.push(cols + ' ' + rows);
out.push('PALETTE ' + CC.PALETTE.map(c => c.join(',')).join(' '));
out.push('GLYPHS ' + JSON.stringify(CC.GLYPHS.join('')));
for (let y = 0; y < rows; y++) {
  const line = [];
  for (let x = 0; x < cols; x++) {
    const i = y * cols + x;
    line.push(f.ch[i] + ',' + f.col[i] + ',' + f.lum[i] + ',' + f.kind[i]);
  }
  out.push(line.join(' '));
}
process.stdout.write(out.join('\n') + '\n');
/* The exposure gain is reported on stderr because it is the one thing about this frame that no
   census of the dump can recover: it is a scalar already multiplied into every lum, so a reader
   comparing two seeds cannot tell a darker city from an eye that had just walked out of one.
   Measured over seeds 5..150 step 5 at frame 600 it lands between 0.897 and 1.060, so quoting a
   frame's numbers without it is quoting a measurement taken at an unstated exposure. */
const ex = els.filter(e => e.name === 'exposure' && typeof e.adapt === 'number')[0];
process.stderr.write(`rendered seed=${seed} frame=${frameN} ${cols}x${rows} world=${WORLD} time=${CC.Daylight ? CC.Daylight.P.name : '-'} elements=${els.length}/${CC.ELEMENTS.length} ` +
  (cold ? 'COLD-START (adaptation pinned, NOT the browser frame) ' : `replay=${frameN + 1} frames `) +
  (ex ? `exposure=${ex.adapt.toFixed(3)} ` : '') +
  `in ${ms}ms\n`);
