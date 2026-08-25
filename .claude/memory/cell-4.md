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

**Perf ladder CLOSED** — see cell 3 (troy 5.0→3.9 s, byte-identical ×3
docs; profile flat; program cost = non-goal; #27 = correctness only).

**KIT LADDER (session kit-fix) + MENUS (session menus), all committed:**
A0 golden prompts 85420f7 (11 prompts, $0.64/~20 min per pass — the kit
is the latency); cluster 1 (units: T118 2→0; the deleted "fraction"
sentence was the scatter.program rule misfiled — taught the split);
cluster 2 2c77126 (root union; terrain §7b bespoke tier fenced);
**NOISE FLOOR** ($0.31, 3×3 at fixed bytes): archetype SET only 35 %
stable at temp 0 → one-sample vocabulary deltas < ~4 are re-rolls,
parroting floor 7.7 pts; score.mjs prints `within noise`; cluster 1–2
archetype deltas withdrawn. **Menu measured** ($1.29, 136020e): reach
does NOT move (62→64 within noise, packs 7→7); floor-proof signal =
pack-member uses 5→16, 15 classical (the one fenced pack), 3 corpus-
firsts; five prompts wrote the familiar generic id over the handed pack
id → **retrieval necessary, not sufficient; the fenced example supplies
the binding** (A3 input: teach preference). Flag OFF. Under the menu
params.archetype vanished (kit :1464 forbade it; compiler canonical
since fabric v2). **Cluster 3 0e17fd0 = first floor-clearing claim**
(3×3): explicit archetypes troy [0,0,0]→[2,3,3], walled [0,0,0]→[3,5,3],
fjord control flat; 3 fences had built the WRONG thing (harbour_light→
watchtower vs lighthouse; the_long_house→cottage vs longhouse;
assay_office→smithy). Re-measure of the menu redesigned: ON 3×3 on
troy+walled(+fjord) vs c3-after triplicate, ~$0.31, Kai's go pending.
**Region scope** (consult 82216ce): two-place prompts empty world scope
BY INSTRUCTION (one region_<place> token each, hand-off in prose nobody
structural reads) — a prompt class the menu and A3 are blind to; Kai:
DEFERRED to Wave 2b/A3 (B staged behind A). Harness wrinkle: resume
skips failed records (fix scheduled). radiusBlocks/radiusFraction rename
→ WS-F.

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
