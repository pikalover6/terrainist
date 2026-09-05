/**
 * The high-rise grammar — the tall half of `building.grammar@0`.
 *
 * The cottage grammar in `core.ts` builds one or two storeys under a pitched
 * roof, and every one of its decisions is right for that building and wrong for
 * a tower: a gable over a twenty-storey office is a hat, a timber belt course
 * at every floor line is a stripe, and — the reason this is a separate emitter
 * rather than a parameter — its circulation model is a single straight flight
 * between two planes. A tower is mostly circulation. So this file owns the
 * three things a tall building is actually made of:
 *
 * - a **switchback stair core**, which reaches every floor by turning back on
 *   itself at each landing rather than by running further and further along a
 *   footprint that is not getting any longer;
 * - a **curtain-wall facade**, whose rhythm is a mullion column and two lights
 *   repeating, spandrel band at the sill and floor band at the head — the thing
 *   that makes a stack of storeys read as one building;
 * - a **roof that is a roof deck**: parapet, and a plant-room box, because a
 *   flat top with nothing on it reads as an unfinished building.
 *
 * ## Deliberate constraints
 *
 * Two lint rules shape the geometry more than taste does, and both are worth
 * stating because they look like arbitrary choices otherwise.
 *
 * `interior.blocked_column` fires on any interior column that is solid from
 * floor to ceiling — which is every column of a full-height partition wall. The
 * answer is not to build shorter walls (a hotel room with waist-high walls is
 * not a hotel room) but to be honest about what a partition *is*: a wall. Wall
 * columns are not floor, so they are excluded from `meta.floorCells`, exactly
 * as the perimeter wall's columns always have been.
 *
 * `traversal.unreachable` walks from the door and demands that every standable
 * interior cell on every level be reached. That is the switchback's real
 * specification, and the two facts the flight geometry turns on are the ones
 * `core.ts` learned the hard way: the run is `storeyHeight` steps long with its
 * **top step in the arriving plane**, and it starts one cell off the wall with
 * an **open approach cell** in front of it, because a bottom-half stair whose
 * front face is buried in a wall is a full block to walk into.
 *
 * ## Coordinates
 *
 * Identical to `core.ts`: node-local, unrotated, `y = 0` is the ground-floor
 * plane, `y < 0` is the foundation skirt, and the one-block ring outside the
 * footprint is the apron (only the balconies use it here). The generator never
 * rotates; `rotateOps` does that once, afterwards.
 *
 * ## Dependency direction
 *
 * `core.ts` imports {@link emitHighrise}; this file imports **only types** back
 * from it. That keeps the cycle type-level, which TypeScript erases, so there
 * is no module-initialisation order to reason about at runtime.
 */
import type { BuildingDescriptor } from "./descriptor.js";
import { positionFloat, type Seed256 } from "../determinism/index.js";

import type {
  BuildingMeta,
  BuildingResult,
  Cardinal,
  Footprint,
  LocalRect,
  LocalVoxelOp,
  OutlineCell,
  Put,
  ResolvedBuildingParams,
  Shell,
} from "./core.js";
import { materialKey, type BuildingMaterials } from "./themes.js";

/* -------------------------------------------------------------------------- */
/* the archetypes                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The tall archetypes, in catalog order.
 *
 * `skyscraper` and `office` are the same building at two scales — an open plate
 * over a core — and they are two names rather than one because an author who
 * writes "office" does not mean twenty storeys and an author who writes
 * "skyscraper" does not mean six. `hotel` repeats a partitioned guest floor,
 * and `apartment_block` is the same massing with balconies and a shorter cap.
 */
export const HIGHRISE_ARCHETYPES = ["skyscraper", "office", "hotel", "apartment_block"] as const;

/** One of the tall archetypes. */
export type HighriseArchetype = (typeof HIGHRISE_ARCHETYPES)[number];

/** True for a name in {@link HIGHRISE_ARCHETYPES}. */
export function isHighriseArchetype(name: string): name is HighriseArchetype {
  return (HIGHRISE_ARCHETYPES as readonly string[]).includes(name);
}

/**
 * Tag → tall archetype, or `null` when no tag matches.
 *
 * Consulted by `archetypeOfTags` **before** the older tables, for the same
 * reason the extended one is: `tower` would otherwise be swallowed by the
 * watchtower rule, and `lodging`/`inn` by the inn.
 */
export function highriseArchetypeOfTags(tags: readonly string[]): HighriseArchetype | null {
  const has = (t: string): boolean => tags.includes(t);
  if (has("skyscraper") || has("high_rise") || has("highrise") || has("tower_block")) {
    return "skyscraper";
  }
  if (has("hotel") || has("lodging") || has("guesthouse")) return "hotel";
  if (has("apartment") || has("apartment_block") || has("tenement") || has("flats")) {
    return "apartment_block";
  }
  if (has("office") || has("offices") || has("corporate") || has("headquarters")) return "office";
  return null;
}

/* -------------------------------------------------------------------------- */
/* the envelope a tall building may ask for                                    */
/* -------------------------------------------------------------------------- */

/**
 * Most storeys each archetype builds.
 *
 * A cap per archetype rather than one shared number, because the caps are
 * saying different things: a skyscraper's twenty is "as tall as this grammar's
 * core stays plausible", and an apartment block's ten is "past this it is not
 * an apartment block any more, it is a tower".
 */
export const HIGHRISE_MAX_FLOORS: Readonly<Record<HighriseArchetype, number>> = Object.freeze({
  skyscraper: 28,
  office: 20,
  hotel: 14,
  apartment_block: 10,
});

/** Fewest storeys that make the tall grammar the right one to use. */

/** Widest footprint axis a tall building may ask the solver for, in blocks. */
export const HIGHRISE_MAX_WIDTH = 24;

/** Narrowest footprint that still fits a core and a plate beside it. */
export const HIGHRISE_MIN_WIDTH = 7;

/** Storey height the tall grammar builds at when the document does not say. */
export const HIGHRISE_STOREY_HEIGHT = 4;

/** Cells the switchback core needs along the run axis: approach + run + turn. */
export function coreDepthFor(storeyHeight: number): number {
  return storeyHeight + 2;
}

/* -------------------------------------------------------------------------- */
/* the request                                                                 */
/* -------------------------------------------------------------------------- */

/** What `core.ts` hands over when it dispatches a tall archetype here. */
export interface HighriseRequest {
  readonly put: Put;
  readonly cells: Map<string, LocalVoxelOp>;
  readonly style: Readonly<Record<string, string>>;
  /** The node's material stream — every accent draw hangs off it. */
  readonly grammar: Seed256;
  /** The fit-out's stream. */
  readonly choice: Seed256;
  readonly sx: number;
  readonly sy: number;
  readonly sz: number;
  readonly foundationDepth: number;
  readonly door: { readonly x: number; readonly y?: number; readonly z: number; readonly face: Cardinal } | null;
  readonly materials: BuildingMaterials;
  readonly params: ResolvedBuildingParams;
  readonly archetype: HighriseArchetype;
  /** Storeys, already clamped against {@link HIGHRISE_MAX_FLOORS}. */
  readonly floors: number;
  readonly storeyHeight: number;
  readonly footprint: Footprint;
  readonly shell: Shell;
}

/** Share of the concrete field that comes up as the darker accent. */
const ACCENT_SHARE = 0.06;

