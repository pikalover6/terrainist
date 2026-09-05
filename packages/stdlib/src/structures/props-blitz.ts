/**
 * `prop.place@0` — the breadth wave: street furniture, waterworks, camps,
 * yards and smallcraft.
 *
 * `props.ts` owns the first nine props and the whole contract they obey — node
 * local coordinates, `y = 0` is the base plane, block *names* not state ids,
 * every op inside the declared box so `rotateOps` needs no special case. This
 * file adds fifteen more without touching a line of that contract, and it is a
 * leaf of the graph on purpose: it imports **types** from `props.ts` and no
 * values at all, so the one edge `props.ts` → this file cannot become a cycle
 * at module-initialisation time.
 *
 * Three kinds of thing live here, and the difference is worth naming because it
 * is the difference the catalog draws:
 *
 * - **smallcraft** — a bench, a planter, a signpost. One or two dozen blocks.
 *   The whole prop is the object.
 * - **compounds** — a graveyard, a campsite. Several objects and the ground
 *   between them, placed as one node because the arrangement *is* the subject:
 *   a headstone on its own is a rock, and thirty of them behind a fence is a
 *   graveyard.
 * - **works** — a swimming pool, a curtain wall. Structures with no interior
 *   worth walking but real geometry: a basin dug into the ground, a rampart
 *   with a stair up it.
 *
 * ## Fluid safety, again
 *
 * One prop here holds water — the pool — and it is safe by the same argument
 * the fountain is, one storey larger. The basin is a **box**: a solid floor at
 * `y = -4`, a solid wall ring from `y = -4` up to the coping at `y = 0`, and
 * water filling `y = -3 … -1` inside it. Every water cell's four horizontal
 * neighbours are wall, ladder or more water at the same level, and the cell
 * below every one is water or floor. The surface at `y = -1` is open to the
 * sky, which is what a pool is; `checkPropFluidSafety` does not check the up
 * face for exactly that reason, and the one-tick spread simulation has nowhere
 * to go sideways or down.
 */

import type { LocalVoxelOp } from "./core.js";
import { definePropDescriptors, type PropDescriptor } from "./descriptor.js";
import type { PropBase, PropContext, PropGenerator, PropMeta, PropPalette } from "./props.js";

/* -------------------------------------------------------------------------- */
/* the catalog                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Every prop this file builds, in catalog order.
 *
 * Spread into `PROP_NAMES` by `props.ts`, which is the one place a prop name
 * is enumerated. The order is street furniture, then the works, then the camps
 * and the yards, then the odds and ends — the same order the catalog reads in.
 */
export const BLITZ_PROP_NAMES = [
  "bench",
  "planter",
  "clothesline",
  "scarecrow",
  "market_barrow",
  "signpost",
  "swimming_pool",
  "curtain_wall",
  "graveyard",
  "tent",
  "caravan",
  "campsite",
  "treehouse",
  "cairn",
  "carousel",
] as const;

/** One of the props this file builds. */
export type BlitzPropName = (typeof BLITZ_PROP_NAMES)[number];

