/**
 * `prop.place@0` — the **Steppe Nomad pack's ground pieces**: the three entries
 * of that pack which stand on the open grass rather than roofing a room.
 *
 * The pack's thesis is that "a Mongol camp", "a steppe horde", "a nomad
 * encampment" all route to the medieval era and arrive as a European village
 * with a `yurt` prop parked outside it. The palette was never the problem —
 * `sun_clay` and `temperate_timber` have both shipped since the founding waves
 * — it is the **noun set**, and three of those nouns have no inside at all:
 *
 * - `khan_banner_pole` — the *tug*: the horsetail standard on its pole, the
 *   one object in the pack that says *whose* camp this is. The cheapest icon
 *   in the pack and the one a stranger reads first;
 * - `shaman_ovoo` — the *ovoo*: the heaped stone cairn at a pass or a ridge,
 *   with the ribbon poles round it a traveller walks three times sunwise;
 * - `balbal_stone` — the *balbal*: the carved ancestor stone standing over a
 *   grave, face to the east.
 *
 * ## The contract, and why this file is a leaf
 *
 * `props-norse.ts` is this file's model in every respect: it imports **types**
 * from `props.ts` and no values at all, so the one edge `props.ts` → here can
 * never become a module-initialisation cycle. Node-local coordinates, `y = 0`
 * is the base plane, block **names** with a property map, and every op inside
 * the declared box so `rotateOps` needs no special case.
 *
 * ## The rules every prop here obeys — each one somebody else's scar
 *
 * 1. **Nothing floats.** The physics lint's `floating.*` family fires on a
 *    full cube with six air faces. Every pole here is a full-block column down
 *    to the base plane, every course of it, and every heaped course of the
 *    ovoo is a *filled* rect standing on the filled rect below it — never a
 *    ring, which is `floating.isolated` in its oldest clothes.
 * 2. **A walkable cell keeps its two courses of air.** The apron round the
 *    banner pole, the walk round the ovoo's foot and the ground round the
 *    balbal all leave `y + 1` **and** `y + 2` clear over solid non-water
 *    floor. That is why the tug's horsetail spreads at `y = 6` and the ovoo's
 *    ribbon lines run at `y = 4` — a rope at head height is a rope through
 *    somebody's face.
 * 3. **No `mud`.** Mud is 15/16 of a block and a body cannot stand on it, so a
 *    camp floored in it is a camp you can only look at. The trodden steppe
 *    here is `coarse_dirt`, `grass_block`, `gravel` and `rooted_dirt`, all of
 *    which are full cubes and all of which look like the thing anyway.
 * 4. **Gravity blocks on floors only.** The ovoo's gravel and the pole's
 *    packed base are written on the base plane or on a course standing
 *    directly on a block of their own; nothing here drops gravel into air.
 * 5. **No lanterns by name.** The lint's lantern rule fires on any block name
 *    ending `lantern` and wants a floor under it or a chain over it. Nothing
 *    in this file glows, which is what a cairn and a grave marker are after
 *    dark.
 * 6. **No `chain`** — it is not in the pinned 1.21.11 block table. Every
 *    hanging line and every ribbon here is `iron_bars` or the palette's own
 *    `log`/`slab`.
 * 7. **No sign blocks** — a sign is a block entity this op stream cannot
 *    carry. The balbal's carved face is `chiseled_stone_bricks`, which is what
 *    carving looks like in this medium.
 * 8. **Determinism.** The only randomness is the scuffing of the ground plane,
 *    drawn from a named stream of the node seed. No wall clock, no
 *    `Math.random`, no transcendental.
 */

import { definePropDescriptors } from "./descriptor.js";
import type { PropDescriptor } from "./descriptor.js";
import type { LocalVoxelOp } from "./core.js";
import type { PropBase, PropContext, PropGenerator, PropMeta, PropPalette } from "./props.js";

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
export const STEPPE_PROP_NAMES = ["khan_banner_pole", "shaman_ovoo", "balbal_stone"] as const;

/** One of the props this file builds. */
export type SteppePropName = (typeof STEPPE_PROP_NAMES)[number];

