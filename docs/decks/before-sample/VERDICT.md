# before-sample — instrument verdicts (spec §6)

Deck: `docs/decks/before-sample/` (11 golden prompts at 085e22d, settlement
kit c22cb4fe, terrain kit 0adfac8d). One station per prompt; each station is
opened when its read is done, with the probe or render that backs every line.
The icon list of each station is written from the prompt before its document
is read; where that order was not kept it says so.

Instruments used so far: `tools/worlds/block-census.mjs` (block-id counts
inside a column bbox, read from the region files), `terrainist render`
(top-down and `--views all` isometrics), the compile report (`--report`,
`layout.placements` and `stats.structures`), and the document diffs in
`docs/decks/anchors/`.

---

## Station 1 — metropolis_hideout (seed 304) — **FAIL** (T6, T9)

**Prompt:** "A high-tech apocalyptic hideout in the massively overgrown ruins of a metropolis."

**Icons (from the prompt; written after the top-down render had been seen
but before any document was read — recorded as such):**
1. *The ruins of a metropolis* — fallen or skeletal towers that read as ruin,
   not as intact office blocks.
2. *Massive overgrowth* — vines on the buildings, trees in the streets.
3. *A high-tech hideout* — a bunker/lab/tech core that reads as the inhabited
   thing inside the ruin.

**Anchor for T6:** the r5 metropolis (`battery/candidates/p4-gem1/…` at
9b4dd50), which the Run recompiled and diffed in `docs/decks/anchors/`.

### Reads

| # | question | read | backed by |
|---|---|---|---|
| 1a | Does the document author fallen towers? | Two decayed towers (`shattered_tower_prime` as `skyscraper`, `decayed_corporate_center` as `office`) — present. The r5 anchor ALSO had a **program-backed skyscraper-skeleton scatter** (`overgrown_skyscraper_skeleton`, count 8, whole district) that is **absent in 3 of 3 fresh rolls** at these bytes (before-sample, k1, `metro-roll3`). LOST by the §6 regression standard. | `docs/decks/anchors/METROPOLIS-DOC-DIFF-2026-08-25.md`; k1 doc `docs/decks/overgrown_metropolis_hideout_k1/`; roll 3 record `tools/golden-prompts/runs/metro-roll3/` ($0.10) |
| 1b | Does the world read as ruin? | At the isometric instrument the fresh world is a block of intact, sharp-topped grey boxes. **So is the r5 anchor at the same view** — the anchor's ruin read came from the walk and from what sits outside the block (the eight skeletons in the overgrowth, the river). The compiler reports 30 of 41 infill lots as "ruined shells" (`LOAM-I512`, ruin share 0.77), which the isometric does not show — a belief-vs-behaviour candidate (slop class 1) to probe at street level. | `scratchpad/b0/renders/metro-views/iso-east-north.png` vs `scratchpad/anchors/renders/r5-anchor-views/iso-east-north.png`; recompile log |
| 2 | Vines and street trees? | In-district block census: vines **11,219** (r5 anchor 6,208; r5 at HEAD 5,240), leaves 7.7k (anchor 3.4k), `streetTree` 65 (anchor 11). Overgrowth is *higher* than the anchor by count. PASS on the number; the walk decides how it reads. | `block-census.mjs --bbox -79,-143,200,116`; report `stats.structures` |
| 3 | The hideout? | `bunker_shelter`, `bio_synth_lab`, `scout_field_station`, `satellite_uplink`, `solar_grid`, `evac_pad` placed. Present. Dominance not yet measured (icon metric pending). | report `layout.placements` |
| 4 | The river? | r5: `collapsed_canal_river` (verb river, to the coast). Fresh: none — a `valley` trench and a `basin` crater in all 3 rolls. LOST 3-of-3. T6 calls the river tasteful, not required: noted, not a FAIL on its own. In-district water 3,016 vs 8,601. | doc diff; k1 and roll-3 docs; block census |
| 5 | Era / palette (T9)? | `intent.era` is `far_future` in 3 of 3 rolls; r5 was `modern`. An apocalyptic ruined metropolis is a modern city decayed, and the era drives the archetype table (`skyscraper`, `office` are named in every fresh roll; r5 named none — `explicitArchetypeParams` 0 → 6). Palette: r5's triad (mossy_cobblestone / coarse_dirt / deepslate) is not reproduced; fresh rolls give cracked_stone_bricks / mossy_cobblestone / gray_concrete. | doc diff; roll-3 doc |

