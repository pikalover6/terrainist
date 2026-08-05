# Urban forms — the street-skeleton registry

> Normative for Phase 4.1. It specifies a registry of **urban forms**: named
> street-skeleton generators behind one contract, so that adding a form is
> adding a module rather than editing a switch. `docs/DESIGN.md` remains the
> description of the system as a whole; this file is the contract the forms and
> their callers are written against.

## 1. Why

`DISTRICT_FABRICS` is `["grid", "organic"]`, and both come out of the same
construction in `buildStreetGraph`: a set of line positions on two perpendicular
axes, each line spanning the domain edge to edge, differing only in how far a
line may jitter and whether it wanders. Everything above that construction —
arterial-first city plans, per-cell rotation, character assignment, clipping to
polygons — varies *where the rectangles are*, never *what they are made of*.
That is why every settlement reads the same, and no amount of jitter fixes it: a
jittered grid is a grid.

The fix is not a bigger `buildStreetGraph`. It is to make the skeleton a
**plugin point**, keep everything downstream of the skeleton shared and
unchanged, and let each form own one idea about how a settlement is organised.

The design rests on one observation about the existing pipeline: after the
skeleton is drawn, nothing downstream knows or cares how it was drawn. Blocks
are the connected components of the ground the carriageway and its verge did not
take; lots are a block's street-facing perimeter; a building is a thing on a lot
with its door on the street. Those three steps are correct for a radial plan, a
canal quarter and a hill town without a line of change. So the plugin boundary
goes exactly where the knowledge stops.

## 2. The contract

### 2.1 Shape

Three types, in a new module `packages/compiler/src/layout/forms/types.ts`.

```ts
/** What a form is asked to draw on. */
export interface FormContext {
  /** Inclusive footprint — the tight bounding box of the domain. */
  readonly bounds: Rect;
  /**
   * 1 inside the domain, row-major over `bounds`.
   *
   * **Absent for an authored rectangular district, and its absence is
   * load-bearing** (see §5): the unmasked, unrotated path through the axial
   * forms is byte-for-byte the one fabric v2 shipped.
   */
  readonly mask?: Uint8Array;
  /** Local frame rotation about the bounds centre, degrees, quantised to 15. */
  readonly orientation?: number;
  /** `nodeSeed(worldSeed, districtPath, seedSalt)`. */
  readonly seed: Seed256;
  /** Preferred centre-line spacing, in blocks. Already defaulted and fanned out. */
  readonly blockSize: number;
  /** Verge per side, in columns. Already defaulted and fanned out. */
  readonly sidewalk: number;
  readonly density: DistrictDensity;
  /** The ground under the domain. See {@link GroundSample}. */
  readonly ground: GroundSample;
  /** Points the plan may organise itself around, in a fixed order. */
  readonly focus: readonly FormFocus[];
  /**
   * A reserved route corridor crossing the domain, clipped to it — the
   * centreline of a `road.network@0` reservation or of a city arterial that
   * borders the cell. Cell by cell, 4-connected. Read by `linear`.
   */
  readonly corridor?: readonly Point2[];
}

/** The ground, read through accessors rather than raw arrays. */
export interface GroundSample {
  /** Rounded height at a world column. Clamped to the domain's edge outside it. */
  height(x: number, z: number): number;
  /** True where the column holds ocean or lake water. */
  water(x: number, z: number): boolean;
  /** Largest absolute height difference to a 4-neighbour, in blocks. */
  slope(x: number, z: number): number;
  /** Height range over the domain, precomputed once by the caller. */
  readonly relief: number;
  /** Composed sea level, when the document has terrain. */
  readonly seaLevel?: number;
  /**
   * False when the pass's field was levelled under this domain by a pad.
   *
   * A form that reads contours must refuse rather than draw a flat imitation of
   * itself; this is how it knows.
   */
  readonly levelled: boolean;
  /** Chebyshev distance from the domain's edge to the nearest water column. */
  readonly waterReach: number;
}

/** Something a plan can be about. */
export interface FormFocus {
  readonly kind: "plaza" | "gate" | "landmark" | "terminus" | "water";
  readonly at: Point2;
  /** Heading the approach runs on, degrees, 0 = +Z, quantised to 15. */
  readonly heading?: number;
  /** Child node id, when `kind` is `"landmark"`. */
  readonly id?: string;
  /** 0..1; the caller's confidence that this is the centre of the place. */
  readonly weight: number;
}
```

Accessors rather than arrays are deliberate. The domain is not the field's
region and is not the plan's region, and `city.ts` already carries a comment
about how expensive that particular confusion is. One accessor object, built
once by the caller, removes the whole class of index bug from six form modules.

### 2.2 What a form returns

```ts
export interface FormPlan {
  /** The pinned F4 / road-pass contract, unchanged. */
  readonly graph: StreetGraph;
  /**
   * 1 where the fabric may cut lots, row-major over `bounds`.
   *
   * ANDed with the caller's own lot mask. Absent means "anywhere the streets
   * left free", which is what every form but `linear` says.
   */
  readonly lotMask?: Uint8Array;
  /** Ground no lot may take: a place, a market, a basin, a hub. */
  readonly reservations?: readonly FormReservation[];
  /**
   * Level platforms, in a fixed order. The caller turns each into `PadEdit`s
   * and seats every building whose lot falls inside one at that level.
   */
  readonly benches?: readonly FormBench[];
  /** Dug water, for the canal pass. Empty for every other form. */
  readonly channels?: readonly FormChannel[];
  /** What the form actually did, for the compile report. */
  readonly record: FormRecord;
}

export interface FormReservation {
  readonly rect: Rect;
  /** Offer this ground to the named district child before any other claim. */
  readonly for?: string;
  /** One line, for the report: "the round-point at the head of four radials". */
  readonly why: string;
}

export interface FormBench {
  /** Maximal horizontal runs of the bench, one row tall — see `maskRuns`. */
  readonly runs: readonly Rect[];
  /** The level every column of the bench is cut or filled to. */
  readonly level: number;
}

export interface FormChannel {
  readonly segment: string;      // the StreetSegment id whose role is "channel"
  readonly surfaceY: number;     // the water top; one below the quay
  readonly depth: number;        // columns of water under the surface
}

export interface FormRecord {
  readonly id: DistrictFabric;
  /** What the document (or the fan-out row) asked for. */
  readonly requested: DistrictFabric;
  /** Present when `id !== requested`: the measured reason. */
  readonly fellBackBecause?: string;
  /** Knobs the form moved from what it was handed, e.g. "spokes 8 → 6". */
  readonly adapted: readonly string[];
  /** Inputs the form deliberately ignored, e.g. "orientation (contour-led)". */
  readonly ignored: readonly string[];
}

export type FormResult =
  | { readonly ok: true; readonly plan: FormPlan }
  | {
      readonly ok: false;
      /** What was measured, in the author's terms. */
      readonly reason: string;
      /** What to change in the document. Never "loosen your constraints". */
      readonly fix: string;
      /** The form to draw instead, or `null` to refuse the quarter outright. */
      readonly fallback: DistrictFabric | null;
    };
```

