/**
 * The **water-and-span exhibits** — the three pieces of infrastructure that
 * landed after `exhibits/infra.ts`'s run band and that a walk is the only
 * review of:
 *
 * 1. **The three bridge styles** (`structures/bridge-styles.ts`). One channel,
 *    crossed three times: a stone arch, a timber deck, a suspension span. Each
 *    is *asked for by name* rather than left to the span-length rule, so the
 *    three sit side by side over water of exactly the same width and the only
 *    difference between them is the style.
 * 2. **`harbour_chain_tower`** (`span` geometry, the `between` form). Two moles
 *    reaching into a closed basin, a tower on each tip, and the catenary the
 *    real `buildInfraEntries` path hangs between their heads.
 * 3. **The three water movers** (`structures/water-works.ts`). A watercourse of
 *    three reaches descending west to east, each with its own narrows: a weir
 *    on the shallow reach, a canal lock on the middle one, a dam on the deep
 *    one. Then, on a band of its own, the fourth case the machinery is really
 *    about — a dam thrown across a marsh at grade, where **no** head closes, so
 *    the refusal builds as dry masonry rather than as nothing.
 *
 * **Every band shapes only its own ground**, exactly as the run band does, so
 * nothing north of these exhibits moves. The bands' water is dug the prop
 * pond's way — a flat box whose neighbours all stand at or above its surface —
 * and the movers' pools go in through `fluid.channel` at rank 0, so
 * `checkFluidStability` stays at zero unstable columns.
 */

import { infraEntry, nodeSeed, pickTheme } from "@terrainist/stdlib";

import type { PrismarineStack } from "../emit/prismarine.js";
import { FluidKind, type ColumnPlan } from "../terrain/columns.js";
import { Palette, defineGroundRoles } from "../terrain/palette.js";
import { driverForPlan } from "../layout/ground-driver.js";
import type { StructureBlock } from "../structures/buildings.js";
import { buildBridgeKit } from "../structures/bridge.js";
import { resolveBridgeStyles, type BridgeStyle } from "../structures/bridge-styles.js";
import {
  buildInfraEntries,
  type InfraEntryJob,
  type InfraPlacementView,
} from "../structures/infra-entry.js";
import type { CoursePoint } from "../structures/wall-course.js";

/* -------------------------------------------------------------------------- */
/* shared helpers                                                              */
/* -------------------------------------------------------------------------- */

/** The theme every band here dresses itself from — one, so the three compare. */
const EXHIBIT_THEME = "medieval";

/** A rectangle of columns, inclusive on both ends. */
interface Rect {
  readonly x0: number;
  readonly z0: number;
  readonly x1: number;
  readonly z1: number;
}

/** The plan index of a column, or `undefined` outside the region. */
function at(plan: ColumnPlan, x: number, z: number): number | undefined {
  const { region } = plan;
  const i = x - region.x0;
  const j = z - region.z0;
  if (i < 0 || i >= region.width || j < 0 || j >= region.depth) return undefined;
  return j * region.width + i;
}

/** Flat, dry ground at `y` over a rectangle — a band clearing its own site. */
function flatten(plan: ColumnPlan, rect: Rect, y: number): void {
  for (let z = rect.z0; z <= rect.z1; z++) {
    for (let x = rect.x0; x <= rect.x1; x++) {
      const k = at(plan, x, z);
      if (k === undefined) continue;
      plan.ground[k] = y;
      plan.fluidTop[k] = y;
      plan.fluidKind[k] = FluidKind.NONE;
    }
  }
}

/**
 * Flood one column: a bed at `bed`, water to `surface`.
 *
 * The prop pond's move, per column rather than per box, because the
 * watercourse's reaches are not boxes. Stability is the *caller's* to arrange —
 * every neighbour of a wet column must be wet at the same surface or stand at
 * or above it — and every caller below arranges it by construction.
 */
function flood(
  plan: ColumnPlan,
  stack: PrismarineStack,
  x: number,
  z: number,
  bed: number,
  surface: number,
): void {
  const k = at(plan, x, z);
  if (k === undefined) return;
  plan.ground[k] = bed;
  plan.fluidTop[k] = surface;
  plan.fluidKind[k] = FluidKind.WATER;
  const sand = stack.blockByName("sand")?.stateId ?? 0;
  const gravel = stack.blockByName("gravel")?.stateId ?? 0;
  plan.surface[k] = (x + z) % 3 === 0 ? gravel : sand;
  plan.subsurface[k] = sand;
  plan.soil[k] = 0;
  plan.snow[k] = 0;
  plan.lakeMask[k] = 1;
}

