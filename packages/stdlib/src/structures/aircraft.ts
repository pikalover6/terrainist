/**
 * `prop.place@0` — the transport-air grammar.
 *
 * Aeroplanes are the hardest thing this compiler draws, for a reason that has
 * nothing to do with size: everything else it builds is *architecture*, and
 * architecture is boxes. An airliner is a tube with a curved cross-section, two
 * surfaces swept back off it, and a fin — no vertical wall anywhere, and no
 * cell whose neighbour is obvious. So this file is mostly two ideas:
 *
 * - **stepped courses.** A fuselage is a stack of rings: at each station along
 *   the body the cross-section is an octagon of some radius, and the radius is
 *   a function of the station. Nose and tail are the same code with a smaller
 *   number, so a taper is not a special case. {@link ringCells} draws the skin
 *   and leaves the inside hollow, which is what makes a 52-block airliner cost
 *   a few thousand blocks rather than forty thousand;
 * - **integer conics.** An ellipsoid envelope and a barrel-vault hangar both
 *   want a radius that is a function of position along an axis. Both get it
 *   from {@link ellipseRadius}, which answers with integer arithmetic only —
 *   §6.5 rule 6 bans the platform transcendentals, and a hangar roof whose
 *   last bit differs between two machines is a world that is not reproducible.
 *
 * ## Standing on the ground
 *
 * Every craft here is *parked*. That is a physics claim, not a stylistic one:
 * the readback lint fails a full cube with air on all six faces and a fence or
 * a lantern whose support chain does not reach something solid, and an
 * aeroplane hovering a block over the apron is exactly that defect. So each
 * grounded craft carries real gear — posts from `y = 0` up to the structure
 * they hold — and every op in every craft is face-connected to the rest of it.
 * `test/vehicles.test.ts` re-derives both claims from the op lists.
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

/** Every transport-air prop, in catalog order. */
export const AIRCRAFT_PROP_NAMES = [
  "airliner",
  "cargo_plane",
  "biplane",
  "light_plane",
  "airship",
  "zeppelin_mast",
  "hangar",
  "runway",
] as const;

/** A transport-air prop name. */
export type AircraftPropName = (typeof AIRCRAFT_PROP_NAMES)[number];

/* -------------------------------------------------------------------------- */
/* palette                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The machine palette.
 *
 * The prop palette proper is themed timber and stone, which is right for a cart
 * and wrong for an airframe: an airliner is not made of the local spruce. So
 * the metal half is fixed here and the *themed* half still comes from
 * {@link PropContext.palette} wherever a craft touches the ground it is parked
 * on — the hangar's masonry, a mooring mast's timber.
 */
export interface CraftPalette {
  /** Fuselage and wing skin. */
  readonly skin: string;
  /** The shaded underside course, so a wing reads as a wing from below. */
  readonly skinDark: string;
  /** Engine cowlings, gear legs, ironmongery. */
  readonly metal: string;
  /** Tyres, intakes, doors — the holes in a white shape. */
  readonly dark: string;
  /** Cabin windows and cockpit glazing. */
  readonly glass: string;
  readonly pane: string;
  /** The airline's stripe, drawn once per craft from its own seed. */
  readonly livery: string;
}

/** The liveries a craft's cheatline may be painted in, in draw order. */
export const LIVERY_COLORS: readonly string[] = Object.freeze([
  "red_concrete",
  "blue_concrete",
  "yellow_concrete",
  "lime_concrete",
  "orange_concrete",
  "magenta_concrete",
]);

/** Resolve the machine palette, drawing the livery off the prop's own seed. */
export function craftPalette(ctx: PropContext, stream: string): CraftPalette {
  const livery = LIVERY_COLORS[ctx.rng(`${stream}.livery`).int(0, LIVERY_COLORS.length - 1)];
  return {
    skin: "white_concrete",
    skinDark: "light_gray_concrete",
    metal: "iron_block",
    dark: "gray_concrete",
    glass: "light_blue_stained_glass",
    pane: "glass_pane",
    livery: livery as string,
  };
}

/* -------------------------------------------------------------------------- */
/* geometry helpers                                                            */
/* -------------------------------------------------------------------------- */

/**
 * The largest integer `r` with `r / rMax <= sqrt(1 - (dx / half)^2)`.
 *
 * The ellipse, without ever evaluating a square root: the condition squares to
 * `r² · half² ≤ rMax² · (half² − dx²)`, which is integer arithmetic on numbers
 * far below 2^53 for anything this grammar builds. Beyond the ends it answers
 * `-1`, which every caller reads as "no course here".
 */
