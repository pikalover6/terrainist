# Courtyard blocks and multi-level ground

> Normative for Phase 4.2. It specifies three things that look like three
> things and are one: a block whose middle is a place rather than leftover, a
> block whose ground is more than one plane, and the column-ownership rule the
> street surfacer needs before either of them can be built. `docs/DESIGN.md`
> remains the description of the system as a whole; `docs/URBAN-FORMS-v0.md` is
> the Phase 4.1 contract this builds directly on and does not amend.

## 1. Why

Phase 4.1 made the *skeleton* a plugin point. Everything below the skeleton —
blocks, lots, frontage seating, terraces, infill — stayed shared and unchanged,
and that was right, because none of it knew or cared how the lines were drawn.
It does, however, carry two assumptions that no form can override, and both of
them are assumptions about **a block of ground**:

1. **A block is a ring of buildings around leftover.** `subdivide` cuts the
   street-facing perimeter into lots and calls the middle a courtyard, by which
   it means nothing happens there. Every settlement this compiler builds is
   therefore extroverted: buildings face out, and the space they enclose is
   dead. That is one of the two ways cities are made, and it is the *modern*
   one. An old quarter is the other: the buildings **enclose** a shared
   interior, the interior is a real place — a well, a tree, a cloister walk,
   washing lines — and you reach it through an arched passage cut under a
   building. The block is introverted, and it reads completely differently from
   the street because the street wall is unbroken.

2. **A block sits on one plane.** `layDistrict` seats every building at
   `bench ?? cell.foundationY ?? medianGround(field, rect)`. On a slope that is
   wrong in a specific, visible way: the block is levelled to one number, the
   streets round it grade to something else, and the difference comes out as a
   bank of raw dirt at the block edge and a shopfront two blocks above its own
   kerb. `terraced` fixed this *between* blocks and only for one form. Nothing
   fixes it *inside* one, and nothing anywhere builds the thing a hill town is
   actually made of: a retaining wall.

These are one problem. Both are "the ground of a block is not one flat plane
with buildings sitting on it". Solve them with one representation and the
interactions resolve themselves — most importantly, a courtyard block on a hill
becomes a *series* of courtyards, one per level, which is what a hill town looks
like, rather than one courtyard with a cliff in it.

There is also a live defect in the way, and it is not incidental to this phase:
the street surfacer has no notion of who owns a column, so on stepped ground it
produces pavement at conflicting levels. Multi-level ground is precisely where
that bites. §2 fixes it first, and everything after §2 assumes it is fixed.

## 2. Column ownership — the surfacer's shape

### 2.1 What is actually wrong

`surfaceStreetGraph` (`structures/roads.ts`) walks arterials, then each graph's
segments, and for each segment does three things in a loop body:

```ts
const profile = gradeProfile(path.map(c => plan.ground[index(region, c.x, c.z)]), …);
const surfaced = path.map((cell, i) => ({ …cell, y: profile[i] }));
surfaceRoute(region, plan, blocked, road, roadY, surfaced, …);   // writes plan.ground
```

Both the read and the write are order-dependent, and there are three distinct
defects in the screenshot, not one.

**(a) The read.** `gradeProfile` is handed `plan.ground` *as it stands*, which
an earlier segment has already cut or filled. Segment order is document order.
So a street's elevation profile depends on which streets happened to be drawn
before it, and on stepped ground those differences compound down a run.

**(b) The write.** `surfaceRoute` sets `plan.ground[idx] = cell.y` for every
swept column. Where two segments share a column — every junction, every stair
landing on a contour street — the last writer wins, over ground the first has
already committed to. Its neighbours were graded against the level it no longer
has, so they are left proud of it.

**(c) The verge.** `blendShoulders` runs after every segment, which is right,
but it propagates from `roadY` — itself last-write-wins — by a ring dilation
whose ties break on row-major scan order. A column between an upper street and a
lower one takes whichever of the two the scan reached first, and `blendShoulders`
deliberately moves only the *height*, never the surface block. That is a grass
column standing at pavement level in the middle of a street. It is the "grass
punching up through a street" in the walk, and it is a separate bug from (a) and
(b).

And (b) is why `terraced` cannot build its `STAIR_PROFILE` balustrade.
`structures/street-stairs.ts` says so in its own doc comment: a wall placed on a
tread can be left standing over a column another segment later lowers, so the
module ships a plain flight and records that the fix "is a change to the
surfacer's shape rather than to this module". This is that change.

### 2.2 The rule

> **Every column a street network touches has exactly one owner, decided before
> anything is written; the owner decides the column's level; nothing that stands
> above a column is emitted until every column has been written.**

Ownership is by a **total order on segments**, not by traversal:

```
rank(s) = ( −width(s), roleRank(s), kindRank(s), id(s) )      // lower tuple wins
  roleRank:  channel 0,  carriageway 1,  steps 2
  kindRank:  arterial 0, avenue 1, street 2, lane 3
```

Width first, because a street *meets* a boulevard rather than the other way
round — the wider carriageway is the one that should survive a shared column,
which is what the arterial loop's comment already claims and what last-write-wins
already quietly contradicts. Role second, so a channel is never paved over by a
carriageway of the same width (the crossing still gets its deck; a deck is blocks
above the plan, not a claim on it), and **`steps` ranks below any street of its
width, so a flight arrives at the street's level — which is what a landing is.**
`id` last, lexicographically, so the order is a pure function of the graph.

> **Corrected during implementation (2026-08-04).** This table first read
> `channel 0, steps 1, carriageway 2`, which under "lower tuple wins" makes a
> flight *outrank* a street of its width — the exact opposite of the paragraph
> it sits beside. The prose was right and the table was wrong.

A `steps` segment ranks below any street, which is the architecturally correct
answer: a flight arrives at the street's level, the street does not arrive at the
flight's. That is what a stair landing is.

### 2.3 The four phases

`surfaceStreetGraph` becomes **claim → level → dress → furnish**. Each phase runs
to completion over *every* segment of *every* graph before the next begins.

**1. Claim.** Snapshot `plan.ground` into a frozen `Int32Array` — call it
`natural`. Then, in rank order, compute each segment's swept columns
(`sweptColumns` for a carriageway, the tread band for a `steps` segment) and
write the segment's index into an `owner: Int32Array` wherever the column is
unowned. Nothing else is written. The swept-column lists are kept, so the dress
phase does not recompute them; the total is the road area the current code
already materialises transiently.

**2. Level.** For each segment, in rank order, compute its elevation profile from
`natural` — never from `plan.ground` — with the columns it does **not** own
pinned to the level their owner already chose.

The pin needs no new grading primitive. `gradeProfile(ground, seaLevel, band,
deckFloor)` already takes a per-cell floor and already upper-envelopes it into a
1-Lipschitz function before taking the pointwise maximum — that machinery exists
for bridge decks and the argument is the same here. So for a pinned index `i`:

- set `ground[i] = pin[i]` and `band[i] = 0`, which makes the lower envelope of
  unit cones satisfy `out[i] ≤ pin[i]`;
- set `deckFloor[i] = pin[i]`, which makes the final max give `out[i] ≥ pin[i]`.

The two together give `out[i] === pin[i]` exactly, and every column either side is
ramped to it at one block per column. That is a street that *arrives* at a
junction instead of stepping at it, and it is four lines in the caller.

*(One caveat, stated rather than hidden: `gradeProfile` floors everything at
`seaLevel + 1`, so a pin below the waterline cannot be expressed. Street columns
are above it by construction — the grade already floors there — so this is a
note, not a case.)*

For a `steps` segment the same idea goes through `synthesizeTreads`, which gains
two optional endpoint pins: the top of the flight is forced to the level of the
street that owns its top landing, and the reach test at the bottom is measured
against the bottom landing's owner rather than against raw ground. A flight that
cannot be made climbable **between its real endpoints** is refused whole, exactly
as it is today — and now the refusal is honest, because today's version is
measured against endpoints that later move.

**3. Dress.** One walk over the owned columns. The owner writes `plan.ground`,
`plan.fluidTop`, `plan.snow`, `plan.subsurface` and `plan.soil`, and sets `road`
and `roadY` — once, at the owner's level.

**Painting keeps today's order.** Every segment that *claimed* a column may write
`plan.surface`, in the existing traversal order, last one wins. Ownership decides
geometry; it deliberately does not decide material. This is not fastidiousness —
it is what makes the identity argument in §6 hold: on levelled ground every
owner's level and every non-owner's level are the same number, so the geometry
written is bit-for-bit today's, and the material sequence is untouched. The step
test (`isStep`, which chooses `states.step` over the surface mix) reads the
**owner's** profile, because a step is geometry.

**4. Furnish.** Only now: centre lines, kerb caps, the stair balustrade and its
lamps, and anything else that stands on a column rather than being one.
`paintCentreLines` already lives here and says why. `surfaceStreetStairs` gets
its `STAIR_PROFILE` balustrade back here, as a list of `StructureBlock`s emitted
against a `plan.ground` that is final. `blendShoulders` and `plantLanterns` stay
dead last, where they already are.

### 2.4 The verge, fixed

`blendShoulders` gains two changes, both small and both required by (c):

- **Nearest, not first.** The ring dilation becomes a proper multi-source BFS
  from the finished road mask, and a tie between two road columns at different
  levels resolves to the **lower** one. A verge should meet the lower street and
  let the upper one retain; smearing it to the upper level is what puts grass at
  pavement height.
- **Seams are not verges.** It takes an optional `seam: Uint8Array` and never
  writes a column marked in it. A column where the ground changes level by more
  than the ring allowance is not a bank to be smoothed — it is a face, and §3.4
  owns it.

### 2.5 What this costs, and what it changes

**Cost.** Two extra region-sized `Int32Array`s (`natural`, `owner`) — 8 bytes per
column, transient; 8 MB on a 1024² world. One extra `gradeProfile` call per
segment that has a pinned junction, which is most of them; `gradeProfile` is
three linear sweeps over a path, so this is noise beside `sweptColumns`. No extra
`sweptColumns` calls, because the claim phase caches.

**What changes for existing worlds.** This is the one part of Phase 4.2 that is
not opt-in, and it must not pretend to be.

- **Flat worlds do not move, and this is provable.** A district is pad-levelled
  before the fabric pass runs, so every segment's input ground is the pad
  constant; `gradeProfile` of a constant is that constant, so `natural` and the
  mutating read agree; every owner's chosen level and every non-owner's are the
  same number, so the dress phase writes what today writes. Painting is
  unchanged by construction. A district-only golden must therefore be
  **byte-identical**, and if one is not, the change is wrong.
- **Worlds with a city move, and worlds with a `terraced` quarter move.** A city
  gets no city-wide pad; its cells are pinned run by run at apron 0 and its
  arterials grade across real terrain, so a cell street reaching the cell edge
  reads columns the arterial has already cut. Those are exactly the worlds with
  the defect.

So the standing "no golden may be regenerated" rule from Phase 4.1 does not
survive this package, and the honest arrangement is: **WP-A lands alone and
carries its own golden regeneration**, with the review gate stated as a
condition rather than a judgement — every golden without a city and without a
`terraced` quarter is unchanged, and every one that moves moves only on street
columns.

## 3. Multi-level ground

### 3.1 The representation

`FormBench` already exists — `{ runs: Rect[], level: number }` — and
`benchLevels` already turns a list of them into a per-column level. It is a
platform field in everything but name. What it lacks is identity: benches are
anonymous, so nothing can say *this lot is on platform 3 and its neighbour is on
platform 2*, and therefore nothing can build what goes between them.

So the representation is a shared derived object, not a new wire format:

```ts
// packages/compiler/src/layout/levels.ts

/** A quarter's ground as a set of level platforms. */
export interface GroundLevels {
  readonly bounds: Rect;
  /** Platform index per column, row-major over `bounds`; −1 = natural ground. */
  readonly index: Int32Array;
  /** Walking-surface Y per platform, in index order. */
  readonly levelY: readonly number[];
  /** The platforms as maximal horizontal runs — what a `PadEdit` wants. */
  readonly runs: readonly (readonly Rect[])[];
  /** Platform at a world column, or −1. */
  at(x: number, z: number): number;
}

/** Where two platforms touch, and how the ground gets between them. */
export interface LevelSeam {
  readonly above: number;              // platform index
  readonly below: number;
  /** The columns of `below` that touch `above`, 4-connected, in a fixed order. */
  readonly cells: readonly Point2[];
  readonly drop: number;               // levelY[above] − levelY[below]
  readonly treatment: "kerb" | "retaining" | "bank" | "built";
}

export function groundLevelsOf(bounds: Rect, benches: readonly FormBench[]): GroundLevels | null;
export function levelSeams(levels: GroundLevels): readonly LevelSeam[];
```

Two decisions in that shape are load-bearing.

**A form declares platforms; the seams are derived.** A form that declared its
own seams could get one wrong, and a wrong seam is a cliff in a town. Deriving
them from the platform field by construction — every 4-adjacent pair of columns
whose platform index differs — makes a missing seam impossible. It is the same
argument the canal pass's containment closure makes: the water is contained
because every column it touches was *made* to hold it.

**`FormBench` stays the wire format.** `groundLevelsOf` is a generalisation of
`benchLevels`, and `terraced` needs no change at all: its benches already have
distinct levels, `levelY[at(x, z)]` equals the number `benchLevels` returns
today, and `foundationY` is therefore identical. `FormBench` gains one optional
`id?: string`, used only for the report.

