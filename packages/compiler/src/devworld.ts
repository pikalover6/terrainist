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
 * - **No fluids, anywhere.** The fluid-stability validator is therefore
 *   trivially satisfied, and the smoke test asserts that rather than assuming
 *   it — a building that starts placing water is a defect worth catching here.
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

import {
  assignMaterials,
  nodeSeed,
  pickTheme,
  BUILDING_ARCHETYPES,
  MATERIAL_THEMES,
  type BuildingArchetype,
  type BuildingMaterials,
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
  type BuildingJob,
  type BuiltBuilding,
  type StructureBlock,
} from "./structures/buildings.js";

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

/** The themes the grid walks through, in this order. */
export const DEV_THEMES = MATERIAL_THEMES.map((t) => t.id);

/** The roof shapes the grid walks through, in this order. */
export const DEV_ROOFS = ["gable", "hip", "flat"] as const;

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
  /** Every block the grammar emitted, in build order. */
  readonly blocks: readonly StructureBlock[];
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
  const rows: { row: string; cells: Omit<DevExhibit, "x" | "z" | "column" | "row">[] }[] = [];

  for (const archetype of BUILDING_ARCHETYPES) {
    const cells: Omit<DevExhibit, "x" | "z" | "column" | "row">[] = [];
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
  const roofCells: Omit<DevExhibit, "x" | "z" | "column" | "row">[] = [];
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

  const depthTotal = z - DEV_GAP;
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

/** Build and write the dev world into `outDir/dev_world`. */
export async function buildDevWorld(outDir: string): Promise<DevWorldResult> {
  const stack = loadPrismarine(EMIT_MINECRAFT_VERSION);
  const grid = planDevGrid();
  const plan = devColumnPlan(grid.region, stack);
  paintRules(plan, grid, stack);

  const jobs: BuildingJob[] = grid.exhibits.map((e) => {
    const nodePath = `dev.${e.row}.${e.id}`;
    const seed = nodeSeed(DEV_WORLD_SEED, nodePath, "");
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
      params: { floors: e.floors, roof: e.roof, archetype: e.archetype },
      ports: DEV_PORTS,
      seed,
      tags: [e.archetype],
      materials,
    };
  });

  const built = buildBuildings(jobs, plan, stack);

  const emit = await emitTerrain({
    plan,
    trees: [],
    structures: built.blocks,
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
  for (const b of built.blocks) if (lit.has(b.stateId)) lightCount++;

  return {
    grid,
    buildings: built.built,
    emit,
    fluids,
    lightCount,
    buildingCount: built.built.length,
    blocks: built.blocks,
  };
}
