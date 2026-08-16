#!/usr/bin/env python3
"""The exposure metric the review was stated in: a CELL counts as black when it draws nothing
or draws below lum 40, which is where a glyph stops registering. Directly comparable to the
review's 82.6-85.5% baseline and its 54-60% target."""
import sys
tb=tl=tt=0
for src in sys.argv[1:]:
    L=open(src).read().split('\n'); cols,rows=map(int,L[1].split())
    for y in range(rows):
        for p in L[4+y].split(' ')[:cols]:
            ch,ci,lu=(int(v) for v in p.split(',')); tt+=1
            if ch==0 or lu<40: tb+=1
            elif lu>=110: tl+=1
print(f"cells: black(lum<40) {tb/tt*100:.1f}%   lit(lum>=110) {tl/tt*100:.1f}%")
