# Ground unification — the road is the ground, and a program stands on it

> Normative for **WP-8** (the frontage tie), **WP-9** (bespoke builds on real
> terrain) and **WP-10** (the lift-keyed edge). Both headline directions were
> ratified by Kai on the 2026-08-17 deck walk, the second in his own words:
> *"What if we feed the bespoke generator the terrain that its structure will be
> sitting on and let it build naturally on top of that?"*
>
> `docs/GROUND-CONTRACT-v0.md` is the parent: this document adds no new
> arbitration, no new rank and no second resolver. It decides **what a claimant
> asks for**, which the contract deliberately never did (§1.5: "the resolver does
> not decide *where* anything goes"). Where the two disagree, the contract wins.
> `docs/DESIGN.md` is untouched by this document and remains the ratified brief.
> `docs/SITE-PLAN-v0.md` (the lot walk), `docs/URBAN-FORMS-v0.md` (the fabric)
> and `docs/COURTYARDS-AND-LEVELS-v0.md` (column ownership) are generalised, not
> amended.

---

## 0. What was walked, and what the code actually says

### 0.1 The lip

Dense and steep worlds show one-and-two-block lips everywhere: a building
standing on grass or on its own plinth a block or two above the street it
fronts. The mechanism is three independent decisions that never meet.

1. **The lot picks its own plane.** `layDistrict`
   (`packages/compiler/src/layout/district.ts`) seats every infill building at
   `foundationY = cell?.foundationY ?? medianGround(input.field, rect)` — the
   rounded median of the field under *its own* footprint — and emits one
   `PadEdit` per building at `apron: BUILDING_APRON` (= 2, non-adaptive).
2. **The pad goes into the field before anything is materialised.**
   `applyPadEdits` (`packages/compiler/src/layout/index.ts`) composes every pad
   through `applyLevelPad` (`packages/stdlib/src/edits/index.ts`), which levels
   the footprint to `targetY` and smoothsteps back to the terrain over the
   apron. `terrain/compile.ts` runs it twice — the solver's node-scale pads at
   substage 3g, the fabric's lot pads immediately after — and then reclassifies.
3. **The street grades itself, later, from what it finds.**
   `surfaceStreetGraph` (`packages/compiler/src/structures/roads.ts`) samples
   `plan.ground` along each segment's `ArcFrame` stations and runs it through
   `gradeProfile` (same file), a lower envelope of unit cones at
   `band = ROAD_FILL_BAND = 0`. With a zero band the profile can only ever *cut*
   into the ground; it never rises to meet a lot.

Nothing reconciles (1) and (3) at the frontage. The lot's median is the median
of the whole footprint including the part that runs back up the hill; the
street's level is a longitudinally smoothed cut of the ground between lots. On
a slope those differ by one to three blocks, always, and the two-column
smoothstep apron is exactly wide enough to make the difference read as a step
rather than as ground.

**Why it is a medium-density disease.** At high density the lots merge into a
continuous street wall (`docs/URBAN-FORMS-v0.md`; the terrace path in
`layDistrict`) and the party-wall run hides every individual pad edge behind
masonry. At medium density each lot is freestanding and each shows its own edge.

**Why a city looks better than a district.** `solveCities`
(`packages/compiler/src/layout/city-pass.ts`) already levels each *cell* to one
plane — `foundationY = maskMedian(input.field, cell)`, pinned run by run at
`apron: 0`, with a six-column ramp on the largest inscribed rectangle to pull
the boulevard toward the quarter. Its own comment names this defect: "without
this its buildings stand at the cell's median while its own streets grade to the
natural ground beside them, and the kerb ends up two blocks below the shopfront
— visible as a window box hanging in mid air". So half the fix has already
shipped once, for cities, keyed on a *cell*. WP-8 is the same fix keyed on the
**street**, for everything.

### 0.2 The platform

A bespoke instance ships on a visible fill platform. The chain, in
`packages/compiler/src/programs/`:

- `programGroundPlane` (`place.ts`) picks the **median** column of the footprint
  plus one as the seat plane, refusing only past `PROGRAM_MAX_RELIEF = 16`;
- `treatProgramSite` (`site-treatment.ts`) then fills every column below that
  plane through `levelPropPad` and grades a lift-keyed apron out of it
  (`programApronRings`, 1:2, capped at the thing's own long side);
- **the pad is laid before the program runs** (`pass.ts`, the `seat?.policy ===
  "pad"` block), explicitly so that "`api.heightAt` shows the program the ground
  it will actually stand on rather than the ground that was there first";
- `underpinProgramInstance` (`site-treatment.ts`) then sinks a plinth under any
  column left with daylight.

So the program is authored against a flat sandbox (`FLAT_GROUND` in
`verify.ts`), validated against a flat sandbox, and then handed a flattened
world at run time. `api.heightAt` exists, prompt rule 6 tells the author to
follow it, and on the shipped path there is nothing left to follow. The pad is
the platform.

### 0.3 Three things the brief assumed that the code contradicts

Each of these changes the design, so they are stated before the laws.

**(a) "Terrain is never cut" is a *pad* law, not a compiler law.**
`applyLevelPad`'s own doc-comment: "inside the footprint the field *becomes*
`targetY` (**cut as well as fill** — a building needs one floor height, not a
raised mound)". Every district lot already cuts the hill it stands on, because
its pad is a pre-materialisation field edit. What is fill-only is the *late*
family — `levelPropPad` and `gradeApron` skip any column whose ground is already
at or above the target, for the stated reason that a cut after materialisation
deletes the vegetation and snow standing on the column. `surfaceRoute` and
`buildDoorsteps` both cut freely after materialisation. So an uphill lot **can**
be lowered to its road: that is a layout-stage pad doing what it already does.
The brief's worry ("the no-cut law means an uphill lot cannot be lowered") does
not bind WP-8 at all, and binds WP-9 only in the shape of a capped carve
(§2.9).

**(b) `outputHash` is already independent of the site.**
`verifyOutputHash` (`programs/verify.ts`) re-executes at the fixed
`VERIFICATION_NODE_PATH = "loam.verify"`, over `PROGRAM_LIMITS.verificationInstances
= [0, 1, 7]`, with `FLAT_GROUND`, and compares to the stored digest. It never
touches the placed run. Making a program's *placed* output depend on `heightAt`
therefore breaks nothing in the hash check — the check was never a witness for
the placed run. What it does mean is that the flat digest stops being a strong
witness for the code paths that matter, and WP-9's answer is an **additional,
optional** hash rather than a change to the existing one (§2.6).

**(c) The frontage relation already exists in the data.**
`Lot` (`layout/district.ts`) carries `face` ("the direction from the lot towards
its street — where its door points"), `street` ("the segment id it fronts; `""`
when it fronts the district boundary") and `corner`. `streetBehind` already
probes outward through the sidewalk band to find the owning segment. The
frontage tie needs no new geometry: it needs the *level* of that segment, at the
moment the lot is seated, and that is the only thing missing.

---

# Part I — the frontage tie (WP-8)

## 1. The laws

### F1 — the authority

> **Inside a settlement the carriageway is the ground authority. A thing that
> fronts a street seats at the level of that street; nothing that fronts a
> street seats on the median of its own footprint.**

"A thing" is a lot, a landmark on a lot, a plaza-side precinct, a prop pad and a
bespoke site — one law, five clients (§1.6).

### F2 — one grading, computed once

> **A carriageway's elevation profile is computed exactly once, at the moment
> its graph is drawn, and every later consumer reads that answer rather than
> re-deriving one.**

This is `street-owner.ts`'s law ("the owner decides the column's level") lifted
one stage earlier, and it is the same construction §13.2a of the ground contract
used for `structure.linework`: *where* a carriageway runs is decided in the
layout stage (`DistrictPlan.streets`, `CityPlan.arterials`); *what level it
holds* is decided by the grader. WP-8 moves the second decision to sit beside
the first and hands it forward.

The artifact is `StreetDatum`:

```ts
/** layout/street-datum.ts */
export interface StreetDatum {
  /** Segment id (qualified) → the graded level at each arc station. */
  readonly bySegment: ReadonlyMap<string, ArcLevels>;
  /** Region-indexed carriageway level, WORLD_MIN_Y where no street. */
  readonly columnY: Int32Array;
  /** 1 where `columnY` is meaningful — carriageway plus sidewalk band. */
  readonly band: Uint8Array;
  /** The level at the nearest banded column within `reach`, or undefined. */
  levelNear(x: number, z: number, reach: number): number | undefined;
}
```

### F3 — how the datum is computed

Normative, so that the layout-stage answer and the structure-stage answer are
the same number rather than two numbers that usually agree:

1. Sample ground as `clampY(Math.floor(field.values[k]))` — **the exact
   materialisation rule** (`terrain/columns.ts`, the `ground[idx]` write). Not
   `medianGround`'s `Math.round`; the two differ by one block on half of all
   columns and that difference is itself a lip generator.
2. Build each segment's `ArcFrame` with `arcFrame` (`structures/sweep.ts`) —
   the same frame the surfacer uses, so the grade cap is one block per block of
   *ground travelled* and a 45° avenue does not climb √2 too fast.
3. Order segments by `compareStreetRank` (`structures/street-owner.ts`), claim
   columns in that order, and grade in claim order, pinning at shared columns
   with `pinLevel` — the ownership machinery unchanged.
4. `gradeProfile(ground, seaLevel, ROAD_FILL_BAND, 0)` per segment. **The deck
   and rim floor is deliberately zero here**: `routeFloorAt` needs `fluidTop`,
   which does not exist until `buildColumnPlan` runs. The floor is the
   surfacer's, and F8 says what happens where it bites.
5. `arcLevels(frame, profile)` → `ArcLevels`, and the swept cross-section
   (`carriagewaySpans(width)`) rasterises `columnY`/`band`.

Pure: no plan, no RNG, no clock, testable without a compile. That is the
`solved-carriageway.ts` discipline and this file sits beside it.

### F4 — the seat

> **`foundationY(lot) = datum.levelNear(frontAnchor, FRONTAGE_REACH) +
> FRONTAGE_RISE`,** where `frontAnchor` is the midpoint of the lot rect's
> `Lot.face` edge, and `FRONTAGE_REACH = graph.sidewalk + STREET_PROBE_SLACK`
> — the same reach `streetBehind` already probes with, so a lot that has a
> street by the fabric's reckoning has one by the datum's.

`FRONTAGE_RISE = 0`. A building's floor block is laid at `foundationY + 1`
(`structures/buildings.ts`, `floorY`), so a lot seated flush with its
carriageway puts its threshold exactly one block above the pavement — a
doorstep, which is the thing `buildDoorsteps` exists to dress. `1` (a plinth
course under every shopfront) is the obvious alternative and is a **taste**
parameter: it changes every settlement world's look and therefore lands only on
a walk (§7).

### F5 — corner lots

`Lot.corner` is already flagged and `Lot.street`/`Lot.face` already name the
*front* street rather than the flank.

> **A corner lot ties to its front street and never to its flank. Where the
> flank's datum differs, the difference becomes a transition along the flank —
> never a compromise plane.**

If the two levels differ by more than `CORNER_TOLERANCE = 2`, the lot takes the
**lower** of the two. Taking the higher would put the front door above its own
pavement, which is the defect; taking the lower puts the flank pavement above
the lot, which is a step-up along the side wall — a real corner building on a
hill, and the ratified hill-town look (`memory: hill-town-aesthetic-calibration`
— "flattened terraces following the hill's shape are correct").

### F6 — no frontage, no tie

> **A thing with no road frontage is not tied, and keeps exactly the seat it has
> today.**

Four cases, all pre-existing and all left alone:

| case | test | seat |
| --- | --- | --- |
| district-boundary lot | `Lot.street === ""` | `medianGround`, unchanged |
| plaza-adjacent node | `adjacent_to` a plaza; no banded column in reach | its own plane; `pavePlaza` (rank 30) still outranks the street |
| scattered farm | `isFarmGenerator` — `padFor` already returns `null` | untouched; a holding must never be levelled (`docs/FARM-PLAN-v0.md` §3.2) |
| solver-placed landmark off the network | no banded column within `FRONTAGE_REACH` | `referenceY` / `terrain_conform.reference`, unchanged |

This is what makes the reach law (F12) hold, and it is deliberate: inventing a
frontage for something that has none is how a farmyard ends up on a road's
plane.

### F7 — the lot grades from the road backward

A building needs one floor plane, so the pad stays a plane. What changes is
*which* plane and *how it leaves*:

> **A tied lot's pad targets the frontage level over the whole building rect.
> Its apron is `0` on the street face — there is nothing to blend, the street is
> already at that level — and adaptive (1:2, `APRON_RUN_PER_BLOCK`) on the other
> three. The apron feathers lot → wild, never pad → street.**

This needs one new field, `LevelPad.apronBySide` /
`PadEdit.apronBySide: { north, east, south, west }`, defaulting to the scalar
`apron` on every side (so every existing pad is byte-identical). Wave 8C.

Uphill and downhill then resolve without a negotiation:

- **downhill of the frontage** — the pad fills, the adaptive apron walks the
  fill back down at 1:2, and `buildings.ts`' foundation skirt takes whatever the
  apron did not reach. Unchanged machinery.
- **uphill of the frontage** — the pad *cuts*, because a layout-stage pad cuts
  (§0.3a). Where the cut at the rear of the rect would exceed
  `FRONTAGE_CUT_MAX`, the rect is **not** deepened: the pad stops at the rect,
  the apron on the rear face is set to `0`, and the hill stands against the
  building's back wall. The seam between the cut lot and the untouched hill is a
  boundary between two owners at different levels, which is precisely what
  §5.6's `deriveTransitions` is for — a `bank` under 2 blocks, a `retaining`
  wall from 2 to `RETAIN_MAX`, a bank above it. **The terrain standing against
  the rear is the answer, not a defect**, and it is the look Kai ratified.
- **the road never climbs for a lot.** A carriageway's profile is a function of
  the ground and of nothing downstream of it. If it climbed to suit a lot it
  would stop being an authority and F2 would be a lie.

`FRONTAGE_CUT_MAX` starts at `RETAIN_MAX` (6): the deepest face the retaining
table is willing to build is exactly the deepest cut a lot may make, so a tied
lot can never ask for a wall the wall pass refuses. That is a derivation, not a
tuning, and it is why the constant is not free.

### F8 — how the datum survives the surfacer

The surfacer is not deleted; it is demoted to a consumer.

> **`surfaceStreetGraph` does not re-grade a segment that carries a datum. It
> takes the datum as its profile and applies exactly one further constraint: the
> per-station water floor (`routeFloorAt`), maxed in through `gradeProfile`'s
> existing floor envelope.**

So the final level equals the datum everywhere except where water lifts it, and
that is the one case worth reporting:

- a station lifted above its datum by ≥ 1 emits `LOAM-T237 FRONTAGE_TIE_DRIFT`
  once per segment, naming the count and the maximum;
- the same lift is the berm of Part III, so the two findings are the same
  measurement seen from two sides.

Three further departures are legitimate and are *not* drift, because the datum
is defined to be a claim rather than an outcome: a plaza's `band = 0` cells
(`pavePlaza` runs before the street pass and rank 30 outranks it), a
`structure.linework` bed at rank 25, and a `precinct.ground` at rank 20. In all
three the ground contract has already decided, and the street loses its columns
in its own report row.

### F9 — the cut cap on the street itself

`gradeProfile`'s doc-comment states the gap plainly: "Fill is capped at `band`
by construction. **Cut is not** — a route crossing a narrow gully digs as deep
as the gully." Under F1 that cut is inherited by every lot on the street.

> **A carriageway may not cut more than `STREET_CUT_MAX` below its own natural
> ground at any station. Where the cap binds, the profile breaks instead of
> digging.**

The break mechanism exists (`STREET_BREAK_FLOOR`, `roads.ts`) and the `steps`
role exists; a broken run is a flight, which is what a street does on a hill.
`STREET_CUT_MAX` is set from the same forensics measurement as
`ROAD_BERM_MAX` (§3.1) and is pinned beside the constant in the §13.8 tradition.

### F10 — the datum is not a claim

The datum declares nothing to the ground driver. It is an input to seating,
computed one full stage before the resolver exists. The street's `street.network`
intents are unchanged in rank, class and shape (`streetIntents`, `roads.ts`);
what changes is only the number inside them.

This is deliberate and is what keeps WP-8 out of `layout/ground-resolver.ts`
entirely. The resolver needs no change for any of Part I, exactly as it needed
none for `structure.linework`.

### F11 — determinism

- The datum is a pure function of `(region, StreetGraph, field, seaLevel)`.
  Integer arithmetic throughout; the one float is `arcFrame`'s station spacing,
  which is already load-bearing and already pinned by the surfacer's tests.
- Segments are graded in `compareStreetRank` order, which is
  `(−width, roleRank, kindRank, id)` and is a pure function of the graph.
- Lots are seated in the order `layDistrict` already walks them (block, side,
  order), and `levelNear` breaks ties by ascending region index, never by
  iteration order.
- No RNG, no clock. A tied world is byte-identical between two runs of the same
  commit at the same seed, which is the whole cloud-box property
  (`memory: cloud-box-workflow`).

### F12 — reach

> **A document with no district lot that fronts a street compiles
> byte-identically.**

Terrain-only worlds, `terrarium`, `devworld`, `theme-sweep`, every farm world,
every scatter-only world: not one byte. Worlds *with* a settlement all move, and
that is the point — see §7 for what that means about shipping.

## 1.6 The other four clients of F1

**Precincts and plazas.** Unchanged in WP-8. `pavePlaza` outranks the street
(rank 30 vs 90) and a plaza is a place, not a frontage. A lot fronting a plaza
takes the plaza's plane through the existing `adjacent_to` path.

**Prop pads.** `levelPropPad` is fill-only and late. A prop inside the datum's
band takes `datum.levelNear` as its `baseY` instead of the median under it; a
prop outside the band is unchanged. This is a two-line change and it removes the
"bollard on a plinth beside the kerb" case.

**Bespoke sites.** Same rule, and this is where Parts I and II meet:

> **A bespoke site whose footprint has a banded column within `FRONTAGE_REACH`
> takes its seat plane from the datum, not from `programGroundPlane`'s median —
> whether it conforms or pads.**

`programs/road-anchors.ts` already routes a lane to a program's `door`/`front`
anchor and gives the resolved port `floorY = placement.foundationY`. If the
program's plane is the median of a hillside and the lane arrives at the datum,
the lane arrives at a plinth. Tying the site closes that by construction.

**Farms.** Explicitly excluded, per F6.

## 1.7 What changes, file by file

| file | change | wave |
| --- | --- | --- |
| `layout/street-datum.ts` (new) | `gradeStreetDatum`, `StreetDatum`, `levelNear` | 8A |
| `layout/district.ts` | datum built after `buildStreetGraph`; `BuiltLot` carries `street`/`face`/`frontAnchor`; the `foundationY` expression gains a tied branch; per-side apron on the tied pad | 8B, 8C |
| `layout/types.ts` | `PadEdit.apronBySide`; `FRONTAGE_TIE`, `FRONTAGE_RISE`, `FRONTAGE_REACH`, `CORNER_TOLERANCE`, `FRONTAGE_CUT_MAX` | 8B, 8C |
| `stdlib/edits/index.ts` | `LevelPad.apronBySide`, honoured in `applyLevelPad`'s per-column reach | 8C |
| `terrain/compile.ts` | the datum crosses the stage boundary into `buildStructures` | 8D |
| `structures/roads.ts` | `surfaceStreetGraph` takes `datum?` and consumes it; `STREET_CUT_MAX` | 8D, 8F |
| `structures/props.ts` | `levelPropPad`'s `baseY` from the datum inside the band | 8E |
| `programs/place.ts` | `programGroundPlane` yields to the datum inside the band | 8E |
| `layout/city-pass.ts` | the cell's plane becomes its own streets' floor | 8E |
| `spec/terrain/diagnostics.ts` | `LOAM-T237`, `LOAM-T238` | 8B |

**What must not be touched.** `layout/ground-resolver.ts`,
`layout/ground-contract.ts`, `INTENT_RANK`, `structures/street-owner.ts`'s
comparator, `structures/linework.ts`. If a wave needs one of these, the wave is
wrong.

## 1.8 Waves

Each is separately committable, each names its files, and none needs design
beyond this section.

- **8A — the datum kernel.** `opus-5-low`. New `layout/street-datum.ts` +
  `test/street-datum.test.ts`. Pure function, no call site, no behaviour change.
  Tests: 1-Lipschitz over arc length; ownership order is honoured at a
  crossroads; the sampled ground equals `clampY(Math.floor(field))` for every
  station (assert against `terrain/columns.ts`'s rule, so the two cannot drift);
  shuffling the segment list does not change the output. **Byte-identical.**
- **8B — the frontage record and the flag.** `opus-5-low`. Thread `street`,
  `face`, `corner` and the front-edge midpoint from `Lot` onto `BuiltLot`
  (`layout/district.ts`); build the datum inside `layDistrict` after the graph is
  drawn; add the tied `foundationY` branch behind `FRONTAGE_TIE = false`; add
  `LOAM-T237`/`LOAM-T238`. **Byte-identical while the flag is off**, and the
  golden harness of `test/ground-equivalence.test.ts` proves it.
- **8C — the asymmetric apron.** `opus-5-medium`. `LevelPad.apronBySide` in
  `stdlib/edits`, `PadEdit.apronBySide`, and the tied pad's use of it. Judgement
  needed on the smoothstep's per-column reach when two sides disagree at a
  corner column: the rule is **the reach of the nearer side, ties to the lower
  index side**, and it must be asserted. **Byte-identical**: every existing pad
  omits the field.
- **8D — the surfacer consumes the datum.** `opus-5-medium`. `StreetDatum`
  crosses `terrain/compile.ts` into `buildStructures`; `surfaceStreetGraph` uses
  it as the profile and applies only the floor; `STREET_CUT_MAX` and the break;
  the drift diagnostic. This is the wave with real diagnosis in it — the
  arterial path (`buildRoadNetwork`) and the `road.network@0` path have **no**
  datum and must be provably unchanged.
- **8E — the other clients and the cities.** `opus-5-low`. Props, program sites,
  and the city cell (the cell plane becomes its streets' floor rather than a
  competing plane).
- **8F — the flip and the walk.** Flip `FRONTAGE_TIE`, regenerate the deck end
  to end via `terrainist generate` (never hand-authored — standing decision),
  install alongside with `--channel`, and **stop**. The verdict on `FRONTAGE_RISE`
  and on the rear-terrace look is Kai's and only Kai's.

---

# Part II — bespoke builds on real terrain (WP-9)

## 2. The shift

From *pad under a prefab* to *conform by default*. The machinery half exists;
what is missing is (a) terrain in the sandbox, (b) a check that a program used
it, and (c) a compiler that stops flattening the ground before the program can
see it.

### C1 — the seat vocabulary

`SEAT_POLICIES` (`packages/spec/src/programs/types.ts`) gains a fifth member:

| policy | meaning | pad? | re-seat by `seatY`? |
| --- | --- | --- | --- |
| `pad` | today's behaviour: level, apron, then run | yes | yes |
| **`conform`** | **run against the real ground; skirt what floats** | **no** | **yes** |
| `embed` | `conform` plus `embedDepth` blocks of sink | no | yes, sunk |
| `drape` | no pad and no re-seat at all | no | no |
| `wade` | seabed seat, waterline clamp | no | yes |

`drape` is kept and deprecated in the kit: it is `conform` minus the re-seat,
which is a distinction only a program that already knows its own `seatY` is 0
can use. Nothing in the compiler reads `params.seat` directly — `seatOfParams`
is the one blessed reader — so the addition is one union member and one row.

### C2 — the default, and how it is earned

> **`conform` is the default for a program the gate certified as conforming, and
> `pad` is the default for every other program. An explicit `seat` in the
> document always wins.**

This is the load-bearing decision of Part II. It is not a flag day: a program
that ignores `api.heightAt` still gets a pad and still looks exactly as it does
today, and a program that reads it gets real ground. The migration is by merit,
per program, and it can never regress a build that was working.

The verdict rides on the frozen record:

```ts
/** spec/programs/types.ts — AuthoredProgramRecord, two optional additions */
readonly conforms?: boolean;      // the gate's §2.4 verdict
readonly conformHash?: string;    // b3: digest over the terrain suite
```

Both optional. **A record with neither — which is every archived document —
resolves to `pad` and is bit-for-bit unaffected.** That is the archived-doc
compatibility story in one line, and it is why the verdict is a record field
rather than a re-derivation.

### C3 — the terrain suite

The authoring sandbox stops being flat. `programs/conform.ts` (new) defines
`CONFORM_SUITE`: a fixed, ordered set of node-local samplers, each a pure
integer function of `(x, z, w, d)` — **no trigonometry anywhere**, because
`verifyOutputHash`'s whole purpose is to turn a host whose `Math.sin` differs in
the last bit into a loud error, and a suite built on `Math.sin` would
manufacture exactly that error.

| id | sampler `h(x, z)`, relative to the seat plane | what it tests |
| --- | --- | --- |
| `flat` | `0` | today's behaviour; the identity member |
| `slope10` | `-((z * 18) / 100 \| 0)` | a gentle fall to local south |
| `slope20` | `-((z * 36) / 100 \| 0)` | a real hillside |
| `ridge` | `-(abs(x - (w >> 1)) >> 1)` | a crest under the middle, falling both ways |
| `shore` | `0` for `z < d >> 1`, then `-2 * (z - (d >> 1))` floored at `-12` | a bank into water |

Five members, chosen so that every one of prompt rule 6's four answers — legs,
skirt, plinth, foundation — is exercised by at least one, and so that a program
that hard-codes a flat sole fails at least three. The set is **pinned**: adding
a member changes `conformHash` for every program and is therefore a
re-authoring event, not a patch.

### C4 — what the gate measures

A sixth gate step, `gateConform`, beside the five in `programs/verify.ts`. For
each suite member it runs one instance and computes, over the instance's
**occupied columns** (the `voxels` map keyed `"x,y,z"`, already built by
`runProgramInstance`):

| finding | definition |
| --- | --- |
| `floating` | an occupied column whose lowest block is more than 1 above `h(x, z)` — daylight under the thing |
| `buried` | an occupied column whose highest block is at or below `h(x, z)` — the thing is inside the hill |
| `rigidSole` | the multiset of per-column lowest blocks is identical to the `flat` member's — the program did not read `heightAt` at all |

The verdict:

```
conforms := for every suite member:
              floating / occupiedColumns <= CONFORM_FLOAT_TOLERANCE (0.10)
              and not rigidSole
```

`buried` is measured and reported but does **not** fail the verdict: burial is
the compiler's problem (§2.9), not the author's, because a program cannot cut.

### C5 — where "didn't conform" ranks

Gate leniency is **permanent** (`programs/leniency.ts`, ratified 2026-08-17),
and this finding sits comfortably inside it: a beautiful non-conforming
structure is exactly the case leniency exists to protect — the serpent strung
with thirty-nine "floating" sea lanterns that read as art.

> **`conforms: false` is never a failure. It is a routing decision: the program
> is seated `pad` and built exactly as it is today.**

So it is a `LOAM-W340 PROGRAM_DID_NOT_CONFORM` warning, and:

- **in the authoring loop's `FEEDBACK_CODES`: yes.** This is the one code where
  §13.6's objection does not apply. The precedent's argument is that a code
  firing on every *world* costs money in the authoring loop and buys an invented
  change; this one fires on a *program*, at authoring time, and names a change
  the author can actually make ("read `api.heightAt` and follow it"). It is the
  first code whose whole purpose is to teach the authoring model something.
- **in the compile report: yes, as a note** (`LOAM-T341 PROGRAM_SEATED_PAD`),
  because "this instance is on a platform because its program did not conform"
  is the sentence a walker needs and cannot otherwise get.

### C6 — determinism, and how the double run survives

Three separate guarantees, kept separate:

1. **`sourceHash` and `outputHash` are unchanged.** Same normalisation, same
   `loam.verify` node path, same `[0, 1, 7]`, same `FLAT_GROUND`, same
   `canonicalOpStream`. `verifyOutputHash` at compile time is untouched. Every
   archived document still verifies, and a host that disagrees still fails loud.
2. **`conformHash` is the suite's digest**, computed as the `b3:` of the
   concatenated canonical op streams of the suite runs **in suite order**,
   verified at compile time by a sibling `verifyConformHash` **only when the
   field is present**. Absent ⇒ not checked ⇒ archived docs unaffected.
3. **The double run stays on `flat` alone.** Today the gate is 3 instances × 2
   realms = 6 executions; a naive suite would make it 3 × 5 × 2 = 30 and every
   one of those is fuel-bounded at 20 M steps. The witness for order-dependence
   is the *code*, not the terrain: a program whose iteration order is unstable
   is unstable on flat ground too. So: `flat` runs twice and byte-compares
   (unchanged), the other four members run once each, and the total is 11. State
   this in the file, because "why is the suite not double-run" is otherwise the
   first review question.

**The placed run.** A conforming instance's output is now a function of
`plan.ground` under its own footprint. That is deterministic — `plan.ground` is
a pure function of `(commit, document, seed)` — and it is the same class of
dependency `api.theme` already introduced (a read of something the world decided
long before, never a draw). The scatter case is unchanged in kind: N instances,
N different seeds, and now N different terrains, which is *more* variety from
the same program rather than a new source of nondeterminism.

**One real hazard, named.** `rotatedHeightAt` (`programs/pass.ts`) turns the
sampler into the instance's unturned axes, and `rotateRun` turns the output
back. A conforming program makes that round trip observable for the first time:
an off-by-one in the rotation would previously have been invisible on flat
ground. Wave 9B must assert `rotatedHeightAt(nodeLocalHeight(...), r)` against
the rotated footprint for all four rotations on a non-flat plan.

### C7 — the compiler: what replaces the pad

For `seat: "conform"`, in `programs/pass.ts`:

1. **No `treatProgramSite`.** No `levelPropPad`, no `gradeApron`. The pad block
   is gated on `seat?.policy === "pad"` today, so this is a table lookup, not a
   branch.
2. **The seat plane is the front anchor, not the median.** `programGroundPlane`
   is kept for `pad` and joined by `conformSeatPlane` (`programs/place.ts`):

   ```
   conformSeatPlane(plan, rect, frontColumn?) =
     frontColumn !== undefined ? ground[frontColumn] + 1
                               : programGroundPlane(plan, rect)   // the median, unchanged
   ```

   The front column is where the program's `front`/`door` anchor lands after
   rotation — the same computation `road-anchors.ts` already does. **Why the
   front and not the lowest perimeter contact**: the seat plane is the origin of
   `api.heightAt`, and rule 6 teaches "0 where the ground meets it, negative
   where it falls away". A lowest-contact plane would make `heightAt` ≥ 0
   everywhere and silently invert the teaching for every program already
   written. The front anchor keeps rule 6 true word for word, and it is also the
   level a road arrives at (§1.6), so one number serves both.
   Under WP-8, the datum overrides both when the site is in the band (F1).
3. **`underpinProgramInstance` stays, and becomes the *only* ground courtesy.**
   It is already exactly the right thing for a half-conformed instance: it fills
   from each occupied column's lowest block down to the ground, capped at
   `MAX_FOUNDATION_DEPTH`, skipping columns whose lowest block sits above the
   seat plane (spans, arches, hulls) and columns over water. A program that
   conformed perfectly gets zero blocks from it — the loop's `if (top <= g)
   continue` — and one that half-conformed gets a plinth under exactly the legs
   that float. **The pad's replacement already shipped; it just never ran
   without the pad in front of it.**
4. **`siteWaterLine`'s fluid clamp is unchanged**, and so is `LOAM-W339`.
5. **The placer's lift preference loses its job and keeps it.**
   `PROGRAM_GENTLE_LIFT` walks the site queue twice, refusing sites needing more
   than four blocks of fill before falling back. Under `conform` there is no
   fill, so the first walk's ceiling becomes a *relief* ceiling instead of a
   fill ceiling: prefer sites whose footprint relief is under
   `PROGRAM_GENTLE_LIFT`, fall back to any site under `PROGRAM_MAX_RELIEF`.
   Same two-walk shape, same "never a refusal" guarantee, different measurement.

### C8 — the residual, reported

`LOAM-T342 PROGRAM_CONFORM_RESIDUAL`, once per node: how many columns the skirt
underpinned and how many are buried, as a fraction of occupied columns. This is
the number that tells us whether §2.9's carve is needed, and it must exist
before the carve is built.

### C9 — the carve, and why it is last

The one thing a conforming program cannot do is get out of the way of ground
*above* its seat plane. Today the median plane hides this (half the footprint is
filled up to it); under `conform` the uphill side of a sloped site is simply
inside the hill, which is the original walked Troy defect ("a wall of the hut
buried on the uphill side").

Three answers exist and the order matters:

1. **Site preference** (C7.5) — pick flatter ground. Free, already half-built,
   and on a scatter with slack it is most of the fix.
2. **The program's own answer** — a thing that reads `heightAt` and finds `+4`
   under one corner can build a taller wall there. Prompt rule 6 already asks
   for this in the downhill direction; §2.10 extends it upward.
3. **A capped carve** — the instance declares a `platform` claim at
   `prop.pad` rank over the columns it occupies, at `min(blockY) − 1` per
   column, floored at `groundY − CONFORM_CUT_MAX (3)`, never on a fluid column.
   A cut, deliberately: §0.3a establishes that post-materialisation cutting is
   ordinary for the street family, and the same care applies — the resolver's
   `moved` mask clears the snow, and the surface material is re-capped exactly
   as `gradeApron` re-caps it.

**(3) is wave 9D and is gated on the §2.8 measurement and on a walk.** Building
it before we know how much burial survives (1) and (2) is inventing an
earthwork, and an earthwork around a hut is the defect `programApronRings`' own
second cap exists to prevent.

### C10 — teaching

**Prompt rule 6** (`packages/agents/src/program-author.ts`) is rewritten. The
current text ends "The compiler levels modestly under you and never cuts
terrain; it does not flatten a hillside for you", which is now false in both
directions: it does not level at all, and there is no modesty to rely on. The
replacement:

> 6. **FOLLOW THE GROUND YOU ARE GIVEN — it is real, and nothing will flatten it
>    for you.** `api.heightAt(x, z)` is the terrain height under your footprint,
>    node-local and measured from the seat plane: 0 where the ground meets it,
>    negative where the ground falls away, positive where it rises. **You are
>    validated on five different pieces of ground** — flat, two hillsides, a
>    ridge and a shore — and the same program must stand on all five. A thing
>    that stands on the ground reads `heightAt` at every column it touches and
>    answers it: legs that reach down, a skirt that follows the fall, a plinth
>    that steps, a foundation course that thickens. Where the ground rises
>    *above* your seat plane, build up to meet it — a taller wall, a higher
>    course — because the compiler will not cut the hill away. A program that
>    writes the same sole on every column is a prefab; it will be reported and it
>    will be set on a platform, which is the look this rule exists to end.

**The settlement kit** (`docs/kits/settlement-author.md`, the seat table around
the `"seat": "embed"` section) gains `conform` as the documented default and
demotes `drape`:

> `"seat": "conform"` — the default, and what you want. The program is run
> against the real terrain of the site it landed on and builds down into it.
> Nothing is levelled and nothing is filled except under a leg that would
> otherwise hang in the air.
> `"seat": "pad"` — the old behaviour: the ground under the footprint is filled
> to one plane first. Ask for it when the thing genuinely wants a podium (a
> temple platform, a landing pad), and not otherwise. A program that cannot
> conform is given this automatically.

**The catalog** (`docs/CATALOG-EXPANSION-v0.md`'s bespoke rows) gains one line:
a program's exhibit row must include one sloped cell, so a rigid sole is visible
in the exhibit rather than only in a walk.

### C11 — reach

> **A document whose program records carry no `conforms` field compiles
> byte-identically.**

Every archived document, every frozen program, every world in the battery. They
re-execute their frozen programs, get `pad`, and land where they landed. The
first world that moves is the first world generated *after* an authoring run
that stamped a verdict, which is a deliberate, dated, walkable event.

## 2.12 Waves

- **9A — the suite and the verdict.** `opus-5-medium`. New
  `programs/conform.ts` (the suite, `conformanceOf`), `gateConform` in
  `programs/verify.ts`, the two optional record fields in
  `spec/programs/types.ts`, `verifyConformHash`, `LOAM-W340`. No compiler
  behaviour change: nothing reads the verdict yet. **Byte-identical.** Tests:
  the suite is integer-pure (assert no `Math.sin`/`cos`/`sqrt` reachable — a
  grep-shaped test in the `agent-defs.test.ts` tradition); a hand-written rigid
  prefab scores `conforms: false` on four members; a hand-written
  `heightAt`-following fixture scores `true` on all five; a record with no
  `conformHash` skips the check.
- **9B — the seat.** `opus-5-low`. `conform` in `SEAT_POLICIES`; `seatOf`
  (`programs/pass.ts`) resolves the default from the record's verdict; the pad
  block and the underpin block re-gated; `conformSeatPlane` in
  `programs/place.ts`; `PROGRAM_GENTLE_LIFT`'s measurement swap; the rotation
  round-trip assertion of §2.6; `LOAM-T341`, `LOAM-T342`. Byte-identical for
  records with no verdict, which at this point is all of them.
- **9C — the re-authoring run.** One authoring pass over the shipped program
  battery (`AUTHORING_MODEL_ID`, Gemini 3.7 Flash at effort high) with the new
  rule 6, stamping verdicts. Pre-authorised (~$2), once, at the end of a run,
  installed alongside — never mid-run. This is the first commit that moves a
  world, and it stops there for a walk.
- **9D — the carve.** `opus-5-medium`, **gated** on 9C's `LOAM-T342` numbers and
  on Kai's walk verdict. Only if burial is real.
- **9E — teaching.** `opus-5-low`. Prompt rule 6, the kit's seat table, the
  catalog's exhibit rule. Can land any time after 9A; the prompt change should
  land *before* 9C or the re-authoring teaches nothing.

---

# Part III — the lift-keyed edge (WP-10)

Two small fixes, one shape: a level or a bed that changes height without
feathering the change.

## 3.1 The water floor, and the berm it builds

`routeFloorAt` (`structures/roads.ts`, commit `b9f808d`) stopped roads draining
lake rims and it was right to: a street that graded one block through a tarn's
rim left six columns of open face and `LOAM-T110 UNSTABLE_FLUID` counting the
voxels that would pour out. Its own doc-comment claims the fix is bounded:
"this floor can only ever cancel a cut, never raise an embankment the route
never asked for. It is also why the lift is bounded: the answer is some nearby
column's own natural ground."

**That claim is true pointwise and false after propagation, and the gap is the
berm.** `gradeProfile` does not take the per-cell floor as given — a per-cell
floor is not 1-Lipschitz, so it first replaces it with the *upper* envelope of
unit cones, `floor[i] = max_j (floor[j] − |i − j|)`, and then maxes the profile
against it. A single station beside a high tarn therefore holds the profile up
for `rimTop − ground` stations in **both** directions, across ground that is
nowhere near the water. Through a settlement that is an embankment, and every
lot tied to that street (F1) inherits it.

> **W1 — the floor is a cap on cutting, never a licence to fill.** In
> `routeFloorAt`, clamp the returned floor to the station's own natural ground:
> `min(rimTop, ground[k])`. A rim column is at or above the water surface by
> definition, so this is a no-op at the rim itself and kills the invented lift
> everywhere else.
>
> **W2 — the floor is local.** In `gradeProfile`, clamp the per-cell floor to
> `ground[i] + ROAD_BERM_MAX` **before** the unit-cone upper envelope, not
> after. The cone then only carries the ramp needed to get back down, over at
> most `ROAD_BERM_MAX` cells, and the 1-Lipschitz guarantee is untouched
> (clamping a per-cell array pointwise, then enveloping, is the same
> construction).
>
> **W3 — the descent is already right.** With W2 in place, `gradeProfile`'s
> existing 1-Lipschitz property *is* the max-grade descent. No third mechanism.
>
> **W4 — a span that needs more is not a road.** Where a run would need to stand
> more than `ROAD_BERM_MAX` above its own ground for more than
> `VIADUCT_MIN_SPAN` stations, it is a viaduct, and rank 25 now has one
> (`structures/linework.ts`, GROUND-CONTRACT §13.2e). Promotion is deferred; the
> **note** that says it would have fired is not, because that note is the
> measurement that decides whether promotion is worth building.

**`ROAD_BERM_MAX` is not invented here.** A forensics agent is measuring the
actual berm on the walked world in parallel; the constant is set from that
measurement and pinned beside itself in the §13.8 tradition ("re-measure, and
pin the measurement in the file beside the constant"). Until that number lands,
the implementer's placeholder is `2` — a step and a half, the point past which a
raised road reads as an earthwork — and the wave is not committed without the
measurement in the comment. **W1 and W2 must both be reconciled against those
numbers before either ships**: if the measured berm is entirely explained by W1,
W2 is a cap that never binds and should be left out rather than added blind.

**Routing cost is deliberately not the answer.** A wet-rim penalty in the A*
(the `ROAD_WALL_HUG_COST` shape) would only reach `road.network@0` routes, and
the walked berm is on a *district street*, drawn by the fabric and never routed.
It is a reasonable later addition for rural lanes; it is not the fix.

**Forensics verdict (landed after this section was drafted).** The walked berm
is **not a street at all**: it is `world.unicorn_defense_terrace`, an
`infra.entry@0` (`acropolis_terrace`, sourceClass `retaining.seam`,
`ACROPOLIS_LIFT = 6`, `follow: "step"` → `sweepDatum`, so
`gradeProfile`/`routeFloorAt` never ran on it). Its `deriveWallCourse` ring
crossed the sacred lake and filled 208 of its 791 above-sea water columns; a
water veto for non-water-mover entries is the in-flight fix, and a
"`retaining.seam` requires a seam" relief test is its own later round. The
predicted routeFloorAt symptom is *absent* in that world — no fill cluster
along any street near the lake — so the b9f808d floor is exonerated on the
walked evidence. The cone-propagation hazard above is nonetheless confirmed
real by instrumentation (a rim floor of 95 propagates 94, 93, 92… along the
profile; a route leaving a tarn onto ground 6 lower builds an embankment up to
6 stations long). Reconciliation per the W1/W2 rule: there is **no walked berm
to measure**, so `ROAD_BERM_MAX` is set from the hazard geometry (2, pinned
with this verdict), W1 (the pre-envelope clamp) is the load-bearing half, and
W2 ships only as a cheap assertion.

Two further items this forensics added to the ledger: the refused-seam
question (`levels.ts` — 126 seam columns got neither wall nor bank on the
pirate haven and stepped vertically; "what does a refused `tallDrop` become"
is a design question for the WP-8 retaining round) and the pad-plane
quantization floor (`referenceY` rounds the continuous field median *up* on
flat ground — the monument's 1-block plinth; fold into 8F's datum rule, which
already chooses `Math.floor`).

## 3.2 Linework and wall beds

`declareLineworkBeds` (`structures/linework.ts`) commits a `profile` at rank 25
with `transition: "ramp"` and a `preserve` over the same columns. Per
GROUND-CONTRACT §13.2a rule 7 the boundary is supposed to become a derived
`GroundTransition` and a `bank` is supposed to be graded by `gradeBank`.

Two facts make that insufficient today, and both are checkable:

1. **Nobody *builds* from `resolved.transitions` yet.** `buildRetainingWalls`
   still derives its own seams from `levelSeams`/`skirtSeams`; the only reader in
   the tree is `structures/farm.ts`'s `countWalls`, which counts them for a
   report line and lays nothing, and `structures/streetscape.ts` says so in its
   own comment — "consuming `resolved.transitions` is WP-6 work". Wiring the
   consumers is §9a.7's, and it belongs to WP-6.
2. **A bank is graded 1:1.** `gradeBank` (`structures/retaining.ts`) steps
   `drop` columns at one block per column unless `benched` — 45°, which is
   precisely the ratio `APRON_RUN_PER_BLOCK = 2` was chosen *against* ("one is a
   45° bank and still reads as cut").

So a bed crossing a dip builds an unfeathered berm for the same reason a program
pad used to: the edge is lift-blind.

> **B1 — the lift-keyed apron doctrine extends to every bed.** A declared bed
> emits, beside its `profile`, a **skirt**: a ring band outside the bed whose
> per-column target is `bedY − ceil(ring / APRON_RUN_PER_BLOCK)`, dropped on any
> column whose natural ground already stands at or above the target, and capped
> at `min(APRON_MAX, the bed's own cross-section width × 2)` — the second cap
> being `programApronRings`' "inside its own width the apron is landscaping;
> past that it is landscape", which is the sentence that saved the mushroom
> vale.
>
> **B2 — the skirt declares at `verge`, not at `structure.linework`.** A bed's
> *level* is rank 25 because something walks onto it; its *apron* is a thing
> that "ramps to whatever it is ramping to", which is what `verge` (rank 140)
> is for (GROUND-CONTRACT §1.4). Declaring the skirt at 25 would let an apron
> outrank a street, which is the one thing the crossing subtraction exists to
> prevent. At `verge` the subtraction is belt to the rank's braces: a carriageway
> column is refused by rank even if the skirt forgets to subtract it.
>
> **B3 — the skirt is derived from the bed, never authored.** Same law as
> transitions: an entry that could declare its own apron could declare a wrong
> one, and a wrong apron is a cliff with a ramp painted on it.

When WP-6 wires the resolver's transitions to their consumers, B1's skirt
becomes redundant *if and only if* `gradeBank` is re-keyed from 1:1 to the
lift-keyed 1:2. Until then the skirt is the only feathering that actually gets
built, and the note above must be carried into WP-6's ledger so it is not
double-built.

## 3.3 Waves

- **10A — the floor.** `opus-5-low`, **blocked on the forensics numbers.**
  `routeFloorAt` clamp (W1), `gradeProfile` pre-envelope clamp (W2),
  `ROAD_BERM_MAX` with its measurement pinned, and the `LOAM-T239
  ROAD_BERM_CLAMPED` note. Tests: the walked tarn fixture keeps its rim (the
  `b9f808d` regression test must still pass — prove it can fail first); a road
  crossing low ground beside a high pond is within `ROAD_BERM_MAX` of its own
  ground at every station; `gradeProfile` is still 1-Lipschitz.
- **10B — the bed skirt.** `opus-5-low`. `lineworkSkirt` in
  `structures/linework.ts`, committed in the same `driver.commit` call as the
  bed (companion intents belong in one arbitration, §3.13), plus the wall bed
  when §13.2e's walk verdict adopts it. Reach law: a document with no
  linework-declaring node is byte-identical, exactly as the bed's own is.
- **10C — viaduct promotion.** `opus-5-medium`, deferred until 10A's note has
  fired on real worlds.

---

## 4. Non-goals

Stated so that a wave that drifts into one of these is visibly wrong.

1. **No second resolver, no new rank, no change to `INTENT_RANK`.** Part I
   decides what a claimant asks for; the contract still decides who wins.
   `layout/ground-resolver.ts` is not edited by any wave in this document.
2. **No autonomous critique→repair.** WP-9's gate routes a program to `pad`; it
   never rewrites one. The manual critique→repair law stands.
3. **No move of the shoulder BFS, the retaining table, or `treatmentForSeam`.**
   GROUND-CONTRACT §13.9's answer is unchanged.
4. **No re-grading of arterials or `road.network@0` routes in Part I.** They
   have no district lots hanging off them; tying them is a separate question and
   a separate measurement.
5. **No change to `outputHash`, `sourceHash`, or `canonicalOpStream`.** Every
   archived document must stay compilable, and that is the mechanism.
6. **No aesthetic tuning without a walk.** `FRONTAGE_RISE`, the rear-terrace
   look, the carve, and the bed skirt's cap are all look decisions.
7. **No isolate work.** `sandbox.ts`'s launch blocker is untouched; the terrain
   suite runs in the same `node:vm` realm.
8. **No new authoring model, no escalation.** Cheap-model-first stands; WP-9C is
   a re-run of the pinned model, not a promotion.

---

## 5. Risks

| risk | blast radius | mitigation |
| --- | --- | --- |
| **The datum and the surfacer disagree.** Two computations of one number is how a bed ends up a course off its own deck. | every settlement world, subtly | F8 makes the surfacer a *consumer*, not a second grader; the only legal departure is the water floor and it is reported as `LOAM-T237`. The sampling rule is asserted against `terrain/columns.ts` in wave 8A. |
| **Byte-identity blast radius.** Every settlement world moves at 8F, and again at 9C. | the whole battery | Both are behind explicit gates (`FRONTAGE_TIE`, the record verdict) so every wave before the flip is provably identical; `test/ground-equivalence.test.ts`'s harness proves it, and the standing rule is to prove the harness can see a difference before trusting that it saw none. |
| **Archived documents stop compiling.** | the exhibits, the battery, every demo | The only mechanism that could do it is a hash change, and §2.6 forbids one. `conforms`/`conformHash` are optional; absent means "as today". A test compiles one archived doc with a frozen program and asserts `pad`. |
| **Determinism regression through `heightAt`.** A conforming program's output becomes terrain-dependent for the first time. | any world with a bespoke node | `plan.ground` is already a pure function of `(commit, doc, seed)`; the new dependency is the same class as `api.theme`. The rotation round trip is the one genuine hazard and wave 9B asserts it on all four rotations against a non-flat plan. |
| **`PAD_APRON_MISMATCHES` (the 55) interacts.** WP-8 changes the pads whose aprons cause it. | `c1-harbourtown`, `showcase-deltamere` | The golden is asserted and must be **re-measured, not updated silently**, at 8C and again at 8F, with the cause written down each time (§9a.5's rule). WP-7 — the pad apron as a declared transition — is the proper fix and is *unblocked* by this work rather than replaced by it: F7's per-side apron is exactly the field WP-7's declarer would have to read. |
| **The suite becomes a straitjacket.** Five pinned samplers reward programs that special-case them. | authoring quality | The verdict is a floor, not a score: it gates only `conform` vs `pad`, and a program that games the suite still has to survive the physics lint and a walk. Adding a member is a re-authoring event and is priced accordingly. |
| **Gate cost.** Five extra executions per program at 20 M steps each. | authoring wall-clock and money | §2.6.3 keeps the double run on `flat` alone: 6 → 11 executions, not 6 → 30. |
| **The carve deletes something.** A post-materialisation cut removes snow, vegetation and soil depth. | worlds with bespoke nodes on slopes | Deferred to 9D, capped at `CONFORM_CUT_MAX`, and gated on the §2.8 residual measurement. The `moved` mask and the surface re-cap are the existing machinery. |
| **`ROAD_BERM_MAX` invented rather than measured.** | every world with above-sea water near a road | 10A is *blocked* on the forensics numbers, and the wave is not committed without the measurement in the comment. |

---

## 6. Diagnostics this work adds

| code | name | severity | feedback set | fires |
| --- | --- | --- | --- | --- |
| `LOAM-T237` | `FRONTAGE_TIE_DRIFT` | note | no | the surfacer's final level departs from the datum by ≥ 1 at ≥ 1 station of a segment |
| `LOAM-T238` | `FRONTAGE_UNTIED` | note | no | a district's lots were seated with no datum in reach — the fabric drew a street the datum could not grade |
| `LOAM-T239` | `ROAD_BERM_CLAMPED` | note | no | W2's cap bound; names the stations and the height it wanted |
| `LOAM-W340` | `PROGRAM_DID_NOT_CONFORM` | warning | **yes** | the gate's suite verdict is false; names which members and which finding |
| `LOAM-T341` | `PROGRAM_SEATED_PAD` | note | no | an instance was padded because its program did not conform |
| `LOAM-T342` | `PROGRAM_CONFORM_RESIDUAL` | note | no | per node: columns underpinned, columns buried, as a fraction of occupied |

`LOAM-T237`–`T239` continue the `T23x` block that ends at `LINEWORK_BED_INTERRUPTED`;
`LOAM-W340`–`T342` continue the program block that ends at `PROGRAM_WATER_CLAMPED`.
Only `W340` enters `FEEDBACK_CODES`, and §2.5 argues why it is the exception to
§13.6's precedent rather than a violation of it.

---

## 7. Walk gates — which steps change what a world looks like

The standing manual-critique law: a look is never tuned without Kai's walk. It
does **not** stop the next ratified thing from being built (standing rule: never
wait on Kai). So the split is explicit.

**Land without a walk** — machinery, byte-identical or provably reach-limited:
8A, 8B, 8C, 8D, 8E, 9A, 9B, 9E, 10B. Every one of these either changes nothing
that ships or is gated behind a flag or an absent record field.

**Land only on a walk verdict:**

| step | what Kai is judging |
| --- | --- |
| **8F** — flip `FRONTAGE_TIE` | the tie itself; `FRONTAGE_RISE` 0 vs 1; the rear terrace against the hill; whether corner lots taking the lower street reads right |
| **9C** — the re-authored battery | conforming instances on real ground vs the platforms they replace; whether `pad` fallbacks look wrong beside them |
| **9D** — the carve | whether burial is visible enough to justify cutting |
| **10A** — the berm cap | only if the measurement is ambiguous; a berm removal is a defect fix, not a taste call |
| **§13.2e** — the wall's benched course | unchanged, still pending, still Kai's |

**Blocked on measurement, not on Kai:** 10A on the forensics berm numbers, 9D on
`LOAM-T342`, 10C on `LOAM-T239`.

---

## 8. Ledger

WP-1 → WP-6 are the ground contract's (`docs/GROUND-CONTRACT-v0.md`). WP-7 is
logged in its §13.3 — *"`applyLevelPad` declares the platform and the resolver
chooses the transition"* — and is **unblocked, not replaced**, by WP-8: F7's
per-side apron is the field a pad declarer would have to read, and WP-8's
measurement of `PAD_APRON_MISMATCHES` is the evidence WP-7 was waiting for.

| WP | title | this document | depends on |
| --- | --- | --- | --- |
| **WP-8** | the frontage tie | Part I, waves 8A–8F | nothing; independent of WP-6 |
| **WP-9** | bespoke builds on real terrain | Part II, waves 9A–9E | nothing; 9B benefits from 8E |
| **WP-10** | the lift-keyed edge | Part III, waves 10A–10C | 10A blocked on forensics; 10B notes a WP-6 interaction |

---

## 9. Open questions — the ones only Kai can answer

Each has a recommendation, so a wave is never blocked on an answer.

**9.1 `FRONTAGE_RISE`: flush, or one plinth course?** 0 puts the threshold one
block above the pavement (a doorstep). 1 puts a visible plinth course under
every shopfront, which is period-correct for a lot of architecture and wrong for
a village. *Recommendation: 0, and ask on the 8F walk.* It is one constant and
one recompile.

**9.2 Should a corner lot take the lower street, or the front street
regardless?** F5 says the lower when they differ by more than 2. The alternative
— always the front, and let the flank do whatever it does — is simpler and
occasionally puts a side door two blocks below its own pavement.
*Recommendation: the lower, as written; revisit on the walk.*

**9.3 Does `drape` retire?** Under `conform` it is `conform` minus the re-seat.
Keeping it costs a union member and a row; retiring it breaks any archived
document that wrote it. *Recommendation: keep, deprecate in the kit, retire only
if no shipped document uses it.*

**9.4 Should a non-conforming program be visible in the world, or just in the
report?** `LOAM-T341` says which instances are on platforms. The stronger option
is to refuse to scatter a non-conforming program on steep ground at all, which
costs instance counts. *Recommendation: report only; leniency is permanent and
this is a look, not a break.*

**9.5 Is a re-authored battery worth a second $2 run if the first one's conform
rate is low?** WP-9C stamps verdicts; if most programs still score `false`, the
prompt change did not land and the honest next move is a prompt iteration rather
than another sweep. *Recommendation: measure the rate at 9C, report it, and let
Kai decide whether to spend again.*