export function ellipseRadius(dx: number, half: number, rMax: number): number {
  if (half <= 0) return rMax;
  const rhs = rMax * rMax * (half * half - dx * dx);
  if (rhs < 0) return -1;
  for (let r = rMax; r >= 0; r--) {
    if (r * r * half * half <= rhs) return r;
  }
  return -1;
}

/** The filled octagon of radius `r` about the origin, as `(dy, dz)` offsets. */
export function octaDisc(r: number): { dy: number; dz: number }[] {
  const out: { dy: number; dz: number }[] = [];
  // The corner cut. A Manhattan limit of `1.4 r` is the octagon closest to the
  // circle of radius `r` on a square lattice — the square's own limit is `2 r`
  // and reads as a box, which is what an airship envelope looked like when
  // this line was wrong.
  const limit = Math.max(r, Math.round(r * 1.4));
  for (let dy = -r; dy <= r; dy++) {
    for (let dz = -r; dz <= r; dz++) {
      if (Math.abs(dy) + Math.abs(dz) > limit) continue;
      out.push({ dy, dz });
    }
  }
  return out;
}

/**
 * The boundary of {@link octaDisc}: the skin, with the inside left hollow.
 *
 * The erosion is by the **eight** neighbours, not the four, and that is the
 * whole subtlety of this function. A four-neighbour boundary of an octagon
 * leaves the corner cells `(r, 1)` and `(1, r)` touching only at a diagonal,
 * so the "ring" is four arcs with a gap at each corner — four separate pieces
 * of skin, which the readback lint reads as isolated blocks and a player reads
 * as an aeroplane with holes in it. Eroding by eight keeps the corner cell,
 * and the ring closes.
 */
export function ringCells(r: number): { dy: number; dz: number }[] {
  const disc = octaDisc(r);
  const inside = new Set(disc.map((c) => `${c.dy},${c.dz}`));
  const buried = (c: { dy: number; dz: number }): boolean => {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dz = -1; dz <= 1; dz++) {
        if (!inside.has(`${c.dy + dy},${c.dz + dz}`)) return false;
      }
    }
    return true;
  };
  return disc.filter((c) => !buried(c));
}

/**
 * The bulkhead between two sections of different radius: `disc(big) \ disc(r)`.
 *
 * Where a fuselage steps in, the smaller ring lies *inside* the larger one and
 * the two hollow shells never touch. The annulus between them, drawn at the
 * smaller station, is the frame that closes the step — structurally the
 * bulkhead a real fuselage has in exactly the same place.
 */
export function bulkheadCells(r: number, big: number): { dy: number; dz: number }[] {
  if (big <= r) return [];
  const inner = new Set(octaDisc(r).map((c) => `${c.dy},${c.dz}`));
  return octaDisc(big).filter((c) => !inner.has(`${c.dy},${c.dz}`));
}

/* -------------------------------------------------------------------------- */
/* footprints                                                                  */
/* -------------------------------------------------------------------------- */

/** `runway`'s default, minimum and maximum length, in blocks. */
export const RUNWAY_LENGTH = Object.freeze({ fallback: 32, lo: 12, hi: 64 });

/** The width of a runway strip, including both light lines. */
export const RUNWAY_WIDTH = 9;

/** The declared box of every air prop, keyed by name. */
export const AIRCRAFT_FOOTPRINTS: Readonly<
  Record<
    string,
    (params: Readonly<Record<string, unknown>>) => {
      readonly size: readonly [number, number, number];
      readonly minY: number;
    }
  >
> = {
  airliner: () => ({ size: [52, 19, 35], minY: 0 }),
  cargo_plane: () => ({ size: [40, 21, 29], minY: 0 }),
  biplane: () => ({ size: [14, 8, 15], minY: 0 }),
  light_plane: () => ({ size: [12, 7, 13], minY: 0 }),
  airship: () => ({ size: [41, 17, 13], minY: 0 }),
  zeppelin_mast: () => ({ size: [7, 20, 7], minY: 0 }),
  hangar: () => ({ size: [25, 14, 19], minY: 0 }),
  runway: (params) => ({
    size: [
      intParam(params, "length", RUNWAY_LENGTH.fallback, RUNWAY_LENGTH.lo, RUNWAY_LENGTH.hi),
      2,
      RUNWAY_WIDTH,
    ],
    minY: 0,
  }),
};

