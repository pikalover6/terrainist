/**
 * The dev world — `building.grammar@0` on a lit, flat, empty stage.
 *
 * Every visual defect found in `building.grammar@0` so far was found the hard
 * way: compile a 320-block village, wait, render nine views, hunt for the one
 * cottage that shows the symptom, and hope the next compile still places it
 * somewhere you can see it. That loop is slow, and worse, it is *confounded* —
 * a wall that looks wrong at the bottom of a wooded slope may be wrong, or may
 * be in shadow, or may be half-eaten by a birch.
 *
 * The dev world removes every one of those variables at once. It is a flat
 * grass plain with nothing on it but a grid of buildings: rows are archetypes,
 * columns are a gradient across size, storeys, theme and roof shape, and the
 * whole thing is generated from one pinned seed so the grid is the *same* grid
 * every time. Two renders of two builds are then diffable by eye, which is the
 * property that makes it a development tool rather than a demo.
 *
 * Three deliberate choices:
 *
 * - **No terrain generator runs.** The column plan is written by hand: grass at
 *   {@link DEV_GROUND_Y}, three of soil, stone below. There is no heightfield,
 *   no climate, no scatter, so nothing upstream of the grammar can move.
 * - **No fluids on the plain.** Water exists only where an exhibit dug it — the
 *   harbour row's basin, the shore strip, the bridge channel, the harbour
 *   chain's inlet and the water movers' watercourse — and every one of those is
 *   cut so that its neighbours stand at or above its surface. The smoke test
 *   asserts zero unstable columns rather than assuming it: a pass that starts
 *   placing water is a defect worth catching here, where it is one band.
 * - **Void outside the grid.** Only the chunks the grid touches are written, so
 *   the world ends where the exhibit ends and there is no horizon to read the
 *   buildings against but sky.
 *
 * The buildings are spaced by {@link DEV_GAP} blocks and each row is fronted by
 * a gravel rule running its whole length, which is what lets you say "third
 * building, granary row" and have that mean something without placing a single
 * sign.
 */

import path from "node:path";

import { buildInfraRunExhibit, INFRA_RUN_DEPTH, INFRA_RUN_WIDTH } from "./exhibits/infra.js";
import {
  buildBridgeStylesExhibit,
  buildHarbourChainExhibit,
  buildWaterWorksExhibit,
  BRIDGE_STYLES_DEPTH,
  BRIDGE_STYLES_WIDTH,
  HARBOUR_CHAIN_DEPTH,
  HARBOUR_CHAIN_WIDTH,
  MARSH_DEPTH,
  MARSH_WIDTH,
  WATER_WORKS_DEPTH,
  WATER_WORKS_WIDTH,
  type BridgeStylesExhibitResult,
  type HarbourChainExhibitResult,
  type WaterWorksExhibitResult,
} from "./exhibits/infra2.js";

import {
  assignMaterials,
  nodeSeed,
  pickTheme,
  BLITZ_BUILDING_ARCHETYPES,
  BUILDING_ARCHETYPES,
  EXTENDED_BUILDING_ARCHETYPES,
  VERNACULAR_BUILDING_ARCHETYPES,
  type BuildingArchetype,
  type BuildingMaterials,
  type BuildingParams,
  type Region,
} from "@terrainist/stdlib";
import type { PortDeclaration } from "@terrainist/spec";

import { emitTerrain, type TerrainEmitSummary } from "./terrain/emit.js";
import { EMIT_MINECRAFT_VERSION, loadPrismarine } from "./emit/index.js";
import type { PrismarineStack } from "./emit/prismarine.js";
import { FluidKind, type ColumnPlan } from "./terrain/columns.js";
import { checkFluidStability, type FluidStabilityReport } from "./terrain/validate.js";
import {
  buildBuildings,
  wingParamOf,
  type BuildingJob,
  type BuiltBuilding,
  type StructureBlock,
} from "./structures/buildings.js";
import {
  DEV_ROOFS,
  DEV_THEMES,
  EXTRA_EXHIBIT_ROWS,
  buildContextExhibits,
  buildPropExhibits,
  planContextSection,
  planPropExhibits,
  type ContextResult,
  type ContextSection,
  type DevExhibitCell,
  type PropExhibit,
} from "./devworld-rows.js";
import type { PlacedProp } from "./structures/props.js";