/** A palette carrying the band's theme's ground roles — the styles read those. */
function themedPalette(stack: PrismarineStack, worldSeed: bigint, nodePath: string): Palette {
  const theme = pickTheme(nodeSeed(worldSeed, nodePath, ""), EXHIBIT_THEME);
  const palette = new Palette(new Map(), nodeSeed(worldSeed, `${nodePath}.palette`, ""));
  defineGroundRoles(palette, stack, theme);
  return palette;
}

/** A 3×3 patch of dry bank a route may name — §5's "a name the compiler placed". */
function anchorPatch(cx: number, cz: number): CoursePoint[] {
  const columns: CoursePoint[] = [];
  for (let z = cz - 1; z <= cz + 1; z++) {
    for (let x = cx - 1; x <= cx + 1; x++) columns.push({ x, z });
  }
  return columns;
}

/* -------------------------------------------------------------------------- */
/* 1. the three bridge styles                                                  */
/* -------------------------------------------------------------------------- */

export const BRIDGE_STYLES_WIDTH = 96;
export const BRIDGE_STYLES_DEPTH = 44;

/** The channel: 28 columns of water, which is a suspension span's own length. */
const BRIDGE_CHANNEL_X0 = 34;
const BRIDGE_CHANNEL_X1 = 61;
const BRIDGE_CHANNEL_Z0 = 4;
const BRIDGE_CHANNEL_Z1 = 39;
/** How far below the bank the channel's bed sits. */
const BRIDGE_CHANNEL_DEPTH = 4;
/** Deck width, in columns — the road pass's own village width. */
const BRIDGE_DECK_WIDTH = 5;

/** The three crossings, north to south: which style, and on which z row. */
const BRIDGE_CROSSINGS: readonly { readonly style: BridgeStyle; readonly z: number }[] =
  Object.freeze([
    { style: "stone", z: 10 },
    { style: "timber", z: 22 },
    { style: "suspension", z: 34 },
  ]);

/** What one build of the bridge band reports. */
export interface BridgeStylesExhibitResult {
  readonly blocks: readonly StructureBlock[];
  /** Blocks written per style, in band order — a style that built nothing is 0. */
  readonly perStyle: Readonly<Record<BridgeStyle, number>>;
  /** Columns of channel dug. */
  readonly waterColumns: number;
}

/**
 * Dig one channel and cross it three times, once in each style.
 *
 * The styles are **requested by name** rather than selected by span length:
 * `selectBridgeStyle`'s length rule is unit-tested, and what a walk is for is
 * seeing the three sections over identical water.
 */
export function buildBridgeStylesExhibit(
  plan: ColumnPlan,
  stack: PrismarineStack,
  worldSeed: bigint,
  x0: number,
  z0: number,
  baseY: number,
): BridgeStylesExhibitResult {
  const { region } = plan;
  flatten(
    plan,
    { x0, z0, x1: x0 + BRIDGE_STYLES_WIDTH - 1, z1: z0 + BRIDGE_STYLES_DEPTH - 1 },
    baseY,
  );

  // The channel: bed four below the bank, surface one below it, so a deck laid
  // at `baseY` is flush with the grass at both approaches.
  const surface = baseY - 1;
  let waterColumns = 0;
  for (let z = z0 + BRIDGE_CHANNEL_Z0; z <= z0 + BRIDGE_CHANNEL_Z1; z++) {
    for (let x = x0 + BRIDGE_CHANNEL_X0; x <= x0 + BRIDGE_CHANNEL_X1; x++) {
      flood(plan, stack, x, z, baseY - BRIDGE_CHANNEL_DEPTH, surface);
      waterColumns++;
    }
  }

  const water = new Uint8Array(region.width * region.depth);
  for (let i = 0; i < water.length; i++) {
    if (plan.fluidKind[i] === FluidKind.WATER) water[i] = 1;
  }

  const palette = themedPalette(stack, worldSeed, "dev.infra.bridge_styles");
  const fallback = (name: string): number => stack.blockByName(name)?.stateId ?? 0;
  // The kit's own three states, spelled exactly as `resolveRoadStates` spells
  // them, so a style that falls back falls back to the bridge everyone knows.
  const base = {
    deck:
      stack.blockStateOf("oak_slab", { type: "top", waterlogged: "false" }) ??
      fallback("oak_planks"),
    post: fallback("oak_fence"),
    pier: fallback("oak_log"),
  };

  const blocks: StructureBlock[] = [];
  const perStyle: Record<BridgeStyle, number> = { stone: 0, timber: 0, suspension: 0 };
  for (const crossing of BRIDGE_CROSSINGS) {
    const styles = resolveBridgeStyles(palette, stack, base, crossing.style);
    const path: { x: number; z: number; y: number }[] = [];
    for (let x = x0 + BRIDGE_CHANNEL_X0 - 12; x <= x0 + BRIDGE_CHANNEL_X1 + 12; x++) {
      path.push({ x, z: z0 + crossing.z, y: baseY });
    }
    const built = buildBridgeKit(
      region,
      plan,
      path,
      BRIDGE_DECK_WIDTH,
      { deck: base.deck, post: base.post, pier: base.pier, styles },
      water,
    );
    perStyle[crossing.style] = built.blocks.length;
    blocks.push(...built.blocks);
  }

  return { blocks, perStyle, waterColumns };
}

