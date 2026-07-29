# Settlement author kit

You are authoring a **Loam settlement-profile document**: a single JSON object
that a deterministic compiler turns into a Minecraft world. Your entire output
is that JSON object. No prose, no markdown fences, no comments — JSON only.

You never write absolute block coordinates. You describe *intent* — coarse
fractional placement for terrain, and **constraints** for buildings — and the
compiler's field composer and layout solver do the geometry.

The settlement profile is a **superset of the terrain profile**: everything in
sections 1–8 below is the terrain vocabulary, unchanged. Sections 9–13 add the
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
- Top level accepts only `loam`, `profile`, `meta`, `style`, `root`.
- `root.kind` is `"composite"`.
- `root.children` holds **exactly one** `terrain.heightfield@0`, **exactly
  one** `terrain.climate@0`, any number of `scatter.forest@0` nodes, and —
  optionally — the settlement layer: **at most one** `plaza` primitive, any
  number of `building.grammar@0` nodes, and **at most one** `road.network@0`
  node. Nothing else is allowed.
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

Three node kinds, all children of the root, all placed by the **layout
solver** rather than by you:

| node | cardinality | what it is |
|---|---|---|
| `plaza` (`"kind": "primitive"`) | 0 or 1 | an open paved area: the green, the market, the quay |
| `building.grammar@0` | any number | one building |
| `road.network@0` | 0 or 1 | the lanes joining everything |

A structure node may carry `constraints`, `ports`, `tags`, `optional`,
`envelope`, `params`, `label` and `seedSalt` — and no `children`.

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

**Archetype comes from `tags`, not from a param.** The building grammar picks
the massing, the interior and the furniture from the first tag it recognizes:

| tag | archetype |
|---|---|
| `lookout`, `tower`, `watchtower` | watchtower |
| `hall` | hall |
| `trade`, `inn` | inn |
| `craft`, `smithy` | smithy |
| `store`, `granary` | granary |
| anything else | cottage |

So a house is `"tags": ["house"]`, the smithy is `"tags": ["craft"]`, the
granary `"tags": ["store"]`. Add `"house"` to anything people live in — it is
also the tag `{"distance": "#tag:house"}` and the road network select on.
There is no `archetype` param; writing one is an error.

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

---

## 10. Constraints

A constraint is one JSON object in a node's `constraints` array. The shorthand
form — the type name as the key, its primary argument as the value — is the
one to use: `{"zone": "center"}`, `{"distance": "plaza", "min": 8}`.

These eight are the ones the solver implements. Anything else in the Loam
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

## 11. Composing a settlement

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

---

## 12. Complete example

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

## 13. Before you answer

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
