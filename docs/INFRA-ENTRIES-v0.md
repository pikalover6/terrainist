# Infrastructure entries — the host, v0

> **RATIFIED (Kai, 2026-08-14):** W0 + W1 are the pre-freeze commitment (W2
> stretch). The quarantine cordon rings **the holding**, not the town. The
> crop circle **flattens its ground too** — a declared disc through the
> ground contract, not material-only. Precinct-built structures **count as
> implemented** (`NON_NODE_IMPLEMENTED` doctrine extends to precincts;
> harbour_wall and quay flip on that basis). A crash furrow with no `into`
> target refuses to build (default accepted, unasked).

**Status: proposal, decision-ready. Written 2026-08-13 against the 2026-08-28
machinery freeze.** The *host* below is machinery and must land before the
freeze; the entries it carries are content and are exempt. Nothing here proposes
a new runtime technique — the whole design is the `SweptProfile` engine, the
wall's own course derivation, the ground contract's reserved classes, and one
registry. Read first: `docs/DESIGN.md` → "The linework engine",
`structures/walls.ts` + `wall-course.ts`, `docs/GROUND-CONTRACT-v0.md` §3.13 and
§13.2, `docs/CATALOG-EXPANSION-v0.md` §3 and §4.4.

---

## 1. The problem, stated once

The catalog has three registries — `BUILDING_ARCHETYPES` (a shell with an
interior), `PROP_GENERATORS` (a placed object with a declared box), and
`NON_NODE_IMPLEMENTED` (three things a pass makes). **Sixty-eight catalog rows
fit none of them**, because what they are is not an object at a place. They are
a *line* over ground nobody owns, a *face* between two levels, or a *treatment*
of a plane somebody else made.

Exactly one of the sixty-eight is built: `curtain_wall`, via `infra.wall@0` — a
bespoke three-file pass (course derivation, sweep seam, blocks) written for it
alone. The lesson of that pass is not "write sixty-seven more"; it is that **all
three of its parts generalise and none of them is the entry**. `deriveWallCourse`
is a route form; `sweepCourse` is the engine every client already shares; what
belongs to `curtain_wall` alone is its cross-section and its material table,
about ninety lines of data. So the host is **one node kind, one pass, one
registry of cross-sections**, and adding an entry is a row plus a profile
function. That is the whole claim.

## 2. Taxonomy — what the sixty-eight actually need

Classified by the *mechanism* each requires, not by what it depicts. Counts are
over the 60 rows whose `kind` is `infrastructure` today, plus 8 rows that are the
same problem wearing a `prop` kind (`stone_bridge`, `timber_bridge`,
`suspension_bridge`, `tunnel_portal`, `harbour_wall`, `quay`, `slipway`,
`marina`).

| # | family | count | what it needs | host |
|---|---|---|---|---|
| **A** | route-following sweep client | **25** | a polyline the author did not write, and one cross-section | `infra.entry@0`, route geometry |
| **B** | retaining / terrain-defining | **9** | a declared `face` between two levels | the **existing retaining pass**, new profile rows |
| **C** | floor-plane / areal treatment | **6** | the top course of ground it does not own | `infra.entry@0`, area geometry |
| **D** | embedded in another structure | **9** | an opening or a fitting *in* a wall, a cut, a canal, a building face | params on the host structure — **not an entry** |
| **E** | honestly a prop or a building | **16** | a declared box and a yaw | re-kind the catalog row; existing registries |
| **F** | bespoke tier, or refused | **1** | computed geometry, one instance, no repeat | `AuthoredProgram` |
| — | already answered | **2** | — | `infra.wall@0`, `PROP_GENERATORS` |

### A — route-following sweep clients (25)