/* -------------------------------------------------------------------------- */
/* 2. harbour_chain_tower                                                      */
/* -------------------------------------------------------------------------- */

export const HARBOUR_CHAIN_WIDTH = 80;
export const HARBOUR_CHAIN_DEPTH = 56;

/** The basin, and the two moles reaching into it. */
const BASIN: Rect = { x0: 16, z0: 16, x1: 63, z1: 47 };
const MOLE_Z0 = 30;
const MOLE_Z1 = 34;
const MOLE_WEST_X1 = 31;
const MOLE_EAST_X0 = 48;
const BASIN_DEPTH = 5;

/** What one build of the harbour band reports. */
export interface HarbourChainExhibitResult {
  readonly blocks: readonly StructureBlock[];
  /** Tower and cable columns the planter accepted, and those it refused. */
  readonly columns: number;
  readonly skipped: number;
  /** Diagnostic codes the pass raised — empty is the exhibit passing. */
  readonly diagnostics: readonly string[];
  readonly waterColumns: number;
}

/**
 * A closed basin, two moles, and the chain the real pass hangs between them.
 *
 * The corridor the `between` form finds goes **round** the basin — `view.ground`
 * is `undefined` on water, which is what "somewhere a thing could stand" means —
 * and the chain then hangs on the straight chord across the harbour mouth,
 * which is the whole distinction `buildSpan` is written around.
 */
export function buildHarbourChainExhibit(
  plan: ColumnPlan,
  stack: PrismarineStack,
  worldSeed: bigint,
  x0: number,
  z0: number,
  baseY: number,
): HarbourChainExhibitResult {
  flatten(
    plan,
    { x0, z0, x1: x0 + HARBOUR_CHAIN_WIDTH - 1, z1: z0 + HARBOUR_CHAIN_DEPTH - 1 },
    baseY,
  );

  const onMole = (x: number, z: number): boolean => {
    if (z < z0 + MOLE_Z0 || z > z0 + MOLE_Z1) return false;
    return x <= x0 + MOLE_WEST_X1 || x >= x0 + MOLE_EAST_X0;
  };
  let waterColumns = 0;
  for (let z = z0 + BASIN.z0; z <= z0 + BASIN.z1; z++) {
    for (let x = x0 + BASIN.x0; x <= x0 + BASIN.x1; x++) {
      if (onMole(x, z)) continue;
      flood(plan, stack, x, z, baseY - BASIN_DEPTH, baseY - 1);
      waterColumns++;
    }
  }

  const west = { x: x0 + MOLE_WEST_X1 - 1, z: z0 + MOLE_Z0 + 2 };
  const east = { x: x0 + MOLE_EAST_X0 + 1, z: z0 + MOLE_Z0 + 2 };
  const extents = new Map<string, CoursePoint[]>([
    ["mole_west", anchorPatch(west.x, west.z)],
    ["mole_east", anchorPatch(east.x, east.z)],
  ]);

  const view: InfraPlacementView = {
    bounds: { x0, z0, width: HARBOUR_CHAIN_WIDTH, depth: HARBOUR_CHAIN_DEPTH },
    extentOf: (id) => extents.get(id),
    corridorOf: () => undefined,
    maskOf: () => undefined,
    ground: (x, z) => {
      const k = at(plan, x, z);
      if (k === undefined) return undefined;
      if (plan.fluidKind[k] !== FluidKind.NONE) return undefined;
      return plan.ground[k] as number;
    },
    onRoad: () => false,
  };

  const def = infraEntry("harbour_chain_tower");
  if (def === undefined) {
    throw new Error('harbour exhibit: registry has no "harbour_chain_tower"');
  }
  const nodePath = "dev.infra.harbour_chain";
  const result = buildInfraEntries({
    plan,
    stack,
    jobs: [
      {
        nodePath,
        def,
        route: {
          form: "between",
          target: "mole_west → mole_east",
          targets: ["mole_west", "mole_east"],
        },
        params: {},
        seed: nodeSeed(worldSeed, nodePath, ""),
        gates: false,
      },
    ],
    view,
  });

  return {
    blocks: result.blocks,
    columns: result.entries.reduce((n, e) => n + e.columns, 0),
    skipped: result.entries.reduce((n, e) => n + e.skipped, 0),
    diagnostics: result.diagnostics.map((d) => d.code),
    waterColumns,
  };
}

