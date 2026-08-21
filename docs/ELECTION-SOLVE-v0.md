# The election solve v0 — one objective, and no more thresholds

*Ratified by Kai, 2026-08-21: direction A — stop writing guards, replace the decision
procedure. `freeze/pre-election-solve` preserves the pre-design tree so B/C can be
retried; this is written without hedges (§7.3 says what B/C keep). **It supersedes
`docs/GROUND-CONTRACT-v1.md` §6/WP-G6 carried item 4**, the terrace fix (`:889-903`),
which shipped — `TERRACE_BY_TERRAIN = true` (`layout/types.ts:704`), `b0accac` +
`651278f` — and produced three near-miss thresholds in two days:*

- `TERRACE_STEP_SPAN = 3` (`types.ts:722`) counts distinct pristine levels on a
  block's perimeter; a block spanning exactly 2 steps does not trip it and is
  still cut 3 deep.
- `RIM_SEAT_MAX_DROP = 2` (`types.ts:741`) fires at `> 2`; the walked buried door
  sits at exactly 2.
- The anchor itself — the **lower median** of the street-perimeter datum
  (`platforms.ts:505`, taste row T4) — still elects basins, because a median
  throws the distribution away.

Each is defensible alone; each guards a procedure whose *shape* is the defect — collapse
a block's frontage to one number, quantise it, split on a hand-written predicate, repair
by merging and dissolving. Four heuristics, four thresholds, and a walk verdict has
nowhere to land. **The replacement, in one sentence: the anchor was a median; the
objective is a sum.** Every frontage column keeps its own opinion, every ground column its
own pristine height, every seam prices its own drop, and one minimisation reconciles them.

# 1. The objective

## 1.1 Atoms — the things that receive a level

A **block** is unchanged: a 4-connected component of `blocked !== 1`
(`platforms.ts:509-511`). Streets and their sidewalk band are `blocked`, so atoms in
different blocks are **never 4-adjacent** (measured, §3.2): every pairwise term is
intra-block and the solve decomposes into one problem per block. An **atom** is the unit
of assignment — a 4-connected region of one block taking one level, built once, before
any level exists (§3.1). Adjacent atoms that end up at the same level coalesce into one
platform; that is how the terrace count gets decided, and why no splitter and no merger
survives.

## 1.2 The formula

For one block with atoms `i ∈ A`, adjacency pairs `(a,b) ∈ P` with contact length `n_ab`
(shared 4-neighbour column pairs), and level assignment `L`:

```
minimise   Σ  Σ  [ CUT_W·(p_c − L_i)⁺  +  FILL_W·(L_i − p_c)⁺ ]      ground
          i∈A c∈i

         + Σ  Σ  [ FRONT_LOW(s_f − L_i)  +  FRONT_LIP·(L_i − s_f)⁺ ] frontage
          i∈A f∈F(i)

         + Σ    n_ab · EDGE(|L_a − L_b|)                             edge
       (a,b)∈P

subject to  L_i ∈ D            (§3.3)
            |L_a − L_b| ≤ SEAM_DROP_MAX   for all (a,b) ∈ P
            L_i ≥ waterFloor              for every dry atom
```

`p_c` is the **pristine** height of column `c` by the one materialisation rule (`floor`;
`platforms.ts:378`, `street-datum.ts:203`). `F(i)` is the atom's columns within
`reach = frontageReach(sidewalkWidth)` (`district.ts:3672`) of a banded carriageway
column, and `s_f = datum.street.levelNear(x, z, reach)` (`street-datum.ts:107`) — the
probe the lot tie already uses, no new constant; `x⁺ = max(0, x)`. Every weight is a
**positive integer** and every term an integer: no float appears in the solve.

## 1.3 The terms

```
CUT_W = 3   per column per block cut below pristine     FILL_W = 2   ditto, fill
EDGE(0) = 0;  EDGE(d) = EDGE_KERB + EDGE_STEP·(d−1) + EDGE_DITCH·(d−1)²,  d ≥ 1
EDGE_KERB = 1   EDGE_STEP = 1   EDGE_DITCH = 1
SEAM_DROP_MAX = SEAM_TIER_MAX · RETAIN_MAX = 18                (levels.ts:731, :86)
FRONT_LOW(0) = 0;  FRONT_LOW(g) = FRONT_KERB + FRONT_BURY·(g−1),  g ≥ 1
FRONT_KERB = 1   FRONT_BURY = 6   FRONT_LIP = 4
```

