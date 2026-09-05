# Loam — the author's reference

You are writing a **Loam document**: one JSON object that a deterministic
compiler turns into a Minecraft world. Your whole output is that object, with
nothing around it.

Four laws:

- **You never write a block coordinate.** Land is placed by region fractions
  and zones; every thing is placed by *relations* to other things, and the
  compiler solves the geometry against the real ground.
- **Every id in this reference is the compiler's registry**, generated from
  the code. A key not listed here is a validation error.
- **A thing is what it `is`.** If the catalog builds it, name the catalog id.
  If the catalog does not, give it any name and a `brief`, and a program is
  written for it. That is the whole difference between stock and bespoke.
- **The prompt is the brief.** Every image the prompt names is delivered by
  something in the document. The compiler does the fabric.

A document with no `things` is valid: for wilderness, write the land alone.

Notation: `<n>` a number, `<int>` an integer, `<id>` an identifier matching
`^[a-z][a-z0-9_]{0,62}$`, `<fx, fz>` a fractional point `[<n>, <n>]` in
`[0, 1]`, `<zone>` one of {{enum:ZONE_TOKENS}}, `<sel>` another thing's `id`
or `#tag:<tag>`, `<block>` a Minecraft block id such as `minecraft:basalt`.
Ids are unique across the whole document.

---

## 1. The document

| key | value |
|---|---|
| `loam` | `"1"` |
| `name` | `<id>` |
| `seed` | `<int>` (\|seed\| < 2^53) or a decimal string |
| `prompt` | the user's words |
| `spawn` | `{"zone": <zone>}` \| `{"at": <fx, fz>}`; omit for the largest flat dry area |
| `size` | `[<width>, <depth>]`, 16..4096, multiples of 16. A village reads at 256–320, a town at 512, a landscape at 1024 |
| `palette` | `{<symbol>: <block> \| {"mix": [[<block>, <weight>], …]}}` — §2 |
| `intent` | what kind of place — §5 |
| `terrain`, `land`, `climate`, `woods` | the ground — §2 |
| `things` | everything built or placed — §3 |
| `roads` | the lanes — §4 |

**Coordinates.** `<fx, fz>` runs west→east and north→south: north is
`fz = 0`, east is `fx = 1`. Zones are the cells of a 3×3 grid, jittered.
`at` is for a precise relationship, `zone` for "over there".

---

## 2. The ground

### `terrain`

<!-- gen:terrain-params -->

The defaults are rolling hills with organic ridgelines and settled slopes.
`base` below `sea` is mostly ocean. Land under a settlement must exist before
the settlement: the solver refuses to build on water.

### `land`

A list of edits, applied to the terrain in order: raise verbs first, then
carve verbs. Each has an `id`, a `verb`, one placement key — `course` (2–8
waypoints, each `<fx, fz>`) for the corridor verbs, `at: <fx, fz>` or
`zone: <zone>` for the rest — and only its own shape params, in blocks.

<!-- gen:edit-verbs -->

| key | value |
|---|---|
| `profile` | `sharp` \| `rounded` |
| `wild` | 0..1: how organic the outline or the channel is. 0 is a geometric circle or a ruled canal, 1 is wild; the default is halfway |
| `flooded` | `auto` \| `never` — whether a carve may take sea water |

- **Sea water reaches only what connects to the sea.** A `valley` or `river`
  that must hold the sea ends its course (or, for an inlet, begins it) with
  the string `"coast"`, which the compiler resolves to this seed's shore. A
  river that reaches no coast is a chain of ponds; a carve below sea level
  inland is dry.
- **Standing fresh water is `basin` with `"water": true`.**
- **An island is the `island` verb**, sea around it; a `plateau` raises ground
  without sea. Two islands want `terrain.ocean.share` ≥ 0.55 and a strait with
  `"coast"` at both ends.
- **Lava is a `volcano` with `"lava": true`**, inside the caldera, with
  `lavaFlows` frozen down the flanks. The cone dresses itself.

### `climate`

`{"theme": <one of {{enum:CLIMATE_THEMES}}>, "gradient": <−4..4>}`; a negative
gradient makes the north colder. Biomes are derived: forest where a wood
stands, taiga where it is cold, snow above the snow line. `intent.climate`
overrides them over a settlement's ground.

