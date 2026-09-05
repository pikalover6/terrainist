/**
 * `prop.place@0` — the **himalayan_monastery pack's ground pieces**: the two
 * entries of that pack which stand on the bare ground rather than roofing a
 * room.
 *
 * The pack's thesis is that "a mountain monastery", "a dzong" and "a lamasery on
 * a ridge" all route to the `medieval` era and arrive as a European abbey in
 * stone. The palette was never the problem — the deepslate family has shipped
 * since the founding waves — it is the **noun set**, and two of those nouns have
 * no inside at all:
 *
 * - `prayer_flag_line` — the lung ta: two timber poles with the flags strung
 *   between them, in the five colours and in order;
 * - `mani_stone_cairn` — the carved stones a pilgrim adds one to: a cairn on a
 *   scuffed pad, with the carved faces set into it.
 *
 * ## The contract, and why this file is a leaf
 *
 * `props-caravan.ts` is this file's model in every respect: it imports **types**
 * from `props.ts` and no values at all, so the one edge `props.ts` → here can
 * never become a module-initialisation cycle. Node-local coordinates, `y = 0` is
 * the base plane, block **names** with a property map, and every op inside the
 * declared box so `rotateOps` needs no special case.
 *
 * ## The rules every prop here obeys — each one somebody else's scar
 *
 * 1. **NOTHING FLOATS, and the flag line is the whole reason that is in capitals.**
 *    A prayer flag line is the single most obvious thing in this pack to build
 *    wrong: the picture in everybody's head is bunting sagging through the air
 *    between two poles, and every cell of that sag is `floating.isolated`. So
 *    the line here is a **run of full-cube wool at one course**, unbroken from
 *    pole to pole — every flag block touches the flag block beside it, and the
 *    run terminates on a pole column that runs to the base plane. No banner
 *    block, no attachable, no gap. A flag you can walk under and never one you
 *    can walk through.
 * 2. **A walkable cell keeps its two courses of air.** The line is strung at
 *    {@link FLAG_COURSE}, well over a body's head, and the cairn is three
 *    courses at its tallest with the pad round it left clear.
 * 3. **No water.** Neither piece writes a drop. The pack's water lives indoors,
 *    in the curbed basins of `archetypes-himalayan.ts`, where its closure is
 *    something this project can prove; a puddle round a prop is a fluid whose
 *    neighbours are whatever terrain happens to be there.
 * 4. **Gravity blocks on the base plane only.** Every grain of gravel here is
 *    written at `y = 0`, where it has the world under it, and nowhere else.
 *    Nothing above the base plane can fall.
 * 5. **No lanterns by name and no fire.** The lint's lantern rule fires on any
 *    block name ending `lantern`; this file's only glow is `glowstone`, a full
 *    cube standing on the course below it, which is that rule satisfied rather
 *    than dodged. Nothing here is written `lit: "true"`.
 * 6. **No `chain`** — it is not in the pinned 1.21.11 block table, and neither
 *    piece hangs anything in the first place.
 * 7. **No sign blocks** — a sign is a block entity this op stream cannot carry.
 *    Carving is `chiseled_deepslate`, which is what carving looks like here.
 * 8. **No `snow` and no `mud`.** Both are partial blocks a body cannot stand on
 *    the way it stands on a full cube; the white here is `calcite` and the
 *    ground is honest stone and grit.
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
export const HIMALAYAN_PROP_NAMES = ["prayer_flag_line", "mani_stone_cairn"] as const;

/** One of the props this file builds. */
export type HimalayanPropName = (typeof HIMALAYAN_PROP_NAMES)[number];

/** True for a name this file answers to. */
export function isHimalayanProp(name: string): name is HimalayanPropName {
  return (HIMALAYAN_PROP_NAMES as readonly string[]).includes(name);
}

/* -------------------------------------------------------------------------- */
/* extents                                                                     */
/* -------------------------------------------------------------------------- */

/** The flag line's pad, in x — pole, run, pole. */
export const FLAG_SPAN = 9;
/** The flag line's depth: the poles and the ground they stand on. */
export const FLAG_DEPTH = 3;
/** Flag line height: the ground, the poles and the run over them. */
export const FLAG_H = 7;
/** The course the flags are strung at — well over a body's head. */
export const FLAG_COURSE = 5;

/** The cairn's pad, in x and z. */
export const CAIRN_SPAN = 5;
/** Cairn height: the ground and three courses of stone. */
export const CAIRN_H = 5;

