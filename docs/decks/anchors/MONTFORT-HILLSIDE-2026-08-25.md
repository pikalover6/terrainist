# Montfort's hillside replan (unit 5, 2026-08-25)

Spec §10.2, second item: a walled medieval city on a hill comes out as one
keep and a handful of houses inside a full circuit (T4 FAIL:
`docs/decks/montfort_hill_k1/`, Kai's walk; the before-sample
`walled_medieval_city` reads 11 district buildings inside a 240 × 240 wall).
montfort_k1 was byte-identical at the kerb flip (unit 4), so its cause is not
the block election.

## A. Where the buildings go — the numbers

| | montfort_k1 | walled (before-sample) | troy_r22 at the kerb flip |
|---|---:|---:|---:|
| form | `hillside` (site plan) | `hillside` | `grown` |
| principal contour streets | 2 (82, 93) | 4 (67, 75, 93, 102) | — |
| frontage strips drawn / dissolved | 5 / **4** | 10 / **11** | — |
| lots / dropped | 8 / 20 | 38 / 23 | 83 / 10 |
| district buildings | **1** | 11 | 45 |
| `W527 WALLED_QUARTER_SPARSE` | silent | silent | fired before the flip, silent after |

Both documents name `fabric: hillside`, `density: medium`, `ground: stepped`,
`walls.margin 10`; the intent pre-pass reads "on a hill" as
`urbanForm: hillside`. The planner (`docs/SITE-PLAN-v0.md` §3.4, §3.7) claims a
frontage strip station by station along each contour street and **dissolves
a strip whose held stations number fewer than `minStripRun` (two lots, 30
columns at medium)** — giving its ground back to natural. Montfort dissolved
four of its five strips.

## B. Why the stations pinch — probed, not theorised

An instrumented copy of the built planner (dist patched under
`HILLSIDE_PROBE=1`, restored byte-for-byte, sha `66bc19ac…` before and after)
classified every refused station on both documents. The report follows
verbatim in §E. The findings:

- **The hill is not too steep.** Pristine rise per column is 0.00–0.55
  (medians 0.09–0.45) at held stations and the same at refused ones; the
  terrace-rise test (`TERRACE_RISE = 6` over a 19-column target) refuses only
  above ≈ 0.6 blocks/column, reached almost nowhere. `minStripDepth` never
  fires (floor 0 on all 32 street sides); the cut-edge test never fires;
  `walls.margin` plays no part.
- **Two thirds of the refused stations (696/1054 montfort, 1103/1591 walled)
  had cleared the depth floor and were refused for one reason: the
  nearest-point tie.** The column → station map takes the nearest polyline
  point with strict `<` (lower index wins). On an axis-aligned run every
  station is nearest to its own band; on a 45° diagonal the equidistant
  columns all go to the lower index and `held` reads `1010…`; on a 2:1
  staircase `100100…`. `stations` — compared with `minStripRun` to dissolve,
  and handed to `allocateFrontage` to cut lots — is then the frontage divided
  by two or three, not "the frontage it actually holds" that the compaction
  comment promises (slop class 1: belief vs behaviour).
- The cost: 1,474 columns (montfort) and 4,075 (walled) of already-claimed
  strip handed back to natural ground; walled's `c1 run2 +` side dissolved on
  **29 stations against a minimum of 30**, giving up 669 buildable columns.
- Downstream, `frontageLots` cuts lots by the same count, so on a diagonal
  every lot spans twice its frontage and the strip yields half its lots.

Two further findings ride along: the `SITE_STRIP_DISSOLVED` note §3.7
mandates does not exist (no such diagnostic; only an `adapted` string) —
doc drift, class 6; and `W527`'s gate is `planned === undefined`, so the T4
guard is blind on the planned path — the form every walled hill town gets
(class 1). Both are their own small unit.

## C. The switch — `STRIP_FRONTAGE_BY_CLAIM` (`layout/forms/hillside.ts`)

On, a station whose probed depth on this side is positive is `held` too: the
ground exists and the strip claims it through its neighbours, so the
frontage line is continuous and `stations` is its arc length. The
column → station map is untouched; a lot spanning such a station gathers its
columns from the neighbours the tie gave them to (`frontageLots` partitions
stations, not columns). Pure rule `claimableStations()` pinned by
`packages/compiler/test/strip-frontage.test.ts`. **Landed `false`.**

**Byte-identity at `false`** (law 5): the nine law-5 worlds (`bi/after-on`
vs `bi/off5`) and five hillside documents — `examples/hillside-village`,
`examples/site-plan-hillside`, `examples/site-plan-hillside-steep`,
montfort_k1, the before-sample walled city (`bi/ex-before` vs
`bi/ex-off5`) — fourteen of fourteen identical.

