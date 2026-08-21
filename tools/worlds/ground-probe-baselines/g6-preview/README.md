# `g6-preview` — the WP-G6 flag-on census, all six documents

Rewritten at **G6-r4**, with `GROUND_V1_FREEZE = true`, §3.3's transition
generator inside the fifth resolve, and §7.1's authored-program cut landed
(siting and `prop.pad` claims at pass 5b″, execution at 5f). **These are a
measurement, not a baseline to hold to**: the shipped state is flag off and
byte-identical, and the flag-on state is still known incomplete — see "what is
still missing" at the foot of this file.

**Measured at `2d0e32a`**, i.e. *after* WP-E3 flipped `ELECTION_SOLVE` to true
mid-round. That flip moves these numbers more than the freeze does, and the
`(pre-flip)` column below is kept precisely so the two causes stay separable:
it is the same measurement taken at `f7b1216`, the commit this round opened on.
Every file here is `ground-probe.mjs <doc> - <label> --out <file>` over the
compiler built with `GROUND_V1_FREEZE = true` and every other flag at its
committed value.

- **`troy.json` exists at last.** `troy_r22` threw flag-on for three rounds
  inside the authored-program pass — `prop.pad`, tier D, committed at pass 5f
  from `treatProgramSite`, a hundred passes after tier E had been read. §7.1's
  cut is what fixed it: `declarePrograms` sites every job and files every pad
  and apron claim before `freeze()`, `executePrograms` lays the blocks after,
  over the resolved ground. It is the **only** post-seal declarer the six
  documents have; nothing else appeared behind it.
- Every file has `writtenVsResolved.total === 0`, `finalPlanVsWritten.total
  === 0` and **five** resolves, and every one compiles with `LOAM-E495`,
  `LOAM-E494` and `LOAM-W494` at zero, zero unattributed divergence, and zero
  `driverMismatches`.

## The flag-on table (at `2d0e32a`), against its own flag-off control

| doc | w/vR on→off | fP/W on→off | resolves on→off | W413 on/off | skirt on/off | town on→off | sidewalk Δ0 on/off | seats above floor |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| troy | 0 → 0 | **0 → 247** | 5 → 545 | 7 / 8 | 420 / 415 | 2214 → 2777 | 1921/2023 · 1916/2047 | **0** |
| hellenist | 0 → 239 | 0 → 0 | 5 → 33 | 0 / 0 | 133 / 134 | 420 → 420 | 3868/3978 both | 2 |
| pirates | 0 → 0 | 0 → 0 | 5 → 109 | 2 / 2 | **106 / 106** | 347 → 343 | 2624/2646 · 2622/2646 | 0 |
| harbourtown | 0 → 205 | 0 → 0 | 5 → 151 | 5 / 5 | 605 / 605 | 2011 → 2011 | 9978/10352 both | 0 |
| bayline | 0 → 0 | 0 → 0 | 5 → 12 | 0 / 0 | 0 / 0 | 3 → 3 | 7899/7899 both | 2 |
| ironvale | 0 | 0 | 5 | 0 | 0 | 31 | — | 0 |

The same six, **pre-flip** (`f7b1216`, `ELECTION_SOLVE = false`), so the
freeze's own contribution before the election landed is readable on its own:

| doc | w/vR on→off | fP/W on→off | resolves on→off | W413 on/off | skirt on→off | town on→off |
| --- | --- | --- | --- | --- | --- | --- |
| troy | 0 → 145 | **0 → 247** | 5 → 711 | 18 / 18 | 1546 → 1578 | 3788 → 4327 |
| hellenist | 0 → 239 | 0 → 0 | 5 → 33 | 0 / 0 | 133 → 134 | 420 → 420 |
| pirates | 0 → 0 | 0 → 0 | 5 → 186 | 2 / 2 | 29 → 29 | 482 → 478 |
| harbourtown | 0 → 205 | 0 → 0 | 5 → 151 | 5 / 5 | 605 → 605 | 2011 → 2011 |
| bayline | 0 → 0 | 0 → 0 | 5 → 12 | 0 / 0 | 0 → 0 | 3 → 3 |
| ironvale | 0 → 0 | 0 → 0 | 5 → 48 | 0 / 0 | 0 → 0 | 31 → 28 |

"skirt pairs" is every `cliffCensus` row naming `retaining.skirt` on either
side; "town pairs" is every row but `natural over natural`; "seats above floor"
is `buildingSeats.sinkHist` at any negative delta, which §6/G6 targets at 0.

**`finalPlan vs written` on troy is the row this work package has owed since
G4: 247 → 0, at both HEADs, and it is exactly the number §6/G6 predicted.**
Nothing moves `plan.ground` after the freeze any more, on any of the six.

## Three findings

1. **Pirates' r3 skirt deviation is closed, and it was never the freeze.**
   G6-r2 recorded pirates at 106 skirt-owned pairs flag-off collapsing to 29
   flag-on, with town pairs rising 343 → 482. Measured pre-flip at `f7b1216`,
   **flag-off is also 29 and 478** — the r3 flag-off figures had been taken
   against an election-solved tree, so the comparison was never like-for-like.
   Post-flip, flag-on and flag-off both read **106 skirt pairs**, with town
   pairs 347 against 343. Nothing was double-built and nothing was skipped: the
   generator's stacks add four street/verge pairs to a town of 5,136.
2. **`LOAM-W413` does not move with the freeze — the verdict is against the
   tier assignment.** §6/G6 carried item 3 predicted the citadel's 27 refusals
   would fall to ≤ 5 once retaining (tier B) declared before streets (tier C).
   Pre-flip the aggregate is **18 flag-off and 18 flag-on**: the tier-order flip
   contributes exactly **zero**. Post-flip it is **8 flag-off and 7 flag-on** —
   one. So what moved 27 → 8 is the election solve, and tier order is worth a
   single refusal. §6/G6 named the consequence itself: "that is a finding
   against the tier assignment, not a number to re-pin." The residue is not a
   precedence problem at all — the surviving message reads *"9 seam column(s)
   were left uncovered because the tier beneath them could not be placed"*,
   which is geometry that does not fit, not ground somebody else won.
3. **The seat target lands, post-flip.** "Buildings whose ring-median sits above
   their floor: 0" is met on troy, pirates, harbourtown and ironvale; hellenist
   and bayline still read 2, unchanged by the flag in either direction.

Pre-flip, troy was where the freeze visibly moved ground, and the direction was
mixed: 573 `retaining.seam`-owned cliff pairs disappeared (−339 over natural,
−91 over skirt, −88 over verge, −66 over sidewalk, −29 over street) while
`natural over natural` rose 4162 → 4812 — the citadel's cut faces stopped being
owned by the seam that cuts them and read as raw terrain instead, which is the
same story `W413`'s 18 refusals told. Post-flip that fabric no longer exists in
that shape; the citadel's census is 420/2214 against 1546/3788.

## What is still missing, flag-on

Chunks 2 and 3 of §7's completion list are **not landed** and every number above
should be read knowing it:

- pass 5c's readonly `ColumnPlan` aliases (only `planAt` exists, and only for
  the program siting);
- pass 5d — Group C re-derived from `resolved.wet`, and `drownPool`'s material
  writes;
- `buildGrounds` as the total painter over `resolved.moved`;
- `floorY = view("B")` on the footprint columns, and therefore `LOAM-W494
  GROUND_SEAT_NONPLANAR`, which reads 0 above only because it is never raised;
- the `I12` row's removal — it is still non-zero on `c1-harbourtown` **flag-off**,
  so it cannot be deleted while the flag has an off state; it is already 0 on
  every document flag-on.
