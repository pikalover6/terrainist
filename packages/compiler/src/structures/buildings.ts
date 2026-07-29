/**
 * `building.grammar@0` — emit integration.
 *
 * The grammar itself lives in `@terrainist/stdlib` and knows nothing about
 * Minecraft: it returns node-local ops carrying block *names* and property
 * maps. This module is the other half — it decides how deep the foundation
 * skirt has to reach, rotates the ops by the solved yaw, translates them into
 * the world, resolves every (name, props) pair to a block state id through the
 * version-pinned block table, and claims the footprint in the occupancy grid so
 * the scatter pass does not grow a tree through a roof.
 *
 * Nothing here writes outside the placed footprint. That is not a convention:
 * the ops are generated inside `[0, sizeX) × [0, sizeZ)` and rotation is a
 * bijection of that box onto the placement's footprint, so the property is
 * structural — and `test/structures.test.ts` asserts it anyway.
 */

import {
  generateBuilding,
  rotateCells,
  rotateOps,
  type BuildingDoor,
  type BuildingMaterials,
  type BuildingMeta,
  type BuildingParams,
  type BuildingWing,
  type Cardinal,
  type LocalVoxelOp,
  type Seed256,
} from "@terrainist/stdlib";
import { warning, type LoamDiagnostic, type PortDeclaration } from "@terrainist/spec";

import type { PrismarineStack } from "../emit/prismarine.js";
import type { Placement } from "../layout/types.js";
import type { Rect } from "../layout/frames.js";
import type { ColumnPlan } from "../terrain/columns.js";

/** One block the structure pass wants written, already resolved. */
export interface StructureBlock {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly stateId: number;
}

/** Deepest foundation skirt this pass will sink, in blocks. */
export const MAX_FOUNDATION_DEPTH = 12;

/** One building the compiler is asked to materialize. */
export interface BuildingJob {
  readonly nodePath: string;
  readonly placement: Placement;
  /** The **unrotated** envelope the solver placed. */
  readonly size: readonly [number, number, number];
  readonly params: BuildingParams;
  /** Declared ports, in declaration order — the `door` one drives the opening. */
  readonly ports: Readonly<Record<string, PortDeclaration>>;
  readonly seed: Seed256;
  readonly tags: readonly string[];
  /** The theme triple this building was dealt, if the caller assigned one. */
  readonly materials?: BuildingMaterials;
  /** Block-id overrides for the grammar's material symbols. */
  readonly style?: Readonly<Record<string, string>>;
}

/** What one building produced. */
export interface BuiltBuilding {
  readonly nodePath: string;
  readonly footprint: Rect;
  /** The enclosed interior, in world columns. */
  readonly interior: Rect;
  readonly meta: BuildingMeta;
  readonly blockCount: number;
  /** World Y of the local `y = 0` plane — the walkable ground floor. */
  readonly floorY: number;
  /** Cellar headroom actually dug, in blocks; 0 when there is none. */
  readonly basementDepth: number;
  /**
   * The cellar's walkable plane in world Y — where a tunnel arriving at this
   * building has to meet it. Absent when the building has no cellar.
   */
  readonly basementFloorY?: number;
  /** The cellar's enclosed interior, in world columns. */
  readonly basementInterior?: Rect;
  /**
   * The columns this building actually covers, as `"x,z"` world keys.
   *
   * Equal to every column of {@link BuiltBuilding.footprint} for a rect plan,
   * and a strict subset of it for an L or a T. Consumers that ask "is this
   * ground built on?" should prefer this to the rect; the rect remains the
   * *envelope*, which is what the solver reserved and the pad levelled.
   */
  readonly cells: ReadonlySet<string>;
}

/** Result of the building pass. */
export interface BuildingPassResult {
  readonly blocks: readonly StructureBlock[];
  readonly built: readonly BuiltBuilding[];
  readonly diagnostics: readonly LoamDiagnostic[];
}