**Trial at `true`** (local, not committed):

| document | buildings | district | lots / dropped | dwellings | strips drawn / dissolved | notes |
|---|---:|---:|---:|---:|---:|---|
| montfort_k1 | 5 → **13** | 1 → **9** | 8/20 → 20/55 | 1 → 11 | 5/4 → 6/3 | physics clean |
| walled (before-sample) | 13 → **24** | 11 → 22 | 38/23 → 47/67 | 26 → 31 | 10/11 → 9/6, replan 1 → 2 (3 streets) | **`E170 CANNOT_FIT` on `summit_church` 13 × 17** — lots are now their true width and none is 17 deep on the frontage; the landmark needs a merged site (flip unit) |
| site-plan-hillside | 11 → 16 | 8 → 13 | 14/6 → 23/12 | 16 → 23 | 3/0 → 3/0 | |
| site-plan-hillside-steep | 7 → 14 | 5 → 12 | 18/7 → 17/19 | 13 → 18 | 6/8 → 8/7 | |
| hillside-village | 11 → 11 | no district | | | | identical |

Buildings roughly double on every planned hill; `lotsDropped` climbs with
them, which is the next lever (the probe's own "not answered": why
`district.ts` drops the surviving lots — the seated rectangle of a diagonal
parcel against `MIN_INFILL_SIDE`, presumably; measure before theorising).

## D. Disposition

- **Bug, fixed code-first behind the switch (this unit, off).** The flip is
  the next unit, with: the fourteen shasums and every moved world attributed;
  a landmark-on-frontage answer for `E170` (a landmark takes the stations it
  needs); the dropped-lots probe; before/after renders read by the instrument;
  the FULL suite.
- **Proposals / small units:** the `SITE_STRIP_DISSOLVED` note; `W527` on the
  planned path (coverage = built columns / enclosed land minus streets).