/** World Y of the showcase plain. */
export const DEV_GROUND_Y = 64;

/** Blocks of clear ground between two exhibits, in both axes. */
export const DEV_GAP = 12;

/** Blocks of clear ground around the whole grid. */
export const DEV_MARGIN = 16;

/** The pinned seed. The dev world is a fixture, so it never rerolls. */
export const DEV_WORLD_SEED = 20260728n;

/** The world folder name, and the level name inside `level.dat`. */
export const DEV_WORLD_NAME = "dev_world";

/**
 * The archetype rows, in grid order — one row each, north to south.
 *
 * A re-export rather than a use of `BUILDING_ARCHETYPES` directly, so that a
 * new archetype added to the grammar shows up in the dev world by *default*:
 * the grid is the place a new archetype should first be looked at, and making
 * that opt-in would guarantee it is not.
 */
export const BUILDING_ARCHETYPES_ROWS: readonly BuildingArchetype[] = BUILDING_ARCHETYPES;

export { DEV_ROOFS, DEV_THEMES } from "./devworld-rows.js";

/**
 * The archetypes the *base* grid lays out on its own size gradient.
 *
 * The original six. The seven extended archetypes get rows of their own from
 * `exhibits/archetypes.ts`, on footprints shaped like the buildings they are —
 * a church is a nave, a market stall is barely a room — and putting them in
 * both places would give the grid two rows with the same label. The ten
 * breadth-blitz archetypes are excluded for the same reason — their rows come
 * from `exhibits/blitz.ts`, and a keep at nine by seven with a mullioned
 * window is not a keep — and the three vernacular ones likewise:
 * `exhibits/vernacular.ts` gives them rows on footprints their re-roofs need
 * (a saltbox has to be deep or its long slope has nowhere to fall).
 */
export const BASE_ARCHETYPE_ROWS: readonly BuildingArchetype[] = BUILDING_ARCHETYPES.filter(
  (a) =>
    !(EXTENDED_BUILDING_ARCHETYPES as readonly string[]).includes(a) &&
    !(BLITZ_BUILDING_ARCHETYPES as readonly string[]).includes(a) &&
    !(VERNACULAR_BUILDING_ARCHETYPES as readonly string[]).includes(a),
);

/** One exhibit: what it is, and where the grid put it. */
export interface DevExhibit {
  readonly id: string;
  /** Row label — the archetype, or `"roofs"` for the roof-comparison row. */
  readonly row: string;
  readonly column: number;
  readonly archetype: BuildingArchetype;
  readonly theme: string;
  readonly roof: string;
  readonly floors: number;
  readonly size: readonly [number, number, number];
  /** Extra generator params this cell carries — a wing, a facade override. */
  readonly params?: Readonly<Record<string, unknown>>;
  /** The node's `seedSalt`, when the row rerolls a cell rather than changing it. */
  readonly seedSalt?: string;
  /** South-west corner of the footprint, in world columns. */
  readonly x: number;
  readonly z: number;
}

