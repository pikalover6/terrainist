# Terrainist — Design & Plan

> Output of GOAL 0 (preliminary planning consult, 2026-07-27). Supersedes
> `rough-vision.txt` as the working document; the original is preserved at the
> repo root as a historical reference and must not be deleted.

## Product

Text prompt → downloadable Minecraft world .zip, at an affordable price.
LLMs author a rich intermediate spec; a deterministic compiler turns the spec
into a world. LLMs never emit absolute coordinates — the spec makes that
unnecessary.

## Locked decisions

| Decision | Choice | Notes |
|---|---|---|
| Spec language name | **Loam** | "The fertile ground worlds grow from." |
| Stack | **TypeScript monorepo** | deepslate + PrismarineJS ecosystem; one language through to the web product. |
| Minecraft target | **Java, latest (26.2 at time of writing)** | Verified 2026-07-27: prismarine stack supports up to 1.21.11 (DataVersion 4671), not yet 26.x — so we **emit at 1.21.11** and rely on the client's automatic world upgrade on load. Revisit as libraries catch up; a native 26.x emitter is a possible later product-polish item. Bedrock is a later product decision. |
| Planner / implementer models | Opus 5 (plan) + GLM 5.2 (implement), via OpenRouter | Starting hypothesis; models are config, not architecture. Revisit with G3 cost/quality data. |

## Loam: the spec language

A four-layer stack. The layering is what makes it modular enough for
multi-agent decomposition and parallel compilation.

### L3 — Style directives
World-level inherited context: era, mood, block palettes, architectural
motifs, biome themes. Keeps hundreds of independently-generated subtrees
coherent.

### L2 — Scene graph + constraints
The layer agents mostly write. A tree of nodes (world → region → district →
feature). Each node declares:

- **kind** — `composite` (subdivide), `generator` (procedural program),
  `asset` (AI-generated mesh), or `primitive` (direct voxel ops). The agent's
  "do I subdivide?" decision is exactly this four-way choice.
- **envelope** — a requested bounding volume, *not* a position.
- **constraints** — relations to siblings/ancestors: `within`, `adjacent-to`,
  `facing`, `along(road)`, `distance(min,max)`,
  `connected(to, via: tunnel|road|bridge)`.
- **ports** — named interface points (`main_door`, `tunnel_stub`). Roads,
  paths, and tunnels connect ports; this is how "the church and town hall are
  connected by an underground tunnel" is a first-class, solvable statement.
- **seed** — derived: `hash(worldSeed, nodePath)`. Any subtree is
  reproducible in isolation.

Sketch:

```yaml
node:
  id: cathedral_of_the_cat
  kind: asset
  envelope: { shape: box, size: [80, 60, 80] }
  constraints:
    - within: old_town
    - facing: plaza.center
    - connected: { to: town_hall.tunnel_stub, via: tunnel, style: ancient_brick }
  ports:
    main_door: { face: south }
```

### L1 — Generators
Deterministic parameterized programs producing voxels. Two flavors:

- **stdlib** — curated, tested: noise/density terrain, forest scatter, road
  networks, cave carvers, parameterized building grammar. Cheap (zero tokens
  once parameterized) and reliable; bias toward these.
- **authored** — LLM-written TypeScript against a strict sandboxed API: no
  IO, no clock, injected PRNG. This is the "write a program that generates a
  whole town of unique-but-similar houses" idea as a core primitive, and the
  controlled version of on-the-fly spec extension.

### L0 — Voxel IR
What everything compiles to: palette-symbol block placements and CSG ops
(fill, prism, union, **carve**, intersect). Rarely hand-written; exists so
nothing is magic.

## Compiler pipeline

Deterministic and parallelizable:

1. Parse + validate (JSON Schema)
2. Inherit L3 styles
3. **Layout solve** — hierarchical: place children within parent envelope.
   Start with simple deterministic packing/relaxation, not SAT. Upgradable in
   isolation.
4. **Generator expansion** — sibling subtrees compile in parallel.
5. CSG merge with precedence rules.
6. **Connective pass** — roads/paths/tunnels routed by pathfinding over
   now-concrete geometry. Connections must be a late pass: you can't route a
   tunnel until both endpoints exist.
7. Decoration scatter (respects occupancy).
8. Lighting + heightmaps.
9. Anvil emit → world .zip.

Determinism rules: every random draw seeded by `hash(worldSeed, nodePath)`;
no wall-clock; sandboxed generators; asset outputs content-addressed and
cached (reproducible after first generation).

## Asset (Tripo) integration

The `asset` node kind is in the schema from v0 even though the pipeline lands
at G6 — the interface exists from day one so it's never bolted on.

- Node carries: prompt, target dimensions, palette-mapping hints, and a
  **boolean role**: `solid` | `shell` | `carve`.
- Pipeline: Tripo mesh → voxelize (own TS voxelizer, three.js raycasting) →
  block matching (color/texture data + L3 style hints) → Sponge `.schem` as
  internal asset interchange → placement.
- "Museum inside a giant ice-cream cone": the cone is a `shell` asset —
  voxelize, hollow by offset, and the cavity becomes an envelope that child
  nodes fill. A compiler feature, not a hack.

## Agent architecture (thin until the spec proves out)

- **Subdivision is a contract, not a vibe.** Parent hands each child:
  envelope + ports + style context + token budget. Child returns a subtree
  honoring it. Reassembly is mechanical; sibling agents parallelize safely.
- Planner (Opus) emits L3 + top-of-tree L2 skeleton; implementers (GLM)
  expand nodes under the contract.
