# CyberCity — module contract

Deliverable: **one self-contained `index.html`**, fullscreen, pure ambient, no game loop.
Sources live in `src/`; `node build.js` inlines them into `index.html`. Never edit `index.html` by hand.

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

## Modules

Every module is a plain script defining one global, no imports, no bundler syntax — `build.js`
concatenates them in order and the headless harness `require`s them through a shim.

| file | global | responsibility |
| --- | --- | --- |
| `src/core.js` | `CC`, `CC.Compose` | Frame alloc, PALETTE, GLYPHS, rng/noise, math, `put()`, and the print — the two exposure ladders, `ladder()`, the LUT and `Compose.post()`. `src/compose.js` does not exist; the contract allows it not to and `build.js` filters it out rather than assuming it |
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
| `src/render_canvas.js` | `CC.Canvas` | glyph atlas, `drawImage` per cell, bloom. **Only DOM-touching module** |
| `src/main.js` | `CC.Main` | loop, resize, fullscreen, seed in hash, prefers-reduced-motion |

## The palette — 20 swatches, two ladder entries each

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

`node build.js` must exit 0. It fails over **600 KB** and that line has been raised five times and
held once; the essay in `build.js` is the record and it is addressed to whoever lands here next.
**The next pass must split the payload.** Three passes running have now ended at this line with the
same finding — the content is bigger than the headroom and every remaining cut is a rounding error
against it. The last non-content cut in the tree (the duplicated `streetSpan` / `objVisible` /
`corridor` bodies, measured at ~2,350 bytes and banked in `build.js`'s essay) is worth a tenth of a
world.
It also checks that every world's painter global is present, so a painter dropped into `src/` and
never registered fails the build instead of rendering as the city.
The order is: cut something that is not content, then cut content, then move the line, and write
down which one you did. The whitespace has already been spent — `decomment()` halves leading
indentation, worth 42,134 bytes of a measured 84,232 — so a future pass has one fewer option than
this one had. The bundle must also survive `new Function()`, contain none of `require(`,
`module.exports`, ESM syntax or a closing script tag, and still name every global in the
required-globals list.

## Verification (this is not optional)

`node tools/headless.cjs <seed> <frame> <cols> <rows> [--west|--moon] [--time=noon] > f.txt` renders one frame with **no browser**
and dumps `glyph,colourIdx,lum,kind` per cell. `python3 tools/topng.py f.txt out.png` renders that
to an image with the same bloom the canvas does. Every change gets looked at this way before it
ships. `python3 tools/metrics.py f.txt` is the census; its night targets are muddy under 30% and
hot 3.5-5%, and a daylight frame is not expected to meet the first — see the README's table for
what each world actually measures at each hour.

The gates, in the order they are worth running: `node build.js`, `node tools/domshim.cjs`,
`node tools/flicker-rate.cjs`, `node tools/lightning-rate.cjs`, `node tools/west-flicker.cjs 4`,
the census, and a determinism check (the same seed, frame, world and hour rendered twice must be
byte-identical).

A GATE THAT CANNOT SEE THE FEATURE IS NOT A GATE, and this is the newest hard-won rule here. Both
photosensitivity tools PIN THE CAMERA at the map's start, so anything the walk only reaches later is
invisible to them: EDO's canal is on a 160 m pitch, and `west-flicker.cjs` returned PASS having
rendered ZERO canal cells on a surface that was in fact running at 3.61% against a 2% rule. When a
feature lives somewhere the pinned camera never stands, measure it where it lives —
`tools/canal-flicker.cjs` is that probe for the canal and is the pattern to copy. Quoting a PASS
from a tool that rendered none of the thing under test is worse than not running it.

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