### 2.3 The plugin

```ts
export interface UrbanForm {
  readonly id: DistrictFabric;
  /** Checked by the registry before `draw` is called. */
  readonly requires: FormRequirements;
  /** One paragraph, printed by `terrainist forms`. */
  readonly describe: string;
  draw(ctx: FormContext): FormResult;
}

export interface FormRequirements {
  /** Shortest axis of the domain's bounding box the form can work in. */
  readonly minSpan: number;
  /** Height range the domain must have. Only `terraced` sets it above 0. */
  readonly minRelief?: number;
  /** The form reads contours and must not be given levelled ground. */
  readonly unlevelled?: boolean;
  /**
   * The form can be drawn into a masked, rotated, non-rectangular domain.
   *
   * **Every shipped form sets this true.** The field exists so that a form
   * which cannot is forced to say so at registration rather than producing
   * carriageway outside its cell, and so the registry can refuse to offer it to
   * a city cell instead of discovering the problem in the physics lint.
   */
  readonly polygon: boolean;
  /** The form drawn instead when a requirement is unmet; `null` refuses. */
  readonly fallback: DistrictFabric | null;
}
```

### 2.4 The registry and the seam

`packages/compiler/src/layout/forms/registry.ts`:

```ts
export function registerForm(form: UrbanForm): void;
export function urbanForm(id: DistrictFabric): UrbanForm | undefined;
export function urbanForms(): readonly UrbanForm[];   // sorted by id
export function installUrbanForms(): void;            // idempotent; the one seam
export function clearUrbanForms(): void;              // test-only
```

This is the shape the intent fan-out registry already has, deliberately: one
seam file imports every form module, the consumer imports the seam, and no
consumer imports a form. `installUrbanForms()` is called from `layDistrict` the
way `ensureFanOutRows()` is.

### 2.5 Dispatch

```ts
export interface FabricRequest extends Omit<FormContext, "ground" | "focus"> {
  readonly fabric: DistrictFabric;
  readonly ground: GroundSample;
  readonly focus: readonly FormFocus[];
  readonly nodePath: string;
}

export interface FabricOutcome {
  readonly plan: FormPlan;
  readonly diagnostics: readonly LoamDiagnostic[];
}

/** Draw the requested form, or the announced fallback. */
export function drawFabric(request: FabricRequest): FabricOutcome | null;
```

`drawFabric` is the only entry point `layDistrict` calls. It:

1. looks the form up; an unregistered id is a compiler bug, not an authoring
   error (the validator has already refused any id outside the registry), and
   throws;
2. checks `requires` against the request — span, relief, levelling, polygon;
3. on a miss, or on an `ok: false` from `draw`, emits **one** `DISTRICT_FORM`
   diagnostic naming the requested form, the measurement that failed, and the
   fix, then draws `fallback`; a `null` fallback returns `null` and the caller
   reports `DISTRICT_TOO_SMALL` exactly as it does today;
4. never falls back twice — a fallback that itself fails is a `null` return.

`buildStreetGraph(input)` **stays**, with its present signature and its present
behaviour, implemented as a wrapper that dispatches to the `grid`/`organic`
forms and returns only the graph. Every existing caller and every existing test
keeps working unmodified, which is most of the review confidence in §5.

### 2.6 Non-rectangular cells

`city.ts` lays fabric into clipped, rotated, non-rectangular cells, and the
contract has to survive that. It does, and no form is rect-only:

- **The mask is the domain.** A form draws in the local `(u, v)` frame implied
  by `orientation`, over a square frame sized to the bounds' diagonal, and cuts
  every line into maximal runs inside the mask — the machinery `clippedGraph`
  already contains (`runsOf`, `densify4`, `MIN_CLIPPED_RUN`). That machinery
  moves into `forms/axial.ts` and is shared by every form that draws lines.
- **A run that ends inside the bounds is a T-junction onto the arterial**, not a
  hole. This is already true and stays true.
- **A focus outside the mask is projected** to the nearest masked column, by the
  same fixed spiral `open()` uses in `city.ts`.
- **Orientation is a hint some forms ignore.** `terraced` is contour-led and
  ignores it; `linear` treats it as the spine's preferred heading; the axial
  forms use it as the grid frame; `radial` uses it as the spokes' phase.
  Anything ignored is named in `FormRecord.ignored`, because a silently ignored
  input is this repo's most expensive recurring defect.

## 3. The forms

Seven ids. Six are the ones Phase 4.1 names; `organic` is the seventh and is
kept, frozen, for the reason §5 gives.

| id | the idea | needs | fallback |
|---|---|---|---|
| `grid` | a surveyed plan | span ≥ 38 | — |
| `organic` | the same grid, let go of | span ≥ 38 | — |
| `grown` | no plan at all: a town that accreted | span ≥ 38 | `organic` |
| `radial` | everything faces one place | span ≥ 6·blockSize | `grown` |
| `canal` | the primary circulation is water | span ≥ 3·blockSize | `grid` |
| `terraced` | the hill decides where the streets go | relief ≥ 2·bench, unlevelled | `grown` |
| `linear` | one street, and the town is what fronts it | span ≥ 3·blockSize | `grid` |

