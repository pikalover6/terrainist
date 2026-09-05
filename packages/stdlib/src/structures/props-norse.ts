/**
 * `prop.place@0` — the **Nordic & Viking pack's ground pieces**: the three
 * entries of that pack which stand on the open ground rather than roofing a
 * room.
 *
 * The pack's thesis is that "a viking settlement" arrives as a generic
 * medieval village in spruce. What is missing is not the palette — the catalog
 * has had boreal pine since the founding waves — it is the *nouns* a Norse
 * place is made of, and three of them have no inside at all:
 *
 * - `rune_stone` — the carved memorial slab standing on its packed cairn, the
 *   band of carving running round its face. The cheapest icon in the pack and
 *   the one a stranger reads first;
 * - `boat_burial_mound` — the grassed mound with the ship's stem and stern
 *   posts still standing out of it and the kerb of boulders round its foot;
 * - `drying_rack_yard` — the hjell: ranks of split cod hung on a timber frame
 *   above head height, which is what a northern shore actually smells of.
 *
 * ## The contract, and why this file is a leaf
 *
 * `props-frontier.ts` is this file's model in every respect: it imports
 * **types** from `props.ts` and no values at all, so the one edge
 * `props.ts` → here can never become a module-initialisation cycle.
 * Node-local coordinates, `y = 0` is the base plane, block **names** with a
 * property map, and every op inside the declared box so `rotateOps` needs no
 * special case.
 *
 * ## The rules every prop here obeys — each one somebody else's scar
 *
 * 1. **Nothing floats.** The physics lint's `floating.*` family fires on a
 *    full cube with six air faces. Every post here is a full-block column
 *    down to the base plane, every course of it; the drying rack's rails rest
 *    on their posts and the stem posts of the mound rest on the mound.
 * 2. **A walkable cell keeps its two courses of air.** The yard under the
 *    drying rack, the apron round the rune stone and the walk round the
 *    mound's kerb all leave `y + 1` **and** `y + 2` clear over solid non-water
 *    floor — which is exactly why the rack's rails sit at `y = 4` and not at
 *    `y = 2`, and why the hanging fish start at `y = 3`.
 * 3. **No `mud`.** Mud is 15/16 of a block and a body cannot stand on it, so a
 *    yard floored in it is a yard you can only look at. The trodden northern
 *    ground here is `coarse_dirt`, `gravel`, `rooted_dirt` and `podzol`, all
 *    of which are full cubes and all of which look like the thing anyway.
 * 4. **Gravity blocks on floors only.** The cairn's gravel and the mound's
 *    kerb are written on the base plane or on a course standing directly on a
 *    block of their own; nothing here drops gravel into air.
 * 5. **No lanterns by name.** The lint's lantern rule fires on any block name
 *    ending `lantern` and wants a floor under it or a chain over it. Nothing
 *    in this file glows, which is what a burial mound and a fish rack are
 *    after dark.
 * 6. **No `chain`** — it is not in the pinned 1.21.11 block table, and the
 *    palette's `fence` symbol resolves to a **wall** on half the shipped
 *    themes, so a fence-derived gate on those themes is a block that does not
 *    exist. Every hanging line and every rail here is `iron_bars` or the
 *    palette's own `log`/`slab`.
 * 7. **No sign blocks** — a sign is a block entity this op stream cannot
 *    carry. The rune stone's carved band is chiselled stone and stone bricks,
 *    which is what carving looks like in this medium.
 * 8. **Determinism.** The only randomness is the scuffing of the ground plane
 *    and the crookedness of the fish, both drawn from named streams of the
 *    node seed. No wall clock, no `Math.random`, no transcendental.
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
 * Spread into `PROP_NAMES` by `props.ts`, which stays the one place a prop
 * name is enumerated, and mirrored element-for-element by the spec package's
 * `SETTLEMENT_PROP_NAMES`.
 */
export const NORSE_PROP_NAMES = ["rune_stone", "boat_burial_mound", "drying_rack_yard"] as const;

/** One of the props this file builds. */
export type NorsePropName = (typeof NORSE_PROP_NAMES)[number];

/** True for a name this file answers to. */
export function isNorseProp(name: string): name is NorsePropName {
  return (NORSE_PROP_NAMES as readonly string[]).includes(name);
}

