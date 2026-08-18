/**
 * The terrain-profile compiler.
 *
 * Passes, in the order the profile fixes them:
 *
 * 1. parse + validate (`@terrainist/spec`);
 * 2. resolve coarse placements — fractional coordinates, zone jitter, course
 *    refinement (inside `buildTerrainField`);
 * 3. compose the master heightfield: base stack → raise edits → carve edits;
 * 4. climate fields (built first, since classification's snow rule reads the
 *    temperature field) + surface classification → per-column biomes;
 * 5. materialize columns;
 * 5b. build structures — `building.grammar@0` blocks, then `road.network@0`
 *     routes graded and surfaced *into* the column plan;
 * 6. scatter vegetation;
 * 7. validators (fluid settling, floating vegetation);
 * 8. emit + report.
 *
 * Pass 6 runs *before* pass 4's biome assignment in the code below, because
 * the biome rule needs the forest coverage mask — the scatter's eligibility
 * test is what decides whether a lowland is `plains` or `taiga`. Nothing else
 * about the order is negotiable.
 */

import {
  buildTerrainField,
  centeredRegion,
  classify,
  nodeSeed,
  resolveWorldSeed,
  seed32,
  type Classification,
  type Marker,
  type Region,
  type TerrainEdit,
} from "@terrainist/stdlib";
import {
  type CaveNode,
  type EditNode,
  type ForestNode,
  type LoamDiagnostic,
  type ProgramNode,
  type ProgramScatterParams,
  type SettlementDocument,
  type TerrainDocument,
  CLIMATE_THEMES,
  PROFILE_GENERATORS,
  PROGRAM_SCATTER_GENERATOR,
  INFRA_ENTRY_GENERATOR,
  PROP_GENERATOR,
  STRUCTURE_GENERATORS,
  authoredProgramId,
  hoverOf,
  hoverOfParams,
  seatOfParams,
  seatPolicyOf,
  type SeatDecision,
  isAuthoredGenerator,
  validateSettlementDocument,
  validateTerrainDocument,
  note,
  warning,
  hasErrors,
} from "@terrainist/spec";
import {
  buildPrograms,
  coarseHintArea,
  planLandmarkSite,
  planHoverSite,
  planProgramFacings,
  type PlacedProgram,
  type ProgramFacing,
  type ProgramJob,
  type ProgramPlacement,
  type ProgramPassResult,
  type ProgramRotation,
} from "../programs/index.js";

import {
  TerrainProductIndex,
  applyPadEdits,
  corridorMask,
  corridorsFromCourses,
  deriveTerrainProducts,
  canonicalConstraints,
  layoutNodesFrom,
  registerRoadCorridors,
  solveCities,
  solveDistricts,
  solveLayout,
  type CityProduct,
  type DistrictProduct,
  type LayoutNodeInput,
  type RouteCorridor,
  type OccupancyGrid,
  type PadEdit,
  type Placement,
  type Rect,
  type ResolvedPort,
  type SolverReport,
} from "../layout/index.js";
import type { GroundBaseline } from "../layout/ground-contract.js";
import { resolveGround } from "../layout/ground-resolver.js";
import type { GroundEquivalenceOutcome } from "../layout/ground-equivalence.js";
import { declarePadEdits } from "../structures/ground-declare.js";
import { createGroundDriver, type GroundDriver } from "../layout/ground-driver.js";

import { EMIT_MINECRAFT_VERSION } from "../emit/world.js";
import { loadPrismarine } from "../emit/prismarine.js";
import {
  auditWalkability,
  walkabilityContextOf,
  type WalkabilityReport,
  type WalkabilityTuning,
} from "../emit/walkability.js";
import type { Provenance } from "../provenance.js";

import {
  aridAmbientBiome,
  biomeForColumn,
  climateOutranksArid,
  type AridBiasInput,
  type ProfileBiome,
} from "./biomes.js";
import { buildSettlementClearing, type SettlementClearing } from "./clearing.js";
import {
  buildLandUseMask,
  clampLandUse,
  type ClimateIntent,
  type LandUseClampResult,
  type MaskRect,
} from "./landuse.js";
import {
  DECOR_APRON,
  clipTrees,
  makeStructureClip,
  roadCorridorBoxes,
  structureBoxes,
  type StructureClip,
} from "./clip.js";
import { THEME_CENTERS, buildClimateFields, resolveClimateParams } from "./climate.js";
import {
  buildCavePlan,
  checkCaveIntegrity,
  decorateCaves,
  resolveCaveParams,
  type CaveNodeInput,
} from "./caves.js";
import { buildColumnPlan, type ColumnPlan, type VolcanoInfo } from "./columns.js";
import { decorate, type DecorBlock } from "./decorate.js";
import { emitTerrain, type TerrainEmitSummary } from "./emit.js";
import { resolvePalette } from "./palette.js";
import { layUrbanFloor, type UrbanFloorResult } from "./urban-floor.js";
import { materialThemeById } from "../programs/theme.js";
import { ensureFanOutRows, fanOut, resolveIntents, type IntentResolution } from "../intent/index.js";
import { NO_CLIMATE_OFFSET, TERRAIN_ROWS, type ClimateOffsets } from "./climate-intent.js";
import { FLORA_ROWS, NO_FLORA_BIAS, type FloraBias } from "./flora-intent.js";
import {
  caveDiagnostics,
  tunnelDiagnostics,
  checkFloatingVegetation,
  checkFluidStability,
  validatorDiagnostics,
} from "./validate.js";
import {
  TOWN_GREEN_DENSITY,
  builtColumnMask,
  scatterForests,
  type ForestNodeInput,
  type StrataReport,
  type TreePlacement,
} from "./vegetation.js";
import {
  buildStructures,
  buildTransitionBand,
  checkTunnelIntegrity,
  roadParamsOf,
  type FarmReportRow,
  type StructurePassResult,
  type StructureStats,
} from "../structures/index.js";

/** Default `lavaFlows` for a volcano edit that does not name one. */
export const DEFAULT_LAVA_FLOWS = 2;

/**
 * How the stdlib's composition diagnostics surface as profile diagnostics.
 *
 * The stdlib deliberately knows nothing about the diagnostic catalog, so it
 * emits bare codes; this table is where each one gets its symbolic name and,
 * more importantly, its fix hint — which G3 feeds back to the authoring LLM.
 */
type EditDiagnosticName = "BASIN_RIM_NOT_CLOSED" | "RIVER_PONDED" | "CARVE_DRY";

const EDIT_DIAGNOSTIC_NAMES: Readonly<
  Record<string, { readonly name: EditDiagnosticName; readonly fix: string }>
> = Object.freeze({
  "LOAM-T105": {
    name: "BASIN_RIM_NOT_CLOSED",
    fix: 'close the basin rim (increase "radius" or reduce "depth") to raise the waterline, or drop "water": true',
  },
  "LOAM-T112": {
    name: "RIVER_PONDED",
    fix:
      "nothing to change if a pond chain is what you wanted. For a flowing river, give the map a sea " +
      'for it to reach — lower "baseHeight" or raise "continentalness.seaFraction" until the coast is ' +
      "inside the region — and end the river's \"course\" on that coast.",
  },
  "LOAM-T113": {
    name: "CARVE_DRY",
    fix:
      'end the carve at the water instead of guessing where it is: make the last "course" ' +
      'waypoint the string "coast" (e.g. "course": [[0.54, 0.40], [0.5, 0.28], "coast"]) and the ' +
      "compiler will aim it at the sea this seed actually produced. Use it as the *first* " +
      "waypoint for an inlet drawn inland. If the channel is meant to be a dry gorge, say so " +
      'with "flooded": "never" and this note goes away.',
  },
});

/** Options for {@link compileTerrain}. */
export interface CompileTerrainOptions {
  /** World folder to write. */
  readonly outDir: string;
  /** Downgrade `LOAM-T110` to a warning instead of failing. */
  readonly allowUnstable?: boolean;
  /** Emit target version; defaults to the pinned one. */
  readonly minecraftVersion?: string;
  /**
   * Hand the finished column plan to the caller, just before emit.
   *
   * A seam for readback lints and tests, which need the plan the world was
   * written from — the cave rules in particular compare the world on disk
   * against `plan.ground` and `plan.caves.entranceColumns`. It is deliberately
   * a callback rather than a report field: the plan is tens of megabytes of
   * typed arrays and the report is JSON the CLI writes to a file.
   */
  readonly onColumnPlan?: (plan: ColumnPlan) => void;
  /**
   * Stop before the world is written, and hand the finished pipeline output to
   * the caller instead.
   *
   * The compiler's product is a world folder, and for every shipped artefact
   * that is the right product. The Terrarium's multi-structure stations are the
   * exception: what they want is a *small compiled settlement transplanted onto
   * a floating platform*, which means the plan and the block lists in memory
   * and never a `region/` directory of their own. Without this seam the only
   * ways to get them are to duplicate the pipeline (which would exhibit the
   * duplicate, not the pipeline) or to write a world and read it back (which
   * throws away the column plan, the building list and the tunnel endpoints
   * that the physics lint needs).
   *
   * `report.emit` is a zeroed summary when this is set: nothing was written, and
   * a summary claiming otherwise would be a lie the caller might believe.
   */
  readonly skipEmit?: boolean;
  /** Receives the pipeline's output just before emit. See {@link CompileTerrainOptions.skipEmit}. */
  readonly onArtifacts?: (artifacts: CompileArtifacts) => void;
  /**
   * Git provenance for the checkout doing the compiling, copied into the
   * report verbatim.
   *
   * An *input*, never read here: the compiler shells out to nothing and reads
   * no environment, so the same document and seed compile to the same world on
   * any machine. Only the report (a sidecar) carries it.
   */
  readonly provenance?: Provenance;
  /**
   * Run the ground contract's equivalence shim beside the mutating pipeline
   * (`docs/GROUND-CONTRACT-v0.md` §8.1).
   *
   * **The baseline is no longer what this gates** (§9a.1, last paragraph). From
   * the first conversion the baseline snapshot is unconditional on the settlement
   * path, because it is the resolver's first argument and the driver is
   * production code. What this still gates is the *shim*: the second snapshot
   * taken after the structure pass, the shim's own one-shot `resolveGround`, and
   * `driver.finish()` — which nothing in production consumes yet, since §7's
   * report section has no wiring. With it on, all of that is handed back on
   * {@link CompileTerrainResult.groundEquivalence} for `assertGroundEquivalence`
   * to compare.
   */
  readonly groundEquivalence?: boolean;
  /**
   * Run the walkability audit over the emitted world (`emit/walkability.ts`).
   *
   * Opt-in for the same reason the equivalence shim is: it reads every region
   * file back and floods a graph over every paved column, which is seconds a
   * production compile should not spend. It is what the tests and a diagnosis
   * session point at a fixture. Ignored under `skipEmit` — there is no world to
   * read.
   */
  readonly walkability?: boolean | WalkabilityTuning;
}

/**
 * Everything a world would have been written from — the pipeline's output, one
 * step before it becomes chunks.
 *
 * The block lists are in **world coordinates** for the document's own region,
 * which `centeredRegion` puts around the origin; a caller transplanting them
 * elsewhere translates both these and {@link ColumnPlan.region}.
 */
export interface CompileArtifacts {
  readonly plan: ColumnPlan;
  readonly trees: readonly TreePlacement[];
  /** Ground cover and water plants. */
  readonly decor: readonly DecorBlock[];
  /** Buildings, roads, plaza, tunnels and props; absent for a terrain profile. */
  readonly structures?: readonly DecorBlock[];
  readonly clip?: StructureClip;
  readonly spawn: { readonly x: number; readonly y: number; readonly z: number };
  readonly stack: ReturnType<typeof loadPrismarine>;
}

