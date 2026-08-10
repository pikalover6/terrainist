# Ruins Plan v0 — WP-6, the green skin (addendum)

> **STATUS: RATIFIED 2026-08-10, with Kai's three rulings:** shell trees at
> **heavy AND total** bands (bolder than this draft's total-only — a trunk may
> burst from a roofless shell in half-ruined quarters too, one per shell,
> sited where the interior flood does not need it); glow lichen
> **theme-gated** as drafted; walkability goldens **separate set**, with the
> explicit calibration that *walkability is less important for ruin scenes* —
> the spine and sight-line laws serve legibility first, and U2-style
> strictness must not over-constrain the aesthetic; rough walking is in
> character.
>
> **6e rulings (Kai, 2026-08-10):** rule 17 is refined — a deliberately
> elected shell trunk, verifiable from the plan, is not an accidental
> obstruction; interior reachability stays enforced; `shellTrees` ships ON
> at heavy+total. Glazing: the crumble keeps its glass; **the skin may
> substitute a pane with leaves directly** (plug openings become real via
> substitution, not breakage).
>
> **NORMATIVE ADDENDUM to `docs/RUINS-PLAN-v0.md`, drafted 2026-08-10.**
> It adds a work package; it does not edit the ratified base plan, and every
> ruling in that plan — the reach law (§2), the ruin law (§3), the roll (§4),
> the re-clad rule (§5.2), the band table (§6), the exclusions (§13) — stands
> unchanged and governs this one. Where this document sets a number, that number
> is new; where it names a law, the law is the base plan's.
>
> **Numbering note.** The base plan's §11 already has a *WP-6* (kit, classifier,
> façade mode, demo). That package is untouched and is not renumbered. This
> addendum's five waves are **WP-6a … WP-6e** and are collectively "the green
> skin"; nothing here depends on the base plan's WP-6 and nothing there depends
> on this.
>
> **Written from cold, against shipped code.** WP-1 … WP-5 and the closure are
> committed (`7b761ec`, `52c4976`, `8dcb8ff`, `4a923ed`, `210db8d`, `9af28e4`);
> the surfaces this document builds on are
> `packages/stdlib/src/structures/decay.ts`,
> `packages/stdlib/src/structures/support.ts`,
> `packages/compiler/src/structures/ruin-field.ts`,
> `packages/compiler/src/structures/grounds.ts`,
> `packages/compiler/src/terrain/vegetation.ts`,
> `packages/compiler/src/terrain/clearing.ts` and
> `packages/compiler/src/terrain/flora/parts.ts`.

## 1. The finding

Kai's walk of the first P4 battery candidate, `overgrown_metropolis_c1`
(2026-08-10):

> does not read as ruined+overgrown at all… It'd require the streets, walls of
> buildings, ground, all to be actively overtaken with invasive plant growth,
> rather than just some scattered foliage.

Ratified diagnosis: **what shipped is placement-level reclaim; "overgrown" is
surface colonization.** WP-4 and WP-5 answered the question *where may a plant
stand* — they broke the paving, dressed the yards, and opened the settlement
claim so the wood could come back. Every one of those moves puts a plant on
**open ground the city is not using**. Not one of them puts a plant **on the
city**. A player walks through a dead metropolis and sees clean masonry with a
meadow between it, which is a city with a lawn, not a city being eaten.

Kai additionally ruled, in the same session:

> support growth in normally-unusual places — trees/plants in the middle of a
> road — as part of an overgrown settlement.

Three measurable reasons the shipped world reads the way it does, each traced to
a line rather than to a feeling:

1. **No pass writes on a vertical surface.** `decay.ts`'s `green` hangs vines on
   the **inside** faces of survivors only (`green()`, one course, `y = 2`) — a
   read available to a player who climbs into a shell and to nobody else. The
   exterior of every wall in the city is bare.
2. **Nothing colonizes a surviving horizontal surface.** Rubble heaps take a
   moss carpet one time in three *inside* the shell; wall heads, aprons,
   forecourts, plazas and every square metre of unbroken pavement take nothing.
   §7.3's break-up replaces paving with soil and then grows grass on the soil —
   colonization of the ground the city lost, never of the ground it still has.
3. **The streets and yards are closed to growth by construction, and the yards
   by accident.** `RUIN_RECLAIM_HARD_TAGS` (vegetation.ts) closes `road`,
   `plaza`, `ground`, `courtyard`, `prop`, `building`, `interior`, `farm` — and
   `ground` is claimed by the ground pass for **every column it dressed,
   including every `ruin_yard`** (`grounds.ts`, the `taken → tags["ground"]`
   sweep at the end of `dressGrounds`). So the one treatment invented to say
   "this ground is ruined ground" is also the treatment that forbids a tree from
   standing on it. That is not a design decision; it is the closure's blanket
   rule catching a case it was not written for, and WP-6d fixes it by name.

WP-6 is the answer to all three. It is **not** more of WP-5: raising the reclaim
density again puts more trees in the same gaps.

## 2. The law

> **THE GREEN SKIN LAW.** Overgrowth is a **surface** written over the finished
> fabric, not a set of plants placed beside it. Every built surface inside the
> ruin field — wall face, wall head, rubble top, pavement, kerb, parapet, step —
> is a candidate, and the field decides how much of it is green.

This is the ruin law one storey up, and deliberately the same shape: there is no
"overgrown builder". The ordinary city is built, the ruin law decays it, and
then the skin is written **over whatever came out**. A pass that reads built
surfaces rather than building lists is what makes a town wall, a retaining wall,
a bridge parapet and an intact house standing next to a ruin all get the same
treatment for free — and it is why the skin cannot live inside the fit-out,
which can see only its own shell.

Its companion, and the reason it does not become a second flora grammar:

> **THE GREEN RULE.** The skin's green comes from the **place**, not from the
> building. Leaf and shrub species are the ones already growing around this
> settlement; only moss is universal, because moss is what grows on stone
> everywhere.

