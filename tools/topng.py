#!/usr/bin/env python3
"""Render a headless CyberCity frame to a PNG the way the browser canvas prints it, and say what
it printed.

    python3 tools/topng.py f.txt out.png [--cell=WxH] [--u[=k]] [--q=0|1|2] [--bloom=ref|cell]
    python3 tools/topng.py f.txt --cov > tools/cov.json

THIS IS THE ONE VERIFICATION PRINTER. Every lever that ever argued about "how bright is the night"
argued from a PNG this file made, and until it was rebuilt this file did not composite the way the
browser does: it alpha-blended the glow over the scene at 0.5, which halves every glyph core,
while render_canvas.js ADDS the glow ('lighter') on top of a full-strength scene. Two prototypes
measured the same cyber night at mean 4.3 and 22.9 because each had patched that blend its own way,
and a design decision taken from either number would have been taken from a printing artefact. So
the pipeline below is a transcription of render_canvas.js, step for step, and it is held to a real
Chromium screenshot of the same frame (±2 mean, ±5 p99 -- see "calibration" below):

  1. glyph pass. A coverage mask per glyph is baked exactly as buildAtlas() bakes its tiles: font px
     = min(cellW / advance('M'), cellH * 0.98), centred on the advance, baseline centring the ink
     box of 'Xg', clipped to the cell. A cell prints PALETTE[col] * coverage * lum/255 onto black,
     which is what source-over with globalAlpha does on a black destination. lum < 4 is skipped
     (LUM_FLOOR). The background is #000, not the old print's (2,3,6): that tint alone pinned the
     old black share at 0% and made every "negative space" number unmeasurable.
  2. bloom reads the SCENE only (never the underpainting, so the blacks between lit cells stay
     black): b2 = scene at 1/2, blurred rTight; b4 = b2 at 1/2; b8 = b4 at 1/2, blurred rWide;
     out = scene + 0.55*up(b2) + 0.85*up(b8). --q=1 is the canvas's degraded single tap (b4 blurred
     rMid, 0.95), --q=0 the bare scene -- which is the cleanest way to check glyph rasterisation
     against the browser with no blur hiding the difference.
  3. radii are the canvas's cell fractions (0.05 / 0.045 / 0.06 of the cell height, in each
     buffer's own pixels, with its floors) computed from the REFERENCE cell height dh*D, where
     D = max(1, cols*(cellW/cellH) / (200*0.5625)) is raycast's frame.D. A 360-column frame on a
     5x9 cell therefore glows at the same physical size as a 200-column one on 9x16 instead of a
     quarter of the area, which is the screen-relative bloom the HD plan ships. --bloom=cell uses
     the bare cell height, i.e. the canvas as it was before that change; at 200 columns or fewer
     D is 1 and the two are identical.
  4. --u draws the frame's UNDER line first, nearest-neighbour upscaled (one flat block per cell:
     a bilinear underpainting was tried and smeared the street into a violet haze), and the scene
     and bloom are added over it. --u=k scales the field by k, for judging a strength by eye
     without re-rendering the dump.

THE UNDER LINE. tools/headless.cjs appends it after the last cell row, only when the frame carries
a non-zero underpainting (CC.Compose.UNDER = 0 writes no line, so the dump stays byte-identical to
the pre-underpainting format):

    UNDER r,g,b r,g,b ...        cols*rows triples, row-major, 0..255 each, additive under glyphs

It is the craft prototype's format unchanged. A --u render of a dump with no UNDER line prints the
glyph composite and says so rather than failing, because "no line" legitimately means "UNDER=0".

Without --u the UNDER line is ignored and the print is the glyph composite alone -- the browser
with CC.Compose.UNDER = 0 -- which is the frame the calibration below holds to Chromium.

--cell=WxH may be fractional (5.6x10). The browser floors its cell to whole device pixels, so a
fractional cell is drawn at the smallest whole supersample (x5 for 5.6) and box-filtered down. It
is a sizing tool, not a browser match: only integer cells are calibrated.

Calibration, 2026-10-21: the same dumps screenshotted from Chromium's 2D canvas (headless, dpr 1,
pristine render_canvas.js at 7425bb2), luma mean / p99 / black, Chromium -> this file:
  9x16, 200x60, quality 2   cyber dusk 16.7/209/66.4% -> 16.9/207/65.6%   cyber night 17.7/217/66.6%
    -> 18.0/216/65.8%   west dusk 2.7/44/92.3% -> 2.8/45/92.1%   west noon 27.7/202/28.6% ->
    29.2/204/26.7%   jp dusk 12.1/145 -> 12.4/144   jp night 11.5/161 -> 11.7/160   moon 10.0/181
    -> 10.1/183.  Bare glyph pass (--q=0) 7.45/141.2 -> 7.52/141.2, per-pixel error 0.6 levels.
  small cells, 360x110, --bloom=cell   5x9 7.5/118 -> 7.3/107   6x11 7.5/122 -> 7.0/116
The means hold everywhere; p99 does NOT at cells under 9 px: Chromium hints tiny glyphs into
crisper, fuller stems than FreeType-in-PIL draws, so the brightest pixels print 5-11 levels short.
Judge HD frames by mean and black share, and confirm a p99 claim at those sizes in a browser.

Stats line: luma (Rec.709) mean / p50 / p90 / p99 of the printed pixels, and black = share of
pixels whose BRIGHTEST channel is under 8 -- the same cut the browser harness uses, so the two
can be compared line for line.
"""
import sys, json, math
import numpy as np
from PIL import Image, ImageDraw, ImageFont

