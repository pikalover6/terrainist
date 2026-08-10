# Ruins Plan v0 — district ruins treatment (SHIP-PLAN F19)

> **STATUS: RATIFIED 2026-08-09, with one amendment** — the survivor cap is
> removed (total desolation at `decline = 1.0`; §4.1 and Q2 record the
> ruling) and bare `ruin`/`ruins` tags resolve to `ruined_cottage` (Q3).
> Written to be built from cold. Nothing here changes any existing world — see
> §2, the reach law.
>
> **Scope is SHIP-PLAN §8.3, row F19:** *at high `decline`, a district's lots
> roll deterministically into their ruined-variant shells (the ruin law: the
> ordinary shell fit-out decayed), with rubble/overgrowth interleave; the kit
> teaches "ruined city = district + decline".* §13 names every exclusion; the
> most important one is that **this is not damage** — battle, fire and siege
> are `event.*`, a different mechanism, and P5's invasion does not ride this.
>
> Companions: `docs/kits/settlement-author.md` table 14 (**THE RUIN LAW**, and
> the five relics that implement it), `packages/stdlib/src/structures/
> archetypes-relic.ts` (today's implementation — the five moves, the two
> guarantees, the crumble line), `docs/DESIGN.md` (the open-defect entry
> "'Ruins of a city' cannot be said", the intent fan-out, the land-use clamp),
> `docs/FLORA-GRAMMAR-v0.md` §2 and WP-A (the *re-express the legacy through
> the engine and prove it list-identical* pattern this document copies).

## 1. The finding, and what it costs

From the S2 battery wildcard walk (2026-08-09; Kai's ruling: ledger, do not
hotfix):

> The prompt *"overgrown ruins of a once-great city"* authored as one
> `ruined_keep` + four `collapsed_tower`s + a road grid — the kit's entire ruin
> vocabulary is the five wave-6E relics, and **decline has no building story at
> district scale**: the intent fan-out drives road wear, ground decay and
> vegetation reclaim, but no mechanism rolls a district's lots into their
> ruined-variant shells. Luna's sparse answer was the best sentence the
> language can say.

This is the third ruins-flavoured finding (the W483 request, table 14's own
open question, this walk), and it is a *language* gap rather than a builder
gap. Everything needed to ruin a building exists and is tested; what does not
exist is any way for the word "ruins" to reach more than one building at a
time.

The battery's P4 (*"A high-tech apocalyptic hideout in the massively overgrown
ruins of a metropolis."*, seed 304) asserts:

> the ruins read as a once-metropolis: **street-grid remnants and ruined
> district fabric at city scale, not scattered relics**; overgrowth
> dominates — reclaim vegetation over and through the fabric.

"Not scattered relics" is the whole brief in three words. A relic is a building
you walk up to. A ruined city is a place you are inside of, and the difference
is a *share* of the fabric, not a *count* of monuments.

## 2. The reach law (byte-identity)

**A document that declares no `decline` — and no explicit `params.decay` —
compiles byte-identically to today.** Enforced as always: the harness of
`docs/GROUND-CONTRACT-v0.md` §12, comparing decompressed chunk NBT, on the
twelve control worlds.

Three consequences that shape the work:

- The new fan-out row `decay.ruinShare` has `today = 0`. No `decline`, no
  ruins. And `decline` below the onset (§4.1) is still exactly zero ruins, so
  every world that already carries a modest `decline` (the pirate island's
  0.6, for instance) is examined explicitly at the first WP that can move it —
  0.6 is *above* the onset, so `examples/` worlds carrying `decline ≥ 0.35`
  **will** move, and each must be justified move by move exactly as the
  hillside worlds were.
- **WP-1 changes nothing at all.** It extracts the five relics' decay into a
  reusable engine and proves the extraction by list-identity — the flora
  grammar's WP-A pattern, and the reason that pattern exists.
- The five relic archetypes keep their ids, tags, envelopes and output. They
  become the engine's five worked examples, not a second grammar. That is the
  ruin law applied to the ruin law.

## 3. The law, generalised

Table 14 states it, and it is the load-bearing sentence of this document:

> **THE RUIN LAW.** A ruined building is **the ordinary shell fit-out DECAYED,
> not a second grammar**. There is no ruin builder: the same shell is built,
> and then written over.

Today that sentence is true of five archetypes. F19 makes it true of **any**
archetype, by turning the five moves into **operators over a finished shell**
and the five relics into five parameter sets.

The two guarantees are unchanged and are extended to hold over the whole
catalog:

> **The door and its approach are never decayed** (the walking agent starts in
> the cell inside the door, and so does the traversal lint), and **every open
> interior cell stays reachable from it**. A ruin is also **cold and dry**: no
> fire, no water, no lava.

