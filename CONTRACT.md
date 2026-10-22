# CyberCity — module contract

Deliverable: **`index.html` plus `w/`** — the page with the engine and the city inline, and one
`w/<world>.js` per secondary world loaded by synchronous `<script src>` — fullscreen, pure ambient,
no game loop. Until the HD pass it was one self-contained `index.html`; that property was spent on
purpose, by the owner, and `build.js`'s essay records the trade. Sources live in `src/`;
`node build.js` writes both. Never edit `index.html` or `w/` by hand, and never publish one without
the other.

## Renderer model — voxel-space (heightmap) raycasting at character resolution

Not a wall-grid raycaster. Each map cell carries a **height**, and each screen *column* is marched
front-to-back keeping a running silhouette row. This gives correct occlusion, varying building heights,
cross-streets, alleys and — critically — the slot of sky between rooftops, all for free.

Per column `x`:
1. ray dir from `yaw + fov*(x/cols-0.5)`
2. march `t` from `T_NEAR` to `T_FAR`, step growing with `t`
3. sample `h = height(gx,gz)`; project `topRow = horizon - (h - eyeY)*scale/t`
4. if `topRow < silhouette[x]`, paint rows `topRow .. min(silhouette[x], baseRow)` as façade, then
   `silhouette[x] = topRow`
5. below the horizon, the floor is painted by *inverse* projection: `t = eyeY*scale/(row-horizon)`

## Frame — parallel typed arrays, length `cols*rows`, index `i = row*cols + col`

| array | type | meaning |
| --- | --- | --- |
| `ch` | Uint8Array | index into `GLYPHS` |
| `col` | Uint8Array | index into `PALETTE` |
| `lum` | Uint8Array | 0..255 brightness multiplier applied to the palette colour |
| `dist` | Float32Array | depth in world units; `Infinity` for sky. Elements MUST depth-test against this |
| `kind` | Uint8Array | `0` sky `1` façade `2` floor `3` element |
| `under` | Uint8ClampedArray, `cols*rows*3` | the underpainting: RGB per cell, additive under the glyphs. Written ONLY by `CC.Compose.post`, after `tone()`. **Elements never write it**, and nothing else may; all-zero (the `UNDER = 0` kill switch) is the glyph-only print |
| `D` | number, ≥ 1 | grid density against the 200-column 9:16 reference, `max(1, cols*cellAspect/112.5)`. Published by `raycast.js` every render (1 under `CC.DETAIL_SCALE === 0`); read by `optics.js`, `weather.js`, `west_stock.js` (the wagon bed's sample count and the team's leg-width threshold), the underpainting's spill box and `render_canvas.js`'s bloom radii. Declared in `makeFrame` with `uon`, so the frame's shape never changes after birth |

**The render order is contract**, because the underpainting needs the world pass on its own:
`CC.clearFrame(f)` → `CC.Cast.render(f, cam, city)` → `CC.Compose.world(f)` → every element's
`draw` → `CC.Compose.post(f, cam, t)` → `CC.Canvas.draw(f)`. `main.js`, `tools/headless.cjs` and every
composite probe repeat it. `world()` snapshots the frame before any element draws (so lightning and
other element flashes never reach the mass term) and stamps the snapshot with the frame; `post()`
and `clearFrame()` spend the stamp. A caller that skips `world()` still gets a field — `post()`
snapshots the frame itself before toning it — but a degraded one with the elements in it, which is
fine for a probe that never reads `under` and wrong for anything that does.

## Modules

Every module is a plain script defining one global, no imports, no bundler syntax — `build.js`
concatenates them in order and the headless harness `require`s them through a shim.