/* -------------------------------------------------------------------------- */
/* 3. the water movers                                                         */
/* -------------------------------------------------------------------------- */

export const WATER_WORKS_WIDTH = 176;
export const WATER_WORKS_DEPTH = 44;

/** The watercourse's centre line, from the band's north edge. */
const COURSE_Z = 22;
/** Half-width of the open reaches, in columns. Every narrows is tighter. */
const COURSE_HALF = 8;

/**
 * The three reaches, west to east, and the narrows each carries.
 *
 * Three properties are load-bearing and all three are arithmetic rather than
 * taste:
 *
 * - **Each narrows is the narrowest water within `WATERCOURSE_SEARCH` of its own
 *   anchor and of no other's**, which is what pins each entry to its own site:
 *   the spans are 10 / 12 / 14 against an open channel of 16, and the sites are
 *   more than 2 × 24 columns apart in `x`.
 * - **Each reach is a closed pool between two dry sills**, so the water is flat
 *   and stable before a mover touches it, and the head a mover then holds is
 *   bounded by the rim rather than by a wall this file had to build.
 * - **The deep reach is deep enough for a dam's full head.** A dam holds 5 with
 *   2 of freeboard; the eastern reach sits 6 below the rim, so it closes at 5
 *   and the retry loop never has to give ground.
 */
interface Reach {
  /** Reach extent along `x`, from the band's west edge, inclusive. */
  readonly x0: number;
  readonly x1: number;
  /** Blocks below the rim: the water surface, then the bed. */
  readonly drop: number;
  readonly bed: number;
  /** The entry this reach carries, and the narrows it is thrown across. */
  readonly entry: string;
  readonly narrowsX0: number;
  readonly narrowsX1: number;
  readonly narrowsHalf: number;
  /** The bank patch the route names. */
  readonly anchor: string;
}

const REACHES: readonly Reach[] = Object.freeze([
  {
    x0: 12,
    x1: 55,
    drop: 2,
    bed: 4,
    entry: "weir",
    narrowsX0: 34,
    narrowsX1: 38,
    narrowsHalf: 5,
    anchor: "weir_reach",
  },
  {
    x0: 62,
    x1: 119,
    drop: 4,
    bed: 6,
    entry: "canal_lock",
    narrowsX0: 100,
    narrowsX1: 104,
    narrowsHalf: 6,
    anchor: "lock_reach",
  },
  {
    x0: 126,
    x1: 162,
    drop: 6,
    bed: 8,
    entry: "dam",
    narrowsX0: 142,
    narrowsX1: 146,
    narrowsHalf: 7,
    anchor: "dam_reach",
  },
]);

export const MARSH_WIDTH = 48;
export const MARSH_DEPTH = 24;

/** The hopeless case: a pan of water lying at grade, with nothing to hold. */
const MARSH: Rect = { x0: 16, z0: 8, x1: 32, z1: 15 };
const MARSH_ANCHOR = { x: 24, z: 4 };

/** What one water mover did, as the exhibit reports it. */
export interface WaterMoverReport {
  readonly entry: string;
  readonly columns: number;
  readonly skipped: number;
  /** Columns impounded and the head held — `0`/`0` on a refusal. */
  readonly impounded: number;
  readonly head: number;
}

/** What one build of the water-mover bands reports. */
export interface WaterWorksExhibitResult {
  readonly blocks: readonly StructureBlock[];
  readonly movers: readonly WaterMoverReport[];
  /** Diagnostic codes, in order — the marsh dam's refusal note is expected. */
  readonly diagnostics: readonly string[];
  readonly waterColumns: number;
}

/** Half-width of the watercourse at `x` within a reach, or `undefined` if dry. */
function halfWidthAt(reach: Reach, x: number): number {
  return x >= reach.narrowsX0 && x <= reach.narrowsX1 ? reach.narrowsHalf : COURSE_HALF;
}