### `woods`

A list of woods. Each:

| key | value |
|---|---|
| `id` | `<id>` |
| `species` | required: `[{"shape": <species below>, "weight": <n>, "height": [<int>, <int>], "trunk": <block>, "leaves": <block>}, …]` — the canopy |
| `area` | `"all"` (default), `{"zone": <zone>}`, or `{"at": <fx, fz>, "radius": <blocks>}` |
| `density` | 0..1 trees per column. 0.15–0.3 is a closed canopy. **At 0.02 and above the wood claims the forest biome over its area**; a whole-region fill below that (≈ 0.012) scatters trees without making the world a forest |
| `grove` | 0..1: how much the trees gather into groves |
| `layers` | `true` for a climate-chosen layer of giants above the canopy and shrubs below, or `{"emergent": <layer>, "understory": <layer>}` where `<layer>` is `"default"`, `"none"` or `{"species": [...]}` |
| `floor` | `default` \| `fungal` \| `glow` |
| `undergrowth` | `{"grass": 0..1, "flowers": 0..1, "deadwood": 0..1}` |
| `elevation` | `[<min>, <max>]` relative to sea level |
| `treeline` | absolute Y above which trees stop |
| `inside` | `true` lets this wood stand inside a district's unbuilt ground — a forest town |

A wood never plants on anything built unless `inside` says so.

<!-- gen:species -->

The **climates** column is what a default layer draws from; the mushrooms and
the two fantasy species are reached only by name.

### `palette`

Symbols: `ground.surface`, `ground.subsurface`, `ground.stone`, `ground.cliff`
(every steep slope in the region), `ground.beach`, `ground.underwater`,
`ground.peak`, `ground.bedrock`, `liquid.water`, `liquid.lava`,
`foliage.snow_layer`, `wood.<spruce|oak|birch>_log` / `_leaves`,
`road.surface`, `road.shoulder`, `plaza.path`, `plaza.gravel`, `plaza.cobble`,
`plaza.border`. A `mix` is resolved per column. Building materials come from
the settlement's theme (§5) or a building's own `materials` (§3).

---

## 3. Things

Every built or placed thing is one object in `things`, with the same shape:

| key | value |
|---|---|
| `id` | `<id>` |
| `is` | what it is: a building, prop or infrastructure id from §6; `plaza`, `district`, `city`; `farm`, `airport`, `harbour`; or **any other name** — then it is bespoke and needs a `brief` |
| `brief` | bespoke only: one or two sentences — what it is, what it must read as, what it is made of, where its way in is |
| `size` | `[<x>, <y>, <z>]` in blocks for a building or a bespoke thing; `[<x>, <z>]` for a plaza, district, city or farm. A building without a size takes its archetype's |
| `where` | a list of relations, below |
| `ground` | `flatten` \| `cut_fill` \| `terrace` \| `keep` — how the ground under it is prepared. Omitted: a building cuts and fills, a plaza or district is levelled |
| `clearance` | blocks of empty ground kept around it |
| `tags` | `[<tag>, …]`, for `#tag:` selectors |
| `optional` | `true` lets the solver drop it rather than force it |
| `label`, `note` | free text |

…plus the keys of its kind, listed under each kind below.

### `where` — the relations

One relation per object: the relation's name is the key, its subject the
value, its own fields beside it, and `strength` (`hard` or `soft`). Several
relations written in one object are read as several.

<!-- gen:relations -->

- `at` and `zone` are soft pulls the ground can outbid; a thing that must stay
  with another is bound by `distance` or `near`, and a thing that must stand on
  a feature by `on`.
- A district's children are not selectable; the district is.
- A prop is placed coarsely: by its own `zone` or `at`, or, given `near`,
  `distance` or `facing` another thing, where that thing goes; `{"at": "pier"}`
  moors a hull to a pier placed earlier. A bespoke thing's `facing` turns its
  front the way `face` does.
- A bespoke thing with a `count` reads its `where` as an area: a `zone`, or an
  `at` with a `radius` that is a **fraction** of the region, or nothing for
  everywhere.

### Buildings — `is` a building id

