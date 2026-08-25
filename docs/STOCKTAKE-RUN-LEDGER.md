# THE STOCKTAKE RUN — ledger

STATUS: RUNNING

Spec: `docs/STOCKTAKE-RUN-SPEC.md` (immutable). This file is the Run's only
running state. The NOW block is rewritten at the end of every turn.

## NOW

- **In flight:** nothing — unit 1 (the before-sample) landed.
- **Next unit:** unit 2 — spec §10.2, starting with the r5 metropolis
  bisection. (a) Compiler: the r5 document at 9b4dd50 vs at HEAD — the
  anchor worktree `<scratchpad>/anchors/wt-9b4dd50` still holds the old
  compiler and `<scratchpad>/anchors/{head,anchor}/metropolis_r5` the two
  worlds; attribute the region-level diff (W411 64→0, W413 0→18, I526 0→16,
  T239 0→10 — `docs/decks/anchors/RECOMPILE-2026-08-25.md`) to landed
  changes, read not-worse or bug. (b) Authoring: the fresh before-sample
  metropolis document vs the r5 document — what the author no longer reaches
  for (ruins, vines, street trees, the ruined palette). Output: attribution
  in `docs/decks/anchors/` + `docs/decks/before-sample/VERDICT.md` opened
  with the metropolis station. Then montfort's hillside replan and
  hellenist's density.
- **Last commit:** 085e22d (unit 0). Convention: this line names the
  previous unit's commit; the current unit's commit is HEAD.
- **Spend:** $2.19 of the $35.00 OpenRouter cap (Run-only; log-derived, D4).
- **Open decisions for Kai:** none.
- **Findings queue (law 1: bugs before anything else):**
  - F1 — `railway_town` (seed 312) authored one-shot, kept 3 programs, then
    the emit refused with `LOAM-T110 UNSTABLE_FLUID` (71 canal-water blocks
    would flow); the CLI labels it a compiler bug. Document and an
    `--allow-unstable` world are recorded. Fix code-first in its own unit.
  - F2 — all four anchors differ at HEAD from their anchor compiles
    (determinism control passed). Attribution is unit 2 (metropolis first).

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

## SPEND

| unit | what | $ | running |
|---|---|---|---|
| 1 | before-sample: 11 golden generates (10 worlds + 1 document), 4 anchor recompiles (free) | 2.19 | 2.19 |

## VERDICTS

(pointers to `docs/decks/<deck>/VERDICT.md`)

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
