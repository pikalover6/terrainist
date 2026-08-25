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

**KIT LADDER — PHASE 1 COMPLETE (session kit-fix, six clusters, all
committed; detail in cell 3 + docs/STOCKTAKE-v0.md §WS-A):** A0 golden
prompts ($0.64/~20 min per pass; the kit IS the latency); noise floor
measured (archetype set 35 % stable; score.mjs `within noise`; before-
samples BEFORE bytes move); clusters 1–6 each decided against the code,
four verified 3×3. Headlines: T118 2→0 (radius = BLOCKS; the "fraction"
sentence was the scatter.program rule misfiled); root union fixed;
params.archetype is canonical and three fences had built the WRONG
building; the desert's density-0 forest gone [1,1,1,1]→[0,0,0]; **distance
measures SURFACE by default (kit taught centre — every spacing off by half
an envelope)**; galleon is a water prop; prominence law taught a
district-child landmark validate.ts:698 rejects. **Open, Kai's call:
LOAM-T204 = two bespoke fences write the invalid nested distance form —
29/30 T204s in the campaign, a retry round per landmark.** Menus (WS-A2
CLOSED 5893621): named-pack-only menu ~1k tokens, flag OFF; proven effect
on troy (pack uses 3/5/5→11/11/11, three corpus-first ids 3/3); era tier
killed 580/0; binding finding + region-scope consult → A3. B3 slope story
RETRACTED: the conform is the demotion order's first casualty; 92/100
conform-demoted nodes also lost a second constraint (hard distance
tethers) → consult.

**WAVE 2b CONSULT drafted (docs/STOCKTAKE-WAVE-2B-v0.md, e891c43+):** B1
citadel = fence the civic set-piece (a)+(c), 3×3 ~$0.35; B2 A3 = core kit +
per-pack EXAMPLE modules (fences, not ids; named-pack selection; region
scope B behind A; measure copy-mode side effect); B3 probes DONE: omitted
strength = per-type default (§4.5, nothing to teach); demotion census:
terrain_conform 100 / distance 62 / adjacent_to 51 — kit fences write
conform without maxSlope (DEFAULT_MAX_SLOPE 35) → one real cluster. **Kai RULED: B1
now (after clusters 5–6), B2 = next wave with its own session/window.**

**FRESH TROY k1 (Kai: generate now; docs/decks/troy_k1; freeze/troy-k1 @
771cbe4; deck trojan_horse_troy_k1):** authored ONE-SHOT, zero diagnostics,
at the post-Phase-1 kit; the compile found TWO latent compiler bugs (fixed
by me under the bug-first law, Kai: "fix it myself inline"): farm.ts forced
the fifth resolve in the declaring half (bafb179; private resolve, byte-
identical); a mostly-water bench graded to the sea bed drained the bay
(771cbe4; SUBMERGED_BENCH_UNGRADED — bench stays in levels, pad edits
withheld; dropping the bench dammed the river fixture; pirates moved 43
sea columns, attributed; baseline re-pinned). Third item → WS-F: sealess
river ponded (T112) leaves unstable water (terrain-only). B1 (a) NULL
($0.47; "a fence teaches the number, not the ratio; fence both sides") →
(b) agents-side later. **Conform lever LANDED 34ad114:** 12 tethers soft /
11 hard, redwood E404 11/4/10→0/0/0 — "never slope, never maxSlope; the
kit taught hard tethers 25× with no soft". kit-fix's remediation write-up
docs/audits/kit-remediation-2026-08-24.md; campaign spend $4.82; kit-fix
stood down (Phase 1 + T204 + B1 + conform done). Walk: 6 stations in the
deck's WALK-CARD.

**k1 DECK SET (docs/decks/*_k1, ~$0.95):** montfort_hill (walled city;
hillside form replan dissolved 4/5 strips → 5 houses in a full wall),
alien_farm_invasion (2 holdings, 4 infra.entry, 3 programs, harvester
hovering), hellenist_sea_siege (city of 4 cells, harbour precinct,
leviathan wading, tentacles with a FRACTIONAL radius), overgrown_metropolis
(74 buildings 24–76 tall — cluster 4's evidence; T008 lead recurred),
pirates_vs_unicorns (two districts, 4 programs, galleon in the WATER,
region tokens and no world-scope pack). Kai holds judgement until all
five are walked; fabric density is the open question (lots/10k cells:
troy 19.7, montfort 2.2, hellenist 3.2).

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
