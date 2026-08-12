/**
 * Dev-world exhibit rows for `prop.place@0`.
 *
 * The dev world's argument applies to props exactly as it does to buildings:
 * a defect in a cart is found by looking at a cart, and looking at a cart in a
 * compiled village means finding the one cart, in the one lane, that the
 * layout happened to put it in. So the props get the same treatment — a grid
 * on a flat, lit, pinned stage, one row per family, one column per variant.
 *
 * Two things make the prop grid different from the building grid:
 *
 * - **water**. Three props (both boats and the pier) only exist over water, so
 *   the harbour row carries its own pond: a rectangular basin dug into the
 *   plain and filled to one below the grass. The basin is a plain box, so its
 *   water is stable by the same argument the plaza well is;
 * - **yaw**. Every row's last two cells are the same prop at 90° and 180°,
 *   because rotation is where a hand-written op list goes wrong — an axis that
 *   did not swap, a stair facing the wrong way — and the only way to see that
 *   is side by side with the unrotated one.
 *
 * This file owns *rows*, not the dev world: it exports a plan and a builder,
 * and `devworld.ts` (which no parallel track may edit) reads them through the
 * `devworld-rows.ts` seam. Nothing here writes a world of its own.
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
import { FluidKind, type ColumnPlan } from "../terrain/columns.js";
import { buildProps, type PropJob, type PropPassResult } from "../structures/props.js";
import { AMUSEMENT_PROP_EXHIBIT_PLAN } from "./amusement.js";
import { BLITZ_PROP_EXHIBIT_PLAN } from "./blitz.js";
import { ENERGY_PROP_EXHIBIT_PLAN } from "./energy-props.js";
import { STREET_PROP_EXHIBIT_PLAN } from "./street-props.js";
import { RELIC_PROP_EXHIBIT_PLAN } from "./relic-props.js";
import { SPECTACLE_PROP_EXHIBIT_PLAN } from "./spectacle-props.js";
import { WAYSIDE_PROP_EXHIBIT_PLAN } from "./wayside-props.js";
// The classical pack's props ship with their stdlib halves; the `_A_` infix
// exists because two star-exported plans of one name would be ambiguous.
import { CLASSICAL_A_PROP_EXHIBIT_PLAN } from "@terrainist/stdlib";

/** Blocks of clear ground between two prop exhibits, in both axes. */
export const PROP_EXHIBIT_GAP = 8;

/** Depth of the harbour row's basin below the plain, in blocks. */
export const PROP_POND_DEPTH = 4;

/** One prop exhibit: what it is, and where in its row it sits. */
export interface PropExhibit {
  readonly id: string;
  /** Row label — the family, e.g. `"harbour"`. */
  readonly row: string;
  readonly column: number;
  readonly prop: PropName;
  /** Generator params, including the yaw the cell is showing. */
  readonly params: Readonly<Record<string, unknown>>;
  readonly theme: string;
  /** Unrotated extents the row was laid out against. */
  readonly size: readonly [number, number, number];
  /** North-west corner of the cell, in world columns. */
  readonly x: number;
  readonly z: number;
}

/** One row of the prop grid. */
export interface PropExhibitRow {
  readonly row: string;
  /** True when the row's cells stand over water and need the basin dug. */
  readonly water: boolean;
  readonly cells: readonly PropExhibit[];
  /** The row's water basin, when it has one. */
  readonly pond?: Rect;
}

/** The whole prop grid. */
export interface PropExhibitGrid {
  readonly rows: readonly PropExhibitRow[];
  readonly exhibits: readonly PropExhibit[];
  /** Total depth the grid occupies, from `z0` south. */
  readonly depth: number;
  /** Easternmost column any cell reaches. */
  readonly width: number;
}

/** The themes the prop grid walks through, one per column. */
export const PROP_EXHIBIT_THEMES = ["temperate_timber", "boreal_pine", "birchwood_downs"] as const;

/**
 * The rows, in grid order.
 *
 * Every prop in the catalog appears at least once, at yaw 0, and every family
 * gets its rotations. The params are the interesting corners of each
 * generator: a short and a long pier, a graded and a curved rail line.
 */
