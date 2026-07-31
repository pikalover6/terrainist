/**
 * Archetype **breadth** — the second wave of building contents.
 *
 * `archetypes.ts` owns the first six archetypes (cottage, hall, inn, smithy,
 * granary, watchtower) and the tag → archetype mapping. This file owns
 * everything added on top of them:
 *
 * - the seven new archetypes — church, barn, windmill, warehouse, market
 *   stall, library, bakery — and their ground-floor fit-out;
 * - the two exterior flourishes those archetypes need (a church steeple with
 *   a bell, a windmill's static cross of blades), both driven from the
 *   envelope rather than from a fixed size;
 * - **upper-floor** fit-out for every archetype, which until now was the
 *   grammar's most visible gap: a two-storey cottage had a bedroom with
 *   nothing in it.
 *
 * It is a leaf of the structures graph on purpose: it imports from `core.ts`
 * only, and `archetypes.ts` imports *it*. That keeps the dependency one-way
 * and lets the two files be edited by different tracks without conflict.
 *
 * ## The walkability invariant
 *
 * The granary fix established the rule every fit-out here obeys: a room a
 * player cannot cross is a bug, not a decoration. Rather than restate it as a
 * per-archetype layout constraint — which is how the granary's checkerboard
 * got through — this file *enforces* it. {@link FloorPlan} keeps the set of
 * free cells and refuses any prop whose placement would disconnect the
 * remainder, so a bookshelf that would wall off a corner simply does not get
 * placed. The check is a flood fill over at most a few hundred cells, run a
 * couple of dozen times per building; it costs nothing worth measuring.
 */

import { blitzFacadeDefaults } from "./archetypes-blitz.js";
import { townFacadeDefaults } from "./archetypes-town.js";
import { tradeFacadeDefaults } from "./archetypes-trade.js";
import { homesteadFacadeDefaults } from "./archetypes-homestead.js";
import { regionalFacadeDefaults } from "./archetypes-regional.js";
import { vernacularFacadeDefaults } from "./archetypes-vernacular.js";
import { wave2FacadeDefaults } from "./archetypes-wave2.js";
import { worksFacadeDefaults } from "./archetypes-works.js";
import { institutionFacadeDefaults } from "./archetypes-institution.js";
import { leisureFacadeDefaults } from "./archetypes-leisure.js";
import { residentialFacadeDefaults } from "./archetypes-residential.js";
import { cardinalStep, type Cardinal, type LocalRect, type LocalVoxelOp, type Put } from "./core.js";

/* -------------------------------------------------------------------------- */
/* the new archetypes                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Archetypes added on top of the original six.
 *
 * Kept as its own list so `BUILDING_ARCHETYPES` can be spelled as "the first
 * six, then these", and so a caller that wants to ask "is this one of the new
 * ones" has something to ask.
 */
export const EXTENDED_BUILDING_ARCHETYPES = [
  "church",
  "barn",
  "windmill",
  "warehouse",
  "market_stall",
  "library",
  "bakery",
] as const;

/** One of the archetypes this file fits out. */
export type ExtendedBuildingArchetype = (typeof EXTENDED_BUILDING_ARCHETYPES)[number];

/**
 * Tag → extended archetype, or `null` when no tag matches.
 *
 * Consulted by `archetypeOfTags` *before* the original mapping, because the
 * original one is deliberately greedy: `market` would otherwise be swallowed
 * by `trade` → inn, and `storehouse` by `store` → granary. Order inside this
 * table matters for the same reason — the more specific building wins.
 */
export function extendedArchetypeOfTags(tags: readonly string[]): ExtendedBuildingArchetype | null {
  const has = (t: string): boolean => tags.includes(t);
  if (has("church") || has("chapel") || has("temple") || has("shrine") || has("worship")) {
    return "church";
  }
  if (has("windmill") || has("mill")) return "windmill";
  if (has("barn") || has("stable") || has("byre")) return "barn";
  if (has("warehouse") || has("depot") || has("storehouse")) return "warehouse";
  if (has("market_stall") || has("stall") || has("market") || has("vendor")) return "market_stall";
  if (has("library") || has("study") || has("scriptorium") || has("archive")) return "library";
  if (has("bakery") || has("bakehouse") || has("baker")) return "bakery";
  return null;
}

/* -------------------------------------------------------------------------- */
/* window and door tendencies                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Facade tendencies, expressed only in parameters `core.ts` already resolves.
 *
 * A church wants tall lights and a nave-length rhythm; a warehouse wants
 * almost none; a market stall wants its whole front open. None of that needs
 * a new knob — `windowShape`, `windowRhythm` and `roof` already carry it. What
 * `core.ts` does *not* do is consult the archetype when it resolves them, so
 * this returns **defaults a caller merges into its params** rather than
 * something the grammar applies on its own. See the note in the module docs of
 * `exhibits/archetypes.ts` for where that seam bites.
 *
 * Explicit caller params always win: this only fills holes.
 */
