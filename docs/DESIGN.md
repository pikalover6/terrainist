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

## Status (2026-07-28, overnight session)

- **G1 ✓** (accepted in-client), **G2 ✓**, **G3 ✓** — e2e runs pure GLM 5.2
  @ high reasoning (~$0.01/world); Opus planner and render-critique→repair
  deliberately deferred by Kai.
- **G2.5 quality pass ✓**: organic kernels (`irregularity`/`meander`),
  connectivity hydrology (`flooded`), temperature-gated snow with altitude
  lapse, open-basin partial fills, volcanic banding + `lavaFlows`,
  undergrowth/flora, rock strata, ocean/lake life. Five GLM-authored worlds
  spot-checked across diverse prompts (~$0.06 total spend of a $1 budget).
- **G4 code-complete, unreviewed**: settlement profile, layout solver v1
  (tier-1 constraints, relaxation-ladder subset, solver report), ports,
  `building.grammar@0` v0, `road.network@0` v0, occupancy, pads;
  `examples/hillside-village.loam.json` compiles clean (zero diagnostics,
  deterministic). All v0.2 gaps are marked `v0.2 §x.y: not yet` in-code and
  surfaced as W407/T206/T208-style diagnostics, never silent. **No visual
  iteration has been done on G4 — pending Kai's review.**

## Status (2026-07-28, pre-implementation program, rounds A–E)

A five-round parallel program, run after the G4 review and before any
in-client testing of it. Every round was implementation, not design; the
rounds are named by what they added rather than by what they touched, because
several touched the same files.