| file | global | responsibility |
| --- | --- | --- |
| `src/core.js` | `CC`, `CC.Compose` | Frame alloc, PALETTE, GLYPHS, rng/noise, math, `put()`, and the print — the two exposure ladders, `ladder()` (its source set is the one `SRC` list, which the underpainting's emitter set `EM` extends), the LUT, `Compose.post()`, and the underpainting: `Compose.world(f)` (the pre-element snapshot), the field it writes into `f.under`, and `Compose.UNDER` (strength 0..1; 0 is the kill switch). `src/compose.js` does not exist; the contract allows it not to and `build.js` filters it out rather than assuming it |
| `src/world.js` | `CC.World` | the world registry — which world is live, the id/name/alias table, and `inWorld()` |
| `src/daylight.js` | `CC.Daylight` | the clock: sun altitude and bearing, and the light directions everything reads off them |
| `src/weather_state.js` | `CC.Weather` | the weather director and one preset table per world; `rel()` is the cross-world quantity |
| `src/city.js` | `CC.City` | `make(seed)` → heightmap + per-cell district/style/sign metadata, for any world |
| `src/raycast.js` | `CC.Cast` | `render(frame, cam, city)` — fills every cell: façades, floor, sky |
| `src/surfaces.js` | `CC.Surf` | texture fns: `facade(u,v,cell,dist)`, `floorTex(wx,wz,dist)`, `sky(x,y,t)`; owns `configure`/`cfg`/`fog` for every world and delegates to the other painters through `CC.SURFACES` |
| `src/surf_west.js` | `CC.SurfWest` | the frontier's `facade` / `floorTex` / `sky`, same signatures |
| `src/surf_moon.js` | `CC.SurfMoon` | Moonwalk's, likewise. Painters self-register into `CC.SURFACES[id]`; `build.js` globs `src/surf_*.js` |
| `src/surf_japan.js` | `CC.SurfJapan` | EDO's. The only painter with TWO key lights — a sky dome scaled by how much cloud there is, and a lamp wash that is a function of height above the ground and nothing else |
| `src/proj.js` | `CC.Proj` | the ONE copy of the element camera — `make()` hands each world-space element file its own basis and the four helpers closed over it |
| `src/control.js` | `CC.Control` | the walk and the input devices; re-anchors to `city.js`'s route on a rebuild |
| `src/elements/*.js` | pushes to `CC.ELEMENTS` | ambient systems, see below |
| `src/render_canvas.js` | `CC.Canvas` | the underlay (`f.under`, one pixel per cell, drawn unsmoothed first), the glyph pass — `drawImage` per cell from the atlas, or on cells of 7 device px and under (`setPixelPath('auto')`, what `main.js` ships) direct pixel writes and one `putImageData`, falling back to drawImage on any context that cannot — and the bloom, which reads the glyph scene only and is sized from the reference cell `dh*frame.D`. **Only DOM-touching module** |
| `src/main.js` | `CC.Main` | loop, resize, fullscreen, seed in hash, prefers-reduced-motion |

**Painter export keys the engine reads**, all optional, all on the painter's own export (the city's
on `CC.Surf`, the others on `CC.SURFACES[id]`) — a world is what its painter file says, and core
never names one:
- `SKY_RGB` — 18 numbers for the underpainting: zenith rgb then horizon rgb at NIGHT, at NOON, and
  the DUSK pair the warm term pulls toward. The night horizon is also what far walls haze toward
  (at half strength by night), and darkening it is not free: every glyph that steps in front of
  the sky steps harder in display terms on a darker backdrop, which is what failed flicker-rate's
  still-holo check at 400x120 when the city's was taken from 40,50,96 to 24,30,60. **No table means no sky and
  no spill**: that is the Moon, which gets regolith ambient off `P.sun` instead.
- `BARE` — `[wall, floor]`, the share of the underpainting's ambient a blank cell takes when the
  painter wrote it in a LIT swatch, meaning "this surface, no glyph on it". A blank written in
  `shadow` or `slate` is a hole and takes the defaults whatever the export says (0.1 on a wall, 0.5
  on a floor), and so does every blank when the export is absent. The swatch on a blank cell prints
  nothing, so this costs the glyph layer nothing; it is the painter's one way of telling core which
  of its blanks are openings. Edo is the world that needs it (`[0.8, 1.6]`): its walls and road thin
  their glyphs by the light, and read as holes its noon street printed darker than its dusk one.
- `airless` — truthy on a world with no atmosphere. `surfaces.js`'s `refog()` skips its haze floor,
  and `raycast.js` hands the painter the TRUE distance rather than the density-scaled apparent one.
- `fogStart` / `fogEnd` — LIVE getters for the weather's ramp (the city's on `CC.Surf`), read by the
  underpainting's haze. `fogStart` may be 0; a collapsed ramp is treated as a wall of haze.

**What `CC.Compose.UNDER = 0` restores, exactly.** The frame data (ch/col/lum/dist/kind) and the
glyph layer, byte-for-byte, and the composite's op sequence minus the one underlay draw — `domshim`'s
`print-paths` case asserts that last part. It does NOT roll back the rest of the HD print: the pixel
glyph pass on small cells, the bloom sized from `dh*D`, the density LOD in `raycast.js` and
`main.js`'s cell band all stay, so the browser with the switch off shows this build's glyph layer,
which is not the pre-HD page.