/** The grid, before anything is built. */
export interface DevGrid {
  readonly exhibits: readonly DevExhibit[];
  readonly region: Region;
  /** Where the player lands: the grid's south-west corner. */
  readonly spawn: readonly [number, number, number];
  /** Rows, in order, with the z of each row's gravel rule. */
  readonly rules: readonly { readonly row: string; readonly z: number; readonly x0: number; readonly x1: number }[];
  /** North-west corner of the prop grid, south of the last building row. */
  readonly propOrigin: { readonly x: number; readonly z: number };
  /** North-west corner of the context section, south of the prop grid. */
  readonly contextOrigin: { readonly x: number; readonly z: number };
  /** North-west corner of the infra run exhibit's band. */
  readonly infraOrigin: { readonly x: number; readonly z: number };
  /** North-west corner of the three-bridge-styles band. */
  readonly bridgeStylesOrigin: { readonly x: number; readonly z: number };
  /** North-west corner of the harbour chain-tower band. */
  readonly harbourChainOrigin: { readonly x: number; readonly z: number };
  /** North-west corner of the watercourse the three water movers sit on. */
  readonly waterWorksOrigin: { readonly x: number; readonly z: number };
  /** North-west corner of the marsh band — the dam that holds nothing. */
  readonly marshOrigin: { readonly x: number; readonly z: number };
  /** The context section's plan — strips of shaped ground and what stands on them. */
  readonly context: ContextSection;
}

/** What {@link buildDevWorld} produced. */
export interface DevWorldResult {
  readonly grid: DevGrid;
  readonly buildings: readonly BuiltBuilding[];
  readonly emit: TerrainEmitSummary;
  readonly fluids: FluidStabilityReport;
  /** Light sources emitted across the grid — lanterns, torches, campfires. */
  readonly lightCount: number;
  readonly buildingCount: number;
  /** Props placed south of the building grid, as the grid planned them. */
  readonly props: readonly PropExhibit[];
  /** Where each prop actually landed — the lint's `props` context. */
  readonly placedProps: readonly PlacedProp[];
  readonly propCount: number;
  /** Columns dug and flooded for the harbour row's basin and the shore strip's. */
  readonly pondColumns: number;
  /** What the context section built — the one part of the world on real terrain. */
  readonly contextResult: ContextResult;
  /** Every block the grammar emitted, in build order. */
  readonly blocks: readonly StructureBlock[];
  /** The three bridge styles, over one channel. */
  readonly bridgeStyles: BridgeStylesExhibitResult;
  /** The harbour chain: two towers on two moles, and the catenary between. */
  readonly harbourChain: HarbourChainExhibitResult;
  /** The weir, the lock, the dam — and the dam that holds nothing. */
  readonly waterWorks: WaterWorksExhibitResult;
}

/* -------------------------------------------------------------------------- */
/* the grid                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * How many exhibits each archetype row carries.
 *
 * Seven is the smallest number that shows the whole gradient without repeating
 * a cell: three themes × (small, medium, large) needs at least seven columns
 * before the storey change has anywhere to land.
 */
export const DEV_ROW_LENGTH = 7;

/** Footprint of one archetype at gradient position `t` in `0..1`. */
function sizeFor(archetype: BuildingArchetype, column: number): [number, number, number] {
  const grow = column; // 0..DEV_ROW_LENGTH-1
  switch (archetype) {
    case "watchtower":
      // A tower grows mostly upward; its plan widens half as fast as the
      // others so the row still reads as "short tower ... tall tower".
      return [7 + (grow >> 1), 15 + grow * 2, 7 + (grow >> 1)];
    case "hall":
      return [11 + grow, 11 + (grow % 3), 9 + (grow % 4)];
    case "inn":
      return [9 + grow, 11, 8 + (grow % 4)];
    case "granary":
      return [8 + grow, 9, 9 + (grow % 4)];
    case "smithy":
      return [8 + grow, 8, 8 + (grow % 3)];
    case "cottage":
    default:
      return [7 + grow, 8, 7 + (grow % 3)];
  }
}

/**
 * Lay out the grid.
 *
 * Rows run west to east; the grid grows north from the spawn corner, so the
 * player arriving at the south-west corner sees the whole exhibit laid out in
 * front of them rather than behind.
 */