/** Mullion period: one solid column, then two lights. */
const MULLION_PERIOD = 3;

/** Balcony period along a face. */
const BALCONY_PERIOD = 5;

/** Guest-room band depth on a hotel floor, in cells between partitions. */
const HOTEL_BAY = 3;

/* -------------------------------------------------------------------------- */
/* the massing: setbacks                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Storeys from which a tower steps in rather than extruding one footprint.
 *
 * Below this the single shaft is right — a six-storey block with a setback is a
 * wedding cake — and above it a straight extrusion is the thing that reads as
 * generated: the same rectangle, ninety metres of it, stopping dead.
 */
export const SETBACK_MIN_FLOORS = 12;

/** Storeys from which the tower takes a *second* step. */
const SETBACK_SECOND_FLOORS = 18;

/** Columns each step takes off the footprint. */
const SETBACK_STEP = 2;

/** Total columns the setbacks may take off, however many steps there are. */
const SETBACK_MAX_TOTAL = 4;

/** Narrowest interior a stepped-in tier may leave, across the core's axis. */
const MIN_TIER_INTERIOR_WIDTH = 5;

/**
 * One storey band of the massing: the footprint the shaft has over that band.
 *
 * The steps come off the **east and south** faces only, and that is a
 * constraint rather than a style: the switchback core stands in the north-west
 * corner of the interior (`cx = interior.x0`, running from `cz0 = interior.z0`),
 * so a step taken off the north or the west would move the wall through the
 * stair. Stepping the other two sides keeps every flight, every landing and
 * every plate hole exactly where the storey below left them, which is what
 * makes a stepped tower still a climbable one.
 */
interface Tier {
  /** First storey (0-based) that uses this footprint. */
  readonly startFloor: number;
  /** Columns off the east and south faces, relative to the full footprint. */
  readonly inset: number;
  readonly interior: LocalRect;
  readonly ring: readonly OutlineCell[];
  readonly interiorCells: readonly { readonly x: number; readonly z: number }[];
  /** Every built column of the tier — ring and interior. */
  readonly built: ReadonlySet<string>;
}

/* -------------------------------------------------------------------------- */
/* the grammar                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Build one tall building, deterministically.
 *
 * Stages: skirt → ground plane → shaft (facade storey by storey) → floor
 * plates → stair core → roof deck → lobby → per-archetype fit-out. Like
 * `core.ts` every stage writes into one cell map, so a later stage overwriting
 * an earlier one is explicit rather than emit-order dependent.
 */