- The keep: montfort's keep ended as a root-level building north of the
  circuit after six `E170` rounds (walk card) — an E2 machinery item ("where
  a program/landmark is placed"), noted for the icon metric.

## E. The probe report, verbatim

# Why hillside strips pinch out — a probe, not a theory

Instrumented build: `packages/compiler/dist/layout/forms/hillside.js` (temporary,
restored byte-for-byte; sha `66bc19ac…f43c` before and after). Probe gated on
`HILLSIDE_PROBE=1`, one stderr line per (replan round, candidate, run, side).

## The claim rule, in ten lines

1. `probe(p, n, sign, e, dTarget)` marches from `claimStart = half+1 = 3` outward
   along the station's true normal and counts columns while: inside the region,
   `claimed[k] !== 1`, and `|smooth[k] − e| <= TERRACE_RISE (6)`. First failure breaks.
2. `depths[i] = [up >= floorDepth ? up : 0, down >= …]`, `floorDepth = minStripDepth(sidewalk=2) = 2+7+1 = 10`.
3. `whole[i]` additionally demands the whole cross-section (`half+sidewalk+1`) be inside the region.
4. `laid[i] = (up>0 || down>0) && whole[i]`; runs of `laid` become streets.
5. Within a run, a BFS out from the carriageway marks reachable columns (same
   mask / claimed / TERRACE_RISE tests), then each reached column is re-assigned
   to its **nearest path point** — `if (d < bestD)`, so **ties go to the lower index**.
6. A station is *held* only if at least one non-`paved` column names it as nearest
   and lies within `perp <= claimStart + deep − 1`.
7. `stations` = held count. `stations < minStripRun(medium) = 2×15 = 30` → the strip
   dissolves and hands its columns back to natural ground.

## Reason codes added

`ok` held · `floor` claim < 10 · `rise` probe broke on TERRACE_RISE · `clm` broke on an
already-claimed column · `out` broke on the region edge · `edge` `whole` false ·
`u_paved` **claim was deep enough but every column assigned to the station was
carriageway/verge** · `u_bfs` / `u_steal` / `u_far` other not-held cases.
Slope = pristine `ctx.ground.height` rise per column along the station's outward
normal over 12 columns, min/median/max, held vs not-held.

## montfort_hill (final replan round 2, density medium)

10 street sides, 1446 stations, **392 held**, 9604 columns claimed.

| c/run/side | lvl | len | held | reasons | slope held | slope miss | verdict |
|---|---|---|---|---|---|---|---|
| 0/0/+ | 82 | 300 | 92 | u_paved 169, out 39 | 0.00/0.27/0.55 | 0.00/0.27/0.55 | KEEP |
| 0/0/− | 82 | 300 | 68 | u_paved 101, rise 131 | 0.09/0.18/0.45 | 0.09/0.45/0.64 | KEEP |
| 1/0/+ | 93 | 21 | 9 | u_paved 12 | 0.18/0.18/0.27 | 0.18/0.18/0.27 | DISSOLVE |
| 1/0/− | 93 | 21 | 3 | u_paved 4, out 14 | 0.36/0.36/0.36 | 0.09/0.27/0.36 | DISSOLVE |
| 1/1/+ | 93 | 119 | 31 | u_paved 53, rise 35 | 0.18/0.27/0.45 | 0.27/0.36/0.55 | KEEP (by 1) |
| 1/1/− | 93 | 119 | 19 | u_paved 50, clm 26, out 24 | 0.45/0.45/0.55 | 0.09/0.45/0.55 | DISSOLVE (421 cols) |
| 1/2/+ | 93 | 14 | 0 | rise 14 | – | 0.45/0.55/0.55 | DISSOLVE (0 cols) |
| 1/2/− | 93 | 14 | 14 | – (all held) | 0.45/0.55/0.55 | – | DISSOLVE (310 cols) |
| 1/3/+ | 93 | 269 | 70 | u_paved 161, rise 38 | 0.18/0.36/0.55 | 0.18/0.36/0.64 | KEEP |
| 1/3/− | 93 | 269 | 86 | u_paved 146, clm 1, out 36 | 0.18/0.36/0.45 | 0.00/0.27/0.55 | KEEP |

Totals: ok 392, **u_paved 696 (66% of the 1054 not-held)**, rise 218 (21%),
out 113, clm 27, **floor 0, edge 0, u_bfs 0, u_steal 0, u_far 0**.
Dissolved: 5 sides (4 with `stations>0`, matching the report), **1474 already-claimed
buildable columns handed back**.

## walled_medieval_city (single round, density medium)

22 street sides, 2458 stations, **867 held**, 21589 columns claimed. Selected rows:

| c/run/side | lvl | len | held | reasons | slope held | slope miss | verdict |
|---|---|---|---|---|---|---|---|
| 0/0/+ | 67 | 355 | 154 | u_paved 188, clm 12 | 0.00/0.09/0.27 | 0.00/0.09/0.27 | KEEP |
| 0/0/− | 67 | 355 | 143 | u_paved 172, clm 34 | 0.00/0.09/0.36 | 0.00/0.09/0.36 | KEEP |
| 0/1/± | 67 | 32 | 7 / 10 | u_paved 12/16, clm 13 | 0.00–0.09 | 0.00–0.09 | DISSOLVE (426+476 cols) |
| 1/1/+ | 75 | 141 | 57 | u_paved 79, clm 5 | 0.18/0.27/0.36 | 0.09/0.36/0.45 | KEEP |
| 1/2/+ | 75 | 66 | **29** | u_paved 34, clm 3 | 0.36/0.45/0.55 | 0.36/0.36/0.45 | **DISSOLVE by one station (669 cols)** |
| 1/2/− | 75 | 66 | 6 | clm 53, u_paved 7 | 0.27/0.36/0.36 | 0.27/0.36/0.36 | DISSOLVE (201 cols) |
| 2/1/+ | 93 | 223 | 53 | u_paved 76, rise 59, clm 34 | 0.27/0.45/0.55 | 0.27/0.45/0.64 | KEEP |
| 3/0/+ | 102 | 170 | 44 | clm 86, u_paved 31, out 9 | 0.27/0.36/0.36 | 0.27/0.36/0.45 | KEEP |
| 3/0/− | 102 | 170 | 72 | u_paved 98 | 0.18/0.27/0.36 | 0.18/0.27/0.36 | KEEP |
| 3/1/+ | 102 | 49 | 1 | clm 48 | 0.36 | 0.27/0.36/0.36 | DISSOLVE (16 cols) |
| 3/1/− | 102 | 49 | 24 | u_paved 24, u_far 1 | 0.27/0.36/0.36 | 0.36/0.36/0.36 | DISSOLVE (745 cols) |
| 3/2/± | 102 | 23 | 9 / 7 | u_paved 8/5, clm 11, out 6 | 0.18–0.36 | 0.09–0.36 | DISSOLVE (280+700 cols) |

Totals: ok 867, **u_paved 1103 (69% of the 1591 not-held)**, clm 376 (24%),
rise 63 (4%), out 47, **floor 0, edge 0, u_bfs 0, u_steal 0**, u_far 2.
Dissolved: 12 sides (11 with `stations>0`, matching the report), **4075 already-claimed
buildable columns handed back**.

## The mechanism behind `u_paved` — a lattice tie, not a slope

The `held` bit pattern along a run is periodic, and the period is the run's
raster heading:

```
1/3/+ montfort  1000001000100010010001001000100010010010000100001010000101…  (1-in-3, 2:1 staircase)
1/1/+ montfort  …0101010101010101010101…                                    (1-in-2, 45° diagonal)
1/2/− montfort  11111111111111                                              (axis-aligned: every station holds)
2/1/+ walled    10010101010101010101010000000000000000000000000…
```

`arc == len − 1` on every run, so there is exactly one station per block of
street. On a 45° diagonal, a column at `(x,z)` is equidistant from two path
points whenever `x+z` is odd, and the strict `d < bestD` gives every tie to the
lower index — so alternate stations receive **only their own paved column**
(`asgMedPaved = 1`) and are declared pinched out. The held stations then take
~25 columns each (9604 columns / 392 held on montfort). `stations` is therefore
not the frontage arc length §4.2 wants; on diagonal contours it is that length
divided by 2–3.

## Conclusion (6 lines)

1. The dominant reason stations pinch out is **`u_paved`** — 696/1054 (66%) on
   montfort, 1103/1591 (69%) on walled: a station whose claim cleared the depth
   floor is discarded because the nearest-point tie rule gave every column of its
   territory to a neighbour, leaving it only carriageway.
2. **`minStripDepth` never fires: `floor = 0` on all 32 street sides of both documents.**
   The depth floor is not the cause. Nor is the cut edge (`edge = 0`), nor the wall
   margin — `params.walls.margin` never appears in the strip claim at all.
3. The genuine ground reasons are secondary: terrace-rise 218 (21%) on montfort,
   already-claimed columns 376 (24%) on walled, region edge 113/47.
4. **The hill is not too steep.** Pristine slope at held stations runs 0.00–0.55
   blocks/column (medians 0.09–0.45); at *not-held* stations it is the same
   distribution — 0.00–0.64, medians 0.09–0.45. With `TERRACE_RISE = 6` and a
   19-column target, the rise test only zeroes a claim above ≈0.6 blocks/column,
   which is reached almost nowhere. The rule is refusing buildable ground.
5. The cost is measured: 1474 columns (montfort) and 4075 columns (walled) of
   ground already claimed as strip are handed back to natural ground by dissolves —
   walled's `c=1 run=2 +` side dissolved on **29 stations against `minStripRun` 30**,
   throwing away 669 buildable columns for one station.
6. Not answered by this probe: why the surviving strips still drop 20 / 23 lots
   downstream in `district.ts`, and whether `stations` should be replaced by arc
   length or the tie rule made side-aware — both are outside the instrumented code.

## F. The flip (unit 6, 2026-08-25): `STRIP_FRONTAGE_BY_CLAIM` false → true

**The fourteen law-5 documents** (`bi/after-on` vs `bi/on6`, `bi/ex-before`
vs `bi/ex-on6`): the nine non-hillside worlds and `hillside-village` (no
district) byte-identical; the four planned hills moved, each attributed:

| world | buildings | district | buildingBlocks | lots / dropped | dwellings | diagnostics | read |
|---|---:|---:|---:|---:|---:|---|---|
| montfort_hill_k1 | 5 → **13** | 1 → 9 | 5,349 → 13,794 | 8/20 → 20/55 | 1 → 11 | none | **better** — a town appears inside the circuit; the wall (the built hull, see below) grows 176 → 606 course columns |
| walled (before-sample) | 13 → **24** | 11 → 22 | 29,564 → 28,499 | 38/23 → 47/67 | 26 → 31 | `E170` 0 → 1 (`summit_church` 13 × 17), `T237` 12 → 9 | better on T4; **one landmark lost** — attributed below and restored by the next switch |
| site-plan-hillside | 11 → 16 | 8 → 13 | 16,123 → 24,215 | 14/6 → 23/12 | 16 → 23 | `W413` 0 → 1 | not-worse (+5) |
| site-plan-hillside-steep | 7 → 14 | 5 → 12 | 12,230 → 17,729 | 18/7 → 17/19 | 13 → 18 | `W413` 6 → 4 | not-worse (+7) |

**The wall changed shape, by its own law.** Both circuits tightened round
the new town — montfort's to the dense south-west cluster, the walled
city's to a triangle — because `structures/fabric-hull.ts` draws the wall
round the hull of what was actually built (core fabric = building
footprints, plus paving that hugs it), the reference frame Kai's Troy walk
of 2026-08-11 ratified. More town, bigger and tighter wall: montfort's
course 176 → 606 columns, the walled city's 946 → 994. Read not-worse (T4:
buildings dominate walls); montfort's keep stood outside the circuit
before and after (walk card). Render pairs:
`bi/renders/{montfort_hill,walled_medieval_city}-{ex-off5,ex-on6}.png`.

