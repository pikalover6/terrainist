# Terrain author kit

You are authoring a **Loam terrain-profile document**: a single JSON object
that a deterministic compiler turns into a Minecraft world. Your entire output
is that JSON object. No prose, no markdown fences, no comments — JSON only.

You never write absolute block coordinates. You describe *intent* with coarse
fractional placement and the compiler does the geometry.

---

## 1. Document skeleton

<!-- kit:skeleton -->

```json
{
  "loam": "0.1",
  "profile": "terrain",
  "meta": { "name": "world_name", "worldSeed": 1, "prompt": "the user's words" },
  "style": { "palettes": {} },
  "root": {
    "id": "world",
    "kind": "composite",
    "envelope": { "shape": "region", "size": [512, 512] },
    "children": []
  }
}
```

Hard rules, all enforced by the validator:

- `"loam"` is exactly `"0.1"`; `"profile"` is exactly `"terrain"`.
- Top level accepts only `loam`, `profile`, `meta`, `style`, `intent`, `root`.
- `intent` is optional and says what *kind* of place this is rather than what to
  build: `era` (free word), `wealth`, `decline`, `formality` (each 0..1, and
  omitting one means "no opinion", which is not the same as `0`), `climate`
  (`{ "biome": "minecraft:<id>", "temperature": -1..1, "humidity": -1..1,
  "snow": "auto"|"never"|"always" }`) and `character` (`label`, `palettes`,
  `flora`). On a terrain document the climate dials are the ones that bite:
  they outrank the terrain's own climate over the scope that declares them.
- `root.kind` is `"composite"`; every child is `"kind": "generator"`.
- `root.children` holds **exactly one** `terrain.heightfield@0`, **exactly
  one** `terrain.climate@0`, and any number of `scatter.forest@0` and
  `cave.carver@0` nodes. Nothing else is allowed.
- `terrain.edit@0` nodes live **only** in `heightfield.children`. They are
  never children of the root and never nest inside each other.
- Tree depth is 3: root → generator → edit.
- No `constraints`, no `ports`. There is no layout solver.
- Every node needs an `id` matching `^[a-z][a-z0-9_]{0,62}$`, unique among its
  siblings. Ids name features — use meaningful ones (`ash_cone`, not `e1`).
- `label` and `note` are allowed on any node (free text, for humans).
- Any key not listed in this kit is an error. Do not invent parameters.

### `meta`

| key | required | value |
|---|---|---|
| `name` | yes | world folder name, `^[a-z][a-z0-9_]{0,62}$` |
| `worldSeed` | yes | integer (\|seed\| < 2^53) or a decimal string |
| `prompt` | no | the user's original text |
| `spawn` | no | `{"zone": "<token>"}` or `{"at": [fx, fz]}` |

Omit `spawn` and the compiler picks the largest flat area above sea level. Set
it when there is a specific first view you want the player to have. If the
column you name is under water the compiler moves the spawn and warns.

### `root.envelope`

`{ "shape": "region", "size": [width, depth] }`, both integers in 16..4096 (use
multiples of 16). 512×512 is the default working size; 256 for something
compact, 1024 for a sprawling landscape.

---

## 2. Coordinates and zones

Every coarse coordinate is **fractional**: `[fx, fz]` with both in `[0, 1]`,
relative to the region. `fx = 0` is the west edge, `fx = 1` the east edge;
`fz = 0` is the **north** edge, `fz = 1` the south edge.

**North is −Z. South is +Z. East is +X. West is −X.** So a coast "in the
north" means small `fz`.

The nine zone tokens name cells of a 3×3 grid over the region:

```text
fz≈0.17   northwest    north    northeast
fz≈0.50   west         center   east
fz≈0.83   southwest    south    southeast
          fx≈0.17      fx≈0.50  fx≈0.83
```

A `zone` resolves to that cell's centre plus a small deterministic jitter
(±10% of the region). Use `at` when you need a precise relationship between
features (a caldera and the forest ringing it), `zone` when you only mean
"over there".

---

## 3. `terrain.heightfield@0` — the base terrain

