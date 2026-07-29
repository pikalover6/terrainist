/**
 * The connection-state pass.
 *
 * Minecraft stores a fence's connections **in its block state**, and it does
 * not recompute them when a world is loaded — a saved chunk is taken at its
 * word. Everything this compiler emitted before this pass existed carried the
 * *default* state, which for every connective block is "connected to nothing",
 * so bridge rails, well kerbs, plaza posts and garden fences all rendered as
 * rows of unconnected stubs. A walkthrough reported it as "fences render as
 * unconnected posts", and it is the single most visible state defect the
 * emitter had.
 *
 * The fix is a pass, not a placement rule, because a connection is a property
 * of a **neighbourhood**: the block that decides whether a fence connects east
 * may be written by a different generator, in a different pass, long after the
 * fence. So the connections are computed once, at the end, when every block in
 * the world exists.
 *
 * ## Cross-chunk correctness
 *
 * The pass runs over the finished chunk *map*, before anything is serialized —
 * `emitTerrain` holds every chunk of the region in memory at once, so a lookup
 * at `x - 1` crosses a chunk boundary by indexing a different entry of the same
 * map, with no neighbour-chunk load and no ordering hazard. Reads and writes go
 * through one `(x, y, z) → chunk` accessor, and the write phase is separated
 * from the read phase so a fence never sees a neighbour that has already been
 * rewritten this pass. A column outside the emitted region reads as air, which
 * is the truth: there is no chunk there to connect to.
 *
 * ## What is recomputed
 *
 * - **fences** (`*_fence`) — `north`/`east`/`south`/`west`;
 * - **glass panes and iron bars** — the same four;
 * - **walls** (`*_wall`) — the same four as `none`/`low`/`tall`, plus `up`;
 * - **rails** (`rail`, `powered_rail`, `detector_rail`, `activator_rail`) —
 *   their `shape`: `north_south`/`east_west`, the four `ascending_*` variants
 *   where the line changes level, and — for the flexible `rail` only — the
 *   four curves;
 *
 * and nothing else. Stairs already carry the `facing`/`half` they were placed
 * with; their `shape` (the inner/outer mitre at a corner) is *not* computed
 * here, and is left `straight`. Every stair this compiler emits is part of a
 * straight run — a roof course, an eave, a flight of steps — so a mitre would
 * change nothing; a generator that starts building L-shaped runs should extend
 * this pass rather than guess at placement time.
 */

import type { EmitChunk, PrismarineStack } from "./prismarine.js";

