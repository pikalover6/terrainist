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
  type MaterialTheme,
  type TerraceBay,
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
  /** The whole palette the triple came from; only the terrace reads it. */
  readonly theme?: MaterialTheme;
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
   * The cellar's floor columns, as `"x,z"` world keys.
   *
   * The cellar is dug under the **main** rect only — a wing stands on solid
   * foundation — so on an L this is a strict subset of the building's own
   * floor columns, and the difference is four courses of masonry that the
   * interior rules would otherwise read as a blocked room.
   */
  readonly basementCells?: ReadonlySet<string>;
  /**
   * The columns this building actually covers, as `"x,z"` world keys.
   *
   * Equal to every column of {@link BuiltBuilding.footprint} for a rect plan,
   * and a strict subset of it for an L or a T. Consumers that ask "is this
   * ground built on?" should prefer this to the rect; the rect remains the
   * *envelope*, which is what the solver reserved and the pad levelled.
   */
  readonly cells: ReadonlySet<string>;
  /**
   * The enclosed floor columns, as `"x,z"` world keys — the *room*, across
   * both rects of an L or a T.
   *
   * {@link BuiltBuilding.interior} is the main rect's interior rectangle and
   * stays that, because every existing consumer reasons about a rectangle. On
   * a wing plan that rectangle is both too small (it misses the wing) and too
   * large (it spans the notch, which is open ground outside the building). The
   * physics lint needs the true set, and so does anything else that asks "is
   * this column inside this building".
   */
  readonly interiorCells: ReadonlySet<string>;
  /**
   * The enclosed floor columns **per storey**, aligned with
   * `meta.floorLevels`.
   *
   * Absent when every storey has the same plan, which is every building bar the
   * terrace. There the run's bays differ in height, so above the shortest bay's
   * eave the building's floor is a strict subset of its ground floor — and a
   * consumer that asks "which columns is this storey made of" and gets the
   * ground floor's answer will call every short bay's roof unreachable floor.
   */
  readonly interiorCellsByLevel?: readonly ReadonlySet<string>[];
  /**
   * What the apron needs to stay off the air, kept for a second look later.
   *
   * The skirt and the apron underpinning are both measured against the ground
   * *as it was when the building was generated*, and the road pass then cuts
   * lanes into that ground — after the buildings, because a router has to
   * treat their footprints as obstacles. A lane arriving at a door can drop
   * the column a porch lamp stands in by several blocks, and the lamp is then
   * a fence post on air: exactly the defect the underpinning exists to stop,
   * one pass too early to see it. {@link underpinAprons} is the second look,
   * and this is what it needs to take it.
   */
  readonly apron: {
    /** Lowest world Y this building put in each apron column, keyed `x,z`. */
    readonly floor: ReadonlyMap<string, number>;
    /** The skirt's block state per footprint column. */
    readonly skirt: ReadonlyMap<string, number>;
    /** Apron columns already filled, as `x,y,z` keys. */
    readonly filled: ReadonlySet<string>;
  };
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
      ...(job.theme === undefined ? {} : { theme: job.theme }),
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
  const cellSets = jobs.map((job, k) =>
    worldCells(job, (results[k] as ReturnType<typeof generateBuilding>).meta.cells),
  );

  // One index over every claimed cell, so the apron test below is a single
  // lookup instead of a scan across every other building (which made the pass
  // quadratic in building count).
  //
  // Membership is all this needs, so a set of keys is enough — no owner index,
  // and so nothing that duplicate ownership could confuse. The test is only
  // ever reached for a key the *current* building does not own (`!inFootprint`
  // is checked first, against this same key space), so "some cell set other
  // than mine contains this key" and "any cell set contains this key" are the
  // same question, whether one building claims it or five do. Membership tests
  // only: the set is never iterated, so no decision depends on its order.
  const claimedCells = new Set<string>();
  for (const set of cellSets) for (const key of set) claimedCells.add(key);

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
      if (!inFootprint && claimedCells.has(key)) continue;
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
    const filled = new Set<string>();
    count += underpinApron(plan, placement.footprint, apronFloor, skirtState, filled, blocks);

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
      interiorCells: worldCells(job, result.meta.floorCells),
      ...(result.meta.floorCellsByLevel === undefined
        ? {}
        : {
            interiorCellsByLevel: result.meta.floorCellsByLevel.map((cs) => worldCells(job, cs)),
          }),
      apron: { floor: apronFloor, skirt: skirtState, filled },
      floorY,
      basementDepth: cellar,
      ...(cellar === 0 || result.meta.basementInterior === null
        ? {}
        : {
            basementFloorY: floorY - cellar,
            // The cellar's own rect, carried through the yaw — not the
            // envelope inset by one. On a rect plan the two agree exactly; on
            // an L the envelope's inset spans the wing, which has no cellar
            // under it at all.
            ...rectAndCells(job, result.meta.basementInterior),
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
  cells: readonly { readonly x: number; readonly z: number }[],
): ReadonlySet<string> {
  const [sizeX, , sizeZ] = job.size;
  const [tx, , tz] = job.placement.translation;
  const out = new Set<string>();
  for (const c of rotateCells(cells, job.placement.yaw, sizeX, sizeZ)) {
    out.add(`${tx + c.x},${tz + c.z}`);
  }
  return out;
}

/**
 * The course a fill must stop at when a carved span crosses the column.
 *
 * `undefined` when nothing is carved between the fill's top and the ground, in
 * which case the terrain's own surface is the floor as before.
 */
function carvedTop(plan: ColumnPlan, idx: number, top: number): number | undefined {
  const caves = plan.caves;
  if (caves === undefined) return undefined;
  const { offsets, lo, hi } = caves.spans;
  const from = offsets[idx] as number;
  const to = offsets[idx + 1] as number;
  let best: number | undefined;
  for (let k = from; k < to; k++) {
    if ((lo[k] as number) > top) continue;
    const stop = (hi[k] as number) + 1;
    if (best === undefined || stop > best) best = stop;
  }
  return best;
}

/**
 * Underpin every apron again, against the ground as it finally is.
 *
 * Called after the passes that *move* ground — the roads above all — with the
 * buildings the first pass produced. Columns the first pass already filled are
 * skipped, so this only ever adds the courses a later cut exposed; on a world
 * with no roads it adds nothing at all.
 *
 * Returns the blocks to append.
 */
export function underpinAprons(
  builds: readonly BuiltBuilding[],
  plan: ColumnPlan,
): StructureBlock[] {
  const blocks: StructureBlock[] = [];
  for (const built of builds) {
    underpinApron(
      plan,
      built.footprint,
      built.apron.floor,
      built.apron.skirt,
      built.apron.filled as Set<string>,
      blocks,
    );
  }
  return blocks;
}

/**
 * A local rect's world columns, under the placement's yaw.
 *
 * Returns both the set (the truth) and its bounding rectangle (what the
 * existing rect-shaped consumers read). They agree on every rect plan.
 */
function rectAndCells(
  job: BuildingJob,
  local: { readonly x0: number; readonly z0: number; readonly x1: number; readonly z1: number },
): { basementInterior: Rect; basementCells: ReadonlySet<string> } {
  const cells: { x: number; z: number }[] = [];
  for (let z = local.z0; z <= local.z1; z++) {
    for (let x = local.x0; x <= local.x1; x++) cells.push({ x, z });
  }
  const world = worldCells(job, cells);
  let x0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let z1 = -Infinity;
  for (const key of world) {
    const [x, z] = key.split(",").map(Number) as [number, number];
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (z < z0) z0 = z;
    if (z > z1) z1 = z;
  }
  return { basementInterior: { x0, z0, x1, z1 }, basementCells: world };
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
  rect: Rect,
  apronFloor: ReadonlyMap<string, number>,
  skirtState: ReadonlyMap<string, number>,
  filled: Set<string>,
  blocks: StructureBlock[],
): number {
  const { region, ground } = plan;
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
    // A tunnel bore under the apron is a hole the fill must not drop into: the
    // gallery below is interior air, and a plinth punched through its roof is
    // both a breach and a pillar standing in a corridor. The first solid block
    // is then the one above the span, not the terrain's own surface.
    const carved = carvedTop(plan, j * region.width + i, top);
    const bottom = Math.max(carved ?? floor + 1, top - MAX_FOUNDATION_DEPTH + 1);
    for (let y = top; y >= bottom; y--) {
      const cell = `${x},${y},${z}`;
      if (filled.has(cell)) continue;
      filled.add(cell);
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

/**
 * Read a document's `bays` param into the terrace grammar's shape.
 *
 * The same contract `wingParamOf` has, for the same reason: the params
 * whitelist in `structures/index.ts` is deliberately explicit, so a param the
 * grammar cannot read never reaches it by accident, and a *defective* one
 * becomes `undefined` here rather than an exception. A terrace that gets
 * nothing draws its own bays, so dropping a malformed list costs the run its
 * variety and never its geometry.
 *
 * Entries missing a usable `width` or `floors` are dropped rather than
 * defaulted: a half-described bay in the middle of a list would silently shift
 * every bay after it, and a shorter list is honestly handled — the planner
 * draws the rest.
 */
export function terraceBaysParamOf(value: unknown): readonly TerraceBay[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  const out: TerraceBay[] = [];
  for (const entry of value as unknown[]) {
    if (entry === null || typeof entry !== "object") continue;
    const raw = entry as Record<string, unknown>;
    const width = raw["width"];
    const floors = raw["floors"];
    if (typeof width !== "number" || typeof floors !== "number") continue;
    const archetype = raw["archetype"];
    out.push({
      width,
      floors,
      ...(typeof archetype === "string" ? { archetype } : {}),
    });
  }
  return out.length === 0 ? undefined : out;
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
