# Flora Grammar v0 — canopy giants, ancients, fungal, fantasy strata

> **STATUS: DRAFT v0 — awaiting ratification (2026-08-07).** The load-bearing
> decisions were made and ratified by the orchestrating session; this document
> is that skeleton fleshed into the normative spec. It is written to be built
> from cold: an implementer with no memory of the conversation should be able to
> land WP-A from §3 alone. Nothing here changes existing behaviour by default —
> see §2 (the reach law), and §9.1 for the one place that law is in genuine
> tension with a defect we found while writing this.
>
> Companions: `docs/DESIGN.md` (roadmap: "the biggest visible gap outside
> settlements"), `docs/LOAM-TERRAIN-PROFILE-v0.md` (today's `scatter.forest@0`),
> `packages/compiler/src/terrain/vegetation.ts` (today's implementation).

## 1. What this is, and why

Today every forest in every world is built from **four tree shapes**
(`spruce_tall`, `spruce_squat`, `oak_round`, `birch_slim`) over **two geometry
closures** (`conifer`, `blob`) — a lollipop vocabulary. At walking scale and at
vista scale the wilderness reads as uniform stubble: no anchor trees, no age,
no vertical structure, nothing a player screenshots.

The flora grammar replaces the hard-coded template table with a **grammar of
deterministic shape programs**, a **species registry** built on them, and a
**strata model** that composes a forest vertically the way real (and fantasy)
forests are composed. It is a terrain-side change: settlements, clearing masks
and the land-use biome clamp are untouched.

Three registers of ambition, all in scope for v0:

- **Naturalistic depth** — canopy giants (emergent, multi-column trunks, root
  flare, real branches), ancients (bent, gnarled, half-dead), understory trees
  and large shrubs beneath the canopy.
- **Fungal** — giant mushrooms (stem + cap), fungal groves as a forest type.
- **Fantasy strata** — crystal and glow flora as *materials + light* over
  reused geometry, reachable only by explicit authorship (see §2).

## 2. The reach law (byte-identity)

**A document that does not ask for the new flora compiles byte-identically to
today.** Same law as the intent layer, enforced the same way (a test compiles a
pre-grammar fixture on both sides of the change).

Consequences, decided:

- The existing four shapes keep their names, geometry and defaults. They are
  *re-expressed* as grammar programs (§3), and byte-identity through that
  refactor is the proof of the re-expression (WP-A, §8).
- Default forest composition does not change. Richer composition is reached by
  **authorship**: new species names in `params.species`, the new `strata`
  param (§5), or the `character.flora` intent row (§6) — never by new
  defaults. The product still improves everywhere, because the **kit** teaches
  the authoring model the new vocabulary (§7); that is the same path every
  intent dial took.
- Fantasy flora is *never* reachable from climate defaults — only explicit
  species lists or `character.flora`. A "medieval fishing village" prompt can
  not sprout glow trees by accident.

**Why the reach law is cheap here, and it is worth knowing why.** Every random
draw in `scatterForests` is *position-keyed*: `positionFloat(stream, x, salt, z)`
is a pure function of the column and the salt, never of a sequential RNG state.
So a new draw introduced for a new species does not shift any draw an old
species makes — there is no stream to desynchronise. Adding programs, adding
species, adding a whole stratum pass on its own stream: none of it can move a
document that does not use them. The one thing that *would* move an old world is
changing a block **state** an old species already writes, which is exactly what
§9.1 is about.

## 3. Shape programs (the grammar)

A **shape program** is a deterministic function from a variation record, a
species definition and a seeded RNG to a block list — the generalisation of
today's `conifer`/`blob` closures. Registry `SHAPE_PROGRAMS`, closed vocabulary,
in `packages/compiler/src/terrain/flora/` (new directory; `vegetation.ts` keeps
scatter/eligibility and re-exports, so no existing importer changes).

```ts
interface FloraVariation {
  readonly height: number;        // trunk height, drawn from the species envelope
  readonly radiusDelta: number;   // canopy jitter, as today
  readonly mega: boolean;         // kept for compatibility; giants use species tiers instead
  readonly lean?: Vec2;           // unit-ish trunk drift per 4 blocks of rise (ancients)
  readonly age?: number;          // 0..1; drives gnarl, deadwood share, canopy thinning
}

interface FloraBlock {
  readonly dx: number; readonly dy: number; readonly dz: number;
  readonly part: FloraPart;
  /** For "branch": the log axis; the emitter maps it to an oriented log state. */
  readonly axis?: "x" | "y" | "z";
}

type FloraPart =
  | "log"        // vertical trunk log
  | "branch"     // oriented log; NEW — what makes a giant read as a tree, not a pole
  | "root"       // trunk-material flare at/below grade; seats into the ground
  | "leaves"
  | "cap"        // fungal cap material
  | "stem"       // fungal stem material
  | "hanging"    // vines / hanging leaves / glow strands, attached under canopy
  | "deco";      // rare accents (glow blocks, shelf fungi on ancients)

interface FloraProgram {
  readonly id: string;
  /** Horizontal reach, in blocks. Used by clip pre-rejection, the shade map and §5's spacing. */
  canopyRadius(v: FloraVariation, def: FloraSpeciesDef): number;
  /** The blocks of one plant, trunk base at the origin. */
  blocks(v: FloraVariation, def: FloraSpeciesDef, rng: () => number): FloraBlock[];
}
```

### 3.1 The RNG, and why it is position-keyed

Law 5 (below) says a program sees only its variation and an injected RNG. The
skeleton wrote that seed as `hash(worldSeed, nodePath, treeIndex)`. **Use the
tree's column, not its index**: `rng = xoshiro(streamSeed(node.seed,
"flora.program"), x, z)`. `vegetation.ts`'s own header states the invariant that
forbids the index form — "no sequential RNG, so the forest is identical however
the region is traversed" — and an index is exactly a traversal fact. Two trees
of the same species at the same column in two different documents get the same
geometry; that is fine and is already true of every other draw in the pass.

`conifer` and `blob` **never call `rng`**. A test wraps it in a counting proxy
and asserts zero calls for those two programs, which is a cheap, exact guard on
the re-expression (§8, WP-A).

### 3.2 The emitter mapping — parts to block states

Today the mapping is one line (`emit.ts:440`): `part === "log" ? trunkState :
leafState`. The parts model needs five more, and all of them obey one rule:

> **The palette symbol decides the block; the program's own block set decides
> the orientation.** Nothing else may look at the world to decide a state.

| part | block | orientation, derived from the program's block set |
|---|---|---|
| `log` | species `trunkSymbol` | default state (`axis=y`) |
| `branch` | species `trunkSymbol` | `axis` = the block's own `axis` field, applied by decoding the trunk state and re-encoding it — the exact idiom `placeFallenLog` already uses (`grounds.ts`: `stack.blockStateProps` → `stack.blockStateOf(name, {...props, axis})`) |
| `root` | species `rootSymbol`, default `trunkSymbol` | `axis=y` |
| `leaves` | species `leafSymbol` | see §9.1 — `distance`/`persistent` are the open decision |
| `stem` | species `stemSymbol` | the six mushroom booleans: a face is `true` iff no `stem`/`cap` block of the same plant sits against it |
| `cap` | species `capSymbol` | same six-boolean rule |
| `hanging` | species `hangingSymbol` | **one boolean per face, each naming a face the block is actually attached to** (*corrected 2026-08-08; this row originally said `up=true` universally, which renders every vine as a flat ceiling plate — Kai's walk of `oldgrowth_vale-2`, "vines are oriented wrong"*). Derived top-down from the plant's own block set: (1) each **horizontal** 6-neighbour that is a `log`/`branch`/`root`/`stem`/`leaves`/`cap` of the same plant sets its face `true` — the sheet lies against the wood; (2) `up=true` **only** when the block directly above is such a support; (3) otherwise the block belongs to a chain and carries the **strand's one canonical horizontal face**; (4) a block left with no face has no deducible support and is **dropped**, not emitted unsupported.<br/>*Chain rule corrected 2026-08-09* (Kai, walk of `oldgrowth_vale-3`: "some vines are corrected, some still mis-faced"). Rule 3 previously inherited the parent's **whole** face set, which propagated `up=true` down entire curtains — 9,148 of the fixture's 14,102 vine blocks then carried a face set whose every true face pointed at air, and that inherited `up` is the flat plate hanging at an odd offset in mid-air. Vanilla's `VineBlock.getUpdatedState` re-derives `up` from "is the block above a sturdy down-face" (a vine is not sturdy, so an inherited `up` is illegal and pops on the first block update), while a **horizontal** face survives when "the vine directly above carries that same face". A chain may therefore propagate exactly one thing: one horizontal face. Each strand (a contiguous vertical run of `hanging`) takes its **canonical face** from the topmost segment with a genuine horizontal support of its own — position-keyed tiebreak when that segment touches several — and every segment below carries it, so the sheet never zigzags between cell edges. Rule 1 still stands on top of that: a segment may additionally show a face it is genuinely flush against at its own level, never one it is not. A strand that never finds a horizontal support keeps its legal `up` head and is dropped below it |
| `deco` | species `decoSymbol` | if the block declares `facing`, it faces **away from** the one 6-neighbour that is a `log`/`branch`/`stem` of the same plant — the amethyst convention: `facing` is the growth direction and the support sits on the opposite face (*corrected 2026-08-07; this row originally said "toward", which renders the cluster detached*); if there is no such neighbour, the block is dropped |

The mushroom-face rule is what makes a giant mushroom read as a mushroom rather
than as a red cube pile: vanilla's outer cap blocks show cap texture on their
outward faces and pore texture inward, and "outward" is computable from the
block set alone.

`TreePlacement` grows the state ids these need (`rootState`, `capState`,
`stemState`, `hangingState`, `decoState`, all optional), resolved from the
palette at scatter time exactly as `trunkState`/`leafState` are today. A
placement that resolves no symbol for a part its program emits is a compiler
bug, not a document error: `palette.entry` already throws on an unknown symbol.

### 3.3 The six laws

Grammar-level tests run every program across its parameter-envelope **corners**
(min/max height × `radiusDelta` ∈ {−1, 0, +1} × `mega` ∈ {false, true} ×
`age` ∈ {0, 0.5, 0.85} where the program reads it).

1. **No log is the topmost block of its column.** The mega-spruce lesson,
   already in `vegetation.ts` and already pinned by
   `composition.test.ts` → "never leaves a log as the top of its column";
   promoted from a per-template fix to a law. **Read `log` as the whole
   wood family — `log`, `branch` and `stem`** — because a bare mushroom stem
   poking through its own cap is the same defect wearing a different block.
   *Amended 2026-08-07 — see §9.4: suspended as a universal law. Accidental
   masts are prevented at the source (`capWood` on live constructions,
   asserted per program); deliberate standing dead wood is legal.*
   *Amended again 2026-08-07 (grandeur): `capWood` skips **buttress ridges**
   (§3.7.1). A root ends in a root; the ridges are the one enumerated live-wood
   exception, and the catalog matrix asserts they are the only bare tops.*
2. **Every canopy block is within leaf-BFS distance 6 of a
   `log`/`branch`/`stem`** — BFS through the plant's own canopy blocks, which
   is the metric vanilla's `distance` actually uses (*ratified 2026-08-07; the
   skeleton said "taxicab 5", a stricter and different metric than the
   game's*), so leaves survive without `persistent` hacks. See **§9.1**: the
   emitter does not write the state that makes this true today, and fixing it
   moves worlds. **One frozen exception, measured by WP-A:** the shipped
   mega-spruce whorl reaches taxicab 6–7, leaving up to 32 canopy blocks per
   mega tree unreachable; the reach law outranks law 2, so the exception is
   pinned as an enumerated list with an exact count (a regression in either
   direction fails). *Population correction (2026-08-07, measured at the
   flip): "32 per tree" is the envelope-corner number — on misty-fjords only
   17 of 118 mega spruces strand any canopy (3×32 + 14×16 = 320 blocks,
   236 surviving last-writer-wins), all mega, none anything else.* The flip
   itself landed 2026-08-07 (`LEAF_STATE_POLICY = "computed"`, Kai's go
   after observing live decay); the whorl keeps its geometry and its
   stranded blocks ride as counted `persistent` exceptions.
3. **Branches are connected**: every `branch` block is 6-adjacent to another
   `branch`/`log`. No floating limbs. The construction that guarantees it is
   always the same — **a branch walk steps one lattice axis per block, never
   diagonally** — and every program below that grows a limb says so.
4. **Roots seat**: `root` blocks at `dy ≤ 0` only; the scatterer sinks them to
   ground like `claimTrunk` seats trunks today. *Extended 2026-08-07 (§3.7.1):
   a buttress flare also has wood **above** grade, and that wood is a `branch`,
   not a `root` — so the law reads unchanged, and the flare seats by filling
   every ridge column downward `rootDepth` blocks rather than by reading a
   heightfield law 5 forbids it to see.*
5. **Determinism**: the program sees only its `FloraVariation`, its
   `FloraSpeciesDef` and the injected RNG (§3.1). No globals, no wall-clock, no
   reads of the plan.
6. **Canopy connectivity** *(promoted from corollary, ratified 2026-08-07)*:
   every program emits its canopy in 6-connected components that each touch
   wood. Not decorative — the physics lint's `floating.isolated` rule fires on
   any **full cube** with air on all six faces, and `isFullCubeName` does not
   exclude `_leaves` (leaves' bounding box is `block`), so a stray leaf is a
   lint finding, as is a stray mushroom cap block or a stray shelf fungus. Law
   3 states this for branches; law 6 extends it to `leaves`, `cap`, `stem` and
   `deco`, and WP-A tests it directly rather than waiting for a world lint to
   find it.

**The re-expression is list-identical.** For `conifer` and `blob` the test is
not "the same set of blocks" but **the same array, element for element,
duplicates and order included**. `clipTrees` computes `hit / blocks.length` and
`leavesHit / leaves` against `MAX_CLIP_FRACTION`, so a de-duplicated list
changes which trees are dropped near a structure — and today's closures *do*
emit duplicates (a conifer's `dy = height` layer writes the trunk columns once
in the ring loop and again in the cap loop). Reproduce the duplicates.

### 3.4 `conifer` — the existing spruce, transcribed

Whorled cone: the canopy radius grows downward from the tip in half-block steps
and dips every third layer, which is what makes a spruce read as a spruce and
not as a christmas-tree cone. One parameter, `spread`, from the species.

```
conifer(v, def):                       # spread = def.spread
  trunk = v.mega ? [(0,0),(1,0),(0,1),(1,1)] : [(0,0)]
  for dy in 0 .. v.height-1:
    for (tx,tz) in trunk: emit log(tx, dy, tz)
  cap   = max(1, spread + v.radiusDelta + (v.mega ? 2 : 0))
  start = max(1, floor(v.height * 0.35))
  for dy in start .. v.height:                       # inclusive
    fromTop = v.height - dy
    r = min(cap, floor(fromTop / 2))
    if fromTop mod 3 == 2 and r > 0: r -= 1
    if r == 0:
      if dy >= v.height: emit leaves(0, dy, 0)
      continue
    for dz in -r .. r + (v.mega ? 1 : 0):
      for dx in -r .. r + (v.mega ? 1 : 0):
        if (dx,dz) in trunk and dy < v.height: continue
        qx = v.mega ? min(|dx|, |dx-1|) : |dx|
        qz = v.mega ? min(|dz|, |dz-1|) : |dz|
        if qx*qx + qz*qz > r*r + r: continue
        emit leaves(dx, dy, dz)
  for (tx,tz) in trunk: emit leaves(tx, v.height, tz)   # law 1, every column