/** Wall-clock milliseconds per pass. */
export interface CompileTimings {
  readonly validate: number;
  readonly field: number;
  /** Layout solve; zero for terrain-profile documents. */
  readonly layout: number;
  readonly climate: number;
  readonly columns: number;
  /** Cave carve pass; zero for a document with no cave node. */
  readonly caves: number;
  /** Structure pass; zero for terrain-profile documents. */
  readonly structures: number;
  /** Authored-program pass; zero for a document with no `programs` map. */
  readonly programs: number;
  readonly scatter: number;
  readonly biomes: number;
  readonly validators: number;
  readonly emit: number;
  readonly total: number;
}

/** What the cave pass cut and dressed. */
export interface CaveStats {
  readonly systems: number;
  readonly chambers: number;
  /** Stone blocks replaced by `cave_air`. */
  readonly carvedBlocks: number;
  /** Daylight mouths opened; each publishes a `cave_mouth` marker. */
  readonly entrances: number;
  readonly decorBlocks: number;
  readonly decorCounts: Readonly<Record<string, number>>;
}

/** Aggregate numbers about the compiled world. */
export interface CompileStats {
  readonly region: Region;
  readonly columns: number;
  readonly minHeight: number;
  readonly maxHeight: number;
  readonly snowLine: number;
  readonly seaLevel: number;
  /** Fraction of columns above sea level. */
  readonly landFraction: number;
  readonly treeCount: number;
  readonly treesPerNode: Readonly<Record<string, number>>;
  /** Per-node strata composition, present only for nodes that declared any. */
  readonly strata?: readonly StrataReport[];
  readonly unstableFluidBlocks: number;
  readonly floatingTrees: number;
  /** Column counts per painted biome, sorted by biome name. */
  readonly biomeHistogram: Readonly<Record<string, number>>;
  readonly chunkCount: number;
  readonly blockCount: number;
  readonly treeBlockCount: number;
  /** Ground-cover and water-plant blocks placed. */
  readonly decorBlockCount: number;
  /** Decoration counts by category. */
  readonly decorCounts: Readonly<Record<string, number>>;
  /** What `cave.carver@0` cut, or all zeroes for a document with no cave node. */
  readonly caves: CaveStats;
  /** Columns painted with volcanic materials. */
  readonly volcanicColumns: number;
  /** Columns claimed by a frozen lava flow. */
  readonly lavaFlowColumns: number;
  /** Columns inside the settlement clearing where no tree may stand. */
  readonly clearedColumns: number;
  /** Trees dropped for losing too much of themselves to a building. */
  readonly clippedTrees: number;
  /** Trees felled by the F2 clearing transition band. */
  readonly felledTrees: number;
  /** Stumps the band left standing where it felled. */
  readonly transitionStumps: number;
  /** Fallen logs the band laid where it felled. */
  readonly transitionLogs: number;
  /** Voxels withheld from surviving trees at emit. */
  readonly clippedTreeBlocks: number;
  /** Ponds formed by demoting a sealess river, per river edit. */
  readonly pondChains: Readonly<Record<string, number>>;
  /** The urban floor's tally; absent unless a wall circuit was built. */
  readonly urbanFloor?: UrbanFloorResult;
  /** What the structure pass built; absent for a terrain-profile compile. */
  readonly structures?: StructureStats;
  /** What each authored-program node put in the world; absent when none did. */
  readonly programs?: readonly ProgramNodeStats[];
}

/** One authored-program node's contribution to the world. */
export interface ProgramNodeStats {
  readonly nodePath: string;
  readonly programId: string;
  readonly mode: "landmark" | "plugin";
  /** Instances that stand in the world — one for a landmark, N for a scatter. */
  readonly instances: number;
  readonly blockCount: number;
  /**
   * Where each instance stands, so a pad can be measured off the report.
   *
   * The walked defect this exists for: "bespoke sites sit on raised, hard-edged
   * platforms" was impossible to quantify without recompiling with a debug
   * build, because the only trace an instance left in the report was a count.
   * Report-only — no block moves because of this field.
   */
  readonly sites: readonly ProgramSiteStats[];
}

/** One placed instance, as the report carries it. */
export interface ProgramSiteStats {
  readonly index: number;
  readonly footprint: Rect;
  /** World Y of the instance's node-local `y = 0`, after seating. */
  readonly baseY: number;
  /** True when it floats — nothing under it was claimed or padded. */
  readonly hovering?: boolean;
}

/** What the layout solver contributed, on a settlement-profile compile. */
export interface LayoutOutcome {
  readonly report: SolverReport;
  readonly placements: readonly Placement[];
  readonly ports: readonly ResolvedPort[];
  readonly padEdits: readonly PadEdit[];
  /**
   * The fabric pass's output, one entry per `district` node.
   *
   * `report.layout.districts[i].streets` is **the** {@link StreetGraph} product:
   * the pinned contract F4's streetscape and the road pass code against. It is
   * here rather than under `structures` because the graph is a layout decision —
   * it exists before a single block does, and it is what the placements inside
   * the district were derived from.
   */
  readonly districts?: readonly DistrictProduct[];
  /**
   * C1's city plans, one per `city` node — the pinned {@link CityPlan} contract
   * C2's skyline, C3's life pass and C4's set pieces code against.
   *
   * Beside `districts` rather than under them because the two are different
   * layers of the same idea: `districts` here holds one entry per *cell*, which
   * is the fabric each face of the armature was given, while this holds the
   * armature itself and the characters it assigned.
   */
  readonly cities?: readonly CityProduct[];
  /** Per-building geometry and the routed road network. */
  readonly structures?: StructurePassResult;
}

/** The compile report — what the CLI prints and `--report` writes. */
export interface TerrainCompileReport {
  readonly name: string;
  readonly prompt?: string;
  /** The checkout that produced this report; present when the caller passed it. */
  readonly provenance?: Provenance;
  readonly worldSeed: string;
  readonly markers: readonly Marker[];
  readonly stats: CompileStats;
  readonly diagnostics: readonly LoamDiagnostic[];
  readonly timings: CompileTimings;
  readonly emit: TerrainEmitSummary;
  /**
   * One row per `precinct.farm@0` holding (`docs/FARM-PLAN-v0.md` §12).
   *
   * Absent — not empty — for a document with no farm node, so a world without
   * agriculture writes exactly the report it wrote before F17 existed.
   */
  readonly farms?: readonly FarmReportRow[];
  /** Present only for settlement-profile documents. */
  readonly layout?: LayoutOutcome;
}

/** Result of a compile attempt: a report, or the diagnostics that stopped it. */
export type CompileTerrainResult =
  | {
      readonly ok: true;
      readonly report: TerrainCompileReport;
      /**
       * The equivalence shim's material, present only when
       * {@link CompileTerrainOptions.groundEquivalence} asked for it.
       *
       * On the *result* rather than in the report, deliberately: the report is
       * JSON the CLI writes to a file, and six region-sized typed arrays have no
       * business on disk. Nothing serialises this.
       */
      readonly groundEquivalence?: GroundEquivalenceOutcome;
      /**
       * What the walkability audit found, present only when
       * {@link CompileTerrainOptions.walkability} asked for it. On the result
       * rather than in the report, for the same reason as the shim above.
       */
      readonly walkability?: WalkabilityReport;
    }
  | { readonly ok: false; readonly diagnostics: readonly LoamDiagnostic[] };

/**
 * Validate a JSON value and compile it into a world folder.
 *
 * Dispatches on `profile`: a `"settlement"` document goes through the
 * settlement validator and gains the layout solve; a `"terrain"` one takes
 * exactly the path it took before this function learned about profiles, which
 * is why the golden terrain hashes are unchanged.
 */
export async function compileTerrain(
  input: unknown,
  options: CompileTerrainOptions,
): Promise<CompileTerrainResult> {
  const started = now();
  const settlement =
    typeof input === "object" && input !== null && (input as { profile?: unknown }).profile === "settlement";
  const validation = settlement ? validateSettlementDocument(input) : validateTerrainDocument(input);
  const validateMs = now() - started;
  if (validation.document === undefined) {
    return { ok: false, diagnostics: validation.diagnostics };
  }
  return compileValidated(validation.document, options, [...validation.diagnostics], {
    started,
    validateMs,
  });
}

/** True for a settlement document — the only path that runs the layout solver. */
function isSettlement(doc: TerrainDocument | SettlementDocument): doc is SettlementDocument {
  return doc.profile === "settlement";
}

