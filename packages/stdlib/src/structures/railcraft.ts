/**
 * `prop.place@0` — the transport-land rolling stock.
 *
 * The fleet in `ships.ts` floats and the fleet in `aircraft.ts` is parked on an
 * apron; a train does neither. A locomotive standing on bare grass reads as a
 * locomotive that has fallen off the railway, so **every craft in this file
 * carries its own short length of track**: a ballast bed at `y = 0`, a rail on
 * it at `y = 1`, and the vehicle from `y = 2` up. That is one prop rather than
 * two for the same reason the airliner carries its own airstair — a placer that
 * had to put a carriage *on* a separately placed rail line would need a
 * constraint the coarse placer cannot express.
 *
 * Three rules the whole file is written against, all of them shared with the
 * two transport files beside it:
 *
 * - **support closure.** Every block rests on the bed, on another of the prop's
 *   own blocks, or hangs under one. Fences stand on full cubes only;
 * - **no `chain`.** The pinned 1.21.11 block table has no `chain`, so link and
 *   rigging reads are `iron_bars`;
 * - **no sign blocks.** A sign is a block entity; a banner is not.
 *
 * The wheel read is the stagecoach's, one course taller for a driving wheel: a
 * stripped-log axle across the rail with a trapdoor disc either side of it.
 */

import { definePropDescriptors } from "./descriptor.js";
import { octaDisc } from "./aircraft.js";
import type { PropContext, PropGenerator, PropMeta, PropResult } from "./props.js";

/* -------------------------------------------------------------------------- */
/* catalog                                                                     */
/* -------------------------------------------------------------------------- */

/** Every transport-land craft this file builds, in catalog order. */
export const RAILCRAFT_PROP_NAMES = [
  "locomotive",
  "passenger_car",
  "freight_car",
  "caboose",
] as const;

/** A rolling-stock prop name. */

/** Every craft here rides a bed this wide, and declares it as its box. */
const RAIL_PAD_WIDTH = 7;

/** The declared box of every rolling-stock prop, keyed by name. */
const RAILCRAFT_FOOTPRINTS: Readonly<
  Record<
    string,
    () => { readonly size: readonly [number, number, number]; readonly minY: number }
  >
> = {
  locomotive: () => ({ size: [22, 12, RAIL_PAD_WIDTH], minY: 0 }),
  passenger_car: () => ({ size: [20, 9, RAIL_PAD_WIDTH], minY: 0 }),
  freight_car: () => ({ size: [16, 6, RAIL_PAD_WIDTH], minY: 0 }),
  caboose: () => ({ size: [14, 11, RAIL_PAD_WIDTH], minY: 0 }),
};

function metaOf(prop: string): PropMeta {
  const fn = RAILCRAFT_FOOTPRINTS[prop];
  if (!fn) throw new Error(`unknown railcraft prop "${prop}"`);
  const foot = fn();
  return {
    prop: prop as PropMeta["prop"],
    size: foot.size,
    minY: foot.minY,
    base: "ground",
    piles: [],
  };
}

function done(prop: string): PropResult {
  return { ops: [], meta: metaOf(prop) };
}

/* -------------------------------------------------------------------------- */
/* the permanent way                                                           */
/* -------------------------------------------------------------------------- */

/** The centre line of every craft in this file, in local `z`. */
export const RAIL_CZ = (RAIL_PAD_WIDTH - 1) / 2;

/**
 * The bed and the rail under a craft.
 *
 * The bed is the *full* declared width rather than the three cells the sleepers
 * would need: it is what makes the prop's box honest in `z` at every station,
 * and a wide cess either side of a track is what a railway actually looks like
 * where it crosses open ground.
 */
