/**
 * `prop.place@0` — placement and emit.
 *
 * The grammar in `@terrainist/stdlib` builds a prop in node-local space and
 * knows nothing about the world it will stand in. This module is the other
 * half: it turns a node's coarse placement params into a column, finds ground
 * (or water) that the prop actually fits on, rotates the ops by the chosen
 * yaw, translates them into the world, resolves every (name, props) pair
 * through the version-pinned block table, and carries a pier's piles down to
 * the bed.
 *
 * ## Why placement lives here and not in the solver
 *
 * A prop is small and its constraint is *local and physical* — "on still
 * water", "on flat ground", "at the end of that pier". The layout solver
 * places things whose constraint is social: this building near that one, this
 * plaza in the middle. Feeding nine one-block-tall props through the solver
 * would cost a full anneal to answer a question a spiral search answers
 * exactly. So `prop.place@0` takes the same *coarse vocabulary* every profile
 * node speaks (`zone`, `at`) to pick a target column, and then resolves the
 * physical part itself.
 *
 * The search is a spiral ordered by squared distance, then z, then x — a total
 * order on columns, so the site a prop lands on is a pure function of the plan
 * and the target, with no dependence on iteration order.
 *
 * ## Fluid safety
 *
 * {@link checkPropFluidSafety} re-derives the two claims the grammar makes:
 * that no prop writes air into a water column, and that every water block a
 * prop *does* write is enclosed — solid or water on all four sides and solid
 * below. It reads the emitted blocks and the column plan, so it catches a
 * grammar change that breaks the invariant even when the plan-side
 * `checkFluidStability` cannot see it (the plan does not know the boat is
 * there).
 */

import {
  PROP_NAMES,
  generateProp,
  isPropName,
  propFootprint,
  resolvePropPalette,
  rotateLocalColumn,
  rotateOps,
  type BuildingMaterials,
  type LocalVoxelOp,
  type PropBase,
  type PropName,
  type Seed256,
  type StructureYaw,
} from "@terrainist/stdlib";
import { Rng, streamSeed } from "@terrainist/stdlib";
import { error, warning, type LoamDiagnostic } from "@terrainist/spec";
import { isZoneToken } from "../layout/frames.js";
import { jitteredZonePoint, type Frame, type Point2, type Rect } from "../layout/frames.js";
import type { OccupancyGrid } from "../layout/types.js";
import type { PrismarineStack } from "../emit/prismarine.js";
import { FluidKind, type ColumnPlan } from "../terrain/columns.js";

import type { StructureBlock } from "./buildings.js";

/** How far from its target column a prop will look for a site it fits on. */
export const PROP_SEARCH_RADIUS = 48;

/** Deepest a pier pile is driven before the placer gives up on the column. */
export const MAX_PILE_DEPTH = 24;

/** Ground unevenness a land prop tolerates under its footprint, in blocks. */
export const PROP_MAX_RELIEF = 1;

/** One prop the compiler is asked to materialize. */
export interface PropJob {
  readonly nodePath: string;
  /** The `prop` param — a name from the catalog. */
  readonly prop: string;
  /** The rest of the node's params: coarse placement plus the prop's own. */
  readonly params: Readonly<Record<string, unknown>>;
  readonly seed: Seed256;
  /** The theme triple this prop was dealt, if the caller assigned one. */
  readonly materials?: BuildingMaterials;
  readonly style?: Readonly<Record<string, string>>;
}

/** Where one prop ended up. */
export interface PlacedProp {
  readonly nodePath: string;
  readonly prop: PropName;
  readonly yaw: StructureYaw;
  /** The world footprint, inclusive. */
  readonly footprint: Rect;
  /** World Y of local `y = 0`. */
  readonly baseY: number;
  readonly base: PropBase;
  readonly blockCount: number;
  /** Where another prop may moor: a pier's seaward end, in world columns. */
  readonly anchor?: Point2;
}

/** Everything {@link buildProps} reads. */
export interface PropPassInput {
  readonly jobs: readonly PropJob[];
  readonly plan: ColumnPlan;
  readonly stack: PrismarineStack;
  /** Claimed under the `prop` and `structure` tags when present. */
  readonly occupancy?: OccupancyGrid;
  /**
   * Footprints already taken by earlier passes, which a prop may not land on.
   * The building pass's footprints, in practice.
   */
  readonly reserved?: readonly Rect[];
}

