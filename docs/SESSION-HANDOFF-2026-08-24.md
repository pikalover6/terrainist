# SESSION HANDOFF — 2026-08-24 — The Great Stocktake, day one

Written before a context compaction at Kai's request: "I don't want you to
lose anything from this session." This is the commit-anchored record of the
whole day. Prior epoch: `docs/SESSION-HANDOFF-2026-08-23.md` (the road-pull
saga; n13 ratified). Branch `claude/project-upgrade-planning-uwlziw`, HEAD
`cd7db32` at writing; all work committed; working tree clean.

## 0. How to resume

1. Read `CLAUDE.md` (two new laws today), `AGENTS.md` (vitest rule loosened).
2. Read `docs/STOCKTAKE-v0.md` — the campaign plan, rebased on measurement,
   carrying every Wave-1/2a verdict inline — then
   `docs/STOCKTAKE-WAVE-2B-v0.md` (ruled: B1 now, B2 = A3 next wave).
3. Evidence: `docs/audits/` (settlement kit, terrain kit, model behavior,
   compile perf, thalassa structures profile, **kit-remediation** — kit-fix's
   own account), `tools/golden-prompts/runs/` (29+ run directories).
4. Decks: `docs/decks/` — one folder per installed world (document, generate
   log, compile diagnostics, WALK-CARD). Six worlds on the `k1` channel are
   installed and **await Kai's walk**; he holds judgement until all are walked.
5. Fine state: `.claude/memory/cell-4.md`. Session log artifact (rendered,
   never hand-written; pin `--transcript` to this session's jsonl):
   https://claude.ai/code/artifact/7c312d44-f26b-4108-b98b-127a1a12cdab
6. The three Kai-driven sessions (`kit-fix`, `menus`, `perf`) have all stood
   down at clean stops. If Kai starts new ones, brief them by SendMessage
   (ListAgents finds them by name), scopes disjoint, sessions never commit.

## 1. Kai's directive and the rulings of the day (all Kai-ratified)

- **The pivot:** weeks of surface sprinting left slop; audit the kits, watch
  model behavior against the catalog, optimize price, make the finished world
  fast ("a few seconds — is that insane?"), inventory the glaring stuff —
  deliberately and in parallel, with Kai stepping through delicate work in
  his own sessions while this one orchestrates. No delicate task one-shot by
  a fire-and-forget agent.
- **Wave order:** four read-only audits first (subagents allowed), then a
  consult, then Kai-driven sessions; campaign window designed by Kai.
- **Sessions step with Kai** — "not one-shot without pausing": propose a
  step, wait for his go, do it, show it, stop. Popups per step. If Kai is
  idle the session is idle.
- **No teaching around bugs** (CLAUDE.md law): a kit finding that is a code
  bug is fixed in code FIRST (orchestrator-owned; large → one Opus subagent;
  small/medium the orchestrator does inline), then the kit teaches what the
  code does. Kit sessions stop the cluster and report file:line.
- **Vitest rule loosened** (AGENTS.md): heavy runs (FULL suite, compiler-
  package) one at a time with `--maxWorkers=4` and the 8 GB heap flag; while
  one runs nobody rebuilds dist in that tree, regenerates baselines, or
  starts another compiler run; light targeted runs overlap freely.
- **Measurement standard:** 3 repeats × N prompts at fixed kit bytes; the
  noise floor is measured; `score.mjs` prints `within noise`; collect the
  before-samples BEFORE the bytes move; recompile both sides in one pass;
  a compile-time diagnostic is invisible to the authoring-only suite.
- **Program cost is a non-goal:** "I'd rather not burden llm authors with
  having to optimize, a few seconds wasted is fine if it makes their job
  easier." No diagnostic, no kit cost law, no fuel tightening.
- **Perf ladder stopped:** "stop the ladder, bank the win" once the profile
  went flat. Node canonical; Bun declined.
- **Menu:** era tier DROPPED (580 shown / 0 adopted); flag stays OFF "not yet
  — after the era tier is fixed" (it now is; the flag remains off until
  revisited). Region-scope consult DEFERRED to A3 (B staged behind A).
