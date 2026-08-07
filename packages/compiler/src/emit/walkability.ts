/**
 * The walkability audit — a world **readback** that measures the town as a
 * pedestrian network rather than as a list of correct passes.
 *
 * `physics.ts` exists because renders miss things a walk finds. This module
 * exists because *`physics.ts` misses things a walk finds too*, and for a
 * reason worth stating precisely, since it is the reason the last three rounds
 * of targeted fixes each verified green and each changed nothing Kai could see:
 *
 * > Every check in this compiler measures one pass against its own intent. The
 * > defects that survive are **emergent at co-locations** — four passes each
 * > laid something defensible in the same six columns, and the fifth thing they
 * > add up to has no owner and therefore no test.
 *
 * So this audit deliberately owns nothing and measures only the *sum*. It reads
 * the finished region files, builds the graph a player's legs actually have, and
 * asks four questions no single pass can answer:
 *
 * 1. **Is the network one network?** Every paved column the compiler laid —
 *    carriageway, stair-alley, road, plaza, doorstep — should sit in one
 *    connected component with the external road entrance. A component that is
 *    not the main one is paving nobody can reach; it is reported with the
 *    emitter that laid it.
 * 2. **Does every flight go somewhere?** A stair-alley whose far end touches no
 *    other laid surface is a path into a field. Twenty of them fanning down a
 *    slope is what "the roads aren't connected" looks like from the air.
 * 3. **Can you stand at a junction?** Within a short radius of every place two
 *    emitters' surfaces meet, count the vertical courses — walls, fences,
 *    posts, coping — standing on walkable columns, attributed to the pass that
 *    placed each one. A junction with four courses crossing it is a maze
 *    whichever pass you ask.
 * 4. **Is every drop served?** A tall face is not a defect: a six-block terrace
 *    with a well-made stair is what a hill town *is*. What is a defect is a
 *    face whose connection does not **earn its drop with run** — a flight needs
 *    arc length of roughly twice the height it descends, bought by recessing
 *    into the platform above, hanging along the face, or running out from its
 *    foot. So faces are measured by their *service*, not by their height.
 *
 * ## The one rule that makes this different from the physics walk
 *
 * `lintWorldPhysics`' walking agent may drop three blocks. That is correct for
 * the question it asks ("can a player get from the door to the attic"), and it
 * is exactly wrong for this one: a three-block drop is a **one-way** move, so an
 * agent that takes them will happily flood the whole hillside downhill and
 * pronounce a town connected that a player cannot climb back up through. Here an
 * edge exists only when the move is **reciprocal** — level, or a half-block rise
 * onto a stair or slab that can be walked back down. That single change is what
 * turns "the town is one component" into a statement about the town.
 *
 * Findings are returned, never thrown. The numbers this measures today are
 * **defect goldens**: they record how bad it is, and they must go DOWN.
 */

import type { DressingProbe, DressingReport } from "./dressing.js";
import { auditDressing } from "./dressing.js";
import type { EmitAnvil, EmitChunk, PrismarineStack } from "./prismarine.js";
import { listChunks } from "./prismarine.js";
import type { ColumnPlan } from "../terrain/columns.js";
import type { StructurePassResult } from "../structures/index.js";

/* -------------------------------------------------------------------------- */
/* what the audit is told                                                      */
/* -------------------------------------------------------------------------- */

/** A run of paving one emitter laid, in world columns. */
export interface WalkSurface {
  /**
   * Who laid it — `street:<id>`, `road:<source>`, `plaza`, `doorstep:<source>`.
   *
   * The id is the emitter's own, taken from its ground-contract declaration
   * rather than re-derived, so a finding names something a reader can grep for.
   */
  readonly emitter: string;
  /**
   * What kind of thing it is. `steps` is a stair-alley or connector — the only
   * role for which "does the far end reach anything" is a meaningful question.
   */
  readonly role: "carriageway" | "steps" | "road" | "plaza" | "doorstep";
  /**
   * Columns, in the order the emitter declared them (path order, for steps),
   * each with the level the emitter asked the ground for.
   *
   * The level is a **hint, not an assertion**: the audit still finds the
   * standing cell by reading the world, and the hint only says where to look.
   * It is not optional in practice, and the first version of this module proved
   * why. Scanning down from the sky finds the first thing you can stand on,
   * which for a doorstep column tucked under an eave is *the roof of the house*
   * — and a face measured from a roof to the lane is seventeen blocks of
   * nothing. Anchoring the search to the declared level costs one field and
   * removes a whole class of fictional finding.
   */
  readonly columns: readonly {
    readonly x: number;
    readonly z: number;
    readonly y?: number;
  }[];
}

/** A block, and the pass that put it there. */
export interface AttributedBlock {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly emitter: string;
}

/** Knobs a caller may turn without assembling a whole context. */
export interface WalkabilityTuning {
  /** Search radius around a junction, in columns. */
  readonly junctionRadius?: number;
  /** How many junctions and face runs the report lists. */
  readonly worstJunctions?: number;
  readonly minY?: number;
  readonly maxY?: number;
}

/** Everything the audit needs from the compile that produced the world. */
export interface WalkabilityContext extends WalkabilityTuning {
  readonly surfaces: readonly WalkSurface[];
  /**
   * The emitted structure blocks with their passes, from
   * `StructurePassResult.blockSpans`. Without it the clutter table still
   * counts, but attributes everything to `unattributed`.
   */
  readonly blocks?: readonly AttributedBlock[];
  /**
   * The town's plan bounds, used to say "mid-town" — faces outside it are the
   * hill's own and are nobody's to serve.
   */
  readonly town?: {
    readonly x0: number;
    readonly z0: number;
    readonly x1: number;
    readonly z1: number;
  };
}

