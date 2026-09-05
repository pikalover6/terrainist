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
import type { BuildingDescriptor } from "./descriptor.js";
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
export const CELLAR_STYLES = [
  "plain",
  "crypt",
  "vault",
  "wine_cellar",
  "mine",
  // Wave six, the underground. The first eight are author-facing rooms — each
  // one is the catalog id of the same name, so a document that asks for an
  // `ossuary` gets the room the catalog promised it. The last three are the
  // depths archetypes' own dressings: an author may still name them, but their
  // real job is to be what `bunker_complex`, `subway_station` and
  // `underground_silo` dig under themselves when the document says nothing.
  "ossuary",
  "undercroft",
  "dungeon_room",
  "root_cellar",
  "cistern_hall",
  "smugglers_cove",
  "hermit_grotto",
  "sewer_network",
  "bunker_hold",
  "subway_platform",
  "silo_shaft",
] as const;

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
    /* --- wave six ---------------------------------------------------------- */
    // Bone in the wall, not just on the shelves: an ossuary is a crypt whose
    // contents ran out of niches and became the masonry.
    case "ossuary":
      return { primary: "stone_bricks", accent: "bone_block", accentShare: 0.3 };
    // Vaulted stone, swept and dry — the undercroft is the one room down here
    // that is still in use, so it is the only one with no moss in it.
    case "undercroft":
      return { primary: "stone_bricks", accent: "polished_andesite", accentShare: 0.22 };
    case "dungeon_room":
      return { primary: "cobblestone", accent: "mossy_cobblestone", accentShare: 0.38 };
    // Earth, boarded: a root cellar is a hole in the ground with shelves in it,
    // and `packed_mud` is the only mud this compiler may write.
    case "root_cellar":
      return { primary: "packed_mud", accent: "coarse_dirt", accentShare: 0.28 };
    case "cistern_hall":
      return { primary: "stone_bricks", accent: "mossy_stone_bricks", accentShare: 0.2 };
    case "smugglers_cove":
      return { primary: "cobblestone", accent: "mossy_cobblestone", accentShare: 0.2 };
    case "hermit_grotto":
      return { primary: "stone", accent: "mossy_cobblestone", accentShare: 0.3 };
    case "sewer_network":
      return { primary: "bricks", accent: "mossy_stone_bricks", accentShare: 0.3 };
    case "bunker_hold":
      return { primary: "gray_concrete", accent: "light_gray_concrete", accentShare: 0.26 };
    case "subway_platform":
      return { primary: "smooth_stone", accent: "light_gray_concrete", accentShare: 0.3 };
    case "silo_shaft":
      return { primary: "deepslate_bricks", accent: "deepslate_tiles", accentShare: 0.32 };
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
  switch (style) {
    case "crypt":
      return "cracked_stone_bricks";
    // Bone, cracks and stone: an ossuary reads as older than the crypt it grew
    // out of, and the third block is what does it.
    case "ossuary":
      return "cracked_stone_bricks";
    // A grotto is a hole a person moved into, so the wall wants to look
    // *natural* rather than aged — three stones, no brickwork.
    case "hermit_grotto":
      return "andesite";
    // Water has been running down these for a century.
    case "sewer_network":
      return "cracked_stone_bricks";
    default:
      return null;
  }
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
const NICHE_SPACING = 3;

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
  const nicheStyles: ReadonlySet<CellarStyle> = new Set<CellarStyle>([
    "crypt",
    // Four wave-six rooms are niched, and all four for the crypt's own reason:
    // the alcove costs the floor nothing, so it is the cheapest way to make a
    // room read as *lined* — with bones, with jars, with stashed crates.
    "ossuary",
    "root_cellar",
    "smugglers_cove",
    "hermit_grotto",
  ]);
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
      const shelved = nicheContent(r.style, draw, cell.out);
      if (shelved !== null) put(cell.x, floorY + 1, cell.z, shelved.block, shelved.props);
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

    /* --- wave six: the underground ---------------------------------------- */

    case "ossuary": {
      // The niches did the work. What the floor adds is the stacks: bone
      // blocks laid in pairs against the walls, each pair through the guard,
      // so a room too small for them is simply a lined room with nothing in
      // the middle — which is also what a small ossuary is.
      for (const [x, z] of wallAdjacent(interior)) {
        if (r.blocked?.has(`${x},${z}`) === true) continue;
        const draw = positionFloat(choice, x, floorY, z);
        if (draw < 0.72) continue;
        if (place(x, z, "bone_block", { axis: draw < 0.86 ? "x" : "z" })) {
          put(x, floorY + 1, z, "bone_block", { axis: "y" });
          furniture++;
        }
      }
      scatterCobwebs(r, 0.1);
      break;
    }

    case "undercroft": {
      // Vaulting, spelled as it can be spelled without costing floor: a course
      // of upside-down stair springers ringing the wall one below the ceiling,
      // which from the middle of the room reads as the start of an arch. They
      // are cut into the *wall* ring, so they take nothing from the plan.
      // …and only where there is headroom for it. A springer two courses over
      // the walk plane is a springer; one course over it is a stair through a
      // player's head, and the shallowest legal cellar is exactly that tight.
      const springer = -2;
      if (springer >= floorY + 2) {
        for (const cell of wallRing(rect)) {
          const [dx, dz] = STEP[cell.out];
          const ix = cell.x - dx;
          const iz = cell.z - dz;
          if (ix < interior.x0 || ix > interior.x1 || iz < interior.z0 || iz > interior.z1) continue;
          if (r.blocked?.has(`${ix},${iz}`) === true) continue;
          // **Never the ladder's own column.** The ladder runs from the walk
          // plane up past the ground floor, and a springer set into that column
          // is a block in the middle of the climb: the whole cellar goes
          // unreachable, and the physics lint says so in a hundred lines.
          if (ix === access.x && iz === access.z) continue;
          put(ix, springer, iz, "stone_brick_stairs", {
            facing: cell.out,
            half: "top",
            shape: "straight",
          });
        }
      }
      // Crates and a working table down one side: the undercroft is a store
      // that someone still walks into.
      for (let z = interior.z0; z <= interior.z1; z += 2) {
        if (r.blocked?.has(`${interior.x0},${z}`) === true) continue;
        place(interior.x0, z, "barrel", { facing: "up", open: "false" });
      }
      place(interior.x1, interior.z0, "cartography_table");
      break;
    }

    case "dungeon_room": {
      // Cells: iron bars set into the perimeter wall at a spacing, two courses
      // high. A bar in the wall ring costs no floor and cannot lock anyone in
      // — the same reason the vault's gate stands beside the ladder and never
      // across it.
      const ring = wallRing(rect);
      for (const [i, cell] of ring.entries()) {
        if (i % 4 !== 0) continue;
        if (cell.x === access.x && cell.z === access.z) continue;
        for (const dy of [0, 1]) {
          put(cell.x, floorY + dy, cell.z, "iron_bars", {
            north: "false",
            east: "false",
            south: "false",
            west: "false",
            waterlogged: "false",
          });
        }
      }
      // What is in a cell: straw to lie on, and a bucket that is a cauldron.
      for (const [x, z] of wallAdjacent(interior)) {
        if (r.blocked?.has(`${x},${z}`) === true) continue;
        const draw = positionFloat(choice, x, floorY, z);
        if (draw < 0.8) continue;
        place(x, z, draw < 0.92 ? "hay_block" : "cauldron", draw < 0.92 ? { axis: "x" } : { level: "0" });
      }
      scatterCobwebs(r, 0.12);
      break;
    }

    case "root_cellar": {
      // The niches are the shelves and carry the jars. The floor gets the
      // sacks and the composter — a cool store is a room you put things down
      // in and walk out of.
      for (const [x, z] of wallAdjacent(interior)) {
        if (r.blocked?.has(`${x},${z}`) === true) continue;
        const draw = positionFloat(choice, x, floorY, z);
        if (draw < 0.62) continue;
        place(x, z, draw < 0.8 ? "hay_block" : draw < 0.9 ? "composter" : "barrel",
          draw < 0.8 ? { axis: "y" } : draw < 0.9 ? { level: "0" } : { facing: "up", open: "false" });
      }
      break;
    }

    case "cistern_hall": {
      // The bathhouse's pool predicate, taken underground and **sunk**: the
      // water goes into the floor slab rather than onto the walk plane, so
      // beneath every water cell is masonry this pass writes itself, beside it
      // is the slab the cellar already laid solid across the whole footprint,
      // and above it is the room's own air. Nothing about that depends on the
      // seed, the theme or the terrain — which is the whole of the argument.
      const basin = sinkRect(interior, 1);
      if (basin !== null) sinkFluid(r, basin, "water");
      // The kerb: a lantern-lit post at each corner of the basin, on the walk
      // plane and through the guard, so the hall reads as a tank with a walk
      // round it rather than as a hole.
      for (const [x, z] of [
        [basin === null ? interior.x0 : basin.x0 - 1, basin === null ? interior.z0 : basin.z0 - 1],
        [basin === null ? interior.x1 : basin.x1 + 1, basin === null ? interior.z1 : basin.z1 + 1],
      ] as const) {
        if (x < interior.x0 || x > interior.x1 || z < interior.z0 || z > interior.z1) continue;
        if (place(x, z, "chiseled_stone_bricks")) {
          put(x, floorY + 1, z, "lantern", { hanging: "false", waterlogged: "false" });
          furniture++;
        }
      }
      break;
    }

    case "sewer_network": {
      // A brick channel, not a network: this is one room, and a room cannot be
      // a network. The runnel is the same sunk-fluid construction the cistern
      // uses, one cell wide down the long axis, so the water is boxed by the
      // slab on every side and by masonry beneath.
      const runnel = runnelRect(interior);
      if (runnel !== null) sinkFluid(r, runnel, "water");
      // Grates over the channel at a spacing: a bottom slab written into the
      // **walk plane** spans the trench, so a player crosses the runnel on it
      // rather than round it. The runnel is short of both ends of the room
      // anyway — a channel that spanned wall to wall would cut the floor in
      // two, and no spacing of grates is worth that risk.
      if (runnel !== null) {
        for (let z = runnel.z0; z <= runnel.z1; z += 3) {
          for (let x = runnel.x0; x <= runnel.x1; x++) {
            put(x, floorY, z, "stone_brick_slab", { type: "bottom", waterlogged: "false" });
          }
        }
      }
      scatterCobwebs(r, 0.1);
      break;
    }

    case "smugglers_cove": {
      // Rough stone and stashes. The chests are in the niches — hidden, which
      // is the whole read — and the floor keeps its crates and a barrel of
      // something the excise never saw.
      for (const [x, z] of wallAdjacent(interior)) {
        if (r.blocked?.has(`${x},${z}`) === true) continue;
        const draw = positionFloat(choice, x, floorY, z);
        if (draw < 0.7) continue;
        place(x, z, draw < 0.85 ? "barrel" : "chest",
          draw < 0.85 ? { facing: "up", open: "false" } : { facing: facingInward(interior, x, z), type: "single" });
      }
      scatterCobwebs(r, 0.14);
      break;
    }

    case "hermit_grotto": {
      // One person lives here. A cot, a lectern, a pot, and a shrine of
      // chiselled stone under a candle — the smallest inhabited room this
      // grammar builds, and every piece of it goes through the guard.
      place(interior.x0, interior.z0, "hay_block", { axis: "x" });
      place(interior.x0, interior.z0 + 1 <= interior.z1 ? interior.z0 + 1 : interior.z0, "lectern", {
        facing: "east",
        has_book: "true",
      });
      place(interior.x1, interior.z1, "composter", { level: "0" });
      if (place(interior.x1, interior.z0, "chiseled_stone_bricks")) {
        put(interior.x1, floorY + 1, interior.z0, "candle", {
          candles: "3",
          lit: "false",
          waterlogged: "false",
        });
        furniture++;
      }
      scatterCobwebs(r, 0.06);
      break;
    }

    case "bunker_hold": {
      // Concrete rooms: bunks, a stove and stores against the walls. Nothing
      // in the middle, because a bunker's middle is the corridor.
      for (const [x, z] of wallAdjacent(interior)) {
        if (r.blocked?.has(`${x},${z}`) === true) continue;
        const draw = positionFloat(choice, x, floorY, z);
        if (draw < 0.55) continue;
        place(
          x,
          z,
          draw < 0.74 ? "barrel" : draw < 0.86 ? "furnace" : "crafting_table",
          draw < 0.74
            ? { facing: "up", open: "false" }
            : draw < 0.86
              ? { facing: facingInward(interior, x, z), lit: "false" }
              : undefined,
        );
      }
      break;
    }

    case "subway_platform": {
      // A platform and a line. The rail runs down the long axis on the walk
      // plane — a rail is passable, so it takes nothing from the room — and
      // the benches are stairs against the wall, through the guard.
      const line = runnelRect(interior);
      if (line !== null) {
        for (let z = line.z0; z <= line.z1; z++) {
          for (let x = line.x0; x <= line.x1; x++) {
            if (x === access.x && z === access.z) continue;
            if (x === center.x && z === center.z) continue;
            if (r.blocked?.has(`${x},${z}`) === true) continue;
            put(x, floorY, z, "rail", { shape: "north_south", waterlogged: "false" });
          }
        }
      }
      for (let z = interior.z0 + 1; z <= interior.z1 - 1; z += 3) {
        if (r.blocked?.has(`${interior.x0},${z}`) === true) continue;
        place(interior.x0, z, "stone_stairs", {
          facing: "east",
          half: "bottom",
          shape: "straight",
        });
      }
      break;
    }

    case "silo_shaft": {
      // The bottom of a deep shaft: a banded ring in the wall at head height
      // and hardware on the floor. The band is a wall-ring course, so the
      // cylinder reads without costing the room a cell.
      for (const cell of wallRing(rect)) {
        put(cell.x, floorY + 2, cell.z, "cut_copper");
      }
      for (const [x, z] of wallAdjacent(interior)) {
        if (r.blocked?.has(`${x},${z}`) === true) continue;
        const draw = positionFloat(choice, x, floorY, z);
        if (draw < 0.78) continue;
        place(x, z, draw < 0.9 ? "barrel" : "anvil",
          draw < 0.9 ? { facing: "up", open: "false" } : { facing: facingInward(interior, x, z) });
      }
      break;
    }

    default:
      break;
  }

  return { niches, furniture, coffin };
}

