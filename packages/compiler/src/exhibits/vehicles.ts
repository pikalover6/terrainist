/**
 * Dev-world exhibit rows for the transport-air and transport-water props.
 *
 * The prop grid in `exhibits/props.ts` proved the argument: a defect in a cart
 * is found by looking at a cart, and looking at a cart in a compiled village
 * means finding the one cart in the one lane. It applies to an airliner with
 * more force, not less — a 52 × 35 aeroplane is a thing you have to walk
 * around, and the chance that a village happens to contain one at a yaw that
 * shows the tail is nil.
 *
 * This is that grid for the vehicles, in its own file for the reason
 * `devworld-rows.ts` gives: a shared exhibit file is a merge conflict per
 * track. Two things differ from the prop grid:
 *
 * - the **basins are bigger**. A galleon needs 46 × 13 of open water at one
 *   surface level with two blocks under it, and the placer refuses anything
 *   less; the fleet row therefore digs a harbour rather than a pond;
 * - the **rows are sparser**. One craft per cell and one rotation per family:
 *   at these sizes a row of four airliners is a kilometre of dev world, and
 *   the rotation cases that matter are the ones with an asymmetric fitting
 *   (the airliner's airstair, the trawler's booms).
 */

import {
  nodeSeed,
  pickTheme,
  assignMaterials,
  propFootprint,
  type BuildingMaterials,
  type PropName,
  type StructureYaw,
} from "@terrainist/stdlib";

import type { PrismarineStack } from "../emit/prismarine.js";
import type { Rect } from "../layout/frames.js";
import type { ColumnPlan } from "../terrain/columns.js";
import { buildProps, type PropJob, type PropPassResult } from "../structures/props.js";

import { digPropPond } from "./props.js";

/** Blocks of clear ground between two vehicle exhibits, in both axes. */
export const VEHICLE_EXHIBIT_GAP = 10;

/** Margin of open water round a floating craft's cell, in blocks. */
export const VEHICLE_POND_MARGIN = 3;

/** The themes the vehicle grid walks through, one per column. */
export const VEHICLE_EXHIBIT_THEMES = [
  "temperate_timber",
  "boreal_pine",
  "birchwood_downs",
] as const;

/** One vehicle exhibit: what it is, and where in its row it sits. */
export interface VehicleExhibit {
  readonly id: string;
  readonly row: string;
  readonly column: number;
  readonly prop: PropName;
  readonly params: Readonly<Record<string, unknown>>;
  readonly theme: string;
  /** Unrotated extents the row was laid out against. */
  readonly size: readonly [number, number, number];
  readonly x: number;
  readonly z: number;
}

/** One row of the vehicle grid. */
export interface VehicleExhibitRow {
  readonly row: string;
  /** True when the row's craft float and the row needs a harbour dug. */
  readonly water: boolean;
  readonly cells: readonly VehicleExhibit[];
  readonly pond?: Rect;
}

/** The whole vehicle grid. */
export interface VehicleExhibitGrid {
  readonly rows: readonly VehicleExhibitRow[];
  readonly exhibits: readonly VehicleExhibit[];
  readonly depth: number;
  readonly width: number;
}

/**
 * The rows, in grid order.
 *
 * Every prop the two transport files build appears at least once at yaw 0, and
 * the four whose asymmetry is the thing most likely to be wrong under rotation
 * appear again turned.
 */