So the answer to "what replaces one `foundationY` per block":

> **A quarter's ground is a set of level platforms and the seams between them,
> derived once and shared by every consumer.** `foundationY` becomes *the level
> of the platform this lot sits on*. The platform's identity is what lets a
> building know its neighbour is a storey down; the seam is what gets built.

### 3.2 Ground policy

`LayoutNodeInput.groundPolicy` exists today with two values and one producer:
`districtGroundPolicy` returns `"stepped"` exactly when the resolved form
declares `requires.unlevelled`, which is only `terraced`. It becomes three
values, and the middle one is a rename of today's:

| policy | what it means |
|---|---|
| `"pad"` | One plane for the whole quarter. `padFor` levels it. **Today's default, unchanged.** |
| `"benched"` | The form cuts its own platforms; the pass founds buildings on them; `padFor` returns null. **This is exactly what `"stepped"` means today**, and the rename is what keeps `terraced` byte-identical. |
| `"stepped"` | `"benched"`, plus derived platforms where the form declares none, plus seam treatment: retaining walls, derived stairs and the reachability rule. |

`terraced` declares `"benched"`. An author who writes `params.ground: "stepped"`
gets the walls, on `terraced` or on any other form. Making `"stepped"` the
default for `terraced` is a one-line follow-up the moment the walls have been
walked, and it is deliberately not taken here for the same reason
`docs/URBAN-FORMS-v0.md` §10.6 leaves `CELL_FABRIC` frozen: a phase should not
move worlds that did not ask to move.

`padFor` returns `null` for both `"benched"` and `"stepped"`. The double
resolution seam — once in `from-document.ts` before the solve, once in
`layDistrict` — is the one that already exists and is already guarded by a test;
`districtGroundPolicy` gains the same `fanOut` call `resolveDistrictFabric` has,
and nothing new is invented.

### 3.3 Platforms from blocks

When the policy is `"stepped"` and the form declared no benches, the fabric pass
derives them. The construction is one paragraph long and it is deliberately not
contour-led — contours are `terraced`'s idea and this must work under `grid`,
`grown` and `radial` too:

1. **The platform is the block.** Blocks are already the connected components of
   the ground the carriageway and its verge did not take, so a block boundary is
   already a street, and a street already grades itself. Every block is levelled
   to its own **median** natural height.
2. **Quantise to a storey.** `levelY = base + round((median − base) / FLOOR_HEIGHT)
   · FLOOR_HEIGHT`, where `base` is the quarter's lowest column and
   `FLOOR_HEIGHT` is 4. Neighbouring blocks therefore differ by whole storeys, so
   a cornice line and a party wall step cleanly rather than by three blocks. This
   is the same number `BENCH_HEIGHT` encodes and for the same reason.
3. **Split a block that cannot be one platform.** A block whose own relief
   exceeds `FLOOR_HEIGHT` is cut into `floor(relief / FLOOR_HEIGHT)` platforms by
   the same construction `terraced` uses for benches — a 5-column box blur applied
   twice, then `floor((h − base) / FLOOR_HEIGHT)`. That is the split-level block,
   and it costs no new algorithm.
4. **Blocks are re-derived after step 3.** This is the important one, and it is
   one line: the platform boundary is added to `blocked` at the point in
   `layDistrict` where `blocked` is built, before `blocksOf` runs.

Step 4 is what makes the rest of the design fall out rather than be built:

- `blocksOf` finds a split block as *two* blocks, and each subdivides
  independently against its own frontage probe. **No lot can span two
  platforms**, which is the invariant `terraced` gets structurally from "a bench
  boundary is always a street" and which every other form now gets too.
- Consequently no terrace run spans a platform either, because `terraceRuns`
  groups by `block:face`, and two platforms are two blocks.
- Consequently two neighbours at `LOT_SIDE_GAP.high === 0` are never on different
  platforms — the seam column is between them — so the shared-wall failure
  `CellFabric.foundationY`'s comment describes one scale up cannot happen one
  scale down.
- The blocked seam columns are exactly where the retaining wall stands.
- A half-block with no street behind it produces no lots, and its ground stays
  open at its own level: a terrace garden above a wall, which is right.

### 3.4 Seams: kerbs, retaining walls, banks

`levelSeams` groups the seam columns into 8-connected components and gives each
a treatment by its drop **and its run length**:

> **Corrected after the walk (2026-08-05).** This section first said
> *4-connected*, and that one word was the scree. A seam **column** is found
> 4-connected — a lower column sharing an edge with a higher platform — and that
> is the definition of a face and does not change. But the *run* those columns
> form is a contour, and a contour on a lattice is a staircase: along a 45°
> boundary consecutive lower-side columns are diagonal neighbours and never edge
> neighbours. Grouping the run 4-connected therefore cut every diagonal seam
> into one- and two-column crumbs and the pass grew a stub of wall at each.
> Measured on `stepped_hilltown`: **1010 seams over 2495 columns, 714 of them
> one or two columns long, 124 walls actually built.** Regrouping the identical
> 2495 columns 8-connected gives **37** seams, 25 of them 25 columns or longer,
> and **26 walls over 365 columns**. The wall builder never cared —
> `thickenCourse` makes a diagonal course 4-connected before it is swept,
> precisely so that a diagonal run is one wall.
>
> A length gate rides along: a `retaining` seam shorter than `MIN_RETAIN_RUN`
> (6, which is `RETAIN_MAX` — a wall shorter than the tallest wall we build is
> shorter than it is tall) is graded as a `bank` instead. On the hill town that
> moved two of the 37. It is the guard, not the fix.

| drop | treatment | what is built |
|---|---|---|
| 1 | `kerb` | one course of the street's kerb material on the lower column. Not a wall. |
| 2 … `RETAIN_MAX` (6), run ≥ `MIN_RETAIN_RUN` (6) | `retaining` | a masonry wall standing on the lower side, coped, with a balustrade above `RETAIN_RAIL` (3). |
| 2 … `RETAIN_MAX`, run < `MIN_RETAIN_RUN` | `bank` | a wall shorter than it is tall is a stub. Graded, as below. |
| > `RETAIN_MAX` | `bank` | nothing is built; the two platforms are graded into each other over `drop` columns and the record says so. |
| any | `built` | a building already stands on the seam; its own foundation skirt is the wall. Nothing is built. |

A retaining wall is a **fifth client of `SweptProfile`**, and it is nearly free
because of how the engine writes: `sweep()` sets `plan.ground` for every column
of every band, and the column plan materialises a column downward from there. So
raising a one-column band from the low ground to the upper platform's level *is*
the wall — solid masonry from the low side up — for the same reason
`precinct.harbour@0`'s quay works.