**The lost church, and the drops — probed** (`scratchpad/lot-probe/`,
verbatim in §G): every drop in `frontageLots` is the rectangle test
(montfort 47/49, walled 55/58), split ~70/30 between **bookkeeping** — a
built lot marks its whole BFS blob `taken` with a budget of `size ×
MAX_INFILL_DEPTH` ≈ 240 columns in a 19-deep strip, runs sideways and
starves the next lot (30 of the walled city's 43 starved lots follow a
built one) — and **geometry** — an axis-aligned rectangle inside a
diagonal band. And the "whole strip offered to a landmark" is the union of
the lots already seated (deepest seat 14 on a 19-deep strip; largest site
anywhere 20 × 9), which is why a 13 × 17 church that used to fit on a
30-column-wide lot gets `E170`.

**Two more switches, landed off in this commit** (`layout/district.ts`,
pinned by `test/frontage-lots.test.ts`):
`LOT_PARCEL_OWN_STATIONS` (a parcel grows inward through its own stations)
and `PLANNED_SITE_WHOLE_STRIP` (the site is the strip's free mask; the
landmark claims only the lots it covers). Off-state byte-identical to the
flip on all fourteen (`bi/on6b`, `bi/ex-on6b`). Trial at both `true`
(`bi/ex-trial7`):

