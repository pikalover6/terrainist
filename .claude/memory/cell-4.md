# Cell 4 — the last day (2026-08-08/09, fine detail)

**Strategy ratified (08-08):** the nitpick loop is retired; **the end goal
is shipping terrainist**. `docs/SHIP-PLAN-v0.md` (abdc901): termination
device = **canonical prompt battery** (release := N named prompts + frozen
seeds + acceptance walks written first; scope derived — a feature is in
scope iff a battery walk fails without it); four rungs A–D; recommendation
rung B + one pre-authorized ascent; **rung formally chosen day 3, after
the S2 baselines**. Orchestrator's narrowing: ascent = the aqueduct alone;
colossal flora = post-launch flagship #1. Kai: prefers a bigger push over
minimal v1 but needs the concrete end condition; battery partially doubles
as gallery. Tripo deprecated outright (d57ac05).

**Ship answers, all 13 (5ef97a8, §7 of SHIP-PLAN):** $5 → 3 variations of
1 prompt, technical-failure-only refunds; 1024² single product; no
loam/report ships (English description only, obscure internals); OpenAI's
safety layer, gap-test before launch; friends beta ~1 week; React + Linux
box + Stripe, NA; worlds for latest client (26.2) via auto-upgrade with a
load-in gate; Kai walks post-launch; not targeting young kids; EULA stance:
original-content zips are fine.

**Walk-5 (worlds -9/-7/-3, 08-09):** steep-7 GOOD. In-town vegetation OK
but Kai's design supersedes it: **one gradient** ambient→interiorShare
(can be harsh, never thick→nothing), interior share weakly author-dialed
(era/theme), don't overcomplicate — IN FLIGHT (medium). Vines partially
fixed — residue = chain segments with inherited faces pointing at air /
mixed faces per strand — IN FLIGHT (low). Buttress roots: bed ONE BLOCK
deeper — same low agent. Cutover live: hill prompts now route to hillside.

**OPM world done (seed 100, $0.088, installed):** first full product-path
run; Luna authored + gated ONE bespoke landmark (hero_association_
headquarters, 90×220×90). Its "ruins" archetype request (LOAM-W483) was
the first product-path finding.

**S2 baseline battery (08-09, COMPLETE — 5/5 installed as `*_baseline`):**
hillkeep (201), harbour_city (202), mistwood_citadel (203), sleepy_farm_
village (204), overgrown_city_ruins (205); 1024², product defaults,
$0.015–0.14/world. **Kai walked the ruins world: a forest with 4
buildings — the kit cannot say "ruined city"** (ruin vocabulary = 5 relic
archetypes; decline never ruins district buildings), plus ScatterArea
radius-units footgun (fraction read as blocks → 0-tree forest, silent)
and dark_forest missing from the biome table. **Kai's triage: LEDGER
EVERYTHING, no hotfixes.** Battery signatures ledgered: bespoke steering
correct (4× zero programs rightly, citadel fired + wiring check's first
production catch); main-district UNSATISFIABLE on both hillside worlds;
ambient terrain ignores "open plains".

**The one fix past the ledger bar (d4e7f47):** citadel's 165,117-block
program crashed compile — `push(...blocks)` past V8's ~125k arg budget.
Product-path blocking → fixed test-first (196k-voxel regression, proven
to die pre-fix). mistwood_citadel_baseline provenance: compiled from the
first run's kept wired doc (regen was stopped mid-run — respected, not
relaunched); 0 feedback rounds, but its only finding was an advisory
W411, so the delta is likely nil.

**Next:** Kai walks five baselines + hero_metropolis → **rung consult
AFTER the walks** (doc recommends B + one ascent; orchestrator narrows
ascent to the aqueduct; ruins treatment is prime rung-B scope evidence).

**Parked/open:** flight-pin unit mismatch (next street lever); junction
flat-town ruling (after iterations; the orphan win lives in the same
patches as the walked horror — on flat ground the pass does levels' job);
WP-6 freeze (§13.3); snowLine + law-1 implementation; uphill masonry;
biome-gradient dial; per-district palettes; WP-C/WP-D flora; dwellings-
vs-nature gate; props pads dig too deep; setpieces hard-coded masonry;
region-boundary district slicing.