async function compileValidated(
  doc: TerrainDocument | SettlementDocument,
  options: CompileTerrainOptions,
  diagnostics: LoamDiagnostic[],
  clock: { started: number; validateMs: number },
): Promise<CompileTerrainResult> {
  const stack = loadPrismarine(options.minecraftVersion ?? EMIT_MINECRAFT_VERSION);
  const rootPath = doc.root.id;
  const worldSeed = resolveWorldSeed(doc.meta.worldSeed);
  const [width, depth] = doc.root.envelope.size ?? [512, 512];
  const region = centeredRegion(width, depth);

  // --- pass 2: intent ------------------------------------------------------
  // Resolved once, here, exactly where L3 styles are inherited; every consumer
  // reads the resolved record and nobody re-reads the document. A document
  // with no `intent` resolves to a record that declares nothing, and every
  // fan-out row answers such a record with today's value — which is what makes
  // this pass byte-identical until an author uses it.
  ensureFanOutRows();
  const intents = resolveIntents(doc);
  diagnostics.push(...intents.diagnostics);
  diagnostics.push(...generatorCoverageNotes(doc.root.children, rootPath));

  // --- palette -------------------------------------------------------------
  const rootSeed = nodeSeed(worldSeed, rootPath, "");
  const { palette, unknownBlocks } = resolvePalette(stack, styleWithIntent(doc.style, intents), rootSeed);
  for (const bad of unknownBlocks) {
    diagnostics.push(
      warning(
        "BAD_PALETTE",
        `${rootPath}.style`,
        `palette symbol "${bad.symbol}" names block "${bad.block}", which does not exist in ${stack.minecraftVersion}`,
        `replace "${bad.block}" with a block id that exists in Minecraft ${stack.minecraftVersion} (the symbol falls back to its profile default meanwhile)`,
      ),
    );
  }

  // --- pass 2/3: coarse placement + master heightfield ----------------------
  const children = doc.root.children as readonly TerrainDocument["root"]["children"][number][];
  const heightfield = children.find((c) => c.generator === "terrain.heightfield@0");
  const climateNode = children.find((c) => c.generator === "terrain.climate@0");
  /* c8 ignore next 3 — the validator guarantees both exist. */
  if (heightfield === undefined || climateNode === undefined) {
    throw new Error("compileTerrain: validated document is missing a required generator");
  }
  const hfPath = `${rootPath}.${heightfield.id}`;
  const edits = (("children" in heightfield ? heightfield.children : undefined) ?? []).map(toEdit);

  // --- pass 4a: climate ----------------------------------------------------
  // The climate fields depend only on the region and their own node seed, so
  // they are built *before* the heightfield: classification's snow rule reads
  // the temperature field, and it is cleaner to hand it in than to reclassify.
  const t1 = now();
  const climateParams = resolveClimateParams(
    climateNode.generator === "terrain.climate@0" ? climateNode.params : undefined,
  );
  const climate = buildClimateFields(
    region,
    climateParams,
    nodeSeed(worldSeed, `${rootPath}.${climateNode.id}`, climateNode.seedSalt ?? ""),
  );
  const climateMs = now() - t1;

  const t0 = now();
  const terrain = buildTerrainField({
    region,
    worldSeed: doc.meta.worldSeed,
    nodePath: hfPath,
    ...(heightfield.seedSalt === undefined ? {} : { seedSalt: heightfield.seedSalt }),
    params: heightfield.params,
    edits,
    markers: { temperature: climate.temperature },
  });
  const fieldMs = now() - t0;

  for (const d of terrain.edits.diagnostics) {
    const build = d.severity === "note" ? note : warning;
    const mapped = EDIT_DIAGNOSTIC_NAMES[d.code] ?? EDIT_DIAGNOSTIC_NAMES["LOAM-T105"];
    diagnostics.push(
      build(
        (mapped as { name: EditDiagnosticName }).name,
        `${hfPath}.${d.editId}`,
        d.message,
        (mapped as { fix: string }).fix,
      ),
    );
  }

  // --- substages 3c-3f: layout solve (settlement profile only) -------------
  // §4.7 obligation 6: terrain is composed and classified *before* structural
  // placement, because `terrain_conform`, `slope` and the ground-fitness score
  // all need real heights. The pads the solver emits then go back into the
  // field, and classification re-runs over the changed ground.
  let classification: Classification = terrain.classification;
  let layoutOutcome: LayoutOutcome | undefined;
  let occupancy: OccupancyGrid | undefined;
  let layoutNodes: readonly LayoutNodeInput[] = [];
  /** Frozen at substage 3b, read by the solver and again by the road router. */
  let corridors: readonly RouteCorridor[] = [];
  let products: TerrainProductIndex | undefined;
  /** `building.grammar@0` params for the fabric pass's own buildings. */
  let districtParams: ReadonlyMap<string, Readonly<Record<string, unknown>>> | undefined;
  // Which way each landmark program faces, decided **here**, before anything
  // reserves a box for one: a quarter turn swaps the envelope's width and
  // depth, so the solver has to be told the turned box or it reserves the wrong
  // hole. The answer is binding from this point on — see `programs/facing.ts`
  // for why a binding estimate is what lets two programs face each other.
  const landmarkFacings = planProgramFacings({
    doc,
    rootPath,
    region,
    worldSeed,
    scope: "landmark",
  });
  diagnostics.push(...landmarkFacings.diagnostics);
  const landmarkRotations = new Map(
    [...landmarkFacings.facings].map(([path, facing]) => [path, facing.rotation ?? 0] as const),
  );
  const tLayout = now();
  if (isSettlement(doc)) {
    const extraction = layoutNodesFrom(doc, worldSeed, landmarkRotations);
    layoutNodes = extraction.nodes;
    diagnostics.push(...extraction.diagnostics);

    // --- substage 3b: corridor construction (§4.9.6) -----------------------
    // Course-bearing terrain features first, in the order the edits were
    // applied, then the road network's own reservation. Order is registration
    // order and registration order is what `resolveCorridor` breaks ties on,
    // so a document with both a `river` and a `lanes` node named the same thing
    // resolves the same way every run.
    corridors = [
      ...corridorsFromCourses(terrain.edits.courses, hfPath),
      ...roadNetworkCorridors(doc, rootPath, region, extraction.nodes),
    ];
    products = new TerrainProductIndex(
      region,
      deriveTerrainProducts({
        region,
        oceanMask: classification.oceanMask,
        ridgeCourses: terrain.edits.courses.filter((c) => c.verb === "ridge").map((c) => c.samples),
        peaks: peakPoints(heightfield, terrain.edits.markers),
      }),
    );

    const solved = solveLayout({
      region,
      field: terrain.field,
      classification,
      seaLevel: terrain.params.seaLevel,
      rootPath,
      nodes: extraction.nodes,
      hazardMask: buildHazardMask(region, classification, terrain.edits.calderas),
      amphibiousHazardMask: buildHazardMask(region, classification, terrain.edits.calderas, {
        water: false,
      }),
      corridors,
      products,
    });
    diagnostics.push(...solved.diagnostics);
    occupancy = solved.occupancy;

    // --- substage 3g: the district fabric (F1) -----------------------------
    // The solver's pads go in *first*, because a district levels its own ground
    // and the fabric pass reads that ground to seat every building it lays. Run
    // the other way round, each tower would be founded on the hill the district
    // was about to erase.
    if (solved.padEdits.length > 0) applyPadEdits(terrain.field, solved.padEdits);
    // Where the water is, as the layout stage can know it: there is no column
    // plan yet, and C1's shoreline drive has to follow a real shore. The union
    // of the ocean and lake masks is exactly what `buildColumnPlan` will turn
    // into `fluidKind` two stages later.
    const wetColumns = new Uint8Array(region.width * region.depth);
    for (let k = 0; k < wetColumns.length; k++) {
      if (classification.oceanMask[k] === 1 || classification.lakeMask[k] === 1) wetColumns[k] = 1;
    }
    const fabricInput = {
      doc,
      worldSeed,
      field: terrain.field,
      seaLevel: terrain.params.seaLevel,
      placements: solved.placements,
      water: wetColumns,
    };
    const fabric = solveDistricts(fabricInput);
    diagnostics.push(...fabric.diagnostics);
    // --- substage 3h: the city plan (C1) -----------------------------------
    // A second pass at the same stage rather than a branch inside the first:
    // a city's cells *are* districts and are laid by the same code, but the
    // armature that produced them is drawn before any of them exists.
    const cityFabric = solveCities(fabricInput);
    diagnostics.push(...cityFabric.diagnostics);
    const fabricPads = [...fabric.padEdits, ...cityFabric.padEdits];
    if (fabricPads.length > 0) applyPadEdits(terrain.field, fabricPads);
    if (solved.padEdits.length + fabricPads.length > 0) {
      classification = classify(terrain.field, terrain.params, {
        temperature: climate.temperature,
        noFlood: terrain.edits.noFlood,
        basins: terrain.edits.basins,
        footprints: terrain.edits.footprints,
      });
    }
    // The fabric's buildings need solver nodes so the structure pass can build
    // them; they need no *occupancy* of their own, because the district's own
    // footprint was claimed by the solve and every one of them is inside it.
    const fabricNodes = [...fabric.nodes, ...cityFabric.nodes];
    if (fabricNodes.length > 0) layoutNodes = [...extraction.nodes, ...fabricNodes];
    districtParams = new Map([...fabric.params, ...cityFabric.params]);
    const allDistricts = [...fabric.districts, ...cityFabric.districts];
    layoutOutcome = {
      report: solved.report,
      placements: [...solved.placements, ...fabric.placements, ...cityFabric.placements],
      ports: [...solved.ports, ...fabric.ports, ...cityFabric.ports],
      padEdits: [...solved.padEdits, ...fabricPads],
      ...(allDistricts.length === 0 ? {} : { districts: allDistricts }),
      ...(cityFabric.cities.length === 0 ? {} : { cities: cityFabric.cities }),
    };
  }
  const layoutMs = now() - tLayout;

  // --- pass 5: columns -----------------------------------------------------
  const t2 = now();
  const volcanoes: VolcanoInfo[] = (("children" in heightfield ? heightfield.children : undefined) ?? [])
    .filter((child) => child.params.verb === "volcano")
    .map((child) => ({
      editId: child.id,
      lavaFlows: child.params.lavaFlows ?? DEFAULT_LAVA_FLOWS,
      seed: nodeSeed(worldSeed, `${hfPath}.${child.id}`, ""),
    }));

  const plan = buildColumnPlan({
    field: terrain.field,
    classification,
    palette,
    seaLevel: terrain.params.seaLevel,
    soilDepth: terrain.params.soilDepth,
    calderas: terrain.edits.calderas,
    basins: terrain.edits.basins,
    footprints: terrain.edits.footprints,
    volcanoes,
    seed: rootSeed,
  });
  const columnsMs = now() - t2;

  // The ground contract's baseline (§8.1, step 1) — the three frozen arrays as
  // materialised, before the first structure pass touches one. **Unconditional on
  // the settlement path** from WP-3 (§9a.1): it is the resolver's first argument,
  // and the driver that resolves against it is production code, not a shim. A
  // terrain-profile compile has no structure passes and builds none.
  const groundBaseline: GroundBaseline | undefined = isSettlement(doc)
    ? {
        region: plan.region,
        ground: Int32Array.from(plan.ground),
        fluidTop: Int32Array.from(plan.fluidTop),
        fluidKind: Uint8Array.from(plan.fluidKind),
        seaLevel: plan.seaLevel,
      }
    : undefined;
  // The one thing that writes a level during the mixture (§9a.1). Every pass
  // contributes at its own pipeline position, and with WP-3, WP-4 and WP-5
  // landed every structure pass contributes by committing; the one `record` left
  // is the layout solver's pads, whose field already carries its answer (§3.12).
  const groundDriver: GroundDriver | undefined =
    groundBaseline === undefined ? undefined : createGroundDriver(groundBaseline, plan);

  // --- pass 5a: caves ------------------------------------------------------
  // Subtractive, and deliberately downstream of everything that decides what
  // the world looks like from above: the field, the classification, the biomes
  // and the fluids are all settled by now, and the carver may not touch any of
  // them. What it produces is interior air, which nothing before this point
  // could have depended on.
  const tCaves = now();
  const caveNodes: CaveNodeInput[] = children
    .filter((c): c is CaveNode => c.generator === "cave.carver@0")
    .map((node) => ({
      id: node.id,
      nodePath: `${rootPath}.${node.id}`,
      seed: nodeSeed(worldSeed, `${rootPath}.${node.id}`, node.seedSalt ?? ""),
      params: resolveCaveParams(node.params),
    }));
  if (caveNodes.length > 0) {
    plan.caves = buildCavePlan(caveNodes, plan, classification);
    // A mouth that opens the surface has no ground left to hold a snow layer.
    for (let idx = 0; idx < plan.snow.length; idx++) {
      if (plan.caves.entranceColumns[idx] === 1) plan.snow[idx] = 0;
    }
  }
  const cavesMs = now() - tCaves;

  // --- pass 5b: structures -------------------------------------------------
  // After the columns exist (a foundation needs ground to sink into, a road
  // needs a surface to grade) and before the scatter, whose occupancy grid this
  // pass has just finished filling in.
  const tStruct = now();
  let structures: StructurePassResult | undefined;
  // Nothing placed means nothing to build *and* nothing to connect, and the
  // report must stay identical to a terrain-profile compile's in that case.
  if (
    isSettlement(doc) &&
    groundDriver !== undefined &&
    layoutOutcome !== undefined &&
    layoutOutcome.placements.length > 0
  ) {
    // §9a.1 rule 1's one exception of timing: `declarePadEdits` records *before*
    // the first structure pass, because its "pass" is the layout solver and the
    // field already carries its answer (§3.12).
    groundDriver.record(declarePadEdits(plan, layoutOutcome.padEdits));
    structures = buildStructures({
      doc,
      worldSeed,
      ground: groundDriver,
      nodes: layoutNodes,
      placements: layoutOutcome.placements,
      ports: layoutOutcome.ports,
      plan,
      palette,
      stack,
      ...(occupancy === undefined ? {} : { occupancy }),
      ...(landmarkRotations.size === 0 ? {} : { programRotations: landmarkRotations }),
      ...(layoutOutcome.districts === undefined ? {} : { districts: layoutOutcome.districts }),
      ...(layoutOutcome.cities === undefined ? {} : { cities: layoutOutcome.cities }),
      ...(districtParams === undefined ? {} : { paramsByPath: districtParams }),
      // §4.9.6: the pass-6 router prefers the polygon that was frozen at 3b.
      ...(corridors.some((c) => c.kind === "road")
        ? { roadCorridor: corridorMask(region, corridors.filter((c) => c.kind === "road")) }
        : {}),
    });
    diagnostics.push(...structures.diagnostics);
    layoutOutcome = { ...layoutOutcome, structures };
  }
  const structuresMs = now() - tStruct;

  // --- pass 5b′: the ground contract's equivalence shim ---------------------
  // §8.1, steps 2–3. Read-only: the shadow declarers recompute what each of the
  // eleven passes *would* have declared, from what those passes handed back, and
  // the resolver answers the same question the write-order pile just answered.
  // Nothing here writes a plan, and it is skipped entirely unless asked for.
  //
  // Here, and not later: the eleven are the contract's inventory, and the
  // authored-program pass that follows is outside it (§3.12). Comparing against
  // a plan the programs had already written would attribute their writes to a
  // declarer that never claimed them.
  const groundEquivalence: GroundEquivalenceOutcome | undefined =
    groundDriver === undefined || groundBaseline === undefined || options.groundEquivalence !== true
      ? undefined
      : {
          baseline: groundBaseline,
          // §9a.5: the shim is fed `driver.intents` rather than `declareAll(…)`'s
          // result — the same set, arrived at from one place instead of two.
          //
          // A **copy**, for the same reason `written` below is one: the driver's
          // array is live, the authored-program pass that follows commits its
          // instance pads into it, and the shim's question is about the eleven
          // as they stood *here*.
          intents: [...groundDriver.intents],
          resolved: resolveGround(groundBaseline, groundDriver.intents),
          // …and computed **by the shim itself**, not read off the driver, so
          // that comparing it against `finish()` proves the accumulating prefix
          // is not a second resolver.
          driver: groundDriver.finish(),
          // A copy, not the live plan: the passes after this one go on writing
          // it, and comparing against a moving array would credit their writes
          // to the eleven.
          written: {
            ground: Int32Array.from(plan.ground),
            fluidTop: Int32Array.from(plan.fluidTop),
            fluidKind: Uint8Array.from(plan.fluidKind),
          },
        };

  // --- pass 5d: authored programs ------------------------------------------
  // After the structures, for the same reason they run after the columns: a
  // landmark sits on the site the solver reserved and a plugin scatter reads
  // the occupancy every earlier pass has finished claiming. Its output is
  // ordinary structure blocks from here on.
  const tPrograms = now();
  let programs: ProgramPassResult | undefined;
  let programJobs: readonly ProgramJob[] = [];
  {
    // The bespoke tier is legal in both profiles. A settlement landmark takes
    // the site the solver reserved; a terrain-profile one has no solver, so its
    // site comes from the ground (see `planLandmarkSite`).
    // The scattered half of the facing question, and it is asked *here* rather
    // than beside the landmarks': a scatter's instances are placed inside this
    // pass, after the solve, so the nodes it faces have real sites to be
    // measured against by then.
    const scatterFacings = planProgramFacings({
      doc,
      rootPath,
      region,
      worldSeed,
      scope: "plugin",
      placements: layoutOutcome?.placements ?? [],
    });
    diagnostics.push(...scatterFacings.diagnostics);
    const jobs = programJobsFrom(doc, rootPath, layoutOutcome?.placements ?? [], diagnostics, {
      plan,
      worldSeed,
      solved: isSettlement(doc),
      rotations: landmarkRotations,
      facings: scatterFacings.facings,
    });
    programJobs = jobs;
    if (jobs.length > 0) {
      programs = buildPrograms({
        jobs,
        plan,
        stack,
        worldSeed,
        ...(occupancy === undefined ? {} : { occupancy }),
        reserved: (layoutOutcome?.placements ?? []).map((p) => p.footprint),
        // The theme the village resolved to, for furnishing a landmark's
        // interiors. A shrine's inside has to agree with the houses outside it.
        ...(structures === undefined ? {} : { themeId: structures.stats.theme }),
        // The pads, aprons and skirts a plugin's sites get are declared, not
        // written: §3.12 excused this pass from the contract when it had no
        // ground of its own to claim, and it has now.
        ...(groundDriver === undefined ? {} : { ground: groundDriver }),
      });
      diagnostics.push(...programs.diagnostics);
      // What a program stands on is claimed ground: the scatter that follows
      // must not plant a tree through a saucer.
      if (occupancy !== undefined) claimProgramFootprints(occupancy, programs.placed);
    }
  }
  const programsMs = now() - tPrograms;

  // --- pass 5c: the settlement clearing and the vegetation clip ------------
  // Both are derived from what the structure pass actually built, and both are
  // consumed by the scatter that follows: the clearing decides where trees may
  // stand at all, the clip decides which of a standing tree's voxels survive.
  // FARM-PLAN §9.1: a holding's envelope is deliberately **not** a hull
  // contributor. The hull is convex over footprints, so a holding 40 blocks out
  // would drag it into a wedge and fell the wood between — the exact failure
  // `CLEARING_LINK_DISTANCE`'s clustering exists to avoid. The fields are
  // written into the density field directly, below, which keeps the hull honest.
  const clearingHolds = new Set(structures?.farms?.nodePaths ?? []);
  const clearingRects =
    layoutOutcome === undefined
      ? []
      : clearingHolds.size === 0
        ? layoutOutcome.placements.map((p) => p.footprint)
        : layoutOutcome.placements
            .filter((p) => !clearingHolds.has(p.nodePath))
            .map((p) => p.footprint);
  const settlementClearing =
    clearingRects.length === 0
      ? undefined
      : buildSettlementClearing(
          region,
          clearingRects,
          // Its own stream: the treeline's wobble must not move when an
          // unrelated pass draws from the root seed.
          seed32(nodeSeed(worldSeed, rootPath, "clearing")),
        );
  // §9.1's suppression, written into the density field rather than into the
  // hull: a field is cleared ground by definition, and so is the yard. A world
  // with no holding keeps the settlement's own answer, by reference.
  const farmed =
    structures?.farms === undefined
      ? settlementClearing
      : suppressFarmClearing(region, settlementClearing, structures.farms);
  // RUINS-PLAN §7.4, the reclaim: the clearing is 0 inside the settlement hull,
  // which is precisely why no tree has ever grown in a town. Over ruined ground
  // it is lifted back up, so the wood comes back **through** the fabric rather
  // than stopping at its edge. The kit's standing
  // `avoidTags: ["structure", "road", "plaza"]` is what keeps those trees out
  // of the shells and off the streets — this changes no occupancy claim, only
  // a density, which is the whole difference between the two.
  const clearing =
    structures?.ruinField === undefined
      ? farmed
      : liftColonizedClearing(
          liftRuinClearing(region, farmed, structures.ruinField.field),
          structures.greenSkin,
        );
  const clip =
    structures === undefined
      ? undefined
      : makeStructureClip(
          region,
          [
            ...structureBoxes(structures.buildings),
            ...(structures.roads === undefined
              ? []
              : roadCorridorBoxes(structures.roads.routes, structures.roads.width)),
          ],
          // The plaza is paving, not a solid: it clips nothing, but ground
          // decor still keeps its apron off the green.
          structures.plaza?.paved,
        );

  // --- pass 6: vegetation --------------------------------------------------
  const t3 = now();
  const forestNodes: ForestNodeInput[] = children
    .filter((c): c is ForestNode => c.generator === "scatter.forest@0")
    .map((node) => ({
      id: node.id,
      nodePath: `${rootPath}.${node.id}`,
      seed: nodeSeed(worldSeed, `${rootPath}.${node.id}`, node.seedSalt ?? ""),
      params: node.params,
    }));
  // How green this settlement keeps its own unbuilt ground, as a share of the
  // ambient wood. One number, read twice: it is the town green's density and the
  // settlement-edge feather's inner endpoint, which is what keeps the two sides
  // of the boundary one field rather than two mechanisms with a trough between.
  const greenShare = fanOut<number>(TERRAIN_ROWS.settlementGreenery, intents.root, {
    nodePath: rootPath,
    today: TOWN_GREEN_DENSITY,
  });
  // §7.4's other half. The lift above raises a *density*; this hands the scatter
  // the field itself, because the eligibility mask — not the density — is what
  // actually keeps a tree out of a settlement, and a lift on ground the mask has
  // already excluded plants nothing. Threaded rather than global, and **by
  // reference when there is no ruin field**: a document that ruined nothing
  // hands the scatter the very object it handed it before F19, so the reclaim is
  // structurally absent rather than conditionally skipped.
  const scatterOccupancy =
    occupancy === undefined || structures?.ruinField === undefined
      ? occupancy
      : {
          ...occupancy,
          ruin: structures.ruinField.field,
          ruinPaved: streetBandColumns(region, structures.districts),
          // WP-6 §6.1: the street law's own election, and Kai's Q5 shells.
          // Both are `undefined` on a world the skin did not run on, and the
          // skin does not run without a ruin field — so the closure is exactly
          // as closed as it was everywhere it was.
          ...(structures.greenSkin === undefined
            ? {}
            : {
                ruinColonized: structures.greenSkin.colonized,
                ruinShellTrunks: structures.greenSkin.shellTrunks,
              }),
        };
  // §6: the `character.flora` row. Neutral for every document that says nothing
  // about flora, which is what makes the whole row byte-identical (fan-out law
  // 2, and the intent byte-identity suite is the proof).
  const floraBias = fanOut<FloraBias>(FLORA_ROWS.composition, intents.root, {
    nodePath: rootPath,
    today: NO_FLORA_BIAS,
  });
  const scatter = scatterForests(
    forestNodes,
    plan,
    classification,
    palette,
    scatterOccupancy,
    clearing?.density,
    // §5.2: the strata tables are per climate theme, and a forest node does not
    // carry one — it is resolved by ambient majority over the node's own mask.
    {
      temperature: climate.temperature,
      humidity: climate.humidity,
      centers: THEME_CENTERS,
      themes: CLIMATE_THEMES,
    },
    // What the structure passes actually put blocks on, for the town green
    // (`townGreenMask`): the scatter itself never reads it. The blocks, not the
    // claims — a district street and a stair flight write no occupancy tag, and
    // the first run of the green grew grass on both.
    structures === undefined
      ? undefined
      : builtColumnMask(
          region,
          programs?.blocks ?? [],
          builtColumnMask(
            region,
            structures.blocks,
            clip === undefined ? undefined : Uint8Array.from(clip.columns),
          ),
        ),
    greenShare,
    // The solids a crown would be cut against, for the street fit
    // (`wallRoom`). Absent for a terrain-profile compile, and read only where
    // the street law elected a trunk.
    clip?.columns,
    floraBias,
  );
  // F21: a forest node that planted nothing is author-actionable, and in the
  // feedback set — the ruins world lost a whole canopy to silence.
  diagnostics.push(...scatter.diagnostics);
  // A tree that a building would eat most of was never really there; the
  // survivors keep their placements and lose only the voxels that intersect.
  // WP-6 §6.4: the elected trunks are exempt from the clip. Everything else in
  // the wood is clipped exactly as it always was.
  const electedTrunks = structures?.greenSkin;
  const exemptTrunk =
    electedTrunks === undefined
      ? undefined
      : (x: number, z: number): "whole" | "wood" | undefined => {
          const i = x - region.x0;
          const j = z - region.z0;
          if (i < 0 || j < 0 || i >= region.width || j >= region.depth) return undefined;
          const k = j * region.width + i;
          return electedTrunks.colonized[k] === 1 || electedTrunks.shellTrunks[k] === 1
            ? "wood"
            : undefined;
        };
  const clipped = clip === undefined ? undefined : clipTrees(scatter.trees, clip, (x, z) => exemptTrunk?.(x, z) !== undefined);
  const standing = clipped?.trees ?? scatter.trees;
  // --- pass 6b: the clearing transition band (fabric v2, F2) ---------------
  // A post-pass over the planted forest, and it has to be: whether a settlement
  // abuts dense wood is not answerable before the wood exists. It fells the
  // inner band outright, keeps one tree in six through the outer band, and
  // leaves stumps and fallen logs where it took them.
  const transition =
    clearing === undefined || clearing.hulls.length === 0
      ? undefined
      : buildTransitionBand({
          plan,
          hulls: clearing.hulls,
          trees: standing,
          palette,
          stack,
          seed: seed32(nodeSeed(worldSeed, rootPath, "transition")),
          ...(occupancy === undefined ? {} : { occupancy }),
          avoid: transitionAvoid(clip, layoutOutcome?.placements ?? []),
        });
  const trees = transition?.trees ?? standing;
  const decoration = decorate({
    plan,
    classification,
    temperature: climate.temperature,
    trees,
    forests: scatter.nodes,
    palette,
    stack,
    ...(clip === undefined ? {} : { clip }),
    greenShare,
    seed: rootSeed,
  });
  // Cave dressing rides the same decoration list: it is the same kind of thing
  // (absolute-positioned blocks stamped after the column fill) and it cannot
  // collide, because every block it places is inside a carved span and every
  // block the surface pass places is at or above the ground.
  const caveDecor = decorateCaves(plan, palette, stack, rootSeed);
  const scatterMs = now() - t3;

  // --- pass 6c: the urban floor (2026-08-11) -------------------------------
  // The ground between the buildings of a *walled* town, packed to earth. Here
  // and nowhere else in the pipeline: the pass must not convert a column
  // anything grows on, and until the scatter and the decoration pass have run
  // there is nothing growing to protect. It writes `plan.surface` only — the
  // material half of the ground contract — so it cannot argue with the
  // `GroundDriver` about where the ground is.
  //
  // The gate is the wall circuit. `structures.walls` is empty for every world
  // that never rings itself, and an empty circuit list is an early return, so
  // an unwalled world is byte-identical.
  const settlementTheme = materialThemeById(structures?.stats.theme);
  const urbanFloor: UrbanFloorResult | undefined =
    structures === undefined || structures.walls.length === 0
      ? undefined
      : layUrbanFloor({
          plan,
          palette,
          stack,
          seed: seed32(nodeSeed(worldSeed, rootPath, "urban-floor")),
          circuits: structures.walls.map((w) => w.course.vertices),
          ...(settlementTheme === undefined ? {} : { theme: settlementTheme }),
          trees,
          // Everything growing and everything built, from every pass that has
          // run: a plant this pass cannot see is a plant it would repaint the
          // soil out from under.
          decor:
            transition === undefined
              ? decoration.blocks
              : [...decoration.blocks, ...transition.blocks],
          laid:
            programs === undefined
              ? structures.blocks
              : [...structures.blocks, ...programs.blocks],
        });

  // --- pass 4b: biomes -----------------------------------------------------
  const t4 = now();
  // The land-use clamp's mask is a pure function of the *finished* placement,
  // which is why it is built here rather than in the structures pass.
  const landUseMask = landUseMaskOf(plan, structures, layoutOutcome?.placements ?? []);
  const painted = paintBiomes(plan, classification, climate, scatter.coverage, stack, {
    mask: landUseMask,
    nodePath: rootPath,
    // Precedence rung 1 of the biome contract, arriving through the registry:
    // `landuse.ts` declared this seam and left it undefined for Phase 2.
    ...(() => {
      const climateIntent = fanOut<ClimateIntent | undefined>(TERRAIN_ROWS.landUse, intents.root, {
        nodePath: rootPath,
        today: undefined,
      });
      return climateIntent === undefined ? {} : { intent: climateIntent };
    })(),
    // `intent.climate.blend` — how wide the clamp's feather band reads.
    ...(() => {
      const feather = fanOut<number | undefined>(TERRAIN_ROWS.blend, intents.root, {
        nodePath: rootPath,
        today: undefined,
      });
      return feather === undefined ? {} : { feather };
    })(),
    // The arid ambient bias: the settlement theme's own declaration, and the
    // one thing that outranks it — an author who declared the *country* cold or
    // wet. An authored `climate.biome` is not that declaration and is not read
    // here: it names the settlement's own ground and the clamp already honours
    // it at rung 1, which is why Troy's footprint stays `beach` while the
    // country round it goes gold.
    ...(() => {
      const arid = settlementTheme?.aridAmbient === true;
      if (!arid) return {};
      const climateIntent = fanOut<ClimateIntent | undefined>(TERRAIN_ROWS.landUse, intents.root, {
        nodePath: rootPath,
        today: undefined,
      });
      const offsets = fanOut<ClimateOffsets>(TERRAIN_ROWS.offsets, intents.root, {
        nodePath: rootPath,
        today: NO_CLIMATE_OFFSET,
      });
      const authored = climateOutranksArid({
        ...(climateIntent?.biome === undefined ? {} : { biome: climateIntent.biome }),
        ...(climateIntent?.snow === undefined ? {} : { snow: climateIntent.snow }),
        temperature: offsets.temperature,
        humidity: offsets.humidity,
      });
      return { arid: { arid, authored } };
    })(),
  });
  // FARM-PLAN §8, last clause: the parcel mask forces `snow = 0` on every
  // parcel and yard column, as `grounds.ts` already does for worn columns. The
  // clamp has just had its say about the biome; snow over a crop is not a
  // season, it is a compile that disagreed with itself.
  if (structures?.farms !== undefined) {
    const { parcelMask, yardMask } = structures.farms;
    for (let idx = 0; idx < plan.snow.length; idx++) {
      if (parcelMask[idx] === 1 || yardMask[idx] === 1) plan.snow[idx] = 0;
    }
  }
  const biomeHistogram = painted.histogram;
  diagnostics.push(...painted.clamp.diagnostics);
  const biomesMs = now() - t4;

  // --- pass 7: validators --------------------------------------------------
  const t5 = now();
  const fluids = checkFluidStability(plan);
  const floating = checkFloatingVegetation(plan, trees);
  const caveIntegrity = checkCaveIntegrity(plan);
  const tunnelIntegrity = checkTunnelIntegrity(plan, structures?.tunnels ?? [], structures?.buildings ?? []);
  diagnostics.push(
    ...validatorDiagnostics(fluids, floating, { allowUnstable: options.allowUnstable ?? false }),
    ...caveDiagnostics(caveIntegrity, rootPath),
    ...tunnelDiagnostics(tunnelIntegrity, rootPath),
  );
  const validatorsMs = now() - t5;

  if (hasErrors(diagnostics)) {
    return { ok: false, diagnostics };
  }

  // --- pass 8: emit --------------------------------------------------------
  options.onColumnPlan?.(plan);
  const markers = [
    ...classification.markers,
    ...terrain.edits.markers,
    ...(plan.caves?.markers ?? []),
    ...(programs?.markers ?? []),
  ];
  const structureBlocks =
    structures === undefined && programs === undefined
      ? undefined
      : [...(structures?.blocks ?? []), ...(programs?.blocks ?? [])];
  const spawnResult = resolveSpawn(doc, plan, markers, diagnostics, rootPath);
  const t6 = now();
  const emitInput = {
    plan,
    trees,
    decor: [...caveDecor.blocks, ...decoration.blocks, ...(transition?.blocks ?? [])],
    ...(structureBlocks === undefined ? {} : { structures: structureBlocks }),
    ...(clip === undefined ? {} : { clip }),
    ...(exemptTrunk === undefined ? {} : { clipExempt: exemptTrunk }),
    stack,
    worldDir: options.outDir,
    levelName: doc.meta.name,
    spawn: spawnResult,
  };
  options.onArtifacts?.({
    plan,
    trees,
    decor: emitInput.decor,
    ...(structureBlocks === undefined ? {} : { structures: structureBlocks }),
    ...(clip === undefined ? {} : { clip }),
    spawn: spawnResult,
    stack,
  });
  const emit =
    options.skipEmit === true ? unwrittenEmit(stack, spawnResult) : await emitTerrain(emitInput);
  const emitMs = now() - t6;

  // --- the walkability audit (opt-in) --------------------------------------
  // After the emit and never before it: this reads the world on disk, because
  // the whole point is to measure what the passes added up to rather than what
  // any one of them declared.
  const walkability =
    options.walkability === undefined ||
    options.walkability === false ||
    options.skipEmit === true ||
    structures === undefined
      ? undefined
      : await auditWalkability(options.outDir, stack, {
          ...walkabilityContextOf(plan, structures, {
            ...(structures.districts[0] === undefined
              ? {}
              : { town: structures.districts[0].bounds }),
          }),
          ...(options.walkability === true ? {} : options.walkability),
        });

  let land = 0;
  let volcanicColumns = 0;
  let lavaFlowColumns = 0;
  for (let k = 0; k < plan.ground.length; k++) {
    if ((plan.ground[k] as number) >= plan.seaLevel) land++;
    if (plan.volcanic[k] === 1) volcanicColumns++;
    if (plan.lavaFlow[k] === 1) lavaFlowColumns++;
  }

  const report: TerrainCompileReport = {
    name: doc.meta.name,
    ...(doc.meta.prompt === undefined ? {} : { prompt: doc.meta.prompt }),
    ...(options.provenance === undefined ? {} : { provenance: options.provenance }),
    worldSeed: worldSeed.toString(),
    markers,
    stats: {
      region,
      columns: plan.ground.length,
      minHeight: classification.minHeight,
      maxHeight: classification.maxHeight,
      snowLine: classification.snowLine,
      seaLevel: terrain.params.seaLevel,
      landFraction: plan.ground.length === 0 ? 0 : land / plan.ground.length,
      treeCount: trees.length,
      treesPerNode: scatter.perNode,
      ...(scatter.strata.length === 0 ? {} : { strata: scatter.strata }),
      unstableFluidBlocks: fluids.unstable,
      floatingTrees: floating.length,
      biomeHistogram,
      chunkCount: emit.chunkCount,
      blockCount: emit.blockCount,
      treeBlockCount: emit.treeBlockCount,
      decorBlockCount: emit.decorBlockCount,
      decorCounts: decoration.counts,
      caves: {
        systems: plan.caves?.systems ?? 0,
        chambers: plan.caves?.chambers ?? 0,
        carvedBlocks: plan.caves?.carvedBlocks ?? 0,
        entrances: plan.caves?.markers.length ?? 0,
        decorBlocks: caveDecor.blocks.length,
        decorCounts: caveDecor.counts,
      },
      volcanicColumns,
      lavaFlowColumns,
      clearedColumns: clearing?.clearedColumns ?? 0,
      clippedTrees: clipped?.dropped ?? 0,
      felledTrees: transition?.felled ?? 0,
      transitionStumps: transition?.stumps ?? 0,
      transitionLogs: transition?.logs ?? 0,
      clippedTreeBlocks: clipped?.clippedBlocks ?? 0,
      ...(urbanFloor === undefined ? {} : { urbanFloor }),
      pondChains: Object.fromEntries(
        terrain.ponds.map((p) => [p.editId, p.ponds] as const).sort(([a], [b]) => (a < b ? -1 : 1)),
      ),
      ...(structures === undefined ? {} : { structures: structures.stats }),
      ...(programs === undefined ? {} : { programs: programStatsOf(programJobs, programs.placed) }),
    },
    diagnostics,
    ...(structures?.farms === undefined ? {} : { farms: structures.farms.farms }),
    ...(layoutOutcome === undefined ? {} : { layout: layoutOutcome }),
    timings: {
      validate: clock.validateMs,
      field: fieldMs,
      layout: layoutMs,
      climate: climateMs,
      columns: columnsMs,
      caves: cavesMs,
      structures: structuresMs,
      programs: programsMs,
      scatter: scatterMs,
      biomes: biomesMs,
      validators: validatorsMs,
      emit: emitMs,
      total: now() - clock.started,
    },
    emit,
  };
  return {
    ok: true,
    report,
    ...(groundEquivalence === undefined ? {} : { groundEquivalence }),
    ...(walkability === undefined ? {} : { walkability }),
  };
}

