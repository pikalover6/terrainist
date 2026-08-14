/**
 * `prop.place@0` — the **wilds & camps pack's ground pieces**: the six entries
 * of `docs/CATALOG-EXPANSION-v0.md` §3.6 that are things you walk past in a
 * cut-over rather than rooms you walk into.
 *
 * The pack's thesis is battery P6's: extraction in the wilderness — logging,
 * trapping, placer work — is a whole settlement idiom, and the catalog answers
 * it with a tent. This file is the idiom's ground:
 *
 * - `logging_camp` — the compound on `campsite`'s precedent: a bunk shanty, a
 *   cook shack, the saw trestle, the fire, and the ground churned between
 *   them. The pack's XL piece and the one that takes a `length`;
 * - `log_landing` — the deck at the road head, trunks cross-stacked between
 *   anchor posts with their ends squared to the track;
 * - `sawpit` — a trestle over an open pit with the saw standing in the kerf;
 * - `stump_field` — the cut-over itself: stumps at plausible spacing, slash
 *   piles, and one great stump too big to have been worth taking. Takes a
 *   `length` too, because a cut-over is as big as the cut was;
 * - `spar_pole` — the topped tree rigged as a yarding mast, on a `height`; the
 *   tallest thing in a cut-over and the piece the others are read against;
 * - `hunters_cache` — a box on four peeled poles above bear height.
 *
 * ## The contract, and why this file is a leaf
 *
 * Same shape as `props-brine.ts` and `props-response.ts`: this file imports
 * **types** from `props.ts` and no values at all, so the one edge
 * `props.ts` → here can never become a module-initialisation cycle. Node-local
 * coordinates, `y = 0` the base plane, block **names** with a property map,
 * every op inside the declared box so `rotateOps` needs no special case.
 *
 * ## The rules every prop here obeys
 *
 * 1. **Nothing floats.** The physics lint's `floating.*` family fires on a
 *    full cube with **six air faces**. Every prop here writes its whole
 *    footprint at `y = 0` — a cut-over *is* ground — and everything above it
 *    rests on that plane, on a column run down to it, or on a horizontal
 *    neighbour of its own. The cache's box and the spar's rigging are the two
 *    cases that matter: **a tall mast is a full-block column**, every course
 *    of it, all the way to the ground, and the cache's four legs are four such
 *    columns with the box sitting across them.
 * 2. **A walkable cell keeps its two courses of air.** The camp's lanes, the
 *    sawpit's pit floor and the deck's track end all leave `y = 1` *and*
 *    `y = 2` clear over solid non-water floor, because the lint walks a 1x2
 *    body and an icon you cannot walk beside is a wall.
 * 3. **No `mud`.** It is 15/16 of a block and a body cannot stand on it, so
 *    the camp's "ground churned to mud" is `coarse_dirt` and `podzol` with
 *    `gravel` through it — which is also what churned forest floor looks like.
 * 4. **Gravity blocks on floors only.** The sawpit's sawdust and the camp's
 *    gravel are written at `y = 0`, on the ground; nothing here drops sand
 *    into air.
 * 5. **No lanterns by name.** The lint's lantern rule fires on any name ending
 *    `lantern`, so the camp's fire is a `campfire` on its own hearth and its
 *    cook-shack glow is `glowstone` with a solid neighbour.
 * 6. **No `chain`** — not in the pinned 1.21.11 block table; every guy line,
 *    rigging strap and cross-haul is `iron_bars` through `palette.chain`.
 * 7. **No sign blocks**, because a sign is a block entity this op stream
 *    cannot carry.
 * 8. **Determinism.** The only randomness is the scuffing of the ground plane,
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
export const WILDS_PROP_NAMES = [
  "logging_camp",
  "log_landing",
  "sawpit",
  "stump_field",
  "spar_pole",
  "hunters_cache",
] as const;

/** One of the props this file builds. */
export type WildsPropName = (typeof WILDS_PROP_NAMES)[number];

/** True for a name this file answers to. */
export function isWildsProp(name: string): name is WildsPropName {
  return (WILDS_PROP_NAMES as readonly string[]).includes(name);
}

/* -------------------------------------------------------------------------- */
/* extents                                                                     */
/* -------------------------------------------------------------------------- */