export function emitHighrise(r: HighriseRequest): BuildingResult {
  const { put, cells, style, grammar, choice, sx, sy, sz, door, archetype } = r;
  const storey = r.storeyHeight;
  const floors = r.floors;
  const wallTop = floors * storey;

  const wall = style["wall.primary"] as string;
  const frame = style["wall.frame"] as string;
  const accent = style["wall.accent"] as string;
  const pane = style["wall.window"] as string;

  const plate = style["floor.interior"] as string;
  const stair = style["stair.interior"] as string;
  const slab = style["stone.slab"] as string;
  const deck = style["roof.solid"] as string;
  const parapetCap = style["roof.slab"] as string;

  const interior: LocalRect = { x0: 1, z0: 1, x1: sx - 2, z1: sz - 2 };
  const hasInterior = interior.x0 <= interior.x1 && interior.z0 <= interior.z1;
  const interiorCells = r.shell.interiorCells;

  // The massing. One tier for anything short of `SETBACK_MIN_FLOORS`, in which
  // case `tierOf` is a constant and every line below behaves exactly as it did
  // before setbacks existed.
  const tiers = planTiers(r.shell, sx, sz, floors, storey);
  const tierOf = (s: number): Tier => {
    let out = tiers[0] as Tier;
    for (const t of tiers) if (s >= t.startFloor) out = t;
    return out;
  };
  const topTier = tiers[tiers.length - 1] as Tier;
  const interiorAt = (s: number): LocalRect => tierOf(s).interior;
  const ringAt = (s: number): readonly OutlineCell[] => tierOf(s).ring;

  const wallAt = (x: number, y: number, z: number): string =>
    positionFloat(grammar, x, y, z) < ACCENT_SHARE ? accent : wall;
  const foundationAt = (x: number, y: number, z: number): string =>
    positionFloat(grammar, x, y, z) < 0.3
      ? (style["foundation.accent"] as string)
      : (style["foundation.primary"] as string);

  /* --- the doorway, and the cells the facade must leave solid ------------- */
  // The second leaf of the lobby's double door: along the same face, one cell
  // on. Resolved before the facade runs, because both leaves' columns — and
  // the head course over them — have to stay opaque rather than becoming two
  // more lights in the curtain wall.
  const alongZ = door !== null && (door.x === 0 || door.x === sx - 1);
  const secondLeaf: { x: number; z: number } | null =
    door === null
      ? null
      : (() => {
          const nx = door.x + (alongZ ? 0 : 1);
          const nz = door.z + (alongZ ? 1 : 0);
          const fits = alongZ ? nz < sz - 1 : nx < sx - 1;
          return fits ? { x: nx, z: nz } : null;
        })();
  const doorColumns = new Set<string>();
  if (door !== null) doorColumns.add(`${door.x},${door.z}`);
  if (secondLeaf !== null) doorColumns.add(`${secondLeaf.x},${secondLeaf.z}`);

  /* --- the way out onto each setback terrace ------------------------------ */
  // Two courses of the stepped-in tier's east wall, left open where the terrace
  // is. Not decoration: the traversal simulation walks every standable cell of
  // every storey from the front door, and the roof of the tier below *is* a
  // standable cell of the storey the step happens on. A terrace with no way
  // onto it is `traversal.unreachable`, and the honest fix is the one a real
  // building uses — a door.
  const terraceOpenings = new Set<string>();
  /** Storeys a tier begins on: the terrace is on them, so a balcony is not. */
  const stepStoreys = new Set<number>();
  for (let i = 1; i < tiers.length; i++) {
    const tier = tiers[i] as Tier;
    const level = tier.startFloor * storey;
    const gx = sx - 1 - tier.inset;
    // Which row the door goes in is not free, and the fit-out decides it. A
    // guest floor partitions at `z0 + 3k` and beds at `z0 + 1 + 3k`; an office
    // plate desks at `z0 + 2 + 3k` against the same east wall the door is in.
    // A door opening onto any of them is a door with a wall, a bed or a desk in
    // front of it — reported, correctly, as a terrace nobody can reach — so the
    // row is the one residue this building's own fit-out leaves clear.
    const room = tier.interior;
    const clearRow = archetype === "hotel" || archetype === "apartment_block" ? 2 : 1;
    const middle = Math.floor((room.z0 + room.z1) / 2);
    let gz = middle;
    while (gz > room.z0 && (gz - room.z0 - clearRow) % HOTEL_BAY !== 0) gz--;
    if (gz <= room.z0) gz = middle;
    terraceOpenings.add(`${gx},${level + 1},${gz}`);
    terraceOpenings.add(`${gx},${level + 2},${gz}`);
    stepStoreys.add(tier.startFloor);
  }

  /* --- foundation skirt --------------------------------------------------- */
  for (let d = 1; d <= r.foundationDepth; d++) {
    for (const cell of r.shell.cells) put(cell.x, -d, cell.z, foundationAt(cell.x, -d, cell.z));
  }

  /* --- ground plane ------------------------------------------------------- */
  const isFloorCell = new Set(interiorCells.map((c) => `${c.x},${c.z}`));
  for (const cell of r.shell.cells) {
    put(
      cell.x,
      0,
      cell.z,
      isFloorCell.has(`${cell.x},${cell.z}`) ? plate : foundationAt(cell.x, 0, cell.z),
    );
  }

  /* --- the shaft: curtain wall, storey by storey -------------------------- */
  //
  // Four courses per storey, and each one says something different:
  //
  //   head      y = (s+1)·h      floor band — the slab edge of the plate above
  //   light     y = (s+1)·h - 1  glazing
  //   light     …                glazing
  //   spandrel  y = s·h + 1      the opaque waist under the sill
  //
  // Corners are pilasters for the whole height, and every `MULLION_PERIOD`th
  // cell along a face stays solid so the glazing reads as bays rather than as
  // one continuous band of glass.
  let windowCount = 0;
  for (let s = 0; s < floors; s++) {
    const base = s * storey;
    const tier = tierOf(s);
    for (let y = base + 1; y <= base + storey; y++) {
      const head = y === base + storey;
      const spandrel = y === base + 1;
      for (const cell of tier.ring) {
        const key = `${cell.x},${cell.z}`;
        if (terraceOpenings.has(`${cell.x},${y},${cell.z}`)) continue;
        if (cell.corner) {
          put(cell.x, y, cell.z, frame, { axis: "y" });
          continue;
        }
        if (head) {
          put(cell.x, y, cell.z, frame, { axis: cell.alongX ? "x" : "z" });
          continue;
        }
        // The doorway and its head course: opaque, always. A door leaf hung in
        // a glass pane has nothing to hinge on, and the lobby's opening is
        // structure, not glazing.
        if (doorColumns.has(key)) {
          // The leaves stand at y1–2, so y3 is the head course and the curtain
          // wall writes it — the one cell the old `y > 3` guard left as air
          // whenever `storyHeight > 3` (Stocktake Run unit 9, a physics gate).
          if (s > 0 || y > 2) {
            put(cell.x, y, cell.z, wallAt(cell.x, y, cell.z));
          }
          continue;
        }
        if (spandrel) {
          put(cell.x, y, cell.z, wallAt(cell.x, y, cell.z));
          continue;
        }
        const index = cell.alongX ? cell.x : cell.z;
        if (index % MULLION_PERIOD === 0) {
          put(cell.x, y, cell.z, wallAt(cell.x, y, cell.z));
          continue;
        }
        put(cell.x, y, cell.z, pane, paneConnections(!cell.alongX));
        windowCount++;
      }
    }
  }

  /* --- the stair core ----------------------------------------------------- */
  //
  // **Two columns, not one.** The core is a pair of parallel flights against
  // the west interior wall — `cx` climbing +z, `cx + 1` climbing -z — with the
  // landing at each end of the pair. That is what a switchback actually is, and
  // the first version of this file got it wrong in an instructive way: it ran
  // both flights up the *same* column in alternating directions, which is a
  // switchback on paper and unclimbable in fact. The flight above sits three
  // courses over the flight below, and the walking agent needs two clear cells
  // over the cell it is leaving as well as over the one it is entering — so the
  // upper flight's treads were exactly where the lower flight's headroom had to
  // be, and every storey above the first came back `traversal.unreachable`.
  //
  // Splitting the flights across two columns puts a full `2 · storeyHeight`
  // between anything and the thing above it in the same column, which is the
  // clearance a person climbing needs and then some.
  const coreDepth = coreDepthFor(storey);
  const interiorDepth = interior.z1 - interior.z0 + 1;
  const interiorWidth = interior.x1 - interior.x0 + 1;
  const cx = interior.x0;
  const cz0 = interior.z0;
  // `storey >= 4` is a real bound, not a round number: each tread carries a
  // stringer block under it (without one the mid-plate flight is a staircase of
  // blocks with air on all six faces — `floating.stair`, and in game a
  // staircase that looks glued to nothing), and stringer plus tread is two
  // solid courses. A three-high storey has only two courses of headroom to
  // give, so the pair would fill the column top to bottom and read as
  // `interior.blocked_column`. Below four, the core is a ladder.
  const canSwitchback =
    hasInterior && interiorDepth >= coreDepth && interiorWidth >= 2 && storey >= 4;

  const floorLevels: number[] = [0];
  const stairRuns: number[] = [];
  /** Columns the core occupies on the ground floor; the lobby keeps off them. */
  const coreColumns = new Set<string>();
  /**
   * Every column of the shaft, on every storey — published as
   * {@link BuildingMeta.stairColumns}.
   *
   * Not the same set as {@link coreColumns}, and the difference is the whole
   * point. `coreColumns` is a *ground-floor* reservation for the lobby fit-out,
   * so it only ever carries the first flight's column. The city's life pass
   * needs the other one too: it hangs room lanterns at head height, and its
   * `nearStair` guard reads exactly this set. A tower that published nothing
   * got no guard at all — a lantern landed in the cell beside the bottom tread,
   * the walking agent needs two clear voxels over the cell it mounts *from*,
   * and the whole shaft above the lobby came back `traversal.unreachable`.
   * `core.ts` and `terrace.ts` have always published theirs; this one did not.
   */
  const shaftColumns = new Set<string>();
  /** Interior columns that are partition wall, not floor. */
  const partitionColumns = new Set<string>();

  for (let s = 1; s < floors; s++) {
    const level = s * storey;
    const base = level - storey;
    floorLevels.push(level);
    if (!hasInterior) continue;

    // Which way this flight climbs, and therefore where its approach cell and
    // its well are. `up` runs +z from the north end; the next storey turns
    // round and runs -z from the south end, arriving back where this one
    // started — a landing you walk two cells across, not a corridor.
    const up = (s - 1) % 2 === 0;
    const runLength = storey;
    // The flight's own column, and the well it needs cut in the plate it
    // arrives at: **the treads, and only the treads**.
    //
    // The approach cell — the one at the foot of the flight, on the plate
    // below — keeps its floor, and that is the fix for the defect this file
    // shipped with. Cutting it as well made the well `runLength + 2` cells
    // long, which is `coreDepthFor(storey)`: the whole depth of the core. In a
    // plan exactly that deep the two core columns then had no cell to spare
    // between them, and the flight *above* — which stands in the other column
    // and blocks three cells of it — cut the two cells south of itself off
    // from every route. That is `traversal.unreachable` on every other storey
    // of any tower whose interior is exactly `coreDepthFor(storey)` deep, and
    // it is why a 33-block city block could not be built.
    //
    // Keeping the approach cell is safe because `canSwitchback` already
    // demands `storey >= 4`. A player standing on the approach at `base + 1`
    // needs `base + 3` clear to mount the first tread; the plate they are
    // mounting toward is at `base + storey`, which is `base + 4` at the
    // tightest. On a three-high storey the plate *would* be in the way — which
    // is exactly the case `core.ts` documents, and exactly the case the
    // switchback never takes.
    const colX = canSwitchback ? (up ? cx : cx + 1) : cx;
    const holeZ0 = canSwitchback ? cz0 + 1 : cz0;
    const holeZ1 = canSwitchback ? cz0 + runLength : cz0;

    // The plate, with the well left out of it.
    const tier = tierOf(s);
    for (const cell of tier.interiorCells) {
      if (cell.x === colX && cell.z >= holeZ0 && cell.z <= holeZ1) continue;
      put(cell.x, level, cell.z, plate);
    }

    // A step: the tier below stops here, so its roof becomes this storey's
    // terrace — deck over the ground it kept, and a parapet on the wall head
    // that is now an edge instead of a course.
    const below = tierOf(s - 1);
    if (below !== tier) {
      // Everything the tier below covered that the plate above does not: the
      // annulus that becomes the terrace, *and* the columns the stepped-in wall
      // itself stands on. Miss the second and the doorway onto the terrace has
      // no threshold — a hole in the floor exactly where the way out is, which
      // is `traversal.unreachable` for every cell of the terrace.
      for (const cell of below.interiorCells) {
        const inside =
          cell.x >= tier.interior.x0 &&
          cell.x <= tier.interior.x1 &&
          cell.z >= tier.interior.z0 &&
          cell.z <= tier.interior.z1;
        if (inside) continue;
        put(cell.x, level, cell.z, deck);
      }
      for (const cell of below.ring) {
        if (tier.built.has(`${cell.x},${cell.z}`)) continue;
        put(cell.x, level + 1, cell.z, cell.corner ? frame : wall, cell.corner ? { axis: "y" } : undefined);
        put(cell.x, level + 2, cell.z, parapetCap, { type: "bottom" });
      }
    }

    stairRuns.push(base + 1);
    if (canSwitchback) {
      const facing: Cardinal = up ? "south" : "north";
      for (let i = 0; i < runLength; i++) {
        const z = up ? cz0 + 1 + i : cz0 + runLength - i;
        const y = base + 1 + i;
        // The stringer under the tread. Structure, and the difference between
        // a staircase and a spiral of blocks hanging in a stairwell.
        put(colX, y - 1, z, wall);
        put(colX, y, z, stair, { facing, half: "bottom", shape: "straight" });
        shaftColumns.add(`${colX},${z}`);
        if (base === 0) coreColumns.add(`${colX},${z}`);
      }
      shaftColumns.add(`${colX},${up ? cz0 : cz0 + runLength + 1}`);
      shaftColumns.add(`${colX},${up ? cz0 + runLength + 1 : cz0}`);
      // The approach cell and the landing at the far end, both of which have to
      // stay clear of the lobby fit-out on the ground floor.
      if (base === 0) {
        coreColumns.add(`${colX},${up ? cz0 : cz0 + runLength + 1}`);
        coreColumns.add(`${colX},${up ? cz0 + runLength + 1 : cz0}`);
      }
      // No rail along the well's open edge, and that is a decision rather than
      // an omission. `core.ts` can afford one because its stairwell is in the
      // corner of a one-room cottage and the rail has a wall to die into; here
      // the well runs down the middle of the circulation zone, and a fence
      // course beside it is a fence *across* the corridor — which is exactly
      // what it turned out to be: it cut every guest floor into two halves the
      // traversal simulation could not walk between. A tower you can fall down
      // is a smaller defect than a tower you cannot walk across.
    } else {
      // Too shallow for a flight: a ladder, with its backing wall claimed
      // first — the curtain wall behind it is glass, and rungs fixed to glass
      // are the `unsupported.ladder` finding in its purest form.
      for (let y = base + 1; y <= level + 1; y++) {
        put(cx - 1, y, cz0, wall);
        put(cx, y, cz0, "ladder", { facing: "east" });
      }
      shaftColumns.add(`${cx},${cz0}`);
      if (cx + 1 <= interior.x1) shaftColumns.add(`${cx + 1},${cz0}`);
      if (base === 0) {
        coreColumns.add(`${cx},${cz0}`);
        if (cx + 1 <= interior.x1) coreColumns.add(`${cx + 1},${cz0}`);
      }
    }
  }

  /* --- the roof deck ------------------------------------------------------ */
  // A closed plate over the top storey first: the parapet stands on it, the
  // plant room stands on it, and without it the top floor's ceiling lights
  // hang from nothing.
  const roofInterior = topTier.interior;
  const roofWidth = roofInterior.x1 - roofInterior.x0 + 1;
  const roofDepth = roofInterior.z1 - roofInterior.z0 + 1;
  if (hasInterior) {
    for (const cell of topTier.interiorCells) put(cell.x, wallTop, cell.z, deck);
  }
  // Parapet: one course of wall on the ring, capped with a slab, so the roof
  // line has a lip rather than stopping dead at the last glazing bar.
  for (const cell of topTier.ring) {
    put(cell.x, wallTop + 1, cell.z, cell.corner ? frame : wall, cell.corner ? { axis: "y" } : undefined);
    put(cell.x, wallTop + 2, cell.z, parapetCap, { type: "bottom" });
  }
  let roofTop = wallTop + 2;
  /** The plant room's footprint, so the rest of the kit keeps off it. */
  let plantRect: LocalRect | null = null;
  // The plant room: the box every real flat roof has, with a vent hood on it.
  if (hasInterior && roofWidth >= 5 && roofDepth >= 5) {
    const px0 = Math.max(roofInterior.x0 + 1, Math.floor((roofInterior.x0 + roofInterior.x1) / 2) - 1);
    const pz0 = Math.max(roofInterior.z0 + 1, Math.floor((roofInterior.z0 + roofInterior.z1) / 2) - 1);
    const px1 = Math.min(roofInterior.x1 - 1, px0 + 2);
    const pz1 = Math.min(roofInterior.z1 - 1, pz0 + 2);
    for (let y = wallTop + 1; y <= wallTop + 3; y++) {
      for (let z = pz0; z <= pz1; z++) {
        for (let x = px0; x <= px1; x++) {
          const edge = x === px0 || x === px1 || z === pz0 || z === pz1;
          if (edge) put(x, y, z, wallAt(x, y, z));
        }
      }
    }
    for (let z = pz0; z <= pz1; z++) for (let x = px0; x <= px1; x++) put(x, wallTop + 4, z, deck);
    // The vent: a stack of walls with a lantern on it, which is also the
    // aircraft light every tall building carries.
    const vx = Math.floor((px0 + px1) / 2);
    const vz = Math.floor((pz0 + pz1) / 2);
    put(vx, wallTop + 5, vz, style["stone.wall"] as string, { up: "true", waterlogged: "false" });
    put(vx, wallTop + 6, vz, style["light.lantern"] as string, { hanging: "false" });
    roofTop = wallTop + 6;
    plantRect = { x0: px0, z0: pz0, x1: px1, z1: pz1 };
  }
  // The rest of the kit, scaled by how tall the building actually is.
  if (hasInterior) {
    roofTop = Math.max(
      roofTop,
      dressRoof({
        put,
        style,
        choice,
        interior: roofInterior,
        wallTop,
        floors,
        avoid: plantRect,
      }),
    );
  }

  /* --- the lobby ---------------------------------------------------------- */
  let apronOps = 0;
  let furnitureCount = 0;
  if (door !== null) {
    for (const leaf of [door, secondLeaf].filter((d) => d !== null)) {
      const hinge = leaf === door ? "left" : "right";
      for (const half of ["lower", "upper"] as const) {
        put(leaf.x, half === "lower" ? 1 : 2, leaf.z, style["door.block"] as string, {
          facing: door.face,
          half,
          hinge,
          open: "false",
        });
      }
    }
    // The canopy: a slab one cell out over the doorstep. In the apron, and the
    // only thing this grammar puts there apart from a balcony.
    const [ox, oz] = step(door.face);
    put(door.x + ox, 3, door.z + oz, slab, { type: "top" });
    apronOps++;
    if (secondLeaf !== null) {
      put(secondLeaf.x + ox, 3, secondLeaf.z + oz, slab, { type: "top" });
      apronOps++;
    }
  }

  /* --- per-archetype fit-out ---------------------------------------------- */
  if (hasInterior) {
    // A hotel and a block of flats are the same plan — a corridor and a row of
    // partitioned bays with a bed in each — and differ in what hangs off the
    // outside of them. Sharing the fit-out is not a shortcut; building two of
    // it would be.
    if (archetype === "hotel" || archetype === "apartment_block") {
      furnitureCount += fitHotel({
        put,
        style,
        interiorAt,
        floors,
        storey,
        cx,
        coreColumns,
        partitionColumns,
        choice,
      });
    }
    if (archetype === "apartment_block") {
      apronOps += fitBalconies({
        put,
        style,
        ringAt,
        floors,
        storey,
        sx,
        sz,
        doorColumns,
        skipStoreys: stepStoreys,
      });
    }
    if (archetype !== "hotel" && archetype !== "apartment_block") {
      furnitureCount += fitOfficePlate({
        put,
        style,
        interiorAt,
        floors,
        storey,
        cx,
        coreColumns,
        counterZ: counterRowOf(interior, door),
      });
    }
    // The lobby counter: three cells of desk against the wall opposite the
    // way in. A hotel has a reception; an office has the same thing and calls
    // it a front desk.
    furnitureCount += fitLobbyCounter({ put, style, interior, coreColumns, door });
  }

  /* --- lighting ----------------------------------------------------------- */
  // One hanging light per storey, in the corridor beside the core, under the
  // plate above — which every storey has, because the roof deck closed the
  // top one.
  let lanternCount = 0;
  if (hasInterior) {
    for (let s = 0; s < floors; s++) {
      // Clear of both flights of the core, whose plates are holed — and inside
      // this storey's own tier, because a light hung where the tower has
      // stepped in is a light hung in the open air.
      const room = interiorAt(s);
      const lx = Math.min(cx + 2, room.x1);
      const lz = Math.floor((room.z0 + room.z1) / 2);
      const y = (s + 1) * storey - 1;
      if (storey >= 4) {
        put(lx, y, lz, style["light.lantern"] as string, { hanging: "true" });
      } else {
        // On a three-high storey the cell under the plate is **head height**,
        // and `cx + 2` is the corridor — the single column between the two core
        // flights and the room band. A hanging lantern there is a body-blocking
        // cell in a one-cell passage, which severs the plate: the bays north of
        // it and the bays south of it stop being the same room, and every cell
        // on the far side comes back `traversal.unreachable`. `core.ts` met the
        // same defect in a one-cell-wide cottage and answered it the same way —
        // a light a player can walk through. A torch standing on the plate
        // lights the corridor without standing in it, and it is supported by
        // the floor it stands on rather than by a plate that may be a stair
        // well two courses up.
        put(lx, s * storey + 1, lz, style["light.torch"] as string);
      }
      lanternCount++;
    }
  }

  /* --- what was built ----------------------------------------------------- */
  // A stepped tier's wall stands on a column that was floor lower down, so the
  // same rule the partitions taught applies to it: a wall is not floor. Left in
  // `floorCells` it is a column solid from plate to plate for every storey above
  // the step — `interior.blocked_column`, hundreds of times over on one tower.
  // The terrace *deck* stays in, because a terrace is somewhere you can stand
  // and the tier's door is what makes it somewhere you can get to.
  const tierWallColumns = new Set<string>();
  for (const tier of tiers) {
    if (tier.inset === 0) continue;
    for (const cell of tier.ring) tierWallColumns.add(`${cell.x},${cell.z}`);
  }
  const floorCells = interiorCells.filter(
    (c) => !partitionColumns.has(`${c.x},${c.z}`) && !tierWallColumns.has(`${c.x},${c.z}`),
  );
  const meta: BuildingMeta = {
    params: r.params,
    size: [sx, sy, sz],
    wallTop,
    roofBase: wallTop + 1,
    roofTop,
    height: roofTop + 1,
    foundationDepth: r.foundationDepth,
    door: door === null ? null : { x: door.x, z: door.z, face: door.face },
    interior,
    footprint: r.footprint,
    cells: r.shell.cells,
    floorCells,
    floorLevels,
    stairColumns: shaftColumns,
    stairRuns,
    basementDepth: 0,
    basementInterior: null,
    basementAccess: null,
    windowCount,
    lanternCount,
    apronOps,
    furnitureCount,
    chimney: false,
    materialKey: materialKey(r.materials),
  };
  return { ops: sortOpsLocal([...cells.values()]), meta };
}

