# Terrainist — Design & Current State

> The working design document. It describes **what the system is now** and
> **what is contracted next**. Superseded plans are deleted rather than
> archived; git history is the archive. `rough-vision.txt` at the repo root is
> the original vision, kept as a historical artifact and superseded by this file.
>
> Last full revision: **2026-08-04**.

## Product

Text prompt → downloadable Minecraft world `.zip`, at an affordable price. An
LLM authors a rich intermediate spec (**Loam**); a deterministic TypeScript
compiler turns that spec into a world. Authors never emit absolute coordinates —
the spec's envelopes, constraints, zones and anchors make that unnecessary.

Two properties are the moat, and every design decision defends them:

1. **Determinism.** Same document + seed → byte-identical world, forever, with
   no model in the loop. A shipped world can always be rebuilt and regression-
   tested.
2. **Correctness.** A 26-rule physics lint reads the emitted world back off
   disk and refuses findings: no floating blocks, no doors into walls, no
   unreachable stairs, no unstable fluid, no unsupported furniture. Nothing that
   samples a learned model can promise this.

## Locked decisions

| Decision | Choice | Notes |
|---|---|---|
| Spec language | **Loam** | "The fertile ground worlds grow from." Spec: `docs/LOAM-SPEC-v0.2.md` (ratified 2026-07-28); terrain subset: `docs/LOAM-TERRAIN-PROFILE-v0.md`. |
| Stack | **TypeScript monorepo** | `spec`, `compiler`, `stdlib`, `render`, `agents`, `cli`. PrismarineJS for Anvil IO and `minecraft-data`; deepslate for NBT/rendering heritage; Sponge `.schem` as asset interchange. |
| Emit target | **Java 1.21.11, DataVersion 4671** | The newest the prismarine stack supports; the modern client auto-upgrades on load. Revisit as libraries catch up. |
| Authoring model | **GPT 5.6 Luna at effort `max`** (`AUTHORING_MODEL_ID`) | Basis: the 2026-08-01 3×3 comparison — equal authoring reliability to GLM 5.2 at ~⅓ the cost. GLM 5.2 stays one `--model z-ai/glm-5.2` flag away. Models are config, not architecture. |
| Planner | **None** | The Opus-class planner is canned indefinitely. Production authoring is cheap-model-first; escalate only at a hard capability wall. |
| Critique → repair | **Manual** | Deterministic diagnostics feed back automatically; *visual* critique is Kai's, and autonomous repair iteration is never to be built. A repair loop optimises against the lint, and the lint is not the same thing as good. |
| Demos | **Luna e2e from a text prompt** | Every demo/acceptance world is produced by `terrainist generate`, so demos measure the real product path. Hand-authored documents remain legitimate as test fixtures and exhibits only. |
| Mesh assets (Tripo) | **Offline foundry, never in the compile path** | See *Mesh assets* below. |

## Loam: the spec language

Four layers. The layering is what makes the language safe for multi-agent
authoring and parallel compilation.

**L3 — style and intent.** World-level inherited context: palettes, themes, and
the `intent` object (era, wealth, decline, formality, event, climate,
character). Keeps independently-authored subtrees coherent. See *Semantic
intent* below.

**L2 — scene graph + constraints.** The layer authors mostly write. A tree of
nodes; each declares a **kind** (`composite`, `generator`, `district`, `city`,
`primitive`), an **envelope** (a requested volume, never a position),
**constraints** relating it to siblings and terrain (`within`, `adjacent_to`,
`facing`, `along`, `distance`, `zone`, `terrain_conform`, `connected`),
**ports**, and a derived **seed** = `hash(worldSeed, nodePath)`.

**L1 — generators.** Deterministic parameterised programs producing voxels:
- **stdlib** — curated and tested: `terrain.heightfield@0` with editable verbs,
  `terrain.climate@0`, `scatter.forest@0`, `cave.carver@0`,
  `building.grammar@0`, `road.network@0`, `prop.place@0`, `infra.wall@0`, the
  `precinct.*@0` kits. Cheap and reliable; bias toward these.
