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
| `src/core.js` | `CC` | Frame alloc, PALETTE, GLYPHS, rng/noise, math, `put()` |
| `src/world.js` | `CC.World` | the world registry — which world is live, the id/name/alias table, and `inWorld()` |
| `src/daylight.js` | `CC.Daylight` | the clock: sun altitude and bearing, and the light directions everything reads off them |
| `src/city.js` | `CC.City` | `make(seed)` → heightmap + per-cell district/style/sign metadata, for either world |
| `src/raycast.js` | `CC.Cast` | `render(frame, cam, city)` — fills every cell: façades, floor, sky |
| `src/surfaces.js` | `CC.Surf` | texture fns: `facade(u,v,cell,dist)`, `floorTex(wx,wz,dist)`, `sky(x,y,t)`; owns `configure`/`cfg`/`fog` for both worlds and delegates the three painters |
| `src/surf_west.js` | `CC.SurfWest` | the frontier's `facade` / `floorTex` / `sky`, same signatures |
| `src/surf_moon.js` | `CC.SurfMoon` | Moonwalk's, likewise. Painters self-register into `CC.SURFACES[id]`; `build.js` globs `src/surf_*.js` |
| `src/proj.js` | `CC.Proj` | the ONE copy of the element camera — `make()` hands each world-space element file its own basis and the four helpers closed over it |
| `src/elements/*.js` | pushes to `CC.ELEMENTS` | ambient systems, see below |
| `src/compose.js` | `CC.Compose` | fog, element pass ordering, reduced-motion damping |
| `src/render_canvas.js` | `CC.Canvas` | glyph atlas, `drawImage` per cell, bloom. **Only DOM-touching module** |
| `src/main.js` | — | loop, resize, fullscreen, seed in hash, prefers-reduced-motion |

## Ambient element interface

```js
CC.ELEMENTS.push({
  name: 'rain',
  layer: 10,              // lower draws first; elements draw after the world pass
  world: 'cyber',         // OPTIONAL: an id, or an ARRAY of ids. Absent means EVERY world —
                          // which is a materially different promise now there are three, and is
                          // why the atmospheric elements had to be given ['cyber','west'].
  init(city, rng) {},     // allocate persistent state
  update(dt, t, cam) {},  // advance simulation; no drawing
  draw(frame, cam, t) {}, // use CC.put(frame, x, y, glyph, colour, lum, dist) — it depth-tests for you
});
```

## Worlds

`CC.World` names the live world and calls back when it changes; `main.js` responds by tearing the
map down and building a new one on the **same seed**. Everything downstream keeps its own data for
both worlds next to the numbers it already has — `city.js` holds two district tables, `weather_state.js`
two preset tables, `surfaces.js` delegates its three painters — rather than reading from one central
theme object. The URL fragment is `#<seed>` for the default world and `#<world>/<seed>` otherwise.

Rules for worlds:
- An element that belongs to one world says so with `world:` on itself, as an id or an array of
  them. The test is `CC.inWorld(el, id)` and there is exactly ONE definition of it, in `world.js`,
  shared by `main.js`, `tools/headless.cjs` and the photosensitivity gates — because those three had
  three copies and an offline reference frame rendered from a different element set than the
  browser's is not a reference frame. `main.js` filters **before** the layer sort, because every
  element draws from one shared rng in layer order and which elements are present decides every
  later element's noise stream.
- A world is added by appending a row to `world.js`'s `LIST` (never prepending — `LIST[0]` is the
  URL default and every `#42` link ever shared addresses it), a theme block and district table in
  `city.js`'s `THEMES`, a painter file that self-registers, a weather table in `weather_state.js`,
  and element files tagged with its id. Nothing in the tree switches on a world id with a ternary
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
- Read the RIGHT direction. `sky` is what lifts structure (in daylight a wall is lit by the whole
  hemisphere, not by the sun); `lamp` is what takes artificial light away and has hysteresis;
  `sun` is only for things that need a shadow; `star` keys on the twilight curve and not on the
  sun, because the whole of civil twilight has no sun in it and no stars either.
- The print has TWO exposure ladders (`EXPOSURE` and `EXPOSURE_DAY` in `core.js`) blended by the
  clock through `CC.Compose.post(f, cam, t)` — which has always been called with `cam` and `t` and
  always ignored them. The LUT is rebuilt only when the blend crosses one of 32 quantised steps.

Rules for elements:
- **Never** write to the typed arrays directly; always go through `CC.put`, which honours `frame.dist`.
- Must be allocation-free in `update`/`draw` (pre-allocate in `init`) — this runs 60×/sec.
- Must read `CC.reducedMotion` and damp or freeze accordingly.
- Must be deterministic given the seeded rng handed to `init`.

## Verification (this is not optional)

`node tools/headless.cjs <seed> <frame> <cols> <rows> [--west|--moon] [--time=noon] > f.txt` renders one frame with **no browser**
and dumps `glyph,colourIdx,lum` per cell. `python3 tools/topng.py f.txt out.png` renders that to an
image with the same bloom the canvas does. Every change gets looked at this way before it ships.
