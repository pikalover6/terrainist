# The ground contract — declare → resolve → build

> Normative for the ground-contract rewrite (WP-1 → WP-6). It specifies one
> thing that looks like eleven: **who decides the level of a column, and when**.
> `docs/DESIGN.md` → "The ground contract — declare → resolve → build" is the
> ratified brief and this document may not contradict it; everything here is
> that brief made precise enough to implement without re-deriving it.
> `docs/COURTYARDS-AND-LEVELS-v0.md` §2 (column ownership) is the prototype this
> generalises and does not amend; `docs/URBAN-FORMS-v0.md` is untouched.

---

## 1. The rule, and what "decided" means

### 1.1 The rule

> **Nothing may modify the ground after the ground is decided.**

Today eleven passes write `plan.ground` after materialisation, each reading
whatever the previous ones left, with no arbitration beyond array-write order.
Six walked defects between 2026-08-04 and 2026-08-06 are one defect wearing six
faces, and all six are collisions in that pile. Column ownership
(`structures/street-owner.ts`) fixed exactly one of the eleven and took street
cross-section unevenness from 38% to 0.08%. This contract does the same thing
for all of them.

### 1.2 The three phases

**Declare.** Every subsystem emits what it needs from the ground as data,
mutating nothing. A declaration is a `GroundIntent` (§2). Every pass already
computes this; today it applies it immediately instead of returning it, which is
what makes the conversion mostly mechanical.

**Resolve.** One function, `resolveGround`, reconciles the whole declaration set
into a final ground: precedence by `INTENT_RANK` (§4), transitions generated
once (§5.6), conflicts reported rather than silently absorbed (§6).

**Build.** Everything places blocks against a **frozen** ground. The arrays are
handed out `readonly`; writing to one is a type error rather than a convention
(WP-6).

### 1.3 What freezes, and when — normative

`ColumnPlan` carries eleven mutable arrays. They divide into three groups, and
the division is the whole of the god-object mitigation the brief asks for
("it decides *levels and transitions only*").

**Group L — the levels. Frozen by the resolver.**

| array | why it is a level |
| --- | --- |
| `ground` | the level. |
| `fluidTop` | the column's *second* level. Every pass that moves one moves the other: `surfaceRoute`, `dressStreetStairs`, `paveSidewalks`, `sweep`, `levelPropPad`, `surfaceColumn`, `gradeBank` and `blendShoulders` each write `fluidTop = ground` in the same statement group, and `digCanals` and the two wells write it *apart* from `ground`, which is precisely why it has to be declarable rather than derived. |
| `fluidKind` | the discriminant that says which of the two the walkable top is. |

