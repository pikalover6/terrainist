/**
 * `prop.place@0` — wave 5: the wayside.
 *
 * Twelve props that belong to the space *between* buildings: the kerb a bus
 * stops at, the road a coach runs down, the pitch a yurt stands on, the strip
 * of a fair between the rides. Wave 4 gave a lane its furniture; this wave
 * gives a lane its *traffic* — a shelter, a phone box, a mailbox, a bike rack,
 * an awning; a milestone, a stop, a stagecoach; a yurt; and three fairground
 * pieces big enough to be landmarks.
 *
 * The contract is `props.ts`'s, unchanged: node-local coordinates, `y = 0` the
 * base plane, block *names* with a property map, every op inside the declared
 * box so `rotateOps` needs no special case. Like `props-street.ts` and
 * `props-amusement.ts` this file is a **leaf** — it imports types from
 * `props.ts` and no values, so the one edge `props.ts` → here cannot become a
 * module-initialisation cycle.
 *
 * ## The four rules this wave was written against
 *
 * 1. **Support closure.** Every block rests on the ground plane, rests on
 *    another of the prop's own blocks, or hangs under one. `physics.ts` walks
 *    `NEEDS_GROUND` (fences, walls, carpets, pressure plates, torches,
 *    campfires, standing lanterns) *down* to something solid, and `hungChain`
 *    *up* from a hanging lantern to an anchor; `floating.*` polices a full cube
 *    with six air faces. Every generator below is closed under all three, and
 *    `props-wayside.test.ts` re-walks the same three at yaw 0.
 * 2. **No `chain`.** The 1.21.11 block table has no `chain` entry at all, so a
 *    `chain` op is silently dropped. `iron_bars` carries the same read and the
 *    support rules police neither.
 * 3. **No sign blocks.** A sign is a block entity; a banner is not, and it
 *    reads better at three blocks anyway.
 * 4. **No open fluids.** Nothing here holds water; where it would, a cauldron
 *    stands in.
 *
 * ## Two idioms worth naming
 *
 * - the **wheel read** (the stagecoach) is a stripped-log axle with a trapdoor
 *   disc at each end — the caravan's trick, one course taller so the coach
 *   rides high;
 * - the **cone crown** (the yurt, the helter skelter) always ends in a *solid*
 *   centre block, never a ring with a hole at the top: a ring cap leaves the
 *   apex cells with nothing to join to. Where the read needs a smoke hole, the
 *   gap is punched one course *below* the cap and nothing is placed above it.
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
 * is enumerated.
 */
export const WAYSIDE_PROP_NAMES = [
  "bus_shelter",
  "phone_box",
  "mailbox",
  "bicycle_rack",
  "shop_awning",
  "milestone",
  "bus_stop",
  "stagecoach",
  "yurt",
  "helter_skelter",
  "midway_arch",
  "shooting_gallery",
] as const;

/** One of the props this file builds. */
export type WaysidePropName = (typeof WAYSIDE_PROP_NAMES)[number];

/** True for a name this file answers to. */
export function isWaysideProp(name: string): name is WaysidePropName {
  return (WAYSIDE_PROP_NAMES as readonly string[]).includes(name);
}

/* -------------------------------------------------------------------------- */
/* extents                                                                     */
/* -------------------------------------------------------------------------- */

/** Bus shelter: a five-wide pad under a slab roof. */
export const SHELTER_W = 5;
/** Bus shelter depth: back wall, standing room, open front. */
export const SHELTER_D = 3;
/** Shop awning width — the canopy span. */
export const AWNING_W = 5;
/** Stagecoach length: drawbar, driver's box, five-cell body. */
export const COACH_W = 7;
/** Yurt span, in x and z — a disc of radius three, plus its rim. */
export const YURT_SPAN = 7;
/** Helter skelter span — the pad, which is wider than the tower. */
export const SKELTER_SPAN = 7;
/** Helter skelter height, crown and banner included. */
export const SKELTER_H = 12;
/** Midway arch span, in x: tower, gate, tower. */
export const MIDWAY_W = 9;
/** Shooting gallery width — a seven-cell counter. */
export const GALLERY_W = 7;