# Liberation Mono Bold is the reference print, and it is what render_canvas.js's FAMILY resolves to
# first and what surf_west.js's INK ramp was measured against -- so it is tried FIRST and every
# fallback below is a degradation that changes the ink census. The list exists because this file
# is the standing verification procedure and it was unrunnable on macOS, where that path does not
# exist: a gate nobody can run is not a gate. Order is exact match, then the same metrics under
# another name, then anything monospace, then PIL's bitmap default.
_FONT_PATHS = [
    "/usr/share/fonts/liberation-mono-fonts/LiberationMono-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationMono-Bold.ttf",
    "/Library/Fonts/LiberationMono-Bold.ttf",
    "/System/Library/Fonts/SFNSMono.ttf",
    "/System/Library/Fonts/Menlo.ttc",
    "/System/Library/Fonts/Supplemental/Courier New Bold.ttf",
]
_FP = None
for _p in _FONT_PATHS:
    try: ImageFont.truetype(_p, 15); _FP = _p; break
    except OSError: continue
if _FP is None:
    sys.stderr.write("topng: no mono TTF found, falling back to the bitmap default; "
                     "glyph ink will not match the print\n")

def font(px):
    return ImageFont.truetype(_FP, px) if _FP else ImageFont.load_default()

def load(src):
    """-> cols, rows, palette (N,3 float), glyph string, cells (rows,cols,4 int), under or None."""
    L = open(src).read().split('\n')
    assert L[0].startswith('CCFRAME'), 'not a CCFRAME dump'
    cols, rows = map(int, L[1].split())
    pal = np.array([tuple(map(int, c.split(','))) for c in L[2].split(' ', 1)[1].split()], float)
    glyphs = json.loads(L[3].split(' ', 1)[1])
    cells = np.zeros((rows, cols, 4), int)
    for y in range(rows):
        for x, p in enumerate(L[4 + y].split(' ')[:cols]):
            v = p.split(',')                    # CCFRAME 1 has three fields, 2 adds the kind byte
            cells[y, x, :len(v)] = [int(t) for t in v[:4]]
    U = next((l for l in L[4 + rows:] if l.startswith('UNDER ')), None)
    if U is not None:
        U = np.array([tuple(map(float, c.split(","))) for c in U.split(" ")[1:]], float)
        U = U.reshape(rows, cols, 3)
    return cols, rows, pal, glyphs, cells, U