The re-clad rule's sibling, and stated for the same reason: a birch quarter that
grows jungle leaves is exactly the class of bug "a concrete tower re-clad in
mossy cobblestone" was.

And the law that makes the dial tunable rather than merely adjustable:

> **MONOTONE GREEN.** Every share in this document is a fixed positional draw
> compared against a rising threshold. Raising `decline` may only ever **add**
> green; it never moves a leaf that was already there. A world at 0.95 contains
> the same world at 0.5, plus more.

That is what makes §7's seed-sweep monotonicity test a statement about the
feature rather than about a histogram, and it is what makes a walk-driven
re-tune predictable: one number goes up, nothing you liked goes away.

## 3. Where it runs, and what it may see

### 3.1 The pass

One new pass, `packages/compiler/src/structures/green-skin.ts`:

```ts
export function growGreenSkin(input: GreenSkinInput): GreenSkinResult;

export interface GreenSkinInput {
  readonly plan: ColumnPlan;
  readonly palette: Palette;
  readonly stack: PrismarineStack;
  readonly seed: number;                 // the settlement's own stream
  /** RUINS-PLAN §7.1. **Absent means the pass does not run.** */
  readonly ruinField?: RuinField;
  /** Every structure block laid so far, in emission order. */
  readonly laid: readonly StructureBlock[];
  readonly districts: readonly DistrictProduct[];
  /** grounds.ts's `ruin_yard` columns, newly published (§6.1). */
  readonly ruinYardColumns?: Uint8Array;
  /** The species the place already grows (§4.6). */
  readonly flora: ReclaimSpecies;
}

export interface GreenSkinResult {
  readonly blocks: readonly StructureBlock[];
  /** Street/yard columns the scatter may now stand a trunk on (§6). */
  readonly colonized: Uint8Array;
  readonly counts: GreenSkinCounts;
  readonly diagnostics: readonly Diagnostic[];
}
```

**It runs as the last structure pass** — after buildings, tunnels, plaza,
streets, retaining, courtyards, grounds, props and the streetscape, immediately
before `buildStructures` assembles its result and hands the occupancy grid on.
Three constraints pin it there and there is no other legal slot:

- it must see the **ruin field**, which `structures/index.ts` builds right after
  `buildBuildings`;
- it must see the **finished ground**, because a moss substitution on a column
  the ground pass is about to repaint is a substitution that never happened;
- it must see **every built surface**, and the streetscape's kerbs and lamp
  posts are among the last blocks laid.

Its `colonized` mask then travels out with the pass result to
`terrain/compile.ts`, where the scatter (pass 6) reads it — which is the only
part of WP-6 that runs *after* flora scatter time, and §6.4 says exactly how.

### 3.2 The surface index — the load-bearing engineering

`settleFixtures` was WP-2's "single most important piece of engineering". The
green skin's is the **surface index**, and it fails in the same way if it is
wrong: a skin that cannot tell a wall face from open air writes vines on
nothing, and vines on nothing render as nothing.

> **Rule: the index is built over ruined columns only.** Every column whose ruin
> field is zero is skipped at index time, not at write time.

That is the reach law made a *cost* law as well as a correctness law: a
metropolis lays millions of structure blocks and the skin needs random access to
a few hundred thousand of them. Concretely — a `Map<column, Int32Array>` keyed
`(x,z)`, one slot per `y` between the column's ground and the highest block laid
on it, filled by one forward pass over `laid` (last write wins, exactly as the
emitter resolves it), and `air` recorded as air rather than as absence, because
a cell the crumble *cleared* and a cell nobody ever touched are different facts
and the skin needs the first one.

From the index, three predicates, all answered **by name** through
`support.ts` — because the fit-out side's answer and the lint's must not be two
answers (`support.ts`'s own opening paragraph, and `CURB_LEVEL_TOLERANCE`'s
lesson):

| predicate | definition | reader |
|---|---|---|
| `solidAt(x,y,z)` | the index holds a block there and `canSupport(name)` | climbers, carpets |
| `openAt(x,y,z)` | the index holds air there, or holds nothing and `y > ground` | climbers, plugs |
| `walkedAt(x,y,z)` | `!bodyFits(name)` is false in the two body courses | the U2 guard |

`canSupport` is deliberately the conservative one — "not a full cube by name" —
so the skin refuses to hang a vine off a slab, a stair, a fence or a pane. That
is the safe direction here for the same reason it is safe in `settleFixtures`:
the failure that costs is calling something substantial that is not.

### 3.3 Determinism, and the channel reservation

Every draw is `hash2(seed, x, z, channel)` on the column, or `cellHash` on the
fit-out's local cell where the work is inside `decay.ts`. No counters, no
traversal order, no wall clock — the pass is a pure function of (index, field,
seed), and running it twice on the same input writes the same blocks in the same
order.

**Channels 41–49 are exhausted** by the shipped feature: 41/42/43 are the
district stream's roll, cluster and band draws (`layout/district.ts`), and
44–49 are the ground pass's ruin work — fence gap, wear, wear pick, yard rubble,
broken-street roll, flower pick (`grounds.ts`). So:

> **Channels 50–59 are reserved for the green skin.** Nothing else may take one.

| channel | draw |
|---|---|
| 50 | which eligible exterior face cell takes a climber |
| 51 | a climbing strand's length |
| 52 | vine vs glow lichen |
| 53 | which opening takes a leaf plug, and whether it bulges |
| 54 | carpet on a horizontal survivor (rubble top, wall head, parapet) |
| 55 | pavement moss |
| 56 | pavement moss variant (block vs carpet vs tuft) |
| 57 | street/yard colonization election |
| 58 | the spine meander |
| 59 | street shrub species and variant |

Inside `decay.ts` the fit-out's `cellHash(salt + k, …)` space is separate and
its used offsets are 7, 19, 23, 31, 41, 61, 71. WP-6's one change there (§4.2)
takes **no new offset at all**, on purpose — see the monotone-green law.

### 3.4 The reach law, restated for this pass

