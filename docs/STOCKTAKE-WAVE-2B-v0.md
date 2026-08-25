# STOCKTAKE Wave 2b — consult (drafted 2026-08-24, orchestrator)

**Status:** consult, no code. Written while Wave 2a's last kit clusters land,
so Kai has a Wave-2b decision ready the moment they do. Everything below is
grounded in Wave 2a's measured record (`docs/STOCKTAKE-v0.md`, `docs/audits/`,
`tools/golden-prompts/runs/`), not in the pre-campaign audits alone.

## 0. What Wave 2a settled, and what it changed about 2b

- **The compiler is done for now.** Three rungs, byte-identical, profile flat
  (troy 5.4 → 3.9 s); program cost is a non-goal by ruling. WS-E is closed.
- **The kit is the latency, not just the bill:** 60–360 s per authoring call
  against ~280 KB. Any e2e speed-up now is a kit-size change.
- **Fences are the spec; prose is inert; a menu of ids is not a fence.**
  Retrieval is necessary but not sufficient — the worked example supplies
  the binding (menu at the cluster-3 kit: troy 3/5/5 → 11/11/11 pack uses,
  three corpus-first ids 3/3; glowcap/redwood: right pack, coherent menu,
  zero adoption). Tier-2 era menus: 580 shown, 0 adopted — dead.
- **The measurement standard is now 3×3 at fixed bytes.** The noise floor
  is measured (archetype set 35 % stable at temperature 0); single-sample
  vocabulary deltas are re-rolls; `score.mjs` annotates `within noise`.
  A claim that cannot be made 3×3 is not made.
- **Two-place prompts empty world scope by instruction** and nothing
  structural reads the per-region tokens — a blind spot every world-scope
  consumer inherits, A3 included (`docs/INTENT-REGION-SCOPE-CONSULT-…md`).
- **A reference message deepens copy mode:** kit-literal envelopes rose
  34 → 43 % (+9, floor 7.7) under the first menu. Anything 2b injects must
  be measured for that side effect, not assumed neutral.
- Bug-first law: code is fixed before the kit teaches; clusters verify by
  triplicate; sessions step with Kai; the orchestrator commits.

## B1. The citadel — a civic set-piece the world organises around

**Evidence.** 9/10 troy rolls make the citadel an archetype-less ~15×21
grammar box; the landmark budget goes to the prompt noun (trojan_horse
11/11); 31/35 grandeur-promising docs spend no program on the civic
centre; acropolis_terrace 0× in fifty docs — until the named-pack menu put
it on the table (ON only, flag OFF). The bespoke budget is
`clamp(3·A/512², 3, 12)` landmarks + 3–6 plugins under a $1.00 stop and
**0/50 docs use it** (mode 1+1). The kit's centerpiece steering (§9e, F18)
says "find the prompt's centerpiece first" — and the model does, literally:
the noun, never the civic heart.

**Options.**
- (a) *Kit, fenced:* a worked example on a troy-class prompt that requests
  BOTH the prompt's icon (the horse) and the civic set-piece (a
  `landmark` program for the palace/citadel, or an `acropolis_terrace`-
  class archetype anchoring the settlement), with the prominence law
  applied. Cheapest; matches what binds. Verification 3×3 on troy_horse
  (+ a control): metric `civicSetPiecePresent` 0/3 → 3/3, floor-proof by
  construction. ~$0.35.
- (b) *Harness:* the proposal turn (`program-author.ts`, "what bespoke
  programs does this world want?") asks for the civic centerpiece as its
  own line item, distinct from the icon. Agents-side, flag-gated, prompt-
  identical when off. Use only if (a) does not bind — the binding finding
  says fences bind and instructions do not, so try the fence first.
- (c) *Catalog:* fence the acropolis_terrace / megaron / keep class in the
  kit's classical example so the archetype route exists without a program
  (the menu showed they are reachable the moment they are named).

**Recommendation:** (a)+(c) as one kit-fix cluster, measured 3×3; (b) only
on a null result. Cost ≈ $0.35 + ~$0.04/world at run time when a program is
requested.

## B2. A3 — dynamic context assembly (the kit as core + example modules)

**What A3 now is.** Not "inject the relevant catalog slices" (that was the
menu, and ids do not bind). A3 is: a **core kit** (the contracts, the
schema, the laws) plus **per-pack example modules** — fenced worked
examples, one per form pack / precinct / bespoke pattern — selected by the
intent pre-pass and injected as the second system message the menu seam
already carries. Retrieval of *examples*, not of names.

**Why it is worth it.** Tokens are latency: a 280 KB kit is ~99 k input
tokens and ~2.5 min per call; a core of ~⅓ that size with two or three
modules would cut cost and wall-clock by more than half AND make every pack
as reachable as classical_mediterranean is today (the only fenced pack, and
the only one the model spends).

**Design inputs from 2a, all binding on the design:**
1. Modules must be fences, not lists (the binding finding).
2. Selection is by named pack only; era-affinity is dead (580/0).
3. Two-place prompts: assembly conditioned on world scope is blind to them
   — the region-scope consult's option B (structured `regions` in the
   pre-pass output) rides here, staged behind A; decide A/B in this design.
4. Measure the copy-mode side effect (+9 points envelopes) per module.
5. Prompt identity when off; the golden suite is the gate; 3×3 per claim.

**Shape of the work.** Offline first, zero spend: split the current kit
into core + modules and measure sizes; then a 3×3 measurement on
troy_horse + pirate_unicorn_isles + glowcap_vale (the fenced pack, the
two-place case, the named-but-ignored pack) against the same-bytes OFF
triplicates. Engineering in two scopes — docs/kits (kit-fix) and
packages/agents + cli assembly (a menus-class session) — with the seam
already committed. Spend ≈ $1–2 in measurement. This is the largest item
and the one Kai's campaign window should be sized for.

## B3. Binding contracts — probe before teaching

The behavior audit asked to "teach the two or three contracts that bind"
(strength, conforms, envelope). Wave 2a says probe first: `strength` is
omitted in 677/716 constraints and `hard` is never written — **what an
omitted strength means to the solver is the first question**, and if the
default is already hard there is nothing to teach; `conforms` is 1/108 but
is set by the conform-certification gate, not by the author — a harness
question, not a kit one; envelopes are copied from whatever the kit prints
(84 % kit-literal), so the lever is which envelopes the fences print, which
B1/B2 already move. Proposed: three probes (zero spend), then at most one
kit-fix cluster for whatever actually binds.

## Sequencing, caps, spend

B1 first (one cluster, ~$0.35, answers Kai's own question); B3's probes in
parallel (zero spend, orchestrator-owned); B2 as the wave's main body.
Sessions as in 2a: kit-fix continues; a second Kai-driven session for the
assembly engineering. Total LLM spend for the wave ≈ $3. Decisions for Kai:
(1) go on B1 as (a)+(c); (2) whether B2 is this wave or the next; (3) region
scope A vs B inside B2's design; (4) the campaign window (caps).