## The palette — 21 swatches, two ladder entries each

`PALETTE` in `core.js` is **append-only**. Slots 0-11 are frozen because a swatch index in this
tree is a literal in other files — `surfaces.js`'s `L_LOW`/`L_LIT`/`L_HOT`, `ads.js`'s `PEAK`,
`signage.js`'s `MIN_C`/`MIN_R` are all arrays indexed by palette slot, and `metrics.py`'s `NAMES`
is a parallel list that wraps rather than raising if it falls short. Inserting a swatch does not
fail; it silently reprints half the frame through some other swatch's curve.

Rules for the palette:
- Every swatch has an entry in **both** `EXPOSURE` and `EXPOSURE_DAY`, and `ladder(c, mix, sunMix)`
  is the only thing that reads them. Adding a swatch without a day entry is `undefined` in the LUT.
- `ladder()` splits the table in two and the test is **"does it emit"**, not "is it bright" and not
  "is it an accent". Sources — amber, azure, warm, ice, jade, rose, gold — blend on the **squared
  sun**; everything else blends on the **sky**. A surface put on the sun curve holds its night gain
  through the whole of dawn, so the wall goes bright only after the sky already has.
- The LUT's stride is read off `PALETTE.length`. It was a literal `12` once and that is exactly the
  failure above.
- APPENDING IS THE SUPPORTED GROWTH PATH AND IT HAS NOW BEEN EXERCISED, which is worth recording
  because the section above is otherwise all warnings. Slot 20 `blossom` was added for the cherry:
  one `PALETTE` row, one entry in each ladder, one name in the `P` map, one name in `metrics.py`'s
  `NAMES`. Nothing else needed an edit — `ladder()` sorts an unlisted swatch onto the sky curve,
  which is the right answer for a surface; the LUT stride and `render_canvas.js`'s atlas both read
  `PALETTE.length`; and `surfaces.js` fills its per-slot tables to `PALETTE.length` with a neutral.
  The 27-fixture byte-compare came back identical, so a swatch no other world writes costs those
  worlds nothing. The check that matters is the parallel list in `metrics.py`, which WRAPS rather
  than raising: a census taken with a short `NAMES` misattributes the new swatch to slot 0 and reads
  as amber appearing in a world that has none.
- A NEW SWATCH IS FOR A MATERIAL THE TABLE CANNOT SPELL, not for a hue it already has. `blossom` and
  `rose` are both pink and they are different objects: rose is a TUBE, at 57% saturation with the
  lowest gain pair in either ladder specifically so a large area of it can never clear the hot line
  and take the bloom with it. That bound is correct and it is why a cherry could not be painted in
  rose — the crown is a SURFACE, lit by the sky, covering three hundred cells. The test to apply
  before appending is whether the existing swatch's constraints are wrong for the new use or merely
  inconvenient; here they were wrong, and desaturating to 30% is what makes the new one safe where
  the old one is not.
- Any painter that maps a hue to a material must be indexed **by palette slot with every slot
  filled**, not by a whitelist. `surf_west.js` carried `hue === P.warm || hue === P.white ||
  hue === P.ember ? hue : P.amber` and every material the map learned to name after it was written
  fell off the end and printed as amber. Degrade to the nearest neighbour, never to a default.

## Ambient element interface

```js
CC.ELEMENTS.push({
  name: 'rain',
  layer: 10,              // lower draws first; elements draw after the world pass
  world: 'cyber',         // OPTIONAL: an id, or an ARRAY of ids. Absent means EVERY world —
                          // which is a materially different promise now there are four, and is
                          // why the atmospheric elements carry ['cyber','west','japan'] and the
                          // Moon is left out of every one of them.
  init(city, rng) {},     // allocate persistent state
  update(dt, t, cam) {},  // advance simulation; no drawing
  draw(frame, cam, t) {}, // use CC.put(frame, x, y, glyph, colour, lum, dist) — it depth-tests for you
});
```

## Worlds

`CC.World` names the live world and calls back when it changes; `main.js` responds by tearing the
map down and building a new one on the **same seed**. Everything downstream keeps its own data for
every world next to the numbers it already has — `city.js` holds four district tables (nine
quarters for the city, six for the frontier, eight for the Moon, seven for EDO),
`weather_state.js` four preset tables, `surfaces.js` delegates to four painters — rather than
reading from one central theme object. The URL fragment is `#<seed>` for the default world and
`#<world>/<seed>` otherwise.