function railRun(ctx: PropContext, length: number): void {
  const { put, palette } = ctx;
  for (let x = 0; x < length; x++) {
    for (let z = 0; z < RAIL_PAD_WIDTH; z++) {
      put(x, 0, z, z === RAIL_CZ - 1 || z === RAIL_CZ + 1 ? palette.stripped : palette.bed, {
        ...(z === RAIL_CZ - 1 || z === RAIL_CZ + 1 ? { axis: "z" } : {}),
      });
    }
    // Every rail is emitted at the block's default shape; `emit/connections.ts`
    // derives the run's real shapes from the neighbourhood, exactly as it does
    // for `rail_line`.
    put(x, 1, RAIL_CZ, palette.rail);
  }
}

/**
 * One wheelset: an axle across the rail with a disc at each end.
 *
 * `tall` is the driving wheel — two courses of trapdoor rather than one, which
 * is the only thing that tells a locomotive's drivers from a wagon's.
 */
function wheelset(ctx: PropContext, x: number, tall: boolean): void {
  const { put, palette } = ctx;
  put(x, 2, RAIL_CZ, palette.stripped, { axis: "z" });
  for (const sign of [-1, 1]) {
    const z = RAIL_CZ + sign;
    put(x, 2, z, palette.trapdoor, {
      facing: sign < 0 ? "north" : "south",
      half: "bottom",
      open: "false",
    });
    if (tall) {
      put(x, 3, z, palette.trapdoor, {
        facing: sign < 0 ? "north" : "south",
        half: "top",
        open: "false",
      });
    }
  }
}

/* -------------------------------------------------------------------------- */
/* the locomotive                                                              */
/* -------------------------------------------------------------------------- */

/**
 * `locomotive` — 22 × 7, a boiler barrel under a cab.
 *
 * The boiler is the aircraft file's octagon read on its side: a stack of filled
 * discs of radius two swept along `x`, which at this scale is the roundest
 * barrel a lattice has. Ahead of it the smokebox is one dark course and the
 * cowlifter steps down to the bed; behind it the cab is a box with the coal
 * bunker in its back corner, so the engine reads as a tank engine that carries
 * its own fuel rather than as an engine missing a tender.
 */
