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

## F. The flip (unit 9, 2026-08-25): both switches → true

**The fourteen law-5 documents** (payload shas, `bi/off8` vs `bi/on9`):
ten identical; four moved, each attributed:

| world | buildings | cells (lots/blocks) before → after | placements | diagnostics | read |
|---|---:|---|---|---|---|
| hellenist_sea_siege_k1 (walked) | 23 → **63** | cell_0 16/25, cell_1 3/10, cell_2 3/7, cell_4 5/4 → **cell_0 59/32, cell_3 58/16** (the 24,948-column park is fabric; the three small cells are the parks now — 16k columns, 24 % of the land) | 26 → 66 | `I512` 4 → 2 | **better** — the south-east quarter is a grid of quartz blocks where there was grass (render pair `bi/renders/hellenist_k1-{off8,on9}.png`) |
| hellenist_r22 / thalassa_polis (law-5 baseline) | 55 → 65 | cell_1 18/28, cell_3 4/5, cell_4 70/21 → cell_1 **44**/28, cell_4 70/21 (cell_3 became the park) | 57 → 67 | `I512` 3 → 2, `T234` 0 → 1 | better (+10; the street scan doubles cell_1) |
| pirates_r22 | 73 → 80 | cove 53 → 56, citadel 61 → 64 (grown blocks whose midpoint probe missed their street) | 76 → 83 (5 moved) | none | not-worse |
| troy_k1 | 47 → 47 | 74/32 unchanged | 47 → 47 (9 re-faced) | none | not-worse — nine buildings turn to a street the midpoint probe had not seen |

**The fresh Hellenist at the flip:** 31 → **68** buildings, 4.3 → **12.7**
lots per 10k (cell_5, the 26k-column park, now 65 lots); in-district
quartz bricks 53k, glass 6.3k. The r5 anchor at HEAD: 29 → 52, 3.1 → 7.1.

**Ground-probe baseline** `hellenist` regenerated (thalassa moved): owned
columns 63,110 → 57,574 and intents 458 → 378 (cell_3's 5 blocks are a
park now, no quarter plane); building seats 72 → 80, the eight new seats
at delta 0; floaters unchanged. Attributed.

**Verdict on the flip:** better on T7 on every Hellenist, not-worse on the
two organic worlds it touched; the residual against troy's 20 is P3's
diagonal geometry. Lands; Kai's veto open (law 6).

## G. What the flip exposed: the highrise door's missing head course (F13, fixed)

The FULL suite at the flip failed the physics gate on
`examples/c1-harbourtown` — one `floating.slab @ 244,75,102`, a canopy slab
with air on six sides — on a lot the street scan had re-faced (`office`,
`storyHeight 4`, yaw 180). A pass-by-pass voxel trace (verbatim in §H) named
the rule: `packages/stdlib/src/structures/highrise.ts` — `emitHighrise`'s
curtain-wall loop skips the door columns at relative y1, y2 *and* y3 on the
ground storey (`if (s > 0 || y > 3)`), while its comment promises "the
doorway and its head course: opaque, always"; the leaves stand at y1–2, so
y3 *is* the head course, and it was the one cell never written whenever
`storyHeight > 3` put the storey's head band above it. Road sovereignty then
took one of the door's two canopy slabs as a stump and the other was left
floating. Belief vs behaviour, class 1, on every highrise door in every
world; single-leaf doors included.

