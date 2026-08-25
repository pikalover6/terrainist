# THE GREAT STOCKTAKE v0 — from sprint to census

Kai's directive (2026-08-24): weeks of sprinting on surface output left slop;
the settlement kit got an independent audit (22 correctness contradictions,
11 interface risks, 9 token sinks — `~/Downloads/loam_settlement_author_kit_audit.md`);
we have never watched model behavior against the catalog; price and speed
have never been optimized; and the codebase deserves a deliberate inventory
instead of ad-hoc chipping. This document is the campaign plan: six
workstreams, most parallelizable, all measurement-first — **measure before
rebuilding, ratify before deleting.**

Seed findings already in hand:

- The settlement kit is **277KB (~70k tokens), re-sent on every authoring
  call** — input tokens dominate authoring cost. The audit's own target: a
  75–85% reduction via layered assembly, with Phase 1–2 safe under any
  architecture.
- **Catalog reach is ~2%**: two independent troy rolls produced the
  *identical* 14-archetype vocabulary out of 722 catalog entries — verbatim
  the kit's classical_mediterranean exemplar list, same forbids. The model
  parrots the worked examples; it does not explore the registry. (Kai's
  citadel instinct, confirmed: no castle/keep/gatehouse/acropolis_terrace
  in either mix.)
- ~~Compile wall time is ~3–4 minutes~~ **WRONG, corrected by E1
  (2026-08-24): the compile is 5.4 s.** The minutes were `generate` (LLM
  latency × a median 3 model runs) and the probe harness. LLM authoring is
  the e2e wall AND the cost (~$0.34/world median, ~378k input tokens).

## WS-A — Settlement-kit remediation (input: Kai's audit)

- **A1 (parallel-ready now):** the audit's Phase 1 — the 22 correctness
  reconciliations (root-child union, archetype identity, era vocab, station
  ownership, forest cardinality, …). Mechanical against the audit's line
  index; each finding is an independent edit + golden-prompt check.
  Opus-5-low fleet, one finding-cluster per agent.
- **A2:** Phase 2 — stop hand-maintaining the compiler registry in prose:
  export machine-readable schemas/registries from the compiler, generate
  the kit's tables, delete changelog/anecdote prose from runtime context.
- **A3 (design-gated, consult):** Phases 3–5 — dynamic context assembly
  (classify prompt → inject only relevant modules/catalog slices),
  validator-driven repair loop, optional planner stage. This is the
  architecture decision the audit flags; it rides A2's exports.
- **Gate:** the audit's golden-prompt suite lands FIRST (A0): pin current
  authoring behavior on ~10 representative prompts so every kit edit is
  measured against it. Kit edits are not byte-gated (LLM nondeterminism);
  the golden-prompt suite is their regression harness.