/** What the prop pass produced. */
export interface PropPassResult {
  readonly blocks: readonly StructureBlock[];
  readonly placed: readonly PlacedProp[];
  readonly diagnostics: readonly LoamDiagnostic[];
}

/* -------------------------------------------------------------------------- */
/* the pass                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Materialize every prop, in document order.
 *
 * Order matters in one direction only: a pier placed earlier is an anchor a
 * later `at: "pier"` boat can moor to, which is the whole reason the two are
 * separate props rather than one composite.
 */
export function buildProps(input: PropPassInput): PropPassResult {
  const { plan, stack } = input;
  const blocks: StructureBlock[] = [];
  const placed: PlacedProp[] = [];
  const diagnostics: LoamDiagnostic[] = [];
  const missing = new Set<string>();
  const taken: Rect[] = [...(input.reserved ?? [])];

  for (const job of input.jobs) {
    if (!isPropName(job.prop)) {
      diagnostics.push(
        error(
          "STRUCTURE_PARAM",
          job.nodePath,
          `prop.place@0 does not know a prop called ${JSON.stringify(job.prop)}`,
          `use one of: ${PROP_NAMES.join(", ")}`,
        ),
      );
      continue;
    }
    const site = planPropPlacement({
      prop: job.prop,
      params: job.params,
      seed: job.seed,
      plan,
      taken,
      anchors: placed,
    });
    if (site === undefined) {
      diagnostics.push(
        warning(
          "CANNOT_FIT",
          job.nodePath,
          `no site within ${PROP_SEARCH_RADIUS} blocks fits the ${job.prop}`,
          propFootprint(job.prop, job.params).base === "water"
            ? 'point it at open water — widen the lake, or give the node an "at" that is already on it'
            : "flatten the ground near its target, or move the node with a coarse zone/at param",
        ),
      );
      continue;
    }

    const generated = generateProp({
      prop: job.prop,
      seed: job.seed,
      params: job.params,
      ...(job.materials === undefined ? {} : { materials: job.materials }),
      ...(job.style === undefined ? {} : { style: job.style }),
    });
    const [sizeX, , sizeZ] = generated.meta.size;
    const rotated = rotateOps(generated.ops, site.yaw, sizeX, sizeZ);

    let count = 0;
    for (const op of rotated) {
      const stateId = resolveState(stack, op, missing);
      if (stateId === undefined) continue;
      blocks.push({
        x: site.footprint.x0 + op.x,
        y: site.baseY + op.y,
        z: site.footprint.z0 + op.z,
        stateId,
      });
      count++;
    }
    count += drivePiles(generated.meta.piles, generated.meta, site, plan, stack, job, blocks);

    const anchorLocal = generated.meta.anchor;
    const anchor =
      anchorLocal === undefined
        ? undefined
        : rotateLocalColumn(anchorLocal.x, anchorLocal.z, sizeX, sizeZ, site.yaw);

    placed.push({
      nodePath: job.nodePath,
      prop: job.prop,
      yaw: site.yaw,
      footprint: site.footprint,
      baseY: site.baseY,
      base: generated.meta.base,
      blockCount: count,
      ...(anchor === undefined
        ? {}
        : { anchor: { x: site.footprint.x0 + anchor.x, z: site.footprint.z0 + anchor.z } }),
    });
    taken.push(site.footprint);
    if (input.occupancy !== undefined) claim(input.occupancy, site.footprint);
  }

  for (const name of [...missing].sort()) {
    diagnostics.push(
      warning(
        "BAD_PALETTE",
        "",
        `prop.place@0 wanted block "${name}", which does not exist in ${stack.minecraftVersion}`,
        `override the symbol that names "${name}" with a block id that exists in Minecraft ${stack.minecraftVersion}`,
      ),
    );
  }

  return { blocks, placed, diagnostics };
}

/* -------------------------------------------------------------------------- */
/* placement                                                                   */
/* -------------------------------------------------------------------------- */

/** A site a prop fits on. */
export interface PropSite {
  readonly footprint: Rect;
  readonly baseY: number;
  readonly yaw: StructureYaw;
}

