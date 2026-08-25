# THE STOCKTAKE RUN — ledger

STATUS: RUNNING

Spec: `docs/STOCKTAKE-RUN-SPEC.md` (immutable). This file is the Run's only
running state. The NOW block is rewritten at the end of every turn.

## NOW

- **In flight:** nothing — unit 18 (F10 probed: the orphans are one severed
  island, not parcel ownership; F20 opened) is committed.
- **Next unit:** unit 19 — **F20, a routed lane across a retaining edge**
  (`docs/decks/anchors/F10-LOWER-SQUARE-2026-08-25.md` §D). Diagnosis
  first, in code: where the road router costs a step (does it see the
  district's retaining edges / level seams at all?), and what the road
  emitter does when a route's profile drops more than its stair rule allows
  (it laid nothing on two columns, silently). Then the smallest honest fix
  behind a switch (law 5, landed off, attributed on the fourteen): the
  router treats a level-seam crossing as a cost it can only pay where a
  flight fits, and/or the emitter lays a flight (the seam mechanism's
  `tiered` stack has one) or warns (`LOAM-W…`, new code from the free
  numbers). Re-test with `scratchpad/f10/boundary.mjs` on the hillside
  fixture at `LOT_PARCEL_OWN_STATIONS` on (dist-patched): the 875-column
  island must join main. Then census batch two (M1, M2 by law 5, M3, class-2
  S5/S6, D3 note), F4, F14, F17; §10.5 probe prompts; the remaining
  stations.
- **Last commit:** 9528b7a (unit 17). Convention: this line names the
  previous unit's commit; the current unit's commit is HEAD.
- **Spend:** $8.19 of the $35.00 OpenRouter cap (Run-only; log-derived, D4).
- **Open decisions for Kai:** none. (Post-hoc veto open on D12, D19, D25,
  D32.)
- **Findings queue (law 1: bugs before anything else):**
  - F1 — T110: fixed for four of five; open on #5 (P4).
  - F2 — anchors at HEAD: all four attributed (units 4, 8).
  - F3 — metropolis authoring regression, lost 3-of-3; E2.
  - F4 — `LOAM-I512` "ruined shells" vs intact boxes — street-level probe.
  - F5, F6, F7, F11, F12, F13 — fixed (units 5–10).
  - F8 — `frontageLots` drops (~70 % starvation → F10, ~30 % geometry → P1).
  - F9 — new hillside lots' cut faces undressed (P2); walkability audit
    reads zero entrance reach on montfort/walled — instrument gap.
  - F10 — probed (unit 18): the 24 % is one island, `lower_square` and its
    lanes, cut by F20; two-phase growth withdrawn; the flag stays off.
  - F14 — pre-existing physics findings on shipped worlds; one physics
    unit, probe first.
  - F15 — the icon metric's before-sample alarms (horse/citadel dominance,
    the redwoods' measure, the farm town's hull density; the rail gantry).
  - F16 — the kit's core is 88 % of the kit; a smaller kit is a prose job.
  - F17 — the walled city's keep authored in 1 of 3 kit rolls; kit-teaching.
  - F18 — **the kit never names 175 of 428 building archetypes (41 %) and
    253 of 654 catalog entries (39 %)**; zero the other way. E7's "is the
    model drowning?" is answered from the other side: the kit under-names
    (census 2.4; a table fill is M, a generator is a proposal).
  - F19 — **79 % of structure blocks are emitted at absolute y before the
    ground freezes** (`enterTier` has no caller; the declare/build split is
    a statement-order cut) — the GROUND-CONTRACT migration's undone half;
    proposal (L) with the pads' double authority (census 3.1).
  - F20 — **a routed lane that crosses a retaining edge is laid to the edge
    on both sides and not across it** (six blocks over two columns, no
    flight, no diagnostic); the square and its three lanes become an island
    (875 columns on the hillside fixture at own-stations on). Router and
    emitter, unit 19.
## DECISIONS

(every fork taken: the reversible default chosen, why, and how to undo it)

- **D0 (unit 0):** pruned 21 stale worktrees (scratchpad measurement trees
  on detached heads, the redundant perf worktree, the agent worktree). Their
  uncommitted diffs were flag toggles and probe edits superseded by landed
  commits; dumped to `<scratchpad>/pruned-worktree-diffs.patch` (334 KB,
  session-temp) before removal. Branches untouched (`perf/compile-ladder`,
  `claude/empty-block-freerect`, `freeze/*` all still exist). Undo: not
  needed — nothing on a branch was lost.
- **D1 (unit 1):** before-sample layout — documents + harness-shaped records
  in `tools/golden-prompts/runs/before-sample/` (so `score.mjs` reads them),
  generate logs in `docs/decks/before-sample/`; worlds and renders not
  committed (deterministic from commit + document; renders sit in the
  session scratchpad `b0/renders/`). Undo: n/a.
- **D2 (unit 1):** railway_town's refused emit was compiled with
  `--allow-unstable` for the record and marked as such; the T110 failure is
  finding F1 and is NOT assumed to be the parked "sealess-river T112→T110"
  item until probed. Undo: delete the unstable log; nothing depends on it.
- **D3 (unit 1):** the three anchor-commit worktrees (`wt-9b4dd50`,
  `wt-25e5e68`, `wt-200209b` under `<scratchpad>/anchors/`) are kept for
  unit 2's bisection despite the housekeeping rule; pruned when G3 closes.
  Undo: `git worktree remove <path>`.
- **D4 (unit 1):** spend is log-derived (the generate log's authoring
  summary + its programs block), not read from the provider dashboard, and
  is the ledger's number.
- **D5 (unit 2):** to reach the §6 3-of-3 standard on the metropolis
  authoring regression, the k1 deck document (same kit bytes c22cb4fe) counts
  as roll 2 and one authoring-only harness roll was bought as roll 3
  (`tools/golden-prompts/runs/metro-roll3/`, $0.10). Undo: n/a.
