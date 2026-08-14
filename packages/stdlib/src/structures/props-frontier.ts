/**
 * `prop.place@0` — the **frontier West pack's ground pieces**: the three
 * entries of `docs/CATALOG-EXPANSION-v0.md` §3.7 that stand on the ground
 * rather than roofing a room or running along a route.
 *
 * The pack's thesis is the era alias's failure — "a wild west town" routes to
 * `industrial` and arrives as a Victorian mill town. These three are the
 * idiom's unroofed half, and between them they say *mining camp* from a
 * hundred blocks away:
 *
 * - `water_tank_trestle` — the banded timber tank up on its braced trestle
 *   beside the track, with the swing spout hanging off the deck. The pack's
 *   tall piece and the one a stranger reads first;
 * - `placer_claim` — a worked gravel bar: spoil ridges thrown up either side
 *   of the cut, the rocker cradle at the water end, and the claim post with
 *   its board nailed to it;
 * - `boot_hill_row` — the crooked line of timber grave markers on a bare rise,
 *   fenced with wire, no two of them the same height.
 *
 * ## The contract, and why this file is a leaf
 *
 * Same shape as `props-hedgerow.ts`, which is this file's nearest model: it
 * imports **types** from `props.ts` and no values at all, so the one edge
 * `props.ts` → here can never become a module-initialisation cycle. Node-local
 * coordinates, block **names** with a property map, every op inside the
 * declared box so `rotateOps` needs no special case.
 *
 * ## The rules every prop here obeys
 *
 * 1. **Nothing floats.** The physics lint's `floating.*` family fires on a
 *    full cube with **six air faces**. Every prop here writes its whole
 *    footprint at its base plane and everything above rests on that plane, on
 *    a column run down to it, or on a horizontal neighbour of its own. The
 *    trestle's legs and the grave markers are the cases that matter: **a post
 *    is a full-block column**, every course of it, all the way to the ground.
 * 2. **A walkable cell keeps its two courses of air.** The ground under the
 *    trestle, the lanes between the spoil ridges and the row in front of the
 *    markers all leave `y + 1` *and* `y + 2` clear over solid non-water floor,
 *    because the lint walks a 1x2 body — which is also why the trestle's
 *    braces sit at `y = 3` and not at `y = 2`.
 * 3. **Water a prop holds is contained.** The tank is the one entry here with
 *    water in it, and it is a plain box on the plaza-well argument: the deck
 *    is solid under every water cell, the banded staves are solid on all four
 *    sides of every course of it, and the top is open sky. Nothing here can
 *    flow out of its box.
 * 4. **No `mud`** and no `dirt_path`. Mud is 15/16 of a block and a body
 *    cannot stand on it, so a claim floored in it is a claim you can only look
 *    at; a worked gravel bar is `gravel`, `coarse_dirt` and `rooted_dirt`,
 *    which is also what one looks like.
 * 5. **Gravity blocks on floors only.** The claim's gravel and the spoil
 *    ridges are written on the base plane and on the course directly over a
 *    block of their own; nothing here drops sand or gravel into air.
 * 6. **No lanterns by name.** The lint's lantern rule fires on any block name
 *    ending `lantern`; nothing in this file glows at all, which is what a
 *    claim and a burying ground actually are after dark.
 * 7. **No `chain`** — not in the pinned 1.21.11 block table; every hanging
 *    line, wire and spout here is `iron_bars`. The wire fence round boot hill
 *    is bars for the same reason `props-hedgerow.ts` gives: the palette's
 *    `fence` symbol resolves to a **wall** on half the shipped themes, and a
 *    fence-derived gate or rail on those themes is a block that does not
 *    exist.
 * 8. **No sign blocks**, because a sign is a block entity this op stream
 *    cannot carry — the claim post's board and the grave markers' head boards
 *    are slabs, which is what they look like anyway.
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
 * Spread into `PROP_NAMES` by `props.ts`, which stays the one place a prop
 * name is enumerated, and mirrored element-for-element by the spec package's
 * `SETTLEMENT_PROP_NAMES`.
 */
export const FRONTIER_PROP_NAMES = [
  "water_tank_trestle",
  "placer_claim",
  "boot_hill_row",
] as const;

/** One of the props this file builds. */
export type FrontierPropName = (typeof FRONTIER_PROP_NAMES)[number];

