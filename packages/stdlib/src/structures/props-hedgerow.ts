/**
 * `prop.place@0` — the **agrarian expansion pack's ground pieces**: the eight
 * entries of `docs/CATALOG-EXPANSION-v0.md` §3.5 that stand in a yard or a
 * field rather than roofing a room.
 *
 * The pack's thesis is battery P2's: F17 shipped the field and the farmstead,
 * and the *countryside between them* is still empty. This file is that
 * countryside's furniture:
 *
 * - `field_gate` — the five-bar gate hung between a hanging post and a
 *   slapping post, with the stile stones beside it. The pack's XS piece and
 *   the one every boundary run wants;
 * - `duck_pond` — a rimmed pond with its **own dug water**, reeds at one edge,
 *   a plank ramp out over it and the duck house on stilts at the end of the
 *   ramp;
 * - `midden_heap` — the muck heap by the yard: coarse dirt banked against
 *   three walls with the fork standing in it;
 * - `sheep_dip` — the sunken trough with a race of hurdles funnelling into it
 *   and a draining pen the far side;
 * - `staddle_granary` — the grain box up on mushroom stones, with the step
 *   that does not touch it standing beside;
 * - `hop_yard` — poles on a grid with the wire runs between their heads. Takes
 *   a `length`, because a hop yard is as long as the ground is;
 * - `stock_pens` — hurdle pens off a droving lane, with the weigh crush at one
 *   end and the auctioneer's step at the corner. Takes a `length` too;
 * - `well_sweep` — the counterweighted lever over an open well.
 *
 * ## The contract, and why this file is a leaf
 *
 * Same shape as `props-wilds.ts`, which is this file's nearest model: it
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
 *    granary's staddles and the sweep's post are the cases that matter: **a
 *    post is a full-block column**, every course of it, all the way to the
 *    ground.
 * 2. **A walkable cell keeps its two courses of air.** The pond's rim, the
 *    dip's deck, the droving lane and the lanes between the hop poles all
 *    leave `y + 1` *and* `y + 2` clear over solid non-water floor, because the
 *    lint walks a 1x2 body and an icon you cannot walk beside is a wall.
 * 3. **Water a prop digs is contained.** The pond and the dip are the two
 *    entries with water in them, and both are plain boxes on the plaza-well
 *    argument: solid floor under every water cell, solid on all four sides of
 *    every water cell, open sky above. Nothing here can flow out of its box.
 * 4. **No `mud`** and no `dirt_path`. Mud is 15/16 of a block and a body
 *    cannot stand on it, so a yard floored in it is a yard you can only look
 *    at; the muck of a farm is `coarse_dirt`, `rooted_dirt` and `gravel`,
 *    which is also what a trodden yard looks like.
 * 5. **Gravity blocks on floors only.** The pens' gravel and the pond's sand
 *    are written on the base plane; nothing here drops sand into air.
 * 6. **No lanterns by name.** The lint's lantern rule fires on any block name
 *    ending `lantern`; nothing in this file glows at all, which is what a farm
 *    yard at eye level actually is.
 * 7. **No `chain`** — not in the pinned 1.21.11 block table; every hanging
 *    line is `iron_bars`.
 * 8. **No sign blocks**, because a sign is a block entity this op stream
 *    cannot carry.
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
export const HEDGEROW_PROP_NAMES = [
  "field_gate",
  "duck_pond",
  "midden_heap",
  "sheep_dip",
  "staddle_granary",
  "hop_yard",
  "stock_pens",
  "well_sweep",
] as const;

/** One of the props this file builds. */
export type HedgerowPropName = (typeof HEDGEROW_PROP_NAMES)[number];

/** True for a name this file answers to. */
export function isHedgerowProp(name: string): name is HedgerowPropName {
  return (HEDGEROW_PROP_NAMES as readonly string[]).includes(name);
}

/* -------------------------------------------------------------------------- */
/* extents                                                                     */
/* -------------------------------------------------------------------------- */

/** Field gate: the boundary run it is hung in, in x. */
export const GATE_W = 5;
/** Field gate depth — the boundary line and a cell of approach either side. */
export const GATE_D = 3;
/** Field gate height: the ground, and the hanging post over it. */
export const GATE_H = 4;

/** Duck pond pad, in x and z. */
export const POND_SPAN = 9;
/** Pond height: the puddled floor, the water, and the house on its stilts. */
export const POND_H = 5;
/** How far the water reaches from the middle of the pad, in cells of taxicab. */
export const POND_DIG = 3;