- **Forest C3:** code is right (the 0.02 coverage gate is F20's calibration);
  both kits teach the line.
- **Wave 2b:** B1 (citadel) now, B2 (A3 dynamic assembly) next wave with its
  own session and window. B1(a) returned null → (b) is agents-side, later.
- **Conform lever:** teach `distance` soft in the fences (kit-only).
- **Compiler bug #1 (farm):** fix it myself inline (Kai's pick over a
  subagent). **Bug #2 (sea bench):** "Never grade a submerged bench."
- **Fresh worlds:** "generate now" (troy k1), then "generate 5 more worlds,
  intelligently diverse and illustrative, your judgement" — and "hold final
  judgement until all five are walked."

## 2. Wave 1 — the audits (docs/audits/*, all committed at 04633eb)

- **compile-perf-2026-08-24.md (E1):** compile = 5.4 s, not minutes (my
  premise was wrong by 40× — the minutes were `generate`'s LLM loop). Emit
  31 / structures 27 / scatter 18 / layout 9 %; BLAKE3 15.8 % of wall; floors
  2.7 → 1.25 → 0.4 s with the layout solver as the sequential asymptote.
  Caveat added after the ladder: its per-item numbers were INCLUSIVE.
- **model-behavior-2026-08-24.md (WS-C):** parroting confirmed — 84 % of docs
  use kit-spelled vocabulary only; envelopes 84 % kit-literal; reach 147/722
  catalog, 99/428 archetypes; 6/7 form packs at 0 %; 170/175 never-spelled
  archetypes never used; ONE hallucination in 50 docs → **reach is retrieval,
  not capability; fenced examples ARE the spec**. Citadel: acropolis_terrace
  0× ever; 9/10 troy rolls an archetype-less box; landmark budget chases the
  prompt noun 11/11. Price = loop cost ($0.34/world; 3 model runs × 99k
  tokens; T118 units = 53 % of retries).
- **terrain-author-kit-2026-08-24.md (WS-B):** correctness pass only; the
  silent forest-density bug; C1 root whitelist; C2 biome key; and the C17
  re-grade: forest radius is BLOCKS in code (validate.ts:1031-1044).
- **settlement-author-kit-2026-08-24.md:** Kai's independent audit (22
  correctness findings) — the input; several later re-graded from the code.
- **thalassa-structures-profile-2026-08-24.md** (perf, Wave 2a): the "4.6 s
  of structures" was one authored program's declare half mis-billed; timings
  fixed (88adae5); leviathan_prime re-fills voxels 70× → non-goal by ruling.

## 3. Wave 2a — the three sessions