### 1.3.1 Ground — cut and fill against the pristine baseline

**Cut is worse than fill.** Every walked complaint names a cut — the west flank cut 2
("looks very bad, sudden jump"), the citadel interior cut 3 (the buried-door house), the
r22g4 rims that are the 27 `LOAM-W413` refusals — and none names a fill. A cut destroys
the pristine surface Group M painted and buries whatever stands on the uphill rim; a
fill is ground the dressing already finishes (T10's 1:2 bank, R3's skirt, S8). 3:2 and
not 5:1 so a terrace still sits *in* the hill rather than on a podium above it, with the
fill side further bounded by `FRONT_LIP`. Convex in `L` (increments `−3,−3,…,+2,+2`).

### 1.3.2 Edge — the drop between two atoms

Values `0,1,3,7,13,21,31,…,307`; increments `1,2,4,6,8,…` — non-decreasing, so `EDGE` is
convex, the property §3.4 rests on. **A kerb is cheap and a ditch is dear**,
superlinearly, as the walk asks. **There is no separate terrace-count or churn term, and
there must not be one:** churn *is* `EDGE(1)`, an extra terrace costing `n_ab · 1` along
the seam it creates, priced by the boundary it actually adds. A count term is a Potts
term, is not convex, and would forfeit §3.4's exactness while double-pricing what the
edge already prices. Standing rule: **no cost term may be added that is not convex in
its argument** — a non-convex term is a design change, not a tuning.

### 1.3.3 Frontage — per column, against that column's own street

`FRONT_LOW(g)` prices a plane `g` **below** its street, `FRONT_LIP·h` a plane `h`
**above** it. The walk record's shape, term for term. A plane **one** below its pavement
is a kerb you step down off, nearly free (`platforms.ts:411-414`). **Two or more** below
its own frontage is the buried door — `RIM_SEAT_MAX_DROP`'s content as a price instead
of a threshold, the jump 1 → 7 being where "more than 2" used to live. **Above** its
pavement is the +1 lip Kai walked four times (`platforms.ts:413`): dear, but linear,
because a plinth is a mistake and not a hole. Values as `L` rises past `s`:
`…,7,1,0,4,8,…`, increments `−6,−1,+4,+4`.

This term is **the whole of what the lower-median anchor was for**, with strictly more
information: `anchorOf` (`platforms.ts:505`) reduced every street around a block to one
integer, so a block with 200 columns fronting an 87 street and 20 fronting an 84 street
elected 84 with a straight face.

### 1.3.4 What pins what

| fixture (walked) | what it pins |
| --- | --- |
| east strip cut **1** below pristine beside a street = "looks good"; west flank cut **2** = "looks very bad, sudden jump" | the crossover between `CUT_W` and `EDGE`: for the **smallest legal atom** (`MIN_PLATFORM_COLUMNS = 9` columns, ~12 contact) one block of cut saves `9·3 = 27` and costs `12·ΔEDGE`. `ΔEDGE(0→1)=12`, `ΔEDGE(1→2)=24` — both under 27, so a sliver follows the hill. `ΔEDGE(2→3)=48` — over, so it stops. The atom follows the terrain up to a relative drop of 2 and then joins its neighbour, which is precisely the walked boundary. `EDGE_DITCH = 1` is fixed by this line. |
| the same fixture, large atom | for the west-flank atom (~160 columns, ~16 contact) rising 85→86 saves `160·3 = 480` in cut and `~16·6 = 96` in frontage, against `16·1 = 16` of new edge. It rises. **Big atoms follow the hill; slivers join their neighbours** — a behaviour, out of two weights, with no size threshold anywhere. |
| the basin lot: pristine 86–87, elected 84, street 86, all four neighbours higher (band 87–88, neighbour building 87) | `FRONT_BURY`, and the *elimination* of the anchor. At 84 versus 86 the objective pays ~1,200 in cut over ~200 columns and ~280 in frontage over ~40 front columns, against at most a few hundred of edge relief that its (higher) neighbours do not offer. **No non-negative weighting of these terms elects 84 here.** The basin was never a weight failure; it was the median. |
| streets terrain-following, walk-approved, one column per pristine step; `memory: hill-town-aesthetic-calibration` ("flattened terraces following the hill's shape are correct") | the demotion of storey congruence to a cost (§2.2) — the lattice a plane must agree with is the **street's**, and the street's lattice is the hill at 1-block granularity — and `EDGE_KERB = 1`, which makes many shallow terraces nearly free while one deep cut is not. |