/** True for a name this file answers to. */
export function isSteppeProp(name: string): name is SteppePropName {
  return (STEPPE_PROP_NAMES as readonly string[]).includes(name);
}

/* -------------------------------------------------------------------------- */
/* extents                                                                     */
/* -------------------------------------------------------------------------- */

/** The banner pole's pad, in x and z — the packed base and standing room. */
export const TUG_SPAN = 5;
/** Tug height: the ground, the base, the pole, the horsetail and the point. */
const TUG_H = 8;
/** The course the horsetail standard spreads at — well over head height. */
export const TUG_SPREAD = 6;

/** The ovoo's pad, in x and z. */
export const OVOO_SPAN = 7;
/** Ovoo height: the ground, three heaped courses, the apex and the ribbons. */
const OVOO_H = 6;
/** The course the ribbon lines are strung at — over head height. */
export const OVOO_RIBBON = 4;

/** The balbal's pad, in x and z — the stone and a cell of standing room. */
export const BALBAL_SPAN = 3;
/** Balbal height: the ground, three courses of stone and the cap. */
const BALBAL_H = 5;

/** The declared box of one of this file's props, before it is generated. */
export function steppePropFootprint(
  prop: SteppePropName,
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
    case "khan_banner_pole":
      return ground([TUG_SPAN, TUG_H, TUG_SPAN]);
    case "shaman_ovoo":
      return ground([OVOO_SPAN, OVOO_H, OVOO_SPAN]);
    case "balbal_stone":
    default:
      return ground([BALBAL_SPAN, BALBAL_H, BALBAL_SPAN]);
  }
}