/* -------------------------------------------------------------------------- */

/**
 * The emit summary of a compile that emitted nothing.
 *
 * Every count is zero and every path is empty, deliberately: a `skipEmit`
 * compile wrote no chunk, and the one thing this value must never do is let a
 * caller mistake it for a world on disk.
 */
function unwrittenEmit(
  stack: ReturnType<typeof loadPrismarine>,
  spawn: { x: number; y: number; z: number },
): TerrainEmitSummary {
  return {
    worldDir: "",
    levelDatPath: "",
    regionDir: "",
    regionFiles: [],
    chunkCount: 0,
    blockCount: 0,
    treeBlockCount: 0,
    decorBlockCount: 0,
    structureBlockCount: 0,
    blockEntityCount: 0,
    minecraftVersion: stack.minecraftVersion,
    dataVersion: stack.dataVersion,
    spawn: [spawn.x, spawn.y, spawn.z],
    connections: { examined: 0, rewritten: 0 },
    growth: { examined: 0, rewritten: 0, dropped: 0 },
    flora: { examined: 0, dropped: 0 },
  };
}

/**
 * The document's style with the world-scope character's palette overrides
 * merged over it.
 *
 * `character.palettes` is a **merge over** `style.palettes` within the node's
 * subtree; today the palette is resolved once for the whole region, so the row
 * that reaches the compiler is the world-scope one. A subtree-local palette
 * needs the palette resolver to become per-node, which is Phase 4's business —
 * this is the honest half of the row, not a stand-in for it.
 *
 * With no intent declared it returns `style` **by reference**, so the palette
 * resolver sees the identical object it saw before this function existed.
 */
