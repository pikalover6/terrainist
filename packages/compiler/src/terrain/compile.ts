/**
 * The terrain-profile compiler — seven static stages.
 *
 * External interface: `compileTerrain(document, options)` (emit) and
 * `compileArtifacts(document, options)` (disk-free). Each stage below takes a
 * narrow typed input, returns a specific result, and owns its diagnostics.
 * Top-level sequences them, concatenates diagnostics in original order, and
 * attributes timings without a mutable diagnostics bag.
 *
 * Pass order (preserved):
 * 1. validate + semantic intent
 * 2. terrain/climate fields
 * 3. settlement layout
 * 4. column/ground/structure planning
 * 5. authored programs + vegetation
 * 6. final-plan validation (biomes + validators)
 * 7. emit+report (or artifact assembly)
 */

import {
  buildTerrainField,
  centeredRegion,
  classify,
  nodeSeed,
  resolveWorldSeed,
  seed32,
  HeightField,
  type Classification,
  type Marker,
  type Region,
  type Seed256,
  type TerrainEdit,
} from "@terrainist/stdlib";
import {
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
  explicitSeatOfParams,
  seatOfParams,
  seatPolicyOf,
  type SeatDecision,
  isAuthoredGenerator,
  validateSettlementDocument,
  validateTerrainDocument,
  note,
  warning,
  hasErrors } from "@terrainist/spec/ir";
import {
  buildPrograms,
  declarePrograms,
  executePrograms,
  coarseHintArea,
  planLandmarkSite,
  planHoverSite,
  planProgramFacings,
  remeasureLandmarkFacings,
  type PlacedProgram,
  type ProgramFacing,
  type ProgramDeclaration,
  type ProgramJob,
  type ProgramPlacement,
  type ProgramPassInput,
  type ProgramPassResult,
  type ProgramRotation,
} from "../programs/index.js";

import {
  TerrainProductIndex,
  corridorMask,
  corridorsFromCourses,
  deriveTerrainProducts,
  applyPadEdits,
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
import type { GroundBaseline, GroundReport, ResolvedGround } from "../layout/ground-contract.js";
import { declarePads } from "../layout/ground-declarers.js";
import { descentCorridorMask } from "../layout/descent-datum.js";
import { createGroundDriver, planAt, type GroundDriver } from "../layout/ground-driver.js";

import { EMIT_MINECRAFT_VERSION, loadPrismarine } from "../emit/prismarine.js";
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
import { checkCaveIntegrity } from "./caves.js";
import { buildColumnPlan, type ColumnPlan, type VolcanoInfo, countFrozenColumns } from "./columns.js";
import { decorate, type DecorBlock } from "./decorate.js";
import { emitTerrain, type TerrainEmitSummary } from "./emit.js";
import { cliffPaletteNote, resolvePalette } from "./palette.js";
import { layUrbanFloor, type UrbanFloorResult } from "./urban-floor.js";
import { materialThemeById } from "../programs/theme.js";
import { fanOut } from "../intent/index.js";
import {
  resolveCompilerIntents,
  type CompilerIntentResolution,
} from "../intent/compiler-resolved.js";
import { TERRAIN_ROWS } from "./climate-intent.js";
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
  declareStructures,
  roadParamsOf,
  type FarmReportRow,
  type StructurePassInput,
  type StructurePassResult,
  type StructureStats,
} from "../structures/index.js";

/** Default `lavaFlows` for a volcano edit that does not name one. */
export const DEFAULT_LAVA_FLOWS = 2;

/**
 * How the stdlib's composition diagnostics surface as profile diagnostics.
 */
type EditDiagnosticName = "BASIN_RIM_NOT_CLOSED" | "RIVER_PONDED" | "CARVE_DRY" | "CARVE_MOSTLY_DRY";

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
  "LOAM-I502": {
    name: "CARVE_MOSTLY_DRY",
    fix:
      'deepen the carve ("depth") until its floor lies below sea level along its whole course, or ' +
      'set "flooded": "always" for a channel that must hold water whatever the land does; if a dry ' +
      'valley with a wet mouth is what was meant, "flooded": "never" and this note goes away.',
  },
});

/** Options for {@link compileTerrain}. */
export interface CompileTerrainOptions {
  /** World folder to write. */
  readonly outDir: string;
  /** Downgrade `LOAM-T110` to a warning instead of failing. */
  readonly allowUnstable?: boolean;
  /**
   * Git provenance for the checkout doing the compiling, copied into the
   * report verbatim.
   */
  readonly provenance?: Provenance;
  /**
   * @internal probe-only — called after freeze, absent terrain-only.
   */
  readonly onProbeGround?: (ctx: {
    readonly baseline: GroundBaseline;
    readonly resolved: ResolvedGround;
  }) => void;
}

/** Options for {@link compileArtifacts}. Disk-free. */
export interface CompileArtifactsOptions {
  readonly allowUnstable?: boolean;
  readonly provenance?: Provenance;
  readonly onProbeGround?: (ctx: {
    readonly baseline: GroundBaseline;
    readonly resolved: ResolvedGround;
  }) => void;
}

/**
 * Everything a world would have been written from — the pipeline's output, one
 * step before it becomes chunks.
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
  /**
   * GROUND-CONTRACT §7: the frozen resolve's own report — claim rows, moved
   * columns, transitions — on every settlement compile. Absent only when the
   * driver never ran (terrain profile or empty settlement).
   */
  readonly ground?: GroundReport;
}

/** One authored-program node's contribution to the world. */
export interface ProgramNodeStats {
  readonly nodePath: string;
  readonly programId: string;
  readonly mode: "landmark" | "plugin";
  /** Instances that stand in the world — one for a landmark, N for a scatter. */
  readonly instances: number;
  readonly blockCount: number;
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
  readonly districts?: readonly DistrictProduct[];
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
  readonly farms?: readonly FarmReportRow[];
  /** Present only for settlement-profile documents. */
  readonly layout?: LayoutOutcome;
}

/** Result of a compile attempt: a report, or the diagnostics that stopped it. */
export type CompileTerrainResult =
  | {
      readonly ok: true;
      readonly report: TerrainCompileReport;
    }
  | { readonly ok: false; readonly diagnostics: readonly LoamDiagnostic[] };

/** Result of an artifact-only compile. Disk-free. */
export type CompileArtifactsResult =
  | {
      readonly ok: true;
      readonly report: TerrainCompileReport;
      readonly artifacts: CompileArtifacts;
    }
  | { readonly ok: false; readonly diagnostics: readonly LoamDiagnostic[] };

/* -------------------------------------------------------------------------- */
/* Stage 1: validate + semantic inputs                                         */
/* -------------------------------------------------------------------------- */

