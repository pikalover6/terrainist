# The kit after Phase 1 — what changed, what it cost, and what is still wrong

Filed by the kit-fix session, 2026-08-24. Companion to the two kit audits
(`settlement-author-kit-2026-08-24.md`, `terrain-author-kit-2026-08-24.md`) and
to `STOCKTAKE-v0.md` §WS-A/§WS-B. This is the account of the remediation
itself: what the kits now say that they did not, which findings survived
contact with the compiler, which did not, and what the measuring instrument can
and cannot see.

**Scope of the work:** six correctness clusters, the `LOAM-T204` fence fix, one
null result (B1, reverted), and the `terrain_conform` lever. Every item was
decided against the compiler's source, not against the audits' prose.

**Total API spend: $4.82** across 29 run directories, 100 prompt-runs and 128
authoring attempts. The harness itself (`tools/golden-prompts/`) was built
inside that figure.

---

## 1. What the kits now say that they did not

| Cluster | The kit said | The code says | Where |
|---|---|---|---|
| 1 | forest `area.radius` is "a fraction of the region radius, 0.01–1… the one that bites" | **blocks** | `terrain/validate.ts:1031-1044` |
| 1 | wilderness fill `density` 0.02–0.05 | 0.02 **is** the biome threshold; a fill at 0.03 paints the whole map forest | `vegetation.ts:86` |
| 2 | root children: 7 kinds, "Nothing else is allowed" | also district, city, 3 precincts, `infra.entry@0`, `authored:`, `scatter.program@0` | `settlement/validate.ts:330-400` |
| 2 | top level takes 6 keys | 7 — `programs` was missing from both kits | `terrain/validate.ts:189` |
| 2 | terrain root takes 4 generators | also `authored:` and `scatter.program@0` — "a monument on pure terrain is the contract's own first example" | `terrain/validate.ts:445-467` |
| 3 | "There is no `archetype` param; writing one is an error" | `params.archetype` is the **canonical** spelling; tags are the fallback | `settlement/validate.ts:2526-2536` |
| 4 | "at least one forest" (both checklists) | no forest-count check exists anywhere | `terrain/validate.ts:513-534` |
| 4 | buildings are 7–13 wide, 1–2 floors (as a global invariant) | envelope axes are integers 1..4096; tall grammar runs to 24 wide and 20 storeys | `checkFootprintSize`, `HIGHRISE_*` |
| 5 | `distance` measures **between centres** by default | **surface** — face to face | `layout/cost.ts:309` |
| 5 | era classes include `early_modern` | the class is `renaissance`; `early_modern` is an alias for it | `intent/types.ts:47,102` |
| 5 | bare `station` "belongs to nobody" | resolves to `train_station` | `archetypeOfTags(["station"])` |
| 5 | both `conform` and `pad` are "the default" seat | omitting `seat` pads unless the gate certified the program terrain-aware | `programs/validate.ts:159` |
| 6 | a bespoke landmark should be "a child of the district" | a district's children are `building.grammar@0` and nothing else | `settlement/validate.ts:698` |
| 6 | `intent` is legal at top level and on root (no precedence given) | root's intent merges **over** the top-level one, key by key | `intent/resolve.ts:99-101` |

The terrain kit also gained **§7b**, the bespoke tier, which it had previously
declared illegal. A document shaped exactly as §7b teaches was hand-built and
run through `validateTerrainDocument`: zero diagnostics. "A lone monolith on a
moor" is authorable and was not.

---

## 2. Four fenced examples were teaching errors

This is the finding that matters most, because none of it was visible to
reading and all of it was obvious to counting.

1. **The forest radius.** The examples wrote `radius: 150` in blocks and the
   table beside them called that a unit error. The examples were right.
2. **The farm example** shipped `"face": "any"` (the solver resolves horizontal
   faces only) and `terrain_conform: "drape"` (which does nothing and reports a
   warning) — two advisory diagnostics on every copy. It now validates clean.
3. **Three archetype tags built the wrong building**: `harbour_light` with
   `tags: ["lookout"]` built a *watchtower* though `lighthouse` exists;
   `the_long_house` built a *cottage* though `longhouse` exists; `assay_office`
   built a *smithy* though `assay_office` exists. Three implemented archetypes
   unreachable because the kit's own examples reached for them through a lossy
   tag.
