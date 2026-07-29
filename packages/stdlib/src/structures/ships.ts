/**
 * `prop.place@0` — the transport-water grammar.
 *
 * The rowboat in `props.ts` establishes the technique every hull here reuses,
 * and it is worth restating because it is the only thing standing between a
 * fleet and a flooded world:
 *
 * - a floating prop's `y = 0` is the **water surface**. A hull writes solid at
 *   `y = 0` and at `y = -1` and never writes air, so it *displaces* water
 *   rather than trapping a pocket under it. Removing water can only reduce the
 *   faces the remaining water has, so no hull — however big — can make a lake
 *   flow that was not already flowing;
 * - the placer only guarantees two blocks of water under the surface, so
 *   `y = -1` is the deepest course any hull may write. A galleon's draught is
 *   drawn rather than dug: the `y = -1` course is one narrower than the deck,
 *   which is what gives the waterline its curve without reaching for a third
 *   course that might be sitting in the lake bed.
 *
 * Everything above the water line is ordinary carpentry, and all of it is
 * face-connected to the deck: the readback lint fails a full cube with air on
 * all six sides, and a yard hanging beside a mast it does not touch is exactly
 * that. Rigging is `iron_bars` rather than chain, for the reason `prop.chain`
 * already gives — there is no `chain` in the pinned 1.21.11 block table.
 */

import {
  SAIL_WOOLS,
  intParam,
  type PropContext,
  type PropGenerator,
  type PropMeta,
  type PropResult,
} from "./props.js";

/* -------------------------------------------------------------------------- */
/* catalog                                                                     */
/* -------------------------------------------------------------------------- */

/** Every transport-water prop this file builds, in catalog order. */
export const SHIP_PROP_NAMES = [
  "longship",
  "cog",
  "caravel",
  "galleon",
  "yacht",
  "speedboat",
  "ferry",
  "tugboat",
  "fishing_trawler",
  "drydock",
  "buoy",
] as const;

/** A transport-water prop name. */
export type ShipPropName = (typeof SHIP_PROP_NAMES)[number];

/* -------------------------------------------------------------------------- */
/* footprints                                                                  */
/* -------------------------------------------------------------------------- */

/** `drydock`'s length param, in blocks. */
export const DRYDOCK_LENGTH = Object.freeze({ fallback: 34, lo: 16, hi: 64 });

/** The width of a drydock's cradle, including both walls. */
export const DRYDOCK_WIDTH = 15;

/** The declared box of every water prop, keyed by name. */
export const SHIP_FOOTPRINTS: Readonly<
  Record<
    string,
    (params: Readonly<Record<string, unknown>>) => {
      readonly size: readonly [number, number, number];
      readonly minY: number;
      readonly base: "water" | "ground";
    }
  >
> = {
  longship: () => ({ size: [20, 10, 5], minY: -1, base: "water" }),
  cog: () => ({ size: [24, 16, 9], minY: -1, base: "water" }),
  caravel: () => ({ size: [30, 17, 9], minY: -1, base: "water" }),
  galleon: () => ({ size: [46, 31, 13], minY: -1, base: "water" }),
  yacht: () => ({ size: [22, 10, 7], minY: -1, base: "water" }),
  speedboat: () => ({ size: [8, 4, 5], minY: -1, base: "water" }),
  ferry: () => ({ size: [25, 10, 11], minY: -1, base: "water" }),
  tugboat: () => ({ size: [12, 10, 7], minY: -1, base: "water" }),
  fishing_trawler: () => ({ size: [18, 12, 7], minY: -1, base: "water" }),
  buoy: () => ({ size: [3, 5, 3], minY: -1, base: "water" }),
  drydock: (params) => ({
    size: [
      intParam(params, "length", DRYDOCK_LENGTH.fallback, DRYDOCK_LENGTH.lo, DRYDOCK_LENGTH.hi),
      8,
      DRYDOCK_WIDTH,
    ],
    minY: 0,
    base: "ground",
  }),
};

/** Assemble a prop meta from the declared footprint table. */
function metaOf(prop: string, params: Readonly<Record<string, unknown>> = {}): PropMeta {
  const foot = (SHIP_FOOTPRINTS[prop] as (p: Readonly<Record<string, unknown>>) => {
    size: readonly [number, number, number];
    minY: number;
    base: "water" | "ground";
  })(params);
  return {
    prop: prop as PropMeta["prop"],
    size: foot.size,
    minY: foot.minY,
    base: foot.base,
    piles: [],
  };
}

