# The site planner — frontage-led hill towns

> Normative for the replacement of the full-coverage bench field with a
> **use-anchored site planner**. Ratified by Kai 2026-08-07, after walking a
> generated hill town that reads as a quarry, and after an external design
> review (GPT-5.6-Sol) whose first four recommendations restate the product
> vision independently.
>
> **The governing principle, and everything in this document is a consequence
> of it:**
>
> > **The town must generate the terraces it needs. The terraces must not
> > generate whatever town happens to fit afterward.**
>
> This document is self-contained for an implementer who has read
> `docs/DESIGN.md`. It **amends** `docs/URBAN-FORMS-v0.md` §2.2 (additively) and
> **supersedes** its §3.6; it **amends** `docs/COURTYARDS-AND-LEVELS-v0.md` §3.4
> and leaves the rest of §3 and all of §4 standing (§7.3 enumerates exactly
> what survives). It does **not** amend `docs/GROUND-CONTRACT-v0.md`: the
> resolver's arbitration, `INTENT_RANK` and the transition derivation are
> unchanged, and §7.4 states where the planner's outputs meet them.
>
> Sol's P4 (blanket `faceCuts` revetment) and P5 (rails on the retaining
> profile) are being fixed separately and are **not** in scope here. P1, P2, P3
> and P6 are.

---

## 1. Why — the measurement

The world is `out/walk-hilltown/`, generated 2026-08-06 by `terrainist generate`
from the prompt *"A steep hillside town in the mountains: houses stacked up the
slope on stone terraces, retaining walls holding every level, narrow stairs
climbing between contour streets, a small chapel at the top"*. GPT 5.6 Luna
wrote a correct document: `fabric: "terraced"`, `density: "medium"`,
`blockSize: 32`, `ground: "stepped"`, envelope 160 × 152 on a real mountain
slope. Every subsystem then did what it was told, and the result reads as
engineering works with a village lost inside them.

| measurement | value |
| --- | --- |
| district | `world.hill_town`, 160 × 152 = **24,320 columns** |
| benches the form cut | **7**, of 6 blocks each (levels Y 90 … 126) |
| quarter columns standing on a platform | **24,320 of 24,320 — 100%** |
| carriageway | 5,607 columns |
| sidewalk | 6,024 columns |
| street total | **11,631 columns — 47.8% of the quarter** |
| blocks | 95 |
| lots cut | 63, of which **61 were dropped** |
| buildings in the district | **7** (10 in the whole world) |
| building footprint | **852 columns — 3.5% of the quarter** |
| retaining walls | **36, over 1,566 columns** |
| banks | 3 |
| seam columns that got no wall | 687 — 8 building, 273 street, 11 shortRun, **395 `offPlatform`** |
| revetted cut-face columns | **2,971** |
| platform area ÷ building area | **28.5** |
| retaining columns ÷ district building | **224** |
| natural, uncut ground inside the quarter | **0 columns** |

Three of those numbers are the whole diagnosis.

**100% platform coverage.** `terraced` cuts its bench field over the *entire*
quarter, streets included, because the bench index is a function of height and
every column has a height. Every column is therefore either cut or filled, every
bench boundary is a seam, and the quantity of retaining work scales with the
**relief of the hill** rather than with the size of the town. A taller hill
builds more wall for the same seven houses.

**3.5% building footprint against 47.8% street.** The town is not merely
outnumbered by its infrastructure; it is outnumbered by a factor of fourteen by
the *streets alone*, before a single wall is counted. `contourStrideFor` already
fixed the worst of this — it took street coverage from a measured 80% down to
48% — and the remaining 48% says the fix was aimed at the symptom. Streets are
spaced at `blockSize` along the contours *of the whole hill*, so a quarter that
holds seven buildings is given the street network of a quarter that would hold
seventy.

**395 `offPlatform` columns.** `walkBack` returns `offPlatform` when it steps
back from a seam looking for a column of the upper platform to stand a wall on
and finds it is not on that platform at all — the bench is narrower than the road
running along it. That is not a dressing problem. It is a **terrace that was
planned without asking whether it could hold its own street**, discovered four
passes downstream by the pass that has to build the wall. Today it is counted and
survived; under this document it is a planning failure that the planner is
required to make unrepresentable.

Two further facts belong here because they shape §5. First, `largestFreeRect`
discards roughly 45% of block ground — 66 blocks holding 13,868 columns yielded
7,573 columns of rectangle on this quarter's predecessor — and lots are cut from
rectangles, which is most of why 61 of 63 lots were dropped. Second, the district
was seated flush against the region boundary (`x1 = 255`, the region's east
edge), a known open defect that sliced its blocks; the prototype in §8 must not
repeat it or its numbers are unreadable.

---

## 2. The principle, and what it inverts

`docs/DESIGN.md` states the settlement fabric as **"the void defines the
solid"**: arterials first, district cells as the residue of the road network,
blocks as the residue of the streets, lots as the subdivision of the blocks.
That is right on flat ground and it is right *in plan* on any ground. What this
document inverts is the **vertical** half of it on a slope:

> On sloped ground, **level ground is not the residue of anything. It is the
> scarcest resource in the quarter and it must be allocated to a use before it
> is cut.**

So the order of operations changes, and only for sloped ground:

| | today | under this document |
| --- | --- | --- |
| 1 | cut the whole hill into benches | choose 2–4 principal contour streets **for the town** |
| 2 | run streets along the bench boundaries | grow buildable frontage strips beside them, sized from lot depth |
| 3 | recover rectangles from what is left | cut platforms **only** for those strips, civic space and connectors |
| 4 | cut lots from the rectangles | cut lots by walking the frontage, growing inward through the platform mask |
| 5 | dress every seam the cutting produced | derive transitions **after** footprints exist, by context and against a budget |
| 6 | ship | measure the composition; a district that fails **replans smaller** |

Everything else in the compiler stays where it is. In particular the planner
decides **nothing about placement above the district**: the solver still places
the district, `padFor` still declines to pad it, the ground contract still
arbitrates every column, the grammar still builds rectangles, and the physics
lint still refuses findings.

---

## 3. The planner — normative

### 3.1 Shape, inputs and determinism

The planner is an **urban form** in the sense of `docs/URBAN-FORMS-v0.md` §2.3 —
one `UrbanForm` plugin behind the existing registry — plus a feasibility loop
inside `layDistrict`. Its id is `hillside` (§7.1).

It reads only what `FormContext` already carries: `bounds`, `mask`,
`ground.height(x, z)`, `blockSize`, `density`, `sidewalk`, `seed`, `focus` and
`corridor`. It MUST NOT read the document, other districts, the solver's report,
or the terrain field outside `bounds`.

