/**
 * `prop.place@0` — the **Atlantean pack's ground pieces**: the two entries of
 * that pack which stand on the bare ground rather than roofing a room.
 *
 * The pack's thesis is that "Atlantis", "a sunken city risen", "a drowned
 * empire on dry land" all route to the `ancient` era and arrive as a Greek
 * town. The palette was never the problem — `white_quartz` has shipped since
 * the founding waves — it is the **noun set**, and two of those nouns have no
 * inside at all:
 *
 * - `leviathan_altar` — the offering table under a rib arch: the stepped
 *   plinth, the altar slab on top of it and the ribs of a thing far too large
 *   springing over it. The pack's icon, and the piece a stranger reads first;
 * - `bronze_colossus_fragment` — a **fallen** fragment: the forearm and hand of
 *   a bronze giant lying in honest rubble, oxidised green where the weather got
 *   at it. Not a statue on a plinth — the whole point is that the city fell.
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
 * 1. **Nothing floats.** The physics lint's `floating.*` family fires on a full
 *    cube with six air faces. Every rib post here is a full-block column down
 *    to the base plane, every course of it, and the lintel between two posts is
 *    an unbroken horizontal run touching one at each end. Every course of the
 *    plinth is a *filled* rect standing on the filled rect below it — never a
 *    ring, which is `floating.isolated` in its oldest clothes.
 * 2. **A walkable cell keeps its two courses of air.** The ground round the
 *    altar and round the fragment leaves `y + 1` **and** `y + 2` clear over
 *    solid non-water floor, which is why the rib lintel runs at
 *    {@link ALTAR_LINTEL} rather than at head height, and why the whole
 *    colossus fragment **lies down**: a fallen arm is a thing you walk round,
 *    not a thing you walk into.
 * 3. **No water.** Neither piece writes a drop. The pack's water lives indoors,
 *    in the curbed basins of `archetypes-atlantean.ts`, where its closure is
 *    something this project can prove; a puddle round a prop is a fluid whose
 *    neighbours are whatever terrain happens to be there, which is exactly the
 *    unstable-fluid finding the water-works closure argument exists to prevent.
 * 4. **Coral is dry and dead.** Every coral block here is a `dead_*` variant. A
 *    live one out of water turns grey on the first block tick.
 * 5. **Gravity blocks on the base plane only.** The rubble's gravel is written
 *    at `y = 0` and nowhere else; nothing here drops gravel into air.
 * 6. **No lanterns by name.** The lint's lantern rule fires on any block name
 *    ending `lantern` and wants a floor under it or a chain over it. The only
 *    glow in this file is `sea_lantern`, and every one of them is a full cube
 *    standing on the course below it — which is that rule satisfied, not dodged.
 * 7. **No `chain`** — it is not in the pinned 1.21.11 block table. The block
 *    that *is* in it is `iron_chain`, and where this file hangs anything it
 *    hangs it on that, with something solid directly above.
 * 8. **No sign blocks** — a sign is a block entity this op stream cannot carry.
 *    Carving is `chiseled_quartz_block`, which is what carving looks like here.
 * 9. **Determinism.** The only randomness is the scuffing of the ground plane,
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
export const ATLANTEAN_PROP_NAMES = ["leviathan_altar", "bronze_colossus_fragment"] as const;

/** One of the props this file builds. */
export type AtlanteanPropName = (typeof ATLANTEAN_PROP_NAMES)[number];

/** True for a name this file answers to. */
export function isAtlanteanProp(name: string): name is AtlanteanPropName {
  return (ATLANTEAN_PROP_NAMES as readonly string[]).includes(name);
}

/* -------------------------------------------------------------------------- */
/* extents                                                                     */
/* -------------------------------------------------------------------------- */

/** The altar's pad, in x and z — the plinth, the ribs and standing room. */
export const ALTAR_SPAN = 7;
/** Altar height: the ground, three courses of plinth, the ribs and the lintel. */
export const ALTAR_H = 6;
/** The course the rib lintel spans at — well over a body's head. */
export const ALTAR_LINTEL = 4;

/** The fragment's pad, in x and z. */
export const COLOSSUS_SPAN = 7;
/** Fragment height: the ground, the arm lying on it and the thickest muscle. */
export const COLOSSUS_H = 4;

/** The declared box of one of this file's props, before it is generated. */
export function atlanteanPropFootprint(
  prop: AtlanteanPropName,
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
    case "leviathan_altar":
      return ground([ALTAR_SPAN, ALTAR_H, ALTAR_SPAN]);
    case "bronze_colossus_fragment":
    default:
      return ground([COLOSSUS_SPAN, COLOSSUS_H, COLOSSUS_SPAN]);
  }
}