### 3.1 `grid`

Frozen. Line positions per axis, each line spanning the domain edge to edge,
interior lines jittered by `GRID_JITTER` and clamped so two lines cannot cross
or close the block between them. Every avenue is `AVENUE_EVERY`th line.

Parameters: `blockSize`, `sidewalk`, `orientation`, `mask`. Terrain: none — a
grid is what an authority draws on paper and then makes the ground agree with,
which is exactly what the district's own pad does. Failure: fewer than two lines
on an axis, which is a `DISTRICT_TOO_SMALL` error with `blockSize` and
`envelope.size` named, as today.

### 3.2 `organic`

Frozen, and honestly described: **a grid that has been let go of.** Twice the
jitter of `grid`, plus a per-line wander sampled every `ORGANIC_WAVELENGTH`
blocks from a positional hash and interpolated between waypoints. It is not an
organic town and never was; it is the cheapest possible departure from a grid,
it is what half the goldens are built on, and it is kept because both of those
are true.

### 3.3 `grown`

**The idea.** An old town has no through-streets. It has a market, a few routes
that were there before the houses, and then two centuries of somebody building
across the end of somebody else's lane. What that produces is not a wobbly grid
— it is a graph of T-junctions with blocks of wildly different sizes, few
crossroads, and no line of sight longer than a couple of blocks.

**The construction.** Recursive splitting of the domain, which produces exactly
that and is deterministic, terminating and connected by construction:

1. Start with one region: the domain's bounding box in the local frame.
2. For a region whose shorter axis is above `2·blockSize·(1 + slack)`, split it
   with a single street. The split axis is the region's **longer** axis; the
   split position is `0.5 ± r`, `r` drawn from the region's own positional hash
   in `[0.08, 0.30]`; the split street's heading is perpendicular to the split
   axis, jittered by one 15° step with probability ⅓.
3. Recurse into both halves. Depth is bounded at 8, and a region below the size
   floor terminates.
4. Every split street is cut to the mask by `runsOf` and emitted as a segment.
   A split street spans the region it split, and that region's boundary is
   either the domain edge or a parent split street, so the union is connected —
   the property `boundaryEndpoints` and the inter-district road pass depend on.
5. Width class: the first two splits are avenues, the rest streets, and any
   split of a region whose shorter axis is under `1.4·blockSize` is a lane.
6. The first split intersection is published as a reservation (`why: "the
   market the town grew around"`) when `density` is `medium` or `high`.

**Parameters.** `blockSize` (the target region floor), `density` (whether a
market is reserved), `seed`. **Terrain.** None read; a grown town on a slope is
`terraced`'s job.

**Failure.** None that is terrain-shaped. Below `minSpan` the domain cannot hold
two levels of split, which is `DISTRICT_TOO_SMALL` with the envelope named.

`grown` and `organic` are both "not a grid", and keeping both is a deliberate
cost: `organic` is frozen output, `grown` is the real thing. The kit teaches
`grown` and mentions `organic` once, as the legacy value.

### 3.4 `radial`

**The idea.** A place — a round-point, a cathedral square, a fortified gate —
and everything else is either running at it or running around it. It is the one
plan shape that a grid cannot fake, because its blocks are wedges and its
frontages face inward.

**The construction.**

1. **The focus.** In order: a `FormFocus` of kind `plaza`; a focus of kind
   `landmark` naming the child the author wrote in `params.focus`; the
   highest-weight `gate`; the domain's centroid. Projected into the mask.
2. **The hub.** A reservation of radius `max(10, blockSize/2)` about the focus,
   carrying `for` when `params.focus` named a child.
3. **Rings.** Concentric streets at `r_k = hubRadius + k · blockSize`,
   `k = 1 … n`, each drawn as a 24-gon through `TRIG_15` and `densify4`'d, then
   cut to the mask. Every third ring is an avenue.
4. **Spokes.** Radials from the hub edge outward to the mask boundary at a
   phase set by `orientation`. The spoke count starts at 6 (60° pitch, avenues)
   and **doubles at the radius where the arc gap between two spokes exceeds
   1.5·blockSize** — inserted spokes start at that ring, not at the hub, and
   are streets. This is the whole difference between a radial plan and a
   dartboard: without it the outer blocks are enormous wedges and the inner
   ones are slivers.
5. Any ring or spoke run shorter than `MIN_CLIPPED_RUN` is dropped.

**Parameters.** `blockSize` (ring pitch), `orientation` (spoke phase),
`params.focus` (which child holds the hub), `density` (avenue share).