### perf (closed; worktree /Users/kaihoward/Dev/terrainist-wt-perf, branch perf/compile-ladder @ a1ed187, redundant, standing until campaign end)
- c446041 single-compression BLAKE3 position hash (1123 → 243 ns; hash 15.8 %
  → ~1 % of wall). c18c9fe run-filled fillColumn (prismarine's per-block
  linear palette scan was the "16 ns/block"; first block per section slice
  through the public setter, stable remainder bit-packed, shape-check +
  silent fallback). dbb47fd zero-fallback CI guard (Kai's pick).
- Every rung shasum-identical per file on troy_r22 / thalassa_polis /
  pirates_vs_unicorns; FULL gate each (5,572/0, 5,573/0); in-situ re-check
  after main-tree rebuild. Result troy 5.0 → 3.9 s (−22 %), pirates 6.8 → 4.7
  (−31 %), thalassa 9.4 → 8.5 (~4.8 honest). Profile FLAT (top self 205 ms).
  bucketTrees keys 27 ms self, deflate 136 ms — retired. Unspent → WS-F:
  roads.js 654 ms on thalassa, flora part emission ~250 ms, retaining 409 ms
  troy vs 30 ms thalassa.

### menus (closed)
- 4f8f325 registry export (`packages/stdlib/src/structures/registry-export.ts`:
  buildCandidateMenu / candidateMenuForIntent / renderCandidateMenu);
  9d5c004... 9d92789 agents seam (`AuthorRequest.candidateMenu` opaque string,
  second system message after the kit; off-state proven deep-equal to the
  pre-feature array); b638439 CLI seam (`packages/cli/src/candidate-menu.ts`,
  `TERRAINIST_CANDIDATE_MENU`, `--candidate-menu/--no-candidate-menu`,
  `terrainist catalog --menu --era --packs --max`); 5893621 the tier-2 cut
  (named-pack-only, ~1k tokens).
- Measurements (all at frozen kit bytes, runner blob pinned): 136020e (11×11
  pair, $1.29) reach unmoved at n=1, pack-member uses 5 → 16 with three
  corpus-firsts, five prompts chose the familiar generic id over the handed
  pack id → **retrieval necessary, not sufficient; the fenced example
  supplies the binding**; params.archetype vanished under the menu (the kit's
  :1464 prohibition). 55ca8e1 (3×3 at the cluster-3 kit, $0.31): troy pack
  uses OFF 3/5/5 → ON 11/11/11, pithos_store/trireme/votive_column (0/50
  corpus) 3/3; explicitArchetypeParams held (pre-registered prediction);
  walled 0/0/0 = the era tier's defect (a European town offered a torii).
- 82216ce region-scope consult (`docs/INTENT-REGION-SCOPE-CONSULT-2026-08-24.md`):
  two-place prompts empty world scope BY INSTRUCTION; nothing structural
  reads `region_*` tokens; A/B deferred to A3.
- Probe-before-spend catches worth remembering: the env var the harness never
  read; the baseline one kit behind.

### kit-fix (closed; write-up docs/audits/kit-remediation-2026-08-24.md)
- 85420f7 A0 golden prompts (`tools/golden-prompts/`: prompts.json 11
  prompts, run.mjs authoring-only with cached pre-pass and per-call records,
  score.mjs with the floor, test-census.mjs, README with the method rules)
  + cluster 1 (units: T118 2 → 0; the deleted "fraction" sentence was the
  scatter.program rule misfiled — taught the split; both kits teach the 0.02
  forest-biome line). 2c77126 cluster 2 (root union; terrain §7b bespoke tier
  fenced). 258892f the scorer's floor (archetype set 35 % stable; parroting
  floor 7.7 pts; √n). 0e17fd0 cluster 3 (params.archetype canonical since
  fabric v2; 18 fences gain it; three had built the WRONG building:
  harbour_light→watchtower/lighthouse, the_long_house→cottage/longhouse,
  assay_office→smithy; first floor-clearing claim, 3×3). 8cb1578 cluster 4
  (no forest-count law exists; desert forests [1,1,1,1]→[0,0,0]; envelope
  half suggestive only). 1493b50 cluster 5 (SURFACE is the default distance
  measure — every spacing in every doc was off by half an envelope; era class
  renaissance; farm example's two diagnostics → zero). cb8106d cluster 6
  (galleon is a water prop; "when in doubt, write the program"; prominence
  law no longer teaches a district-child landmark validate.ts:698 rejects).
  1b0e72d T204 (two bespoke fences wrote the invalid nested distance form —
  29/30 T204s; 30 → 0; pirate and troy author one-shot). ad97580 B1(a) NULL
  ($0.47: "a fence teaches the number it contains, not the ratio it
  illustrates; to teach a ratio, fence both sides"; metric flaw recorded).
  34ad114 the conform lever (12 tethers soft / 11 hard where the relationship
  is the composition; redwood E404 11/4/10 → 0/0/0; "never slope, never
  maxSlope, never terrain_conform — the kit taught hard tethers 25× with no
  soft"). e8b5f38 runner resume fix (re-author ok:false; --keep-failures).
- Re-grades from the code: audit C17 (radius = blocks), C3 (archetype fix
  already shipped; opera "violation" unenforced), C18 (surface default);
  kit-fix's own: the slope probe's empty read (`res.diagnostics` does not
  exist — use `res.report.diagnostics`), B1's narrow metric.
- The pattern, in their words: every fence defect was invisible to reading
  and obvious to counting; four plausible causal stories died on contact with
  a probe, one theirs, one mine.

## 4. The compiler bugs the fresh troy found (both fixed, byte-identity-staged)

- **#1 farm.ts forced the fifth resolve** (bafb179): `buildFarms` called
  `input.ground.finish()` in the declaring half (a WP-2 line from 08-09 that
  outlived G6); the doorstep walk (tier D) then tripped the §1.6 ordering
  guard the first time a holding met a stepped doorstep. Fix: the pass
  computes its entitlement privately — `resolveGround(baseline,
  input.ground.intents, {generate: staged, built})` — the same value finish()
  returned there; no seal, five resolves stay five. alien_farm_town and troy
  byte-identical; FULL 5,622/0.
- **#2 a mostly-water bench graded to the sea bed** (b268220 neutral, 771cbe4
  flipped, `SUBMERGED_BENCH_UNGRADED`): the quarter election derived a bench
  over a bay (its 69 columns were ALL water in the pristine), the waterline
  floor exempted it as mostly water (the river-channel exemption), and a pad
  edit over water DRAINS it → a dry trench at 61 against the sea at 63
  (LOAM-T110). The bench stays in the election and in `levels` (a bench with
  a level is what keeps lots and verges out of the water — dropping it dammed
  the river fixture 8,647 → 7,098 wet columns); only its `quarter.plane` pad
  edits are withheld; `LOAM-I526 PLATFORM_SUBMERGED` names each. Triage: river
  fixture intact; troy / thalassa / alien_farm identical; pirates moved by
  exactly 43 columns of sea-fill restored, identical warnings — attributed;
  pirates' ground-probe baseline re-pinned (pad ids renumbered by 4, four
  fewer quarter.plane intents, 15 fewer plane-owned columns, no ground value
  moved). FULL 5,621 + the attributed re-pin.
- **Third item, pre-existing, WS-F:** a sealess river ponded (T112) leaves
  unstable water (T110), terrain-only (kit-fix's redwood; also T112 on three
  of the five new decks without T110). Candidate kit teaching: steer a
  sealess world away from a river — measure before touching.
- Also: e792d16 (#27) I497's hard-coded `resolves: 1` → the driver's counter;
  retaining probe (22/40 tiered stacks partial on troy; 52 columns
  uncovered) — a correctness question, no perf case (30 ms on thalassa).
  de8381b the phantom `style.biomeThemes` hint removed.

## 5. The decks (all installed on the k1 channel; docs/decks/*)

| deck | prompt / seed | notes |
|---|---|---|
| trojan_horse_troy_k1 | Troy horse, 303 | authored ONE-SHOT; never had compile-feedback rounds (the generate crashed on bugs #1/#2); bay is sea; freeze/troy-k1 @ 771cbe4 |
| montfort_hill_k1 | walled medieval city, 311 | `archetype: keep`, `params.walls`; hillside form's replan dissolved 4/5 frontage strips → 5 houses inside a full circuit wall (Kai's screenshot); 8 lots / 36k cells |
| alien_farm_invasion_k1 | alien farm town, 302 | 2 holdings / 10 parcels (bug #1's path clean), 4 infra.entry, 3 programs (harvester hovering +36), 15 named buildings |
| hellenist_sea_siege_k1 | modern Hellenist + sea monsters, 305 | city of 4 cells, harbour precinct, leviathan wading, tentacles with a FRACTIONAL radius, 23 buildings / 85k cells |
| overgrown_metropolis_hideout_k1 | high-tech hideout in ruins, 304 | 74 buildings 24–76 tall (cluster 4's evidence), decline 0.9, 3 programs, T008 lead recurred |
| pirates_vs_unicorns_k1 | two islands at war, 301 | two districts, 4 programs, galleon afloat at y 63, region tokens and no world-scope pack |

Density table (lots per 10k envelope cells): troy 19.7, montfort 2.2,
hellenist 3.2 — **the open question for the walk.** Montfort's is the
hillside replan on a rounded dome; hellenist's the invasion's decline.
Kai's instinct request was answered at the mechanism level only; judgement
held until all are walked. Left for a next pair: redwood_camp (the conform
lever's prompt; ⅓ chance of the sealess-river T110 abort) and glowcap_vale.

## 6. Open items, in order of leverage

1. Kai's walks of the six k1 decks; verdicts through the client log.
2. **A3 (next wave, own session + window):** core kit + per-pack EXAMPLE
   modules selected by named pack on the committed seam; inputs: the binding
   finding, the region-scope consult (B behind A), the copy-mode side effect
   (+9 pts envelopes under a reference message), "fence both sides of a
   ratio"; the kit is still ~280 KB and is the latency AND the bill.
3. **B1(b):** the proposal turn asking for the civic centre as its own line
   item (agents-side); before-state in runs/b1-before-1..3 + b1-metric.mjs.
4. **T008 lead:** unknown prop param keys (hideout_solar/turbine; metropolis
   lost an attempt) — recurring across byte-states; probe the record schema.
5. **WS-F seeds:** roads.js 654 ms; flora part emission; retaining's 52
   uncovered columns (shoulder/verge's customer); the write-order demotion
   tiebreak (`demotionOrder` last-written-first among equal weights); the
   ponded-river lip; `radiusBlocks`/`radiusFraction` rename; the 16/100
   single-constraint demotions the tether story does not explain; A2 kit
   slimming untouched; the terrain kit's maxSlope band.
6. Parked, not cancelled: flight object native-first (junction cliffs
   customer #1; stairs are architecture, never road texture), landmark-border
   rule (+ terrace_steps), entry-residue trim, shoulder/verge, n12 tread pick,
   WP ladder #10, pirates GO, catalog go-ham side branches.

## 7. Coordination protocol that worked (reuse it)

Kai starts named sessions; the orchestrator briefs by SendMessage with owned
files / exclusions / no-subagents / do-not-commit; sessions report units with
file lists + test COUNTS; the orchestrator commits with single-sentence
subjects. Freeze/thaw the kit around any LLM measurement (state the sha);
pin one runner blob per triplicate; install harness edits by atomic rename
between runs; FULL gates run where the code under test lives (perf's
worktree for compiler rungs); cherry-pick -x from session branches; in-situ
shasum check after a main-tree rebuild. The log renderer must be pinned with
`--transcript` (parallel sessions share the project directory).

## 8. Spend

Campaign LLM spend: $4.82 (kit/menus measurements, 29 run directories, 100
prompt-runs) + ~$1.30 (six decks) ≈ $6.10. Compiles are free.

## 9. Scratchpad map (session-specific; will not survive the machine)

`/private/tmp/claude-501/-Users-kaihoward-Dev-terrainist/2b841858-0cd5-4ee7-a91f-8948e9e8b722/scratchpad/`:
`k1/` (the fresh troy: out/, worlds, probes shore.mjs / bench-count.mjs /
river-probe.mjs / worlddiff.mjs, gate logs, k1.report.json), `decks/{pirate,
alienfarm,hellenist,walled,metropolis}/` (out/ + generate.log + WALK-CARD),
`perf/` (E1 profile + scripts), `behavior-audit/` (WS-C scripts), `b3/`
(demotion-census.py), `probe27/`, `gate-perf1/`, `gate-perf2/`.
Everything durable is under docs/ and tools/golden-prompts/runs/.

## 10. Commit ladder (04633eb → cd7db32, oldest first)

e792d16 #27 · 701e5c9 funnel + bug-first law · de8381b biomeThemes · 09f2ec4 ·
c446041 perf rung 1 · b90ff32 · 4f8f325 menus registry · d2b2ab4 · 8611b1a
renderer pin · f69df0c vitest rule · 103a992 · 9d92789 menus seam · c18c9fe
perf rung 2 · 6308884 · dbb47fd guard · 443eb37 · 88adae5 timings · f81e027
ladder closed · 85420f7 A0 + cluster 1 · ebd1da0 · f46dfd9 · b638439 CLI seam
· f703ca8 · 2c77126 cluster 2 · 3affa95 · a0d725d · 258892f floor · 5d4ef2b ·
b768535 · 6e4b261 · ffe0c88 · 136020e menu measured · ee8b705 · f3d158b ·
82216ce region consult · 0e17fd0 cluster 3 · f1a2c04 · a6bd394 · 55ca8e1
re-measure · 615c6be · 1a89c5e · e8b5f38 resume fix · 9d5c004 · b053db5 ·
5893621 tier-2 cut · 6ce2190 · e891c43 2b consult · a312255 · f00a4ad ·
b3c9cee · f0eaa5e · 6250eeb · 8cb1578 cluster 4 · 67af915 · 8fb8eef · 6420ce9
2b ruled · 41d590f retraction · f0fb2c9 · a8cda5e census · 1493b50 cluster 5 ·
c1b32e3 · c5cd596 · ec08f67 · cb8106d cluster 6 · 218512c · 4152ea7 · e8dc564
· 1b0e72d T204 · cc86558 · ad97580 B1 null · a485515 · bafb179 farm fix ·
b268220 bench neutral · f3c30de · 34ad114 conform lever · f860c37 · 855b6a0
write-up · 771cbe4 bench flipped · 2d5c34b troy_k1 deck · 01aafac · b5d3821
five decks · cd7db32.
