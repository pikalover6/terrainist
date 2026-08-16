# Web viewer (proof of concept)

A Terrainist world, walkable in a browser, with **zero Minecraft code and zero
Mojang assets**. The payload is block names and occupancy; every colour and
every box in here is ours. This is the scaffolding for the terrainist.com
landing experience — prompt typed, fade, and you are standing in the world —
and nothing about its *look* is decided yet.

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
open http://localhost:8765/            # ?world=worlds/<name> to pick another
```

The page needs a *server* — `file://` blocks module imports and `fetch`.

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
- `src/appearance.js` — flat colour and a rough box per block family, with a
  deterministic pastel for anything unlisted.
- `src/mesher.js` — one merged buffer per 16³ section, hidden faces culled
  against neighbours, four-sample ambient occlusion baked into vertex colours
  along with a fixed sun. Imports nothing; testable in node.
- `src/main.js` — three.js, streaming (load radius 11, mesh radius 10),
  controls, HUD.

`globalThis.terrainist.player.position.set(x, y, z)` from the console
teleports, which is how a screenshot of a particular place gets taken twice.

## Known gaps (deliberate, for the POC)

- No greedy face merging: coplanar faces are not merged, only culled.
- Stairs render as full cubes; every other partial block is one box.
- Meshing runs on the main thread (3 sections per frame), not in a worker.
- Fog is tuned for standing on the ground; from high altitude the world fades.
- No block entities, no signs, no entities, no time of day.
