# Cell 3 — the pull saga's finish and the stocktake's first week (2026-08-22 → 08-24)

(The ground saga's first half — the POC, ROAD_SOVEREIGN, the n6 lesson — is
in cell 2.)

## The pull saga's finish, n13 ratified, the stair saga (08-22 → 08-24) — compressed from cell 4

Full record: docs/SESSION-HANDOFF-2026-08-23.md. Kai (08-23): "that
essentially just solved it… the most coherent troy generation ever" —
**n13 IS the line**: y = round(drape + pull·(n5_arc − drape)); grade =
max(longitudinal P95 over 13, cross-fall across the road's own width)
[PULL_CROSS — the axis three curve ladders missed; probe found a 7-wide
road with 10-block cross-tilt at pull 0.04]; raw = smoothstep(t·(1+BOOST
2.2·t^POW 2)); field = max(movavg9, upper envelope) [PEAK_KEEP] + flat
closing over 21 [CLOSE, in pullField AND phase 1b after junction pooling]
+ 1/6 ramp; backstop min(1, pull/SAT .7); TREAD 1 (n12 decks 2/2.5/3,
pick open); one pooled pull per junction plane; sidewalks blend at own
column; sovereign items (drape oracle, mask+headroom, borders) ride the
blend. Ladder n7 f5ef2a3 (orphans 2,591→9) → n8 b0d2e14 → n9 60d6626
(the closing) → n13 a063804 (cross; street cliff census 141→26 troy /
143→20 hellenist — the shelves WERE the census). freeze/troy-iter-
{7,8,9,13}; suite 5,566/0 at every flip; flats byte-still; riser law 0
violations. Decks: trojan_horse_troy_n13 = THE deck; n10_* and
troy_rootpoc* dead. **THE POC IS DEAD** (ratified 08-23; status header on
COHERENT-SOURCE-v0; absorbed: one ground author = drape oracle; coherence
at source = the verdict; verify court = probe discipline). Shipped flags
TRUE: GROUND_V1_{RANKS,SEAMS,FREEZE}, ELECTION_SOLVE, TERRACE_BY_TERRAIN
(moot), STREET_PLANE_HARMONIZE, FACE_FINISH, DESCENT_SOLVE (bypassed under
sovereign), ROAD_SOVEREIGN, ROAD_PULL, PULL_CROSS; PULL_* levers per the
handoff §1.

**Stair saga (08-24, complete):** Kai: purpose-build a native flight
object for the insane conditions rather than patch an ordinary stair
generator; two-track, native GATED on a dressing-pass demo. STAIR_DRESS
shipped (a5e4573 neutral, 26637a4 flip, 3c78232 cull fix): road-risers.ts
swaps every honest 1-riser top course for a stair facing the rise;
ledge/crest/flooded/occupied refuse. LESSON: enforceRoadSovereignty ate
all 818 stairs (not in ROAD_SOVEREIGN_OWN_EMITTERS — the street-lamp scar
relearnt; the report's blockSpans snapshot diverges from the emitted
world). n14 walked STAIRLESS; n14b (freeze/troy-iter-14b) was the real
demo. Gate PASSED, then **taste retired it** (Kai: stairs "read as
stairs" and feel less natural than bare voxel risers) — STAIR_DRESS=false,
code kept as flight vocabulary, undressedCutoffs 88→70→88 with full
attribution. **Box (72,88,-95) diagnosis** (probed + blinded Gemini
concurred): cut08 descends 1:1 then falls 5-6 into cut07's junction plane
— junctions pool PULL not LEVELS → the flight object's customer #1;
cut07's bend quantizes 2-4 block inter-tread cliffs on the raster;
terrace_steps missited at region edge (209,-255), 41/95 no-stand → folded
into the landmark-border rule. **E2E control** trojan_horse_in_troy_e2e1
(fresh Gemini spec, seed 1184, $0.34, OpenRouter credits unblocked)
installed vs the r22 overfit worry. Ladder debt parked: chunk-2 internals
→ G7 (walk-gated) → G8 collapse; troy W413, quay 118, S8 crown, levelNear
§7.1, glow-lichen lint, side branches (packs d3d4193, freerect 24cb2c1),
§15.1 + W337 + dev-app.

## The stocktake's compiler week (08-24) — compressed from cell 4

**Task #27 (e792d16):** resolveGround ×5 = §1.6 design (four tier
prefixes + the generating fifth); I497's hard-coded resolves:1 fixed
(report bytes only). Retaining probe (env-guarded wrappers on the built
dist, troy): 40 tiered stacks 349 ms, 22 PARTIAL (233 ms; 10 tiers
unplaced, 52 columns uncovered — the shoulder/verge customer); on
thalassa retaining is 30 ms, so it is a correctness question with no perf
case either way. **Perf ladder (Kai-driven session "perf", own worktree
terrainist-wt-perf / perf/compile-ladder, CLOSED by Kai "stop the ladder,
bank the win"):** three rungs, byte-identical ×3 docs at every step, FULL
gate each — c446041 single-compression position hash (1123→243 ns, hash
15.8 %→1 % of wall), c18c9fe run-filled fillColumn (prismarine's linear
palette scan was the "16 ns/block"; first block per section slice via the
public setter, stable remainder bit-packed, shape-check + silent
fallback), dbb47fd zero-fallback CI guard (Kai's pick). Result troy
5.0→3.9 s, pirates 6.8→4.7, thalassa 9.4→8.5 (~4.8 honest): profile FLAT
(top self 205 ms); E1's per-item numbers were INCLUSIVE (bucketTrees 27
ms self, deflate 136 ms). Thalassa's "4.6 s structures" = the programs'
declare half mis-billed (timings fixed 88adae5); 3.7 s = ONE authored
program (leviathan_prime re-filling voxels 70×) — **Kai: program cost is
NOT an authoring burden** (no diagnostic, no kit law). Unspent → WS-F:
roads.js 654 ms on thalassa, flora parts ~250 ms, retaining density
inversion. Vitest rule loosened (AGENTS.md): heavy runs one at a time,
light targeted runs overlap.

## Wave 2a's briefs and coordination rules (08-24) — compressed from cell 4

Three Kai-driven sessions briefed by SendMessage with disjoint scopes:
**kit-fix** = docs/kits/** + spec/test/kit.test.ts + tools/golden-prompts/
(A0 golden suite first, then audit clusters); **menus** = packages/agents/**
+ a new stdlib registry-export + cli catalog/generate seam (opaque-string
menu as a second system message, flag OFF = prompt-identical); **perf** =
stdlib/determinism + compiler/emit in its OWN worktree, every rung
shasum-identical ×3 baseline docs with the FULL suite as the flip gate.
Rules: sessions never commit or git add (shared index); targeted vitest
only, FULL scheduled by the orchestrator; subagent cap shared; Kai's
in-session answers override the brief; code bugs found by kit sessions
come to the orchestrator (large → one opus subagent). Learned in flight:
freeze the kit around any LLM measurement and pin one runner blob per
triplicate; install harness edits by atomic rename; the log renderer
must be pinned to this session's transcript (--transcript) because the
parallel sessions share the project directory.