- **authored** — model-written programs against a sandboxed API, referenced as
  `generator: "authored:<id>"` or scattered by `scatter.program@0`. This is the
  bespoke tier; see below.

**L0 — voxel IR.** What everything compiles to: palette-symbol placements and
CSG ops. Rarely hand-written; exists so nothing is magic.

## Compiler pipeline

Deterministic and ordered. Every random draw is seeded by
`hash(worldSeed, nodePath)`; no wall-clock anywhere except `LastPlayed` at
install time.

1. **Parse + validate** — profile validators (`settlement`, `terrain`), the
   `programs` map, and intent placement. Diagnostics carry a fix hint specific
   enough to hand to a model.
2. **Resolve intent** — deep merge along the node path; the fan-out registry
   turns dials into concrete knob values once, recorded in the report.
3. **Terrain field** — heightfield + editable verbs composed into one field,
   evaluated once; hydrology, climate, caves.
4. **Layout solve** — hierarchical placement of districts, cities, buildings,
   plazas and landmark programs against their constraints, with a relaxation
   ladder and a solver report naming every demotion.
5. **Fabric** — arterials → district cells → street graphs → blocks → lots →
   terraces, with a prominence field driving the skyline.
6. **Structures** — building grammar, precincts, roads and sweeps, props.
7. **Authored programs** *(pass 5d)* — hash-verified, sandboxed execution of
   bespoke programs into ordinary structure blocks and markers.
8. **Ground, streetscape, life, set pieces** — ground treatment, sidewalks and
   furniture, the eye-level life pass, vista set pieces.
9. **Clearing, scatter, biomes** — vegetation clip, forest scatter, biome paint
   and the land-use clamp.
10. **Validators → emit** — readback validators, then Anvil write + zip.

## What is built today

**Terrain.** Master heightfield with model-authored *verbs* (ridge, valley,
river, volcano, plateau, island, basin, peak …), each a kernel blended with
falloff and composed in a deterministic order. Connectivity hydrology, open-basin
fills, temperature-gated snow with altitude lapse, rock strata, volcanic banding,
undergrowth and flora, ocean/lake life, caves and tunnels.
`terrain.heightfield@0.scaleReference` makes a landform a similarity transform of
the region size, so a coastline scales with the world instead of drifting.

**Settlement fabric.** The void defines the solid: arterials first, district
cells as the residue of the road network, street skeletons clipped and rotated
per cell, blocks → lots → frontage-aligned buildings, terrace assemblies with
shared party walls and a common cornice, a prominence field for the skyline, a
life pass at eye level, vistas and set pieces closing axes on landmarks.
`precinct.airport@0` and `precinct.harbour@0` lay out whole compounds; the
harbour seeks a real coastline when its envelope holds none.

**Structures.** `building.grammar@0` with **343 of 441** catalog entries
implemented, wings (L/T plans), upper-floor fit-out, themed underground (crypt,
catacombs, vault, wine cellar, mineshaft), vehicles with a rotated-op path,
high-rise grammar. `prop.place@0` for coarse-placed props. `infra.wall@0` for
derived, terrain-following circumvallation with towers and found gates.

**The linework engine.** One `SweptProfile` sweeps a cross-section along a
polyline over real terrain; roads, bridges, path-stairs and city walls are its
clients. Band membership is a perpendicular-distance test against the *true*
line, so a diagonal gets one continuous kerb instead of two-column dither, and
tread synthesis mixes full blocks, slabs and stairs under a climbability
recurrence.

**Semantic intent.** The full dial set resolves and fans out; per-region
`character` gives two places in one world genuinely different palettes,
archetype mixes and themes. Vocabulary is grounded against the real registries
with warnings naming legal values and near-misses.

**The bespoke tier.** Model-written programs, gated and frozen into the
document, invoked once (landmark) or scattered (plugin). See below.

**Verification.** 26-rule physics lint over the emitted world; field-hash and
compiled-world goldens; byte-identity tests; Terrarium v3 review worlds with
teleport stations; `review-import` to fold in-game notes and screenshots into a
session record; `--channel` installs so several builds of one world sit side by
side; git provenance stamped into report and manifest sidecars. ~2,280 tests.

