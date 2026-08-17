/**
 * `prop.place@0` — the **Swamp Witch pack's ground pieces**: the three entries
 * of that pack which stand on the wet ground rather than roofing a room.
 *
 * The pack's thesis is that "a witch's swamp", "a bog hamlet", "a fen coven"
 * all route to the medieval era and arrive as a European village on dry grass
 * with the homestead wave's single `witch_hut` in it. The palette was never the
 * problem — `temperate_timber` and `boreal_pine` have both shipped since the
 * founding waves — it is the **noun set**, and three of those nouns have no
 * inside at all:
 *
 * - `coven_stone_circle` — the ring of standing stones out in the reeds, with
 *   the low altar stone at the middle of it and the walk left open all round;
 * - `bone_charm_rack` — the charm rack at a threshold: two posts, a crossbar
 *   and the charms hanging from it. **Deliberately restrained** — bone and
 *   stick, and not one skull anywhere in it;
 * - `waterlogged_shrine` — the shrine standing in its own **curbed** pool: a
 *   ring of full blocks closing a still square of water, with the shrine stone
 *   in the middle of it.
 *
 * ## The contract, and why this file is a leaf
 *
 * `props-steppe.ts` is this file's model in every respect: it imports **types**
 * from `props.ts` and no values at all, so the one edge `props.ts` → here can
 * never become a module-initialisation cycle. Node-local coordinates, `y = 0`
 * is the base plane, block **names** with a property map, and every op inside
 * the declared box so `rotateOps` needs no special case.
 *
 * ## The rules every prop here obeys — each one somebody else's scar
 *
 * 1. **Nothing floats.** The physics lint's `floating.*` family fires on a
 *    full cube with six air faces. Every post here is a full-block column down
 *    to the base plane, every course of it, and every standing stone stands on
 *    the ground it was raised from.
 * 2. **A walkable cell keeps its two courses of air.** The walk round the
 *    circle, the ground under the charm rack and the path up to the shrine all
 *    leave `y + 1` **and** `y + 2` clear over solid non-water floor. That is
 *    why the charms hang at {@link CHARM_BAR}` - 1` and no lower — a charm at
 *    head height is a charm in somebody's face.
 * 3. **No `mud`, and no `muddy_mangrove_roots`.** This is the pack that will
 *    be tempted: mud is 15/16 of a block and a body cannot stand on it, so a
 *    fen floored in it is a fen you can only look at. The wet ground here is
 *    `podzol`, `coarse_dirt`, `moss_block`, `rooted_dirt` and `grass_block`,
 *    every one of them a full cube and every one of them the right colour.
 * 4. **WATER IS CURBED OR IT IS NOT WRITTEN.** The shrine's pool is the only
 *    fluid in the pack. Every source block in it is closed on all four sides by
 *    a **full** block — never a slab, which is half a block and which water
 *    pours straight through — with the ground under it, so not a drop can
 *    move. The curb is laid as a complete ring before a single source goes in.
 * 5. **No lanterns by name.** The lint's lantern rule fires on any block name
 *    ending `lantern` and wants a floor under it or a chain over it. Nothing in
 *    this file glows, which is what a stone circle and a wayside charm are
 *    after dark.
 * 6. **No `chain`** — it is not in the pinned 1.21.11 block table. Every
 *    hanging strand here is `iron_bars`.
 * 7. **No sign blocks** — a sign is a block entity this op stream cannot
 *    carry — and **no skulls**. The charm rack is bone and stick: a rack of
 *    skulls is the Mesoamerican pack's `tzompantli_rack`, it is that pack's
 *    argument to make and not this one's, and the difference between a folk
 *    charm and a trophy is the whole tone of the pack.
 * 8. **Determinism.** The only randomness is the scuffing of the ground plane,
 *    drawn from a named stream of the node seed. No wall clock, no
 *    `Math.random`, no transcendental.
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
 * is enumerated, and mirrored element-for-element by the spec package's
 * `SETTLEMENT_PROP_NAMES`.
 */
export const SWAMP_PROP_NAMES = [
  "coven_stone_circle",
  "bone_charm_rack",
  "waterlogged_shrine",
] as const;

/** One of the props this file builds. */
export type SwampPropName = (typeof SWAMP_PROP_NAMES)[number];