- **A — the underground.** `cave.carver@0` in the terrain profile, and the
  settlement's own underground: `basement` on a building, `connected … via
  "tunnel"` between two, a router, a gallery, cellar portals, and the cave
  integrity + traversal rules that check them. The settlement profile
  deliberately **excludes** `cave.carver@0` until `protectTags` exists.
- **B — props.** `prop.place@0`: nine props (boats, pier, cart, wagon, rail
  line, fountain, gazebo, statue plinth), a coarse placer that resolves `zone`
  / `at` / `at: "pier"` against the finished ground, pier piles, and a
  fluid-safety check re-derived from the emitted blocks.
- **C1 — footprints.** The `wing`: L- and T-shaped plans, a generalized
  outline tracer, roof valleys, and the true cell set a building claims.
- **C2 — archetype breadth.** Seven new archetypes (church, barn, windmill,
  warehouse, market stall, library, bakery), their fit-out, a steeple with a
  bell, a windmill's sails, and — the largest single gap the grammar had —
  upper-floor fit-out for every archetype.
- **D — exhibits.** Dev-world rows for all of the above, written as data in
  `packages/compiler/src/exhibits/` and registered through one seam file.
- **E — integration.** The wiring: `wing` from a document to the grammar;
  archetype-intrinsic facades merged into the grammar's own param resolution;
  `meta.floorCells` adopted by the fit-out so furnishing spans a wing;
  `prop.place@0` wired into the structure pass; the exhibit rows and the prop
  grid assembled into the dev world (16 rows, 100 buildings, 22 props); four
  new physics rules and three fixed blind spots; a second apron underpinning
  after the roads; and the village example enriched with a chapel (an L,
  tunnelled to the great hall), a market stall, a pier and a rowboat.

Both shipped worlds — `dev_world` and `hillside_village` — read back **zero
findings under every physics rule**, and the village compiles with zero error
and zero warning diagnostics. The field goldens are unchanged; the compiled
worlds are not, and the reroll is logged in `packages/stdlib/test/golden.test.ts`
as *G5/G6-pre integration*.

**Code-complete pending joint in-game testing with Kai.** Nothing in rounds
A–E has been walked in the Minecraft client. The physics lint is the strongest
statement available without that, and its whole history is that a human found
things it could not see.

## Status (2026-07-29, overnight program: waves W1–W3 + final fix round)

Three waves of parallel implementation agents, run overnight after the
rounds A–E program, then one fix-and-tidy round to close what the waves
surfaced. As before, every wave was implementation against a settled design;
nothing here changed Loam.

- **W1 — reach.** G5 corridors (`road.network@0` route reservation at
  substage 3b) with the tier-2 `along` / `beside` / `on` constraints bound to
  them; tunnel **junctions**, where two galleries that cross share a chamber
  instead of passing blind; the **structure catalog** — one typed registry of
  every structure the project builds or intends to, now **440 entries, 80 of
  them implemented**, with `terrainist catalog` to read it and a test that
  checks every `implemented` id against the live generator registries;
  the **high-rise grammar**; and **Terrarium v2**, whose stations are
  multi-structure exhibits rather than single specimens.
- **W2 — breadth.** A broad-domain **structure blitz** across the catalog's
  empty corners; **vehicles** — ships and aircraft, with a rotated-op path
  that keeps a hull a hull at every yaw; and **themed underground**: a cellar
  or gallery may be dug as a crypt, catacombs, a vault, a wine cellar or a
  mineshaft, with an ore chamber at the far end of a working.
- **W3 — end to end.** The settlement **spec kit** widened to cover the
  breadth W1 and W2 added, so an authoring model can actually reach it; and
  two GLM-authored **demo worlds** — `examples/demo-meridian-shore.loam.json`
  and `examples/demo-saltmarsh-keep.loam.json` — kept as fixtures.
- **Final fix round (this one).** Four real defects, each fixed at source:
  1. **The tunnel roof-margin escape.** The router tested its roof margin over
     the bore's *centre line*; `checkTunnelIntegrity` measures the whole
     three-wide swath. The router's test was therefore strictly weaker than
     the validator's, and a 475-block mine gallery in a GLM-authored delta
     port ran through two columns that failed it — reported as `LOAM-W408`
     with a hint that said "this is a compiler defect", correctly. Both sides
     now go through one `requiredRoofSurfaceY`, and the router routes against
     `boreSwathGround` — the per-column minimum over the swath box, building
     footprints exempt — which is a superset of every column the validator
     visits. Agreement is now a property of the code. The reroute unmasked a
     second, latent defect: a support frame at the foot of a rise hangs its
     lantern in the block a walking agent needs to climb the step, so the
     gallery could be walked down and not up. Frames now skip a rise foot.
  2. **`style.palettes.theme`** is the documented village-theme override and
     was resolved as a block symbol, producing a bogus `LOAM-T106` on every
     document that used it. One `PALETTE_THEME_KEY` is now shared by the
     resolver and the reader.
  3. **Constraints on a `prop.place@0` node** validated and then did nothing,
     because a prop never reaches the layout solver. They now draw a
     `LOAM-W407` naming the node and every ignored constraint type, with the
     `zone`/`at`/`jitter` params as the fix.
  4. **`PROP_MAX_RELIEF`** demanded flat-to-one-block ground under any land
     prop, which no natural site offers across a 34-block drydock: it was
     unplaceable outdoors anywhere. Tolerance now scales with the footprint
     (`max(1, ceil(long/12))`) and the placer levels a pad under a prop —
     **only** when the site is rougher than one block, so small props emit no
     pad and cost exactly what they always did.

  The deltaport document is kept as `examples/demo-deltaport.loam.json` and
  compiles with **zero error-severity diagnostics**; its four `CANNOT_FIT`
  prop warnings are authoring issues and are asserted, not fixed. Field-hash
  goldens are unchanged; the compiled-world reroll for tunnel-bearing worlds
  is logged in `packages/stdlib/test/golden.test.ts`. **1075 tests green.**

Still true, and still the most important line in this file: **none of the
overnight program has been walked in the Minecraft client.** The physics lint
and the readback validators are the strongest statement available without
that, and their whole history is that a human found things they could not see.

## Status (2026-07-30, cloud session: provenance + wave 1 of the catalog)

Run while Kai's first real Terrarium session was in progress; the Terrarium
fixes stayed parked as agreed, and nothing here touches the three diagnosed
bugs. Orchestrated per the standing workflow: three `opus-5-low` implementer
tracks in worktrees, seams merged by the orchestrator.

- **Baseline/provenance (queued item 2).** A `Provenance` type in the
  compiler and a `gitProvenance()` helper in the CLI (the split keeps the
  compiler pure — provenance always arrives as an input). Stamped into the
  two sidecars only: the `compile --report` JSON and the Terrarium manifest
  (additive optional field, no format bump, no wall-clock; the byte-identity
  test still holds). `terrainist install --channel <name>` installs as
  `<world>_<name>` and rewrites `LevelName` to match, so a nightly and a
  baseline build sit side by side in the world list. The moving `baseline`
  tag itself is a convention to start exercising: tag after each joint
  review, build Terrarium worlds from it.
- **The orphaned blitz exhibit.** `BLITZ_EXHIBIT_ROWS` was exported by W2 and
  never registered, so the ten blitz archetypes had no dev-world exhibit at
  their own footprints — which is why they were never spotted as unwalked.
  Registered now; the blitz archetypes leave the base grid for the same
  reason the extended ones did (duplicate row labels).
- **Catalog wave 1 — nine archetypes, three tracks.** Town: `town_hall`,
  `school`, `bathhouse`. Trade: `tavern`, `general_store`, `apothecary`.
  Vernacular: `alpine_chalet`, `saltbox_house`, `dutch_gable_house`. All are
  fit-outs under the blitz design law, each wave in its own file with its own
  exhibit rows, tag tables inserted between blitz and extended, kit-doc
  tables added. The catalog gains an optional `wave` number so parallel
  tracks stop picking the same corners: wave 1 is the above, wave 2 stamps
  the next nine (`tudor_row`, `mediterranean_villa`, `trullo`, `courthouse`,
  `post_office`, `infirmary`, `sawmill`, `kiln`, `tannery`).

**89 implemented / 440.** Everything above is code-complete, physics-lint
clean and unwalked — wave 1's buildings join the queue for joint in-game
review with Kai.

## Status (2026-07-31, same session: the field-fix round, wave 2, Terrarium v3)

Kai's real Terrarium session came in mid-stream (chat log harvested over the
laptop bridge; his rule: **chat text is authoritative over the verdict
buttons**). Every reported defect was root-caused and fixed:

- **Hearth** — the campfire sat in the exterior wall plane (a see-through
  gap in every hearth-bearing archetype); it now stands one cell inward
  before a solid chimney breast.
- **Bed** — cottage beds now lie head-to-wall.
- **The seat rule** — a stair's `facing` is its backrest. Every stair-seat
  in the codebase opened away from its focus (inn tables, keep halls,
  gatehouse, gym, church pews, gallery benches, library chair, and the
  wave-1 rooms); all flipped, rule documented at each site.
- **Keep tables** — the trestle idiom (fence + pressure plate) is refused
  by the stack guard in three-course storeys, so big keeps had no tables;
  short storeys now use the slab idiom.
- **Wizard tower** — the enchanting table gets its bookshelf arc (a fixed
  corner had put it where the stair flight lands).
- **Greenhouse** — glazing starts at sill height, the plank roof is
  actually cleared for glass, and crops sit in raised planters out of
  boot-reach.
- **Pots** — every decorative bare `flower_pot` (renders empty) became a
  positional `potted_*` pick.
- **Granary** — hay restacked into deliberate whole piles; a stranded
  single bale is now impossible by construction.

The deeper find of the round: **the walking agent vs. the ceiling light.**
The shell hangs its lantern over the room's centre — head height in a
three-course storey — and the fit-out guard does not model head-height
blocks. Four seals fell out of that, each fixed at the geometry: the
school's aisle (now three middle columns plus a clear perimeter lane), the
bathhouse walkway (braziers and cauldron moved onto pool-corner pedestals;
benches only where a stander has headroom), and the pool divider (never on
the lantern row). A latent inn defect surfaced too: chairs placed even when
their table's cell was refused.

**Wave 2 landed as a batch-size trial** — one implementer, all nine entries
(`tudor_row`, `mediterranean_villa`, `trullo`, `courthouse`, `post_office`,
`infirmary`, `sawmill`, `kiln`, `tannery`), with the field lessons baked
into the brief. Verdict: nine per agent is comfortable; the errors that
occur are per-archetype, not per-batch. **98 implemented / 440.**

**Terrarium v3** (Kai's streamlined spec): reviewer spawns in spectator
(`GameType 3`), pass/fail command blocks are gone — chat and screenshots
are the record — and each station has two fly-through teleport cubes (lime
pad = next, red = prev, offset from the landing), whose command chains emit
the same `>> STATION <id>` markers `review-import` parses. `doMobSpawning`
was already off; now asserted (the sheep in Kai's frames were the reason).

The `.claude/hooks/session-start.sh` SessionStart hook now readies cloud
containers (deps, build, ssh client for the bridge).

Everything here is code-complete and physics-lint clean; nothing new has
been walked. The next Terrarium session runs on v3.

**Standing infrastructure debt (2026-07-31):** the one-shot dev-world
physics lint outgrew per-push CI at wave 4 — the build+walk blew a full
hour on CI hardware while all 1413 other tests stayed green. It is now
env-gated (`TERRAINIST_DEVWORLD_PHYSICS=1`) and belongs to baseline
promotion; the per-push physics gate is the Terrarium lint (every
archetype across its whole exhibit gradient, minutes, zero on every
rule). Sharding the walk per-building would bring the dev-world pass back
to CI.

**Queued for the next e2e round (Kai, 2026-07-31):** side-by-side authored
worlds, GLM 5.2 high vs **GPT 5.6 Luna max** — Luna's API price just dropped
80%, making it a live replacement candidate if quality holds at the lower
cost. Needs the Mac awake (OpenRouter key) and Kai reviewing; verify the
Luna model id against OpenRouter's catalog (`verifyModelAvailable`) before
the first run. This does not change the standing decision that production
authoring stays cheap-model-first.

## Keys

OpenRouter + Tripo keys provided by Kai when needed (G3 / G6).

## Fabric v2 + precincts (RATIFIED with Kai, 2026-07-31)

**The diagnosis (Kai, from the first showcase walk):** structures land but
worlds don't. The solver treats a settlement as a bag of buildings with
pairwise constraints, which produces correct buildings randomly sprinkled
on a lawn: no urban fabric, bare ground to the walls, a jarring edge
against the dense forests, planes resting on grass, ships at random
headings. North-star benchmark: a dense modern waterfront city should read
like the Miami/Brickell reference — landmark towers over blocks of
mid-rise fabric on a real street grid.

**The inversion:** the void defines the solid. Streets first; streets
define blocks; blocks subdivide into lots; buildings align to lot
frontage; leftover ground is *treated*, never bare.

### The four workstreams

1. **F1 — fabric core.** New settlement node kind `district`: a composite
   whose envelope gets a street skeleton BEFORE placement (`fabric:
   "grid"` → orthogonal grid with jitter; `"organic"` → relaxed/deformed
   grid). Blocks are the faces of the street graph; lots subdivide block
   perimeters; the district's child nodes are LANDMARKS placed on chosen
   lots; remaining lots are AUTO-INFILLED from a `mix` of archetypes at a
   `density`. Every lot placement is frontage-aligned: door faces its
   street, facade on the build-to line. The skeleton is handed to the
   existing road pass for grading/surfacing (streets are roads — one
   surface pipeline) and exposed as a product for dressing.
2. **F2 — ground treatment.** Lot dressing by district type (paved
   forecourts/sidewalk aprons downtown, fenced gardens in villages, gravel
   in industry); settlement-wide ground paint (worn paths, plaza
   gradients); and a clearing-transition band — meadow, scattered trees,
   stumps — between any settlement and dense forest.
3. **F3 — precinct kits.** Generator family `precinct.*@0`: deterministic
   compound layout from an envelope + params, the building grammar's
   philosophy at settlement scale. First two: `precinct.airport@0`
   (runway axis → parallel taxiway → apron grid with aircraft parked at
   stands, aligned; terminal + tower fronting the apron; hangars on the
   taxiway; windsock at the threshold) and `precinct.harbour@0` (quay
   wall along the real shoreline → piers perpendicular → ships moored
   parallel to pier axes with consistent heading → cranes on the quay,
   warehouses fronting the quay road).
4. **F4 — streetscape.** Sidewalks + curbs as bands beside every street,
   lamp posts at fixed spacing, crossings at intersections, benches and
   street furniture drawn from the district type. Driven entirely by the
   street-graph product.

### The pinned StreetGraph contract (F1 produces, F4 and roads consume)

```ts
/** One street, a 4-connected polyline in world column space. */
export interface StreetSegment {
  readonly id: string;
  /** Width class: avenue 7, street 5, lane 3 (carriageway columns). */
  readonly kind: "avenue" | "street" | "lane";
  readonly width: number;
  readonly path: readonly { readonly x: number; readonly z: number }[];
}
export interface StreetIntersection {
  readonly x: number;
  readonly z: number;
  readonly segments: readonly string[]; // segment ids meeting here
}
export interface StreetGraph {
  readonly segments: readonly StreetSegment[];
  readonly intersections: readonly StreetIntersection[];
  /** Sidewalk band width per side (columns); 2 downtown, 1 elsewhere. */
  readonly sidewalk: number;
}
```
Lives in `packages/compiler/src/layout/streets.ts`. Blocks/lots are
internal to F1; the graph above is the only cross-team surface.

### Sequencing & authoring contract

F1–F4 land as parallel tracks (F4 codes against the contract with a
fixture); the road pass keeps its successive-shortest-path role BETWEEN
districts and precincts — fabric replaces it only INSIDE a district.
After integration: one headline handwritten world (dense modern
waterfront city, Miami reference) ships first, then the five showcase
worlds re-author onto the new contract, then the GLM/Luna/DeepSeek
side-by-sides run — model comparisons before fabric v2 would measure the
old solver's ceiling, not the models.

---

## Fabric v3 — the city (RATIFIED with Kai, 2026-07-31)

### Diagnosis

Fabric v2 inverted "buildings first" into "streets first", and it worked:
Bayline is a real settlement rather than a bag of buildings on a lawn. Kai
walked it and returned a harder verdict — *"it looks entirely like something
generated procedurally… the settlements are all just rectangles with simple
grid layouts, buildings are also often touching each other, and the use of the
path block is kind of weird for a city. It's also really small compared to what
an actual minecraft city would be."*

Three structural causes, none of them tunable:

1. **The grid is the only thing the generator can express.** `buildStreetGraph`
   picks line positions per axis and draws each line edge-to-edge across a
   rectangle; `fabric: "organic"` is the same construction with ±6 jitter. No
   code path can produce a diagonal, a curve, a T-junction, a dead end or a
   non-rectangular block, and a district's outline is its authored envelope
   rect. Rectangles containing rectangles, by construction.
2. **A dense street wall cannot be built.** `LOT_SIDE_GAP.high = 0` and each lot
   raises an independent four-walled shell, so neighbours meet as two boxes back
   to back. Cities are made of continuous frontage — shared party walls, one
   cornice line, varied bays — and that primitive does not exist.
3. **City streets are surfaced as farm tracks.** `surfaceStreetGraph` uses
   `road.surface` (`dirt_path`) and `road.shoulder` (`gravel`), identical to a
   lane between two villages.

Plus scale: a 512² region with a 200×170 downtown at `blockSize` 40 is about
five city blocks by four.

### The principle

Authored-looking cities do not come from more randomness. They come from
**hierarchy and consequence**: arterials that go somewhere, districts that
differ *because of where they are*, a skyline that peaks, irregularity with a
visible cause (the river bent the grid; a diagonal cut through and left wedge
lots; the old core kept its lanes), and — at eye level — continuous frontage
with incident every few blocks. One rule applied everywhere at one frequency is
the thing that reads as generated, and jitter does not cure it.

### The seven tracks

- **U1 — urban materials.** Road classes: avenue/street tarmac with dashed
  centre lines and positional wear patching, cobbled lanes, gutters, kerbs.
  Rural `road.network@0` keeps the dirt palette.
- **U2 — the continuous street wall.** A run of lots on one block face becomes
  one terrace assembly: shared party walls, bays 6–12 wide, storey counts that
  snap to a shared cornice with deliberate steps, a continuous ground-floor
  shopfront band (door + awning per bay), per-bay roofs and facade materials,
  distinct corner units, and the block interior left as courtyard/alley.
- **U3 — scale probe.** Measurement only: compile time, RSS, output size and
  counts at 768²/1024²/1536²/2048², with a CPU profile and a failure point.
- **C1 — the city plan layer.** Arterials first, districts as the residue. The
  big one; see the contract below.
- **C2 — the skyline field.** A prominence field driving storeys, setbacks and
  rooftop kit, replacing the flat `INFILL_FLOORS.high = [3, 8]` mesa.
- **C3 — the life pass.** A dedicated eye-level stage: awnings, hanging signs,
  balconies, AC units, fire escapes, alley clutter, kerbside vehicles, market
  stalls, street trees, lit interiors.
- **C4 — set pieces and vistas.** Per city, a handful of authored anchors placed
  with axis relationships: a boulevard terminating on a landmark, a bridge on
  the river, a hillside stair district, a waterfront promenade.

### Pinned contract — CityPlan (C1 produces; C2/C3/C4 consume)

Lives in `packages/compiler/src/layout/city.ts`. This is the only cross-track
surface; a cell's internal subdivision stays private to C1 exactly as blocks and
lots stayed private to F1.

```ts
/** Radians are not used anywhere in this contract. Angles are degrees. */
export type DistrictCharacter =
  | "core" | "grid" | "rowhouse" | "lanes"
  | "industrial" | "civic" | "park" | "waterfront";