> **No ruin field → the pass is structurally absent.** `growGreenSkin` returns
> `{ blocks: [], colonized: empty, counts: zero }` on its first line when
> `ruinField === undefined`, and `structures/index.ts` does not call it at all.

Same enforcement as always: `docs/GROUND-CONTRACT-v0.md` §12's harness on the
twelve control worlds, comparing decompressed chunk NBT. And the same corollary
as base §11.1: **every `examples/` world that already ruins anything will move
at WP-6b**, and those moves are justified move by move by differential build,
not waved through. A world with no ruined shell that moves at all is a bug in
the field's absence.

## 4. Wall colonization — the vertical skin

### 4.1 Climbing growth, and the legal-face discipline

A **face cell** is a cell `(x,y,z)` with `openAt(x,y,z)` that has at least one
horizontal 4-neighbour with `solidAt`. A face cell is **eligible** when it is
outside the shell (or on any non-shell surface: town wall, retaining wall,
parapet, kerb face) and `y` is above the two body courses or the cell is on the
outside of the fabric where a body may pass through green.

For each eligible face cell, drawn on channel 50 against `WALL_FACE_SHARE`
(§7), the skin founds a **strand**: a run of `vine` starting at that cell and
running **downward** for a length drawn on channel 51, stopping at the first of

- the ground, less one — a vine reaching the surface is the ground-cover pass's
  column, not the skin's (`weeping`'s `y − k ≤ 1` stop, FLORA-GRAMMAR §3.12,
  applied to masonry);
- a cell that is not `openAt`;
- **the last course of the wall it holds** — this is the rule that matters.

> **A climbing strand may not extend past the last course of its support.** A
> vine below the end of the wall it clings to is a vine whose every true face
> points at air; vanilla pops it on the first block update, and until then it
> renders as a flat plate hanging in space. That is precisely the defect Kai
> walked on `oldgrowth_vale-3` and `parts.ts` was corrected for on 2026-08-09.

The face properties are derived by exactly the discipline `parts.ts` enforces,
and the two must not be two implementations. So the derivation moves into a
shared vocabulary, `packages/stdlib/src/structures/greenery.ts`, in the shape
`support.ts` already established (*one vocabulary, two readers*):

```ts
/** The face booleans a multi-face growth block may legally carry. */
export function growthFaces(
  at: { x: number; y: number; z: number },
  solid: (x: number, y: number, z: number) => boolean,
  carried?: string,            // the strand's canonical horizontal face
): Readonly<Record<string, string>> | null;   // null = no legal face; do not emit
```

The three laws it enforces, taken verbatim from `hangingFaces` and from
vanilla's `VineBlock.getUpdatedState`:

1. every **horizontal** neighbour that is `solid` sets that face `true` — the
   sheet lies against the wall;
2. **`up` is never inherited.** `up = true` only when the block directly above
   is itself `solid` — an eave soffit, an arch springing, a floor plate
   overhang. A strand carries `up` on its head cell and never below it;
3. a strand propagates **exactly one thing: one horizontal face**, chosen at the
   head from the faces that cell genuinely touches, with `parts.ts`'s own
   position-keyed tiebreak. A cell left with no legal face is **not emitted**.

On masonry, law 3 is usually trivial — the wall is continuous, so every cell of
the strand is flush against it on its own merits — and that is the point: the
run of the wall *is* the run of the sheet, and the strand ends where the wall
does. A test asserts `growthFaces` and `hangingFaces` agree on every input the
flora side produces, so the two readers cannot drift.

**Interior vines are untouched.** `decay.ts`'s `green` keeps its cells, its
share and its output; the skin writes only outside the shell. Two mechanisms for
one invariant is what the base plan spent §5.6 removing, and this is not that:
they are two *surfaces*, and the fit-out owns the one it can see.

### 4.2 The mossy re-clad, lifted

`weatheredOf(block, k)` picks `family[k % family.length]` — a flat coin between
the family's two weathered members. WP-6 gives it a weight:

```ts
export function weatheredOf(block: string, k: number, mossy = 0.5): string | null;
```

The mossy member is identified **by name** (`mossy_*`), never by index, because
the shipped table is not index-consistent: `stone_bricks` is
`[cracked, mossy]` and `mossy_cobblestone` is `[mossy, cobblestone]`. A family
with no `mossy_*` member — deepslate, blackstone, nether brick — is unaffected
and the lift is inert there, which is correct: a blackstone ruin cracks, it does
not go green, and forcing moss onto it would be the re-clad rule violated from
the inside.

The weight is the band's dial (§7). The **draw is the existing `k`** — no new
salt, no re-roll — so the mossy set grows monotonically as the dial rises and a
light quarter's mossy courses are a subset of a total quarter's. Monotone green,
bought for one parameter.

### 4.3 Growth entering openings

An **opening** is a cell in a wall plane that is `openAt`, at `1 ≤ y ≤ wallTop`,
with `solidAt` on two opposite horizontal sides — a genuine hole through the
wall, not the absence of a wall. Window holes, arrow slits, the gaps a crumble
notch leaves.

Drawn on channel 53 against `OPENING_PLUG` (§7), an opening takes a **leaf
plug**:

- the opening cell itself takes `*_leaves`;
- **one** cell inward and **one** cell outward, each at half the plug share, take
  leaves too — the bulge;
- **never two.** A two-deep bulge inward is a sealed room, and the base plan
  spent §5.7 proving rooms are not sealed.

Two hard constraints, both by construction rather than by re-checking:

> **No plug in a cell a standing body occupies.** The test is `bodyFits`, not a
> magic height: leaves are a full cube by name, so a plug in the fit-out's `y=1`
> or `y=2` course would block the walk. Since `reachOrRefuse`'s flood runs over
> exactly those body courses, keeping out of them is what makes WP-2's proof
> still valid without re-running it.

> **No plug in a door opening, its lintel, or its approach.** The base plan's
> first guarantee, unchanged and now also a growth rule.

In practice a window plugs from its head down and leaves its sill open, which
reads better than a stuffed hole anyway: you see the leaves *in* the window from
the street, and you can still see through the bottom of it.

