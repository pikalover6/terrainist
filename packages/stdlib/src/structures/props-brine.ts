/**
 * `prop.place@0` — the **nautical & pirate pack's shore props**: the seven
 * entries of `docs/CATALOG-EXPANSION-v0.md` §3.2 in the table's second half
 * that are objects you walk past on a quay, a strand or a headland.
 *
 * The pack's thesis is that the catalog has an excellent fleet and almost no
 * *shore*. The fleet is `ships.ts`; this file is the ground the fleet is tied
 * to — the racks the catch dries on, the capstan the hawser comes round, the
 * anchors nobody ever collected, the cone on the headland with no light in it.
 * Every one of them is a silhouette a stranger names from the deck of a boat.
 *
 * Seven props, in catalog order:
 *
 * - `fish_drying_rack` — ranks of split fish on poles between A-frame posts;
 *   *the repeat piece*, and the one that takes a `length`;
 * - `treasure_cache` — chests half out of the sand under a lone palm;
 * - `smugglers_landing` — a stair cut into a cove wall, mooring rings, crates
 *   above the tideline and a lamp set into the rock;
 * - `capstan` — the XS quay piece: a drum, its bar sockets, a coiled hawser;
 * - `anchor_stack` — old anchors leaned together with chain heaped round them;
 * - `daymark` — the whitewashed cone with **no light in it**, on a `height`;
 * - `whalebone_arch` — two jaw bones meeting over a path.
 *
 * ## The contract, and why this file is a leaf
 *
 * Same shape as `props-response.ts` and `props-classical-b.ts`: this file
 * imports **types** from `props.ts` and no values at all, so the one edge
 * `props.ts` → here can never become a module-initialisation cycle. Node-local
 * coordinates, `y = 0` the base plane, block **names** with a property map,
 * every op inside the declared box so `rotateOps` needs no special case.
 *
 * ## The rules every prop here obeys
 *
 * 1. **Nothing floats.** The physics lint's `floating.*` family fires on a
 *    full cube with **six air faces**. Every prop here writes its whole
 *    footprint at `y = 0` — a strand, a quay or a headland *is* ground, so the
 *    base plane is honest rather than defensive — and everything above it
 *    rests on that plane, on a post run down to it, or on a horizontal
 *    neighbour of its own. The arch is the interesting case and is drawn as a
 *    **4-connected** run from one foot to the other: a diagonal step would put
 *    a bone block in the air with six air faces, which is the whole reason the
 *    crown is three cells wide rather than a corbel.
 * 2. **A walkable cell keeps its two courses of air.** The arch's opening, the
 *    rack's lanes and the landing's stair all leave `y = 1` *and* `y = 2`
 *    clear over solid non-water floor, because the lint walks a 1x2 body and
 *    an icon you cannot walk under is a wall.
 * 3. **Gravity blocks on floors only.** The sand of the cache and the strand
 *    is written at `y = 0`, on the ground; nothing here drops sand into air.
 * 4. **No lanterns.** The lint's lantern rule fires on any name ending
 *    `lantern`, so the landing's "shuttered lantern on a hook" is `glowstone`
 *    set into the rock face with a solid neighbour, and the daymark — whose
 *    whole point is that it is *mute* — has no light at all.
 * 5. **No `chain`** — not in the pinned 1.21.11 block table; every hawser,
 *    ring and heap of chain is `iron_bars` through `palette.chain`.
 * 6. **No sign blocks**, because a sign is a block entity this op stream
 *    cannot carry.
 * 7. **Determinism.** The only randomness is the scuffing of the ground plane,
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
export const BRINE_PROP_NAMES = [
  "fish_drying_rack",
  "treasure_cache",
  "smugglers_landing",
  "capstan",
  "anchor_stack",
  "daymark",
  "whalebone_arch",
] as const;

/** One of the props this file builds. */
export type BrinePropName = (typeof BRINE_PROP_NAMES)[number];

