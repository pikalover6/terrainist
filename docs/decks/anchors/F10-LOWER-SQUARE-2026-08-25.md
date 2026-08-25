# F10 probed: the orphans were one island, and parcel growth did not make it

Stocktake Run, unit 18 (2026-08-25). The ledger's F10 said
`LOT_PARCEL_OWN_STATIONS` (own-station parcel growth, `layout/district.ts`)
"leaves the strip's leftover ground unowned and ungraded between the pads"
and that the parcel "has to grow inward first and then take the leftovers
beside it — two phases". The NOW block's rule for this unit: probe first; if
the orphans are geometry rather than order, write it up as P1's evidence.
They are neither. Everything below is measured on the built dist with the
flag flipped **in the dist only** (`sed` on `dist/layout/district.js`,
restored and sha-checked after every run; the source never moved), and with
the walkability audit patched the same way to expose each component's
columns and feet (`scratchpad/f10/{orphans,boundary,surf}.mjs`).

## §A The number, reproduced

`examples/site-plan-hillside.loam.json`, walkability audit (`worstJunctions: 4`):

| flag | buildings | network columns | orphan columns | share | components | entrance reach |
|---|---|---|---|---|---|---|
| off (HEAD) | 16 | 3,818 | 14 | 0.4 % | 14 (all ≤ 4 columns, doorsteps) | 0.999 |
| on | 20 | 3,799 | 898 | 23.6 % | 22 (**one of 875**, 21 of ≤ 4) | 0.999 |

The 898 are not scattered leftovers: **875 of them are one component**, and
its emitters are `plaza` 477, `road:terrace_lanes#route@summit_chapel→lower_square`
242, `…terrace_cottage→lower_square` 121, `…lower_cottage→lower_square` 39, doorsteps.
The `plaza` emitter is the document's own `lower_square` (a 22 × 22 region
placed at x 65…86, z 234…255, foundation 70 — the report's `placements` say
so, not the hill town's street plan). The island is the whole lower-square
end of the town: the square and the three lanes that lead to it.

## §B Where it is cut

With the component's columns in hand, the island has **no 4-neighbour
adjacency to the main component at all** — no step of any height joins them —
and exactly four column pairs within Manhattan distance 4, all at one spot:

| island column (x, y, z) | nearest main column | gap |
|---|---|---|
| −5, 104, 88 | −5, 110, 85 | 3 columns, 6 blocks |
| −4, 104, 88 | −5, 110, 85 | 4 columns, 6 blocks |
| −5, 104, 88 | −5, 110, 84 | 4 columns, 6 blocks |
| −5, 104, 89 | −5, 110, 85 | 4 columns, 6 blocks |

Both sides are the same lane, `terrace_lanes#route@summit_chapel→lower_square`:
its paving is on the main side at (−5, 85) y 110 and on the island side at
(−5, 88) y 104, and **columns (−5, 86) and (−5, 87) carry no walkable
surface at all** (`laidBy` has no entry). The lane arrives at the edge of the
109 terrace, drops six blocks in two columns, and the road emitter lays
nothing on the drop.

Top block per column, x = −5, z 82 → 91 (block-at on both worlds):

- off: grass 109 ×6 · gravel 109 · gravel 108 · stone 108 — the lane is not
  here; it descends elsewhere (§C).
- on: polished andesite 109 ×6 (the lane on the terrace) · **andesite 103 ·
  andesite 103** (the lane below) · stone bricks 107 — a retaining face.

## §C Why the lane is there at all

`layout.placements` differ by one entry: **`infill_-5_73`, footprint x −4…10,
z 73…84, foundation 109** — a building the flag's own-station parcels seat
and HEAD's parcels do not (16 → 20 buildings; this is the lot beside the
terrace edge). At HEAD the same lane's columns near the edge lie in x 1…7,
z 80…100, feet 102…110: it descends the terrace **through the ground that
building now stands on**, at a grade of about one block per two or three
columns, laid as gravel. With the building in the way the router takes the
lane west around it to x −5…−7, where the terrace edge is the retaining
stack, and the descent it can no longer grade becomes a cliff it does not
stair.

So the causal chain is: more lots seated → one lot on the lane's descent →
the lane re-routed onto a retaining edge → a six-block drop over two columns
→ no surface laid → the square and its three lanes become an island. The
parcel's ground ownership is not in the chain anywhere. The report's
district record agrees: one level seam in both states (`above 1, below 0,
drop 7, tiered, 6 cells`), `LOAM-W413 SEAM_UNSERVED` 1 → 0 — the stack is
served; it is the *lane* that is not.

## §D Verdict

- **F10 as written is wrong.** Two-phase parcel growth would seat the same
  building and cut the same lane. Not built.
- **Not P1's evidence either.** No lot dropped for its diagonal here; a lot
  *succeeded* and moved a road.
- **F20 (new):** a routed lane that crosses a retaining edge is laid to the
  edge on both sides and not across it: no flight, no ramp, no diagnostic.
  The router's cost sees the building and not the edge; the emitter sees the
  drop and gives up silently. Either half fixes the walk; the honest one is
  both — the router avoids a descent it cannot grade, and the emitter that
  meets one anyway lays the flight the seam mechanism lays for a stack, or
  says so (`LOAM-W…`, a warning: a lane that ends at a wall is a bug the
  author should hear about).
