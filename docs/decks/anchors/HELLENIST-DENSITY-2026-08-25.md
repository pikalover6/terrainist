# Hellenist's density (unit 8, 2026-08-25)

Spec §10.2, third item, and gate G2's third clause: a fresh Hellenist city
must read as a city (T7 — lots per 10k envelope cells at the anchor's order;
troy_k1 20.5 is a city, 2.2 and 3.2 are not).

## A. The number, on every Hellenist we have

| document | node | cells | blocks | lots | lots / 10k | buildings |
|---|---|---:|---:|---:|---:|---:|
| hellenist_sea_siege_k1 (walked) | `city neopolis` 340 × 240 | 4 (+1 park) | 46 | 27 | **3.3** | 23 |
| hellenist_harbour (before-sample) | `city hellenic_metropolis` 340 × 240 | 4 (+2 parks) | 28 | 35 | **4.3** | 31 |
| r5 anchor `modern_hellenist_assault` @HEAD | `city neopolis` 360 × 280 | 5 | 26 | 31 | **3.1** | 29 |
| thalassa_polis (hellenist_r22, law-5 baseline) | `city` 320 × 240 | 3 | 54 | 92 | 12.0 | 55 |
| troy_k1 (control) | `district`, grown | 1 | 32 | 74 | 20.5 | 47 |
| metropolis_k1 (control) | `district`, grid | 1 | 36 | 142 | 22.8 | 74 |

Every Hellenist is a **`city` node** — arterials cut into `cell_N` districts
by `layout/city.ts`, each cell given a character kit from where it lies
(`assign`: parks by relief or wedge shape, the core in the middle, industry
at the edge by the water, waterfront, civic, then grid/rowhouse/lanes) — and
none names a `density`. The controls are authored `district` nodes on
rectangular envelopes.

**The anchor's own diff at HEAD** (F2, hellenist): 20 → 29 buildings, cell
lots 15/2/4/1/0 → 15/9/5/2/0 (no seams, no levels — the kerb flip is not
involved; the block changes `BLOCK_MULTI_RECT` / the empty-block law are),
two landmarks relocated (`defense_colossus` 116 blocks from its `at`,
`W521 LANDMARK_COARSE_ABANDONED`: "a site inside the target was feasible
but cost more, and `at`/`zone` is a soft cost the ground can outbid" — an
E2 placement item for the icon metric; `pantheon_museum` −43 → −82 on x),
`I463` 0 → 2, `W413` 0 → 1, `T234` 1 → 0. Read **not-worse** (more town,
icons present; the colossus's move is the solver's documented soft cost).

## B. Why the blocks yield so few lots — probed (verbatim in §E)

An instrumented copy of the district and city passes classified every
block of the two Hellenist documents and the two controls. Three causes
multiply, and **none is the lot rhythm** (`LOT_FRONTAGE`, `LOT_DEPTH`,
`MIN_INFILL_SIDE`, the sliver floor refused nothing; `dropped` 0):

- **Z — park cells get no fabric at all.** `hasFabric()` returns false for a
  `park` character before a street is drawn. The park budget is a count of
  cells (`max(1, floor(cells × PARK_MAX_SHARE))`) — two of six cells on the
  fresh harbour is inside it, and those two are **43,385 of 66,750 cell
  columns, 65 % of the city's own land**; 38 % on sea_siege.
- **A — `no_street_face` at 45°.** `streetBehind` probes 13 columns straight
  out of a side's midpoint; in a cell rotated 45° (`orientationOf`, the
  boulevard's heading) the carriageway runs diagonally past it. 20 of
  sea_siege's 46 blocks, **68 % of the block land it cut**, front nothing
  and yield no lot — all in the 45° cells, none in the 0° cells.
- **B — shredded blocks.** Median block 143–198 columns (control: 900); only
  17–26 % reach `perimeter`; `rectsOf` recovers 72 % of block land as
  rectangles (control 100 %); 19 of 25 productive harbour blocks give
  exactly one lot. A 45° pitch over an irregular arterial face makes every
  block a chord of a diamond — geometry (proposal P3, with P1).

