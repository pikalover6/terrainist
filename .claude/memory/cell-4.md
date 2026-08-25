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

**WAVE 1 (landed 04633eb, docs/audits/ — full numbers there):** compile
= **5.4 s** (my "3–4 min" was generate's LLM wall); BLAKE3 15.8 % of wall;
floors 2.7 → 1.25 → 0.4 s (layout solver = asymptote); **Bun DECLINED**,
node canonical. **Parroting CONFIRMED:** 84 % of docs use kit-spelled
vocab only; envelopes 84 % kit-literal; reach 147/722 catalog, 99/428
archetypes; 6/7 form packs at 0 %; ONE hallucination in 50 docs →
**reach is RETRIEVAL, not capability; fenced examples ARE the spec**.
Citadel: acropolis_terrace 0× ever; 9/10 troy rolls = archetype-less box;
landmark budget chases the prompt noun 11/11. Price = loop cost
($0.34/world; 3 model runs × 99k tokens; 277KB kit resent); **T118 units
= 53 % of retries** — kit says fraction, CODE says BLOCKS (C17 re-graded).
Authored layer barely binds (`hard` never written; conforms 1/108).
Convergent insight: the kit is the cost, speed AND creative-reach lever;
the compiler is healthy.

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

**Perf ladder CLOSED (Kai: "stop the ladder, bank the win"):** three
rungs landed byte-identical ×3 docs — position hash c446041, run-fill
c18c9fe, zero-fallback guard dbb47fd: troy 5.0→3.9 s, pirates 6.8→4.7,
thalassa 9.4→8.5 (~4.8 honest); profile now flat (top self 205 ms). E1's
per-item numbers were INCLUSIVE (bucketTrees 27 ms self, deflate 136).
Thalassa's "structures" was the programs' declare half mis-billed
(timings fixed 88adae5); 3.7 s = ONE authored program — **Kai: program
cost is NOT an authoring burden** (no diagnostic, no kit law). #27
density: NO (retaining 30 ms thalassa vs 497 troy). Unspent → WS-F:
roads.js 654 ms, flora parts ~250 ms. perf stood down; worktree stands.
**kit-fix A0 + cluster 1 LANDED 85420f7:** golden pass = $0.64 / ~20 min
(kit = latency); T118 2→0, diagnostics 4→0, tokens −26 %; the deleted
"fraction" sentence was the scatter.program rule misfiled (taught the
split with a fence); radiusBlocks/radiusFraction rename filed for WS-F. Menus design ratified by Kai: two
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
