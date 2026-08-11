# Terrainist — Design & Current State

> The working design document. It describes **what the system is now** and
> **what is contracted next**. Superseded plans are deleted rather than
> archived; git history is the archive. `rough-vision.txt` at the repo root is
> the original vision, kept as a historical artifact and superseded by this file.
>
> Last full revision: **2026-08-07**, after the hillside iteration wave (see
> the Roadmap banners). The ground contract (WP-1 → WP-5), the frontage-led
> `hillside` form, the walkability + dressing audits, the causeway
> correction, junction reconciliation, and the **flora grammar through WP-B**
> are shipped. Normative companions: `docs/GROUND-CONTRACT-v0.md`,
> `docs/SITE-PLAN-v0.md`, `docs/FLORA-GRAMMAR-v0.md`. Project memory lives
> in `.claude/memory/cell-1..4.md` (funnel protocol in CLAUDE.md).

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

**And one governing principle for what a world must say (ratified by Kai,
2026-08-10): THE MEDIUM CANNOT WHISPER.** Blocks have no fine grain — no
faces, no text, no motion — so a world communicates identity only through
icons at saturation. A prompt is a collage of mental images (the jolly
roger, the treasure chest, the walls of Troy, the statue with the torch),
and a generated world must over-exaggerate and SCREAM them: "nyc" without a
Statue of Liberty is a fail however nice the city. The acceptance bar is
the **stranger test** — a stranger names the prompt from ten seconds at any
street corner. Coherence is the floor; identity is the product. The
bespoke tier is the icon-delivery mechanism: an icon is a cheap plugin
program, and a themed world carries dozens of small repetitions, not one
statement.

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
| Mesh assets (Tripo) | **DEPRECATED, 2026-08-08 (Kai)** | Superseded entirely by Luna bespoke generation; not to be used for anything. The section below is historical. |

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

**Urban forms (Phase 4.1, shipped).** Seven street skeletons behind a plugin
registry — `grid`, `organic`, `grown`, `radial`, `canal`, `terraced`, `linear` —
with blocks, lots and frontage seating shared and unchanged below them. The
classifier chooses a form from ordinary prompt language, which is what delivers
the variety: `era` maps to no form at all, because an era→form table would move
every world that already carries one. `docs/URBAN-FORMS-v0.md` is the contract.

**Courtyards and multi-level ground (Phase 4.2, shipped).** A quarter's ground is
a set of level platforms and derived seams; a district on more than
`STEP_RELIEF = 10` blocks of relief elects `stepped` ground and steps down the
slope in storeys rather than being levelled to one plane. Seams become retaining
walls (the fifth client of the sweep engine), banks, or kerbs by drop and run.
A block may close its perimeter around a courtyard reached through a pend. A
`terraced` quarter puts a street on every `S`th bench boundary where
`S = ceil(blockSize / mean bench width)`, because the "a bench boundary is
always a street" invariant became redundant the moment seam columns went into
`blocked`. `docs/COURTYARDS-AND-LEVELS-v0.md` is the contract.

**The ground contract (WP-1 → WP-5, shipped 2026-08-06).** Nothing modifies
the ground after the ground is decided: every pass *declares* `GroundIntent`s
and the `GroundDriver` (`layout/ground-driver.ts`) accumulates them at each
pass's pipeline position, re-resolves the whole prefix with `resolveGround`,
and writes the answer through over the committing pass's own columns. The
seventeen-class `INTENT_RANK`, the equivalence shim that proved the conversion
(three declarer bugs caught; every divergence attributed to a named
inversion), and the mixture mechanics are `docs/GROUND-CONTRACT-v0.md` §1–§9a.
WP-6 (the freeze) remains, gated on §13.3.