```

`canopyRadius = cap`. The invariant the construction protects is law 1 for
**all four** mega columns: capping only `(0,0)` left three bare masts, 262 of
them in one 320² world. Laws 2–4 hold trivially (no branches, no roots, every
leaf is within `cap + 1` of the axis and `cap ≤ 5` across the whole envelope).

| param | source | value |
|---|---|---|
| `spread` | species | 2 (`spruce_tall`), 3 (`spruce_squat`) |
| `height` | species envelope | 8–13 / 5–7, `+4` when `mega` |
| `mega` | species `megaShare` | see §5.5 |

### 3.5 `blob` — the existing oak and birch, transcribed

A squashed ellipsoid seated on the trunk top. Two parameters, `radius` and
`squash`.

```
blob(v, def):                          # radius = def.radius, squash = def.squash
  for dy in 0 .. v.height-1: emit log(0, dy, 0)
  r  = max(1, radius + v.radiusDelta)
  cy = v.height - 1
  ry = max(1, round(r * squash))
  for dy in cy-ry .. cy+ry:
    for dz in -r .. r:
      for dx in -r .. r:
        if dx == 0 and dz == 0 and dy < v.height: continue
        vy = (dy - cy) / ry
        if (dx*dx + dz*dz)/(r*r) + vy*vy > 1.15: continue
        emit leaves(dx, dy, dz)
```

`canopyRadius = r`. Law 1 is protected by construction rather than by a cap
block: `ry ≥ 1`, so the ellipsoid's top layer is at `dy = height − 1 + ry ≥
height`, above the last log, and the `dx==0 && dz==0 && dy < height` guard lets
the trunk column take leaves at and above `height`. `1.15` rather than `1` is
what stops the equator reading as a faceted disc. Law 2 holds for `r ≤ 3`.

| param | source | value |
|---|---|---|
| `radius` | species | 2 (`oak_round`, `birch_slim`) |
| `squash` | species | 1.0 (`oak_round`), 1.4 (`birch_slim`) |
| `crownMin` | species | 1 (default), 3 (`birch_slim`) |
| `crownDrop` | species | 0 (default), 1 (`birch_slim`) |
| `bareShare` | species | 0 (default), 0.4 (`birch_slim`) |

`blob` ignores `mega` entirely, which is why only `spruce_tall` carries a
`megaShare`.

**Amendment, 2026-08-08 — the birch reproportion (Kai's decision after walk-4).**
The crown law above is tied to the *trunk top* and therefore says nothing about
how far **down** the trunk the crown reaches. With `squash ≤ 1` that is a
species-independent bug wearing a species costume: a taller tree gets the same
squat disc over an ever-longer bare pole. Measured on `birch_slim` (heights
6–9, one trunk column): at `h = 9`, `radiusDelta = 0`, the crown was four
layers (`dy` 7–10) over **seven bare white logs** — and at `spacing 3` half of
all birches stood three blocks from another birch (nearest-neighbour Chebyshev
histogram on `oldgrowth_vale`: 3:1158, 4:449, 5:326, …), so several of those
pucks merged into one blob standing over a picket of poles. Kai's word for the
result was *comic*.

Three knobs, each a no-op at its default, so nothing but `birch_slim` moves:

```
  ry = max(1, crownMin, round(r * squash))
  cy = v.height - 1 - clamp(crownDrop, 0, ry - 2)     # law 1, by construction
  floorY = floor(bareShare * v.height)                 # crown clipped below it
  for dy in max(cy-ry, floorY) .. cy+ry: ...           # otherwise unchanged
```

- `crownMin` floors `ry`, so the narrow (`radiusDelta = -1`) draw is a slim
  column of leaves rather than a five-block tuft on a stick.
- `crownDrop` lowers the crown centre. The `ry - 2` clamp is exactly what holds
  `cy + ry ≥ height + 1`, so **law 1 stays true by construction for any drop** —
  no cap block, same argument as before.
- `bareShare` keeps the short end of the envelope from becoming a bush.

`birch_slim` now reads `squash 1.4, crownMin 3, crownDrop 1, bareShare 0.4`: at
`h = 9, rd = 0` the crown is six layers (`dy` 5–10) over five bare logs; at
`h = 6, rd = 0` it is six layers (`dy` 2–7) over two. Law 2 (leaf-BFS ≤ 6) and
the whole six-law matrix are green at every envelope corner.

`oak_round` shares the program and was measured at the same time: at its tallest
(`h = 7`) it stands four bare logs under a five-layer crown — a ratio of 0.8,
never the birch's 1.5–1.75 — so it is **left alone** and keeps its byte-identity.
Every other legacy shape stays list-identical; `flora-identity.test.ts` asserts
both halves of that sentence.

**Species spacing (the second half of the same fix).** `params.spacing` is a
*node* number, and it is the right default: a mixed forest wants its trunks on
one lattice. But a species whose crown is wider than that lattice fuses with its
own kin. `FloraSpeciesDef.knobs.minSpacing` is a **per-species floor** on the
trunk-exclusion distance, enforced by `vegetation.ts`'s `speciesSpacing` against
a **species-private** mask (never the shared `occupancy`, which would push
*other* species away and thin the wood), shared across nodes so two overlapping
forests that both plant birch honour it across the seam, and stamped as a
**Chebyshev square** because `blob` crowns are square in plan — a disk leaves
the diagonals, where two trunks 3 apart pass a Euclidean test of 4. Species
without the knob behave exactly as before. `birch_slim: minSpacing 5` — the new
crown diameter. Measured after: no birch on `oldgrowth_vale` has a birch nearer
than 5 (5:597, 6:564, 7:234, …), and the wood carries 5,533 trees where it
carried 6,025.

### 3.6 `broadleaf` — a deciduous tree that has branches

The point of the program: **a deciduous crown is a set of masses on limbs, not
one ellipsoid.** At 60 blocks the difference is the silhouette's outline — a
blob is convex, a broadleaf is lumpy and asymmetric, and the sky shows through
between its masses.

```
broadleaf(v, def, rng):
  for dy in 0 .. v.height-1: emit log(0, dy, 0)
  n    = def.branches.lo + floor(rng() * (def.branches.hi - def.branches.lo + 1))
  fork = max(2, round(v.height * 0.55))
  for k in 0 .. n-1:
    theta = 2*PI * (k + 0.5*rng()) / n
    y0    = fork + floor(k * (v.height - fork) / n)
    L     = def.limb + (rng() < 0.5 ? 0 : 1)          # 3..5
    tip   = walkLimb(from=(0,y0,0), dir=(cos theta, sin theta), run=L, rise=2)
    mass(tip, radius = def.mass + v.radiusDelta, squash = 0.8)
  mass((0, v.height, 0), radius = def.mass, squash = 0.9)   # crown cap, law 1
```

`walkLimb` rasterises the limb by **one lattice axis per block** (law 3),
choosing at each block the axis with the largest remaining error — a 3-D
Bresenham without the diagonal step — and emits `branch` with `axis` set to the
axis it just stepped. `mass` is `blob`'s ellipsoid test (`≤ 1.15`) recentred on
the tip and emitting `leaves`.

`canopyRadius = def.limb + def.mass + v.radiusDelta`. Law 2 holds because every
mass is centred within 1 block of a `branch` and `def.mass + radiusDelta ≤ 4`.
Law 1 holds because of the crown cap, and because each limb's tip mass covers
the tip.

| param | default | range |
|---|---|---|
| `branches` | `[3, 5]` | 2–6 |
| `limb` (limb run) | 3 | 2–5 |
| `mass` (cluster radius) | 2 | 2–4 |

### 3.7 `giant` — the emergent, and the headline of the whole feature

A giant is not a big tree; it is **a column with a ceiling**. Three things carry
that read and all three are load-bearing: a trunk more than one column wide, a
root flare that seats it into the ground so it does not look dropped, and a
crown carried on real limbs high enough that a player walks *under* it.

**Amended 2026-08-07 (the grandeur pass; code is normative).** Kai flew the
canopy of `oldgrowth_vale` and reported *"giants def don't anchor the skyline —
not a single growth meaningfully more grand than vanilla generation"*. The
instrument agreed: the three placed beeches cleared the p95 canopy top within 24
columns by **12, 8 and 5** blocks. The pseudocode below is the amended program;
the root flare of the original — a broken ring of vertical `root` logs — is
struck outright and replaced by §3.7.1.

```
giant(v, def, rng):
  span = def.trunkSpan                                   # 2, or 3 when height >= 24
  cols = { (i,j) : 0 <= i,j < span }
  for dy in 0 .. v.height-1:
    for c in cols: emit log(c.i, dy, c.j)
  # the leader: `def.leader` blocks past the trunk, so the crown centre is wood
  # (law 2) and the upper whorl has a mast to grow from
  for dy in v.height .. v.height + def.leader: emit log(centre, dy, centre)

  buttressRoots(def, span, rng)                          # §3.7.1

  # --- main limbs: the ceiling a player walks under --------------------------
  n    = def.branches.lo + floor(rng() * (def.branches.hi - def.branches.lo + 1))   # 5..8
  base = round(v.height * 0.55)
  for k in 0 .. n-1:
    theta = 2*PI * (k + 0.6*rng()) / n
    y0    = base + floor(k * (v.height - base) / n)
    start = the column of `cols` furthest along theta
    L     = def.limb + floor(rng() * 3)                  # 6..8
    tip   = walkLimb(from=(start, y0), dir=theta, run=L, rise=3)
    mass(tip, radius = def.mass + v.radiusDelta, squash = 0.7)

  # --- the crown: a compound dome, not one mass ------------------------------
  m = def.crownLimbs.lo + floor(rng() * (def.crownLimbs.hi - def.crownLimbs.lo + 1))  # 4..6
  for k in 0 .. m-1:
    theta = 2*PI * (k + 0.5 + 0.5*rng()) / m
    tip   = walkLimb(from=(centre, v.height + min(def.leader, 1 + k mod 2)),
                     dir=theta, run=def.crownRun + (0 or 1), rise = k mod 2)
    mass(tip, radius = def.crown + v.radiusDelta, squash = 0.7)
  mass((centre, v.height + def.leader), radius = def.crown + v.radiusDelta, squash = 0.6)
  capWood()
  if def.hangingSymbol: drapeCrown(def, rng, floor = round(v.height * 0.6))   # §3.7.2