/** True for a name this file answers to. */
export function isFrontierProp(name: string): name is FrontierPropName {
  return (FRONTIER_PROP_NAMES as readonly string[]).includes(name);
}

/* -------------------------------------------------------------------------- */
/* extents                                                                     */
/* -------------------------------------------------------------------------- */

/** Water tank pad, in x and z — the trestle's feet and a cell of standing room. */
export const TANK_SPAN = 7;
/** Tank height: the ground, the legs, the deck, the staves and the coping. */
export const TANK_H = 9;
/** The course the trestle's deck is laid at. */
export const TANK_DECK = 4;

/** Placer claim pad, in x and z. */
export const PLACER_SPAN = 9;
/** Claim height: the ground, the spoil, and the claim post over it. */
export const PLACER_H = 5;

/** Boot hill pad, along the row. */
export const BOOT_W = 11;
/** Boot hill pad, across it. */
export const BOOT_D = 7;
/** Boot hill height: the ground, the tallest marker, and its head board. */
export const BOOT_H = 6;

/** The tallest and shortest a grave marker is cut. */
export const BOOT_MARKER_MAX = 4;
/** See {@link BOOT_MARKER_MAX}. */
export const BOOT_MARKER_MIN = 2;

/** The declared box of one of this file's props, before it is generated. */
export function frontierPropFootprint(
  prop: FrontierPropName,
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
  } => ({
    size,
    minY: 0,
    base: "ground",
  });
  switch (prop) {
    case "water_tank_trestle":
      return ground([TANK_SPAN, TANK_H, TANK_SPAN]);
    case "placer_claim":
      return ground([PLACER_SPAN, PLACER_H, PLACER_SPAN]);
    case "boot_hill_row":
    default:
      return ground([BOOT_W, BOOT_H, BOOT_D]);
  }
}