**The `hillside` form (SITE-PLAN v0, shipped and walked 2026-08-07).** The
town generates the terraces it needs — frontage-scored principal contour
streets, strips that pinch out where the ground steepens, a replan ladder
that ships the first street-count clearing `COMPOSITION_GATES`, lots walked
from the frontage, the grade-capped **carriage spine** (corridor reserved
before the terraces; switchbacks emerge from the cap), context-driven
transitions (`treatmentForEdge`; benched banks for tall drops; masonry
rationed per dwelling), and **recessed stairways** — flights may cut into the
upper platform (`MAX_TREAD_CUT = 4`) so a connection earns its drop with run
(Kai's ratified principle: never cap terrace rises; serve them). Registered
beside `terraced` (frozen for the A/B); cutover to the classifier is WP-5,
after acceptance. `docs/SITE-PLAN-v0.md` is the contract and carries every
dated amendment measurement forced.

**The walkability audit (`emit/walkability.ts`).** The town measured as a
pedestrian network, not a list of passes: reciprocal-move connectivity (the
physics walker takes 3-block drops, so it floods downhill and calls a town
nobody can climb "connected"), junction clutter with per-pass `BlockSpan`
attribution, unserved-face detection. Its numbers are pinned as defect
goldens that may only improve; it is the instrument that turned a failed walk
into named mechanisms in one pass, and audit-then-fix is now the standing
pattern for walk-level defects.

**The flora grammar (WP-A + WP-B, shipped 2026-08-07).** Wild flora is a
grammar, not a template table: deterministic **shape programs** (conifer,
blob, broadleaf, giant, ancient, columnar, umbrella, weeping) over shared
limb/mass/plate/curtain builders, a 17-entry species registry (13
naturalistic + the legacy four, re-expressed **list-identically** through
the engine), vertical **strata** (emergent giants budgeted and placed first,
canopy, understory, floor), and six grammar-level laws tested at every
parameter-envelope corner. The **reach law** governs everything: a document
that does not ask for new flora compiles byte-identically — capability
arrives by authorship and the kit, never by changed defaults.
`docs/FLORA-GRAMMAR-v0.md` is the contract; WP-C (fungal/fantasy/
`character.flora`) and WP-D (kit + demo) remain.

**Ground roles.** Twelve *jobs* in a built ground — pavement, kerb, tread,
revetment, coping, plinth, weep, balustrade, stairs, slab, bank, scree — filled
per theme by `defineGroundRoles`, so a road, a wall that holds earth and a
building's forecourt are different materials. The tests assert the roles resolve
to *different* blocks in every shipped theme and never to the theme's
carriageway; they deliberately do not assert which block, because that is Kai's
call after a walk and each is one line in `GROUND_MATERIALS_BY_THEME`.

**Where a levelled quarter meets ground nobody cut.** A placed node with a
`cut_fill` `terrain_conform` is levelled to one plane by `padFor` and eased back
into the terrain across an apron. That apron used to be `terrain_conform.blend`
— 4 columns — whether the pad was sitting one block proud of the ground or
twelve, and twelve blocks over four columns is a 3:1 cut face. Walked, it read
as a flat plane cobbled into the landscape. `LevelPad.adaptiveApron` makes the
falloff a function of the step it is absorbing, measured **per column**: two
columns of run per block of difference, floored at `blend` and capped at 24. A
one-block step therefore keeps exactly today's apron and does not move; a
twelve-block step gets a 1-in-2 ramp; and because the reach follows the terrain
around the perimeter, the outer edge of the apron is a wandering contour rather
than a rectangle. Set on the solver's node-scale pads only — a building's
two-column apron is a doorstep detail, and stretching it on a slope would have
one house re-level its neighbour's street.

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

Three rules carry most of the visual weight, and all three say the same thing
in different registers: **the raster is a drawing of the line; every question
worth asking is asked of the line.**

- **The tread law.** `need[k] = max(g[k] + 1, need[k+1] − 1)` taken backwards
  decides where steps go; slabs and stairs are decoration over that, never the
  mechanism. A run that cannot be made climbable is refused whole. That
  recurrence caps the *rise*, and nothing capped the **fall**: a flight crossing
  a terrace cut rode the platform out to the edge and dropped the whole terrace
  in one riser, which the walkability audit read as fifty-four disconnected
  components. Two further passes cap it. A backward pass lets the level start
  down *before* the edge, cutting up to `MAX_TREAD_CUT` (four) into the platform
  above — a recessed stairway, claimed through the ground contract as a
  `profile` exactly as a road claims its bench, its carved sides dressed by
  `finishCutFaces` — and a forward pass makes up the rest with embankment below.
  The terrace rise itself is never capped: a large drop between two levels is
  legitimate, and what a connection owes is to **earn its drop with run**.
- **Band membership is perpendicular distance to the true line.** A course one
  column wide cannot be continuous on a diagonal (unit width spans ≈1.41
  lattice columns), so `thickenCourse` recruits one bridging column where the
  course only connects diagonally — which is what turns a sawtooth kerb into a
  coping line.
- **Height is a function of arc length along the true line** — the `ArcFrame`.
  The datum lives on *stations*, sampled along the line and spaced **one block
  of ground, or one step of the path, whichever is longer**. Both halves are
  load-bearing. Indexing the datum by rasterized cell instead (which is what the
  engine did until the arc frame landed) means a 4-connected diagonal carries √2
  cross-sections per block of street, at two different heights, on cross-sections
  that *interleave* on the lattice — every column's four neighbours on the other
  one. That is a chessboard of full blocks and half slabs across the width of
  every diagonal street, and it is what three rounds of surfacer fixes kept
  failing to remove. Sampling the ground off the raster is the quieter half: a
  4-connected diagonal zigzags across the contours, so the sampled ground
  oscillates by the cross-slope every step, and `gradeProfile` (a lower envelope
  of unit cones) preserves a ±1 oscillation exactly. The "one step of the path"
  clause is what keeps the grade cap walkable: a route's diagonal step covers √2
  blocks in one move, so its stations are √2 apart or that move is a wall.
  An axis-aligned run's stations *are* its path cells, so the frame is the old
  per-cell one element for element and a levelled district does not move.

And one rule that is not about geometry at all: **no later pass re-levels a
column the surfacer owns.** The streetscape is handed the surfacer's own road
mask rather than re-deriving the carriageway from the raster; the two
constructions disagree on any diagonal, and the disagreement was the dressing
pass re-levelling road it had mistaken for sidewalk.

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

Cost control: per-program budgets and a spend stop ($1.00/world default,
raised from $0.50 with F18), and a revision conversation that carries the
kit, the prompt, the *current* document and the current diagnostics — nothing
else (superseded rounds collapse to one marker line, which cut round cost by
roughly an order of magnitude). The stdlib bias was **recalibrated 2026-08-09
(F18, Kai's citadel verdict)**: stdlib still builds the fabric, but the kit
now steers the prompt's *centerpiece* — the one image the player remembers
the world by — to a bespoke landmark even when an archetype could approximate
it, and invites two or three landmarks on strong prompts. "Requesting nothing"
is right only for prompts with no centerpiece.

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

## The ground contract — declare → resolve → build

> **Contracted next, and the largest single change in the codebase's history.**
> Ratified by Kai 2026-08-06 after walking three hill towns. This section is
> self-contained: it is the whole brief, and it assumes no memory of the
> conversation that produced it.
>
> **Normative spec: `docs/GROUND-CONTRACT-v0.md`** — this brief made precise
> enough to implement (the full pass inventory, `INTENT_RANK` with its seven
> named inversions, the resolver pseudocode, the WP-2 equivalence-shim design,
> and the per-WP conversion recipe). Implement from that document; this section
> stays the ratified summary.

### Why: eleven passes fight over one array

The terrain half of the pipeline is sound and is *not* what changes:

1. **The field.** `terrain.heightfield@0` and the model's verbs (ridge, valley,
   river, plateau …) compose into one `HeightField` — a height per column,
   evaluated once, kernels blended with falloff in a fixed order.
2. **Pads join the field.** When the solver places a node, `padFor`
   (`layout/solve.ts`) emits a `PadEdit` and `applyLevelPad` composes it **into
   the master field** before anything is materialised. "Flatten this quarter" is
   a terrain edit, not a later cut.
3. **The column plan.** The field is materialised into `ColumnPlan`: `ground[]`,
   `surface[]`, `subsurface[]`, `fluidKind[]`, one mutable array per property.

Then it falls apart. **Eleven passes write `plan.ground` after materialisation**
— `roads`, `precincts`, `canals`, `sweep`, `streetscape`, `street-stairs`,
`retaining`, `props`, `plaza`, `doorsteps`, `courtyards` — each reading whatever
the previous ones left, each cutting and filling in place, with no arbitration
beyond array-write order.

Every ground defect chased between 2026-08-04 and 2026-08-06 is a collision in
that pile, and they are one defect wearing six faces:

- `paveSidewalks` re-levelled ground `surfaceStreetGraph` had just graded — up
  to **7 blocks** of step across a street's own width;
- a retaining wall's coping was overwritten by a later pass, leaving its
  balustrade two courses proud (the `unsupported.chain` that survived four
  rounds of fixes);
- `kerbSeam` wrote a kerb course inside a building's ground floor;
- a building's `apron: 2` ramped away the seam a retaining wall stood on;
- a retaining wall was skipped wherever a street claimed the face — 84% of the
  faces in a hill town, because on a terraced quarter the street *runs along*
  the seam;
- the street surfacer had no column ownership at all, which is why the stair
  balustrade could not be built for two phases.

Column ownership (`docs/COURTYARDS-AND-LEVELS-v0.md` §2) fixed **one** of the
eleven and took street cross-section unevenness from 38% to 0.08%. The proposal
is to stop doing that for one subsystem and do it for all of them.

### The rule

> **Nothing may modify the ground after the ground is decided.**

Stages 1–3 above are already "generate the terrain, then build on it". The
missing piece is that stage 4 is allowed to keep editing the terrain. Three
phases replace it.

**1. Declare.** Every subsystem emits what it *needs* from the ground, as data,
mutating nothing:

```ts
/** A claim on the ground, from one subsystem, before anything is decided. */
export interface GroundIntent {
  /** Who is asking — a node path or a pass id. Appears in diagnostics. */
  readonly source: string;
  /** What kind of claim; drives precedence. See `INTENT_RANK`. */
  readonly kind:
    | "platform"      // this footprint is level at `y`
    | "profile"       // these columns follow this polyline's levels
    | "face"          // this column presents a cut face of `drop`
    | "clearance"     // nothing may stand above `y` here
    | "preserve";     // this column is finished; later passes may not move it
  readonly columns: Iterable<GroundClaim>;   // { idx, y } — lazy, region-sized lists are normal
  /** Absorbed how, when a neighbour disagrees: a ramp, a step, a wall. */
  readonly transition: "ramp" | "step" | "wall" | "none";
}
```

Every pass already computes this; it just applies it immediately instead of
returning it. That is what makes the conversion mostly mechanical.

**2. Resolve.** One pass reconciles every declaration into a final ground:

- **Precedence is explicit and total**, in the shape the street rank order
  already proved (`(−width, roleRank, kindRank, id)` — a total order, never
  traversal order). Ties break on a stable key so the result is a pure function
  of the declaration set.
- **Conflicts that cannot be reconciled are diagnostics**, naming both claimants
  and the measurement. Today they are resolved silently by write order, which is
  why the six defects above were invisible until someone walked a world.
- **Transitions are generated, not left to chance.** Where two platforms meet,
  the resolver decides ramp-or-step-or-wall *once*, from the drop and the run,
  and every consumer reads that decision instead of re-deriving it.

**3. Build.** Everything places blocks against a **frozen** ground. The array is
handed out `readonly`; writing to it is a type error rather than a convention.

### Work packages

Six, in dependency order. WP-1 and WP-2 land alone; WP-3–5 are parallel.

- **WP-1 — the contract.** `GroundIntent`, `GroundClaim`, `INTENT_RANK`, the
  resolver's signature, and the frozen-plan type. No behaviour changes; every
  existing test passes unmodified.
- **WP-2 — the resolver.** Precedence, transition selection, conflict
  diagnostics, and a report section listing every claim and how it was
  satisfied. Still no caller converted: the resolver runs, its output is
  compared against the mutating pipeline's, and a test asserts they agree.
  **That equivalence test is the safety net for the whole rewrite.**
- **WP-3 — the street family** (`roads`, `sweep`, `streetscape`,
  `street-stairs`). Column ownership already has the right shape; this converts
  it from "the surfacer owns its columns" to "the surfacer declares and the
  resolver owns".
- **WP-4 — the ground family** (`retaining`, `grounds`, `plaza`, `doorsteps`,
  `courtyards`).
- **WP-5 — the rest** (`props`, `canals`, `precincts`).
- **WP-6 — freeze.** `ColumnPlan.ground` becomes `readonly` past the resolver;
  delete the equivalence shim; a test asserts no module outside the resolver
  writes it.

### Byte-identity strategy

A flat world must not move. The technique that worked repeatedly this week: a
git worktree at `HEAD`, compile both, diff per-file shasums of the whole world
directory. **Two traps, both hit and named 2026-08-07:** (1) raw region-file
shasums false-positive — zlib framing drifts run-to-run; compare *decompressed
chunk NBT*. (2) A worktree compile **through the CLI false-negatives** — the
symlinked `node_modules` resolves `@terrainist/*` through workspace links back
to the **main** tree, so both sides run the same code and the gate compares a
world to itself. Compile via direct source-path import instead (`tsx` + the
`emit.mts` shim pattern), and prove the harness can see a difference before
trusting that it saw none. `examples/showcase-*`, `demo-*` and `c1-harbourtown` are the flat
controls; `hillside-village` and any `terraced` quarter are expected to move and
must be justified move by move.

### Test surface

- The **WP-2 equivalence test** above, which is what makes this safe to do at
  all.
- A **generated-world** check per package, not only unit tests. Phase 4.1 shipped
  three defects that passed every unit test; Phase 4.2 shipped six. The bar is a
  compiled world read back off disk and linted on all 26 rules.
- **Cross-section flatness** for streets (already exists,
  `test/road-cross-section.test.ts`) — the resolver must not regress it.
- A **conflict test**: two subsystems declaring incompatible levels on one
  column produce a diagnostic naming both, rather than a silent winner.

### Risks

- **The resolver becomes a god object.** Mitigation: it decides *levels and
  transitions only*. Materials, blocks and props stay with their passes — the
  same split that made column ownership provable ("ownership decides geometry;
  painting keeps its own order").
- **Precedence is a design problem, not a coding one.** Getting it wrong moves
  every world. WP-2's equivalence test is what turns that from a leap into a
  measurement.
- **Scope creep into the fabric layer.** The resolver does not decide *where*
  things go, only what the ground under them does.

### The wall artifact, and the lattice lesson

`faceCuts` (`structures/retaining.ts`) marks any column whose 8-neighbour drop is
≥2 and swaps its **subsurface** to the theme's revetment. Along a diagonal
contour the set of such columns is itself a lattice staircase, so the revetment
shows as a **sawtooth of single blocks**, with gaps wherever the drop happens to
be 1, and no coping. Walked 2026-08-06; it reads as a broken wall.

This is the **third** appearance of one lesson: *a contour on a lattice is a
staircase.* It produced 1,010 phantom retaining walls (seam runs grouped
4-connected, fixed by grouping 8-connected), the chessboard street paving (a
4-connected raster of a diagonal carries √2 cross-sections per block, fixed by
levelling on arc-length stations), and now this.

The fix is the one that worked both previous times: treat a cut face as a
**swept course along the contour** rather than a per-column property, so
`thickenCourse` can make it 4-connected, and give it a coping so the top edge is
deliberate. Contained, roughly half a day, and worth doing **before** the ground
contract — it is what Kai is looking at, and it is independent of the rewrite.

## Roadmap

> **Milestone, 2026-08-07 (walked and accepted by Kai):** the `hillside` form
> is a coherent, walkable town — "largely a coherent town and literally miles
> ahead of what we had a few days ago". Shipped between 2026-08-06 and
> 2026-08-07: the wall artifact fix; the ground contract WP-1 → WP-5 (the
> driver; every pass declares); `docs/SITE-PLAN-v0.md` WP-0/WP-1/WP-3 plus the
> carriage spine; the walkability audit; and the audit-driven fixes (recessed
> stairways — flights may cut, bounded at `MAX_TREAD_CUT = 4`; tread-wide
> flights; exposure-gated rails; era-gated street furniture; rock-faced cuts
> finished after the last ground writer). Remaining hillside issues are
> "moderate, mostly aesthetic, fixable via dedicated iteration" — the ledger
> below and the SITE-PLAN open questions carry every known one.

> **Iteration wave, 2026-08-07 (the tail, taken up and mostly landed):**
> commits `f55cafa → a6a6fe7`. The causeways refused (they were *paying for
> the plan*, not covering seams — SITE-PLAN §3.6's amended mechanism), the
> dressing audit's four detectors, entrance-reachable share, the flight-floor
> fix, junction-steps reconciliation (`undressedCutoffs` 0 on both fixtures),
> and the flora grammar through WP-B. Current audit truth: hillside 10
> components / 9 orphans / entrance share 0.998; steep 12 / 649 / **0.150**.

**Hillside iteration — remaining.**
1. ~~The five causeways~~ — **landed 2026-08-07**, with the documented
   mechanism corrected: as lane paving they inflated `streetFraction` and
   drove the replan ladder two rungs down; refusing them ships a 4–5-street
   steep quarter. "One level is one platform" (bench merge by level) killed
   the phantom `offPlatform`. Hillside 15→10 components, 797→9 orphans.
2. ~~The entrance metric~~ — **landed 2026-08-07**: entrance-reachable share.
   It exposed the real remainder: **steep's share is 0.150 — the external
   road never reaches the town**; the flights of a 4–5-street quarter do not
   yet join up. That is the next network lever.
3. **Uphill masonry (SITE-PLAN §5.2 rule 9)** — every cut edge along a street
   currently gets rock where a real town would put masonry; needs a sweep face
   whose upper side is natural ground. Reported in every compile.
4. ~~The verge opening~~ — **fixed 2026-08-07, Kai's Option A** as
   `terminusLandings` (`roads.ts` phase 2a — surfacing, not layout, because
   only surfacing knows both the street's and the flight's laws): a street
   tip ≥2 above an adjoining flight corridor steps down `drop − 1` columns,
   the corridor including the unowned verge shoulder. The walked "path
   overextends and hangs" was the same mechanism (the terrace lane three
   proud over a flight head) and fell to the same rule. Hillside
   `unservedFaces` 1→0, `faceRuns` 4→1, cutoffs 14→8; steep provably
   unmoved.
4a. **Walk-1 verdicts (hillside_town-7, 2026-08-07), the aesthetic reads:**
   zero masonry is fine; 16 dwellings is "a tad sparse but within reason" —
   **both conditional on style flexibility**: the masonry ration
   (`WALL_COLUMNS_PER_DWELLING`) and settlement density must become
   intent/character-reachable dials rather than the only mode. New walk
   defects, all in flight: redundant sideways stairs beside a doorstep
   (junction-steps × doorsteps), shallow slab-lip dirt exposure (the 1-deep
   cousin of the fixed ≥2 case; ratified floor: full blocks where soil
   shows), and a prop canopy held up by glass panes. Lanterns otherwise
   "look very good"; the bitten-junction fix is visually inconclusive (same
   site as the verge defect).
5. **Junction-steps on flat towns** — the reconciliation pass is gated to
   multi-level ground. Enabling it globally fixes c1-harbourtown's 1,026
   latent cutoffs (orphans 21,412 → 288) but regresses `unservedFaces`
   18 → 29 there. **Kai's decision, ideally after a harbourtown walk.**
6. **Gate decisions for Kai**: the dwellings-vs-nature tradeoff
   (`COMPOSITION_GATES` is the knob). The street-fraction bar was settled
   2026-08-07 — measured net of the carriage spine, bar stays 0.25.
7. ~~The `hillside` cutover~~ — **DONE 2026-08-08** (`5084a02`):
   `terraced` is an alias resolving at `urbanForm()` (LOAM-I498 when
   drawn), classifier + kit teach `hillside`, `terraced.ts` deleted. WP-5's
   mover list was stale — no example ever named `terraced` — so the strict
   byte verdict applied and held: twelve of twelve worlds hash-identical.
8. v1 items by name: per-bay stepped rows, undercrofts, polygon footprints,
   graded principal streets, courtyards on a strip.

**Ground contract — remaining.**
1. Settle **GROUND-CONTRACT §13.3** (the pad apron as a declared transition) —
   the 55-column golden becomes a world change at WP-6's first commit.
2. Re-measure `RETAIN_MAX` / `RETAIN_RAIL` / `MIN_RETAIN_RUN` on a generated
   hill town (§13.8) — WP-6 makes them the resolver's transition table.
3. **WP-6** — the freeze, the deferred §9a.7 items (consumers read the
   resolver's transitions; the retaining pass's three hand-built defences and
   `CURB_LEVEL_TOLERANCE` deleted), and §10's deletion list.

**Bespoke tier — remaining.**
- Terrain seating (`seatY`, pad/embed/drape), landmark interiors, anchors→roads
  and the classifier revision — in flight this session.
- Real sandbox isolation (worker or `isolated-vm`) — a **launch blocker**, not a
  Phase 3 blocker: it gates taking money from strangers, not building the tier.

**Fabric breadth (Phase 4) — remaining.** Each lands against the contracts
above and registers its own fan-out rows. *(Urban forms and courtyards/levels
shipped — see "What is built today".)*
- **Flora grammar — WP-A and WP-B shipped 2026-08-07; walked same day.**
  Kai's old-growth verdicts: understory **closed, good** ("dense but the
  right amount" — §9.9 resolved as-is); legacy/modern contrast fine; but
  **the giants failed the silhouette bar** — "not a single growth
  meaningfully more grand than vanilla"; the root flare reads as flat log
  rings ("a few squares"), and hanging growth is underdone. The **WP-B
  grandeur iteration** is therefore next in the flora line: giants that
  genuinely tower (height/crown mass/emergent budget, judged by a measured
  prominence bar — crown top vs the surrounding canopy sea), a
  **procedural buttress-root generator** (Kai's ratified instinct), richer
  hanging growth on large trees, and the floating-vines cleanup.
  **`LEAF_STATE_POLICY` flip: GO** (Kai observed live decay on the walk —
  the confirmation the flip was waiting for); the mega-whorl keeps its
  geometry (its 32 unreachable blocks ride the flip as counted
  `persistent` exceptions). Then **WP-C** (fungal + fantasy +
  `character.flora`), **WP-D** (kit + classifier + Luna e2e demo), and the
  popup-settled follow-ups (per-species `snowLine`; law 1 suspended with
  `capWood` at source).
- **Infrastructure family** — aqueduct, canal, rail, mine headworks, on the
  sweep engine.
- **Agricultural layer and camps** — field parcels following contour, hedgerows,
  orchards, farmsteads sited to the fields they serve; fishing camps, logging
  camps, waystations. What makes a settlement look like it eats.

**From Kai's walk 4 (2026-08-08), two feature notes — wanted, not urgent.**
- **Controllable biome gradients**: harsh borders are right in some places
  and jarring in others (the walked snow-line/forest edge on a bare summit
  cone); blending width should be an author-facing dial (`intent.climate`
  is the natural home), defaulting to today's behaviour.
- **Flora beyond the old-growth ceiling**: "there should be support for
  larger foliage by multiple orders of magnitude, eventually at least" —
  a colossal tier (hill-scale growths) as a future flora phase; the giants
  bar was passed, but it is a floor, not the ceiling.

**Harbourtown junction A/B (Kai, 2026-08-08): no final decision — iterate.**
"Streets/intersections don't really improve, and it introduced a lot of
really horrifying looking stairs" (the walked mossy cascade terracing a
natural waterfront slope) — but Kai chose to give the pass "a couple
iterations" before ruling. The gate stays; iteration 1 (area caps, no
dressing into natural ground, tread alignment, sunken-stair removal) is in
flight with new detectors.

**The road to shipping (ratified with Kai, 2026-08-08).** The dressing
iteration loop is retired as the default mode — detectors catch
regressions; minor bugs go to this ledger and get squashed opportunistically
("at some point we need to go on with the bigger picture"). The sequence:
1. Close the in-flight wave (in-town vegetation, junction iteration, birch
   reproportion), then the **hillside cutover**.
2. **Quick walk-5** of regenerated fixtures — Kai's standing rule applies
   double here: *code detectors never verify a fix; only a walk does*.
   Outstanding nits get noted, not chased.
3. **Baseline battery — five Luna e2e worlds** from diverse prompts (hill
   town, harbour city, fantasy landmark, plains village, wildcard), the
   full product path with bespoke tier and all features. Triage: ledger
   unless product-path blocking.
4. **SHIP-PLAN doc** from the baseline evidence: sandbox isolation (the
   named launch blocker), authoring robustness, delivery wrapper, demo
   assets, pricing posture. **The end goal is shipping terrainist.**
5. **DONE 2026-08-09 — the rung is chosen: rung B amended, no ascent**
   (SHIP-PLAN §8). The release battery is frozen at seven prompts —
   Kai's five breadth prompts (pirate/unicorn war, farm town + aliens,
   the Trojan horse, hideout in metropolis ruins, Hellenist city + sea
   monsters) plus old-growth and fungal-vale — with assertions written
   first. Scope adds F17 minimal farm, F18 bespoke boldness, F19
   district ruins treatment, F20 ambient-terrain fidelity, F22
   constraint teaching. **Feature-stop backstop: 2026-08-28.** All
   remaining feature work executes against §8.

