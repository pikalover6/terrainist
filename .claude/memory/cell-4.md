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

**WAVE 1 (04633eb, docs/audits/):** compile 5.4 s (the minutes were the
LLM loop); parroting CONFIRMED (84 % kit-only vocab; reach 20 % of the
catalog; 6/7 packs at 0 %; ONE hallucination in 50 docs → reach is
RETRIEVAL); citadel never reached (acropolis_terrace 0×); price = loop
cost ($0.34/world, T118 = 53 % of retries, code says BLOCKS); Bun
declined. The kit is the cost, speed AND reach lever.

**WAVE 2a (Kai-driven parallel sessions, this session = MASTER
ORCHESTRATOR; briefs/corrections via SendMessage; sessions never commit —
I commit on their reports; step-gated, never one-shot):** perf CLOSED
(cell 3); menus CLOSED (WS-A2, below); kit-fix on clusters 4–6 (scope
docs/kits/** + tools/golden-prompts/**). Rules that held: freeze/thaw the
kit around any LLM measurement; one runner blob per triplicate; atomic
installs of harness edits; bug-first (code fixed by me, then the kit
teaches); heavy vitest one at a time. Wave 2b after 2a; campaign window
(caps) is Kai's.

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
assay_office→smithy). **RE-MEASURED at the cluster-3 kit (3×3, $0.31, 55ca8e1): THE MENU
WORKS where it is right** — troy pack uses OFF 3/5/5 vs ON 11/11/11,
pithos_store/trireme/votive_column (0/50 corpus) 3/3 ON, 0/3 OFF;
explicitArchetypeParams held (prediction pre-registered); walled 0/0/0
= the era tier's defect (medieval spans 8 incompatible packs — a
European town offered torii); binding hypothesis narrowed to named-pack
cases. Kai: DROP tier 2 (580 shown / 0 adopted vs 198/49) — **WS-A2 CLOSED
5893621**, menu named-pack-only ~1k tokens, flag OFF "not yet". Cluster 4
(checklists: no forest-count law exists; envelope rules unenforced)
applied, triplicates in flight ($0.35).
**Region scope** (consult 82216ce): two-place prompts empty world scope
BY INSTRUCTION (one region_<place> token each, hand-off in prose nobody
structural reads) — a prompt class the menu and A3 are blind to; Kai:
DEFERRED to Wave 2b/A3 (B staged behind A). Harness wrinkle: resume
skips failed records (fix scheduled). radiusBlocks/radiusFraction rename
→ WS-F.

**Cluster 4 LANDED 8cb1578:** desert forests [1,1,1,1]→[0,0,0] across four
kit versions (no forest-count law exists); envelope half suggestive only.
Rule: collect before-samples BEFORE bytes move. **Cluster 5 LANDED 1493b50:**
cost.ts:309 makes SURFACE the default distance measure (kit taught centre
→ every spacing in every doc off by half an envelope); era class is
renaissance; farm example's two advisory diagnostics → zero. B3 slope story
RETRACTED (kit-fix probed: zero demotions on alpine ground); conform = the
demotion order's first casualty (weight 1.0, last-written, index tiebreak);
census: 92/100 conform-demoted nodes also lost a second constraint —
hard distance tethers are the over-constraint → consult for Kai. Cluster
6 (semantics) next.

**WAVE 2b CONSULT drafted (docs/STOCKTAKE-WAVE-2B-v0.md, e891c43+):** B1
citadel = fence the civic set-piece (a)+(c), 3×3 ~$0.35; B2 A3 = core kit +
per-pack EXAMPLE modules (fences, not ids; named-pack selection; region
scope B behind A; measure copy-mode side effect); B3 probes DONE: omitted
strength = per-type default (§4.5, nothing to teach); demotion census:
terrain_conform 100 / distance 62 / adjacent_to 51 — kit fences write
conform without maxSlope (DEFAULT_MAX_SLOPE 35) → one real cluster. **Kai RULED: B1
now (after clusters 5–6), B2 = next wave with its own session/window.**

**Parked troy queue (not cancelled):** flight object native-first
(junction cliffs customer #1; stairs = architecture for real drops, never
road texture); landmark-border rule (+ terrace_steps mis-siting); entry-
grade residue trim (boost creep + closing trace fills — don't raise
R_FLAT blindly); n12 tread pick; shoulder/verge; WP ladder #10; pirates
staged awaiting GO (6b52fe3); catalog go-ham on side branches.

**The loop:** deep-probe deck → walk card (numbered stations, ONE question
each) → chat-log parse → probe to mechanism → popup consult → ratify →
neutral-land byte-identical → flip → FULL gate + re-pin triage → regen
baselines (never concurrent with the suite) → deck _nN + freeze/troy-iter-N.
Campaign variant: probe → consult → 3×3 at fixed bytes (before-samples
FIRST) → commit on the session's report.

**STANDING:** caps 4/≤2med/≤1high; delegation economics; implementers
opus-5-low; orchestrator commits, single-sentence subjects; probe-first;
byte-identity staging; screening install-anyway; popups liberally;
NEVER-WAIT; never --replace; battery/ read-only; heavy vitest runs (FULL /
compiler-package) one at a time, --maxWorkers=4 heap-flagged, light
targeted runs may overlap (loosened 08-24); agents never spawn agents; walk-taste lands
only on Kai's verdicts; zsh does not word-split unquoted vars; the
report's blockSpans ≠ the emitted world.