/** Midden pad, in x and z. */
export const MIDDEN_SPAN = 5;
/** Midden height: the ground, two courses of walling, the fork over them. */
export const MIDDEN_H = 4;

/** Sheep dip pad, in x — the race, the trough and the draining pen. */
export const DIP_W = 7;
/** Sheep dip pad, in z. */
export const DIP_D = 5;
/** Sheep dip height: the ground, the deck and the hurdles on it. */
export const DIP_H = 3;

/** Staddle granary pad, in x and z. */
export const GRANARY_SPAN = 5;
/** Granary height: the ground, the staddles, the box up off them. */
export const GRANARY_H = 5;

/** Default run of the hop yard, along its rows. */
export const HOP_LENGTH = 21;
/** The shortest and longest hop yard a document may ask for. */
export const HOP_MIN = 13;
/** See {@link HOP_MIN}. */
export const HOP_MAX = 31;
/** Depth of the hop yard: three rows of poles and the lanes between them. */
export const HOP_D = 13;
/** Hop yard height: the ground, the poles, the wire run across their heads. */
export const HOP_H = 5;

/** Default run of the stock pens, along the droving lane. */
export const PENS_LENGTH = 17;
/** The shortest and longest run of pens a document may ask for. */
export const PENS_MIN = 13;
/** See {@link PENS_MIN}. */
export const PENS_MAX = 25;
/** Depth of the pens: a band of pens, the lane, and a band the other side. */
export const PENS_D = 13;
/** Pens height: the ground, the hurdles, the auctioneer's step. */
export const PENS_H = 3;

/** Well sweep pad, in x and z. */
export const SWEEP_SPAN = 7;
/** Sweep height: the ground, the forked post, the beam and its counterweight. */
export const SWEEP_H = 7;

/** Read the hop yard's `length` param the way the generator reads it. */
function hopLength(params: Readonly<Record<string, unknown>>): number {
  return clampParam(params, "length", HOP_LENGTH, HOP_MIN, HOP_MAX);
}

/** Read the pens' `length` param the way the generator reads it. */
function pensLength(params: Readonly<Record<string, unknown>>): number {
  return clampParam(params, "length", PENS_LENGTH, PENS_MIN, PENS_MAX);
}

/**
 * The one param reader, so a clamp cannot drift between the footprint and the
 * generator that builds inside it.
 *
 * `props.ts` exports `intParam` and this file deliberately does not use it:
 * importing a **value** from `props.ts` is the module cycle every leaf in this
 * family is written to avoid.
 */
function clampParam(
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

/** The declared box of one of this file's props, before it is generated. */
export function hedgerowPropFootprint(
  prop: HedgerowPropName,
  params: Readonly<Record<string, unknown>> = {},
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
    case "field_gate":
      return ground([GATE_W, GATE_H, GATE_D]);
    case "duck_pond":
      // The one entry here that reaches below the base plane, because a pond
      // that does not is a puddle standing on the grass: `minY = -1` is the
      // puddled floor the water sits on, and the rim at `y = 0` is what holds
      // it in.
      return { size: [POND_SPAN, POND_H, POND_SPAN], minY: -1, base: "ground" };
    case "midden_heap":
      return ground([MIDDEN_SPAN, MIDDEN_H, MIDDEN_SPAN]);
    case "sheep_dip":
      return ground([DIP_W, DIP_H, DIP_D]);
    case "staddle_granary":
      return ground([GRANARY_SPAN, GRANARY_H, GRANARY_SPAN]);
    case "hop_yard":
      return ground([hopLength(params), HOP_H, HOP_D]);
    case "stock_pens":
      return ground([pensLength(params), PENS_H, PENS_D]);
    case "well_sweep":
    default:
      return ground([SWEEP_SPAN, SWEEP_H, SWEEP_SPAN]);
  }
}