**Terrain.** Read only to place the focus when the caller supplied none: the
flattest column within a third of the domain's short axis of its centroid, which
keeps a round-point off a slope where its rings would each need a different
level. A `gate` focus (a city cell's arterial junction) outranks that.

**Failure.** A domain that cannot hold the hub plus two rings — `minSpan`
`6·blockSize`. Announced fallback: `grown`, because a small radial ambition
reads better as a huddle than as a grid.

**Known cost.** `subdivide` inscribes an axis-aligned rectangle in every block.
A wedge loses area to that, exactly as a rotated cell does; `radial` therefore
applies the same compensation `ROTATED_BLOCK_GAIN` applies, growing its ring
pitch by 16 %. The real fix is a polygon lot cutter, which is out of scope here
and recorded in §8.

### 3.5 `canal`

**The idea.** In a canal town the primary circulation is water. The canal is not
a decoration laid over a street plan; it is *where the street would be*. Which
is why this form is cheap: **a canal is a street whose carriageway is water.**
It takes the ground the same way, it gets the same verge, and the buildings
front it with their doors on the quay, through the existing frontage machinery,
with no change to blocks, lots or seating.

**The construction.**

1. Draw the axial skeleton (`forms/axial.ts`, the `grid` parameters).
2. **Promote** every `canalEvery`th line on the domain's *longer* axis from a
   street to a channel: the segment keeps its path and its width, and takes
   `role: "channel"`. `canalEvery` is 3 at `high` density, 2 at `medium` and
   `low` — a canal quarter is mostly canal.
3. A promoted line is trimmed at both ends by `sidewalk + 2` columns so a
   channel never opens onto an arterial or off the district.
4. Cross streets that cross a channel keep `role: "carriageway"` and are marked
   for a deck: the crossing cells are found with the existing `findCrossings`
   and handed to the bridge kit at surfacing time (§4).
5. **The datum.** One water surface for the whole quarter:
   `surfaceY = foundationY − 1` normally, and `seaLevel` when the domain's
   `waterReach` is under 24 columns and `|foundationY − seaLevel| ≤ 2` — so a
   quarter beside the sea shares the sea's level and reads as open to it.
   Channel floor is `surfaceY − depth`, `depth = 2`.
6. Emit one `FormChannel` per promoted segment.

**Parameters.** `blockSize` (canal pitch), `density` (`canalEvery`),
`sidewalk` (quay width). **Terrain.** `waterReach`, `seaLevel`, `height` — read
only to choose the datum, above.

**When the terrain will not support it — a canal quarter with no water.** It
still gets canals. A canal is *dug*, and a quarter with no open water within
reach is a closed pound, which is a real thing and looks right. What the author
gets is a `DISTRICT_FORM` **note**:

> the canals in `world.old_quarter` are a closed pound: no open water reaches
> within 24 columns of this quarter, so they are cut to the quarter's own level
> rather than to the sea. Move the quarter onto the shore with an `at`/`zone`
> constraint, or add a `river` verb whose course reaches it, if the canals
> should open to open water.

That names something the author can change, and it never removes the feature the
prompt was about. The **real** failure is size: a channel plus two quays plus a
street on each side needs `3·blockSize` on the short axis, and below that the
form reports `ok: false` with `blockSize` and `envelope.size` named, falling back
to `grid`.

**Physics.** The canal pass (§4.3) owns everything that can go wrong here:
stagnant water at one Y with a solid shell, banks one block proud, no column
where water meets a building footprint. `prop.fluid_leak`, `road.proud` and
`traversal.unreachable` are the three rules that will find a mistake, and a
compiled canal world at zero findings is the acceptance test.

### 3.6 `terraced`

**The idea.** On a real slope the streets are not a plan imposed on the ground —
they are the two things the ground allows. Streets that run *along* the contour
are level and can be long; streets that run *across* it are short and are
stairs. Everything else follows: the blocks are the benches between two contour
streets, and every building on a bench shares one floor level.

**The construction.**

1. **Benches.** `benchHeight = 4` blocks (one storey, so a terrace's party wall
   steps by a whole floor). `benchOf(x, z) = floor((height(x,z) − base) /
   benchHeight)`. The field is pre-smoothed by a 5-column box blur — twice,
   fixed — so a one-block noise pit does not cut a contour in half.
2. **Contour streets.** The boundary set of the bench field: every column whose
   bench index differs from a 4-neighbour's. Connected components of that set
   are taken in row-major order; each becomes one polyline by the **double
   sweep** already used for the shoreline drive (farthest cell from a fixed
   start, then farthest from there, then the BFS-tree path between them),
   `densify4`'d, and cut to the mask. Components shorter than `MIN_CLIPPED_RUN`
   are dropped, and their columns fall back into the bench either side.
3. **Stairs.** Along each contour street, every `blockSize` columns of arc
   length, a connection to the next bench downhill: steepest-descent walk,
   4-connected, terminating on the next contour street. Emitted as a segment
   with `kind: "lane"` and `role: "steps"`.
4. **Benches as products.** Each bench's columns, as maximal horizontal runs,
   with `level = base + benchIndex · benchHeight + benchHeight − 1`. The caller
   turns them into `PadEdit`s and founds every building on its bench's level.
5. **The invariant that makes this safe:** a bench boundary is always a street.
   A lot lives inside a block, a block lives between streets, therefore **no lot
   ever spans two bench levels**, therefore no building is founded across a
   step. This is the whole reason the contour is the street rather than the
   street being fitted to a contour afterwards.

**Parameters.** `benchHeight` (fixed at 4 in v0), `blockSize` (stair pitch),
`density`. **Terrain.** Everything: `height`, `relief`, `levelled`.

**Ground policy.** A `district` node is pad-levelled by the solver
(`padFor` → `cut_fill`) before the fabric pass runs, so a terraced district would
be handed a billiard table by the compiler itself. Therefore:
`LayoutNodeInput` gains `groundPolicy?: "pad" | "stepped"`; `districtInput` in
`from-document.ts` sets `"stepped"` when the resolved form is `terraced`;
`padFor` returns `null` for `"stepped"`, exactly as it already does for a city
and for an amphibious node. The bench pads are the district's levelling, and
they are emitted by the fabric pass into the same `fabricPads` list a city
cell's mask runs already use.

This creates the one genuinely awkward seam in the design: the form is resolved
*twice*, once in `from-document.ts` (before the solve, to set the ground policy)
and once in `layDistrict` (to draw). Both call the same total fan-out row with
the same `nodePath` and the same `today`, so they cannot disagree; a test asserts
it for every example document, and the two call sites carry a comment pointing at
each other.

**When the terrain will not support it — a terraced quarter on a billiard
table.** `relief < 2 · benchHeight` means there is exactly one bench, which is a
grid with extra words. The form returns `ok: false`:

> `world.hill_town` asks for the `terraced` form, which lays its streets along
> the contours of the ground; the ground under this quarter has 3 blocks of
> relief and needs at least 8. Move the quarter onto a slope with a `zone` or
> `at` constraint, drop `terrain_conform` (a terraced quarter levels itself, one
> bench at a time), or write `"fabric": "grown"` for an unplanned quarter on
> level ground.

and the announced fallback is `grown`. The same message with a different measure
covers `levelled === true`, which can only happen if the ground policy did not
reach the solver — a compiler bug, and one that says so.

### 3.7 `linear`

**The idea.** A ribbon village: one street, buildings along both sides of it,
and fields either end. Most settlements in the world are this shape, and the
compiler currently cannot make one at any size — a `district` fills its envelope
edge to edge by construction.

**The construction.**

1. **The spine.** In order: the `corridor`, when one crosses the domain (a
   village *on the road* is the commonest case, and this is the only form that
   reads it); the `orientation` heading through the domain's centroid (a city
   cell beside a boulevard); the lowest contour path when `relief ≥ 6` (a valley
   village); the domain's long axis. Drawn as an avenue, edge to edge.