```

`canopyRadius` is the **max** of the three reaches the program now has — main
limbs, crown limbs and buttress ridges — and the scatterer adds `span − 1` to
the trunk claim exactly as it adds 1 for a mega spruce today.

**Why the crown is compound, and this is the load-bearing part of the
amendment.** Law 2 caps a single leaf mass at radius 4 (`MAX_MASS_RADIUS`):
wider, and the leaf BFS runs past 6 and the emitter has to write `persistent`
leaves. A radius-4 dome is not a skyline. Four to six *masses*, each centred on
wood — a short limb off the leader — make a crown of radius 9 or 10 in which
every leaf is still within BFS 6 of a branch. That is the difference between a
tall tree and an emergent, and it costs nothing but limbs.

The invariants: **law 1 across every trunk column** — the crown centre mass sits
above `v.height + leader` and its radius is ≥ `span`, so all `span²` columns are
covered, and `capWood` (§3.13.4) closes whatever the limbs leave proud. **Law 3**
via `walkLimb`. **Law 4** is now §3.7.1's business.

| param | default | notes |
|---|---|---|
| `trunkSpan` | 2 | 3 for `height ≥ 24` |
| `branches` | `[5, 8]` | main limbs (`[3, 6]` before 2026-08-07) |
| `limb` | 6 | run, in blocks (4 before) |
| `mass` | 3 | tip cluster radius |
| `leader` | 3 | blocks the trunk runs past `height` (2 before, hard-coded) |
| `crownLimbs` | `[4, 6]` | the upper whorl that makes the crown compound |
| `crownRun` | 4 | run of a crown limb |
| `crown` | 4 | crown cluster radius |
| `height` | 26–34 (`beech_giant`), 30–40 (`kapok_emergent`) | 20–28 / 22–30 before; see §9.2 for the build-limit interaction |

### 3.7.1 `buttressRoots` — the procedural flare

**Ratified by Kai's instinct, 2026-08-07:** *"the root flare doesn't look great…
my instinct is a procedural root generator rather than just a few squares"*. The
defect is exact and worth naming: WP-B's flare wrote **vertical** `root` logs at
grade, and a vertical log shows its ring texture on the **top** face — which at
grade is the only face a standing player sees. The flare read as flat brown
tiles around the trunk.

```
buttressRoots(def, span, rng):
  n = def.buttresses.lo + floor(rng() * (def.buttresses.hi - def.buttresses.lo + 1))   # 4..7
  for k in 0 .. n-1:
    theta = 2*PI * (k + 0.6*rng()) / n
    run   = def.rootRun.lo + floor(rng() * (def.rootRun.hi - def.rootRun.lo + 1))      # 3..6
    (x,z) = the trunk column furthest along theta
    total = |round(cos theta * run)| + |round(sin theta * run)|
    for s in 1 .. total:
      step one lattice axis outward — the axis with the largest remaining error
      h = max(1, round(def.rootRise * (1 - (s-1)/total)))       # tapers to a single block
      for dy in -1 .. h-2: emit branch(x, dy, z, axis = the axis just stepped, buttress)
      for dy in -2 .. -def.rootDepth: emit root(x, dy, z)       # the seat
```

Five clauses, all load-bearing:

- **Radiating, seeded per tree.** `4..7` ridges at jittered angles: no two
  giants share a root plan, and none of them reads as machined. This is what
  replaces the old broken-ring 0.75 draw.
- **A ridge is a chain, not a ring.** It walks outward one lattice axis per
  column, so consecutive ridge columns are 6-adjacent and the first is
  6-adjacent to the trunk. Live buttress wood obeys **law 3** exactly as a limb
  does, and **law 6** follows.
- **Tapering.** `rootRise` blocks tall against the trunk, falling linearly to a
  single block at the toe, over `3..6` columns. Over the flare as a whole the
  profile never rises or thickens further out — the property the tests assert,
  since two ridges may cross and a crossed column takes the taller.
- **Bark, never rings.** Every above-grade ridge block is a `branch` carrying
  the axis the walk just stepped — a **horizontal** log, whose top face is bark.
  `FloraBlock.buttress` marks it (additive to §3); the emitter ignores the flag
  and maps it as any other live branch, so `parts.ts` needs no change. An
  all-bark `wood.*_wood` palette symbol would be a marginal improvement (bark on
  all six faces) and is **not** added: a horizontal log already presents bark on
  every face a player standing at the trunk can see, and a new palette family is
  a new failure mode in the pinned-registry check.
- **Seated by depth, not by terrain.** A program may not read the plan (law 5),
  so the flare cannot follow the heightfield. Instead every ridge column is
  filled downward `rootDepth` blocks with `root` (vertical logs — invisible
  below grade). A toe up to `rootDepth` blocks downhill of the trunk still meets
  solid ground; one uphill is simply buried. This is why `rootDepth` rose from
  2 to 3.
- **Sunk one course** *(amended 2026-08-09 — Kai's walk of `oldgrowth_vale-3`:
  "roots look decent but allow them to go one block lower into the terrain")*.
  The ridge profile now starts at `dy = -1` rather than at grade, so its bottom
  course is buried and the ridge **emerges** from the ground instead of resting
  on it; the toe column, being one block tall, disappears into the terrain and
  the taper melts out rather than stopping dead. `rootDepth` rose 3 → 4 in the
  same move, so three courses of `root` still sit below the buried ridge block
  and the flare grips one block further down a slope than it did. Law 4 is
  unchanged in letter — the buried course is a `branch`, and the law's extension
  already reads "the flare also has wood at and below grade"; what changes is
  that a `branch` may now sit at `dy = -1`, which is what
  `flora-grandeur.test.ts` asserts as its floor.

**Law 4's convention is extended, and law 1 gains its one live-wood exception.**
Law 4 said "`root` blocks at `dy ≤ 0` only"; that still holds — every block the
generator writes below grade is a `root` at `dy ≤ 0`, and its column is filled
to grade. What is new is that the flare also has wood *above* grade, and that
wood is a `branch`, not a `root`. It is therefore the top of its own column, and
**`capWood` skips it**: a root ends in a root, and a leaf on top of one is a
shrub growing out of a tree's ankle. Law 1's target property was never "no
topmost log" but "no *accidental* bare mast" (§9.4), so the buttress ridges are
enumerated rather than capped — `flora-species.test.ts` asserts that the only
bare wood tops in the whole catalog are buttress blocks at `dy ≤ rootRise`.

| param | default | notes |
|---|---|---|
| `buttresses` | `[4, 7]` | ridges per tree |
| `rootRun` | `[3, 6]` | columns a ridge reaches |
| `rootRise` | 3 | ridge height against the trunk |
| `rootDepth` | 4 | below-grade fill, i.e. the slope the flare can seat on (3 before 2026-08-09) |

### 3.7.2 `drapeCrown` — hanging growth on a big tree

Kai, same walk: *"hanging growth genuinely might be underdone… there isn't much
besides vines, but it's difficult without proper large growths."* WP-C owns new
materials (glow lichen, and whatever a "large growth" turns out to be); what WP-B
owes is **more vine, and longer, and hung where it reads** — and, embarrassingly,
`beech_giant` carried no `hangingSymbol` at all, so the temperate old-growth
fixture had zero hanging growth on its landmarks.

The rule is `weeping`'s (§3.12), applied to a giant's whole crown: a curtain
hangs from a canopy column with at least one open 4-neighbour — the **rim**,
never the whole underside, or the crown becomes a solid cylinder — with per-tree
share `hangingShare` and length drawn from `curtain`. Only masses above
`0.6 × height` drape: the walk-under space is the point of a giant, and a vine
curtain across it is a curtain across a cathedral nave. `curtain` emits top-down
and contiguous, so the emitter's support rule never has to drop one.

| param | `beech_giant` | `kapok_emergent` |
|---|---|---|
| `hangingShare` | 0.4 | 0.55 |
| `curtain` | `[3, 8]` | `[4, 9]` |

### 3.8 `ancient` — the tree with a history

A leaning, gnarled trunk with a thinned crown, dead limbs and shelf fungi. The
whole program is driven by two variation fields the others ignore: `lean` (a
direction) and `age` (0..1).

```
ancient(v, def, rng):
  lean = v.lean ?? unit(rng)                             # drawn per tree, position-keyed
  age  = v.age  ?? 0.5
  x = z = 0; fx = fz = 0.0
  for dy in 0 .. v.height-1:
    fx += lean.x / 4 ; fz += lean.z / 4                  # "per 4 blocks of rise"
    if rng() < 0.35 * age: fx += (rng() < 0.5 ? -1 : 1) * 0.6     # gnarl
    if rng() < 0.35 * age: fz += (rng() < 0.5 ? -1 : 1) * 0.6
    nx = round(clamp(fx, -def.leanMax, def.leanMax)); nz = round(clamp(fz, ...))
    while x != nx: x += sign(nx - x); emit log(x, dy, z)  # keep the trunk 6-connected
    while z != nz: z += sign(nz - z); emit log(x, dy, z)
    emit log(x, dy, z)
    if def.decoSymbol and rng() < 0.06 * age: emit deco(shelf beside (x,dy,z))

  limbs = def.branches.lo + floor(rng() * (def.branches.hi - def.branches.lo + 1))
  live  = max(1, ceil((1 - 0.5*age) * limbs))            # age thins the crown
  for k in 0 .. limbs-1:
    tip = walkLimb(from = trunk column at y = round(height*(0.6 + 0.3*k/limbs)),
                   dir = theta_k, run = def.limb, rise = 1 + (k mod 2))
    if k < live: mass(tip, radius = def.mass + v.radiusDelta, squash = 0.75)
    # k >= live: a dead limb — branch blocks and no cluster; see below
  mass((x, v.height, z), radius = max(1, def.mass - round(2*age)), squash = 0.8)
