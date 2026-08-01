/**
 * The theme × archetype sweep — the cross-product nobody was testing.
 *
 * ## Why this exists
 *
 * A theme is only as tested as the archetypes that happen to have used it. Two
 * bugs of exactly that shape have shipped:
 *
 * 1. a theme (and, it turned out, two archetype fit-outs) named
 *    `smooth_stone_stairs`, which **does not exist** in the pinned emit version
 *    — silent until something built with it;
 * 2. `modern_city` mapped the `fence` role to `iron_bars`, and the grammar
 *    treats that role as *a post you can stand something on*. The first
 *    settlement built in it produced 489 `unsupported.chain` findings, because
 *    the theme had only ever been exercised by the high-rise exhibit row.
 *
 * With every theme in `ALL_MATERIAL_THEMES` against every implemented
 * archetype and prop, the untested cross-product is in the thousands, and each
 * cell is a latent bug that surfaces the first time an author picks it.
 *
 * ## What this module is
 *
 * The *plan and the build*; the claims live in `test/theme-sweep.test.ts`.
 * Nothing here is new worldgen: the representative envelope for every
 * archetype and prop is read off the **dev-world exhibit registry**, so a row
 * added there is swept without a line of this file, and the world it builds is
 * the dev world's flat plain, its building pass and its prop pass — the same
 * artefact the physics lint already knows how to read.
 *
 * Deterministic throughout: one fixed world seed, node paths derived from the
 * theme and the cell id, and a shelf packing that is a pure function of the
 * cell list.
 */

import path from "node:path";

import {
  ALL_MATERIAL_THEMES,
  BUILDING_ARCHETYPES,
  PROP_GENERATORS,
  assignMaterials,
  generateBuilding,
  nodeSeed,
  pickTheme,
  styleOf,
  type BuildingArchetype,
  type BuildingMaterials,
  type MaterialTheme,
  type Region,
} from "@terrainist/stdlib";
import type { PortDeclaration } from "@terrainist/spec";

import { EMIT_MINECRAFT_VERSION, loadPrismarine } from "./emit/index.js";
import type { PrismarineStack } from "./emit/prismarine.js";
import { emitTerrain, type TerrainEmitSummary } from "./terrain/emit.js";
import type { ColumnPlan } from "./terrain/columns.js";
import {
  buildBuildings,
  type BuildingJob,
  type BuiltBuilding,
  type StructureBlock,
} from "./structures/buildings.js";
import type { PlacedProp } from "./structures/props.js";
import {
  DEV_GROUND_Y,
  devColumnPlan,
  exhibitParams,
  planDevGrid,
  type DevExhibit,
} from "./devworld.js";
import {
  buildPropExhibits,
  buildVehicleExhibits,
  planPropExhibits,
  planVehicleExhibits,
  type PropExhibit,
} from "./devworld-rows.js";
import type { VehicleExhibit } from "./exhibits/vehicles.js";

/** The sweep's own world seed. Fixed, so a sweep world is reproducible. */
export const SWEEP_SEED = 20260801n;

/** Gap between packed cells, in blocks. Two aprons plus clearance. */
export const SWEEP_GAP = 10;

/** Margin of plain around the packed grid. */
export const SWEEP_MARGIN = 12;

/** How wide the packing runs before it starts a new shelf. */
export const SWEEP_SHELF_WIDTH = 480;

/** The door port every swept building declares — south, as the dev world's. */
const SWEEP_PORTS: Readonly<Record<string, PortDeclaration>> = Object.freeze({
  door: { type: "door", face: "south", tags: ["primary"] } as PortDeclaration,
});

/* -------------------------------------------------------------------------- */
/* what gets swept                                                             */
/* -------------------------------------------------------------------------- */

/**
 * One representative exhibit per archetype: the **largest** envelope the
 * dev-world grid gives it, first in grid order on a tie.
 *
 * Largest rather than smallest on purpose. A big envelope runs more of the
 * fit-out — more furniture, more storeys' worth of lights, an actual cellar —
 * and every one of those is a place a theme's roles get used.
 */