/** True for a name this file answers to. */
export function isBlitzProp(name: string): name is BlitzPropName {
  return (BLITZ_PROP_NAMES as readonly string[]).includes(name);
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

/* -------------------------------------------------------------------------- */
/* footprints                                                                  */
/* -------------------------------------------------------------------------- */

/** The declared box of one of this file's props, before it is generated. */
export function blitzPropFootprint(
  prop: BlitzPropName,
  params: Readonly<Record<string, unknown>> = {},
): {
  readonly size: readonly [number, number, number];
  readonly minY: number;
  readonly base: PropBase;
} {
  const ground = (
    size: readonly [number, number, number],
    minY = 0,
  ): { size: readonly [number, number, number]; minY: number; base: PropBase } => ({
    size,
    minY,
    base: "ground",
  });
  switch (prop) {
    case "bench":
      return ground([4, 2, 1]);
    case "planter":
      return ground([3, 2, 3]);
    case "clothesline":
      return ground([7, 3, 1]);
    case "scarecrow":
      return ground([3, 4, 1]);
    case "market_barrow":
      return ground([3, 3, 2]);
    case "signpost":
      return ground([3, 4, 1]);
    case "swimming_pool":
      // `y = -4` is the basin floor and `y = 2` the diving board: seven courses.
      return ground([POOL_WIDTH, 7, POOL_DEPTH], -4);
    case "curtain_wall":
      return ground([readInt(params, "length", 16, 6, 64), 6, 3]);
    case "graveyard":
      return ground([GRAVEYARD_W, 6, GRAVEYARD_D]);
    case "tent":
      return ground([TENT_W, 4, TENT_D]);
    case "caravan":
      return ground([5, 6, 3]);
    case "campsite":
      return ground([CAMPSITE_W, 6, CAMPSITE_D]);
    case "treehouse":
      return ground([TREEHOUSE_SPAN, 17, TREEHOUSE_SPAN]);
    case "cairn":
      return ground([5, 4, 5]);
    case "carousel":
    default:
      return ground([CAROUSEL_SPAN, 7, CAROUSEL_SPAN]);
  }
}

/** Build a `PropMeta` from the declared footprint, so the two cannot drift. */
function metaOf(
  prop: BlitzPropName,
  params: Readonly<Record<string, unknown>> = {},
): PropMeta {
  const foot = blitzPropFootprint(prop, params);
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

/* -------------------------------------------------------------------------- */
/* shared shapes                                                               */
/* -------------------------------------------------------------------------- */

/** A masonry mix, keyed by position so a re-run is byte-identical. */
function stoneAt(palette: PropPalette, x: number, y: number, z: number): string {
  return (x * 7 + y * 13 + z * 5) % 5 === 0 ? palette.stoneAccent : palette.stone;
}

/** The octagon mask of a square span: the square with its corners cut. */
function octagon(span: number): { x: number; z: number }[] {
  const c = (span - 1) / 2;
  const out: { x: number; z: number }[] = [];
  for (let x = 0; x < span; x++) {
    for (let z = 0; z < span; z++) {
      if (Math.abs(x - c) + Math.abs(z - c) > c + 1) continue;
      out.push({ x, z });
    }
  }
  return out;
}

/** Leaves that match a palette's log, falling back to oak. */
function leavesOf(log: string): string {
  const match = /^(?:stripped_)?([a-z_]+)_log$/.exec(log);
  return match === null ? "oak_leaves" : `${match[1] as string}_leaves`;
}

/** The property map every leaf block this file places carries. */
const LEAF_PROPS: Record<string, string> = {
  persistent: "true",
  distance: "7",
  waterlogged: "false",
};

/* -------------------------------------------------------------------------- */
/* street furniture                                                            */
/* -------------------------------------------------------------------------- */

/**
 * `bench` — two log ends carrying a plank seat.
 *
 * Three cells long, one deep, two high. The middle seat slab stands over air,
 * which is what a bench *is*, and it is not a `floating.slab` finding because
 * the rule asks for air on every side and this one has a slab either side of
 * it.
 */
const bench: PropGenerator = ({ put, palette }) => {
  for (const x of [0, 3]) put(x, 0, 0, palette.stripped, { axis: "z" });
  for (let x = 0; x < 4; x++) put(x, 1, 0, palette.slab, { type: "bottom" });
  return { ops: NO_OPS, meta: metaOf("bench") };
};

/**
 * `planter` — a masonry box with something growing out of it.
 *
 * The rim is the eight perimeter cells at the base plane and the soil is the
 * ninth, so the plant at `y = 1` stands on dirt with stone all round it: a
 * raised bed, not a shrub in a hole.
 */
const planter: PropGenerator = (ctx) => {
  const { put, palette } = ctx;
  for (let x = 0; x < 3; x++) {
    for (let z = 0; z < 3; z++) {
      if (x === 1 && z === 1) {
        put(x, 0, z, "dirt");
        continue;
      }
      put(x, 0, z, palette.stoneAccent);
    }
  }
  const plants = ["fern", "azure_bluet", "poppy", "oxeye_daisy", "cornflower"];
  put(1, 1, 1, plants[ctx.rng("planter").int(0, plants.length - 1)] as string);
  return { ops: NO_OPS, meta: metaOf("planter") };
};

/**
 * `clothesline` — two posts, a line between them, and washing on it.
 *
 * The line is `prop.chain` (iron bars by default) rather than a rope, because
 * there is no rope block; the washing hangs one course *below* the line, so
 * every wool cell has the line above it and is therefore not an isolated block.
 */
const clothesline: PropGenerator = (ctx) => {
  const { put, palette } = ctx;
  const span = 7;
  for (const x of [0, span - 1]) {
    for (let y = 0; y <= 1; y++) put(x, y, 0, palette.fence);
  }
  for (let x = 0; x < span; x++) put(x, 2, 0, palette.chain);
  const wools = ["white_wool", "light_blue_wool", "yellow_wool", "light_gray_wool"];
  const rng = ctx.rng("clothesline");
  for (const x of [2, 4]) put(x, 1, 0, wools[rng.int(0, wools.length - 1)] as string);
  return { ops: NO_OPS, meta: metaOf("clothesline") };
};

/**
 * `scarecrow` — a post, a straw body, two stick arms and a pumpkin head.
 *
 * Every cell stands on the one below it or is a fence, which needs nothing, so
 * the whole figure is supported without a single block of scaffolding.
 */
const scarecrow: PropGenerator = ({ put, palette }) => {
  for (let y = 0; y <= 1; y++) put(1, y, 0, palette.fence);
  put(1, 2, 0, palette.hay, { axis: "y" });
  for (const x of [0, 2]) put(x, 2, 0, palette.fence);
  put(1, 3, 0, "carved_pumpkin", { facing: "south" });
  return { ops: NO_OPS, meta: metaOf("scarecrow") };
};

/** `market_barrow` — a two-wheeled handcart with the day's goods on it. */
const marketBarrow: PropGenerator = (ctx) => {
  const { put, palette } = ctx;
  for (let z = 0; z < 2; z++) put(0, 0, z, palette.stripped, { axis: "z" });
  for (let x = 0; x < 3; x++) {
    for (let z = 0; z < 2; z++) put(x, 1, z, palette.planks);
  }
  // The handles: two open trapdoors standing off the tail board.
  for (let z = 0; z < 2; z++) {
    put(2, 2, z, palette.trapdoor, { facing: "west", half: "bottom", open: "true" });
  }
  if (ctx.rng("barrow").float() < 0.5) put(1, 2, 0, palette.cargo, { facing: "up", open: "false" });
  else put(1, 2, 0, palette.hay, { axis: "y" });
  return { ops: NO_OPS, meta: metaOf("market_barrow") };
};

/**
 * `signpost` — a post, two fingerboards and a board on top.
 *
 * The head is a plank block and not a sign, deliberately: a sign is a block
 * **entity**, and everything this compiler emits has to survive a load-save
 * round trip as blocks alone. `blockentity.orphan` is the rule that says so,
 * and it is right — a sign written without its entity is a sign the client
 * deletes on load.
 */
const signpost: PropGenerator = ({ put, palette }) => {
  for (let y = 0; y <= 2; y++) put(1, y, 0, palette.fence);
  put(1, 3, 0, palette.planks);
  // The fingerboards: two open trapdoors standing out from the post, one each
  // way, which is what turns a post with a sign on it into a direction post.
  put(0, 2, 0, palette.trapdoor, { facing: "east", half: "top", open: "true" });
  put(2, 2, 0, palette.trapdoor, { facing: "west", half: "top", open: "true" });
  return { ops: NO_OPS, meta: metaOf("signpost") };
};

/* -------------------------------------------------------------------------- */
/* the swimming pool                                                           */
/* -------------------------------------------------------------------------- */

/** Pool extents, in blocks. Fixed: a lane is a length, not a parameter. */
const POOL_WIDTH = 13;
/** See {@link POOL_WIDTH}. */
const POOL_DEPTH = 9;
/** Basin floor, below the base plane. */
export const POOL_FLOOR_Y = -4;
/** The water surface — one below the coping, so the coping is a closed rim. */
export const POOL_WATER_Y = -1;

/**
 * `swimming_pool` — an in-ground basin, watertight by construction.
 *
 * The geometry, and why each piece is load-bearing:
 *
 * - the **coping** at `y = 0` is the whole perimeter ring, one course proud of
 *   the ground, which is what a pool surround looks like and what makes the
 *   rim a closed line rather than a change of texture;
 * - the **wall** runs from the coping down to the floor at every ring column,
 *   so the water inside can see nothing but masonry on all four sides;
 * - the **water** fills `y = -3 … -1` inside the ring. The top course sits at
 *   ground level, so the pool reads as dug rather than as a tank;
 * - the **lane ropes** are a line of stained glass replacing water at the
 *   surface. Replacing water with solid can never destabilise the rest of it,
 *   which is the same argument the boats' hulls make;
 * - the **ladder** hangs on the west wall with its rungs facing east — the
 *   block behind them is the wall, solid at every course it passes;
 * - the **diving board** cantilevers from the east coping on two posts, and
 *   every slab of it touches the next one, so none of them is a floating slab.
 */
const swimmingPool: PropGenerator = ({ put, palette }) => {
  const w = POOL_WIDTH;
  const d = POOL_DEPTH;
  const lastX = w - 1;
  const lastZ = d - 1;
  const isRing = (x: number, z: number): boolean =>
    x === 0 || z === 0 || x === lastX || z === lastZ;

  for (let x = 0; x < w; x++) {
    for (let z = 0; z < d; z++) {
      // The floor, everywhere: the basin stands on it and so does the wall.
      put(x, POOL_FLOOR_Y, z, palette.stone);
      if (isRing(x, z)) {
        for (let y = POOL_FLOOR_Y + 1; y <= 0; y++) put(x, y, z, stoneAt(palette, x, y, z));
        continue;
      }
      for (let y = POOL_FLOOR_Y + 1; y <= POOL_WATER_Y; y++) put(x, y, z, "water", { level: "0" });
    }
  }

  // Lane ropes: two lines at the surface, in alternating floats.
  for (const z of [3, 5]) {
    for (let x = 1; x < lastX; x++) {
      put(x, POOL_WATER_Y, z, x % 2 === 0 ? "white_stained_glass" : "light_blue_stained_glass");
    }
  }
  // Lane markers on the floor, so the bottom is not a slab of grey.
  for (const z of [2, 4, 6]) {
    for (let x = 2; x < lastX - 1; x += 2) put(x, POOL_FLOOR_Y, z, "light_blue_terracotta");
  }

  // The ladder, in the shallow end's west wall. `facing: east` fixes the rungs
  // to the cell at `x - 1`, which is the wall ring.
  for (let y = POOL_FLOOR_Y + 1; y <= 0; y++) put(1, y, 2, "ladder", { facing: "east" });

  // The diving board: two posts on the east coping and a plank cantilever out
  // over the deep end.
  const mid = d >> 1;
  put(lastX, 1, mid, palette.fence);
  for (let x = lastX; x >= lastX - 3; x--) put(x, 2, mid, palette.slab, { type: "bottom" });

  // Corner lamps, standing on the coping.
  for (const [x, z] of [
    [0, 0],
    [0, lastZ],
    [lastX, 0],
    [lastX, lastZ],
  ] as const) {
    put(x, 1, z, palette.lantern, { hanging: "false" });
  }

  return { ops: NO_OPS, meta: metaOf("swimming_pool") };
};

/* -------------------------------------------------------------------------- */
/* the curtain wall                                                            */
/* -------------------------------------------------------------------------- */

/**
 * `curtain_wall` — a rampart segment with a walkway, a parapet and a stair.
 *
 * The military anchor set's linear piece. Three cells thick: two faces and a
 * core, solid to `y = 2`, with the walkway plane at `y = 3` and a merlon
 * course above the two faces. The first three bays of the middle lane carry a
 * stair flight instead of core, and the walkway over that flight is left open —
 * a rampart you cannot get onto is a wall, and a wall is a different structure.
 */
const curtainWall: PropGenerator = ({ put, palette, params }) => {
  const length = readInt(params, "length", 16, 6, 64);
  /** Bays the access stair occupies at the west end. */
  const stairBays = 3;

  for (let x = 0; x < length; x++) {
    for (let z = 0; z < 3; z++) {
      for (let y = 0; y <= 3; y++) {
        put(x, y, z, stoneAt(palette, x, y, z));
      }
    }
  }
  // The stair: a flight up the middle lane, and the walkway over it opened up.
  for (let k = 0; k < stairBays; k++) {
    put(k, k + 1, 1, palette.stoneStairs, { facing: "east", half: "bottom", shape: "straight" });
    for (let y = k + 2; y <= 3; y++) put(k, y, 1, "air");
  }
  // The parapet: a solid course on the two faces, merlons on alternate cells.
  for (let x = 0; x < length; x++) {
    for (const z of [0, 2]) {
      put(x, 4, z, stoneAt(palette, x, 4, z));
      if ((x + z) % 2 === 0) put(x, 5, z, stoneAt(palette, x, 5, z));
    }
  }
  // A brazier on the walkway at the far end, standing on the walk plane.
  put(length - 2, 4, 1, palette.lantern, { hanging: "false" });

  return { ops: NO_OPS, meta: metaOf("curtain_wall", params) };
};

/* -------------------------------------------------------------------------- */
/* the graveyard                                                               */
/* -------------------------------------------------------------------------- */

/** Graveyard extents. */
const GRAVEYARD_W = 15;
/** See {@link GRAVEYARD_W}. */
const GRAVEYARD_D = 13;

/**
 * `graveyard` — a fenced yard, a seeded field of headstones, and a mausoleum.
 *
 * A compound: the arrangement is the subject. The yard is a fence perimeter
 * with a gap for the gate on the south face and a slab path up the middle; the
 * headstones are drawn from four shapes on a regular grid, so the yard reads
 * as *tended* rather than as scattered rock; and the north-west corner carries
 * a small stone mausoleum with a doorway, a roof and a light in it.
 */
const graveyard: PropGenerator = (ctx) => {
  const { put, palette } = ctx;
  const w = GRAVEYARD_W;
  const d = GRAVEYARD_D;
  const rng = ctx.rng("graveyard");

  // --- the fence, with a gate gap in the middle of the south face -----------
  const gate = w >> 1;
  for (let x = 0; x < w; x++) {
    for (const z of [0, d - 1]) {
      if (z === d - 1 && (x === gate || x === gate - 1)) continue;
      put(x, 0, z, palette.fence);
    }
  }
  for (let z = 1; z < d - 1; z++) {
    for (const x of [0, w - 1]) put(x, 0, z, palette.fence);
  }
  // Gate posts: a lantern on each, so the way in reads at night.
  for (const x of [gate - 2, gate + 1]) {
    put(x, 1, d - 1, palette.lantern, { hanging: "false" });
  }

  // --- the path -------------------------------------------------------------
  for (let z = 1; z < d - 1; z++) {
    for (const x of [gate - 1, gate]) put(x, 0, z, palette.stoneSlab, { type: "top" });
  }

  // --- the mausoleum, in the north-west corner ------------------------------
  const mx = 1;
  const mz = 1;
  const span = 5;
  for (let x = mx; x < mx + span; x++) {
    for (let z = mz; z < mz + span; z++) {
      const wall = x === mx || z === mz || x === mx + span - 1 || z === mz + span - 1;
      if (!wall) {
        put(x, 0, z, palette.stoneSlab, { type: "top" });
        continue;
      }
      // The doorway: the middle of the south face, two courses of it.
      const doorway = z === mz + span - 1 && x === mx + 2;
      for (let y = 0; y <= 3; y++) {
        if (doorway && y <= 1) continue;
        put(x, y, z, stoneAt(palette, x, y, z));
      }
    }
  }
  for (let x = mx; x < mx + span; x++) {
    for (let z = mz; z < mz + span; z++) put(x, 4, z, palette.stoneSlab, { type: "bottom" });
  }
  // The sarcophagus, and the light over it.
  put(mx + 2, 0, mz + 1, "chiseled_stone_bricks");
  put(mx + 2, 1, mz + 1, palette.stoneSlab, { type: "bottom" });
  put(mx + 2, 3, mz + 2, palette.lantern, { hanging: "true" });

  // --- the headstones -------------------------------------------------------
  // A regular grid, four shapes, drawn per plot: a tended yard, not a scatter.
  for (let z = 2; z < d - 1; z += 2) {
    for (let x = 1; x < w - 1; x += 2) {
      if (x >= mx && x < mx + span && z >= mz && z < mz + span) continue;
      if (x === gate - 1 || x === gate) continue;
      const shape = rng.int(0, 4);
      if (shape === 4) continue; // an empty plot: a yard is never full
      put(x, 0, z, "podzol");
      switch (shape) {
        case 0:
          put(x, 1, z, palette.stoneWall, { up: "true", waterlogged: "false" });
          put(x, 2, z, palette.stoneSlab, { type: "bottom" });
          break;
        case 1:
          put(x, 1, z, "chiseled_stone_bricks");
          break;
        case 2:
          put(x, 1, z, palette.stoneStairs, { facing: "south", half: "bottom", shape: "straight" });
          break;
        default:
          put(x, 1, z, palette.stoneAccent);
          put(x, 2, z, palette.stoneWall, { up: "true", waterlogged: "false" });
          break;
      }
    }
  }

  return { ops: NO_OPS, meta: metaOf("graveyard") };
};

/* -------------------------------------------------------------------------- */
/* camps                                                                       */
/* -------------------------------------------------------------------------- */

/** Tent extents. */
const TENT_W = 5;
/** See {@link TENT_W}. */
const TENT_D = 5;

/**
 * Draw one A-frame tent at an offset.
 *
 * Shared by {@link tent} and {@link campsite}, which is the whole reason it is
 * a function: a campsite with a *different* tent in it would be two designs.
 */
function drawTent(
  put: PropContext["put"],
  palette: PropPalette,
  canvas: string,
  ox: number,
  oz: number,
): void {
  const mid = 2;
  // The ridge: a log on two posts, running along x.
  for (const x of [0, TENT_W - 1]) {
    for (let y = 0; y <= 2; y++) put(ox + x, y, oz + mid, palette.fence);
  }
  for (let x = 0; x < TENT_W; x++) put(ox + x, 3, oz + mid, palette.log, { axis: "x" });
  // The canvas: two slopes, one course out and one down per step.
  for (let x = 0; x < TENT_W; x++) {
    for (let k = 1; k <= 2; k++) {
      const y = 3 - k;
      put(ox + x, y, oz + mid - k, canvas);
      put(ox + x, y, oz + mid + k, canvas);
    }
  }
  // The bedroll, and the door flap pinned open at the east end.
  put(ox + 1, 0, oz + mid, "white_carpet");
  put(ox + 2, 0, oz + mid, "white_carpet");
  put(ox + TENT_W - 1, 1, oz + mid - 1, palette.trapdoor, {
    facing: "west",
    half: "bottom",
    open: "true",
  });
}

/** `tent` — one A-frame of canvas on a ridge pole. */
const tent: PropGenerator = (ctx) => {
  const canvases = ["white_wool", "light_gray_wool", "brown_wool", "red_wool"];
  const canvas = canvases[ctx.rng("tent").int(0, canvases.length - 1)] as string;
  drawTent(ctx.put, ctx.palette, canvas, 0, 0);
  return { ops: NO_OPS, meta: metaOf("tent") };
};

/**
 * Draw one caravan at an offset — a wagon someone lives in.
 *
 * Wheels at the base plane, a plank body raised on them, a door at the back, a
 * window in the side, a slab roof and a stove pipe. Shared with the campsite
 * for the reason {@link drawTent} is.
 */
function drawCaravan(put: PropContext["put"], palette: PropPalette, ox: number, oz: number): void {
  for (const x of [0, 4]) {
    for (let z = 0; z < 3; z++) put(ox + x, 0, oz + z, palette.stripped, { axis: "z" });
  }
  for (let x = 0; x < 5; x++) {
    for (let z = 0; z < 3; z++) put(ox + x, 1, oz + z, palette.planks);
  }
  for (let y = 2; y <= 3; y++) {
    for (let x = 0; x < 5; x++) {
      for (let z = 0; z < 3; z++) {
        if (x > 0 && x < 4 && z > 0 && z < 2) continue; // the room
        // The doorway: the middle of the west end.
        if (x === 0 && z === 1) continue;
        put(ox + x, y, oz + z, x === 0 || x === 4 ? palette.log : palette.planks, {
          ...(x === 0 || x === 4 ? { axis: "y" } : {}),
        });
      }
    }
  }
  // A window each side, and the roof over the lot.
  for (const z of [0, 2]) put(ox + 2, 2, oz + z, "glass_pane", { east: "true", west: "true" });
  for (let x = 0; x < 5; x++) {
    for (let z = 0; z < 3; z++) put(ox + x, 4, oz + z, palette.roofSlab, { type: "bottom" });
  }
  // The stove pipe, standing on the roof.
  put(ox + 3, 5, oz + 1, palette.stoneWall, { up: "true", waterlogged: "false" });
  put(ox + 1, 2, oz + 1, palette.lantern, { hanging: "false" });
}

/** `caravan` — a living wagon: wheels, a room, a window and a stove pipe. */
const caravan: PropGenerator = (ctx) => {
  drawCaravan(ctx.put, ctx.palette, 0, 0);
  return { ops: NO_OPS, meta: metaOf("caravan") };
};

/** Campsite extents. */
const CAMPSITE_W = 19;
/** See {@link CAMPSITE_W}. */
const CAMPSITE_D = 13;

/**
 * `campsite` — two tents, a caravan, a fire and the ground between them.
 *
 * The nomadic compound. The fire is the centre and everything faces it: log
 * seats on two sides, a firewood pile on a third, a lamp on a post. A campfire
 * stands on the ground, the seats are stripped logs lying on it, and nothing
 * here is more than two courses tall — a camp reads as *temporary*, and the
 * silhouette is how.
 */
const campsite: PropGenerator = (ctx) => {
  const { put, palette } = ctx;
  const rng = ctx.rng("campsite");
  const canvases = ["white_wool", "light_gray_wool", "brown_wool", "red_wool"];

  drawTent(put, palette, canvases[rng.int(0, canvases.length - 1)] as string, 0, 0);
  drawTent(put, palette, canvases[rng.int(0, canvases.length - 1)] as string, 0, CAMPSITE_D - TENT_D);
  drawCaravan(put, palette, CAMPSITE_W - 5, (CAMPSITE_D - 3) >> 1);

  // The fire, on a ring of stone, in the middle of the camp.
  const fx = 9;
  const fz = CAMPSITE_D >> 1;
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      if (dx === 0 && dz === 0) continue;
      put(fx + dx, 0, fz + dz, stoneAt(palette, fx + dx, 0, fz + dz));
    }
  }
  put(fx, 0, fz, "campfire", {
    lit: "true",
    facing: "north",
    signal_fire: "false",
    waterlogged: "false",
  });
  // Seats and firewood, two cells back from the fire on three sides.
  for (const dz of [-3, 3]) {
    for (let dx = -1; dx <= 1; dx++) put(fx + dx, 0, fz + dz, palette.stripped, { axis: "x" });
  }
  for (let dz = -1; dz <= 1; dz++) put(fx + 3, 0, fz + dz, palette.log, { axis: "z" });
  put(fx + 3, 1, fz, palette.log, { axis: "z" });
  // The camp lamp: a post with a lantern on it.
  for (let y = 0; y <= 1; y++) put(fx - 3, y, fz, palette.fence);
  put(fx - 3, 2, fz, palette.lantern, { hanging: "false" });
  // A crate and a cauldron by the caravan.
  put(CAMPSITE_W - 7, 0, fz, palette.cargo, { facing: "up", open: "false" });
  put(CAMPSITE_W - 7, 0, fz + 1, "cauldron", { level: "0" });

  return { ops: NO_OPS, meta: metaOf("campsite") };
};