function done(prop: string, params?: Readonly<Record<string, unknown>>): PropResult {
  return { ops: [], meta: metaOf(prop, params) };
}

/* -------------------------------------------------------------------------- */
/* hulls                                                                       */
/* -------------------------------------------------------------------------- */

/** The plan of a hull: how long, how wide, and how sharp at each end. */
export interface HullSpec {
  readonly length: number;
  /** Half-beam at midships. The declared `sizeZ` is `2 · half + 1`. */
  readonly half: number;
  readonly bow: number;
  readonly stern: number;
}

/**
 * Half-beam at station `x` — the waterline plan, and the only shape function a
 * hull has.
 *
 * Never zero: a station with no beam is a hole in the boat. The ends therefore
 * taper to one column rather than to nothing, which is also what makes the
 * declared footprint honest — the op list touches `x = 0` and `x = length − 1`.
 */
export function hullHalfAt(spec: HullSpec, x: number): number {
  const { length, half, bow, stern } = spec;
  if (x < bow) return Math.max(1, Math.round((half * (x + 1)) / bow));
  if (x >= length - stern) {
    const i = length - 1 - x;
    return Math.max(1, Math.round((half * (i + 1)) / stern));
  }
  return half;
}

/**
 * Write a hull: the submerged course, the deck, and the bulwark round its edge.
 *
 * The `y = -1` course is drawn one narrower than the deck, so the waterline
 * turns in as it goes down — the difference between a boat and a raft with
 * sides. It is never *deeper* than one, for the reason the file header gives.
 */
export function buildHull(
  ctx: PropContext,
  spec: HullSpec,
  opts: {
    readonly centreZ: number;
    readonly hull: string;
    readonly deck: string;
    /** Bulwark block at `y = 1`, or `undefined` for an open boat. */
    readonly bulwark?: string;
  },
): number[] {
  const { put } = ctx;
  const halves: number[] = [];
  for (let x = 0; x < spec.length; x++) {
    const h = hullHalfAt(spec, x);
    halves.push(h);
    for (let dz = -h; dz <= h; dz++) {
      const z = opts.centreZ + dz;
      put(x, 0, z, opts.deck);
      if (Math.abs(dz) < h || h === 1) put(x, -1, z, opts.hull);
      if (opts.bulwark !== undefined && (Math.abs(dz) === h || x === 0 || x === spec.length - 1)) {
        put(x, 1, z, opts.bulwark);
      }
    }
  }
  return halves;
}

/** A mast: a log column, stepped on the deck, with a masthead lantern. */
function mast(ctx: PropContext, x: number, z: number, from: number, to: number): void {
  for (let y = from; y <= to; y++) ctx.put(x, y, z, ctx.palette.log, { axis: "y" });
}

/**
 * A square sail hung athwartships in the mast's own plane.
 *
 * The mast column is skipped rather than overwritten, so the spar passes
 * *through* the canvas the way a spar does; the yard is a log along `z` at the
 * head, which is both the right shape and the thing that keeps the top course
 * of wool attached to something.
 */
function squareSail(
  ctx: PropContext,
  x: number,
  mastZ: number,
  spread: number,
  from: number,
  to: number,
  cloth: string,
): void {
  for (let y = from; y <= to; y++) {
    for (let dz = -spread; dz <= spread; dz++) {
      if (dz === 0) continue;
      ctx.put(x, y, mastZ + dz, cloth);
    }
  }
  for (let dz = -spread; dz <= spread; dz++) {
    ctx.put(x, to + 1, mastZ + dz, ctx.palette.log, { axis: "z" });
  }
}

/** The cloth this hull's canvas is cut from, drawn off its own seed. */
function clothOf(ctx: PropContext, stream: string): string {
  return SAIL_WOOLS[ctx.rng(`${stream}.cloth`).int(0, SAIL_WOOLS.length - 1)] as string;
}

/** The timber this hull is planked in: the theme's, or its stripped variant. */
function hullTimber(ctx: PropContext, stream: string): { hull: string; deck: string } {
  const dark = ctx.rng(`${stream}.timber`).float() < 0.5;
  return dark
    ? { hull: ctx.palette.log, deck: ctx.palette.planks }
    : { hull: ctx.palette.stripped, deck: ctx.palette.planks };
}