/** The declared box of one of this file's props, before it is generated. */
export function waysidePropFootprint(prop: WaysidePropName): {
  readonly size: readonly [number, number, number];
  readonly minY: number;
  readonly base: PropBase;
} {
  const ground = (
    size: readonly [number, number, number],
  ): { size: readonly [number, number, number]; minY: number; base: PropBase } => ({
    size,
    minY: 0,
    base: "ground",
  });
  switch (prop) {
    case "bus_shelter":
      return ground([SHELTER_W, 5, SHELTER_D]);
    case "phone_box":
      return ground([1, 7, 1]);
    case "mailbox":
      return ground([1, 5, 2]);
    case "bicycle_rack":
      return ground([5, 3, 2]);
    case "shop_awning":
      return ground([AWNING_W, 4, 3]);
    case "milestone":
      return ground([3, 4, 3]);
    case "bus_stop":
      return ground([3, 5, 2]);
    case "stagecoach":
      return ground([COACH_W, 7, 3]);
    case "yurt":
      return ground([YURT_SPAN, 6, YURT_SPAN]);
    case "helter_skelter":
      return ground([SKELTER_SPAN, SKELTER_H, SKELTER_SPAN]);
    case "midway_arch":
      return ground([MIDWAY_W, 7, 3]);
    case "shooting_gallery":
    default:
      return ground([GALLERY_W, 6, 3]);
  }
}