Street land take is real but secondary (43–69 % of a cell vs the control's
48 %, which still gets 4.1 lots per block).

## C. Two switches, landed off

`STREET_FACE_ALONG_SIDE` (`layout/district.ts`): a side is scanned
middle-out (`middleOut()`, pure, tested) and fronts the first street any of
its columns reaches — byte-identical wherever the midpoint already found
one. `PARK_BUDGET_BY_AREA` (`layout/city.ts`): the park budget is
`PARK_MAX_SHARE` of the cells' land; a candidate that would push it over is
skipped, not the end of the pass. Both pinned by
`test/city-density.test.ts`. Off-state: fourteen of fourteen law-5
documents payload-identical.

**Trial (local, not committed) — lots per 10k envelope cells, buildings:**

| document | off | A only | Z only | **both** |
|---|---:|---:|---:|---:|
| hellenist_sea_siege_k1 | 3.3, 23 | 9.3, 48 | 9.8, 44 | **14.3, 63** |
| hellenist_harbour (fresh) | 4.3, 31 | 4.5, 32 | 12.5, 67 | **12.7, 68** |
| r5 anchor @HEAD | 3.1, 29 | 4.2, 37 | 6.3, 48 | **7.1, 52** |
| thalassa_polis (hellenist_r22) | 12.0, 55 | 15.9, 71 | 11.5, 52 | **14.8, 65** |
| troy_k1 (control) | 20.5, 47 | 20.5, 47 | 20.5, 47 | 20.5, 47 |
| metropolis_k1 (control) | 22.8, 74 | 22.8, 74 | 22.8, 74 | 22.8, 74 |