export function planDevGrid(): DevGrid {
  const rows: { row: string; cells: DevExhibitCell[] }[] = [];

  for (const archetype of BASE_ARCHETYPE_ROWS) {
    const cells: DevExhibitCell[] = [];
    for (let c = 0; c < DEV_ROW_LENGTH; c++) {
      const size = sizeFor(archetype, c);
      // The gradient: size grows left to right, the storey count steps up at
      // the halfway mark, and theme and roof cycle on coprime-ish periods so
      // no two cells of a row are the same combination.
      const floors = c < Math.ceil(DEV_ROW_LENGTH / 2) ? 1 : 2;
      cells.push({
        id: `${archetype}_${c}`,
        archetype,
        theme: DEV_THEMES[c % DEV_THEMES.length] as string,
        roof: DEV_ROOFS[c % DEV_ROOFS.length] as string,
        floors: archetype === "watchtower" ? 2 : floors,
        size,
      });
    }
    rows.push({ row: archetype, cells });
  }

  // The control row: one footprint, one storey count, every roof against every
  // theme. Anything that differs across these nine is the roof or the palette,
  // and nothing else — which is what makes it the row to look at first.
  const roofCells: DevExhibitCell[] = [];
  for (const roof of DEV_ROOFS) {
    for (const theme of DEV_THEMES) {
      roofCells.push({
        id: `roofs_${roof}_${theme}`,
        archetype: "cottage",
        theme,
        roof,
        floors: 1,
        size: [9, 9, 9],
      });
    }
  }
  rows.push({ row: "roofs", cells: roofCells });

  // The tracks' own rows, through the one seam this file reads: the extended
  // archetypes on footprints shaped like themselves, then the L and the T.
  for (const row of EXTRA_EXHIBIT_ROWS) rows.push({ row: row.row, cells: [...row.cells] });

  // --- place ---------------------------------------------------------------
  const exhibits: DevExhibit[] = [];
  const rules: { row: string; z: number; x0: number; x1: number }[] = [];
  let z = 0;
  let maxX = 0;

  for (const row of rows) {
    const depth = Math.max(...row.cells.map((c) => c.size[2] as number));
    let x = 0;
    for (const [column, cell] of row.cells.entries()) {
      exhibits.push({ ...cell, row: row.row, column, x, z });
      x += cell.size[0] + DEV_GAP;
    }
    maxX = Math.max(maxX, x - DEV_GAP);
    // The rule sits two blocks south of the row it labels — clear of the
    // buildings' own aprons, which reach one block out.
    rules.push({ row: row.row, z: z - 3, x0: 0, x1: x - DEV_GAP - 1 });
    z += depth + DEV_GAP;
  }

  // The props go south of every building row, on their own grid: they are not
  // buildings, they are laid out on their rotated extents rather than on an
  // envelope, and one of their rows carries a pond.
  const propOrigin = { x: 0, z };
  const propGrid = planPropExhibits(propOrigin.x, propOrigin.z);
  maxX = Math.max(maxX, propGrid.width);
  z += propGrid.depth + DEV_GAP;

  // The context section goes last, south of everything. It is the only part of
  // the world whose ground is not the plain, so it is kept as far from the grid
  // as the layout allows: a strip's grade must never read as an error in the
  // row above it.
  const contextOrigin = { x: 0, z };
  const context = planContextSection(contextOrigin.x, contextOrigin.z);
  maxX = Math.max(maxX, context.width);
  z += context.depth + DEV_GAP;

  // The infra run, south of everything: it shapes its own slope band, and a
  // run is reviewed as a run, not a cell (INFRA-ENTRIES §3.7).
  const infraOrigin = { x: 0, z };
  maxX = Math.max(maxX, INFRA_RUN_WIDTH);
  z += INFRA_RUN_DEPTH + DEV_GAP;

  // The three bridge styles, then the harbour chain, then the watercourse and
  // its marsh: four more bands, each shaping only its own ground, in the same
  // idiom and for the same reason as the run band above them.
  const bridgeStylesOrigin = { x: 0, z };
  maxX = Math.max(maxX, BRIDGE_STYLES_WIDTH);
  z += BRIDGE_STYLES_DEPTH + DEV_GAP;

  const harbourChainOrigin = { x: 0, z };
  maxX = Math.max(maxX, HARBOUR_CHAIN_WIDTH);
  z += HARBOUR_CHAIN_DEPTH + DEV_GAP;

  const waterWorksOrigin = { x: 0, z };
  maxX = Math.max(maxX, WATER_WORKS_WIDTH);
  z += WATER_WORKS_DEPTH + DEV_GAP;

  // The marsh gets a band of its own rather than a corner of the watercourse's:
  // a water mover's crossing is looked for within `WATERCOURSE_SEARCH` columns
  // of its anchor **in both axes**, and a hopeless pan close enough to the
  // channel would be the narrowest water in every one of the channel's own
  // search rectangles — three dams built on one marsh.
  const marshOrigin = { x: 0, z };
  maxX = Math.max(maxX, MARSH_WIDTH);
  const depthTotal = z + MARSH_DEPTH;

  const region: Region = {
    x0: -DEV_MARGIN,
    z0: -DEV_MARGIN,
    width: maxX + DEV_MARGIN * 2,
    depth: depthTotal + DEV_MARGIN * 2,
  };

  return {
    exhibits,
    region,
    // South-west corner: minimum x, maximum z. The player faces the grid.
    spawn: [region.x0 + 4, DEV_GROUND_Y + 1, region.z0 + region.depth - 5],
    rules,
    propOrigin,
    contextOrigin,
    infraOrigin,
    bridgeStylesOrigin,
    harbourChainOrigin,
    waterWorksOrigin,
    marshOrigin,
    context,
  };
}