/** True for a name this file answers to. */
export function isSwampProp(name: string): name is SwampPropName {
  return (SWAMP_PROP_NAMES as readonly string[]).includes(name);
}

/* -------------------------------------------------------------------------- */
/* extents                                                                     */
/* -------------------------------------------------------------------------- */

/** The stone circle's pad, in x and z — the ring and the walk round it. */
export const CIRCLE_SPAN = 9;
/** Circle height: the ground, two courses of stone and the capstone. */
export const CIRCLE_H = 5;
/** How far the standing stones stand from the middle. */
export const CIRCLE_RADIUS = 3;

/** The charm rack's pad, in x and z. */
export const CHARM_SPAN = 5;
/** Charm rack height: the ground, the posts, the crossbar and the air over it. */
export const CHARM_H = 6;
/** The course the crossbar runs at — the charms hang one under it. */
export const CHARM_BAR = 4;

/** The shrine's pad, in x and z — the walk, the curb and the pool. */
export const SHRINE_SPAN = 7;
/** Shrine height: the ground, the pool course, the stone and the cap. */
export const SHRINE_H = 5;

/** The declared box of one of this file's props, before it is generated. */
export function swampPropFootprint(
  prop: SwampPropName,
  _params: Readonly<Record<string, unknown>> = {},
): {
  readonly size: readonly [number, number, number];
  readonly minY: number;
  readonly base: PropBase;
} {
  const ground = (
    size: readonly [number, number, number],
  ): {
    size: readonly [number, number, number];
    minY: number;
    base: PropBase;
  } => ({ size, minY: 0, base: "ground" });
  switch (prop) {
    case "coven_stone_circle":
      return ground([CIRCLE_SPAN, CIRCLE_H, CIRCLE_SPAN]);
    case "bone_charm_rack":
      return ground([CHARM_SPAN, CHARM_H, CHARM_SPAN]);
    case "waterlogged_shrine":
    default:
      return ground([SHRINE_SPAN, SHRINE_H, SHRINE_SPAN]);
  }
}

