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
