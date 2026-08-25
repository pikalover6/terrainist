# The slop census (STOCKTAKE-RUN-SPEC §8, gate G5)

Slop is work that no longer earns its place. This is the census: every
finding by class, with a disposition — **delete / fix / rewrite /
keep-with-note / proposal** — and its status. Classes 1–3 are the valuable
ones and are executed, not only listed; 4–7 are cheap cleanup. Standing
rulings (§12) are respected: a class-4 "dead path" that is one of them is
kept-with-note, never deleted.

Sizes: **S** ≤ an hour, **M** ≤ a day, **L** a subsystem. Status: **done
(unit N)**, **staged**, **open**, **proposal Pn**.

Started 2026-08-25 (unit 16). Sources: the Run's records under
`docs/decks/anchors/`, the probes kept verbatim there, and the three census
probes of unit 16 (`CLASS-1/2/3.md`, appended below in §8).

**G5 reading (unit 39).** Every row in classes 1–7 carries a disposition.
Classes 1–3 are executed: each row is done, staged behind an attributed
switch, or a written proposal (P4, P9, P10) — a proposal being one of the
five dispositions, and every M/L row re-dispositioned to one says so in its
status. Classes 4–7 keep their dispositions; 4.5's and 7.3's probes are not
executed (G5 does not ask it), and 4.4's deletion ladder belongs to the
closing report.

## 1. Belief vs behaviour — what a module says of itself vs what a probe shows

