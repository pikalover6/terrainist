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
  type Classification,
  type Marker,
  type Region,
  type TerrainEdit,
} from "@terrainist/stdlib";
import {
  type EditNode,
  type ForestNode,
  type LoamDiagnostic,
  type SettlementDocument,
  type TerrainDocument,
  validateSettlementDocument,
  validateTerrainDocument,
  note,
  warning,
  hasErrors,
} from "@terrainist/spec";

import {
  applyPadEdits,
  layoutNodesFrom,
  solveLayout,
  type OccupancyGrid,
  type PadEdit,
  type Placement,
  type ResolvedPort,
  type SolverReport,
} from "../layout/index.js";

import { EMIT_MINECRAFT_VERSION } from "../emit/world.js";
import { loadPrismarine } from "../emit/prismarine.js";

import { biomeForColumn } from "./biomes.js";
import { buildClimateFields, resolveClimateParams } from "./climate.js";
import { buildColumnPlan, type VolcanoInfo } from "./columns.js";
import { decorate } from "./decorate.js";
import { emitTerrain, type TerrainEmitSummary } from "./emit.js";
import { resolvePalette } from "./palette.js";
import { checkFloatingVegetation, checkFluidStability, validatorDiagnostics } from "./validate.js";
import { scatterForests, type ForestNodeInput, type TreePlacement } from "./vegetation.js";

/** Default `lavaFlows` for a volcano edit that does not name one. */
export const DEFAULT_LAVA_FLOWS = 2;

/** Options for {@link compileTerrain}. */
export interface CompileTerrainOptions {
  /** World folder to write. */
  readonly outDir: string;
  /** Downgrade `LOAM-T110` to a warning instead of failing. */
  readonly allowUnstable?: boolean;
  /** Emit target version; defaults to the pinned one. */
  readonly minecraftVersion?: string;
}

/** Wall-clock milliseconds per pass. */
export interface CompileTimings {
  readonly validate: number;
  readonly field: number;
  /** Layout solve; zero for terrain-profile documents. */
  readonly layout: number;
  readonly climate: number;
  readonly columns: number;
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
}

/** What the layout solver contributed, on a settlement-profile compile. */
export interface LayoutOutcome {
  readonly report: SolverReport;
  readonly placements: readonly Placement[];
  readonly ports: readonly ResolvedPort[];
  readonly padEdits: readonly PadEdit[];
}

/** The compile report — what the CLI prints and `--report` writes. */
export interface TerrainCompileReport {
  readonly name: string;
  readonly prompt?: string;
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