/** True for a name this file answers to. */
export function isBrineProp(name: string): name is BrinePropName {
  return (BRINE_PROP_NAMES as readonly string[]).includes(name);
}

/* -------------------------------------------------------------------------- */
/* extents                                                                     */
/* -------------------------------------------------------------------------- */

/** Default run of the drying racks, along the shore. */
export const RACK_LENGTH = 11;
/** The shortest and longest run of racks a document may ask for. */
export const RACK_MIN = 7;
/** See {@link RACK_MIN}. */
export const RACK_MAX = 21;
/** Depth of the racks: three ranks with a lane between each pair. */
export const RACK_D = 7;
/** Height of the rack box: ground, two post courses, the pole. */
export const RACK_H = 4;
/** Spacing of the A-frame posts along the run. */
export const RACK_PITCH = 3;

/** Treasure cache pad, in x and z. */
export const CACHE_SPAN = 5;
/** Cache height: the palm's trunk and its canopy. */
export const CACHE_H = 7;

/** Smugglers' landing: the run along the cove wall. */
export const LANDING_W = 9;
/** Landing depth: the wall, then the tideline in front of it. */
export const LANDING_D = 7;
/** Landing height: the cove wall, and nothing above it. */
export const LANDING_H = 4;

/** Capstan pad, in x and z. */
export const CAPSTAN_SPAN = 3;
/** Capstan height: the paving, the drum, its head. */
export const CAPSTAN_H = 3;

/** Anchor stack pad, in x and z. */
export const ANCHOR_SPAN = 5;
/** Anchor stack height: the paving and two courses of leaned iron. */
export const ANCHOR_H = 3;

/** Daymark pad, in x and z — the cone's base diameter. */
export const DAYMARK_SPAN = 7;
/** Default height of the daymark, ground plane included. */
export const DAYMARK_H = 9;
/** The shortest and tallest daymark a document may ask for. */
export const DAYMARK_MIN = 7;
/** See {@link DAYMARK_MIN}. */
export const DAYMARK_MAX = 13;

/** Whalebone arch: the span across the path, foot to foot. */
export const WHALE_W = 7;
/** Arch depth: the path it stands on. */
export const WHALE_D = 5;
/** Arch height: the jaws' rise, and the crown over the path. */
export const WHALE_H = 7;

/** Read the racks' `length` param the way the generator reads it. */
function rackLength(params: Readonly<Record<string, unknown>>): number {
  const raw = params["length"];
  if (typeof raw !== "number" || !Number.isFinite(raw)) return RACK_LENGTH;
  const v = Math.round(raw);
  return v < RACK_MIN ? RACK_MIN : v > RACK_MAX ? RACK_MAX : v;
}

/** Read the daymark's `height` param the way the generator reads it. */
function daymarkHeight(params: Readonly<Record<string, unknown>>): number {
  const raw = params["height"];
  if (typeof raw !== "number" || !Number.isFinite(raw)) return DAYMARK_H;
  const v = Math.round(raw);
  return v < DAYMARK_MIN ? DAYMARK_MIN : v > DAYMARK_MAX ? DAYMARK_MAX : v;
}

/** The declared box of one of this file's props, before it is generated. */
export function brinePropFootprint(
  prop: BrinePropName,
  params: Readonly<Record<string, unknown>> = {},
): {
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
    case "fish_drying_rack":
      return ground([rackLength(params), RACK_H, RACK_D]);
    case "treasure_cache":
      return ground([CACHE_SPAN, CACHE_H, CACHE_SPAN]);
    case "smugglers_landing":
      return ground([LANDING_W, LANDING_H, LANDING_D]);
    case "capstan":
      return ground([CAPSTAN_SPAN, CAPSTAN_H, CAPSTAN_SPAN]);
    case "anchor_stack":
      return ground([ANCHOR_SPAN, ANCHOR_H, ANCHOR_SPAN]);
    case "daymark":
      return ground([DAYMARK_SPAN, daymarkHeight(params), DAYMARK_SPAN]);
    case "whalebone_arch":
    default:
      return ground([WHALE_W, WHALE_H, WHALE_D]);
  }
}