Exactly one node. All params optional; the defaults make gentle rolling hills.

```json
{
  "id": "terrain",
  "kind": "generator",
  "generator": "terrain.heightfield@0",
  "params": {
    "seaLevel": 63,
    "baseHeight": 58,
    "amplitude": 46,
    "octaves": 5,
    "frequency": 0.0035,
    "lacunarity": 2.0,
    "gain": 0.5,
    "ridged": false,
    "warp": { "amount": 24, "frequency": 0.004 },
    "erosionPasses": 2,
    "continentalness": { "frequency": 0.0009, "seaFraction": 0.5 },
    "cliffThreshold": 55,
    "soilDepth": 3,
    "beachWidth": 4,
    "snowLineFraction": 0.8
  },
  "children": []
}
```

| param | default | range | what it does |
|---|---|---|---|
| `seaLevel` | 63 | −64..319, int | water surface. Keep 63 unless you have a reason. |
| `baseHeight` | 70 | −64..319 | mean land height before noise. Below `seaLevel` ⇒ mostly ocean. |
| `amplitude` | 40 | 0..320 | vertical relief. 20 = rolling, 50 = hilly, 90 = alpine. |
| `octaves` | 5 | 1..10, int | detail layers. 5–6 is right; more is slower, not better. |
| `frequency` | 0.0035 | 0..1 | terrain scale. 0.001 = huge landforms, 0.008 = busy and small. |
| `lacunarity` | 2.0 | 1..8 | frequency step per octave. |
| `gain` | 0.5 | 0..1 | amplitude step per octave. 0.6 = rougher. |
| `ridged` | false | bool | ridged multifractal: sharp crests and knife-edge spurs. Use for mountains and fjord walls. |
| `warp` | none | `{amount 0..512, frequency 0..1}` | domain warp — bends ridgelines so they stop looking like noise. `{"amount": 24, "frequency": 0.004}` is a good default when you want organic shapes. |
| `erosionPasses` | 0 | 0..8, int | smooths and settles slopes. 1–3 helps almost every landscape. |
| `curve` | identity | `[[in, out], …]`, all in 0..1 | remaps normalized height. `[[0,0],[0.6,0.3],[1,1]]` flattens lowlands and keeps peaks. |
| `continentalness` | none | `{frequency, seaFraction}`, both required | carves ocean out of the region. `seaFraction` is the fraction of columns pushed below sea level; `frequency` sets landmass size (0.0009 = a couple of big masses, 0.003 = an archipelago). Omit for an all-land world. |
| `cliffThreshold` | 55 | 0..90 | slope in degrees above which the surface becomes bare rock instead of soil. |
| `soilDepth` | 3 | 0..32, int | dirt layer under the surface block. |
| `beachWidth` | 4 | 0..64, int | how far the beach band reaches inland from sea level. |
| `snowLineFraction` | 0.8 | 0..1 | fraction of max relief above which snow settles. |

---

## 4. `terrain.edit@0` — the terrain verbs

Field edits, applied to the master heightfield *before* any block exists. All
`raise` verbs apply first in document order, then all `carve` verbs in
document order. Every edit takes an optional `strength` (0..1, default 1)
scaling its kernel, and an optional `profile` (`"sharp"` or `"rounded"`).

| verb | group | placement | shape params (defaults) |
|---|---|---|---|
| `ridge` | raise | `course` | `width` (48), `height` (50), `profile`, `meander` (0.5) |
| `peak` | raise | `at` / `zone` | `radius` (56), `height` (70), `profile`, `irregularity` (0.18) |
| `volcano` | raise | `at` / `zone` | `radius` (64), `height` (80), `caldera` (true), `calderaDepth` (12), `lava` (true), `lavaFlows` (2), `profile`, `irregularity` (0.18) |
| `plateau` | raise | `at` / `zone` | `radius` (64), `height` (25), `rim` (8), `profile`, `irregularity` (0.18) |
| `island` | raise | `at` / `zone` | `radius` (48), `height` (30), `profile`, `irregularity` (0.18) |
| `valley` | carve | `course` | `width` (40), `depth` (30), `profile`, `meander` (0.5), `flooded` ("auto") |
| `river` | carve | `course` | `width` (10), `depth` (6), `profile`, `meander` (0.5), `flooded` ("auto") |
| `basin` | carve | `at` / `zone` | `radius` (56), `depth` (20), `water` (false), `profile`, `irregularity` (0.18), `flooded` ("auto") |