/* -------------------------------------------------------------------------- */
/* fit-outs                                                                    */
/* -------------------------------------------------------------------------- */

interface HotelRequest {
  readonly put: Put;
  readonly style: Readonly<Record<string, string>>;
  /** This storey's plate — the tier's, not the tower's, once it has stepped in. */
  readonly interiorAt: (storeyIndex: number) => LocalRect;
  readonly floors: number;
  readonly storey: number;
  readonly cx: number;
  readonly coreColumns: ReadonlySet<string>;
  readonly partitionColumns: Set<string>;
  readonly choice: Seed256;
}

/**
 * Guest floors: a corridor along the core, rooms in bays off it, a bed in each.
 *
 * The partitions run **across** the plate from the room side of the corridor to
 * the east wall, so every bay is open along its whole western edge and no bay
 * needs a doorway punched in a wall to be reachable. That is not laziness: a
 * doorway would make exactly one column of the partition passable and leave the
 * rest reported as `interior.blocked_column`, and the honest fix — a partition
 * is wall, and wall is not floor — is applied to every column of it either way.
 */
function fitHotel(r: HotelRequest): number {
  const { put, style, floors, storey, cx } = r;
  // Three columns of circulation, not two: `cx` and `cx + 1` are the two
  // flights of the switchback and each of them is a hole in the plate on the
  // storey it arrives at, so neither can be the corridor a room opens onto. A
  // bay whose only western neighbour is a stairwell is a room with no door.
  const roomX0 = cx + 3;
  const wall = style["wall.primary"] as string;
  const beds = ["red_bed", "white_bed", "light_gray_bed", "blue_bed"] as const;
  let n = 0;

  for (let s = 1; s < floors; s++) {
    const level = s * storey;
    const interior = r.interiorAt(s);
    if (roomX0 > interior.x1) continue;
    // Partitions at every bay line, full height under the plate above. The
    // top course is deliberately included: a partition that stops short is a
    // hotel room with a transom you can walk over.
    for (let z = interior.z0 + HOTEL_BAY; z <= interior.z1 - 1; z += HOTEL_BAY) {
      for (let x = roomX0; x <= interior.x1; x++) {
        r.partitionColumns.add(`${x},${z}`);
        for (let y = level + 1; y < level + storey; y++) put(x, y, z, wall);
      }
    }
    // One bed per bay, laid against the east wall, head outward.
    for (let z = interior.z0 + 1; z <= interior.z1; z += HOTEL_BAY) {
      if (r.partitionColumns.has(`${interior.x1},${z}`)) continue;
      const footX = interior.x1 - 1;
      const headX = interior.x1;
      if (footX < roomX0) continue;
      if (r.partitionColumns.has(`${footX},${z}`)) continue;
      const block = beds[Math.floor(positionFloat(r.choice, footX, level, z) * beds.length) % beds.length] as string;
      put(footX, level + 1, z, block, { facing: "east", part: "foot", occupied: "false" });
      put(headX, level + 1, z, block, { facing: "east", part: "head", occupied: "false" });
      n += 2;
    }
  }
  return n;
}

