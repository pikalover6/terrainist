/**
 * F4 — **streetscape dressing**: what makes a street grid read as a street.
 *
 * The fabric pass (F1) produces a {@link StreetGraph} and hands its centre
 * lines to the road pass, which grades and surfaces the *carriageway*. That is
 * a road, not a street. What separates the two is everything beside the
 * tarmac: a sidewalk band with a curb line, lamps at a rhythm you can pace,
 * zebra crossings where two carriageways meet, and enough furniture that a
 * block reads as inhabited rather than as a parking lot with buildings on it.
 *
 * This module is that dressing, and it is a **pure function of the graph plus
 * the column plan**. It owns no routing decision: it never moves a street,
 * never widens one, and never writes a block inside a carriageway except the
 * crossing stripes, which are a *surface* change and not a block at all.
 *
 * ## Discipline (inherited from `roads.ts`, deliberately)
 *
 * - Sidewalks **mutate the column plan** rather than laying blocks over it —
 *   `ground`, `fluidTop`, `surface`, `subsurface`, `soil` and `snow` all move
 *   together, so the heightmap, the fluid validator and the biome pass keep
 *   seeing the same ground the player walks on.
 * - Nothing is ever written on a wet column, and no column adjacent to fluid
 *   is lowered — the same fluid invariant the road shoulders obey.
 * - Every emitted block stands on something: props are anchored at the
 *   sidewalk's own surface Y and their ops are **clipped to sidewalk
 *   columns**, so a lamp never overhangs the carriageway and never hangs in
 *   the air over a column the sidewalk did not pave.
 * - Determinism is absolute: the only entropy is `hash2`/`hashInt` keyed on
 *   `(streamSeed, x, z)`. No `Math.random`, no transcendentals, no traversal
 *   order dependence — every decision is a pure function of the column.
 *
 * ## The walk line
 *
 * A sidewalk that furniture can fill is a sidewalk you cannot walk down. Every
 * sidewalk band therefore reserves its innermost column — the one against the
 * curb — as the **walk lane**: a continuous, 1-column-wide clear run for the
 * whole length of the segment. Nothing body-blocking is ever emitted on it.
 * The curb itself is a *contrasting surface course*, a material change with no
 * block above it, precisely so the lane stays walkable.
 *
 * ## Types
 *
 * The `StreetGraph` interfaces below are the contract pinned in
 * `docs/DESIGN.md` ("Fabric v2 + precincts"). F1 declares the same shapes in
 * `packages/compiler/src/layout/streets.ts`; this file re-declares them
 * structurally identically so F4 could be built against the contract before
 * F1 landed. At integration the duplicate collapses into an import.
 */

import { streamSeed, type Region, type Seed256 } from "@terrainist/stdlib";
import {
  generateProp,
  propFootprint,
  rotateOps,
  type LocalVoxelOp,
  type PropName,
} from "@terrainist/stdlib";
import { warning, type LoamDiagnostic } from "@terrainist/spec";

import type { PrismarineStack } from "../emit/prismarine.js";
import { FluidKind, type ColumnPlan } from "../terrain/columns.js";
import { detailSeed, hash2, hashInt } from "../terrain/detail.js";
import type { Palette } from "../terrain/palette.js";

import type { GroundClaim, GroundView } from "../layout/ground-contract.js";
import { driverForPlan, type GroundDriver } from "../layout/ground-driver.js";
import { ROAD_SOVEREIGN } from "../layout/types.js";

import type { StructureBlock } from "./buildings.js";
import { index, inside, presentsExposedFace, qualifySegmentId } from "./roads.js";
import { projectToLine, thickenCourse, type ArcFrame, type ArcLevels } from "./sweep.js";

/**
 * One surfaced segment's arc frame and levels — what a sidewalk takes its own
 * level from. See {@link StreetscapeContext.levels}.
 */
export interface SegmentArc {
  readonly frame: ArcFrame;
  readonly levels: ArcLevels;
}

/* -------------------------------------------------------------------------- */
/* the pinned StreetGraph contract (duplicated from docs/DESIGN.md)            */
/* -------------------------------------------------------------------------- */

/** One street, a 4-connected polyline in world column space. */
// The pinned fabric contract, owned by F1's street skeleton. This file was
// written against a verbatim copy while the two tracks ran in parallel; the
// copy collapsed into this import at integration.
import type { StreetGraph, StreetIntersection, StreetSegment } from "../layout/streets.js";

export type { StreetGraph, StreetIntersection, StreetSegment };

/* -------------------------------------------------------------------------- */
/* tuning                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Columns between lamp posts along one street, counting both sides together.
 *
 * The same rhythm `ROAD_LANTERN_SPACING` uses for a country lane's fence
 * lanterns. Because the sides alternate, one *side* of a street carries a lamp
 * every `2 × LAMP_SPACING` columns, which at 14 is a lamp in view from
 * anywhere on the block without a colonnade of them.
 */
export const LAMP_SPACING = 14;

/**
 * Shortest run of street that carries a lamp of its own, in columns.
 *
 * A lamp used to be planted at index `LAMP_SPACING / 2` of *every* segment,
 * however short — so the rhythm restarted at every junction and a quarter made
 * of stubs got one lamp per stub regardless of how little street that was. On a
 * grid, where a segment is a whole block long, nobody could tell; on a terraced
 * quarter, where half the segments are a 10-column contour link or an alley
 * between two flights, it multiplied: fourteen of the hill town's
 * thirty-six segments were shorter than two lamp spacings and each one still
 * got a post.
 *
 * A stub shorter than this is lit by the street it joins. The rule is therefore
 * a *world distance* rule and not a per-segment one, which is the whole point:
 * chopping one street into five does not give it five times the lighting.
 */
export const LAMP_MIN_RUN = 24;

/**
 * Columns of street per building at which lamp spacing starts to stretch.
 *
 * Lighting scales with how many people live on a street, not with how much
 * pavement the fabric happened to spend. A grid quarter spends roughly 60–70
 * columns of street on each building, and at or under this figure the rhythm is
 * exactly {@link LAMP_SPACING} — every quarter dense enough to be a street is
 * lit precisely as it was. Above it the spacing stretches in proportion, so a
 * terraced quarter that spends 110 columns of contour street and stair alley on
 * each of its fifteen houses is lit like fifteen houses rather than like a
 * kilometre of pavement.
 */
