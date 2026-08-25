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
