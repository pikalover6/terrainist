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

**REPAIR WAVES ALL COMMITTED:** graffiti gate 0893687; diagnostics
c15c664 (W523 unresolved-target + I524 wall footing + I525 cliff
palette + kit laws); hub-shaft + water-veto 618d738 (lake 607→810);
facing 1bfec03 (pre-solve estimate never re-measured → post-solve
remeasureLandmarkFacings, W522; LOAM-SPEC §15.1 amended — QUEUED FOR
KAI'S RATIFICATION; taste note: face aims at CENTROID,
nearest-footprint-point would read better). Terrarium doors 069592e:
NOT 618d738 — my gatehouses built one-course arches on wallTop-4
storeys (arch now needs headroom≥4). NUL byte stripped 3781d6f.
FULL SUITE 0 FAILURES at 069592e.

**WP TRAIN: MACHINERY COMPLETE, ALL COMMITTED.** 8A 2f9de73 datum
kernel; 8B 676feac frontage record+flag; 8C 6a2f387 apronBySide; 8D
f709bbe surfacer-as-consumer (STREET_CUT_MAX=2, T237 drift); 8E
4953052 props+programs+city-cell clients (+seatExplicit); 9A 65780fe
conform suite; 9B f70a966 conform seat (T341/T342); 9E 8d5791e
teaching (rule 6 five grounds, kit conform row, exhibit sloped
cell); 10A 54ac4a9 berm clamps (T239, deck branch exempt); 10B
bf94f06+612f134 bed skirt (span set: an apron does not tunnel under
a viaduct — devworld deck regression caught by the gate and fixed).
**8F FLIPPED (9cc82ef)** — tie ON; cell plane became a PIN not floor
(the floor inverted harbourtown's lip, 25/90 lots under their own
carriageway — caught at the gate); ground-equivalence 86/86
unmoved (shim compares within one compile); walkability re-pins
argued per row (plinth runs < PLINTH_MIN_RUN, "sunken" lamps =
carriageway rose); lip zero BY CONSTRUCTION on examples. Then TWO
post-flip bugs caught+fixed: verdict never STAMPED at freeze
(97fe40d: gate.freeze() one-pass) and conform hash took caller
nodePath — RNG programs E334'd every round, $1.5 roll burned; fix
200209b pins CONFORM_RUN=loam.verify (kept docs recompiled FREE).

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

**WAVE 3 IN FLIGHT (4 agents):** land-budget feedback diagnostic
(medium — settlement-needs-land measured, feedback-visible so the
model repairs terrain; kit terrain paragraph); floating tied paths
(medium — verge feather on datum segments; + stairs-to-nowhere
recon); naming/versioning (low — tools/worlds/rename-worlds.mjs,
slug_vN, retroactive rename of Kai's saves w/ dry-run + ledger,
install --series); Troy modern-house leak (low — era-gating the
default pool, deliberate combos stay legal). QUEUED NEXT: density
(lot-fill vs envelope), referenceY rounding, unicorn prominence.

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
