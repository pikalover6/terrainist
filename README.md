# Terrainist

Text prompt → Minecraft world `.zip`. LLMs author a deterministic spec
language ("Loam"); a TypeScript compiler turns Loam into a Java Edition world.

Start with [`docs/DESIGN.md`](docs/DESIGN.md) — the working design and roadmap.
[`CLAUDE.md`](CLAUDE.md) covers ground rules and the development workflow.
[`docs/LOAM-SPEC-v0.2.md`](docs/LOAM-SPEC-v0.2.md) is the language itself.

TypeScript npm-workspaces monorepo; packages live in `packages/`: `spec`,
`compiler`, `stdlib`, `render`, `agents`, `cli`. Requires Node >= 22.

    npm install
    npm run build
    npm test

## The CLI

Run it as `node packages/cli/dist/index.js <command>` after a build.
`terrainist <command> --help` prints the full option list.

| Command | What it does |
| --- | --- |
| `generate "<prompt>"` | The whole pipeline: an authoring model writes a Loam document, the compiler builds it, and compile findings go back for revision rounds. Needs `OPENROUTER_API_KEY`. |
| `compile <doc.loam.json>` | Build a world from a document that already exists. The command to reach for when debugging the compiler. |
| `install <worldDir>` | Copy a built world into the Minecraft saves directory. |
| `devworld` | The exhibit grid: every archetype, prop and detail the grammar can build, laid out in labelled rows on a flat plain. |
| `terrarium` | The review world — multi-structure stations wired with teleport command blocks, for walking a change rather than reading about it. |
| `catalog` | The structure registry: what Terrainist builds and what it only intends to. `--json` for the machine-readable form. |
| `review-import` | Fold an in-game review session's logs and screenshots into one session file. |
| `emit <spec.json>` | The pre-Loam spike emitter. Kept because the golden pyramid still uses it. |
| `render <worldDir>` | Render a built world to PNG, one view or all of them. |

## Ground rules that show up everywhere

Determinism is the load-bearing one: the same document and seed produce a
byte-identical world, so there is no wall-clock and no unseeded randomness
anywhere in the compiler. Authoring models never write absolute coordinates —
placement comes out of envelopes, constraints and ports, resolved by the layout
solver. See `CLAUDE.md` for the rest.
