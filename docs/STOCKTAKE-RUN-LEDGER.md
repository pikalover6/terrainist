# THE STOCKTAKE RUN — ledger

STATUS: RUNNING

Spec: `docs/STOCKTAKE-RUN-SPEC.md` (immutable). This file is the Run's only
running state. The NOW block is rewritten at the end of every turn.

## NOW

- **In flight:** unit 0 (streamlining) landed; awaiting Kai's `/compact`,
  the resume drill, and `/goal` (spec §11).
- **Next unit:** unit 1 — the before-sample: generate the 11 golden prompts
  once at the current kit bytes (~$3.3, spec §10.1) and recompile the four
  anchors at head (free); commit the records under `docs/decks/` and
  `tools/golden-prompts/runs/`.
- **Last commit:** 9857258 (the pre-Run handoff). Convention: this line
  names the previous unit's commit; the current unit's commit is HEAD.
- **Spend:** $0.00 of the $35.00 OpenRouter cap (Run-only; the campaign's
  earlier $6.10 is not counted).
- **Open decisions for Kai:** none.

## DECISIONS

(every fork taken: the reversible default chosen, why, and how to undo it)

- **D0 (unit 0):** pruned 21 stale worktrees (scratchpad measurement trees
  on detached heads, the redundant perf worktree, the agent worktree). Their
  uncommitted diffs were flag toggles and probe edits superseded by landed
  commits; dumped to `<scratchpad>/pruned-worktree-diffs.patch` (334 KB,
  session-temp) before removal. Branches untouched (`perf/compile-ladder`,
  `claude/empty-block-freerect`, `freeze/*` all still exist). Undo: not
  needed — nothing on a branch was lost.

## SPEND

| unit | what | $ | running |
|---|---|---|---|

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
  worktrees pruned. Tests: none touched.