/* -------------------------------------------------------------------------- */
/* the age of oar and sail                                                     */
/* -------------------------------------------------------------------------- */

/**
 * `longship` — 20 × 5, clinker-built, one square sail.
 *
 * The clinker line is the point of the shape: overlapping strakes, drawn here
 * as an alternating course of trapdoor and plank along the sheer, which from
 * any distance reads as the lapped planking a longship is famous for. The prow
 * is a *gesture* at a dragon rather than a model of one — three blocks and a
 * stair, because a blocky animal head at this scale reads as a mistake.
 */
const longship: PropGenerator = (ctx) => {
  const { put, palette } = ctx;
  const spec: HullSpec = { length: 20, half: 2, bow: 5, stern: 5 };
  const cz = 2;
  const timber = hullTimber(ctx, "longship");
  buildHull(ctx, spec, { centreZ: cz, hull: timber.hull, deck: timber.deck });

  // The clinker sheer, and the oars run out between the strakes.
  for (let x = 0; x < spec.length; x++) {
    const h = hullHalfAt(spec, x);
    for (const sign of [-1, 1]) {
      const z = cz + sign * h;
      if (x % 2 === 0) {
        put(x, 1, z, palette.trapdoor, {
          facing: sign < 0 ? "south" : "north",
          half: "top",
          open: "false",
        });
      } else {
        put(x, 1, z, timber.hull, { axis: "x" });
      }
      // Shields along the midships strakes, in the sail's own cloth.
      if (x >= 5 && x <= 14 && x % 2 === 0) put(x, 2, z, palette.trapdoor, {
        facing: sign < 0 ? "south" : "north",
        half: "bottom",
        open: "true",
      });
    }
  }
  // Prow and stern posts, rising out of the tapered ends.
  for (const [x, facing] of [
    [0, "west"],
    [19, "east"],
  ] as const) {
    put(x, 1, cz, palette.log, { axis: "y" });
    put(x, 2, cz, palette.log, { axis: "y" });
    put(x, 3, cz, palette.stairs, { facing, half: "bottom", shape: "straight" });
  }

  // Mast and sail: one square sail on the centre line, filling the beam.
  const cloth = clothOf(ctx, "longship");
  mast(ctx, 10, cz, 1, 6);
  squareSail(ctx, 10, cz, 2, 3, 6, cloth);
  put(10, 8, cz, palette.lantern, { hanging: "false" });
  put(10, 7, cz, palette.log, { axis: "y" });
  return done("longship");
};

/**
 * `cog` — 24 × 9, one mast between two castles.
 *
 * The cog is the first ship with *architecture* on it: a raised platform at
 * each end, railed, which is where the crossbowmen stood. Both castles are
 * decks at `y = 2` carried on the bulwark below them, so nothing is cantilevered
 * over the water.
 */
const cog: PropGenerator = (ctx) => {
  const { put, palette } = ctx;
  const spec: HullSpec = { length: 24, half: 4, bow: 6, stern: 6 };
  const cz = 4;
  const timber = hullTimber(ctx, "cog");
  buildHull(ctx, spec, {
    centreZ: cz,
    hull: timber.hull,
    deck: timber.deck,
    bulwark: timber.hull,
  });

  /** A castle: a deck at y = 2 over stations `from..to`, with a rail on it. */
  const castle = (from: number, to: number): void => {
    for (let x = from; x <= to; x++) {
      const h = hullHalfAt(spec, x);
      for (let dz = -h; dz <= h; dz++) {
        put(x, 2, cz + dz, timber.deck);
        const edge = Math.abs(dz) === h || x === from || x === to;
        if (edge) put(x, 3, cz + dz, palette.fence);
      }
      // The posts the deck stands on, between the bulwark and the platform.
      for (const sign of [-1, 1]) put(x, 1, cz + sign * h, timber.hull, { axis: "y" });
    }
  };
  castle(0, 4);
  castle(19, 23);

  const cloth = clothOf(ctx, "cog");
  mast(ctx, 12, cz, 1, 12);
  squareSail(ctx, 12, cz, 4, 6, 11, cloth);
  put(12, 14, cz, palette.lantern, { hanging: "false" });
  put(12, 13, cz, palette.log, { axis: "y" });
  // Forestay and backstay, in the bars the rest of this compiler calls chain.
  for (const x of [8, 16]) {
    for (let y = 1; y <= 5; y++) put(x, y, cz, "iron_bars");
  }
  // Deck cargo, because a cog is a lorry.
  put(9, 1, cz - 1, palette.cargo, { facing: "up" });
  put(9, 1, cz + 1, palette.hay, { axis: "y" });
  return done("cog");
};