/** Everything {@link planPropPlacement} reads. */
export interface PropPlacementInput {
  readonly prop: PropName;
  readonly params: Readonly<Record<string, unknown>>;
  readonly seed: Seed256;
  readonly plan: ColumnPlan;
  /** Footprints already claimed; a prop never lands on one. */
  readonly taken?: readonly Rect[];
  /** Props already placed, for `at: "pier"`. */
  readonly anchors?: readonly PlacedProp[];
}

/**
 * Resolve a prop's coarse params to a concrete site, or `undefined`.
 *
 * The coarse vocabulary is the profile's, deliberately: `zone` names one of
 * the nine cells of the region, jittered off the node's own `coarse` stream
 * exactly as §4.9.3 does; `at` is either an explicit `{x, z}` or the token
 * `"pier"`, which means "the seaward end of the nearest pier already placed".
 * Neither ever appears in an authored document as an absolute coordinate
 * unless the author insists.
 *
 * `yaw` may be given; otherwise it is drawn from the node's `yaw` stream,
 * except for a pier, whose yaw is the direction the water is in and is not a
 * matter of taste.
 */
export function planPropPlacement(input: PropPlacementInput): PropSite | undefined {
  const { plan, prop, params } = input;
  const foot = propFootprint(prop, params);
  const target = coarseTarget(input);
  const yawParam = readYaw(params["yaw"]);

  if (foot.base === "shore") {
    return placeShore(input, foot, target, yawParam);
  }

  const yaws: readonly StructureYaw[] =
    yawParam === undefined
      ? [drawYaw(input.seed)]
      : [yawParam];

  for (const column of spiral(target, PROP_SEARCH_RADIUS)) {
    for (const yaw of yaws) {
      const [w, d] = rotatedExtents(foot.size, yaw);
      const rect: Rect = { x0: column.x, z0: column.z, x1: column.x + w - 1, z1: column.z + d - 1 };
      if (overlapsTaken(rect, input.taken)) continue;
      const baseY = foot.base === "water" ? waterBase(plan, rect) : groundBase(plan, rect);
      if (baseY === undefined) continue;
      return { footprint: rect, baseY, yaw };
    }
  }
  return undefined;
}

/**
 * The column a prop aims at, before it looks at what is actually there.
 *
 * Priority: an explicit `at`, then `at: "pier"`, then `zone`, then the middle
 * of the region.
 */
function coarseTarget(input: PropPlacementInput): Point2 {
  const { plan, params } = input;
  const frame: Frame = {
    x0: plan.region.x0,
    z0: plan.region.z0,
    width: plan.region.width,
    depth: plan.region.depth,
  };
  const centre: Point2 = {
    x: frame.x0 + (frame.width >> 1),
    z: frame.z0 + (frame.depth >> 1),
  };

  const at = params["at"];
  if (typeof at === "object" && at !== null) {
    const point = at as { x?: unknown; z?: unknown };
    if (typeof point.x === "number" && typeof point.z === "number") {
      return { x: Math.round(point.x), z: Math.round(point.z) };
    }
  }
  if (at === "pier") {
    const piers = (input.anchors ?? []).filter((p) => p.anchor !== undefined);
    if (piers.length > 0) {
      // Nearest pier end to the region centre — a total order, so which pier a
      // boat moors at does not depend on the order the anchors arrived in.
      let best = piers[0] as PlacedProp;
      for (const candidate of piers) {
        if (compareByDistance(candidate.anchor as Point2, best.anchor as Point2, centre) < 0) {
          best = candidate;
        }
      }
      return best.anchor as Point2;
    }
  }
  const zone = params["zone"];
  if (typeof zone === "string" && isZoneToken(zone)) {
    const jitter = typeof params["jitter"] === "number" ? params["jitter"] : 0.15;
    return jitteredZonePoint(frame, zone, jitter, streamSeed(input.seed, "coarse"), 0);
  }
  return centre;
}

/** Order two anchors by distance to a point, then by column, for stability. */
function compareByDistance(a: Point2, b: Point2, to: Point2): number {
  const da = (a.x - to.x) ** 2 + (a.z - to.z) ** 2;
  const db = (b.x - to.x) ** 2 + (b.z - to.z) ** 2;
  return da - db || a.z - b.z || a.x - b.x;
}

/** A yaw param, when it is one of the four legal quarter turns. */
function readYaw(raw: unknown): StructureYaw | undefined {
  if (raw === 0 || raw === 90 || raw === 180 || raw === 270) return raw;
  return undefined;
}

