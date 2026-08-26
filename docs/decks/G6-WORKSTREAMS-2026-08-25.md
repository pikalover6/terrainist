# G6 — the workstreams, audited against `STOCKTAKE-v0.md`

Stocktake Run, unit 45 (2026-08-25). Spec §5 G6 names six workstreams and
what each must show. This record reads each against its v0 definition and
the Run's evidence, and gives a verdict per line. Kai's post-hoc veto is
open on every ruling it cites.

## WS-A — Settlement-kit remediation

| line | v0 asks | evidence | verdict |
|---|---|---|---|
| A2 exports landed | "export machine-readable schemas/registries from the compiler, generate the kit's tables, delete anecdote prose from runtime context" | `stdlib/structures/registry-export.ts` builds the candidate menu from the compiler's registry (`buildCandidateMenu`, `candidateMenuForIntent`); **WS-A2 CLOSED `5893621`** — named-pack-only menus, 24 ids / ~1k tokens where 60 / ~2.5k were, the era tier killed on measurement (580 ids shown, 0 adopted). The *tables* half is not generated: the kit still names 175 of 428 archetypes and 253 of 654 catalog entries by hand (F18), pinned by the `kit-registry-drift` ratchet (unit 22) and written up as **P10** (unit 39). | **PASS** on the exports; the tables are P10 |
| A3 or the winning kit arm shipped | dynamic context assembly, design-gated | E1 (unit 12, `docs/decks/e1/E1-VERDICT.md`, D32): the three arms (kit / core / modules) measured 3×3 — neither the core nor the modules arm beat the kit on the icon bar beyond noise; **the kit stays**, and that is the shipped arm. A3's dynamic assembly is not built; the region-scope ruling stays deferred to it. | **PASS** by ruling (the kit) |
| kit measured 3×3 at the final bytes | three repeats, the noise band | `runs/final-1/2/3` (authoring-only, $1.62): 11 of 11 authored clean on all three, 13 attempts each; icons present 28 of 28 on all three; pairwise `score.mjs --gate` pass (final-1↔2, 2↔3, and `after-f31`↔final-1) — the noise band is one attempt on one or two prompts and ±2 archetypes; dominance 0 of 8 on every run because an authoring-only run never writes the program-carried icons (F24; the same reading as `after-f27`), which is why G1's eleven run end to end | **PASS** — measured, stable across three repeats |

## WS-B — Terrain-kit audit

v0: "same lens as the settlement audit, applied to `terrain-author.md`;
findings folded into A's remediation ladder." No terrain-kit audit document
exists in the tree, and no unit of the Run performed one. What the Run did
instead is the terrain kit's *probes*: five terrain-only worlds through the
program stage (`probe_caldera`, `probe_karst`, `probe_lava_field`,
`probe_dune_sea`, `probe_glacier_valley`), four of which pass by read and
the fifth of which found the grammar's edge (no ice landform, P11); the
fluid-stability fixes (F1, `OCEAN_FILL_CONTINUES`, `POOL_NEVER_LOWERS`) and
`I500`/`I502` came from those reads. **OPEN — audit not performed; its
findings are the five probes' and are folded (units 14–15, 17, 30, 44).**
The closing report carries it as the first documentation debt.

## WS-C — Model-behavior audit (zero LLM spend)

v0: a statistical read of the battery corpus; the exemplar-parroting
hypothesis. Closed in v0 itself ("WS-A2 CLOSED": the menu-adoption
measurement over 19 arms, tier 1 198 shown / 49 adopted, tier 2 580 / 0 —
the empirical kill of the era tier) and, in the Run, by the reach tables in
REACH (archetype reach per prompt on every golden run, packs at 0 % probed
one by one: himalayan_monastery, feudal_japanese, desert_caravanserai,
steppe_nomad, frontier_west, dwarven_volcanic, nordic_viking, nile_egypt —
eight of eighteen packs reached by a probe; east_asian, mesoamerican_jungle,
swamp_witch and atlantean never reached). **PASS — closed (audit).**

## WS-D — Price optimization