/* -------------------------------------------------------------------------- */
/* what the audit answers                                                      */
/* -------------------------------------------------------------------------- */

/** One connected piece of the pedestrian network. */
export interface WalkComponent {
  readonly columns: number;
  /** Emitter → columns of that emitter in this component, worst first. */
  readonly emitters: Readonly<Record<string, number>>;
  /** A column in it, for a `/tp`. */
  readonly sample: { readonly x: number; readonly y: number; readonly z: number };
  /** True for the component holding the external road entrance. */
  readonly main: boolean;
}

/** A flight or path whose far end touches nothing anybody else laid. */
export interface DeadEnd {
  readonly emitter: string;
  readonly role: WalkSurface["role"];
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /**
   * Declared columns walked back from this end before one of them joins
   * something another emitter laid.
   *
   * *Declared* columns, not path cells: a flight claims its whole cross-section,
   * so on a five-wide run this is about five per column of path. It is a
   * severity, not a length — read it against the segment's own total.
   */
  readonly danglingColumns: number;
  readonly detail: string;
}

/** How cluttered one junction is. */
export interface JunctionClutter {
  readonly x: number;
  readonly z: number;
  /** The emitters whose surfaces meet here. */
  readonly meets: readonly string[];
  /** Walkable columns inside the radius. */
  readonly walkable: number;
  /** Vertical-course blocks standing on them. */
  readonly courses: number;
  /** Courses per walkable column — the number that reads as "maze". */
  readonly density: number;
  /** Which pass placed them, worst first. */
  readonly byEmitter: Readonly<Record<string, number>>;
}

/**
 * A run of face — a continuous edge where paving stands two blocks or more over
 * the ground beside it — and what serves it.
 *
 * Reported per run rather than per column because a twelve-column terrace edge
 * is *one* thing a walker meets, and twelve rows of it would bury the two that
 * matter. **A tall face is not the finding.** Kai has ratified the opposite: a
 * six-block terrace with a well-made stair is what a hill town is. The finding
 * is a face whose connection does not earn its drop with run.
 */
export interface FaceService {
  /** The worst column of the run, for a `/tp`. */
  readonly x: number;
  readonly z: number;
  /** Columns of edge in this run. */
  readonly length: number;
  /** Blocks of fall at the worst column. */
  readonly drop: number;
  /**
   * Arc length in columns of the shortest walkable route from the foot of the
   * face to its head — `null` when there is none within {@link SERVICE_REACH}.
   */
  readonly run: number | null;
  /**
   * `run / drop`. A connection earns its drop at {@link EARN_RATIO} or better;
   * at 1 it is a scramble straight up the fall line, and `null` is a wall.
   */
  readonly earned: number | null;
  readonly served: boolean;
}

/** What {@link auditWalkability} found. */
export interface WalkabilityReport {
  /** Laid columns that resolved to a standable cell. */
  readonly columns: number;
  /** Laid columns with no standable cell at all — paving under something. */
  readonly buried: number;
  readonly components: readonly WalkComponent[];
  /** Columns outside the main component. The headline connectivity number. */
  readonly orphanColumns: number;
  /** Orphan columns by emitter, worst first. */
  readonly orphansByEmitter: Readonly<Record<string, number>>;
  /** The column a traveller arrives on, or `null` when no road reached the town. */
  readonly entrance: { readonly x: number; readonly y: number; readonly z: number } | null;
  /**
   * Columns a traveller can reach **on foot from the entrance**, under the same
   * reciprocal-move rule as the rest of this module.
   *
   * This replaced `entranceConnected`, which was a boolean saying whether the
   * entrance happened to fall in the *largest* component. That was a tiebreak
   * wearing a metric's clothes: it read `true` on the hillside fixture and
   * `false` on the steep one, it flipped when two components swapped places
   * without a single block moving, and it said nothing at all about how much of
   * the town a traveller who walks in can actually get to. A share says the
   * thing the walk asks.
   */
  readonly entranceReachable: number;
  /**
   * `entranceReachable / columns` — the headline. One is the target: every
   * paved column reachable from the road that arrives.
   */
  readonly entranceReachableShare: number;
  /** Laid columns with no standable cell, by emitter. */
  readonly buriedByEmitter: Readonly<Record<string, number>>;
  readonly deadEnds: readonly DeadEnd[];
  readonly junctions: readonly JunctionClutter[];
  /** Junctions examined, of which `junctions` lists the worst. */
  readonly junctionCount: number;
  /** Worst clutter density seen. */
  readonly worstDensity: number;
  /** Courses per walkable column over every junction — the emergent number. */
  readonly junctionDensity: number;
  /**
   * The same, at places where exactly one emitter operates — the control.
   *
   * `junctionDensity / soloDensity` is the meta-diagnosis as a ratio: how much
   * of the clutter exists only because two passes met.
   */
  readonly soloDensity: number;
  /**
   * The worst single solo location.
   *
   * Reported beside the aggregate because the aggregate alone cannot settle the
   * argument: if the worst solo place were as bad as the worst junction, the
   * clutter would be one pass's fault and the co-location story would be wrong.
   */
  readonly soloWorstDensity: number;
  readonly soloCount: number;
  /** Mid-town face runs, unserved first then deepest. The worst N of them. */
  readonly faces: readonly FaceService[];
  /** Face runs found, of which `faces` lists the worst. */
  readonly faceRuns: number;
  /** Faces of three or more whose connection does not earn its drop. */
  readonly unservedFaces: number;
  /** Drop → count, over every mid-town face. */
  readonly faceHistogram: Readonly<Record<string, number>>;
  /**
   * The four things a walk sees that a pedestrian graph cannot — floating
   * dressing, intersection cutoffs, plinth roads and sheer built faces. See
   * `emit/dressing.ts`.
   */
  readonly dressing: DressingReport;
}