# 2. Constraints versus costs

## 2.1 Hard — the four things that are not negotiable

- **H1 Serviceability.** For every adjacent pair,
  `|L_a − L_b| ≤ SEAM_DROP_MAX = SEAM_TIER_MAX·RETAIN_MAX = 18` — a seam past what
  `tiersOf` (`levels.ts:826`) dresses is not a seam a town builds. **Replaces
  `dissolveTallPairs`** (`platforms.ts:810-884`) by living inside the decision instead
  of repairing a finished one, so no platform gives its level back and
  `LOAM-W410 LEVEL_DISSOLVED` (`district.ts:1420-1429`) retires unfired.
- **H2 Fluid physics.** `waterFloor` is a hard lower bound on every **dry** atom;
  a `mostlyWater` atom (`platforms.ts:318`) is exempt and keeps its bed, and
  `damsWater` (`platforms.ts:267`) still decides whether the quarter's water is
  protected. Unchanged, unmoved, still why `LOAM-T110` is zero.
- **H3 Granularity.** Every atom holds ≥ `MIN_PLATFORM_COLUMNS = 9` columns
  (`platforms.ts:83`), enforced in the **partition** (§3.1 A3), before levels
  exist, not by a post-hoc merge. Load-bearing: `mergeSlivers` broke contact ties
  **to the lower level** (`platforms.ts:752-755`), the cascade that produced −40
  cut depths and 21 `LOAM-W410` on the acropolis.
- **H4 Domain.** `L_i ∈ D`, §3.3's interval — *proved* to hold a global optimum.

## 2.2 Demoted to a cost — lattice congruence (T4/T6)

Taste rows T4/T6 (`GROUND-CONTRACT-v1.md:543,545`) anchor the storey lattice on the
carriageway and snap terraces to it. **T6 is amended: terraces snap to the *street
datum's* lattice — the hill at one-block granularity — and not to multiples of
`FLOOR_HEIGHT = 4`.** Forced: the west-flank atom must elect 86 beside a street at 87,
and a domain congruent to a quarter base of 84 modulo 4 offers only 84 and 88. Storey
congruence *is* the near-miss. What congruence was *for* — a plane and its street being
one surface — is now `FRONT_LIP`/`FRONT_LOW`, minimised at **equality**, strictly
stronger than congruence modulo 4. `LOAM-T242 GROUND_PLANE_DRIFT`
(`district.ts:1507-1516`) survives as a measurement of the objective: residual 0 is
agreement, ±1 the kerb, magnitude ≥ 2 within `reach` of a band a finding against a
weight. T4 is superseded outright; the rest of §5's taste table is untouched — T1/T2/T3
still govern `frontageSeat`, T7–T16 never saw this file.

# 3. The solver

## 3.1 The partition — normative

Per block, in order, all integer and all deterministic:

- **A1** Atom seeds: 4-connected components of constant `floor(blur(pristine))`,
  reusing the box blur at `SMOOTH_RADIUS = 2`, `SMOOTH_PASSES = 2`
  (`platforms.ts:492-498`, `:957`). One rule, always — **the storey bucket is
  gone** (`platforms.ts:611`); the terrain floor is finer than it everywhere.
- **A2** No criterion and no predicate: every block is partitioned, and one
  platform or seven is decided by the levels, never a splitter.
- **A3** Granularity (H3): while some atom holds < `MIN_PLATFORM_COLUMNS`
  columns, absorb the **smallest** such atom (ties: lowest minimum region index)
  into the neighbour sharing the most contact columns; contact ties break to the
  **nearest step floor**, then lowest minimum region index. No level appears in
  this rule and none can — levels do not exist yet.
- **A4** Cap: while the block holds > `ATOM_MAX = 12` atoms, merge the adjacent
  pair minimising `(|floor_a − floor_b|, −contact, minIdx_a, minIdx_b)` — the
  cheapest merge, preserving the hill's shape. Bounds the solve a priori and is
  the one place this design deliberately loses fidelity (§7.4).
