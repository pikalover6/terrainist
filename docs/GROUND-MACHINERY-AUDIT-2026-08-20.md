# Ground machinery — what the pipeline actually does today

Read-only audit, 2026-08-20. Every claim below is from source, not from the docs.
Two docs describe this machinery: `docs/GROUND-CONTRACT-v0.md` (declare→resolve→build,
`INTENT_RANK` §4.2 at :734, mixture driver §9a at :1441, WP-6 §10 at :1918) and
`docs/GROUND-UNIFICATION-v0.md` (WP-8 frontage tie Part I :143, WP-9 :469, WP-10 :782,
WP-11 seam tiers :939, WP-12 ground-plane tie :1554).

**The single most important structural fact, stated up front:** there are *two*
height authorities separated by `buildColumnPlan`, and the ground contract only
governs the second one.

- **Authority 1 — the `HeightField` (float).** The layout stage mutates
  `terrain.field` in place via `applyPadEdits` at `terrain/compile.ts:722`
  (solver pads) and `:748` (district + city fabric pads).
  `layout/index.ts:50` → stdlib `applyLevelPad`. After this the field is
  *reclassified* (`compile.ts:751`).
- **`buildColumnPlan` at `terrain/compile.ts:785`** materialises
  `plan.ground = clampY(floor(field))` (`terrain/columns.ts:199`).
- **Authority 2 — `plan.ground`/`plan.fluidTop` (Int32Array).** Governed by the
  ground contract, whose baseline is snapshotted at `compile.ts:805-812` —
  *after* the pads are already baked in.

So `PadEdit` is not "the one height writer"; it is the one height writer **of the
field**, one stage earlier, and the contract's baseline silently inherits it.
`declarePadEdits` (`structures/ground-declare.ts:45`, recorded at
`compile.ts:861`) records `pad.record` intents at rank 150 — the *lowest*
precedence in the table — which is bookkeeping only: the pads already won by
being in the baseline.

---

## 1. Pipeline-ordered writer table

Order 1–6 are layout stage (field); 7+ are structure stage (`plan.ground`).
"Reads" = what number the pass derives its Y from.