  // --- palette -------------------------------------------------------------
  const rootSeed = nodeSeed(worldSeed, rootPath, "");
  const { palette, unknownBlocks } = resolvePalette(stack, doc.style, rootSeed);
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
    diagnostics.push(
      build(
        "BASIN_RIM_NOT_CLOSED",
        `${hfPath}.${d.editId}`,
        d.message,
        'close the basin rim (increase "radius" or reduce "depth") to raise the waterline, or drop "water": true',
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
  const tLayout = now();
  if (isSettlement(doc)) {
    const extraction = layoutNodesFrom(doc, worldSeed);
    diagnostics.push(...extraction.diagnostics);
    const solved = solveLayout({
      region,
      field: terrain.field,
      classification,
      seaLevel: terrain.params.seaLevel,
      rootPath,
      nodes: extraction.nodes,
      hazardMask: buildHazardMask(region, classification, terrain.edits.calderas),
    });
    diagnostics.push(...solved.diagnostics);
    occupancy = solved.occupancy;
    layoutOutcome = {
      report: solved.report,
      placements: solved.placements,
      ports: solved.ports,
      padEdits: solved.padEdits,
    };
    if (solved.padEdits.length > 0) {
      applyPadEdits(terrain.field, solved.padEdits);
      classification = classify(terrain.field, terrain.params, {
        temperature: climate.temperature,
        noFlood: terrain.edits.noFlood,
        basins: terrain.edits.basins,
        footprints: terrain.edits.footprints,
      });
    }
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
  const scatter = scatterForests(forestNodes, plan, classification, palette, occupancy);
  const decoration = decorate({
    plan,
    classification,
    temperature: climate.temperature,
    trees: scatter.trees,
    forests: scatter.nodes,
    palette,
    stack,
    seed: rootSeed,
  });
  const scatterMs = now() - t3;

  // --- pass 4b: biomes -----------------------------------------------------
  const t4 = now();
  const biomeHistogram = paintBiomes(plan, classification, climate, scatter.coverage, stack);
  const biomesMs = now() - t4;

  // --- pass 7: validators --------------------------------------------------
  const t5 = now();
  const fluids = checkFluidStability(plan);
  const floating = checkFloatingVegetation(plan, scatter.trees);
  diagnostics.push(
    ...validatorDiagnostics(fluids, floating, { allowUnstable: options.allowUnstable ?? false }),
  );
  const validatorsMs = now() - t5;

  if (hasErrors(diagnostics)) {
    return { ok: false, diagnostics };
  }

  // --- pass 8: emit --------------------------------------------------------
  const markers = [...classification.markers, ...terrain.edits.markers];
  const spawnResult = resolveSpawn(doc, plan, markers, diagnostics, rootPath);
  const t6 = now();
  const emit = await emitTerrain({
    plan,
    trees: scatter.trees,
    decor: decoration.blocks,
    stack,
    worldDir: options.outDir,
    levelName: doc.meta.name,
    spawn: spawnResult,
  });
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
      treeCount: scatter.trees.length,
      treesPerNode: scatter.perNode,
      unstableFluidBlocks: fluids.unstable,
      floatingTrees: floating.length,
      biomeHistogram,
      chunkCount: emit.chunkCount,
      blockCount: emit.blockCount,
      treeBlockCount: emit.treeBlockCount,
      decorBlockCount: emit.decorBlockCount,
      decorCounts: decoration.counts,
      volcanicColumns,
      lavaFlowColumns,
    },
    diagnostics,
    ...(layoutOutcome === undefined ? {} : { layout: layoutOutcome }),
    timings: {
      validate: clock.validateMs,
      field: fieldMs,
      layout: layoutMs,
      climate: climateMs,
      columns: columnsMs,
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

/** Assign every column its biome id, and count the result. */
function paintBiomes(
  plan: ReturnType<typeof buildColumnPlan>,
  classification: Classification,
  climate: ReturnType<typeof buildClimateFields>,
  coverage: Uint8Array,
  stack: ReturnType<typeof loadPrismarine>,
): Record<string, number> {
  const ids = new Map<string, number>();
  const histogram: Record<string, number> = {};

  for (let idx = 0; idx < plan.ground.length; idx++) {
    const name = biomeForColumn({
      surfaceClass: classification.classes[idx] as number,
      groundY: plan.ground[idx] as number,
      relief: classification.relief[idx] as number,
      temperature: climate.temperature[idx] as number,
      forested: coverage[idx] === 1,
      lake: plan.lakeMask[idx] === 1,
      volcanicUpper: plan.volcanicUpper[idx] === 1,
    });
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

  return Object.fromEntries(Object.entries(histogram).sort(([a], [b]) => (a < b ? -1 : 1)));
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
function buildHazardMask(
  region: Region,
  classification: Classification,
  calderas: readonly { readonly lava: boolean; readonly columns: Int32Array }[],
): Uint8Array {
  const mask = new Uint8Array(region.width * region.depth);
  for (let k = 0; k < mask.length; k++) {
    if (classification.oceanMask[k] === 1 || classification.lakeMask[k] === 1) mask[k] = 1;
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

/** Monotonic-ish millisecond clock for pass timings. */
function now(): number {
  return Number(process.hrtime.bigint() / 1000n) / 1000;
}

export type { TreePlacement };