interface Stage1Result {
  readonly doc: TerrainDocument | SettlementDocument;
  readonly intents: CompilerIntentResolution;
  readonly palette: import("./palette.js").Palette;
  readonly stack: ReturnType<typeof loadPrismarine>;
  readonly rootPath: string;
  readonly worldSeed: bigint;
  readonly rootSeed: Seed256;
  readonly region: Region;
  readonly diagnostics: readonly LoamDiagnostic[];
  readonly isSettlement: boolean;
}

function stage1ValidateInputs(input: unknown): { ok: true; result: Stage1Result; validateMs: number } | { ok: false; diagnostics: readonly LoamDiagnostic[]; validateMs: number } {
  const started = now();
  const settlement =
    typeof input === "object" && input !== null && (input as { profile?: unknown }).profile === "settlement";
  const validation = settlement ? validateSettlementDocument(input) : validateTerrainDocument(input);
  const validateMs = now() - started;
  if (validation.document === undefined) {
    return { ok: false, diagnostics: validation.diagnostics, validateMs };
  }
  const doc = validation.document as TerrainDocument | SettlementDocument;
  const diagnostics: LoamDiagnostic[] = [...validation.diagnostics];
  const intents = resolveCompilerIntents(doc);
  diagnostics.push(...intents.diagnostics);
  diagnostics.push(...generatorCoverageNotes(doc.root.children as readonly { kind: string; id: string; generator?: string }[], doc.root.id));
  const stack = loadPrismarine(EMIT_MINECRAFT_VERSION);
  const rootPath = doc.root.id;
  const worldSeed = resolveWorldSeed(doc.meta.worldSeed);
  const [width, depth] = doc.root.envelope.size ?? [512, 512];
  const region = centeredRegion(width, depth);
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
  const isSettlement = doc.profile === "settlement";
  return {
    ok: true,
    result: { doc, intents, palette, stack, rootPath, worldSeed, rootSeed, region, diagnostics, isSettlement },
    validateMs,
  };
}

/* -------------------------------------------------------------------------- */
/* Stage 2: terrain/climate fields                                            */
/* -------------------------------------------------------------------------- */

interface Stage2Result {
  readonly terrain: ReturnType<typeof buildTerrainField>;
  readonly climate: ReturnType<typeof buildClimateFields>;
  readonly classification: Classification;
  readonly heightfield: Extract<TerrainDocument["root"]["children"][number], { generator: "terrain.heightfield@0" }>;
  readonly climateNode: Extract<TerrainDocument["root"]["children"][number], { generator: "terrain.climate@0" }>;
  readonly hfPath: string;
  readonly diagnostics: readonly LoamDiagnostic[];
  readonly climateMs: number;
  readonly fieldMs: number;
}

function stage2TerrainFields(s1: Stage1Result): Stage2Result {
  const { doc, region, worldSeed, rootPath } = s1;
  const children = doc.root.children as readonly TerrainDocument["root"]["children"][number][];
  const heightfield = children.find((c) => c.generator === "terrain.heightfield@0") as Extract<TerrainDocument["root"]["children"][number], { generator: "terrain.heightfield@0" }>;
  const climateNode = children.find((c) => c.generator === "terrain.climate@0") as Extract<TerrainDocument["root"]["children"][number], { generator: "terrain.climate@0" }>;
  const hfPath = `${rootPath}.${heightfield.id}`;
  const edits = (heightfield.children ?? []).map(toEdit);
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
  const diagnostics: LoamDiagnostic[] = [];
  for (const d of terrain.edits.diagnostics) {
    const build = d.severity === "note" ? note : warning;
    const mapped = EDIT_DIAGNOSTIC_NAMES[d.code] ?? EDIT_DIAGNOSTIC_NAMES["LOAM_T105"];
    diagnostics.push(
      build(
        (mapped as { name: EditDiagnosticName }).name,
        `${hfPath}.${d.editId}`,
        d.message,
        (mapped as { fix: string }).fix,
      ),
    );
  }
  return {
    terrain,
    climate,
    classification: terrain.classification,
    heightfield,
    climateNode,
    hfPath,
    diagnostics,
    climateMs,
    fieldMs,
  };
}

/* -------------------------------------------------------------------------- */
/* Stage 3: settlement layout                                                  */
/* -------------------------------------------------------------------------- */

interface Stage3Result {
  readonly classification: Classification;
  readonly layoutOutcome: LayoutOutcome | undefined;
  readonly occupancy: OccupancyGrid | undefined;
  readonly corridors: readonly RouteCorridor[];
  readonly products: TerrainProductIndex | undefined;
  readonly layoutNodes: readonly LayoutNodeInput[];
  readonly districtParams: ReadonlyMap<string, Readonly<Record<string, unknown>>> | undefined;
  readonly pristineField: HeightField | undefined;
  readonly landmarkRotations: Map<string, ProgramRotation>;
  readonly diagnostics: readonly LoamDiagnostic[];
  readonly layoutMs: number;
}

