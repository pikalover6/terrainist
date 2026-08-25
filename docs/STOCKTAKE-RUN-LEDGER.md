# THE STOCKTAKE RUN — ledger

STATUS: RUNNING

Spec: `docs/STOCKTAKE-RUN-SPEC.md` (immutable). This file is the Run's only
running state. The NOW block is rewritten at the end of every turn.

## NOW

- **In flight:** nothing — unit 7 is committed.
- **Next unit:** unit 8 — spec §10.2, third item: **hellenist's density**
  (T7: a city is a city — troy_k1 19.7 lots per 10k envelope cells is a
  city; 2.2 and 3.2 are not). Probe first: the fresh `hellenist_harbour`
  before-sample (17 nodes, 11 archetypes; `docs/decks/before-sample/`) and
  `hellenist_sea_siege_k1` vs the r5 anchor `modern_hellenist_assault` —
  lots per 10k envelope cells, district form/density/blocks/lots/dropped
  from the compile reports, the anchor's own diff at HEAD (RECOMPILE §:
  4 regions, `I463`/`W521`/`W413` deltas) attributed, and the document diff
  (what the author asked for — density, envelope, form). Separate compiler
  from author as in unit 2. Bug → code-first under law 5; author → E1/E2
  pre-registration. Open station 3 in the before-sample verdict. After
  that: F10 (two-phase parcel growth) and F6/F7 (`W527` on the planned path
  + `SITE_STRIP_DISSOLVED`) as small units; the `I512` street probe (F4);
  then §10.3 — the icon metric, the rules-only kit, E1's three arms.
- **Last commit:** c5eb436 (unit 6). Convention: this line names the
  previous unit's commit; the current unit's commit is HEAD.
- **Spend:** $2.29 of the $35.00 OpenRouter cap (Run-only; log-derived, D4).
- **Open decisions for Kai:** none. (Post-hoc veto open on D12, D19.)
- **Findings queue (law 1: bugs before anything else):**
  - F1 — `railway_town` `LOAM-T110 UNSTABLE_FLUID` at emit (compiler bug by
    the CLI's own label; document + `--allow-unstable` world recorded).
  - F2 — anchors differ at HEAD: metropolis fixed as far as ratified laws
    allow (units 3–4); troy/pirates moved better with the kerb flip;
    hellenist unattributed until its station (unit 8).
  - F3 — metropolis authoring regression, lost 3-of-3. E2/E3.
  - F4 — `LOAM-I512` "ruined shells" vs intact boxes — street-level probe.
  - F5 — hillside `held` raster artefact — **fixed** (units 5–6).
  - F6 — `W527` gated `planned === undefined`; F7 — `SITE_STRIP_DISSOLVED`
    never existed. One small unit.
  - F8 — `frontageLots` drops: ~70 % starvation (switch exists, off — see
    F10), ~30 % diagonal geometry (P1).
  - F9 — new hillside lots' cut faces undressed (steep fixture reachability
    0.966 → 0.850) — the parked shoulder/verge item (P2); and the
    walkability audit reads zero entrance reach on montfort and the walled
    city — instrument gap.
  - F10 — `LOT_PARCEL_OWN_STATIONS` on leaves the strip's leftover ground
    unowned between pads: orphan walkable columns 14 → 898 (24 %) on
    site-plan-hillside. Needs two-phase growth (own stations first, then
    the leftovers). Off until then; the walled city's church stays `E170`.
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

## VERDICTS

(pointers to `docs/decks/<deck>/VERDICT.md`)

- `docs/decks/before-sample/VERDICT.md` — station 1 metropolis_hideout:
  **FAIL** (T6, T9); station 7 walled_medieval_city: **FAIL** (T4, T7);
  stations 2–6, 8–11 pending.

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