export function sweepBuildingCells(): readonly DevExhibit[] {
  const best = new Map<string, { readonly e: DevExhibit; readonly v: number }>();
  for (const e of planDevGrid().exhibits) {
    const v = e.size[0] * e.size[1] * e.size[2];
    const cur = best.get(e.archetype);
    if (cur === undefined || v > cur.v) best.set(e.archetype, { e, v });
  }
  // Registry order, not map order: the sweep's cell list should read like
  // `BUILDING_ARCHETYPES`, and a missing archetype is the catalog test's
  // business, not a silent hole here.
  const out: DevExhibit[] = [];
  for (const a of BUILDING_ARCHETYPES) {
    const hit = best.get(a);
    if (hit !== undefined) out.push(hit.e);
  }
  return out;
}

/** Archetypes the dev-world grid has no cell for — the sweep's blind spot. */
export function unsweptArchetypes(): readonly BuildingArchetype[] {
  const seen = new Set(sweepBuildingCells().map((e) => e.archetype));
  return BUILDING_ARCHETYPES.filter((a) => !seen.has(a));
}

/** One representative exhibit per prop, across the prop and vehicle grids. */
export function sweepPropCells(): readonly (PropExhibit | VehicleExhibit)[] {
  const best = new Map<string, PropExhibit | VehicleExhibit>();
  for (const e of [...planPropExhibits().exhibits, ...planVehicleExhibits().exhibits]) {
    if (!best.has(e.prop)) best.set(e.prop, e);
  }
  const out: (PropExhibit | VehicleExhibit)[] = [];
  for (const name of Object.keys(PROP_GENERATORS)) {
    const hit = best.get(name);
    if (hit !== undefined) out.push(hit);
  }
  return out;
}

/** Props no exhibit grid carries — the sweep's blind spot on the prop side. */
export function unsweptProps(): readonly string[] {
  const seen = new Set<string>(sweepPropCells().map((e) => e.prop));
  return Object.keys(PROP_GENERATORS).filter((p) => !seen.has(p));
}

/**
 * One archetype per exhibit family, in registry order.
 *
 * The family is the exhibit row's prefix (`faith_cathedral` → `faith`), which
 * is how the grid already groups the catalog — one wave of archetypes per
 * file, one row prefix per file. This is the *breadth* half of the default
 * subset: it keeps every generator module in the fast gate.
 */
export function sweepFamilyCells(): readonly DevExhibit[] {
  const seen = new Set<string>();
  const out: DevExhibit[] = [];
  for (const e of sweepBuildingCells()) {
    const family = e.row.includes("_") ? (e.row.split("_")[0] as string) : e.row;
    if (seen.has(family)) continue;
    seen.add(family);
    out.push(e);
  }
  return out;
}

/**
 * The **default** physics subset: one archetype per family, plus the heaviest
 * users of every style role. Breadth and depth, in registry order.
 */
export function sweepDefaultCells(): readonly DevExhibit[] {
  const wanted = new Set<string>([
    ...sweepFamilyCells().map((e) => e.id),
    ...sweepRoleCells().map((e) => e.id),
  ]);
  return sweepBuildingCells().filter((e) => wanted.has(e.id));
}

/**
 * How many archetypes each style role is guaranteed in the default subset.
 *
 * Two, not one: the bug this whole file exists for was a role (`fence`) that
 * *resolved* everywhere and *carried* nothing, and whether that shows up
 * depends on what a given archetype happens to stand on it.
 */
export const SWEEP_ROLE_DEPTH = 2;

/** Memo for {@link sweepRoleCells} — one baseline generation pass per process. */
let roleCellMemo: readonly DevExhibit[] | undefined;

/**
 * The archetypes that use each style role hardest, in the baseline theme.
 *
 * The family representatives alone are not enough, and that was measured, not
 * assumed: with `modern_city`'s `fence` role put back to `iron_bars`, the
 * family-representative world linted **clean** while the whole cross-product
 * found 820 `unsupported.chain` — none of the twenty-six representatives
 * happened to stand a potted plant on a fence. So the default subset is chosen
 * by *role usage* instead: for every symbol in `styleOf`, the archetypes that
 * emit that role's block the most times, which is where a role that cannot do
 * its job will show.
 *
 * Deterministic: a fixed theme, a fixed seed per cell, and ties broken by
 * registry order.
 */
