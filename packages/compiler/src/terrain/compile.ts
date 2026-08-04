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
  PROFILE_GENERATORS,
  PROGRAM_SCATTER_GENERATOR,
  PROP_GENERATOR,
  STRUCTURE_GENERATORS,
  authoredProgramId,
  isAuthoredGenerator,
  validateSettlementDocument,
  validateTerrainDocument,
  note,
  warning,
  hasErrors,
} from "@terrainist/spec";
import {
  buildPrograms,
  planLandmarkSite,
  type PlacedProgram,
  type ProgramJob,
  type ProgramPassResult,
} from "../programs/index.js";

import {
  TerrainProductIndex,
  applyPadEdits,
  corridorMask,
  corridorsFromCourses,
  deriveTerrainProducts,
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

import { EMIT_MINECRAFT_VERSION } from "../emit/world.js";
import { loadPrismarine } from "../emit/prismarine.js";
import type { Provenance } from "../provenance.js";

import { biomeForColumn, type ProfileBiome } from "./biomes.js";
import { buildSettlementClearing } from "./clearing.js";
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
import { buildClimateFields, resolveClimateParams } from "./climate.js";
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
import { ensureFanOutRows, fanOut, resolveIntents, type IntentResolution } from "../intent/index.js";
import { TERRAIN_ROWS } from "./climate-intent.js";
import {
  caveDiagnostics,
  tunnelDiagnostics,
  checkFloatingVegetation,
  checkFluidStability,
  validatorDiagnostics,
} from "./validate.js";
import { scatterForests, type ForestNodeInput, type TreePlacement } from "./vegetation.js";
import {
  buildStructures,
  buildTransitionBand,
  checkTunnelIntegrity,
  roadParamsOf,
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
  /** Present only for settlement-profile documents. */
  readonly layout?: LayoutOutcome;
}

/** Result of a compile attempt: a report, or the diagnostics that stopped it. */
export type CompileTerrainResult =
  | { readonly ok: true; readonly report: TerrainCompileReport }
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
  const tLayout = now();
  if (isSettlement(doc)) {
    const extraction = layoutNodesFrom(doc, worldSeed);
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
  if (isSettlement(doc) && layoutOutcome !== undefined && layoutOutcome.placements.length > 0) {
    structures = buildStructures({
      doc,
      worldSeed,
      nodes: layoutNodes,
      placements: layoutOutcome.placements,
      ports: layoutOutcome.ports,
      plan,
      palette,
      stack,
      ...(occupancy === undefined ? {} : { occupancy }),
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
    const jobs = programJobsFrom(doc, rootPath, layoutOutcome?.placements ?? [], diagnostics, {
      plan,
      worldSeed,
      solved: isSettlement(doc),
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
  const clearing =
    layoutOutcome === undefined || layoutOutcome.placements.length === 0
      ? undefined
      : buildSettlementClearing(
          region,
          layoutOutcome.placements.map((p) => p.footprint),
          // Its own stream: the treeline's wobble must not move when an
          // unrelated pass draws from the root seed.
          seed32(nodeSeed(worldSeed, rootPath, "clearing")),
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
  const scatter = scatterForests(
    forestNodes,
    plan,
    classification,
    palette,
    occupancy,
    clearing?.density,
  );
  // A tree that a building would eat most of was never really there; the
  // survivors keep their placements and lose only the voxels that intersect.
  const clipped = clip === undefined ? undefined : clipTrees(scatter.trees, clip);
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
    seed: rootSeed,
  });
  // Cave dressing rides the same decoration list: it is the same kind of thing
  // (absolute-positioned blocks stamped after the column fill) and it cannot
  // collide, because every block it places is inside a carved span and every
  // block the surface pass places is at or above the ground.
  const caveDecor = decorateCaves(plan, palette, stack, rootSeed);
  const scatterMs = now() - t3;

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
  });
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
      pondChains: Object.fromEntries(
        terrain.ponds.map((p) => [p.editId, p.ponds] as const).sort(([a], [b]) => (a < b ? -1 : 1)),
      ),
      ...(structures === undefined ? {} : { structures: structures.stats }),
      ...(programs === undefined ? {} : { programs: programStatsOf(programJobs, programs.placed) }),
    },
    diagnostics,
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
  return { ok: true, report };
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
  const pads: MaskRect[] = placements.map((p) => p.footprint);
  const columns: Uint8Array[] = [];
  if (structures.roads !== undefined) columns.push(structures.roads.roadColumns);
  if (structures.streets !== undefined) columns.push(structures.streets.road);
  if (structures.plaza !== undefined) columns.push(structures.plaza.paved);
  return buildLandUseMask(region, { cells, pads, columns });
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
      temperature: climate.temperature[idx] as number,
      forested: coverage[idx] === 1,
      lake: plan.lakeMask[idx] === 1,
      volcanicUpper: plan.volcanicUpper[idx] === 1,
    });
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
  ground: { plan: ColumnPlan; worldSeed: bigint; solved: boolean },
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
      /* c8 ignore next — the validator rejects a reference with no record. */
      if (programId === undefined || program === undefined) continue;
      const solved = placements.find((p) => p.nodePath === nodePath);
      // Settlement: the solver's site. Terrain: no solver, so the ground picks.
      const site =
        solved !== undefined
          ? { footprint: solved.footprint, baseY: solved.foundationY }
          : ground.solved
            ? undefined
            : planLandmarkSite({
                envelope: program.envelope,
                plan: ground.plan,
                seed: nodeSeed(ground.worldSeed, nodePath, node.seedSalt ?? ""),
                taken: claimed,
              });
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
      claimed.push(site.footprint);
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
    /* c8 ignore next — likewise rejected by the validator. */
    if (program === undefined) continue;
    jobs.push({ nodePath, programId: params.program, program, mode: "plugin", params, ...salt });
  }

  return jobs;
}

/** Claim every placed instance's footprint, so later passes route around it. */
function claimProgramFootprints(
  occupancy: OccupancyGrid,
  placed: readonly PlacedProgram[],
): void {
  const { region, mask } = occupancy;
  for (const instance of placed) {
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
