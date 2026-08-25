/**
 * The context section — the dev world's answer to "yes, but on a hill".
 *
 * The grid north of here is flat on purpose: it removes every variable except
 * the one under test, which is what makes two renders diffable by eye. But the
 * flatness is also the grid's blind spot, and it is a large one. A building on
 * a plain never sinks a skirt, never underpins an apron, never builds a
 * doorstep, never meets water, and only ever stands at yaw 0 — so four of the
 * most defect-prone systems in the compiler have, until now, been exercised
 * only by compiling a whole village and hoping the layout solver happened to
 * put a house somewhere interesting.
 *
 * This section fixes that without giving up the fixture property. The ground is
 * **hand-written** — a constant grade, a symmetric ridge, a flat shore with a
 * box basin — so it is the same ground every build, and it is simple enough
 * that you can predict what a correct building on it looks like. What is *not*
 * hand-written is anything above the ground: the pads, the foundation skirts,
 * the apron underpinning, the doorsteps and the props all run through the real
 * pipeline, in the real order, from the same functions a compiled village
 * calls. Hand-placing blocks here would have made the section a picture of what
 * we think the compiler does; feeding synthetic ground to the real machinery
 * makes it a test of what it actually does.
 *
 * Four strips, laid out west to east, each running south:
 *
 * - **`slope`** — a constant {@link SLOPE_RISE}-in-{@link SLOPE_RUN} grade
 *   (≈10°) falling south, with the same cottage at three heights up it. The
 *   door faces downhill, so all three build a doorstep flight, and each pad
 *   cuts into the hill on its north side and fills on its south.
 * - **`ridge`** — two grades back to back with a crest between them, and one
 *   cottage sitting *on* the crest. The pad has to cut the ridge line and fill
 *   both flanks at once, which is the case where a skirt that measured only its
 *   own corner leaves daylight under the middle of a wall.
 * - **`shore`** — flat ground with a settle-safe basin dug into it, a cottage
 *   set back from the waterline and a pier reaching out over the water. The
 *   doorstep pass has to stop at the water rather than walk into it.
 * - **`yaw`** — flat ground, the same cottage at all four yaws. The control:
 *   anything that differs across these four is the rotation, and nothing else.
 *
 * The section owns its own ground, so it is placed south of everything else and
 * `devworld.ts` calls it last.
 */

import {
  assignMaterials,
  nodeSeed,
  pickTheme,
  HeightField,
  applyLevelPad,
  type BuildingArchetype,
  type BuildingMaterials,
} from "@terrainist/stdlib";
import type { PortDeclaration, Yaw } from "@terrainist/spec";

import type { PrismarineStack } from "../emit/prismarine.js";
import type { Rect } from "../layout/frames.js";
import { DEFAULT_BLEND, makePlacement, type Placement, type ResolvedPort } from "../layout/types.js";
import { resolvePorts } from "../layout/ports.js";
import { FluidKind, type ColumnPlan } from "../terrain/columns.js";
import { resolvePalette } from "../terrain/palette.js";
import {
  buildBuildings,
  type BuildingJob,
  type BuiltBuilding,
  type StructureBlock,
} from "../structures/buildings.js";
import { buildDoorsteps, type DoorstepResult } from "../structures/doorsteps.js";
import { buildProps, type PlacedProp, type PropJob } from "../structures/props.js";

import { digPropPond } from "./props.js";
import { exactRoofHeight } from "./breakpoints.js";

/* -------------------------------------------------------------------------- */
/* the shape of the ground                                                     */
/* -------------------------------------------------------------------------- */

/** Rise, in blocks, per {@link SLOPE_RUN} blocks of run. 3 in 17 is 10.0°. */
export const SLOPE_RISE = 3;
/** Run, in blocks, per {@link SLOPE_RISE} blocks of rise. */
export const SLOPE_RUN = 17;

/** Blocks of clear ground between two cells of a strip, and around each strip. */
export const CONTEXT_CELL_GAP = 14;
/** Blocks of clear ground between two strips, west to east. */
export const CONTEXT_STRIP_GAP = 20;
/** Clear ground north and south of a strip's cells, inside its own band. */
export const CONTEXT_STRIP_MARGIN = 12;