/** Assemble a prop meta from the declared footprint table. */
function metaOf(prop: string, params: Readonly<Record<string, unknown>> = {}): PropMeta {
  const foot = (AIRCRAFT_FOOTPRINTS[prop] as (p: Readonly<Record<string, unknown>>) => {
    size: readonly [number, number, number];
    minY: number;
  })(params);
  return {
    prop: prop as PropMeta["prop"],
    size: foot.size,
    minY: foot.minY,
    base: "ground",
    piles: [],
  };
}

/** Every generator here returns its ops through {@link PropContext.put}. */
function done(prop: string, params?: Readonly<Record<string, unknown>>): PropResult {
  return { ops: [], meta: metaOf(prop, params) };
}

/* -------------------------------------------------------------------------- */
/* the airliner                                                                */
/* -------------------------------------------------------------------------- */

/**
 * `airliner` — 52 × 35, the large one.
 *
 * Local `+x` runs nose to tail and `+z` is the span; the centre line is
 * `z = 17`, which puts a 17-block half-span wingtip on `z = 0` and `z = 34`
 * exactly, so the declared box is the box the craft touches.
 *
 * The fuselage is a stack of octagon rings whose radius steps 1, 2, 3, 3 … 3,
 * 2, 1: the nose and the tail cone are the same loop as the barrel. Everything
 * else hangs off it — a swept wing whose leading edge moves aft four blocks for
 * every five of span and whose chord narrows two thirds over the same distance,
 * two underslung nacelles, a swept fin with the tailplane crossing it, and
 * three gear legs that carry the whole thing to `y = 0`.
 *
 * The airstair is part of the prop rather than a prop of its own for a
 * placement reason: a stair truck is only ever *at* a door, and a second node
 * that had to find the first one's door would be a constraint the coarse placer
 * cannot express.
 */
