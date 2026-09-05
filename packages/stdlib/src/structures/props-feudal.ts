/**
 * `prop.place@0` — the **feudal_japanese pack's ground pieces**: the three
 * entries of that pack which stand on the bare ground rather than roofing a
 * room.
 *
 * The pack's thesis is that "a samurai castle town", "a Sengoku village" and
 * "an Edo street" all route to the `medieval` era and arrive as a European
 * market town. The palette was never the problem — dark oak, spruce and the
 * quartz family have shipped since the founding waves — it is the **noun set**,
 * and three of those nouns have no inside at all:
 *
 * - `toro_lantern` — the stone lantern of a garden or an approach: a plinth, a
 *   shaft, the firebox with the glow in it and the cap over that;
 * - `koi_pond` — the garden pond: a **complete curb ring first**, the still
 *   water inside it, and the island stone standing out of the middle;
 * - `nobori_banner_line` — the war banners at a gate: upright poles with the
 *   cloth run up the side of each one, every block of it touching the pole.
 *
 * ## The contract, and why this file is a leaf
 *
 * `props-himalayan.ts` is this file's model in every respect: it imports
 * **types** from `props.ts` and no values at all, so the one edge `props.ts` →
 * here can never become a module-initialisation cycle. Node-local coordinates,
 * `y = 0` is the base plane, block **names** with a property map, and every op
 * inside the declared box so `rotateOps` needs no special case.
 *
 * ## The rules every prop here obeys — each one somebody else's scar
 *
 * 1. **NOTHING FLOATS, and the banner line is the whole reason that is in
 *    capitals.** A nobori is the single most obvious thing in this pack to build
 *    wrong: the picture in everybody's head is a cloth hanging in the air off a
 *    crossbar, and every cell of that hang is `floating.isolated`. So the cloth
 *    here is a **column of full-cube wool run up the side of the pole**, every
 *    block of it touching the pole beside it, and the pole itself is an unbroken
 *    column to the base plane. No banner block, no attachable, no gap.
 * 2. **A walkable cell keeps its two courses of air.** Everything tall here is
 *    a single column a body walks round; nothing spans a cell at head height.
 * 3. **THE POND IS CURBED BEFORE IT IS POURED.** The complete ring of full
 *    blocks goes down first, and only then the water inside it — so every water
 *    cell has water or a full block on all four sides and the ground under it.
 *    That is the swamp pack's `waterlogged_shrine` closure, word for word: a
 *    puddle whose neighbours are whatever terrain happened to be there is a
 *    fluid this project cannot prove.
 * 4. **Gravity blocks on the base plane only.** Every grain of gravel here is
 *    written at `y = 0`, where it has the world under it, and nowhere else.
 *    Nothing above the base plane can fall.
 * 5. **No lanterns by name and no fire.** The lint's lantern rule fires on any
 *    block name ending `lantern`; this file's only glow is `glowstone`, a full
 *    cube standing on the course below it, which is that rule satisfied rather
 *    than dodged. Nothing here is written `lit: "true"`.
 * 6. **No `chain`** — it is not in the pinned 1.21.11 block table, and nothing
 *    here hangs in the first place.
 * 7. **No sign blocks** — a sign is a block entity this op stream cannot carry.
 *    Carving is `chiseled_deepslate`, which is what carving looks like here.
 * 8. **No `snow` and no `mud`.** Both are partial blocks a body cannot stand on
 *    the way it stands on a full cube.
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
export const FEUDAL_PROP_NAMES = ["toro_lantern", "koi_pond", "nobori_banner_line"] as const;

/** One of the props this file builds. */
export type FeudalPropName = (typeof FEUDAL_PROP_NAMES)[number];

/** True for a name this file answers to. */
export function isFeudalProp(name: string): name is FeudalPropName {
  return (FEUDAL_PROP_NAMES as readonly string[]).includes(name);
}

/* -------------------------------------------------------------------------- */
/* extents                                                                     */
/* -------------------------------------------------------------------------- */

