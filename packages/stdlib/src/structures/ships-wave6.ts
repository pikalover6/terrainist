/**
 * `prop.place@0` — the second fleet: five hulls the first one had no idiom for.
 *
 * Everything here is built on `ships.ts`'s contract, and it is worth restating
 * because it is the only thing standing between a fleet and a flooded world: a
 * floating prop's `y = 0` is the **water surface**, a hull writes solid at
 * `y = 0` and at `y = -1` and never writes air or water, so it *displaces*
 * water rather than trapping a pocket under it. `y = -1` is the deepest course
 * any hull may write, because the placer only guarantees two blocks of water.
 *
 * The five add what the first fleet could not draw:
 *
 * - a **battened** sail (the junk) — a wool panel with a trapdoor batten every
 *   other course, which is the difference between Chinese canvas and European;
 * - a hull one cell wide (the gondola), which is the narrowest thing
 *   {@link hullHalfAt} will draw and still floats by the same argument;
 * - a **housing with a wheel in it** (the paddle steamer), the stagecoach's
 *   trapdoor disc turned on its side and boxed;
 * - a **container stack** (the container ship), which is the first cargo in the
 *   catalog that is drawn as coloured geometry rather than as barrels.
 *
 * Rigging is `iron_bars`: there is no `chain` in the pinned 1.21.11 table.
 * Names and flags are banners: a sign is a block entity.
 */

import type { PropGenerator, PropMeta, PropResult } from "./props.js";
import { buildHull, clothOf, hullHalfAt, hullTimber, mast, type HullSpec } from "./ships.js";

/* -------------------------------------------------------------------------- */
/* catalog                                                                     */
/* -------------------------------------------------------------------------- */

/** Every hull this file builds, in catalog order. */
export const SHIP6_PROP_NAMES = [
  "junk",
  "gondola",
  "barge",
  "paddle_steamer",
  "container_ship",
] as const;

/** One of the hulls this file builds. */
export type Ship6PropName = (typeof SHIP6_PROP_NAMES)[number];

/** The declared box of every hull here, keyed by name. */
export const SHIP6_FOOTPRINTS: Readonly<
  Record<
    string,
    () => {
      readonly size: readonly [number, number, number];
      readonly minY: number;
      readonly base: "water";
    }
  >
> = {
  junk: () => ({ size: [26, 21, 9], minY: -1, base: "water" }),
  gondola: () => ({ size: [15, 7, 3], minY: -1, base: "water" }),
  barge: () => ({ size: [24, 8, 9], minY: -1, base: "water" }),
  paddle_steamer: () => ({ size: [28, 14, 11], minY: -1, base: "water" }),
  container_ship: () => ({ size: [46, 18, 13], minY: -1, base: "water" }),
};

function metaOf(prop: string): PropMeta {
  const foot = (SHIP6_FOOTPRINTS[prop] as () => {
    size: readonly [number, number, number];
    minY: number;
    base: "water";
  })();
  return {
    prop: prop as PropMeta["prop"],
    size: foot.size,
    minY: foot.minY,
    base: foot.base,
    piles: [],
  };
}

function done(prop: string): PropResult {
  return { ops: [], meta: metaOf(prop) };
}

/* -------------------------------------------------------------------------- */
/* the junk                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * `junk` — 26 × 9, batten sails and a stepped stern.
 *
 * Three things make a junk a junk and all three are here: the **transom** bow
 * and stern (no stem post at all — the ends are cut off square, which is why
 * the hull spec's tapers are short), the **stepped poop** rising in two stages
 * over the after third, and the **battened lugsail** — canvas stiffened by a
 * batten every other course, drawn as trapdoors laid into the wool panel.
 */
