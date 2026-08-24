# Session handoff — 2026-08-23: the road-pull saga lands (n13 ratified)

Prior epoch: `docs/SESSION-HANDOFF-2026-08-22.md` (the ground rewrite,
DESCENT_SOLVE, the n5/n6 decks, ROAD_SOVEREIGN, the coherent-source POC).
This doc is the commit-anchored record of the pull saga, 08-22 → 08-23,
ending in **Kai's ratification of the n13 generator as the current,
most cutting-edge state**: *"That essentially just solved it… the most
coherent troy generation ever."*

## The ratified law (docs/ROAD-PULL-v0.md + the retune levers)

Per station, per column: `y = round(drape + pull·(n5_arc − drape))`, with
`pull` the terrain's own verdict. The verdict, as shipped:

- `grade(s) = max( P95 longitudinal fall rate over PULL_WINDOW=13,
  cross-fall across the road's own width )` — **both axes** (PULL_CROSS,
  the n13 flip: a 7-wide contour road on a 10-block side-slope is a cliff
  no matter how gentle its centreline).
- `raw = smoothstep(t·(1 + PULL_BOOST·t^PULL_BOOST_POW))`, BOOST 2.2,
  POW 2 — authority compounds with steepness; saturation ≈ grade 0.53;
  flats gain exactly 0.
- Field = `max(movavg9, slope-limited upper envelope)` (PULL_PEAK_KEEP —
  cliff cores hold 1), then a flat morphological closing over
  PULL_CLOSE=21 blocks — run in `pullField` AND again in phase 1b after
  junction pooling (a breather's second wall can be the junction's) —
  then the 1/PULL_RAMP=6 lowering clamp.
- Backstop: pull-weighted sequential Lipschitz relaxation, corrections
  scaled `min(1, pull/PULL_SAT=0.7)`. `PULL_TREAD` (shipped 1) is the
  committed road's grade ceiling — the n12 candidate decks hold 2/2.5/3.
- One pooled pull per junction plane; sidewalks blend at their own column
  off the flanking station's pull; ROAD_SOVEREIGN items (drape oracle,
  supremacy mask + headroom, stone-brick borders, NO stairs) all ride the
  blended levels untouched.

## The commit ladder (every flip byte-identical-landed then flipped)

- `95e6d0e` ROAD-PULL-v0 written · `3db7da8` landing · `f5ef2a3` flip —
  **n7** (hillside orphans 2,591→9, cliff pairs 328→156), iter-7.
- `aa602bb` boost/peak-keep/sat neutral · `b0d2e14` retune — **n8** +
  `_n8b` boost-only control (stations at pull=1: 9→42→97), iter-8.
- `9f04bb6`/`f60d07c` POW + CLOSE neutral · `60d6626` n9 retune — the
  x=200 avenue commits junction→crest (the stage-dump probe found the
  first closing ran before the junction wall existed), iter-9.
- Candidate ladders, all uncommitted constant states: n10 saturation
  triplet (DEAD — measured identical to n9), n11 entry ladder
  (RF .20/.16/.12; verdict: wrong axis), n12 tread metronome (2/2.5/3;
  **pick still open**).
- `a587cfa` PULL_CROSS neutral · `a063804` flip — **n13**: the x=200
  z −100..−65 stretch goes tilt 10 → 0 at every station; street cliff
  census collapses 141→26 (troy) / 143→20 (hellenist), iter-13.
- Decks in Prism saves: n7, n8, n8b, n9, n10_* (dead, deletable),
  n11_*, n12_*, **n13** (the ratified one).

## Laws learned this saga

- Probe before theorize, always: the residual-lip probe birthed the
  design; the stage-dump probe found the closing/pooling order; the
  cross-section probe found the missing axis after three curve ladders
  could not.
- Never run the baseline regen and the FULL suite concurrently (the
  harness races the file).
- zsh does not word-split unquoted vars (`set -- $pair` broke a build).
- Candidate triplets get probed for real spread BEFORE install — the n10
  triplet measured identical to its parent and died on the bench.

## The last-leg queue (Kai, 2026-08-23, post-ratification)

1. **Entry-grade overcorrection, minor**: flat/medium roads very slightly
   regressed for no benefit. NOTE: shipped R_FLAT never moved (0.25) —
   the n11 ladder was never committed. The residue is the retunes' low
   end: the boost's moderate creep + the closing's trace fills (139
   stations 0→≤0.039). Tune by trimming those, not by raising R_FLAT
   blindly.
2. **The landmark-border rule** (queued 08-22, never built): no bespoke
   artifact within 10% of world size (side-to-side) of the border; the
   horse needs re-siting logic.
3. **Stairs still need a lot of work** (all stair machinery is silenced
   under sovereign; the descent solver survives under its flag).
4. The shoulder/verge revival — the standing payoff task for every raw
   cut face the pull saga minted (buried 106 / plinth 17-34 / sheer 163
   on the stress fixture are its ledger).
5. The n12 tread pick.
6. Standing: pirates staged awaiting GO (6b52fe3); catalog go-ham on side
   branches; r23 authoring credit-blocked.

## The POC is dead (ratified 2026-08-23)

`tools/root-poc/` + `docs/COHERENT-SOURCE-v0.md` + the `troy_rootpoc*`
decks are **historical only** — no current use. The rewrite's ideas that
mattered were absorbed: one ground author (the drape oracle), coherence
at the source (the pull verdict), verification courts (the probes). The
files stay in-tree as the record of the road not taken.
