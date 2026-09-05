/**
 * `prop.place@0` — the **desert_caravanserai pack's ground pieces**: the two
 * entries of that pack which stand on the bare ground rather than roofing a
 * room.
 *
 * The pack's thesis is that "a Silk Road oasis", "a caravan town" and "a desert
 * serai" all route to the `medieval` era and arrive as a European village in
 * sandstone. The palette was never the problem — the sandstone family has
 * shipped since the founding waves — it is the **noun set**, and two of those
 * nouns have no inside at all:
 *
 * - `date_palm_grove` — the reason the town is here: three date palms on a
 *   scuffed sand pad, each a full-block trunk with its crown standing on it,
 *   and the low kerb of a watered bed round their feet;
 * - `caravan_pack_stack` — a caravan's load, off the animals and stacked for
 *   the night: bales, sacks, water jars and the rolled tent, on honest grit.
 *
 * ## The contract, and why this file is a leaf
 *
 * `props-atlantean.ts` is this file's model in every respect: it imports
 * **types** from `props.ts` and no values at all, so the one edge `props.ts` →
 * here can never become a module-initialisation cycle. Node-local coordinates,
 * `y = 0` is the base plane, block **names** with a property map, and every op
 * inside the declared box so `rotateOps` needs no special case.
 *
 * ## The rules every prop here obeys — each one somebody else's scar
 *
 * 1. **Nothing floats.** Every trunk is a full-block column to the base plane,
 *    every course of it, and every leaf of a crown touches the trunk or a leaf
 *    that does. Every course of a stack stands on the course below it — never a
 *    ring, which is `floating.isolated` in its oldest clothes.
 * 2. **A walkable cell keeps its two courses of air.** The pad round both
 *    pieces is left clear, which is why the palm crowns start at
 *    {@link PALM_CROWN} rather than at head height and why the pack stack is
 *    two courses at its tallest.
 * 3. **No water.** Neither piece writes a drop. The pack's water lives indoors,
 *    in the curbed basins of `archetypes-caravan.ts`, where its closure is
 *    something this project can prove; a puddle round a prop is a fluid whose
 *    neighbours are whatever terrain happens to be there.
 * 4. **Gravity blocks on the base plane only.** Sand is a gravity block: every
 *    grain of it here is written at `y = 0`, where it has the world under it,
 *    and nowhere else. Nothing above the base plane can fall.
 * 5. **No lanterns by name and no fire.** The lint's lantern rule fires on any
 *    block name ending `lantern`; this file's only glow is `glowstone`, a full
 *    cube standing on the course below it, which is that rule satisfied rather
 *    than dodged. Nothing here is written `lit: "true"`.
 * 6. **No `chain`** — it is not in the pinned 1.21.11 block table. `iron_chain`
 *    is, and where this file hangs anything it hangs it on that, with something
 *    solid directly above.
 * 7. **No sign blocks** — a sign is a block entity this op stream cannot carry.
 *    Carving is `chiseled_sandstone`, which is what carving looks like here.
 * 8. **No `mud`.** Mud is 15/16 of a block and a body cannot stand on it;
 *    `mud_bricks` and `packed_mud` are full cubes and are what the town is made
 *    of anyway.
 * 9. **Determinism.** The only randomness is the scuffing of the ground plane,
 *    drawn from a named stream of the node seed. No wall clock, no
 *    `Math.random`, no transcendental.
 */

import { definePropDescriptors, type PropDescriptor } from "./descriptor.js";
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
export const CARAVAN_PROP_NAMES = ["date_palm_grove", "caravan_pack_stack"] as const;

/** One of the props this file builds. */
export type CaravanPropName = (typeof CARAVAN_PROP_NAMES)[number];

/** True for a name this file answers to. */
export function isCaravanProp(name: string): name is CaravanPropName {
  return (CARAVAN_PROP_NAMES as readonly string[]).includes(name);
}

/* -------------------------------------------------------------------------- */
/* extents                                                                     */
/* -------------------------------------------------------------------------- */

/** The grove's pad, in x and z — three palms and the walk between them. */
export const GROVE_SPAN = 7;
/** Grove height: the ground, the trunks and the crown over the tallest. */
export const GROVE_H = 8;
/** The lowest course a palm crown may occupy — well over a body's head. */
const PALM_CROWN = 4;