function styleWithIntent(
  style: TerrainDocument["style"],
  intents: IntentResolution,
): TerrainDocument["style"] {
  const overrides = intents.root.intent.character?.palettes;
  if (overrides === undefined || Object.keys(overrides).length === 0) return style;
  return { ...style, palettes: { ...(style?.palettes ?? {}), ...overrides } };
}

/**
 * The land-use mask for the biome clamp — every claimed footprint, unioned.
 *
 * Per the Phase 0 contract §4: district and city cells, precinct envelopes,
 * building pads, and the road/arterial/street `claimed` masks. Per **ratified
 * disposition 8**, camp *cores* would contribute here and farmland never does;
 * neither has a generator in the profile yet, so `campCores` stays the
 * documented seam it is in `landuse.ts` rather than a dead parameter here.
 */
function landUseMaskOf(
  plan: ReturnType<typeof buildColumnPlan>,
  structures: StructurePassResult | undefined,
  placements: readonly Placement[],
): Uint8Array {
  const { region } = plan;
  if (structures === undefined) {
    return new Uint8Array(region.width * region.depth);
  }
  const cells: MaskRect[] = structures.districts.map((d) => d.bounds);
  // Every placement the solver seated: precinct envelopes and building pads
  // alike. This is the same footprint list the clearing pass calls "the
  // settlement", which is exactly the coherence unit the clamp is about.
  //
  // Minus the farm holdings, and that exclusion is FARM-PLAN §8 in one line: a
  // holding's *envelope* is mostly ground nobody touched, and clamping it is
  // the soft-mask failure ratified disposition 8 refused. What the holding does
  // contribute is its parcel and yard rectangles, below.
  const holdings = new Set(structures.farms?.nodePaths ?? []);
  const pads: MaskRect[] =
    holdings.size === 0
      ? placements.map((p) => p.footprint)
      : placements.filter((p) => !holdings.has(p.nodePath)).map((p) => p.footprint);
  const columns: Uint8Array[] = [];
  if (structures.roads !== undefined) columns.push(structures.roads.roadColumns);
  if (structures.streets !== undefined) columns.push(structures.streets.road);
  if (structures.plaza !== undefined) columns.push(structures.plaza.paved);
  return buildLandUseMask(region, {
    cells,
    pads,
    columns,
    // FARM-PLAN §8, ratified by Kai 2026-08-09: parcel and yard rects join the
    // clamp exactly as a camp core does. A wheat field inside `windswept_hills`
    // with that biome's snow decision applied to it is not a wheat field.
    ...(structures.farms === undefined ? {} : { farmParcels: structures.farms.landUseRects }),
  });
}

