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
| `src/city.js` | `CC.City` | `make(seed)` → heightmap + per-cell district/style/sign metadata |
| `src/raycast.js` | `CC.Cast` | `render(frame, cam, city)` — fills every cell: façades, floor, sky |
| `src/surfaces.js` | `CC.Surf` | texture fns: `facade(u,v,cell,dist)`, `floorTex(wx,wz,dist)`, `sky(x,y,t)` |
| `src/elements/*.js` | pushes to `CC.ELEMENTS` | ambient systems, see below |
| `src/compose.js` | `CC.Compose` | fog, element pass ordering, reduced-motion damping |
| `src/render_canvas.js` | `CC.Canvas` | glyph atlas, `drawImage` per cell, bloom. **Only DOM-touching module** |
| `src/main.js` | — | loop, resize, fullscreen, seed in hash, prefers-reduced-motion |

## Ambient element interface

```js
CC.ELEMENTS.push({
  name: 'rain',
  layer: 10,              // lower draws first; elements draw after the world pass
  init(city, rng) {},     // allocate persistent state
  update(dt, t, cam) {},  // advance simulation; no drawing
  draw(frame, cam, t) {}, // use CC.put(frame, x, y, glyph, colour, lum, dist) — it depth-tests for you
});
```

Rules for elements:
- **Never** write to the typed arrays directly; always go through `CC.put`, which honours `frame.dist`.
- Must be allocation-free in `update`/`draw` (pre-allocate in `init`) — this runs 60×/sec.
- Must read `CC.reducedMotion` and damp or freeze accordingly.
- Must be deterministic given the seeded rng handed to `init`.

## Verification (this is not optional)

`node tools/headless.mjs <seed> <frame> <cols> <rows> > f.txt` renders one frame with **no browser**
and dumps `glyph,colourIdx,lum` per cell. `python3 tools/topng.py f.txt out.png` renders that to an
image with the same bloom the canvas does. Every change gets looked at this way before it ships.
