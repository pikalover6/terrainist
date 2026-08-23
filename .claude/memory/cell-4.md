# Cell 4 — current state (2026-08-22, walk loop live)

**READ FIRST: docs/SESSION-HANDOFF-2026-08-22.md** (this epoch's full
commit-anchored record; prior epoch docs/SESSION-HANDOFF-2026-08-20.md;
Kai-readable overnight narrative docs/TROY-RUN-2026-08-21.md).

**LIVE — ROAD_PULL SHIPPED** (Kai's ratified blend off the n6 walk,
2026-08-22, docs/ROAD-PULL-v0.md): y = round(drape + pull·(n5 − drape)),
pull = the terrain's own verdict (P95 grade rate, 13-block window,
smoothstep 0.25..0.75, movavg9, ramp 1/6/block), pull-weighted Lipschitz
backstop, one pooled pull per junction plane, sidewalk blends at its own
column. Implies ROAD_SOVEREIGN (drape oracle, supremacy mask, borders,
NO stairs — all ride the blended levels). Landing 3db7da8 byte-identical.
REPORT CARD MEASURED: hillside orphans 2,591->9, street cliff pairs
328->156, kerb tails 94->48, stairs 0. Deck **trojan_horse_troy_n7**
installed. RETUNE (Kai's n7 verdict "very steep still too weak",
2026-08-22): three levers, neutral-landed then flipped — PULL_BOOST
.66 (t·(1+B·t), authority compounds with steepness), PULL_PEAK_KEEP
(max(movavg, upper envelope) — cores hold 1), PULL_SAT .7 (backstop
full-strength from .7). Stations at pull=1: 9->42(boost)->97(full);
flats byte-still; risers>1 at pull≥.5 always 0. Decks n8 + n8b
(boost-only control). N9 RETUNE (Kai's n8 verdict: x=200 avenue's
mid-climb bench hands terrain back; "steepen the tail"): PULL_BOOST_POW
2 + BOOST 2.2 (tail-only steepening, t=.3 unchanged — probe proved
curve alone CANNOT fix the bench, grade there honestly ~.35) +
PULL_CLOSE 21 (flat morphological closing; run TWICE — in pullField
AND phase 1b after junction pooling, because the bench's north wall
IS the pooled junction plane, absent at field-build time). Street now
solid-saturated junction->crest; deck at1 97->156; flats byte-still;
202 cols ±1-3. Deck **trojan_horse_troy_n9** (commit 60d6626,
iter-9). Steep-fixture debts scale with the dial: buried 99, plinth
34, one 25-deep sheer face; troy shows class only as ~5 flank cols at
7-11. LAW: never run baseline regen + FULL suite concurrently (the
harness races the file). N10 CANDIDATE TRIPLET IS DEAD — measurably
identical to n9 (saturation axis has no headroom; Kai may delete the
three n10_* saves). Kai's verdict on n9: right direction, more still
→ n11 entry ladder (RF .20/.16/.12, 80-172 cols) → Kai: strongest
barely beats weakest; moderates were always fine, EXTREME slopes
under-pulled. DIAGNOSIS RATIFIED BY PROBE: pull=1 there since n9 —
the 1:1 grade ceiling of the graded profile IS the terrain's shape
(stairs banned), so pull-field knobs stopped mattering. NEW LEVER
PULL_TREAD (9f04bb6, neutral 1 byte-identical): committed roads climb
1 riser per TREAD blocks, float-relax + capped integerize (cap binds
only pull≥.5 — honest flat steps pass whole). **n12 triplet
installed** (n12_{weakest,balanced,strongest} = TREAD 2/2.5/3,
uncommitted states): riser metronome emerges, 289/584/676 cols moved
vs n9, max div 8-11, risers>1 zero, flats byte-still. TREAD 3
feasibility bite: cut00 junction end lifted +2 (1:3 margin ~0 on a
25/78 climb) — expect a junction step. Await pick. NAMED DEBTS for the walk:
plinth zero-bar broke on audit fixtures (steep 8-col proud run), steep
fixture reachability .997->.928 (hillside is the win), buried 7->40 on
flights (unfeathered cuts — blendShoulders still silenced), junction
ownership step (1 riser-2 on troy), election lip at (108,89,-194)
unchanged/out-of-scope. Sovereign arc: a16276f/1c479b3, iter-6. Prior:
DESCENT_SOLVE on 59d9a4a, iter-5. Coherent-source path stands:
rootpoc_v3, COHERENT-SOURCE-v0, verify court. **PIRATES STAGED
AWAITING GO** (6b52fe3). r23 authoring credit-blocked (Gemini only).

**Shipped flags TRUE:** GROUND_V1_{RANKS,SEAMS,FREEZE}, ELECTION_SOLVE,
TERRACE_BY_TERRAIN(moot), STREET_PLANE_HARMONIZE, FACE_FINISH,
DESCENT_SOLVE (bypassed under sovereign), ROAD_SOVEREIGN, ROAD_PULL.
The rewrite's end state holds: resolves=5, written-vs-resolved 0,
equivalence at ZERO allowances, Kai's verdict "for the first time,
roads and buildings are (mostly) integrated with terrain."

**The loop:** deep-probe latest deck → station walk card → chat-log
parse → targeted probes → popup consult → ratify → capped agents →
FULL-suite gate → flip commit → deck _nN + freeze/troy-iter-N branch.
Massively-overdo-analysis is doctrine; blinded Gemini on iso renders;
beware 1-column ASCII slice misreads (twice).

**QUEUED BY KAI (2026-08-22, next/later generation — DO NOT build yet):**
ban bespoke artifacts (authored landmarks, e.g. the horse) within 10% of
world size (side-to-side measure) of the world border; the horse sits at
the edge today, so the placer needs logic to find an entirely new spot
far away.

**Ladder debt:** chunk-2 internals (preflip-g6/README) → G7 (apron
deletion + natural-blend, ratified, walk-gated) → G8 collapse. Open:
troy W413 7-8 geometry-residual, quay 118, S8 crown (builder-side),
levelNear §7.1, glow-lichen lint gap, side branches (packs d3d4193,
freerect 24cb2c1) unmerged, §15.1 + W337 + dev-app, funnel compression
debt (cells over budget — distill on next quiet pause).

**STANDING:** caps 4/≤2med/≤1high; delegation economics; implementers
opus-5-low default; orchestrator commits, single-sentence subjects;
probe-first; byte-identity staging + flip triage; screening install-
anyway; popups liberally; NEVER-WAIT; never --replace (--channel/
--series to the Prism saves path in AGENTS.md); battery/ read-only;
one vitest --maxWorkers=4 heap-flagged, FULL suite at gates; regen
baselines on the merged tree; agents never spawn agents; walk-taste
lands only on Kai's verdicts.