**Every leaf block the skin writes carries `persistent = true`.** This is not a
detail; it is the difference between a feature and a feature that disappears.
`LEAF_STATE_POLICY` is `"computed"` (`parts.ts`, flipped 2026-08-07), and a
computed leaf carries `distance` from a BFS over **its own plant's wood**. The
skin's leaves have no wood within 6 in any direction, so vanilla decays every
one of them on the first random tick — Kai would walk a green city, leave, come
back and find it bare. Machine-checked in §8.

### 4.4 Glow lichen

`glow_lichen` is the same multi-face block as `vine` and takes the same
`growthFaces` derivation, so it costs nothing structurally. It is drawn on
channel 52 as a **substitution within the climbers already placed**, at
`LICHEN_SHARE`, and only:

- on **undersides** — arch soffits, bridge decks, floor-plate overhangs, wall-head
  drips, the inside of an opening's head — where `up = true` is legal, because a
  lichen's read is a stain on a ceiling and a vine's is a curtain on a wall;
- when the palette resolves `foliage.glow_lichen`, which is a **new symbol** and
  is present only in themes that declare it (§14, Q1).

The reason it earns its place:

> **Glow lichen is the only light a ruin may have, because it is not fire.**
> `quench` takes every torch, lantern, candle and campfire out by law (base
> §5.5), which is correct and leaves a dead city that is literally unreadable
> after dusk. Lichen is growth, it is cold, it is dry, and it puts light level 7
> under the arches of a quarter the walking agent has to cross at night.

### 4.5 The silhouette law

At `total` the brief is "buried in green" and the failure mode is a green blob:
a ruin whose outline you cannot read is not archaeology, it is landscape.

> **The skin never obscures a crumble profile.** Opaque masses — leaves — go
> only into openings and against the lower two thirds of a face. The **top
> course** of every surviving wall, and the ragged head the crumble drew, take
> climbers and carpet only, never a leaf mass.

The crumble line is the single most expensive thing WP-1 and WP-2 built, and it
is the thing that says "this was a building". Vines on it read it out; leaves
over it delete it.

### 4.6 Where the species come from

`ReclaimSpecies` is resolved once per settlement, before the pass:

1. the species tables of the `scatter.forest@0` nodes whose `area` covers the
   settlement's hull — the wood this city actually stands in;
2. failing that, a small climate fallback (temperate → oak/birch, cold →
   spruce, tropical → jungle, arid → acacia + `dead_bush`, and a `dead_bush`-only
   set where the climate grows nothing).

The green rule, implemented. A ruined city in a birch wood grows birch through
its windows. See §14 Q2.

## 5. Horizontal colonization

Every horizontal surface the fabric still owns is a candidate. Four families,
one law each, and one substitution rule that governs all of them:

> **The skin never changes a level.** It substitutes a **full cube for a full
> cube**, or it adds growth into a cell that was air. It never touches a slab, a
> stair, a wall or a kerb cap, and it never puts a carpet on anything that is
> not a full cube by `canSupport` — a `moss_carpet` on a slab is an
> `unsupported.chain` finding, and the ground contract arbitrates levels, not
> this pass.

| surface | what the skin does | why |
|---|---|---|
| **rubble tops** (the `spill` apron, the yard rubble, the interior heaps) | `moss_carpet` on the top face at `CARPET_SHARE`; a share of the heap block itself substituted to `moss_block` | a heap of cobble that has sat for a century is a green mound. `decay.ts` already does this one time in three *inside*; the skin does it everywhere else |
| **wall heads and parapets** | `moss_carpet` on the top face at `CARPET_SHARE` | the top of a broken wall is where water sits. It is also the most-seen surface in a ruin field, because you look down on it from everywhere |
| **surviving pavement** — carriageway, sidewalk, plaza, forecourt, dressed lot | top block substituted to `moss_block` at `PAVEMENT_SHARE`; a share of those take `moss_carpet`, `short_grass` or `fern` on top (channel 56) | this is the one that answers "the streets… actively overtaken". §7.3 broke a *share* of the carriageway to soil; the skin greens what is left standing, without moving a single level |
| **`ruin_yard` ground** | the yard's existing worn mix gains `moss_block` at `PAVEMENT_SHARE` and its volunteer growth rises to the field's local value | a ruin's yard is currently `coarse_dirt`/`gravel` with a lifted flower density and no trees at all (§6.1) |

`moss_block` is in the walkability audit's soil set (`street-stairs.ts`'s `SOIL`)
and `moss_carpet` is in `SOLID_TOP` (`walkability.ts`), so every one of these
columns stays standable at the same level it was. That is the §7.3 caveat
honoured in advance rather than discovered.

## 6. Street colonization — Kai's addition

> **Ruling (Kai, 2026-08-10): trees and plants in the middle of a road are part
> of an overgrown settlement.** This **supersedes the closure's streets-stay-clear
> rule for ruined quarters only.** Everywhere the ruin field is zero — which is
> every column of every world that ruins nothing — the closure stands exactly as
> written, and the kit's standing `avoidTags: ["structure", "road", "plaza"]`
> line means what it has always meant.

### 6.1 What is opened, and how

The closure closes streets and yards through two mechanisms, both in
`terrain/vegetation.ts`:

- `RUIN_RECLAIM_HARD_TAGS` — `road`, `plaza`, `ground`, `courtyard`, `prop`,
  `building`, `interior`, `farm`;
- `ruinPaved`, the `streetBandColumns` mask, which catches the carriageway and
  sidewalk bands that write **no** occupancy tag at all.

WP-6d opens both, and opens them **narrowly**, through one new input:

```ts
readonly ruinColonized?: Uint8Array;   // the skin's `colonized` mask
```

`reclaimOpen` gains one clause: a column in `ruinColonized` is open, whatever
`ruinPaved` says and whatever `road` / `plaza` / `ground` say. Nothing else
changes; `building`, `interior`, `farm`, `courtyard` and `prop` stay hard, so no
trunk ever stands in a shell, in a cellar mouth, in a field or on a prop's
stand.