| key | value |
|---|---|
| `floors` | 1..2 on an ordinary shell; the tall grammar below has its own caps |
| `storey` | 3..8 blocks per floor |
| `roof` | `gable` \| `hip` \| `flat` |
| `windows` | `regular` \| `dense` \| `sparse` \| `paired` \| `none` |
| `door` | `<one of {{enum:HORIZONTAL_FACES}}>`; every building has a door, this chooses the face, and `facing` turns it |
| `wing` | `{"size": [<w>, <d>], "side": <face>, "offset": <int>}` — an L or T plan cut from the envelope |
| `cellar` | `true`, `<int 3..5>`, or `{"depth": <int 3..5>, "style": <cellar style, §6>}` |
| `decay` | 0..1: 0.35 derelict, 0.6 ruined, 0.85 archaeology |
| `entrance` | `blast_door` \| `airlock_vestibule` |
| `materials` | `{"wall": <block>, "trim": <block>, "roof": <block>}` — this building's own, over the theme |
| `vista` | inside a `city` only: `true`, or one of {{enum:VISTA_ARTERIALS}} — seat it at the end of that arterial |

`size` is `[x, y, z]` including the roof; a storey is 3 blocks and a roof
about 4, so `y ≥ floors × 3 + 4`. An ordinary house is 7–13 across; civic
and classical archetypes run 15–21.

<!-- gen:high-rise -->

### `plaza`

An open paved area: `size: [<x>, <z>]` (16 a hamlet's green, 22 a village,
32 a market square) and a `where`. At most one.

### `district`

A quarter: the streets are drawn first, then blocks, lots, and a building on
each lot with its door on the street.

| key | value |
|---|---|
| `size` | `[<x>, <z>]`, 38 × 38 minimum; 140+ before a grid reads as one |
| `form` | {{enum:DISTRICT_FABRICS}} — the urban form, below |
| `density` | {{enum:DISTRICT_DENSITIES}}: `low` is detached houses in gardens, `medium` a town centre with gaps, `high` a continuous party-walled street wall at three to eight storeys (a downtown, whatever the mix) |
| `mix` | `[<building id>, …]` the infill draws from; buildings only |
| `blocks` | 16..96 blocks between street centre lines; omitted, the density chooses |
| `plaza` | `true` keeps the central block open |
| `focus` | `"plaza"` or a child's id: what a `radial` form puts in its hub |
| `courtyards` | 0..1, the share of blocks that close around a shared interior; not at `low` density |
| `terraced` | `true`: split-level ground — terraces, retaining walls, steps between. A `hillside` form implies it |
| `walls` | ring the finished quarter — below |
| `children` | landmark buildings, placed by frontage; they take no `where` |
| `intent` | this quarter's own character, §5 |

| form | what it is |
|---|---|
| `grid` | a surveyed plan of perpendicular streets |
| `organic` | the grid let go of; the legacy value |
| `grown` | no plan: one street at a time, T-junctions, blocks of every size |
| `radial` | rings and spokes around its `focus`; wants a big quarter |
| `canal` | every second or third street is water with quays |
| `hillside` | contour streets on a real slope with stairs between; village-scale, and needs unlevelled relief |
| `linear` | one avenue and what fronts it |

A form the ground cannot hold falls back once, announced. A district is
levelled to one plane unless it is `terraced`; a `hillside` or terraced
quarter keeps its slope, so give it `ground: "keep"`.

**Ruin is a dial, not a mix.** Write the living quarter, then
`intent.decline` on it: at 0.35 and above that share of the lots is built as
the same buildings decayed, in clusters, with the streets and yards going with
them and the green coming back through. Landmarks you name are ruined only by
their own `decay`.

### `city`

Arterials first, quarters as the residue: a drive along the real shoreline, a
spine, a diagonal, a ring where there is room, and the faces between them
become quarters.

| key | value |
|---|---|
| `size` | `[<x>, <z>]`, 200 × 200 minimum |
| `plan` | {{enum:CITY_SIZES}} |
| `mix` | `[<building id>, …]`, the default mix |
| `characters` | `{<character>: [<building id>, …]}` per-quarter mixes, keyed by {{enum:DISTRICT_CHARACTERS}} |
| `forms` | `{<character>: <form>}` per-quarter urban forms |
| `coastal`, `ring` | bool; omit for what the ground offers |
| `diagonals` | 0..{{const:CITY_MAX_DIAGONALS}} |
| `courtyards`, `terraced`, `walls` | as for a district, applied to every quarter |
| `setPieces` | `false`, `true`, or `{"max": <1..{{const:SET_PIECE_MAX_COUNT}}>, "kinds": [<kind>, …]}` from {{enum:SET_PIECE_KINDS}}; omitted, the plan seats what the ground offers |
| `children` | landmark buildings, spread across the quarters; `vista` pins one to an arterial's end |
| `intent` | the city's own character, §5 |

