/**
 * Themed underground: cellar **styles**, and the mine head that sits over one.
 *
 * `core.ts` digs the cellar — the slab, the room, the perimeter wall, the
 * ladder and the one lantern. What it never had was an opinion about what the
 * room is *for*. Every cellar in every village was the same grey box with a
 * barrel in it, which is fine for a cottage and wrong for the thing the hamlet
 * prompt actually asked for: "a vaulted crypt with burial niches".
 *
 * This module is that opinion, and it is deliberately a *dressing* pass rather
 * than a second generator. The shell is unchanged — same footprint, same
 * ladder, same walkable plane — so nothing downstream (the tunnel portal, the
 * physics lint, the traversal walk) has to learn a new geometry. A style only
 * chooses the masonry the walls are drawn from and what stands, hangs or is
 * recessed inside them.
 *
 * ## The one rule every style obeys
 *
 * **A niche is a wall cell, never a floor cell.** The burial alcoves are cut
 * *into* the perimeter wall — the block the room's own masonry occupies — so
 * they cost the room no floor at all and the walkability guard has nothing to
 * refuse. Anything that does stand on the floor (a coffin, a barrel stack, a
 * chest) goes through {@link FloorPlan} exactly as the plain fit-out does, and
 * is dropped rather than drawn if it would cut the room in two.
 */

import { positionFloat, type Seed256 } from "../determinism/index.js";

import { FloorPlan, type FitOutContext } from "./archetypes-civic.js";
import type { Cardinal, LocalRect, Put } from "./core.js";

/* -------------------------------------------------------------------------- */
/* the styles                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * What a cellar is dressed as.
 *
 * `plain` is what every cellar was before this module and is still the default
 * everywhere: barrels against the wall, cobwebs under the beams. The other
 * four are the themed rooms, and each one is a different answer to "who put
 * this here" — a parish (crypt), a treasury (vault), a vintner (wine_cellar),
 * a mining company (mine).
 */
export const CELLAR_STYLES = ["plain", "crypt", "vault", "wine_cellar", "mine"] as const;

/** One cellar style. */
export type CellarStyle = (typeof CELLAR_STYLES)[number];

/** Coerce an unknown to a style; anything unrecognised is `plain`. */
export function resolveCellarStyle(value: unknown): CellarStyle {
  return typeof value === "string" && (CELLAR_STYLES as readonly string[]).includes(value)
    ? (value as CellarStyle)
    : "plain";
}

/**
 * The masonry a style's walls are drawn from.
 *
 * Two blocks and a share, which is the whole vocabulary: the wall is `primary`
 * except where a position-keyed draw falls under `accentShare`, and there it is
 * `accent`. Keeping it to two keeps the room reading as one material with age
 * in it rather than as a checkerboard of three.
 */
export interface CellarDressing {
  readonly primary: string;
  readonly accent: string;
  readonly accentShare: number;
}

/** The share of a plain cellar's wall that is cracked — `core.ts`'s own value. */
const PLAIN_CRACK_SHARE = 0.12;

/**
 * Dressing per style.
 *
 * `plain` returns `null` rather than a dressing: the caller then uses the
 * style table's `cellar.wall` / `cellar.wall_cracked`, which is what a theme
 * may have overridden, and the themed styles are the ones that override the
 * theme. A crypt is stone brick because a crypt is stone brick, not because
 * the village happens to build in it.
 */
export function cellarDressing(style: CellarStyle): CellarDressing | null {
  switch (style) {
    case "crypt":
      // Cracked *and* mossy, drawn from one share: a vault nobody has swept
      // since the last interment.
      return { primary: "stone_bricks", accent: "mossy_stone_bricks", accentShare: 0.34 };
    case "vault":
      return { primary: "stone_bricks", accent: "chiseled_stone_bricks", accentShare: 0.1 };
    case "wine_cellar":
      return { primary: "bricks", accent: "cracked_stone_bricks", accentShare: 0.14 };
    case "mine":
      return { primary: "cobblestone", accent: "andesite", accentShare: 0.35 };
    default:
      return null;
  }
}

/**
 * A second accent, for the styles that want three-way age rather than two.
 *
 * Only the crypt uses it, and only for the cracked share it shares with the
 * mossy one — a crypt drawn from stone brick and moss alone reads as a garden
 * wall, and the cracks are what make it a ruin.
 */
