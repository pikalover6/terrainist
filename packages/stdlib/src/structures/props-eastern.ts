/**
 * `prop.place@0` — the **East Asian pack's** props: the four entries of
 * `docs/CATALOG-EXPANSION-v0.md` §3.9 that are things you walk *past*, *under*
 * or *along* rather than into.
 *
 * The pack's thesis is that `hanok`, `machiya`, `pagoda` and `tea_house`
 * already exist as isolated houses, so an East Asian prompt produces one
 * correct house standing in a European town. What is missing is everything
 * *between* the houses — the gate on the approach, the light at the turn of a
 * path, the walled garden, the boat on the river. This file is that half:
 *
 * - `torii` — two posts, a straight tie and a curved upper lintel. **The
 *   pack's saturation piece**: ranked down an approach, three of them is a
 *   shrine road and one of them is a gate;
 * - `zen_garden` — raked gravel written into the floor plane, with placed
 *   stones and moss, walled on three sides and decked on the fourth;
 * - `stone_lantern` — the pedestal, the fire box with cut faces and the
 *   capstone. The cheapest repeat in the pack and the one that lights a path;
 * - `dragon_boat` — the long narrow hull with a carved head at the stem, a
 *   tail at the stern and oars ranked down both sides.
 *
 * The buildings — the keep, the drum tower, the tea pavilion and the bell
 * pavilion — are in `archetypes-eastern.ts`.
 *
 * ## The one thing this pack must get right
 *
 * **A gate is a thing you walk through.** A torii whose opening is not
 * genuinely walkable is not a gate, it is a wall with a decoration on it, and
 * the physics lint is right to say so. So the gate's opening is *paved* at
 * `y = 0` and *empty* at `y = 1` and `y = 2` across its whole span, the posts
 * are full columns run to the ground plane, and everything above the
 * head — the tie and the curved lintel — starts at `y = 5`, two courses clear
 * of the tallest thing that walks under it.
 *
 * ## The contract, and why this file is a leaf
 *
 * Same shape as `props-arcane.ts` and `props-classical-b.ts`: this file
 * imports **types** from `props.ts` and no values at all, so the one edge
 * `props.ts` → here can never become a module-initialisation cycle.
 * Node-local coordinates, `y = 0` the base plane, block **names** with a
 * property map, every op inside the declared box so `rotateOps` needs no
 * special case.
 *
 * ## The rules every prop here obeys
 *
 * 1. **Nothing floats.** The `floating.*` family fires on a full cube with six
 *    air faces. Every block here rests in the ground plane, on a column run
 *    down to it, or on an orthogonal neighbour of its own — which is why the
 *    torii's lintel turn-ups are two cells and not one, and why the dragon's
 *    head is a stepped stack rather than a silhouette hung in the air.
 * 2. **The glow rides the structure.** `glowstone` is a full cube; every one
 *    written here sits against something already solid. **This pack writes no
 *    `lantern` block anywhere** — the support rule keys on a name ending
 *    `lantern`, and `stone_lantern` is the name of a *prop* whose light is a
 *    glowstone fire box boxed in worked stone, which is what a stone lantern
 *    actually is.
 * 3. **No `chain`** — not a block in the pinned 1.21.11 table. Where a rope or
 *    a stay is wanted, `iron_bars`.
 * 4. **Gravity blocks only in the floor plane.** The dry garden's gravel is at
 *    `y = 0`, resting on the terrain the prop stands on.
 * 5. **A hull displaces.** The dragon boat writes solid at `y = 0` and
 *    `y = -1` across its whole beam, never air and never water, so it can
 *    never trap a pocket — `ships.ts`'s argument, unchanged.
 * 6. **No sign blocks, no lit fire, no bare `flower_pot`.**
 * 7. **Determinism.** The only randomness is surface scuffing and timber
 *    choice, drawn from named streams of the node seed; every form is a pure
 *    function of position. No wall clock, no `Math.random`.
 */

