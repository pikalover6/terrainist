# Luna-vs-Tripo structure shootout

Two standalone tools, plus a shared interchange format, for putting a Luna-authored
structure and a Tripo-generated one side by side in one Minecraft world and walking
between them.

Nothing here is part of the compiler: the tools only *read* built packages
(`packages/*/dist`). Run them with plain Node — the repo is on Node 22, so `.ts`
files run directly via type stripping, no build step and no `tsx`.

## The interchange format

Every producer writes the same blocks JSON:

```json
{ "name": "cathedral",
  "size": [49, 33, 26],
  "blocks": [ { "x": 0, "y": 0, "z": 0, "id": "minecraft:stone_bricks" } ] }
```

Air is omitted, the min corner is `(0,0,0)`, y is up. `blocks.ts` holds the
types and `parseBlocksDoc`, which every consumer runs before trusting a file.

- `tripo-gen.ts` — prompt → Tripo text-to-3D → GLB → voxels → blocks JSON.
- `luna-structure.ts` — the Luna side (written separately).
- `assemble.ts` — N blocks JSONs → one superflat comparison world.
- `voxelize.ts` — the dependency-free GLB parser + voxelizer used by `tripo-gen.ts`.

## (a) Generate the three Tripo structures

Needs `TRIPO_API_KEY` in the repo-root `.env` or the environment; without it the
tool exits immediately, before spending anything. Each generation takes roughly
90–120 seconds end to end, so run them as background jobs.

```sh
node tools/shootout/tripo-gen.ts \
  "a ruined gothic cathedral with a standing bell tower and flying buttresses" \
  --name cathedral --out out/shootout/tripo-cathedral.blocks.json \
  --keep-glb out/shootout/glb/cathedral.glb

node tools/shootout/tripo-gen.ts \
  "a colossal petrified dragon skeleton coiled around a rock spire, half-buried" \
  --name dragon-skeleton --out out/shootout/tripo-dragon-skeleton.blocks.json \
  --keep-glb out/shootout/glb/dragon-skeleton.glb

node tools/shootout/tripo-gen.ts \
  "an ancient lighthouse built into a giant spiraling seashell" \
  --name lighthouse-shell --out out/shootout/tripo-lighthouse-shell.blocks.json \
  --keep-glb out/shootout/glb/lighthouse-shell.glb
```

Options: `--target <4..80>` sets how many blocks the longer horizontal axis spans
(default 48). `--glb <file>` voxelizes a GLB already on disk and never touches the
API — the way to re-tune `--target` without paying for the same mesh twice.

Money-safety, both directions:

- The task id is written to `<out>.task.json` the instant it is submitted, so a
  run killed mid-poll **re-polls that task** rather than submitting a new one.
- An existing output file is never regenerated; the run exits saying so. Delete
  the blocks JSON (and the `.task.json`) to redo one.

## (b) Assemble any set of blocks JSONs into one world

```sh
node tools/shootout/assemble.ts \
  out/shootout/luna-cathedral.blocks.json \
  out/shootout/luna-dragon-skeleton.blocks.json \
  out/shootout/luna-lighthouse-shell.blocks.json \
  out/shootout/tripo-cathedral.blocks.json \
  out/shootout/tripo-dragon-skeleton.blocks.json \
  out/shootout/tripo-lighthouse-shell.blocks.json \
  --out out/shootout --name shootout
```

Writes `out/shootout/shootout/` (a 1.21.11 Anvil world), `out/shootout/shootout.zip`
and the intermediate `out/shootout/shootout.spike.json`. Structures land on a grass
plane at y=64 in a row-major grid, ≥30 blocks of clear ground between footprints
(`--gap N`), with a white-concrete pillar marking each site's north-west corner.
`--no-zip` skips the archive.

Emit is the repo's own path: the sites are lowered into a `terrainist-spike-0`
document and handed to `@terrainist/compiler`'s `emitWorld` — the same function
`terrainist emit` calls — with `zipWorld` from the CLI for the archive. Fully
deterministic: same inputs, same order, byte-identical world.

## (c) Render it

```sh
node packages/cli/dist/index.js render out/shootout/shootout \
  --out out/shootout/shootout.png --scale 4
```

Or install it and walk it:

```sh
node packages/cli/dist/index.js install out/shootout/shootout --replace
```

## Tests

The voxelizer is tested entirely offline — a sphere and a torus are written as real
GLBs by `test/glb-fixture.ts`, then voxelized and checked for solidity, the torus's
hole, scale, palette banding and determinism:

```sh
npx vitest run tools/shootout
```

A hand-written structure, `fixtures/arch.blocks.json`, exercises `assemble.ts`
without any generator in the loop:

```sh
node tools/shootout/assemble.ts tools/shootout/fixtures/arch.blocks.json \
  --out out/shootout-fixture --name shootout_fixture --no-zip
```