export const LAMP_STREET_PER_BUILDING = 80;

/** Most the lamp rhythm may stretch on a pavement-heavy quarter. */
export const LAMP_MAX_STRETCH = 2.5;

/**
 * Lamp spacing for a district, given its street length and how many buildings
 * stand on it.
 *
 * Clamped at 1 from below by construction: nothing here can make a quarter
 * brighter than {@link LAMP_SPACING}, so a district that was never
 * pavement-heavy is byte-identical to what it was before this rule existed.
 */
export function lampSpacing(streetCells: number, buildings: number | undefined): number {
  if (buildings === undefined || buildings <= 0) return LAMP_SPACING;
  const perBuilding = streetCells / buildings;
  const stretch = Math.min(
    LAMP_MAX_STRETCH,
    Math.max(1, perBuilding / LAMP_STREET_PER_BUILDING),
  );
  return Math.max(LAMP_SPACING, Math.round(LAMP_SPACING * stretch));
}

/**
 * Least sidewalk width that can carry a lamp post.
 *
 * A lamp stands on the *outer* sidewalk column so the walk lane (the inner
 * one) stays clear; with a one-column sidewalk those are the same column, and
 * a lamp there would be a bollard in the middle of the footway. One-column
 * sidewalks therefore get curbs, crossings and furniture-free paving, and a
 * diagnostic saying why they got no lamps.
 */
export const LAMP_MIN_SIDEWALK = 2;

/**
 * Depth of a crossing band, in columns along the approach.
 *
 * Two: one column reads as a scuff, three eats the junction. A zebra is a
 * band, and two columns of alternating stripe is the shortest thing that says
 * "band" from ground level.
 */
export const CROSSING_DEPTH = 2;

/**
 * Gap between the junction's own square and the near edge of the crossing.
 *
 * A crossing laid *through* the junction is a crossing you cannot see the ends
 * of. Setting it back by one column past the widest carriageway corner puts it
 * where a real stop line is.
 */
export const CROSSING_SETBACK = 1;

/** Stripe period across a crossing: one pale column, one dark, repeating. */
export const CROSSING_STRIPE_PERIOD = 2;

/** Fraction of eligible sidewalk columns that get furniture, downtown. */
export const FURNITURE_DENSITY_DOWNTOWN = 0.055;
/** Fraction of eligible sidewalk columns that get furniture, in a village. */
export const FURNITURE_DENSITY_VILLAGE = 0.025;

/**
 * Chebyshev gap enforced between two pieces of street furniture, and between
 * furniture and a lamp.
 *
 * Without it, a positional hash at any useful density clumps: two benches
 * sharing a corner is the single most obvious "generated" tell on a sidewalk.
 */
export const FURNITURE_MIN_GAP = 5;

/** Props a downtown sidewalk is dressed with, in catalog order. */
export const DOWNTOWN_FURNITURE: readonly PropName[] = [
  "bench",
  "litter_bin",
  "planter",
  "bicycle_rack",
  "bollard_row",
] as PropName[];

/** Props a village sidewalk is dressed with, in catalog order. */
export const VILLAGE_FURNITURE: readonly PropName[] = [
  "bench",
  "planter",
  "litter_bin",
] as PropName[];

/** Sidewalk paving, when the palette declares no `street.*` symbols. */
export const DEFAULT_SIDEWALK_BLOCK = "smooth_stone";
/** Curb course — the contrasting edge against the carriageway. */
export const DEFAULT_CURB_BLOCK = "stone_bricks";
/** Sidewalk subsurface, so a cut sidewalk shows stone and not dirt. */
export const DEFAULT_SIDEWALK_SUB_BLOCK = "stone";
/** The pale stripe of a crossing. */
export const DEFAULT_CROSSING_PALE_BLOCK = "smooth_quartz";
/** The dark stripe of a crossing. */
export const DEFAULT_CROSSING_DARK_BLOCK = "polished_diorite";

/**
 * Greatest step between the natural ground and the carriageway that still
 * counts as **level** for the purpose of laying a curb.
 *
 * Zero, and zero is the point: a curb is a detail that only reads where the
 * two surfaces are already flush. On a graded slope the sidewalk is being cut
 * or filled to meet the road, and a contrasting course across that cut reads
 * as a seam, not as a kerb.
 */
export const CURB_LEVEL_TOLERANCE = 0;

/* -------------------------------------------------------------------------- */
/* inputs and outputs                                                          */
/* -------------------------------------------------------------------------- */

/** Which furniture kit a district's sidewalks are dressed from. */
export type FurnitureKit = "downtown" | "village" | "none";