/* -------------------------------------------------------------------------- */
/* reading the compile                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Assemble the audit's context from the pipeline's own products.
 *
 * Nothing here re-derives geometry. Every surface comes from the emitter's
 * **ground-contract declaration** — the columns it told the resolver it owned,
 * at the levels it asked for — so a finding names the same run the emitter
 * names, and a second rasterization cannot disagree with the first. That is the
 * same discipline `dressStreets` had to learn about `streets.road`.
 *
 * Imports here are type-only: this module reads the emitted world, and the
 * structure pass reads none of it.
 */
export function walkabilityContextOf(
  plan: ColumnPlan,
  structures: StructurePassResult,
  options: { readonly town?: WalkabilityContext["town"] } = {},
): WalkabilityContext {
  const { region } = plan;
  const at = (idx: number): { x: number; z: number } => ({
    x: region.x0 + (idx % region.width),
    z: region.z0 + Math.floor(idx / region.width),
  });
  const surfaces: WalkSurface[] = [];

  for (const segment of structures.streets?.declaration.segments ?? []) {
    surfaces.push({
      emitter: `street:${segment.id}`,
      role: segment.role === "steps" ? "steps" : "carriageway",
      columns: segment.columns.map((c) => ({ ...at(c.idx), y: c.y })),
    });
  }
  for (const route of structures.roads?.declaration.routes ?? []) {
    surfaces.push({
      emitter: `road:${route.source}`,
      role: "road",
      columns: route.columns.map((c) => ({ ...at(c.idx), y: c.y })),
    });
  }
  // The plaza and the doorsteps declare masks rather than levelled runs, so
  // their hint is the finished column plan — which is the same number the
  // resolver settled on, read one step later.
  const paved = structures.plaza?.paved;
  if (paved !== undefined) {
    const columns: { x: number; z: number; y: number }[] = [];
    for (let k = 0; k < paved.length; k++) {
      if (paved[k] === 1) columns.push({ ...at(k), y: plan.ground[k] as number });
    }
    if (columns.length > 0) surfaces.push({ emitter: "plaza", role: "plaza", columns });
  }
  // Every doorstep, cut or stepped: `touched` is the one set that covers both,
  // and a stepped door contributes no ground declaration at all.
  const touched = structures.doorsteps.touched;
  const doorstepColumns: { x: number; z: number; y: number }[] = [];
  for (let k = 0; k < touched.length; k++) {
    if (touched[k] === 1) doorstepColumns.push({ ...at(k), y: plan.ground[k] as number });
  }
  if (doorstepColumns.length > 0) {
    surfaces.push({ emitter: "doorsteps", role: "doorstep", columns: doorstepColumns });
  }

  const blocks: AttributedBlock[] = [];
  for (const span of structures.blockSpans) {
    for (let i = span.from; i < span.to; i++) {
      const block = structures.blocks[i];
      if (block === undefined) continue;
      blocks.push({ x: block.x, y: block.y, z: block.z, emitter: span.emitter });
    }
  }

  return {
    surfaces,
    blocks,
    ...(options.town === undefined ? {} : { town: options.town }),
  };
}

/* -------------------------------------------------------------------------- */
/* the block vocabulary                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Blocks a 1×2 player body cannot stand inside.
 *
 * Copied in spirit from `physics.ts` rather than shared, because the two
 * modules want different edges of the same judgement and a shared predicate
 * would have to be right for both. Erring towards "impassable" is the safe
 * direction here: a false impassable costs a spurious component, which a reader
 * sees; a false passable hides a wall, which is the defect.
 */
const IMPASSABLE =
  /(_slab|_stairs|_fence|_wall|_bed|_pane|iron_bars|_gate|chest|barrel|furnace|_table|loom|anvil|cauldron|composter|bookshelf|lectern|campfire|_shulker_box|hopper|beacon|conduit|lantern|bell|grindstone|stonecutter|brewing_stand|enchanting_table|_cake|dragon_egg)$/;

/** Partial blocks whose top face is flat enough to stand on. */
const STANDABLE_PARTIAL = /(_slab|_stairs)$/;

/** Blocks whose top face is solid enough to walk on though they are not cubes. */
const SOLID_TOP = /(_leaves|dirt_path|farmland|soul_sand|mud|snow_block|_carpet|scaffolding)$/;

const AIR = new Set(["air", "cave_air", "void_air"]);

/**
 * A **vertical course**: masonry or joinery that stands up out of the pavement
 * and divides it.
 *
 * This is the clutter vocabulary, and it is deliberately narrow. A wall block,
 * a fence, a lamp post's own column, a coping cap: things you walk *around*.
 * It excludes the pavement itself, plants, and anything above head height,
 * because the complaint is that the ground plane is subdivided, not that the
 * town has furniture.
 */
const COURSE =
  /(_wall|_fence|iron_bars|_pane|fence_gate|_log|_stem|cobblestone|stone_brick|_bricks|_stairs|_slab|stone|deepslate|andesite|granite|diorite|_planks|_wood|_concrete|_terracotta)$/;

/** The step law: a half-block rise, and nothing else, is reciprocal. */
const NEIGHBOURS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

