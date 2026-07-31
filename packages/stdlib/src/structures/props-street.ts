/**
 * `prop.place@0` — wave 4: street furniture.
 *
 * Twelve small things that stand in a lane. None of them is a building and
 * none of them is a compound: each is one object a viewer reads at a glance —
 * a well on the green, a lamp on the kerb, a woodpile against a wall — and the
 * whole point of the wave is *density*. A plaza with a well, a notice board, a
 * lamp post and a litter bin reads as a place people use; the same plaza with
 * one carousel reads as a fairground with nothing else in it.
 *
 * The contract is `props.ts`'s, unchanged and re-stated because every generator
 * below obeys it: node-local coordinates, `y = 0` the base plane, block *names*
 * with a property map, every op inside the declared box so `rotateOps` needs no
 * special case. Like `props-blitz.ts` this file is a **leaf**: it imports types
 * from `props.ts` and no values, so the one edge `props.ts` → here cannot
 * become a module-initialisation cycle.
 *
 * ## Fluids
 *
 * Three of these hold water — the well, the trough and the drinking fountain —
 * and not one of them writes a `water` block. They use **`water_cauldron`**,
 * which is a block that *looks* full of water and is not a fluid: it cannot
 * spread, cannot fall, and cannot be destabilised by anything the terrain does
 * around it. `checkPropFluidSafety` has nothing to check because there is
 * nothing to leak. That is a deliberate downgrade in ambition from the pool's
 * boxed basin: at this scale a cauldron *is* the read, and a one-block pond
 * walled in on four sides costs three times the blocks to say the same thing.
 *
 * ## Support
 *
 * Every block here rests on the ground, on another block of the same prop, or
 * hangs under one. Two idioms recur and are worth naming, because both look
 * like floating blocks and neither is:
 *
 * - a **beam** — the hitching rail, the well's windlass axle, the woodpile's
 *   courses — is a *log*, not a fence. A fence in mid air is a support-chain
 *   defect (`unsupported.chain`: a fence is exempt only when it is braced to a
 *   full cube, which another fence is not); a log spanning two posts touches
 *   them, so it is neither isolated nor unsupported.
 * - a **lamp arm** is a bottom slab. A hanging lantern's chain walk accepts a
 *   flush underside, which a bottom slab has and a top slab does not, so the
 *   lantern under the arm is hung from something the game agrees is there.
 */

import type { LocalVoxelOp } from "./core.js";
import type { PropBase, PropGenerator, PropMeta, PropPalette } from "./props.js";

/* -------------------------------------------------------------------------- */
/* the catalog                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Every prop this file builds, in catalog order.
 *
 * Spread into `PROP_NAMES` by `props.ts`, which stays the one place a prop name
 * is enumerated.
 */
export const STREET_PROP_NAMES = [
  "well_head",
  "notice_board",
  "hitching_post",
  "horse_trough",
  "lamp_post",
  "litter_bin",
  "drinking_fountain",
  "flagpole",
  "bollard_row",
  "sandwich_board",
  "dog_kennel",
  "log_pile",
] as const;

/** One of the props this file builds. */
export type StreetPropName = (typeof STREET_PROP_NAMES)[number];

/** True for a name this file answers to. */
export function isStreetProp(name: string): name is StreetPropName {
  return (STREET_PROP_NAMES as readonly string[]).includes(name);
}

/* -------------------------------------------------------------------------- */
/* params                                                                      */
/* -------------------------------------------------------------------------- */

/** Read an integer param, rounded and clamped, with a default. */
function readInt(
  params: Readonly<Record<string, unknown>>,
  key: string,
  fallback: number,
  lo: number,
  hi: number,
): number {
  const raw = params[key];
  if (typeof raw !== "number" || !Number.isFinite(raw)) return fallback;
  const v = Math.round(raw);
  return v < lo ? lo : v > hi ? hi : v;
}

