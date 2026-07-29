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
- Status (2026-07-28): G1–G3 complete and human-accepted through the GLM 5.2
  e2e; G2.5 terrain-quality pass done (organic kernels, hydrology,
  climate-gated snow, lushness). G4 (settlement profile, layout solver v1,
  building grammar, roads) plus the pre-implementation program (rounds A–E:
  caves + tunnels, `prop.place@0`, L/T `wing` footprints, seven new
  archetypes with upper-floor fit-out, the dev-world exhibit grid, and the
  Round E wiring) is CODE-COMPLETE PENDING JOINT IN-GAME TESTING WITH KAI.
  Both shipped worlds lint zero on every physics rule and the village example
  compiles with zero error/warning diagnostics, but nothing has been walked in
  the client; do not iterate on village visuals without Kai. See the dated
  status block in `docs/DESIGN.md` for what each round added.
- **Standing decisions (2026-07-29, Kai):** the Opus 5 planner is canned
  indefinitely — production authoring is pure GLM 5.2 (cheapness is a core
  goal); escalate only if GLM hits a hard capability wall. The
  critique→repair pass stays MANUAL — Kai reviews; never build autonomous
  repair iteration.