You cannot enumerate a city's quarters; pin what you care about with a
`district` beside it. A city is never levelled; each quarter levels itself. A
compound goes beside a city, not inside it.

### `walls`

`"walls": {}` on a district or city rings what was actually built, swept over
the ground. Gates open wherever a road crosses the course.

<!-- gen:wall-params -->

### Compounds — `is` `farm`, `airport` or `harbour`

One thing, one compound, laid out inside its `size`. It reserves its
footprint, publishes a road anchor under its own id, and places its own
vehicles.

| `is` | `size` | keys |
|---|---|---|
| `airport` | `[x, y, z]` or `[x, z]`, 120 × 80 minimum | `stands` (1–12), `hangars` (0–4), `terminal` (bool) |
| `harbour` | `[x, y, z]` or `[x, z]`, 64 × 48 minimum, meant to straddle the waterline | `piers` (1–8), `ships` (0–8 or `"fill"`) |
| `farm` | `[x, z]`, 40 × 40 minimum, on gentle ground | below |

A farm is one holding: yard, farmstead and fields. It levels its yard and each
field itself, so it takes `ground: "keep"`; its gate is where the lane
arrives. Nothing else tills a field.

<!-- gen:farm-params -->

### Props — `is` a prop id

| key | value |
|---|---|
| `yaw` | 0, 90, 180, 270 |
| `length`, `width`, `curve`, `grade`, `platform` | for the runs: piers, rail lines, runways, dry docks, curtain walls, bollard rows. `length` 3..64, `width` 1..5, `grade` 0..4; a value outside is clamped |

A prop needs its base — open water for a hull, dry land with water in front
for a pier, a flat patch for anything large — and is dropped when none fits.

### Infrastructure — `is` an infrastructure id

A line, a chord or a treatment measured against something built. `route`
names **one** form and the thing it is measured against, and takes only
distances: `margin` ({{const:INFRA_MARGIN_MIN}}..{{const:INFRA_MARGIN_MAX}}),
`offset` ({{const:INFRA_OFFSET_MIN}}..{{const:INFRA_OFFSET_MAX}}), `run`
({{const:INFRA_RUN_MIN}}..{{const:INFRA_RUN_MAX}}), `side` (`left`/`right`).
`gates: false` closes an entry that would open at a road.