## The bespoke tier — `AuthoredProgram`

*(Ratified 2026-08-02; amended in implementation.)*

The premise, from the run that settled it ("statue of an earth god"): **the
model performs measurably better unchained — writing its own generation code —
than when guided through a curated tool vocabulary.** A curated shape vocabulary
is a leash on the one thing the model is best at, and every box in a box list is
a shape it was not allowed to compute.

So: **one contract, two invocation modes.** A *landmark* is the program invoked
once against a fixed envelope; a *plugin* is the same program invoked N times
with per-instance seeds. One sandbox, one artifact format, one gate, one repair
loop.

**The artifact is the source.** A document-level `programs` map carries
`{mode, envelope, source (≤64 KiB), sourceHash, outputHash}`. Code — not an
expanded voxel list — is canonical, because code is the compressed
representation of exactly the regularities that make a structure read as
designed.

**The API is the determinism boundary, not a creative vocabulary.**

```ts
interface ProgramApi {
  set(x: number, y: number, z: number, block: string): void;  // full block strings, states included
  readonly size: readonly [number, number, number];
  readonly instance: { readonly index: number; readonly count: number };
  random(): number;            // injected, seeded
  heightAt(x: number, z: number): number;   // node-local ground
  log(msg: string): void;
}
// returns { name, seatY, anchors?, interiors? }
```

There is no shape library, no arch helper, no stair kit — deliberately, and
there are tests asserting the prompt teaches none.

**Determinism by verification.** Standard JS math is allowed (a deliberate,
locally-safe relaxation) because the output is hashed: at authoring time the
program runs twice in separate realms and is byte-compared; `outputHash` is
frozen into the document; every compile re-executes the verification set and
fails `E334` on mismatch. Ambient entropy, IO and the clock are shadowed to
throws. Fuel is metered by source instrumentation (a unit per block entry plus
weighted API costs), with the static lint requiring braced bodies so the one
unbounded shape cannot be written.

**The five-step gate** (static lint → double-run determinism → structural →
physics lint over a real emitted world → nonsense guard) runs at authoring time
with a bounded three-round repair loop that hands diagnostics back verbatim. A
program that cannot pass is **dropped**, never shipped broken, and the world
still compiles.

**Placement.**
- `params.hover: <8..256>` floats a landmark that many blocks above the highest
  ground under it, centred in its `zone` (or the region), taking no part in the
  layout solve and claiming no ground — so a mothership looms over a town that
  keeps its houses and roads underneath.
- `params.seat`: `pad` (default — seat on the ground plane and raise low columns
  to meet it), `embed`/`embedDepth` (sink it, which is what a *crashed* thing
  wants), `drape` (the program conforms itself via `heightAt`). `hover` and
  `seat` are mutually exclusive.
- The program's returned `seatY` — the node-local plane that meets the ground —
  is honoured.
- Anchors publish as §7.3 markers, so a road can be routed to a landmark's door
  without an author knowing a coordinate of it.
- `interiors` (v2) declares hollow volumes the existing building fit-out
  furnishes, so a landmark can be entered.

**Budgets.** `landmarks = clamp(round(3·A/512²), 3, 12)`,
`plugins = clamp(…, 3, 6)`, plus a per-world spend stop as a backstop.

**Requests.** An author asks for a program in `intent.character.programs` — an
array of `{id, mode, brief, envelope?, count?}` — and writes the invoking node
in the same document. A reference to a requested-but-not-yet-authored program is
legal (the map is attached by a later phase); a node invoking a program that
never arrived draws `PROGRAM_DROPPED` rather than vanishing silently.

## Semantic intent

Dials that mean something to a language model, fanning out into knobs that
already exist. `era` (open string → closed `EraClass` via an alias table),
`wealth`, `decline`, `formality`, `event {kind, severity, recency}`, `climate`,
and `character` (label, material theme, palettes, archetype/prop/flora bias,
motifs, program requests).

