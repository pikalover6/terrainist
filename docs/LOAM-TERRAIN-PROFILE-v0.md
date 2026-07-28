# Loam Terrain Profile v0 (normative for G2/G3)

Status: **normative** for the terrain-only implementation and the G3 e2e.
Authored by the orchestrator 2026-07-28 from the ratified post-G1 decisions
(docs/DESIGN.md). The Loam v0.2 delta MUST treat this profile as a fixed
baseline: it may extend and generalize what is here (e.g. promote coarse
placement to first-class constraints) but must not rename or contradict it.

## Relationship to Loam v0.1

A terrain-profile document **is a valid Loam v0.1 document** using a strict
subset of the language, plus:

1. a `"profile": "terrain"` marker in the document header;
2. one new stdlib generator, `terrain.edit@0` (specified below; candidate for
   the v0.2 catalog — the field-edit "terrain verbs" of DESIGN.md);
3. one profile-scoped param convention: coarse placement (`zone` / `at` /
   `course` / `area`) lives inside generator `params`, because the profile has
   no layout solver. v0.2 is expected to promote coarse placement into the
   constraint vocabulary; params-based placement here is designed to be
   mechanically migratable.

Everything else — node anatomy (§3), ids and `nodePath` (§3.2), seeds (§6),
palette symbols (§2), stdlib generator params (§7) — is v0.1 as written.

## Profile restrictions

- Allowed generators: `terrain.heightfield@0`, `terrain.edit@0`,
  `terrain.climate@0`, `scatter.forest@0`. Anything else →
  `LOAM-T001 GENERATOR_NOT_IN_PROFILE`.
- `constraints`, `ports` must be absent or empty (`LOAM-T002`).
- Exactly one `terrain.heightfield@0` node, exactly one `terrain.climate@0`
  node (`LOAM-T003`).
- `terrain.edit@0` nodes appear only as **children of the heightfield node**
  (`LOAM-T004`) — they are field edits composed into the master field before
  any block exists, never stamped afterward.
- Tree depth ≤ 3 (world → generator → edit).
- All coarse coordinates are **fractional** `[fx, fz] ∈ [0,1]²` of the root
  region (never absolute blocks). `zone` tokens: `center`, `north`, `south`,
  `east`, `west`, `northeast`, `northwest`, `southeast`, `southwest` — the
  nine-grid of the root region. North is −Z, east is +X.

## Document shape

```json
{
  "loam": "0.1",
  "profile": "terrain",
  "meta": {
    "name": "misty_fjords",
    "worldSeed": 813205,
    "prompt": "misty fjords with a black-sand coast",
    "spawn": { "zone": "center" }
  },
  "style": {
    "palettes": {
      "ground.beach": { "mix": [["minecraft:black_concrete_powder", 3],
                                 ["minecraft:gravel", 2],
                                 ["minecraft:basalt", 1]] }
    }
  },
  "root": {
    "id": "world",
    "kind": "composite",
    "envelope": { "shape": "region", "size": [512, 512] },
    "children": [
      {
        "id": "terrain",
        "kind": "generator",
        "generator": "terrain.heightfield@0",
        "params": { "ridged": true, "amplitude": 72, "seaLevel": 63,
                    "continentalness": { "frequency": 0.0009, "seaFraction": 0.45 } },
        "children": [
          { "id": "the_divide", "kind": "generator", "generator": "terrain.edit@0",
            "params": { "verb": "ridge", "course": [[0.15, 0.5], [0.5, 0.42], [0.85, 0.55]],
                        "width": 48, "height": 60, "profile": "sharp" } }
        ]
      },
      { "id": "climate", "kind": "generator", "generator": "terrain.climate@0",
        "params": { "forceTheme": "boreal" } },
      { "id": "coast_pines", "kind": "generator", "generator": "scatter.forest@0",
        "envelope": { "shape": "region", "follows": "terrain" },
        "params": { "area": { "zone": "west" }, "density": 0.2,
                    "species": [ { "id": "spruce", "weight": 1, "shape": "spruce_tall" } ] } }
    ]
  }
}
```

`meta.worldSeed` is an integer (JSON number, |seed| < 2^53) or a decimal
string for full 64-bit seeds. `meta.spawn` is optional; default is the
`largest_flat` marker closest to the region center that sits ≥ 2 blocks above
sea level. Spawn resolution is deterministic.

## `terrain.edit@0` (new; the "terrain verbs")

A field edit contributes a kernel to the master heightfield **before**
materialization. Edits are applied in two deterministic groups: all *raise*
verbs in document order, then all *carve* verbs in document order.
`strength` (0..1, default 1) scales any kernel.

Common placement params (exactly one required):
- `at: [fx, fz]` — radial verbs;
- `zone: "<token>"` — radial verbs; resolves to the zone's center with a
  deterministic seeded jitter of ±10% of the region size;