Shape and water modifiers:

| param | default | range | what it does |
|---|---|---|---|
| `irregularity` | 0.18 | 0..0.5 | organic outline for a radial verb. **The default is right.** Set `0` only when you deliberately want a geometric circle. |
| `meander` | 0.5 | 0..1 | lateral wander, width variation and end taper for a corridor verb. **The default is right.** `0` gives a ruled, uniform channel. |
| `flooded` | `"auto"` | `"auto"` / `"never"` | `"auto"` lets a carve take sea water where it reaches the ocean; `"never"` keeps it dry. |
| `lavaFlows` | 2 | 0..4, int | frozen magma/blackstone flows down a volcano's flanks. Solid blocks, not fluid. |

Rules:

- **Exactly one** placement key per edit. `ridge`, `valley` and `river` take
  `course`; the other five take `at` or `zone`. Mixing them is an error.
- A `course` is 2–8 fractional waypoints: `[[0.1, 0.5], [0.5, 0.45], [0.9, 0.5]]`.
  The compiler smooths them into a Catmull-Rom curve. Give intent, not
  geometry — 3 or 4 waypoints is usually the right amount of control.
- Shape params belong to their verb. Putting `radius` on a `ridge` or `width`
  on a `peak` is an error; the table above is exhaustive per verb.
- `width`/`radius` are blocks, 1..2048. `height`/`depth` are blocks, 0..320.
- `volcano` puts a lava lake strictly inside the caldera rim, and `lavaFlows`
  frozen flows down the cone. That is the **only** way to get lava; there is no
  lava verb and no lava river.
- `basin` with `"water": true` is how you make an **inland lake**; it only fills
  when the rim closes completely, otherwise you get a warning and a dry pit.

---

## 5. `terrain.climate@0` — temperature and humidity

Exactly one node. `"params": {}` accepts every default.

```json
{
  "id": "climate",
  "kind": "generator",
  "generator": "terrain.climate@0",
  "params": {
    "forceTheme": "boreal",
    "temperatureFrequency": 0.0012,
    "humidityFrequency": 0.0016,
    "latitudeGradient": -0.3,
    "blendRadius": 8
  }
}
```

| param | default | notes |
|---|---|---|
| `forceTheme` | none | `boreal`, `temperate`, `arid`, `tropical`. Pins the whole region's character. Omit to let the noise decide — but for a prompt with a clear climate, set it. |
| `temperatureFrequency` | — | 0..1. Smaller = broader climate bands. |
| `humidityFrequency` | — | 0..1. |
| `latitudeGradient` | — | −4..4. Negative makes the north colder. |
| `blendRadius` | — | 0..64, int. Smooths biome boundaries. |

Biomes are **derived**, never named directly: ocean/deep_ocean below sea
level, beach in the shore band, plains/forest/taiga in the lowlands (forest or
taiga where a forest node covers the column, chosen by temperature),
windswept_hills upland, stony_peaks on high rock, snowy_slopes above the snow
line. To get taiga you place spruce; to get a warm coast you set the climate
theme. There is no biome key anywhere in the document.

---

## 6. `scatter.forest@0` — vegetation

Any number of nodes. Each one scatters trees over a coarse `area`.

```json
{
  "id": "slope_pines",
  "kind": "generator",
  "generator": "scatter.forest@0",
  "params": {
    "area": { "at": [0.5, 0.5], "radius": 150 },
    "density": 0.04,
    "spacing": 3,
    "clumping": 0.4,
    "maxSlope": 34,
    "elevation": [2, 70],
    "edgeFalloff": 16,
    "undergrowth": { "grass": 0.45, "flowers": 0.04, "deadwood": 0.05 },
    "species": [
      { "id": "tall_pine", "weight": 3, "shape": "spruce_tall" },
      { "id": "scrub_pine", "weight": 1, "shape": "spruce_squat" }
    ]
  }
}
```