```ts
// structures/profiles.ts
export const RETAINING_PROFILE: SweptProfile = {
  id: "retaining.masonry",
  asymmetric: true,
  bands: [
    { id: "face",  role: "core",    width: 1, level: 0, surface: "street.curb",     fill: "ground.stone" },
    { id: "verge", role: "walkway", width: 1, level: 0, surface: "street.sidewalk" },
  ],
  maxGrade: 1,
  follow: "step",
  features: [{ id: "weep", pitch: 9, at: "interval", offset: 0 }],
  crossing: "stop",
};
```

- The **path runs along the lowest row of the upper platform**, so the datum
  `sweep()` reads is the upper level; the `face` band is the one column on the
  low side and the `verge` band the one column on the high side. `follow: "step"`
  rather than `"level"` because a seam component can run between two different
  platform pairs along its length.
- `thickenCourse` is called on the face course. A one-column course on a diagonal
  cannot be 4-connected — a unit-width band along a 45° line spans ≈1.41 lattice
  columns — and a sawtooth retaining wall is worse than none. The function exists
  and is documented for exactly this failure; it thickens **outward**, into the
  low side, so the wall never eats the platform it holds.
- The balustrade is a `cap` with `rail: true`, applied only when
  `drop ≥ RETAIN_RAIL`, so a two-block wall is a wall and a five-block wall is a
  wall you cannot walk off. It is emitted in the **furnish** phase of §2.3, after
  every ground write, which is the whole reason §2 comes first.

  > **Corrected during implementation (2026-08-04).** "After every ground write"
  > is not what the furnish phase gives you. `streetscape.ts`'s `paveSidewalks`
  > runs *after* `surfaceStreetGraph` entirely and re-levels the whole sidewalk
  > band to its street's centre line — measured, that left 75 of 487 balustrade
  > blocks floating, every one of them a sidewalk column. The invariant a
  > furnished thing actually needs is **"no later pass re-levels a column the
  > surfacer owns"**, and the surfacer cannot promise that by ordering its own
  > phases. The stair rail satisfies it by standing on the outermost
  > *carriageway* column, which the streetscape skips by construction, and by
  > emitting its own plinth so a bend cannot pull the ground from under it. A
  > retaining balustrade must clear the same bar rather than assume the phase
  > order does it.
- `weep` is an interval feature: a course of the theme's mossy stone or a
  dripping vine every nine columns. Cheap, and it is what makes a retaining wall
  read as old rather than as a slab.

The pass is `structures/retaining.ts`, and it runs **after the buildings and
before the street surfacing**, for the same reason `digCanals` does: the surfacer
must see the finished ground, and the wall must not be cut into by a street that
was drawn before it existed. A seam column that a street already claims is
skipped — the street is the connection, not a wall across it.

### 3.5 Steps, and what stops this becoming a staircase of pads

The failure mode of every terracing scheme is a set of correct platforms nobody
can walk between. The rule is:

> **A platform you cannot reach is not a platform.**

Enforced in three steps, in order:

1. **The form's own connections first.** `terraced` already emits `role: "steps"`
   segments and already runs `linkComponents` to guarantee a connected skeleton.
   Nothing here duplicates that.
2. **Derived stairs.** Build a graph over platforms: an edge exists when two
   platforms share a street column, are joined by a `steps` segment, or are
   joined by a `bank`. For every adjacent platform pair with no edge, cut a
   flight through the seam — the seam cell nearest a street column on each side,
   `STAIR_PROFILE` width — and register it in the street graph as a
   `role: "steps"` segment **before surfacing**, so it goes through exactly the
   machinery §2.3 built. Derived stairs are capped at
   `MAX_DERIVED_STAIRS = 12` per quarter, because `intersectionsOf` is O(n²) in
   segments.
3. **Dissolve what is still orphaned.** A platform not in the component
   containing the quarter's street network gives its level back: every one of its
   columns takes the level of the neighbouring platform it touches most, ties to
   the lower. One `LEVEL_DISSOLVED` note names the platform and the measurement.
   The quarter ships with fewer levels rather than with an unreachable one.

Step 3 is the honest degradation, and it is what the physics lint's
`traversal.unreachable` would otherwise find for us the expensive way.

### 3.6 What a building knows about its neighbour

Two consumers, and after §3.3 both are nearly free:

- **`foundationY`.** `layDistrict`'s seating line becomes
  `levels?.levelY[levels.at(rect.x0, rect.z0)] ?? cell?.foundationY ?? medianGround(...)`,
  with the bench branch subsumed. One expression, three fallbacks, and the last
  two are exactly today's.
- **The pad apron.** `layDistrict` emits every building's pad with `apron: 2`
  unconditionally, and `applyLevelPad` blends across an apron with a smoothstep
  lerp. On a platform edge that smears two columns of the seam into a ramp and
  undoes the wall. **A building whose lot touches a seam gets `apron: 0`.** This
  is a real bug the moment platforms exist and it is one line.

What v0 deliberately does **not** deliver is a terrace whose bays step down the
street. `emitTerrace` builds one envelope with one floor plane, and per-bay base
Y means a change to the generator, to `BuiltBuilding.meta.floorLevels`, and to
the per-storey interior cell sets the physics lint reads. It is the right
feature, it is not a parallel work package, and it is §10.

So v0's answer to "a building whose ground floor is a storey below its
neighbour's" is: **the block across the street is a storey down, and you see the
wall that makes it so.** The house next door is deferred, deliberately and by
name.

### 3.7 Undercrofts

The hill-town read with the best ratio of appearance to code: a building on the
upper platform whose rear wall *is* the seam has a solid skirt under it, and an
undercroft is that skirt hollowed with a door on the lower level.

The hook is specified here and the geometry is not built in v0. A lot whose rear
edge lies on a seam of `drop ≥ 3` is handed `params.undercroft: true` and a
declared `door` port at the lower level on the rear face. Building it needs the
grammar's themed-underground machinery to accept a below-grade room with an
**exterior** door, which the cellar path does not do today. That dependency is
named rather than assumed; see §10.

## 4. Courtyard blocks

### 4.1 What already exists

Most of a courtyard block is already built, which is why this is a subdivision
and treatment change rather than a new building type:

- At `high` density `TERRACE_COVERAGE` is 1 and `LOT_SIDE_GAP` is 0, so all four
  faces already build continuous terraces sharing party walls.
- The terrace grammar already builds a **blind rear elevation** — small windows,
  no doors — and `stdlib/structures/terrace.ts` says why in as many words: "the
  block interior behind a terrace is a courtyard, and a courtyard is deliberate
  negative space". The building side of this feature shipped in F1.