/** A city-scale road. Drawn before any district exists. */
export interface Arterial {
  readonly id: string;
  readonly kind: "boulevard" | "drive" | "diagonal" | "ring" | "spine";
  /** Carriageway columns. Wider than any StreetSegment: 9–13. */
  readonly width: number;
  /** Carriageway centre line, 4-connected, cell by cell — same shape as
   *  StreetSegment["path"], so every existing consumer walks it unchanged. */
  readonly path: readonly { readonly x: number; readonly z: number }[];
  /** Where this arterial visually ends. C4 seats a landmark on it. */
  readonly termini: readonly {
    readonly at: { readonly x: number; readonly z: number };
    /** Heading the viewer looks along, degrees, 0 = +Z, quantised to 15. */
    readonly heading: number;
  }[];
}

/** One face of the arterial network: an arbitrary polygon, not a rect. */
export interface DistrictCell {
  readonly id: string;
  readonly character: DistrictCharacter;
  /** 1 inside the cell. Row-major over `bounds`, NOT over the region. */
  readonly mask: Uint8Array;
  /** Tight bounding box of the mask, in world columns. */
  readonly bounds: Rect;
  /** Columns inside the mask. */
  readonly area: number;
  /** Local grid rotation about the bounds centre, degrees, quantised to 15. */
  readonly orientation: number;
  readonly blockSize: number;
  readonly density: "low" | "medium" | "high";
  /** Salt for this cell's palette drift, so fabric changes as you walk. */
  readonly paletteSalt: string;
}