/** Build a `PropMeta` from the declared footprint, so the two cannot drift. */
function metaOf(prop: SteppePropName, params: Readonly<Record<string, unknown>>): PropMeta {
  const foot = steppePropFootprint(prop, params);
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

/** A run of bars along x — a ribbon line, a rope. */
const BARS_X: Record<string, string> = {
  east: "true",
  north: "false",
  south: "false",
  waterlogged: "false",
  west: "true",
};

/** A run of bars along z. */
const BARS_Z: Record<string, string> = {
  east: "false",
  north: "true",
  south: "true",
  waterlogged: "false",
  west: "false",
};

/** A bare post of bars — a hanging strand, the corner of a run. */
const BARS_POST: Record<string, string> = {
  east: "false",
  north: "false",
  south: "false",
  waterlogged: "false",
  west: "false",
};

/** A bottom slab, standing on the block under it. */
const SLAB_BOTTOM: Record<string, string> = { type: "bottom", waterlogged: "false" };

/* -------------------------------------------------------------------------- */
/* the ground                                                                  */
/* -------------------------------------------------------------------------- */

/** The **short dry grass** of the open steppe. */
function steppe(x: number, z: number, scuff: number): string {
  const k = (x * 7 + z * 13 + scuff) % 11;
  if (k === 0) return "coarse_dirt";
  if (k === 1) return "gravel";
  if (k === 2) return "rooted_dirt";
  return "grass_block";
}

/** The **trodden ground** of a camp or a pass — deliberately not `mud`. */
function trodden(x: number, z: number, scuff: number): string {
  const k = (x * 11 + z * 5 + scuff) % 9;
  if (k === 0 || k === 1) return "gravel";
  if (k === 2) return "cobblestone";
  if (k === 3 || k === 4) return "grass_block";
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
/* the tug                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * `khan_banner_pole` — the *tug*, the horsetail standard on its pole.
 *
 * The **base** is a single course of packed stone over the middle nine cells
 * of the pad, which keeps the whole ring of the pad walkable and gives the
 * pole a foot that is not the bare grass. The **pole** is a full-block column
 * of the theme's log standing on that base, every course of it, so nothing in
 * this prop has air underneath it.
 *
 * The **horsetail** is the read, and it is the reason {@link TUG_SPREAD} is
 * six rather than three: the standard spreads as four slabs cantilevered off
 * the pole's head, with a strand of `iron_bars` hanging under each of them,
 * and a strand at `y = 2` would be a rope in the face of anyone walking up to
 * it. At six the whole pad stays walkable and the tug is still the tallest
 * thing in the camp.
 *
 * The **point** on top is a slab, so the head of the pole is not a full cube
 * and the silhouette narrows the way a spear does.
 */
const khanBannerPole: PropGenerator = (ctx) => {
  const { put, palette } = ctx;
  const scuff = ctx.rng("tug.ground").int(0, 10);
  surface(put, 0, TUG_SPAN, TUG_SPAN, (x, z) => trodden(x, z, scuff));

  const mid = Math.floor(TUG_SPAN / 2);

  // The packed base: one course, standing on the base plane, steppable at its
  // edges because a body walks right up to a standard.
  for (let z = mid - 1; z <= mid + 1; z++) {
    for (let x = mid - 1; x <= mid + 1; x++) {
      if (x === mid && z === mid) continue; // the pole's own cell
      put(x, 1, z, palette.stoneSlab, SLAB_BOTTOM);
    }
  }

  // The pole: a full column, every course, from the ground up.
  for (let y = 1; y <= TUG_SPREAD - 1; y++) put(mid, y, mid, palette.log, { axis: "y" });

  // The horsetail: four slabs cantilevered off the pole's head, each one
  // touching the pole, with a strand hanging under it.
  put(mid, TUG_SPREAD, mid, palette.stripped, { axis: "y" });
  for (const [dx, dz] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const) {
    put(mid + dx, TUG_SPREAD, mid + dz, palette.slab, SLAB_BOTTOM);
    put(mid + dx, TUG_SPREAD - 1, mid + dz, "iron_bars", BARS_POST);
  }

  // The point.
  put(mid, TUG_SPREAD + 1, mid, palette.stoneSlab, SLAB_BOTTOM);

  return { ops: NO_OPS, meta: metaOf("khan_banner_pole", ctx.params) };
};

/* -------------------------------------------------------------------------- */
/* the ovoo                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * `shaman_ovoo` — the heaped stone cairn with its ribbon poles.
 *
 * The **cairn** is built the way every mass in this project is built: a
 * *filled* course standing on the filled course below it, insetting one cell
 * per course, never a ring and never hollow. A ring per course leaves its
 * outermost cells with air below and beside them, which is `floating.isolated`
 * in its oldest clothes; a hollow course is a sealed pocket besides.
 *
 * The **four ribbon poles** stand at the corners of the pad — full-block
 * columns down to the ground, so every course of them has a block below it —
 * and the **ribbon lines** run between their heads round the whole ring at
 * {@link OVOO_RIBBON}. `iron_bars`, never `chain`, and four courses up rather
 * than two, because the point of an ovoo is that a traveller walks round it
 * three times and a line at head height stops him doing it.
 *
 * The apex is a slab: a cairn is heaped, not built, and a flat top of full
 * cubes reads as masonry.
 */
const shamanOvoo: PropGenerator = (ctx) => {
  const { put, palette } = ctx;
  const scuff = ctx.rng("ovoo.ground").int(0, 10);
  surface(put, 0, OVOO_SPAN, OVOO_SPAN, (x, z) => steppe(x, z, scuff));

  const mid = Math.floor(OVOO_SPAN / 2);

  // The cairn: filled courses, each one standing whole on the one below it.
  for (let y = 1; y <= 3; y++) {
    const r = 3 - y;
    for (let z = mid - r; z <= mid + r; z++) {
      for (let x = mid - r; x <= mid + r; x++) {
        if (x < 1 || z < 1 || x > OVOO_SPAN - 2 || z > OVOO_SPAN - 2) continue;
        const k = (x + z + y + scuff) % 5;
        put(x, y, z, k === 0 ? "cobblestone" : k === 1 ? "gravel" : palette.stone);
      }
    }
  }
  // The apex, heaped rather than built.
  put(mid, 4, mid, palette.stoneSlab, SLAB_BOTTOM);

  // The four ribbon poles, at the pad's corners, full columns to the ground.
  const corners = [
    [0, 0],
    [0, OVOO_SPAN - 1],
    [OVOO_SPAN - 1, 0],
    [OVOO_SPAN - 1, OVOO_SPAN - 1],
  ] as const;
  for (const [px, pz] of corners) {
    for (let y = 1; y <= OVOO_RIBBON - 1; y++) put(px, y, pz, palette.log, { axis: "y" });
    put(px, OVOO_RIBBON, pz, palette.log, { axis: "y" });
  }

  // The ribbon lines, strung round the ring between the poles' heads.
  for (let x = 1; x < OVOO_SPAN - 1; x++) {
    for (const z of [0, OVOO_SPAN - 1]) put(x, OVOO_RIBBON, z, "iron_bars", BARS_X);
  }
  for (let z = 1; z < OVOO_SPAN - 1; z++) {
    for (const x of [0, OVOO_SPAN - 1]) put(x, OVOO_RIBBON, z, "iron_bars", BARS_Z);
  }

  return { ops: NO_OPS, meta: metaOf("shaman_ovoo", ctx.params) };
};

/* -------------------------------------------------------------------------- */
/* the balbal                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * `balbal_stone` — the carved ancestor stone over a grave.
 *
 * The smallest piece in the pack and deliberately so: a *balbal* is one shaped
 * stone, roughly a person's height, with a face cut into it and a bowl held at
 * its waist. It is a **full-block column** of the theme's stone standing on the
 * base plane, three courses of it, with the middle course written as
 * `chiseled_stone_bricks` — that band *is* the face, and it is the only thing
 * that separates this from a boundary marker.
 *
 * The **cap** is a slab so the head rounds off, and the two **kerb stones** sit
 * at one course on the diagonal, low enough that a body steps over them: a
 * grave marker a stranger cannot walk up to is a grave marker nobody looks at
 * twice.
 */
const balbalStone: PropGenerator = (ctx) => {
  const { put, palette } = ctx;
  const scuff = ctx.rng("balbal.ground").int(0, 10);
  surface(put, 0, BALBAL_SPAN, BALBAL_SPAN, (x, z) => steppe(x, z, scuff));

  const mid = Math.floor(BALBAL_SPAN / 2);

  put(mid, 1, mid, palette.stone);
  put(mid, 2, mid, "chiseled_stone_bricks");
  put(mid, 3, mid, palette.stoneAccent);
  put(mid, 4, mid, palette.stoneSlab, SLAB_BOTTOM);

  for (const [kx, kz] of [
    [mid - 1, mid - 1],
    [mid + 1, mid + 1],
  ] as const) {
    put(kx, 1, kz, palette.stoneSlab, SLAB_BOTTOM);
  }

  return { ops: NO_OPS, meta: metaOf("balbal_stone", ctx.params) };
};

/* -------------------------------------------------------------------------- */
/* the registry                                                                */
/* -------------------------------------------------------------------------- */

/** This file's generators, keyed by name; `props.ts` spreads them. */
const STEPPE_PROP_GENERATORS: Readonly<Record<string, PropGenerator>> = Object.freeze({
  khan_banner_pole: khanBannerPole,
  shaman_ovoo: shamanOvoo,
  balbal_stone: balbalStone,
});
/* -------------------------------------------------------------------------- */
/* descriptor seam — Phase 4 (no self-registration)                           */
/* -------------------------------------------------------------------------- */

/**
 * Ordered prop descriptors for this leaf — delegates to existing footprint and
 * generator handles. Insertion order follows `STEPPE_PROP_NAMES` (catalog
 * order). Footprint is a param-dependent function (currently param-independent
 * but preserves the signature); generator is a leaf handle; no voxel/behavior
 * change. No self-registration.
 */
export const STEPPE_PROP_DESCRIPTORS: readonly PropDescriptor[] =
  definePropDescriptors<SteppePropName, PropContext>(STEPPE_PROP_NAMES, {
    footprint: (id, params) => steppePropFootprint(id, params),
    generator: STEPPE_PROP_GENERATORS,
  });

/** The palette symbols this file reads, named so a reader can check them off. */
type SteppePalette = Pick<
  PropPalette,
  "log" | "stripped" | "slab" | "stone" | "stoneAccent" | "stoneSlab"
>;