/**
 * `caravel` — 30 × 9, two masts and lateen canvas.
 *
 * The lateen is the whole reason a caravel is a different ship from a cog: a
 * triangular sail set fore-and-aft, which is drawn here in the *centre-line
 * plane* rather than athwartships. It is a right triangle whose hypotenuse is
 * the yard, one course narrower per course up — the only sail in this file
 * whose shape changes with height.
 */
const caravel: PropGenerator = (ctx) => {
  const { put, palette } = ctx;
  const spec: HullSpec = { length: 30, half: 4, bow: 7, stern: 6 };
  const cz = 4;
  const timber = hullTimber(ctx, "caravel");
  buildHull(ctx, spec, {
    centreZ: cz,
    hull: timber.hull,
    deck: timber.deck,
    bulwark: timber.hull,
  });
  const cloth = clothOf(ctx, "caravel");

  /** One lateen: a triangle abaft the mast, tapering as it rises. */
  const lateen = (mastX: number, top: number): void => {
    mast(ctx, mastX, cz, 1, top);
    const reach = top - 4;
    for (let i = 0; i < reach; i++) {
      const y = 3 + i;
      for (let x = mastX + 1; x <= mastX + (reach - i); x++) put(x, y, cz, cloth);
    }
    put(mastX, top + 1, cz, palette.lantern, { hanging: "false" });
  };
  lateen(9, 11);
  lateen(19, 14);

  // The aftercastle, and the rail round it.
  for (let x = 23; x <= 29; x++) {
    const h = hullHalfAt(spec, x);
    for (let dz = -h; dz <= h; dz++) {
      put(x, 2, cz + dz, timber.deck);
      if (Math.abs(dz) === h || x === 29) put(x, 3, cz + dz, palette.fence);
    }
    for (const sign of [-1, 1]) put(x, 1, cz + sign * h, timber.hull, { axis: "y" });
  }
  // A bowsprit, stepping up out of the tapered stem. Each station carries two
  // cells, so consecutive steps share a face rather than a diagonal — a spar
  // drawn as a diagonal is a line of blocks touching nothing.
  for (let i = 0; i <= 2; i++) {
    put(2 - i, 1 + i, cz, palette.log, { axis: "x" });
    put(2 - i, 2 + i, cz, palette.log, { axis: "x" });
  }
  return done("caravel");
};

/**
 * `galleon` — 46 × 13, the large one.
 *
 * Everything the smaller hulls do once, the galleon does properly:
 *
 * - the **waterline** is three courses rather than two. The submerged course is
 *   one narrower than the deck (as everywhere here), the deck is the full
 *   beam, and the bulwark above it is drawn from stairs facing outboard, so the
 *   topsides *tumble home* the way a real one does;
 * - the **gunports** are a course of dark cells every third station, which is
 *   the cheapest thing that reads as a gun deck;
 * - the **stern gallery** is glazed, the **bowsprit** steps up out of the stem
 *   over six stations, and the **three masts** carry two square sails each,
 *   spread wider on the main than on the fore and mizzen.
 */