/** Build a `PropMeta` from the declared footprint, so the two cannot drift. */
function metaOf(prop: HedgerowPropName, params: Readonly<Record<string, unknown>>): PropMeta {
  const foot = hedgerowPropFootprint(prop, params);
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

/** A fence post standing on its own. */
const POST: Record<string, string> = {
  east: "false",
  north: "false",
  south: "false",
  waterlogged: "false",
  west: "false",
};

/** A fence post standing in water — the pond's stilt. */
const POST_WET: Record<string, string> = { ...POST, waterlogged: "true" };

/** A rail run along x — the hurdle in a pen and the wire in a hop yard. */
const BARS_X: Record<string, string> = {
  east: "true",
  north: "false",
  south: "false",
  waterlogged: "false",
  west: "true",
};

/** A rail run along z. */
const BARS_Z: Record<string, string> = {
  east: "false",
  north: "true",
  south: "true",
  waterlogged: "false",
  west: "false",
};

/** A bottom slab, standing on the block under it. */
const SLAB_BOTTOM: Record<string, string> = { type: "bottom", waterlogged: "false" };

/* -------------------------------------------------------------------------- */
/* the ground                                                                  */
/* -------------------------------------------------------------------------- */

/** The **turf** of a field: grass with the bare patches a boundary wears in. */
function turf(x: number, z: number, scuff: number): string {
  const k = (x * 7 + z * 11 + scuff) % 9;
  if (k === 0) return "coarse_dirt";
  if (k === 1) return "rooted_dirt";
  return "grass_block";
}

/**
 * The **trodden yard** — where the stock stands, and deliberately *not* `mud`:
 * mud is 15/16 of a block and a body cannot stand on it, so a yard floored in
 * it is a yard you can only look at. Coarse dirt, rooted dirt and gravel say
 * the same thing and take a boot.
 */
function trodden(x: number, z: number, scuff: number): string {
  const k = (x * 5 + z * 13 + scuff) % 11;
  if (k === 0) return "gravel";
  if (k === 1 || k === 2) return "rooted_dirt";
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
/* the field gate                                                              */
/* -------------------------------------------------------------------------- */

/**
 * `field_gate` — the five-bar gate, and the smallest thing in the pack.
 *
 * The boundary runs down the middle of the box on `z = 1`: a stump of walling
 * at each end, the **hanging post** taller than everything else because that
 * is the one that carries the weight, the **slapping post** it shuts against,
 * and the gate itself between them. The gate is written **shut** — the lint
 * reads any `_gate` as impassable whatever its state, so an open one buys
 * nothing and a shut one is the honest read of a stock boundary.
 *
 * The **stile** is the pair of stood stones beside the wall end, one each side
 * of the line, which is how a body gets over a boundary the gate is shut on.
 * Both cells either side of the run keep two courses of air over solid ground,
 * so this prop divides a field without dividing the walk.
 */
const fieldGate: PropGenerator = (ctx) => {
  const { put, palette } = ctx;
  const scuff = ctx.rng("gate.ground").int(0, 8);
  surface(put, 0, GATE_W, GATE_D, (x, z) => turf(x, z, scuff));

  // The boundary line, on z = 1.
  put(0, 1, 1, palette.stone);
  put(4, 1, 1, palette.stone);

  // The hanging post: a full-block column, three courses of it, because the
  // gate hangs on this one and a post drawn as a stub with rigging over it is
  // the defect this shape is chosen against.
  for (let y = 1; y <= 3; y++) put(1, y, 1, palette.log, { axis: "y" });
  // The slapping post, one course shorter — it only has to be shut against.
  for (let y = 1; y <= 2; y++) put(3, y, 1, palette.log, { axis: "y" });

  // The gate, hung between them and shut. Its leaf is `iron_bars` and
  // deliberately **not** a `_fence_gate`: the palette's `fence` symbol is a
  // *wall* on half the shipped themes (`diorite_wall`, `sandstone_wall`,
  // `mud_brick_wall`), and there is no such block as a `diorite_wall_gate` —
  // a gate derived from the fence name would be a block that does not exist
  // on those themes. Bars carry the five-bar read at both courses and are not
  // a full cube, so there is nothing here for the floating rule either.
  for (let y = 1; y <= 2; y++) put(2, y, 1, "iron_bars", BARS_X);

  // The stile: a stood stone each side of the wall end, so a body on foot can
  // cross a boundary the gate is shut on.
  put(4, 1, 0, palette.stoneSlab, SLAB_BOTTOM);
  put(4, 1, 2, palette.stoneSlab, SLAB_BOTTOM);

  return { ops: NO_OPS, meta: metaOf("field_gate", ctx.params) };
};

/* -------------------------------------------------------------------------- */
/* the duck pond                                                               */
/* -------------------------------------------------------------------------- */

/**
 * `duck_pond` — the pack's one piece of dug water, and a plain box by
 * construction.
 *
 * The pond is a **diamond** of water at the base plane with a puddled floor of
 * clay a course under it and a rim of turf all the way round: every water cell
 * has solid under it and solid on all four sides at its own course, which is
 * the containment argument the plaza well settled and nothing here weakens it.
 *
 * Off the south rim, the **plank ramp** runs out over the water — each plank
 * touching the one behind it, the last of them on a stilt driven to the pond
 * floor — and the **duck house** sits on the end of it, one cell of box under
 * a stair roof, which is exactly what a duck house is. The **reeds** stand on
 * the north rim where the ground is wet, as ferns, which are not full cubes
 * and have nothing for the floating rule to find.
 */
const duckPond: PropGenerator = (ctx) => {
  const { put, palette } = ctx;
  const scuff = ctx.rng("pond.ground").int(0, 8);
  const mid = Math.floor(POND_SPAN / 2);
  /** Is this cell inside the water? Taxicab, so the pond reads as dug. */
  const wet = (x: number, z: number): boolean =>
    Math.abs(x - mid) + Math.abs(z - mid) <= POND_DIG;

  // The puddled floor, edge to edge — the block that holds the water in from
  // below, and the reason nothing here can drain into the terrain.
  surface(put, -1, POND_SPAN, POND_SPAN, () => "clay");
  // The water, and the rim of turf that holds it in from the sides.
  surface(put, 0, POND_SPAN, POND_SPAN, (x, z) =>
    wet(x, z) ? "water" : turf(x, z, scuff),
  );

  // The reeds on the north rim, where the ground is wet: a fern is not a full
  // cube, so there is nothing here for the floating rule to find.
  for (let x = mid - 2; x <= mid + 2; x++) {
    if (wet(x, mid - POND_DIG - 1)) continue;
    if ((x + scuff) % 2 !== 0) continue;
    put(x, 1, mid - POND_DIG - 1, "fern");
  }

  // The plank ramp out over the water, from the south rim. Each plank touches
  // the one behind it, so the run is one connected thing.
  for (let z = POND_SPAN - 1; z >= mid; z--) put(mid, 1, z, palette.planks);
  // The stilt under the far end, driven to the pond floor and standing in the
  // water it displaces.
  put(mid, 0, mid + 1, palette.fence, POST_WET);

  // The duck house on the end of the ramp: one cell of box under a stair roof.
  put(mid, 2, mid, palette.planks);
  put(mid, 3, mid, palette.stairs, {
    facing: "south",
    half: "bottom",
    shape: "straight",
    waterlogged: "false",
  });

  return { ops: NO_OPS, meta: metaOf("duck_pond", ctx.params) };
};

/* -------------------------------------------------------------------------- */
/* the midden                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * `midden_heap` — the muck heap by the yard.
 *
 * Three walls and an open front, which is the whole read: a heap with a wall
 * behind it is a midden and a heap without one is a mess. The muck is banked
 * against the back — two courses at the wall, one at the front — and the
 * **fork** stands in the top of it as a run of `iron_bars` resting on the
 * heap, because a fork left standing in the muck is the one detail that says
 * somebody works here.
 *
 * The front row is left bare ground with two courses of air over it: the barrow
 * has to get in.
 */
const middenHeap: PropGenerator = (ctx) => {
  const { put, palette } = ctx;
  const scuff = ctx.rng("midden.ground").int(0, 10);
  surface(put, 0, MIDDEN_SPAN, MIDDEN_SPAN, (x, z) => trodden(x, z, scuff));

  // Three walls: two sides and a back, never a ring — an open front is what
  // makes this a midden and not a cell.
  for (let y = 1; y <= 2; y++) {
    for (let z = 0; z <= MIDDEN_SPAN - 2; z++) {
      put(0, y, z, palette.stone);
      put(MIDDEN_SPAN - 1, y, z, palette.stone);
    }
    for (let x = 1; x < MIDDEN_SPAN - 1; x++) put(x, y, 0, palette.stone);
  }

  // The muck, banked against the back wall.
  for (let z = 1; z <= MIDDEN_SPAN - 2; z++) {
    for (let x = 1; x <= MIDDEN_SPAN - 2; x++) {
      put(x, 1, z, (x + z + scuff) % 5 === 0 ? "rooted_dirt" : "coarse_dirt");
      if (z <= 2) put(x, 2, z, "coarse_dirt");
    }
  }

  // The fork, standing in the top of the heap.
  put(2, 3, 1, "iron_bars", BARS_X);

  return { ops: NO_OPS, meta: metaOf("midden_heap", ctx.params) };
};

/* -------------------------------------------------------------------------- */
/* the sheep dip                                                               */
/* -------------------------------------------------------------------------- */

/**
 * `sheep_dip` — the sunken trough, sunk the way a prop on a `ground` base has
 * to sink one.
 *
 * The **deck is raised** a course all round and the trough is the base plane
 * itself, which is the same silhouette from outside and does not ask the placer
 * to dig — the sawpit's trick, and the same reason. The water in the trough is
 * a plain box: solid floor under it, the deck solid on both long sides, a
 * stopped end each way, open sky above.
 *
 * The **race** is the pair of hurdle runs on the deck that funnel a sheep to
 * the trough head, and the **draining pen** is the far side of the pad, at
 * ground level with the pen rails standing on it. Both ends of the pad stay at
 * ground level with two courses of air over them, so a body walks in and out.
 */
const sheepDip: PropGenerator = (ctx) => {
  const { put, palette } = ctx;
  const scuff = ctx.rng("dip.ground").int(0, 10);
  surface(put, 0, DIP_W, DIP_D, (x, z) => trodden(x, z, scuff));

  // The deck, raised one course either side of the trough. The two end columns
  // stay at ground level: those are the ways in and out.
  for (let z = 0; z < DIP_D; z++) {
    for (let x = 1; x <= DIP_W - 2; x++) {
      if (z === 2) continue; // the trough's own run
      put(x, 1, z, palette.stone);
    }
  }
  // The trough: stopped at both ends, water between the stops.
  put(1, 1, 2, palette.stone);
  put(DIP_W - 2, 1, 2, palette.stone);
  for (let x = 2; x <= DIP_W - 3; x++) put(x, 1, 2, "water");

  // The race: hurdles on the deck, funnelling to the trough head.
  for (const z of [1, 3]) {
    for (const x of [1, 3, DIP_W - 2]) put(x, 2, z, palette.fence, POST);
  }

  // The draining pen, the far side: rails on the ground, not on the deck.
  for (const z of [1, 3]) put(DIP_W - 1, 1, z, palette.fence, POST);
  for (const z of [1, 3]) put(0, 1, z, palette.fence, POST);

  return { ops: NO_OPS, meta: metaOf("sheep_dip", ctx.params) };
};

/* -------------------------------------------------------------------------- */
/* the staddle granary                                                         */
/* -------------------------------------------------------------------------- */

/**
 * `staddle_granary` — a grain box on mushroom stones, so the rats cannot
 * climb.
 *
 * Four **staddles**, each a full column of stone from the base plane to the
 * cap it carries, and the box a solid raft across them with a hatch in its
 * top. The point of the thing is the **gap** — the clear courses between the
 * ground and the floor of the box — so the cells between the staddles are left
 * empty and the way up is a **step standing beside the granary and not
 * touching it**, which is the note's whole joke and is drawn here as a single
 * stair on the ground.
 *
 * The box is solid rather than hollow on purpose: a 3x3 course with a ring of
 * walling round one cell of air is a sealed pocket, and a grain box that is
 * full of grain has no pocket in it.
 */
const staddleGranary: PropGenerator = (ctx) => {
  const { put, palette } = ctx;
  const scuff = ctx.rng("granary.ground").int(0, 10);
  surface(put, 0, GRANARY_SPAN, GRANARY_SPAN, (x, z) => turf(x, z, scuff));

  // The four staddles: a stone foot and the mushroom cap over it, both full
  // blocks, both in a column that reaches the ground.
  for (const [x, z] of [
    [1, 1],
    [3, 1],
    [1, 3],
    [3, 3],
  ] as const) {
    put(x, 1, z, palette.stone);
    put(x, 2, z, palette.stoneAccent);
  }

  // The box: a raft across the staddles, the grain in it, and the hatch on
  // top. Solid, for the pocket reason in this section's comment.
  for (let z = 1; z <= 3; z++) {
    for (let x = 1; x <= 3; x++) {
      put(x, 3, z, palette.planks);
      if (x === 2 && z === 2) {
        put(x, 4, z, palette.trapdoor, {
          facing: "north",
          half: "bottom",
          open: "false",
          powered: "false",
          waterlogged: "false",
        });
        continue;
      }
      put(x, 4, z, palette.planks);
    }
  }

  // The step that does not touch it, standing on the ground beside.
  put(0, 1, 2, palette.stairs, {
    facing: "east",
    half: "bottom",
    shape: "straight",
    waterlogged: "false",
  });

  return { ops: NO_OPS, meta: metaOf("staddle_granary", ctx.params) };
};

/* -------------------------------------------------------------------------- */
/* the hop yard                                                                */
/* -------------------------------------------------------------------------- */

/**
 * `hop_yard` — poles on a grid with wire runs between their heads.
 *
 * An **infrastructure-kind row hosted by the prop registry**, on
 * `stump_field`'s and `drydock`'s precedent: it is areal, it has a declared
 * box, and it is not a run between two points on the terrain, so nothing about
 * it wants the linework engine.
 *
 * Every pole is a **full-block column** from the base plane to its head, which
 * is the hard-won rule about poles, and the wire is `iron_bars` at the head
 * course joining pole to pole along both axes — never `chain`, which is not in
 * the pinned block table. The plants are the flora grammar's problem and this
 * file does not pretend otherwise: what it builds is the frame.
 *
 * The lanes between the rows are left completely clear, which is what a hop
 * yard is walked down.
 */
const hopYard: PropGenerator = (ctx) => {
  const { put, palette } = ctx;
  const w = hopLength(ctx.params);
  const scuff = ctx.rng("hops.ground").int(0, 10);
  surface(put, 0, w, HOP_D, (x, z) => turf(x, z, scuff));

  /** The pole grid, wide along the rows and tight across them. */
  const poleX = (x: number): boolean => x >= 2 && x <= w - 3 && (x - 2) % 6 === 0;
  const poleZ = (z: number): boolean => z >= 2 && z <= HOP_D - 3 && (z - 2) % 4 === 0;
  const head = HOP_H - 1;

  const lastX = (() => {
    let x = 2;
    for (let k = 2; k <= w - 3; k++) if (poleX(k)) x = k;
    return x;
  })();
  const lastZ = (() => {
    let z = 2;
    for (let k = 2; k <= HOP_D - 3; k++) if (poleZ(k)) z = k;
    return z;
  })();

  // The poles.
  for (let z = 0; z < HOP_D; z++) {
    if (!poleZ(z)) continue;
    for (let x = 0; x < w; x++) {
      if (!poleX(x)) continue;
      for (let y = 1; y <= head; y++) put(x, y, z, palette.log, { axis: "y" });
    }
  }

  // The wire runs, joining head to head along the rows.
  for (let z = 0; z < HOP_D; z++) {
    if (!poleZ(z)) continue;
    for (let x = 2; x <= lastX; x++) {
      if (poleX(x)) continue;
      put(x, head, z, "iron_bars", BARS_X);
    }
  }
  // And across them, so the frame is a frame and not a set of clotheslines.
  for (let x = 0; x < w; x++) {
    if (!poleX(x)) continue;
    for (let z = 2; z <= lastZ; z++) {
      if (poleZ(z)) continue;
      put(x, head, z, "iron_bars", BARS_Z);
    }
  }

  return { ops: NO_OPS, meta: metaOf("hop_yard", ctx.params) };
};

/* -------------------------------------------------------------------------- */
/* the stock pens                                                              */
/* -------------------------------------------------------------------------- */

/**
 * `stock_pens` — hurdle pens off a droving lane.
 *
 * The **lane** runs the length of the box down the middle and is left utterly
 * clear: ground, and two courses of air over it. A grid of hurdles either side
 * makes the pens, with a gap left in every long run so a pen is a pen and not
 * a box, and every hurdle is a fence — a fence is not a full cube, so a pen
 * fifteen cells long has nothing in it for the floating rule to find.
 *
 * At the far end, the **weigh crush**: two hurdle runs a cell apart with a
 * stopped head, which is the shape an animal is walked into and cannot turn
 * round in. At the near corner, the **auctioneer's step** — a stone and a slab
 * on it, the only thing in the prop a body stands on top of.
 */
const stockPens: PropGenerator = (ctx) => {
  const { put, palette } = ctx;
  const w = pensLength(ctx.params);
  const scuff = ctx.rng("pens.ground").int(0, 10);
  surface(put, 0, w, PENS_D, (x, z) => trodden(x, z, scuff));

  const lane = Math.floor(PENS_D / 2);
  /** A gap in a rail run, so a pen has a way in. */
  const gap = (x: number): boolean => x % 6 === 3;

  // The rails: the outer boundary and the two lane-side runs.
  for (const z of [0, lane - 1, lane + 1, PENS_D - 1]) {
    for (let x = 0; x < w; x++) {
      if (gap(x)) continue;
      put(x, 1, z, palette.fence, POST);
    }
  }
  // The cross hurdles that divide the run into pens.
  for (let x = 0; x < w; x++) {
    if (x % 6 !== 0) continue;
    for (let z = 0; z < PENS_D; z++) {
      if (z === lane || z === lane - 1 || z === lane + 1) continue;
      put(x, 1, z, palette.fence, POST);
    }
  }

  // The weigh crush at the far end: a chute a cell wide with a stopped head.
  for (const z of [lane - 3, lane - 1]) {
    for (let x = w - 4; x <= w - 2; x++) put(x, 1, z, palette.fence, POST);
  }
  put(w - 2, 1, lane - 2, palette.stone);

  // The auctioneer's step, at the near corner of the lane.
  put(1, 1, lane - 2, palette.stone);
  put(1, 2, lane - 2, palette.stoneSlab, SLAB_BOTTOM);

  return { ops: NO_OPS, meta: metaOf("stock_pens", ctx.params) };
};

/* -------------------------------------------------------------------------- */
/* the well sweep                                                              */
/* -------------------------------------------------------------------------- */

/**
 * `well_sweep` — the counterweighted lever over an open well.
 *
 * The **post** is a full-block column from the base plane to its head, every
 * course of it, and the **beam** is a run of log laid across the head with the
 * counterweight stone hung on the short arm and the bucket line hanging from
 * the long one. Each cell of the beam touches the cell beside it and the first
 * of them touches the post, so the whole lever is one connected thing; drawn
 * as a true diagonal it would be a run of blocks touching each other only at
 * their corners, which is `floating.isolated` in its oldest clothes.
 *
 * The **well** under the bucket is the plaza well's own shape: a ring of stone
 * at the base plane's next course with one cell of water inside it, floor
 * under the water and stone on all four sides of it.
 */
const wellSweep: PropGenerator = (ctx) => {
  const { put, palette } = ctx;
  const scuff = ctx.rng("sweep.ground").int(0, 10);
  surface(put, 0, SWEEP_SPAN, SWEEP_SPAN, (x, z) => trodden(x, z, scuff));

  const mid = Math.floor(SWEEP_SPAN / 2);
  const wellX = 5;

  // The well: a ring of stone round one cell of water. Contained on all four
  // sides and underneath, open above — the plaza well's argument exactly.
  for (let z = mid - 1; z <= mid + 1; z++) {
    for (let x = wellX - 1; x <= wellX + 1; x++) {
      if (x === wellX && z === mid) continue;
      put(x, 1, z, palette.stone);
    }
  }
  put(wellX, 1, mid, "water");

  // The forked post, a full column to its head.
  for (let y = 1; y <= 5; y++) put(1, y, mid, palette.log, { axis: "y" });

  // The beam, laid across the head from the post out over the well.
  for (let x = 2; x <= wellX; x++) put(x, 5, mid, palette.log, { axis: "x" });

  // The counterweight on the short arm, and the bucket line on the long one.
  put(0, 5, mid, palette.stoneAccent);
  put(wellX, 4, mid, "iron_bars", BARS_Z);
  put(wellX, 3, mid, "iron_bars", BARS_Z);

  return { ops: NO_OPS, meta: metaOf("well_sweep", ctx.params) };
};

/* -------------------------------------------------------------------------- */
/* the registry                                                                */
/* -------------------------------------------------------------------------- */

/** Every generator this file contributes, merged into `PROP_GENERATORS`. */
export const HEDGEROW_PROP_GENERATORS: Readonly<Record<string, PropGenerator>> = Object.freeze({
  field_gate: fieldGate,
  duck_pond: duckPond,
  midden_heap: middenHeap,
  sheep_dip: sheepDip,
  staddle_granary: staddleGranary,
  hop_yard: hopYard,
  stock_pens: stockPens,
  well_sweep: wellSweep,
});