export interface CityPlan {
  readonly bounds: Rect;
  readonly arterials: readonly Arterial[];
  readonly cells: readonly DistrictCell[];
  /** 1 on any arterial carriageway column, row-major over the region. */
  readonly arterialMask: Uint8Array;
}
```

`StreetGraphInput` gains two **optional, backwards-compatible** fields so a
cell's local fabric can be clipped and rotated; an authored rectangular district
that passes neither behaves exactly as it does today:

```ts
readonly mask?: Uint8Array;      // 1 = inside; a segment leaving the mask ends there
readonly orientation?: number;   // degrees about the bounds centre, quantised to 15
```

### Pinned contract — ProminenceField (C2)

Lives in `packages/compiler/src/layout/prominence.ts`. A pure, positional
function so it can be called from both the per-lot infill draw and a terrace's
per-bay heights without either owning it.

```ts
export interface ProminenceField {
  /** 0..1. Drives storeys, setbacks, rooftop kit and facade richness. */
  at(x: number, z: number): number;
  /** Storeys for a lot or bay whose street corner is (x, z). */
  storeys(x: number, z: number, ctx: {
    readonly density: "low" | "medium" | "high";
    readonly character?: DistrictCharacter;
    readonly archetype: string;
  }): number;
}
export function buildProminenceField(input: ProminenceInput): ProminenceField;
```

### Pinned contract — the life pass (C3)

Lives in `packages/compiler/src/structures/life.ts`. Strictly **additive** and
strictly **last**: it may only write into columns nothing else claimed, via the
same all-or-nothing `avoid` predicate the streetscape pass already takes, so a
prop that would clip a building or block the reserved walk lane is dropped whole
rather than half-written.

```ts
export function dressLife(input: LifePassInput): {
  readonly blocks: StructureBlock[];
  readonly diagnostics: Diagnostic[];
  readonly stats: Readonly<Record<string, number>>;
};
```

### Sequencing

U1/U2/U3 are already in flight and are no-regret under any version of C1. C1
lands next as the long pole; C2, C3 and C4 code against the contracts above with
fixtures, exactly as F4 coded against `StreetGraph` before F1 existed. The road
pass keeps its role BETWEEN settlements; arterials replace it INSIDE a city.
Three handwritten worlds ship on the result: the Miami reference re-authored,
plus two more chosen to exercise what a rectangle never could.

### Contract amendments during implementation

- **The life pass tests occupancy per voxel, not per column** (C3). The pinned
  contract said "columns nothing else claimed", which turned out to be far too
  coarse in practice: the building grammar's eaves and shutters already claim a
  block in nearly every street-facing apron column, so under the literal column
  rule Bayline took **50** awnings. Tested voxel by voxel with a block of
  clearance it takes **1,069**, and the voxel test is strictly *stricter* about
  what it forbids — it rules out overlap directly rather than by proxy. The
  all-or-nothing rule is unchanged, and `avoid`/`keepClear` remain an absolute
  veto with no voxel exemption. One documented exemption exists: interior room
  lights write inside a building's own column, guarded so the lantern never
  sits in the player's 1×2 body and always hangs off a valid support chain.
- **`DistrictCharacter` lives in `layout/prominence.ts`** (C2) rather than
  `layout/city.ts`, because the skyline field shipped first. C1's `city.ts`
  imports it from there instead of restating it.
- **C4 splits in two, and `CityProduct` grows two fields.** `layout/vistas.ts`
  is the planner — it reads a finished `CityPlan` and answers with `VistaAxis`
  and `SetPiece` records, writing no blocks and seating no node;
  `structures/setpieces.ts` lays the blocks, between the ground treatment (F2)
  and the life pass (C3). `CityProduct` carries `vistas` and `setPieces` so both
  the report and the structure pass read one truth. `CityPlan` itself is
  **unchanged**: C4 consumes `Arterial.termini` exactly as pinned.
- **A terminating landmark is seated by the city pass, not by the cell fabric**
  (C4). It stands on the arterial corridor at the end of an axis — ground no
  cell owns — so `city-pass.ts` builds its placement, node, ports and pad
  directly, exactly as `district.ts` does for a landmark that claimed a lot, and
  then punches the footprint out of every overlapping cell's `lotMask`. That
  punch is the only moment in the pipeline at which a district can be told "not
  here", which is also how the civic square is held open.
- **The life pass's occupancy machinery is exported, not re-implemented** (C4).
  `buildLifeWorld`, `Planter` and the four `PlaceRule`s are now `export`ed from
  `structures/life.ts` and the set-piece pass writes through them. Two additive
  passes over one finished world have to agree voxel for voxel on what "already
  taken" means; a second `solidAt` is a second answer to the only question
  either of them asks. Same argument `city.ts` makes for reusing the road
  pass's router.
- **The bridge already had a deck.** C4's first draft put a parapet on the
  carriageway edge at `half`; `buildBridgeDeck` already lays a deck one column
  wider each side with a **fence rail** on that extra column, out of **top
  slabs** — so the draft narrowed the road, built a second rail inboard of the
  first, and asked `solidAt` for support on a half block that does not report
  any. What shipped instead adds only what was missing (pylons at the abutments,
  lamps on the existing rail, a balustrade carrying the line onto the bank) and
  finds its support with a "top *occupied* voxel" probe that rejects a fluid
  surface — the fix for the one `unsupported.chain` finding this track produced.
- **The hillside stair is re-seated against the finished ground.** The plan
  chooses its strip on the heightfield as it stands *before* the quarters are
  levelled — the only field the layout stage has, since a cell's terrace pad is
  computed in the same function and applied a stage later. The structure pass
  therefore treats the strip as a direction and a rough place, sweeps a
  ten-column window on the emitted ground, and builds the steepest flight that
  is actually climbable: `need[k] = max(g[k] + 1, need[k+1] − 1)` taken
  backwards, refused whole if the bottom step ends up out of reach or any column
  would need more than four courses. Laying a stair block on every column — the
  obvious construction — fixes nothing and makes a two-block riser worse.

### U6 — landform that scales, and precincts that find their coast (2026-08-01)

U3's scale probe turned up a ship blocker rather than a performance number:
Bayline compiled at 768² and 1536² **hard-failed** on `LOAM-E170`, the harbour
finding seven or eight columns of shoreline where it needed sixteen. The cause
was not the harbour. Holding `frequency` fixed while the region grows means the
coastline does not scale with the world — it gets relatively finer and moves
somewhere else — so whether the sea happened to intersect a `zone: "south"` box
was luck. Our 512² world was partly a lucky draw.

Two independent fixes, both landed:

1. **`terrain.heightfield@0.scaleReference`** (opt-in; see
   `docs/LOAM-TERRAIN-PROFILE-v0.md`). Declares the region extent the node's
   frequencies were tuned at; the compiler divides them by the region's own
   scale factor and multiplies `warp.amount` by it. Since regions are centred on
   the origin this is an exact similarity transform: at `k = 2` the world is the
   same coastline at twice the size. Omitted, the resolver hands back the
   identical parameter object, so every world shipped before U6 emits
   byte-identically — verified by hashing Bayline, Deltamere, Kingsfall and
   `precinct-harbour` before and after.
2. **`precinct.harbour@0` seeks its coast.** When the solver's box holds no quay
   the kit censuses the world's shoreline once (16-block summed-area tables),
   ranks every aligned box of its own size, reads the best sixteen exactly and
   seats itself on the winner — scoring the longest *unbroken* quay run, water
   under the pier tips and dry ground behind the wall, biased toward the
   author's zone rather than confined to it. A hard `zone`/`at`/`within` pin
   still fails in place (`LOAM-E170`, "pinned to its envelope"); a world with no
   coast anywhere still fails, saying so instead of blaming the envelope. A move
   reports `LOAM-W409` and is substituted into the placement list every later
   pass reads, so the roads arrive at the quay that exists.

The acceptance test for the searched path is deliberately the *old* one — the
search is reachable only from states that used to be hard errors — which is what
makes the byte-identity claim structural rather than lucky.

---

## Upgrade push — Phase 0 contracts (RATIFIED 2026-08-02, with Kai)

Kai has ratified a large upgrade push. This section pins the four contracts the
push builds on, before any of it is implemented, for the same reason `StreetGraph`
and `CityPlan` were pinned: parallel tracks can code against a contract with a
fixture, and a contract that is written down can be argued with.

**Status: RATIFIED with one major amendment** — contract 2 was drafted as two
tiers with two artifact formats and came back as one, `AuthoredProgram`, for the
reason recorded there. The draft's nine open questions are answered under
*Dispositions* at the end. No code has been written against any of this yet, and
the numbers (limits, budgets, thresholds) are starting points chosen with a
reason attached, not measurements.

### 0. Where these live in Loam

Anchor first, because three of the four already have a slot in the language and
inventing parallel concepts beside them is the failure mode.

| Contract | Loam slot | New surface |
|---|---|---|
| SemanticIntent | L3 style (§2.4 era/mood/motifs, §2.5 biome themes) | one `intent` object, inheritable; the implemented profiles carry no L3 beyond `style.palettes` today |
| AuthoredProgram (landmarks **and** plugins) | L1 `authored` generator flavor (§7.6), `generator: "authored:<id>"` | a document-level `programs` map, a minimal typed API, output-hash verification, an authoring-time validation loop |
| SweptProfile | none — compiler-internal engine | one new node, `infra.wall@0`; everything else is a retrofit of existing passes |
| Biome authorship | compiler invariant + `intent.climate` | no new node kinds |

The strategic point of the bespoke tier: **both invocation modes are generated
at AUTHORING time and frozen into the document.** The compile stays a pure
function of spec + seed, the physics lint gates every block a program writes, and
a world that ships can be recompiled byte-identically with no model in the loop.

---

### 1. SemanticIntent — the author-facing dials

The problem: an authoring model today expresses "a half-abandoned desert oasis
town" by picking archetypes and palettes by hand, per node, and the coherence of
the result is luck. The two-islands case is the sharp version — a unicorn island
and a pirate island in one world must differ in palette, flora, props and
architecture, and nothing in the document says so except the archetype names the
model happened to choose for each.

Intent is the layer that says so. It is **not** a new generator and it places
nothing; it resolves to values the existing knobs already take.

#### The type

Lives in `packages/spec/src/intent/types.ts` (new); resolution in
`packages/compiler/src/intent/resolve.ts`; the fan-out registry in
`packages/compiler/src/intent/fanout.ts`.

```ts
/** A 0..1 dial. Absent means "no opinion", which is never the same as 0. */
export type Dial = number;

export interface SemanticIntent {
  /** Open vocabulary per spec §2.4; dispatched through {@link EraClass}. */
  readonly era?: string;
  /** 0 = destitute, 0.5 = ordinary, 1 = rich. */
  readonly wealth?: Dial;
  /** 0 = kept up, 1 = abandoned. Orthogonal to wealth: a rich ruin exists. */
  readonly decline?: Dial;
  /** 0 = organic vernacular, 1 = planned and monumental. */
  readonly formality?: Dial;
  readonly event?: IntentEvent;
  readonly climate?: ClimateIntent;
  readonly character?: CharacterIntent;
  /** Open extension bag, per §2.7. Never switched on by stdlib code. */
  readonly tokens?: Readonly<Record<string, string | number | boolean>>;
}

/** Closed dispatch classes the fan-out switches on. */
export type EraClass =
  | "primitive" | "ancient" | "medieval" | "renaissance"
  | "industrial" | "modern" | "far_future";

export type EventKind = "flood" | "fire" | "siege" | "boom";

export interface IntentEvent {
  readonly kind: EventKind;
  readonly severity: Dial;
  /** 0 = it is happening now, 1 = a lifetime ago and mostly healed. */
  readonly recency: Dial;
}

export interface ClimateIntent {
  /** A vanilla biome id, or a `style.biomeThemes` id. Outranks everything. */
  readonly biome?: string;
  /** −1..1, offsets the climate field over this node's footprint. */
  readonly temperature?: number;
  readonly humidity?: number;
  readonly snow?: "auto" | "never" | "always";
}