| document | buildings | district | buildingBlocks | lots / dropped | dwellings | landmarks unplaced |
|---|---:|---:|---:|---:|---:|---:|
| montfort_hill_k1 | 13 → 12 | 9 → 8 | 13,794 → 20,259 | 20/55 → 25/50 | 11 → 14 | 0 |
| walled (before-sample) | 24 → 20 | 22 → 18 | 28,499 → 30,571 | 47/67 → 53/62 | 31 → 27 | **1 → 0** — the church seats |
| site-plan-hillside | 16 → 20 | 13 → 17 | 24,215 → 30,206 | 23/12 → 31/3 | 23 → 26 | 0 |
| site-plan-hillside-steep | 14 → 17 | 12 → 15 | 17,729 → 18,060 | 17/19 → 26/10 | 18 → 23 | 0 |

Fewer, deeper buildings on the two diagonal-heavy hills (the church takes
the four lots it covers), more on the fixtures; the drops that remain are
the geometry half — **a proposal**: seat frontage buildings at the street's
yaw on planned strips (SITE-PLAN §4.2 keeps rectangular, axis-aligned
buildings "for v0"; on a 45° contour the largest axis-aligned rectangle of
a 15 × 19 parcel is under `MIN_INFILL_SIDE`). That is a grammar-facing
change, more than a day, written up in the ledger's PROPOSALS.

## G. The lot probe, verbatim

# LOT-PROBE — why frontage lots drop, and why a 13 × 17 landmark cannot be seated

Probe: `packages/compiler/dist/layout/district.js` patched under `LOT_PROBE=1`
(stderr only), compiled `montfort_hill.loam.json` (mh) and
`before-sample/walled_medieval_city.doc.json` (wc) with `--report`, then restored.

dist sha before = after = `f8eb419096e7eb7cf78689aa975ffc13d5b9df62ca0362df2cbd75eaab91d7b3`

Raw: `mh.err` / `wc.err`; reports `mh.report.json` / `wc.report.json`.

## The `dropped++` sites in `frontageLots` (src lines 3803, 3810)

| code | site | condition |
|---|---|---|
| `D1_NO_COLUMNS` | 3803 | the grown parcel is empty (`columns === 0`) |
| `D2_NO_RECT` | 3810 | `largestRect(bounds, member) === null` |
| `D3_RECT_THIN` | 3810 | rect's short side `< MIN_INFILL_SIDE` (= 7) |

The other `dropped++` in the district are outside `frontageLots`: `subdivide`'s
`emit` (strip shorter than 7; lot not free — src 3573, 3587) and `tryInfill`
(`infillLot` returned null — src 2110). Report `lotsDropped` sums all of them:
mh 55 = 49 (frontageLots) + 6; wc 67 = 58 (frontageLots) + 9.

## Q1 — drops by reason

| doc | lots cut | BUILT | D1_NO_COLUMNS | D2_NO_RECT | D3_RECT_THIN | dropped |
|---|---|---|---|---|---|---|
| mh | 69 | 20 | 2 | 0 | 47 | 49 |
| wc | 105 | 47 | 3 | 0 | 55 | 58 |

**Every drop is the rectangle test.** `largestRect` never returns null; 96 % of
drops are a rectangle whose short side is under 7.

### Largest-rectangle short side, dropped vs kept

| short side | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 13 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| mh dropped | 13 | 8 | 3 | 3 | 8 | 12 | – | – | – | – | – | – |
| mh kept | – | – | – | – | – | – | 5 | 6 | 4 | 4 | 1 | – |
| wc dropped | 26 | 8 | 1 | 0 | 6 | 14 | – | – | – | – | – | – |
| wc kept | – | – | – | – | – | – | 9 | 9 | 16 | 10 | 2 | 1 |