interface OfficeRequest {
  readonly put: Put;
  readonly style: Readonly<Record<string, string>>;
  /** This storey's plate — the tier's, not the tower's, once it has stepped in. */
  readonly interiorAt: (storeyIndex: number) => LocalRect;
  readonly floors: number;
  readonly storey: number;
  readonly cx: number;
  readonly coreColumns: ReadonlySet<string>;
  /** The lobby counter's row on the ground floor, or `null` when it has none. */
  readonly counterZ: number | null;
}

/**
 * An open plate: a run of desks along the east wall, and nothing else.
 *
 * A desk is a top slab, which is half a block a player steps onto rather than
 * an obstacle they walk round, and it leaves the two courses above it clear —
 * so the column is passable, which is what keeps the plate legal as well as
 * usable.
 */
function fitOfficePlate(r: OfficeRequest): number {
  const { put, style, floors, storey } = r;
  const desk = style["stone.slab"] as string;
  let n = 0;
  for (let s = 0; s < floors; s++) {
    const level = s * storey;
    const interior = r.interiorAt(s);
    if (interior.x1 <= r.cx + 1) continue;
    // From `z0 + 2`, not `z0 + 1`: the lobby counter runs along the `z0` row,
    // and a desk one cell diagonally off its end boxes the corner cell in
    // between them — a top slab is not a cell a player fits in, so two of them
    // meeting at a corner is a one-cell room with no way into it.
    for (let z = interior.z0 + 2; z <= interior.z1 - 1; z += 3) {
      if (s === 0 && r.coreColumns.has(`${interior.x1},${z}`)) continue;
      // Two clear cells from the counter, whichever end it is on. The `z0 + 2`
      // start above was this rule written for one case only — a south door,
      // which puts the counter on `z0`. A door on any other face puts it on
      // `z1`, and there the desk at `z1 - 1` pinched the corner cell at
      // `(x1, z1)` between its own end and the counter — a `traversal
      // .unreachable` finding on every tower whose entrance was not on the
      // south and whose plate was shallow enough for the two to meet.
      if (s === 0 && r.counterZ !== null && Math.abs(z - r.counterZ) <= 1) continue;
      put(interior.x1, level + 1, z, desk, { type: "top" });
      n++;
    }
  }
  return n;
}