const junk: PropGenerator = (ctx) => {
  const { put, palette } = ctx;
  const spec: HullSpec = { length: 26, half: 4, bow: 4, stern: 3 };
  const cz = 4;
  const timber = hullTimber(ctx, "junk");
  const cloth = clothOf(ctx, "junk");
  buildHull(ctx, spec, {
    centreZ: cz,
    hull: timber.hull,
    deck: timber.deck,
    bulwark: timber.hull,
  });

  // The wale: a second course on the topsides, and a rubbing strake of stairs
  // over it, which is what gives a junk its heavy slab-sided look.
  for (let x = 0; x < spec.length; x++) {
    const h = hullHalfAt(spec, x);
    for (const sign of [-1, 1]) {
      const z = cz + sign * h;
      put(x, 2, z, palette.stairs, {
        facing: sign < 0 ? "north" : "south",
        half: "bottom",
        shape: "straight",
      });
    }
  }

  /** One stage of the poop: a deck at `y` over `from..to`, railed. */
  const stage = (from: number, to: number, y: number): void => {
    for (let x = from; x <= to; x++) {
      const h = hullHalfAt(spec, x);
      for (let dz = -h; dz <= h; dz++) {
        put(x, y, cz + dz, timber.deck);
        if (Math.abs(dz) === h || x === from || x === to) put(x, y + 1, cz + dz, palette.fence);
      }
      for (const sign of [-1, 1]) {
        for (let below = 3; below < y; below++) put(x, below, cz + sign * h, timber.hull, { axis: "y" });
      }
    }
  };
  stage(17, 25, 3);
  stage(21, 25, 5);

  /** A battened lugsail: the wool panel, with a batten every other course. */
  const lugsail = (mastX: number, top: number, spread: number, from: number): void => {
    mast(ctx, mastX, cz, 1, top);
    for (let y = from; y <= top - 1; y++) {
      const batten = (y - from) % 2 === 1;
      for (let dz = -spread; dz <= spread; dz++) {
        if (dz === 0) continue;
        if (batten) {
          put(mastX, y, cz + dz, palette.trapdoor, {
            facing: dz < 0 ? "north" : "south",
            half: "bottom",
            open: "true",
          });
        } else {
          put(mastX, y, cz + dz, cloth);
        }
      }
    }
    // The yard at the head, which is also what holds the top course on.
    for (let dz = -spread; dz <= spread; dz++) put(mastX, top, cz + dz, palette.log, { axis: "z" });
    put(mastX, top + 1, cz, palette.lantern, { hanging: "false" });
  };
  lugsail(8, 18, 4, 4);
  lugsail(15, 14, 3, 4);
  // The mizzen, stepped on the lower poop rather than on the main deck.
  mast(ctx, 20, cz, 4, 11);
  for (let y = 7; y <= 10; y++) {
    for (const dz of [-2, -1, 1, 2]) put(20, y, cz + dz, (y - 7) % 2 === 1 ? palette.trapdoor : cloth, (y - 7) % 2 === 1 ? { facing: dz < 0 ? "north" : "south", half: "bottom", open: "true" } : {});
  }
  for (let dz = -2; dz <= 2; dz++) put(20, 11, cz + dz, palette.log, { axis: "z" });

  // A pair of eyes at the bow — a junk's one piece of ornament — and the
  // sculling oar over the transom.
  for (const sign of [-1, 1]) put(0, 2, cz + sign * 2, "white_concrete");
  return done("junk");
};

/* -------------------------------------------------------------------------- */
/* the gondola                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * `gondola` — 15 × 3, the narrowest hull in the catalog.
 *
 * One column of beam the whole way: {@link hullHalfAt} clamps to one, so the
 * three-wide box is deck, and both sheer strakes. Everything else is the two
 * gestures a Venetian gondola is recognised by — the black hull, and the
 * *ferro*, the stepped steel comb at the stem, drawn here as four courses of
 * iron rising out of the bow with a stair as its crest.
 */
const gondola: PropGenerator = (ctx) => {
  const { put, palette } = ctx;
  const spec: HullSpec = { length: 15, half: 1, bow: 3, stern: 3 };
  const cz = 1;
  buildHull(ctx, spec, { centreZ: cz, hull: "black_concrete", deck: "black_concrete" });

  // The sheer, and the little upholstered seat amidships.
  for (let x = 1; x <= 13; x++) {
    for (const dz of [-1, 1]) put(x, 1, cz + dz, "black_concrete");
  }
  put(7, 1, cz, palette.stairs, { facing: "east", half: "bottom", shape: "straight" });
  put(6, 1, cz, "red_concrete");

  // The ferro: a comb of iron at the stem, stepping up out of the bow.
  for (let y = 1; y <= 4; y++) put(0, y, cz, "iron_block");
  put(1, 4, cz, palette.stairs, { facing: "east", half: "bottom", shape: "straight" });
  for (const y of [2, 3]) put(1, y, cz, "iron_bars");
  // The stern rises too, and carries the single oar post the rower stands at.
  for (let y = 1; y <= 3; y++) put(14, y, cz, "black_concrete");
  put(12, 2, cz + 1, palette.fence);
  put(11, 2, cz + 1, palette.stripped, { axis: "x" });
  return done("gondola");
};