export function archetypeFacadeDefaults(
  archetype: string,
): { readonly windowShape?: string; readonly windowRhythm?: string; readonly roof?: string } {
  switch (archetype) {
    // A nave reads by its lights: tall, and one per bay.
    case "church":
      return { windowShape: "tall", windowRhythm: "regular", roof: "gable" };
    // Big doors, few windows, and a roof that sheds: a barn is a shed with
    // ambitions.
    case "barn":
      return { windowShape: "single", windowRhythm: "sparse", roof: "gable" };
    // The tower is the point; the openings are incidental.
    case "windmill":
      return { windowShape: "single", windowRhythm: "sparse", roof: "hip" };
    // Goods do not want daylight. High, small, and rare.
    case "warehouse":
      return { windowShape: "single", windowRhythm: "sparse", roof: "gable" };
    // As open as walls allow.
    case "market_stall":
      return { windowShape: "mullion", windowRhythm: "dense", roof: "flat" };
    // Paired lights between the presses, so the shelving has wall to stand on.
    case "library":
      return { windowShape: "mullion", windowRhythm: "paired", roof: "gable" };
    case "bakery":
      return { windowShape: "single", windowRhythm: "regular", roof: "gable" };
    default: {
      // Each later wave keeps its own tendencies in its own file; falling
      // through to them here is what lets a keep ask for the roof shape whose
      // height its battlement is going to take over, a town hall the one its
      // clock gable stands in front of, a shopfront the glass it is mostly
      // made of, and a saltbox the ridge it is about to rebuild. The chain is
      // ordered, each link answers `{}` for anything not its own, and the
      // first non-empty answer wins — no two waves answer to the same names.
      const town = townFacadeDefaults(archetype);
      if (Object.keys(town).length > 0) return town;
      const blitz = blitzFacadeDefaults(archetype);
      if (Object.keys(blitz).length > 0) return blitz;
      const trade = tradeFacadeDefaults(archetype);
      if (Object.keys(trade).length > 0) return trade;
      const regional = vernacularFacadeDefaults(archetype);
      if (Object.keys(regional).length > 0) return regional;
      const wave2 = wave2FacadeDefaults(archetype);
      if (Object.keys(wave2).length > 0) return wave2;
      const works = worksFacadeDefaults(archetype);
      if (Object.keys(works).length > 0) return works;
      // Wave three A, the institutions.
      const institutions = institutionFacadeDefaults(archetype);
      if (Object.keys(institutions).length > 0) return institutions;
      // Wave 4C — leisure, modern and science interiors.
      const leisure = leisureFacadeDefaults(archetype);
      if (Object.keys(leisure).length > 0) return leisure;
      // Wave four D, the homestead — appended, and the regional houses stay
      // the tail of the chain.
      const homestead = homesteadFacadeDefaults(archetype);
      if (Object.keys(homestead).length > 0) return homestead;
      // Wave four A, the dwellings.
      const residential = residentialFacadeDefaults(archetype);
      if (Object.keys(residential).length > 0) return residential;
      return regionalFacadeDefaults(archetype);
    }
  }
}

/* -------------------------------------------------------------------------- */
/* the fit-out context                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Everything a fit-out needs, handed over by `furnish`.
 *
 * A struct rather than a dozen parameters because both entry points here want
 * the same set, and because `place`/`placeBed`/`free` are the ground floor's
 * *own* guards — the door approach, the stair columns and the hearth — which
 * this file must not reimplement or it will drift out of step with them.
 */
export interface FitOutContext {
  readonly put: Put;
  readonly style: Readonly<Record<string, string>>;
  readonly archetype: string;
  readonly interior: LocalRect;
  readonly door: { x: number; z: number; face: Cardinal } | null;
  readonly storyHeight: number;
  readonly floors: number;
  /** Is this ground-floor cell available? Owns the door/stair/hearth reserve. */
  readonly free: (x: number, z: number) => boolean;
  /** Place one block at `y = 1` if the cell is free. */
  readonly place: (x: number, z: number, block: string, props?: Record<string, string>) => void;
  /** Lay a bed at `y = 1`, both halves or neither. */
  readonly placeBed: (x: number, z: number, facing: Cardinal, block: string) => void;
  /**
   * Claim ground-floor cells for a solid prop, or refuse.
   *
   * The ground floor's copy of the walkability invariant: it refuses any take
   * that would strand part of the room. Passable blocks (see
   * {@link isPassable}) go through untouched.
   */
  readonly take: (cells: readonly (readonly [number, number])[], block: string) => boolean;
  /** The building's unrotated envelope, `[sizeX, sizeY, sizeZ]`. */
  readonly size: readonly [number, number, number];
  /** Y of the eave plate. */
  readonly wallTop: number;
  /** Y of the roof's highest course, as `core.ts` actually built it. */
  readonly roofTop: number;
  /** Every enclosed floor cell, across both rects of the footprint. */
  readonly floorCells: readonly { readonly x: number; readonly z: number }[];
  /** What earlier stages wrote at a cell, if anything. */
  readonly blockAt: (x: number, y: number, z: number) => LocalVoxelOp | undefined;
}

/** Plan width, from the interior rect: the interior is inset one cell all round. */
function planX(interior: LocalRect): number {
  return interior.x1 + 2;
}

/** Plan depth. See {@link planX}. */
function planZ(interior: LocalRect): number {
  return interior.z1 + 2;
}

/**
 * A *decorated* flower pot, chosen from the cell's coordinates.
 *
 * A bare `flower_pot` in the world is an **empty** pot: in game it reads as
 * "a pot with just dirt in it", which is what Kai reported walking the
 * cottages. Every decorative pot this file places therefore goes down as a
 * `potted_*` variant. The pick is position-derived — the same idiom as
 * `pottedOf` in `core.ts`, restated locally because that helper is not
 * exported — so it stays deterministic with no seed and no randomness.
 */
function pottedPlant(x: number, z: number): string {
  const pots = ["potted_poppy", "potted_dandelion", "potted_azure_bluet", "potted_cornflower"];
  // Non-negative regardless of sign; the local frame is non-negative anyway.
  const i = (((x * 3 + z * 7) % pots.length) + pots.length) % pots.length;
  return pots[i] as string;
}

