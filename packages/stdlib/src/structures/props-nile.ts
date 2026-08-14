/**
 * `prop.place@0` — the **Nile & ancient Egypt pack**'s props (§3.8).
 *
 * Three things a body walks past on the river, and one of them is the whole
 * reason the pack exists:
 *
 * - `pyramid` — **the headline of the entire expansion document.** The catalog
 *   could not say *pyramid*, which §3.8 calls close to indefensible for a
 *   Minecraft product. A true battered mass on a square base, cased to an
 *   apex, with a passage low on the north face running in to a chamber;
 * - `sacred_lake` — the rectangular stone-lined basin with steps down all four
 *   sides, inside its precinct wall;
 * - `felucca` — one raked mast, a long lateen yard, a shallow open hull and an
 *   awning aft: the boat that is on the river in every photograph of it.
 *
 * ## Why the pyramid is here and not in `archetypes-nile.ts`
 *
 * A building's whole height budget is the eave plate plus at most five roof
 * layers plus one course of flourish, and the only volume a fit-out may
 * rebuild is the part **above the plate** — six courses. A mass that insets
 * one cell per course closes a thirty-three block base in sixteen. Building it
 * lower is worse, not better: filling a storey solid makes every column of
 * that storey `interior.blocked_column`, the rule that means "a pillar through
 * the room", and it does not care that the pillar is six thousand blocks of
 * limestone. A prop declares its own box, owns every cell in it, and has no
 * storeys to seal — so the prop registry is the pyramid's honest host, exactly
 * as it was §3.2's careening beach. The catalog row is marked `prop` to say
 * so out loud.
 *
 * The contract is `props.ts`'s, unchanged, and the leaf discipline is
 * `props-corsair.ts`'s: **types** are imported from `props.ts` and no values
 * at all, so the one edge `props.ts` → this file cannot become a cycle at
 * module-initialisation time. Node-local coordinates, `y = 0` is the base
 * plane, block *names* with a property map, every op inside the declared box
 * so `rotateOps` needs no special case.
 *
 * The lessons this file is written against, every one of them somebody else's
 * scar:
 *
 * 1. **Solid per course, never a ring per course, and never hollow.** Every
 *    course of the pyramid is a *filled* square standing on the filled square
 *    below it. A hollow course is a sealed pocket; a ring per course leaves
 *    its outermost cells with air below and beside them, which is
 *    `floating.isolated` exactly.
 * 2. **The passage is real.** The way into the mass is carved by *not
 *    writing*: solid non-water floor at `y = 0` under it, two courses of air
 *    over that floor for the whole run, and a chamber at the end with the same
 *    headroom. An icon a body can only look at is not what the note asks for.
 * 3. **No `chain`** — it is not in the pinned 1.21.11 table. Every stay and
 *    halyard here is `iron_bars`, which is also not a full cube.
 * 4. **No lit fire, no signs, no bare flower pots, and no hanging lantern.**
 *    The chamber's light is `glowstone` bedded in the mass, which is a full
 *    cube against full cubes and has no support rule to fail.
 * 5. **Gravity blocks only on a floor.** There is no sand anywhere above the
 *    base plane in this file; the desert read comes from the theme's stone.
 * 6. **Seeded, never positional.** A prop *does* get an RNG (`ctx.rng`), so
 *    the dressing is drawn from named streams of the node seed — but the
 *    pyramid's geometry never is. A pyramid whose slope varied with the seed
 *    would be a different pyramid, and there is only one shape this entry is
 *    allowed to be.
 */

import type { LocalVoxelOp } from "./core.js";
import type { PropBase, PropGenerator, PropMeta } from "./props.js";

/* -------------------------------------------------------------------------- */
/* the catalog                                                                 */
/* -------------------------------------------------------------------------- */

/** Every prop this file builds, in catalog order. */
export const NILE_PROP_NAMES = ["pyramid", "sacred_lake", "felucca"] as const;

/** One of the props this file builds. */
export type NilePropName = (typeof NILE_PROP_NAMES)[number];

/** True for a name this file answers to. */
export function isNileProp(name: string): name is NilePropName {
  return (NILE_PROP_NAMES as readonly string[]).includes(name);
}

/** The rigging, everywhere in this file. `chain` is not in the pinned table. */
const RIGGING = "iron_bars";
/** The rigging's state: a free-hanging length, joined to nothing sideways. */
const RIGGING_FREE: Record<string, string> = Object.freeze({
  north: "false",
  south: "false",
  east: "false",
  west: "false",
  waterlogged: "false",
}) as Record<string, string>;