Intent is legal at document root, composite regions, districts and cities —
never on a leaf, where `params` are the right tool. Resolution is deep merge
along the node path: scalars replace, objects merge key-by-key, **arrays replace
whole** (so "no oak on this island" is expressible under a world that prefers
oak).

Two rules keep the layer no-regret, both enforced by tests:

1. **The intent package imports no subsystem.** Each fan-out row is owned by the
   subsystem it drives and registered through one seam file.
2. **Every row is total.** A document with no `intent` compiles byte-identically
   to one from before the layer existed.

Intent is authored by a **classify-the-prompt pre-pass** — one cheap call whose
output is printed before the expensive authoring call, so there is a place to
look when a world comes out wrong. It is fail-open: two failed attempts yield
empty intent and the world still generates. `--intent <json>` replaces it;
`--no-intent` skips it.

## The linework engine — `SweptProfile`

A cross-section of bands (carriageway, kerb, walkway, deck, core, parapet,
footing, ditch) swept along a polyline over real terrain, with `follow` modes
(`grade` / `level` / `step`), interval features by arc length, and crossing
behaviour (bridge / causeway / ford / stop).

Two rules carry most of the visual weight:

- **The tread law.** `need[k] = max(g[k] + 1, need[k+1] − 1)` taken backwards
  decides where steps go; slabs and stairs are decoration over that, never the
  mechanism. A run that cannot be made climbable is refused whole.
- **Band membership is perpendicular distance to the true line.** A course one
  column wide cannot be continuous on a diagonal (unit width spans ≈1.41
  lattice columns), so `thickenCourse` recruits one bridging column where the
  course only connects diagonally — which is what turns a sawtooth kerb into a
  coping line.

Clients: road surfacing, `infra.wall@0`, the bridge kit (deck, rail, pier
rhythm, approaches), path-stairs. The infrastructure family (aqueduct, canal,
rail) is contracted to land on this same engine.

## Biome authorship

Land use owns the ground it claims. A settlement footprint (and camp cores —
**not** farmland) gets one coherent biome and one snow decision, derived from
the **ambient majority** of a 12-column ring around the footprint and made
snow-consistent, so a town in windswept hills is windswept hills rather than an
imposed patch of plains.

Precedence: explicit `intent.climate` > land-use clamp > climate-derived.

The feather that blends the edge is dithered **per stored biome cell**, because
Anvil stores biomes at 4×4×4 and samples one column per cell — a per-column
dither loses 15 of every 16 decisions at write time, which is exactly how a
"blended" edge still reads as a hard seam in the client. The band is 6–10 cells
wide, weighted by a smoothstep, world-locked and RNG-free.

## Production pipeline (the agent side)

```
prompt
  → intent pre-pass (cheap, inspectable, fail-open)
  → document authoring (Luna max, kit as system prompt, validation retries)
  → program authoring (proposal → write → five-step gate → ≤3 repair rounds)
  → wiring check (are the programs actually invoked? one focused revision if not)
  → compile → author-actionable diagnostics → ≤N revision rounds
  → zip + persisted <name>.loam.json and <name>.report.json
```

Cost control: stdlib bias, per-program budgets and a spend stop, and a revision
conversation that carries the kit, the prompt, the *current* document and the
current diagnostics — nothing else (superseded rounds collapse to one marker
line, which cut round cost by roughly an order of magnitude).

Kits are the system prompts, and they live in `docs/kits/*.md` so that a human
editing guidance and the test validating its examples read the same bytes.
Every closed vocabulary a model can write is either enumerated in the kit or
aliased on intake — never silently defaulted.

## Mesh assets (Tripo)

**Rule: an offline asset foundry, never a compile-time dependency.** A network
service with non-deterministic output inside the compile path would cost
byte-identical reproduction, world regression tests and the physics guarantee at
once.

The shape that works, and what exists of it: a separate tool takes a prompt,
gets a mesh, voxelises it (`tools/shootout/voxelize.ts` — GLB parse, scale,
surface voxelisation, flood-fill solidify, island pruning), maps colours to a
curated palette, runs the physics lint, and commits the result as a versioned,
human-reviewed asset. The world compiler only ever consumes committed assets.