const airliner: PropGenerator = (ctx) => {
  const { put } = ctx;
  const p = craftPalette(ctx, "airliner");
  const cz = 17;
  const cy = 6;
  const noseX = 0;
  const tailX = 49;

  /** Fuselage radius at station `x` — the nose and tail cones are the taper. */
  const radiusAt = (x: number): number => {
    if (x < noseX || x > tailX) return -1;
    if (x === 0) return 1;
    if (x === 1) return 2;
    if (x <= 43) return 3;
    if (x <= 46) return 2;
    return 1;
  };

  // --- the body -------------------------------------------------------------
  for (let x = noseX; x <= tailX; x++) {
    const r = radiusAt(x);
    if (r < 0) continue;
    // Where the section steps, the bulkhead closes it — see {@link bulkheadCells}.
    const big = Math.max(radiusAt(x - 1), radiusAt(x + 1));
    for (const { dy, dz } of bulkheadCells(r, big)) put(x, cy + dy, cz + dz, p.skin);
    for (const { dy, dz } of ringCells(r)) {
      const y = cy + dy;
      const z = cz + dz;
      // The cheatline: one course of livery along the waist, and a darker
      // belly, so the tube reads as a fuselage rather than as a pipe.
      const block = dy === -1 && Math.abs(dz) === r ? p.livery : dy <= -2 ? p.skinDark : p.skin;
      put(x, y, z, block);
    }
    // Cabin windows: a light every other frame along both flanks.
    if (x >= 8 && x <= 41 && x % 2 === 0) {
      for (const dz of [-3, 3]) put(x, cy, cz + dz, p.glass);
    }
  }
  // Cockpit glazing, and the radome cap.
  for (let x = 1; x <= 4; x++) {
    const r = radiusAt(x);
    for (const { dy, dz } of ringCells(r)) {
      if (dy < 0 || Math.abs(dz) > 2) continue;
      put(x, cy + dy, cz + dz, p.glass);
    }
  }
  put(0, cy, cz, p.dark);
  // Two doors, fore and aft, on the port flank.
  for (const x of [8, 38]) {
    for (let dy = -1; dy <= 0; dy++) put(x, cy + dy, cz + 3, p.dark);
  }

  // --- the wing -------------------------------------------------------------
  const wingY = 4;
  const rootLead = 20;
  /** Leading edge station at span offset `s`: four blocks aft per five out. */
  const leadAt = (s: number): number => rootLead + Math.round(s * 0.8);
  /** Chord at span offset `s`: fourteen at the root, three at the tip. */
  const chordAt = (s: number): number => Math.max(3, 14 - Math.round(s * 0.65));
  for (let s = 0; s <= 17; s++) {
    const lead = leadAt(s);
    const chord = chordAt(s);
    for (const sign of [-1, 1]) {
      const z = cz + sign * s;
      for (let x = lead; x < lead + chord; x++) {
        // The trailing two cells are the flap track fairing, in the darker
        // course: an all-white wing is a white rectangle.
        put(x, wingY, z, x >= lead + chord - 2 ? p.skinDark : p.skin);
      }
      // A thickened root box, which is also what the wing is bolted to.
      if (s <= 4) {
        for (let x = lead + 1; x < lead + chord - 3; x++) put(x, wingY + 1, z, p.skin);
      }
      if (s === 0) break; // the centre line is one column, not two
    }
  }

  // --- the engines ----------------------------------------------------------
  for (const sign of [-1, 1]) {
    const lead = leadAt(7);
    for (const s of [7, 8]) {
      const z = cz + sign * s;
      for (let x = lead - 5; x <= lead + 2; x++) {
        for (let y = 2; y <= 3; y++) {
          put(x, y, z, x === lead - 5 ? p.dark : x === lead + 2 ? p.metal : p.skin);
        }
      }
    }
  }

  // --- the gear -------------------------------------------------------------
  /** A leg: tyre on the ground, strut up to whatever it carries. */
  const leg = (x: number, z: number, top: number): void => {
    put(x, 0, z, p.dark);
    for (let y = 1; y <= top; y++) put(x, y, z, p.metal);
  };
  leg(6, cz, 2); // the nose leg, up to the belly at y = 3
  for (const sign of [-1, 1]) {
    leg(leadAt(4) + 3, cz + sign * 4, 3); // the mains, up to the wing at y = 4
  }

  // --- the tail -------------------------------------------------------------
  for (let y = 10; y <= 18; y++) {
    const lead = Math.min(42 + (y - 10), 50);
    for (let x = lead; x <= 51; x++) put(x, y, cz, y >= 16 ? p.livery : p.skin);
  }
  for (let s = 1; s <= 6; s++) {
    for (const sign of [-1, 1]) {
      for (let x = 45 + s; x <= 50; x++) put(x, 10, cz + sign * s, p.skin);
    }
  }

  // --- the airstair ---------------------------------------------------------
  // A truck at the fore door, its flight descending away from the flank. The
  // top tread meets the door sill at y = 5 and the bottom one stands on the
  // apron, so the aeroplane has a way in that a walking agent could use.
  for (let i = 0; i <= 5; i++) {
    const z = cz + 4 + i;
    const y = 5 - i;
    put(8, y, z, "polished_andesite_stairs", {
      facing: "south",
      half: "bottom",
      shape: "straight",
    });
    for (let below = 0; below < y; below++) put(8, below, z, p.dark);
  }
  for (const z of [cz + 4, cz + 9]) put(7, 0, z, p.metal);

  return done("airliner");
};

/* -------------------------------------------------------------------------- */
/* the cargo plane                                                             */
/* -------------------------------------------------------------------------- */

/**
 * `cargo_plane` — 40 × 29, high wing and a rear ramp.
 *
 * The freighter's whole shape follows from one requirement: a truck has to be
 * able to drive in. That puts the wing on *top* of a fat radius-4 fuselage
 * (nothing may cross the hold), the gear in sponsons against the flanks rather
 * than in a wing box, and the tail high enough to clear a ramp that comes down
 * to the ground at the back.
 */