`quarantine_fence`, `barricade_line`, `crash_furrow`, `maglev_pylon`,
`cannon_battery`, `hedgerow`, `dry_stone_wall`, `cart_track`, `boardwalk`,
`sphinx_avenue`, `sluice_box`, `log_flume`, `rope_bridge`, `river_log_boom`,
`irrigation_channel`, `fish_ladder`, `stepping_stones`, `aqueduct`, `viaduct`,
`power_pylon`, `telegraph_line`, `street_lamp_run`, `stone_bridge`,
`timber_bridge`, `suspension_bridge`.

Every one is a cross-section swept along a line, differing only in five knobs the
engine already has — band table, `follow`, `maxGrade`, `crossing`, interval
features. Three sub-notes: **`street_lamp_run` is already built** (the
streetscape's `lanterns` / `lanternSpacing` is that entry, and it wants a status
change, not a host); **the three bridges are the bridge kit's**, already a sweep
client with piers, rails and approaches, so they are profile variants and the
cheapest three rows here; and **`crash_furrow` alone edits terrain rather than
standing on it** — a `profile` claim with a negative `level` and a `ditch` band,
both of which the band vocabulary already names.

### B — retaining / terrain-defining (9)

`retaining_wall`, `terrace_steps`, `acropolis_terrace`, `castle_base_wall`,
`harbour_wall`, `quay`, `slipway`, `dam`, `weir`.

These declare a **`face`**, and `LEGAL_KINDS` permits `face` from exactly two
classes: `retaining.seam` and `retaining.skirt`. That is not an obstacle, it is
the answer — **family B is the retaining pass's client list and needs no new host
at all.** `RETAINING_PROFILE` becomes a small table keyed by entry id;
`acropolis_terrace` is its grandest row plus a stair cut into one face, and
`castle_base_wall` is a batter curve on the same row.

Two of the nine are **already built and mis-statused**: `precinct.harbour@0` lays
a retaining course along the real shoreline and a quay surface behind it
(`structures/precincts.ts`, `QUAY_DEPTH`, `quayEdge`). `harbour_wall` and `quay`
are that precinct (Q4). `dam` and `weir` additionally move water — a
`fluid.channel` declaration, rank 0, tier A — and are post-freeze on that ground
alone.

### C — floor-plane / areal treatments (6)

`crop_circle`, `hop_yard`, `stump_field`, `canal_basin`, `millpond`,
`reservoir`.

A treatment writes **no level and no block above the surface**; it rewrites the
top course of columns some other pass decided. `crop_circle` is the pure case and
the cheapest strong icon in the whole expansion document: flattened geometry in a
standing field, keyed on the farm pass's published `parcelMask`. `hop_yard` and
`stump_field` are the same geometry with a feature list. The last three are water
bodies and belong to the canal/terrain side, not here.

**Naming caution:** `docs/FARM-PLAN-v0.md` already uses "the crop-circle rule" to
mean *asked-for counts are delivered or diagnosed, never silently rounded*. The
entry `crop_circle` is unrelated; do not let the two collide in prose.

### D — embedded in another structure (9)

`culvert`, `storm_drain`, `city_gate`, `canal_lock`, `sluice_gate`,
`blast_door`, `airlock_vestibule`, `moon_gate`, `tunnel_portal`.

Every one of these is *a fitting in something else*, and the honest host is a
param on the thing it is fitted to:

- `city_gate` is `infra.wall@0`'s found opening, dressed — the wall already
  finds it and flanks it with towers. **A `city_gate` node would be an author
  placing a gate on a course they cannot see**, the exact mistake
  `wall-course.ts`'s header refuses.
- `culvert` is the sweep's `crossing: "causeway"` with a bore; `tunnel_portal` is
  the tunnel pass's mouth; `canal_lock` and `sluice_gate` are chambers on a canal
  route; `moon_gate` is an opening in a garden wall.
- `blast_door` and `airlock_vestibule` look hardest and are not. A blast door is
  a **face fitting** — a cut into a hillside (a `face` claim, so family B's
  machinery) with a slab-faced door stamped on the cut. An airlock is a **wall
  fitting** — a box projecting from a building's chosen face, which is the
  doorstep/porch seam. Both want the grammar's `wing`-style attachment
  vocabulary, and both are honest post-freeze work.