- **D6 (unit 2):** G3-metropolis is read **WORSE**, not "attributed and
  not-worse", although every commit in the staircase is ratified and two of
  them re-pinned the census "with cause" — law 1 outranks a commit's own
  acceptance of its baseline movement; the tower mass is the T6 icon. Undo:
  Kai's post-hoc veto via this ledger.
- **D7 (unit 2):** the authoring regression (F3) is NOT answered by touching
  the kit now; law 9 — the before-sample exists, and kit bytes move only
  under the pre-registered experiments (E1–E3). Undo: n/a.
- **D8 (unit 2):** the anchor renders and the fresh-world isometrics stay in
  the session scratchpad (`anchors/renders/`, `b0/renders/`); the verdict
  cites them by path and the worlds regenerate from (commit, document).
  Undo: n/a.
- **D9 (unit 3):** the lever for F2-metropolis is a minimum drop for a
  platform seam to split a block (`SEAM_BLOCK_MIN_DROP`), NOT a change to
  the election's weights or partition — the weights are walk-pinned and
  `docs/ELECTION-SOLVE-v0.md` §1.3.2 forbids a non-convex churn term, and
  the codebase's own `TERRACE_STEP_SPAN` comment already calls a one-block
  step absorbed by kerb, doorstep and `FRONTAGE_RISE`. `3` was tried and
  rejected by the physics lint (a 2-block seam holds water). Undo: delete
  the constant and the two `continue`s (byte-identical at 1 anyway).
- **D10 (unit 3):** the switch lands in its own commit at the off-state
  (law 5), FULL suite run for it; the flip gets its own commit, test,
  shasums, renders and suite (unit 4). Undo: n/a.
- **D11 (unit 4):** `empty-block-law.test.ts`'s pinned census (bare 162 /
  redrawn 5 / dressed 152, itself re-pinned twice before "with cause") is
  re-pinned a third time at bare 38 / redrawn 14 / dressed 26 with the cause
  written in the test, in its own convention — the flip *answers* the
  fixture's bare blocks, it does not hide them. Undo: revert the test hunk.
- **D12 (unit 4):** the 13 r5 terraces still lost at 2 are NOT chased:
  seven are two-block walls (the trial at 3 released water), three fell to
  `BLOCK_MULTI_RECT` / the empty-block law / the leaf cap, three span mixed
  election relief — each a ratified law; the residual (−13 % building blocks
  vs the anchor) is accepted and written down. Undo: Kai's veto here; a
  proposal per law if he wants them back.
- **D13 (unit 4):** the FULL suite at the flipped bytes had exactly one
  failure, the D11 census; the file was re-run green after the re-pin
  rather than the whole suite (same dist, same test set, one expectation
  changed). Undo: n/a.
- **D14 (unit 5):** montfort's cause was established by instrumenting a copy
  of the built planner (dist patched under an env guard, restored
  byte-for-byte, sha recorded) rather than by reading the code alone — law 4;
  the probe's classification of every refused station is committed verbatim
  in `docs/decks/anchors/MONTFORT-HILLSIDE-2026-08-25.md` §E. Undo: n/a.
- **D15 (unit 5):** the fix is "a station with claimable depth is frontage"
  (`STRIP_FRONTAGE_BY_CLAIM`), NOT a change to the nearest-point tie or to
  `minStripRun`/`TERRACE_RISE` — the tie is `SweptProfile`'s band rule and
  the constants are Sol's, both ratified; the belief the comment states
  ("the frontage it actually holds") is what the code is made to do. Landed
  off with fourteen-of-fourteen byte-identity. Undo: delete the constant,
  the helper and the one ternary.
- **D16 (unit 5):** the law-5 set for hillside work is the nine worlds plus
  five hillside documents (three `examples/` fixtures, montfort_k1, the
  before-sample walled city); references live in `bi/ex-off5/SHASUMS`.