const cargoPlane: PropGenerator = (ctx) => {
  const { put } = ctx;
  const p = craftPalette(ctx, "cargo");
  const cz = 14;
  const cy = 7;

  const radiusAt = (x: number): number => {
    if (x < 0 || x > 37) return -1;
    if (x === 0) return 1;
    if (x === 1) return 2;
    if (x === 2) return 3;
    if (x <= 31) return 4;
    if (x <= 34) return 3;
    return 2;
  };

  for (let x = 0; x <= 37; x++) {
    const r = radiusAt(x);
    if (r < 0) continue;
    const big = Math.max(radiusAt(x - 1), radiusAt(x + 1));
    for (const { dy, dz } of bulkheadCells(r, big)) put(x, cy + dy, cz + dz, p.skin);
    for (const { dy, dz } of ringCells(r)) {
      const y = cy + dy;
      // The hold's floor is flat, so the belly is a flat course rather than a
      // curve: a rounded floor is a hold nothing rolls into.
      const block = dy <= -3 ? p.skinDark : dy === 3 ? p.livery : p.skin;
      put(x, y, cz + dz, block);
    }
    if (r >= 3) {
      for (let dz = -2; dz <= 2; dz++) put(x, cy - 3, cz + dz, p.skinDark);
    }
  }
  for (let x = 1; x <= 4; x++) {
    for (const { dy, dz } of ringCells(radiusAt(x))) {
      if (dy < 1 || Math.abs(dz) > 2) continue;
      put(x, cy + dy, cz + dz, p.glass);
    }
  }

  // --- the high wing --------------------------------------------------------
  const wingY = cy + 4;
  const leadAt = (s: number): number => 15 + Math.round(s * 0.25);
  const chordAt = (s: number): number => Math.max(4, 10 - Math.round(s * 0.4));
  for (let s = 0; s <= 14; s++) {
    for (const sign of [-1, 1]) {
      const z = cz + sign * s;
      for (let x = leadAt(s); x < leadAt(s) + chordAt(s); x++) put(x, wingY, z, p.skin);
      if (s === 0) break;
    }
  }
  // Four turboprops: nacelle under the wing, blades in front of it as bars.
  for (const sign of [-1, 1]) {
    for (const s of [5, 9]) {
      const z = cz + sign * s;
      const lead = leadAt(s);
      for (let x = lead - 4; x <= lead + 1; x++) put(x, wingY - 1, z, x === lead - 4 ? p.dark : p.metal);
      for (let y = wingY - 3; y <= wingY + 1; y++) put(lead - 5, y, z, "iron_bars");
    }
  }

  // --- gear, in sponsons ----------------------------------------------------
  for (const sign of [-1, 1]) {
    const z = cz + sign * 4;
    for (let x = 18; x <= 23; x++) put(x, cy - 3, z, p.skinDark);
    for (const x of [19, 22]) {
      put(x, 0, z, p.dark);
      for (let y = 1; y <= cy - 4; y++) put(x, y, z, p.metal);
    }
  }
  put(5, 0, cz, p.dark);
  for (let y = 1; y <= cy - 4; y++) put(5, y, cz, p.metal);

  // --- the ramp -------------------------------------------------------------
  // The hold floor at y = cy − 3 walked down to the apron over four stations,
  // five cells wide: the freighter's reason for existing.
  for (let i = 0; i <= cy - 3; i++) {
    const x = 35 + i;
    const y = cy - 3 - i;
    for (let dz = -2; dz <= 2; dz++) {
      put(x, y, cz + dz, p.skinDark);
      // The riser: without it the ramp is a run of treads meeting only at
      // their diagonals, which is a staircase nothing is attached to.
      if (i > 0) put(x, y + 1, cz + dz, p.skinDark);
    }
  }

  // --- the tail -------------------------------------------------------------
  for (let y = cy + 4; y <= 20; y++) {
    const lead = Math.min(31 + (y - cy - 4), 37);
    for (let x = lead; x <= 38; x++) put(x, y, cz, y >= 18 ? p.livery : p.skin);
  }
  for (let s = 1; s <= 6; s++) {
    for (const sign of [-1, 1]) {
      for (let x = 33 + Math.round(s * 0.5); x <= 38; x++) put(x, 20, cz + sign * s, p.skin);
    }
  }
  return done("cargo_plane");
};

/* -------------------------------------------------------------------------- */
/* the small aeroplanes                                                        */
/* -------------------------------------------------------------------------- */

