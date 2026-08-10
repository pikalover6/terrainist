# Cell 4 — the last day (2026-08-09, fine detail)

**RUNG RATIFIED (SHIP-PLAN §8, commit 6d7d892):** rung B amended, **no
ascent** (spent, does not carry). Release battery FROZEN at 7 breadth
prompts, seeds 301–307: P1 pirate/unicorn war, P2 farm town + aliens,
P3 Trojan horse in Troy, P4 high-tech hideout in overgrown metropolis
ruins, P5 modern Hellenist city vs sea monsters, P6 old-growth, P7
fungal-vale — assertions written first in §8.2; genre prompts moved to
the reliability sample. Scope adds F17 minimal farm, F18 bespoke
boldness, F19 district ruins, F20 ambient fidelity, F21→F4
instrumentation, F22 constraint teaching. **Feature-stop backstop
2026-08-28.** Kai's citadel verdict drives F18: bespoke gen is the wow.

**S2 battery: 5/5 installed** as `*_baseline` ($0.015–0.14/world). Kai
walked all; light notes only (worlds stay installed for comparison).
Spread-crash fixed (d4e7f47, 165k-block landmark vs V8 arg budget —
test-first). mistwood_citadel provenance: compiled from first-run wired
doc after Kai stopped the regen.

**Wave 1+2, ALL LANDED (08-09 evening):**
- F11 render biome tint (e6ced86) — seams now visible in our renders;
  follow-up idea: high-contrast biome-debug palette.
- F21 instrumentation (4cb5ef1) — LOAM-T118 radius-units warning,
  T119 zero-yield scatter (both in feedback set), +20 biome rows.
- F8 snowLine + law-1 (08aa466) — snow line runs (stop-not-reroll,
  post-claim so below-line placement identical); capWood exempts dead;
  green sprig on dead limbs gone (visual delta pending Kai walk).