/* -------------------------------------------------------------------------- */
/* the walkability guard                                                       */
/* -------------------------------------------------------------------------- */

/**
 * A floor's free cells, with the rule that they stay one connected region.
 *
 * Used for the storeys above ground, where there is no `free`/`place` pair to
 * borrow: the upper floor's obstacles are the stairwell (a hole in the plane,
 * so not a cell at all), the rail along its open edge, and whatever this pass
 * itself has put down. `occupy` is the only way to take a cell, and it refuses
 * any take that would strand part of the floor — which is the granary's
 * lesson, generalised.
 */
export class FloorPlan {
  private readonly open = new Set<string>();
  private readonly protectedCells = new Set<string>();

  /**
   * @param cells every walkable cell of the floor.
   * @param protect cells that stay walkable but may never be built on — the
   *   landing at the head of the flight and the approach to it. They are part
   *   of the plan, not removed from it: a reserve that is *excluded* stops
   *   counting towards connectivity, and an inn duly put a bed on the one cell
   *   past its top step and left the flight arriving into a dead end.
   */
  constructor(cells: Iterable<string>, protect: Iterable<string> = []) {
    for (const c of cells) this.open.add(c);
    for (const c of protect) if (this.open.has(c)) this.protectedCells.add(c);
  }

  get size(): number {
    return this.open.size;
  }

  has(x: number, z: number): boolean {
    return this.open.has(`${x},${z}`);
  }

  /** All free cells, in insertion order. */
  cells(): readonly string[] {
    return [...this.open];
  }

  /**
   * Take one or more cells, or none of them.
   *
   * All-or-nothing because a bed is two cells and half a bed is a defect. The
   * connectivity check runs once, on the whole take.
   */
  occupy(cells: readonly (readonly [number, number])[]): boolean {
    const keys = cells.map(([x, z]) => `${x},${z}`);
    if (keys.some((k) => !this.open.has(k) || this.protectedCells.has(k))) return false;
    for (const k of keys) this.open.delete(k);
    if (this.connected()) return true;
    for (const k of keys) this.open.add(k);
    return false;
  }

  /** Is every remaining free cell 4-reachable from every other one? */
  private connected(): boolean {
    const first = this.open.values().next();
    if (first.done === true) return true;
    const seen = new Set<string>([first.value]);
    const queue = [first.value];
    while (queue.length > 0) {
      const [x, z] = (queue.pop() as string).split(",").map(Number) as [number, number];
      for (const [dx, dz] of NEIGHBOURS) {
        const k = `${x + dx},${z + dz}`;
        if (!this.open.has(k) || seen.has(k)) continue;
        seen.add(k);
        queue.push(k);
      }
    }
    return seen.size === this.open.size;
  }
}

/**
 * Blocks a player walks *over* rather than into.
 *
 * A carpet aisle down a nave and a pressure-plate table top are decoration on
 * the floor, not obstacles on it, so the connectivity guard must not count
 * them: a church whose aisle "blocked" the nave would lose its aisle. The list
 * is deliberately short and positive — anything unrecognised is treated as
 * solid, which is the safe direction.
 */
export function isPassable(block: string): boolean {
  return (
    block.endsWith("_carpet") ||
    block.endsWith("_pressure_plate") ||
    block.endsWith("_candle") ||
    block === "torch" ||
    block === "wall_torch" ||
    block === "ladder"
  );
}

/**
 * The ground floor's free cells, as they stand when the fit-out begins.
 *
 * Not simply "every cell of the interior": by the time `furnish` runs, the
 * stair flight is already standing in the west column and the chimney breast
 * is already in the wall. A plan that did not know about them would call a
 * room connected through a staircase — which is exactly how an inn on a
 * nine-wide plan put a chair in the one cell joining its two halves and passed
 * its own guard.
 */
export function wholeFloorPlan(
  interior: LocalRect,
  blockAt: (x: number, y: number, z: number) => LocalVoxelOp | undefined,
  floorCells?: readonly { readonly x: number; readonly z: number }[],
): FloorPlan {
  // `floorCells` is the whole room across both rects of an L or a T; the
  // rectangle is the fallback for a caller that has not got one. Passing it
  // matters for more than reach: the guard's job is to keep the floor one
  // connected region, and a guard that cannot see the wing would happily wall
  // the wing off from the main block and call the remainder connected.
  const cells: string[] = [];
  const consider = (x: number, z: number): void => {
    const standing = blockAt(x, 1, z);
    if (standing !== undefined && !isPassable(standing.block)) return;
    cells.push(`${x},${z}`);
  };
  if (floorCells === undefined) {
    for (let z = interior.z0; z <= interior.z1; z++) {
      for (let x = interior.x0; x <= interior.x1; x++) consider(x, z);
    }
  } else {
    for (const cell of floorCells) consider(cell.x, cell.z);
  }
  return new FloorPlan(cells);
}

