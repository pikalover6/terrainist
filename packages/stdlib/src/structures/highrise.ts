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

import { positionFloat, type Seed256 } from "../determinism/index.js";

import type {
  BuildingMeta,
  BuildingResult,
  Cardinal,
  Footprint,
  LocalRect,
  LocalVoxelOp,
  Put,
  ResolvedBuildingParams,
  Shell,
} from "./core.js";
import type { BuildingMaterials } from "./themes.js";

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
  skyscraper: 20,
  office: 16,
  hotel: 14,
  apartment_block: 10,
});

/** Fewest storeys that make the tall grammar the right one to use. */
export const HIGHRISE_MIN_FLOORS = 1;

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

  const ring = r.shell.ring;
  const interior: LocalRect = { x0: 1, z0: 1, x1: sx - 2, z1: sz - 2 };
  const hasInterior = interior.x0 <= interior.x1 && interior.z0 <= interior.z1;
  const interiorCells = r.shell.interiorCells;

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
    for (let y = base + 1; y <= base + storey; y++) {
      const head = y === base + storey;
      const spandrel = y === base + 1;
      for (const cell of ring) {
        const key = `${cell.x},${cell.z}`;
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
          if (s > 0 || y > 3) put(cell.x, y, cell.z, wallAt(cell.x, y, cell.z));
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
    // arrives at: approach cell through top tread, inclusive.
    const colX = canSwitchback ? (up ? cx : cx + 1) : cx;
    const holeZ0 = canSwitchback ? (up ? cz0 : cz0 + 1) : cz0;
    const holeZ1 = canSwitchback ? (up ? cz0 + runLength : cz0 + runLength + 1) : cz0;

    // The plate, with the well left out of it.
    for (const cell of interiorCells) {
      if (cell.x === colX && cell.z >= holeZ0 && cell.z <= holeZ1) continue;
      put(cell.x, level, cell.z, plate);
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
        if (base === 0) coreColumns.add(`${colX},${z}`);
      }
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
  if (hasInterior) {
    for (const cell of interiorCells) put(cell.x, wallTop, cell.z, deck);
  }
  // Parapet: one course of wall on the ring, capped with a slab, so the roof
  // line has a lip rather than stopping dead at the last glazing bar.
  for (const cell of ring) {
    put(cell.x, wallTop + 1, cell.z, cell.corner ? frame : wall, cell.corner ? { axis: "y" } : undefined);
    put(cell.x, wallTop + 2, cell.z, parapetCap, { type: "bottom" });
  }
  let roofTop = wallTop + 2;
  // The plant room: the box every real flat roof has, with a vent hood on it.
  if (hasInterior && interiorWidth >= 5 && interiorDepth >= 5) {
    const px0 = Math.max(interior.x0 + 1, Math.floor((interior.x0 + interior.x1) / 2) - 1);
    const pz0 = Math.max(interior.z0 + 1, Math.floor((interior.z0 + interior.z1) / 2) - 1);
    const px1 = Math.min(interior.x1 - 1, px0 + 2);
    const pz1 = Math.min(interior.z1 - 1, pz0 + 2);
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
        interior,
        floors,
        storey,
        cx,
        coreColumns,
        partitionColumns,
        choice,
      });
    }
    if (archetype === "apartment_block") {
      apronOps += fitBalconies({ put, style, ring, floors, storey, sx, sz, doorColumns });
    }
    if (archetype !== "hotel" && archetype !== "apartment_block") {
      furnitureCount += fitOfficePlate({
        put,
        style,
        interior,
        floors,
        storey,
        cx,
        coreColumns,
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
    // Clear of both flights of the core, whose plates are holed.
    const lx = Math.min(cx + 2, interior.x1);
    const lz = Math.floor((interior.z0 + interior.z1) / 2);
    for (let s = 0; s < floors; s++) {
      const y = (s + 1) * storey - 1;
      put(lx, y, lz, style["light.lantern"] as string, { hanging: "true" });
      lanternCount++;
    }
  }

  /* --- what was built ----------------------------------------------------- */
  const floorCells = interiorCells.filter((c) => !partitionColumns.has(`${c.x},${c.z}`));
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
    stairRuns,
    basementDepth: 0,
    basementInterior: null,
    basementAccess: null,
    windowCount,
    lanternCount,
    apronOps,
    furnitureCount,
    chimney: false,
    materialKey: `${r.materials.wood.planks}|${r.materials.stone.primary}|${r.materials.roof.stairs}`,
  };
  return { ops: sortOpsLocal([...cells.values()]), meta };
}

