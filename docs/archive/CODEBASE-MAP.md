> **Archived 2026-08-20.** A one-off cartography pass compiled 2026-08-10 — pre-ground-rewrite, pre-Gemini-authoring-switch; line/test counts and the model row are stale. Kept as a historical map; docs/DESIGN.md and docs/GROUND-MACHINERY-AUDIT-2026-08-20.md are current.
# Terrainist — Codebase Map

> Text prompt → Minecraft world `.zip`. An LLM authors a deterministic spec language (**Loam**); a TypeScript compiler turns Loam into a Java Edition world. Cartography compiled 2026-08-10 from source + `docs/DESIGN.md`; interactive version: `CODEBASE-MAP.html`.

## 0. Vital statistics

| | |
|---|---|
| Stack | TypeScript monorepo (npm workspaces, pnpm), Node ≥ 22, ESM, project-referenced `tsc -b` |
| Source | 6 packages, **~154.6k lines** / ~280 files (`spec` 9.5k, `compiler` 84.7k, `stdlib` 49.7k, `render` 2.4k, `agents` 4.1k, `cli` 3.3k) + 69k lines of tests |
| Emit target | Java 1.21.11, **DataVersion 4671** (newest the prismarine stack supports; client auto-upgrades) |
| Determinism | BLAKE3 (`@noble/hashes/blake3.js`) + position-keyed draws; no wall-clock, no unseeded randomness in the compiler |
| Verification | 27-rule physics lint read back off disk, walkability + dressing audits, byte-identity goldens, ~2,900 tests |
| Model | GPT 5.6 Luna (`openai/gpt-5.6-luna`) at effort `max`, temp 0, via OpenRouter; GLM 5.2 one flag away |
| Language | Loam v0.2, JSON canonical (JSON5 accepted), two profiles: `terrain`, `settlement` |
| Branch | `claude/project-upgrade-planning-uwlziw` (working tree clean) |

**Package dependency matrix** (imports of `@terrainist/*`, counted in `src/`):

| from \ to | spec | stdlib | compiler | agents | render |
|---|---|---|---|---|---|
| spec | — | — | — | — | — |
| stdlib | 1 | — | — | — | — |
| compiler | 79 | 110 | — | — | — |
| render | 1 | — | 3 | — | — |
| agents | 5 | — | — | — | — |
| cli | 2 | 2 | 8 | 5 | 2 |

DAG: `spec` (leaf) → `stdlib` → `compiler` → `render`; `spec` → `agents` → `cli`; `cli` depends on everything. External deps: `@noble/hashes` (blake3; stdlib/compiler/agents), prismarine stack (`minecraft-data`, `prismarine-chunk`, `prismarine-nbt`, `prismarine-provider-anvil`, `vec3`) — all `require()`d version-keyed inside `compiler/src/emit/prismarine.ts`; `pngjs` (render). deepslate is heritage only.

## 1. The system in one paragraph

`terrainist generate "<prompt>"` runs: **intent pre-pass** (cheap classifier, fail-open) → **document authoring** (Luna, kit as system prompt, validation retries) → **bespoke program authoring** (proposal → five-step gate → ≤3 repair rounds) → **wiring check** (are programs invoked?) → **compile** (deterministic TS pipeline) → **author-actionable diagnostics → ≤N revision rounds** → **zip + persisted `<name>.loam.json` + `<name>.report.json`** → **install** into Minecraft saves (with `--channel`). The compiler never sees absolute coordinates: authors write envelopes, constraints, ports, zones; a layout solver places everything.

Two properties are the moat and every design decision defends them:
1. **Determinism** — same document + seed → byte-identical world, forever, no model in the loop. Every random draw is seeded `hash(worldSeed, nodePath)`; three wall-clock leaks (chunk `LastUpdate`, region timestamp sector, `level.dat` `LastPlayed` at install) are pinned/zeroed.
2. **Correctness** — a 27-rule physics lint reads the emitted world back off disk and refuses findings: no floating blocks, no doors into walls, no unreachable stairs, no unstable fluid.

## 2. The compiler pipeline (10 stages)

Everything ordered; every stage's seed = `hash(worldSeed, nodePath)`.

1. **Parse + validate** — profile validators (`settlement`/`terrain`) in `spec/`; diagnostics carry a model-usable `fix` hint. ~200 `LOAM-*` codes (T0xx warnings/info/errors) in `spec/src/terrain/diagnostics.ts`.
2. **Resolve intent** — deep merge along node path (`compiler/src/intent/resolve.ts`); the fan-out registry (`intent/fanout.ts`) turns dials into concrete knobs once, recorded in the report. Rows are registered through one seam (`intent/seam.ts`) by the subsystem they drive; every row is **total** (no intent ⇒ byte-identical to pre-intent).
3. **Terrain field** — heightfield + editable verbs composed into one `HeightField`, evaluated once (`stdlib/src/edits`, `field`); hydrology (open basins, pond chains), climate (temperature/humidity fBm), caves (subtractive carver).
4. **Layout solve** — `layout/solve.ts`: greedy document-order candidate insertion over a seeded pool + bounded local improvement. Constraints are hard domain restrictions or normalized soft costs; **relaxation ladder**: drop optional nodes → demote coarse hard constraints → demote other hard constraints → place least-bad + `UNSATISFIABLE` (reported, never silent). `padFor` emits `PadEdit`s composed into the master heightfield.
5. **Fabric** — arterials → district cells (`layout/city.ts`) → street skeletons per **urban form** (`layout/forms/registry.ts`: `grid`, `organic`, `grown`, `radial`, `canal`, `linear`, `axial`, `hillside`, carriage-spine; `terraced` deleted 2026-08-08, aliases to `hillside`) → blocks → lots → terraces → frontage-aligned buildings, prominence field for skyline, vistas closing axes on landmarks.
6. **Structures** — the ~18-step `buildStructures` pass (see §4.3): buildings, ruin field, tunnels, plaza, retaining, courtyards, canals, streets, streetscape dressing, roads (A*), farms, props, doorsteps, junction-steps, finish-cut faces, grounds decay, set pieces, walls, life pass, green-skin.
7. **Authored programs** (pass 5d) — hash-verified, sandboxed execution of model-written bespoke programs into ordinary structure blocks (§8).
8. **Ground, streetscape, life, set pieces** — ground treatment, sidewalks/furniture, eye-level life pass, vista set pieces.
9. **Clearing, scatter, biomes** — vegetation clip, forest scatter (Poisson-disk + strata), biome paint + land-use clamp.
10. **Validators → emit** — readback validators (physics lint, walkability, dressing), then Anvil write (`emit/write.ts`: clean region dir, chunks saved in (z,x) order, zeroed timestamps, hand-built `level.dat`).