/**
 * Materialize every placed building.
 *
 * Order is the caller's order (document order, via the solver), and every
 * decision inside is either positional or seeded, so two runs agree block for
 * block.
 */
export function buildBuildings(
  jobs: readonly BuildingJob[],
  plan: ColumnPlan,
  stack: PrismarineStack,
): BuildingPassResult {
  const blocks: StructureBlock[] = [];
  const built: BuiltBuilding[] = [];
  const diagnostics: LoamDiagnostic[] = [];
  const missing = new Set<string>();

  // The grammar runs for every job first, because the *true* cells each
  // building covers are an output of the grammar (an L covers less than its
  // envelope) and the apron rule below needs every building's cells before it
  // can place the first block. Generation is pure, so hoisting it changes
  // nothing about what is emitted or in what order.
  const results = jobs.map((job) => {
    const door = doorOf(job.ports);
    return generateBuilding({
      size: job.size,
      params: job.params,
      seed: job.seed,
      foundationDepth: skirtDepth(plan, job.placement),
      ...(door === null ? {} : { door }),
      ...(job.materials === undefined ? {} : { materials: job.materials }),
      ...(job.style === undefined ? {} : { style: job.style }),
    });
  });

  // The grammar's decorations (eaves, shutters, window boxes, the porch lamp)
  // reach one block into the apron outside the footprint. That is fine over
  // open ground and wrong over a neighbour, so an apron op that lands inside
  // *another* building's claim is dropped rather than allowed to punch through
  // its wall. Nothing structural is ever in the apron, so dropping is safe.
  //
  // The claim is the true cell set, not the envelope: over an L's notch there
  // is no wall to punch through, and an eave that reaches into it is over open
  // ground like any other.
  const cellSets = jobs.map((job, k) => worldCells(job, results[k] as ReturnType<typeof generateBuilding>));

  for (const [index, job] of jobs.entries()) {
    const { placement } = job;
    const result = results[index] as ReturnType<typeof generateBuilding>;
    const cells = cellSets[index] as ReadonlySet<string>;

    const [sizeX, , sizeZ] = job.size;
    const cellar = result.meta.basementDepth;
    const rotated = rotateOps(result.ops, placement.yaw, sizeX, sizeZ);
    const [tx, , tz] = placement.translation;
    // Local y = 0 is the walkable floor, which sits one block *above* the
    // levelled ground; the skirt at y = -1 replaces that surface block.
    const floorY = placement.foundationY + 1;

    let count = 0;
    /** Lowest world Y this building put in each apron column, keyed `x,z`. */
    const apronFloor = new Map<string, number>();
    /** The skirt's block state per footprint column, for underpinning. */
    const skirtState = new Map<string, number>();
    for (const op of rotated) {
      const x = tx + op.x;
      const z = tz + op.z;
      const key = `${x},${z}`;
      const inFootprint = cells.has(key);
      if (!inFootprint && cellSets.some((s, k) => k !== index && s.has(key))) continue;
      const stateId = resolveState(stack, op, missing);
      if (stateId === undefined) continue;
      const y = floorY + op.y;
      if (inFootprint) {
        if (op.y === -1) skirtState.set(`${x},${z}`, stateId);
      } else if (op.y <= 0) {
        const known = apronFloor.get(key);
        if (known === undefined || y < known) apronFloor.set(key, y);
      }
      blocks.push({ x, y, z, stateId });
      count++;
    }
    count += underpinApron(plan, placement, apronFloor, skirtState, blocks);

    built.push({
      nodePath: job.nodePath,
      footprint: placement.footprint,
      interior: {
        x0: placement.footprint.x0 + 1,
        z0: placement.footprint.z0 + 1,
        x1: placement.footprint.x1 - 1,
        z1: placement.footprint.z1 - 1,
      },
      meta: result.meta,
      blockCount: count,
      cells,
      floorY,
      basementDepth: cellar,
      ...(cellar === 0
        ? {}
        : {
            basementFloorY: floorY - cellar,
            basementInterior: {
              x0: placement.footprint.x0 + 1,
              z0: placement.footprint.z0 + 1,
              x1: placement.footprint.x1 - 1,
              z1: placement.footprint.z1 - 1,
            },
          }),
    });
  }

  for (const name of [...missing].sort()) {
    diagnostics.push(
      warning(
        "BAD_PALETTE",
        "",
        `building.grammar@0 wanted block "${name}", which does not exist in ${stack.minecraftVersion}`,
        `override the symbol that names "${name}" with a block id that exists in Minecraft ${stack.minecraftVersion}`,
      ),
    );
  }

  return { blocks, built, diagnostics };
}