/** The slab a style's niche shelf is cut from. */
function slabOf(style: CellarStyle): string {
  switch (style) {
    case "mine":
    case "smugglers_cove":
    case "hermit_grotto":
      return "cobblestone_slab";
    // A root cellar's shelves are boards, because a root cellar's shelves are
    // boards. Everything else is dressed stone.
    case "root_cellar":
      return "oak_slab";
    default:
      return "stone_brick_slab";
  }
}

/**
 * What stands on a niche shelf, or `null` for an empty one.
 *
 * One draw per niche, position-keyed by the caller, so the same room draws the
 * same contents forever and two rooms never draw the same ones. Everything
 * here rests on the shelf slab directly beneath it — a niche is the one place
 * in a cellar where "supported" is true by construction.
 */
function nicheContent(
  style: CellarStyle,
  draw: number,
  out: Cardinal,
): { readonly block: string; readonly props?: Record<string, string> } | null {
  switch (style) {
    case "ossuary":
      // Denser than the crypt, and bone where the crypt has candles: the
      // difference between a tomb and a store of the dead.
      if (draw < 0.5) return { block: "skeleton_skull", props: { rotation: rotationOf(out) } };
      if (draw < 0.85) return { block: "bone_block", props: { axis: "y" } };
      return { block: "cobweb" };
    case "root_cellar":
      // Jars and crates on the boards.
      if (draw < 0.45) return { block: "decorated_pot", props: { facing: "north", waterlogged: "false" } };
      if (draw < 0.8) return { block: "barrel", props: { facing: "up", open: "false" } };
      return null;
    case "smugglers_cove":
      // The stash, and the read is that it is *in the wall*.
      if (draw < 0.4) {
        return { block: "chest", props: { facing: opposite(out), type: "single" } };
      }
      if (draw < 0.66) return { block: "barrel", props: { facing: "up", open: "false" } };
      return { block: "cobweb" };
    case "hermit_grotto":
      if (draw < 0.3) return { block: "candle", props: { candles: "2", lit: "false", waterlogged: "false" } };
      if (draw < 0.5) return { block: "decorated_pot", props: { facing: "north", waterlogged: "false" } };
      return null;
    default:
      // The crypt's own draw, unchanged.
      if (draw < 0.34) return { block: "skeleton_skull", props: { rotation: rotationOf(out) } };
      if (draw < 0.55) {
        return { block: "candle", props: { candles: "1", lit: "false", waterlogged: "false" } };
      }
      if (draw < 0.72) return { block: "cobweb" };
      return null;
  }
}