/** One column-and-height the pass should look at. */
export interface ConnectionCandidate {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** What {@link applyConnectionStates} changed. */
export interface ConnectionStats {
  /** Connective blocks examined. */
  readonly examined: number;
  /** Of those, blocks whose stored state was wrong and has been rewritten. */
  readonly rewritten: number;
}

/** Which connection grammar a block name follows. */
export type ConnectiveKind = "fence" | "pane" | "wall" | "rail" | "straight_rail";

/** Classify a block name, or `undefined` when it has no connection state. */
export function connectiveKindOf(name: string): ConnectiveKind | undefined {
  if (name.endsWith("_fence")) return "fence";
  if (name.endsWith("_wall")) return "wall";
  if (name.endsWith("_pane") || name === "iron_bars") return "pane";
  if (name === "rail") return "rail";
  if (name === "powered_rail" || name === "detector_rail" || name === "activator_rail") {
    return "straight_rail";
  }
  return undefined;
}

/** True for either rail grammar. */
function isRail(kind: ConnectiveKind | undefined): boolean {
  return kind === "rail" || kind === "straight_rail";
}

/** `(dx, dz)` per cardinal, in the order the state properties are named. */
const DIRECTIONS: readonly (readonly [string, number, number])[] = Object.freeze([
  ["north", 0, -1],
  ["east", 1, 0],
  ["south", 0, 1],
  ["west", -1, 0],
] as const);

/**
 * Recompute the stored connection state of every connective block.
 *
 * `candidates` is every position the compiler wrote a non-terrain block at;
 * the terrain materializer emits no connective block, so that list is a
 * superset of what has to be examined and a tiny fraction of the world.
 */
export function applyConnectionStates(
  chunks: ReadonlyMap<string, EmitChunk>,
  candidates: Iterable<ConnectionCandidate>,
  stack: PrismarineStack,
): ConnectionStats {
  const at = (x: number, y: number, z: number): number => {
    const chunk = chunks.get(`${x >> 4},${z >> 4}`);
    if (chunk === undefined) return 0;
    return chunk.getBlockStateId(x - (x >> 4) * 16, y, z - (z >> 4) * 16);
  };

  const kindCache = new Map<number, ConnectiveKind | undefined>();
  const kindOf = (stateId: number): ConnectiveKind | undefined => {
    if (kindCache.has(stateId)) return kindCache.get(stateId);
    const name = stack.blockNameByStateId(stateId);
    const kind = name === undefined ? undefined : connectiveKindOf(name);
    kindCache.set(stateId, kind);
    return kind;
  };

  // Two phases. Deciding every block's new state against the *original* world
  // and only then writing keeps the result independent of candidate order,
  // which is what makes it deterministic and what stops a fence from reading a
  // neighbour this pass has already touched.
  const writes: { x: number; y: number; z: number; stateId: number }[] = [];
  let examined = 0;
  const seen = new Set<string>();

  for (const cell of candidates) {
    const key = `${cell.x},${cell.y},${cell.z}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const stateId = at(cell.x, cell.y, cell.z);
    const kind = kindOf(stateId);
    if (kind === undefined) continue;
    examined++;
    const decoded = stack.blockStateProps(stateId);
    if (decoded === undefined) continue;

    const props: Record<string, string> = { ...decoded.props };

    if (isRail(kind)) {
      // A rail carries one property, `shape`, and it is a statement about the
      // neighbourhood: which of the four cardinals holds another rail, and
      // whether that rail is a step up. Same two-phase discipline as the rest
      // of this pass, and the same `at()` accessor, so a line that crosses a
      // chunk boundary is read exactly like one that does not.
      props["shape"] = railShape(cell, kind === "rail", (dx, dy, dz) =>
        isRail(kindOf(at(cell.x + dx, cell.y + dy, cell.z + dz))),
      );
      const nextRail = stack.blockStateOf(decoded.name, props);
      if (nextRail === undefined || nextRail === stateId) continue;
      writes.push({ x: cell.x, y: cell.y, z: cell.z, stateId: nextRail });
      continue;
    }

    let connections = 0;
    let axisNS = 0;
    let axisEW = 0;
    for (const [name, dx, dz] of DIRECTIONS) {
      const neighbour = at(cell.x + dx, cell.y, cell.z + dz);
      const value = connectionValue(kind, neighbour, decoded.name, stack);
      props[name] = value;
      if (value !== "false" && value !== "none") {
        connections++;
        if (name === "north" || name === "south") axisNS++;
        else axisEW++;
      }
    }
    if (kind === "wall") {
      // A wall grows its centre post whenever it is not a plain straight
      // run — a corner, a tee, a dead end, or anything standing on it.
      const above = at(cell.x, cell.y + 1, cell.z);
      const straight = connections === 2 && (axisNS === 2 || axisEW === 2);
      props["up"] = !straight || above !== 0 ? "true" : "false";
    }

    const next = stack.blockStateOf(decoded.name, props);
    if (next === undefined || next === stateId) continue;
    writes.push({ x: cell.x, y: cell.y, z: cell.z, stateId: next });
  }

  for (const write of writes) {
    const chunk = chunks.get(`${write.x >> 4},${write.z >> 4}`);
    if (chunk === undefined) continue;
    chunk.setStateId(write.x - (write.x >> 4) * 16, write.y, write.z - (write.z >> 4) * 16, write.stateId);
  }

  return { examined, rewritten: writes.length };
}

/* -------------------------------------------------------------------------- */
/* rails                                                                       */
/* -------------------------------------------------------------------------- */

/** A rail's four possible curve shapes, in the priority they are chosen. */
const RAIL_CURVES: readonly (readonly [string, string, string])[] = Object.freeze([
  ["south", "east", "south_east"],
  ["south", "west", "south_west"],
  ["north", "east", "north_east"],
  ["north", "west", "north_west"],
] as const);

/**
 * The `shape` one rail should carry.
 *
 * `hasRail(dx, dy, dz)` answers "is there a rail at this offset from me". A
 * neighbour counts as connected when it sits at the same level, one higher (we
 * climb to it) or one lower (it climbs to us) — which is exactly vanilla's
 * rule, and the reason a graded line resolves without the generator having to
 * say anything about slope.
 *
 * The choice, in order:
 *
 * 1. both cardinals of one axis connected → that axis, straight;
 * 2. a perpendicular pair, on the flexible `rail` only → the curve naming the
 *    two directions (`south_east` connects south and east);
 * 3. one connection, or none → the axis it lies on, defaulting `north_south`,
 *    which is the vanilla default and what a buffer-ended run wants.
 *
 * A straight shape becomes its `ascending_*` variant when the neighbour it
 * runs toward is one block higher. Curves have no ascending form in the game,
 * so a corner on a grade stays flat — which is why {@link railShape} resolves
 * the axis first and the slope second.
 */
export function railShape(
  cell: ConnectionCandidate,
  curvesAllowed: boolean,
  hasRail: (dx: number, dy: number, dz: number) => boolean,
): string {
  const level = (dx: number, dz: number): number | undefined => {
    if (hasRail(dx, 0, dz)) return 0;
    if (hasRail(dx, 1, dz)) return 1;
    if (hasRail(dx, -1, dz)) return -1;
    return undefined;
  };
  const north = level(0, -1);
  const east = level(1, 0);
  const south = level(0, 1);
  const west = level(-1, 0);
  const at = (name: string): number | undefined =>
    name === "north" ? north : name === "east" ? east : name === "south" ? south : west;

  const ns = north !== undefined && south !== undefined;
  const ew = east !== undefined && west !== undefined;

  if (!ns && !ew && curvesAllowed) {
    for (const [a, b, shape] of RAIL_CURVES) {
      if (at(a) !== undefined && at(b) !== undefined) return shape;
    }
  }

  // The axis: a full pair first, then a lone connection, then the default.
  const axis: "ns" | "ew" = ns
    ? "ns"
    : ew
      ? "ew"
      : east !== undefined || west !== undefined
        ? "ew"
        : "ns";

  const [a, b] = axis === "ns" ? (["north", "south"] as const) : (["east", "west"] as const);
  if (at(a) === 1) return `ascending_${a}`;
  if (at(b) === 1) return `ascending_${b}`;
  return axis === "ns" ? "north_south" : "east_west";
}

/**
 * The value one direction's connection property takes.
 *
 * Fences connect to fences of the same family and to any full solid cube;
 * panes and bars connect to each other and to solid cubes; walls do the same
 * but say *how tall* the connection is — `tall` against a solid block, `low`
 * against another wall, which is what vanilla renders.
 */
function connectionValue(
  kind: ConnectiveKind,
  neighbour: number,
  selfName: string,
  stack: PrismarineStack,
): string {
  if (neighbour === 0) return kind === "wall" ? "none" : "false";
  const name = stack.blockNameByStateId(neighbour);
  if (name === undefined) return kind === "wall" ? "none" : "false";
  const solid = stack.isFullCube(neighbour);
  const other = connectiveKindOf(name);
  const gate = name.endsWith("_fence_gate");

  if (kind === "wall") {
    if (other === "wall" || gate) return "low";
    return solid ? "tall" : "none";
  }
  if (kind === "fence") {
    // Wooden fences all connect to each other; the nether-brick fence is its
    // own family and connects only to itself (and to gates).
    if (other === "fence") {
      const netherSelf = selfName === "nether_brick_fence";
      const netherOther = name === "nether_brick_fence";
      return netherSelf === netherOther ? "true" : "false";
    }
    return gate || solid ? "true" : "false";
  }
  // panes and bars
  if (other === "pane") return "true";
  return solid ? "true" : "false";
}
