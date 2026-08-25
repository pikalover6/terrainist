# THE GREAT STOCKTAKE v0 — from sprint to census

Kai's directive (2026-08-24): weeks of sprinting on surface output left slop;
the settlement kit got an independent audit (22 correctness contradictions,
11 interface risks, 9 token sinks — `~/Downloads/loam_settlement_author_kit_audit.md`);
we have never watched model behavior against the catalog; price and speed
have never been optimized; and the codebase deserves a deliberate inventory
instead of ad-hoc chipping. This document is the campaign plan: six
workstreams, most parallelizable, all measurement-first — **measure before
rebuilding, ratify before deleting.**

Seed findings already in hand:

- The settlement kit is **277KB (~70k tokens), re-sent on every authoring
  call** — input tokens dominate authoring cost. The audit's own target: a
  75–85% reduction via layered assembly, with Phase 1–2 safe under any
  architecture.
- **Catalog reach is ~2%**: two independent troy rolls produced the
  *identical* 14-archetype vocabulary out of 722 catalog entries — verbatim
  the kit's classical_mediterranean exemplar list, same forbids. The model
  parrots the worked examples; it does not explore the registry. (Kai's
  citadel instinct, confirmed: no castle/keep/gatehouse/acropolis_terrace
  in either mix.)
- ~~Compile wall time is ~3–4 minutes~~ **WRONG, corrected by E1
  (2026-08-24): the compile is 5.4 s.** The minutes were `generate` (LLM
  latency × a median 3 model runs) and the probe harness. LLM authoring is
  the e2e wall AND the cost (~$0.34/world median, ~378k input tokens).

## WS-A — Settlement-kit remediation (input: Kai's audit)

- **A1 (parallel-ready now):** the audit's Phase 1 — the 22 correctness
  reconciliations (root-child union, archetype identity, era vocab, station
  ownership, forest cardinality, …). Mechanical against the audit's line
  index; each finding is an independent edit + golden-prompt check.
  Opus-5-low fleet, one finding-cluster per agent.
- **A2:** Phase 2 — stop hand-maintaining the compiler registry in prose:
  export machine-readable schemas/registries from the compiler, generate
  the kit's tables, delete changelog/anecdote prose from runtime context.
- **A3 (design-gated, consult):** Phases 3–5 — dynamic context assembly
  (classify prompt → inject only relevant modules/catalog slices),
  validator-driven repair loop, optional planner stage. This is the
  architecture decision the audit flags; it rides A2's exports.
- **Gate:** the audit's golden-prompt suite lands FIRST (A0): pin current
  authoring behavior on ~10 representative prompts so every kit edit is
  measured against it. Kit edits are not byte-gated (LLM nondeterminism);
  the golden-prompt suite is their regression harness.

## WS-B — Terrain-kit audit

Same lens as the settlement audit, applied to `docs/kits/terrain-author.md`
(37KB — an afternoon for one agent). Deliverable: same finding taxonomy,
folded into A's remediation ladder.

## WS-C — Model-behavior audit (zero LLM spend)

The battery corpus (63 worlds × archived docs + generate logs + cohort
history) is a behavioral record nobody has read statistically. One
analysis harness over it:

- Choice histograms: archetypes, generators, constraints, form packs,
  intents — reach vs the 722-entry catalog, per prompt family.
- Harness behavior: attempts per doc, demotion rates, feedback-round
  yield, token/cost per stage, warning classes that recur.
- The **exemplar-parroting hypothesis** (seeded above): does vocabulary
  ever leave the kit's worked examples? This directly feeds A3's dynamic
  catalog injection and D's spend.