const NEIGHBOURS: readonly (readonly [number, number])[] = Object.freeze([
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const);

/* -------------------------------------------------------------------------- */
/* ground-floor fit-out                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Fit out the ground floor of one of the extended archetypes.
 *
 * Returns the number of props written, which `furnish` adds to its own count
 * so `meta.furnitureCount` still means "things inside this building".
 * Anything the archetype is not one of ours returns 0 without touching a cell.
 */
export function furnishExtended(ctx: FitOutContext): number {
  const counter = new PropCounter(ctx);
  switch (ctx.archetype) {
    case "church":
      fitChurch(ctx, counter);
      break;
    case "barn":
      fitBarn(ctx, counter);
      break;
    case "windmill":
      fitWindmill(ctx, counter);
      break;
    case "warehouse":
      fitWarehouse(ctx, counter);
      break;
    case "market_stall":
      fitMarketStall(ctx, counter);
      break;
    case "library":
      fitLibrary(ctx, counter);
      break;
    case "bakery":
      fitBakery(ctx, counter);
      break;
    default:
      return 0;
  }
  return counter.n;
}

/**
 * A `place` that counts.
 *
 * `furnish`'s own `place` increments a closure variable this file cannot see,
 * so the fit-outs here route through this instead: same guards (it delegates
 * to `ctx.place`/`ctx.free`), but the count comes back.
 */
export class PropCounter {
  n = 0;
  constructor(private readonly ctx: FitOutContext) {}

  /** One block at `y = 1`. Returns whether it landed. */
  put1(x: number, z: number, block: string, props?: Record<string, string>): boolean {
    if (!this.ctx.free(x, z)) return false;
    if (!this.headroom(x, z, 1)) return false;
    if (!this.ctx.take([[x, z]], block)) return false;
    this.ctx.put(x, 1, z, block, props);
    this.n++;
    return true;
  }

  /** A block stacked at `y` over a free column — a shelf, a crate on a crate. */
  stack(x: number, z: number, y: number, block: string, props?: Record<string, string>): boolean {
    if (!this.ctx.free(x, z)) return false;
    if (!this.headroom(x, z, y)) return false;
    this.ctx.put(x, y, z, block, props);
    this.n++;
    return true;
  }

  /**
   * Would writing at `y` leave this interior column any air at all?
   *
   * The rule the physics lint calls `interior.blocked_column`: a cell that is
   * solid from its floor to its ceiling is a pillar through the room, and it
   * does not matter whether it got that way as a chimney flue or as a crate
   * with a sack on it. On a three-high storey the usable band is two courses,
   * so a stack of two is already a pillar — and so is *one* prop standing
   * under the hanging lantern, which is how a library put a lectern in the
   * middle of the floor and sealed the cell it stood in.
   */
  private headroom(x: number, z: number, y: number): boolean {
    const top = this.ctx.storyHeight - 1;
    if (y > top) return true;
    for (let k = 1; k <= top; k++) {
      if (k === y) continue;
      if (this.ctx.blockAt(x, k, z) === undefined) return true;
    }
    return false;
  }

  /** A block anywhere, unguarded — for the exterior flourishes only. */
  raw(x: number, y: number, z: number, block: string, props?: Record<string, string>): void {
    this.ctx.put(x, y, z, block, props);
    this.n++;
  }
}

/**
 * A nave: pews either side of a carpet aisle, an altar and lectern at the
 * head of it, and a steeple with a bell over the roof.
 *
 * The aisle runs along z because the door is on a z face by default and a
 * congregation walks in a straight line from it. Pews are stairs turned to
 * face the altar, which is the oldest trick in the block-building book and
 * still the only one that reads at a glance.
 */
function fitChurch(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const mid = Math.floor((it.x0 + it.x1) / 2);
  const pew = style["stair.interior"] as string;

  // The altar end is the end furthest from the door, so a worshipper faces it
  // on the way in.
  const altarNorth = ctx.door === null ? true : ctx.door.z > (it.z0 + it.z1) / 2;
  const altarZ = altarNorth ? it.z0 : it.z1;
  /**
   * THE STAIR-SEAT RULE, obeyed by every seat in this file: a stair's
   * `facing` is the direction of its **high half** — the backrest. So a
   * stair used as a chair must face *away* from whatever the sitter looks
   * at. A pew whose altar is to the north therefore faces **south**; the
   * old code faced it north, which put the backrest against the altar and
   * sat the congregation with their backs to it.
   */
  const pewFacing: Cardinal = altarNorth ? "south" : "north";
  /** Which way a sitter on those pews looks. */
  const towardAltar: Cardinal = altarNorth ? "north" : "south";

  // The aisle.
  for (let z = it.z0; z <= it.z1; z++) c.put1(mid, z, "red_carpet");

  // Pews, in bays of two rows with a gap between them.
  const firstBay = altarNorth ? it.z0 + 2 : it.z0;
  const lastBay = altarNorth ? it.z1 : it.z1 - 2;
  for (let z = firstBay; z <= lastBay; z++) {
    if ((z - firstBay) % 3 === 2) continue;
    for (let x = it.x0; x <= it.x1; x++) {
      if (x === mid || x === mid - 1 || x === mid + 1) continue;
      c.put1(x, z, pew, { facing: pewFacing, half: "bottom", shape: "straight" });
    }
  }

  // The altar: a block of dressed stone with a candle on it, and a lectern to
  // one side. Both stand on the aisle's end, clear of the pews.
  c.put1(mid, altarZ, "chiseled_stone_bricks");
  if (ctx.free(mid, altarZ)) {
    c.stack(mid, altarZ, 2, "white_candle", { candles: "1", lit: "false", waterlogged: "false" });
  }
  if (mid - 1 >= it.x0) {
    // The lectern faces the congregation, i.e. back down the nave.
    c.put1(mid - 1, altarZ, "lectern", { facing: towardAltar === "north" ? "south" : "north", has_book: "false", powered: "false" });
  }
  if (mid + 1 <= it.x1) c.put1(mid + 1, altarZ, pottedPlant(mid + 1, altarZ));

  emitSteeple(ctx, c);
}

/**
 * Stalls down both long walls with a cart aisle between them.
 *
 * The dividers reach two cells in from the wall and no further: a divider that
 * spans the room is a wall, and a barn with a wall across it is two barns. The
 * central aisle is what keeps the floor one region — the same property the
 * granary's hay had to learn.
 */
function fitBarn(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const fence = style["wall.fence"] as string;
  const w = it.x1 - it.x0 + 1;
  if (w < 5) {
    // Too narrow for two ranges of stalls and an aisle: one range, one trough.
    c.put1(it.x0, it.z0 + 1, "hay_block", { axis: "y" });
    c.put1(it.x0, it.z0 + 2, "composter", { level: "0" });
    return;
  }
  for (let z = it.z0; z + 3 <= it.z1; z += 4) {
    for (const [wall, inward] of [
      [it.x0, 1],
      [it.x1, -1],
    ] as const) {
      // The divider.
      c.put1(wall, z, fence);
      c.put1(wall + inward, z, fence);
      // The stall itself: a trough at the head, a bale of bedding behind it.
      c.put1(wall, z + 1, "composter", { level: "0" });
      c.put1(wall, z + 2, "hay_block", { axis: "y" });
    }
  }
  // A water butt and the tack, at the far end of the aisle.
  c.put1(it.x0, it.z1, "cauldron", { level: "3" });
  c.put1(it.x1, it.z1, "barrel", { facing: "up", open: "false" });
}

/**
 * A mill: the stones on the floor, the meal in barrels, and a static cross of
 * sails on the gable end outside.
 */
function fitWindmill(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it } = ctx;
  const mid = Math.floor((it.x0 + it.x1) / 2);
  const mz = Math.floor((it.z0 + it.z1) / 2);
  // The millstone: a dressed course with the grindstone standing on it.
  if (c.put1(mid, mz, "smooth_stone")) {
    c.stack(mid, mz, 2, "grindstone", { face: "floor", facing: "north" });
  }
  c.put1(it.x1, it.z0, "barrel", { facing: "up", open: "false" });
  c.put1(it.x1, it.z1, "barrel", { facing: "up", open: "false" });
  c.put1(it.x0, it.z1, "composter", { level: "0" });
  emitBlades(ctx, c);
}

