# Cell 3 — the pull saga's finish and the stocktake's first week (2026-08-22 → 08-24)

(The ground saga's first half — the POC, ROAD_SOVEREIGN, the n6 lesson — is
in cell 2.)

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

## The kit ladder, clusters 1–5 (08-24) — compressed from cell 4

A0 golden prompts 85420f7 (11 prompts; $0.64/~20 min per pass; kit sha in
every record). Cluster 1 (units): T118 2→0, forest radius = BLOCKS, the
deleted "fraction" sentence was the scatter.program rule misfiled → taught
the split with a fence; both kits teach the 0.02 forest-biome line (Kai:
code is right). Cluster 2 2c77126: root union matches validate.ts; terrain
§7b bespoke tier fenced ("teach it, it's real capability"). NOISE FLOOR
($0.31, 3×3): archetype set 35 % stable at temp 0; parroting floor 7.7
pts; score.mjs `within noise`; clusters 1–2 archetype deltas withdrawn.
Menu measured twice ($1.29 then $0.31): reach unmoved at n=1 but troy
pack uses 3/5/5→11/11/11 with three corpus-first ids 3/3 at the cluster-3
kit; five prompts chose the familiar generic id over the handed pack id
→ retrieval necessary, not sufficient; fenced examples bind. Cluster 3
0e17fd0 (first floor-clearing claim, 3×3): params.archetype canonical
since fabric v2, kit had forbidden it; 18 fences gain it; three had built
the WRONG building (harbour_light→watchtower, the_long_house→cottage,
assay_office→smithy). Cluster 4 8cb1578: no forest-count law exists;
desert forests [1,1,1,1]→[0,0,0] across four kit versions; envelope half
suggestive only. Cluster 5 1493b50: surface is the default distance
measure (kit taught centre); renaissance is the class; farm example's two
diagnostics → zero. Region scope: two-place prompts empty world scope by
instruction (consult 82216ce, deferred to A3). Era tier killed 580/0;
WS-A2 closed 5893621. B3: slope story retracted; conform = demotion
order's first casualty; 92/100 also lost a second constraint (hard
distance tethers).