### E — honestly a prop or a building (16)

`hydro_station`, `cooling_tower`, `transformer_yard`, `oil_derrick`,
`nuclear_dome`, `radio_mast`, `watermill`, `fishing_hut`, `floating_dock`,
`careening_beach`, `harbour_chain_tower`, `warded_gate`, `paifang`,
`spirit_wall`, `pylon_gate`, `marina`.

Most of these are `infrastructure`-kinded by **accident of the group builder**:
`const enr = group("energy", "infrastructure")` gives all five energy rows a kind
none of them earns — a cooling tower is a shell, an oil derrick is a prop. The
classical pack already set the correcting precedent and wrote the reason at the
site of the exception (`agora_colonnade`, `triumphal_arch` and `rostra` carry
`kind: "prop"` overrides with a comment saying why). Family E is that same
correction sixteen more times: **a `kind` override and a note, zero runtime
work.** `warded_gate`, `paifang` and `pylon_gate` are `triumphal_arch` with
different mouldings, and the shipped `triumphal_arch` proves an arch over a road
is a prop with a declared box. The one genuine oddity is
`harbour_chain_tower` — two props and a catenary, and the catenary hangs rather
than sweeps; ship the pair and refuse the chain until it is worth a program.

### F — bespoke tier (1)

`floating_stair` — detached treads climbing to a door on `floating_platform`'s
disguised-stem trick. Hovering, computed, one instance, no repeat. This is
exactly what `AuthoredProgram` is for and building a host for it would be the
leash `docs/DESIGN.md` warns about.

---

## 3. The host — `infra.entry@0`

### 3.1 The node kind

One new node kind, a sibling of `prop.place@0`, child of the root or of a
`district`/`city`. Two params that matter and no `children`.

```json
{
  "id": "cordon", "kind": "generator", "generator": "infra.entry@0",
  "label": "the quarantine line around the holding",
  "params": {
    "entry": "quarantine_fence",
    "route": { "ring": "north_holding", "margin": 12 },
    "gates": true
  }
}
```

`entry` is a catalog id and is validated against the registry with near-miss
suggestions, the way every closed vocabulary in this compiler is grounded.
`route` is one of five forms. Everything else the entry needs it gets from its
registry row and the resolved theme.

### 3.2 The route forms — six, all coordinate-free

The project law is that a model never writes a coordinate. A route is therefore
always **named relative to something the compiler placed**, and is derived after
placement, exactly as a wall course is.

| form | written as | derivation | typical entries |
|---|---|---|---|
| `ring` | `{"ring": "<node id>", "margin": n}` | `deriveWallCourse` verbatim: 15°-quantized support hull of what that node actually built, offset by `margin`, rasterized 4-connected | `quarantine_fence`, `hedgerow` round a holding, `dry_stone_wall` |
| `along` | `{"along": "<road\|edit\|shore>", "offset": n, "side": …}` | the corridor's own polyline, offset laterally — the `along` constraint's line, reused where it is exact instead of a preference | `boardwalk`, `sphinx_avenue`, `cannon_battery`, `cart_track` |
| `across` | `{"across": "<road id\|river\|node id>"}` | the perpendicular chord at the target's narrowest crossing inside the node's frame | `barricade_line`, `river_log_boom`, `stepping_stones` |
| `between` | `{"between": ["a", "b"]}` | the road router's cost field at the entry's own grade cap, between two placed anchors | `harbour_chain_tower`; `aqueduct`, `maglev_pylon`, `telegraph_line` |
| `into` | `{"into": "<node id>", "run": n}` | a run of `n` columns ending at that node, drawn back along the steepest outward bearing to the frame edge | `crash_furrow` |

And one non-route form, for family C:

| `over` | `{"over": "<node id>"}` | every column of the named node's published mask (`parcelMask` for a farm) | `crop_circle`, `hop_yard` |

**`ring` and `along` and `across` are the pre-freeze three.** `between` needs the
router and a tier-A ground declaration and is deliberately held (§5). `into` is
one bearing computation and rides with `crash_furrow`.

**Amendment, 2026-08-15 — `between` landed.** It is `routeTo` (the road
network's own A\*) called with a **one-cell road mask**: the seed set it relaxes
from is the first anchor alone, the goal is the second, and the corridor that
comes back is the cheapest one under the road network's own costs. The entry's
grade cap is threaded in as `roads.ts`'s new `maxDrop` option — a **veto inside
the search**, not a charge and not a post-filter, because a corridor that is
only cheap for climbing a cliff once is not a corridor. The path is returned
running from the anchor the node named *first*, since A\* reconstructs backwards
and an interval feature's phase is locked to the run's start.

Two things the paragraph above got wrong and are worth recording. First, the
tier-A ground declaration it pairs `between` with belongs to `aqueduct` alone —
a **carried carriageway** is a statement about the ground; a chain in the air and
a pole line standing on what it finds are not, so neither had to wait for it.
Second, "and the catenary hangs rather than sweeps; refuse the chain until it is
worth a program" (§2, family E) was right that a sweep cannot express it and
wrong that the answer is a bespoke program: a hanging member is a **third
geometry kind** on the registry row — `span`, two block stacks and a curve — and
it is thirty lines, not a program. Its client, `harbour_chain_tower`, is the
first `between` entry and is why the form landed now.

An author naming something that is not linear, or not placed, gets
`LOAM-T233 INFRA_ROUTE_UNANCHORED` — the loud version of the mistake the kit
already warns about ("pointing `along` at a building buys you nothing").

### 3.3 The registry — data plus one function

In stdlib, beside `PROP_GENERATORS`:

```ts
export interface InfraEntryDef {
  readonly id: string;                          // === the catalog id
  readonly routes: readonly RouteForm[];        // which forms are legal here
  readonly geometry:
    | { readonly kind: "route"; readonly profile: (ctx: InfraContext) => SweptProfile }
    | { readonly kind: "area";  readonly stamp:   (ctx: InfraContext) => AreaStamp };
  readonly sourceClass: GroundSourceClass;      // §3.5 — three legal values
  readonly crossings: "open" | "block" | "gap"; // §3.6
  readonly minRun: number;                      // refuse below this
  readonly features?: readonly IntervalFeature[];
}

export const INFRA_ENTRIES: Readonly<Record<string, InfraEntryDef>>;
```

`InfraContext` carries the resolved `MaterialTheme`, the node's params and the
entry's seed — the same shape `PropGenerator` already takes. **Adding an entry is
one row.** No new pass, no compiler edit outside the registry, no node kind, and
that is the acceptance test for this design: if a new entry needs a line of
`structures/` code, the host is wrong.

`IntervalFeature.generator` already accepts a stdlib prop id and `sweep()`
returns `SweepFeaturePlacement[]`, so "a floodlight mast every fifth panel", "a
sphinx every eleven columns", "a pylon at each bend" cost a row in `features` and
a hand-off to `buildProps`. That seam exists today and is unexercised.

### 3.4 Determinism

The route is a **pure function of the finished placement**, as the wall course
is: integer or exact-rational arithmetic over a fixed iteration order, no RNG, no
clock. Decoration that varies (banner colours, debris along a furrow) draws from
`hash(worldSeed, nodePath)` like everything else. The one new hazard is `across`
and `into`, which pick a bearing: both must break ties by a stated total order
(lowest chord length, then lowest `z`, then lowest `x`), written into the pass and
asserted, or two runs disagree.

### 3.5 Ground contract obligations

**No new `GroundSourceClass`.** Three existing classes cover the family, and the
registry row names which one an entry declares:

| class | rank / tier | for | why |
|---|---|---|---|
| `sweep.run` | 110 / C | `quarantine_fence`, `hedgerow`, `dry_stone_wall`, `cart_track`, `boardwalk`, `barricade_line` | a fence yields to a street; that is correct and it is what the class is for |
| `retaining.seam` | 60 / B | family B, via the retaining pass | the only class `face` is legal from |
| `structure.linework` | 25 / A | `aqueduct`'s arcade, `maglev_pylon`'s guideway | ground must accommodate a pier, not the reverse |

`structure.linework` is **reserved and unexercised today** — §13.2 put it at 25
for `infra.wall@0` and recorded that the wall writes no levels, so nothing has
ever declared it. **Nothing pre-freeze declares it either**, and that is a
deliberate scope line: a tier-A declarer must declare against the baseline,
before streets exist, while every pre-freeze entry finds its crossings against the
*finished* carriageway. Both cannot be true; the wall has lived with exactly this
tension by writing no levels; resolving it properly is post-freeze work that
reopens §13.2.

So **every pre-freeze entry declares `sweep.run` or declares nothing.** A
floor-plane treatment declares nothing at all — it writes no level, takes no
column, and only re-materialises the top course of ground the resolver already
decided, which is the material-ownership gap §13.4 leaves open, accepted here
knowingly and mitigated by running last plus the assertion in §3.7. §13.2's other
instruction generalises and is adopted: **an entry declares nothing at its gate
columns**, so the road passes through by declaration rather than by rank.

### 3.6 Gates and crossings — found, never placed

`infra.wall@0`'s precedent is the whole rule: *a gate is not authored and is not
placed; it exists because a carriageway crosses the course.* Three behaviours,
named per entry. **`open`** — every maximal run of route columns a carriageway
claims becomes one opening, widened by a jamb either side; the sweep skips those
indices and writes nothing in the carriageway, and the gate fitting is drawn on
the jambs (the wall, verbatim). **`block`** — the entry crosses regardless; a
hedgerow does not open for a cart track. **`gap`** — the inversion, and
`barricade_line`'s whole point: block the carriageway **but leave one opening**,
chosen by a stated total order (widest span, ties to the span nearest the
settlement centroid), because a barricade with no gap is a wall across a street
and the walkability audit will say so.

The mask a crossing is found against is per entry: carriageway (roads and
streets), water (`plan.fluidKind`), or a published parcel mask.

### 3.7 Diagnostics and lint obligations

Four new codes, continuing from `LOAM-T230`:

| code | name | fires when |
|---|---|---|
| `LOAM-T231` | `INFRA_ENTRY_PARAM` | unknown `entry`, or a route form that entry does not accept — names legal values and near-misses |
| `LOAM-T232` | `INFRA_ROUTE_EMPTY` | the route resolved shorter than `minRun` (the `WALL_COURSE_EMPTY` analogue) |
| `LOAM-T233` | `INFRA_ROUTE_UNANCHORED` | the named anchor is absent, unplaced, or not linear |
| `LOAM-T234` | `INFRA_RUN_REFUSED` | the run built but lost more than a stated fraction of its columns — so an author sees "a fence full of holes" rather than walking into one |

Per §13.6's precedent, none of these enters `FEEDBACK_CODES` initially:
`BIOME_CLAMPED`'s history is that a code firing on every world costs money in the
authoring loop and buys an invented change.

**Lint: no new rules.** Every entry writes through `life.ts`'s `Planter` with
`requireFreeColumn` — the construction that makes `infra.wall@0` physics-clean
without a second opinion about occupancy: a column the entry cannot claim in full
is skipped whole. Against the 27 shipped rules the exposures are
`connection.stale` (a fence or chain-link run is the catalog's likeliest source;
every connective entry must go through `applyConnectionStates` or it lints as a
wall of default-state posts), `floating.slab` / `floating.stair` (no slab or stair
in a swept cap unless the tread law put it there — the wall's
every-entry-a-full-cube rule is the right registry default),
`unsupported.lantern` / `unsupported.multiface` (floodlight masts, banners,
signs), and `road.proud` for the whole `crossings: "open"` family.

**Exhibit obligation**, from `CATALOG-EXPANSION` §5 rule 5: a linear entry gets a
**run, not a cell** — a straight segment, a curve, a corner, and one crossing a
slope, because every linear defect this project has found lived on a diagonal or
a grade.

**Registry guard**, in the `agent-defs.test.ts` tradition of making a silent
failure loud: `INFRA_ENTRY_IDS` joins `BUILDING_ARCHETYPES`, `PROP_NAMES` and
`NON_NODE_IMPLEMENTED` in `catalog.test.ts`'s backing set, and a registry row
whose id is not a catalog id fails the same test from the other side.

### 3.8 Where the pass runs

**In the wall's slot** — `structures/index.ts` line ~1516, after roads, farms,
props, doorsteps, the cut-face finish and the ground treatment, immediately
before `buildWalls`. That position is not a convenience: it is the only point at
which the carriageway a gate is found against is finished, and it is where the
one shipped entry already runs. Area treatments (family C) run in the same slot,
after everything that could move the ground under them. Family B's entries do
**not** run here — they run inside `buildRetainingWalls` at line ~871, where they
always did.

## 4. What ships pre-freeze

Fifteen days to the 2026-08-28 machinery freeze. **The host is machinery; the
entries are content and may land after.** The order below gets the host in early
and proves it with the smallest set that would expose a design error.

**W0 — the seam (machinery; ~1 wave, `opus-5-low` against this doc, reviewed).**
`InfraEntryDef` + `INFRA_ENTRIES` in stdlib; the `infra.entry@0` node kind, its
param validation and the four diagnostics; the route resolver's `ring`, `along`,
`across` and `into` forms plus `over`; the registry→`sweep()` driver in the wall's
slot; the catalog test guard; one exhibit row. **Nothing else.** This is the only
item on this page with a hard date.

**W1 — the P2 four (content; the strongest icon-law value in the document).**
P2 is *"A small farm town being invaded by aliens."*

| entry | route | why it is first |
|---|---|---|
| `crop_circle` | `over` a farm holding | the cheapest strong icon proposed anywhere; proves the area geometry; F17's `parcelMask` is already published |
| `quarantine_fence` | `ring` the holding | proves `ring` reuse of `deriveWallCourse` outside the wall, and `crossings: "open"` |
| `barricade_line` | `across` a carriageway | proves `crossings: "gap"` — the inversion, and the one that would break a naive host |
| `crash_furrow` | `into` a wreck | proves a `profile` claim that cuts below datum, and gives a scatter its direction |

Four entries, four different mechanisms, one prompt. If the host survives these
it survives the family.

**W2 — the P1 pair (content).** P1 is *"A pirate island and a unicorn island, at
war."* The honest scope here is smaller than it looks, because `harbour_wall`
and `quay` are **already built by `precinct.harbour@0`** and want a status
correction, not a host (Q4). What P1 actually gains is `cannon_battery` —
`along` the shoreline, an earth-and-timber parapet with embrasures at intervals —
which is one registry row on the W0 machinery.

**W3 — the cheap tail, if the calendar allows.** `hedgerow`, `dry_stone_wall`,
`boardwalk`, `sphinx_avenue`. Four rows, all `ring`/`along`, all pure content.

**Post-freeze tail**, in the order it should be taken: (1) the **family E re-kind
sweep** — sixteen rows get a `kind` override and a note, zero runtime work;
(2) the **retaining profile table** — `acropolis_terrace`, `castle_base_wall`,
`retaining_wall`, `terrace_steps`, new client rows in an existing pass; (3) the
**three bridges**, profile variants on the shipped bridge kit; (4) `between` plus
the **tier-A declaration** — `aqueduct`, `viaduct`, `maglev_pylon` — which is
where §13.2 is reopened and answered, and is the largest single item on this
page; (5) the **embedded family (D)**; (6) the **water-movers** — `dam`, `weir`,
`canal_lock`, at `fluid.channel` rank 0, which is a real hydrology conversation.

## 5. Risks and refusals

**No graph solver.** A network is N routes; if two routes must meet, they meet at
an anchor both of them name. A canal network, a power grid and a telegraph web
are all expressible as routes between placed anchors, and every one that is not
is a prompt nobody has typed. Revisit when a walked world fails for want of a
graph — not before.

**No new runtime technique.** The host is `SweptProfile` plus `deriveWallCourse`
plus the ground contract as they stand. If an entry needs geometry the sweep
cannot express, the answer is the bespoke tier, not an eighth band role.

**No new `GroundSourceClass`, and no tier-A declaration.** (2026-08-15: still
true post-freeze, and `between` landing did not change it — see §3.2's
amendment.) Repeated
from §3.5 because it is the line most likely to be crossed by accident: the
moment an entry declares `structure.linework` the pass must move to before the
streets, and the gate-finding it does today becomes impossible.

**No absolute coordinates, ever.** `margin`, `offset` and `run` are distances and
are legal; a vertex, a bearing in degrees or an `[x, z]` is not. The route
vocabulary is closed specifically so a model cannot reach for one.

**No `city_gate` node, no `retaining_wall` node** — both would be an author
placing a thing on a line they cannot see. They are params on the structure that
owns the line.

**The bespoke tier stays the right answer for** anything with one instance and no
repeat (`floating_stair`, the wreck at the end
of a `crash_furrow`), anything whose geometry is computed rather than swept, and
any centrepiece the prompt names, per F18. The host is for the *fabric*.

**Accepted risk, named:** a floor-plane treatment writes materials over ground it
does not own, and §13.4 leaves material ownership unprotected. Mitigation is pass
order (last) plus a generated-world assertion that a treated column's emitted top
block is the treatment's. If that fails, the answer is a narrow `materialOwner`
mask — **not** a second resolver.

---

## 6. Open questions for Kai

**Q1 — Does P2's cordon ring the town or the fields?** A `quarantine_fence`
around the settlement is the military read; around the *farm holding* is the
contamination read. One param either way. *Recommend the holding* — it puts the
fence and the crop circle in the same frame, which is the image the prompt is
actually about.

**Q2 — Should `crop_circle` flatten the ground, or only re-material the top
course?** Flattening is the truer icon and costs a ground declaration and a slot
before the resolver; re-materialising is free, reads from the air, and reads as
paint at ground level. *Recommend material-only pre-freeze*, revisited on the
walk — exactly the call the standing rule says never to tune without one.

**Q3 — Pre-freeze budget: is W0 + W1 (P2's four) the commitment, or does P1
displace it?** `CATALOG-EXPANSION` §6 flagged the same trade one level up and
concluded packs 3+4 could displace pack 2. The host makes it cheaper — W0 is
shared — but four entries is still four. *Recommend W0 + W1 committed, W2
stretch.*

**Q4 — Do `harbour_wall` and `quay` count as `implemented` by
`precinct.harbour@0`?** They are built, walked and shipped, but by a *precinct*
rather than by a generator the catalog test can name. Saying yes means extending
`NON_NODE_IMPLEMENTED` with precinct-borne ids and setting a doctrine precedent;
saying no leaves two rows lying about the state of the world. *Recommend yes,
with the precinct named in each note.*

**Q5 — Does a `crash_furrow` with nothing at the end of it earn its place?** The
thing that made the gouge is a bespoke landmark, and the model may not write one.
The furrow can refuse to build without an `into` target, or it can point at
nothing. *Recommend it refuses* — a scar with no cause is set dressing, and the
icon law's bar is a sentence a stranger would type.