export const PROP_EXHIBIT_PLAN: readonly {
  readonly row: string;
  readonly water: boolean;
  readonly cells: readonly { readonly prop: PropName; readonly params: Record<string, unknown> }[];
}[] = Object.freeze([
  {
    row: "harbour",
    water: true,
    cells: [
      { prop: "pier", params: { length: 8, width: 2, yaw: 0 } },
      { prop: "pier", params: { length: 12, width: 3, yaw: 0 } },
      { prop: "rowboat", params: { yaw: 0 } },
      { prop: "rowboat", params: { yaw: 90 } },
      { prop: "fishing_sloop", params: { yaw: 0 } },
      { prop: "fishing_sloop", params: { yaw: 90 } },
      { prop: "fishing_sloop", params: { yaw: 180 } },
    ],
  },
  {
    row: "vehicles",
    water: false,
    cells: [
      { prop: "cart", params: { yaw: 0 } },
      { prop: "cart", params: { yaw: 90 } },
      { prop: "cart", params: { yaw: 180 } },
      { prop: "covered_wagon", params: { yaw: 0 } },
      { prop: "covered_wagon", params: { yaw: 90 } },
      { prop: "covered_wagon", params: { yaw: 270 } },
    ],
  },
  {
    row: "rails",
    water: false,
    cells: [
      { prop: "rail_line", params: { length: 12, yaw: 0 } },
      { prop: "rail_line", params: { length: 14, curve: true, yaw: 0 } },
      { prop: "rail_line", params: { length: 14, grade: 3, yaw: 0 } },
      { prop: "rail_line", params: { length: 12, platform: false, yaw: 90 } },
    ],
  },
  {
    row: "civic",
    water: false,
    cells: [
      { prop: "fountain", params: { yaw: 0 } },
      { prop: "gazebo", params: { yaw: 0 } },
      { prop: "gazebo", params: { yaw: 90 } },
      { prop: "statue_plinth", params: { yaw: 0 } },
      { prop: "statue_plinth", params: { yaw: 180 } },
    ],
  },
  ...BLITZ_PROP_EXHIBIT_PLAN,
  ...STREET_PROP_EXHIBIT_PLAN,
  ...ENERGY_PROP_EXHIBIT_PLAN,
  ...AMUSEMENT_PROP_EXHIBIT_PLAN,
  ...WAYSIDE_PROP_EXHIBIT_PLAN,
  ...RELIC_PROP_EXHIBIT_PLAN,
  // Wave 6D's five dry-ground props. Its sixth, the houseboat, is a hull and
  // shows in the **vehicle** grid with the rest of the fleet — that grid is
  // where the water is.
  ...SPECTACLE_PROP_EXHIBIT_PLAN,
  ...CLASSICAL_A_PROP_EXHIBIT_PLAN,
  // The classical pack's other half ships no plan of its own; the rows live
  // here. The colonnade shows its length dial; the herm repeats because
  // saturation is its whole job.
  {
    row: "classical_court",
    water: false,
    cells: [
      { prop: "agora_colonnade", params: {} },
      { prop: "agora_colonnade", params: { length: 23 } },
      { prop: "triumphal_arch", params: {} },
      { prop: "rostra", params: {} },
      { prop: "herm_post", params: {} },
      { prop: "herm_post", params: {} },
      { prop: "votive_column", params: {} },
      { prop: "column_drums", params: {} },
      { prop: "pithos_store", params: {} },
    ],
  },
  // The trireme is `base: "water"`; the basin row is what seats it.
  {
    row: "classical_harbour",
    water: true,
    cells: [{ prop: "trireme", params: {} }],
  },
]);

/**
 * Lay the prop grid out south of `z0`, starting at `x0`.
 *
 * The caller decides where: in the dev world it is under the building grid, in
 * a test it is at the origin. Cells are placed on their **rotated** extents so
 * a yaw-90 rail line does not run into its neighbour, and every cell's site is
 * an exact rectangle the placer is then given as its `at` target — the grid is
 * a fixture, so nothing here is allowed to wander.
 */