/** The cottage every strip repeats — one design, so the ground is the variable. */
export const CONTEXT_ARCHETYPE: BuildingArchetype = "cottage";
/** Its theme. Fixed, for the same reason. */
export const CONTEXT_THEME = "temperate_timber";
/** Its envelope: square, so a yaw does not change the ground it covers. */
export const CONTEXT_SIZE: readonly [number, number, number] = [11, exactRoofHeight(2), 11];

/** The four yaws the `yaw` strip walks, in order. */
export const CONTEXT_YAWS: readonly Yaw[] = Object.freeze([0, 90, 180, 270] as const);

/** How many cottages climb the `slope` strip. */
export const SLOPE_POSITIONS = 3;

/** Land between the shore cottage's south wall and the water, in blocks. */
export const SHORE_SETBACK = 6;

/** The basin's extent, north to south, in blocks. */
export const SHORE_POND_DEPTH = 22;

/** How far the shore strip's pier runs out over the water. */
export const SHORE_PIER_LENGTH = 10;

/* -------------------------------------------------------------------------- */
/* the plan                                                                    */
/* -------------------------------------------------------------------------- */

/** One building in the context section, and the ground it was put on. */
export interface ContextCell {
  readonly id: string;
  /** Strip label — `"slope"`, `"ridge"`, `"shore"`, `"yaw"`. */
  readonly strip: string;
  readonly column: number;
  readonly archetype: BuildingArchetype;
  readonly theme: string;
  readonly roof: string;
  readonly floors: number;
  /** The **unrotated** envelope. */
  readonly size: readonly [number, number, number];
  readonly yaw: Yaw;
  /** North-west corner of the *rotated* footprint, in world columns. */
  readonly x: number;
  readonly z: number;
}

/** How one strip shapes the ground inside its band. */
export type ContextGround =
  | { readonly kind: "flat" }
  /** A constant grade falling south from `crownY` at the band's north edge. */
  | { readonly kind: "slope" }
  /** Two grades meeting at a crest, `crestZ` being the ridge line. */
  | { readonly kind: "ridge"; readonly crestZ: number }
  /** Flat, with a basin dug in `pond`. */
  | { readonly kind: "shore"; readonly pond: Rect };

/** One strip: a band of ground, and the cells standing on it. */
export interface ContextStrip {
  readonly strip: string;
  /** The band this strip owns, inclusive — ground outside it is untouched. */
  readonly band: Rect;
  readonly ground: ContextGround;
  readonly cells: readonly ContextCell[];
  /** Props this strip places — the shore's pier, and nothing else so far. */
  readonly props: readonly {
    readonly id: string;
    readonly prop: string;
    readonly params: Readonly<Record<string, unknown>>;
  }[];
}

/** The whole section. */
export interface ContextSection {
  readonly strips: readonly ContextStrip[];
  readonly cells: readonly ContextCell[];
  /** Easternmost column any strip reaches, relative to `x0`. */
  readonly width: number;
  /** Total depth the section occupies, from `z0` south. */
  readonly depth: number;
}

/** Centre a cell's envelope in a band of width `bandWidth`. */
function centred(x0: number, bandWidth: number, size: number): number {
  return x0 + ((bandWidth - size) >> 1);
}

/**
 * Lay the context section out south of `z0`, starting at `x0`.
 *
 * Every strip gets a band wide enough for its cottage plus a margin on each
 * side, because the pad's apron ({@link DEFAULT_BLEND}) and the apron
 * underpinning both reach outside the footprint and two strips whose ground
 * edits overlapped would be an exhibit of the overlap rather than of either
 * strip.
 */