/** The cardinal facing back into the room from a wall whose outward face is `out`. */
function opposite(out: Cardinal): Cardinal {
  switch (out) {
    case "north":
      return "south";
    case "south":
      return "north";
    case "west":
      return "east";
    default:
      return "west";
  }
}

/** Every interior cell that touches the wall, in canonical (z, x) order. */
function wallAdjacent(interior: LocalRect): (readonly [number, number])[] {
  const out: (readonly [number, number])[] = [];
  for (let z = interior.z0; z <= interior.z1; z++) {
    for (let x = interior.x0; x <= interior.x1; x++) {
      if (x === interior.x0 || x === interior.x1 || z === interior.z0 || z === interior.z1) {
        out.push([x, z] as const);
      }
    }
  }
  return out;
}

/** The interior inset by `by` on every side, or `null` when nothing is left. */
function sinkRect(interior: LocalRect, by: number): LocalRect | null {
  const rect = {
    x0: interior.x0 + by,
    z0: interior.z0 + by,
    x1: interior.x1 - by,
    z1: interior.z1 - by,
  };
  if (rect.x1 < rect.x0 || rect.z1 < rect.z0) return null;
  return rect;
}

/**
 * The one-cell channel down the room's long axis, clear of both ends.
 *
 * `null` when the room is too small to hold a channel and still have a floor
 * either side of it — a runnel you have to stand in is a flooded cellar.
 */