- **A5** **Wetness is a partition invariant, and it is one law with three
  clauses** (amended at WP-E3, measured on the compiled river quarter). A1 seeds
  on `(floor(blur(pristine)), wet)` and A3/A4 refuse every merge that would
  cross wetness, so an atom is uniformly water or uniformly ground and
  `mostlyWater` has nothing left to decide. A **wet** atom then: (1) is exempt
  from H2's floor, as before; (2) has an **empty `F(i)`** — §1.3.3 prices a
  plane's agreement with the pavement that serves it and a riverbed has no door
  to bury; and (3) forms **no pair** — §1.3.2 prices retaining tiers and H1
  refuses a drop deeper than `tiersOf` dresses, and a riverbank is neither, so
  both `EDGE` and H1 fall away across a wet/dry contact (`dissolveTallPairs`
  says the same on the fallback path). Clause 1 alone leaves the river dammed
  (718 wet columns of 1,951); 1+2 gives 1,341; all three give **1,995 wet
  columns and 16 dry cross-sections** against the fallback path's 1,951 and 16.
  A block with no wet column is bit-identical either way, which is why the flip
  moves no dry row.

## 3.2 Graph size — measured, not estimated

Compiled from the three r22 documents at `HEAD` (post-terrace-fix), counting
`quarter.plane` claim columns and their 4-connected components (harness §6.1):

| quarter | plane columns | blocks | pieces | distinct levels |
| --- | --- | --- | --- | --- |
| `world.troy_citadel` (the stress case) | 22,641 | 13 | **45** | 19, over 68…97 |
| `world.pirate_cove_town` | 10,957 | 13 | 17 | 3, over 63…69 |
| `world.unicorn_citadel` | 13,835 | 12 | 15 | 3, over 82…90 |
| `hellenist` cells 1/3/4 | 11,647 / 2,963 / 17,240 | — | 9 / 11 / 20 | 1 each — a cell is one terrace (`planeY`) |

Level-agnostic components equal the block count exactly (13, 13, 12), confirming
empirically that **no two blocks' plane columns touch**: §1.1's decomposition is a fact
about the data, not an assumption. The real shape is **~13 blocks per quarter, ~1,700
columns per block, 2–8 atoms per block today** (observed piece ids reach `block.<n>.7`;
one block carried a 20-block internal drop — the two `LOAM-W410` pairs). Under A1's
finer partition and A4's cap the working figure is **n ≤ 12 atoms per block**.

## 3.3 The domain, and why it is safe

Per block let `A` be the minimum over atoms of `min(pristine ∪ street levels in reach)`
and `B` the maximum of the same; then `D = [A − 1, B + 1]`, intersected with
`[waterFloor, ∞)` for dry atoms.

**Theorem (why the box is not a guess).** Every unary is convex with its minimiser
inside `[A, B]`, every pairwise is non-decreasing in `|L_a − L_b|`, and componentwise
projection onto an interval is 1-Lipschitz — so projecting any assignment onto
`[A−1, B+1]` increases neither term. A global optimum exists inside `D`, and searching
`D` is searching ℤ^n; the `±1` is the kerb's room.

`DOMAIN_MAX = 48`: a block whose span exceeds it is a block the fabric should not have
drawn at that `blockSize`. The domain truncates to the 48 values centred on the block's
pristine median, the result is optimal within the truncation, and the block is counted
`overSpan` in §3.6. Measured: Troy's citadel spans 29 across the *whole quarter*, so
nothing reaches this today.

## 3.4 The method — exact, integer, deterministic

Every unary is convex in `L_i` and every pairwise convex in `L_a − L_b` (§1.3, checked
by a unit test on the increment sequences), so the objective is exactly minimisable in
polynomial time by the **Ishikawa reduction to one s–t min-cut**:

- **S1** Per block, a graph of `n · (|D| − 1)` interior nodes, node `(i, l)`
  encoding `L_i > l`. Infinite arcs enforce monotonicity down each atom's column;
  unary costs become that column's capacities from successive differences of
  `U_i`; pairwise costs become arcs between columns from `EDGE`'s **second**
  differences — non-negative exactly because `EDGE` is convex, which is the whole
  reason convexity is mandatory. Hard constraints are `INF` arcs, with
  `INF = 1 + Σ` every finite capacity in the block, so no legal assignment pays
  one.
