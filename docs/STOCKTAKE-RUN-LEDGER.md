# THE STOCKTAKE RUN — ledger

STATUS: RUNNING

Spec: `docs/STOCKTAKE-RUN-SPEC.md` (immutable). This file is the Run's only
running state. The NOW block is rewritten at the end of every turn.

## NOW

- **In flight:** nothing — unit 4 (the flip) is committed.
- **Next unit:** unit 5 — spec §10.2, second item: **montfort's hillside
  replan** (T4: one keep and five houses in a full circuit,
  `docs/decks/montfort_hill_k1/`; the before-sample `walled_medieval_city`
  reads ~12 buildings in a full wall). montfort_k1 was byte-identical at the
  kerb flip, so its sparsity has another cause. Probe first: the compile
  report's district stats (blocks, lots, lotsDropped, bareBlocks, terraces),
  its `levels`/`seams`, `W527 WALLED_QUARTER_SPARSE` and the walled-coverage
  numbers, then the lot planner on that hillside (`hillside` site plan,
  `frontageLots`, the leaf cap). Compare against troy_r22 at the flip (45
  buildings inside its wall). Bug → code-first under law 5; feature → staged
  or proposed. Open a station 7 (walled_medieval_city) read in
  `docs/decks/before-sample/VERDICT.md` with the result. After that:
  hellenist's density (§10.2), the `I512` street probe (F4), then the icon
  metric and the rules-only kit (§10.3).
- **Last commit:** 6019bc8 (unit 3). Convention: this line names the
  previous unit's commit; the current unit's commit is HEAD.
- **Spend:** $2.29 of the $35.00 OpenRouter cap (Run-only; log-derived, D4).
- **Open decisions for Kai:** none. (Kai's post-hoc veto is open on D12.)
- **Findings queue (law 1: bugs before anything else):**
  - F1 — `railway_town` (seed 312) authored one-shot, kept 3 programs, then
    the emit refused with `LOAM-T110 UNSTABLE_FLUID` (71 canal-water blocks
    would flow); the CLI labels it a compiler bug. Document and an
    `--allow-unstable` world are recorded. Fix code-first in its own unit.
  - F2 — all four anchors differ at HEAD. **Metropolis: fixed as far as the
    ratified laws allow** (units 3–4: `SEAM_BLOCK_MIN_DROP = 2`, r5 45 → 55
    terraces; 13 attributed as an accepted residual, D12). Troy and pirates
    moved with the flip (both better); hellenist untouched — their own
    anchor diffs are still unattributed until their stations.
  - F3 — authoring regression on the metropolis prompt, lost 3-of-3 at kit
    c22cb4fe: the program-backed skyscraper-skeleton field, the river,
    `era: modern` (now `far_future`), unnamed decayed generators (now six
    named archetypes). E2/E3 pre-registration; no kit byte moves before it.
  - F4 — `LOAM-I512` claims 77 % of infill lots are "ruined shells"; the
    isometric shows intact boxes on both the anchor and the fresh world.
    Street-level probe (≥3 columns) — slop class 1 either way.
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

## SPEND

| unit | what | $ | running |
|---|---|---|---|
| 1 | before-sample: 11 golden generates (10 worlds + 1 document), 4 anchor recompiles (free) | 2.19 | 2.19 |
| 2 | metropolis bisection: one authoring-only roll (metro-roll3); recompiles, renders, bisect free | 0.10 | 2.29 |
| 3 | the lever landed off — compiles and the FULL suite only | 0.00 | 2.29 |
| 4 | the flip — compiles, renders, baselines, the FULL suite | 0.00 | 2.29 |

## VERDICTS

(pointers to `docs/decks/<deck>/VERDICT.md`)

- `docs/decks/before-sample/VERDICT.md` — station 1 metropolis_hideout:
  **FAIL** (T6, T9); stations 2–11 pending.

## REACH

(probe prompts: prompt, what it targeted, what it exercised, what failed, the cause, promoted?)

## PROPOSALS

(features skipped as too large — written up, not built)

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