import type { LocalVoxelOp } from "./core.js";
import type { PropBase, PropGenerator, PropMeta } from "./props.js";

/* -------------------------------------------------------------------------- */
/* the catalog                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Every prop this file builds, in catalog order.
 *
 * Spread into `PROP_NAMES` by `props.ts`, which stays the one place a prop
 * name is enumerated, and mirrored element-for-element by the spec package's
 * `SETTLEMENT_PROP_NAMES`.
 */
export const EASTERN_PROP_NAMES = [
  "torii",
  "zen_garden",
  "stone_lantern",
  "dragon_boat",
] as const;

/** One of the props this file builds. */
export type EasternPropName = (typeof EASTERN_PROP_NAMES)[number];

/** True for a name this file answers to. */
export function isEasternProp(name: string): name is EasternPropName {
  return (EASTERN_PROP_NAMES as readonly string[]).includes(name);
}

/* -------------------------------------------------------------------------- */
/* the pack's own materials                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The vermilion a gate is painted.
 *
 * A **fixed block, not a style role**: a torii is the same colour in
 * `temperate_timber` as in `sun_clay`, and the icon has to survive a document
 * that never names a theme.
 */
const VERMILION = "red_concrete";
/** The dark tile every coping, cap and eave in this pack is finished in. */
const TILE = "deepslate_tiles";
/** The worked stone a lantern and a coping are cut from. */
const WORKED = "stone_bricks";
/** The stone with a face on it — a capstone, a pedestal. */
const CARVED = "chiseled_stone_bricks";
/** The pale plaster of a garden wall. */
const PLASTER = "white_terracotta";
/** The glow. Always a full cube, always against something solid. */
const GLOW = "glowstone";
/** The rake, and the pale ground it is drawn in. */
const GRAVEL = "gravel";
/** The ridge the rake throws up, one shade off the gravel. */
const RIDGE = "diorite";
/** A garden boulder. */
const BOULDER = "andesite";
/** What grows in the corner of a dry garden, and nowhere else in it. */
const MOSS = "moss_block";

/** A block standing on its end. */
const UPRIGHT: Record<string, string> = { axis: "y" };
/** A block laid along x. */
const ALONG_X: Record<string, string> = { axis: "x" };
/** A block laid along z — a lintel, a tie, a yard. */
const ALONG_Z: Record<string, string> = { axis: "z" };
/** A slab sitting on the floor of its own cell. */
const BOTTOM_SLAB: Record<string, string> = { type: "bottom", waterlogged: "false" };
/** A slab hung at the top of its own cell — a coping's drip course. */
const TOP_SLAB: Record<string, string> = { type: "top", waterlogged: "false" };
/** A wall block with nothing connected to it. */
const FREE_WALL: Record<string, string> = {
  east: "none",
  north: "none",
  south: "none",
  up: "true",
  waterlogged: "false",
  west: "none",
};

/* -------------------------------------------------------------------------- */
/* extents                                                                     */
/* -------------------------------------------------------------------------- */

/** Torii width, post to post plus the lintel's overhang either side. */
export const TORII_W = 7;
/** Torii depth: the gate is one cell thick, with a footing either side of it. */
export const TORII_D = 3;
/**
 * Torii height.
 *
 * `y = 0` is the paved approach, `y = 1`..`y = 4` is the opening a body walks
 * through, `y = 5` is the tie, `y = 6` the lintel and `y = 7` its turn-ups.
 */
export const TORII_H = 8;
/** Y of the straight tie under the lintel. */
export const TORII_TIE_Y = 5;
/** Y of the curved upper lintel. */
export const TORII_LINTEL_Y = 6;
/** X of the two posts. */
export const TORII_POSTS: readonly number[] = [1, 5];

/** Dry garden span, in x and z. */
export const ZEN_GARDEN_SPAN = 13;
/** Dry garden height: the wall, its coping, and the tallest boulder. */
export const ZEN_GARDEN_H = 4;
/** Height of the garden's walls, in courses above the ground plane. */
export const ZEN_GARDEN_WALL_H = 3;

