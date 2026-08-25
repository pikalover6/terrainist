# THE STOCKTAKE RUN — ledger

STATUS: RUNNING

Spec: `docs/STOCKTAKE-RUN-SPEC.md` (immutable). This file is the Run's only
running state. The NOW block is rewritten at the end of every turn.

## NOW

- **In flight:** nothing — unit 2 (the r5 metropolis bisection) landed.
- **Next unit:** unit 3 — fix F2-metropolis code-first. The r5 document at
  HEAD plans 45 terrace lots where its anchor planned 68 (envelope −27 %),
  pinned to six ratified commits (`docs/decks/anchors/METROPOLIS-R5-
  BISECTION-2026-08-25.md`; the largest step is the `TERRACE_BY_TERRAIN`
  flip `651278f`, then the election flip `7df3bb3`, `BLOCK_MULTI_RECT`
  `047dee2`). Reproduce at HEAD (`terrainist compile` of the r5 doc with
  `--report`, count `terrace_*` placements), find why the district's flat
  shelf blocks are split into levels the anchor kept whole, and land the fix
  behind a switch with law 5's staging (shasums on the three baselines + six
  k1 docs off; FULL suite; every moved baseline attributed). Gate: r5 at
  HEAD back to 68 terraces or every remaining loss read not-worse. The
  9b4dd50 worktree (own node_modules, clean build) is at
  `<scratchpad>/anchors/wt-9b4dd50`. After that: the `I512` ruined-shell
  street probe (F4), then montfort's hillside replan and hellenist's density
  (§10.2), then the icon metric (§10.3).
- **Last commit:** 2ac680a (unit 1). Convention: this line names the
  previous unit's commit; the current unit's commit is HEAD.
- **Spend:** $2.29 of the $35.00 OpenRouter cap (Run-only; log-derived, D4).
- **Open decisions for Kai:** none.
- **Findings queue (law 1: bugs before anything else):**
  - F1 — `railway_town` (seed 312) authored one-shot, kept 3 programs, then
    the emit refused with `LOAM-T110 UNSTABLE_FLUID` (71 canal-water blocks
    would flow); the CLI labels it a compiler bug. Document and an
    `--allow-unstable` world are recorded. Fix code-first in its own unit.
  - F2 — all four anchors differ at HEAD. **Metropolis: attributed and read
    WORSE** (terraces 68→45; unit 2) → unit 3 fixes it. Hellenist (4
    regions), troy (2), pirates (3): unattributed until their stations.
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

## SPEND

| unit | what | $ | running |
|---|---|---|---|
| 1 | before-sample: 11 golden generates (10 worlds + 1 document), 4 anchor recompiles (free) | 2.19 | 2.19 |
| 2 | metropolis bisection: one authoring-only roll (metro-roll3); recompiles, renders, bisect free | 0.10 | 2.29 |

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
