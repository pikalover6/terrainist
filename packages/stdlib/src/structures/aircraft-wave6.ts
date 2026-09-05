/**
 * `prop.place@0` — three more machines for the airfield.
 *
 * The three the first air wave had no idiom for: a balloon (a *sphere*, which
 * nothing else in the catalog is), a floatplane (the biplane with its wheels
 * taken off and boats put on) and a sailplane (a wing with almost nothing
 * attached to it).
 *
 * The balloon is the interesting one, and it is drawn under the airship's rule
 * rather than against it. A lighter-than-air craft that hovers a block over the
 * grass is a full cube with air on all six faces, which the readback lint fails
 * and which is also a lie about the world: nothing holds it up. The airship
 * answers this with legs from its gondola to the ground; the balloon answers it
 * with a **mast** — a timber column from the basket floor up into the throat of
 * the envelope, so the whole craft is one support chain that reaches `y = 0`.
 * A moored balloon is what it looks like, which is the honest read anyway.
 */

import { definePropDescriptors } from "./descriptor.js";
import { craftPalette, ellipseRadius, octaDisc, ringCells } from "./aircraft.js";
import { SAIL_WOOLS, type PropGenerator, type PropMeta, type PropResult } from "./props.js";

/* -------------------------------------------------------------------------- */
/* catalog                                                                     */
/* -------------------------------------------------------------------------- */

/** Every craft this file builds, in catalog order. */
export const AIRCRAFT6_PROP_NAMES = ["hot_air_balloon", "seaplane", "glider"] as const;

/** One of the craft this file builds. */

/** The envelope's greatest radius, and its half-height. */
const BALLOON_R = 5;
/** Half the envelope's vertical axis — a balloon is taller than it is wide. */
const BALLOON_HALF = 6;

/** The declared box of every craft here, keyed by name. */
const AIRCRAFT6_FOOTPRINTS: Readonly<
  Record<
    string,
    () => { readonly size: readonly [number, number, number]; readonly minY: number }
  >
> = {
  hot_air_balloon: () => ({ size: [2 * BALLOON_R + 1, 20, 2 * BALLOON_R + 1], minY: 0 }),
  seaplane: () => ({ size: [15, 10, 15], minY: 0 }),
  glider: () => ({ size: [18, 8, 25], minY: 0 }),
};