**Smaller, high-leverage.**
- Per-district street palettes (streets still take the settlement root theme).
- Biome tint in `packages/render` — its absence is why grass-seam defects are
  invisible in our own renders and had to be found in-game.
- Plan-map SVG and a scripted flythrough along the vista axes: the demo problem,
  nearly free from data the compiler already produces.
- **Catalog breadth in the prompt's own vocabulary.** Curation decides *which*
  entries, never *how many*. The line this replaces — "entry #441 is worth
  less than one well-made monument" — named a real failure (filling a taxonomy
  for the taxonomy's sake) and drew the wrong conclusion, because the icon law
  changed what an entry is for. A world screams its prompt only when the
  ordinary fabric is built out of the prompt's own forms: Troy in `sun_clay`
  reskinned medieval townhouse shells and read as a sandstone village, because
  the palette was right and every form was borrowed. So the bar for a new
  entry is not "does the taxonomy have a hole" but **"is there a sentence a
  stranger would type that the catalog cannot say?"** — against which a stoa,
  a jolly roger mast and a crop circle each earn their place and a fourth kind
  of warehouse does not. Entries arrive in **form packs**, one culture, era or
  genre at a time, each accepted in a single walk of its own exhibit world and
  each reachable from ordinary prompt language before it ships — because an
  unreachable entry is worth zero however well made, and that, not the count,
  is what curation is for. See `docs/CATALOG-EXPANSION-v0.md`.

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