/** `biplane` — 14 × 15, two wings, four struts and a tailskid. */
const biplane: PropGenerator = (ctx) => {
  const { put, palette } = ctx;
  const p = craftPalette(ctx, "biplane");
  const cz = 7;
  const cy = 3;

  // Fuselage: a radius-1 tube with an open cockpit cut into its back.
  for (let x = 1; x <= 11; x++) {
    for (const { dy, dz } of octaDisc(1)) {
      if (x === 8 && dy === 1 && dz === 0) continue; // the cockpit
      put(x, cy + dy, cz + dz, dy === 1 ? p.livery : p.skin);
    }
  }
  put(1, cy, cz, p.dark); // the cowling
  for (let y = cy - 2; y <= cy + 2; y++) put(0, y, cz, "iron_bars"); // the propeller
  put(0, cy, cz, p.metal); // the spinner

  // Two wings, one below the fuselage and one over it, plus the struts and the
  // flying wires that make a biplane a biplane rather than two monoplanes.
  for (const [wingY, chordX] of [
    [cy - 1, 4],
    [cy + 2, 4],
  ] as const) {
    for (let s = 0; s <= 7; s++) {
      for (const sign of [-1, 1]) {
        for (let x = chordX; x <= chordX + 2; x++) put(x, wingY, cz + sign * s, p.skin);
        if (s === 0) break;
      }
    }
  }
  for (const sign of [-1, 1]) {
    for (const s of [3, 6]) {
      for (let y = cy; y <= cy + 1; y++) put(5, y, cz + sign * s, palette.fence);
    }
  }

  // Tail: fin, tailplane and the skid under them.
  for (let x = 11; x <= 13; x++) put(x, cy, cz, p.skin);
  for (let y = cy + 1; y <= cy + 4; y++) put(13, y, cz, p.livery);
  for (let s = 1; s <= 3; s++) {
    for (const sign of [-1, 1]) put(13, cy + 1, cz + sign * s, p.skin);
  }
  put(12, 0, cz, p.dark);
  for (let y = 1; y < cy; y++) put(12, y, cz, palette.fence);

  // Main gear: a wheel on the apron under each lower wingtip-side strut.
  for (const sign of [-1, 1]) {
    const z = cz + sign * 2;
    put(5, 0, z, p.dark);
    put(5, 1, z, p.metal);
  }
  return done("biplane");
};

/** `light_plane` — 12 × 13, one engine, high wing, fixed gear. */
const lightPlane: PropGenerator = (ctx) => {
  const { put } = ctx;
  const p = craftPalette(ctx, "light");
  const cz = 6;
  const cy = 3;

  for (let x = 1; x <= 9; x++) {
    for (const { dy, dz } of octaDisc(1)) {
      put(x, cy + dy, cz + dz, dy === -1 ? p.livery : p.skin);
    }
  }
  for (let x = 3; x <= 5; x++) put(x, cy + 1, cz, p.glass); // the greenhouse
  put(1, cy, cz, p.dark);
  put(0, cy, cz, p.metal);
  for (let y = cy - 2; y <= cy + 2; y++) put(0, y, cz, "iron_bars");

  // The wing sits on the cabin roof; the lift struts come back down to the
  // belly, which is what a high-wing light aircraft actually looks like.
  const wingY = cy + 2;
  for (let s = 0; s <= 6; s++) {
    for (const sign of [-1, 1]) {
      for (let x = 3; x <= 5; x++) put(x, wingY, cz + sign * s, p.skin);
      if (s === 0) break;
    }
  }
  for (const sign of [-1, 1]) {
    for (let y = cy; y <= wingY - 1; y++) put(4, y, cz + sign * 3, "iron_bars");
  }

  // Tail and gear.
  for (let x = 9; x <= 11; x++) put(x, cy, cz, p.skin);
  for (let y = cy + 1; y <= cy + 3; y++) put(11, y, cz, p.livery);
  for (let s = 1; s <= 3; s++) {
    for (const sign of [-1, 1]) put(11, cy + 1, cz + sign * s, p.skin);
  }
  // The gear crossmember under the cabin, with a wheel at each end.
  for (let dz = -2; dz <= 2; dz++) put(4, cy - 2, cz + dz, p.metal);
  for (const sign of [-1, 1]) {
    put(4, 0, cz + sign * 2, p.dark);
    put(4, 1, cz + sign * 2, p.metal);
  }
  put(9, 0, cz, p.dark);
  put(9, 1, cz, p.metal);
  return done("light_plane");
};

/* -------------------------------------------------------------------------- */
/* lighter than air                                                            */
/* -------------------------------------------------------------------------- */

/**
 * `airship` — a 41-block ellipsoid envelope over a gondola.
 *
 * The envelope is {@link ellipseRadius} swept along the hull: at each station
 * the section is a ring of that radius, so the whole shape is defined by two
 * numbers and no trigonometry. Inside it, every eighth station carries a full
 * disc of rigging — the frame the fabric is stretched over, visible through the
 * nose and tail where the sections are small.
 *
 * The envelope's fabric colour is drawn from the same wool list a sail is: an
 * airship is a big canvas object, and the harbour's argument applies.
 */