/** Everything {@link dressStreets} reads. */
export interface StreetscapeContext {
  /** The column plan; sidewalks and crossings mutate its *materials* in place. */
  readonly plan: ColumnPlan;
  /**
   * The ground contract's driver (`docs/GROUND-CONTRACT-v0.md` §9a).
   *
   * The sidewalk band is a `street.sidewalk` profile now, committed through this
   * rather than written. Omitted only by callers that are not the pipeline — the
   * unit tests that dress a graph on a bare plan — which get a driver of their
   * own over the plan as it stands.
   */
  readonly ground?: GroundDriver;
  /**
   * The flanking carriageway's arc frame and levels, per surfaced segment id
   * (`street:<id>`) — **inversion I6** (§3.8b, §4.4).
   *
   * `paveSidewalks` used to read the current `plan.ground` of the centre column,
   * whatever the last writer left, and level the whole band to it: measured at up
   * to **seven blocks** of step across one street's own width, and one of the six
   * walked defects. With this, the sidewalk's level and the carriageway's come
   * from one number by construction — the same {@link ArcLevels} the surfacer
   * graded, sampled at the band column's own arc station.
   *
   * A segment the surfacer never levelled (a graph dressed on its own, a segment
   * refused) has no entry, and the band falls back to the centre cell's ground:
   * there is no arc frame to ask, and inventing one would be a second answer.
   */
  readonly levels?: ReadonlyMap<string, SegmentArc>;
  /**
   * The switch. Defaults to {@link ROAD_SOVEREIGN}; the parameter exists so a
   * test may exercise the draped kerb without moving a compile-time constant.
   */
  readonly sovereign?: boolean;
  /** Block-name → state-id resolution for prop ops. */
  readonly stack: PrismarineStack;
  /** The district node's seed; every hash stream derives from it. */
  readonly seed: Seed256;
  /** Furniture kit. Default `"none"`. */
  readonly furniture?: FurnitureKit;
  /** Palette overrides for `street.sidewalk`, `street.curb`, … */
  readonly palette?: Palette;
  /** Node path for diagnostics. */
  readonly nodePath?: string;
  /**
   * Buildings standing in this district — what there is to light.
   *
   * Omitted by callers that dress a graph on its own, and the pass then lights
   * the street at the flat {@link LAMP_SPACING} rhythm it always did.
   */
  readonly buildings?: number;
  /**
   * Columns already carrying someone else's blocks — building aprons above
   * all. A shop's porch lamp lands one cell outside its footprint, which on a
   * build-to-line lot IS the sidewalk; a planter scattered onto the same
   * column overwrote the lamp post and left its lantern standing on a
   * trapdoor. A prop whose ops touch any avoided column is skipped whole.
   */
  readonly avoid?: (x: number, z: number) => boolean;
  /**
   * 1 on every column the **street surfacer** laid — its carriageways, its
   * bridge decks and its flights of steps, row-major over the plan's region.
   *
   * This pass and the surfacer both have to answer "where is the street", and
   * until this input existed they answered it with two different constructions.
   * The surfacer asks each nearby column for its perpendicular distance to the
   * **true centre line** ({@link sweptColumns}); {@link buildStreetMasks} walks
   * the *raster* and offsets each cell along a heading forced onto an axis. On an
   * axis-aligned street those agree exactly. On a diagonal they do not: the outer
   * lanes of a diagonal carriageway fall outside every axis-aligned bar the
   * raster walk draws, so this pass classified road as **sidewalk** and
   * {@link paveSidewalks} re-levelled it — to the ground under a centre cell one
   * or two cross-sections away. Measured on the hill town that turned a street
   * the surfacer had written level into one with up to seven blocks of step
   * across its own width.
   *
   * The invariant, stated once: **no later pass re-levels a column the surfacer
   * owns.** A column in this mask is carriageway, whatever the raster walk
   * thinks, and this pass may paint a crossing on it and nothing else.
   *
   * Omitted by callers with no surfacer result — every test that dresses a graph
   * on its own — and the pass then behaves exactly as it did before.
   */
  readonly surfaced?: Uint8Array;
}

/** One prop this pass planted, in world columns. */
export interface StreetscapeProp {
  readonly prop: PropName;
  /** World column of the prop's local `(0, 0)`. */
  readonly x: number;
  readonly z: number;
  /** World Y of local `y = 0` — the sidewalk's own surface. */
  readonly baseY: number;
  /** `0 | 90 | 180 | 270`, facing the carriageway. */
  readonly yaw: 0 | 90 | 180 | 270;
  readonly blockCount: number;
}

/** The masks the dressing pass built, one byte per region column. */
export interface StreetMasks {
  /** 1 on a carriageway column. */
  readonly carriageway: Uint8Array;
  /** 1 on a sidewalk column (never also carriageway). */
  readonly sidewalk: Uint8Array;
  /** 1 on the reserved clear walk lane (a subset of `sidewalk`). */
  readonly walkLane: Uint8Array;
  /** 1 on a sidewalk column carrying the curb course. */
  readonly curb: Uint8Array;
  /** Carriageway Y each column was dressed to; `INT_MIN` where unset. */
  readonly y: Int32Array;
}

/** What {@link dressStreets} produced. */
export interface StreetscapeResult {
  readonly blocks: readonly StructureBlock[];
  readonly props: readonly StreetscapeProp[];
  readonly masks: StreetMasks;
  /** Columns repainted as crossing stripes. */
  readonly crossingColumns: number;
  readonly diagnostics: readonly LoamDiagnostic[];
  /**
   * **The furniture, held back for the building half** — v1 §2's `masks.y` row,
   * landed ("derived in the build phase — street furniture stands on frozen
   * ground; the post-commit re-read becomes a plain read").
   *
   * Present only when the driver is the compile's ground stage
   * ({@link GroundDriver.staged}), and then {@link StreetscapeResult.blocks}
   * carries the paving alone: the lamps and the kerbside kit are laid by calling
   * this, after pass 5c.
   *
   * Why it cannot stay where it was. `dressStreets` runs in the *declaring*
   * half, so the only level §1.4 lets it read is `view("C")` — the tiers
   * strictly above `street.sidewalk`, which is A and B. Flag-off that read was
   * the plan at this pipeline position, i.e. the carriageway's own committed
   * level, and a lamp stood on it. Flag-on it is the level *before* the street
   * family claimed anything, and a lamp planted on it hangs wherever the street
   * cut or filled — six `unsupported.chain` findings on the hillside village,
   * and the same fence-fence-lantern stack on five other worlds. Deferring the
   * placement is the fix the contract already specified: the frozen ground is a
   * plain array read once the seal has happened, and `masks.y` is refreshed from
   * it before a single prop is sited.
   *
   * `undefined` off the staged path, where nothing was held back.
   */
  readonly furnish?: () => StreetscapeFurnishing;
}

/** What {@link StreetscapeResult.furnish} laid, once the ground was frozen. */
export interface StreetscapeFurnishing {
  readonly blocks: readonly StructureBlock[];
  readonly props: readonly StreetscapeProp[];
  readonly diagnostics: readonly LoamDiagnostic[];
}

const UNSET = -2147483648;

/* -------------------------------------------------------------------------- */
/* geometry helpers                                                            */
/* -------------------------------------------------------------------------- */

interface Cell {
  readonly x: number;
  readonly z: number;
}
interface Step extends Cell {
  /** Unit heading along the polyline at this cell. */
  readonly dx: number;
  readonly dz: number;
}

/**
 * Expand a polyline into its 4-connected cells, each carrying a heading.
 *
 * The contract says the path is already 4-connected, but it says nothing about
 * whether consecutive vertices are adjacent: a grid street is naturally given
 * as two corner points. Walking the axis-aligned run between them is what
 * turns either form into the same cell list.
 */