export function planContextSection(x0 = 0, z0 = 0): ContextSection {
  const [sizeX, , sizeZ] = CONTEXT_SIZE;
  const bandWidth = sizeX + CONTEXT_STRIP_MARGIN * 2;
  const strips: ContextStrip[] = [];
  let x = x0;

  const band = (depth: number): Rect => ({
    x0: x,
    z0,
    x1: x + bandWidth - 1,
    z1: z0 + depth - 1,
  });

  // --- slope ---------------------------------------------------------------
  {
    const cellsDepth = SLOPE_POSITIONS * sizeZ + (SLOPE_POSITIONS - 1) * CONTEXT_CELL_GAP;
    const depth = cellsDepth + CONTEXT_STRIP_MARGIN * 2;
    const cells: ContextCell[] = [];
    for (let k = 0; k < SLOPE_POSITIONS; k++) {
      cells.push({
        id: `slope_${k}`,
        strip: "slope",
        column: k,
        archetype: CONTEXT_ARCHETYPE,
        theme: CONTEXT_THEME,
        roof: "gable",
        floors: 2,
        size: CONTEXT_SIZE,
        yaw: 0,
        x: centred(x, bandWidth, sizeX),
        z: z0 + CONTEXT_STRIP_MARGIN + k * (sizeZ + CONTEXT_CELL_GAP),
      });
    }
    strips.push({ strip: "slope", band: band(depth), ground: { kind: "slope" }, cells, props: [] });
    x += bandWidth + CONTEXT_STRIP_GAP;
  }

  // --- ridge ---------------------------------------------------------------
  {
    // The flanks have to be long enough for the grade to be a grade rather than
    // a step: a full `SLOPE_RUN` on each side of the cottage.
    const flank = SLOPE_RUN + CONTEXT_STRIP_MARGIN;
    const depth = sizeZ + flank * 2;
    const crestZ = z0 + flank + (sizeZ >> 1);
    const cells: ContextCell[] = [
      {
        id: "ridge_crest",
        strip: "ridge",
        column: 0,
        archetype: CONTEXT_ARCHETYPE,
        theme: CONTEXT_THEME,
        roof: "gable",
        floors: 2,
        size: CONTEXT_SIZE,
        yaw: 0,
        x: centred(x, bandWidth, sizeX),
        // Straddling: the crest runs through the middle of the footprint, so
        // the pad has to cut on the line and fill on both sides of it.
        z: crestZ - (sizeZ >> 1),
      },
    ];
    strips.push({
      strip: "ridge",
      band: band(depth),
      ground: { kind: "ridge", crestZ },
      cells,
      props: [],
    });
    x += bandWidth + CONTEXT_STRIP_GAP;
  }

  // --- shore ---------------------------------------------------------------
  {
    const cellZ = z0 + CONTEXT_STRIP_MARGIN;
    const waterZ0 = cellZ + sizeZ + SHORE_SETBACK;
    const depth = waterZ0 - z0 + SHORE_POND_DEPTH + CONTEXT_STRIP_MARGIN;
    // The basin is inset from the band's own edges, so every column outside it
    // is untouched flat ground a block above the water — which is the argument
    // that makes it settle-safe, exactly as the harbour row's basin is.
    const pond: Rect = {
      x0: x + 2,
      z0: waterZ0,
      x1: x + bandWidth - 3,
      z1: waterZ0 + SHORE_POND_DEPTH - 1,
    };
    const cellX = centred(x, bandWidth, sizeX);
    const cells: ContextCell[] = [
      {
        id: "shore_waterline",
        strip: "shore",
        column: 0,
        archetype: CONTEXT_ARCHETYPE,
        theme: CONTEXT_THEME,
        roof: "gable",
        floors: 2,
        size: CONTEXT_SIZE,
        yaw: 0,
        x: cellX,
        z: cellZ,
      },
    ];
    strips.push({
      strip: "shore",
      band: band(depth),
      ground: { kind: "shore", pond },
      cells,
      props: [
        {
          id: "shore_pier",
          prop: "pier",
          // Aimed at dry land two columns short of the water, east of the
          // cottage's own line so the two never argue about a column. The
          // placer still has to find the shore itself, which is the part being
          // exhibited.
          params: {
            length: SHORE_PIER_LENGTH,
            width: 2,
            yaw: 0,
            at: { x: cellX + sizeX + 2, z: waterZ0 - 2 },
          },
        },
      ],
    });
    x += bandWidth + CONTEXT_STRIP_GAP;
  }

  // --- yaw -----------------------------------------------------------------
  {
    const count = CONTEXT_YAWS.length;
    const cellsDepth = count * sizeZ + (count - 1) * CONTEXT_CELL_GAP;
    const depth = cellsDepth + CONTEXT_STRIP_MARGIN * 2;
    const cells: ContextCell[] = CONTEXT_YAWS.map((yaw, k) => ({
      id: `yaw_${yaw}`,
      strip: "yaw",
      column: k,
      archetype: CONTEXT_ARCHETYPE,
      theme: CONTEXT_THEME,
      roof: "gable",
      floors: 2,
      size: CONTEXT_SIZE,
      yaw,
      x: centred(x, bandWidth, sizeX),
      z: z0 + CONTEXT_STRIP_MARGIN + k * (sizeZ + CONTEXT_CELL_GAP),
    }));
    strips.push({ strip: "yaw", band: band(depth), ground: { kind: "flat" }, cells, props: [] });
    x += bandWidth + CONTEXT_STRIP_GAP;
  }

  const width = x - CONTEXT_STRIP_GAP - x0;
  const depth = Math.max(...strips.map((s) => s.band.z1 - z0 + 1));
  return { strips, cells: strips.flatMap((s) => s.cells), width, depth };
}

