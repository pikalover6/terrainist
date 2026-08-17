# Cell 3 — the Gemini era (2026-08-14 → 08-17)

## The Gemini arc (2026-08-14 night → 08-15) — compressed from cell 4

- **Walk-feedback fixes ratified+shipped:** leaf contact everywhere
  (structureBoxes leafInset:1 — leaves to the wall face, wood keeps the
  ring, roads clip all; 82b94db) and **bespoke facing** (LOAM-SPEC §15.1,
  ecb162f): canonical front = local −Z declared by a `front` anchor
  (doubles as road approach); doc-level `face:{toward|away_from:<sel>}`;
  90°-snap rotation of coords+states at placement, outputHash local-frame;
  no anchor → never rotated (reach law); W518 never fatal; mutual toward
  binds via pre-fit estimates. CLAUDE.md rewritten current-info-only
  (bridge section gone; Prism path + never-replace → Ground rules).
- **Gemini 3.7 Flash evaluated** (Kai: cheap-bespoke candidate). Full-gen
  head-to-head (seed 301): Luna $0.079 clean vs Gemini ~$0.59-0.75, 2/3
  programs dropped. Bespoke gauntlet (4 identical briefs, flat plain,
  seed 401): Luna 4/4 $0.14; Gemini 1/4 $0.49, never passed round 1 — BUT
  Kai's walk: Gemini's war elephant "miles ahead"; ungated rerun proved
  drops were mechanical (braces/lanterns/chain), $0.16 for all three.
  Reasoning split (now a Usage line item, 1e9cd44): Luna ~90% of out,
  Gemini ~50%. VERDICT ARC: reliability failures were mostly HARNESS.
- **Harness reshape (Kai's rulings, all shipped):** instrumenter
  auto-braces bodies — style lint deleted, 54 sites were the #1 killer
  and the contract never mentioned braces (0defed0); sandbox keeps
  `envelope` bound; chain→iron_chain auto-rename IN parseBlockString —
  copper-age rename, one chokepoint or none (261c231, 1cae641 after the
  emit-only fix stranded $0.50); gate leniency: structural/nonsense/
  physics-findings/clip demoted to warnings via SUSPENDED_GATE_CHECKS,
  fatal = static/determinism/limits/unresolvable (c9bc0c7, §15.2);
  "no site would take" → W337 warning; canonical programSourceHash in
  spec (two divergent hash impls — per-line vs whole-string trim — a
  TRAILING SPACE broke a world). Result: Gemini e2e ships everything
  (isles_of_war_gem37-v2, flagship 3,530 blocks, $0.50).
- **Gemini-as-fuzzer:** two latent compiler bugs Luna's shapes dodged:
  wandering colossus (at-region vetoed by BUILDING slope rule on its own
  41° bluff + junk `facing` constraint walking the node; W519 ignored-
  constraint warning, facing inert on landmarks, W520 landmarkCoarseSeat
  — declared ground beats a slope-only veto; f948fdb) and sunken
  sidewalks (segment-id collision ns0/ew0 across districts → sidewalks
  paved at the OTHER island's level; qualifySegmentId(graphPath), "!"
  separator, battery byte-identity proven; 424b18c). gem37-v3 walked:
  Kai got the thesis shot — colossus on its bluff facing the pirate town.
- **Harness outline artifact** (Kai's voxel-gen comparison study):
  https://claude.ai/code/artifact/f12c83ed-7bee-4125-bda5-9ddf16e9854e
  — contract verbatim, five-step gate, economics, failure taxonomy,
  reshape ladder. Kai studying; further reshape NOT ratified.
- **Ops lessons:** implementers default opus-5-low (Kai correction —
  tiers price residual judgment, not size); one vitest per agent,
  --maxWorkers=4 (53 stacked workers made the laptop choppy); parallel
  batch runner tools/battery/generate-batch.sh (32f2230; throttle bug:
  jobs -rp in a subshell never engages — all 7 launched at once, fix
  pending).

## The autonomous run (2026-08-17, Kai away) — compressed from cell 4

Armed by four rulings (look latitude; leniency PERMANENT, study closed;
machinery tail un-deferred + THE GO-HAM RULE; battery regen once at
end). Everything landed, all pushed:
- **Viewer rounds 3-4**: cross-plants (hash-nudged off the lattice),
  Minecraft walk controller (physics.js, node-tested), landing demo
  end-to-end, then the SHADER PACK — texel-snapped shadow cascade +
  PCF, bloom (HalfFloat composer), god rays (sky=depth-1 occlusion),
  fresnel swell water, wind via per-vertex flags, ACES grade, seeded
  cloud shadows, quality toggle whose off is a different program.
  Verified live on GPU; tuned by eye (sun 1.35, bloom thr 1.25 —
  sunlit birches bloomed like lanterns at 0.9). Ops lessons: no-cache
  serve.mjs (worker module-cache split killed the frame loop);
  drainUploads degrades instead of dying; flipY row-mirror garble
  (atlas verification must check an off-centre unambiguous row).
- **Machinery tail CLOSED**: family B (4 faces via retaining.seam
  declareRun branch; slipway→water side); §13.2 resolved (the tension
  was a conflation; rank 25 = "a line whose own surface something
  walks onto"; resolver unchanged); viaduct SHIPPED per §13.2f with
  seven §13.2g implementation notes incl. the pre-existing
  preserve/tie E494 contradiction → WP-6 ledger.
- **THE GO-HAM ERA: six packs, 91 structures, zero words stolen.**
  nordic_viking 16, mesoamerican_jungle 15 (59ea2e5); dwarven_volcanic
  15 (NO FIRE law), steppe_nomad 15 (14944b2); swamp_witch 15 (stilts,
  curb-before-water, the mud-tempted pack that must not have it),
  atlantean 15 (all-compound ids, the tide as a line; 6b2828f).
  Catalog: 676 rows, 389 building archetypes, 15 packs / 235 members.
  All exhibited in devworld (norse/mesoam cb80458, dwarven/steppe
  2036c89, swamp/atl following). LAWS BANKED for every future pack:
  standInRow (free() and put1() are different questions); the shell
  lights a campfire in 1-storey >5×5; pin arithmetic pre-agreed with
  a named owner; rename+aliases+negative-sweep; curbed basins claim
  before they pour; the middle of a room is the door's approach; a
  made-up id in a test is a name reserved by accident; API-529 deaths
  resume cleanly via SendMessage.