The mask is elected by the skin, in the structures pass, where the district's
own `carriageway` and `sidewalk` masks live — because the law that disciplines
it is a **street** law and belongs beside the streets, not inside a forest
scatter. Two column sets are eligible for election:

1. carriageway and sidewalk columns inside the ruin field;
2. `ruin_yard` columns — which requires `grounds.ts` to publish
   `ruinYardColumns` beside its existing outputs. This is the accidental closure
   from §1.3 and it is a two-line fix: the yard is claimed `ground`, `ground` is
   a hard tag, so the ruin yard is the one ground in the world that says "ruined"
   and forbids a tree.

### 6.2 The legibility law

P4's own assertion is the constraint, and it is the reason this is not simply
"open the streets":

> the ruins read as a once-metropolis: **street-grid remnants and ruined district
> fabric at city scale**

A grid you cannot see is not a remnant. So:

> **THE SPINE.** Every street run keeps a continuous open lane, `SPINE_WIDTH`
> columns wide, from one end to the other. No trunk and no body-blocking growth
> may stand on a spine column.

and, because a dead-straight cleared stripe down every street for a kilometre is
its own kind of unreal:

> **The spine meanders; it does not stripe.** Its centre wanders within the
> carriageway band by a low-frequency positional draw on channel 58, bounded so
> the spine always lies wholly inside the carriageway. A player walking it takes
> a path *through* the growth; a player on a roof still sees an unbroken line
> where the street was.

Three more rules, each cheap and each machine-checkable:

| rule | value | why |
|---|---|---|
| **junctions stay open** | no trunk within `JUNCTION_CLEAR = 2` columns of a street intersection | a crossing is the most legible object in a grid, and the walkability audit's own clutter vocabulary already says a junction with courses crossing it is a maze |
| **sight-line runs** | from any spine column, the unobstructed run along the street axis is ≥ `SIGHT_MIN = 24` columns, or the whole street if it is shorter | this is the number that makes "grid at city scale" a measurement rather than an opinion |
| **trunk spacing** | elected trunks are ≥ `STREET_TRUNK_SPACING` apart in Chebyshev distance (§7: 10 / 8 / 5 by band) | independent per-column election gives a hedge, not a colonnade. The same lesson as the base plan's cluster field |

Election order is a deterministic sweep in column order (`z` then `x`) over the
eligible set, taking a column when its channel-57 draw is under the band's share
**and** it violates none of the four rules against the columns already elected.
Order-dependent, but the order is fixed and positional, so the result is a pure
function of the seed — the same discipline `infillLot` uses and for the same
reason.

### 6.3 U2 — growth never seals a route

The traversability guarantee is not argued, it is **checked, and then repaired**,
which is `reachOrRefuse`'s pattern applied to a street:

1. build the pedestrian graph over the district's street bands using
   `walkability.ts`'s own **reciprocal-move** rule — an edge exists only when the
   move is level or a half-block rise that can be walked back down. The base
   plan's §8 uses the audit as a bar; this uses its law as a predicate, and the
   distinction matters: the physics lint's agent may drop three blocks and would
   happily declare a street connected that a player cannot climb back out of;
2. require: the open (non-body-blocking) street columns of each district form
   **one** component, every spine is unbroken end to end, and the district's
   entrance column is in that component;
3. on failure, **withdraw** elected trunks in reverse election order until it
   passes, and count the withdrawals.

And the acceptance bar is differential rather than absolute, because a golden
number cannot say whether a change was caused by this pass:

> **The walkability audit's numbers on a ruined fixture, compiled with the street
> colonizer on, may not be worse than the same fixture compiled with the
> colonizer off.** `components`, `orphanColumns`, `entranceReachableShare` — the
> colonizer's contribution to each must be exactly zero.

### 6.4 Trunks are the scatter's; everything shorter is the skin's

The division of labour, stated once so no one builds a second tree:

- **Trunks** — anything with wood in it — are placed by the **existing flora
  scatter** (pass 6, `scatterForests`), through the opened eligibility above.
  The scatter owns species, spacing, clumping, slope, snow line, biome and the
  entire flora grammar; WP-6 adds not one line of tree generation. This is the
  closure's own pattern, reused deliberately.
- **Everything under two blocks** — shrubs, ferns, tall grass, azalea,
  `sweet_berry_bush`, moss — is the skin's, written in the structures pass on
  channel 59.

One coupling is needed for the scatter to actually take the offer: the clearing
lift (`liftRuinClearing`, `RECLAIM_CANOPY_GAIN = 0.8`) raises a *density*, and a
density of 0.8 on a lattice with spacing 5–7 will decline most elected columns.
So:

> `clearing[idx] := 1` on every column of `colonized`.

An elected column is one the street law has already decided should carry a tree;
the scatter's job there is to say *which* tree, not whether. The lift stays as it
is for the surrounding open ground.

The skin plants nothing on a surface a plant cannot live on:

> **The skin plants only on ground it has itself turned to soil or moss.** The
> substitution runs first, the planting second, in one pass. An azalea on
> polished andesite pops on the first tick, and a tuft of grass on a paving slab
> is the `flower_pot` lesson in a third costume.

## 7. Intensity scaling — one dial, one table

The base plan's §6 states that the band table is *"the only place these numbers
appear"*, and WP-6 keeps that literally true: it adds **one field** to
`DecayBandRow` in `decay.ts` and derives everything else from it by a fixed
ratio table stated once.

| band | `decline` | `skin` | the read |
|---|---|---|---|
| `light` | 0.35–0.55 | **0.25** | moss in the joints, ivy on a north wall, weeds at the kerb. *Neglected.* |
| `heavy` | 0.55–0.80 | **0.55** | walls half green, windows stuffed with leaves, moss across the pavement, saplings on the sidewalk. *Overgrown.* |
| `total` | 0.80–1.00 | **0.85** | every face green to the head course, trees standing in the carriageway, the ground one continuous carpet — and the crumble profile still readable against the sky. *Buried.* |

Derived, and these ratios are the whole of the tuning surface:

| constant | from `skin` | light | heavy | total |
|---|---|---|---|---|
| `WALL_FACE_SHARE` | `skin` | 0.25 | 0.55 | 0.85 |
| `CLIMB_REACH` (share of face height a strand covers) | `0.4 + 0.6·skin` | 0.55 | 0.73 | 0.91 |
| `MOSSY_PICK` (weight of the mossy member, §4.2) | `skin` | 0.25 | 0.55 | 0.85 |
| `LICHEN_SHARE` (of climbers, undersides only) | `0.15·skin` | 0.04 | 0.08 | 0.13 |
| `OPENING_PLUG` | `max(0, 1.2·(skin − 0.35))` | **0** | 0.24 | 0.60 |
| `CARPET_SHARE` (rubble tops, wall heads) | `0.8·skin` | 0.20 | 0.44 | 0.68 |
| `PAVEMENT_SHARE` (surviving pavement, ruin yards) | `0.7·skin` | 0.18 | 0.39 | 0.60 |
| `STREET_SIDEWALK_SHARE` (shrubs and tufts) | `skin` | 0.25 | 0.55 | 0.85 |
| `STREET_CARRIAGEWAY_SHARE` | `0.6·skin` | 0.15 | 0.33 | 0.51 |
| `STREET_TRUNK_SHARE` (of eligible columns electing a trunk) | `0.12·skin` | 0.03 | 0.07 | 0.10 |
| `STREET_TRUNK_SPACING` | `round(4 + 8·(1 − skin))` | 10 | 8 | **5** |
| `SPINE_WIDTH` | `skin ≥ 0.7 ? 1 : 2` | 2 | 2 | **1** |

Three things this table is saying on purpose:

- **`light` plugs no openings.** A neglected building with leaves growing out of
  its windows is not neglected, it is abandoned, and the band boundary is where
  that changes.
- **`total` narrows the spine.** The most overgrown band gets the tightest lane,
  which is the "buried" read; it is also the highest-risk row, and §6.3's
  withdraw loop is what makes it safe to try rather than something to argue
  about.
- **The trunk share is small and the spacing does the work.** 10% of eligible
  street columns sounds like nothing and reads as a wood, because spacing 5 turns
  a scatter of points into a canopy.

The band is read from the ruin field, not from a per-lot decision: the skin
samples the field at the column, and `bandForIntensity` (already exported by
`decay.ts`) converts it. One function from intensity to a band, already shipped,
already tested, and now with one more caller.

## 8. Physics, the new rule, and the zero bar

A green city lints zero on every rule, exactly as everything else does.

| rule family | risk | construction |
|---|---|---|
| `unsupported.chain` | a `moss_carpet` on a slab, a kerb cap or a fence | the level law (§5): carpets only on `canSupport` full cubes |
| `unsupported.*` | a plug or a substitution that unsupports a fixture the fit-out left | the skin only ever *adds* into air or substitutes cube-for-cube, so no fixture loses support. Asserted, not assumed |
| `floating.isolated` | a leaf plug's outward bulge with air on six sides | the bulge is 6-adjacent to the opening cell by construction, and the opening cell is 4-adjacent to the wall |
| `traversal.unreachable` | a plug in a body course sealing a room | §4.3's `bodyFits` rule; `reachOrRefuse`'s proof is preserved rather than re-run |
| `traversal.no_start` | growth over a door or its approach | the base plan's first guarantee, extended to growth |
| `fluid.*` | a waterlogged vine or lichen | every multi-face block the skin writes carries `waterlogged = false`. `quench` goes the other way, by law |
| walkability audit | trunks and shrubs in the street | §6.3's differential bar and the withdraw loop |

And one addition, because the feature's characteristic failure is silent:

> **Rule 27, `unsupported.multiface`.** For every `vine`, `glow_lichen` and
> `sculk_vein`-family block in the world: at least one face property is `true`
> and names a neighbour that `isFullCube`; and `up = true` only where the block
> directly above `isFullCube`. Findings, as always, not throws.

The 26 shipped rules cannot see this class of defect at all — `support.ts` puts
`vine` in `INSUBSTANTIAL` and returns `null` from `supportDirection`, which is
right for what those rules ask and leaves a mis-faced vine invisible to every
one of them. It is also the exact defect Kai found by eye twice on the flora
side. The compiler should find it the third time. The rule lands in WP-6a, with
the whole existing world corpus as its zero baseline, so it is proven not to
fire *before* anything relies on it.

As always: the bar is a **compiled world read back off disk and linted**, not a
unit test.

## 9. Report and diagnostics

| code | severity | when |
|---|---|---|
| `LOAM-I514 GREEN_SKIN` | info (compile) | per settlement: columns skinned, climbers, lichen, plugs, carpets, pavement substitutions, street trunks elected, shrubs, and the legibility metrics — shortest sight-line run, spine columns, junction clearances |
| `LOAM-W513 GREEN_SKIN_WITHDRAWN` | warning (compile) | §6.3's withdraw loop removed elected trunks, with the count and the district |
| `LOAM-W514 GREEN_SKIN_NO_SPECIES` | warning (compile) | the green rule fell through to the climate fallback because no forest node covers the settlement (§4.6) |

`LOAM-I514` is not optional, for `LOAM-I512`'s reason: *"the district ruined 0
of 84 lots"* was the sentence that had to appear somewhere a human looks, and
"the skin wrote 0 blocks because the field was empty" is the same sentence about
the same failure mode one layer up. DESIGN's second failure mode is machinery
that exists and never runs.

A sustained `W513` rate is a finding about `STREET_TRUNK_SHARE`, not about the
withdraw loop.

## 10. Kit teaching

Two edits, both small, because the authoring surface does not change: `decline`
still says all of it.

**In the `district` subsection**, appended to the ruined-city paragraph:

> At high `decline` the compiler also writes the green **onto** the city, not
> only between its buildings: ivy up the standing walls, moss across the
> pavement, leaves in the window holes, and — from about 0.8 — trees standing in
> the carriageway itself. The street grid stays readable and every street stays
> walkable end to end; that is a compiler guarantee, not something you tune.