/** The unicorn-island-vs-pirate-island case. Everything that makes a region
 *  read as a different place, in one object, at one scope. */
export interface CharacterIntent {
  /** Free text, e.g. "pirate haven". Reaches prompts, never a switch. */
  readonly label?: string;
  /** A stdlib `MaterialTheme` id (packages/stdlib/src/structures/themes.ts). */
  readonly materialTheme?: string;
  /** Merged over the document's `style.palettes` within this node's subtree. */
  readonly palettes?: Readonly<Record<string, PaletteValue>>;
  readonly archetypes?: ArchetypeBias;
  readonly props?: SelectionBias;
  readonly flora?: SelectionBias;
  /** §2.4 `motifs`: the closed enums the building grammar switches on. */
  readonly motifs?: Motifs;
  /** Authored programs this region asks for — landmarks and plugins (§2). */
  readonly programs?: ProgramRequest;
}

export interface SelectionBias {
  readonly prefer?: readonly string[];
  readonly forbid?: readonly string[];
}
export interface ArchetypeBias extends SelectionBias {
  readonly weights?: Readonly<Record<string, number>>;
}
```

`era` stays an **open string** because §2.4 says so and because the product's
premise is wacky prompts; the fan-out never switches on it directly. It is
resolved once through a closed alias table to an `EraClass`, with an unknown
string reported (`W480`) and defaulted to `medieval` — our densest archetype
coverage, so the failure mode is "generic", not "empty".

#### Where it may appear, and how it inherits

- Document root (`intent` beside `style`) = world scope.
- Any `composite` region node, and on `district` / `city` / settlement roots.
- **Not** on a leaf building, prop or generator node: intent is a *context*, and
  per-building overrides are what `params` are for (`W481`, ignored).

Resolution is deep merge along the node path, per §2.8's style rules exactly:
scalars replace, objects merge key by key, **arrays replace whole**. `prefer` /
`forbid` lists therefore override rather than accumulate — accumulating them
makes "this island has no oak" unexpressible under a world that prefers oak.

The fan-out table is written for three levels — **world → region → district**.
Deeper declarations resolve correctly and are reported (`I482`) so authors stay
where the table is meaningful.

Resolution happens once, at pipeline pass 2 (inherit L3 styles), producing a
`ResolvedIntent` per node path recorded in the compile report. **Every consumer
reads the resolved record; nobody re-reads the document.** Same discipline as
`ResolvedStyle`.

#### The fan-out mapping

The table is the contract. "Today" = the knob exists and the row is wiring;
"reserved" = the row is registered as a no-op and the knob is built later by the
feature that owns it.

| Dial | Concrete knob it drives | Where that knob lives | Status |
|---|---|---|---|
| `era` | material theme selection (wood/stone/roof sets) | `stdlib/structures/themes.ts` | today |
| `era` | archetype eligibility + catalog tag filter | `stdlib/structures/catalog.ts` | today |
| `era` | `motifs.roofType` default → roof form | `building.grammar@0` | today |
| `era` | road/street material class (`road.*` vs `street.*`) | `compiler/structures/roads.ts` | today |
| `era` | high-rise eligibility + storey ceiling | `layout/prominence.ts` | today |
| `era` | vehicle + prop family (cart vs truck vs skimmer) | `stdlib/structures/props*.ts` | today |
| `wealth` (world) | material theme richness tier | `themes.ts` | today |
| `wealth` (region) | block size, lot width, frontage regularity | `layout/streets.ts`, `layout/district.ts` | today |
| `wealth` | `motifs.ornamentDensity` → facade richness | `building.grammar@0` | today |
| `wealth` | storey multiplier into the prominence field | `layout/prominence.ts` | today |
| `wealth` | ground treatment class (paved / gravel / dirt) | `structures/grounds.ts` | today |
| `wealth` | street furniture + life-pass density | `structures/streetscape.ts`, `structures/life.ts` | today |
| `decline` | decay coverage — fraction of buildings re-clad as ruins | `stdlib/structures/archetypes-relic.ts` | **needs a coverage knob**; the relic archetypes exist, a dial over a district does not |
| `decline` | vegetation reclaim (moss, vines, sapling volunteers on lots) | `structures/grounds.ts`, decorate pass | reserved |
| `decline` | lit-interior fraction, prop breakage, missing roofs | `structures/life.ts` | reserved |
| `decline` | road surface erosion / patch density | `structures/roads.ts` (wear mix exists) | today |
| `formality` | district fabric (`grid` vs `organic`), diagonal count | `spec/settlement` `DistrictParams`, `CityParams` | today |
| `formality` | cell orientation jitter, block-size variance | `layout/city.ts` | today |
| `formality` | set-piece axis strength, plaza presence | `layout/vistas.ts`, `CityParams.setPieces` | today |
| `event: flood` | silt ground paint, waterlogged lower courses, debris line, abandoned ground floors | grounds + life passes | reserved |
| `event: fire` | charred material substitution, roof gaps, standing chimneys, soot | grammar + grounds | reserved |
| `event: siege` | wall breaches, rubble aprons, camp outside the wall | `infra.wall@0` (§3) + props | reserved (needs Phase 1) |
| `event: boom` | scaffolds and construction sites, new-material bias, density and storey lift, ragged edge lots | district infill + prominence | reserved |
| `character.palettes` | palette symbol overrides within the subtree | `terrain/palette.ts` | today |
| `character.materialTheme` | forces the theme instead of drawing it from the seed | `themes.ts` | today |
| `character.archetypes` | infill `mix`, landmark candidates, per-character mixes | `layout/district.ts`, `CityParams.characters` | today |
| `character.props` | prop family bias in the life and prop passes | `structures/life.ts`, `structures/props.ts` | reserved |
| `character.flora` | species tables for scatter | `scatter.forest@0` | reserved (flora grammar, Phase 4) |
| `character.motifs` | roof form, window rhythm, massing, footprint style | `building.grammar@0` | today |
| `character.programs` | how many authored programs this region asks for, and in which mode | contract 2 | Phase 3 |
| `climate.biome` / `.snow` | biome + snow precedence | §4 | Phase 1 |
| `climate.temperature` / `.humidity` | offsets into the climate field over the footprint | `terrain/climate.ts` | today |

**The table is a registry, not a switch.** Later features register their own
rows from their own files:

```ts
export interface FanOutRow<K> {
  readonly id: string;                   // "grammar.roofForm"
  readonly reads: readonly (keyof SemanticIntent)[];
  /** Total: MUST answer for an intent that declares nothing. */
  resolve(intent: ResolvedIntent, ctx: FanOutContext): K;
}
export function registerFanOut<K>(row: FanOutRow<K>): void;
```

Two rules make the layer no-regret:

1. **The intent package never imports a subsystem.** A row is owned by the
   subsystem it drives and registered through one seam file, exactly as the
   exhibit rows are.
2. **Every row is total.** A document that declares no `intent` must resolve to
   the values the code produces today, so the whole layer is byte-identical
   until an author uses it. That is the acceptance test for Phase 2's first
   commit, before any dial does anything.

Diagnostics (proposed): `W480` unknown era string, defaulted; `W481` intent on a
node kind that carries none; `I482` intent below district depth; `W483`
`character.archetypes` names an archetype the catalog does not implement.

---

### 2. AuthoredProgram — one contract for both bespoke tiers

**Amended at ratification (Kai, 2026-08-02).** The draft split this in two: a
box/carve DSL for one-off landmarks and a sandboxed generator for repeatable
ones. Kai struck the DSL.

The evidence: **Luna performs measurably better unchained — writing its own
generation code — than when guided through a curated tool vocabulary.** The run
that settled it was "statue of an earth god": given a free hand in codex, Luna
wrote a full generator script for it, down to its own NBT outputter (which our
harness makes unnecessary — we already own `emitWorld`). A curated shape
vocabulary is a leash on the single thing the model is best at, and every box in
a box list is a shape the model was not allowed to compute.

So: **one contract, two invocation modes.**

- **Landmark** — the program invoked **once**, against a fixed envelope.
- **Plugin** — the same program invoked **N times**, with per-instance seeds.

Nothing else differs. One pipeline, one sandbox, one artifact format, one gate,
one repair loop. The two-tier language survives only as a description of how a
node uses a program.

Both modes are the L1 **`authored` generator flavor** (§7.6):
`generator: "authored:<id>"`. `kind: "asset"` reverts to meaning what §9 says it
means — an AI-generated *mesh* — and gains nothing from this contract. That is a
simplification the draft did not have: the bespoke tier now occupies exactly one
slot in the language.

Code lives in `packages/compiler/src/programs/` (sandbox, context, verify);
types in `packages/spec/src/programs/types.ts`.

#### The artifact is the program source

Not a box list, not an expansion, not a schematic: **the source text is the
canonical artifact**, and it is what the document carries.

```json
"programs": {
  "earth_god_statue": {
    "mode": "landmark",
    "envelope": [34, 52, 30],
    "sourceHash": "b3:1c4a…",
    "outputHash": "b3:9e07…",
    "source": "export const envelope = [34, 52, 30]; export default function build(api) { … }"
  }
}
```

| Field | Meaning |
|---|---|
| `mode` | `landmark` \| `plugin` \| `both` — how the document is allowed to invoke it |
| `envelope` | node-local `[w, h, d]` the program declares it needs; the solver reserves this |
| `source` | the program text; **≤ 64 KiB** |
| `sourceHash` | `BLAKE3` of the normalized source — the compile refuses a mismatch (`E333`) |
| `outputHash` | `BLAKE3` of the canonical op stream, recorded at authoring time (below) |

Referenced as an ordinary generator node, so the layout solver, pads, aprons,
constraints and the report all work on it unchanged:

```json
{ "id": "the_earth_god", "kind": "generator", "generator": "authored:earth_god_statue",
  "constraints": [ { "zone": "northeast" }, { "distance": { "to": "old_town", "max": 90 } } ] }