/* -------------------------------------------------------------------------- */
/* the treehouse                                                               */
/* -------------------------------------------------------------------------- */

/** Treehouse span, in blocks — the canopy's, which is the widest part. */
const TREEHOUSE_SPAN = 9;
/** Y of the platform deck. */
const TREEHOUSE_DECK = 9;

/**
 * `treehouse` — a hut on a platform on a trunk this prop grows itself.
 *
 * There is no tree to build on, so the prop builds one: a 2 × 2 mega trunk from
 * the base plane to the deck, a canopy of leaves around and above it, a plank
 * platform with a rail, a hut with a door and a pitched roof, and a ladder up
 * the trunk's west face.
 *
 * The ladder is the piece that has to be right: `facing: east` names the cell
 * at `x - 1` as the block behind the rungs, so the ladder stands at `x = 3`
 * and the trunk column at `x = 2`… which is exactly backwards from what reads
 * naturally, so it is the other way round — rungs at `x = 2` facing **west**,
 * with the trunk at `x = 3` behind them. The deck leaves that column open, so
 * the climb ends on the platform rather than under it.
 */
const treehouse: PropGenerator = ({ put, palette }) => {
  const span = TREEHOUSE_SPAN;
  const deck = TREEHOUSE_DECK;
  const trunk: readonly (readonly [number, number])[] = [
    [3, 4],
    [4, 4],
    [3, 5],
    [4, 5],
  ];
  const leaves = leavesOf(palette.log);

  // --- the trunk, and its root flare ---------------------------------------
  for (const [x, z] of trunk) {
    for (let y = 0; y <= deck + 4; y++) put(x, y, z, palette.log, { axis: "y" });
  }
  for (const [x, z] of [
    [2, 4],
    [5, 4],
    [3, 3],
    [3, 6],
  ] as const) {
    put(x, 0, z, palette.log, { axis: "y" });
  }

  // --- the deck -------------------------------------------------------------
  const inDeck = (x: number, z: number): boolean =>
    x >= 1 && x <= span - 2 && z >= 2 && z <= span - 3;
  for (let x = 0; x < span; x++) {
    for (let z = 0; z < span; z++) {
      if (!inDeck(x, z)) continue;
      if (trunk.some(([tx, tz]) => tx === x && tz === z)) continue;
      if (x === 2 && z === 4) continue; // the ladder comes up here
      put(x, deck, z, palette.planks);
    }
  }
  // The rail, round the deck's boundary, with the ladder's bay left open.
  for (let x = 0; x < span; x++) {
    for (let z = 0; z < span; z++) {
      if (!inDeck(x, z)) continue;
      const edge =
        !inDeck(x - 1, z) || !inDeck(x + 1, z) || !inDeck(x, z - 1) || !inDeck(x, z + 1);
      if (!edge) continue;
      if (x === 2 && z === 4) continue;
      if (trunk.some(([tx, tz]) => tx === x && tz === z)) continue;
      // The hut takes the north half; its wall is its own rail.
      if (z <= 4) continue;
      put(x, deck + 1, z, palette.fence);
    }
  }

  // --- the hut, over the north half of the deck -----------------------------
  for (let x = 1; x <= span - 2; x++) {
    for (let z = 2; z <= 4; z++) {
      const wall = x === 1 || x === span - 2 || z === 2 || z === 4;
      if (!wall) continue;
      const doorway = z === 4 && x === 5;
      for (let y = deck + 1; y <= deck + 3; y++) {
        if (doorway && y <= deck + 2) continue;
        if (trunk.some(([tx, tz]) => tx === x && tz === z)) continue;
        put(x, y, z, palette.planks);
      }
    }
  }
  put(2, deck + 2, 2, "glass_pane", { east: "true", west: "true" });
  put(span - 3, deck + 2, 2, "glass_pane", { east: "true", west: "true" });
  for (let x = 1; x <= span - 2; x++) {
    for (let z = 2; z <= 4; z++) put(x, deck + 4, z, palette.roofSlab, { type: "bottom" });
  }
  put(3, deck + 3, 3, palette.lantern, { hanging: "true" });

  // --- the ladder -----------------------------------------------------------
  // `facing: west` fixes the rungs to the cell at `x + 1`, which is the trunk.
  for (let y = 0; y <= deck; y++) put(2, y, 4, "ladder", { facing: "west" });

  // --- the canopy -----------------------------------------------------------
  // A blob around the trunk head: leaves wherever the manhattan distance from
  // the crown allows, which reads as a crown without a sphere routine.
  const cy = deck + 4;
  for (let x = 0; x < span; x++) {
    for (let z = 0; z < span; z++) {
      for (let y = cy; y <= cy + 3; y++) {
        const dx = Math.abs(x - 3.5);
        const dz = Math.abs(z - 4.5);
        const dy = Math.abs(y - (cy + 1.5));
        if (dx + dz + dy * 1.5 > 6) continue;
        if (trunk.some(([tx, tz]) => tx === x && tz === z) && y <= cy) continue;
        if (x >= 1 && x <= span - 2 && z >= 2 && z <= 4 && y <= cy) continue; // the hut roof
        put(x, y, z, leaves, LEAF_PROPS);
      }
    }
  }

  return { ops: NO_OPS, meta: metaOf("treehouse") };
};