/** Stone lantern span, in x and z. */
export const STONE_LANTERN_SPAN = 3;
/** Stone lantern height: pedestal, shaft, fire box, capstone, finial. */
export const STONE_LANTERN_H = 5;
/** Y of the fire box — the one lit course. */
export const STONE_LANTERN_FIRE_Y = 2;

/** Dragon boat length, stem to stern. */
export const DRAGON_BOAT_L = 25;
/** Dragon boat beam — long and *narrow*, which is the whole silhouette. */
export const DRAGON_BOAT_B = 5;
/**
 * Dragon boat height, counted from `minY = -1` like every other hull: one
 * course of hull under the waterline, the deck, and the head at the stem.
 */
export const DRAGON_BOAT_H = 6;

/* -------------------------------------------------------------------------- */
/* footprints                                                                  */
/* -------------------------------------------------------------------------- */

/** The declared box of one of this file's props, before it is generated. */
export function easternPropFootprint(prop: EasternPropName): {
  readonly size: readonly [number, number, number];
  readonly minY: number;
  readonly base: PropBase;
} {
  const ground = (
    size: readonly [number, number, number],
  ): { size: readonly [number, number, number]; minY: number; base: PropBase } => ({
    size,
    minY: 0,
    base: "ground",
  });
  switch (prop) {
    case "torii":
      return ground([TORII_W, TORII_H, TORII_D]);
    case "zen_garden":
      return ground([ZEN_GARDEN_SPAN, ZEN_GARDEN_H, ZEN_GARDEN_SPAN]);
    case "stone_lantern":
      return ground([STONE_LANTERN_SPAN, STONE_LANTERN_H, STONE_LANTERN_SPAN]);
    case "dragon_boat":
    default:
      return { size: [DRAGON_BOAT_L, DRAGON_BOAT_H, DRAGON_BOAT_B], minY: -1, base: "water" };
  }
}

/** Build a `PropMeta` from the declared footprint, so the two cannot drift. */
function metaOf(prop: EasternPropName): PropMeta {
  const foot = easternPropFootprint(prop);
  return {
    prop: prop as PropMeta["prop"],
    size: foot.size,
    minY: foot.minY,
    base: foot.base,
    piles: [],
  };
}

/** The empty op list every generator returns; `generateProp` reads the map. */
const NO_OPS: LocalVoxelOp[] = [];

/**
 * A deterministic small draw, keyed on a position.
 *
 * The idiom every earlier wave uses: a pure integer hash, so a form is the
 * same form forever without ever asking for a seed. `Math.imul` is exactly
 * specified where `Math.pow` is not.
 */
function gardenHash(a: number, b: number, c: number, n: number): number {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = (h ^ (h >>> 13)) >>> 0;
  return h % n;
}

/* -------------------------------------------------------------------------- */
/* the torii                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * `torii` — **the pack's saturation piece**, and the one prop here that is a
 * piece of *way* rather than a piece of scenery.
 *
 * Four parts, and the first of them is the one the physics lint cares about:
 *
 * - **the approach**, paved across the whole width at `y = 0` — this is what
 *   makes the gate walk-*through* rather than walk-*past*. The three courses
 *   over it, `y = 1` to `y = 4`, are written by nothing in this generator, so
 *   the opening is a walkable floor with two clear courses over it everywhere
 *   between and beyond the posts;
 * - **the posts**, full columns from the ground plane to the tie, on stone
 *   footings, because a painted timber standing straight on earth is a post
 *   that rotted a century ago;
 * - **the tie** (*nuki*), straight, spanning post to post one course under the
 *   lintel and resting on both posts;
 * - **the lintel** (*kasagi*), **curved**: flat across the span and turning up
 *   at both ends. The turn-up is written as two cells in the same column — the
 *   corner and the cell under it — because a single cell one course up and one
 *   cell out is a diagonal step, and a diagonal step is a floating block
 *   wearing a curve's clothes.
 */