**Fix:** `HIGHRISE_DOOR_HEAD_SOLID` (`highrise.ts`), the guard `y > 2` — the
wall is written at the head course. Ships `true` in this commit (a red
physics gate does not land; D25); `false` keeps the old guard. Effect: the
harbourtown lints clean; by payload three law-5 documents move, each by
exactly the head-course cells — hellenist_r22 +14 building blocks (7
highrise buildings), hellenist_k1 +4 (2), metropolis_k1 +8 (4) — with no
placement, count or diagnostic moving. The hellenist ground-probe baseline
regenerated a second time. Physics findings that remain on those worlds
(sea-lantern chains and lanterns on the leviathan and harbour props, three
isolated blocks, one dripstone; the metropolis's andesite-wall chains)
predate the Run per the committed baselines' `floaters` and are logged as
F14 for a physics unit; the gate fixture is clean.

## H. The voxel trace, verbatim — appended after §E at the end of this file.

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
# Voxel trace — `floating.slab @ 244,75,102` on `c1-harbourtown`

## The building

`world.harbourtown.cell_14.infill_237_103`, footprint x238–252 / z103–113,
foundationY 71, yaw 180. From `report.layout.structures.buildings[…].meta`:

- `params.archetype = "office"` (no `tags` field on the report row)
- `params.floors = 2`, `params.storyHeight = 4`, `roof = "flat"`,
  `windowShape = "mullion"`, `windowRhythm = "regular"`
- `meta.door = { x: 7, z: 10, face: "south" }` (building-relative)

`office` is in `HIGHRISE_ARCHETYPES`
(`packages/stdlib/src/structures/highrise.ts:84`), so `emitBuilding` routes it to
`emitHighrise` at `packages/stdlib/src/structures/core.ts:1159–1170`. **It never
reaches `emitEntrance`** — the brief's premise that this is an ordinary
`building.grammar` shell with `emitEntrance`'s lintel is wrong. Instrumented
`emitEntrance` logged three 15×11 calls in the whole compile (warehouse,
warehouse, convenience_store) and none of them is this building.

Relative→world: rel y0 = world y72, so rel y1/2 = the door leaves at y73/74,
rel y3 = **y75**, rel y4 = y76. Under yaw 180 the highrise `door` (hinge left)
lands at world x245 and its `secondLeaf` (hinge right) at x244.

## Ordered writes to the four voxels

Instrumented `lay(emitter, list)` in `packages/compiler/dist/structures/index.js`
(every candidate write, before any last-write-wins), plus every drop in the
doorstep columns inside `enforceRoadSovereignty`.

```
#1 lay=buildings idx=368963 244,73,103 stateId=13873   (spruce_door lower, hinge=right)
#2 lay=buildings idx=369018 244,74,103 stateId=13865   (spruce_door upper, hinge=right)
#3 lay=buildings idx=369062 244,75,102 stateId=16239   (mossy_cobblestone_slab[type=top] — canopy, secondLeaf)
#4 lay=buildings idx=369063 245,75,102 stateId=16239   (mossy_cobblestone_slab[type=top] — canopy, door)
#5 lay=buildings idx=369119 244,76,103 stateId=171     (stripped_spruce_log[axis=x] — head course)
#6 lay=buildings idx=369120 245,76,103 stateId=171     (stripped_spruce_log[axis=x] — head course)
   sovereignty BAND-DROP  245,72,102 stateId=8588 emitter=doorsteps groundTop=71
   sovereignty STUMP-DROP 245,75,102 stateId=16239 groundTop=71
```

- **(244,75,103)** — never written by any pass, in any order. Zero candidates.
- **(245,75,103)** — never written by any pass, in any order. Zero candidates.
- **(244,75,102)** — written once (`buildings`, #3), never dropped. The survivor
  the lint reports.
- **(244,76,103)** — written once (`buildings`, #5), never dropped.

## The pass and the rule that leaves the door head as air

`packages/stdlib/src/structures/highrise.ts:387–393`, inside `emitHighrise`'s
curtain-wall loop (the `--- the shaft: curtain wall, storey by storey ---`
block, `highrise.ts:355–405`), reached from `lay("buildings", …)`
(`packages/compiler/src/structures/index.ts:1214`):

```ts
// The doorway and its head course: opaque, always. A door leaf hung in
// a glass pane has nothing to hinge on, and the lobby's opening is
// structure, not glazing.
if (doorColumns.has(key)) {
  if (s > 0 || y > 3) put(cell.x, y, cell.z, wallAt(cell.x, y, cell.z));
  continue;
}
```

Classification: **the shell's own facade rule, not a fit-out, not the doorstep
pass, not decay.** It is the curtain-wall band skipping the door columns. It is
also not "the lintel written one course too high": `emitHighrise` writes **no
lintel at all**. What sits at y76 is the ordinary storey **head band**
(`highrise.ts:383–386`, `const head = y === base + storey`), which for
`storyHeight = 4` falls on rel y4 = world y76 — hence the
`stripped_spruce_log[axis=x]` there and the `spruce_planks` floor plate at y77.

**Belief vs behaviour.** The comment asserts "the doorway *and its head course*:
opaque, always". The guard `s > 0 || y > 3` is written as if the opening were
rel y1–2 and the head course were rel y3+; on the ground storey (`s === 0`) it
skips rel y1, y2 **and y3**, so the cell it names as the head course is exactly
the one it leaves unwritten. Because `if (head)` is tested *before* the
`doorColumns` branch (`highrise.ts:383`), the bug only bites when
`storyHeight > 3`: at `storyHeight === 3` rel y3 *is* the head band and gets its
frame log, and the door head is solid. This building has `storyHeight = 4`, so
rel y3 falls through to the door-column skip and stays air.

## Why the slab is left floating

The head-course hole alone would not lint: the two canopy slabs at
(244,75,102) and (245,75,102) are neighbours and support each other.
`enforceRoadSovereignty` (`packages/compiler/src/structures/index.ts:2922–2999`)
takes one of them:

1. Column (245,102) is road-sovereign with `plan.ground = 71`. The `doorsteps`
   pass laid a step at (245,72,102), inside the band
   `y <= top + ROAD_SOVEREIGN_HEADROOM` (`ROAD_SOVEREIGN_HEADROOM = 3`,
   `index.ts:419`) → **BAND-DROP**, and the column joins `cleared`.
2. Pass 2, "the clear leaves no stump" (`index.ts:2964–2983`), walks upward from
   `y = top + HEADROOM + 1 = 75` while the foreign stack is unbroken, finds the
   canopy slab at (245,75,102) and drops it too → **STUMP-DROP**.

Column (244,102) is untouched (no band drop logged there), so its canopy
survives. With (245,75,102) gone, (245,75,103) and (244,75,103) air from the
highrise rule, and nothing above or below, (244,75,102) has air on all six
sides → `floating.slab`.

## Does it strike single-leaf doors?

Yes — it is **not** specific to two-leaf doors, nor to `inn`/`hall`. This is the
highrise grammar, not `emitEntrance`; its `secondLeaf` is computed
unconditionally whenever it fits (`highrise.ts:297–305`), with no archetype gate.
`doorColumns` holds both leaves and the `s > 0 || y > 3` guard applies per
column, so a single-leaf highrise door (a footprint where `secondLeaf` does not
fit) gets the same air cell at rel y3. The trigger is the grammar
(`skyscraper` / `office` / `hotel` / `apartment_block`) plus `storyHeight > 3` —
not the leaf count.

## Shas — dist restored byte-for-byte

Before and after are identical:

```
85910f431974fe54229622fbd0659e20d7fb1835ceaf31128e115449e804d527  packages/compiler/dist/structures/index.js
f6bca413cea836e6056e71dc10ccbe6b8a713a7eff7453681bd3dc33f8b0fb19  packages/stdlib/dist/structures/core.js
```

Backups: `index.js.bak`, `core.js.bak` in this directory; `shas-before.txt` /
`shas-after.txt` diff clean.