Cold and dry stops being free the moment the input is an arbitrary archetype: a
smithy has a forge fire, a bathhouse has a pool, a greenhouse has farmland and
crops. §5.5 is the general answer.

### 3.1 What is a decay *operator*

`packages/stdlib/src/structures/archetypes-relic.ts` already has the right
shape and does not know it. Its five moves are pure functions of
`FitOutContext` — `put`, `blockAt`, `interior`, `door`, `wallTop`, `roofTop`,
`size` — plus a small parameter record. Nothing in them is cottage-specific
except the parameters passed in. WP-1 lifts them into
`packages/stdlib/src/structures/decay.ts` behind one entry point:

```ts
/** Decay a finished shell in place. Runs AFTER every furnish* pass. */
export function decayShell(ctx: FitOutContext, profile: DecayProfile): number;

export interface DecayProfile {
  /** 0..1. Drives every operator's parameters through §6's band table. */
  readonly intensity: number;
  /** How the wall head is shaped. */
  readonly collapse: "even" | "structured" | "leaning";
  /** 0..1 — vines, moss, volunteer growth inside the shell. */
  readonly overgrowth: number;
  /** 0..1 — rubble heaps on the floor and spill in the apron. */
  readonly rubble: number;
  /** Restrict to the façade; for shells whose floors are structural (§5.4). */
  readonly mode?: "shell" | "facade";
}
```

The operators, in order — the same order the five moves already run in, because
the order is what keeps blocks from floating:

| # | operator | what it does | generalisation work |
|---|---|---|---|
| 1 | `crumbleWalls` | draws the crumble line per ring column, clears **from the top down** in whole runs, re-clads survivors | the re-clad becomes material-derived (§5.2); the stair-flank rule generalises (§5.3) |
| 2 | `breakRoof` | clears everything above the eave plate, then lays fragments **only** on ring columns that survived to the plate | fragment material comes from the shell's own roof role, as it already does |
| 3 | `rubble` | full blocks on the floor plane through the furniture reservation | unchanged; density from the band table |
| 4 | `spill` | grounded heaps in the apron ring | unchanged |
| 5 | `green` | vines on inside faces of survivors, moss carpet on heap tops | unchanged; share from `overgrowth` |
| — | `quench` | **new**: fire and fluid out (§5.5) | the general case's cost |
| — | `settleFixtures` | **new**: fixpoint removal of anything the decay unsupported (§5.6) | the general case's real work |
| — | `reachOrRefuse` | **new**: the interior reachability guarantee, checked rather than argued (§5.7) | |

`trimLadders` and `dropDeadLanterns` — today's two post-guards — are subsumed
by `settleFixtures` and must be deleted, not left beside it. Two mechanisms for
one invariant is how `CURB_LEVEL_TOLERANCE` happened.

## 4. The roll — how a district's lots become ruins

### 4.1 The curve, and whether buildings share the grounds' square

`themes-intent.ts` squares `decline` for `decay.coverage`, and its comment
gives the reason:

> Squared: the visual read of "half abandoned" is nowhere near half the
> buildings ruined, and a linear dial makes 0.3 look like a war.

That comment is *about buildings*, written on a row that drives ground. So the
answer to "do buildings share the curve" is **yes, and the sharing is the point**
— one dial, one curve, ground decay and building ruin rising together, which is
what makes a district read as one place declining rather than as two effects
that happened to be turned up at once.

But the square alone is wrong at the bottom, and this is the one place F19
departs from the existing row. `0.3² = 0.09`: nine percent of a kept-up town's
houses fallen in. A single ruined house on an otherwise maintained street does
not read as decline; it reads as a bug — DESIGN's first failure mode wearing a
different hat. So the curve gets an **onset**:

```ts
export const RUIN_ONSET = 0.35;      // below this, decline is wear, not ruin

export function ruinShare(decline: number): number {
  if (decline < RUIN_ONSET) return 0;
  return Math.min(1, decline * decline);
}
```

| `decline` | ruin share | what a walk sees |
|---|---|---|
| 0.0 – 0.34 | 0 | today: wear, worn paint, volunteer growth. No shell is touched. |
| 0.35 | 0.12 | the first houses have fallen in. The step at the onset is deliberate and legible: this is the value where a place stops being tired and starts being abandoned. |
| 0.5 | 0.25 | one lot in four; the street still works |
| 0.7 | 0.49 | half the street; gaps you can see through |
| 0.85 | 0.72 | a ruin field with survivors |
| 0.95 | 0.90 | a dead city, a few shells standing |
| 1.0 | 1.00 | total desolation — nothing intact |

**There is no survivor cap — ratified by Kai, 2026-08-09, overriding this
draft's `RUIN_SHARE_MAX = 0.92`.** The draft argued contrast (a ruin field
with no intact shell loses its yardstick); Kai ruled that a prompt saying
"nothing left standing" deserves literal truth, and the yardstick argument
holds anyway for every value below 1.0 — the survivors thin gradually, so
only the dial's very top is total. The decay operators still leave partial
walls at graded heights (§5), so even 1.0 is legible ruin, not bare ground.

