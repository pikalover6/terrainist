# Terrainist — working in this codebase

Text prompt → Minecraft world. LLMs author a deterministic spec language
("Loam"); a TypeScript compiler turns Loam into a Java Edition world folder.
This file is for any agent or human touching the repo. Preferences specific to
the Claude Code orchestration workflow live in `CLAUDE.md`.

## Read first

- `docs/DESIGN.md` — the working design (Loam's layers, compiler pipeline,
  agent contracts). Carries no dated status blocks by design; use git history
  for what a given round added.
- `docs/LOAM-SPEC-v0.2.md` — the ratified Loam syntax spec (§12 tracks open
  questions). `docs/LOAM-TERRAIN-PROFILE-v0.md` — the terrain-only subset.
- Ground work: `docs/GROUND-CONTRACT-v1.md` (the active rewrite — one
  baseline, one resolve, one frozen ground; staged plan in §6),
  `docs/GROUND-CONTRACT-v0.md` (the underlying contract it finishes),
  `docs/GROUND-MACHINERY-AUDIT-2026-08-20.md` (file:line map of the height
  authorities as they stood before the rewrite).
- `rough-vision.txt` is the original vision, preserved as historical
  reference. Never delete it.

## Ground rules

- **Deterministic everything**: same spec + seed → byte-identical world. No
  wall-clock, no unseeded randomness; RNG seeds derive from
  `hash(worldSeed, nodePath)`.
- LLMs never emit absolute coordinates — placement comes from envelopes,
  constraints, and ports resolved by the layout solver.
- Target: Minecraft Java, latest release. Emit format is pinned to **1.21.11
  (DataVersion 4671)** — the newest the prismarine stack supports; the client
  auto-upgrades worlds on load.
- Stack: TypeScript monorepo (`tsc -b`), packages `spec` / `stdlib` /
  `compiler` / `render` / `agents` / `cli`. Key deps: deepslate, PrismarineJS,
  minecraft-data.
- Production authoring is cheap-model-first; the pinned authoring model is
  **Gemini 3.7 Flash at effort high** (`AUTHORING_MODEL_ID`); alternatives are
  one `--model` flag away. Demos and acceptance worlds are generated
  end-to-end from a text prompt via `terrainist generate`, never
  hand-authored (hand-authored docs remain fine as test fixtures).
- Gate leniency is permanent (`SUSPENDED_GATE_CHECKS` is the design;
  LOAM-SPEC §15.2). `LOAM-E494`/`LOAM-E495` are compiler bugs, not gate
  checks, and are never suppressible.

## Current state

The active campaign is the **Stocktake Run**: `docs/STOCKTAKE-RUN-SPEC.md`
(immutable ground truth) and `docs/STOCKTAKE-RUN-LEDGER.md` (the one running
state file — read its NOW block for what is in flight). Ground work is at
the GROUND-CONTRACT-v1 end state; the probe harness
(`tools/worlds/ground-probe.mjs` + `tools/worlds/ground-probe-baselines/`)
is the acceptance bar and `packages/compiler/test/ground-probe-harness.test.ts`
enforces it.

## Build, test, verify

- Build: `npm run build` (`tsc -b`, incremental, safe to run any time).
- Tests: the constraint is heavy runs colliding, not vitest itself. A
  **FULL suite** (or any compiler-package run — those compile real 512×512
  worlds in-process, 4 workers × an 8 GB heap ceiling on a 32 GB machine)
  runs **one at a time**, always `--maxWorkers=4` with
  `NODE_OPTIONS=--max-old-space-size=8192`, and while it runs nobody else
  rebuilds dist in that tree, regenerates baselines, or starts another
  compiler-package run. Light targeted runs (spec, stdlib, agents, cli,
  render — nothing that compiles a world) may overlap a FULL run freely.
  Pipes swallow vitest exit codes — read the printed COUNTS.
- **Never run formatters.**
- Byte-identity work: build baselines from a clean checkout FIRST, in an
  isolated `git worktree` — and give the worktree its **own**
  `node_modules/@terrainist/*` relative symlinks (a shared `node_modules`
  resolves `@terrainist/*` to the shared dist and poisons the baseline).
  Compare worlds with `tools/worlds/world-payload-sha.mjs` (the decompressed
  payloads), never the raw `.mca`/`level.dat` bytes: the zlib stream is not
  stable across Node upgrades (2026-08-25, Node 26.5 → 26.7 changed every
  compressed byte of every world while every payload stayed identical).
- Never compile/emit worlds from a dist that carries in-flight code you have
  not finished verifying.
- Shared-checkout git discipline: NEVER run tree-wide git state operations
  (`git checkout -- .`, `git restore .`, `git stash`, `git clean`) in the
  shared tree, and never revert files you do not own.
- `packages/spec/src/terrain/diagnostics.ts` is a merge-collision file:
  append only, anchor inserts on named existing entries, take pre-allocated
  code numbers from the design doc rather than picking your own; the spec
  test suite asserts uniqueness/totality.
- `battery/` is read-only for agents (docs and logs are committed, worlds are
  gitignored). `battery/RELEASES.md` is the ledger of walk decks and config
  rows.

- The settlement kit has one source: `docs/kits/settlement-author.md`.
  `docs/kits/settlement-core.md` and `docs/kits/modules/` are **generated** from
  it by `node tools/golden-prompts/split-kit.mjs --kit docs/kits/settlement-author.md --out docs/kits`
  (each carries a generated-by header). Edit the author kit, regenerate, and
  commit all three together; a kit change is gated by the golden harness.

## Probes and worlds

- `tools/worlds/ground-probe.mjs <doc> <worldDir|-> [label] [--json]` —
  compiles a doc in-process and cross-attributes every ground discontinuity
  to the owning subsystem. `-` self-emits. Text mode prints ASCII maps.
- `terrainist render <worldDir> --out x.png --scale 2` — top-down render.
- `tools/worlds/block-census.mjs <worldDir> [--bbox x0,z0,x1,z1] [--match re]`
  — block-id counts read from the region files (vines, palette, water…
  inside a district); the number a render cannot give.
  It prints the top 40 ids by default: to *diff* two worlds pass
  `--top 100000 --json` and compare the full lists — a diff of two top-forty
  lists shows ids entering and leaving the list, not deltas (Stocktake D55).
- Installs go to the PrismLauncher "Fabulously Optimized" instance:
  `terrainist install <worldDir> --saves "/Users/kaihoward/Library/Application Support/PrismLauncher/instances/Fabulously Optimized/minecraft/saves"`.
  **Never `--replace`** — install alongside with `--channel <x>` or
  `--series <slug> --release <N>` (a release number is shared by a whole
  deck; the install errors on collision by design). A world an installed
  client has opened is migrated to a new region layout and reads as empty to
  our tooling — probe the compiler's own output, not opened saves.