| form | written as | what it derives |
|---|---|---|
| `ring` | `{"ring": <sel>, "margin": <n>}` | a closed line round what that thing built |
| `along` | `{"along": <road or edit id>, "offset": <n>, "side": <side>}` | that corridor's own line, to one hand |
| `across` | `{"across": <road or settlement id>}` | the chord over the narrowest crossing (a settlement's high street; for the water movers, the nearest watercourse) |
| `into` | `{"into": <sel>, "run": <n>}` | a run ending at that thing |
| `between` | `{"between": [<sel>, <sel>]}` | a corridor from one anchor to the other, routed like a road |
| `over` | `{"over": <farm id>}` | every column of that holding's fields |

<!-- gen:infra-entries -->

### Bespoke — `is` anything else

A structure no catalog id covers — the crashed saucer, the colossus, the
wooden horse, the leviathan skeleton — is written like any other thing, under
a name of your own, with a `brief`. A second model call writes a generator
from the brief and the compiler places the result like any other thing. A
prompt's centerpiece is bespoke even when a catalog id could approximate it:
the catalog makes *a* castle; the brief makes *the* castle the prompt
described. Fabric the catalog builds — houses, walls, roads, docks, trees —
is never bespoke; a wall is `walls`, a farm is `farm`.

A program builds from `api.theme`, the town's own wood, stone, roof and
ground roles, so the brief names literal blocks only for a substance the
theme has no family for (prismarine, bone, copper), and says where the way in
is if a road should reach it.

| key | value |
|---|---|
| `size` | `[<w>, <h>, <d>]`, your suggestion; the program may declare its own. Edge ≤ {{const:PROGRAM_LIMITS.maxEnvelopeEdge}} |
| `count` | build it this many times with per-instance variation; `where` becomes an area |
| `spacing` | blocks between instances |
| `elevation` | `[<min>, <max>]` relative to sea level, for a scattered thing |
| `hover` | {{const:HOVER_RANGE.min}}..{{const:HOVER_RANGE.max}} blocks above the highest ground under the footprint; the ground beneath stays buildable |
| `seat` | {{enum:SEAT_POLICIES}}: omitted is a plinth, or `conform` when the gate certifies the program terrain-aware; `embed` with `depth` ({{const:EMBED_DEPTH_RANGE.min}}..{{const:EMBED_DEPTH_RANGE.max}}) sinks a crashed thing; `wade` stands it on the seabed, the only way below the waterline |
| `face` | `{"toward": <sel>}` \| `{"away_from": <sel>}`; turns a program that declared a front |

A bespoke thing aimed `at` a point inside a district or city is walked
elsewhere: bind it to the fabric with `distance` instead. Say in the brief
what to hollow and the compiler furnishes the interior. Budgets scale with
region area `A`: single things `clamp(round(3 × A / 512²), 3, 12)`, counted
things `clamp(round(3 × A / 512²), 3, 6)`; over budget, the last written are
dropped. A program that fails its gate is dropped and the world compiles
without it.

<!-- gen:program-limits -->

---

## 4. `roads`

| key | value |
|---|---|
| `pattern` | `organic` \| `grid` \| `radial` \| `ribbon` \| `minimal_spanning` |
| `width` | 2..3 |
| `lit` | bool |
| `junctions` | `plain` \| `plaza` \| `roundabout` \| `stairs` |
| `reach` | `[<sel>, …]` the lanes must reach; omit for every building, district, compound and bespoke thing |

A bespoke thing named in `reach` is reached at the way in its program
published.

---

## 5. `intent`

What kind of place it is, once. Legal at the top level and on a `district`
or `city`, which inherits the world's and overrides what differs.

| key | value | drives |
|---|---|---|
| `era` | an open word, resolved to a class below | material theme, roofs, props and vehicles, road materials, street furniture — no `era` means the modern kit |
| `wealth` | 0..1 | lot size, street width, ornament, storeys |
| `decline` | 0..1 | wear, ruin share, reclaim, fallow fields |
| `formality` | 0..1 | planned and monumental vs organic |
| `event` | `{"kind": <one of {{enum:EVENT_KINDS}}>, "severity": 0..1, "recency": 0..1}` | dressing for a one-off event; `recency` 0 is now |
| `climate` | `{"biome": <biome id>, "temperature": −1..1, "humidity": −1..1, "snow": <one of {{enum:SNOW_POLICIES}}>, "blend": <one of {{enum:BLEND_WIDTHS}}>}` | outranks the terrain's climate over this scope; `blend` is how wide its edge fades |
| `character` | below | what makes a region read as a different place |

<!-- gen:era-aliases -->

`character`:

| key | value |
|---|---|
| `label` | free text |
| `materials` | {{enum:MATERIAL_THEME_IDS}} — the palette |
| `packs` | `[<pack id from §6>, …]` — the forms. The theme is the palette, the pack is the forms; the quarter's `mix` is what it is built from |
| `palettes` | symbol overrides for this scope |
| `props`, `flora` | `{"prefer": [<id>, …], "forbid": [<id>, …]}` of prop ids and species ids |
| `motifs` | `{"roofType": <one of {{enum:ROOF_TYPES}}>, "massing": <one of {{enum:MASSING_STYLES}}>, "windowRhythm": <one of {{enum:WINDOW_RHYTHMS}}>, "ornamentDensity": 0..1}` |

Two places in one world are two regions with two `character` blocks.

---

## 6. The catalog

### Form packs

A pack is the vocabulary of nouns a culture or genre builds. Name it in
`intent.character.packs`; put its buildings in the quarters' `mix`.

<!-- gen:form-packs -->

### Other buildings, by category

<!-- gen:catalog-buildings -->

### Props, `x×y×z`, base where it is not ground

<!-- gen:catalog-props -->

### Cellar styles

<!-- gen:cellar-styles -->