| # | Pass | write/declare site | contract status | reads |
|---|---|---|---|---|
| 1 | `solveLayout` pads | `terrain/compile.ts:722` `applyPadEdits(terrain.field, solved.padEdits)` | **direct HeightField mutation — outside the contract entirely** | raw levelled field; `medianGround` (`layout/district.ts:4544`) |
| 2 | `gradeStreetDatum` (per district) | `layout/district.ts:1239`, kernel `layout/street-datum.ts:223` | **third height store** (`StreetDatum.columnY`/`bySegment`). Declares nothing (F10, street-datum.ts:46) | `materialisedGround(region, field)` = `clampY(floor(field))` (`street-datum.ts:203`), i.e. the field *after* step 1 |
| 3 | `derivePlatforms` (lattice election) | `layout/platforms.ts:420-495`, `levelY` written at `:495` | **fourth height store** (`GroundLevels.levelY`, `platform`→Y) | smoothed field median + `blockBase` = datum anchor (`platforms.ts:423-427`), else `min(free ground)` |
| 4 | lot seating (`foundationY`) | `layout/district.ts:2103-2107`; written into `Placement.translation[1]`/`foundationY` at `:2112` | **fifth height store** (`Placement.foundationY`). Never declared to the driver | `levels.levelY[platform]` ▸ `cell.foundationY` ▸ `frontageSeat(datum)` (`district.ts:3656`) ▸ `medianGround(field, rect)` |
| 5 | `layDistrict` padEdits | built at `district.ts:2012` (bench runs), `:2026` (derived platforms), `:2134` (per-lot) | feeds authority 1 | `bench.level` / `levels.levelY` / `foundationY` |
| 6 | fabric pads applied | `terrain/compile.ts:748` | **direct HeightField mutation** | as above |
| — | `buildColumnPlan` | `terrain/compile.ts:785`; `ground[idx]=y` at `terrain/columns.ts:199`, `fluidTop` at `:200,:254,:757` | materialises the baseline | field + classification |
| — | baseline snapshot | `terrain/compile.ts:805-812` | contract baseline | `plan.ground/fluidTop/fluidKind` |
| — | `declarePadEdits` | `structures/ground-declare.ts:45`; recorded `compile.ts:861` | **declares tier E rank 150 (`pad.record`), `record()` — writes nothing** | the pads' own `targetY` |
| 7 | `buildPrecincts` | call `structures/index.ts:534`; `driver.commit` at `structures/precincts.ts:536` | **declares tier A rank 20 `precinct.ground`** | `driver.view()` = live `plan.ground` |
| 8 | `declareLinework` | call `index.ts:776`; commit `structures/linework.ts:446`; skirt `linework.ts:572` | **declares tier A rank 25 `structure.linework`** | `driver.view()` (baseline + precincts) and `driver.baseline.fluidKind` (`index.ts:791`) |
| 9 | `buildBuildings` | `index.ts:895`; floor at `structures/buildings.ts:300` (`floorY = foundationY + 1`) | **painter-only — declares NOTHING.** `building.footprint` rank 10 has zero declarers (see §4) | `Placement.foundationY` frozen at step 4; skirt depth from live `plan.ground` (`buildings.ts:598`, capped `MAX_FOUNDATION_DEPTH = 12` at `buildings.ts:49`) |
| 10 | `pavePlaza` / `buildWell` | `index.ts:969`; commits `structures/plaza.ts:240` (well), `:388` (plaza) | **declares tier B rank 30/40** | `driver.view()` |
| 11 | `buildRetainingWalls` | `index.ts:1009`; commits `structures/retaining.ts:1146,1221,3074,3434,3496` | **declares tier B rank 60 `retaining.seam` / 70 `retaining.skirt`** (`retaining.ts:1121`) | `driver.view()`, `GroundLevels` from step 3, `RetainingPlane.planeY` from precincts (`index.ts:551`) |
| 12 | `furnishCourtyards` | `index.ts:1073`; commits `structures/courtyards.ts:311,708` | **declares tier B rank 50** | `driver.view()` |
| 13 | `digCanals` | `index.ts:1097`; commit `structures/canals.ts:362` | **declares tier A rank 0 `fluid.channel`** (highest precedence, runs 13th) | `driver.view()` |
| 14 | `surfaceStreetGraph` | `index.ts:1120`; commit `structures/roads.ts:1690` | **declares tier C rank 80 `street.network`** | on datum segments: `job.datumY` (step 2's answer) floored by `deckFloor`+`STREET_CUT_MAX` (`roads.ts:1574-1577`); otherwise `gradeProfile(ground,…)` off `driver.view()` (`roads.ts:1607`) |
| 14b | `dressStreetStairs` | `structures/street-stairs.ts:469`, called `roads.ts:1704`; declared inside the same commit as a `steps` role at `roads.ts:1652-1665` | **declares tier C rank 80, `preserve: true`** | `columnY` from 14 |
| 14c | `terminusLandings` | `roads.ts:1625-1631` — overwrites `columnY` after grading, before declaring | in-subsystem reconciliation | `columnY`, `blocked`, `paved`, `water` |
| 15 | `dressStreets`→`paveSidewalks` | `index.ts:1206`; commit `structures/streetscape.ts:713` | **declares tier C rank 90 `street.sidewalk`** | the flanking carriageway's **arc-station** level (`streetscape.ts:693-695`), via `segmentArcs` handed from 14 (`index.ts:1191-1195`); falls back to `view.ground` at the centre cell |
| 16 | `buildRoadNetwork` | `index.ts:1291`; commit `structures/roads.ts:721`; `blendShoulders` declared `roads.ts:760`/`1810`; verge `roads.ts:3799` | **declares tier C rank 100 `road.network` + rank 140 `verge`** | `driver.view()`, `routeFloorAt` (`roads.ts:686`), `roadY` local raster (`roads.ts:565`,`1204`) |
| 17 | `buildFarms` | `index.ts:1361`; commit `structures/farm.ts:568`, then reads `finish()` at `:569` | **declares tier D rank 125 `farm.parcel`** — the only production consumer of `finish()` | `driver.view()` |
| 18 | `SweptProfile` runs (bridges, walls, path-stairs) | `structures/sweep.ts:1535` commit; **`sweep.ts:1543-1544` direct `plan.ground`/`fluidTop` write when `declaration === undefined`** | **declares tier C rank 110 `sweep.run`; direct mutation on the undeclared path** | `level[i] + band.level` from its own `ArcFrame` |
| 19 | `levelPropPad` | props run `index.ts:1520`; commit `structures/props.ts:811`; **direct write `props.ts:832-833` when `driver === undefined`** | **declares tier D rank 130 `prop.pad`** | `plan.ground` at the pad columns |
| 20 | `buildDoorsteps` | `index.ts:1552`; commit `structures/doorsteps.ts:374` | **declares tier D rank 120 `doorstep.landing`** | `view.ground` + `footLands` (`doorsteps.ts:237`) |
| 21 | `buildJunctionSteps` | `index.ts:1609`; **direct write `structures/junction-steps.ts:635` `plan.ground[idx] += rise`**, *then* commit at `:726` | **BOTH — mutates the plan first, declares afterwards** | `standing[idx]` (top course), neighbour maxima |
| 22 | `finishCutFaces` | `index.ts:1636` | painter-only (subsurface/soil, explicitly no level — `index.ts:1631-1633`) | finished `plan.ground` |
| 23 | `buildGrounds` | `index.ts:1655` | painter-only | finished `plan.ground` |
| 24 | `buildInfraEntries` | `index.ts:1852`; commits `structures/infra-entry.ts:1522,1528,2581` | **declares (linework/host classes)** | `driver.view()` |
| 25 | `declareWaterWorks` | `structures/water-works.ts:650`, commit `:691` | **declares** | `driver.view()` |
| 26 | `dressLife` | `index.ts` ~2010 | painter-only | finished `plan.ground` |
| 27 | authored programs / `site-treatment` | `programs/site-treatment.ts:268-269` **direct `plan.ground`/`fluidTop` write** | **outside the contract by design** (`compile.ts:892-896`) | `plan.ground` |

`GroundDriver.commit` is the only contract-side writer: `layout/ground-driver.ts:162-163`
(`plan.ground[k] = resolved.ground[k]`), plus `plan.snow[k] = 0` at `:168`.

---

## 2. The reconciliation web

Each row is a place where one subsystem's number is bent to another's.

**Layout stage**

| mechanism | file:line | reconciles | who yields |
|---|---|---|---|
| `materialisedGround = clampY(Math.floor(field))` | `layout/street-datum.ts:203-210` | datum sampling vs `buildColumnPlan`'s materialisation | the datum adopts the plan's rule (was `medianGround`'s `round` — an explicit one-block lip generator, `street-datum.ts:18-22`) |
| `medianGround` (`Math.round` of a rect median) | `layout/district.ts:4544` | lot seat vs its own footprint | last-resort fallback; it is the lip source F1 exists to displace |
| `cutFloor = ground[k] − STREET_CUT_MAX` (=2) | `layout/street-datum.ts:302`, const `structures/roads.ts:228` | datum profile vs natural terrain | the datum yields — it may not dig more than 2 below natural, so it *breaks* instead |
| `floorY` / `planeY` on the datum | `street-datum.ts:118-170` | city-cell terrace vs its own streets | the streets yield to the cell plane (8E→8F correction) |
| `frontageSeat` = `datum.levelNear(anchor, reach) + FRONTAGE_RISE(0)` | `layout/district.ts:3656-3669` | lot seat vs carriageway | the lot yields to the street |
| `CORNER_TOLERANCE = 2` → `seatY = min(front, flank)` | `layout/district.ts:3666`, const `layout/types.ts:414` | two streets at a corner lot | the higher street yields; lot takes the **lower** |
| `frontageReach(sidewalkWidth)` / `SITE_FRONTAGE_REACH` | `district.ts:3623`, `types.ts:~440` | how far a claimant may look for a street | claimant gives up (F6 "no frontage, no tie") |
| seat precedence `levelY ▸ cell.foundationY ▸ tied ▸ median` | `district.ts:2103-2107` | platform vs cell vs datum vs footprint | platform beats datum beats median |
| lattice anchor `blockBase = anchor ?? base` | `layout/platforms.ts:420-427` | platform election vs street datum | the platform election yields to the street plane |
| congruence law `levelY = blockBase + bucket·FLOOR_HEIGHT` (4) | `platforms.ts:458,495`, `FLOOR_HEIGHT` `district.ts:213` | elected level ≡ anchor mod 4 | the election snaps to the street's storey lattice |
| `GROUND_TIE_SPAN = 4` block split (G4) | `platforms.ts:441`, const `layout/types.ts:557` | one block vs perimeter streets spanning >1 storey | the block splits rather than averaging |
| `waterFloor = max(level, seaLevel)` | `platforms.ts:331-333`, `:668` | platform vs waterline | platform lifts |
| `damsWater` | `layout/platforms.ts:213` | platform fill vs an existing channel | platform refuses to fill |
| `dissolveTallPairs` / `DISSOLVE_DROP_MAX = SEAM_TIER_MAX·RETAIN_MAX = 18` | `platforms.ts:51`, called `district.ts:1379` | election vs what a seam can serve | **the higher platform gives its level back** (`LOAM-W410`/`LEVEL_DISSOLVED`) |
| `touchesSeam(rect) ? apron 0 : BUILDING_APRON(2)` | `district.ts:2138`, `:2047-2056` | pad apron smoothstep vs a platform seam | the apron yields (a ramp across a wall line is the wall not being there) |
| `FRONTAGE_CUT_MAX = 6` (F7 rear cut cap) | `layout/types.ts:424` | **declared only; no call site anywhere** | — see §4 |

**Structure stage**

| mechanism | file:line | reconciles | who yields |
|---|---|---|---|
| `INTENT_RANK` / `compareIntent` (lower wins) | `layout/ground-contract.ts:201-226`, `:281-289` | every declared class against every other | the higher-numbered class |
| accumulating-prefix write-through | `layout/ground-driver.ts:139-170` | a converted pass's claim vs whatever is already in the plan | the resolver's answer overwrites, but **only on columns this commit touched**, and only where `owner !== -1` (`:159`) |
| `routeFloorAt` + `ROAD_BERM_MAX = 2` | `roads.ts:686`, `:1539`, cap at `roads.ts:1932`, const `roads.ts:254` | road/street profile vs a water rim | the water floor's lift is clamped to 2 so it cannot propagate; `LOAM-T236` |
| datum floor `max(deckFloor, ground − STREET_CUT_MAX)` | `roads.ts:1574` | surfacer vs its own datum | the surfacer may only **lift**; every lift is reported as `FRONTAGE_TIE_DRIFT` / `LOAM-T237` (`roads.ts:1589-1596`) |
| `pinLevel` (non-datum path only) | `roads.ts:1605` | one street at another's junction column | junior street yields |
| `terminusLandings` | `roads.ts:1625-1631` | a stair flight's foot vs the street it lands on | the street column is rewritten and flagged as a step |
| `blendShoulders` | `roads.ts:760`, `:1810` | road deck vs adjacent terrain | terrain graded to the deck |
| `VERGE_FILL_FEATHER = 1` | `roads.ts:352`, applied `roads.ts:3771` (`allowedBelow = ring − 1`) | verge below the lane vs verge above | asymmetric allowance: a bank below the lane gets one extra block |
| `CURB_LEVEL_TOLERANCE = 0` | `structures/streetscape.ts:242`, applied `:696` | natural ground vs carriageway centre | a kerb is only laid where they are exactly equal; otherwise it is a seam |
| sidewalk level = flanking carriageway arc level | `streetscape.ts:693-695` | sidewalk vs carriageway | sidewalk yields entirely (rank 90 > 80 anyway) |
| `masks.y = view.ground` (post-commit re-read) | `streetscape.ts:741` | where a lamp stands vs who won the column | the sidewalk yields to the resolver's winner |
| `tiersOf(drop, dressing)` / `SEAM_TIER_MAX = 3`, `SEAM_TIER_FACE = RETAIN_MAX = 6` | `layout/levels.ts:778`, `:660`, `:683`, `:84`; used `retaining.ts:3247` | a drop vs what one face may hold | past `3×6` it returns `"replan"` |
| `RETAIN_MAX = 6` bucket clamp | `retaining.ts:971`, `:1287`, `:1373` | measured face vs table | face clamped into `[1,6]` |
| `MIN_RETAIN_RUN = 6` "absorbed" / `shortRun` | `levels.ts:105`, `retaining.ts:883`, `:2775` | a short seam vs a wall | the seam is graded as a bank instead of walled (S7) |
| `bankRun(drop)` 1:2 grading | `levels.ts:511`, used `retaining.ts:2248` | bank vs the ground it lands on | ground is graded over `2·drop` columns |
| `RetainingPlane.planeY` → `planeSeams` | `retaining.ts:2689`, `:2708`, `:2749`, `:2766`; planes built `index.ts:551-556` | a precinct's levelled plane vs neighbouring ground | ground below `planeY+2` is skipped; above it gets a face |
| `groundLevelsOf(bounds, [{level: plane.planeY}])` | `retaining.ts:2629` | a plane re-expressed as a one-bench `GroundLevels` | the plane is coerced into the platform vocabulary |
| `footLands` + `bankMask` + `landings` masks | `structures/doorsteps.ts:237-260` | a door's flight vs a bank/tread | a bank is *never* an arrival (S8); a landing *always* is (S9) |
| `DOORSTEP_FOOT_STEP` two-step gate | `doorsteps.ts:~230` | doorstep foot vs ground ahead | flight refuses |
| `MAX_JUNCTION_LIFT = 3`, `JUNCTION_CUT = 2`, `MAX_SEAM_THICKNESS = 4`, `MAX_SEAM_COLUMNS = 64` | `structures/junction-steps.ts:202,208,244,261` | paved column vs its highest paved neighbour | the low column is lifted (then declared) |
| junction-steps gate: only where a district has >1 platform | `index.ts:1608` | reconciliation vs byte-identity on flat towns | flat towns keep their cutoffs |
| `lineworkSkirt` / `lineworkSkirtRings(crossWidth)` | `structures/linework.ts:541,572` | a wall/road bed vs terrain | terrain graded to the bed at tier A |
| `MAX_TREAD_CUT = 4` / `SWEEP_MAX_FILL = 12` | `structures/sweep.ts:858`, `:1364` | a swept run vs terrain | run refuses / clamps |
| `skirtDepth` capped at `MAX_FOUNDATION_DEPTH = 12` | `buildings.ts:589-603`, `:49` | building floor vs whatever ground ended up under it | **the building silently papers over up to 12 blocks of drift** |
| snow clear on commit | `ground-driver.ts:168` | snow layer vs fresh pavement | snow yields |

---

## 3. Five column traces (hillside settlement)

### (a) A street / carriageway column
1. `applyPadEdits(field, solved.padEdits)` — `compile.ts:722`. A district pad may already have moved this column.
2. `gradeStreetDatum` — `district.ts:1239` → `street-datum.ts:223`. Samples `materialisedGround` (`:203`), builds `ArcFrame`, applies `cutFloor = ground − STREET_CUT_MAX` (`:302`) and junction pins, then `gradeProfile`. Result lands in `datum.columnY`. **No plan exists yet.**
3. `applyPadEdits(field, fabricPads)` — `compile.ts:748`. **The lot pads and platform pads are applied AFTER the datum was graded** — so the datum's sampled ground is stale relative to the field the plan is built from. First disagreement.
4. `buildColumnPlan` — `compile.ts:785` → `columns.ts:199`. `plan.ground` for this column.
5. `surfaceStreetGraph` — `index.ts:1120`. On a datum segment: profile = `gradeProfile(datumY, …, floor = max(deckFloor, ground − STREET_CUT_MAX))` (`roads.ts:1574-1577`) — a lift-only correction; drift reported (`:1589`). On a non-datum segment (arterials, `road.network@0`, any ungraded graph) it **re-grades from scratch** (`roads.ts:1607`). Second disagreement.
6. `terminusLandings` may overwrite `columnY` — `roads.ts:1625-1631`.
7. `driver.commit(streetIntents(...))` — `roads.ts:1690`; resolver writes `plan.ground` at `ground-driver.ts:162`, unless `fluid.channel`(0)/`precinct.ground`(20)/`plaza.ground`(30)/`retaining.seam`(60) already own the column.
8. `buildRoadNetwork` rank 100 may claim adjacent columns — `roads.ts:721`; loses to 80 here.
9. `buildJunctionSteps` may `plan.ground[idx] += rise` — `junction-steps.ts:635` — **directly, before declaring at `:726`**. Third disagreement: the plan is mutated outside the resolver, then a claim is filed to describe it.
10. Painters: `finishCutFaces` (`index.ts:1636`), `buildGrounds` (`:1655`), `dressLife`.

### (b) A lot pad interior column
1. `derivePlatforms` elects a `levelY` on the storey lattice anchored on the datum — `platforms.ts:420-495`.
2. `dissolveTallPairs` may take that level away — `district.ts:1379`.
3. `foundationY` chosen — `district.ts:2103-2107`.
4. `padEdits.push({footprint: rect, targetY: foundationY, apron: touchesSeam?0:2})` — `district.ts:2134-2139`.
5. `applyPadEdits(field, fabricPads)` — `compile.ts:748`. `applyLevelPad` writes `targetY` inside the rect and smoothsteps the 2-column apron.
6. `classify` re-runs — `compile.ts:751`. A pad can change biome/water class.
7. `buildColumnPlan` — `plan.ground = clampY(floor(targetY))`.
8. `declarePadEdits` records rank 150 — `ground-declare.ts:45`, `compile.ts:861`. **Loses to everything.**
9. Anything from §1 rows 10–21 that reaches this column overwrites it: a plaza (rank 30), a courtyard (50), a retaining skirt (70), a sidewalk (90), a prop pad (130). Nothing in the contract defends the pad interior, because `building.footprint` (rank 10) is never declared.

### (c) A building floor / seat
1. `foundationY` — `district.ts:2103`, frozen into `Placement.translation[1]` at `:2112`.
2. `buildBuildings` at `index.ts:895` lays the floor block at `foundationY + 1` — `buildings.ts:300`. **This is a permanent absolute Y; nothing later moves it.**
3. `skirtDepth(plan, placement)` — `buildings.ts:589-603` — measures `foundationY − plan.ground[k] + 1` at build time (pass 9 of 27) and emits foundation courses, capped at 12.
4. Passes 10–21 then continue to move `plan.ground` under and around the footprint, with **no claim protecting it**. The skirt is already emitted, so drift after pass 9 is not covered at all.
5. `buildDoorsteps` (`index.ts:1552`) tries to reconcile the threshold to whatever ground now exists — rank 120, the *lowest* practical rank, so it yields to the street and the sidewalk.
6. Symptom mapping: "buildings sunk ~5 below adjacent plaza" is exactly (c)+(b) — `pavePlaza` at rank 30 wins the plaza columns from the baseline pad, while the building keeps a `foundationY` decided before the plaza existed.

### (d) A sidewalk / apron column at a street edge
1. In the baseline it is either natural ground or a lot pad's apron smoothstep (`district.ts:2138`).
2. `paveSidewalks` computes `y` = **the flanking carriageway's arc-station level** (`streetscape.ts:693-695`), *not* the local ground. Last-write-wins across overlapping bands (`streetscape.ts:707-712`).
3. `curb` flag only where `|natural − centre| <= CURB_LEVEL_TOLERANCE (0)` — `streetscape.ts:696`.
4. `driver.commit` rank 90 — `streetscape.ts:713`. It loses to `retaining.skirt`(70), `retaining.seam`(60), `courtyard.floor`(50), `plaza.ground`(30), `precinct.ground`(20), `fluid.channel`(0), and to `street.network`(80).
5. `masks.y = view.ground[c.idx]` re-read post-commit — `streetscape.ts:741`.
6. `buildJunctionSteps` may lift it — `junction-steps.ts:635`.
7. Symptom mapping: "sidewalks elevated ~3 above adjacent ground" is (d) step 2 — the band is levelled to the carriageway across its full width regardless of the terrain it crosses, and the only thing that would grade the *outside* edge back down is `retaining.skirt` (rank 70, runs at pass 11, i.e. **before** the sidewalk exists at pass 15). The retaining pass cannot see the sidewalk it would have to skirt.

### (e) A seam / retaining column between two levels
1. `levelSeams` (`levels.ts:334`) derives seams from `GroundLevels`; those columns go into `blocked` so no lot contains one (`district.ts:2043-2056`).
2. `buildRetainingWalls` at `index.ts:1009` classifies: declared seam vs measured `skirtSeams` (`retaining.ts:2454`, jobs at `:781`), plus `planeSeams` for `RetainingPlane`s (`retaining.ts:1316`, `:2689`).
3. `tiersOf(drop, dressing)` — `levels.ts:778` — or `"replan"` past `SEAM_TIER_MAX·RETAIN_MAX`.
4. `MIN_RETAIN_RUN` → `absorbed`/`shortRun`, graded as a `bankRun(drop)` 1:2 bank instead — `retaining.ts:883,2775`, `levels.ts:511`.
5. `driver.commit` rank 60/70 — `retaining.ts:1121,1146,1221,3074,3434,3496`.
6. Streets (80), sidewalks (90), roads (100) all lose here — correct.
7. **But** `buildJunctionSteps` (`junction-steps.ts:635`) mutates `plan.ground` directly afterwards, and `finishCutFaces` (`index.ts:1636`) exists precisely because passes 14–21 keep exposing faces the wall pass already finished (`index.ts:1625-1634` says so verbatim).
8. Disagreement: the seam's tier arithmetic was computed against `GroundLevels.levelY` (authority 4), while the face it actually presents is measured against `plan.ground` (authority 2) — which the pad application, the datum floor and the sidewalk band have all moved since.

---

## 4. Contract debt audit

**Is `resolveGround` deciding final ground?** Partly. On the settlement path the
driver is unconditional (`compile.ts:817-818`) and `commit`'s write-through
(`ground-driver.ts:162-163`) is the *only* contract-side writer of `plan.ground`.
Every commit re-resolves the whole accumulated prefix, so it is genuinely the
contract applied to a prefix — not an approximation. **But** it only writes
columns *this commit* touched (`:150-157`), and skips `owner === -1` (`:159`),
so the resolver never sweeps the map. The final `ResolvedGround` from `finish()`
has exactly **one production consumer**: `structures/farm.ts:569`. Nothing else
reads it; `compile.ts:278` states outright that `driver.finish()` "nothing in
production consumes yet".

**Are the eleven §3 passes converted?** Yes — all eleven commit:
precincts `precincts.ts:536`; plaza/well `plaza.ts:240,388`; retaining
`retaining.ts:1146,1221,3074,3434,3496`; courtyards `courtyards.ts:311,708`;
canals `canals.ts:362`; streets `roads.ts:1690`; street-stairs inside the same
commit (`roads.ts:1652`); streetscape `streetscape.ts:713`; roads
`roads.ts:721,3799`; props `props.ts:811`; doorsteps `doorsteps.ts:374`.
Plus five later declarers outside the eleven: sweep `sweep.ts:1535`, farm
`farm.ts:568`, linework `linework.ts:446`, infra-entry `infra-entry.ts:1522,1528,2581`,
water-works `water-works.ts:691`.

**Residual direct mutations of `plan.ground`:**
- `structures/junction-steps.ts:635` — **unconditional, on the production path**, mutates then declares at `:726`. This is the one genuine unconverted writer.
- `structures/sweep.ts:1543-1544` — only when `declaration === undefined` (test/exhibit path).
- `structures/props.ts:832-833` — only when `driver === undefined` (test/exhibit path).
- `programs/site-treatment.ts:268-269` — authored programs, deliberately outside the contract (`compile.ts:892-896`).
- `exhibits/*` — not the settlement path.

**WP-6 freeze (readonly arrays):** **not landed.** `plan.ground` is a live
`Int32Array`; `GroundView` is readonly only by TypeScript typing
(`ground-contract.ts:372` comments on exactly this), and `ground-driver.ts:113-119`
hands out the plan's *own live arrays*. `record` and `commit`'s write-through
both still exist, which §9a.7 says WP-6 deletes.

**§7 report:** **not wired.** `GroundReport` is defined at
`ground-contract.ts:432` and produced on `ResolvedGround.report`
(`ground-contract.ts:354`) but no production code reads it — see the
`finish()` census above.

**§8 equivalence shim:** gated on `options.groundEquivalence !== true`
(`compile.ts:898`). **No production caller sets it** — it is test-only.

**Do WP-8..12 go through the contract?** **No — they are a parallel authority
system, and they run a full stage earlier.**
- `StreetDatum` explicitly "declares nothing to the ground driver" (`street-datum.ts:46`, F10).
- `PadEdit` writes the `HeightField`, before the contract's baseline exists (`compile.ts:722,748`).
- The frontage tie sets `Placement.foundationY` (`district.ts:2103`), which no class in `INTENT_RANK` represents.
- The ground-plane tie sets `GroundLevels.levelY` (`platforms.ts:495`), likewise unrepresented.
- `RetainingPlane.planeY` (`retaining.ts:234`) is a precinct output consumed by `planeSeams`; it enters the contract only indirectly as the *result* of `retaining.seam`/`skirt` claims.
- Only the seam tiers reach the contract, and only through `retaining.ts`'s commits.

**Every height store that exists:**

| store | file:line | authoritative for |
|---|---|---|
| `HeightField.values` (float) | mutated `compile.ts:722,748` | everything, until `buildColumnPlan` |
| `plan.ground` / `plan.fluidTop` (Int32Array) | `columns.ts:199-200`; driver `ground-driver.ts:162-163` | the emitted world's surface Y |
| `GroundBaseline` (frozen copy) | `compile.ts:805-812` | the resolver's argument — a snapshot, never re-taken |
| `StreetDatum.columnY` / `bySegment` | `street-datum.ts:97-99` | carriageway profile at layout time; lot seats; lattice anchors |
| `GroundLevels.levelY[platform]` | `levels.ts:38`, written `platforms.ts:495` | platform election; lot seat; seam arithmetic |
| `Placement.foundationY` | `district.ts:2103-2112` | building floor Y forever (`buildings.ts:300`) |
| `PadEdit.targetY` | `layout/types.ts:270`, built `district.ts:2012,2026,2134` | field levelling |
| `RetainingPlane.planeY` | `retaining.ts:234`, built `index.ts:551` | precinct plane seams |
| `roadY` (per-pass raster) | `roads.ts:565`, `:1204` | road router internals |
| `columnY` / `stepFlag` (surfacer locals) | `roads.ts:1186+` | street surfacing internals |
| `gradeProfile` station arrays | `roads.ts` (`profile`, `deckFloor`, `ground`) | one segment's profile |
| `ArcLevels` per segment | `sweep.ts` `arcLevels`, stored `job.levels` | handed to streetscape as `segmentArcs` (`index.ts:1191`) |
| `standing` / `top` / `lift` | `junction-steps.ts:600-640` | junction lift |
| `masks.y` | `streetscape.ts:741` | where street furniture stands |
| `ResolvedGround` | `ground-driver.ts:175-178` | consumed once, by farms |

**Dead / vestigial:**
- `INTENT_RANK["building.footprint"] = 10` (tier A) — **zero declarers** anywhere in `src/`. The one class that would protect a lot pad from later passes is an empty slot.
- `FRONTAGE_CUT_MAX = 6` (`types.ts:424`, F7 "the lot grades from the road backward") — **declared, never imported.** F7 did not land.
- `GroundReport` (§7) — produced, never read.
- `assertGroundEquivalence` (§8) — test-only.
- `record()` and `commit()`'s write-through (§9a.7 says WP-6 deletes them) — still live.

---

## 5. Verdict

**Write-order dependence is still the load-bearing mechanism.** The driver only
writes the columns a given `commit` names (`ground-driver.ts:150-157`) and skips
unowned ones (`:159`), so the plan is still a running accumulation, not a resolved
answer. A pass that runs later and touches a column it does not claim still sees
whatever the last writer left. `finishCutFaces` at `index.ts:1636` exists solely
because passes 14–21 keep re-exposing faces pass 11 already finished — that comment
(`index.ts:1625-1634`) is the pipeline confessing the ordering is still live.

**There are five simultaneous authorities for the same column class.** For a lot
column: `PadEdit.targetY` (field), `plan.ground` (contract), `StreetDatum.columnY`,
`GroundLevels.levelY`, and `Placement.foundationY`. Four of the five are decided in
the layout stage and *cannot* be arbitrated by the resolver, because the resolver's
baseline is taken downstream of all of them (`compile.ts:805`). The unification work
(WP-8..12) built its correctness out of tie constants — anchor congruence
(`platforms.ts:495`), `CORNER_TOLERANCE`, `GROUND_TIE_SPAN` — precisely because
those authorities cannot be ranked against each other.

**The class that would fix the reported symptom does not exist in practice.**
`building.footprint` is rank 10, tier A, and nothing declares it. A building's
floor is frozen at `foundationY + 1` at pass 9 of 27 (`buildings.ts:300`), and
seventeen subsequent passes are free to move the ground under it with no claim
opposing them. The `skirtDepth` cap of 12 (`buildings.ts:49`) is the mechanism that
makes this *invisible* rather than *impossible* — a 5-block sink is well inside it.

**The sidewalk lip is structural, not a tuning bug.** `paveSidewalks` levels its
whole band to the carriageway's arc level (`streetscape.ts:693-695`) with no cap
against the ground it crosses — there is no `SIDEWALK_BERM_MAX` analogous to
`ROAD_BERM_MAX`. The pass that would grade the outer edge back down
(`retaining.skirt`, rank 70) runs at `index.ts:1009`, six passes *before* the
sidewalk exists, so it can never see the face it would have to serve.

**Mechanisms that exist only to reconcile authorities a clean design would not
have both of:** `materialisedGround` (datum vs plan materialisation rule),
`STREET_CUT_MAX` folded into both the datum *and* the surfacer floor,
`FRONTAGE_TIE_DRIFT`/`LOAM-T237` (a diagnostic whose only job is to report that
two graders disagreed), the anchor-congruence law, `GROUND_TIE_SPAN` block
splitting, `dissolveTallPairs`, `touchesSeam`→`apron: 0`, `terminusLandings`,
`buildJunctionSteps` in its entirety, `finishCutFaces`, `skirtDepth`, and
`declarePadEdits` (rank 150 — a claim that documents a decision already baked into
the baseline it is being resolved against).

**Net:** the ground contract governs the *second half* of the ground's life and
governs it fairly well. The elevations Kai is walking are decided in the first
half, by four un-arbitrated stores, and the contract inherits their disagreements
as its own baseline.