/* -------------------------------------------------------------------------- */
/* the barge                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * `barge` — 24 × 9, a flat box with a hut on the back of it.
 *
 * The one hull in either fleet with no shape at all: a barge is a rectangle
 * that floats, and the tapers exist only so the ends read as ends. What makes
 * it a *vessel* rather than a raft is the aft accommodation — the tiller hut,
 * with the sweep behind it — and the fact that the hold is drawn open, in rows,
 * so a viewer can see it is carrying something.
 */
const barge: PropGenerator = (ctx) => {
  const { put, palette } = ctx;
  const spec: HullSpec = { length: 24, half: 4, bow: 3, stern: 3 };
  const cz = 4;
  const timber = hullTimber(ctx, "barge");
  const paint = ctx.rng("barge.paint").float() < 0.5 ? "green_concrete" : "blue_concrete";
  buildHull(ctx, spec, { centreZ: cz, hull: timber.hull, deck: timber.deck, bulwark: paint });

  // Gunwale coping over the bulwark, all round.
  for (let x = 0; x < spec.length; x++) {
    const h = hullHalfAt(spec, x);
    for (const sign of [-1, 1]) {
      put(x, 2, cz + sign * h, palette.slab, { type: "bottom" });
    }
  }
  // Hold rows: cargo in fixed cells, contents from the barge's own seed.
  const rng = ctx.rng("barge.load");
  for (let x = 3; x <= 16; x += 2) {
    for (const dz of [-2, 0, 2]) {
      const box = rng.float() < 0.5;
      put(x, 1, cz + dz, box ? palette.cargo : palette.hay, box ? { facing: "up" } : { axis: "y" });
    }
  }

  // --- the tiller hut -------------------------------------------------------
  for (let x = 18; x <= 21; x++) {
    for (let dz = -2; dz <= 2; dz++) {
      const wall = Math.abs(dz) === 2 || x === 18 || x === 21;
      if (wall) {
        for (let y = 1; y <= 3; y++) {
          put(x, y, cz + dz, y === 2 && x > 18 && x < 21 ? "glass_pane" : palette.planks);
        }
      }
      put(x, 4, cz + dz, palette.roofSlab, { type: "bottom" });
    }
  }
  // The sweep: a tiller bar over the transom, standing on the after deck.
  put(22, 1, cz, palette.stripped, { axis: "y" });
  put(22, 2, cz, palette.stripped, { axis: "x" });
  put(23, 2, cz, palette.stripped, { axis: "x" });
  // A banner name-board on the hut's front wall — a sign is a block entity and
  // this is not.
  put(17, 3, cz, "white_banner", { rotation: "12" });
  put(17, 2, cz, palette.planks);
  put(17, 1, cz, palette.planks);
  put(19, 5, cz, palette.lantern, { hanging: "false" });
  put(19, 4, cz, palette.planks);
  return done("barge");
};

/* -------------------------------------------------------------------------- */
/* the paddle steamer                                                          */
/* -------------------------------------------------------------------------- */

/**
 * `paddle_steamer` — 28 × 11, wheels in boxes and two stacks.
 *
 * The paddle box is the shape nothing else in the catalog has: a housing
 * standing on the sheer amidships with the wheel showing through its outer
 * face, drawn as trapdoor discs in two courses. The twin stacks abaft it are
 * what tell the eye the wheels are driven rather than decorative, and the
 * promenade rail round the upper deck is what gives the whole thing its scale.
 */