/** Build a `PropMeta` from the declared footprint, so the two cannot drift. */
function metaOf(prop: WaysidePropName): PropMeta {
  const foot = waysidePropFootprint(prop);
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

/** A masonry mix, keyed by position so a re-run is byte-identical. */
function stoneAt(palette: PropPalette, x: number, y: number, z: number): string {
  return (x * 5 + y * 11 + z * 3) % 4 === 0 ? palette.stoneAccent : palette.stone;
}

/** The fair's two-colour stripe in wool, keyed by position. */
function stripe(i: number): string {
  return ((i % 2) + 2) % 2 === 0 ? "red_wool" : "white_wool";
}

/** The same stripe in concrete, for the pieces that want a harder edge. */
function stripeConcrete(i: number): string {
  return ((i % 2) + 2) % 2 === 0 ? "yellow_concrete" : "light_blue_concrete";
}

/** Banner colours, in draw order — a wayside's flags are not all one red. */
export const WAYSIDE_BANNERS: readonly string[] = Object.freeze([
  "red_banner",
  "blue_banner",
  "yellow_banner",
  "white_banner",
  "green_banner",
]);

/* -------------------------------------------------------------------------- */
/* the kerb                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * `bus_shelter` — three sides of glass on a paved pad, a slab roof, a bench and
 * a route banner on the ridge.
 *
 * The glass is `glass_pane`, which the lint treats as an ordinary block: every
 * pane either stands on the pad or on the pane below it, so the wall is a
 * column and not a curtain. The bench is a pair of stairs on the pad — the same
 * partial-block read the swing boats use, and it passes `floating.*` because
 * the pad is directly beneath it.
 *
 * The banner stands on a **full cube** set into the roof rather than on a slab:
 * a standing banner wants a block below it, and one course of masonry in the
 * middle of the ridge is cheaper than arguing about it.
 */
const busShelter: PropGenerator = (ctx) => {
  const { put, palette } = ctx;
  const w = SHELTER_W;
  const d = SHELTER_D;

  // --- the pad -------------------------------------------------------------
  for (let x = 0; x < w; x++) {
    for (let z = 0; z < d; z++) put(x, 0, z, stoneAt(palette, x, 0, z));
  }

  // --- three sides of glass ------------------------------------------------
  // Back wall the whole width; one bay of glass at each end; the front open,
  // which is the whole point of a shelter.
  for (let y = 1; y <= 2; y++) {
    for (let x = 0; x < w; x++) put(x, y, 0, "glass_pane", { east: "true", west: "true" });
    for (const x of [0, w - 1]) put(x, y, 1, "glass_pane", { north: "true", south: "true" });
  }

  // --- the bench -----------------------------------------------------------
  for (let x = 1; x < w - 1; x++) {
    put(x, 1, 1, palette.stairs, { facing: "south", half: "bottom", shape: "straight" });
  }

  // --- the roof ------------------------------------------------------------
  for (let x = 0; x < w; x++) {
    for (let z = 0; z < d; z++) {
      if (x === (w - 1) / 2 && z === 0) continue; // the banner's footing
      put(x, 3, z, palette.roofSlab, { type: "bottom" });
    }
  }
  put((w - 1) / 2, 3, 0, palette.stoneAccent);
  const banner = WAYSIDE_BANNERS[ctx.rng("shelter").int(0, WAYSIDE_BANNERS.length - 1)] as string;
  put((w - 1) / 2, 4, 0, banner, { rotation: "0" });

  return { ops: NO_OPS, meta: metaOf("bus_shelter") };
};

/**
 * `phone_box` — the classic kiosk, one cell square.
 *
 * A red plinth, three courses of glass, a lantern under a red cap and a slab
 * crown on top of that. It is deliberately the narrowest prop in the catalog:
 * a phone box that is two cells wide is a shed, and the whole read is the
 * silhouette — tall, thin, red.
 *
 * The lantern is `hanging`, and it hangs from the red cap directly above it,
 * which is a full cube: `hungChain` stops at the first solid block and that is
 * it.
 */
const phoneBox: PropGenerator = ({ put, palette }) => {
  put(0, 0, 0, "red_concrete");
  for (let y = 1; y <= 3; y++) put(0, y, 0, "glass_pane", { east: "true", west: "true" });
  put(0, 4, 0, palette.lantern, { hanging: "true" });
  put(0, 5, 0, "red_terracotta");
  put(0, 6, 0, palette.roofSlab, { type: "bottom" });
  return { ops: NO_OPS, meta: metaOf("phone_box") };
};

/**
 * `mailbox` — a post, an iron-trimmed head and a slot.
 *
 * The smallest prop this file builds and meant to be: two courses of fence, a
 * concrete head, an iron trapdoor lid on the crown and a second iron trapdoor
 * standing off the head's south face for the slot. The slot trapdoor is what
 * makes the head read as a *box* rather than as a coloured block on a stick.
 */
const mailbox: PropGenerator = ({ put, palette }) => {
  for (let z = 0; z < 2; z++) put(0, 0, z, stoneAt(palette, 0, 0, z));
  for (let y = 1; y <= 2; y++) put(0, y, 0, palette.fence);
  put(0, 3, 0, "red_concrete");
  put(0, 4, 0, "iron_trapdoor", { facing: "south", half: "top", open: "false" });
  put(0, 3, 1, "iron_trapdoor", { facing: "north", half: "bottom", open: "true" });
  return { ops: NO_OPS, meta: metaOf("mailbox") };
};

/**
 * `bicycle_rack` — a run of low hoops on a paved strip.
 *
 * Each hoop is two fence posts with a trapdoor laid over each head: the
 * trapdoors are the arc's shoulders, and at this scale two flat plates and a
 * gap read as a bent tube. Three hoops, because one is a fence post and two is
 * a gate.
 */
const bicycleRack: PropGenerator = ({ put, palette }) => {
  for (let x = 0; x < 5; x++) {
    for (let z = 0; z < 2; z++) put(x, 0, z, stoneAt(palette, x, 0, z));
  }
  for (const x of [0, 2, 4]) {
    for (let z = 0; z < 2; z++) {
      put(x, 1, z, palette.fence);
      put(x, 2, z, palette.trapdoor, {
        facing: z === 0 ? "north" : "south",
        half: "top",
        open: "false",
      });
    }
  }
  return { ops: NO_OPS, meta: metaOf("bicycle_rack") };
};

/**
 * `shop_awning` — a striped canopy on two posts, freestanding over a pad.
 *
 * Deliberately *not* the fairground stall: no counter, no back wall, no wares.
 * Two log posts at the front corners, a canopy laid across their heads and a
 * lip of slabs at the back with two lanterns hung under it. The silhouette is
 * an open shade over a bit of pavement, which is what a shop puts out in front
 * of its window and which nothing else in the catalog says.
 */
const shopAwning: PropGenerator = ({ put, palette }) => {
  const w = AWNING_W;
  for (let x = 0; x < w; x++) {
    for (let z = 0; z < 3; z++) put(x, 0, z, stoneAt(palette, x, 0, z));
  }
  for (const x of [0, w - 1]) {
    for (let y = 1; y <= 2; y++) put(x, y, 0, palette.log, { axis: "y" });
  }
  for (let x = 0; x < w; x++) {
    for (let z = 0; z < 2; z++) put(x, 3, z, stripe(x));
    put(x, 3, 2, palette.roofSlab, { type: "bottom" });
  }
  put(1, 2, 2, palette.lantern, { hanging: "true" });
  put(w - 2, 2, 2, palette.lantern, { hanging: "true" });
  return { ops: NO_OPS, meta: metaOf("shop_awning") };
};

/* -------------------------------------------------------------------------- */
/* the road                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * `milestone` — a carved waypost on a mossy plinth.
 *
 * A three-by-three pad with mossy cobble worked into the mix, four corner
 * walls, two courses of chiselled stone and a slab cap; moss carpet on the pad
 * edges is the age. It is a *single* object rather than a pair of markers,
 * because a milestone that comes in pairs is a gate.
 */
const milestone: PropGenerator = ({ put, palette }) => {
  for (let x = 0; x < 3; x++) {
    for (let z = 0; z < 3; z++) {
      const corner = (x === 0 || x === 2) && (z === 0 || z === 2);
      put(x, 0, z, corner ? "mossy_cobblestone" : stoneAt(palette, x, 0, z));
    }
  }
  for (const [x, z] of [
    [0, 0],
    [0, 2],
    [2, 0],
    [2, 2],
  ] as const) {
    put(x, 1, z, palette.stoneWall);
  }
  // The moss, on the four pad edges the walls leave open.
  for (const [x, z] of [
    [1, 0],
    [0, 1],
    [2, 1],
    [1, 2],
  ] as const) {
    put(x, 1, z, "moss_carpet");
  }
  put(1, 1, 1, "chiseled_stone_bricks");
  put(1, 2, 1, "chiseled_stone_bricks");
  put(1, 3, 1, palette.stoneSlab, { type: "bottom" });
  return { ops: NO_OPS, meta: metaOf("milestone") };
};

/**
 * `bus_stop` — a pole with a flag, a bench and a timetable, on a two-cell pad.
 *
 * The cheap cousin of the shelter, and the one you can line a road with: no
 * walls, no roof, four blocks of pole. The timetable is an open trapdoor
 * against the pole — the notice board's trick at a twelfth of the cost.
 */
const busStop: PropGenerator = (ctx) => {
  const { put, palette } = ctx;
  for (let x = 0; x < 3; x++) {
    for (let z = 0; z < 2; z++) put(x, 0, z, stoneAt(palette, x, 0, z));
  }
  for (let y = 1; y <= 3; y++) put(0, y, 0, palette.fence);
  const banner = WAYSIDE_BANNERS[ctx.rng("bus_stop").int(0, WAYSIDE_BANNERS.length - 1)] as string;
  put(0, 4, 0, banner, { rotation: "0" });
  // The timetable, off the pole's south face.
  put(0, 2, 1, palette.trapdoor, { facing: "north", half: "bottom", open: "true" });
  // The bench: a back rail and two seats.
  for (const x of [1, 2]) {
    put(x, 1, 0, palette.fence);
    put(x, 1, 1, palette.stairs, { facing: "south", half: "bottom", shape: "straight" });
  }
  return { ops: NO_OPS, meta: metaOf("bus_stop") };
};

/**
 * `stagecoach` — the caravan's grander cousin.
 *
 * An enclosed body on four wheels, a driver's box in front of it, a luggage
 * rail on the roof and a drawbar out the front. The wheels are the caravan's
 * read one course taller: a stripped-log axle with a two-block trapdoor disc at
 * each end, and a log chassis running between the axles so the body has
 * something to sit on that is not thin air.
 *
 * The luggage rail is a fence standing **on the roof** — `groundedChain` walks
 * a fence down and stops at the first solid or partial block, and the roof
 * slabs directly under the rail are exactly that.
 */
const stagecoach: PropGenerator = ({ put, palette }) => {
  const w = COACH_W;

  // --- running gear --------------------------------------------------------
  for (const x of [2, w - 1]) {
    put(x, 0, 1, palette.stripped, { axis: "z" });
    for (const z of [0, 2]) {
      for (let y = 0; y <= 1; y++) {
        put(x, y, z, palette.trapdoor, {
          facing: z === 0 ? "north" : "south",
          half: y === 0 ? "bottom" : "top",
          open: "false",
        });
      }
    }
    put(x, 1, 1, palette.stripped, { axis: "x" });
  }
  for (let x = 3; x < w - 1; x++) put(x, 1, 1, palette.stripped, { axis: "x" });

  // --- the floor -----------------------------------------------------------
  for (let x = 1; x < w; x++) {
    for (let z = 0; z < 3; z++) put(x, 2, z, palette.planks);
  }

  // --- the body ------------------------------------------------------------
  for (let y = 3; y <= 4; y++) {
    for (let x = 2; x < w; x++) {
      for (let z = 0; z < 3; z++) {
        if (x > 2 && x < w - 1 && z === 1) continue; // the cabin
        // The doors: the middle of each flank, both courses.
        if (x === 4 && z !== 1) {
          put(x, y, z, palette.trapdoor, {
            facing: z === 0 ? "north" : "south",
            half: y === 3 ? "bottom" : "top",
            open: "false",
          });
          continue;
        }
        // Windows either side of the doors, upper course only.
        if (y === 4 && z !== 1 && (x === 3 || x === 5)) {
          put(x, y, z, "glass_pane", { east: "true", west: "true" });
          continue;
        }
        put(x, y, z, x === 2 || x === w - 1 ? palette.log : palette.planks, {
          ...(x === 2 || x === w - 1 ? { axis: "y" } : {}),
        });
      }
    }
  }

  // --- the roof and its luggage rail ---------------------------------------
  for (let x = 2; x < w; x++) {
    for (let z = 0; z < 3; z++) put(x, 5, z, palette.roofSlab, { type: "bottom" });
  }
  for (const x of [2, 4, w - 1]) {
    for (const z of [0, 2]) put(x, 6, z, palette.fence);
  }

  // --- the driver's box, and the drawbar -----------------------------------
  put(1, 3, 0, palette.planks);
  put(1, 3, 2, palette.planks);
  put(1, 3, 1, palette.stairs, { facing: "west", half: "bottom", shape: "straight" });
  put(0, 2, 1, palette.stripped, { axis: "x" });

  return { ops: NO_OPS, meta: metaOf("stagecoach") };
};

/* -------------------------------------------------------------------------- */
/* the pitch                                                                   */
/* -------------------------------------------------------------------------- */

/** True inside the yurt's floor disc, in offsets from the centre. */
function inYurt(dx: number, dz: number): boolean {
  return dx * dx + dz * dz <= 10;
}

/** True on the yurt's wall ring — a disc cell with a neighbour outside it. */
function yurtRim(dx: number, dz: number): boolean {
  if (!inYurt(dx, dz)) return false;
  return (
    !inYurt(dx + 1, dz) || !inYurt(dx - 1, dz) || !inYurt(dx, dz + 1) || !inYurt(dx, dz - 1)
  );
}

/**
 * `yurt` — the tent's round cousin.
 *
 * A low cylinder of wool in two bands, a shallow cone over it, a rug floor, a
 * doorway with a felt flap and a stove in the middle. The cone ends in a
 * **solid** centre block: a ring cap with a hole through it leaves the apex
 * cells joined to nothing, which is the one way a round roof floats. The smoke
 * hole is punched a course lower instead — one cell out of the upper ring, with
 * nothing above it, so it reads as open sky from inside and costs no support.
 *
 * The stove is a campfire standing on a solid pedestal. `campfire` is in the
 * lint's `NEEDS_GROUND` set and the pedestal is what it walks down to.
 */
const yurt: PropGenerator = (ctx) => {
  const { put, palette } = ctx;
  const c = (YURT_SPAN - 1) / 2;

  for (let dx = -c; dx <= c; dx++) {
    for (let dz = -c; dz <= c; dz++) {
      if (!inYurt(dx, dz)) continue;
      const x = c + dx;
      const z = c + dz;
      const r2 = dx * dx + dz * dz;

      // --- the floor -------------------------------------------------------
      put(x, 0, z, palette.planks);

      // --- the wall, or what stands inside it ------------------------------
      if (yurtRim(dx, dz)) {
        // The doorway: due south, both courses, with a felt flap over it.
        if (dx === 0 && dz === c) {
          put(x, 2, z, palette.trapdoor, { facing: "north", half: "top", open: "false" });
        } else {
          put(x, 1, z, "white_wool");
          put(x, 2, z, "brown_wool");
        }
      } else if (r2 === 0) {
        put(x, 1, z, palette.stone);
        put(x, 2, z, "campfire", {
          lit: "true",
          facing: "north",
          signal_fire: "false",
          waterlogged: "false",
        });
      } else {
        put(x, 1, z, (dx + dz) % 2 === 0 ? "red_carpet" : "orange_carpet");
      }

      // --- the cone --------------------------------------------------------
      put(x, 3, z, "brown_wool");
      // The upper ring, minus the smoke gap due north.
      if (r2 <= 4 && !(dx === 0 && dz === -2)) put(x, 4, z, "white_wool");
    }
  }
  // The solid cap.
  put(c, 5, c, "brown_wool");

  // A lamp by the door, hung from the roof course above it — inside the wall
  // ring, so it does not punch a hole in the cone.
  put(c, 2, c + 1, palette.lantern, { hanging: "true" });

  return { ops: NO_OPS, meta: metaOf("yurt") };
};

/* -------------------------------------------------------------------------- */
/* the midway                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The helter skelter's slide ring, clockwise from due east.
 *
 * Every cell is orthogonally adjacent to the tower's three-by-three core, which
 * is the property the whole prop rests on: a slide stair with the core beside
 * it is never a half block with air on six faces. The four Chebyshev-two
 * corners are *not* in the list, precisely because they touch no core cell.
 */
const SKELTER_RING: readonly (readonly [number, number])[] = Object.freeze([
  [2, -1],
  [2, 0],
  [2, 1],
  [1, 2],
  [0, 2],
  [-1, 2],
  [-2, 1],
  [-2, 0],
  [-2, -1],
  [-1, -2],
  [0, -2],
  [1, -2],
] as const);

/**
 * `helter_skelter` — the fairground tower with the slide round the outside.
 *
 * A solid striped core, twenty-four stair treads spiralling down two laps of
 * the ring around it, a striped cone crown with a banner on the point and a
 * stone arch at the foot where the queue goes in.
 *
 * The slide is a *read*, not a ride: nobody slides down it, and it does not
 * have to be continuous in the way a staircase does. What it does have to be is
 * supported, and it is, cell by cell, against the core.
 */
const helterSkelter: PropGenerator = (ctx) => {
  const { put, palette } = ctx;
  const c = (SKELTER_SPAN - 1) / 2;
  const coreTop = 8;

  // --- the pad -------------------------------------------------------------
  for (let dx = -c; dx <= c; dx++) {
    for (let dz = -c; dz <= c; dz++) {
      if (dx * dx + dz * dz > 10) continue;
      if (Math.abs(dx) <= 1 && Math.abs(dz) <= 1) continue; // the core's own foot
      put(c + dx, 0, c + dz, stoneAt(palette, c + dx, 0, c + dz));
    }
  }

  // --- the core ------------------------------------------------------------
  for (let y = 0; y <= coreTop; y++) {
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) put(c + dx, y, c + dz, stripeConcrete(y));
    }
  }

  // --- the slide -----------------------------------------------------------
  // Two laps of twelve, dropping a course every third tread: twenty-four
  // stairs from the crown down to the pad.
  for (let i = 0; i < 24; i++) {
    const cell = SKELTER_RING[i % SKELTER_RING.length] as readonly [number, number];
    const [dx, dz] = cell;
    const y = coreTop - Math.floor(i / 3);
    const facing =
      Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? "east" : "west") : dz > 0 ? "south" : "north";
    put(c + dx, y, c + dz, palette.stairs, { facing, half: "bottom", shape: "straight" });
  }

  // --- the crown -----------------------------------------------------------
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) put(c + dx, coreTop + 1, c + dz, stripe(dx + dz));
  }
  put(c, coreTop + 2, c, stripe(1));
  const banner = WAYSIDE_BANNERS[ctx.rng("skelter").int(0, WAYSIDE_BANNERS.length - 1)] as string;
  put(c, coreTop + 3, c, banner, { rotation: "0" });

  // --- the entrance arch ---------------------------------------------------
  // Clear of the ring (which reaches two cells out), so no tread can land on
  // it: two piers, a lintel, and the doorway between them.
  for (const x of [c - 1, c + 1]) {
    for (let y = 1; y <= 2; y++) put(x, y, c + 3, palette.stoneAccent);
  }
  for (let x = c - 1; x <= c + 1; x++) put(x, 3, c + 3, palette.stone);

  return { ops: NO_OPS, meta: metaOf("helter_skelter") };
};