const torii: PropGenerator = (ctx) => {
  const { put } = ctx;
  const z = 1;
  const scuff = ctx.rng("torii.paving").int(0, 3);

  // The approach: paved edge to edge, so the opening is a floor. Nothing else
  // in this generator writes into `y = 1` or `y = 2` between the posts.
  for (let x = 0; x < TORII_W; x++) {
    for (let pz = 0; pz < TORII_D; pz++) {
      put(x, 0, pz, gardenHash(x, pz, scuff, 5) === 0 ? CARVED : WORKED);
    }
  }

  // The posts, with a footing course flanking each of them in z.
  for (const px of TORII_POSTS) {
    for (let y = 0; y < TORII_TIE_Y; y++) put(px, y, z, VERMILION);
    put(px, 0, z - 1, WORKED);
    put(px, 0, z + 1, WORKED);
  }

  // The tie: straight, post to post, one course under the lintel.
  for (let x = TORII_POSTS[0] as number; x <= (TORII_POSTS[1] as number); x++) {
    put(x, TORII_TIE_Y, z, VERMILION, ALONG_X);
  }

  // The lintel: flat over the span, and turning up at both ends.
  for (let x = 0; x < TORII_W; x++) put(x, TORII_LINTEL_Y, z, TILE);
  for (const x of [0, TORII_W - 1]) put(x, TORII_LINTEL_Y + 1, z, TILE);

  // The plaque, hung in the middle of the span between tie and lintel: a
  // carved block with the lintel above it and the tie below it, so it is
  // sandwiched rather than floating.
  const mid = (TORII_W - 1) / 2;
  put(mid, TORII_TIE_Y, z, CARVED);

  return { ops: NO_OPS, meta: metaOf("torii") };
};

/* -------------------------------------------------------------------------- */
/* the dry garden                                                              */
/* -------------------------------------------------------------------------- */

/** The three boulder groups, as offsets from the garden's near-west corner. */
const ZEN_GARDEN_STONES: readonly (readonly [number, number, number])[] = [
  [3, 4, 2],
  [7, 8, 1],
  [5, 9, 1],
];

/**
 * `zen_garden` — raked gravel, placed stones, and three walls.
 *
 * The note asks for a *dry* garden, which in this medium is a floor-plane
 * drawing with almost nothing standing on it, and it is written in four
 * registers:
 *
 * - **the rake**, in the floor plane: gravel with a ridge course every third
 *   row, which at render scale is exactly what a raked bed looks like from a
 *   veranda. Gravel is a gravity block and this is the one plane it is legal
 *   in — it rests on the terrain the prop stands on;
 * - **the stones**, three groups of them, each one or two courses high with
 *   every block resting on the bed or on the block under it, ringed with moss
 *   at the foot. Three and not seven, because at this span seven is gravel
 *   with acne;
 * - **the walls**, on three sides: plastered, three courses, with a dark tile
 *   coping over them, which is the profile that says *garden wall* rather than
 *   *town wall*. The coping is the wall's own top course and never an
 *   overhanging eave: an eave one cell into the garden would put a ceiling at
 *   head height over the bed and take the inner row's walkability with it;
 * - **the veranda** on the fourth side: a plank deck one course up, which is
 *   where the garden is looked at from and the reason the fourth wall is not
 *   there.
 */