**The register.** `decay.ruinShare`, reads `decline`, `status: "today"` with
`today = 0`, drives "the share of a district's infill lots built as ruins
(`layout/district.ts`)". Total, like every row.

### 4.2 Per-lot rolling — deterministic, positional, clustered

The draw follows `infillLot`'s discipline exactly, and for `infillLot`'s stated
reason: *"every draw is keyed on the lot's min corner, never on a counter …
which is what makes adding a landmark somewhere else in the district leave the
rest of the street exactly as it was."*

```
ruinLot(lot, block, share):
    if share == 0: return null
    cluster := positionFloat(stream, block.x0, RUIN_CLUSTER_CHANNEL, block.z0)
    local   := clamp01(share + RUIN_CLUSTER_AMPLITUDE * (cluster - 0.5))
    roll    := positionFloat(stream, lot.x0, RUIN_ROLL_CHANNEL, lot.z0)
    if roll >= local: return null
    band    := bandFor(decline, positionFloat(stream, lot.x0, RUIN_BAND_CHANNEL, lot.z0))
    return profileFor(band, archetype)
```

- `stream` is the district node's own seed stream, `hash(worldSeed, nodePath)`.
  Nothing here reads a global counter, a pass order or a wall clock.
- `RUIN_CLUSTER_AMPLITUDE = 0.5`, keyed on the **block's** min corner rather
  than the lot's. Independent per-lot rolls give salt and pepper; a real ruined
  city has whole blocks gone and pockets standing. One extra positional draw at
  block scale buys that, deterministically, for nothing. Clamped, so a block
  can lean but not invert.
- Channels: `RUIN_ROLL_CHANNEL = 41`, `RUIN_CLUSTER_CHANNEL = 42`,
  `RUIN_BAND_CHANNEL = 43`. Channels 41–49 are reserved for this feature.
  Reusing an existing channel (`2` is the archetype draw, and the prominence
  field owns others) would correlate ruin with archetype, which is a bug you
  would only find by noticing that every tavern in the world is intact.

### 4.3 Which shells ruin, and which never do

| shell | ruins? | why |
|---|---|---|
| district **infill** lots | yes, by the roll | this is the feature |
| district **children** (declared landmarks) | **no**, unless the node carries `params.decay` | a building the prompt named must never silently become rubble. DESIGN's third risk is silent feature loss, and "the model asked for a cathedral and got a heap" is its purest form. The author opts in per node. |
| **terrace** bays | yes, per bay, with the party-wall rule (§5.4) | a terraced row with gaps in it is one of the best ruin reads there is |
| **high-rise** archetypes | `mode: "facade"` only (§5.4) | a crumble line has no meaning above the eave plate of an eight-storey frame |
| shells with `wallTop < 3` | no | table 14 already says it: a crumble line drawn on a three-course wall has nothing to take away |
| **precinct** buildings, `precinct.*@0` | no in v0 | a precinct lays out a compound deterministically and does not go through `infillLot`; adding the roll there is a separate, cheap follow-up |
| **bespoke programs** | never | a program's output is the model's own geometry, hash-verified. Writing over it would break `outputHash` and is meaningless anyway. |

`params.decay` on a `building.grammar@0` node is a `0..1` scalar (the same
`intensity`), validated `LOAM-T227` out of range, and it is how an author ruins
one named thing — a broken watchtower on a ridge — without a district.

## 5. Decay on an arbitrary shell — the five reference decays, generalised

Table 14's five decays are not five models. They are three collapse shapes and
two dials, and the table itself says so if you read it as parameters:

| relic | collapse | intensity | overgrowth | rubble |
|---|---|---|---|---|
| `ruined_cottage` | `even` | 0.5 (floor 2, spread 3) | 0.35 | 0.26 |
| `ruined_keep` | `structured` (`cornersStand`) | 0.6 | 0.25 | 0.30 |
| `ruined_church` | `even`, generous | 0.4 | 0.30 | 0.24 |
| `collapsed_tower` | `leaning` (`lean > 0`) | 0.7 | 0.20 | 0.34 |
| `overgrown_villa` | `even`, gentlest | 0.3 | 0.70 | 0.22 |

WP-1's list-identity proof is exactly this table: each relic's existing
`CrumbleStyle`, cladding closure, fragment, spill block and shares must be
reproducible from `DecayProfile` + the shell's own materials, and the emitted
block list must be **identical, op for op**. Any relic that cannot be expressed
that way is a finding about the engine, not a licence to special-case it.

### 5.1 The three collapse shapes

- **`even`** — the reference. Survivor height is
  `floor + hash(cell) % spread`, floored at 1, capped at `wallTop`. It is the
  only shape that reads as *time*.
