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

**KAI'S RATIFICATIONS (popup):** (1) FRONTAGE TIE — road network =
ground authority, buildings seat AT their street's level, lots grade
from road. (2) BESPOKE CONFORM (his own idea): feed the program
author real site terrain, build naturally on it — heightAt exists at
execution; make conform the default, retire auto-pad to opt-in.
Design seat (opus-5-high) writing docs/GROUND-UNIFICATION-v0.md.

**WAVE STATUS (all landed+committed):** diagnostics c15c664 (W523
CONSTRAINT_TARGET_UNRESOLVED + I524 WALL_FOOTING_DEEP + I525
CLIFF_PALETTE_REGIONAL + kit laws; byte-identical); hub-shaft +
water-veto 618d738 (shafts→natural ground both worlds, lake 607→810
above-sea columns); facing 1bfec03 (backwards monster = PRE-SOLVE
facing estimate never re-measured after W521 walk; post-solve
remeasureLandmarkFacings, footprint-preserving turns only, W522
PROGRAM_FACE_REMEASURED; LOAM-SPEC §15.1 amended — QUEUED FOR KAI'S
RATIFICATION; taste note queued: face targets aim at node CENTROID,
nearest-footprint-point would read better). **IN FLIGHT: terrarium
traversal.unreachable regression from 618d738** (2 mini-station
doors; opus-5-medium bisecting; LAST BLOCKER before regen plan).

**P1 FORENSICS (landed):** "bridge" = infra.entry acropolis_terrace
(retaining.seam, LIFT=6, follow:step) routed its deriveWallCourse
ring OVER the sacred lake (208/791 water columns filled) + flat
ground — routeFloorAt EXONERATED (cone hazard real but latent;
ROAD_BERM_MAX=2 pinned from hazard geometry). Pits+pillars = ONE
bug: unrouted hub seeded road mask with roadY=0 → blendShoulders
graded toward y=0 (90-block shaft, preserved seed pillar; same in
p3; NOT E494, NOT basins — aspect-ratio guard DISCONFIRMED). Pirate
quarry = 126 refused seam columns (shortRun/tallDrop) stepped raw —
design question for WP-8 retaining round. Monument 1-block plinth =
referenceY rounds median UP on flat ground — fold into 8F datum.
FIX WAVE IN FLIGHT (opus-5-low): roadY hub seed + verge seed clamp +
infra.entry water veto (roads.ts/infra-entry.ts + NEW test files).

**TROY FORENSICS (landed):** (a) half-squares = terrace copings on
UNBUILT city blocks (retaining.ts; fix: no-adjacent-claimed-lot seam
grades as bank); (b) berm = district platform 16-in-5 cut face
(derive min blend from fill) + wall footing extrudes ≤18 courses no
batter/no diagnostic (walls.ts WALL_MAX_FILL); (c) cliff paint = DOC
set world ground.cliff to city masonry (kit rule + note); (d) HORSE:
doc HAD hard distance→priams_megaron but district children are
INVISIBLE to root solver; resolveTargets []→vacuous satisfied:true.
COMPILER DEFECT — W522 CONSTRAINT_TARGET_UNRESOLVED wave in flight
(diagnostics only, byte-identical).

**TROY: FIXED + COMMITTED (7019b5a).** Root cause was NOT routing —
the doc had era ancient + classical_mediterranean. Killers: `density:
"high"` (TERRACE_COVERAGE high=1 → continuous 3-8 storey party-walled
street wall reads modern regardless of ids; the walked-good p3-c5 was
grown/medium/0.72) and NO archetypes.prefer (7 modern mix words
outdrew the pack's 14 on every lot; precedence forbid > prefer > pack
> ctx.today). Teach now binds named-ancient places to era+pack+5-8
named prefer forms with anachronisms forbidden; "density is a PERIOD
CLAIM — antiquity caps at medium"; taught ids runtime-checked to be
kind=building (props in prefer are skipped by the lot draw).

**PAD DISEASE: FIXED + COMMITTED (a3687e4 fix, 8cb9c77 teaching).**
Verdicts resolved: (a) apron now keyed on LIFT (1:2, ≤1 step/col, cap
24 rings AND instance long side; placer prefers lift≤4 sites but only
at equal instance count); (b) kraken's elevated sea was the PROGRAM
writing its own ocean — wade y=0 is seabed; fluid above the body's
surface clamped, LOAM-W339 (p5: 1,811 above-sea columns → 0); (c)
pirate ship on land = AUTHORING (doc had no water affinity; W520
padded its 82° hill) → kit teaches wade+coastline declared, never
inferred from a name; (d) colossus 338 blocks off-island = soft `at`
outbid by flat ground → LOAM-W521 LANDMARK_COARSE_ABANDONED (report
only, cost model untouched); rivals need distance/on bindings.
Program-free worlds byte-identical. New program-pad.test.ts (8);
known regression: p7 well 3→2 instances (cross-node spacing, W337).

**PADFIX DECK (walked, verdicts above):** all four installed
*_padfix + archived battery/candidates/*-padfix. p3 was ONE-SHOT
clean ($0.05, first ever). p1's T110 was a PRE-EXISTING road bug →
routeFloorAt (b9f808d) — which likely bought the plaza embankment.
Latent notes: physics lint reads the PLAN, never program voxels
(W339 is the only guard on program fluid); siteWaterLine floors at
seaLevel (contradicts "pond keeps its pond", unreachable today).

**DEV APP: LANDED + COMMITTED.** cd tools/dev-app && ./make-app.sh →
dist/Terrainist Dev.app. Selftest proves plumbing. NOBODY HAS SEEN
THE WINDOW — Kai eyeballs on first launch; expect a polish round.

**THE CLOSED AUTONOMOUS RUN (details cell-3):** shaders live+tuned;
machinery tail closed (family B, §13.2+viaduct); SIX PACKS / 91
structures / catalog 676 rows / 15 formPacks / 235 members, all
exhibited; final battery *_final installed+archived (p2/p4 second
rolls, T110 authored water, machinery bisected innocent);
dev_world_packs installed (760 rows / 4,195 buildings / 0 unstable
fluids with real pools); the tide-bell full-cube fix.

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