/* -------------------------------------------------------------------------- */
/* fit-outs                                                                    */
/* -------------------------------------------------------------------------- */

interface HotelRequest {
  readonly put: Put;
  readonly style: Readonly<Record<string, string>>;
  readonly interior: LocalRect;
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
  const { put, style, interior, floors, storey, cx } = r;
  // Three columns of circulation, not two: `cx` and `cx + 1` are the two
  // flights of the switchback and each of them is a hole in the plate on the
  // storey it arrives at, so neither can be the corridor a room opens onto. A
  // bay whose only western neighbour is a stairwell is a room with no door.
  const roomX0 = cx + 3;
  if (roomX0 > interior.x1) return 0;
  const wall = style["wall.primary"] as string;
  const beds = ["red_bed", "white_bed", "light_gray_bed", "blue_bed"] as const;
  let n = 0;

  for (let s = 1; s < floors; s++) {
    const level = s * storey;
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
  readonly interior: LocalRect;
  readonly floors: number;
  readonly storey: number;
  readonly cx: number;
  readonly coreColumns: ReadonlySet<string>;
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
  const { put, style, interior, floors, storey } = r;
  const desk = style["stone.slab"] as string;
  if (interior.x1 <= r.cx + 1) return 0;
  let n = 0;
  for (let s = 0; s < floors; s++) {
    const level = s * storey;
    // From `z0 + 2`, not `z0 + 1`: the lobby counter runs along the `z0` row,
    // and a desk one cell diagonally off its end boxes the corner cell in
    // between them — a top slab is not a cell a player fits in, so two of them
    // meeting at a corner is a one-cell room with no way into it.
    for (let z = interior.z0 + 2; z <= interior.z1 - 1; z += 3) {
      if (s === 0 && r.coreColumns.has(`${interior.x1},${z}`)) continue;
      put(interior.x1, level + 1, z, desk, { type: "top" });
      n++;
    }
  }
  return n;
}

interface BalconyRequest {
  readonly put: Put;
  readonly style: Readonly<Record<string, string>>;
  readonly ring: readonly { readonly x: number; readonly z: number; readonly corner: boolean; readonly alongX: boolean; readonly outward: Cardinal }[];
  readonly floors: number;
  readonly storey: number;
  readonly sx: number;
  readonly sz: number;
  readonly doorColumns: ReadonlySet<string>;
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
  const { put, style, ring, floors, storey } = r;
  const deckSlab = style["roof.slab"] as string;
  const bars = style["wall.fence"] as string;
  let n = 0;
  for (let s = 1; s < floors; s++) {
    const level = s * storey;
    for (const cell of ring) {
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

interface CounterRequest {
  readonly put: Put;
  readonly style: Readonly<Record<string, string>>;
  readonly interior: LocalRect;
  readonly coreColumns: ReadonlySet<string>;
  readonly door: { readonly x: number; readonly z: number; readonly face: Cardinal } | null;
}

/** The reception counter: three top slabs against the wall away from the door. */
function fitLobbyCounter(r: CounterRequest): number {
  const { put, style, interior, door } = r;
  if (door === null) return 0;
  const counter = style["stone.slab"] as string;
  // Against the face opposite the way in, so a visitor walks towards it.
  const z = door.face === "south" ? interior.z0 : interior.z1;
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