export function walkStreet(path: readonly Cell[]): Step[] {
  const cells: Cell[] = [];
  for (const [i, point] of path.entries()) {
    if (i === 0) {
      cells.push({ x: point.x, z: point.z });
      continue;
    }
    const prev = cells[cells.length - 1] as Cell;
    const sx = Math.sign(point.x - prev.x);
    const sz = Math.sign(point.z - prev.z);
    let cx = prev.x;
    let cz = prev.z;
    // X first, then Z: an L, never a diagonal. A 4-connected polyline that
    // *is* already dense simply takes one branch per step.
    while (cx !== point.x) {
      cx += sx;
      cells.push({ x: cx, z: cz });
    }
    while (cz !== point.z) {
      cz += sz;
      cells.push({ x: cx, z: cz });
    }
  }
  return cells.map((cell, i) => {
    const a = cells[i === 0 ? 0 : i - 1] as Cell;
    const b = cells[i === cells.length - 1 ? i : i + 1] as Cell;
    const dx = Math.sign(b.x - a.x);
    const dz = Math.sign(b.z - a.z);
    // A pure heading, never diagonal: on a corner cell prefer the axis the
    // street continues along, which is the one with the longer run.
    if (dx !== 0 && dz !== 0) return { ...cell, dx, dz: 0 };
    if (dx === 0 && dz === 0) return { ...cell, dx: 1, dz: 0 };
    return { ...cell, dx, dz };
  });
}

/** Perpendicular offsets a carriageway of `width` claims about its centre. */
export function carriagewayOffsets(width: number): number[] {
  const half = (width - 1) >> 1;
  const out: number[] = [];
  for (let o = -half; o <= width - 1 - half; o++) out.push(o);
  return out;
}

/** Offset a cell perpendicular to its heading. */
export function perp(step: Step, offset: number): Cell {
  // Left-hand normal of (dx, dz) is (dz, -dx).
  return { x: step.x + step.dz * offset, z: step.z - step.dx * offset };
}

/* -------------------------------------------------------------------------- */
/* materials                                                                   */
/* -------------------------------------------------------------------------- */

interface StreetStates {
  readonly sidewalk: number;
  readonly curb: number;
  readonly subsurface: number;
  readonly pale: number;
  readonly dark: number;
}

function resolveStreetStates(
  stack: PrismarineStack,
  palette: Palette | undefined,
): StreetStates {
  const fallback = (name: string): number =>
    stack.blockByName(name)?.stateId ?? 0;
  const at = (symbol: string, name: string): number =>
    palette !== undefined && palette.has(symbol)
      ? palette.state(symbol)
      : fallback(name);
  return {
    sidewalk: at("street.sidewalk", DEFAULT_SIDEWALK_BLOCK),
    curb: at("street.curb", DEFAULT_CURB_BLOCK),
    subsurface: at("street.subsurface", DEFAULT_SIDEWALK_SUB_BLOCK),
    pale: at("street.crossing.pale", DEFAULT_CROSSING_PALE_BLOCK),
    dark: at("street.crossing.dark", DEFAULT_CROSSING_DARK_BLOCK),
  };
}

/* -------------------------------------------------------------------------- */
/* the pass                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Dress a street graph: sidewalks, curbs, lamps, crossings, furniture.
 *
 * Order is load-bearing and is the order the surfaces depend on each other:
 *
 * 1. **Masks** — rasterize every carriageway, then every sidewalk band, so
 *    later stages can ask "is this column tarmac?" without re-deriving it.
 *    A sidewalk column of one street that is another street's carriageway is
 *    carriageway; junctions win.
 * 2. **Sidewalks** — pave the band into the plan, at the carriageway's own Y.
 * 3. **Curbs** — repaint the inner sidewalk column where, and only where, the
 *    natural ground was already flush with the road.
 * 4. **Crossings** — repaint stripes in the carriageway at every junction
 *    approach. Nothing is emitted above them: a zebra is paint.
 * 5. **Lamps**, then **furniture** — blocks, clipped to sidewalk columns and
 *    kept off the walk lane.
 */
export function dressStreets(
  graph: StreetGraph,
  ctx: StreetscapeContext,
): StreetscapeResult {
  const { plan } = ctx;
  const region = plan.region;
  const states = resolveStreetStates(ctx.stack, ctx.palette);
  const diagnostics: LoamDiagnostic[] = [];
  const blocks: StructureBlock[] = [];
  const props: StreetscapeProp[] = [];

  const driver = ctx.ground ?? driverForPlan(plan);
  const masks = buildStreetMasks(graph, region, ctx.surfaced);
  const band = paveSidewalks(graph, ctx, driver, driver.view("C"), masks, states, ctx.nodePath ?? "");
  thickenCurbs(plan, masks, states);
  const crossingColumns = paintCrossings(graph, plan, masks, states);

  /**
   * Sites every prop this quarter carries, over whatever `masks.y` holds when it
   * is called. On the staged path that is the frozen ground; off it, the plan at
   * this pass's own pipeline position, which is where it has always been.
   */
  const furnish = (): StreetscapeFurnishing => {
    const out: StructureBlock[] = [];
    const laid: StreetscapeProp[] = [];
    const notes: LoamDiagnostic[] = [];
    // Blocked columns: a lamp or a piece of furniture may not share one, and
    // `FURNITURE_MIN_GAP` is measured against it.
    const taken: Cell[] = [];
    if (graph.sidewalk >= LAMP_MIN_SIDEWALK) {
      laid.push(...plantLamps(graph, ctx, masks, out, taken));
    } else {
      notes.push(
        warning(
          "CANNOT_FIT",
          ctx.nodePath ?? "",
          `sidewalk band is ${graph.sidewalk} column wide, so a lamp post would stand in the walk lane`,
          `give the district a sidewalk of ${LAMP_MIN_SIDEWALK} or more to get street lighting`,
        ),
      );
    }
    const kit = ctx.furniture ?? "none";
    if (kit !== "none") {
      laid.push(...scatterFurniture(ctx, masks, kit, out, taken));
    }
    return { blocks: out, props: laid, diagnostics: notes };
  };

  if (!driver.staged) {
    const now = furnish();
    blocks.push(...now.blocks);
    props.push(...now.props);
    diagnostics.push(...now.diagnostics);
    return { blocks, props, masks, crossingColumns, diagnostics };
  }

  // **The staged path**: hold the props back to the building half and hand the
  // caller a closure that re-reads the band's levels from the frozen plan first
  // (v1 §2's `masks.y` row). Nothing else about the pass moves — the paving, the
  // kerbs and the crossings are all material, they belong to the declaring half
  // where they have always been, and they do not care what the level is.
  return {
    blocks,
    props,
    masks,
    crossingColumns,
    diagnostics,
    furnish: () => {
      for (const idx of band) masks.y[idx] = plan.ground[idx] as number;
      return furnish();
    },
  };
}