```

The `while` loops are the whole trick and they protect law 1 *and* law 3: the
trunk moves at most one column per block of rise, and it emits every
intermediate column, so however far it leans the trunk is a single 6-connected
component and every column it passes through is topped by the column above it.
The apex mass caps the last one.

**A dead limb is a limb without a cluster, and its `branch` blocks take
`def.deadSymbol`** (a stripped log) rather than the trunk symbol — the emitter
mapping in §3.2 reads the part's own symbol, so this costs nothing structurally.
A dead limb's *tip* is still 6-adjacent to the trunk (law 3), and it is not
topmost in its column only if something is above it — so a dead limb is always
walked with `rise ≥ 1` and terminated by a `deco` shelf block or a single leaf,
never by a bare log.

**`age` is capped at 0.85, and a fully dead standing snag is therefore not
expressible.** Law 1 forbids it outright: a dead snag *is* a log at the top of
its column. This is a real tension between a ratified law written against one
defect (bare mega-spruce masts) and a legitimate piece of scenery; §9.4 puts it
to Kai. v0's answer is the one-live-limb ancient, which is a better-looking tree
than a bare pole anyway.

| param | default | notes |
|---|---|---|
| `leanMax` | 3 | maximum horizontal trunk drift, blocks |
| `branches` | `[3, 5]` | |
| `limb` | 3 | |
| `mass` | 3 | |
| `age` | species envelope, e.g. `[0.4, 0.85]` | drawn per tree |
| `deadSymbol` | species | a stripped log |
| `decoSymbol` | species | shelf fungus |

**Amended 2026-08-07 (the grandeur pass).** An `ancient` in the **emergent**
stratum has a `giant`'s job — it must stand over the wood it anchors — and its
crown *thins with age*, so it needs more trunk than a giant to clear the same
canopy. The envelopes move with §8's prominence bar rather than by taste:
`spruce_ancient` 16–22 → **25–33** (the boreal canopy tops out at 17), and
`desert_ironwood` 10–15 → **17–23** (an `acacia_umbrella` plate reaches 9, and
at `age = 0.85` the ironwood's apex mass is one block). Its limbs grow with it —
`spruce_ancient` takes `branches [4, 6]`, `limb 4`. The geometry of the program
is otherwise untouched; a *canopy*-stratum ancient would not need any of this.

### 3.9 `columnar` — poplar, cypress, crystal spire

The narrowest useful silhouette: a tight vertical ellipsoid over the top half of
the trunk. Deliberately the same `≤ 1.15` ellipsoid test `blob` uses, so the two
read as one family seen from different distances.

```
columnar(v, def):
  for dy in 0 .. v.height-1: emit log(0, dy, 0)
  r  = max(1, def.radius + v.radiusDelta)
  ry = max(2, round(v.height * def.ratio))               # ratio ~0.45
  cy = v.height - ry + 1
  for dy in cy-ry .. cy+ry:
    for dz in -r .. r: for dx in -r .. r:
      if dx == 0 and dz == 0 and dy < v.height: continue
      vy = (dy - cy) / ry
      if (dx*dx + dz*dz)/(r*r) + vy*vy > 1.15: continue
      emit leaves(dx, dy, dz)
```

Law 1: `cy + ry = height + 1 > height − 1`. Law 2: `r ≤ 3` by the parameter
range. `canopyRadius = r`.

| param | default | range |
|---|---|---|
| `radius` | 2 | 1–3 |
| `ratio` | 0.45 | 0.3–0.6 |

### 3.10 `umbrella` — acacia, tree fern, date palm

Bare trunk, flat plate. What makes it read as savannah rather than as a
mushroom is that the plate is **offset** from the trunk and reached by a short
limb, and that there are two plates at different heights.

```
umbrella(v, def, rng):
  for dy in 0 .. v.height-1: emit log(0, dy, 0)
  R = max(2, def.radius + v.radiusDelta)
  # main plate, centred on the trunk: a 1-block disc, thickened to 2 in the middle
  disc((0, v.height, 0), R, thickness = 1)
  disc((0, v.height - 1, 0), max(1, R - 2), thickness = 1)
  if def.plates > 1:
    off  = (sign from rng) * (1 + floor(rng()*2)) in each axis
    tip  = walkLimb(from=(0, v.height - 3, 0), dir = off, run = |off|, rise = 1)
    disc(tip + (0,1,0), max(2, R - 1), thickness = 1)
```

Law 1: the main plate covers `(0, height, 0)`. Law 3: the offset plate is
reached by a `walkLimb`, never floated — this is the corollary in §3.3 doing
real work, because a disc detached from its trunk is a lint finding and a visual
one. Law 2: `R ≤ 5` by the parameter range, and the plate is one block thick.

| param | default | range |
|---|---|---|
| `radius` | 4 | 2–5 |
| `plates` | 2 | 1–2 |

### 3.11 `fungal` — stem and cap

```
fungal(v, def, rng):
  s = def.stemSpan                                       # 1 or 2
  for dy in 0 .. v.height-1:
    for (i,j) in s x s: emit stem(i, dy, j)
  R = max(2, def.capRadius + v.radiusDelta)
  if def.capKind == "dome":
    # a 1-block shell: the set of columns at radius <= R whose (r, dy) lies on
    # the ellipsoid |(r/R, dy/H)| in (1 - 1/R, 1], H = round(R * def.capRise)
    for each such (dx, dy, dz): emit cap(dx, v.height + dy, dz)
    # skirt: the rim drops one block, which is what gives a mushroom its lip
    for rim columns: emit cap(dx, v.height - 1, dz)
  else:                                                  # "shelf"
    disc((0, v.height, 0), R, thickness = 1, part = cap)
    for rim columns: emit cap(dx, v.height - 1, dz)
  if def.hangingSymbol:
    for rim columns with rng() < 0.35: curtain(under the rim, length 1..3)
  if def.decoSymbol:
    for cap columns with rng() < def.decoShare: emit deco(under the cap)
```

Law 1 (read as the wood family, §3.3): the cap covers every `stem` column,
because `R ≥ 2 ≥ s`. The connectivity corollary: the shell is generated as one
component and its rim skirt is 6-adjacent to it; the underside `deco` is
6-adjacent to a cap block. Law 2 does not bind — no leaves — but the analogous
property (every `cap` within 5 of a `stem`) is what bounds `capRadius` at 6.

| param | default | range |
|---|---|---|
| `stemSpan` | 1 | 1–2 |
| `capRadius` | 4 | 2–6 |
| `capRise` | 0.6 | 0.4–0.9 (dome only) |
| `capKind` | `dome` | `dome` \| `shelf` |
| `decoShare` | 0.08 | glow blocks set into the cap |

### 3.12 `weeping` — willow, glow-fall

`blob`'s canopy with curtains hung off its rim. The construction rule that
matters: **curtains hang from the rim, not from the whole underside**, or the
tree becomes a solid green cylinder and a player cannot walk into it.

```
weeping(v, def, rng):
  blob(v, def)                                           # trunk + canopy
  rim = canopy columns with at least one 4-neighbour column carrying no canopy
  for c in rim:
    if rng() >= def.curtainShare: continue
    y = the lowest canopy block of column c
    n = def.curtain.lo + floor(rng() * (def.curtain.hi - def.curtain.lo + 1))
    for k in 1 .. n:
      if y - k <= 1: break                                # never reach the ground
      emit hanging(c.dx, y - k, c.dz)