/**
 * Crates and shelving: stacks of barrels and chests against the walls, two
 * high, with the floor left as the loading aisle it has to be.
 */
function fitWarehouse(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it } = ctx;
  for (let z = it.z0; z <= it.z1; z++) {
    for (const x of [it.x0, it.x1]) {
      // Spaced along the wall, in a phase that is a pure function of position
      // so the two walls agree and a re-run is byte-identical.
      if ((x + z * 2) % 3 !== 0) continue;
      const chest = (x + z) % 2 === 0;
      if (chest) {
        c.put1(x, z, "chest", { facing: x === it.x0 ? "east" : "west", type: "single" });
      } else if (c.put1(x, z, "barrel", { facing: "up", open: "false" })) {
        // A second crate on the first — never a third, which on a low storey
        // is a column through the room.
        if (ctx.storyHeight >= 5) c.stack(x, z, 2, "barrel", { facing: "up", open: "false" });
      }
    }
  }
  // Shelving: trapdoors braced off the end wall, above head height, so they
  // read as racking rather than as furniture in the way.
  const shelfY = Math.min(3, ctx.storyHeight - 1);
  for (let x = it.x0; x <= it.x1; x++) {
    if ((x + it.z1) % 2 !== 0) continue;
    const backing = ctx.blockAt(x, shelfY, it.z1 + 1);
    if (backing === undefined) continue;
    c.raw(x, shelfY, it.z1, ctx.style["wall.trapdoor"] as string, {
      facing: "north",
      half: "top",
      open: "false",
      powered: "false",
    });
  }
}

/**
 * A stall: a counter and its goods inside, and a canopy on posts over the
 * doorstep outside.
 *
 * The canopy is the whole point — a market stall that is only an interior is a
 * shed — and it lives in the apron, the one block of ground outside the wall
 * that the eave and the window boxes already use. It needs a door to hang off:
 * without one there is no front, and the stall is just a small shop.
 */
function fitMarketStall(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style, door } = ctx;
  // The counter runs along the wall opposite the door.
  for (let x = it.x0; x <= it.x1; x++) {
    c.put1(x, it.z0, style["wall.frame"] as string, { axis: "x" });
  }
  c.put1(it.x1, it.z1, "barrel", { facing: "up", open: "false" });
  c.put1(it.x0, it.z1, "composter", { level: "3" });
  // Goods on the counter: a potted plant for sale at one end, a bale at the
  // other. (A bare `flower_pot` here was an empty pot — nothing to buy.)
  c.stack(it.x0, it.z0, 2, pottedPlant(it.x0, it.z0));
  c.stack(it.x1, it.z0, 2, "hay_block", { axis: "y" });

  if (door === null) return;
  const [dx, dz] = cardinalStep(door.face);
  const canopyY = Math.min(4, ctx.storyHeight);
  const alongZ = dx !== 0;
  // Two posts, one either side of the doorstep, standing on the ground.
  for (const side of [-1, 1]) {
    const px = door.x + dx + (alongZ ? 0 : side);
    const pz = door.z + dz + (alongZ ? side : 0);
    // From the ground up, not from the doorstep up: the apron cell at `y = 0`
    // is the ground outside the wall — the same course the window boxes stand
    // their fences on — and a post that starts at `y = 1` is a post hanging in
    // the air, which the physics lint reports as exactly that.
    for (let y = 0; y < canopyY; y++) {
      c.raw(px, y, pz, style["wall.fence"] as string);
    }
    // The stripe: two colours of wool alternating along the canopy, which is
    // what makes it read as an awning and not a lid.
    for (let k = -1; k <= 1; k++) {
      const wx = door.x + dx + (alongZ ? 0 : k);
      const wz = door.z + dz + (alongZ ? k : 0);
      c.raw(wx, canopyY, wz, (wx + wz) % 2 === 0 ? "white_wool" : "red_wool");
    }
  }
}