- **`structured`** — `cornersStand`: the four corners survive to the eave
  plate, the curtains between them fall almost to the plinth. It reads as
  *mass*: the thickest masonry is the last to go. Correct for anything with
  quoins, buttresses or corner towers.
- **`leaning`** — a linear lean along one axis, so the wall head slopes from a
  standing stub to nothing. It reads as *one event*, which is why the tower
  gets it: a tower falls over, it does not weather away. The lean axis is
  positional per shell, not always `+x`.

A shell's default collapse is drawn from its catalog **category** rather than
its archetype id — `defensive`/`civic`/`faith` → `structured`, `tower`-shaped
footprints (height > 2 × max plan side) → `leaning`, everything else → `even` —
with the per-lot band draw allowed to promote `even` → `structured` on a
one-in-six. One table, no per-archetype list to maintain, and a new catalog
entry inherits a sane collapse the day it lands.

### 5.2 The re-clad, and the material rule

This is the real generalisation work. Today the cottage re-clads survivors in
mossy cobblestone because a cottage is made of cobblestone. A concrete tower
re-clad in mossy cobblestone is not a ruin; it is a bug.

> **THE RE-CLAD RULE. A re-clad never invents a material. It substitutes within
> the block's own family, and where the family has no weathered variant, the
> decay takes the block away instead.**

A small, explicit `WEATHERED_VARIANTS` table over the pinned 1.21.11 set —
checked against `minecraft-data`, never assumed, exactly as the vine block was:

| family | weathered variants |
|---|---|
| `stone_bricks` | `cracked_stone_bricks`, `mossy_stone_bricks` |
| `stone`, `cobblestone` | `cobblestone`, `mossy_cobblestone` |
| `deepslate_bricks` / `deepslate_tiles` | `cracked_*` |
| `polished_blackstone_bricks` | `cracked_polished_blackstone_bricks` |
| `nether_bricks` | `cracked_nether_bricks` |
| `bricks`, `terracotta`, `concrete`, `quartz`, `sandstone`, planks and every wood family | **none** |

The second clause is what makes the rule good rather than merely safe.
**Timber decays by removal**: a wooden house that fell in leaves its plinth,
its chimney and a few studs, and that is exactly what "no variant → take it
away" produces — the crumble line simply runs lower on wood columns
(`intensity` is raised by `TIMBER_EXTRA = 0.15` for a survivor course whose
block has no variant). Concrete and quartz behave the same way, which is right:
a modern building's ruin is a frame, not a mossy wall.

`overgrowth` then adds the green on top of whatever survived — moss carpet on
rubble, vines on inside faces — and it is the one move that *is* allowed to
introduce a foreign block, because moss is not the building's material, it is
what is growing on it.

### 5.3 The rules that keep a general shell standing

Every one of these exists today as a special case in the relic file, or is the
general form of one:

1. **Clear whole runs, top down.** Never punch a hole in a wall. This is the
   `floating.*` rules satisfied by construction.
2. **Fragments only on heads that reached the plate**, and never spanning a
   room. A rafter across a room is a run supported at its two ends whose middle
   is a cube with six air faces.
3. **A stair or ladder run keeps its flanking wall** to the step's height plus
   one course. Today's `stairMin` map, generalised from "the shell's flight" to
   any stair-family block in the interior — because an arbitrary archetype may
   put stairs anywhere.
4. **Upper floors are floor planes and are structural.** The crumble takes
   wall, never floor. A shell with `floors ≥ 2` keeps every floor plane; what
   changes is that its upper storey is now open to the sky, which is what a
   ruin looks like from inside.
5. **The apron is cleared to the same rule as the ring**, so no eave course is
   left hanging off a wall that is no longer there.

### 5.4 Two shell kinds that need their own answer

**Terraces.** A terrace is several buildings sharing party walls. Rolling one
bay ruined and leaving its neighbour intact must not take the party wall away
from the neighbour. **Rule: a shared wall column's crumble height is the
`max` over the bays that share it.** A ruined bay between two standing ones is
therefore a roofless slot with both its party walls up to the plate — which is
precisely what a gap in a real terrace looks like, and it is also the only
answer that cannot open a hole into an intact interior.

**High-rise.** `mode: "facade"`. The crumble line is meaningless on an
eight-storey frame and removing wall panels below a floor plate is safe only
because each storey's wall stands on its own slab. So: per storey, per bay,
remove window-and-spandrel panels on a positional draw, keep the structural
columns (every `HIGHRISE_COLUMN_PITCH`th) and every floor plate, strip the roof
plant, and run `settleFixtures` after. The read is a gutted tower, and it is
what gives P4 its skyline. **This is the highest-risk operator in the
document**; it is scheduled last (WP-6) and if the lint bites it is cut to the
exclusion list with "high-rise never ruins" as the fallback, at no cost to
anything else.