function stage3SettlementLayout(s1: Stage1Result, s2: Stage2Result): Stage3Result {
  const { doc, region, rootPath, worldSeed } = s1;
  let classification: Classification = s2.classification;
  const diagnostics: LoamDiagnostic[] = [];
  let layoutOutcome: LayoutOutcome | undefined;
  let occupancy: OccupancyGrid | undefined;
  let pristineField: HeightField | undefined;
  let layoutNodes: readonly LayoutNodeInput[] = [];
  let corridors: readonly RouteCorridor[] = [];
  let products: TerrainProductIndex | undefined;
  let districtParams: ReadonlyMap<string, Readonly<Record<string, unknown>>> | undefined;
  const landmarkFacings = planProgramFacings({
    doc: doc as SettlementDocument | TerrainDocument,
    rootPath,
    region,
    worldSeed,
    scope: "landmark",
  });
  diagnostics.push(...landmarkFacings.diagnostics);
  const landmarkRotations = new Map<string, ProgramRotation>(
    [...landmarkFacings.facings].map(([path, facing]) => [path, facing.rotation ?? 0] as const),
  );
  const tLayout = now();
  const isSettlement = (d: TerrainDocument | SettlementDocument): d is SettlementDocument => d.profile === "settlement";
  if (isSettlement(doc)) {
    const extraction = layoutNodesFrom(doc, worldSeed, landmarkRotations);
    layoutNodes = extraction.nodes;
    diagnostics.push(...extraction.diagnostics);
    corridors = [
      ...corridorsFromCourses(s2.terrain.edits.courses, s2.hfPath),
      ...roadNetworkCorridors(doc, rootPath, region, extraction.nodes),
    ];
    products = new TerrainProductIndex(
      region,
      deriveTerrainProducts({
        region,
        oceanMask: classification.oceanMask,
        ridgeCourses: s2.terrain.edits.courses.filter((c) => c.verb === "ridge").map((c) => c.samples),
        peaks: peakPoints(s2.heightfield, s2.terrain.edits.markers),
      }),
    );
    const solved = solveLayout({
      region,
      field: s2.terrain.field,
      classification,
      seaLevel: s2.terrain.params.seaLevel,
      rootPath,
      nodes: extraction.nodes,
      hazardMask: buildHazardMask(region, classification, s2.terrain.edits.calderas),
      amphibiousHazardMask: buildHazardMask(region, classification, s2.terrain.edits.calderas, { water: false }),
      corridors,
      products,
    });
    diagnostics.push(...solved.diagnostics);
    occupancy = solved.occupancy;
    const remeasured = remeasureLandmarkFacings({
      doc,
      rootPath,
      region,
      worldSeed,
      placements: solved.placements,
      facings: landmarkFacings.facings,
    });
    diagnostics.push(...remeasured.diagnostics);
    for (const [path, rotation] of remeasured.rotations) landmarkRotations.set(path, rotation);
    const pristineValues = Float64Array.from(s2.terrain.field.values);
    pristineField = new HeightField({ ...s2.terrain.field.region }, pristineValues);
    if (solved.padEdits.length > 0) applyPadEdits(s2.terrain.field, solved.padEdits);
    const wetColumns = new Uint8Array(region.width * region.depth);
    for (let k = 0; k < wetColumns.length; k++) {
      if (classification.oceanMask[k] === 1 || classification.lakeMask[k] === 1) wetColumns[k] = 1;
    }
    const fabricInput = {
      doc,
      worldSeed,
      field: s2.terrain.field,
      seaLevel: s2.terrain.params.seaLevel,
      placements: solved.placements,
      water: wetColumns,
      pristine: pristineField,
    };
    const fabric = solveDistricts(fabricInput);
    diagnostics.push(...fabric.diagnostics);
    const cityFabric = solveCities(fabricInput);
    diagnostics.push(...cityFabric.diagnostics);
    const fabricPads = [...fabric.padEdits, ...cityFabric.padEdits];
    if (fabricPads.length > 0) applyPadEdits(s2.terrain.field, fabricPads);
    if (solved.padEdits.length + fabricPads.length > 0) {
      classification = classify(s2.terrain.field, s2.terrain.params, {
        temperature: s2.climate.temperature,
        noFlood: s2.terrain.edits.noFlood,
        basins: s2.terrain.edits.basins,
        footprints: s2.terrain.edits.footprints,
      });
    }
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
  if (classification.overriddenNoFlood > 0) {
    const n = classification.overriddenNoFlood;
    diagnostics.push(
      note(
        "CARVE_FLOODED_ANYWAY",
        rootPath,
        `${n} column${n === 1 ? "" : "s"} carved with "flooded": "never" ${n === 1 ? "" : "were"} flooded anyway: the sea reaches them, and a dry column below sea level beside standing water would drain on the first tick (LOAM-T110)`,
        'Nothing to change if the carve was meant to meet the sea. To keep it dry, raise its floor above sea level or move it inland so the sea cannot reach it; "never" is honoured exactly as far as physics allows.',
      ),
    );
  }
  const layoutMs = now() - tLayout;
  return {
    classification,
    layoutOutcome,
    occupancy,
    corridors,
    products,
    layoutNodes,
    districtParams,
    pristineField,
    landmarkRotations,
    diagnostics,
    layoutMs,
  };
}

/* -------------------------------------------------------------------------- */
/* Stage 4: column / ground / structure planning                               */
/* -------------------------------------------------------------------------- */

interface Stage4Result {
  readonly plan: ColumnPlan;
  readonly groundBaseline: GroundBaseline | undefined;
  readonly groundDriver: GroundDriver | undefined;
  readonly groundReport: GroundReport | undefined;
  readonly structures: StructurePassResult | undefined;
  readonly layoutOutcome: LayoutOutcome | undefined;
  readonly programJobs: readonly ProgramJob[];
  readonly programJobsPlanned: boolean;
  readonly programDeclaration: ProgramDeclaration | undefined;
  readonly programDeclareMs: number;
  readonly diagnostics: readonly LoamDiagnostic[];
  readonly columnsMs: number;
  readonly structuresMs: number;
}

function stage4ColumnGroundStructures(
  s1: Stage1Result,
  s2: Stage2Result,
  s3: Stage3Result,
): Stage4Result {
  const { doc, region, rootPath, worldSeed, palette, stack, intents } = s1;
  let classification = s3.classification;
  let layoutOutcome = s3.layoutOutcome;
  const occupancy = s3.occupancy;
  const diagnostics: LoamDiagnostic[] = [];

  const t2 = now();
  const volcanoes: VolcanoInfo[] = (
    ((s2.heightfield.children ?? []) as readonly { params: { verb?: string }; id: string }[]).filter(
      (child) => child.params.verb === "volcano",
    ) as readonly { id: string; params: { lavaFlows?: number } }[]
  ).map((child) => ({
    editId: child.id,
    lavaFlows: child.params.lavaFlows ?? DEFAULT_LAVA_FLOWS,
    seed: nodeSeed(worldSeed, `${s2.hfPath}.${child.id}`, ""),
  }));

  const columnPlanInput = {
    field: s2.terrain.field,
    classification,
    palette,
    seaLevel: s2.terrain.params.seaLevel,
    soilDepth: s2.terrain.params.soilDepth,
    calderas: s2.terrain.edits.calderas,
    basins: s2.terrain.edits.basins,
    footprints: s2.terrain.edits.footprints,
    volcanoes,
    seed: s1.rootSeed,
    ...(intents.root.climate.snow === undefined ? {} : { snowPolicy: intents.root.climate.snow }),
  };
  const plan = buildColumnPlan(columnPlanInput);
  {
    const frozen = countFrozenColumns(plan);
    if (frozen > 0) {
      diagnostics.push(
        note(
          "FROZEN_WATER",
          rootPath,
          `"intent.climate.snow" is "always", so the water is frozen: ${frozen} column${frozen === 1 ? "" : "s"} of water carry ice at the surface (the water beneath stays water; lava is untouched)`,
          'Nothing to change for a frozen world. For open water in a snowy one, set "intent.climate.snow" to "auto" or leave it unset — snow still falls above the snow line.',
        ),
      );
    }
  }
  const columnsMs = now() - t2;

  const isSettlement = (d: TerrainDocument | SettlementDocument): d is SettlementDocument => d.profile === "settlement";
  const groundBaseline: GroundBaseline | undefined = isSettlement(doc)
    ? {
        region: plan.region,
        ground: Int32Array.from(plan.ground),
        fluidTop: Int32Array.from(plan.fluidTop),
        fluidKind: Uint8Array.from(plan.fluidKind),
        seaLevel: plan.seaLevel,
      }
    : undefined;
  const groundDriver: GroundDriver | undefined =
    groundBaseline === undefined ? undefined : createGroundDriver(groundBaseline, plan);


  const tStruct = now();
  let structures: StructurePassResult | undefined;
  let programJobs: readonly ProgramJob[] = [];
  let programJobsPlanned = false;
  let programDeclareMs = 0;
  let programDeclaration: ProgramDeclaration | undefined;
  let groundReport: GroundReport | undefined;

  const planProgramJobs = (groundPlan: ColumnPlan): readonly ProgramJob[] => {
    const scatterFacings = planProgramFacings({
      doc: doc as SettlementDocument | TerrainDocument,
      rootPath,
      region,
      worldSeed,
      scope: "plugin",
      placements: layoutOutcome?.placements ?? [],
    });
    diagnostics.push(...scatterFacings.diagnostics);
    return programJobsFrom(doc, rootPath, layoutOutcome?.placements ?? [], diagnostics, {
      plan: groundPlan,
      worldSeed,
      solved: isSettlement(doc),
      rotations: s3.landmarkRotations,
      facings: scatterFacings.facings,
    });
  };

  if (
    isSettlement(doc) &&
    groundDriver !== undefined &&
    layoutOutcome !== undefined &&
    layoutOutcome.placements.length > 0
  ) {
    groundDriver.record(
      declarePads({
        region: plan.region,
        padEdits: layoutOutcome.padEdits,
        districts: layoutOutcome.districts ?? [],
        cities: layoutOutcome.cities ?? [],
        corridors: s3.corridors,
        ...((): { descentCorridor?: Uint8Array } => {
          const mask = descentCorridorMask(
            plan.region,
            (layoutOutcome.districts ?? []).map((d) => d.descent),
          );
          return mask === undefined ? {} : { descentCorridor: mask };
        })(),
      }),
    );
    const structureInput: StructurePassInput = {
      doc: doc as SettlementDocument,
      worldSeed,
      ground: groundDriver,
      nodes: s3.layoutNodes,
      placements: layoutOutcome.placements,
      ports: layoutOutcome.ports,
      plan,
      palette,
      stack,
      ...(occupancy === undefined ? {} : { occupancy }),
      ...(s3.landmarkRotations.size === 0 ? {} : { programRotations: s3.landmarkRotations }),
      ...(layoutOutcome.districts === undefined ? {} : { districts: layoutOutcome.districts }),
      ...(layoutOutcome.cities === undefined ? {} : { cities: layoutOutcome.cities }),
      ...(s3.districtParams === undefined ? {} : { paramsByPath: s3.districtParams }),
      ...(s3.corridors.some((c) => c.kind === "road")
        ? { roadCorridor: corridorMask(region, s3.corridors.filter((c) => c.kind === "road")) }
        : {}),
    };
    const structurePlan = declareStructures(structureInput);
    const tProgramDeclare = now();
    programJobs = planProgramJobs(planAt(plan, groundDriver.view("D")));
    programJobsPlanned = true;
    if (programJobs.length > 0) {
      programDeclaration = declarePrograms({
        jobs: programJobs,
        plan: planAt(plan, groundDriver.view("D")),
        stack,
        worldSeed,
        ...(occupancy === undefined ? {} : { occupancy }),
        reserved: layoutOutcome.placements.map((p) => p.footprint),
        ground: groundDriver,
        ...(structurePlan.districts.some((d) => d.datum !== undefined)
          ? { datums: structurePlan.districts.map((d) => d.datum) }
          : {}),
      });
    }
    programDeclareMs = now() - tProgramDeclare;
    const frozen = groundDriver.freeze();
    groundReport = frozen?.report;
    if (frozen !== undefined) {
      let refused = 0;
      let adjusted = 0;
      const refusedTo = new Map<string, number>();
      for (const row of frozen.report.claims) {
        if (row.sourceClass !== "building.footprint") continue;
        refused += row.refused;
        adjusted += row.adjusted;
        for (const [cls, n] of Object.entries(row.refusedTo)) refusedTo.set(cls, (refusedTo.get(cls) ?? 0) + n);
      }
      if (refused > 0 || adjusted > 0) {
        const who = [...refusedTo.entries()].sort((a, b) => b[1] - a[1]).map(([cls, n]) => `${cls} ×${n}`).join(", ");
        diagnostics.push(
          note(
            "FOOTPRINT_GROUND_LOST",
            rootPath,
            `${refused} building footprint column${refused === 1 ? "" : "s"} lost to a higher claim${who === "" ? "" : ` (${who})`} and ${adjusted} adjusted: the pad was declared at its foundation and the frozen ground beneath those columns is another intent's decision`,
            "A building standing on ground another claim decided may float or sink there. Move the building off the channel, precinct or seam it overlaps, or accept the step; the resolver reports the columns, it does not repair them.",
          ),
        );
      }
    }
    structures = buildStructures(structureInput, structurePlan);
    diagnostics.push(...structures.diagnostics);
    layoutOutcome = { ...layoutOutcome, structures };
  }
  const structuresMs = now() - tStruct - programDeclareMs;

  return {
    plan,
    groundBaseline,
    groundDriver,
    groundReport,
    structures,
    layoutOutcome,
    programJobs,
    programJobsPlanned,
    programDeclaration,
    programDeclareMs,
    diagnostics,
    columnsMs,
    structuresMs,
  };
}

/* -------------------------------------------------------------------------- */
/* Stage 5: authored programs + vegetation                                     */
/* -------------------------------------------------------------------------- */

interface Stage5Result {
  readonly programs: ProgramPassResult | undefined;
  readonly programJobs: readonly ProgramJob[];
  readonly scatter: ReturnType<typeof scatterForests>;
  readonly clearing: SettlementClearing | undefined;
  readonly clip: StructureClip | undefined;
  readonly trees: readonly TreePlacement[];
  readonly decoration: ReturnType<typeof decorate>;
  readonly transition: ReturnType<typeof buildTransitionBand> | undefined;
  readonly clipped: ReturnType<typeof clipTrees> | undefined;
  readonly standing: readonly TreePlacement[];
  readonly urbanFloor: UrbanFloorResult | undefined;
  readonly exemptTrunk: ((x: number, z: number) => "whole" | "wood" | undefined) | undefined;
  readonly diagnostics: readonly LoamDiagnostic[];
  readonly programsMs: number;
  readonly scatterMs: number;
}

function stage5ProgramsVegetation(
  s1: Stage1Result,
  s3: Stage3Result,
  s4: Stage4Result,
  s2: Stage2Result,
): Stage5Result {
  const { doc, region, rootPath, worldSeed, palette, stack, intents } = s1;
  const { plan, structures, groundDriver, programJobs: declaredJobs, programJobsPlanned, programDeclaration } = s4;
  let { occupancy } = s3 as { occupancy: OccupancyGrid | undefined };
  // need mutable occupancy reference; s3 occupancy is the same object
  occupancy = s3.occupancy;
  const layoutOutcome = s4.layoutOutcome;
  const diagnostics: LoamDiagnostic[] = [];
  const isSettlement = (d: TerrainDocument | SettlementDocument): d is SettlementDocument => d.profile === "settlement";

  const tPrograms = now();
  let programs: ProgramPassResult | undefined;
  let programJobs: readonly ProgramJob[] = declaredJobs;
  let programJobsPlannedLocal = programJobsPlanned;
  let programDeclareMs = s4.programDeclareMs;
  // If not yet planned (terrain-only), plan now
  if (!programJobsPlannedLocal) {
    const scatterFacings = planProgramFacings({
      doc: doc as SettlementDocument | TerrainDocument,
      rootPath,
      region,
      worldSeed,
      scope: "plugin",
      placements: layoutOutcome?.placements ?? [],
    });
    diagnostics.push(...scatterFacings.diagnostics);
    programJobs = programJobsFrom(doc, rootPath, layoutOutcome?.placements ?? [], diagnostics, {
      plan,
      worldSeed,
      solved: isSettlement(doc),
      rotations: s3.landmarkRotations,
      facings: scatterFacings.facings,
    });
    programJobsPlannedLocal = true;
  }
  if (programJobs.length > 0) {
    const programInput: ProgramPassInput = {
      jobs: programJobs,
      plan,
      stack,
      worldSeed,
      ...(occupancy === undefined ? {} : { occupancy }),
      reserved: (layoutOutcome?.placements ?? []).map((p) => p.footprint),
      ...(structures === undefined ? {} : { themeId: structures.stats.theme }),
      ...(groundDriver === undefined ? {} : { ground: groundDriver }),
      ...(structures?.districts.some((d) => d.datum !== undefined) === true
        ? { datums: structures.districts.map((d) => d.datum) }
        : {}),
    };
    programs =
      programDeclaration === undefined
        ? buildPrograms(programInput)
        : executePrograms(programInput, programDeclaration);
    diagnostics.push(...programs.diagnostics);
    if (occupancy !== undefined) claimProgramFootprints(occupancy, programs.placed);
  }
  const programsMs = now() - tPrograms + programDeclareMs;

  const t3 = now();
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
          seed32(nodeSeed(worldSeed, rootPath, "clearing")),
        );
  const farmed =
    structures?.farms === undefined
      ? settlementClearing
      : suppressFarmClearing(region, settlementClearing, structures.farms);
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
          structures.plaza?.paved,
        );

  const forestNodes: ForestNodeInput[] = (doc.root.children as readonly ForestNode[])
    .filter((c): c is ForestNode => c.generator === "scatter.forest@0")
    .map((node) => ({
      id: node.id,
      nodePath: `${rootPath}.${node.id}`,
      seed: nodeSeed(worldSeed, `${rootPath}.${node.id}`, node.seedSalt ?? ""),
      params: node.params,
    }));
  const greenShare = fanOut<number>(TERRAIN_ROWS.settlementGreenery, intents.root, {
    nodePath: rootPath,
    today: TOWN_GREEN_DENSITY,
  });
  const scatterOccupancy =
    occupancy === undefined || structures?.ruinField === undefined
      ? occupancy
      : {
          ...occupancy,
          ruin: structures.ruinField.field,
          ruinPaved: streetBandColumns(region, structures.districts),
          ...(structures.greenSkin === undefined
            ? {}
            : {
                ruinColonized: structures.greenSkin.colonized,
                ruinShellTrunks: structures.greenSkin.shellTrunks,
              }),
        };
  const floraBias = fanOut<FloraBias>(FLORA_ROWS.composition, intents.root, {
    nodePath: rootPath,
    today: NO_FLORA_BIAS,
  });
  const scatter = scatterForests(
    forestNodes,
    plan,
    s3.classification,
    palette,
    scatterOccupancy,
    clearing?.density,
    {
      temperature: s2.climate.temperature,
      humidity: s2.climate.humidity,
      centers: THEME_CENTERS,
      themes: CLIMATE_THEMES,
    },
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
    clip?.columns,
    floraBias,
  );
  diagnostics.push(...scatter.diagnostics);
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
    classification: s3.classification,
    temperature: s2.climate.temperature,
    trees,
    forests: scatter.nodes,
    palette,
    stack,
    ...(clip === undefined ? {} : { clip }),
    greenShare,
    seed: s1.rootSeed,
  });
  const scatterMs = now() - t3;

  // urban floor (still part of vegetation stage, but depends on trees/decor)
  const settlementTheme = materialThemeById(structures?.stats.theme);
  let urbanFloor: UrbanFloorResult | undefined;
  if (structures !== undefined && structures.walls.length > 0) {
    urbanFloor = layUrbanFloor({
      plan,
      palette,
      stack,
      seed: seed32(nodeSeed(worldSeed, rootPath, "urban-floor")),
      circuits: structures.walls.map((w) => w.course.vertices),
      ...(settlementTheme === undefined ? {} : { theme: settlementTheme }),
      trees,
      decor:
        transition === undefined
          ? decoration.blocks
          : [...decoration.blocks, ...transition.blocks],
      laid:
        programs === undefined
          ? structures.blocks
          : [...structures.blocks, ...programs.blocks],
    });
  }

  return {
    programs,
    programJobs,
    scatter,
    clearing,
    clip,
    trees,
    decoration,
    transition,
    clipped,
    standing,
    urbanFloor,
    exemptTrunk,
    diagnostics,
    programsMs,
    scatterMs,
  };
}

