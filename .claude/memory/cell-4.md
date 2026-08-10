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

**IN FLIGHT (wave 3):** E497 site-plan fix (medium — ELEVATED: with
districts placing properly, harbour-class compiles ABORT on "3 seam
columns with no platform"; coin-toss had masked it; release-blocking);
farm WP-1 (low); ruins WP-1 (low). Ledgered: DEFAULT_CANDIDATES=96
thin for sixth-of-map footprints.

**Next after wave 3:** commit lanes; farm WP-2+ / ruins WP-2+; then
F3 junction iteration, F5 WP-6, F6/F7 flora WP-C/D, F9, F10; first
battery candidate generation once F17/F19 walk-ready. Open popups
owed to Kai: none.