export function cellarSecondAccent(style: CellarStyle): string | null {
  return style === "crypt" ? "cracked_stone_bricks" : null;
}

/* -------------------------------------------------------------------------- */
/* dressing a cellar                                                           */
/* -------------------------------------------------------------------------- */

/** Everything {@link dressCellar} needs. */
export interface CellarDressRequest {
  readonly put: Put;
  readonly style: CellarStyle;
  /** The building's resolved style table, for the generic props and lights. */
  readonly table: Readonly<Record<string, string>>;
  readonly choice: Seed256;
  /** The room's interior rectangle — the air the shell hollowed. */
  readonly interior: LocalRect;
  /** The footprint the wall runs round: the niches are cut into this ring. */
  readonly rect: LocalRect;
  /** The ladder column. */
  readonly access: { readonly x: number; readonly z: number };
  /** The lantern column. */
  readonly center: { readonly x: number; readonly z: number };
  /** Walkable plane of the room, in local Y (negative). */
  readonly floorY: number;
  /** Interior columns that are solid stone — a pilaster, not room. */
  readonly blocked?: ReadonlySet<string>;
}

/** What a dressing pass did, for the meta counts and for the tests. */
export interface CellarDressResult {
  /** Burial alcoves cut into the wall. */
  readonly niches: number;
  /** Blocks written on the floor plane, coffin included. */
  readonly furniture: number;
  /** True when the stone coffin was laid. */
  readonly coffin: boolean;
}

/** Every wall cell of the ring, in canonical (z, x) order. */
function wallRing(rect: LocalRect): { x: number; z: number; out: Cardinal }[] {
  const out: { x: number; z: number; out: Cardinal }[] = [];
  for (let z = rect.z0; z <= rect.z1; z++) {
    for (let x = rect.x0; x <= rect.x1; x++) {
      const north = z === rect.z0;
      const south = z === rect.z1;
      const west = x === rect.x0;
      const east = x === rect.x1;
      if (!(north || south || west || east)) continue;
      // Corners are never niched: a two-high hole through a corner post opens
      // two walls at once and takes the room's own quoin with it.
      const corner = (north || south) && (west || east);
      if (corner) continue;
      out.push({ x, z, out: north ? "north" : south ? "south" : west ? "west" : "east" });
    }
  }
  return out;
}

/** `(dx, dz)` of a cardinal — the local copy, so this module imports no cycle. */
const STEP: Readonly<Record<Cardinal, readonly [number, number]>> = Object.freeze({
  north: [0, -1],
  east: [1, 0],
  south: [0, 1],
  west: [-1, 0],
});

/** How many wall cells apart burial niches are cut. */
export const NICHE_SPACING = 3;

/**
 * Dress a cellar in its style.
 *
 * Called after the shell exists and the lantern hangs, so everything here
 * either replaces a wall block (a niche) or stands on a floor the guard is
 * holding (everything else). Returns what it drew.
 */
