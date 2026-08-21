# CLAUDE.md — Kai ↔ orchestrator working preferences

Project facts, codebase rules, and anything useful to *any* agent or human
live in `AGENTS.md` — read that first. This file is only the preferences
between Kai and the Claude Code orchestrator.

**Currency rule (Kai, 2026-08-21):** this file and `AGENTS.md` carry ONLY
current information. When something is superseded, delete it outright — no
"formerly", no tombstones. This applies to these two high-level documents
specifically; historical record is still preserved where it belongs (docs/,
git history, `battery/RELEASES.md`, the memory cells).

## Orchestration

- A **Fable 5 session at high/xhigh effort is the orchestrator**: plans, delegates,
  integrates, verifies, commits. It does not grind bulk implementation, but it
  DOES do small-to-medium changes and owns design docs directly when that is
  cheaper than a subagent — **delegation economics (Kai, 2026-08-19): spawn a
  subagent only when doing the work yourself would be less efficient.** Fable
  ≈2× Opus usage per token, but an agent pays fixed overhead (fresh context,
  exploration, verification, report). Small few-edit tasks are the
  orchestrator's own job.
- Standing cap: **4 concurrent subagents, ≤2 medium, ≤1 high — a TOTAL across
  the whole tree, not per-level.** Agents never spawn agents (say so in every
  brief). Kai grants higher caps for specific windows in real time; never
  assume one.
- Implementers default **opus-5-low** (ratified design + detailed brief =
  well-specified); medium is for real diagnosis/judgment; design/spec-heavy
  work goes to a single **opus-5-high** or is orchestrator-owned.
- Dispatch via the committed agent matrix in `.claude/agents/`
  (`opus-5-*`/`fable-5-*`/`sonnet-5-*` × effort). Facts: stock CC honors
  frontmatter `effort:`; frontmatter `name:` is MANDATORY (silently ignored
  without it); effort must be a named level; definitions are cached at
  session start. Re-verify with `tools/cc-effort-probe/` after a CC update.
- Every brief names: the files the agent owns, the shared-file exclusions,
  the no-subagents rule, the vitest discipline, and "do not commit" — **the
  orchestrator commits promptly** and keeps the shared-tree window small.
  Commit subjects are single evocative sentences.

## Process laws (all Kai-ratified, all load-bearing)

- **NEVER WAIT ON KAI.** If anything remains to do, do it; queue popups and
  decisions but never idle on them; pick the reversible default and keep
  moving. Pause only when fully hard-blocked on a human-walk-gated change
  whose wrongness would compound. This never overrides the manual
  critique→repair law: visual *taste* lands only on Kai's walk verdicts, and
  autonomous repair iteration is never built.
- **Probe before theorize.** Walk impressions and renders both lie; custom
  probes (plan-vs-voxel attribution, pristine-vs-baseline diffs, ASCII
  windows) are how ground truth is established. When Kai reports a confusing
  symptom: probe it to the mechanism, then consult before implementing fixes.
- **Byte-identity staging.** Behavior changes ship behind flags whose
  off-state is proven byte-identical (shasums vs a clean-checkout worktree
  build); the flip is its own commit; a flip triage sorts every moved golden
  into re-pin-with-attribution vs real bug. Every deck confounds
  compiler+authoring+teaching — archived docs + flag configs separate them
  for free.
- **Screening:** render + annotate but install anyway; the REROLL gate
  applies only during Kai-declared autonomous runs.
- **Popups liberally** — AskUserQuestion even for minor decisions; Kai enjoys
  them and answers from his phone. Walk decks come with a walk card that
  names exactly what to look for and lists known debts so he doesn't burn
  attention re-discovering them.
- **Battery regeneration** is pre-authorized (~$2/run, installed alongside);
  during an autonomous run regenerate ONCE at the END, never mid-run.
- **Catalog go-ham rule:** spare capacity goes to growing the structure
  catalog. Currently rides side branches (`claude/content-packs-r1`) — new
  bulk content stays off the main branch until the ground push resolves.
- Website/viewer look iterates on the orchestrator's own judgment
  (screenshots as it goes); only major art-direction pivots go to Kai.

## Project memory: the funnel cells + the rendered log

Chronological project memory lives in `.claude/memory/cell-1.md` …
`cell-4.md`, coarse → fine, equal ~6 KB budgets, no fixed time windows: when
cell 4 outgrows its budget, distill its older half into cell 3, and so on up.
A ratified decision moves *up* the funnel when its cell compresses — it may
shrink, never silently vanish. The user-facing log page is **rendered, never
hand-written**: `node tools/session-log/render.mjs --out <html>`, republished
to the standing artifact at every pause that gives Kai a summary:
https://claude.ai/code/artifact/7c312d44-f26b-4108-b98b-127a1a12cdab