**The failure mode worth watching for.** Three of the defects fixed on
2026-08-04 had the same shape, and none of ~2,300 tests could see any of them:
the model wrote a reasonable thing, the compiler quietly did something else,
and the diagnostic blamed the document. `road.network@0` required
`params.anchors` and ignored it. `hover` on a scatter node was rejected as an
unknown key, so the correction dropped the request and shipped a node named
`hovering_saucers` sitting on the dirt. A landmark meant to stand in water was
pushed onto dry land and told, via `UNSATISFIABLE`, to loosen constraints that
were already soft — when nothing it could write would have worked.

These only surface by generating a world from a prompt and asking whether the
prompt's central image is *in* it. Look for valid requests the system silently
declines, not for crashes.

**A second failure mode, learned 2026-08-05/06 and worth as much.** *Machinery
that exists and never runs.* `road.network@0` required `params.anchors` and no
code read it. `INTENT_GROUND_UNKNOWN` was assigned a diagnostic code that
nothing raised. `touchesSeam` guarded against an apron reaching a seam with a
condition that was true nowhere. `street.sidewalk` and `street.curb` were read
by six modules and were never members of `DEFAULT_PALETTE`, so every theme in
every world fell through to the same two hard-coded greys. Each reads, in
review, as coverage that is not there. Grep for a symbol's *definition* as well
as its uses.