/** Presses against the walls, a lectern in the middle, a chair beside it. */
function fitLibrary(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const mid = Math.floor((it.x0 + it.x1) / 2);
  const mz = Math.floor((it.z0 + it.z1) / 2);
  for (let z = it.z0; z <= it.z1; z++) {
    for (const x of [it.x0, it.x1]) {
      // A press, then a gap: a continuous run of bookshelves is a second wall.
      if ((z + x) % 2 !== 0) continue;
      if (c.put1(x, z, "bookshelf") && ctx.storyHeight >= 5) c.stack(x, z, 2, "bookshelf");
    }
  }
  c.put1(mid, mz, "lectern", { facing: "south", has_book: "false", powered: "false" });
  // The reader's chair sits south of the lectern and looks north at it, so by
  // the stair-seat rule its backrest — its `facing` — points south.
  c.put1(mid, mz + 1 <= it.z1 ? mz + 1 : mz, style["stair.interior"] as string, {
    facing: "south",
    half: "bottom",
    shape: "straight",
  });
  // The catalogue press: wherever on the east wall it still fits, because the
  // presses above take the cells whose parity says so and the corner may be
  // one of them.
  for (let z = it.z1; z >= it.z0; z--) {
    if (c.put1(it.x1, z, "chiseled_bookshelf", { facing: "west" })) break;
  }
}

/** Two ovens on one wall, a counter opposite, and one cake on it. */
function fitBakery(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  c.put1(it.x1, it.z0, "furnace", { facing: "west", lit: "false" });
  c.put1(it.x1, it.z0 + 1 <= it.z1 ? it.z0 + 1 : it.z0, "smoker", { facing: "west", lit: "false" });
  c.put1(it.x1, it.z1, "barrel", { facing: "up", open: "false" });
  // The counter, and the day's bake on it. One cake: a bakery with a cake on
  // every surface is a cake shop in a fever dream.
  const counterZ = it.z1;
  for (let x = it.x0; x <= Math.min(it.x0 + 2, it.x1); x++) {
    c.put1(x, counterZ, style["wall.frame"] as string, { axis: "x" });
  }
  c.stack(it.x0, counterZ, 2, "cake", { bites: "0" });
  c.put1(it.x0, it.z0, "composter", { level: "2" });
  c.put1(it.x0 + 1 <= it.x1 ? it.x0 + 1 : it.x0, it.z0, "cauldron", { level: "3" });
}

/**
 * Furnish the wing of an L or a T.
 *
 * The archetype fit-outs above all reason about {@link FitOutContext.interior},
 * which is the *main* rect's interior — a deliberate simplification, because
 * every one of them is a composition against a rectangle. The consequence was
 * that a wing came out as floor, ceiling and a lantern with nothing in it: a
 * back room whose only content was the fact that it was a back room.
 *
 * This is the generic answer, and it is generic on purpose. A wing is a back
 * room whatever the building is — a scullery, a store, a vestry — so it gets
 * back-room furniture rather than a second copy of the archetype's own layout
 * at a different offset. Two props, against the wall furthest from the way in,
 * both through `ctx.take`, so the walkability guard has the same veto here it
 * has everywhere else.
 *
 * Returns the props written; 0 when the plan is a plain rect.
 */
export function furnishWing(ctx: FitOutContext): number {
  const { interior: it } = ctx;
  // The wing is exactly the floor the main rect's interior does not carry.
  const wing = ctx.floorCells.filter(
    (c) => c.x < it.x0 || c.x > it.x1 || c.z < it.z0 || c.z > it.z1,
  );
  if (wing.length < 4) return 0;

  // Order by distance from the door, furthest first: the far corner of a back
  // room is where the barrels go, and the near end is the way through to it.
  const door = ctx.door;
  const from = door ?? { x: it.x0, z: it.z0 };
  const ranked = [...wing].sort(
    (a, b) =>
      (b.x - from.x) ** 2 + (b.z - from.z) ** 2 - ((a.x - from.x) ** 2 + (a.z - from.z) ** 2) ||
      a.z - b.z ||
      a.x - b.x,
  );

  let n = 0;
  for (const cell of ranked) {
    if (n >= 2) break;
    const block = n === 0 ? "barrel" : "composter";
    const props = n === 0 ? { facing: "up", open: "false" } : { level: "0" };
    if (!ctx.free(cell.x, cell.z)) continue;
    // Never under the wing's own hanging lantern. A barrel at `y = 1` with a
    // lantern at `y = 2` is a column a player cannot occupy at all, which the
    // physics lint reports — correctly — as a blocked interior column.
    let overhead = false;
    for (let y = 2; y < ctx.storyHeight; y++) {
      if (ctx.blockAt(cell.x, y, cell.z) !== undefined) overhead = true;
    }
    if (overhead) continue;
    if (!ctx.take([[cell.x, cell.z]], block)) continue;
    ctx.put(cell.x, 1, cell.z, block, props);
    n++;
  }
  return n;
}

/* -------------------------------------------------------------------------- */
/* exterior flourishes                                                         */
/* -------------------------------------------------------------------------- */