### 5.5 `quench` — cold and dry, over the whole catalog

A general decay meets forges, kitchens, pools, aquaria and greenhouses. `quench`
is a total substitution over the pinned set, run before the crumble so the
crumble can then take the emptied fixture away:

- **fire family** → removed or unlit: `fire`, `soul_fire`, `campfire`,
  `soul_campfire`, `lit` furnace/smoker/blast-furnace states → unlit,
  `torch`/`wall_torch`/`soul_torch` → air, `lantern`/`soul_lantern` → air,
  `candle*[lit=true]` → `lit=false`, `lava` → air.
- **fluids** → air: every `water`/`lava` source and flowing state inside the
  shell and its apron, plus `waterlogged=true` → `false` on anything that
  survives. A ruin that holds water is a fluid-lint finding waiting for the
  first tick.
- **the pool basins stay.** Removing the water leaves the dressed basin, which
  reads as a drained pool — better than filling it in, and it costs nothing.
- **crops and farmland** inside a shell (the greenhouse) → `dead_bush` on
  `coarse_dirt`, because farmland with no crop reverts to dirt anyway
  (`docs/FARM-PLAN-v0.md` §6.2, the persistence law) and a dead bush says the
  same thing on purpose.

### 5.6 `settleFixtures` — the fixpoint

The relic file has two hand-written guards for this (`trimLadders`,
`dropDeadLanterns`) because the cottage had two ways to leave something hanging.
An arbitrary archetype has dozens: wall banners, signs, item frames, paintings,
flower pots, carpets, beds, chandeliers, hanging signs, ladders, torches,
trapdoors, upper-floor furniture whose floor plane survived but whose wall did
not.

> **Rule: after the removal operators, sweep every remaining op in the shell and
> delete any whose support is gone, and repeat until nothing is deleted.**

Fixpoint, because a removal can unsupport the next thing. Bounded by the op
count, so it terminates. The support predicate is the physics lint's own —
`bracketedTo`, the `NEEDS_GROUND` set, the hanging rule — read from one place
so the sweep and the lint cannot disagree. **This is the single most important
piece of engineering in F19**: it is what converts "five carefully hand-tuned
ruins" into "any of 343 archetypes ruins and lints zero", and it is where the
whole feature will fail if it fails.

### 5.7 `reachOrRefuse` — the guarantee, checked

The relic file gets interior reachability by construction: rubble goes through
`PropCounter.put1`, which honours the ground floor's own reservation. That
still holds, but on an arbitrary plan it is no longer *obvious*, so it is
checked:

1. Flood the shell's open interior cells from the cell inside the door.
2. Any open cell not reached: withdraw the rubble heap that sealed it (rubble is
   the only *additive* interior move) and re-flood. Once.
3. Still unreachable: **the lot's decay is refused whole** — the intact shell
   is built instead, `LOAM-W510 RUIN_LOT_REFUSED` names the lot and the reason,
   and the report counts it. Refused whole rather than shipped broken is the
   standing pattern (props, set pieces, programs), and a refusal rate above a
   few percent on a walked world is a finding about the operators.

## 6. Intensity bands — 0.5 and 0.95 must not look alike

The share (§4.1) says *how many*. The band says *how far gone*, and without it
a district at 0.5 and a district at 0.95 differ only in count, which reads as
"more of the same houses" rather than as a deeper ruin.

`band = bandFor(decline, jitter)`, where the jitter (channel 43) moves one lot
in six up or down one band, so a street is not uniform:

| band | `decline` | `intensity` | collapse floor / spread | roof | rubble | overgrowth | the read |
|---|---|---|---|---|---|---|---|
| `light` | 0.35–0.55 | 0.35 | wallTop−2 / 2 | holed: fragments on ~⅔ of heads, plate mostly present | 0.15 | 0.25 | roof gone in places, walls up, doors and windows open. *Derelict.* |
| `heavy` | 0.55–0.80 | 0.60 | 3 / 3 | gone; fragments on surviving heads only | 0.28 | 0.45 | roofless, walls at head height, floor heaped. *Ruined.* |
| `total` | 0.80–1.00 | 0.85 | 1 / 3, corners stand | gone | 0.40 | 0.70 | one to three courses, corner stumps, dense green. *Archaeology.* |

The bands are the *only* place these numbers appear. An operator reads
`DecayProfile`; the band table is the one function from `decline` to a profile,
so re-tuning after a walk is one table.

## 7. The ground under a ruined lot

A ruined shell standing on a mown lawn undoes itself. Three changes, each small
and each keyed on a field that is empty in a world with no decline.

### 7.1 The ruin field

The district publishes a per-column **ruin field** (`Float32Array` over the
region): the band's `intensity` over each ruined lot's rect and its apron ring,
smoothed with a 4-column linear falloff. Zero everywhere else, and empty when
no lot ruined — which is what makes every consumer below byte-identity-safe.