const locomotive: PropGenerator = (ctx) => {
  const { put, palette } = ctx;
  const cz = RAIL_CZ;
  const length = 22;
  const boilerY = 7;
  const barrel = ctx.rng("loco.barrel").float() < 0.5 ? "black_concrete" : palette.stripped;

  railRun(ctx, length);
  // Driving wheels under the boiler, and a leading truck under the smokebox.
  for (const x of [3, 4]) wheelset(ctx, x, false);
  for (const x of [7, 10, 13]) wheelset(ctx, x, true);
  for (const x of [18, 19]) wheelset(ctx, x, false);

  // --- the main frame -------------------------------------------------------
  for (let x = 1; x < length - 1; x++) {
    for (let dz = -2; dz <= 2; dz++) put(x, 4, cz + dz, "gray_concrete");
  }
  // The cowlifter: two courses of stair stepping down off the front of the
  // frame onto the bed, so the engine has a front rather than a cut end.
  for (let dz = -1; dz <= 1; dz++) put(1, 3, cz + dz, "gray_concrete");
  // The pilot proper: a column at the stem carrying a stair that rakes down to
  // the bed. Every cell of it shares a face with the one under it — a staircase
  // drawn on the diagonal is a line of blocks touching nothing — and the centre
  // column is left clear so the rail runs the whole length of the bed.
  for (const dz of [-1, 1]) {
    put(0, 1, cz + dz, "gray_concrete");
    put(0, 2, cz + dz, "gray_concrete");
    put(0, 3, cz + dz, palette.stairs, { facing: "west", half: "bottom", shape: "straight" });
  }

  // --- the boiler -----------------------------------------------------------
  for (let x = 2; x <= 13; x++) {
    for (const { dy, dz } of octaDisc(2)) {
      const block = x === 2 ? "black_concrete" : dy === 2 ? barrel : dy <= -1 ? "gray_concrete" : barrel;
      put(x, boilerY + dy, cz + dz, block);
    }
    // Boiler bands, in the ironwork the rest of the engine is bolted with.
    if (x % 4 === 1) {
      for (const dz of [-2, 2]) put(x, boilerY, cz + dz, "iron_block");
    }
  }
  put(2, boilerY, cz, "iron_block"); // the smokebox door
  // Chimney, steam dome and sandbox, all standing on the top of the barrel.
  for (let y = boilerY + 3; y <= boilerY + 4; y++) put(4, y, cz, "black_concrete");
  put(9, boilerY + 3, cz, "iron_block");
  put(11, boilerY + 3, cz, palette.stone);
  // The handrail along the running board, standing on the frame.
  for (let x = 3; x <= 12; x += 3) {
    for (const dz of [-2, 2]) put(x, 5, cz + dz, palette.fence);
  }

  // --- the cab --------------------------------------------------------------
  for (let x = 14; x <= 20; x++) {
    for (let dz = -2; dz <= 2; dz++) {
      const wall = Math.abs(dz) === 2 || x === 20;
      if (x === 14 && Math.abs(dz) < 2) continue; // the boiler comes through
      for (let y = 5; y <= 9; y++) {
        if (!wall && x !== 14) continue;
        // The spectacle plates: one glazed course at eye height on each side.
        put(x, y, cz + dz, y === 7 && x !== 20 ? "glass_pane" : "black_concrete");
      }
    }
  }
  for (let x = 14; x <= 20; x++) {
    for (let dz = -2; dz <= 2; dz++) put(x, 10, cz + dz, "gray_concrete");
  }
  // The bunker: coal in the back of the cab, which is the tender read.
  for (let x = 18; x <= 19; x++) {
    for (const dz of [-1, 1]) put(x, 5, cz + dz, "coal_block");
  }
  put(19, 5, cz, "coal_block");
  // The lamp: a standing lantern on the smokebox top, and the whistle beside
  // the dome.
  put(3, boilerY + 3, cz, palette.lantern, { hanging: "false" });
  put(15, 11, cz, palette.lantern, { hanging: "false" });
  for (let dz = -2; dz <= 2; dz += 4) put(15, 11, cz + dz, "iron_bars");
  return done("locomotive");
};

/* -------------------------------------------------------------------------- */
/* the carriages                                                               */
/* -------------------------------------------------------------------------- */

/**
 * `passenger_car` — 20 × 7, a windowed box on two bogies.
 *
 * Deliberately walkable: the body is five cells across the inside and three
 * courses tall, so a player can stand in the aisle between the two rows of
 * stair benches. A carriage read only from outside would have been cheaper and
 * would also have been the one vehicle in the catalog a visitor tries to go
 * inside.
 */