/** Build a `PropMeta` from the declared footprint, so the two cannot drift. */
function metaOf(prop: FrontierPropName, params: Readonly<Record<string, unknown>>): PropMeta {
  const foot = frontierPropFootprint(prop, params);
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

/** A run of bars along z. */
const BARS_Z: Record<string, string> = {
  east: "false",
  north: "true",
  south: "true",
  waterlogged: "false",
  west: "false",
};

/** A bare post of bars — the spout, and the corner of a wire fence. */
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

/** The **trodden ground** of a camp — deliberately not `mud`, which is 15/16. */
function trodden(x: number, z: number, scuff: number): string {
  const k = (x * 5 + z * 13 + scuff) % 11;
  if (k === 0) return "gravel";
  if (k === 1 || k === 2) return "rooted_dirt";
  return "coarse_dirt";
}

/** The **worked bar** of a placer claim: washed gravel, and grit between. */
function washed(x: number, z: number, scuff: number): string {
  const k = (x * 7 + z * 11 + scuff) % 7;
  if (k === 0 || k === 1 || k === 2) return "gravel";
  if (k === 3) return "cobblestone";
  return "coarse_dirt";
}

/** The **bare rise** boot hill stands on: thin turf gone back to dirt. */
function rise(x: number, z: number, scuff: number): string {
  const k = (x * 11 + z * 7 + scuff) % 9;
  if (k === 0) return "coarse_dirt";
  if (k === 1) return "gravel";
  if (k === 2) return "rooted_dirt";
  return "grass_block";
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
/* the water tank                                                              */
/* -------------------------------------------------------------------------- */

/**
 * `water_tank_trestle` — the banded tank on its braced trestle, and the
 * tallest thing in a frontier town that is not a false front.
 *
 * The **trestle** is four legs at the corners of a five-cell box, every course
 * of every leg a full block down to the ground, braced to each other at
 * `y = 3` — above a body's head, so the whole pad under the tank stays
 * walkable, which is what a water tank beside a track has to be. The **deck**
 * is solid across the leg box at {@link TANK_DECK}; the **tank** stands on it
 * as a ring of staves three courses high with a coping of slabs on top, and
 * the water inside it is a plain box: solid under it, solid on all four sides
 * of every course, open sky above. The **spout** swings off the deck's edge as
 * a run of `iron_bars` — never `chain`, which is not in the pinned block
 * table.
 */
const waterTankTrestle: PropGenerator = (ctx) => {
  const { put, palette } = ctx;
  const scuff = ctx.rng("tank.ground").int(0, 10);
  surface(put, 0, TANK_SPAN, TANK_SPAN, (x, z) => trodden(x, z, scuff));

  const lo = 1;
  const hi = TANK_SPAN - 2; // 5 — the leg box, one cell in from the pad edge.

  // The legs: full-block columns, every course, all the way to the ground.
  for (const [lx, lz] of [
    [lo, lo],
    [lo, hi],
    [hi, lo],
    [hi, hi],
  ] as const) {
    for (let y = 1; y < TANK_DECK; y++) put(lx, y, lz, palette.log, { axis: "y" });
  }

  // The braces, at y = 3 — over head height, so the pad under the tank keeps
  // its two courses of air and stays walkable end to end.
  for (let x = lo + 1; x < hi; x++) {
    put(x, TANK_DECK - 1, lo, palette.planks);
    put(x, TANK_DECK - 1, hi, palette.planks);
  }
  for (let z = lo + 1; z < hi; z++) {
    put(lo, TANK_DECK - 1, z, palette.planks);
    put(hi, TANK_DECK - 1, z, palette.planks);
  }

  // The deck, solid across the leg box — the tank's floor.
  for (let z = lo; z <= hi; z++) {
    for (let x = lo; x <= hi; x++) put(x, TANK_DECK, z, palette.planks);
  }

  // The staves, three courses of banded timber round the deck's edge, with the
  // water standing inside them.
  for (let y = TANK_DECK + 1; y <= TANK_DECK + 3; y++) {
    for (let z = lo; z <= hi; z++) {
      for (let x = lo; x <= hi; x++) {
        const edge = x === lo || x === hi || z === lo || z === hi;
        if (edge) {
          // The bands: the stripped course reads as the iron hoop round the
          // staves, and it is a full block like the rest of them.
          put(x, y, z, y === TANK_DECK + 2 ? palette.stripped : palette.log, { axis: "y" });
          continue;
        }
        if (y <= TANK_DECK + 2) put(x, y, z, "water");
      }
    }
  }

  // The coping, a course of slabs round the rim — not a full cube, so there is
  // nothing here for the floating rule either.
  for (let z = lo; z <= hi; z++) {
    for (let x = lo; x <= hi; x++) {
      if (x !== lo && x !== hi && z !== lo && z !== hi) continue;
      put(x, TANK_DECK + 4, z, palette.slab, SLAB_BOTTOM);
    }
  }

  // The swing spout, hanging off the deck's edge on the track side.
  const mid = Math.floor(TANK_SPAN / 2);
  put(TANK_SPAN - 1, TANK_DECK, mid, "iron_bars", BARS_X);
  put(TANK_SPAN - 1, TANK_DECK - 1, mid, "iron_bars", BARS_POST);

  // The ballast barrel at the foot of a leg, so the pad is not bare.
  put(lo, 1, TANK_SPAN - 1, "barrel", { facing: "up", open: "false" });

  return { ops: NO_OPS, meta: metaOf("water_tank_trestle", ctx.params) };
};

/* -------------------------------------------------------------------------- */
/* the placer claim                                                            */
/* -------------------------------------------------------------------------- */

/**
 * `placer_claim` — a worked gravel bar, and the cheapest icon in the pack.
 *
 * The read is the **cut**: a lane of washed gravel straight down the middle of
 * the pad with a **spoil ridge** thrown up either side of it, one course high
 * so a body can still step over — a ridge that walls the cut off is a claim
 * nobody worked. The **rocker cradle** sits at one end of the cut, a box of
 * planks with the slab screen over it, and the **claim post** stands at the
 * other corner: a full-block column with the board nailed across its head.
 */
const placerClaim: PropGenerator = (ctx) => {
  const { put, palette } = ctx;
  const scuff = ctx.rng("placer.ground").int(0, 6);
  surface(put, 0, PLACER_SPAN, PLACER_SPAN, (x, z) => washed(x, z, scuff));

  const mid = Math.floor(PLACER_SPAN / 2);

  // The spoil ridges, one course of gravel either side of the cut — and every
  // block of them stands on the base plane, which is where a gravity block
  // belongs.
  for (let z = 1; z < PLACER_SPAN - 1; z++) {
    if ((z * 5 + scuff) % 4 === 0) continue; // the gaps a worked bar wears in
    put(mid - 2, 1, z, "gravel");
    put(mid + 2, 1, z, "gravel");
  }

  // The rocker cradle: a box of planks with the screen over it, at the low end
  // of the cut.
  put(mid, 1, 1, palette.planks);
  put(mid - 1, 1, 1, palette.planks);
  put(mid, 2, 1, palette.slab, SLAB_BOTTOM);
  put(mid - 1, 2, 1, palette.slab, SLAB_BOTTOM);
  put(mid + 1, 1, 1, "cauldron");

  // The claim post, a full column, with the board across its head.
  const px = PLACER_SPAN - 2;
  const pz = PLACER_SPAN - 2;
  for (let y = 1; y <= 3; y++) put(px, y, pz, palette.log, { axis: "y" });
  put(px, 4, pz, palette.slab, SLAB_BOTTOM);
  put(px - 1, 3, pz, palette.slab, SLAB_BOTTOM);

  // The pick and the pan, left at the head of the cut.
  put(1, 1, PLACER_SPAN - 2, "barrel", { facing: "up", open: "false" });

  return { ops: NO_OPS, meta: metaOf("placer_claim", ctx.params) };
};

/* -------------------------------------------------------------------------- */
/* boot hill                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * `boot_hill_row` — the burying ground outside town.
 *
 * A **crooked line** of timber markers across the middle of the pad, each one
 * a full-block column of between {@link BOOT_MARKER_MIN} and
 * {@link BOOT_MARKER_MAX} courses with a head board of slab on top, and no two
 * neighbours the same height — the crookedness is a pure function of position,
 * so it repeats forever and never needs a draw. The **wire fence** runs round
 * the pad's edge as posts of `iron_bars` with the wire strung between them,
 * with a gap left at one end so the ground inside is reachable on foot.
 *
 * The rows either side of the markers are left completely clear, which is what
 * keeps a burying ground something a stranger can walk into.
 */
const bootHillRow: PropGenerator = (ctx) => {
  const { put, palette } = ctx;
  const scuff = ctx.rng("boot.ground").int(0, 8);
  surface(put, 0, BOOT_W, BOOT_D, (x, z) => rise(x, z, scuff));

  const rowZ = Math.floor(BOOT_D / 2);
  const span = BOOT_MARKER_MAX - BOOT_MARKER_MIN + 1;

  // The markers. The row is crooked in z as well as in height, because a line
  // of markers all on one axis is a fence and not a burying ground.
  for (let x = 2; x <= BOOT_W - 3; x++) {
    if ((x - 2) % 2 === 1) continue;
    const h = BOOT_MARKER_MIN + ((x * 7 + scuff) % span);
    const z = rowZ + (((x * 3 + scuff) % 3) - 1);
    for (let y = 1; y <= h; y++) put(x, y, z, palette.log, { axis: "y" });
    put(x, h + 1, z, palette.slab, SLAB_BOTTOM);
    // The mound in front of the marker — one course, steppable.
    put(x, 1, z === 0 ? z + 1 : z - 1, "coarse_dirt");
  }

  // The wire fence: a post at every corner and every third cell of the edge,
  // with the wire strung between them. The gap is the way in.
  const gate = Math.floor(BOOT_W / 2);
  for (let x = 0; x < BOOT_W; x++) {
    if (x === gate || x === gate - 1) continue;
    for (const z of [0, BOOT_D - 1]) {
      put(x, 1, z, "iron_bars", x % 3 === 0 ? BARS_POST : BARS_X);
    }
  }
  for (let z = 1; z < BOOT_D - 1; z++) {
    for (const x of [0, BOOT_W - 1]) {
      put(x, 1, z, "iron_bars", z % 3 === 0 ? BARS_POST : BARS_Z);
    }
  }

  return { ops: NO_OPS, meta: metaOf("boot_hill_row", ctx.params) };
};

/* -------------------------------------------------------------------------- */
/* the registry                                                                */
/* -------------------------------------------------------------------------- */

/** This file's generators, keyed by name; `props.ts` spreads them. */
export const FRONTIER_PROP_GENERATORS: Readonly<Record<string, PropGenerator>> = Object.freeze({
  water_tank_trestle: waterTankTrestle,
  placer_claim: placerClaim,
  boot_hill_row: bootHillRow,
});

/** The palette symbols this file reads, named so a reader can check them off. */
export type FrontierPalette = Pick<PropPalette, "planks" | "log" | "stripped" | "slab">;