**Determinism is not negotiable and it is cheap here.** The planner MUST contain
no random draw of any kind. Every choice in §3.3 – §3.7 is either a total order
over measured quantities or a fixed constant, and every tie MUST break on, in
order: the larger score, the lower elevation, the row-major index of the first
cell. `seed` is carried only so that the frontage lot walk (§4) can reach
`streamSeed(seed, …)` for the coverage draws that already exist; the planner
itself never calls `Rng`.

The planner runs **once per attempt**, and an attempt is a pure function of
`(FormContext, PlanAttempt)` where `PlanAttempt = { round, dropStreets,
narrowBy }` (§6.3). Round 0 is `{ 0, 0, 0 }`.

### 3.2 S1 — the field

Identical to `terraced`'s, and identical deliberately, so that a refusal message
from either form quotes a comparable number:

1. Sample `ground.height(x, z)` over `bounds` into a `Float64Array`.
2. Apply a separable integer box blur, radius 2, twice (`SMOOTH_RADIUS`,
   `SMOOTH_PASSES`). No transcendentals, no RNG.
3. `base` = the lowest masked column, rounded. `relief` = `hMax − base`.

If `relief < 2 · TERRACE_RISE` the form refuses with the measurement and the
announced fallback `grown`, exactly as `terraced` does today. This is the same
requirement expressed as `requires.minRelief`, checked by the registry before
`draw` is called; the in-`draw` check exists because the blur can lower the
relief the registry measured.

### 3.3 S2 — the principal contour streets

This is the heart of the change: **the number of streets is a property of the
town, not of the hill.**

**Candidate elevations.** Let `E` be the integer elevations in
`[base + TERRACE_RISE, base + relief − TERRACE_RISE]`, strided so that
`|E| ≤ MAX_CANDIDATE_LEVELS`. Striding rather than sampling keeps the set a
function of the relief alone.

**A candidate contour.** For elevation `e`, the band `B(e) = { k : |smooth[k] −
e| ≤ 1 }`, restricted to the mask. Take its 8-connected components (a contour on
a lattice is a staircase — this is the third-time-learned lesson recorded in
`docs/DESIGN.md`, and 4-connected grouping here would produce the same crumbs it
produced in `levelSeams`). For each component take its long paths with the
existing `branchesOf` / `doubleSweep` construction from `terraced` — not a
reimplementation; the function moves to a shared module and both forms import it.
Each path, `densify4`'d and cut to the mask by `runsOf`, is one **candidate
street**.

**The score.** A candidate is scored by the **developable frontage it commands**,
and by nothing else:

```
score(candidate) = Σ over stations s of the candidate polyline:
    1  if  strip depth on either side of s at elevation e ≥ MIN_STRIP_DEPTH
    0  otherwise
```

where *strip depth at a station* is computed exactly as §3.4 computes it — the
same probe, so a street is scored on the strips it will actually get. A station
is one polyline vertex.

The rationale is the whole document in one line: a contour that runs along a
cliff scores near zero however long it is, and a contour that runs along a
shoulder scores its full length. Length alone is what today's construction
selects for, and length alone is how a quarter ends up with twelve streets and
seven houses.

**Selection.** Greedy, highest score first, ties as §3.1:

1. Reject a candidate whose `score < MIN_STREET_SCORE`.
2. Reject a candidate whose elevation is within `TERRACE_RISE` of an
   already-chosen street's elevation. Two streets on one terrace are one street
   drawn twice.
3. Reject a candidate more than half of whose stations lie within
   `blockSize / 2` in plan distance of an already-chosen street. This is the
   spacing rule every other form already uses, applied to contours.
4. Stop at `MAX_PRINCIPAL_STREETS`.

If fewer than `MIN_PRINCIPAL_STREETS` survive, the form refuses:

> `world.hill_town` asks for the `hillside` form, which lays two to four
> principal streets along the contours of the ground and builds only beside
> them; on this ground the best contour commands 14 columns of buildable
> frontage and a street needs 64. Move the quarter onto a broader, gentler
> slope with a `zone` or `at` constraint, give it a larger footprint so it spans
> more of the hillside, or write `"fabric": "grown"` for an unplanned quarter
> that climbs the hill without terracing it.

with fallback `grown`. The number in the message MUST be the number that
refused.

### 3.4 S3 — frontage strips

For each chosen street, in selection order, and for each of its two sides:

Walk the polyline station by station. At each station, march **perpendicular to
the true line** (the `SweptProfile` band-membership rule: perpendicular distance
to the line, never to the raster) outward from the carriageway edge, claiming
columns while all of:

- the column is inside the mask and **unclaimed by any earlier strip**;
- `|smooth[k] − e| ≤ TERRACE_RISE` — the terrace will cut or fill this column,
  but no more than the tallest step it is willing to build;
- the depth claimed so far `< D_target`.

`D_target = clamp(sidewalk + LOT_DEPTH[density] + REAR_MARGIN − narrowBy,
STRIP_DEPTH_MIN, STRIP_DEPTH_MAX)`.

At `medium` density with `sidewalk = 1` that is `1 + 16 + 1 = 18` columns,
inside Sol's 16–28 band and inside the depth `MAX_INFILL_DEPTH = 16` the grammar
will actually use.

**Two rules make the strip a terrace rather than a stamp.**

1. **A station whose claim is shallower than `MIN_STRIP_DEPTH` claims nothing.**
   The terrace pinches out there and the hillside stays hillside. Cutting a
   three-column ledge because a contour passed through is exactly what produces
   an `offPlatform` wall eight passes later.
2. **A station MUST claim at least `carriageway + sidewalk + 1` columns on at
   least one side, or the street itself is not laid across that station.** The
   `+1` is the standing room a retaining wall needs on the platform it holds
   (`RETAIN_STREET_CLEARANCE = 0` puts the wall on the platform's own outermost
   free column). This rule is what makes `offPlatform` unrepresentable: the
   condition `walkBack` discovers downstream is checked here, where it can still
   be acted on.

The strip's boundary is therefore **irregular on both edges** — deep where the
ground is flat, absent where it steepens — and that irregularity is the feature.
A rectangle would be a bench.

### 3.5 S4 — platforms

Each surviving strip becomes exactly **one platform**, at level `e`, expressed
as an ordinary `FormBench` (`{ runs, level }`). No new wire format: `FormBench`
is what `groundLevelsOf` consumes, what `foundationY` reads, and what
`layDistrict` turns into `PadEdit`s with `apron: 0`, all unchanged.

**One level per strip, in v0.** The principal streets are level by construction
(elevation `e` is fixed along the whole polyline), so a strip is level along its
whole length. Grading a principal street, and stepping its strip into bays as it
climbs, is v1 (§9). This is the single largest scope decision in the document and
it is taken deliberately: a stepped bay row requires per-bay base elevations in
`emitTerrace`, in `BuiltBuilding.meta.floorLevels` and in the per-storey interior
cell sets the physics lint reads — which is exactly what
`docs/COURTYARDS-AND-LEVELS-v0.md` §3.6 already deferred, by name, for the same
reason. Two independent deferrals agreeing is the strongest evidence available
that the boundary is in the right place.