/** Build a `PropMeta` from the declared footprint, so the two cannot drift. */
function metaOf(prop: BrinePropName, params: Readonly<Record<string, unknown>>): PropMeta {
  const foot = brinePropFootprint(prop, params);
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

/* -------------------------------------------------------------------------- */
/* the shore's surfaces                                                        */
/* -------------------------------------------------------------------------- */

/**
 * The **strand** — wet sand with the shingle showing through it.
 *
 * A pure function of position and one seeded offset, so the same prop scuffs
 * the same way on every re-run and every quarter turn.
 */
function strand(x: number, z: number, scuff: number): string {
  const k = (x * 7 + z * 11 + scuff) % 9;
  if (k === 0) return "gravel";
  if (k === 1) return "coarse_dirt";
  return "sand";
}

/** The **quay** — laid stone with the odd worn cell, for the paved props. */
function quay(palette: PropPalette, x: number, z: number, scuff: number): string {
  const k = (x * 5 + z * 13 + scuff) % 7;
  if (k === 0) return palette.stoneAccent;
  if (k === 1) return "gravel";
  return palette.stone;
}

/** The **headland** — turf over rock, for the daymark's own ground. */
function headland(palette: PropPalette, x: number, z: number, scuff: number): string {
  const k = (x * 11 + z * 5 + scuff) % 8;
  if (k === 0) return palette.stone;
  if (k === 1) return "gravel";
  return "coarse_dirt";
}

/** Whitewash, banded by course — the daymark's and the salt-white cone's skin. */
function whitewash(y: number): string {
  return y % 4 === 0 ? "calcite" : "white_concrete";
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

/* -------------------------------------------------------------------------- */
/* the drying racks                                                            */
/* -------------------------------------------------------------------------- */

/**
 * `fish_drying_rack` — the piece that makes a whole shoreline read as a
 * fishing shore.
 *
 * Three ranks running along the strand with a walking lane between each pair,
 * and each rank is the same three parts:
 *
 * - **the posts**, a fence every {@link RACK_PITCH} cells, standing on the
 *   strand and carrying everything above them;
 * - **the pole**, a continuous run of stripped log at `y = 3` down the whole
 *   rank. Continuous is the point: a pole in one-cell lengths over the posts
 *   would be a row of blocks with six air faces, and this way every cell of it
 *   touches the next;
 * - **the fish**, bone blocks hung under the pole between the posts. Each one
 *   has the pole directly over it, which is both what hanging *means* and what
 *   keeps it out of the floating rule.
 *
 * The lanes at `z = 0, 2, 4, 6` are left clear at `y = 1` and `y = 2` so a
 * walking body can go down them, which is what makes this a rack rather than a
 * fence.
 */
const fishDryingRack: PropGenerator = (ctx) => {
  const { put, palette } = ctx;
  const w = rackLength(ctx.params);
  const scuff = ctx.rng("rack.strand").int(0, 8);
  surface(put, w, RACK_D, (x, z) => strand(x, z, scuff));

  for (const z of [1, 3, 5]) {
    // The posts, on the strand.
    for (let x = 1; x <= w - 2; x++) {
      if (x % RACK_PITCH !== 1) continue;
      put(x, 1, z, palette.fence, {
        east: "false",
        north: "false",
        south: "false",
        waterlogged: "false",
        west: "false",
      });
      put(x, 2, z, palette.fence, {
        east: "false",
        north: "false",
        south: "false",
        waterlogged: "false",
        west: "false",
      });
    }
    // The pole, unbroken from end to end.
    for (let x = 0; x < w; x++) put(x, 3, z, palette.stripped, { axis: "x" });
    // The split fish, hung off it between the posts.
    for (let x = 1; x <= w - 2; x++) {
      if (x % RACK_PITCH !== 2) continue;
      put(x, 2, z, "bone_block", { axis: "y" });
    }
  }

  return { ops: NO_OPS, meta: metaOf("fish_drying_rack", ctx.params) };
};

/* -------------------------------------------------------------------------- */
/* the treasure cache                                                          */
/* -------------------------------------------------------------------------- */

/**
 * `treasure_cache` — the most literal icon in the catalog, and unapologetic.
 *
 * A lone palm on a five-cell patch of sand, two chests half out of the spoil
 * with one lid open, the coin that fell out of it, and the spade left standing
 * where the digging stopped. The palm is a trunk with a canopy that closes
 * over it — every leaf cell touches the trunk or another leaf, so the crown is
 * a crown rather than nine loose blocks in the air.
 */
const treasureCache: PropGenerator = (ctx) => {
  const { put, palette } = ctx;
  const scuff = ctx.rng("cache.sand").int(0, 8);
  surface(put, CACHE_SPAN, CACHE_SPAN, (x, z) => strand(x, z, scuff));

  // The palm: a trunk on the sand, then a canopy that meets over it.
  for (let y = 1; y <= 4; y++) put(1, y, 1, "jungle_log", { axis: "y" });
  for (let z = 0; z <= 2; z++) {
    for (let x = 0; x <= 2; x++) {
      put(x, 5, z, "jungle_leaves", { distance: "1", persistent: "true", waterlogged: "false" });
    }
  }
  put(1, 6, 1, "jungle_leaves", { distance: "1", persistent: "true", waterlogged: "false" });

  // The cache itself: two chests in the spoil, one of them open to the sky.
  put(3, 1, 1, "chest", { facing: "east", type: "single", waterlogged: "false" });
  put(3, 1, 2, "chest", { facing: "east", type: "single", waterlogged: "false" });
  put(3, 2, 2, palette.trapdoor, {
    facing: "east",
    half: "bottom",
    open: "true",
    powered: "false",
    waterlogged: "false",
  });
  // What spilled out of it, and the spade standing in the spoil.
  put(3, 1, 3, "gold_block");
  put(4, 1, 3, palette.cargo, { facing: "up", open: "false" });
  put(1, 1, 4, palette.chain, {
    east: "false",
    north: "false",
    south: "false",
    waterlogged: "false",
    west: "false",
  });

  return { ops: NO_OPS, meta: metaOf("treasure_cache", ctx.params) };
};

/* -------------------------------------------------------------------------- */
/* the smugglers' landing                                                      */
/* -------------------------------------------------------------------------- */

/**
 * `smugglers_landing` — the way up off a beach that nobody was meant to find.
 *
 * The cove wall is a solid mass two cells deep along the back of the box, and
 * the *stair* is cut into it as a run of shortening columns at one end: a
 * three-step flight from the tideline up onto the top of the wall, each tread
 * with two courses of air over it so a body can climb it. That is why the wall
 * is drawn per column rather than per course — a course-by-course wall would
 * have had to be a ring to leave the treads, and a ring per course is the
 * `floating.isolated` rule in its other clothes.
 *
 * Below it: mooring rings driven into the rock, crates stacked above the
 * tideline, and the "shuttered lantern on a hook" as **glowstone** set into
 * the face, because the lint's lantern rule fires on the name.
 */
const smugglersLanding: PropGenerator = (ctx) => {
  const { put, palette } = ctx;
  const scuff = ctx.rng("landing.strand").int(0, 8);
  surface(put, LANDING_W, LANDING_D, (x, z) =>
    z <= 1 ? quay(palette, x, z, scuff) : strand(x, z, scuff),
  );

  /** Top of the cove wall over a column: three, or the stair's tread. */
  const wallTop = (x: number, z: number): number => {
    if (z === 1 && x >= LANDING_W - 3) return x - (LANDING_W - 3) + 1;
    return 3;
  };

  for (let z = 0; z <= 1; z++) {
    for (let x = 0; x < LANDING_W; x++) {
      const top = z === 0 ? 3 : wallTop(x, z);
      for (let y = 1; y <= top; y++) {
        put(x, y, z, y % 3 === 0 ? palette.stoneAccent : palette.stone);
      }
    }
  }

  // The mooring rings, driven into the face of the rock.
  for (const x of [1, 3]) {
    put(x, 1, 2, palette.chain, {
      east: "true",
      north: "true",
      south: "false",
      waterlogged: "false",
      west: "true",
    });
  }

  // The crates, above the tideline and clear of the stair.
  put(1, 1, 4, palette.cargo, { facing: "up", open: "false" });
  put(2, 1, 4, palette.cargo, { facing: "up", open: "false" });
  put(1, 2, 4, palette.cargo, { facing: "up", open: "false" });

  // The shuttered lamp, set into the rock beside the rings. Glowstone, not a
  // lantern: the lint's rule fires on the name, and the face is its neighbour.
  put(0, 2, 2, "glowstone");

  return { ops: NO_OPS, meta: metaOf("smugglers_landing", ctx.params) };
};

/* -------------------------------------------------------------------------- */
/* the capstan                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * `capstan` — three cells square, and the cheapest thing on the quay that
 * says *this is a working harbour*.
 *
 * A drum on the paving with its head above it, four bar sockets standing round
 * it at deck level, and the hawser coiled at its foot. Everything rests on the
 * paving, so the whole prop is one course of support with a head on top.
 */
const capstan: PropGenerator = (ctx) => {
  const { put, palette } = ctx;
  const scuff = ctx.rng("capstan.quay").int(0, 6);
  surface(put, CAPSTAN_SPAN, CAPSTAN_SPAN, (x, z) => quay(palette, x, z, scuff));

  put(1, 1, 1, palette.stone);
  put(1, 2, 1, "chiseled_stone_bricks");

  // The bar sockets: the capstan bars, shipped and standing on the quay.
  for (const [x, z] of [
    [0, 1],
    [2, 1],
    [1, 0],
    [1, 2],
  ] as const) {
    put(x, 1, z, palette.fence, {
      east: "false",
      north: "false",
      south: "false",
      waterlogged: "false",
      west: "false",
    });
  }

  // The hawser, coiled at the foot.
  put(0, 1, 0, "brown_carpet");
  put(2, 1, 2, "brown_carpet");

  return { ops: NO_OPS, meta: metaOf("capstan", ctx.params) };
};

/* -------------------------------------------------------------------------- */
/* the anchor stack                                                            */
/* -------------------------------------------------------------------------- */

/**
 * `anchor_stack` — old iron nobody ever came back for.
 *
 * A bollard of dressed stone at the middle of a paved patch with the anchors
 * leaned against it in bars, and the chain heaped round the feet of them. Two
 * courses only: an anchor stack that stands taller than a person is a
 * monument, and this is meant to be *litter with a history*.
 */
const anchorStack: PropGenerator = (ctx) => {
  const { put, palette } = ctx;
  const scuff = ctx.rng("anchor.quay").int(0, 6);
  surface(put, ANCHOR_SPAN, ANCHOR_SPAN, (x, z) => quay(palette, x, z, scuff));

  put(2, 1, 2, palette.stone);
  put(2, 2, 2, palette.stoneAccent);

  const bars = (x: number, y: number, z: number): void => {
    put(x, y, z, palette.chain, {
      east: "true",
      north: "true",
      south: "true",
      waterlogged: "false",
      west: "true",
    });
  };

  // The anchors, leaned against the bollard on all four sides.
  for (const [x, z] of [
    [1, 2],
    [3, 2],
    [2, 1],
    [2, 3],
  ] as const) {
    bars(x, 1, z);
    bars(x, 2, z);
  }
  // The chain, heaped round their feet.
  for (const [x, z] of [
    [1, 1],
    [3, 1],
    [1, 3],
    [3, 3],
  ] as const) {
    bars(x, 1, z);
  }

  return { ops: NO_OPS, meta: metaOf("anchor_stack", ctx.params) };
};

/* -------------------------------------------------------------------------- */
/* the daymark                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * `daymark` — the lighthouse's mute cousin, and the reason it is in the pack.
 *
 * A whitewashed cone on a headland with **nothing lit in it**: a daymark is
 * read by day, against the sky, and a light in it would make it a lighthouse
 * the catalog already ships. Cheap enough to stand on three headlands of the
 * same coast, which is what turns one seamark into a *coast*.
 *
 * Every course is a filled disc rather than a ring, which is both what a
 * masonry cone is and the whole answer to the six-air-face rule: no cell of it
 * is ever without a neighbour under it.
 */
const daymark: PropGenerator = (ctx) => {
  const { put, palette } = ctx;
  const h = daymarkHeight(ctx.params);
  const scuff = ctx.rng("daymark.ground").int(0, 7);
  surface(put, DAYMARK_SPAN, DAYMARK_SPAN, (x, z) => headland(palette, x, z, scuff));

  const c = (DAYMARK_SPAN - 1) / 2;
  const top = h - 1;
  for (let y = 1; y <= top; y++) {
    // The taper, in integer arithmetic: radius three at the springing, nothing
    // but the axis at the crown.
    const r = 3 - Math.floor(((y - 1) * 3) / Math.max(1, top - 1));
    for (let z = 0; z < DAYMARK_SPAN; z++) {
      for (let x = 0; x < DAYMARK_SPAN; x++) {
        const dx = x - c;
        const dz = z - c;
        if (dx * dx + dz * dz > r * r + r) continue;
        // The plinth course is the headland's own stone; the cone is limewash.
        put(x, y, z, y === 1 ? palette.stone : whitewash(y));
      }
    }
  }

  return { ops: NO_OPS, meta: metaOf("daymark", ctx.params) };
};

/* -------------------------------------------------------------------------- */
/* the whalebone arch                                                          */
/* -------------------------------------------------------------------------- */

/**
 * `whalebone_arch` — two jaw bones meeting over a path at the top of the town.
 *
 * Niche, immediate, and it names a whaling port in one glance. The geometry is
 * the whole lesson of this file: the two jaws climb, bevel inward, and meet on
 * a three-cell crown, and **every step of that run is orthogonal**. A corbel
 * that stepped diagonally would leave each bone in the air with six air faces,
 * which is the lint's `floating.isolated` finding — so the bevel cells at
 * `y = 5` sit under the crown rather than beside the legs.
 *
 * Under the crown the path keeps `y = 1` and `y = 2` clear over solid floor,
 * so a body walks through the arch instead of into it.
 */
const whaleboneArch: PropGenerator = (ctx) => {
  const { put, palette } = ctx;
  const scuff = ctx.rng("arch.path").int(0, 6);
  surface(put, WHALE_W, WHALE_D, (x, z) =>
    z === 2 ? quay(palette, x, z, scuff) : headland(palette, x, z, scuff),
  );

  const bone = (x: number, y: number, z: number, axis: string): void => {
    put(x, y, z, "bone_block", { axis });
  };

  // The two jaws, standing on the path either side of the way through.
  for (const x of [1, 5]) {
    for (let y = 1; y <= 6; y++) bone(x, y, 2, "y");
  }
  // The bevel where each jaw turns inward, and the crown they meet on.
  bone(2, 5, 2, "x");
  bone(4, 5, 2, "x");
  for (let x = 2; x <= 4; x++) bone(x, 6, 2, "x");

  return { ops: NO_OPS, meta: metaOf("whalebone_arch", ctx.params) };
};

/* -------------------------------------------------------------------------- */
/* the registry                                                                */
/* -------------------------------------------------------------------------- */

/** Every generator this file contributes, merged into `PROP_GENERATORS`. */
export const BRINE_PROP_GENERATORS: Readonly<Record<string, PropGenerator>> = Object.freeze({
  fish_drying_rack: fishDryingRack,
  treasure_cache: treasureCache,
  smugglers_landing: smugglersLanding,
  capstan: capstan,
  anchor_stack: anchorStack,
  daymark: daymark,
  whalebone_arch: whaleboneArch,
});