/** Default run of the logging camp, along the haul road. */
export const CAMP_LENGTH = 17;
/** The shortest and longest camp a document may ask for. */
export const CAMP_MIN = 13;
/** See {@link CAMP_MIN}. */
export const CAMP_MAX = 27;
/** Depth of the camp: the shanty row, the churned lane, the cook shack row. */
export const CAMP_D = 13;
/** Height of the camp box: the ground, the shanty walls and their roofs. */
export const CAMP_H = 6;

/** Log landing: the deck along the track. */
export const DECK_W = 11;
/** Landing depth: the track edge, then the stacked deck behind it. */
export const DECK_D = 9;
/** Landing height: the ground and three courses of trunk. */
export const DECK_H = 5;

/** Sawpit pad, in x. */
export const SAWPIT_W = 7;
/** Sawpit pad, in z. */
export const SAWPIT_D = 5;
/** Sawpit height: the ground, the deck, the trestle and the saw over it. */
export const SAWPIT_H = 4;

/** Default run of the cut-over. */
export const STUMP_LENGTH = 21;
/** The shortest and longest cut-over a document may ask for. */
export const STUMP_MIN = 13;
/** See {@link STUMP_MIN}. */
export const STUMP_MAX = 31;
/** Depth of the cut-over. */
export const STUMP_D = 15;
/** Cut-over height: the ground, the stumps, the slash piles over them. */
export const STUMP_H = 4;

/** Spar pole pad, in x and z — the mast and the stumps it is guyed to. */
export const SPAR_SPAN = 7;
/** Default height of the spar, ground plane included. */
export const SPAR_H = 17;
/** The shortest and tallest spar a document may ask for. */
export const SPAR_MIN = 11;
/** See {@link SPAR_MIN}. */
export const SPAR_MAX = 25;

/** Cache pad, in x and z. */
export const CACHE_PAD = 5;
/** Cache height: the ground, the peeled legs, the box on top of them. */
export const CACHE_LIFT = 7;

/** Read the camp's `length` param the way the generator reads it. */
function campLength(params: Readonly<Record<string, unknown>>): number {
  return clampParam(params, "length", CAMP_LENGTH, CAMP_MIN, CAMP_MAX);
}

/** Read the cut-over's `length` param the way the generator reads it. */
function stumpLength(params: Readonly<Record<string, unknown>>): number {
  return clampParam(params, "length", STUMP_LENGTH, STUMP_MIN, STUMP_MAX);
}

/** Read the spar's `height` param the way the generator reads it. */
function sparHeight(params: Readonly<Record<string, unknown>>): number {
  return clampParam(params, "height", SPAR_H, SPAR_MIN, SPAR_MAX);
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
export function wildsPropFootprint(
  prop: WildsPropName,
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
    case "logging_camp":
      return ground([campLength(params), CAMP_H, CAMP_D]);
    case "log_landing":
      return ground([DECK_W, DECK_H, DECK_D]);
    case "sawpit":
      return ground([SAWPIT_W, SAWPIT_H, SAWPIT_D]);
    case "stump_field":
      return ground([stumpLength(params), STUMP_H, STUMP_D]);
    case "spar_pole":
      return ground([SPAR_SPAN, sparHeight(params), SPAR_SPAN]);
    case "hunters_cache":
    default:
      return ground([CACHE_PAD, CACHE_LIFT, CACHE_PAD]);
  }
}