Status: the voxelizer, the Tripo client and a superflat assembler exist and were
exercised in the 2026-08-01 Luna-vs-Tripo shootout. The curated-collection
product around them is not built. The honest read from that shootout: at 40–60
blocks Tripo output reads as a lump, while a program that computes its own
geometry reads as designed — so meshes earn their place for **sculptural
one-offs a grammar cannot express** (a statue, a figurehead, a beached whale
skeleton), not for buildings.

## Roadmap

**Bespoke tier — remaining.**
- Terrain seating (`seatY`, pad/embed/drape), landmark interiors, anchors→roads
  and the classifier revision — in flight this session.
- Real sandbox isolation (worker or `isolated-vm`) — a **launch blocker**, not a
  Phase 3 blocker: it gates taking money from strangers, not building the tier.
- The Tripo curated collection, if and when sculptural one-offs earn the spend.

**Fabric breadth (Phase 4).** Each lands against the contracts above and
registers its own fan-out rows.
- **Urban forms as plugins** — radial, canal, terraced, linear, grown. The
  direct answer to "every settlement is the same settlement", and the largest
  single variety win available.
- **Courtyard blocks and multi-level ground** — old-quarter and hill-town
  texture; the two fabric rigidities most worth relaxing.
- **Flora grammar** — canopy giants, ancients, fungal, fantasy strata; the
  biggest visible gap outside settlements.
- **Infrastructure family** — aqueduct, canal, rail, mine headworks, on the
  sweep engine.
- **Agricultural layer and camps** — field parcels following contour, hedgerows,
  orchards, farmsteads sited to the fields they serve; fishing camps, logging
  camps, waystations. What makes a settlement look like it eats.

**Smaller, high-leverage.**
- Per-district street palettes (streets still take the settlement root theme).
- Biome tint in `packages/render` — its absence is why grass-seam defects are
  invisible in our own renders and had to be found in-game.
- Plan-map SVG and a scripted flythrough along the vista axes: the demo problem,
  nearly free from data the compiler already produces.
- Catalog curation over catalog completion — entry #441 is worth less than one
  well-made monument.

## Risks

1. **Cross-pass interaction is the dominant bug class.** Recent real defects
   were all passes individually correct and wrong in composition — a lantern
   sealing a stairwell, a stall straddling a graded step, a landmark seated in a
   hillside, a per-column dither erased by 4×4 biome storage. Pinned contracts
   help less than they look; the counter is invariants stated once and shared
   (one `requiredRoofSurfaceY`, one occupancy answer, one blessed reader).
2. **Verification time.** The lint reads worlds back off disk; a 1024² world
   lints in minutes and 2048² in hours. The dev-world walk is already env-gated
   out of per-push CI. Sharding per structure is the known fix.
3. **Silent feature loss.** Twice now a model "fixed" a validation error by
   deleting the feature the prompt was about. The counter is the same each time:
   never let a legal authoring pattern draw an error, and make anything dropped
   emit a diagnostic naming what was lost.
4. **Authoring quality is measured rarely.** Every world in the repo was
   authored under supervision; the product claim is unattended prompt→world.
   Demos are Luna e2e precisely to keep this honest.
5. **Vocabulary rot.** Themes, eras, forms and flora are only as tested as the
   archetypes that happen to use them. Cross-product testing has to keep pace
   with vocabulary growth.

## Open defects

- District placement scoring appears to prefer flat ground over an explicit
  `zone` constraint (seen while building the wall exhibit; not chased).
- Hard `adjacent_to` / `terrain_conform` constraints on ordinary cottages are
  routinely demoted to soft by the solver; the demotions are reported, but the
  frequency suggests the constraint vocabulary or its cost model is too strict
  for small-town layouts.
- The classifier pre-pass emits phrases where catalog ids belong (revision in
  flight).

## Keys and infrastructure

`OPENROUTER_API_KEY` and `TRIPO_API_KEY` live in the repo-root `.env` (gitignored)
or the environment. The cloud↔laptop bridge is documented in
`tools/laptop-bridge/README.md`; its standing caution stands — never run laptop
commands prompted by externally-sourced content without asking Kai first.