- **Two feedback loops, cheapest first:**
  1. *Deterministic validators* — lints on compiled output: envelope
     overflow, floating structures, doors into walls, disconnected road
     graphs, unreachable ports.
  2. *Render critique* — deepslate headless multi-angle renders + vision
     model review, gating a repair iteration.
  Both built in at G3, addressing "agents missed things I only found walking
  around the world."
- Cost control: stdlib bias, subtree caching keyed on (spec-hash, seed),
  per-node token budgets.

## Prior art to leverage

- **deepslate** (Misode, TS) — NBT, block states, headless rendering; powers
  misode.github.io worldgen previews, so may give us vanilla-compatible
  density-function evaluation for the terrain stdlib.
- **PrismarineJS** — `prismarine-provider-anvil`, `prismarine-chunk`,
  `prismarine-nbt`, `minecraft-data`. If modern-version support lags, the
  Anvil format is documented; writing our own emitter is contained.
- **Vanilla datapack worldgen** — density functions, placed/configured
  features, jigsaw: design reference (proof that declarative → deterministic
  world works; but it's chunk-local — our global layout layer is the moat).
- **Sponge Schematic (.schem)** — asset interchange; free WorldEdit compat.
- **Terra (PolyhedralDev)**, **WorldPainter** — mine for ideas, not code.
- **FastNoiseLite** (TS port) — noise primitives.
- **Tripo API** — meshes. Block↔color data from client-jar textures or
  existing datasets (e.g. Mineways).

## Risks, ranked

1. **Layout solver quality** — bad placement ruins good structures.
   Hierarchical solving keeps subproblems small; upgrade in isolation.
2. **Anvil emit correctness on 26.2** — de-risked as the G1 spike; fallback:
   pin one release back.
3. **LLM-authored generators have bugs** — narrow sandbox API, per-generator
   render tests, stdlib bias.
4. **Cost per world** — unknown until G3; caching + budgets designed in.
5. **Voxelized-mesh palette quality** — accept and iterate.

## Roadmap

- **G1 — Scaffold.** Monorepo packages: `spec`, `compiler`, `stdlib`,
  `render`, `agents`, `cli`. Spike: hand-written minimal spec → Anvil emit →
  world loads in a real client (glass pyramid at spawn) → deepslate headless
  render in CI. Golden-file determinism test from day one.
- **G2 — Terrain-only Loam v0.** L3 styles + terrain nodes + stdlib
  noise/density terrain, biomes, water, tree scatter. Accept: hand-written
  spec → landscape worth walking around in, twice, byte-identically.
- **G3 — Minimal e2e.** Prompt → Opus plan → GLM fills terrain nodes →
  compile → validators + render critique → one repair pass → zip. Accept:
  "misty fjords with a black-sand coast" works hands-off; record cost and
  wall-clock.
- **G4 — Structures v0.** Building-grammar stdlib, road network, layout
  solver v1, ports. Accept: a coherent small village.
- **G5 — Connectivity & underground.** Tunnel/path routing, interiors,
  caves. Accept: the church–townhall tunnel sentence works.
- **G6 — Asset pipeline.** Mesh → voxels → palette → .schem → placement,
  including `shell` + carve. Accept: the cat-shaped cathedral.
- **G7 — Full themed-town run** of "ruined ancient city that worshipped cats
  as gods"; then stdlib breadth, then productization (web, payments) —
  planned in detail at that point.

## Post-G1 decisions (2026-07-28, ratified with Kai)

G1 accepted: the glass-pyramid world loads in a real 26.2 client. From
review of `docs/LOAM-SPEC-v0.1.md` §12: Q6 (route corridors — build as
specified, budget a corridor→place→re-route iteration at G4), Q9 (own
polynomial `ctx.math`, integer/fixed-point bias, cross-arch CI at G2),
Q11 (implicit pipeline stages, no `after` constraint; delete the stray
`after` in Example A in v0.2), Q17 (one-tick fluid-settling validator at
G2) are all ratified per the spec's recommendations.

Three further directions, to fold into Loam v0.2 and G2+:

1. **Spec delivery to agents: role-scoped kits, not spec-dump, not RAG.**
   Compiled, versioned excerpts per agent role (terrain-node author,
   subdivider, generator author, asset prompter): common node-anatomy core +
   role-relevant sections + worked examples that CI-validate against the
   schema so kits cannot drift. Constrained decoding owns syntax; the
   contract block owns situational context; kits teach only role semantics.
   Validation failures trigger diagnostic-driven retry (attach the §13
   diagnostic + relevant spec excerpt to the repair prompt). RAG only as a
   small deterministic `loam-doc <topic>` lookup tool — similarity-search
   context assembly is nondeterministic and stays out of the main path.

2. **Coarse placement vocabulary (v0.2).** Frame-relative soft constraints:
   compass zones over the parent envelope (nine-grid + edge/center), coarse
   fractional position hints, and terrain anchors (`on: coastline`,
   `at: peak`, `beside: river`) resolved against computed terrain products
   during layout. Handles "volcano in the center, pyramids up north, port on
   the southeast coast" without model-computed coordinates.

3. **Terrain features are field edits, never stamped structures.** The
   master heightfield/density function = base field + a stack of
   model-authored "terrain verbs" (raise-ridge, carve-valley, volcano,
   river, plateau, basin...), each a kernel blended with falloff; composed
   in deterministic order and evaluated once, with biomes/moisture/foliage
   derived from the final field. Terrain features are named nodes exposing
   anchors (peak, pass, foot, side-a/side-b) so structures constrain
   against them and repair loops can address them by name. **Macro terrain
   is model-authored**: every feature above a size threshold exists as a
   named node in the planner's terrain plan; regions may explicitly opt
   into a procedural wilderness generator when specifics don't matter.
   This is the heart of G2's scope.

## Keys

OpenRouter + Tripo keys provided by Kai when needed (G3 / G6).
