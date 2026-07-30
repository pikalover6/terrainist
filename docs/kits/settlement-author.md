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
- Top level accepts only `loam`, `profile`, `meta`, `style`, `root`.
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

Four node kinds, all children of the root. The first two are placed by the
**layout solver** rather than by you; a prop is placed coarsely, and the roads
are routed last:

| node | cardinality | what it is |
|---|---|---|
| `plaza` (`"kind": "primitive"`) | 0 or 1 | an open paved area: the green, the market, the quay |
| `building.grammar@0` | any number | one building |
| `prop.place@0` | any number | one boat, cart, pier, fountain… — the evidence people live here |
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
| 6 | vernacular | see the vernacular table below |
| 7 | extended | see the extended table below |
| 8 | original | `hall`, then `trade`/`inn`, then `craft`/`smithy`, then `store`/`granary` |
| 9 | fallback | anything else → cottage |

**Town (table 5)** — the civic wave, and fit-outs like the breadth ones: give
them a **plain rect** envelope or the exterior work refuses and you get the
ordinary house shell. It sits *between* the breadth table and the extended one,
so it never takes a tag an older table already answers to: bare `hall` still
means a great hall (table 7) and `archive` still means a library (table 6).

| archetype | tags | what it gets | envelope that works |
|---|---|---|---|
| town_hall | `town_hall`, `townhall`, `moot_hall`, `city_hall` | masonry plinth, quoins and string course, a clock-and-bell gable over the front bay, council chamber inside; tall paired lights | `[13, 16, 13]`, 2 floors |
| school | `school`, `schoolhouse`, `academy` | rows of desks and seats facing a dark board across the end wall, a modest bell cote; regular single windows | `[11, 12, 15]`, 1–2 floors |
| bathhouse | `bathhouse`, `baths`, `sauna`, `hammam` | pools written into the floor plane inside a solid coping, smooth stone and quartz walls, steam braziers and benches; sparse windows, hip roof | `[13, 11, 13]`, 1 floor |

**Extended (table 6)**

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

**Vernacular (table 5)** — regional re-clads of the ordinary house shell.
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

So a house is `"tags": ["house"]`, the smithy is `"tags": ["craft"]`, the
granary `"tags": ["store"]`, the chapel `"tags": ["chapel"]`. Add `"house"` to anything people live in — it is
also the tag `{"distance": "#tag:house"}` and the road network select on.
There is no `archetype` param; writing one is an error.

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
| `curtain_wall` | `length`×6×3 | ground | `length` 6..64 (16); a repeatable rampart run — place several end to end, with a `gatehouse` building for the gate |

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
9. **One register per settlement.** A keep, a pagoda and a skyscraper in the
   same village is three prompts, not one. Pick the archetype table the prompt
   is asking for and stay in it; the shared village theme does the rest.
10. **The big archetypes want big flat ground.** A keep, a tall building, a
    campsite or a galleon all need a level patch, and none of the props make
    one. A `plateau` edit under the whole built area — radius 90–110, height
    6–8, `"profile": "rounded"` — is what makes them land.
11. **Props are cheap; use several small ones.** A bench, a planter, a
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