4. **The nested `distance` shape.** Two bespoke-landmark fences wrote
   `{"distance": {"to": "camp", "max": 90}}`, which the validator rejects:
   *"target must be a selector string, got an object"*. It accounted for **29 of
   30** `LOAM-T204`s across every run in the campaign, and cost a retry round —
   a full re-send of the ~80k-token kit — on every world with a bespoke
   landmark. Two lines; `LOAM-T204` went 30 → 0.

The behavior audit predicted the mechanism: the model treats fences as the spec
and prose as decoration. The remediation confirmed it four times over, and B1
sharpened it — see §4.

---

## 3. Measured results

Verified by triplicate against a measured noise floor where the metric allowed
it. Ranges are three runs at identical kit bytes.

| Change | Metric | Before | After |
|---|---|---|---|
| Cluster 1 | `LOAM-T118` | 2 | **0** |
| Cluster 1 | forest radii < 2 blocks | 3 | **0** |
| Cluster 1 | whole-region fills painting forest | 3 | **0** |
| Cluster 1 | prompt tokens (3 prompts) | 335,531 | **246,739** (−26%) |
| Cluster 3 | explicit archetypes, troy | 0, 0, 0 | **2, 3, 3** |
| Cluster 3 | explicit archetypes, walled city | 0, 0, 0 | **3, 5, 3** |
| Cluster 3 | control (terrain-only prompt) | 0, 0, 0 | 0, 0, 0 |
| Cluster 4 | forests in a desert world | 1, 1, 1, 1 | **0, 0, 0** |
| Cluster 5 | farm example's own diagnostics | 2 | **0** |
| T204 | `LOAM-T204`, all runs | 30 | **0** |
| Conform | `LOAM-E404`, redwood ×3 | 11, 4, 10 | **0, 0, 0** |
| Conform | soft tethers written | 0, 0, 0 | **9, 10, 11** |

Two results are worth reading twice.

**The desert.** Told "nothing living on it", the model authored a forest node
named `barren_waste` at `density: 0` — obeying a checklist rule the validator
does not have, then neutering the node to comply. Four before-samples across
four different kit versions all did it; three after-samples did not.

**The conform.** `terrain_conform` was the most-demoted constraint in the corpus
(100 of 227) and it was never the fault. It carries the minimum default weight
and the kit wrote it last, and `demotionOrder` demotes lightest-first breaking
ties last-written-first — so it died first whenever a node was over-constrained
for any reason. The cause was the kit teaching hard tethers by example
**twenty-five times with not one `soft` among them**. Softening twelve fabric
tethers (and keeping eleven where the relationship is the composition) took
E404 to zero. The inversion is visible in the control: troy went 0,0,0 → 0,0,**2**
and those two are `distance` and `adjacent_to` with no conform among them —
when something must yield it is now a tether, not the building's grip on the
ground.

---

## 4. What was re-graded, including three of my own claims

The audits were written without access to the compiler and said so. Six of
their findings resolved differently once the code was read, and three errors
were mine.

- **C17 (forest radius)** — the audit blamed the examples; the code blamed the
  prose. But the sentence was not invented: it was the **`scatter.program@0`
  rule misfiled into the `scatter.forest@0` table**. Program-scatter radius
  really is a 0.01–1 fraction (`programs/validate.ts:487-494`, whose own comment
  calls it "the trap it is"). Deleting the sentence without replacing it moved
  the trap rather than closing it — which the suite caught: T118 went to zero and
  two `LOAM-T104`s appeared in its place.
- **C3 (archetype)** — the audit's "preferred architectural fix" of making
  archetype an explicit canonical field had **already shipped** with fabric v2.
  Documentation reconciliation, not an API change.
- **C3's opera sub-claim** — the example was said to violate its catalog entry.
  It violates nothing the compiler enforces: floor caps apply to the high-rise
  table only, and the catalog's "envelope that works" column is guidance. The
  example stands.
- **C18 (`distance` measure)** — called a self-contradiction to be resolved by
  choosing a side. One side was simply right: the default is `surface`, and the
  set-piece passage saying "measured to the node's edge" had been correct all
  along.
