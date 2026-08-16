# Cell 4 — current state (2026-08-15 night, PAUSED for Kai's off-wifi break)

**FIRST ACTION ON KAI'S RETURN (his explicit words: "POC first thing
when I get back"): the walkable-world WEB VIEWER proof of concept.**
Kai's vision for the terrainist site: maximalist hyper-modern landing —
prompt typed into a box, fade, and you are STANDING IN the generated
world, walking it in the browser. Zero Minecraft code: we own the block
data pre-NBT. Plan ratified in outline: `terrainist export-web`
(chunked palette-indexed gzipped voxels, ~5-15MB/world, streamable) +
Three.js viewer (greedy-meshed 16³ chunks, pointer-lock walk, baked
sun + AO). NO Mojang assets ever; POC ships flat-color-per-family + AO
scaffolding; the real look is DECIDED AT POC REVIEW (Kai's answer).
Hero world candidate: isles_of_war (the thesis shot). One agent wave.

**GEMINI BATTERY SWEEP (deck in Prism, ~$1.90 total for 7 worlds):**
pirate_vs_unicorn_isles_gem (minus 2 no-site scatters — now warnings),
trojan_horse_troy_gem, overgrown_metropolis_hideout_gem,
modern_hellenist_assault_gem, redwood_logging_camp_gem,
glowing_mushroom_vale_gem installed; alien_farm_invasion was the hash
casualty — re-frozen doc at scratchpad/p2-refrozen.loam.json compiles
0 errors, COMPILE+INSTALL PENDING (finish on return if the pause cut
it). Kai walks the deck A/B against Luna's candidates. Standing: Kai
is a "big believer" in Gemini but NOT locking it in; leniency stays
"for now"; his harness-comparison study is the open thread that
decides permanent gate shape. Luna remains the pinned default.

**POST-FREEZE TAIL (Kai un-deferred 2 of 3 rungs):**
- Wave 1 LANDED (c16b889): three bridges as bridge-kit styles (stone
  arch/timber/suspension; explicit bridgeStyle param or span length;
  suspension = towers + taut iron_chain cable + parabolic hangers) and
  the `between` route form (road router's cost field + maxDrop veto,
  span geometry kind, deterministic Taylor-cosh catenary) with
  harbour_chain_tower ("ships as a pair or not at all"). Kit doc
  teaches all six route forms.
- Wave 2 NOT STARTED (next after POC): water-movers — dam, weir,
  canal_lock via fluid.channel declaration (INFRA-ENTRIES-v0 family C
  ~line 81-94; rank 0; GROUND-CONTRACT §13.2 adjacency). Medium slot.
- Still deferred BY DESIGN: tier-A structure.linework, F5 WP-6 freeze,
  maglev_pylon, aqueduct/telegraph (between's other clients).

**UNCOMMITTED AT PAUSE (commit first if pause cut it):** hash-fix
agent's files — spec/src/programs/hash.ts (NEW canonical
programSourceHash: CRLF→LF, per-line trailing strip, one trailing \n;
compiler+agents delegate), pass.ts no-site→W337, program-author.ts,
spec package.json/index, cli test program-freeze-roundtrip, compiler
test program-no-site. Root cause was TWO divergent hash impls (whole-
string vs per-line trim) — a trailing space broke a world; braces
innocent. Full-tree verification at pause: 1 test failed / 4 files —
triage load-flake vs real, CHECK before committing.

**OPEN / BLOCKED, by whose move:**
- KAI: walk the gem deck vs Luna deck; harness-study verdict (gate's
  permanent shape + maybe output format); F3 junctions; survivor-yards
  (status quo holds); subjective battery polish list.
- ME on return: web POC → commit stragglers → p2 compile+install →
  water-movers wave → batch-runner throttle fix (jobs -rp subshell
  never engages; use pid array + kill -0 polling).

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