```

#### The API surface

Minimal on purpose. **The API is the determinism boundary, not a creative
vocabulary** — there is no shape library, no arch helper, no stair kit. If the
program wants a dome it computes a dome; that is the whole point of the
amendment.

```ts
/** Everything a program is handed. Nothing else is reachable. */
export interface ProgramApi {
  /** The only way to write. `block` is a full block string, states included:
   *  "minecraft:stone_bricks", "minecraft:oak_stairs[facing=north,half=top]". */
  set(x: number, y: number, z: number, block: string): void;
  /** Node-local envelope bounds. Origin (0,0,0) is the min corner. */
  readonly size: readonly [number, number, number];
  /** Which of N this call is; `{index: 0, count: 1}` in landmark mode. */
  readonly instance: { readonly index: number; readonly count: number };
  /** Injected seeded PRNG. The only source of randomness that exists. */
  random(): number;
  /** Node-local terrain, for a program that wants to sit on real ground. */
  heightAt(x: number, z: number): number;
  /** Diagnostics only; never affects output. */
  log(msg: string): void;
}

/** What the program hands back for the solver and the later passes. */
export interface ProgramResult {
  readonly name: string;
  /** Node-local Y of the plane that meets the ground. Usually 0. */
  readonly seatY: number;
  /** Named points published into the node's anchor namespace (§5.5). */
  readonly anchors?: Readonly<Record<string, readonly [number, number, number]>>;
}

/** The program: one pure function, plus a declared envelope. */
export type AuthoredProgram = (api: ProgramApi) => ProgramResult;
```

Rules attached to that surface:

1. **Standard JS math and arrays are allowed** — `Math.sin`, `Math.pow`,
   `Array`, `Map`, typed arrays, the lot. This is a deliberate relaxation of
   §6.5 rule 6 / §6.8, and it is safe *here* and nowhere else because
   determinism is enforced by **hashing the output**, not by pinning the
   primitives (below). Stdlib generators keep `ctx.math`; they have no hash to
   check them against.
2. **No IO, no clock, no ambient randomness, no dynamic code.** §7.4's table
   applies unchanged for `fetch`/`fs`/`process`/`Date`/`performance`/
   `Math.random`/`eval`/`Function`/`import()`. `api.random()` is the only
   entropy, and it is seeded.
3. **Full block strings, states included.** This resolves the draft's open
   question 2 outright: the lint is the gate, not the format. An unknown id or
   an invalid state is a gate failure (`E336`), not a silent placement.
4. **Writes outside the envelope are clipped and counted;** over 1% clipped is a
   gate failure (`W331`), because a program that spills is a program whose
   declared envelope is wrong.
5. `anchors` are published as §7.3 markers, so a road can be routed to a
   landmark's `door` anchor without §9.6's mesh-cutting machinery ever existing.
   Anchors are markers, not ports: they name a point, they promise no geometry.

#### Determinism by verification

The program runs on our machine, so the honest guarantee is not "the language is
deterministic" but "the artifact is checked".

1. **At authoring time** the program is executed **twice**, in separate module
   realms, and the two op streams are byte-compared. A mismatch fails the gate
   immediately — this catches iteration-order bugs at the only moment we can
   attribute them.
2. The canonical op stream's `BLAKE3` is recorded as `outputHash` beside the
   source in the document. In plugin mode the hash covers a fixed verification
   set — instance indices `0, 1, 7` at the document's `worldSeed`.
3. **At compile time** the program is **re-executed** and the hash verified.
   Code is the canonical artifact; a stored expansion is a **cache only**, keyed
   by `outputHash`, and never a source of truth.
4. A hash mismatch is `E334` and the node falls back — loud, never silent. The
   residual risk this design accepts knowingly: a host whose `Math.sin` differs
   in the last bit turns a world into a hard compile error rather than a subtly
   different world. That is the right failure direction, and the cross-arch CI
   job ratified post-G1 (Q9) is what would find it before a customer does.

**Per-instance seeds** are unchanged from the draft:
`instanceSeed = BLAKE3(worldSeed ‖ nodePath ‖ "program" ‖ instanceIndex)`, the
same shape as §6.2. `api.random()` is seeded from it. Instances are ordered by
placement order (solver order, then `nodePath` lexicographic) — never by
completion order.

#### Limits

| Limit | Per instance | Per document |
|---|---|---|
| source size | — | 64 KiB per program |
| fuel (instruction steps) | 20M | 200M |
| block writes | 200,000 | 4,000,000 |
| heap | 64 MiB | — |
| wall clock | **none** | — |

Wall clock is deliberately absent: it is nondeterministic, and §7.4 already
settles that fuel is the clock. An instance that trips a limit is dropped
**whole** — never half-written — with `E332`. If more than a quarter of a
program's instances trip, the program is dropped entirely and its nodes fall
back: one bad instance is bad luck, a quarter of them is a bad program.

#### The gate

Identical rules at authoring time and compile time.

1. **Static** — the source parses, declares an envelope within limits, and
   passes the sandbox lint (banned globals, no top-level mutable state).
2. **Double run** — the byte-compare above.
3. **Structural** — the written solid is one 6-connected component after
   dropping components below 12 voxels (§9.9's `minIslandVolume`), else `E335`.
   A floating chunk is exactly what the physics lint exists to catch, and at
   authoring time it is nearly free to reject.
4. **Physics lint** — the output is compiled into a scratch superflat world
   through the shootout's `tools/shootout/assemble.ts` path, which already goes
   through the real `emitWorld`, and walked by the existing physics rules. Any
   error-severity finding fails.
5. **Nonsense guard** — ≥ 500 solid voxels and ≥ 8 blocks tall (the shootout's
   own DEGENERATE test).

The two gates catch different things and both are needed: the authoring gate
judges the **program**, the compile gate judges the **seating** — the same
output that is clean on superflat can be half-buried on a slope or standing in
water. A compile-time failure drops to the node's `fallback` with `E336`/`W337`.

#### The authoring loop, and what happens when it fails

1. The model writes the program.
2. Static gate → double run → run on a synthetic flat sampler and a synthetic
   sloped one, at instance indices `0, 1, 7`, under two world seeds.
3. Emit to a scratch world; physics lint; structural and nonsense guards.
4. **Diagnostics back to the model** — the same `Diagnostic` records the
   compiler produces, plus the ASCII silhouette — as a repair turn. **Bounded at
   3 rounds**, matching the shootout's ladder and `MAX_AUTHOR_ATTEMPTS`.
5. Freeze: `sourceHash` and `outputHash` into the document. The compile is a
   pure function again.

This is **diagnostic-driven repair**, which §14.6 blesses and the standing
decision permits; what is banned is autonomous *visual critique* iteration.
Nothing in this loop looks at a render. Visual review stays Kai's, manually.

**Failure semantics.** A program that cannot pass in 3 rounds is dropped **at
authoring time** — it never enters the document. Nodes that referenced it are
re-pointed at a fallback archetype or removed, and the run reports it. The
invariant is one sentence: *the document that reaches the compiler contains only
authored programs that have already been executed, hashed and linted clean.*

#### Invoking N instances

One node is one instance (`count: 1`) — that is landmark mode. For many:

```json
{ "kind": "generator", "generator": "scatter.program@0",
  "params": { "program": "ufo_lander", "count": 24, "area": { "zone": "north" },
              "spacing": 40, "maxSlope": 18, "avoidTags": ["settlement"] } }