```

The `y − k ≤ 1` stop is what keeps the tree walkable-under and keeps a vine off
the ground where the grass pass owns the column. `hanging` blocks are emitted
top-down and the emitter drops any whose upward neighbour is missing (§3.2), so
a curtain clipped by a structure degrades to a shorter curtain rather than to a
floating strand.

| param | default | range |
|---|---|---|
| `curtainShare` | 0.6 | 0–1 |
| `curtain` | `[2, 5]` | 1–7 |

### 3.13 WP-B amendments (measured, 2026-08-07)

Seven corrections the six-law matrix and the block census forced on
§3.6–§3.12; where these disagree with the original prose, **the shipped code
is normative** and the prose above is read as amended:

1. **`umbrella`**: a bare plate of radius ≥ 4 breaks law 2 — the plate cell
   `(3,4)` is leaf-BFS 8 from wood. Plates of radius ≥ 4 carry four cardinal
   `branch` spokes one block beneath the plate.
2. **`giant`**: the leader runs two blocks past the trunk top so the crown's
   centre *is* wood; as originally drawn the centre floated 2 off wood
   (BFS 9 at crown radius 5).
3. **`canopyRadius` under-reported** in §3.6/§3.7/§3.8: the formulas omitted
   the RNG limb extension (+0..2), the trunk-span offset and the lean.
   Bounds widened — the declared reach is what `clipTrees` and the shade map
   rely on, so an under-report is a correctness bug, not cosmetics.
4. **Law 1 "by construction" was false twice**, measured: a rising limb
   leaves blocks proud of its tip mass, and `ancient`'s gnarl can wander the
   trunk back out of a column it visited lower. A shared `capWood` pass —
   the mega-spruce fix generalised — caps every wood column; the
   per-program "trivially satisfied" claims are struck.
5. **Dead limbs**: one symbol per part could not express live vs dead
   without restriping every live branch. `FloraBlock.dead?: boolean`
   (additive to WP-A) selects `branch ?? log`; only deliberately dead limbs
   take the stripped symbol.
6. **Root flares grow from accepted columns only**: the independent
   per-column 0.75 draw could accept a depth-2 column whose depth-1 support
   was rejected — an isolated root, a law-6 finding.
7. **§5.3's row-major first-fit is replaced**: it spent the whole emergent
   budget in the region's first rows of cells. Candidates are ranked by a
   position-keyed score and accepted greedily — equally deterministic and
   traversal-independent.

WP-C notes: §3.11/§3.12's `disc`/`curtain` pseudocode left `part`/anchor
detail unspecified (resolved locally in `weeping`; `fungal` must specify it),
and the two fungal-naturalistic mushrooms ship with WP-C's `fungal` program,
not WP-B. New open question §9.9: understory starvation under the shared
trunk lattice (§7.1's fixture yields 28 shrubs across a 170-radius wood —
own lattice, smaller spacing, or acceptable? Kai/tuning).

## 4. Species registry

A **species** = shape program + parameter envelope + palette symbols + stratum
+ climate affinity. Closed registry `FLORA_SPECIES`; `ForestSpecies.shape` (the
author-facing name) now indexes into it, and the four existing names resolve to
entries whose output is byte-identical to today.

```ts
interface FloraSpeciesDef {
  readonly id: string;                    // joins TREE_SHAPES' closed vocabulary
  readonly program: keyof typeof SHAPE_PROGRAMS;
  readonly stratum: "emergent" | "canopy" | "understory";
  readonly height: readonly [number, number];
  readonly trunkSymbol: string;           // palette symbols, as today
  readonly leafSymbol: string;
  readonly climates: readonly ClimateTheme[];  // affinity for composition tables
  readonly fantasy?: boolean;             // §2: never reachable from defaults
  /** Program knobs — only the ones the program reads; see §3's tables. */
  readonly knobs?: Readonly<Record<string, number | readonly [number, number] | string>>;
  /** Extra palette symbols the parts model needs. */
  readonly rootSymbol?: string;
  readonly stemSymbol?: string;
  readonly capSymbol?: string;
  readonly hangingSymbol?: string;
  readonly decoSymbol?: string;
  readonly deadSymbol?: string;
  /** Share of this species that comes up as a 2×2 giant. Only spruce_tall has one. */
  readonly megaShare?: number;
}
```

`TREE_SHAPES` keeps its four entries and its meaning (the legacy vocabulary);
`FLORA_SPECIES_IDS` is the superset the validator accepts. Widening an accepted
enum is additive: no document that validates today stops validating.
`TREE_TEMPLATES` survives as a **derived view** over the four legacy ids, so
`clip.ts`, `decorate.ts`, `emit.ts` and `grounds.ts` compile unchanged in WP-A
and are converted to `speciesFor(id)` in WP-B.

### 4.1 The v0 catalog

Twenty-one entries: four existing, thirteen naturalistic, two fungal-naturalistic
and two fantasy. The bar every one clears — **distinguishable in silhouette at
60 blocks** — is met by *outline*, not by colour, because colour is what a
render loses first: cone, ellipsoid, lumpy-branched, column, plate, dome,
curtain, leaning. Where two entries share an outline they differ by a full size
class or by climate, so they never stand in the same wood.

Curation notes, because the count is a decision and not an accident: there is no
poplar (`larch_columnar` already owns the column), no standing dead snag (§3.8),
no small toadstool species (the fungal *floor* variant in §5.6 already plants
mushrooms, and a 2-block species would be a tree the shade map has to carry for
nothing), and no second cherry-class colour tree (one pink is a feature, two is
a theme park).

| id | program | stratum | height | trunk / leaf | climates | what it is for, in a screenshot |
|---|---|---|---|---|---|---|
| `spruce_tall` | conifer | canopy | 8–13 | `wood.spruce_log` / `wood.spruce_leaves` | boreal, temperate | *existing* — the dark northern wall |
| `spruce_squat` | conifer | canopy | 5–7 | `wood.spruce_log` / `wood.spruce_leaves` | boreal | *existing* — the scrubby treeline |
| `oak_round` | blob | canopy | 5–7 | `wood.oak_log` / `wood.oak_leaves` | temperate | *existing* — the ordinary tree |
| `birch_slim` | blob | canopy | 6–9 | `wood.birch_log` / `wood.birch_leaves` | temperate | *existing, reproportioned 2026-08-08 (§3.5)* — the pale vertical stroke, now with a crown that clothes the upper half of its trunk and a `minSpacing 5` floor so two of them never fuse |
| `spruce_ancient` | ancient | emergent | 25–33 | `wood.spruce_log` / `wood.spruce_leaves` | boreal | The leaning grandfather in a snowfield: half its limbs dead, shelf fungi up one side. The thing you walk towards. |
| `larch_columnar` | columnar | canopy | 10–16 | `wood.spruce_log` / `wood.birch_leaves` | boreal, temperate | A pale-green exclamation mark. Breaks a dark conifer wall into vertical rhythm at any distance. |
| `juniper_scrub` | blob | understory | 3–4 | `wood.spruce_log` / `wood.azalea_leaves` | boreal, arid | Knee-to-shoulder scrub. What makes a forest floor look occupied instead of mown. |
| `beech_giant` | giant | emergent | 26–34 | `wood.dark_oak_log` / `wood.dark_oak_leaves`, hanging `foliage.vine` | temperate | The cathedral column. A buttressed trunk you can stand between the roots of, and a crown you walk under. |
| `oak_spreading` | broadleaf | canopy | 8–12 | `wood.oak_log` / `wood.oak_leaves` | temperate | The real oak: lumpy, asymmetric, sky between its masses. The single biggest upgrade to an ordinary wood. |
| `willow_weeping` | weeping | canopy | 7–10 | `wood.oak_log` / `wood.oak_leaves`, hanging `foliage.vine` | temperate, tropical | A curtain over water. Reads "riverbank" in one glance and from any angle. |
| `hazel_shrub` | blob | understory | 3–5 | `wood.oak_log` / `wood.azalea_leaves` | temperate | The layer between the grass and the canopy — the reason an old wood feels deep. |
| `cherry_blossom` | broadleaf | canopy | 6–9 | `wood.cherry_log` / `wood.cherry_leaves` | temperate | Pink. The only pink in the block table, and worth a species on its own. |
| `acacia_umbrella` | umbrella | canopy | 6–9 | `wood.acacia_log` / `wood.acacia_leaves` | arid | The savannah plate on a bare trunk. Unmistakable at any range and from below. |
| `desert_ironwood` | ancient | emergent | 17–23 | `wood.acacia_log` / `wood.acacia_leaves`, dead `wood.stripped_oak_log` | arid | A bent, mostly-dead hardwood holding one live limb. Punctuation in an empty landscape. |
| `kapok_emergent` | giant | emergent | 30–40 | `wood.jungle_log` / `wood.jungle_leaves`, hanging `foliage.vine` | tropical | *The* canopy giant: buttress roots, vines off every limb, a crown above everything else in the wood. |
| `jungle_broadleaf` | broadleaf | canopy | 9–14 | `wood.jungle_log` / `wood.jungle_leaves` | tropical | The bulk tropical canopy. Tall enough to make the kapok's crown read as *above* something. |
| `tree_fern` | umbrella | understory | 3–5 | `wood.jungle_log` / `wood.jungle_leaves` | tropical | A single small plate at head height. The tropical floor layer, and the thing that makes the ground feel humid. |
| `mushroom_giant_red` | fungal | emergent | 8–14 | `fungal.stem` / `fungal.red_cap` | *(none — explicit only)* | The landmark of a fungal grove. Red dome on a pale stalk, visible across a valley. |
| `mushroom_shelf_brown` | fungal | canopy | 5–8 | `fungal.stem` / `fungal.brown_cap` | *(none — explicit only)* | Flat brown plates at mid height. The grove's *canopy*, without which it is two giants over bare mud. |
| `glowcap` | fungal | emergent | 10–16 | `fungal.warped_stem` / `fungal.warped_cap`, deco `glow.shroomlight`, hanging `foliage.glow_lichen` | **fantasy** | A lantern in the woods. The reason a fungal grove is walkable, and legible, at night. |
| `crystal_spire` | columnar | emergent | 14–22 | `crystal.amethyst` / `crystal.amethyst`, deco `crystal.cluster` | **fantasy** | A mineral "tree" that reads as *not a tree* at 60 blocks, which is the whole point of a fantasy stratum. |

Two notes on the table. `mushroom_giant_red` and `mushroom_shelf_brown` carry an
**empty `climates` list**: they are naturalistic (no `fantasy` flag, no glow, no
impossible material) but they are not what a temperate wood is made of, so they
never enter a default composition table and are reached the same way a fantasy
species is — by being named. `crystal_spire` uses one symbol for both trunk and
leaf because a crystal has no bark; the `columnar` program does not care.

### 4.2 Palette symbols to add

All against the pinned 1.21.11 table, all verified present. The existing
`wood.*` / `foliage.*` / `flower.*` naming carries forward; `fungal.*`,
`glow.*` and `crystal.*` are new families.

| symbol | block | used by |
|---|---|---|
| `wood.dark_oak_log` | `minecraft:dark_oak_log` | `beech_giant` |
| `wood.dark_oak_leaves` | `minecraft:dark_oak_leaves` | `beech_giant` |
| `wood.jungle_log` | `minecraft:jungle_log` | `kapok_emergent`, `jungle_broadleaf`, `tree_fern` |
| `wood.jungle_leaves` | `minecraft:jungle_leaves` | as above |
| `wood.acacia_log` | `minecraft:acacia_log` | `acacia_umbrella`, `desert_ironwood` |
| `wood.acacia_leaves` | `minecraft:acacia_leaves` | as above |
| `wood.cherry_log` | `minecraft:cherry_log` | `cherry_blossom` |
| `wood.cherry_leaves` | `minecraft:cherry_leaves` | `cherry_blossom` |
| `wood.azalea_leaves` | `minecraft:azalea_leaves` | `hazel_shrub`, `juniper_scrub` |
| `wood.stripped_oak_log` | `minecraft:stripped_oak_log` | dead limbs (`desert_ironwood`) |
| `wood.stripped_spruce_log` | `minecraft:stripped_spruce_log` | dead limbs (`spruce_ancient`) |
| `foliage.vine` | `minecraft:vine` | `willow_weeping`, `kapok_emergent` |
| `foliage.glow_lichen` | `minecraft:glow_lichen` | `glowcap`, glow floor |
| `foliage.firefly_bush` | `minecraft:firefly_bush` | glow floor |
| `fungal.stem` | `minecraft:mushroom_stem` | the two mushrooms |
| `fungal.red_cap` | `minecraft:red_mushroom_block` | `mushroom_giant_red` |
| `fungal.brown_cap` | `minecraft:brown_mushroom_block` | `mushroom_shelf_brown`, ancient shelf `deco` |
| `fungal.warped_stem` | `minecraft:warped_stem` | `glowcap` |
| `fungal.warped_cap` | `minecraft:warped_wart_block` | `glowcap` |
| `glow.shroomlight` | `minecraft:shroomlight` | `glowcap` deco |
| `glow.glowstone` | `minecraft:glowstone` | glow floor, fantasy deco |
| `crystal.amethyst` | `minecraft:amethyst_block` | `crystal_spire` |
| `crystal.cluster` | `minecraft:amethyst_cluster` | `crystal_spire` deco |
| `ground.mycelium` | `minecraft:mycelium` | fungal floor |
| `ground.moss_block` | `minecraft:moss_block` | fungal floor, glow floor |

Two of these need a word. `crystal.cluster` (`amethyst_cluster`) is a
`facing` block with an empty bounding box: it does not trip `floating.isolated`,
but it *does* pop off in the client if its face has no support, which is why
§3.2 makes `deco` facing derive from a real 6-neighbour and drop otherwise.
`glow.shroomlight` and `glow.glowstone` are full cubes and light sources — they
must be *inside* a cap or a canopy mass, never a floating lamp; the `deco` rule
enforces that structurally.

The existing test that checks every block name in a theme table against the
pinned registry extends to cover the flora symbols. This is not optional: a
block name that does not exist in 1.21.11 is a chunk the client refuses to
parse, and this codebase has been bitten by it before.

## 5. Strata composition

A forest node may declare `params.strata` — per-stratum composition — beside
(and refining) its flat species list:

- **emergent** — giants/ancients. *Rare and landmark-like*: a per-patch budget
  (order 1–3 per forest patch, area-scaled), placed **first** with a large
  exclusion radius; they anchor the skyline the way the prominence field
  anchors a town's.
- **canopy** — the bulk layer; today's scatter behaviour generalised. **By
  default it is `params.species`, unchanged**, which is what makes the whole
  feature additive: `strata` adds layers above and below the wood the author
  already described.
- **understory** — small trees/shrubs placed in canopy gaps and *under* the
  canopy of giants.
- **floor** — the existing undergrowth params, unchanged, plus a fungal and a
  glow variant (§5.6).

Placement stays in `scatterForests`' machinery (eligibility, area wobble, edge
taper, `claimTrunk`) — this is a composition layer over it, not a new
scatterer. Absent `strata`, behaviour is exactly today's flat species draw
(reach law).

### 5.1 The author-facing shape

```ts
type StratumSpec =
  | "default"                 // the climate table's row for this stratum
  | "none"                    // this layer is switched off
  | {
      readonly species?: readonly ForestSpecies[];  // default: the climate table's row
      readonly budget?: number;      // emergent only; default: §5.3's formula
      readonly exclusion?: number;   // emergent only; default EMERGENT_EXCLUSION
      readonly density?: number;     // understory only; default §5.4
    };

interface StrataParams {
  readonly emergent?: StratumSpec;                                   // default "default"
  readonly canopy?: "authored" | "default" | { species: ForestSpecies[] };  // default "authored"
  readonly understory?: StratumSpec;                                 // default "default"
  readonly floor?: "default" | "fungal" | "glow";                    // default "default"
}

// ForestParams gains exactly one key:
readonly strata?: true | StrataParams;
```

`strata: true` means `{ emergent: "default", understory: "default" }` — the
one-word form, and the one the kit teaches first. `canopy: "authored"` (the
default) means `params.species`, which stays **required and non-empty** in every
form: no validator is relaxed, so the change is strictly additive.

Validation, in `validateForestNode`, in the existing style and with the existing
codes:

- `strata` is `true` or an object; anything else is `BAD_TYPE` with the fix hint
  `write "strata": true, or an object with "emergent"/"canopy"/"understory"/"floor"`.
- `unknownKeys` over the four stratum names.
- each stratum value is one of its legal strings or an object; a bad string is
  `BAD_ENUM` naming the legal values.
- a stratum object's `species` entries go through **the same species-entry
  validator** `params.species` uses — same keys, same `checkId`, same
  height-range checks, same `BAD_ENUM` listing the legal shapes. One validator,
  one diagnostic vocabulary; a model that learns the species entry once knows it
  everywhere.
- `budget` is an integer in `0..24`; `exclusion` is `8..128`; `density` is
  `0..1`. Out of range is `PARAM_OUT_OF_RANGE`, and it is **reported, never
  clamped** — clamping honours half a request the author cannot see was refused.
- an empty `species: []` inside a stratum object is `MISSING_KEY` with the hint
  to use `"none"` if the layer is meant to be off. This is the "never let a
  legal authoring pattern draw an error, and never let a dropped feature be
  silent" rule from DESIGN.md's risk 3.

### 5.2 Which climate table applies

The default tables are per `ClimateTheme`, and a forest node does not carry one.
Resolve it the way the land-use biome clamp resolves a settlement's biome — by
**ambient majority**, once, recorded in the report:

```
climateThemeAt(t, h) = argmin over CLIMATE_THEMES of
                       (t - THEME_CENTERS[c][0])^2 + (h - THEME_CENTERS[c][1])^2
                       # ties break on CLIMATE_THEMES declaration order
