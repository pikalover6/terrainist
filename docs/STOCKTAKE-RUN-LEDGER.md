# THE STOCKTAKE RUN — ledger

STATUS: RUNNING

Spec: `docs/STOCKTAKE-RUN-SPEC.md` (immutable). This file is the Run's only
running state. The NOW block is rewritten at the end of every turn.

## NOW

- **In flight:** nothing — unit 37 (P6 part two: the roll over terrace
  runs, and the flip — `TERRACE_DECAY_ROLL` + `TERRACE_DECAY` on, shipped by
  read on the k1 metropolis) is committed.
- **Next unit:** unit 38 — **census 3.4: one `roofPlan`.** The 25 private
  copies in `stdlib/structures/archetypes-*.ts` consolidate onto one
  exported `roofPlan` (the sink of unit 34 stays), byte-identical on the
  thirteen (`bi14.sh` against `bi/u37on/PAYLOADS`, which is now HEAD's
  bytes); an opus-5-low batch does the mechanical part, the FULL suite
  gates. It goes before any final-bytes run because it is the last open
  class-3 row (G5) that changes code. Then unit 39: the census sweep — the
  open S rows executed (1.19 probe, 1.21 `stats.ground`), the open M/L rows
  given a written disposition each (2.1–2.4, 3.1, 3.3), and the census's
  classes 1–3 read against G5's letter in the spec. Then the road (D77): G2
  the three named worlds fresh, G1 the eleven golden fresh, G6 kit 3×3, G4
  six probes at final bytes, G7 deck and closing report, `STATUS: DONE`.
- **Last commit:** 7db56b9 (unit 36). Convention: this line names the
  previous unit's commit; the current unit's commit is HEAD.
- **Spend:** $14.96 of the $35.00 OpenRouter cap (Run-only; log-derived, D4).
- **Open decisions for Kai:** none. (Post-hoc veto open on D12, D19, D25,
  D32.)
- **Findings queue (law 1: bugs before anything else):**
  - F1 — T110: fixed for four of five; open on #5 (P4).
  - F2 — anchors at HEAD: all four attributed (units 4, 8).
  - F3 — metropolis authoring regression, lost 3-of-3; E2.
  - F4 — closed (unit 26): the k1 metropolis cannot ruin (F22).
  - F5, F6, F7, F11, F12, F13 — fixed (units 5–10).
  - F8 — `frontageLots` drops (~70 % starvation → F10, ~30 % geometry → P1).
  - F9 — new hillside lots' cut faces undressed (P2); walkability audit
    reads zero entrance reach on montfort/walled — instrument gap.
  - F10 — closed (unit 21): the 24 % was F20; retried with the pins, the
    flag moves four documents, gains on the fixtures and the walled city's
    church, and takes montfort's orchard (F21) — kept off, Kai's veto open.
  - F14 — closed (unit 27): 13,624 lint findings on the thirteen were
    97 % two instrument false positives (floor lichen; `sea_lantern` read
    as a lamp), fixed; the real remainder is F23.
  - F26 — **a `flooded: "auto"` carve whose mouth reaches the sea but whose
    floor runs above it got no diagnostic** (T113 stops at the first wet
    column): the two-villages fjord, 14 % of its floor wet, up to 31 blocks
    dry. Fixed (unit 30): `LOAM-I502 CARVE_MOSTLY_DRY`, measured along the
    floor samples, below half wet.
  - F30 — **no seat over water**: a building or market whose pad falls on
    water has no piles to the bed; the flood-delta author raised two
    plateaus and built land (`PROBE-PASS-4`). A feature, P8; not a unit.
  - F29 — fixed (unit 34): the lighthouse's `roofPlan` was null — a flat
    roof leaves one course above the eave where the rebuild needs two — and
    every archetype file's private `roofPlan` skipped in silence; the
    fit-out context now carries a `skipped` sink, all 25 copies name their
    reason, and the compiler reports `LOAM-W524 FITOUT_ROOF_SKIPPED`.
  - F28 — closed (unit 32): a prominence rule would reconcile none of the
    four (the gompa's "ordinary buildings" are its own outbuildings; the
    bell sits *below* its village; the ferry is span), so `dominant` keeps
    its rule and stops being the verdict for a centrepiece; the metric now
    carries elevation and span and says *read it*. F15 closes with it.
  - F27 — **the icon is authored at house scale**: the bell pavilion ×1.27,
    the ferry rig ×0.93, the pit heads as huts, the monastery ×1.7 on a
    200× mountain; the whale (×2.8, ×6.8) proves the model can. Nothing in
    the kit says an icon is built to dominate (T1). Kit-teaching; the
    metric agreed with the eye in all four. Unit 31.
  - F24 — **probe verdicts need the program stage**: the golden harness is
    authoring-only, and five of six probes carry their icon in an
    `authored:<id>` program the mode never writes (`W337 PROGRAM_DROPPED`),
    so the icon metric reads presence at document level and no dominance.
    A method gap, not a compiler one; pass 2 (unit 30) runs the full
    pipeline. Also: terrain-only icons have nothing to be dominant over
    (`probe_caldera`) — the metric needs a terrain rule.
  - F23 — attributed (unit 28): {TOTAL} real findings on the thirteen after
    the lattice link; all but eight belong to **authored programs** (the
    Trojan horse, the siege debris, the leviathan, the colossi, the skull
    rock, the dreadnought, the keep, the relay masts, the collapsed
    highway's railing hung beside its deck); the eight are one life-pass
    prop on air in troy_k1. The compiler cannot fix a program's own ops; it
    can say so at compile time — P7.
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
  - F20 — **a lane's cutting through held ground is refused by the
    resolver and painted as a cliff** (the grader could not see ownership);
    fixed behind `ROUTE_PINS_HELD_GROUND` (unit 19): pinned, the fixture's
    island joins main (898 → 23 orphans), the fourteen identical. Flipped
    (unit 20): shipped.
  - F21 — withdrawn (unit 25): montfort's "orchard" was the life pass's
    street trees on the starved parcels' leftover (a ≥ 320-column patch
    read as a public square), and the brown is the lane network growing
    with the dwellings it anchors (lane columns 3,535 → 6,661, coarse-dirt
    shoulders). No program yielded. The taste question is P5.
  - F22 — **closed (unit 37)**: terraces ruin bay by bay (`TERRACE_DECAY`,
    unit 36) and the district rolls each terrace run as the infill roll
    does (`TERRACE_DECAY_ROLL`); flipped together, attributed on the three
    documents that move — the k1 metropolis 59 of 66 runs ruined, 54
    shells decayed, the ruin field 0 → 40 151 columns, read against T6 as
    the prompt's overgrown broken city where off was a whole grey one
    (`METROPOLIS-F4-2026-08-25.md` §F). `office` and `apartment_block`
    still answer `W511` (4 on k1): a smaller P6 sibling, not a unit.

## DECISIONS

(every fork taken: the reversible default chosen, why, and how to undo it)

- **D82 (unit 37):** the two pirates documents move with the flip (one
  terrace run each ruins: share 0.16 over 3 runs, 0.25 over 2) and that is
  the roll's design, not a side effect — a terrace is a lot like any
  other, and a pirate town at `decline 0.4` is allowed a ruined row. Not
  re-read; the k1 read carries the flip. Undo: `TERRACE_DECAY_ROLL = false`.
