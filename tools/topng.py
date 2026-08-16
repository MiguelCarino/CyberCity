#!/usr/bin/env python3
"""Render a headless CyberCity frame to a PNG, with the same bloom the canvas applies."""
import sys, json
from PIL import Image, ImageDraw, ImageFont, ImageFilter

CW, CH = 9, 16
FONT = ImageFont.truetype("/usr/share/fonts/liberation-mono-fonts/LiberationMono-Bold.ttf", 15)

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