nodeTheme            = the modal climateThemeAt over the node's eligibility mask
                       # ties break on CLIMATE_THEMES declaration order
```

One theme per node, not per column: a patch is a *place*, and a wood whose
species mix changes column by column across a climate gradient reads as noise.
`terrain.climate@0.forceTheme` therefore controls the flora tables exactly as an
author would expect.

### 5.3 The emergent budget, and its exclusion radius

**Amended 2026-08-07 (the grandeur pass).** The original arithmetic gave §7.1's
170-radius old-growth wood a budget of **2** (the fixture wrote 3 by hand), and
Kai's fly-over of the compiled world reported meeting *none*. Three landmarks in
a 340-block-wide wood is a density a player does not encounter. The formula
keeps its shape and moves its constants, and gains a floor:

```
A       = |eligible columns of the node's mask|        # after clearing, before taper
budget  = clamp(max(round(A / EMERGENT_AREA^2),
                    A >= EMERGENT_FLOOR_AREA ? EMERGENT_MIN : 0), 0, EMERGENT_MAX)
EMERGENT_AREA       = 80     # one emergent per 80×80 of eligible ground (was 128)
EMERGENT_MAX        = 18     # (was 12)
EMERGENT_MIN        = 1      # a deliberate wood always gets a landmark
EMERGENT_FLOOR_AREA = 2304   # …once it is at least a ~27-radius patch
EMERGENT_EXCLUSION  = 48     # minimum trunk-to-trunk distance — DELIBERATELY UNCHANGED
```

Measured, not estimated: §7.1's wood has **36,864** eligible columns of its
90,000-column circle once slope, elevation and the edge taper have had their
say, so it budgets **5** and places 5 — against ~2,830 canopy trees, one tree in
560, and a giant every ~120 blocks of fly-over instead of every ~200. A
whole-region `{all: true}` fill at 512² asks for 41 and is clamped to 18.

`EMERGENT_EXCLUSION` stays at 48 on purpose. The budget is an *upper bound* and
the exclusion radius is the *geometry*: raising the budget therefore cannot
crowd giants together, it can only fill the room the exclusion radius already
leaves. A landmark with a neighbour 20 blocks away is not a landmark. The floor
(`EMERGENT_MIN`) exists for the opposite failure: an author who wrote a wood and
switched the stratum on asked for a landmark, and "your patch rounded to
nothing" is exactly the silent decline DESIGN.md's first failure mode is about.

Placement runs **before** the canopy, on its own stream
(`streamSeed(node.seed, "scatter.emergent")`), over the same jittered grid but
with cell size `EMERGENT_EXCLUSION`, and it stops when the budget is spent. Two
masks are consulted: the shared trunk occupancy (so an emergent never lands on a
column another node's tree claimed) and a private `emergentOccupancy` painted at
`EMERGENT_EXCLUSION`. A candidate that fails either is skipped, not retried
elsewhere; the budget is an upper bound, and a patch too small or too broken to
hold its budget reports `placed < budget` rather than forcing trees into bad
ground.

The report carries `{ theme, budget, placed, refused }` per node. A budget the
node could not spend is exactly the kind of silent decline DESIGN.md's first
failure mode is about, so it is printed.

### 5.4 Spacing, and the understory-under-emergent rule

Spacing is **per stratum against its own stratum, plus trunk-to-trunk clearance
across strata**:

| stratum | own-stratum spacing | shared trunk claim |
|---|---|---|
| emergent | `EMERGENT_EXCLUSION` (48), private mask | `spacing + trunkSpan − 1`, shared mask |
| canopy | `spacing`, shared mask — exactly today | `spacing` (+1 when `mega`) |
| understory | `spacing`, shared mask | same |

The important half is what is **not** forbidden. Occupancy is checked against
the *trunk*, never the canopy — that has been true since the "dotted speckle"
fix — so an understory tree under a giant's crown is legal by construction. The
canopy-overlap test that keeps trunks apart cannot forbid it because there is no
canopy-overlap test.

Rather than merely permitting it, the understory pass **prefers** it. After the
canopy stratum finishes, the pass builds the shade map (`canopyCover` over the
emergent + canopy placements — the function already exists in `decorate.ts` and
is hoisted so both callers share one answer) and scales acceptance:

```
p *= 1 + UNDERSTORY_SHADE_GAIN * min(1, shade / 2)      # UNDERSTORY_SHADE_GAIN = 0.8
density_understory = spec.density ?? UNDERSTORY_SHARE * params.density   # UNDERSTORY_SHARE = 0.45
```

which puts the shrubs where the light is broken and the ground looks bare from a
standing eye, and leaves the open glades open.

Strata run in a fixed order — emergent, canopy, understory — on three named
streams. Order matters only through the shared occupancy mask, which is already
order-dependent (row-major) today; naming the order in one place is what keeps
it deterministic.

### 5.5 `MEGA_SPRUCE_SHARE`, kept and then subsumed

`MEGA_SPRUCE_SHARE = 0.03` becomes **data**: `FLORA_SPECIES.spruce_tall.megaShare
= 0.03`, and the scatterer's special case (`chosen.shape === "spruce_tall" && …`)
becomes `def.megaShare !== undefined && positionFloat(scatter, x, 7, z) < def.megaShare`.
Same draw, same salt, same constant, same trees: byte-identical.

When `strata` is active with a live emergent stratum, **the mega draw is
suppressed** and the emergent budget takes over. Two reasons: a boreal wood
would otherwise get a budgeted 2 giants *plus* 3% of its spruces at 2×2, which
is the opposite of "rare and landmark-like"; and the boreal default emergent row
(`spruce_ancient`) fills the same visual role better. Suppression is free in
determinism terms — the draw is position-keyed, so not making it shifts nothing.
A document with `strata` but `emergent: "none"` keeps the mega draw, because
then nothing has subsumed it.

### 5.6 The floor variants

`strata.floor` selects which floor table the undergrowth pass uses. `default` is
today's, unchanged and unconditional (reach law). The two new ones reuse the
existing pass's structure — a soil conversion, then a per-column draw against
the existing `grass`/`flowers`/`deadwood` probabilities — and only swap the
tables:

| floor | soil conversion | cover draw |
|---|---|---|
| `default` | podzol in cold deep shade; coarse/rooted dirt on the noise patches | grass/ferns/tall grass, flower meadows, moss and mushrooms in deep shade, berries when cold, dead bush on gravel |
| `fungal` | `ground.mycelium` in shade ≥ `DENSE_SHADE`, `ground.moss_block` on the noise patches | `foliage.brown_mushroom` / `foliage.red_mushroom` at 4× the default shade rate, `foliage.moss_carpet`, no flowers, `deadwood` unchanged |
| `glow` | `ground.moss_block` on the noise patches | `foliage.glow_lichen` on the *surface* column at the flower rate, `foliage.firefly_bush` at a fifth of it, otherwise the default grass draw |

`glow` is a fantasy floor and inherits §2's rule: it is reachable only by being
written, or by a `character.flora` glow keyword (§6). `fungal` is not fantasy
and needs no gate.

## 6. Intent: `character.flora`

The reserved row — `reserved("character.flora", …)` in
`structures/themes-intent.ts` — comes alive. `character.flora` is
already a `SelectionBias` (`{prefer, forbid}`) and is already grounded against
`FLORA_KINDS` — today the four tree shapes — with `INTENT_FLORA_UNKNOWN`
(`LOAM-W486`) naming the legal values and the near misses. Nothing about that
machinery changes; what changes is the vocabulary it grounds against and the
fan-out that reads the result.

### 6.1 The vocabulary

`FLORA_KINDS` becomes the union of three closed sets. Widening it is additive:
every word that grounds today still grounds.

1. **Species ids** — all 21 of §4.1. The precise dial.
2. **Program names** — `conifer`, `blob`, `broadleaf`, `giant`, `ancient`,
   `columnar`, `umbrella`, `fungal`, `weeping`. A whole family at once.
3. **Character keywords** — a closed set of nine, each a named bias:

| keyword | means |
|---|---|
| `old_growth` | emergent stratum on, `ancient`/`giant` species weighted ×3, understory on |
| `ancient` | `ancient`-program species weighted ×4; `age` envelope shifted up |
| `emergent` | emergent stratum on at the default budget |
| `understory` | understory stratum on at 1.5× the default density |
| `deadwood` | `undergrowth.deadwood` doubled; dead-limb share on ancients raised |
| `sparse` | canopy density ×0.5, emergent budget unchanged (fewer trees, same landmarks) |
| `fungal` | `strata.floor = "fungal"`; admits the two mushroom species into canopy and emergent |
| `glow` | **fantasy gate**: admits `glowcap`, sets `strata.floor = "glow"` |
| `crystal` | **fantasy gate**: admits `crystal_spire` |

A small hand-written alias table carries the near misses the way `THEME_ALIASES`
does — `mossy`, `primeval`, `virgin` → `old_growth`; `mushroom`, `fungus` →
`fungal`; `glowing`, `bioluminescent`, `luminous` → `glow`; `mycelial` →
`fungal`. Hand-written, because an alias is a claim that two words name the same
thing, and a string metric will happily decide `crystal` and `coastal` are
synonyms.

### 6.2 The two laws, and the fantasy gate

Registered through the seam file by the subsystem that owns it (fan-out law 1),
and **total** (law 2): with no `character.flora`, the row returns `ctx.today`
and the world is byte-identical, which the existing intent byte-identity suite
already checks.

The gate that makes §2's promise real: **`fantasy: true` species enter a
composition only when `prefer` names them, or names a keyword whose table
admits them.** No climate row, no program keyword and no near-miss alias can
reach one. `forbid` needs no gate — forbidding something unreachable is a no-op.

`prefer` on a species multiplies its weight by 3 in every stratum it is legal
for and **admits** it if it was not in the composition at all; `forbid` removes
it. An unreachable request — `prefer: ["kapok_emergent"]` on a boreal node — is
honoured (an author naming a species outranks the climate table), which is the
same precedence `character.materialTheme` already has over the era's preference.

An ungrounded word draws `INTENT_FLORA_UNKNOWN` with the legal values and the
near misses, exactly as today, and the hint line becomes
`flora words are species ids, shape programs, or one of: <keywords>`.

## 7. The kit

The kit is the delivery mechanism for the whole feature (§2): a Luna demo shows
new flora because the kit taught the vocabulary, not because a default moved.
`docs/kits/terrain-author.md` §6 gains, in this order:

1. **The species table** — id, one-line visual description, stratum, climates.
   The same 21 rows as §4.1 with the intent column shortened to a phrase. A
   model picks a species by what it looks like, so the description column is the
   product.
2. **`strata`** — the `true` form first, the object form second, and the
   sentence that matters: *the canopy stays your `species` list; `strata` adds
   the layer above it and the layer below it.*
3. **When to reach for a giant.** Sparingly. They are landmarks: one or two per
   wood, and the compiler enforces that with a budget, so asking for more does
   not produce more.
4. **Fantasy species require a fantasy prompt.** `glowcap` and `crystal_spire`
   are legal to name at any time, and they will never appear unless named. Do
   not name them for a fishing village.
5. **The two worked examples below**, verbatim.

Both examples are complete terrain documents. WP-D lands them in the kit, where
`packages/spec/test/kit.test.ts` extracts every ```json block and holds a
terrain document to **zero diagnostics**; they validate against the WP-B
validator, not today's.

Measured against today's validator while this document was written, the only
diagnostics either example draws are the ones WP-B adds: `LOAM-T008` for the
`strata` key, and `LOAM-T101` for the species shapes not yet in `TREE_SHAPES`
(`oak_spreading`, `willow_weeping`, `mushroom_shelf_brown`). Everything else —
the heightfield, the edits, the climate node, the areas, the undergrowth, the
two-node pattern — is legal today. That is the checklist for WP-B's validator
work, and it is deliberately short.

### 7.1 A temperate old-growth wood