export function sweepRoleCells(): readonly DevExhibit[] {
  if (roleCellMemo !== undefined) return roleCellMemo;
  const baseline = ALL_MATERIAL_THEMES[0] as MaterialTheme;
  const cells = sweepBuildingCells();
  /** role block id → cell index → how many ops of it that cell emits. */
  const usage = new Map<string, Map<number, number>>();
  cells.forEach((cell, index) => {
    const nodePath = `sweep.${baseline.id}.${cell.row}.${cell.id}`;
    const seed = nodeSeed(SWEEP_SEED, nodePath, "");
    const materials = assignMaterials(pickTheme(seed, baseline.id), 1, seed)[0] as BuildingMaterials;
    const style = styleOf(materials);
    const wanted = new Map<string, string>();
    for (const [role, block] of Object.entries(style)) wanted.set(block, role);
    const result = generateBuilding({
      size: cell.size,
      params: exhibitParams(cell),
      seed,
      materials,
    });
    for (const op of result.ops) {
      const role = wanted.get(op.block);
      if (role === undefined) continue;
      let byCell = usage.get(role);
      if (byCell === undefined) {
        byCell = new Map<number, number>();
        usage.set(role, byCell);
      }
      byCell.set(index, (byCell.get(index) ?? 0) + 1);
    }
  });

  const chosen = new Set<number>();
  // A fixed role order — the keys of `styleOf`, which is itself a literal.
  for (const role of Object.keys(styleOf(
    assignMaterials(baseline, 1, nodeSeed(SWEEP_SEED, "sweep.roles", ""))[0] as BuildingMaterials,
  ))) {
    const byCell = usage.get(role);
    if (byCell === undefined) continue;
    const ranked = [...byCell.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
    for (const [index] of ranked.slice(0, SWEEP_ROLE_DEPTH)) chosen.add(index);
  }
  roleCellMemo = cells.filter((_, i) => chosen.has(i));
  return roleCellMemo;
}

/* -------------------------------------------------------------------------- */
/* packing                                                                     */
/* -------------------------------------------------------------------------- */

/** One packed cell: an exhibit and the north-west corner it was given. */
export interface SweepSlot {
  readonly exhibit: DevExhibit;
  readonly x: number;
  readonly z: number;
}

/** Where the packed grid ends up, and how big the world has to be. */
export interface SweepPacking {
  readonly slots: readonly SweepSlot[];
  readonly width: number;
  readonly depth: number;
}

/**
 * Shelf-pack the cells west to east, wrapping at {@link SWEEP_SHELF_WIDTH}.
 *
 * A pure function of the cell list: same cells, same coordinates, forever.
 */
export function packSweep(cells: readonly DevExhibit[]): SweepPacking {
  const slots: SweepSlot[] = [];
  let x = 0;
  let z = 0;
  let shelfDepth = 0;
  let width = 0;
  for (const e of cells) {
    const w = e.size[0] as number;
    const d = e.size[2] as number;
    if (x > 0 && x + w > SWEEP_SHELF_WIDTH) {
      z += shelfDepth + SWEEP_GAP;
      x = 0;
      shelfDepth = 0;
    }
    slots.push({ exhibit: e, x, z });
    x += w + SWEEP_GAP;
    if (d > shelfDepth) shelfDepth = d;
    if (x - SWEEP_GAP > width) width = x - SWEEP_GAP;
  }
  return { slots, width, depth: z + shelfDepth };
}

/* -------------------------------------------------------------------------- */
/* the world                                                                   */
/* -------------------------------------------------------------------------- */

export interface SweepWorldOptions {
  /** Directory the world is written under. */
  readonly outDir: string;
  /** The theme every cell is built in — a name from `ALL_MATERIAL_THEMES`. */
  readonly theme: string;
  /** The cells to build. Defaults to {@link sweepDefaultCells}. */
  readonly cells?: readonly DevExhibit[];
  /**
   * Also build every prop and vehicle exhibit, in the same theme.
   *
   * Off by default: the prop grids dig ponds and add a third of the world's
   * area, and the fast gate does not need them.
   */
  readonly props?: boolean;
}

export interface SweepWorldResult {
  readonly worldDir: string;
  readonly theme: string;
  readonly packing: SweepPacking;
  readonly buildings: readonly BuiltBuilding[];
  readonly props: readonly PlacedProp[];
  readonly blocks: readonly StructureBlock[];
  readonly emit: TerrainEmitSummary;
}

/**
 * Build one sweep world: every given cell, all in one theme, on the flat plain.
 *
 * The theme is an **override**, passed to `pickTheme` exactly as a document's
 * `theme:` would be, so what is being swept is the same code path an author
 * reaches — not a private one.
 */
export async function buildSweepWorld(opts: SweepWorldOptions): Promise<SweepWorldResult> {
  const stack: PrismarineStack = loadPrismarine(EMIT_MINECRAFT_VERSION);
  const cells = opts.cells ?? sweepDefaultCells();
  const packing = packSweep(cells);

  // Props go south of the buildings, on their own grids, and only when asked.
  const propOrigin = { x: 0, z: packing.depth + SWEEP_GAP };
  const propGrid = opts.props === true ? planPropExhibits(propOrigin.x, propOrigin.z) : undefined;
  const vehicleOrigin = {
    x: 0,
    z: propOrigin.z + (propGrid === undefined ? 0 : propGrid.depth + SWEEP_GAP),
  };
  const vehicleGrid =
    opts.props === true ? planVehicleExhibits(vehicleOrigin.x, vehicleOrigin.z) : undefined;

  const width = Math.max(packing.width, propGrid?.width ?? 0, vehicleGrid?.width ?? 0);
  const depth =
    vehicleGrid === undefined
      ? packing.depth
      : vehicleOrigin.z + vehicleGrid.depth;

  const region: Region = {
    x0: -SWEEP_MARGIN,
    z0: -SWEEP_MARGIN,
    width: width + SWEEP_MARGIN * 2,
    depth: depth + SWEEP_MARGIN * 2,
  };
  const plan: ColumnPlan = devColumnPlan(region, stack);

  const jobs: BuildingJob[] = packing.slots.map(({ exhibit, x, z }) => {
    const nodePath = `sweep.${opts.theme}.${exhibit.row}.${exhibit.id}`;
    const seed = nodeSeed(SWEEP_SEED, nodePath, "");
    const theme = pickTheme(seed, opts.theme);
    const materials = assignMaterials(theme, 1, seed)[0] as BuildingMaterials;
    return {
      nodePath,
      placement: {
        nodePath,
        id: exhibit.id,
        translation: [x, DEV_GROUND_Y, z] as [number, number, number],
        yaw: 0,
        mirror: false,
        size: exhibit.size,
        footprint: {
          x0: x,
          z0: z,
          x1: x + (exhibit.size[0] as number) - 1,
          z1: z + (exhibit.size[2] as number) - 1,
        },
        anchor: { x: x + (((exhibit.size[0] as number) - 1) >> 1), z: z + (((exhibit.size[2] as number) - 1) >> 1) },
        foundationY: DEV_GROUND_Y,
      },
      size: exhibit.size,
      params: exhibitParams(exhibit),
      ports: SWEEP_PORTS,
      seed,
      tags: [exhibit.archetype],
      materials,
    };
  });

  const built = buildBuildings(jobs, plan, stack);

  const propBlocks: StructureBlock[] = [];
  const placed: PlacedProp[] = [];
  if (opts.props === true) {
    const p = buildPropExhibits(plan, stack, SWEEP_SEED, propOrigin.x, propOrigin.z, opts.theme);
    propBlocks.push(...p.blocks);
    placed.push(...p.placed);
    const v = buildVehicleExhibits(
      plan,
      stack,
      SWEEP_SEED,
      vehicleOrigin.x,
      vehicleOrigin.z,
      opts.theme,
    );
    propBlocks.push(...v.blocks);
    placed.push(...v.placed);
  }

  const structures = [...built.blocks, ...propBlocks];
  const worldName = `sweep_${opts.theme}`;
  const emit = await emitTerrain({
    plan,
    trees: [],
    structures,
    stack,
    worldDir: path.join(path.resolve(opts.outDir), worldName),
    levelName: worldName,
    spawn: { x: region.x0 + 4, y: DEV_GROUND_Y + 1, z: region.z0 + 4 },
  });

  return {
    worldDir: emit.worldDir,
    theme: opts.theme,
    packing,
    buildings: built.built,
    props: placed,
    blocks: structures,
    emit,
  };
}