const galleon: PropGenerator = (ctx) => {
  const { put, palette } = ctx;
  const spec: HullSpec = { length: 46, half: 6, bow: 10, stern: 8 };
  const cz = 6;
  const timber = hullTimber(ctx, "galleon");
  const cloth = clothOf(ctx, "galleon");
  buildHull(ctx, spec, { centreZ: cz, hull: timber.hull, deck: timber.deck });

  for (let x = 0; x < spec.length; x++) {
    const h = hullHalfAt(spec, x);
    for (const sign of [-1, 1]) {
      const z = cz + sign * h;
      // Topsides: a wale course and a tumblehome course of stairs above it.
      put(x, 1, z, timber.hull, { axis: "x" });
      put(x, 2, z, palette.stairs, {
        facing: sign < 0 ? "north" : "south",
        half: "bottom",
        shape: "straight",
      });
      // Gunports, on the wale, wherever the hull is full enough to carry guns.
      if (h >= 4 && x % 3 === 0) put(x, 1, z, "black_concrete");
    }
    // Bow and stern are closed by the same course, or the deck has open ends.
    if (x === 0 || x === spec.length - 1) {
      for (let dz = -h; dz <= h; dz++) put(x, 1, cz + dz, timber.hull, { axis: "z" });
    }
  }

  // --- forecastle, quarterdeck and poop -------------------------------------
  const platform = (from: number, to: number, y: number): void => {
    for (let x = from; x <= to; x++) {
      const h = hullHalfAt(spec, x);
      for (let dz = -h; dz <= h; dz++) {
        put(x, y, cz + dz, timber.deck);
        if (Math.abs(dz) === h || x === from || x === to) put(x, y + 1, cz + dz, palette.fence);
      }
      for (const sign of [-1, 1]) {
        for (let below = 1; below < y; below++) put(x, below, cz + sign * h, timber.hull, { axis: "y" });
      }
    }
  };
  platform(6, 12, 3);
  platform(34, 43, 3);
  platform(38, 43, 5);

  // The stern gallery: the one place on the ship with windows.
  for (let dz = -3; dz <= 3; dz++) {
    for (let y = 1; y <= 2; y++) put(44, y, cz + dz, dz % 2 === 0 ? "glass_pane" : timber.hull);
  }
  put(45, 2, cz, palette.lantern, { hanging: "false" });
  put(45, 1, cz, timber.hull, { axis: "x" });

  // --- the bowsprit ---------------------------------------------------------
  for (let i = 0; i <= 5; i++) {
    put(5 - i, 3 + Math.round(i * 0.6), cz, palette.log, { axis: "x" });
    if (i > 0) put(5 - i, 2 + Math.round(i * 0.6), cz, palette.log, { axis: "x" });
  }

  // --- the rig --------------------------------------------------------------
  /** One mast: two square sails, a top and a masthead light. */
  const rig = (x: number, top: number, spread: number, from: number): void => {
    mast(ctx, x, cz, 1, top);
    squareSail(ctx, x, cz, spread, from, from + 5, cloth);
    squareSail(ctx, x, cz, spread - 2, from + 8, from + 12, cloth);
    put(x, top + 1, cz, palette.lantern, { hanging: "false" });
  };
  rig(14, 26, 5, 6);
  rig(24, 28, 6, 8);
  rig(37, 22, 4, 6);
  // Shrouds: bars from the deck up the flanks of the main mast.
  for (const sign of [-1, 1]) {
    for (let y = 1; y <= 8; y++) put(24, y, cz + sign * 3, "iron_bars");
  }
  return done("galleon");
};

/* -------------------------------------------------------------------------- */
/* the modern fleet                                                            */
/* -------------------------------------------------------------------------- */

/** `yacht` — 22 × 7, white quartz, glazed saloon, radar over the flybridge. */
const yacht: PropGenerator = (ctx) => {
  const { put, palette } = ctx;
  const spec: HullSpec = { length: 22, half: 3, bow: 7, stern: 4 };
  const cz = 3;
  buildHull(ctx, spec, { centreZ: cz, hull: "smooth_quartz", deck: "quartz_block" });
  const accent = ctx.rng("yacht.stripe").float() < 0.5 ? "blue_concrete" : "black_concrete";

  for (let x = 0; x < spec.length; x++) {
    const h = hullHalfAt(spec, x);
    for (const sign of [-1, 1]) {
      const z = cz + sign * h;
      put(x, 1, z, x < 6 || x > 18 ? "quartz_block" : palette.fence); // the sheer rail
      put(x, -1, z, accent); // the boot stripe, at the waterline
    }
  }
  // The saloon: glazed sides, a solid roof, and the flybridge over it.
  for (let x = 7; x <= 15; x++) {
    for (let dz = -2; dz <= 2; dz++) {
      put(x, 3, cz + dz, "quartz_block");
      if (Math.abs(dz) === 2 || x === 7 || x === 15) {
        put(x, 1, cz + dz, x % 2 === 0 ? "glass_pane" : "smooth_quartz");
        put(x, 2, cz + dz, "glass_pane");
      }
    }
  }
  for (let x = 9; x <= 13; x++) {
    for (const dz of [-2, 2]) put(x, 4, cz + dz, palette.fence);
  }
  for (let x = 9; x <= 13; x++) put(x, 4, cz, "quartz_block");
  // The mast, the radar and the two navigation lights.
  for (let y = 5; y <= 7; y++) put(11, y, cz, "iron_bars");
  put(11, 8, cz, "iron_block");
  for (const dz of [-1, 1]) put(11, 8, cz + dz, "iron_bars");
  put(3, 1, cz, palette.lantern, { hanging: "false" });
  return done("yacht");
};