/** Build a `PropMeta` from the declared footprint, so the two cannot drift. */
function metaOf(prop: AtlanteanPropName, params: Readonly<Record<string, unknown>>): PropMeta {
  const foot = atlanteanPropFootprint(prop, params);
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

/**
 * The **salt-bleached ground** a risen city stands on — deliberately not `mud`.
 *
 * Mud is 15/16 of a block and a body cannot stand on it, so a shrine floored in
 * it is a shrine you can only look at. All four of these are full cubes and all
 * four look like the thing anyway.
 */
function bleached(x: number, z: number, scuff: number): string {
  const k = (x * 7 + z * 13 + scuff) % 11;
  if (k === 0) return "gravel";
  if (k === 1) return "sand";
  if (k === 2) return "calcite";
  if (k === 3) return "coarse_dirt";
  return "grass_block";
}

/** The **rubble** round a thing that fell — cobble, stone and grit. */
function rubble(x: number, z: number, scuff: number): string {
  const k = (x * 11 + z * 5 + scuff) % 9;
  if (k === 0 || k === 1) return "gravel";
  if (k === 2) return "cobblestone";
  if (k === 3) return "mossy_cobblestone";
  if (k === 4 || k === 5) return "grass_block";
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

/** One dead coral block, drawn from position — never a live one (rule 4). */
const DEAD_CORAL = [
  "dead_brain_coral_block",
  "dead_tube_coral_block",
  "dead_horn_coral_block",
  "dead_fire_coral_block",
] as const;

/* -------------------------------------------------------------------------- */
/* the leviathan altar                                                         */
/* -------------------------------------------------------------------------- */

/**
 * `leviathan_altar` — the offering table under the ribs of the thing it is for.
 *
 * The **plinth** is built the way every mass in this project is built: a
 * *filled* course standing on the filled course below it, insetting one cell
 * per course, never a ring and never hollow. A ring per course leaves its
 * outermost cells with air below and beside them, which is `floating.isolated`
 * in its oldest clothes; a hollow course is a sealed pocket besides.
 *
 * The **altar slab** caps it, so the top is not a full cube and the silhouette
 * reads as a table rather than as a block of masonry.
 *
 * The **ribs** are the piece's argument. Four `bone_block` posts stand at the
 * pad's edges — full columns to the ground, every course of them — and two
 * **lintels** run between each facing pair at {@link ALTAR_LINTEL}. Four rather
 * than two, because a single arch reads as a doorway and a pair reads as a
 * ribcage; and at four courses up rather than two, because the point of an
 * altar is that somebody can walk up to it and a rib at head height stops them.
 * The `dead_*` coral set into the plinth's flank is what a thing dragged out of
 * the sea has growing on it.
 */
const leviathanAltar: PropGenerator = (ctx) => {
  const { put, palette } = ctx;
  const scuff = ctx.rng("altar.ground").int(0, 10);
  surface(put, 0, ALTAR_SPAN, ALTAR_SPAN, (x, z) => bleached(x, z, scuff));

  const mid = Math.floor(ALTAR_SPAN / 2);

  // The plinth: filled courses, each standing whole on the one below it.
  for (let y = 1; y <= 2; y++) {
    const r = 2 - (y - 1);
    for (let z = mid - r; z <= mid + r; z++) {
      for (let x = mid - r; x <= mid + r; x++) {
        const k = (x + z + y + scuff) % 6;
        put(x, y, z, k === 0 ? palette.stoneAccent : k === 1 ? "prismarine_bricks" : palette.stone);
      }
    }
  }
  // The altar slab, capping the plinth.
  for (let z = mid - 1; z <= mid + 1; z++) {
    for (let x = mid - 1; x <= mid + 1; x++) put(x, 3, z, palette.stoneSlab, SLAB_BOTTOM);
  }
  // The carved face of the table's front, and the glow bedded behind it.
  put(mid, 2, mid - 1, "chiseled_quartz_block");
  put(mid, 2, mid + 1, "sea_lantern");

  // The coral on the plinth's flank — dead, dry, and standing on the course
  // below it, which is the only reason it is not floating.
  for (const [cx, cz] of [
    [mid - 2, mid],
    [mid + 2, mid],
  ] as const) {
    put(cx, 2, cz, DEAD_CORAL[(cx + cz + scuff) % DEAD_CORAL.length] as string);
  }

  // The ribs: four posts, full columns to the ground, at the pad's edges.
  const posts = [
    [0, mid - 2],
    [0, mid + 2],
    [ALTAR_SPAN - 1, mid - 2],
    [ALTAR_SPAN - 1, mid + 2],
  ] as const;
  for (const [px, pz] of posts) {
    for (let y = 1; y <= ALTAR_LINTEL; y++) put(px, y, pz, "bone_block", { axis: "y" });
  }
  // The two lintels, each an unbroken run touching a post at either end.
  for (const pz of [mid - 2, mid + 2]) {
    for (let x = 1; x < ALTAR_SPAN - 1; x++) put(x, ALTAR_LINTEL, pz, "bone_block", { axis: "x" });
  }

  return { ops: NO_OPS, meta: metaOf("leviathan_altar", ctx.params) };
};

/* -------------------------------------------------------------------------- */
/* the fallen colossus                                                         */
/* -------------------------------------------------------------------------- */

/**
 * `bronze_colossus_fragment` — the forearm and hand of a bronze giant, down.
 *
 * **It lies down, and that is the whole design.** A colossus standing on a
 * plinth is the memorial wave's `colossal_statue` and it keeps every spelling
 * of that word; what this pack needs is the *fragment*, because a risen city is
 * a city that fell first. So the piece is horizontal: the **forearm** runs the
 * length of the pad, two cells wide, one course off the ground with the
 * thickest muscle rising to a second; the **hand** splays at one end as four
 * short fingers, flat; and everything else is **honest rubble** — cobble, moss
 * and grit at the base plane, where a body walks over it rather than round it.
 *
 * The bronze is written as the copper oxidation set, banded by position:
 * `copper_block` where the metal is still bright, `exposed_copper` and
 * `weathered_copper` through the middle, `oxidized_copper` where the weather
 * has had it longest. That progression is the one thing in the game that
 * already means "bronze, outdoors, for a very long time".
 *
 * **Gravity-safe by construction** (rule 5): the only gravel is at `y = 0`,
 * every block at `y = 1` stands on the base plane, and the one course at
 * `y = 2` stands on `y = 1`. Nothing here can fall.
 */
const bronzeColossusFragment: PropGenerator = (ctx) => {
  const { put } = ctx;
  const scuff = ctx.rng("colossus.ground").int(0, 10);
  surface(put, 0, COLOSSUS_SPAN, COLOSSUS_SPAN, (x, z) => rubble(x, z, scuff));

  /** The bronze, aged by position: bright at one end, green at the other. */
  const bronze = (x: number, z: number): string => {
    const k = (x * 3 + z + scuff) % 8;
    if (k === 0) return "copper_block";
    if (k === 1 || k === 2) return "exposed_copper";
    if (k === 3 || k === 4) return "weathered_copper";
    return "oxidized_copper";
  };

  const mid = Math.floor(COLOSSUS_SPAN / 2);

  // The forearm: two cells wide, lying along x, from the wrist to the break.
  for (let x = 1; x <= COLOSSUS_SPAN - 3; x++) {
    for (const z of [mid - 1, mid]) put(x, 1, z, bronze(x, z));
  }
  // The muscle: one course higher over the middle of the arm, standing on it.
  for (let x = 2; x <= COLOSSUS_SPAN - 4; x++) put(x, 2, mid - 1, bronze(x, mid));

  // The break, at the elbow end: the metal sheared and the bone of the armature
  // showing. `chiseled_quartz_block` is what a cut face looks like here.
  put(1, 2, mid, "chiseled_quartz_block");

  // The hand: four fingers splayed flat at the wrist end, each one touching the
  // arm or the finger beside it, none of them standing on anything but ground.
  for (const fz of [mid - 2, mid - 1, mid, mid + 1]) {
    for (let x = COLOSSUS_SPAN - 3; x <= COLOSSUS_SPAN - 2; x++) put(x, 1, fz, bronze(x, fz));
  }

  // The rubble the fragment brought down with it: kerb stones at the flanks,
  // low enough that a body steps over them.
  for (const [kx, kz] of [
    [2, mid + 2],
    [4, mid - 2],
  ] as const) {
    put(kx, 1, kz, "cobblestone_slab", SLAB_BOTTOM);
  }

  return { ops: NO_OPS, meta: metaOf("bronze_colossus_fragment", ctx.params) };
};

/* -------------------------------------------------------------------------- */
/* the registry                                                                */
/* -------------------------------------------------------------------------- */

/** This file's generators, keyed by name; `props.ts` spreads them. */
export const ATLANTEAN_PROP_GENERATORS: Readonly<Record<string, PropGenerator>> = Object.freeze({
  leviathan_altar: leviathanAltar,
  bronze_colossus_fragment: bronzeColossusFragment,
});

/** The palette symbols this file reads, named so a reader can check them off. */
export type AtlanteanPalette = Pick<PropPalette, "stone" | "stoneAccent" | "stoneSlab">;