/**
 * `midway_arch` — the gate you walk under to get into the fair.
 *
 * Two striped pillar towers with a span between them, banners standing along
 * the span and bunting hanging under it. Every full cube of the span is
 * continuous with its neighbour and the run reaches a tower head at each end,
 * so no cube in the middle of the arch has six air faces; the lanterns are hung
 * from the span above them and the iron bars simply touch it.
 */
const midwayArch: PropGenerator = (ctx) => {
  const { put, palette } = ctx;
  const w = MIDWAY_W;
  const towers = [0, 1, w - 2, w - 1];

  // --- the towers ----------------------------------------------------------
  for (const x of towers) {
    for (let y = 0; y <= 4; y++) {
      for (let z = 0; z < 3; z++) put(x, y, z, stripeConcrete(x + y));
    }
    for (const z of [0, 2]) put(x, 5, z, palette.roofSlab, { type: "bottom" });
  }

  // --- the span ------------------------------------------------------------
  for (let x = 0; x < w; x++) put(x, 5, 1, stripeConcrete(x));

  // --- the flags and the bunting -------------------------------------------
  for (let x = 2; x < w - 2; x++) {
    const banner = WAYSIDE_BANNERS[ctx.rng(`midway.${x}`).int(0, WAYSIDE_BANNERS.length - 1)];
    put(x, 6, 1, banner as string, { rotation: "0" });
  }
  for (let x = 3; x < w - 3; x++) put(x, 4, 1, "iron_bars");
  for (const x of [2, w - 3]) put(x, 4, 1, palette.lantern, { hanging: "true" });

  return { ops: NO_OPS, meta: metaOf("midway_arch") };
};