interface BalconyRequest {
  readonly put: Put;
  readonly style: Readonly<Record<string, string>>;
  /** This storey's outline — the tier's, once the tower has stepped in. */
  readonly ringAt: (
    storeyIndex: number,
  ) => readonly { readonly x: number; readonly z: number; readonly corner: boolean; readonly alongX: boolean; readonly outward: Cardinal }[];
  readonly floors: number;
  readonly storey: number;
  readonly sx: number;
  readonly sz: number;
  readonly doorColumns: ReadonlySet<string>;
  /**
   * Storeys that start a tier. No balcony on those: the tier below's roof is
   * right there, and a rail hung across a terrace is a rail across the only way
   * round it.
   */
  readonly skipStoreys: ReadonlySet<number>;
}

/**
 * Balconies: a projecting deck of top slabs with a bar rail, in the apron.
 *
 * Decorative and deliberately not enterable — the wall behind is curtain glass,
 * not a door — which is what keeps them out of the traversal simulation
 * entirely. Every block is supported: the slabs are fixed sideways to the floor
 * band they hang off, and the bars stand on the slabs.
 */
function fitBalconies(r: BalconyRequest): number {
  const { put, style, floors, storey } = r;
  const deckSlab = style["roof.slab"] as string;
  const bars = style["wall.fence"] as string;
  let n = 0;
  for (let s = 1; s < floors; s++) {
    if (r.skipStoreys.has(s)) continue;
    const level = s * storey;
    for (const cell of r.ringAt(s)) {
      if (cell.corner) continue;
      if (r.doorColumns.has(`${cell.x},${cell.z}`)) continue;
      const index = cell.alongX ? cell.x : cell.z;
      if (index % BALCONY_PERIOD !== 2) continue;
      const [ox, oz] = step(cell.outward);
      // Three cells wide, along the face the balcony hangs off.
      for (let t = -1; t <= 1; t++) {
        const bx = cell.x + (cell.alongX ? t : 0) + ox;
        const bz = cell.z + (cell.alongX ? 0 : t) + oz;
        if (bx < -1 || bz < -1 || bx > r.sx || bz > r.sz) continue;
        put(bx, level, bz, deckSlab, { type: "top" });
        put(bx, level + 1, bz, bars);
        n += 2;
      }
    }
  }
  return n;
}

interface RoofKitRequest {
  readonly put: Put;
  readonly style: Readonly<Record<string, string>>;
  readonly choice: Seed256;
  /** The top tier's interior — the deck the kit stands on. */
  readonly interior: LocalRect;
  readonly wallTop: number;
  readonly floors: number;
  /** The plant room, when there is one: nothing else may stand on it. */
  readonly avoid: LocalRect | null;
}

/**
 * The rooftop kit, and the reason a tall building has a silhouette.
 *
 * A flat deck with a parapet round it is a plinth. What makes a roof read from
 * the street two blocks away is the clutter on it — condenser banks, a water
 * tank, the lift overrun, a mast — and what makes a *skyline* read is that the
 * clutter scales: a four-storey block gets a vent, and a twenty-five-storey
 * tower gets a stepped crown with a light on top of it.
 *
 * So the kit is gated on storeys, not on taste:
 *
 * - **condensers** (always) — two courses of slab, the roof plant of every
 *   commercial building ever built;
 * - **a water tank** (6+) — a capped box, offset from centre;
 * - **a lift overrun** (9+) — the box the stair and the lift come up inside,
 *   the tallest thing on most real roofs;
 * - **a mast** (13+) — on the overrun, with the aircraft light on top;
 * - **signage** (11+) — two courses of accent standing on the parapet cap on
 *   one face, which is what gives a tower an address at distance;
 * - **a helipad** (19+, and only on a roof with room for one) — a five-square
 *   of raised slab with a ring of corner markers.
 *
 * Every block stands on the deck or on the thing below it. The rooftop is the
 * classic source of `floating.isolated` and `unsupported.lantern` findings
 * precisely because it is the one place a generator stops thinking about
 * gravity, so nothing here is placed without something under it.
 */