## 3. The ground contract (WP-1→WP-5 shipped, WP-6 pending)

**The rule: nothing may modify the ground after the ground is decided.** Eleven passes used to write `plan.ground` after materialisation (roads, precincts, canals, sweep, streetscape, street-stairs, retaining, props, plaza, doorsteps, courtyards) — every ground defect between 2026-08-04 and 08-06 was a collision in that pile (sidewalks re-levelling graded streets up to 7 blocks, retaining coping overwritten, kerb inside a ground floor, aprons ramping away seams, 84% of hill-town faces skipped).

Three phases replace it (`compiler/src/layout/`):
- **Declare** — every pass emits `GroundIntent { source, kind, columns, transition }` as data, mutating nothing. Kinds: `platform | profile | face | clearance | preserve`; transitions `ramp | step | wall | none`. Each pass already computes this; it just applied it immediately before.
- **Resolve** — `ground-resolver.ts` reconciles every declaration into a frozen final ground: **precedence is explicit and total** (`INTENT_RANK`, ~17 classes; ties break on stable key — pure function of the declaration set), conflicts that cannot be reconciled become **diagnostics naming both claimants**, transitions are generated once from drop+run and every consumer reads that decision.
- **Build** — everything places blocks against a frozen plan (`readonly` = type error, not convention).

Mechanics: `GroundDriver` (`layout/ground-driver.ts`) accumulates intents at each pass's pipeline position and re-resolves the whole prefix per commit; the **WP-2 equivalence shim** (`ground-equivalence.ts`) compared resolver vs mutating pipeline (caught 3 declarer bugs, tolerated inversions I1–I7) — the safety net for the rewrite. `GROUND_MATERIALS_BY_THEME` (12 ground roles: pavement, kerb, tread, revetment, coping, plinth, weep, balustrade, stairs, slab, bank, scree) lives in `terrain/palette.ts`.

## 4. Package deep-dives

### 4.1 `spec` — Loam types & validation (9.5k lines, leaf)

Owns what is *legal to write down*. **Deliberately executes nothing** (sandbox/fuel/hashes/gate live in compiler/agents). Hand-rolled validators (never schema-driven) so every rejection carries an LLM-targeted `fix` hint.