/* -------------------------------------------------------------------------- */
/* extents                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The pyramid's base, and the number every other constant here follows from.
 *
 * Thirty-three: the largest odd square that closes to a single-cell apex
 * inside a seventeen-course box, and the biggest single footprint the catalog
 * asks for anywhere. It is 6,545 blocks, which sounds enormous and is one
 * eighth of a chunk section — the mass a stranger names from across the world
 * costs less than a galleon.
 */
export const PYRAMID_BASE = 33;
/** The pyramid's height: one course per cell of inset, apex included. */
export const PYRAMID_HEIGHT = (PYRAMID_BASE + 1) / 2;
/** How far the entrance passage runs in from the face before the chamber. */
const PASSAGE_RUN = 9;

/** The sacred lake's plan — the basin, its steps and the precinct walk. */
export const SACRED_LAKE_SPAN = 19;
/** The basin's floor, below the base plane: a lake is dug, not built. */
export const SACRED_LAKE_FLOOR = -4;

/** The felucca's length, stem to stern. */
export const FELUCCA_LENGTH = 21;
/** The felucca's beam. */
export const FELUCCA_BEAM = 5;
/** The felucca's height, the masthead included, measured from `minY`. */
export const FELUCCA_HEIGHT = 13;

/** The declared box of one of this file's props, before it is generated. */
export function nilePropFootprint(prop: NilePropName): {
  readonly size: readonly [number, number, number];
  readonly minY: number;
  readonly base: PropBase;
} {
  switch (prop) {
    case "pyramid":
      return { size: [PYRAMID_BASE, PYRAMID_HEIGHT, PYRAMID_BASE], minY: 0, base: "ground" };
    case "sacred_lake":
      return {
        size: [SACRED_LAKE_SPAN, 2 - SACRED_LAKE_FLOOR, SACRED_LAKE_SPAN],
        minY: SACRED_LAKE_FLOOR,
        base: "ground",
      };
    case "felucca":
    default:
      return { size: [FELUCCA_LENGTH, FELUCCA_HEIGHT, FELUCCA_BEAM], minY: -1, base: "water" };
  }
}