```json
{
  "loam": "0.1",
  "profile": "terrain",
  "meta": { "name": "oldgrowth_vale", "worldSeed": 20260807, "spawn": { "zone": "south" } },
  "root": {
    "id": "vale",
    "kind": "composite",
    "envelope": { "shape": "region", "size": [512, 512] },
    "children": [
      {
        "id": "terrain",
        "kind": "generator",
        "generator": "terrain.heightfield@0",
        "params": {
          "seaLevel": 63, "baseHeight": 66, "amplitude": 38, "octaves": 5,
          "frequency": 0.0032, "erosionPasses": 2, "soilDepth": 3
        },
        "children": [
          {
            "id": "north_ridge",
            "kind": "generator",
            "generator": "terrain.edit@0",
            "params": { "verb": "ridge", "course": [[0.1, 0.2], [0.9, 0.3]], "width": 140, "height": 40 }
          },
          {
            "id": "vale_floor",
            "kind": "generator",
            "generator": "terrain.edit@0",
            "params": { "verb": "valley", "course": [[0.15, 0.75], [0.85, 0.6]], "width": 120, "depth": 14, "meander": 0.4 }
          }
        ]
      },
      {
        "id": "climate",
        "kind": "generator",
        "generator": "terrain.climate@0",
        "params": { "forceTheme": "temperate" }
      },
      {
        "id": "old_growth",
        "kind": "generator",
        "generator": "scatter.forest@0",
        "params": {
          "area": { "at": [0.5, 0.62], "radius": 170 },
          "density": 0.22,
          "spacing": 3,
          "clumping": 0.5,
          "maxSlope": 30,
          "elevation": [2, 90],
          "edgeFalloff": 18,
          "undergrowth": { "grass": 0.5, "flowers": 0.04, "deadwood": 0.08 },
          "strata": {
            "emergent": {
              "species": [{ "id": "great_beech", "shape": "beech_giant" }]
            },
            "understory": {
              "species": [{ "id": "hazel", "shape": "hazel_shrub" }],
              "density": 0.09
            }
          },
          "species": [
            { "id": "spreading_oak", "shape": "oak_spreading", "weight": 4 },
            { "id": "vale_birch", "shape": "birch_slim", "weight": 2 },
            { "id": "vale_willow", "shape": "willow_weeping", "weight": 1 }
          ]
        }
      },
      {
        "id": "wilderness",
        "kind": "generator",
        "generator": "scatter.forest@0",
        "params": {
          "area": { "all": true },
          "density": 0.04,
          "clumping": 0.6,
          "species": [
            { "id": "scrub_birch", "shape": "birch_slim" },
            { "id": "hill_oak", "shape": "oak_round" }
          ]
        }
      }
    ]
  }
}
```

The emergent stratum names its species and **not** its budget (amended
2026-08-07: it wrote `"budget": 3`). §5.3's formula is the one that has been
tuned against a walk; a hand-written budget silently opts out of that tuning,
and the kit should teach the default.

The two-node pattern the kit already teaches is unchanged: a deliberate wood
over a shape, and a low-density `{all: true}` fill for the rest of the world.
Only the deliberate wood declares strata — a wilderness fill with giants in it
is not a wilderness.

### 7.2 A fungal grove

```json
{
  "loam": "0.1",
  "profile": "terrain",
  "meta": { "name": "spore_hollow", "worldSeed": 4471, "spawn": { "zone": "west" } },
  "root": {
    "id": "hollow",
    "kind": "composite",
    "envelope": { "shape": "region", "size": [384, 384] },
    "children": [
      {
        "id": "terrain",
        "kind": "generator",
        "generator": "terrain.heightfield@0",
        "params": { "seaLevel": 62, "baseHeight": 70, "amplitude": 30, "frequency": 0.004, "soilDepth": 4 },
        "children": [
          {
            "id": "the_hollow",
            "kind": "generator",
            "generator": "terrain.edit@0",
            "params": { "verb": "basin", "at": [0.5, 0.5], "radius": 130, "depth": 22, "profile": "rounded", "irregularity": 0.3 }
          }
        ]
      },
      {
        "id": "climate",
        "kind": "generator",
        "generator": "terrain.climate@0",
        "params": { "forceTheme": "temperate", "humidityFrequency": 0.0009 }
      },
      {
        "id": "grove",
        "kind": "generator",
        "generator": "scatter.forest@0",
        "params": {
          "area": { "at": [0.5, 0.5], "radius": 120 },
          "density": 0.14,
          "spacing": 4,
          "clumping": 0.7,
          "maxSlope": 28,
          "edgeFalloff": 20,
          "undergrowth": { "grass": 0.15, "flowers": 0, "deadwood": 0.12 },
          "strata": {
            "emergent": {
              "species": [{ "id": "red_giant", "shape": "mushroom_giant_red" }],
              "budget": 4,
              "exclusion": 36
            },
            "understory": "none",
            "floor": "fungal"
          },
          "species": [
            { "id": "brown_shelf", "shape": "mushroom_shelf_brown", "weight": 3 },
            { "id": "damp_birch", "shape": "birch_slim", "weight": 1 }
          ]
        }
      },
      {
        "id": "rim_wood",
        "kind": "generator",
        "generator": "scatter.forest@0",
        "params": {
          "area": { "all": true },
          "density": 0.06,
          "elevation": [8, 200],
          "species": [{ "id": "rim_spruce", "shape": "spruce_tall" }]
        }
      }
    ]
  }
}
```

The grove is not "a forest with mushrooms in it": its canopy layer *is* fungal,
its floor is mycelium and moss, the one ordinary tree is a minority weight, and
a normal wood rings the basin above it so the hollow reads as a place with an
edge. Adding `glowcap` to the emergent list is the one edit that turns it
fantasy, and nothing else in the document has to change.

## 8. Work packages

- **WP-A — the grammar engine.** `terrain/flora/` with `SHAPE_PROGRAMS`, the
  parts model (branch axis states, root seating, hanging attachment, the
  mushroom face rule), the six laws as grammar-level tests, and the four
  existing shapes re-expressed. **Gate: byte-identity on every existing example
  world.**
- **WP-B — naturalistic species + strata.** `giant`, `ancient`, `broadleaf`,
  `columnar`, `umbrella`, `weeping`; the species catalog for the four climates;
  strata composition in `scatterForests`. WP-A hand-offs (2026-08-07): wire
  `emitFloraBlocks` into `terrain/emit.ts` — it is implemented and tested but
  deliberately **not wired**, a no-op under `legacy` for `log`/`leaves`, so do
  not assume it live — and reconcile the `TREE_TEMPLATES.canopyRadius`
  literals with the programs' own derivations, behaviour-preserving for the
  legacy four. Gate: a generated
  temperate-old-growth fixture, linted on all 26 rules; silhouette review
  render for Kai's walk. **Gate added 2026-08-07 — the prominence bar:**

  > **Every placed emergent clears the p95 canopy top within 24 columns by at
  > least 8 blocks**, measured on the recompiled fixture (crown-top Y minus the
  > p95 of the per-column canopy top over the disc of radius 24, the giant's own
  > crown excluded), and the per-giant table is reported. The catalog is held to
  > the same bar at every envelope corner, worst emergent corner against best
  > canopy corner of the same climate, in `flora-grandeur.test.ts`.

  The bar exists because "does the giant read as a landmark" had been a matter
  of opinion, and the opinion was wrong: the pre-amendment fixture measured
  12/8/5 and the walk called it *"not a single growth meaningfully more grand
  than vanilla"*. Post-amendment the same five giants measure **20, 16, 13, 21,
  26**. A number that Kai's eye has been calibrated against once is worth more
  than a paragraph of intent — the same reason the settlement work has a
  prominence field.
- **WP-C — fungal + fantasy.** `fungal` program, fantasy species, glow/crystal
  materials, the floor variants, `character.flora` row + grounding warnings.
  Gate: fungal-grove fixture; intent byte-identity suite still green.
- **WP-D — the kit + classifier.** Kit sections, classifier awareness of flora
  language in prompts, one Luna e2e demo world. Gate: the demo law — the demo
  is generated from a text prompt, and the prompt's flora imagery is *in* it.

WP-A blocks B; B blocks C only where C reuses B's programs; D lands last.

### 8.1 Test surface

New files: `packages/compiler/test/flora-programs.test.ts` (WP-A),
`flora-identity.test.ts` (WP-A), `flora-species.test.ts` (WP-B),
`flora-strata.test.ts` (WP-B), `flora-fungal.test.ts` (WP-C),
`packages/compiler/test/intent-flora.test.ts` (WP-C),
`packages/spec/test/flora-validate.test.ts` (WP-B).

**`flora-grandeur.test.ts` — the emergent is an emergent** (added 2026-08-07,
the grandeur pass). The six-law matrix cannot express "grand", so this file
holds the properties that *are* grandeur, over the same envelope corners:

- `every emergent out-tops every canopy species of its climate by the prominence
  bar` — worst emergent corner against best canopy corner, per climate. This is
  the assertion that fails when someone edits a height envelope down.
- `a giant's crown is wider than one mass can be` — the compound crown, asserted
  as a footprint of radius ≥ 6 in the top five layers of the tree, because a
  radius-4 dome is what `MAX_MASS_RADIUS` allows and is not a skyline.
- The buttress rules of §3.7.1: every buttress block is a **horizontal-axis
  branch** (never a vertical-log top face); the ridges radiate into at least
  three octants and reach 2–7 columns; the flare never rises or thickens further
  out, and reaches grade; every ridge column is filled downward (seated) and
  6-connected to the trunk.
- The drape of §3.7.2: more than 20 hanging blocks per giant at every corner,
  none of them below the crown floor or near the ground, and **both** giants
  carry a hanging symbol at all — `beech_giant` did not, which is why the
  temperate fixture had no hanging growth on its landmarks whatsoever.

**`flora-programs.test.ts` — the laws are laws.** Every assertion runs over
every program × its envelope corners (§3.3), which is the shape
`composition.test.ts`'s existing tree-template test already has.

- `SHAPE_PROGRAMS covers every program named by a species` — exhaustive over
  `FLORA_SPECIES`, no species pointing at a missing program. The
  `agent-defs.test.ts` lesson: a silently-missing entry looks exactly like "the
  grammar is broken".
- `law 1: no wood-family part is the topmost block of its column` — `log`,
  `branch` and `stem`, over every corner.
- `law 2: every canopy block is within taxicab 5 of wood` — and the count of
  violations is asserted **zero**, per program, so §9.1's exception path is
  measured rather than assumed.
- `law 3: every branch is 6-adjacent to a branch or a log`.
- `law 4: every root is at dy <= 0, and every root column is filled to grade`.
- `law 5: a program's output is a pure function of (variation, def, rng seed)` —
  run twice with a fresh RNG from the same seed, compare element for element.
- `the connectivity corollary: every full-cube part is 6-connected to wood` —
  leaves, cap, stem, deco; the direct check for `floating.isolated`, which is a
  full-cube rule and does not exclude `_leaves`.
- `conifer and blob never draw` — the RNG is a counting proxy; zero calls.
- `canopyRadius bounds the block list` — no emitted block lies outside
  `canopyRadius` horizontally, which is the property `clipTrees`' cheap
  rejection and `canopyCover`'s shade map both silently rely on.

**`flora-identity.test.ts` — the re-expression moved nothing.**

