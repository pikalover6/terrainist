The generate run failed its final lint with LOAM-T110 — six water
voxels at the sacred lake's rim, y=95. The harness classified it as a
compiler bug and it was one, but PRE-EXISTING, not the pad commit:
gradeProfile's cut floor was seaLevel+1 for the whole world, so a
street crossing the lake on a deck shaved the rim through its own
cross-section. Fixed at source (routeFloorAt, b9f808d; ten worlds
byte-identical before/after). This world was then compiled directly
from this doc — the doc is the one the harness authored; no re-roll.
Zero physics findings. Residual warnings: W337 (wardstone_crystal
found no site), E406 (unicorn_colossus placed least-violating), T107
(spawn moved off water).