- **Mine: the slope story.** I reported that a probe showed slope never demotes
  a conform. The probe read `res.diagnostics` from `compileTerrain` — **a field
  that does not exist**. It was an empty read reported as a measurement. The
  conclusion survived re-testing (37 demotions, 13 of them conforms, identical
  at `maxSlope` omitted / 55 / 30) but the evidence had been worthless. It was
  caught only because a control that could not fail returned zero too.
- **Mine: the B1 metric.** `setPieceDominance` was pre-registered and stable
  (before-spread 0.04) and still measured a narrower thing than claimed: troy
  documents contain only 2–3 `building.grammar` nodes, because the fabric comes
  from district `mix`, which carries no envelopes. "Median building" was never
  "ordinary house".
- **Mine: B1 itself.** A fence teaching a dominant civic set-piece returned a
  null — the set-piece grew 45% and the median building grew 46%, so relative
  prominence did not move. The fence said in prose "an ordinary house is 9–13 on
  a side" and the model wrote 15–19 houses anyway. **A fence teaches the number
  it contains, not the ratio it illustrates; to teach a ratio, fence both
  sides.** The fence was reverted byte-exact.

---

## 5. What the instrument can and cannot see

`tools/golden-prompts/` is the regression harness for kit edits, and its limits
are load-bearing:

- **Vocabulary metrics have a large noise floor.** At temperature 0 on identical
  kit bytes, a settlement prompt's archetype count moves by 4 and its archetype
  *set* is only ~35% stable; `kitLiteralEnvelopePct` swings 7.7 points. `score.mjs`
  knows these numbers and prints `within noise` beside any delta that fails to
  clear them. Several deltas reported early in this campaign were re-rolls, and
  are corrected in the record.
- **Compile-time diagnostics are invisible to it.** Runs are authoring-only, so
  `LOAM-E404` reads 0 in every scoreboard whether or not the world demotes
  anything. Measure those by compiling the authored documents and counting from
  `res.report.diagnostics` — free, seconds each. Recompile both sides in the
  same pass; the compiler moves.
- **Stable enough to read at n=1:** node counts, form packs, generators,
  document bytes, attempts, cost, and diagnostic counters tied to the bytes that
  changed.

---

## 6. What is still wrong

- **A2/A3** — the kit is still ~280 KB re-sent on every call. Nothing in this
  work reduced it; four clusters added net text. Slimming and dynamic assembly
  are their own wave.
- **B1(b)** — the civic set-piece is still not built. The kit route is measured
  and null; the harness route (the proposal turn asking for the civic centre as
  its own line item) is untried, and the before-state is captured in
  `runs/b1-before-*` with `b1-metric.mjs` to score it.
- **`LOAM-T008` on `metropolis_hideout`** — an invented `prop.place@0` param
  recurs across three byte-states and costs that prompt a retry round. Not yet
  probed. The golden records store diagnostic codes but **not messages**, which
  is why it is still a mystery; persisting messages would have answered it.
- **The write-order tiebreak.** `demotionOrder` breaks weight ties by
  last-written-first, so the order constraints appear in an array silently
  decides which one dies. The conform lever works *with* that behaviour rather
  than depending on it, but it is a design smell of the kind WS-F exists to
  retire.
- **16 of 100 conform demotions in the corpus** had only one hard constraint on
  the node — a second, smaller population that over-constraint does not explain.
- **The terrain kit's `maxSlope` guidance** still recommends 26–34, entirely
  below the default of 35, so every value it suggests tightens the veto. Left
  alone deliberately: it is accurate as far as it goes, and the demotion
  question turned out not to be about slope at all.

---

## 7. The pattern

Every one of the four fence defects was invisible to prose review and obvious
the moment something counted what the model actually emitted. The audits could
not have found them; the suite found four by accident while looking at something
else. Three plausible causal stories — the misfiled radius rule, the opera
"violation", the slope theory — died on contact with a probe, and one of the
three was the prober's own.

The working rule this produced, and the one worth carrying into A2/A3: **read
the code before the prose, count before believing, and build the control that
can fail.**