const FACING: Readonly<Record<string, readonly [number, number]>> = Object.freeze({
  north: [0, -1],
  south: [0, 1],
  west: [-1, 0],
  east: [1, 0],
});

/* -------------------------------------------------------------------------- */
/* the audit                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Read a world back and measure it as a pedestrian network.
 *
 * The whole region is loaded first, exactly as the physics lint loads it and
 * for the same reason: every question here is about a column's neighbours, and
 * half the interesting neighbours are in another chunk.
 */
export async function auditWalkability(
  worldDir: string,
  stack: PrismarineStack,
  context: WalkabilityContext,
): Promise<WalkabilityReport> {
  const minY = context.minY ?? 40;
  const maxY = context.maxY ?? 200;
  const radius = context.junctionRadius ?? 6;
  const worst = context.worstJunctions ?? 12;
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
  const passableAt = (x: number, y: number, z: number): boolean => {
    const id = stateAt(x, y, z);
    if (id === 0) return true;
    if (stack.isFullCube(id)) return false;
    return !IMPASSABLE.test(nameAt(x, y, z));
  };
  const supportAt = (x: number, y: number, z: number): boolean => {
    const id = stateAt(x, y, z);
    if (id === 0) return false;
    if (stack.isFullCube(id)) return true;
    const name = nameAt(x, y, z);
    return STANDABLE_PARTIAL.test(name) || SOLID_TOP.test(name);
  };
  const standable = (x: number, y: number, z: number): boolean =>
    supportAt(x, y - 1, z) && passableAt(x, y, z) && passableAt(x, y + 1, z);
  /** Empty, in the literal sense the dressing audit needs: no state at all. */
  const airAt = (x: number, y: number, z: number): boolean => stateAt(x, y, z) === 0;
  const propsAt = (
    x: number,
    y: number,
    z: number,
  ): { name: string; props: Readonly<Record<string, string>> } | undefined =>
    stack.blockStateProps(stateAt(x, y, z));

  /**
   * A half-block rise onto `(x, y, z)` entered from direction `(dx, dz)`.
   *
   * The same law the physics agent uses, and the *only* upward move allowed
   * here: everything else is a jump, and a town you have to jump around is the
   * complaint, not the baseline.
   */
  const halfStepFrom = (x: number, y: number, z: number, dx: number, dz: number): boolean => {
    const id = stateAt(x, y, z);
    if (id === 0 || stack.isFullCube(id)) return false;
    const decoded = stack.blockStateProps(id);
    if (decoded === undefined) return false;
    const { name, props } = decoded;
    if (name.endsWith("_slab")) return props["type"] === "bottom";
    if (!name.endsWith("_stairs")) return false;
    if (props["half"] !== "bottom") return false;
    const [fx, fz] = FACING[props["facing"] ?? "north"] ?? [0, -1];
    if (dx === fx && dz === fz) return true;
    if (dx * fx + dz * fz !== 0) return false;
    return passableAt(x - fx, y + 1, z - fz);
  };

  /* --- the standing cell of each laid column ------------------------------ */

  /** `"x,z"` → the y a player's feet occupy when standing on the paving there. */
  const feet = new Map<string, number>();
  /** `"x,z"` → every emitter that laid it. */
  const laidBy = new Map<string, string[]>();
  /** `"x,z"` → the roles laid there. */
  const roleAt = new Map<string, Set<WalkSurface["role"]>>();
  let buried = 0;
  const buriedKeys = new Set<string>();
  const buriedCounts = new Map<string, number>();

  for (const surface of context.surfaces) {
    for (const cell of surface.columns) {
      const key = `${cell.x},${cell.z}`;
      const owners = laidBy.get(key);
      if (owners === undefined) laidBy.set(key, [surface.emitter]);
      else if (!owners.includes(surface.emitter)) owners.push(surface.emitter);
      const roles = roleAt.get(key);
      if (roles === undefined) roleAt.set(key, new Set([surface.role]));
      else roles.add(surface.role);
      if (feet.has(key) || buriedKeys.has(key)) continue;
      const y = topStanding(cell.x, cell.z, cell.y);
      if (y === null) {
        buried++;
        buriedKeys.add(key);
        buriedCounts.set(surface.emitter, (buriedCounts.get(surface.emitter) ?? 0) + 1);
      } else feet.set(key, y);
    }
  }

  /**
   * The topmost cell a player can stand in over this column.
   *
   * Scanned down from the sky rather than up from the plan's ground, because
   * the plan is what the compiler *meant* and this module exists to measure
   * what it did. A roofed passage or an arch would give a lower answer, and the
   * lower answer would be the one a walker gets — so the scan stops at the
   * first standable cell from above, which is that answer.
   */
  function topStanding(x: number, z: number, hint?: number): number | null {
    if (hint !== undefined) {
      // Outward from the declared level: the tread the emitter asked for, then
      // a course of dressing over it, then a landing cut below it. Beyond
      // `LEVEL_SLACK` the cell is not this emitter's paving whatever it is.
      for (let d = 0; d <= LEVEL_SLACK; d++) {
        for (const y of d === 0 ? [hint + 1] : [hint + 1 + d, hint + 1 - d]) {
          if (y > minY && y < maxY && standable(x, y, z)) return y;
        }
      }
      return null;
    }
    for (let y = maxY - 2; y > minY; y--) {
      if (standable(x, y, z)) return y;
    }
    return null;
  }

  /**
   * The ground beside a laid column, looking **down** from its level.
   *
   * A face is what you would fall off, so the thing at the bottom of it is the
   * first standable cell at or below where you are standing. Searching from the
   * sky instead would answer with the neighbouring building's roof and call a
   * house a cliff.
   */
  function groundStanding(x: number, z: number, from: number): number | null {
    for (let y = from; y > minY; y--) if (standable(x, y, z)) return y;
    return null;
  }

  /* --- 1: the pedestrian graph, with reciprocal edges only ---------------- */

  const keys = [...feet.keys()].sort();
  const indexOf = new Map<string, number>(keys.map((k, i) => [k, i] as const));
  const parent = new Int32Array(keys.length);
  for (let i = 0; i < parent.length; i++) parent[i] = i;
  const find = (i: number): number => {
    let r = i;
    while (parent[r] !== r) r = parent[r] as number;
    while (parent[i] !== r) {
      const next = parent[i] as number;
      parent[i] = r;
      i = next;
    }
    return r;
  };
  const union = (a: number, b: number): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };

  /**
   * True when a walker can go from `a` to `b` **and back**.
   *
   * The step law, and it is the load-bearing judgement in this module:
   *
   * - **Level, or one block either way, is an edge.** A player jumps without
   *   thinking about it, every graded street in this compiler steps a block per
   *   column by design (1-Lipschitz, full blocks), and a rule that called those
   *   disconnected would report the entire town as rubble and measure nothing.
   * - **Two blocks or more is not an edge**, in either direction. This is the
   *   half of the law that earns its keep: a two-block drop is a *one-way* move,
   *   and the physics lint's agent takes drops of three, so it floods a
   *   hillside downhill and pronounces connected a town no player can climb.
   *   Connection has to mean you can come back.
   *
   * `halfStepFrom` is not consulted here for the same reason: a stair tread is a
   * nicer way to cross one block of rise, not a different topological fact.
   */
  const reciprocal = (
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
  ): boolean => {
    if (Math.abs(by - ay) > 1) return false;
    const head = Math.max(ay, by);
    return (
      passableAt(bx, by, bz) &&
      passableAt(bx, by + 1, bz) &&
      passableAt(ax, head + 1, az) &&
      passableAt(bx, head + 1, bz)
    );
  };

  for (const key of keys) {
    const [x, z] = key.split(",").map(Number) as [number, number];
    const y = feet.get(key) as number;
    for (const [dx, dz] of NEIGHBOURS) {
      const nk = `${x + dx},${z + dz}`;
      const ny = feet.get(nk);
      if (ny === undefined) continue;
      if (!reciprocal(x, y, z, x + dx, ny, z + dz)) continue;
      union(indexOf.get(key) as number, indexOf.get(nk) as number);
    }
  }

  const buckets = new Map<number, string[]>();
  for (const key of keys) {
    const root = find(indexOf.get(key) as number);
    const bucket = buckets.get(root);
    if (bucket === undefined) buckets.set(root, [key]);
    else bucket.push(key);
  }

  /**
   * The **main** component is the largest, and the entrance is reported against
   * it rather than defining it.
   *
   * The first version of this defined main as "whatever holds the external road
   * entrance", which is the right definition for a town that is one town and a
   * useless one for this world: the entrance turned out to sit in a two-column
   * stub, so every number came out as 99.96% orphaned and told a reader nothing
   * about where the town breaks. Largest-is-main plus an explicit
   * {@link WalkabilityReport.entranceReachableShare} says both things — how
   * fragmented the network is, *and* how much of it a traveller who walks in can
   * get to — without either hiding the other. The share is what replaced the
   * boolean that used to sit here: "is the entrance in the biggest piece" is a
   * tiebreak between components, not a statement about the walk.
   */
  const entrance = externalEntrance(context, feet);
  const ordered = [...buckets.values()].sort((a, b) => b.length - a.length);
  const mainKeys = ordered[0];
  const components: WalkComponent[] = ordered.map((bucket) => {
    const counts = new Map<string, number>();
    for (const key of bucket) {
      for (const emitter of laidBy.get(key) ?? []) {
        counts.set(emitter, (counts.get(emitter) ?? 0) + 1);
      }
    }
    const [sx, sz] = (bucket[0] as string).split(",").map(Number) as [number, number];
    return {
      columns: bucket.length,
      emitters: sortedCounts(counts),
      sample: { x: sx, y: feet.get(bucket[0] as string) as number, z: sz },
      main: bucket === mainKeys,
    };
  });

  const orphanCounts = new Map<string, number>();
  let orphanColumns = 0;
  const mainSet = new Set(mainKeys ?? []);
  for (const key of keys) {
    if (mainSet.has(key)) continue;
    orphanColumns++;
    for (const emitter of laidBy.get(key) ?? []) {
      orphanCounts.set(emitter, (orphanCounts.get(emitter) ?? 0) + 1);
    }
  }

  /* --- 2: dead ends -------------------------------------------------------- */

  const deadEnds: DeadEnd[] = [];
  for (const surface of context.surfaces) {
    if (surface.role === "plaza" || surface.role === "doorstep") continue;
    if (surface.columns.length < 2) continue;
    for (const end of [
      surface.columns[surface.columns.length - 1] as { x: number; z: number },
      surface.columns[0] as { x: number; z: number },
    ]) {
      // How far back from this end you have to walk before you are beside
      // anything a different emitter laid. Zero is a proper join.
      let dangling = 0;
      let at = end;
      const path = surface.columns;
      const order = path[0] === end ? path : [...path].reverse();
      for (const cell of order) {
        if (joinsOther(cell.x, cell.z, surface.emitter)) break;
        dangling++;
        at = cell;
      }
      if (dangling === 0) continue;
      // A stub of one or two columns is a kerb detail; a run of them is a path
      // into a field. The bar is `MIN_DANGLE`, and it is a reporting threshold,
      // not a judgement about where the defect starts.
      if (dangling < MIN_DANGLE) continue;
      deadEnds.push({
        emitter: surface.emitter,
        role: surface.role,
        x: at.x,
        y: feet.get(`${at.x},${at.z}`) ?? -1,
        z: at.z,
        danglingColumns: dangling,
        detail: `${dangling} declared column(s) from this end join nothing any other emitter laid`,
      });
    }
  }
  deadEnds.sort((a, b) => b.danglingColumns - a.danglingColumns);

  /**
   * True when a walker standing here can **step onto** something a different
   * emitter laid.
   *
   * The first version of this asked only whether another emitter's column was
   * within one step in plan, and it found two dead ends on a world with
   * twenty-odd of them — because a connector that arrives at a street five
   * blocks above it *is* adjacent to it, in plan, and is not joined to it in any
   * sense a pair of legs recognises. Adjacency is what the planner works in;
   * the whole reason this module reads the world back is that adjacency is not
   * what the walk is. So the test is a graph edge.
   */
  function joinsOther(x: number, z: number, mine: string): boolean {
    const y = feet.get(`${x},${z}`);
    if (y === undefined) return false;
    for (const [dx, dz] of NEIGHBOURS) {
      const key = `${x + dx},${z + dz}`;
      const owners = laidBy.get(key);
      if (owners === undefined || !owners.some((o) => o !== mine)) continue;
      const ny = feet.get(key);
      if (ny === undefined) continue;
      if (reciprocal(x, y, z, x + dx, ny, z + dz)) return true;
    }
    return false;
  }

  /* --- 3: junction clutter ------------------------------------------------- */

  /** Blocks by column, for the clutter count. */
  const columnBlocks = new Map<string, AttributedBlock[]>();
  for (const block of context.blocks ?? []) {
    const key = `${block.x},${block.z}`;
    if (!feet.has(key) && !nearLaid(key)) continue;
    const at = columnBlocks.get(key);
    if (at === undefined) columnBlocks.set(key, [block]);
    else at.push(block);
  }

  function nearLaid(key: string): boolean {
    const [x, z] = key.split(",").map(Number) as [number, number];
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) if (feet.has(`${x + dx},${z + dz}`)) return true;
    }
    return false;
  }

  /** The walking planes a column at `(x, z)` stands in — its own and its neighbours'. */
  function planesNear(x: number, z: number): number[] {
    const out = new Set<number>();
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const y = feet.get(`${x + dx},${z + dz}`);
        if (y !== undefined) out.add(y);
      }
    }
    return [...out];
  }

  // A junction is a column where two emitters' surfaces meet — which is the
  // definition that matters, because it is exactly the co-location this whole
  // module exists to look at. Clustered so one crossing is one row.
  const junctionSeeds: { x: number; z: number; meets: string[] }[] = [];
  /**
   * The **control**: places where exactly one emitter operates, sampled the same
   * way and measured with the same ruler.
   *
   * This is the whole meta-diagnosis made falsifiable. If the town is cluttered
   * because the passes are individually heavy-handed, solo places will measure
   * as badly as junctions and the story is wrong. If clutter is emergent at
   * co-locations, the two numbers will differ, and the difference is the size of
   * the thing no existing test can see. Kai's bright-spot screenshot is a solo
   * place; it is here as a number rather than as a screenshot.
   */
  const soloSeeds: { x: number; z: number; meets: string[] }[] = [];
  for (const key of keys) {
    const [x, z] = key.split(",").map(Number) as [number, number];
    const meets = new Set<string>();
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        for (const owner of laidBy.get(`${x + dx},${z + dz}`) ?? []) meets.add(owner);
      }
    }
    (meets.size >= 2 ? junctionSeeds : soloSeeds).push({ x, z, meets: [...meets].sort() });
  }
  /** Thin a seed list to points no two of which share a disc. */
  const thin = (
    seeds: readonly { x: number; z: number; meets: string[] }[],
    taken: Set<string>,
  ): { x: number; z: number; meets: string[] }[] => {
    const out: { x: number; z: number; meets: string[] }[] = [];
    for (const seed of seeds) {
      if (taken.has(`${seed.x},${seed.z}`)) continue;
      out.push(seed);
      for (let dz = -radius; dz <= radius; dz++) {
        for (let dx = -radius; dx <= radius; dx++) taken.add(`${seed.x + dx},${seed.z + dz}`);
      }
    }
    return out;
  };
  // Junctions claim their discs first: a solo sample must be somewhere no
  // junction reaches, or it is not measuring solitude.
  const claimed = new Set<string>();
  const junctionPoints = thin(junctionSeeds, claimed);
  const soloPoints = thin(soloSeeds, claimed);

  const measure = (point: { x: number; z: number; meets: string[] }): JunctionClutter => {
    let walkable = 0;
    let courses = 0;
    const byEmitter = new Map<string, number>();
    for (let dz = -radius; dz <= radius; dz++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const x = point.x + dx;
        const z = point.z + dz;
        const key = `${x},${z}`;
        if (feet.has(key)) walkable++;
        // A course does **not** stand on the pavement — it stands beside it, in
        // the column you have to walk round. So the scan is over every column in
        // the disc, and what makes a block a course is that it stands in
        // somebody's walking plane: within head height of a laid column one step
        // away. That is the pedestrian's definition and the only one that
        // catches the thing in the screenshot, which is four low walls in the
        // gaps *between* four pavements.
        const planes = planesNear(x, z);
        if (planes.length === 0) continue;
        for (const block of columnBlocks.get(key) ?? []) {
          if (!planes.some((y) => block.y >= y && block.y <= y + 2)) continue;
          // The pavement's own tread is the connection, not the obstacle: a
          // block a player can stand on top of, at the level they would stand,
          // is floor.
          if (standable(block.x, block.y + 1, block.z)) continue;
          const name = nameAt(block.x, block.y, block.z);
          if (AIR.has(name) || !COURSE.test(name)) continue;
          courses++;
          byEmitter.set(block.emitter, (byEmitter.get(block.emitter) ?? 0) + 1);
        }
      }
    }
    return {
      x: point.x,
      z: point.z,
      meets: point.meets,
      walkable,
      courses,
      density: walkable === 0 ? 0 : round3(courses / walkable),
      byEmitter: sortedCounts(byEmitter),
    };
  };
  const junctions: JunctionClutter[] = junctionPoints.map(measure);
  junctions.sort((a, b) => b.density - a.density || b.courses - a.courses);
  const solo: JunctionClutter[] = soloPoints.map(measure);
  solo.sort((a, b) => b.density - a.density);
  const aggregate = (rows: readonly JunctionClutter[]): number => {
    let w = 0;
    let c = 0;
    for (const row of rows) {
      w += row.walkable;
      c += row.courses;
    }
    return w === 0 ? 0 : round3(c / w);
  };

  /* --- 4: faces, and whether their drop is earned ------------------------- */

  /** Every face column found, before they are grouped into runs. */
  const faceColumns: {
    x: number;
    z: number;
    drop: number;
    foot: { x: number; y: number; z: number };
  }[] = [];
  const faces = measureFaces();

  function measureFaces(): FaceService[] {
    const town = context.town;
    for (const key of keys) {
      const [x, z] = key.split(",").map(Number) as [number, number];
      if (town !== undefined && (x < town.x0 || x > town.x1 || z < town.z0 || z > town.z1)) continue;
      const y = feet.get(key) as number;
      let worst = 0;
      let foot: { x: number; y: number; z: number } | null = null;
      for (const [dx, dz] of NEIGHBOURS) {
        // The face is measured against the *ground* beside the paving, not only
        // against other paving: the drop off the edge of a terrace is a face
        // whether or not anybody paved its foot.
        const below = groundStanding(x + dx, z + dz, y);
        if (below === null) continue;
        const drop = y - below;
        if (drop > worst) {
          worst = drop;
          foot = { x: x + dx, y: below, z: z + dz };
        }
      }
      if (worst < 2 || foot === null) continue;
      faceColumns.push({ x, z, drop: worst, foot });
    }

    // Group into runs: face columns that touch are one edge.
    const byKey = new Map<string, (typeof faceColumns)[number]>(
      faceColumns.map((f) => [`${f.x},${f.z}`, f] as const),
    );
    const done = new Set<string>();
    const out: FaceService[] = [];
    for (const face of faceColumns) {
      const start = `${face.x},${face.z}`;
      if (done.has(start)) continue;
      const run = [face];
      done.add(start);
      for (let head = 0; head < run.length; head++) {
        const cell = run[head] as (typeof faceColumns)[number];
        for (let dz = -1; dz <= 1; dz++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nk = `${cell.x + dx},${cell.z + dz}`;
            if (done.has(nk)) continue;
            const next = byKey.get(nk);
            if (next === undefined) continue;
            done.add(nk);
            run.push(next);
          }
        }
      }
      const deepest = run.reduce((a, b) => (b.drop > a.drop ? b : a));
      const head = feet.get(`${deepest.x},${deepest.z}`) as number;
      const climb = climbRun(deepest.foot.x, deepest.foot.y, deepest.foot.z, head);
      out.push({
        x: deepest.x,
        z: deepest.z,
        length: run.length,
        drop: deepest.drop,
        run: climb,
        earned: climb === null ? null : round3(climb / deepest.drop),
        served: climb !== null && climb >= EARN_RATIO * deepest.drop,
      });
    }
    out.sort(
      (a, b) =>
        Number(a.served) - Number(b.served) || b.drop - a.drop || b.length - a.length,
    );
    return out;
  }

  /**
   * The shortest *walkable* climb from the foot of a face up to its head, in
   * columns of arc.
   *
   * This is the whole of Kai's rule made measurable. A six-block face is not a
   * defect; a six-block face you can only get up by walking two hundred columns
   * round the block is. So the search is bounded by {@link SERVICE_REACH}, and
   * what it returns is the arc length of the best route it found — which the
   * caller compares against the drop. A route of two columns per block of fall
   * is a stair; less is a scramble; none is a wall.
   */
  function climbRun(fx: number, fy: number, fz: number, target: number): number | null {
    const start = `${fx},${fz}`;
    const dist = new Map<string, number>([[start, 0]]);
    const queue: { x: number; y: number; z: number; d: number }[] = [
      { x: fx, y: fy, z: fz, d: 0 },
    ];
    for (let head = 0; head < queue.length; head++) {
      const cell = queue[head] as { x: number; y: number; z: number; d: number };
      if (cell.y >= target) return cell.d;
      if (cell.d >= SERVICE_REACH) continue;
      for (const [dx, dz] of NEIGHBOURS) {
        const nx = cell.x + dx;
        const nz = cell.z + dz;
        const key = `${nx},${nz}`;
        if (dist.has(key)) continue;
        // Only cells within the band the face spans: a route that wanders off
        // downhill and comes back is not the connection anybody would walk.
        for (const ny of [cell.y, cell.y + 1, cell.y - 1]) {
          if (!standable(nx, ny, nz)) continue;
          if (!reciprocal(cell.x, cell.y, cell.z, nx, ny, nz)) continue;
          dist.set(key, cell.d + 1);
          queue.push({ x: nx, y: ny, z: nz, d: cell.d + 1 });
          break;
        }
      }
    }
    return null;
  }

  /* --- 5: how much of the town a traveller who walks in can reach ---------- */

  // The reciprocal graph is undirected, so "reachable from the entrance" *is*
  // the entrance's own component — no second traversal, and no chance of the two
  // answers drifting apart.
  const entranceIndex = entrance === null ? undefined : indexOf.get(entrance);
  const entranceReachable =
    entranceIndex === undefined ? 0 : (buckets.get(find(entranceIndex))?.length ?? 0);

  /* --- 6: the four things the graph cannot see ---------------------------- */

  const probe: DressingProbe = {
    nameAt,
    propsAt,
    airAt,
    supportAt,
    standable,
    groundStanding,
    feet,
    laidBy,
    roleAt,
    blocks: context.blocks ?? [],
    ...(context.town === undefined ? {} : { town: context.town }),
    minY,
    maxY,
  };
  const dressing = auditDressing(probe);

  const histogram = new Map<string, number>();
  for (const face of faceColumns) {
    const bucket = `drop${face.drop}`;
    histogram.set(bucket, (histogram.get(bucket) ?? 0) + 1);
  }

  return {
    columns: keys.length,
    buried,
    buriedByEmitter: sortedCounts(buriedCounts),
    components,
    orphanColumns,
    orphansByEmitter: sortedCounts(orphanCounts),
    entrance: entrance === null ? null : entranceAt(entrance, feet),
    entranceReachable,
    entranceReachableShare: keys.length === 0 ? 0 : round3(entranceReachable / keys.length),
    deadEnds,
    junctions: junctions.slice(0, worst),
    junctionCount: junctions.length,
    worstDensity: junctions[0]?.density ?? 0,
    junctionDensity: aggregate(junctions),
    soloDensity: aggregate(solo),
    soloWorstDensity: solo[0]?.density ?? 0,
    soloCount: solo.length,
    faces: faces.slice(0, worst),
    faceRuns: faces.length,
    unservedFaces: faces.filter((f) => f.drop >= 3 && !f.served).length,
    faceHistogram: Object.fromEntries(
      [...histogram.entries()].sort(
        ([a], [b]) => Number(a.slice(4)) - Number(b.slice(4)),
      ),
    ),
    dressing,
  };
}