const paddleSteamer: PropGenerator = (ctx) => {
  const { put, palette } = ctx;
  const spec: HullSpec = { length: 28, half: 5, bow: 5, stern: 4 };
  const cz = 5;
  buildHull(ctx, spec, { centreZ: cz, hull: "black_concrete", deck: "white_concrete", bulwark: "white_concrete" });

  // --- the paddle boxes -----------------------------------------------------
  for (const sign of [-1, 1]) {
    const z = cz + sign * hullHalfAt(spec, 13);
    for (let x = 11; x <= 16; x++) {
      for (let y = 1; y <= 4; y++) {
        const crown = y === 4 || x === 11 || x === 16;
        put(x, y, z, crown ? "white_concrete" : palette.trapdoor, {
          ...(crown ? {} : { facing: sign < 0 ? "north" : "south", half: y === 2 ? "bottom" : "top", open: "false" }),
        });
      }
    }
    // The wheel's own shaft, inboard of the housing, so the box has something
    // in it rather than being a blank panel.
    for (let x = 12; x <= 15; x++) put(x, 2, z - sign, "gray_concrete");
  }

  // --- the deckhouse and the promenade --------------------------------------
  for (let x = 5; x <= 22; x++) {
    for (let dz = -3; dz <= 3; dz++) {
      const wall = Math.abs(dz) === 3 || x === 5 || x === 22;
      if (wall) {
        for (let y = 1; y <= 3; y++) {
          put(x, y, cz + dz, y === 2 && x % 2 === 1 ? "glass_pane" : "white_concrete");
        }
      }
      put(x, 4, cz + dz, "white_concrete");
    }
  }
  for (let x = 5; x <= 22; x += 3) {
    for (const dz of [-3, 3]) put(x, 5, cz + dz, palette.fence);
  }
  // --- the texas and the wheelhouse -----------------------------------------
  for (let x = 8; x <= 13; x++) {
    for (let dz = -2; dz <= 2; dz++) {
      const wall = Math.abs(dz) === 2 || x === 8 || x === 13;
      if (wall) {
        for (let y = 5; y <= 7; y++) put(x, y, cz + dz, y === 6 ? "glass_pane" : "white_concrete");
      }
      put(x, 8, cz + dz, "white_concrete");
    }
  }
  // --- the stacks -----------------------------------------------------------
  for (const dz of [-2, 2]) {
    for (let y = 5; y <= 11; y++) put(17, y, cz + dz, "black_concrete");
    put(17, 12, cz + dz, "iron_bars");
  }
  for (let dz = -2; dz <= 2; dz++) put(17, 5, cz + dz, "black_concrete");
  put(10, 9, cz, palette.lantern, { hanging: "false" });
  put(2, 1, cz, palette.fence); // the jackstaff on the fore deck
  return done("paddle_steamer");
};

/* -------------------------------------------------------------------------- */
/* the container ship                                                          */
/* -------------------------------------------------------------------------- */

/**
 * `container_ship` — 46 × 13, the modern giant, at the galleon's extents.
 *
 * Deliberately no larger than the galleon: 46 × 13 is what the exhibit
 * harbour and the placer's pond search were sized against, and a hull that
 * needed a wider basin than the fleet's largest would be a prop that silently
 * never places.
 *
 * The stack pattern is a *function of position* and only the colours come from
 * the seed — a ship whose block count moved with its seed would have a
 * footprint that is only true on average. The bulbous bow is two courses of
 * stem below the flare, which is as much of a bulb as a lattice this coarse
 * will carry.
 */