### 7.2 `grounds.ts` learns one treatment

A new `GroundTreatment`, `"ruin_yard"`, chosen for a lot whose ruin field is
non-zero, ahead of the category table:

- surface: worn mix of `coarse_dirt` / `dirt_path` / `gravel` at a density
  scaled by `intensity`, snow zeroed;
- rubble: a handful of full blocks of the shell's own survivor material,
  through the same reservation the garden's flowers use — the apron `spill`
  extended outward, not a second mechanism;
- the boundary: a **broken** fence — the existing garden fence run with gaps
  drawn positionally at `intensity`, and no gate;
- volunteer growth at the existing `vegetationReclaim` density, lifted locally
  by the ruin field. This is the interleave the F19 row asks for: the *global*
  reclaim row keeps doing what it does, and the ruin field lifts it where the
  buildings actually fell.

### 7.3 The street in front of a ruin

`decay.coverage` already worn-paints open ground and `wearIntensity` already
paints carriageway columns in the worn tone. Two extensions, both bounded:

- the wear sweep's chance is lifted **locally** by the ruin field, so ruin
  clusters have the worst roads and an intact pocket has a passable street.
  Coherence for one line of arithmetic;
- above `decline ≥ 0.8`, a share of carriageway columns goes past worn to
  **broken**: paving replaced by `coarse_dirt` or `grass_block` with the
  reclaim's volunteer growth on top. This is what turns "a grid of clean roads
  between ruins" into P4's *street-grid remnants*.

**The audit caveat, stated because it will otherwise be found the hard way:**
`dirt`, `grass_block` and `coarse_dirt` are all in the walkability audit's
`SOLID_TOP` set, so a broken street stays walkable and the audit's goldens must
not move. If `components` or `orphans` regress on a ruined fixture, the
break-up is reaching columns the network needs, and the share is the knob.

### 7.4 Vegetation reclaim through the fabric

`terrain/clearing.ts` produces a density multiplier that is **0 inside the
settlement hull** — which is precisely why no tree has ever grown in a town.
For P4's "overgrowth dominates", that is the mechanism to reach:

> `clearing[idx] := max(clearing[idx], ruinField[idx] · RECLAIM_CANOPY_GAIN)`

with `RECLAIM_CANOPY_GAIN = 0.8`. Trees then grow in ruined yards and open
ground at high decline, and the kit's standing
`avoidTags: ["structure", "road", "plaza"]` line keeps them out of the shells
and off the streets — F19 does **not** change that line, and the kit section
(§10) says why an author must keep writing it.

Note the interaction with §7.3: a street column that broke to soil is still a
`road` in the occupancy grid, so it grows grass and flowers but not trees.
That is the correct read — a road reclaimed by scrub, not a forest with a
buried road under it — and it is free.

## 8. Physics, walkability, and the zero-findings bar

A ruin must lint zero on all 26 rules, exactly as everything else does. Rules at
risk, and the construction that satisfies each:

| rule family | risk | construction |
|---|---|---|
| `floating.slab`, `floating.isolated` | a hole punched mid-wall; a rafter over a room | whole-run top-down clearing (§5.3.1); fragments only on plate-height heads (§5.3.2) |
| `unsupported.*` | banners, pots, ladders, lanterns, carpets on removed backing | `settleFixtures` fixpoint (§5.6) |
| `traversal.no_start` | the door column decayed | door + approach protected, unchanged from today |
| traversal reachability | a rubble heap seals a cell | `reachOrRefuse` (§5.7) |
| `fluid.*` | a drained-but-not-drained pool, waterlogged survivors | `quench` (§5.5) |
| door rules | a door whose frame crumbled | the door column is protected to its lintel — today's rule, kept |
| walkability audit | broken streets, rubble in a junction | §7.3's caveat; rubble never lands on a road column |

The bar for every WP is a **compiled world read back off disk and linted**, not
a unit test. Phase 4.1 shipped three defects that passed every unit test.

## 9. Report and diagnostics

| code | severity | when |
|---|---|---|
| `LOAM-T227 DECAY_PARAM` | error (validate) | `params.decay` outside 0..1 |
| `LOAM-W510 RUIN_LOT_REFUSED` | warning (compile) | §5.7's refusal, naming the lot and the reason |
| `LOAM-W511 DECAY_MODE_FALLBACK` | warning (compile) | a shell that could not take `shell` mode took `facade`, or took nothing (`wallTop < 3`) |
| `LOAM-I512 DISTRICT_RUINS` | info (compile) | per district: `decline`, share, lots rolled / ruined / refused, band histogram |

`LOAM-I512` is not optional. DESIGN's second failure mode is machinery that
exists and never runs, and "the district ruined 0 of 84 lots because `decline`
never reached the row" is a sentence that must appear somewhere a human looks.
The compile report additionally carries the per-district ruin share so the
author-feedback round can see it.