/**
 * `shooting_gallery` — the booth with the targets at the back.
 *
 * A counter across the front on two posts, a concrete back wall with three
 * target discs, a prize shelf under the eaves and a striped canopy over the
 * lot. The targets are buttons on a white concrete cell — a button is the
 * smallest round thing in the game, and set into a contrasting block it is a
 * bullseye. Every button has the wall directly behind it, which is both what
 * the game wants and what `floating.*` wants.
 */
const shootingGallery: PropGenerator = ({ put, palette }) => {
  const w = GALLERY_W;

  // --- the floor -----------------------------------------------------------
  for (let x = 0; x < w; x++) {
    for (let z = 0; z < 3; z++) put(x, 0, z, palette.planks);
  }

  // --- the back wall, and the targets --------------------------------------
  const targets = new Set([1, 3, 5]);
  for (let y = 1; y <= 4; y++) {
    for (let x = 0; x < w; x++) {
      put(x, y, 2, y === 2 && targets.has(x) ? "white_concrete" : stripeConcrete(x + y));
    }
  }
  for (const x of targets) {
    put(x, 2, 1, "stone_button", { face: "wall", facing: "north", powered: "false" });
  }

  // --- the counter, on its two posts ---------------------------------------
  for (const x of [0, w - 1]) {
    for (let y = 1; y <= 4; y++) put(x, y, 0, palette.log, { axis: "y" });
  }
  for (let x = 1; x < w - 1; x++) {
    put(x, 1, 0, palette.planks);
    put(x, 2, 0, palette.slab, { type: "bottom" });
  }

  // --- the prize shelf -----------------------------------------------------
  for (let x = 1; x < w - 1; x++) put(x, 3, 1, palette.planks);
  for (const x of [1, 3, 5]) put(x, 4, 1, x === 3 ? "hay_block" : palette.cargo, {
    ...(x === 3 ? {} : { facing: "up", open: "false" }),
  });

  // --- the canopy ----------------------------------------------------------
  for (let x = 0; x < w; x++) {
    for (let z = 1; z < 3; z++) put(x, 5, z, stripe(x));
    put(x, 5, 0, palette.roofSlab, { type: "bottom" });
  }
  put(2, 4, 0, palette.lantern, { hanging: "true" });
  put(w - 3, 4, 0, palette.lantern, { hanging: "true" });

  return { ops: NO_OPS, meta: metaOf("shooting_gallery") };
};