### Verdict

**FAIL.** T6: the fallen-tower icon has thinned from a program-backed field of
eight skeletons to two named towers, lost 3-of-3 — the world no longer
*screams* ruin from above, and what remains of the ruin reading is a compiler
claim (`I512`) the renders do not show. T9: the era drifts to `far_future` in
every roll. T1 icons 2 and 3 are present. The river is lost but optional.

**Separate finding, same station:** the r5 document itself compiles WORSE at
HEAD than at its anchor commit — terraces 68 → 45, envelope volume −27%,
in-district vines −16% — a compiler regression (law 1), bisected in
`docs/decks/anchors/METROPOLIS-R5-BISECTION-2026-08-25.md`. It is not what
this station judges (this station judges the fresh generation) but it means
even the r5 document would not reproduce the walked r5 world today.

### What the Run will do

1. ~~Fix the compiler regression code-first~~ — done (units 3–4):
   `SEAM_BLOCK_MIN_DROP = 2`; the r5 document at HEAD recovers 10 of its 23
   lost terraces, the other 13 are attributed to ratified laws (bisection
   §D). Side effect read as a T4 gain: Troy's walled quarter 31 → 45
   buildings, `W527 WALLED_QUARTER_SPARSE` silent.
2. Probe what a "ruined shell" (`I512`) actually puts in the voxels, street
   level, ≥3 columns wide — class-1 census finding either way.
3. Treat the skeleton-scatter loss as an E2 *machinery* question (a
   program-backed ruin field is not being asked for) and the era drift as an
   E3 question (the intent pre-pass classifies "apocalyptic metropolis" as
   `far_future`); both go on the pre-registration list before any kit byte
   moves.

---

## Station 7 — walled_medieval_city (seed 311) — **FAIL** (T4, T7)

**Prompt:** "A walled medieval city on a hill, its castle keep above the rooftops."

**Icons (from the prompt, before the document was read):** (1) a full wall
circuit; (2) a town inside it — buildings dominate the wall; (3) the castle
keep above the rooftops — the tallest thing, inside the circuit.

| # | question | read | backed by |
|---|---|---|---|
| 1 | The wall? | Full masonry circuit, gates, towers at pitch 38, height 8. Present. | document `params.walls`; top-down render |
| 2 | A town inside? | **11 district buildings in a 240 × 240 circuit**; 38 lots cut, 23 dropped; 10 frontage strips drawn, 11 dissolved back to natural ground. The circuit encloses grass. `W527` silent — blind on the planned path. | compile report `layout.districts[0].stats` / `form.adapted`; `docs/decks/anchors/MONTFORT-HILLSIDE-2026-08-25.md` |
| 3 | The keep? | `high_keep` and `summit_church` placed as landmarks; dominance not measured (icon metric pending). | `layout.placements` |

**Verdict: FAIL** on T4 (one order of magnitude short of "a town inside the
wall") and T7 (density). Cause established by probe, not the hill's slope:
the hillside planner counts a raster artefact as its frontage and dissolves
strips it had already claimed (unit 5).

**Re-read after the flip (unit 6):** 24 buildings (22 in the district), the
circuit tightened round the town by the built-hull law, `summit_church`
unseated (`E170`). Unit 7 found the church cannot seat on any diagonal
strip by the site tier (a 19-deep diagonal band holds no axis-aligned
13 × 17 — P1), and that the parcel switch which would deepen the lots leaves
24 % of the walkable plane orphaned (F10); the church's cure is P1 or F10's
two-phase growth. Still **FAIL** on T4/T7 by the instrument — twice the
town, not yet a town. **What the Run will do:** F10 in its own unit, then
the walk decides.

---

## Stations 2–6, 8–11 — pending

troy_horse, pirate_unicorn_isles, hellenist_harbour, alien_farm, redwood_camp,
glowcap_vale, railway_town (document only — F1), desert_wilderness,
fjord_terrain. First looks are in this folder's README.