WHAT A FOURTH WORLD COST, recorded because it is the measurement that says whether the three
registries below were worth building: 33.2 KB of stripped bundle, against the frontier's 65 and the
Moon's 55. Nothing in `raycast.js`, `main.js`, `control.js`, `render_canvas.js` or
`tools/headless.cjs` was touched at all — a world is now a `world.js` row, a `city.js` theme and
district table, a `weather_state.js` preset table, one self-registering painter, and element files
that tag themselves. If adding one turns out to need an edit to any of those five files, that edit
is the bug.

Rules for worlds:
- An element that belongs to one world says so with `world:` on itself, as an id or an array of
  them. A shared element that has to behave differently per world does it through a **table keyed
  by world id**, never a boolean. `street.js` carried `PED_WEST = city.world === 'west'` doing two
  unrelated jobs — the frontier's costume weights and "this crowd is pre-electric" — and a fourth
  world needed the second and not the first. It is now two lookups, `PED_ARCH` and `PED_PRE_W`, and
  a world that is in neither gets the modern default rather than whatever the last `else` was.
  Whatever the gate does, the DRAW must still happen: every one of those branches takes its hash
  and throws the result away rather than skipping it, so one world's crowd is not a reshuffle of
  another's.
- The test is `CC.inWorld(el, id)` and there is exactly ONE definition of it, in `world.js`,
  shared by `main.js`, `tools/headless.cjs` and the photosensitivity gates — because those three had
  three copies and an offline reference frame rendered from a different element set than the
  browser's is not a reference frame. `main.js` filters **before** the layer sort, because every
  element draws from one shared rng in layer order and which elements are present decides every
  later element's noise stream.
- A world is added by appending a row to `world.js`'s `LIST` (never prepending — `LIST[0]` is the
  URL default and every `#42` link ever shared addresses it), a theme block and district table in
  `city.js`'s `THEMES`, a painter file that self-registers, a weather table in `weather_state.js`,
  and element files tagged with its id. That is the whole list; EDO was added without touching
  `raycast.js`, `main.js`, `control.js` or `tools/headless.cjs`, all four of which already read the
  registry rather than a set of literals. Nothing in the tree switches on a world id with a ternary
  any more; every one of those is a registry lookup with a documented fallback.
- Nothing decides geometry by reading `CC.World` at draw time. The map resolved the world once,
  inside `make()`, and carries the answer on itself as `city.world`; between a keypress and the
  rebuild those two differ by a frame.
- `CC.Weather.rel()` denotes the same physical quantity in every world. Its reference row is the
  city's `rain` preset, permanently, because it is the contract every element was tuned against.

## The clock

`CC.Daylight` is a director of exactly `CC.Weather`'s shape: one live parameter block, recomputed
each tick, read by everything. Its phase is a pure function of `t` plus a seeded offset — never an
accumulator — and its two viewer controls are STAMPS (`T` moves an offset, `Y` records the instant
the clock stopped), so a frame stays a pure function of `(seed, t)` and the offline harness keeps
reproducing the browser.

Rules for the clock:
- **Every daylight scale must be the identity at night.** The shipped night look is the tuned
  baseline that a 128-frame census was fitted against, so a factor of `0.22 + 0.93 * lamp` — which
  is 1.15 at night — silently re-tunes the picture the feature was supposed to leave alone. It did,
  once, and moved 1083 cells of a 12000-cell reference frame before the byte comparison caught it.
  The rule is about SCALES. A change that is **material** — terrain relief, a new lattice of
  craters, a costume — legitimately changes the night frame, and the way to tell the two apart is
  whether the number is read off the clock. If it is, it is the identity at night; if it is not,
  say in the source that the night frame moves and why. `surf_moon.js`'s `roll` is the worked
  example of the second case.
- A world's **signature hour** gets the same protection as night if it says so. The frontier's
  daylight fill is gated above the sky level the clock reports at dawn and dusk (0.657) precisely
  so that those two frames stay byte-identical, and the threshold was moved from 0.60 to 0.70 after
  a census showed a twentieth of the fill moving dusk's muddy band by five points.