- **S2** Max-flow by **Dinic**, integer capacities, adjacency built in canonical
  order — atoms by `(descending column count, ascending minimum region index)`,
  levels ascending, pairs as `(a < b)`. A BFS level graph plus DFS blocking flow
  over a fixed arc order is a deterministic function of the input: no RNG, no
  clock, no map-iteration order, no float.
- **S3** The cut taken is the **source-side reachable set of the final residual
  graph** — the unique *minimal* min-cut — oriented so that minimal means
  **lowest**. Ties therefore break to the lower level, per atom, in canonical
  order, by construction rather than by a comparator someone must remember.
- **S4** Exactness is tested, not claimed: a brute-force oracle enumerating
  `|D|^n` must agree **exactly**, level for level, on every generated fixture with
  `n ≤ 5, |D| ≤ 8` and on every r22 block inside that bound.

## 3.5 Complexity and budget

Per block `V = n(|D|−1) ≤ 12·47 = 564` nodes and `E ≈ n|D| + |P|·|D|² ≲ 25,000` arcs;
Dinic is `O(V²E)` worst case and nowhere near it at this shape. ~13 such problems per
quarter, ~6 quarters per world; Troy's whole compile measures ~14 s and the election is
a rounding error inside it, so the ground stage's **10 % wall-time envelope**
(`GROUND-CONTRACT-v1.md:1274`) is unaffected. `electionMs` is recorded beside
`groundMs`, a test asserts the per-block node count never exceeds
`ATOM_MAX · DOMAIN_MAX`, and cost grows **linearly in blocks** — the shape that scales.

## 3.6 The explanation record — mandatory

Per quarter the solve emits `LOAM-I498 GROUND_ELECTION` and a `DistrictStats.election`
payload: per atom — id, column count, pristine median, domain, **chosen level**, and the
three cost terms at the chosen level *and at chosen ± 1*; per quarter — atoms, A3
merges, A4 merges, `overSpan`, and the frontage-residual histogram (`LOAM-T242`'s,
re-read per §2.2). Not diagnostics-as-nicety: a procedure can be debugged by reading
it, an optimum cannot. The `chosen ± 1` marginals make a walk complaint land — find the
atom, read which term dominated, §6.3 names the weight. **Without this record the
design is not maintainable and must not ship.**

# 4. What is deleted

| deleted | where | what it becomes |
| --- | --- | --- |
| the lower-median anchor `anchorOf`, and `perimeterLevels` as a **level source** | `platforms.ts:451-462`, `:505-506`, `:534-541`, `:664-666` | the frontage term §1.3.3 — a per-column sum instead of a median |
| `GROUND_TIE_SPAN` and the span-split law (T5) | `types.ts:573`, `platforms.ts:542-548`, `:585` | nothing. Splitting is not a decision any more; A1 partitions unconditionally |
| `TERRACE_STEP_SPAN`, the distinct-pristine criterion, and its `hi−lo ≤ FLOOR_HEIGHT && perimeterSpan ≤ GROUND_TIE_SPAN` narrowing | `types.ts:722`, `platforms.ts:499-503`, `:569-576` | ditto — the *levels* decide whether atoms coalesce |
| the storey bucket, `storey()`, and the quarter base `min(free ground)` | `platforms.ts:393-399`, `:611`, `:668-670`, `:887-889` | deleted. Levels are integers; the lattice is the street's (§2.2) |
| `mergeSlivers` as a post-hoc repair, **and its level-based tie-break** | `platforms.ts:684-686`, `:718-771` | A3, a pre-solve partition constraint (H3) |
| `dissolveTallPairs`, `DISSOLVE_DROP_MAX`, `LOAM-W410 LEVEL_DISSOLVED` | `platforms.ts:66`, `:810-884`; `district.ts:1411-1429` | the hard constraint H1 |
| `RIM_SEAT_MAX_DROP` and `seatOnPlane`'s exception | `types.ts:741`, `district.ts:3747-3751` | the frontage term; the seat becomes `planeY ?? cell ?? tied ?? median` (§5) |
| the **depth-cap** idea (proposed, never shipped) | — | the cut term. A cap is a threshold; this design has none |
| `PlatformTieReport.spanSplit / terraceSplit / terraceAreaOnly` | `platforms.ts:217-233` | the explanation record §3.6 |
| `LOAM-T241 GROUND_PLANE_UNTIED`'s special case | `district.ts:1439-1448` | nothing special: an atom with no frontage simply has an empty `F(i)` and its ground term elects its own pristine median. G3's "no frontage, no tie" is a *consequence* now. The note survives as a count |