/* -------------------------------------------------------------------------- */
/* the plain                                                                   */
/* -------------------------------------------------------------------------- */

/** A dead flat, dry, grassed column plan — no generator involved. */
export function devColumnPlan(region: Region, stack: PrismarineStack): ColumnPlan {
  const n = region.width * region.depth;
  const state = (name: string): number => stack.blockByName(name)?.stateId ?? 0;
  const ground = new Int32Array(n).fill(DEV_GROUND_Y);
  const biomeId = stack.biomeIdByName("minecraft:plains") ?? 0;
  return {
    region,
    ground,
    fluidTop: ground.slice(),
    fluidKind: new Uint8Array(n).fill(FluidKind.NONE),
    surface: new Int32Array(n).fill(state("grass_block")),
    subsurface: new Int32Array(n).fill(state("dirt")),
    soil: new Uint8Array(n).fill(3),
    snow: new Uint8Array(n),
    biome: new Uint16Array(n).fill(biomeId),
    volcanic: new Uint8Array(n),
    volcanicUpper: new Uint8Array(n),
    lavaFlow: new Uint8Array(n),
    lakeMask: new Uint8Array(n),
    oceanMask: new Uint8Array(n),
    seaLevel: DEV_GROUND_Y - 8,
    stoneSeed: 0,
    states: {
      bedrock: state("bedrock"),
      stone: state("stone"),
      deepslate: state("deepslate"),
      water: state("water"),
      lava: state("lava"),
      snowLayer: state("snow"),
      caveAir: state("cave_air"),
    },
  };
}

/** Paint one row's gravel rule into the plan's surface. */
function paintRules(plan: ColumnPlan, grid: DevGrid, stack: PrismarineStack): void {
  const gravel = stack.blockByName("gravel")?.stateId ?? 0;
  const { region } = plan;
  for (const rule of grid.rules) {
    const j = rule.z - region.z0;
    if (j < 0 || j >= region.depth) continue;
    for (let x = rule.x0; x <= rule.x1; x++) {
      const i = x - region.x0;
      if (i < 0 || i >= region.width) continue;
      plan.surface[j * region.width + i] = gravel;
    }
  }
}