/** The stack's pad, in x and z. */
export const PACK_SPAN = 5;
/** Stack height: the ground and two courses of load. */
export const PACK_H = 4;

/** The declared box of one of this file's props, before it is generated. */
export function caravanPropFootprint(
  prop: CaravanPropName,
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
    case "date_palm_grove":
      return ground([GROVE_SPAN, GROVE_H, GROVE_SPAN]);
    case "caravan_pack_stack":
    default:
      return ground([PACK_SPAN, PACK_H, PACK_SPAN]);
  }
}

/** Build a `PropMeta` from the declared footprint, so the two cannot drift. */
function metaOf(prop: CaravanPropName, params: Readonly<Record<string, unknown>>): PropMeta {
  const foot = caravanPropFootprint(prop, params);
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

/** A bottom slab, standing on the block under it. */
const SLAB_BOTTOM: Record<string, string> = { type: "bottom", waterlogged: "false" };

/** Palm leaves that stay put: no decay check, no water. */
const LEAVES: Record<string, string> = { distance: "1", persistent: "true", waterlogged: "false" };

/* -------------------------------------------------------------------------- */
/* the ground                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The **watered ground** under a grove — sand, grit and the green a spring
 * makes, all of them full cubes.
 */
function oasisGround(x: number, z: number, scuff: number): string {
  const k = (x * 7 + z * 13 + scuff) % 11;
  if (k === 0) return "sand";
  if (k === 1) return "coarse_dirt";
  if (k === 2) return "sandstone";
  if (k === 3) return "gravel";
  return "grass_block";
}

/** The **beaten ground** of a camp — sand, grit and dust, and nothing growing. */
function campGround(x: number, z: number, scuff: number): string {
  const k = (x * 11 + z * 5 + scuff) % 9;
  if (k === 0 || k === 1) return "gravel";
  if (k === 2) return "coarse_dirt";
  if (k === 3) return "sandstone";
  return "sand";
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

/** The sacks a caravan carries, drawn from position — all of them full cubes. */
const SACKS = [
  "orange_terracotta",
  "yellow_terracotta",
  "red_terracotta",
  "brown_terracotta",
] as const;

/* -------------------------------------------------------------------------- */
/* the date palm grove                                                         */
/* -------------------------------------------------------------------------- */

/**
 * `date_palm_grove` — three palms and the bed they are watered in.
 *
 * The **trunks** are `jungle_log` — the game's tallest, straightest trunk block
 * — written as full columns to the base plane, every course of them. A trunk
 * with a gap in it is three floating logs and a stump.
 *
 * The **crowns** are a plus of `jungle_leaves` round the head of each trunk with
 * one leaf capping it, so every leaf touches the trunk directly and none of them
 * depends on another leaf's support. `persistent: "true"` is not decoration: a
 * leaf block without it checks for a log within its decay distance on the first
 * block tick and vanishes when the answer is no, which is how a grove becomes
 * three poles overnight.
 *
 * The three are **different heights**, drawn from position, because three palms
 * of one height read as a fence.
 *
 * The **bed** is a kerb of sandstone slabs round their feet — low enough that a
 * body steps over it, which is rule 2 applied to a kerb.
 */
const datePalmGrove: PropGenerator = (ctx) => {
  const { put, palette } = ctx;
  const scuff = ctx.rng("grove.ground").int(0, 10);
  surface(put, 0, GROVE_SPAN, GROVE_SPAN, (x, z) => oasisGround(x, z, scuff));

  /** The three palms: position, and how tall each one stands. */
  const palms = [
    [1, 1, 5],
    [5, 2, 4],
    [3, 5, 6],
  ] as const;

  for (const [px, pz, top] of palms) {
    for (let y = 1; y <= top; y++) put(px, y, pz, "jungle_log", { axis: "y" });
    // The crown: a plus round the trunk head, and one leaf over it. Every one
    // of them touches the trunk itself — which is why the crown sits at the
    // trunk's own top course and never at a course the trunk did not reach.
    const crown = top;
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const lx = px + dx;
      const lz = pz + dz;
      if (lx < 0 || lx >= GROVE_SPAN || lz < 0 || lz >= GROVE_SPAN) continue;
      put(lx, crown, lz, "jungle_leaves", LEAVES);
    }
    put(px, crown + 1, pz, "jungle_leaves", LEAVES);
  }

  // The watered bed: a kerb round the feet of the grove, one course, stepped
  // over rather than walked into.
  for (const [kx, kz] of [
    [2, 1],
    [1, 2],
    [4, 2],
    [5, 3],
    [2, 5],
    [4, 5],
  ] as const) {
    put(kx, 1, kz, palette.stoneSlab, SLAB_BOTTOM);
  }

  return { ops: NO_OPS, meta: metaOf("date_palm_grove", ctx.params) };
};

/* -------------------------------------------------------------------------- */
/* the pack stack                                                              */
/* -------------------------------------------------------------------------- */

/**
 * `caravan_pack_stack` — a caravan's load, off the animals for the night.
 *
 * Everything in it stands on the course below it: the **bales** of `hay_block`
 * and the **sacks** of coloured terracotta at `y = 1` on the base plane, the
 * second course only where there is a first course under it, the **jars**
 * (`cauldron`, the block the game already means by a vessel) beside them and
 * the **rolled tent** — a stripped log lying along x — over the bales it is
 * strapped to.
 *
 * The glow is one `glowstone` bedded in the stack: a camp with a light in it
 * reads as a camp somebody is in, and a full cube of it standing on a bale has
 * no support rule left to fail.
 *
 * Deliberately **low**: two courses at its tallest, so it is a thing a body
 * walks round on flat ground rather than a wall a lane runs into.
 */
const caravanPackStack: PropGenerator = (ctx) => {
  const { put, palette } = ctx;
  const scuff = ctx.rng("pack.ground").int(0, 10);
  surface(put, 0, PACK_SPAN, PACK_SPAN, (x, z) => campGround(x, z, scuff));

  const mid = Math.floor(PACK_SPAN / 2);

  // The first course: bales and sacks in an L, so the stack has a face and a
  // side rather than being a block.
  const base = [
    [1, 1],
    [2, 1],
    [3, 1],
    [1, 2],
  ] as const;
  for (const [bx, bz] of base) {
    const k = (bx * 3 + bz + scuff) % 3;
    if (k === 0) put(bx, 1, bz, "hay_block", { axis: "y" });
    else put(bx, 1, bz, SACKS[(bx + bz + scuff) % SACKS.length] as string);
  }

  // The second course, only over the first: the strapped bales and the light.
  put(2, 2, 1, "hay_block", { axis: "y" });
  put(1, 2, 1, "glowstone");

  // The rolled tent, lying along x over the bales it is strapped to.
  put(3, 2, 1, palette.stripped, { axis: "x" });

  // The jars, on the ground beside the load where a hand reaches them.
  put(mid, 1, mid + 1, "cauldron");
  put(1, 1, mid + 1, "cauldron");

  // The saddle stone: one carved block, which is where the carving in this
  // pack goes now that no prop may carry a sign.
  put(PACK_SPAN - 2, 1, PACK_SPAN - 2, "chiseled_sandstone");

  return { ops: NO_OPS, meta: metaOf("caravan_pack_stack", ctx.params) };
};

/* -------------------------------------------------------------------------- */
/* the registry                                                                */
/* -------------------------------------------------------------------------- */

/** This file's generators, keyed by name; `props.ts` spreads them. */
const CARAVAN_PROP_GENERATORS: Readonly<Record<string, PropGenerator>> = Object.freeze({
  date_palm_grove: datePalmGrove,
  caravan_pack_stack: caravanPackStack,
});

/** The palette symbols this file reads, named so a reader can check them off. */
type CaravanPalette = Pick<PropPalette, "stripped" | "stoneSlab">;

/* -------------------------------------------------------------------------- */
/* descriptors — Phase 4 registry seam (no self-registration)                  */
/* -------------------------------------------------------------------------- */

/**
 * Ordered prop descriptors for this pack — one row per prop in
 * {@link CARAVAN_PROP_NAMES} order. Footprint delegates param-dependently to
 * {@link caravanPropFootprint} (preserving base/minY/piles), generator is the
 * leaf handle from {@link CARAVAN_PROP_GENERATORS}. No voxel/clock change.
 */
export const CARAVAN_PROP_DESCRIPTORS: readonly PropDescriptor[] = definePropDescriptors(
  CARAVAN_PROP_NAMES,
  {
    footprint: (id, params) => caravanPropFootprint(id, params),
    generator: CARAVAN_PROP_GENERATORS,
  },
);