/* -------------------------------------------------------------------------- */
/* odds and ends                                                               */
/* -------------------------------------------------------------------------- */

/** `cairn` — a stacked pile of stone, narrowing as it rises. */
const cairn: PropGenerator = ({ put, palette }) => {
  const span = 5;
  const c = 2;
  for (let y = 0; y <= 2; y++) {
    const reach = 2 - y;
    for (let x = 0; x < span; x++) {
      for (let z = 0; z < span; z++) {
        if (Math.abs(x - c) + Math.abs(z - c) > reach) continue;
        put(x, y, z, stoneAt(palette, x, y, z));
      }
    }
  }
  put(c, 3, c, palette.stoneWall, { up: "true", waterlogged: "false" });
  return { ops: NO_OPS, meta: metaOf("cairn") };
};

/** Carousel span. */
const CAROUSEL_SPAN = 11;

/**
 * `carousel` — a round platform, a mast, four mounts and a striped canopy.
 *
 * Static, like every other thing this compiler emits: there are no moving
 * parts and no entities, and a fairground ride at rest is still unmistakably a
 * fairground ride. The canopy is the read — alternating wool round an octagon,
 * with the lanterns hung under it.
 */
const carousel: PropGenerator = ({ put, palette }) => {
  const span = CAROUSEL_SPAN;
  const c = (span - 1) / 2;
  const cells = octagon(span);

  for (const { x, z } of cells) put(x, 0, z, palette.stoneSlab, { type: "top" });
  for (let y = 1; y <= 4; y++) put(c, y, c, palette.log, { axis: "y" });

  // The mounts: four seats out on the deck, each on its own post.
  for (const [dx, dz] of [
    [0, -3],
    [0, 3],
    [-3, 0],
    [3, 0],
  ] as const) {
    const x = c + dx;
    const z = c + dz;
    put(x, 1, z, palette.fence);
    put(x, 2, z, palette.stairs, {
      facing: dz === 0 ? (dx < 0 ? "east" : "west") : dz < 0 ? "south" : "north",
      half: "bottom",
      shape: "straight",
    });
  }

  // The canopy: an octagon of alternating wool, capped, with a finial.
  for (const { x, z } of cells) {
    put(x, 5, z, (x + z) % 2 === 0 ? "red_wool" : "white_wool");
  }
  for (const { x, z } of cells) {
    if (Math.abs(x - c) + Math.abs(z - c) > 2) continue;
    put(x, 6, z, palette.roofSlab, { type: "top" });
  }
  // Lanterns hung from the canopy's rim, over the deck.
  for (const [dx, dz] of [
    [-2, -2],
    [2, -2],
    [-2, 2],
    [2, 2],
  ] as const) {
    put(c + dx, 4, c + dz, palette.lantern, { hanging: "true" });
    put(c + dx, 5, c + dz, (c + dx + c + dz) % 2 === 0 ? "red_wool" : "white_wool");
  }

  return { ops: NO_OPS, meta: metaOf("carousel") };
};