- `TERRACE_PASSAGE` already cuts a three-column gap into a run longer than
  `TERRACE_MAX_FRONTAGE`, described as "a pedestrian passage / light well".
- The corner unit — quoined pier carried above the roofline, raised parapet, real
  windows in the end elevation, finial lamp — already exists and is already
  triggered by `cornerStart` / `cornerEnd`.

What is missing is: choosing which blocks close, closing the gaps that are not
the passage, deciding where the passage is instead of getting one by accident,
roofing it, and putting something in the middle.

### 4.2 Selection

A block becomes a courtyard block when **all** of these hold. Each is a number
the pass already has.

1. It is a **perimeter** block — `subdivide`'s `perimeter` is true, i.e. its
   shorter axis is at least `2 · MIN_INFILL_SIDE + 2`. A block too thin for two
   opposite strips has no core to enclose.
2. Its core is a **place**: at least `MIN_COURT_SIDE = 9` on both axes after the
   strips are cut. Nine columns holds a well, a tree, and room to stand around
   them; below that it is a light well, which is what the gap already is.
3. Its inscribed rectangle is most of it: `rect.area ≥ COURTYARD_FILL (0.8) ·
   block.columns`. This is not fastidiousness — see §9.1. A wedge block's
   perimeter *cannot* be closed by the rectangle the subdivision cuts, and an
   unclosed perimeter is a courtyard with a hole in it.
4. A **positional draw** keyed on the block's own min corner comes in under
   `courtyards · COURTYARD_CEILING[density]`, where `COURTYARD_CEILING` is
   `{ high: 1, medium: 0.8, low: 0 }`. `low` is zero and reads as never: a village
   is detached houses in gardens, and the gardens *are* the interior.

The draw is positional and keyed on the block's corner, never on a counter,
exactly as `TERRACE_COVERAGE` is — so adding a landmark elsewhere in the quarter
leaves every other block's decision unchanged.

`params.courtyards` defaults to **0**. That is what makes §6 total.

### 4.3 The perimeter closes

Three changes, scoped to a selected block and to nothing else.

**Coverage goes to 1 on this block.** Both the terrace draw
(`TERRACE_COVERAGE`) and the per-lot infill draw (`LOT_COVERAGE`) return 1 for a
courtyard block's lots. An unbuilt lot in a courtyard perimeter is a hole in the
wall, and the whole point of the form is that the wall is unbroken.

**A face with no street still gets a range, facing inward.** Today
`streetBehind` returns `undefined` for the district edge and `subdivide` cuts no
lots there, because "a door onto the outside of the district is a door onto
whatever the next pass happens to put there". That rule is kept — the range's
door does not go on the outside. It goes on the **courtyard**: the strip is cut
as usual and its `face` is set to the *inward* direction, so `seat()` pushes the
building against the block's outer edge and `yawFacing` turns its door into the
court. The result is a blank outer wall on the district edge, which is what a
medina looks like from outside, and a range with its own frontage inside.

**The last gap is the passage, and it is chosen.** §4.4.

### 4.4 The passage

One passage per courtyard block; two when the block's perimeter exceeds
`2 · TERRACE_MAX_FRONTAGE[density]`, placed on opposite faces.

**Where.** On the block's `primary` face — the one `bestSide` already computes,
i.e. the first side in the fixed order that has a street behind it — at the
terrace cut nearest the middle of that face. So the passage is a
`TERRACE_PASSAGE` gap that the block *asked for* rather than one it got from a
frontage cap, and `cutRun` gains one input: where to prefer cutting.

**What it is made of.**

- The gap's `TERRACE_PASSAGE` (3) columns are paved to the courtyard's level and
  claimed in the occupancy grid, so no ground treatment, no scatter and no prop
  lands in it.
- It is **roofed**: from `PASSAGE_HEAD = 4` — one storey — up to the lower of the
  two flanking bays' eave lines, the passage columns are filled with the
  neighbour's wall material, and the head is an arch: a lintel course with a
  stair block springing from each side. That is a pend, or a close, and it is
  the classic answer.
- **Nothing floats, and the check is a readback of our own work.** The pass runs
  after `buildBuildings` and builds the same `builtColumns` set the streetscape
  already builds from the emitted block list. If either flanking column is not
  solid at the arch height — a terrace that refused, an infill that dropped — the
  passage is **not roofed**. It stays an open gap, which still works as an
  entrance. A floating arch is never built.

**How it meets the door and frontage rules.** It does not move a door. A passage
is a gap *between* two bays and both bays keep their own street doors, so "one
street door per bay, on the street" survives without an exception. What it does
add is two exposed side elevations, and the machinery for "this end of the run
stands at an opening" already exists: the run ending at the passage is planned
with `cornerEnd: true` and the next with `cornerStart: true`, so the sides of the
pend get the quoined pier, the raised parapet, real windows and the finial lamp.
That is one line in `cutRun` and it is the reuse this design is most pleased
with.

**How the graph knows.** It does not, and deliberately: the street graph is drawn
by the form before blocks exist, and threading a three-column stub back into it
would perturb the form contract for no gain. The passage is a claim on the
occupancy grid plus a `CourtyardPassage` record the fabric emits with the block,
and the courtyard pass surfaces it. The physics lint's walking agent walks the
*world*, not the graph, so it finds the passage if the passage is walkable —
which is the only property that matters and the one §8 asserts.

### 4.5 The interior

The floor is one plane at the block's platform level, and it is paved. That
matters: with the courtyard floor at the same level as the ranges' foundations,
every inward-facing door is flush and the doorstep pass has nothing to do.

The treatment is chosen by the block's **dominant archetype category** —
`treatmentOf` already maps archetype to treatment — with a positional draw only
breaking ties. So a block of chapels gets a cloister and a block of warehouses
gets a yard, without anybody writing it down.

| treatment | what is in it | what it reuses |
|---|---|---|
| `well` | a well at the centre, worn paving fanning out from it | `pavePlaza`'s well, which already exists |
| `tree` | one canopy tree, a ring of packed earth, a bench | the vegetation palette and the streetscape's bench |
| `cloister` | a covered walk one column deep against the inner faces: a colonnade of the theme's pillar under slab roofing | the only genuinely new geometry in §4, and it is small |
| `yard` | gravel, a woodpile, a cart, washing lines on chains | `GROUND_TREATMENTS.yard` and the props catalog |
| `garden` | beds, flowers, a path ring | `dressGarden`, applied to the core rather than behind one cottage |

A courtyard block is **not** `params.plaza`. A plaza reserves a whole block and
builds nothing on it; a courtyard block is fully built and has a hole in the
middle. Both may exist in one quarter and they do not interact.

### 4.6 Where courtyards meet levels