/* -------------------------------------------------------------------------- */
/* registry                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Name → generator, spread into `PROP_GENERATORS` by `props.ts`.
 *
 * Adding a prop is one entry here and one name in {@link WAYSIDE_PROP_NAMES};
 * the catalog test holds the two against each other.
 */
export const WAYSIDE_PROP_GENERATORS: Readonly<Record<string, PropGenerator>> = Object.freeze({
  bus_shelter: busShelter,
  phone_box: phoneBox,
  mailbox,
  bicycle_rack: bicycleRack,
  shop_awning: shopAwning,
  milestone,
  bus_stop: busStop,
  stagecoach,
  yurt,
  helter_skelter: helterSkelter,
  midway_arch: midwayArch,
  shooting_gallery: shootingGallery,
});

/* -------------------------------------------------------------------------- */
/* exhibits                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Dev-world exhibit rows for this wave, in the shape `exhibits/props.ts`
 * spreads.
 *
 * It lives here rather than compiler-side for the same reason
 * `exhibits/street-props.ts` exists: `exhibits/props.ts` is shared ground
 * between parallel tracks, and registering a wave there should be one import
 * and one spread. Every one of the twelve appears at yaw 0; the rotations are
 * spent on the props whose op lists are asymmetric — the shelter's open front,
 * the coach's drawbar, the yurt's doorway, the gallery's counter — which are
 * the ones where a property that failed to rotate would be invisible at yaw 0.
 */
