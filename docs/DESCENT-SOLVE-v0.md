# The descent solve v0 — one cliff, one descent, solved against the resolved field

*Ratified by Kai, 2026-08-21, on three sightings of one defect. His verdict on the first, verbatim: **"recognize the situation (two overlapping staircases going down a very steep cliff), and run a robust solver to spit out something coherent, rather than try to harmonize a huge mess."*** This is that solver's design. It follows `docs/ELECTION-SOLVE-v0.md`'s template exactly — recognize upfront, solve as one object by an exact integer method, declare, and keep an explanation record a walk verdict can land on — and it is the answer to **the crossing law**, the one design call iteration 3 left open (`064c2d5`; `docs/TROY-RUN-2026-08-21.md`, iteration 3).

**It amends `docs/GROUND-CONTRACT-v1.md`** in two places and no others: §1.7 gains a third subtraction (§3.2), and §4 item 6's deletion of `terminusLandings` is re-scoped (§5.2). It does **not** touch v1's rank table, tier order, five resolves or freeze — §3 is a defence of leaving all four alone. `ELECTION-SOLVE-v0` is unamended; this design consumes it.

## 0. The three sightings are one family

| # | what was seen | the mechanism |
| --- | --- | --- |
| S4 | Troy `(68,−104)`: two staircases down one great west cliff, on seemingly-colliding paths that never meet — a jagged, incoherent stair mess | the router drew two `steps` segments; each was graded alone by the tread law; **nothing owns "the descent of this cliff"** |
| S5a | Troy `(202,−110)`: a coherent flight ends **mid-air**, its lower half resolved away by the lower street's cut (walk probes, `S5a` section) | `streetStairLevels` grades against a frozen `natural` snapshot (`street-stairs.ts:358`, `:346-356`); the far end is pinned only where another *segment* owns it (`roads.ts:1640`), never to the resolved ground |
| the rank severance | a flight (`street.network`, 80) loses overlap columns to `quarter.plane` (15) and publishes stair levels it never receives — 271 hillside / 3,421 steep orphan columns (`test/walkability.test.ts:354`, `:440`) | rank order working as designed, on two claims that never negotiated |

One root: **the network's descent of a steep face is decided piecemeal** — a path chosen by a router that cannot see the face, a profile laid by a 1-Lipschitz law that cannot see the resolved field, and a contest arbitrated by a rank table neither party consulted. Three procedures, one object, no owner. `064c2d5` proved both obvious patches worthless *at the tread law* — pin-and-refuse cost the steep fixture **a third of its paving** (4,369 → 2,927 columns), bend-don't-refuse moved three columns — because the lever was never there.

---

# 1. Recognition — what "a steep face the network must descend" is

## 1.1 The field it is read from

The **pristine baseline materialisation**, `materialisedGround(region, field)` (`layout/street-datum.ts:203`) — the same array `gradeStreetDatum` samples, by the same rule (`clampY(Math.floor(v))`), so the descent and the street datum never disagree about the hill by one block. Written `h`.

Recognition reads **no resolved tier**. It is a datum in the §1.3 sense (`GROUND-CONTRACT-v1.md:96-127`): pure over `(region, StreetGraph, field, StreetDatum, occupancy)`, declaring nothing, and so governed by the datum law rather than the §1.4 read law. §4 makes that exact.

## 1.2 The scarp mask and the face — normative

- **S1** A column `c` is a **scarp seed** iff `max over its four neighbours n of (h[c] − h[n]) ≥ 2`. Two, because one is a kerb (`ELECTION-SOLVE-v0.md` §1.3.3; `platforms.ts:411-414`) and `STREET_STAIR_RAIL_DROP = 2` (`street-stairs.ts:135`) is already the first drop a player can fall down. **A hillside falling one block per column seeds nothing** — the gentle-slope false positive is answered in the mask, not by a guard (§7.1).
- **S2** A **face** is a 4-connected component of the scarp mask **dilated 2 Chebyshev**. The dilation makes a stepped scarp — riser, tread, riser — one face instead of three; 2 is `SEAM_SETBACK`/`SEAM_TREAD`'s order, so anything a tier stack would dress as one stack is one face.
- **S3** No relief threshold lives here. A face's size is not what makes a descent — the network's demand is (§1.3) — and pricing the face alone would be a threshold with nothing walked behind it.