A carries the 45° cells (sea_siege cell_0 16 → 47 lots); Z returns the park
land to fabric (harbour's cell_5: 65 lots where there was grass). Together
the walked hellenist goes from a third of troy's density to two thirds of
it, with the controls untouched. The remaining gap is B.

## D. Disposition

- **Bugs, fixed code-first behind the switches (this unit, off).** The flip
  is the next unit, with: the fourteen payload shas (hellenist_r22 and
  hellenist_k1 will move) attributed; the ground-probe `hellenist` baseline
  regenerated and attributed; renders read; cell-character changes on the
  moved documents listed (a cell that stops being a park gets a kit); FULL
  suite; station 3 re-read.
- **Proposal P3:** blocks in a 45° cell as diamonds, not chords — with P1.
- **E2 note:** the colossus outbid by the ground (`W521`) — the icon
  metric's dominance/placement clause.

## E. The block probe, verbatim

# BLOCK PROBE — why Hellenist city blocks yield so few lots

Instrumented dist (`BLOCK_PROBE=1`), 2026-08-25. Files restored byte-for-byte; shas in
`shas.before.txt` / `shas.after.txt`. Raw: `*.probe.txt`, tables via `tab.mjs` / `agg.mjs`.

## 1. The chain, block → lot (≤12 lines)

1. `layDistrict` builds `blocked` = carriageway ∪ sidewalk ∪ (for a city cell) everything outside
   `cell.lotMask` = `erode(cell.mask, sidewalkWidth)` minus reservations.
2. `cutDeepBlocks` cuts an alley through any block wider than `leafBlockCap` (77 at medium/2). Never fires here.
3. `blocksOf` flood-fills the free columns into components; with `BLOCK_MULTI_RECT = true` each component
   goes to `rectsOf`, which peels up to 8 maximal inscribed axis-aligned rectangles and **stops** as soon as
   the next one is under `MIN_INFILL_SIDE = 7` on its short axis. A component that yields none is dropped entirely.
4. Each rectangle is a `Block`. `subdivide` measures `shortest = min(w,d)`.
   `perimeter = shortest >= 2·MIN_INFILL_SIDE + 2 = 16`; `depth = perimeter ? min(LOT_DEPTH[density], ⌊(shortest−2)/2⌋) : shortest`.
5. `streetBehind` probes outward from the **midpoint** of each of N/S/W/E for at most
   `sidewalkWidth + STREET_PROBE_SLACK` (= 12–13) columns, looking for a carriageway column owned by a segment.
   **`fronts.size === 0` ⇒ the block returns zero lots** (`rejected: "perimeter"`). This is refusal site A.
6. `perimeter === false` ⇒ **one** row of lots spanning the whole block, facing the single best side.
7. `perimeter === true` ⇒ a `depth`-deep strip on each side that has a street; W/E strips are skipped when the
   remaining core is under `MIN_INFILL_SIDE` (refusal site B). A courtyard block cuts all four sides regardless.
8. `emit` refuses a strip whose length < `MIN_INFILL_SIDE` (site C), else cuts
   `count = max(1, round(length / LOT_FRONTAGE[density]))` lots, dropping any that is not wholly free (site D).
9. So a block face gives `round(faceLength / LOT_FRONTAGE)` lots, floored at 1 — and a block gives none only via A, B, C or D.
   `LOT_FRONTAGE` = high 13 / medium 15 / low 19; `LOT_DEPTH` = 17 / 16 / 15; `MIN_INFILL_SIDE` = 7.
10. **Site Z, upstream of all of this:** `hasFabric()` in `city-pass.ts` returns `false` for `character === "park"`.
    A park cell never reaches `layDistrict` at all — no streets, no blocks, no lots.

Reason codes added: `no_street_face` (A), `core_thin_no_strip_emitted` (B),
`face_shorter_than_MIN_INFILL_SIDE` (C), `strip_not_free` (D), plus `thinComponents` (step 3) and
`BP REFUSED` (layDistrict's `DISTRICT_TOO_SMALL`) and `BP KIT` (city.js, per-cell character/kit).

## 2. Per-cell

`land` is over the district's bounding box; `cellMask` is the cell's own columns; `blockLand` is what
`blocksOf` was given. Water is not separated — it is inside `blockedOther` together with the arterials
and the neighbouring cells. `sidewalk` = 3 in both Hellenist documents (intent), 2 in both controls.

### hellenist_sea_siege (`world.neopolis`, city node, envelope 340×240 = 81 600; blockSize 46; 5 cells, 65 832 cell columns)

| cell | kit | dens | blkSize | orient | cellMask | cw | sw | blockLand | blocks | lots | lots/blk |
|---|---|---|---|---|---|---|---|---|---|---|---|
| cell_0 | core | high | 52 | 45° | 24 812 | 5 584 | 6 203 | 12 085 (49%) | 25 | 17 | 0.68 |
| cell_1 | civic | med | 66 | 45° | 6 589 | 631 | 1 005 | 3 753 (57%) | 10 | 4 | 0.40 |
| cell_2 | industrial | med | 79 | 45° | 6 527 | 490 | 919 | 4 257 (65%) | 7 | 3 | 0.43 |
| cell_3 | **park** | low | 73 | 0° | 24 948 | — | — | **no fabric at all** | 0 | 0 | — |
| cell_4 | lanes | high | 35 | 0° | 2 956 | 535 | 780 | 1 193 (40%) | 4 | 5 | 1.25 |
| **city** | | | | | 65 832 | | | | **46** | **29** | **0.63** |

29 lots / 81 600 envelope = **3.6 per 10k**.

### hellenist_harbour (`world.hellenic_metropolis`, city node, envelope 340×240 = 81 600; 6 cells, 66 750 cell columns)

| cell | kit | dens | blkSize | orient | cellMask | cw | sw | blockLand | blocks | lots | lots/blk |
|---|---|---|---|---|---|---|---|---|---|---|---|
| cell_0 | **park** | low | 74 | 45° | 17 280 | — | — | **no fabric at all** | 0 | 0 | — |
| cell_1 | civic | med | 47 | 0° | 6 373 | 995 | 1 326 | 2 883 (45%) | 6 | 11 | 1.83 |
| cell_2 | rowhouse | high | 35 | 0° | 4 589 | 795 | 954 | 2 352 (51%) | 5 | 10 | 2.00 |
| cell_3 | core | high | 44 | 45° | 6 410 | 1 655 | 1 792 | 2 457 (38%) | 9 | 9 | 1.00 |
| cell_4 | lanes | high | 37 | 45° | 5 993 | 1 610 | 2 203 | 1 842 (31%) | 8 | 8 | 1.00 |
| cell_5 | **park** | low | 65 | 0° | 26 105 | — | — | **no fabric at all** | 0 | 0 | — |
| **city** | | | | | 66 750 | | | | **28** | **38** | **1.36** |

38 lots / 81 600 envelope = **4.7 per 10k**. Park cells hold 43 385 columns — **65 % of the city's own land**.

### Controls (both authored `district` nodes, not `city`)

| doc | node | fabric | dens | envelope | cw | sw | blockLand | blocks | lots | lots/blk | per 10k |
|---|---|---|---|---|---|---|---|---|---|---|---|
| troy_k1 | world.troy_citadel | grown, courtyards 0.6 | med | 36 100 | 4 082 | 3 937 | 27 603 (**76 %**) | 32 | 74 | 2.31 | **20.5** |
| metropolis_k1 | world.ruined_metropolis | grid | med | 62 400 | 18 819 | 10 920 | 32 661 (52 %) | 36 | 148 | 4.11 | **23.7** |

### The shape of a block, all four documents

| doc | blocks | lots | lots/blk | median block cols | rect cols | perimeter blocks | zero-lot | exactly-1-lot | avg street faces |
|---|---|---|---|---|---|---|---|---|---|
| metro (control) | 36 | 148 | 4.11 | **900** | 32 661 | **36 (100 %)** | 0 | 0 | **4.00** |
| troy (control) | 32 | 74 | 2.31 | 360 | 22 784 | 12 (37 %) | 8 (2 337 cols) | 11 | 1.34 |
| harbour | 28 | 38 | 1.36 | **143** | 6 871 | 5 (17 %) | 3 (384 cols) | **19** | 1.50 |
| sea_siege | 46 | 29 | 0.63 | **198** | 15 310 | 12 (26 %) | **20 (10 344 cols)** | **23** | **1.04** |

## 3. Per-block, the worst two cells

### sea_siege cell_0 (core, high, 52, 45°) — 25 blocks, 17 lots, 10 refused

| # | w×d | cols | perim | fronts | faces cut | lots | reason |
|---|---|---|---|---|---|---|---|
| 0 | 16×28 | 448 | Y | – | – | 0 | no_street_face |
| 1 | 38×31 | **1 178** | Y | – | – | 0 | no_street_face |
| 3 | 36×30 | **1 080** | Y | – | – | 0 | no_street_face |
| 7 | 35×23 | 805 | Y | west | w:23→2 | 2 | |
| 8 | 24×21 | 504 | Y | west | w:21→2 | 2 | |
| 9 | 21×41 | **861** | Y | – | – | 0 | no_street_face |
| 13,14,23,24 | 15×15 | 225 ea | n | – | – | 0 | no_street_face ×4 |
| 16 | 8×7 | 56 | n | – | – | 0 | no_street_face |
| 17 | 31×31 | **961** | Y | – | – | 0 | no_street_face |
| 2,4,5,6,10,11,12,15,18,19,20,21,22 | 7×8 … 24×8 | 56–300 | n | 1–3 | 1 face → 1 lot each | 1 ea | (13 blocks, 13 lots) |

### sea_siege cell_1 (civic, medium, 66, 45°) — 10 blocks, 4 lots, 6 refused

| # | w×d | cols | perim | fronts | lots | reason |
|---|---|---|---|---|---|---|
| 0 | 20×15 | 300 | n | – | 0 | no_street_face |
| 2 | 7×8 | 56 | n | – | 0 | no_street_face |
| 3 | 29×50 | **1 450** | Y | – | 0 | no_street_face |
| 4 | 19×18 | 342 | Y | – | 0 | no_street_face |
| 6 | 14×14 | 196 | n | – | 0 | no_street_face |
| 9 | 11×11 | 121 | n | – | 0 | no_street_face |
| 1 | 11×11 | 121 | n | s/e | 1 | |
| 5 | 22×9 | 198 | n | w | 1 | |
| 7 | 7×12 | 84 | n | n/w | 1 | |
| 8 | 10×8 | 80 | n | n/w | 1 | |

### harbour cell_3 (core, high, 44, 45°) — 9 blocks, 9 lots (worst lots/block among its productive cells)

Blocks 1,2,3,4,6,7,8 are 56–253 columns, `perimeter = false`, one face, **1 lot each**;
block 0 (23×19) gives 2; block 5 (17×16, 272 cols, perimeter) is refused `no_street_face`.
harbour cell_4 is the same picture: 8 blocks of 56–224 columns, **all eight give exactly 1 lot**.

## 4. Refusal histogram (blocks that yielded zero lots)

| reason | sea_siege | harbour | troy | metro |
|---|---|---|---|---|
| `no_street_face` (A) | **20** | **3** | 8 | 0 |
| `core_thin_no_strip_emitted` (B) | 0 | 0 | 0 | 0 |
| `face_shorter_than_MIN_INFILL_SIDE` (C) | 0 | 0 | 0 | 0 |
| `strip_not_free` (D) | 0 | 0 | 0 | 0 |
| components with no ≥7 rectangle (step 3) | 24 (505 cols) | 6 (463 cols) | 37 (743 cols) | 0 |
| park cells with no fabric (Z) | 1 cell, 24 948 cols | 2 cells, 43 385 cols | — | — |

Every zero-lot block in every document is `no_street_face`. Sites B, C and D never fired once.
`dropped` (site D's counter) is **0** in all four documents — no lot is ever cut and then thrown away.

## 5. Conclusion (6 lines)

1. It is not one reason but three multiplying, and **none of them is the lot rhythm**: `LOT_FRONTAGE`,
   `LOT_DEPTH`, `MIN_INFILL_SIDE`, `LOT_SIDE_GAP` and the sliver floor refuse nothing (sites B/C/D = 0, dropped = 0).
2. **Z — park cells get no fabric.** 65 % of harbour's cell land (43 385 of 66 750 columns) and 38 % of
   sea_siege's (24 948 of 65 832) is a `park` character, and `hasFabric()` returns false for it before a street is drawn.
3. **A — `no_street_face` kills the big blocks.** 20 of sea_siege's 46 blocks, holding 10 344 of its 15 310
   rectangle columns (**68 % of all block land it did cut**), front nothing: `streetBehind` probes 13 columns
   straight out of a side's midpoint, and at `orientation 45` the carriageway runs diagonally past that probe.
   All three 45°-rotated sea_siege cells lose 40–60 % of their blocks this way; the two 0° cells lose none.
4. **Block geometry — the cells are shredded before subdivision.** Median block is 198 columns (sea_siege)
   and **143** (harbour) against **900** in the metropolis control. Only 17–26 % of blocks reach
   `perimeter` (metro: 100 %), so 23 of 26 productive sea_siege blocks and 19 of 25 harbour blocks give
   **exactly one lot** — one fat parcel swallowing the whole block. Cause: a `grid` pitch laid over an
   irregular arterial face, eroded by `sidewalkWidth`, then cut by `rectsOf` (which recovers only 72 % of
   block land here vs 100 % in metro), with 45° rotation making every rectangle a chord of a diamond.
5. **Street land take is real but secondary**: streets are 43–69 % of a Hellenist cell vs 48 % in the
   metropolis control — the control pays the same toll and still gets 4.1 lots per block.
6. **What the controls do differently:** both are authored `district` nodes on a rectangular envelope with
   no cell mask and no rotation. `ruined_metropolis` (grid, 0°) gets 36 identical ~900-column blocks, every
   one with four street faces and four lots. `troy_citadel` (grown + `courtyards: 0.6`) gets large domain-split
   blocks whose courtyard branch cuts all four strips even where `streetBehind` found only one street — which
   is exactly the compensation the Hellenist cells lack.