/**
 * FARM-PLAN §9.1 — the clearing over a holding.
 *
 * > `clearing[idx] := 0` on every parcel and yard column, and on a 4-column
 * > margin around the holding's parcel union.
 *
 * Deliberately **not** done by adding parcels to the settlement hull: the hull
 * is convex over footprints, and a holding 40 blocks out would drag it into a
 * wedge and fell the wood between. Writing the field directly keeps the hull
 * honest — and it is also the only way a holding standing alone, with no
 * settlement to make a hull out of, clears its own fields at all.
 */
function suppressFarmClearing(
  region: Region,
  settlement: SettlementClearing | undefined,
  farms: { readonly parcelMask: Uint8Array; readonly yardMask: Uint8Array },
): SettlementClearing {
  const cells = region.width * region.depth;
  const density =
    settlement === undefined ? new Float32Array(cells).fill(1) : settlement.density;
  const hulls = settlement?.hulls ?? [];
  for (let j = 0; j < region.depth; j++) {
    for (let i = 0; i < region.width; i++) {
      const idx = j * region.width + i;
      if (farms.yardMask[idx] === 1) {
        density[idx] = 0;
        continue;
      }
      if (farms.parcelMask[idx] === 1) {
        density[idx] = 0;
        continue;
      }
      // The margin, measured off the parcel union only: it is the band that
      // stops a canopy leaning over a field, and a yard already has buildings
      // whose own clip keeps the wood off them.
      if (nearParcel(region, farms.parcelMask, i, j)) density[idx] = 0;
    }
  }
  let cleared = 0;
  for (let k = 0; k < density.length; k++) if (density[k] === 0) cleared++;
  return { hulls, density, clearedColumns: cleared };
}

/**
 * How much canopy the ruin field lets back inside the clearing (§7.4).
 *
 * Not 1: a ruined quarter is overgrown, not a forest that ate a town — the
 * streets and the standing shells still have to read from the air. 0.8 is
 * dense enough that "overgrowth dominates" is true of a walk through it.
 */
export const RECLAIM_CANOPY_GAIN = 0.8;

/**
 * §7.4's lift: `clearing := max(clearing, ruin · RECLAIM_CANOPY_GAIN)`.
 *
 * Exported for the WP-4 test, which measures the arithmetic directly: the
 * clearing is one of two gates on a tree inside a settlement, and the other one
 * (`forestEligibility`'s unconditional occupancy exclusion) is not this
 * module's to open.
 */
export function liftRuinClearing(
  region: Region,
  clearing: SettlementClearing | undefined,
  ruin: Float32Array,
): SettlementClearing {
  const cells = region.width * region.depth;
  const density = clearing === undefined ? new Float32Array(cells).fill(1) : clearing.density;
  if (ruin.length !== cells) {
    return clearing ?? { hulls: [], density, clearedColumns: 0 };
  }
  for (let k = 0; k < cells; k++) {
    const lifted = (ruin[k] as number) * RECLAIM_CANOPY_GAIN;
    if (lifted > (density[k] as number)) density[k] = lifted;
  }
  let cleared = 0;
  for (let k = 0; k < density.length; k++) if (density[k] === 0) cleared++;
  return { hulls: clearing?.hulls ?? [], density, clearedColumns: cleared };
}

/**
 * §6.4's coupling: `clearing[idx] := 1` on every elected column.
 *
 * > An elected column is one the street law has already decided should carry a
 * > tree; the scatter's job there is to say *which* tree, not whether.
 *
 * Without it the feature is inert at exactly the place it is supposed to be
 * loudest: {@link RECLAIM_CANOPY_GAIN} raises a *density*, and a density of 0.8
 * on a lattice with spacing 5–7 declines most elected columns. The lift stays
 * as it is for the surrounding open ground — this touches only the columns the
 * election, the spine, the junction clearance, the sight-line law, the spacing
 * and the U2 withdraw loop have already agreed on.
 */
function liftColonizedClearing(
  clearing: SettlementClearing,
  skin: { readonly colonized: Uint8Array; readonly shellTrunks: Uint8Array } | undefined,
): SettlementClearing {
  if (skin === undefined) return clearing;
  const { density } = clearing;
  let cleared = 0;
  for (let k = 0; k < density.length; k++) {
    if (skin.colonized[k] === 1 || skin.shellTrunks[k] === 1) density[k] = 1;
    if (density[k] === 0) cleared++;
  }
  return { hulls: clearing.hulls, density, clearedColumns: cleared };
}

/** §9.1's 4-column margin around the parcel union, chebyshev. */
const FARM_CLEARING_MARGIN = 4;

function nearParcel(region: Region, mask: Uint8Array, i: number, j: number): boolean {
  const i0 = Math.max(0, i - FARM_CLEARING_MARGIN);
  const i1 = Math.min(region.width - 1, i + FARM_CLEARING_MARGIN);
  const j0 = Math.max(0, j - FARM_CLEARING_MARGIN);
  const j1 = Math.min(region.depth - 1, j + FARM_CLEARING_MARGIN);
  for (let b = j0; b <= j1; b++) {
    for (let a = i0; a <= i1; a++) {
      if (mask[b * region.width + a] === 1) return true;
    }
  }
  return false;
}

/**
 * Assign every column its biome id, and count the result.
 *
 * Two steps, in precedence order (Phase 0 contract §4): the climate-derived
 * rule paints every column, then the land-use clamp takes back the ground a
 * settlement claims. The clamp also rewrites `plan.snow`, which is why this
 * pass runs before emit and after the structures pass.
 */