/** The yaw a prop is dealt when the node does not name one. */
function drawYaw(seed: Seed256): StructureYaw {
  const yaws: readonly StructureYaw[] = [0, 90, 180, 270];
  return yaws[new Rng(streamSeed(seed, "prop.yaw")).int(0, 3)] as StructureYaw;
}

/** Unrotated `[sizeX, sizeZ]` mapped through a yaw. */
export function rotatedExtents(
  size: readonly [number, number, number],
  yaw: StructureYaw,
): [number, number] {
  return yaw === 90 || yaw === 270 ? [size[2], size[0]] : [size[0], size[2]];
}

/**
 * Columns around a target, in a total order: squared distance, then z, then x.
 *
 * Generated rather than sorted — the ring radius bounds the search, and the
 * caller stops at the first fit — but the order is the sort's order, which is
 * what makes two runs agree.
 */
export function* spiral(target: Point2, radius: number): Generator<Point2> {
  const cells: Point2[] = [];
  for (let dz = -radius; dz <= radius; dz++) {
    for (let dx = -radius; dx <= radius; dx++) {
      cells.push({ x: target.x + dx, z: target.z + dz });
    }
  }
  cells.sort((a, b) => compareByDistance(a, b, target));
  for (const cell of cells) yield cell;
}

/** True when a rectangle meets any already-claimed rectangle. */
function overlapsTaken(rect: Rect, taken: readonly Rect[] | undefined): boolean {
  if (taken === undefined) return false;
  return taken.some(
    (r) => !(rect.x1 < r.x0 || rect.x0 > r.x1 || rect.z1 < r.z0 || rect.z0 > r.z1),
  );
}

/** Column index of a world column, or `undefined` outside the region. */
function indexOf(plan: ColumnPlan, x: number, z: number): number | undefined {
  const i = x - plan.region.x0;
  const j = z - plan.region.z0;
  if (i < 0 || j < 0 || i >= plan.region.width || j >= plan.region.depth) return undefined;
  return j * plan.region.width + i;
}

/**
 * The base plane of a land prop, or `undefined` when the ground will not do.
 *
 * Every column has to be dry, inside the region, and within
 * {@link PROP_MAX_RELIEF} of every other — a cart standing half in a hillside
 * is worse than a cart somewhere else. The plane is the *highest* ground under
 * the footprint plus one, so nothing is ever buried.
 */
export function groundBase(plan: ColumnPlan, rect: Rect): number | undefined {
  let lo = Infinity;
  let hi = -Infinity;
  for (let z = rect.z0; z <= rect.z1; z++) {
    for (let x = rect.x0; x <= rect.x1; x++) {
      const idx = indexOf(plan, x, z);
      if (idx === undefined) return undefined;
      if (plan.fluidKind[idx] !== FluidKind.NONE) return undefined;
      const g = plan.ground[idx] as number;
      if (g < lo) lo = g;
      if (g > hi) hi = g;
    }
  }
  if (hi - lo > PROP_MAX_RELIEF) return undefined;
  return hi + 1;
}

/**
 * The base plane of a water prop: the water surface, or `undefined`.
 *
 * Every column has to be water, at the *same* surface level — a boat straddling
 * a lake and a river one block lower would sit in a step — and deep enough for
 * the hull course at `y = -1` to be replacing water rather than the bed.
 */
export function waterBase(plan: ColumnPlan, rect: Rect): number | undefined {
  let top: number | undefined;
  for (let z = rect.z0; z <= rect.z1; z++) {
    for (let x = rect.x0; x <= rect.x1; x++) {
      const idx = indexOf(plan, x, z);
      if (idx === undefined) return undefined;
      if (plan.fluidKind[idx] !== FluidKind.WATER) return undefined;
      const surface = plan.fluidTop[idx] as number;
      if (top === undefined) top = surface;
      else if (top !== surface) return undefined;
      // Two blocks of water: the hull course sits in the lower one.
      if (surface - (plan.ground[idx] as number) < 2) return undefined;
    }
  }
  return top;
}

/**
 * Place a pier: find a dry column with water in front of it, and face that way.
 *
 * The yaw is derived, not drawn. A pier's local `+z` is seaward, so the yaw is
 * whichever quarter turn maps `+z` onto the direction the water is in; a pier
 * facing inland is not a stylistic choice, it is a bug.
 */