**Amending the `avoidTags` paragraph**, which currently promises more than it
now delivers:

> Keep `avoidTags: ["structure", "road", "plaza"]` on your forest nodes. It is
> what keeps trees out of your buildings and off your streets — **except inside a
> ruined quarter at high `decline`**, where the compiler deliberately lets a
> share of the street back to the wood. If you want a ruined city with clean
> streets, lower `decline` below 0.8; there is no separate dial and there will
> not be one.

## 11. Work packages

Five waves. WP-6a writes no blocks; WP-6b–d are the feature; WP-6e is the walk.

### WP-6a — the surface index, the shared vocabulary, and rule 27

Build `structures/green-skin.ts` with the surface index (§3.2) and the reach
guard (§3.4), wired into `structures/index.ts` as the last pass and returning
nothing. Add `stdlib/structures/greenery.ts` with `growthFaces` (§4.1). Add
`unsupported.multiface` to the physics lint (§8). Publish
`grounds.ts`'s `ruinYardColumns` and the district band masks the later waves
need. Add the `foliage.glow_lichen` palette symbol.

*Machine checks:* twelve control worlds byte-identical; **every existing
`examples/` world byte-identical**, ruined ones included, since the pass writes
nothing; rule 27 fires **zero** on the whole shipped corpus; `growthFaces` and
`parts.ts`'s `hangingFaces` agree on every flora input (property test); index
build time and peak memory measured and reported on the largest metropolis
fixture.

*Walk assertion:* none. This wave is invisible on purpose, and that is what it
proves.

### WP-6b — the vertical skin

Climbers and strands (§4.1), the mossy re-clad lift (§4.2), openings and leaf
plugs (§4.3), glow lichen (§4.4), the silhouette law (§4.5), species resolution
(§4.6).

*Machine checks:* lint zero on all 27 rules on a compiled `decline: 0.95`
fixture read off disk; **zero leaf blocks with `persistent = false`** anywhere
the skin wrote; zero vines whose every true face points at air; zero growth in a
door column, its lintel or its approach; determinism (compile twice,
byte-identical); positional independence (add a landmark elsewhere in the
document, assert the skin's block list is unchanged); monotonicity (climber and
carpet counts non-decreasing across a `decline` sweep at fixed seed — the
monotone-green law, machine-checked); control worlds still byte-identical; every
moved `examples/` world justified move by move by differential build.

*Walk assertion (Kai):* standing in a `total` quarter, **the walls are wearing
the plants** — most surviving faces carry visible green from the street, window
holes read as stuffed with leaves, and the crumble line is still legible against
the sky from fifty blocks away. At `light`, a walk should read "nobody has
maintained this", not "abandoned".

### WP-6c — the horizontal skin

Rubble tops, wall heads and parapets, surviving pavement, `ruin_yard` ground
(§5). The level law and its substitution discipline.

*Machine checks:* lint zero; **no level moved** — assert every substituted
column's top-surface Y is identical to the same world compiled with
`PAVEMENT_SHARE = 0`; no carpet on a non-`canSupport` block; walkability audit
`components` / `orphanColumns` / `entranceReachableShare` unchanged from the
same world with the horizontal skin off; ground-contract harness clean.

*Walk assertion:* the ground under a ruin reads as **a meadow with walls in it**
— rubble heaps are green mounds, the pavement is patchy moss rather than clean
stone, and there is no visible line where a dressed lot ends and the yard begins.

### WP-6d — the street colonizer

The election, the opening of `reclaimOpen`, the spine and its meander, junction
clearance, sight-line runs, trunk spacing (§6.1–6.2); the U2 check and the
withdraw loop (§6.3); the clearing lift to 1 on elected columns and the
scatter integration (§6.4).

*Machine checks:* the differential walkability bar of §6.3 — colonizer on vs
off, **no metric worse**; every spine unbroken end to end (a direct check on the
street mask); shortest sight-line run ≥ `SIGHT_MIN` on every street of the
fixture; zero trunks within `JUNCTION_CLEAR` of an intersection; zero trunks on
`building` / `interior` / `farm` / `courtyard` / `prop` columns; zero trunks
anywhere in a world whose ruin field is empty (the closure, still closed);
`W513` withdrawal rate reported and under 5%; lint zero.

*Walk assertion:* **there are trees standing in the street**, and from a rooftop
the grid is still obviously a grid. A walker can traverse any street of the
quarter end to end without jumping and without breaking a block.

### WP-6e — bands, kit, and the P4 re-walk

Land the §7 table, the §10 kit sentences, and regenerate the P4 battery
candidate Luna-e2e from the text prompt (never hand-authored — the 2026-08-02
standing decision). Tune on the walk, in the table only.

*Machine checks:* the whole suite; `LOAM-I514` present and non-zero on the P4
world; the 0.5 and 0.95 fixtures differ in the skin counts by the ratios §7
predicts.

*Walk assertion (the acceptance walk):* Kai's own sentence answered — the
streets, the walls and the ground **are** actively overtaken; a `decline: 0.5`
quarter and a `decline: 0.95` quarter do not look alike; and a world with no
`decline` at all looks exactly as it did before F19 existed.

## 12. Risks

1. **The surface index is where this fails.** If it cannot distinguish a face
   from air on some pass's output — a courtyard arch, a bridge soffit, a
   retaining wall's coping — the skin writes vines that render as nothing and
   the walk says "still not overgrown" while every counter reads healthy. That
   is the countable-proxy trap with a new hat on. Mitigation: WP-6a measures the
   index against a *readback* of the compiled fixture, not against its own input.
2. **Leaf persistence.** §4.3's `persistent = true` is one boolean between a
   green city and a city that is green for ten minutes. It is checked in WP-6b
   and it is checked on a world read back off disk, because a unit test on the
   op list would have passed either way.