## 1.3 The demand — who wants down

A **demand** is a segment of the quarter's `StreetGraph` that must lose height across a face. Two sources, both in the graph before anything is declared:

- **D1** a segment with `role: "steps"` or `role: "cart"` (`roads.ts:1144`, `:1298`) whose path intersects the face — the router already decided this is a flight;
- **D2** a `role: "carriageway"` segment whose graded datum profile presents a riser ≥ 2 at a station inside the face — T12's break-into-steps case (`STREET_CUT_MAX = 2`, `roads.ts:228`; `GROUND-CONTRACT-v1.md:566`) caught where it fires rather than where it was intended.

A demand's **terminals** are the last banded column of its path on the high side of the face and the first on the low side (`StreetDatum.band`, `street-datum.ts:100`), at their datum levels `columnY` (`:98`): `(u, Ytop)` and `(v, Ybot)`.

**A demand is steep** — and only then does a descent exist — iff both:

- **R1** `Ytop − Ybot ≥ DESCENT_DROP_MIN = RETAIN_MAX = 6` (`levels.ts:86`) — the drop needing at least one retaining wall to be a face at all;
- **R2** `chebyshev(u, v) < EARN_RATIO · (Ytop − Ybot)`, `EARN_RATIO = 2` (`emit/walkability.ts:1207`) — the same ratio the walkability audit uses to decide whether a route earns its drop. At or above it a street simply grades, which is what a street is for.

Both are **datum** quantities — two streets 6 apart, closer together than twice that. The terrain's opinion of itself never enters, which is why an election that flattens a scarp away cannot leave a descent stranded (§7.2).

## 1.4 One face, one descent problem — S4's unification, stated

> **Every steep demand crossing the same face belongs to one descent problem, and that problem has one solution object.**

That is the whole of S4. Two staircases down one cliff are not two answers to harmonise; they are one question asked twice, and §2.5 makes the second a **branch of the first**, joining at a landing.

The one legal split: two demands over one face are solved as **separate descents** iff their upper terminals are more than `DESCENT_SHARE_SPAN = 32` columns apart in Chebyshev distance — a cliff long enough to want two stairs gets two. 32 is `SEAM_STAIR_JOIN`'s argument taken at cliff scale (`district.ts:4733`: past six columns a flight "is not arriving at the street, it is a second street drawn beside it"; a whole descent is measured in tens, not units). Grouping is **single-linkage over the upper terminals in ascending region-index order** — deterministic, with no clustering parameter beyond that one span.

---

# 2. The solve

## 2.1 The object

A **descent** is a rooted tree of **runs**: one **trunk** from the senior demand's upper terminal to its lower terminal, plus at most one **branch** per remaining demand in the group, each joining the trunk **at a landing**. A run is a 4-connected centre line with one integer stand level per column. Nothing else is in the object — width, tread mix, balustrade and materials stay with the existing dressers (§2.6).

## 2.2 The state space — the tread law becomes the search, not a post-pass

The one structural idea here. The tread law T11 (`need[k] = max(g[k]+1, need[k+1]−1)`, `sweep.ts:936-1000`) is a *filter on a path somebody else chose*. Make it the **state space** and the path is chosen knowing it.

A **state** is `(c, y, d, s)` — column, stand level, incoming direction (4), and `s = min(columns since the last riser, DESCENT_LANDING_MIN)` saturating, with `DESCENT_LANDING_MIN = CART_TREAD_RUN = 3` (`profiles.ts:175`). Legal states and transitions, all integer, all verbatim from ratified laws:

- **T1** `y ≥ h[c] − MAX_TREAD_CUT` (`sweep.ts:864`, `= 4`) and `y ≤ h[c] + STREET_STAIR_MAX_FILL` (`street-stairs.ts:75`, `= 8`) — a tread is masonry on the hill within the courses a flight may carry.
- **T2** A step to a 4-neighbour changes `y` by `0` (a **tread**) or `−1` (a **riser**). Never `+1`: a descent that climbs is the same object walked backwards, and forbidding the rise is what makes the level dimension a DAG in `y` and the search finite.
- **T3** A **turn** (`d' ≠ d`) is legal only when the step is a tread and `s = DESCENT_LANDING_MIN`; a turn sets `s := 0`. Every direction change therefore sits inside a level run of ≥ 3 columns on both sides — **a switchback's landings are a property of the state space, not a special case.**
- **T4** `c` is legal only if its whole cross-section at direction `d` is legal by `streetStairGeometry`'s existing predicate (`street-stairs.ts:266-330`): no water or `fluidKind`, no building footprint, no foreign paving. The tier-A classes a descent may never take — `fluid.channel` 0, `building.footprint` 10, `precinct.ground` 20, `structure.linework` 25 — are hard-forbidden here, which is what makes §3.2's subtraction safe.
- **T5** Start `(u, Ytop, d_in, LANDING_MIN)`; goal `(v, Ybot, *, *)` — **an equality at both ends**. S5a is not expressible: a run that cannot reach the resolved lower terminal is not a run.

**Straight flight, side-hug traverse and switchback are outcomes, not modes.** A face with room produces a straight fall-line path because it is cheapest; a face too steep for 1:1 has *no* legal straight path (T2 caps the fall at one per column) and the cheapest legal path folds along the contour. There is no alignment selector to tune and no predicate to get wrong — the same move `ELECTION-SOLVE-v0` §1.1 makes when it deletes the terrace splitter.

## 2.3 The cost — one integer per step

```
step(a → b) =  RUN_W                                every column of run
             + CUT_W  · (h[b] − y_b)⁺               tread cut into the hill
             + FILL_W · (y_b − h[b])⁺               masonry under the tread
             + SCARP_W · max(0, h[a] − h[b] − 1)     ground falling under a tread
             + CLIMB_W · (h[b] − h[a])⁺             ground rising under a descent
             + TURN_W · [d' ≠ d]                    a bend in the flight

RUN_W = 1   CUT_W = 3   FILL_W = 2   SCARP_W = 2   CLIMB_W = 8   TURN_W = 6
```

`CUT_W` and `FILL_W` are **imported from `layout/election-solve.ts:85`, not redeclared**: "cut is worse than fill" has one home and one calibration (`ELECTION-SOLVE-v0.md` §1.3.1, the walked west flank). What the other three pin:

| walked evidence | what it fixes |
| --- | --- |
| S4's verdict — "jagged", two lines that never meet | `TURN_W = 6`: a bend costs six columns of run, so a fold wins only when the straight line is infeasible or ~18 columns longer. This is the term that makes a flight read as one staircase. |
| a flight riding a scarp with void beneath it (S5a's section, y 87–91) | `SCARP_W = 2`: a tread over ground falling faster than the flight prices the drop it is carrying, so the path prefers the traverse that walks the fall down at 1:1 — the side-hug shape, out of one weight. |
| a descent that goes *over* a bulge rather than round it | `CLIMB_W = 8`, above `TURN_W` on purpose: rounding is cheaper than climbing at any bulge under eight blocks. |

**The standing law, this document's analogue of the convexity law:** *every descent cost is a non-negative integer attached to one step; the objective is their sum; no term may depend on the path globally.* A path-global term (total wiggle, terrace count, "coherence") forfeits §2.4's exactness and is a design change, not a tuning.

## 2.4 The method — exact, integer, deterministic

**Dijkstra over the state graph**, integer costs, no float anywhere.

- **M1** States pack to one integer key `((c · span + (Ytop − y)) · 4 + d) · (LANDING_MIN + 1) + s` — ascending region index, then descending level, then direction index, then `s`. The queue orders by `(cost, key)`, so the optimum is **unique**: among equal-cost paths the lexicographically least state sequence wins, by construction rather than by a comparator someone must remember (`ELECTION-SOLVE-v0.md` §3.4 S3's discipline, one method over).
- **M2** Bound: `|states| ≤ |F| · (span + 1) · 4 · (LANDING_MIN + 1)`, `span = Ytop − Ybot + MAX_TREAD_CUT + STREET_STAIR_MAX_FILL`. A `FACE_MAX_COLUMNS = 4096` cap refuses recognition outright above it (`LOAM-W412`), so the bound is a priori; at Troy's scale that is ~4,000 · 30 · 16 ≈ 2·10⁵ states at four edges each.
- **M3** **Whole-run refusal survives verbatim** (T11's rule, `street-stairs.ts:33-36`): goal unreachable ⇒ the run is not built at all. What changes is that the refusal is now a statement about the **whole face** and every path across it, not about one line a router guessed.
- **M4** Exactness is tested, not claimed: a brute-force oracle enumerating every legal path on generated faces of ≤ 8×8 columns and ≤ 6 levels must agree **exactly** — cost and path — and likewise on every recognized face of the two walkability fixtures that fits the bound.

## 2.5 The branch — how two demands become one object

Demands in a group are ordered by `compareStreetRank` (`street-owner.ts`, T14 — `(−width, roleRank, kindRank, id)`), already the street family's total order. The senior demand is solved first: that path is the **trunk**. Each remaining demand is solved with its goal set **enlarged** to `{(v, Ybot)} ∪ { trunk states with s = LANDING_MIN }` — the trunk's landings, and only its landings. Dijkstra takes a multi-goal set at no cost. Consequences, term for term against S4's verdict:

- two stairs down one cliff **meet**, at a landing, on a level tread — or the second runs to the street on its own and never touches the first;
- they cannot cross: a branch that reached a trunk column reached a *goal*, so no state past it is ever expanded;
- the object is one tree and reads as one piece of masonry.

**Invariant (the S9 orphan class, killed by construction):** *a landing exists iff the run it belongs to exists.* Landings are maximal level runs of a solved run of a built descent; nothing else may publish a landing on a claimed face (§5.3). A tread published for a flight that does not exist has no producer left.

## 2.6 The profile, the mix, the dressing — all reused, none reimplemented

The search returns the levels. `treadPlan(levels, ground, { relief: true })` (`street-stairs.ts:406`) computes the stair/slab mix unchanged — it consults no ground and is a pure function of the levels, which is exactly why it survives the change of author. `dressStreetStairs` and `streetStairRail` (`street-stairs.ts:469`, `:740`) are untouched: the descent hands them a `StreetStairLevels` and they cannot tell who computed it. One test keeps T11 honest: **on a face with no turn and no landing constraint the search's levels equal `synthesizeTreads`' output exactly.**

## 2.7 The explanation record — mandatory

`LOAM-I499 STREET_DESCENT`, one per descent, plus a `DistrictStats.descents` payload: face id and column count; the demands and their terminals at datum and resolved levels; trunk and branch lengths; risers, landings, longest level run; **the six cost terms of the chosen path and of the best path constrained to the straight fall line** — the marginal that makes "why did it switchback here" answerable; `descentMs`. Refusals carry `LOAM-W412 DESCENT_REFUSED` with a reason (`unreachable`, `face-too-large`, `terminal-drift`) and the demand that lost; `LOAM-T243 DESCENT_TERMINAL_DRIFT` counts §4.2's re-pins. **Without this record the design is not maintainable and must not ship** — `ELECTION-SOLVE-v0.md` §3.6's rule, for its reason: a procedure can be debugged by reading it, an optimum cannot.

---

# 3. The rank question — the crossing law is a **subtraction, not an arbitration**

## 3.1 The three candidates, and the verdict

| candidate | verdict |
| --- | --- |
| **(a)** a `street.descent` class above 15 in tier A | **Rejected.** Rank 15's justification (`GROUND-CONTRACT-v1.md:174-180`) is that a plane is *the thing a quarter's plaza, courtyard, seam, street and sidewalk are laid on*. A class above it buys the contest a winner and leaves the plane the notch — the shipped defect with its sign flipped — and renumbers an argument four documents quote. |
| **(c)** the plane yields at resolve | **Rejected hardest.** It makes first-writer-wins conditional: a second arbitration law inside the one resolve. §1.5's table is a *total order*, and a yield clause is exactly the "five simultaneous height authorities" §0 exists to kill. |
| **(b)** the plane's declarer **subtracts** the solved descent, as §1.7 rule 1 already has it subtract the solved carriageway band | **Chosen.** |

## 3.2 The mechanism — `GROUND-CONTRACT-v1.md` §1.7 gains a third subtraction

> **3. `quarter.plane` subtracts the solved descent corridors.** The corridor is the union over solved descents of each run's cross-section at `streetStairGeometry`'s width, dilated 1 Chebyshev — the construction rule 1 uses for the carriageway band, from the same module discipline (`layout/solved-carriageway.ts:104`).

As with rule 1, the subtraction is *already* the shape the platform partition speaks: the corridor joins `blocked` in `derivePlatforms` (`platforms.ts:509-511`, where `blocked = carriageway | sidewalk` today), so the election's atoms are cut around a descent exactly as they are cut around a street. The plane **never asks for a descent's columns**, so the resolver never arbitrates them, so the severance is impossible rather than won.

Everything else stays where it is: the descent declares `street.network`, rank 80, tier C, `preserve` over its band — the claim `roads.ts:1687-1697` already files. **No new class, no rank moved, no yield clause, no sixth resolve.**

## 3.3 Why this is not pin-and-refuse

`064c2d5`'s first rejected fix pinned the tread law to columns *somebody else had already decided* and refused what could not meet them; a one-column notch two blocks deep is infeasible by arithmetic, so nearly every contested flight refused whole and the steep fixture lost a third of its paving. The difference is causal, not quantitative: **there is no notch to meet.** The contested columns leave the plane's claim before the plane is declared, so the ground under a descent is the pristine baseline the search already solved against, and the only refusals left are faces with genuinely no legal path. §6.2 makes that a hard acceptance row — paving may not fall.

## 3.4 The superset property — the test

`GROUND-CONTRACT-v1.md:284-289`'s assertion, extended verbatim in form: **no column owned by a solved descent lies inside a `quarter.plane` claim**, and no descent column lies in the solved carriageway band. Asserted on all three r22 documents and on the two walkability fixtures, in the same test as §1.7's.

---

# 4. Timing — exactly where in §1.6's pass order

The object splits in two, along the same seam the ground contract cuts everywhere else.

## 4.1 The alignment half — pass 4, layout, as the **fifth datum**

`solveDescents` runs in pass 4 (`GROUND-CONTRACT-v1.md:225-227`) after `gradeStreetDatum` (`district.ts:1239`) and **before** `derivePlatforms` (`platforms.ts:351`), producing a `DescentDatum`: pure over the pristine baseline, the `StreetGraph`, `StreetDatum` and the solver's occupancy; reading no plan and no resolver output, declaring nothing. It joins the four datums under the §1.3 purity test unchanged, and `derivePlatforms` consumes its corridor as `blocked` (§3.2).

*Why an alignment solved against the pristine baseline is exact against the resolved field:* because it reserves its own columns. Every tier-A class that could have moved that ground is either hard-forbidden by T4 or subtracted by §3.2, so on a descent corridor **resolved ground = pristine baseline**, provably — and the search's `h` is the field the flight is built on.

## 4.2 The profile half — pass 5b, tier C, with the street family

The descent's runs register as `role: "steps"` segments on the quarter's graph carrying their solved levels, so `surfaceStreetGraph` (`roads.ts:1690`) files them in the street family's single commit (`roads.ts:1670-1675`: "the street family declares as **one subsystem**"). At that moment the terminals are re-read from the family's own settled `columnY` — intra-subsystem data, not a tier read, exactly as `street.sidewalk` reads its flanking carriageway (`GROUND-CONTRACT-v1.md` §1.5, rank 90) — and the ground under the corridor from `view(C)`.

If a terminal moved — possible only if a class above 15 took the terminal column — the **profile pass alone** re-runs over the fixed alignment with the new pins (`synthesizeTreads` verbatim, `O(n)`), and a failure is a whole-run refusal with `LOAM-W412`. `LOAM-T243` counts the drift; a nonzero count on an acceptance world is a finding, not a nicety.

Downstream is unchanged: the fifth resolve arbitrates, the freeze freezes, the transition generator (§3.3 as amended at the G6 second stop) dresses the descent's flanks as ordinary boundary pairs, `finishSeams` builds the rest, and `LOAM-E495`'s coverage invariant proves nothing was missed.

---

# 5. What dies

**5.1 Per-street stair grading, on claimed faces only.** `streetStairLevels` (`street-stairs.ts:358`) keeps its signature and gains a "levels already decided" path for a segment belonging to a descent. Off a claimed face it is untouched byte-for-byte, which is what keeps every world with no steep demand identical.

**5.2 `terminusLandings` — re-scoped; §4 item 6 is amended by measurement.** `roads.ts:3353` negotiates a street's terminal columns *down* onto a flight corridor because the flight's foot and the street's profile are two 1-Lipschitz lines falling in parallel (`:3265-3283`). On a claimed face there is nothing to negotiate: T5 makes the flight's foot an **equality** against the street's own level. So the pass is scoped out of claimed faces and stays, unconditional, everywhere else — its live witness `examples/site-plan-hillside`'s three-block riser at `(5, 44)` is relief 3 and never recognized (R1). WP-G2 and WP-G4 each deleted it and each measured the deletion back out (`:3305-3350`) for want of a replacement; this is that replacement **for the steep case only**, and says so rather than repeating their claim. Full deletion waits on WP-D0's census of off-face firings.

**5.3 `deriveSeamStairs`' overlap with the descent.** S9 (`district.ts:4826`) may **not** cut a flight through a claimed face. Where a landing stack's two ends sit on opposite sides of one, the demand belongs to the descent as a branch (§2.5) and S9 emits nothing for that stack; every other stack is unchanged and `MAX_DERIVED_STAIRS` is unaffected. The orphan class then dies by §2.5's invariant: *a landing exists iff its flight does*, and on a claimed face the descent is the only producer of either.

---

# 6. Staging and acceptance

## 6.1 Work packets

- **WP-D0 — the face census becomes a harness.** `tools/worlds/descent-census.mjs` publishes per quarter: scarp seeds, faces, face column counts, demands per face, terminal drops, the `EARN_RATIO` distribution, and `terminusLandings` firings **on and off** recognized faces. The committed baseline every later row is read against. No source change.
- **WP-D1 — recognition** (§1) built, measured, used by nothing. Byte-identical.
- **WP-D2 — the solver** (§2) behind `DESCENT_SOLVE = false`, with §2.4's oracle and §2.6's T11-equivalence test. Byte-identical.
- **WP-D3 — the flip**: §3.2's subtraction, §4's wiring, §5's re-scopings, §6.2's table, one commit. **WP-D4 — the walk.**

**The flag.** `DESCENT_SOLVE` in `layout/types.ts` beside `ELECTION_SOLVE`, which it **implies** (it needs the plane's declarer to subtract) and which in turn implies `GROUND_V1_FREEZE`; asserted by the ladder test in `test/ground-contract.test.ts`.

## 6.2 Acceptance

*Flag off:* byte-identical on the shasum control set, every stage.

| window / measure | target |
| --- | --- |
| **S4**, Troy west cliff, probe window `x∈[60,76] z∈[−112,−96]` (pinned exactly at WP-D0) | **exactly one** descent object claims the face; ≤ 1 branch; **zero** pairs of descent runs 4-adjacent at different levels outside a declared join |
| **S5a**, Troy `x∈[194,212] z=−110` | the lowest tread is 4-adjacent to a lower-street column at `|Δ| ≤ 1`; new probe **`midAirTerminations` = 0** on all five acceptance worlds |
| hillside `orphans` (`walkability.test.ts:354`) | **271 → ≤ 20** (pin-and-refuse reached 9 by deleting the fabric; this must reach it keeping the fabric) |
| steep `orphans` (`:440`) | **3,421 → ≤ 400** — from 78 % of the paving to under 10 % |
| **the anti-pin-and-refuse guard** — `columns` (`:340`, `:436`) | **may not fall more than 2 %** (hillside ≥ 3,929; steep ≥ 4,282). A row trading paving for orphans fails the packet outright. |
| `unservedFaces` (`:424`, `:469`) | hillside **2 → 0**; steep **6 → ≤ 3**; `components` and `deadEnds` may not rise |
| `LOAM-W412 DESCENT_REFUSED` | reported per face with a reason; **no refusal whose reason is `terminal-drift`** |
| `LOAM-E495`, the 27 physics rules, all worlds | 0 |
| walked-fixture no-regress set | every world with **no** steep demand byte-identical; the r22 cliff census no worse row-for-row against WP-D0 |
| suite | green; `street-stairs`, `terminus-landing`, `walkability`, `ground-contract`, `platforms` re-pinned to the object, not the procedure |

*Walk gate:* **yes**, riding the next deck, on the S4 cliff and the S5a flight specifically. Visual taste lands only on Kai's verdict; the manual critique→repair law is untouched.

## 6.3 The weight-calibration protocol

| walk complaint | dominant term in `LOAM-I499` | knob | direction |
| --- | --- | --- | --- |
| "it wiggles / it's jagged" | `turn` | `TURN_W` | ↑ |
| "it should have switchbacked — that's a scramble" | `scarp` | `SCARP_W` | ↑ |
| "too many folds, just run it down" | `turn` low, `run` high | `TURN_W` | ↓ |
| "it's a trench beside the stair" | `cut` | `CUT_W` (`election-solve.ts`, both users) | ↑ |
| "the flight is on a viaduct" | `fill` | `FILL_W` | ↑ |
| "the landings are pokey" | — | `DESCENT_LANDING_MIN` | ↑ |
| "two stairs where one would do" | — | `DESCENT_SHARE_SPAN` | ↑ |

**The law, as the election's §6.3 states it:** a walk verdict may move a weight; it may never add a threshold, a predicate, a special case, or a path-global term.

---

# 7. Risks, honestly

**7.1 Recognition false positives on gentle slopes.** Structurally answered: S1 seeds only on a ≥ 2 riser, so a one-per-column hillside has no face at all, and R1/R2 then demand a *street-to-street* drop of 6 at better than 1:2. The residual risk is the opposite one — a **terrace-seam** face inside a quarter recognized where a kerb and a short flight would have done. WP-D0's census is the instrument (faces of relief 6–8 with one demand are the suspect population) and `DESCENT_DROP_MIN` is the knob.

**7.2 The election and the descent read the same baseline.** A face recognized on the pristine baseline that the election would have flattened away. Two structural mitigations: R1/R2 are **datum** quantities, so a face no streets straddle at 6+ never becomes a descent; and §3.2's subtraction runs before `derivePlatforms`, so the election cannot flatten a corridor it may not claim. What remains is a real coupling — the corridor changes the election's atom partition — and it is measured, not argued: WP-D3 reports atom counts and A3/A4 merges against WP-D2's.

**7.3 The natural-blend banks.** A bank's ramp ring and a tiered stack's treads are now the resolver's own geometry, constrained to "columns no higher-ranked claim owns" (`GROUND-CONTRACT-v1.md` §3.3, the G6 amendment). A descent's `preserve` band at rank 80 is such an owner, so a bank beside a descent will sometimes find its run short, re-dress `revetted`, or refuse with `LOAM-W413`. **Expect W413 to rise on faces carrying a descent** — dressing debt of exactly the kind the election flip already produced (1 → 12 quarters), named here so it is not read as damage. The acceptance row is that `unservedFaces`, the walkable measure, falls anyway.

**7.4 Solve cost.** Bounded a priori by M2 and capped by `FACE_MAX_COLUMNS`; `descentMs` is recorded beside `electionMs` and `groundMs`, a test asserts the per-face state count never exceeds the bound, and the ground stage's 10 % wall-time envelope (`GROUND-CONTRACT-v1.md:1274`) is the budget. Descents are per **face**, not per column, and there are single digits per world.

**7.5 What this document does not cover.** Recognition is **demand-driven**: if the router drew nothing across a cliff, no descent exists and the cliff stays a cliff. Making the router *want* a crossing it never asked for is a separate design, deliberately not attempted here — all three sightings are cases where the network already went down, and went down badly.


## Amended at WP-D3 (measured): recognition is connectivity, not segments

WP-D3 wired every joint (proven on a synthetic cliff) and then measured
recognition firing on ZERO real documents. Two structural causes, both in
§1's demand definition, neither in the solve: (a) `gradeStreetDatum` is
1-Lipschitz along a path, so a carriageway's `columnY` can never present a
2-riser — the D2 signal is **T12's break-into-steps stations**, which the
datum already marks, not profile differences; (b) the flights that actually
race real cliffs are **S9 seam stairs created at pass 5b**, after pass-4
recognition closes — a demand defined as "an existing steps segment" looks
for the disease's symptom in the wrong pass. The amendment, in the design's
own original language ("the set of streets wanting through"): **a D1 demand
is a face together with opposing network terminals** — street/carriageway
stations within `DESCENT_REACH` of the face on both sides at datum levels
differing by the steep test — whether or not any stair yet exists; the
solver PROVIDES the connection S9 would otherwise improvise, and S9 stays
scoped off claimed faces. D2 demands read the break stations. The fixture
orphan classes (1:2.5 cones, zero seeds) are explicitly OUT of the descent
solver's scope and keep their own S9 ownership — their targets move out of
this design's acceptance and back to the walkability goldens.

## Amended at WP-D4 (measured): the amendment's constants, and §5's scope

WP-D4 implemented the connectivity amendment and measured five corrections
into it, each forced by a number rather than a taste:

- **`DESCENT_REACH = DESCENT_EARN_RATIO · DESCENT_DROP_MIN` (12), test-pinned.**
  The reach is R2's own budget: the smallest pair R1 and R2 both accept spans
  exactly 12 columns, so any other reach is a second silent threshold on the
  same quantity. Reach is credited **from each street's kerb** (its band
  half-width plus the sidewalk), not its centre line — measured: a 5-wide
  street with its kerb on the scarp lost the west cliff by 3 columns.
- **A long approach offers a station every `DESCENT_SHARE_SPAN` columns.**
  One station per maximal run left the relief-47 face with 6 scattered
  stations and zero legal pairs (27 pairs died on R1, 26 on R2). Chunking at
  the span §1.4 already calls "two problems" keeps the pairing local without
  a new threshold. Pairing is a greedy closest-first **matching** (no station
  serves two demands); groups truncate to `DESCENT_GROUP_DEMANDS_MAX = 2`
  (§6.2's S4 row by construction); flights are `DESCENT_FLIGHT_WIDTH = 3`
  wide — the router's lane, not the terminals' carriageway width.
- **§5's claim is the corridor's neighbourhood, not the face's component.**
  `claimed` marks only face columns within `DESCENT_REACH` of a solved run.
  Measured: claiming the whole 4-connected component took `LOAM-I414` from 12
  derived flights to ZERO across the citadel — one descent silencing every
  seam stack, a deletion wearing a scoping's name. (`DESCENT_SHARE_SPAN` as
  the halo was measured too and is too wide: S5a lost its stairs and got
  nothing back.)
- **Solved runs join T4's forbiddance for every later group**, in
  recognition's own deterministic order — §6.2's "no colliding independent
  stairs" made impossible rather than checked.
- **§4.2's registration covers the flight nothing named.** A run whose
  demand is no segment files as a `steps` member of the street family with
  its solved levels and its senior terminal's width class; a router `steps`
  segment crossing a claimed stretch is superseded whole (§5.3 read from the
  flight's end).

Flag-on acceptance on Troy: 3 faces, 3 demands (all D1 connectivity), 2
descents built, west cliff relief-47 SOLVED (trunk 27 columns, 11 risers,
3 landings, cost 74; straight fall infeasible on both faces, so the
switchback is forced, not preferred), one honest `unreachable` refusal on
the junior demand. S4 flank orphans 9 → 2 (worst −8); S5a untouched;
physics 14 = 14 identical by rule; `LOAM-I414` 12 flights with the cap
exhausted → 12 with the cap free. §7.3's predicted dressing debt appeared
on schedule: retaining.seam flank gains on 4 columns. §7.2's coupling
measured at the east cluster (210,−98): 2066 → 2505, away from any descent.