export function dressCellar(r: CellarDressRequest): CellarDressResult {
  const { put, interior, rect, access, center, floorY, choice } = r;
  let niches = 0;
  let furniture = 0;
  let coffin = false;

  // --- the floor guard -----------------------------------------------------
  // The same reserve the plain fit-out keeps: the ladder, the two cells that
  // reach it, and the cell under the lantern.
  const reserved = new Set([
    `${access.x},${access.z}`,
    `${access.x - 1},${access.z}`,
    `${access.x},${access.z - 1}`,
    `${center.x},${center.z}`,
  ]);
  const cells: string[] = [];
  for (let z = interior.z0; z <= interior.z1; z++) {
    for (let x = interior.x0; x <= interior.x1; x++) {
      if (r.blocked?.has(`${x},${z}`) === true) continue;
      cells.push(`${x},${z}`);
    }
  }
  const plan = new FloorPlan(cells, reserved);
  const place = (x: number, z: number, block: string, props?: Record<string, string>): boolean => {
    if (!plan.occupy([[x, z]])) return false;
    put(x, floorY, z, block, props);
    furniture++;
    return true;
  };

  // --- the niches ----------------------------------------------------------
  // A niche is two blocks of the perimeter wall removed at the walk plane and
  // one above it, with a slab shelf laid on the floor of the recess. It costs
  // the room no floor, so it needs no guard — and it is the one gesture that
  // makes a crypt read as a crypt from the ladder.
  const nicheStyles: ReadonlySet<CellarStyle> = new Set<CellarStyle>(["crypt"]);
  if (nicheStyles.has(r.style)) {
    const ring = wallRing(rect);
    for (const [i, cell] of ring.entries()) {
      if (i % NICHE_SPACING !== 0) continue;
      // Never through the ladder's own backing, and never where the room is
      // one cell deep: a niche needs a wall with room behind it.
      if (cell.x === access.x && cell.z === access.z) continue;
      const [dx, dz] = STEP[cell.out];
      const inner = { x: cell.x - dx, z: cell.z - dz };
      if (
        inner.x < interior.x0 || inner.x > interior.x1 ||
        inner.z < interior.z0 || inner.z > interior.z1
      ) {
        continue;
      }
      if (r.blocked?.has(`${inner.x},${inner.z}`) === true) continue;
      if (reserved.has(`${inner.x},${inner.z}`)) continue;
      niches++;
      // The alcove: two courses of air, then the shelf the remains lie on.
      put(cell.x, floorY, cell.z, "air");
      put(cell.x, floorY + 1, cell.z, "air");
      put(cell.x, floorY, cell.z, `${slabOf(r.style)}`, { type: "bottom", waterlogged: "false" });
      // What is on the shelf, sparsely: a skull, a candle, a web, or nothing.
      // Drawn once per niche from its own position, so the same cellar draws
      // the same crypt every time and two crypts never draw the same one.
      const draw = positionFloat(choice, cell.x, floorY, cell.z);
      if (draw < 0.34) {
        put(cell.x, floorY + 1, cell.z, "skeleton_skull", { rotation: rotationOf(cell.out) });
      } else if (draw < 0.55) {
        put(cell.x, floorY + 1, cell.z, "candle", { candles: "1", lit: "false", waterlogged: "false" });
      } else if (draw < 0.72) {
        put(cell.x, floorY + 1, cell.z, "cobweb");
      }
    }
  }

  // --- the centrepiece and the contents ------------------------------------
  switch (r.style) {
    case "crypt": {
      // A stone coffin down the long axis of the room, laid off-centre so the
      // lantern's column stays clear: chiselled sides, a slab lid.
      const alongZ = interior.z1 - interior.z0 >= interior.x1 - interior.x0;
      const cx = Math.floor((interior.x0 + interior.x1) / 2);
      const cz = Math.floor((interior.z0 + interior.z1) / 2);
      // Both cells or neither — half a coffin is a defect, and the guard is
      // what makes "or neither" safe. The centre of the room is where the
      // lantern's own column is reserved, so the pair is tried at the centre
      // and then one cell either side of it: a coffin beside the light is a
      // crypt, and a coffin the guard refused is a room with nothing in it.
      const candidates: (readonly (readonly [number, number])[])[] = [];
      for (const shift of [0, -1, 1, -2, 2]) {
        const ox = alongZ ? shift : 0;
        const oz = alongZ ? 0 : shift;
        candidates.push(
          alongZ
            ? [
                [cx + ox, cz - 1],
                [cx + ox, cz],
              ]
            : [
                [cx - 1, cz + oz],
                [cx, cz + oz],
              ],
        );
      }
      for (const pair of candidates) {
        if (
          !pair.every(
            ([x, z]) => x >= interior.x0 && x <= interior.x1 && z >= interior.z0 && z <= interior.z1,
          )
        ) {
          continue;
        }
        if (!plan.occupy(pair)) continue;
        for (const [x, z] of pair) {
          put(x, floorY, z, "chiseled_stone_bricks");
          put(x, floorY + 1, z, "stone_brick_slab", { type: "bottom", waterlogged: "false" });
          furniture += 2;
        }
        coffin = true;
        break;
      }
      // Cobwebs under the ceiling, position-keyed and sparse.
      scatterCobwebs(r, 0.14);
      break;
    }
    case "vault": {
      // A treasury: chests and barrels packed against the walls, and a bar
      // gate across the way in so the room reads as locked from the ladder.
      let taken = 0;
      for (let z = interior.z0; z <= interior.z1; z++) {
        for (let x = interior.x0; x <= interior.x1; x++) {
          const wall = x === interior.x0 || x === interior.x1 || z === interior.z0 || z === interior.z1;
          if (!wall) continue;
          if (r.blocked?.has(`${x},${z}`) === true) continue;
          if (positionFloat(choice, x, floorY, z) < 0.45) continue;
          const chest = (x + z) % 2 === 0;
          if (place(x, z, chest ? "barrel" : "chest", chest ? { facing: "up", open: "false" } : { facing: facingInward(interior, x, z), type: "single" })) {
            taken++;
          }
        }
      }
      // The gate: iron bars in the wall cells flanking the ladder's approach,
      // which is a gesture and not a door — nothing this compiler emits ever
      // makes a room a player cannot leave.
      const barY = floorY;
      for (const [gx, gz] of gateCells(interior, access)) {
        put(gx, barY, gz, "iron_bars", { north: "false", east: "false", south: "false", west: "false", waterlogged: "false" });
        put(gx, barY + 1, gz, "iron_bars", { north: "false", east: "false", south: "false", west: "false", waterlogged: "false" });
      }
      void taken;
      break;
    }
    case "wine_cellar": {
      // Barrels stacked two high against the long walls, and a brewing stand
      // and a decorated pot for the bottle gesture.
      for (let z = interior.z0; z <= interior.z1; z++) {
        for (let x = interior.x0; x <= interior.x1; x++) {
          const wall = x === interior.x0 || x === interior.x1;
          if (!wall) continue;
          if (r.blocked?.has(`${x},${z}`) === true) continue;
          if ((x + z) % 2 !== 0) continue;
          if (!place(x, z, "barrel", { facing: "up", open: "false" })) continue;
          // The second course rests on the first, so it needs no guard of its
          // own: the cell is already taken.
          put(x, floorY + 1, z, "barrel", { facing: "up", open: "false" });
          furniture++;
        }
      }
      place(interior.x0 + 1 <= interior.x1 ? interior.x0 + 1 : interior.x0, interior.z1, "brewing_stand", {
        has_bottle_0: "true",
        has_bottle_1: "true",
        has_bottle_2: "false",
      });
      place(interior.x1, interior.z0, "decorated_pot", { facing: "north", waterlogged: "false" });
      break;
    }
    case "mine": {
      // The bottom of a shaft: crates, a rail stub under the ladder, timber
      // against the walls. Rough, and read as the tunnel's own room.
      for (let z = interior.z0; z <= interior.z1; z++) {
        for (let x = interior.x0; x <= interior.x1; x++) {
          if (r.blocked?.has(`${x},${z}`) === true) continue;
          const wall = x === interior.x0 || x === interior.x1 || z === interior.z0 || z === interior.z1;
          const draw = positionFloat(choice, x, floorY, z);
          if (wall && draw < 0.3) place(x, z, "barrel", { facing: "up", open: "false" });
          else if (wall && draw < 0.42) place(x, z, "oak_log", { axis: "y" });
        }
      }
      scatterCobwebs(r, 0.08);
      break;
    }
    default:
      break;
  }

  return { niches, furniture, coffin };
}