/** Build a `PropMeta` from the declared footprint, so the two cannot drift. */
function metaOf(prop: WildsPropName, params: Readonly<Record<string, unknown>>): PropMeta {
  const foot = wildsPropFootprint(prop, params);
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

/** A bar run along x — the guy line and the cross-haul strap. */
const BARS_X: Record<string, string> = {
  east: "true",
  north: "false",
  south: "false",
  waterlogged: "false",
  west: "true",
};

/* -------------------------------------------------------------------------- */
/* the forest floor                                                            */
/* -------------------------------------------------------------------------- */

/**
 * The **working ground** of a camp — churned forest floor with the stones
 * showing through it.
 *
 * Deliberately *not* `mud`: mud is 15/16 of a block and a body cannot stand on
 * it, so a camp floored in it is a camp you can only look at. Coarse dirt,
 * podzol and gravel say the same thing and take a boot.
 */
function churned(x: number, z: number, scuff: number): string {
  const k = (x * 7 + z * 11 + scuff) % 9;
  if (k === 0) return "gravel";
  if (k === 1 || k === 2) return "podzol";
  return "coarse_dirt";
}

/** The **cut-over's** ground: needle litter, bare dirt and slash trodden in. */
function cutover(x: number, z: number, scuff: number): string {
  const k = (x * 5 + z * 13 + scuff) % 11;
  if (k === 0) return "coarse_dirt";
  if (k === 1) return "gravel";
  if (k === 2) return "rooted_dirt";
  return "podzol";
}

/** The **track** at the road head — a graded surface the trunks roll onto. */
function track(palette: PropPalette, x: number, z: number, scuff: number): string {
  const k = (x * 11 + z * 5 + scuff) % 7;
  if (k === 0) return palette.stone;
  if (k === 1) return "coarse_dirt";
  return "gravel";
}

/** Lay one surface over the whole declared box at `y = 0`. */
function surface(
  put: PropContextPut,
  w: number,
  d: number,
  block: (x: number, z: number) => string,
): void {
  for (let z = 0; z < d; z++) {
    for (let x = 0; x < w; x++) put(x, 0, z, block(x, z));
  }
}

/**
 * A **shanty** — the smallest roofed thing this file builds, and the shape the
 * camp is made of.
 *
 * Four walls of log with one cell of the front wall left out for the way in,
 * and a roof of planks laid straight across. Every roof cell touches the wall
 * below it or the roof cell beside it, so nothing in it has six air faces; the
 * doorway keeps `y = 1` and `y = 2` clear over the ground plane, so a body can
 * walk in. The interior is one course of clear floor for the same reason.
 */
function shanty(
  put: PropContextPut,
  palette: PropPalette,
  x0: number,
  z0: number,
  w: number,
  d: number,
  doorX: number,
): void {
  for (let z = z0; z < z0 + d; z++) {
    for (let x = x0; x < x0 + w; x++) {
      const wall = x === x0 || x === x0 + w - 1 || z === z0 || z === z0 + d - 1;
      // The doorway is two courses of air in the front wall, over the ground;
      // its roof is written all the same, so the way in is a way in and not a
      // notch out of the silhouette.
      const doorway = z === z0 + d - 1 && x === doorX;
      if (wall && !doorway) {
        for (let y = 1; y <= 2; y++) put(x, y, z, palette.log, { axis: "y" });
      }
      // The roof, laid across the whole footprint so it is one connected plane.
      put(x, 3, z, palette.planks);
    }
  }
}

/* -------------------------------------------------------------------------- */
/* the logging camp                                                            */
/* -------------------------------------------------------------------------- */

/**
 * `logging_camp` — the pack's compound, and the icon battery P6 asks for by
 * name.
 *
 * Two rows with the churned lane between them: the **bunk shanty** and its
 * woodpile down one side, the **cook shack** with the fire outside its door
 * down the other, and the **saw trestle** with a half-cut butt on it at the
 * road end. The lane is left clear the whole length — a camp you cannot walk
 * down is a wall with huts on it — and everything else is pushed to the edges
 * of the box.
 *
 * The fire is a `campfire` on a hearth of its own stone, which is the one glow
 * in the pack that is allowed to be a light: it is not a `lantern` by name and
 * it is standing on a solid block.
 */
const loggingCamp: PropGenerator = (ctx) => {
  const { put, palette } = ctx;
  const w = campLength(ctx.params);
  const scuff = ctx.rng("camp.ground").int(0, 8);
  surface(put, w, CAMP_D, (x, z) => churned(x, z, scuff));

  // The bunk shanty, at the west end of the north row.
  shanty(put, palette, 1, 1, 7, 5, 3);
  // The cook shack, at the west end of the south row, facing the lane.
  shanty(put, palette, 1, CAMP_D - 5, 5, 4, 2);
  // The cook fire, out in front of its door, on its own hearth.
  put(3, 1, CAMP_D - 6, palette.stone);
  put(3, 2, CAMP_D - 6, "campfire", {
    facing: "north",
    lit: "true",
    signal_fire: "false",
    waterlogged: "false",
  });
  put(2, 1, CAMP_D - 6, palette.stone);
  put(4, 1, CAMP_D - 6, palette.stone);

  // The woodpile against the bunk shanty's east wall — split log, two courses,
  // each cell resting on the one under it.
  for (let z = 1; z <= 4; z++) {
    put(8, 1, z, palette.stripped, { axis: "z" });
    if (z % 2 === 1) put(8, 2, z, palette.stripped, { axis: "z" });
  }

  // The saw trestle at the road end: two trestles carrying a butt across them.
  const tx = w - 5;
  for (const z of [2, 5]) {
    put(tx, 1, z, palette.fence, POST);
    put(tx + 3, 1, z, palette.fence, POST);
    put(tx, 2, z, palette.log, { axis: "x" });
    put(tx + 1, 2, z, palette.log, { axis: "x" });
    put(tx + 2, 2, z, palette.log, { axis: "x" });
    put(tx + 3, 2, z, palette.log, { axis: "x" });
  }
  // The butt on the trestles, and the saw standing in its kerf.
  for (let z = 2; z <= 5; z++) put(tx + 1, 3, z, palette.log, { axis: "z" });
  put(tx + 1, 4, 3, "iron_bars", {
    east: "false",
    north: "true",
    south: "true",
    waterlogged: "false",
    west: "false",
  });

  // The camp's stores, at the road end of the south row.
  put(w - 2, 1, CAMP_D - 2, palette.cargo, { facing: "up", open: "false" });
  put(w - 3, 1, CAMP_D - 2, palette.cargo, { facing: "up", open: "false" });
  put(w - 2, 1, CAMP_D - 4, "cauldron");

  return { ops: NO_OPS, meta: metaOf("logging_camp", ctx.params) };
};

/* -------------------------------------------------------------------------- */
/* the log landing                                                             */
/* -------------------------------------------------------------------------- */

/**
 * `log_landing` — the deck at the road head.
 *
 * The track runs along the front of the box and stays completely clear: that
 * is where the trucks come to, and it is also the two-course walkable run that
 * keeps this prop from being a wall. Behind it, the deck — whole trunks laid
 * along x in courses, each course shorter than the one below it so the stack
 * batters back, with an **anchor post** at each end of every course holding it
 * on. Every trunk rests on the trunk or the ground under it, and the ends are
 * squared to the track, which is the read.
 */
const logLanding: PropGenerator = (ctx) => {
  const { put, palette } = ctx;
  const scuff = ctx.rng("landing.track").int(0, 6);
  surface(put, DECK_W, DECK_D, (x, z) =>
    z <= 2 ? track(palette, x, z, scuff) : churned(x, z, scuff),
  );

  // The deck: three courses, each inset one cell at both ends.
  for (let y = 1; y <= 3; y++) {
    const inset = y - 1;
    for (let z = 4; z <= DECK_D - 2; z++) {
      for (let x = 1 + inset; x <= DECK_W - 2 - inset; x++) {
        put(x, y, z, palette.log, { axis: "x" });
      }
    }
  }

  // The anchor posts, driven at both ends of the stack and standing proud of
  // it, each a full column from the ground up.
  for (const x of [0, DECK_W - 1]) {
    for (const z of [4, DECK_D - 2]) {
      for (let y = 1; y <= 3; y++) put(x, y, z, palette.stripped, { axis: "y" });
    }
  }

  // The chocks on the track side, where a trunk that got away would stop.
  for (const x of [2, DECK_W - 3]) put(x, 1, 3, palette.stripped, { axis: "x" });

  return { ops: NO_OPS, meta: metaOf("log_landing", ctx.params) };
};

/* -------------------------------------------------------------------------- */
/* the sawpit                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * `sawpit` — a trestle over an open pit with the saw standing in the kerf.
 *
 * The pit is made the way a prop on a `ground` base has to make one: the
 * **deck is raised** a course all round and the pit floor is the ground plane
 * itself, which is the same silhouette from the outside and does not ask the
 * placer to dig. The pit keeps two courses of air over it so the bottom sawyer
 * can stand in it; the deck's own top has two courses over it as well, so a
 * body can walk the deck.
 *
 * Across the pit: the butt being cut, the kerf in the middle of it, and the
 * two-man saw standing in the kerf as `iron_bars`. Sawdust is banked at one
 * end, on the ground, because a gravity block belongs on a floor.
 */
const sawpit: PropGenerator = (ctx) => {
  const { put, palette } = ctx;
  const scuff = ctx.rng("sawpit.ground").int(0, 8);
  surface(put, SAWPIT_W, SAWPIT_D, (x, z) => churned(x, z, scuff));

  // The deck, a raised ring round the pit. The pit is the two cells at the
  // middle of the run and is left as bare ground.
  for (let z = 0; z < SAWPIT_D; z++) {
    for (let x = 0; x < SAWPIT_W; x++) {
      const inPit = z >= 2 && z <= 2 && x >= 2 && x <= SAWPIT_W - 3;
      if (inPit) continue;
      if (z === 0 || z === SAWPIT_D - 1) continue; // the ways in, left at ground level
      put(x, 1, z, palette.planks);
    }
  }

  // The butt over the pit, carried on the deck at both ends, with the kerf.
  for (let x = 1; x <= SAWPIT_W - 2; x++) {
    if (x === Math.floor(SAWPIT_W / 2)) continue; // the kerf
    put(x, 2, 2, palette.log, { axis: "x" });
  }
  // The saw, standing in the kerf, its teeth down in the pit.
  for (let y = 1; y <= 3; y++) {
    put(Math.floor(SAWPIT_W / 2), y, 2, "iron_bars", BARS_X);
  }

  // The sawdust, banked at one end on the ground, and the tools beside it.
  put(0, 1, 2, "sand");
  put(SAWPIT_W - 1, 1, 2, palette.cargo, { facing: "up", open: "false" });

  return { ops: NO_OPS, meta: metaOf("sawpit", ctx.params) };
};

/* -------------------------------------------------------------------------- */
/* the cut-over                                                                */
/* -------------------------------------------------------------------------- */

/**
 * `stump_field` — the ground a camp leaves behind, and the cheapest strong
 * icon in the pack.
 *
 * Stumps on a **position-hashed** spacing rather than a grid, so a run of them
 * reads as a felled stand and not as an orchard; slash piles of stripped log
 * and leaves heaped between them; and one **great stump** at the middle of the
 * run, three cells across and two courses high — the tree that was too big to
 * have been worth taking, and the thing that tells you what the rest of them
 * used to be.
 *
 * Everything is one or two courses off a ground plane that is written edge to
 * edge, so there is nothing here for the floating rule to find and a body can
 * walk between all of it.
 */
const stumpField: PropGenerator = (ctx) => {
  const { put, palette } = ctx;
  const w = stumpLength(ctx.params);
  const scuff = ctx.rng("cutover.ground").int(0, 10);
  surface(put, w, STUMP_D, (x, z) => cutover(x, z, scuff));

  const midX = Math.floor(w / 2);
  const midZ = Math.floor(STUMP_D / 2);
  /** Is this cell inside the great stump? */
  const great = (x: number, z: number): boolean =>
    x >= midX - 1 && x <= midX + 1 && z >= midZ - 1 && z <= midZ + 1;

  // The great stump: three across, two courses, and a ring of its own roots.
  for (let z = midZ - 1; z <= midZ + 1; z++) {
    for (let x = midX - 1; x <= midX + 1; x++) {
      put(x, 1, z, palette.log, { axis: "y" });
      put(x, 2, z, palette.stripped, { axis: "y" });
    }
  }

  // The rest of the stand, on a hashed spacing.
  for (let z = 1; z < STUMP_D - 1; z++) {
    for (let x = 1; x < w - 1; x++) {
      if (great(x, z)) continue;
      const k = (x * 13 + z * 29 + scuff) % 17;
      if (k === 0) {
        // A stump: one course of log with the cut face on top.
        put(x, 1, z, palette.log, { axis: "y" });
        continue;
      }
      if (k === 5 && x + 1 < w - 1) {
        // A slash pile: two cells of limb wood, touching, with brash on top.
        put(x, 1, z, palette.stripped, { axis: "x" });
        put(x + 1, 1, z, palette.stripped, { axis: "x" });
        put(x, 2, z, "spruce_leaves", {
          distance: "1",
          persistent: "true",
          waterlogged: "false",
        });
      }
    }
  }

  return { ops: NO_OPS, meta: metaOf("stump_field", ctx.params) };
};

/* -------------------------------------------------------------------------- */
/* the spar pole                                                               */
/* -------------------------------------------------------------------------- */

/**
 * `spar_pole` — the topped tree rigged as a yarding mast.
 *
 * The mast is a **full-block column** from the ground plane to its head, every
 * course of it: that is the hard-won rule about tall poles, and a mast drawn
 * as bars or fences over a stub is both a worse read and a support defect. The
 * rigging is the head block and the blocks hung under it; the **guy lines**
 * run down from below the head to four stumps at the corners of the pad as
 * runs of `iron_bars`, each column continuous from its stump to the mast's
 * shoulder, so the eye reads a rigged spar and nothing hangs in the air.
 *
 * The four cells round the foot are left clear, so a body can walk up to it.
 */
const sparPole: PropGenerator = (ctx) => {
  const { put, palette } = ctx;
  const h = sparHeight(ctx.params);
  const scuff = ctx.rng("spar.ground").int(0, 10);
  surface(put, SPAR_SPAN, SPAR_SPAN, (x, z) => cutover(x, z, scuff));

  const mid = Math.floor(SPAR_SPAN / 2);
  // The mast: log to the shoulder, stripped above it — a topped tree has its
  // bark taken off where the rigging runs.
  const shoulder = h - 4;
  for (let y = 1; y <= h - 1; y++) {
    put(mid, y, mid, y >= shoulder ? palette.stripped : palette.log, {
      axis: "y",
    });
  }

  // The rigging at the head: the blocks, hung either side of the mast.
  for (const dx of [-1, 1]) {
    put(mid + dx, h - 2, mid, "iron_bars", BARS_X);
    put(mid + dx, h - 3, mid, "iron_bars", BARS_X);
  }

  // The guy lines: four stumps on the cardinals of the pad, each with a
  // continuous run of line up to the mast's shoulder and a reach in to the
  // mast itself. Cardinal rather than diagonal on purpose — a run that steps
  // diagonally is a run of blocks that touch nothing, and this way every cell
  // of every guy has the cell below it or the cell beside it.
  for (const [dx, dz] of [
    [-2, 0],
    [2, 0],
    [0, -2],
    [0, 2],
  ] as const) {
    const x = mid + dx;
    const z = mid + dz;
    put(x, 1, z, palette.stripped, { axis: "y" });
    for (let y = 2; y <= shoulder; y++) put(x, y, z, "iron_bars", POST);
    // The line's last reach, in to the mast's shoulder.
    put(x - Math.sign(dx), shoulder, z - Math.sign(dz), "iron_bars", POST);
  }

  return { ops: NO_OPS, meta: metaOf("spar_pole", ctx.params) };
};

/* -------------------------------------------------------------------------- */
/* the cache                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * `hunters_cache` — a box on four peeled poles, above bear height.
 *
 * Four legs, each a full column of stripped log from the ground plane to the
 * underside of the box, and the box itself a solid 3x3 raft of planks with a
 * trapdoor hatch in its top. The point of the thing is the **gap** — five
 * clear courses between the ground and the floor of the box — so the four
 * cells between the legs are left empty and the ladder is deliberately absent,
 * which is what the note's "with the bark stripped off the legs" is about.
 */
const huntersCache: PropGenerator = (ctx) => {
  const { put, palette } = ctx;
  const scuff = ctx.rng("cache.ground").int(0, 10);
  surface(put, CACHE_PAD, CACHE_PAD, (x, z) => cutover(x, z, scuff));

  // The four peeled legs.
  for (const [x, z] of [
    [1, 1],
    [3, 1],
    [1, 3],
    [3, 3],
  ] as const) {
    for (let y = 1; y <= 4; y++) put(x, y, z, palette.stripped, { axis: "y" });
  }

  // The box: a raft of planks across the legs, and its roof over it.
  for (let z = 1; z <= 3; z++) {
    for (let x = 1; x <= 3; x++) {
      put(x, 5, z, palette.planks);
      if (x === 2 && z === 2) {
        put(x, 6, z, palette.trapdoor, {
          facing: "north",
          half: "bottom",
          open: "false",
          powered: "false",
          waterlogged: "false",
        });
        continue;
      }
      put(x, 6, z, palette.planks);
    }
  }

  return { ops: NO_OPS, meta: metaOf("hunters_cache", ctx.params) };
};

/* -------------------------------------------------------------------------- */
/* the registry                                                                */
/* -------------------------------------------------------------------------- */

/** Every generator this file contributes, merged into `PROP_GENERATORS`. */
export const WILDS_PROP_GENERATORS: Readonly<Record<string, PropGenerator>> = Object.freeze({
  logging_camp: loggingCamp,
  log_landing: logLanding,
  sawpit: sawpit,
  stump_field: stumpField,
  spar_pole: sparPole,
  hunters_cache: huntersCache,
});