const zenGarden: PropGenerator = (ctx) => {
  const { put, palette } = ctx;
  const scuff = ctx.rng("garden.rake").int(0, 3);
  const last = ZEN_GARDEN_SPAN - 1;

  // The bed. The veranda's own strip is laid separately, below.
  for (let z = 0; z < ZEN_GARDEN_SPAN; z++) {
    for (let x = 0; x < last; x++) {
      put(x, 0, z, z % 3 === scuff % 3 ? RIDGE : GRAVEL);
    }
  }

  // The three walls — west, north and south — plastered and coped.
  const wallCells: [number, number][] = [];
  for (let z = 0; z < ZEN_GARDEN_SPAN; z++) wallCells.push([0, z]);
  for (let x = 1; x < last; x++) {
    wallCells.push([x, 0]);
    wallCells.push([x, last]);
  }
  for (const [x, z] of wallCells) {
    for (let y = 0; y < ZEN_GARDEN_WALL_H; y++) put(x, y, z, PLASTER);
    put(x, ZEN_GARDEN_WALL_H, z, TILE);
  }
  // The stones, each with moss at its foot.
  for (const [sx, sz, height] of ZEN_GARDEN_STONES) {
    for (let y = 0; y < height; y++) put(sx, y, sz, BOULDER);
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const mx = sx + dx;
      const mz = sz + dz;
      if (mx < 1 || mz < 1 || mx >= last || mz >= last) continue;
      put(mx, 0, mz, MOSS);
    }
  }

  // The veranda: a plank deck one course up, on its own sill, looking west.
  for (let z = 1; z < last; z++) {
    put(last, 0, z, palette.log, UPRIGHT);
    put(last, 1, z, palette.planks);
  }

  return { ops: NO_OPS, meta: metaOf("zen_garden") };
};

/* -------------------------------------------------------------------------- */
/* the stone lantern                                                           */
/* -------------------------------------------------------------------------- */

/**
 * `stone_lantern` — a pedestal, a fire box with cut faces, and a capstone.
 *
 * The pack's cheapest repeat and the piece that lights a path at night, which
 * makes it the one to scatter: at a path's turn, at a pond's edge, in pairs at
 * the foot of a flight of steps.
 *
 * **It writes no `lantern` block.** The support rule keys on a name ending
 * `lantern` and would want a full cube directly above or below a real one; the
 * light in a stone lantern is a *fire in a stone box*, so it is written as a
 * `glowstone` cube with worked stone under it, a capstone over it and cut
 * faces — walls, which are not full cubes — on all four flanks. That is both
 * what the object is and the only arrangement that needs no support argument
 * at all.
 */
const stoneLantern: PropGenerator = (ctx) => {
  const { put } = ctx;
  const c = (STONE_LANTERN_SPAN - 1) / 2;
  const arms = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const;

  // The pedestal: a cross of worked stone in the ground plane.
  put(c, 0, c, CARVED);
  for (const [dx, dz] of arms) put(c + dx, 0, c + dz, WORKED);

  // The shaft, then the fire box with its cut faces.
  put(c, 1, c, "stone_brick_wall", FREE_WALL);
  put(c, STONE_LANTERN_FIRE_Y, c, GLOW);
  for (const [dx, dz] of arms) {
    put(c + dx, STONE_LANTERN_FIRE_Y, c + dz, "stone_brick_wall", FREE_WALL);
  }

  // The capstone, with an eave slab on each flank, and the finial over it.
  put(c, STONE_LANTERN_FIRE_Y + 1, c, CARVED);
  for (const [dx, dz] of arms) {
    put(c + dx, STONE_LANTERN_FIRE_Y + 1, c + dz, "stone_brick_slab", TOP_SLAB);
  }
  put(c, STONE_LANTERN_FIRE_Y + 2, c, "stone_brick_slab", BOTTOM_SLAB);

  return { ops: NO_OPS, meta: metaOf("stone_lantern") };
};

/* -------------------------------------------------------------------------- */
/* the dragon boat                                                             */
/* -------------------------------------------------------------------------- */

/** Half-beam at station `x` — never zero: a station with no beam is a hole. */
function dragonBoatHalf(x: number): number {
  const stem = 5;
  const stern = 4;
  const full = (DRAGON_BOAT_B - 1) / 2;
  if (x < stem) return Math.max(1, Math.round((full * (x + 1)) / stem));
  if (x >= DRAGON_BOAT_L - stern) {
    const i = DRAGON_BOAT_L - 1 - x;
    return Math.max(1, Math.round((full * (i + 1)) / stern));
  }
  return full;
}