def masks(glyphs, cw, ch):
    """Per-glyph coverage (NG, ch, cw) in 0..1 for an INTEGER cell, baked as buildAtlas bakes it."""
    adv = font(100).getlength('M') / 100 or 0.6
    px = min(cw / adv, ch * 0.98)
    b = font(px).getbbox('Xg', anchor='ls')     # (l, -ascent, r, descent) about the baseline
    # floor(x+.5), not round(): Python rounds halves to even and JS's Math.round rounds them up,
    # and at 5x9 the baseline lands exactly on a half -- the whole lattice printed a row high.
    base = min(ch - 1, max(1, math.floor((ch + b[1] - b[3]) * 0.5 - b[1] + 0.5)))
    # PIL snaps the font to a WHOLE ppem (8.33 px prints at 8, 11.66 at 12) where Skia keeps the
    # fraction. px is cellW*5/3 for this family, so a fractional size is drawn at 3x -- an exact
    # ppem -- and box-filtered down. A whole size is drawn natively: the 3x path softens the fully
    # covered stem pixels and cost the 9x16 reference 4-5 levels of p99 against Chromium.
    K = 1 if abs(px - round(px)) < 0.02 else 3; f = font(px * K)
    M = np.zeros((len(glyphs), ch, cw))
    for i, g in enumerate(glyphs):
        if i == 0: continue                     # 0 is blank by contract; never drawn
        im = Image.new('L', (cw * K, ch * K), 0)
        # Pen at centre minus half the ADVANCE, as textAlign 'center' places it. PIL's own 'm'
        # anchor centres narrow glyphs on their ink instead and landed every '.' a pixel right.
        ImageDraw.Draw(im).text((cw * K * 0.5 - f.getlength(g) / 2, base * K), g, font=f,
                                fill=255, anchor='ls')
        M[i] = np.asarray(im.resize((cw, ch), Image.BOX), float) / 255
    # Skia lifts partial text coverage (its mask gamma/contrast hack) and FreeType-in-PIL does not.
    # Fitted on a sheet of every glyph screenshotted from Chromium at seven cell sizes (4x7..10x18):
    # ^0.85 gives the lowest pixel error at every size and 1.01 of Chromium's ink at 9x16. Cells
    # under 7 px wide still print ~6-10% less ink than Chromium -- its hinter fattens tiny stems.
    return M ** 0.85

def render(src, cell=(9, 16), u=None, q=2, ref=True):
    """-> (uint8 HxWx3 composite, info dict). u is the UNDER strength (None = glyph print only)."""
    cols, rows, pal, glyphs, cells, U = load(src)
    cw, ch = cell
    # A fractional cell is rasterised at the smallest supersample that makes it whole (5.6 -> x5),
    # so the glyph lattice does not drift a pixel every few cells, then box-filtered to size.
    ss = next((s for s in range(1, 9) if abs(cw * s - round(cw * s)) < 0.02 and
               abs(ch * s - round(ch * s)) < 0.02), 4)
    mw, mh = round(cw * ss), round(ch * ss)
    M = masks(glyphs, mw, mh)
    g, ci, lu = cells[..., 0], cells[..., 1], cells[..., 2]
    on = (g > 0) & (lu >= 4)                    # LUM_FLOOR
    col = pal[ci % len(pal)] * (lu * on / 255.0)[..., None]
    # One cell row at a time: the whole-frame gather is rows*cols*mh*mw*3 floats, which at a
    # supersampled 360x110 is over a gigabyte on a machine other renders are sharing.
    M = M.astype(np.float32); S = np.empty((rows * mh, cols * mw, 3), np.uint8)
    for y in range(rows):
        r = M[g[y]][..., None] * col[y, :, None, None, :].astype(np.float32)
        S[y * mh:(y + 1) * mh] = np.clip(np.rint(r.transpose(1, 0, 2, 3).reshape(mh, -1, 3)), 0, 255)
    W, H = round(cols * cw), round(rows * ch)
    sc = Image.fromarray(S)
    if ss > 1: sc = sc.resize((W, H), Image.BOX)
    out = np.asarray(sc, float)
    D = max(1.0, cols * (cw / ch) / 112.5) if ref else 1.0
    dh = (ch if ss > 1 else int(ch)) * D

    # Bloom in float, never through PIL's 8-bit GaussianBlur: its fixed-point box passes round
    # every dim pixel UP, and on a frame that is mostly faint ink that bias alone added ~7% to the
    # wide tap and cost three points of black share against Chromium. Zero padding, because the
    # canvas blurs into a transparent border rather than smearing the edge row outwards.
    def half(a):                                # one mip level: what a 'high' 2:1 drawImage reads
        h, w = a.shape[0] // 2 * 2, a.shape[1] // 2 * 2; a = a[:h, :w]
        return (a[0::2, 0::2] + a[1::2, 0::2] + a[0::2, 1::2] + a[1::2, 1::2]) * 0.25
    def blur(a, sd):
        r = max(1, math.ceil(3 * sd)); k = np.exp(-0.5 * (np.arange(-r, r + 1) / sd) ** 2); k /= k.sum()
        for ax in (0, 1):
            p = np.pad(a, [(r, r) if i == ax else (0, 0) for i in range(3)]); n = a.shape[ax]
            a = sum(k[i] * (p[i:i + n] if ax == 0 else p[:, i:i + n]) for i in range(2 * r + 1))
        return a
    def up(a):                                  # the composite's stretch back to full size
        return np.stack([np.asarray(Image.fromarray(a[..., c].astype(np.float32), 'F')
                                    .resize((W, H), Image.BILINEAR)) for c in range(3)], 2)
    if q >= 2:
        b2 = blur(half(out), max(0.6, dh * 0.05))
        out = out + 0.55 * up(b2) + 0.85 * up(blur(half(half(b2)), max(0.8, dh * 0.045)))
    elif q == 1:
        out = out + 0.95 * up(blur(half(half(out)), max(0.7, dh * 0.06)))
    if u is not None and U is not None:
        Ui = Image.fromarray(np.clip(np.rint(U * u), 0, 255).astype(np.uint8))
        out = out + np.asarray(Ui.resize((W, H), Image.NEAREST), float)
    out = np.clip(np.rint(out), 0, 255).astype(np.uint8)
    return out, dict(cols=cols, rows=rows, cw=cw, ch=ch, D=D, lit=on.mean(),
                     under=U is not None, cells=cells, pal=pal, glyphs=glyphs, U=U)