/**
 * Cut the watercourse, dig the marsh, and run all four movers through
 * `buildInfraEntries` with a real ground driver.
 *
 * The driver is what makes this the *real* path: a water mover declares its
 * barrier and its pool as `fluid.channel` at rank 0 and only then sweeps its
 * masonry, over ground the resolver has by then raised and dried. Without one
 * the sweep would ask `standY` about a river bed and be told `undefined` for
 * every column that was the point of the entry.
 */
export function buildWaterWorksExhibit(
  plan: ColumnPlan,
  stack: PrismarineStack,
  worldSeed: bigint,
  x0: number,
  z0: number,
  marshX0: number,
  marshZ0: number,
  baseY: number,
): WaterWorksExhibitResult {
  flatten(plan, { x0, z0, x1: x0 + WATER_WORKS_WIDTH - 1, z1: z0 + WATER_WORKS_DEPTH - 1 }, baseY);
  flatten(
    plan,
    { x0: marshX0, z0: marshZ0, x1: marshX0 + MARSH_WIDTH - 1, z1: marshZ0 + MARSH_DEPTH - 1 },
    baseY,
  );

  const zc = z0 + COURSE_Z;
  let waterColumns = 0;
  for (const reach of REACHES) {
    for (let dx = reach.x0; dx <= reach.x1; dx++) {
      const half = halfWidthAt(reach, dx);
      for (let z = zc - half; z < zc + half; z++) {
        flood(plan, stack, x0 + dx, z, baseY - reach.bed, baseY - reach.drop);
        waterColumns++;
      }
    }
  }
  // The marsh: water lying level with the grass around it. Stable — every
  // neighbour stands *at* the surface — and impossible to raise by a block,
  // which is the case the retry loop was written for.
  for (let z = marshZ0 + MARSH.z0; z <= marshZ0 + MARSH.z1; z++) {
    for (let x = marshX0 + MARSH.x0; x <= marshX0 + MARSH.x1; x++) {
      flood(plan, stack, x, z, baseY - 2, baseY);
      waterColumns++;
    }
  }

  const extents = new Map<string, CoursePoint[]>();
  for (const reach of REACHES) {
    const cx = x0 + ((reach.narrowsX0 + reach.narrowsX1) >> 1);
    extents.set(reach.anchor, anchorPatch(cx, zc - COURSE_HALF - 3));
  }
  extents.set("marsh", anchorPatch(marshX0 + MARSH_ANCHOR.x, marshZ0 + MARSH_ANCHOR.z));

  // Both bands at once: the bounds are the union, because a route's search
  // rectangle is clipped to them and a mover whose own water sat on the far
  // side of the clip would be refused for the wrong reason.
  const bx0 = Math.min(x0, marshX0);
  const bz0 = Math.min(z0, marshZ0);
  const bounds = {
    x0: bx0,
    z0: bz0,
    width: Math.max(x0 + WATER_WORKS_WIDTH, marshX0 + MARSH_WIDTH) - bx0,
    depth: Math.max(z0 + WATER_WORKS_DEPTH, marshZ0 + MARSH_DEPTH) - bz0,
  };

  const view: InfraPlacementView = {
    bounds,
    extentOf: (id) => extents.get(id),
    corridorOf: () => undefined,
    maskOf: () => undefined,
    ground: (x, z) => {
      const k = at(plan, x, z);
      if (k === undefined) return undefined;
      if (plan.fluidKind[k] !== FluidKind.NONE) return undefined;
      return plan.ground[k] as number;
    },
    onRoad: () => false,
  };

  const jobs: InfraEntryJob[] = [];
  const push = (entry: string, anchor: string, salt: string): void => {
    const def = infraEntry(entry);
    if (def === undefined) throw new Error(`water works exhibit: registry has no "${entry}"`);
    const nodePath = `dev.infra.water.${salt}`;
    jobs.push({
      nodePath,
      def,
      route: { form: "across", target: anchor },
      params: {},
      seed: nodeSeed(worldSeed, nodePath, ""),
      gates: false,
    });
  };
  for (const reach of REACHES) push(reach.entry, reach.anchor, reach.entry);
  push("dam", "marsh", "marsh_dam");

  const result = buildInfraEntries({
    plan,
    stack,
    jobs,
    view,
    ground: driverForPlan(plan),
  });

  return {
    blocks: result.blocks,
    movers: result.entries.map((e) => ({
      entry: e.entry,
      columns: e.columns,
      skipped: e.skipped,
      impounded: e.impounded ?? 0,
      head: e.head ?? 0,
    })),
    diagnostics: result.diagnostics.map((d) => d.code),
    waterColumns,
  };
}
