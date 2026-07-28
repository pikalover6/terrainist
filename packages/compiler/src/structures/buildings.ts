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
  rotateOps,
  type BuildingDoor,
  type BuildingMaterials,
  type BuildingMeta,
  type BuildingParams,
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
  // The grammar's decorations (eaves, shutters, window boxes, the porch lamp)
  // reach one block into the apron outside the footprint. That is fine over
  // open ground and wrong over a neighbour, so an apron op that lands inside
  // *another* building's claim is dropped rather than allowed to punch through
  // its wall. Nothing structural is ever in the apron, so dropping is safe.
  const foreign = jobs.map((j) => j.placement.footprint);

  for (const job of jobs) {
    const { placement } = job;
    const door = doorOf(job.ports);
    const foundationDepth = skirtDepth(plan, placement);

    const result = generateBuilding({
      size: job.size,
      params: job.params,
      seed: job.seed,
      foundationDepth,
      ...(door === null ? {} : { door }),
      ...(job.materials === undefined ? {} : { materials: job.materials }),
      ...(job.style === undefined ? {} : { style: job.style }),
    });

    const [sizeX, , sizeZ] = job.size;
    const rotated = rotateOps(result.ops, placement.yaw, sizeX, sizeZ);
    const [tx, , tz] = placement.translation;
    // Local y = 0 is the walkable floor, which sits one block *above* the
    // levelled ground; the skirt at y = -1 replaces that surface block.
    const floorY = placement.foundationY + 1;

    let count = 0;
    for (const op of rotated) {
      const x = tx + op.x;
      const z = tz + op.z;
      const inFootprint = contains(placement.footprint, x, z);
      if (!inFootprint && foreign.some((r) => r !== placement.footprint && contains(r, x, z))) {
        continue;
      }
      const stateId = resolveState(stack, op, missing);
      if (stateId === undefined) continue;
      blocks.push({ x, y: floorY + op.y, z, stateId });
      count++;
    }

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
      floorY,
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