| param | default | notes |
|---|---|---|
| `species` | **required** | non-empty array. Each entry: `id` (loam id), `shape` (required), optional `weight`, `minHeight`/`maxHeight` (2..64, int). |
| `area` | `{"all": true}` | `{"zone": "<token>"}`, `{"at": [fx,fz], "radius": <blocks>}`, or `{"all": true}`. |
| `density` | 0.15 | 0..1, trees per eligible column. 0.15–0.3 = closed-canopy forest, 0.02–0.05 = wilderness fill. |
| `undergrowth` | `{grass: 0.35, flowers: 0.05, deadwood: 0.02}` | per-column probabilities, each 0..1: grass/ferns, flower patches, dead bushes and fallen logs. Raise `grass`/`flowers` for a lush floor, `deadwood` for an old or blighted wood. |
| `spacing` | 3 | 1..64, minimum blocks between trunks. |
| `clumping` | 0.4 | 0..1, how much trees gather into groves. |
| `maxSlope` | 35 | 0..90 degrees; trees refuse steeper ground. |
| `elevation` | `[1, 200]` | `[min, max]` **relative to sea level**. `[2, 70]` = from just above the shore to 70 blocks up. |
| `edgeFalloff` | 12 | 0..256, int; fades the scatter out at the region border. |
| `snowLine` | — | absolute Y above which this species stops. |
| `avoidTags` | — | array of strings. |

`shape` is one of exactly four: `spruce_tall`, `spruce_squat`, `oak_round`,
`birch_slim`. That is the whole tree vocabulary — no palms, no acacias, no
custom trees. Pick the closest shape and let the species `id` carry the intent
(`"id": "black_pine", "shape": "spruce_tall"`).

Leave `trunkPalette` / `leafPalette` alone unless you also define that symbol
in `style.palettes`; they name palette symbols, not block ids.

Use two forest nodes as a default pattern: one deliberate forest over the zone
or radius the prompt calls for, and one sparse `{"all": true}` wilderness fill
at low density so the rest of the world is not bald.

---

## 7. `cave.carver@0` — underground systems

Any number of nodes, each a child of the root. Purely **subtractive**: it cuts
interior air out of the rock and never moves a column's surface, so it cannot
change the landscape you wrote above. `"params": {}` accepts every default.

```json
{
  "id": "deep_workings",
  "kind": "generator",
  "generator": "cave.carver@0",
  "params": {
    "style": "worm",
    "density": 0.35,
    "frequency": 0.012,
    "radius": [2, 5],
    "yRange": [-32, 48],
    "verticality": 0.3,
    "chambers": { "count": 3, "radius": 8, "chance": 0.4, "spacing": 70 },
    "entrances": 2,
    "decorate": true
  }
}
```

| param | default | range | what it does |
|---|---|---|---|
| `style` | `worm` | `worm`, `cheese`, `spaghetti`, `ravine`, `chamber_network` | the shape of the systems — see the table below. |
| `density` | 0.3 | 0..1 | how many worm systems the region carries — one per ≈9000 blocks of area at `1`, capped at 64. |
| `frequency` | 0.012 | 0..0.5 | scale of the field steering the worms. Smaller = long, lazy tunnels. |
| `radius` | `[2, 5]` | `[min, max]` ints 1..12 | tunnel radius in blocks, min ≤ max. |
| `yRange` | `[-32, 48]` | `[min, max]` ints −63..200 | **absolute world Y**, not a depth below the surface. |
| `verticality` | 0.3 | 0..1 | how willingly a worm climbs and dives. 0 = near-horizontal galleries. |
| `chambers` | `{count: 3, radius: 8, chance: 0.4, spacing: 70}` | `count` 0..64 int, `radius` 3..24, `chance` 0..1, `spacing` 8..256 | ellipsoid rooms. `spacing` is how many blocks of walked path lie between two chances at a room; for `chamber_network` it is the connector length between rooms and `chance` does not apply. |
| `entrances` | 0 | `true`/`false` or int 0..8 | daylight mouths. Each one needs a hillside no steeper than 26° with a cave already running near it, and publishes a `cave_mouth` marker. Without this the system is sealed. |
| `decorate` | true | bool | dressing **chosen by the style**: dripstone or gravel floor patches, stalagmites and stalactites, moss, mushrooms, glow lichen on the ceiling, cobwebs. |