2. **Ribs.** Lanes perpendicular to the local spine heading at `blockSize`
   pitch, each running `ribDepth = 2 · LOT_DEPTH[density] + sidewalk + 4`
   columns either side and stopping — a dead end, which is what a rib is.
   At `high` density the rib ends are joined by a back lane.
3. **The lot mask.** 1 within `ribDepth` of the spine, and within
   `LOT_DEPTH[density] + sidewalk + 2` of a rib or a back lane; 0 elsewhere.
   Without it the subdivision would find one enormous block of leftover ground
   and lot its perimeter, which would produce a hollow ring of houses facing
   nothing — the failure mode this form exists to avoid.

   > **Amended during implementation (2026-08-04).** This step first read "1
   > within `ribDepth` of the spine *or of a rib*", which is a band two ribs
   > wide, because a rib is itself `ribDepth` long. Measured on a 300 × 120
   > quarter it left 353 open columns out of 36 000 — no fields at all, i.e.
   > exactly the failure the mask exists to prevent, arrived at from the other
   > direction. The rib radius is the shallower one above.
4. Everything outside the lot mask is open ground and reaches the ground
   treatment and scatter passes untouched: fields, orchards and paddocks
   beside a village, which is exactly right.

**Parameters.** `blockSize` (rib pitch), `density` (rib depth, back lane).
**Terrain.** `height` for the valley-floor spine; nothing else.

**Failure.** None that is terrain-shaped; a linear village works on any ground.
Below `3·blockSize` on the long axis there is room for one rib, which is a
crossroads — `ok: false`, fallback `grid`, with `envelope.size` named.

## 4. Terrain coupling and the linework engine

The rule is: **no form writes geometry.** A form produces a graph, masks, levels
and channel declarations; the existing structure passes turn those into blocks,
and they do it through `SweptProfile`.

### 4.1 The seam in the street surfacer

`surfaceStreetGraph` currently keys everything off `segment.kind` (`urban[kind]`
picks the material set) and builds a bridge kit only for arterials. It gains one
dispatch, and this dispatch is part of the **contract package** (§6) so that the
canal and terraced packages never edit the same lines:

```ts
switch (segment.role ?? "carriageway") {
  case "carriageway": /* today's path, unchanged */ break;
  case "channel":     surfaceChannel(...);  break;   // filled by WP-B
  case "steps":       surfaceSteps(...);    break;   // filled by WP-C
}
```

Both new branches land as deliberate no-ops in the contract package, in the same
spirit as `dressStreets` was a no-op until F4 filled it in.

### 4.2 `terraced` → the stair profile

A `role: "steps"` segment is not graded by `gradeProfile`; it is laid by
`synthesizeTreadPlan` over the raw ground of its own path, dressed with
`STAIR_PROFILE` (`profiles.ts`), which is the same code the hillside set-piece
stair uses. That buys the tread law (`need[k] = max(g[k]+1, need[k+1]−1)`), the
slab/stair/landing mix, the balustrade caps and the lamp interval feature, and —
critically — **whole-run refusal**: a flight that cannot be made climbable is not
built, and the run is reported rather than shipped as a jump. A refused stair
between two benches is a `DISTRICT_FORM` note naming the bench pair; if a bench
ends up with no stair at all, that is a real defect and the physics lint's
`traversal.unreachable` will say so.

### 4.3 `canal` → a swept profile whose core band is water

A `CANAL_PROFILE` is added to `profiles.ts`:

| band | role | width | what |
|---|---|---|---|
| `channel` | `core` | `width − 2` | water to `surfaceY`, shell below |
| `coping` | `kerb` | 1 each side | one course proud of the water |
| `quay` | `walkway` | `sidewalk` | the frontage the doors face |

The canal pass (`structures/canals.ts`) runs **after `buildColumnPlan` and
before `surfaceStreetGraph`**, and that order is load-bearing: the street
surfacer's `buildBridgeableMask` reads `plan.fluidKind`, so the water has to
exist before a bridge can be priced over it. The pass writes
`plan.fluidKind = WATER` and `plan.fluidTop = surfaceY` over the channel band and
cuts the shell beneath, which is the mirror image of what `precinct.harbour@0`
already does when it dredges (it writes `FluidKind.NONE`).

Crossings use the existing bridge kit: `buildBridgeKit(region, plan, surfaced,
width, states, water)`, exactly the call the arterial loop makes today, so a
canal bridge gets the same deck, rail, pier rhythm and approaches as a river
crossing. `thickenCourse` gives the coping a continuous line on a diagonal.

### 4.4 `radial` → the focus

`radial` reads terrain only through `slope`, to seat its hub. Its rings and
spokes are ordinary streets and are surfaced by the ordinary path. When the hub
reservation is taken by a named child, that child is seated by the ordinary
frontage machinery against the reservation rect, so it gets its pad, its ports,
its doorstep and its physics checks with nothing special done for it.

## 5. Byte-identity

**The guarantee.** A document that names no new form, and carries no intent key
that did not exist before this phase, compiles to exactly the world it compiles
to today — byte for byte, and provably: **no committed golden hash may change in
this phase.** A regenerated golden is a bug report, not a merge.

The mechanisms, each of which a reviewer can check independently:

1. **The axial construction is moved, not rewritten.** `linePositions`,
   `lineSegment`, `organicOffset`, `clippedGraph`, `runsOf` and `densify4` move
   into `forms/axial.ts` with their bodies untouched. `grid` and `organic` are
   adapters that pass the two constants that already distinguish them
   (`GRID_JITTER` vs `GRID_JITTER · 2`, wander on or off). The RNG draw order is
   unchanged because `linePositions` draws for both fabrics at every interior
   line and neither adapter adds or removes a draw.
2. **`mask === undefined` still selects the unclipped path.** The contract keeps
   the field optional for exactly this reason, and the comment saying so travels
   with it.
3. **`buildStreetGraph` keeps its signature and behaviour**, so the existing
   `fabric.test.ts` skeleton assertions are an unmodified regression test on the
   move.
4. **`organic` is not renamed and not aliased.** It stays a canonical id in
   `DISTRICT_FABRICS`, stays what `CELL_FABRIC` maps four characters to, and
   stays what `layout.fabric` returns at low formality. An alias would have been
   cheap; a *rename* would have rewritten every golden, every example and the
   city character table for a nicer word. `grown` is the new form, `organic` is
   the old output, and the kit says which is which in one line.
5. **The city character tables are unchanged.** `CHARACTER_KIT` and
   `CELL_FABRIC` still map every character to `grid` or `organic`. New forms
   reach a city only through `city.params.forms` or `intent.character.urbanForm`
   — both keys no existing document contains.
6. **The fan-out row keeps its id and its existing branches.** `layout.fabric`
   still returns `grid` at `formality ≥ 0.75` and `organic` at `≤ 0.25`; the new
   branch fires only on `character.urbanForm`, which cannot be present in a
   document written before this phase. So documents that carry intent are
   byte-identical too — which is a stronger promise than most phases make, and
   is worth keeping because it makes the identity test total.
7. **Every new field is optional and defaults to today.**
   `StreetSegment.role`, `LayoutNodeInput.groundPolicy`, `FormPlan.lotMask`,
   `FormPlan.benches`, `FormPlan.channels`, `DistrictParams.focus`,
   `CityParams.forms`. Each consumer's default branch is the code that runs
   today.

## 6. The authoring surface

### 6.1 What the model writes

The wire key stays **`params.fabric`**. Its vocabulary widens from two ids to
seven. Renaming the key to `params.form` would have cost every committed
document, every kit example and every golden, and bought a better noun; the
prose calls the concept an *urban form* and the key stays where the model
already knows to look.

```json
{
  "id": "old_town",
  "kind": "district",
  "envelope": { "shape": "region", "size": [200, 180] },
  "params": {
    "fabric": "canal",
    "density": "medium",
    "mix": ["merchant_house", "warehouse", "shop_row"],
    "blockSize": 44
  },
  "constraints": [{ "zone": "south" }, { "terrain_conform": "flatten", "blend": 8 }]
}
```

| key | values | notes |
|---|---|---|
| `params.fabric` | `grid`, `organic`, `grown`, `radial`, `canal`, `terraced`, `linear` | **required**; unknown value is `LOAM-T210` with near-misses |
| `params.focus` | `"plaza"` or the id of one of this district's `children` | optional; `radial` only. Any other value is `LOAM-T210` with the legal ids listed. Written on a non-radial district it is a `LOAM-T210` note saying which form reads it |
| `city.params.forms` | object keyed by the eight characters, values from the list above | optional; per-quarter form, exactly parallel to `params.characters`. An unknown character key or form id is `LOAM-T213` |
| `intent.character.urbanForm` | one of the seven ids | optional; the form for every quarter in scope that gets a fabric. Unknown value is `LOAM-W487`, a warning naming the legal values |

There are **no per-form numeric params**. Ring pitch, spoke count, canal pitch,
bench height, rib depth and market size all derive from `blockSize`, `density`
and the ground. This is the same rule `WallOptions` and `CityParams` are written
under: an author says *how thick, how tall, how often*, never *where*. A form
that needed a coordinate would be the rectangle problem again with more typing.

### 6.2 Precedence

For a district: `params.fabric` (explicit) > `intent.character.urbanForm` >
`layout.fabric` formality branch > `params.fabric`'s own value. In practice the
first and last are the same key, so the rule reads: **an author who wrote a form
outranks a dial**, which is the rule the existing row already states for
`formality`.

