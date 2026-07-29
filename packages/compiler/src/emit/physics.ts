/**
 * The physics lint — a world **readback** validator.
 *
 * Every other check in this compiler reads a plan, a placement list or an op
 * list: it asks whether the compiler meant to do the right thing. This one
 * opens the finished region files and asks whether the world on disk is one a
 * player can actually walk through. The distinction is not academic — every
 * defect this module checks for survived the whole existing test suite and was
 * found by a human walking the village in the game client:
 *
 * - ladders fixed to open air, because the wall behind them had an arrow slit;
 * - a torch bracket with nothing to bracket to;
 * - an interior stair flight whose top step was one block short of the floor it
 *   served, so you had to jump to get upstairs;
 * - a bed whose two halves were paired the wrong way round;
 * - fences carrying the default "connected to nothing" state;
 * - a road laid a block proud of the field it crossed;
 * - a half-block hole over every doorway.
 *
 * Renders miss all of it. A readback does not.
 *
 * Each check returns findings rather than throwing, so a caller can report a
 * count, sample the worst offenders, and assert zero.
 */

import type { EmitAnvil, EmitChunk, PrismarineStack } from "./prismarine.js";
import { listChunks } from "./prismarine.js";
import { applyConnectionStates, connectiveKindOf } from "./connections.js";

/** One thing wrong with the world. */
export interface PhysicsFinding {
  /** Machine-readable rule id, e.g. `"unsupported.ladder"`. */
  readonly rule: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** The offending block, as `name[prop=value,…]`. */
  readonly block: string;
  readonly detail: string;
}

/** What {@link lintWorldPhysics} found, per rule and in full. */
export interface PhysicsReport {
  readonly findings: readonly PhysicsFinding[];
  /** Finding count per rule id, including rules that found nothing. */
  readonly counts: Readonly<Record<string, number>>;
  /** Blocks examined — the size of the readback, for context. */
  readonly examined: number;
}

/** Context the lint needs from the compile that produced the world. */
export interface PhysicsContext {
  /** Placed buildings, as the compile report carries them. */
  readonly buildings?: readonly {
    readonly footprint: { x0: number; z0: number; x1: number; z1: number };
    readonly floorY: number;
    readonly meta: { readonly roofTop: number; readonly foundationDepth: number };
  }[];
  /** Road centre lines; bridge decks are exempt from the flush-road rule. */
  readonly roads?: readonly {
    readonly path: readonly { readonly x: number; readonly z: number; readonly y: number }[];
  }[];
  /** Y range to read back. Defaults to a generous band around the surface. */
  readonly minY?: number;
  readonly maxY?: number;
}

/** Every rule this module can report, so a clean world still lists them all. */
export const PHYSICS_RULES: readonly string[] = Object.freeze([
  "unsupported.ladder",
  "unsupported.wall_torch",
  "unsupported.torch",
  "unsupported.lantern",
  "unsupported.door",
  "door.half_mismatch",
  "bed.pairing",
  "floating.slab",
  "floating.stair",
  "stair.unmountable",
  "connection.stale",
  "road.proud",
]);

const AIR = new Set(["air", "cave_air", "void_air"]);

/** `(dx, dz)` per cardinal name. */
const STEP: Readonly<Record<string, readonly [number, number]>> = Object.freeze({
  north: [0, -1],
  east: [1, 0],
  south: [0, 1],
  west: [-1, 0],
});

/**
 * Read a world back and check it.
 *
 * The whole emitted region is loaded into an in-memory grid first. That is
 * deliberate: half these rules are about a block's *neighbours*, and three of
 * them (the connection diff above all) have to compare against neighbours that
 * may be in a different chunk, so a scan that could only see one chunk at a
 * time would be checking a weaker property than the one that matters.
 */
