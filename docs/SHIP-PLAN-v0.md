# Terrainist — Ship Plan v0

> **DRAFT FOR CONSULTATION (2026-08-08).** Decision material, not a decision.
> Kai and the orchestrator pick a rung from §2 and answer §5; this document is
> then rewritten as the ratified plan and this banner is deleted.
>
> Grounded in `docs/DESIGN.md` (product, locked decisions, what is built, the
> roadmap's "road to shipping", the open-defects ledger),
> `docs/FLORA-GRAMMAR-v0.md` §8, and `docs/SITE-PLAN-v0.md` §12. Nothing here
> is invented: every named feature exists as a contracted work package or a
> ledger entry in one of those files.
>
> **Tripo is deprecated (DESIGN locked decisions, 2026-08-08).** No option in
> this document contains mesh assets, and none should be added to one.

## 0. What this document is for

The project has no end condition. The bar so far has been *"the worlds look
really good and impressive"*, and that bar is satisfiable forever: every walk
produces a ledger, every ledger entry is real, and every fix makes the next
walk better. The system is currently good enough that the marginal week is
genuinely worth spending — which is exactly what makes stopping hard, because
that will still be true in six weeks.

So this document does two things, in order of importance:

1. **§1 designs a termination device** — a mechanism that converts "finished
   enough" into a checkable predicate, and that works identically under every
   scope option. This is the part that matters. Without it, choosing a scope
   just relocates the problem.
2. **§2 lays out a ladder of scope options**, from "ship what exists" to a
   six-week push, each with its scope, its instance of the termination device,
   an effort estimate, a risk register, and what is genuinely lost by
   deferring it. §3 is the launch machinery that is invariant across all of
   them, §4 is a recommendation to argue with, §5 is what only Kai can answer.

## 1. The end condition

### 1.1 Why the current bar cannot terminate

Three properties of the present bar make it non-terminating, and any
replacement has to fix all three:

- **It has no denominator.** "The worlds look good" is asserted of an
  unbounded set of worlds. There is always another prompt.
- **It is evaluated after the work, not before.** Scope is discovered by
  walking; a walk that finds nothing is a wasted walk, so walks are designed
  to find things. The instrument selects for continued work.
- **Its judge is also its author.** Kai walks, Kai decides, and Kai wants the
  aqueducts. Nothing in the loop represents the customer who would have been
  perfectly happy with last week's build.

Two things are *not* wrong with the current bar and must survive: walks are
the only instrument that sees quality (DESIGN, "On the physics lint's
limits"), and countable proxies do not verify a fix (DESIGN, fourth failure
mode). Any termination device that replaces walks with detectors is a
regression dressed as a process.

### 1.2 The mechanism: a canonical prompt battery

> **The release is defined as a fixed, named set of prompts whose worlds pass
> their stated acceptance walks. Scope is whatever those prompts need.
> Everything else is post-launch by construction.**

Concretely:

- The battery is **N prompts** (5–12 depending on rung), each written as a
  *customer would write it* — plain English, no Loam vocabulary, no seeds or
  parameters in the text.
- Each prompt is frozen with a **seed** and, at candidate time, with the
  **generated document** (`<name>.loam.json`) it produced. Both are needed,
  and for different reasons — see §1.3.
- Each prompt carries an **acceptance walk**: 3–6 written assertions, authored
  *before* the work starts, that a walk either confirms or refuses.
- **Scope is derived, not chosen.** A feature is in scope if and only if some
  battery prompt's acceptance walk fails without it. "Aqueducts would be nice"
  is not an argument; "P8's walk asserts the water arrives from outside the
  town and it does not" is.

This is a **demand specification**, and that is the whole trick. A feature
list can absorb any amount of new wanting, silently, one item at a time. A
prompt list cannot: enlarging scope requires adding a *prompt*, which is a
single visible act with a name, a walk, and a cost in Kai's walk time. The
mechanism does not stop Kai from wanting more; it makes wanting more into a
discrete, dated, signed event instead of a drift.

It also has three free properties worth naming:

- **It is the demo reel.** The demo law (DESIGN, locked decisions) already
  requires every showcased world to be Luna e2e from a text prompt and
  regenerable. The battery is exactly that set. So the battery must be
  composed of *attractive* prompts, not merely diagnostic ones — a constraint
  that pulls it toward the product and away from a test suite.
- **It is the regression suite for launch.** Post-launch, the battery
  re-generates and re-walks on a cadence; a release that breaks it is a
  release that does not go out.
- **It prices the ladder.** Battery size *is* the calendar floor, because each
  battery world costs one Kai walk per candidate round. A 12-prompt battery
  at two candidate rounds is 24 walks. That is the honest reason not to make
  the battery large.

### 1.3 Two halves: acceptance walks and the reliability sample

The product claim is *unattended prompt → world*. A world is deterministic
given a document and a seed; a **document is not deterministic given a
prompt** — Luna is in that step. So one artifact cannot carry both halves of
the promise, and the battery has two components measured differently.

| | **Acceptance walks** | **Reliability sample** |
|---|---|---|
| What is frozen | prompt + seed + the generated document | prompt only |
| Size | N (= battery size) | ~20 fresh generations across the battery prompts |
| Judged by | Kai, in-game, on foot | machine only; nobody walks them |
| Asserts | the world is *good* | the pipeline is *dependable* |
| Bars | every stated assertion confirmed | see below |
| Re-runs | on demand; determinism makes the re-walk exact | every candidate |

**Reliability bars** (numbers are proposals; the sample sets them honestly on
first measurement — see S2 in §3):

- **Unattended success rate ≥ 90%**: a run that begins at a prompt and ends at
  a downloadable, lint-zero `.zip` with no human intervention and no manual
  retry.
- **Physics lint zero on 100% of shipped worlds.** Not a target — a gate. A
  world that lints non-zero is never served (S5).
- **Median cost/world and p95 wall-clock** recorded and under whatever ceiling
  the price point implies (§5, Q2).
- **On-topic rate**, judged by Kai over the sample's plan-maps and one render
  each — cheap, not a walk. This catches DESIGN's first failure mode ("valid
  requests the system silently declines") at a rate rather than anecdotally.

The honest claim shipping makes is therefore: *every world we serve is
well-formed and on-topic; the walked battery is what we show you.* We do not
claim every generated world is beautiful, because we cannot walk them all,
and pretending otherwise is how the refund policy gets written badly (§5, Q3).

### 1.4 Acceptance walks: how to write one so it terminates

The failure mode to design against is DESIGN's fourth: *a fix verifies a
countable proxy; the walk fails on an emergent property nothing measures.*
The counter is a two-tier assertion structure.

**Pre-conditions (machine, cheap, must be green before a walk is spent).**
No walk is scheduled for a world that fails these — walk time is the scarcest
resource in the project.

- 26-rule physics lint: **zero findings**.
- Walkability audit: entrance-reachable share, ground-reachable share,
  components, orphans, unserved faces — pinned as defect goldens that may only
  improve (DESIGN, "The walkability audit").
- Dressing audit's four detectors: no regression.
- Compile report: no `PROGRAM_DROPPED`, no `UNSATISFIABLE`, no demoted hard
  constraint on a node the prompt names.

**Assertions (Kai, in-game, deliberately not countable).** Three universal
ones apply to every battery world:

- **U1 — the prompt's central image is in the world and legible from the
  ground.** Not present in the document; present to a player standing in it.
- **U2 — the settlement is traversable on foot** along its intended routes
  without a jump, a mangled flight, or an unclimbable face.
- **U3 — nothing reads as broken at eye level** along one nominated route:
  no stub wall, no floating fragment, no chessboard paving, no prop held up
  by nothing.

Then 2–4 prompt-specific assertions, listed per rung in §2.

**Verdicts are three-valued**, and only one of them blocks:

| Verdict | Meaning | Consequence |
|---|---|---|
| **PASS** | every assertion confirmed | done, forever, for that prompt |
| **PASS-WITH-LEDGER** | assertions confirmed; nits observed | nits go to DESIGN's open-defects ledger and are *not chased* |
| **FAIL** | an assertion refused | fix, regenerate, re-walk that prompt only |

PASS-WITH-LEDGER is the load-bearing verdict. It is the formal expression of
the ratified rule (DESIGN, road to shipping) that *"outstanding nits get
noted, not chased"*, and it is what prevents each walk from spawning a wave.

### 1.5 The rules that make it a device rather than a list

Without these, the battery is just a checklist that grows. With them, it
terminates.

1. **The freeze.** At rung selection, the battery's prompts, seeds and walk
   assertions are written into this document and frozen. That moment is the
   scope decision; everything after it is execution.
2. **No editing a prompt to dodge a failure.** A FAIL is fixed in the
   compiler, or the prompt is *retired by an explicit, dated Kai decision
   recorded here* — never quietly reworded. Rewording the target is the
   purest form of the thing this mechanism exists to prevent.
3. **One ascent.** From the rung chosen today, Kai may move up **at most one
   rung, at most once**, and only at a rung boundary with the evidence that
   justifies it (§4 uses this deliberately). A second ascent is not available;
   the answer to wanting more after that is a post-launch release.
4. **Nits never gate.** A defect that no acceptance assertion refuses is
   ledger material, full stop. The ledger is long, it is *supposed* to be
   long, and every entry in it is a thing a paying customer will not notice.
5. **The date backstop** (§1.7) runs underneath all of it.

### 1.6 Alternatives considered

| Mechanism | Why it fails here | Salvage |
|---|---|---|
| **Feature-freeze date** ("no new work after the 20th") | Bounds *effort*, not *quality*: a date can arrive with the hillside cutover half-landed and no evidence the product works. Also invites a pre-date cram, which is how untested passes ship. | Keep as a **backstop**, not the primary — §1.7. |
| **Quality bar on metrics** (lint zero, audit goldens, detector counts) | Kai explicitly distrusts detectors as verification, and the record supports him: 1,010 stub retaining walls, 314 stair lanterns and an 80%-pavement quarter all shipped green, and four rounds of honest before/after numbers left a town in 54 components. Metrics prove well-formedness, never goodness. | Keep as **pre-conditions** (§1.4), gating walks rather than replacing them. |
| **Budget exhaustion** (spend N agent-waves, then ship) | Same defect as the date, plus it rewards cheap work over the right work. | Use as a **tripwire** on individual features: any feature exceeding 2× its estimate is escalated to Kai as a cut/continue decision, not silently absorbed. |
| **"Kai says it's good"** (status quo) | Non-terminating by construction — §1.1. | This is *inside* the battery, correctly scoped: Kai judging N frozen worlds against assertions written before the work, rather than judging the project. |
| **Ship-then-iterate with no bar** | The physics guarantee is the moat; serving a broken world costs more than a week of delay. | Expressed as the refund line (S5): lint-zero is the promise, and it is machine-checkable. |

The battery is primary because it is the only one of the five that bounds
scope *and* preserves walks as the instrument. The others become its parts.

### 1.7 The date backstop

The battery bounds *what* is built. It does not bound *how long a single
feature can be polished*, and that is the second attractor. So, underneath
every rung:

> **A launch date is set at rung selection. After it, only battery FAILs and
> S1–S7 launch machinery may be worked. New features, ledger squashes and
> aesthetic iteration stop entirely.**

Two rules keep it honest: the date is set from the rung's estimate **plus its
stated slack**, not from its optimistic case; and slipping it is a decision
Kai records here with a reason, not a default.

## 2. The options ladder

### 2.1 How to read the estimates

**Wave** = one round of up to 3 concurrent `opus-5-low` implementers plus the
orchestrator's integration and test run. Observed this session: ~45–60
minutes end to end. A strong day is ~6 waves; a normal one with review and a
regeneration is ~4. **1 feature-day ≈ 5 waves.**

**Walk-world** = one world Kai walks. ~45–90 minutes each; realistically **one
walk session per day, 2–3 worlds per session.** Walks are strictly serial in
Kai and cannot be parallelised, bought, or delegated — they are the calendar's
governor, and every rung's honest length is
`max(feature-days, walk-worlds / 2.5)` plus integration slack.

Estimates below carry a **confidence** column. `high` means the contract is
written and the mechanism is proven (flora WP-C has a spec down to the shape
program; infrastructure rides an engine with four shipped clients). `low`
means the design does not exist yet and the estimate is a guess with a
plausible 2× tail.

### 2.2 Feature inventory, priced once

Every rung is a subset of this table. Sources: DESIGN's roadmap and ledger,
FLORA-GRAMMAR §8, SITE-PLAN §12.

| # | Item | Waves | Walk-worlds | Confidence | Notes |
|---|---|---|---|---|---|
| F1 | Hillside cutover (SITE-PLAN WP-5) | 2–3 | 1 | high | Accepted by Kai 2026-08-08; regenerate examples, delete `terraced.ts`. |
| F2 | Flight-pin unit fix | 1–2 | 1 | high | Moves every flight endpoint on every hill world → mandatory walk. |
| F3 | Junction pass on flat towns — iterate to a decision | 4–6 | 2–3 | medium | Iteration 1 in flight. Fixes 1,026 latent cutoffs on c1-harbourtown; regresses `unservedFaces` 18→29. Needs Kai's ruling. |
| F4 | Ledger squash, tier 1 (props pad cut, `setpieces` masonry family, plaza over-count, boundary margin for fabric nodes) | 6–8 | 1 | high | Each 1–2 waves, independent. |
| F5 | Ground contract WP-6 + §13.3 + `RETAIN_*` re-measure | 4–6 | 1 | medium | The 55-column golden becomes a world change at first commit. |
| F6 | Flora WP-C (fungal, fantasy, `character.flora`) | 6–8 | 1 | high | FLORA-GRAMMAR §3.11, §6 are written to implementation depth. |
| F7 | Flora WP-D (kit, classifier, Luna e2e demo) | 3–4 | 1 | high | Gate is the demo law. |
| F8 | Flora follow-ups (per-species `snowLine` §9.6, law-1 `capWood` §9.4) | 2 | 0 | high | `snowLine` is machinery that never runs — DESIGN's second failure mode. |
| F9 | Biome-gradient dial (`intent.climate` blend width) | 3–4 | 1 | medium | Mechanism exists (per-cell smoothstep dither); this makes width authored, defaulting to today. |
| F10 | Per-district street palettes | 3–4 | 1 | medium | Streets still take the settlement root theme. Byte-identity risk on flat controls. |
| F11 | Biome tint in `packages/render` | 2 | 0 | high | Tooling: why grass-seam defects are invisible in our own renders. |
| F12 | Infrastructure family (aqueduct, canal, rail, mine headworks) | 12–18 | 2–3 | medium | Fifth client class of `SweptProfile`; contracted to that engine. New kit vocabulary, classifier rows, intent fan-out. |
| F13 | Agricultural layer + camps (contour field parcels, hedgerows, orchards, farmsteads, fishing/logging camps, waystations) | 16–24 | 3–4 | **low** | Unexplored. Touches the ground contract (parcels are platform claims), the land-use biome clamp (which explicitly excludes farmland), the fabric layer (farmsteads sited to fields they serve) and the life pass. |
| F14 | Colossal flora tier (hill-scale growths) | 10–16 | 2–3 | **low** | Unexplored. Build-limit interaction (FLORA §9.2), clipping, canopy-cover semantics, roots as ground claims, per-chunk cost. |
| F15 | Catalog curation (343/441 → a curated set) | 8–12 | 1–2 | medium | DESIGN's own framing: entry #441 is worth less than one well-made monument. No natural stopping point. |
| F16 | SITE-PLAN v1 items (per-bay stepped rows, undercrofts, polygon footprints, graded principal streets, courtyards on a strip) | 12–20 | 2–3 | medium | Named as v1 in SITE-PLAN §4.4/§12.1; recovers the ~45% ground `largestFreeRect` discards on non-hillside forms. |

### 2.3 Rung A — *Ship what exists*

**Scope.** F1, F2, F4. No new capability. Close the in-flight wave, cut over
`hillside`, fix the flight-pin units, squash the four cheapest ledger entries,
then spend everything else on §3.

**Battery (5).** P1 hill town, P2 harbour city, P3 fantasy landmark, P4 plains
village, P5 wildcard — exactly the baseline battery already contracted in
DESIGN's road to shipping, promoted from evidence-gathering to release
definition.

**Acceptance walks.** U1–U3 on all five, plus: P1 — the town climbs and the
flights meet the streets they serve; P2 — the harbour is on real water and the
town addresses it; P3 — the landmark is the thing the prompt asked for and is
approachable; P4 — a flat town's junctions read as junctions; P5 — no
assertion beyond U1–U3, because the wildcard's job is breadth.

**Estimate.** 10–13 waves ≈ 2–3 feature-days; 8–12 walk-worlds across two
candidate rounds ≈ 4–5 walk-days. **Calendar: 5–7 days**, walk-bound. S1/S4/S6
run alongside and become the real critical path (§3).

**Risk.** Low on the build; the risk is commercial. The baseline battery has
never been run, so rung A's central assumption — *today's pipeline clears
U1–U3 on five diverse prompts unattended* — is untested. If it does not, rung
A silently becomes rung B anyway, with fixes chosen by whatever failed rather
than by what is most visible.

**Lost by choosing A.** Every prompt naming a mushroom forest, a fantasy
biome, an aqueduct, a canal, a farm, a mine or a snow-line gradient gets a
world that is well-formed and *misses its central image* — DESIGN's first
failure mode, at the exact moment it starts costing money. Flora WP-C/D in
particular is written, specified, and cheap; deferring it defers ~10 waves of
known work while leaving a large class of prompts unserved.

**Demo reel (60s).** Aerial into a terraced hill town, cut to a stone harbour
at dusk, cut to a bespoke landmark looming over a village, cut to the download
button. Honest, narrow, and it looks like a very good Minecraft town
generator. It does not look like a world.

### 2.4 Rung B — *The visible-gap push*

**Scope.** A + F3, F5, F6, F7, F8, F9, F10, F11. Everything with a written
contract and no unknown design. This is the rung where each item is
"implement the spec", not "invent the mechanism".

**Battery (7).** P1–P5, plus:

- **P6 `old-growth`** — *"An ancient forest of colossal redwoods with a small
  logging camp at its edge."* Assertions: the emergents read as landmarks from
  the forest floor; buttress roots and hanging growth are visible on foot; the
  camp is legibly a camp. (Camp presence rides existing props/archetypes, not
  F13; if it cannot be met without F13, the assertion is cut at freeze — that
  decision is made *before* the work.)
- **P7 `fungal-vale`** — *"A glowing mushroom vale where a strange village has
  grown between the caps."* Assertions: the fungal flora is the dominant
  visual and is not a reskin of trees; the village's palette belongs to the
  vale; the biome edge fades rather than snapping.

**Additional assertions on P1/P2.** P1 — the snow line reads as a gradient,
not a cut; P2 — two districts are visibly different underfoot, not just in
their buildings.

**Estimate.** 34–44 waves ≈ 7–9 feature-days; 16–22 walk-worlds ≈ 7–9
walk-days. **Calendar: 9–12 days**, roughly balanced between the two — this is
the rung where feature work and walk capacity are matched, which is a good
sign about its size.

**Risk register.**

- **F3 (junctions on flat towns) is the only genuinely open decision**, and it
  is Kai's, after a harbourtown walk. It can end in "enable", "keep gated", or
  "iterate again"; only the third is a schedule risk, capped at two more
  iterations by the date backstop.
- **F5 (WP-6) moves worlds** — the §13.3 golden becomes a world change. Its
  byte-identity technique is proven and its two traps are documented, but this
  is the largest-blast-radius item in the rung.
- **F10 (per-district palettes) risks flat-control byte-identity**; the
  mitigation is the standing one (defaults unchanged, capability by
  authorship — flora's reach law generalises).
- No unknown-unknowns. Every item has a spec or a one-paragraph mechanism.

**Lost by choosing B.** No aqueduct striding into town, no canal quarter, no
rail, no fields, no farmsteads, no camps beyond props, no hill-scale flora,
441-catalog still 343. Prompts about *how a place works* — irrigation, mining,
farming, trade — get worlds that look right and are not about anything.

**Demo reel (60s).** A's reel, plus: sun through an old-growth canopy with a
giant clearing the canopy sea; a glowing fungal vale; a snow line that fades
across a summit cone; a street changing material as you cross into the old
quarter; a flat market town whose intersections resolve. This reads as a
*world generator with range*, which is the single most persuasive thing the
product can look like in 60 seconds.

### 2.5 Rung C — *The living-world push*

**Scope.** B + F12 + F13. The two items that make a settlement look inhabited
rather than constructed.

**Battery (9).** P1–P7, plus:

- **P8 `aqueduct-city`** — *"A dry-country city fed by a long stone aqueduct
  from the mountains, with terraced irrigation below it."* Assertions: the
  water arrives from outside the town and the route is legible for its whole
  length; the aqueduct's crossings (valley, road, wall) each resolve; the
  irrigated ground is visibly downstream of it.
- **P9 `harvest-vale`** — *"A farming valley at harvest, with hedged fields
  following the slope, an orchard, and a village that clearly works them."*
  Assertions: fields follow contour rather than the lattice; the farmsteads
  sit where their fields are; the settlement/field/wild transition reads as
  three things, not two.

**Estimate.** 62–86 waves ≈ 13–18 feature-days; 22–30 walk-worlds ≈ 9–12
walk-days. **Calendar: 17–24 days (2.5–3.5 weeks)** — feature-bound, with the
F13 tail as the dominant variance.

**Risk register.**

- **F13 is the project's largest unknown-unknown** and the honest reason C is
  not B. Field parcels are a *new kind of ground claim* — large, soft-edged,
  contour-following, and unlike anything in `INTENT_RANK` today. The land-use
  biome clamp explicitly excludes farmland, which means either an exception or
  a rethink of the clamp. Farmsteads sited to fields is a new coupling from
  the agricultural layer *back into* the fabric layer, and DESIGN's dominant
  bug class is cross-pass interaction. A 2× overrun here is ordinary, not
  pessimistic.
- **F12 is comparatively safe.** `SweptProfile` has four shipped clients, the
  arc frame and tread law are proven, and DESIGN already contracts the infra
  family to that engine. Its risks are vocabulary (kit, classifier, intent
  rows) and one genuinely new mechanism: an aqueduct's water must *hold*,
  which is a fluid-stability question the lint has rules about and the sweep
  engine has never been asked.
- **Walk capacity becomes the binding constraint** near the end: two new
  feature families landing at once produce more walkable surface than one Kai
  can judge per week, which is how a 3-week rung becomes a 5-week one.

**Lost by choosing C.** Colossal flora, catalog curation, and the SITE-PLAN v1
items — all of which are *depth*, not *range*. A stranger does not notice
missing depth in 60 seconds; they notice missing range immediately.

**Demo reel (60s).** B's reel, plus an aqueduct striding a valley on piers
into a dry-country city, terraced irrigation stepping down beneath it, and a
harvest valley of hedged contour fields with a village in the middle of them.
This is the reel that stops reading as "a generator" and starts reading as
"a place".

### 2.6 Rung D — *The grand push*

**Scope.** C + F14 + F15 + F16. Everything on the cut list, plus the SITE-PLAN
v1 items that unlock the ~45% ground the general lot cutter discards.

**Battery (11–12).** P1–P9, plus:

- **P10 `worldtree`** — *"A village built in the roots and shade of a single
  tree the size of a hill."* Assertions: the tree reads as hill-scale from
  outside the valley; the village is legibly *under* it; nothing about it
  fights the terrain it stands in.
- **P11 `deep-mine`** — *"A mining town on a rail line, with headworks over
  the shafts and spoil heaps below."*
- **P12** — a second wildcard, frozen at freeze.

**Estimate.** 92–134 waves ≈ 19–27 feature-days; 30–42 walk-worlds ≈ 12–17
walk-days. **Calendar: 26–40 days (4–6 weeks)**, with a wide tail.

**Risk register — and the warning.**

- **F14 and F15 are both infinite-work attractors, for opposite reasons.**
  Colossal flora has no defined ceiling — DESIGN records Kai's own framing
  ("larger foliage by multiple orders of magnitude, *eventually at least*";
  "the giants bar was passed, but it is a floor, not the ceiling"), which is a
  statement with no terminal condition in it. Catalog curation has 98
  unimplemented entries and a stated principle that the count is the wrong
  target, which means curation is judgement work with no counter to reach.
- **The battery stops governing.** At 12 prompts × 2 candidate rounds, the
  walk load is 24 walk-worlds *for acceptance alone*, before any FAIL
  regenerates anything. At 2.5 walk-worlds per day that is ten days of pure
  judging, during which feature work continues and produces more to judge.
  This is the mechanism by which rung D does not converge.
- **Mitigations if D is chosen anyway** — all three are required, not
  optional: (i) F14 gets a **hard wave cap** (16) and a written definition of
  "colossal" fixed before the first wave, expressed as a measured prominence
  bar in the style FLORA-GRAMMAR §8 already uses for emergents, so "grand
  enough" is a number Kai calibrates once; (ii) F15 is capped at a **named
  list of archetypes**, written at freeze, and #441 is explicitly abandoned;
  (iii) the date backstop is set at the **pessimistic** estimate (6 weeks) and
  the one-ascent rule is spent, so there is no rung above it.

**Lost by choosing D.** Six weeks of revenue, six weeks of real-customer
evidence, and the compounding value of shipping — which is the argument §4
turns on.

**Demo reel (60s).** C's reel, plus a village in the roots of a hill-sized
tree and a rail line running into mine headworks. Spectacular; and roughly
15 seconds longer than C's, for three additional weeks.

### 2.7 The ladder at a glance

| | **A — ship what exists** | **B — visible-gap** | **C — living-world** | **D — grand** |
|---|---|---|---|---|
| Features | F1, F2, F4 | + F3, F5–F11 | + F12, F13 | + F14, F15, F16 |
| Battery | 5 prompts | 7 | 9 | 11–12 |
| Waves | 10–13 | 34–44 | 62–86 | 92–134 |
| Walk-worlds | 8–12 | 16–22 | 22–30 | 30–42 |
| Calendar | 5–7 days | 9–12 days | 17–24 days | 26–40 days |
| Bound by | walks | balanced | features | nothing reliable |
| Unknown-unknowns | none (build); untested premise | none | **F13** | **F13, F14, F15** |
| What a stranger sees | a very good town generator | a world generator with range | a place | a place, plus two set pieces |

## 3. The invariant core — S1 to S7

This is launch machinery. It is required under every rung, its content barely
varies with scope, and **most of it parallelises against feature work**. The
scheduling rule that follows from that is the most important line in this
section:

> **S1, S4 and S6 are feature-independent. Run them DURING the push, so the
> push's length — not the infrastructure — sets the ship date.**

| | Item | Waves | Depends on | Runs during | Notes |
|---|---|---|---|---|---|
| **S1** | **Sandbox isolation** — replace the `node:vm` realm with a real isolate (worker or `isolated-vm`) | 4–6 | nothing | any push | **The named launch blocker.** Cheaper than it sounds: `programs/sandbox.ts` already documents this as Disposition 5 and routes everything through the swappable `ProgramExecutor` seam, so the swap must not touch the fuel meter, the API, the hashes or the gate. Deliverable includes a **hostile-program suite**: realm escape, prototype pollution, fuel exhaustion, unbounded output, host-object reachback, and a program that tries to observe wall-clock or entropy. |
| **S2** | **Baseline + reliability measurement** — 5 walked worlds + ~20 unwalked | 2 + harness | current `main` | **first**, before the push | Already contracted as step 3 of DESIGN's road to shipping. Produces: unattended success rate, cost/world, p95 wall-clock, on-topic rate, and the failure taxonomy S3 needs. **This is also the evidence that prices the ladder** — see §4. |
| **S3** | **Authoring hardening + prompt moderation (fail-closed)** | 4–6 | S2's taxonomy | any push | Every failure class gets a named user-facing outcome (retry / reroll / refuse with reason / refund), and the taxonomy is derived from measured failures, not imagined ones. Moderation is fail-closed: a prompt that cannot be classified is refused, never generated. Policy content is Kai's (§5, Q5). |
| **S4** | **Service wrapper** — queue + worker, job state machine, object storage, signed URLs | 8–12 | nothing | any push | Determinism makes re-serves free: a completed job's document+seed is the artifact, and re-emitting is cheaper than storing forever. Job states: `queued → authoring → compiling → gating → ready \| refused \| failed`. Compile is minutes-to-hours (DESIGN risk 2), so the queue is real, not decorative, and world-size tiers are an operational lever (§5, Q7). |
| **S5** | **Per-world ship gate** | 2–3 | S4 | after S4 | **Lint-zero is the refund line.** Audit numbers (walkability, dressing, composition) are recorded as telemetry on the job and never gate autonomously — the locked decision that autonomous repair iteration is never to be built stands, and a gate that reruns until the audit improves *is* that loop wearing a different name. |
| **S6** | **The face** — landing page, plan-map SVG, scripted flythrough, Stripe checkout | 6–10 + Kai's copy | battery worlds exist | any push | **Under the demo law**: every showcased world is Luna e2e and regenerable — i.e. the battery. The plan-map SVG and flythrough along the vista axes are already on DESIGN's high-leverage list and are nearly free from data the compiler produces; they belong here, not in a rung, because they are how a battery world becomes a reel shot. |
| **S7** | **Private beta → public** | calendar | S1–S6 | last | Beta is where the reliability sample stops being self-measured. Audience and size are Kai's (§5, Q4). |

**Critical path.** S2 first (it is evidence, and it is cheap). Then the push,
with S1/S4/S6 threaded through it — S1 and S4 are almost entirely
non-competing with feature work because they touch `programs/sandbox.ts` and a
new service package respectively. S3 and S5 land late because they consume S2
and S4. S7 is calendar, not effort.

**Total invariant core: ~30–40 waves ≈ 6–8 feature-days**, which fits inside
every rung from B upward without extending it. Under rung A it *is* the
critical path, and rung A's real calendar is therefore ~7–10 days, not 5–7.

## 4. Recommendation

**Take rung B, and pre-authorise the single ascent to C's infrastructure half
(F12) as a decision made at B's battery freeze.**

The reasoning, in the order I actually weighted it:

**1. B is the rung where every item has a written contract.** Flora WP-C is
specified down to the shape program and the palette symbols; the biome dial is
a width parameter on a smoothstep band that already exists; per-district
palettes are plumbing; WP-6 is a freeze whose safety net was built for it. B
is ~40 waves of *implementing decisions already made*. That is the cheapest
kind of week this project has, and it is the kind least likely to produce the
week after it.

**2. Range beats depth for a stranger, and B buys range.** The 60-second test
in §2 is not rhetorical — it is what a landing page is. B's reel adds four
visually distinct classes of world (old growth, fungal, gradient climate,
per-district texture) for ~30 waves. D's reel adds two set pieces for ~50.
The marginal persuasion per wave falls off a cliff after B, and rises again
only at F12.

**3. F12 is the exception worth pre-authorising.** An aqueduct crossing a
valley into a town is the single most striking shot available to this project,
and it rides an engine with four shipped clients, a proven arc frame, and a
tread law that has survived three lattice lessons. It is the best
demo-value-per-unit-risk item on the entire list — better than most of B's.
Its one novel risk (fluid stability on a swept channel) is exactly the kind of
thing the 26-rule lint already has an opinion about.

**4. F13 is where I would stop, and the reason is structural, not
squeamish.** Agriculture is the only item that introduces a *new kind of
ground claim* into a contract ratified nine days ago, requires an exception to
the land-use biome clamp, and adds a coupling from a new layer back into the
fabric layer — against a codebase whose dominant bug class is explicitly
cross-pass interaction. Every previous item with that shape (courtyards,
ground contract, hillside) took longer than its estimate and needed multiple
walks. Doing it *before* revenue, with no customers telling you whether anyone
wanted fields, is the expensive ordering.

**5. Shipping is not the end of the project, and the plan should say so
loudly.** Determinism makes post-launch releases structurally cheap: every
sold world can be rebuilt, regression-tested and re-served against a newer
compiler for free. So agriculture, colossal flora, catalog curation and the
SITE-PLAN v1 items are not *lost* by choosing B+F12 — they are **v1.1, v1.2,
v1.3**, built with revenue and with evidence about which of them customers'
prompts actually ask for. The framing that makes "finished enough" tolerable
is that it was never "finished" — it was "the first release". A public roadmap
converts the infinite-work attractor from a risk into a feature.

**6. On Kai's stated appetite.** *"An extra week"* and *"a massive weeklong
feature sprint"* is B, near-exactly. B+F12 is about two weeks — one rung of
deliberate overshoot on the item with the best risk-adjusted return, taken
with the ascent rule spent so there is no third bite. C-with-agriculture is
2.5–3.5 weeks with a plausible 5-week tail, which is 3–5× the stated appetite;
if that is genuinely wanted, it should be chosen *knowing* that, not arrived
at.

**The sequencing I would actually run:**

| Day | Feature track | Invariant core | Kai |
|---|---|---|---|
| 1–2 | F1 cutover, F2 flight-pin, F4 ledger | S2 harness | — |
| 2–3 | F6 flora WP-C begins | **S2 baseline: 20 unwalked** | **5 baseline walks** |
| 3 | — | — | **Battery freeze + ascent decision, with baseline evidence in hand** |
| 3–7 | F6/F7/F8 flora, F9 biome dial, F10 palettes, F11 render tint | S1 sandbox, S4 wrapper | F3 harbourtown ruling |
| 7–11 | F5 WP-6, F3 junction iteration, F12 infrastructure | S4, S6 | acceptance walks, round 1 |
| 11–14 | battery FAILs only | S3, S5, S6 | acceptance walks, round 2 |
| 14+ | frozen | S7 beta | — |

Note day 3: **the rung is formally chosen after the baseline, not today.** The
baseline battery is five walked worlds on current `main` and it is the only
evidence that re-prices the entire ladder — if today's pipeline already clears
U1–U3 on five diverse prompts, rung A becomes genuinely arguable; if it fails
two of five, half of B's budget is pre-spent on repairs and F12 should not be
pre-authorised. Committing to B today is safe because **B is a subset of every
larger rung**, so no work is wasted by the deferral. This is the one place in
the plan where waiting two days strictly dominates.

## 5. Open questions — Kai's call

Reserved for Kai; the plan cannot be ratified without Q1, Q2 and Q3.

| # | Question | Why it matters | Owner note |
|---|---|---|---|
| **Q1** | **Mojang commercial-use posture.** May we sell generated `.zip` worlds for Minecraft Java at all, under Mojang's EULA and Usage Guidelines? | **The one existential item.** A negative answer does not change the product; it changes the business model (free tool + paid hosting? donations? a non-Minecraft target?). Everything downstream of S6 assumes a yes. Answer this before S6 spends a wave on checkout. | Needs a read of the current guidelines, and possibly a written question to Mojang. Not a thing to guess. |
| **Q2** | **Price point and unit.** Per world? Per pack of rerolls? Subscription? | Sets the cost ceiling the reliability sample must clear, and therefore world-size tiers (Q7). | S2 gives cost/world; the margin is Kai's. |
| **Q3** | **Refund vs reroll.** A lint-zero world that is simply not what the customer imagined — refund, free reroll, or nothing? | S5's gate makes *lint-zero* machine-provable; "on-topic" is not machine-provable, and DESIGN's first failure mode says the system does silently decline valid requests. Whatever the answer, it must be stated on the page before purchase. | Recommend: lint-failure ⇒ never charged; on-topic complaint ⇒ N free rerolls, no refund. Cheap, because re-serves are cheap. |
| **Q4** | **Beta audience and size.** Who, how many, invited how? | Determines whether the reliability sample stops being self-measured before public launch. | |
| **Q5** | **Moderation policy content.** S3 is fail-closed mechanically; the *rules* are a product decision — real-person likenesses, hate symbols, sexual content, trademarked places. | A generator that will build anything from any prompt is a liability with a Stripe account attached. | |
| **Q6** | **Does the compile report ship to customers?** And the `.loam.json` alongside it? | The report names every demotion, drop and diagnostic — it is honest and it is also a list of everything that went wrong. The `.loam.json` is the *source*: shipping it is the reproducibility promise and makes a purchase durable, and it also hands over the spec language. | Recommend: `.loam.json` yes (it is the moat's proof, not its secret), full report no, one-paragraph human summary yes. |
| **Q7** | **World-size tiers.** 512² / 1024² / 2048²? | Not just pricing: the lint reads worlds back off disk and a 2048² world lints in *hours* (DESIGN risk 2). Size is an operational and queue-design constraint before it is a price axis. Sharding the lint per structure is the known fix and is not in any rung. | |
| **Q8** | **Hosting budget and region.** Queue, workers, object storage, egress for multi-hundred-MB zips. | S4's shape. Egress on world zips is the sneaky line item. | |
| **Q9** | *(new)* **Is the battery also the public gallery?** | If yes — and the demo law nearly forces it — battery prompts must be *attractive*, not merely diagnostic, and P5's wildcard becomes a permanent gallery slot rather than a breadth test. This changes how the prompts are written at freeze. | Recommend yes; write the prompts as marketing copy that happens to be a test. |
| **Q10** | *(new)* **Who walks after launch?** | Kai is the only instrument that sees quality. A post-launch regression that only a walk catches currently has no owner and no cadence. | Recommend: the battery re-generates and re-walks on every compiler release, and a monthly re-walk of two rotating prompts regardless. |
| **Q11** | *(new)* **What is the version-pin promise?** | Emit is pinned to 1.21.11 / DataVersion 4671 and the modern client auto-upgrades. If a future Minecraft breaks that, every sold world is affected at once. Determinism makes a re-emit cheap — but only if we promise it. | Recommend: state the pin publicly, promise a free re-serve at the current target for 12 months, promise nothing beyond that. |
| **Q12** | *(new)* **Reroll semantics and seed exposure.** Does a customer get the seed? Can they reroll the same prompt at a new seed, or re-author the same prompt entirely (a new Luna call, hence real cost)? | These are different products with different unit economics: a seed reroll is a compile; a re-author is a compile plus a generation. Q3's answer depends on which one "reroll" means. | |
| **Q13** | *(new)* **Age posture.** Minecraft's audience skews young; checkout, refunds and moderation all read differently with minors. | Affects the page's copy, the moderation rules, and possibly the payment flow. | |

## 6. What this document deliberately does not decide

- **The rung.** §4 is an argument, not a choice. The choice is Kai's, at the
  baseline gate on day 3.
- **The battery's exact prompt text.** Sketched per rung; written verbatim,
  with seeds, at the freeze — and once written, frozen under §1.5 rule 2.
- **Anything in §5.**
- **Post-launch order.** v1.1 / v1.2 / v1.3 should be ordered by what
  customers' prompts actually ask for, which is evidence that does not exist
  yet. Deferred deliberately.

## 7. Kai's answers (2026-08-09) — §5 resolved

Recorded verbatim in substance; each supersedes its open question.

- **Q1 (Mojang/EULA):** comfortable selling world `.zip`s of original
  content with no Minecraft assets inside; Kai reads the EULA as permitting
  it. Stance taken; no further legal work gates the plan.
- **Q2 (price/unit):** target **$5 for 3 variations of 1 prompt**
  (three generated worlds per purchase). Refunds/rerolls only for
  **objective technical failures** — never for taste.
- **Q4 (beta):** free access for friends, roughly one week.
- **Q5 (moderation):** prompts already pass through OpenAI's safety layer
  (Luna) — as strong as any bolt-on classifier; **test for gaps before
  launch**, add a safety model on prompts only if gaps show.
- **Q6 (what ships):** **no `.loam.json`, no compile report** — only a
  small English description. Technical details deliberately obscured.
- **Q7 (size/tiers):** one world size, one product at launch;
  **1024² initial target**; scale later. (Lint at 1024² is minutes —
  inside the envelope; no sharding needed for v1.)
- **Q8 (infra):** whatever is necessary, North America, tried paths —
  React site + cloud Linux box + Stripe.
- **Q9 (battery = gallery):** **partially** — some battery prompts written
  to be visually stunning (gallery double-duty), others are targeted
  debugging worlds and stay internal.
- **Q10 (post-launch walks):** Kai can routinely walk post-launch.
- **Q11 (version promise):** worlds are **for the latest Minecraft
  version (26.2 today) at shipping** — the auto-upgrade path is the
  mechanism, and work to keep it healthy is authorized. Launch gate: a
  load-in-current-client verification.
- **Q12 (reroll semantics):** subsumed by Q2 — a purchase is three
  authored variations; technical-failure replacement only.
- **Q13 (age posture):** not targeting young children; otherwise the
  general Minecraft audience.

One product consequence worth naming now: **$5 → 3 generations** sets the
unit economics at three authoring runs + three compiles per sale, so the
cost model in §3/S2 measures per-variation cost × 3 against $5.

## 8. The rung decision (2026-08-09) — ratified at the baseline gate

Chosen with the S2 baseline walked, exactly as §1.5 and the day-3 row of §4
prescribe. Recorded by the orchestrator from Kai's live answers.

**Rung B, amended. No ascent** — the one-ascent option was declined and is
spent (§1.5 rule 3: it does not carry past freeze).

### 8.1 The battery is replaced

Kai's ruling on the S2 evidence: the baseline five are too similar — five
temperate-settlement genres that test the pipeline five times and the
*promise* once. The product's promise is prompt breadth, and the walked
citadel set the bar: **the bespoke tier is the wow, and the battery should
demand it everywhere**. Three of the new prompts are resurrected internal
benchmarks with known failure modes and history to compare against.

Conventional genre prompts (hill town, harbour city, plains village) move to
the **reliability sample**, which draws from both battery and bread-and-butter
prompt space — the median customer is still measured, just not walk-asserted.

### 8.2 The frozen battery (P1–P7, prompts verbatim, seeds fixed)

Universal assertions U1–U3 (§1.4) apply to all seven. **U1 AMENDED by
Kai's ratification, 2026-08-10 (the icon law): U1 is now the stranger
test — a stranger names the prompt from ten seconds at any street corner.
"Central image present" is necessary but no longer sufficient; the theme
must be unmissable at saturation.** Pre-conditions (§1.4)
apply to all seven — note that "no `UNSATISFIABLE` … on a node the prompt
names" is now doing real work: both S2 hillside worlds would fail it today.

| P | Prompt (verbatim) | Seed | Heritage |
|---|---|---|---|
| P1 | "A pirate island and a unicorn island, at war." | 301 | intent pre-pass worked example |
| P2 | "A small farm town being invaded by aliens." | 302 | the invasion world (crop-circle rule, hover) |
| P3 | "The Trojan horse in Troy, right before the soldiers emerge." | 303 | new |
| P4 | "A high-tech apocalyptic hideout in the massively overgrown ruins of a metropolis." | 304 | new; carries the S2 ruins finding |
| P5 | "A modern Hellenist city being invaded by sea monsters." | 305 | new |
| P6 | "An ancient forest of colossal redwoods with a small logging camp at its edge." | 306 | rung B P6, unchanged |
| P7 | "A glowing mushroom vale where a strange village has grown between the caps." | 307 | rung B P7, unchanged |

**Prompt-specific assertions.**

- **P1** — the two islands read as opposed worlds (theme, palette and flora
  contrast legible from one vantage); the war is *in* the world: each island
  bears at least two aggression setpieces oriented at the other (wrecks,
  siege pieces, scorch, fortifications facing the strait); each island
  carries a small settlement of its own character.
- **P2** — the town is legibly a *farm* town: cultivated field parcels with
  farmsteads, readable as agriculture at eye level (F17's hook); the
  invasion is legible in three or more distinct places, at least one
  airborne and one ground trace; requested instance counts are delivered or
  diagnosed — never silently rounded (the crop-circle rule).
- **P3** — the horse is *the* landmark: a bespoke wooden colossus in a
  plaza/street context, approachable, dominating its surroundings; Troy is
  a walled ancient city — a circuit wall with at least one gate the horse
  plausibly entered; the moment is pre-emergence: the city inside the walls
  stands intact, no battle damage.
- **P4** — the ruins read as a once-metropolis: street-grid remnants and
  ruined district fabric at city scale, not scattered relics (F19's hook);
  overgrowth dominates — reclaim vegetation over and through the fabric;
  the hideout is present, high-tech against the ruin palette, and legibly a
  hideout — concealed or fortified — found along a nominated approach.
- **P5** — the city is modern *and* Hellenist at once: classical motifs on
  modern massing, era and style visibly orthogonal; the city addresses the
  sea; the invasion is legible from a walkable waterfront — sea monsters at
  or in the water line at three or more sites.
- **P6, P7** — as written in §2.4.

Dropped with the old battery: P1-old's snow-line-gradient assertion and
P2-old's two-districts-underfoot assertion. F8/F9/F10 stay in scope on spec
confidence and P7's biome-edge assertion; their walk coverage now rides
feature walks rather than battery assertions.

### 8.3 Scope, re-derived (the amendments)

Rung B's list stands: F3, F5, F6, F7, F8, F9, F10, F11 (+ F1, F2, F4 from A,
of which F1 and F2's diagnosis are already done). The new battery and the S2
findings add:

| # | Item | Waves | Confidence | Hook |
|---|---|---|---|---|
| F17 | **Minimal farm** — one generic field-parcel generator (tilled parcels, crop rows, fence/hedge edge) + farmstead siting near fields; the land-use clamp learns "farmland". Deliberately not F13: no camps, no orchard/waystation taxonomy. | 4–6 | medium | P2, Kai's rung amendment |
| F18 | **Bespoke boldness** — kit steering reaches for a landmark program on any prompt with a nameable centerpiece; strong prompts may carry 2–3 landmarks; budget defaults reviewed. Prompt text and budgets, not machinery. | 2–3 | high | Kai's citadel verdict; every P1–P5 |
| F19 | **District ruins treatment** — at high `decline`, a district's lots roll deterministically into their ruined-variant shells (the ruin law: the ordinary shell fit-out decayed), with rubble/overgrowth interleave; the kit teaches "ruined city = district + decline". | 4–6 | medium | P4; S2 ruins walk |
| F20 | **Ambient-terrain prompt fidelity** — diagnose why "open plains" authored 57% stony peaks; fix at intent→heightfield/biome steering. | 2–3 | medium | S2 plains world |
| F21 | *(folds into F4)* Scatter radius-units validator, zero-yield scatter author-actionable finding, biome-intent table widening. | 2 | high | S2 ruins run |
| F22 | **District-constraint teaching** — diagnose the uniform main-district `UNSATISFIABLE` signature at 1024²; fix at kit constraint guidance or solver cost model. | 2–4 | medium | §1.4 pre-conditions |

### 8.4 Estimate and the date backstop

50–68 waves ≈ 10–14 feature-days; 18–24 walk-worlds across two candidate
rounds ≈ 8–10 walk-days. **Calendar: 14–18 days.** Per §1.7 the backstop is
set from the estimate plus its stated slack:

> **Feature-stop date: 2026-08-28.** After it, only battery FAILs and S1–S7
> launch machinery may be worked. Slipping it is a decision Kai records here
> with a reason.

Friends beta (~1 week, §7 Q5) follows the battery PASS, inside or after the
S-work tail as S1/S4/S6 allow.