### The styles

| `style` | what you get | reach for it when |
|---|---|---|
| `worm` | the default: branching tubes of `radius`, steered by a low-frequency wander field, with occasional oblate chambers. | a normal cave system. |
| `cheese` | clusters of large rounded voids, only incidentally joined — rooms, not pipes. Dressed with gravel and moss, lichen-lit. | "pockets", "hollows", "a honeycombed hill". |
| `spaghetti` | many long, thin, fast-turning tubes over a wide area. Dry, gravelly, cobwebbed. | "riddled with narrow passages", "a warren". |
| `ravine` | tall narrow vertical slots on a near-level course — the cross-section is stretched upward instead of widened. Gravel floors, lichen. | "a rift", "a chasm", "a crack running under the hill". |
| `chamber_network` | rooms first: large ellipsoid caverns joined by short straight connectors of length `chambers.spacing`. The show cave — the most dripstone, moss and lichen of any style. | "great halls", "a network of caverns". |

`lava_tube` from the v0.2 §7 enum is **not** carved, and asking for it is a
`LOAM-T114`: a dry tube would not be a lava tube, and lava in a cave cannot
satisfy the profile's zero-unstable-fluids rule. Use `chamber_network` or
`cheese` instead.

Give `radius` some room before reaching for a wide style: `ravine` and
`spaghetti` deliberately use only the thin end of the `[min, max]` range, and
`cheese` blobs are sized off the top of it.

Rules and honest limits:

- Water safety is structural: no carve comes within 4 blocks of any water or
  lava column, and nothing is cut at or below sea level within 8 blocks of the
  ocean. A cave will simply not go where it would flood.
- 4 blocks of rock are always left between a ceiling and the surface, except at
  an entrance mouth.
- Four params from the v0.2 §7 table are **rejected**, each with a
  `LOAM-T114`: `lavaLevel` and `waterTable` (no fluid in caves yet),
  `surfaceOpenings` (this profile spells it `entrances`) and `protectTags`.
- Every style goes through the same water gate and the same roof margin, so a
  `ravine` under a shallow ridge is simply shorter than one under a massif —
  it is clipped, never allowed to breach.
- Caves take no `constraints` and no `ports`, like every terrain generator.

---

## 8. Current-state guidance (read this — it is not optional)

These are honest limitations of today's compiler. Working with them produces
much better worlds than fighting them.

1. **Water needs a route to the sea.** A carve floods only where it is below
   sea level *and* hydraulically connected to the ocean. `river` (or a `valley`
   run past the coast) is how you make waterways, fjords and estuaries — both
   meander and descend properly now. A carve that dips below sea level in the
   middle of the land stays **dry**: gorges and canyons are dry by design.
2. **Inland lake = `basin` with `"water": true`.** That is the only way to get
   standing fresh water away from the coast. `"flooded": "never"` forces a carve
   dry if you want a canyon that a sea connection would otherwise flood.
3. **Dense forest is `density` 0.15–0.3** with `undergrowth`; 0.15 is already a
   closed canopy (≈ 1 tree per 8 columns). Wilderness fill: `density` ≈ 0.02–0.05.
4. **Leave `irregularity` and `meander` at their defaults.** They give organic
   outlines and wandering channels for free. Set them to `0` only when you
   deliberately want a geometric circle or a ruled channel.
5. **Volcanoes dress themselves.** Rocky elevation banding, an ash-biome
   (`basalt_deltas`) summit and caldera, no snow, and `lavaFlows` frozen flows
   down the flanks all happen automatically — you do not need palette overrides
   or extra edits for them.