/* -------------------------------------------------------------------------- */
/* 1 — masks                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Rasterize the graph into carriageway / sidewalk / walk-lane masks.
 *
 * Two passes, and they cannot be one: a column that is sidewalk for the street
 * it flanks and carriageway for the avenue it crosses must come out as
 * carriageway, which is only knowable once *every* carriageway is marked.
 */
export function buildStreetMasks(
  graph: StreetGraph,
  region: Region,
  surfaced?: Uint8Array,
): StreetMasks {
  const n = region.width * region.depth;
  const carriageway = new Uint8Array(n);
  const sidewalk = new Uint8Array(n);
  const walkLane = new Uint8Array(n);
  const curb = new Uint8Array(n);
  const y = new Int32Array(n).fill(UNSET);

  // The surfacer's own answer, first and unconditionally: a column it laid *is*
  // carriageway. See {@link StreetscapeContext.surfaced}.
  if (surfaced !== undefined) {
    for (let k = 0; k < n; k++) if (surfaced[k] === 1) carriageway[k] = 1;
  }

  for (const segment of graph.segments) {
    for (const step of walkStreet(segment.path)) {
      for (const offset of carriagewayOffsets(segment.width)) {
        const c = perp(step, offset);
        if (!inside(region, c.x, c.z)) continue;
        carriageway[index(region, c.x, c.z)] = 1;
      }
    }
  }

  const half = (w: number): number => (w - 1) >> 1;
  for (const segment of graph.segments) {
    const inner = half(segment.width) + 1;
    const outer = inner + graph.sidewalk - 1;
    for (const step of walkStreet(segment.path)) {
      for (const side of [1, -1]) {
        for (let k = inner; k <= outer; k++) {
          const c = perp(step, side * k);
          if (!inside(region, c.x, c.z)) continue;
          const idx = index(region, c.x, c.z);
          if (carriageway[idx] === 1) continue;
          sidewalk[idx] = 1;
          // The innermost column of the band is the reserved clear lane.
          if (k === inner) walkLane[idx] = 1;
        }
      }
    }
  }

  return { carriageway, sidewalk, walkLane, curb, y };
}

/* -------------------------------------------------------------------------- */
/* 2, 3 — sidewalks and curbs                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Pave the sidewalk bands: declare the band, commit it, then dress it.
 *
 * A sidewalk column takes the Y of the carriageway it flanks, so the band is
 * flush with the road it belongs to rather than following the field beside it.
 * **Where that Y comes from is inversion I6** (§3.8b, §4.4): from the flanking
 * segment's {@link ArcLevels} at the band column's own arc station, which is the
 * number the surfacer graded the carriageway to — not from a second read of
 * `plan.ground` at a centre cell one or two cross-sections away. It is strictly a
 * bug fix; it is an "inversion" only in that it changes worlds, and it changes
 * them in the direction every walk asked for.
 *
 * Two columns are never claimed:
 *
 * - anything wet, or anything **next to** something wet — the fluid invariant
 *   `roads.ts` states at `blendShoulders`: moving a dry column beside a river
 *   opens a face the river flows into on the first tick;
 * - anything the carriageway already owns.
 *
 * `street.sidewalk` is rank 90, below `street.network`: a sidewalk is
 * definitionally the carriageway's level and can never outrank the thing it
 * copies. `transition: "step"` — the kerb *is* the transition, and the resolver
 * derives it.
 *
 * The curb decision stays here and stays what it was: a column is curbed when its
 * own ground was already within {@link CURB_LEVEL_TOLERANCE} of the road. §10
 * replaces that test with "is there a `step` transition here" from the resolver's
 * list, and §9a.7 is explicit that consuming `resolved.transitions` is WP-6 work
 * in every case — a transition derived against a partial owner field is not the
 * transition the full set produces.
 */