/* -------------------------------------------------------------------------- */
/* the build                                                                   */
/* -------------------------------------------------------------------------- */

/** The door port every exhibit declares: south-facing, so the grid faces you. */
const DEV_PORTS: Readonly<Record<string, PortDeclaration>> = Object.freeze({
  door: { type: "door", face: "south", tags: ["primary"] } as PortDeclaration,
});

/**
 * The generator params one exhibit hands the grammar.
 *
 * An explicit whitelist, for the same reason `structures/index.ts` has one: a
 * row is data, and data that could reach the grammar unfiltered would let an
 * exhibit exercise a param no document can. The three columns the grid owns
 * (storeys, roof, archetype) come from the cell; everything else has to be
 * something a Loam document could also have said.
 */
export function exhibitParams(e: DevExhibit): BuildingParams {
  const extra = e.params ?? {};
  const wing = wingParamOf(extra["wing"]);
  return {
    floors: e.floors,
    roof: e.roof,
    archetype: e.archetype,
    ...(typeof extra["windowShape"] === "string" ? { windowShape: extra["windowShape"] } : {}),
    ...(typeof extra["windowRhythm"] === "string" ? { windowRhythm: extra["windowRhythm"] } : {}),
    ...(typeof extra["floorHeight"] === "number" ? { floorHeight: extra["floorHeight"] } : {}),
    // The cellar. A `basement` int is exactly what `structures/index.ts` reads
    // off a document (via `resolveBasementParam`), so the breakpoint rows can
    // exhibit its clamps without the grid learning a param no author has.
    ...(typeof extra["basement"] === "number" ? { basement: extra["basement"] } : {}),
    // …and how it is dressed, which is a `basement.style` in a document and so
    // is something a document could also have said.
    ...(typeof extra["cellarStyle"] === "string" ? { cellarStyle: extra["cellarStyle"] } : {}),
    ...(wing === undefined ? {} : { wing }),
  };
}