- `terrain/` — `TerrainDocument`, node types (`HeightfieldNode/EditNode/ClimateNode/ForestNode/CaveNode`), vocabularies (`PROFILE_GENERATORS`, `ZONE_TOKENS`, `EDIT_VERBS`); ~200-code diagnostic catalog `TERRAIN_DIAGNOSTICS` + `formatDiagnostic`.
- `settlement/` — `SettlementDocument`, `StructureNode/PropNode/PlazaNode/DistrictNode/CityNode`, ports, farm params; imports terrain validators wholesale and adds the v0.2 constraint vocabulary: `CONSTRAINT_REGISTRY`, tier split (TIER1/TIER2), canonical/shorthand forms, `PRIMARY_ARG`/`DEFAULT_STRENGTH`/`DEFAULT_WEIGHT` tables; archetype vocabulary restated from stdlib with Levenshtein near-miss suggestions (`KNOWN_BUILDING_ARCHETYPES` 226, spec-side mirror of stdlib's 441-entry catalog).
- `intent/` — `SemanticIntent` dials: `era` (open string → closed `EraClass` via alias table), `wealth`, `decline`, `formality`, `event {kind,severity,recency}`, `climate`, `character` (label, material theme, palettes, archetype/prop/flora bias, motifs, program requests). Legal at root/composite/district/city — never on a leaf.
- `programs/` — `AuthoredProgramRecord`, `ProgramMap`, `ProgramApi`, `InteriorVolume`; `PROGRAM_LIMITS`, `PROGRAM_MODES`, `SEAT_POLICIES`; **static lint** (`lintProgramSource`: banned globals/members, brace-less bodies, top-level state, export shape) — gate step 1; pending-program requests (`intent.character.programs`).

### 4.2 `stdlib` — curated deterministic generators (49.7k lines)

Pure voxel half; no `minecraft-data`. Determinism core (`stdlib/src/`): BLAKE3 seed derivation + position-keyed draws + `xoshiro256**` RNG (`determinism/`), pinned transcendentals via a 15° trig table / `ctx.math` (a test **forbids** `Math.*` transcendentals in dist), noise stack (`noise/`: gradient lattice → fBm/ridged → domain warp → continentalness; erode), `HeightField` (`field/`), 8 terrain verbs + hydrology + level pads (`edits/`), slope/surface classification (`classify/`), subtractive cave carver emitting CSR air spans (`caves/`). Terrain entry: `buildTerrainField` (`index.ts`).

`structures/` (44k lines) — the voxel grammars:
- **`building.grammar@0`** — `core.ts` owns SHAPE (footprint/walls/roofs/stair/cellar; `LocalVoxelOp`; the `rotateOps` family rewrites coords AND direction-bearing props in one place). 24 `archetypes-*.ts` wave files own CONTENTS: each exports `*_BUILDING_ARCHETYPES` + `*_ArchetypeOfTags` + `*_FacadeDefaults` + `furnish*`, all aggregated by `archetypes.ts` (priority dispatch: tall/dug/watchtower first, greedier tables last). `archetypes-civic.ts` is the shared fit-out layer (`FitOutContext`, floor-plan/walkability guard, `furnishExtended/furnishWing/furnishUpperFloors`). `themes.ts`: `pickTheme` + seeded Fisher-Yates material deal over wood×roof product → `styleOf` symbol→block map; `MODERN_CITY`/`WHITE_QUARTZ` by-name-only (avoid rerolling golden worlds). `highrise.ts` (switchback stair core, curtain wall, setbacks), `terrace.ts` (N bays sharing party walls, cornice snap, shopfront band), `underground.ts` (crypt/catacombs/vault/wine_cellar/mine + wave-6 styles). `decay.ts` = the **decay engine** (RUINS-PLAN: `crumbleWalls/breakRoof/spill/green/rubble`, `WEATHERED_VARIANTS`) — decay runs **last** in `furnish()` (RUIN LAW). `support.ts` = shared support vocabulary (needsGround/canSupport; used by physics lint's walking agent too); `greenery.ts` = multi-face growth vocabulary.
- **`prop.place@0`** — `props.ts` + 7 prop-wave files + 3 transport families: `PROP_GENERATORS` is the single lookup. 12 street + 12 wayside + fairground + 15 blitz + energy (wind turbine/solar) + spectacle (ferris wheel/bandstand) + 7 relic monuments (standing stones, henge, burial mound) + aircraft (`ringCells`/`ellipseRadius` integer conics; airliner→zeppelin) + ships (longship→houseboat, shared hull/mast/sail helpers) + railcraft (locomotive + rolling stock).
- **`catalog.ts`** — human/author/CLI registry: 441 entries, **345 implemented** (status field is the only claim; validated against live registries by `test/catalog.test.ts`). `terrainist catalog --json` reads this.
- Generators are pure `(params, seed, style, footprint) → LocalVoxelOp[]`; block **names** not state ids (compiler resolves via `PrismarineStack.blockStateOf`).

### 4.3 `compiler` — the pipeline (84.7k lines, 169 files)

**`terrain/` (14.3k)** — `columns.ts`: `ColumnPlan` intermediate model (`ground[]/surface[]/subsurface[]/fluidKind[]` typed arrays, tens of MB); `compile.ts`: `compileTerrain/compileValidated` orchestrates the whole 10-stage pipeline; `biomes.ts`: `biomeForColumn`, `PROFILE_BIOMES` (+20 intent-only rows widened F21), snow-consistent biomes; `landuse.ts`: `clampLandUse`, **BAYER_8 per-stored-cell dither** (Anvil stores biomes 4×4×4 — per-column dithering loses 15/16 decisions), ambient vote; `climate.ts` + `climate-intent.ts` (temperature-gated snow with altitude lapse, `SETTLEMENT_GREENERY`, `GREENERY_BY_ERA`); `clearing.ts` (convex-hull settlement clearing, wobble); `clip.ts` (`StructureClip`, `MAX_CLIP_FRACTION`); `cluster.ts` (slope-aware material clustering); `decorate.ts` (ground cover/undergrowth/shore/water plants); `detail.ts` (position-keyed integer avalanche hashing `hash3i/hashPick`); `emit.ts` (`emitTerrain`: `fillChunk`, `paintBiomes` 4×4×4, `punchCaves`); `vegetation.ts` (`scatterForests`: jittered Poisson-disk, `FOREST_COVERAGE_DENSITY=0.02`, strata composition with emergent budget); `validate.ts` (`checkFluidStability`, `checkFloatingVegetation`).

**`terrain/flora/` (2k)** — the **flora grammar**: deterministic shape programs (`SHAPE_PROGRAMS`: conifer, blob, broadleaf, giant, ancient, columnar, umbrella, weeping) over shared builders (`walkLimb/mass/plate/curtain/capWood`); 17-entry species registry (13 naturalistic + 4 legacy re-expressed list-identically); vertical strata (emergent giants budgeted first, canopy, understory, floor); six grammar-level laws (the **reach law**: a document that doesn't ask for new flora compiles byte-identically); `LEAF_STATE_POLICY` flip landed (live decay); `LAW2_REACH`, `CLIMATE_STRATA` tables.

**`layout/` (26.9k)** — solver (§2 stage 4): `solve.ts` (`solveLayout`, `buildCandidates`, `padFor`, `referenceY`, `demotionOrder`), `cost.ts` (constraint evals: zone/at/distance/adjacent_to/facing/connected/along/on; `ALONG_ELONGATION`), `fitness.ts` (terrain cost: `FLATNESS_WEIGHT=0.55`, `SLOPE_WEIGHT=0.45`), `frames.ts` (coarse placement: zone grid, `jitteredZonePoint`, `hairpinLandings`, `TRIG_15`/`TRIG_SCALE=4096`), `corridors.ts` (route corridors, `CORRIDOR_RESERVATION_COST=0.35`, `DEFAULT_CORRIDOR_WIDTH=7`), `ports.ts` (face→world position/normal under yaw), `products.ts` (coastline/ridge/peak point sets for `on:`), `levels.ts` (level platforms/seams: `RETAIN_MAX=6`, `RETAIN_RAIL=3`, `MIN_RETAIN_RUN=6`), `platforms.ts` (`derivePlatforms`, `MIN_PLATFORM_COLUMNS=9`), `prominence.ts` (skyline field: `W_CORE=0.56, W_FRONTAGE=0.14, W_SPIKE=0.16, W_CLUSTER=0.09, W_NOISE=0.05`), `vistas.ts` (`MAX_VISTAS=3`, `SET_PIECE_MAX=6`), `city.ts` (`buildCityPlan` armature→cells, `MIN_CELL_AREA=420`), `district.ts` (fabric F1: street graph→blocks→lots→landmarks→terraces→infill; `STEP_RELIEF`), `courtyards.ts` (`MIN_COURT_SIDE=9`, `COURTYARD_FILL=0.8`, `PASSAGE_HEAD=4`), `streets.ts` (`StreetGraph`), plus `forms/` (registry + 8 form implementations, `hillside.ts`: `MIN/MAX_PRINCIPAL_STREETS=2/4`, `STRIP_DEPTH_MAX=28`, `TERRACE_RISE=RETAIN_MAX`; `carriage-spine.ts`: `SPINE_GRADE_RUN=6`, `SPINE_WIDTH=5`, switchback router; `contour-lines.ts`: `boxBlur/dilateMask/componentsOf/doubleSweep`), the ground-contract quartet (`ground-contract.ts` types+`INTENT_RANK`, `ground-resolver.ts` `resolveGround`, `ground-driver.ts` `AccumulatingDriver`, `ground-equivalence.ts` shim), and `intent/` (`resolve.ts` merge semantics: scalars replace, objects merge, **arrays replace whole**; `fanout.ts` registry; `seam.ts` single wiring point).

**`structures/` (33.2k)** — `index.ts` = `buildStructures` orchestrator, ~18 fixed steps: theme deal + intent fan-out → buildings → ruin field → tunnels → plaza → retaining → courtyards → canals → district streets (`surfaceStreetGraph`) → streetscape → roads (`buildRoadNetwork` A*) → farms → props → doorsteps → **junction-steps** (gated to multi-level ground; bounded-Lipschitz reconciliation of finished paving: `MAX_JUNCTION_LIFT`, `MAX_SEAM_THICKNESS`) → `finishCutFaces` → grounds (F2 decay: `decayCoverage`, vegetation reclaim) → set pieces (C4) → walls (`infra.wall@0`, gates found at road crossings) → life (C3 frontage density, awnings/balconies, Planter occupancy) → green-skin (WP-6: surface index, vines, colonizer, `greenSkinShares`). The **`SweptProfile` engine** (`sweep.ts`, ~1.6k lines) serves roads, retaining, bridges, public stairs, canals and walls: bands (carriageway/kerb/walkway/deck/core/parapet/footing/ditch) swept along a polyline over real terrain; **ArcFrame** = datum on stations sampled one block of ground or one step of path along the true line (kills the √2-per-block chessboard dither); **tread law** `need[k] = max(g[k]+1, need[k+1]−1)` backwards decides where steps go, slabs/stairs are decoration over it; **band membership = perpendicular distance to the true line** with `thickenCourse` bridging diagonal courses (sawtooth kerb → coping line); **no later pass re-levels a column the surfacer owns**; `MAX_TREAD_CUT=4` recessed stairways; `terminusLandings` for verge openings. `street-owner.ts`: `StreetRank` total order `(−width, roleRank, kindRank, id)`, `claimColumns`, `pinLevel` (ownership decides geometry; painting keeps its own order). Also: `retaining.ts` (`faceCuts` revetment, `finishCutFaces`), `street-stairs.ts`, `streetscape.ts` (F4: sidewalk band, lamps, crossings, kerbside kit era-gated), `profiles.ts` (shared BRIDGE/STAIR/CART/CANAL/RETAINING profiles), `buildings.ts` (grammar client: rotate/translate ops, foundation skirt, apron), `precincts.ts` (airport/harbour kits), `plaza.ts`, `doorsteps.ts` (`DOORSTEP_REACH`), `courtyards.ts`, `canals.ts` (fluid.channel claim), `tunnels.ts`, `bridge.ts` (spans/piers), `walls.ts`/`wall-course.ts` (24×15° support-hull polygon, walkEdge ring), `life.ts`, `setpieces.ts`, `grounds.ts`, `farm.ts` (F17: `precinct.farm@0`, rank-125 parcel claims), `ruin-field.ts` (per-column ruin field from decay), `green-skin.ts`, `vocabulary.ts` (registry grounding of intent free strings), `themes-intent.ts`/`farm-intent.ts` (fan-out rows), `ground-declare.ts` (remnant shadow declarers).

**`emit/` (6.9k)** — world writing + the verification trio:
- `prismarine.ts` — typed adapter over the prismarine stack; `loadPrismarine`, `WORLD_MIN_Y=-64`, `WORLD_HEIGHT=384`, `EmitChunk/Anvil/PrismarineStack`, region read/write NBT helpers. All CJS libs `require()`d version-keyed.
- `write.ts` — shared deterministic Anvil write (G1 spike, Loam terrain, and Terrarium all funnel here): clean region dir, chunks saved sorted (z,x), **zeroed chunk timestamps** (`timestamps.ts`), hand-built `level.dat` (`level-dat.ts`: DataVersion 4671, spawn compound, namespaced game_rules, void-superflat WorldGenSettings, `DEFAULT_BIOME='minecraft:plains'`).
- `world.ts` — G1 spike `emitWorld` (palette → blockstring states → fill loops → connections → write).
- `connections.ts` — two-phase recompute of fence/pane/wall/rail connection states over the finished chunk map (so real emit and physics gate agree on fences).
- `growth-fixup.ts` — re-derive vine/lichen/sculk_vein attachment faces against composed world; drop cells with no legal face.
- `blockstring.ts` — parse `minecraft:oak_stairs[facing=north,half=top]` → name+props.
- `block-entities.ts` — sign/command-block entities + block↔entity correspondence tables.
- **`physics.ts` — the 27-rule lint** (`PHYSICS_RULES`, physics.ts:207-237), full list in §6.
- `walkability.ts` — pedestrian-network audit (§7).
- `dressing.ts` — dressing audit (4 defect classes the graph misses: floating slabs, sunken lamps/cutoffs, junction-pass stairs, plinth roads, step soil/relief, sheer built faces).

**`programs/` (2.9k)** — the bespoke tier (§8). **`exhibits/` (4.4k)** — the devworld exhibit grid: `types.ts` (`DevExhibitCell/DevExhibitRow`, `DEV_THEMES/DEV_ROOFS`), `seeds.ts` (seed-sweep rows), `breakpoints.ts` (structural thresholds derived from exported core constants), `footprints.ts` (L/T multi-rect), `context.ts` (hand-written ground strips), `archetypes.ts` + per-topic rows (arcana, faith, industry, …), prop-exhibit builders; ~38 files mapping archetype lists to labelled devworld rows.

### 4.4 `render` — headless renderer (2.4k)

Two pure-Node paths, both reading the **emitted Anvil world back off disk** (never the in-memory document):
- **PIPELINE A** — `renderTopDown` (`top-down.ts`): opens region files via compiler's prismarine adapter, two passes (surface+y-range, then paint), hill-shaded one-pixel-per-column map, deterministic bytes. Used by `render` command (G1 structural render).
- **PIPELINE B** — `worldToGrid` (`world-grid.ts`) → dense `VoxelGrid` (Uint16Array cells, block palette, per-column biome palette) → vendored voxel renderer (`voxel/`: `isometric.ts` 2:1 dimetric rasterizer with exact hidden-cell removal + cutaway clips, `orthographic.ts` floor-plan/section/top-down, `views.ts` world/structure views, `canvas.ts` software RGBA8 canvas + 5×7 bitmap font, `png.ts` dependency-free PNG encoder) → `renderIsometric/renderFloorPlan/renderSection/renderWorldViews/renderStructureViews`.
- Color: `voxel/palette.ts` `BLOCK_APPEARANCE` (Java 1.21) → `block-colors.ts` (FNV-1a hashed fallback) → `applyBiomeTint` (`biome-tint.ts` hand-tabled vanilla tints keyed from `biomeNamesById`). Known gap (DESIGN.md): biome tinting long absent — why grass-seam defects were invisible in renders; now partially hand-tabled.

### 4.5 `agents` — LLM orchestration (4.1k)

Depends **only** on `@terrainist/spec` + `@noble/hashes` — never compiler/stdlib. Six tracks:
1. **Substrate** — `openrouter.ts` (tiny client, 3-armed retry: network-shaped failures only; `EmptyContentError` vs `OutputBudgetError` via `finish_reason:"length"`), `config.ts` (`AUTHORING_MODEL_ID="openai/gpt-5.6-luna"`, `GLM_MODEL_ID="z-ai/glm-5.2"`, temp 0, effort max, `MAX_AUTHOR_ATTEMPTS=3`, `MAX_COMPILE_ROUNDS=2`, `PROGRAM_AUTHOR_MAX_TOKENS=120_000`), `env.ts` (forgiving `.env` parser, keys never logged).
2. **Kits** — `kit.ts` loads system prompts from **`docs/kits/settlement-author.md`** (~217KB, default) / **`terrain-author.md`** at call time; kit examples validated by `spec/test/kit.test.ts` against the same bytes the model sees.
3. **Intent pre-pass** — `intent-prepass.ts`: one cheap classify call (`MAX_INTENT_ATTEMPTS=2`), **fail-open** ("a classifier that cannot classify must not stop a world"), `--intent <json>` replaces it, `--no-intent` skips.
4. **Authoring** — `author.ts`: validation-retry loop (`runAuthorLoop`), `trimRevisionConversation` (superseded rounds collapse to one marker line — cut revision cost ~10×), `pinCallerValues` (worldSeed/size re-pinned and re-validated after success).
5. **Bespoke programs** — `program-author.ts`: proposal → `authorProgram` → five-step gate → ≤3 repair rounds; **spend stop** `DEFAULT_BESPOKE_BUDGET_USD = 1.00`, budgets `landmarks = clamp(round(3·A/512²), 3, 12)`, `plugins = clamp(…, 3, 6)`; `hashSource` = BLAKE3 (`b3:` prefix) frozen into the doc; **total**: transport/gate failure degrades to stdlib, never breaks the world. `program-gate.ts` is an **injected seam** (`ProgramVerificationGate`) — the real five-step gate lives in compiler; the CLI injects `compilerProgramGate`. `program-wiring.ts`: orphan-program detection + one focused revision (`WIRING_MAX_ATTEMPTS=2`) — the "invasion-p1" backstop.
6. **Deprecated** — `tripo.ts`/`tripo-config.ts` (Tripo3D mesh client) **DEPRECATED 2026-08-08** (superseded by Luna bespoke generation); `asset-lock.ts` (content-addressed `assets.lock.json`, LOAM-E311) stays as the artifact that confined mesh nondeterminism.

### 4.6 `cli` — composition root (3.3k)

`index.ts` = USAGE string + `main()` switch; each command a runner. **`generate.ts`** = full product path (`parseGenerateArgs`, `seedFromPrompt` BLAKE3, `authorAndWriteDocument` → compiler → feedback loop → `persistGenerateArtifacts`). `feedback.ts` = `FEEDBACK_CODES`/`PHYSICS_LINT_CODES`, renders compile/solver/diagnostic feedback for the model. `install.ts` = `installWorld` (default saves dir, `--channel`, `stampLevelDat` **the sole wall-clock read**, `assertNotOpenInMinecraft` via lsof). `provenance.ts` = `gitProvenance` (rev-parse HEAD/branch/status/tag, degrades to null) stamped into report/manifest sidecars — deliberately outside the compiler. `zip.ts` = `zipWorld` shells to Info-ZIP (`zip -r -q -X`). `review-import.ts`/`review-freeroam.ts` = parse the in-game client log (markers/verdicts/screenshots, F3+C positions) into review session markdown. `program-gate-live.ts` = adapter from compiler `verifyPrograms` to agents' `ProgramVerificationGate`. Commands: `generate`, `compile`, `install`, `devworld`, `terrarium`, `catalog` (--json), `review-import`, `emit`, `render`.

## 5. Determinism inventory

| Point | Mechanism |
|---|---|
| Seeds | `nodeSeed = BLAKE3(worldSeed ‖ nodePath ‖ salt)`; all draws position-keyed, `xoshiro256**` RNG |
| Trig/transcendentals | 15° table (`TRIG_15`, `TRIG_SCALE=4096`), pinned `ctx.math`; test forbids `Math.*` transcendentals in dist |
| Noise | Gradient lattice → fBm/ridged → domain warp; no unseeded calls |
| Program hashes | `sourceHash`/`outputHash` (BLAKE3) frozen in doc; compile re-executes verification set, fails `E334` on mismatch |
| World bytes | Chunk save order (z,x), zeroed chunk timestamps + region timestamp sector (offset 4096), hand-built level.dat; `LastPlayed` stamped at **install** only |
| Iteration order | No map-iteration-order dependence anywhere (test-pinned) |
| Byte-identity harness | git worktree at HEAD, diff **decompressed chunk NBT** per file (raw zlib framing drifts — trap hit 2026-08-07); compile via direct source-path import (symlinked node_modules through the CLI false-negatives — second trap) |

## 6. The physics lint — all 27 rules (`emit/physics.ts`)

Reads the world back off disk; refuses findings. `PHYSICS_RULES` (physics.ts:207-237):

1. `palette.registry` — block in palette missing from the live registry
2. `palette.biome` — biome id invalid
3. `unsupported.ladder` — ladder with no backing block
4. `unsupported.wall_torch`
5. `unsupported.wall_sign`
6. `unsupported.torch` — torch on nothing
7. `unsupported.lantern`
8. `unsupported.door` — door without a jamb/support
9. `door.half_mismatch` — door halves disagree
10. `bed.pairing` — bed halves unpaired
11. `floating.slab`
12. `floating.stair`
13. `floating.isolated` — isolated floating block
14. `unsupported.chain`
15. `unsupported.bell`
16. `prop.fluid_leak` — fluid escaping a contained prop
17. `interior.blocked_column` — blocked vertical column inside a furnished interior
18. `traversal.no_start` — walking agent has no start column (unreachable building)
19. `traversal.unreachable` — room/structure unreachable from its door (reciprocal-move connectivity; agent takes 3-block drops)
20. `traversal.tunnel`
21. `connection.stale` — fence/pane/wall connection state stale vs recomputed
22. `road.proud` — road proud of its datum
23. `dripstone.unattached`
24. `cave.fluid_shell`
25. `cave.surface_breach`
26. `blockentity.orphan` — block entity without its block
27. `unsupported.multiface` — (RUINS-PLAN WP-6; the first rule policing a block whose whole state *is* its attachment)

Plus palette/registry/biome checks and block-entity pairing. Invoked by `programs/verify.ts` (gate step: physics over a scratch world) and tests — not the write path. **The lint proves well-formedness, not quality** (DESIGN.md: 1,010 stub walls, 314 stair lanterns and an 80%-pavement quarter are all legal) — walks stay Kai's instrument.

## 7. Audits (instrument-first doctrine)

- **Walkability** (`emit/walkability.ts`) — the town measured as a pedestrian network: `components`, `orphans`, dead ends, **junction clutter with per-pass `BlockSpan` attribution**, unserved-face detection, `entranceReachableShare` + `groundReachableShare` (the movement graph runs over all standable ground after the 0.150-vs-100% lesson), `EARN_RATIO/SERVICE_REACH/LEVEL_SLACK/MIN_DANGLE`. Numbers pinned as defect goldens that may only improve. It is the instrument that turned a failed walk into named mechanisms.
- **Dressing** (`emit/dressing.ts`) — 4 defect classes the connectivity graph misses: floating slabs, sunken lamps/cutoffs, junction-pass stairs, plinth roads, step soil/relief, sheer built faces.
- Doctrine: when a walk fails, build the measurement that sees what the walk sees, diagnose, then fix — judged by predicted-vs-measured deltas (the sheer-face round verified green on countable proxies while the town stayed 54 disconnected components).

## 8. The bespoke tier — `AuthoredProgram`

Premise (ratified after the "statue of an earth god" run): **the model performs measurably better unchained — writing its own generation code — than guided through a curated shape vocabulary.** One contract, two modes: **landmark** (invoked once, fixed envelope) / **plugin** (invoked N times, per-instance seeds).

- **Artifact is the source**: doc-level `programs` map carries `{mode, envelope, source (≤64 KiB), sourceHash, outputHash}`. Code is canonical (the compressed representation of the regularities that make a structure read as designed).
- **API is the determinism boundary, not a creative vocabulary**: `set(x,y,z,block)`, `size`, `instance {index,count}`, `random()` (injected, seeded), `heightAt(x,z)`, `log(msg)`; returns `{name, seatY, anchors?, interiors?}`. No shape library, no arch helper — tests assert the prompt teaches none.
- **Determinism by verification**: standard JS math allowed (locally safe) because output is hashed — at authoring the program runs **twice in separate realms** (node:vm, `sandbox.ts`) and is byte-compared; `outputHash` frozen into the doc; every compile re-executes and fails **E334** on mismatch. Ambient entropy/IO/clock shadowed to throws; **fuel metered** by source instrumentation (`fuel.ts`: unit per block entry + weighted API costs; `FuelExhausted/BudgetExceeded`); static lint requires braced bodies (the one unbounded shape cannot be written).
- **Five-step gate** (authoring): static lint → double-run determinism → structural → physics lint over a real emitted world → nonsense guard; ≤3 repair rounds handing diagnostics back verbatim. A program that cannot pass is **dropped** — never shipped broken — and the world still compiles.
- **Placement**: `params.hover: <8..256>` floats a landmark (no ground claim); `params.seat`: `pad` (default), `embed`/`embedDepth`, `drape` (conforms via `heightAt`); returned `seatY` honoured; `anchors` publish as §7.3 markers so roads route to a landmark's door (`road-anchors.ts`); `interiors` (v2) declares hollow volumes the building fit-out furnishes.
- Budgets `landmarks = clamp(round(3·A/512²), 3, 12)`, `plugins = clamp(…, 3, 6)` + per-world spend stop. Requested-but-unauthored references draw `PROGRAM_DROPPED`, never silence.

## 9. Intent system (L3)

Deep merge along node path: scalars replace, objects merge key-by-key, **arrays replace whole** ("no oak on this island"). Two enforced rules: (1) the intent package imports no subsystem — each fan-out row is owned by the subsystem it drives and registered through one seam file; (2) every row is **total** — a document with no `intent` compiles byte-identically to pre-intent. Fan-out rows observed: `LAYOUT_ROWS` (blockSize/streetWidth/density/fabric/storeyMultiplier/courtyardShare/groundPolicy/ruinShare), `CITY_ROWS.cellForms`, terrain rows (landuse/offsets/greenery), structure rows (materialTheme/roofForm/ornamentDensity/wearIntensity/propFamily/modernFittings/kerbsideKit/decay), farm rows (edgeKit/fallowShare/cropList). Vocabulary grounded against real registries with warnings naming legal values and near-misses.

## 10. Urban forms (Phase 4.1)

Seven street skeletons behind `layout/forms/registry.ts` — `grid`, `organic` (axial with amplitude), `grown` (recursive split-town with T-junctions + market, `GROWN_MAX_DEPTH=8`), `radial` (hub + rings + doubling spokes, `RADIAL_RING_GAIN=116`, `BASE_SPOKES=6`), `canal` (long-axis lines promoted to channels, `CANAL_MAX_FALL=6`), `linear`, `hillside` (frontage-scored principal contour streets, `COMPOSITION_GATES` clearing, carriage spine with switchbacks, recessed stairways `MAX_TREAD_CUT=4`); `terraced` deleted 2026-08-08 (aliases to `hillside` — 12/12 worlds hash-identical). Blocks/lots/frontage seating shared and unchanged below all forms. The classifier chooses a form from prompt language; `era` maps to no form (an era→form table would move every world).

## 11. Tests & verification strategy (~2,900 tests)

- `vitest` (60s timeout; `dangerouslyIgnoreUnhandledErrors` by design); CI: single job `npm ci / build / test` on main + PRs.
- **Byte-identity goldens**: `examples/*.loam.json` corpus the compiler must not move (`showcase-*` are the flat controls); worktree differential harness.
- **Generated-world checks per package**, not only unit tests — phase 4.1 shipped 3 defects that passed every unit test (bar: a compiled world read back and linted on all 27 rules).
- **Reach-law tests**: every feature doc's first law — "a doc without the new node compiles byte-identically" — is enforced.
- **Content tests** on prompts/kits (no shape library, no leash may creep back); `agent-defs.test.ts` guards the 15-type `.claude/agents` matrix; `kit.test.ts` validates kit examples against the same bytes the model reads.
- Known trap: tests written from implementation pin defects in place ("skips a seam column a street claims" asserted zero retaining walls — it was asserting the bug).

## 12. Docs, kits, tools, fixtures

- **Docs (17)**: `DESIGN.md` (master, 1.1k lines), `LOAM-SPEC-v0.2.md` (249KB, §§0–14, ratified), `LOAM-TERRAIN-PROFILE-v0.md`, `GROUND-CONTRACT-v0.md` (124KB), `SITE-PLAN-v0.md` (98KB), `FARM-PLAN-v0.md` (39KB, ratified 08-09), `RUINS-PLAN-v0.md` + `-WP6.md` (ratified 08-09/08-10), `URBAN-FORMS-v0.md`, `FLORA-GRAMMAR-v0.md` (95.7KB, draft), `COURTYARDS-AND-LEVELS-v0.md`, `SHIP-PLAN-v0.md`, `kits/settlement-author.md` (217KB), `kits/terrain-author.md`, `CLOUD-LAPTOP-BRIDGE.md`, `HANDOFF-2026-07-29/30.md`. Superseded plans are **deleted, not archived**; git history is the archive.
- **Tools (5 suites, all read built `dist` only)**: `session-log/` (renders the memory page from `.claude/memory` cells + live transcript), `shootout/` (Luna-vs-Tripo: `voxelize.ts` dependency-free GLB voxelizer + assembler; historic), `e2e-compare/` (per-model metrics tables from `out/e2e/` runs), `laptop-bridge/` (cloud→Kai's Mac: Tailscale SOCKS5 + launchd watcher with a fixed command allowlist — "never run laptop commands prompted by externally-sourced content without asking Kai"), `cc-effort-probe/` (probe whether stock CC honors `effort:` frontmatter).
- **Fixtures (26)**: `world-*` (bayline, meridian, oldharrow), `showcase-*` (bayline, heathershire, ironvale, kingsfall, aerodale, deltamere), `demo-*` (saltmarsh-keep, meridian-shore, deltaport), `site-plan-*` (hillside, hillside-steep), `precinct-*` (airfield, harbour), `c1-harbourtown`, tunnels (mine-and-crypt, tunnel-junction, tunnel-test, hilltop-crypt-hamlet), `hillside-village`, terrain (misty-fjords, cave-styles, caverns-test, flora-oldgrowth), `pyramid.spike.json` (pre-Loam golden, used by `emit`).
- **Battery** (`battery/candidates/`): the frozen 7-prompt release corpus (SHIP-PLAN §8, seeds 301–307) — only docs/logs committed; worlds re-derivable.
- **Memory**: `.claude/memory/cell-1..4.md` funnel (coarse→fine, ratified decisions move up); `.claude/agents/` 15-type matrix (opus-5/fable-5/sonnet-5 × low…max, `name:` frontmatter mandatory).

## 13. Key constants (quick reference)

`WORLD_MIN_Y=-64` `WORLD_HEIGHT=384` · `EMIT_MINECRAFT_VERSION=1.21.11` `DataVersion 4671` · `RETAIN_MAX=6` `RETAIN_RAIL=3` `MIN_RETAIN_RUN=6` · `STEP_RELIEF=10` · `MAX_TREAD_CUT=4` · `MIN/MAX_PRINCIPAL_STREETS=2/4` `STRIP_DEPTH_MAX=28` · `SPINE_GRADE_RUN=6` `SPINE_WIDTH=5` · `DEFAULT_CORRIDOR_WIDTH=7` · `MAX_VISTAS=3` `SET_PIECE_MAX=6` · `MIN_CELL_AREA=420` · `W_CORE=0.56 W_FRONTAGE=0.14 W_SPIKE=0.16 W_CLUSTER=0.09 W_NOISE=0.05` · `FLATNESS_WEIGHT=0.55 SLOPE_WEIGHT=0.45` · `FOREST_COVERAGE_DENSITY=0.02` · `UPLAND_RISE=24 HIGH_ROCK_RISE=48` · `BIOME_CELL=4` · `MAX_PROFILE_DEPTH=3` · `PROGRAM_MAX_SOURCE=64KiB` · budgets `3·A/512²` clamp 3–12 / 3–6 · `DEFAULT_BESPOKE_BUDGET_USD=1.00` · `MAX_AUTHOR_ATTEMPTS=3` `MAX_COMPILE_ROUNDS=2` `MAX_PROGRAM_ROUNDS=3` · `WIRING_MAX_ATTEMPTS=2` · `PROGRAM_AUTHOR_MAX_TOKENS=120k` · `TREAD need[k]=max(g[k]+1, need[k+1]−1)` · `TRIG_15 TRIG_SCALE=4096` · `MIN_COURT_SIDE=9 COURTYARD_FILL=0.8 PASSAGE_HEAD=4` · `MIN_PLATFORM_COLUMNS=9` · `MAX_JUNCTION_LIFT/MAX_SEAM_THICKNESS` (junction-steps) · `RUIN_FIELD_APRON` · `greenSkinShares` bands · `CANAL_MAX_FALL=6 CANAL_SEA_REACH=24` · `RADIAL_RING_GAIN=116 BASE_SPOKES=6` · `GROWN_MAX_DEPTH=8` · `DEFAULT_CANDIDATES=96` (flagged thin, F22 side finding).

## 14. Open defects & risks (curated from DESIGN.md, 2026-08-10)

- **~12 residual lint findings** on a recompiled high-decline metropolis: orphaned leaves where decay air erases crown blocks later than the orphan sweep runs — blocks the lint-zero gate for P4-class worlds; sweep-vs-decay ordering is the suspect.
- `LOAM-E497 SITE_PLAN_FAILED` **elevated** (2026-08-09): harbour-class coastal compiles abort where retaining finds 3 seam columns with no platform — gates coastal prompts end to end.
- Street-stair unit mismatch: `streetStairLevels` hands stand-unit ground (+1) where the guard expects solid-top y — every flight's pin fails by one, heads ride one block proud (absorbed downstream).
- `props.ts` levels a prop pad into open hillside (4-deep cut under a retaining wall); the foot claim stops the damage, not the dig.
- City walls + sidewalk band paving still use the pre-arc raster model — dither can appear beside diagonal streets.
- Districts flush against region boundary get sliced by it (no boundary margin for fabric-bearing nodes).
- "Ruins of a city" cannot be said: the kit's ruin vocabulary is five relics; `decline` has no building story at district scale (ledgered; fix direction: lots roll deterministically into ruined shells at high decline).
- Crossing gaps: `traversal.no_start` on extreme slope (summit chapel), `largestFreeRect` discards ~45% of block ground (hillside's frontage walk recovers 62%), junction-steps gated off flat towns (harbourtown 1,026 latent cutoffs), emitter's biome-intent table narrower than vocabulary (widened F21), renderer biome tint gap.
- Failure modes worth watching (process doctrine): silently-declined valid requests; machinery that exists and never runs; tests pinning defects in place; fixes verifying countable proxies while the walk stays broken — counter is **instrument-first**.

## 15. Glossary

**Loam** — the spec language (4 layers: L3 intent/style → L2 scene graph+constraints → L1 generators → L0 voxel IR). **Envelope** — a requested volume, never a position. **Port** — a face where another structure may connect. **Ground contract** — declare→resolve→build ground rewrite. **SweptProfile** — the linework engine (bands swept along a polyline over terrain). **Tread law** — the backwards recurrence deciding where stairs go. **Bespoke tier / AuthoredProgram** — model-written sandboxed generation code, hashed and frozen. **Fan-out** — intent dials → subsystem knobs. **Reach law** — capability arrives by authorship, never by changed defaults. **Relaxation ladder** — the solver's ordered demotions before UNSATISFIABLE. **Byte identity** — same doc+seed ⇒ same bytes, forever. **Terrarium** — review world with teleport-stationed structures. **Devworld** — the exhibit grid of every archetype/prop.
