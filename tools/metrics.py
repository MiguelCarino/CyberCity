#!/usr/bin/env python3
"""Measure a CyberCity CCFRAME dump: exposure and colour-energy split.

A cell is classified by what it ACTUALLY prints — max(r,g,b) scaled by lum — not by lum
alone, because lum lies: P.shadow at lum 255 is still only (40,50,66) while P.pure at lum
40 is (40,40,40). "black" therefore means a cell no eye would call lit.

Reads CCFRAME 1 (glyph,colour,lum) and CCFRAME 2 (glyph,colour,lum,KIND) alike. The v2
kind byte was added when the harness started dumping it and this file was not updated, so
it unpacked three fields from a four-field cell and died with a ValueError on every dump
the current tools/headless.cjs writes. Two agents worked around it with throwaway scripts
rather than fixing it; the fix is the two lines below and a kind breakdown for free.

    python3 tools/metrics.py f.txt [more.txt ...]
"""
import sys, json

# Must stay in step with core.js's PALETTE, in order and in length. The energy split indexes
# `ci % len(NAMES)` and the pigment lookup indexes `ci % len(pal)`, so a NAMES list shorter than
# the palette does not raise -- it wraps, and every stone cell in the frame is reported as amber.
# Eight swatches were appended to the palette (12..19) and this line is the whole of what that
# cost the census.
NAMES = ['amber','azure','ember','spring','violet','white','red','slate','warm','ice','pure','shadow',
         'stone','timber','sand','jade','rose','gold','moss','indigo']
KINDS = ['sky', 'facade', 'floor', 'element']

def load(src):
    lines = open(src).read().split('\n')
    cols, rows = map(int, lines[1].split())
    pal = [tuple(map(int, c.split(','))) for c in lines[2].split(' ', 1)[1].split()]
    glyphs = json.loads(lines[3].split(' ', 1)[1])
    cells = []
    for y in range(rows):
        parts = lines[4 + y].split(' ')
        cells.append([tuple(int(v) for v in p.split(',')) for p in parts[:cols]])
    return cols, rows, pal, glyphs, cells

def main(srcs):
    tot_cell = 0; blank = 0; dead = 0; mid = 0; litcell = 0
    energy = [0.0]*len(NAMES); litE = [0.0]*len(NAMES)
    kinds = [0]*len(KINDS); kindLit = [0]*len(KINDS)
    # The two numbers core.js's EXPOSURE comment tells the reader to measure, which this file
    # could not see: the muddy band v=9-119 (target under 30%) and the hot tail v>=170 (target
    # 3.5-5%). They are deliberately NOT the same cut as the mid(9-59)/lit(v>=60) split above --
    # that split answers "is the cell visible", these answer "is the print curve in calibration"
    # -- so both are reported rather than one replacing the other. black% is kept because it is
    # in every historical report, but it is pinned by `blank` and cannot detect a curve change.
    muddy = 0; hot = 0; litv = []
    for src in srcs:
        cols, rows, pal, glyphs, cells = load(src)
        for y in range(rows):
            for x in range(cols):
                cell = cells[y][x]
                # v1 carries three fields per cell, v2 four; the fourth is the kind byte.
                ch, ci, lu = cell[0], cell[1], cell[2]
                kd = cell[3] if len(cell) > 3 else -1
                tot_cell += 1
                if 0 <= kd < len(KINDS): kinds[kd] += 1
                if ch == 0 or lu == 0:
                    blank += 1; dead += 1
                    continue
                if 0 <= kd < len(KINDS): kindLit[kd] += 1
                r, g, b = pal[ci % len(pal)]
                k = lu/255.0
                # what the pixel ACTUALLY renders at — lum alone lies, because P.shadow at
                # lum 255 is still only (26,30,38) while P.pure at lum 40 is (40,40,40).
                v = max(r, g, b) * k
                e = (r+g+b)/3.0 * k
                if 9 <= v < 120: muddy += 1
                if v >= 170: hot += 1
                if v >= 9: litv.append(v)
                if v < 9: dead += 1
                elif v < 60: mid += 1
                else:
                    litcell += 1
                    litE[ci % len(NAMES)] += e
                energy[ci % len(NAMES)] += e
    es = sum(energy) or 1.0
    ls = sum(litE) or 1.0
    print(f"files={len(srcs)}  cells={tot_cell}")
    print(f"  blank {blank/tot_cell*100:.1f}%   black(v<9) {dead/tot_cell*100:.1f}%"
          f"   mid(9-59) {mid/tot_cell*100:.1f}%   lit(v>=60) {litcell/tot_cell*100:.1f}%")
    litv.sort()
    p90 = litv[int(0.90 * (len(litv) - 1))] if litv else 0.0
    print(f"  CURVE: muddy(9-119) {muddy/tot_cell*100:.1f}% [target <30]"
          f"   hot(v>=170) {hot/tot_cell*100:.2f}% [target 3.5-5]"
          f"   lit p90 {p90:.0f}")
    order = sorted(range(len(NAMES)), key=lambda i: -litE[i])
    print("  LIT energy: " + "  ".join(f"{NAMES[i]} {litE[i]/ls*100:.1f}%" for i in order if litE[i]/ls > 0.0005))
    order = sorted(range(len(NAMES)), key=lambda i: -energy[i])
    print("  all energy: " + "  ".join(f"{NAMES[i]} {energy[i]/es*100:.1f}%" for i in order if energy[i]/es > 0.0005))
    if sum(kinds):
        print("  by kind:    " + "  ".join(
            f"{KINDS[i]} {kinds[i]/tot_cell*100:.1f}% (lit {kindLit[i]/tot_cell*100:.1f}%)"
            for i in range(len(KINDS))))

if __name__ == '__main__':
    main(sys.argv[1:])