By §3.3, a platform seam is in `blocked` before `blocksOf` runs, so a block never
straddles a platform, so **a courtyard block is never split-level**. A quarter
that is both `stepped` and full of courtyards produces a series of courtyards,
one per level, each with its own flat floor and its own passage, with retaining
walls between them. That is a hill town, and it is the interaction resolving
itself rather than being resolved.

## 5. The authoring surface

### 5.1 What the model writes

```json
{
  "id": "old_quarter",
  "kind": "district",
  "envelope": { "shape": "region", "size": [220, 200] },
  "params": {
    "fabric": "grown",
    "density": "high",
    "mix": ["townhouse", "shop_row", "workshop"],
    "courtyards": 0.7,
    "ground": "stepped"
  },
  "constraints": [{ "zone": "north" }]
}
```

| key | values | notes |
|---|---|---|
| `params.courtyards` | number, 0…1 | optional; the share of *eligible* blocks that close. Default 0. Out of range is `LOAM-T210` naming the range |
| `params.ground` | `"pad"`, `"benched"`, `"stepped"` | optional; default is what the form implies, which is `"pad"` for every form but `terraced`. Unknown value is `LOAM-T210` with the legal values |
| `city.params.courtyards` | number | optional; applies to every cell that gets a fabric |
| `city.params.ground` | as above | optional; same |
| `intent.character.courtyards` | number, 0…1 | optional; out of range is `LOAM-W488`, a warning naming the range |
| `intent.character.ground` | as `params.ground` | optional; unknown value is `LOAM-W488` |

**Courtyards are not a form.** A courtyard block is orthogonal to the skeleton —
`grid`, `grown`, `radial` and `terraced` can all have them — and making it a form
would force an author whose prompt says "old hill town" to choose between the two
halves of the phrase.

**There are no per-courtyard numeric params.** Passage width, arch height, core
minimum, wall height and coping all derive from `TERRACE_PASSAGE`,
`FLOOR_HEIGHT`, the density and the ground. This is the rule
`docs/URBAN-FORMS-v0.md` §6.1 states and the reason is the same: an author says
*how many, how dense*, never *where*.

### 5.2 Precedence and the fan-out

`params.*` (explicit) > `intent.character.*` > the row's own default > today.
Two new rows, both owned by the layout passes and registered through the existing
seam in `layout/streets-intent.ts`:

- **`layout.courtyardShare`** — `reads: ["era", "formality", "character"]`.
  Returns `character.courtyards` when present, else `ctx.today`, which is
  `params.courtyards ?? 0`.
- **`layout.groundPolicy`** — `reads: ["character"]`. Returns `character.ground`
  when present, else `ctx.today`, which is what `districtGroundPolicy` computes
  today.

**`era` deliberately does not set either.** A mapping from era to courtyards is a
guess the compiler would make on every intent-carrying document, and it would
move every world that has an `era`. The mapping belongs in the classifier
pre-pass, where a human can read the answer before the expensive call. The
classifier kit gains two rows:

| the prompt says | intent |
|---|---|
| old quarter, medina, casbah, kasbah, cloister, "buildings around a courtyard", "narrow lanes and hidden yards" | `character.courtyards: 0.7` |
| hill town, terraced, cliffside, "streets on different levels", "steps between the levels" | `character.ground: "stepped"` (with `character.urbanForm: "terraced"` from the existing row) |

### 5.3 Nothing is accepted and quietly not met

The most expensive recurring defect in this repo is a valid request the compiler
silently declines. Two diagnostics exist for exactly that, and §8 tests both:

- **`COURTYARD_NONE` (`LOAM-T224`)** — `courtyards > 0` and not one block closed.
  Names the measurement that failed and how many blocks failed on it: *"no block
  in `world.old_quarter` can hold a courtyard: 6 of 6 have a core narrower than 9
  columns. Raise `params.blockSize` above 44, or raise `density` to `high` so the
  perimeter builds a continuous street wall."*
- **`DISTRICT_GROUND` (`LOAM-T223`)** — `ground: "stepped"` and the quarter came
  out as one platform. Names the relief measured and the storey it needed.

## 6. Byte-identity

**The guarantee.** A document that names neither new key, and carries no new
intent key, compiles to exactly the world it compiles to today — with one
enumerated exception, stated here rather than buried.

The mechanisms, each checkable independently:

1. **`params.courtyards` defaults to 0**, so no block is selected, so `subdivide`
   walks exactly the code it walks today. Selection is a guard at the top of a
   new function that is not called when the share is zero.
2. **`params.ground` defaults to the form's implication**, and the rename of
   `"stepped"` → `"benched"` is what keeps `terraced` unmoved: `padFor` returns
   null for both, `terraced` declares `"benched"`, and seam treatment is gated on
   `"stepped"`. A `terraced` quarter therefore compiles today's world.
3. **`groundLevelsOf(bounds, [])` returns `null`**, and `layDistrict` branches
   once on it — the same shape `benchLevels` already has and for the same reason:
   the ordinary path allocates nothing.
4. **`levelY[at(...)]` equals `benchLevels`' answer** for a `terraced` quarter,
   column for column, because it is derived from the same `FormBench.runs` by the
   same fill. `foundationY` is unchanged, so pads and placements are unchanged.
5. **The platform-aware `blocked` mask is a no-op** when there are zero or one
   platforms, which is every quarter that did not opt in.
6. **Both new fan-out rows return `ctx.today`** when their key is absent, which is
   fan-out law 2. `intent-rows.test.ts` already enforces totality for every row
   and will enforce it for these.
7. **The courtyard pass and the retaining pass are no-ops on empty input**, wired
   into `structures/index.ts` the way `digCanals` is — a call that returns
   untouched when no quarter declared anything.
8. **`FormBench.id` is optional** and read only by the report.

**The exception, in full.** §2.5: the column-ownership fix changes the surfacer
for every world. It provably does not change a flat one; it does change worlds
with a city or a `terraced` quarter, which are the worlds with the defect. WP-A
lands alone and carries that regeneration, with the review condition stated as a
test rather than as a judgement (§8.4).

## 7. Implementation plan

Four packages behind one that lands first. **No two packages own the same file**,
and the rule that made Phase 4.1 work is restated: `district.ts` is edited by
**WP-0 only**; every other package owns new files that `district.ts` calls
through seams WP-0 leaves as deliberate no-ops. The standing cap is three agents
total across the whole tree, so A–D run in two waves.

### WP-0 — the contract *(lands first, alone; no golden may move)*

**Creates**
`packages/compiler/src/layout/levels.ts` (`GroundLevels`, `LevelSeam`,
`groundLevelsOf`, `levelSeams`).