For a city cell: `city.params.forms[character]` > `intent.character.urbanForm` >
`CELL_FABRIC[character]` (today's table). `park` cells get no fabric at all and
are unaffected by any of it.

### 6.3 The intent fan-out

Two rows, both owned by the layout passes and registered through the existing
seam.

- **`layout.fabric`** (existing id, widened type). `reads: ["formality",
  "character"]`. `character.urbanForm` first; then today's formality branches;
  then `ctx.today`.
- **`layout.cellForms`** (new, owned by `city-pass.ts`). `reads: ["character"]`.
  Turns `character.urbanForm` into the per-character table, leaving `park`
  alone, and returns `ctx.today` (the existing `CELL_FABRIC` table) when the key
  is absent.

**`era` deliberately does not choose a form.** A mapping from era to form is a
guess the compiler would make on every intent-carrying document, and it would
move every world that already has an `era`. The mapping belongs in the
**classifier pre-pass**, which is where a prompt becomes intent and where a
human can read the answer before the expensive call. The classifier kit gains
one table:

| the prompt says | `character.urbanForm` |
|---|---|
| canal town, Venice, Amsterdam, "streets of water" | `canal` |
| hill town, terraced, cliffside, Cinque Terre, "town on a mountainside" | `terraced` |
| ring town, baroque capital, star fort, "everything faces the palace" | `radial` |
| ribbon village, roadside, valley village, "strung along the road" | `linear` |
| medieval, old quarter, "grew over centuries", "no two streets parallel" | `grown` |
| planned, colonial, gridiron, modern downtown | `grid` |
| anything else | omit the key |

### 6.4 Grounding

`DISTRICT_FABRICS` is the registry the validator checks against, and a test
asserts that every id in it has a registered `UrbanForm` and that every
registered form's id is in it — the same cross-check that keeps
`DISTRICT_CHARACTERS` and `DistrictCharacter` in step. An unknown `params.fabric`
is an **error** with near-misses, matching the `mix` precedent and for the same
reason: the alternative degrade is invisible in the finished world. An unknown
`intent.character.urbanForm` is a **warning** naming the legal values, matching
every other intent vocabulary.

## 7. Implementation plan

Four work packages behind one that lands first. No two packages own the same
file. The contract package must be merged and green before the other four start;
after that they are independent. The standing concurrency cap is three agents
total across the whole tree, so the four run in two waves or in whatever order
the orchestrator has budget for.

### WP-0 — the contract *(lands first, alone)*

**Creates**
`packages/compiler/src/layout/forms/types.ts`,
`forms/registry.ts`,
`forms/index.ts` (the seam),
`forms/axial.ts` (moved bodies, unchanged),
`forms/grid.ts`,
`forms/organic.ts`,
`packages/compiler/src/layout/masks.ts` (`erode`, `withoutReserved`, `maskRuns`,
`largestRect`, moved out of `city-pass.ts` so three packages can share them).

**Edits**
`layout/streets.ts` (adds `StreetSegment.role`; `buildStreetGraph` becomes the
wrapper),
`layout/district.ts` (calls `drawFabric`; consumes `lotMask`, `reservations`,
`benches`, `levels`; records `FormRecord` in `DistrictProduct`),
`layout/types.ts` (`groundPolicy`),
`layout/from-document.ts` (sets `groundPolicy`),
`layout/solve.ts` (`padFor` reads it),
`layout/city-pass.ts` (imports the shared masks; passes cell focus + corridor),
`structures/roads.ts` (the `role` dispatch, both new branches no-ops),
`packages/spec/src/settlement/types.ts` (widened `DISTRICT_FABRICS`,
`params.focus`, `CityParams.forms`),
`packages/spec/src/settlement/validate.ts`,
`packages/spec/src/terrain/diagnostics.ts` (`DISTRICT_FORM` = `LOAM-T222`,
`INTENT_FORM_UNKNOWN` = `LOAM-W487`).

**Done when** every existing test passes unmodified, no golden hash moves, and
the registry answers with two forms.

### WP-A — `radial` and `linear`

Owns `forms/radial.ts`, `forms/linear.ts`, `test/forms-radial.test.ts`,
`test/forms-linear.test.ts`. Touches nothing else: both are pure graph forms
that write no blocks and read no new plumbing.

### WP-B — `canal`

Owns `forms/canal.ts`, `structures/canals.ts`, `test/forms-canal.test.ts`, and
the `CANAL_PROFILE` block in `structures/profiles.ts`. Fills the `channel`
branch WP-0 left in `roads.ts` and wires the canal pass into
`structures/index.ts` between the column plan and the street surfacing. The
riskiest package; see §9.

### WP-C — `terraced`

Owns `forms/terraced.ts`, `structures/street-stairs.ts`,
`test/forms-terraced.test.ts`. Fills the `steps` branch WP-0 left in `roads.ts`
by delegating to `synthesizeTreadPlan` + `STAIR_PROFILE`. Reads the
`groundPolicy` plumbing WP-0 landed; adds no plumbing of its own.

### WP-D — `grown`, the authoring surface and the kits

Owns `forms/grown.ts`, `layout/streets-intent.ts` (widened row),
`layout/city-intent.ts` (the new `layout.cellForms` row),
`docs/kits/settlement-author.md`, the classifier kit,
`test/forms-grown.test.ts`, `test/forms-vocabulary.test.ts`. Touches
`city-pass.ts` only in the one function that chooses a cell's form — coordinate
with WP-0's merge, not with A/B/C.

## 8. Test surface

### 8.1 Every form

1. **Determinism.** Two draws from one seed are cell-identical, segment ids and
   order included. (The existing `fabric.test.ts` layer-1 pattern.)
2. **Stability.** Adding a landmark elsewhere in the document leaves every
   untouched segment and every untouched lot byte-identical — the positional-
   hash law the terrace and infill code already keep.
3. **4-connectivity.** Every `path` steps by exactly one block on exactly one
   axis. Every consumer assumes it.
4. **Connectivity.** A BFS over the union of `carriagewayCells` reaches every
   segment from any segment. For `grid` this is structural; for `grown`,
   `radial` and `linear` it is a real assertion, and it is what the
   inter-district road pass depends on.
5. **Boundary reach.** `boundaryEndpoints` is non-empty, so a lane from the next
   quarter has something to anchor on.
6. **Containment.** No carriageway column falls outside `bounds`, and none falls
   outside `mask` when one was given.
7. **The fabric invariants**, reused from `fabric.test.ts` layer 2: doors on
   sidewalks, facades on the build-to line, no two buildings overlapping,
   coverage tracking the declared density, `lotsDropped` below a stated share.
8. **A compiled world at zero findings.** One 200×180 district per form,
   emitted to a temp dir and read back with all 26 physics rules. This is the
   only layer that can catch the interesting failure, and it is why the file is
   slow; keep the worlds small and keep them out of the per-push gate the way
   the dev-world walk already is.

### 8.2 Per form

- **`grown`** — recursion terminates within the depth bound on a 512² domain;
  block short-axis distribution stays inside `[0.6, 1.8] · blockSize`; the
  market reservation exists at `medium`/`high` and not at `low`.
- **`radial`** — every spoke meets the hub ring; no arc gap between adjacent
  spokes exceeds `1.5 · blockSize` at any ring; the child named by
  `params.focus` is seated in the hub reservation, and a child too big for it
  draws exactly one `CANNOT_FIT`.
- **`canal`** — every channel column is water at one Y with a solid shell; every
  bank column is exactly one above the water; every crossing of a channel by a
  carriageway has a deck and a rail; **every lot is reachable from every other
  lot on foot** (a walking BFS over the emitted world, which is the assertion
  that catches "a canal cut a quarter in two"); the no-open-water note fires
  exactly once on a landlocked quarter and the canals are still dug.
- **`terraced`** — no lot spans two bench levels; every adjacent bench pair is
  joined by at least one built stair; every built stair is climbable under the
  tread law; a refused stair is reported and not built; a flat district draws
  exactly one `DISTRICT_FORM` warning, falls back to `grown`, and still ships a
  quarter.
- **`linear`** — every lot lies within `ribDepth` of the spine or a rib; the
  ground outside the lot mask carries no buildings and does carry scatter.

### 8.3 Vocabulary and identity

- **Registry ↔ spec.** Every id in `DISTRICT_FABRICS` has a registered form and
  every registered form is in `DISTRICT_FABRICS`.
- **Grounding.** `"fabric": "canaal"` is a `LOAM-T210` error listing near-misses;
  `intent.character.urbanForm: "canaal"` is a `LOAM-W487` warning listing the
  seven legal values; `params.focus` naming a non-child is `LOAM-T210` listing
  the legal ids.
- **Byte-identity.** A new `forms-identity.test.ts` compiles every committed
  `examples/*.loam.json` through `skipEmit` and hashes the column plan, every
  tree, every decoration and every structure block — the `intent-identity.test.ts`
  method — and compares against hashes committed by WP-0. Plus the standing
  rule: **no existing golden may be regenerated in this phase.**
- **Determinism law, end to end.** Same document + seed → byte-identical world,
  asserted on one compiled world per new form, twice.

## 9. Risks

1. **The canal pass writes fluid into the column plan**, and every water-aware
   pass downstream then sees it: biome painting, the land-use clamp, the scatter
   clip, the life pass, bridge pricing, and three physics rules. Cross-pass
   interaction is this repo's dominant bug class and this is the phase's largest
   exposure. The counter is the ordering stated once in §4.3 and one shared
   answer to "where is the water" (`plan.fluidKind`), never a second mask.
2. **`terraced` is the only form that changes the solver's behaviour.** The
   ground policy has to reach `padFor`, which means the form is resolved before
   the solve and again inside the fabric pass. Two resolutions of one value is
   exactly the shape of the defects §*Risks* of `DESIGN.md` names; the test that
   asserts they agree is not optional.
3. **`subdivide` inscribes axis-aligned rectangles.** Wedge blocks (`radial`),
   oblique blocks (`grown`) and curved bench blocks (`terraced`) all lose area
   to it. Measurable as `lotsDropped`, compensated by a pitch gain, and not
   properly fixed until there is a polygon lot cutter.
4. **More segments per district.** A grid has 10–20; `grown` and `radial` can
   have 60+. `intersectionsOf` is O(n²) in segments with a per-cell set
   membership test inside; at 60 segments it is still trivial, but it is the
   first thing to profile if a large `grown` city gets slow.
5. **Vocabulary rot.** Seven forms × eight characters × the archetype mix is a
   cross-product nothing tests exhaustively. The registry cross-check keeps the
   *names* honest; only walks keep the *looks* honest, and looks still need Kai.

## 10. Open questions

1. **Announced fallback vs hard refusal.** This spec says a form that cannot be
   drawn emits a warning naming the measurement and the fix, then draws its
   declared fallback, so the world still ships. The alternative — refuse the
   quarter outright, as `DISTRICT_TOO_SMALL` does today, and as
   `validateDistrictMix` does for an unknown archetype — is more in the repo's
   spirit and costs the author a whole quarter for a terrain mismatch they may
   not have been able to predict. The choice here is deliberate but genuinely
   arguable, and it is the single decision most worth overruling.
2. **Whether `organic` should survive at all.** Keeping it is what makes §5
   provable, and it is what four city characters map to. The cost is two ids
   that both mean "not a grid" in the model's vocabulary. A later phase could
   retire it by regenerating every golden once, deliberately.
3. **`benchHeight` fixed at 4.** One storey per bench is the number that makes a
   terrace's party wall step cleanly, but a shallow slope with 4-block benches
   gives very wide benches and a steep one gives very narrow ones. A relief-
   derived bench height (`clamp(round(relief / 6), 3, 6)`) is probably better
   and is not specified here because it wants a walk to judge.

   > **Measured during implementation (2026-08-04).** Bench *width* is
   > `benchHeight / gradient`, and on a 1-in-3 hill that is twelve columns —
   > narrower than a contour street and its two verges. A 200 × 180 terraced
   > quarter on that gradient laid its streets and produced **zero buildings**.
   > Two consequences. First, the deciding variable is the **gradient**, not
   > the relief, so `clamp(round(relief / 6), 3, 6)` would not have helped much
   > — a relief-derived height is the wrong derivation. Second, the form now
   > *refuses* ground it cannot bench, naming the width it measured and the
   > width it needed, and the announced fallback draws `grown` so the hill
   > still gets a quarter with houses on it. That refusal is not a substitute
   > for choosing the height properly; it is the guard that stops the wrong
   > height from shipping an empty quarter in silence.
4. **The canal datum near real water.** `surfaceY = seaLevel` when the quarter is
   within 24 columns of open water is a guess at what reads as "open to the
   sea". Whether the channel should actually be *cut through* to the water — a
   mouth, with a lock or a bridge over it — is a real design question and is
   deliberately out of v0: it makes the canal a hydrological feature rather than
   a dug pond, and that belongs with the infrastructure family (aqueduct, canal,
   rail) already contracted to land on the sweep engine.
5. **Whether `radial` should reserve the hub as a disc rather than a rect.** A
   rect wastes the corners and the ground pass dresses them; a disc reservation
   would need `FormReservation` to carry a mask. Cheap to add later; not worth
   the contract surface now.
6. **Cities do not change by default.** §5 keeps `CELL_FABRIC` frozen, so a city
   document with no intent and no `params.forms` is exactly the city it is
   today. That honours the byte-identity rule and leaves the biggest single
   source of sameness — the compiler-chosen quarters of every city — untouched
   until an author or the classifier opts in. Making the varied table the
   default is one line and a golden regeneration, and is the obvious follow-up
   the moment the forms have been walked.