/** `speedboat` — 8 × 5, a windscreen, two seats and an outboard. */
const speedboat: PropGenerator = (ctx) => {
  const { put, palette } = ctx;
  const spec: HullSpec = { length: 8, half: 2, bow: 4, stern: 2 };
  const cz = 2;
  const shell = ctx.rng("speedboat.shell").float() < 0.5 ? "white_concrete" : "red_concrete";
  buildHull(ctx, spec, { centreZ: cz, hull: shell, deck: "smooth_quartz" });
  for (let x = 0; x < spec.length; x++) {
    const h = hullHalfAt(spec, x);
    for (const sign of [-1, 1]) put(x, 1, cz + sign * h, shell);
  }
  for (let dz = -1; dz <= 1; dz++) {
    put(3, 1, cz + dz, "smooth_quartz"); // the coaming
    put(3, 2, cz + dz, "glass_pane"); // the screen
  }
  put(4, 1, cz, palette.stairs, { facing: "east", half: "bottom", shape: "straight" });
  put(5, 1, cz, palette.stairs, { facing: "east", half: "bottom", shape: "straight" });
  put(7, 1, cz, "gray_concrete"); // the outboard
  put(7, 2, cz, "iron_bars");
  return done("speedboat");
};

/**
 * `ferry` — 25 × 11, an open car deck under a wheelhouse.
 *
 * The bow ramp is the interesting part: it is a stair course laid across the
 * stem, so the deck reads as something a vehicle drove on to rather than as a
 * hole in the front of a boat.
 */
const ferry: PropGenerator = (ctx) => {
  const { put, palette } = ctx;
  const spec: HullSpec = { length: 25, half: 5, bow: 5, stern: 4 };
  const cz = 5;
  buildHull(ctx, spec, { centreZ: cz, hull: "gray_concrete", deck: "light_gray_concrete" });

  for (let x = 0; x < spec.length; x++) {
    const h = hullHalfAt(spec, x);
    for (const sign of [-1, 1]) {
      const z = cz + sign * h;
      put(x, 1, z, "gray_concrete");
      if (x > 3 && x < 21 && x % 2 === 1) put(x, 2, z, palette.fence);
    }
    // Lane markings down the car deck.
    if (x >= 4 && x <= 20 && x % 3 !== 0) put(x, 0, cz, "white_concrete");
  }
  // The bow ramp, down over the stem.
  for (let i = 0; i <= 2; i++) {
    // Clamped to the beam at that station: a ramp wider than the stem is a
    // stair standing in open water beside the boat.
    const h = hullHalfAt(spec, 2 - i);
    for (let dz = -h; dz <= h; dz++) {
      put(2 - i, 1 - i, cz + dz, palette.stairs, {
        facing: "west",
        half: "bottom",
        shape: "straight",
      });
    }
  }
  // Wheelhouse and funnel, aft.
  for (let x = 17; x <= 21; x++) {
    for (let dz = -3; dz <= 3; dz++) {
      put(x, 2, cz + dz, "light_gray_concrete");
      put(x, 5, cz + dz, "white_concrete");
      const wall = Math.abs(dz) === 3 || x === 17 || x === 21;
      if (wall) {
        put(x, 3, cz + dz, "glass_pane");
        put(x, 4, cz + dz, x % 2 === 0 ? "glass_pane" : "white_concrete");
      }
      if (Math.abs(dz) === 3 && x % 2 === 1) put(x, 1, cz + dz, "white_concrete");
    }
  }
  for (let x = 18; x <= 20; x++) {
    for (let dz = -1; dz <= 1; dz++) put(x, 6, cz + dz, "black_concrete");
  }
  for (let dz = -1; dz <= 1; dz++) put(19, 7, cz + dz, "gray_concrete");
  put(19, 8, cz, "iron_bars");
  return done("ferry");
};