/** Build and write the dev world into `outDir/dev_world`. */
export async function buildDevWorld(outDir: string): Promise<DevWorldResult> {
  const stack = loadPrismarine(EMIT_MINECRAFT_VERSION);
  const grid = planDevGrid();
  const plan = devColumnPlan(grid.region, stack);
  paintRules(plan, grid, stack);

  const jobs: BuildingJob[] = grid.exhibits.map((e) => {
    const nodePath = `dev.${e.row}.${e.id}`;
    // The salt is the seed-sweep row's whole content: same node, same envelope,
    // eight draws. Every other row leaves it empty and is unaffected.
    const seed = nodeSeed(DEV_WORLD_SEED, nodePath, e.seedSalt ?? "");
    // One theme per exhibit, named rather than drawn — the whole point of the
    // grid is that the column you are looking at is the theme it claims to be.
    const theme = pickTheme(seed, e.theme);
    const materials = assignMaterials(theme, 1, seed)[0] as BuildingMaterials;
    const footprint = {
      x0: e.x,
      z0: e.z,
      x1: e.x + e.size[0] - 1,
      z1: e.z + e.size[2] - 1,
    };
    return {
      nodePath,
      placement: {
        nodePath,
        id: e.id,
        translation: [e.x, DEV_GROUND_Y, e.z] as [number, number, number],
        yaw: 0,
        mirror: false,
        size: e.size,
        footprint,
        anchor: { x: e.x + ((e.size[0] - 1) >> 1), z: e.z + ((e.size[2] - 1) >> 1) },
        foundationY: DEV_GROUND_Y,
      },
      size: e.size,
      params: exhibitParams(e),
      ports: DEV_PORTS,
      seed,
      tags: [e.archetype],
      materials,
    };
  });

  const built = buildBuildings(jobs, plan, stack);

  // The props, last: `buildPropExhibits` digs the harbour row's basin into the
  // plan, and the plan has to be the finished one before anything is placed
  // over water. It is south of every building row, so nothing above it moves.
  const props = buildPropExhibits(plan, stack, DEV_WORLD_SEED, grid.propOrigin.x, grid.propOrigin.z);

  // The context section, last of all: it shapes its own ground, and the pads,
  // skirts, aprons and doorsteps it then runs all measure themselves against
  // the plan as it finally is. Nothing above it moves, because every strip
  // writes only inside its own band.
  const context = buildContextExhibits({
    plan,
    stack,
    worldSeed: DEV_WORLD_SEED,
    baseY: DEV_GROUND_Y,
    x0: grid.contextOrigin.x,
    z0: grid.contextOrigin.z,
  });

  // The infra run, after the context section: it grades its own band and
  // sweeps one test_fence along a course with a straight, a diagonal, a
  // corner, a climb, and a found gate at its carriageway.
  const infraRun = buildInfraRunExhibit(
    plan,
    stack,
    DEV_WORLD_SEED,
    grid.infraOrigin.x,
    grid.infraOrigin.z,
    DEV_GROUND_Y,
  );

  // The three post-run infra bands, in grid order. Each digs its own water and
  // writes only inside its own extent, so the bands above are untouched — and
  // the water movers run through `buildInfraEntries` with a real ground driver,
  // which is the only path on which a dam's pool goes in at rank 0.
  const bridgeStyles = buildBridgeStylesExhibit(
    plan,
    stack,
    DEV_WORLD_SEED,
    grid.bridgeStylesOrigin.x,
    grid.bridgeStylesOrigin.z,
    DEV_GROUND_Y,
  );
  const harbourChain = buildHarbourChainExhibit(
    plan,
    stack,
    DEV_WORLD_SEED,
    grid.harbourChainOrigin.x,
    grid.harbourChainOrigin.z,
    DEV_GROUND_Y,
  );
  const waterWorks = buildWaterWorksExhibit(
    plan,
    stack,
    DEV_WORLD_SEED,
    grid.waterWorksOrigin.x,
    grid.waterWorksOrigin.z,
    grid.marshOrigin.x,
    grid.marshOrigin.z,
    DEV_GROUND_Y,
  );

  const structures = [
    ...built.blocks,
    ...props.blocks,
    ...context.blocks,
    ...infraRun.blocks,
    ...bridgeStyles.blocks,
    ...harbourChain.blocks,
    ...waterWorks.blocks,
  ];

  const emit = await emitTerrain({
    plan,
    trees: [],
    structures,
    stack,
    worldDir: path.join(path.resolve(outDir), DEV_WORLD_NAME),
    levelName: DEV_WORLD_NAME,
    spawn: { x: grid.spawn[0], y: grid.spawn[1], z: grid.spawn[2] },
  });

  const fluids = checkFluidStability(plan);

  const lit = new Set(
    ["lantern", "torch", "wall_torch", "campfire", "soul_lantern", "sea_lantern", "glowstone"]
      .map((name) => stack.blockByName(name)?.stateId)
      .filter((id): id is number => id !== undefined),
  );
  let lightCount = 0;
  for (const b of structures) if (lit.has(b.stateId)) lightCount++;

  // The context cells are buildings like any other as far as every consumer is
  // concerned — the lantern check, the physics lint's interior rules, the
  // block-count claims — so they are appended to the same list rather than
  // hidden behind `contextResult`. What `contextResult` carries is the part
  // that is *only* true of them: the ground they stand on and the doorsteps
  // they needed.
  const buildings = [...built.built, ...context.buildings];

  return {
    grid,
    buildings,
    emit,
    fluids,
    lightCount,
    buildingCount: buildings.length,
    props: props.grid.exhibits,
    placedProps: [...props.placed, ...context.props],
    propCount: props.placed.length + context.props.length,
    pondColumns: props.pondColumns + context.pondColumns,
    contextResult: context,
    blocks: structures,
    bridgeStyles,
    harbourChain,
    waterWorks,
  };
}
