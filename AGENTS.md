# Terrainist — working in this codebase

Text prompt → Minecraft Java world. Two stages, cleanly split:

- The **Generator** (`packages/agents`) — the only place a model is ever
  called. It authors a **Loam 1** document from a **kit** (its system prompt,
  read from `kits/` at run time); the validator's diagnostics drive retries.
- The **Compiler** (`packages/compiler`) — a pure function
  (document, seed) → world folder. No model in the loop; the same inputs
  always produce a byte-identical world.

A kit teaches what the code does, never a workaround, and never by example;
the code's own vocabulary lives in its docblocks.

## Layout

npm-workspaces monorepo built with `tsc -b` (Node ≥ 22):

| Path | What it is |
| --- | --- |
| `packages/spec` | Loam 1: vocabulary, validator, lowering, diagnostics. `@terrainist/spec/ir` is the lowered profile the compiler reads — internal |
| `packages/stdlib` | The structure catalog (archetypes, props, materials, form packs), noise, terrain edit verbs, classification |
| `packages/compiler` | Terrain, layout solve, ground contract, structures, programs; emits Anvil region files |
| `packages/agents` | The Generator: model plumbing, intent pre-pass, document author, program author |
| `packages/cli` | The `terrainist` command: generate, compile, install, kit, catalog, ui |
| `kits/` | The Generator's system prompt. `settlement-author.md` is **generated**: edit `kits/src/settlement-author.md` and run `npm run kit` |
| `tools/kit` | The kit builder |

## Invariants

- **Determinism**: no wall-clock and no unseeded randomness anywhere in the
  compiler; every random draw derives from `hash(worldSeed, nodePath)`.
- **Coordinate-free authoring**: the model never writes absolute coordinates —
  placement comes from sizes and `where` relations the layout solver resolves.
- **Emit target**: Minecraft Java, pinned to DataVersion 4671 (1.21.11), the
  newest the PrismarineJS stack supports; the client auto-upgrades on load.

## Working rules

- Build `npm run build`; test `npm test`.
- Compiler-package suites compile whole worlds: run them with
  `NODE_OPTIONS=--max-old-space-size=8192` and `--maxWorkers=4`.
- Never run formatters.
- Compare worlds by their compile report and by walking them, never by raw
  region bytes — the zlib stream is not stable across Node upgrades.
- Installing into a real Minecraft saves directory is side-effecting:
  `terrainist install` never replaces a world and never deletes anything
  there; a name collision installs alongside with a suffix.