/** `tugboat` — 12 × 7, all wheelhouse and fenders. */
const tugboat: PropGenerator = (ctx) => {
  const { put, palette } = ctx;
  const spec: HullSpec = { length: 12, half: 3, bow: 4, stern: 3 };
  const cz = 3;
  buildHull(ctx, spec, { centreZ: cz, hull: "black_concrete", deck: "gray_concrete" });
  const house = ctx.rng("tug.house").float() < 0.5 ? "red_concrete" : "white_concrete";

  for (let x = 0; x < spec.length; x++) {
    const h = hullHalfAt(spec, x);
    for (const sign of [-1, 1]) {
      const z = cz + sign * h;
      put(x, 1, z, "red_concrete");
      // Fenders: old bars slung over the sheer, all round.
      if (x % 2 === 0) put(x, 0, z, "iron_bars");
    }
  }
  for (let x = 4; x <= 8; x++) {
    for (let dz = -2; dz <= 2; dz++) {
      put(x, 1, cz + dz, house);
      put(x, 4, cz + dz, "white_concrete");
      const wall = Math.abs(dz) === 2 || x === 4 || x === 8;
      if (wall) {
        put(x, 2, cz + dz, "glass_pane");
        put(x, 3, cz + dz, house);
      }
    }
  }
  for (let y = 5; y <= 7; y++) put(6, y, cz, "black_concrete"); // the funnel
  put(6, 8, cz, palette.lantern, { hanging: "false" });
  put(10, 1, cz, "iron_bars"); // the towing bitt
  put(11, 1, cz, "gray_concrete");
  return done("tugboat");
};

/**
 * `fishing_trawler` — 18 × 7, booms out and nets down.
 *
 * The booms are the shape: two spars raked out and down from a single mast,
 * with the net gestured under them as a lattice of bars. Bars are the right
 * block twice over — they read as netting, and they are outside every support
 * rule the readback lint has, so a net hanging in the air is not a lint finding
 * with no defect under it.
 */
const trawler: PropGenerator = (ctx) => {
  const { put, palette } = ctx;
  const spec: HullSpec = { length: 18, half: 3, bow: 5, stern: 4 };
  const cz = 3;
  const timber = hullTimber(ctx, "trawler");
  const hull = ctx.rng("trawler.paint").float() < 0.5 ? "blue_concrete" : "green_concrete";
  buildHull(ctx, spec, { centreZ: cz, hull, deck: timber.deck, bulwark: hull });

  // Wheelhouse aft, and the hold hatch forward of it.
  for (let x = 11; x <= 15; x++) {
    for (let dz = -2; dz <= 2; dz++) {
      put(x, 1, cz + dz, "white_concrete");
      put(x, 4, cz + dz, "white_concrete");
      const wall = Math.abs(dz) === 2 || x === 11 || x === 15;
      if (wall) {
        put(x, 2, cz + dz, "glass_pane");
        put(x, 3, cz + dz, x % 2 === 0 ? "glass_pane" : "white_concrete");
      }
    }
  }
  for (let x = 5; x <= 8; x++) {
    for (let dz = -1; dz <= 1; dz++) put(x, 1, cz + dz, palette.trapdoor, {
      facing: "north",
      half: "top",
      open: "false",
    });
  }

  // The mast, its two booms, and the net under each.
  mast(ctx, 9, cz, 1, 9);
  for (const sign of [-1, 1]) {
    // The spar out to the block at the end of it, then the net hanging under
    // the spar: bars, which read as netting and are outside every support rule.
    for (let i = 1; i <= 3; i++) put(9, 8, cz + sign * i, palette.log, { axis: "z" });
    for (let y = 6; y <= 7; y++) put(9, y, cz + sign * 3, palette.log, { axis: "y" });
    for (let i = 1; i <= 3; i++) {
      for (let y = 5; y <= 7; y++) put(9, y, cz + sign * i, "iron_bars");
    }
  }
  put(9, 10, cz, palette.lantern, { hanging: "false" });
  // Deck stowage, seeded so no two trawlers stow alike. The *cells* are fixed
  // and only their contents are drawn: a prop whose geometry moved with its
  // seed would have a footprint that is only true on average.
  const rng = ctx.rng("trawler.deck");
  for (let x = 4; x <= 8; x += 2) {
    for (const sign of [-1, 1]) {
      const box = rng.float() < 0.5;
      put(x, 1, cz + sign, box ? palette.cargo : palette.hay, box ? { facing: "up" } : { axis: "y" });
    }
  }
  return done("fishing_trawler");
};