Kept lots cluster at 7–10; there is no near-miss population — the drops are
either ~1–2 (no parcel left) or 5–6 (a diagonal ribbon).

### Lot station spans (the frontage allocation is healthy)

`LOT_FRONTAGE` gives 13–16 stations everywhere; the span is never the problem.

| span (stations) | 13 | 14 | 15 | 16 |
|---|---|---|---|---|
| mh all / dropped | 1/0 | 10/8 | 35/29 | 23/12 |
| wc all / dropped | – | 13/10 | 78/42 | 14/6 |

### The two populations — geometry vs bookkeeping

Cross-tab of dropped lots by parcel size (`columns`, budget = span × 16 ≈ 240)
against the rectangle's short side:

| doc | cols < 25 & short ≤ 2 | cols 25–149 | cols ≥ 150 & short 3–6 | cols ≥ 150 & short ≤ 2 |
|---|---|---|---|---|
| mh (49) | 21 | 13 | 13 | 2 |
| wc (58) | 34 | 9 | 15 | 0 |

- **Bookkeeping — starved parcels (mh 21 + part of 13; wc 34 + 3):** the parcel
  grew to a handful of columns and its rectangle is 1 × 1. Cause: a *built*
  neighbour marked **every column of its own grown parcel** `taken`
  (src 3822: `for (…) if (member[c] === 1) taken[c] = 1`), not just its seated
  rectangle. Growth is a greedy BFS up to `size × MAX_INFILL_DEPTH` = 240
  columns, and a strip is only 19 deep, so a built lot's BFS runs *sideways*
  along the frontage and eats the next lot's stations. The strip traces show the
  alternation directly, e.g. wc strip 0:
  `B9x9 B10x11 x1x1/7 B14x11 B11x9 x8x2/23 B14x10 …`.
  In wc **30 of the 43 starved lots immediately follow a BUILT lot**; in mh 14
  of 34 (the rest follow a dropped lot that starved on the same built parcel two
  places back). Dropped lots never mark `taken` — the `continue` precedes the
  marking — so drops do not cascade of their own accord.
- **Geometry — diagonal parcels (mh 13–15; wc 15):** a full-budget parcel
  (240–256 columns, i.e. all the ground the lot is allowed) whose largest
  *axis-aligned* rectangle is a ribbon: mh `26x6/240`, `28x6/241`, `21x5/200`,
  `2x30/224`; wc `6x12/240`, `13x5/256`, `11x6/241`, `6x16/181`. wc strip 7
  (130 stations, 9 lots, 665 free columns) built **nothing** — every lot is
  6 wide because the strip runs diagonally.

**Other bookkeeping is not a factor.** The per-strip census shows `taken` never
removes a column at strip entry (`taken=0` on all 6 mh and all 9 wc strips —
strips are disjoint), `badst=0` everywhere, and the `MAX_INFILL_DEPTH` cut is
small (mh 59 of 8 184 strip columns = 0.7 %; wc 338 of 15 341 = 2.2 %).
`blocked` removes 12 % (mh 1 003) / 8 % (wc 1 237) — real terrain and street,
not bookkeeping.

**Verdict.** The dominant drop reason is `D3_RECT_THIN` (mh 47/49 = 96 %,
wc 55/58 = 95 %), and it splits roughly half and half:
**mh ≈ 34 bookkeeping / 15 geometry; wc ≈ 37 bookkeeping / 15 geometry.**
The bookkeeping half is one line — a built lot claiming its whole BFS blob
rather than its seated rectangle plus a margin, with a BFS budget (240) an
order of magnitude larger than the rectangle it seats (~90). The geometry half
is the genuine limit: an axis-aligned rectangle inside a diagonal 19-deep band.

## Q2 — the landmark seat, and the 13 × 17

`claimSite` (src 4264) tries two things:

1. `claimRun` — a run of ≤ `MAX_LANDMARK_RUN` *adjacent* unclaimed lots (same
   block, same face, consecutive `order`), using the union of their seated
   rectangles. A run only ever grows **along** the frontage; its depth is the
   union's depth, i.e. one lot's seated depth.
2. `blockSites` — for a planned strip this is `largestRect(bounds, stripRect)`
   at src 3846, and **`stripRect` is the union of the lots already seated on
   that strip**, not the strip's own mask. So "the whole strip, offered to a
   landmark" is in fact only the largest axis-aligned rectangle inside the
   buildings already placed.

### wc at the current dist — every candidate the search saw

47 unclaimed lots, none deeper than 14:

`13x13 15x7 10x9 9x10 7x14 12x8 10x11 14x10 11x9 9x9 14x11 9x10 8x9 10x11`
`10x10 15x10 13x8 9x9 15x10 8x10 18x7 15x9 14x9 9x10 11x7 12x11 11x7 9x10`
`14x8 9x8 20x9 7x7 9x8 13x7 11x10 9x10 7x8 11x7 10x10 8x13 9x10 9x9 8x9 9x9`
`10x11 9x10 10x10`

Largest by area: **20 × 9** (180); largest short side: 13 (`13x13`);
largest depth: 14 (`7x14`).

8 block sites (one per strip that seated anything; strip 7 seated nothing so it
offered none):

| site | b0 | b1 | b2 | b3 | b4 | b5 | b6 | b8 |
|---|---|---|---|---|---|---|---|---|
| w × d | 13×13 | 15×10 | 10×10 | 10×11 | 14×8 | 12×11 | 20×9 | 8×13 |

Largest site: **20 × 9**. Compare the ground actually available: strip 0 holds
4 150 columns of which 3 984 are free, and it offers a 13 × 13 site, because
only 1 513 columns were seated and the seated rectangles do not abut.

A 13 × 17 (rotated 17 × 13 on an east/west face) needs one side ≥ 17. **No
candidate has a side over 15 except `20x9` and `18x7`, whose other side is
9 and 7.** Hence `LOAM-E170 CANNOT_FIT`.

### The previous behaviour, for contrast

`bi/ex-off5/walled_medieval_city.report.json`: `world.hill_city.summit_church`
placed at yaw 180 with footprint `x0 −132 … x1 −120`, `z0 −161 … z1 −145` —
exactly **13 × 17**, `landmarksUnplaced: 0`, `stats.blocks: 10`, `lots: 38`,
`lotsDropped: 23`. That district ran the rectangular-block path, whose
`subdivide` `cut.front` offers a whole block frontage strip, so a 13 × 17 site
existed for free.

### What a true-width frontage would need

The strips are **19 columns deep**, so a 17-deep seat is available on depth
alone (17 ≤ 19) — the depth is there and is being thrown away. What is missing
is width in the *offered* rectangle:

- On the block-site path: `stripRect` must be the strip's **own mask** (or at
  least the lots' union parcels), not the seated rectangles. Strip 0 at 3 984
  free columns and 19 deep contains far more than 13 × 13.
- On the lot-run path: a landmark needs a run whose union is ≥ 13 wide **and**
  ≥ 17 deep. At `LOT_FRONTAGE` ≈ 15 stations per lot, 13 columns of width is
  **one lot**; the binding constraint is depth — the seated rectangles top out
  at 14 because the parcel BFS and the 7-wide rectangle test never reach the
  back of the 19-deep strip. Concretely: a 13 × 17 needs **a single lot seated
  to the strip's full depth (17 of 19)** rather than a run of stations —
  today's deepest seat is 14, and the median kept depth is 9–10.

## H. What the flip cost, per unit (the re-pinned goldens)

The FULL suite at the flipped bytes failed 28 pinned numbers in
`walkability.test.ts`, `site-plan-hillside.test.ts` and
`site-plan-transitions.test.ts`, all over the two site-plan fixtures whose
buildings doubled. Each was re-pinned **with its cause and its per-unit
reading** (69 assertions touched: 27 better per unit, 27 same, **15 worse
per unit**). The worse ones, stated plainly:

- steep fixture `entranceReachableShare` 0.966 → **0.850** — one laid column
  in six unreachable on foot where it was one in thirty; `soloWorstDensity`
  0.621 → **1.464** (the worst solo place is now 2.3× the worst junction;
  the module's founding co-location claim inverted); `soloDensity` +50 %;
  sunken lamps per lamp 0.18 → 0.26; cut-off columns 2.2 % → 3.0 % with
  undressed cut-offs still 100 % of them.
- hillside fixture: `junctionDensity` +13 %, `soloDensity` +24 %, sunken
  lamps 0.08 → 0.14, buried columns 1.5 % → 1.8 %, `lotsDropped` 7 → 12.

**Mechanism** (the audits' own witnesses): a lot seated on a station the old
rule dropped sits on steeper claimed ground, cuts its own platform, and the
unfeathered cut face beside it is the shoulder/verge debt — now paid on
twice as many lots. That debt is the parked compiler backlog item
"shoulder/verge" (spec §2); it is logged as finding F9 and proposal P2, not
chased here.

**On the named worlds** (in-process walkability audit, `scratchpad/
walk-audit.mjs`, before → after): montfort buried/column 0.017 → 0.011,
unserved faces 17 → 14, components 17 → 25, solo density 0.006 → 0.020 with
2.6× the buildings; walled buried/column 0.021 → 0.019, unserved faces
37 → 25, dead ends 25 → 16, solo density 0.031 → 0.037 with 1.85× the
buildings. `entranceReachableShare` reads **0 on both sides of both
worlds** — the audit's reach never enters these quarters (orphan columns
1,4k / 4,9k), an instrument gap to close before it can decide anything
here.

**Verdict on the flip:** better on T4/T7 on every planned hill and on the
named worlds' own dressing counts; worse per unit on the steep fixture's
reachability and clutter, attributed to unpaid shoulders on the new lots.
Lands, with F9/P2 open and Kai's veto open (law 6).

## I. The second flip (unit 7, 2026-08-25): one switch ships, one stays off

**Node moved under the Run.** Between units 6 and 7 this machine's Node went
26.5 → 26.7 (`~/.local/bin/node`, 04:40). Every compressed byte of every
world changed while every decompressed payload stayed identical (troy_r22:
1024 of 1024 chunk payloads and `level.dat` equal). Byte-identity is now
read with `tools/worlds/world-payload-sha.mjs` (sha over the decompressed
payloads); `AGENTS.md` says so. Every "identical / moved" below is a
payload comparison.

**`LOT_PARCEL_OWN_STATIONS` — tried on, stays off (F10).** Alone it does
what the probe predicted — site-plan-hillside 16 → 20 buildings, drops
12 → 3; -steep 14 → 17, 19 → 10; montfort 13 → 12 with +47 % building
blocks and 11 → 14 dwellings — and it leaves the strip's leftover ground,
the columns no lot's own stations reach, unowned and ungraded between the
pads: the walkability audit's orphan columns go **14 → 898 on
site-plan-hillside (0.4 % → 24 % of the walkable plane)**, isolated by
toggling each switch alone (`scratchpad/walk-audit.mjs`: own-stations
only → 898; whole-strip only → 14). The parcel has to grow inward first
and then take the leftovers beside it — two phases, its own unit.

**`PLANNED_SITE_WHOLE_STRIP` — ships, moving nothing.** With the landmark
now taking its own footprint at the street edge of the site
(`landmarkSeat`, pure, tested) rather than the whole band, all fourteen
law-5 documents are payload-identical to unit 6. The reason is P1's
geometry: every strip on the walked hills is diagonal, and a 19-deep
diagonal band's largest axis-aligned rectangle is about 13 × 13 — the site
tier cannot hold the walled city's 13 × 17 church on any strip, so `E170`
stands. The trial's seated church (§F) came from `claimRun` over two
*deeper* own-station lots, not from the site. The switch is right and
inert here; it matters on an axis-aligned strip.

**Re-pins.** A second re-pin pass was made for the both-on state (51
assertions, 13 worse per unit — orphans 14 → 898 the worst, junction
density on the steep fixture ×1.67 with 100 % of the counted courses being
the new seat's own wall beside its own doorstep, solo density +19–30 %);
with own-stations off those re-pins were discarded and the three files
restored to unit 6's — the world is unit 6's. The pass is kept in
`scratchpad/REPIN-UNIT7.md` as the before/after record for F10.

**On the named worlds** at both switches on (the state not shipped):
montfort junction density 0.013 → 0.062, walled 0.036 → 0.070, solo down,
unserved faces flat — the same seat-beside-doorstep clutter; F10's fix
must be read against these numbers too.

## J. The guard sees the hill, and a dissolved strip says so (unit 10, 2026-08-25)

Two findings from §B, landed as diagnostics (the worlds are payload-identical
on all fourteen law-5 documents; the reports change):

- **F6 — `W527 WALLED_QUARTER_SPARSE` on the planned path.** The guard was
  gated `planned === undefined`. It now measures a planned quarter against
  the land inside its streets — every column the carriageway and sidewalk
  did not take, natural ground included, because the natural ground inside
  the wall is exactly the sparse part. montfort_hill_k1: "built 1,344 of its
  27,653 column(s) of land inside the streets — 5 %, under the 50 % a walled
  quarter needs"; the fresh walled city 10 %. Troy (grown, block path):
  silent, as before the flip made it so.
- **F7 — `SITE_STRIP_DISSOLVED` (`LOAM-I499`).** SITE-PLAN §3.7's note, one
  per strip, carried from the form to `layDistrict` on the new
  `FormPlan.notes`: montfort names three — e.g. `hs1_0`, uphill of the
  contour street at 93, "held 21 usable station(s) against the 30 two lots
  need, and gave 656 column(s) of claimed terrace back to natural ground";
  the fresh walled city names six. §3.7 amended to say the note exists.

Pinned by `packages/compiler/test/walled-planned.test.ts` on the walked
document. The spec registry's uniqueness/totality suite passes with the new
code (469 tests).