/* -------------------------------------------------------------------------- */
/* the ground itself                                                           */
/* -------------------------------------------------------------------------- */

/** Height of a strip's ground at `z`, before any pad. */
export function contextGroundAt(strip: ContextStrip, baseY: number, z: number): number {
  const ground = strip.ground;
  switch (ground.kind) {
    case "slope":
      // Falling south, so the north edge is the crown: the door of every
      // cottage looks down the hill.
      return baseY + Math.floor(((strip.band.z1 - z) * SLOPE_RISE) / SLOPE_RUN);
    case "ridge": {
      // Highest on the crest, falling away at the same grade on both sides, so
      // the two flanks are mirror images and an asymmetry in the result is the
      // building's, not the ground's.
      const half = Math.max(ground.crestZ - strip.band.z0, strip.band.z1 - ground.crestZ);
      const rise = Math.max(0, half - Math.abs(z - ground.crestZ));
      return baseY + Math.floor((rise * SLOPE_RISE) / SLOPE_RUN);
    }
    default:
      return baseY;
  }
}

/**
 * Write a strip's ground into the column plan.
 *
 * Only `ground`, `fluidTop` and (for the basin) the surface materials move.
 * Nothing else in the plan is touched, and nothing outside the strip's band is:
 * the section is a set of islands in the dev world's plain, and a strip that
 * bled into its neighbour would confound the two exhibits it sits between.
 */
export function shapeContextGround(
  plan: ColumnPlan,
  section: ContextSection,
  baseY: number,
  stack: PrismarineStack,
): number {
  const { region } = plan;
  let pondColumns = 0;
  for (const strip of section.strips) {
    for (let z = strip.band.z0; z <= strip.band.z1; z++) {
      const j = z - region.z0;
      if (j < 0 || j >= region.depth) continue;
      const y = contextGroundAt(strip, baseY, z);
      for (let x = strip.band.x0; x <= strip.band.x1; x++) {
        const i = x - region.x0;
        if (i < 0 || i >= region.width) continue;
        const idx = j * region.width + i;
        plan.ground[idx] = y;
        plan.fluidTop[idx] = y;
      }
    }
    if (strip.ground.kind === "shore") {
      pondColumns += digPropPond(plan, strip.ground.pond, stack);
    }
  }
  return pondColumns;
}

/* -------------------------------------------------------------------------- */
/* the build                                                                   */
/* -------------------------------------------------------------------------- */

/** The door port every context cell declares — south, before its yaw. */
const CONTEXT_PORTS: Readonly<Record<string, PortDeclaration>> = Object.freeze({
  door: { type: "door", face: "south", tags: ["primary"] } as PortDeclaration,
});

/** What {@link buildContextExhibits} produced. */
export interface ContextResult {
  readonly section: ContextSection;
  readonly buildings: readonly BuiltBuilding[];
  readonly props: readonly PlacedProp[];
  readonly blocks: readonly StructureBlock[];
  readonly doorsteps: DoorstepResult;
  /** Columns dug and flooded for the shore strip's basin. */
  readonly pondColumns: number;
  /** Foundation elevation chosen per cell, keyed by cell id — for the tests. */
  readonly foundations: ReadonlyMap<string, number>;
  /** Skirt depth each building had to sink, keyed by cell id. */
  readonly padded: readonly { readonly id: string; readonly cutFill: number }[];
}