function paintBiomes(
  plan: ReturnType<typeof buildColumnPlan>,
  classification: Classification,
  climate: ReturnType<typeof buildClimateFields>,
  coverage: Uint8Array,
  stack: ReturnType<typeof loadPrismarine>,
  landUse: {
    readonly mask: Uint8Array;
    readonly nodePath: string;
    /** Precedence rung 1 — `intent.climate`, resolved by the intent layer. */
    readonly intent?: ClimateIntent;
    /** `intent.climate.blend` in columns; undefined = the size-scaled default. */
    readonly feather?: number;
    /**
     * The arid ambient bias (2026-08-11): whether the settlement's theme calls
     * itself dry, and whether the author named a climate that outranks it.
     * Absent — every world with no settlement theme — is "not arid", which is
     * an identity.
     */
    readonly arid?: Omit<AridBiasInput, "temperature">;
  },
): { histogram: Record<string, number>; clamp: LandUseClampResult } {
  const ids = new Map<string, number>();
  const histogram: Record<string, number> = {};

  const base: ProfileBiome[] = new Array<ProfileBiome>(plan.ground.length);
  for (let idx = 0; idx < plan.ground.length; idx++) {
    base[idx] = biomeForColumn({
      surfaceClass: classification.classes[idx] as number,
      groundY: plan.ground[idx] as number,
      relief: classification.relief[idx] as number,
      seaLevel: plan.seaLevel,
      temperature: climate.temperature[idx] as number,
      forested: coverage[idx] === 1,
      lake: plan.lakeMask[idx] === 1,
      volcanicUpper: plan.volcanicUpper[idx] === 1,
    });
  }

  // The arid ambient bias, applied to the **derived** layer, which is what
  // "at derivation" means: the grassland family of a dry-themed world reads as
  // savanna gold rather than as temperate green. Identity for every world whose
  // theme does not declare itself arid, and switched off entirely by an
  // authored climate — see `aridAmbientBiome`.
  //
  // The clamp runs next and reads this layer, so a settlement's own ground
  // follows the country it stands in exactly as it always has: the clamp's
  // ambient-majority vote is untouched machinery, handed drier ground.
  if (landUse.arid?.arid === true && landUse.arid.authored !== true) {
    for (let idx = 0; idx < base.length; idx++) {
      base[idx] = aridAmbientBiome(base[idx] as ProfileBiome, {
        arid: true,
        authored: false,
        temperature: climate.temperature[idx] as number,
      });
    }
  }

  const clamp = clampLandUse({
    width: plan.region.width,
    depth: plan.region.depth,
    x0: plan.region.x0,
    z0: plan.region.z0,
    mask: landUse.mask,
    base,
    snow: plan.snow,
    surfaceClass: classification.classes,
    temperature: climate.temperature,
    forested: coverage,
    nodePath: landUse.nodePath,
    ...(landUse.intent === undefined ? {} : { intent: landUse.intent }),
    ...(landUse.feather === undefined ? {} : { feather: landUse.feather }),
  });
  if (clamp.snow !== plan.snow) plan.snow.set(clamp.snow);

  for (let idx = 0; idx < plan.ground.length; idx++) {
    const name = clamp.biome[idx] as ProfileBiome;
    let id = ids.get(name);
    if (id === undefined) {
      const resolved = stack.biomeIdByName(name);
      /* c8 ignore next 3 */
      if (resolved === undefined) {
        throw new Error(`compileTerrain: unknown biome "${name}" in ${stack.minecraftVersion}`);
      }
      id = resolved;
      ids.set(name, id);
    }
    plan.biome[idx] = id;
    histogram[name] = (histogram[name] ?? 0) + 1;
  }

  return {
    histogram: Object.fromEntries(Object.entries(histogram).sort(([a], [b]) => (a < b ? -1 : 1))),
    clamp,
  };
}

/**
 * Resolve the spawn point.
 *
 * An explicit `meta.spawn` wins when the column it names is dry land; when it
 * is not (a `zone` that happens to sit in a fjord, say) the compiler falls
 * back to the `largest_flat` marker and says so, rather than dropping the
 * player into the sea.
 */
function resolveSpawn(
  doc: TerrainDocument | SettlementDocument,
  plan: ReturnType<typeof buildColumnPlan>,
  markers: readonly Marker[],
  diagnostics: LoamDiagnostic[],
  rootPath: string,
): { x: number; y: number; z: number } {
  const { region } = plan;
  const requested = doc.meta.spawn;

  if (requested !== undefined) {
    const [fx, fz] = "at" in requested ? requested.at : zoneFraction(requested.zone);
    const x = Math.round(region.x0 + fx * (region.width - 1));
    const z = Math.round(region.z0 + fz * (region.depth - 1));
    const exact = dryLandAt(plan, x, z);
    if (exact !== null) return exact;
    const nearby = dryLandNear(plan, x, z);
    if (nearby !== null) {
      diagnostics.push(
        warning(
          "SPAWN_UNRESOLVED",
          `${rootPath}.meta.spawn`,
          `the requested spawn at (${x}, ${z}) is under water or too close to sea level; moved to (${nearby.x}, ${nearby.z})`,
          'move "meta.spawn" onto land — pick a zone or "at" fraction over terrain at least two blocks above sea level',
        ),
      );
      return nearby;
    }
    diagnostics.push(
      warning(
        "SPAWN_UNRESOLVED",
        `${rootPath}.meta.spawn`,
        `the requested spawn near (${x}, ${z}) is under water or off the map; falling back to the largest flat area`,
        'move "meta.spawn" onto land — try a zone away from the coast, or an "at" fraction over the terrain you want the player to see first',
      ),
    );
  }

  const flat = markers.find((m) => m.name === "largest_flat") ?? markers.find((m) => m.name === "highest_point");
  if (flat !== undefined) {
    const spot = dryLandNear(plan, flat.x, flat.z);
    if (spot !== null) return spot;
  }
  return { x: 0, y: plan.seaLevel + 2, z: 0 };
}

/** The spawn point at exactly `(x, z)`, or null when that column is not dry land. */
function dryLandAt(
  plan: ReturnType<typeof buildColumnPlan>,
  x: number,
  z: number,
): { x: number; y: number; z: number } | null {
  const { region, ground, fluidKind, seaLevel } = plan;
  const i = x - region.x0;
  const j = z - region.z0;
  if (i < 0 || j < 0 || i >= region.width || j >= region.depth) return null;
  const idx = j * region.width + i;
  if (fluidKind[idx] !== 0) return null;
  const y = ground[idx] as number;
  return y >= seaLevel + 2 ? { x, y: y + 1, z } : null;
}

/** The nearest dry column to `(x, z)`, searched in expanding rings. */
function dryLandNear(
  plan: ReturnType<typeof buildColumnPlan>,
  x: number,
  z: number,
): { x: number; y: number; z: number } | null {
  const { region, ground, fluidKind, seaLevel } = plan;
  const maxRing = Math.max(region.width, region.depth);
  for (let ring = 0; ring < maxRing; ring += 4) {
    for (let dz = -ring; dz <= ring; dz += ring === 0 ? 1 : ring) {
      for (let dx = -ring; dx <= ring; dx += ring === 0 ? 1 : ring) {
        const i = x + dx - region.x0;
        const j = z + dz - region.z0;
        if (i < 0 || j < 0 || i >= region.width || j >= region.depth) continue;
        const idx = j * region.width + i;
        if (fluidKind[idx] !== 0) continue;
        const y = ground[idx] as number;
        if (y < seaLevel + 2) continue;
        return { x: x + dx, y: y + 1, z: z + dz };
      }
    }
  }
  return null;
}

/**
 * Columns the layout solver must never build on: ocean, inland lake, and the
 * lava inside a caldera.
 *
 * This is computed here rather than in the solver because it is the compiler
 * that knows what the edit composition produced — the solver runs before any
 * block exists and has only the field, the classification, and this mask.
 */
/**
 * `road.network@0.corridors()` for the document's road node, at substage 3b.
 *
 * The lane width the reservation is sized from is the *same* `width` the pass-6
 * router will surface, read through the same `roadParamsOf` shorthand, because
 * a corridor sized from one number and a lane surfaced from another is a
 * corridor that does not fit its road.
 */
function roadNetworkCorridors(
  doc: SettlementDocument,
  rootPath: string,
  region: Region,
  nodes: readonly LayoutNodeInput[],
): RouteCorridor[] {
  const roadNode = doc.root.children.find(
    (c) => c.kind === "generator" && c.generator === "road.network@0",
  );
  if (roadNode === undefined) return [];
  const params = (roadNode as { params?: Record<string, unknown> }).params ?? {};
  const anchors = Array.isArray(params["anchors"])
    ? (params["anchors"] as unknown[]).filter((a): a is string => typeof a === "string")
    : [];
  const width = roadParamsOf(params).width ?? 3;
  return registerRoadCorridors(`${rootPath}.${roadNode.id}`, anchors, nodes, region, width);
}

/**
 * Summit points for the `@terrain:peak` product.
 *
 * Restricted to the two verbs that actually make a summit. Every radial edit
 * emits a marker named `peak` — a `plateau`'s "peak" is the middle of a flat
 * table and an `island`'s is a beach hump — and treating those as peaks would
 * make `{"on": "@terrain:peak"}` mean "on any radial edit", which is not a
 * thing anyone would ask for.
 */
function peakPoints(
  heightfield: { readonly children?: readonly { readonly id: string; readonly params: { readonly verb?: string } }[] },
  markers: readonly { readonly id: string; readonly name: string; readonly x: number; readonly z: number }[],
): { x: number; z: number }[] {
  const summits = new Set(
    (heightfield.children ?? [])
      .filter((c) => c.params.verb === "peak" || c.params.verb === "volcano")
      .map((c) => c.id),
  );
  return markers
    .filter((m) => m.name === "peak" && summits.has(m.id.split(".")[0] as string))
    .map((m) => ({ x: m.x, z: m.z }));
}

function buildHazardMask(
  region: Region,
  classification: Classification,
  calderas: readonly { readonly lava: boolean; readonly columns: Int32Array }[],
  options: { readonly water?: boolean } = {},
): Uint8Array {
  const mask = new Uint8Array(region.width * region.depth);
  if (options.water !== false) {
    for (let k = 0; k < mask.length; k++) {
      if (classification.oceanMask[k] === 1 || classification.lakeMask[k] === 1) mask[k] = 1;
    }
  }
  for (const caldera of calderas) {
    if (!caldera.lava) continue;
    for (const idx of caldera.columns) mask[idx] = 1;
  }
  return mask;
}

/** Nine-grid centre for a zone token. */
function zoneFraction(zone: string): [number, number] {
  const table: Record<string, [number, number]> = {
    center: [0.5, 0.5],
    north: [0.5, 1 / 6],
    south: [0.5, 5 / 6],
    east: [5 / 6, 0.5],
    west: [1 / 6, 0.5],
    northeast: [5 / 6, 1 / 6],
    northwest: [1 / 6, 1 / 6],
    southeast: [5 / 6, 5 / 6],
    southwest: [1 / 6, 5 / 6],
  };
  return table[zone] ?? [0.5, 0.5];
}

/** Flatten a validated `terrain.edit@0` node into the stdlib's edit shape. */
function toEdit(node: EditNode): TerrainEdit {
  const p = node.params;
  return {
    id: node.id,
    verb: p.verb,
    ...(p.strength === undefined ? {} : { strength: p.strength }),
    ...(p.at === undefined ? {} : { at: p.at }),
    ...(p.zone === undefined ? {} : { zone: p.zone }),
    ...(p.course === undefined ? {} : { course: p.course }),
    ...(p.width === undefined ? {} : { width: p.width }),
    ...(p.height === undefined ? {} : { height: p.height }),
    ...(p.radius === undefined ? {} : { radius: p.radius }),
    ...(p.depth === undefined ? {} : { depth: p.depth }),
    ...(p.profile === undefined ? {} : { profile: p.profile }),
    ...(p.rim === undefined ? {} : { rim: p.rim }),
    ...(p.caldera === undefined ? {} : { caldera: p.caldera }),
    ...(p.calderaDepth === undefined ? {} : { calderaDepth: p.calderaDepth }),
    ...(p.lava === undefined ? {} : { lava: p.lava }),
    ...(p.water === undefined ? {} : { water: p.water }),
    ...(p.irregularity === undefined ? {} : { irregularity: p.irregularity }),
    ...(p.meander === undefined ? {} : { meander: p.meander }),
    ...(p.flooded === undefined ? {} : { flooded: p.flooded }),
  };
}

/**
 * The ground the transition band may not dress.
 *
 * The decoration clip's apron covers the buildings, the lanes and the plaza;
 * the placement rects cover everything else the solver put down (a placed
 * primitive has no `BuiltBuilding` and so no box). Both are grown by
 * {@link DECOR_APRON}, which is the same distance the undergrowth pass keeps
 * its deadwood at — a fallen log against a garden wall is one defect, not two.
 */