- The **set-piece ambition question** (Kai's citadel): when a prompt
  demands grandeur, does the model spend its bespoke budget there, reach
  for catalog, or satisfy it with districts? Deliverable ends in a design
  consult: catalog set-pieces vs bespoke budget vs kit steering.

## WS-D — Price optimization

- **D1:** kit slimming IS the price lever (input tokens dominate): A1+A2
  alone should cut the per-call bill materially; measure before/after on
  the golden-prompt suite.
- **D2:** model shootout (`tools/shootout` exists): current pin is
  gemini-3.7-flash; test the current cheap tier on the golden prompts,
  score by validator pass-rate + walk-proxy metrics + cost.
- **D3:** harness: fewer/cheaper feedback rounds (only actionable
  diagnostics + schema fragments, per the audit), prompt caching where the
  provider supports it, program-author call consolidation.

## WS-E — Performance (REBASED on E1's measurements, 2026-08-24)

**E1 ran; the original ladder is retired** — its ≤60s and ≤10s rungs were
built on a 3–4 minute premise that measured the wrong thing. Measured
truth: **5.4 s today**, single-threaded, never previously profiled
(emit 31% / structures 27% / scatter 18% / layout 9%; BLAKE3 alone 15.8%
of wall; full report: scratchpad perf/REPORT.md + battery of scripts).

- **"A few seconds" is the status quo. The live question is sub-second:**
  ~2.7 s from contained wins (allocation-free positionFloat — 1.40×
  measured, byte-identity asserted; memoised ground resolves; indexed
  boundary scans), **~1.25 s with ordinary engineering** (worker-parallel
  emit/scatter/field — all provably order-independent, one guaranteed by
  the determinism contract itself; specialised single-block BLAKE3; run-
  filled emit path), ~0.4 s native-extreme, where the layout solver —
  correctly sequential by definition — becomes the asymptote.
- **Runtime verdict: node stays canonical; Bun declined.** It would run
  (~2 dev-only native addons) but wins ~5–10% (startup) while doubling the
  byte-identity surface the shipping model rests on. Its one draw (native
  BLAKE3) is available on node via napi/wasm.
- The real e2e wall is LLM latency (median 3 model runs × ~99k input
  tokens) — **kit slimming (WS-A/D) is the speed lever as well as the
  price lever.**
- Byte-identity discipline binds throughout: every optimization proves
  output-identical worlds (shasums vs pre-change build) — performance work
  is the one place regressions hide silently.

## WS-F — Architectural inventory (the "glaring stuff" census)

One deliberate map, then a ratified kill-list — the currency rule extended
to code:

- **Flag graveyard:** every shipped-true flag whose false-path is dead
  (GROUND_V1_*, ROAD_SOVEREIGN-shadowed passes, DESCENT_SOLVE-bypassed,
  TERRACE_BY_TERRAIN-moot, STAIR_DRESS-off) — which off-paths are still
  load-bearing fallbacks (stair corpus: Kai-ratified fallback until native
  lands) vs deletable history.
- **Dead-pass census:** junction-steps (dead on both live paths),
  street-stairs/descent (silenced), terminus landings, §5 deletions the
  WP ladder already queued (G7 apron, G8 collapse, chunk-2 internals).
- **Seam map:** the glued-on joints — declare/build split, driver
  write-through, report vs emit block-list divergence (bit us today:
  the report snapshots spans before late passes), pavedSurfaces assembly,
  the two kit files vs compiler registries.
- Module size/cycle census (roads.ts >5k lines, types.ts as flag dump).
- Deliverable: inventory doc + kill-ladder, EACH deletion Kai-ratified,
  each landing byte-identical-or-attributed like every flip before it.

## Sequencing and the parallel grind (ratified 2026-08-24)

**Wave 1 — read-only, launched first, standing caps (Kai's call: audits +
consult before ANY fixes):** B (terrain-kit audit), C (model-behavior
harness over the battery corpus), E1 (compile profile + the *hypothetical
floor* study — what extreme measures buy: worker fleets, wasm/native/zig
hot kernels, a Bun runtime switch — desk estimates anchored to the real
profile). Subagents are fine here; nothing writes to the tree. Wave 1
lands as a consolidated findings consult.

**Wave 2 — the delicate work, multi-session (Kai's design):** kit edits
(A1/A2), architecture decisions (A3), the F kill-list, and design-heavy
items run in **parallel Claude Code sessions Kai starts in this repo and
works with directly**. This session stays MASTER ORCHESTRATOR: it assigns
each session its task + file scope via inter-session messaging, keeps the
scopes disjoint (no two sessions share a file), tracks progress, and owns
integration + commits where sessions don't. No delicate task is one-shot
by a fire-and-forget subagent.

**Campaign window:** caps stay standing (4/≤2med/≤1high) through Wave 1;
Kai designs the window from Wave 1's findings before Wave 2 scales.

D follows A/C as before; E2/E3 follow E1's data; A0 (golden-prompt suite)
is the first Wave-2 item since it writes test infrastructure.

## What does NOT move during the campaign

The ratified n13 line (bare risers, STAIR_DRESS off by walked verdict),
the byte-identity staging law, the probe-before-theorize law, battery/
read-only, and the troy last-leg queue (flight object native-first with
junction cliffs as customer #1, landmark-border rule absorbing the
terrace_steps mis-siting, entry-residue trim, shoulder/verge) — parked,
not cancelled; the campaign hardens the ground they'll build on.