/* -------------------------------------------------------------------------- */
/* Stage 6: final-plan validation (biomes + validators)                       */
/* -------------------------------------------------------------------------- */

interface Stage6Result {
  readonly biomeHistogram: Record<string, number>;
  readonly diagnostics: readonly LoamDiagnostic[];
  readonly fluids: ReturnType<typeof checkFluidStability>;
  readonly floating: ReturnType<typeof checkFloatingVegetation>;
  readonly caveIntegrity: ReturnType<typeof checkCaveIntegrity>;
  readonly tunnelIntegrity: ReturnType<typeof checkTunnelIntegrity>;
  readonly biomesMs: number;
  readonly validatorsMs: number;
}

function stage6FinalValidation(
  s1: Stage1Result,
  s2: Stage2Result,
  s3: Stage3Result,
  s4: Stage4Result,
  s5: Stage5Result,
  allowUnstable: boolean,
): Stage6Result {
  const { doc, region, rootPath, palette, stack, intents } = s1;
  const { plan, structures } = s4;
  const { scatter, clearing, trees, urbanFloor } = s5;
  const diagnostics: LoamDiagnostic[] = [];
  const t4 = now();
  const landUseMask = landUseMaskOf(plan, structures, s4.layoutOutcome?.placements ?? []);
  const cliffNote = cliffPaletteNote({
    style: doc.style,
    region: plan.region,
    classes: s3.classification.classes,
    footprints: (s4.layoutOutcome?.placements ?? []).map((p) => p.footprint),
    nodePath: rootPath,
  });
  if (cliffNote !== undefined) diagnostics.push(cliffNote);
  const settlementTheme = materialThemeById(structures?.stats.theme);
  const painted = paintBiomes(plan, s3.classification, s2.climate, s5.scatter.coverage, stack, {
    mask: landUseMask,
    nodePath: rootPath,
    ...(intents.root.climate.landUse === undefined ? {} : { intent: intents.root.climate.landUse }),
    ...(intents.root.climate.feather === undefined ? {} : { feather: intents.root.climate.feather }),
    ...(() => {
      const arid = settlementTheme?.aridAmbient === true;
      if (!arid) return {};
      const authored = climateOutranksArid({
        ...(intents.root.climate.biome === undefined ? {} : { biome: intents.root.climate.biome }),
        ...(intents.root.climate.snow === undefined ? {} : { snow: intents.root.climate.snow }),
        temperature: intents.root.climate.offsets.temperature,
        humidity: intents.root.climate.offsets.humidity,
      });
      return { arid: { arid, authored } };
    })(),
  });
  if (structures?.farms !== undefined) {
    const { parcelMask, yardMask } = structures.farms;
    for (let idx = 0; idx < plan.snow.length; idx++) {
      if (parcelMask[idx] === 1 || yardMask[idx] === 1) plan.snow[idx] = 0;
    }
  }
  const biomeHistogram = painted.histogram;
  diagnostics.push(...painted.clamp.diagnostics);
  const biomesMs = now() - t4;

  const t5 = now();
  const fluids = checkFluidStability(plan);
  const floating = checkFloatingVegetation(plan, trees);
  const caveIntegrity = checkCaveIntegrity(plan);
  const tunnelIntegrity = checkTunnelIntegrity(plan, structures?.tunnels ?? [], structures?.buildings ?? []);
  diagnostics.push(
    ...validatorDiagnostics(fluids, floating, { allowUnstable }),
    ...caveDiagnostics(caveIntegrity, rootPath),
    ...tunnelDiagnostics(tunnelIntegrity, rootPath),
  );
  const validatorsMs = now() - t5;

  return { biomeHistogram, diagnostics, fluids, floating, caveIntegrity, tunnelIntegrity, biomesMs, validatorsMs };
}