const containerShip: PropGenerator = (ctx) => {
  const { put } = ctx;
  const spec: HullSpec = { length: 46, half: 6, bow: 9, stern: 5 };
  const cz = 6;
  const boot = ctx.rng("container.boot").float() < 0.5 ? "red_concrete" : "orange_concrete";
  buildHull(ctx, spec, { centreZ: cz, hull: boot, deck: "gray_concrete" });

  // --- the topsides ---------------------------------------------------------
  for (let x = 0; x < spec.length; x++) {
    const h = hullHalfAt(spec, x);
    for (const sign of [-1, 1]) {
      const z = cz + sign * h;
      for (let y = 1; y <= 3; y++) put(x, y, z, y === 1 ? boot : "black_concrete");
    }
    // Both ends closed, or the deck is an open-ended trough.
    if (x === 0 || x === spec.length - 1) {
      for (let dz = -h; dz <= h; dz++) {
        for (let y = 1; y <= 3; y++) put(x, y, cz + dz, y === 1 ? boot : "black_concrete");
      }
    }
  }
  // The bulb: the stem carried forward under the flare, in the boot colour.
  for (const y of [-1, 0]) {
    for (const dz of [-1, 0, 1]) put(0, y, cz + dz, boot);
  }

  // --- the hatch covers and the containers ----------------------------------
  const stackColours: readonly string[] = [
    "red_concrete",
    "blue_concrete",
    "lime_concrete",
    "yellow_concrete",
    "light_blue_concrete",
    "orange_concrete",
    "white_concrete",
  ];
  const rng = ctx.rng("container.paint");
  // The hold coaming: the side of the hold, from the deck up to the hatch
  // plane, the whole length of the cargo block and the castle. Without it the
  // hatch covers and everything stacked on them are a slab of blocks with the
  // open hold between them and the ship.
  for (let x = 5; x <= 42; x++) {
    for (const dz of [-4, 4]) {
      for (let y = 1; y <= 3; y++) put(x, y, cz + dz, y === 3 ? "iron_block" : "gray_concrete");
    }
  }
  // Transverse bulkheads, one every fourth bay, which is also what the hatch
  // covers land on.
  for (let x = 6; x <= 33; x += 4) {
    for (let dz = -3; dz <= 3; dz++) {
      for (let y = 1; y <= 3; y++) put(x, y, cz + dz, "gray_concrete");
    }
  }
  for (let x = 6; x <= 33; x++) {
    for (let dz = -4; dz <= 4; dz++) put(x, 4, cz + dz, "light_gray_concrete");
  }
  for (let x = 6; x <= 33; x++) {
    // Bay heights that fall away toward the bow: the sheer of a loaded box
    // boat, and a pattern with no seed in it.
    const bay = Math.floor((x - 6) / 4);
    const height = x < 10 ? 2 : bay % 3 === 0 ? 5 : bay % 3 === 1 ? 4 : 3;
    for (let dz = -4; dz <= 4; dz++) {
      const colour = stackColours[
        rng.int(0, stackColours.length - 1)
      ] as string;
      for (let y = 5; y < 5 + height; y++) put(x, y, cz + dz, colour);
    }
  }

  // --- the bridge castle, aft -----------------------------------------------
  for (let x = 35; x <= 41; x++) {
    for (let dz = -4; dz <= 4; dz++) {
      const wall = Math.abs(dz) === 4 || x === 35 || x === 41;
      if (wall) {
        for (let y = 4; y <= 11; y++) {
          put(x, y, cz + dz, y % 3 === 0 ? "glass_pane" : "white_concrete");
        }
      }
      put(x, 12, cz + dz, "white_concrete");
      if (!wall) put(x, 4, cz + dz, "white_concrete");
    }
  }
  // The bridge wings, out to the ship's side, and the funnel behind them.
  for (const sign of [-1, 1]) {
    for (let dz = 5; dz <= 6; dz++) {
      put(37, 11, cz + sign * dz, "white_concrete");
      put(37, 12, cz + sign * dz, "iron_bars");
    }
  }
  for (let x = 38; x <= 40; x++) {
    for (let dz = -2; dz <= 2; dz++) put(x, 13, cz + dz, "black_concrete");
  }
  for (let dz = -1; dz <= 1; dz++) put(39, 14, cz + dz, "gray_concrete");
  for (let dz = -2; dz <= 2; dz += 2) put(38, 14, cz + dz, "iron_bars");
  // The house flag, on the after end of the bridge roof.
  put(41, 13, cz, "red_banner", { rotation: "8" });
  return done("container_ship");
};

/* -------------------------------------------------------------------------- */
/* registry                                                                    */
/* -------------------------------------------------------------------------- */

/** Hull name → generator, merged into `PROP_GENERATORS` by `props.ts`. */
export const SHIP6_GENERATORS: Readonly<Record<string, PropGenerator>> = Object.freeze({
  junk,
  gondola,
  barge,
  paddle_steamer: paddleSteamer,
  container_ship: containerShip,
});