def stats(a):
    y = a.astype(float) @ np.array([0.2126, 0.7152, 0.0722])
    p50, p90, p99 = np.percentile(y, [50, 90, 99])
    return dict(mean=y.mean(), p50=p50, p90=p90, p99=p99, black=(a.max(axis=2) < 8).mean())

def fmt(s):
    return (f"mean {s['mean']:.1f}  p50 {s['p50']:.0f}  p90 {s['p90']:.0f}  p99 {s['p99']:.0f}"
            f"  black(<8) {s['black']*100:.1f}%")

def main(argv):
    pos = [a for a in argv if not a.startswith('--')]
    fl = dict((a[2:].split('=', 1) + [None])[:2] for a in argv if a.startswith('--'))
    cell = tuple(float(v) if '.' in v else int(v) for v in (fl.get('cell') or '9x16').split('x'))
    if 'cov' in fl:
        # Coverage of each glyph as the 9x16 reference print lays it down (clipped to the cell):
        # the 'ink' metrics.py --composite weights a cell by. Regenerate when GLYPHS changes.
        #
        # And 'px': the same table for each small cell the canvas's PIXEL PATH prints (dw 4..7 at
        # dh = dw / 0.5625, as main.js sizes them), with render_canvas.js's ink compensation applied
        # per pixel exactly as pxReady() bakes it: cov' = 1-(1-cov)^k, k = 1 + 1.6*(9-dw)/9. On those
        # cells a glyph prints up to a quarter more ink than the reference table says, and
        # composite.cjs weights a 400-column gate by these rather than by the 9x16 table, or it
        # would understate the glyph's share of every cell's light at the very size it stands for.
        # This rasteriser prints 6-10% less ink than Chromium under 7 px (see masks()), so these
        # are a floor on the lift, not its exact value.
        G = load(pos[0])[3]; M = masks(G, *cell)
        px = {}
        for dw in range(4, 8):
            dh = max(7, int(math.floor(dw / 0.5625 + 0.5))); k = 1 + 1.6 * (9 - dw) / 9
            Mk = 1 - (1 - masks(G, dw, dh)) ** k
            px['%dx%d' % (dw, dh)] = {g: round(float(Mk[i].mean()), 4) for i, g in enumerate(G) if i}
        print(json.dumps({'_': 'python3 tools/topng.py f.txt --cov > tools/cov.json -- glyph ink '
                          'share of the cell; weights metrics.py --composite and composite.cjs',
                          'cell': '%sx%s' % cell, 'cov': {g: round(float(M[i].mean()), 4)
                          for i, g in enumerate(G) if i}, 'px': px}, ensure_ascii=False, indent=0))
        return
    u = float(fl['u'] or 1) if 'u' in fl else None
    a, I = render(pos[0], cell, u, int(fl.get('q') or 2), fl.get('bloom') != 'cell')
    Image.fromarray(a).save(pos[1])
    note = '' if u is None else ('  +UNDER x%g' % u if I['under'] else '  (no UNDER line: glyphs only)')
    print(f"{pos[1]}  {I['cols']}x{I['rows']} cells @ {cw_s(cell)}  D {I['D']:.2f}  "
          f"{I['lit']*100:.1f}% lit{note}  {fmt(stats(a))}")

def cw_s(c): return '%gx%g' % c

if __name__ == '__main__':
    main(sys.argv[1:])