/** The declared box of one of this file's props, before it is generated. */
export function himalayanPropFootprint(
  prop: HimalayanPropName,
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
    case "prayer_flag_line":
      return ground([FLAG_SPAN, FLAG_H, FLAG_DEPTH]);
    case "mani_stone_cairn":
    default:
      return ground([CAIRN_SPAN, CAIRN_H, CAIRN_SPAN]);
  }
}

/** Build a `PropMeta` from the declared footprint, so the two cannot drift. */
function metaOf(prop: HimalayanPropName, params: Readonly<Record<string, unknown>>): PropMeta {
  const foot = himalayanPropFootprint(prop, params);
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

/* -------------------------------------------------------------------------- */
/* the ground                                                                  */
/* -------------------------------------------------------------------------- */

/** The **ridge ground** — thin turf over stone and grit, all of it full cubes. */
function ridgeGround(x: number, z: number, scuff: number): string {
  const k = (x * 7 + z * 13 + scuff) % 11;
  if (k === 0) return "gravel";
  if (k === 1) return "stone";
  if (k === 2) return "cobbled_deepslate";
  if (k === 3) return "coarse_dirt";
  return "grass_block";
}

/** The **worn ground** of a much-walked cairn: grit, stone and no green at all. */
function caimGround(x: number, z: number, scuff: number): string {
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
 * The five colours of a lung ta, **in order**, because the order is the whole
 * point of the object: blue, white, red, green, yellow, and round again.
 *
 * Wool, and full cubes every one of them: see rule 1. A banner is an attachable
 * block entity, and a run of them strung across air is exactly the defect this
 * prop exists to avoid.
 */
const LUNG_TA = ["blue_wool", "white_wool", "red_wool", "green_wool", "yellow_wool"] as const;

/* -------------------------------------------------------------------------- */
/* the prayer flag line                                                        */
/* -------------------------------------------------------------------------- */

/**
 * `prayer_flag_line` — the lung ta, strung between two poles.
 *
 * The **poles** are full columns of the theme's stripped log to the base plane,
 * every course of them: a pole with a gap in it is three floating logs and a
 * stump. They stand at the two ends of the pad, and each is guyed by a low kerb
 * of slabs at its foot so a lane reads it as a thing planted rather than a thing
 * dropped.
 *
 * The **line** is an unbroken run of wool at {@link FLAG_COURSE}, from the top
 * of one pole to the top of the other. Every block of it touches the block
 * beside it and the run terminates on a pole; there is no sag, no gap and no
 * attachable anywhere in it, which is rule 1 in one sentence. It is strung well
 * over a body's head, so the cells under it keep their two courses of air.
 *
 * The **cairn stone** at the foot of one pole is a `chiseled_deepslate` block —
 * the carving, since no prop may carry a sign — and the one `glowstone` beside
 * it is the butter lamp somebody left.
 */
const prayerFlagLine: PropGenerator = (ctx) => {
  const { put, palette } = ctx;
  const scuff = ctx.rng("flags.ground").int(0, 10);
  surface(put, 0, FLAG_SPAN, FLAG_DEPTH, (x, z) => ridgeGround(x, z, scuff));

  const mz = Math.floor(FLAG_DEPTH / 2);
  const poles = [1, FLAG_SPAN - 2] as const;

  // The poles: unbroken columns to the base plane, up past the flag course.
  for (const px of poles) {
    for (let y = 1; y <= FLAG_COURSE; y++) put(px, y, mz, palette.stripped, { axis: "y" });
    // The guy kerb at the foot — low enough that a body steps over it.
    put(px, 1, mz - 1, palette.stoneSlab, SLAB_BOTTOM);
    put(px, 1, mz + 1, palette.stoneSlab, SLAB_BOTTOM);
  }

  // The line itself: an unbroken run at one course, pole to pole.
  for (let x = poles[0]; x <= poles[1]; x++) {
    put(x, FLAG_COURSE, mz, LUNG_TA[(x - poles[0]) % LUNG_TA.length] as string);
  }
  // The pennant course over the middle of the run, standing on the run itself:
  // a second, shorter line, so the object reads as bunting rather than a beam.
  for (let x = poles[0] + 2; x <= poles[1] - 2; x++) {
    put(x, FLAG_COURSE + 1, mz, LUNG_TA[(x + 2) % LUNG_TA.length] as string);
  }

  // The pilgrim's stone and the lamp at the foot of the near pole.
  put(poles[0], 1, mz + 1, "chiseled_deepslate");
  put(poles[1], 1, mz - 1, "glowstone");

  return { ops: NO_OPS, meta: metaOf("prayer_flag_line", ctx.params) };
};

/* -------------------------------------------------------------------------- */
/* the mani stone cairn                                                        */
/* -------------------------------------------------------------------------- */

/**
 * `mani_stone_cairn` — the carved stones a pilgrim adds one to.
 *
 * Everything in it stands on the course below it: the **base ring** of cobbled
 * deepslate at `y = 1`, the **shoulder** written only where there is a base
 * course under it, and the **cap stone** on the middle of the shoulder. That is
 * a cairn built the way a dome is built — filled, and stepping in — for exactly
 * the same reason: a ring per course leaves its outermost stones with air below
 * and beside them.
 *
 * The **carved faces** are `chiseled_deepslate` set into the base ring, which is
 * where the carving in this pack goes now that no prop may carry a sign, and the
 * **whitewash** is one `calcite` block among them.
 *
 * Deliberately **low**: three courses at its tallest, so it is a thing a body
 * walks round on flat ground rather than a wall a lane runs into.
 */
const maniStoneCairn: PropGenerator = (ctx) => {
  const { put, palette } = ctx;
  const scuff = ctx.rng("cairn.ground").int(0, 10);
  surface(put, 0, CAIRN_SPAN, CAIRN_SPAN, (x, z) => caimGround(x, z, scuff));

  const mid = Math.floor(CAIRN_SPAN / 2);

  // The base: a filled 3x3 at y = 1, with the carved faces and the whitewash
  // set into it by position.
  for (let z = mid - 1; z <= mid + 1; z++) {
    for (let x = mid - 1; x <= mid + 1; x++) {
      const k = (x * 3 + z + scuff) % 5;
      const block = k === 0 ? "chiseled_deepslate" : k === 1 ? "calcite" : "cobbled_deepslate";
      put(x, 1, z, block);
    }
  }

  // The shoulder: a filled plus at y = 2, every cell of it over a base cell.
  for (const [dx, dz] of [
    [0, 0],
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const) {
    put(mid + dx, 2, mid + dz, (dx + dz) % 2 === 0 ? "cobbled_deepslate" : "deepslate_bricks");
  }

  // The cap, on the middle of the shoulder.
  put(mid, 3, mid, "chiseled_deepslate");

  // The offering kerb round the foot — low enough to step over.
  for (const [kx, kz] of [
    [mid - 2, mid],
    [mid + 2, mid],
    [mid, mid - 2],
    [mid, mid + 2],
  ] as const) {
    put(kx, 1, kz, palette.stoneSlab, SLAB_BOTTOM);
  }

  return { ops: NO_OPS, meta: metaOf("mani_stone_cairn", ctx.params) };
};

/* -------------------------------------------------------------------------- */
/* the registry                                                                */
/* -------------------------------------------------------------------------- */

/** This file's generators, keyed by name; `props.ts` spreads them. */
const HIMALAYAN_PROP_GENERATORS: Readonly<Record<string, PropGenerator>> = Object.freeze({
  prayer_flag_line: prayerFlagLine,
  mani_stone_cairn: maniStoneCairn,
});

/** The palette symbols this file reads, named so a reader can check them off. */
type HimalayanPalette = Pick<PropPalette, "stripped" | "stoneSlab">;

/* -------------------------------------------------------------------------- */
/* descriptors — Phase 4 registry seam (no self-registration)                  */
/* -------------------------------------------------------------------------- */

/**
 * Ordered prop descriptors for this pack — one row per prop in
 * {@link HIMALAYAN_PROP_NAMES} order. Footprint delegates param-dependently to
 * {@link himalayanPropFootprint} (preserving base/minY/piles), generator is the
 * leaf handle from {@link HIMALAYAN_PROP_GENERATORS}. No voxel/clock change.
 */
export const HIMALAYAN_PROP_DESCRIPTORS: readonly PropDescriptor[] = definePropDescriptors(
  HIMALAYAN_PROP_NAMES,
  {
    footprint: (id, params) => himalayanPropFootprint(id, params),
    generator: HIMALAYAN_PROP_GENERATORS,
  },
);