- **D17 (unit 6):** the wall circuits' new shapes are read not-worse by the
  ratified built-hull law (`fabric-hull.ts`, Kai's 2026-08-11 Troy walk):
  more town, tighter wall. Undo: n/a (a law, not a choice made here).
- **D18 (unit 6):** two more switches (`LOT_PARCEL_OWN_STATIONS`,
  `PLANNED_SITE_WHOLE_STRIP`) land OFF in the same commit as the frontage
  flip — the probe that found them ran on the flipped dist and their
  off-state is byte-identical to it on all fourteen documents; their flip is
  unit 7. Undo: delete the two constants and their branches.
- **D19 (unit 6):** the frontage flip lands although the steep fixture's
  goldens read worse per unit on reachability and clutter (15 of 69
  re-pins) — the loss is attributed to the parked shoulder/verge debt on
  the new lots (F9/P2), the named worlds' own dressing counts improve, and
  the T4 gain is an order of magnitude. Written in the tests' own
  convention and in `MONTFORT-HILLSIDE-2026-08-25.md` §H. Undo: Kai's
  veto; one constant to revert.
- **D20 (unit 7):** Node on this machine moved 26.5 → 26.7 mid-Run and
  changed every compressed byte of every world while every payload stayed
  identical; byte-identity is henceforth read with
  `tools/worlds/world-payload-sha.mjs` (decompressed payloads), recorded in
  `AGENTS.md`. Earlier units' "identical" claims were all within one Node
  and stand. Undo: n/a.
- **D21 (unit 7):** `LOT_PARCEL_OWN_STATIONS` stays OFF: isolated by
  toggling, it alone orphans 24 % of the hillside fixture's walkable plane
  (F10). The both-on re-pin pass (51 assertions) was discarded and the
  three golden files restored to unit 6's; the pass is kept in
  `scratchpad/REPIN-UNIT7.md` as F10's before/after record. Undo: flip it
  and re-pin — not recommended.
- **D22 (unit 7):** `PLANNED_SITE_WHOLE_STRIP` ships ON with the landmark
  seated at its own footprint on the street edge (`landmarkSeat`) — no
  law-5 document moves (diagonal geometry, P1), so it lands on its
  correctness, not on numbers; the walled city's church stays `E170` until
  P1 or F10. Undo: one constant.
- **D23 (unit 8):** the Hellenist density fixes are two switches, both off
  (law 5), trialled alone and together on six documents: the fixes are the
  probe-named causes (park budget by land; a side scanned middle-out for
  its street), not a change to the cell kits' densities or block sizes,
  the arterial take, or the lot rhythm — none of which the probe found
  binding. The 45° block geometry is a proposal (P3). Undo: delete the two
  constants and their branches.
- **D24 (unit 8):** the hellenist anchor's diff at HEAD is read not-worse
  (+9 buildings; the colossus moved 116 blocks by the solver's documented
  soft `at` cost) and the E2 placement question goes to the icon metric
  rather than to a compiler change. Undo: Kai's veto.
- **D25 (unit 9):** the highrise head-course fix (`HIGHRISE_DOOR_HEAD_SOLID`)
  ships ON in the same commit as the city flips that exposed it, without a
  separate off-state commit: the physics gate was red at the flip and a red
  gate does not land; the constant keeps the old guard reachable; the
  movement is exactly the head-course cells over highrise doors on three
  documents (+14, +4, +8 blocks), attributed, with no placement or
  diagnostic moving. Law 5's letter ("flip separately") is bent once, its
  purpose (attribution) kept. Undo: one constant; Kai's veto open.
- **D26 (unit 9):** pre-existing physics findings on the shipped worlds
  (F14) are not chased in this unit — the gate pins the fixtures, the
  committed baselines' `floaters` show these predate the Run — and go to a
  physics unit of their own, probe first. Undo: n/a.
- **D27 (unit 10):** `SITE_STRIP_DISSOLVED` takes `LOAM-I499` — the next
  free number beside `DISTRICT_FORM_ALIAS` I498 in the site-plan block; the
  design doc named the note but no number, so SITE-PLAN §3.7 is amended to
  record it. Forms carry per-event notes on `FormPlan.notes`, forwarded by
  `layDistrict`; no form gains a diagnostics channel of its own. Undo: n/a.
- **D28 (unit 10):** the planned-path `W527` measures against the land
  inside the streets (natural ground included) rather than against strip
  land, because the natural ground inside the wall is the sparse part;
  diagnostics change the report only — no switch, worlds payload-identical.
  Undo: revert the branch.
- **D29 (unit 11):** the icon lists live in `prompts.json` beside each
  prompt, written from the prompt text; the metric's thresholds (height
  ≥ 1.5×, footprint ≥ 2×, program volume ≥ 4× the median building;
  `densityFloor` 15 for cities, 6–8 for towns, 2–4 for camps and villages,
  0 for terrain) are alarms printed with their ratios, never the verdict
  (law 7). Terrain icons are a document read and say so; a settlement with
  no district is read against its buildings' own hull and says so. Undo:
  edit `prompts.json`.
- **D30 (unit 11):** the metric compiles each document in-process rather
  than reading a stored report, so a run directory from `run.mjs`
  (authoring-only) scores at the current compiler — which is the point:
  the same documents, re-scored after a compiler change, show the
  compiler's half. Undo: n/a.