/* -------------------------------------------------------------------------- */
/* extents                                                                     */
/* -------------------------------------------------------------------------- */

/** The rune stone's pad, in x and z — the cairn and a cell of standing room. */
export const RUNESTONE_SPAN = 5;
/** Rune stone height: the ground, the cairn, the slab and its cap. */
const RUNESTONE_H = 6;

/** The burial mound's pad, along the ship. */
export const MOUND_W = 15;
/** The burial mound's pad, across it. */
export const MOUND_D = 9;
/** Mound height: the ground, the four heaped courses and the stem posts. */
const MOUND_H = 9;

/** The drying yard's pad, along the racks. */
export const HJELL_W = 11;
/** The drying yard's pad, across them. */
export const HJELL_D = 7;
/** Yard height: the ground, the posts, the rails and the fish over them. */
const HJELL_H = 7;
/** The course the drying rack's rails are carried at — above head height. */
export const HJELL_RAIL = 4;

/** The declared box of one of this file's props, before it is generated. */
export function norsePropFootprint(
  prop: NorsePropName,
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
    case "rune_stone":
      return ground([RUNESTONE_SPAN, RUNESTONE_H, RUNESTONE_SPAN]);
    case "boat_burial_mound":
      return ground([MOUND_W, MOUND_H, MOUND_D]);
    case "drying_rack_yard":
    default:
      return ground([HJELL_W, HJELL_H, HJELL_D]);
  }
}