/* -------------------------------------------------------------------------- */
/* Stage 7: emit + report (shared)                                            */
/* -------------------------------------------------------------------------- */

interface PipelineState {
  readonly s1: Stage1Result;
  readonly s2: Stage2Result;
  readonly s3: Stage3Result;
  readonly s4: Stage4Result;
  readonly s5: Stage5Result;
  readonly s6: Stage6Result;
  readonly diagnostics: readonly LoamDiagnostic[];
  readonly timings: {
    readonly validate: number;
    readonly field: number;
    readonly layout: number;
    readonly climate: number;
    readonly columns: number;
    readonly structures: number;
    readonly programs: number;
    readonly scatter: number;
    readonly biomes: number;
    readonly validators: number;
  };
  readonly started: number;
}

function buildReport(
  pipeline: PipelineState,
  emit: TerrainEmitSummary,
  provenance: Provenance | undefined,
  worldSeed: bigint,
  region: Region,
  diagnostics: readonly LoamDiagnostic[],
): TerrainCompileReport {
  const { s1, s2, s3, s4, s5, s6 } = pipeline;
  const { doc } = s1;
  const { plan, structures, groundReport } = s4;
  const { trees, decoration, clearing, clipped, transition, urbanFloor, scatter, programs } = s5;
  const markers = [
    ...s3.classification.markers,
    ...s2.terrain.edits.markers,
    ...(plan.caves?.markers ?? []),
    ...(programs?.markers ?? []),
  ];
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
    ...(provenance === undefined ? {} : { provenance }),
    worldSeed: worldSeed.toString(),
    markers,
    stats: {
      region,
      columns: plan.ground.length,
      ...(groundReport === undefined ? {} : { ground: groundReport }),
      minHeight: s3.classification.minHeight,
      maxHeight: s3.classification.maxHeight,
      snowLine: s3.classification.snowLine,
      seaLevel: s2.terrain.params.seaLevel,
      landFraction: plan.ground.length === 0 ? 0 : land / plan.ground.length,
      treeCount: trees.length,
      treesPerNode: scatter.perNode,
      ...(scatter.strata.length === 0 ? {} : { strata: scatter.strata }),
      unstableFluidBlocks: s6.fluids.unstable,
      floatingTrees: s6.floating.length,
      biomeHistogram: s6.biomeHistogram,
      chunkCount: emit.chunkCount,
      blockCount: emit.blockCount,
      treeBlockCount: emit.treeBlockCount,
      decorBlockCount: emit.decorBlockCount,
      decorCounts: decoration.counts,
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
        s2.terrain.ponds.map((p) => [p.editId, p.ponds] as const).sort(([a], [b]) => (a < b ? -1 : 1)),
      ),
      ...(structures === undefined ? {} : { structures: structures.stats }),
      ...(programs === undefined ? {} : { programs: programStatsOf(s5.programJobs, programs.placed) }),
    },
    diagnostics,
    ...(structures?.farms === undefined ? {} : { farms: structures.farms.farms }),
    ...(s4.layoutOutcome === undefined ? {} : { layout: s4.layoutOutcome }),
    timings: {
      validate: pipeline.timings.validate,
      field: pipeline.timings.field,
      layout: pipeline.timings.layout,
      climate: pipeline.timings.climate,
      columns: pipeline.timings.columns,
      structures: pipeline.timings.structures,
      programs: pipeline.timings.programs,
      scatter: pipeline.timings.scatter,
      biomes: pipeline.timings.biomes,
      validators: pipeline.timings.validators,
      emit: 0, // filled by caller
      total: 0,
    },
    emit,
  };
  return report;
}

