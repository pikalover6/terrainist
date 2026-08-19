# Cell 4 — current state (2026-08-18, walk-verdict wave 2, Kai present)

**KAI'S PADFIX-DECK VERDICTS (harsh):** Troy "massively regressed" —
buildings on plinths 1-2 above roads (medium density REVEALED the
pad/road split that party-wall density hid); horse across a creek;
L-shaped sandstone outlines on lawns; dirt berm along walls; city
masonry painted on distant cliffs. p1: huge road embankment through
plaza (likely routeFloorAt consequence); monument still 1-block
plinth + dry cone pits (also in Troy); quarry-garble grass pillars
(E494 preserve/tie). p7 ok except stray terracotta (FIXED 0893687:
ungated graffiti murals — modernOk gate). p5: backwards sea monster.

**KAI'S TIE2 VERDICTS (wave 3, 2026-08-19):** "I may have somewhat
overreacted — the fixes at least partially worked"; RULING: iterate
on MAINLINE (gem-plus branch = completed control experiment, gem2
deck installed *_gem2, archived on that branch). Findings: p5
HELLENIST = ~90% OPEN OCEAN (rendered proof) — authored heightfield
drowned the region, city seated least-violating on a scrap, ~3
structures; p1 unicorn+structures in BACK of island (same land
scarcity, E406 least-violating); Troy DECENT but: modern houses
STILL leak (era ancient), density still sparse (huge walled precinct
mostly empty), stairs-to-nowhere in terrace faces, horse hugs wall
(kit example min:0 — FIXED 453f48f, min 8..24 + courteous-min law),
horse still on 1-block pad (referenceY round-up, now verdict-backed
— QUEUED); glowcap paths float 1 block above terrain (the 8F plinth
trade Kai now condemns); NAMING SYSTEM requested (sequential
versions, retroactive, standardized slugs).

**WAVE 3 LANDED (all committed):** naming 6bf0a64 (slug_vN series,
59/60 renamed, RENAME-LEDGER.md, install --series; glowcap tie2
pending — was OPEN in Minecraft, lsof guard); modern houses bc0ff2d
(pool was CLEAN — leak was era-blind "regular" window grid on
archetypes w/o facade defaults; RHYTHM_BY_ERA hole-filler, ancient/
medieval sparse, modern byte-identical); floating paths e8a10db
(NEVER the datum — blendShoulders fill stopped 1 short of the
carriageway on EVERY road; VERGE_FILL_FEATHER=1; glowcap 78→20
proud); land budget f5a0a53 (W526 SETTLEMENT_LAND_SHORT, per-COLUMN
— E406 judges by median so drowned-with-dry-middle was "feasible";
threshold 0.6 from measured bimodal gap 0.16|0.92; in
FEEDBACK_CODES; W337-to-feedback declined, flagged for Kai);
doorstep foot gate 1203919 (footLands two-columns-out; Troy 4
refused — other 42 land on real ground, the stairs impression is
the seam banks); density diagnosis (NO fix shipped — constants
innocent: grown-fabric DEAD BLOCK CORES, lots are rim strips only,
one 2109-col block = 0 buildings; + 121 stepped-split slivers; fix
= deep-block subdivision + sliver suppression + walled coverage
floor, QUEUED); kit taught grown-blockSize + flat-roof-box 2079e50,
horse courteous-min 453f48f.

**WP-11 THE SERVED SEAM (design 516dd96, Part IV):** headline —
benching/context was gated on plannedEdges, a field ONLY
forms/hillside produces: grown/stepped districts NEVER benched
(Troy's mess). Laws: seam SERVED never refused (W411 retired, I412);
RETAIN_MAX caps a FACE — ceil(D/6) stacked tiers, one arithmetic
two dressings by pressedShare (revetted great wall vs planted
terraces); election pays (bucket levels, sliver merge, W410 finally
emitted); short runs absorbed; banks 1:2 carrying nothing; seam
stairs ride street-stairs law. SEAM_TIERS=false until 11F flip
(Kai's walk). Defaults adopted: tiers≤3, tread3/setback1, fort
measured, W410 not feedback. **IN FLIGHT: 11A honest refusal (low;
retaining.ts+types.ts) ∥ 11C election pays (low;
platforms+district).** THEN: 11B tier stack (med), 11D absorb+bank,
11E seam stair+door, density core fix, referenceY rounding, datum
fill cap (Troy street 9-11 proud), sidewalk lamps. Then deck
troy_v14 / hellenist_city_v10 / pirates_v_unicorns_v17 (--series).

**GO-HAM: packs 7+8 SHIPPED.** desert_caravanserai (365eded, 13+2,
serai_court anchor, crvn_* rows, members 235→250) and
himalayan_monastery (88bd989, 13+2, dzong_hall anchor, hima_* rows,
members 250→265; prayer flags = full-cube wool runs, NO banner
attachables; theme alpine_stone doesn't exist → boreal_pine+
white_quartz). dev_world_hima installed carries BOTH bands
(supersedes dev_world_caravan for the walk). Go-ham PAUSED by
orchestrator context budget — resume packs after Kai's walk wave.

**AWAITING KAI:** padfix deck walk (*_padfix ×4) + caravan band;
viewer look verdict + landing skin; WP-6 ledger (preserve/tie E494,
apron WP-7); dev-app first launch.

**STANDING:** look latitude=mine (website only); leniency PERMANENT;
GO-HAM rule; battery regen pre-authed (end-of-run during autonomy;
normal walk-loop cadence when Kai present); Prism installs --saves
"/Users/kaihoward/Library/Application Support/PrismLauncher/instances/
Fabulously Optimized/minecraft/saves", never --replace; orchestrator
commits; implementers opus-5-low; one vitest per agent
--maxWorkers=4; append-only marked sections; pack laws + physics
block in cell-3; pipes swallow vitest exits — COUNTS; never emit from
mid-flight dist; popups liberally; NEVER-WAIT.