function paveSidewalks(
  graph: StreetGraph,
  ctx: StreetscapeContext,
  driver: GroundDriver,
  view: GroundView,
  masks: StreetMasks,
  states: StreetStates,
  nodePath: string,
): readonly number[] {
  const plan = ctx.plan;
  const region = plan.region;
  const half = (w: number): number => (w - 1) >> 1;

  /** One claimed band column, kept for the dress loop that follows the commit. */
  interface Band {
    readonly idx: number;
    /** The level the **last** segment to reach this column asked for. */
    y: number;
    /**
     * Did *any* flanking segment see this as its own flush inner column?
     *
     * An OR, and the last-write-wins `surface` below is not — which looks like an
     * inconsistency and is the rule the pass has always kept. A column can be one
     * street's kerb line and another's outer band; the kerb *course* is a
     * continuous line and loses its meaning if a crossing street erases a stretch
     * of it, so the mask ORs. `thickenCourse` then closes the course, and its
     * repaint is what makes the surface agree.
     */
    curbAny: boolean;
    /** The last segment's answer, which is what paints the column. */
    curbLast: boolean;
  }
  // Keyed by column, last claim winning, because two segments' bands overlap at
  // a junction and the pass's own traversal is last-write-wins. One intent per
  // district, so a column named twice would be `LOAM-E494` rather than a choice.
  const band = new Map<number, Band>();

  for (const segment of graph.segments) {
    // Qualified by this quarter's own node path, because a segment id alone is
    // only unique inside the form that drew it: every `grid` quarter names its
    // runs `ns0…`/`ew0…`, so on an unqualified key the *other* district's frames
    // answered here and the band was graded to the other island's level.
    const arc = ctx.levels?.get(`street:${qualifySegmentId(segment.id, nodePath)}`);
    const inner = half(segment.width) + 1;
    const outer = inner + graph.sidewalk - 1;
    for (const step of walkStreet(segment.path)) {
      const centre = inside(region, step.x, step.z)
        ? (view.ground[index(region, step.x, step.z)] as number)
        : undefined;
      if (centre === undefined) continue;
      for (const side of [1, -1]) {
        for (let k = inner; k <= outer; k++) {
          const c = perp(step, side * k);
          if (!inside(region, c.x, c.z)) continue;
          const idx = index(region, c.x, c.z);
          if (masks.carriageway[idx] === 1) continue;
          if (masks.sidewalk[idx] !== 1) continue;
          if (plan.fluidKind[idx] !== FluidKind.NONE) continue;
          if (touchesFluid(plan, c.x, c.z)) continue;

          const natural = view.ground[idx] as number;
          // `ROAD_SOVEREIGN` item 1, for the kerb and the band: a sidewalk is a
          // surfacing, so it replaces the top block at **its own** column's
          // resolved ground rather than inheriting the flanking carriageway's
          // arc-station level. Under the flag that carriageway has no level of
          // its own to inherit — it is draped on the same ground — so taking
          // the arc here would be the band re-levelling itself off a number
          // that no longer describes anything.
          const y = (ctx.sovereign ?? ROAD_SOVEREIGN)
            ? natural
            : arc === undefined
              ? centre
              : arc.levels.at(projectToLine({ x: c.x, z: c.z }, arc.frame.line, arc.frame.arcs).arc);
          const curb = k === inner && Math.abs(natural - centre) <= CURB_LEVEL_TOLERANCE;
          const prior = band.get(idx);
          if (prior === undefined) {
            band.set(idx, { idx, y, curbAny: curb, curbLast: curb });
          } else {
            prior.y = y;
            prior.curbAny = prior.curbAny || curb;
            prior.curbLast = curb;
          }
        }
      }
    }
  }
  if (band.size === 0) return [];

  const columns: GroundClaim[] = [];
  for (const c of band.values()) columns.push({ idx: c.idx, y: c.y });
  driver.commit([
    {
      source: `${nodePath}#sidewalk`,
      sourceClass: "street.sidewalk",
      kind: "profile",
      columns,
      transition: "step",
    },
  ]);

  // §9 step 2's second loop, over the columns the pass **claimed** rather than
  // the ones it won: ownership decides geometry and deliberately not material.
  // `masks.y` is the one exception and has to be — it is where a lamp stands, so
  // it reads the view (§9 step 9), which is the winner's level on a contested
  // column and the sidewalk's own everywhere else.
  for (const c of band.values()) {
    plan.surface[c.idx] = c.curbLast ? states.curb : states.sidewalk;
    // Same guard as the carriageway's (see `presentsExposedFace`): the sidewalk
    // band along the lip of a cut must not repaint the substrate of a column
    // whose exposed side was finished as revetment, or the face below the kerb
    // shows courses of raw dirt. The paving still goes down; `soil` is raised
    // and never shortened, so an earlier `deepen` keeps its depth.
    const cx = region.x0 + (c.idx % region.width);
    const cz = region.z0 + Math.floor(c.idx / region.width);
    if (!presentsExposedFace(plan, region, cx, cz)) {
      plan.subsurface[c.idx] = states.subsurface;
      if ((plan.soil[c.idx] as number) === 0) plan.soil[c.idx] = 1;
    }
    masks.y[c.idx] = view.ground[c.idx] as number;
    if (c.curbAny) masks.curb[c.idx] = 1;
  }
  return [...band.keys()];
}

/**
 * Close the curb line where a diagonal street left it a sawtooth.
 *
 * {@link paveSidewalks} lays the curb one column wide, which is right on an
 * axis-aligned street and impossible on a diagonal one: a one-column course
 * along a 45° line touches its neighbours only at the corners, so what should
 * be a coping line rasterizes as an in-out-in-out zigzag — the defect reported
 * at the headline city's gorge lip. {@link thickenCourse} recruits one bridging
 * column at each corner contact, always the one further from the carriageway,
 * so the course thickens **into the sidewalk** and never eats a lane of road.
 *
 * Only columns this pass already paved as sidewalk are eligible, so the curb
 * cannot spill onto a lot, into water, or across a junction.
 */
function thickenCurbs(plan: ColumnPlan, masks: StreetMasks, states: StreetStates): void {
  const region = plan.region;
  /** How many of the eight neighbours are carriageway — small means outward. */
  const roadPressure = (x: number, z: number): number => {
    let n = 0;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!inside(region, x + dx, z + dz)) continue;
        if (masks.carriageway[index(region, x + dx, z + dz)] === 1) n++;
      }
    }
    return n;
  };

  const added = thickenCourse(
    region,
    masks.curb,
    (idx) =>
      masks.sidewalk[idx] === 1 &&
      masks.carriageway[idx] !== 1 &&
      (masks.y[idx] as number) !== UNSET &&
      plan.fluidKind[idx] === FluidKind.NONE &&
      plan.surface[idx] === states.sidewalk,
    (_idx, x, z) => -roadPressure(x, z),
  );
  if (added === 0) return;

  for (let idx = 0; idx < masks.curb.length; idx++) {
    if (masks.curb[idx] !== 1) continue;
    if (plan.surface[idx] === states.sidewalk) plan.surface[idx] = states.curb;
  }
}

/** True when this column, or any of its eight neighbours, holds fluid. */
function touchesFluid(plan: ColumnPlan, x: number, z: number): boolean {
  const region = plan.region;
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx;
      const zz = z + dz;
      if (!inside(region, xx, zz)) continue;
      if (plan.fluidKind[index(region, xx, zz)] !== FluidKind.NONE) return true;
    }
  }
  return false;
}

/* -------------------------------------------------------------------------- */
/* 4 — crossings                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Paint a striped crossing band across every approach to every intersection.
 *
 * An *approach* is one direction a segment leaves a junction in; a street that
 * runs through gets two, a street that ends there gets one. The band sits
 * `CROSSING_SETBACK` columns clear of the junction square, is
 * {@link CROSSING_DEPTH} columns deep along the approach, and alternates pale
 * and dark across the carriageway.
 *
 * It writes `plan.surface` only. No height moves and no block is emitted: a
 * zebra is paint, and paint that changes the walking level is a trip hazard
 * the physics lint would rightly flag.
 */