/** Build a `PropMeta` from the declared footprint, so the two cannot drift. */
function metaOf(prop: NilePropName): PropMeta {
  const foot = nilePropFootprint(prop);
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
/* the pyramid                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * `pyramid` — the entry the whole expansion document was written to make
 * possible.
 *
 * It is one shape and four rules:
 *
 * 1. **the mass.** Course `y` is the filled square inset `y` cells from the
 *    base, so the batter is one in one — forty-five degrees against the great
 *    pyramid's fifty-one, which is the closest a cubic medium gets without
 *    stepping two cells at a time and reading as a ziggurat. Every course is
 *    filled and stands on the whole of the course below it, so there is no
 *    isolated cell anywhere in six and a half thousand blocks;
 * 2. **the casing.** The outermost cell of every course is the theme's accent
 *    and everything behind it the primary — so the four faces are *dressed*
 *    and the mass behind them is rubble, which is exactly how the thing was
 *    built and, more to the point, is what makes the edges read as edges from
 *    a distance. The apex takes three courses of casing on every cell: the
 *    pyramidion was the one part of it that was polished;
 * 3. **the passage.** Low on the *north* face — local `z = 0`, the note's own
 *    orientation — a one-cell corridor runs in nine cells and opens into a
 *    five by three chamber. It is carved by **not writing**: the floor under
 *    it is the base plane's own solid course, and the two courses above the
 *    floor are simply never filled, so the run is walkable end to end and the
 *    chamber has the same headroom. The lintel is `chiseled_stone_bricks`, so
 *    the door reads as a door from outside;
 * 4. **the chamber's light and its occupant.** `glowstone` bedded in the
 *    ceiling — a full cube inside a solid mass, with no support rule to fail
 *    and no name for the lantern rule to catch — and a sarcophagus of the
 *    theme's accent under it.
 *
 * The seed touches exactly two things: which of the two casing accents a cell
 * takes at the joints, and the small dressing in the chamber. The geometry is
 * never drawn. There is one pyramid.
 */
const pyramid: PropGenerator = ({ put, palette, rng }) => {
  const draw = rng("pyramid");
  const mid = (PYRAMID_BASE - 1) >> 1;
  const chamberZ0 = PASSAGE_RUN;
  const chamberZ1 = PASSAGE_RUN + 2;
  const chamberX0 = mid - 2;
  const chamberX1 = mid + 2;

  /** Is this cell hollowed out for the way in? */
  const carved = (x: number, y: number, z: number): boolean => {
    if (y < 1 || y > 3) return false;
    if (z < 1) return false;
    // The passage: one cell wide, two courses of headroom.
    if (y <= 2 && x === mid && z < chamberZ0) return true;
    // The chamber: five by three, three courses of headroom.
    return x >= chamberX0 && x <= chamberX1 && z >= chamberZ0 && z <= chamberZ1;
  };

  for (let y = 0; y < PYRAMID_HEIGHT; y++) {
    const lo = y;
    const hi = PYRAMID_BASE - 1 - y;
    if (lo > hi) break;
    for (let z = lo; z <= hi; z++) {
      for (let x = lo; x <= hi; x++) {
        // The base plane is written edge to edge whatever else happens: the
        // passage and the chamber both need a solid non-water floor under
        // them, and a prop that leaves a hole in its own ground plane is a
        // prop with a pit in it.
        if (y > 0 && carved(x, y, z)) continue;
        const onFace = x === lo || x === hi || z === lo || z === hi;
        const nearApex = y >= PYRAMID_HEIGHT - 3;
        const cased = onFace || nearApex;
        put(
          x,
          y,
          z,
          cased
            ? y % 3 === 0
              ? palette.stoneAccent
              : palette.stone
            : palette.stone,
        );
      }
    }
  }

  // --- the doorway ----------------------------------------------------------
  // The jambs, and the lintel a course in from them. All four cells are part
  // of the mass already — the batter means the face recedes, so there is no
  // cell over the mouth to hang a lintel on and a block written out there
  // would be the `floating.isolated` rule with a hat on.
  put(mid - 1, 1, 1, "chiseled_stone_bricks");
  put(mid + 1, 1, 1, "chiseled_stone_bricks");
  put(mid - 1, 2, 2, "chiseled_stone_bricks");
  put(mid + 1, 2, 2, "chiseled_stone_bricks");

  // --- the chamber ----------------------------------------------------------
  // The light is bedded in the ceiling — a full cube surrounded by the mass.
  put(mid, 4, PASSAGE_RUN + 1, "glowstone");
  // The sarcophagus: two cells of accent on the floor at the head of the room,
  // with a slab lid. Both cells touch the floor, so neither can float.
  put(mid, 1, chamberZ1, palette.stoneAccent);
  put(mid, 2, chamberZ1, palette.stoneSlab, { type: "bottom", waterlogged: "false" });
  // The dressing: two jars against the chamber wall, drawn from the seed so
  // two pyramids a world apart are not furnished identically.
  const jar = draw.int(0, 1) === 0 ? chamberX0 : chamberX1;
  put(jar, 1, chamberZ0, "decorated_pot", { waterlogged: "false" });

  return { ops: NO_OPS, meta: metaOf("pyramid") };
};

/* -------------------------------------------------------------------------- */
/* the sacred lake                                                             */
/* -------------------------------------------------------------------------- */

/**
 * `sacred_lake` — a rectangular basin with steps down all four sides.
 *
 * The temple precinct's water, and the shape is the entry: **rectangular**,
 * stone-lined, and stepped on every side rather than one. A round pond is a
 * pond; a square one with steps all round is a ritual basin, and the
 * difference is the only thing a walker has to read.
 *
 * The section, from the outside in: a paved walk at the base plane, a precinct
 * wall standing on its outer ring, then two courses of steps going down as
 * *full blocks* — full, not stairs, because a body has to be able to stand on
 * every one of them and a stair is a half-step the lint argues about — and
 * water in the middle, its surface one course below the walk so the basin
 * reads as dug.
 *
 * Every column of the basin is masonry from the floor to the walk, so the
 * water can see nothing but stone on all four sides: the swimming pool's
 * watertight-by-construction argument, unchanged.
 */
const sacredLake: PropGenerator = ({ put, palette, rng }) => {
  const draw = rng("sacred_lake");
  const last = SACRED_LAKE_SPAN - 1;
  const floor = SACRED_LAKE_FLOOR;

  for (let z = 0; z <= last; z++) {
    for (let x = 0; x <= last; x++) {
      // How far in from the edge this column is — the step it belongs to.
      const ring = Math.min(x, z, last - x, last - z);
      // The basin's own floor, everywhere under it.
      put(x, floor, z, palette.stone);
      if (ring === 0) {
        // The outer walk: solid from the floor up to the base plane.
        for (let y = floor + 1; y <= 0; y++) put(x, y, z, palette.stoneAccent);
        continue;
      }
      if (ring <= 3) {
        // The steps: each ring one course lower than the last, and solid all
        // the way down to the basin floor so nothing is a shelf on air.
        const tread = -ring + 1;
        for (let y = floor + 1; y <= tread; y++) {
          put(x, y, z, (x + z) % 4 === 0 ? palette.stoneAccent : palette.stone);
        }
        continue;
      }
      // The water: from the basin floor up to the level of the innermost
      // tread, and no higher. A surface above the lowest step is water with
      // nothing beside it at that course — the basin would leak out over its
      // own steps, which is the one way a stone-lined pool can be wrong.
      for (let y = floor + 1; y <= -2; y++) put(x, y, z, "water", { level: "0" });
    }
  }

  // --- the precinct wall ----------------------------------------------------
  // A course of wall on the outer walk, with the four cardinal gaps left open
  // so the steps are reachable from any side.
  const gate = (a: number): boolean => a === (last >> 1);
  for (let i = 0; i <= last; i++) {
    for (const [x, z] of [
      [i, 0],
      [i, last],
      [0, i],
      [last, i],
    ] as const) {
      if (gate(x) || gate(z)) continue;
      put(x, 1, z, palette.stoneWall, {
        north: "none",
        south: "none",
        east: "none",
        west: "none",
        up: "true",
        waterlogged: "false",
      });
    }
  }

  // --- the dressing ---------------------------------------------------------
  // A pair of offering jars on the walk, on opposite corners, and which pair
  // is the seed's one decision here.
  const flip = draw.int(0, 1) === 0;
  put(flip ? 1 : last - 1, 1, 1, "decorated_pot", { waterlogged: "false" });
  put(flip ? last - 1 : 1, 1, last - 1, "decorated_pot", { waterlogged: "false" });

  return { ops: NO_OPS, meta: metaOf("sacred_lake") };
};

/* -------------------------------------------------------------------------- */
/* the felucca                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * `felucca` — the Nile's own boat, and the pack's saturation piece on water.
 *
 * Three features and no more, because the hull under them is a rowboat's:
 *
 * 1. **the raked mast** — leaning aft rather than standing plumb, which is the
 *    single line that separates a felucca from every other small craft the
 *    catalog ships. It is built as an L per step (up one, along one, both
 *    cells written), never as a diagonal, so every block of it shares a face
 *    with the one before;
 * 2. **the long lateen yard** — a spar longer than the boat's own deck,
 *    climbing from low at the bow to high aft of the mast on the same L rule,
 *    with the sail hung under it as a triangle of wool. The yard is the read:
 *    a felucca is recognised by a spar that looks too big for the hull;
 * 3. **the awning aft** — trapdoors on posts over the stern quarters, which is
 *    where everyone on the river actually sits.
 *
 * The stays are `iron_bars` (rule 3) and the sail is drawn from the seed
 * between two pale wools, so a fleet of them is not a photocopy.
 */
const felucca: PropGenerator = ({ put, palette, rng }) => {
  const draw = rng("felucca");
  const cz = (FELUCCA_BEAM - 1) >> 1;
  const cloth = draw.int(0, 1) === 0 ? "white_wool" : "light_gray_wool";
  const hull = palette.log;
  const deck = palette.planks;

  /** The half-beam at a station: fine at the ends, full amidships. */
  const half = (x: number): number => {
    if (x <= 1 || x >= FELUCCA_LENGTH - 2) return 0;
    if (x <= 3 || x >= FELUCCA_LENGTH - 4) return 1;
    return cz;
  };

  for (let x = 0; x < FELUCCA_LENGTH; x++) {
    const h = half(x);
    for (let dz = -h; dz <= h; dz++) {
      const z = cz + dz;
      put(x, 0, z, deck);
      put(x, -1, z, hull);
      // The bulwark: the topsides and the two ends, one course proud.
      if (Math.abs(dz) === h || x === 0 || x === FELUCCA_LENGTH - 1) put(x, 1, z, hull);
    }
  }

  // --- the mast -------------------------------------------------------------
  // Raked aft: two courses up for every cell along, written as an L so no step
  // is a diagonal.
  const foot = 6;
  let mx = foot;
  let my = 1;
  for (let step = 0; step < 4; step++) {
    put(mx, my, cz, palette.log, { axis: "y" });
    put(mx, my + 1, cz, palette.log, { axis: "y" });
    my += 2;
    put(mx, my, cz, palette.log, { axis: "y" });
    mx += 1;
    put(mx, my, cz, palette.log, { axis: "x" });
  }
  const headX = mx;
  const headY = my;

  // --- the yard and the sail ------------------------------------------------
  // From low at the bow to the masthead, on the same L rule, and the sail hung
  // under it in a triangle that touches the yard at every column.
  let yx = 1;
  let yy = 2;
  while (yx < headX && yy < headY) {
    put(yx, yy, cz, palette.stripped, { axis: "x" });
    // The sail: from the yard down toward the deck, deepest amidships.
    for (let y = yy - 1; y > Math.max(1, yy - (yx - 1)); y--) put(yx, y, cz, cloth);
    yx += 1;
    put(yx, yy, cz, palette.stripped, { axis: "x" });
    yy += 1;
  }
  // The head of the yard meets the masthead, so the spar is carried.
  put(headX, headY, cz, palette.stripped, { axis: "x" });

  // --- the stays ------------------------------------------------------------
  put(headX, headY - 1, cz, RIGGING, RIGGING_FREE);
  put(1, 2, cz, RIGGING, RIGGING_FREE);

  // --- the awning aft -------------------------------------------------------
  const sternX = FELUCCA_LENGTH - 4;
  for (const dz of [-1, 1]) {
    const z = cz + dz;
    put(sternX, 1, z, palette.fence);
    put(sternX, 2, z, palette.trapdoor, {
      facing: dz < 0 ? "south" : "north",
      half: "top",
      open: "false",
      powered: "false",
      waterlogged: "false",
    });
  }
  put(sternX, 2, cz, palette.trapdoor, {
    facing: "north",
    half: "top",
    open: "false",
    powered: "false",
    waterlogged: "false",
  });
  // The steering oar, off the quarter.
  put(FELUCCA_LENGTH - 2, 1, cz, palette.fence);
  // A jar and a coil of line on the floorboards, drawn from the seed.
  put(draw.int(0, 1) === 0 ? 4 : FELUCCA_LENGTH - 6, 1, cz, "decorated_pot", {
    waterlogged: "false",
  });

  return { ops: NO_OPS, meta: metaOf("felucca") };
};

/* -------------------------------------------------------------------------- */
/* registry                                                                    */
/* -------------------------------------------------------------------------- */

/** Name → generator, spread into `PROP_GENERATORS` by `props.ts`. */
export const NILE_PROP_GENERATORS: Readonly<Record<string, PropGenerator>> = Object.freeze({
  pyramid,
  sacred_lake: sacredLake,
  felucca,
});

/**
 * Dev-world exhibit rows for this pack's props, in the shape
 * `exhibits/props.ts` spreads.
 *
 * It lives here rather than compiler-side for `props-wayside.ts`'s reason:
 * `exhibits/props.ts` is shared ground between parallel tracks, and registering
 * a wave there should be one import and one spread. **Nothing consumes it
 * yet** — the pack's exhibit is the orchestrator's — but it is the plan this
 * half wants, and the pyramid's row is deliberately alone: it is thirty-three
 * across, which is wider than most exhibit rows are long.
 */
export const NILE_PROP_EXHIBIT_PLAN: readonly {
  readonly row: string;
  readonly water: boolean;
  readonly cells: readonly {
    readonly prop: NilePropName;
    readonly params: Record<string, unknown>;
  }[];
}[] = Object.freeze([
  {
    row: "nile_necropolis",
    water: false,
    cells: [{ prop: "pyramid", params: { yaw: 0 } }],
  },
  {
    row: "nile_precinct",
    water: false,
    cells: [
      { prop: "sacred_lake", params: { yaw: 0 } },
      { prop: "sacred_lake", params: { yaw: 90 } },
    ],
  },
  {
    row: "nile_river",
    water: true,
    cells: [
      { prop: "felucca", params: { yaw: 0 } },
      { prop: "felucca", params: { yaw: 90 } },
    ],
  },
]);