/* -------------------------------------------------------------------------- */

/** True when `(x, z)` is inside an inclusive rectangle. */
function contains(rect: Rect, x: number, z: number): boolean {
  return x >= rect.x0 && x <= rect.x1 && z >= rect.z0 && z <= rect.z1;
}

/**
 * The world columns one building covers, as `"x,z"` keys.
 *
 * The grammar's cells are node-local and unrotated; the solver's yaw and
 * translation carry them into the world through exactly the transform
 * {@link rotateOps} applies to the ops, so a cell and the block standing on it
 * can never disagree about which building owns the column.
 *
 * For a rect plan this is every column of `placement.footprint` — the same set
 * the old rect test returned — so nothing about a rectangular village moves.
 */
function worldCells(
  job: BuildingJob,
  result: { readonly meta: { readonly cells: readonly { readonly x: number; readonly z: number }[] } },
): ReadonlySet<string> {
  const [sizeX, , sizeZ] = job.size;
  const [tx, , tz] = job.placement.translation;
  const out = new Set<string>();
  for (const c of rotateCells(result.meta.cells, job.placement.yaw, sizeX, sizeZ)) {
    out.add(`${tx + c.x},${tz + c.z}`);
  }
  return out;
}

/**
 * Give every apron block at or below the floor plane ground contact.
 *
 * The footprint gets a foundation skirt sunk to solid ground; the *apron* ring
 * does not, because nothing structural is supposed to be there. The entrance
 * disagrees: the doorstep, the porch and the lamp footings all stand in the
 * apron at the floor plane, and the floor plane is level while the ground under
 * it is not. A render review caught the result at a doorstep corner — a step
 * with daylight under it, which reads as a floating slab from every angle.
 *
 * The rule is the skirt's rule, applied one ring out: fill each such column
 * downward with the same foundation material the adjacent wall stands on, until
 * it meets the ground. Capped at {@link MAX_FOUNDATION_DEPTH} so a porch beside
 * a cliff builds a plinth rather than a pillar to bedrock. Returns the block
 * count added.
 */
function underpinApron(
  plan: ColumnPlan,
  placement: Placement,
  apronFloor: ReadonlyMap<string, number>,
  skirtState: ReadonlyMap<string, number>,
  blocks: StructureBlock[],
): number {
  const { region, ground } = plan;
  const rect = placement.footprint;
  let added = 0;
  // Sorted so the emitted order is a pure function of the geometry, not of Map
  // insertion order.
  for (const key of [...apronFloor.keys()].sort()) {
    const [x, z] = key.split(",").map(Number) as [number, number];
    const i = x - region.x0;
    const j = z - region.z0;
    if (i < 0 || j < 0 || i >= region.width || j >= region.depth) continue;
    const top = (apronFloor.get(key) as number) - 1;
    const floor = ground[j * region.width + i] as number;
    if (top <= floor) continue;
    // The material of the nearest wall's skirt: the apron reads as that wall's
    // footing rather than as a patch of unrelated stone.
    const nx = Math.min(Math.max(x, rect.x0), rect.x1);
    const nz = Math.min(Math.max(z, rect.z0), rect.z1);
    // Clamping to the envelope finds the nearest wall of a rect plan every
    // time. On an L it can land in the notch, where there is no skirt at all —
    // so fall back to the nearest column that *does* have one.
    const stateId = skirtState.get(`${nx},${nz}`) ?? nearestSkirt(skirtState, x, z);
    if (stateId === undefined) continue;
    const bottom = Math.max(floor + 1, top - MAX_FOUNDATION_DEPTH + 1);
    for (let y = top; y >= bottom; y--) {
      blocks.push({ x, y, z, stateId });
      added++;
    }
  }
  return added;
}