/** Build a `PropMeta` from the declared footprint, so the two cannot drift. */
function metaOf(prop: NorsePropName, params: Readonly<Record<string, unknown>>): PropMeta {
  const foot = norsePropFootprint(prop, params);
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

/** A bare post of bars — a hook, and the corner of a run. */
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

/** The **thin northern turf** a memorial and a mound stand in. */
function heath(x: number, z: number, scuff: number): string {
  const k = (x * 7 + z * 13 + scuff) % 11;
  if (k === 0) return "coarse_dirt";
  if (k === 1) return "gravel";
  if (k === 2 || k === 3) return "podzol";
  return "grass_block";
}

/** The **trodden shore** of a working yard — deliberately not `mud`. */
function strand(x: number, z: number, scuff: number): string {
  const k = (x * 11 + z * 5 + scuff) % 9;
  if (k === 0 || k === 1) return "gravel";
  if (k === 2) return "rooted_dirt";
  if (k === 3) return "cobblestone";
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
/* the rune stone                                                              */
/* -------------------------------------------------------------------------- */

/**
 * `rune_stone` — the carved memorial slab on its packed cairn.
 *
 * The **cairn** is a single course of stone over the middle nine cells of the
 * pad, which keeps the whole ring of the pad walkable and gives the slab a
 * base that is not the bare turf. The **slab** is a full-block column of the
 * theme's stone standing on the cairn's middle, three courses of it, with the
 * middle course written as `chiseled_stone_bricks` — that band *is* the
 * carving, and it is the only thing that separates this from a boundary
 * marker. The **cap** is a slab, so the head of the stone is not a full cube
 * and the silhouette rounds off.
 *
 * The two **flanking kerb stones** sit on the cairn's corners at one course:
 * a body steps over them, which is what keeps a memorial something a stranger
 * can walk up to and read.
 */
const runeStone: PropGenerator = (ctx) => {
  const { put, palette } = ctx;
  const scuff = ctx.rng("rune.ground").int(0, 10);
  surface(put, 0, RUNESTONE_SPAN, RUNESTONE_SPAN, (x, z) => heath(x, z, scuff));

  const mid = Math.floor(RUNESTONE_SPAN / 2);

  // The cairn: one course, packed, standing on the base plane.
  for (let z = mid - 1; z <= mid + 1; z++) {
    for (let x = mid - 1; x <= mid + 1; x++) {
      put(x, 1, z, (x + z + scuff) % 3 === 0 ? "cobblestone" : palette.stone);
    }
  }

  // The stone itself — a full column, every course, on the cairn's middle.
  put(mid, 2, mid, palette.stone);
  put(mid, 3, mid, "chiseled_stone_bricks");
  put(mid, 4, mid, palette.stoneAccent);
  put(mid, 5, mid, palette.stoneSlab, SLAB_BOTTOM);

  // The kerb: one course at the cairn's corners, steppable.
  for (const [kx, kz] of [
    [mid - 1, mid - 1],
    [mid + 1, mid + 1],
  ] as const) {
    put(kx, 2, kz, palette.stoneSlab, SLAB_BOTTOM);
  }

  return { ops: NO_OPS, meta: metaOf("rune_stone", ctx.params) };
};

/* -------------------------------------------------------------------------- */
/* the boat burial                                                             */
/* -------------------------------------------------------------------------- */

/**
 * `boat_burial_mound` — the grassed mound with the ship's posts still in it.
 *
 * The **mound** is built the way every mass in this project is built: a
 * *filled* course standing on the filled course below it, insetting one cell
 * per course, never a ring and never hollow. A ring per course leaves its
 * outermost cells with air below and beside them, which is `floating.isolated`
 * in its oldest clothes; a hollow course is a sealed pocket besides.
 *
 * The **stem and stern posts** are the read: two full-block columns rising out
 * of the mound's crown at either end of its long axis, the taller one stepped
 * back with a slab so it curves the way a ship's stem does. They stand *on the
 * mound*, so every course of them has a block below it.
 *
 * The **kerb** is a single course of boulders round the mound's foot with a
 * gap left on one side — the gap is the way up, and a mound a body cannot walk
 * onto is a mound nobody will look at twice.
 */
const boatBurialMound: PropGenerator = (ctx) => {
  const { put, palette } = ctx;
  const scuff = ctx.rng("mound.ground").int(0, 10);
  surface(put, 0, MOUND_W, MOUND_D, (x, z) => heath(x, z, scuff));

  const cx = Math.floor(MOUND_W / 2);
  const cz = Math.floor(MOUND_D / 2);

  // The mound: four heaped courses, each a filled rect on the one below it.
  const courses = 4;
  for (let y = 1; y <= courses; y++) {
    const rx = cx - y;
    const rz = cz - y + 1;
    if (rx < 1 || rz < 1) break;
    for (let z = cz - rz; z <= cz + rz; z++) {
      for (let x = cx - rx; x <= cx + rx; x++) {
        if (x < 0 || z < 0 || x >= MOUND_W || z >= MOUND_D) continue;
        if (y === courses) {
          put(x, y, z, "grass_block");
          continue;
        }
        put(x, y, z, (x + z + y + scuff) % 7 === 0 ? "coarse_dirt" : "dirt");
      }
    }
  }

  // The stem and the stern, standing on the crown.
  const crown = courses;
  const stemX = cx - (cx - courses) + 1;
  const sternX = cx + (cx - courses) - 1;
  for (let y = crown + 1; y <= crown + 3; y++) put(stemX, y, cz, palette.log, { axis: "y" });
  put(stemX, crown + 4, cz, palette.slab, SLAB_BOTTOM);
  for (let y = crown + 1; y <= crown + 2; y++) put(sternX, y, cz, palette.log, { axis: "y" });
  put(sternX, crown + 3, cz, palette.slab, SLAB_BOTTOM);

  // The gunwale line: the ship's rail still showing through the turf, laid on
  // the crown so every block of it has the mound under it.
  for (let x = stemX + 1; x < sternX; x++) {
    for (const z of [cz - 1, cz + 1]) put(x, crown + 1, z, palette.slab, SLAB_BOTTOM);
  }

  // The kerb of boulders round the foot, with the way up left open.
  const gate = cx;
  for (let x = 0; x < MOUND_W; x++) {
    for (const z of [0, MOUND_D - 1]) {
      if (z === MOUND_D - 1 && (x === gate || x === gate - 1 || x === gate + 1)) continue;
      if ((x + scuff) % 2 === 1) continue;
      put(x, 1, z, "cobblestone");
    }
  }

  return { ops: NO_OPS, meta: metaOf("boat_burial_mound", ctx.params) };
};

/* -------------------------------------------------------------------------- */
/* the drying yard                                                             */
/* -------------------------------------------------------------------------- */

/**
 * `drying_rack_yard` — the hjell: split cod hung on a timber frame.
 *
 * The **frame** is two rows of full-block posts running the yard's length,
 * carrying a rail of logs at {@link HJELL_RAIL}. Four is not a decorative
 * number: a rail at `y = 2` is a beam through a body's head, so the whole
 * yard under the rack stays walkable only if the lowest thing overhead sits
 * at four and the fish hang from three down to — nothing. The fish are
 * `iron_bars` hanging off the rail, never `chain`, and they stop one course
 * short of the ground so a body can walk down every lane of the yard.
 *
 * The **salting barrels** stand at one end and the **fish table** — slabs on a
 * pair of posts — at the other, both against the pad's edge so the middle of
 * the yard is left clear.
 */
const dryingRackYard: PropGenerator = (ctx) => {
  const { put, palette } = ctx;
  const scuff = ctx.rng("hjell.ground").int(0, 8);
  const crook = ctx.rng("hjell.fish").int(0, 6);
  surface(put, 0, HJELL_W, HJELL_D, (x, z) => strand(x, z, scuff));

  const rows = [2, HJELL_D - 3];

  for (const z of rows) {
    // The posts: full-block columns, every course, down to the ground.
    for (let x = 1; x < HJELL_W - 1; x += 3) {
      for (let y = 1; y <= HJELL_RAIL - 1; y++) put(x, y, z, palette.log, { axis: "y" });
    }
    // The rail, carried on the posts.
    for (let x = 1; x < HJELL_W - 1; x++) put(x, HJELL_RAIL, z, palette.log, { axis: "x" });
    // The fish, hanging off the rail and stopping clear of the ground.
    for (let x = 2; x < HJELL_W - 2; x++) {
      if ((x * 5 + crook) % 3 === 0) continue; // the gaps a working rack wears
      // ONE course only, at `HJELL_RAIL - 1`. A second course would land at
      // `y = 2`, which is the head of a body standing on the yard floor, and
      // the whole point of hanging the fish above head height is that the
      // yard under them stays walkable.
      put(x, HJELL_RAIL - 1, z, "iron_bars", (x + crook) % 2 === 0 ? BARS_X : BARS_POST);
    }
  }

  // The ridge board between the two rows, tying the frame together.
  const midZ = Math.floor(HJELL_D / 2);
  for (let x = 1; x < HJELL_W - 1; x += 2) {
    put(x, HJELL_RAIL, midZ, palette.slab, SLAB_BOTTOM);
  }

  // The salting barrels at one end.
  put(0, 1, 1, "barrel", { facing: "up", open: "false" });
  put(0, 1, HJELL_D - 2, "barrel", { facing: "up", open: "false" });

  // The gutting table at the other: two posts and the boards across them.
  const tx = HJELL_W - 1;
  for (const z of [1, 3]) put(tx, 1, z, palette.log, { axis: "y" });
  for (let z = 1; z <= 3; z++) put(tx, 2, z, palette.slab, SLAB_BOTTOM);

  return { ops: NO_OPS, meta: metaOf("drying_rack_yard", ctx.params) };
};

/* -------------------------------------------------------------------------- */
/* the registry                                                                */
/* -------------------------------------------------------------------------- */

/** This file's generators, keyed by name; `props.ts` spreads them. */
const NORSE_PROP_GENERATORS: Readonly<Record<string, PropGenerator>> = Object.freeze({
  rune_stone: runeStone,
  boat_burial_mound: boatBurialMound,
  drying_rack_yard: dryingRackYard,
});
/* -------------------------------------------------------------------------- */
/* descriptor seam — Phase 4 (no self-registration)                           */
/* -------------------------------------------------------------------------- */

/**
 * Ordered prop descriptors for this leaf — delegates to existing footprint and
 * generator handles. Insertion order follows `NORSE_PROP_NAMES` (catalog order).
 * Footprint is a param-dependent function (currently param-independent but
 * preserves the signature); generator is a leaf handle; no voxel/behavior
 * change. No self-registration.
 */
export const NORSE_PROP_DESCRIPTORS: readonly PropDescriptor[] =
  definePropDescriptors<NorsePropName, PropContext>(NORSE_PROP_NAMES, {
    footprint: (id, params) => norsePropFootprint(id, params),
    generator: NORSE_PROP_GENERATORS,
  });

/** The palette symbols this file reads, named so a reader can check them off. */
type NorsePalette = Pick<
  PropPalette,
  "planks" | "log" | "slab" | "stone" | "stoneAccent" | "stoneSlab"
>;