const airship: PropGenerator = (ctx) => {
  const { put, palette } = ctx;
  const cz = 6;
  const cy = 10;
  const half = 20;
  const rMax = 6;
  const fabric = SAIL_WOOLS[ctx.rng("airship.fabric").int(0, SAIL_WOOLS.length - 1)] as string;

  for (let x = 0; x <= 40; x++) {
    const r = ellipseRadius(x - half, half, rMax);
    if (r < 0) continue;
    const big = Math.max(
      ellipseRadius(x - 1 - half, half, rMax),
      ellipseRadius(x + 1 - half, half, rMax),
    );
    for (const { dy, dz } of bulkheadCells(r, big)) put(x, cy + dy, cz + dz, fabric);
    for (const { dy, dz } of ringCells(r)) put(x, cy + dy, cz + dz, fabric);
    // A rigging frame every eighth station: the ring the fabric is stretched
    // over, in the same timber the gondola is built from.
    if (x % 8 === 0 && r >= 2) {
      for (const { dy, dz } of ringCells(r)) put(x, cy + dy, cz + dz, palette.stripped, { axis: "x" });
    }
  }
  // The keel: a spine along the bottom of the envelope, which is what the car
  // is actually hung from.
  for (let x = 8; x <= 32; x++) {
    const r = ellipseRadius(x - half, half, rMax);
    if (r >= 1) put(x, cy - r, cz, palette.log, { axis: "x" });
  }

  // --- the gondola ----------------------------------------------------------
  for (let x = 15; x <= 25; x++) {
    for (let z = cz - 2; z <= cz + 2; z++) {
      put(x, 1, z, palette.planks);
      put(x, 3, z, palette.planks);
    }
    for (const z of [cz - 2, cz + 2]) {
      put(x, 2, z, x % 3 === 0 ? "glass_pane" : palette.planks);
    }
  }
  for (const z of [cz - 2, cz + 2]) {
    for (const x of [15, 25]) put(x, 2, z, palette.log, { axis: "y" });
  }
  for (let x = 16; x <= 24; x++) put(x, 4, cz, palette.log, { axis: "x" }); // the mast to the keel
  // Four legs to the ground, so a moored airship rests rather than hovers.
  for (const x of [16, 24]) {
    for (const z of [cz - 2, cz + 2]) put(x, 0, z, palette.log, { axis: "y" });
  }
  // The car's engine cars, one a side.
  for (const z of [cz - 3, cz + 3]) {
    for (let x = 19; x <= 21; x++) put(x, 2, z, "gray_concrete");
    put(18, 2, z, "iron_bars");
  }

  // --- the empennage --------------------------------------------------------
  // Four fins in a cross at the tail, each growing out of the envelope until it
  // reaches the full half-width: the surfaces are what tell a viewer which end
  // of a symmetrical shape is the back.
  for (let x = 33; x <= 38; x++) {
    const r = ellipseRadius(x - half, half, rMax);
    if (r < 0) continue;
    const reach = Math.min(6, r + 2 + (x - 33));
    for (let s = r + 1; s <= reach; s++) {
      for (const sign of [-1, 1]) {
        put(x, cy, cz + sign * s, fabric);
        put(x, cy + sign * s, cz, fabric);
      }
    }
  }
  return done("airship");
};

/**
 * `zeppelin_mast` — the thing an airship is tied to.
 *
 * A separate prop deliberately: a mast is a piece of *ground* infrastructure
 * that stands whether or not there is an airship on the field today, and a
 * document that wants both places both.
 */
const zeppelinMast: PropGenerator = (ctx) => {
  const { put, palette } = ctx;
  const c = 3;
  for (let x = 0; x <= 6; x++) {
    for (let z = 0; z <= 6; z++) put(x, 0, z, palette.stone);
  }
  // Four legs with a braced lattice between them, carrying a gallery at y = 9.
  for (let y = 1; y <= 8; y++) {
    for (const x of [1, 5]) {
      for (const z of [1, 5]) put(x, y, z, palette.log, { axis: "y" });
    }
    if (y % 3 === 0) {
      // The bracing rings are timber rather than fence: a fence four cells from
      // the nearest leg is a support chain that reaches nothing, which is a
      // lint finding with a real defect under it.
      for (let i = 1; i <= 5; i++) {
        for (const edge of [1, 5]) {
          put(i, y, edge, palette.stripped, { axis: "z" });
          put(edge, y, i, palette.stripped, { axis: "x" });
        }
      }
    }
  }
  for (let x = 1; x <= 5; x++) {
    for (let z = 1; z <= 5; z++) put(x, 9, z, palette.stone);
  }
  // The shaft, and the handrail round the gallery it rises out of.
  for (let y = 10; y <= 17; y++) put(c, y, c, palette.log, { axis: "y" });
  for (let i = 1; i <= 5; i++) {
    for (const edge of [1, 5]) {
      put(i, 10, edge, palette.fence);
      put(edge, 10, i, palette.fence);
    }
  }
  for (const [dx, dz] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const) {
    for (let y = 11; y <= 13; y++) put(c + dx, y, c + dz, "iron_bars");
  }
  // The cone the nose cup latches into, and the light on top of it.
  put(c, 18, c, "iron_block");
  put(c, 19, c, palette.lantern, { hanging: "false" });
  return done("zeppelin_mast");
};