function transitionAvoid(
  clip: StructureClip | undefined,
  placements: readonly { readonly footprint: { x0: number; z0: number; x1: number; z1: number } }[],
): (x: number, z: number) => boolean {
  const rects = placements.map((p) => p.footprint);
  return (x, z) => {
    if (clip?.inApron(x, z) === true) return true;
    for (const r of rects) {
      if (
        x >= r.x0 - DECOR_APRON &&
        x <= r.x1 + DECOR_APRON &&
        z >= r.z0 - DECOR_APRON &&
        z <= r.z1 + DECOR_APRON
      ) {
        return true;
      }
    }
    return false;
  };
}

/* -------------------------------------------------------------------------- */
/* authored programs                                                           */
/* -------------------------------------------------------------------------- */

/**
 * The authored-program nodes of a document, as pass jobs.
 *
 * Two spellings, one job list, in document order: `authored:<id>` is a landmark
 * and takes the site the solver reserved for it; `scatter.program@0` is a
 * plugin and hands its params to the placer. A node the validator accepted but
 * that has nowhere to stand leaves a diagnostic behind rather than nothing.
 */
function programJobsFrom(
  doc: SettlementDocument | TerrainDocument,
  rootPath: string,
  placements: readonly Placement[],
  diagnostics: LoamDiagnostic[],
  ground: {
    plan: ColumnPlan;
    worldSeed: bigint;
    solved: boolean;
    /** Landmark turns, decided before the solve and binding (`facing.ts`). */
    rotations?: ReadonlyMap<string, ProgramRotation>;
    /** Scatter relations, resolved per instance by the placer. */
    facings?: ReadonlyMap<string, ProgramFacing>;
  },
): readonly ProgramJob[] {
  const map = doc.programs ?? {};
  const jobs: ProgramJob[] = [];
  const claimed: Rect[] = placements.map((p) => p.footprint);

  for (const child of doc.root.children as readonly { kind: string }[]) {
    if (child.kind !== "generator") continue;
    const node = child as ProgramNode;
    const nodePath = `${rootPath}.${node.id}`;
    const salt = node.seedSalt === undefined ? {} : { seedSalt: node.seedSalt };

    if (isAuthoredGenerator(node.generator)) {
      const programId = authoredProgramId(node.generator);
      const program = programId === undefined ? undefined : map[programId];
      /* c8 ignore next — the validator rejects a malformed reference. */
      if (programId === undefined) continue;
      if (program === undefined) {
        // Legal now: a node may reference a program the document only
        // *requested* (`intent.character.programs`). If the program-author
        // phase never ran, or the program failed its gate and was dropped,
        // the document arrives here without it.
        diagnostics.push(
          warning(
            "PROGRAM_DROPPED",
            nodePath,
            `this node invokes program ${JSON.stringify(programId)}, which the document does not carry — it was requested but never authored`,
            "run the program-authoring phase, add the program to the document's \"programs\" map, or drop the node; the world compiles without it",
          ),
        );
        continue;
      }
      // Hovering wins over every other placement route: the node never
      // entered the solver, and the ground has no say over something that
      // floats. Only the coarse hint is honoured (see `planHoverSite`).
      const hover = hoverOf(node);
      const solved = placements.find((p) => p.nodePath === nodePath);
      // Already decided, and already spent: `layoutNodesFrom` reserved the
      // turned box with this same number, so every site below is the box the
      // turned instance occupies.
      const rotation = ground.rotations?.get(nodePath) ?? 0;
      const turned = rotation === 0 ? {} : { rotation };
      let site: ProgramPlacement | undefined;
      if (hover !== undefined) {
        const zone = zoneOf(node);
        const hint = coarseHintArea(node, ground.plan.region);
        const hovered = planHoverSite({
          envelope: program.envelope,
          plan: ground.plan,
          hover,
          ...(zone === undefined ? {} : { zone }),
          ...(hint === undefined ? {} : { hint }),
          ...turned,
        });
        site = { footprint: hovered.footprint, baseY: hovered.baseY, hovering: true, ...turned };
      } else if (solved !== undefined) {
        // Settlement: the solver's site. Its `foundationY` is the ground plane;
        // the pass derives node-local y = 0 from it, the run's `seatY` and the
        // node's seat policy.
        site = { footprint: solved.footprint, baseY: solved.foundationY, ...seatOn(node), ...turned };
      } else if (!ground.solved) {
        // Terrain: no solver, so the ground picks — steered by the one thing
        // the document said about where this landmark goes (`at`/`zone`).
        const hint = coarseHintArea(node, ground.plan.region);
        const found = planLandmarkSite({
          envelope: program.envelope,
          plan: ground.plan,
          seed: nodeSeed(ground.worldSeed, nodePath, node.seedSalt ?? ""),
          taken: claimed,
          ...(hint === undefined ? {} : { hint }),
          // No solver here, so the seat policy is the only thing that can tell
          // the ground search that water is the point rather than a refusal.
          wades: seatPolicyOf(node)?.policy === "wade",
          ...turned,
        });
        site =
          found === undefined
            ? undefined
            : { footprint: found.footprint, baseY: found.baseY, ...seatOn(node), ...turned };
      }
      if (site === undefined) {
        diagnostics.push(
          warning(
            "PROGRAM_DROPPED",
            nodePath,
            ground.solved
              ? `the layout solver reserved no site for landmark program ${JSON.stringify(programId)}, so it was not built`
              : `no ground in the region would hold landmark program ${JSON.stringify(programId)}, so it was not built`,
            "loosen the node's constraints, or shrink the program's declared envelope so a site can hold it",
          ),
        );
        continue;
      }
      if (site.hovering !== true) claimed.push(site.footprint);
      jobs.push({
        nodePath,
        programId,
        program,
        mode: "landmark",
        placement: site,
        ...salt,
      });
      continue;
    }

    if (node.generator !== PROGRAM_SCATTER_GENERATOR) continue;
    const params = (node.params ?? {}) as unknown as ProgramScatterParams;
    const program = map[params.program];
    if (program === undefined) {
      diagnostics.push(
        warning(
          "PROGRAM_DROPPED",
          nodePath,
          `this node scatters program ${JSON.stringify(params.program)}, which the document does not carry — it was requested but never authored`,
          "run the program-authoring phase, add the program to the document's \"programs\" map, or drop the node; the world compiles without it",
        ),
      );
      continue;
    }
    const facing = ground.facings?.get(nodePath);
    jobs.push({
      nodePath,
      programId: params.program,
      program,
      mode: "plugin",
      params,
      ...(facing === undefined ? {} : { facing }),
      // A hovering scatter has no seating decision to make — the pass reads
      // the same `hover` out of the params and skips the pad entirely.
      ...(hoverOfParams(params) === undefined ? { seat: seatOfParams(params) } : {}),
      ...salt,
    });
  }

  return jobs;
}

/** The node's seat policy as a `ProgramPlacement` fragment. */
function seatOn(node: unknown): { seat?: SeatDecision } {
  const seat = seatPolicyOf(node);
  return seat === undefined ? {} : { seat };
}

/** Claim every placed instance's footprint, so later passes route around it. */
function claimProgramFootprints(
  occupancy: OccupancyGrid,
  placed: readonly PlacedProgram[],
): void {
  const { region, mask } = occupancy;
  for (const instance of placed) {
    // A hovering landmark leaves the ground under it free for roads and props.
    if (instance.hovering === true) continue;
    const { footprint } = instance;
    for (let z = footprint.z0; z <= footprint.z1; z++) {
      for (let x = footprint.x0; x <= footprint.x1; x++) {
        const ix = x - region.x0;
        const iz = z - region.z0;
        if (ix < 0 || iz < 0 || ix >= region.width || iz >= region.depth) continue;
        mask[iz * region.width + ix] = 1;
      }
    }
  }
}

/**
 * Every district street column, carriageway and sidewalk, over the region.
 *
 * RUINS-PLAN §7.4's reclaim opens the settlement's claim to the wood, and the
 * claim is the only thing that was keeping a trunk off a **district** street:
 * the road surfacer writes a `road` occupancy tag, but the street bands a
 * quarter draws for itself write none, which is the same hole the town green
 * found from the other side. Read only by the reclaim gate, and built only on a
 * world that ruined something.
 */
function streetBandColumns(
  region: Region,
  districts: readonly { readonly bounds: Rect; readonly carriageway: Uint8Array; readonly sidewalk: Uint8Array }[],
): Uint8Array {
  const paved = new Uint8Array(region.width * region.depth);
  for (const district of districts) {
    const { bounds } = district;
    const width = bounds.x1 - bounds.x0 + 1;
    for (let z = bounds.z0; z <= bounds.z1; z++) {
      const j = z - region.z0;
      if (j < 0 || j >= region.depth) continue;
      for (let x = bounds.x0; x <= bounds.x1; x++) {
        const i = x - region.x0;
        if (i < 0 || i >= region.width) continue;
        const local = (z - bounds.z0) * width + (x - bounds.x0);
        if (district.carriageway[local] === 1 || district.sidewalk[local] === 1) {
          paved[j * region.width + i] = 1;
        }
      }
    }
  }
  return paved;
}

/** One report row per authored-program node, in job order. */
function programStatsOf(
  jobs: readonly ProgramJob[],
  placed: readonly PlacedProgram[],
): readonly ProgramNodeStats[] {
  return jobs.map((job) => {
    const mine = placed.filter((p) => p.nodePath === job.nodePath);
    return {
      nodePath: job.nodePath,
      programId: job.programId,
      mode: job.mode,
      instances: mine.length,
      blockCount: mine.reduce((sum, p) => sum + p.blockCount, 0),
      sites: mine.map((p) => ({
        index: p.index,
        footprint: p.footprint,
        baseY: p.baseY,
        ...(p.hovering === true ? { hovering: true } : {}),
      })),
    };
  });
}

/**
 * `LOAM-T208` for every generator node no pass in this pipeline handles.
 *
 * The validator's generator whitelist and this list are maintained apart, and a
 * document that satisfies the first while falling through the second used to
 * compile to a world silently missing whatever the node asked for. That class
 * of defect is what this sweep exists to make loud.
 */
export function generatorCoverageNotes(
  children: readonly { readonly kind: string; readonly id: string; readonly generator?: string }[],
  rootPath: string,
): readonly LoamDiagnostic[] {
  const handled = new Set<string>([
    ...PROFILE_GENERATORS,
    ...STRUCTURE_GENERATORS,
    PROP_GENERATOR,
    // The infrastructure host: handled in the wall's slot of the structure pass
    // (`structures/infra-entry.ts`), so it is not a silent node.
    INFRA_ENTRY_GENERATOR,
    PROGRAM_SCATTER_GENERATOR,
  ]);
  const out: LoamDiagnostic[] = [];
  for (const child of children) {
    if (child.kind !== "generator") continue;
    const generator = child.generator;
    if (typeof generator === "string" && (handled.has(generator) || isAuthoredGenerator(generator))) {
      continue;
    }
    out.push(
      note(
        "GENERATOR_NOT_IMPLEMENTED",
        `${rootPath}.${child.id}`,
        `no compiler pass handles generator ${JSON.stringify(String(generator))}, so this node contributed nothing to the world`,
        "use a generator this compiler implements, or drop the node — a generator with no pass is silent, not harmless",
      ),
    );
  }
  return out;
}

/** Monotonic-ish millisecond clock for pass timings. */
function now(): number {
  return Number(process.hrtime.bigint() / 1000n) / 1000;
}

export type { TreePlacement };

/** The zone a node's `zone` constraint names, if it wrote one. */
function zoneOf(node: ProgramNode): string | undefined {
  for (const raw of canonicalConstraints(node.constraints)) {
    if (raw.type === "zone" && typeof raw["zone"] === "string") return raw["zone"];
  }
  return undefined;
}