export const VEHICLE_EXHIBIT_PLAN: readonly {
  readonly row: string;
  readonly water: boolean;
  readonly cells: readonly { readonly prop: PropName; readonly params: Record<string, unknown> }[];
}[] = Object.freeze([
  {
    row: "airliners",
    water: false,
    cells: [
      { prop: "airliner", params: { yaw: 0 } },
      { prop: "airliner", params: { yaw: 90 } },
      { prop: "cargo_plane", params: { yaw: 0 } },
    ],
  },
  {
    row: "light aircraft",
    water: false,
    cells: [
      { prop: "biplane", params: { yaw: 0 } },
      { prop: "biplane", params: { yaw: 90 } },
      { prop: "light_plane", params: { yaw: 0 } },
      { prop: "light_plane", params: { yaw: 180 } },
    ],
  },
  {
    row: "airfield",
    water: false,
    cells: [
      { prop: "airship", params: { yaw: 0 } },
      { prop: "zeppelin_mast", params: { yaw: 0 } },
      { prop: "hangar", params: { yaw: 0 } },
      { prop: "hangar", params: { yaw: 180 } },
      { prop: "runway", params: { length: 32, yaw: 0 } },
      { prop: "runway", params: { length: 16, yaw: 90 } },
    ],
  },
  {
    row: "tall ships",
    water: true,
    cells: [
      { prop: "galleon", params: { yaw: 0 } },
      { prop: "caravel", params: { yaw: 0 } },
      { prop: "cog", params: { yaw: 90 } },
      { prop: "longship", params: { yaw: 0 } },
    ],
  },
  {
    row: "working boats",
    water: true,
    cells: [
      { prop: "ferry", params: { yaw: 0 } },
      { prop: "fishing_trawler", params: { yaw: 0 } },
      { prop: "fishing_trawler", params: { yaw: 90 } },
      { prop: "tugboat", params: { yaw: 0 } },
      { prop: "yacht", params: { yaw: 0 } },
      { prop: "speedboat", params: { yaw: 0 } },
      { prop: "buoy", params: { yaw: 0 } },
    ],
  },
  {
    // Wave 6's rolling stock. An ordinary **land** row: every craft in
    // `railcraft.ts` carries its own ballast bed and rail, so a train needs no
    // pad concept the grid did not already have — the row is `water: false`
    // like the airfield, and the track arrives with the vehicle.
    row: "rolling stock",
    water: false,
    cells: [
      { prop: "locomotive", params: { yaw: 0 } },
      { prop: "locomotive", params: { yaw: 90 } },
      { prop: "passenger_car", params: { yaw: 0 } },
      { prop: "freight_car", params: { yaw: 0 } },
      { prop: "caboose", params: { yaw: 180 } },
    ],
  },
  {
    row: "sport aircraft",
    water: false,
    cells: [
      { prop: "hot_air_balloon", params: { yaw: 0 } },
      { prop: "seaplane", params: { yaw: 0 } },
      { prop: "seaplane", params: { yaw: 90 } },
      { prop: "glider", params: { yaw: 0 } },
    ],
  },
  {
    row: "river craft",
    water: true,
    cells: [
      { prop: "junk", params: { yaw: 0 } },
      { prop: "paddle_steamer", params: { yaw: 0 } },
      { prop: "barge", params: { yaw: 90 } },
      { prop: "gondola", params: { yaw: 0 } },
    ],
  },
  {
    row: "container terminal",
    water: true,
    cells: [
      { prop: "container_ship", params: { yaw: 0 } },
      { prop: "container_ship", params: { yaw: 90 } },
    ],
  },
  {
    // Wave 6D. The houseboat is a hull rather than a building — a dwelling on
    // open water is the watercraft template's question, not the building
    // grammar's — so it shows here, in water, with the rest of the fleet.
    row: "moorings",
    water: true,
    cells: [
      { prop: "houseboat", params: { yaw: 0 } },
      { prop: "houseboat", params: { yaw: 90 } },
      { prop: "houseboat", params: { yaw: 180 } },
    ],
  },
  {
    row: "shipyard",
    water: false,
    cells: [
      { prop: "drydock", params: { length: 34, yaw: 0 } },
      { prop: "drydock", params: { length: 20, yaw: 90 } },
    ],
  },
]);

/** The rotated extents of one cell, `[width, depth]`. */
function cellExtents(
  size: readonly [number, number, number],
  yaw: StructureYaw,
): [number, number] {
  return yaw === 90 || yaw === 270 ? [size[2], size[0]] : [size[0], size[2]];
}

