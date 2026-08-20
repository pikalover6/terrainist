# Ground unification — the road is the ground, and a program stands on it

> Normative for **WP-8** (the frontage tie), **WP-9** (bespoke builds on real
> terrain), **WP-10** (the lift-keyed edge) and **WP-11** (the served seam).
> The first two headline directions were ratified by Kai on the 2026-08-17 deck
> walk, the second in his own words: *"What if we feed the bespoke generator the
> terrain that its structure will be sitting on and let it build naturally on top
> of that?"* WP-11 (Part IV) answers three walked-bad findings from the padfix
> and tie2 decks that turn out to be one mechanism, and it closes §3.2's ledger
> item — *"what does a refused `tallDrop` become"*.
>
> **`COURTYARDS-AND-LEVELS-v0.md` §3.4 and §3.5 are amended by Part IV**, which
> is the one place this document does more than generalise its parents: §3.4's
> drop table gains a tiered answer, and §3.5's steps 2 and 3 — specified there,
> never built — are given waves.
>
> `docs/GROUND-CONTRACT-v0.md` is the parent: this document adds no new
> arbitration, no new rank and no second resolver. It decides **what a claimant
> asks for**, which the contract deliberately never did (§1.5: "the resolver does
> not decide *where* anything goes"). Where the two disagree, the contract wins.
> `docs/DESIGN.md` is untouched by this document and remains the ratified brief.
> `docs/SITE-PLAN-v0.md` (the lot walk), `docs/URBAN-FORMS-v0.md` (the fabric)
> and `docs/COURTYARDS-AND-LEVELS-v0.md` (column ownership) are generalised, not
> amended — with the one exception Part IV names above.

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
a walk (§8).

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

**Where the cap is applied — wave 8G.** In the datum, not in the surfacer.
8D landed it as a floor inside `surfaceStreetGraph`'s tied branch, which made
F8's "exactly one further constraint" false: the datum dug an uncapped trench,
the lots seated in the trench, and the surfacer then held the carriageway up at
the cap. Kai's flag-matrix walk found the result — hill streets standing up to
nine blocks above their own frontages, `LOAM-T237` four times on `p1-tie2`'s
citadel, nine on `p4-gem1`'s ruined metro, four on Troy — and the instrumented
measurement was unambiguous: at *every* drifted station of both flagged worlds
the floor that bit was `natural − STREET_CUT_MAX`, never the water floor. The
cut floor needs nothing the layout stage lacks (it is a function of the street's
own sampled ground), so `gradeStreetDatum` now grades with
`max(pins, ground − STREET_CUT_MAX)` and the surfacer's identical `max` is a
no-op wherever the two see the same ground. F8's sentence is once again exactly
true: **water is the only further constraint**, and `LOAM-T237` is once again
the alarm it was written to be — 0 on all three worlds after the change.

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
that is the point — see §8 for what that means about shipping.

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

# Part IV — the served seam (WP-11)

Three walked-bad findings across two decks are one mechanism, and the mechanism
is a fall-through. `layout/levels.ts`' transition table has nine rules and five
distinct reasons to say *no wall here*; every one of those reasons lands on the
same word, `"bank"`, and on the quarters that actually shipped, a bank is a 45°
ramp of raw earth. So "we decline to build masonry" and "we grade one platform
into the other at the angle of repose plus twenty degrees" are the same
sentence, and the second one is the defect.

The question this part answers, plainly:

> **What should a seam become when a single wall is not affordable?**

## 4. What the refusal actually is

### 4.0 The three findings, as numbers

| finding | world | what the report says |
| --- | --- | --- |
| **"messy terrain overall"** (Kai, tie2 deck) | `world.troy_citadel`, `battery/candidates/p3-tie2` | 56 × `LOAM-W411`; 47 walls over 1,417 columns, **56 banks**, 437 seam columns unfaced (6 building, 94 shortRun, **337 tallDrop**), **1,983 columns graded as bank**. **Seven** of the refusals are drop **8** over runs of 23, 23, 41, 48, 50, 63 and 73 columns — 321 columns of citadel face graded into a ramp. **Forty-six** more are drops 2–5 over runs of 1–5 columns; the remaining three are drops 7, 8 and 9 over runs of 9, 4 and 7. |
| **"garbled quarry"** (Kai, p1-padfix walk) | the pirate haven | 126 seam columns refused, 67 `shortRun` + 59 `tallDrop`; platforms stepping vertically, stone-lined trenches with natural-ground stubs between them. Logged in §3.2's forensics ledger as *"what does a refused `tallDrop` become"*. |
| **stairs to nowhere** (Kai, tie2 deck) | `world.troy_citadel` | 46 doorstep flights stacked up bank faces to doors the bank makes unreachable (`structures/doorsteps.ts`). |
| *(control)* | `world.troy`, `p3-c5` — the walked-**good** Troy | 59 walls over 1,857 columns, 15 banks, 303 unfaced (**105 tallDrop**), **713 columns graded as bank**. The good world has the same defect at a third of the scale. This matters for §6's blast radius: fixing this moves a world Kai liked. |

### 4.0a The eight mechanism facts, each checkable

**M1 — every "no" lands on one word.** `treatmentForEdge`
(`layout/levels.ts:518`) computes `soft = ctx.side === "fill" ? "bank" : "rock"`
and returns it from rules 4 and 7; rule 5 returns `"replan"` on the fill side,
and `treatmentForSeam` (`levels.ts:340`) collapses `"replan"` to `"bank"` in its
next line because "there is no planner still running". Four different findings,
one construction.

**M2 — the good answers are gated on a field one form produces.**
`buildRetainingWalls` sets `const planned = district.plannedEdges !== undefined`
(`structures/retaining.ts:511`) and that flag gates three things at once: whether
`edgeContextOf` runs at all (`:557`), whether a tall bank is **benched**
(`:582` — `const bench = (context !== null && record.drop > RETAIN_MAX) ||
overCeiling`), and whether the `transitions by context (§5)` note fires
(`:1013`). `plannedEdges` is attached at `layout/district.ts:1598`, and only when
`planned = plan.strips` is defined (`district.ts:1088`) — which only
`layout/forms/hillside.ts:1048`'s `cutEdges` produces. Troy's citadel is
`fabric: "grown"`, `ground: "stepped"`: no strips, so **the whole of §5 is off**,
and the proof is in the log — `p3-tie2/generate.log` carries the `multi-level
ground` note and does **not** carry the `transitions by context` one. WP-3 built
the right machinery and shipped it hillside-only.

**M3 — an unbenched bank is 45°.** `gradeBank` (`retaining.ts:2170`) sets
`const steps = benched ? benchedRun(drop) : drop` (`:2230`) and targets
`top - ring - 1` — one block of fall per column of run. §3.2 of this document
already names that ratio as the one `APRON_RUN_PER_BLOCK = 2` was chosen
*against*: "one is a 45° bank and still reads as cut". An eight-block drop over
a 73-column contour therefore becomes eight columns of raw earth at 45°, painted
in `ground.bank` and reported as a success.

**M4 — drop 8 exists because the election allows it.** `derivePlatforms`
(`layout/platforms.ts:79`) splits a block whose relief exceeds `FLOOR_HEIGHT` by
bucketing the **blurred** field (`:132`), and then gives each piece the level
`storey(base, medianOf(piece, heightAt))` — the **raw** median (`:142`). The
partition and the level are two different quantities measured off two different
fields, so two 4-adjacent pieces one bucket apart can be two storeys — eight
blocks — apart. Six of Troy's seams are exactly drop 8, which is
`2 · FLOOR_HEIGHT`. Nothing anywhere asks what a platform pair will cost at its
boundary before electing it.

**M5 — slivers stay natural, inside levelled ground.** `platforms.ts:141` drops
a piece under `MIN_PLATFORM_COLUMNS = 9` with a bare `continue`; the columns keep
`NO_PLATFORM`, and `levelSeams` states that "natural ground (−1) is not a
platform and takes part in no seam" (`levels.ts:210`). So a nine-column sliver in
the middle of a block that everything around it levelled keeps its natural
height and gets no face. That is the pirate haven's stubs and the "quarry-garble
grass pillars" of the padfix walk.

**M6 — a short run is refused a wall and then graded anyway.** Forty-seven of
Troy's fifty-six refusals are runs of five columns or fewer, and twenty-one of
those are a *single* column. `MIN_RETAIN_RUN` is right to
refuse a wall there (`levels.ts:98` — "a masonry face taller than it is long is
a buttress nobody asked for"), and then `gradeBank` spreads `drop` rings of fill
out of a one-column seam, which is a mound. The refusal is correct; the
fall-through is not.

**M7 — the reachability rule was never built.**
`docs/COURTYARDS-AND-LEVELS-v0.md` §3.5 specifies three steps — the form's own
connections, **derived stairs** over a platform adjacency graph capped at
`MAX_DERIVED_STAIRS = 12`, and **dissolve what is still orphaned**. Steps 2 and
3 exist nowhere in the tree: `MAX_DERIVED_STAIRS` has no definition, and
`LOAM-W410 LEVEL_DISSOLVED` is declared at
`packages/spec/src/terrain/diagnostics.ts:637` and **has never been emitted**.
So nothing has ever guaranteed that a platform is reachable, and `buildDoorsteps`
(`structures/doorsteps.ts:124`) — the one pass that ever tries to get from the
ground to a threshold — is left to discover the problem per door, with six
columns of reach and no idea what it is climbing. Hence 46 flights up a bank.

**M8 — the parapet never fires, and that is a different round.** Every battery
world reports `0 parapeted` (`p3-tie2`, `p1-tie2`, `p4-final`), because
`railRun`'s `RAIL_ACCESS_RANGE` (`retaining.ts:1277`) requires somebody able to
walk up to the wall top. GROUND-CONTRACT §13.8 already recorded this. It is real
and it is **not** this work package's.

## 4.1 The laws

Twelve, in the GROUND-CONTRACT style. They are stated so a wave that violates
one is visibly wrong.

### S1 — a seam is served, never refused

> **Every seam column leaves `buildRetainingWalls` with exactly one named,
> *built* treatment: a kerb, a wall, a **tier stack**, a **landform bank**, the
> hill's own rock, or a building's own back. There is no seventh answer and no
> null answer.**

`"bank"` stops being the fall-through of five different rules and becomes one
deliberate construction with its own preconditions (S8). The refusal *reasons*
survive — `UnfacedReason` (`retaining.ts:322`) is a true and useful accounting
and is not deleted — but each now names which construction was chosen, not which
one was skipped.

Reporting follows the same reversal. `LOAM-W411 RETAINING_REFUSED` is retired as
a warning and replaced by `LOAM-I412 SEAM_SERVED`, one note per quarter naming
what every seam *became*. A new `LOAM-W413 SEAM_UNSERVED` survives for the only
honest refusal left: a seam whose chosen treatment could not be physically placed
because a street, a footprint or water owns the ground. Fifty-six warnings that
say "we did the other thing" is a report nobody can act on; one note that says
"12 walls, 6 stacks, 3 banks, 41 absorbed" is.

### S2 — `RETAIN_MAX` is a ceiling on a face, not on a drop

> **A drop of `D` is served by `ceil(D / RETAIN_MAX)` faces, each at most
> `RETAIN_MAX` tall, stacked with a tread between them. `RETAIN_MAX = 6` is
> unchanged and still means what `levels.ts:71` always said it meant — the
> tallest face that reads as *built* rather than as a cliff with a coping on it.**

This is the whole answer to the tallDrop half of the finding, and it is the
hill-town look Kai ratified: *flattened terraces following the hill's shape*
(`memory: hill-town-aesthetic-calibration`). The arithmetic is already in the
file — `benchedRun` and `BENCH_FACE` (`levels.ts:387`, `:402`) do exactly this
for a *soil* bank. S2 says masonry gets the same treatment, at the masonry
face height.

### S3 — the stack is bounded, and past the bound the election was wrong

> **`SEAM_TIER_MAX = 3`. A seam whose drop needs more than three faces is not
> served by a taller stack; it is fed back to the level election (S6), which
> gives one of the two platforms its level back. Eighteen blocks is a
> three-storey retained face and it is the most a town builds without becoming
> a dam.**

This is where "refusing the LEVEL election instead" belongs, and it belongs
*here* rather than as an alternative to terracing: terracing serves the drops a
town actually produces, and the election is the backstop for the drops it should
never have produced. `treatmentForEdge`'s `"replan"` (`levels.ts:549`) finally
has a caller that can act on it.

### S4 — a tread is the tier's own ground, and it is walkable

> **`SEAM_TREAD = 3` columns. Each tier's tread is levelled and declared exactly
> as the platform it is — at the existing `retaining.seam` / `retaining.skirt`
> classes, ranks 60 and 70 — so a later pass may not pull the ground out from
> under it, which is the `unsupported.chain` finding that survived four rounds
> (`retaining.ts:780`).**

Three, not `BENCH_TREAD`'s two: two columns of soil between two faces of earth
is a bank profile, and a tread you are meant to stand on with a two-column
balustraded ledge is a parapet walk nobody asked for. Three is the width the
flora pass can plant and a body can turn on.

### S5 — one arithmetic, two dressings, chosen by pressure

> **The tier stack's geometry is identical wherever it is built. Its *dressing*
> is chosen by `EdgeContext.pressedShare` against `EDGE_PRESSED_SHARE`
> (`levels.ts:486`):**
>
> - **at or above it, the stack is `revetted`** — each tread is `SEAM_SETBACK = 1`
>   column of coping, and the stack reads as **one battered wall with setbacks**;
> - **below it, the stack is `terraced`** — each tread is `SEAM_TREAD` columns of
>   the theme's `ground.bank` earth, planted, and the stack reads as **a hill
>   town's terraces**.

This is the direct answer to Kai's Troy verdict. A citadel face is pressed on
both sides by construction — that is what a citadel is — so it gets the
monumental reading, which is what a great wall with setbacks is. A mid-town face
with open hillside beyond it is unpressed, so it gets stepped earth you can
plant, which is the answer §5.2 rule 3's inversion was written for and which has
never once run on a quarter that shipped (M2).

The two dressings also resolve the run-budget problem, and this is not a
coincidence: a revetted stack costs `tiers · (1 + SEAM_SETBACK)` columns of run
and always fits where a single wall fitted, while a terraced stack costs
`tiers · (1 + SEAM_TREAD)` and needs room. So **where `availableRun` cannot pay
for the terraced stack, the stack is revetted** — the geometry never fails for
want of ground, it only changes what it is made of.

### S6 — the election answers for its own seams

> **`derivePlatforms` may not elect a platform pair whose seam it would not pay
> for.** Three consequences, in order:
>
> 1. **A piece's level comes from the bucket that defined it.** `platforms.ts`
>    partitions on the blurred field and levels on the raw median (M4); under S6
>    it does both from one quantity, so two 4-adjacent pieces can never be more
>    than one storey apart and drop 8 stops being expressible.
> 2. **A sliver merges rather than staying natural.** A piece under
>    `MIN_PLATFORM_COLUMNS` joins the neighbouring piece it touches most, ties to
>    the lower — instead of `platforms.ts:141`'s bare `continue`, which leaves
>    natural ground inside levelled ground (M5).
> 3. **A pair past `SEAM_TIER_MAX · RETAIN_MAX` dissolves.** The higher piece
>    gives its level back to the lower. This is `COURTYARDS` §3.5 step 3, moved
>    from a post-hoc repair to the election, and it finally fires the
>    `LOAM-W410 LEVEL_DISSOLVED` that has been declared and silent since the code
>    was written (M7).

Rule 1 is the load-bearing one and it is four lines. Rules 2 and 3 are the
honest degradation: **the quarter ships with fewer levels rather than with a
level nothing can serve.**

### S7 — a short run is absorbed, never graded

> **A seam shorter than `MIN_RETAIN_RUN` gets no treatment of its own. Its
> columns join the treatment of the longest seam any of them is 8-adjacent to;
> where there is none, the columns are given back — the platform field is edited
> so they belong to the lower platform — and nothing is graded.**

A one-column seam that spreads a five-ring bank is a mound in a garden (M6). The
absorption runs in `levelSeams` (`levels.ts:218`), after the 8-connected
components are built and before `treatmentForSeam` is asked, so every consumer
sees one list of seams that are all worth serving. `MIN_RETAIN_RUN`'s 2026-08-05
measurement is unchanged and gains a third duty, alongside the two it already
has (the wall bar, and the composite gate's bar at `overCeilingRun`,
`retaining.ts:2080`).

### S8 — a bank is a landform, and a landform carries nothing

> **Where soft is right — fill side, `pressedShare ≤ EDGE_PRESSED_SHARE`,
> `availableRun ≥ bankRun(drop)` — the bank is graded at `APRON_RUN_PER_BLOCK`
> (1:2), not 1:1; it is finished in the theme's bank earth as it is today; and
> it is **published** as `RetainingPassResult.bank`, a column mask. Nothing may
> terminate on it: no doorstep flight, no stair, no path.**

A door that opens onto a bank keeps a plain sill and the physics lint reports it
as unreachable, **which it honestly is** — the same argument
`structures/doorsteps.ts:86` already makes for its own refusal. Building
decorative masonry up a slope to a door you still cannot use is worse than the
missing step.

*One ledger note, and it must travel with this law.* GROUND-CONTRACT §13.10.3
says WP-10's bed skirt becomes redundant *if and only if* `gradeBank` is re-keyed
from 1:1 to the lift-keyed ratio. S8 is that re-key — but the skirt is **not**
deleted here and must not be, because nothing yet reads `resolved.transitions`
to build (§3.2 fact 1), so the skirt's columns are not `gradeBank`'s columns.
S8 is the *precondition* WP-6 was waiting for, not the deletion.

### S9 — a served seam publishes its landings, and the stair belongs to the seam

> **A tier stack's treads, and a wall's own top and foot, are its **landings**,
> returned as `RetainingPassResult.landings`. A stair through a served seam is
> cut at the seam — one flight per stack, at the tread column nearest a street
> column on each side, `STAIR_PROFILE` width — and registered in the street graph
> as a `role: "steps"` segment **before surfacing**.**

This is `COURTYARDS` §3.5 step 2, built at last, and it deliberately adds no new
stair code: registering the segment before surfacing puts it through
`structures/street-stairs.ts`'s existing tread law
(`need[k] = max(g[k] + 1, need[k+1] − 1)`) and its whole-run refusal, which is
the machinery §2.3 built and which already knows that half a staircase ending in
a two-block hop is worse than no staircase. Capped at `MAX_DERIVED_STAIRS = 12`
per quarter, exactly as §3.5 sizes it, because `intersectionsOf` is O(n²) in
segments.

### S10 — a door above a seam is reachable, or it is not a door

> **A doorstep flight may terminate only on a landing (S9), a street column, a
> platform, or natural ground within `DOORSTEP_FOOT_STEP` of the flight's foot.
> It may never terminate on a bank face (S8) or on a wall face.**

This is the **complement** of the foot gate the parallel wave is adding to
`structures/doorsteps.ts` — `DOORSTEP_FOOT_STEP` and `DoorstepResult.refused`,
whose own doc comment already names this exact case: *"two or more is a bank face
— the LOAM-W411 case, a terrace seam refused its retaining wall and graded raw —
and a flight laid up a bank face is the 'stairs to nowhere' a walkthrough
reported"*. That wave says where a foot may **not** land. S9 is what makes a
legal foot **exist**, and S10 is the one line that joins them: the gate consults
`landings` and `bank` instead of guessing from ground heights. **This work
package extends that gate and never rewrites it** — whichever lands second reads
the other's constant.

### S11 — a wall circuit crossing a seam is a client, not a second answer

> **`structures/walls.ts` sweeps a fortification course on its own 1-Lipschitz
> datum and fills each column down to ground (`WALL_MAX_FILL = 18`), so where a
> circuit crosses a level change the wall material *is* the face. This round
> **measures** that crossing and reports it as `LOAM-I415
> WALL_COURSE_CROSSES_SEAM`; it does not move the circuit.**

The eight sheer faces of drop 14 the Troy audit attributed to walls are this,
and `LOAM-I524 WALL_FOOTING_DEEP` already half-reported it on the same world
("sank its footing 0.3 courses on average and 9 at the deepest… the deep stretch
stands as a sheer pier of wall material, not as a wall on the ground",
`walls.ts:721`). Promoting a circuit's crossing to a tier stack is a real
feature and it is deliberately **not** in this package: the measurement is what
decides whether it is worth building, exactly as §3.1's viaduct note does for
WP-10C. The same measurement covers the `infra.entry` case §3.1's forensics
flagged — *"a `retaining.seam` requires a seam"*.

### S12 — reach and determinism

> **A document with no `"stepped"` quarter, no `terraced` form and no
> site-planned quarter compiles byte-identically.**

Terrain-only worlds, `terrarium`, `devworld`, every farm and scatter-only world:
not one byte. Everything above is a pure function of the platform field and the
finished plan — no RNG, no clock, every component walk row-major, every tie
broken on region index, exactly as `levelSeams` (`levels.ts:310`) and
`skirtSeams` (`retaining.ts:1980`) already do it. The `boxBlur` in
`platforms.ts:225` stays an integer box filter.

## 4.2 The tier stack, concretely

One function and one loop; nothing about the sweep changes.

```
tiersOf(drop) -> [{ face, tread }]      // layout/levels.ts
  n     = ceil(drop / RETAIN_MAX)              // S2
  if n > SEAM_TIER_MAX -> "replan"             // S3
  faces = drop split as evenly as possible, tallest at the BOTTOM
  tread = revetted ? SEAM_SETBACK : SEAM_TREAD // S5
```

Tallest at the bottom because that is how a retained hillside is actually built
and how it reads: the load is at the base. A drop of 8 becomes faces of 4 and 4;
a drop of 11 becomes 6 and 5; a drop of 14 becomes 5, 5, 4.

`buildTieredSeam` (`structures/retaining.ts`) then runs the **existing** wall
construction once per tier, bottom up:

1. the tier's face course is the seam's own cells for tier 0, and the previous
   tier's tread for tier *k*;
2. `thickenCourse` → `chainsOf` → `orient` → `sweep(RETAINING_PROFILE)` →
   `deepen(plan, k, face)` → the coping structure block — every one of these is
   called today at `retaining.ts:743`–`:909` and none of them changes;
3. the tread behind the face is declared as a `face` + `preserve` pair at the
   tier's own level, which is what S4 requires and what `retaining.ts:798`'s
   `commit` already builds;
4. `railRun` is called **on the top tier only** — a balustrade on every tier is
   a battlement, which is the reading `RETAINING_PROFILE`'s own comment warns
   about;
5. `facesByDrop` counts every tier's face, so GROUND-CONTRACT §13.8's histogram
   keeps its invariant — **no bucket past `RETAIN_MAX` is ever occupied** —
   and now keeps it by construction rather than by conversion.

`overCeilingRun`'s composite gate (`retaining.ts:2086`) is unchanged and gains a
better answer: today a composite past the ceiling converts a wall to a benched
bank; under S2 it converts a wall to a **stack sized for the measured face**,
which is the same measurement spent on a better construction.

## 4.3 What changes, file by file

| file | change | wave |
| --- | --- | --- |
| `structures/retaining.ts:582` | `bench` loses its `context !== null &&` — a tall bank is benched on every quarter, not only a hillside one | 11A |
| `structures/retaining.ts:511`, `:557` | `edgeContextOf` runs for every district with `levels`; `plannedEdges` keeps only its cut-edge duty (`:518`) and its §5.5 error (`:972`) | 11A |
| `layout/levels.ts` | `SEAM_TIER_FACE` (= `RETAIN_MAX`), `SEAM_TIER_MAX`, `SEAM_TREAD`, `SEAM_SETBACK`, `tiersOf`, `SeamTreatment` gains `"tiered"`; rule 5 returns it; `absorbShortSeams` in `levelSeams` | 11B, 11D |
| `structures/retaining.ts` | `buildTieredSeam`; `landings` and `bank` on `RetainingPassResult`; `gradeBank` re-keyed to 1:2 | 11B, 11D |
| `layout/platforms.ts:132`,`:141` | level from the bucket; sliver merge | 11C |
| `layout/district.ts` | dissolve past `SEAM_TIER_MAX · RETAIN_MAX` (fires `LOAM-W410`); platform adjacency graph; derived `steps` segments before surfacing | 11C, 11E |
| `structures/doorsteps.ts` | the foot gate reads `landings` / `bank` — **extends** the parallel wave's `DOORSTEP_FOOT_STEP`, never rewrites it | 11E |
| `structures/walls.ts` | S11's measurement only: the course's footing against the quarter's platform field, as `LOAM-I415` | 11E |
| `layout/types.ts` | `export const SEAM_TIERS = false;` beside `FRONTAGE_TIE` | 11A |

## 4.4 Waves

Same shape WP-8 used and for the same reason: everything lands behind one
compile-time flag, so every wave before the flip is provably byte-identical and
the flip is a single walk verdict.

- **11A — the honest refusal.** `opus-5-low`. The two edits in
  `structures/retaining.ts` above, plus the flag. Tests: a `"stepped"`
  non-hillside quarter now emits the `transitions by context (§5)` note; a
  drop-8 seam on a `grown` quarter is benched; `test/ground-equivalence.test.ts`
  proves flag-off identity, **after** proving the harness can see a difference.
- **11B — the tier stack.** `opus-5-medium`. `tiersOf` and `buildTieredSeam`;
  new `test/seam-tiers.test.ts`. Assertions: the §13.8 histogram has nothing past
  `RETAIN_MAX`; a stack's treads are declared and survive a later `verge` write;
  a revetted stack fits in the run a single wall fitted in.
- **11C — the election pays for its seams.** `opus-5-low`. S6's three rules in
  `layout/platforms.ts` and `layout/district.ts`; `LOAM-W410` fires for the first
  time. Tests: `test/platforms.test.ts` — no 4-adjacent pair more than one storey
  apart, no piece under `MIN_PLATFORM_COLUMNS` left at `NO_PLATFORM`.
- **11D — absorption and the landform bank.** `opus-5-low`. S7's
  `absorbShortSeams`; S8's 1:2 re-key and `bank` mask. Tests:
  `test/seam-runs.test.ts` — no seam shorter than `MIN_RETAIN_RUN` reaches the
  pass; a bank's fall is 1:2 at every ring. **Carries the §13.10.3 ledger note.**
- **11E — the seam stair and the reachable door.** `opus-5-medium`. S9's derived
  stairs, S10's gate extension, S11's measurement. Tests:
  `test/doorsteps.test.ts`, `test/street-stairs.test.ts` — every platform is in
  the street network's component or was dissolved; no flight's foot lands on a
  `bank` column.
- **11F — the flip.** `SEAM_TIERS = true`, on Kai's walk verdict and nothing
  else.

**Concurrency.** 11A and 11C touch disjoint files and run together. 11B and 11D
both edit `layout/levels.ts` and `structures/retaining.ts` and must be
sequenced — 11B first, since 11D's `absorbShortSeams` runs upstream of a
treatment table 11B changes. 11E is last. No implementer spawns a subagent.


---

## 5. Non-goals

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
9. **No contour-led platform election.** `derivePlatforms` stays block-led — the
   argument in `layout/platforms.ts`' own header ("contours are `terraced`'s idea
   and this has to work under `grid`, `grown` and `radial` too") is unchanged.
   S6 only *refuses* an election; it never redraws one. A contour-following
   election is a rewrite and is WP-12 at the earliest.
10. **No change to `RETAIN_MAX`, `MIN_RETAIN_RUN`, `RETAIN_RAIL`,
    `FLOOR_HEIGHT` or `MIN_PLATFORM_COLUMNS`.** GROUND-CONTRACT §13.8 measured
    the first three on 2026-08-07 and they stay. WP-11 changes what they *mean
    at a seam*, not what they are — and note 3 above still holds: the drop
    table is not moved, it is given more answers to return.
11. **No parapet work.** `RAIL_ACCESS_RANGE` is why every battery world reports
    `0 parapeted` (§4.0a M8). Real, recorded, not this package's.
12. **No promotion of a fortification circuit or an `infra.entry` course to a
    tier stack.** S11 measures; a later round decides.
13. **No deletion of WP-10's bed skirt.** S8's 1:2 re-key is the *precondition*
    GROUND-CONTRACT §13.10.3 names, not the deletion; deleting the skirt before
    a transition consumer exists reinstates the berm.

---

## 6. Risks

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
| **WP-11 moves a world Kai liked.** `p3-c5`'s walked-good Troy carries 105 `tallDrop` columns and 713 banked ones (§4.0), so the fix changes it too. | every world with a `"stepped"` or `terraced` quarter: Troy (p3-c5, p3-tie2), the pirate haven (p1), `unicorn_citadel` (p1-tie2), `ruined_metropolis` (p4), and the examples `site-plan-hillside`, `site-plan-hillside-steep`, `showcase-aerodale` | One flag, `SEAM_TIERS`, flipped once at 11F on a walk verdict — the WP-8 shape. Every wave before it is proved identical by `test/ground-equivalence.test.ts`, and the standing rule applies: **prove the harness can see a difference before trusting that it saw none.** The p3-c5 Troy is re-generated at the flip and walked *beside* p3-tie2, so the comparison is like for like. |
| **11C is the biggest blast radius in the package.** Changing `derivePlatforms`' levels changes `foundationY` for every building on a derived platform (`district.ts:1472`), not just the ground between them. | every settlement that elected `"stepped"` via `STEP_RELIEF` | Behind the same flag; asserted structurally rather than by golden — no 4-adjacent platform pair more than one storey apart, no piece left at `NO_PLATFORM` inside a levelled block — so the test states the law rather than pinning a hash. |
| **The report changes even where the world does not.** Firing `transitions by context` on every stepped quarter moves report bytes at 11A, and retiring `LOAM-W411` for `LOAM-I412` moves more at 11F. | every compile report, the battery logs | Report goldens are re-measured **with the cause written down**, never updated silently (§9a.5's rule). A world hash that moves at 11A is a bug, not a golden update. **Amended at 11F:** the retirement is built as a flag, not as a deletion — 11A/11B left `LOAM-W411` firing on the untiered path only, and the flip empties that path, so the warning goes to zero at 11F rather than at 11A. Measured on the flip: 0 on Troy (p3-tie2) and 0 on the pirate haven, where it stood at 56 and 36. |
| **A tier stack eats run the town wanted.** A terraced stack costs `tiers · (1 + SEAM_TREAD)` columns. | dense quarters on steep ground | S5's fallback is structural, not a tuning: where `availableRun` cannot pay, the stack is revetted at `1 + SEAM_SETBACK` per tier, which always fits where a single wall fitted. Rule 6's `depthAfter` / `MIN_EDGE_DEPTH` guard is unchanged and still returns `"replan"` — now to a caller (S3) that can act on it. |
| **The doorstep gate is edited by two waves at once.** The in-flight foot-gate wave and 11E both touch `structures/doorsteps.ts`. | one file, one round | S10 is written as an *extension*: whichever lands second reads the other's constant (`DOORSTEP_FOOT_STEP`) and adds a source of truth (`landings`, `bank`) rather than a second rule. The orchestrator sequences them; neither reverts the other's lines. |

---

## 7. Diagnostics this work adds

| code | name | severity | feedback set | fires |
| --- | --- | --- | --- | --- |
| `LOAM-T237` | `FRONTAGE_TIE_DRIFT` | note | no | the surfacer's final level departs from the datum by ≥ 1 at ≥ 1 station of a segment |
| `LOAM-T238` | `FRONTAGE_UNTIED` | note | no | a district's lots were seated with no datum in reach — the fabric drew a street the datum could not grade |
| `LOAM-T239` | `ROAD_BERM_CLAMPED` | note | no | W2's cap bound; names the stations and the height it wanted |
| `LOAM-W340` | `PROGRAM_DID_NOT_CONFORM` | warning | **yes** | the gate's suite verdict is false; names which members and which finding |
| `LOAM-T341` | `PROGRAM_SEATED_PAD` | note | no | an instance was padded because its program did not conform |
| `LOAM-T342` | `PROGRAM_CONFORM_RESIDUAL` | note | no | per node: columns underpinned, columns buried, as a fraction of occupied |
| `LOAM-I412` | `SEAM_SERVED` | note | no | once per quarter: what every seam became — walls, tier stacks (revetted / terraced), banks, kerbs, absorbed, dissolved |
| `LOAM-W413` | `SEAM_UNSERVED` | warning | no | a seam whose chosen treatment could not be *placed* — street, footprint or water owns the ground. The only honest refusal left (S1) |
| `LOAM-I414` | `SEAM_STAIR_CUT` | note | no | S9's derived flights: how many, and how many the `MAX_DERIVED_STAIRS` cap refused |
| `LOAM-I415` | `WALL_COURSE_CROSSES_SEAM` | note | no | S11's measurement: a fortification course or `infra.entry` ring whose fill stands as a face across a platform boundary, with the deepest crossing |
| `LOAM-W410` | `LEVEL_DISSOLVED` | warning | no | **already declared** (`diagnostics.ts:637`) and never emitted; S6 rule 3 fires it for the first time |

`LOAM-T237`–`T239` continue the `T23x` block that ends at `LINEWORK_BED_INTERRUPTED`;
`LOAM-W340`–`T342` continue the program block that ends at `PROGRAM_WATER_CLAMPED`.
`LOAM-I412`–`I415` continue the level/seam block that ends at
`RETAINING_REFUSED`; `LOAM-W411` itself is **retired at the flip, 11F**
(§4.1 S1) and its number is not reused. *(Amended at 11F, which is when the
retirement was measured. This row read "retired at 11A". Waves 11A and 11B
deliberately implemented the retirement the way every other world change in
Part IV was implemented — behind `SEAM_TIERS` — so `LOAM-W411` keeps firing on
the untiered path, which is the only path where a bank really is a wall that
failed, and the flip empties that path. Retirement by the path going dark, not
by deletion: the warning is still the right report for a world compiled with the
flag off, and there is nothing left to delete once no world compiles that way.)* Only `W340` enters `FEEDBACK_CODES`, and §2.5 argues why it
is the exception to §13.6's precedent rather than a violation of it.

---

## 8. Walk gates — which steps change what a world looks like

The standing manual-critique law: a look is never tuned without Kai's walk. It
does **not** stop the next ratified thing from being built (standing rule: never
wait on Kai). So the split is explicit.

**Land without a walk** — machinery, byte-identical or provably reach-limited:
8A, 8B, 8C, 8D, 8E, 9A, 9B, 9E, 10B, **11A, 11B, 11C, 11D, 11E**. Every one of
these either changes nothing that ships or is gated behind a flag or an absent
record field.

**Land only on a walk verdict:**

| step | what Kai is judging |
| --- | --- |
| **8F** — flip `FRONTAGE_TIE` | the tie itself; `FRONTAGE_RISE` 0 vs 1; the rear terrace against the hill; whether corner lots taking the lower street reads right |
| **9C** — the re-authored battery | conforming instances on real ground vs the platforms they replace; whether `pad` fallbacks look wrong beside them |
| **9D** — the carve | whether burial is visible enough to justify cutting |
| **10A** — the berm cap | only if the measurement is ambiguous; a berm removal is a defect fix, not a taste call |
| **§13.2e** — the wall's benched course | **answered by S2, pending the same walk.** A face at exactly `RETAIN_MAX` is one tier and gets no mid-bench; a face past it is a stack. GROUND-CONTRACT §13.8's deliberately-open question ("should a six-block wall carry a mid-bench") is closed *in principle* by the tier arithmetic and confirmed *in fact* at 11F |
| **11F** — flip `SEAM_TIERS` | the whole of Part IV: whether the citadel face now reads as a great wall with setbacks rather than a bank; whether mid-town seams read as plantable terraces; `SEAM_TIER_MAX` 3 vs 2; `SEAM_TREAD` 3 vs 2; whether the derived stairs land where a person would put them |

**Blocked on measurement, not on Kai:** 10A on the forensics berm numbers, 9D on
`LOAM-T342`, 10C on `LOAM-T239`, and the S11 promotion on `LOAM-I415`.

---

## 9. Ledger

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
| **WP-11** | **the served seam** | Part IV, waves 11A–11F | nothing; independent of WP-8 and WP-9. 11E coordinates with the in-flight doorstep foot gate (S10). Closes §3.2's ledger item *"what does a refused `tallDrop` become"* and `COURTYARDS` §3.5 steps 2 and 3 |

---

## 10. Open questions — the ones only Kai can answer

Each has a recommendation, so a wave is never blocked on an answer.

**10.1 `FRONTAGE_RISE`: flush, or one plinth course?** 0 puts the threshold one
block above the pavement (a doorstep). 1 puts a visible plinth course under
every shopfront, which is period-correct for a lot of architecture and wrong for
a village. *Recommendation: 0, and ask on the 8F walk.* It is one constant and
one recompile.

**10.2 Should a corner lot take the lower street, or the front street
regardless?** F5 says the lower when they differ by more than 2. The alternative
— always the front, and let the flank do whatever it does — is simpler and
occasionally puts a side door two blocks below its own pavement.
*Recommendation: the lower, as written; revisit on the walk.*

**10.3 Does `drape` retire?** Under `conform` it is `conform` minus the re-seat.
Keeping it costs a union member and a row; retiring it breaks any archived
document that wrote it. *Recommendation: keep, deprecate in the kit, retire only
if no shipped document uses it.*

**10.4 Should a non-conforming program be visible in the world, or just in the
report?** `LOAM-T341` says which instances are on platforms. The stronger option
is to refuse to scatter a non-conforming program on steep ground at all, which
costs instance counts. *Recommendation: report only; leniency is permanent and
this is a look, not a break.*

**10.5 Is a re-authored battery worth a second $2 run if the first one's conform
rate is low?** WP-9C stamps verdicts; if most programs still score `false`, the
prompt change did not land and the honest next move is a prompt iteration rather
than another sweep. *Recommendation: measure the rate at 9C, report it, and let
Kai decide whether to spend again.*

**10.6 `SEAM_TIER_MAX`: three tiers (18 blocks) or two (12)?** Three serves every
drop Troy's citadel actually produced (8) with room to spare and lets an 18-block
change of level stand as architecture. Two dissolves more levels and ships
flatter, simpler quarters. *Recommendation: 3, and look at the tallest stack on
the 11F walk — it is one constant and one recompile.*

**10.7 `SEAM_TREAD = 3` for the terraced dressing, `SEAM_SETBACK = 1` for the
revetted one?** Three is a tread a body turns on and the flora pass can plant;
two is `BENCH_TREAD`, which is a bank profile. One column of setback per tier is
what makes a battered wall read as one wall rather than as a staircase.
*Recommendation: 3 and 1; both are Kai's on the walk, and the pair is the whole
of the hill-town-vs-citadel look.*

**10.8 Should the citadel's own fortification circuit be promoted to a tier
stack (S11)?** Today it sweeps its own datum and fills to ground, so where it
crosses a level change the wall material *is* a 14-block sheer face. Promotion
would make the circuit and the seam one construction; it is also a real
possibility that a rampart standing proud of a dip is exactly right and the
finding is a taste call. *Recommendation: measure only this round (`LOAM-I415`),
decide on the 11F walk with the number in hand — the same discipline WP-10C uses
for viaduct promotion.*

**10.9 When a seam dissolves (S6 rule 3), should the quarter say so loudly?**
`LOAM-W410` is a warning and enters no feedback set, so the authoring model never
learns that its terrain asked for a level the town could not serve.
*Recommendation: keep it a warning and out of `FEEDBACK_CODES` for now — the
land-budget feedback diagnostic already in flight is the right place for that
signal, and two passes telling a model about the same hill is how a prompt gets
noisy.*