/* -------------------------------------------------------------------------- */
/* registry                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Name → generator, spread into `PROP_GENERATORS` by `props.ts`.
 *
 * The same discipline as the original registry: adding a prop is one entry
 * here and one name in {@link BLITZ_PROP_NAMES}, and the catalog test holds the
 * two against each other.
 */
const BLITZ_PROP_GENERATORS: Readonly<Record<string, PropGenerator>> = Object.freeze({
  bench,
  planter,
  clothesline,
  scarecrow,
  market_barrow: marketBarrow,
  signpost,
  swimming_pool: swimmingPool,
  curtain_wall: curtainWall,
  graveyard,
  tent,
  caravan,
  campsite,
  treehouse,
  cairn,
  carousel,
});

/* -------------------------------------------------------------------------- */
/* descriptors — Phase 4 registry seam (additive, no self-registration)        */
/* -------------------------------------------------------------------------- */

/**
 * Ordered prop descriptors for this leaf pack, in {@link BLITZ_PROP_NAMES}
 * catalog order. Each row delegates to the existing footprint function and
 * generator handle so realization (seeded draws, LocalVoxelOp order) stays in
 * the leaf.
 *
 * Param-dependent footprint remains a function: `curtain_wall` forwards
 * `length` via `blitzPropFootprint`.
 *
 * Preserved for central cutover — existing `BLITZ_PROP_NAMES` /
 * `BLITZ_PROP_GENERATORS` / `blitzPropFootprint` remain the source of truth
 * until the central aggregator migrates.
 */
export const BLITZ_PROP_DESCRIPTORS: readonly PropDescriptor[] = definePropDescriptors(BLITZ_PROP_NAMES, {
  footprint: (id, params) => blitzPropFootprint(id, params),
  generator: BLITZ_PROP_GENERATORS,
});
