# Cell 4 — the Great Stocktake (2026-08-24 →)

**READ FIRST: docs/STOCKTAKE-v0.md** (campaign plan, Wave-1 findings,
WS-F seeds) + docs/audits/*.md (the evidence). Prior epoch: cell 3 +
docs/SESSION-HANDOFF-2026-08-23.md.

**THE PIVOT (Kai, 08-24):** weeks of surface sprinting left slop → a
deliberate, parallel, measured campaign over six workstreams: A settlement
kit (A0 golden prompts FIRST), B terrain kit, C model behavior, D price,
E performance, F architectural inventory / kill-list. Laws: measure before
rebuilding, ratify before deleting; read-only audits + consult before ANY
fix; no delicate task is one-shot by a fire-and-forget agent.

**WAVE 1 (landed 04633eb, docs/audits/):** compile = **5.4 s** (my "3–4
min" was generate's LLM wall — wrong by 40×); emit 31 / structures 27 /
scatter 18 / layout 9 %; BLAKE3 15.8 % of wall; floors 2.7 s → 1.25 s →
0.4 s (layout solver = asymptote, sequential by design); **Bun DECLINED**
(5–10 % for a doubled byte-identity surface), node canonical.
**Parroting CONFIRMED:** 84 % of docs use kit-spelled vocab only;
envelopes 84 % kit-literal (cathedral box [15,17,21] ×7); reach 147/722
catalog, 99/428 archetypes; 6/7 form packs at 0 %; 170/175 never-spelled
archetypes never used; ONE hallucination in 50 docs → **reach is
RETRIEVAL, not capability; fenced examples ARE the spec**. Citadel
answered: acropolis_terrace 0× ever; 9/10 troy rolls = archetype-less
15×21 box; landmark budget chases the prompt noun 11/11. Price = loop
cost: $0.34/world (authoring .24 / programs .12), median 3 model runs ×
99k tokens (277KB kit resent each time); **T118 SCATTER_RADIUS_UNITS =
53 % of retries** — kit says fraction, CODE says BLOCKS
(validate.ts:1031-1044; the audit's C17 blamed the wrong side). Authored
layer barely binds (`hard` never written; conforms 1/108; E404 in 38/48
runs). Terrain kit: correctness pass only; silent bug — its wilderness
density band ≥ FOREST_COVERAGE_DENSITY paints whole regions forest.
Convergent insight: the kit is at once the cost lever, the e2e speed
lever and the creative-reach bottleneck; the compiler is healthy.

**WAVE 2a (LIVE):** Kai runs three parallel CC sessions in this repo and
STEPS THROUGH each (never one-shot; popups per step; if Kai is idle the
session is idle). This session = MASTER ORCHESTRATOR (ListAgents names
kit-fix / menus / perf; briefs + corrections via SendMessage). Scopes
disjoint: **kit-fix** = docs/kits/** + spec/test/kit.test.ts +
tools/golden-prompts/ (A0 baseline, ~$2.6/pass → units cluster (T118 +
terrain C3) → root union → archetype identity [kit:1447 "no archetype
param" is the defect; validate.ts:2396 validates it] → envelopes/
checklist → vocab contradictions → semantics; code bugs reported to me
and taught around); **menus** = packages/agents/** + new stdlib
registry-export + cli `catalog` + generate.ts seam + candidate-menu.ts
(opaque-string menu, second system message after the kit so revision
rounds keep it, flag OFF = messages byte-identical; implemented-only
ids, three tiers ~60 entries / 2.5k tokens); **perf** = stdlib/
determinism/** + compiler/emit/** in its OWN WORKTREE, every rung shasum-
identical ×3 baseline docs (troy_r22 / hellenist_r22 / pirates_r22).
Rules: sessions never commit or `git add` (shared index — I commit on
their reports); targeted vitest only, FULL suite scheduled by me; subagent
cap shared across all sessions. **No teaching around bugs** (Kai, via
kit-fix): code bugs come to ME and are fixed first (large → one opus
subagent; small/medium myself), then the kit teaches what the code does.
Fixed so far: biomeThemes phantom hint (de8381b); C3 forest gate = code is
RIGHT (F20 calibration), both kits teach the 0.02 line (Kai's verdict). Wave 2b after 1+2: civic set-piece budget
line (the citadel, ~$0.04/world), A3 dynamic context assembly, binding-
contracts teaching. The campaign window (caps) is Kai's to design.

**Perf ladder:** rung 1+2 LANDED c446041 (gate 5,572/0): single-
compression position hash 4.6×, scatter 3.8×, compile −15/−6/−21 %; troy
NOT representative (thalassa 9.4 s structures-bound, pirates scatter-
bound); emit cost = prismarine's linear palette scan (couples to authoring
richness); next rung run-fill only. Menus design ratified by Kai: two
tiers (named packs whole, era-affine round-robin), ~60 entries/2.1k
tokens, statuses=[implemented], empty menu ⇒ no message.

**#27 closed (e792d16):** resolveGround ×5 = §1.6 design (four prefixes +
the generating fifth); I497's hard-coded resolves:1 fixed (report bytes
only). Retaining probe (env-guarded wrappers on the built dist): 40
tiered stacks 349 ms, 22 PARTIAL (233 ms; 10 tiers unplaced, 52 columns
uncovered) — correctness before perf; shoulder/verge's customer.

**Parked troy queue (not cancelled):** flight object native-first
(junction cliffs customer #1; stairs = architecture for real drops, never
road texture); landmark-border rule (+ terrace_steps mis-siting); entry-
grade residue trim (boost creep + closing trace fills — don't raise
R_FLAT blindly); n12 tread pick; shoulder/verge; WP ladder #10; pirates
staged awaiting GO (6b52fe3); catalog go-ham on side branches.

**The loop:** deep-probe deck → walk card (numbered stations, /tp + ONE
question) → chat-log parse → probe to mechanism → popup consult → ratify
→ neutral-land byte-identical → flip → FULL gate + re-pin triage → regen
baselines (never concurrent with the suite) → deck _nN + freeze/troy-
iter-N. Candidates: probe for real spread BEFORE install.

**STANDING:** caps 4/≤2med/≤1high; delegation economics; implementers
opus-5-low; orchestrator commits, single-sentence subjects; probe-first;
byte-identity staging; screening install-anyway; popups liberally;
NEVER-WAIT; never --replace; battery/ read-only; heavy vitest runs (FULL /
compiler-package) one at a time, --maxWorkers=4 heap-flagged, light
targeted runs may overlap (loosened 08-24); agents never spawn agents; walk-taste lands
only on Kai's verdicts; zsh does not word-split unquoted vars; the
report's blockSpans ≠ the emitted world.