- **D81 (unit 37):** shipped by read, not by not-worse: off and on
  rendered full-height side by side (`scratchpad/u37/`), on is the T6
  city and off the "normal city" of Kai's opening brief. Renders stay in
  the scratchpad (no PNG has been committed under `docs/decks`; the deck
  unit decides what Kai's walk cards carry). The roll rolls the run's
  first lot, keyed positionally like the infill's, so the infill lots'
  outcomes do not move; five ruined runs refuse decay (`W510`, an
  interior cell unreachable from its door) and stand whole, and the test
  bounds the decayed count by the rolled count rather than pinning it.
  The `pirates` ground-probe baseline moved with its one ruined run and is
  re-pinned from HEAD's bytes (law 5's moved baseline, attributed here).
  Undo: n/a.
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
- **D43 (unit 19):** F20's fix is ownership, not stairs: the road could
  already read every higher tier's height through `view("C")`; what it
  lacked was that those heights were decisions. `GroundView.held` (from
  `owner`) is the smallest true addition, and pinning held stations in the
  grader is the smallest honest use of it — a cutting only where the road
  may cut. A flight at the refusal was the other road (§D's option) and
  would have dressed the cliff rather than removed it. Undo: delete the
  field and the switch.
- **D44 (unit 19):** `held` is computed unconditionally in `viewOf` (one
  pass over `owner` per prefix view), not behind the switch: it is a mask
  of facts the resolver already holds, costs nothing measurable, and the
  fourteen are payload-identical with it present — only its *reader* is
  switched. Undo: gate it.
- **D45 (unit 19):** with pins on alone all fourteen law-5 documents are
  payload-identical, so the flip (unit 20) carries no attributed baseline —
  D22's situation again; the evidence for the flip is the fixture's
  measured 898 → 23 and the grader's pure test, recorded in
  `F10-LOWER-SQUARE` §G. The pins' shoulder-column gap (§G "what stays
  open") is noted, unmeasured, and not blocking. Undo: n/a.
- **D46 (unit 20):** the flip ships on the fixture's evidence and the
  grader's test alone, with the fourteen re-checked identical on the real
  build (not only the dist patch): law 5's "attribute every moved baseline"
  has nothing to attribute, and D22 is the precedent. The hillside fixture
  is not a law-5 document; it is the one where the bug lives, and its
  numbers at own-stations on are unit 21's baseline. Undo: one constant.
- **D47 (unit 21):** `LOT_PARCEL_OWN_STATIONS` stays off after the
  retry, by the rule pre-registered in unit 20's NOW block: a mover
  regressed. Montfort's compound loses its orchard and turns brown (the
  census and the render pair agree; T5), the walled city trades four houses
  for its church; the fixtures gain. The gain is one constant away and the
  attribution is written (`F10-LOWER-SQUARE` §H). Kai's post-hoc veto is
  open on the render pair in `scratchpad/u21/renders/` (regenerable:
  `shot.mjs` on the `bi/u10` and `bi/u21-lot` worlds, D8's convention).
  Undo: flip the constant and re-pin the three fixtures.
- **D48 (unit 21):** the walled city's and montfort's audit orphans are
  not read as walk losses: their orphan components are whole street
  segments more than four columns from any main paving in both states
  (F9's instrument question), and entrance reach is 0 both ways. The
  verdict rests on the census, the report and the renders instead. Undo:
  n/a.
- **D49 (unit 21):** the source was flipped for the measurement and
  reverted before the commit, so the tree's bytes are HEAD's; the four
  movers' worlds live in `bi/u21-lot`. No golden was re-pinned. Undo: n/a.
- **D50 (unit 21):** the ledger-rewrite script died on a literal `%` in
  its format string after the commit command had already been chained, so
  `c45c469` was pushed without the ledger; the commit was amended in place
  and force-pushed with lease on this branch (nobody else commits to it)
  rather than followed by a ledger-only commit, keeping one commit per
  unit. Scripts now substitute by token, not `%`. Undo: n/a.
- **D51 (unit 22):** the kit-vs-registry drift check (class-2 S6) lands
  as a vitest **ratchet** with the census's numbers as ceilings (175 / 253
  never named), not as a red gate: a gate red at 175 on the day it lands is
  a gate everyone learns to ignore, and a ceiling that fails only when a
  registry grows without a kit line is the check the seam needs. Lowering
  it is the kit's work (F18). Undo: delete the test.
- **D52 (unit 22):** M3's agreement test pins the *divergence* between
  `GROUND_MATERIALS_BY_THEME` and `deriveGroundMaterials` (every theme,
  ten roles) rather than asserting agreement or fixing either: the table
  now covers all seven themes, so the derivation is unreachable in a
  compile and its disagreement is a finding for the census (class 3 M3,
  now measured), not a behaviour to move. Undo: n/a.
- **D53 (unit 22):** D3's "note half" is deferred out of the batch: a
  diagnostic about `foundationY` vs the frozen ground needs the disagreement
  measured first (law 4) — how many footprint columns, on which documents,
  won by which class — and that probe is its own unit. Undo: n/a.
- **D54 (unit 23):** the kerb flip ships on the census alone: on both
  movers the entire delta is one block id for another in equal numbers
  (polished diorite → andesite, the kerb course), the render pair at
  district scale shows nothing else changed, and the change is the stated
  invariant ("one continuous course of one material"). Undo: one constant.
- **D55 (unit 23):** unit 22's attribution sentence ("2,686 glass panes …
  → andesite") was wrong: `tools/worlds/block-census.mjs` defaults to
  `--top 40`, and the diff of two top-forty lists showed ids entering and
  leaving the list, not deltas. Re-measured with `--top 100000 --json`.
  The unit-22 entry stands as written (append-only) with this correction
  beside it; the census tool's default is noted in `AGENTS.md`'s
  byte-identity paragraph. Undo: n/a.
- **D56 (unit 24):** D3's note lands although it measures zero on all
  thirteen documents: it is read from the frozen resolve's own report at
  the freeze (the resolver already knows), costs no payload, and turns the
  contract's unasserted agreement into an assertion the author would hear
  about. A note, not a warning, because nothing in a document can cause it
  today. Undo: delete the code and the block in `compile.ts`.
- **D57 (unit 24):** the probe's first column walk over-counted: a
  placement's `footprint` is not always a pad (quays, precinct regions,
  the citadel's 160 × 150 region), and columns no intent claimed, or that
  another footprint or the streets won under a region, are not D3's
  disagreement. The walk was split by owner before any number was written
  down; the census row carries the split. Undo: n/a.
- **D58 (unit 25):** F21 is withdrawn rather than fixed: the column-level
  attribution (13,051 changed surface columns, each classified by new top
  block and footprint) shows no program's ground was taken — the trees
  were the life pass's own dressing of an artefact of starvation, and the
  brown is road surface and shoulder soil. Building a reservation for a
  program that does not exist would have been the census's class 2 in
  reverse. The flag stays off on the accidental square's evidence alone,
  which is thinner than unit 21 believed; Kai's walk can overturn it. Undo:
  n/a.
- **D59 (unit 25):** the lanes' dressing inside a district is logged as a
  proposal (P5), not fixed here: a `road.network` inside a walled hill town
  laying dirt paths with coarse-dirt shoulders is the rural lane's cross
  section applied where the district's street family belongs, and changing
  it moves every document with lanes through a town — a law-5 unit with
  its own attribution. Undo: n/a.
- **D60 (unit 26):** F4 is answered from the reports and one dist-only
  probe rather than a voxel walk of the street: the compiler's own ruin
  accounting (yards, field, skin all zero) and `LOAM-W511` ×70 when every
  terrace is handed a decay say what a walk would have said, with the cause
  attached. Undo: n/a.
- **D61 (unit 26):** the fix is a proposal (P6), not a switch: a shell
  decay mode for `terrace` is grammar work in `stdlib` (the archetype is
  built by its own generator and never enters the fit-out chain), and
  extending the roll without it would add sixty-six warnings and no ruins.
  The report-only I512 denominator lands now so the note stops reading as
  a ruin share. Undo: n/a.
- **D62 (unit 27):** law 7 applied to the physics lint itself: 13,181
  of its 13,624 findings on the thirteen anchors were floor lichen the
  `unsupported.multiface` rule could not anchor because it skipped the
  `down` face (vanilla's `MultifaceBlock.canAttachTo` accepts any sturdy
  face), and ~350 more were `sea_lantern` — a full cube — read as a lamp by
  two `endsWith("lantern")` tests. Both fixed in the instrument, not the
  worlds; the worlds are payload-identical. The committed ground-probe
  baselines move with the rule ({FIX}) and are re-pinned with the same tool
  that wrote them. Undo: revert the two rules and the baselines together.
- **D63 (unit 27):** the walking agent's own `endsWith("lantern")` skip
  (`physics.ts` ≈ 1318) is left as it is: it decides what the agent walks
  through, not what is reported, and changing it could move walk findings
  on every world — its own attribution, if it matters. Noted in the
  record. Undo: n/a.
- **D64 (unit 28):** a third instrument correction, on the same evidence
  standard as unit 27's two: the standing-chain walk now passes through
  iron bars, chains and panes (`LATTICE_LINK`) the way it passes through a
  fence — a relay mast of wall / bars / block / bars / wall does not float,
  and vanilla pops none of it. The metropolis's 46 findings become 24;
  the baselines re-pinned ({BASE}). Undo: revert the regex.
- **D65 (unit 28):** what remains is not chased into the programs: every
  finding but troy_k1's eight is inside an `authored:<id>` op list the
  model wrote for that document, and rewriting a model's ops by hand is the
  census's class 2 (a workaround the kit never taught). The honest fix is
  P7 — the readback lint's support rules run over each authored program's
  ops at compile time, so the author hears "17 of your railing's blocks
  stand on air" — and, until then, the record names each program. Undo:
  n/a.
- **D66 (unit 29):** the probe prompts live in their own roster
  (`tools/golden-prompts/probes.json`) and the two tools take
  `--prompts <file>`, so the golden roster and every score against it are
  untouched; the run directory (`runs/probe-1`: documents, records,
  summary, icon scores) is committed as the before-sample was, worlds not.
  Pass 1's icon verdict is deferred rather than read as six failures: the
  mode cannot place a program, and a verdict that the instrument cannot
  reach is not a verdict (law 7). Undo: n/a.
- **D67 (unit 30):** F26 is fixed in the same unit that found it, as
  a note from the stdlib's own dry-carve report: the rule already existed
  for the all-dry case, one wet column silenced it, and measuring along
  the carve's floor samples (below half wet) is the smallest change that
  names the fjord without naming a flooded channel with dry banks (the
  first footprint-based cut did, and was thrown away on its own test).
  Report-only; the thirteen identical. Undo: delete the block and the
  code.
- **D68 (unit 30):** the four "not dominant" verdicts are read as one
  cause (F27, the kit) and not four metric quibbles: renders were read
  before the metric was believed, and in every case the eye agreed — the
  bell, the huts, the ferry and the monastery are the size of the houses
  beside them. The monastery's 1.7×/1.69× is also the one case where F15's
  threshold question would matter, and it is moot while the mountain is
  the icon. G4 is not met by this pass; six new probes follow F27. Undo:
  n/a.
- **D69 (unit 31):** the kit change ships on the harness's own gate and the
  presence count, not on dominance: the before-sample is a full generation
  and the after-run is authoring-only, so their dominance columns (4 of 8
  vs 0 of 8) measure different things (F24); comparing them would have
  read a method gap as a regression. The comparable numbers — 11 of 11,
  10 one-shot, 28 of 28 icons present, `gate: pass` — are green. Undo:
  revert the two kit paragraphs and regenerate the copies.
- **D70 (unit 31):** the four probes' verdicts are the renders', not the
  metric's: the fjord and its ferry and the monastery on its peak are what
  their prompts asked for, and the metric refuses both because it has no
  rule for span or elevation. That is the evidence law 7 asks for before a
  metric is changed, and it is now in hand (F28); the metric is not
  changed in the same unit that produced the evidence. Undo: n/a.
- **D71 (unit 32):** the dominance rule is not extended. The elevation
  data that a prominence rule would use says the opposite of the reads on
  two of the four: the gompa's base (154) is below its own complex's median
  (159) because the buildings it is measured against are its outbuildings
  on the peak, and the bell pavilion (74) sits below the village (86) — a
  fail by any rule, which the eye agreed with. A rule that reconciles the
  ferry alone is optimisation, which law 7 forbids. Undo: n/a.
- **D72 (unit 32):** what changes instead is what the metric *says*: beside
  `dominant` it now reports the icon's base elevation over the buildings'
  median base and its span against theirs, and when either is large and
  the rule still says no, the alarm reads "not dominant by the rule — read
  it". `dominant` itself is unchanged, so every score in every run stays
  comparable; the verdict on a program-carried centrepiece is the read's,
  as D70 already ruled. Undo: revert the tool.
- **D77 (unit 35):** the road to DONE, with the budget: every gate but
  G4 and G5 is still open, and G2 and G3 share one cause (F22 — the
  metropolis cannot ruin), so P6 is taken up as the next two units rather
  than left a proposal. Probe passes pause until the compiler and kit
  bytes are final, because G4 counts the *last* six and a probe against
  moving bytes measures the wrong thing; the four passes so far ($6.14)
  found F24, F26, F27, F29 and F30, and each is fixed or filed. Reserve:
  ≈ $8 for G1, G2 and G6 measurements, ≈ $1.5 for the final six probes,
  from the $20.04 left. Undo: n/a.
- **D78 (unit 35):** F30 is filed as a feature (P8), not fixed: seating a
  building on piles over water is a new pad class and a grammar change,
  and the author's own answer (raise the land) is what the product does
  today. The stilt village stays a fail on the record. Undo: n/a.
- **D79 (unit 36):** the terrace is decayed with the shell's own operators,
  bay by bay in a bay-local frame, rather than by a terrace-specific ruin
  builder: RUINS-PLAN's law is "a ruined building is the ordinary shell
  fit-out decayed, not a second grammar", and a bay — party walls at 0 and
  w + 1, the shared rows, a cornice at floors × storey — is the plain rect
  `decayPlan` demands. The pass is a pure function over the cells map,
  exported and tested without the switch. Undo: delete the function and the
  call.
- **D80 (unit 36):** landed off although on it moves nothing today (no
  terrace job carries `decay` until the roll of part two): law 5 wants the
  behaviour switch and the roll switch flipped *together* with one
  attribution on the two metropolis documents, not a switch that is "on"
  with no reader. Undo: n/a.
- **D73 (unit 33):** pass 3 does not close G4: four of six read as their
  prompts, the mammoth fails on a known cause, and the lighthouse on a new
  one (F29). The rule is the pre-registered one — a new cause gets its
  F-number and the next six run after its fix — and it is applied as
  written rather than argued down to "five of six". Undo: n/a.
- **D74 (unit 33):** the metric's "read it" alarm (unit 32) fired on
  exactly the four icons whose verdict needed a render — the tent, the
  bridge, the kill site, the tower — and on nothing else; on this pass the
  instrument and the reads agree about where to look. Undo: n/a.
- **D75 (unit 34):** the fix is the diagnostic, not the roof: a lighthouse
  asked for with `roof: "flat"` is the author's request, and the
  compile-feedback rounds are where the author changes it — once told. A
  switch that overrode the roof for the lighthouse alone would fix one
  archetype of 25 that share the silence. The sink is one optional array
  on the fit-out context; the terminus copy names its reasons by hand and
  the other 24 by an opus-5-low batch ({COPIES}); nothing moves a block.
  Undo: delete the field, the pushes and the warning.
- **D76 (unit 34):** `roofPlan` ×25 is filed with the census (class 3, a
  duplicated authority) rather than consolidated here: the copies differ
  in what they plan over, and a consolidation is its own byte-identical
  refactor unit. Undo: n/a.

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
| 19 | F20 in code — dist-patched measurements, two bi14 runs, the FULL suite | 0.00 | 8.19 |
| 20 | the pins flip — one bi14 run, the FULL suite | 0.00 | 8.19 |
| 21 | own stations retried — two bi14 runs, renders, censuses, the FULL suite twice | 0.00 | 8.19 |
| 22 | census batch two — two bi14 runs, the FULL suite | 0.00 | 8.19 |
| 23 | the kerb flip — censuses, renders, one bi14 run, the FULL suite | 0.00 | 8.19 |
| 24 | D3 probed — thirteen in-process compiles, one bi14 run, the FULL suite | 0.00 | 8.19 |
| 25 | F21 probed — two top-block maps, one bi14 run, the FULL suite | 0.00 | 8.19 |
| 26 | F4 probed — one dist-patched compile, one bi14 run, the FULL suite | 0.00 | 8.19 |
| 27 | F14 probed — two lint passes over the thirteen, three baseline re-pins, one bi14 run, the FULL suite | 0.00 | 8.19 |
| 28 | F23 attributed — three lint passes, three baseline re-pins, one bi14 run, the FULL suite | 0.00 | 8.19 |
| 29 | probe pass 1 — six prompts authored (`runs/probe-1`), the icon metric | 0.36 | 8.55 |
| 30 | probe pass 2 — six worlds generated end to end (`runs/probe-2`), the icon metric | 1.67 | 10.22 |
| 31 | F27 in the kit — the golden gate (`runs/after-f27`) and four probes re-run (`runs/probe-2b`) | 1.55 | 11.77 |
| 32 | F28 — the metric re-scored on `runs/probe-2b`, no authoring | 0.00 | 11.77 |
| 33 | probe pass 3 — six new worlds generated end to end (`runs/probe-3`), the icon metric | 1.70 | 13.47 |
| 34 | F29 — one in-process compile, one bi14 run, the FULL suite | 0.00 | 13.47 |
| 35 | probe pass 4 — six new worlds generated end to end (`runs/probe-4`), the icon metric | 1.49 | 14.96 |
| 36 | P6 part one — one bi14 run, the FULL suite | 0.00 | 14.96 |
| 37 | P6 part two — two bi14 runs (off, dist-patched on), three renders, the FULL suite | 0.00 | 14.96 |

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

**Pass 1 — pre-registered (unit 29, 2026-08-25), before any spend.**
Roster `tools/golden-prompts/probes.json`, six prompts, one per spec §6
category: `probe_monastery` (himalayan_monastery pack, 0 % reach in the
before-sample), `probe_two_villages` (two places, a rope ferry),
`probe_bronze_tundra` (Bronze Age, frozen coast), `probe_caldera`
(terrain-only, the terrain kit), `probe_temple_bell` (an icon that lives
in a prop pack, feudal_japanese at 0 %), `probe_sky_whale` (bespoke, T8).
Arm: the current kit, authoring-only (`run.mjs --prompts probes.json
--label probe-1`, ≈ $0.06 per prompt measured, ≈ $0.35 the pass; the
tool's own dry-run estimate is the conservative per-world $1.43), scored by the
icon metric compiling each document in-process (free). **Prediction:** ≥ 5
of 6 author one-shot; icons present on ≥ 5; the sky-whale and the ferry
are the likely absences (a program the model must write); the caldera is
the likely validator failure (a rim that does not close, T105).
**Decision rule:** a probe whose dominant icon is absent or not dominant,
or that fails validation or compile, is a *finding* with a cause; its cause
gets an F-number, and the prompt is promoted into `prompts.json` once the
cause is fixed. Passes stay one-off. G4 counts the last six probes with no
*new failure class*; this pass is the first six. Spend cap for the unit:
$1.50 (log-derived, D4).

| probe | targeted | exercised | failed | cause | promoted? |
|---|---|---|---|---|---|
| `probe_monastery` | himalayan_monastery at 0 % | the pack, a cliff district, a flag-span program | not dominant: h ×2.0, a ×1.58 | the metric wants both ratios (F15 family) | no — passes stay one-off |
| `probe_two_villages` | two places, a rope ferry | two districts, nordic_viking, `authored:rope_ferry_rig` | ferry unmeasured | the program is not authored in authoring-only mode (F24) | deferred to pass 2 |
| `probe_bronze_tundra` | Bronze Age, frozen coast | wilds_camps, two programs, `W517` era mismatch | mine measured on a hut; density 1.5 < 2 | pit heads are a program (F24); a camp is sparse | deferred to pass 2 |
| `probe_caldera` | terrain-only, the terrain kit | `cave.carver`, vents as a scatter program | dominance unmeasurable | nothing placed to compare a lake against — instrument gap for terrain icons | no |
| `probe_temple_bell` | an icon in a prop pack, feudal_japanese at 0 % | the pack, `authored:bell_pavilion`; `T210` once, clean retry | bell unmeasured | the program is not authored in this mode (F24) | deferred to pass 2 |
| `probe_sky_whale` | bespoke (T8), desert_caravanserai at 0 % | the pack, two `authored:` programs | not dominant on what stood: h ×0.8, a ×1.33 | the ribcage and skull are programs (F24) | deferred to pass 2 |

**Pass 2 — pre-registered (unit 30, 2026-08-25), before any spend.** The
same six prompts through the full pipeline (`generate-all.mjs <out> 3 ""
tools/golden-prompts/probes.json` → `terrainist generate` per prompt:
intent, authoring, programs, compile-feedback rounds, emit; then
`record-generate-run.mjs` and `icon-metric.mjs --prompts probes.json`).
Cost: ≈ $0.24 per world measured (WS-C median), ≈ $1.50 the pass; cap for
the unit **$3.00**. **Prediction:** the ferry rig, the bell pavilion, the
ribcage and skull and the pit heads are placed as programs; the whale and
the bell read dominant; the monastery still fails the footprint half
(F15); the caldera stays unmeasurable; one of six needs a second
compile-feedback round. **Decision rule** as pass 1: a program that does
not place, or an icon placed and not dominant, is a finding with a cause
(F-number), promoted once fixed; passes stay one-off; these six count
toward G4 only from this pass.

| **pass 2** | | | | | |
| `probe_sky_whale` | bespoke (T8) | skull temple, ribcage market, 9 vertebra arches placed | — | **dominant** h ×2.8, a ×6.8; the read agrees | no — pass |
| `probe_caldera` | terrain-only | 7 of 14 vents; the lake, the rim, the tube | dominance unmeasurable | terrain icons have nothing to be dominant over (F24) | no — pass by read |
| `probe_monastery` | 0 %-reach pack | flag span, seracs; the mani shrine refused on the cliff | monastery not dominant h ×1.7, a ×1.69; the read agrees (the mountain is the icon) | icon authored at building scale (F27) | after F27 |
| `probe_temple_bell` | icon in a prop pack | the pavilion placed | not dominant h ×1.27, a ×2.78; the read agrees | F27 | after F27 |
| `probe_two_villages` | two places | the ferry placed; 12 of 14 racks | ferry joins nothing: **no fjord** | the valley carved between the villages stayed dry with no diagnostic (F26 — fixed, `LOAM-I502`) | after F26 + F27 |
| `probe_bronze_tundra` | unusual era/climate | the ship, 4 hearths | the mine is ordinary huts | F27; `W517` pack-era once more | after F27 |

**F27 kit change — pre-registered (unit 31, 2026-08-25), before any
spend.** The kit's icon register (`settlement-author.md` §9e) gains "the
centerpiece dominates": the one icon the prompt names as *the thing* is a
landmark built to tower over the ordinary buildings — envelope ≥ 1.5× their
height and ≥ 2× their footprint, or standing above them on a ridge, a cliff
or a mast — and its brief and `envelope` say so; the saturation rule stays
for the streets. Gate (law 3, the golden harness): `run.mjs --label
after-f27` (the eleven golden prompts, authoring-only, ≈ $0.64) scored
`score.mjs runs/before-sample runs/after-f27 --gate` and by the icon
metric; then the four probes F27 failed (`probe_temple_bell`,
`probe_two_villages`, `probe_monastery`, `probe_bronze_tundra`) through the
program stage again (≈ $1.20). Cap for the unit $3.00. **Prediction:** the
golden gate passes with no icon lost and no one-shot lost (11 of 11 author;
≥ 9 one-shot as before); at least two of the four probes' dominant icons
read dominant (the bell and the ferry the likely two; the monastery stays
under its mountain; the mine may stay huts). **Decision rule:** the kit
change ships only if the golden gate is green and no golden icon regresses;
a probe that now passes stays one-off (its cause fixed); one that still
fails is F27's remainder, named.

**Pass 2b — the four F27 probes re-run through the program stage (unit 31, $1.01):**

| probe | metric after F27 | the read | verdict |
|---|---|---|---|
| `probe_two_villages` | ferry h ×1.07, a ×8.0 | the fjord is there (`I502` landed in the feedback rounds); the ferry spans it | pass by read; F28 |
| `probe_monastery` | h ×1.08, a ×1 | the gompa on a peak, flags on the summits — named by a stranger | pass by read; F28 |
| `probe_temple_bell` | h ×1.2, a ×3.0 | no pavilion you would point to | fail — F27 remainder |
| `probe_bronze_tundra` | h ×0.93, a ×6.0 | a low dark working among huts | fail — F27 remainder |

Golden gate `runs/after-f27`: 11 of 11, 10 one-shot, `gate: pass`, 28 of 28 icons present, `railway_town` FIXED; dominance not comparable (F24).

**Pass 3 — pre-registered (unit 33, 2026-08-25), before any spend.** Six
*new* prompts (`tools/golden-prompts/probes-3.json`), one per spec §6
category and none of pass 1's: `probe_horde_camp` (steppe_nomad at 0 %),
`probe_river_forts` (two places, a broken bridge), `probe_mammoth_camp`
(Stone Age, an ice sheet), `probe_karst` (terrain-only), `probe_lighthouse`
(an icon in the packs), `probe_hollow_tree` (bespoke, T8). Through the
program stage (`generate-all.mjs`, ≈ $0.28 per world, ≈ $1.70 the pass;
cap $3.00), recorded to `runs/probe-3`, scored by the icon metric and
**read** from full-height renders; the verdict is the read's (D70).
**Prediction:** 6 of 6 generate; icons present 6 of 6; by read ≥ 4 pass —
the baobab and the great tent dominate (F27's paragraph is fresh), the
karst passes by read, the river forts get their river (F26's note fires in
the feedback rounds); the likely fails are the lighthouse (a pack member
at pack scale) and the mammoth (a skeleton on open ground, F27's
remainder). **Decision rule:** a probe fails on a read; a failure whose
cause is already an open F-number is not a new class; a new cause gets an
F-number and G4 waits for the pass after its fix. G4 is met if these six
surface no new failure class.

| probe | targeted | exercised | failed | cause | promoted? |
|---|---|---|---|---|---|
| `probe_hollow_tree` | bespoke (T8) | a colossal baobab program, walkways, platforms | — | dominant by rule and by read | no — pass |
| `probe_river_forts` | two places, a broken bridge | two forts, a river that holds, a bridge program ending mid-stream | — | pass by read (span ×7.6); F26 works end to end | no — pass |
| `probe_karst` | terrain-only | towers, a sinkhole, a cave mouth | — | pass by read | no — pass |
| `probe_horde_camp` | steppe_nomad at 0 % | the pack, the great tent, seven yurt props placed | — | the centerpiece reads (the yurts are small at render scale; corrected in unit 35) | no — pass |
| `probe_mammoth_camp` | Stone Age, an ice sheet | the ice sheet, hide huts, a kill-site program | the skeleton is three blocks | F27 remainder (icon at prop scale) | after F27's remainder |
| `probe_lighthouse` | an icon in the packs | the `lighthouse` archetype (`floors: 2, roof: flat`) | a flat-roofed box, no lantern | **F29** (new): the archetype's fit-out defeated silently | after F29 |

**Pass 4 — pre-registered (unit 35, 2026-08-25), before any spend.** Six
new prompts (`tools/golden-prompts/probes-4.json`), none of passes 1 and
3: `probe_frontier_town` (frontier_west at 0 %; a water tower — a tower's
dominance is height), `probe_twin_pueblos` (two places across a canyon, a
rope bridge), `probe_flood_delta` (a stilt village on water in flood),
`probe_lava_field` (terrain-only, the volcano verb), `probe_polder_mill`
(a windmill — the catalog's, does its fit-out run), `probe_meteorite`
(bespoke, sunk rather than tall). Through the program stage
(`generate-all.mjs`, ≈ $1.70 the pass; cap $3.00), `runs/probe-4`, the
icon metric, full-height renders; the verdict is the read's. **Prediction:**
6 of 6 generate; icons present 6 of 6; by read ≥ 4 pass; the water tower
and the windmill fail the AND-rule and read as their prompts ("read it");
the stilt village is the likely fail (houses seated over water) and the
likely new cause if there is one. **Decision rule** as pass 3: a failure
whose cause is an open F-number is not a new class; a new cause gets an
F-number; G4 is met if these six surface no new failure class.

| probe | targeted | exercised | failed | cause | promoted? |
|---|---|---|---|---|---|
| `probe_twin_pueblos` | two places across a canyon | a canyon, two rim towns, a rope-bridge program | — | pass by read (span ×3.7) | no — pass |
| `probe_lava_field` | terrain-only | the volcano verb, a crater lake, flows to the sea | — | pass by read | no — pass |
| `probe_polder_mill` | an icon in the catalog | the `windmill` archetype, its fit-out ran (no `W524`) | — | dominant by rule and by read | no — pass |
| `probe_meteorite` | bespoke, sunk | the meteorite program, forges | the square relationship (constraint demoted, `E404`) | pass on the icon; the solver's designed demotion | no — pass |
| `probe_frontier_town` | frontier_west at 0 % | the pack, a linear street, a water-tower program (973 blocks on 16 × 15) | no tower you would point to | F27 remainder (an icon program written wide and low) | after F27's remainder |
| `probe_flood_delta` | a village on water | `stilt_house_*` buildings on two plateaus the author raised above the sea | not a stilt village | **F30** (new): no seat over water — a feature gap, P8 | after P8 |

## PROPOSALS

(features skipped as too large — written up, not built)

- **P1 — yaw-seated frontage buildings on planned strips** (unit 6). On a
  45° contour the largest axis-aligned rectangle of a 15 × 19 parcel is
  under `MIN_INFILL_SIDE`, so ~30 % of hillside lots drop for geometry alone
  (`scratchpad/lot-probe`, montfort 15 of 49, walled 15 of 58; wc strip 7:
  9 lots, 665 free columns, nothing built). SITE-PLAN §4.2 keeps rectangular
  axis-aligned buildings "for v0"; the grammar takes a rectangle. Seating
  at the street's yaw is a grammar-facing change of more than a day.
- **P5 — lanes inside a district take the district's street family**
  (unit 25). A `road.network` routed through a walled hill town lays the
  rural lane's cross section — `dirt_path` surface, `coarse_dirt` shoulders
  (`roads.ts` `soilA`), gravel — where the district's own streets are
  cobbled with kerbs and verges. Montfort at own-stations on: lane columns
  3,535 → 6,661 and 2,340 of 2,344 new coarse-dirt columns within two of a
  lane — the "brown bowl" of §H/§I. A lane whose columns fall inside a
  district's bounds should resolve its states through the district's
  `resolveStreetStates` family (surface, kerb, verge) rather than the
  rural set; byte-moving on every document with lanes through a town;
  switch + attribution.
- **P6 — a shell decay mode for `terrace`, and the roll over terrace
  runs** (unit 26, `METROPOLIS-F4-2026-08-25.md`). **Delivered, units
  36–37** (§F there); `office`/`apartment_block` remain. The terrace archetype —
  132 of the k1 metropolis's 142 lots — is built by its own generator and
  answers `LOAM-W511` to any `decay`; `office` and `apartment_block` too. A
  decay mode in the terrace generator (bays lose storeys and roofs, party
  walls stand as the fallen-tower silhouette T6 names), then `ruinDecayOf`
  rolled per terrace run (clustered by block, as the infill roll is) behind
  a switch, attributed on both metropolis documents. Without it a grid
  district at any `decline` is intact by construction.
- **P7 — the support rules over authored programs, at compile time**
  (unit 28, `F14-PHYSICS-2026-08-25.md` §F). The physics lint is a world
  readback nobody runs in the product path; an authored program's ops are a
  voxel list the compiler holds before emit, and the lint's standing and
  hanging chain rules are pure functions of neighbours. Run them over each
  program's ops in place (`LOAM-W…`, per program: "N blocks stand on air,
  first at x,y,z") so the model that wrote the railing beside the deck is
  told, and the kit's program section can teach "every block of a program
  stands on the program or the ground". Report-only; payload-identical.
- **P8 — a seat over water** (unit 35, `PROBE-PASS-4-2026-08-25.md` §B).
  A `seat: "piles"` (or a water-pad claim class) for a building or a
  market whose footprint falls on water: piles from the footprint to the
  bed, the floor at the requested height above the water, the pad
  contract's `waterFloor` rule as its floor, and kit-teaching after the
  feature. Until then a prompt for a stilt village gets islands.
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
- **unit 19 — F20 in code: the road grades against the ground it will
  get (2026-08-25):** the mechanism read from the code and the compile
  (`F10-LOWER-SQUARE` §G): the lane's 1-Lipschitz lower envelope trenches
  the 109 terrace toward the far square; the stations on the quarter
  plane's rows and the infill's apron (tier A, ranks 15 and 10) are refused
  the cut and kept at 109, the rest granted at 103, and `surfaceRoute`
  paints the refusal as a six-block step whose declared feet the audit
  reads as buried. Fix: `GroundView.held` (`ground-contract.ts`, from
  `ResolvedGround.owner` in `ground-driver.ts` `viewOf`) and
  `ROUTE_PINS_HELD_GROUND` (`roads.ts`, landed `false`): a held station is
  pinned — ground as held, band 0, floor at it — so the descent is graded
  past the pins. `test/route-pins.test.ts` (4): ships off; today's grader
  cuts 107/106/105 through the held rows; pinned 109 ×3 then 108…104; the
  driver's `view("C").held` marks a tier-A row. Measured in the dist: own
  stations + pins → 898 → 23 orphans, largest 3, 20 buildings; pins alone
  → HEAD's numbers; the fourteen payload-identical off **and on** (D45).
  Census 1.20. Tests: FULL suite COUNTS Test Files 342 passed | 1 skipped (343), Tests 5668 passed | 31 skipped (5699). Files: `ground-contract.ts`,
  `ground-driver.ts`, `roads.ts`, the test, the record §G, the census.
  Spend $0.
- **unit 20 — the pins flip (2026-08-25):** `ROUTE_PINS_HELD_GROUND`
  `false → true` in `structures/roads.ts`, its docblock and
  `test/route-pins.test.ts` ("ships on") updated, census 1.20 closed. The
  fourteen payload-identical to `u10` on the real build (D46). Tests: FULL
  suite COUNTS Test Files 342 passed | 1 skipped (343), Tests 5668 passed | 31 skipped (5699). Files: `roads.ts`, the test, the census. Spend $0.
- **unit 21 — own stations retried with the pins, attributed, kept off
  (2026-08-25):** `LOT_PARCEL_OWN_STATIONS` on in the dist against the
  unit-10 baseline moves four of fourteen (montfort, both hillside
  fixtures, the walled city). Attributed per mover with the walk audit,
  the report, the block census and a deterministic isometric render pair
  for the two named worlds (`F10-LOWER-SQUARE` §H): hillside 16 → 20
  buildings with the island gone, steep 14 → 17, the walled city 24 → 20
  on +7 % footprint with `E170` 1 → 0 (the church seats), montfort 13 → 12
  on +44 % footprint — and montfort's parcels take the compound's orchard
  (cherry 476 → 140, `life` 259 → 179) and re-dress its ground (grass
  −5.8k; path/coarse dirt/gravel/cobble +9k). Kept off (D47); F21 opened;
  F10 closed; the switch's docblock and census 1.19 carry the attribution.
  The FULL suite at own-stations on, run once to size a future re-pin:
  23 assertions moved in 3 files (`site-plan-hillside`, `site-plan-transitions`, `walkability`) within the first 61 of 343 files, then stopped. Source reverted; the fourteen payload-identical to `u10`. Tests:
  FULL suite COUNTS Test Files 342 passed | 1 skipped (343), Tests 5668 passed | 31 skipped (5699). Files: `layout/district.ts` (comment), the record
  §H, the census. Spend $0.
- **unit 22 — census batch two (2026-08-25):** class-3 M2 `KERB_SYMBOL_UNSCOPED`
  landed off in `structures/roads.ts` (a scoped district's kerb follows the
  palette symbol the sidewalk pass reads) and attributed in the dist: two
  of fourteen move, pirates_r22 and pirates_vs_unicorns_k1 — on pirates_r22 the scoped district's kerb course is 2,686 glass panes today and becomes andesite (+3,600 states) — the root palette's `street.curb`; on pirates_vs_unicorns_k1 1,014 polished diorite → andesite; nothing else moves (block census, two ids per world); flip
  is unit 23. Class-2 S6 as a ratchet test (`kit-registry-drift.test.ts`,
  3; D51). By opus-5-low (`scratchpad/census/S-BATCH-2.md`): M1 the
  streetscape resolver's `street.curb` fallback is now the theme table
  roads read, `theme` threaded through `StreetscapeContext` from
  `structures/index.ts`, `DEFAULT_CURB_BLOCK` deleted; M3
  `ground-materials-tables.test.ts` (5) pins the table's 7-of-7 coverage
  and the derivation's divergence in every theme (D52); S5 notes at both
  `plan.surface` writes. D3's note deferred (D53). Payload-identical on the
  fourteen with the switch off. Tests: FULL suite COUNTS Test Files 344 passed | 1 skipped (345), Tests 5676 passed | 31 skipped (5707). Files:
  `roads.ts`, `streetscape.ts`, `structures/index.ts`, `props.ts`,
  `site-treatment.ts`, two tests, the census. Spend $0.
- **unit 23 — the kerb flip (2026-08-25):** `KERB_SYMBOL_UNSCOPED`
  `false → true` in `structures/roads.ts`; `test/kerb-unscoped.test.ts`
  ("ships on"). Attribution re-measured with the full block list (D55):
  pirates_r22 polished diorite 1,983 → 810 and andesite 2,427 → 3,600;
  pirates_vs_unicorns_k1 1,718 → 704 and 1,781 → 2,795 — the scoped
  districts' kerb course becoming the block their sidewalk curb already
  is, and nothing else (two ids per world). **Correction to unit 22's
  entry:** its "2,686 glass panes" sentence was the census tool's top-40
  artefact; the citadel's window panes are all present in both worlds. The
  fourteen on the real build: twelve payload-identical to `u10`, pirates_r22 and pirates_vs_unicorns_k1 moved with payloads identical to the unit-22 dist-patched attribution run (`bi/u22-kerb`). Tests: FULL suite COUNTS Test Files 345 passed | 1 skipped (346), Tests 5677 passed | 31 skipped (5708).
  Files: `roads.ts`, the test, the census M2 row, `AGENTS.md`. Spend $0.
- **unit 24 — D3 probed and pinned (2026-08-25):** `scratchpad/d3/probe.mjs`
  compiles the thirteen with `groundEquivalence: true` and reads the
  resolve's claim table and the frozen ground under every placement: every
  declared `building.footprint` column is satisfied, adjusted 0, refused 0,
  on every document (troy 9,524, the metropolis 28,904, thalassa 16,293,
  …); the footprints whose ground differs from `foundationY` are not pads
  (D57). Landed: `LOAM-I501 FOOTPRINT_GROUND_LOST` (registry + `compile.ts`,
  read from `freeze()`'s report; D56) and `test/footprint-ground.test.ts`
  (hillside-village through the same report). Census: D3 done, 1.21 opened
  (`stats.ground` is only wired under the test-only option). The thirteen:
  all thirteen payload-identical to unit 23. Tests: FULL suite COUNTS Test Files 346 passed | 1 skipped (347), Tests 5678 passed | 31 skipped (5709). Files: `diagnostics.ts`,
  `compile.ts`, the test, the census. Spend $0.
- **unit 25 — F21 probed: nobody's orchard (2026-08-25):**
  `F10-LOWER-SQUARE` §I. Top-block maps of montfort's compound from the
  HEAD and own-stations worlds (`scratchpad/f21/`, 34,225 columns, 13,051
  differ), every changed column classified: the compound's trees are
  `dressOpenGround`'s street trees (142 → 40) on the starved parcels'
  leftover — a ≥ 320-column patch touching a street, read as a public
  square — and the document has no orchard node; the brown is road surface
  and shoulder soil (`dirt_path` +2,620, `coarse_dirt` +2,203 of which
  2,340 within two columns of a lane, `gravel` +1,324; lane columns 3,535
  → 6,661) from `city_lanes` growing with the dwellings it anchors (11 →
  14). F21 withdrawn (D58); P5 opened (D59); the switch's docblock
  corrected (comment only). The thirteen: all thirteen payload-identical to unit 24. Tests: FULL suite COUNTS
  Test Files 346 passed | 1 skipped (347), Tests 5678 passed | 31 skipped (5709). Files: `layout/district.ts` (comment), the record §I. Spend $0.
- **unit 26 — F4 probed: nothing in the metropolis can ruin (2026-08-25):**
  `docs/decks/anchors/METROPOLIS-F4-2026-08-25.md`. The k1 metropolis at
  HEAD: 142 lots, 132 terrace, 2 infill; `LOAM-I512` "2 of 2 infill lots
  roll into ruined shells"; ruin yards, field and green skin all 0 (the
  anchor: 24 of 28, 14, 3,564, 6,207). In code: the roll is inside
  `tryInfill` only; `terraceRuns` takes no decline. Probe: every terrace
  handed `decay: 0.8` in the dist → `LOAM-W511` ×70 (66 terrace, 2 office,
  1 apartment_block, 1 skyscraper), still 0 / 0 / 0 — no archetype in the
  district has a shell decay mode. F4 closed, F22 opened (law 1), P6
  proposed (D61), census 1.22. Landed: the I512 message states the terrace
  lots outside the roll (report-only). The thirteen: all thirteen payload-identical to unit 25. Tests: FULL
  suite COUNTS Test Files 346 passed | 1 skipped (347), Tests 5678 passed | 31 skipped (5709). Files: `layout/district.ts`, the record, the
  census. Spend $0.
- **unit 27 — F14 probed: the lint's false positives, and the real
  remainder (2026-08-25):** `docs/decks/anchors/F14-PHYSICS-2026-08-25.md`.
  `lintWorldPhysics` over the thirteen worlds (`scratchpad/f14/`): 13,624
  findings, 13,181 `unsupported.multiface` on `glow_lichen` laid on grass
  with `down: true` (a legal floor attachment the rule could not anchor),
  ~350 `unsupported.lantern`/`chain` on `sea_lantern` (a full cube read as
  a lamp). Fixed: the multiface rule anchors on `down` (`emit/physics.ts`),
  `sea_lantern` excluded from the lantern rule and from `support.ts`'s
  `NEEDS_GROUND` and `supportDirection` (`stdlib`); `test/support-sea-
  lantern.test.ts` (2). Baselines re-pinned: hellenist floaters 88 → 10, pirates 12,454 → 8, troy 14 → 14, every other section identical. After the fix, the
  thirteen carry 108 findings, 90 of them `unsupported.chain` — wall and fence posts whose support never reaches ground (the metropolis 46: `andesite_wall` 22, `polished_deepslate_wall` 17; troy 31: `acacia_fence` 16, `sandstone_wall` 4; the walled city 4; Hellenist `prismarine_wall` 7) — plus 5 isolated floaters, 5 lanterns, 4 ladders, 3 stairs, 1 dripstone — F23. The thirteen: all thirteen payload-identical to unit 26. Tests: FULL suite
  COUNTS Test Files 347 passed | 1 skipped (348), Tests 5680 passed | 31 skipped (5711). Files: `physics.ts`, `support.ts`, the stdlib test,
  three baselines, the record. Spend $0.
- **unit 28 — F23 attributed: lattice links, then the programs
  (2026-08-25):** `F14-PHYSICS` §F. The metropolis's 46: 22 `andesite_wall`
  and 5 `birch_fence` are the ten `surveillance_relay_mast` scatter masts —
  wall / iron bars / block / iron bars / wall — whose chain the lint ended
  at the bars; 17 `polished_deepslate_wall` are the authored
  `collapsed_highway_span`'s railing hung one column beside its deck. The
  chain walk now passes lattice links (`LATTICE_LINK`, D64): metropolis 46
  → 24, the thirteen 86. Every other cluster attributed by footprint
  to an authored program (troy's horse and siege debris, the leviathan and
  colossus, the keep, skull rock, the dreadnought, the unicorn colossus)
  except troy_k1's sandstone-wall-and-carpet prop on air (8, the life
  pass). P7 proposed (D65). Baselines: unchanged by the lattice link — troy 14, hellenist 10, pirates 8, as unit 27 pinned them. The thirteen: all thirteen payload-identical to unit 27. Tests:
  FULL suite COUNTS Test Files 347 passed | 1 skipped (348), Tests 5680 passed | 31 skipped (5711). Files: `physics.ts`, the baselines, the
  record. Spend $0.
- **unit 29 — probe pass 1 (2026-08-25):** six probe prompts
  (`tools/golden-prompts/probes.json`, one per spec §6 category),
  pre-registered in REACH before the spend, authored once against the
  current kit (`runs/probe-1`, $0.36) and scored by the icon metric
  compiling each document in-process. six of six authored (five one-shot), every icon present at document level, four form packs and the terrain kit reached for the first time, zero boxes and zero era violations; the icon verdict is deferred — the harness is authoring-only and five probes carry their icon in an `authored:` program the mode never writes (F24), so G4 is not yet counted Tools: `run.mjs` and
  `icon-metric.mjs` take `--prompts <file>` so the golden roster stays
  untouched. Tests: FULL suite COUNTS Test Files 347 passed | 1 skipped (348), Tests 5680 passed | 31 skipped (5711). Files: `probes.json`, the
  two tools, the ledger. Spend $0.36.
- **unit 30 — probe pass 2, the program stage (2026-08-25):** the six
  probes through `terrainist generate` (`generate-all.mjs` with the probe
  roster; worlds in the scratchpad, records in `runs/probe-2`), scored by
  the icon metric and read from renders. six of six generated one-shot, every icon program placed, the sky-whale dominant and read as such, the caldera a pass by read, and four fails with two causes: the fjord carved between the villages stayed dry with no diagnostic (F26, fixed here as `LOAM-I502`), and the bell, the ferry, the monastery and the pit heads authored at building scale (F27, kit-teaching) — G4 not met Landed for F26:
  `LOAM-I502 CARVE_MOSTLY_DRY` — `reportDryCarves` now measures a
  `flooded: "auto"` carve along its own floor samples and names one below
  half wet (the fjord: 10 % of its floor reaches the sea, up to 46 blocks
  above it along the rest); `coast-anchor.test.ts` +2. Tools:
  `generate-all.mjs` and `record-generate-run.mjs` take a roster argument.
  The thirteen: all thirteen payload-identical to unit 28. Tests: FULL suite COUNTS Test Files 347 passed | 1 skipped (348), Tests 5682 passed | 31 skipped (5713). Files: `stdlib
  edits/index.ts`, `compile.ts`, the registry, the test, the two tools,
  `runs/probe-2`, `docs/decks/probes/PROBE-PASS-2-2026-08-25.md`, the
  ledger. Spend $1.67.
- **unit 31 — F27 in the kit (2026-08-25):** `settlement-author.md` §9e
  gains "the centerpiece dominates" (and the `envelope` row says so);
  `settlement-core.md` and the modules regenerated by `split-kit.mjs`.
  Gate: the eleven golden prompts re-authored (`runs/after-f27`) and
  scored against the before-sample; the four probes F27 failed re-run
  through the program stage (`runs/probe-2b`). the golden gate green (11 of 11, 10 one-shot, no golden icon lost, `railway_town` FIXED), the kit paragraph shipped; of the four probes re-run through the program stage, the two villages have their fjord and its ferry and the monastery perches on its peak — two of four read as their prompts, none by the metric, which refuses span and elevation (F28) Tests: FULL suite
  COUNTS kit suites 13 files / 267 tests (kit-assembly, spec kit, agents); the golden harness is the kit gate (spec §9) and passed; no compiler code moved. Files: the kit and its generated copies, the two runs,
  `docs/decks/probes/F27-2026-08-25.md`, the ledger. Spend $1.55.
- **unit 32 — F28: the metric keeps its rule and loses the verdict
  (2026-08-25):** the four F27 probes' elevation data (`grand_gompa` base
  154 vs its complex's median 159; the bell pavilion 74 vs the village 86;
  the ferry 18 × 56 on the water at 70; the mine working at the camp's
  own base) show that no prominence rule reconciles the reads (D71).
  `icon-metric.mjs`: `medianBuilding` gains the buildings' median base and
  side; `iconDominance` reports `base`, `medianBase`, `elevation`,
  `spanRatio` and `readRequired`, and the alarm says "read it" when span
  ≥ 3× or elevation ≥ a building's height and the rule says no; `dominant`
  unchanged (D72). `icon-metric.test.ts` +2 (a long low ferry asks for a
  read with its span; a valley pavilion does not). `runs/probe-2b`
  re-scored: the ferry alone asks for a read ("not dominant by the rule (h×1.07, a×8) — read it: span ×4"); the gompa sits 5 below its complex, the bell 12 below its village, the mine level with the camp — three alarms unchanged. Tests: FULL suite COUNTS Test Files 347 passed | 1 skipped (348), Tests 5684 passed | 31 skipped (5715). Files: the tool,
  the test, the re-scored `icon-metric.json`, the ledger. Spend $0.
- **unit 33 — probe pass 3 (2026-08-25):** six new prompts
  (`tools/golden-prompts/probes-3.json`), pre-registered, through
  `terrainist generate` (worlds in the scratchpad, records in
  `runs/probe-3`, $1.70), scored by the icon metric and read from
  full-height renders (`docs/decks/probes/PROBE-PASS-3-2026-08-25.md`).
  six of six generated, five one-shot, every icon present, zero boxes; four of six pass by read — the baobab (dominant by rule too), the river forts with a river that holds and a bridge ending mid-stream, the karst, the horde camp's great tent; the mammoth fails on F27's known remainder and the lighthouse on a new cause, F29 — G4 not met Tests: FULL suite COUNTS none run — no compiler, stdlib or tool code moved in this unit; the roster, the run records and the documents only. Files: the roster,
  `runs/probe-3`, the record, the ledger. Spend $1.70.
- **unit 34 — F29: the silent fit-out speaks (2026-08-25):** the pass-3
  lighthouse's report meta (wallTop 16, flat roofTop 17,
  `ROOF_FLOURISH_RISE` 1) shows `roofPlan` null by one course; `fitLighthouse`
  keeps its bands, gallery and sea-lantern inside `if (plan !== null)`, and
  25 archetype files carry their own `roofPlan` with the same silence.
  Landed: `FitOutContext.skipped` (+ `FurnishRequest`, threaded by
  `core.ts` into `meta.fitOutSkipped`), reasons named in every copy
  (24 files, 48 sites, none skipped; stdlib 99 files / 1,752 tests), `LOAM-W524 FITOUT_ROOF_SKIPPED` from `buildings.ts`, a
  stdlib test on the lighthouse at `roof: "flat"` vs a roof with room. On
  the pass-3 document the warning reads: *"lighthouse" skipped the work
  that makes it itself — roof work: 1 course above the eave where the
  rebuild needs 2*. Census: `roofPlan` ×25 filed (D76). The thirteen: all thirteen payload-identical to unit 30; W524 on the thirteen: troy_k1 .
  Tests: FULL suite COUNTS Test Files 348 passed | 1 skipped (349), Tests 5686 passed | 31 skipped (5717). Files: `archetypes-civic.ts`,
  `archetypes.ts`, `core.ts`, 25 archetype files, `buildings.ts`, the
  registry, the test, the census, the ledger. Spend $0.
- **unit 35 — probe pass 4 (2026-08-25):** six new prompts
  (`tools/golden-prompts/probes-4.json`), pre-registered, through
  `terrainist generate` (worlds in the scratchpad, records in
  `runs/probe-4`, $1.49), scored by the icon metric and read from
  full-height renders (`docs/decks/probes/PROBE-PASS-4-2026-08-25.md`).
  six of six one-shot, every icon present, zero boxes; four of six pass by read — the pueblos and their bridge, the lava field, the windmill (dominant by rule; its fit-out ran), the meteorite (dominant, though demoted out of its square); the frontier water tower fails on F27's remainder and the flood delta on a new cause, F30, no seat over water (P8) — G4 not met. Pass 3's "thin yurt rings" corrected: seven yurts placed Tests: FULL suite COUNTS none run — no compiler, stdlib or tool code moved in this unit. Files: the roster,
  `runs/probe-4`, the record, the ledger. Spend $1.49.
- **unit 36 — P6 part one: a terrace can ruin (2026-08-25):**
  `stdlib/structures/terrace.ts` gains `TERRACE_DECAY` (off),
  `decayTerraceBays` — each bay in its own frame (interior `1..w`, party
  walls at `0` and `w + 1`, the shared near and far rows, `wallTop =
  floors × storey`, the bay's coping as `roofTop`, its door on the front
  row) run through `decayShellChecked`, `decayProfileFor` and
  `settleDecayedFixtures`, the reports summed — and the call under the
  switch; `TerraceRequest` takes `decay`/`decayReport`, `core.ts` passes
  them and the result meta carries `decay` (so `W511` stops naming the
  terrace once on). `stdlib/test/terrace-decay.test.ts` (3): ships off; off,
  a terrace asked for with decay is byte-identical to one without; the
  per-bay pass on an emitted 31 × 13 two-storey terrace writes air over standing courses (mode "shell", written > 0). The
  thirteen: all thirteen payload-identical to unit 34. Tests: FULL suite Test Files 349 passed | 1 skipped (350), Tests 5689 passed | 31 skipped (5720). Files: `terrace.ts`,
  `core.ts`, the test, the ledger. Spend $0.
- **unit 37 — P6 part two (2026-08-25):** `TERRACE_DECAY_ROLL` in
  `layout/district.ts` rolls each terrace run (first lot, its block) and
  hands the job `decay`; `I512` counts the runs; landed off and identical
  on the thirteen (`bi/u37off` ≡ `bi/u36`), flipped with `TERRACE_DECAY`
  and attributed (`bi/u37on`: k1 metropolis 59/66 runs, 54 shells, field
  0 → 40 151; pirates ×2 one run each); read against T6 — shipped.
  `compiler/test/terrace-decay-roll.test.ts` compiles the real k1
  document; the unit-36 tests re-pinned on. Tests: FULL suite 2 failed | 348 passed | 1 skipped (351) files, 1 failed | 5658 passed | 62 skipped tests — both re-run green alone: `ground-probe-harness` 'pirates' after its baseline was re-pinned (the document moved with the flip), and `devworld`, whose `beforeAll` had hit the 300 s hook timeout under a killed earlier run's four orphaned workers (31 passed).
  Files: `district.ts`, `terrace.ts`, two tests, the `pirates` ground-probe
  baseline, the metropolis record §F, the census (1.14, 1.22), the ledger.
  Spend $0.