**And a third, about tests.** A test can pin a defect in place. "Skips a seam
column a street already claims" was written with the street running *along* the
seam and asserted **zero** retaining walls — it passed for weeks and it was
asserting the bug. Tests written from the implementation rather than from the
intent do this, and only a walked world catches them.

**A fourth, learned 2026-08-07, and it explains why four rounds of fixes can
each verify green while the walk stays broken.** *A fix verifies a countable
proxy; the walk fails on an emergent property nothing measures.* The
sheer-face/disconnection round: every fix had honest before/after numbers
(rails smoothed, dirt faces 122 → 4, tallDrop 183 → 0) and the town still had
54 connected components, because `synthesizeTreads` capped the rise and
nothing capped the fall — and the test guarding |Δ| ≤ 1 used a monotonically
rising fixture on which the property was free by construction. The counter is
**instrument-first**: when a walk fails, build the measurement that sees what
the walk sees (the walkability audit — reciprocal connectivity, per-pass
clutter attribution), diagnose against it, and only then fix, judged by
predicted-vs-measured deltas. One audit pass named every mechanism four blind
rounds had missed.

**On the physics lint's limits.** It proves a world is *well-formed*, not that
it is any good. 1,010 stub retaining walls, 314 stair lanterns and a quarter
that is 80% pavement are all perfectly legal, and all three shipped green.
Kai's walks are the only instrument that sees them, which is why *Critique →
repair* is locked to manual.