**Edits**
`layout/forms/types.ts` (`FormBench.id?`),
`layout/types.ts` (`groundPolicy` gains `"benched"`),
`layout/solve.ts` (`padFor` reads all three values),
`layout/from-document.ts` + `layout/district.ts` (`districtGroundPolicy` reads
`params.ground` and the new row; `resolveDistrictFabric`'s double-resolution
comment extended to cover it),
`layout/district.ts` (the `GroundLevels` branch in `foundationY`; the
platform-aware `blocked` mask; the seam-aware pad apron; the two seam calls into
WP-B's and WP-C's modules, both no-ops until they land),
`layout/district.ts`'s `sampleGround` (**reads the resolved ground policy rather
than re-deriving it from `conformLevels(node) && relief <= 1`** — see §9.9),
`structures/index.ts` (the two new pass slots, both no-ops),
`packages/spec/src/settlement/types.ts` (`params.courtyards`, `params.ground`,
the two `CityParams` mirrors),
`packages/spec/src/settlement/validate.ts`,
`packages/spec/src/intent/types.ts` (`character.courtyards`, `character.ground`),
`packages/spec/src/terrain/diagnostics.ts` (`DISTRICT_GROUND` = `LOAM-T223`,
`COURTYARD_NONE` = `LOAM-T224`, `LEVEL_DISSOLVED` = `LOAM-W410`,
`RETAINING_REFUSED` = `LOAM-W411`, `INTENT_GROUND_UNKNOWN` = `LOAM-W488`).

**Done when** every existing test passes unmodified, no golden hash moves, and a
`terraced` quarter's `foundationY` list is identical before and after.

### WP-A — column ownership *(lands alone; carries a golden regeneration)*

Owns `structures/roads.ts`, a new `structures/street-owner.ts` (the rank order,
the claim, the pinned levelling), `structures/street-stairs.ts` (endpoint pins,
and the balustrade emitted in the furnish phase), `structures/sweep.ts`'s
`synthesizeTreads` (two optional endpoint pins), `test/street-ownership.test.ts`.

Touches nothing WP-B/C/D touch. **Independent of WP-0**, and may run in parallel
with it, because it is the only package that edits the surfacer and the only one
that regenerates goldens.

### WP-B — multi-level ground

Owns `layout/platforms.ts` (the block-median platform construction of §3.3),
`structures/retaining.ts`, the `RETAINING_PROFILE` block in
`structures/profiles.ts`, `test/levels.test.ts`. Fills the retaining slot WP-0
left in `structures/index.ts` and the platform slot it left in `district.ts`.
Reads WP-0's `levels.ts`; adds no plumbing of its own.

### WP-C — courtyard blocks

Owns `layout/courtyards.ts` (selection, perimeter closure, passage placement,
`CourtyardPassage`), `structures/courtyards.ts` (the interior treatments and the
passage arch), `test/courtyards.test.ts`. Fills the courtyard slots WP-0 left.
Reads `treatmentOf` and `dressGarden` from `grounds.ts` and `pavePlaza`'s well
without editing either.

### WP-D — the authoring surface, kits and identity

Owns `layout/streets-intent.ts` (the two new rows), `docs/kits/settlement-author.md`,
the classifier kit, `test/courtyards-vocabulary.test.ts`,
`test/levels-identity.test.ts`. Touches no compiler pass.

## 8. Test surface

### 8.1 Unit — the shape each piece must have

- **Ownership.** Every column claimed by exactly one segment; the owner is the
  rank-minimal claimer; two runs from one graph give identical `owner` arrays.
- **Pinning.** A profile pinned at index `i` returns exactly `pin[i]` there and is
  1-Lipschitz everywhere (the property `gradeProfile`'s existing test asserts,
  re-asserted under pins).
- **Platforms.** `groundLevelsOf` over `terraced`'s benches reproduces
  `benchLevels` column for column. Platform indices are stable when a landmark is
  added elsewhere in the quarter.
- **Seams.** Every 4-adjacent pair of columns with different platforms is in
  exactly one seam component; every seam has a treatment; a seam whose drop
  exceeds `RETAIN_MAX` is a bank and builds nothing.
- **Reachability.** The platform graph is connected after §3.5, on a generated
  hillside; a synthetically orphaned platform is dissolved and draws exactly one
  `LEVEL_DISSOLVED`.