**Everything not claimed by a strip, a civic reservation or a connector landing
keeps `NO_PLATFORM`.** No code change is needed for this to be legal:
`GroundLevels.index` is documented as "−1 = natural ground", `levelSeams`
already states that natural ground "is not a platform and takes part in no
seam", and `foundationY` already falls through to `medianGround`. The
representation was built to permit exactly this and has never been asked to.

### 3.6 S5 — connectors, civic ground, and the rest of the hill

**Connectors.** Between adjacent principal streets, stair-alleys every
`blockSize` columns of arc, by the existing steepest-descent `flightFrom` walk,
emitted as `kind: "lane"`, `role: "steps"` segments; `linkComponents` then
guarantees a connected skeleton exactly as it does today. Two rules:

- **A connector never gets a platform.** Its ground is the street family's, and
  the street family grades and steps it through the `SweptProfile` tread law.
  Paving a platform under every stair is how a hillside becomes a staircase of
  pads.
- A connector that stalls without reaching another principal street is kept only
  if it left the terrace it started on, unchanged from `terraced`'s
  `keepStalled` rule.

**Civic ground.** `params.plaza` and any `FormReservation` receive a platform of
their own, at the level of the principal street they touch, sized to the
reservation and clipped by the same claim rule as a strip (§3.4). A civic
platform that cannot hold its reservation at `MIN_STRIP_DEPTH` is refused and the
reservation falls back to natural ground.

**Everything else stays natural slope.** The planner MUST NOT claim, level,
pave, revet or otherwise touch a column that no strip, civic platform or
connector asked for. This is the sentence the whole document exists to make
true, and §6's `natural-ground fraction` is how it is measured rather than
hoped.

### 3.7 S6 — feasibility: narrow, merge, dissolve

After all strips are claimed and before the plan is returned, each strip is
tested, in strip order:

**Narrow.** Compute, per station, the depth left after the strip's two
transitions reserve their run (§5.3). If that residual is below
`MIN_INFILL_SIDE`, the station's claim is retreated by one column at a time
until it is not, or until the station's claim is empty.

**Merge.** If two strips at adjacent elevations claim columns whose separation is
less than `MIN_STRIP_SEPARATION`, the pair is merged into one platform at the
**higher** level when the resulting cut face is `≤ TERRACE_RISE`, and otherwise
the **lower** strip is dissolved. Merging upward rather than downward is
deliberate: a merged terrace holds its own uphill cut, whereas merging downward
would bury the lower strip's frontage under fill.

**Dissolve.** A strip whose surviving usable frontage is shorter than
`MIN_STRIP_RUN` gives its columns back to natural ground, and its street is
demoted: to a `lane` if another strip still fronts it, and dropped entirely
otherwise. One `SITE_STRIP_DISSOLVED` note names the strip, the measurement and
what it cost.

> Sol's rule, stated normatively: **if a terrace cannot support both its use and
> its transition, it is merged or dissolved.** It is never shipped for a
> downstream pass to dress.

### 3.8 Constants — normative

| constant | value | derivation |
| --- | --- | --- |
| `TERRACE_RISE` | `RETAIN_MAX` (6) | The tallest step the terrace will cut or fill, tied to the tallest drop a retaining wall is built for, by the same argument `BENCH_HEIGHT_MAX` already makes. A terrace whose face is taller than any wall we build is a cliff with houses on it. A test MUST assert they cannot drift apart. |
| `MIN_PRINCIPAL_STREETS` | 2 | Sol's floor. One contour street is `linear` on a slope. |
| `MAX_PRINCIPAL_STREETS` | 4 | Sol's ceiling, and it is what bounds the whole composition: four streets × two sides × ~18 columns is at most ~150 columns of platform depth, against 24,320 columns of quarter. |
| `STRIP_DEPTH_MIN` / `STRIP_DEPTH_MAX` | 16 / 28 | Sol's target lot/building depth band. |
| `MIN_STRIP_DEPTH` | 8 | `MIN_INFILL_SIDE` (7) plus one column for the rear boundary — the same number `terraced`'s `MIN_BENCH_LOTS` already is, restated for the same reason (a form sits upstream of `district.ts`). |
| `REAR_MARGIN` | 1 | The column the rear transition stands on. |
| `MIN_STRIP_RUN` | `2 · LOT_FRONTAGE[density]` | Two lots. One lot is a building, not a terrace — the same argument `TERRACE_MIN_LOTS = 2` makes one scale down. |
| `MIN_STRIP_SEPARATION` | 4 | Below this the two faces interfere and neither has room for a treatment. |
| `MIN_STREET_SCORE` | `2 · blockSize` | A street shorter than two blocks of buildable frontage is not a street. |
| `MAX_CANDIDATE_LEVELS` | 64 | A performance bound on the candidate sweep, not a design choice. |
| `BANK_RUN(drop)` | `2 · drop` | Two columns of run per block of difference — the ratio `LevelPad.adaptiveApron` already uses and which was measured to read as a ramp rather than as a cut. |
| `MAX_REPLAN_ROUNDS` | 3 | §6.3. |

---

## 4. Lots from frontage

### 4.1 What is replaced, and what is not

For columns inside a planned strip, the chain `blocksOf` → `rectsOf` →
`largestFreeRect` → `subdivide` is replaced by a **frontage walk**. Outside
strips there are no blocks at all, because there is no platform and no ground a
lot may take. For every other form the chain is untouched.

The measured reason is in §1: `largestFreeRect` discards ~45% of block ground,
because a curved band's largest inscribed rectangle is a chord of it. `rectsOf`
already mitigates this for benched quarters by taking up to eight disjoint
rectangles, and it is a mitigation of the wrong thing — the block is only ragged
because it was recovered from a bench field nobody designed.

### 4.2 The walk — normative

1. **The frontage line** is the strip's street-side boundary polyline, which the
   planner already has: it is the carriageway edge offset by the sidewalk width,
   carried on the strip.
2. **Allocate by arc length.** `count = max(1, round(len / LOT_FRONTAGE[density]))`;
   sizes are `floor(len / count)` with the first `len − count · base` lots one
   column wider. This MUST be the *same* allocation `subdivide`'s `emit` uses —
   extracted into one exported function and called from both — so that the
   frontage rhythm of a hill town and a grid town are the same rhythm, and so
   there is one place to change it.
3. **Grow inward through the platform mask.** From each lot's frontage span,
   march perpendicular; a column joins the lot when it is on the **same
   platform**, unclaimed by another lot, and within `MAX_INFILL_DEPTH` of the
   frontage. The lot is a **column set**, and its rear boundary is irregular.