export function planPropExhibits(x0 = 0, z0 = 0): PropExhibitGrid {
  const rows: PropExhibitRow[] = [];
  const exhibits: PropExhibit[] = [];
  let z = z0;
  let width = 0;

  for (const row of PROP_EXHIBIT_PLAN) {
    const sizes = row.cells.map((c) => propFootprint(c.prop, c.params));
    const depth = Math.max(
      ...row.cells.map((c, i) => {
        const yaw = (c.params["yaw"] ?? 0) as StructureYaw;
        const size = (sizes[i] as { size: readonly [number, number, number] }).size;
        return yaw === 90 || yaw === 270 ? size[0] : size[2];
      }),
    );
    let x = x0;
    const cells: PropExhibit[] = [];
    for (const [column, cell] of row.cells.entries()) {
      const yaw = (cell.params["yaw"] ?? 0) as StructureYaw;
      const size = (sizes[column] as { size: readonly [number, number, number] }).size;
      const w = yaw === 90 || yaw === 270 ? size[2] : size[0];
      const exhibit: PropExhibit = {
        id: `${cell.prop}_${column}`,
        row: row.row,
        column,
        prop: cell.prop,
        params: cell.params,
        theme: PROP_EXHIBIT_THEMES[column % PROP_EXHIBIT_THEMES.length] as string,
        size,
        x,
        z,
      };
      cells.push(exhibit);
      exhibits.push(exhibit);
      x += w + PROP_EXHIBIT_GAP;
    }
    width = Math.max(width, x - PROP_EXHIBIT_GAP);
    rows.push({
      row: row.row,
      water: row.water,
      cells,
      // The basin runs the whole row with a margin, so a boat placed anywhere
      // in it has open water on every side.
      ...(row.water
        ? {
            pond: {
              x0: x0 - 2,
              z0: z - 2,
              x1: x - PROP_EXHIBIT_GAP + 2,
              z1: z + depth + 2,
            },
          }
        : {}),
    });
    z += depth + PROP_EXHIBIT_GAP;
  }

  return { rows, exhibits, depth: z - PROP_EXHIBIT_GAP - z0, width: width - x0 };
}

/**
 * Dig and flood a row's basin in the column plan.
 *
 * A rectangular box: floor `PROP_POND_DEPTH` below the plain, water to one
 * below the surrounding grass. Every column of the box has the same surface
 * level and its neighbours outside are a block higher, so
 * `checkFluidStability`'s "lowest neighbouring surface" is never below the
 * water — the pond is stable for the same reason the plaza well is.
 */
export function digPropPond(plan: ColumnPlan, pond: Rect, stack: PrismarineStack): number {
  const { region } = plan;
  const sand = stack.blockByName("sand")?.stateId ?? 0;
  const gravel = stack.blockByName("gravel")?.stateId ?? 0;
  let columns = 0;
  for (let z = pond.z0; z <= pond.z1; z++) {
    const j = z - region.z0;
    if (j < 0 || j >= region.depth) continue;
    for (let x = pond.x0; x <= pond.x1; x++) {
      const i = x - region.x0;
      if (i < 0 || i >= region.width) continue;
      const idx = j * region.width + i;
      const surface = plan.ground[idx] as number;
      const floor = surface - PROP_POND_DEPTH;
      plan.ground[idx] = floor;
      plan.fluidTop[idx] = surface - 1;
      plan.fluidKind[idx] = FluidKind.WATER;
      plan.surface[idx] = (x + z) % 3 === 0 ? gravel : sand;
      plan.subsurface[idx] = sand;
      plan.lakeMask[idx] = 1;
      columns++;
    }
  }
  return columns;
}

/** What {@link buildPropExhibits} produced. */
export interface PropExhibitResult extends PropPassResult {
  readonly grid: PropExhibitGrid;
  /** Pond columns dug across every water row. */
  readonly pondColumns: number;
}

/**
 * Dig the ponds and build every exhibit into a column plan.
 *
 * The plan is **mutated** (the ponds), which is why this takes one rather than
 * making one: the dev world builds one flat plain and every exhibit family
 * writes into it, and a pond is a change to the ground.
 */
export function buildPropExhibits(
  plan: ColumnPlan,
  stack: PrismarineStack,
  worldSeed: bigint,
  x0 = 0,
  z0 = 0,
  /**
   * Build every cell in this theme instead of the one its column names.
   *
   * The theme × prop sweep's one hook: it needs the whole grid in one palette,
   * and it must reach the palette the way a document does — through
   * `pickTheme`'s override — rather than through a path of its own. Omitted
   * everywhere else, so the dev world's per-column themes are untouched.
   */
  themeOverride?: string,
): PropExhibitResult {
  const grid = planPropExhibits(x0, z0);
  let pondColumns = 0;
  for (const row of grid.rows) {
    if (row.pond !== undefined) pondColumns += digPropPond(plan, row.pond, stack);
  }

  const jobs: PropJob[] = grid.exhibits.map((e) => {
    const nodePath = `dev.props.${e.row}.${e.id}`;
    const seed = nodeSeed(worldSeed, nodePath, "");
    const theme = pickTheme(seed, themeOverride ?? e.theme);
    const materials = assignMaterials(theme, 1, seed)[0] as BuildingMaterials;
    return {
      nodePath,
      prop: e.prop,
      // The cell's north-west corner is the target; the placer still has to
      // find water or flat ground there, which is the part being exhibited.
      params: { ...e.params, at: { x: e.x, z: e.z } },
      seed,
      materials,
    };
  });

  const pass = buildProps({ jobs, plan, stack });
  return { ...pass, grid, pondColumns };
}