/**
 * How far above the roof a steeple or a sail may reach.
 *
 * One course, and no more. The layout solver reserved a box for this building
 * and the terrain, the roads and the neighbouring plots were all fitted to it;
 * a spire that overshoots by four is a building that is no longer the size it
 * said it was. One course is the same allowance the eave already takes in
 * plan, and it is enough for a cap to read as a cap.
 */
export const ROOF_FLOURISH_RISE = 1;

/**
 * A bell tower over the nave.
 *
 * Built with the watchtower's machinery — a hollow shaft of the wall material,
 * openings near its head, a solid cap — but sized from *this* building's
 * envelope rather than from a tower's. Two properties are load-bearing:
 *
 * - It stands entirely **above** `wallTop`, so it cannot take an interior cell
 *   from the fit-out, the stair or the hearth. The ceiling plane at `wallTop`
 *   already seals the room below it.
 * - Its plan stays inside the footprint and its head stays within
 *   {@link ROOF_FLOURISH_RISE} of the roof, so a steeple never leaves the
 *   envelope the layout solver reserved for the building.
 *
 * Returns the ops written, or 0 on a plan too small to carry a tower.
 */
export function emitSteeple(ctx: FitOutContext, c: PropCounter): number {
  const sx = planX(ctx.interior);
  const sz = planZ(ctx.interior);
  if (sx < 7 || sz < 7) return 0;
  const { wallTop, roofTop } = ctx;
  const top = roofTop + ROOF_FLOURISH_RISE;
  const base = wallTop + 1;
  if (top - base < 3) return 0;

  const mx = Math.floor(sx / 2);
  // Over the front bay, not the middle of the nave: a tower on the crossing
  // and a tower at the west end look different, and the west end is the one a
  // village church has.
  const mz = 2;
  const before = c.n;
  const wall = ctx.style["wall.primary"] as string;
  const frame = ctx.style["wall.frame"] as string;

  for (let y = base; y < top; y++) {
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dz === 0) continue;
        const corner = dx !== 0 && dz !== 0;
        const louvre = !corner && y >= top - 2;
        c.raw(
          mx + dx,
          y,
          mz + dz,
          louvre ? (ctx.style["wall.fence"] as string) : corner ? frame : wall,
          corner ? { axis: "y" } : undefined,
        );
      }
    }
  }
  // The cap, and the bell hung from it. `attachment: ceiling` names the block
  // above the bell, which the cap course has just supplied — a bell attached
  // to nothing is dropped on the first block update.
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) c.raw(mx + dx, top, mz + dz, ctx.style["roof.solid"] as string);
  }
  c.raw(mx, top - 1, mz, "bell", { facing: "north", attachment: "ceiling", powered: "false" });
  return c.n - before;
}

/**
 * The sails: a static cross on the gable end, one block clear of the wall.
 *
 * Static because the grammar has no moving parts and no entities, and a cross
 * of wool on a frame axle is what a mill looks like when it is not turning.
 * It hangs in the apron — the same one-block ring the eave and the window
 * boxes occupy — so a sail never reaches past the envelope by more than the
 * building's own overhang.
 */
export function emitBlades(ctx: FitOutContext, c: PropCounter): number {
  const sx = planX(ctx.interior);
  const { wallTop, roofTop } = ctx;
  const cx = Math.floor(sx / 2);
  const cy = wallTop + 1;
  // The arms reach as far as the shorter of: the wall they hang on, the ground
  // below, and the roof above. A sail through the ground is not a sail.
  const radius = Math.min(3, cx, sx - 1 - cx, cy - 1, roofTop + ROOF_FLOURISH_RISE - cy);
  if (radius < 2) return 0;

  const before = c.n;
  const z = -1;
  c.raw(cx, cy, z, ctx.style["wall.frame"] as string, { axis: "z" });
  for (let k = 1; k <= radius; k++) {
    const sail = k === radius ? "white_wool" : "light_gray_wool";
    c.raw(cx - k, cy, z, sail);
    c.raw(cx + k, cy, z, sail);
    c.raw(cx, cy - k, z, sail);
    c.raw(cx, cy + k, z, sail);
  }
  return c.n - before;
}

/* -------------------------------------------------------------------------- */
/* upper floors                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Furnish every storey above the ground one.
 *
 * The known gap: `core.ts` builds the floor plane, the flight and the rail for
 * an upper storey and then nothing ever stands on it, so a two-storey cottage
 * has an empty attic and a two-storey inn has no beds — which is the one thing
 * an inn is for.
 *
 * The plan is read back out of the cells rather than re-derived: a cell is
 * floor if something was written at `level`, and it is *usable* if the two
 * courses above it are clear. That makes the stairwell (a hole, so no floor),
 * the rail along its open edge and the hanging lantern all obstacles by
 * construction, with no second copy of the stair geometry to fall out of date.
 *
 * Every landing cell — anything orthogonally touching the well — is reserved
 * outright, and every take goes through {@link FloorPlan}, so the storey stays
 * one walkable region with the head of the stairs inside it.
 */