function dressRoof(r: RoofKitRequest): number {
  const { put, style, interior, wallTop, floors } = r;
  const width = interior.x1 - interior.x0 + 1;
  const depth = interior.z1 - interior.z0 + 1;
  if (width < 3 || depth < 3) return wallTop + 2;

  const wall = style["wall.primary"] as string;
  const accent = style["wall.accent"] as string;
  const deck = style["roof.solid"] as string;
  const slab = style["stone.slab"] as string;
  const cap = style["roof.slab"] as string;
  const post = style["stone.wall"] as string;
  const clear = (x0: number, z0: number, x1: number, z1: number): boolean => {
    if (x0 < interior.x0 || z0 < interior.z0 || x1 > interior.x1 || z1 > interior.z1) return false;
    const a = r.avoid;
    if (a === null) return true;
    return x1 < a.x0 || x0 > a.x1 || z1 < a.z0 || z0 > a.z1;
  };
  let top = wallTop + 2;

  // --- condenser banks ------------------------------------------------------
  // One per five storeys, capped at four, walked along the roof's north edge
  // and skipped wherever the plant room already stands. Two courses of slab so
  // they read as boxes rather than as a patch of different floor.
  const banks = Math.min(4, 1 + Math.floor(floors / 5));
  let placed = 0;
  for (let i = 0; i < banks * 2 && placed < banks; i++) {
    const x0 = interior.x0 + 1 + i * 3;
    const z0 = interior.z0 + (i % 2 === 0 ? 1 : depth - 3);
    if (!clear(x0, z0, x0 + 1, z0 + 1)) continue;
    for (let z = z0; z <= z0 + 1; z++) {
      for (let x = x0; x <= x0 + 1; x++) {
        put(x, wallTop + 1, z, slab, { type: "double" });
        put(x, wallTop + 2, z, cap, { type: "bottom" });
      }
    }
    placed++;
    top = Math.max(top, wallTop + 2);
  }

  // --- the water tank -------------------------------------------------------
  if (floors >= 6 && clear(interior.x1 - 2, interior.z1 - 2, interior.x1, interior.z1)) {
    for (let y = wallTop + 1; y <= wallTop + 3; y++) {
      for (let z = interior.z1 - 2; z <= interior.z1; z++) {
        for (let x = interior.x1 - 2; x <= interior.x1; x++) put(x, y, z, accent);
      }
    }
    for (let z = interior.z1 - 2; z <= interior.z1; z++) {
      for (let x = interior.x1 - 2; x <= interior.x1; x++) {
        put(x, wallTop + 4, z, cap, { type: "bottom" });
      }
    }
    top = Math.max(top, wallTop + 4);
  }

  // --- the lift overrun, and the mast on it ---------------------------------
  // Over the core's own corner of the plan, which is where the shaft that needs
  // an overrun actually is.
  if (floors >= 9 && clear(interior.x0, interior.z0, interior.x0 + 2, interior.z0 + 2)) {
    const ox1 = interior.x0 + 2;
    const oz1 = interior.z0 + 2;
    const height = floors >= 16 ? 5 : 4;
    for (let y = wallTop + 1; y <= wallTop + height; y++) {
      for (let z = interior.z0; z <= oz1; z++) {
        for (let x = interior.x0; x <= ox1; x++) {
          const edge = x === interior.x0 || x === ox1 || z === interior.z0 || z === oz1;
          if (edge) put(x, y, z, y === wallTop + height ? accent : wall);
        }
      }
    }
    for (let z = interior.z0; z <= oz1; z++) {
      for (let x = interior.x0; x <= ox1; x++) put(x, wallTop + height + 1, z, deck);
    }
    top = Math.max(top, wallTop + height + 1);

    if (floors >= 13) {
      const mx = interior.x0 + 1;
      const mz = interior.z0 + 1;
      const mast = Math.min(11, 4 + Math.floor(floors / 3));
      for (let i = 1; i <= mast; i++) {
        put(mx, wallTop + height + 1 + i, mz, post, { up: "true", waterlogged: "false" });
      }
      put(mx, wallTop + height + mast + 2, mz, style["light.lantern"] as string, {
        hanging: "false",
      });
      top = Math.max(top, wallTop + height + mast + 2);
    }
  }

  // --- signage --------------------------------------------------------------
  // Standing on the parapet cap along the south face, so it faces the street a
  // door on the south side opens onto. Two courses, three to five bays wide,
  // and its length is the one thing here the seed chooses.
  if (floors >= 11) {
    const z = interior.z1 + 1;
    const span = 3 + Math.floor(positionFloat(r.choice, interior.x0, wallTop, z) * 3);
    const x0 = Math.max(interior.x0, Math.floor((interior.x0 + interior.x1) / 2) - (span >> 1));
    const x1 = Math.min(interior.x1, x0 + span - 1);
    for (let x = x0; x <= x1; x++) {
      put(x, wallTop + 3, z, accent);
      put(x, wallTop + 4, z, x === x0 || x === x1 ? accent : wall);
    }
    top = Math.max(top, wallTop + 4);
  }

  // --- the helipad ----------------------------------------------------------
  if (floors >= 19 && width >= 11 && depth >= 11) {
    const x0 = interior.x1 - 5;
    const z0 = interior.z0 + 2;
    if (clear(x0, z0, x0 + 4, z0 + 4)) {
      for (let z = z0; z <= z0 + 4; z++) {
        for (let x = x0; x <= x0 + 4; x++) {
          const rim = x === x0 || x === x0 + 4 || z === z0 || z === z0 + 4;
          put(x, wallTop + 1, z, rim ? cap : slab, { type: rim ? "bottom" : "top" });
        }
      }
      // Four corner markers, so the pad reads as a pad and not as a patch.
      for (const [dx, dz] of [
        [0, 0],
        [4, 0],
        [0, 4],
        [4, 4],
      ] as const) {
        put(x0 + dx, wallTop + 2, z0 + dz, post, { up: "true", waterlogged: "false" });
      }
      top = Math.max(top, wallTop + 2);
    }
  }

  return top;
}

interface CounterRequest {
  readonly put: Put;
  readonly style: Readonly<Record<string, string>>;
  readonly interior: LocalRect;
  readonly coreColumns: ReadonlySet<string>;
  readonly door: { readonly x: number; readonly z: number; readonly face: Cardinal } | null;
}

/**
 * Which interior row the reception counter stands on, or `null` for no counter.
 *
 * Published because the desk run has to know: a top slab is not a cell a body
 * fits in, so a desk one cell diagonally off the counter's end pinches the
 * corner between them out of the room.
 */
function counterRowOf(
  interior: LocalRect,
  door: { readonly face: Cardinal } | null,
): number | null {
  if (door === null) return null;
  return door.face === "south" ? interior.z0 : interior.z1;
}

/** The reception counter: three top slabs against the wall away from the door. */
function fitLobbyCounter(r: CounterRequest): number {
  const { put, style, interior, door } = r;
  if (door === null) return 0;
  const counter = style["stone.slab"] as string;
  // Against the face opposite the way in, so a visitor walks towards it.
  const z = counterRowOf(interior, door) as number;
  const x0 = Math.max(interior.x0 + 1, Math.floor((interior.x0 + interior.x1) / 2) - 1);
  // Never as far as the far wall: the counter's end and the wall would pinch
  // the corner cell between them out of the room.
  const x1 = Math.min(interior.x1 - 1, x0 + 2);
  let n = 0;
  for (let x = x0; x <= x1; x++) {
    if (r.coreColumns.has(`${x},${z}`)) continue;
    put(x, 1, z, counter, { type: "top" });
    n++;
  }
  return n;
}