- Read the RIGHT direction. `sky` is what lifts structure (in daylight a wall is lit by the whole
  hemisphere, not by the sun); `lamp` is what takes artificial light away and has hysteresis;
  `sun` is only for things that need a shadow; `star` keys on the twilight curve and not on the
  sun, because the whole of civil twilight has no sun in it and no stars either.
- The print has TWO exposure ladders (`EXPOSURE` and `EXPOSURE_DAY` in `core.js`, one entry per
  swatch in each) blended by the clock through `CC.Compose.post(f, cam, t)` — which has always been
  called with `cam` and `t` and always ignored them. The LUT is rebuilt only when the blend crosses
  one of 32 quantised steps, about once every thirteen seconds of a 420 s day. Which of the two
  curves a swatch blends along is decided by `ladder()`; see the palette section above.
- A painter that caches the clock's parameters in module state must assign **every** cached field
  inside its `view()`/`configure()` body. Three frontier files kept per-frame caches that were
  moved out with the projection scaffolding, two were missed, and the desert and the livestock
  stopped following the clock while the street behind them still did. Nothing reported it; a
  byte-comparison of three fixtures before and after is what caught it, and that comparison is the
  standing procedure here.

Rules for elements:
- **Never** write to the typed arrays directly; always go through `CC.put`, which honours `frame.dist`.
- Must be allocation-free in `update`/`draw` (pre-allocate in `init`) — this runs 60×/sec.
- Must read `CC.reducedMotion` and damp or freeze accordingly.
- Must be deterministic given the seeded rng handed to `init`.

## The build

`node build.js` must exit 0 and prints every shipped file's size and headroom. **The payload is
split per world.** `index.html` holds `core` through `control`, the city's elements, `render_canvas`
and `main`, capped at **600 KB**; `w/west.js`, `w/jp.js` and `w/moon.js` each hold that world's
painter and its prefixed elements (`west_*`, `jp_*`, `moon_*`), capped at **160 KB each**. Routing
is by name, in `build.js`'s `CHUNKS` table; anything no row claims stays inline.

The chunks **define and do not run**: each module is filed as a function under its `src/` path on
a scratch global, and the inline IIFE calls it back at its place in `ORDER`, then deletes the
global. So execution order is exactly what it was as one file — which is load-bearing, because
`CC.ELEMENTS` registration order breaks layer ties and sequences the shared rng — `CC` stays one
lexical `var`, and nothing is left on `window`. A chunk that fails to load costs its world, which
renders as the city; it never costs the city. Do not "simplify" this into two inline tags with the
chunks run between them: that moves the Edo elements behind eleven shared ones and gives the
browser a different frame from `tools/headless.cjs`, with nothing failing.

The 600 KB line was raised five times and held once before the split; the essay in `build.js` is the
record, and its last paragraph is addressed to whoever lands here next: the split bought ~220 KB in
`index.html` and that is not permission. A fifth world is a fourth chunk and a `CHUNKS` row, not a
raise. The last non-content cut in the tree (the duplicated `streetSpan` / `objVisible` /
`corridor` bodies, ~2,350 bytes, banked in the essay) is still there to take.
It also checks that every world's painter global is present, so a painter dropped into `src/` and
never registered fails the build instead of rendering as the city.
The order is: cut something that is not content, then cut content, then move the line, and write
down which one you did. The whitespace has already been spent — `decomment()` halves leading
indentation, worth 42,134 bytes of a measured 84,232 — so a future pass has one fewer option than
this one had. Every shipped script — the inline bundle and each chunk, separately — must survive
`new Function()` and contain none of `require(`, `module.exports`, ESM syntax or a closing script
tag; their concatenation must still name every global in the required-globals list.

## Verification (this is not optional)

`node tools/headless.cjs <seed> <frame> <cols> <rows> [--west|--moon] [--time=noon] > f.txt` renders one frame with **no browser**
and dumps `glyph,colourIdx,lum,kind` per cell. `python3 tools/topng.py f.txt out.png` renders that
to an image with the same bloom the canvas does. Every change gets looked at this way before it
ships. `python3 tools/metrics.py f.txt` is the census; its night targets are muddy under 30% and
hot 3.5-5%, and a daylight frame is not expected to meet the first — see the README's table for
what each world actually measures at each hour. The first is a direction at night, not a line every
world clears: in that table the frontier (40.9% at seed 42) and Edo (37.1% at seed 42) run over it
after dark, and so does the city itself at seed 7 (32.6%).