- **`LOT_PARCEL_OWN_STATIONS` stays off**, now for the right reason: its
  extra lots are exactly what pushes lanes onto edges. When F20 is served it
  is re-tried on the fourteen under law 5.

## §E The other two fixtures are a different shape

Flag off, HEAD: `site-plan-hillside-steep` has main 856 of 4,145 network
columns (largest orphan 635), the walled city main 2,268 of 7,200 (largest
orphan 1,843), and **neither has any island column within four of main**.
That is not one cut; it is a network the audit's paving-only graph reads as
many pieces separated by natural ground — the instrument question F9 already
names (entrance reach 0 on montfort/walled). Not F20; not chased here.

## §F Files

`scratchpad/f10/` — `orphans.mjs` (components by emitter), `boundary.mjs`
(the cut: adjacency, dy histogram, nearest pairs; writes `*-net.json`),
`surf.mjs` (attribution per column from the audit's `laidBy`/`feet`),
`report.mjs` (report capture), `h-on`/`h-off` worlds and reports,
`off.jsonl`/`on.jsonl`/`*-full.jsonl`. The dist patches were reverted and
sha-checked after every run; `packages/compiler/src` moved only in the
switch's docblock.

## §G Unit 19 — F20 in code: the resolver refused the cutting, and the road built the refusal

§B–§D read the cut from the world; unit 19 read it from the code and the
compile, and the mechanism is one step further back than §D says. The road
emitter did not "give up" on two columns; it did exactly what it always does.

**The chain, in the code.**

1. The router (`routeTo`, `ROAD_SLOPE_COST = 8`, no `maxDrop` on a lane) sends
   the lane around the new infill to x −5. Legal, and not the bug.
2. The grader (`gradeProfile`) is a 1-Lipschitz *lower envelope*: from the
   far square at 70 back up the hill it draws a 1:1 line and cuts every
   station above it. At the terrace edge that line is a trench through the
   109 plane — the lane's own declared path reads (−5,106,85), (−5,105,86),
   (−4,104,87), (−4,103,88).
3. The road claims that profile at rank `road.network` (100, tier C). The
   stations z ≤ 87 are columns tier A already won — the `quarter.plane` rows
   at z 85 and z 87 (targets 109, x −59…89 / −11…67) and the infill's
   `building.footprint` apron (x −4…10, z 73…84, apron 2, target 109) — ranks
   15 and 10. The resolver keeps 109 there and grants the cutting from z 88
   on, where nothing else holds the ground.
4. `surfaceRoute` paints every column at the height it was left with: 109 on
   z ≤ 87, 103 on z ≥ 88 — the built lane drops six blocks in one column.
   The audit's `topStanding` then finds the *declared* feet (106, 105, 104)
   under three blocks of the plane's dirt: `buried`, dropped from the
   network, and the square is an island. (`surfaceRoute`'s own comment —
   "the ground the resolver was told about and the ground that gets surfaced
   are one number" — is true only where the claim was granted; census 1.20.)

The road could see the heights (`driver.view("C")` already carries tier A
and B) but not that they were *decisions*: `GroundView` had no ownership.

**The fix.** `GroundView.held` (from `ResolvedGround.owner`, computed in
`viewOf` for every prefix view; absent on the handed and baseline views) and
`ROUTE_PINS_HELD_GROUND` in `structures/roads.ts`: on, a station on a held
column is pinned — ground as held, band 0, floor at the held height — so the
envelope passes through it and the descent is graded *past* the pins, a
cutting only where the road may cut. Pure test on the grader's own numbers
(`test/route-pins.test.ts`): today 107/106/105 through the held rows; pinned
109/109/109 then 108…104, 1-Lipschitz. Landed `false` (law 5).

**Measured on, in the dist** (both constants patched, sha-restored):

| state | buildings | network | orphans | share | largest orphan |
|---|---|---|---|---|---|
| own-stations on, pins off (§A) | 20 | 3,799 | 898 | 23.6 % | 875 |
| own-stations on, **pins on** | 20 | 3,804 | **23** | 0.6 % | **3** |
| pins on alone | 16 | 3,818 | 14 | 0.4 % | 1 |

The lane at x −5, z 84 → 92, top blocks: island world `109 109 109 | 103
103 …`; pinned world `109 109 109 108 108 107 106 106 105` — a step a column.
The 23 that remain are the same ≤ 4-column doorstep specks HEAD has (14).

**On the fourteen with pins on alone: all fourteen payload-identical.** No
law-5 document has a lane whose envelope crosses a held column, so the flip
moves nothing on the anchor set — its evidence is this fixture and the
grader's test, exactly D22's situation.

**What stays open.** The pins are read at the centreline station, like the
profile's ground; a held column under the lane's *shoulder* is still
refused and painted at its own height (unmeasured; no such column on the
fixture). `LOT_PARCEL_OWN_STATIONS` is retried on the fourteen under law 5
once the pins ship — its 24 % was this bug, and its remaining cost is what
that re-pin measures.