/** Default bollards in a row, and the range the param is clamped to. */
export const BOLLARD_ROW_DEFAULT = 9;
/** See {@link BOLLARD_ROW_DEFAULT}. */
export const BOLLARD_ROW_MIN = 5;
/** See {@link BOLLARD_ROW_DEFAULT}. */
export const BOLLARD_ROW_MAX = 33;

/* -------------------------------------------------------------------------- */
/* footprints                                                                  */
/* -------------------------------------------------------------------------- */

/** The declared box of one of this file's props, before it is generated. */
export function streetPropFootprint(
  prop: StreetPropName,
  params: Readonly<Record<string, unknown>> = {},
): {
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
    case "well_head":
      return ground([3, 6, 3]);
    case "notice_board":
      return ground([3, 4, 2]);
    case "hitching_post":
      return ground([4, 3, 1]);
    case "horse_trough":
      return ground([4, 2, 3]);
    case "lamp_post":
      return ground([3, 7, 3]);
    case "litter_bin":
      return ground([2, 3, 2]);
    case "drinking_fountain":
      return ground([3, 4, 3]);
    case "flagpole":
      return ground([3, 9, 3]);
    case "bollard_row":
      return ground([
        readInt(params, "length", BOLLARD_ROW_DEFAULT, BOLLARD_ROW_MIN, BOLLARD_ROW_MAX),
        2,
        1,
      ]);
    case "sandwich_board":
      return ground([2, 2, 2]);
    case "dog_kennel":
      return ground([3, 5, 3]);
    case "log_pile":
    default:
      return ground([5, 3, 3]);
  }
}