- F18 bespoke boldness (4c6fd5e) — kit centerpiece rule ("only a
  program makes THE castle"), 2–3 landmarks invited, spend stop $1.00.
- **F20 fixed (e9f35d2) — headline: biome derivation was
  SCALE-INVERTING** (relief normalized to world's own span; flatter →
  rockier; plains_village 3%→81% plains). Luna exonerated. Bands now
  need absolute rise (UPLAND_RISE 24 / HIGH_ROCK_RISE 48); soil caps at
  windswept_hills; forested needs density ≥0.02. Block-identity proven
  on all 4 S2 worlds (full-report diff; clamp + snow votes identical).
  Kai signed off on the label repaint. Note: harbour's mountains now
  read windswept_hills (only ~800 true cliff cols) — glance pending.
- **F22 fixed (4a60a4b) — headline: district UNSATISFIABLE was the
  ground veto at building scale** (one wet column vetoed 400×400; ZERO
  feasible positions existed; kit blameless; E404 hint was deleting
  prompt nouns). Districts now judge ground like cities (median water,
  CITY_MAX_SLOPE); veto histogram surfaces in E406; hint reordered.
  hillkeep byte-identical; harbour old_town relocates to better site.

**F17+F19 plans RATIFIED (e3e2ec6 + eacd849, opus-5-high design).**
Kai's three rulings: land-use disposition 8 amended (farmParcels seam);
**NO survivor cap — total desolation at decline 1.0** (overrode
designer's 0.92); bare ruin/ruins → ruined_cottage (closes kit's oldest
open question). FARM: precinct.farm@0, parcel = platform claim rank 125
"ground nobody built on, tilled", persistence law (every farmland
column cropped, moisture 0). RUINS: decay operators on arbitrary
shells, re-clad rule (substitute in family or remove — modern ruin is a
frame), settleFixtures via lint's own support predicate, decline
pockets via cluster field, ruinShare = decline² past onset 0.35.

**Waves 3–4 LANDED:** E497 fixed (ccff332 — the world was right, the
classifier wrong: walkBack's street test now precedes a latched
platform test; harbour compiles end to end, zero errors, no geometry
moved). Farm WP-1 (f181065: node validates/seats/reports, padFor null
— never level a farm), WP-2 (9dd62d6: parcel planner, rank-125 claims,
crop-circle rule W501; still zero blocks). Ruins WP-1 (7b761ec: five
relics = five profiles over decayShell, 60-case list-identity golden;
bare ruin/ruins → ruined_cottage live), WP-2 (52c4976: engine takes
ANY shell — re-clad rule, timber by removal, quench, settleFixtures
fixpoint via stdlib support.ts now imported BY the lint; params.decay
on building.grammar; 63-shell catalog sweep lint-zero). Plan errata
recorded in RUINS-PLAN status block; FARM-PLAN example fixed
(drape). Ledgered: DEFAULT_CANDIDATES=96 thin; T107 coastal spawn
self-heals to land (benign).

**Wave 5 LANDED:** farm WP-3 (1c8e327: fields sown vs resolved ground,
persistence law by construction, lint-zero; plan §3.1 example now fully
valid Loam) + WP-4 (ef4fc49: yard levelled+claimed, farmstead packed on
non-gate sides, farmParcels clamp seam live, clearing suppression,
fields carry town biome; two archetype minima enlarged after
traversal.no_start). Ruins WP-3 (8dcb8ff: band table, per-lot roll,
NO-CAP ruling enforced past the plan's own pseudocode via
4·share·(1−share) window — decline 1.0 fells 64/64; W510 enacted
refusal, W511, I512; lint-zero at 0.9 and 1.0). Hygiene wart: 8dcb8ff
alone doesn't build (shared diagnostics rode with ef4fc49).

**Wave 6 LANDED:** farm WP-5 (43130f6 — F17 CODE-COMPLETE: kit section
teaches built truth, three total fan-out rows by-reference, example's
THIRD syntax fix now kit-test-validated; Luna e2e farm demo left for
orchestrator = folds into battery candidates). Ruins WP-4 (4a923ed:
ruin field, ruin_yard, street breaking ≥0.8 plants-only, reclaim lift)
— but TWO findings: forestEligibility's unconditional occupancy
exclusion keeps ALL trees out of the quarter (P4's overgrowth inert;
ruling: open for ruin-field>0 columns, keep building/interior/road/
plaza/prop excluded), and pre-existing traversal.unreachable on potted
plants in decayed shells (seeds 304-306; breaks lint-zero gate).

**Wave 7 LANDED — F17 AND F19 BOTH CODE-COMPLETE (2026-08-10 ~02:00).**
Ruins WP-5 kit (210db8d: "A ruined city is a district with a high
decline — not a list of ruins"; table-14's cannot-say-yet line gone,
test-pinned). Closure (9af28e4): potted-plant lint defect was two
vocabularies for one question — BODY_BLOCKING now shared via
support.ts, flood widened monotonically; tree gate opens where ruin
field>0 with per-column claims held, exposing+closing the untagged
sidewalk band (ruinPaved mask); seeds 300-310 all lint zero, 47-68
trees over ruined ground (was 0); kit's trees-stop sentence retired
with its pin test. Physics.ts has an invalid UTF-8 byte (pre-existing,
grep needs -a) — minor ledger item.

**IN FLIGHT: battery candidates P2 (seed 302, farm+aliens) and P4
(seed 304, hideout in overgrown metropolis ruins)** — first unattended
product-path test of farm, ruins, and centerpiece steering; install as
*_c1 channel. P2 doubles as the farm-plan demo world.

**Kai's ruling batch (with the candidate walks):** terrace bays don't
roll (pristine amid total ruin); one-in-six collapse promotion (needs
2nd param); light band roof fragments unreachable (retune); ruins
STREET_BREAK_FLOOR=0.5; intact-lot-may-take-ruined-yard nuance;
reclaim density read ("47-68 trees = reclaimed city?" — walk question).

**After candidates:** Kai walks P2/P4 + ruling batch → then F3
junctions, F5 WP-6, F6/F7 flora WP-C/D, F9, F10 per SHIP-PLAN §8.
Backstop 2026-08-28.

**Rulings owed to Kai (batch, next active):** terrace bays don't roll
yet (separate emitter — pristine rows amid total ruin, visible in P4);
one-in-six collapse promotion needs second param; light band's roof
fragments unreachable (walk retune).

**Next:** commit wave 6; ruins WP-5 (kit); then F3 junctions, F5 WP-6,
F6/F7 flora WP-C/D, F9, F10; first battery candidate once P2/P4
features complete.