function placeShore(
  input: PropPlacementInput,
  foot: { readonly size: readonly [number, number, number]; readonly minY: number },
  target: Point2,
  yawParam: StructureYaw | undefined,
): PropSite | undefined {
  const { plan } = input;
  const length = foot.size[2];
  const width = foot.size[0];
  const yaws: readonly StructureYaw[] =
    yawParam === undefined ? [0, 90, 180, 270] : [yawParam];

  for (const column of spiral(target, PROP_SEARCH_RADIUS)) {
    const shoreIdx = indexOf(plan, column.x, column.z);
    if (shoreIdx === undefined) continue;
    if (plan.fluidKind[shoreIdx] !== FluidKind.NONE) continue;
    const baseY = (plan.ground[shoreIdx] as number) + 1;

    for (const yaw of yaws) {
      // `+z` local maps to this world step under the yaw.
      const [fx, fz] = seawardStep(yaw);
      // Sideways is the local `+x`, which is `+z` turned back a quarter.
      const [sx, sz] = seawardStep(((yaw + 270) % 360) as StructureYaw);
      const cells: { x: number; z: number; z0: number }[] = [];
      let ok = true;
      let wet = 0;
      for (let l = 0; l < length && ok; l++) {
        for (let w = 0; w < width; w++) {
          const x = column.x + fx * l + sx * w;
          const z = column.z + fz * l + sz * w;
          const idx = indexOf(plan, x, z);
          if (idx === undefined) {
            ok = false;
            break;
          }
          cells.push({ x, z, z0: l });
          const water = plan.fluidKind[idx] === FluidKind.WATER;
          if (water) wet++;
          // The landward bay must be dry and the seaward end must be wet: a
          // pier that starts in the lake is a raft, and one that ends on the
          // beach is a boardwalk.
          if (l === 0 && water) ok = false;
          if (l === length - 1 && !water) ok = false;
          // The deck rides one block above the shore, so a column the deck
          // would be *inside* disqualifies the site.
          if (!water && (plan.ground[idx] as number) >= baseY + 1) ok = false;
        }
      }
      if (!ok || wet * 2 < cells.length) continue;
      const xs = cells.map((c) => c.x);
      const zs = cells.map((c) => c.z);
      const rect: Rect = {
        x0: Math.min(...xs),
        z0: Math.min(...zs),
        x1: Math.max(...xs),
        z1: Math.max(...zs),
      };
      if (overlapsTaken(rect, input.taken)) continue;
      return { footprint: rect, baseY, yaw };
    }
  }
  return undefined;
}

/** The world step local `+z` becomes under a yaw. */
function seawardStep(yaw: StructureYaw): [number, number] {
  switch (yaw) {
    case 0:
      return [0, 1];
    case 90:
      return [-1, 0];
    case 180:
      return [0, -1];
    default:
      return [1, 0];
  }
}

/* -------------------------------------------------------------------------- */
/* piles                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Carry a pier's piles down to the bed.
 *
 * The grammar emits the pile *head* at `y = -1` and names the column; how far
 * it is to the bottom is a fact about the world, not about the pier, so it is
 * resolved here. Everything from the head down to one above the ground is
 * filled with the same log the head is made of, which is what stops a pier
 * from reading as a plank floating over open water.
 */
function drivePiles(
  piles: readonly { readonly x: number; readonly z: number }[],
  meta: { readonly size: readonly [number, number, number] },
  site: PropSite,
  plan: ColumnPlan,
  stack: PrismarineStack,
  job: PropJob,
  blocks: StructureBlock[],
): number {
  if (piles.length === 0) return 0;
  const palette = resolvePropPalette(job.materials, job.style);
  const stateId =
    stack.blockStateOf(palette.log, { axis: "y" }) ?? stack.blockByName(palette.log)?.stateId;
  if (stateId === undefined) return 0;
  const [sizeX, , sizeZ] = meta.size;
  let added = 0;
  for (const pile of piles) {
    const local = rotateLocalColumn(pile.x, pile.z, sizeX, sizeZ, site.yaw);
    const x = site.footprint.x0 + local.x;
    const z = site.footprint.z0 + local.z;
    const idx = indexOf(plan, x, z);
    if (idx === undefined) continue;
    const floor = plan.ground[idx] as number;
    // `y = -1` is already written by the grammar; this is the shaft under it.
    const bottom = Math.max(floor + 1, site.baseY - 1 - MAX_PILE_DEPTH);
    for (let y = site.baseY - 2; y >= bottom; y--) {
      blocks.push({ x, y, z, stateId });
      added++;
    }
  }
  return added;
}