function runnelRect(interior: LocalRect): LocalRect | null {
  if (interior.x1 - interior.x0 < 2 || interior.z1 - interior.z0 < 2) return null;
  const x = Math.floor((interior.x0 + interior.x1) / 2);
  return { x0: x, x1: x, z0: interior.z0 + 1, z1: interior.z1 - 1 };
}

/**
 * Sink a fluid into the cellar's floor slab, boxed on every side.
 *
 * The whole fluid-safety argument, and it is structural rather than statistical:
 *
 * - the fluid goes at `floorY - 1`, which is the **floor slab** the cellar laid
 *   solid across its entire footprint, so every cell beside a fluid cell at
 *   that level is either more fluid or that slab;
 * - beneath it, at `floorY - 2`, this pass writes a course of its own masonry
 *   under the whole basin, so nothing can fall out of the bottom;
 * - above it is the room's air, and a source block does not climb.
 *
 * The caller must hand a rect strictly inside the interior, which is inside the
 * footprint by one more cell — that inset is what makes the first bullet true.
 */
function sinkFluid(r: CellarDressRequest, basin: LocalRect, fluid: string): void {
  const dressing = cellarDressing(r.style);
  const bed = dressing === null ? "stone_bricks" : dressing.primary;
  for (let z = basin.z0; z <= basin.z1; z++) {
    for (let x = basin.x0; x <= basin.x1; x++) {
      r.put(x, r.floorY - 2, z, bed);
      r.put(x, r.floorY - 1, z, fluid, { level: "0" });
    }
  }
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

/**
 * The cellar style an archetype dresses itself in when the document is silent.
 *
 * `null` for everything not listed, which is every archetype whose cellar is a
 * cellar: a cottage with a basement gets the plain grey box, as it always did.
 * The four here are the ones **whose whole point is what is underneath them** —
 * a mine head over anything but a working, or a missile silo over a barrel and
 * a cobweb, is a hut with a misleading name.
 *
 * This is the one place the mapping lives, so `core.ts` reads it rather than
 * carrying a second copy of the same opinion.
 */
export function defaultCellarStyle(archetype: string | undefined): CellarStyle | null {
  switch (archetype) {
    case "mine_head":
      return "mine";
    case "bunker_complex":
      return "bunker_hold";
    case "subway_station":
      return "subway_platform";
    case "underground_silo":
      return "silo_shaft";
    default:
      return null;
  }
}

/**
 * The cellar depth an archetype digs when the document does not ask for one.
 *
 * Only the depths archetypes, and for the reason their catalog entries give:
 * the surface piece is an *entrance*. A bunker complex with no basement is a
 * concrete shed. `mine_head` is deliberately **not** here — it has shipped
 * without a forced cellar since G4 and a document that asks for one gets one.
 */
export function defaultBasementDepth(archetype: string | undefined): number | null {
  switch (archetype) {
    case "bunker_complex":
    case "subway_station":
    case "underground_silo":
      return 5;
    default:
      return null;
  }
}

/** Map a node's tags onto this module's archetypes, or `null`. */
function undergroundArchetypeOfTags(tags: readonly string[]): "mine_head" | null {
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
function furnishMineHead(ctx: FitOutContext): number {
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
/* -------------------------------------------------------------------------- */
/* descriptor seam — ordered building rows (Phase 4, no self-registration)     */
/* -------------------------------------------------------------------------- */

/**
 * Ordered building descriptors for the underground pack — one row for {@link UNDERGROUND_ARCHETYPES}.
 * - `tags` mirror {@link undergroundArchetypeOfTags} — every synonym that maps to the archetype, with canonical id first.
 * - `furnish` is the leaf handle {@link furnishMineHead} — no op emit or seeded-draw change here.
 * - `dispatch` is `"underground"` — explicit mine-head branch remains in `core.ts`.
 */
export const UNDERGROUND_BUILDING_DESCRIPTORS: readonly BuildingDescriptor[] = [
  {
    id: "mine_head",
    kind: "building",
    tags: ["mine_head", "mineshaft", "mine", "pithead"],
    aliases: [],
    furnish: furnishMineHead as unknown as (ctx: unknown) => number,
    dispatch: "underground",
  },
] as const;
