# Settlement author kit

You are authoring a **Loam settlement-profile document**: a single JSON object
that a deterministic compiler turns into a Minecraft world. Your entire output
is that JSON object. No prose, no markdown fences, no comments — JSON only.

You never write absolute block coordinates. You describe *intent* — coarse
fractional placement for terrain, and **constraints** for buildings — and the
compiler's field composer and layout solver do the geometry.

The settlement profile is a **superset of the terrain profile**: everything in
sections 1–8 below is the terrain vocabulary, unchanged. Sections 9–14 add the
settlement layer: a plaza, buildings, roads, constraints and ports.

**A terrain-only document is valid.** When the prompt asks for wilderness — a
glade, a fjord, an empty island, "no people" — write the terrain layer and stop.
Do not invent a village nobody asked for. Keep `"profile": "settlement"` either
way; the structure nodes are simply absent.

---

## 1. Document skeleton

<!-- kit:skeleton -->

```json
{
  "loam": "0.1",
  "profile": "settlement",
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

- `"loam"` is exactly `"0.1"`; `"profile"` is exactly `"settlement"`.
- Top level accepts only `loam`, `profile`, `meta`, `style`, `intent`, `root`.
  (`intent` is §9d — the dials that say what *kind* of place this is.)
- `root.kind` is `"composite"`.
- `root.children` holds **exactly one** `terrain.heightfield@0`, **exactly
  one** `terrain.climate@0`, any number of `scatter.forest@0` nodes, and —
  optionally — the settlement layer: **at most one** `plaza` primitive, any
  number of `building.grammar@0` nodes, any number of `prop.place@0` nodes,
  and **at most one** `road.network@0` node. Nothing else is allowed.
- **`cave.carver@0` is not in this profile**, even though the terrain profile
  has it: its `protectTags` param — the one that keeps a cave out of a town's
  foundations — is unimplemented, so a cave under a settlement is a lottery on
  whether the smithy still has a floor. It comes back when `protectTags` does.
  Underground space in a settlement is a `basement` and a tunnel (§10).
- `terrain.edit@0` nodes live **only** in `heightfield.children`. They are
  never children of the root and never nest inside each other.
- Terrain generators (`heightfield`, `climate`, `forest`, `edit`) never carry
  `constraints` or `ports`. Structure nodes are the only nodes that do.
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
it when there is a specific first view you want the player to have — for a
settlement, the plaza's zone is usually right. If the column you name is under
water the compiler moves the spawn and warns.

### `root.envelope`

`{ "shape": "region", "size": [width, depth] }`, both integers in 16..4096 (use
multiples of 16). 512×512 is the default working size; 256–320 for a compact
map (and a village reads much better on a small map than a huge one), 1024 for
a sprawling landscape.

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

The same nine tokens are the `zone` constraint's whole vocabulary.

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
| `erosionPasses` | 0 | 0..8, int | smooths and settles slopes. 1–3 helps almost every landscape, and a settlement wants 2. |
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
- The **first or last** waypoint of a `valley` or `river` course may be the
  string `"coast"` instead of a coordinate: `[[0.54, 0.40], [0.50, 0.28], "coast"]`.
  It resolves to the nearest point of the sea this seed actually generated, a
  little way out into the water. Use it for every carve that must flood — see
  §7.1. It is not legal on `ridge`, nor in the middle of a course.
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
    "avoidTags": ["structure", "road", "plaza"],
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
| `avoidTags` | — | array of strings. In a settlement always write `["structure", "road", "plaza"]`. |
| `snowLine` | — | absolute Y above which this species stops. |

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

## 7. Current-state guidance (read this — it is not optional)

These are honest limitations of today's compiler. Working with them produces
much better worlds than fighting them.

1. **Water needs a route to the sea.** A carve floods only where it is below
   sea level *and* hydraulically connected to the ocean. `river` (or a `valley`
   run past the coast) is how you make waterways, fjords and estuaries — both
   meander and descend properly now. A carve that dips below sea level in the
   middle of the land stays **dry**: gorges and canyons are dry by design. A
   river whose `course` never reaches a coast is demoted to a chain of ponds
   and reported (`LOAM-T112`); any other carve that asked to flood and did not
   is reported as `LOAM-T113`, with the bearing to the coast it missed.
   **You cannot know where the coast will be** — continentalness and the world
   seed decide that, not you. So do not guess at a fraction for the seaward
   end. Write the string `"coast"` as the **last** waypoint of the `course`
   (or the **first**, for an inlet drawn inland) and the compiler aims it at
   the sea this seed actually produced —
   `"course": [[0.54, 0.40], [0.50, 0.28], "coast"]`.

   Every cove, inlet, fjord, harbour or river mouth that must hold water ends
   with `"coast"`. It is legal only on `valley` and `river`, and only in the
   first or last position.
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
`liquid.lava`, `foliage.snow_layer` (snow), the wood symbols
`wood.spruce_log`, `wood.spruce_leaves`, `wood.oak_log`, `wood.oak_leaves`,
`wood.birch_log`, `wood.birch_leaves`, and the settlement symbols
`road.surface` (dirt_path), `road.shoulder` (gravel), `plaza.path`,
`plaza.gravel`, `plaza.cobble`, `plaza.border`.

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

Building materials (wall, trim, roof) are chosen automatically: one village
theme is drawn from the world seed and each building gets its own triple from
it, so no two houses look alike. Do not try to set them per building.

---

## 8. Worked terrain patterns

**Fjord inlets** — a `valley` course that starts well inland and ends at
`"coast"`. The seaward end floods because the compiler put it in the ocean; the
inland end climbs the walls and stays dry. Pair with `"ridged": true` for
knife-edge walls between arms. Use `river` for a narrower waterway running down
to the same sea. A sheltered **cove** or **harbour** is the same shape, shorter
and wider.

```json
{
  "id": "long_fjord",
  "kind": "generator",
  "generator": "terrain.edit@0",
  "label": "the long fjord — reaches deepest inland",
  "params": {
    "verb": "valley",
    "course": [[0.78, 0.66], [0.5, 0.7], [0.24, 0.74], "coast"],
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

**A shelf for a village** — a shallow, wide `plateau` with a `rounded`
profile under the settlement. `"height": 6..10` is plenty: it is a flat place
to build, not a mesa.

```json
{
  "id": "village_shelf",
  "kind": "generator",
  "generator": "terrain.edit@0",
  "params": { "verb": "plateau", "at": [0.44, 0.46], "radius": 90, "height": 7, "profile": "rounded" }
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

---

## 9. The settlement layer

Six node kinds, all children of the root. The first four are placed by the
**layout solver** rather than by you; a prop is placed coarsely, and the roads
are routed last:

| node | cardinality | what it is |
|---|---|---|
| `plaza` (`"kind": "primitive"`) | 0 or 1 | an open paved area: the green, the market, the quay |
| `building.grammar@0` | any number | one building |
| `district` (`"kind": "district"`) | any number | a quarter with its own street grid, blocks and lots |
| `city` (`"kind": "city"`) | any number | a whole city: arterials first, quarters as the residue |
| `prop.place@0` | any number | one boat, cart, pier, fountain… — the evidence people live here |
| `road.network@0` | 0 or 1 | the lanes joining everything |

A structure node may carry `constraints`, `ports`, `tags`, `optional`,
`envelope`, `params`, `label` and `seedSalt` — and no `children`. A `district`
and a `city` are the exceptions: their `children` are the landmark buildings
inside them.

**You never say where a building goes.** You say what it must be near, what it
faces, and how much room it needs; the solver searches the real terrain for a
position that satisfies it. If you find yourself wanting `"at": [0.43, 0.51]`
on a cottage, use `adjacent_to` the plaza instead.

### The plaza

```json
{
  "id": "plaza",
  "kind": "primitive",
  "label": "the village green",
  "envelope": { "shape": "region", "size": [22, 22] },
  "constraints": [
    { "zone": "center" },
    { "terrain_conform": "flatten", "reference": "median", "blend": 5 }
  ],
  "tags": ["plaza", "public"]
}
```

- `envelope.shape` is `"region"` and its `size` is `[x, z]` — two numbers, no
  height. 16×16 is a hamlet's green, 22×22 a village's, 32×32 a market square.
- The plaza is the anchor everything else hangs off. Give it `{"zone": …}` and
  `terrain_conform: "flatten"`, and let the buildings reference it by id.
- One plaza maximum. A second `"kind": "primitive"` node is an error.

### `building.grammar@0`

```json
{
  "id": "inn",
  "kind": "generator",
  "generator": "building.grammar@0",
  "label": "the inn on the green's eastern edge",
  "envelope": { "shape": "box", "size": [11, 11, 9] },
  "params": { "floors": 2, "roof": "gable", "windowRhythm": "paired" },
  "constraints": [
    { "adjacent_to": "plaza", "gap": [1, 8] },
    { "facing": "plaza" },
    { "terrain_conform": "cut_fill", "reference": "median", "blend": 4 }
  ],
  "ports": { "door": { "type": "door", "face": "west", "tags": ["primary"] } },
  "tags": ["house", "trade"]
}
```

**`envelope`** is `{ "shape": "box", "size": [x, y, z] }` in blocks — the
footprint and the total height, walls *and* roof. The hard-won numbers:

- **width and depth 7–13.** Below 7 there is no room for a door and a window;
  above 13 a house stops reading as a house. A hall may go to 15.
- **`sizeY ≥ floors × 3 + 4`.** A storey is 3 blocks minimum and the roof needs
  about 4. Give a 1-storey cottage `y = 7..8`, a 2-storey house `y = 10..12`, a
  2-storey hall `y = 12..13`. Too little `y` and the roof crushes the walls
  into a shed.
- A **watchtower** is the exception: `[7, 19, 7]` — narrow and tall.
- Optional extras: `"padding": 1` (blocks of breathing room kept around the
  box), `"rotations": [0, 90, 180, 270]` (which yaws the solver may use).

**`params`** — every key optional:

| param | values | notes |
|---|---|---|
| `floors` | 1..2 | more is clamped to 2 |
| `floorHeight` | 3..8 | blocks per storey; default 4 |
| `roof` | `gable`, `hip`, `flat` | `gable` for houses, `hip` for civic buildings, `flat` for towers |
| `windowRhythm` | `regular`, `dense`, `sparse`, `paired`, `none` | `sparse` for a smithy or a granary, `dense` for an inn |
| `wing` | `{"size": [w, d], "side": …, "offset": n}` | an L- or T-shaped plan — see below |
| `basement` | `true`, `3..5`, or `{"depth": 3..5}` | a cellar; see §10's tunnels |

#### `wing` — L- and T-shaped footprints

A wing is a **second rect carved out of the same envelope**, not bolted onto
it: the bounding box does not grow, so `envelope.size` still describes the
whole building. `side` is the face of the main block the wing hangs off
(`north`, `east`, `south`, `west`); `offset` is how far along that face the
wing starts, counted from the envelope's min corner (default 0).

```json
{
  "id": "the_long_house",
  "kind": "generator",
  "generator": "building.grammar@0",
  "envelope": { "shape": "box", "size": [13, 11, 13] },
  "params": { "floors": 2, "roof": "gable", "wing": { "size": [5, 4], "side": "south", "offset": 0 } },
  "tags": ["house"]
}
```

That is an **L**: the wing sits flush with one corner. Centre the offset and
you get a **T**:

```json
{ "params": { "wing": { "size": [5, 4], "side": "north", "offset": 4 } } }
```

The rules, exactly as the validator states them (every failure is a
`LOAM-T207` error with a fix hint):

- **The shared run must be at least 3 columns.** For a `north`/`south` wing
  that run is `size[0]`; for an `east`/`west` wing it is `size[1]`. Less and
  the validator says the wing *"shares a 2-cell run with the main block; 3 is
  the shortest that leaves a doorway between the two rooms"* — the two rects
  would meet at corner posts with no door between them.
- **The other axis — the wing's depth — must also be at least 3**, or it is
  *"a buttress, not a room"*.
- `offset` is a non-negative integer. Straight edges only: a wing may not
  overhang the face it hangs off.
- Two further conditions the grammar checks silently rather than rejecting: the
  wing must leave at least 3 blocks of main block behind it (its depth eats
  `depth − 1` of the envelope), and `offset + run` must not pass the end of the
  face. Break either and the wing is dropped and you get a plain rect — so keep
  the wing well inside a 11–13 wide envelope.

**Archetype comes from `tags`, not from a param.** The building grammar picks
the massing, the interior and the furniture from the first tag it recognizes,
and each archetype brings its own facade — window shape, rhythm, roof — so you
do not have to spell those out. An explicit `roof`/`windowRhythm` param wins.

Matching runs **in this order**, and the order is the whole trick: the greedy
old tags (`tower`, `trade`, `store`) are checked late so that a `tower_block`
reaches the tall grammar and a `storehouse` reaches the warehouse.

| # | table | selected by |
|---|---|---|
| 1 | high-rise | `skyscraper`, `high_rise`, `highrise`, `tower_block`, `hotel`, `lodging`, `guesthouse`, `apartment`, `apartment_block`, `tenement`, `flats`, `office`, `offices`, `corporate`, `headquarters` |
| 2 | mine head | `mine_head`, `mineshaft`, `mine`, `pithead` |
| 3 | watchtower | `lookout`, `tower`, `watchtower` |
| 4 | breadth | see the breadth table below |
| 5 | town | see the town table below |
| 6 | trade | see the trade table below |
| 7 | vernacular | see the vernacular table below |
| 8 | wave two | see the wave-two table below |
| 9 | institutions | see the institution table below |
| 10 | leisure & modern | see the wave-4C table below |
| 11 | extended | see the extended table below |
| 12 | original | `hall`, then `trade`/`inn`, then `craft`/`smithy`, then `store`/`granary` |
| 13 | fallback | anything else → cottage |
| 10 | homestead | see the homestead table below |
| 11 | wave 3C regional | see the regional table below |
| 12 | extended | see the extended table below |
| 13 | original | `hall`, then `trade`/`inn`, then `craft`/`smithy`, then `store`/`granary` |
| 14 | fallback | anything else → cottage |
| 10 | faith (wave 4B) | see the faith table below |
| 11 | extended | see the extended table below |
| 12 | original | `hall`, then `trade`/`inn`, then `craft`/`smithy`, then `store`/`granary` |
| 13 | fallback | anything else → cottage |
| 10 | the depths (wave 6) | `bunker_complex`/`fallout_shelter`, `subway_station`/`metro_station`/`underground_station`, `underground_silo`/`missile_silo` — see the depths table below |

**Town (table 5)** — the civic wave, and fit-outs like the breadth ones: give
them a **plain rect** envelope or the exterior work refuses and you get the
ordinary house shell. It sits *between* the breadth table and the extended one,
so it never takes a tag an older table already answers to: bare `hall` still
means a great hall (table 10) and `archive` still means a library (table 9).

| archetype | tags | what it gets | envelope that works |
|---|---|---|---|
| town_hall | `town_hall`, `townhall`, `moot_hall`, `city_hall` | masonry plinth, quoins and string course, a clock-and-bell gable over the front bay, council chamber inside; tall paired lights | `[13, 16, 13]`, 2 floors |
| school | `school`, `schoolhouse`, `academy` | rows of desks and seats facing a dark board across the end wall, a modest bell cote; regular single windows | `[11, 12, 15]`, 1–2 floors |
| bathhouse | `bathhouse`, `baths`, `sauna`, `hammam` | pools written into the floor plane inside a solid coping, smooth stone and quartz walls, steam braziers and benches; sparse windows, hip roof | `[13, 11, 13]`, 1 floor |

**Extended (table 9)**

| archetype | tags | what it gets |
|---|---|---|
| church | `church`, `chapel`, `temple`, `shrine`, `worship` | tall lights, one per bay, gable roof, a steeple with a bell |
| windmill | `windmill`, `mill` | few small windows, hip roof, a static cross of blades |
| barn | `barn`, `stable`, `byre` | big doors, sparse single windows, gable roof |
| warehouse | `warehouse`, `depot`, `storehouse` | sparse single windows, gable roof, goods stacked inside |
| market_stall | `market_stall`, `stall`, `market`, `vendor` | mullioned, dense openings, flat roof |
| library | `library`, `study`, `scriptorium`, `archive` | paired mullioned lights between the presses, gable roof |
| bakery | `bakery`, `bakehouse`, `baker` | regular single windows, gable roof, oven |

**Breadth (table 4)** — these rebuild the shell's exterior. Give them a
**plain rect** envelope: a `wing` makes the rebuild refuse and you get the
ordinary house shell instead.

| archetype | tags | what it gets | envelope that works |
|---|---|---|---|
| keep | `keep`, `castle`, `donjon`, `citadel` | masonry re-clad, fighting deck, crenellated parapet; sparse single windows | `[13, 16, 13]`, 2 floors |
| gatehouse | `gatehouse`, `barbican`, `gate` | the keep's battlement plus a raised portcullis and a machicolation over the gate | `[11, 14, 9]`, 2 floors |
| barracks | `barracks`, `garrison` | long bunkroom fit-out, regular windows, gable roof | `[13, 11, 9]`, 2 floors |
| pagoda | `pagoda` | three to five stacked eave tiers replacing the roof, mullioned regular windows | `[11, 16, 11]`, 2 floors |
| wizard_tower | `wizard`, `wizard_tower`, `arcane`, `sorcerer` | glowstone-set masonry under a steep cone, tall sparse lights | `[9, 20, 9]`, 2 floors |
| observatory | `observatory`, `telescope`, `astronomy` | a stepped dome with an open slit and an instrument under it | `[11, 15, 11]`, 1 floor |
| greenhouse | `greenhouse`, `glasshouse`, `conservatory` | glazed walls and roof over farmland beds in the floor | `[11, 8, 9]`, 1 floor |
| gym | `gym`, `gymnasium`, `fitness` | wool mats, a mirror wall, anvils, a hanging bag; flat roof | `[13, 9, 11]`, 1 floor |
| mausoleum | `mausoleum`, `tomb`, `sepulchre` | windowless masonry, hip roof; pairs with a `crypt` cellar | `[9, 8, 9]`, 1 floor |
| windpump | `windpump` | a pumping tower with sails, hip roof | `[7, 14, 7]`, 1 floor |
| mine_head | `mine_head`, `mineshaft`, `mine`, `pithead` | headframe hut, winch, laddered shaft down into a mine-style cellar | `[9, 12, 9]`, 1 floor |

**The depths (wave six)** — three buildings whose subject is what is
*underneath* them. Each is an **entrance** above ground and digs itself a
five-deep cellar dressed in its own style when your document says nothing
about a basement; `"basement": 0` still means none, and an explicit
`"basement": {...}` still wins. Every tag is a compound, because the bare
words are already taken: `bunker` is the garrison's, `silo` the homestead's,
and bare `station` belongs to nobody.

| archetype | tags | what you get | good size |
|---|---|---|---|
| bunker_complex | `bunker_complex`, `fallout_shelter` | concrete blockhouse over a `bunker_hold` cellar: duty desk, furnace, stores, a blast-door corner | `[11, 10, 11]`, 1 floor |
| subway_station | `subway_station`, `metro_station`, `underground_station` | ticket hall over a `subway_platform` cellar: benches, a ticket line, a line-colour banner | `[13, 11, 13]`, 1 floor |
| underground_silo | `underground_silo`, `missile_silo` | hatch hut over a `silo_shaft` cellar: an anvil, a crate and a copper band at head height | `[11, 11, 11]`, 1 floor |

**Trade (table 6)** — the commercial fit-outs. They sit **after** the breadth
and town tables and **before** the extended and original ones, and they
deliberately claim none of the older tables' words: `trade` and `inn` still
mean the inn, `store` still means the granary, and `market`/`stall`/`vendor`
still mean the market stall. Only the store's awning touches the outside, so
these work on a `wing` envelope too — the wainscot band is simply skipped on
one.

| archetype | tags | what it gets | envelope that works |
|---|---|---|---|
| tavern | `tavern`, `pub`, `alehouse` | bar counter and stools down the far wall, trestle tables, stacked barrels, a fire, a timber wainscot band; regular single windows, gable roof | `[13, 11, 13]`, 1–2 floors |
| general_store | `general_store`, `shop`, `grocer`, `emporium` | stock walls of barrels, shelves and chests, a service counter, crates in the back corner, an awning over the door; dense mullioned shopfront, gable roof | `[13, 10, 11]`, 1–2 floors |
| apothecary | `apothecary`, `pharmacy`, `herbalist`, `alchemist` | a stone bench carrying brewing stands, a cauldron, candle-topped bottle shelves, herb pots at the sills, a stone wainscot; paired mullioned lights, gable roof | `[9, 10, 9]`, 1 floor |

**Vernacular (table 7)** — regional re-clads of the ordinary house shell.
They sit *after* the breadth table and *before* the extended one, and they
claim only regional tags: `house` still means cottage, `townhouse` is
reserved. Like the breadth wave they rebuild the exterior, so give them a
**plain rect** envelope — a `wing` makes the rebuild refuse and you get the
ordinary house shell instead.

| archetype | tags | what it gets | envelope that works |
|---|---|---|---|
| alpine_chalet | `chalet`, `alpine` | boxed spruce-log corners, banded courses, a deep apron eave, shutters beside the lights, a hearth and benches inside | `[13, 11, 11]`, 1–2 floors |
| saltbox_house | `saltbox` | the asymmetric gable rebuilt off-centre — short front pitch, long shallow back one — over a clapboard re-clad and a colonial parlour | `[9, 13, 15]`, 1–2 floors; **deep in z** |
| dutch_gable_house | `dutch_gable`, `canal_house`, `stepped_gable` | brick re-clad, roof rebuilt front-to-back under a stepped parapet gable with a hoist beam, tall regular lights, a merchant counter | `[9, 16, 11]`, 1–2 floors; **narrow and tall** |

**Wave 2 (table 8)** — three vernacular houses, three civic buildings and
three works. The vernacular three rebuild the shell's exterior, so give *those*
a **plain rect** envelope: a `wing` makes the rebuild refuse and you get the
ordinary house shell instead. The civic and industrial six are interior
fit-outs and are happy on any footprint.

| archetype | tags | what it gets | envelope that works |
|---|---|---|---|
| tudor_row | `tudor_row`, `half_timber` | white plaster panels in dark studwork, banded at each storey line, with a trapdoor jetty course in the apron; regular single lights | `[9, 14, 15]`, 2 floors |
| mediterranean_villa | `mediterranean_villa`, `villa` | smooth-sandstone stucco, a terracotta cornice, and a parapeted roof terrace with a corner pergola | `[13, 12, 11]`, 2 floors |
| trullo | `trullo` | drystone drum under a corbelled cone closing on a capstone; sparse single lights | `[9, 16, 9]`, 1 floor |
| courthouse | `courthouse`, `court`, `tribunal` | a dais and lectern at the far end, short bar rails, gallery benches either side of a two-column aisle, slab cornice | `[11, 13, 17]`, 1 floor |
| post_office | `post_office`, `post` | a timber counter with a sign, stacked barrels as pigeonholes up both side walls, parcel chests by the door | `[11, 11, 13]`, 1 floor |
| infirmary | `infirmary`, `clinic` | cots head-to-wall with banner screens between them, and an apothecary of brewing stand and cauldron | `[11, 11, 15]`, 1 floor |
| sawmill | `sawmill`, `lumber_mill` | a run of saw benches down one wall, stacked log stores down the other, an open deck between | `[11, 11, 17]`, 1 floor |
| kiln | `kiln`, `pottery_kiln` | a brick core with its fire in the mouth against the far wall, furnaces beside it, trapdoor drying racks | `[9, 12, 11]`, 1 floor |
| tannery | `tannery`, `tanner` | soaking vats and liquor cauldrons up one wall, stretching frames up the other, a drying line under the plate | `[11, 11, 13]`, 1 floor |

Two tags wave two deliberately does **not** claim, because an earlier table
owns them: `mill` (the windmill) and `gate` (the gatehouse). It also left
`hospital` alone; the institutions table below now owns it.

**Institutions (table 9)** — wave three A: ten civic buildings and two
commercial ones, the things a town gets once it has institutions. All twelve
are interior fit-outs and are happy on any footprint; five of them (museum,
police station, mint, customs house, bank) also add a slab cornice in the
apron, which needs a **plain rect** envelope or it simply does not run. The
table sits straight after wave two and takes no tag an older table answers to:
bare `hall` is still a great hall, `court` still the courthouse, `clinic` still
the infirmary, `archive` still the library and `vault` still a cellar style.

| archetype | tags | what it gets | envelope that works |
|---|---|---|---|
| museum | `museum`, `gallery` | chiseled-stone plinths with position-chosen exhibits on them behind a fence rope, a banner-hung gallery wall, accession lectern | `[13, 13, 15]`, 1 floor |
| guildhall | `guildhall`, `guild` | a top table and warden's lectern across the far end, guild colours up both walls, two ranks of benches | `[13, 14, 17]`, 1 floor |
| prison | `prison`, `jail`, `gaol` | iron-bar cell fronts down one wall with a door gap every third cell, heavy trim opposite, corridor off the centre line | `[11, 11, 17]`, 1 floor |
| police_station | `police_station`, `police`, `constabulary` | a front desk of cartography table and day book, one barred corner cell, notice banners by the door | `[13, 11, 13]`, 1 floor |
| fire_station | `fire_station`, `firehouse` | a muster bell, cauldron water butts up one wall, trapdoor ladder racks up the other, an empty appliance bay | `[13, 12, 15]`, 1 floor |
| hospital | `hospital`, `ward` | wards of cots head-to-wall up both walls, banner screens between the bays, a dispensary on the far wall | `[13, 12, 17]`, 1 floor |
| workhouse | `workhouse`, `poorhouse` | ranks of looms and crafting benches up one wall, meagre cots up the other, barrel stores and an overseer's desk | `[11, 12, 17]`, 1 floor |
| orphanage | `orphanage` | small beds head-to-wall, a furnace hearth and matron's chest, a carpet play mat | `[11, 12, 15]`, 1 floor |
| mint | `mint`, `coinage` | an iron-trimmed strongroom corner with coin chests, anvil and smithing-table presses, an assay counter | `[11, 12, 13]`, 1 floor |
| customs_house | `customs_house`, `customs` | a bonded store of stacked barrels, a fence tally line, ledger desks, chains hung over the weighing hall (single storey only) | `[13, 12, 13]`, 1 floor |
| bank | `bank`, `strongroom` | a counter under an iron-bar grille with one teller's window, an iron strongroom corner, lockbox barrels | `[13, 13, 13]`, 1 floor |
| counting_house | `counting_house`, `countinghouse` | two ranks of ledger desks with clerks' stools turned away from the desk they read, bookshelves, a strongbox corner | `[13, 11, 15]`, 1 floor |

**Wave 3B (table 9) — food and craft works.** Twelve buildings: six shops and
six works. Every one is a **pure interior fit-out** — none of them rebuilds the
exterior — so all twelve are happy on a `wing` footprint as well as on a plain
rect. The genre rule is that the machinery lives on the wall rows and the middle
of the floor stays empty, which is what makes a works walkable.

| archetype | tags | what it gets | envelope that works |
|---|---|---|---|
| brewery | `brewery`, `brewhouse` | mash-tun cauldrons and hay grain sacks up one wall, stacked maturing barrels up the other, a brewing bench across the end | `[11, 12, 15]`, 1–2 floors |
| distillery | `distillery`, `still` | a waxed-copper still with a lightning-rod condenser arm, bottle racks one side, the cask store the other | `[11, 12, 15]`, 1–2 floors |
| butchery | `butchery`, `butcher` | stripped-log chopping stumps and iron-bar hanging racks, smokers and brine cauldrons opposite, a cold store at the end | `[11, 11, 13]`, 1 floor |
| tea_house | `tea_house`, `teahouse` | low slab tables in the side bays with a seat either side, a kettle counter on the far wall, pots at the windows | `[13, 11, 13]`, 1 floor |
| trading_post | `trading_post`, `outpost` | goods walls cycling barrels, chests and hay, a timber trade counter and a banner over the middle of it | `[13, 11, 13]`, 1 floor |
| pawnshop | `pawnshop`, `pawn` | a slab counter with an iron-bar grille on it, the strongbox behind, shelves of pledges up the sides | `[11, 11, 11]`, 1 floor |
| cooperage | `cooperage`, `cooper` | casks stacked open and shut up one wall, stave racks and posts up the other, a smithing-table hooping bench | `[11, 11, 15]`, 1 floor |
| glassworks | `glassworks`, `glassblower` | a furnace bank on the far wall, stacked sand stores one side, finished glass on trapdoor shelves the other | `[11, 12, 15]`, 1–2 floors |
| papermill | `papermill`, `paper_mill` | pulp cauldrons and drying racks, quartz-slab reams opposite, a cartography-table press at the end | `[11, 11, 17]`, 1 floor |
| textile_mill | `textile_mill`, `weaver`, `loom` | a run of looms facing dye cauldrons and fleece stacked in three colours, more looms at the end | `[11, 12, 17]`, 1–2 floors |
| cannery | `cannery` | a full-length slab bench down one wall, brine cauldrons and barrel intake down the other, sealing furnaces across the end | `[11, 11, 17]`, 1 floor |
| foundry | `foundry`, `casting` | blast furnaces and furnaces alternating across the end, anvils and ingot stock up one side, an open casting floor | `[13, 12, 15]`, 1–2 floors |

Wave 3B deliberately claims **no** short tag: `trade` is the inn's, `store`,
`shop` and `grocer` the granary's and general store's, `market`, `stall` and
`vendor` the market stall's, `mill`, `sawmill`, `kiln` and `tannery` the
windmill's and wave two's, and `craft` and `smithy` the smithy's. Ask for a
works by its own name.

**Wave 4C (table 10) — leisure, modern and science interiors.** Twelve rooms
whose whole read is what is *in* them. The four with seat banks (theatre, opera
house, cinema, lecture hall) want **depth**: the bank lays alternate rows with a
clear lane round the field and a three-column aisle off the lantern, so a short
envelope gets two rows of seats and a long one gets six. The three that rebuild
part of the exterior (opera house, cinema, glass pavilion) want a **plain rect**
— a `wing` makes the re-clad refuse.

| archetype | tags | what it gets | envelope that works |
|---|---|---|---|
| theater | `theater`, `theatre` | a slab stage dais across the far end, banner wing curtains, flat seat rows turned away from the stage, a backstage corner | `[13, 14, 19]`, 1–2 floors |
| opera_house | `opera_house`, `opera` | the theatre plus a quartz proscenium band, chest-and-seat side boxes and a red runner written into the floor plane | `[15, 15, 19]`, 1–2 floors |
| cinema | `cinema`, `movie_theater` | a pale screen on a black end wall, seat rows, a projector plinth at the back of the aisle, a concessions lobby corner | `[13, 12, 19]`, 1–2 floors |
| dance_hall | `dance_hall`, `ballroom` | a striped sprung floor in the floor plane, a band dais with a jukebox and a note block, wall benches and bunting | `[15, 13, 17]`, 1–2 floors |
| boxing_gym | `boxing_gym`, `boxing` | wool mats, a slab ring in the middle with fence corner posts standing on it, hanging bag targets, a bench row | `[15, 12, 15]`, 1 floor; **≥ 9 interior for the ring** |
| sauna | `dry_sauna`, `sweat_lodge` | flat slab bench tiers up both side walls, a brazier on a plinth at the far wall, an empty cauldron — and **no water at all** | `[11, 11, 13]`, 1–2 floors |
| ski_lodge | `ski_lodge` | fur rugs in the floor plane, trapdoor ski racks on both side walls, a stripped-log mantel with fence antlers on it, a lounge corner | `[15, 14, 15]`, 1–2 floors |
| clubhouse | `clubhouse`, `club` | a trophy shelf with a gold cup, a banner honours board, lounge chairs and low tables down the sides, a short bar | `[13, 13, 15]`, 1–2 floors |
| glass_pavilion | `glass_pavilion` | sill-rule glazing over the whole wall field, a solid glass roof deck with a pane rail, planted corners and an open plan | `[13, 12, 13]`, 1–2 floors |
| convenience_store | `convenience_store`, `corner_shop` | shelf gondolas on the seat-bank aisle discipline, a timber counter with an iron-bar grille, iron-trapdoor cold cabinets, stacked crates | `[11, 11, 15]`, 1 floor |
| laboratory | `laboratory`, `lab` | smooth-stone benches with brewing stands on them, an iron-trapdoor fume hood, specimen bookshelves and a dark chalk board | `[13, 12, 17]`, 1–2 floors |
| lecture_hall | `lecture_hall`, `auditorium` | the school at scale: a dark board, a lectern on a slab dais, flat rows off a three-column aisle | `[15, 14, 19]`, 1–2 floors |

Wave 4C claims **no** tag an earlier table owns, and four of the near misses are
worth stating because each would have been a silent theft: bare **`sauna` is the
bathhouse's** (table 5) — this wave's dry sauna answers to `dry_sauna` and
`sweat_lodge`; `gym`, `gymnasium` and `fitness` still reach the blitz gym;
`store`, `shop` and `grocer` still reach the granary and the general store; and
`lodging` still reaches the high-rise hotel, so the ski lodge answers to
`ski_lodge` only. Bare `pavilion` is left unclaimed.
**Wave 5C (table 11) — industry and modern works.** Twelve buildings: seven
industrial and five modern. The industrial seven are read **down their length**
— intake at the door end, machinery up the walls, the fire at the far end — so
give them **depth**; the ropewalk wants the most depth of anything in the
catalog, because a rope walk *is* its length. Two of them build outside the
walls: the **gas station**'s forecourt canopy lives in the apron and the
**brutalist block** re-clads its whole wall field, so give *those two* a **plain
rect** — a `wing` makes both refuse and you get the ordinary shell instead.

| archetype | tags | what it gets | envelope that works |
|---|---|---|---|
| brickworks | `brickworks`, `brickyard` | a wave-two kiln core with its fire in the mouth, brick drying stacks and shelves, clay pits read as mud-and-clay floor bays | `[11, 12, 15]`, 1–2 floors |
| blast_furnace_works | `blast_furnace_works`, `blast_furnace` | a blast-furnace bank in a deepslate core, waxed-copper tuyeres on the masonry, slag barrels, a slab charging deck | `[13, 13, 15]`, 1–2 floors |
| factory_hall | `factory_hall`, `factory` | smithing and fletching benches alternating up both walls, a fence drive shaft hung off the ceiling, a clocking desk | `[13, 13, 19]`, 1–2 floors; **shaft needs storey ≥ 4** |
| machine_shop | `machine_shop`, `machinist` | stonecutter lathes, trapdoor tool boards, wall-torch work lights, swarf barrels, a grindstone-and-anvil end | `[11, 12, 15]`, 1–2 floors |
| refinery | `refinery`, `oil_refinery` | iron tank pedestals with waxed-copper pipe courses standing on them, catch cauldrons, a lever control desk — **no flame at all** | `[13, 12, 17]`, 1–2 floors |
| charcoal_burner | `charcoal_burner`, `charcoal`, `collier` | a coarse-dirt burn pile against the far wall closing on a **solid** turf cap, a podzol clearing, log stores, the collier's corner | `[13, 11, 13]`, 1 floor |
| ropewalk | `ropewalk`, `ropery` | wool rope lines run at working height between fence posts down both walls, log-and-bar winding drums, coil stacks | `[11, 11, 21]`, 1 floor; **depth is the point** |
| parking_garage | `parking_garage`, `car_park` | gray-and-white bay stripes in the floor plane, a stair ramp against one wall, a concrete trim course, a barrier arm by the door | `[15, 13, 17]`, 1–2 floors; **ramp needs storey ≥ 4** |
| gas_station | `gas_station`, `filling_station`, `petrol_station` | a forecourt canopy in the apron on **grounded** posts over iron-and-lever pumps, a shop corner, a wall-banner price board | `[13, 11, 13]`, 1 floor; **plain rect** |
| data_center | `data_center`, `datacenter`, `server_farm` | iron server racks on the bank aisle discipline with levers on them, a checkered raised-floor grid, cooling cauldrons, an ops desk | `[15, 12, 17]`, 1–2 floors |
| conference_center | `conference_center`, `convention_center` | a slab stage dais with banner flanks, flat seat rows off a three-column aisle, breakout tables, a lobby | `[15, 14, 19]`, 1–2 floors |
| brutalist_block | `brutalist_block`, `brutalist` | gray concrete over the whole wall field, polished fins every third column, bands at plinth and plate, an honest interior | `[15, 15, 15]`, 1–2 floors; **plain rect** |

Wave 5C claims **no** tag an earlier table owns, and the near misses are worth
stating because each would have been a silent theft: `kiln` is still wave two's
pottery kiln (the brickworks borrows its core but not its name); `foundry` and
`casting` are still wave 3B's; `mill` still reaches the windmill and `craft` the
smithy; `shop` and `store` still reach the general store and the granary; and
`auditorium` still reaches the lecture hall, so the conference centre answers to
`conference_center` and `convention_center` only.
**Wave 6C (table 12) — waterworks and energy.** Twelve entries, and the first
thing to know is that **two of them are props, not buildings**: `wind_turbine`
and `solar_array` have no inside, so they are placed with `prop.place@0` like the
windpump and the bollard row, not asked for as archetypes. The other ten are
ordinary shells with a fit-out. Three of them build **outside** the walls — the
**water tower**'s tank sits on a rebuilt roof deck, the **gasworks** re-clads its
whole wall field and the **coal tipple** stands its trestle in the apron — so
give *those three* a **plain rect**; a `wing` makes all three refuse and you get
the ordinary shell instead. The water tower additionally wants **height**: its
tank is rebuilt above the eave plate, so give it twenty or more of envelope Y.

| archetype | tags | what it gets | envelope that works |
|---|---|---|---|
| water_tower | `water_tower`, `watertower` | a solid roof deck carrying an iron-banded tank that rises course on course from it and closes on a full-block cap, grounded corner legs, an apron ladder, and a valve house of cauldrons inside | `[13, 21, 13]`, 1–2 floors; **plain rect, and height over the plate** |
| cistern | `cistern`, `reservoir` | the bathhouse pool verbatim as storage: water in the floor plane inset one cell, a smooth-stone rim, a slab divider off the lantern row, measuring posts in the pool's own corners, and a walkway that carries nothing | `[15, 12, 17]`, 1–2 floors; **≥ 5 interior each way for a pool** |
| well | `well`, `well_house` | a covered well house: a cauldron draw hole with a dressed coping, two fence posts under a log windlass axle, an iron-bar rope on tall storeys, a bucket bench | `[11, 12, 13]`, 1–2 floors |
| pumping_station | `pumping_station`, `pump_house`, `waterworks` | a flywheel hub on a solid post with trapdoor spokes, iron pump-rod columns, a gauge wall of buttons and levers on solid masonry, an unlit boiler corner | `[13, 13, 17]`, 1–2 floors |
| substation | `substation`, `transformer_station` | transformer tanks with lightning rods standing on them, a fence run of insulators, yellow warning banners, a gravel-and-andesite yard in the floor plane | `[15, 12, 15]`, 1–2 floors; **rods need storey ≥ 4** |
| gasworks | `gasworks`, `gasholder`, `gasometer` | the gasholder read on the outside — the wall field re-clad in stone with iron banding every third course — over a retort bench of unlit furnaces and tar cauldrons | `[15, 15, 15]`, 1–2 floors; **plain rect** |
| steam_plant | `steam_plant`, `powerhouse` | a boiler bank of furnaces with an iron steam drum standing on each, a waxed-copper header, condenser cauldrons, a stripped-log turbine shaft under the plate | `[13, 14, 19]`, 1–2 floors; **shaft needs storey ≥ 4** |
| biomass_shed | `biomass_shed`, `biomass` | four full-block chip bays of coarse dirt, podzol and packed mud in the floor plane, a hopper-and-composter intake run, hay and barrel stores, an unlit boiler corner | `[13, 12, 17]`, 1–2 floors |
| battery_shed | `battery_shed`, `battery` | rack rows of iron-and-waxed-copper cells up both walls with a stripped-log bus bar laid **on** the racks, a painted plate grid floor, a dial-wall monitoring desk | `[13, 12, 15]`, 1–2 floors |
| coal_tipple | `coal_tipple`, `tipple` | grounded timber posts up the apron carrying a beam, an elevated bin on the beam closing on a solid cap, a chute of stairs on stepped grounded columns, coal-block bays | `[13, 14, 17]`, 1–2 floors; **plain rect** |

The two props, placed with `prop.place@0`:

| prop | params | what it gets |
|---|---|---|
| wind_turbine | `height` 7–21 (default 11) | a continuous white-concrete mast, a hub on its head, and a three-arm rotor drawn outward from the hub — every blade block touching the one inboard — with an iron transformer cabinet on the pad |
| solar_array | `rows` 1–8 (default 3) | rows of `daylight_detector` panels, one per plinth cube, laid two apart so every pair has a service lane, over a full-block cable trench with an inverter cabinet at its head |

Wave 6C claims **no** tag an earlier table owns, and the near misses are worth
stating because each would have been a silent theft: **`well_head` remains the
street prop's** (the ring on the green), so the well *house* answers to `well`
and `well_house`; bare **`tower` remains the watchtower's**, so the water tower
answers to `water_tower` and `watertower`; **`windpump` remains the waterworks
prop's**, and `wind_turbine`/`turbine` are this wave's turbine prop; `bath`,
`baths` and `sauna` remain the bathhouse's (the cistern borrows that pool block
for block but not its name); `gas_station`, `filling_station` and
`petrol_station` remain wave 5C's; and `barn`, `granary` and `store` remain their
own tables'. Bare `power_station` is left unclaimed.

**Wave 5D (table 11) — science and modern living.** Twelve buildings: nine
scientific and three modern. The **two domes** (telescope dome, planetarium)
rebuild the roof with a corbel, so they want a **plain rect** and **height** —
give them twenty or more of envelope Y, or the rebuild refuses and you get the
ordinary house shell. The **three modern** ones (penthouse, atrium block, modern
villa) rebuild the roof as a flat deck instead, which needs only the one course
a flat roof already leaves, but they still want the plain rect.

| archetype | tags | what it gets | envelope that works |
|---|---|---|---|
| telescope_dome | `telescope_dome`, `dome_observatory` | the modern white dome: a smooth-quartz corbel with a **two-cell** shutter, a white re-clad drum, a pier-mounted instrument off the lantern, a control desk | `[15, 20, 15]`, 1–2 floors |
| planetarium | `planetarium`, `star_dome` | the dome inverted: a closed deepslate shell with glowstone stars **in** the masonry, a dark upper wall band, a projector pedestal and a ring of seats facing **inward** | `[15, 20, 15]`, 1–2 floors |
| alchemy_lab | `alchemy_lab`, `alchemy` | brewing benches with candles up both walls, a bottle wall of shelving under glass, a distillation run and chalk circles in the floor plane | `[13, 13, 17]`, 1–2 floors |
| herbarium | `herbarium` | specimen presses (bench plus trapdoor) and hung drying racks, potted rows either side of the aisle, a cataloguing lectern | `[13, 12, 17]`, 1–2 floors |
| aviary | `aviary`, `birdhouse` | two iron-bar cages in the far corners, each built **core first** round solid planting, with fence perches and a mossy floor plane | `[15, 13, 17]`, 1–2 floors; **≥ 7 interior wide** for the cages |
| botanical_garden | `botanical_garden`, `botanic`, `arboretum` | full sill-rule glazing, moss planter rows on the bank discipline, gravel paths, and a rimmed pond **only** where the inset predicate holds | `[15, 13, 19]`, 1–2 floors |
| seed_vault | `seed_vault`, `genebank` | an iron-trimmed door face, a packed-ice frost band at the plate, barrel shelf rows under banner labels, backup lanterns on tall storeys | `[13, 12, 15]`, 1–2 floors |
| weather_station | `weather_station`, `met_station` | a roof deck with a solid mast carrying a lightning rod, a grounded apron pole with a banner windsock, a chart desk and a barometer wall of buttons and levers | `[13, 15, 13]`, 1–2 floors |
| field_station | `field_station`, `research_station` | a bunk, sample shelves, an observer-and-lever radio on the wall and a map-table desk run | `[11, 11, 13]`, 1 floor |
| penthouse | `penthouse` | a quartz roof terrace with a slab parapet and planters in its gaps, a three-course glass band, a sparse open plan and a painted floor | `[15, 13, 15]`, 1–2 floors |
| atrium_block | `atrium_block`, `atrium` | a painted court and gallery ring, corner planting off the lanes, and a glazed roof light inset two cells from the eave on the deck | `[17, 14, 17]`, 1–2 floors |
| modern_villa | `modern_villa`, `minimalist` | a white concrete re-clad, a four-course glass band, a flat deck, a wall-backed floating-stair read and very little furniture | `[15, 13, 17]`, 1–2 floors |

Wave 5D claims **no** tag an earlier table owns, and five of the near misses are
worth stating because each would have been a silent theft: `observatory`,
`telescope` and `astronomy` remain the **blitz observatory's** (that one is the
historic stepped dome with a one-cell slit; this wave's is the modern white one);
`alchemist` — with `apothecary`, `pharmacy` and `herbalist` — remains the **trade
apothecary's**; `lab` and `laboratory` remain **wave 4C's laboratory's**; bare
`villa` remains the **Mediterranean villa's** (table 6); and bare `garden` and
bare `station` are left unclaimed for the catalog's formal gardens and its
railway station.

**Wave 4B (table 10) — faith and memorial.** Twelve buildings: eleven religious
and one memorial. Seven of them rebuild part of the shell's exterior (cathedral,
abbey, stupa, ziggurat, bell tower, minaret, tomb), so give *those* a **plain
rect** envelope — a `wing` makes the re-clad and the roof rebuild refuse and you
get the ordinary house shell instead. The stupa, the ziggurat and the two towers
also want **height**: the dome, the tiers and the cone are all drawn in the room
between the eave plate and the roof top, and a short envelope closes itself in
two courses.

| archetype | tags | what it gets | envelope that works |
|---|---|---|---|
| cathedral | `cathedral`, `minster`, `basilica` | apron buttresses with weathered heads, a three-column centre aisle, side-aisle pew blocks turned to the altar, a crossing band and a steeple | `[15, 17, 21]`, 1–2 floors; **long in z** |
| monastery | `monastery`, `friary` | a refectory board with benches down one column, scriptorium desks and stools on the far wall, fence cell partitions | `[13, 13, 19]`, 1–2 floors |
| abbey | `abbey` | a carpet aisle with **two facing ranks of choir stalls**, an altar, a cloister-walk slab cornice in the apron | `[13, 15, 19]`, 1–2 floors |
| cloister | `cloister`, `garth` | an open garth of grass with planted corners and a well head off the lantern column, arcade posts on the wall rows | `[15, 12, 15]`, 1 floor |
| hermitage | `hermitage`, `hermit` | one austere cell: a cot, a lectern and a shrine niche re-clad into the far wall with a candle under it | `[9, 10, 9]`, 1 floor |
| mosque | `mosque`, `masjid` | a mihrab niche with an arch suggestion in the qibla wall, carpet prayer rows across the floor either side of a centre walk, a two-step minbar. No figural decor at all | `[15, 14, 15]`, 1 floor |
| synagogue | `synagogue`, `shul` | a bimah dais with a reading lectern beside the lantern column, an ark cabinet with doors on the far wall, bench ranks turned to the bimah | `[13, 13, 15]`, 1 floor |
| stupa | `stupa` | a corbelled solid dome on an apron plinth ring, a solid core with a clear circumambulation lane round it, a spire finial on the cap | `[13, 17, 13]`, 1 floor; **tall** |
| ziggurat | `ziggurat` | two to three stepped terraces rebuilt over the shell with a shrine cell on the crown, a processional runner and altar inside | `[15, 16, 15]`, 1 floor; **tall** |
| bell_tower | `bell_tower`, `campanile`, `belfry` | a masonry shaft with a trapdoor louvre band in the apron and the bell hung under the ceiling plane beside the lantern | `[9, 18, 9]`, 1 floor; **tall and thin** |
| minaret | `minaret` | the bell tower slimmed: a trapdoor balcony ring near the top and a corbelled cone closing on a solid cap with a spike finial | `[7, 20, 7]`, 1 floor; **tall and thin** |
| tomb | `burial_chamber`, `cist` | the mausoleum's quieter cousin: sealed masonry with an apron plinth course, a slab cist off the lantern column, unlit candles | `[9, 9, 11]`, 1 floor |

Wave 4B claims **no** tag an earlier table owns, and the near misses are the
whole story of the wave: `church`, `chapel`, `temple`, `shrine` and `worship`
all still reach the **church** (table 11); `tomb` and `sepulchre` are still the
**mausoleum's** (table 4), which is why the tomb here answers to
`burial_chamber` and `cist`; `tower` is still the **watchtower's**; and `pagoda`
is still the breadth table's.

**Wave 3C (table 10) — the regional houses.** Twelve dwellings from twelve
**Wave 3C (table 11) — the regional houses.** Twelve dwellings from twelve
traditions. Every one of them rebuilds part of the shell's exterior, so give
them a **plain rect** envelope: a `wing` makes the re-clad and the roof rebuild
refuse, and you get the ordinary house shell instead. The four with corbelled
roofs (hanok, sod house, igloo, roundhouse) also want **height** — the cone is
drawn in the room between the eave plate and the roof top, and a short envelope
closes itself in two courses.

| archetype | tags | what it gets | envelope that works |
|---|---|---|---|
| hanok | `hanok` | dark post-and-beam bands on white plaster, a tiered deepslate corbel roof, a stair course in the apron for the upturned eave, low tables inside | `[13, 15, 11]`, 1–2 floors |
| machiya | `machiya` | a koshi lattice of trapdoors over the street face, stripped-spruce walls, a shop front at the door end and the living room behind it | `[9, 13, 17]`, 1–2 floors; **narrow and deep** |
| riad | `riad` | plain sandstone outside; inside a boxed-in 2x2 floor basin, carpet corners, lattice trim under the plate, potted plants | `[13, 12, 13]`, 1–2 floors; **≥ 11 wide for the basin** |
| cycladic_house | `cycladic_house`, `cycladic`, `whitewash` | whitewashed concrete, a level parapeted roof terrace, a blue band at the plate and blue-trimmed shutters in the apron | `[11, 12, 11]`, 1–2 floors |
| adobe_pueblo | `adobe_pueblo`, `adobe`, `pueblo` | two-tone terracotta render, a flat stepped-parapet terrace, stripped-log vigas protruding through the wall plane | `[13, 12, 11]`, 1–2 floors |
| stilt_house | `stilt_house`, `stilts` | jungle-plank re-clad, fence stilt posts and a trapdoor porch trim in the apron — the raised-floor read, on ordinary ground and with **no water** | `[11, 12, 11]`, 1–2 floors |
| sod_house | `sod_house`, `sod`, `turf` | coarse-dirt and packed-mud turf walls under a shallow grass-surfaced corbel; one humble room | `[9, 13, 9]`, 1 floor |
| igloo | `igloo` | a snow-block dome capped in packed ice over a snow drum, with a tunnel-mouth porch flanking the doorstep | `[9, 16, 9]`, 1 floor; **tall** |
| thatched_roundhouse | `thatched_roundhouse`, `wattle` | stripped-log posts with packed-mud wattle, a deep hay cone closing on a spruce finial, the centre floor left open | `[9, 16, 9]`, 1 floor; **tall** |
| colonial_veranda_house | `colonial_veranda_house`, `veranda`, `colonial` | a posted veranda under a slab canopy in the apron, birch clapboard banded white at each storey line, a parlour inside | `[13, 14, 13]`, 1–2 floors |
| hacienda | `hacienda` | sandstone stucco under a terracotta eave course, hitching posts and a trough in the apron on the door face | `[15, 13, 13]`, 1–2 floors |
| fachwerk_barn | `fachwerk_barn`, `fachwerk` | X-braced dark timber on white infill at barn scale, hay along the side walls, the threshing floor clear | `[15, 15, 19]`, 1–2 floors |

Wave 3C claims **no** tag an earlier table owns. In particular `barn`, `stable`
and `byre` still reach the extended barn — the fachwerk barn answers to
`fachwerk` only — bare `roundhouse` stays unclaimed (it is the *engine*
roundhouse, a locomotive shed), and `house`, `villa`, `trullo`, `half_timber`,
`chalet`, `saltbox` and `dutch_gable` all still belong to their own tables.

**Wave 4D (table 10) — the homestead.** Eight rural yards and four fantasy
houses. Every one rebuilds part of the shell's exterior, so give them a **plain
rect** envelope: a `wing` makes the re-clad and the roof rebuild refuse and you
get the ordinary house shell instead. The six with corbelled roofs (silo,
dovecote, hop kiln, root cellar, mushroom house, hobbit hole) also want
**height** — the cone is drawn in the room between the eave plate and the roof
top, and a short envelope closes itself in two courses.

| archetype | tags | what it gets | envelope that works |
|---|---|---|---|
| stable | `horse_stable`, `stables`, `stalls` | fence-and-gate stall partitions down one wall row off an off-centre corridor, hay-net trapdoors, a tack wall, a cauldron trough in the apron | `[13, 13, 19]`, 1–2 floors |
| silo | `silo`, `grain_silo` | banded stone-brick re-clad under a corbelled cap, hay grain columns behind inspection hatches, a filling head near the plate | `[9, 18, 9]`, 1 floor; **tall** |
| dovecote | `dovecote`, `columbarium`, `pigeon_loft` | a slim stone tower faced in a dense nesting-hole trapdoor grid, a cone with a perch finial, a ladder up the inside | `[9, 18, 9]`, 1 floor; **tall** |
| chicken_coop | `chicken_coop`, `coop`, `henhouse` | trapdoor nesting cubbies over hay, floor-standing fence roosts, feed barrels, a hay nest in the apron | `[11, 11, 13]`, 1 floor |
| apiary | `apiary`, `bee_house`, `beeyard` | hay skeps on grounded fence pedestals and real beehives in the apron, honeycomb-flecked walls, a cauldron extraction bench | `[13, 13, 13]`, 1–2 floors |
| hop_kiln | `hop_kiln`, `oast`, `oast_house` | a brick corbel cone on a solid cap under a white cowl, a slatted drying-floor band, a furnace at the base | `[11, 17, 11]`, 1 floor; **tall** |
| cider_press | `cider_press`, `cidery`, `press_house` | a fence screw under a slab platen beside its catching cauldron, apple barrels, a bottle shelf | `[13, 13, 15]`, 1–2 floors |
| root_cellar_mound | `root_cellar_mound`, `root_cellar` | cobble-and-mud walls under a shallow grass corbel mound, barrels and crates under lidded hatches — **it does not dig** | `[11, 14, 11]`, 1 floor |
| witch_hut | `witch_hut`, `witch`, `witches_hut` | swamp spruce over a dark under-course under a crooked saltbox ridge, a corner cauldron, potion bookshelves, a carpet cushion | `[11, 14, 13]`, 1–2 floors |
| mushroom_house | `mushroom_house`, `mushroom`, `toadstool` | a corbelled red-mushroom cap on a solid cap block over spotted mushroom-stem walls, a stool and a table inside | `[11, 16, 11]`, 1 floor; **tall** |
| hobbit_hole | `hobbit_hole`, `hobbit`, `burrow` | a stripped-log ring trimming the doorway round, a turf corbel roof over mud walls, a settle, a rug and a pantry | `[11, 16, 11]`, 1 floor; **tall** |
| gingerbread_cottage | `gingerbread_cottage`, `gingerbread`, `candy` | brown biscuit walls with white icing courses and candy dots, a quartz icing eave, a sweets counter with a cake | `[11, 14, 13]`, 1–2 floors |

Wave 4D claims **no** tag an earlier table owns. In particular bare `stable`
and `byre` still reach the extended barn (the stable answers to `horse_stable`,
`stables` and `stalls`), bare `mill` is still the windmill's and bare `kiln`
wave two's pottery kiln (the oast answers to `hop_kiln` and `oast`), bare `hut`
belongs to the residential track, bare `cellar` to the underground catalog, and
`house` still falls through to a cottage.

**Wave 5E (table 13) — arcana: the fantastical and the remembered.** Twelve
buildings: five fantasy, five memorial, a bathing pavilion and servants'
quarters. Two shapes matter. The **towers** (alchemist's tower, beacon spire)
want **height**: the cone is corbelled out of the room between the eave plate
and the roof top, and a short envelope closes itself in two courses. The
**remembrance arch** wants height *in the storey* rather than in the envelope —
its crown is drawn at the top interior course, and it is **refused outright
under a four-course storey**, because an arch you cannot walk under is a wall.
The **bathing pavilion** wants a generous square, because its pool is inset one
cell all round and a narrow room leaves no bathers' side.

Every monument here is a **shell with a memorial in it**, never a solid plug:
the cist, the figure, the dais and the arch all stand off the lantern column,
and every one of the twelve is held to the shared pocket detector at three
envelopes across one and two storeys.

| archetype | tags | what it gets | envelope that works |
|---|---|---|---|
| alchemists_tower | `alchemists_tower`, `alchemy_tower`, `alchemists` | copper-banded stone brick under a corbelled cone on a solid cap with a lightning-rod vent; a brewing stand, the still, specimen shelves behind hatch fronts, a reading press | `[9, 19, 9]`, 1 floor; **tall** |
| dragon_roost | `dragon_roost`, `dragon`, `roost` | blackstone-and-basalt charred trim, a scorched floor recolour, an open-sided nest crescent of hay and bone off the lantern column, a sparing gold hoard corner | `[17, 15, 21]`, 1–2 floors; **big** |
| crystal_shrine | `crystal_shrine`, `crystal`, `amethyst_shrine` | an amethyst pedestal with a cluster on it standing off the lantern column, purpur-and-quartz trim, kneeling benches whose backrests point away from the crystal | `[11, 13, 13]`, 1–2 floors |
| dwarven_gate | `dwarven_gate`, `dwarven`, `deep_gate` | a deepslate megalith trim round the doorway with a chiseled rune band, grounded brazier pedestals in the apron, a forge hall of anvil, smithing table and lit furnace | `[15, 13, 13]`, 1–2 floors |
| beacon_spire | `beacon_spire`, `spire` | a slim corbelled cone closing on a **solid** cap with a sea-lantern crown standing on it, and a keeper's room below | `[7, 21, 7]`, 1 floor; **tall** |
| cenotaph | `cenotaph` | a sealed masonry shell round a slab-lidded cist off the lantern column, a green-carpet wreath ring, a name wall of chiseled stone with wall banners | `[11, 12, 13]`, 1–2 floors |
| war_memorial | `war_memorial`, `memorial` | a block-built figure on a chiseled plinth off the lantern column, flanking benches with their backrests to the walls, red wall banners and unlit candles | `[11, 12, 13]`, 1–2 floors |
| urn_wall | `urn_wall`, `urns`, `urn_niches` | trapdoor-fronted niches from the second course to the plate up both interior wall rows, a clear aisle between them, unlit candles and a register lectern | `[9, 12, 17]`, 1 floor; **long** |
| remembrance_arch | `remembrance_arch`, `memorial_arch`, `triumphal_arch` | a continuous **full-block** crown spanning wall to wall at the top interior course with piers under it, a names band, a carpet processional runner | `[13, 15, 15]`, 1–2 floors; **needs a four-course storey** |
| pyre_platform | `pyre_platform`, `pyre` | a log-cribbed dais with slab tops off the lantern column carrying an **unlit** campfire, mourners' benches back on the wall rows | `[13, 12, 13]`, 1–2 floors |
| bathing_pavilion | `bathing_pavilion`, `bath_pavilion` | the bathhouse's exact pool argument in an airier quartz room: water in the floor plane inside a smooth-quartz coping, pedestals carved from the pool corners, a divider off the lantern row, benches only where a stander fits | `[13, 13, 13]`, 1–2 floors; **square** |
| servants_quarters | `servants_quarters`, `servants` | plain bunks up one wall row with barrel racks between the cot heads, a shared table on the far row in the storey's own idiom, a wash cauldron and a crafting table | `[11, 12, 17]`, 1–2 floors |

Wave 5E claims **no** tag an earlier table owns, and every near miss is worth
stating because each would have been a silent theft. Bare **`alchemist` is the
apothecary's** (table 6); **`wizard`, `arcane` and `sorcerer` are the wizard
tower's**; bare **`shrine` and `temple` mean church** (table 11), which is why
the crystal shrine answers to `crystal_shrine` and `crystal`; bare **`beacon`
is left free** for the military beacon tower and the lighthouse, so the spire
claims only `beacon_spire` and `spire`; **`tomb`, `sepulchre` and `mausoleum`**
stay the mausoleum's and wave 4B tomb's; **`columbarium` is the dovecote's**
(table 12, the older sense of the word) and `ossuary` the underground
catalog's, so the urn wall answers to `urn_wall` and `urns`; bare **`baths`,
`sauna` and `hammam` are the bathhouse's**; bare `arch` is never claimed at all,
because a bridge is full of them; and `house` still falls through to a cottage
with `hall` still the great hall's.

**Wave 6E (table 14) — the relics: five RUINED buildings.** A ruined cottage,
a ruined keep, a ruined church, a collapsed tower and an overgrown villa.

**THE RUIN LAW.** A ruined building is **the ordinary shell fit-out DECAYED,
not a second grammar**. There is no ruin builder: the same shell is built, and
then written over. Decay is five moves, in order — a **crumble line** derived
from each wall column's own coordinates, with everything above it cleared to
air **from the top down** (a whole run, never a hole punched in the middle of a
wall, because that is exactly how a block ends up floating); a **re-clad** of
the survivors in mossy and cracked variants; the **roof broken to fragments**
laid only on the head of a wall column that survived to the eave plate, so a
fragment always has wall beneath it and nothing ever spans the room; **rubble**
as full blocks on the floor, laid through the same reservation the furniture
uses, so the room stays walkable *around* the heaps; and **green** — vines on
the inside faces of surviving walls, and moss carpet on the tops of rubble
heaps and nowhere else, because a carpet needs ground.

Two things a ruin still guarantees, and they are why it is a building at all:
**the door and its approach are never decayed** (the walking agent starts in
the cell inside the door, and so does the traversal lint), and **every open
interior cell stays reachable from it**. A ruin is also **cold and dry**: no
fire, no water, no lava.

These want a **plain rect** footprint — the decay is drawn on the wall ring, so
an L or a T falls back to the interior moves only — and they want **size**: a
crumble line drawn on a three-course wall has almost nothing to take away, and
a ruined keep on a small square puts its four surviving corners on top of each
other.

| archetype | tags | what it gets | envelope that works |
|---|---|---|---|
| ruined_cottage | `ruined_cottage`, `ruined_house`, `derelict_cottage` | the reference decay: an even crumble two or three courses up, mossy-cobble survivors, roof fragments on the surviving heads, rubble, vines, a barrel and a broken chair | `[11, 11, 13]`, 1–2 floors |
| ruined_keep | `ruined_keep`, `ruined_castle`, `castle_ruin` | a **structured** collapse: the four corners stand to the eave plate and the curtains between them are gone almost to the plinth; cracked and mossy stone brick, a heavy rubble field, cobwebs | `[17, 13, 17]`, 1–2 floors; **big** |
| ruined_church | `ruined_church`, `ruined_chapel`, `ruined_abbey`, `abbey_ruin` | a roofless nave with tall survivors and a chiseled band at the third course, and a **cold** altar stump — one chiseled block with a slab on it — at the far end | `[13, 15, 19]`, 1–2 floors; **long** |
| collapsed_tower | `collapsed_tower`, `broken_tower`, `tower_ruin` | the one **leaning** collapse: the surviving wall height falls off linearly along one axis, so the wall head slopes from a standing stub to nothing, with a heavy grounded spill in the apron | `[9, 17, 9]`, 1–2 floors; **tall** |
| overgrown_villa | `overgrown_villa`, `villa_ruin`, `ruined_villa` | the gentlest crumble and the greenest: moss-block survivors, vines on every second inside face, moss carpet on the rubble, a floor half gone to grass, and a run of fallen column drums down a wall row | `[15, 13, 15]`, 1–2 floors |

Wave 6E claims **compounds only**, and the exclusions are the review. Bare
**`abbey` is wave 4B's abbey** and bare `church` and `chapel` are the church's,
so the ruined church answers to `ruined_abbey` and `abbey_ruin`; bare **`keep`,
`castle` and `tower`** stay the garrison keep's and the watchtower's; bare
**`villa` is the Mediterranean villa's**; bare `house` still falls through to a
cottage; and bare **`overgrown` is not claimed at all** — it is an adjective,
and an overgrown *anything* is a plausible request.

> **OPEN AUTHORING QUESTION (for Kai).** Bare **`ruin` and `ruins` are
> deliberately UNCLAIMED** and currently fall through to the extended table's
> `cottage` default. An author who writes only `"ruins"` has not said what is
> ruined, and any answer this table gave would be a choice made on their
> behalf: a ruined cottage and a shattered obelisk are both honest readings.
> The three options are (a) leave it, and require the author to be specific;
> (b) point both at `ruined_cottage`, the gentlest and most generic of the
> five; (c) point both at a *seeded pick* among the five, which is the most
> fun and the least predictable. Nothing changes until Kai chooses.

**The monuments of the same wave are PROPS, not archetypes** — `standing_stones`,
`henge`, `monolith`, `burial_mound`, `dig_site`, `fossil_dig` and
`shattered_obelisk`. A megalith has no room in it, and asking the building
grammar for one would get a shell with a door in it. They are listed in the
prop table below, and **none of their names is a building tag**: writing
`"henge"` in a node's tags gets a cottage, not a henge. Place them with
`prop.place`.
**Wave 6D (table 18) — spectacle: the buildings you go *into* to be amazed.**
Six of them, and the wave's other six entries are deliberately *not* buildings:
the ferris wheel, bandstand, memorial garden, portal frame and floating
platform are props, and the houseboat is a hull. The split is decided by one
question — does a body walk around inside it? The **hedge maze** is the
interesting call and it went the building way on purpose: a maze built as a
compound of props is a maze nothing can prove walkable, and built as a building
every hedge cell goes through the ground floor's own connectivity guard and the
whole storey is then walked from the door.

Both mazes here — the hedge and the mirrors — are drawn as a **comb**: fingers
along z with a corridor left open at *both* ends, so no single blocked cell
(the shell's own hanging lantern, the stair reserve, the door approach) can
strand anything. A serpentine is prettier and any one of those three cuts it in
half.

| archetype | tags | what it gets | envelope that works |
|---|---|---|---|
| big_top | `big_top`, `circus_tent`, `marquee` | the shell re-roofed as a great striped wool cone on a **solid** cap with a banner finial, king poles inside the crown (never floor-to-cap — that is a blocked column), a sand ring recoloured into the floor plane, tiered benches on both wall rows | `[17, 21, 17]`, 1–2 floors; **tall, square** |
| hall_of_mirrors | `hall_of_mirrors`, `mirror_maze`, `mirror_hall` | a checkerboard floor plane, a mirror band of glass panes written into the **wall ring** over white and light-grey backing courses, and a glass-pane comb maze | `[11, 12, 19]`, 1–2 floors; **long** |
| funhouse | `funhouse`, `fun_house` | a tilted-floor read of bright bands and set-in top slabs written entirely into the floor plane, a spinning tunnel of concentric wool rings on the far wall, a deliberately mismatched trim round the doorway | `[13, 13, 15]`, 1–2 floors |
| dodgems_pavilion | `dodgems`, `dodgems_pavilion`, `bumper_cars` | an open hall: a blackstone arena painted into the floor plane inside a full-block kerb, a stripped-log power grid at the plate, stair-and-trapdoor cars parked on the wall rows | `[15, 12, 15]`, 1–2 floors; **square** |
| aquarium | `aquarium`, `oceanarium`, `fish_house` | the bathhouse pool predicate verbatim inside a dark-prismarine rim, plus wall tanks written into the wall ring as glass over blue concrete with dry coral specimens and wall-banner labels | `[15, 13, 15]`, 1–2 floors; **square** |
| hedge_maze | `hedge_maze`, `maze`, `hedges` | persistent oak-leaf hedges on coarse-dirt beds in a comb, in a mossy walled garden with grounded apron urns and a bench at the far end | `[13, 12, 19]`, 1–2 floors; **long** |

**The aquarium's fluid decision, stated once.** The **centre pool is real
water** and is the bathhouse argument unchanged: into the floor plane at
`y = 0`, in a rect inset one cell from the interior, so under every water cell
is the foundation skirt, beside every water cell is pool or written floor, and
no prop ever stands on one. The **wall tanks are not water**, and that is
deliberate rather than a shortcut: for the fluid rule a tank's water would have
to be enclosed on *every* face including its top, and a tank's top course is
the head-height course the shell hangs its lantern in — provably sealed on one
envelope and open on the next. So the tanks are glass fronted over blue
concrete, which reads as water through glass at any distance and is, block for
block, not a fluid.

Wave 6D claims **no** tag an earlier table owns. Bare **`tent` is the nomadic
vocabulary's** (the big top answers to `big_top`, `circus_tent`, `marquee`);
bare **`hall` is still the great hall's**; bare **`arcade` is the leisure
wave's**; bare **`pavilion`** belongs to the leisure and arcana pavilions; bare
**`museum` and `zoo` are the institution wave's**; and **`labyrinth` is an
underground catalog entry**, so the hedge maze claims `maze` and `hedges` only.

**Wave 4A (table 11) — the dwellings.** Twelve houses, from a one-room hut to
a mansion. Most are **pure interior fit-outs** and are happy on a `wing`
footprint as well as a plain rect; the four that touch the shell — the
townhouse and terraced row (wall re-clad), the log cabin (wall re-clad) and the
bungalow (an apron porch) — want a **plain rect**, and quietly keep the
ordinary house shell otherwise. The three with a long board (farmhouse, manor,
mansion) need **nine interior columns and seven of depth** or they get a room
with no long table rather than a room cut in half by one; the mansion's *double*
range needs thirteen, and the dormitory's second bunk range seven.

| archetype | tags | what it gets | envelope that works |
|---|---|---|---|
| farmhouse | `farmhouse`, `farmstead` | a kitchen range of smoker, cauldron and furnace across the far wall, a stacked larder up one side, a boot room by the door, a board down the other side | `[13, 13, 15]`, 1–2 floors |
| townhouse | `townhouse`, `town_house` | brick re-clad banded in stone with a slab cornice in the apron; a carpeted stair-hall runner and a parlour of table, chair and bookshelf | `[9, 14, 15]`, 1–2 floors; **narrow-fronted** |
| terraced_row | `terraced_row`, `terrace` | stone-brick party piers every fourth column between plinth and eaves bands — the repeating bay read — over a modest one-table interior | `[9, 13, 17]`, 1–2 floors |
| manor_house | `manor_house`, `manor` | a trapdoor dado panelling both side walls, a long board off the middle column, a study of lectern and bookshelves | `[13, 14, 17]`, 1–2 floors |
| mansion | `mansion`, `estate_house` | a double range of boards either side of an empty middle column, carpeted galleries up both wall rows, a state end of lectern between bookshelves | `[15, 15, 17]`, 1–2 floors; **≥ 15 wide for the double range** |
| longhouse | `longhouse`, `mead_hall` | mead benches up both wall rows with their backrests to the wall, banner shields between the runs, a hearth and ale barrels at the head | `[11, 13, 21]`, 1–2 floors; **long** |
| bungalow | `bungalow`, `ranch_house` | a posted porch under a slab canopy along the door face of the apron, and one comfortable storey inside | `[13, 11, 13]`, 1 floor |
| hut | `hut`, `shack` | one room and nothing spare: a cot, a hearth fire with a stool turned to it, a tool chest | `[9, 11, 9]`, 1 floor |
| log_cabin | `log_cabin`, `cabin` | every wall course re-clad in horizontal logs with interlocked corners, fur carpets up one wall row, a fire and a crafting corner | `[11, 12, 13]`, 1–2 floors |
| courtyard_house | `courtyard_house`, `courtyard` | a fence colonnade down both wall rows, a planted pot at each interior corner, a cauldron well — and the middle left deliberately empty | `[13, 12, 13]`, 1–2 floors |
| dormitory | `dormitory`, `dorm` | bunk ranges head-to-wall up both walls, barrel lockers in the gaps between cot heads, one broad aisle | `[13, 12, 19]`, 1–2 floors |
| almshouse | `almshouse`, `hospice` | a row of identical bays down one range — a bed, a chest and a fence partition each — and one shared hearth room | `[11, 12, 19]`, 1–2 floors |

Wave 4A claims **no** tag an earlier table owns, and the four near misses are
worth stating: `house` is still the **cottage** (and is still the tag the road
network selects on), bare `hall` is still the great hall, `villa` and `riad`
still belong to their own houses, and `apartment`, `flats` and `tenement` are
still the tall grammar's apartment block. A `hut` is the bare tag only.

**Wave 5A (table 12) — the garrison.** Twelve military buildings and outposts,
plus two small outbuildings in the same register of work. Five of them rebuild
the **exterior** — the castle, barbican, bastion and beacon tower (a masonry
re-clad plus a crenellated fighting deck) and the bunker, pillbox and shepherd's
bothy (a wall re-clad only) — so give *those* a **plain rect** envelope: a
`wing` makes the rebuild refuse and you get the ordinary shell instead. The
castle's great-hall board needs **nine interior columns and seven of depth** or
it gets a hall with no long table rather than a hall cut in half by one.

| archetype | tags | what it gets | envelope that works |
|---|---|---|---|
| castle | `fortress`, `stronghold` | full masonry re-clad, a crenellated fighting deck with corner turrets proud of the merlons, a great-hall board, wall-banner heraldry, an armoury corner | `[15, 17, 17]`, 1–2 floors; **the biggest of the wave** |
| barbican | `outer_gate`, `gateworks` | the keep's battlement plus a masonry arch either side of the door head, a machicolation course in the apron with murder-hole trapdoors under its soffit, a guard room | `[13, 15, 11]`, 1–2 floors |
| bastion | `bastion` | battered plinth courses under an angular masonry re-clad, a flat gun-platform deck under a parapet, a powder store of stacked barrels behind wall racks | `[13, 14, 13]`, 1–2 floors |
| armory | `armory`, `armoury` | rack walls of fence stems under trapdoor boards up both wall rows, a smith's corner of smithing table, iron block and anvil, crate rows by the door | `[11, 12, 17]`, 1–2 floors; **deep** |
| arsenal | `arsenal` | the armory scaled up: a barrel powder store shut off by an iron-barred partition, stacked shell racks up the other wall, a loading bench at the door end | `[13, 13, 19]`, 1–2 floors; **deep** |
| bunker | `bunker` | a poured-concrete re-clad banded darker at the plinth, a firing-slit window rhythm, a map table and a cot corner | `[13, 10, 13]`, 1 floor |
| pillbox | `pillbox` | one room and nothing spare: concrete re-clad, slit rhythm, a mounted position of stair and iron block turned out of the far wall | `[9, 9, 9]`, 1 floor |
| guard_post | `guard_post`, `sentry_post` | a grounded brazier pedestal and an alarm bell on the two corners of the door face, a watch bench, a water butt | `[9, 11, 9]`, 1 floor |
| checkpoint | `checkpoint` | a barrier arm across the apron on the door face — grounded posts with a trapdoor boom, doorstep left clear — lantern posts, a document desk | `[11, 11, 11]`, 1 floor |
| beacon_tower | `beacon_tower` | masonry re-clad under a crenellated deck, a signal campfire on a solid pedestal at the middle of the deck, signal banners on the walls below | `[9, 18, 9]`, 1–2 floors; **narrow and tall** |
| gravedigger_hut | `gravedigger_hut`, `gravedigger` | tool racks up one wall row, a slab coffin bench down the other, a lime composter and a fire at the far wall, a lantern by the door | `[9, 11, 11]`, 1 floor |
| shepherds_bothy | `shepherds_bothy`, `bothy` | a one-room stone hut: a cot, a hearth with a stool turned to it, a crook rack, fleece bales of white wool | `[9, 11, 9]`, 1 floor |

Wave 5A claims **no** tag an earlier table owns, and three of the near misses
shaped its whole vocabulary:

- **`castle`, `citadel`, `keep` and `donjon` are the breadth keep's** and stay
  there. The castle in this table is the keep grand — a different building at a
  bigger register — so it answers to `fortress` and `stronghold` only;
- **`barbican` is the breadth gatehouse's.** The gatehouse claimed it in wave
  three, and a claim is not moved by a later wave wanting it, so the barbican
  here answers to **`outer_gate`** and **`gateworks`**. A document tagged
  `barbican` still gets a gatehouse, which is a correct building;
- **`beacon` and `beacon_spire` are left alone** for the fantasy track's beacon
  spire; this tower answers to `beacon_tower` only. `garrison` and `barracks`
  likewise stay the barracks', `tower` the watchtower's and bare `hut` the
  residential track's.

So a house is `"tags": ["house"]`, the smithy is `"tags": ["craft"]`, the
granary `"tags": ["store"]`, the chapel `"tags": ["chapel"]`. Add `"house"` to anything people live in — it is
also the tag `{"distance": "#tag:house"}` and the road network select on.
There is no `archetype` param; writing one is an error.

**Wave 5B (table 13) — commerce and civic.** Twelve buildings: seven
commercial, three civic and two residential. Only the shop row rebuilds part of
the exterior (the shopfront piers and cornice on its street face), so give
*that* one a **plain rect** envelope; the rest are pure interiors and take a
`wing` happily. Three of them lay a **seat or stall field** — auction house,
food court, university hall, and the spice market's souk lane — which means
their side wall rows are the field's clear lane and carry nothing solid; give
those depth for the rows and width for the three-column aisle.

| archetype | tags | what it gets | envelope that works |
|---|---|---|---|
| shopping_mall | `shopping_mall`, `mall` | distinct shop-bay stock down both wall rows with fence piers between bays, a painted three-column promenade off the lantern, planters at its head | `[15, 13, 19]`, 1–2 floors |
| department_store | `department_store` | timber counters per department with wool-bust mannequins standing on them, stacked stock walls between, haberdashery looms across the far wall | `[15, 13, 17]`, 1–2 floors |
| food_court | `food_court` | counter stalls of smoker, cauldron and timber under a row of menu banners, and one shared seating field of tables and seats on the school's aisle discipline | `[15, 12, 19]`, 1–2 floors |
| auction_house | `auction_house`, `auction` | a slab rostrum with the auctioneer's lectern in the middle of it under red sold-banners, flat seat rows, lot tables at the door end | `[13, 14, 19]`, 1–2 floors |
| caravanserai | `caravanserai`, `khan` | traveller cells of chest and fence partition down both wall rows, carpet-topped pack-saddle racks, a hay store and a well at the head, the court left empty | `[15, 12, 17]`, 1–2 floors |
| spice_market | `spice_market`, `souk`, `bazaar` | a souk lane of dense terracotta-and-wool sack stalls, lanterns standing only on the sacks, trapdoor and iron-bar hanging bunches on the walls | `[13, 12, 17]`, 1–2 floors |
| shop_row | `shop_row`, `parade` | stone-brick piers every fourth column of the street face under a slab cornice, over counter-and-crate bays down both wall rows | `[11, 13, 19]`, 1–2 floors; **plain rect** |
| university_hall | `university_hall`, `university`, `college` | a slab dais and lectern between book walls, flat rows off a three-column aisle, a trapdoor gallery rail run high on both side walls | `[15, 15, 19]`, 1–2 floors |
| embassy | `embassy`, `consulate` | a timber reception desk and lectern under a flag wall of banners, waiting benches backed to both side walls, an iron-trimmed records corner | `[13, 14, 17]`, 1–2 floors |
| council_chamber | `council_chamber`, `council` | a ring of wall-row benches broken at the aisle, a board set either side of the lantern column and never under it, the speaker's dais at the head | `[13, 13, 15]`, 1–2 floors |
| boarding_house | `boarding_house`, `lodging_house` | bed-and-chest bays with fence partitions down one range only, the other left as the corridor, a shared kitchen range under the house-rules banner | `[13, 13, 17]`, 1–2 floors |
| gate_lodge | `gate_lodge`, `gatekeepers_lodge` | one cosy room: a watch seat turned back down the room at the door, a small board, a cot head-to-wall, a trapdoor key rack by the entry | `[9, 11, 11]`, 1 floor |

Wave 5B claims **no** tag an earlier table owns, and the near misses are worth
stating because every one of them would have been a silent theft: `market`,
`stall` and `vendor` are still the **market stall's**; `shop`, `grocer` and
`emporium` the **general store's** and bare `store` the **granary's**; `trade`
and `inn` still reach the **inn**; bare `hall` is still the **great hall** and
`academy` the **school**; `court` is the **courthouse's**; `lodging` is the
high-rise **hotel's** and `hospice` the **almshouse's**. Bare `lodge` is left
unclaimed — the gate lodge is a compound only.

**Wave 6A (table 14) — the transport buildings.** Twelve buildings: three rail,
three road, two air, three water and a climbing wall. Eleven of the twelve sit
in catalog groups whose default kind is `prop` (`transport-land`,
`transport-water`, `transport-air`); each carries a `kind: "building"` override
in its catalog entry, because they are implemented here as *building* archetypes
— a station is a shell with a room in it, not a model dropped on the ground.

Three of them rebuild part of the exterior — the **control tower** (concrete
shaft, roof deck, radar), the **lighthouse** (banded courses, gallery, lamp) and
the **coach house** (wide-door trim on its street face) — so give *those* a
**plain rect** envelope and, for the two towers, height to spare above the
plate; the rest are pure interiors and take a `wing` happily. The **airport
terminal** lays a seat field on the school's aisle discipline, so its side wall
rows are the field's clear lane and carry nothing solid: give it depth for the
rows and width for the three-column aisle. The **boathouse** writes a water slip
into its floor plane, inset one cell from the interior on every side, and needs
the room for a walkway all the way round it.

| archetype | tags | what it gets | envelope that works |
|---|---|---|---|
| train_station | `train_station`, `railway_station`, `station` | a rail line laid on the floor cells of one wall row (rails are passable) beside a painted platform edge, waiting benches down the other, a ticket counter and clerk's window under a departure board and a glazed clock roundel | `[15, 13, 21]`, 1–2 floors |
| signal_box | `signal_box`, `signal_cabin` | a timber frame desk across the head with the levers standing on it where the storey has four courses and wall-face switches where it has three, dense mullions on every side, a stool, a stove and the register | `[9, 13, 11]`, 1–2 floors |
| roundhouse | `roundhouse`, `engine_shed`, `engine_roundhouse` | short rail stubs off the head wall on alternate columns, an inspection pit read as a floor-plane recolour (never a hole), trapdoor tool walls down both sides, a fitter's bench and anvil | `[15, 14, 21]`, 1–2 floors |
| coach_house | `coach_house`, `carriage_house` | the middle of the room left open for the carriage that is not there, tack racks and harness chests on the wall rows, a hay corner, stone-brick piers under a slab cornice on the wide door face | `[13, 13, 15]`, 1–2 floors; **plain rect** |
| toll_house | `toll_house`, `tollbooth`, `toll_gate` | a toll counter with a window seat in the middle of it, a strongbox chest under an iron grille, the rate board on the wall, and a barrier outside on grounded apron posts with a trapdoor arm | `[9, 11, 11]`, 1 floor |
| transit_hub | `transit_hub`, `bus_station`, `hub` | bay benches down both wall rows over painted bay markers, a route wall of banners over the enquiries counter, a kiosk corner by the way in | `[15, 12, 17]`, 1–2 floors |
| control_tower | `control_tower`, `air_traffic_control` | a concrete shaft re-clad plinth to plate, a glazed top from the facade defaults, console desks with passable wall-face switches, a radar dish on a continuous column raised from the solid roof deck | `[11, 18, 11]`, 1–2 floors; **plain rect** |
| airport_terminal | `airport_terminal`, `terminal`, `airport` | check-in counters across the head, departure rows on the school's aisle discipline, gates read as painted floor bands under numbered banners, baggage barrows by the door | `[15, 13, 21]`, 1–2 floors |
| boathouse | `boathouse`, `boat_shed` | a hall over a water slip — the bathhouse's boxed-pool predicate, inset one cell on every side and rimmed with a solid coping — a hauled-out stair-and-slab rowboat standing on the rim, trapdoor oar racks | `[13, 14, 17]`, 1–2 floors |
| shipyard | `shipyard`, `drydock` | a stripped-log keel offset off the lantern lane, ribs standing on solid floor beside it and rising only where the storey has the height, fence-and-slab scaffolds, plank stores down one range | `[13, 15, 19]`, 1–2 floors |
| lighthouse | `lighthouse`, `pharos` | white-and-red terracotta bands from plinth to plate, a solid gallery deck with a parapet over the plate, a sea-lantern lamp on a continuous column, a keeper's room below | `[11, 20, 11]`, 1–2 floors; **plain rect** |
| climbing_wall | `climbing_wall`, `bouldering` | scattered stone-button holds up one tall wall face (bracketed only to full blocks, never glazing), wool crash mats painted into the floor plane, a top ledge of a slab on a post | `[13, 15, 15]`, 1–2 floors |

Wave 6A claims **no** tag an earlier table owns, and two of its claims are worth
stating because they look like thefts and are not:

- **bare `station` is this table's**, by the train station. Wave 5D left it
  free on purpose — its own two are compounds (`weather_station`/`met_station`,
  `field_station`/`research_station`) and its module docs say in as many words
  that a railway station stays free to claim the bare word later. This is that
  later, and `weather_station`, `field_station` and `research_station` all still
  reach wave 5D;
- **bare `roundhouse` is the ENGINE shed's.** Wave three's hut answers to
  `thatched_roundhouse` and `wattle` only, and its module docs name bare
  `roundhouse` as "an unimplemented catalog id — an *engine* roundhouse, which
  is a locomotive shed and not a hut". So the shed takes it, with `engine_shed`
  and `engine_roundhouse` beside it.

The near misses are the usual discipline: `tower` is still the **watchtower's**
and `tower_block` the **tall grammar's** (so the control tower is a compound);
`beacon`, `beacon_spire` and `beacon_tower` are the fantasy spire's and wave
5A's, so the lighthouse reaches for no beacon word at all; `depot` is still the
**warehouse's**; `gym` the **blitz gym's**; and `dock`, `wharf` and `slip` are
left unclaimed for the catalog's quay and slipway.

#### The tall grammar — skyscrapers, hotels, apartment blocks

A high-rise tag switches the building onto a different grammar: a switchback
stair core, repeated floor plates, a curtain wall and a roof deck. It has its
own rules, all enforced.

| archetype | tags | max `floors` | what the upper floors are |
|---|---|---|---|
| skyscraper | `skyscraper`, `high_rise`, `highrise`, `tower_block` | 20 | curtain wall, open plates, roof deck |
| office | `office`, `offices`, `corporate`, `headquarters` | 16 | open plates around the core |
| hotel | `hotel`, `lodging`, `guesthouse` | 14 | corridor, bay partitions, a bed per bay |
| apartment_block | `apartment`, `apartment_block`, `tenement`, `flats` | 10 | projecting slab-and-bar balconies |

- **Footprint 7–24 on both horizontal axes.** Under 7 there is no room for a
  core *and* a plate (error); over 24 is a podium, which is a second node.
- **The tall grammar builds at 4 blocks per storey**, always. Write
  `sizeY ≥ floors × 4 + 4` (storeys plus a parapet) or you get an
  `ENVELOPE_SIZE_COERCED` warning — the grammar builds to `floors` regardless
  and a short box only misleads whoever reads the document.
- `"roof": "flat"` is the only roof that reads right on one.
- A ten-storey tower is 44 blocks tall. Give it flat ground
  (`terrain_conform: "flatten"`) and keep it off a ridge.

```json
{
  "id": "harbour_tower",
  "kind": "generator",
  "generator": "building.grammar@0",
  "label": "the twelve-storey tower over the waterfront",
  "envelope": { "shape": "box", "size": [16, 52, 14] },
  "params": { "floors": 12, "roof": "flat", "windowRhythm": "dense" },
  "constraints": [
    { "distance": "plaza", "min": 10, "max": 60 },
    { "terrain_conform": "flatten", "reference": "median", "blend": 6 }
  ],
  "ports": { "door": { "type": "door", "face": "south", "tags": ["primary"] } },
  "tags": ["skyscraper", "house"]
}
```

**`optional: true`** lets the solver drop this node instead of forcing it into
a bad spot. Put it on anything the map might not have room for — a watchtower
on a hill, an outlying farm.

### `road.network@0`

At most one node, and it takes no envelope and no constraints — it is routed
after everything else is placed.

```json
{
  "id": "lanes",
  "kind": "generator",
  "generator": "road.network@0",
  "label": "the lanes joining every door to the green",
  "params": {
    "anchors": ["plaza", "#tag:house"],
    "pattern": "organic",
    "width": 3,
    "lanterns": true,
    "lanternSpacing": 14
  }
}
```

| param | values | notes |
|---|---|---|
| `anchors` | **required**, non-empty array of selectors | what the roads must reach: node ids, `#tag:…` sets |
| `pattern` | `organic`, `grid`, `radial`, `ribbon`, `minimal_spanning` | `organic` for a village, `grid` for a planned town |
| `width` | 2..3 | lane width in blocks |
| `lanterns` / `lanternSpacing` | bool / 4..64 | lit lanes; 12–16 spacing looks right |
| `curvature`, `maxGrade`, `junctionStyle` | 0..1 / 0..4 / `plain`,`plaza`,`roundabout`,`stairs` | rarely worth setting |

Anchor the plaza and the house tag and you are done: `["plaza", "#tag:house"]`
reaches every dwelling. Add a specific id (`"great_hall"`, `"lighthouse"`) for
an outlying building that must be connected. A route that cannot be found —
water, lava or a wall of houses in the way — is reported as `LOAM-T209` and
that building is simply left unconnected.

### `district` — a quarter with a street grid

Everything above places buildings and then joins them with lanes. A **district**
does the opposite: it draws the streets first, cuts the ground between them into
blocks, subdivides the blocks into lots, and puts a building on each lot with its
door on the street. That is the difference between a village and a town — a
village is buildings with paths between them, a town is a street with buildings
along it.

Reach for a district when you want **city fabric**: a downtown, a terraced
quarter, a planned new town, an industrial estate. Keep using plain
`building.grammar@0` nodes with constraints for anything where the individual
buildings matter more than the street they are on — a hamlet, a farmstead, a
monastery on a hill.

```json
{
  "id": "downtown",
  "kind": "district",
  "label": "the business district, towers over a grid of mid-rise blocks",
  "envelope": { "shape": "region", "size": [180, 160] },
  "params": {
    "fabric": "grid",
    "density": "high",
    "mix": ["office", "apartment_block", "shop_row", "department_store"],
    "blockSize": 38,
    "plaza": true
  },
  "constraints": [
    { "zone": "center" },
    { "terrain_conform": "flatten", "reference": "median", "blend": 8 }
  ],
  "tags": ["downtown", "urban"],
  "children": [
    {
      "id": "tower",
      "kind": "generator",
      "generator": "building.grammar@0",
      "label": "the tower the skyline is built around",
      "envelope": { "shape": "box", "size": [21, 76, 19] },
      "params": { "archetype": "skyscraper", "floors": 18 },
      "ports": { "door": { "type": "door", "face": "south", "tags": ["primary"] } },
      "tags": ["landmark"]
    },
    {
      "id": "opera",
      "kind": "generator",
      "generator": "building.grammar@0",
      "envelope": { "shape": "box", "size": [25, 22, 19] },
      "params": { "archetype": "opera_house", "floors": 3 },
      "ports": { "door": { "type": "door", "face": "south", "tags": ["primary"] } },
      "tags": ["landmark", "civic"]
    }
  ]
}
```

| field | values | notes |
|---|---|---|
| `envelope` | `{"shape": "region", "size": [x, z]}` | **required**; 38 × 38 is the hard floor, 140+ before a grid reads as one |
| `params.fabric` | `grid`, `organic` | **required**; `grid` is a planned town, `organic` the same grid let go of |
| `params.density` | `low`, `medium`, `high` | **required**; drives lot size, coverage and storeys together |
| `params.mix` | non-empty array of archetype names | **required**; what the auto-infill builds |
| `params.blockSize` | 16..96 | optional hint: blocks between street centre lines. Omit and the density chooses |
| `params.plaza` | bool | optional: keep the central block open as a square |
| `params.walls` | object | optional: ring the finished quarter with a wall. See **Walls** below |
| `constraints` | as any other node | say **where the district is**, not what is in it |
| `children` | `building.grammar@0` nodes | the landmarks — everything else is infilled |

**What `density` actually does**, so you pick the right one:

| | lot depth | storeys | lots built on | reads as |
|---|---|---|---|---|
| `high` | ~13–17 | 3–8 | almost all | downtown: continuous street walls, party walls, mid-rise |
| `medium` | ~13–16 | 2–4 | about three in five | a town centre with gaps and yards |
| `low` | ~12–15 | 1–2 | about one in three | a garden suburb: detached, set back, plenty of green |

**The `mix` vocabulary** is the same list of archetype names that
`params.archetype` and the building tags draw on — `office`, `townhouse`,
`shop_row`, `warehouse`, `terraced_row`, `machiya`, and the other two hundred.
A name the grammar does not know is a compile **error** (`LOAM-T210`) with the
near-misses listed, because the alternative is a district of silent cottages.
Order matters only as declaration order; the infill draws from the list by a
hash of each lot's position, so a two-entry mix does not alternate in stripes.

Rules worth knowing before you write one:

- **Landmarks are placed by frontage, not by constraints.** A landmark takes the
  lot run — or the whole block — that fits it with the least waste, biggest
  landmark first. Constraints on a district child are reported as ignored
  (`LOAM-W407`); if a building's position really matters, take it out of the
  district and give it constraints under the root.
- **You still never write coordinates.** The district's own constraints put it
  on the map; the streets and lots come from its envelope.
- Give a district `terrain_conform: "flatten"`. A district levels its ground —
  a city grid on a hillside is a staircase — and a generous `blend` (6–10) is
  what keeps the edge from being a cliff.
- The district's streets are surfaced by the same road machinery as
  `road.network@0`, so a `lanes` node routed between districts joins the grid
  rather than running alongside it. Anchor the lanes on the district's id.
- A district smaller than 38 × 38 is a `LOAM-T211` error: there is no room for
  two crossing streets and a block between them. Anything under ~100 on a side
  is one or two blocks, which reads as a courtyard rather than a quarter — below
  that scale, write the buildings out and let the solver place them.

### `city` — a whole city, planned from its arterials down

A `district` is one quarter and you author its rectangle. A **city** is the
level above: you author *ground and intent*, and the plan layer draws the
armature — a drive along the real shoreline, a spine down the long axis, a
diagonal cut across the fabric, a ring where there is room — and then takes the
**faces of that armature** as its districts.

That inversion is the whole point. Those faces are arbitrary polygons, not
rectangles: a diagonal crossing a grid leaves wedge lots and triangular corners,
a bay bends the quarter that fronts it, and each quarter's grid is turned to run
parallel to the boulevard beside it, so two neighbours meet at 15° or 45°
instead of continuing one map-wide grid. None of that is expressible as a list
of rectangles, which is why the node does not let you write one.

Reach for a city when the answer is "a city" — several square hundreds of
blocks, more than one kind of quarter, a waterfront. Keep using `district` for a
single quarter, and keep using both together: a hand-pinned `district` beside a
`city` still works exactly as it always did, and is how you say "and *this* bit
is mine".

```json
{
  "id": "harbourtown",
  "kind": "city",
  "label": "a coastal city on the bay, cut by a diagonal boulevard",
  "envelope": { "shape": "region", "size": [440, 400] },
  "params": {
    "size": "large",
    "coastal": true,
    "diagonals": 1,
    "mix": ["office", "apartment_block", "shop_row", "townhouse", "convenience_store"],
    "characters": {
      "core": ["office", "hotel", "department_store"],
      "industrial": ["warehouse", "granary", "machine_shop"],
      "waterfront": ["shop_row", "apartment_block", "food_court"],
      "lanes": ["townhouse", "cottage", "shop_row"]
    }
  },
  "tags": ["city", "urban"],
  "children": [
    {
      "id": "spire_one",
      "kind": "generator",
      "generator": "building.grammar@0",
      "label": "the tallest tower on the skyline",
      "envelope": { "shape": "box", "size": [21, 78, 19] },
      "params": { "archetype": "skyscraper", "floors": 18 },
      "ports": { "door": { "type": "door", "face": "south", "tags": ["primary"] } },
      "tags": ["landmark"]
    }
  ]
}
```

| field | values | notes |
|---|---|---|
| `envelope` | `{"shape": "region", "size": [x, z]}` | **required**; 200 × 200 is the hard floor (`LOAM-T214`), 350+ before the armature has room to be interesting |
| `params.size` | `small`, `medium`, `large` | **required**; how much armature gets drawn, and how many industrial quarters |
| `params.mix` | non-empty array of archetype names | **required**; what a quarter builds from unless `characters` names it |
| `params.characters` | object keyed by character | optional per-quarter mixes; keys are the eight characters below. An unknown key is an error (`LOAM-T213`) |
| `params.coastal` | bool | optional; omit for "coastal if the ground is". `true` on dry ground gets a note, not a failure |
| `params.diagonals` | 0..2 | optional; the default is 1, or 2 for a `large` city |
| `params.ring` | bool | optional; the default is "if the footprint is at least 260 on its short axis" |
| `params.blockSize` | 16..96 | optional hint, scaled per character — 40 is the number the table is written against |
| `params.setPieces` | bool, or `{ max, kinds }` | optional; the anchors (below). Omit for "seat what the ground offers", which is the intended default |
| `params.walls` | object | optional: ring the finished city with a wall. See **Walls** below |
| `constraints` | as any other node | say **where the city is**. It is allowed to straddle the waterline; nothing else but a harbour is |
| `children` | `building.grammar@0` nodes | the landmarks, spread across the quarters that carry the skyline |

**The eight characters.** Every cell of the plan gets one, from *where it is and
what its ground is like* — never from a draw, because a park in the middle of
downtown is exactly the flavour of wrongness that reads as generated:

| character | how a cell gets it | what it builds |
|---|---|---|
| `park` | the ground made it steep, or the diagonal left it an awkward wedge | nothing: open ground for the treatment pass |
| `core` | the biggest cell near the middle | the densest blocks, a square, the tallest landmarks |
| `industrial` | out on the edge, away from the middle; by the water if it can be | big blocks, medium density |
| `waterfront` | its frontage is on the water | an organic skeleton, medium density |
| `civic` | the biggest cell still unspoken for | large blocks, a square |
| `lanes` | small, or crooked | an organic skeleton at the tightest spacing |
| `grid` | ordinary, near the middle | the plain dense grid |
| `rowhouse` | ordinary, further out | tight blocks, high density |

Rules worth knowing before you write one:

- **You cannot enumerate the quarters, and that is deliberate.** There is no key
  that names a district, a street or a coordinate. A plan you list out is the
  rectangle problem again with more typing. Pin what you actually care about
  with a `district` node beside the city.
- **Do not give a city `terrain_conform: "flatten"`.** A district levels its
  ground; a city must not, or it would raise the sea bed inside its own bay and
  bulldoze the shoreline its drive was going to follow. Each *quarter* levels
  itself to one terrace and the boulevards ramp between them, which is how a
  city steps down a hill.
- **Landmarks go where they fit.** The biggest landmark goes to the
  highest-ranked quarter whose *blocks* can hold it — core, then civic, then the
  waterfront — and the rest are spread out so the skyline peaks in more than one
  place. A landmark too big for any quarter is a `LOAM-E170` warning; give it a
  smaller envelope or raise `params.blockSize`.
- **Precinct kits inside a city are parsed and not yet laid.** A
  `precinct.harbour@0` or `precinct.airport@0` written as a child of a city
  validates and reports a `LOAM-T208` note. Write it as a **sibling** of the
  city instead, with a `distance` constraint to keep it beside the right edge —
  that is what every shipped world does and the solver scores the shore for it.
- Anchor a `road.network@0` on the city's id to bring lanes in from outside; the
  arterials and the quarter streets are surfaced by the same road machinery, so
  a lane arriving from the next settlement joins the boulevard rather than
  running alongside it.

#### `walls` — ringing a settlement (`infra.wall@0`)

Write `"walls": {}` on a `district` or a `city` and the compiler puts a wall
round it. That is the entire authoring surface, and the omission is the point:
**you do not write the course.** The line is derived after everything is built,
from the footprint the settlement actually took — a hull round the buildings,
pushed out by the margin, with every segment on a multiple of 15° — and then
swept over the real ground, so it steps down a hillside instead of hovering
over it. There is no key that takes a coordinate, a vertex or a length, for the
same reason a `city` has no key that names a quarter.

```json
{
  "id": "old_town",
  "kind": "district",
  "envelope": { "shape": "region", "size": [120, 120] },
  "params": {
    "fabric": "organic",
    "density": "medium",
    "mix": ["cottage", "shop_row", "smithy"],
    "walls": { "style": "masonry", "margin": 10, "towerPitch": 40, "height": 6 }
  },
  "constraints": [{ "zone": "center" }]
}
```

| field | values | notes |
|---|---|---|
| `style` | `masonry`, `palisade`, `earthwork` | default `masonry`. Three constructions, not three palettes: a stone curtain, a timber palisade, a revetted rampart |
| `margin` | 4..64 | default 10; columns the ring stands **outward** of the built ground. Raise it if the wall comes out mostly gaps |
| `towerPitch` | 16..128 | default 40; columns of wall between towers. Towers also land on every corner of the course, always |
| `height` | 4..14 | default 6; blocks from the ground to the wall-walk |
| `gates` | bool | default `true`. `false` is a siege wall: the roads are cut |

Rules worth knowing:

- **Gates are found, not placed.** Wherever a lane or a boulevard already
  crosses the derived course, the wall opens: the carriageway keeps its own
  surface, the wall writes nothing in it, and a pair of towers flanks the
  opening. So the way to get a gate somewhere is to **run a road there** —
  anchor a `road.network@0` on the settlement's id from something outside it.
  A walled settlement with no roads reaching it gets a wall with no gates,
  which is exactly what it asked for.
- **Put the wall on the thing that has fabric.** A `district` or a `city` has a
  footprint made of buildings and streets; a loose scatter of
  `building.grammar@0` nodes under the root does not, so `walls` lives on those
  two node kinds only.
- **Leave the ring room.** The course is refused whole (`LOAM-T220`, a note)
  when the offset ring would fall outside the world region — so a district
  pressed against the edge of a small world gets no wall. Give the root a
  bigger envelope or move the district inward.
- The wall-walk is **walkable end to end by construction**: the crest steps by
  at most one block per column, so there is no riser you have to jump.

#### Set pieces and vista axes

Everything above makes *fabric*. What makes a city read as **intended** rather
than generated is a handful of things placed for their relationship to the plan:
a boulevard that ends on something, a bridge that is an event rather than a
crossing, a stair up a bank you otherwise could not climb.

The plan seats three to six of these on its own, and you do not have to ask. Per
city it looks for one of each of five kinds, best first:

| kind | where it goes | what gets built |
|---|---|---|
| `landmark` | on a **vista axis**: the end of an arterial with a long straight approach and dry, level ground to reserve | a building squared to the axis, so its facade closes the view of everyone walking down the road. Yours if you pinned one, otherwise a cathedral / station / opera house / university hall / courthouse from a per-city rotation |
| `bridge` | where an arterial already crosses water | masonry pylons at both abutments, lamps down the span on the deck's own rail, and a balustrade carrying the rail line onto the bank |
| `promenade` | the longest run of shoreline drive with the water on **one** side | a sea wall, lamps at a pitch, benches facing the water |
| `stair` | the steepest climbable bank inside the city | a paved flight with a balustrade and lanterns, laid so no riser on it is more than one block |
| `square` | the middle of the civic (or core, or grid) quarter | a 27 × 27 void **held open before the quarter is subdivided**, with a lamp inset from each corner and a monument on a plinth at the centre |

A kind is skipped when the ground does not offer it, and that is the normal
case: a flat inland city gets no stair, promenade or bridge, and says so by
simply not having them.

<!-- kit:skeleton -->
```json
{
  "params": {
    "size": "large",
    "mix": ["office", "apartment_block", "shop_row"],
    "setPieces": { "max": 4, "kinds": ["landmark", "bridge", "square"] }
  }
}
```

| field | values | notes |
|---|---|---|
| `setPieces` | `false` | no anchors at all for this city |
| `setPieces` | `true`, or omitted | the default: up to six, every kind considered |
| `setPieces.max` | 1..6 | cap across all kinds together. Past six a city stops having anchors and starts having furniture (`LOAM-T215`) |
| `setPieces.kinds` | non-empty array from the five above | a filter, not a weighting: listing a kind twice is an error (`LOAM-T215`) |

**"Put the cathedral at the end of the main boulevard."** That is
`params.vista` on a landmark inside the city, and it is the only way to address
a set piece by hand:

```json
{
  "id": "the_minster",
  "kind": "generator",
  "generator": "building.grammar@0",
  "envelope": { "shape": "box", "size": [15, 17, 21] },
  "params": { "archetype": "cathedral", "floors": 2, "vista": "spine" },
  "ports": { "door": { "type": "door", "face": "south", "tags": ["primary"] } },
  "tags": ["landmark"]
}
```

| `params.vista` | meaning |
|---|---|
| omitted / `false` | an ordinary landmark: spread into a quarter with the others |
| `true` | seat it on whichever vista axis the plan rates highest |
| `"spine"`, `"boulevard"`, `"diagonal"`, `"drive"` | seat it at the end of an arterial of that kind |

Notice that neither spelling names a coordinate — the same rule the rest of the
node is written under. Things worth knowing:

- **You always win.** A pinned landmark is offered every axis before the plan
  chooses a building for any of them, so the plan never competes with you for a
  street. Two pins take two different axes, in document order.
- **`"vista": "ring"` is an error** (`LOAM-T216`): a ring road is a closed loop,
  so it has no end to stand at and look down.
- **`vista` only means something inside a `city`** (`LOAM-T216`). A district or
  a root-level building has no arterials, so nothing would ever read it.
- **A landmark too big for any axis is not dropped** — it falls back into the
  ordinary distribution and reports `LOAM-T217`. The reserve is at most 30
  blocks along the axis and 31 across, so a footprint inside about 21 × 15 is
  comfortable; the five archetypes the plan picks from are all in that range.
- **The facade squares to the axis, not to the heading.** Arterial headings are
  quantised to 15° and buildings rotate in quarter turns, so the facade takes
  the *nearest cardinal*. A boulevard at 75° drifts across the frame as you walk
  it; the plan only keeps an axis whose site is still framed by the road 24
  cells out, which is what that drift is measured against.
- **The square is a hole, not a leftover.** It is punched out of the quarter's
  lot mask before the quarter is subdivided — the one moment at which a district
  can be told "not here" — so the buildings around it front onto it. Streets may
  still cross it, which is what a real civic square looks like.

### `prop.place@0`

One node per prop. A prop is what makes a village look lived in — three or four
is usually enough. It takes `params` and nothing else that matters: no
constraints drive it, and it is placed by a spiral search out from a coarse
target, skipping anything already built.

| prop | size (x, y, z) | base | notable params |
|---|---|---|---|
| `rowboat` | 5×3×3 | water | `at: "pier"` |
| `fishing_sloop` | 9×8×4 | water | `at: "pier"` |
| `pier` | `width`×4×`length` (2×4×8) | shore — a dry column with water within reach | `length` 3..32, `width` 1..5; publishes an anchor at its seaward end |
| `cart` | 4×3×3 | ground | — |
| `covered_wagon` | 4×5×3 | ground | — |
| `rail_line` | `length`×(5+`grade`)×3, or ×6 curved | ground | `length` 5..64 (12), `curve` (false), `grade` 0..4 (0), `platform` (true) |
| `fountain` | 7×5×7 | ground | — |
| `gazebo` | 7×6×7 | ground | — |
| `statue_plinth` | 3×5×3 | ground | — |
| `airliner` | 52×19×35 | ground, flat | the large one: swept wing, engines, airstair at the fore door |
| `cargo_plane` | 40×21×29 | ground, flat | high wing, four turboprops, rear ramp down to the apron |
| `biplane` | 14×8×15 | ground | — |
| `light_plane` | 12×7×13 | ground | — |
| `airship` | 41×17×13 | ground | ellipsoid envelope on a rigging frame, gondola beneath |
| `zeppelin_mast` | 7×20×7 | ground | the mast an `airship` is moored to; place both |
| `hangar` | 25×14×19 | ground, flat | barrel vault, open across the whole `z = 0` end |
| `runway` | `length`×2×9 | ground, flat | `length` 12..64 (32); a repeatable strip — place several in a line |
| `longship` | 20×10×5 | water | clinker sides, oars, one square sail |
| `cog` | 24×16×9 | water | fore and aft castles, one mast |
| `caravel` | 30×17×9 | water | two masts, lateen canvas |
| `galleon` | 46×31×13 | water | the large one: three masts, gunports, stern gallery, bowsprit |
| `yacht` | 22×10×7 | water | quartz hull, glazed saloon, radar |
| `speedboat` | 8×4×5 | water | — |
| `ferry` | 25×10×11 | water | car deck, bow ramp, wheelhouse |
| `tugboat` | 12×10×7 | water | — |
| `fishing_trawler` | 18×12×7 | water | booms and nets |
| `drydock` | `length`×8×15 | ground, flat | `length` 16..64 (34); an open cradle a hull sits in |
| `buoy` | 3×5×3 | water | the smallest thing that floats |
| `locomotive` | 22×12×7 | ground, flat | tank engine; carries its own ballast and rail, so it needs no `rail_line` under it |
| `passenger_car` | 20×9×7 | ground, flat | walkable: stair benches either side of the aisle, roof walk |
| `freight_car` | 16×6×7 | ground, flat | open-top gondola wagon with a seeded load |
| `caboose` | 14×11×7 | ground, flat | cupola, fenced end platforms, stove pipe |
| `junk` | 26×21×9 | water | three battened lugsails, two-stage poop |
| `gondola` | 15×7×3 | water | the narrowest hull there is; ferro at the stem |
| `barge` | 24×8×9 | water | open hold rows, tiller hut aft |
| `paddle_steamer` | 28×14×11 | water | side paddle boxes, twin stacks, promenade rails |
| `container_ship` | 46×18×13 | water | the modern giant, at the galleon's extents — needs the same basin |
| `hot_air_balloon` | 11×20×11 | ground | moored: the envelope is carried on a mast down to the basket and the ground |
| `seaplane` | 15×10×15 | ground | the light aeroplane on floats; beached rather than afloat |
| `glider` | 18×8×25 | ground, flat | span 25 — wider than it is long; one wingtip rests on the grass |

**Street furniture, yards and camps.** These are the cheap, small things that
make a place look inhabited; scatter three or four of the little ones around a
plaza rather than one big one.

| prop | size (x, y, z) | base | notable params |
|---|---|---|---|
| `bench` | 4×2×1 | ground | — |
| `planter` | 3×2×3 | ground | — |
| `clothesline` | 7×3×1 | ground | — |
| `scarecrow` | 3×4×1 | ground | for a field edge |
| `market_barrow` | 3×3×2 | ground | — |
| `signpost` | 3×4×1 | ground | — |
| `cairn` | 5×4×5 | ground | a wayside pile of stones |
| `tent` | 5×4×5 | ground | one tent; place several for a camp |
| `caravan` | 5×6×3 | ground | — |
| `campsite` | 19×6×13 | ground, flat | tents, a fire, a woodpile — a whole camp in one node |
| `treehouse` | 9×17×9 | ground | grows its own trunk; needs headroom, not a tree |
| `graveyard` | 15×6×13 | ground, flat | fenced yard, varied headstones, a corner mausoleum |
| `swimming_pool` | 13×7×9, sunk 4 | ground, flat | the basin is dug 4 below grade |
| `carousel` | 11×7×11 | ground, flat | — |
| `fairground_stall` | 5×6×3 | ground | a striped stall: counter, prize shelf, awning |
| `ticket_booth` | 3×5×3 | ground | a one-cell kiosk with a window and a till |
| `prize_wheel` | 1×10×7 | ground | one block thick — face it across the midway |
| `swing_boats` | 7×7×3 | ground | two boats hung from an A-frame crossbar |
| `curtain_wall` | `length`×6×3 | ground | `length` 6..64 (16); a repeatable rampart run — place several end to end, with a `gatehouse` building for the gate |
| `well_head` | 3×6×3 | ground | roofed well, windlass and bucket; the water is a cauldron, so it never leaks |
| `notice_board` | 3×4×2 | ground | posts, board and a sheet of notices under a small roof |
| `hitching_post` | 4×3×1 | ground | post, rail and iron rings — put it outside an inn or a stable |
| `horse_trough` | 4×2×3 | ground | a filled stone trough; pairs with `hitching_post` |
| `lamp_post` | 3×7×3 | ground | two hung lanterns and one standing — the cheapest way to light a lane |
| `litter_bin` | 2×3×2 | ground | composter and barrel on a paved corner |
| `drinking_fountain` | 3×4×3 | ground | pedestal, basin and spout |
| `flagpole` | 3×9×3 | ground | banner colour drawn from the node seed |
| `bollard_row` | `length`×2×1 | ground | `length` 5..33 (9); a kerb run, always terminated at both ends |
| `sandwich_board` | 2×2×2 | ground | the smallest prop there is — an A-frame outside a shop |
| `dog_kennel` | 3×5×3 | ground | box, doorway, bowl and a name banner on the ridge |
| `log_pile` | 5×3×3 | ground | stacked firewood between chocks; good against a wall or a woodshed |
| `bus_shelter` | 5×5×3 | ground | three sides of glass, a slab roof, a bench and a route banner |
| `phone_box` | 1×7×1 | ground | the narrowest prop there is — a red kiosk you read by its silhouette |
| `mailbox` | 1×5×2 | ground | post, iron-trimmed head and a slot; scatter these along a street |
| `bicycle_rack` | 5×3×2 | ground | three low hoops on a paved strip |
| `shop_awning` | 5×4×3 | ground | a striped canopy on two posts — no counter, so it is not a stall |
| `milestone` | 3×4×3 | ground | a carved waypost on a mossy plinth; put one where two roads meet |
| `bus_stop` | 3×5×2 | ground | pole, flag, timetable and a bench — line a road with them |
| `stagecoach` | 7×7×3 | ground | enclosed coach on four wheels, driver's box, luggage rail and drawbar |
| `yurt` | 7×6×7 | ground, flat | round wool tent with a stove and a smoke hole; a camp of these reads nomadic |
| `helter_skelter` | 7×12×7 | ground, flat | the fair's tallest piece — a slide spiralling down a striped tower |
| `midway_arch` | 9×7×3 | ground | the gate into a fair; put the other amusements behind it |
| `shooting_gallery` | 7×6×3 | ground | counter, three targets, prize shelf and a striped canopy |
| `standing_stones` | 11×6×11 | ground, flat | a ring of megalith **pairs** on a turf pad, with a low altar at the centre |
| `henge` | 17×7×17 | ground, flat | the big one: a banked earth rim and eight trilithons (two posts and a lintel) |
| `monolith` | 5×9×5 | ground | one great banded stone that **leans**, read as offset courses |
| `burial_mound` | 11×6×11 | ground, flat | a sod dome with a stone doorway *read* — there is no way in, on purpose |
| `dig_site` | 11×4×9 | ground, flat | a roped trench as a shallow recolour, a finds table and a spoil heap |
| `fossil_dig` | 11×4×9 | ground, flat | the dig site with bone-block ribs half-exposed in the bed |
| `shattered_obelisk` | 11×7×5 | ground, flat | a ragged stump, the fallen upper section lying beside it, and a scatter |
| `ferris_wheel` | 3×16×13 | ground, flat | the fair's landmark — two A-frames, a log axle, a rim on axis spokes and four gondolas hung on bar links; **no centre post**, because at this diameter the rim's own bottom lands in that column |
| `bandstand` | 9×10×9 | ground, flat | an open octagonal stand: paved pad, log pillars, a fence rail with one arc left open as the way in, a stepped cone on a solid finial |
| `memorial_garden` | 9×5×9 | ground, flat | compound: a cross path, four hedged and planted beds, a slab-capped monument with a carpet wreath, two benches and a low wall |
| `portal_frame` | 4×6×3 | ground | an obsidian and crying-obsidian rectangle with a keystone and a **deliberately empty** interior — no portal block — over four rune pedestals |
| `floating_platform` | 7×8×7 | ground | reads as a floating island and is not: a one-column end-stone stem veiled in iron bars carries a disc that oversails it by three cells every way |
| `houseboat` | 17×9×9 | **water** | a moored home barge on the hull template: glazed cabin amidships, slab roof with a chimney and planters, a fore-deck table, a railed after-deck and bar moorings |
| `helipad` | 9×5×9 | ground | a marked concrete disc — white ring, a painted H, four edge lanterns and a corner mast with a windsock |

**Base** is a hard requirement, not a preference: a `water` prop needs open
water to sit on, a `shore` prop needs dry land with water in front of it. Ask
for a rowboat in a landlocked hamlet and the prop is dropped.

**A big prop needs big flat ground, and it will not make its own.** A prop has
no `terrain_conform` — the spiral search either finds a patch level enough for
its whole footprint or gives up. Anything marked *flat* above (a `galleon` is
46 long, a `campsite` 19, an `airliner` 52) wants a `plateau` edit under it or
a genuinely flat shore. When in doubt put the big prop where the terrain is
already flat and use the small ones everywhere else.

Placement is the profile's usual coarse vocabulary. `{"zone": "south"}` aims at
a nine-grid cell, jittered by `jitter` (0..1, default 0.15). `yaw` is `0`,
`90`, `180` or `270`; omit it and it is drawn from the node seed — except on a
pier, whose yaw is the direction the water is in and not a matter of taste.
`{"at": {"x": …, "z": …}}` is an absolute-column escape hatch: prefer `zone`.
`"on": "water"` / `"ground"` forces which surface the search will accept.

**The `at: "pier"` idiom.** Document order matters in exactly one place: a
`pier` placed *earlier* becomes an anchor a later boat moors to, so a boat with
`"at": "pier"` targets the seaward end of the nearest pier already placed. Give
the pier first.

```json
[
  {
    "id": "stone_quay",
    "kind": "generator",
    "generator": "prop.place@0",
    "params": { "prop": "pier", "zone": "north", "length": 10, "width": 2 }
  },
  {
    "id": "moored_boat",
    "kind": "generator",
    "generator": "prop.place@0",
    "params": { "prop": "rowboat", "at": "pier" }
  }
]
```

---

## 9d. `intent` — saying what kind of place this is

Everything above says *what to build*. `intent` says **what kind of place it
is**, once, and the compiler fans it out to the knobs that would otherwise have
to be set by hand on every node: materials, roof forms, block size, street
width, ornament, wear, ruin coverage, biome and snow.

It is not a generator and it places nothing. **Every dial is optional, and
leaving one out means "no opinion", which is never the same as `0`.** A
document with no `intent` compiles exactly as it always did.

`intent` is legal in exactly three places:

- at the **top level** of the document, beside `style` — world scope;
- on the **root composite**;
- on a **`district`** or **`city`** node — region scope.

Written on a building, a prop or a terrain generator it is ignored with a
warning. Per-building overrides are what `params` are for.

### The dials

| key | value | what it drives |
|---|---|---|
| `era` | free word, dispatched through an alias table to one of the era classes `primitive` / `ancient` / `medieval` / `early_modern` / `industrial` / `modern` / `far_future`. Known aliases include `"victorian"`, `"pirate"`, `"fantasy"`, `"steampunk"`, `"wild_west"`, `"cyberpunk"`, `"prehistoric"`. A word the table does not know draws a warning and falls back to `medieval` — when in doubt, write the class name itself | material theme, roof form, prop and vehicle family, road materials |
| `wealth` | 0..1 — 0 destitute, 0.5 ordinary, 1 rich | block and lot size, street width, facade ornament, storeys, ground treatment |
| `decline` | 0..1 — 0 kept up, 1 abandoned | ruin coverage, road wear, vegetation reclaim. **Orthogonal to wealth: a rich ruin exists.** |
| `formality` | 0..1 — 0 organic lanes, 1 planned and monumental | district fabric (`organic` vs `grid`), block-size variance, plaza and axis strength |
| `event` | `{ "kind": "flood"\|"fire"\|"siege"\|"boom", "severity": 0..1, "recency": 0..1 }` | dressing for a one-off event. `recency` 0 = happening now, 1 = a lifetime ago |
| `climate` | `{ "biome": "minecraft:<id>", "temperature": -1..1, "humidity": -1..1, "snow": "auto"\|"never"\|"always" }` | outranks the terrain's own climate over this scope. Fixes "snow on half the town" |
| `character` | see below | everything that makes a *region* read as a different place |
| `tokens` | flat bag of strings/numbers/booleans | anything else worth recording; nothing switches on it |

`era` is an **open** vocabulary — use the word the prompt uses. It is dispatched
internally to one of `primitive`, `ancient`, `medieval`, `renaissance`,
`industrial`, `modern`, `far_future`; a word we do not recognise falls back to
`medieval` with a warning and still reaches the rest of the pipeline.

### `character` — how two regions differ

This is the part that matters most, because it is the only way to make **one
world hold two places that read differently**.

| key | value |
|---|---|
| `label` | free text: `"pirate haven"`, `"unicorn glade"` |
| `materialTheme` | one of exactly these ids — `temperate_timber`, `boreal_pine`, `birchwood_downs`, `modern_city`, `white_quartz` — when the prompt names a material world. No other value exists; an unknown id is ignored with a warning |
| `palettes` | palette symbol overrides, merged over `style.palettes` in this subtree |
| `archetypes` | `{ "prefer": [...], "forbid": [...], "weights": { "cottage": 3 } }` |
| `props` / `flora` | `{ "prefer": [...], "forbid": [...] }` — ids, never phrases; see the vocabulary below |
| `motifs` | `{ "roofType": "gable"\|"hip"\|"flat"\|"dome"\|"shed"\|"mansard", "massing": "blocky"\|"stepped"\|"towered"\|"sprawling", "windowRhythm": "sparse"\|"regular"\|"dense"\|"banded", "ornamentDensity": 0..1 }` |

### The three list vocabularies

`archetypes`, `props` and `flora` are matched against the **real registries**.
An entry that matches nothing is dropped, and the compile says so — one
aggregated warning per list naming what it could not place (`LOAM-W483`,
`LOAM-W485`, `LOAM-W486`). A phrase like `"moored pirate ships"` or
`"pastel meadows"` grounds nowhere and changes nothing: put prose in `tokens`,
and put ids in these lists.

- **`archetypes`** — structure catalog ids, the same names `params.mix` takes:
  `cottage`, `farmhouse`, `townhouse`, `terrace`, `manor_house`, `hall`, `inn`,
  `tavern`, `chapel`, `church`, `warehouse`, `workshop`, `smithy`,
  `watchtower`, `bastion`, `lighthouse`, `windmill`, `market_hall`, … Run
  `terrainist catalog` for the full list.
- **`props`** — prop catalog ids: `fountain`, `gazebo`, `cart`,
  `covered_wagon`, `stagecoach`, `market_barrow`, `well_head`, `notice_board`,
  `standing_stones`, `henge`, `monolith`, `cairn`, `bench`, `planter`,
  `lamp_post`, `pier`, `rowboat`, `fishing_sloop`, `caravel`, `galleon`,
  `junk`, `longship`, `bicycle_rack`, `floating_platform`, … Run
  `terrainist catalog --category prop` for the full list. The first `prefer`
  entry the catalog carries becomes the region's street-furniture headliner.
- **`flora`** — tree shapes, and there are exactly four: `spruce_tall`,
  `spruce_squat`, `oak_round`, `birch_slim`.

`materialTheme` is grounded the same way, with a small alias table in front of
it: `"quartz"`, `"marble"`, `"crystal"` reach `white_quartz`; `"timber"`,
`"half-timbered"` reach `temperate_timber`; `"weathered"`, `"driftwood"`,
`"pine"` reach `boreal_pine`; `"birch"` reaches `birchwood_downs`;
`"concrete"`, `"glass"`, `"steel"` reach `modern_city`. Anything else is a
`LOAM-W484` warning and the settlement keeps its seeded draw.

### Inheritance

A district or city **inherits** the world's intent and overrides only what
differs:

- a scalar replaces (`wealth` at the district wins over `wealth` at the world);
- an object merges key by key (a district may set `character.motifs` and keep
  the world's `character.materialTheme`);
- **an array replaces whole** — a district's `"prefer": ["chapel"]` does *not*
  accumulate with the world's, which is what makes "no oak on this island"
  expressible.

### Two regions in one world

When the prompt describes two places that should feel like enemies, write **two
regions, each with its own `character`.** This is the whole point of the layer;
a world where both islands drew the same theme from the same seed is the bug it
exists to fix.

```json
{
  "intent": { "era": "fantasy", "formality": 0.3 },
  "children": [
    {
      "id": "unicorn_isle",
      "kind": "district",
      "envelope": { "shape": "region", "size": [120, 120] },
      "constraints": [{ "zone": "northwest" }],
      "params": { "fabric": "organic", "density": "low", "mix": ["cottage", "chapel"] },
      "intent": {
        "wealth": 0.8,
        "decline": 0.0,
        "climate": { "temperature": 0.2, "snow": "never" },
        "character": {
          "label": "magical unicorn island",
          "palettes": { "ground.grass": "minecraft:moss_block" },
          "archetypes": { "prefer": ["chapel", "cottage"], "forbid": ["warehouse"] },
          "motifs": { "roofType": "dome", "ornamentDensity": 0.9 }
        }
      }
    },
    {
      "id": "pirate_isle",
      "kind": "district",
      "envelope": { "shape": "region", "size": [120, 120] },
      "constraints": [{ "zone": "southeast" }],
      "params": { "fabric": "organic", "density": "medium", "mix": ["cottage", "warehouse"] },
      "intent": {
        "era": "pirate",
        "wealth": 0.25,
        "decline": 0.6,
        "character": {
          "label": "grumpy pirate island",
          "palettes": { "ground.grass": "minecraft:coarse_dirt" },
          "archetypes": { "prefer": ["warehouse", "cottage"], "forbid": ["chapel"] },
          "motifs": { "roofType": "shed", "ornamentDensity": 0.1 }
        }
      }
    }
  ]
}
```

Both islands inherit `era: "fantasy"` and `formality: 0.3` from the world; the
pirates override `era`, both override `wealth`, `decline` and the whole
`character` block, and the two quarters come out of the compiler with different
materials, roofs, ornament, wear and ground. **If the prompt names two places,
two `character` blocks is the correct answer — never one.**

---

## 10. Constraints

A constraint is one JSON object in a node's `constraints` array. The shorthand
form — the type name as the key, its primary argument as the value — is the
one to use: `{"zone": "center"}`, `{"distance": "plaza", "min": 8}`.

These are the ones some pass of the compiler acts on. Anything else in the Loam
registry parses and is *ignored* with a `LOAM-W407` warning, so stick to these:

| constraint | example | what it does |
|---|---|---|
| `zone` | `{"zone": "north"}` | pull the node toward a nine-grid cell (soft) |
| `at` | `{"at": [0.4, 0.6]}` | pull it toward a fractional point (soft) |
| `adjacent_to` | `{"adjacent_to": "plaza", "gap": [1, 8]}` | keep its nearest face 1–8 blocks from the target |
| `distance` | `{"distance": "#tag:house", "min": 6, "max": 60}` | a separation band from a node or tag set |
| `facing` | `{"facing": "plaza"}` | turn its front (its `door` port) toward the target |
| `clearance` | `{"clearance": 2}` | blocks of empty space kept around it |
| `not_overlapping` | `{"not_overlapping": "#tag:house", "margin": 2}` | never needed explicitly — placement never overlaps anyway |
| `terrain_conform` | `{"terrain_conform": "cut_fill", "reference": "median", "blend": 4}` | level the ground under the footprint |
| `on` | `{"on": "@terrain:coastline", "band": 24}` | restrict placement to a terrain product — see below |
| `along` | `{"along": "lanes", "offset": [1, 4], "faceRoad": true}` | line the node up on a route corridor |
| `beside` | `{"beside": "the_river", "offset": [4, 12]}` | `along` with a wider band and no facing |
| `connected` | `{"connected": "great_hall", "via": "tunnel"}` | dig a gallery between two cellars — see below |

### `on` — build on a terrain feature

`{"on": "<target>"}` restricts a node to a derived terrain product. Exactly
three targets resolve, and all three are derived from the terrain you already
wrote — you never author them:

| target | what it is |
|---|---|
| `@terrain:coastline` | the finished ocean mask's shore |
| `@terrain:ridge` | every `terrain.edit@0` running the `ridge` verb |
| `@terrain:peak` | the summit marker each `peak` / `volcano` edit emits |

Extra fields: `band` (1..512 blocks, how far from the feature counts as "on
it"), `partial` (0..1, how much of the footprint must be inside), `side`
(`left`/`right`/`any`). Any other target — a node id, `volcano#rim` — is legal
v0.2 but resolves to **no restriction at all** here, with a warning. So a
lighthouse is `{"on": "@terrain:coastline", "band": 20}`, a beacon is
`{"on": "@terrain:peak"}`, and a wall along a spur is `{"on": "@terrain:ridge"}`.

### `along` / `beside` — line things up on a road or a river

`{"along": "<target>"}` binds a building to a **route corridor**: the solver
reserves the corridor, costs the lateral offset, and orients the footprint to
the line. `beside` is the same constraint with a wider default band and no
road-facing — use it for "near the river", `along` for "on the high street".

The target must be something **linear that exists before placement**:

- a `road.network@0` node's id (`{"along": "lanes"}`), or
- a `terrain.edit@0` running a course verb — `ridge`, `valley`, `river`
  (`{"beside": "mill_race"}`).

Pointing it at a building or the plaza is the mistake authors actually make,
and it buys you nothing: no corridor, no cost, no placement change.

| field | value |
|---|---|
| `offset` | blocks from the corridor edge, or `[near, far]` |
| `side` | `left`, `right`, `any` — which side, in the line's direction of travel |
| `faceRoad` | bool; turn the front toward the line (`along` only, in practice) |
| `at` | `0.5`, or `[0.2, 0.4]` — normalized position along the run |
| `spacing` | parses, **not enforced**; use `clearance` for sibling separation |

**Honest limit: a corridor is a preference, not a kerb.** The lane the author
pictures is drawn by the road router in a much later pass, after placement is
frozen. `along` gets the buildings into a believable ribbon on the reserved
corridor; it does not guarantee the finished road runs exactly down the middle
of it, and it never moves a road to meet a house. Combine it with a
`distance`/`adjacent_to` on the plaza if the position really matters.

Notes that matter:

- **Every building needs a `terrain_conform`.** `"cut_fill"` (with
  `"reference": "median"`, `"blend"` 3–5) is right for a house: it cuts the
  high side and fills the low. `"flatten"` is for a plaza or a tower pad. Add
  `"maxSlope": 26..34` to refuse ground steeper than that.
- Selectors are a sibling `id` (`"plaza"`) or a tag set (`"#tag:house"`).
- `distance` measures between centres by default; add `"measure": "surface"`
  for face-to-face.
- Add `"strength": "soft"` to anything you would rather have than insist on.
  A soft constraint costs the solver score; a hard one it must satisfy or climb
  the relaxation ladder (demote → drop → place-least-bad), and every rung is
  reported back.
- Too many hard constraints on one node is the usual cause of a demotion
  warning. Three or four per building is plenty.

### Tunnels and cellars

`{"connected": "<sibling id>", "via": "tunnel"}` on a building digs a walkable
underground gallery between that building's cellar and the target's.

```json
{
  "id": "smithy",
  "kind": "generator",
  "generator": "building.grammar@0",
  "envelope": { "shape": "box", "size": [9, 8, 9] },
  "params": { "floors": 1, "roof": "gable", "basement": { "depth": 4 } },
  "constraints": [
    { "distance": "plaza", "min": 8, "max": 50 },
    { "connected": "great_hall", "via": "tunnel" },
    { "terrain_conform": "cut_fill", "reference": "median", "blend": 4 }
  ],
  "tags": ["craft"]
}
```

- **Declare it on one side only.** `bidirectional` defaults to true, so the
  constraint reaches both ways; writing it on both buildings is *not* two
  tunnels — the pair is deduplicated and you get one gallery.
- **Both endpoints get a cellar whether or not they asked**, at the default
  depth: a tunnel that ends in a wall is worse than one you did not ask for. You
  only need `basement` when you want a cellar for its own sake or a specific
  headroom.
- The target must name **one sibling building**: a tag set, the plaza, or the
  node itself are all errors. `via` other than `"tunnel"` parses with a
  `LOAM-W407` and builds nothing (for a road between two buildings, add them
  both to `road.network@0`'s `anchors`). Optional `maxLength` warns if the route
  runs long; it is dug anyway.
- If either end was dropped, or no route clears the caves, water and
  foundations between them, you get `LOAM-E180` and no tunnel — move the two
  buildings closer or straighter.

**`basement`** has three spellings, all equivalent where they overlap:
`true` (the default 4 blocks of headroom), a bare number (`"basement": 4`,
3..5), or `{"depth": 4, "style": "crypt"}`. `false` or `0` means no cellar —
unless a tunnel implies one.

**Cellar styles** — `"basement": { "depth": 4, "style": "…" }`:

| style | what the room is |
|---|---|
| `plain` | the default: a stone shell with a barrel or two |
| `crypt` | burial niches, a coffin, cobwebs — under a mausoleum or a church |
| `vault` | iron-barred strongroom, chests, a lantern — under a hall or a bank |
| `wine_cellar` | racked barrels and bottles — under an inn |
| `mine` | a rough working: timber, rails, ore in the walls — under a mine head |
| `ossuary` | bone in the walls and in the niches, bone stacks on the floor — a crypt that ran out of room |
| `undercroft` | dry vaulted stone: a springer course round the wall, crates, a working table. Wants `"depth": 4` or 5 — at 3 the springers are dropped |
| `dungeon_room` | mossy cobble, iron bars set into the wall, straw and a cauldron. The bars are never across the way out |
| `root_cellar` | packed mud and coarse dirt, board shelves in the wall with jars and crates, sacks and a composter |
| `cistern_hall` | a boxed tank of water sunk into the floor slab, with a lit walk all round it |
| `smugglers_cove` | rough mossy cobble with the chests **hidden in the wall niches** rather than stood on the floor |
| `hermit_grotto` | natural stone in three shades: a cot, a lectern, a composter and a candle shrine |
| `sewer_network` | a brick channel with a contained water runnel sunk into the floor and slab grates over it |
| `bunker_hold` | poured concrete, bunks, a stove and stores — what `bunker_complex` digs for itself |
| `subway_platform` | tile, a rail down the platform and benches — what `subway_station` digs for itself |
| `silo_shaft` | deepslate and a copper band — what `underground_silo` digs for itself |

Two of these write **water**, and both write it the only way this compiler
ever writes a fluid: *sunk into the cellar's own floor slab*, so that beside
every water cell is the slab the cellar laid solid under the whole footprint
and beneath it is a course the style writes itself. You cannot get an open
pool in a cellar by asking for one, and that is deliberate.

The last three are named here for completeness — you may ask for them — but
their real job is to be what the three **depths archetypes** dress themselves
in. See the wave-six table below.

**Tunnel styles** — `"style"` on the `connected` constraint itself:

| style | what the gallery is |
|---|---|
| `dressed` | the default: a stone-brick gallery with lanterns |
| `mine` | rough bore, timber frames, rails, ore studding, flooded dips |
| `crypt` | mossy stone brick with burial niches along the passage (catacombs) |

`"oreChamber": true` widens a gallery into a working face near its far end. It
is only dug on a **`"style": "mine"`** tunnel; asking for one on any other
style is an error.

```json
{
  "connected": "assay_office",
  "via": "tunnel",
  "style": "mine",
  "oreChamber": true
}
```

### Ports

`ports` names the openings on a building. One `door` per building is all you
normally need; the road network and the doorstep builder both use it, and
`facing` turns it toward its target.

```json
{
  "ports": {
    "main_door": { "type": "door", "face": "south", "tags": ["primary"] },
    "approach": { "type": "road_stub", "face": "south" }
  }
}
```

`face` is `north`/`south`/`east`/`west` — node-local, and it rotates with the
yaw the solver chooses. `door` and `road_stub` are the two types that resolve;
the rest of the v0.2 port vocabulary parses with a warning and does nothing.

---

## 11. Worked settlement fragments

Each block below is a **fragment** — the `root.children` entries for one idea,
to be dropped into the skeleton of §1 beside a heightfield, a climate and a
forest.

**A walled keep compound.** The keep is the anchor; the gatehouse faces it
across the bailey; the curtain wall is placed as several runs of the
`curtain_wall` prop, because one prop is one straight rampart. Barracks and a
mausoleum fill the bailey, and the crypt under the mausoleum is a `crypt`
cellar rather than a tunnel to nowhere.

```json
[
  {
    "id": "bailey",
    "kind": "primitive",
    "label": "the bailey inside the walls",
    "envelope": { "shape": "region", "size": [30, 30] },
    "constraints": [
      { "zone": "center" },
      { "terrain_conform": "flatten", "reference": "median", "blend": 6 }
    ],
    "tags": ["plaza", "public"]
  },
  {
    "id": "the_keep",
    "kind": "generator",
    "generator": "building.grammar@0",
    "label": "the keep, square and crenellated",
    "envelope": { "shape": "box", "size": [13, 16, 13] },
    "params": { "floors": 2, "basement": { "depth": 5, "style": "vault" } },
    "constraints": [
      { "adjacent_to": "bailey", "gap": [2, 8] },
      { "facing": "bailey" },
      { "terrain_conform": "flatten", "reference": "median", "blend": 5 }
    ],
    "ports": { "door": { "type": "door", "face": "south", "tags": ["primary"] } },
    "tags": ["keep", "house"]
  },
  {
    "id": "the_gatehouse",
    "kind": "generator",
    "generator": "building.grammar@0",
    "label": "the gate through the curtain wall",
    "envelope": { "shape": "box", "size": [11, 14, 9] },
    "params": { "floors": 2 },
    "constraints": [
      { "distance": "the_keep", "min": 20, "max": 40 },
      { "facing": "bailey" },
      { "terrain_conform": "flatten", "reference": "median", "blend": 5 }
    ],
    "ports": { "door": { "type": "door", "face": "north", "tags": ["primary"] } },
    "tags": ["gatehouse"]
  },
  {
    "id": "the_barracks",
    "kind": "generator",
    "generator": "building.grammar@0",
    "envelope": { "shape": "box", "size": [13, 11, 9] },
    "params": { "floors": 2, "roof": "gable" },
    "constraints": [
      { "adjacent_to": "bailey", "gap": [1, 10] },
      { "distance": "the_keep", "min": 8 },
      { "terrain_conform": "cut_fill", "reference": "median", "blend": 4 }
    ],
    "ports": { "door": { "type": "door", "face": "west", "tags": ["primary"] } },
    "tags": ["barracks", "house"]
  },
  {
    "id": "lords_tomb",
    "kind": "generator",
    "generator": "building.grammar@0",
    "envelope": { "shape": "box", "size": [9, 8, 9] },
    "params": { "floors": 1, "basement": { "depth": 4, "style": "crypt" } },
    "constraints": [
      { "distance": "bailey", "min": 10, "max": 40 },
      { "terrain_conform": "cut_fill", "reference": "median", "blend": 4 }
    ],
    "tags": ["mausoleum"]
  },
  {
    "id": "wall_west",
    "kind": "generator",
    "generator": "prop.place@0",
    "params": { "prop": "curtain_wall", "zone": "west", "length": 32, "yaw": 90 }
  },
  {
    "id": "wall_east",
    "kind": "generator",
    "generator": "prop.place@0",
    "params": { "prop": "curtain_wall", "zone": "east", "length": 32, "yaw": 90 }
  },
  {
    "id": "ward_roads",
    "kind": "generator",
    "generator": "road.network@0",
    "params": { "anchors": ["bailey", "the_keep", "the_gatehouse", "#tag:house"], "pattern": "radial", "width": 3, "lanterns": true }
  }
]
```

**A mine head on a ridge, with a working below it.** The `mine` cellar under
the headframe and the `mine` gallery running to the assay office are the same
idea at two scales; `oreChamber` widens the far end of the gallery into a
working face. Declare the tunnel on one side only.

```json
[
  {
    "id": "pithead",
    "kind": "generator",
    "generator": "building.grammar@0",
    "label": "the headframe over the shaft",
    "envelope": { "shape": "box", "size": [9, 12, 9] },
    "params": { "floors": 1, "roof": "gable", "basement": { "depth": 5, "style": "mine" } },
    "constraints": [
      { "on": "@terrain:ridge", "band": 40 },
      { "distance": "plaza", "min": 20, "max": 90 },
      { "connected": "assay_office", "via": "tunnel", "style": "mine", "oreChamber": true },
      { "terrain_conform": "flatten", "reference": "median", "blend": 6 }
    ],
    "ports": { "door": { "type": "door", "face": "south", "tags": ["primary"] } },
    "tags": ["mine_head"]
  },
  {
    "id": "assay_office",
    "kind": "generator",
    "generator": "building.grammar@0",
    "label": "where the ore is weighed",
    "envelope": { "shape": "box", "size": [11, 8, 9] },
    "params": { "floors": 1, "roof": "gable", "windowRhythm": "sparse" },
    "constraints": [
      { "distance": "pithead", "min": 14, "max": 34 },
      { "terrain_conform": "cut_fill", "reference": "median", "blend": 4 }
    ],
    "ports": { "door": { "type": "door", "face": "north", "tags": ["primary"] } },
    "tags": ["craft"]
  },
  {
    "id": "spoil_cairn",
    "kind": "generator",
    "generator": "prop.place@0",
    "params": { "prop": "cairn", "zone": "northeast" }
  }
]
```

**A modern block.** A tall building, a pool and a gym on flat ground, with the
tower lined up on the main road. `floors × 4 + 4` is the envelope height.

```json
[
  {
    "id": "tower_block",
    "kind": "generator",
    "generator": "building.grammar@0",
    "label": "ten storeys of flats",
    "envelope": { "shape": "box", "size": [18, 44, 15] },
    "params": { "floors": 10, "roof": "flat", "windowRhythm": "dense" },
    "constraints": [
      { "along": "avenues", "offset": [2, 6], "side": "any", "faceRoad": true },
      { "distance": "plaza", "min": 12, "max": 70 },
      { "terrain_conform": "flatten", "reference": "median", "blend": 8 }
    ],
    "ports": { "door": { "type": "door", "face": "south", "tags": ["primary"] } },
    "tags": ["apartment_block", "house"]
  },
  {
    "id": "leisure_centre",
    "kind": "generator",
    "generator": "building.grammar@0",
    "envelope": { "shape": "box", "size": [13, 9, 11] },
    "params": { "floors": 1, "roof": "flat" },
    "constraints": [
      { "distance": "tower_block", "min": 10, "max": 34 },
      { "terrain_conform": "flatten", "reference": "median", "blend": 5 }
    ],
    "ports": { "door": { "type": "door", "face": "east", "tags": ["primary"] } },
    "tags": ["gym"]
  },
  {
    "id": "lido",
    "kind": "generator",
    "generator": "prop.place@0",
    "label": "the pool beside the leisure centre",
    "params": { "prop": "swimming_pool", "zone": "center", "jitter": 0.1 }
  },
  {
    "id": "avenues",
    "kind": "generator",
    "generator": "road.network@0",
    "params": { "anchors": ["plaza", "#tag:house", "leisure_centre"], "pattern": "grid", "width": 3, "lanterns": true, "lanternSpacing": 12 }
  }
]
```

**A harbour.** The pier goes first so the boats can moor to it; the galleon is
46 blocks long, so it needs open water, not a creek. A warehouse on the quay
and a lighthouse `on` the coastline finish it.

```json
[
  {
    "id": "long_pier",
    "kind": "generator",
    "generator": "prop.place@0",
    "params": { "prop": "pier", "zone": "north", "length": 16, "width": 3 }
  },
  {
    "id": "the_galleon",
    "kind": "generator",
    "generator": "prop.place@0",
    "label": "three masts at the end of the pier",
    "params": { "prop": "galleon", "at": "pier" }
  },
  {
    "id": "harbour_ferry",
    "kind": "generator",
    "generator": "prop.place@0",
    "params": { "prop": "ferry", "at": "pier" }
  },
  {
    "id": "quay_buoy",
    "kind": "generator",
    "generator": "prop.place@0",
    "params": { "prop": "buoy", "zone": "north", "jitter": 0.3 }
  },
  {
    "id": "quayside_store",
    "kind": "generator",
    "generator": "building.grammar@0",
    "envelope": { "shape": "box", "size": [13, 10, 11] },
    "params": { "floors": 1, "basement": { "depth": 4 } },
    "constraints": [
      { "on": "@terrain:coastline", "band": 26 },
      { "distance": "plaza", "min": 6, "max": 60 },
      { "terrain_conform": "cut_fill", "reference": "median", "blend": 4 }
    ],
    "ports": { "door": { "type": "door", "face": "north", "tags": ["primary"] } },
    "tags": ["warehouse"]
  },
  {
    "id": "harbour_light",
    "kind": "generator",
    "generator": "building.grammar@0",
    "optional": true,
    "envelope": { "shape": "box", "size": [7, 19, 7] },
    "params": { "floors": 2, "roof": "flat" },
    "constraints": [
      { "on": "@terrain:coastline", "band": 12 },
      { "distance": "plaza", "min": 24 },
      { "terrain_conform": "flatten", "reference": "max", "blend": 6 }
    ],
    "tags": ["lookout"]
  }
]
```

---

## 11b. Precincts

A **precinct** is a whole compound from one node: you give it an envelope and a
handful of params, and the compiler lays out the ground works, the vehicles and
the buildings inside it deterministically. Use one whenever the prompt asks for
an *installation* rather than a collection of buildings — an airfield, a port.

Why this exists: a settlement solver places buildings against each other, which
is exactly the wrong tool for a compound whose whole meaning is internal
geometry. Three aeroplanes with `near` constraints come out as three aeroplanes
on the grass at three unrelated headings. A `precinct.airport@0` comes out as an
apron with aircraft on the stands, nose out, all facing the same way, because
that is arithmetic and the kit does the arithmetic.

Both kits:

- are **structure nodes** — `"kind": "generator"`, a box `envelope`,
  `constraints`, `tags` — and the solver reserves their footprint like any
  other node's, so nothing else can land on them;
- expose a **landside road anchor** automatically. Name the precinct's id in a
  `road.network@0`'s `anchors` and the lane arrives at its gate;
- **refuse to build a partial compound.** An envelope below the kit's minimum is
  a hard error with the number to change, not a half-laid airfield;
- put their buildings through the ordinary buildings pass, so a terminal gets
  the settlement's material theme, a foundation and a doorstep like a cottage.

Do **not** also declare `prop.place@0` aircraft, ships, piers or runways for a
precinct: it places its own, and yours would compete with them for ground.

### `precinct.airport@0`

Bands run across the envelope's **short** axis from the airside edge inwards:
margin, runway, strip, taxiway, fillet, apron of stands, forecourt, terminal
frontage. The runway therefore lies on the long axis; aircraft are parked one to
a stand, nose out towards the taxiway, every one of them on the same heading;
hangars take the ends of the apron; the terminal and control tower front the
apron with their doors landside, which is where the road arrives.

| param | type | default | meaning |
| --- | --- | --- | --- |
| `stands` | integer 1–12 | `5` | Aircraft stands to cut across the apron. Fewer are cut if the frontage cannot hold them at 16 columns each. |
| `hangars` | integer 0–4 | `2` | Hangars, taken from the apron ends alternately. `0` gives the whole apron to stands. |
| `terminal` | boolean | `true` | `false` drops the terminal, the tower and the frontage band — a bare airstrip. |

Minimum envelope **120 × 80** (either way round). The aircraft drawn onto each
stand are whichever of the catalog's craft fit that stand's box, chosen from the
node's own seed — so a bigger apron gets bigger aeroplanes without you asking.

```json
{
  "id": "aerodrome",
  "kind": "generator",
  "generator": "precinct.airport@0",
  "label": "the county aerodrome",
  "envelope": { "shape": "box", "size": [140, 24, 92] },
  "params": { "stands": 4, "hangars": 2 },
  "constraints": [{ "zone": "center" }],
  "tags": ["precinct", "airfield"]
}
```

### `precinct.harbour@0`

The one node whose footprint is *meant* to straddle the waterline: the solver
lets a harbour reach below sea level and prefers a box that is part water and
mostly land, and the kit then reads the shoreline that is actually there. A
retaining course is laid along that shoreline, a quay surface behind it, piers
run out perpendicular at even spacing along the quay, and one hull is moored
alongside each pier — every ship on the same heading, parallel to the pier axes,
afloat with real water under the hull. Cranes stand on the quay, and a warehouse
and boathouse front it.

| param | type | default | meaning |
| --- | --- | --- | --- |
| `piers` | integer 1–8 | `3` | Piers run out from the quay, evenly spaced along the usable shoreline. |
| `ships` | integer 0–8 or `"fill"` | `"fill"` | Hulls moored. `"fill"` means one per pier. |

Minimum envelope **64 × 48**. Give the node a coarse `zone` on the side of the
map where the water is; the solver does the rest. If the envelope ends up with
no water in it — a landlocked map, a sea level that never floods — the compile
fails with `LOAM-E170` naming the fix, rather than building a quay facing a
field.

```json
{
  "id": "port",
  "kind": "generator",
  "generator": "precinct.harbour@0",
  "label": "the working quay, its piers and its moorings",
  "envelope": { "shape": "box", "size": [96, 16, 72] },
  "params": { "piers": 3, "ships": "fill" },
  "constraints": [{ "zone": "south" }],
  "tags": ["precinct", "harbour"]
}
```

Add `"precinct"` to every `scatter.forest@0`'s `avoidTags` when a document uses
one, so the woods stop at the fence rather than growing through the apron.


---

## 12. Composing a settlement

The lessons that cost us the most iterations:

1. **Settlements want gentle terrain.** `amplitude` 18–28, `erosionPasses` 2,
   `frequency` ≈ 0.004. Put the village on a meadow, a shelf or a shore — never
   on a ridge or a summit. If the prompt is dramatic ("a village under a
   volcano"), make the drama the *backdrop*: the cone in one zone, the houses
   on flat ground in another.
2. **A shallow `plateau` under the settlement is cheap insurance.** Radius
   80–100, height 6–8, `"profile": "rounded"`, centred where the plaza will go.
3. **Plaza first, buildings around it.** Give the plaza a `zone`; give each
   building `{"adjacent_to": "plaza", "gap": [1, 8]}` + `{"facing": "plaza"}`
   for the front rank, and `{"distance": "plaza", "min": 8, "max": 60}` +
   `{"distance": "#tag:house", "min": 6}` for the outer ring. That reads as a
   village rather than a scatter of sheds.
4. **6–10 buildings is a village.** 3–5 is a hamlet. Beyond a dozen the solver
   is packing, not composing, and the map needs to grow with it.
5. **The watchtower goes on a hill, and it is `optional: true`.** Give it a
   `zone` of its own, `{"distance": "plaza", "min": 20}` and
   `{"terrain_conform": "flatten", "reference": "max", "blend": 6}`. Lighthouses,
   beacons and shrines follow the same pattern.
6. **Zone the forests away from the settlement.** Do not try to keep trees off
   the houses by hand — a clearing is carved around the built area
   automatically, and `"avoidTags": ["structure", "road", "plaza"]` handles the
   rest. Just point the deliberate forest node at a zone the village is not in.
7. **Anything that must hold sea water ends its `course` at `"coast"`** — a
   cove, an inlet, a harbour, a river mouth. Lakes are `basin` + `"water": true`, and a
   village near either wants to be *beside* it, not on it: the solver refuses to
   build on water, so a plaza zoned onto a lake gets pushed around or dropped.
8. **`spawn` on the plaza's zone.** It is the view the world should open on.
9. **Two places in one prompt means two `intent.character` blocks** (§9d).
   Do not rely on the archetype names alone to make an enemy island read as an
   enemy island — say so, per region, and the materials, roofs, ornament and
   ground follow.
10. **One register per settlement.** A keep, a pagoda and a skyscraper in the
   same village is three prompts, not one. Pick the archetype table the prompt
   is asking for and stay in it; the shared village theme does the rest.
11. **The big archetypes want big flat ground.** A keep, a tall building, a
    campsite or a galleon all need a level patch, and none of the props make
    one. A `plateau` edit under the whole built area — radius 90–110, height
    6–8, `"profile": "rounded"` — is what makes them land.
12. **Props are cheap; use several small ones.** A bench, a planter, a
    clothesline and a signpost around the plaza read as habitation far better
    than one carousel does.

---

## 13. Complete example

Prompt: *"a lakeside hamlet of a few cottages and a smithy, birch woods on the
far shore"*.

```json
{
  "loam": "0.1",
  "profile": "settlement",
  "meta": {
    "name": "mirefoot",
    "worldSeed": 8814023,
    "prompt": "a lakeside hamlet of a few cottages and a smithy, birch woods on the far shore",
    "spawn": { "zone": "south" }
  },
  "style": { "palettes": { "road.surface": "minecraft:dirt_path" } },
  "root": {
    "id": "world",
    "kind": "composite",
    "label": "Mirefoot, on the still water",
    "envelope": { "shape": "region", "size": [288, 288] },
    "children": [
      {
        "id": "terrain", "kind": "generator", "generator": "terrain.heightfield@0",
        "label": "gentle meadow country around a hollow",
        "params": {
          "seaLevel": 63, "baseHeight": 76, "amplitude": 20, "octaves": 4,
          "frequency": 0.0040, "gain": 0.47, "erosionPasses": 2,
          "cliffThreshold": 58, "soilDepth": 4, "beachWidth": 3, "snowLineFraction": 0.95
        },
        "children": [
          { "id": "the_mere", "kind": "generator", "generator": "terrain.edit@0",
            "label": "the lake the hamlet is named for",
            "params": { "verb": "basin", "at": [0.5, 0.34], "radius": 76, "depth": 16, "water": true, "profile": "rounded" } },
          { "id": "hamlet_shelf", "kind": "generator", "generator": "terrain.edit@0",
            "label": "the flat ground south of the water",
            "params": { "verb": "plateau", "at": [0.46, 0.64], "radius": 84, "height": 6, "profile": "rounded" } },
          { "id": "north_rise", "kind": "generator", "generator": "terrain.edit@0",
            "label": "the wooded rise on the far shore",
            "params": { "verb": "ridge", "course": [[0.2, 0.14], [0.5, 0.10], [0.82, 0.16]], "width": 70, "height": 22, "profile": "rounded" } }
        ]
      },
      { "id": "climate", "kind": "generator", "generator": "terrain.climate@0",
        "params": { "forceTheme": "temperate", "temperatureFrequency": 0.0013 } },
      { "id": "green", "kind": "primitive", "label": "the little green above the shore",
        "envelope": { "shape": "region", "size": [18, 18] },
        "constraints": [ { "zone": "south" }, { "terrain_conform": "flatten", "reference": "median", "blend": 5 } ],
        "tags": ["plaza", "public"] },
      { "id": "cottage_shore", "kind": "generator", "generator": "building.grammar@0",
        "label": "the cottage closest to the water",
        "envelope": { "shape": "box", "size": [9, 8, 8] },
        "params": { "floors": 1, "roof": "gable", "windowRhythm": "regular" },
        "constraints": [ { "adjacent_to": "green", "gap": [1, 8] }, { "facing": "green" },
                         { "terrain_conform": "cut_fill", "reference": "median", "blend": 4, "maxSlope": 26 } ],
        "ports": { "door": { "type": "door", "face": "north", "tags": ["primary"] } },
        "tags": ["house"] },
      { "id": "cottage_lane", "kind": "generator", "generator": "building.grammar@0",
        "label": "a two-storey cottage on the lane",
        "envelope": { "shape": "box", "size": [9, 11, 9] },
        "params": { "floors": 2, "roof": "gable" },
        "constraints": [ { "adjacent_to": "green", "gap": [1, 10] }, { "facing": "green" },
                         { "distance": "#tag:house", "min": 6 },
                         { "terrain_conform": "cut_fill", "reference": "median", "blend": 4 } ],
        "ports": { "door": { "type": "door", "face": "west", "tags": ["primary"] } },
        "tags": ["house"] },
      { "id": "cottage_field", "kind": "generator", "generator": "building.grammar@0",
        "label": "the last cottage, out toward the fields",
        "envelope": { "shape": "box", "size": [8, 8, 8] },
        "params": { "floors": 1, "roof": "gable", "windowRhythm": "sparse" },
        "constraints": [ { "distance": "green", "min": 8, "max": 56 }, { "distance": "#tag:house", "min": 7 },
                         { "terrain_conform": "cut_fill", "reference": "median", "blend": 4 } ],
        "ports": { "door": { "type": "door", "face": "north", "tags": ["primary"] } },
        "tags": ["house"] },
      { "id": "smithy", "kind": "generator", "generator": "building.grammar@0",
        "label": "the smithy, kept a little apart",
        "envelope": { "shape": "box", "size": [9, 8, 9] },
        "params": { "floors": 1, "roof": "gable", "windowRhythm": "sparse" },
        "constraints": [ { "distance": "green", "min": 6, "max": 44 }, { "distance": "#tag:house", "min": 8 },
                         { "terrain_conform": "cut_fill", "reference": "median", "blend": 4 } ],
        "ports": { "door": { "type": "door", "face": "south", "tags": ["primary"] } },
        "tags": ["craft"] },
      { "id": "lanes", "kind": "generator", "generator": "road.network@0",
        "label": "dirt lanes from every door to the green",
        "params": { "anchors": ["green", "#tag:house", "smithy"], "pattern": "organic",
                    "width": 3, "lanterns": true, "lanternSpacing": 14 } },
      { "id": "far_birches", "kind": "generator", "generator": "scatter.forest@0",
        "label": "birch woods on the far shore",
        "params": { "area": { "zone": "north" }, "density": 0.3, "spacing": 3, "clumping": 0.45,
                    "maxSlope": 32, "elevation": [2, 90], "edgeFalloff": 12,
                    "avoidTags": ["structure", "road", "plaza"],
                    "undergrowth": { "grass": 0.4, "flowers": 0.06, "deadwood": 0.02 },
                    "species": [ { "id": "shore_birch", "weight": 3, "shape": "birch_slim" },
                                 { "id": "shore_oak", "weight": 1, "shape": "oak_round" } ] } },
      { "id": "wilderness", "kind": "generator", "generator": "scatter.forest@0",
        "label": "sparse cover everywhere else",
        "params": { "area": { "all": true }, "density": 0.05, "spacing": 4, "clumping": 0.6,
                    "maxSlope": 34, "elevation": [2, 100], "edgeFalloff": 10,
                    "avoidTags": ["structure", "road", "plaza"],
                    "species": [ { "id": "field_oak", "weight": 1, "shape": "oak_round" } ] } }
    ]
  }
}
```

---

## 14. Before you answer

- Output **only** the JSON object. No fences, no explanation.
- `"profile": "settlement"`. One heightfield, one climate, at least one forest.
- Every edit is under the heightfield and has exactly one placement key.
- Every shape param belongs to its verb.
- Every fraction is inside `[0, 1]`; north is small `fz`.
- Ids are lowercase, meaningful, unique among siblings.
- If the prompt asks for habitation: at most one plaza, buildings with a box
  `envelope` (width 7–13, `sizeY ≥ floors × 3 + 4`), an archetype tag, a `door`
  port, a `terrain_conform`, and one `road.network@0` anchored on the plaza and
  `#tag:house`. If it does not: no structure nodes at all.
- No absolute coordinates on any building — constraints only.
