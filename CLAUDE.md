# Terrainist

Text prompt → Minecraft world .zip. LLMs author a deterministic spec language
("Loam"); a TypeScript compiler turns Loam into a Java Edition world.

- **Read `docs/DESIGN.md` first** — the working design/plan (Loam's four-layer
  design, compiler pipeline, agent contracts, risks, roadmap G1–G7).
- `docs/LOAM-SPEC-v0.2.md` — the exhaustive, ratified Loam syntax spec. §12
  tracks open questions worth checking before building on low-confidence
  areas.
- `docs/LOAM-TERRAIN-PROFILE-v0.md` — the normative terrain-only subset.
- `rough-vision.txt` is the original vision, preserved as a historical
  reference. Never delete it; `docs/DESIGN.md` supersedes it.

## Project memory: the funnel cells + the rendered log

Chronological project memory lives in exactly four committed files,
`.claude/memory/cell-1.md` … `cell-4.md`, coarse → fine: cell 4 holds roughly
the last day at fine detail; cell 1 holds months at maximum compression. All
four share an equal size budget (~6 KB is the guideline, not a hard rule).
There are **no fixed time windows** — whichever agent is working on the
project compresses periodically: when cell 4 outgrows its budget, distill its
older half into cell 3, and so on up the funnel. A ratified decision or
standing constraint must move *up* the funnel when its cell is compressed —
it may shrink, never silently vanish.

The user-facing memory/log page is **rendered, never hand-written**:
`node tools/session-log/render.mjs --out <html>` combines the four cells
with the live Claude Code transcript (assistant prose only — tool calls,
diffs, reasoning traces and system noise are stripped), and the orchestrator
republishes it to the standing artifact at every pause where it would give
Kai a summary. Artifact:
https://claude.ai/code/artifact/7c312d44-f26b-4108-b98b-127a1a12cdab

**Kai wants popups liberally**: use AskUserQuestion freely, even for minor
decisions — he enjoys them and answers from his phone, so a popup rarely
blocks anything. Don't sit on a reversible-but-ambiguous choice when a popup
would settle it.

## Development workflow (session orchestration)

**Standing workflow:** a **Fable 5 session at high effort is the
orchestrator** — it plans, delegates, integrates, and verifies; it does not
grind through bulk implementation itself. It runs **up to 4 concurrent
subagents, of which at most 2 may be medium reasoning and at most 1 high
reasoning at any given time**. Kai will explicitly grant a higher cap for
specific waves in real time — never assume one. Default implementer is
`opus-5-low` for scaffolding, well-specified coding tasks, and mechanical
changes; the medium slots are for work needing real diagnosis or judgment.
Design/spec-heavy work goes to a single **Opus 5 HIGH** subagent, which
writes docs only and never touches code that parallel work has in flight.

**The cap is a TOTAL across the whole tree, not a per-level fan-out.** An
implementer subagent must not spawn subagents of its own — say so in every
brief — and the orchestrator counts any nested agent against the same
budget. Four concurrent means four agents running, full stop.

**Shared-tree git discipline:** an agent working in the shared checkout must
NEVER run tree-wide git state operations — `git checkout -- .`,
`git restore .`, `git stash` / `stash pop`, `git clean` — nor revert files
it does not own. Demonstrating a pre-fix failure or building a baseline
happens in an isolated copy (`git worktree` + direct source-path compile, or
a `cp -Rc` clone with relative `@terrainist/*` symlinks), never by rewinding
the shared tree. The orchestrator commits finished work promptly to shrink
the window.

### How to spawn subagents at a chosen model + reasoning effort

The repo commits a generic 15-type agent matrix in `.claude/agents/`:
`opus-5-*`, `fable-5-*`, `sonnet-5-*` × `low|medium|high|xhigh|max`.
Dispatch with the Agent tool by setting `subagent_type` to the type name —
e.g. `subagent_type: "opus-5-low"` — and the child runs as that model at
that effort. This works on **stock** Claude Code (including Claude Code
Cloud); no patched binary is required. So the standing workflow is:
implementation → `opus-5-low`, diagnosis → `opus-5-medium`, design →
`opus-5-high`, within the 4-total / ≤2-medium / ≤1-high cap.

