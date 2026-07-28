# Terrainist

Text prompt → Minecraft world `.zip`. LLMs author a deterministic spec
language ("Loam"); a TypeScript compiler turns Loam into a Java Edition world.

Start with [`docs/DESIGN.md`](docs/DESIGN.md) — the working design and roadmap.
[`CLAUDE.md`](CLAUDE.md) covers ground rules and the development workflow.

TypeScript npm-workspaces monorepo; packages live in `packages/`: `spec`,
`compiler`, `stdlib`, `render`, `agents`, `cli`. Requires Node >= 22.

    npm install
    npm run build
    npm test