| # | where | belief | behaviour | disposition | status |
|---|---|---|---|---|---|
| 1.1 | `layout/district.ts` `BLOCK_MULTI_RECT` | "a grid quarter cannot move" | the r5 metropolis, a grid quarter, moved 68 → 66 terraces at that commit | fix comment (S) | **done (unit 16)** |
| 1.2 | `layout/district.ts` `W527` guard | "the guard that should have caught the deep-block defect" | gated `planned === undefined`: blind on the hillside path every walled hill town takes | fix (S) | **done (unit 10)** |
| 1.3 | `layout/forms/hillside.ts` compaction | "`stations` is the frontage the strip actually holds" | a raster artefact of the nearest-point tie; half the frontage on a diagonal | fix behind `STRIP_FRONTAGE_BY_CLAIM` (S) | **done (units 5–6)** |
| 1.4 | `layout/district.ts` `frontageLots` | "the whole strip, offered to a landmark" | the union of the lots already seated | fix behind `PLANNED_SITE_WHOLE_STRIP` (S) | **done (unit 7)** — inert on diagonal strips (P1) |
| 1.5 | `layout/district.ts` `frontageLots` | "grown inward from its own span" | the BFS grows sideways with a 240-column budget and eats the next lot | fix behind `LOT_PARCEL_OWN_STATIONS` (M) | **executed: staged, off** (units 7, 21) — the fix stands behind `LOT_PARCEL_OWN_STATIONS`, attributed on the fourteen and kept off (F10 → F21, the orchard; Kai's veto open) |
| 1.6 | `stdlib/structures/highrise.ts` | "the doorway and its head course: opaque, always" | the head course is the one cell never written when `storyHeight > 3` | fix behind `HIGHRISE_DOOR_HEAD_SOLID` (S) | **done (unit 9)** |
| 1.7 | `layout/district.ts` `streetBehind` | a side's street is "where a carriageway is if there is one at all" (its midpoint) | a 45° cell's carriageway runs past the midpoint probe; 68 % of block land fronts "nothing" | fix behind `STREET_FACE_ALONG_SIDE` (S) | **done (units 8–9)** |
| 1.8 | `layout/city.ts` park budget | up to a third of the *cells* may be parks | two of six cells were 65 % of the land | fix behind `PARK_BUDGET_BY_AREA` (S) | **done (units 8–9)** |
| 1.9 | `stdlib/classify/index.ts` `computeOceanMask` | "`never` is honoured exactly as far as physics allows" | the repair floods the `never` column and stops; the column behind it stays dry against the sea | fix behind `OCEAN_FILL_CONTINUES` (S) | **done (units 14–15)** |
| 1.10 | `terrain/columns.ts` `settleFluidPool` | a pool is settled at its level | a second pool lowers the first | fix behind `POOL_NEVER_LOWERS` (S) | **done (units 14–15)** |
| 1.11 | `layout/platforms.ts` `mostlyWater` | a bench "mostly water" keeps its bed | a majority vote; a terrace pad beside a lake grades the lake dry | proposal (L) | **executed as P4** (unit 14) — a proposal is its disposition, and it is written |
| 1.12 | `layout/district.ts` `SEAM_BLOCK_MIN_DROP` | every platform seam "is exactly where a retaining wall will stand" | a kerb seam stood no wall and still split the block | fix behind `SEAM_BLOCK_MIN_DROP` (S) | **done (units 3–4)** |
| 1.13 | `layout/types.ts` `TERRACE_BY_TERRAIN` | "nothing consults this value" since the election | TRUE for the compiler (readers sit below the election's return; `seatOnPlane` short-circuited); tests read it | keep-with-note (§4.3) | verified (unit 16) |
| 1.17 | `layout/city-pass.ts` synthetic cell nodes | a walled `city` answers for its coverage | the cell node never carries `CityParams.walls`, so `walledQuarter` sees a city walled by `params.walls` only through the intent's `fortification` | fix (S, ~5 lines: carry the parent's wall into the cell's guard, not its params) | done (unit 17) — the cell context carries `walled` from `params.walls`; the W527 gate consults it |
| 1.18 | `stdlib/classify/index.ts` `overriddenNoFlood` | "counted" | read by nobody; no diagnostic tells the author their `never` was overridden | fix (S: a note) | done (unit 17) — `LOAM-I500 CARVE_FLOODED_ANYWAY`; 3,762 columns on the metropolis |
| 1.19 | `layout/district.ts` `LOT_PARCEL_OWN_STATIONS` docblock (unit 7) | on, the strip's leftover ground is "unowned and ungraded between the pads" — 898 orphans; the fix is two-phase parcel growth | probed (unit 18, `docs/decks/anchors/F10-LOWER-SQUARE-2026-08-25.md`): 875 of the 898 are one island — `lower_square` and its three lanes — cut at one spot where the re-routed `summit_chapel→lower_square` lane meets a retaining edge as a 6-block drop over 2 columns and the road emitter lays nothing; parcel ownership is not in the chain | F20 (router/emitter); docblock corrected | done (unit 18) — docblock; F20 fixed and shipped (units 19–20); the flag retried and kept off (unit 21, F21: the orchard) |
| 1.20 | `structures/roads.ts` `surfaceRoute` ("the ground the resolver was told about and the ground that gets surfaced are one number") | a route's declared profile and its painted surface agree | true only where the claim was granted: on a column a tier-A pad or plane holds, the road declares its cutting, is refused, and paints at the height it was left with — a six-block step, and the audit reads the declared feet as buried (`F10-LOWER-SQUARE` §G) | F20: `GroundView.held` + `ROUTE_PINS_HELD_GROUND` (unit 19, landed off) | done — switch landed (unit 19), flipped (unit 20); the fourteen identical either way |
| 1.21 | `layout/ground-contract.ts` §7 `GroundReport` ("`TerrainCompileReport.stats` gains this optional `ground` section") | the report carries the resolver's claim table | only under `options.groundEquivalence` (test-only; `compile.ts` "read by nothing"): no anchor or fixture report has `stats.ground`; the product path computes the report in `freeze()` and drops it | note; wire `stats.ground` from the frozen resolve (S, report-only) | **done (unit 39)** — `stats.ground` is the frozen resolve's `GroundReport` on every product compile (hillside: 25 claim rows, 172 moved columns, 5 KB of a 12.6 MB report); pinned in `footprint-ground.test.ts`; payload-identical on the thirteen |
| 1.22 | `layout/district.ts` `LOAM-I512 DISTRICT_RUINS` ("N of N infill lots roll into ruined shells") | the district's ruin share | the roll is per infill lot; terrace lots (132 of 142 on the k1 metropolis) never roll, and `terrace`, `office`, `apartment_block` have no shell decay mode (`LOAM-W511` ×70 when asked, unit 26 probe) — zero buildings can ruin at `decline 0.92` | F22 / P6; the message now states the denominator (unit 26) | **done (units 36–37)** — terraces ruin bay by bay and the district rolls each run; the message names N of M terrace runs (F22 closed, `METROPOLIS-F4` §F) |
| 1.19 | `stdlib/structures/archetypes-classical.ts:47–55` | (deliberately leaves a head course air) | the highrise pattern's cousin; worth its own probe before touching | probe (S) | **done (unit 39)** — probed by read: the air head course is the file's own rule 7 (no interior column runs floor to ceiling — the lint's `interior.blocked_column`): a post of base + two courses under an air head, not the highrise door-head hole of 1.6; the F14 audit (unit 27) found no classical column among the real remainder. Keep |
| 1.14 | `layout/district.ts` `LOAM-I512 DISTRICT_RUINS` | "N of M infill lots roll into ruined shells" | the isometric shows intact boxes on the anchor and the fresh world alike | probe (M) | **done (unit 37)** — the intact boxes were the terraces (F4 → F22): 54 of the k1 metropolis's 66 runs now decay, the ruin field 0 → 40 151 columns |
| 1.15 | `docs/SITE-PLAN-v0.md` §3.7 | "One `SITE_STRIP_DISSOLVED` note names the strip…" | no such diagnostic existed | fix (S) | **done (unit 10)** |
| 1.16 | `docs/STOCKTAKE-WAVE-2B-v0.md` §B2 | "a core of ~⅓ [the kit's] size" | the fences are 12 % of the kit; the core is 88 % | keep-with-note (F16) | **noted (unit 12)** |

## 2. Abandoned approaches still wired in — half-migrated seams

(the spec's four; probed in unit 16, §8 `CLASS-2.md`)

| # | seam | belief | behaviour | disposition | status |
|---|---|---|---|---|---|
| 2.1 | the declare/build split (`structures/index.ts` `declareStructures`; GROUND-CONTRACT §1.6 pass 5b) | every pass declares, then builds, in tier order | a statement-order cut only: `enterTier` has no caller, so a bare pre-freeze `view()` is the baseline, and 79 % of structure blocks (121,277 of 153,720 on troy) are emitted at absolute y before `freeze()` | fix the inverted comment (S, done unit 16) or call `enterTier` at the tier (M) | comment done (unit 16); `pad.record` dropped (unit 17); the M — `enterTier` at the tier — → **P9** (unit 39) |
| 2.2 | report `blockSpans` vs the emitted world | "a return value nothing downstream reads" | read by `emit/walkability.ts` and the compile report; the blocks themselves match the world (120/120 sampled on troy, 0 mismatch) — the divergence is attribution: 363 positions double-written with 14 emitter flips, and 1,185 program blocks (the horse) outside every span | fix comment (S, done unit 16); record first-writer attribution + the excluded programs in `BlockSpan`'s doc (S, open); §12: fix or document, never assume away | **done (unit 39)** — `BlockSpan`'s docblock names its readers, first-writer attribution (363 positions, 14 emitter flips on troy) and the excluded programs (1,185 blocks) |
| 2.3 | the driver write-through (`layout/ground-driver.ts`) | "the mixture-period driver" whose `commit` writes through | `GROUND_V1_FREEZE = true`: `commit`'s write-through is dead; `plan.surface` is written outside the `write` guard by `structures/props.ts` and `programs/site-treatment.ts` | keep-with-note (S) now; rewrite (M) when `driverForPlan`'s users retire; the outside writes → proposal (M) | keep-with-note **executed** (unit 22: both outside writes noted at the site); the rewrite and the outside writes → **P9** (unit 39) |
| 2.4 | the kit files vs the compiler registries | "every archetype the building grammar knows" is in the kit | one-directional: **175 of 428 building archetypes (41 %) and 253 of 654 catalog entries (39 %) are never named in `settlement-author.md`**; 0 kit ids the registry lacks; form packs 18/18, fabrics and terrain verbs in step (E7's question, answered the other way: the kit under-names, F18) | add the missing rows (M); a kit-vs-registry drift check in the doc lint (S) | drift check done (unit 22, the ratchet at 175 / 253); the table fill (M) → **P10** (unit 39): a generator from the registries, not a hand fill of 428 rows into a kit F16 wants smaller |

## 3. Duplicated authorities — two places deciding one thing

(probed in unit 16, §8 `CLASS-3.md`)

| # | thing | deciders | the authority | disposition | status |
|---|---|---|---|---|---|
| 3.1 | heights | 19 deciders | GROUND-CONTRACT-v1 §1.1–1.5: one baseline, one resolve, one freeze | the pads decide twice (baked into the field, then re-declared as claims that cannot lose — WP-G3's undone half, `compile.ts:746–750` admits it): fix (L); the four-way `??` at `district.ts` `foundationY` with the election having collapsed `seatOnPlane`: rewrite (M); `buildings.ts` `floorY = foundationY + 1` never re-reading the frozen ground: keep-with-note + proposal (S); "`FRONTAGE_TIE` is off, which is every compile" comments: fix (S) | the S halves done (the D3 note, unit 24; the `FRONTAGE_TIE` comments, unit 17); the L (the pads decide twice) and the M (`foundationY`'s four-way `??`) → **P9** (unit 39) |
| 3.2 | placement | 10 deciders | `layout/solve.ts` for document nodes; the fabric for what it invents | the harbour reseat (`precincts.ts`) is a second authority half-published — `layoutOutcome.placements` never learns, so vegetation reserves, transition-avoid, land-use and program claims use the abandoned envelope: fix (M); seven independent `Placement` mints → one `makePlacement` (S) | P2 done (unit 17) — `makePlacement` at seven sites, payload-identical |
| 3.3 | palettes | 15 deciders | `terrain/palette.ts` `Palette` (defaults < theme < `style.palettes`) | two `resolveStreetStates` deciding `street.curb` with different fallbacks (rewrite, S); `roads.ts` `scoped` skip splitting kerb and border across themes (fix, S); two tables for the ground roles disagreeing for one theme (keep-with-note + agreement test, S); `materialKey` inlined four times (fix, S); intent silently outranking `style.palettes` against five docblocks (fix docs, S) | **done** — M1–M5 executed (units 17, 22, 23); this status lagged the §8 list and is corrected (unit 39) |
| 3.4 | `roofPlan(ctx)` — the roof-rebuild plan a fit-out builds over | one plan per archetype family | **25 private copies**, one per `archetypes-*.ts` (the arcane form: inset check + `top − base < 2`; the terminus form: `wallPlan` + the same check), each returning `null` in silence until unit 34 gave them a `skipped` sink | consolidate onto one exported `roofPlan` (byte-identical refactor, M); until then the 25 copies each name their reason (unit 34) | **done (unit 38)** — `RebuildPlan`/`wallPlan`/`roofPlan` exported from `archetypes-civic.ts`; 34 files' private copies removed, byte-identical on the thirteen |

## 4. Dead paths — shipped-true flags with dead off-paths, dead passes

| # | where | note | disposition | status |
|---|---|---|---|---|
| 4.1 | `STAIR_DRESS = false` | §12: kept as the flight object's vocabulary | keep-with-note | ruled |
| 4.2 | the stair-corpus off-path | §12: the ratified fallback until the native flight object | keep-with-note | ruled |
| 4.3 | `TERRACE_BY_TERRAIN`, `RIM_SEAT_MAX_DROP`, `TERRACE_STEP_SPAN` | "fallback-only since the election solve" | verify (§8), then delete or keep-with-note | see §8 |
| 4.4 | the Run's own switches at their shipped value (`SEAM_BLOCK_MIN_DROP`, `STRIP_FRONTAGE_BY_CLAIM`, `PLANNED_SITE_WHOLE_STRIP`, `LOT_PARCEL_OWN_STATIONS`, `STREET_FACE_ALONG_SIDE`, `PARK_BUDGET_BY_AREA`, `HIGHRISE_DOOR_HEAD_SOLID`, `OCEAN_FILL_CONTINUES`, `POOL_NEVER_LOWERS`) | each keeps the world it replaced recompilable; one line to undo | keep-with-note until the closing report; then a deletion ladder | open |
| 4.5 | junction-steps, silenced street-stairs/descent, terminus landings (the spec's list) | | probe, then delete (S each) | open |

## 5. Tests that pin nothing, goldens taught around bugs

| # | where | note | disposition | status |
|---|---|---|---|---|
| 5.1 | `empty-block-law.test.ts` census | re-pinned four times "with cause"; the numbers are a record, the law is `redrawn + dressed ≥ bare` | keep — the cause is written each time | noted |
| 5.2 | `walkability.test.ts`, `site-plan-*.test.ts` goldens | re-pinned at the frontage flip with per-unit readings; 15 worse per unit (F9) | keep-with-note; F9 owns the numbers | noted |
| 5.3 | a switch test that only asserts the constant's value | pins the ship state, nothing else — acceptable beside a pure-rule test, slop alone | keep where paired (all of the Run's are) | noted |

## 6. Doc drift — design docs asserting what the code no longer does

| # | where | note | disposition | status |
|---|---|---|---|---|
| 6.1 | `docs/SITE-PLAN-v0.md` §3.7 | amended (unit 10) | done | done |
| 6.2 | `docs/ELECTION-SOLVE-v0.md` §1.3.2 vs `SEAM_BLOCK_MIN_DROP` | see §8 | | see §8 |
| 6.3 | `docs/STOCKTAKE-WAVE-2B-v0.md` §B2 core size | see 1.16 | keep-with-note | noted |

## 7. Tool rot and instruction bloat

| # | where | note | disposition | status |
|---|---|---|---|---|
| 7.1 | `tools/session-log` | retired (unit 0) | deleted | done |
| 7.2 | `CLAUDE.md` 6.4 KB → 25 lines; funnel cells archived | unit 0 | done | done |
| 7.3 | `tools/worlds/RENAME-*.md`, `rerename-worlds.mjs` | one-off migrations kept beside live tools | probe, then archive (S) | open |
| 7.4 | `tools/golden-prompts/runs/` pre-Run directories (`noise-*`, `t204-after`, `menu-on-*`) | the noise floor's evidence; keep | keep-with-note | noted |

## 8. The unit-16 probes, verbatim

---

### CLASS-1.md

# Slop class 1 — belief vs behaviour (eight claims)

## 1. `BLOCK_MULTI_RECT`: "a grid quarter cannot move"
Claim: `packages/compiler/src/layout/district.ts:3216-3222`.
**Verdict: STALE** (the reasoning was never conditioned on the seam mask).
- The reasoning "a pitch-laid component fills its own bounding box" is a claim about a
  component of `blocked`. `blocked` is not just carriageway+sidewalk: every bounding seam
  is written into it (`district.ts:1837-1842`). A contour seam crossing a pitch-laid block
  leaves an L / staircase component that does **not** fill its bbox, so `rectsOf`
  (`district.ts:3411`) finds a second and third rectangle where the one-rect path
  (`blocksOf`, `district.ts:3025-3037`) took one. A grid quarter on a shelf is exactly that
  case — the "kerb-bounded mosaic" `SEAM_BLOCK_MIN_DROP`'s own doc describes
  (`district.ts:3236-3241`).
- Second, independent mover: `multiRect` is not only `blocksOf`'s argument. It is passed as
  `split:` to `cutDeepBlocks` (`district.ts:1871`, consumed at `district.ts:3111`), which
  cuts alleys, appends segments to the street graph and **re-grades the datum**
  (`district.ts:1884`). That path changes lots, terraces and levels on a grid quarter with
  no bbox argument to protect it. The gate `BLOCK_MULTI_RECT || declared.length > 0`
  (`district.ts:1864`) also means declared platforms take the same path regardless of the flag.
- Third, smaller: the sliver floor. `rectsOf` stops at `MIN_INFILL_SIDE` mid-sequence
  (`district.ts:3419-3420`) while `blocksOf`'s one-rect path applies it once
  (`district.ts:3035`); the two do not drop the same set of thin pieces.
- The byte-identity verification is real but narrow: `showcase-bayline` and
  `site-plan-hillside` are seamless/planned, not "every grid quarter".
Correction sentence: "A grid quarter with **no bounding seam** cannot move — a pitch-laid
component fills its own bounding box; once a seam is in `blocked` the component is not a
rectangle, and `multiRect` additionally drives `cutDeepBlocks`, so a shelf-sited grid
quarter does move (r5 metropolis, 68 → 66 terraces)."
Disposition: **fix comment** (rewrite that paragraph; keep the table). ~10 lines.

## 2. `TERRACE_BY_TERRAIN`: "nothing consults this value"
Claim: `packages/compiler/src/layout/types.ts:801-809`.
**Verdict: TRUE** (for the shipped configuration), with one wording nit.
Readers in `src`:
- `platforms.ts:565-566` — `terraceOn` is computed, but `derivePlatforms` returns from the
  `electionOn` branch (`platforms.ts:609,641`) before the criterion is read; the only other
  use is `platforms.ts:743`, inside the fallback body below the election return. Dead under
  `ELECTION_SOLVE = true`.
- `district.ts:4271 seatOnPlane` (uphill-rim exception, `RIM_SEAT_MAX_DROP`) — documented
  dead under the solve (`district.ts:4252-4258`); the seat is `planeY`.
- `district.ts:1575` is a comment, not a read.
- Tests: `test/terrace-by-terrain.test.ts:387,396,406` and `test/election-solve.test.ts:656`
  read the constant, and `platforms.ts:207`'s `input.terraceByTerrain` override exists only
  for them. So "nothing consults this value" is true of the compiler and false of the tests.
Correction sentence (nit only): "…nothing in the compiler consults this value; the tests
still do, through `input.terraceByTerrain`."
Disposition: **keep**, optionally a one-clause fix. ~1 line.

## 3. `mostlyWater` — the majority vote
Claim: `packages/compiler/src/layout/platforms.ts:385-395`, code at `platforms.ts:400-412`.
**Verdict: behaviour TRUE, promise STALE.**
- The code is exactly a strict majority (`wet * 2 > n`), and the comment says so.
- What the comment *promises* is a taste rule ("a bank with its toes wet is still a bank").
  What `SUBMERGED_BENCH_UNGRADED` needs is a **physics** rule: the T110 finding is a pad
  beside a lake grading the lake dry, i.e. a bench with a *minority* of wet columns still
  covers those columns with a plane and exposes a fluid face. A majority vote cannot catch
  a 40 %-wet bench; the safety-relevant predicate is "holds any water the plane would
  bury", not "is mostly water".
- Two comment blocks stack on one function: the orphaned `/** Is this set of columns water
  rather than ground? … */` at `platforms.ts:385-388` sits above `submergedBenches`'
  own doc — a leftover from a rename (class 7).
- Note: `scratchpad/t110/T110-PROBE.md` **does not exist in the repo** (untracked/deleted);
  it is cited from `platforms.ts` and `classify/index.ts:113`. Dangling evidence citations.
Correction sentence: "A strict majority — which is a taste rule about banks, not the
physics rule `SUBMERGED_BENCH_UNGRADED` needs: a bench with a wet *minority* still grades
those columns dry (T110)."
Disposition: **fix comment now; proposal for a wet-column-count test.** ~6 lines + a probe.

## 4. `W527 WALLED_QUARTER_SPARSE` — "the guard that should have caught it"
Claim: `packages/compiler/src/layout/district.ts:2502-2505`; guard body `district.ts:2513-2540`.
**Verdict: STALE** — unit 10 closed the planned path, one path is still blind.
- `layDistrict` has exactly two callers: `district.ts:929` (a document's district node) and
  `city-pass.ts:454` (one per city cell). The guard is inside `layDistrict`, so both reach it.
- The blind path is `walledQuarter` (`district.ts:449-452`): it returns true on
  `params.walls` or `intent.character.fortification === "walled"`. A city cell is laid from
  a **synthetic** `DistrictNode` (`city-pass.ts:379-392`) whose `params` are only
  `fabric/density/mix/blockSize/plaza` — `walls` is never copied. `CityParams.walls` exists
  (`packages/spec/src/settlement/types.ts:696`), so **a city walled by `params.walls` on the
  city node has every one of its cells measured as unwalled and W527 can never fire inside
  its circuit.** Only a city whose *intent* says `fortification: "walled"` is covered.
- Cells without fabric (parks, precincts) are `continue`d at `city-pass.ts:371-373` and hold
  no blocks — correctly unmeasured, but their columns are also absent from any city-level
  ratio, so a walled city that is mostly open precinct reads as fine.
- A `village` is a district that is not walled: silent by design (`WALLED_COVERAGE_FLOOR`
  doc, `district.ts:2151-2153`). Correct, not a hole.
Correction sentence: "Still blind inside a city walled by `params.walls`: the synthetic cell
node the city pass builds does not carry the city's `walls`, so `walledQuarter` says no for
every cell of it."
Disposition: **fix (propagate the city's `walls`/fortification into the synthetic cell node,
or ask the city node)**, plus a note in the comment. ~5 lines of code.

## 5. hillside — "the strip's arc length is the frontage it actually holds"
Claim: `packages/compiler/src/layout/forms/hillside.ts:811-815`; flag at `hillside.ts:143`.
**Verdict: TRUE, with the justification now inverted.**
- `stations` is counted over `frontage`, which under `STRIP_FRONTAGE_BY_CLAIM = true` is
  `claimableStations(held, depths, from, sign)` (`hillside.ts:821-826`), so the compacted
  count is the claimable frontage line, which is what the sentence asserts.
- But the sentence's *reason* — "a station that pinched out claims nothing" — is now the
  raster's reason, and the flag exists precisely because the raster under-reported: a
  station with positive probed depth is frontage even where no column rounded onto it.
  The comment reads as if `held` were still the authority.
- Other readers of the raster `held`: none. `held` is written at `hillside.ts:780,808` and
  read only at `hillside.ts:822` (and by `claimableStations`, `hillside.ts:151-156`).
  The residual mismatch is not another consumer but the per-column maps: `station`/`columns`
  are still raster-derived (`hillside.ts:812-814,832-835`), so a claim-only station can be
  allocated a lot with zero raster columns behind it — the mirror image of the old defect.
Correction sentence: "The strip's arc length is the frontage it can *claim* — the probe's
depths, not the raster's `held` — so a station that pinched out claims nothing and a
station the raster missed is still frontage."
Disposition: **fix comment; open a probe** on claim-only stations with no raster columns. ~4 lines.

## 6. highrise — "the doorway and its head course: opaque, always"
Claim: `packages/stdlib/src/structures/highrise.ts:407-409`; flag `highrise.ts:104`; guard
`highrise.ts:413`.
**Verdict: TRUE now** (`s > 0 || y > 2` writes wall at y3; the old `y > 3` left it air).
- Other consumers of `doorColumns` in the same file: `highrise.ts:970` (`fitBalconies`)
  skips door columns — correct and unrelated.
- Search across `packages/stdlib/src/structures/*.ts` for the same pattern: no other
  archetype grammar uses a `doorColumns` set or a `y > 3` door guard. `props-nile.ts:207`'s
  `y > 3` is a prop's height bound, not a door head.
- One neighbouring claim worth a probe, not part of this claim:
  `archetypes-classical.ts:47-55` states rank posts "leave the head course air" *on purpose*
  (to satisfy `interior.blocked_column`). That is a deliberate air cell of the same shape as
  the defect unit 9 fixed; if `floating.slab` ever lands over one, it is the same class.
Disposition: **keep** (comment now matches). One-line probe note for the classical ranks.

## 7. `computeOceanMask` — "`never` is honoured exactly as far as physics allows"
Claim: `packages/stdlib/src/classify/index.ts:99-103`.
**Verdict: STALE.**
- Under `OCEAN_FILL_CONTINUES = true` (`classify/index.ts:122`), a repaired column rejoins
  the fill queue and the sea drains *past* it. The honouring is therefore strictly weaker
  than the sentence describes: a `never` carve at the shore now loses not only its own
  column but every below-sea column behind it that the sea can now reach. The flag's own
  doc says this; the function doc above it still describes the pre-flag, stop-at-the-border
  behaviour ("any blocked column adjacent to water is flooded regardless").
- `overriddenNoFlood`: written at `classify/index.ts:169,185,197`, re-exported at
  `classify/index.ts:348,460`. **No compiler, CLI or render consumer reads it**
  (`grep` over `packages/*/src` finds only these five sites plus
  `terrain/compile.ts:811`, which passes the input `noFlood` mask, not the count).
  **No diagnostic reports it.** An author who wrote `flooded: "never"` and had it overruled
  — now with a fill continuing past it — is told nothing.
Correction sentence: "`never` is honoured only until physics overrules one column; from
that column the ordinary fill continues (`OCEAN_FILL_CONTINUES`), so a shore carve can lose
ground behind it as well as its own."
Disposition: **fix comment (2 lines) + proposal: a `LOAM-` note carrying
`overriddenNoFlood` when it is non-zero** (~15 lines, own unit).

## 8. ELECTION-SOLVE §1.3.2 vs `SEAM_BLOCK_MIN_DROP`
Claim: `docs/ELECTION-SOLVE-v0.md:91-96`; constant `packages/compiler/src/layout/district.ts:3264`.
**Verdict: TRUE as written, but the doc is now incomplete.**
- §1.3.2 is a statement about the *objective*: no count/churn term, `EDGE` convex. Nothing
  in `SEAM_BLOCK_MIN_DROP` touches the objective — it is a downstream consumer rule about
  which seams enter `blocked` (`district.ts:1834-1842`, `boundingSeams` at `district.ts:3271`).
  So the standing rule stands and needs no repeal.
- What has changed is the doc's *justification*: "churn **is** `EDGE(1)`, an extra terrace
  costing `n_ab · 1` along the seam it creates, priced by the boundary it actually adds."
  With `SEAM_BLOCK_MIN_DROP = 2` a one-block seam adds **no** block boundary — it is coping
  and a graded pad, not a wall — so the price the objective charges for that atom pair no
  longer corresponds to a boundary in the fabric. The objective still over-prices, harmlessly,
  the churn it is no longer causing (the r5 metropolis 45 → 55 terraces, `district.ts:3258-3260`).
Amendment: a short paragraph at the end of §1.3.2 (immediately after the standing rule at
`docs/ELECTION-SOLVE-v0.md:95-96`), cross-referenced from §5 where the seat simplification
lists the solve's downstream consumers: "`EDGE(1)` prices a kerb the fabric no longer treats
as a boundary — see `SEAM_BLOCK_MIN_DROP`. The term stays: it is convex, it is small, and
removing it would be a count term by another name."
Disposition: **amend doc**, ~6 lines. No code change.

---

### CLASS-2.md

# Slop class 2 — abandoned approaches still wired in

Read-only census of the four seams §8.2 names. Measured on
`docs/decks/troy_k1/trojan_horse_troy.loam.json` → `<scratch>/census/troy` +
`troy.report.json`; scripts in `<scratch>/census/`.

## Seam 1 — the declare/build split

**Where.** `packages/compiler/src/structures/index.ts:659` (`declareStructures`),
`:2037` (`buildStructures`), `:543-556`, `:1175`, `:1214`, `:2054`;
`packages/compiler/src/layout/ground-driver.ts:44,165,320-322,410-417,445,519-535`;
`packages/compiler/src/terrain/compile.ts:1064,1104-1105`;
`packages/compiler/src/layout/ground-geometry.ts:83`.

**Belief.** `GROUND-CONTRACT-v1.md` §1.6: `pass 5b DECLARE — every pass's
declare() half, run in TIER ORDER, with one resolve after each tier`, then
`pass 5e BUILD — every pass's build() half`. `ground-driver.ts:44`: `enterTier`
"seals one prefix resolve per tier boundary". `:411-415`: a tier-less `view()`
"is answered at the tier the stage is currently declaring — which is what makes
an un-migrated helper … read its own pass's legal prefix rather than a stale
baseline."

**Behaviour.**
- The split is a statement-order cut, not a tier-order rewrite — `StructurePlan`'s
  own doc (`index.ts:549-556`) says so.
- **`enterTier` has no caller.** Declaration (`:165`), implementation (`:445`),
  one doc mention (`:45`) — nothing calls it. So `currentTier` stays 0 forever
  and a bare `view()` before the freeze returns `prefixFor(0)`, which `:434-438`
  returns as **the baseline**. The comment at `:411-415` is exactly inverted.
  Two bare-`view()` callers: `structures/retaining.ts:3431` and
  `structures/index.ts:1089` (the latter already notes "here *is* the baseline").
- Tier order still holds, but by accident: `absorb` (`:525-531`) throws on a
  non-prefix arrival and `sealedThrough` is advanced by `prefixFor` (`:433`) —
  by whoever reads first, the dependency `enterTier` existed to remove.
- **The emitters never moved.** `buildBuildings` at `index.ts:1175` and
  `lay("buildings", …)` at `:1214` are inside `declareStructures`, before
  `groundDriver.freeze()` (`compile.ts:1104`). Measured: 121,277 of 153,720
  structure blocks (79%) are laid at absolute Y before the fifth resolve writes
  `plan.ground`. `index.ts:653` still calls this "WP-G5's risk note".
- `StructurePlan.buildingPaths` is carried with no reader, by explicit comment
  (`index.ts:2054-2057`).
- `"pad.record"` survives in `ground-geometry.ts:83`'s `BLOCKING_CLASSES` though
  no declarer emits the class (`ground-equivalence.ts:258`: "pad.record is gone").

**Consumers.** The report takes the *build* result (`compile.ts:1107`); ground
consumers read the frozen plan; declarations feed only the resolver. They agree
on levels and disagree on *when*: masonry is emitted against the pre-freeze plan
while ground consumers read the post-freeze one.

**Disposition.** (a) fix the inverted comment (**S**), or call `enterTier` at the
tier boundaries (**M**, byte-moving). (b) delete `"pad.record"` from
`BLOCKING_CLASSES` — **S**, expected byte-identical. (c) `buildingPaths` —
**keep-with-note, S**. (d) the emission move, WP-G6 proper — **proposal, L**.

## Seam 2 — report `blockSpans` vs the emitted world

**Where.** Written `structures/index.ts:1195`, `:1205-1212` (`lay`); rewritten in
place by `enforceRoadSovereignty` (`:2803`, `:2918-2998`); returned `:1978`,
`:2045`, `:2808`; surfaced at `terrain/compile.ts:1107` as
`report.layout.structures`. Read by `emit/walkability.ts:384` and
`test/ruins-green-skin.test.ts:689`.

**Belief.** `structures/index.ts:1194`: *"See {@link BlockSpan}. A return value
only; nothing downstream reads it."* §12: "the report's `blockSpans` are not the
emitted world."

**Behaviour and measurement** (153,720 blocks, 13 spans):
1. The comment is false twice: `walkability.ts:384` expands the spans into the
   clutter table's `AttributedBlock[]`, and the whole structure is serialised
   into every compile report.
2. **The blocks agree with the world.** 60 report blocks sampled in
   `world.troy_citadel.priams_megaron` + 60 in `world.troy_citadel.infill_29_34`
   (120 ≥ 40 required), `stateId` via `minecraft-data@1.21.11`, world read from
   the region files: **120 agree, 0 air, 0 different-block, 0 unreadable.**
3. **The divergence is attribution.** 363 of 153,357 distinct positions are
   written more than once; on 14 the first writer (what the report attributes)
   is not the last writer (what the world shows): `buildings→doorsteps` ×6,
   `buildings→props` ×6, `buildings→seam-finish` ×2.
4. **The icon is not in `blockSpans` at all.** The emitted structure layer is
   `structures.blocks ∪ programs.blocks` (`compile.ts:1584`), but
   `report.layout.structures` is captured before the program pass:
   `emit.structureBlockCount` 154,910 vs `blocks.length` 153,720 — the missing
   1,185 are `world.the_trojan_horse`, each `unattributed` to walkability.

The ruling's cause is therefore narrow: first-writer attribution over a
pre-program snapshot, not a false block list.

**Disposition.** (a) fix `index.ts:1194`'s comment — **S**. (b) record the two
divergences on `BlockSpan`'s doc — **keep-with-note, S**. (c) extend the report
snapshot (or `lay`) to cover `programs.blocks` — **fix, M**, report-only, world
byte-identical.

## Seam 3 — the driver write-through

**Where.** `layout/ground-driver.ts:1-36` (header), `:185-187`
(`createGroundDriver(…, true)`), `:208` (`driverForPlan`, unstaged), `:331`,
`:357-397` (`commit`), `:456-473` (`freeze`); `terrain/compile.ts:877,1104`.

**Belief.** The header calls this "the mixture-period driver" whose `commit`
"writes that answer back over the columns of its own intents"; §1.6 says the
write-through is deleted.

**Behaviour.** `GROUND_V1_FREEZE = true` (`layout/types.ts:753`) and the pipeline
driver is `staged: true`, so `commit` returns at `:365` and the whole body
`:367-396` is **dead on the world path**, alive only for `driverForPlan` (tests,
exhibits). `freeze()` copies the fifth resolve over the plan's three arrays
between `declareStructures` and `buildStructures`.

Writers of ground/fluid columns and whether each goes through the driver:

| writer | file:line | through the driver? |
|---|---|---|
| driver write-through | `ground-driver.ts:388-390` | dead when staged |
| the freeze | `ground-driver.ts:463-465` | it *is* the driver |
| `buildColumnPlan`, `settleFluidPool` | `terrain/columns.ts:199,253,759` | pass 5, before the baseline — legitimate |
| `paintPropPad`, `paintProgramSite` | `props.ts:979-980`, `site-treatment.ts:285-286` | guarded by `write`, false on the contract path |
| `exhibits/*` (6 files) | `infra*.ts`, `props.ts`, `context.ts` | off-pipeline dev worlds |
| `infra-route.ts:397`, `street-owner.ts:164` | — | local `Int32Array`s, not `plan` |

Nothing writes `plan.ground` after the freeze on the world path — **this seam is
substantially closed.** Two residues: (1) both painters write `plan.surface`
*unconditionally* (`props.ts:977`, `site-treatment.ts:283`), outside the `write`
guard and outside a contract that governs levels but not cap material; (2) the
documented finding at `retaining.ts:3419-3424` — post-seal `gradeBank` cannot
declare, so "the resolved field does **not** carry the ramp geometry … the
bank's earth is painted on ground the resolver never raised."

**Disposition.** `commit`'s dead write-through: **keep-with-note (S)** now,
**rewrite (M)** once `driverForPlan`'s users are retired. The `plan.surface`
write: document on both painters — **S**. The retaining post-seal ramp:
**proposal, M**.

## Seam 4 — the kit files vs the compiler registries

**Where.** `docs/kits/settlement-author.md` (4,492 lines), `terrain-author.md`
(893); `packages/spec/src/settlement/archetypes.ts:26`
(`KNOWN_BUILDING_ARCHETYPES`, 428), `packages/stdlib/src/structures/catalog.ts`
(`STRUCTURE_CATALOG`, 722 — 654 implemented, 68 `not_started`),
`packages/compiler/src/layout/forms/registry.ts` (7 forms), `EDIT_VERBS`,
`formPackIds`, `FARMSTEAD_ARCHETYPES`.

**Belief.** `archetypes.ts:20` — "Every archetype the building grammar knows";
the kit's twenty-odd `| archetype | tags | what it gets |` tables present
themselves as the author's whole vocabulary.

**Measured drift** — presence of each registry id anywhere in the kit text:

| registry | size | never named in the kit | kit names, registry lacks |
|---|---|---|---|
| `KNOWN_BUILDING_ARCHETYPES` | 428 | **175 (41%)** | 0 |
| `STRUCTURE_CATALOG` (implemented) | 654 | **253 (39%)** | 0 |
| `DISTRICT_FABRICS` + alias | 9 | 0 | 0 |
| urban forms | 7 | 0 | 0 |
| `formPackIds` | 18 | 0 | 0 |
| `EDIT_VERBS` (terrain kit) | 8 | 0 | 0 |
| `FARMSTEAD_ARCHETYPES` | 9 | 0 | 0 |

Never named, examples: `pigsty`, `sheepfold`, `orchard`, `vineyard`,
`threshing_floor`, `marketplace`, `treadwheel_crane`, `waystation`,
`hunting_lodge`, `smokehouse`, `false_front_saloon`, `stamp_mill`,
`telegraph_office`, `mission_church`, `star_fort`, `motte_and_bailey`,
`drawbridge`, `obelisk`, `amphitheater`, `viaduct`. Full lists in
`<scratch>/census/arch-missing.json` and `arch-drift.json`.

The drift is **one-directional**: the kit never invents an id the code lacks, so
nothing here is a code bug under law #3 — it withholds ~40% of a shipped
vocabulary from its only reader. Note also `docs/kits/settlement-core.md` +
`docs/kits/modules/` (39 files), generated from `settlement-author.md` by
`tools/golden-prompts/split-kit.mjs` and checked in — a second, silently
staleable copy of the same tables; `packages/agents/src/kit.ts:31` loads only
`settlement-author.md`, and the core/modules pair is E1's arm.

**Disposition.** (a) add the missing rows to the kit tables — **fix, M**.
(b) generate those tables from `STRUCTURE_CATALOG` so drift cannot recur —
**proposal, M/L**. (c) a drift check in the doc lint — **fix, S**. (d) name
`settlement-core.md`/`modules/` as generated in the kit header — **note, S**.

## Executable S items, in order

1. `structures/index.ts:1194` — replace "nothing downstream reads it" with the
   real readers (`emit/walkability.ts:384`, the compile report). Doc-only.
2. `layout/ground-driver.ts:411-415` — the tier-less `view()` comment is
   inverted; state that `currentTier` never advances because `enterTier` has no
   caller, so a bare pre-freeze `view()` is the baseline. Doc-only.
3. `BlockSpan`'s doc comment — record first-writer attribution (363 double-written
   positions, 14 flips on troy) and the excluded programs (1,185 blocks on troy).
   — done (unit 39): the `BlockSpan` docblock in `structures/index.ts`.
4. `layout/ground-geometry.ts:83` — drop `"pad.record"` from `BLOCKING_CLASSES`
   once no intent is confirmed to carry it; verify with `world-payload-sha.mjs`.
   — done (unit 17): payload-identical on the fourteen.
5. `structures/props.ts:977` + `programs/site-treatment.ts:283` — note that
   `plan.surface` is written outside the `write` guard and outside the contract.
   — done (unit 22): four-line notes at both writes.
6. A kit-vs-registry drift check in the doc lint, red at 175.
   — done (unit 22) as a vitest ratchet, `packages/compiler/test/kit-registry-drift.test.ts`:
   ceilings 175 / 253 (archetypes / implemented catalog entries never named), red
   when a registry grows without a kit line, lowered when the kit grows.
7. `docs/kits/settlement-author.md` header — name `settlement-core.md` and
   `modules/` as generated artifacts of `split-kit.mjs`.
   — done (unit 39) in `AGENTS.md`: the kit's own bytes are untouched (a header line
   would enter the prompt and owe the golden gate; the generated files self-declare).

---

### CLASS-3.md

# Slop class 3 — duplicated authorities (heights, placement, palettes)

Read-only archaeology at HEAD. Flags that matter, all `layout/types.ts`:
`FRONTAGE_TIE=true`(:412) `GROUND_PLANE_TIE=true`(:560) `ELECTION_SOLVE=true`(:890)
`GROUND_V1_RANKS=true`(:694) `GROUND_V1_SEAMS=true`(:713) `GROUND_V1_FREEZE=true`(:753)
`ROAD_SOVEREIGN=true`(:1321). Paths are relative to `packages/compiler/src` unless prefixed `stdlib/`.

## 1. Heights — the y a building is seated at

| # | path:line | reads | decides | overrides |
|---|---|---|---|---|
| 1 | `layout/solve.ts:1174` `referenceY` | candidate stats | `foundationY` for document nodes | — |
| 2 | `layout/solve.ts:1463` `padFor` | #1 | the solver's pad | — |
| 3 | `terrain/compile.ts:759` | terrain params+seed | `pristineValues` (v1 §1.2 baseline) | — |
| 4 | `terrain/compile.ts:761` `applyPadEdits` | #2 | **mutates the master field** | over #3 |
| 5 | `layout/street-datum.ts:252,370,393,426` `columnY` | pristine field, StreetGraph | carriageway plane — *datum* | — |
| 6 | `layout/platforms.ts:433` + `layout/election-solve.ts:588` | #5, pristine, `GROUND_TIE_SPAN` | `GroundLevels.levelY` — *datum* | — |
| 7 | `layout/district.ts:2438` `seatOnPlane(planeY,tied) ?? cell?.foundationY ?? tied ?? medianGround(input.field,rect)` | #6, city seat, #5 via `frontageSeat`, **padded** field | every fabric building's `foundationY` | last-wins in one `??` |
| 8 | `layout/district.ts:2329,:2351` | #6 | `quarter.plane` pads | — |
| 9 | `layout/district.ts:2473` | #7 | the lot's `building.footprint` pad | — |
| 10 | `layout/city-pass.ts:393,:626`, pads `:422,:437,:659` | padded field | cell / vista seats | — |
| 11 | `terrain/compile.ts:791` `applyPadEdits` | #8–#10 | **mutates the field again** | yes |
| 12 | `terrain/compile.ts:808` `classify` re-run | padded field | biomes | yes (v1 §1.2 deletes this line) |
| 13 | `terrain/compile.ts:856` `buildColumnPlan` | **the padded field** | `plan.ground` | — |
| 14 | `terrain/compile.ts:864` `groundBaseline` | #13 | the resolver's "pristine" argument | — |
| 15 | `terrain/compile.ts:1017` `declarePads`→`layout/ground-declarers.ts:127` | #2,#8–#10 | rank-10/15 claims | no — restates #14 |
| 16 | structure passes, tiers A→D (`layout/ground-contract.ts:203`) | `driver.view(tier)` | ranks 0–140 | by rank, first-writer-wins |
| 17 | `terrain/compile.ts:1104` `freeze()`→`layout/ground-driver.ts:456-470` | #14+#15+#16 | writes the resolve over `plan.ground` | over #13 |
| 18 | `structures/buildings.ts:300` `floorY = foundationY + 1` | #7/#1 only | **the walked floor** | ignores #17 |
| 19 | `structures/buildings.ts:598` `skirtDepth` | post-freeze `plan.ground` | underpinning that hides an #18/#17 gap | — |

**Named authority** — `docs/GROUND-CONTRACT-v1.md` §1.1–§1.5: one pristine baseline,
one `resolveGround` over `INTENT_RANK`, one freeze. Datums (`StreetDatum`,
`PlatformDatum`, `SeatDatum`, `PlaneDatum`) propose; the resolver decides. §1.5
assigns the lot pad to `building.footprint`(10), the platform run to `quarter.plane`(15).

**Duplicates**

- **D1 — the pads decide twice.** #4/#11 bake pads into the field, #13 materialises
  the plan from that field, #14 snapshots it as the baseline, #15 then declares the
  same numbers as claims. The claims cannot lose — not by rank, but because the
  baseline already holds their answer. v1 §1.2 requires `buildColumnPlan` to read
  `terrain.pristine`; `compile.ts:746-750` admits it does not ("the plan below is
  still built from the padded field"). WP-G3's undone half; the largest class-3 item.
- **D2 — the four-way `??` at `district.ts:2438`.** The code names its own defect
  twice (`:2408` "two answers to one question is the defect class"; `:4257` "a second
  answer here would be the defect class"). With `ELECTION_SOLVE` on, `seatOnPlane`
  (`:4271`) collapses to `planeY`, so `tied` — the `SeatDatum`/F4–F7 answer — reaches
  only lots on **no** platform: the doc's `SeatDatum` row is half-wired. The last
  fallback `medianGround(input.field, …)` is a fourth authority reading #4/#11's output.
- **D3 — `foundationY` vs the frozen ground.** #18 never re-reads #17; #19 is a
  mitigation, not an authority. Nothing asserts the two agree, so a rank-0
  `fluid.channel` or rank-20 `precinct.ground` winning a footprint column is invisible
  until a walk.
- **D4 — comments inverted vs the flags.** `props.ts:178,:446`,
  `structures/index.ts:1446,:1922`, `district.ts:2413`, `roads.ts:233`,
  `layout/types.ts:467,:523,:589` all say "while `FRONTAGE_TIE` is off, which is every
  compile"; it is `true`. (Also class 1/6; listed because it makes the chain unreadable.)

**Disposition** — D1 **fix / L** (it is WP-G3: point `buildColumnPlan` at
`pristineField`, delete the `:808` re-classify, let pads win at 10/15; byte-moving,
needs the probe harness). D2 **rewrite / M**, one named `seatDatum(...)` whose last
resort reads `pristine`, not `input.field`; after D1. D3 **keep-with-note + proposal /
S** for the note — a post-freeze `foundationY` vs `resolved.ground` delta diagnostic.
D4 **fix / S**, comments only.

## 2. Placement — where a node's translation is decided

| # | path:line | reads | decides | overrides |
|---|---|---|---|---|
| 1 | `layout/solve.ts:1166-1186` `commit` | candidates, constraints, cost | `translation` for every document node | base authority |
| 2 | `layout/solve.ts:711` `landmarkCoarseSeat` | coarse `at`/`zone` target | landmark seated despite a ground veto | rung inside #1 |
| 3 | `layout/solve.ts:772` `landmarkCoarseRing` | same target, `COARSE_RING_*` | nearest feasible ring site | rung inside #1, never worse (`:786`) |
| 4 | `layout/solve.ts:1140` `LANDMARK_COARSE_ABANDONED` | #1 vs target | *reports* cost outbidding intent | report-only |
| 5 | `layout/district.ts:1986` `claimSite`/`:4438`, `frontageOf:4300`, `frontAnchorOf:4160`, `seat(...)` `:2399` | block walk, lots, faces | fabric building rects | one pass, derivation |
| 6 | `layout/city-pass.ts:394,:627` | cell masks, vista axes | cell + vista placements | — |
| 7 | `programs/pass.ts:412` `resolveSites`→`programs/place.ts:420` | plan, claimed rects | `ProgramSite.footprint` | — |
| 8 | `structures/precincts.ts:1560-1586`, used `:1005,:1013,:1161` | plan, shoreline read | **a new `Placement`** for a harbour with no quay in its envelope | **yes, over #1** |
| 9 | `structures/index.ts:772-774` | #8's `relocations` | substitutes it for the structure passes | yes |
| 10 | `programs/road-anchors.ts:149,:220` | `placement.foundationY` | door anchors the road pass routes to | reads only |

**Named authority** — `AGENTS.md` ("placement comes from envelopes, constraints and
ports resolved by the layout solver") + `docs/DESIGN.md`: `layout/solve.ts` places
document nodes, the fabric places what it invents inside its own footprint, nothing
downstream moves a node.

**Duplicates**

- **P1 — the harbour reseat is a second placement authority, half-published.**
  `structures/index.ts:772` substitutes the relocation into a *local* list;
  `terrain/compile.ts` never gets it back. `layoutOutcome.placements` (set `:825`) is
  still the solver's list and feeds `compile.ts:1203` (vegetation `reserved`),
  `:1246` (transition footprints), `:1422` (`transitionAvoid`), `:1484`
  (`landUseMaskOf`), `:1492`, `:2317` (program `claimed`). A relocated harbour is
  tree-avoided at the envelope it abandoned and planted on the quay actually built; the
  report prints the abandoned translation. `relocatedHarbourNote` (`precincts.ts:1637`)
  at least declares it.
- **P2 — six independent `Placement` mints**, each with its own `foundationY` rule:
  `solve.ts:1175`, `district.ts:2440`, `city-pass.ts:394`, `:627`,
  `exhibits/context.ts:542`, plus literals at `precincts.ts:1572`, `farm.ts:2254`. Any
  new invariant (D3's lint) must be added seven times.
- **Cleared, not duplicates**: #2/#3 are an ordered ladder in one function;
  `frontageOf`/`frontAnchorOf` have one definition each; program sites resolve once
  (`pass.ts:412`) and are reused by `executeSites` (`:511`); `stats.programs[].sites`
  is report-only (`district.ts:598`).

**Disposition** — P1 **fix / M**: return the substituted `placements` from
`buildStructures` and adopt them into `layoutOutcome` before pass 6; moves blocks on
any world with a relocated harbour, needs a probe + baseline pass. P2 **fix / S**: one
`makePlacement(...)` helper, seven call sites, byte-identical by construction.

## 3. Palettes — where a block's material is decided

| # | path:line | reads | decides | overrides |
|---|---|---|---|---|
| 1 | `terrain/palette.ts:880` | `DEFAULT_PALETTE` + `style.palettes` | the base symbol table | `style.palettes` wins |
| 2 | `terrain/palette.ts:884` `authored` | `style.palettes` keys | what `derive`(`:782`) may never touch | — |
| 3 | `terrain/compile.ts:1766-1768` | `character.palettes` | merges **over** `style.palettes` | **yes — inverts #2** |
| 4 | `structures/index.ts:3530` `themeOverride` | `style.palettes["theme"]` | the declared theme | — |
| 5 | `structures/index.ts:874` `fanOut`→`structures/themes-intent.ts:185-196` | `character.materialTheme`, era | the actual theme; returns before the `ctx.today` guard at `:193` | **yes, over #4 — the `:193` comment claims the opposite** |
| 6 | `terrain/palette.ts:660` `groundMaterials` | `GROUND_MATERIALS_BY_THEME`(`:471`, 6) else `deriveGroundMaterials`(`:601`) | the 12 built-ground roles | table beats derivation |
| 7 | `terrain/palette.ts:1018` `defineGroundRoles` | #6 | writes `street.sidewalk`, `street.curb`, `road.step`, `ground.*` | refuses #2 |
| 8 | `terrain/palette.ts:1005` `defineGreenSkinSymbols` | `GLOW_LICHEN_THEMES` | `foliage.glow_lichen` | refuses #2 |
| 9 | `terrain/palette.ts:327` `streetMaterials` + `:254` table (same 6 themes) | theme id | the carriageway family — a second table, never derived into the palette | — |
| 10 | `structures/roads.ts:3564`(`:3580,:3601`) `resolveStreetStates` | palette, else #9, else rural | road surface, kerb, gutter, marking | `scoped=true` **skips the palette** (`:3587`) |
| 11 | `structures/streetscape.ts:509`(`:520-522`) `resolveStreetStates` | palette, else `DEFAULT_SIDEWALK_BLOCK`/`DEFAULT_CURB_BLOCK`(`:240-244`) | sidewalk, kerb, crossings | never theme-scoped |
| 12 | `terrain/columns.ts:184-215` | palette symbols | the natural ground | — |
| 13 | `stdlib/structures/decay.ts:347`,`:1134` | the fit-out's materials | ruined substitutions | one table |
| 14 | `structures/green-skin.ts` | finished ground + theme symbols | moss/lichen/pavement substitutions | last word on its cells |
| 15 | `structures/index.ts:2946,:2977` (`ROAD_SOVEREIGN`) | post-freeze `plan.ground` | *drops* foreign blocks over the carriageway | last word, by deletion |

**Named authority** — `terrain/palette.ts:725-762` + `structures/index.ts:882-888`:
`DEFAULT_PALETTE` < theme derivation < `style.palettes`, resolved once before any pass
reads a symbol. Every subsystem asks the palette; theme tables are fallbacks only.

**Duplicates**

- **M1 — two `resolveStreetStates`.** `roads.ts:3564` and `streetscape.ts:509` both
  resolve `street.curb`, with different second authorities: the theme table (#9) vs
  hard-coded `stone_bricks`/`smooth_stone` (`streetscape.ts:240-244`) — the exact two
  blocks `palette.ts:344-350` names as the "one contiguous carved stone monolith"
  defect. They agree today only because #7 always fills `street.curb`.
- **M2 — the `scoped` hole.** `roads.ts:3587` skips the palette for a district with its
  own theme, so its border course comes from #9 while the sidewalk kerb beside it comes
  from #7 (the **root** theme) — breaking the invariant `palette.ts:220-224` states in
  as many words ("one continuous course of one material").
- **M3 — two tables for one family.** `GROUND_MATERIALS_BY_THEME`(6) and
  `deriveGroundMaterials` (~60 lines of greedy allocation) both answer "the 12 roles for
  this theme". `stdlib/structures/themes.ts:776` ships 7 themes, so the derivation is
  reachable for exactly one — `modern_city` — and for that one it does **not** produce
  `MODERN_GROUND_MATERIALS`, the table that exists for it. Same shape for
  `STREET_MATERIALS_BY_THEME` vs `MODERN_STREET_MATERIALS`.
- **M4 — `materialKey` inlined four times.** `stdlib/structures/themes.ts:828` exports
  it; the identical template literal is re-written at `stdlib/structures/highrise.ts:810`,
  `terrace.ts:815`, `core.ts:1662`, `core.ts:2491`. `structures/index.ts:2827` calls the
  real one.
- **M5 — intent beats `style.palettes` (#3, #5)** while `roads.ts:3558`,
  `structures/bridge-styles.ts:140`, `palette.ts:173,:736` and `structures/index.ts:888`
  all assert `style.palettes` "is still the last word". `themes-intent.ts:187` and `:193`
  contradict each other in eight lines.

**Disposition** — M1 **rewrite / S** (one `resolveGroundRoleStates`; byte-identical
while #7 fills every role, which it does). M2 **fix / S** (exempt `street.curb` from the
`scoped` skip, or scope the sidewalk kerb too). M3 **keep-with-note / S** (a test that
table and derivation agree over `ALL_MATERIAL_THEMES` — it either pins the derivation or
retires it). M4 **fix / S**. M5 **fix (docs) / S**, **proposal** for the code half: the
reversible default is to correct the five comments and file the precedence question.

## Executable S items

1. **M4** — replace the four inlined `materialKey` literals with `materialKey(r.materials)`. — done (unit 17).
2. **P2** — one `makePlacement(...)` helper; seven call sites. — done (unit 17).
3. **M1** — collapse the two `resolveStreetStates` ground-role branches onto one resolver.
   — done (unit 22): `streetscape.ts` resolves `street.curb` as palette symbol > `streetMaterials(theme).kerb` > default, `theme` threaded from `structures/index.ts`; `DEFAULT_CURB_BLOCK` deleted; payload-identical. Sidewalk/subsurface/crossing keep their constants (the table has no such roles).
4. **D4** — correct every "`FRONTAGE_TIE` is off, which is every compile" comment. — done (unit 17): 8 comments.
5. **M5 (doc half)** — correct the five "`style.palettes` is the last word" docblocks and
   the contradictory comment at `themes-intent.ts:193`. — done (unit 17); `palette.ts:958,:999` carry the same claim, untouched.
6. **M3** — the table-vs-derivation agreement test over `ALL_MATERIAL_THEMES`.
   — done (unit 22): `packages/compiler/test/ground-materials-tables.test.ts` (5). The table now covers 7 of 7 themes, so the derivation is unreachable in a compile; and it diverges from the table in **every** theme (ten solid roles each; `boreal_pine` + `bank`, `xeno_resin` + `bank` + `scree`) — pinned as the finding, not a design. No street derivation exists.
7. **M2** — exempt `street.curb` from the `scoped` palette skip (`roads.ts:3587`). — switch
   `KERB_SYMBOL_UNSCOPED` landed off (unit 22), attributed on the fourteen — two move,
   the pirate cities' scoped districts, each an exact kerb swap polished diorite → andesite —
   and flipped (unit 23). Done.
8. **D3 (note half)** — a post-freeze `foundationY` vs `resolved.ground` delta note.
   — done (unit 24): probed first on the thirteen (`scratchpad/d3/probe.mjs`, `groundEquivalence: true`): every declared `building.footprint` column is satisfied, adjusted 0, refused 0, on every document; the columns where a placement's footprint does not match `foundationY` are columns no intent claimed (quays, precincts — not pads). `LOAM-I501 FOOTPRINT_GROUND_LOST` (a note, from the frozen resolve's own report) and `test/footprint-ground.test.ts` pin it.
