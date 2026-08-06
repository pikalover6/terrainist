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
  survived four rounds of fixes.
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

**(c) Material, stays behind.** The cap and fill states, the emitted fill blocks,
the snow clear (now the `moved`-mask rule of §1.3).

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

### 3.12 Two sites outside the eleven

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
| 25 | `structure.linework` | A | profile, clearance | *reserved* — `infra.wall@0`, aqueducts | Currently writes no level, so the rank is unexercised. Reserved rather than omitted so the table stays total. See §13.2. |
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
baseline only.

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
   loop that computes a level and `yield`s a `GroundClaim`. Everything else in
   the loop body — `surface`, `subsurface`, `soil`, block pushes, mask writes —
   stays where it is and moves to a **second** loop that runs in the build phase.
   If the two loops cannot be separated because the material depends on the
   level, the material loop reads `resolved.ground` and the dependency is gone.
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
9. **Move the tier-dependent reads.** A pass in tier C or D that read
   `plan.ground` to decide a level now reads `resolvedSoFar.ground` (§1.4). A
   pass in tier A or B that did so now reads `baseline.ground`. Anything reading
   `plan.ground` to decide where to *put a block* becomes a build-phase read of
   the frozen array and does not change.
10. **Delete the snow clears.** Group M's `moved`-mask rule replaces them
    (§1.3).
11. **Run the equivalence test** with the pass converted and the others still
    shadow-declared. The shim is designed to work with any mixture: a converted
    pass declares for real, an unconverted one declares through its shadow, and
    the assertions are identical either way. That is what makes WP-3, WP-4 and
    WP-5 genuinely parallel.
12. **Regenerate nothing.** Flat controls must still shasum-match. If they do
    not, the conversion changed a level on flat ground, which is a bug in the
    conversion and not a licence to regenerate a golden.

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
5. **WP-6 deletes; it does not decide.** Every deletion in §10 is a defence that
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

**13.9 Does the resolver own the shoulder BFS?**
`blendShoulders`' multi-source dilation ("nearest, not first"; ties to the lower
road) is a genuine algorithm, and it is tempting to move it into the resolver
since it is a transition. **Recommendation:** do not. The pass computes the ring
levels and declares them at `verge` rank; the resolver arbitrates. Moving the BFS
in is precisely the scope creep the brief's first risk names, and the split keeps
the resolver's own code short enough to read in one sitting.