/** Build a `PropMeta` from the declared footprint, so the two cannot drift. */
function metaOf(
  prop: StreetPropName,
  params: Readonly<Record<string, unknown>> = {},
): PropMeta {
  const foot = streetPropFootprint(prop, params);
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

/** A masonry mix, keyed by position so a re-run is byte-identical. */
function stoneAt(palette: PropPalette, x: number, y: number, z: number): string {
  return (x * 5 + y * 11 + z * 3) % 4 === 0 ? palette.stoneAccent : palette.stone;
}

/** Banner colours, in draw order — a town's flags are not all one red. */
export const STREET_BANNERS: readonly string[] = Object.freeze([
  "red_banner",
  "blue_banner",
  "yellow_banner",
  "white_banner",
  "green_banner",
]);

/* -------------------------------------------------------------------------- */
/* waterworks in miniature                                                     */
/* -------------------------------------------------------------------------- */

/**
 * `well_head` — a stone ring, a windlass over it, a bucket on the line, and a
 * pitched roof on two posts.
 *
 * The water is a **cauldron** in the middle of the ring rather than a block of
 * water in a shaft. A shaft would have to be walled for its whole depth to be
 * stable and would then be invisible from above; the cauldron reads as full at
 * a glance and cannot leak.
 *
 * The bucket hangs from the axle on a length of `prop.chain` (iron bars by
 * default) — bars under a log under nothing else, which is the one legal way
 * to draw a hanging line here.
 */
const wellHead: PropGenerator = ({ put, palette }) => {
  // The kerb: a full pad, with the draw-hole in the middle.
  for (let x = 0; x < 3; x++) {
    for (let z = 0; z < 3; z++) {
      if (x === 1 && z === 1) {
        put(x, 0, z, "water_cauldron", { level: "3" });
        continue;
      }
      put(x, 0, z, stoneAt(palette, x, 0, z));
    }
  }
  // The coping ring, one course proud, open over the water.
  for (let x = 0; x < 3; x++) {
    for (let z = 0; z < 3; z++) {
      if (x === 1 && z === 1) continue;
      put(x, 1, z, palette.stoneWall);
    }
  }
  // Two posts, east and west, standing on the coping.
  for (const x of [0, 2]) {
    for (let y = 2; y <= 3; y++) put(x, y, 1, palette.fence);
  }
  // The windlass: an axle spanning the posts, a line under it, a bucket on it.
  put(1, 4, 1, palette.stripped, { axis: "x" });
  put(1, 3, 1, palette.chain);
  put(1, 2, 1, "cauldron");
  // The roof, over the lot.
  for (let x = 0; x < 3; x++) {
    for (let z = 0; z < 3; z++) put(x, 5, z, palette.roofSlab, { type: "bottom" });
  }
  return { ops: NO_OPS, meta: metaOf("well_head") };
};

/**
 * `horse_trough` — a hollowed stone trough, filled.
 *
 * A solid floor, a wall ring one course up, and two cauldrons in the hollow.
 * The same argument as the well: a cauldron is a filled trough that cannot
 * spill, and at four blocks long nobody reads the difference.
 */
const horseTrough: PropGenerator = ({ put, palette }) => {
  for (let x = 0; x < 4; x++) {
    for (let z = 0; z < 3; z++) put(x, 0, z, stoneAt(palette, x, 0, z));
  }
  for (let x = 0; x < 4; x++) {
    for (let z = 0; z < 3; z++) {
      if (z === 1 && x > 0 && x < 3) {
        put(x, 1, z, "water_cauldron", { level: "3" });
        continue;
      }
      put(x, 1, z, palette.stoneAccent);
    }
  }
  return { ops: NO_OPS, meta: metaOf("horse_trough") };
};

/**
 * `drinking_fountain` — a pedestal, a basin and a spout off a back plate.
 *
 * The spout is an **open trapdoor** on the back plate's south face, one course
 * over the basin: a flat metal tongue pointing at the water, which is what a
 * spout looks like from three blocks away and costs one block.
 */
const drinkingFountain: PropGenerator = ({ put, palette }) => {
  for (let x = 0; x < 3; x++) {
    for (let z = 0; z < 3; z++) put(x, 0, z, stoneAt(palette, x, 0, z));
  }
  // The back plate, north of the basin, and the pedestal under it.
  for (let y = 1; y <= 3; y++) put(1, y, 0, palette.stoneAccent);
  put(1, 1, 1, palette.stoneAccent);
  put(1, 2, 1, "water_cauldron", { level: "3" });
  put(1, 3, 1, palette.trapdoor, { facing: "north", half: "bottom", open: "true" });
  return { ops: NO_OPS, meta: metaOf("drinking_fountain") };
};

/* -------------------------------------------------------------------------- */
/* posts, boards and lamps                                                     */
/* -------------------------------------------------------------------------- */

/**
 * `notice_board` — two posts, a plank board, a sheet of notices and a roof.
 *
 * No sign block anywhere. A sign is a block **entity**, and the notices here
 * are open trapdoors standing against the board's south face — the paper read,
 * out of blocks the world can round-trip.
 */
const noticeBoard: PropGenerator = ({ put, palette }) => {
  for (const x of [0, 2]) {
    for (let y = 0; y <= 1; y++) put(x, y, 1, palette.fence);
  }
  for (let x = 0; x < 3; x++) put(x, 2, 1, palette.planks);
  for (let x = 0; x < 3; x++) {
    put(x, 2, 0, palette.trapdoor, { facing: "south", half: "bottom", open: "true" });
  }
  for (let x = 0; x < 3; x++) {
    for (let z = 0; z < 2; z++) put(x, 3, z, palette.roofSlab, { type: "bottom" });
  }
  return { ops: NO_OPS, meta: metaOf("notice_board") };
};

/**
 * `hitching_post` — two posts, a rail between them, iron rings on top.
 *
 * The rail is a **log**, not a fence: a fence in mid air needs its support
 * chain to reach the ground and is exempt only when braced to a full cube,
 * which the fence posts either side are not. A log touching both posts is
 * neither isolated nor unsupported, and reads as the beam it is.
 */
const hitchingPost: PropGenerator = ({ put, palette }) => {
  for (const x of [0, 3]) {
    for (let y = 0; y <= 1; y++) put(x, y, 0, palette.fence);
  }
  for (const x of [1, 2]) put(x, 1, 0, palette.stripped, { axis: "x" });
  for (const x of [0, 3]) {
    put(x, 2, 0, "iron_trapdoor", { facing: "south", half: "bottom", open: "true" });
  }
  return { ops: NO_OPS, meta: metaOf("hitching_post") };
};

/**
 * `lamp_post` — a paved pad, a post, two slab arms and a lantern on each.
 *
 * The arms are bottom slabs because a hanging lantern's support walk accepts a
 * flush underside; a top slab has none, and the lantern under one is a lint
 * finding. The post carries a third lantern standing on its head, so the lamp
 * reads lit from directly below as well as from the side.
 */
const lampPost: PropGenerator = ({ put, palette }) => {
  for (let x = 0; x < 3; x++) {
    for (let z = 0; z < 3; z++) put(x, 0, z, stoneAt(palette, x, 0, z));
  }
  for (let y = 1; y <= 5; y++) put(1, y, 1, palette.fence);
  for (const x of [0, 2]) {
    put(x, 5, 1, palette.slab, { type: "bottom" });
    put(x, 4, 1, palette.lantern, { hanging: "true" });
  }
  put(1, 6, 1, palette.lantern, { hanging: "false" });
  return { ops: NO_OPS, meta: metaOf("lamp_post") };
};

/**
 * `flagpole` — a stone pad with corner stumps, a tall pole, a banner at the
 * masthead.
 *
 * The banner is a *standing* banner on the pole's top block, which is where
 * vanilla wants one: a standing banner needs the block below it, and the pole
 * is that block. The colour is drawn from the node's seed, so a town square and
 * a barracks do not fly the same flag.
 */
const flagpole: PropGenerator = (ctx) => {
  const { put, palette } = ctx;
  for (let x = 0; x < 3; x++) {
    for (let z = 0; z < 3; z++) put(x, 0, z, stoneAt(palette, x, 0, z));
  }
  // Corner stumps: the trim that makes a pad read as a base.
  for (const [x, z] of [
    [0, 0],
    [0, 2],
    [2, 0],
    [2, 2],
  ] as const) {
    put(x, 1, z, palette.stoneWall);
  }
  for (let y = 1; y <= 7; y++) put(1, y, 1, palette.fence);
  const banner = STREET_BANNERS[ctx.rng("flagpole").int(0, STREET_BANNERS.length - 1)] as string;
  put(1, 8, 1, banner, { rotation: "0" });
  return { ops: NO_OPS, meta: metaOf("flagpole") };
};

/**
 * `bollard_row` — a run of short stone posts along a kerb.
 *
 * Parameterised the way the curtain wall is: one `length`, clamped, and the
 * declared footprint follows it so the placer reserves what the row uses. A
 * bollard stands at every other cell and *always* at both ends, so a row of any
 * length terminates deliberately rather than trailing off.
 */
const bollardRow: PropGenerator = ({ put, palette, params }) => {
  const length = readInt(
    params,
    "length",
    BOLLARD_ROW_DEFAULT,
    BOLLARD_ROW_MIN,
    BOLLARD_ROW_MAX,
  );
  const at = new Set<number>([0, length - 1]);
  for (let x = 0; x < length; x += 2) at.add(x);
  for (const x of [...at].sort((a, b) => a - b)) {
    put(x, 0, 0, stoneAt(palette, x, 0, 0));
    put(x, 1, 0, palette.stoneWall);
  }
  return { ops: NO_OPS, meta: metaOf("bollard_row", params) };
};

/**
 * `sandwich_board` — the A-frame outside a shop.
 *
 * Two by two by two, and it is meant to be: the smallest prop in the catalog.
 * Two pairs of open trapdoors lean against each other over a slab base, which
 * is the A-frame; no sign, because a sign is a block entity and a blank one is
 * worse than none.
 */
const sandwichBoard: PropGenerator = ({ put, palette }) => {
  for (let x = 0; x < 2; x++) {
    for (let z = 0; z < 2; z++) put(x, 0, z, palette.slab, { type: "bottom" });
  }
  for (let x = 0; x < 2; x++) {
    put(x, 1, 0, palette.trapdoor, { facing: "north", half: "bottom", open: "true" });
    put(x, 1, 1, palette.trapdoor, { facing: "south", half: "bottom", open: "true" });
  }
  return { ops: NO_OPS, meta: metaOf("sandwich_board") };
};

/* -------------------------------------------------------------------------- */
/* yards and back lanes                                                        */
/* -------------------------------------------------------------------------- */

/**
 * `litter_bin` — a composter and a barrel on a paved corner, lidded.
 *
 * Two bins rather than one, because a single bin at this scale reads as a
 * dropped block; a pair with a paved patch under them reads as a corner
 * somebody sweeps.
 */
const litterBin: PropGenerator = ({ put, palette }) => {
  for (let x = 0; x < 2; x++) {
    for (let z = 0; z < 2; z++) put(x, 0, z, stoneAt(palette, x, 0, z));
  }
  put(0, 1, 0, "composter", { level: "2" });
  put(1, 1, 0, palette.cargo, { facing: "up", open: "false" });
  for (let x = 0; x < 2; x++) put(x, 1, 1, palette.stoneSlab, { type: "bottom" });
  // The lid, half off the composter: the rim read.
  put(0, 2, 0, palette.trapdoor, { facing: "south", half: "top", open: "false" });
  return { ops: NO_OPS, meta: metaOf("litter_bin") };
};

/**
 * `dog_kennel` — a plank box with a doorway, a pitched roof, a bowl and a
 * name banner on the ridge.
 *
 * The bowl is a pressure plate on the kennel floor. There is no bowl block and
 * no item this compiler may place; a plate is the flattest round thing in the
 * game and it is what the read needs.
 */
const dogKennel: PropGenerator = (ctx) => {
  const { put, palette } = ctx;
  for (let x = 0; x < 3; x++) {
    for (let z = 0; z < 3; z++) put(x, 0, z, palette.planks);
  }
  for (let y = 1; y <= 2; y++) {
    for (let x = 0; x < 3; x++) {
      for (let z = 0; z < 3; z++) {
        if (x > 0 && x < 2 && z > 0 && z < 2) continue;
        // The doorway: the middle of the south wall, both courses.
        if (x === 1 && z === 2) continue;
        put(x, y, z, palette.planks);
      }
    }
  }
  put(1, 1, 1, "light_weighted_pressure_plate", { power: "0" });
  for (let x = 0; x < 3; x++) {
    put(x, 3, 0, palette.roofStairs, { facing: "north", half: "bottom", shape: "straight" });
    put(x, 3, 1, palette.roofSlab, { type: "top" });
    put(x, 3, 2, palette.roofStairs, { facing: "south", half: "bottom", shape: "straight" });
  }
  const banner = STREET_BANNERS[ctx.rng("kennel").int(0, STREET_BANNERS.length - 1)] as string;
  put(1, 4, 1, banner, { rotation: "0" });
  return { ops: NO_OPS, meta: metaOf("dog_kennel") };
};

/**
 * `log_pile` — a stacked cord of firewood between four chocks.
 *
 * The logs run along `x` with `axis: "x"`, which is the property that has to
 * survive a quarter turn, and the chocks at either end are what make the pile
 * read as stacked rather than as a lump of wood: without them it is a wall.
 * The top course is one log narrower, so the stack has a crown.
 */
const logPile: PropGenerator = ({ put, palette }) => {
  for (const x of [0, 4]) {
    for (const z of [0, 2]) {
      for (let y = 0; y <= 1; y++) put(x, y, z, palette.fence);
    }
  }
  for (let x = 1; x <= 3; x++) {
    for (let z = 0; z < 3; z++) {
      put(x, 0, z, palette.log, { axis: "x" });
      put(x, 1, z, palette.stripped, { axis: "x" });
    }
    put(x, 2, 1, palette.log, { axis: "x" });
  }
  return { ops: NO_OPS, meta: metaOf("log_pile") };
};

/* -------------------------------------------------------------------------- */
/* registry                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Name → generator, spread into `PROP_GENERATORS` by `props.ts`.
 *
 * Adding a prop is one entry here and one name in {@link STREET_PROP_NAMES};
 * the catalog test holds the two against each other.
 */
export const STREET_PROP_GENERATORS: Readonly<Record<string, PropGenerator>> = Object.freeze({
  well_head: wellHead,
  notice_board: noticeBoard,
  hitching_post: hitchingPost,
  horse_trough: horseTrough,
  lamp_post: lampPost,
  litter_bin: litterBin,
  drinking_fountain: drinkingFountain,
  flagpole,
  bollard_row: bollardRow,
  sandwich_board: sandwichBoard,
  dog_kennel: dogKennel,
  log_pile: logPile,
});

/* -------------------------------------------------------------------------- */
/* exhibits                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Dev-world exhibit rows for this wave, in the shape `exhibits/props.ts`
 * spreads.
 *
 * It lives here rather than compiler-side for the same reason
 * `exhibits/blitz.ts` exists: `exhibits/props.ts` is shared ground between
 * parallel tracks, and registering a wave there should be one import and one
 * spread — a conflict a merge can resolve. Every one of the twelve appears at
 * yaw 0; the rotations are spent on the props whose op lists are asymmetric
 * (the notice board's face, the kennel's doorway, the log pile's axis), which
 * are the ones where a property that failed to rotate would be invisible at
 * yaw 0.
 *
 * Typed structurally rather than against the compiler's `PropName` because
 * this package cannot import the compiler; `exhibits/props.ts` spreads it into
 * a list that *is* so typed, which is where the names are checked.
 */
export const STREET_PROP_EXHIBIT_PLAN: readonly {
  readonly row: string;
  readonly water: boolean;
  readonly cells: readonly {
    readonly prop: StreetPropName;
    readonly params: Record<string, unknown>;
  }[];
}[] = Object.freeze([
  {
    row: "street_water",
    water: false,
    cells: [
      { prop: "well_head", params: { yaw: 0 } },
      { prop: "well_head", params: { yaw: 90 } },
      { prop: "horse_trough", params: { yaw: 0 } },
      { prop: "horse_trough", params: { yaw: 90 } },
      { prop: "drinking_fountain", params: { yaw: 0 } },
      { prop: "drinking_fountain", params: { yaw: 180 } },
    ],
  },
  {
    row: "street_posts",
    water: false,
    cells: [
      { prop: "notice_board", params: { yaw: 0 } },
      { prop: "notice_board", params: { yaw: 90 } },
      { prop: "notice_board", params: { yaw: 180 } },
      { prop: "hitching_post", params: { yaw: 0 } },
      { prop: "hitching_post", params: { yaw: 90 } },
      { prop: "lamp_post", params: { yaw: 0 } },
      { prop: "lamp_post", params: { yaw: 90 } },
      { prop: "flagpole", params: { yaw: 0 } },
    ],
  },
  {
    row: "street_kerb",
    water: false,
    cells: [
      { prop: "bollard_row", params: { length: 9, yaw: 0 } },
      { prop: "bollard_row", params: { length: 16, yaw: 90 } },
      { prop: "litter_bin", params: { yaw: 0 } },
      { prop: "litter_bin", params: { yaw: 270 } },
      { prop: "sandwich_board", params: { yaw: 0 } },
      { prop: "sandwich_board", params: { yaw: 90 } },
    ],
  },
  {
    row: "street_yard",
    water: false,
    cells: [
      { prop: "dog_kennel", params: { yaw: 0 } },
      { prop: "dog_kennel", params: { yaw: 180 } },
      { prop: "log_pile", params: { yaw: 0 } },
      { prop: "log_pile", params: { yaw: 90 } },
    ],
  },
]);