/* -------------------------------------------------------------------------- */
/* shore works                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * `drydock` — an open cradle on land, sized so a hull can sit in it.
 *
 * The one prop in this file that is *not* a boat, and the reason the fleet
 * needs it: a ship out of the water has to be standing on something, and a
 * shipyard with nothing under the hull reads as a boat that fell over. The
 * default length takes a caravel; the maximum takes a galleon.
 */
const drydock: PropGenerator = ({ put, palette, params }) => {
  const length = intParam(params, "length", DRYDOCK_LENGTH.fallback, DRYDOCK_LENGTH.lo, DRYDOCK_LENGTH.hi);
  const width = DRYDOCK_WIDTH;
  const cz = (width - 1) / 2;

  for (let x = 0; x < length; x++) {
    for (let z = 0; z < width; z++) {
      const wall = z === 0 || z === width - 1;
      put(x, 0, z, wall ? palette.stoneAccent : palette.stone);
      if (wall) {
        // The dock side: masonry to the coping, railed every eighth bay.
        for (let y = 1; y <= 4; y++) put(x, y, z, palette.stoneAccent);
        if (x % 8 === 4) put(x, 5, z, palette.fence);
      }
    }
    // The keel blocks the hull rests on, and the side shores against the walls.
    if (x % 3 === 0) {
      put(x, 1, cz, palette.log, { axis: "x" });
      // Side shores: upright posts either side of the keel line, standing on
      // the dock floor rather than raked off it into the air.
      for (const sign of [-1, 1]) {
        for (let y = 1; y <= 2; y++) put(x, y, cz + sign * (cz - 1), palette.log, { axis: "y" });
      }
    }
  }
  // The gantry: posts on the coping carrying a beam across the dock.
  for (let x = 6; x < length - 6; x += 12) {
    for (const z of [0, width - 1]) {
      for (let y = 5; y <= 6; y++) put(x, y, z, palette.log, { axis: "y" });
    }
    for (let z = 0; z < width; z++) put(x, 7, z, palette.log, { axis: "z" });
  }
  // Two dock lamps, each standing on masonry rather than on a coping rail.
  for (const [x, z] of [
    [2, 0],
    [length - 3, width - 1],
  ] as const) {
    put(x, 4, z, palette.stoneAccent);
    put(x, 5, z, palette.lantern, { hanging: "false" });
  }
  return done("drydock", params);
};

/**
 * `buoy` — the smallest thing that floats.
 *
 * A cross of float at the water line, a post and a light: four blocks of hull,
 * and the reason a harbour reads as a harbour rather than as a lake with boats
 * in it. The cross touches all four sides of its 3 × 3 box, so the placer
 * reserves a box the prop actually uses.
 */
const buoy: PropGenerator = (ctx) => {
  const { put, palette } = ctx;
  const paint = ctx.rng("buoy.paint").float() < 0.5 ? "red_concrete" : "green_concrete";
  const cross: readonly (readonly [number, number])[] = [
    [1, 1],
    [1, 0],
    [1, 2],
    [0, 1],
    [2, 1],
  ];
  for (const [x, z] of cross) {
    put(x, -1, z, "black_concrete");
    put(x, 0, z, paint);
  }
  put(1, 1, 1, palette.fence);
  put(1, 2, 1, palette.fence);
  put(1, 3, 1, palette.lantern, { hanging: "false" });
  return done("buoy");
};

/* -------------------------------------------------------------------------- */
/* registry                                                                    */
/* -------------------------------------------------------------------------- */

/** Water prop name → generator, merged into `PROP_GENERATORS` by `props.ts`. */
export const SHIP_GENERATORS: Readonly<Record<string, PropGenerator>> = Object.freeze({
  longship,
  cog,
  caravel,
  galleon,
  yacht,
  speedboat,
  ferry,
  tugboat,
  fishing_trawler: trawler,
  drydock,
  buoy,
});