The three freeze **together**, at the end of resolve, and are read-only from
there on. `fluidKind` is included over the narrower reading ("only `ground` is
a level") for one reason that is not aesthetic: the fluid-stability invariant is
a *joint* predicate over the three, and `LOAM-T110 UNSTABLE_FLUID` is a physics
lint failure — a compiler bug by definition. Freezing two of the three would
leave a build-phase pass able to make a column wet under a ground the resolver
had already promised, which is the one class of ground defect that ships as a
crash-grade failure rather than as an ugly walk. Note also that `fluidKind` is
still not a *material*: no block state is chosen anywhere in the resolver.

The invariants the resolver enforces on the frozen triple, each an error
(`LOAM-E494`, §6) because a violation is a compiler bug and not an authoring
mistake:

1. `WORLD_MIN_Y < ground[k] <= WORLD_MAX_Y`;
2. `fluidTop[k] >= ground[k]`;
3. `fluidKind[k] === FluidKind.NONE ⟹ fluidTop[k] === ground[k]`.

**Group M — the materials. Never frozen; they keep their passes and their
existing last-write-wins order.**

`surface`, `subsurface`, `soil`, `snow`. This is the split that made column
ownership provable — "ownership decides geometry; painting keeps its own
order" — and it is what makes the flat-world identity argument hold (§12): on
levelled ground every claimant's level is the same number, so the geometry
written is bit-for-bit what was written before, and the material sequence is
untouched.

Two consequences worth stating, because they are the two places a converted pass
loses a line it used to write:

- **Snow.** Eleven sites write `plan.snow[idx] = 0` beside a level write, always
  for the same reason (the layer that sat on the old surface is now buried).
  Those eleven lines are replaced by one build-phase rule against the resolver's
  published `moved` mask: *a column whose resolved level differs from its
  materialised level carries no snow.* The resolver does not write `snow`; it
  publishes the mask that decides it.
- **Soil.** Six sites write `if (plan.soil[idx] === 0) plan.soil[idx] = 1`. That
  stays exactly where it is. It is a material depth, and `retaining.ts`'s
  `deepen` is the proof that it is: a wall is as deep as it is tall, and that is
  a statement about masonry, not about a level.

**Group C — the classification masks. Not frozen, and not the resolver's.**

`biome`, `lakeMask`, `oceanMask`, `volcanic`, `volcanicUpper`, `lavaFlow`,
`caves`. `digCanals` and `precincts.surfaceColumn` clear `lakeMask`/`oceanMask`
today, and they keep doing so — deciding that a dug urban channel is a street
rather than a river biome is a fabric judgement, not a level. The resolver
publishes `wet` (§5.1) so those passes derive from one answer instead of a
second mask, and §11 asserts they never disagree. See §13.1.

### 1.4 Tiers, and the one legal read

Three classes of claim are *definitionally* a function of a higher-ranked
claim's answer, and pretending otherwise would either re-introduce write-order
dependence or force a fiction:

- a **sidewalk** takes the level of the carriageway it flanks;
- a **doorstep landing** meets the ground outside the threshold;
- a **verge or bank** ramps to whatever it is ramping to;
- a **prop pad** fills only where the finished ground is below it.

So `resolveGround` is defined over the rank order in **tiers** (§4.2), and the
rule is:

> A pass declaring in tier *n* may read the resolved answer for tiers `0 … n−1`.
> It may never read its own tier or a lower one, and no tier may move a column a
> higher tier decided.

This is still one resolver, one precedence order, and one pure function of the
declaration set: the tier boundaries are fixed constants, so the recursion is
well-founded and the result is independent of the order subsystems are asked to
declare in. It is the same construction `surfaceStreetGraph` already uses
(claim in rank order, then level, then dress) lifted one level up. The driver
must make the escape hatch unabusable by typing: `declare(tier, resolvedSoFar)`
hands a pass a `ResolvedGround` that contains only strictly higher tiers, so a
pass *cannot* see its own.

### 1.5 What the resolver never decides

- **Materials, blocks and props** — Group M above.
- **Placement.** The resolver does not decide *where* anything goes. It is
  handed columns and asked what the ground under them does. A pass that wants
  to move something moves it before it declares.
- **Refusal to build.** The resolver reports that a claim lost columns; the
  *pass* decides whether losing them means the thing cannot be built. A flight
  of steps that loses its landing is still the street-stair pass's call, exactly
  as `streetStairLevels`' whole-run refusal is today.

---

## 2. The declaration types

### 2.1 `GroundIntent` and `GroundClaim`

```ts
/** A claim on the ground, from one subsystem, before anything is decided. */
export interface GroundIntent {
  /** Who is asking — a node path or a pass id. Appears in diagnostics. */
  readonly source: string;
  /** Which precedence class this claim belongs to. See `INTENT_RANK`. */
  readonly sourceClass: GroundSourceClass;
  /** What kind of claim. Constrains which classes are legal — see §2.2. */
  readonly kind: "platform" | "profile" | "face" | "clearance" | "preserve";
  /** The columns and the levels asked for. Lazy; region-sized lists are normal. */
  readonly columns: Iterable<GroundClaim>;
  /** Absorbed how, when a neighbour disagrees: a ramp, a step, a wall. */
  readonly transition: "ramp" | "step" | "wall" | "none";
  /**
   * Fewest columns the claim needs to be worth anything. The resolver reports
   * `GROUND_CLAIM_REFUSED` below it; it never acts on it. Defaults to 1.
   */
  readonly minColumns?: number;
  /** Within-class ordering, for a class that has one (`street.network`). */
  readonly subRank?: number;
}

/** One column of one claim. */
export interface GroundClaim {
  /** Region-major column index, as every pass already computes it. */
  readonly idx: number;
  /** The level asked for: the Y of the topmost solid block. */
  readonly y: number;
  /**
   * The fluid this claim asks the column to hold. Omitted means "dry, and
   * `fluidTop` follows `y`" — which is every claim but the canal's and the two
   * wells'.
   */
  readonly fluid?: { readonly kind: 1 | 2; readonly top: number };
}
```

The brief's sketch glosses `columns` as `{ idx, y }` and leaves `GroundClaim`
undefined; the optional `fluid` field is that gloss fleshed out, and it exists
because three declarers — `digCanals`, `pavePlaza`'s well and
`furnishCourtyards`' well — declare a column whose `fluidTop` is not its
`ground`. Without it those three cannot be expressed at all and would have to
keep mutating, which would leave a hole in the freeze.

`sourceClass` is likewise a refinement, not a contradiction: the brief says
`kind` "drives precedence", and `kind` alone cannot, because a building
footprint and a prop pad are both `platform` and must not rank together. §4's
order is over `(kind, source-class)`, exactly as the work item asks.

### 2.2 The five kinds

| kind | means | legal classes | what the resolver does with it |
| --- | --- | --- | --- |
| `platform` | this footprint is level at `y` | any | proposes `y` for each column |
| `profile` | these columns follow this polyline's levels | any | proposes `y` for each column; identical to `platform` in the resolver and distinct in the *report*, because "my run lost 25 columns" and "my rectangle lost 25 columns" are different news |
| `face` | this column presents a cut face of `drop` | `retaining.*` only | proposes `y` (the coping's walking level) **and** marks the column as a face, which suppresses transition generation across it — the face *is* the transition |
| `clearance` | nothing may stand above `y` here | any | proposes no level; clamps the winning level to `min(y)` over all clearances on the column (§5.5) |
| `preserve` | this column is finished; later passes may not move it | any | proposes no level of its own; makes any strictly-lower-ranked claim on the column a reported refusal instead of a silent loss (§5.4) |

`platform`/`profile`/`face` are level claims; `clearance` and `preserve` are
filters. A `clearance` or `preserve` intent still carries a `sourceClass`,
because both name a claimant in a diagnostic and both are ordered against level
claims by rank.

### 2.3 `preserve`, precisely

`preserve` is not "wins the column" — rank already decides that, and a
`preserve` from a low-ranked source must not beat a high-ranked level claim.
What it changes is **audibility**:

> A level claim that loses a column to a strictly higher rank loses it silently
> (the report records it; no diagnostic fires). A level claim that loses a
> column another claim has declared `preserve` produces `GROUND_CONFLICT`,
> naming both claimants, the column and the two levels.

That distinction is the whole point. A lane losing a junction column to a
boulevard is normal and happens thousands of times per world; a doorstep cutting
into a column a retaining wall's balustrade stands on is news, and today it is
invisible until somebody walks the world. `preserve` is how a pass says "if I
lose this one, that is a defect, not an ordering".

A `preserve` intent is declared alongside the level claim it protects, from the
same source, over a subset of the same columns. The resolver requires this: a
`preserve` on a column its own source did not win is `LOAM-E494` (a declarer
bug).

### 2.4 `clearance`, precisely

`clearance` is a **ceiling on the resolved level**, and a fact the build phase
also reads. Two uses exist in today's code and neither is currently expressible:

- a **bridged column** — `surfaceRoute` and `sweep` both leave a spanned column
  entirely alone, with a comment that rewriting it "would fill the channel and
  move `fluidTop` under a river the validator has settled". Under the contract
  the spanning run declares `clearance` at the deck's underside plus `preserve`
  on the water column, which turns a comment into a checked property;
- an **arched passage** — `furnishCourtyards` refuses to roof a pend whose floor
  is not one plane, because "an arch across a step is a lintel with daylight
  under one end". The arch springing declares `clearance` at `floorY +
  PASSAGE_HEAD`.

If a level claim's winner exceeds a clearance, the level is clamped to the
clearance and `GROUND_CLEARANCE_VIOLATED` fires naming both (§6). Clamping
rather than refusing is deliberate: a clamped column is walkable and reported;
a refused one is a hole.

### 2.5 `transition` is a request, not an answer

An intent's `transition` says how the declarer *wants* its edge absorbed. The
resolver's answer comes from the drop and the run (§5.6) and is authoritative,
with one exception in each direction:

- `"none"` on **either** side of a boundary suppresses the transition entirely.
  That is how a street says "both sides of this edge are mine, do not build a
  kerb down the middle of my carriageway".
- A request the drop/run table cannot honour is **substituted**, and the
  substitution is recorded in the report (`GROUND_TRANSITION`, a note). A
  request for `"wall"` on a run of four columns becomes `"ramp"`, because
  `MIN_RETAIN_RUN = 6` and a masonry face taller than it is long is a buttress
  nobody asked for.

---

## 3. The pass inventory

Eleven passes write `plan.ground` in the settlement pipeline. They are listed
here in **pipeline order** — the order the inversions in §4.4 are measured
against — with the brief's own listing (`roads`, `precincts`, `canals`, `sweep`,
`streetscape`, `street-stairs`, `retaining`, `props`, `plaza`, `doorsteps`,
`courtyards`) mapped onto it. Two further sites that also write levels are
listed in §3.12 because they are not among the eleven and must not be forgotten
by WP-6.

Each subsection states (a) what it writes today and why, (b) its declaration
mapping, (c) what it writes that is *material, not level*, and therefore stays
behind after conversion.

| # | pass | file | tier | class |
| --- | --- | --- | --- | --- |
| 3.1 | precincts | `structures/precincts.ts` | A | `precinct.ground` |
| 3.2 | plaza | `structures/plaza.ts` | B | `plaza.ground`, `plaza.well` |
| 3.3 | retaining | `structures/retaining.ts` | B | `retaining.seam`, `retaining.skirt` |
| 3.4 | courtyards | `structures/courtyards.ts` | B | `courtyard.floor`, `plaza.well` |
| 3.5 | canals | `structures/canals.ts` | A | `fluid.channel` |
| 3.6 | streets | `structures/roads.ts` `surfaceStreetGraph` | C | `street.network` |
| 3.7 | street-stairs | `structures/street-stairs.ts` | C | `street.network` |
| 3.8 | streetscape | `structures/streetscape.ts` | C | `street.sidewalk` |
| 3.9 | roads | `structures/roads.ts` `buildRoadNetwork` | C | `road.network` |
| 3.10 | props | `structures/props.ts` | D | `prop.pad` |
| 3.11 | doorsteps | `structures/doorsteps.ts` | D | `doorstep.landing` |
| — | sweep | `structures/sweep.ts` | — | the *engine*; see §3.13 |

### 3.1 `precincts` — `surfaceColumn`, the precinct ground works

**(a) Today.** `surfaceColumn(plan, idx, top, state, states)` writes `ground`,
`fluidTop`, `surface`, `subsurface`, `soil = 0`, `snow = 0`, `fluidKind = NONE`,
`lakeMask = 0` and `oceanMask = 0` for every apron, taxiway and quay column; the
forecourt and runway strip get `ground`/`fluidTop`/`snow` only ("grass, but
level"). It runs first of everything, and it has to: a precinct grades its own
apron, and every pass after it measures the ground it left behind. On a healthy
compile the solver's pad edit has already done the levelling, so the loop writes
surfaces and changes no heights at all.

**(b) Declaration.** One `platform` intent per precinct kit, `source` = the
kit's node path, `sourceClass: "precinct.ground"`, `transition: "ramp"` (the
forecourt walks out to its own ground rather than ending at a cut face), columns
= the whole precinct rect at `groundY`. A quay declares `fluid`-less columns at
the quay level and declares nothing at all for the water it fronts — the water
is the terrain's and `padFor` already returns `null` for `precinct.harbour@0`
precisely so it stays that way.

**(c) Material, stays behind.** `surface` (apron / taxiway / marking / quay /
quay edge), `subsurface = stone`, `soil = 0`, the `lakeMask`/`oceanMask` clears
(Group C), and every block the kit emits.

### 3.2 `plaza` — `pavePlaza` and `buildWell`

**(a) Today.** The plaza's *level* is the solver's pad; the pass writes only
`surface` over the paving, and hands the road pass two masks (`paved`,
`keepClear`). `surfaceRoute` reads `paved` and keeps `plan.ground` there rather
than re-levelling, and `pinLevel` bands a paved station to 0 — so the plaza
already outranks streets for levels today, by mask rather than by rank.
`buildWell` is the one level write: it digs `ground[centre] = groundY − 1` and
fills the hole with water at `fluidTop = groundY`, having first proved all nine
columns of the 3×3 are in-region, dry and at one level.

**(b) Declaration.** Two intents.
- `platform`, class `plaza.ground`, over the plaza rect at the pad's level,
  `transition: "ramp"`. This makes the `paved` mask's level behaviour a rank
  instead of a special case (inversion I7, §4.4).
- `platform`, class `plaza.well`, one column at `groundY − 1` with
  `fluid: { kind: WATER, top: groundY }`, **plus** a `preserve` over the eight
  perimeter columns at `groundY`. The stability argument in the module header is
  "the geometry is the proof"; the `preserve` is what makes the proof survive
  another pass, and it is the cleanest use of the kind in the codebase.

**WP-4 measured one thing this mapping did not say.** The two intents are not
independent: `plaza.ground` (30) outranks `plaza.well` (40), so a paving claim
that keeps the centre column *wins* it and fills the well in. The shadow declarer
could drop that column after the fact, because it saw the finished pass; a
converted pass declares the paving **before** the well is dug, so the 3×3
flatness test has to be split out of `buildWell` and taken first (`wellSite`).
The paving then declares "the rect, less the column the well is about to take",
which is what it actually owns when it is finished. Any pass whose own claims
straddle a rank boundary has this shape, and this is the only one in the eleven.

**(c) Material, stays behind.** All paving `surface` writes, the well's rim
`surface`, the ring/post/lantern blocks.

### 3.3 `retaining` — the wall, the skirt, the bank, the kerb, the finish

Reworked concurrently into a swept-course-with-coping shape; the mapping below
is stated against **that** shape, not the per-column one it replaces.

**(a) Today.** Four things, of which two write levels:

1. **The wall.** For each `LevelSeam` and each `skirtSeams` record with
   `treatment: "retaining"`, the face course is found by `walkBack`
   (perpendicular, bounded by `RETAIN_FACE_SETBACK = 12`), thickened by
   `thickenCourse`, chained by `chainsOf`, and swept with `retainingProfile`.
   `sweep()` writes `ground`, `fluidTop`, `snow`, `surface`, `subsurface` and
   `soil` on the course; the pass then `deepen`s the soil to the drop and emits
   the coping **as a structure block as well as a plan column**.
2. **`gradeBank`** raises the low side toward the face one block per ring for
   `drop` rings, writing `ground`, `fluidTop`, `subsurface = bank` and `soil`.
   Never touches a street, a footprint or water.
3. **`kerbSeam`** writes `surface = coping` on a drop-1 seam. No level.
4. **`faceCuts`** — the finish. Post-rework it is: members (on a platform, dry,
   8-neighbour drop ≥ 2), grouped 8-connected into components; drop-1 gaps
   bridged where a column touches ≥ 2 members of one component, decided in one
   scan and committed after it; `thickenCourse` with the higher ground preferred
   so the course thickens *into* the platform; then per course column
   `subsurface = revetment`, a soil band as deep as its own drop, and a
   **coping** on the surface, withheld from street, footprint and wall columns.
   **No level moves anywhere in `faceCuts`** — that property is what makes it
   safe to run over a whole quarter, and it survives the conversion untouched.

Three defences exist in this pass *only* because later passes can move its
ground: the dilated `street` mask (a wall the streetscape would re-level "is not
a wall, it is 75 floating blocks"), the `seam` mask handed to `blendShoulders`,
and the coping-as-structure-block. All three are deletable at WP-6 (§10).

**(b) Declaration.**

- Per wall run: `face`, class `retaining.seam` (a declared platform-to-platform
  seam) or `retaining.skirt` (one measured from the finished ground by
  `skirtSeams`), `transition: "wall"`, columns = the thickened, chained course
  at `levelY[above]` — the coping's walking level. Plus `preserve` over the
  same columns: a balustrade may never be left standing over ground something
  else dropped, and that is exactly the `unsupported.chain` finding that
  survived four rounds of fixes. Both go in **one** `commit`, so the resolver
  sees the face and the promise together.
  **WP-4 refined "columns"**: the declaration is the columns the sweep would
  *level*, which is the claimed course minus any column it spans (§2.4) — the
  shadow declarer had declared every claimed column at its post-sweep level,
  which for a spanned column is an agreeing claim on a level nobody moved. The
  `seam` mask handed to `blendShoulders` keeps the **claimed** set, because what
  it protects is geometry: a face is not to be smoothed whether or not its own
  column carried a level.
- Per bank: `profile`, class `verge`, `transition: "ramp"`, columns = the ring
  targets `gradeBank` computes. Tier D, so a bank can only move columns nothing
  else claimed — which is the generalisation of the `street`/`occupied`/water
  guards the function already carries by hand.
- `kerbSeam`: **nothing**. Materials only.
- `faceCuts`: **nothing**. Materials only.

**(c) Material, stays behind.** The revetment `subsurface`, the coping
`surface`, `deepen`'s soil depths, the bank earth, the rail, the weep courses,
and every emitted block. Note that `faceCuts`' coping is a *material* and the
contract does not protect materials — see §13.4.

### 3.4 `courtyards` — `furnishCourtyards`

**(a) Today.** Materials, plus one level write. The interior treatments
(`dressGarden`, the cloister, the yard) write `surface` and emit blocks at
`plan.ground[k] + 1`; `buildWell` is `plaza.ts`'s well, column for column.
`roofPassage` **reads** the pend's floor and refuses whole if the rect is not
one plane — a silent refusal today, which is the shape §1.5 of
`COURTYARDS-AND-LEVELS` calls "accepted and quietly not met".

**(b) Declaration.**

- `platform`, class `courtyard.floor`, over each passage rect at the pend's
  median level, `transition: "step"`. This converts a silent refusal into either
  a level pend or a named conflict, which is the point of declaring.
- The well, exactly as §3.2: `plaza.well` platform plus perimeter `preserve`.
- The interiors declare nothing: they are materials.

**(c) Material, stays behind.** Every `surface` write, the arch, the colonnade,
the washing lines, the flowers.

### 3.5 `canals` — `digCanals`

**(a) Today.** For each channel column: `ground = floor`, `fluidTop = surface`,
`fluidKind = WATER`, `surface = bed`, `subsurface`, `soil = 0`, `snow = 0`,
`lakeMask = 0`, `oceanMask = 0`. For each coping/quay column: `ground = level`,
`fluidTop = level`, `fluidKind = NONE`, `surface = coping|quay`, `subsurface`,
`snow`, and the two mask clears — with an explicit skip for a bank already at
the quay, so the streetscape's sidewalk is not overwritten. It runs after the
column plan and before the streets are surfaced, so `buildBridgeableMask` can
price a bridge over water that exists.

**(b) Declaration.** Two intents per quarter.
- `platform`, class `fluid.channel`, columns = the channel mask at `floorOf[k]`
  with `fluid: { kind: WATER, top: surfaceOf[k] }`, `transition: "wall"` (the
  quay is the transition), plus `preserve` over the same columns.
- `platform`, class `fluid.channel`, columns = coping ∪ quay at `quayOf[k]`,
  `transition: "step"`. The "bank already at the quay" skip becomes unnecessary:
  the claim proposes the level the bank already has, and an agreeing claim is
  not a conflict (§5.3).

**(c) Material, stays behind.** Bed / coping / quay `surface`, the subsurface,
`soil = 0`, the `lakeMask`/`oceanMask` clears (Group C — a dug urban channel is
a street, not a river biome, and that judgement stays with the pass), and
`CANAL_OPEN_WATER_REACH`'s closed-pound diagnostic.

### 3.6 `streets` — `surfaceStreetGraph`

**(a) Today.** The most nearly-converted pass in the codebase: it already runs
claim → level → dress → furnish, already ranks by `compareStreetRank`
(`(−width, roleRank, kindRank, id)` with `roleRank: channel 0, carriageway 1,
steps 2`), already snapshots `natural = Int32Array.from(plan.ground)` so every
level is measured against a frozen ground, and already pins a junction to the
owner's level with `pinLevel`. `surfaceRoute` writes `ground`, `fluidTop`,
`snow`, `subsurface` and `soil` on **owned** columns and paints every claimed
one — "ownership decides geometry and deliberately not material". Then
`blendShoulders` dilates the finished road mask `ROAD_SHOULDER_REACH = 2` rings
and pulls each ring to within `k` blocks of the road, multi-source BFS, ties to
the lower road, skipping anything claimed, wet, next to wet, or on the `seam`
mask.

**(b) Declaration.** The street family (§3.6–§3.8 plus §3.7) declares as **one
subsystem**, because its internal arbitration — rank, ownership, endpoint pins —
is already correct and is not the resolver's business.

- One `profile` intent per surfaced segment, class `street.network`,
  `subRank` = the segment's position in the `compareStreetRank` sort,
  `transition: "none"` (a carriageway's own cross-section takes no kerb),
  columns = the segment's owned `SweptColumn`s at `columnY[idx]`.
- `preserve` over the columns of any segment carrying a balustrade or a
  bridge rail, for the reason street-stairs states in its header.
- `clearance` + `preserve` over bridged columns (`water[idx] === 1 &&
  bridged[idx] === 1`) at the fluid surface: the deck is *meant* to stand over
  its channel, and the column beneath it must not move.
- `blendShoulders` declares separately: `profile`, class `verge`,
  `transition: "ramp"`, columns = the ring targets it computes. The pass still
  computes the BFS; the resolver only arbitrates (§13.9).

**(c) Material, stays behind.** `surface` (carriageway mix, shoulder mix, step),
`subsurface`, `soil`, `paintCentreLines`, the bridge kit, the lanterns, the
`road`/`roadY`/`arterialMask` masks the life pass reads.

### 3.7 `street-stairs` — `dressStreetStairs`

**(a) Today.** Writes `ground = level − 1`, `fluidTop`, `snow`, `surface = step`,
`subsurface` and `soil` for every column of a flight it **owns**, plus the
`road`/`roadY` tags and the occupancy claim. The parapet plinth and the verge
either side are levelled with the flight but do not carry the tread mix. The
balustrade is emitted in the furnish phase, after `plan.ground` is final, and
the header says in as many words that it could not be built before that.

**(b) Declaration.** Folded into `street.network` (§3.6): a `steps` segment is a
`profile` intent whose `subRank` puts it below any street of its width, which is
what a stair landing *is* — a flight arrives at the street's level; the street
does not arrive at the flight's. Plus `preserve` over the whole tread band: the
balustrade problem is a preserve problem, and once it is declared, the furnish
phase no longer has to be last.

**(c) Material, stays behind.** Tread shapes (stair / top slab / full block),
the nosing, the balustrade, the lanterns.

### 3.8 `streetscape` — `paveSidewalks`, `thickenCurbs`, crossings

**(a) Today.** `paveSidewalks` walks each segment, reads the **current**
`plan.ground` of the centre column, and writes `ground = centre`, `fluidTop`,
`snow`, `surface`, `subsurface`, `soil` and `masks.y` for every sidewalk column
in the band. Skips anything the carriageway owns, anything wet, and anything
next to wet. `CURB_LEVEL_TOLERANCE = 0`, so a column is curbed only when its
natural ground exactly matched the road's.

This is the direct cause of two of the six walked defects: it re-levels ground
`surfaceStreetGraph` had just graded — up to **7 blocks** of step across a
street's own width — and it pulled the ground out from under retaining copings,
measured at **1,520 columns** and **183 unsupported balustrade posts** on the
hill town.

**(b) Declaration.** `profile`, class `street.sidewalk`, `transition: "step"`
(the kerb is the transition and the resolver generates it), columns = the
sidewalk band at the level of the flanking carriageway's **arc station**, not at
`plan.ground` of the centre cell. The surfacer already hands this pass
`surfaced: streets.road`; WP-3 additionally hands it the segment's `ArcFrame`
and `ArcLevels`, so the sidewalk's level and the carriageway's come from one
number by construction. That is inversion I6 (§4.4) and it is a bug fix, not a
policy choice.

**One claim per column, keeping the last** (WP-3, measured): two segments'
bands overlap at every junction, and a declarer that pushes one claim per
(segment, column) pair makes the resolver's duplicate rule keep the *first*
while the pass's own traversal writes the *last* — WP-2's shadow declarer did
exactly that, silently drawing `GROUND_INVARIANT` errors nobody read. The
pass declares the level its own traversal means: one claim per column, last
writer within the pass.

**(c) Material, stays behind.** Sidewalk / curb / crossing `surface`,
`subsurface`, `soil`, the lamps and the furniture, `thickenCurbs`' bridging
columns (a *material* course; it recruits only columns this pass already paved).

### 3.9 `roads` — `buildRoadNetwork`

**(a) Today.** Routes lanes, then surfaces them through the same `surfaceRoute`
and `blendShoulders` the street pass uses, with `blocked` = fluid ∪ building
footprints and `paved` = the plaza. Runs **after** the district streets, with the
stated intent that a lane arriving from the next district should *join* the
street grid — the router discounts existing road cells to make it happen. Its
levels, however, overwrite.

**(b) Declaration.** `profile`, class `road.network`, one intent per route,
`transition: "none"`, columns = the route's swept columns at the graded profile.
Its shoulders declare `verge` exactly as §3.6's do.

**(c) Material, stays behind.** Surface mixes, the bridge kit, lanterns, the
`roadColumns` set the F2 ground treatment reads.

### 3.10 `props` — `levelPropPad`

**(a) Today.** For a prop whose pad relief exceeds `PROP_MAX_RELIEF = 1`, fills
(never cuts) the pad rect to `baseY − 1` and a `PROP_PAD_SKIRT = 1` ring one
block lower, writing `ground`, `surface`, `fluidTop` and `snow`, and emitting the
fill blocks. Runs after the roads, deliberately, so a prop stands on the
finished ground.

**(b) Declaration.** `platform`, class `prop.pad`, `transition: "step"`, columns
= the pad and skirt columns whose *resolved* higher-tier level is below the
target. Tier D, so the "fill only, never cut" rule needs no new field: the pass
already filters with `if (g >= want) continue`, and under the contract `g` is
the resolved ground of tiers A–C.

**(c) Material, stays behind.** The cap and fill states, and the emitted fill
blocks. The snow clear is the driver's per-commit clear (§9a.6), **not** §1.3's
`moved`-mask rule, which is WP-6's.

**WP-5 measured what I4 does and does not change.** A pad column the rank takes
away still gets its plinth: the material loop runs over the columns the pad
*claimed* (§9a.6, step 4), so the fill blocks and the cap are emitted exactly as
before and only the plan's level changes. The emitted world is therefore
near-identical on those columns — the terrain lays to the street's level and the
pad's own blocks stand on top of it, where they used to be terrain — and the
physics lint is unmoved (measured: zero findings on both worlds that moved).
What I4 buys at WP-5 is that **the plan tells the truth**: everything downstream
that measures the ground — the scatter, the doorsteps, the land-use clamp, the
readback lints, `road.proud` — sees the lane rather than the causeway. The
causeway itself goes when §9a.7's "build phases move behind the freeze" lands.

### 3.11 `doorsteps` — `buildDoorsteps`

**(a) Today.** Walks outward from every `door` port up to `DOORSTEP_REACH = 6`.
Where the ground stands **above** the threshold line it cuts a landing:
`ground = floorY + (k − 1)`, `fluidTop`, `surface = stepState`, `snow`, `soil`.
Where it stands below, it emits a stair and underpins it with blocks — no level
write. Runs last, because "until the roads have cut and the shoulders have
blended, that ground is not final".

**(b) Declaration.** `platform`, class `doorstep.landing`, `transition: "step"`,
columns = only the `dropped` outcome's cut columns, at their targets, computed
against the resolved ground of tiers A–C. The `stepped` outcome declares nothing:
it is pure block placement above a ground it does not move.

**(c) Material, stays behind.** `stepState` surface, the stair blocks, the
underpinning fill, and `underpinAprons`' second-look fill (which writes no level
today and does not need to — see §3.12).

### 3.12 Three sites outside the eleven

- **`buildings.ts` / the solver's pads.** A building's floor plane is levelled
  by `padFor` → `applyLevelPad` *into the master field*, before materialisation.
  `underpinAprons` and the foundation skirt then place blocks and move no level.
  The contract does not change this — stages 1–3 are sound, per the brief — but
  the resolver **is told**: the `PadEdit` list already on `LayoutOutcome` is
  declared as `platform`, class `pad.record`, at the bottom of the built ranks.
  It costs nothing (the field already carries the answer), it makes a building's
  floor plane visible to conflict detection, and it is what lets §4.4's inversion
  I1 catch the fourth walked defect — "a building's `apron: 2` ramped away the
  seam a retaining wall stood on". Whether the apron itself should become a
  declared transition is §13.3.
- **The exhibit / devworld builders** (`exhibits/context.ts`
  `shapeContextGround` and `seatContextCells`, `exhibits/props.ts`). These write
  `ground` and `fluidTop` on the same `ColumnPlan` type, on the devworld and
  terrarium paths. WP-6's "no module outside the resolver writes it" test must
  either cover them under `prop.pad`/`precinct.ground`-equivalent classes or
  scope itself explicitly to the world pipeline. Not covering them and not
  saying so is how a freeze leaks.
- **The authored-program pass** (`programs/site-treatment.ts`, added with the
  bespoke integration contract, 2026-08-11). Plugin envelopes now get a pad and
  apron declared **through the pipeline `GroundDriver`** — declare → resolve →
  build, `platform`, class `prop.pad`: the pad at the seat plane, the apron
  rings one block down per ring, fill-only, `transition: "ramp"`. The
  foundation skirt mirrors buildings' `underpinApron` — blocks only, no level
  write — so like §3.11's stepped outcome it stays behind as material. Hovering,
  `wade`, `drape` and `embed` seats and wet footprints declare nothing. WP-6's
  "no module outside the resolver writes it" test covers this site for free,
  because its writes already go through the driver; the thing WP-6 must
  remember is the converse — before 2026-08-11 this pass wrote no ground at
  all, so pre-contract goldens of plugin-bearing worlds are not evidence about
  it.

### 3.13 `sweep` is an engine, not a declarer

`structures/sweep.ts` writes `ground`, `fluidTop`, `snow`, `surface`,
`subsurface` and `soil` for every swept column at `level[i] + band.level`, skips
`spanned` columns, and honours an `avoid` mask its caller supplies. It is the
fifth-and-later client relationship that matters, not the engine: **the
`sourceClass` of a swept run is the declaring pass's, never `sweep`'s**. A
retaining wall swept by this engine declares `retaining.seam`; a street swept by
it declares `street.network`; an authored profile declares `sweep.run`.

Two consequences:

- `SweepInput.avoid` becomes redundant for arbitration and is kept only for
  genuine exclusions (a mask of columns the *client* has decided are not part of
  its run). The retaining pass's inverted-occupancy `avoid` — built specifically
  to stop the engine writing one column of the platform below, "measured, four
  floating fence posts" — is deletable at WP-6, because rank does that job.
- `sweep()` gains a declaration mode: given the same inputs it returns the
  `GroundIntent` it would have written, and writes nothing. WP-2's shim uses it;
  WP-3–5 make it the only mode.

**WP-4 measured that mode and replaced it.** "Write nothing and hand back the
intent" had no caller left once WP-3 landed — the street family declares from its
own code paths — and it is not what a swept client needs, because for a sweep the
*material* is written by the engine too. §9 step 2's escape hatch ("the material
loop reads `driver.view()`") does not reach inside an engine the pass calls. So
the mode became **declare → commit → build**, one pass over one datum:
`SweepInput.declare` carries the class, the kind, the transition and a `commit`
callback; the engine computes the run's levels exactly as always, hands the
intent to the callback *before one byte of plan is written*, and then lays its
surface, fill and cap against `plan.ground` — the driver's answer. Where the
resolver agrees with the sweep, which is every column nothing outranks the run
on, the two are the same number and the painting is byte-for-byte what it was;
where they disagree the resolved level wins and the masonry follows it, which is
the §9a invariant ("after the pass, every column it claimed holds the resolver's
answer over the prefix") stated for an engine. The callback rather than a driver
argument is what lets the caller commit its **companion** intents in the same
`commit` — a wall's `face` and its `preserve` are one arbitration, not two.

The mutating path is untouched and is still what every caller outside the world
pipeline uses (the terrarium, the exhibits, the unit tests that sweep on a bare
plan): absent `declare`, the engine writes `ground`, `fluidTop` and `snow` itself.

---

## 4. `INTENT_RANK` — the total precedence order

### 4.1 The comparator

Modelled directly on the order that already works
(`structures/street-owner.ts`):

```ts
/** Lower wins. Spaced by 10 so a class can be inserted without renumbering. */
export const INTENT_RANK: Readonly<Record<GroundSourceClass, number>> = Object.freeze({ … });

/** Negative when `a` owns a column `b` also wants. Total on distinct intents. */
export function compareIntent(a: GroundIntent, b: GroundIntent): number {
  const ra = INTENT_RANK[a.sourceClass];
  const rb = INTENT_RANK[b.sourceClass];
  if (ra !== rb) return ra - rb;
  const sa = a.subRank ?? 0;
  const sb = b.subRank ?? 0;
  if (sa !== sb) return sa - sb;
  return a.source < b.source ? -1 : a.source > b.source ? 1 : 0;
}
```

Total in the strict sense: two distinct intents never compare equal, because
`source` is unique within a class. That is what makes the resolver's result
independent of the order subsystems are enumerated in — the same argument
`compareStreetRank` makes, for the same reason.

Within `street.network`, `subRank` is the position in the
`compareStreetRank`-sorted job list, so the proven order
`(−width, roleRank, kindRank, id)` is preserved exactly and is not re-litigated
here.

### 4.2 The table

| rank | class | tier | kinds | declarer | one line of why |
| --- | --- | --- | --- | --- | --- |
| 0 | `fluid.channel` | A | platform, preserve | `digCanals` | Losing a water claim is a *physics* failure, not an ugly walk: raising a column out of a channel opens a face the water flows into on the first tick. `blendShoulders`, `paveSidewalks` and `surfaceRoute` each encode "never move a wet column, never move a column beside one" independently; rank 0 is those three rules stated once. |
| 10 | `building.footprint` | A | platform, preserve | `padFor` targets, via `pad.record`'s footprint half | A floor plane is fixed before anything else exists. Today enforced by three separate `blocked`/`occupied`/`reserved` masks. |
| 20 | `precinct.ground` | A | platform | `buildPrecincts` | It runs first of everything today and everything downstream measures what it left. |
| 25 | `structure.linework` | A | platform, profile, clearance, preserve | the **linework declaration slot**, between `buildPrecincts` and `pavePlaza` — `viaduct`'s approaches first | A line whose own surface something else must walk onto: the ground makes room for it and the streets *join* it rather than cutting it. Declared against the baseline, with the crossings found in the **solved** layout rather than the finished carriageway — which is what let the rank stop being reserved. See §13.2's 2026-08-17 amendment for the whole contract. |
| 30 | `plaza.ground` | B | platform | `pavePlaza` | Already outranks streets today, via the `paved` mask and `pinLevel`'s zero band. Rank makes the mask redundant. |
| 40 | `plaza.well` | B | platform, preserve | `pavePlaza`, `furnishCourtyards` | A one-column dig whose stability proof depends on eight neighbours staying put. |
| 50 | `courtyard.floor` | B | platform | `furnishCourtyards` | An arch across a step is a lintel with daylight under one end. |
| 60 | `retaining.seam` | B | face, preserve | `buildRetainingWalls` | A declared platform-to-platform seam: the form said these two levels exist, so the face between them exists. |
| 70 | `retaining.skirt` | B | face, preserve | `skirtSeams` | The same face measured from the finished ground rather than declared. Declared beats measured, because a measurement can be wrong about a level the form is right about. |
| 80 | `street.network` | C | profile, preserve, clearance | `surfaceStreetGraph`, `dressStreetStairs` | Internally ordered by `compareStreetRank`, unchanged. |
| 90 | `street.sidewalk` | C | profile | `dressStreets` | A sidewalk is definitionally the carriageway's level; it can never outrank the thing it copies. |
| 100 | `road.network` | C | profile | `buildRoadNetwork` | A lane arriving from the next district should *join* the street grid — which the router already tries to do by discounting existing road cells. |
| 110 | `sweep.run` | C | profile, clearance | authored profiles, bridges, other `SweptProfile` clients | Anything swept that is not one of the named classes above. |
| 120 | `doorstep.landing` | D | platform | `buildDoorsteps` | A doorstep reconciles a threshold with the ground outside it. It is an accommodation, so it accommodates. |
| 130 | `prop.pad` | D | platform | `levelPropPad`, exhibit pads | A cart's pad is the least important level in a settlement. |
| 140 | `verge` | D | profile | `blendShoulders`, `gradeBank` | A ramp is what happens to ground nobody claimed. It must never move ground somebody did. |
| 150 | `pad.record` | E | platform | `LayoutOutcome.padEdits` | Advisory: the field already carries this answer. It exists so a conflict against a building's floor plane is *legible* rather than baked in. |
| — | baseline | — | — | the materialised `ColumnPlan` | Every unclaimed column keeps the level `buildColumnPlan` gave it. |

### 4.3 Why the tiers fall where they do

**Tier A — the immovable.** Water, floor planes, precinct ground. Each is
already immovable today via a mask, and each mask exists because a pass
discovered by walking that it must not write there. Tier A declares against the
baseline only. The fourth member, `structure.linework`, is the one that is not a
mask today: a carried line's own bed, which the network must join rather than
cut. It declares against the baseline like the other three, and §13.2's
2026-08-17 amendment is the whole of how it manages that from a pass whose
crossings are a fact about streets — by taking them from the **solved** layout,
where they were decided, rather than from the surfaced one.

**Tier B — declared ground.** A plaza, a courtyard, a well, a seam. Each *is* a
level: it does not accommodate a level, it states one. Tier B declares against
the baseline and tier A.

**Tier C — the network.** Streets, sidewalks, lanes, other swept runs. The
network is the largest consumer of ground in the world and the one with the best
internal arbitration already. It sits below declared ground because a street on
a terraced quarter *runs along* a seam, and on that seam the ground above is the
platform's, not the street's — the measured 85%.

**Tier D — the accommodations.** Doorsteps, prop pads, verges and banks. Each of
the four exists to make something else meet the ground; none of them has an
opinion the ground should defer to.

**Tier E — the record.** The pads, for legibility.

### 4.4 The inversions, named and defended

Every place the resolver picks a different winner than write-order does today is
a behaviour change. Here they are, all seven, with the defence. **I1–I6 move
worlds; I7 must not.** §8.5 turns this list into the equivalence test's
tolerated-divergence table, and a divergence attributable to none of these is a
test failure.

**I1 — a face beats a street, a sidewalk and a verge.**
*Today:* retaining runs before the streets, so the streets win by write order.
The pass compensates with three hand-built defences (§3.3). Even so, letting a
wall stand on a sidewalk column built **1,520 columns** on the hill town and
**183 unsupported balustrade posts** with them.
*Under the contract:* `retaining.seam`/`retaining.skirt` (60/70) beat
`street.network` (80), `street.sidewalk` (90) and `verge` (140).
*Defence:* it is the direct fix for two of the six walked defects — the coping
overwritten by a later pass, and the `unsupported.chain` that survived four
rounds. The blast radius is bounded: `RETAIN_FACE_SETBACK`'s walk already keeps
a wall off the carriageway, so the columns that change hands are in the sidewalk
band and the verge rings, which is exactly where the 1,520 were.

**I2 — a street beats a road.**
*Today:* `buildRoadNetwork` runs after `surfaceStreetGraph` and overwrites
shared columns.
*Under the contract:* `street.network` (80) beats `road.network` (100).
*Defence:* the road router already discounts existing road cells so a lane
*joins* the grid rather than running alongside it. Levels should join too; the
current behaviour contradicts the pass's own stated intent.

**I3 — a street beats a doorstep.**
*Today:* doorsteps run last and can cut a landing into a column a street owns.
*Under the contract:* `street.network` (80) beats `doorstep.landing` (120).
*Defence:* a landing cut into a carriageway is a hole in the pavement at a
threshold. The doorstep pass loses only the *cut* (`dropped`) columns; the
`stepped` outcome, which is how a doorstep meets ground below the threshold, is
block placement and is unaffected. A door whose approach is a street column now
gets a flush threshold rather than a trench.

**I4 — everything built beats a prop pad.**
*Today:* `levelPropPad` runs after the roads and the doorsteps, and fills.
*Under the contract:* `prop.pad` (130) loses to tiers A–C.
*Defence:* a rowboat's pad raising a lane by two blocks is a causeway, which is
what `road.proud` measures. The pass's existing `if (g >= want) continue` filter
does the work: against a resolved ground the pad simply has fewer columns to
fill, and a pad it cannot fill was already refused by `PROP_MAX_RELIEF`.

**I5 — verges and banks are last.**
*Today:* `blendShoulders` runs inside the street pass after its own dressing and
`gradeBank` runs inside retaining; each can pull a neighbouring claimed column,
and each carries a hand-written guard list (claimed / wet / near-wet / on the
`seam` mask / on a street / on a footprint) to stop it.
*Under the contract:* `verge` (140) can only move columns nothing else claimed.
*Defence:* the guard lists become one rank. This also generalises the `seam`
hand-off — "a seam is a face, not a bank, and smoothing it would undo the wall"
— from one special case to the rule.

**I6 — the sidewalk stops re-levelling from `plan.ground`.**
*Today:* `paveSidewalks` reads the current ground of the centre column, whatever
the last writer left, and levels the band to it. Measured: **up to 7 blocks** of
step across a street's own width.
*Under the contract:* the sidewalk's level comes from the same `ArcLevels` the
carriageway's did.
*Defence:* strictly a bug fix. It is an "inversion" only in that it changes
worlds, and it changes them in the direction every walk asked for.

**I7 — the plaza's immovability becomes a rank.**
*Today:* enforced by the `paved` mask (`surfaceRoute` keeps `plan.ground`;
`pinLevel` bands a paved station to 0).
*Under the contract:* `plaza.ground` (30) simply outranks `street.network` (80).
*Defence:* this should produce **no divergence at all** on any world. It is
listed because it removes two special cases, and removing a special case must be
shown to be equivalent rather than assumed to be.

### 4.5 Ties

There are none, by construction (§4.1). The resolver must nonetheless assert it:
`compareIntent(a, b) === 0` for distinct `a`, `b` is `LOAM-E494`. Two intents
from the same source in the same class is a declarer bug — a pass that wants two
claims declares two sources (`world.town.high_street#carriageway`,
`world.town.high_street#verge`), which also makes the report readable.

---

## 5. The resolver

### 5.1 Signature and outputs

```ts
export interface GroundBaseline {
  readonly region: Region;
  readonly ground: Int32Array;     // as materialised
  readonly fluidTop: Int32Array;
  readonly fluidKind: Uint8Array;
  readonly seaLevel: number;
}

export interface ResolvedGround {
  readonly ground: Int32Array;     // frozen; handed out readonly
  readonly fluidTop: Int32Array;
  readonly fluidKind: Uint8Array;
  /** 1 where the resolved level differs from the baseline. Drives the snow rule. */
  readonly moved: Uint8Array;
  /** 1 where `fluidKind !== NONE`. The one answer the classification passes read. */
  readonly wet: Uint8Array;
  /** Winning intent index per column, or −1. What the report and the shim read. */
  readonly owner: Int32Array;
  /** Every boundary run between two winners at different levels. */
  readonly transitions: readonly GroundTransition[];
  readonly report: GroundReport;           // §7
  readonly diagnostics: readonly LoamDiagnostic[];
}

export function resolveGround(
  baseline: GroundBaseline,
  intents: readonly GroundIntent[],
): ResolvedGround;
```

`resolveGround` is a **pure function**. It reads nothing but its arguments,
writes nothing but its return value, allocates deterministically, and calls no
clock and no unseeded RNG.

### 5.2 Ingestion — normative pseudocode

```
resolveGround(baseline, intents):
  n        := region.width * region.depth
  ground   := copy(baseline.ground)
  fluidTop := copy(baseline.fluidTop)
  fluidKind:= copy(baseline.fluidKind)
  owner    := Int32Array(n).fill(-1)
  ceiling  := Int32Array(n).fill(WORLD_MAX_Y)
  guarded  := Int32Array(n).fill(-1)      # the preserving intent, or -1
  isFace   := Uint8Array(n)

  order := indices of intents, sorted by compareIntent          # §4.1 — total

  # --- pass 1: the ceilings, before any level is chosen -------------------
  for j in order where intents[j].kind == "clearance":
      for c in intents[j].columns:
          require(WORLD_MIN_Y < c.y <= WORLD_MAX_Y)             # else E494
          ceiling[c.idx] := min(ceiling[c.idx], c.y)
          record the clearance's owner for the diagnostic

  # --- pass 2: the level claims, in rank order ----------------------------
  # First writer wins, exactly as `claimColumns` already does. The sort is what
  # makes "first" mean "rank-minimal" rather than "whoever was enumerated first".
  for j in order where intents[j].kind in { platform, profile, face }:
      declared, satisfied, adjusted, refused := 0, 0, 0, 0
      for c in intents[j].columns:
          declared += 1
          require(invariants of §1.3 on c)                      # else E494
          if owner[c.idx] != -1:
              # Someone above already decided this column.
              if levelOf(c) == ground[c.idx]:
                  satisfied += 1                                # agreement, not conflict
              else:
                  refused += 1
                  attribute the loss to owner[c.idx]            # report row
                  if guarded[c.idx] != -1:  emit GROUND_CONFLICT # §6
              continue
          y := c.y
          if y > ceiling[c.idx]:
              y := ceiling[c.idx]
              adjusted += 1
              emit GROUND_CLEARANCE_VIOLATED                    # §6
          else:
              satisfied += 1
          owner[c.idx]     := j
          ground[c.idx]    := y
          fluidTop[c.idx]  := c.fluid ? c.fluid.top  : y
          fluidKind[c.idx] := c.fluid ? c.fluid.kind : NONE
          if intents[j].kind == "face":  isFace[c.idx] := 1
      if satisfied + adjusted < (intents[j].minColumns ?? 1):
          emit GROUND_CLAIM_REFUSED                             # §6
      append the row to report.claims

  # --- pass 3: the guards -------------------------------------------------
  for j in order where intents[j].kind == "preserve":
      for c in intents[j].columns:
          require(owner[c.idx] belongs to intents[j].source)     # else E494
          guarded[c.idx] := j

  # --- pass 4: the transitions -------------------------------------------
  transitions := deriveTransitions(ground, owner, isFace, intents)   # §5.6

  # --- pass 5: the derived masks -----------------------------------------
  moved[k] := ground[k] != baseline.ground[k] ? 1 : 0
  wet[k]   := fluidKind[k] != NONE ? 1 : 0
```

Pass 3 runs after pass 2 for a reason: a `preserve` cannot be honoured before it
is known who won, and a `preserve` is only meaningful for the claim that *did*
win. But `GROUND_CONFLICT` is emitted during pass 2, when a guarded column loses
— which means the guard must already be in place. Implementations must therefore
either run passes 2 and 3 interleaved per rank (a `preserve` at rank *r* is
installed before level claims at ranks > *r* are ingested) or make pass 2's
conflict emission a deferred second walk over the recorded losses. **The
interleaved form is normative**, because it is one walk and because it makes the
guard's own rank meaningful: a `preserve` cannot protect a column against a
*higher*-ranked claim, and must not pretend to.

### 5.3 Agreement is not conflict

The most load-bearing line in §5.2: when a losing claim proposes **the same
level** the winner already wrote, it is counted `satisfied`, no conflict is
recorded, and no diagnostic fires.

This is what makes flat worlds silent and byte-identical (§12), and it is what
makes the WP-2 partition computable (§8.3): a column is *conflicted* exactly
when two claims propose two different levels for it, which on a flat world never
happens, because every pass's level derives from one plane.

### 5.4 `preserve` semantics — normative

1. A `preserve` intent proposes no level and never wins a column.
2. It is installed only on columns its own `source` already won (else
   `LOAM-E494`).
3. A level claim ranked strictly below the guard that loses a guarded column
   emits `GROUND_CONFLICT` (warning), naming both claimants, the column, the
   guard's level and the loser's level.
4. A level claim ranked strictly **above** the guard wins the column normally and
   emits nothing. A guard cannot outrank the order; it can only make a loss
   audible.
5. `preserve` also survives into the build phase: `ResolvedGround.owner` plus the
   guard set is what a physics-adjacent assertion reads to check that no emitted
   block sits over a guarded column at the wrong level.

### 5.5 `clearance` semantics — normative

1. A `clearance` proposes no level; it lowers a per-column ceiling.
2. Ceilings compose by minimum, over all clearances on the column, regardless of
   rank. A ceiling is a statement about physical room; the lowest one is the
   true one.
3. A level claim whose `y` exceeds the ceiling is **clamped** to it, counted
   `adjusted`, and reported (`GROUND_CLEARANCE_VIOLATED`). It is never refused:
   a clamped column is walkable and audible; a refused one is a hole.
4. The ceiling also binds the build phase: nothing may be *emitted* above it
   either. That is the half of the semantics `sweep()`'s `spanned` skip has been
   approximating.

### 5.6 Transition generation — normative

Transitions are **derived, never declared**, for the reason `layout/levels.ts`
already states about seams: "a form that declared its own seams could get one
wrong, and a wrong seam is a cliff through a town".

```
deriveTransitions(ground, owner, isFace, intents):
  # 1. Boundary columns: a column whose 4-neighbour has a *different* owner and
  #    a strictly lower level. The lower side is the one a transition stands on,
  #    exactly as `LevelSeam.cells` are the lower platform's columns.
  # 2. Skip any pair where either side declared transition "none", or either
  #    side is already a face (`isFace`) — a face IS the transition.
  # 3. Group the lower-side columns 8-connected, per ordered (aboveOwner,
  #    belowOwner) pair. 8-connected is not optional: a contour on a lattice is
  #    a staircase, and grouping 4-connected cut the same 2,495 seam columns
  #    into 1,010 components of which 714 were one or two columns long.
  #    Regrouping them 8-connected gave 37 components, 25 of them 25 columns or
  #    longer.
  # 4. For each component:
  #        drop      := ground[above side] − ground[below side]     (one number
  #                     per component, because a component never mixes pairs)
  #        treatment := treatmentForSeam(drop, component.length)
  #        i.e.  drop <= 1                          -> "kerb"      -> step
  #              2 <= drop <= RETAIN_MAX (6)
  #                 and length >= MIN_RETAIN_RUN (6) -> "retaining" -> wall
  #              otherwise                           -> "bank"      -> ramp
  # 5. Emit in row-major order of the first cell, then by the owner pair, so the
  #    list is a pure function of the field.
```

`treatmentForDrop` and `treatmentForSeam` (`layout/levels.ts`) are reused
verbatim — not reimplemented — so the drop table has one home and `RETAIN_MAX`,
`RETAIN_RAIL` and `MIN_RETAIN_RUN` keep meaning one thing. The mapping from
`SeamTreatment` to the contract's vocabulary is fixed:

| `SeamTreatment` | `transition` | who builds it |
| --- | --- | --- |
| `kerb` | `step` | `kerbSeam` (materials), the streetscape's curb |
| `retaining` | `wall` | `buildRetainingWalls` |
| `bank` | `ramp` | `gradeBank`, `blendShoulders` |
| `built` | — | nobody: a building already stands on it, and its own foundation skirt is the wall |

`GroundTransition` carries `{ above, below, aboveSource, belowSource, cells,
drop, treatment, requested }`, where `requested` is the pair of declared
requests, so the report can say when the table overrode one.

Consumers **read** this list. `buildRetainingWalls` stops deriving seams from
`levelSeams` + `skirtSeams` and instead builds the `wall` transitions the
resolver handed it; the streetscape's curb reads the `step` ones. That is the
brief's "every consumer reads that decision instead of re-deriving it", and it
is what removes the third re-derivation of the same contour.

### 5.7 Determinism requirements — normative

1. `resolveGround` is a pure function of `(baseline, intents)`. Same inputs →
   identical outputs, byte for byte, including the diagnostic list and the
   report row order.
2. **Iteration order is never observable.** The only ordering the algorithm may
   depend on is `compareIntent`'s. A `Map`'s insertion order, a `Set`'s
   iteration order and the order a caller happened to append intents in must not
   reach the output. Every internal grouping sorts on a stable key (region index,
   then intent index) before it is walked — the `levelSeams` discipline.
3. `GroundIntent.columns` is `Iterable`, so a declarer may generate lazily. The
   resolver must consume each intent's columns **exactly once** and must not
   depend on the iteration order *within* an intent: an intent that claims one
   column twice at two levels is `LOAM-E494`.
4. No wall-clock, no unseeded randomness, no transcendental arithmetic on a path
   that decides a level.
5. Allocation is deterministic: region-sized typed arrays, sized from
   `baseline.region`, never a growth-dependent structure whose capacity affects
   a hash order.

---

## 6. Conflict diagnostics

Following `packages/spec/src/terrain/diagnostics.ts`: a stable machine code, a
symbolic name, a `nodePath`, a message that names **both claimants and the
measurement**, and a fix hint that says what to change. The `W49x` block is free
(the catalog's highest today is `LOAM-W488`).

| name | code | severity | fires when | message shape |
| --- | --- | --- | --- | --- |
| `GROUND_CONFLICT` | `LOAM-W490` | warning | a level claim loses a column another source declared `preserve` | ``ground conflict at 214,71: `world.town.quarter_a.wall_3` holds this column at y=84 and `world.town.doorstep.mill` asked for y=81 (3 blocks)`` |
| `GROUND_CLAIM_ADJUSTED` | `LOAM-I491` | note | a claim lost columns to higher ranks, aggregated per claim | ``ground: `world.town.lane_3` declared 214 columns and got 189; 25 went to `world.town.high_street` (worst difference 3 blocks)`` |
| `GROUND_CLAIM_REFUSED` | `LOAM-W492` | warning | a claim kept fewer than `minColumns` | ``ground: `world.town.quarter_a.wall_7` needed 6 columns and kept 2; the rest went to `world.town.quarter_a.street_2``` |
| `GROUND_CLEARANCE_VIOLATED` | `LOAM-W493` | warning | a winning level exceeded a clearance ceiling and was clamped | ``ground clearance at 88,140: `world.town.bridge_1` requires nothing above y=71 and `world.town.prop.cart_2` asked for y=73; clamped to 71`` |
| `GROUND_INVARIANT` | `LOAM-E494` | error | any §1.3 invariant, any §4.5 tie, a duplicate column within one intent, a `preserve` on an unowned column | ``ground invariant: `world.town.canal_1` declares fluidTop=68 below ground=70 at 12,300`` |
| `GROUND_TRANSITION` | `LOAM-I495` | note | once per compile, summarising | ``ground transitions: 41 walls, 388 steps, 96 ramps; 3 requests substituted (2 wall→ramp under MIN_RETAIN_RUN, 1 step→ramp past RETAIN_MAX)`` |

Rules the catalog already implies and this contract restates:

- **`LOAM-E494` is a compiler bug**, in the class of `CAVE_FLUID_BREACH`: no
  legal document can produce it. It belongs in `PHYSICS_LINT_CODES`-adjacent
  handling (the caller aborts loudly), not in a feedback round.
- **`GROUND_CLAIM_ADJUSTED` is aggregated per claim, never per column.** A hill
  town would otherwise produce thousands of them; §7's report carries the
  per-column detail for anyone who wants it, and a note that fires on every
  world is a report nobody reads — the lesson `SWEEP_FEATURES_PLACED` already
  taught the retaining pass.
- **`GROUND_CONFLICT` is deliberately narrow.** Precedence resolving a
  disagreement is normal; a `preserve` losing is not (§2.3).
- Whether any of these belongs in `FEEDBACK_CODES` is §13.6. The default is no.

---

## 7. The report section

`TerrainCompileReport.stats` gains an optional `ground` section, alongside
`structures`, so `terrainist compile --report` and the JSON written beside every
generated world carry it. Optional so a terrain-only compile allocates nothing.

```ts
export interface GroundReport {
  /** Region size, for context — the same role `examined` plays in the physics lint. */
  readonly columns: number;
  /** Columns any level claim touched. */
  readonly claimed: number;
  /** Columns whose resolved level differs from the materialised one. */
  readonly moved: number;
  /** One row per level claim, in `compareIntent` order. */
  readonly claims: readonly GroundClaimRow[];
  readonly transitions: {
    readonly ramp: number;
    readonly step: number;
    readonly wall: number;
    /** Requests the drop/run table overrode, with what it substituted. */
    readonly substituted: readonly {
      readonly source: string;
      readonly requested: string;
      readonly built: string;
      readonly why: "MIN_RETAIN_RUN" | "RETAIN_MAX" | "faced" | "none-side";
    }[];
  };
  /** Every `preserve` loss, in full. These are the ones worth walking to. */
  readonly conflicts: readonly {
    readonly guard: string;
    readonly loser: string;
    readonly x: number;
    readonly z: number;
    readonly guardY: number;
    readonly askedY: number;
  }[];
}

export interface GroundClaimRow {
  readonly source: string;
  readonly sourceClass: GroundSourceClass;
  readonly kind: GroundIntentKind;
  readonly rank: number;
  readonly declared: number;
  /** Won at the level asked, or agreed with a winner at that level. */
  readonly satisfied: number;
  /** Won, but clamped by a clearance. */
  readonly adjusted: number;
  /** Lost to a higher rank. */
  readonly refused: number;
  /** Winner source → columns taken. Sorted by count desc, then source. */
  readonly refusedTo: Readonly<Record<string, number>>;
  /** Worst |declared − resolved| over the refused columns. */
  readonly maxDelta: number;
}
```

Per the brief, the report lists **every claim and how it was satisfied**. The
three-way `satisfied / adjusted / refused` split with `refusedTo` is the "by
whom": a reader can answer "why is my quarter's wall short?" from the report
alone, without recompiling, which is the thing the six walked defects each cost
a walk to discover.

`renderCompileFeedback` does **not** print this section: it is diagnostics that
go back to the authoring model, and a claim table is not author-actionable.

---

## 8. WP-2 — the equivalence shim

> The brief: "the resolver runs, its output is compared against the mutating
> pipeline's, and a test asserts they agree. **That equivalence test is the
> safety net for the whole rewrite.**"

### 8.1 How it runs beside the mutating pipeline

1. **Baseline snapshot.** `terrain/compile.ts` copies `ground`, `fluidTop` and
   `fluidKind` immediately after `buildColumnPlan`, before the first structure
   pass, into a `GroundBaseline`. Three region-sized arrays; gated behind
   `CompileInput.groundEquivalence?: boolean`, default **off** for production
   emit and **on** in the test harness, so the memory cost lands only where it
   is being measured.
2. **Shadow declarers.** WP-2 converts no caller. Instead
   `structures/ground-declare.ts` recomputes each pass's `GroundIntent`s from
   the pass's own outputs — the masks and level arrays it already returns:
   `streets.road` + `roadY` + the flight geometry for `street.network`;
   `retaining.seam` + the sweep's `claimed` for the retaining classes;
   `plaza.paved` for `plaza.ground`; the canal masks for `fluid.channel`; and so
   on. Where a pass does not currently expose enough, WP-2 adds a **return value
   only** — never a behaviour change — which is what lets the brief's "every
   existing test passes unmodified" hold.
3. **Resolve.** `resolveGround(baseline, intents)` runs after the structure
   pass, on the same declaration set.
4. **Compare.** `assertGroundEquivalence(baseline, resolved, plan, intents)`.

`sweep()`'s declaration mode (§3.13) is the one piece of production code WP-2
adds, and it is additive: given `declareOnly: true` it returns the intent and
writes nothing.

### 8.2 What is compared

All three frozen arrays — `ground`, `fluidTop`, `fluidKind` — column by column,
over the whole region. Nothing in Group M or Group C is compared: the resolver
does not decide them and a difference there would be noise.

### 8.3 The partition

An inversion means WP-2 equivalence can only hold where no conflict exists, so
the test partitions the region into three sets and applies a different assertion
to each. The partition is computed from the **declaration set alone**, never
from the two answers, so it cannot be tuned to make the test pass.

```
for each column k:
  claims(k) := { level claims that name k }
  levels(k) := { c.y for c in claims(k) }        # distinct

  UNCLAIMED : |claims(k)| == 0
  CLEAN     : |levels(k)| == 1                   # one or many claims, one level
  CONFLICT  : |levels(k)| >= 2
```

**UNCLAIMED — the declaration gap check, and the strongest assertion here.**

- `resolved.ground[k] === baseline.ground[k]` (trivially true; assert anyway).
- `plan.ground[k] === baseline.ground[k]`. **A failure means a pass wrote a
  column it did not declare** — a hole in §3's inventory. The count must be
  **zero** on every world, and the failure message names the column and the
  nearest claim so the missing declaration is findable. This single assertion is
  what proves the pass inventory complete, and it is the one most likely to fail
  first.

**CLEAN — must match exactly.**

- `resolved.ground[k] === plan.ground[k]`, and the same for `fluidTop` and
  `fluidKind`.
- A failure is a declarer bug: the pass wrote a level different from the one it
  declared. Message names the source, the declared level and the written one.

**CONFLICT — must match the documented precedence.**

- `resolved.ground[k] === levelOf(argmin over claims(k) of compareIntent)`.
  This asserts the resolver against §4, not against the mutating pipeline.
- Where `resolved.ground[k] !== plan.ground[k]`, the column is a **divergence**
  and must be attributable: the pair
  `(winnerClass, classOf(the claim whose level equals plan.ground[k]))`
  must appear in `TOLERATED_INVERSIONS` (§8.5). An unattributable divergence —
  including one where `plan.ground[k]` equals no claim's level at all — fails
  the test.
- Divergences are counted per inversion and printed, so the review is "I1 moved
  1,431 columns on `hillside-village`" rather than "1,431 columns moved".

### 8.4 The worlds

**Flat controls — zero of everything.** `examples/showcase-*.loam.json`,
`examples/demo-*.loam.json`, `examples/c1-harbourtown.loam.json`. Assert:
`CONFLICT` is empty, divergences are zero, declaration gaps are zero, and all
three arrays are equal element for element. The argument for why this must hold
is §12 and it is checkable independently of the test, which is the point.

**Hill worlds — gaps zero, divergences attributable.**
`examples/hillside-village.loam.json`, `examples/hilltop-crypt-hamlet.loam.json`,
and one generated world with a `terraced`/`stepped` quarter (per the standing
decision, generated by `terrainist generate` from a text prompt, not
hand-authored). Assert: declaration gaps zero, `CLEAN` exact, every divergence
attributable, and the per-inversion counts recorded as a **golden** so a later
work package that changes them has to say so.

The byte-identity technique stays what worked repeatedly this week: a git
worktree at `HEAD`, compile both, diff per-file shasums of the whole world
directory. The flat controls must produce identical shasums through every WP.

WP-2c corrected this section's world list against measurement:
`c1-harbourtown` is a *city*, not flat — 11,209 conflicted columns — so its
assertion is "conflicts under 5% of the region and every one attributable",
not "CONFLICT is empty"; `showcase-bayline` is a hill world despite the prefix
and is the only committed example exercising I1, I2 and I3 at once; and a unit
test cannot call `terrainist generate`, so the generated stepped quarter is
substituted by `levels.test.ts`'s `steppedWorld()` fixture (copied, not
imported, so a change there cannot silently move the golden).

### 8.5 The tolerated divergences

`TOLERATED_INVERSIONS` is a table, not a predicate, and it is exactly §4.4:

| id | winner class | loser class (whose level the mutating pipeline wrote) |
| --- | --- | --- |
| I1 | `retaining.seam`, `retaining.skirt` | `street.network`, `street.sidewalk`, `verge` |
| I2 | `street.network` | `road.network` |
| I3 | `street.network`, `street.sidewalk` | `doorstep.landing` |
| I4 | any of tiers A–C | `prop.pad` |
| I5 | any of tiers A–C | `verge` |
| I6 | `street.sidewalk` | `street.sidewalk` (self — the level changed, not the winner) |
| I7 | `plaza.ground` | `street.network`, `road.network` — **expected count zero** |

I6 is the one entry whose winner and loser are the same class, and it is honest:
the sidewalk still wins its own band, but the level it wins with changes because
it now comes from the arc frame rather than from whatever `plan.ground` held.
The test therefore compares `resolved.ground[k]` against the declared level and
records the delta, capping it at the measured defect's size — **7 blocks** — with
a failure past it, so "the sidewalk moved" cannot quietly become "the sidewalk
moved a lot".

Two things WP-2c measured that this section did not anticipate, both now
normative:

- **A self-inversion cannot be attributed by "the claim whose level equals
  `plan.ground[k]`"** — for I6 nothing declares the written level, so that rule
  either finds nothing or fingers an unrelated claim sitting at the old number
  (9,447 misattributions on `c1-harbourtown`). The pass's own per-column record
  of what it wrote (`SidewalkColumn.wrote`, carried as
  `GroundEquivalenceOutcome.selfWrites`) is the evidence the self-row matches
  against.
- **An I6 column with a single claimant partitions CLEAN**, not CONFLICT, so the
  self-row applies there too — counted separately (`cleanDivergences`), credited
  to I6, still capped at 7 blocks, never waved through. Relatedly, `fluidTop`
  follows `ground` on a dry column, so the comparison is `fluidAgrees`: kinds
  match; a wet surface matches outright; a dry one equals its own side's ground
  — otherwise every moved dry column reports twice.

I7's expected count is zero, and a non-zero count fails rather than being
tolerated. A tolerated divergence with an expected count is how the table stops
being a rubber stamp.

---

## 9. Conversion recipe — WP-3, WP-4, WP-5

Mechanical, per pass. An implementer following this should not have to
re-derive anything in §4 or §5.

1. **Find the level writes.** Every `plan.ground[…] = …` in the pass, and the
   `plan.fluidTop` / `plan.fluidKind` writes in the same statement group.
   (`grep -n "plan.ground\[" <file>` is exactly how §3's inventory was built.)
2. **Split the loop.** The loop that computes a level and writes it becomes a
   loop that computes a level and `yield`s a `GroundClaim`. The intents go to
   `driver.commit` (§9a.1), which is what puts the levels in the plan until WP-6
   moves the build phase behind the freeze. Everything else in the loop body —
   `surface`, `subsurface`, `soil`, block pushes, mask writes — stays where it is
   and moves to a **second** loop that runs after the commit. That second loop
   keeps the pass's **claimed** columns, not the ones it won: ownership decides
   geometry and deliberately not material, and narrowing it to the won columns
   changes the painting on every contested column (§9a.6, step 4). If the two
   loops cannot be separated because the material depends on the level, the
   material loop reads `driver.view()` — there is no `resolved.ground` to read
   until WP-6 — and the dependency is gone. **A third category exists** (WP-3,
   measured): material that depends on the level *before* the pass moved it.
   `surfaceRoute`'s relief test read `plan.ground` at the instant of its own
   write, which was sound only because the function did the writing; once the
   driver commits first, that read sees the road it is asking about. Such a
   read must be lifted to the caller and sampled at the moment the old code
   read it (`reliefOf`), not pointed at the view.
3. **Name the source.** `source` is the node path where there is one, and
   `<nodePath>#<part>` where one pass makes several distinct claims (a segment's
   carriageway and its verge are two sources, §4.5). Sources must be unique and
   stable across compiles — never an array index that a later document could
   shift.
4. **Pick the class and the tier** from §4.2. Do not invent a class; if the pass
   does not fit one, that is a spec change and belongs in §13, not in the
   implementation.
5. **Pick the transition.** `"none"` when the claim owns both sides of its own
   edge (a carriageway, a lane); `"step"` for a kerb-scale edge; `"wall"` for a
   face; `"ramp"` for anything that grades out to its surroundings.
6. **Declare `preserve`** over any column something will later *stand on* — a
   balustrade post, a rail, a lantern footing, a well's perimeter. This is the
   cheapest defect insurance in the contract and the reason `unsupported.chain`
   survived four rounds without it.
7. **Declare `clearance`** over any column something will later *span* — a deck,
   an arch, a lintel.
8. **Delete the defensive masks** the pass carried to protect itself from later
   writers, and only those: the `avoid`/`seam`/`street`-dilation family. Keep
   every mask that expresses a genuine exclusion (a footprint the pass must not
   enter, water it must not cross).
9. **Move the tier-dependent reads.** Every read of `plan.ground` that decides a
   level becomes `driver.view()` (§9a.4), whatever the pass's tier. `baseline` is
   the right answer only at WP-6, when every higher tier has declared before the
   read; during the mixture the view is the plan at this pipeline position, which
   holds the resolver's answer where a converted pass won and the unconverted
   passes' writes everywhere else — and reading `baseline` instead would throw
   away work the pass can see today. Anything reading `plan.ground` to decide
   where to *put a block* also becomes a `driver.view()` read, and does not change
   value.
10. **Delete the snow clears** — the pass's `plan.snow[idx] = 0` lines go, and
    `commit` clears snow on the columns the commit won, which is bit-for-bit the
    same set (§9a.6). Group M's `moved`-mask rule of §1.3 is a *superset* of that
    and is WP-6's: adopting it in a conversion leaves snow on new pavement on any
    flat snowy world.
11. **Run the equivalence test** with the pass converted and the others still
    shadow-declared. The shim works with any mixture: a converted pass commits, an
    unconverted one records through its shadow declarer at the same pipeline
    position, and the assertions are identical either way. That is what makes
    WP-3, WP-4 and WP-5 genuinely parallel. §9a.5 says which assertions may never
    move (`gaps`, `precedenceMismatches`, `fluidMismatches`, `unattributable`, I7,
    I6's 7-block cap), which divergence rows go to zero at this work package
    (§9a.3's table), and the rule for the goldens: **they may only shrink**, and a
    count that grows is a finding with one of two named causes, never a golden
    update and never a new row in §8.5.
12. **Regenerate nothing.** Every world whose committed golden is all zero must
    still shasum-match — today `hillside-village` and `hilltop-crypt-hamlet`. A
    world with a non-zero golden moves by exactly that golden and by nothing
    else; §9a.6 corrects §12's control list, which named three worlds that WP-2c
    measured as movers. A world that moves where its golden says it should not
    has had a level changed on ground the contract calls uncontested, which is a
    bug in the conversion and not a licence to regenerate a golden.

---

## 9a. The mixture period — how a converted pass's levels reach the plan

§9 step 2 says a converted pass "computes a level and yields a `GroundClaim`",
and that its material loop "reads `resolved.ground`". Between WP-2 and WP-6
there is no `resolved.ground` to read. The declaration set is not complete until
the last pass has run, so a single end-of-pipeline `resolveGround` cannot be what
puts a converted pass's level in the plan — and the plan is where an unconverted
downstream pass will look for it, at its own pipeline position, because that is
the only place it has ever looked. Eleven passes converted in three parallel work
packages means that for most of the rewrite roughly half the pipeline declares
and half still writes, and **the half that still writes must not be able to tell
the difference**.

This section decides the write mechanism for that period. Everything else in it
follows from that one decision. Nothing here changes a world on its own: it is
the mechanism WP-3, WP-4 and WP-5 each use, and the first of the three to land
builds it.

### 9a.1 The mechanism — one driver, an accumulating prefix, a write-through

**`layout/ground-driver.ts`, `GroundDriver`.** Created in `terrain/compile.ts`
immediately after `buildColumnPlan`, beside the baseline snapshot §8.1 already
takes, and threaded into `buildStructures` as `StructureInput.ground`. It exists
only on the settlement path; a terrain-profile compile builds none.

```ts
/** The one thing that writes a level during the mixture (§9a). */
export interface GroundDriver {
  /** The materialised ground the whole resolve is against. Never changes. */
  readonly baseline: GroundBaseline;
  /** Every intent contributed so far, in pipeline order. */
  readonly intents: readonly GroundIntent[];

  /** An unconverted pass's shadow declaration. Accumulates; writes nothing. */
  record(intents: readonly GroundIntent[]): void;
  /** A converted pass's claims. Accumulates, resolves, and writes them through. */
  commit(intents: readonly GroundIntent[]): void;
  /** The one legal read (§1.4), as it stands at this pipeline position. */
  view(): GroundView;
  /** After the last pass: the final `ResolvedGround`, its report, its diagnostics. */
  finish(): ResolvedGround;
}
```

Four rules, all normative.

**1. Every pass contributes at its own pipeline position, converted or not.** A
converted pass calls `commit` instead of writing. An unconverted pass writes
exactly as it always has, and its shadow declarer (§8.1, item 2) is called
immediately afterwards — the declarers derive from the pass's *return values*, so
they can run there — and hands the result to `record`. `declareAll` and the
`groundDeclarers` bundle are therefore deleted at the first conversion: there is
one accumulator, in one order, and §3's inventory is a list of call sites rather
than a list of arguments. `declarePadEdits` records before the first structure
pass, since the field already carries its answer.

**2. `commit` writes the resolver's answer over the columns of its own
intents, and nothing else.**

```
commit(intents):
  append intents to the driver's array, materialising each `columns` (rule 4)
  r := resolveGround(baseline, driver.intents)        # the whole prefix, re-resolved
  touched := union of c.idx over every intent in *this commit*, every kind,
             ascending
  for k in touched:
      if r.owner[k] === -1: continue                  # nobody won it; not ours
      plan.ground[k]    := r.ground[k]
      plan.fluidTop[k]  := r.fluidTop[k]
      plan.fluidKind[k] := r.fluidKind[k]
      if r.owner[k] indexes one of *this commit's* intents:
          plan.snow[k] := 0                           # §9a.6, the snow rule
```

Three details in that loop are load-bearing and each is a defect if dropped.
*`owner[k] === -1` is skipped* because a column named only by a `clearance` has
no winner, and writing the resolver's answer there — the baseline — would erase
an unconverted pass's work. *`touched` includes `clearance` and `preserve`
columns* because a clearance recorded after a level claim was already written
must still clamp it, and the commit that declares the clearance is the only one
that will revisit the column. *Only this commit's columns are written*: a commit
never rewrites a column claimed solely by an earlier commit, which is what keeps
a conversion's blast radius equal to the pass's own footprint (§9a.3).

**3. The prefix is the answer.** `resolveGround` is called on the whole
accumulated array every time, never incrementally patched, so every intermediate
answer is literally `resolveGround` over a prefix of the final set and the last
one is `resolveGround` over the final set — the same call, the same arguments and
the same result the shim computes. The driver is not a second resolver and §11
asserts it (§9a.5). Re-resolving is lazy: at most one call per `commit`, and one
per `view()` that follows a `record`. Twelve resolves on a city region is twelve
walks of a few million cells, which is the cost of the mixture and is deleted
with it.

**4. An intent handed to the driver must be re-iterable.** §5.7.3 lets a declarer
generate `columns` lazily because the resolver consumes them exactly once; the
driver calls the resolver a dozen times over the same array, so a generator is
exhausted after the first. `record` and `commit` therefore **materialise each
intent's `columns` into a frozen array on receipt**. This is the single most
likely way to get the driver subtly wrong: a lazily-declared intent silently
contributes nothing from the second resolve on, which reads as "my pass's claims
stopped winning halfway down the pipeline".

**Diagnostics and the report come from `finish()` only.** An intermediate resolve
sees a prefix, so it fires `GROUND_CLAIM_REFUSED` for claims a later-recorded
higher rank has not taken yet and misses `LOAM-E494`s that only the full set
exhibits (a `preserve` whose own claim loses to something recorded after it).
Intermediate diagnostics and reports are **discarded**; `finish()` is what §6 and
§7 are fed from.

**The baseline stops being optional.** `groundBaseline` is gated behind
`CompileInput.groundEquivalence` today (§8.1, item 1). From the first conversion
it is unconditional on the settlement path — three region-sized copies — because
it is the resolver's first argument and the driver is production code. The
*shim* stays gated.

### 9a.2 Why the driver, and not the two cheaper shapes

**Rejected: converted passes write their declared levels directly, with no
arbitration until WP-6.** It is the smallest change and it lands I6 (which is a
change of *where the level comes from*, not of who wins) at WP-3 correctly. It
lands nothing else. I2 — a street beating a road, both of them inside WP-3's own
family — would still be decided by write order, so the work package whose whole
purpose is "convert the surfacer from *owning* its columns to *declaring* them"
would ship without the ownership changing hands. Every cross-pass inversion would
then arrive at once, at WP-6, which is exactly the leap §8 exists to prevent:
seven behaviour changes in one commit, walked once, with no way to attribute what
a hill town now looks like to any one of them. The equivalence shim would still
*measure* the leap; it would not make it walkable.

**Rejected: a resolve per work-package family.** Each WP's passes resolve among
themselves at the end of the family and write that answer. I2 and I6 land at
WP-3, which is better — but I1 and I3, whose two sides sit in different families,
still wait for WP-6, and the mechanism invents a scope ("the family") the
contract does not have and the tiers contradict. Worse, three family resolves
writing at three pipeline positions against three different starting states is
the write-order pile again with three participants instead of eleven, and none of
it survives WP-6.

**Chosen: the driver.** It is the only shape in which an inversion becomes real
exactly when the pass that currently decides the column is converted, so each
work package moves the worlds its own passes are responsible for and can be
walked on its own; it needs no change to `resolveGround`, which stays the landed,
tested pure function and is merely called more often; its intermediate answers
are not an approximation of the contract but the contract applied to a prefix;
its last answer *is* the final resolve; and WP-6 deletes only its write-through,
because the accumulate-and-resolve half is the per-tier machinery §1.4 and §13.7
ask for and would have to be built anyway.

### 9a.3 When each inversion becomes real

The rule, and it is worth stating before the table because the table is only its
consequence:

> **A column stops diverging at the work package that converts the pass which
> writes it last in pipeline order.**

The winner's own conversion is not required. Because every pass records at its
own position, the winning claim is already in the driver's prefix by the time the
last writer commits — and it always is, since a claimant that ran *after* the
last writer would be the last writer. So the loser's conversion is what lands the
inversion, and the winner may still be writing by hand.

| id | winner (pass, WP) | loser — the last writer (pass, WP) | real at | what the goldens do |
| --- | --- | --- | --- | --- |
| I1 | `retaining.seam` / `.skirt` (`retaining`, WP-4) | `street.network` (`roads`), `street.sidewalk` (`streetscape`), `verge` (`blendShoulders`) — all WP-3; `verge` from `gradeBank` — WP-4 | **WP-3**, except any column whose last writer is `gradeBank`, which goes at WP-4 | `showcase-bayline` I1: 3 → 0. The split between the two shares is measured at the conversion, not predicted here. |
| I2 | `street.network` (`roads`, WP-3) | `road.network` (`roads`, WP-3) | **WP-3** | `showcase-bayline` I2: 2 → 0. |
| I3 | `street.network`, `street.sidewalk` (WP-3) | `doorstep.landing` (`doorsteps`, WP-4) | **WP-4** | `showcase-bayline` I3: 3 → 0; `levels_scarp` I3: 1 → 0. |
| I4 | any of tiers A–C | `prop.pad` (`props`, WP-5) | **WP-5** | `showcase-ironvale` I4: 41 → 0; `demo-deltaport` I4: 20 → 0. |
| I5 | any of tiers A–C | `verge` (`blendShoulders`, WP-3; `gradeBank`, WP-4) | **WP-3** and **WP-4** respectively | zero on every world today; it must stay zero, and a non-zero count appearing at a conversion is a finding, not a golden. |
| I6 | `street.sidewalk` (self) | `street.sidewalk` (`streetscape`, WP-3) | **WP-3** | `c1-harbourtown` 9,921 → 0; `showcase-bayline` 4,169 → 0; `levels_scarp` 52 → 0. The largest single movement in the rewrite. |
| I7 | `plaza.ground` (`plaza`, WP-4) | `street.network`, `road.network` (WP-3) | **WP-3** | zero, and zero at every WP. A non-zero count is a failure, per §8.5. |

Two consequences worth reading off the table. **WP-3 is where the worlds move**:
it takes I1's street share, I2, I5's shoulder share and all of I6, which is every
divergence measured on `c1-harbourtown` and all but three columns of
`showcase-bayline`'s. **WP-4 and WP-5 are small**: one doorstep column on
`levels_scarp`, three on `bayline`, and sixty-one prop-pad columns across two
controls. Plan the walk accordingly — WP-3's is the one that needs Kai.

`prop.pad` is the one declarer whose *column set* is a function of the ground it
is declared against: `levelPropPad` selects columns with `if (g >= want)
continue`, so converting a street changes which columns a pad claims. §3.10b
predicts the direction ("against a resolved ground a pad simply has fewer columns
to fill"), so I4's golden should shrink at WP-3 as well as reaching zero at WP-5.
A golden that *grows* there is a finding.

**WP-4 and WP-5 landed the rest of the table, and every row measured exactly
what it predicts.** After the two work packages **every inversion row on every
world is zero**:

| world | before WP-4/5 | after | what moved |
| --- | --- | --- | --- |
| `c1-harbourtown` | I3 12 | 0 | the 12 reselected landings, each on a street column |
| `showcase-bayline` | I3 6 | 0 | ditto |
| `levels_scarp` | I3 1 | 0 | the one landing cut into a street |
| `showcase-ironvale` | I4 41 | 0 | prop pads losing to what is built |
| `demo-deltaport` | I4 20 | 0 | ditto |
| `hillside-village`, `hilltop-crypt-hamlet` | all zero | all zero | nothing — per-file shasum-identical |

Each world moved by **exactly** its golden and by nothing else: every moved
column is a column the shim measured as diverging at WP-3, it left the level the
mutating pipeline wrote, and it landed on the level `resolveGround` had said it
should. The 55 `PAD_APRON_MISMATCHES` columns of `c1-harbourtown` diverge and do
**not** move, which is §9a.5's proof holding: no pass commits them.

Three predictions to settle:

- **I1 had no `gradeBank` remainder anywhere.** §9a.3 split I1 between WP-3 and
  WP-4 ("except any column whose last writer is `gradeBank`"); measured across
  all seven worlds, that share is empty — WP-3 took all of I1.
- **I5 stayed zero**, as required, through both conversions.
- **I7 stayed zero** through the plaza's conversion, which is the point of the
  row: the `paved` mask's level behaviour really was a rank in disguise.

**WP-3 measured both predictions, and amended this subsection:**

- **I4 did not shrink at WP-3** — correctly: neither `showcase-ironvale` nor
  `demo-deltaport` has any street-family movement, so no ground under a pad
  changed and the filter selects the same columns. A prediction that did not
  fire, not a failure.
- **`doorstep.landing` is a *second* ground-dependent declarer**, which this
  subsection had not named: `buildDoorsteps` cuts a landing only where the
  ground stands above the threshold line, so I6's move reselects which doors
  get a `dropped` outcome. I3 therefore **grows** at WP-3 (`c1-harbourtown`
  0 → 12, `showcase-bayline` 3 → 6 — `DOORSTEP_RESELECTION` in the test) and
  goes to zero at WP-4, where the table already puts it. This is the one
  legitimate exception to "goldens may only shrink", and it is bounded: every
  reselected landing is an attributable I3 divergence or the test fails.
  **WP-4 closed it**: the landings are still reselected — the sidewalk's level is
  still I6's — but one that would be cut into a column a street owns is simply
  not cut, so all 12 and all 6 went to zero.
- I1's `gradeBank` share had no WP-4 remainder on `showcase-bayline` — all
  three columns went at WP-3.

### 9a.4 What a converted pass reads

> **During the mixture, `resolvedSoFar` is `driver.view()`: the plan's three
> arrays at the pass's own pipeline position, handed out `readonly`.**

Not a separate array, and not `baseline`. The view is sound in the only sense
that matters, which is that it is composed of exactly two kinds of column and
both are the best available answer:

- a column some committed intent won holds **the resolver's answer over the
  prefix** — the driver has just written it there;
- every other column holds **what the unconverted passes wrote**, which is
  precisely what the pass reads today. Reading `baseline` instead would be
  strictly worse: a tier-B pass reading the baseline would lose the precinct
  grading a tier-A pass performed by hand, which it can see today.

So §9 step 9's "a pass in tier A or B reads `baseline.ground`" is a WP-6
statement, not a mixture one; during the mixture every pass reads the view, and
the view converges on the frozen ground one conversion at a time.

`GroundView` carries `ground`, `fluidTop`, `fluidKind`, `seaLevel` and `region`,
with the arrays typed by the `ReadonlyInt32Array`-shaped alias §10 specifies for
WP-6 — declared in `ground-contract.ts` at the first conversion rather than at the
last, so that a converted pass cannot write through its own read even while the
plan is still mutable.

**Two knowing approximations, both bounded, both named.**

1. **A higher tier that declares later in the pipeline is missing from the
   view.** `digCanals` is tier A and runs after `buildRetainingWalls` (tier B);
   `furnishCourtyards` (rank 50) runs after the walls (60/70). A converted
   retaining pass therefore computes its levels without seeing the channel. This
   is *today's behaviour exactly* — the ordering is the pipeline's, not the
   contract's — so the conversion ships no regression, and the arbitration is
   still right: the canal records at its own position and, when converted, its
   commit rewrites the shared columns at rank 0. What can differ is the *derived*
   level of a neighbouring column the canal never claims. Bounded to that, and
   the fix is a pipeline reorder into tier order, which is not in WP-1–6.
2. **The view is not tier-filtered.** §1.4 forbids a pass reading its own tier;
   the mixture's view contains whatever ran earlier, including same-tier
   claimants (`pavePlaza`'s well is tier B and runs before the tier-B walls).
   Again this is today's behaviour, and §13.7's typed `declare(tier, above)` is
   what closes it — at WP-6, where the driver already holds the owning intent per
   column and can mask the view back to the baseline wherever the owner's tier is
   not strictly higher.

One case that looks like a tier violation and is not: **the sidewalk taking the
carriageway's level.** Both are tier C. The sidewalk does not read the resolved
carriageway; it reads the `ArcFrame`/`ArcLevels` the surfacer hands it (§3.8b),
which is intra-subsystem data — the street family declares as *one* subsystem
(§3.6b) and its internal arbitration is not the resolver's business.

### 9a.5 How the shim's assertions tighten

The shim keeps its shape. Two wiring changes and one new assertion:

- `assertGroundEquivalence` is fed `driver.intents` instead of `declareAll(…)`'s
  result, which after the first conversion is the same set arrived at from one
  place instead of two;
- `written` is still a copy of the plan taken at pass 5b′, and still compared
  against `resolveGround(baseline, driver.intents)` computed **by the shim
  itself**, not read off the driver;
- **new:** `driver.finish().ground` must equal that resolve element for element,
  and likewise `fluidTop` and `fluidKind`. This is what proves the incremental
  prefix-resolve equals the one-shot resolve, and it is the assertion that
  catches a driver which mutated an intent, dropped one, or exhausted a
  generator (§9a.1, rule 4).

**What may never move, at any conversion.** These are contract, not goldens:

| assertion | value | why it cannot move |
| --- | --- | --- |
| `gaps` | 0 | a converted pass declares everything it writes by construction; a gap appearing at a conversion means the pass writes a column outside its own intents. |
| `precedenceMismatches` | 0 | it asserts the resolver against §4, and the resolver did not change. |
| `fluidMismatches` | 0 | §8.5 has no row that inverts a fluid, and §1.3's joint freeze is what makes that safe to say. |
| `unattributable` | 0 | see below. |
| `byInversion.I7` | 0 | §8.5. |
| `maxSidewalkDelta` | ≤ 7 | §8.5, the measured size of the defect I6 fixes. |
| "the resolver moves nothing nobody claimed" | 0 failures | unchanged; the driver writes a strict subset of what the resolver owns. |

**CLEAN stays exact.** On a CLEAN column exactly one level is declared, so the
resolver writes that level (or a clearance clamp), and a converted pass's commit
writes the same number the unconverted pass wrote. `cleanMismatches` therefore
stays at its golden through every conversion. The one moving part is
`cleanDivergences` — the I6 columns with a single claimant, which §8.5's second
WP-2c amendment put in CLEAN rather than CONFLICT — and those go to zero with the
rest of I6 at WP-3.

**Divergence goldens may only shrink.** Per conversion, the rows named in §9a.3's
table go to zero and every other row keeps its number. A count that grows, or a
row that becomes non-zero having been zero, is **not** a golden update: it is a
finding, and it has exactly two legitimate causes, both of which must be written
down at the constant before the number is changed —

1. **the declaration set moved.** A converted pass computes its claims against
   `driver.view()`, and an earlier conversion changed the view on the diverging
   columns, so the pass now claims a different set or different levels. `prop.pad`
   is the declarer this is expected of (§9a.3); anywhere else, check that the
   conversion promoted the shadow declarer rather than re-deriving it.
2. **a claim recorded after the last writer's commit.** The prefix the commit
   resolved was missing a claim the final set has — in practice a `clearance`
   declared downstream. It presents as an *unattributable* divergence, because
   the written level is a clamp no claim asked for. Find it by diffing the
   commit's prefix against `driver.intents`; **do not add a row to §8.5.** The
   tolerated table is §4.4's list and nothing else, and a row added to make a
   world pass is the failure mode §8.5's closing line exists to prevent.

**`PAD_APRON_MISMATCHES` is untouched by every conversion, and that is
provable.** The 55 columns are claimed by `pad.record` alone; no pass commits
them, because the pads are a field edit and there is no post-materialisation pass
to convert (§3.12). A commit only writes its own columns, so nothing rewrites
them, and `cleanMismatches` stays at exactly 55 on `c1-harbourtown` and 61 on
`showcase-deltamere` through WP-3, WP-4 and WP-5. They become a *world* change at
the moment the driver's write stops being per-commit and becomes the whole
ground — which is WP-6's first change and nothing earlier. That is the sharpened
form of §13.3's "this question must be settled before WP-6 freezes the ground":
it must be settled before WP-6's **first** change, not merely inside WP-6. The
golden may shrink if a declarer fix lands; it may not grow.

`sidewalkWrites` and the `selfWrites` machinery (§8.5's WP-2c amendment) stay
until `streetscape` converts and are deleted with I6's golden, since a
self-inversion that no longer diverges has nothing to attribute.

### 9a.6 Byte-identity through the mixture

§12's argument extends to the driver in five steps, and each is checkable
without running the test:

1. **The driver writes only columns some committed intent claims** (§9a.1, rule
   2). Every other column of the plan is untouched by the mechanism, so an
   unconverted pass's work is bit-for-bit preserved.
2. **On a flat world every claim on a shared column proposes the same level**
   (§12.3) — every pass's level derives from one plane. So for *any* subset of
   the declaration set, `resolveGround` returns that one level on every claimed
   column: §5.3's agreement rule makes the answer independent of which claims are
   present, not merely of their order.
3. **Therefore every driver write is value-identical to what was already there.**
   The prefix property of §9a.1 rule 3 is what makes this hold at *every* commit
   and not only at the last one, which is what makes the mixture safe rather than
   only its endpoint.
4. **Materials keep their passes, their column sets and their order.** A
   converted pass's material loop runs over the columns the pass *claimed*, not
   the columns it *won* — "ownership decides geometry and deliberately not
   material" (§3.6a), and Group M's last-write-wins order is what §12.4 depends
   on. A conversion that narrows the material loop to the won columns changes the
   painting on any world with a contested column and is a bug in the conversion.
5. **The snow clear is a driver write, not a `moved`-mask rule.** See below.

**The snow rule, corrected for the mixture.** §1.3 replaces the eleven
`plan.snow[idx] = 0` lines with "a column whose resolved level differs from its
materialised level carries no snow". That rule is *not* equivalent to the eleven
lines: those clear snow on every column the pass writes, whether or not the level
moved, and on a flat snowy world no level moves at all — so adopting the
`moved`-mask rule during a conversion leaves a snow layer on top of freshly laid
pavement and breaks §12 on exactly the worlds §12 is about. What the driver does
instead is bit-for-bit the eleven lines: **`commit` clears `plan.snow[k]` on
every column the commit *won*.** A claimed column the commit lost still ends
snowless, because its winner clears it — by hand if that pass is unconverted, by
its own commit if it is not — and either way the value is 0 and the order does
not matter. §1.3's superset (clearing snow where a *different* claimant moved the
column) is a real behaviour change on any world with snow, it is WP-6's, and it
needs its own measurement.

**The control set §12 names is wrong, and the goldens say so.** §12 asserts that
`examples/showcase-*`, `demo-*` and `c1-harbourtown` shasum-match through every
work package. WP-2c measured otherwise: `c1-harbourtown` diverges on 9,921
columns (I6), `showcase-ironvale` on 41 and `demo-deltaport` on 20 (I4). Those
worlds *will* move, at WP-3 and WP-5 respectively, by exactly the counts in
§9a.3's table. Byte-identity is a **per-column** guarantee — a column with no
conflicting claim and no self-inversion does not move — and only a world with an
all-zero golden inherits it world-wide. Today that is `hillside-village` and
`hilltop-crypt-hamlet`: the two hill towns, and not one of the three worlds §12
calls a flat control. **The shasum control set for WP-3–5 is every world whose
committed golden is all zero**, and §8.4's flat-control list is a list of worlds
whose movement must equal their golden, which is the assertion the equivalence
test already makes. A shasum diff on a world with a non-zero golden is read
against §9a.3's table, never waved through.

### 9a.7 What WP-6 deletes, and what it flips

§10's list stands in full. The driver adds to it and refines two of its entries.

**Deleted at WP-6:**

- **`commit`'s write-through** — the loop of §9a.1 rule 2, and with it the snow
  clear. Nothing writes `plan.ground` any more, so nothing needs to.
- **`record`** — every pass commits; there is no unconverted half to shadow.
- **`ground-declare.ts` and the shim**, as §10 already says — refined: each
  shadow declarer dies at *its own* pass's conversion, not at WP-6. The module,
  `levelClaimsByColumn`, `sidewalkWrites`, `ground-equivalence.ts` and
  `test/ground-equivalence.test.ts` are what remain to delete at WP-6, and they
  go together. **After WP-5 all eleven declarers are gone**: what is left in the
  module is `declarePadEdits` (whose "pass" is the layout solver, §3.12) and the
  two helpers the shim reads the declaration set with — and `record` has exactly
  one caller left for the same reason.

**One thing WP-6 no longer has to do.** §10's "no module outside the resolver
writes `plan.ground`" is, on the settlement path, already true: after WP-5 the
only writers left in the whole compiler are `GroundDriver.commit`, and the
undeclared fallbacks of `sweep()` and `levelPropPad()` — which exist for the
callers the contract does not govern (the terrarium, the exhibits, the authored
programs' pads, §3.12's second bullet). WP-6's scan is a guard against a
regression rather than a change.

**Flipped at WP-6:**

- **The plan's three arrays become the resolver's.** `finish()` returns the frozen
  `ResolvedGround`; `ColumnPlan.ground`, `.fluidTop` and `.fluidKind` become
  readonly aliases of its arrays. §10's "writing is a type error" is then true by
  construction rather than by a static scan — the scan stays as the guard against
  a module that keeps its own `Int32Array`.
- **`view()` becomes tier-typed.** `view(tier)` masks every column whose owning
  intent is not in a strictly higher tier back to the baseline, which is §13.7's
  `declare(tier, above: ResolvedGround)` and closes §9a.4's second approximation.
- **The build phases move behind the freeze.** §9 step 2's "second loop that runs
  in the build phase" becomes literally true: declaration completes for every
  pass, `finish()` freezes, and the material loops, block emission and furnishing
  run against the frozen ground. This is the change §3.7's balustrade and §3.3's
  coping-as-a-structure-block workarounds were waiting for.
- **The transitions get consumers.** Until WP-6 `resolved.transitions` is
  computed and **not consumed**: a transition derived against a partial owner
  field is not the transition the full set produces — an unconverted neighbour
  reads as `owner = -1`, the baseline, whose request §5.6 reads as `"ramp"`. So
  §5.6's "consumers read this list" — `buildRetainingWalls` building the `wall`
  transitions instead of deriving seams, the streetscape's curb reading the
  `step` ones, `CURB_LEVEL_TOLERANCE`'s deletion — is WP-6 work in every case,
  even where the pass converts at WP-3 or WP-4.

**Not flipped at WP-6:** the per-commit resolve does *not* collapse to a single
call. Collapsing it to one resolve per tier (§1.4's four) requires the pipeline
to run in tier order, and it does not — `digCanals` (tier A) runs after
`buildRetainingWalls` (tier B), `furnishCourtyards` (rank 50) after the walls
(60/70). WP-6 keeps the accumulating prefix and the typed tier mask; the reorder
is a later round's, and it buys clarity rather than correctness, because the
final resolve is over the whole set either way.

**One precondition.** §13.3 must be answered before the write-through becomes the
whole ground, because that is the change that makes `PAD_APRON_MISMATCHES` real
(§9a.5). It is the first item of WP-6, not a task inside it.

---

## 10. What the contract lets us delete — WP-6

WP-6 is not only a freeze; it is the payoff, and listing it is how the rewrite is
shown to have reduced rather than added.

- `ColumnPlan.ground`, `.fluidTop` and `.fluidKind` become read-only past the
  resolver (a `ReadonlyInt32Array`-shaped view, or a branded type; writing is a
  **type error**).
- `structures/retaining.ts`: the dilated `street` mask, the `seam` mask and its
  hand-off through `surfaceStreetGraph` into `blendShoulders`, and the
  coping-emitted-as-a-structure-block workaround. Three defences, one rank.
- `structures/retaining.ts`: the inverted-occupancy `avoid` grid built for the
  wall sweep ("four floating fence posts, measured").
- `structures/roads.ts`: `natural = Int32Array.from(plan.ground)`. The baseline
  *is* the snapshot, and there is only one.
- `structures/roads.ts`: the `paved` special cases in `surfaceRoute` and the
  zero band in the `gradeProfile` call (I7).
- `structures/streetscape.ts`: the read of `plan.ground` at the centre column,
  and `CURB_LEVEL_TOLERANCE`'s "was the natural ground close enough" test, which
  becomes "is there a `step` transition here" from the resolver's list.
- `structures/canals.ts`: the "bank already at the quay" skip (§3.5).
- Eleven `plan.snow[idx] = 0` lines.
- The equivalence shim itself, and `ground-declare.ts`'s shadow declarers.

And one test is added rather than deleted: **no module outside
`layout/ground-resolver.ts` writes a frozen array.** Enforced statically (a
`grep`-shaped test in the spirit of `packages/spec/test/agent-defs.test.ts`, plus
the type), and scoped explicitly — §3.12's exhibit builders are either converted
or named as the enumerated exception.

---

## 11. Test surface

Expanding the brief's four bullets into names and assertions. New files:
`test/ground-contract.test.ts` (WP-1), `test/ground-resolver.test.ts` (WP-2),
`test/ground-equivalence.test.ts` (WP-2, the safety net),
`test/ground-freeze.test.ts` (WP-6).

**`ground-contract.test.ts` — the order is an order.**

- `INTENT_RANK covers every GroundSourceClass` — exhaustive over the union type,
  no class unranked. (The `agent-defs.test.ts` lesson: a silently-missing entry
  looks exactly like "precedence is broken".)
- `INTENT_RANK values are distinct and ascending in tier order`.
- `compareIntent is a strict total order` — irreflexive, antisymmetric,
  transitive, and never 0 on distinct intents, over a generated set covering
  every class and both `subRank` extremes.
- `compareIntent agrees with compareStreetRank within street.network` — the
  proven order is preserved, segment for segment, on a real district graph.
- `every kind declares a legal class` — `face` only from `retaining.*`, etc.

**`ground-resolver.test.ts` — the algorithm.**

- `a single claim wins its columns and nothing else moves`.
- `agreement is not conflict` — two claims, same level, one column: zero
  diagnostics, `satisfied` counted for both.
- `the rank-minimal claim wins` — three claims across three tiers on one column,
  in every one of the six declaration orders, produce one identical result.
- `iteration order is never observable` — the same intents in a shuffled array,
  with `columns` supplied as a generator, an array and a `Set`, produce
  byte-identical `ResolvedGround` including diagnostic order.
- `a preserved column reports its loser` — the brief's conflict test: two
  subsystems declaring incompatible levels on one column produce a diagnostic
  naming **both**, rather than a silent winner. Assert `GROUND_CONFLICT`'s
  message contains both sources and the drop.
- `an unguarded loss is silent` — the same shape without the `preserve`: zero
  warnings, one `GROUND_CLAIM_ADJUSTED` note, one report row.
- `a clearance clamps rather than refuses`.
- `clearances compose by minimum regardless of rank`.
- `invariant violations are errors` — `fluidTop < ground`, a level out of world
  range, a duplicate column in one intent, a `preserve` on an unowned column:
  each is exactly one `LOAM-E494`.
- `transitions are derived from the drop and the run` — a synthetic two-platform
  field at each of drop 1, 2, 6, 7 and run 5, 6, 25 reproduces
  `treatmentForSeam`'s table exactly.
- `a diagonal boundary is one transition` — the lattice-staircase regression: a
  45° boundary produces **one** component, not a crumb per column. The 8-connected
  grouping is asserted directly, because this is the third appearance of the
  lesson and the first two were both found by walking.
- `a face suppresses the transition across it`.
- `a "none" request on either side suppresses the transition`.
- `a wall request under MIN_RETAIN_RUN is substituted and reported`.
- `the report accounts for every declared column` — for every claim,
  `satisfied + adjusted + refused === declared`. An arithmetic identity, and the
  cheapest possible guard against a claim being silently dropped.

**`ground-equivalence.test.ts` — the safety net (§8).**

- `flat controls: zero declaration gaps` — over `showcase-*`, `demo-*`,
  `c1-harbourtown`.
- `flat controls: resolver and pipeline agree element for element` — all three
  arrays.
- `flat controls: no column is conflicted`.
- `hill worlds: zero declaration gaps` — `hillside-village`,
  `hilltop-crypt-hamlet`, one generated stepped quarter.
- `hill worlds: clean columns match exactly`.
- `hill worlds: every divergence is attributable to a named inversion` — with
  the per-inversion counts asserted against a committed golden.
- `I7 produces no divergence` — expected count exactly zero.
- `I6's delta never exceeds 7 blocks` — the measured size of the defect it fixes.
- `the driver's answer is the one-shot resolve` (from the first conversion,
  §9a.5) — `driver.finish()`'s three arrays equal
  `resolveGround(baseline, driver.intents)`'s element for element. The proof that
  the accumulating prefix is not a second resolver, and the assertion that
  catches an intent whose `columns` were a generator.

**Generated worlds — what unit tests cannot see.** Per the brief and per Phase
4.1's and 4.2's record (three defects then six, all through green unit tests),
the bar is a compiled world read back off disk and linted on all **26** rules
(`PHYSICS_RULES`, `emit/physics.ts`). Added to the existing generated-world
acceptance:

- `road.proud` is **zero** — the rule that catches a street left standing on a
  bank, and the one I4 and I5 most directly protect;
- `unsupported.chain` and `floating.isolated` are **zero over every retaining
  wall's balustrade** — the finding that survived four rounds of fixes and that
  `preserve` exists to make impossible;
- `traversal.unreachable` is zero — no platform is orphaned by a transition the
  resolver chose differently;
- `LOAM-T110 UNSTABLE_FLUID` is zero — the `fluidKind`-freezes-with-the-pair
  argument of §1.3, checked rather than asserted.

**Regressions the resolver must not break.**

- `test/road-cross-section.test.ts` — cross-section flatness, unchanged. The
  brief names it explicitly.
- `test/street-ownership.test.ts` — the rank order and the pins.
- `test/levels.test.ts`, `test/seam-runs.test.ts` — seam derivation.
- `test/levels-identity.test.ts` — a `terraced` quarter's `foundationY` list.

**`ground-freeze.test.ts` — WP-6.**

- `no module outside the resolver writes a frozen array` — static scan of
  `packages/compiler/src`, with §3.12's exceptions enumerated in the test itself
  so adding one is a visible diff.

---

## 12. Byte-identity

**The guarantee: a flat world must not move, through every work package.**

> **Amended by §9a.6.** The guarantee is per *column*, and only a world with an
> all-zero golden inherits it world-wide. WP-2c measured `c1-harbourtown`,
> `showcase-ironvale` and `demo-deltaport` — three of the worlds this section
> calls flat controls — as movers; they move by exactly their goldens, at the
> work packages §9a.3's table names. The shasum control set is every world whose
> golden is all zero, which today is the two hill towns.

The argument, checkable independently of the test:

1. **WP-1 adds types only.** No call site changes; every existing test passes
   unmodified.
2. **WP-2's shim is read-only and off in production.** The baseline snapshot and
   the shadow declarers compute; they never write. `sweep()`'s declaration mode
   is additive and unused by the mutating path.
3. **On a flat world, every claim on a shared column proposes the same level.**
   Every pass's level derives from one plane: the pad's target, which is the
   field's value, which is constant. So `levels(k)` is a singleton for every
   column, `CONFLICT` is empty, and §5.3's agreement rule makes the resolver's
   answer identical to last-write-wins **regardless of the order**. This is the
   same argument `COURTYARDS-AND-LEVELS` §2.3 makes for column ownership, and it
   held.
4. **Materials keep their passes and their order** (§1.3, Group M), so the
   emitted block stream is unchanged even where the geometry is recomputed.
5. **The driver writes only claimed columns, and only values point 3 makes
   identical** (§9a.6). That is what carries the argument across the mixture
   period rather than only across its endpoints.
6. **WP-6 deletes; it does not decide.** Every deletion in §10 is a defence that
   is provably redundant once rank decides, and each is removed with the
   equivalence test still green.

**The expected exceptions, stated rather than buried.** `hillside-village`,
`hilltop-crypt-hamlet` and any `terraced` or `stepped` quarter **will** move, at
WP-3 through WP-5, by exactly the inversions in §4.4 and by nothing else. Each
move is attributable by §8.3's partition, counted per inversion in §8.4's
golden, and — per the standing rule — **not shipped without a walk**. Visual
iteration still needs Kai; the resolver does not get to decide that a hill town
looks better.

---

## 13. Open questions

Each is something this document could not settle from the code, with a
recommendation, so an implementer knows which way to lean and who to ask.

**13.1 Do the classification masks need to be frozen too?**
`lakeMask` and `oceanMask` are written by `digCanals` and
`precincts.surfaceColumn` alongside `fluidKind`, and §1.3 keeps them in Group C.
That leaves the pair able to disagree: a column could be `fluidKind = WATER` and
`lakeMask = 1` after the resolver moved it. **Recommendation:** keep them
unfrozen, have those passes derive from `ResolvedGround.wet`, and add an
invariant test — `lakeMask[k] | oceanMask[k] === 1 ⟹ fluidKind[k] !== NONE` — to
`ground-freeze.test.ts`. Escalate to freezing only if that test fails for a
reason that is not a one-line fix.

**13.2 Where does `infra.wall@0` rank?**
`structures/walls.ts` writes no levels today, so `structure.linework` (rank 25)
is reserved and unexercised. A city wall's gate is where a road passes through,
which argues the wall should outrank the road; a wall that cut a street would be
worse. **Recommendation:** keep 25 (above every street) and require the wall pass
to declare `"none"` at its gate columns, so the road passes through by
declaration rather than by rank. Revisit when the wall actually levels ground.

**Reopened and answered, 2026-08-17. Everything from here to §13.3 is
normative and is the contract for `structure.linework`; the paragraph above is
kept as the question it was.** The rank stays at 25, it stops being *reserved*,
and the thing that kept it unexercised turns out to have been a conflation
rather than a contradiction.

*What the reopening found in the code, and each of these is checkable.*

1. **The resolver is rank-only.** `resolveGround` never reads `GROUND_TIERS`;
   §5.2's five passes sort by `compareIntent` and nothing else. §4.3's tiers are
   a statement about what a declarer may **read** (§1.4), not an input to
   arbitration. A rank-25 intent therefore resolves identically from any
   pipeline position — the driver re-resolves the whole accumulated prefix
   against the immutable baseline on every `commit` (§9a.1), so position changes
   *when* the answer is known, never *what* it is.
2. **A tier-A class already declares from a post-street pass.**
   `declareWaterWorks` (`structures/water-works.ts`) commits `fluid.channel` —
   rank 0, tier A — from `buildInfraEntries`, which runs in the wall's slot,
   after `surfaceStreetGraph`, `buildRoadNetwork` and `buildDoorsteps`. So
   "a tier-A declarer must run before the streets" was never a property of the
   machinery. It is a property of what a tier-A declarer may look at.
3. **The streets exist before the street pass.** `StreetGraph` — segments
   carrying `path`, `width`, `kind` and `role`, plus the intersections and the
   sidewalk band — is decided in the **layout** stage (`layout/district.ts`,
   `DistrictPlan.streets`), and the arterials are on `CityPlan.arterials`.
   `surfaceStreetGraph` does not decide *where* a carriageway is; it decides
   what level it holds and lays it.

Fact 3 is the whole answer. `docs/INFRA-ENTRIES-v0.md` §3.5 wrote *"a tier-A
declarer must declare against the baseline, before streets exist, while every
pre-freeze entry finds its crossings against the finished carriageway — both
cannot be true"*, and the sentence conflates two different questions:

| question | answered by | available |
| --- | --- | --- |
| *where does a carriageway cross my line?* | the **solved layout** — segment paths, widths, intersections, arterials, `RouteCorridor`s | from the moment placement is done |
| *what level does the carriageway hold there?* | the **surfaced** street (§3.6) | only after the street pass |

A tier-A linework needs the first and must never use the second: using it would
be reading downward, which §1.4 forbids in exactly the terms that make the
recursion well-founded. Both *can* be true, because they are not the same true.

**13.2a The contract — normative.**

1. **Who declares.** One pass, the **linework declaration slot**. Entries reach
   it through a registry row, never by each acquiring a pass of its own — the
   rule `docs/INFRA-ENTRIES-v0.md` §3.3 already states for the host. No other
   module may construct an intent whose `sourceClass` is `structure.linework`;
   that is enforced by a `grep`-shaped test in the `agent-defs.test.ts`
   tradition, beside the one §10 asks for, because a second declarer appearing
   at a later slot is precisely the failure this contract exists to prevent and
   it would look exactly like "rank 25 is broken".
2. **When.** After `buildPrecincts` (rank 20, the last claim above it that
   grades ground) and **before `pavePlaza`** (rank 30). Pipeline order and rank
   order then agree from 0 through 30, which is what makes the slot's view a
   legal tier-A read rather than a convenient one.
3. **Against what ground state.** The levels a linework declares must be a
   **pure function of `(GroundBaseline, the resolved answers of ranks 0–20, the
   solved layout, the finished placement)`** and of nothing else. Concretely:
   `driver.view()` at the slot, which at that position is the baseline — which
   already carries the solver's pads, applied to the field before materialisation
   (§3.12) — plus `precinct.ground` written through. It may not read the
   plan at any later position, and no linework declarer may run after
   `pavePlaza`. `digCanals` is rank 0 and runs *later* (§9a.4's named
   approximation); a linework therefore keeps off water by reading
   `baseline.fluidKind`, not by waiting for the canal pass, and where it collides
   anyway rank 0 settles it silently and correctly.
4. **What it may declare.** `profile` (a bed), `platform` (an abutment or a
   landing), `clearance` (the underside of whatever it carries), and `preserve`
   over a subset of the columns it won. **Never `face`** — `LEGAL_KINDS` permits
   `face` only from `retaining.*`, and that is right: a linework that wants a
   face declares its bed and lets §5.6 derive the transition, which is how a
   retaining wall arrives under a viaduct approach without anybody having
   declared one. **Never `fluid`** — a channel is rank 0, and a linework that
   holds water is a `fluid.channel` client wearing the wrong hat.
5. **The crossing set — what refuses, and it refuses by declaring nothing.**
   Before it declares, the declarer subtracts from **every claim of every kind**:
   - the **solved carriageway band**: for every `StreetGraph` in the document,
     every segment whose `role` is absent or `"carriageway"`, rasterized with
     `lineCells` and dilated by `ceil(width / 2) + 1` in the Chebyshev metric;
     every arterial `path` at its own width by the same rule; every intersection
     dilated by `ceil(maxWidth / 2) + 1` for the widest segment meeting there;
     every registered `RouteCorridor` at its width plus `ROAD_CORRIDOR_MARGIN`;
   - every column where `baseline.fluidKind !== NONE`. A linework crossing water
     spans it and declares `clearance` at the deck underside plus `preserve` on
     the water column (§2.4's bridged column, verbatim) — never a bed.

   Those columns receive **no claim at all**, so the road passes through by
   declaration rather than by rank. That is §13.2's original instruction,
   generalised from `infra.wall@0`'s gates to every client of the class.
6. **The band rule, and why the `+1` is not a fudge.** The crossing set must be
   a **superset** of the columns the finished carriageway occupies where it meets
   the course. The `+1` dilation is what makes the superset hold by construction
   against a rasterizer the declarer does not run, and a test asserts the
   property directly on both hill-town fixtures and one generated world: no
   column that ends up `street.network`-owned with `role: "carriageway"` and lies
   on a declared course is outside the crossing set. If that assertion ever
   fails the failure is a bed under a lane — the assertion is what makes it loud
   instead of walked.
   The dressing is deliberately **not** in the superset. A sidewalk (90), a
   verge (140) or a doorstep landing (120) losing a column to a bed is the rank
   order working; a *carriageway* losing one is the defect.
7. **What the resolver promises.** Given a well-formed declaration:
   - every claimed column outside the crossing set resolves to the linework's
     level unless a rank below 25 owns it. Only three classes can:
     `fluid.channel`, `precinct.ground` and — when something first declares it —
     `building.footprint`, which is as unexercised today as rank 25 was, because
     a floor plane reaches the resolver through the baseline and through
     `pad.record` (150) rather than through rank 10;
   - every `street.network`, `street.sidewalk`, `road.network`, `sweep.run`,
     `doorstep.landing`, `farm.parcel`, `prop.pad`, `verge` and `pad.record`
     claim on those columns loses, silently, counted in its own report row's
     `refused` and attributed in `refusedTo` (§7);
   - the boundary between the bed and the ground beside it becomes a
     `GroundTransition` under §5.6's table — `kerb` under a drop of 2,
     `retaining` from 2 to `RETAIN_MAX` over at least `MIN_RETAIN_RUN` columns,
     `bank` otherwise — **derived, never declared**, so a linework never asks
     for its own retaining wall and never gets one it did not earn;
   - a `preserve` over the bed turns any lower-ranked loss from silence into
     `GROUND_CONFLICT` (§5.4), which is how "a doorstep cut into a viaduct
     approach" becomes news rather than a walk.
8. **The one thing the contract does not promise, stated so nobody builds on
   it.** A rank-25 bed does **not** move blocks a lower-ranked pass has already
   emitted. Materials are Group M and ride the column — a street's
   `plan.surface` follows its resolved level — but `StructureBlock`s carry an
   absolute Y, and `dressStreetStairs`, `buildRetainingWalls`,
   `buildJunctionSteps` and the bridge kit all emit them. A bed committed after
   those passes would leave their masonry at the old level. **This is the second
   reason the slot is where it is, and it is what makes rule 2 a hard
   constraint rather than a stylistic preference.**
9. **Declare early, build late.** The slot declares levels and writes no block.
   The materials stay in the wall's slot with the rest of the host, and are laid
   against `plan.ground` — the resolver's answer — through the existing
   `declaredColumnOps` path, never against the level the entry asked for. That
   is §9a.1 rule 2 and §3.13's declare → commit → build, with the declare and the
   build in two slots instead of one. The two are joined by a handoff record the
   early pass returns and the late pass consumes: node path → the bed's columns
   and their declared levels, nothing more.
10. **Reach law.** A document with no linework-declaring node compiles
    byte-identically. The slot is total on an empty job list — the caller never
    constructs the pass, exactly as `buildInfraEntries` is total today — and no
    world before this contract holds a `structure.linework` claim, so the
    class's first exercise is byte-identity-free by construction. The same
    argument `farm.parcel` made at rank 125, for the same reason.

**13.2b Determinism obligations — normative.**

- The route is a pure function of the finished placement plus the solved layout:
  integer or exact-rational arithmetic over a fixed iteration order, no RNG, no
  clock (`docs/INFRA-ENTRIES-v0.md` §3.4, unchanged and now load-bearing one
  tier higher).
- The crossing set is built by iterating districts in **document order**,
  `StreetGraph.segments` in their own order, and cells in rasterization order,
  into a `Set<number>`. The set's iteration order is never observable: the
  subtraction's result is **sorted ascending by column index** before it becomes
  an intent's `columns`, which is `declareRun`'s existing rule and §5.7 rule 2
  restated for a declarer.
- A bed that crosses itself must merge before it declares. A column claimed
  twice at two levels is `LOAM-E494` (§5.7 rule 3), so the tie is broken
  explicitly: **the lower level wins, then the lower chord index** — stated
  here because an unstated tie-break is two runs disagreeing, which is the one
  determinism hazard `INFRA-ENTRIES` §3.4 already names for `across` and `into`.
- `subRank` is unused within `structure.linework` and must stay unset. Two
  linework declarers order by `source`, which is the node path, which is unique;
  a `subRank` would make that order depend on a job list nobody promised to
  stabilise.
- `columns` may still be generated lazily; the driver materialises each intent
  on receipt (§9a.1 rule 4).

**13.2c Diagnostics — the `T23x` family, continued from `LOAM-T234`.**

The resolver's `LOAM-W49x` codes are unchanged and do the arbitration half:
a bed that loses columns to rank 0/10/20 is `GROUND_CLAIM_ADJUSTED`
(`LOAM-I491`), below `minColumns` it is `GROUND_CLAIM_REFUSED` (`LOAM-W492`),
and a guarded loss is `GROUND_CONFLICT` (`LOAM-W490`). Two new codes carry the
half the resolver cannot see, because it is about the *crossing subtraction* and
happens before anything is declared:

| code | name | fires when |
| --- | --- | --- |
| `LOAM-T235` | `LINEWORK_BED_REFUSED` | the bed kept fewer than `minColumns` columns after the crossing subtraction, so no bed is declared at all and the run is built on the ground it finds. The message names the count and which of the two subtractions took them — carriageway or water — because "my viaduct has no approach" and "my viaduct is in a river" are different news |
| `LOAM-T236` | `LINEWORK_BED_INTERRUPTED` | the bed was declared but the crossing subtraction cut it into more than one run, or removed more than `INFRA_REFUSAL_FRACTION` of its columns. A note, not a warning: the entry is built and the honest recovery is reported the way `WALL_MARGIN_REDUCED` and `INFRA_RUN_REFUSED` report theirs |

Per §13.6's precedent neither enters `FEEDBACK_CODES`: a code that fires on every
world costs money in the authoring loop and buys an invented change.

**13.2d Why not retirement — the case, weighed and refused.**

Retirement was the honest alternative and it nearly won. Of the three clients
this section and `INFRA-ENTRIES` §3.5 promised the rank, **two landed without
it**: `aqueduct` and `maglev_pylon` shipped 2026-08-15 as `carry` spans on the
`between` form, where a pier is *refused* where something else owns the column
rather than negotiated for, and `telegraph_line` landed the same day as a poled
hanging span. The third, `infra.wall@0`, still writes no level. Across all 68
taxonomy rows, family A declares `sweep.run`, family B declares `retaining.seam`
(and `fluid.channel` for the two that move water), and families C/D/E/F declare
nothing at all — so on the evidence of the shipped host, rank 25 has no client
and the table could lose a member.

The carried-span doctrine is *right*, and the reason it is right is exactly the
reason it does not generalise: **nothing walks onto an aqueduct's water or a
maglev guideway's beam.** A run whose surface no other subsystem must meet has
no business asking the ground for anything, and refusing a pier is a better
answer than re-levelling a lane to seat one. That property fails for precisely
one member of the family — the one that did not land. **A viaduct's deck is a
carriageway.** A road must arrive on it, which means its approach embankments
are ground the street network has to join rather than cut.

So the rank's purpose can be written in one sentence, which is what it was
missing:

> **`structure.linework` is for a line whose own surface something else must
> walk onto.** The ground makes room for it and the streets join it; a line
> nothing walks onto refuses instead, and stays at `sweep.run`.

Retiring the rank would delete a union member, a rank, a tier row, a typed
adapter (`InfraSourceClass`) and one refusal, and would buy nothing the first
viaduct would not have to re-derive from scratch — including this sentence,
which took a reopening to find. Kept, contracted, and now falsifiable: if the
first two clients below both come back as refusals on a walk, retirement is the
right call and the rank number stays reserved-dead for history.

**13.2e The first two clients.**

| client | taxonomy row | route | declares | must not |
| --- | --- | --- | --- | --- |
| **`viaduct`** | `INFRA-ENTRIES` §2 family **A**, the 25-row list; catalog `infra("viaduct", "Viaduct")`, still unimplemented — the last of the three carried runs §4's post-freeze tail item 4 promised the rank | `between` two placed anchors, as `aqueduct` and `maglev_pylon` already resolve it | its two **approach embankments** as `profile` at rank 25 — grade at the outer end rising to `deckY` at each abutment, at the entry's own grade cap — plus `clearance` at the deck underside over every bay, plus `preserve` over the embankments | declare a bed **under the arcade**. The bays keep their ground at grade: that is the one thing an arcade must not take away from what it crosses (`INFRA-ENTRIES` §3.2's carried-span rule 2), and a viaduct that levelled its own bays would be an embankment with holes in it |
| **`infra.wall@0`** | `INFRA-ENTRIES` §2, the two "already answered" rows — and this section's original subject | `ring`, `deriveWallCourse` verbatim, unchanged | a **levelled wall bed**: the course benched rather than following every hummock, as `profile` + `preserve`, and **nothing at all** at the crossing columns, which is where the found gate then lands | change its gate *dressing*. The bed's crossings come from the solved layout in the early slot; the gate fitting keeps being found against the finished carriageway in `walls.ts`'s own slot, and rule 6's superset property is what guarantees the two agree |

**The wall's adoption is gated on a walk, and must not ship blind.** Whether a
benched course reads better than the found-ground course it has today is an
aesthetic call, it is Kai's, and the standing manual-critique law says a look is
never tuned without a walk. The contract above is what makes the experiment
one flag rather than a redesign: the wall declares nothing until the verdict, and
the machinery lands with `viaduct`, which is not a taste question.

**13.2f Implementation brief.**

Dispatchable as written; `opus-5-low` against this section, no further design.
It is machinery plus one client, and the client is what proves the machinery.

*Order, and each step is separately committable.*

1. **The crossing set** — new `layout/solved-carriageway.ts`:
   `solvedCarriagewayMask(region, districts, cities, corridors): Uint8Array`,
   implementing §13.2a rule 5's first bullet exactly, reusing `lineCells`
   (`structures/roads.ts`) and `ROAD_CORRIDOR_MARGIN` (`layout/corridors.ts`).
   Pure, no plan, unit-testable without a compile — the `street-owner.ts`
   discipline.
2. **The slot** — new `structures/linework.ts` and one call site in
   `structures/index.ts` between `buildPrecincts` (~line 527) and `pavePlaza`
   (~line 856). Total on an empty job list. It fills the existing
   `InfraPlacementView` with `onRoad` backed by step 1's mask and `ground`
   backed by `driver.view()` at the slot, calls `resolveInfraRoute` unchanged,
   computes the bed, subtracts, sorts ascending, and `driver.commit`s the
   `profile` + `clearance` + `preserve` triple in **one** call — companion
   intents belong in one arbitration (§3.13). Returns `LineworkBeds`: node path
   → columns and declared levels.
3. **The handoff** — `buildInfraEntries` takes `LineworkBeds` and, for a job
   whose row declares `structure.linework`, skips the sweep's own declaration
   and lays materials through `declaredColumnOps` against `plan.ground`. The
   existing `INFRA_ENTRY_PARAM` refusal at the top of its job loop is
   **replaced, not deleted**: the wall's slot still refuses the class from its
   own position, and the message changes from "post-freeze work" to "declare it
   from the linework slot".
4. **The codes** — `LOAM-T235` / `LOAM-T236` in
   `packages/spec/src/terrain/diagnostics.ts`, continuing the block that ends at
   `INFRA_RUN_REFUSED`, neither in `FEEDBACK_CODES`.
5. **The client** — `viaduct`'s registry row in
   `packages/stdlib/src/structures/infra-entries.ts`: `aqueductSpan`'s sibling
   with the channel removed, the deck widened to a carriageway, `sourceClass:
   "structure.linework"`, and the approach parameters. Catalog row flips to
   `implemented` with its note. One exhibit row: a run, not a cell — a straight
   segment, a curve, a corner and one crossing a slope (`CATALOG-EXPANSION` §5
   rule 5).

*Tests.*

- `test/ground-contract.test.ts` — `structure.linework` accepts `profile`,
  `platform`, `clearance`, `preserve` and **rejects `face`**; rank 25 still sits
  strictly between `precinct.ground` and `plaza.ground`; tier still `A`.
- `test/linework.test.ts` (new) — the crossing set is a superset of the
  carriageway columns on both hill-town fixtures and one generated world (rule
  6); the subtraction is order-independent (shuffle the district list, compare
  the intent's `columns` element for element); the self-intersection tie-break;
  `T235` on a bed subtracted below `minColumns`; `T236` on a bed cut in two.
- `test/ground-resolver.test.ts` — a rank-25 `profile` beats a `street.network`
  `profile` on a shared column and the street's report row attributes the loss;
  a rank-0 `fluid.channel` beats the linework; a `preserve` over the bed raises
  `GROUND_CONFLICT` when a doorstep loses a guarded column.
- **Reach law** — the byte-identity harness of §12 on `c1-harbourtown`,
  `showcase-deltamere` and both hill-town fixtures: no linework node, not one
  byte moved. Prove the harness can see a difference before trusting that it saw
  none.
- The **grep-shaped test** of §13.2a rule 1: no module outside
  `structures/linework.ts` constructs an intent with `sourceClass:
  "structure.linework"`.

*What this brief must not touch.* `layout/ground-resolver.ts` — the resolver
needs no change for any of it, and that is the strongest evidence the rank was
designed right the first time. `structures/retaining.ts`, `walls.ts` and the
wall's gate finding, all unchanged until the walk verdict of §13.2e.

**13.2g Implementation notes (2026-08-17, recorded as built).** The viaduct
landed the same day the brief was written, and seven contract lines took
their final shape under implementation pressure. Normative where they refine
the rules above:

1. **The `preserve`/tie contradiction is pre-existing and now on the WP-6
   ledger.** §5.4 requires a guard to carry its claim's own `source`, and
   `compareIntent` ignores `kind` — a claim and its guard tie, which is
   `GROUND_INVARIANT` territory. `retaining.seam`/`retaining.skirt` have
   shipped around this since they landed; the linework follows that
   precedent. The proper fix — `compareIntent` breaking its last tie on
   `kind` — waits for WP-6, where the resolver may be touched.
2. Rule 5's guard **on a bridged water column** is unimplementable (§5.4
   again: you cannot guard what you never claimed); clearance covers the
   bays, water included, and no guard is laid on water.
3. The approach's grade is **floored at 1** regardless of the entry's
   routing cap: a ramp a player cannot walk onto defeats the premise of the
   rank. The routing cap still governs the `between` search.
4. **T236 counts relatively**: a viaduct legitimately declares two runs, so
   the diagnostic fires when subtraction *increases* the run count, not on
   any count above one.
5. The approach cross-section is a **Chebyshev half-disc** — a normal-offset
   line shatters into pillars at 45°, and a full disc lays bed under the
   arcade, which is this section's one prohibition.
6. The viaduct row carries **no rail**: the host raises a carried span's
   abutments to the section's top, so a rail walls the deck exactly where
   the approach arrives (measured: walkable 94/96 → 96/96 without it).
7. §13.2f's superset test runs against **three form-registry skeletons
   surfaced by the real `surfaceStreetGraph`** (grid, organic, a true 45°
   avenue) rather than the hill-town fixtures, which carry no district node
   and therefore no `StreetGraph` to be a superset of.

**13.3 Should the pad's apron become a declared transition?**
The fourth walked defect — "a building's `apron: 2` ramped away the seam a
retaining wall stood on" — happens at stage 2, before materialisation, and the
brief pins stages 1–3 as unchanged. §3.12's `pad.record` makes the pad *visible*
to conflict detection but does not stop the apron. **Recommendation:** do not
move it in WP-1–6. Log it as WP-7: `applyLevelPad` declares the platform and the
resolver chooses the transition, which would make the apron the third client of
`treatmentForSeam` and close the defect properly. It is a bigger change than it
looks, because the field is what `padFor`'s ground-policy election reads.

**WP-2c measured the cost of leaving this open, and it is no longer free.**
`declarePadEdits` declares a footprint at `targetY`; on `c1-harbourtown` **55**
footprint columns (61 on `showcase-deltamere`) are reached only by a *later*
pad's apron and disagree with that declaration. They have exactly one claim, so
they partition CLEAN — and at WP-6, when the resolver's answer becomes the
ground, it would raise up to 3 blocks under a floor plane the fabric had graded
away. Held as an asserted golden of exactly 55 (`PAD_APRON_MISMATCHES` in
`test/ground-equivalence.test.ts`) so it cannot grow silently; both candidate
declarer fixes decide this question by implementation, so neither was taken.
**This question must be settled before WP-6 freezes the ground.**

**13.4 The contract does not protect materials — is that enough?**
`faceCuts`' coping is a `surface` write and can still be overwritten by a later
material pass. That is exactly the shape of the second walked defect ("a
retaining wall's coping was overwritten by a later pass"), one layer down.
**Recommendation:** accept it for WP-1–6 and rely on pass order, but measure it:
add a generated-world assertion that every wall course column's emitted top
block is the theme's coping. If that fails, the answer is a narrow
`materialOwner` mask, not a second resolver.

**13.5 What fraction of a claim lost counts as a refusal?**
`GROUND_CLAIM_REFUSED`'s threshold is `minColumns`, declared by the pass. No
measurement exists for what a sensible default is. **Recommendation:** default 1
(fires only on total loss), and let the two passes that have a real threshold set
it explicitly — `buildRetainingWalls` at `MIN_RETAIN_RUN = 6`, and
`streetStairGeometry` at whatever its whole-run refusal already uses.

**13.6 Do the new codes go into `FEEDBACK_CODES`?**
`GROUND_CONFLICT` and `GROUND_CLAIM_REFUSED` are arguably author-actionable in
the "your quarter is over-constrained" sense. **Recommendation:** no, initially.
`BIOME_CLAMPED`'s history is the precedent — a code that fires on every
settlement world and lands in the authoring loop's feedback set costs money and
buys an invented change. Revisit once a hill town's typical counts are known.

**13.7 Is the tier escape hatch abusable?**
§1.4 lets tiers C and D read higher tiers' answers. Nothing in the type system
stops a pass reading its *own* tier if the driver hands it too much.
**Recommendation:** make `resolveGround` expose a per-tier `ResolvedGround` and
type the declaration driver as `declare(tier, above: ResolvedGround)` so a pass
literally cannot be given its own tier. Assert it in `ground-contract.test.ts`.

**13.8 `RETAIN_MAX`, `RETAIN_RAIL` and `MIN_RETAIN_RUN` are unmeasured.**
`layout/levels.ts` says so in its own comments (§10.2 of
`COURTYARDS-AND-LEVELS`). Under this contract those three numbers stop being one
pass's tunables and become **the resolver's transition table**, so a wrong number
moves every hill world rather than one quarter's walls. **Recommendation:**
re-measure on a generated hill town before WP-4 lands, and pin the measurement in
`levels.ts` beside the constants — the way `MIN_RETAIN_RUN`'s own 2026-08-05
measurement is pinned.

**Measured 2026-08-07, on both hill-town fixtures, and no constant was changed.**
The distributions below come from `structures/retaining.ts` as it stands after
the composite gate landed; the compile report now carries the first of them on
every world it builds (`built faces by finished drop (§13.8)`), so this is a
sample of a standing measurement rather than a one-off.

*`site-plan-hillside`.* Seven seams reach the pass: run lengths 1, 1, 1, 3, 5, 6
and 191 columns, at drops 2, 2, 2, 2, 2, 5 and 7. Six are answered as banks and
one is a building's own back. **No wall is built at all** — zero wall columns,
zero rail columns, and therefore no face histogram. Five of the seven runs (71%)
are shorter than `MIN_RETAIN_RUN`.

*`site-plan-hillside-steep`.* Twenty-one seams: run lengths 1, 1, 2, 2, 5, 5, 5,
5, 5, 7, 10, 13, 13, 14, 14, 15, 19, 27, 90, 101, 183, at drops 4 (×1), 5 (×2),
6 (×8), 7 (×2) and 9 (×8). Nine of the twenty-one (43%) are shorter than
`MIN_RETAIN_RUN`. Three are answered `retaining`, twelve as banks, six as a
building's own back; of the three walls one is converted by the composite gate,
leaving **two walls over seven chains and 48 wall columns**. Their face profile,
column by column along the seam: **4 at drop 2, 4 at 3, 8 at 4, 9 at 5, 17 at
6** — 42 face columns, nothing above `RETAIN_MAX`, and 40% of them sitting
exactly on it.

*What the three numbers look like against that.* **`RETAIN_MAX = 6` is doing
work and stays**: the ceiling is the mode of the built distribution, which is
what a ceiling that binds looks like, and the sheer-face audit finds no built
face past it once the composite is measured. **`MIN_RETAIN_RUN = 6` stays** and
has earned a second duty: it is now also the bar the composite gate uses — a
stretch of *over-ceiling* face shorter than the shortest wall we build is not a
too-tall wall — so the same argument decides both directions of the same
question. **`RETAIN_RAIL = 3` is still unmeasured, and the reason is not the
number.** All seven built chains drop 5 or 6 blocks, well past it, and **not one
carries a balustrade**: the gate that fires is `RAIL_ACCESS_RANGE` — a parapet
is built only where somebody can walk up to the wall — so on these two fixtures
the drop threshold is never reached. Measuring it needs a fixture whose streets
run along a wall top, not another hill.

*The one thing the measurement does not settle*, and it is deliberately left
open: seventeen of the forty-two face columns finish at exactly `RETAIN_MAX`
with no bench, sanctioned by §5.2 rule 9. Whether a six-block wall should carry
a mid-bench is an aesthetic call that needs a walk, and it is Kai's. The report
line exists so that call has numbers under it.

**13.9 Does the resolver own the shoulder BFS?**
`blendShoulders`' multi-source dilation ("nearest, not first"; ties to the lower
road) is a genuine algorithm, and it is tempting to move it into the resolver
since it is a transition. **Recommendation:** do not. The pass computes the ring
levels and declares them at `verge` rank; the resolver arbitrates. Moving the BFS
in is precisely the scope creep the brief's first risk names, and the split keeps
the resolver's own code short enough to read in one sitting.
