# Terrainist

Text prompt → Minecraft world .zip. LLMs author a deterministic spec language
("Loam"); a TypeScript compiler turns Loam into a Java Edition world.

- **Read `docs/DESIGN.md` first** — the working design/plan (Loam's four-layer
  design, compiler pipeline, agent contracts, risks, roadmap G1–G7).
- `docs/LOAM-SPEC-v0.2.md` — the exhaustive Loam syntax spec (RATIFIED
  2026-07-28). §12 still tracks open questions worth checking before building
  on low-confidence areas. v0.1 and the v0.2 amendment delta live in git
  history only.
- `docs/LOAM-TERRAIN-PROFILE-v0.md` — the normative terrain-only subset
  implemented by G2/G3.
- `rough-vision.txt` is the original vision, preserved as a historical
  reference. Never delete it; `docs/DESIGN.md` supersedes it.

## Development workflow (session orchestration)

- **Claude Fable 5 is the orchestrator** — it plans, delegates, integrates,
  and verifies; it does not grind through bulk implementation itself.
- **Implementation work is delegated to Opus 5 subagents at low reasoning
  effort** ("opus 5 low") by default — scaffolding, well-specified coding
  tasks, mechanical changes.
- **Design/spec-heavy work gets Opus 5 at default (high) reasoning**, run as
  an independent agent. Design agents write docs only and never touch code
  that parallel work has in flight.
- **Subagent effort control** (corrected 2026-07-29, measured on the wire):
  stock Claude Code DOES honor `effort:` in `.claude/agents/*.md`
  frontmatter — named levels only (integers silently dropped; loader caches
  at session start). The repo ships `impl-opus-low` / `design-opus-high`
  agent types in `.claude/agents/`. Kai's local harness additionally
  carries https://github.com/pikalover6/claude-subagents-effort, which adds
  the Agent tool's per-invocation `effort` param (vanilla lacks only that).
  New boxes need stock CC + this repo, no patch. Verify after CC updates
  with `tools/cc-effort-probe/` (free, offline).
- This is the *development* workflow. The *production* worldgen pipeline
  (Opus 5 planner + GLM 5.2 implementers via OpenRouter) is a separate
  concern — see `docs/DESIGN.md`.

## Ground rules

- Deterministic everything: same spec + seed → byte-identical world. No
  wall-clock, no unseeded randomness; RNG seeds derive from
  `hash(worldSeed, nodePath)`.
- LLMs never emit absolute coordinates — placement comes from envelopes,
  constraints, and ports resolved by the layout solver.
- Target: Minecraft Java, latest release (26.2 as of 2026-07). Emit format
  is currently pinned to **1.21.11 (DataVersion 4671)** — the newest version
  the prismarine stack supports (verified 2026-07-27); the 26.2 client
  auto-upgrades worlds on load. Revisit as libraries catch up.
- Stack: TypeScript monorepo. Key deps: deepslate (rendering/NBT),
  PrismarineJS (world IO), minecraft-data.
- Status (2026-07-29): G1–G3 complete and human-accepted through the GLM 5.2
  e2e; G2.5 terrain-quality pass done. G4 (settlement profile, layout solver
  v1, building grammar, roads), the pre-implementation program (rounds A–E:
  caves + tunnels, `prop.place@0`, L/T `wing` footprints, seven new
  archetypes, the dev-world exhibit grid) and the overnight program (W1
  corridors + tier-2 constraints + tunnel junctions + the 440-entry structure
  catalog + high-rise grammar + Terrarium v2; W2 structure blitz + vehicles +
  themed underground; W3 widened settlement kit + two GLM demo worlds; then a
  fix round closing the tunnel roof-margin escape, the `palettes.theme` false
  warning, silently-ignored prop constraints and `PROP_MAX_RELIEF`) are all
  CODE-COMPLETE PENDING JOINT IN-GAME TESTING WITH KAI. 1075 tests green;
  every shipped world lints zero on every physics rule; but **nothing has been
  walked in the client** — do not iterate on visuals without Kai. See the
  dated status blocks in `docs/DESIGN.md` for what each round added.
- **Standing decisions (2026-07-29, Kai):** the Opus 5 planner is canned
  indefinitely — production authoring is pure GLM 5.2 (cheapness is a core
  goal); escalate only if GLM hits a hard capability wall. The
  critique→repair pass stays MANUAL — Kai reviews; never build autonomous
  repair iteration.
