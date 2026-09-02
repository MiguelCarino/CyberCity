#!/usr/bin/env python3
"""Render a headless CyberCity frame to a PNG, with the same bloom the canvas applies."""
import sys, json
from PIL import Image, ImageDraw, ImageFont, ImageFilter

CW, CH = 9, 16
# Liberation Mono Bold at 15 px in a 9x16 cell is the reference print, and it is what
# render_canvas.js's atlas bakes and what surf_west.js's INK ramp was measured against — so it is
# tried FIRST and every fallback below is a degradation that changes the ink census. The list
# exists because this file is the standing verification procedure ("every change gets looked at
# this way before it ships") and it was unrunnable on macOS, where that path does not exist: a
# gate nobody can run is not a gate. Order is exact match, then the same metrics under another
# name, then anything monospace, then PIL's bitmap default.
_FONT_PATHS = [
    "/usr/share/fonts/liberation-mono-fonts/LiberationMono-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationMono-Bold.ttf",
    "/Library/Fonts/LiberationMono-Bold.ttf",
    "/System/Library/Fonts/SFNSMono.ttf",
    "/System/Library/Fonts/Menlo.ttc",
    "/System/Library/Fonts/Supplemental/Courier New Bold.ttf",
]
FONT = None
for _p in _FONT_PATHS:
    try:
        FONT = ImageFont.truetype(_p, 15)
        break
    except OSError:
        continue
if FONT is None:
    sys.stderr.write("topng: no mono TTF found, falling back to the bitmap default; "
                     "glyph ink will not match the print\n")
    FONT = ImageFont.load_default()

def main(src, dst):
    lines = open(src).read().split('\n')
    assert lines[0].startswith('CCFRAME'), 'not a CCFRAME dump'
    cols, rows = map(int, lines[1].split())
    pal = [tuple(map(int, c.split(','))) for c in lines[2].split(' ', 1)[1].split()]
    glyphs = json.loads(lines[3].split(' ', 1)[1])
    im = Image.new('RGB', (cols * CW, rows * CH), (2, 3, 6))
    d = ImageDraw.Draw(im)
    lit = 0
    for y in range(rows):
        parts = lines[4 + y].split(' ')
        for x in range(cols):
            fld = parts[x].split(',')          # CCFRAME 2 appends a kind byte; ignore it here
            ch, ci, lu = int(fld[0]), int(fld[1]), int(fld[2])
            if ch == 0 or lu == 0: continue
            r, g, b = pal[ci % len(pal)]
            k = lu / 255.0
            d.text((x * CW, y * CH), glyphs[ch], font=FONT,
                   fill=(int(r * k), int(g * k), int(b * k)))
            lit += 1
    g1 = im.filter(ImageFilter.GaussianBlur(1.5))
    g2 = im.filter(ImageFilter.GaussianBlur(5.0))
    glow = Image.blend(g1, g2, 0.5)
    im = Image.blend(im, Image.eval(glow, lambda v: min(255, int(v * 2.0))), 0.5)
    im.save(dst)
    print(f"{dst}  {cols}x{rows} cells  {lit/(cols*rows)*100:.1f}% lit")

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