/* -------------------------------------------------------------------------- */
/* the field                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * `hangar` — a barrel vault with the whole of one end open.
 *
 * The vault is {@link ellipseRadius} again, read the other way up: the roof
 * height over each column is the ellipse's radius, and successive columns are
 * joined vertically so a step in the integer profile is a wall rather than a
 * hole. The `z = 0` face carries the arch rib and nothing else — that is what
 * "open front" means, and it is why the prop touches its declared box on the
 * side you can walk in through.
 */
const hangar: PropGenerator = (ctx) => {
  const { put, palette } = ctx;
  const cx = 12;
  const depth = 19;
  const roofAt = (x: number): number => 4 + Math.max(0, ellipseRadius(x - cx, 12, 9));

  for (let z = 0; z < depth; z++) {
    const rib = z === 0 || z === depth - 1 || z % 6 === 0;
    let previous = -1;
    for (let x = 0; x <= 24; x++) {
      const top = roofAt(x);
      if (top < 4) continue;
      // The vault surface, plus the vertical face that a step in the profile
      // leaves: without it the roof is a staircase with gaps in the risers.
      const from = previous < 0 ? top : Math.min(previous + 1, top);
      if (rib) {
        for (let y = from; y <= top; y++) put(x, y, z, palette.stoneAccent);
      } else {
        for (let y = Math.max(from, top); y <= top; y++) put(x, y, z, palette.roofSlab, { type: "top" });
      }
      previous = top;
      // The side walls, down to the floor.
      if (x === 0 || x === 24) {
        for (let y = 0; y < top; y++) put(x, y, z, palette.stone);
      }
    }
    if (z === depth - 1) {
      for (let x = 1; x <= 23; x++) {
        for (let y = 0; y < roofAt(x); y++) put(x, y, z, x % 6 === 3 && y >= 2 && y <= 4 ? "glass_pane" : palette.stone);
      }
    }
  }
  // The apron the doors run on, and the two lamps over them.
  for (let x = 0; x <= 24; x++) put(x, 0, 0, palette.stoneAccent);
  for (const x of [2, 22]) put(x, roofAt(x) - 1, 0, palette.lantern, { hanging: "true" });
  return done("hangar");
};

/**
 * `runway` — one repeatable strip of airfield.
 *
 * Deliberately a *segment*: `length` covers a dozen to sixty-four blocks and a
 * document that wants a longer field places several in a line, exactly as it
 * does with `rail_line`. Both thresholds are marked, so two segments end to end
 * read as two segments — which is honest, and cheaper than a grammar that
 * would have to know where the runway ends.
 */
const runway: PropGenerator = ({ put, palette, params }) => {
  const length = intParam(params, "length", RUNWAY_LENGTH.fallback, RUNWAY_LENGTH.lo, RUNWAY_LENGTH.hi);
  const width = RUNWAY_WIDTH;
  for (let x = 0; x < length; x++) {
    const threshold = x < 3 || x >= length - 3;
    for (let z = 0; z < width; z++) {
      const edge = z === 0 || z === width - 1;
      const centre = z === (width - 1) / 2;
      const marked = threshold ? z % 2 === 1 : centre && x % 4 < 2;
      put(x, 0, z, edge ? "light_gray_concrete" : marked ? "white_concrete" : "gray_concrete");
    }
    // Edge lights every eighth bay, standing on the strip they light.
    if (x % 8 === 4) {
      for (const z of [0, width - 1]) put(x, 1, z, palette.lantern, { hanging: "false" });
    }
  }
  return done("runway", params);
};

/* -------------------------------------------------------------------------- */
/* registry                                                                    */
/* -------------------------------------------------------------------------- */

/** Air prop name → generator, merged into `PROP_GENERATORS` by `props.ts`. */
export const AIRCRAFT_GENERATORS: Readonly<Record<string, PropGenerator>> = Object.freeze({
  airliner,
  cargo_plane: cargoPlane,
  biplane,
  light_plane: lightPlane,
  airship,
  zeppelin_mast: zeppelinMast,
  hangar,
  runway,
});