function now(): number {
  return Number(process.hrtime.bigint() / 1000n) / 1000;
}

/* -------------------------------------------------------------------------- */
/* Pipeline orchestration                                                     */
/* -------------------------------------------------------------------------- */

async function runPipeline(
  input: unknown,
  options: { allowUnstable?: boolean; provenance?: Provenance; onProbeGround?: CompileTerrainOptions["onProbeGround"] },
): Promise<
  | { ok: false; diagnostics: readonly LoamDiagnostic[] }
  | {
      ok: true;
      s1: Stage1Result;
      s2: Stage2Result;
      s3: Stage3Result;
      s4: Stage4Result;
      s5: Stage5Result;
      s6: Stage6Result;
      diagnostics: readonly LoamDiagnostic[];
      timings: {
        validate: number;
        field: number;
        layout: number;
        climate: number;
        columns: number;
        structures: number;
        programs: number;
        scatter: number;
        biomes: number;
        validators: number;
      };
      started: number;
    }
> {
  const started = now();
  const v = stage1ValidateInputs(input);
  if (!v.ok) {
    return { ok: false, diagnostics: v.diagnostics };
  }
  const s1 = v.result;
  const s2 = stage2TerrainFields(s1);
  const s3 = stage3SettlementLayout(s1, s2);
  const s4 = stage4ColumnGroundStructures(s1, s2, s3);
  const s5 = stage5ProgramsVegetation(s1, s3, s4, s2);
  const s6 = stage6FinalValidation(s1, s2, s3, s4, s5, options.allowUnstable ?? false);
  // Concatenate diagnostics in original order
  const diagnostics: LoamDiagnostic[] = [
    ...s1.diagnostics,
    ...s2.diagnostics,
    ...s3.diagnostics,
    ...s4.diagnostics,
    ...s5.diagnostics,
    ...s6.diagnostics,
  ];
  if (hasErrors(diagnostics)) {
    return { ok: false, diagnostics };
  }
  return {
    ok: true,
    s1,
    s2,
    s3,
    s4,
    s5,
    s6,
    diagnostics,
    timings: {
      validate: v.validateMs,
      field: s2.fieldMs,
      layout: s3.layoutMs,
      climate: s2.climateMs,
      columns: s4.columnsMs,
      structures: s4.structuresMs,
      programs: s5.programsMs,
      scatter: s5.scatterMs,
      biomes: s6.biomesMs,
      validators: s6.validatorsMs,
    },
    started,
  };
}