- **A0 LANDED + cluster 1 (Wave 2a, session "kit-fix"):** `tools/golden-
  prompts/` — 11 prompts, authoring-only, ~**$0.64 and ~20 min of wall per
  pass** (an authoring call is 60–360 s, median ~2.5 min against the 277 KB
  kit: **the kit is the latency as well as the bill**; the earlier $2.6
  estimate used WS-C's per-world figure). Baseline caught the units
  contradiction live (three docs wrote fractional forest radii as the
  kit's table said; a fourth copied the example's 120 blocks) and audit C9
  (a forest of density 0 named barren_waste, authored to satisfy "at least
  one forest"). Cluster 1 result: T118 2 → 0, whole-region fills at
  coverage 3 → 0, diagnostics 4 → 0, one-shot 2 → 3, prompt tokens −26 %.
  **The finding the suite alone could catch:** the deleted "fraction of the
  region radius" sentence was the `scatter.program@0` rule
  (programs/validate.ts:487-494, whose own comment names the trap) misfiled
  into the forest row — true about the wrong node; a blind fix shipped two
  new T104s until the kit taught the split with a fenced example. Filed
  for a later wave as a real interface fix (WS-F seam list): rename to
  `radiusBlocks` / `radiusFraction` so the two nodes cannot share a word.
- **Cluster 2 LANDED (`2c77126`):** the settlement root union now lists
  what validate.ts dispatches (the old rule forbade the kit's own district,
  city, precinct, infra.entry, authored: and scatter.program features); both
  kits' key lists gain `programs`; the terrain kit gets §7b, the bespoke
  tier, with three fences (Kai: "teach it, it's real capability"). kit.test
  94/94; 5-prompt delta clean. Filed for later clusters: the precinct.farm
  example's `face: "any"` trips T206 on every copy; its `terrain_conform:
  "drape"` does nothing (W407, audit H4). **Method problem, open:** at
  temperature 0 with identical kit bytes, troy's archetype count moved
  13 → 11 and 13 → 10 across runs, swapping ids — the vocabulary metrics
  have a noise floor — now MEASURED (3 prompts × 3 repeats at frozen bytes,
  $0.31): walled_medieval_city archetypes 15/14/11, archetype SET only 35 %
  stable (7 of 20 ids in one run only); troy 10/12/10, set 69 % stable;
  fjord species 4/4/8; constraint counts spread 46–67 %. **Campaign reading
  rule:** a one-sample vocabulary delta below ~4 archetypes on a settlement
  prompt is a re-roll, and any single swapped id is churn. Stable at n=1:
  node count, formPacks, generators, docBytes (±5–13 %), and diagnostics
  tied to specific edits (T118 2 → 0 held across every run). The archetype
  deltas reported for clusters 1–2 were within noise and are withdrawn as
  results; their diagnostic/token/cost numbers stand. WS-D's shootout must
  run repeats or score on stable metrics + pass-rate + cost. score.mjs now
  prints `within noise` beside sub-floor deltas (floors: archetypeReachPct
  1.2 pts, **kitLiteralEnvelopePct 7.7 pts — the parroting metric must
  move ~8 points to mean anything**; summed metrics scale by √n). Kit FROZEN at 58e7d2e0 /
  f98c5e85 for the menu measurement (Kai: the complete ~$1.00 pair).
- **Cluster 3 pinned (archetype identity) — two audit re-grades from the
  code:** C3's "preferred architectural fix" (explicit canonical archetype)
  ALREADY SHIPPED with fabric v2 — validate.ts:2526-2536 says
  `params.archetype` is canonical and tags are the fallback; the kit says
  the inverse at :816 and :1464 ("writing one is an error") while its own
  fences write `params.archetype` 4×. Documentation reconciliation, not an
  API change. C3's opera sub-claim (3 floors / 25×19 vs the catalog column)
  is a consistency nit — the "envelope that works" column is guidance the
  compiler does not enforce (HIGHRISE_FLOOR_CAPS binds the high-rise table
  only); a document with that fence validates clean. **Reading key for the
  menu measurement:** it runs against a kit that forbids naming the ids the
  menu offers, so a weak result implicates the kit sentence before the
  menu; re-measure after cluster 3 is the honest test.
- **Cluster 3 LANDED — the first floor-clearing claim** (3 runs before vs
  3 after at fixed bytes): explicit archetypes per document troy
  [0,0,0] → [2,3,3], walled_medieval_city [0,0,0] → [3,5,3], ranges
  disjoint; fjord_terrain [0,0,0] → [0,0,0] as the negative control. Two
  false sentences removed; 18 fences gain `params.archetype`; **three
  fences were building the wrong thing** (harbour_light → watchtower
  though `lighthouse` exists; the_long_house → cottage though `longhouse`
  exists; assay_office → smithy though `assay_office` exists) — the model
  copies examples, so the examples taught the wrong buildings. No reach
  claim (union 20 → 21, within noise): cluster 3 adds no ids; it unblocks
  the menu's lever. +305 input tokens per call. Incidents (not kit-
  attributable): one provider-side JSON truncation under concurrent load;
  one unretryable OpenRouter error killed a run's process (records
  survived via incremental writes). Harness wrinkle to schedule: resume
  skips failed records too; should re-author `ok: false` by default.
- **Region-scope ruling (Kai, 2026-08-24): DEFERRED to Wave 2b / A3** —
  recorded as A3's design input; A/B decided when dynamic assembly is
  designed.

## WS-B — Terrain-kit audit

Same lens as the settlement audit, applied to `docs/kits/terrain-author.md`
(37KB — an afternoon for one agent). Deliverable: same finding taxonomy,
folded into A's remediation ladder.

## WS-C — Model-behavior audit (zero LLM spend)

The battery corpus (63 worlds × archived docs + generate logs + cohort
history) is a behavioral record nobody has read statistically. One
analysis harness over it:

- Choice histograms: archetypes, generators, constraints, form packs,
  intents — reach vs the 722-entry catalog, per prompt family.
- Harness behavior: attempts per doc, demotion rates, feedback-round
  yield, token/cost per stage, warning classes that recur.
- The **exemplar-parroting hypothesis** (seeded above): does vocabulary
  ever leave the kit's worked examples? This directly feeds A3's dynamic
  catalog injection and D's spend.
- The **set-piece ambition question** (Kai's citadel): when a prompt
  demands grandeur, does the model spend its bespoke budget there, reach
  for catalog, or satisfy it with districts? Deliverable ends in a design
  consult: catalog set-pieces vs bespoke budget vs kit steering.
- **Addendum (Wave 2a, session "menus", 2026-08-24): "six packs at zero"
  is two different things.** Reading the golden harness's cached intents:
  pirate_unicorn_isles gets NO era and NO pack at world scope, so
  nautical_pirate (the audit's 0/20) was never reachable by the author —
  no menu or kit teaching can fix a pack the pre-pass never names at the
  scope the consumers read. (desert_wilderness and fjord_terrain also build
  empty menus, and that is CORRECT: terrain-only prompts with no
  habitation carry biome/climate/flora richly; an era or a pack would be
  wrong for a salt flat.) **Corrected framing — it is NOT a classifier
  bug** (docs/INTENT-REGION-SCOPE-CONSULT-2026-08-24.md): the pre-pass is
  instructed, rightly, never to average two places into one `character`
  block; it emits one `region_<place>` token per place and hands off in
  prose — "the document author turns one token into one region's own
  character block". That hand-off is prose-to-prose: `intentKitContext` is
  the only consumer of `region_*`; every structural consumer (the menu,
  mix-intent pack expansion, W517) reads world scope, and `tokens` is
  documented as never switched on. So **any prompt with two characters —
  two islands, a city and its ruin, a town and the camp besieging it —
  empties world scope by instruction and is unreachable by anything
  conditioned on it; the candidate menu inherits that blind spot
  completely, and so would A3's dynamic assembly.** Options in the
  consult: A union-at-world-scope behind the array rule; B structured
  `regions: [{name, intent}]` in the pre-pass output; C parse the free
  text (not recommended); D nothing. Recommended B staged behind A, riding
  A3. Kai's ruling pending.
- **MEASURED (Kai bought the complete 11×11 pair, $1.29, at the frozen
  kit; menus, 2026-08-24):** the menu does NOT move catalog reach at n=1 —
  archetypes 62 → 64 and reach 14.5 → 15.0 % within noise, formPacks 7 → 7,
  props 23 → 23, cost +2 %; the audit's "toward pack-complete and cheaper"
  is falsified on both halves. The floor-proof signal: **pack-member uses
  5 → 16**, 15 of them classical_mediterranean — the one pack the kit
  fences — with three corpus-firsts (column_drums, votive_column,
  sandbag_emplacement; churn cannot mint ids the corpus never wrote), and
  troy dropped castle + church. **Five menu-bearing prompts adopted
  nothing and wrote the familiar generic id over the specific pack id in
  hand** (witch_hut over witch_stilt_hut; sawmill over sawpit) — all
  implemented, all reachable by tag, so spelling was not the barrier.
  **Retrieval is necessary but not sufficient: the fenced example supplies
  the binding; the menu amplifies only where binding exists.** That is
  A3's design input: the next lever is teaching preference, not showing
  more ids. Side effects: params.archetype vanished under the menu (7 → 0;
  the :1464 prohibition beat the compiler, the fences and the menu) and
  kit-literal envelopes rose 34 → 43 % (+9, floor 7.7) — a reference
  message appears to deepen retrieve-and-copy mode. Controls held (empty-
  menu prompts identical; pirate's 15 → 13 is a live floor reading).
  **Recommendation on record: flag stays OFF; re-measure ON-only (~$0.64)
  after cluster 3 removes the prohibition and fences a pack that spends
  menu ids.** Machinery committed and free while off.

## WS-D — Price optimization

- **D1:** kit slimming IS the price lever (input tokens dominate): A1+A2
  alone should cut the per-call bill materially; measure before/after on
  the golden-prompt suite.
- **D2:** model shootout (`tools/shootout` exists): current pin is
  gemini-3.7-flash; test the current cheap tier on the golden prompts,
  score by validator pass-rate + walk-proxy metrics + cost.
- **D3:** harness: fewer/cheaper feedback rounds (only actionable
  diagnostics + schema fragments, per the audit), prompt caching where the
  provider supports it, program-author call consolidation.

## WS-E — Performance (REBASED on E1's measurements, 2026-08-24)

**E1 ran; the original ladder is retired** — its ≤60s and ≤10s rungs were
built on a 3–4 minute premise that measured the wrong thing. Measured
truth: **5.4 s today**, single-threaded, never previously profiled
(emit 31% / structures 27% / scatter 18% / layout 9%; BLAKE3 alone 15.8%
of wall; full report: scratchpad perf/REPORT.md + battery of scripts).

- **"A few seconds" is the status quo. The live question is sub-second:**
  ~2.7 s from contained wins (allocation-free positionFloat — 1.40×
  measured, byte-identity asserted; memoised ground resolves; indexed
  boundary scans), **~1.25 s with ordinary engineering** (worker-parallel
  emit/scatter/field — all provably order-independent, one guaranteed by
  the determinism contract itself; specialised single-block BLAKE3; run-
  filled emit path), ~0.4 s native-extreme, where the layout solver —
  correctly sequential by definition — becomes the asymptote.
- **Runtime verdict: node stays canonical; Bun declined.** It would run
  (~2 dev-only native addons) but wins ~5–10% (startup) while doubling the
  byte-identity surface the shipping model rests on. Its one draw (native
  BLAKE3) is available on node via napi/wasm.
- The real e2e wall is LLM latency (median 3 model runs × ~99k input
  tokens) — **kit slimming (WS-A/D) is the speed lever as well as the
  price lever.**
- Byte-identity discipline binds throughout: every optimization proves
  output-identical worlds (shasums vs pre-change build) — performance work
  is the one place regressions hide silently.
- **Wave-2a perf ladder (Kai-driven session "perf", own worktree, branch
  `perf/compile-ladder`; every rung shasum-identical per file on all three
  baseline docs, FULL suite as the flip gate):**
  - *Baseline corrected — troy was not representative.* troy 5.0 s
    (structures 1.4 / scatter 0.9 / emit 1.6), **thalassa 9.4 s, structures-
    bound (4.6 s)**, pirates 6.8 s, scatter-bound (2.0 s). Structures on a
    dense city is nearly a whole troy compile by itself — a read-only
    thalassa structures profile is queued (report only; structures stays
    un-edited under #27).
  - *Rung 1+2 LANDED (`c446041`, gate 5,572/0):* a single-compression
    BLAKE3 for the 44-byte position input (`determinism/position-hash.ts`,
    no allocation, no BigInt) — the cost was hasher construction and XOF
    machinery, not maths: 1123 → 243 ns/call (4.6×); scatter 3.8× on
    troy; whole compile −15 % troy / −6 % thalassa / −21 % pirates. Proof:
    27,036 positions × 9 seeds against the generic implementation, plus
    per-file shasums.
  - *Emit mechanism re-attributed:* the "16 ns/block through the palette
    API" is a **linear palette scan** in prismarine's
    `IndirectPaletteContainer.set` (12.8 ns/block at palette 1 → 35.5 at
    palette 32; a raw bit-array write is 4.1). Emit cost is coupled to how
    varied the authoring is. Next rung (Kai: run-fill only, deflate pool
    shown before built): first block of each section slice through the
    public setter, stable-container bit-packed remainder, shape-check +
    silent fallback. **LANDED (`c18c9fe`, gate 5,573/0):** emit −20 to
    −30 % (troy 1606 → 1286 ms, pirates 1602 → 1128); cumulative both rungs
    vs the 5.4 s start: **troy 3.9 s (−22 %), thalassa 8.5 s (−9 %), pirates
    4.7 s (−31 %)**. Proof: 3,600 randomised full-chunk comparisons against
    real prismarine-chunk (every block state, palette insertion order,
    bitsPerValue, solidBlockCount), 100 % fast-path hit rate on a real troy
    (2.58 M slices, 0 fallbacks), a mutation-checked replay test, per-file
    shasums ×3 docs, in-situ troy identical after the main-tree rebuild.
    Kai's guard verdict: a test asserts zero fallbacks, so a prismarine-chunk
    bump fails CI loudly while production keeps the silent fallback.
    `terrain/emit.ts` is emit code by role and was granted to the session as
    one file (bucketTrees' keys next, on Kai's go); the string chunk-key maps
    in structures/** are parked as a later orchestrator rung.
  - *Thalassa's "4.6 s of structures" was never structures*
    (docs/audits/thalassa-structures-profile-2026-08-24.md): the timings
    billed the authored programs' DECLARE half (§7.1, hoisted inside the
    structures window) to `structures` — 3.7 s of it — a report bug, fixed
    (declare time now lands in `timings.programs`). The structures pass is
    779 ms. The 3.7 s is ONE authored program, `leviathan_prime` (4.0 s,
    44 % of the compile, 34k blocks at ~118 µs/block): a Catmull-Rom sweep
    at 70 fixed steps per segment rasterising a full (2r+1)³ cube per step,
    re-filling the same voxels ~70×. **Kai's ruling (2026-08-24): program
    cost is NOT an authoring burden** — no diagnostic, no kit cost law; a
    few seconds is accepted if it keeps the author's job easy. Consequence
    for E: the compile floor for a doc with bespoke programs is set by the
    program's own code and is not a target. #27's density question answered
    NO: retaining is 30 ms on thalassa vs 497 on troy (16× cheaper on the
    dense city) — the partial-stack pattern is a correctness question on its
    own merits, with no perf case either way. roads.js (654 ms self on
    thalassa) is the largest genuine structures-side cost, unprofiled.
  - **LADDER CLOSED — Kai: "stop the ladder, bank the win" (2026-08-24).**
    Three rungs landed (`c446041`, `c18c9fe`, `dbb47fd`), byte-identical on
    three docs at every step: **troy 5.0 → 3.9 s (−22 %), pirates 6.8 → 4.7 s
    (−31 %), thalassa 9.4 → 8.5 s (−9 %, ~4.8 s honest compiler-side)**;
    scatter 3.8×, emit −20–29 %, the hash from 15.8 % of wall to ~1 %. The
    profile is now FLAT: the top self-time item in a troy compile is 205 ms
    (buildTieredSeam) and nothing else clears it; no contained win over 5 %
    remains anywhere. Two more E1 items died on contact: bucketTrees' string
    keys are 27 ms self (the 302 ms was the flora part emission beneath —
    leafDistances 98 ms), and deflate is 136 ms not 260, so the worker pool
    — the riskiest change in the ladder — would have bought ~100 ms of a
    4.1 s compile; recommended against, and Kai agreed by stopping.
    **Caveat on E1 for the record: its per-item attributions were inclusive
    times, not available wins.** Handed to WS-F unspent: roads.js 654 ms on
    thalassa; flora part emission ~250 ms; retaining 409 ms on troy vs 30 ms
    on thalassa (the density inversion #27 should explain). Worktree
    `terrainist-wt-perf` (branch `perf/compile-ladder`) is redundant and
    stands until campaign end; baselines and profiles live in the perf
    session's scratchpad.

## WS-F — Architectural inventory (the "glaring stuff" census)

One deliberate map, then a ratified kill-list — the currency rule extended
to code:

- **Flag graveyard:** every shipped-true flag whose false-path is dead
  (GROUND_V1_*, ROAD_SOVEREIGN-shadowed passes, DESCENT_SOLVE-bypassed,
  TERRACE_BY_TERRAIN-moot, STAIR_DRESS-off) — which off-paths are still
  load-bearing fallbacks (stair corpus: Kai-ratified fallback until native
  lands) vs deletable history.
- **Dead-pass census:** junction-steps (dead on both live paths),
  street-stairs/descent (silenced), terminus landings, §5 deletions the
  WP ladder already queued (G7 apron, G8 collapse, chunk-2 internals).
- **Seam map:** the glued-on joints — declare/build split, driver
  write-through, report vs emit block-list divergence (bit us today:
  the report snapshots spans before late passes), pavedSurfaces assembly,
  the two kit files vs compiler registries.
- Module size/cycle census (roads.ts >5k lines, types.ts as flag dump).
- **Task #27 probes (orchestrator, 2026-08-24) — the two E1 smells, closed:**
  - *`resolveGround` ×5 vs "1 resolve(s)"*: not a bug. GROUND-CONTRACT §1.6
    designs five resolves (four tier prefixes + the generating fifth); the
    driver counts 5 and `ground-stage.test.ts` pins it. The `LOAM-I497` note
    hard-coded `resolves: 1` since WP-G6 — fixed (report bytes only, world
    untouched). Residue for E: `finish()` forces the four prefix resolves even
    when no pass asked for a view, so the count is a design property (~110 of
    the ~140 ms `resolveGround` costs); making them lazy is a Kai-ratified
    trade (invariant-by-count vs ~2% of wall), parked.
  - *retaining.ts's refused seams*: probed with env-guarded timing wrappers on
    the built dist, troy_r22. `buildRetainingWalls` 500 ms + `finishSeams`
    218 ms inclusive (~13% of wall). 40 tiered stacks = 349 ms, of which 22
    stacks (233 ms, 67%) end PARTIAL — 10 tiers found no ground, 52 seam
    columns left uncovered (the W413 census); no stack is discarded whole, and
    derivation itself is ~15 ms (the I497 invariant is cheap). So the spend
    is real building whose result is partly unplaced, learned only after the
    stack is laid. The perf angle is ≤4% of wall; the correctness angle is
    the one that matters: those 52 uncovered columns are raw cut faces in the
    walked world — the shoulder/verge item's customer. A pre-check ("does the
    ground the stack steps onto belong to a street/footprint/water?") would
    refuse before building; whether it should refuse, re-site, or dress is a
    walk verdict.
- Deliverable: inventory doc + kill-ladder, EACH deletion Kai-ratified,
  each landing byte-identical-or-attributed like every flip before it.

## Sequencing and the parallel grind (ratified 2026-08-24)

**Wave 1 — read-only, launched first, standing caps (Kai's call: audits +
consult before ANY fixes):** B (terrain-kit audit), C (model-behavior
harness over the battery corpus), E1 (compile profile + the *hypothetical
floor* study — what extreme measures buy: worker fleets, wasm/native/zig
hot kernels, a Bun runtime switch — desk estimates anchored to the real
profile). Subagents are fine here; nothing writes to the tree. Wave 1
lands as a consolidated findings consult.

**Wave 2 — the delicate work, multi-session (Kai's design):** kit edits
(A1/A2), architecture decisions (A3), the F kill-list, and design-heavy
items run in **parallel Claude Code sessions Kai starts in this repo and
works with directly**. This session stays MASTER ORCHESTRATOR: it assigns
each session its task + file scope via inter-session messaging, keeps the
scopes disjoint (no two sessions share a file), tracks progress, and owns
integration + commits where sessions don't. No delicate task is one-shot
by a fire-and-forget subagent.

**Campaign window:** caps stay standing (4/≤2med/≤1high) through Wave 1;
Kai designs the window from Wave 1's findings before Wave 2 scales.

D follows A/C as before; E2/E3 follow E1's data; A0 (golden-prompt suite)
is the first Wave-2 item since it writes test infrastructure.

## What does NOT move during the campaign

The ratified n13 line (bare risers, STAIR_DRESS off by walked verdict),
the byte-identity staging law, the probe-before-theorize law, battery/
read-only, and the troy last-leg queue (flight object native-first with
junction cliffs as customer #1, landmark-border rule absorbing the
terrace_steps mis-siting, entry-residue trim, shoulder/verge) — parked,
not cancelled; the campaign hardens the ground they'll build on.