const passengerCar: PropGenerator = (ctx) => {
  const { put, palette } = ctx;
  const cz = RAIL_CZ;
  const length = 20;
  const livery = ctx.rng("carriage.livery").float() < 0.5 ? "green_concrete" : "brown_concrete";

  railRun(ctx, length);
  for (const x of [2, 3, 4, 15, 16, 17]) wheelset(ctx, x, false);

  // Underframe and floor, the full width of the body.
  for (let x = 1; x <= 18; x++) {
    for (let z = 0; z < RAIL_PAD_WIDTH; z++) put(x, 3, z, x === 1 || x === 18 ? "gray_concrete" : palette.planks);
  }
  // Body sides: waist panel, a glazed course, and the cant rail over it.
  for (let x = 1; x <= 18; x++) {
    for (let z = 0; z < RAIL_PAD_WIDTH; z++) {
      const wall = z === 0 || z === RAIL_PAD_WIDTH - 1 || x === 1 || x === 18;
      if (!wall) continue;
      const door = (x === 5 || x === 14) && (z === 0 || z === RAIL_PAD_WIDTH - 1);
      for (let y = 4; y <= 6; y++) {
        if (door && y < 6) {
          put(x, y, z, palette.trapdoor, {
            facing: z === 0 ? "north" : "south",
            half: y === 4 ? "bottom" : "top",
            open: "false",
          });
          continue;
        }
        const glazed = y === 5 && !door && x > 2 && x < 17 && x % 2 === 1;
        put(x, y, z, glazed ? "glass_pane" : livery);
      }
    }
  }
  // Roof, and the walkway along the crown of it.
  for (let x = 1; x <= 18; x++) {
    for (let z = 0; z < RAIL_PAD_WIDTH; z++) put(x, 7, z, "light_gray_concrete");
  }
  for (let x = 4; x <= 15; x++) put(x, 8, cz, palette.roofSlab, { type: "bottom" });
  // Bench rows down both sides of the aisle, facing in.
  for (let x = 3; x <= 16; x += 2) {
    for (const sign of [-1, 1]) {
      put(x, 4, cz + sign * 2, palette.stairs, {
        facing: sign < 0 ? "south" : "north",
        half: "bottom",
        shape: "straight",
      });
    }
  }
  // Two lanterns in the aisle ceiling, hung from the roof.
  for (const x of [6, 13]) put(x, 6, cz, palette.lantern, { hanging: "true" });
  return done("passenger_car");
};

/**
 * `freight_car` — 16 × 7, an open-top gondola wagon with a load in it.
 *
 * The load is drawn from the wagon's own seed and the *cells* are fixed: a prop
 * whose geometry moved with its seed would have a footprint that is only true
 * on average, which is the rule the trawler's deck stowage already states.
 */
const freightCar: PropGenerator = (ctx) => {
  const { put, palette } = ctx;
  const cz = RAIL_CZ;
  const length = 16;
  const body = ctx.rng("freight.paint").float() < 0.5 ? "brown_concrete" : "gray_concrete";

  railRun(ctx, length);
  for (const x of [2, 3, 11, 12]) wheelset(ctx, x, false);

  for (let x = 1; x <= 14; x++) {
    for (let dz = -2; dz <= 2; dz++) put(x, 3, cz + dz, "gray_concrete");
  }
  // The sides: two courses of planking, ribbed every third stanchion.
  for (let x = 1; x <= 14; x++) {
    for (let dz = -2; dz <= 2; dz++) {
      const wall = Math.abs(dz) === 2 || x === 1 || x === 14;
      if (!wall) continue;
      for (let y = 4; y <= 5; y++) put(x, y, cz + dz, x % 3 === 1 ? "iron_block" : body);
    }
  }
  // The load, in the fixed cells of the hold.
  const rng = ctx.rng("freight.load");
  for (let x = 3; x <= 12; x += 2) {
    for (const dz of [-1, 0, 1]) {
      const box = rng.float() < 0.6;
      put(x, 4, cz + dz, box ? palette.cargo : palette.hay, box ? { facing: "up" } : { axis: "y" });
    }
  }
  return done("freight_car");
};

/**
 * `caboose` — 14 × 7, the red one, with the cupola on top.
 *
 * The cupola is the whole point of the shape — a raised lookout over the roof
 * from which the guard watched his own train — and the end platforms are the
 * other half of it: railed decks at each end that the body does not fill, so
 * the wagon reads as something a person stands on the back of.
 */