**The flag story.** A new `ELECTION_SOLVE` in `layout/types.ts` beside
`GROUND_PLANE_TIE` (`types.ts:555`); off = today's procedure with `TERRACE_BY_TERRAIN`
still true, byte-identical, which is the acceptance for every stage before the flip. It
**implies** `GROUND_PLANE_TIE` (it reads `StreetDatum`), asserted by the ladder test in
`test/ground-contract.test.ts` as G9 asserts its own. **`TERRACE_BY_TERRAIN` is subsumed
and deleted at this WP's own flip**, in the flip commit, with `TERRACE_STEP_SPAN`,
`RIM_SEAT_MAX_DROP`, `GROUND_TIE_SPAN` and the dead procedure — it does not linger as an
off-switch, because the two constructions cannot both be live and a flag that can never
be false is a comment.

# 5. Interfaces preserved — each confirmed against its consumer

- **The solve *is* the new `PlatformDatum`** under the datum law
  (`GROUND-CONTRACT-v1.md:101-104`): a pure function of the pristine baseline,
  the solved layout and `StreetDatum`, proposing levels and declaring nothing. It
  reads no resolver output, so the import-graph purity test (`:118-120`) passes
  unchanged; §1.3's table row is re-sourced to `StreetDatum` + pristine + the
  objective, and `FLOOR_HEIGHT`/`GROUND_TIE_SPAN` leave it.
- **`derivePlatforms(input): FormBench[]`** keeps its signature
  (`platforms.ts:351`) and its single caller (`district.ts:1379-1404`);
  `PlatformInput` loses `terraceByTerrain` and `tiered`, keeps the rest. The
  post-condition survives — all levels equal ⇒ `[]`, "one platform is no platform"
  (`platforms.ts:692-694`) — and `DISTRICT_GROUND` still fires (`:1521-1530`).
- **`groundLevelsOf`** (`levels.ts:149`) and **`levelSeams`** (`levels.ts:336`,
  called `district.ts:1541`) are untouched: they read the finished `GroundLevels`
  and do not care how it was elected. `district.ts:1430`, `:1474-1478`,
  `:2059-2073`, `:2114` need no edit, and the pad edits stay one `quarter.plane`
  claim per resolved run at rank 15, `apron: 0` (v1 §1.5 unchanged).
- **Seat precedence** becomes `planeY ?? cell?.foundationY ?? tied ?? medianGround(…)`
  (`district.ts:2146-2147`): `seatOnPlane` is deleted and the rim exception dies,
  because frontage agreement lives in the objective and a plane can no longer sit 3
  below the door it serves. `frontageSeat` (`district.ts:3704`) is **untouched** —
  T1/T2/T3 still govern it, and it is still the seat for pad quarters and for lots on
  no platform.
- **The v1 resolver and transitions dress whatever the solve asks for**:
  `deriveGroundSeams` enumerates resolved boundaries, `tiersOf` serves the drop,
  and H1 guarantees every elected drop is inside `SEAM_TIER_MAX` tiers — stronger
  than `dissolveTallPairs`' post-hoc guarantee. **WP-G6/WP-G7 are unaffected**;
  the flag ladder's ordering is unchanged.

# 6. Staging, acceptance, and how a walk moves a weight

## 6.1 Work packets

- **WP-E0 — the census becomes a harness.** `tools/worlds/plane-census.mjs`
  publishes per quarter: plane columns, blocks, atoms, pieces, distinct levels,
  the cut/fill histogram against the **pristine** baseline, the frontage-residual
  histogram. §3.2's table is the committed baseline. No source change.
- **WP-E1 — the partition.** A1–A5 built and *measured* (atom counts, A3/A4 merge
  counts, domain spans), used by nothing. Byte-identical.
- **WP-E2 — the objective and solver** behind `ELECTION_SOLVE = false`, with
  §3.4's oracle test and §1.3's convexity tests. Byte-identical.
- **WP-E3 — the flip**, §6.2's table, §4's deletions in the same commit; **WP-E4
  — the walk**, riding the next deck, weight changes only (§6.3).