export async function compileTerrain(
  input: unknown,
  options: CompileTerrainOptions,
): Promise<CompileTerrainResult> {
  const pipeline = await runPipeline(input, options);
  if (!pipeline.ok) return pipeline;
  const { s1, s2, s3, s4, s5, s6, diagnostics, timings, started } = pipeline;
  const doc = s1.doc;
  const plan = s4.plan;
  // spawn resolution (mutates diagnostics)
  const markers = [
    ...s3.classification.markers,
    ...s2.terrain.edits.markers,
    ...(plan.caves?.markers ?? []),
    ...(s5.programs?.markers ?? []),
  ];
  // copy diagnostics to allow spawn to push warnings
  const emitDiagnostics: LoamDiagnostic[] = [...diagnostics];
  const spawnResult = resolveSpawn(doc, plan, markers, emitDiagnostics, s1.rootPath);
  const t6 = now();
  const structureBlocks =
    s4.structures === undefined && s5.programs === undefined
      ? undefined
      : [...(s4.structures?.blocks ?? []), ...(s5.programs?.blocks ?? [])];
  const emitInput = {
    plan,
    trees: s5.trees,
    decor: [...s5.decoration.blocks, ...(s5.transition?.blocks ?? [])],
    ...(structureBlocks === undefined ? {} : { structures: structureBlocks }),
    ...(s5.clip === undefined ? {} : { clip: s5.clip }),
    ...(s5.exemptTrunk === undefined ? {} : { clipExempt: s5.exemptTrunk }),
    stack: s1.stack,
    worldDir: options.outDir,
    levelName: doc.meta.name,
    spawn: spawnResult,
  };
  const emit = await emitTerrain(emitInput);
  const emitMs = now() - t6;
  // Build report with emit diagnostics (spawn may have added)
  const finalDiagnostics = emitDiagnostics;
  // If spawn added errors (unlikely), check again?
  if (hasErrors(finalDiagnostics)) {
    return { ok: false, diagnostics: finalDiagnostics };
  }
  const reportDiagnostics = finalDiagnostics;
  const partial: PipelineState = {
    s1, s2, s3, s4, s5, s6,
    diagnostics: reportDiagnostics,
    timings: timings as PipelineState["timings"],
    started,
  };
  const report = buildReport(partial, emit, options.provenance, s1.worldSeed, s1.region, reportDiagnostics);
  // Patch timings with emit + total
  const timingsWithEmit: CompileTimings = {
    ...timings,
    emit: emitMs,
    total: now() - started,
  };
  const finalReport: TerrainCompileReport = { ...report, timings: timingsWithEmit };
  if (s4.groundDriver !== undefined && s4.groundBaseline !== undefined) {
    const probed = s4.groundDriver.finish();
    options.onProbeGround?.({ baseline: s4.groundBaseline, resolved: probed });
  }
  return { ok: true, report: finalReport };
}

export async function compileArtifacts(
  input: unknown,
  options: CompileArtifactsOptions,
): Promise<CompileArtifactsResult> {
  const pipeline = await runPipeline(input, options);
  if (!pipeline.ok) return pipeline;
  const { s1, s2, s3, s4, s5, s6, diagnostics, timings, started } = pipeline;
  const doc = s1.doc;
  const plan = s4.plan;
  const markers = [
    ...s3.classification.markers,
    ...s2.terrain.edits.markers,
    ...(plan.caves?.markers ?? []),
    ...(s5.programs?.markers ?? []),
  ];
  const emitDiagnostics: LoamDiagnostic[] = [...diagnostics];
  const spawnResult = resolveSpawn(doc, plan, markers, emitDiagnostics, s1.rootPath);
  if (hasErrors(emitDiagnostics)) {
    return { ok: false, diagnostics: emitDiagnostics };
  }
  const structureBlocks =
    s4.structures === undefined && s5.programs === undefined
      ? undefined
      : [...(s4.structures?.blocks ?? []), ...(s5.programs?.blocks ?? [])];
  const artifacts: CompileArtifacts = {
    plan,
    trees: s5.trees,
    decor: [...s5.decoration.blocks, ...(s5.transition?.blocks ?? [])],
    ...(structureBlocks === undefined ? {} : { structures: structureBlocks }),
    ...(s5.clip === undefined ? {} : { clip: s5.clip }),
    spawn: spawnResult,
    stack: s1.stack,
  };
  const emit = unwrittenEmit(s1.stack, spawnResult);
  const partial: PipelineState = {
    s1, s2, s3, s4, s5, s6,
    diagnostics: emitDiagnostics,
    timings: timings as PipelineState["timings"],
    started,
  };
  const report = buildReport(partial, emit, options.provenance, s1.worldSeed, s1.region, emitDiagnostics);
  const timingsWithEmit: CompileTimings = {
    ...timings,
    emit: 0,
    total: now() - started,
  };
  const finalReport: TerrainCompileReport = { ...report, timings: timingsWithEmit };
  if (s4.groundDriver !== undefined && s4.groundBaseline !== undefined) {
    const probed = s4.groundDriver.finish();
    options.onProbeGround?.({ baseline: s4.groundBaseline, resolved: probed });
  }
  return { ok: true, report: finalReport, artifacts };
}

