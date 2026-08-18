# Cell 4 — current state (2026-08-18, walk-feedback round, Kai present)

**KAI'S VERDICTS on the final deck (his walk, screenshots):** (1) THE
PLATFORM DISEASE — bespoke sites ship as raised hard-edged pads: sea
monster in a SLAB OF ELEVATED OCEAN (pad raised fluidTop), pirate
ship ON LAND on a hilltop, unicorn statue + p7 structure each on a
crisp unfeathered disc; both P1 landmarks possibly on ONE island.
(2) Troy read modern despite correct era+pack.

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

**PADFIX DECK: ALL FOUR INSTALLED *_padfix, archived, AWAITING KAI'S
WALK.** p3 trojan_horse ONE-SHOT clean ($0.05, first ever). p5
neopolis_abyssal_siege: doc wades+coastlines its monsters (teaching
live); W521 on one leviathan 408 blocks off. p7 clean. p1's roll hit
T110 → diagnosed PRE-EXISTING road bug (NOT the pad commit):
gradeProfile cut floor was world-constant seaLevel+1; street deck
shaved the y=95 lake rim. Fix: routeFloorAt in structures/roads.ts
(b9f808d; 10 worlds byte-identical; road-shore-floor.test.ts 5).
p1 world compiled from preserved doc, no re-roll. Diagnosis also
flagged latent: (1) station-vs-cross-section grading gap is general;
(2) siteWaterLine floors at seaLevel, contradicting "a pond keeps
its pond" for below-sea ponds (unreachable today); (3) physics lint
reads the PLAN, never program voxels — W339 is the ONLY guard on
program fluid.

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