## 6.2 Acceptance

*Flag off:* byte-identical on the shasum control set, every stage. *Flag on:*

| window / measure | target |
| --- | --- |
| west flank, `x∈[96,111] z=−187`, pristine 87, street 87 | elects **≥ 86** (today 85, cut 2 — the walked "sudden jump") |
| east strip, `x∈[119,123] z=−187`, pristine 86–87, street 87 | stays **86** — `|plane − pristine| ≤ 1` |
| citadel interior / door ring, `x∈[108,123] z∈[−208,−200]`, pristine 86–87, street 86 | elects **≥ 86** (today 84 — the buried-door house), and the block carries **≥ 1 step**, not one plane |
| troy citadel, columns within `reach` of a band | **zero** columns cut ≥ 3 below pristine; `LOAM-T242` residual magnitude ≥ 2 → count 0 |
| all three documents, cliff census | **no regression row-for-row** against WP-E0's baseline |
| `LOAM-W410 LEVEL_DISSOLVED` | class retired; count 0 by construction (H1) |
| `LOAM-W494 GROUND_SEAT_NONPLANAR` | 0 |
| 27 physics rules, all three worlds | 0 |
| suite | green; the seven touched suites — `packages/compiler/test/{platforms,levels,ground-plane-tie,ground-plane-flag,terrace-by-terrain,platform-waterline,platform-waterline-river}.test.ts` — re-pinned to the objective, not the procedure |

*Walk gate:* yes, riding the next deck. **Visual taste lands only on Kai's verdict** —
the manual critique→repair law is untouched by this document.

## 6.3 The weight-calibration protocol — one table, no new thresholds

A walk verdict names a place, §3.6's record names the dominant term there, this table
names the knob.

| walk complaint | dominant term in the record | knob | direction |
| --- | --- | --- | --- |
| "the ground beside the street is a pit" | `ground.cut` | `CUT_W` | ↑ |
| "the town floats above the hill" | `ground.fill` | `FILL_W` | ↑ |
| "it is fussy, steps everywhere" | `edge` | `EDGE_KERB` | ↑ |
| "that is a ditch — give it more terraces" | `edge` | `EDGE_DITCH` | ↓ |
| "the door is buried" | `frontage.low` | `FRONT_BURY` | ↑ |
| "the floor sits above its own pavement" | `frontage.high` | `FRONT_LIP` | ↑ |
| "this big block wants more terraces than it got" | A4 merge count | `ATOM_MAX` | ↑ |

**The law: a walk verdict may move a weight. It may never add a threshold, a predicate,
a special case, or a non-convex term.** Weights stay positive integers and the convexity
tests must still pass after any change; anything not expressible as a weight change is a
new §, reviewed as a design.

# 7. Risks, honestly

**7.1 Objective myopia — a cost we forgot.** The real risk. Candidates not in §1.2:
footprint planarity (a lot straddling two atoms is `LOAM-W494` and the objective has no
opinion), plaza flatness, the value of a *continuous* terrace running a street's length.
Mitigation is structural rather than hopeful — a missing cost shows up in §3.6's record
as a term that is **not** dominant where the walk complains, a signature no procedure
could give — and the fix is a new convex term plus a census re-run, never a threshold
(§6.3).

**7.2 Exactness bugs.** Ishikawa + Dinic is more machinery than a median — and, unlike a
median, *checkable*: §3.4's brute-force oracle over real blocks is the whole answer, and
a mismatch is a hard failure, never a re-pin.

**7.3 The B/C escape hatch.** If the walk rejects A, **B** (keep the procedure, add a
per-column frontage repair) and **C** (a post-hoc terrace splitter on the pristine step
lines) both reuse §1.3's terms as *diagnostics*, §3.1's partition verbatim, §3.6, and
§6.1's harness. Only §3.4 — the solver itself — is thrown away, so the measurement work
sits off the critical path of the bet.

**7.4 Atom-cap coarsening.** A4 is the one deliberate loss of fidelity: an acropolis
block with 32 blocks of relief gets 12 terraces, not 32 — a monumental terraced
acropolis with ~3-block risers, well inside H1, and almost certainly what the hill-town
calibration asks for. But it is a judgement, the first thing to check on the walk, and
`ATOM_MAX` is the knob if the verdict differs.