## 10. Kit teaching — the sentences

**In §9d's dial table**, the `decline` row becomes:

> `decline` | 0..1 — 0 kept up, 1 abandoned | ruin coverage, road wear,
> vegetation reclaim, **and, at 0.35 and above, the share of a district's own
> buildings built as ruins**. Orthogonal to wealth: a rich ruin exists.

**A new short subsection under `district`**, and this is the sentence the whole
feature exists to make true:

> **A ruined city is a district with a high `decline` — not a list of ruins.**
>
> Write the quarter you would have written if the city were alive: the ordinary
> `fabric`, the ordinary `mix` of `townhouse`, `shop_row`, `warehouse`,
> `market_hall`. Then set `intent.decline` on the district — 0.5 for a quarter
> going under, 0.8 for abandoned, 0.95 for a dead city — and the compiler rolls
> that share of its lots into the same buildings, decayed: walls to head
> height, roofs gone, rubble on the floors, vines on the survivors, the street
> broken up and the green coming back through it.
>
> **Do not fill a district's `mix` with `ruined_cottage`.** The five ruined
> archetypes are *relics* — a single ruined keep on a moor, an overgrown villa
> in a wood — and a whole quarter of them is five buildings repeated, not a
> ruined city. `decline` is the way to say it at scale.
>
> Landmarks you declare as children are **not** ruined automatically, because a
> building you named is a building you wanted. Ruin one on purpose with
> `"params": { "decay": 0.8 }`, which works on any building node anywhere.
>
> Keep `avoidTags: ["structure", "road", "plaza"]` on your forest nodes. At high
> decline the compiler lets trees back inside the settlement's clearing so the
> ruins are overgrown; that line is what keeps them out of the buildings and off
> the streets.

**In the classifier's prompt guidance**: *ruins, ruined, abandoned, derelict,
overgrown, forgotten, post-apocalyptic, "once-great"* → `decline` 0.8–0.95 on
the region, and an ordinary `mix`.

## 11. Work packages

Six, in dependency order. WP-1 alone is a no-op; WP-2 and WP-3 are the feature;
WP-4–6 are the surround.

- **WP-1 — extract the engine.** `decay.ts` with the operators, `DecayProfile`,
  the five relics re-expressed as parameter sets. **List-identical output**: the
  proof is that the five relics' emitted block lists are byte-for-byte what they
  were, and the twelve control worlds are hash-identical. `trimLadders` and
  `dropDeadLanterns` fold into `settleFixtures` in this WP or in WP-2, but never
  survive beside it.
- **WP-2 — generalise.** The re-clad rule and `WEATHERED_VARIANTS`, timber by
  removal, `quench`, `settleFixtures`, `reachOrRefuse`, the collapse-by-category
  table, `params.decay` on `building.grammar@0`. Test: a **catalog sweep** — a
  sample across every catalog category × three bands, each emitted into a real
  world and linted on all 26 rules, with the refusal rate reported. This is the
  WP that either works or tells us the feature is smaller than we thought.
- **WP-3 — the roll.** `decay.ruinShare`, the onset curve, the cluster field,
  the per-lot draw, the landmark exemption, the terrace party-wall rule, the
  band table, `I512`/`W510`/`W511`. Test: determinism (twice, byte-identical);
  positional independence (add a landmark elsewhere; the same lots ruin);
  monotonicity (ruined-lot count rises with `decline` across a seed sweep).
- **WP-4 — the ground.** The ruin field, `ruin_yard`, rubble aprons, broken
  fences, the local wear lift, the street break-up. Test: walkability goldens do
  not regress on a ruined fixture; lint zero.
- **WP-5 — the reclaim.** The clearing lift, its interaction with the flora
  scatter and the transition band, and the `avoidTags` interaction proven rather
  than assumed (a test asserting no tree stands inside a shell footprint on a
  `decline: 0.95` world).
- **WP-6 — kit, classifier, façade mode, demo.** The §10 sentences, the
  classifier row, high-rise `mode: "facade"` (**cuttable**, §5.4), and the P4
  Luna e2e world. This is the WP P4's acceptance walk rides.

### 11.1 Worlds that will move, and the discipline

Any `examples/` world carrying `intent.decline ≥ 0.35` moves at WP-3. Those
moves are **expected and must be justified move by move** — the same standard
the furniture fix met when c1-harbourtown moved 186 chunks, and the same
technique: differential build, attribute every block. A world whose `decline` is
below the onset and which moves anyway is a bug in the row's totality.

## 12. Risks

1. **`settleFixtures` is where this fails.** 343 archetypes × three bands is a
   large space of fixture arrangements, and a single unsupported banner is a
   lint finding. Mitigation: the fixpoint reads the *lint's own* support
   predicate rather than a parallel one, and WP-2's catalog sweep is the
   measurement rather than a spot check.