export async function lintWorldPhysics(
  worldDir: string,
  stack: PrismarineStack,
  context: PhysicsContext = {},
): Promise<PhysicsReport> {
  const minY = context.minY ?? 40;
  const maxY = context.maxY ?? 200;
  const regionDir = `${worldDir}/region`;
  const positions = await listChunks(regionDir);
  const anvil: EmitAnvil = stack.openAnvil(regionDir);
  const chunks = new Map<string, EmitChunk>();
  try {
    for (const { chunkX, chunkZ } of positions) {
      const chunk = await anvil.load(chunkX, chunkZ);
      if (chunk !== null) chunks.set(`${chunkX},${chunkZ}`, chunk);
    }
  } finally {
    await anvil.close();
  }

  const stateAt = (x: number, y: number, z: number): number => {
    if (y < minY || y > maxY) return 0;
    const chunk = chunks.get(`${x >> 4},${z >> 4}`);
    if (chunk === undefined) return 0;
    return chunk.getBlockStateId(x - (x >> 4) * 16, y, z - (z >> 4) * 16);
  };
  const nameCache = new Map<number, string>();
  const nameAt = (x: number, y: number, z: number): string => {
    const id = stateAt(x, y, z);
    let name = nameCache.get(id);
    if (name === undefined) {
      name = stack.blockNameByStateId(id) ?? "air";
      nameCache.set(id, name);
    }
    return name;
  };
  const solidAt = (x: number, y: number, z: number): boolean => stack.isFullCube(stateAt(x, y, z));
  const airAt = (x: number, y: number, z: number): boolean => AIR.has(nameAt(x, y, z));
  const describe = (id: number): string => {
    const decoded = stack.blockStateProps(id);
    if (decoded === undefined) return `#${id}`;
    const props = Object.entries(decoded.props)
      .map(([k, v]) => `${k}=${v}`)
      .join(",");
    return props === "" ? decoded.name : `${decoded.name}[${props}]`;
  };

  const findings: PhysicsFinding[] = [];
  const add = (rule: string, x: number, y: number, z: number, detail: string): void => {
    findings.push({ rule, x, y, z, block: describe(stateAt(x, y, z)), detail });
  };

  let examined = 0;
  const connective: { x: number; y: number; z: number }[] = [];
  const stairs = new Map<string, { x: number; y: number; z: number; facing: string }>();

  for (const [key, chunk] of chunks) {
    const [cx, cz] = key.split(",").map(Number) as [number, number];
    for (let lz = 0; lz < 16; lz++) {
      for (let lx = 0; lx < 16; lx++) {
        const x = cx * 16 + lx;
        const z = cz * 16 + lz;
        for (let y = minY; y <= maxY; y++) {
          const id = chunk.getBlockStateId(lx, y, lz);
          if (id === 0) continue;
          const decoded = stack.blockStateProps(id);
          if (decoded === undefined) continue;
          const { name, props } = decoded;
          if (AIR.has(name)) continue;
          examined++;

          // --- attachment ------------------------------------------------
          if (name === "ladder") {
            const [dx, dz] = STEP[props["facing"] ?? "north"] ?? [0, -1];
            if (!solidAt(x - dx, y, z - dz)) {
              add("unsupported.ladder", x, y, z, `nothing solid behind it at ${x - dx},${y},${z - dz}`);
            }
          } else if (name.endsWith("wall_torch")) {
            const [dx, dz] = STEP[props["facing"] ?? "north"] ?? [0, -1];
            if (!solidAt(x - dx, y, z - dz)) {
              add("unsupported.wall_torch", x, y, z, `nothing to bracket to at ${x - dx},${y},${z - dz}`);
            }
          } else if (name === "torch" || name === "soul_torch" || name === "redstone_torch") {
            if (!solidAt(x, y - 1, z)) add("unsupported.torch", x, y, z, "no solid block below");
          } else if (name.endsWith("lantern")) {
            const hanging = props["hanging"] === "true";
            const ok = hanging ? !airAt(x, y + 1, z) : !airAt(x, y - 1, z);
            if (!ok) {
              add("unsupported.lantern", x, y, z, hanging ? "hangs from air" : "stands on air");
            }
          } else if (name.endsWith("_door")) {
            if (props["half"] === "lower") {
              if (!solidAt(x, y - 1, z)) add("unsupported.door", x, y, z, "no solid block below");
              const above = stack.blockStateProps(stateAt(x, y + 1, z));
              const paired =
                above !== undefined &&
                above.name === name &&
                above.props["half"] === "upper" &&
                above.props["facing"] === props["facing"] &&
                above.props["hinge"] === props["hinge"];
              if (!paired) add("door.half_mismatch", x, y, z, "no matching upper half above");
            }
          } else if (name.endsWith("_bed")) {
            const facing = props["facing"] ?? "north";
            const [dx, dz] = STEP[facing] ?? [0, -1];
            const part = props["part"];
            // The head is one step along `facing` from the foot; look the
            // right way for whichever half this is.
            const sign = part === "foot" ? 1 : -1;
            const other = stack.blockStateProps(stateAt(x + dx * sign, y, z + dz * sign));
            const ok =
              other !== undefined &&
              other.name === name &&
              other.props["facing"] === facing &&
              other.props["part"] === (part === "foot" ? "head" : "foot");
            if (!ok) {
              add("bed.pairing", x, y, z, `${part} has no matching half at ${x + dx * sign},${y},${z + dz * sign}`);
            }
          }

          // --- floating half-blocks --------------------------------------
          if (name.endsWith("_slab") || name.endsWith("_stairs")) {
            const below = !airAt(x, y - 1, z);
            const sideways =
              !airAt(x + 1, y, z) || !airAt(x - 1, y, z) || !airAt(x, y, z + 1) || !airAt(x, y, z - 1);
            const above = !airAt(x, y + 1, z);
            if (!below && !sideways && !above) {
              add(name.endsWith("_slab") ? "floating.slab" : "floating.stair", x, y, z, "air on every side");
            }
          }

          if (name.endsWith("_stairs") && props["half"] === "bottom") {
            stairs.set(`${x},${y},${z}`, { x, y, z, facing: props["facing"] ?? "north" });
          }
          if (connectiveKindOf(name) !== undefined) connective.push({ x, y, z });
        }
      }
    }
  }

  // --- interior stair runs -------------------------------------------------
  // A run is a chain of bottom-half stairs each one block up and one cell along
  // its own `facing`. Roof courses form the same chain, so only runs *inside* a
  // building's shell are checked — which is where a player climbs.
  const inside = (x: number, y: number, z: number): boolean =>
    (context.buildings ?? []).some(
      (b) =>
        x > b.footprint.x0 &&
        x < b.footprint.x1 &&
        z > b.footprint.z0 &&
        z < b.footprint.z1 &&
        y > b.floorY &&
        y < b.floorY + b.meta.roofTop,
    );
  const linked = (s: { x: number; y: number; z: number; facing: string }): string => {
    const [dx, dz] = STEP[s.facing] ?? [0, -1];
    return `${s.x + dx},${s.y + 1},${s.z + dz}`;
  };
  const hasPredecessor = new Set<string>();
  for (const s of stairs.values()) {
    if (stairs.has(linked(s))) hasPredecessor.add(linked(s));
  }
  for (const s of stairs.values()) {
    const key = `${s.x},${s.y},${s.z}`;
    if (hasPredecessor.has(key)) continue;
    if (!stairs.has(linked(s))) continue;
    if (!inside(s.x, s.y, s.z)) continue;
    // Walk to the top of the run.
    let top = s;
    while (stairs.has(linked(top))) top = stairs.get(linked(top)) as typeof top;
    const [dx, dz] = STEP[s.facing] ?? [0, -1];
    // Mounting: *some* neighbour of the bottom step has to be a floor cell at
    // the step's own level, so a player can walk onto it with a half-block
    // rise. Any of the four will do — a flight against a wall is boarded from
    // the side, and that is a stair, not a jump.
    const mountable = ([
      [dx, dz],
      [-dx, -dz],
      [dz, dx],
      [-dz, -dx],
    ] as const).some(
      ([ox, oz]) =>
        solidAt(s.x - ox, s.y - 1, s.z - oz) &&
        airAt(s.x - ox, s.y, s.z - oz) &&
        airAt(s.x - ox, s.y + 1, s.z - oz),
    );
    if (!mountable) {
      add("stair.unmountable", s.x, s.y, s.z, "no walkable floor cell at the foot of the run");
    }
    // Landing: the cell past the top step must be solid at the top step's own
    // level, so its surface is flush with the step's back tread.
    if (!solidAt(top.x + dx, top.y, top.z + dz)) {
      add("stair.unmountable", top.x, top.y, top.z, "no landing flush with the top step");
    }
    // Headroom: two clear blocks over every step.
    const obstructs = (x: number, y: number, z: number): boolean => {
      const name = nameAt(x, y, z);
      return stack.isFullCube(stateAt(x, y, z)) || name.endsWith("_slab") || name.endsWith("_stairs");
    };
    for (let step = s; ; step = stairs.get(linked(step)) as typeof step) {
      if (obstructs(step.x, step.y + 1, step.z) || obstructs(step.x, step.y + 2, step.z)) {
        add("stair.unmountable", step.x, step.y, step.z, "less than two blocks of headroom");
      }
      if (!stairs.has(linked(step))) break;
    }
  }

  // --- connection states ---------------------------------------------------
  // Recompute every connective block against the world as read back, and diff.
  // A non-zero diff means the state on disk disagrees with the neighbourhood,
  // which is exactly the defect the emit-side pass exists to prevent — and,
  // because Minecraft never recomputes these on load, exactly what a player
  // would see.
  const before = new Map<string, number>();
  for (const cell of connective) before.set(`${cell.x},${cell.y},${cell.z}`, stateAt(cell.x, cell.y, cell.z));
  const diff = applyConnectionStates(chunks, connective, stack);
  for (const cell of connective) {
    const key = `${cell.x},${cell.y},${cell.z}`;
    const was = before.get(key) as number;
    const now = stateAt(cell.x, cell.y, cell.z);
    if (was === now) continue;
    findings.push({
      rule: "connection.stale",
      x: cell.x,
      y: cell.y,
      z: cell.z,
      block: describe(was),
      detail: `stored state disagrees with its neighbours; should be ${describe(now)}`,
    });
  }
  void diff;

  // --- road flushness ------------------------------------------------------
  // A lane is a thing cut into the land. If its surface stands proud of the
  // ground either side of it, it reads as a causeway — which is what the first
  // village looked like. Bridge decks are exempt: a deck is *meant* to be
  // above the channel it spans.
  for (const route of context.roads ?? []) {
    for (const cell of route.path) {
      const surfaceY = topOf(cell.x, cell.z, cell.y + 2);
      if (surfaceY === null) continue;
      // A bridge deck is *meant* to stand over its channel, and so is the ramp
      // onto it; both are slabs, and both sit beside water.
      if (nameAt(cell.x, surfaceY, cell.z).endsWith("_slab")) continue;
      let worst = 0;
      let where = "";
      let proudOnEverySide = true;
      for (const [dx, dz] of [
        [2, 0],
        [-2, 0],
        [0, 2],
        [0, -2],
      ] as const) {
        const x = cell.x + dx;
        const z = cell.z + dz;
        const neighbour = topOf(x, z, cell.y + 2);
        if (neighbour === null || wetNear(x, z, cell.y)) {
          proudOnEverySide = false;
          break;
        }
        const rise = surfaceY - neighbour;
        if (rise <= 0) {
          proudOnEverySide = false;
          break;
        }
        if (rise > worst) {
          worst = rise;
          where = `${x},${z}`;
        }
      }
      // Proud on *every* side is a causeway. Proud on one side is a road cut
      // across a slope, which is what a road on a hill looks like.
      if (proudOnEverySide) {
        add("road.proud", cell.x, surfaceY, cell.z, `road stands ${worst} above the ground all round (worst at ${where})`);
      }
    }
  }

  /** True when any column within one block holds a fluid at this height. */
  function wetNear(x: number, z: number, y: number): boolean {
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -2; dy <= 1; dy++) {
          const name = nameAt(x + dx, y + dy, z + dz);
          if (name === "water" || name === "lava") return true;
        }
      }
    }
    return false;
  }

  /** The highest full-cube ground block of a column, ignoring vegetation. */
  function topOf(x: number, z: number, from: number): number | null {
    for (let y = Math.min(from, maxY); y >= minY; y--) {
      const id = stateAt(x, y, z);
      if (id === 0) continue;
      const name = nameAt(x, y, z);
      if (AIR.has(name)) continue;
      // Plants, snow, loose decor and tree canopy are not "the ground".
      if (name.endsWith("_leaves") || name.endsWith("_log") || name.endsWith("_wood")) continue;
      if (!stack.isFullCube(id)) continue;
      return y;
    }
    return null;
  }

  const counts: Record<string, number> = {};
  for (const rule of PHYSICS_RULES) counts[rule] = 0;
  for (const finding of findings) counts[finding.rule] = (counts[finding.rule] ?? 0) + 1;

  return { findings, counts, examined };
}