/* -------------------------------------------------------------------------- */
/* the constants, each of which is a judgement                                 */
/* -------------------------------------------------------------------------- */

/**
 * Arc length a connection must buy per block of fall.
 *
 * Kai's rule, stated as a number: *"a connection between two levels must earn
 * its drop with run"*. Two columns per block is a comfortable outdoor stair —
 * the treads a `SweptProfile` flight already lays. It is a ratio rather than a
 * cap on the drop, deliberately: a six-block terrace with a twelve-column
 * recessed stairway passes, and that is the town Kai wants.
 */
export const EARN_RATIO = 2;

/** How far a walker will go to find a way up before calling a face a wall. */
export const SERVICE_REACH = 48;

/**
 * How far from an emitter's declared level its finished surface may be found.
 *
 * Three: a tread laid at the level, a course of dressing over it, a landing cut
 * a block under it, and one block of slack for the transition the resolver
 * absorbed. Wider and the search starts finding the storey above.
 */
export const LEVEL_SLACK = 3;

/** Dangling columns below which an unjoined end is a kerb detail, not a path. */
export const MIN_DANGLE = 3;

/* -------------------------------------------------------------------------- */
/* helpers                                                                     */
/* -------------------------------------------------------------------------- */

function sortedCounts(counts: ReadonlyMap<string, number>): Record<string, number> {
  return Object.fromEntries(
    [...counts.entries()].sort(([a, x], [b, y]) => y - x || (a < b ? -1 : 1)),
  );
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

/**
 * The column a traveller arrives on: the `road` column furthest from the
 * centroid of everything else laid.
 *
 * "Furthest out" rather than "on the region edge" because a road that stops
 * short of the edge is still the way in, and this audit must not fail to find
 * an entrance on a world whose router refused a leg.
 */
/** The entrance column as a point, for the report. */
function entranceAt(
  key: string,
  feet: ReadonlyMap<string, number>,
): { x: number; y: number; z: number } {
  const [x, z] = key.split(",").map(Number) as [number, number];
  return { x, y: feet.get(key) ?? -1, z };
}

function externalEntrance(
  context: WalkabilityContext,
  feet: ReadonlyMap<string, number>,
): string | null {
  let cx = 0;
  let cz = 0;
  let n = 0;
  for (const surface of context.surfaces) {
    for (const cell of surface.columns) {
      cx += cell.x;
      cz += cell.z;
      n++;
    }
  }
  if (n === 0) return null;
  cx /= n;
  cz /= n;
  let best: string | null = null;
  let bestD = -1;
  for (const surface of context.surfaces) {
    if (surface.role !== "road") continue;
    for (const cell of surface.columns) {
      const key = `${cell.x},${cell.z}`;
      if (!feet.has(key)) continue;
      const d = (cell.x - cx) ** 2 + (cell.z - cz) ** 2;
      if (d > bestD) {
        bestD = d;
        best = key;
      }
    }
  }
  return best;
}
