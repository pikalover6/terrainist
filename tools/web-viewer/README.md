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
| `?quality=ultra\|high\|off` | pick a look for one visit, without remembering it |

## Controls

**Walking is the default.** You arrive standing on the ground at the manifest's
spawn; fly is the toggle, kept for review flights.

| key | |
| --- | --- |
| click | grab the mouse (pointer lock); `esc` releases |
| W A S D | move |
| space | jump — or, in fly mode, rise |
| ctrl, or W W | sprint |
| shift | sneak (slow); in fly mode, slow down |
| C / ctrl | descend (fly mode) |
| G, or space space | toggle walk ↔ fly |
| U | shaders: ultra → high → off |

The player is a 0.6 × 1.8 box with his eyes 1.62 up, gravity 32 b/s², a jump
that clears 1.25 blocks, 4.3 b/s walking and 5.6 sprinting, a 0.6 step-up for
slabs and carpets, and buoyancy in water. Stairs are drawn as full cubes, so
they are flagged *climbable* and get a step of a whole block — otherwise a
staircase would be a ladder of jumps. Plants have no collision box at all.

## How it works

- `src/format.js` — the wire format: gzipped, palette-indexed, run-length-coded
  16×16 chunks, y-trimmed per chunk. Mirrors
  `packages/compiler/src/export/web.ts`.
- `src/loader.js` — fetch + `DecompressionStream("gzip")`. No inflate library.
- `src/worker.js` — **the whole load path**: fetch, gunzip, decode and mesh, on
  a worker thread, with finished vertex buffers *transferred* back rather than
  copied. Nearest-and-in-front first, one chunk per macrotask so a turn of the
  camera re-orders the queue.
- `src/mesher.js` — voxels to triangles. Plants leave the box path entirely
  and come out as two crossed, alpha-cutout quads apiece, jittered off the
  lattice by a hash of their world position and never merged. Everything else:
  hidden faces culled, coplanar faces of
  identical block and identical AO merged into single quads (about a third of
  the triangles gone on the hero world), four-sample ambient occlusion baked
  into the vertex colour with a fixed sun. Imports nothing; testable in node.
- `src/appearance.js` — flat colour, a rough box, a collision height and a
  render class (`box`, `cross`, `flat`) per block family, with a deterministic
  pastel for anything unlisted. Still the floor everything else stands on.
- `src/physics.js` — the player: swept AABB collision, step-up, buoyancy,
  ground snap. Imports nothing, so the whole controller is tested in node
  against hand-written worlds and against the real exports on disk.
- `src/textures.js` — Minecraft block name → RE:Fi texture files, per face.
- `src/atlas.js` — the runtime atlas: every tile drawn 2×2 into a padded cell so
  a merged quad can wrap inside it without a mip bleeding across the border.
- `src/main.js` — three.js, the camera, collision, streaming, a capped number
  of GPU uploads per frame, and the landing.
- `src/render.js` — the shader pack: the sun's shadow pass, the HDR target, the
  post chain (god rays → bloom → grade) and the quality switch. The only file
  that imports `three/addons`.
- `src/shaders.js` — every line of GLSL the viewer owns, in one place, with the
  defines that turn each effect on. `src/sky.js`, `src/wave.js`, `src/noise.js`
  and `src/shadow.js` are the arithmetic behind it, and all four are tested in
  node.

`globalThis.terrainist.player.position.set(x, y, z)` from the console
teleports, which is how a screenshot of a particular place gets taken twice.
`terrainist.quality("high")` switches looks without touching the keyboard, and
`terrainist.shaders` is the live pack — `terrainist.shaders.gradePass.uniforms
.exposure.value = 1.3` or `.shared.sunStrength.value = 2` retunes the grade
between two screenshots, which is the only honest way to argue about it.

## The look

Golden hour, and a shader stack on top of it. In order of what a fragment
meets:

1. **The sun.** A directional light 11.5° above the horizon at a bearing hashed
   from the world's name, and a real 2048 shadow map rendered from it — one
   cascade, snapped to its own texel grid so edges do not crawl when you walk,
   sampled with a 3×3 PCF filter. The depth pass is cutout-aware, so a fern
   casts a fern; translucent geometry sits on layer 1, which the sun's camera
   does not look at, so water casts nothing.
2. **The baked term stays.** `acolor` still carries tint × face shade × AO and
   is now the *ambient* base, so an unlit face reads much as it always did and
   the sun is what is added on top.
3. **Wind.** Cross plants lean from the tip down, phased by the cell they grow
   in so both quads of one plant move together; leaves rustle on a continuous
   function of world position, so a merged quad cannot tear. The shadow pass
   animates identically or a swaying meadow throws a still shadow.
4. **Water.** A two-octave swell, a fresnel blend between the deep tone and the
   sky, a Blinn-Phong glint off the sun, and more opacity at grazing angles.
5. **Fog** the colour of the hour, warm looking into the sun and cool away.
6. **God rays,** a radial blur of the sky mask — which is free, because the
   depth buffer already says where the sky is — faded out as the sun leaves the
   frame.
7. **Bloom** (three's `UnrealBloomPass`) over an HDR target, with emissive
   blocks pushed deliberately past white so they are what blooms.
8. **The grade:** ACES, +8% saturation, a vignette and a whisper of warm
   highlights against cool shadows.
9. **Cloud shadows,** a seamless noise field generated at load from a fixed
   seed, drifting slowly through the sun term.

`U` cycles **ultra → high → off**, remembered in `localStorage`;
`?quality=` overrides for one visit without remembering it. `off` is not a
degraded version of this — it compiles the shader the viewer shipped with and
draws straight to the screen, with no target allocated at all.

| | ultra | high | off |
| --- | --- | --- | --- |
| shadow map | 2048, 3×3 PCF | 1024, 4-tap | — |
| cascade radius | 150 blocks | 120 blocks | — |
| cloud shadows | yes | — | — |
| god ray samples | 24 | 10 | — |
| bloom strength | 0.72 | 0.55 | — |
| water, wind, grade | yes | yes | — |

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
  texture on a fence is the fence texture on a post. The controller works
  around the stairs by flagging them climbable, which is a patch on the mesher
  rather than a fix to it.
- A two-block plant (tall grass, a large fern, a sunflower) is one cross
  wearing its bottom half's texture: the export carries a block name and no
  block state, so the viewer cannot tell the halves apart.
- Potted plants are a pot-sized box wearing the flower-pot texture; the plant
  in the pot is not drawn.
- Fog is tuned for standing on the ground; from high altitude the world fades.
- No block entities, no signs, no entities. The time of day is one time of day:
  a fixed late afternoon, because the whole look is tuned around it.
- **One shadow cascade.** It covers 150 blocks and fades out at its own edge;
  past that the world is lit but unshadowed, and the fog is what hides the
  seam. Water and glass cast nothing, and plants *receive* shadow at half
  strength — a cross has no honest normal, and a fully shadowed one flickers.
- One worker. A pool would help a machine that can stream faster than it can
  mesh; on the hero world the network gets there first.