- **D31 (unit 12) — E1 pre-registration (law 9).** *Question:* should the
  author see examples at all? *Arms* (same prose, same model, same seeds,
  intent cached): (1) the kit as shipped; (2) the core —
  `docs/kits/settlement-core.md`, every fence withheld, worked sections
  removed, 251 KB; (3) the core + topic modules chosen per prompt by
  `assemble.mjs` (7–17 modules, 4.6–22.6 KB; the complete example never).
  Per-pack modules (wave 2B's A3 as designed) do not exist in this kit — one
  fence in 67 names a pack — so arm 3 is A3's honest offline form and the
  ledger says so. *Repeats:* 3 per arm, authoring-only (`run.mjs`),
  compiles free. *Cost:* ≤ $6.00 (9 × ~$0.64). *Measures:* the icon metric
  on every run (presence per icon 3-of-3, dominance count, density,
  boxes, era, compiled), `score.mjs` (pass rate, attempts, cost,
  `kitLiteralEnvelopePct`, archetype reach — reach read at n=3 only).
  *Prediction, written before a cent:* arm 2 keeps every icon present
  (icons come from the prompt, not the fences) but loses the fenced pack's
  reach (classical_mediterranean archetypes churn), drops
  `kitLiteralEnvelopePct` toward zero, and may cost an attempt on the
  validator; arm 3 recovers the envelope parroting where a module fences
  one and matches arm 1 on presence; neither arm changes dominance or
  density, which are the compiler's. The metropolis skeleton field (F3)
  returns in no arm — it is a program the author stopped asking for, not
  an example. *Decision rule (law 8):* a kit arm ships only if, on the
  icon metric, it loses no icon 3-of-3 that arm 1 has 3-of-3, matches or
  beats arm 1's dominant-icon count, and beats arm 1 on at least one of
  {cost per pass, one-shot rate, archetype reach} by more than the
  measured spread across arm 1's own three repeats, with `score.mjs
  --gate` green against arm 1. Anything less is a write-up
  (`docs/decks/e1/E1-VERDICT.md`) and the kit stays. Undo: n/a — a
  pre-registration is a record.
- **D32 (unit 13) — E1 decided: neither arm ships, the kit stays.** By
  D31's rule: the core loses one-shot (8–10 → 0–1), costs 60–75 % more,
  multiplies validator diagnostics 30×, and drops two prompts in one
  repeat; the modules arm loses one-shot and cost and gains nothing on
  icons or dominance, its reach gain inside the noise floor. Icon presence
  is equal across arms within noise (the harness reads program-carried
  icons at the document level; the walled keep's absence is kit-side
  noise, F17). The measured answer to "examples at all?" is yes: the
  fences are where envelope literals and constraint strengths are learned,
  and they buy the one-shot rate. A3's size goal is a prose problem (F16).
  Full write-up `docs/decks/e1/E1-VERDICT.md`. Undo: Kai's veto; the arms
  and the harness flags stay in the tree for a later kit.
- **D33 (unit 13):** the nine E1 passes were run three at a time (one per
  arm per repeat, concurrency 9 in all) — seven minutes a round against
  the README's twenty — with one transient `OpenRouter fetch failed` on
  modules-3 resumed by the harness's own record cache (three prompts
  re-authored, ~$0.20, inside the $6 budget). Undo: n/a.
- **D34 (unit 14):** T110's three mechanisms are separated and treated by
  size: the two input-side bugs (the ocean fill stopping at a flooded
  `never` column; a second pool lowering the first) are staged switches,
  each a few lines, each with its own doc comment and the fill's fix
  pinned on a synthetic field; the consumer-side case (a pad graded into
  a lake) is a ground-contract subsystem — no wet-neighbour constraint
  exists anywhere — and goes to proposal P4 rather than a patch that would
  argue with the election's water floor. Undo: delete the constants.
- **D35 (unit 16):** the census is a document with dispositions
  (`docs/STOCKTAKE-SLOP-CENSUS.md`), its three probes kept verbatim; the
  class-1–3 items the Run had already fixed are entered as done, the S
  items that are comments, citations and doc amendments are executed in the
  same unit (byte-identical, FULL suite), and the S items that touch code
  or bytes are the next unit's batch — so G5's "executed, not just listed"
  is met unit by unit, not by a single sweep. Undo: n/a.
- **D36 (unit 16):** the settlement kit's own bytes are not touched for a
  header note (class-2 S7): the kit sha is every harness run's anchor and a
  comment line would make every later run read as a kit change; the
  generated `settlement-core.md`/`modules/` are named in the harness README
  instead. Undo: n/a.
- **D37 (unit 17):** the batch's eight items share one identity check on
  the fourteen rather than one per item: every item is a comment, a
  report-only diagnostic, or a literal-for-call substitution that preserves
  key order, so one `bi14` run (all fourteen IDENTICAL to `u10`) is the
  proof; per-item runs would cost eight × fourteen compiles to learn what
  the helper guarantees by construction. The FULL suite ran once. Undo:
  revert the commit.
- **D38 (unit 17):** M2 (exempt `street.curb` from the `scoped` palette
  skip) is held out of batch one though the NOW block named it: it moves
  blocks and needs law 5 (switch off, attributed, flipped separately), and
  one byte-moving item inside a payload-identical batch would leave the
  batch's identity proof meaning nothing. It goes to batch two with M1 and
  M3. Undo: n/a.
- **D39 (unit 17):** the `never`-flooded note is a **note** (`LOAM-I500`),
  not a warning: the compiler did the only physically stable thing, and the
  author's remedy (raise the floor or move inland) is optional; a warning
  would nag every harbour carve that was meant to meet the sea. Undo: change
  the severity.
- **D40 (unit 18):** F10's two-phase parcel growth is withdrawn without
  being built: the probe shows the flag-on orphans are one island severed
  by a re-routed lane at a retaining edge (F20), and parcel ownership is
  nowhere in the chain. The NOW block's two anticipated outcomes (order vs
  geometry) were both wrong; the record says so. Undo: n/a.
- **D41 (unit 18):** the steep fixture's and the walled city's flag-off
  fragmentation (main 20–30 % of the network, no island within four
  columns of main) is not attributed to F20 — it is the audit's paving-only
  graph reading natural-ground gaps as breaks, F9's instrument question —
  and is left for the physics/instrument unit (F14/F9) rather than chased
  here. Undo: n/a.
- **D42 (unit 18):** every flag-on measurement was taken by patching the
  built dist (`sed` on one exported constant, sha-restored after each run),
  never the source: the tree's bytes stayed HEAD's throughout, so no law-5
  staging was owed for a probe. Undo: n/a.

## SPEND

| unit | what | $ | running |
|---|---|---|---|
| 1 | before-sample: 11 golden generates (10 worlds + 1 document), 4 anchor recompiles (free) | 2.19 | 2.19 |
| 2 | metropolis bisection: one authoring-only roll (metro-roll3); recompiles, renders, bisect free | 0.10 | 2.29 |
| 3 | the lever landed off — compiles and the FULL suite only | 0.00 | 2.29 |
| 4 | the flip — compiles, renders, baselines, the FULL suite | 0.00 | 2.29 |
| 5 | montfort's cause — instrumented probe, switch landed off, the FULL suite | 0.00 | 2.29 |
| 6 | the frontage flip — compiles, probes, renders, re-pins, the FULL suite | 0.00 | 2.29 |
| 7 | the second flip — compiles, audits, the FULL suite | 0.00 | 2.29 |
| 8 | hellenist's density — instrumented probe, two switches off, trials, the FULL suite | 0.00 | 2.29 |
| 9 | the city flips + the highrise head fix — compiles, lints, traces, baselines, two FULL suites | 0.00 | 2.29 |
| 10 | F6/F7 — diagnostics only; compiles, the FULL suite | 0.00 | 2.29 |
| 11 | the icon metric — in-process compiles only | 0.00 | 2.29 |
| 12 | the E1 arms — the kit split, harness flags, dry runs only | 0.00 | 2.29 |
| 13 | E1: 9 authoring passes (3 arms × 3 repeats) + one resumed pass; compiles free | 5.90 | 8.19 |
| 14 | T110 attributed — probe, two switches off, trials, the FULL suite | 0.00 | 8.19 |
| 15 | the fluid flip — compiles, re-score, the FULL suite | 0.00 | 8.19 |
| 16 | the slop census, classes 1–3 — three probes, comment fixes, the FULL suite | 0.00 | 8.19 |
| 17 | census S items, batch one — one bi14 identity run, the FULL suite | 0.00 | 8.19 |
| 18 | F10 probe — compiles only, the FULL suite | 0.00 | 8.19 |

## VERDICTS

(pointers to `docs/decks/<deck>/VERDICT.md`)

- `docs/decks/e1/E1-VERDICT.md` — E1, examples at all: **neither arm
  ships; the kit stays** (D32).

- `docs/decks/before-sample/VERDICT.md` — station 1 metropolis_hideout:
  **FAIL** (T6, T9); station 3 hellenist_harbour: **FAIL (T7, narrowed:
  4.3 → 12.7 lots/10k at the flip)**; station 7 walled_medieval_city: **FAIL**
  (T4, T7); stations 2, 4–6, 8–11 pending.

## REACH

(probe prompts: prompt, what it targeted, what it exercised, what failed, the cause, promoted?)

## PROPOSALS

(features skipped as too large — written up, not built)

- **P1 — yaw-seated frontage buildings on planned strips** (unit 6). On a
  45° contour the largest axis-aligned rectangle of a 15 × 19 parcel is
  under `MIN_INFILL_SIDE`, so ~30 % of hillside lots drop for geometry alone
  (`scratchpad/lot-probe`, montfort 15 of 49, walled 15 of 58; wc strip 7:
  9 lots, 665 free columns, nothing built). SITE-PLAN §4.2 keeps rectangular
  axis-aligned buildings "for v0"; the grammar takes a rectangle. Seating
  at the street's yaw is a grammar-facing change of more than a day.
- **P4 — a wet-neighbour constraint in the ground contract** (unit 14). A
  pad or platform whose ground claim would lower a column beside standing
  water below that water's surface is refused or raised to it — the rule
  `waterFloor` already states for the election, applied at the ground
  claim. Today `mostlyWater` is a majority vote, an omitted fluid means
  dry, and a `basin water:true` lake beside a stepped quarter drains into
  a terrace pad (396 unstable blocks on the E1 modules-2 metropolis).
- **P3 — blocks in a 45° city cell as diamonds, not chords** (unit 8). A
  `grid` pitch rotated with its boulevard (`orientationOf`) makes every
  block an axis-aligned chord of a diamond: median block 143–198 columns
  against 900 in an unrotated control, `rectsOf` recovering 72 % of block
  land, one lot per block. Rotated blocks and rotated lots are the same
  grammar-facing change as P1.
- **P2 — shoulders/verges on planned lots** (unit 6). A lot seated on steep
  claimed ground cuts its own platform and its cut face is undressed — the
  steep fixture's cut-offs are 100 % undressed before and after the flip and
  reachability falls 0.966 → 0.850 when the lots double. This is the parked
  "shoulder/verge" backlog item (spec §2); the flip made its price visible.

## TASTE

(T11… learned during the Run, each with the deck and station that taught it)

## UNITS

- **unit 0 — streamlining (2026-08-25):** spec ratified; lean `CLAUDE.md`;
  `AGENTS.md` current-state → pointer; funnel cells frozen to
  `docs/archive/memory-cells/`; `tools/session-log` retired; auto-memory
  pruned to three facts + the run pointer; this ledger created; stale
  worktrees pruned. Tests: none touched. Commit 085e22d.
- **unit 1 — the before-sample (2026-08-25):** the 11 golden prompts through
  `terrainist generate` at 085e22d / settlement c22cb4fe / terrain 0adfac8d
  (10 worlds, 8 one-shot, railway_town refused at the physics lint = F1),
  $2.19, ~56 min; the four anchors recompiled at HEAD vs their commits in
  isolated worktrees — all four DIFFER (F2). New instrument code:
  `tools/golden-prompts/generate-all.mjs` + `record-generate-run.mjs` (the
  full-pipeline sibling of `run.mjs`, records scoreable by `score.mjs`).
  Files: `docs/decks/before-sample/`, `docs/decks/anchors/`,
  `tools/golden-prompts/runs/before-sample/`, both READMEs. First looks
  (renders, not verdicts): troy's horse small and no dominant citadel;
  metropolis a clean grey grid; walled city ~12 buildings. Tests: none
  touched (no compiler code changed).
- **unit 2 — the r5 metropolis bisection (2026-08-25):** same document, two
  compilers: at HEAD the r5 doc plans 45 terraces for the anchor's 68
  (envelope −27 %, in-district vines −16 %, icons intact) — git-bisected to a
  six-commit staircase (`047dee2` BLOCK_MULTI_RECT, `8e09cc6` empty-block
  law, `61f1cef` floor-harmonise, `c84febe` GROUND_PLANE_TIE, `651278f`
  TERRACE_BY_TERRAIN flip = 13 of the 23, `7df3bb3` election flip); read
  WORSE (D6). Two documents, one compiler: the fresh author drops the
  skeleton-scatter program, the river, `era: modern` and unnamed decayed
  generators, 3-of-3 (F3). Station 1 of the before-sample verdict opened:
  FAIL (T6, T9). New instrument: `tools/worlds/block-census.mjs` (noted in
  AGENTS.md). Files: `docs/decks/anchors/METROPOLIS-{R5-BISECTION,R5-WORLD-
  DIFF,DOC-DIFF}-2026-08-25.md`, `docs/decks/before-sample/VERDICT.md`,
  `tools/golden-prompts/runs/metro-roll3/`. Subagents: 4 (doc diff, world
  diff, bisect ×3 ranges, all opus-5-low). Tests: none touched (no compiler
  code changed). Spend $0.10.
- **unit 3 — the lever, landed off (2026-08-25):** mechanism probed from the
  published `levels`/`seams`: the r5 quarter is `stepped` by relief election;
  the block election prices a kerb atom per contour (86 → 148 platforms,
  38 → 91 seams, 62 of them 1–2-block drops), and every seam cell goes into
  `blocked` before `blocksOf`, so 23 seams (16 kerb-1, 7 retaining-2) run
  through the 23 lost terrace footprints where 0 anchor seams did. New
  switch `SEAM_BLOCK_MIN_DROP = 1` in `layout/district.ts` gating the
  `blocked` loop and the seam-apron guard. Trial at 2: r5 45 → 55 terraces,
  physics clean; at 3: `T110` (rejected). Byte-identity at 1: nine of nine
  worlds identical (`bi/before` vs `bi/after-off`). Tests: FULL suite
  COUNTS `Test Files 332 passed | 1 skipped (333)`, `Tests 5622 passed | 31
  skipped (5653)`. Files: `packages/compiler/src/layout/district.ts`,
  `docs/decks/anchors/METROPOLIS-R5-BISECTION-2026-08-25.md` (§C). Spend $0.
- **unit 4 — the flip (2026-08-25):** `SEAM_BLOCK_MIN_DROP` 1 → 2, gate
  factored into `boundingSeams()`, pinned by
  `packages/compiler/test/seam-blocking.test.ts` (5 tests on real
  `levelSeams` output). Four of nine law-5 worlds moved, all attributed
  (bisection §D): r5 45 → 55 terraces; **troy_r22 31 → 45 buildings inside
  its wall, `W527 WALLED_QUARTER_SPARSE` silent** (T4); pirates_r22 +1,
  troy_k1 +1, pirates_k1 +2. Ground-probe baselines troy + pirates
  regenerated and attributed (new seats at delta 0/−1; floaters +31 props);
  hellenist unchanged. `empty-block-law` census re-pinned with cause (D11).
  Render pairs read by the instrument (r5 north-east rows regain their
  blocks; Troy's bare blocks carry roofs). Tests: FULL suite COUNTS at the
  flipped bytes `Test Files 1 failed | 332 passed | 1 skipped (334)`,
  `Tests 1 failed | 5626 passed | 31 skipped (5658)` — the one failure is
  the D11 census, re-run green `43 passed (43)`; seam-blocking `5 passed`.
  Files: `layout/district.ts`, two tests, two baselines, bisection §D,
  VERDICT station 1. Spend $0.
- **unit 5 — montfort's hillside replan (2026-08-25):** cause found by
  probe: the `hillside` site plan dissolved 4 of montfort's 5 frontage
  strips (11 of the fresh walled city's) because `held` — the station count
  it dissolves on and cuts lots on — is a raster artefact of the
  nearest-point tie (`1010…` on diagonals), not the frontage; the hill is
  0.09–0.45 blocks/column everywhere, never too steep (F5). Switch
  `STRIP_FRONTAGE_BY_CLAIM` (`forms/hillside.ts`) + pure
  `claimableStations()`, pinned by `strip-frontage.test.ts` (5 tests);
  landed off, fourteen of fourteen byte-identical. Trial on: buildings
  roughly double on every planned hill (montfort 5 → 13; walled 13 → 24 with
  `E170` on a 13 × 17 landmark; fixtures 11 → 16, 7 → 14). Findings F6–F8
  logged. Station 7 opened FAIL (T4, T7). Tests: FULL suite COUNTS
  `Test Files 334 passed | 1 skipped (335)`, `Tests 5632 passed | 31 skipped
  (5663)`. Files: `forms/hillside.ts`, `test/strip-frontage.test.ts`,
  `docs/decks/anchors/MONTFORT-HILLSIDE-2026-08-25.md`, VERDICT station 7.
  Subagent: 1 (opus-5-medium, the instrumented probe). Spend $0.
- **unit 6 — the frontage flip (2026-08-25):** `STRIP_FRONTAGE_BY_CLAIM`
  → true. Four hillside worlds moved, attributed (§F): montfort 5 → 13
  buildings, walled 13 → 24 (church unseated, `E170`), fixtures 11 → 16 and
  7 → 14; the other ten of fourteen identical; wall circuits tighten by the
  built-hull law (D17). Lot-drop probe (opus-5-medium, verbatim §G): drops
  are the rectangle test, ~70 % starvation by sideways BFS growth, ~30 %
  diagonal geometry; the landmark "whole strip" is the seated union. Two
  switches landed off with trial numbers (D18); `frontage-lots.test.ts`.
  28 fixture goldens re-pinned with cause and per-unit reading (15 worse —
  §H, F9, P2, D19); walkability audited on the named worlds. Tests: FULL
  suite at the flipped bytes `Test Files 3 failed | 332 passed | 1 skipped
  (336)`, `Tests 28 failed | 5608 passed | 31 skipped (5667)`; after the
  re-pins the three files re-run green `30 / 30 / 35 passed`,
  `strip-frontage 5`, `frontage-lots 4`. Files: `layout/district.ts`,
  `forms/hillside.ts`, five tests, `MONTFORT-HILLSIDE-2026-08-25.md` §F–§H,
  VERDICT station 7. Subagents: 2 (opus-5-medium). Spend $0.
- **unit 7 — the second flip (2026-08-25):** `PLANNED_SITE_WHOLE_STRIP`
  → true with `landmarkSeat()` (a strip landmark takes its own footprint at
  the street edge); `LOT_PARCEL_OWN_STATIONS` tried and kept off — alone it
  orphans 24 % of site-plan-hillside's walkable plane (F10, D21); the
  church's trial seat came from deeper own-station lots via `claimRun`, not
  the site (diagonal geometry, P1). Node 26.5 → 26.7 found to move every
  compressed byte: `tools/worlds/world-payload-sha.mjs` added, AGENTS.md
  amended (D20); by payload all fourteen documents identical to unit 6.
  Walkability audited on the named worlds at both states. Record §I. Tests:
  FULL suite COUNTS `Test Files 335 passed | 1 skipped (336)`, `Tests 5636
  passed | 31 skipped (5667)`. Files: `layout/district.ts`,
  `test/frontage-lots.test.ts`, `tools/worlds/world-payload-sha.mjs`,
  `AGENTS.md`, `MONTFORT-HILLSIDE-2026-08-25.md` §I, VERDICT station 7.
  Subagent: 1 (opus-5-medium, the both-on re-pin pass, discarded). Spend $0.
- **unit 8 — hellenist's density (2026-08-25):** T7 numbers on every
  Hellenist (3.1–4.3 lots/10k vs controls 20.5–22.8); the anchor's HEAD
  diff attributed not-worse (D24); an instrumented probe (opus-5-medium,
  verbatim in `HELLENIST-DENSITY-2026-08-25.md` §E) found three multiplying
  causes — park cells with no fabric (65 % of the fresh city's land, F11),
  `streetBehind` missing diagonal carriageways in 45° cells (68 % of the
  walked city's block land, F12), and shredded 45° blocks (P3) — and
  cleared the lot rhythm. Switches `STREET_FACE_ALONG_SIDE` + `middleOut()`
  and `PARK_BUDGET_BY_AREA`, pinned by `test/city-density.test.ts`, landed
  off; payload-identical on all fourteen; trialled alone and together on
  six documents (both: 3.3 → 14.3, 4.3 → 12.7, 3.1 → 7.1, 12.0 → 14.8;
  controls unmoved). Station 3 opened FAIL (T7). Tests: FULL suite COUNTS
  `Test Files 336 passed | 1 skipped (337)`, `Tests 5641 passed | 31 skipped
  (5672)`. Files: `layout/district.ts`, `layout/city.ts`,
  `test/city-density.test.ts`, the record, VERDICT station 3. Spend $0.
- **unit 9 — the city flips and the highrise head fix (2026-08-25):**
  `STREET_FACE_ALONG_SIDE` and `PARK_BUDGET_BY_AREA` → true: by payload
  four documents moved, attributed (hellenist_k1 23 → 63 buildings, the
  park cell a grid; hellenist_r22 55 → 65; pirates_r22 73 → 80; troy_k1
  re-faces nine blocks), ten identical; the fresh Hellenist 4.3 → 12.7
  lots/10k. The flip's FULL suite exposed a `floating.slab` on the physics
  gate fixture; a pass-by-pass voxel trace (opus-5-medium, verbatim §H)
  found the highrise curtain wall never writing the door's head course
  (F13) — fixed behind `HIGHRISE_DOOR_HEAD_SOLID`, on (D25), harbourtown
  clean, three worlds +14/+4/+8 blocks. Ground-probe baselines `hellenist`
  and `pirates` regenerated and attributed; `empty-block-law` census
  re-pinned (38/14/26 → 37/13/25, one block found its street). Station 3
  re-read: FAIL narrowed. F14 logged. Tests: FULL suite COUNTS at the final
  bytes `Test Files 337 passed | 1 skipped (338)`, `Tests 5642 passed | 31
  skipped (5673)`. Files: `layout/district.ts`, `layout/city.ts`,
  `stdlib/structures/highrise.ts`, tests ×3, two baselines, the record
  §F–§H, VERDICT station 3. Subagent: 1 (opus-5-medium). Spend $0.
- **unit 10 — the walled guard sees the hill; the dissolved strip says so
  (2026-08-25):** `W527 WALLED_QUARTER_SPARSE` fires on the planned path
  against the land inside the streets (montfort 5 %, the fresh walled city
  10 %, troy silent); `SITE_STRIP_DISSOLVED` `LOAM-I499` exists (three notes
  on montfort, six on the walled city), carried on the new `FormPlan.notes`;
  SITE-PLAN §3.7 amended (D27, D28). Payload-identical on all fourteen.
  Pinned by `test/walled-planned.test.ts` (compiles the walked montfort).
  Tests: FULL suite COUNTS `Test Files 338 passed | 1 skipped (339)`, `Tests
  5645 passed | 31 skipped (5676)`; spec registry `469 passed`. Files:
  `spec/terrain/diagnostics.ts`, `layout/forms/types.ts`,
  `layout/forms/hillside.ts`, `layout/district.ts`, the test,
  `docs/SITE-PLAN-v0.md`, `MONTFORT-HILLSIDE-2026-08-25.md` §J. Spend $0.
- **unit 11 — the icon metric (2026-08-25):** `tools/golden-prompts/
  icon-metric.mjs` per spec §6 — presence (document vs world: placements
  and the program each carries, buildings, walls, props, farms, forests by
  node, placed programs, markers), dominance (placement height/footprint or
  program volume vs the median building), density (districts, or the
  buildings' own hull), archetype-less boxes, era, the old floors; icon
  lists and density floors on every prompt in `prompts.json` (D29); 7 unit
  tests on a synthetic document; README section. Scored the before-sample
  (`runs/before-sample/icon-metric.json`): icons 11/11 present; dominant —
  leviathan, mothership (v×28), keep, elder glowcap; under the line — the
  horse (h×1.87), the citadel (h×1.33), the redwoods (h×1.14); density
  alarms — hellenist 11.6, walled 8.2, alien farm 3.4, railway (F1).
  F15 logged. Tests: `icon-metric.test.ts 7 passed`, `test-census.mjs` all
  checks passed; no compiler code changed. Spend $0.
- **unit 12 — the E1 arms (2026-08-25):** `tools/golden-prompts/
  split-kit.mjs` splits the settlement kit into `docs/kits/settlement-core.md`
  (67 fences withheld with markers, §8/§11/§13 removed; 249 KB of 284, F16)
  and 39 topic modules under `docs/kits/modules/`; `assemble.mjs` chooses a
  prompt's modules from its intent and words (never the complete example)
  and `run.mjs` gains `--kit-file` and `--modules` (kit text override,
  modules injected on the candidate-menu seam, fingerprint and record name
  what was sent). Dry runs green; 7 tests (`kit-assembly.test.ts`) pin the
  split and the selection; README section. E1 pre-registered (D31). No
  compiler code changed; no spend.
- **unit 13 — E1 run and decided (2026-08-25):** nine authoring-only passes
  as pre-registered (D31), $5.90; the icon metric on all nine (in-process
  compiles), `score.mjs` arm vs kit and kit vs its own repeats (the noise
  floor). The kit: one-shot 8–10/11, $0.55–0.58, icons 27–28/28,
  dominant 1–2/8, density 7/9, compiled 33/33. The core: one-shot 0–1,
  $0.87–0.96, diagnostics ×30, one repeat 9/11, parroting 30 → 12 %,
  constraints-with-strength 38–44 → 0–17. The modules: one-shot 3–5,
  +25 % cost, icons equal, no dominance or density gain, reach inside the
  noise. Decision D32: the kit stays; the answer to "examples at all?" is
  yes, measured. The metric learned program-carried icons (`params.program`
  and `authored:<id>`) at the document level in authoring-only runs. F17
  and F1's broadening logged. Files: `tools/golden-prompts/runs/e1-*`
  (9 run directories with `icon-metric.json`), `icon-metric.mjs`,
  `docs/decks/e1/E1-VERDICT.md`. Tests: `icon-metric.test.ts 7 passed`;
  no compiler code changed. Spend $5.90.
- **unit 14 — T110 attributed, two switches landed off (2026-08-25):** the
  five refused documents compiled with `--allow-unstable` and traced pass
  by pass (opus-5-medium, verbatim in `docs/decks/anchors/T110-2026-08-25.md`):
  F-A the ocean fill's `never` repair never continuing outward (three
  documents), F-B a second pool overwriting the first downward (the
  railway town), #5 a terrace pad draining a lake (a subsystem, P4).
  `OCEAN_FILL_CONTINUES` (with a test-exercisable option) and
  `POOL_NEVER_LOWERS` landed off, pinned by
  `fluid-stability-fixes.test.ts` (5 tests, the fix shown on a 7 × 7
  field); fourteen of fourteen worlds payload-identical off — and on
  (trial): four of five documents compile clean, #5 keeps 396. Tests: FULL
  suite COUNTS `Test Files 341 passed | 1 skipped (342)`, `Tests 5664 passed
  | 31 skipped (5695)`. Files: `stdlib/classify/index.ts`,
  `terrain/columns.ts`, the test, the record. Subagent: 1 (opus-5-medium).
  Spend $0.
- **unit 15 — the fluid flip (2026-08-25):** `OCEAN_FILL_CONTINUES` and
  `POOL_NEVER_LOWERS` → true; fourteen of fourteen law-5 worlds
  payload-identical; four of the five refused documents compile clean,
  #5 keeps 396 (P4); the before-sample re-scored with the railway town
  compiled (26.1 lots/10k, icons 3/3). Tests: FULL suite COUNTS `Test Files
  341 passed | 1 skipped (342)`, `Tests 5664 passed | 31 skipped (5695)`;
  `fluid-stability-fixes 5 passed`. Files: the two sources, the test, the
  T110 record §D, `runs/before-sample/icon-metric.json`, the deck README.
  Spend $0.
- **unit 16 — the slop census, classes 1–3 (2026-08-25):**
  `docs/STOCKTAKE-SLOP-CENSUS.md` opened with every class-1–7 finding the
  Run has established, each with a disposition and status; three probes
  (opus-5-medium ×2, opus-5-low; verbatim in §8): class 1 verified eight
  claims (five stale, three true), class 2 the spec's four seams measured
  (blockSpans match the world 120/120 — attribution is the divergence; the
  declare/build split is a statement-order cut with 79 % of blocks emitted
  pre-freeze; the driver write-through dead; the kit under-names 41 % of
  archetypes), class 3 the three authorities counted (19 height deciders,
  10 placement, 15 palette) with their duplicates named and sized. Executed
  now: the `BLOCK_MULTI_RECT` and `computeOceanMask` claims corrected, the
  `blockSpans` and `view()` comments inverted back, six source citations
  pointed at the committed records, ELECTION-SOLVE §1.3.2 amended. F18, F19
  logged (D35, D36). Payload-identical on all fourteen. Tests: FULL suite
  COUNTS `Test Files 341 passed | 1 skipped (342)`, `Tests 5664 passed | 31
  skipped (5695)`. Files: the census, six source files (comments), two
  docs. Spend $0.
- **unit 17 — the census's executable S items, batch one (2026-08-25):**
  eight items from `docs/STOCKTAKE-SLOP-CENSUS.md` §8, all payload-identical
  on the fourteen. Diagnostics: 1.17 the district cell context carries
  `walled` (set by `city-pass` from `params.walls`) and the `W527` gate
  consults it — a walled city now reaches the guard without a walled intent
  (unchanged on the fourteen: the same three logs carry W527 before and
  after, their intents are walled); 1.18 `LOAM-I500 CARVE_FLOODED_ANYWAY`
  registered and emitted from `terrain/compile.ts` when
  `classification.overriddenNoFlood > 0` — silent on the fourteen, 3,762
  columns on the E1 metropolis. Dead path: class-2 S4 `"pad.record"` dropped
  from `BLOCKING_CLASSES`. Refactors (opus-5-low, report
  `scratchpad/census/S-BATCH-1.md`): M4 four inlined `materialKey` literals
  → the call (highrise, terrace, core ×2); P2 `makePlacement(...)` in
  `layout/types.ts` at seven sites (solve, district, city-pass ×2,
  exhibits/context, precincts, farm); D4 eight stale "`FRONTAGE_TIE` is off"
  comments; M5 five `style.palettes` docblocks and the themes-intent
  contradiction (`palette.ts:958,:999` carry the claim too — flagged, next
  batch). M2 held out (D38). Tests: FULL suite COUNTS Test Files 341 passed | 1 skipped (342), Tests 5664 passed | 31 skipped (5695); `packages/spec`
  469 passed. Files: the census, seven compiler sources, four stdlib
  sources, the spec registry, `layout/types.ts`. Spend $0.
- **unit 18 — F10 probed: one island, not parcel ownership (2026-08-25):**
  `docs/decks/anchors/F10-LOWER-SQUARE-2026-08-25.md`. Three bespoke
  probes on the built dist with `LOT_PARCEL_OWN_STATIONS` flipped in the
  dist only: the flag-on 898 orphans on `site-plan-hillside` are one
  875-column component — `lower_square` (the document's own square, x
  65…86, z 234…255) and its three lanes — with no 4-neighbour adjacency to
  main and one near point, x −5, z 85 → 88, y 110 → 104: the
  `summit_chapel→lower_square` lane, re-routed west around the flag's new
  `infill_-5_73` (which stands on the lane's old graded descent), meets the
  terrace's retaining edge and the road emitter lays nothing on the two
  columns of the drop. F10 withdrawn (D40), F20 opened, the switch's
  docblock rewritten to the probed cause, the MONTFORT record annotated,
  census 1.19. Steep/walled fragmentation is a different shape (D41).
  Payload-identical on all fourteen. Tests: FULL suite COUNTS Test Files 341 passed | 1 skipped (342), Tests 5664 passed | 31 skipped (5695). Files:
  the record, `layout/district.ts` (comment), the MONTFORT record, the
  census. Spend $0.