| line | v0 asks | evidence | verdict |
|---|---|---|---|
| D1 measured — cost per world before/after | "kit slimming IS the price lever; measure before/after on the golden suite" | Full generation, log-derived from the run records: **before** `before-sample` $2.19 for 10 worlds (1.99 M input tokens) = **$0.20 / world**; **after** `g2` $0.65 / 3 = $0.22, `g2-montfort-f31` $0.20, `probe-4` $0.25, `probe-5` $0.23, `probe-6` $0.36 (harder prompts, more programs, more rounds). Authoring only: `after-f27` $0.049, `after-f31` $0.054 per prompt. The kit did not slim — E1 ruled the kit stays, F16 says the core is 88 % of it, unit 41 added twenty lines — so the per-world bill is unchanged at ≈ $0.20 and rises with the program count. | **PASS — measured; no saving, and the record says why** |
| D3 feedback-round pruning done or written up | fewer/cheaper rounds: only actionable diagnostics | Done: `cli/feedback.ts` is the pruning — an allow-list of author-actionable codes (`FEEDBACK_CODES`), physics-lint codes aborting instead of looping, informational notes kept out; the Run added `I502` (unit 30) and `W527` (unit 41). Written up: the loop's limit — `I502` fed into both rounds of `probe_bridge_quarters` and the river stayed 15 % wet; `W527` never fired for the fresh montfort because the kit changed the choice first. Rounds are two by default and the record shows one-round convergence on 11 of 11 golden. | **PASS** |

D2 (a model shootout) is not a G6 line and was not run.

## WS-E — Performance

v0: "LADDER CLOSED — Kai: 'stop the ladder, bank the win' (2026-08-24)";
rungs 1+2 landed (`c446041`, `c18c9fe`). The Run's own measurement (unit 24,
"the compiler was fast all along": a full 512 compile in seconds; the
hillside fixture in 4 s in-process) confirms the banked state. **PASS —
closed.**

## WS-F — Architectural inventory and the kill-ladder

v0: "inventory doc + kill-ladder, EACH deletion Kai-ratified, each landing
byte-identical-or-attributed like every flip before it." The inventory is
the census (`STOCKTAKE-SLOP-CENSUS.md`, G5: classes 1–7, every row with a
disposition). The kill-ladder is class 4 read with law 6's tiers:

| rung | what | tier | state |
|---|---|---|---|
| 1 | 7.3 — `tools/worlds/{RENAME-*,rename-worlds.mjs,rerename-worlds.mjs}` archived to `tools/worlds/archive/` | byte-identical (no compiler code) | **executed, unit 45** |
| 2 | 4.4 — the shipped-true switches' dead off-paths, one switch per commit, each proven identical on the thirteen: `STRIP_FRONTAGE_BY_CLAIM`, `PLANNED_SITE_WHOLE_STRIP`, `STREET_FACE_ALONG_SIDE`, `PARK_BUDGET_BY_AREA`, `HIGHRISE_DOOR_HEAD_SOLID`, `OCEAN_FILL_CONTINUES`, `POOL_NEVER_LOWERS`, `ROUTE_PINS_HELD_GROUND`, `KERB_SYMBOL_UNSCOPED`, `TERRACE_DECAY`, `TERRACE_DECAY_ROLL`, `ICE_ON_FROZEN_WATER` (the Run's twelve); then the older shipped-true set (`BLOCK_MULTI_RECT`, `DESCENT_SOLVE`, `ELECTION_SOLVE`, `FACE_FINISH`, `FRONTAGE_TIE`, `GROUND_PLANE_TIE`, `GROUND_V1_*`, `LANDMARK_COARSE_RING`, `PULL_*`, `QUAY_SHED_OWN_SHORE`, `ROAD_PULL`, `ROAD_SOVEREIGN`, `SEAM_TIERS`, `STREET_PLANE_HARMONIZE`, `SUBMERGED_BENCH_UNGRADED`, `TERRACE_BY_TERRAIN`) | byte-identical deletions (tier 1) | **written; each rung Kai-ratified before it lands** (census 4.4: keep-with-note until the closing report) |
| 3 | the two switches at `false` — `LOT_PARCEL_OWN_STATIONS` (F10/F21, Kai's veto open), `STAIR_DRESS` (ratified off, unit 3955a91) — deleted with their on-paths, or flipped | byte-moving if flipped (tier 2: attributed triage + an instrument verdict) | **written; Kai's call** |
| 4 | 4.5 — junction-steps, silenced street-stairs/descent, terminus landings: probe, then delete | probe first (S each) | **open** |

**Verdict: PASS on the inventory and the written ladder; rung 1 executed;
rungs 2–4 are the closing report's, each Kai's to ratify** — the reading
the census fixed in unit 17 (4.4) and v0's own words require.

## The gate

WS-A PASS (exports; the kit arm by ruling; 3×3 — stable, 11/11 ×3, icons 28/28 ×3), WS-B
**OPEN** (audit not performed; folded by probes), WS-C PASS, WS-D PASS (D1
measured, no saving; D3 done and written), WS-E PASS, WS-F PASS (inventory;
ladder written, first rung executed). **G6 holds on five of six lines and
is open on WS-B**, which the closing report carries as documentation debt
rather than a compiler finding: nothing a terrain-kit audit would have found
is a bug the probes did not find first.
