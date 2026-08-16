# Web viewer

A Terrainist world, walkable in a browser, with **zero Minecraft code and zero
Mojang assets**. The payload is block names and occupancy; the look on top of it
is ours plus a libre Luanti texture pack. This is the scaffolding for the
terrainist.com landing experience — prompt typed, fade, and you are standing in
the world — and nothing about its *look* is decided yet.

## Export a world

```sh
npm run build                      # from the repo root
node packages/cli/dist/index.js export-web <doc.loam.json> \
  --out tools/web-viewer/worlds/<name>
```

`worlds/` is gitignored: an export is a build artifact, not source.

## Serve it

```sh
cd tools/web-viewer && npm install     # once: three.js, nothing else
npx serve .                            # or: python3 -m http.server 8765
open http://localhost:8765/
```

The default world is `worlds/unicorn_pirate_isles` — a Luna-authored two-island
document, exported through the real pipeline, whose `meta.prompt` is what the
landing types out.

The page needs a *server* — `file://` blocks module imports, workers and
`fetch`.

| query | |
| --- | --- |
| `?world=worlds/<name>` | pick a world |
| `?nolanding=1` | skip the typed intro and drop straight in |
| `?bench=1` | timing instrumentation; `B` prints the table, and it prints itself after 20 s |

## Controls

| key | |
| --- | --- |
| click | grab the mouse (pointer lock); `esc` releases |
| W A S D | move |
| space / C | up / down (fly mode) |
| shift | slow down (fly mode) |
| space | jump (walk mode) |
| G | toggle fly ↔ walk |

## How it works

- `src/format.js` — the wire format: gzipped, palette-indexed, run-length-coded
  16×16 chunks, y-trimmed per chunk. Mirrors
  `packages/compiler/src/export/web.ts`.
- `src/loader.js` — fetch + `DecompressionStream("gzip")`. No inflate library.
- `src/worker.js` — **the whole load path**: fetch, gunzip, decode and mesh, on
  a worker thread, with finished vertex buffers *transferred* back rather than
  copied. Nearest-and-in-front first, one chunk per macrotask so a turn of the
  camera re-orders the queue.
- `src/mesher.js` — voxels to triangles. Hidden faces culled, coplanar faces of
  identical block and identical AO merged into single quads (about a third of
  the triangles gone on the hero world), four-sample ambient occlusion baked
  into the vertex colour with a fixed sun. Imports nothing; testable in node.
- `src/appearance.js` — flat colour and a rough box per block family, with a
  deterministic pastel for anything unlisted. Still the floor everything else
  stands on.
- `src/textures.js` — Minecraft block name → RE:Fi texture files, per face.
- `src/atlas.js` — the runtime atlas: every tile drawn 2×2 into a padded cell so
  a merged quad can wrap inside it without a mip bleeding across the border.
- `src/main.js` — three.js, the camera, collision, streaming, a hand-written
  block shader, a capped number of GPU uploads per frame, and the landing.

`globalThis.terrainist.player.position.set(x, y, z)` from the console
teleports, which is how a screenshot of a particular place gets taken twice.

## The textures

RE:Fi by MysticTempest, **CC BY-SA 4.0**, vendored under `textures/refi/` —
only the 378 files the mapping table asks for. Read `textures/ATTRIBUTION.md`
before touching them: the licence is share-alike and the credit line in
`index.html` is an obligation, not decoration.

A block the table does not name renders exactly as it did before there were any
textures at all: it points at the atlas's white cell and its flat colour comes
through the multiply untouched. Coverage is allowed to be partial. To grow it,
edit `src/textures.js` and re-run the vendoring:

```sh
node tools/vendor-textures.mjs --pack /path/to/refi_textures --check   # report
node tools/vendor-textures.mjs --pack /path/to/refi_textures           # copy
```

## Measuring

```sh
node tools/bench-mesh.mjs --radius 6      # the mesher, on a real export
```

Meshing the 111-chunk spawn neighbourhood of `isles_of_war`:

| | before | after |
| --- | --- | --- |
| mesh ms / chunk | 22.0 | 3.6 |
| triangles | 538,874 | 339,378 |

Merging alone accounts for the triangles (−37% here, −57% on
`unicorn_pirate_isles`, whose spawn looks out over water).

…and none of the remaining 3.6 ms is on the render thread. The three changes
behind that, in order of size: the mesher reads its section's neighbourhood into
one padded grid instead of calling the sampler ~150,000 times; `WorldView`
remembers the last chunk it looked up instead of building a string key per
sample; and coplanar faces merge.

## Known gaps (deliberate)

- Stairs render as full cubes; every other partial block is one box, so a
  texture on a fence is the fence texture on a post.
- Plants are boxes with an alpha-cutout texture, not crossed planes.
- Fog is tuned for standing on the ground; from high altitude the world fades.
- No block entities, no signs, no entities, no time of day.
- One worker. A pool would help a machine that can stream faster than it can
  mesh; on the hero world the network gets there first.
