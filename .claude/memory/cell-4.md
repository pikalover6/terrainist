# Cell 4 — current state (2026-08-16, the browser round)

**RATIFIED 2026-08-16: GEMINI 3.7 FLASH HIGH IS THE PINNED DEFAULT
for ALL uses (8217286)** — "the demo worlds are insane"; Luna is the
one-flag-away fallback (LUNA_MODEL_ID), like GLM before it.

**WEB VIEWER POC SHIPPED (e89bf52) and verified live in Chrome:**
Kai's vision for the terrainist site: maximalist hyper-modern landing —
prompt typed into a box, fade, and you are STANDING IN the generated
world, walking it in the browser. Zero Minecraft code: we own the block
data pre-NBT. Plan ratified in outline: `terrainist export-web`
(chunked palette-indexed gzipped voxels, ~5-15MB/world, streamable) +
Three.js viewer (greedy-meshed 16³ chunks, pointer-lock walk, baked
sun + AO). NO Mojang assets ever; POC ships flat-color-per-family + AO
scaffolding; the real look is DECIDED AT POC REVIEW (Kai's answer).
Hero world exported: isles_of_war — 1024 chunks, 188-block palette,
1.17MB data, 5.6s export. terrainist export-web <doc> --out <dir>;
serve tools/web-viewer (python3 -m http.server), ?world= param.
ROUND 2 SHIPPED (9d62376, Kai's three verdicts): worker meshing
(22→3.6ms/chunk), greedy AO-aware merging (-37-56% tris), RE:Fi
textures (CC BY-SA 4.0 verified, ATTRIBUTION.md + footer credit,
100% palette mapped, flat-color fallback), landing fade = the page
(prompt types from manifest.prompt, format /1.1). Two live-GPU bugs
found on first run, fixed in main.js: worker-relative URL (absolutize
worldUrl before postMessage) and GLSL3 gl_FragColor (alias to
declared out). Default world isles_of_war (re-exported WITH prompt
from scratchpad doc). Still deferred: stairs as cubes, time-of-day,
signs/entities. Chrome rAF throttles occluded tabs — automation
screenshots show stale frames; bench numbers only valid focused.

**GEMINI BATTERY SWEEP (deck in Prism, ~$1.90 total for 7 worlds):**
pirate_vs_unicorn_isles_gem (minus 2 no-site scatters — now warnings),
trojan_horse_troy_gem, overgrown_metropolis_hideout_gem,
modern_hellenist_assault_gem, redwood_logging_camp_gem,
glowing_mushroom_vale_gem installed; alien_farm_invasion_gem
INSTALLED too (re-frozen doc, 0 errors) — the deck is COMPLETE, all
seven. Kai walks it A/B against Luna's candidates. Leniency stays
"for now"; the harness-comparison study remains his open thread.

**POST-FREEZE TAIL (Kai un-deferred 2 of 3 rungs):**
- Wave 1 LANDED (c16b889): three bridges as bridge-kit styles (stone
  arch/timber/suspension; explicit bridgeStyle param or span length;
  suspension = towers + taut iron_chain cable + parabolic hangers) and
  the `between` route form (road router's cost field + maxDrop veto,
  span geometry kind, deterministic Taylor-cosh catenary) with
  harbour_chain_tower ("ships as a pair or not at all"). Kit doc
  teaches all six route forms.
- Wave 2 LANDED: water-works.ts — three-intent declaration (dry
  barrier platform + pool platform with held surface + preserve),
  closure-or-drop-head law (no partial pools), upstream computed via
  integer cross-multiplied means, refusal-still-builds (dry + T234).
  dam/weir/canal_lock implemented; weir = freeboard zero. Known
  reversible defaults: movers run post-streets (town caps the head);
  pre-existing flora in a new pool stays. Full tree 4,434/0.
- Still deferred BY DESIGN: tier-A structure.linework, F5 WP-6 freeze,
  maglev_pylon, aqueduct/telegraph (between's other clients).

**Hash canonicalization LANDED (5281c90):** one programSourceHash in
spec (two divergent impls — whole-string vs per-line trim — meant a
trailing space broke a world; braces innocent); no-site→W337 same
commit. Batch-runner throttle fixed (5e1517a, pid array).

**OPEN / BLOCKED, by whose move:**
- KAI: walk the gem deck vs Luna deck; harness-study verdict (gate's
  permanent shape + maybe output format); F3 junctions; survivor-yards
  (status quo holds); subjective battery polish list.
- ME: land + commit water-movers wave; author exhibits for wave-1
  infra (bridges/chain tower) when convenient; POC-review decisions
  (look, landing sequence) come from Kai.

**Standing discipline reminders:** INSTALLS GO TO PRISM: `--saves
"/Users/kaihoward/Library/Application Support/PrismLauncher/instances/
Fabulously Optimized/minecraft/saves"`; never --replace; battery/
read-only archive; orchestrator commits (agents never); shared-tree
git discipline; implementers default opus-5-low (tiers price residual
judgment, not size); one vitest per agent --maxWorkers=4; agent briefs
carry the physics-lessons block (walkable = solid non-water floor +
air y+1/y+2; mud 15/16; no six-air-face; solid-per-course; lantern-name
rule → glowstone; `chain` auto-renames to iron_chain in the PARSER —
write iron_chain directly; params AND envelope are input space);
distinct file lineages per agent + name shared-file exclusions in every
brief; pipes swallow vitest exits — check COUNTS; tee generates; never
emit worlds from a dist carrying in-flight agent code; popups liberally;
NEVER-WAIT (CLAUDE.md) governs all pacing — but Kai's explicit pause
instruction wins until he returns.