The gates, in the order they are worth running: `node build.js`, `node tools/domshim.cjs`,
`node tools/flicker-rate.cjs`, `node tools/lightning-rate.cjs`, `node tools/west-flicker.cjs 4`,
`node tools/canal-flicker.cjs`, `node tools/road-flicker.cjs`,
`node tools/sakura-flicker.cjs 10`, `node tools/sakura-flicker.cjs 10 jp-blossom --cells=4`,
the census, and a determinism check (the same seed, frame, world and hour rendered twice must be
byte-identical).

EVERY PROBE IN THAT LIST NOW RUNS FOUR TIMES, and the list above is only the first of them. Each
takes `--composite`, `--cols=N` and `--rows=N` (one parser, in `tools/composite.cjs`), and a change
ships when all seven pass in all four of: no flag at `--cols=200 --rows=60`, the same at
`--cols=400 --rows=120`, and both again with `--composite` — e.g.
`node tools/flicker-rate.cjs --composite --cols=400 --rows=120`,
`node tools/west-flicker.cjs 4 --composite --cols=400 --rows=120`. The reason is the underpainting.
It never touches ch/col/lum, so every probe written against f.lum was still reading the frame it was
fitted to — and could not see the one part of the new frame that can spread a flicker: the SPILL lays
an emitter over a nine-by-five box of reference cells, so a tube that stepped one cell now steps up
to forty-five cells of wash with it. `--composite` scores the light a cell EMITS instead — glyph ink
by `tools/cov.json` coverage, plus the under block, in linear light — and it is the mode that can see
that. Lum mode (no flag) scores exactly what it always did and switches the underpainting off for the
run, which by construction moves no byte of f.lum. The masked probes (canal, road, sakura) grow their
masks by the spill box in composite mode, because the wash lands beside the cause. `lightning-rate`'s
composite mode is a different SCENE, not just a different sum: its flat wall is white, which does not
emit, so the stroke cannot reach the wash there; composite mode holds the real night world pass at the
start pose instead and measures the light emitted above it.

AND EVERY PROBE NOW CARRIES THE WCAG GENERAL-FLASH RULE, AREA-WEIGHTED, which no per-cell statistic
can stand in for. A transition is a 10%-of-white change in a cell's relative luminance with the
darker side under 0.80; a cell is flashing when it makes seven inside one second; the run FAILS if the
flashing cells cover more than a quarter of any window a third of the screen wide and tall (WCAG's
341x256-on-1024x768 field). It is absolute in every probe, west-flicker's comparative rule
notwithstanding. A synthetic check of the detector: a 60x18-cell azure sign at 6 Hz over cyber night
scores 0.0% on the glyph print and 75.9% on the composite (FAIL), and the same sign at 2 Hz passes —
the composite seeing what the glyph layer cannot is the point of it. Red flashes, WCAG's second
clause, are not measured, and neither is the bloom, which is a blur of glyph ink the glyph term
already carries.