4. **Seat the building in the lot's own largest inscribed rectangle.** One
   `largestRect` call per lot, over a set of at most `STRIP_DEPTH_MAX ×
   (LOT_FRONTAGE + 1)` columns.

Step 4 is the honest scope line: **v0 keeps rectangular buildings.** The grammar
takes a rectangle and changing that is a phase of its own. What changes is
*what the rectangle is inscribed in*: a lot of ~18 × 16 that is locally near
rectangular, rather than a whole ragged contour band. The 45% loss is expected
to fall to a few columns per lot, and §10 requires it to be measured rather than
assumed.

### 4.3 A building's rear wall as the retaining

A lot whose rear boundary lies on a **cut face** (§5.4) of drop ≥ 2 is marked:

- the lot's seating rectangle is extended back to the face, with no gap, so the
  building's own foundation skirt is what stands against the hill;
- the lot's placement carries `params.retainingRear: true`;
- the planned edge for those columns is classified `built`.

That classification is the whole reach into the two consumers, and both already
speak it. `LevelSeam.treatment` has carried `"built"` since Phase 4.2 — *"a
building already standing on the seam, whose own foundation skirt is the wall"* —
and `buildRetainingWalls` already counts `building` and `builtSeam` among its
`UnfacedReason`s and builds nothing there. So a rear-wall retaining costs **no
new geometry**: it costs a flag and a classification, and it removes a
standalone wall from the count.

`params.undercroft` (`docs/COURTYARDS-AND-LEVELS-v0.md` §3.7) is the natural
next consumer of the same flag and is **not** built in v0, for the reason that
section already gives: an exterior below-grade door is not something the cellar
path does today.

### 4.4 Deferred to v1, by name

- **Stepped row groups with per-bay base elevations.** §3.5's rationale.
- **Undercrofts and blind lower storeys.** §4.3's rationale.
- **Polygon building footprints.** §4.2 step 4's rationale.
- **Graded principal streets.** §3.5.

Each is listed in §9 with the work it implies. Naming them here is not
ceremonial: `docs/DESIGN.md` records two failure modes this document is exposed
to — a request accepted and quietly not met, and machinery that exists and never
runs — and a deferral that is not written down becomes one or the other.

---

## 5. Transitions by context, not by drop alone

### 5.1 Where this logic lives

There is exactly one drop table in the compiler and it stays that way.
`layout/levels.ts` keeps `treatmentForDrop(drop)` and `treatmentForSeam(drop,
run)` **unchanged** — the ground resolver's `deriveTransitions`
(`docs/GROUND-CONTRACT-v0.md` §5.6) calls them and must keep getting today's
answer, because it derives transitions for boundaries no planner planned.

The planner adds, in the same file:

```ts
/** Everything a planned edge knows about itself. */
export interface EdgeContext {
  readonly drop: number;          // blocks
  readonly run: number;           // columns of the edge, 8-connected
  readonly availableRun: number;  // unclaimed columns beyond it
  readonly adjacentUse: "street" | "lot" | "civic" | "natural";
  readonly access: "public" | "private";
  readonly depthAfter: number;    // platform depth left once the treatment reserves its run
  readonly side: "cut" | "fill";  // §5.4
  readonly budget: number;        // columns of wall the district has left
}

export function treatmentForEdge(ctx: EdgeContext): SeamTreatment | "replan";
```

`treatmentForSeam` becomes the drop-and-run-only special case of
`treatmentForEdge`, expressed as such in code so the two cannot disagree.
`SeamTreatment` gains one member, `"rock"` (§5.4).