/** The rotated world footprint of a cell. */
export function contextFootprint(cell: ContextCell): Rect {
  const [sx, , sz] = cell.size;
  const w = cell.yaw === 90 || cell.yaw === 270 ? sz : sx;
  const d = cell.yaw === 90 || cell.yaw === 270 ? sx : sz;
  return { x0: cell.x, z0: cell.z, x1: cell.x + w - 1, z1: cell.z + d - 1 };
}

/** The median of a footprint's ground — `terrain_conform.reference`'s default. */
function medianGround(plan: ColumnPlan, rect: Rect): number {
  const { region } = plan;
  const values: number[] = [];
  for (let z = rect.z0; z <= rect.z1; z++) {
    const j = z - region.z0;
    if (j < 0 || j >= region.depth) continue;
    for (let x = rect.x0; x <= rect.x1; x++) {
      const i = x - region.x0;
      if (i < 0 || i >= region.width) continue;
      values.push(plan.ground[j * region.width + i] as number);
    }
  }
  if (values.length === 0) return 0;
  values.sort((a, b) => a - b);
  const mid = values.length >> 1;
  return Math.round(
    values.length % 2 === 1
      ? (values[mid] as number)
      : ((values[mid - 1] as number) + (values[mid] as number)) / 2,
  );
}

/**
 * Level the ground under every cell, through the real pad kernel.
 *
 * `applyLevelPad` is the same function `applyPadEdits` calls on the master
 * field during a compile, and it works on a {@link HeightField} — so the plan's
 * integer ground is lifted into a field, every pad composed into it in cell
 * order, and the result rounded back down. That round trip is exact for any
 * column no pad touched, which is why it is safe to run over the whole section
 * rather than over each footprint.
 *
 * Fluid columns are left alone: the basin is settle-safe because every one of
 * its columns sits a fixed block below its dry neighbours, and a pad that
 * reached into it would break that argument. No pad is placed within reach of
 * one, so this is a guard rather than a behaviour.
 */
function applyContextPads(
  plan: ColumnPlan,
  section: ContextSection,
  foundations: ReadonlyMap<string, number>,
): void {
  const { region } = plan;
  const field = new HeightField(region, Float64Array.from(plan.ground));
  for (const cell of section.cells) {
    const rect = contextFootprint(cell);
    applyLevelPad(field, {
      x0: rect.x0,
      z0: rect.z0,
      x1: rect.x1,
      z1: rect.z1,
      targetY: foundations.get(cell.id) as number,
      apron: DEFAULT_BLEND,
    });
  }
  for (const strip of section.strips) {
    for (let z = strip.band.z0; z <= strip.band.z1; z++) {
      const j = z - region.z0;
      if (j < 0 || j >= region.depth) continue;
      for (let x = strip.band.x0; x <= strip.band.x1; x++) {
        const i = x - region.x0;
        if (i < 0 || i >= region.width) continue;
        const idx = j * region.width + i;
        if (plan.fluidKind[idx] !== FluidKind.NONE) continue;
        const y = Math.round(field.values[idx] as number);
        plan.ground[idx] = y;
        plan.fluidTop[idx] = y;
      }
    }
  }
}

/**
 * Shape the ground, then build every context cell through the real pipeline.
 *
 * The order is the compiler's own, and each step depends on the one before it:
 * ground, then pads, then buildings (which sink their skirts into the padded
 * ground and underpin their aprons against it), then props (placed against the
 * finished ground), then doorsteps (which reconcile each threshold with the
 * ground outside it, and so must run last).
 */