```

It reuses the existing Poisson-disk scatter, eligibility rules and occupancy
discipline, so a program never learns where it is — which is how the
no-absolute-coordinates law survives contact with model-written code. *Reserved
for Phase 4:* a district `mix` may name `authored:<id>`, making a program part
of the fabric rather than a scatter.

#### Budget scaling

With `A` = region area in blocks²:

```
maxLandmarkPrograms = clamp(round(3 × A / 512²), 3, 12)
maxPluginPrograms   = clamp(round(3 × A / 512²), 3,  6)
```

Plugin programs cap lower because a landmark costs the compile one execution
while a plugin costs it every instance. Both are additionally bounded by a
per-world authoring spend stop (`--bespoke-budget`, default $0.50) checked
*before* each call, so a world degrades to stdlib rather than overrunning. At
the shootout's ~$0.03 per artifact this is not a tight bound today; it exists so
it is never discovered to be missing.

#### Historical note — the box DSL

The compact box/carve JSON in `tools/shootout/luna-structure.ts` (ordered
inclusive boxes, `"air"` to carve, `hollow` for a 1-thick shell, `y = 0` as the
seating plane) is what proved the pipeline: 3/3 valid on attempt 1 at ~$0.03
each, and the first evidence that a text model can author a structure worth
walking to. It stays in the tools directory as the shootout's record, and its
expansion semantics remain the reference for what "seat plane", "carve" and
"hollow" mean. **It is not a shipping artifact format.** Nothing in the compiler
should learn to read it.

Diagnostics (proposed): `W330` declared envelope overridden, `W331` writes
clipped beyond tolerance, `E332` budget exceeded, `E333` source hash mismatch,
`E334` output hash mismatch, `E335` disconnected solid, `E336` gate failed,
`W337` program dropped and fallback used.

---

### 3. SweptProfile — the linework engine

One engine, four clients. The observation behind it: a road, a city wall, a
bridge and a public stair are the same problem — **a cross-section swept along a
polyline over real terrain** — and we have written the hard parts of it three
times already, in three files, with three answers to "what happens on a slope".

Lives in `packages/compiler/src/structures/sweep.ts`.

```ts
export type BandRole =
  | "carriageway" | "verge" | "kerb" | "walkway" | "deck"
  | "core" | "parapet" | "footing" | "ditch";

/** One band of the cross-section, measured outward from the centre line. */
export interface ProfileBand {
  readonly id: string;                  // "carriageway", "kerb", "sidewalk"
  readonly role: BandRole;
  /** Columns per side; with `centred`, the full width straddling the line. */
  readonly width: number;
  readonly centred?: boolean;
  /** Blocks relative to the swept datum. Negative cuts below it. */
  readonly level?: number;
  /** Palette symbol for the band's top course. */
  readonly surface: string;
  /** Fill between terrain and the band top. Defaults to `surface`. */
  readonly fill?: string;
  readonly cap?: BandCap;
}
export interface BandCap {
  readonly height: number;              // courses above the band top
  readonly block: string;
  /** A fence/wall rail rather than a solid course. */
  readonly rail?: boolean;
}

export interface IntervalFeature {
  readonly id: string;                  // "tower", "lamp", "pier", "buttress"
  readonly pitch: number;               // columns of arc length between instances
  readonly phase?: number;
  readonly at?: "interval" | "bend" | "both";
  readonly offset: number;              // lateral offset from the centre line
  /** A stdlib prop id or `authored:<id>`; omitted means the profile draws it. */
  readonly generator?: string;
}

export interface SweptProfile {
  readonly id: string;
  /** Innermost first. Mirrored across the centre line unless `asymmetric`. */
  readonly bands: readonly ProfileBand[];
  readonly asymmetric?: boolean;
  /** Blocks of datum change permitted per column before treads synthesize. */
  readonly maxGrade: number;
  readonly follow: "grade" | "level" | "step";
  readonly features?: readonly IntervalFeature[];
  readonly crossing: "bridge" | "causeway" | "ford" | "stop";
}