Facts behind this (measured live on the wire + token counts; probe + full
tables in `tools/cc-effort-probe/`):

- Stock CC honors `effort:` in `.claude/agents/*.md` frontmatter; the
  effort lands as `output_config.effort` on the child's requests and
  changes real behavior. The parent session's effort is unaffected.
- Three SILENT traps, all guarded by
  `packages/spec/test/agent-defs.test.ts`: frontmatter `name:` is
  MANDATORY (filename is not a fallback — without it the definition is
  silently ignored, which looks exactly like "effort is broken"); effort
  must be a named level (integers silently send nothing); definitions are
  cached at session start (mid-session edits are no-ops).
- Kai's local laptop harness additionally carries
  https://github.com/pikalover6/claude-subagents-effort, which adds a
  per-invocation `effort` param on the Agent tool — a convenience, not a
  dependency; prefer the committed agent types so behavior is identical
  everywhere.
- After a Claude Code update, re-verify with `tools/cc-effort-probe/`
  (offline mode is free; `live` mode spends ~4 real requests).

This is the *development* workflow. The *production* worldgen pipeline
(model authoring via OpenRouter) is a separate concern — see
`docs/DESIGN.md`.

## Ground rules

- Deterministic everything: same spec + seed → byte-identical world. No
  wall-clock, no unseeded randomness; RNG seeds derive from
  `hash(worldSeed, nodePath)`.
- LLMs never emit absolute coordinates — placement comes from envelopes,
  constraints, and ports resolved by the layout solver.
- Target: Minecraft Java, latest release (currently 26.2). Emit format is
  pinned to **1.21.11 (DataVersion 4671)** — the newest version the
  prismarine stack supports; the client auto-upgrades worlds on load.
  Revisit as libraries catch up.
- Stack: TypeScript monorepo. Key deps: deepslate (rendering/NBT),
  PrismarineJS (world IO), minecraft-data.
- Status: the pipeline is end-to-end and walked. Terrain, the
  arterial-first settlement fabric, ~491/585 catalog archetypes, the
  `SweptProfile` linework engine (roads, walls, bridges, path-stairs), the
  semantic intent layer, the land-use biome clamp, `formPacks`, the
  `infra.entry` host, and the **bespoke tier** (model-written `authored:`
  programs, gated and frozen into the document, invoked once or scattered)
  are all shipped. ~4,280 tests; every shipped world lints zero on all 26
  physics rules. `docs/DESIGN.md` is the current state of the system — it
  carries no dated status blocks, by design; use git history for what a
  given round added. **Visual iteration still needs Kai: never tune looks
  without a walk.**
- Worlds install to the PrismLauncher "Fabulously Optimized" instance:
  `terrainist install <worldDir> --saves "/Users/kaihoward/Library/Application Support/PrismLauncher/instances/Fabulously Optimized/minecraft/saves"`.
  **Never `--replace`** — install alongside with `--channel`; name
  collisions get `-2`/`-3` suffixes and old walks stay comparable.
- **Standing decisions (Kai):** production authoring is cheap-model-first
  (cheapness is a core goal) — the Opus 5 planner is canned indefinitely;
  escalate only on a hard capability wall. The critique→repair pass stays
  MANUAL — Kai reviews; never build autonomous repair iteration. Default
  authoring model is **GPT 5.6 Luna at effort max** (`AUTHORING_MODEL_ID`);
  GLM 5.2 stays one `--model` flag away. **Demos are Luna e2e from a text
  prompt, never hand-authored worlds** — every demo/acceptance world is
  generated via `terrainist generate`, so demos measure the real product
  path (hand-authored docs remain fine as test fixtures and exhibits).
- **Standing rule (Kai): NEVER WAIT ON KAI.** If *anything* remains to do,
  do it — finish the current work, then start the next discussed/ratified
  feature without asking. Pause ONLY when fully hard blocked: a crucial
  change that cannot be verified without a human walk, where building on
  top of it being wrong would compound the damage, *and* nothing else is
  unblocked. Kai reviews whenever he can; queue popups and decisions for
  him but never idle on them — pick the reversible default, note it, and
  keep moving. This does not override the manual critique→repair law:
  visual *taste* iteration still lands only on his walk verdicts — but
  building the next ratified thing never waits for one.