/** The slab a style's niche shelf is cut from. */
function slabOf(style: CellarStyle): string {
  return style === "mine" ? "cobblestone_slab" : "stone_brick_slab";
}

/** A skull's `rotation` for the wall it is set against — it faces the room. */
function rotationOf(out: Cardinal): string {
  switch (out) {
    case "north":
      return "8";
    case "south":
      return "0";
    case "west":
      return "4";
    default:
      return "12";
  }
}

/** Which way a chest against a wall opens: inward. */
function facingInward(interior: LocalRect, x: number, z: number): Cardinal {
  if (x === interior.x0) return "east";
  if (x === interior.x1) return "west";
  if (z === interior.z0) return "south";
  return "north";
}

/**
 * The two cells a vault's bar gate stands in.
 *
 * Beside the ladder's approach, never in it: the bars frame the way in and do
 * not cross it, because a cellar a player can see and not enter is the same
 * defect as a room with no door.
 */
function gateCells(
  interior: LocalRect,
  access: { readonly x: number; readonly z: number },
): readonly (readonly [number, number])[] {
  const out: (readonly [number, number])[] = [];
  for (const [dx, dz] of [
    [1, 0],
    [-1, 0],
  ] as const) {
    const x = access.x + dx;
    const z = access.z + dz;
    if (x < interior.x0 || x > interior.x1 || z < interior.z0 || z > interior.z1) continue;
    out.push([x, z] as const);
  }
  return out;
}