/* -------------------------------------------------------------------------- */
/* the massing                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The storey bands of the shaft, ground tier first.
 *
 * A short tower gets one tier and is byte-identical to what this grammar built
 * before setbacks existed. A tall one gets one or two steps, placed at 55 % and
 * 80 % of its height — high enough that the podium reads as the body of the
 * building and the steps as its crown.
 *
 * Every step is bounded by what the plan can still hold: an interior at least
 * {@link MIN_TIER_INTERIOR_WIDTH} across, and at least `coreDepthFor(storey)`
 * deep, because the switchback needs its run. A footprint that cannot pay for a
 * step does not take one.
 */
export function planTiers(
  shell: Shell,
  sx: number,
  sz: number,
  floors: number,
  storey: number,
): Tier[] {
  // The ground tier is the shell exactly as traced, not a re-derivation of it:
  // a tower that takes no step has to come out byte-identical to the one this
  // grammar built before setbacks existed.
  const base: Tier = {
    startFloor: 0,
    inset: 0,
    interior: { x0: 1, z0: 1, x1: sx - 2, z1: sz - 2 },
    ring: shell.ring,
    interiorCells: shell.interiorCells,
    built: new Set(shell.cells.map((c) => `${c.x},${c.z}`)),
  };
  const room = Math.min(
    SETBACK_MAX_TOTAL,
    sx - 2 - MIN_TIER_INTERIOR_WIDTH,
    sz - 2 - coreDepthFor(storey),
  );
  if (floors < SETBACK_MIN_FLOORS || room < 1) return [base];

  // A step is two columns or it is nothing. One column leaves a terrace exactly
  // as wide as its own parapet — a ledge, with the door onto it opening into a
  // wall — so a footprint that can only pay for one column stays a straight
  // shaft.
  if (room < SETBACK_STEP) return [base];
  const insets: number[] =
    room >= 2 * SETBACK_STEP && floors >= SETBACK_SECOND_FLOORS
      ? [SETBACK_STEP, 2 * SETBACK_STEP]
      : [SETBACK_STEP];

  const out: Tier[] = [base];
  let previousStart = 0;
  for (const [i, inset] of insets.entries()) {
    const share = insets.length === 1 ? 0.62 : 0.55 + 0.25 * i;
    const start = Math.round(floors * share);
    // Two storeys minimum per tier: a one-storey crown is a hat, and a tier
    // that starts at the top storey is a parapet with extra steps.
    if (start < previousStart + 2 || start > floors - 2) continue;
    out.push(rectTier(start, sx, sz, inset));
    previousStart = start;
  }
  return out;
}

/**
 * A rectangular tier: the full footprint with `inset` columns taken off the
 * east and south faces.
 *
 * Traced by hand rather than through `traceShell`, which lives in `core.ts` and
 * would turn this file's type-only dependency into a runtime import cycle. On a
 * rect the two agree exactly: same canonical `(z, x)` order, same corner rule,
 * same `alongX`, and the same north-before-south-before-west-before-east
 * outward priority.
 */
function rectTier(startFloor: number, sx: number, sz: number, inset: number): Tier {
  const x1 = sx - 1 - inset;
  const z1 = sz - 1 - inset;
  const ring: OutlineCell[] = [];
  const interiorCells: { x: number; z: number }[] = [];
  const built = new Set<string>();
  for (let z = 0; z <= z1; z++) {
    for (let x = 0; x <= x1; x++) {
      built.add(`${x},${z}`);
      const onZ = z === 0 || z === z1;
      const onX = x === 0 || x === x1;
      if (!onZ && !onX) {
        interiorCells.push({ x, z });
        continue;
      }
      const blocked: Cardinal[] = [];
      if (z === 0) blocked.push("north");
      if (z === z1) blocked.push("south");
      if (x === 0) blocked.push("west");
      if (x === x1) blocked.push("east");
      ring.push({ x, z, blocked, corner: onZ && onX, alongX: onZ, outward: blocked[0] as Cardinal });
    }
  }
  return {
    startFloor,
    inset,
    interior: { x0: 1, z0: 1, x1: x1 - 1, z1: z1 - 1 },
    ring,
    interiorCells,
    built,
  };
}

/* -------------------------------------------------------------------------- */
/* local helpers                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Pane connection flags for a light in a wall.
 *
 * The same two-line function `core.ts` has, duplicated rather than imported so
 * this file's only dependency on `core.ts` stays type-level. Two lines is a
 * cheaper price than a runtime import cycle.
 */
function paneConnections(alongZ: boolean): Record<string, string> {
  return alongZ ? { north: "true", south: "true" } : { east: "true", west: "true" };
}

/** Unit step of a cardinal, in node-local `(dx, dz)`. */
function step(facing: Cardinal): readonly [number, number] {
  switch (facing) {
    case "north":
      return [0, -1];
    case "south":
      return [0, 1];
    case "east":
      return [1, 0];
    default:
      return [-1, 0];
  }
}

/** Canonical op order: y, then z, then x — the same order `core.ts` uses. */
function sortOpsLocal(ops: LocalVoxelOp[]): LocalVoxelOp[] {
  return ops.sort((a, b) => a.y - b.y || a.z - b.z || a.x - b.x);
}
/* -------------------------------------------------------------------------- */
/* descriptor seam — ordered building rows (Phase 4, no self-registration)     */
/* -------------------------------------------------------------------------- */

/**
 * Ordered building descriptors for the high-rise pack — one row per ID in
 * {@link HIGHRISE_ARCHETYPES} order, preserving tag greediness.
 * - `tags` mirror {@link highriseArchetypeOfTags} — every synonym that maps to the archetype, with canonical id first.
 * - `facadeDefaults` is absent — curtain-wall facade is grammar-driven, not a param default.
 * - `furnish` is a no-op handle — realization is via {@link emitHighrise} dispatch, not central furnish.
 * - `dispatch` is `"highrise"` — explicit sizing/emit branch remains in `core.ts`.
 */
export const HIGHRISE_BUILDING_DESCRIPTORS: readonly BuildingDescriptor[] = [
  {
    id: "skyscraper",
    kind: "building",
    tags: ["skyscraper", "high_rise", "highrise", "tower_block"],
    aliases: [],
    furnish: (() => 0) as unknown as (ctx: unknown) => number,
    dispatch: "highrise",
  },
  {
    id: "hotel",
    kind: "building",
    tags: ["hotel", "lodging", "guesthouse"],
    aliases: [],
    furnish: (() => 0) as unknown as (ctx: unknown) => number,
    dispatch: "highrise",
  },
  {
    id: "apartment_block",
    kind: "building",
    tags: ["apartment_block", "apartment", "tenement", "flats"],
    aliases: [],
    furnish: (() => 0) as unknown as (ctx: unknown) => number,
    dispatch: "highrise",
  },
  {
    id: "office",
    kind: "building",
    tags: ["office", "offices", "corporate", "headquarters"],
    aliases: [],
    furnish: (() => 0) as unknown as (ctx: unknown) => number,
    dispatch: "highrise",
  },
] as const;