WHAT THEY SAID WHEN THIS LANDED. All seven passed in all four modes but one: lum-mode west-flicker
at 400x120 FAILS at 10.75 big steps a second against the 8.0 backstop (seed 3, every preset), and the
untouched tree at 7425bb2 fails identically, so this is not the underpainting or the density work. It
is `west-wagon` alone — 1.50/s at 200 columns, 3.00/s at 300, 10.00/s at 360 — and the shipped band
reached 360 (main.js MAXC) with this note still open, so it was chased down in the fix pass. It was not the rim: it
was the BED, 27 fixed samples printing as a comb once the wagon spans more columns than that, with
the teeth sliding a sub-cell phase as it moves; and then the team's legs, one cell wide at 25 m on a
400-column grid so a near and far leg crossed a lit road cell as two pulses. Both now scale by
frame.D (identical at 200 columns): 10.75/s -> 3.25/s, 3-20 Hz 3.93% -> 3.07%, backstops passed. It
STILL FAILS the comparative rule at 400x120 — 3.25/s against the city's own 2.75 x 1.15 = 3.16 —
and that residual is the legs crossing the road at all, a solid object passing once, not an
aliasing beat. Composite mode, the light actually emitted, is 0.00 big steps a second at both sizes.
Flash area was 0.0% in every real run. Lightning passes with the underpainting on: on the composite
(2026-10-21, after the composite model learned the pixel path's ink lift — see below) the strongest
stroke is 0.9% of full scale above the held night frame at 200x60 and 1.1% at 400x120, its largest
frame step 28.5% and 29.5% of its peak, maxima 0.667 s apart — the wash moves by at most 9 levels at
the peak, because the mass term reads the snapshot taken before the stroke and only lit EMITTING
cells feed the spill. In composite mode west-flicker judges the project's absolute 1.0/s and 2% and
only PRINTS its city-relative ratio, because the cell average shrinks the city's hairline rain three
times harder than the frontier's solid objects. Measured the day the underpainting landed, at
200x60: 1.18% in band against the city's 0.79% on the composite, 1.14% against 0.80% on the glyph
print with the underpainting off — the wash's share is 0.04 of it. Measured 2026-10-21 on the
composite: 1.02% against 0.78% at 200x60, 1.27% against 0.95% at 400x120.

THE COMPOSITE MODEL WEIGHTS A GLYPH AT THE CELL THE GRID STANDS FOR. `tools/cov.json`'s reference
table is a 9x16 cell, and the canvas prints cells of 7 device px and under through its pixel path,
which lifts each glyph's coverage per pixel (`render_canvas.js`, INK) — +17% of mean ink at 6x11 and
+25% at 5x9, measured in Chromium. A 400-column gate weighted by the 9x16 table understated the glyph
term at exactly the size it exists for. `composite.cjs` now picks the cell from the grid (its width
across a 1920 px panel, so 200 columns is the 9x16 table, unchanged, and 400 is the 5x9 compensated
one) and `--cell=N` asks about another panel; `topng.py --cov` writes the compensated tables. Every
400x120 composite figure in this file dated before 2026-10-21 was taken with the old weights.
`tools/domshim.cjs` runs the page as it ships: every `<script>` in DOM order in one context — the
`w/` chunks and then the inline bundle, each under its own filename — skipping only the baseline's
JSON-LD block, which it parses as JSON instead. It fails if a tag points at a missing chunk or a
built chunk is never loaded, and it reads the column band from `main.js`'s `MAXC`/`MINC` in the
bundle rather than keeping its own copy. `tools/headless.cjs` loads `src/` directly and never
sees the split, which is why the split had to preserve execution order rather than merely load
everything.

THE THIRD TIME THIS RULE BIT, AND THE FIRST TIME IT BIT A FEATURE THAT WAS NOT RUNNING AT ALL.
`surf_japan.js` declared `function water` twice at one scope. Declarations do not shadow by
position — the last one hoists and wins — so every call from the road reached the CANAL's
five-argument painter with three arguments missing, `w` came out NaN, and the entire standing
water branch was unreachable for its whole life. It was worse than dead: the canal painter
assigns `mirNow` before it returns, so NaN was copied onto every carriageway cell, and
raycast.js's `if (m < 0.06) continue` does not reject NaN — those cells entered the reflect
pass and were blanked rather than skipped.

WHAT THE GATES SAID WHILE THAT WAS TRUE IS THE POINT. Every probe passed, every census was
in budget, and 27 fixtures were byte-identical, because a feature that never executes cannot
fail a measurement. A GATE CANNOT SEE A BRANCH THAT DOES NOT RUN, so the branch's own
reasoning goes unchecked with it: the `rip` rate in there carries a comment tuning it from
2.4 to 0.6 "because at 2.4 a downpour drove it to 4.5 Hz", a number that had been argued
and never once measured. Turning the branch on is therefore not a bug fix on its own — it is
a new feature entering the photosensitivity budget, and it needs a probe that can see it
before it may ship. `tools/road-flicker.cjs` is that probe.

A PROBE DOES NOT HAVE TO WALK TO BE A GATE, which is the corollary and is worth stating so the
pattern is not cargo-culted. The cherry and the canal are somewhere, so their probes walk. The
road is underfoot everywhere, so road-flicker pins at the start pose on some seeds and that is
not blindness. What makes it a gate the others are not is that it scores ONLY floor cells and
runs the WET presets — the cell selection and the conditions, not the pose. It prints a lit
count per row for exactly that reason: that is the number saying the road in shot had water on
it.

A GATE THAT CANNOT SEE THE FEATURE IS NOT A GATE, and this is the newest hard-won rule here. Both
photosensitivity tools PIN THE CAMERA at the map's start, so anything the walk only reaches later is
invisible to them: EDO's canal is on a 160 m pitch, and `west-flicker.cjs` returned PASS having
rendered ZERO canal cells on a surface that was in fact running at 3.61% against a 2% rule. When a
feature lives somewhere the pinned camera never stands, measure it where it lives —
`tools/canal-flicker.cjs` is that probe for the canal and is the pattern to copy. Quoting a PASS
from a tool that rendered none of the thing under test is worse than not running it.

THE SAME RULE CAUGHT THE CHERRY, which is the second feature to fall through the same hole and is
why this is written as a pattern rather than as one file's story. On the tree the cherry work started
from, `west-flicker.cjs` rendered 20 sakura cells of 4,800 from its pinned pose at seed 3 and 15 at
seed 42 — of which ZERO printed above the black line — and its japan rows came back BYTE-IDENTICAL
whether the crown was drawing zero visible cells a frame or eighty. It passed the tree in both states
without ever measuring it.

THAT NUMBER IS A MOVING TARGET AND THE FIRST VERSION OF THIS PARAGRAPH SHIPPED IT AS A CONSTANT.
Raising the cherry's accept rate put a crown at the map's start pose, so the same gate now renders 80
cells there, 45 of them printing — which quietly turned the new probe into a second copy of
west-flicker, because it pinned as soon as its threshold was met and its threshold was met at frame
zero. Two lessons, and the second is the general one: a pinned gate's blindness is a property of the
CONTENT as much as of the camera, so it cannot be written down once; and a walking probe must
threshold on what PRINTS, not on what the element owns, or it will stop on invisible occluding mass
and report a pose the viewer never sees. `tools/sakura-flicker.cjs` is the probe: it WALKS the autopilot until a stated
number of that element's cells PRINT, then pins there, and it scores only the cells that element
itself wrote, attributed by wrapping `CC.put` BEFORE `src/proj.js` is required — `proj.js` caches
`var put = CC.put` at module scope, so a wrapper installed after that require is never called by any
world-space element and the probe would measure an empty set while printing a confident PASS. Two
BOTH INVOCATIONS ARE IN THE GATE LIST ABOVE, and that is not tidiness. The default run measures the
TREE; the petal drift is a different element, needs `--cells=4` to be found at all, and returns
NOT_MEASURED at the default threshold. A maintainer who runs only the named default ships a petal
change having measured only the crown, which is this section's own rule failing one level down.

Three further things that cost a measurement each and are now in that file's header: an element that is
SIMULATED rather than drawn from the map cannot be found by a search loop that does not call
`update()` on every frame (the first cut reported "no crown reached" for a drift the pinned run in
the same process measured at 41 cells), and the window is an ARGUMENT rather than a constant because
a rate is quantised by it — at four seconds a rate is a multiple of 0.25/s, which is too coarse to
judge against a 1.00/s limit. Quote the window with the number.

Both of these probes take a pose the shipped gates cannot reach, and both of them found something
there. Assume the next feature that lives off the start pose needs a third.

`west-flicker.cjs` is named after the frontier and is NOT scoped to it: it walks `CC.World.LIST`
and gates every world that is not the default against the default's own elements, so a new world is
covered the day its row lands. It is also the only gate that can see a whole class of defect that
is invisible in a still and invisible in the census — a frame that is correct at every instant and
wrong in its RATE. Adding EDO tripped it five times: an 11 Hz hash on a lit panel, a 26 Hz re-deal
in the sky, a 4.5 Hz ripple offset, a 2.6 Hz gutter whose harmonics landed in band, and a drift of
blossom whose petals cross a cell at about 5 Hz. Note that the last of those could not be fixed by
dimming or by thinning the pool — both change the amplitude and the gate was measuring the rate;
what fixed it was refusing to draw a petal inside 11 m.

THE OTHER STANDING CHECK, and it is not optional either: before anything ships, render the same
fixtures in every world that was ALREADY there and byte-compare them against the tree you started
from. Twenty-seven — three worlds x three hours x three seeds — is what the pass that added EDO
ran, and all twenty-seven were byte-identical.
A world addition touches shared files (element `world:` tags, a per-world table in a shared
element) and every one of those is an opportunity to move a frame in a world nobody was looking
at.

A note on window lengths, because two of those tools take one and they do not mean the same thing
by it. `west-flicker.cjs` measures per-cell frame steps and rates, which have no bin width in them
and are honest at four seconds. `flicker-rate.cjs`'s 3-20 Hz rule is a periodogram peak, which for
a broadband signal falls as one over the square root of the window; it is judged **only** at the
60 s default, prints-without-judging below that, and exits 3 rather than reporting a hazard that
belongs to the estimator. Run it with no arguments.