The planner calls `treatmentForEdge`; the retaining pass **reads the planner's
answer** rather than re-deriving one. That is the same instruction
`docs/GROUND-CONTRACT-v0.md` §5.6 already gives its consumers ("every consumer
reads that decision instead of re-deriving it") and it removes what would
otherwise be a fourth re-derivation of the same contour.

### 5.2 The decision order — normative

```
treatmentForEdge(ctx):
  1. if ctx.drop <= 1                                  -> "kerb"
  2. if the face is under a building footprint         -> "built"
  3. if ctx.availableRun >= BANK_RUN(ctx.drop)
     and ctx.adjacentUse is "natural" or "civic"       -> "bank"
  4. if ctx.run < MIN_RETAIN_RUN                       -> "bank"
  5. if ctx.drop > RETAIN_MAX                          -> "replan"
  6. if ctx.depthAfter < MIN_INFILL_SIDE               -> "replan"
  7. if ctx.budget <= 0                                -> "bank", note SITE_BUDGET_SPENT
  8. if ctx.side === "cut" and ctx.adjacentUse
        is not "street" or "lot"                       -> "rock"
  9. otherwise                                         -> "retaining"
```

Every clause is a claim about the world and each is worth one sentence.

**Rule 3 is the inversion Sol asks for: a bank is the default where there is
space.** Today a long seam becomes a wall because it is long; here it becomes a
wall because something is pressing on it. `adjacentUse` is measured as "a
carriageway, sidewalk, plaza or lot rectangle within `WALL_DEMAND_RANGE = 2`
columns of the edge", which is the operational meaning of *land pressure*.

**Rules 5 and 6 return `"replan"`, and that is the whole of Sol's P3.** A face
taller than any wall we build, or a terrace with no usable depth left once its
transition is paid for, is not a dressing problem to be handed downstream. It is
a terrace that claimed ground it should not have, and the planner is still
running: §3.7 narrows, merges or dissolves and the edge is re-evaluated.

**Rule 8 keeps the hillside a hillside.** An uphill cut that nothing is pressing
against is exposed rock, made of `ground.stone` — the terrain pass's own
deep-subsurface symbol, so a cut face and the natural cliff beside it are made of
the same thing. This is the rule the concurrent `faceCuts` rework already
ratified for unwalled cuts on 2026-08-07, applied one layer up where the decision
belongs.

**The rail is not in this table.** Whether an edge is railed is decided by
`ctx.access` in the furnishing pass, per Sol's P5, which is out of scope here.
The planner's contribution is to publish `access` so that pass has something to
read.

### 5.3 `depthAfter`, precisely

`depthAfter` is the strip's depth at a station **minus** the run the chosen
treatment reserves:

| treatment | run reserved |
| --- | --- |
| `kerb` | 0 |
| `built` | 0 — the building is the treatment |
| `retaining` | 1 (the wall stands on the platform's own outermost free column) |
| `rock` | 0 on the platform side |
| `bank` | `BANK_RUN(drop)` on whichever side the ramp is graded into |

A `bank` therefore costs `2 · drop` columns of *something*, and the planner
prefers to spend them on unclaimed hillside rather than on the strip — which is
what rule 3's `availableRun` test is asking about.

### 5.4 The cut side, which today nothing owns

A planned strip has two edges and they are not the same object.

- The **fill** edge is the downhill one: the platform stands above ground that is
  lower. This is what `levelSeams` finds when the lower side is another platform,
  what `skirtSeams` measures when the lower side is not, and what
  `buildRetainingWalls` builds today.
- The **cut** edge is the uphill one: the platform has been cut *into* the hill
  and natural ground stands above it.

**Today nothing owns the cut edge, and this document must say so loudly, because
the planner creates far more of them than `terraced` ever did.** `levelSeams`
ignores it (natural ground is not a platform and takes part in no seam);
`skirtSeams` ignores it (it only claims neighbours whose ground is *below* the
platform top); and `faceCuts` ignores it (its members must themselves be on a
platform, and the column presenting an uphill face is natural hillside). On the
walked hilltown this was invisible **because every column was on a platform** —
the uphill side of every bench was the bench above, and so the whole thing fell
inside `levelSeams`. Take that 100% coverage away and the cut edge becomes the
most common edge in the quarter with nobody to finish it, which would ship as a
vertical band of raw soil behind every terrace. That is the exact defect the
walk already complained about, arriving by a new route.

So, normatively:

> **Every planned strip MUST declare its cut edge as a `PlannedEdge` with
> `side: "cut"`.** Its default treatment is `"rock"`; `"built"` where a lot's
> rear wall stands on it (§4.3); `"bank"` where run allows; `"retaining"` only
> where rule 9 is reached. No planned edge of either side may be left with no
> treatment, and a test MUST assert that the treatments partition the edge
> columns exactly.

### 5.5 `offPlatform` becomes an error

`walkBack`'s `offPlatform` reason MUST be unreachable on a `hillside` quarter,
because §3.4's second rule refuses to claim a station that cannot hold its street
and one column of standing room. If the retaining pass reports a non-zero
`offPlatform` on a quarter this planner drew, that is a compiler bug and it MUST
be raised as an error (`SITE_PLAN_FAILED`), naming the strip and the station —
not counted and survived, as it is today.

The reason to make it an error rather than a warning is the lesson
`docs/DESIGN.md` records about the physics lint: it proves a world is
well-formed, not that it is any good, and 395 columns of a planning failure
shipped green. The planner's guarantee is checkable, so it is checked.

---

## 6. Composition budgets as gates

### 6.1 The metrics

Measured per district, after lots and building footprints exist and **before any
structure is emitted**. Every one of them is a ratio the report already has the
parts for.

| metric | definition | hilltown | v0 target |
| --- | --- | --- | --- |
| `naturalFraction` | columns with `NO_PLATFORM` and not street ÷ quarter columns | **0.00** | ≥ 0.40 |
| `platformPerBuilding` | platform columns ÷ building footprint columns | **28.5** | ≤ 6.0 |
| `wallPerBuilding` | wall columns ÷ buildings | **224** | ≤ 40 |
| `streetFraction` | carriageway + sidewalk ÷ quarter columns | **0.478** | ≤ 0.25 |
| `hardenedPerimeter` | (wall + revetted) ÷ total platform perimeter | — | ≤ 0.50 |
| `railedShare` | railed columns ÷ exposed retaining columns | ≈ 1.0 | 0.10 – 0.25 |
| `offPlatform` | the retaining pass's count | **395** | **0** |
| `wallPerFrontage` | wall columns ÷ Σ lot frontage | — | ≤ 0.60 |

`railedShare`'s target band is Sol's ("perhaps 10–25% of exposed retaining
edges"). `hardenedPerimeter`'s and `wallPerFrontage`'s targets are the blunt
version of "wall length should track actual developed frontage rather than total
contour length".

### 6.2 Which are gates

**Hard, and a failure replans:** `naturalFraction`, `platformPerBuilding`,
`wallPerBuilding`, `offPlatform`.

**Report metrics, no gate in v0:** `streetFraction`, `hardenedPerimeter`,
`railedShare`, `wallPerFrontage`. Each depends on passes outside the planner's
control (the streetscape's dilation, the furnishing pass's rails, the concurrent
`faceCuts` rework), and gating on a number another subsystem owns is how a
planner acquires responsibilities it cannot discharge.

**All eight land as report metrics in Phase 1 and the four hard ones acquire
their thresholds in Phase 2, from the accepted prototype's measurements.** This
sequencing is normative and it is the mitigation for the risk that a
mis-calibrated gate turns every hill town into a `grown` fallback. A threshold
guessed from a document is a threshold that fails a real world; a threshold
measured on a world Kai has accepted is a floor under a known-good composition.

### 6.3 The replan rule — normative

> **A district that fails a hard gate replans smaller. It never ships the
> failing composition, and it never grows to fix one.**

The ladder, in fixed order, bounded by `MAX_REPLAN_ROUNDS = 3`:

1. **Round 1** — `dropStreets = 1`: the lowest-scoring principal street and its
   strips are removed. Fewer streets is fewer platforms, fewer edges and less
   wall, and the street that was dropped was by construction the one commanding
   the least frontage.
2. **Round 2** — `narrowBy = 2`: every strip's `D_target` falls by two columns.
   A shallower terrace cuts less and fills less.
3. **Round 3** — both.
4. **Exhausted** — the quarter falls back to `grown` on natural ground, with a
   `SITE_COMPOSITION` warning naming the metric, its value and its threshold in
   the author's terms:

   > `world.hill_town` was planned three times and each plan came out as more
   > engineering than town: the last held 24,320 columns of cut platform for 852
   > columns of building (28.5×, and 6× is the limit). It has been drawn as an
   > unplanned `grown` quarter that climbs the hill instead. Move it onto a
   > gentler slope with a `zone` constraint, or give it a smaller footprint so
   > it sits across fewer contours.

Each round is a full re-entry into §3 with a different `PlanAttempt`, so the
result stays a pure function of `(FormContext, round)` and the whole loop is
deterministic. Rounds are counted in the report whether or not they were needed.

---

## 7. Scope, registry and what survives

### 7.1 A new form id, and a named cutover

**The planner lands as a new form, `hillside`. `terraced` is frozen and marked
superseded; it keeps drawing exactly what it draws today.**

Three reasons, and the third is the one that decides it:

1. `DISTRICT_FABRICS` is a closed vocabulary checked against the compiler's
   registry in both directions by a test, and `terraced` is named by five
   committed example documents (`showcase-bayline`, `showcase-heathershire`,
   `world-bayline`, `world-oldharrow`, `world-meridian`). Replacing it in place
   moves all five at the first commit.
2. The prototype (§8) is required to be feature-flagged and judged at one camera
   against the current output. A second registry entry *is* that flag, at zero
   cost and with no branch inside either form.
3. The repo's byte-identity method is "flat controls must not move; hill worlds
   move and are justified move by move". The only evidence we have that the old
   hill path works at all is the old hill path. Keeping it drawable is what
   makes the comparison possible.

**The cutover is part of this document, not a hope.** `docs/DESIGN.md` records
*machinery that exists and never runs* as a named failure mode, and two hill
forms in one registry is a candidate. So:

> When Kai accepts the prototype (§8), **in the same change**: the classifier and
> `docs/kits/settlement-author.md` learn `hillside` and stop offering `terraced`;
> `terraced` becomes an alias resolving to `hillside` on intake, so every
> committed document and every model that writes the old id still gets a hill
> town; the five examples are regenerated once, as an authorised golden movement;
> and `layout/forms/terraced.ts` is deleted. A test MUST assert that every id in
> `DISTRICT_FABRICS` is reachable from at least one classifier phrase, so a form
> nothing can select cannot exist.

Until the cutover, `hillside` is registered but absent from the kit and the
classifier, so no generated document can reach it by accident.

### 7.2 Flat ground, and byte-identity

`hillside` declares `requires.minRelief = 2 · TERRACE_RISE`, `unlevelled: true`,
`polygon: true`, `fallback: "grown"` — the same requirement shape `terraced`
carries. A flat or near-flat quarter therefore **cannot select it**: the registry
refuses before `draw` is called and the announced fallback is drawn.

That gives byte-identity for flat worlds *structurally* rather than as a test
result: the planner is a new module reached only through a new id, and the two
shared files it touches are touched additively (`layout/levels.ts` gains
`treatmentForEdge` and one `SeamTreatment` member; `layout/district.ts` gains a
frontage-lot branch gated on the plan carrying strips). Nothing on the flat path
changes. §10 still requires the whole-repo byte-identity diff, because "it should
be structurally impossible" is what was said about the last two things that
moved.

**Graceful degradation toward today's fabric** is therefore the fallback ladder
that already exists — `hillside → grown` — plus §6.3's composition ladder, which
narrows the plan before it abandons it. There is deliberately no half-planned
mode between them: a hill town that cannot be planned is better as an honest
unplanned quarter than as a planned one with the plan half applied.

### 7.3 What survives, section by section

**`docs/URBAN-FORMS-v0.md`:**

| section | status |
| --- | --- |
| §2.1 – §2.6 (the contract, the plugin, the registry, dispatch, non-rectangular cells) | **unchanged.** `hillside` is an ordinary plugin. |
| §2.2 `FormPlan` | **amended, additively.** Two optional fields: `strips?: readonly FormStrip[]` (the frontage geometry §4 walks) and `edges?: readonly PlannedEdge[]` (§5's planned transitions). Absent for every other form, so nothing else sees a change. |
| §3.1 – §3.5, §3.7 (`grid`, `organic`, `grown`, `radial`, `canal`, `linear`) | **unchanged, and this is a hard requirement** — see §11.4. |
| §3.6 `terraced` | **superseded** by §3 of this document. Retained verbatim until the §7.1 cutover, then deleted with the form. |
| §4.1 (the seam in the street surfacer), §4.2 (`terraced` → the stair profile) | **survive and apply to `hillside`.** Its connectors are the same `role: "steps"` segments. |
| §5 (byte-identity) | **extended** by §7.2. |
| §6 (the authoring surface) | **amended at the cutover**, not before. |

**`docs/COURTYARDS-AND-LEVELS-v0.md`:**

| section | status |
| --- | --- |
| §2 (column ownership) | **unchanged.** Superseded in practice by the ground contract, not by this. |
| §3.1 (`GroundLevels`, `LevelSeam`) | **unchanged, and it is what makes this cheap.** The representation already permits columns with no platform; the planner is the first thing to use that. |
| §3.2 (ground policy) | **unchanged.** `hillside` implies `"benched"` and the `layout.groundPolicy` fan-out row upgrades it to `"stepped"`, exactly as it does for `terraced` today. |
| §3.3 (platforms from blocks) | **survives, for every form that is not `hillside`.** `derivePlatforms` is what a `grid` or `grown` quarter under `params.ground: "stepped"` uses, and the planner does not call it. |
| §3.4 (seams: kerbs, walls, banks) | **amended** by §5: the drop-and-run table stays and gains a context-aware caller, plus the `"rock"` treatment and the cut side. |
| §3.5 (steps; a platform you cannot reach is not a platform) | **survives verbatim, and matters more.** With most of the hill left natural, reachability is a real risk rather than an accident. Its step 3 — dissolve what is still orphaned — is the same operation §3.7 performs for a different reason, and the two MUST share one implementation. |
| §3.6 (`foundationY`, the pad apron) | **survives.** `foundationY` reads the platform under the lot; a building touching a seam still gets `apron: 0`. |
| §3.7 (undercrofts) | **survives as a hook**, and §4.3 supplies the flag it was waiting for. Still not built in v0. |
| §4 (courtyard blocks) | **unchanged.** A courtyard needs a block deep enough for two opposite rows; a strip at `D_target ≈ 18` is not, so `planCourtyard` refuses with `perimeter` — which is what already happens and needs no new code. Courtyards on `hillside` are a v1 question. |
| §5, §6 (authoring surface, byte-identity) | **unchanged.** |

### 7.4 Where the planner's outputs meet the ground contract

This matters and is easy to get wrong. **The planner's platforms are not
`GroundIntent`s.**

`docs/GROUND-CONTRACT-v0.md` §1.2 and `docs/DESIGN.md` both describe the terrain
half as already correct: the field is composed, `padFor`/`applyLevelPad` compose
pad edits **into the master height field**, and only then is the field
materialised into a `ColumnPlan`. A district's benches take that path today —
`layDistrict` emits one `PadEdit` per bench run with `apron: 0` — and the
planner's platforms take exactly the same path, unchanged. That is why
`pad.record` sits at rank 150, tier E, *advisory*: by the time the resolver runs,
the field already carries the answer.

What the planner adds is downstream, and it is all data:

- **`PlannedEdge` list on the district product.** `buildRetainingWalls` consumes
  it instead of calling `levelSeams` + `skirtSeams` + `treatmentForSeam` for
  itself. It then declares exactly what it declares today
  (`docs/GROUND-CONTRACT-v0.md` §3.3(b)): `face` + `preserve` per wall run at
  class `retaining.seam`, and `verge` profiles per bank. **No new source class,
  no new rank, no change to `INTENT_RANK`.**
- **`retaining.skirt` becomes empty on a `hillside` quarter, by construction.**
  A skirt is a seam *measured from the finished ground* — precisely the
  derive-after-the-fact behaviour this document replaces. Since every strip edge
  is planned and declared, `skirtSeams` MUST be suppressed inside a planned
  strip. Outside strips there is no platform, so it finds nothing anyway.
- **`faceCuts` is unchanged**, and its output falls out with the platform area
  because its members must be on a platform. The report MUST count separately
  the columns `faceCuts` finished that no `PlannedEdge` covers
  (`revettedUnplanned`); on a correctly planned quarter that number is near zero,
  and a large one means the planner missed an edge.

The resolver's own `deriveTransitions` (§5.6 of the contract) keeps running and
keeps deciding transitions for boundaries nobody planned — a doorstep against a
lane, a prop pad against a verge. It is not replaced and it is not consulted
about a planned edge, because a planned edge is a `face` and a face suppresses
transition generation across it, which is already the rule.

---

## 8. Phase 1 — the prototype, and how it is judged

This is Sol's "what I would build first", made into the first work package. It is
one throwaway-able prototype and it exists to test one hypothesis.

### 8.1 What it does

A feature-flagged `hillside` form that, for **one fixed seed**:

1. selects 2–3 principal contour streets (§3.3);
2. produces a limited number of 16–24-column-deep buildable strips (§3.4);
3. lots those strips directly from their street frontage (§4);
4. derives retaining edges **only after** the lots and building footprints exist
   (§5);
5. leaves the rest of the hillside untouched (§3.6);
6. dissolves any strip that would produce an `offPlatform` (§3.7, §5.5);
7. emits no automatic retaining rails and no blanket revetment on unplanned
   ground.

The prototype MAY hard-code what §3 parameterises, MUST NOT contain randomness,
and MUST NOT touch any file another form reads.

### 8.2 The comparison

One seed, one prompt, one camera. The control is
`out/walk-hilltown/` — worldSeed `12237387105847640099`, the prompt in §1,
installed on the same channel and viewed from the same position recorded in the
2026-08-07 walk's review record.

The prototype world is compiled from a **hand-authored fixture** document
identical to `out/walk-hilltown/hilltown.loam.json` except for
`params.fabric: "hillside"`. A hand-authored document is legitimate here because
this is a fixture, not a demo (`docs/DESIGN.md`, locked decisions). **Acceptance
itself is measured on a Luna e2e regeneration of the same prompt once the
classifier has learned the id**, because the locked decision is that demos and
acceptance worlds are e2e.

**The district MUST NOT be seated flush against the region boundary.** The
control was (`x1 = 255`, the region's east edge) and its blocks were sliced by
it. Either give the fixture an `at`/`zone` constraint that keeps a `blockSize` of
clearance, or fix the solver's boundary margin first; otherwise the comparison
measures the wrong thing.

### 8.3 Acceptance checks — blunt, and mostly countable

| # | check | control | bar |
| --- | --- | --- | --- |
| 1 | **Buildings, not walls, occupy the visual focus.** | fails | Kai's call, one screenshot, no metric and no proxy |
| 2 | building count in the district | 7 | **≥ 30** |
| 3 | `offPlatform` | 395 | **0** |
| 4 | wall columns | 1,566 | **< 600**, and ≤ 0.60 × developed frontage |
| 5 | natural-ground fraction inside the quarter | 0.00 | **≥ 0.40** |
| 6 | street fraction | 0.478 | **≤ 0.25** |
| 7 | railed share of exposed retaining edge | ≈ 1.0 | **≤ 0.25** |
| 8 | a walker can trace the principal streets end to end without rails on every edge | fails | Kai's call |
| 9 | physics lint | 0 findings | **0 findings, all 26 rules** |

Check 1 is the one that decides, and it is deliberately not a metric. The others
exist so that a failure of check 1 has somewhere to point.

Check 9 is not negotiable and is not traded against any of the others. A prettier
world with a floating block is a regression.

---

## 9. Work packages, after the prototype validates

Six, in dependency order. WP-1 lands alone; WP-2 and WP-3 are parallel; WP-4
depends on both.

- **WP-0 — the prototype.** §8. Throwaway-able. Its only deliverable that
  survives is the answer to check 1.
- **WP-1 — the planner proper.** §3 in full: candidate scoring, selection,
  strips, platforms, connectors, feasibility, the constants table. Registered as
  `hillside`, absent from the kit. Shared extraction of `branchesOf` /
  `doubleSweep` out of `terraced.ts` into a module both forms import.
- **WP-2 — frontage lots.** §4: the arc-length allocation extracted and shared
  with `subdivide`, the inward growth through the platform mask, per-lot
  rectangle seating, and the `retainingRear` flag. Gated on `plan.strips`, so no
  other form moves.
- **WP-3 — transitions by context.** §5: `EdgeContext`, `treatmentForEdge`, the
  `"rock"` treatment, the cut-side declaration, `skirtSeams` suppression inside a
  strip, and `buildRetainingWalls` reading planned edges. `offPlatform` becomes
  an error.
- **WP-4 — composition metrics and the replan loop.** §6, metrics first. The
  loop is a re-entry into WP-1 with a different `PlanAttempt`.
- **WP-5 — gates and the cutover.** §6.2's thresholds, calibrated from the
  accepted prototype. Then §7.1's cutover in one change: classifier, kit, alias,
  example regeneration, deletion of `terraced.ts`.

**v1, contracted but not scheduled:** graded principal streets and per-bay
stepped rows (§3.5, §4.4); undercrofts (§4.3); polygon building footprints
(§4.2); courtyards on a hillside strip (§7.3).

---

## 10. Test surface

The bar `docs/DESIGN.md` sets is a compiled world read back off disk and linted
on all 26 rules, because Phase 4.1 shipped three defects that passed every unit
test and Phase 4.2 shipped six.

**Unit — the shape each piece must have.**

- Candidate selection is a pure function: the same field yields the same streets,
  and shuffling the candidate discovery order changes nothing.
- A strip never claims a station that cannot hold `carriageway + sidewalk + 1`.
  This is check 3's proof and it is the single most important unit test in the
  package.
- The treatments of a planned strip's edges **partition** its edge columns —
  every column exactly once, neither dropped nor double-treated.
- `treatmentForEdge` reduces to `treatmentForSeam` when the context carries no
  land pressure, no available run and an unlimited budget. One table, proven to
  be one table.
- `TERRACE_RISE === RETAIN_MAX`, asserted, for the reason
  `terraced-bench-height.test.ts` already asserts its equivalent.
- The replan ladder is deterministic and bounded: three rounds, fixed order,
  same output for the same input.

**Generated worlds — what unit tests cannot see.**

- The §8.3 acceptance table, as assertions, on the fixed-seed fixture.
- The 45%-recovery claim of §4.2 measured, not assumed: lot column count against
  seated rectangle column count, reported per quarter.
- Zero findings on all 26 rules, and specifically `traversal.unreachable` = 0 —
  §7.3's reachability rule is doing more work here than it ever has.
- A world in which the composition gates *fire*, asserting the ladder narrows and
  then falls back with a diagnostic naming the measurement. A gate nobody has
  seen fire is a gate nobody has tested.

**Identity.**

- Whole-repo byte-identity diff (git worktree at `HEAD`, compile both, diff
  per-file shasums) over every committed example. Nothing may move before the
  §7.1 cutover; at the cutover, exactly the five `terraced` documents move and
  each movement is attributable.
- Every id in `DISTRICT_FABRICS` is reachable from at least one classifier
  phrase (§7.1).

**One prohibition, and it is the important one.** No test in this package may be
written by reading the implementation. Every number in §8.3 and every property
above is written into its test file **from this document, before the code
exists**. `docs/DESIGN.md` records a test that pinned a defect in place for
weeks — *"skips a seam column a street already claims"*, written with the street
running along the seam and asserting zero retaining walls, which passed and was
asserting the bug. That test was written from the implementation. This is the
counter-measure and it is cheap only if it is done first.

---

## 11. Risks

**11.1 Machinery that exists and never runs.** A `hillside` form registered but
unreachable — the classifier never learns the id, the kit never mentions it, and
every generated hill town keeps taking the `terraced` path while the new code
accumulates tests nobody's world executes. *Counter:* §7.1's cutover is written
into this document with a named trigger (Kai's acceptance) and a specific
deletion (`layout/forms/terraced.ts`), and the reachability test makes an
unreachable form a red build. Grep for the *definition* as well as the uses, as
`docs/DESIGN.md` instructs.

**11.2 Tests that pin defects.** The four existing `terraced` tests
(`forms-terraced.test.ts`, `terraced-stride.test.ts`,
`terraced-bench-height.test.ts`, `levels-identity.test.ts`) assert properties of
the construction being replaced — bench widths, stride arithmetic, the
byte-identity of a benched quarter. They are correct about `terraced` and they
must not be copied, adapted or "ported" to `hillside`. *Counter:* §10's
prohibition, plus a rule that at the cutover those four files are **deleted with
the form**, not migrated.

**11.3 The planner becomes a second layout solver.** The scope boundary is
explicit: **the planner decides where platforms, lots and edges go inside one
already-placed district footprint.** It never chooses a district's position,
never moves a node, never reads a constraint, never sees another district, never
consults the solver's report, and never looks outside `bounds`. Its only
interfaces to `layout/solve.ts` are the two that exist today: `padFor` returns
`null` for a `benched`/`stepped` node, and the fabric pass emits `PadEdit`s.
§6.3's replan loop is the one place this could creep — it is a loop over *plans*,
never over *placements*, and if it is ever tempted to move the district it is
returning a refusal instead. A test MUST assert the planner module imports
nothing from `layout/solve.ts`.

**11.4 Prompt-variety regression.** The six other urban forms are the largest
variety win the repo has shipped and this is a hill/slope path only. Every shared
edit is additive (§7.2), every new branch is gated on `plan.strips`, and the
whole-repo byte-identity diff (§10) is the instrument. A change that moves a
`grid`, `organic`, `grown`, `radial`, `canal` or `linear` world before the
cutover is a defect in this package, not a discovery about those forms.

**11.5 Over-tight gates turn every hill town into `grown`.** A composition
threshold guessed from a document rather than measured on an accepted world will
reject compositions that are fine. *Counter:* §6.2's sequencing — metrics in
Phase 1, thresholds in Phase 2 from the accepted prototype — plus a ladder that
narrows twice before it abandons, plus a required test in which the gates fire
and the ladder recovers.

**11.6 The planner ships a beautiful hillside with no town on it.** The mirror of
today's failure: strips so conservative that the quarter holds five houses and a
lot of scenery. This is what acceptance check 2 (**≥ 30 buildings**) is for, and
it is why `naturalFraction` has a floor rather than a target: 40% is "most of the
hillside is hillside", not "almost none of it is town".

**11.7 Performance.** Candidate extraction is `O(|E| · area)` with `|E| ≤ 64`; on
this quarter that is ~1.5M column tests, which is nothing beside the physics
lint. The bound is `MAX_CANDIDATE_LEVELS` and it exists so that a 200-block
relief cannot turn it into a minute.

**11.8 The cut side is a genuinely new surface.** §5.4 argues that nothing owns
it today and that the walked world hid this behind 100% platform coverage. If
that argument is wrong in some case — an uphill edge that some existing pass does
finish — the result is a doubly-finished face rather than a raw one, which is
cosmetic. If it is right and unimplemented, the result is a raw soil band behind
every terrace, which is the original complaint. It is asserted by the partition
test in §10 rather than trusted.

---

## 12. Open questions

**12.1 Should a principal street be allowed to grade?** A real hill town's main
street climbs gently; a strictly level contour street is a simplification. v0
says level (§3.5). *Recommendation:* keep it level through WP-5 and revisit with
per-bay stepped rows, because the two share the same dependency (per-bay base
elevations in `emitTerrace`) and shipping either alone buys half a feature.

**12.2 How does the planner behave inside a city cell?** `layDistrict` takes a
`CellFabric` with its own mask, orientation and `foundationY`, and a city cell is
deliberately not offered the relief election. *Recommendation:* `hillside` sets
`polygon: true` and works in a masked cell, but the composition gates are
measured per **cell**, not per city, and the `MAX_PRINCIPAL_STREETS` ceiling is
per cell. Untested until a city with real relief exists; flag it rather than
guess.

**12.3 What claims the ground between two strips?** Today: nothing, which is the
point. But a 40-column band of natural slope between two terraces is where a
hill town puts allotments, goat paths, rock outcrops and washing lines.
*Recommendation:* leave it to the existing ground-treatment, scatter and life
passes in v0 and measure how it reads on the walk. If it reads as neglected
rather than as hillside, the answer is a *landscape* pass, not more platform.

**12.4 Should `naturalFraction` count columns outside the district footprint?**
The district is a rectangle placed by the solver; a town on a hillside spills
its character into the ground around it. v0 measures inside `bounds` only.
*Recommendation:* keep it inside — it is the number the planner controls — and
report the surrounding ring separately if the walk suggests it matters.

**12.5 How many principal streets should a *large* quarter get?**
`MAX_PRINCIPAL_STREETS = 4` is Sol's number and it is stated absolutely, while
every other spacing constant in the compiler is relative to `blockSize` or to the
footprint. A 400 × 400 hillside quarter at four streets is a very thin town.
*Recommendation:* keep 4 for v0 because it is what the prototype will be judged
at, and make it `clamp(round(relief / (2 · TERRACE_RISE)), 2, 4)` only if a large
quarter is measured to look sparse — with the ceiling staying at 4 until a walk
says otherwise.

**12.6 Does `hillside` want its own density semantics?** `LOT_COVERAGE.medium =
0.62` means 38% of lots on a scarce, expensively cut terrace are deliberately
left empty. On flat ground that gap is a garden; on a terrace it is cut stone
holding up nothing. *Recommendation:* raise coverage on a planned strip toward
`high` (0.94) and let the *strip length* rather than the coverage draw decide how
many houses there are — but only after the prototype, because it interacts
directly with acceptance check 2 and changing both at once makes neither
measurable.