- `the four legacy shapes are list-identical` — for every corner, the new
  program's array equals the old closure's **element for element, duplicates and
  order included** (§3.3's reason: `clipTrees` divides by `blocks.length`).
- `TREE_TEMPLATES is unchanged as a view` — the derived record equals the frozen
  table it replaces.
- The **world** gate, per the ground contract's technique: a git worktree at
  `HEAD`, compile both sides, diff per-file shasums of the whole world
  directory, over `examples/misty-fjords`, `examples/cave-styles`,
  `examples/caverns-test` (the terrain-profile worlds with forests) and
  `examples/c1-harbourtown`, `examples/showcase-ironvale`,
  `examples/hillside-village` (settlement worlds whose forests run through the
  same pass). **Every one must be byte-identical, and no golden may be
  introduced to excuse a difference** — unlike the ground contract, this change
  has no legitimate mover.

**`flora-species.test.ts` — the catalog is honest.**

- `every species resolves every palette symbol its program emits` — walk the
  program's parts for one corner, assert a symbol exists for each. This is the
  `street.sidewalk` defect ("read by six modules, never a member of
  `DEFAULT_PALETTE`") caught at the registry instead of in a walk.
- `every palette symbol resolves to a block that exists in 1.21.11` — extends
  the existing pinned-registry check to the flora families.
- `no fantasy species appears in any climate table` — the §2 promise, asserted
  against the tables rather than trusted.
- `every program has at least one non-fantasy client` — a program reachable only
  from fantasy is a program that never runs for most worlds.
- `every species id is a legal Loam id and is unique`.

**`flora-strata.test.ts` — composition.**

- `absent strata, the placement list is identical` — the reach law at the
  scatter level, on a fixture with all four legacy shapes.
- `the emergent budget follows the area formula` — over synthetic masks at
  64², 170², 512², asserting `budget` exactly.
- `no two emergents are closer than the exclusion radius`.
- `placed <= budget, and a shortfall is reported` — a mask too small to hold its
  budget produces `placed < budget` and a report row, not a crash and not a
  silent zero.
- `an understory tree may stand under an emergent crown` — the rule that must
  not regress into a canopy-overlap test; assert at least one understory trunk
  inside an emergent's `canopyRadius`.
- `trunk-to-trunk clearance holds across strata` — no two trunks of any strata
  closer than `spacing`.
- `strata composition is traversal-independent` — the same node scattered with
  the strata array in a different order produces the same placement list, which
  is the property the position-keyed draws exist to give.
- `mega spruces are suppressed exactly when an emergent stratum is live`.

**`flora-validate.test.ts` — the document surface.**

- `strata: true and every legal object form validate clean`.
- `a bad stratum keyword names the legal values`; `a bad species shape names the
  legal shapes`; `an out-of-range budget is reported and not clamped`; `an empty
  species list inside a stratum says to use "none"`.
- `every legacy document still validates` — the whole `examples/` directory,
  zero new diagnostics.

**`intent-flora.test.ts` — the row.**

- `no character.flora → ctx.today` — fan-out law 2, and it is already covered by
  the intent byte-identity suite; assert it here too because this row is the
  one that would break it.
- `a fantasy species is admitted only by an explicit prefer or a fantasy
  keyword` — over all four climate themes and all nine keywords.
- `an ungrounded word warns with LOAM-W486 and names near misses`.
- `every keyword in the table changes something measurable` — resolve twice and
  assert the composition differs. The `INTENT_GROUND_UNKNOWN` lesson: a row that
  reports success and changes nothing is worse than no row.

**Generated worlds — what unit tests cannot see.** The bar is a compiled world
read back off disk and linted on all **26** rules. Two new fixtures, both
committed as documents and both compiled in the acceptance run:

- `examples/flora-oldgrowth.loam.json` — §7.1 verbatim. Assertions:
  `floating.isolated` zero (the corollary, over thousands of new canopy blocks);
  at least one `beech_giant` placed and its root flare fully seated (no
  `floating.*` under it); the emergent count matches the report; a walkable
  column exists under an emergent crown.
- `examples/flora-fungal-grove.loam.json` — §7.2 verbatim. Assertions:
  `floating.isolated` zero over every cap; every `hanging` block has support
  above; `palette.registry` zero (the fungal and glow families all exist).
- One **Luna e2e** world from a prompt naming flora imagery ("an ancient mossy
  old-growth forest around a hidden hollow"), and the demo law: the imagery is
  *in* the world. That is WP-D's gate and it is the only test that measures the
  feature the way a customer meets it.

**Regressions that must not break.** `composition.test.ts` (the tree-template
suite, unchanged), `terrain.test.ts`, `landuse.test.ts` (forest coverage feeds
the biome rule), `grounds.test.ts` (the transition band's stumps and fallen logs
read `trunkState`).

## 9. Open questions (for Kai or measurement)

### 9.1 Leaf `persistent` policy — resolved as a finding, open as a decision

**What the emitter writes today, read off the code.** `DEFAULT_PALETTE` maps
`wood.spruce_leaves` → `"minecraft:spruce_leaves"`, a bare block name with no
state properties. `resolvePalette` resolves that through
`stack.blockByName(name)`, which returns `def.defaultState`. In the pinned
1.21.11 table the default state of every `*_leaves` block is
**`{distance: 7, persistent: false, waterlogged: false}`** (verified against
`minecraft-data` for `oak_leaves`, `spruce_leaves`, `mangrove_leaves`). `distance
= 7` with `persistent = false` is precisely vanilla's *decaying* state: a leaf in
it is removed on its next random tick, wherever it is standing.

**The contrast is inside our own codebase, which is what makes this a defect
rather than a design.** The settlement passes protect their canopies explicitly:
`life.ts` writes garden-tree leaves with `{distance: "1", persistent: "true"}`
and says so in a comment ("Leaves are `persistent`, so nothing decays");
`courtyards.ts` writes `minecraft:oak_leaves[persistent=true]`. The terrain
scatter — every wild tree in every world — writes the decaying default. Vanilla
worldgen does not: `TreeFeature` walks its own leaves and stores a correct
`distance` for each.

**The practical effect**, and it is worth measuring before deciding: leaves near
a log recover, because the first neighbour update schedules a tick that
recomputes `distance`. Leaves that are random-ticked *before* any neighbour
update decay regardless of where they stand. So a wood a player walks into for
the first time loses a scatter of canopy blocks and then stabilises, and every
leaf genuinely further than 6 from wood is gone for good. That is consistent
with "our forests look slightly moth-eaten after you spend time near them", and
it has never been looked for.

**The law this document proposes.**

> Every leaf block the flora grammar emits carries an explicit non-decaying
> state: `distance` computed by breadth-first search from the plant's own
> `log`/`branch`/`stem` blocks, capped at 6, with `persistent = false`. A canopy
> block the search cannot reach within 6 is written `persistent = true` and
> **counted**; law 2's test asserts that count is zero for every program at every
> envelope corner.

This is the exception the skeleton anticipated ("if a program cannot satisfy it,
the emitter sets persistent states, but that is the exception and the test names
it"), made measurable. It keeps vanilla drop behaviour, it makes law 2 a
property we check rather than one we hope for, and the BFS is over one plant's
block list — a few hundred blocks — so it costs nothing.

**The decision for Kai, because the law conflicts with §2.** Applying it moves
*every world that has a tree*: it changes a block state on hundreds of thousands
of columns, and the byte-identity gate in §8.1 would fail on every fixture. So
WP-A lands the mechanism behind a constant, `LEAF_STATE_POLICY`, defaulting to
`"legacy"` (today's default state, byte-identical), with `"computed"` implemented
and tested. Flipping it is one line and one commit, with the world diff measured
first — the same shape as the cropped-street-furniture fix that is waiting on
Kai's explicit go. **Recommendation: flip it**, after one walk that looks for
moth-eaten canopy in a world compiled both ways and left loaded for a while.

### 9.2 Giant heights vs. the build limit

`bucketTrees` silently drops any block with `y > 319`, so a 30-block kapok
seeded at y = 300 loses its crown and becomes a pole — law 1 violated after the
fact, by the emitter, invisibly. Two candidate answers: **clamp** (reduce the
species height so `baseY + height + crown ≤ 319 − 4`, and if the clamp falls
below the species minimum, refuse the tree and spend the emergent budget
elsewhere), or **exclude** (an emergent's eligibility gains an upper elevation
bound derived from its own height). **Ratified 2026-08-07: clamp, with every
refusal reported** — exclude stays open as a refinement if refusals cluster. Related: `params.snowLine` (see §9.6) is the
existing, unimplemented shape of an elevation ceiling per species.

### 9.3 Do ancients belong in settlement precincts?

A village green's oak is exactly what `ancient` is for, and v0 says **no** —
this is terrain-side only, and a tree inside the settlement footprint is
excluded unconditionally by `forestEligibility`. Revisit with the agricultural
layer, which will want hedgerows and orchards inside claimed ground anyway.

### 9.4 Law 1 forbids a dead standing snag — RESOLVED

**Kai, 2026-08-07 (by popup): law 1 is suspended as a universal law.** The
target property was never "no topmost log" — it was "no *accidental* bare
mast", and that is enforced at the source: live constructions cap their wood
columns (`capWood`, §3.13.4), and the grammar tests assert it per program for
live output. Deliberately dead standing wood (a snag, a fully dead ancient)
is **legal geometry** — maximum flexibility.
*Implemented 2026-08-09:* `capWood` now exempts `dead` wood alongside
`buttress`, the `ancient`'s dead limbs lost the single terminating leaf law 1
used to require of them, and the program's `age` clamp went back to the full
`0..1` (the species envelope, not a law, is what bounds a shipped tree's age).
The catalog matrix asserts the two exemptions and nothing else. Fallback, pre-authorized: if
suspension causes trouble (lint noise, accidental masts creeping back), switch
to an enumerable per-species `snag: true` opt-out without asking again.
Implementation queued with the next flora wave (with §9.6's).

### 9.5 Should the connectivity corollary be law 6? — RESOLVED

**Ratified 2026-08-07: promoted.** §3.3 is now the six laws; law 6 is canopy
connectivity, tested by WP-A over every program at every envelope corner.

### 9.6 `scatter.forest@0.params.snowLine` is machinery that never runs

Found while writing this. `snowLine` is accepted by `validateForestNode`, is
range-checked (`−64..319`, int), is typed on `ForestParams`, and is documented in
`docs/kits/terrain-author.md` as "absolute Y above which this species stops" —
and **nothing reads it**. `resolveForestParams` does not carry it; no compiler
module mentions it. It is DESIGN.md's second failure mode exactly: a legal
authoring pattern the compiler silently declines, on a key the kit teaches a
model to write.

The flora grammar is its natural owner (a per-species elevation ceiling is the
same idea as `elevation`, applied per species rather than per node).
**RESOLVED — Kai, 2026-08-07 (by popup): implement as documented,
per-species** — the key moves onto the species entry and the node-level value
stays as the default. *Implemented 2026-08-09:* `ForestSpecies.snowLine`
(validated `−64..319`, int) beats `params.snowLine`, which beats "no ceiling";
all three scatter passes (canopy, emergent, understory) test it **after** they
claim the trunk lattice, so a snow line only ever *removes* trees and the wood
below it is placement-identical to the same document without the key. An
emergent the ceiling refuses spends its budget slot and is reported as
`refused`. Implementation queued with the next flora wave (with
§9.4's).

### 9.7 Snow on canopy tops

Canopy giants above the snow line get no snow: `plan.snow` is per column and the
emitter writes one snow layer at `ground + 1`, so a tree's crown is bare however
high it stands. Is that a defect or is it fine? Measure on a boreal fixture
before building anything — snow on a 28-block crown may read as a white blob.

### 9.8 The program RNG is position-keyed, not index-keyed

§3.1 deviates from the skeleton's `hash(worldSeed, nodePath, treeIndex)` in
favour of `hash(nodeSeed, "flora.program", x, z)`, to preserve the
traversal-independence invariant `vegetation.ts`'s own header states. Noted here
rather than silently taken: it is a strictly stronger determinism property, but
it does mean two trees of the same species at the same column in two different
documents are geometrically identical. Note `nodeSeed` already derives from
`hash(worldSeed, nodePath)`, so the coincidence requires the same world seed
*and* node path — cosmetically nil. **Ratified 2026-08-07: the deviation
stands; the skeleton's index keying was a mistake.**

### 9.9 Understory starvation under the shared trunk lattice

Found by WP-B (2026-08-07): §5.4's shared-claim rule is implemented as
written, and in §7.1's fixture a saturating canopy (`density 0.22`,
`spacing 3`) claims nearly every trunk slot, so `density: 0.09` yields **28
understory shrubs across a 170-radius wood**. Whether the understory should
draw from its own lattice, use a smaller spacing class, or stay this sparse
is a tuning call for Kai's silhouette walk — the old-growth fixture at
`agent-wpb/fixture/oldgrowth_vale` is the exhibit.