/** Build a `PropMeta` from the declared footprint, so the two cannot drift. */
function metaOf(prop: SwampPropName, params: Readonly<Record<string, unknown>>): PropMeta {
  const foot = swampPropFootprint(prop, params);
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

/** The `put` a generator is handed, narrowed for the helpers below. */
type PropContextPut = (
  x: number,
  y: number,
  z: number,
  block: string,
  props?: Record<string, string>,
) => void;

/** A run of bars along x. */
const BARS_X: Record<string, string> = {
  east: "true",
  north: "false",
  south: "false",
  waterlogged: "false",
  west: "true",
};

/** A bare post of bars — a hanging strand. */
const BARS_POST: Record<string, string> = {
  east: "false",
  north: "false",
  south: "false",
  waterlogged: "false",
  west: "false",
};

/** A bottom slab, standing on the block under it. */
const SLAB_BOTTOM: Record<string, string> = { type: "bottom", waterlogged: "false" };

/** A still source block. Every drop of water in this pack carries this. */
const SOURCE: Record<string, string> = { level: "0" };

/* -------------------------------------------------------------------------- */
/* the ground                                                                  */
/* -------------------------------------------------------------------------- */

/** The **wet ground** of a fen — deliberately not `mud`, and never `farmland`. */
function fen(x: number, z: number, scuff: number): string {
  const k = (x * 7 + z * 13 + scuff) % 11;
  if (k === 0 || k === 1) return "podzol";
  if (k === 2) return "coarse_dirt";
  if (k === 3) return "moss_block";
  if (k === 4) return "rooted_dirt";
  return "grass_block";
}

/** The **trodden path** up to a shrine or a threshold. */
function trodden(x: number, z: number, scuff: number): string {
  const k = (x * 11 + z * 5 + scuff) % 9;
  if (k === 0) return "gravel";
  if (k === 1) return "cobblestone";
  if (k === 2 || k === 3) return "moss_block";
  if (k === 4) return "grass_block";
  return "coarse_dirt";
}

/** Lay one surface over the whole declared box at a plane. */
function surface(
  put: PropContextPut,
  y: number,
  w: number,
  d: number,
  block: (x: number, z: number) => string,
): void {
  for (let z = 0; z < d; z++) {
    for (let x = 0; x < w; x++) put(x, y, z, block(x, z));
  }
}

/* -------------------------------------------------------------------------- */
/* the stone circle                                                            */
/* -------------------------------------------------------------------------- */

/**
 * `coven_stone_circle` — the ring of standing stones out in the reeds.
 *
 * Eight stones on a ring of {@link CIRCLE_RADIUS}, each a **full-block column**
 * of the theme's stone standing on the base plane — two courses and a slab cap,
 * which is roughly a person and a half and is the height a real standing stone
 * actually is. The cap is a slab so the head of each stone narrows: a flat top
 * of full cubes reads as masonry, and these were not built, they were *raised*.
 *
 * The middle holds the **altar stone**, one course with a slab on it, low
 * enough that the ring is still a ring seen from outside rather than a building
 * with a thing in the middle.
 *
 * Everything else on the pad is left **open**, and that is the piece worth
 * saying out loud: the walk between and around the stones keeps `y + 1` and
 * `y + 2` clear over solid non-water floor, because a circle a body cannot walk
 * into is a circle that has failed at its only job.
 */
const covenStoneCircle: PropGenerator = (ctx) => {
  const { put, palette } = ctx;
  const scuff = ctx.rng("coven.ground").int(0, 10);
  surface(put, 0, CIRCLE_SPAN, CIRCLE_SPAN, (x, z) => fen(x, z, scuff));

  const mid = Math.floor(CIRCLE_SPAN / 2);
  const r = CIRCLE_RADIUS;

  // The eight stones: the four cardinals at the full radius and the four
  // diagonals one in, which is what puts them on a ring rather than on a square.
  const stones = [
    [mid - r, mid],
    [mid + r, mid],
    [mid, mid - r],
    [mid, mid + r],
    [mid - r + 1, mid - r + 1],
    [mid - r + 1, mid + r - 1],
    [mid + r - 1, mid - r + 1],
    [mid + r - 1, mid + r - 1],
  ] as const;
  for (const [sx, sz] of stones) {
    put(sx, 1, sz, palette.stone);
    put(sx, 2, sz, (sx + sz + scuff) % 3 === 0 ? "mossy_cobblestone" : palette.stoneAccent);
    put(sx, 3, sz, palette.stoneSlab, SLAB_BOTTOM);
  }

  // The altar at the middle: one course and a slab, and nothing lit on it.
  put(mid, 1, mid, palette.stoneAccent);
  put(mid, 2, mid, palette.stoneSlab, SLAB_BOTTOM);

  return { ops: NO_OPS, meta: metaOf("coven_stone_circle", ctx.params) };
};

/* -------------------------------------------------------------------------- */
/* the charm rack                                                              */
/* -------------------------------------------------------------------------- */

/**
 * `bone_charm_rack` — the charm rack at a threshold, and the most restrained
 * piece in the pack on purpose.
 *
 * Two **posts** — full-block columns of the theme's log standing on the ground,
 * every course of them — a **crossbar** of `bone_block` over their heads, and
 * the **charms** hanging from it as single strands of `iron_bars`.
 *
 * **Not one skull.** A rack of skulls is the Mesoamerican pack's
 * `tzompantli_rack`; that pack made that argument on purpose and this one is
 * not entitled to borrow it. A fen charm is a knuckle bone and a bundle of
 * sticks hung over a door to keep something out, which is a different kind of
 * frightening and a much quieter one. `props-swamp.test.ts` asserts the absence
 * by name, so the restraint is a property of the file rather than a taste in
 * this comment.
 *
 * The strands hang at {@link CHARM_BAR}` - 1` = 3 and no lower: `iron_bars` is
 * a body-blocking block, so a charm at `y = 2` is a charm through somebody's
 * face and the cell under it stops being walkable. At three, a body walks
 * under the rack and the charms are at eye level of somebody on a horse, which
 * is exactly right.
 */
const boneCharmRack: PropGenerator = (ctx) => {
  const { put, palette } = ctx;
  const scuff = ctx.rng("charm.ground").int(0, 10);
  surface(put, 0, CHARM_SPAN, CHARM_SPAN, (x, z) => trodden(x, z, scuff));

  const mid = Math.floor(CHARM_SPAN / 2);

  // The two posts, full columns from the ground to the bar.
  for (const px of [mid - 1, mid + 1]) {
    for (let y = 1; y <= CHARM_BAR - 1; y++) put(px, y, mid, palette.log, { axis: "y" });
  }

  // The crossbar over their heads, bone by name and the one place this pack
  // says the word.
  for (let x = mid - 1; x <= mid + 1; x++) put(x, CHARM_BAR, mid, "bone_block", { axis: "x" });

  // The charms: one strand under the middle of the bar, where a body walks
  // under it and nothing at all is in the way at y = 1 or y = 2.
  put(mid, CHARM_BAR - 1, mid, "iron_bars", BARS_POST);

  // The stick bundles lashed to the posts' heads, along the bar's own axis.
  for (const px of [mid - 2, mid + 2]) {
    put(px, CHARM_BAR, mid, "iron_bars", BARS_X);
  }

  return { ops: NO_OPS, meta: metaOf("bone_charm_rack", ctx.params) };
};

/* -------------------------------------------------------------------------- */
/* the waterlogged shrine                                                      */
/* -------------------------------------------------------------------------- */

/**
 * `waterlogged_shrine` — the shrine standing in its own still pool.
 *
 * The one fluid in the whole pack, and the whole of the care it takes. A water
 * source block moves the instant a horizontal neighbour is anything a fluid can
 * enter, so this pool is built **curb first**: a complete ring of **full**
 * blocks at the pool course, laid before a single source goes in, with the
 * ground plane under it. Slabs would be a prettier kerb and slabs are half a
 * block — water pours straight through one — so the curb here is dressed stone,
 * full height, all the way round.
 *
 * What stands in the middle is the shrine itself: a stone shaft with a
 * **chiseled band** at a body's own height, which is the carving, and a slab
 * cap. Nothing on it is lit; a candle in a bog is a candle nobody lit.
 *
 * The outermost ring of the pad is left **open ground**, so a body can walk
 * right up to the curb and look over it, which is the only way anyone ever sees
 * a shrine like this.
 */
const waterloggedShrine: PropGenerator = (ctx) => {
  const { put, palette } = ctx;
  const scuff = ctx.rng("shrine.ground").int(0, 10);
  surface(put, 0, SHRINE_SPAN, SHRINE_SPAN, (x, z) => trodden(x, z, scuff));

  const mid = Math.floor(SHRINE_SPAN / 2);

  // THE CURB, FIRST AND WHOLE: the complete ring at radius two, full blocks
  // every one, so the pool inside it has nowhere at all to go.
  for (let z = mid - 2; z <= mid + 2; z++) {
    for (let x = mid - 2; x <= mid + 2; x++) {
      if (Math.abs(x - mid) !== 2 && Math.abs(z - mid) !== 2) continue;
      put(x, 1, z, (x + z + scuff) % 4 === 0 ? "mossy_cobblestone" : palette.stone);
    }
  }

  // The pool: the eight cells inside the curb, every one of them a still
  // source with the ground under it and full blocks or its own water on all
  // four sides.
  for (let z = mid - 1; z <= mid + 1; z++) {
    for (let x = mid - 1; x <= mid + 1; x++) {
      if (x === mid && z === mid) continue; // the shrine's own cell
      put(x, 1, z, "water", SOURCE);
    }
  }

  // The shrine, standing out of the water at the middle of it.
  put(mid, 1, mid, palette.stone);
  put(mid, 2, mid, "chiseled_stone_bricks");
  put(mid, 3, mid, palette.stoneAccent);
  put(mid, 4, mid, palette.stoneSlab, SLAB_BOTTOM);

  return { ops: NO_OPS, meta: metaOf("waterlogged_shrine", ctx.params) };
};

/* -------------------------------------------------------------------------- */
/* the registry                                                                */
/* -------------------------------------------------------------------------- */

/** This file's generators, keyed by name; `props.ts` spreads them. */
export const SWAMP_PROP_GENERATORS: Readonly<Record<string, PropGenerator>> = Object.freeze({
  coven_stone_circle: covenStoneCircle,
  bone_charm_rack: boneCharmRack,
  waterlogged_shrine: waterloggedShrine,
});

/** The palette symbols this file reads, named so a reader can check them off. */
export type SwampPalette = Pick<PropPalette, "log" | "stone" | "stoneAccent" | "stoneSlab">;