export const WAYSIDE_PROP_EXHIBIT_PLAN: readonly {
  readonly row: string;
  readonly water: boolean;
  readonly cells: readonly {
    readonly prop: WaysidePropName;
    readonly params: Record<string, unknown>;
  }[];
}[] = Object.freeze([
  {
    row: "wayside_kerb",
    water: false,
    cells: [
      { prop: "bus_shelter", params: { yaw: 0 } },
      { prop: "bus_shelter", params: { yaw: 180 } },
      { prop: "phone_box", params: { yaw: 0 } },
      { prop: "mailbox", params: { yaw: 0 } },
      { prop: "mailbox", params: { yaw: 90 } },
      { prop: "bicycle_rack", params: { yaw: 0 } },
      { prop: "bicycle_rack", params: { yaw: 90 } },
      { prop: "shop_awning", params: { yaw: 0 } },
      { prop: "shop_awning", params: { yaw: 270 } },
    ],
  },
  {
    row: "wayside_road",
    water: false,
    cells: [
      { prop: "milestone", params: { yaw: 0 } },
      { prop: "bus_stop", params: { yaw: 0 } },
      { prop: "bus_stop", params: { yaw: 90 } },
      { prop: "stagecoach", params: { yaw: 0 } },
      { prop: "stagecoach", params: { yaw: 90 } },
      { prop: "yurt", params: { yaw: 0 } },
      { prop: "yurt", params: { yaw: 180 } },
    ],
  },
  {
    row: "wayside_midway",
    water: false,
    cells: [
      { prop: "helter_skelter", params: { yaw: 0 } },
      { prop: "helter_skelter", params: { yaw: 90 } },
      { prop: "midway_arch", params: { yaw: 0 } },
      { prop: "midway_arch", params: { yaw: 90 } },
      { prop: "shooting_gallery", params: { yaw: 0 } },
      { prop: "shooting_gallery", params: { yaw: 180 } },
    ],
  },
]);