/* -------------------------------------------------------------------------- */
/* Helpers (remain exported for tests)                                        */
/* -------------------------------------------------------------------------- */

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

function styleWithIntent(
  style: TerrainDocument["style"],
  intents: CompilerIntentResolution,
): TerrainDocument["style"] {
  const overrides = intents.root.intent.character?.palettes;
  if (overrides === undefined || Object.keys(overrides).length === 0) return style;
  return { ...style, palettes: { ...(style?.palettes ?? {}), ...overrides } };
}

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
    ...(structures.farms === undefined ? {} : { farmParcels: structures.farms.landUseRects }),
  });
}

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
      if (nearParcel(region, farms.parcelMask, i, j)) density[idx] = 0;
    }
  }
  let cleared = 0;
  for (let k = 0; k < density.length; k++) if (density[k] === 0) cleared++;
  return { hulls, density, clearedColumns: cleared };
}

export const RECLAIM_CANOPY_GAIN = 0.8;

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

function paintBiomes(
  plan: ReturnType<typeof buildColumnPlan>,
  classification: Classification,
  climate: ReturnType<typeof buildClimateFields>,
  coverage: Uint8Array,
  stack: ReturnType<typeof loadPrismarine>,
  landUse: {
    readonly mask: Uint8Array;
    readonly nodePath: string;
    readonly intent?: ClimateIntent;
    readonly feather?: number;
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

function roadNetworkCorridors(
  doc: SettlementDocument,
  rootPath: string,
  region: Region,
  nodes: readonly LayoutNodeInput[],
): RouteCorridor[] {
  const roadNode = doc.root.children.find(
    (c) => c.kind === "generator" && (c as { generator?: string }).generator === "road.network@0",
  ) as { id: string; params?: Record<string, unknown> } | undefined;
  if (roadNode === undefined) return [];
  const params = roadNode.params ?? {};
  const anchorsRaw = params["anchors"];
  const anchors = Array.isArray(anchorsRaw)
    ? anchorsRaw.filter((a): a is string => typeof a === "string")
    : [];
  const width = roadParamsOf(params).width ?? 3;
  return registerRoadCorridors(`${rootPath}.${roadNode.id}`, anchors, nodes, region, width);
}

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

function programJobsFrom(
  doc: SettlementDocument | TerrainDocument,
  rootPath: string,
  placements: readonly Placement[],
  diagnostics: LoamDiagnostic[],
  ground: {
    plan: ColumnPlan;
    worldSeed: bigint;
    solved: boolean;
    rotations?: ReadonlyMap<string, ProgramRotation>;
    facings?: ReadonlyMap<string, ProgramFacing>;
  },
): readonly ProgramJob[] {
  const map = doc.programs ?? {};
  const jobs: ProgramJob[] = [];
  const claimed: Rect[] = placements.map((p) => p.footprint);
  for (const child of doc.root.children as readonly ProgramNode[]) {
    if (child.kind !== "generator") continue;
    const node = child as ProgramNode;
    const nodePath = `${rootPath}.${node.id}`;
    const salt = node.seedSalt === undefined ? {} : { seedSalt: node.seedSalt };
    if (isAuthoredGenerator(node.generator)) {
      const programId = authoredProgramId(node.generator);
      if (programId === undefined) continue;
      const program = map[programId];
      if (program === undefined) {
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
      const hover = hoverOf(node);
      const solved = placements.find((p) => p.nodePath === nodePath);
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
        site = { footprint: solved.footprint, baseY: solved.foundationY, ...seatOn(node), ...turned };
      } else if (!ground.solved) {
        const hint = coarseHintArea(node, ground.plan.region);
        const found = planLandmarkSite({
          envelope: program.envelope,
          plan: ground.plan,
          seed: nodeSeed(ground.worldSeed, nodePath, node.seedSalt ?? ""),
          taken: claimed,
          ...(hint === undefined ? {} : { hint }),
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
        program: program as ProgramJob["program"],
        mode: "landmark",
        placement: site,
        ...salt,
      } as ProgramJob);
      continue;
    }
    if (node.generator !== PROGRAM_SCATTER_GENERATOR) continue;
    const params = ((node as { params?: unknown }).params ?? {}) as ProgramScatterParams;
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
      program: program as ProgramJob["program"],
      mode: "plugin",
      params,
      ...(facing === undefined ? {} : { facing }),
      ...(hoverOfParams(params) === undefined ? { seat: seatOfParams(params) } : {}),
      ...salt,
    } as ProgramJob);
  }
  return jobs;
}

export function seatOn(node: unknown): { seat?: SeatDecision; seatExplicit?: boolean } {
  const seat = seatPolicyOf(node);
  if (seat === undefined) return {};
  const params = typeof node === "object" && node !== null && "params" in (node as Record<string, unknown>) ? (node as { params?: unknown }).params : undefined;
  return explicitSeatOfParams(params) === undefined ? { seat } : { seat, seatExplicit: true };
}

function claimProgramFootprints(
  occupancy: OccupancyGrid,
  placed: readonly PlacedProgram[],
): void {
  const { region, mask } = occupancy;
  for (const instance of placed) {
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

export function generatorCoverageNotes(
  children: readonly { readonly kind: string; readonly id: string; readonly generator?: string }[],
  rootPath: string,
): readonly LoamDiagnostic[] {
  const handled = new Set<string>([
    ...PROFILE_GENERATORS,
    ...STRUCTURE_GENERATORS,
    PROP_GENERATOR,
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

function zoneOf(node: ProgramNode): string | undefined {
  for (const raw of canonicalConstraints(node.constraints)) {
    if (raw.type === "zone" && typeof (raw as Record<string, unknown>)["zone"] === "string") return (raw as Record<string, unknown>)["zone"] as string;
  }
  return undefined;
}

export type { TreePlacement };