6. **Lava is caldera-only.** Only `volcano` with `"lava": true` produces liquid
   lava, inside the rim.
7. **Colour comes from `style.palettes`**, not from block choices elsewhere.
   Black sand, red rock and pale cliffs are palette overrides.
8. Compilation fails on unstable fluid. Very deep, very narrow carves near sea
   level are the usual cause — widen them.

### Palette symbols

Override any of these in `style.palettes` with a block id or a weighted `mix`:

`ground.surface` (grass_block), `ground.subsurface` (dirt), `ground.stone`
(stone), `ground.cliff` (stone), `ground.beach` (sand), `ground.underwater`
(gravel), `ground.peak` (stone), `ground.bedrock`, `liquid.water`,
`liquid.lava`, `foliage.snow_layer` (snow), and the wood symbols
`wood.spruce_log`, `wood.spruce_leaves`, `wood.oak_log`, `wood.oak_leaves`,
`wood.birch_log`, `wood.birch_leaves`.

A `mix` is resolved per column by a position hash, so it is deterministic and
speckled rather than banded:

```json
{
  "ground.beach": {
    "mix": [
      ["minecraft:black_concrete_powder", 3],
      ["minecraft:gravel", 2],
      ["minecraft:basalt", 1]
    ]
  },
  "ground.cliff": "minecraft:deepslate"
}
```

---

## 9. Worked patterns

**Fjord inlets** — a `valley` course that starts well inland and runs *past*
the coast into open water. The seaward end floods because it reaches the ocean;
the inland end climbs the walls and stays dry. Pair with `"ridged": true` for
knife-edge walls between arms. Use `river` for a narrower waterway running down
to the same sea.

```json
{
  "id": "long_fjord",
  "kind": "generator",
  "generator": "terrain.edit@0",
  "label": "the long fjord — reaches deepest inland",
  "params": {
    "verb": "valley",
    "course": [[0.78, 0.66], [0.5, 0.7], [0.24, 0.74], [0.0, 0.78]],
    "width": 40,
    "depth": 100
  }
}
```

**Inland lake** — a `basin` with `"water": true`. The rim must close, so keep
the basin away from ground that already slopes below its rim. Nothing else in
the profile makes standing fresh water.

```json
{
  "id": "still_tarn",
  "kind": "generator",
  "generator": "terrain.edit@0",
  "params": { "verb": "basin", "zone": "northwest", "radius": 70, "depth": 14, "water": true }
}
```

**Archipelago** — a strong `continentalness` (high `seaFraction`, higher
`frequency`) to drown most of the region, plus a handful of `island` edits
where you want land the noise cannot be trusted to provide.

```json
{
  "id": "outer_skerry",
  "kind": "generator",
  "generator": "terrain.edit@0",
  "params": { "verb": "island", "at": [0.22, 0.31], "radius": 60, "height": 34 }
}
```

**Volcano** — one `volcano` edit with an explicit `calderaDepth`, and a lava
lake inside it. Ring the lower slopes with a forest whose `elevation` band
stops well below the summit so the cone stays bare.

```json
{
  "id": "ash_cone",
  "kind": "generator",
  "generator": "terrain.edit@0",
  "params": {
    "verb": "volcano",
    "at": [0.5, 0.46],
    "radius": 120,
    "height": 92,
    "caldera": true,
    "calderaDepth": 22,
    "lava": true,
    "profile": "sharp"
  }
}
```

**Highland plateau with a rim** — `plateau` has a `rim` falloff width; a small
`rim` gives mesa-like cliffs, a large one gives a swelling upland.

```json
{
  "id": "the_shelf",
  "kind": "generator",
  "generator": "terrain.edit@0",
  "params": { "verb": "plateau", "zone": "northeast", "radius": 140, "height": 34, "rim": 10 }
}
```

---

## 10. Complete example

Prompt: *"a small volcanic island ringed by black beaches"*.