/**
 * `dragon_boat` — a long narrow hull, a head at the stem, a tail at the stern.
 *
 * Twenty-five by five: the proportion *is* the identification, and anything
 * beamier is a barge with a decoration on it. Four things make it read, and
 * all four are outside the hull:
 *
 * - **the head**, at the stem: a stepped stack rising three courses, vermilion,
 *   with a gold jaw at the waterline and a lit eye set against the cheek.
 *   Stepped, because every cell of it has to touch the one before;
 * - **the tail**, at the stern, rising the same way and half as far;
 * - **the oars** — trapdoors down both topsides, which at any distance is a
 *   crew of forty;
 * - **the drum**, amidships on the deck, which is what the crew rows to.
 *
 * The fluid argument is `ships.ts`'s: solid at `y = 0` and `y = -1` across the
 * whole beam, never air and never water, so the hull displaces rather than
 * trapping a pocket.
 */
const dragonBoat: PropGenerator = (ctx) => {
  const { put, palette } = ctx;
  const cz = (DRAGON_BOAT_B - 1) / 2;
  const dark = ctx.rng("dragonboat.timber").float() < 0.5;
  const hull = dark ? palette.log : palette.stripped;
  const deck = palette.planks;

  for (let x = 0; x < DRAGON_BOAT_L; x++) {
    const h = dragonBoatHalf(x);
    for (let dz = -h; dz <= h; dz++) {
      const z = cz + dz;
      put(x, 0, z, deck);
      put(x, -1, z, hull);
      if (Math.abs(dz) === h) put(x, 1, z, VERMILION);
    }
  }

  // The oars: a port every other station down both topsides, hung off the
  // bulwark, so nothing here needs ground under it.
  for (let x = 6; x < DRAGON_BOAT_L - 6; x++) {
    if (x % 2 !== 0) continue;
    for (const sign of [-1, 1] as const) {
      const z = cz + sign * dragonBoatHalf(x);
      put(x, 2, z, palette.trapdoor, {
        facing: sign < 0 ? "south" : "north",
        half: "bottom",
        open: "true",
        powered: "false",
        waterlogged: "false",
      });
    }
  }

  // The head: stepped up off the stem, with a gold jaw and a lit eye.
  put(0, 0, cz, "gold_block");
  for (let k = 1; k <= 3; k++) put(0, k, cz, VERMILION);
  put(1, 3, cz, VERMILION);
  put(1, 4, cz, "gold_block");
  put(0, 4, cz, GLOW);
  // The horns, either side of the crown and each against the head itself.
  for (const sign of [-1, 1] as const) put(1, 4, cz + sign, VERMILION);

  // The tail: the same step, at the stern, and half as tall.
  const stern = DRAGON_BOAT_L - 1;
  put(stern, 1, cz, VERMILION);
  put(stern, 2, cz, VERMILION);
  put(stern - 1, 2, cz, "gold_block");

  // The drum amidships, on the deck, laid across the boat.
  const mid = Math.floor(DRAGON_BOAT_L / 2);
  put(mid, 1, cz, hull, ALONG_Z);
  put(mid, 2, cz, "note_block", { instrument: "harp", note: "0", powered: "false" });

  return { ops: NO_OPS, meta: metaOf("dragon_boat") };
};

/* -------------------------------------------------------------------------- */
/* the registry                                                                */
/* -------------------------------------------------------------------------- */

/**
 * The generators, keyed by name and merged into `PROP_GENERATORS`.
 *
 * `props.ts` stays the one place a prop is looked up; this map is what it
 * spreads.
 */
export const EASTERN_PROP_GENERATORS: Readonly<Record<EasternPropName, PropGenerator>> =
  Object.freeze({
    torii,
    zen_garden: zenGarden,
    stone_lantern: stoneLantern,
    dragon_boat: dragonBoat,
  });