export function buildContextExhibits(input: {
  readonly plan: ColumnPlan;
  readonly stack: PrismarineStack;
  readonly worldSeed: bigint;
  readonly baseY: number;
  readonly x0: number;
  readonly z0: number;
}): ContextResult {
  const { plan, stack, worldSeed, baseY } = input;
  const section = planContextSection(input.x0, input.z0);
  const pondColumns = shapeContextGround(plan, section, baseY, stack);

  // The foundation elevation, read off the *unpadded* ground exactly as
  // `referenceY` reads it off the field: the median column under the footprint.
  const foundations = new Map<string, number>();
  const padded: { id: string; cutFill: number }[] = [];
  for (const cell of section.cells) {
    const rect = contextFootprint(cell);
    const target = medianGround(plan, rect);
    foundations.set(cell.id, target);
    padded.push({ id: cell.id, cutFill: cutFillOf(plan, rect, target) });
  }
  applyContextPads(plan, section, foundations);

  const jobs: BuildingJob[] = section.cells.map((cell) => {
    const nodePath = `dev.context.${cell.strip}.${cell.id}`;
    const seed = nodeSeed(worldSeed, nodePath, "");
    const theme = pickTheme(seed, cell.theme);
    const materials = assignMaterials(theme, 1, seed)[0] as BuildingMaterials;
    const footprint = contextFootprint(cell);
    const foundationY = foundations.get(cell.id) as number;
    const [sx, , sz] = cell.size;
    const placement: Placement = makePlacement({
      nodePath,
      id: cell.id,
      yaw: cell.yaw,
      mirror: false,
      size: cell.yaw === 90 || cell.yaw === 270 ? [sz, cell.size[1], sx] : cell.size,
      footprint,
      anchor: {
        x: footprint.x0 + ((footprint.x1 - footprint.x0) >> 1),
        z: footprint.z0 + ((footprint.z1 - footprint.z0) >> 1),
      },
      foundationY,
    });
    return {
      nodePath,
      placement,
      size: cell.size,
      params: { floors: cell.floors, roof: cell.roof, archetype: cell.archetype },
      ports: CONTEXT_PORTS,
      seed,
      tags: [cell.archetype],
      materials,
    };
  });

  const built = buildBuildings(jobs, plan, stack);
  const blocks: StructureBlock[] = [...built.blocks];

  // --- props ---------------------------------------------------------------
  const propJobs: PropJob[] = section.strips.flatMap((strip) =>
    strip.props.map((prop): PropJob => {
      const nodePath = `dev.context.${strip.strip}.${prop.id}`;
      const seed = nodeSeed(worldSeed, nodePath, "");
      const theme = pickTheme(seed, CONTEXT_THEME);
      return {
        nodePath,
        prop: prop.prop,
        params: prop.params,
        seed,
        materials: assignMaterials(theme, 1, seed)[0] as BuildingMaterials,
      };
    }),
  );
  const props =
    propJobs.length === 0
      ? { blocks: [] as StructureBlock[], placed: [] as PlacedProp[] }
      : buildProps({
          jobs: propJobs,
          plan,
          stack,
          reserved: built.built.map((b) => b.footprint),
        });
  blocks.push(...props.blocks);

  // --- doorsteps -----------------------------------------------------------
  // The whole reason the strips exist: on the plain every threshold is flush,
  // and this pass has never once run in the dev world.
  const ports: ResolvedPort[] = jobs.flatMap((job) =>
    resolvePorts(job.placement, job.size, job.ports),
  );
  const palette = resolvePalette(stack, undefined, nodeSeed(worldSeed, "dev.context", "")).palette;
  const doorsteps = buildDoorsteps({ buildings: built.built, ports, plan, palette, stack });
  blocks.push(...doorsteps.blocks);

  return {
    section,
    buildings: built.built,
    props: props.placed,
    blocks,
    doorsteps,
    pondColumns,
    foundations,
    padded,
  };
}

/** Blocks of ground a pad has to move under one footprint — the cut plus the fill. */
function cutFillOf(plan: ColumnPlan, rect: Rect, targetY: number): number {
  const { region } = plan;
  let total = 0;
  for (let z = rect.z0; z <= rect.z1; z++) {
    const j = z - region.z0;
    if (j < 0 || j >= region.depth) continue;
    for (let x = rect.x0; x <= rect.x1; x++) {
      const i = x - region.x0;
      if (i < 0 || i >= region.width) continue;
      total += Math.abs((plan.ground[j * region.width + i] as number) - targetY);
    }
  }
  return total;
}