function metaOf(prop: string): PropMeta {
  const fn = AIRCRAFT6_FOOTPRINTS[prop];
  if (!fn) throw new Error(`unknown aircraft prop "${prop}"`);
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
/* the balloon                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * `hot_air_balloon` — an 11-wide envelope over a wicker basket.
 *
 * The envelope is a stack of horizontal rings whose radius is
 * {@link ellipseRadius} of the height — the airship's shape function read
 * upright — with {@link ringCells} for the skin and the annulus between
 * successive radii filled where the profile steps, so the shell is one closed
 * surface and not a pile of hoops. Two wools in alternating gores are what
 * stops eleven blocks of one colour reading as a ball of wool.
 *
 * The basket is fence walls with a trapdoor coaming, the burner is a campfire
 * on a full-cube pedestal *inside* the basket (a campfire walks its support
 * chain down like a fence does, so the pedestal is load-bearing rather than
 * decorative), and the mast runs from the basket floor to the envelope throat.
 */
const hotAirBalloon: PropGenerator = (ctx) => {
  const { put, palette } = ctx;
  const c = BALLOON_R;
  const centreY = 13;
  const gore = SAIL_WOOLS[ctx.rng("balloon.gore").int(0, SAIL_WOOLS.length - 1)] as string;
  const band = ctx.rng("balloon.band").float() < 0.5 ? "white_wool" : "red_wool";

  // --- the envelope ---------------------------------------------------------
  const radiusAt = (y: number): number => ellipseRadius(y - centreY, BALLOON_HALF, BALLOON_R);
  const bottom = centreY - BALLOON_HALF;
  for (let y = bottom; y <= centreY + BALLOON_HALF; y++) {
    const r = radiusAt(y);
    if (r < 0) continue;
    const big = Math.max(radiusAt(y - 1), radiusAt(y + 1));
    // The annulus where the profile steps: the same closure the fuselage rings
    // get from a bulkhead, read horizontally.
    if (big > r) {
      const inner = new Set(octaDisc(r).map((cell) => `${cell.dy},${cell.dz}`));
      for (const cell of octaDisc(big)) {
        if (inner.has(`${cell.dy},${cell.dz}`)) continue;
        put(c + cell.dy, y, c + cell.dz, (cell.dy + cell.dz + y) % 4 === 0 ? band : gore);
      }
    }
    for (const cell of ringCells(r)) {
      // Gores: a band every fourth column round the envelope, so the sphere has
      // meridians on it rather than being one flat colour.
      const meridian = ((cell.dy + cell.dz) % 4 + 4) % 4 === 0;
      put(c + cell.dy, y, c + cell.dz, meridian ? band : gore);
    }
  }

  // --- the mast, the basket and the burner ----------------------------------
  for (let y = 1; y < bottom; y++) put(c, y, c, palette.log, { axis: "y" });
  for (let dx = -2; dx <= 2; dx++) {
    for (let dz = -2; dz <= 2; dz++) {
      put(c + dx, 0, c + dz, palette.planks);
      const rim = Math.abs(dx) === 2 || Math.abs(dz) === 2;
      if (!rim) continue;
      put(c + dx, 1, c + dz, palette.fence);
      put(c + dx, 2, c + dz, palette.trapdoor, {
        facing: dz === -2 ? "north" : dz === 2 ? "south" : dx === -2 ? "west" : "east",
        half: "top",
        open: "false",
      });
    }
  }
  // The burner: a campfire on a full cube, which is what carries its support.
  put(c + 1, 1, c, palette.stone);
  put(c + 1, 2, c, "campfire", { lit: "true" });
  // Load ropes from the basket rim up to the envelope's throat.
  for (const [dx, dz] of [
    [2, 0],
    [-2, 0],
    [0, 2],
    [0, -2],
  ] as const) {
    for (let y = 3; y < bottom; y++) put(c + dx, y, c + dz, "iron_bars");
  }
  // Sandbags at two corners of the basket, and the mooring line to the ground.
  for (const [dx, dz] of [
    [2, 2],
    [-2, -2],
  ] as const) {
    put(c + dx, 3, c + dz, palette.hay, { axis: "y" });
  }
  return done("hot_air_balloon");
};

/* -------------------------------------------------------------------------- */
/* the seaplane                                                                */
/* -------------------------------------------------------------------------- */

/**
 * `seaplane` — 15 × 15, the light aeroplane on floats.
 *
 * The biplane's fuselage and the light plane's high wing, standing on two
 * pontoons instead of wheels. The floats are the whole difference and they are
 * also what makes the craft *stand*: each is two courses on the ground carrying
 * a cross-strut up to the fuselage, so the aeroplane rests on its beaching gear
 * exactly as a real floatplane on a slipway does.
 */
const seaplane: PropGenerator = (ctx) => {
  const { put, palette } = ctx;
  const p = craftPalette(ctx, "seaplane");
  const cz = 7;
  const cy = 5;

  // --- the fuselage ---------------------------------------------------------
  for (let x = 1; x <= 11; x++) {
    for (const { dy, dz } of octaDisc(1)) {
      if (x === 7 && dy === 1 && dz === 0) continue; // the open cockpit
      put(x, cy + dy, cz + dz, dy === -1 ? p.livery : p.skin);
    }
  }
  for (let x = 4; x <= 6; x++) put(x, cy + 1, cz, p.glass);
  put(1, cy, cz, p.dark); // the cowling
  put(0, cy, cz, p.metal); // the spinner
  for (let y = cy - 2; y <= cy + 2; y++) put(0, y, cz, "iron_bars"); // the propeller

  // --- the high wing --------------------------------------------------------
  const wingY = cy + 2;
  for (let s = 0; s <= 7; s++) {
    for (const sign of [-1, 1]) {
      for (let x = 4; x <= 6; x++) {
        put(x, wingY, cz + sign * s, x === 6 ? p.skinDark : p.skin);
      }
      if (s === 0) break;
    }
  }
  for (const sign of [-1, 1]) {
    for (let y = cy; y <= wingY - 1; y++) put(5, y, cz + sign * 3, "iron_bars"); // lift struts
  }

  // --- the floats -----------------------------------------------------------
  for (const sign of [-1, 1]) {
    const z = cz + sign * 3;
    for (let x = 2; x <= 11; x++) {
      put(x, 0, z, p.dark);
      put(x, 1, z, x === 2 ? p.metal : p.skin);
    }
    // A step in the planing bottom, aft of the step where a real float has one.
    put(7, 0, z, p.metal);
    // The struts: the float's deck up to the fuselage, through a cross member.
    for (const x of [4, 9]) {
      for (let y = 2; y <= cy - 2; y++) put(x, y, z, p.metal);
      // The cross member, from the head of the strut inboard to the keel of
      // the fuselage: without it the float and its struts are a boat parked
      // beside an aeroplane rather than under one.
      for (let d = 1; d <= 3; d++) put(x, cy - 1, cz + sign * d, p.metal);
    }
  }

  // --- the tail -------------------------------------------------------------
  for (let x = 11; x <= 14; x++) put(x, cy, cz, p.skin);
  for (let y = cy + 1; y <= cy + 4; y++) put(14, y, cz, p.livery);
  for (let s = 1; s <= 3; s++) {
    for (const sign of [-1, 1]) put(14, cy + 1, cz + sign * s, p.skin);
  }
  put(12, cy + 1, cz, palette.lantern, { hanging: "false" });
  // The tip floats at the wingtips, which is what takes the box out to z = 0
  // and z = 14 at the ground plane as well as in the air.
  for (const sign of [-1, 1]) {
    const z = cz + sign * 7;
    for (let y = 0; y <= wingY - 1; y++) put(5, y, z, y === 0 ? p.dark : "iron_bars");
  }
  return done("seaplane");
};

/* -------------------------------------------------------------------------- */
/* the glider                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * `glider` — 18 × 25, almost all wing.
 *
 * The one craft in the catalog whose span is bigger than its length, which is
 * the entire read: twenty-five blocks of wing, three chords at the root and two
 * at the tip, a slim pod under it and a skid instead of a wheel. Everything
 * else is deliberately absent — an engine, a gear leg, a livery stripe — since
 * a sailplane that had any of them would read as a light aeroplane.
 */
const glider: PropGenerator = (ctx) => {
  const { put, palette } = ctx;
  const p = craftPalette(ctx, "glider");
  const cz = 12;
  const cy = 3;

  // --- the pod and boom -----------------------------------------------------
  for (let x = 1; x <= 8; x++) {
    for (const { dy, dz } of octaDisc(1)) {
      if (x === 4 && dy === 1 && dz === 0) continue; // the canopy opening
      put(x, cy + dy, cz + dz, p.skin);
    }
  }
  for (let x = 2; x <= 3; x++) put(x, cy + 1, cz, p.glass);
  put(0, cy, cz, p.dark); // the nose cap and the tow release
  for (let x = 9; x <= 17; x++) put(x, cy, cz, p.skin); // the tail boom

  // --- the wing -------------------------------------------------------------
  const wingY = cy + 2;
  for (let s = 0; s <= 12; s++) {
    const chord = s <= 6 ? 3 : 2;
    for (const sign of [-1, 1]) {
      for (let x = 5; x < 5 + chord; x++) {
        put(x, wingY, cz + sign * s, x === 5 + chord - 1 ? p.skinDark : p.skin);
      }
      if (s === 0) break;
    }
  }
  // The wing sits on the pod: one column of pylon between the two, so the wing
  // is carried rather than floating over the fuselage.
  for (let x = 5; x <= 6; x++) put(x, cy + 1, cz, p.skin);

  // --- the tail -------------------------------------------------------------
  for (let y = cy + 1; y <= cy + 4; y++) put(17, y, cz, p.skin);
  for (let s = 1; s <= 4; s++) {
    for (const sign of [-1, 1]) put(17, cy + 4, cz + sign * s, p.skin);
  }
  put(16, cy + 1, cz, p.skinDark);

  // --- standing on the ground ----------------------------------------------
  // The skid under the pod, a tail bumper, and a wingtip resting on the grass
  // the way a parked sailplane always has one.
  for (let x = 3; x <= 6; x++) put(x, 0, cz, p.metal);
  for (let y = 1; y < cy - 1; y++) put(5, y, cz, p.metal);
  put(5, cy - 1, cz, p.metal);
  put(16, 0, cz, p.dark);
  for (let y = 1; y <= cy - 1; y++) put(16, y, cz, palette.fence);
  for (let y = 0; y < wingY; y++) put(6, y, cz - 12, y === 0 ? p.dark : "iron_bars");
  return done("glider");
};

/* -------------------------------------------------------------------------- */
/* registry                                                                    */
/* -------------------------------------------------------------------------- */

/** Craft name → generator, merged into `PROP_GENERATORS` by `props.ts`. */
const AIRCRAFT6_GENERATORS: Readonly<Record<string, PropGenerator>> = Object.freeze({
  hot_air_balloon: hotAirBalloon,
  seaplane,
  glider,
});

/* -------------------------------------------------------------------------- */
/* descriptors — ordered rows for the Phase 4 registry (no self-registration)  */
/* -------------------------------------------------------------------------- */

/**
 * Ordered prop descriptor rows for every craft in `aircraft-wave6.ts`.
 *
 * - Order is `AIRCRAFT6_PROP_NAMES` (catalog order, also the central `PROP_NAMES` spread order).
 * - Footprint delegates to the leaf `AIRCRAFT6_FOOTPRINTS` table; currently static but kept as a
 *   param-dependent function so a future param (e.g. envelope size) would flow through.
 * - Generator is the leaf `AIRCRAFT6_GENERATORS` handle — no voxel emit, no seeded draw,
 *   no LocalVoxelOp reorder; support closure via the mooring mast is preserved in the generator.
 */
export const AIRCRAFT6_PROP_DESCRIPTORS = definePropDescriptors(AIRCRAFT6_PROP_NAMES, {
  footprint: (id, params) => {
    void params;
    const fn = AIRCRAFT6_FOOTPRINTS[id];
    if (!fn) throw new Error(`unknown aircraft prop "${id}"`);
    const foot = fn();
    return { size: foot.size, minY: foot.minY, base: "ground" as const };
  },
  generator: AIRCRAFT6_GENERATORS,
});