2. **A ruin field that reads as noise.** Independent per-lot rolls look like
   salt and pepper; the cluster field is the counter, and it is the one
   parameter most likely to need a walk-driven re-tune.
3. **Silent feature loss, from the other direction.** A landmark exempted from
   the roll in a district at `decline: 0.95` will look *conspicuously* intact.
   That is the correct default and it is also the thing the kit sentence about
   `params.decay` exists to fix; if walks say otherwise, the fix is the kit, not
   the exemption.
4. **The countable-proxy trap.** DESIGN's fourth failure mode: "ruined-lot count
   rose from 0 to 61" is a proxy, and P4's assertion is emergent. The
   instrument-first counter applies — if the walk says "it reads as broken, not
   as ruined", build the measurement that sees what the walk sees before fixing
   anything.

## 13. What is deliberately out

1. **Battle damage, siege, fire, scorch.** `event.siege` and `event.fire` are
   *reserved* fan-out rows with their own briefs ("wall breaches, rubble aprons,
   a camp outside the wall"; "charred substitution, roof gaps, standing
   chimneys, soot") and they stay reserved. **P5's sea-monster invasion is a
   different mechanism entirely** and must not be built on this one: an invasion
   is an event happening to an intact city, decline is time having happened to
   it. Conflating them would give every invaded city ruined housing stock.
2. **Burning, smoke, lit ruins.** `quench` goes the other way, by law.
3. **Collapsed roads, bridges and walls as geometry.** The streets break up as
   *surface* (§7.3); no linework client learns a collapse mode. A broken bridge
   is a hole in a route and the walkability audit would be right to fail it.
4. **Buried, sunken or tilted buildings.** The ground contract decides levels;
   a shell that sank is a level claim nobody can arbitrate.
5. **Loot, spawners, entities, narrative props.** No chests with story in them,
   no mob spawners. Determinism and scope.
6. **Reconstruction.** No scaffolds, no half-rebuilt shells, no
   `event.boom` interaction.
7. **Ruined interiors as a fit-out vocabulary.** Decay writes over the fit-out
   the archetype already produced. There is no "ruined tavern" interior grammar
   and there must not be one — that is a second grammar, which is the one thing
   the ruin law forbids.
8. **Ruined precincts and ruined bespoke programs** (§4.3).
9. **Underground decay.** Cellars, crypts and tunnels are untouched in v0; a
   ruined shell keeps its intact cellar, which is a perfectly good hideout and
   is arguably what P4 wants anyway.

## 14. Open questions — with a recommendation on each

**Q1 — is `RUIN_ONSET = 0.35` the right place for the step?**
It is a judgement about when tiredness becomes abandonment, and the 0 → 0.12
discontinuity at the threshold is deliberate.
*Recommendation:* ship 0.35, walk P4 (0.9-ish) and a mid-decline world
(0.5-ish) in the same session, and expect to move it once. It is one constant.

**Q2 — should the ceiling be 0.92, or should a dead city be total?**
**RESOLVED (Kai, 2026-08-09): total.** The cap is removed; `ruinShare` runs
to 1.0 at `decline = 1.0` (§4.1 records the ruling and the surviving half of
the contrast argument).

**Q3 — table 14's own open question: bare `ruin` / `ruins` as building tags.**
**RESOLVED (Kai, 2026-08-09): option (b)** — both bare tags point at
`ruined_cottage`, the gentlest and most generic of the five, now that the
scale answer lives in `decline`. A seeded pick was rejected: unpredictable is
the wrong property for a word an author wrote on purpose. This closes the
kit's long-standing open authoring question; the kit edit lands with WP-1.

**Q4 — should `decline` also reduce a district's *coverage* (lots left empty)?**
An abandoned city plausibly has cleared plots, not only ruined ones.
*Recommendation:* no, not in v0. Coverage is a density decision owned by
`params.density`, and an empty lot reads as "never built" rather than
"fallen" — the opposite of the intended message. Revisit only if the walk asks
for it.

**Q5 — high-rise façade mode: build it, or exclude high-rise?**
§5.4 schedules it last precisely so this can be decided on evidence.
*Recommendation:* attempt it in WP-6 with a hard cut rule — if it does not lint
zero on the first catalog sweep, exclude high-rise and say so in the kit. P4's
"metropolis" is well served by the street grid, the overgrowth and the mid-rise
fabric even if the towers stand intact.

**Q6 — do precinct buildings ruin?**
Excluded in v0 (§4.3) because precincts do not go through `infillLot`. A ruined
harbour or a ruined airport is a strong image and the roll would be a dozen
lines.
*Recommendation:* leave out of F19 and ledger it. It is cheap, it is additive,
and it is not what P4 asserts.