3. **The street colonizer versus the walkability goldens.** Trunks in a
   carriageway are clutter by the audit's own vocabulary, and the goldens are
   *defect* goldens that must go down. §6.3's differential bar is the mitigation;
   §14 Q6 asks whether ruined fixtures should carry their own golden set at all.
4. **Too much green, evenly.** A share applied uniformly over every face produces
   a fuzz rather than a colonization — real ivy is patchy, it climbs one wall and
   not its neighbour. If the walk says "green everywhere and nowhere", the fix is
   a low-frequency clumping field over the face draw, exactly as the ruin roll's
   cluster field answers the salt-and-pepper problem. Held in reserve rather than
   built up front, because it is one multiplier and adding it blind is how a
   feature acquires two tuning surfaces.
5. **Cost.** The index is the first thing in this compiler that wants random
   access to the whole structure block list. Bounded by the ruined-column
   restriction (§3.2), measured in WP-6a, and cut to per-district indices if the
   metropolis fixture says so.

## 13. What is deliberately out

1. **Root damage and geometry deformation.** No cracked, split, heaved, tilted or
   displaced blocks; no plant moves a block. The skin substitutes cube for cube
   and adds into air, and that is the whole of its physical vocabulary. Roots
   through masonry is a geometry claim and geometry belongs to the crumble.
2. **Animated or spreading growth.** Nothing that propagates on a tick. Every
   leaf is `persistent`, no `sculk` family, no bonemeal-driven spread modelled,
   no growth stages. Determinism forbids it and the walk does not need it.
3. **Biome changes.** The land-use clamp is untouched. An overgrown metropolis
   stays in whatever biome it was: painting jungle under it would change grass
   colour, weather, mob spawns and ambient sound, which is a world claim nobody
   arbitrated and which would leak straight past the ruin field's edge.
4. **Anything outside the ruin field.** No skin on a settlement that ruins
   nothing, on a district below the onset, or on natural terrain. The wood
   outside the city is the scatter's and stays the scatter's.
5. **Water.** No ponds in the streets, no marsh in the ruin, no swamp. `quench`
   goes the other way by law, and a ruin that holds water is a fluid-lint finding
   waiting for the first tick.
6. **New species and new flora programs.** Large hanging growths, ivy as a
   dedicated part, wall-climbing programs — all `FLORA-GRAMMAR-v0` WP-C's
   business. WP-6 writes `vine`, `glow_lichen`, `moss_block`, `moss_carpet`,
   leaves and the existing ground-cover set, and nothing else.
7. **Underground.** Cellars, crypts and tunnels stay dry and bare (base §13.9). A
   ruined shell keeps its intact cellar, which is still what P4's hideout wants.
8. **Bespoke program output.** Hash-verified geometry is never written over (base
   §4.3). A `authored:` program that wants ivy writes ivy.
9. **Interior colonization beyond what `decay.ts` already does.** The fit-out
   owns the inside of a shell; the skin owns the outside. Two surfaces, two
   owners, one law each.
10. **Entities, spawners, loot, narrative props.** Unchanged from base §13.5.

## 14. Open questions — with a recommendation on each

**Q1 — is glow lichen universal, or theme-gated?**
It is the only light a quenched ruin can have (§4.4), which argues for
everywhere; it is also unmistakably fantastical, which argues against a
medieval-realist ruined village glowing at night.
*Recommendation:* gate it on the palette symbol, present in `fantasy`, `arcane`
and `tech` themes only, and ship P4 with it (a "high-tech apocalyptic hideout"
is squarely in the yes column). One symbol; trivially reversible either way.
**Worth a popup — Kai may simply want it everywhere.**

**Q2 — where do species come from when the document declares no forest node?**
The green rule (§4.6) says "the wood this city stands in", and a prompt can
easily produce a ruined city with no `scatter.forest@0` anywhere near it.
*Recommendation:* the climate fallback table, and `LOAM-W514` so it is visible
rather than silent. Not a seeded pick — unpredictable is the wrong property for
a thing the eye compares against the surrounding landscape.

**Q3 — `SPINE_WIDTH = 1` at `total`: too tidy, or too tight?**
One column is the narrowest lane that can be guaranteed continuous, and it is
also the one number in §7 most likely to be wrong in the walk.
*Recommendation:* ship 1, walk it, expect to move it once. If it reads as a
suspiciously convenient footpath, the fix is the meander amplitude before it is
the width.

**Q4 — should the skin reach a quarter with high `decline` but no ruined lots?**
Below `RUIN_ONSET = 0.35` no shell ruins, so there is no field, so a `decline:
0.3` town gets no skin at all — while `decay.coverage` has already worn its
paint and its paths.
*Recommendation:* no, not in v0. The reach law's structural guarantee is exactly
"no field, no skin", and buying a little ivy on a tired village by making the
skin read `decline` directly would put a second, unguarded path into the same
mechanism. If walks ask for ivy on a merely tired town, that is a `decay.*` row
of its own.

**Q5 — may a tree grow out of a roofless shell's interior?**
Kai's ruling names streets. The shells stay hard-closed by the `building` and
`interior` tags, so today a roofless ruin is a stone box with a clean floor —
and *a tree bursting out of a roofless nave* is arguably the single strongest
overgrown image available.
*Recommendation:* yes, at `total` only, **one** trunk per shell, sited in a cell
`reachOrRefuse`'s flood does not need and never in the door's approach, with the
canopy allowed above the wall head. It is a dozen lines on top of WP-6d's
machinery. **This needs Kai — it crosses a line the base plan drew deliberately
(base §4.3, "a tree standing in a footprint grows through a wall"), and it is
worth crossing only if he wants the image.**

**Q6 — should ruined fixtures share the walkability goldens?**
Street colonization raises the audit's clutter numbers by design, and those
numbers are defect goldens that must go down. Sharing one set makes "the ruin got
more overgrown" indistinguishable from "the town got worse".
*Recommendation:* give ruined fixtures their own golden set, with the
colonizer-off compile as their baseline (§6.3's differential bar formalised). It
keeps the town goldens meaningful and it makes the ruin's goldens say the thing
they should say: *the growth cost nothing*.