/**
 * The skirt state of the built column nearest `(x, z)`, or `undefined`.
 *
 * Ties break on the sorted key, so the answer is a pure function of the
 * geometry rather than of Map insertion order.
 */
function nearestSkirt(
  skirtState: ReadonlyMap<string, number>,
  x: number,
  z: number,
): number | undefined {
  let best: number | undefined;
  let bestCost = Infinity;
  for (const key of [...skirtState.keys()].sort()) {
    const [kx, kz] = key.split(",").map(Number) as [number, number];
    const cost = Math.abs(kx - x) + Math.abs(kz - z);
    if (cost < bestCost) {
      bestCost = cost;
      best = skirtState.get(key) as number;
    }
  }
  return best;
}

/**
 * How far the skirt must reach to meet solid ground.
 *
 * The pad edit already levelled the footprint to `foundationY`, so this is only
 * the residual: rounding, the apron's falloff, and any column the pad could not
 * reach. One block is always emitted, so a building never floats on a hairline.
 */
export function skirtDepth(plan: ColumnPlan, placement: Placement): number {
  const { region, ground } = plan;
  let deepest = 1;
  for (let z = placement.footprint.z0; z <= placement.footprint.z1; z++) {
    const j = z - region.z0;
    if (j < 0 || j >= region.depth) continue;
    for (let x = placement.footprint.x0; x <= placement.footprint.x1; x++) {
      const i = x - region.x0;
      if (i < 0 || i >= region.width) continue;
      const gap = placement.foundationY - (ground[j * region.width + i] as number) + 1;
      if (gap > deepest) deepest = gap;
    }
  }
  return Math.min(deepest, MAX_FOUNDATION_DEPTH);
}

/**
 * The `door` port to cut an opening for: the first declared port of type
 * `door`, in declaration order.
 *
 * v0.2 §5.3: not yet — `gate` and `arch` are not cut, so a building that
 * declares only those gets the grammar's default south door.
 */
export function doorOf(ports: Readonly<Record<string, PortDeclaration>>): BuildingDoor | null {
  for (const port of Object.values(ports)) {
    if (port.type !== "door") continue;
    const face = port.face;
    const cardinal: Cardinal =
      face === "north" || face === "east" || face === "west" ? face : "south";
    return { face: cardinal, ...(port.at === undefined ? {} : { at: port.at }) };
  }
  return null;
}

/**
 * Read a document's `wing` param into the grammar's shape, or `undefined`.
 *
 * The seam for wiring L/T plans through from Loam. `structures/index.ts` reads
 * generator params by an explicit whitelist — deliberately, so an unimplemented
 * param can never reach the grammar by accident — and this is the one line that
 * whitelist needs when the plan vocabulary is turned on:
 *
 * ```ts
 * ...(wingParamOf(params) === undefined ? {} : { wing: wingParamOf(params) }),
 * ```
 *
 * Shape errors are `undefined` here rather than thrown; the profile validator
 * is where a defective document is told about them, with a fix hint.
 */
export function wingParamOf(value: unknown): BuildingWing | undefined {
  if (value === null || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  const size = raw["size"];
  const side = raw["side"];
  const offset = raw["offset"] ?? 0;
  if (!Array.isArray(size) || size.length !== 2) return undefined;
  const [wx, wz] = size as unknown[];
  if (typeof wx !== "number" || typeof wz !== "number" || typeof offset !== "number") return undefined;
  if (side !== "north" && side !== "east" && side !== "south" && side !== "west") return undefined;
  return { size: [wx, wz], side, offset };
}

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
