# Farm Plan v0 — the minimal farm (SHIP-PLAN F17)

> **STATUS: RATIFIED 2026-08-09** (drafted and ratified the same day; the
> land-use clamp amendment in §8 carries Kai's explicit approval — see Q3).
> Written to be built from cold: an implementer with no memory of the
> conversation that produced it should be able to land WP-1 from §3–§5 alone.
> Nothing here changes any existing world — see §2, the reach law.
>
> **Scope is bounded by Kai's rung-B amendment (SHIP-PLAN §8.3, row F17):**
> *one generic field-parcel generator plus farmstead siting; the land-use clamp
> learns farmland; deliberately **not** F13 — no camps, no orchard/hedgerow/
> waystation taxonomy.* §14 names every exclusion. When in doubt, the smaller
> answer is the correct one: this feature exists to let a prompt that says
> "farm" get legible agriculture, not to model agriculture.
>
> Companions: `docs/DESIGN.md` (compiler pipeline, semantic intent, the
> land-use biome clamp), `docs/GROUND-CONTRACT-v0.md` (how a pass claims
> ground — §2 declaration types, §4 `INTENT_RANK`), `docs/SITE-PLAN-v0.md`
> §7.4 (a planner's outputs meeting the ground contract),
> `docs/kits/settlement-author.md` §11b (precincts, the node family this
> joins).

## 1. What this is, and the one assertion it must satisfy

Today a prompt that says *farm* gets a village with `farmhouse`, `barn`,
`granary` and `windmill` in its mix, standing in grass. The catalog has the
buildings; nothing in the compiler has ever tilled a column of ground. The
`scarecrow` prop's own kit line reads "for a field edge" — the field it names
does not exist.

The battery's P2 (*"A small farm town being invaded by aliens."*, seed 302)
asserts:

> the town is legibly a **farm** town: cultivated field parcels with
> farmsteads, readable as agriculture at eye level.

Two nouns and one adverbial: **parcels**, **farmsteads**, **at eye level**.
Eye level is the demanding one, and it is what fixes most of the decisions
below. From a player standing on a lane, agriculture reads as: a fence line
with a gate; ground that is worked rather than grown; rows with a rhythm; one
crop to a field, so the colour changes when you cross a boundary; and a yard
with a house and a barn on it that the fields obviously belong to. It does
*not* need contour terracing, hedgerow networks, orchards, or anything else in
F13.

## 2. The reach law (byte-identity)

**A document that contains no farm node compiles byte-identically to today.**
The same law the intent layer and the flora grammar carry, enforced the same
way: the byte-identity harness of `docs/GROUND-CONTRACT-v0.md` §12 (worktree at
`HEAD`, compile both, compare *decompressed chunk NBT*, and prove the harness
can see a difference before trusting that it saw none).

Consequences, decided:

- Every new fan-out row (§10) is **total**: absent `intent` means today's
  value, which for every farm row is "no farm".
- The land-use clamp amendment (§8) fires **only** on columns a farm holding
  claimed. A world with no farm feeds the clamp the same sources it feeds it
  now.
- The clearing suppression (§9.1) and the `grounds.ts` exclusion (§9.2) are
  both keyed on the parcel mask, which is empty in a world with no farm.
- `examples/showcase-*`, `demo-*` and `c1-harbourtown` are the flat controls
  and must not move a byte at any WP.

## 3. The authoring surface

### 3.1 The decision

**A farm is a new stdlib generator in the precinct family: `precinct.farm@0`.
One node is one holding — a farmstead and the fields that belong to it.**

```json
{
  "id": "east_farm",
  "kind": "generator",
  "generator": "precinct.farm@0",
  "label": "the holding east of the village, wheat and roots",
  "envelope": { "shape": "region", "size": [96, 80] },
  "params": { "parcels": 6, "parcelSize": 18, "crops": ["wheat", "potatoes"] },
  "constraints": [
    { "adjacent_to": "village" },
    { "distance": "village", "min": 8, "max": 40 },
    { "terrain_conform": "drape" }
  ],
  "ports": { "gate": { "type": "road_stub", "face": "any", "tags": ["primary"] } },
  "tags": ["farm", "rural"]
}
```

### 3.2 Why this shape, and not the other three

The choice is between an L1 generator behind an L2 node, a capability on
`district`, and a scatter. The layering decides it.

**A district capability is wrong because a field is not fabric.** A district
draws streets first and takes the residue as blocks and lots
(`docs/kits/settlement-author.md`, the `district` section). Fields are the
opposite: they are the ground *outside* the street network, and their
boundaries answer to the terrain and to each other, not to a frontage. Making
fields a district param would also tie the feature to one urban form — the
`linear` form's kit line already promises "open ground beyond the lots that
becomes fields", and that promise has never been kept precisely because a
form's residue is the wrong owner for a thing the prompt names. A prompt that
says "farm town" is naming the fields; a node the author writes is how Loam
lets an author name something.

**A scatter is wrong because a parcel has internal structure.** `scatter.*`
places independent instances against a density and a spacing. A field parcel
is a rectangle with a row direction, a crop, baulks at a pitch, an edge with
exactly one gate, and a relationship to a yard. Nothing about it is an
independent instance, and `ScatterArea`'s unit trap (DESIGN's ledger, T118) is
a standing reminder of what happens when a subsystem is asked to mean
something it was not shaped for.

**A terrain verb is wrong because a farm is built, not eroded.** Verbs compose
into the height field before anything is materialised; a farm needs to read
roads, footprints and the resolved ground, all of which exist only much later.

**The precinct family is right, and it is a reuse rather than a new node
family.** `docs/kits/settlement-author.md` §11b already teaches precincts as
"a whole compound from one envelope", and `packages/spec/src/settlement/
types.ts` already says why they are their own thing: *"structure nodes in every
sense the solver cares about — a box, a yaw, a footprint it reserves like any
other — and differ only in what the structure pass does with the box once it is
placed: a whole compound of ground works, props and buildings, laid out
deterministically rather than solved."* That sentence describes a farm holding
without a word changed. Joining the family buys solver placement, yaw,
footprint reservation, building emission, prop emission, port publication and a
report section, all of them already built and tested.

One caveat, stated so nobody implements past it: **a farm does not inherit the
precinct ground works.** `buildPrecincts` levels its envelope and declares
`precinct.ground` (rank 20, tier A, immovable). A farm must never level its
envelope — see §5. It shares the family's *plumbing*, not its ground policy.

### 3.3 Params — normative

| param | type | default | notes |
|---|---|---|---|
| `parcels` | int 1..24 | `4` | **Requested** parcel count. Delivered or diagnosed, never silently rounded (§12, the crop-circle rule). |
| `parcelSize` | int 10..28 | `16` | Target side of a parcel, in blocks, before jitter (§6.4). Below 10 the rows have no rhythm; above 28 one parcel eats a small envelope. |
| `crops` | array of crop ids | drawn from `era`/`climate` | The crop vocabulary this holding draws from, in declaration order. Ids are §6.2's table; an unknown id is `LOAM-W502` naming the legal values, and the holding keeps its seeded draw. |
| `farmstead` | `"auto"` \| `"none"` \| array of archetype ids | `"auto"` | `"auto"` picks by holding size (§7.2). An explicit array is built in order, first entry taking the door. `"none"` is fields with no yard — legal, and the way an author writes outfields belonging to a town that already has its farmhouse. |
| `edge` | `"fence"` \| `"wall"` \| `"none"` | `"fence"` | The parcel boundary. `"wall"` is a dry-stone course for upland and Mediterranean holdings; `"none"` is open-field, and reads as agriculture only because the rows do. |
| `fallow` | 0..1 | fan-out (§10) | Share of parcels left unsown. Under `intent.decline` this is driven for you; write it only to override. |

`envelope` is **required** and must be `{"shape": "region", "size": [x, z]}`.
Floor: **40 × 40**, which is one farmstead yard (20 × 20) plus one parcel plus
the setbacks. Below it, `LOAM-T225`.

## 4. The holding — anatomy

A holding is four things, in the order they are planned:

1. **The gate** — the point on the envelope perimeter closest to the nearest
   road, arterial or district edge. Everything else is oriented from it. If
   there is no road within the region, the gate is the perimeter point closest
   to the nearest placed building footprint; if there is neither, it is the
   perimeter midpoint of the envelope's `-z` side.
2. **The yard** — a 16–24-square compound just inside the gate, holding the
   farmstead buildings (§7). It is the only part of a holding that is levelled.
3. **The parcels** — as many gentle-ground rectangles as fit, packed outward
   from the yard (§5.2).
4. **The track** — not built by this pass. The holding publishes a `road_stub`
   port at the gate, and an ordinary `road.network@0` `lanes` node anchored on
   the holding's id runs the lane to it, exactly as the kit already teaches for
   districts. No new linework, no fifth `SweptProfile` client, no new class in
   `INTENT_RANK`.

Everything inside the envelope that is not yard, parcel or track is left
alone. A holding is mostly ground nobody touched, which is what a real holding
is.

## 5. Seating parcels on terrain, under the ground contract

### 5.1 The gentle-ground scan — normative

A parcel may only be seated where the ground is already close to level. This is
the whole of the "gentle-slope seating" bound, and it is what keeps F17 out of
F13's contour-terracing.

For a candidate rectangle `R` over the resolved-so-far ground (§5.5 says which
ground that is), compute over its columns:

- `relief(R) = max(g) − min(g)`
- `level(R) = median(g)`, rounded half-up to an integer
- `wet(R)` = any column with `fluidKind ≠ NONE`
- `claimed(R)` = any column already claimed by a rank stronger than
  `farm.parcel` (§5.3), or carrying occupancy tagged `building`, `road`,
  `plaza` or `prop`

`R` is **seatable** iff:

```
relief(R) ≤ FIELD_MAX_RELIEF (= 3)
  and  not wet(R)
  and  not claimed(R)
  and  every column's surface is soil-family (the `states.soft` set grounds.ts
       already keeps: dirt, grass_block, coarse_dirt, rooted_dirt, podzol, mud)
```

`FIELD_MAX_RELIEF = 3` is the number to argue about and the one to measure on a
walk. The reasoning behind 3: a parcel is 10–28 on a side, so 3 blocks of
relief is a grade under 1:4 across the shortest parcel and under 1:9 across the
longest; the resulting cut is at most 2 blocks at one corner, which the edge
absorbs as a lip (§5.4) that reads as a lynchet rather than as a wall.

### 5.2 Packing — normative

Deterministic, greedy, and outward from the yard, so a holding's fields sit
against its yard rather than scattering:

```
plan(holding):
  yard   := seat the yard (§7.1); on failure, LOAM-W503 and refuse the holding
  s      := parcelSize
  grid   := the envelope, minus the yard and a 2-column setback around it,
            tiled into s×s cells on the holding's yaw axes, anchored at the
            yard's gate-side corner
  order  := cells sorted by (chebyshev distance from the yard, then z, then x)
            — a total order, never traversal order
  placed := []
  for cell in order while |placed| < params.parcels:
      R := cell, shrunk by the per-parcel jitter of §6.4
      if not seatable(R): continue
      if R touches an already-placed parcel: share the boundary (§6.3)
      placed.push({ rect: R, level: level(R), … })
  if |placed| < params.parcels: LOAM-W501, naming requested, delivered, and
                               the dominant refusal reason
  if |placed| == 0:            LOAM-W500, and the holding is yard-only
```

Two rules the greedy loop must keep and a naive implementation will lose:

- **Parcels never overlap and never abut across a shared column.** Two parcels
  that touch share exactly one boundary line, and that line carries one fence,
  not two (§6.3).
- **A refused cell is not retried at a different size.** One shape per cell,
  once. Retry ladders make the packing order-dependent and make the report
  unreadable.

### 5.3 What a parcel claims

A parcel declares **one `GroundIntent` per parcel**:

```ts
{
  source: `${nodePath}#parcel_${i}`,
  sourceClass: "farm.parcel",
  kind: "platform",
  columns: every column of the parcel rect, at `level(R)`,
  transition: "step",
}
```

**New source class `farm.parcel`, rank 125** — inserted between
`doorstep.landing` (120) and `prop.pad` (130) in `INTENT_RANK`. The one line of
why, in the table's own voice:

> A field is the ground nobody built on, tilled. It yields to every built thing
> and to every accommodation of a built thing, and it beats only the pads and
> the ramps — because a scarecrow's plinth must not re-level a field, and a
> road's bank must not re-grade one.

The rank is inserted, not renumbered: `INTENT_RANK` is spaced by 10 precisely
so a class can arrive without moving the others, and no existing world holds a
`farm.parcel` claim, so **the insertion is byte-identity-free by construction**
(the contract's I7 argument, in the easy direction).

`transition: "step"` is a request, and §2.5 of the contract says the resolver's
drop/run table answers it. A field edge wants a step or a bank and never a
masonry wall; when the resolved answer is `wall`, that is a signal the parcel
was seated somewhere `FIELD_MAX_RELIEF` should have refused, and the report
counts it (`parcelWalls`, §12). A non-zero count on a walked world is a bug in
the scan, not in the resolver.

The parcel declares **no `preserve`**. Losing columns to a lane, a doorstep or
a wall is normal and is exactly the behaviour we want; making it audible would
fill the diagnostics with news nobody can act on.

### 5.4 Roads, verges, and what yields to what

Because `farm.parcel` is rank 125:

- **A road or street crossing a holding wins** (`road.network` 100,
  `street.network` 80). The parcel simply does not cover those columns, the
  resolver generates the transition at the boundary, and the field reads as a
  field with a lane through it — which is what a farm track through a field
  looks like. The parcel's *rows* must therefore be drawn against the resolved
  ground and the claimed mask, not against the plan the packer made: **a row
  stops at a column the parcel lost, and the fence closes across the gap.**
- **A verge or bank never re-grades a field** (`verge` 140). This removes, for
  free, the failure mode where `blendShoulders` pulls a two-block ramp into the
  first four rows of a wheat field.
- **A prop pad never re-levels a field** (`prop.pad` 130). The scarecrow, the
  hay bales and the cart stand *on* the field's level.
- **A doorstep beats a field** (120). A farmhouse whose door faces its own
  field gets a flush threshold rather than a step into the crop.

### 5.5 Where the pass runs, and what it reads

`buildFarms` is a **structures-phase pass**
(`packages/compiler/src/structures/farm.ts`), positioned **after** `roads`,
`streets`, `precincts` and `retaining`, and **before** `grounds`, `props`,
`life` and the clearing/scatter/biome phase. At that position it reads, through
the `GroundDriver` and the existing masks:

- the resolved-so-far ground and `fluidKind` (via the driver's prefix
  re-resolve, exactly as every converted pass does — `docs/GROUND-CONTRACT-v0.md`
  §9a.4);
- the road/street `claimed` masks and the `OccupancyGrid`;
- the placed building footprints (for the gate rule of §4).

It writes: its own `GroundIntent`s (declared, never applied), its blocks
(farmland, crops, baulks, fences, props), and three published artefacts other
passes read — the **parcel mask** (`Uint8Array`, one per region), the **yard
rects**, and the **port anchor**.

## 6. Inside a parcel — normative

### 6.1 Rows, baulks and direction

- **Row direction** is one axis for the whole parcel: the parcel's long axis,
  and on a square parcel the axis of the holding's yaw. Never per-column,
  never per-row.
- **Rows** run the full length of the parcel between its edge courses. A row is
  one column wide.
- **Baulks** — unsown walking strips of `dirt_path` — run parallel to the rows
  at a pitch of `BAULK_PITCH = 7` rows, starting at row 3, plus one baulk down
  the parcel's centreline when the parcel is 20 or wider. A baulk is what makes
  a field read as worked rather than as a texture, and it is also how a player
  crosses a field without trampling it.
- **Headlands**: the two rows at each end of the run, perpendicular to the row
  direction, are `dirt_path` — the turning strip. Cheap, and it is the single
  cue that most reliably says "ploughed" from a distance.

Everything else in the parcel interior is a sown row (§6.2) or a fallow row
(§6.5).

### 6.2 The crop table, and the persistence law

**One crop per parcel.** Mixed crops within a parcel read as noise at eye
level; the colour change *at a boundary* is what makes the parcel legible as a
unit. The crop is a positional draw over `params.crops` (or the era/climate
default list) keyed on the parcel's min corner, walked forward from the drawn
index like `pickArchetype` does, skipping any crop the parcel is too small
for — and **skipping the crop the previously-placed adjacent parcel took**, so
two touching fields never match. The last parcel in a holding may repeat.

| id | rows are | in the pinned 1.21.11 set |
|---|---|---|
| `wheat` | `farmland` + `wheat[age=7]` | golden; the default and the most legible |
| `carrots` | `farmland` + `carrots[age=7]` | |
| `potatoes` | `farmland` + `potatoes[age=7]` | |
| `beetroots` | `farmland` + `beetroots[age=3]` | age 3 is beetroot's mature stage |
| `pumpkin` | `farmland` rows carrying `pumpkin` full blocks on a 2-column lattice, `dirt_path` between | **no stems** — an attached stem needs a facing that a lattice cannot guarantee, and an unattached stem reads as nothing |
| `berries` | `coarse_dirt` + `sweet_berry_bush[age=3]` | not farmland; the hedgerow-adjacent one, and the only one that is passable-but-hurts |
| `pasture` | `grass_block` + `short_grass` at a lifted density, a `hay_block` stack in one corner | the fallow/grazing parcel; §6.5 |

**THE PERSISTENCE LAW.** *Every `farmland` column carries a crop, and farmland
is written at `moisture = 0`.*

Both halves are load-bearing and both are counter-intuitive:

- Farmland with **no** crop above it reverts to `dirt` on a random tick when it
  is dry. A world shipped with bare tilled rows is a world that un-tills itself
  in front of the player. So there are no bare farmland columns: an unsown row
  is `coarse_dirt` or `dirt_path`, never farmland.
- Farmland written at `moisture = 7` **with no water within reach** dries to 0
  and changes colour under the player. We do not build irrigation (§14), so we
  write the state the world settles into. The dry tone is the honest one, and
  the deterministic emit then matches what a player sees on their second visit.

This is the same discipline as the flora grammar's `LEAF_STATE_POLICY`: emit
the state the world will hold, not the state that looks best in the first
screenshot.

Two consequences for other rules: farmland is in the walkability audit's
`SOLID_TOP` set, so a field is traversable and a route may legitimately cross
one; and crops are `NEEDS_GROUND` blocks whose ground is the farmland directly
below, satisfied by construction rather than by inspection.

### 6.3 The edge

- A parcel's boundary is a one-column **edge course** just inside the rect,
  surfaced `grass_block` (or the theme's soil) — **never** farmland and never
  `dirt_path`.
- Fence posts stand on the edge course. This is not decoration: `dirt_path`
  reverts to `dirt` when a solid block occupies the space above it, and a fence
  on farmland reads as a mistake. Putting the posts on soil dodges both.
- Each parcel gets **exactly one gate**, in the edge run facing the yard (or,
  for a parcel with no line of sight to the yard, facing the nearest baulk of
  the adjacent parcel). A `*_fence_gate[facing=…, open=false, in_wall=false]`,
  with the two columns outside it left clear so the gate is approachable.
- **Two parcels that touch share one boundary.** The shared line carries a
  single fence run and both parcels' gates are elsewhere. A double fence with a
  one-column dead alley between it is the single most common way this feature
  can look wrong.
- `edge: "wall"` swaps the fence for a one-course dry-stone run in the theme's
  `bank`/`revetment` ground role, with a one-column gap where the gate would
  be. `edge: "none"` writes the edge course and no vertical.

### 6.4 Deterministic variation — the channel table

Every draw is **positional**, keyed on the parcel's min corner (or the
holding's gate for holding-scope draws), off the node's own seed stream
`hash(worldSeed, nodePath)`. Never a counter, never an iteration index — the
district infill's rule, for the district infill's reason: adding a parcel
somewhere else must leave the rest of the holding exactly as it was.

| channel (`y` arg to `positionInt` / `positionFloat`) | decides |
|---|---|
| 30 | parcel size jitter, −2..+2 on each side, floored at 10 |
| 31 | crop index into the holding's crop list |
| 32 | row direction tie-break on a square parcel |
| 33 | baulk phase, 0..2 rows |
| 34 | fallow (§6.5) |
| 35 | gate position along the chosen edge run |
| 36 | which parcel carries the scarecrow / hay / cart prop |
| 37 | farmstead outbuilding draw (§7.2) |
| 38 | pasture tuft density — §6.2's `short_grass` "at a lifted density" (added at WP-3, under this section's own instruction) |

Channels 30–39 are reserved for this feature. An implementer adding a draw
takes the next free number and adds a row here; reusing a channel silently
correlates two decisions, which is exactly the class of bug the table exists to
prevent.

### 6.5 Fallow, and the props

`fallow` (a share, §3.3) marks whole parcels as unsown, drawn on channel 34
over the parcel order. A fallow parcel is `coarse_dirt`/`grass_block` rows with
the baulks and the edge kept, and reads as a rested field — which is also what
a *declining* farm's fields are, which is why `intent.decline` drives it
(§10).

Props, placed through the ordinary `prop.place@0` emitter against the parcel's
own claimed level, at most one per parcel and at most three per holding:
`scarecrow` (in a sown parcel, on a baulk), `hay_block` stacks (a corner of a
`pasture` or fallow parcel), `cart` (on the headland nearest the yard). Each is
offered and **refused whole** if a single op cannot land — the standing rule
since the cropped-street-furniture fix.

## 7. The farmstead

### 7.1 The yard

The yard is one rectangle, 16–24 on a side (scaled by holding size), seated
just inside the gate. Unlike a parcel it **is** levelled, and it claims through
the classes that already exist: the buildings' own footprints are
`building.footprint` (rank 10) as any solver-placed building is, and the yard
surface between them declares `farm.parcel` at the yard's level like a parcel
does — the yard is a field the farmer paved with mud.

Yard surface: `dirt_path` in the middle, `coarse_dirt` at the edges, with the
`grounds.ts` `yard` treatment's existing vocabulary. No grass: a working yard
that is grass reads as a lawn.

If no seatable yard rect exists in the envelope, the whole holding is refused
with `LOAM-W503` naming the measured relief — never a farmstead floating over
its fields, and never a silent decline.

### 7.2 Which buildings

`farmstead: "auto"` draws by holding size, in this order, stopping when the
yard is full:

| holding size (parcels placed) | buildings |
|---|---|
| 1–2 | `farmhouse` |
| 3–5 | `farmhouse`, `barn` |
| 6–9 | `farmhouse`, `barn`, one of {`granary`, `stable`, `chicken_coop`} |
| 10+ | the above plus one of {`silo`, `windmill`, `dovecote`, `apiary`} |

All eight already exist in the catalog and are `implemented`. The draw is
channel 37; the `farmhouse` is always first and always takes the door that the
`road_stub` port is derived from.

Arrangement: buildings on three sides of the yard, doors facing in, the
gate-side left open. This is the `precinct.*@0` kits' own arrangement logic and
should be shared rather than re-derived.

### 7.3 The port

The holding publishes `ports.gate` as a `road_stub` at the outward face of the
yard's open side. A `road.network@0` node anchored on the holding's id then
routes the lane — no new machinery, and it is the same anchor mechanism a
bespoke landmark uses to get a road to its door.

## 8. The land-use biome clamp learns farm parcels

`packages/compiler/src/terrain/landuse.ts` currently says, in a comment that is
a ratified decision:

> **Ratified disposition 8**: the clamp covers settlement footprints and camp
> cores only — **not farmland**. Farm masks are much larger and much softer
> than a settlement footprint, and a feather band over a floodplain reads worse
> than the seam it replaces.

**The amendment, and it is narrow: a v0 farm holding contributes its parcel
rects and its yard rect to `LandUseSources` through a new `farmParcels` seam,
exactly as `campCores` contributes a camp's core and nothing of its
outfields.**

Disposition 8's reasoning survives intact, because what it excluded is not what
this feature builds. It excluded *large, soft* farm masks — the floodplain
case, which is F13's `outfields`. A v0 holding is a handful of hard-edged
rectangles inside a bounded envelope, dimensionally indistinguishable from a
camp core. And the clamp is not cosmetic here: a wheat field inside
`windswept_hills` with the biome's snow decision applied to it is not a wheat
field, it is a mistake, and P2's assertion fails on it.

Normative:

- `LandUseSources` gains `readonly farmParcels?: readonly MaskRect[]` — parcel
  and yard rects only. **Never** the holding envelope: the envelope is mostly
  untouched ground, and clamping it is exactly the soft-mask failure
  disposition 8 refused.
- The comment block above `LandUseSources` is amended in place to say what is
  in and what is still out, and to cite this document. A comment that states a
  ratified decision must not be allowed to go stale — the third failure mode
  in DESIGN is a test that pins a defect; a stale ratification comment is the
  same thing in prose.
- The parcel mask additionally forces `plan.snow[idx] = 0` on every parcel
  column, as `grounds.ts` already does for worn columns. Snow over a crop is
  not a season, it is a compile that disagreed with itself.

## 9. The other passes

### 9.1 The clearing (vegetation)

`terrain/clearing.ts` produces a per-column density multiplier: 0 inside the
settlement hull, ramping back to 1 over `CLEARING_FEATHER`. A field is cleared
ground by definition, so:

> `clearing[idx] := 0` on every parcel and yard column, and on a 4-column
> margin around the holding's parcel union.

Deliberately **not** done by adding parcels to the hull: the hull is convex
over footprints, and a holding 40 blocks out would drag it into a wedge and fell
the wood between — the exact failure the `CLEARING_LINK_DISTANCE` clustering
exists to avoid. Writing the field directly keeps the hull honest.

### 9.2 Ground treatment

`grounds.ts` must not dress a parcel. The pass reads the parcel mask and skips
those columns for every treatment (`apron`, `garden`, `yard`, `sacred`), and
the wear sweep does not reach into a parcel either — a worn path across a
sown field is a defect, not decay. The yard is the one exception: it takes the
existing `yard` treatment.

### 9.3 Props, life, and the physics gate

The parcel mask is added to the occupancy grid tagged `farm`, so the life pass
and `prop.place@0` see claimed ground and do not plant a bus shelter in the
wheat. The physics gate runs unchanged — §13's test surface asserts a generated
farm world lints zero on all 26 rules.

## 10. Intent fan-out

Three rows, all registered through the one seam file, all **total**.

| row id | reads | drives | resolve |
|---|---|---|---|
| `farm.edgeKit` | `era` | `params.edge`'s default: `fence` for pre-industrial classes, `wall` for `ancient`, `fence` otherwise | no `era` declared → today's default (`fence`) |
| `farm.fallowShare` | `decline` | the default `fallow` share | `decline` absent → 0; else `clamp01(decline²)`, the same squared curve `decay.coverage` uses and for the same stated reason |
| `farm.cropList` | `climate`, `character` | the default crop list when `params.crops` is absent | absent → the temperate list `[wheat, carrots, potatoes, beetroots]` |

Plus one **reserved** row so the table is inspectable before the phase that
owns it: `farm.outfields` (`character`) — F13's soft outfield masks.

`intent` is not legal on a leaf, so a `precinct.farm@0` node inherits the
region's dials and cannot carry its own. That is correct: a holding's character
is its region's.

## 11. Kit teaching — the sentences

Added to `docs/kits/settlement-author.md` §11b (precincts), after the harbour:

> ### `precinct.farm@0`
>
> One node is **one holding**: a farmyard with a house and its outbuildings,
> and the fields that belong to it. Reach for it whenever the prompt says farm,
> farming, agricultural, croft, homestead, or describes a village that eats.
>
> A holding needs a **region envelope** (40 × 40 floor; 80 × 80 upward reads as
> a real farm) and **gentle ground** — fields are seated only where the ground
> is already within 3 blocks of level, and a holding dropped on a mountainside
> gets a yard and very few fields, with a warning saying so. Put it on a valley
> floor or a plain, next to the town, with `adjacent_to` and a `distance` range.
>
> Do **not** give a farm `terrain_conform: "flatten"`. A holding levels its own
> yard and each of its fields separately; a flattened envelope is a table with
> crops on it.
>
> Write `parcels` for how many fields you want — you get that many or a warning
> naming how many the ground allowed. Write `crops` when the prompt names one
> (`wheat`, `carrots`, `potatoes`, `beetroots`, `pumpkin`, `berries`,
> `pasture`); leave it out and the climate chooses. One crop to a field, always,
> because that is what makes a field read as a field.
>
> Join it to the town with an ordinary `road.network@0` `lanes` node anchored on
> the holding's id: the holding publishes a `road_stub` at its gate.
>
> Two or three small holdings around a village read far better than one big
> one, and it is the cheapest way to make a settlement look like it eats.

And one line in §9d's `decline` row: *"…also sends fields fallow."*

## 12. Validator surface and diagnostics

| code | severity | when | fix hint |
|---|---|---|---|
| `LOAM-T225 FARM_TOO_SMALL` | error (validate) | envelope below 40 × 40, or not a `region` shape | "a holding needs a yard and at least one field: give it `{\"shape\": \"region\", \"size\": [64, 64]}` or larger" |
| `LOAM-T226 FARM_PARAM` | error (validate) | `parcels`, `parcelSize` or `fallow` out of range | names the range |
| `LOAM-W500 FARM_NO_GROUND` | warning (compile) | zero parcels seated | names the measured relief and the `FIELD_MAX_RELIEF` bar, and says to move the holding to flatter ground or drop `terrain_conform: "flatten"` if it is being levelled |
| `LOAM-W501 FARM_PARCELS_SHORT` | warning (compile) | fewer parcels than requested | names requested, delivered, and the dominant refusal reason (relief / claimed / wet / envelope) |
| `LOAM-W502 FARM_CROP_UNKNOWN` | warning (validate) | a crop id outside §6.2 | lists the seven and the near-misses |
| `LOAM-W503 FARM_REFUSED` | warning (compile) | no seatable yard | names the relief; the node places nothing and the report says so |
| `LOAM-I504 FARM_TRACK` | info (compile) | the port was published | names the anchor id so an author can see what to route to |

`LOAM-W501` is the **crop-circle rule** applied to fields: P2's assertion says
requested instance counts are delivered or diagnosed, never silently rounded,
and a holding that quietly builds three fields where the document asked for
eight is precisely the silent decline DESIGN's first failure mode names.

**Report section** (`report.farms[]`), one row per holding: node path, yard
rect and level, parcels requested / seated / refused-with-reason, crops drawn,
farmstead archetypes, columns claimed, `parcelWalls` (§5.3), port anchor. The
report row is not optional: DESIGN's second failure mode is machinery that
exists and never runs, and a report row is the cheapest proof that a pass ran.

## 13. Work packages

Five, in dependency order. Each ends with the byte-identity controls green.

- **WP-1 — the node.** `precinct.farm@0` in `STRUCTURE_GENERATORS` and the
  precinct family, params typing and validation (`T225`, `T226`, `W502`),
  solver seating, the report section with zero rows filled. **No blocks
  emitted.** Test: a document with a farm node compiles and reports the
  holding; the twelve control worlds are hash-identical.
- **WP-2 — the planner.** The gentle-ground scan, the packing loop, the
  `farm.parcel` class and its `INTENT_RANK` insertion, the claims and the
  transitions, `W500`/`W501`/`W503`. Still no crops. Tests: seatability at
  the `FIELD_MAX_RELIEF` corners; the packing is a pure function of the
  declaration set (shuffle the cell enumeration, same answer); a conflict test
  — a lane routed through a holding takes its columns and the parcel reports
  the loss.
- **WP-3 — the parcel emitter.** Rows, baulks, headlands, the crop table, the
  persistence law, edges and gates, shared boundaries, the props. Tests: no
  bare farmland column anywhere in a compiled world (the persistence law as an
  assertion over the emitted world, not over the plan); no fence post on
  farmland or `dirt_path`; exactly one gate per parcel; a generated farm world
  lints **zero** on all 26 rules.
- **WP-4 — the farmstead and the seams.** The yard, the archetype draw, the
  port, plus §8 (`farmParcels`), §9.1 (clearing), §9.2 (`grounds.ts`
  exclusion), §9.3 (occupancy). Tests: the clamp gives the fields the town's
  biome and snow decision; no tree inside a parcel; the walkability audit's
  goldens do not regress on the fixtures.
- **WP-5 — intent, kit and the demo.** The three fan-out rows, the classifier
  row (a prompt naming farming asks for holdings), the kit section of §11, and
  **one Luna e2e world from a farm prompt**, per the demo law. This is the WP
  that P2 rides.

### 13.1 Test surface, beyond each WP's own

- **A generated-world check**, not only unit tests: Phase 4.1 shipped three
  defects that passed every unit test and 4.2 shipped six. The bar is a
  compiled world read back off disk and linted.
- **Determinism**: same document + seed → byte-identical world, twice, and a
  parcel-order shuffle test proving the packing is order-independent.
- **The reach law**: a fixture with no farm node, compiled on both sides of
  every WP, hash-identical.
- **A slope sweep**: one document, five seeds, over flat / rolling / hill
  terrain, asserting the parcel count degrades monotonically and the warnings
  fire.

## 14. What is deliberately out — the F13 exclusions, named

Every one of these is F13 (SHIP-PLAN §2.2, 16–24 waves, confidence **low**) and
none of them is in F17. Naming them is the point: a later reader must be able to
tell "not built" from "forgotten".

1. **Contour-following fields on real slope.** Terraced paddies, lynchet
   systems, strip fields on a hillside. A v0 parcel is a rectangle on gentle
   ground or it is not placed.
2. **Hedgerows as a network.** Living boundaries, hedge species, a field
   pattern legible from the air. `edge` has three values and none of them is a
   hedge.
3. **Orchards, vineyards, paddies, terraced tea.** All of them want a planting
   grammar and most of them want the flora grammar; none is a row of crops.
4. **Camps** — fishing, logging, mining, waystations, seasonal camps. F13's
   other half entirely.
5. **Outfields and soft masks.** The floodplain-scale farm mask disposition 8
   refused; the reserved `farm.outfields` row is where it will land.
6. **Irrigation.** No channels, no ditches, no water at all in a holding. The
   fluid classes are the highest-risk claims in the ground contract and the
   persistence law (§6.2) means we do not need water to keep a field a field.
   When irrigation arrives, `moisture = 7` becomes honest and the ditches
   declare `fluid.channel`.
7. **Animals and entities.** No mobs, no pens with occupants. Determinism and
   the emit format both argue against it; a `stable` and a `chicken_coop` are
   buildings.
8. **Economy.** No supply relationship between a holding and the town it feeds,
   no granary stock, no market linkage. A holding is sited near a town because
   the author's constraint said so.
9. **Seasons and growth stages.** Every crop is emitted mature. A field of
   `age=2` wheat is a field that looks broken.
10. **The `linear` form's field residue.** The kit's existing "open ground
    beyond the lots that becomes fields" line stays unimplemented and its
    wording should be softened when this ships, so the kit stops promising a
    thing the compiler does not do.

## 15. Open questions — with a recommendation on each

**Q1 — `FIELD_MAX_RELIEF = 3`, or 2, or 4?**
Three is a reasoned guess, not a measurement. Two makes holdings rare on rolling
ground; four starts producing 3-block lips that want a wall.
*Recommendation:* ship 3, measure on the P2 walk, and treat it as the one
constant this feature expects to move. It is one line.

**Q2 — should a holding be one node or should one node place several
holdings?**
One node per holding is the simplest thing that satisfies the crop-circle rule
(a count you asked for is a count you can check). A `count` param would let one
node scatter three holdings across a region, which is fewer tokens for the
author.
*Recommendation:* one node per holding for v0. Three farm nodes is three lines
of JSON and the report reads better; a `count` param can be added later without
moving anything.

**Q3 — does the clamp amendment (§8) need Kai's ratification separately?**
**RESOLVED (Kai, 2026-08-09): ratified as designed.** Disposition 8 is
amended narrowly — parcel and yard rects join `LandUseSources` via the
`farmParcels` seam exactly as camp cores do; the original disposition's
reasoning (excluding F13's large soft farm masks) survives intact.

**Q4 — `pasture` as a crop id.**
It is not a crop; it is a land use, and putting it in the crop table is a small
category error that buys a lot of variety (a grazing field with hay bales beside
a wheat field is what makes a holding read as a holding).
*Recommendation:* keep it in the table and name the category error in the kit
line, rather than inventing a second vocabulary for one entry.

**Q5 — should a district's `mix` gain a rural bias when a farm holding is
adjacent?**
A farm town whose town centre is all `townhouse` reads oddly beside its fields.
*Recommendation:* no. That is the classifier's and the author's job, and a
compiler-side adjacency rule that rewrites a document's `mix` is exactly the
kind of implicit behaviour the kit exists to make explicit. If it comes up on
the P2 walk, fix it in the kit.

**Q6 — the `scarecrow` prop's kit line.**
It has always said "for a field edge". After this ships it is true.
*Recommendation:* leave the line alone and enjoy it.
