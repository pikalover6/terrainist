# Terrainist

Text prompt → Minecraft world .zip. LLMs author a deterministic spec language
("Loam"); a TypeScript compiler turns Loam into a Java Edition world.

- **Read `docs/DESIGN.md` first** — the working design/plan (Loam's four-layer
  design, compiler pipeline, agent contracts, risks, roadmap G1–G7).
- `docs/LOAM-SPEC-v0.1.md` — the exhaustive Loam v0.1 syntax spec (DRAFT,
  under human+Claude review; see its §12 open questions before building on
  any low-confidence area).
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
- Status: GOAL 0 (planning consult) complete. Next: G1 scaffold — do not
  start it without Kai's go-ahead.