- **Courtyard selection.** A block failing each of the four criteria in §4.2 is
  rejected for that reason and no other; the draw is positional (adding a
  landmark elsewhere changes no other block's decision).
- **Perimeter.** A selected block's perimeter has exactly one gap per declared
  passage and no other gap wider than 1 column.
- **Determinism.** Same document + seed → byte-identical world, twice, on one
  compiled world per feature.

### 8.2 Generated worlds — what unit tests cannot see

Phase 4.1's five forms each passed their unit tests and still shipped three
defects that only a generated world exposed: a `linear` lot mask two ribs wide,
a `terraced` quarter with zero buildings, and forty blocks of canal water pouring
out of the ends of every run. The pattern in all three is the same — the piece
was correct and the *composition* was not — and no amount of unit testing sees
it. So this phase's acceptance is three generated worlds, each produced by
`terrainist generate` from a text prompt, each emitted and read back:

**W1 — the hill town.** Prompt names a terraced hill town. Assertions beyond the
26-rule lint at zero:

- every platform is reachable from every other in a **walking BFS over the
  emitted world** (not over the graph);
- no street column differs from a 4-neighbouring street column by more than 1;
- every retaining wall column has ground at `levelY[below]` on one side and
  `levelY[above]` on the other, and a solid column between them;
- `road.proud` is zero, which is the rule that catches a street left standing on
  a bank;
- the balustrade exists: at least one `steps` segment carries rail blocks, and
  `unsupported.chain` and `floating.isolated` are both zero over them.

**W2 — the old quarter.** Prompt names an old quarter with courtyards.

- **every courtyard interior is reachable from the street network on foot.** This
  is the single assertion that catches "the passage got roofed shut", "the
  perimeter closed with no way in" and "the arch was built where there was no
  wall to spring from", and it is the reason W2 exists;
- every courtyard block has 1 or 2 passages, each roofed or deliberately open,
  and no roofed passage has a block with nothing under it;
- every inward-facing door is flush with the courtyard floor (the doorstep pass
  reports zero stepped and zero dropped inside a courtyard).

**W3 — both.** The hill town *with* courtyards, which is the composition §4.6
claims resolves itself. One assertion: no courtyard block spans two platforms.

Each of W1–W3 is a small world (≈256²) kept out of the per-push gate the way the
dev-world walk already is.

### 8.3 The request that is accepted and quietly not met

A compile-level test over three fixtures, and it is the most important test in
the phase:

- `courtyards: 1` on a quarter whose blocks are all too small → exactly one
  `COURTYARD_NONE` naming the measurement, and the world still compiles;
- `ground: "stepped"` on flat ground → exactly one `DISTRICT_GROUND` naming the
  relief, and the world still compiles as `"pad"`;
- a seam whose drop exceeds `RETAIN_MAX` → exactly one `RETAINING_REFUSED`
  naming the drop, a graded bank in the world, and **no** unbuilt cliff.

None of the three may be silent, and none may fail the compile.

### 8.4 Identity, and the one regeneration

- **`levels-identity.test.ts`** compiles every committed `examples/*.loam.json`
  through `skipEmit` and hashes the column plan, every tree, every decoration and
  every structure block — the `intent-identity.test.ts` method — against hashes
  committed by WP-0. Total, not a spot check.
- **The standing rule holds for WP-0, WP-B, WP-C and WP-D**: no golden may be
  regenerated.
- **WP-A's regeneration is a test, not a judgement.** The condition is stated
  mechanically: every golden whose document contains no `city` node and no
  `terraced` quarter must be byte-identical; every golden that moves must move
  only on columns the street surfacer claims. A diff outside that set is a bug in
  the ownership rule.

## 9. What in the existing code fights this

Nine things, in descending order of how much trouble each will cause.

1. **`blocksOf` reduces every block to its largest inscribed rectangle.** An
   `organic`, `grown` or `radial` block's ragged margin is outside that rectangle
   and is not subdivided — `docs/URBAN-FORMS-v0.md` §9.3's known cost. Courtyards
   make it *visible* rather than merely wasteful: the perimeter closes around the
   rectangle and the margin is an open hole in it. §4.2's `COURTYARD_FILL` test
   is the v0 guard, and the real fix is the polygon lot cutter that is out of
   scope here as it was there.
2. **`layDistrict` emits every building pad at `apron: 2`,** and `applyLevelPad`
   blends an apron with a smoothstep lerp in list order. On a platform edge that
   ramps two columns of the seam and undoes the wall. WP-0 fixes it (§3.6) and it
   is a real bug the moment platforms exist.
3. **`carriagewayCells` dedupes globally in segment-list order,** so
   `segmentOwners` — which decides *which street a lot fronts* — is already
   first-write-wins by a different rule from §2.2's. These are genuinely different
   questions and must **not** be unified: a lot needs *a* street, and the surfacer
   needs *the* owner. But the lot's attribution is order-dependent, which is worth
   knowing before it becomes a defect.
4. **`medianGround` is the seating rule for everything the solver places,** and
   `DESIGN.md` already records that a program on broken ground shows a step at one
   edge. `GroundLevels` fixes seating for lots inside a quarter and does nothing
   for landmarks the solver placed. Do not claim otherwise.
5. **`stdlib/structures/terrace.ts` has no per-bay base Y and no passage bay.**
   That is why §3.6 defers a stepped terrace and why §4.4's passage is a gap
   between two runs rather than an arch through one. Both are the right calls for
   v0; both are the wrong calls forever.
6. **`street-stairs.ts` deliberately builds no balustrade** and documents the
   reason. Its doc comment is the specification for the furnish phase, and it
   must be updated in the same commit that makes it wrong.
7. **`intersectionsOf` is O(n²) in segments** with a per-cell membership test
   inside. Derived stairs add segments; `MAX_DERIVED_STAIRS` caps them at 12.
8. **`digCanals` writes fluid into the column plan before the surfacer runs.** A
   channel column is now owned by the channel segment under §2.2, which is correct
   — but the ordering in `structures/index.ts` is load-bearing and the retaining
   pass has to slot in *between* the buildings and the canals, not after them.
   State the order once, in `structures/index.ts`, where the canal comment already
   states it.
9. **`sampleGround` infers `levelled` from `conformLevels(node) && relief <= 1`**
   rather than reading the resolved ground policy. Under `params.ground:
   "stepped"` on an authored district it currently gets the right answer *by
   accident*, because real slope has relief above 1. Two answers to one question
   is the defect class `DESIGN.md` names; WP-0 makes it read the policy.

## 10. Open questions

1. **Should ownership decide material as well as level?** §2.3 says no, and the
   reason is the identity argument: keeping painting on today's last-write-wins
   order is what makes flat worlds provably unmoved. It also means a lane crossing
   an avenue still paints the junction in lane material, which is arguably wrong
   and definitely cheap to change later. This is the decision most worth
   overruling, and the cost of overruling it is one more golden regeneration.
2. **`RETAIN_MAX = 6` and `RETAIN_RAIL = 3` are unmeasured.** Six blocks is about
   the tallest dry-stone retaining wall that reads as built rather than as a
   cliff face with a coping on it, and three is where the drop starts being worth
   a rail. Both want a walk before they are believed.
3. **The storey quantisation of block medians.** `round(median / 4) · 4` makes
   neighbours differ by whole storeys, which is what a party wall and a cornice
   want. On a shallow slope it collapses every block to one platform and the
   feature does nothing; on a steep one it gives every block its own platform and
   the quarter is a staircase. The reachability rule (§3.5) is the guard against
   the second, but the *number* is a guess and a relief-derived one would repeat
   `docs/URBAN-FORMS-v0.md` §10.3's mistake — the deciding variable there turned
   out to be the gradient, not the relief. Measure the gradient distribution on a
   real generated hill before touching this.
4. **Should `terraced` default to `"stepped"`?** §3.2 says no, to keep it
   byte-identical, on the precedent of §10.6 of the urban-forms doc. It is one
   line and one golden regeneration the moment the walls have been walked, and
   until then a `terraced` quarter still has raw dirt banks between its benches —
   which is the thing this phase is supposed to be about.
5. **Undercrofts.** §3.7 specifies the hook and not the geometry, because the
   grammar's themed-underground path does not accept a below-grade room with an
   exterior door. Whether that is a small change to the cellar machinery or a new
   archetype is genuinely unknown and worth ten minutes of somebody's reading
   before it is scheduled.
6. **A terrace whose bays step down the street.** The single best hill-town read
   available, deferred because it changes `emitTerrace`, `meta.floorLevels` and
   the physics lint's per-storey interior cell sets at once. `BENCH_HEIGHT = 4`
   was chosen so that a party wall steps by a whole floor, so the intent is
   already recorded in the code; only the delivery is missing.
7. **Should a courtyard ever be split-level?** v0 says no, structurally (§4.6),
   and a courtyard with a step in it is a real thing in real towns. Allowing it
   means letting a block span a platform, which is the invariant everything else
   in §3 rests on. Probably the right answer is a *later* feature that adds a
   deliberate seam inside a courtyard rather than relaxing the invariant.
8. **Two passages, or a passage and a gate?** §4.4 gives a long block two
   passages on opposite faces. A courtyard with two ways through is a
   thoroughfare, not a courtyard, and the alternative — one passage and one
   locked gate you can see through — is more interesting and needs a gate the
   props catalog may not have.