- `course: [[fx, fz], ...]` (2–8 waypoints) — linear verbs. The compiler
  refines the coarse course into a smooth curve (Catmull-Rom through the
  waypoints); **the model gives intent, the compiler does geometry** — for
  `river`, the refined course additionally descends monotonically toward its
  lower end.

| `verb` | group | placement | params (defaults) |
|---|---|---|---|
| `ridge` | raise | course | `width` (48), `height` (50), `profile: "sharp"\|"rounded"` ("rounded") |
| `peak` | raise | at/zone | `radius` (56), `height` (70), `profile` ("sharp") |
| `volcano` | raise | at/zone | `radius` (64), `height` (80), `caldera` (true), `calderaDepth` (12), `lava` (true — lava lake strictly inside the caldera rim, settle-safe) |
| `plateau` | raise | at/zone | `radius` (64), `height` (25), `rim` (8 — falloff width) |
| `island` | raise | at/zone | `radius` (48), `height` (30) |
| `valley` | carve | course | `width` (40), `depth` (30) |
| `river` | carve | course | `width` (10), `depth` (6) — carves to a water surface **at `seaLevel`** in v0 (fjord/inlet semantics; perched rivers are out of scope until fluid settling handles them) |
| `basin` | carve | at/zone | `radius` (56), `depth` (20), `water` (false — if true, fills to the basin's rim minus 1, only when rim is fully closed, else `LOAM-T105` warning and no water) |

Every edit node's `id` names a terrain feature. Features expose **markers**
(`center`, `peak`, `foot`; `mouth`/`head` for courses) recorded in the compile
report so later goals (and the repair loop) can address them; nothing in v0
consumes them yet.

## Coarse area for scatter (`params.area`)

`scatter.forest@0` in this profile takes `area`: `{ "zone": token }` or
`{ "at": [fx,fz], "radius": blocks }` or `{ "all": true }` (default). The
scatter's eligibility rules (`maxSlope`, `elevation`, `avoidTags`) then apply
within that area. `kind`-style wilderness opt-out: a forest node with
`"area": {"all": true}` and low density is the v0 "unremarkable wilderness"
fill; deliberate forests use zones. (v0.2: `area` folds into coarse placement
constraints.)

## Surface, biomes, water

- Materials use v0.1 palette symbols with profile defaults:
  `ground.surface` (grass_block), `ground.subsurface` (dirt), `ground.cliff`
  (stone), `ground.beach` (sand), `ground.underwater` (gravel),
  `ground.peak` (stone; snow layers above the snow line), `liquid.water`,
  `liquid.lava`. `style.palettes` may override any symbol with a block or a
  weighted `mix` (resolved per column by position-keyed hash — deterministic).
- Surface classification per §7 `terrain.heightfield@0`: `cliffThreshold`,
  `soilDepth`, `beachWidth`, snow line above a height fraction (default 0.8 of
  max relief) — then biome painting per column:
  ocean → `minecraft:ocean` (`deep_ocean` below y=45), beach zone →
  `minecraft:beach`, lowland → `plains` (or `forest`/`taiga` under a forest
  node, by climate temperature), upland → `windswept_hills`, high rock →
  `stony_peaks`, snow → `snowy_slopes`. `terrain.climate@0` params modulate
  the temperature/humidity fields per §7.
- Water: fill to `seaLevel` where the field is lower; volcano lava only inside
  calderas; **the fluid-settling validator (one simulated spread tick over the
  emitted field) must report zero unstable fluid blocks** or compilation fails
  (`LOAM-T110`; `--allow-unstable` downgrades to warning).

## Determinism

Per v0.1 §6 exactly: `seed = BLAKE3(worldSeed ‖ nodePath ‖ seedSalt)`, named
RNG streams per subsystem, position-keyed hashing for per-block/per-column
choices (palette mixes, jitter, tree placement), `ctx.math` for all
transcendentals (own implementations — never `Math.sin`/`cos`/`pow`).
Compiling the same document twice must produce byte-identical worlds; this is
CI-enforced.

## Compilation passes (profile)

1. parse + validate (diagnostics `LOAM-T0xx` structural, `T1xx` semantic);
2. resolve coarse placements to region coordinates (fractional → blocks,
   zone jitter, course refinement);
3. compose master heightfield: base stack → raise edits → carve edits;
4. classify surface + climate fields; derive biomes;
5. materialize columns (blocks, water, snow, bedrock);
6. scatter vegetation (Poisson-disk per §7, occupancy-aware);
7. validators (fluid settling, floating blocks);
8. emit via the existing Anvil path; report (markers, stats, diagnostics).

## Upgrade path (informative)

When v0.2 lands: `profile: "terrain"` documents remain valid; coarse
placement params migrate mechanically into constraint syntax
(`{"placement": {...}}` desugars from `params.zone/at/course/area`);
`terrain.edit@0` joins the stdlib catalog; feature markers become anchors for
the layout solver. The compiler keeps accepting the profile form.