/** Cobwebs under the ceiling plane, never at head height on the floor. */
function scatterCobwebs(r: CellarDressRequest, share: number): void {
  const { interior, choice, floorY, put } = r;
  for (let z = interior.z0; z <= interior.z1; z++) {
    for (let x = interior.x0; x <= interior.x1; x++) {
      if (r.blocked?.has(`${x},${z}`) === true) continue;
      if (x === r.access.x && z === r.access.z) continue;
      if (positionFloat(choice, z, floorY, x) >= share) continue;
      put(x, -1, z, "cobweb");
    }
  }
}

/** The plain style's crack share, exported so `core.ts` keeps one definition. */
export const CELLAR_PLAIN_CRACK_SHARE = PLAIN_CRACK_SHARE;

/* -------------------------------------------------------------------------- */
/* the mine head                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Archetypes this module owns.
 *
 * One, and it is the surface half of a mine: a hut over a shaft. The shaft
 * itself is the cellar's own ladder — which already runs from the cellar floor
 * past the ground plane — so what this archetype adds is the *headframe*, the
 * timber A over the roof that says from a hundred blocks away that there is a
 * hole in the ground here.
 */
export const UNDERGROUND_ARCHETYPES = ["mine_head"] as const;

/** Map a node's tags onto this module's archetypes, or `null`. */
export function undergroundArchetypeOfTags(tags: readonly string[]): "mine_head" | null {
  const has = (t: string): boolean => tags.includes(t);
  if (has("mine_head") || has("mineshaft") || has("mine") || has("pithead")) return "mine_head";
  return null;
}

/**
 * The mine head's fit-out: a winch floor and the headframe over it.
 *
 * Everything above the eaves is drawn against `wallTop` and `roofTop`, which
 * the grammar reports as it actually built them, so the frame lands on the
 * roof rather than through it whatever roof shape the document asked for.
 */
export function furnishMineHead(ctx: FitOutContext): number {
  if (ctx.archetype !== "mine_head") return 0;
  const { interior, put } = ctx;
  let n = 0;

  const cx = Math.floor((interior.x0 + interior.x1) / 2);
  const cz = Math.floor((interior.z0 + interior.z1) / 2);

  // The winch: a lectern-height frame of fences either side of the shaft head
  // with a lantern hung between them. Placed through `place`, so a hut too
  // small for it simply does not get one.
  ctx.place(interior.x0, interior.z0, "barrel", { facing: "up", open: "false" });
  ctx.place(interior.x1, interior.z1, "chest", { facing: "west", type: "single" });
  ctx.place(interior.x0, interior.z1, "crafting_table");
  n += 3;

  // The headframe: four posts standing on the roof's own ridge line, drawn
  // inward one cell from the eaves so they rest over wall rather than over
  // eave overhang, and a lintel course across their heads.
  const top = Math.max(ctx.wallTop, ctx.roofTop);
  const posts: readonly (readonly [number, number])[] = [
    [cx - 1, cz - 1],
    [cx + 1, cz - 1],
    [cx - 1, cz + 1],
    [cx + 1, cz + 1],
  ];
  const height = 4;
  for (const [x, z] of posts) {
    if (x < interior.x0 || x > interior.x1 || z < interior.z0 || z > interior.z1) continue;
    for (let h = 1; h <= height; h++) {
      // Logs rather than fences, and the reason is the lint: a fence is one of
      // the blocks that has to prove a support chain all the way to the ground,
      // and a post standing on a hip roof's slope cannot. A log is a full cube
      // and stands where it is put — which is what a headframe leg is.
      put(x, top + h, z, "oak_log", { axis: "y" });
      n++;
    }
  }
  // The head: a log beam across the frame, and the sheave lantern under it.
  for (let dx = -1; dx <= 1; dx++) {
    const x = cx + dx;
    if (x < interior.x0 || x > interior.x1) continue;
    put(x, top + height + 1, z0Clamp(cz, interior), "oak_log", { axis: "x" });
    n++;
  }
  put(cx, top + height, z0Clamp(cz, interior), "lantern", { hanging: "true", waterlogged: "false" });
  n++;
  return n;
}

function z0Clamp(z: number, interior: LocalRect): number {
  return z < interior.z0 ? interior.z0 : z > interior.z1 ? interior.z1 : z;
}