const caboose: PropGenerator = (ctx) => {
  const { put, palette } = ctx;
  const cz = RAIL_CZ;
  const length = 14;

  railRun(ctx, length);
  for (const x of [3, 4, 9, 10]) wheelset(ctx, x, false);

  // The floor, over the whole wagon: the two end bays are the platforms.
  for (let x = 1; x <= 12; x++) {
    for (let z = 0; z < RAIL_PAD_WIDTH; z++) put(x, 3, z, palette.planks);
  }
  // Platform railings, on the floor and clear of the body.
  for (const x of [1, 12]) {
    for (let z = 0; z < RAIL_PAD_WIDTH; z++) put(x, 4, z, palette.fence);
  }
  for (const x of [1, 2, 11, 12]) {
    for (const z of [0, RAIL_PAD_WIDTH - 1]) put(x, 4, z, palette.fence);
  }

  // --- the body -------------------------------------------------------------
  for (let x = 3; x <= 10; x++) {
    for (let z = 0; z < RAIL_PAD_WIDTH; z++) {
      const wall = z === 0 || z === RAIL_PAD_WIDTH - 1 || x === 3 || x === 10;
      if (!wall) continue;
      for (let y = 4; y <= 6; y++) {
        const glazed = y === 5 && x > 4 && x < 9 && (z === 0 || z === RAIL_PAD_WIDTH - 1);
        put(x, y, z, glazed ? "glass_pane" : "red_concrete");
      }
    }
    for (let z = 0; z < RAIL_PAD_WIDTH; z++) put(x, 7, z, "red_concrete");
  }

  // --- the cupola -----------------------------------------------------------
  for (let x = 5; x <= 8; x++) {
    for (let dz = -2; dz <= 2; dz++) {
      const wall = Math.abs(dz) === 2 || x === 5 || x === 8;
      if (wall) {
        for (let y = 8; y <= 9; y++) {
          put(x, y, cz + dz, y === 8 ? "glass_pane" : "red_concrete");
        }
      }
      put(x, 10, cz + dz, "dark_oak_slab", { type: "top" });
    }
  }
  // The stove pipe, out of the roof forward of the cupola, and a marker lamp
  // on the platform rail post at each end.
  for (let y = 8; y <= 9; y++) put(4, y, cz, "black_concrete");
  put(4, 10, cz, "iron_bars");
  for (const x of [1, 12]) put(x, 5, cz, palette.lantern, { hanging: "false" });
  return done("caboose");
};

/* -------------------------------------------------------------------------- */
/* registry                                                                    */
/* -------------------------------------------------------------------------- */

/** Rail prop name → generator, merged into `PROP_GENERATORS` by `props.ts`. */
const RAILCRAFT_GENERATORS: Readonly<Record<string, PropGenerator>> = Object.freeze({
  locomotive,
  passenger_car: passengerCar,
  freight_car: freightCar,
  caboose,
});

/* -------------------------------------------------------------------------- */
/* descriptors — ordered rows for the Phase 4 registry (no self-registration)  */
/* -------------------------------------------------------------------------- */

/**
 * Ordered prop descriptor rows for every rolling-stock prop in `railcraft.ts`.
 *
 * - Order is `RAILCRAFT_PROP_NAMES` (catalog order, also the central `PROP_NAMES` spread order:
 *   `locomotive`, `passenger_car`, `freight_car`, `caboose`).
 * - Footprint delegates to the leaf `RAILCRAFT_FOOTPRINTS` table; currently static (`base: ground`,
 *   `RAIL_PAD_WIDTH` wide with ballast at `y=0`/rail at `y=1`/vehicle from `y=2`) but kept as a
 *   param-dependent function so a future length/curve param would flow through unchanged.
 * - Generator is the leaf `RAILCRAFT_GENERATORS` handle — `railRun` / `wheelset` / vehicle draws,
 *   curve/grade/platform geometry and seeded draws stay in the leaf; no voxel emit or
 *   `LocalVoxelOp` reorder here.
 */
export const RAILCRAFT_PROP_DESCRIPTORS = definePropDescriptors(RAILCRAFT_PROP_NAMES, {
  footprint: (id, params) => {
    void params;
    const fn = RAILCRAFT_FOOTPRINTS[id];
    if (!fn) throw new Error(`unknown railcraft prop "${id}"`);
    const foot = fn();
    return { size: foot.size, minY: foot.minY, base: "ground" as const };
  },
  generator: RAILCRAFT_GENERATORS,
});