export function furnishUpperFloors(ctx: FitOutContext): number {
  if (ctx.floors < 2) return 0;
  const { interior: it } = ctx;
  let n = 0;

  for (let s = 1; s < ctx.floors; s++) {
    const level = s * ctx.storyHeight;
    const usable: string[] = [];
    const holes: string[] = [];
    // Across both rects: `core.ts` lays an upper floor plane over the whole L,
    // so a storey over a wing is floor a player walks on and the guard has to
    // see. On a rect plan `floorCells` is the interior rectangle in the same
    // (z, x) order this loop used to walk, so nothing rectangular moves.
    for (const cell of ctx.floorCells) {
      const { x, z } = cell;
      if (ctx.blockAt(x, level, z) === undefined) {
        holes.push(`${x},${z}`);
        continue;
      }
      if (ctx.blockAt(x, level + 1, z) !== undefined) continue;
      if (ctx.blockAt(x, level + 2, z) !== undefined) continue;
      usable.push(`${x},${z}`);
    }
    // The approach to the flight: every cell that touches the well stays bare,
    // for the reason the ground floor's stair reserve exists — the square you
    // step off onto is not a square anything may stand on.
    const reserved = new Set<string>();
    for (const hole of holes) {
      const [hx, hz] = hole.split(",").map(Number) as [number, number];
      for (const [dx, dz] of NEIGHBOURS) reserved.add(`${hx + dx},${hz + dz}`);
    }
    const plan = new FloorPlan(usable, reserved);
    if (plan.size < 4) continue;
    n += furnishStorey(ctx, plan, level, s);
  }
  return n;
}

/** The fit-out of one upper storey. */
function furnishStorey(ctx: FitOutContext, plan: FloorPlan, level: number, storey: number): number {
  const { interior: it, style } = ctx;
  const y = level + 1;
  let n = 0;

  const put = (x: number, z: number, block: string, props?: Record<string, string>): boolean => {
    if (!plan.occupy([[x, z]])) return false;
    ctx.put(x, y, z, block, props);
    n++;
    return true;
  };
  /** A bed, both halves or neither — the pairing rule the ground floor learned. */
  const bed = (x: number, z: number, facing: Cardinal, block: string): boolean => {
    const [dx, dz] = cardinalStep(facing);
    if (!plan.occupy([
      [x, z],
      [x + dx, z + dz],
    ])) {
      return false;
    }
    ctx.put(x, y, z, block, { facing, part: "foot", occupied: "false" });
    ctx.put(x + dx, y, z + dz, block, { facing, part: "head", occupied: "false" });
    n += 2;
    return true;
  };
  /** A carpet run down a column of the plan, skipping anything already taken. */
  const runner = (x: number, block: string): void => {
    for (let z = it.z0; z <= it.z1; z++) {
      if (!plan.has(x, z)) continue;
      put(x, z, block);
    }
  };

  const beds = (colour: string, want: number): number => {
    let laid = 0;
    // Along the east wall, head to it, spaced so two beds never share a side.
    for (let z = it.z0; z <= it.z1 && laid < want; z += 2) {
      if (bed(it.x1 - 1, z, "east", colour)) laid++;
    }
    for (let z = it.z0; z <= it.z1 && laid < want; z += 2) {
      if (bed(it.x0 + 1, z, "west", colour)) laid++;
    }
    return laid;
  };

  switch (ctx.archetype) {
    case "inn": {
      // Guest rooms: as many beds as the floor carries, each with its own
      // chest, and a lantern-lit landing left clear.
      const laid = beds("white_bed", 4);
      if (laid > 0) put(it.x1, it.z1, "chest", { facing: "west", type: "single" });
      put(it.x0, it.z1, "barrel", { facing: "up", open: "false" });
      break;
    }
    case "cottage": {
      beds("red_bed", storey === 1 ? 2 : 1);
      put(it.x1, it.z1, "chest", { facing: "west", type: "single" });
      put(it.x0, it.z1, pottedPlant(it.x0, it.z1));
      break;
    }
    case "hall": {
      // A gallery over the hall: a runner down the middle and presses either
      // side of it.
      const mid = Math.floor((it.x0 + it.x1) / 2);
      runner(mid, "white_carpet");
      put(mid - 1, it.z1, "bookshelf");
      put(mid + 1, it.z1, "bookshelf");
      put(it.x1, it.z0, "barrel", { facing: "up", open: "false" });
      break;
    }
    case "library": {
      for (let z = it.z0; z <= it.z1; z++) {
        if ((z + it.x1) % 2 !== 0) continue;
        put(it.x1, z, "bookshelf");
      }
      put(it.x0, it.z1, "lectern", { facing: "east", has_book: "false", powered: "false" });
      break;
    }
    case "church": {
      // A gallery at the back of the nave, benches looking north up it toward
      // the altar end — so, by the stair-seat rule, backrests to the south.
      for (let x = it.x0; x <= it.x1; x += 2) {
        put(x, it.z1, style["stair.interior"] as string, {
          facing: "south",
          half: "bottom",
          shape: "straight",
        });
      }
      put(it.x1, it.z0, pottedPlant(it.x1, it.z0));
      break;
    }
    case "granary":
    case "warehouse":
    case "barn": {
      // A loft: bales and crates against the wall, aisle kept clear.
      for (let z = it.z0; z <= it.z1; z++) {
        if ((z + it.x1) % 3 !== 0) continue;
        put(it.x1, z, "hay_block", { axis: "y" });
      }
      put(it.x0, it.z1, "barrel", { facing: "up", open: "false" });
      break;
    }
    case "smithy":
    case "bakery": {
      // The master's room over the shop: a bed, a chest, a table.
      beds("red_bed", 1);
      put(it.x1, it.z1, "chest", { facing: "west", type: "single" });
      put(it.x0, it.z1, "crafting_table");
      break;
    }
    default: {
      // Somewhere to sleep and somewhere to put things: the least a storey
      // can have and still look inhabited.
      beds("red_bed", 1);
      put(it.x1, it.z1, "barrel", { facing: "up", open: "false" });
      break;
    }
  }
  return n;
}