```json
{
  "loam": "0.1",
  "profile": "terrain",
  "meta": {
    "name": "ashfall_isle",
    "worldSeed": 771402,
    "prompt": "a small volcanic island ringed by black beaches",
    "spawn": { "at": [0.5, 0.72] }
  },
  "style": {
    "palettes": {
      "ground.beach": { "mix": [["minecraft:black_concrete_powder", 4], ["minecraft:gravel", 2], ["minecraft:basalt", 1]] },
      "ground.cliff": { "mix": [["minecraft:basalt", 3], ["minecraft:blackstone", 1]] },
      "ground.peak": "minecraft:basalt",
      "ground.underwater": "minecraft:gravel"
    }
  },
  "root": {
    "id": "world",
    "kind": "composite",
    "label": "Ashfall Isle",
    "envelope": { "shape": "region", "size": [384, 384] },
    "children": [
      {
        "id": "terrain",
        "kind": "generator",
        "generator": "terrain.heightfield@0",
        "params": {
          "seaLevel": 63, "baseHeight": 54, "amplitude": 34, "octaves": 5,
          "frequency": 0.004, "gain": 0.52, "erosionPasses": 2,
          "warp": { "amount": 20, "frequency": 0.004 },
          "continentalness": { "frequency": 0.0018, "seaFraction": 0.42 },
          "cliffThreshold": 52, "soilDepth": 2, "beachWidth": 5, "snowLineFraction": 0.95
        },
        "children": [
          { "id": "isle_shield", "kind": "generator", "generator": "terrain.edit@0",
            "label": "the broad shield the cone sits on",
            "params": { "verb": "island", "at": [0.5, 0.5], "radius": 170, "height": 30, "profile": "rounded" } },
          { "id": "ash_cone", "kind": "generator", "generator": "terrain.edit@0",
            "label": "the summit cone and its lava caldera",
            "params": { "verb": "volcano", "at": [0.5, 0.46], "radius": 96, "height": 86,
                        "caldera": true, "calderaDepth": 20, "lava": true, "profile": "sharp" } },
          { "id": "south_gully", "kind": "generator", "generator": "terrain.edit@0",
            "label": "a lava gully drowned to an inlet at its seaward end",
            "params": { "verb": "valley", "course": [[0.52, 0.6], [0.56, 0.78], [0.6, 0.98]], "width": 34, "depth": 40 } }
        ]
      },
      { "id": "climate", "kind": "generator", "generator": "terrain.climate@0",
        "params": { "forceTheme": "temperate", "temperatureFrequency": 0.0014 } },
      { "id": "slope_pines", "kind": "generator", "generator": "scatter.forest@0",
        "label": "pine belt on the lower slopes",
        "params": { "area": { "at": [0.5, 0.52], "radius": 180 }, "density": 0.18, "spacing": 3,
                    "clumping": 0.45, "maxSlope": 44, "elevation": [2, 58], "edgeFalloff": 14,
                    "undergrowth": { "grass": 0.3, "flowers": 0.03, "deadwood": 0.06 },
                    "species": [ { "id": "black_pine", "weight": 3, "shape": "spruce_tall" },
                                 { "id": "scrub_pine", "weight": 1, "shape": "spruce_squat" } ] } },
      { "id": "wilderness", "kind": "generator", "generator": "scatter.forest@0",
        "label": "sparse cover everywhere else",
        "params": { "area": { "all": true }, "density": 0.03, "spacing": 4, "clumping": 0.6,
                    "maxSlope": 40, "elevation": [2, 50], "edgeFalloff": 12,
                    "species": [ { "id": "wind_pine", "weight": 1, "shape": "spruce_squat" } ] } }
    ]
  }
}
```

---

## 11. Before you answer

- Output **only** the JSON object. No fences, no explanation.
- One heightfield, one climate, at least one forest.
- Every edit is under the heightfield and has exactly one placement key.
- Every shape param belongs to its verb.
- Every fraction is inside `[0, 1]`; north is small `fz`.
- Ids are lowercase, meaningful, unique among siblings.
- The prompt's named features each map to a verb, a palette override, or a
  forest node — if you cannot express something, choose the closest available
  construct rather than inventing a key.