/** The stone lantern's pad, in x and z. */
export const TORO_SPAN = 5;
/** Lantern height: the ground, the plinth, the shaft, the firebox and the cap. */
export const TORO_H = 7;

/** The pond's pad, in x and z — the curb ring and the ground round it. */
export const KOI_SPAN = 9;
/** Pond height: the ground, the water plane and the island stone over it. */
export const KOI_H = 5;

/** The banner line's pad, in x — three poles and the ground between them. */
export const NOBORI_SPAN = 9;
/** The banner line's depth: the poles and the ground they stand on. */
export const NOBORI_DEPTH = 3;
/** Banner height: the ground and the poles over it. */
export const NOBORI_H = 8;
/** The course a pole's head reaches. */
export const NOBORI_POLE = 6;

/** The declared box of one of this file's props, before it is generated. */
export function feudalPropFootprint(
  prop: FeudalPropName,
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
    case "toro_lantern":
      return ground([TORO_SPAN, TORO_H, TORO_SPAN]);
    case "koi_pond":
      return ground([KOI_SPAN, KOI_H, KOI_SPAN]);
    case "nobori_banner_line":
    default:
      return ground([NOBORI_SPAN, NOBORI_H, NOBORI_DEPTH]);
  }
}

/** Build a `PropMeta` from the declared footprint, so the two cannot drift. */
function metaOf(prop: FeudalPropName, params: Readonly<Record<string, unknown>>): PropMeta {
  const foot = feudalPropFootprint(prop, params);
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

/** A still source block of water. */
const SOURCE: Record<string, string> = { level: "0" };

/* -------------------------------------------------------------------------- */
/* the ground                                                                  */
/* -------------------------------------------------------------------------- */

/** The **garden ground** — moss and stone under a clipped lawn, all full cubes. */
function gardenGround(x: number, z: number, scuff: number): string {
  const k = (x * 7 + z * 13 + scuff) % 11;
  if (k === 0) return "moss_block";
  if (k === 1) return "stone";
  if (k === 2) return "cobbled_deepslate";
  if (k === 3) return "coarse_dirt";
  return "grass_block";
}

/** The **trodden ground** of a much-walked gate: grit, stone and no green. */
function troddenGround(x: number, z: number, scuff: number): string {
  const k = (x * 11 + z * 5 + scuff) % 9;
  if (k === 0 || k === 1) return "gravel";
  if (k === 2) return "coarse_dirt";
  if (k === 3) return "cobbled_deepslate";
  return "stone";
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

/**
 * The nobori colours — the field a crest is carried on, in full cubes.
 *
 * Wool, and full cubes every one of them: see rule 1. A banner is an attachable
 * block entity, and a cloth strung across air is exactly the defect this prop
 * exists to avoid.
 */
const NOBORI_CLOTH = ["white_wool", "red_wool", "black_wool", "blue_wool"] as const;

/* -------------------------------------------------------------------------- */
/* the stone lantern                                                           */
/* -------------------------------------------------------------------------- */

/**
 * `toro_lantern` — the stone lantern of a garden path.
 *
 * Six courses, **every one standing on the one below it**: the plinth of the
 * theme's stone, the shaft, the platform slab under the firebox, the firebox
 * itself with the `glowstone` in it, and the cap. There is no gap anywhere in
 * the column, which is why the `floating.*` rule has nothing to say about it.
 *
 * The glow is `glowstone` and never a block whose name ends `lantern`: the
 * lint's lantern rule polices support on those, and a full cube bedded between
 * two stone courses is that rule satisfied rather than dodged.
 *
 * The **stepping stones** at its foot are bottom slabs, low enough that a body
 * steps over them, so the object reads as a thing planted on a path rather than
 * a thing dropped on a lawn.
 *
 * Bare `stone_lantern` stays the east-asian pack's, word for word.
 */
const toroLantern: PropGenerator = (ctx) => {
  const { put, palette } = ctx;
  const scuff = ctx.rng("toro.ground").int(0, 10);
  surface(put, 0, TORO_SPAN, TORO_SPAN, (x, z) => gardenGround(x, z, scuff));

  const mid = Math.floor(TORO_SPAN / 2);

  // The column, bottom to top, with no course missing from it.
  put(mid, 1, mid, palette.stone);
  put(mid, 2, mid, "polished_deepslate");
  put(mid, 3, mid, "chiseled_deepslate");
  put(mid, 4, mid, "glowstone");
  put(mid, 5, mid, "chiseled_deepslate");
  put(mid, 6, mid, palette.stoneSlab, SLAB_BOTTOM);

  // The firebox shoulders — each one standing beside the glow, on the shaft's
  // own course, so nothing in them has air under it *and* air beside it.
  for (const [dx, dz] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const) {
    put(mid + dx, 3, mid + dz, palette.stoneSlab, SLAB_BOTTOM);
  }

  // The stepping stones round the foot.
  for (const [kx, kz] of [
    [mid - 2, mid],
    [mid + 2, mid],
    [mid, mid - 2],
    [mid, mid + 2],
  ] as const) {
    put(kx, 1, kz, palette.stoneSlab, SLAB_BOTTOM);
  }

  return { ops: NO_OPS, meta: metaOf("toro_lantern", ctx.params) };
};

/* -------------------------------------------------------------------------- */
/* the koi pond                                                                */
/* -------------------------------------------------------------------------- */

/**
 * `koi_pond` — the garden pond, and this file's one drop of water.
 *
 * **The curb goes down first, whole.** The complete ring of full blocks at
 * radius three is written before a single water cell is, so the pool inside it
 * has nowhere at all to go: every water cell has water or a full block on each
 * of its four sides and the ground plane under it. That ordering is the whole
 * prop — the swamp pack's `waterlogged_shrine` closure, restated, because a
 * pond poured first and curbed afterwards is a fluid whose closure depends on
 * the order two loops happened to run in.
 *
 * The **island stone** stands out of the middle of the water on its own ground
 * course, with a lantern slab on it, and the **bank slabs** outside the curb are
 * low enough to step over.
 *
 * Bare `duck_pond`, `millpond`, `sacred_lake` and `scrying_pool` all stay where
 * they were.
 */
const koiPond: PropGenerator = (ctx) => {
  const { put, palette } = ctx;
  const scuff = ctx.rng("koi.ground").int(0, 10);
  surface(put, 0, KOI_SPAN, KOI_SPAN, (x, z) => gardenGround(x, z, scuff));

  const mid = Math.floor(KOI_SPAN / 2);

  // THE CURB, FIRST AND WHOLE: the complete ring at radius three, full blocks
  // every one, so the pool inside it is closed before it exists.
  for (let z = mid - 3; z <= mid + 3; z++) {
    for (let x = mid - 3; x <= mid + 3; x++) {
      if (Math.abs(x - mid) !== 3 && Math.abs(z - mid) !== 3) continue;
      put(x, 1, z, (x + z + scuff) % 4 === 0 ? "mossy_cobblestone" : palette.stone);
    }
  }

  // The pool: every cell inside the curb but the island's, a still source with
  // the ground under it and a full block or its own water on all four sides.
  for (let z = mid - 2; z <= mid + 2; z++) {
    for (let x = mid - 2; x <= mid + 2; x++) {
      if (x === mid && z === mid) continue; // the island's own cell
      put(x, 1, z, "water", SOURCE);
    }
  }

  // The island, standing out of the water at the middle of it.
  put(mid, 1, mid, palette.stone);
  put(mid, 2, mid, "chiseled_deepslate");
  put(mid, 3, mid, palette.stoneSlab, SLAB_BOTTOM);

  // The bank, outside the curb and low enough to step over.
  for (const [kx, kz] of [
    [mid - 4, mid],
    [mid + 4, mid],
    [mid, mid - 4],
    [mid, mid + 4],
  ] as const) {
    put(kx, 1, kz, palette.stoneSlab, SLAB_BOTTOM);
  }

  return { ops: NO_OPS, meta: metaOf("koi_pond", ctx.params) };
};

/* -------------------------------------------------------------------------- */
/* the banner line                                                             */
/* -------------------------------------------------------------------------- */

/**
 * `nobori_banner_line` — the war banners planted at a gate.
 *
 * The **poles** are full columns of the theme's stripped log to the base plane,
 * every course of them: a pole with a gap in it is three floating logs and a
 * stump.
 *
 * The **cloth** is a column of full-cube wool run **up the side of the pole**,
 * from the second course to the pole's head. Every block of it has the pole
 * orthogonally beside it, so not one is `floating.isolated` — that is rule 1,
 * and it is the reason there is no crossbar and nothing hanging off one. Each
 * pole carries one colour, drawn from position, so a line of three reads as
 * three standards rather than one wall.
 *
 * The **carved marker** at the foot of the middle pole is `chiseled_deepslate`
 * (no prop may carry a sign) with one `glowstone` beside it, bedded on the
 * ground.
 *
 * Bare `flagpole`, `khan_banner_pole` and `jolly_roger_mast` all stay where
 * they were.
 */
const noboriBannerLine: PropGenerator = (ctx) => {
  const { put, palette } = ctx;
  const scuff = ctx.rng("nobori.ground").int(0, 10);
  surface(put, 0, NOBORI_SPAN, NOBORI_DEPTH, (x, z) => troddenGround(x, z, scuff));

  const mz = Math.floor(NOBORI_DEPTH / 2);
  const poles = [1, Math.floor(NOBORI_SPAN / 2), NOBORI_SPAN - 2] as const;

  poles.forEach((px, i) => {
    // The pole: an unbroken column to the base plane.
    for (let y = 1; y <= NOBORI_POLE; y++) put(px, y, mz, palette.stripped, { axis: "y" });
    // The cloth, run up the side of the pole. Every block touches the pole.
    const cloth = NOBORI_CLOTH[i % NOBORI_CLOTH.length] as string;
    const side = i % 2 === 0 ? mz - 1 : mz + 1;
    for (let y = 2; y <= NOBORI_POLE; y++) put(px, y, side, cloth);
    // The guy kerb at the foot, low enough that a body steps over it.
    put(px, 1, mz - 1, palette.stoneSlab, SLAB_BOTTOM);
    put(px, 1, mz + 1, palette.stoneSlab, SLAB_BOTTOM);
  });

  // The marker and the lamp at the foot of the middle pole.
  put(poles[1], 1, mz - 1, "chiseled_deepslate");
  put(poles[1], 1, mz + 1, "glowstone");

  return { ops: NO_OPS, meta: metaOf("nobori_banner_line", ctx.params) };
};

/* -------------------------------------------------------------------------- */
/* the registry                                                                */
/* -------------------------------------------------------------------------- */

/** This file's generators, keyed by name; `props.ts` spreads them. */
const FEUDAL_PROP_GENERATORS: Readonly<Record<string, PropGenerator>> = Object.freeze({
  toro_lantern: toroLantern,
  koi_pond: koiPond,
  nobori_banner_line: noboriBannerLine,
});

/** The palette symbols this file reads, named so a reader can check them off. */
type FeudalPalette = Pick<PropPalette, "stripped" | "stone" | "stoneSlab">;

/* -------------------------------------------------------------------------- */
/* descriptors — Phase 4 registry seam (no self-registration)                  */
/* -------------------------------------------------------------------------- */

/**
 * Ordered prop descriptors for this pack — one row per prop in
 * {@link FEUDAL_PROP_NAMES} order. Footprint delegates param-dependently to
 * {@link feudalPropFootprint} (preserving base/minY/piles), generator is the
 * leaf handle from {@link FEUDAL_PROP_GENERATORS}. No voxel/clock change.
 */
export const FEUDAL_PROP_DESCRIPTORS: readonly PropDescriptor[] = definePropDescriptors(
  FEUDAL_PROP_NAMES,
  {
    footprint: (id, params) => feudalPropFootprint(id, params),
    generator: FEUDAL_PROP_GENERATORS,
  },
);
