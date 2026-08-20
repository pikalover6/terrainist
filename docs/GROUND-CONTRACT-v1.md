# The ground contract v1 — one baseline, one resolve, one frozen ground

> **Normative for the staged root rewrite of ground handling (WP-G0 … WP-G8),
> ratified by Kai 2026-08-20.** It supersedes, by section:
>
> | superseded | by | what changes |
> | --- | --- | --- |
> | `GROUND-CONTRACT-v0.md` §1.4 (tiers, the one legal read) | **§1.4** here | the read law is stated over *datums* and a tier-prefix resolve, not over "whatever the plan holds at this pipeline position" |
> | v0 §3.12 (`pad.record`), §4.2's rank-150 row | **§1.5, §2, §4** | pads stop being a record and become real claims at real ranks; the class is deleted |
> | v0 §5.6's closing paragraph ("consumers read this list") | **§3** | transitions become the *only* seam source, with a coverage invariant and a lint |
> | v0 §9a in full (the mixture driver) | **§1.6, §6** | the write-through, `record`, and the per-commit resolve are deleted; five tier resolves replace ~20 commit resolves |
> | v0 §10 (WP-6's deletion list) | **§4** | extended, with the audit's §5 mechanisms dispositioned one by one |
> | v0 §13.1, §13.3, §13.7 (open questions) | **§7** | answered, not recommended |
>
> **Unchanged and still normative from v0:** §1.1–§1.3 (the rule, the three
> phases, the Group L/M/C split and the frozen triple's invariants), §2 (the
> declaration types), §4.1 (`compareIntent`), §4.2's ranks except where §1.5
> below amends them, §5.1–§5.5 and §5.7 (the resolver and its determinism),
> §6 (the `W49x` codes), §7 (the report), §13.2/§13.2a–g (`structure.linework`),
> §13.8 (the measured seam constants).
>
> **`GROUND-UNIFICATION-v0.md` is not amended.** WP-8…WP-12 decide *what a
> claimant asks for*, and every one of their laws survives into v1 unchanged —
> §5 lists them and pins the mechanism by which they survive. Where v1 and
> unification appear to disagree, unification is describing the interim
> implementation of a law whose final home is the resolver (§2's
> `RetainingPlane` row, §4's `apron` row); the law is unchanged and only its
> discharge moves.
>
> **`docs/GROUND-MACHINERY-AUDIT-2026-08-20.md` is the ground truth for every
> claim about today's code.** File:line citations below are lifted from it.
> `docs/DESIGN.md` is untouched by this document.

---

## 0. What is wrong, in one paragraph

There are five simultaneous height authorities for the same column
(audit §5): `PadEdit.targetY` in the float field (`terrain/compile.ts:722`,
`:748`), `StreetDatum.columnY` (`layout/street-datum.ts:97`),
`GroundLevels.levelY` (`layout/platforms.ts:495`), `Placement.foundationY`
(`layout/district.ts:2103`), and `plan.ground` (`terrain/columns.ts:199`).
Four of the five are decided in the layout stage, and the ground contract
cannot arbitrate any of them, because its baseline is snapshotted **after**
they have all been baked into the field (`compile.ts:805-812`). The contract
governs the second half of the ground's life and governs it well; the
elevations Kai walks are decided in the first half. v1 finishes the
declare→resolve→build architecture over the **whole** life: one baseline taken
before any edit, one resolver, one freeze, and every transition derived from
the resolved field rather than re-derived by three passes from three different
numbers.

---

# 1. The end state

## 1.1 The rule, restated for the whole life

> **Nothing may modify the ground after the ground is decided — and the ground
> is decided exactly once, from a baseline nothing has edited.**

v0's rule is unchanged. What changes is the scope of "after": under v0 it meant
"after `buildColumnPlan`", which let the layout stage decide half the world's
elevations outside the contract entirely. Under v1 it means "after
`resolveGround` returns", and `resolveGround`'s baseline is the pure terrain.

## 1.2 The pure-terrain baseline — normative

1. `terrain/compile.ts` snapshots the height field **before the first
   `applyPadEdits`** (`compile.ts:722`) into `terrain.pristine`, a copy of
   `HeightField.values`. It is a pure function of the terrain params and the
   world seed; no layout decision has reached it.
2. `classify` runs once, on `terrain.pristine`. The re-classification at
   `compile.ts:751` is deleted (§4, item 24): a pad no longer changes a biome,
   because a pad no longer changes the field the plan is built from.
3. `buildColumnPlan` (`compile.ts:785`) materialises **`terrain.pristine`**.
   `plan.ground`, `plan.fluidTop` and `plan.fluidKind` are therefore the pure
   terrain, and the `GroundBaseline` snapshot at `compile.ts:805-812` is a copy
   of them. This is the resolver's first argument and it is taken before any
   subsystem has an opinion.
4. **The padded field survives as a proposer scratch surface.**
   `applyPadEdits(terrain.field, …)` still runs at `:722` and `:748`, still
   byte-identically, because `solveDistricts` reads the solver's pads to seat
   its buildings (`compile.ts:715`'s own comment) and `medianGround`
   (`district.ts:4544`) is still the F6 no-frontage fallback. What changes is
   that **`terrain.field`'s life ends at the layout/structure boundary**:
   nothing downstream of `buildColumnPlan` reads it, and no value in it reaches
   the emitted world except through a declaration.

The consequence worth stating plainly, because it is the whole point: a lot
pad, a platform run and a precinct apron are now **claims that can lose**.
Today they win by being in the baseline, and `declarePadEdits`'
(`structures/ground-declare.ts:45`) rank-150 `pad.record` intent is bookkeeping
over a decision already made.

## 1.3 Datums — the third thing, named

v0 knows two kinds of artifact: an intent, and the resolver's answer. The
pipeline has a third, and every WP-8…WP-12 law is built out of it:

> **A *datum* is a pure function of `(the pristine baseline, the solved layout,
> the document)` that proposes levels and declares nothing. It is computed
> once, shared by every proposer that needs it, and is never an authority over
> a column — only over what a claimant asks for.**

`StreetDatum` is the prototype (`layout/street-datum.ts`, F2/F10/G9: "the datum
is not a claim"). v1 generalises it to four:

| datum | replaces | law | computed from |
| --- | --- | --- | --- |
| `StreetDatum` | the surfacer's re-grade (`roads.ts:1607`) | F2, F3, F8, F9 | the pristine baseline sampled as `clampY(floor(field))`, the `StreetGraph`, `compareStreetRank` order, `gradeProfile` with the `STREET_CUT_MAX` floor (F9/8G) and the W1-clamped water floor |
| `PlatformDatum` | `GroundLevels.levelY` written into a pad (`platforms.ts:495`) | G2, G4, S6 | `StreetDatum` (`anchorOf(block)`, the lower median of the block's perimeter), the pristine baseline, `FLOOR_HEIGHT`, `GROUND_TIE_SPAN` |
| `SeatDatum` | `Placement.foundationY` (`district.ts:2103-2112`) | F4, F5, F6, F7 | `StreetDatum` via `frontageSeat`, `PlatformDatum` where the quarter elected platforms, `medianGround` only in the F6 cases |
| `PlaneDatum` | `RetainingPlane.planeY` (`retaining.ts:234`), the city cell's plane | G8, R1 | the precinct kit's own geometry (`QUAY_DEPTH`, the apron rect) and `solveCities`' cell election — **decisions, not measurements**, which is why they anchor the datum rather than reading it (G8) |

Three properties are normative and testable without a compile:

- **Purity.** No datum reads `plan.ground`, `plan.fluidTop`, or any resolver
  output. `packages/compiler/test/` asserts this by import graph: the four
  datum modules may not import `layout/ground-driver.js`.
- **One arithmetic.** A datum never re-implements a proposer's rule; the
  proposer calls the datum. Where a rule is walk-calibrated taste it lives in
  exactly one function and §5 lists them.
- **Determinism.** F11, G10 and S12 already pin every one of them: integer
  arithmetic, row-major walks, ties to the lower region index, no RNG, no
  clock. v1 adds nothing.

## 1.4 The read law, generalised — supersedes v0 §1.4

v0 §1.4 says a tier-*n* declarer reads the resolved answer for tiers `0…n−1`.
That is right and v1 keeps it, but v0 could not honour it during the mixture
and settled for `driver.view()` — "the plan at this pipeline position" (v0
§9a.4), which is the write-order pile wearing a `readonly` type. v1 makes the
rule exact.

> **`view(n)` returns, per column: the resolved level where a claim in a tier
> strictly above *n* owns it, and the pristine baseline level otherwise.**

Both halves are true statements about the *finished* ground:

- an owned column holds the final answer, because rank order and tier order
  ascend together (`GROUND_TIERS`, `ground-contract.ts:239`, asserted by
  `ground-contract.test.ts`) and the resolver is first-writer-wins in rank
  order — so a resolve over the tier prefix `A…n−1` is exactly the final
  resolve restricted to the columns that prefix owns;
- an unowned column holds the baseline, which is the answer **unless a tier
  ≥ n claim takes it** — precisely the set the reader is allowed to influence.

There is no third case and no approximation. v0 §9a.4's two "knowing
approximations" are both closed: the view is tier-filtered by construction, and
a higher tier declaring later in the pipeline is impossible because
**declaration runs in tier order** (§1.6).

The escape hatch is unabusable by typing, as v0 §13.7 asks: the stage hands a
pass `declare(tier, above: ResolvedGround)` and `above` contains only strictly
higher tiers.

**Datums are not a tier read and are not governed by this law.** A tier-A
declarer may read `StreetDatum` even though the street's own claim is tier C,
because the datum is not the street's answer — it is the number the street will
*ask for*, computed one stage earlier from the baseline. This is F10 and G9,
and it is what lets the frontage tie (a rank-10 claim) seat at a rank-80
claimant's level without a circular dependency. The test that keeps this honest
is the purity test of §1.3.

## 1.5 Every level-deciding subsystem, assigned

`INTENT_RANK` (`ground-contract.ts:201`) keeps every value it has. v1 makes two
changes to the table and no others:

- **`quarter.plane` is added at rank 15, tier A.** A quarter's platform run is
  a decided plane — the thing a quarter's plaza, courtyard, seam, street and
  sidewalk are all laid *on* — so it must outrank all of them, and only a
  building's floor (10) stands above it. 15 is the spacing already reserved by
  `structure.linework` at 25. It never overlaps `precinct.ground` (20) because
  the solver reserves a precinct's footprint before the fabric runs.
- **`pad.record` (150) is deleted**, with `declarePadEdits`
  (`ground-declare.ts:45`) and its call site (`compile.ts:861`). It is the
  first class ever removed from the table; the byte-identity consequence is
  stated in §6/G3 (no world after G3 holds such a claim).

`building.footprint` (10) stops being an empty slot (audit §4: "zero declarers
anywhere in `src/`"). The full assignment:

| tier | rank | class | declarer under v1 | reads (§1.4) |
| --- | --- | --- | --- | --- |
| A | 0 | `fluid.channel` | `digCanals` (`canals.ts:362`), `declareWaterWorks` (`water-works.ts:691`) | baseline only |
| A | 10 | `building.footprint` | **the lot pad's footprint half** — one `platform` intent per building rect at `SeatDatum`'s level, plus `preserve` over the whole rect; plus the solver's landmark pads | baseline, `SeatDatum`, `StreetDatum` |
| A | 15 | **`quarter.plane`** *(new)* | **the platform runs** (`district.ts:2012` bench runs, `:2026` derived platforms) — one `platform` intent per run at `PlatformDatum.levelY`, **less the solved carriageway band** (§1.7) | baseline, `PlatformDatum`, `StreetDatum` |
| A | 20 | `precinct.ground` | `buildPrecincts` (`precincts.ts:536`), unchanged except that its level comes from `PlaneDatum` rather than from a pad already in the baseline | baseline, `PlaneDatum` |
| A | 25 | `structure.linework` | the linework slot (`linework.ts:446`), unchanged — v0 §13.2a governs it in full | baseline, tiers 0–20 |
| B | 30 | `plaza.ground` | `pavePlaza` (`plaza.ts:388`) | tier A |
| B | 40 | `plaza.well` | `pavePlaza` (`plaza.ts:240`), `furnishCourtyards` (`courtyards.ts:708`) | tier A |
| B | 50 | `courtyard.floor` | `furnishCourtyards` (`courtyards.ts:311`) | tier A |
| B | 60 | `retaining.seam` | `buildRetainingWalls` — **only for a seam the resolver derived**; see §3 | tier A |
| B | 70 | `retaining.skirt` | ditto, for a measured face | tier A |
| C | 80 | `street.network` | `surfaceStreetGraph` (`roads.ts:1690`) at `StreetDatum`'s level; `dressStreetStairs` as a `steps` sub-claim (`roads.ts:1652`); the derived seam stairs of S9 | tiers A–B |
| C | 90 | `street.sidewalk` | `paveSidewalks` (`streetscape.ts:713`) at the flanking carriageway's arc level (`streetscape.ts:693-695`) — intra-subsystem data, not a tier read (v0 §9a.4) | tiers A–B |
| C | 100 | `road.network` | `buildRoadNetwork` (`roads.ts:721`) | tiers A–B |
| C | 110 | `sweep.run` | `SweptProfile` clients with no named class (`sweep.ts:1535`), `buildInfraEntries` (`infra-entry.ts:1522`) | tiers A–B |
| D | 120 | `doorstep.landing` | `buildDoorsteps` (`doorsteps.ts:374`), `dropped` outcome only | tiers A–C |
| D | 125 | `farm.parcel` | `buildFarms` (`farm.ts:568`) | tiers A–C |
| D | 130 | `prop.pad` | `levelPropPad` (`props.ts:811`); **the authored-program site's pad and apron** (`site-treatment.ts`, §7.1) | tiers A–C |
| D | 140 | `verge` | `blendShoulders` (`roads.ts:760`, `:1810`, `:3799`), `gradeBank` (`retaining.ts:2248`), `lineworkSkirt` (`linework.ts:572`) | tiers A–C |
| — | — | baseline | the pristine materialisation | — |

**Deleted from the table:** `pad.record` (150).

**Subsystems that decide a level and declare nothing, because they are datums:**
`gradeStreetDatum` (`district.ts:1239`, `street-datum.ts:223`),
`derivePlatforms` (`platforms.ts:420-495`), lot seating (`district.ts:2103`),
`solveCities`' cell plane (`city-pass.ts`). Each proposes; the claim its
proposal ends up inside is in the table above.

**Subsystems deleted outright:** `buildJunctionSteps` (§4 item 7),
`terminusLandings` (§4 item 6). Both are post-hoc reconciliations of two claims
that, under one resolve, cannot disagree.

## 1.6 What `buildColumnPlan` materialises, and where the one resolve happens

`buildColumnPlan` (`compile.ts:785`, writes at `terrain/columns.ts:199-200`)
materialises the **pristine** field: `ground`, `fluidTop`, `fluidKind` (Group
L, the baseline), `surface`/`subsurface`/`soil`/`snow` (Group M, the terrain's
own paint), and `biome`/`lakeMask`/`oceanMask`/… (Group C, the pristine
classification). Nothing else changes about it.

`terrain/compile.ts`'s order under v1:

```
pass 4   layout        solveLayout → applyPadEdits(field) → solveDistricts/solveCities
                       → applyPadEdits(field)          [the working field; proposers only]
                       the four datums are built here  [§1.3, pure, no plan]
pass 5   columns       buildColumnPlan(terrain.pristine)  → plan
                       baseline := copy(plan.ground, .fluidTop, .fluidKind)
pass 5a  caves         unchanged
pass 5b  DECLARE       declareStructures(...) — every pass's declare() half,
                       run in TIER ORDER, with one resolve after each tier:
                         resolve(A) → declare(B, above=A) → resolve(A∪B) → …
                       five resolves; the fifth is `resolveGround(baseline, all)`
pass 5c  FREEZE        plan.ground/.fluidTop/.fluidKind := the fifth resolve's
                       arrays, handed out readonly from here on
pass 5d  RECLASSIFY    Group C derived from resolved.wet / resolved.moved (§7.4);
                       Group M's snow cleared on `moved` (v0 §1.3)
pass 5e  BUILD         buildStructures(plan, resolved) — every pass's build()
                       half: materials, blocks, furnishing, and the transition
                       builders of §3
pass 5f  programs      authored programs, against frozen ground (§7.1)
pass 5g  clearing, scatter, life, emit — unchanged
```

**The one resolve is the fifth one, at the end of pass 5b.** The four before it
are prefixes of it (§1.4) and exist only so that a tier-*n* declarer can read
tiers `0…n−1`; they are read-only, their diagnostics and reports are discarded
(v0 §9a.1's rule, unchanged), and `finish()` is the fifth. Five is the number
of tiers, not the number of passes: it does not grow when a pass is added.

`GroundDriver` collapses to `GroundStage`: `declare(tier, intents)`,
`view(tier)`, `finish()`. `record()` and `commit()`'s write-through
(`ground-driver.ts:139-170`) are deleted — nothing writes `plan.ground` any
more, so nothing needs to.

## 1.7 Two subtractions that are load-bearing

A tier-A claim outranks the network, so a tier-A claim laid over a carriageway
would take the lane. Two declarers must therefore subtract before they declare,
by exactly the construction v0 §13.2a rule 5 specifies for `structure.linework`
and `layout/solved-carriageway.ts` already implements:

1. **`quarter.plane` subtracts the solved carriageway band.** The band is
   `solvedCarriagewayMask(region, districts, cities, corridors)` — every
   segment rasterized by `lineCells` and dilated `ceil(width/2) + 1` Chebyshev,
   every intersection at the widest segment meeting there, every
   `RouteCorridor` at its width plus `ROAD_CORRIDOR_MARGIN`. This is the same
   set `derivePlatforms` already excludes as `blocked = carriageway | sidewalk`
   (unification P3), stated as a subtraction rather than as a mask.
2. **`building.footprint` subtracts nothing and needs to** — a footprint that
   overlapped a lane would be a placement failure, and the solver's occupancy
   already prevents it. The assertion is the guard: no `building.footprint`
   column is in the carriageway band.

**The superset property is the test** (v0 §13.2a rule 6, verbatim): no column
that ends up `street.network`-owned with `role: "carriageway"` lies inside a
`quarter.plane` claim. Asserted on all three r22 documents and on three form
skeletons. The dressing is deliberately *not* in the superset: a sidewalk (90)
or a verge (140) losing a column to a quarter's plane is the rank order
working; a carriageway losing one is the defect.

---

# 2. Store-by-store disposition

Every height store the audit enumerates (audit §4, "Every height store that
exists"), with what it becomes and what replaces each consumer.

| store | file:line | v1 | what replaces the consumers |
| --- | --- | --- | --- |
| `HeightField.values` (float) | mutated `compile.ts:722`, `:748` | **proposer scratch, kept byte-identical** | Its life ends at the layout/structure boundary. `solveDistricts`/`solveCities` read it exactly as today; `medianGround` (`district.ts:4544`) reads it only in the F6 no-frontage cases. Nothing downstream of `buildColumnPlan` may import it — a grep-shaped test. |
| `terrain.pristine` | **new**, snapshotted before `:722` | **the baseline's source** | `buildColumnPlan` materialises it; `classify` classifies it; the four datums sample it. |
| `PadEdit.targetY` / `.apron` / `.apronBySide` | `layout/types.ts:270`; built `district.ts:2012`, `:2026`, `:2134` | **`targetY` becomes a claim's level; `apron` and `apronBySide` are deleted** | The footprint half declares `building.footprint`(10); the platform-run half declares `quarter.plane`(15); the solver's landmark pads declare `building.footprint`; precinct pads declare `precinct.ground`(20). The apron is replaced by the derived transition (§3), which is the whole of §7.2's answer to v0 §13.3. |
| `plan.ground` / `.fluidTop` / `.fluidKind` | `columns.ts:199-200`; driver `ground-driver.ts:162-163` | **the resolver's arrays**, readonly aliases past pass 5c | `ColumnPlan`'s three fields become `ReadonlyInt32Array`-shaped; writing is a type error. The static scan of v0 §10 stays as the guard against a module keeping its own `Int32Array`. |
| `GroundBaseline` | `compile.ts:805-812` | **unchanged in shape, moved in time** | Same three arrays, copied from the pristine materialisation instead of from a plan four pad passes have already edited. |
| `StreetDatum.columnY` / `.bySegment` | `street-datum.ts:97-99` | **promoted to the sole carriageway proposer** (§1.3) | `surfaceStreetGraph`'s non-datum re-grade (`roads.ts:1607`) is deleted: every segment carries a datum, arterials and `road.network@0` included. F8's "exactly one further constraint" — the W1-clamped water floor — is the only thing the surfacer adds, and F9's cut cap lives in the datum (8G). |
| `GroundLevels.levelY[platform]` | `levels.ts:38`, written `platforms.ts:495` | **`PlatformDatum`** (§1.3) | Consumers split cleanly: the *level* becomes `quarter.plane`'s claim; the *seam arithmetic* becomes the resolver's, because `deriveTransitions` now measures `above`/`below` from `resolved.ground` rather than from `levelY` (audit §3(e) step 8: today the tier arithmetic is computed against authority 4 and the face is presented against authority 2). |
| `Placement.foundationY` | `district.ts:2103-2112` | **`SeatDatum`** — a proposal, not an authority | `buildings.ts:300`'s `floorY = foundationY + 1` becomes **`floorY = resolved.ground[k] + 1`**, computed in the build phase over the footprint. The resolver guarantees the footprint is one plane: one `building.footprint` intent owns every column of the rect at one level. Where it does not — a column lost to `fluid.channel`(0) — the seat is non-planar, the building is **refused**, and `LOAM-W494 GROUND_SEAT_NONPLANAR` names the column. `Placement.translation[1]` is written in the build phase from the resolved value. |
| `skirtDepth` / `MAX_FOUNDATION_DEPTH = 12` | `buildings.ts:589-603`, `:49` | **absorbed** — depth, never cover | Inside the footprint the depth is 0 by construction (the claim won it). Outside it, the skirt is the builder of the `built` transition (§3.3) and the cap stays as a statement about masonry, not as a licence to paper over 12 blocks of drift. The audit's "the mechanism that makes this *invisible* rather than *impossible*" is gone. |
| `RetainingPlane.planeY` / `planeSeams` / `groundLevelsOf` | `retaining.ts:234`, `:2629`, `:2689`; built `index.ts:551-556` | **derived** | R1/R2's law is unchanged — a claimed plane owes its own edges, measured never declared. Its discharge moves: a plane declares `precinct.ground` and the boundary between it and the ground beside it *is* a `GroundTransition`, treated by the same `treatmentForSeam` table. WP-12D's `planeSeams` is the interim implementation and is absorbed at G4; the two-bench synthetic `GroundLevels` coercion goes with it. |
| `roadY` (per-pass raster), `columnY`/`stepFlag`, `gradeProfile` station arrays | `roads.ts:565`, `:1204`, `:1186+` | **kept, internal** | They are the claim's levels on the way to being declared, and no other pass reads them as ground. `natural = Int32Array.from(plan.ground)` (`roads.ts`) is deleted — the baseline *is* the snapshot, and there is only one. |
| `ArcLevels` per segment (`job.levels`, handed as `segmentArcs`) | `sweep.ts`, `index.ts:1191` | **kept** | Intra-subsystem data inside the street family, which declares as one subsystem (v0 §3.6b). This is the one case that looks like a tier violation and is not (v0 §9a.4's closing paragraph). |
| `standing` / `top` / `lift` | `junction-steps.ts:600-640` | **deleted with the pass** | §4 item 7. |
| `masks.y` | `streetscape.ts:741` | **derived in the build phase** | Street furniture stands on frozen ground; the post-commit re-read becomes a plain read. |
| `ResolvedGround` | `ground-driver.ts:175-178` | **the ground** | Today it has exactly one production consumer (`farm.ts:569`, audit §4). Under v1 every consumer reads it, because it *is* `plan.ground`. |
| `plan.surface` / `.subsurface` / `.soil` / `.snow` | Group M | unchanged | Materials keep their passes and their last-write-wins order (v0 §1.3). Two additions: the eleven `plan.snow[idx] = 0` lines are replaced by v0 §1.3's `moved`-mask rule at pass 5d — landed at last, because there is no longer a mixture in which that rule is wrong (v0 §9a.6); and `buildGrounds` (`index.ts:1655`) becomes the **total painter over `resolved.moved`**, repainting from the palette every moved column no pass painted. That second one is not optional: under §1.2 a cut lot's floor is a column the resolver moved and nobody's material loop covers, and today `applyLevelPad` + `buildColumnPlan` painted it for free. |
| `plan.biome` / `lakeMask` / `oceanMask` / `volcanic*` / `lavaFlow` / `caves` | Group C | **derived at pass 5d** | v0 §13.1 answered: not frozen, derived from `resolved.wet`. `digCanals` and `precincts.surfaceColumn` stop clearing the masks themselves; the invariant `lakeMask[k] | oceanMask[k] === 1 ⟹ fluidKind[k] !== NONE` is asserted in `ground-freeze.test.ts`. |

---

# 3. Transition derivation is the seam guarantee

## 3.1 The rule

> **Every seam, bank, kerb and revetment in a settlement is a
> `GroundTransition` the resolver derived from the resolved field. No pass
> derives a seam of its own. A missed seam is impossible by construction,
> because the resolver enumerates every boundary before anything is built.**

`deriveTransitions` (v0 §5.6) is unchanged in algorithm and reuses
`treatmentForSeam`, `treatmentForEdge`, `tiersOf`, `bankRun` and `benchedRun`
(`layout/levels.ts:340`, `:518`, `:778`, `:511`, `:387`) **verbatim, never
reimplemented**, so the drop table has one home. Three refinements v1 makes,
each because the audit found the corresponding re-derivation:

1. **`above`/`below` are measured from `resolved.ground`**, not from
   `GroundLevels.levelY`. Audit §3(e) step 8: today the tier arithmetic is
   computed against authority 4 while the face presented is measured against
   authority 2, and the pad application, the datum floor and the sidewalk band
   have all moved the second since.
2. **The component's `pressedShare` and `availableRun`** — S5's dressing
   selector and S5's run budget — are computed from the resolved field and the
   owner map, which is the first time both have been available in one place.
   `EdgeContext` stops being gated on `district.plannedEdges`
   (`retaining.ts:511`, unification M2: "WP-3 built the right machinery and
   shipped it hillside-only").
3. **`built` is a real treatment with a real builder.** A transition whose
   upper side is owned by `building.footprint` is `built`, and the foundation
   skirt is what builds it (v0 §5.6's table already says "a building already
   stands on it, and its own foundation skirt is the wall"; v1 wires it).

## 3.2 The coverage invariant — normative

For the finished `ResolvedGround`, define a **boundary pair** as an ordered
4-adjacent column pair `(a, b)` with `ground[a] > ground[b]` and
`owner[a] !== owner[b]`, where at least one of `owner[a]`, `owner[b]` is not
`−1`.

> **Every boundary pair is accounted for exactly once, by exactly one of:**
>
> 1. a `GroundTransition` whose `cells` contain `b`;
> 2. **suppressed — request.** Either side's intent declared
>    `transition: "none"` (v0 §2.5);
> 3. **suppressed — face.** Either side is `isFace` — a face *is* the
>    transition (v0 §2.2);
> 4. **suppressed — drop.** `ground[a] − ground[b] === 1` and
>    `treatmentForSeam` returns `kerb`, which the streetscape's kerb course
>    builds as a material and which is a kerb rather than a cliff (G5).
>
> A boundary pair matching none of the four, or matching two, is
> `LOAM-E495 GROUND_SEAM_UNCOVERED` — an **error**, in the `LOAM-E494` class:
> no legal document can produce it, and it aborts the compile loudly.

Two exclusions are deliberate and named, because otherwise the invariant would
fire on every hill in the world:

- **Both sides unowned** — natural terrain against natural terrain. The probe
  measures 4,158 of these on Troy and 4,497 on the pirate haven at avg 2.9–3.3;
  they are the hillside and they must stay. The invariant is scoped to
  boundaries a settlement made.
- **Water.** `fluidKind !== NONE` on either side is skipped; a shore is not a
  seam and `fluid.channel`'s `preserve` already governs it.

## 3.3 Who builds what

Each treatment has exactly one builder, and the builder reports built-or-refused:

| treatment | builder | refusal |
| --- | --- | --- |
| `kerb` (step) | the streetscape's kerb course (`streetscape.ts`), `kerbSeam` (`retaining.ts`) — materials only | never; a kerb is a surface write |
| `retaining` / `tiered` (wall) | `buildRetainingWalls` → `buildTieredSeam` (WP-11 §4.2), consuming the transition instead of deriving a seam | `LOAM-W413 SEAM_UNSERVED` where a street, a footprint or water owns the ground the course needs (`open()`'s existing refusal) |
| `bank` (ramp) | `gradeBank` at 1:2 (`APRON_RUN_PER_BLOCK`, S8's re-key) | `LOAM-W413` where `availableRun < bankRun(drop)` — and S5 then re-dresses the stack `revetted`, which always fits |
| `built` | the building's foundation skirt (`buildings.ts:589-603`) | `LOAM-W494` where the footprint itself was non-planar |
| `rock` (cut side) | `finishSeams` — `finishCutFaces`' revetment/soil/coping work (`index.ts:1636`), generalised past its district filter (R4, unification P8) | never; rock is the hill |

`finishSeams` replaces `finishCutFaces` and is the **terminal** transition
builder: it walks `resolved.transitions`, skips every one another pass reported
built, and builds the rest. That is what makes "a missed seam is impossible"
true operationally as well as by construction — the invariant proves the
resolver enumerated it; `finishSeams` proves something stood on it.

The audit's confession that this replaces (`index.ts:1625-1634`, verbatim:
`finishCutFaces` "exists precisely because passes 14–21 keep exposing faces the
wall pass already finished") stops being true at pass 5c: after the freeze
nothing exposes a face, so the terminal pass has nothing to catch up with and
exists only to build what the resolver derived.

## 3.4 The lints

| where | assertion | code |
| --- | --- | --- |
| resolver, every compile | §3.2's coverage invariant over the finished field | `LOAM-E495` (error) |
| build phase, every compile | every derived transition is built or refused with a code | `LOAM-W413 SEAM_UNSERVED` (warning), aggregated per quarter |
| report, every compile | counts by treatment, and the substitution table (v0 §7) | `LOAM-I495 GROUND_TRANSITION` (note), extended with `built`/`rock` |
| acceptance, the three r22 docs | the probe's cliff census: adjacent dry columns at `|Δ| ≥ 2` with different owners and at least one owned, **minus** transition cells → **0** | `tools/worlds/ground-probe.mjs` |

---

# 4. The deletion list

Each mechanism the audit's §5 names ("Mechanisms that exist only to reconcile
authorities a clean design would not have both of"), plus v0 §10's outstanding
list, with a verdict and one line of justification.

**Deleted.**

1. **`materialisedGround`'s reconciliation duty** (`street-datum.ts:203-210`) —
   *keep the function, delete the reason*: the datum and the plan sample the
   same pristine field with the same `clampY(floor(...))` rule, so the two can
   no longer be two numbers that usually agree.
2. **The datum/surfacer double floor.** `street-datum.ts:302` and
   `roads.ts:1574` both apply `ground − STREET_CUT_MAX`. One floor, in the
   datum (8G already moved it); the surfacer's `max` becomes an assertion that
   it is a no-op, then goes.
3. **`FRONTAGE_TIE_DRIFT` / `LOAM-T237`** (`roads.ts:1589-1596`) — a diagnostic
   whose only job is to report that two graders disagreed. There is one grader.
4. **`GROUND_TIE_SPAN`'s split, as a *law*** — see "kept" below; what is
   deleted is nothing. Listed here because the audit names it and the answer is
   "kept".
5. **`touchesSeam(rect) ? apron 0 : BUILDING_APRON(2)`** (`district.ts:2138`,
   `:2047-2056`) — the apron is gone (§2's `PadEdit` row), so the special case
   has nothing to special-case.
6. **`terminusLandings`** (`roads.ts:1625-1631`) — it overwrites `columnY`
   after grading and before declaring, which is a second grader inside one
   pass. A stair's foot meeting the street is S9's landing publication plus the
   `steps` sub-claim the surfacer already declares (`roads.ts:1652`).
7. **`buildJunctionSteps` entirely** (`junction-steps.ts`, including the
   unconditional `plan.ground[idx] += rise` at `:635` and the declare-after-the-
   fact at `:726`) — the pass reconciles two paved claims that disagree about a
   column. Under one resolve they cannot: the higher-ranked claim owns it and
   the lower one's report row records the loss. Gated today to districts with
   >1 platform (`index.ts:1608`), so flat towns are already untouched and the
   deletion moves only multi-platform towns.
8. **`finishCutFaces` as a catch-up pass** — absorbed into `finishSeams` (§3.3).
   Its revetment/soil/coping painting survives as the `rock` builder.
9. **`skirtDepth`'s cap-as-cover** — absorbed (§2).
10. **`declarePadEdits`, `pad.record`, and `ground-declare.ts`**
    (`ground-declare.ts:45`, `compile.ts:861`, rank 150) — a claim that
    documents a decision already baked into the baseline it is resolved
    against. Replaced by real declarers at real ranks.
11. **`VERGE_FILL_FEATHER = 1`'s asymmetry** (`roads.ts:352`, applied `:3771`)
    — a one-block licence for a bank below the lane, which is a transition the
    resolver now derives at 1:2.
12. **`CURB_LEVEL_TOLERANCE = 0`** (`streetscape.ts:242`, applied `:696`) —
    "was the natural ground exactly equal" becomes "is there a `step`
    transition here", from the resolver's list. v0 §10 already promised this.
13. **`GroundDriver.commit`'s write-through and `record`**
    (`ground-driver.ts:139-170`) — nothing writes `plan.ground`.
14. **`natural = Int32Array.from(plan.ground)`** (`roads.ts`) — one baseline.
15. **`surfaceRoute`'s `paved` special cases and `gradeProfile`'s zero band**
    (I7) — rank does it.
16. **`canals.ts`'s "bank already at the quay" skip** — an agreeing claim is
    not a conflict (v0 §5.3).
17. **`retaining.ts`'s three defences**: the dilated `street` mask, the `seam`
    mask handed through `surfaceStreetGraph` into `blendShoulders`, and the
    coping-emitted-as-a-structure-block workaround. Three defences, one rank.
18. **`retaining.ts`'s inverted-occupancy `avoid` grid** for the wall sweep.
19. **Eleven `plan.snow[idx] = 0` lines** → v0 §1.3's `moved` rule at pass 5d.
20. **The equivalence shim** (`ground-equivalence.ts`,
    `test/ground-equivalence.test.ts`, `levelClaimsByColumn`, `sidewalkWrites`,
    `selfWrites`) — deleted at G8, after it has run green through every stage.
21. **`planeSeams`, `groundLevelsOf`'s two-bench coercion, `RetainingPlane`** —
    absorbed into the transition list (§2).
22. **`SweepInput.avoid`'s arbitration duty** (v0 §3.13) — kept only for
    genuine client exclusions.
23. **`FRONTAGE_CUT_MAX`'s dead declaration** (`types.ts:424`, "declared, never
    imported", audit §4) — it acquires its first call site in the same change
    that deletes the apron (§7.2), so it is deleted-as-dead and re-added-as-live
    in one commit rather than left as a lie.
24. **The re-classification at `compile.ts:751`** — a pad no longer changes the
    field the plan is built from; Group C is derived at pass 5d instead.

**Kept, as proposer arithmetic rather than as law.** Each of these was built to
reconcile authorities that will no longer both exist, and each is also
walk-calibrated taste. They survive inside a datum, where they decide what a
claimant *asks for* and nothing depends on them being true of the answer:

25. **The anchor-congruence law** `levelY = blockBase + bucket · FLOOR_HEIGHT`
    (`platforms.ts:458`, `:495`; `FLOOR_HEIGHT` `district.ts:213`) — becomes
    `PlatformDatum`'s election arithmetic. No resolver invariant asserts it.
26. **`GROUND_TIE_SPAN = 4`'s block split** (`platforms.ts:441`,
    `types.ts:557`) — G4, unchanged, inside `PlatformDatum`.
27. **`CORNER_TOLERANCE = 2` and `frontageSeat`** (`district.ts:3656-3669`) —
    F5, unchanged, inside `SeatDatum`.
28. **`dissolveTallPairs` / `DISSOLVE_DROP_MAX = SEAM_TIER_MAX · RETAIN_MAX`**
    (`platforms.ts:51`, called `district.ts:1379`) — S6 rule 3, unchanged: the
    election still refuses to elect a pair whose seam it would not pay for.
29. **`waterFloor = max(level, seaLevel)` and `damsWater`** (`platforms.ts:331`,
    `:213`) — physics, not reconciliation.
30. **`pinLevel`, `compareStreetRank`, `street-owner.ts`'s comparator** — the
    street family's internal arbitration, which v0 §3.6b puts explicitly
    outside the resolver's business.
31. **`MIN_RETAIN_RUN`, `RETAIN_MAX`, `RETAIN_RAIL`, `SEAM_TIER_MAX`,
    `SEAM_TREAD`, `SEAM_SETBACK`, `EDGE_PRESSED_SHARE`, `bankRun`,
    `benchedRun`** — §5's pinned taste, reused verbatim by
    `deriveTransitions`.
32. **`ROAD_BERM_MAX = 2`, `STREET_CUT_MAX = 2`, `routeFloorAt`'s W1 clamp** —
    W1/W2/F9, inside `StreetDatum`.
33. **`DOORSTEP_FOOT_STEP`, `footLands`, the bank/landing masks**
    (`doorsteps.ts:237-260`) — S8/S10, now reading the resolver's transition
    list for `landings` and `bank` instead of guessing from ground heights.

---

# 5. Taste preservation

Every behaviour below was calibrated by a walk. v1 pins each one, and the
mechanism is the same in all cases:

> **(a) The proposer imports the identical function; a copy is a bug. (b) Every
> stage that claims no behaviour change demonstrates byte-identity on the
> shasum control set and an unchanged per-class cliff census on all three r22
> documents.**

| # | pinned behaviour | where it lives | who calls it under v1 |
| --- | --- | --- | --- |
| T1 | a lot seats **at** its street: `frontageSeat = datum.levelNear(anchor, frontageReach) + FRONTAGE_RISE(0)` | `district.ts:3656-3669` | `SeatDatum` |
| T2 | a corner lot takes the **lower** of front and flank past `CORNER_TOLERANCE = 2` | `district.ts:3666`, `types.ts:414` | `SeatDatum` |
| T3 | no frontage, no tie — four cases, all untouched (F6) | `district.ts`, `padFor` | `SeatDatum` |
| T4 | the storey lattice is anchored on the carriageway; `anchorOf(block)` is the **lower median** of the block's perimeter datum levels | G2, `platforms.ts` | `PlatformDatum` |
| T5 | a block whose perimeter spans more than `GROUND_TIE_SPAN` splits, never averages | G4, `platforms.ts:441` | `PlatformDatum` |
| T6 | terraces follow the hill's shape, snapped to the storey lattice (`memory: hill-town-aesthetic-calibration`) | `platforms.ts:458`, `:495` | `PlatformDatum` |
| T7 | `tiersOf(drop, dressing)`, `SEAM_TIER_MAX = 3`, `SEAM_TIER_FACE = RETAIN_MAX = 6`, tallest face at the **bottom** | `levels.ts:778`, `:660`, `:683`, `:84` | `deriveTransitions` → `buildTieredSeam` |
| T8 | seam dressing chosen by `pressedShare` against `EDGE_PRESSED_SHARE`: **revetted** (setback 1, one battered wall) at or above, **terraced** (tread 3, planted) below | S5, `levels.ts:486` | `deriveTransitions` |
| T9 | a run shorter than `MIN_RETAIN_RUN = 6` is **absorbed**, never graded | S7, `levels.ts:98` | `deriveTransitions` |
| T10 | a bank falls **1:2** (`APRON_RUN_PER_BLOCK`), `bankRun(drop)`, and carries nothing | S8, `levels.ts:511` | `gradeBank` |
| T11 | the street stair tread law `need[k] = max(g[k]+1, need[k+1]−1)` and its whole-run refusal | `street-stairs.ts` | `dressStreetStairs` |
| T12 | a street cuts at most `STREET_CUT_MAX = 2` below its own ground and **breaks into steps** rather than digging | F9, `STREET_BREAK_FLOOR` | `StreetDatum` |
| T13 | the water floor is a **cap on cutting, never a licence to fill**; `ROAD_BERM_MAX = 2` | W1/W2, `roads.ts:686`, `:254` | `StreetDatum` |
| T14 | `compareStreetRank` = `(−width, roleRank, kindRank, id)` within `street.network` | `street-owner.ts` | `surfaceStreetGraph`, `subRank` |
| T15 | a balustrade is built only where somebody can walk up to it (`RAIL_ACCESS_RANGE`, `RETAIN_RAIL = 3`) | `retaining.ts:1277` | `railRun`, top tier only |
| T16 | a plaza outranks a street; a well's eight neighbours are preserved | ranks 30/40 | unchanged |

**Two taste parameters that v1 does not touch and must not.** `FRONTAGE_RISE`
stays `0` (a plinth course under every shopfront is a walk verdict, F4), and
whether a six-block wall carries a mid-bench stays open (v0 §13.8's closing
paragraph). Both are Kai's.

---

# 6. The staged flip plan

Nine stages. Every stage is separately committable; the tree compiles and
generates worlds between all of them; every world-moving stage is behind a
compile-time flag whose off-state is byte-identical, so the flip is a single
walk verdict and a flip triage is "re-pin or real bug", never "which of six
changes did that".

**The flag ladder** (`layout/types.ts`, beside `FRONTAGE_TIE`, `SEAM_TIERS`,
`GROUND_PLANE_TIE`): `GROUND_V1_RANKS`, `GROUND_V1_SEAMS`, `GROUND_V1_FREEZE`,
`GROUND_V1_PRISTINE`. Each implies the ones above it and a test asserts the
ordering, exactly as G9 does for `GROUND_PLANE_TIE ⟹ FRONTAGE_TIE`.

**The acceptance harness** is `tools/worlds/ground-probe.mjs` against the three
archived r22 documents:

| id | document | seed | character |
| --- | --- | --- | --- |
| **troy** | `battery/candidates/troy_r22/trojan_horse_troy.loam.json` | as archived | hillside citadel; 3,065 intents; the stress case |
| **hellenist** | `battery/candidates/hellenist_r22/thalassa_polis.loam.json` | as archived | flat city; 663 intents; the control |
| **pirates** | `battery/candidates/pirates_r22/pirates_vs_unicorns.loam.json` | 301 | mixed, with a quay; 1,539 intents |

Baseline numbers, read off the probe today:

```
troy       cliff edges |Δ|≥2 with an owned side, by pair:
             verge/verge 1164 (avg 3.5, max 12)
             retaining.seam/retaining.seam 843
             retaining.seam/pad.record 713 (avg 3.2, max 14)
             street.sidewalk/pad.record 447 (avg 3.5, max 14)
             retaining.seam/natural 323 (max 20)
             ... total over all owned-side pairs ≈ 4,100
           natural/natural 4158 (avg 3.3) — terrain, must not move
           street flank flush: street.sidewalk 1919/2001 at Δ0
           written vs resolved: 0
           finalPlan vs written (post-structure movement): 247
hellenist  owned-side cliff edges ≈ 400 (pad.record/verge 167 is the largest)
           written vs resolved: 68, all owner pad.record
           street flank flush: street.sidewalk 3868/3979 at Δ0
pirates    natural/precinct.ground 118 (avg 4.6, max 6)  — the quay back edge
           retaining.seam/retaining.seam 160, retaining.skirt/retaining.skirt 61
           street flank flush: street.sidewalk 2623/2647 at Δ0
           written vs resolved: 0
```

---

### WP-G0 — the probe becomes a harness

*Scope.* `tools/worlds/ground-probe.mjs` gains a `--json` mode and a committed
baseline per document under `tools/worlds/ground-probe-baselines/`; a
`packages/compiler/test/ground-probe-harness.test.ts` runs it over the three
r22 documents and diffs against the baselines. No compiler change.

*Flag.* None. *Runs beside.* Nothing.

*Acceptance.* The baselines reproduce the numbers above exactly, twice, from a
clean checkout. **Prove the harness can see a difference before trusting that
it saw none**: a deliberate one-block perturbation must fail it.

---

### WP-G1 — the pristine baseline, measured and unused

*Scope.* Snapshot `terrain.pristine` before `compile.ts:722`. Behind
`options.groundEquivalence`, materialise a second `ColumnPlan` from it and
report, per world, `|{k : pristine.ground[k] !== baseline.ground[k]}|` and the
signed delta histogram. Nothing consumes it.

*Flag.* None (test-only path). *Runs beside.* Today's baseline, unchanged.

*Acceptance.* Byte-identical on every world. The measured pad displacement is
the single most important unknown for G7 and is recorded as a golden. Expected
shape: it is exactly the union of `layoutOutcome.padEdits`' footprints and
aprons, and an asserted equality against that set is the stage's real deliverable
— a column outside it means a pad edit the audit did not find.

---

### WP-G2 — declaration completion

*Scope.* Delete the last direct writers on the settlement path.
`junction-steps.ts:635`'s mutate-then-declare becomes declare-only, folded into
the surfacer's `steps` sub-claim; `sweep.ts:1543-1544` and `props.ts:832-833`'s
undeclared fallbacks are scoped to the non-settlement callers by type rather
than by an `undefined` check; `terminusLandings` (`roads.ts:1625-1631`) is
deleted. `structures/index.ts` gains a `declare()`/`build()` **split for these
passes only**.

*Flag.* None — no rank changes, no level changes.

*Runs beside.* The equivalence shim, which now asserts `gaps === 0` on the
settlement path with no exceptions.

*Acceptance.* Byte-identical on all three r22 documents (per-file shasums) and
on `hillside-village`, `hilltop-crypt-hamlet`. **`written vs resolved` on
hellenist stays 68** (those are `pad.record` columns, untouched here) and on
troy/pirates stays 0. The multi-platform junction case is the risk: troy has
platforms and the junction pass is live there, so a shasum move on troy at this
stage is a real finding, not a re-pin.

---

### WP-G3 — the empty classes filled

*Scope.* `quarter.plane` added at rank 15 (`ground-contract.ts:201`, `:239`,
`GROUND_SOURCE_CLASSES`, `LEGAL_KINDS`). `building.footprint` gets its
declarer: the lot pad's footprint half, at `SeatDatum`'s level, `platform` +
`preserve`. The platform runs declare `quarter.plane`, less the solved
carriageway band (§1.7). `PlaneDatum` formalised; precinct claims take their
level from it. `declarePadEdits`/`pad.record` deleted.

*Flag.* `GROUND_V1_RANKS`. **Off:** the same intents are declared at
`pad.record` (150), so nothing wins differently and every world is
byte-identical. **On:** they take rank 10/15/20.

*Runs beside.* The shim, whose `TOLERATED_INVERSIONS` table (v0 §8.5) gains
four rows — **I8** `building.footprint` over tiers B–D, **I9** `quarter.plane`
over tiers B–D, **I10** `precinct.ground` over tiers B–D at a level `PlaneDatum`
chose, **I11** the disappearance of `pad.record` — each with a per-world golden.

*Acceptance, flag off.* Byte-identical everywhere; `PAD_APRON_MISMATCHES`
retires (nothing declares `pad.record`); hellenist's `written vs resolved`
68 → 0, because the 68 were exactly `pad.record` columns whose declaration
disagreed with the baseline the apron had built.

*Acceptance, flag on (comparison only, not shipped).*
`retaining.seam/pad.record` 713 and `street.sidewalk/pad.record` 447 are
re-attributed to `retaining.seam/building.footprint` and
`street.sidewalk/quarter.plane`; the **counts must not grow**. The superset
property of §1.7 holds on all three documents and on three form skeletons.

---

### WP-G4 — the transitions get a terminal consumer

*Scope.* `finishSeams` replaces `finishCutFaces` (`index.ts:1636`): it reads
`stage.finish().transitions`, takes the built-set every other pass reports, and
builds the complement through the existing constructions —
`buildTieredSeam`, `gradeBank`, the kerb course, the foundation skirt, the rock
finish. `deriveTransitions` gains the three refinements of §3.1.
`EdgeContext` stops being gated on `plannedEdges` (WP-11 11A's edit, if not
already landed). The coverage invariant and `LOAM-E495` land here.
`planeSeams` is absorbed.

*Flag.* `GROUND_V1_SEAMS`.

*Runs beside.* The old derivation, for one stage: with the flag off,
`finishSeams` **derives and reports** but builds nothing, so the invariant runs
on every world and the counts are a golden before a single block moves. That is
the front-loaded comparison — the risky question ("does the resolver enumerate
the same seams `levelSeams`/`skirtSeams` do, plus the ones they miss?") is
answered by a diff, not by a walk.

*Acceptance, flag off.* Byte-identical. `LOAM-E495` fires **zero** times on all
three documents — if the resolver cannot account for a boundary, that is a
resolver bug and it blocks the stage. The reported transition count is a golden.

*Acceptance, flag on.* This is the stage that kills the cliffs. Targets on the
r22 documents, all measured with the pristine baseline still *off* (so pads
still win by baseline and only the seams change):

| measure | troy | hellenist | pirates |
| --- | --- | --- | --- |
| owned-side cliff edges `\|Δ\|≥2` with **no** derived transition | ≈4,100 → **0** | ≈400 → **0** | ≈300 → **0** |
| `verge/verge` | 1164 → **≤ 60** | 2 → 0 | 8 → 0 |
| `natural/precinct.ground` (the quay back edge) | — | — | 118 → **0** |
| `natural/natural` | 4158 → **4158 ± 0** | 1469 → **1469 ± 0** | 4497 → **4497 ± 0** |
| `LOAM-W413 SEAM_UNSERVED` | ≤ 5 per quarter | 0 | ≤ 5 per quarter |

The `natural/natural` row is the guard: this stage must not touch the hillside.
`verge/verge` does not go to zero because a verge that ramps between two
resolved levels is *itself* the transition where the drop is 1; the residual is
the kerb case of §3.2 clause 4 and 60 is the budget.

*Walk gate.* Yes. This is the first stage that changes what a hill town looks
like, and the change is exactly "the terraces got their walls".

---

### WP-G5 — the declare/build split

*Scope.* Every remaining structure pass gains `declare()` and `build()`.
`buildStructures` becomes `declareStructures` + `buildStructures`.
`StructurePlan` carries what each pass computed between the two.
Painters (`buildGrounds`, `dressLife`, `kerbSeam`, `faceCuts`) get a no-op
declare and are unchanged. The stage still writes through (`commit` survives
one more stage), so the build half sees exactly the numbers it sees today.

*Flag.* None — **this stage must move no number.** That is what makes it the
second front-loaded comparison, and it is the largest refactor in the plan.

*Runs beside.* Nothing; the shim's assertions are unchanged and must stay
green, including `driver.finish()` equalling the one-shot resolve.

*Acceptance.* Per-file shasum identity on all three r22 documents, both hill
towns, `c1-harbourtown`, `showcase-bayline`, `showcase-ironvale`,
`demo-deltaport`. Every probe number identical, to the column. A single moved
byte is a bug in the split, never a re-pin.

*Risk note.* `buildBuildings` is the hard one: it emits at pass 9 of 27 with an
absolute Y (`buildings.ts:300`) and seventeen passes then move the ground under
it. The split is what lets its emission move to pass 5e; at G5 it does not move
yet — only its *declaration* is lifted out. Do not combine the two.

---

### WP-G6 — tier order, five resolves, the freeze

*Scope.* Declaration runs in tier order; `view(tier)` becomes the typed
prefix view of §1.4; the four prefix resolves plus the final one replace the
per-commit resolve; `commit`'s write-through and `record` are deleted;
`plan.ground/.fluidTop/.fluidKind` become readonly aliases of the resolver's
arrays at pass 5c; pass 5d (Group C + snow) lands; `buildGrounds` becomes the
total painter over `moved`; `buildJunctionSteps` is deleted; `floorY` becomes
`resolved.ground[k] + 1` and `LOAM-W494` lands.

The pipeline reorders as a consequence, and two reorders change worlds:
`digCanals` (tier A, rank 0) declares **before** `buildRetainingWalls`
(tier B) instead of after it, and `furnishCourtyards` (rank 50) declares before
the walls (60/70). Both close v0 §9a.4's first named approximation.

*Flag.* `GROUND_V1_FREEZE`.

*Runs beside.* The shim, for the last time: `finish()`'s three arrays must
equal `resolveGround(baseline, stage.intents)` element for element, which is
the assertion that catches a prefix resolve that is not a prefix.

*Acceptance, flag off.* Byte-identical.

*Acceptance, flag on.*

| measure | target |
| --- | --- |
| `written vs resolved` (probe) | **0** on all three — trivially, because the plan *is* the resolve |
| `finalPlan vs written` (post-structure movement) | troy 247 → **0** (the program pass declares in tier D; §7.1) |
| troy street flank, `street.sidewalk` at Δ0 | 1919/2001 → **≥ 1990/2001**, target 2001 |
| hellenist street flank, `street.sidewalk` at Δ0 | 3868/3979 → **≥ 3970/3979** |
| pirates street flank, `street.sidewalk` at Δ0 | 2623/2647 → **≥ 2640/2647** |
| buildings whose ring-median sits above their floor | **0** at any depth ≥ 2 |
| `LOAM-T110 UNSTABLE_FLUID`, `road.proud`, `unsupported.chain`, `floating.isolated`, `traversal.unreachable` | **0** on all 27 rules, all three worlds |
| `LOAM-W494 GROUND_SEAT_NONPLANAR` | 0; a non-zero count is a placement bug, not a ground bug |

*Walk gate.* Yes — the canal/courtyard reorder and the deletion of
`buildJunctionSteps` both change multi-platform towns.

---

### WP-G7 — the pristine baseline

*Scope.* `buildColumnPlan` materialises `terrain.pristine`; `classify` runs
once, on it; `compile.ts:751`'s re-classification is deleted; `PadEdit.apron`
and `.apronBySide` are deleted and `applyLevelPad`'s smoothstep with them;
`FRONTAGE_CUT_MAX` acquires its first call site (F7's rear-cut cap);
`touchesSeam`→`apron: 0` goes.

*Flag.* `GROUND_V1_PRISTINE`.

*Runs beside.* G1's measurement, promoted to an assertion: the difference
between the pristine baseline and today's is exactly the pad set, so every
column that moves at this stage is a column a pad edited and a claim now owns.

*Acceptance, flag on.*

| measure | target |
| --- | --- |
| columns where `resolved.ground` differs from G6's answer | ⊆ G1's measured pad set, exactly |
| `LOAM-E495` | **0** — every newly exposed pad edge carries a derived transition |
| new `retaining`/`tiered`/`bank` transitions | expected: this is where the lot pads' aprons become real revetments and 1:2 banks; the count is a golden, and the *look* is the walk |
| troy `natural/natural` | 4158 ± 0 |
| all three worlds, all 27 physics rules | 0 |
| `PAD_APRON_MISMATCHES` | gone; §7.2 is answered by deletion |

*Walk gate.* Yes, and it is the big one: every freestanding lot on a slope
stops having a smoothstep skirt and starts having a face or a 1:2 bank.

---

### WP-G8 — deletions and the collapse

*Scope.* §4's list, in full. The shim, `ground-declare.ts`,
`ground-equivalence.ts` and their tests go. `GroundDriver` collapses to
`GroundStage`. The four flags are removed and their branches deleted.
`ground-freeze.test.ts`'s static scan becomes the only guard.

*Flag.* None; the flags are what is deleted.

*Acceptance.* Byte-identical to G7-flag-on on every world. The test count goes
down and the probe numbers do not move.

---

**Why this order.** G0 and G1 are measurement; G2 and G5 are pure comparisons
carrying the two largest refactors; G3 and G4 land their behaviour behind a
flag whose off-state is checked by the same harness; only G4, G6 and G7 change
a world, and each changes one *kind* of thing — seams, then ownership, then the
baseline. A flip triage at G6 that finds "the sidewalk moved" is I6 re-pinned;
one that finds "a canal moved" is the reorder and is expected; one that finds
"a hillside moved" is a real bug, because no stage after G4 is allowed to touch
`natural/natural`.

---

# 7. Open problems, resolved

## 7.1 Authored programs and `site-treatment` — declare before resolve

Today `buildPrograms` runs after `buildStructures` (`compile.ts:958`), receives
the driver (`:972`), and `treatProgramSite` commits `prop.pad` intents whose
write-through lands after the shim's snapshot — which is exactly the probe's
`finalPlan vs written: 247` on troy. `site-treatment.ts:268-269`'s direct write
survives for the driver-less callers.

**Resolution: declare before resolve, with no post-freeze exemption on the
settlement path.**

1. **Siting and seat election move into pass 5b.** `programJobs` are built from
   occupancy and the finished placements, both of which the declare phase
   produces; `claimProgramFootprints` runs there so the scatter still sees the
   claims. The site's pad and apron declare `prop.pad` (130) and the apron's
   rings declare `verge` (140), fill-only, exactly as they do now.
2. **Program *execution* moves to pass 5f, against frozen ground.** This is
   strictly better than today: unification §0.2's whole complaint is that the
   pad is laid first so that "`api.heightAt` shows the program the ground it
   will actually stand on", and under v1 `api.heightAt` **is** the resolved
   ground, with no pad-then-peek dance.
3. **WP-9's carve (C9) is a declaration, never a mutation.** A conforming
   program that needs the hill lowered declares it at `prop.pad`, capped by
   `PROGRAM_MAX_RELIEF`, and loses to anything built — which is the same
   answer I4 gave the prop pad.
4. **`underpinProgramInstance` and the foundation plinth stay materials** —
   blocks against frozen ground, no level write, exactly like `buildDoorsteps`'
   `stepped` outcome.
5. **The exemption list is enumerated, not implied.** The mutating path in
   `sweep.ts`, `props.ts` and `site-treatment.ts` survives for `exhibits/*`,
   the terrarium and the devworld, which build no resolver. `ground-freeze.test.ts`
   lists them in the test file, so adding one is a visible diff (v0 §10).

*Acceptance:* troy's `finalPlan vs written` 247 → 0 at G6.

## 7.2 The pad apron — v0 §13.3, answered

v0 §13.3 asked whether the pad's apron should become a declared transition and
recommended deferring it to WP-7, holding `PAD_APRON_MISMATCHES` at a golden of
55 so it could not grow. **v1's answer is stronger than the question: the apron
is deleted.**

A pad declares its footprint and nothing else. The boundary between the
footprint and whatever is beside it is a boundary between two owners at
different levels, which is what `deriveTransitions` is for, and F7 already
specifies the resulting behaviour in the fill and cut directions verbatim
("the terrain standing against the rear is the answer, not a defect"). The
1:2 feather F7's adaptive apron built is preserved by the `bank` treatment,
which grades at the identical `APRON_RUN_PER_BLOCK` ratio (T10). The
asymmetric-apron machinery of WP-8C (`LevelPad.apronBySide`) is deleted with
it; G7's per-side rule (`the reach of the nearer side, ties to the lower index
side`) has nothing left to arbitrate.

`PAD_APRON_MISMATCHES` cannot grow because it cannot exist: there is no
smoothstep in the baseline for a declaration to disagree with.

## 7.3 Performance — the budget

v0 §9a argued that "twelve resolves on a city region is twelve walks of a few
million cells, which is the cost of the mixture and is deleted with it". v1
deletes it and replaces it with five.

*Budget, normative.* On a 512×512 region (262,144 columns):

- **Five resolves**, one per tier, each `O(columns + Σ|claim columns| +
  boundary walk)`. Troy declares 3,065 intents over ~40,349 owned columns; the
  dominant term is the three array copies and the `owner`/`ceiling`/`guarded`
  fills, ~1.3 M `Int32Array` writes per resolve.
- **Strictly fewer resolves than today.** The mixture calls `resolveGround`
  once per `commit` plus once per `view()` following a `record` — twenty-plus
  on a settlement world. The report carries `stats.ground.resolves` and a test
  asserts it is exactly 5 on the settlement path and 0 on a terrain profile.
- **The ground stage stays under 10% of total compile wall time**, measured on
  all three r22 documents and recorded beside `layoutMs`/`structuresMs` as
  `groundMs`. A stage that breaks the budget is a finding.
- **Allocation is deterministic and bounded**: region-sized typed arrays sized
  from `baseline.region`, allocated once and reused across the five resolves
  where the prefix property permits (v0 §5.7 rule 5 unchanged).

The transition derivation is the one new cost: an 8-connected component walk
over the boundary set, once. On troy the boundary set is ~9,000 columns.

## 7.4 Determinism and the fluid triple

**Unchanged.** v0 §5.7 governs the resolver; F11, G10 and S12 govern the
datums. RNG seeds still derive from `hash(worldSeed, nodePath)`; no datum, no
declarer and no transition derivation calls an RNG or a clock; every internal
grouping sorts on region index then intent index before it is walked.

**The fluid triple freezes together** (v0 §1.3), and v1 makes two things true
that v0 could only assert:

- `digCanals` (rank 0, tier A) and the two wells (rank 40, tier B) declare
  before anything that could move the columns they hold, because declaration
  runs in tier order. v0 §9a.4's "a converted retaining pass computes its
  levels without seeing the channel" is closed.
- Group C is derived from `resolved.wet` at pass 5d, so
  `lakeMask | oceanMask ⟹ fluidKind !== NONE` holds by construction rather than
  by a passing test (v0 §13.1, answered: derive, do not freeze).

`LOAM-T110 UNSTABLE_FLUID` stays a physics lint and stays at zero on every
shipped world.

## 7.5 Diagnostics — what survives, what retires, what is new

**Survive unchanged.** `LOAM-W490 GROUND_CONFLICT`, `LOAM-I491
GROUND_CLAIM_ADJUSTED`, `LOAM-W492 GROUND_CLAIM_REFUSED`, `LOAM-W493
GROUND_CLEARANCE_VIOLATED`, `LOAM-E494 GROUND_INVARIANT`, `LOAM-I495
GROUND_TRANSITION` (extended with `built`/`rock` counts); `LOAM-T235/T236`
(linework); `LOAM-W410 LEVEL_DISSOLVED`, `LOAM-I412 SEAM_SERVED`, `LOAM-W413
SEAM_UNSERVED`, `LOAM-I415 WALL_COURSE_CROSSES_SEAM`; `LOAM-T239
ROAD_BERM_CLAMPED`; `LOAM-T241 GROUND_PLANE_UNTIED`, `LOAM-T242
GROUND_PLANE_DRIFT`, `LOAM-I416`, `LOAM-I417`; every physics code.

**Retire.** `LOAM-T237 FRONTAGE_TIE_DRIFT` (§4 item 3 — one grader, nothing to
drift from) and `LOAM-T238` if it exists only to report the tie's reach
failures that F6 now makes silent. `LOAM-W411 RETAINING_REFUSED` was already
retired by S1. A retired code keeps its number reserved-dead, per the
`structure.linework` precedent.

**New, allocated here so two concurrent waves cannot pick the same integer:**

| code | name | severity | fires when |
| --- | --- | --- | --- |
| `LOAM-E495` | `GROUND_SEAM_UNCOVERED` | error | §3.2's coverage invariant is violated — a boundary pair matching none of the four clauses, or two. A compiler bug in the `LOAM-E494` class; the caller aborts loudly |
| `LOAM-W494` | `GROUND_SEAT_NONPLANAR` | warning | a `building.footprint` claim did not win every column of its rect at one level; the building is refused and the column and the winner are named |
| `LOAM-I497` | `GROUND_STAGE` | note | once per compile: intents by class, resolves, columns moved, transitions by treatment, and how many `finishSeams` had to build |

None enters `FEEDBACK_CODES` (v0 §13.6's precedent: a code that fires on every
settlement world costs money in the authoring loop and buys an invented change).

## 7.6 Interaction with `SUSPENDED_GATE_CHECKS`

Gate leniency is permanent (LOAM-SPEC §15.2, standing decision 2026-08-17) and
v1 does not touch it. The relationship is one sentence: **`LOAM-E495` and
`LOAM-E494` are compiler bugs, not gate checks.** They are not suppressible by
leniency, they do not participate in mend-don't-drop, and they abort. Every
other code v1 adds or keeps is a warning or a note, none is a gate, and none
enters `FEEDBACK_CODES` — so the leniency surface is unchanged in both
directions.

## 7.7 The r23 deck cadence during the rewrite

**Worlds are generatable at every stage and the deck never blocks.** Each
stage's flag-off state is byte-identical to the stage before, so `terrainist
generate` produces the same world from the same commit and seed throughout;
the cloud-box property (`memory: cloud-box-workflow` — shipping a commit is
shipping a world) is preserved stage by stage. Three rules:

1. **A deck generated between stages is generated with every flag off**, which
   is today's pipeline, so a walk verdict on it is a verdict on the *content*,
   not on the rewrite.
2. **A walk-gated stage (G4, G6, G7) regenerates the three r22 documents plus
   the current deck with its flag on, installs alongside with `--channel`,
   never `--replace`**, so the old walk stays comparable.
3. **Battery regeneration stays once per autonomous run, at the end** (standing
   decision). A stage does not trigger one.

---

# 8. Test surface

New files: `test/ground-datums.test.ts` (G1/G3),
`test/ground-transitions.test.ts` (G4), `test/ground-stage.test.ts` (G5/G6),
`test/ground-probe-harness.test.ts` (G0). Existing files that must stay green
throughout: `ground-contract.test.ts`, `ground-resolver.test.ts`,
`ground-equivalence.test.ts` (until G8), `levels.test.ts`,
`levels-identity.test.ts`, `seam-runs.test.ts`, `seam-tiers.test.ts`,
`seam-absorption.test.ts`, `platforms.test.ts`, `street-datum.test.ts`,
`street-ownership.test.ts`, `road-cross-section.test.ts`, `streetscape.test.ts`,
`plane-seams.test.ts` (until G4 absorbs it), `ground-plane-tie.test.ts`.

| stage | what pins it |
| --- | --- |
| **G0** | `ground-probe-harness.test.ts`: the three r22 documents reproduce their baselines; a seeded one-block perturbation fails the harness (prove it can see a difference). |
| **G1** | `ground-datums.test.ts`: `pristine ≠ baseline` exactly on the union of `padEdits`' footprints and aprons; the delta histogram is a golden. Purity: the four datum modules do not import `ground-driver.js` (import-graph test, `agent-defs.test.ts` tradition). |
| **G2** | shasum identity on 7 worlds; `ground-equivalence.test.ts`'s `gaps === 0` with **no** settlement-path exceptions; a grep-shaped test that `plan.ground[` appears nowhere in `packages/compiler/src` outside `ground-driver.ts` and the enumerated non-settlement callers. |
| **G3** | `ground-contract.test.ts`: `INTENT_RANK` covers every `GroundSourceClass` exhaustively (the silently-missing-entry lesson); ranks distinct and ascending in tier order with `quarter.plane` strictly between 10 and 20; `pad.record` absent from the union, the ranks, the tiers and `GROUND_SOURCE_CLASSES` (four places — a class removed from one of them is exactly the failure mode `agent-defs.test.ts` was written for). `ground-datums.test.ts`: the §1.7 superset property on three r22 documents and three form skeletons; a `quarter.plane` claim contains no carriageway column. |
| **G4** | `ground-transitions.test.ts`: the coverage invariant on synthetic fields at drops 1, 2, 6, 7, 8, 14 and runs 1, 5, 6, 25; a 45° boundary is **one** component, not a crumb per column (third appearance of this lesson, first two found by walking); a face suppresses; `"none"` on either side suppresses; `treatmentForSeam`'s table is reproduced exactly and `tiersOf`'s split is tallest-at-the-bottom; `above`/`below` are read from `resolved.ground` and a synthetic disagreement with `levelY` is caught. Acceptance: §6/G4's table. |
| **G5** | shasum identity on 12 worlds; every probe number identical to the column; `ground-equivalence.test.ts` unchanged and green, including `finish()` equalling the one-shot resolve. |
| **G6** | `ground-stage.test.ts`: `stats.ground.resolves === 5` on the settlement path and `0` on a terrain profile; `view(tier)` contains only strictly-higher tiers (typed and asserted); a claim in tier *n* cannot see its own tier; the prefix property — `resolve(A…n)` restricted to tier-≤n-owned columns equals the final resolve there — on a generated hill town. `ground-freeze.test.ts`: no module outside the resolver writes a frozen array, with the §7.1 exceptions enumerated in the test file; `lakeMask | oceanMask ⟹ fluidKind !== NONE`. Acceptance: §6/G6's table, plus all 27 physics rules at zero on a world read back off disk. |
| **G7** | `ground-datums.test.ts`: the moved set at the flip is exactly G1's golden; `LOAM-E495` zero; `natural/natural` unchanged on all three documents. `PadEdit` has no `apron` field (type-level). |
| **G8** | the deleted modules are gone (`ground-declare.ts`, `ground-equivalence.ts`); byte-identity against G7-flag-on; `ground-freeze.test.ts` is the only guard left. |

**Generated worlds are the bar, not unit tests.** Per v0 §11 and Phase 4.1/4.2's
record (three defects then six, all through green unit tests), every walk-gated
stage compiles a world with `terrainist generate` from a text prompt — never
hand-authored — reads it back off disk, and lints all 27 `PHYSICS_RULES`. The
four that matter most here are `road.proud` (zero), `unsupported.chain` and
`floating.isolated` over every balustrade (zero), and `traversal.unreachable`
(zero — no platform orphaned by a transition the resolver chose differently).

**The collision-file discipline for `packages/spec/src/terrain/diagnostics.ts`.**
That file is one flat registry and two concurrent waves that both need a code
will pick the same next-free integer and collide on merge. Three rules, all
enforced:

1. **Every code this rewrite needs is allocated in §7.5, once, in this
   document.** A wave takes the number written there and never picks its own.
   The free space was measured against the registry: `E495`, `W494` and `I497`
   are unoccupied; `E494`, `E497`, `I491`, `I495`, `I496`, `I498`, `W490`,
   `W492`, `W493` are not.
2. **A wave appends only its own entry**, at the end of its family's block,
   and never renumbers a neighbour. A retired code keeps its number
   reserved-dead with a one-line comment saying which stage retired it.
3. **`packages/spec/test/` asserts uniqueness and totality** — every code
   appears once, every `DiagnosticName` has exactly one code, and every code in
   `PHYSICS_LINT_CODES`/`FEEDBACK_CODES` exists. `ground-plane-codes.test.ts`
   is the existing instance of this pattern and the new codes join it.

---

## 9. What v1 does not do

- It does not change `resolveGround`'s algorithm (v0 §5.2–§5.5), its
  determinism rules (§5.7), `compareIntent` (§4.1), or the five kinds (§2.2).
  The one arbitration change is the `quarter.plane` insertion and the
  `pad.record` deletion.
- It does not move the shoulder BFS into the resolver (v0 §13.9, unchanged).
- It does not re-open a taste parameter. `FRONTAGE_RISE`, the mid-bench
  question, and the wall-bed adoption of v0 §13.2e all stay Kai's.
- It does not build the mirror geometry R4 defers (a terraced stack stepping
  *into* a hill), the viaduct promotion of W4, or the wall-circuit promotion of
  S11. Each is behind its own measurement and each measurement now runs on a
  resolved field, which is the first time it has been worth trusting.
