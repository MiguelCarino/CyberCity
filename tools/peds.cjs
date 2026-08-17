/* THE CROWD, WITH NO CITY BEHIND IT. Usage:
     node tools/peds.cjs [cols] [rows] [seconds] > peds.txt   # then tools/topng.py

   The pedestrians are the one element that cannot be checked in a rendered frame. A figure is a
   black cut-out with a lit edge, most of the crowd is six to twenty rows tall, and the frame it
   lives in is a dark street with several thousand other lit cells in it — so "does the new costume
   read" is a question a whole-frame dump physically cannot answer. Worse, a costume that draws
   NOTHING (an accessory that reaches outside its archetype's `ext`, a span whose v1 lands above
   its v0) costs no cells and throws no error. It just quietly stops being in the picture, which is
   exactly the failure this file exists to make visible.

   So: run the SHIPPED element — its own init/update/draw, no drawing re-implemented here — against
   an empty frame with no city, no road and no signage, for as many seconds as asked, and dump what
   it drew. corridor() falls back to the harness canyon when there is no city, which is why this
   needs nothing but core.js and street.js.

   What to look for, in the order these things break:
     - every figure has a lit top edge. A silhouette with no rim is invisible on a real street
     - the crowd is not all one height, one width or one gait
     - hems, brims, packs and bags are reaching PAST the shoulder line and catching the rim
     - arms swing: the outline is asymmetric and changes between frames
     - nothing is a featureless black slab (that is a costume whose spans have collapsed) */
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');

global.CC = require(path.join(root, 'src/core.js'));
global.window = undefined;
for (const rel of ['src/weather_state.js', 'src/city.js', 'src/surfaces.js', 'src/raycast.js'])
  if (fs.existsSync(path.join(root, rel))) require(path.join(root, rel));
require(path.join(root, 'src/elements/street.js'));

const CC = global.CC;
const argv = process.argv.slice(2);
const COLS = parseInt(argv[0] || '260', 10);
const ROWS = parseInt(argv[1] || '60', 10);
const SECS = parseFloat(argv[2] || '12');

const ped = CC.ELEMENTS.filter(e => e.name === 'pedestrians')[0];
if (!ped) { console.error('no pedestrians element'); process.exit(2); }

/* The camera walks +z down the middle of the harness canyon at the same 1.6 m/s the autopilot
   uses, so the crowd is met head-on and at a spread of distances rather than posed. */
function cam(t) {
  return { x: 0.5, y: 1.7, z: t * 1.6, yaw: 0, fov: 1.25,
           horizon: ROWS * 0.56, horizonBase: ROWS * 0.56, rows: ROWS, t: t };
}

const f = CC.makeFrame(COLS, ROWS);
ped.init(null, CC.mulberry(7), { cols: COLS, rows: ROWS });

const N = Math.round(SECS * 60);
for (let k = 0; k <= N; k++) ped.update(1 / 60, k / 60, cam(k / 60));

CC.clearFrame(f);
ped.draw(f, cam(N / 60), N / 60);
CC.Compose.post(f);

let lit = 0;
for (let i = 0; i < f.n; i++) if (f.ch[i] && f.lum[i]) lit++;

const out = ['CCFRAME 2', COLS + ' ' + ROWS,
             'PALETTE ' + CC.PALETTE.map(c => c.join(',')).join(' '),
             'GLYPHS ' + JSON.stringify(CC.GLYPHS.join(''))];
for (let y = 0; y < ROWS; y++) {
  const row = [];
  for (let x = 0; x < COLS; x++) {
    const i = y * COLS + x;
    row.push(f.ch[i] + ',' + f.col[i] + ',' + f.lum[i] + ',' + (f.kind ? f.kind[i] : 3));
  }
  out.push(row.join(' '));
}
process.stdout.write(out.join('\n') + '\n');
console.error('crowd ' + COLS + 'x' + ROWS + ' at t=' + (N / 60).toFixed(1) + 's  ' +
              lit + ' lit cells');