/**
 * Lay the vehicle grid out south of `z0`, starting at `x0`.
 *
 * Same fixture discipline as the prop grid: cells are placed on their
 * **rotated** extents, and each cell's north-west corner is handed to the
 * placer as an exact `at` target, so nothing in the grid wanders between runs.
 */
export function planVehicleExhibits(x0 = 0, z0 = 0): VehicleExhibitGrid {
  const rows: VehicleExhibitRow[] = [];
  const exhibits: VehicleExhibit[] = [];
  let z = z0;
  let width = 0;

  for (const row of VEHICLE_EXHIBIT_PLAN) {
    const sizes = row.cells.map((c) => propFootprint(c.prop, c.params).size);
    const depth = Math.max(
      ...row.cells.map((c, i) =>
        cellExtents(sizes[i] as readonly [number, number, number], (c.params["yaw"] ?? 0) as StructureYaw)[1],
      ),
    );
    let x = x0;
    const cells: VehicleExhibit[] = [];
    for (const [column, cell] of row.cells.entries()) {
      const size = sizes[column] as readonly [number, number, number];
      const [w] = cellExtents(size, (cell.params["yaw"] ?? 0) as StructureYaw);
      const exhibit: VehicleExhibit = {
        id: `${cell.prop}_${column}`,
        row: row.row,
        column,
        prop: cell.prop,
        params: cell.params,
        theme: VEHICLE_EXHIBIT_THEMES[column % VEHICLE_EXHIBIT_THEMES.length] as string,
        size,
        x,
        z,
      };
      cells.push(exhibit);
      exhibits.push(exhibit);
      x += w + VEHICLE_EXHIBIT_GAP;
    }
    width = Math.max(width, x - VEHICLE_EXHIBIT_GAP);
    rows.push({
      row: row.row,
      water: row.water,
      cells,
      ...(row.water
        ? {
            pond: {
              x0: x0 - VEHICLE_POND_MARGIN,
              z0: z - VEHICLE_POND_MARGIN,
              x1: x - VEHICLE_EXHIBIT_GAP + VEHICLE_POND_MARGIN,
              z1: z + depth + VEHICLE_POND_MARGIN,
            },
          }
        : {}),
    });
    z += depth + VEHICLE_EXHIBIT_GAP;
  }

  return { rows, exhibits, depth: z - VEHICLE_EXHIBIT_GAP - z0, width: width - x0 };
}

/** What {@link buildVehicleExhibits} produced. */
export interface VehicleExhibitResult extends PropPassResult {
  readonly grid: VehicleExhibitGrid;
  /** Harbour columns dug across every water row. */
  readonly pondColumns: number;
}

/**
 * Dig the harbours and build every vehicle exhibit into a column plan.
 *
 * The plan is **mutated**, exactly as the prop grid mutates it: a harbour is a
 * change to the ground, and the caller owns the ground.
 */
export function buildVehicleExhibits(
  plan: ColumnPlan,
  stack: PrismarineStack,
  worldSeed: bigint,
  x0 = 0,
  z0 = 0,
  /** Build every cell in this theme instead of its column's — see `props.ts`. */
  themeOverride?: string,
): VehicleExhibitResult {
  const grid = planVehicleExhibits(x0, z0);
  let pondColumns = 0;
  for (const row of grid.rows) {
    if (row.pond !== undefined) pondColumns += digPropPond(plan, row.pond, stack);
  }

  const jobs: PropJob[] = grid.exhibits.map((e) => {
    const nodePath = `dev.vehicles.${e.row.replace(/\s+/g, "_")}.${e.id}`;
    const seed = nodeSeed(worldSeed, nodePath, "");
    const theme = pickTheme(seed, themeOverride ?? e.theme);
    const materials = assignMaterials(theme, 1, seed)[0] as BuildingMaterials;
    return {
      nodePath,
      prop: e.prop,
      params: { ...e.params, at: { x: e.x, z: e.z } },
      seed,
      materials,
    };
  });

  const pass = buildProps({ jobs, plan, stack });
  return { ...pass, grid, pondColumns };
}