export function paintCrossings(
  graph: StreetGraph,
  plan: ColumnPlan,
  masks: StreetMasks,
  states: StreetStates,
): number {
  const region = plan.region;
  const byId = new Map(graph.segments.map((s) => [s.id, s]));
  let painted = 0;

  for (const junction of graph.intersections) {
    for (const id of junction.segments) {
      const segment = byId.get(id);
      if (segment === undefined) continue;
      const cells = walkStreet(segment.path);
      // Nearest cell of this segment to the junction, by Manhattan distance —
      // ties broken by index, so the choice is order-free.
      let best = -1;
      let bestD = Infinity;
      for (const [i, cell] of cells.entries()) {
        const d = Math.abs(cell.x - junction.x) + Math.abs(cell.z - junction.z);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      if (best < 0) continue;
      const widest = Math.max(
        ...junction.segments.map((s) => byId.get(s)?.width ?? segment.width),
      );
      const clear = ((widest - 1) >> 1) + CROSSING_SETBACK;

      for (const dir of [1, -1]) {
        for (let d = 0; d < CROSSING_DEPTH; d++) {
          const i = best + dir * (clear + 1 + d);
          const step = cells[i];
          if (step === undefined) continue;
          for (const offset of carriagewayOffsets(segment.width)) {
            const c = perp(step, offset);
            if (!inside(region, c.x, c.z)) continue;
            const idx = index(region, c.x, c.z);
            if (masks.carriageway[idx] !== 1) continue;
            if (plan.fluidKind[idx] !== FluidKind.NONE) continue;
            // Stripe across the carriageway, not along it, so the band reads
            // as a zebra from a car's eye view and not as lane markings.
            const stripe =
              ((offset % CROSSING_STRIPE_PERIOD) + CROSSING_STRIPE_PERIOD) %
              CROSSING_STRIPE_PERIOD;
            plan.surface[idx] = stripe === 0 ? states.pale : states.dark;
            painted++;
          }
        }
      }
    }
  }
  return painted;
}

/* -------------------------------------------------------------------------- */
/* 5 — lamps and furniture                                                     */
/* -------------------------------------------------------------------------- */

/** Chebyshev distance to the nearest already-planted object. */
function tooClose(
  taken: readonly Cell[],
  x: number,
  z: number,
  gap: number,
): boolean {
  for (const c of taken) {
    if (Math.abs(c.x - x) < gap && Math.abs(c.z - z) < gap) return true;
  }
  return false;
}

/**
 * Emit one prop's ops at a sidewalk column — **whole, or not at all**.
 *
 * Two hard rules hold either way: **no op ever lands on a carriageway cell**,
 * and **nothing floats** — every op sits over a column this pass paved to a
 * known, flat Y. What changed (2026-08-07) is what happens when a declared box
 * overhangs the band: it used to lose the overhanging columns, which is fine
 * for a solid footprint and wrong for a disjoint one, and left bollard rows and
 * bicycle racks as loose wall blocks. Now the prop is refused instead.
 *
 * Returns `undefined` when the anchor column itself is unusable, so the caller
 * can simply skip.
 */
function emitProp(
  ctx: StreetscapeContext,
  masks: StreetMasks,
  prop: PropName,
  originX: number,
  originZ: number,
  anchor: Cell,
  yaw: 0 | 90 | 180 | 270,
  keepLocalFloor: boolean,
  out: StructureBlock[],
): StreetscapeProp | undefined {
  const plan = ctx.plan;
  const region = plan.region;
  if (!inside(region, anchor.x, anchor.z)) return undefined;
  const anchorIdx = index(region, anchor.x, anchor.z);
  if (masks.sidewalk[anchorIdx] !== 1) return undefined;
  if ((masks.y[anchorIdx] as number) === UNSET) return undefined;
  if (plan.fluidKind[anchorIdx] !== FluidKind.NONE) return undefined;
  const baseY = masks.y[anchorIdx] as number;

  const generated = generateProp({
    prop,
    seed: streamSeed(ctx.seed, `streetscape.${prop}.${anchor.x}.${anchor.z}`),
    params: {},
  });
  const [sizeX, , sizeZ] = generated.meta.size;
  const ops = rotateOps(generated.ops, yaw, sizeX, sizeZ);

  // All or nothing against foreign ops: clipping single columns is fine for
  // the masks (a pad row lost to the carriageway is invisible) but a prop
  // half-overwritten by a building's apron fixture is a support-chain finding.
  if (ctx.avoid !== undefined) {
    for (const op of ops as readonly LocalVoxelOp[]) {
      if (op.y === 0 && !keepLocalFloor) continue;
      if (ctx.avoid(originX + op.x, originZ + op.z)) return undefined;
    }
  }

  // Whole or not at all. Clipping *columns* was the old rule, and it is only
  // defensible for a prop whose footprint is solid: a bench with its end cropped
  // is a shorter bench. It is indefensible for a prop whose standing columns are
  // **disjoint** — a bollard row or a bicycle rack is a rhythm of separate posts
  // over a shared pad, so dropping the columns that overhang the band leaves
  // stray wall blocks standing in the street with nothing between them. Since no
  // caller can tell the two shapes apart from the outside, the rule is the same
  // for every prop: gather the ops first, and if a single one of them cannot
  // land, place none of it. What this costs is dressing on the narrowest bands;
  // what it buys is that everything placed is a whole object.
  const landed: StructureBlock[] = [];
  for (const op of ops as readonly LocalVoxelOp[]) {
    // The prop's own paved pad is dropped: the sidewalk *is* the pad, and
    // laying a second course on top of it would raise the object one block
    // and leave a lip beside the walk lane. `baseY` is therefore the sidewalk
    // surface itself, and local `y = 1` stands directly on it. A dropped pad op
    // is not a *missing* column, so it never fails the whole-prop test.
    if (!keepLocalFloor && op.y === 0) continue;
    const x = originX + op.x;
    const z = originZ + op.z;
    if (!inside(region, x, z)) return undefined;
    const idx = index(region, x, z);
    if (masks.sidewalk[idx] !== 1) return undefined;
    if (masks.walkLane[idx] === 1) return undefined;
    if ((masks.y[idx] as number) !== baseY) return undefined;
    const stateId = resolveOpState(ctx.stack, op);
    // An unresolvable block state is a catalog fault, not a site fault: it would
    // hole the prop wherever it stood, so refusing the site would refuse every
    // site. Skip the op, exactly as before.
    if (stateId === undefined) continue;
    landed.push({ x, y: baseY + op.y, z, stateId });
  }
  const count = landed.length;
  for (const block of landed) out.push(block);
  if (count === 0) return undefined;
  return { prop, x: originX, z: originZ, baseY, yaw, blockCount: count };
}

/** Resolve one op to a block state, preferring its property map. */
function resolveOpState(
  stack: PrismarineStack,
  op: LocalVoxelOp,
): number | undefined {
  if (op.props !== undefined) {
    const withProps = stack.blockStateOf(op.block, op.props);
    if (withProps !== undefined) return withProps;
  }
  return stack.blockByName(op.block)?.stateId;
}

/**
 * Plant lamp posts along every street.
 *
 * Placement is a *distance* along the centre line, not an index into the cell
 * list, so a street that bends keeps its rhythm through the corner. Sides
 * alternate — lamp `n` on the left, `n + 1` on the right — which is what a real
 * street does and what keeps a narrow lane from becoming an avenue of posts.
 *
 * The post itself stands on the **outer** sidewalk column, so the walk lane
 * against the curb is never obstructed, and it is only planted where that
 * column is solid, dry and paved by this pass.
 */
export function plantLamps(
  graph: StreetGraph,
  ctx: StreetscapeContext,
  masks: StreetMasks,
  out: StructureBlock[],
  taken: Cell[],
): StreetscapeProp[] {
  const placed: StreetscapeProp[] = [];
  const foot = propFootprint("lamp_post" as PropName, {});
  const [sizeX, , sizeZ] = foot.size;
  const half = (w: number): number => (w - 1) >> 1;

  // Two rules, both of them about world distance rather than about segments.
  // The spacing is set once for the whole district from its street length and
  // its building count, and a run too short to hold a rhythm carries no lamp at
  // all — it is lit by the street it joins.
  const walked = graph.segments.map((s) => walkStreet(s.path));
  const streetCells = walked.reduce((n, cells) => n + cells.length, 0);
  const spacing = lampSpacing(streetCells, ctx.buildings);

  for (const [s, segment] of graph.segments.entries()) {
    const cells = walked[s] as Step[];
    if (cells.length < LAMP_MIN_RUN) continue;
    const outer = half(segment.width) + graph.sidewalk;
    let lamp = 0;
    for (let i = spacing >> 1; i < cells.length; i += spacing) {
      const step = cells[i] as Step;
      const side = lamp % 2 === 0 ? 1 : -1;
      lamp++;
      const anchor = perp(step, side * outer);
      if (tooClose(taken, anchor.x, anchor.z, FURNITURE_MIN_GAP)) continue;
      // The 3×3 pad is centred on the anchor: local (1, 1) is the post, so the
      // post stands on the outer sidewalk column and the pad's inner row falls
      // on the band beside it (clipped away if it would not).
      const originX = anchor.x - ((sizeX - 1) >> 1);
      const originZ = anchor.z - ((sizeZ - 1) >> 1);
      const yaw =
        step.dx !== 0 ? (side === 1 ? 0 : 180) : side === 1 ? 90 : 270;
      const prop = emitProp(
        ctx,
        masks,
        "lamp_post" as PropName,
        originX,
        originZ,
        anchor,
        yaw,
        false,
        out,
      );
      if (prop === undefined) continue;
      placed.push(prop);
      taken.push({ x: anchor.x, z: anchor.z });
    }
  }
  return placed;
}

/**
 * Scatter district furniture along the sidewalks by positional hash.
 *
 * Every decision is keyed on the column: whether a column is dressed at all
 * (`hash2 < density`), and which prop it gets (`hashInt` over the kit). That
 * makes the scatter a pure function of position — recompiling the same
 * district, or compiling a bigger region around it, produces the same benches
 * in the same places.
 *
 * Three things it never does: dress the walk lane (that is the whole point of
 * reserving it), dress a column within {@link FURNITURE_MIN_GAP} of another
 * object, or dress a column the sidewalk pass did not pave.
 */
export function scatterFurniture(
  ctx: StreetscapeContext,
  masks: StreetMasks,
  kit: Exclude<FurnitureKit, "none">,
  out: StructureBlock[],
  taken: Cell[],
): StreetscapeProp[] {
  const region = ctx.plan.region;
  const seed = detailSeed(ctx.seed, "streetscape.furniture");
  const density =
    kit === "downtown" ? FURNITURE_DENSITY_DOWNTOWN : FURNITURE_DENSITY_VILLAGE;
  const catalog = kit === "downtown" ? DOWNTOWN_FURNITURE : VILLAGE_FURNITURE;
  const placed: StreetscapeProp[] = [];

  // Column-major traversal over the region: the *order* only affects which of
  // two neighbours wins the min-gap race, and it is fixed, so the result is
  // still a pure function of the inputs.
  for (let j = 0; j < region.depth; j++) {
    for (let i = 0; i < region.width; i++) {
      const idx = j * region.width + i;
      if (masks.sidewalk[idx] !== 1) continue;
      if (masks.walkLane[idx] === 1) continue;
      if ((masks.y[idx] as number) === UNSET) continue;
      const x = region.x0 + i;
      const z = region.z0 + j;
      if (hash2(seed, x, z, 1) >= density) continue;
      if (tooClose(taken, x, z, FURNITURE_MIN_GAP)) continue;
      const prop = catalog[
        hashInt(seed, x, z, 2, 0, catalog.length - 1)
      ] as PropName;
      const yaw = ([0, 90, 180, 270] as const)[hashInt(seed, x, z, 3, 0, 3)] as
        | 0
        | 90
        | 180
        | 270;
      const emitted = emitProp(
        ctx,
        masks,
        prop,
        x,
        z,
        { x, z },
        yaw,
        true,
        out,
      );
      if (emitted === undefined) continue;
      placed.push(emitted);
      taken.push({ x, z });
    }
  }
  return placed;
}