export interface SweepInput {
  readonly profile: SweptProfile;
  /** 4-connected world columns — the same shape as `StreetSegment["path"]`. */
  readonly path: readonly { readonly x: number; readonly z: number }[];
  readonly plan: ColumnPlan;            // mutated exactly as the road pass mutates it
  readonly palette: Palette;
  readonly stack: PrismarineStack;
  readonly seed: Seed256;
  readonly avoid?: OccupancyGrid;
}
export interface SweepResult {
  readonly blocks: readonly StructureBlock[];
  /** 1 on every column the sweep claimed, row-major over the plan's region. */
  readonly claimed: Uint8Array;
  /** The datum actually built to, per path index. */
  readonly datum: Int32Array;
  readonly features: readonly { readonly id: string;
    readonly at: { readonly x: number; readonly y: number; readonly z: number } }[];
  readonly diagnostics: readonly Diagnostic[];
}
export function sweep(input: SweepInput): SweepResult;
```

#### Terrain adaptation — normative rules

1. **Datum.** `follow: "grade"` runs the existing 1-Lipschitz `gradeProfile`
   from `structures/roads.ts` over the path's ground — one implementation, not a
   second. `"level"` holds one datum (a wall walk on a flat crown). `"step"`
   changes the datum by at most `maxGrade` per column and holds it otherwise,
   which is what a stepped rampart does.
2. **Tread synthesis, and the trap it avoids.** Where the datum climbs faster
   than a player can walk, the sweep synthesizes treads by the construction
   `dressStair` already paid for: taken **backwards** along the path,
   `need[k] = max(g[k] + 1, need[k+1] − 1)`, refusing the whole run if the
   bottom step lands out of reach of the ground in front of it or any column
   needs more than the fill cap. Slabs and stairs are **decoration on top of
   that level**, never the mechanism: raising every column by the same half
   block leaves every riser exactly as tall as it was, and makes a two-block
   riser worse.
3. **Border courses follow the TRUE line.** Band membership is a
   perpendicular-distance test against the real centre line, not a walk of the
   rasterized cells. A diagonal therefore gets one clean kerb course instead of
   a two-column dither. Rasterization decides only which columns are *visited*.
4. **Miters.** At a bend, outer bands extend to the intersection of the two
   offset lines and the wedge between them is filled; an inside corner is
   clipped once so the two runs never double-write. Innermost band wins a
   contested column, so the sweep is idempotent per column by construction.
5. **Interval features** are placed by **arc length along the refined line**,
   phase-locked to the path start so recompiling gives the same tower positions;
   `at: "bend"` snaps to vertices.
6. **Crossings.** A run of columns with fluid or missing ground beyond
   tolerance hands off: `"bridge"` supplies the two abutments, approach grades
   and parapet continuity onto the bank, and calls the deck builder;
   `"causeway"` fills; `"ford"` drops the datum to the waterline and paves;
   `"stop"` ends the run and reports (`W462`).
7. **Occupancy is all-or-nothing per column**, the same rule the life pass uses:
   a column the sweep cannot claim in full is skipped whole.

#### The first four clients

| Client | What exists today | What the retrofit does |
|---|---|---|
| **Road + street surfacing** | `surfaceStreetGraph` and `surfaceRoute` in `packages/compiler/src/structures/roads.ts` grade, pave, shoulder, dash and wear by hand, once per pass, with arterials threaded through the same function | each road class becomes a `SweptProfile` (carriageway + kerb + verge, `crossing: "bridge"`); the pass becomes profile selection plus `sweep()`. U1's `street.*` / `road.*` material classes are just the profiles' `surface` symbols — no palette change |
| **`infra.wall@0`** (new) | the only wall is the `curtain_wall` **prop** in `packages/stdlib/src/structures/props-blitz.ts`: a straight segment placed as an object, which cannot ring anything and cannot follow a slope | footing + core + wall-walk + parapet, `follow: "step"`, interval features `tower` (pitch ≈ 40) and `gate` where an arterial crosses. Path from the settlement footprint's offset hull; gates from the crossings |
| **Bridge kit** | `buildBridgeDeck` in `roads.ts` lays deck + top-slab fence rail; `structures/setpieces.ts` then adds pylons, lamps and bank balustrades — and C4's notes record the two halves disagreeing about where the rail was | one bridge profile (deck + rail cap + `pier` interval feature) with abutments and approach in the engine, so deck and dressing stop being two passes that must agree |
| **Path-stairs** | `dressStair` in `structures/setpieces.ts` owns both the `need[]` construction and its own balustrade/lamp placement | a stair profile (tread band + balustrade caps + lamp feature) with `follow: "step"`; the `need[]` construction moves into the engine where the road grade already lives |

Named as reserved clients, not built: aqueduct/viaduct, canal, rail line, the
harbour quay wall (`precinct.harbour@0` already sweeps one by hand), terrace
bunds, pier decks.

Diagnostics (proposed): `W460` run refused whole (unclimbable/unbuildable),
`W461` columns skipped for occupancy, `W462` crossing unspanned, `I463` interval
features placed.

---

### 4. Biome authorship — land use owns its ground

**The observed defect:** snow falling on part of a city. Biome and snow are
painted per column by `biomeForColumn` (`packages/compiler/src/terrain/biomes.ts`)
and the snow rule in `packages/compiler/src/terrain/columns.ts`, from the field
as it stood **before** anything was built — elevation, relief, temperature. The
structure pass then levels a pad and builds on it without telling the terrain
what the ground became. A quarter above the snow line keeps `snowy_slopes` and a
snow layer; the quarter beside it does not; the seam runs through the middle of
a city, and no amount of tuning the snow line fixes it, because the problem is
that nothing represents "this is a town".

#### The compiler invariant

**Land use owns the biome and the snow cover of the ground it claims.**

1. After placement is final and before emit, every claimed footprint — district
   and city cells, precinct envelopes, building pads, road/arterial/sweep
   `claimed` masks — contributes to a **land-use mask** with one
   settlement-derived biome.
2. Over that mask the compiler **clamps**: one biome across the whole footprint,
   plus a `feather` band (default 8 columns) blending outward to whatever the
   terrain said. Snow cover over the mask is set by the settlement's snow
   policy, not by the column's altitude.
3. It happens in the pass that writes biome data; the only place it shows is the
   emitted chunk biome array and the snow layer.
4. Snow already placed on a clamped column is removed. The clamp never *adds*
   snow except where policy says `always`.

Settlement-derived biome comes from the settlement's dominant surface class and
its resolved climate intent through a small table (`plains`, `forest`, `taiga`,
`savanna`, `desert`, `snowy_plains`, `beach`). A snowbound alpine mining town
still gets `snowy_plains` and a snow policy of `always` — the fix is
**coherence**, not "no snow".

Snow policy resolves from `intent.climate.snow`: `auto` (default) takes the
**majority vote of the footprint's own pre-clamp columns**; `never` and
`always` are absolute. Majority vote rather than a centre sample, because a city
on a slope has no single centre column.

#### Precedence

Highest wins:

1. **Explicit author intent** — `intent.climate.biome` / `.snow` at the nearest
   enclosing scope, or a matching `style.biomeThemes` entry (§2.5). An author
   who says "this island is tropical" outranks everything below.
2. **Land-use clamp** — the settlement's derived biome and snow policy over its
   footprint and feather band.
3. **Climate-derived** — `biomeForColumn` exactly as it stands today.

Within (1), region intent beats world intent by the ordinary inheritance rule.

**Determinism is unchanged.** The mask is a pure function of the finished
placement, the vote runs over a fixed column order, and no RNG is drawn.
Documents with no settlement and no intent produce an empty mask and emit
byte-identically.

Diagnostics (proposed): `W470` biome clamped (names the biome, the column count
and the vote), `W471` snow suppressed over a footprint, `W472` intent names a
biome id the emitter's table does not carry.

---

### Proposed spec amendments

Not yet applied to `docs/LOAM-SPEC-v0.2.md`; listed here so the spec edit that
follows ratification is mechanical. All are additive; no existing construct
changes meaning.

1. **§7.6** — an `authored:` generator may be declared in a document-level
   `programs` map carrying `mode`, `envelope`, `source`, `sourceHash` and
   `outputHash`. The program's API (`ProgramApi`) is a documented **narrowing**
   of §7.2's `GenContext`, and §7.4's sandbox table applies unchanged except for
   the math relaxation in item 2.
2. **§6.5 / §6.8** — authored programs may use standard JS math. Determinism for
   them is enforced by the authoring-time double run and the recorded
   `outputHash`, verified at compile time, rather than by pinned primitives.
   Stdlib generators are unchanged: they keep `ctx.math`, because they have no
   hash to check them against.
3. **§9** — **unchanged.** `kind: "asset"` keeps meaning "AI-generated mesh";
   the draft's `provider.name: "bespoke"` is withdrawn along with the box DSL.
4. **§2** — a document and any composite/district/city node may carry `intent`;
   §2.8's inheritance rules govern it verbatim.
5. **§7.5** — two new stdlib entries: `scatter.program@0` (stage `structure` or
   `decorate`) and `infra.wall@0` (stage `connective`).
6. **§13.2** — the proposed code blocks: `W480`–`W483` intent, `W330`–`W337`
   authored programs, `W460`–`I463` sweeps, `W470`–`W472` biome clamp.
7. **Terrain profile** — `intent.climate` is the profile-legal spelling of
   per-region climate/biome intent; `terrain.climate@0`'s params are unchanged
   and remain the finer dial.

---

### Sequencing

Four phases. Phase 1 is deliberately first because it needs **no new authoring
surface** — it is all compiler work against contracts that exist, so it can run
while Phase 2's types are still being argued about.

**Phase 1 — linework and coherence.**
SweptProfile engine + the four clients (road surfacing, `infra.wall@0`, bridge
kit, path-stairs); the biome/snow land-use clamp; and the
**revision-conversation trim** in `packages/agents/src/author.ts` — today
`reviseLoamDoc` continues the whole conversation, so every rejected attempt and
every prior document rides along into each compile-feedback round. A revision
turn needs the kit, the prompt, the *current* document and the diagnostics, and
nothing else. Motivation is in `out/e2e/comparison.md`: Luna's completed runs
took 329–514 s across two revision rounds, and the conversation is the part that
grows.
*Acceptance:* Bayline and Kingsfall recompile with zero error diagnostics; a
wall rings a settlement on real terrain with gates where the arterials cross it;
the dev-world walk finds no unclimbable riser; a city that straddles the snow
line has one biome and one snow story. Field goldens unchanged, compiled-world
reroll logged in `packages/stdlib/test/golden.test.ts` as usual.

**Phase 2 — the intent layer.**
`SemanticIntent` types, resolution, report, and the fan-out registry with every
"today" row wired and every "reserved" row registered as a total no-op. First
commit's acceptance test is byte-identity: a document with no `intent` compiles
exactly as it does today.
*Acceptance:* re-run the unicorn/pirate prompt. Two regions in one world, each
carrying `character` intent, and the islands read as **themed by intent, not by
luck** — distinct palettes, archetype mixes, props and flora — with the same
prompt at the same seed producing the same two islands twice. Kai walks it.

**Phase 3 — the bespoke core.**
**One** program pipeline, not two: the sandbox and its `ProgramApi`, the
`programs` document map, the double-run + `outputHash` verification, the two
gates, `scatter.program@0`, the bounded authoring repair loop, and the budget
rule. Landmark and plugin are invocation modes over that one pipeline, so
"landmarks first, plugins later" is not a way to stage this work — the second
mode is a `count` and a seed.
*Acceptance:* an alien-invasion prompt produces at least one working UFO
program invoked in plugin mode (many instances, deterministic, physics-clean)
and at least one program invoked in landmark mode; the world compiles with zero
error diagnostics; and **recompiling the emitted `.loam.json` — every program's
source and `outputHash` frozen inside it — reproduces the world byte-identically
with no model in the loop.**

**Phase 4 — fabric breadth.**
Urban forms as plugins, courtyard blocks, multi-level ground, the flora grammar,
the infrastructure family (aqueduct, canal, rail — all sweeps), agriculture and
camps. Each lands against the Phase 1–3 contracts and registers its own fan-out
rows; acceptance is defined per track when it starts, not now.

---

### Dispositions (Kai, 2026-08-02)

The draft's nine open questions, answered. Recorded with their answers rather
than deleted, because the reasoning is the part that will be needed again.

1. **Bespoke landmark interiors.** Shells in v1; an `interior` volume the
   existing fit-out furnishes in v2. **This does not block Phase 3** — an
   un-enterable monument is a shippable monument.
2. **Stateful blocks.** Resolved by the AuthoredProgram amendment: a program
   writes **full block strings, states included**, and the physics lint is the
   gate. The format restricts nothing; the lint restricts what ships.
3. **Where intent comes from.** A **classify-the-prompt pre-pass** authors the
   intent, and its output is **inspectable before the main authoring call**.
   Costs one cheap call and buys a place to look when a world comes out wrong.
4. **Flood.** Events stay **dressing only** — no fluid moved, no field edited.
   Real standing floodwater is deferred to the terrain profile, where the
   field and the fluid lint already live.
5. **Plugin trust boundary.** `node:vm` plus fuel is fine **pre-launch**. Real
   isolation (a worker or `isolated-vm`) is recorded as a **LAUNCH BLOCKER —
   not a Phase 3 blocker**: it gates taking money from strangers, not building
   the tier.
6. **Budget shape.** Area-scaled counts are the **primary** dial; the per-world
   spend stop is the **backstop**.
7. **`infra.wall@0` authorship.** Compiler-derived hull course in v1; an
   authored coarse course in v2, for the walled old town inside a bigger city.
8. **What the land-use clamp covers.** Settlements **and camp cores**;
   **not farmland**. A feather band over a floodplain reads worse than the seam
   it would replace, and fields are ground that is *worked*, not ground that is
   *built*.
9. **`character` vs `biomeThemes`.** `character` intent is **canonical**;
   `style.biomeThemes` stays as the power-user hatch. Revisit after Phase 2,
   with a real two-region world to look at.