/* -------------------------------------------------------------------------- */
/* fluid safety                                                                */
/* -------------------------------------------------------------------------- */

/** One water block a prop wrote that could flow. */
export interface PropWaterLeak {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Which face is open: `down`, or a cardinal. */
  readonly face: string;
}

/** What {@link checkPropFluidSafety} found. */
export interface PropFluidReport {
  /** Water blocks the props wrote. */
  readonly waterBlocks: number;
  /** Of those, the ones with an open face. Zero is required. */
  readonly leaks: readonly PropWaterLeak[];
}

/**
 * Re-derive the prop grammar's fluid claim from the blocks it actually emitted.
 *
 * A prop's water is stable when, for every water block it wrote, the block
 * below and all four horizontal neighbours are *occupied* — by another block
 * this pass wrote, by the plan's solid ground, or by the plan's own water at
 * that level. That is the same test `checkFluidStability` runs against the
 * column plan, applied to the one thing the plan cannot see: blocks stamped on
 * top of it.
 *
 * Props that write no water pass trivially, which is the correct answer: a
 * boat replaces water with wood, and removing water can only ever *reduce* the
 * faces the remaining water has.
 */
export function checkPropFluidSafety(
  blocks: readonly StructureBlock[],
  plan: ColumnPlan,
  stack: PrismarineStack,
): PropFluidReport {
  const occupied = new Set<string>();
  const water: StructureBlock[] = [];
  for (const block of blocks) {
    occupied.add(`${block.x},${block.y},${block.z}`);
    const name = stack.blockNameByStateId(block.stateId);
    if (name === "water") water.push(block);
  }

  const filled = (x: number, y: number, z: number): boolean => {
    if (occupied.has(`${x},${y},${z}`)) return true;
    const idx = indexOf(plan, x, z);
    if (idx === undefined) return true; // outside the world: no face to flow through
    if (y <= (plan.ground[idx] as number)) return true;
    return plan.fluidKind[idx] !== FluidKind.NONE && y <= (plan.fluidTop[idx] as number);
  };

  const leaks: PropWaterLeak[] = [];
  for (const cell of water) {
    if (!filled(cell.x, cell.y - 1, cell.z)) {
      leaks.push({ x: cell.x, y: cell.y, z: cell.z, face: "down" });
      continue;
    }
    for (const [face, dx, dz] of [
      ["north", 0, -1],
      ["east", 1, 0],
      ["south", 0, 1],
      ["west", -1, 0],
    ] as const) {
      if (filled(cell.x + dx, cell.y, cell.z + dz)) continue;
      leaks.push({ x: cell.x, y: cell.y, z: cell.z, face });
      break;
    }
  }
  return { waterBlocks: water.length, leaks };
}

/* -------------------------------------------------------------------------- */

/** Resolve one op to a state id, remembering names the block table refuses. */
function resolveState(
  stack: PrismarineStack,
  op: LocalVoxelOp,
  missing: Set<string>,
): number | undefined {
  if (op.props !== undefined) {
    const withProps = stack.blockStateOf(op.block, op.props);
    if (withProps !== undefined) return withProps;
  }
  const plain = stack.blockByName(op.block);
  if (plain === undefined) {
    missing.add(op.block);
    return undefined;
  }
  return plain.stateId;
}

/** Claim a prop's footprint under the `prop` and `structure` tags. */
function claim(occupancy: OccupancyGrid, rect: Rect): void {
  const { region } = occupancy;
  const tags = occupancy.byTag as Map<string, Uint8Array>;
  let mask = tags.get("prop");
  if (mask === undefined) {
    mask = new Uint8Array(occupancy.mask.length);
    tags.set("prop", mask);
  }
  for (let z = rect.z0; z <= rect.z1; z++) {
    const j = z - region.z0;
    if (j < 0 || j >= region.depth) continue;
    for (let x = rect.x0; x <= rect.x1; x++) {
      const i = x - region.x0;
      if (i < 0 || i >= region.width) continue;
      const idx = j * region.width + i;
      occupancy.mask[idx] = 1;
      mask[idx] = 1;
    }
  }
}