- **The hillside network, corrected truth (2026-08-07, instrument fixed).**
  Both towns are **fully reachable on foot: entrance share 1.000 on both
  fixtures** — the earlier 0.150 was the audit's paving-only movement graph
  reading grass terraces as walls (Kai's 100%-on-foot walk was the ground
  truth that exposed it; the graph now runs over all standable ground, with
  `groundReachableShare` alongside). `components`/orphans stay
  network-scoped by design — they measure paved-route coherence (flights
  joining streets), an aesthetic-quality signal now, not a reachability
  one. Found in the fix: **`externalEntrance` does not mean external** — it
  picks the road column furthest from the network centroid (the summit
  chapel on hillside), because these fixtures emit no genuinely external
  arrival road; the name promises what nothing provides. Rename or derive
  a real region-edge entrance when a fixture has one.
- **c1-harbourtown moved 186 chunks at `747eaf8` — attributed and justified
  (2026-08-07).** All of it is the Kai-authorized furniture fix: 204 of 376
  kerbside props (54%) were being clipped into loose fragments on that world
  and are now refused whole; 6 new props land where refusals freed the gap;
  27 downstream `life` blocks follow (`existing:` changed). Zero
  ground/level/building/road changes — every one of the 931 blocks
  attributed. The earlier "content-identical" claim came from a probe that
  measured a quantity with no denominator (`blockCount` counts ops that
  *landed*; nothing records ops that didn't) — a differential build was the
  only honest test, and the lesson joins the second failure mode: **a probe
  must be able to see the thing it rules out.**
- **`largestFreeRect` discards roughly 45% of block ground** — still the
  ceiling for every form *except* `hillside`, whose frontage-walked lots
  recover 62% (measured WP-0). The polygon lot cutter remains the general fix;
  `hillside`'s frontage walk is the template.
- **A building on extreme slope can fail `traversal.no_start`** — the steep
  fixture's summit chapel was dropped for it (WP-1, 2026-08-06): on a 1:2.5
  cone its doorstep fails under every `terrain_conform`. A seating/doorstep
  defect for lone buildings far from a district.
- ~~**Cropped street furniture**~~ — **fixed 2026-08-07.** A prop clipped to
  the sidewalk band left wall-block fragments where its standing columns are
  disjoint (bollard row, bicycle rack); `emitProp` now gathers a prop's ops and
  refuses the site if a single one cannot land. It moved flat worlds, which is
  why it waited for Kai's go.
- ~~**The downtown kerbside kit reaches hill villages**~~ — **fixed
  2026-08-07.** `streetscape.kerbsideKit` mirrors the modern-fittings era gate:
  band width proposes the downtown kit, a declared pre-modern era swaps it for
  the rustic one, and a document with no `era` still compiles byte-identically.
- ~~**The sheer cliffs**~~ — **closed 2026-08-07, both halves.** The
  composite mechanism is fixed (per-column face profile, over-ceiling runs
  bench at the composite drop, a wall's foot is a declared claim —
  `5f4a965`), and the policy half is **settled by Kai's steep walk**: tall
  clause-9 walls stay — "what matters is that the village is walkable and
  stairs are non-mangled; tall walls by themselves aren't bad." The
  faces-by-drop report stays as monitoring.
- ~~Flights crossing natural ground went near-invisible~~ — **fixed
  2026-08-07, and the hypothesis was wrong twice**: the paving was all
  there (`stepColumnsOnSoil: 0` — readback-proven), the flights lacked
  *relief*: `treadPlan` only dressed a stair when the column AHEAD rose,
  every flight descends, so the fixture had one stair block town-wide, and
  `floorAtGrade` removed the proud course that used to make the flush
  strip read on same-stone hillside. Kai chose "stairs + landings" by
  popup; the relief mode ships a fourth tread shape (`"fall"` — the same
  stair facing backward up the rise), landings dressed. Steep 7 → 133
  stair blocks. `stepTreadsWithRelief` is the standing counter.
- **Every flight's pinned re-solve is silently refused — a unit
  mismatch (found 2026-08-07, not yet fixed).** `streetStairLevels` hands
  `synthesizeTreads` stand-unit ground (`+1`) where the guard expects
  solid-top y, so a street exactly at grade fails `pinFirst ≥ g0 + 1` by
  one, every flight (8 of 8 across both fixtures) falls back to unpinned
  trial levels, and its head rides one block proud of the street it
  should meet — which is precisely what the terminus-landing and
  junction-step passes absorb downstream. Fixing the units moves every
  flight's endpoint levels: its own careful change, next in the
  street-family queue.
- **`entranceReachableShare` contradicts a human walk** — Kai genuinely
  reaches 100% of the steep town on intended paths; the audit reads 0.150.
  Hypothesis under test: the movement graph admits network columns only,
  so the natural terrace ground that bridges every path is untraversable
  in-graph. Instrument fix in flight; `components` stays network-scoped by
  design.
- **Small-vegetation cutoff at the settlement edge (walked 2026-08-07,
  steep)** — grass/flowers end on a hard mask line while the biome already
  feathers; the undergrowth suppression needs the same smoothstep-dithered
  band. In flight.
- **`props.ts` levels a prop pad into open hillside** — measured cutting
  4 blocks deep at `(74,2)` on the steep fixture, directly under a
  retaining wall (the foot claim now stops the *damage*, not the dig). A
  plinth cut that deep on open ground is its own defect; unfixed, found
  2026-08-07.
- **A terraced quarter generates 11 "public squares".** Found while fixing prop
  density (2026-08-06) and deliberately not fixed there: gating plaza props
  would have moved a flat control world. The defect is that the fabric layer
  calls too much leftover ground a square, not that the life pass decorates
  them.
- **`setpieces.ts` hard-codes a `stone_bricks` masonry family** for hillside
  set-piece stair and bridge dressing, so it ignores the ground roles landed
  2026-08-06.
- ~~**Junctions between streets at different levels**~~ — **fixed for
  stepped ground 2026-08-07**, and the ownership-pin theory was wrong: the
  risers come from three owners (surfaces sharing no column; doorsteps
  raising lane columns they don't own; a segment stepping at an arc
  station), so `structures/junction-steps.ts` reconciles the *finished*
  paving instead — bounded Lipschitz lift, dressed as stairs, committed
  through the ground driver. `undressedCutoffs` 0 on both fixtures; the
  parallel-street control lifts nothing. Flat towns stay gated (roadmap
  item 5 — Kai's enable decision).
- **City walls (`sweepCourse`) and the sidewalk band's own paving still use the
  pre-arc raster-perpendicular model.** If dither appears *beside* a diagonal
  street rather than on it, it lives there.
- **A district may be seated flush against the region boundary, and is then
  sliced by it.** Seen on a generated old-quarter world (2026-08-05): the
  region is `x0 −256, width 512`, so its east edge is `x1 = 255`, and the
  solver placed the quarter at `x0 96 … x1 255`. Blocks, lots and buildings
  are cut mid-structure by the edge of the world, which reads to a player as a
  broken town rather than an edge. The solver has no boundary margin for a
  fabric-bearing node; a district wants at least a block of clearance, and
  arguably a whole `blockSize`.
- District placement scoring appears to prefer flat ground over an explicit
  `zone` constraint (seen while building the wall exhibit; not chased).
- Hard `adjacent_to` / `terrain_conform` constraints on ordinary cottages are
  routinely demoted to soft by the solver; the demotions are reported, but the
  frequency suggests the constraint vocabulary or its cost model is too strict
  for small-town layouts.
- Programs are seated against a *median* ground plane. On a footprint spanning
  genuinely broken ground that is the least-bad plane, not a correct one; a
  large landmark on a slope still shows a step at one edge. The refusal
  threshold (`PROGRAM_MAX_RELIEF`) is a sanity ceiling, not a fit criterion.
- The physics gate now runs the emitter's connection pass, so it and the real
  emit agree on fences. Other emit-time passes are still gate-invisible — if
  one is added, the gate has to grow with it or it goes back to judging a world
  production never writes.
- **"Ruins of a city" cannot be said (battery wildcard walk, 2026-08-09;
  Kai: ledger, do not hotfix).** The prompt "overgrown ruins of a once-great
  city" authored as one `ruined_keep` + four `collapsed_tower`s + a road
  grid — the kit's entire ruin vocabulary is the five wave-6E relics, and
  **decline has no building story at district scale**: the intent fan-out
  drives road wear, ground decay (`decayCoverage` → grounds.ts) and
  vegetation reclaim, but no mechanism rolls a district's lots into their
  ruined-variant shells. Luna's sparse answer was the best sentence the
  language can say. Third ruins-flavored finding (OPM's W483 request, the
  kit's own open question at settlement-author.md §table-14, this walk) —
  prime scope evidence for the rung consult. The fix direction, when scoped:
  district lots roll deterministically into ruined shells at high decline,
  per the existing ruin law ("the ordinary shell fit-out decayed, not a
  second grammar").
- ~~**`ScatterArea` mixes units and swallows the mistake**~~ — **instrumented
  2026-08-09 (F21).** Both guards now exist and both are in the compile
  feedback set: `LOAM-T118 SCATTER_RADIUS_UNITS` warns at validate time on any
  `area.radius` under 2 blocks ("radius is in BLOCKS, `at` is fractional",
  with the f × extent / 2 conversion in the fix hint), and
  `LOAM-T119 SCATTER_EMPTY` fires from the vegetation pass on a forest node
  that planted zero trees, naming the node and distinguishing four causes
  (area covers no columns / no plantable ground / all of it inside the
  settlement clearing / density-and-spacing drew nothing). T118 is a
  **warning** by design — a sub-block radius is legal Loam and the document
  still compiles. Original entry: `at` is
  fractional, `radius` is blocks; Luna wrote `radius: 0.55` (meaning 55% of
  the region) and the central "ruin canopy" forest placed **zero trees**,
  silently: no validator floor on radius, and a scatter node with zero yield
  draws no author-actionable finding, so the compile-feedback loop (0 rounds
  on that world) never heard about it. Either guard would have let the
  feedback round fix the run. Ledgered by Kai's call, 2026-08-09.
- ~~**The emitter's biome-intent table is narrower than Luna's vocabulary**~~
  — **widened 2026-08-09 (F21).** `PROFILE_BIOMES` gained 20 intent-only rows
  (`dark_forest`, `birch_forest`, `old_growth_birch_forest`, `flower_forest`,
  `windswept_forest`, `pale_garden`, `cherry_grove`, `sunflower_plains`,
  `meadow`, `grove`, `savanna`, `windswept_savanna`, `jungle`,
  `sparse_jungle`, `swamp`, `snowy_taiga`, `old_growth_spruce_taiga`,
  `old_growth_pine_taiga`, `jagged_peaks`, `frozen_peaks`) — every one of them
  a biome whose whole signature is tint, fog and spawns, which is all the
  clamp can honestly deliver. Deliberately **not** carried, because their
  signature is ground material the terrain pass never lays: `desert`,
  `badlands`, `mangrove_swamp`, `mushroom_fields`, `ice_spikes`,
  `bamboo_jungle` — and the W472 fix hint now says so. `biomeForColumn`
  derives none of the new rows and they are appended after the derived ones
  (which `ambientVote`'s tie-break walks in source order), so no existing
  world moves a byte unless a document names one.
- **S2 battery signatures (2026-08-09, all five worlds; for the rung
  consult).** (a) **Bespoke steering read as correct, not timid**: four
  worlds authored zero programs and the one prompt that demanded a
  landmark (the wizard's citadel) got one — authored, gated, and, when
  Luna forgot to invoke it, **rescued by the wiring check's first
  production catch**. (b) The **main town district ends UNSATISFIABLE**
  (placed least-violating) on both hillside-form worlds even after a
  feedback round, behind a spray of `terrain_conform` / `adjacent_to`
  demotions — uniform enough to implicate how the kit teaches constraints
  at 1024². (c) ~~**Ambient terrain ignores the prompt's landscape**: "open
  plains" produced 3.2% plains / 57% stony_peaks + windswept_hills outside
  the clamped village footprint.~~ — **fixed 2026-08-09.** The terrain was
  authored roughly right and then mislabelled twice over. `relief` is
  normalized to the world's own span, so the land bands were scale-*inverting*
  — the flatter the world, the rockier it read (a 22-block world came out 74%
  "high rock"). The bands now require an absolute rise above sea level as well
  (`UPLAND_RISE` 24, `HIGH_ROCK_RISE` 48), and soil caps at `windswept_hills`:
  only a genuine `CLIFF` column can be bare rock. Second, `forested` keyed on
  scatter *eligibility*, so a `{all:true}` node at density 0.012 painted a
  whole map `forest`; nodes below `FOREST_COVERAGE_DENSITY` (0.02) no longer
  contribute coverage. plains_village goes 3.2% → 81.3% plains, overgrown_ruins
  42.5% → 0% stony_peaks, while hill_town and harbour_city keep their high
  ground as `windswept_hills` + peaks. **Blocks are untouched** — `paintBiomes`
  runs after the column plan, and all four worlds' compile reports are
  identical outside `biomeHistogram`, land-use clamp and snow votes included.
  The kits gained a flat end to the amplitude scale, a `baseHeight` rule for
  plains, and a warning that a trace-density all-region scatter is wilderness,
  not woods. The remaining half — an intent `landform` dial that steers the
  heightfield from the prompt — is deliberately still open.
- ~~**A large program's block list crashed the whole compile**~~ — **fixed
  2026-08-09 (`d4e7f47`), found by battery world 5/5.** The citadel's
  165,117 blocks passed through `blocks.push(...lowered.blocks)`, past
  V8's ~125k argument budget: "Maximum call stack size exceeded", rc 1,
  no world. Product-path blocking (any big-landmark prompt died), so it
  crossed the ledger bar. The pass appends by loop at all four sites; the
  regression test builds a 196,608-voxel landmark and was proven to die
  at the production frame before the fix. Reminder the crash almost
  hid: program output is the one array whose length a *model* chooses —
  audit any future spread-append against that class.

- **`LOAM-E497 SITE_PLAN_FAILED` now blocks harbour-class compiles —
  ELEVATED 2026-08-09, next in queue.** With F22's fix placing districts
  properly, harbour_city's old_town lands on real shoreline ground where
  the retaining pass finds 3 seam columns with no platform to stand a
  wall on, and the compile aborts. Pre-existing site-planner bug the
  coin-toss placement had masked; it now gates any coastal district
  prompt end to end.
- **`DEFAULT_CANDIDATES = 96` is thin for a footprint a sixth of the
  map** (F22 side finding) — candidate enumeration wants to scale with
  footprint/region ratio.

- ~~**A recompiled high-decline metropolis carries ~12 residual lint
  findings**~~ — **fixed 2026-08-10 (996ee58)**: flora now settles
  against the composed world (rule 13's own predicate, single-sweep
  fixpoint proven), and decay's stranded-fitting clause learned full
  cubes. 12 → 0 on the P4 doc; seeds 300–310 sweep clean.
- ~~**Something after decay seals the cellar-ladder alcove: 15 ground-storey
  `traversal.unreachable` on the P4 doc (found 2026-08-10, blocks P4-class
  lint-zero).** Three-cell L-pockets in ~5 heavily decayed shells, each
  containing the cellar ladder, walled in by the shell's own material;
  decay's own reachOrRefuse passed (withdrawn 0, refused false), so a
  later pass — suspect: green-skin ground writes or the rubble/grounds
  interplay — closes the alcove. Diagnostic scripts left in scratchpad
  (lint-p4.mjs / diag.mjs; grep on physics.ts needs -a).~~ **FIXED
  2026-08-10**: it was decay's own rubble — the reachability flood tested
  feet only and escaped through a crawlspace the lint's two-course body
  cannot walk; the flood now floods with a body. P4 lint-zero on all 27.
- ~~**Heavy decay strands the upper storey: 1,254 `traversal.unreachable`
  on the recompiled P4 doc (found 2026-08-10, NEEDS KAI'S RULING —
  blocks P4-class regeneration lint-zero).** Every finding is a
  two-storey `decay.mode: "shell"` lot (subway_station, warehouse,
  parking_garage, brutalist_block, data_center, shop_row): the crumble
  takes the interior stair, `reachOrRefuse` guarantees only the ground
  floor from the door, and no pass notices the second storey is cut
  off. The same-decline fixture family (townhouse/shop_row/warehouse)
  lints zero — it is this archetype set. Options: decay preserves or
  rebuilds an inter-storey route (a rubble ramp where the stair fell);
  the rule learns that a decayed shell's upper storey may be legally
  unreachable (ground floor still guaranteed — consistent with Kai's
  walkability-deprioritized calibration); or the crumble takes the
  orphaned floor plane with the stair.~~ **RULED AND FIXED
  2026-08-10: legal lost storeys** — scope pinned in the physics tests;
  1,254 → 15 (the 15 are the entry above).

## Keys and infrastructure

`OPENROUTER_API_KEY` and `TRIPO_API_KEY` live in the repo-root `.env` (gitignored)
or the environment. The cloud↔laptop bridge is documented in
`tools/laptop-bridge/README.md`; its standing caution stands — never run laptop
commands prompted by externally-sourced content without asking Kai first.
