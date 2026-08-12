/**
 * `prop.place@0` — the classical Mediterranean pack's prop half, first slice.
 *
 * One prop: the **hippodrome spina**, the barrier down the middle of a
 * racecourse. It is in the pack for the reason the whole pack exists — a
 * racecourse is a *shape*, and without the spina a hippodrome is a field with
 * a fence round it — and it is a prop rather than a building because there is
 * nothing to go inside it.
 *
 * The contract is `props.ts`'s, unchanged, and the leaf discipline is
 * `props-wayside.ts`'s: **types** are imported from `props.ts` and no values at
 * all, so the one edge `props.ts` → this file cannot become a cycle at
 * module-initialisation time. Node-local coordinates, `y = 0` is the base
 * plane, block *names* with a property map, every op inside the declared box so
 * `rotateOps` needs no special case.
 *
 * The lessons this file is written against, all of them somebody else's scars:
 *
 * 1. **Support closure.** Every block rests on the base plane or on another of
 *    this prop's own blocks. The turning posts are solid columns from the
 *    plinth and the obelisk closes on a solid cap, so nothing anywhere has six
 *    air faces.
 * 2. **A cone closes on a SOLID cap** — the obelisk's pyramidion is a shrinking
 *    solid, never a ring with a hole at the apex.
 * 3. **No sign blocks**, no `chain`, no open fluids, and no lit fire.
 */

import type { LocalVoxelOp } from "./core.js";
import type { PropBase, PropGenerator, PropMeta } from "./props.js";

/* -------------------------------------------------------------------------- */
/* the catalog                                                                 */
/* -------------------------------------------------------------------------- */

/** Every prop this file builds, in catalog order. */
export const CLASSICAL_PROP_NAMES = ["hippodrome_spina"] as const;

/** One of the props this file builds. */
export type ClassicalPropName = (typeof CLASSICAL_PROP_NAMES)[number];

/** True for a name this file answers to. */
export function isClassicalProp(name: string): name is ClassicalPropName {
  return (CLASSICAL_PROP_NAMES as readonly string[]).includes(name);
}

/* -------------------------------------------------------------------------- */
/* extents                                                                     */
/* -------------------------------------------------------------------------- */

/** The spina's length along z — the run it is measured by. */
export const SPINA_LENGTH = 23;
/** The spina's width: a plinth three wide, which is what a barrier needs. */
export const SPINA_WIDTH = 3;
/** Height of the turning post (meta) at each end, over the plinth. */
export const SPINA_META_HEIGHT = 4;
/** Height of the obelisk standing on the middle of the plinth. */
export const SPINA_OBELISK_HEIGHT = 7;

/** The declared box of one of this file's props, before it is generated. */
export function classicalPropFootprint(_prop: ClassicalPropName): {
  readonly size: readonly [number, number, number];
  readonly minY: number;
  readonly base: PropBase;
} {
  return {
    size: [SPINA_WIDTH, SPINA_OBELISK_HEIGHT + 3, SPINA_LENGTH],
    minY: 0,
    base: "ground",
  };
}

/** Build a `PropMeta` from the declared footprint, so the two cannot drift. */
function metaOf(prop: ClassicalPropName): PropMeta {
  const foot = classicalPropFootprint(prop);
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
/* the spina                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * `hippodrome_spina` — the racecourse's central barrier.
 *
 * A long low plinth of dressed stone with a slab kerb down both flanks, a
 * **turning post** standing at each end — three tapering courses closing on a
 * cap, the *meta* a chariot swings round — and an **obelisk** on the middle of
 * the run, banded, brought to a point on a solid pyramidion. Between them, two
 * lap markers: dolphin-and-egg stands, here a plinth with a cauldron on it,
 * which is the closest a block palette gets and reads at a glance as "there is
 * furniture on this barrier".
 *
 * Everything is symmetric about the long axis and derived from the constants
 * above, so lengthening the run is one number.
 */
const hippodromeSpina: PropGenerator = ({ put, palette }) => {
  const stone = palette.stoneAccent;
  const plain = palette.stone;
  const slabBlock = palette.stoneSlab;
  const mid = (SPINA_WIDTH - 1) >> 1;
  const banded = (y: number): string => (y % 3 === 0 ? plain : stone);

  // --- the plinth ----------------------------------------------------------
  for (let z = 0; z < SPINA_LENGTH; z++) {
    for (let x = 0; x < SPINA_WIDTH; x++) put(x, 0, z, (x + z) % 5 === 0 ? plain : stone);
    // The kerb: a slab lip down both flanks, standing on the plinth course.
    for (const x of [0, SPINA_WIDTH - 1]) {
      put(x, 1, z, slabBlock, { type: "bottom", waterlogged: "false" });
    }
  }

  // --- the two metae -------------------------------------------------------
  // A turning post is three cones on one base in the real thing; at this scale
  // it is one tapering column per end, and the taper is what stops it reading
  // as a fence post.
  for (const z of [1, SPINA_LENGTH - 2]) {
    for (let y = 1; y <= SPINA_META_HEIGHT; y++) {
      put(mid, y, z, banded(y));
      // The lower courses are three wide, so the post has a plinth of its own.
      if (y <= 1) {
        put(mid - 1, y, z, stone);
        put(mid + 1, y, z, stone);
      }
    }
    put(mid, SPINA_META_HEIGHT + 1, z, "chiseled_stone_bricks");
  }

  // --- the obelisk on the middle of the run --------------------------------
  const cz = (SPINA_LENGTH - 1) >> 1;
  for (let y = 1; y <= SPINA_OBELISK_HEIGHT; y++) put(mid, y, cz, banded(y));
  // The pyramidion: a solid cap, then the point. A ring cap would leave the
  // apex joined to nothing.
  put(mid, SPINA_OBELISK_HEIGHT + 1, cz, "chiseled_stone_bricks");
  put(mid, SPINA_OBELISK_HEIGHT + 2, cz, "end_rod", { facing: "up" });
  // Its own base, one course wider on all four sides.
  for (const [dx, dz] of [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ] as const) {
    put(mid + dx, 1, cz + dz, stone);
  }

  // --- the lap markers -----------------------------------------------------
  // Quarter and three-quarter points, clear of both metae and the obelisk.
  for (const z of [cz - Math.floor(SPINA_LENGTH / 4), cz + Math.floor(SPINA_LENGTH / 4)]) {
    if (z <= 2 || z >= SPINA_LENGTH - 3) continue;
    put(mid, 1, z, stone);
    put(mid, 2, z, "cauldron", { level: "0" });
  }

  return { ops: NO_OPS, meta: metaOf("hippodrome_spina") };
};

/* -------------------------------------------------------------------------- */
/* registry                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Name → generator, spread into `PROP_GENERATORS` by `props.ts`.
 */
export const CLASSICAL_PROP_GENERATORS: Readonly<Record<string, PropGenerator>> = Object.freeze({
  hippodrome_spina: hippodromeSpina,
});

/**
 * Dev-world exhibit rows for this pack's props, in the shape
 * `exhibits/props.ts` spreads.
 *
 * It lives here rather than compiler-side for `props-wayside.ts`'s reason:
 * `exhibits/props.ts` is shared ground between parallel tracks, and registering
 * a wave there should be one import and one spread. Both yaws are shown,
 * because the spina is the most asymmetric prop in the catalog along one axis
 * and a rotation that failed to take would be invisible at yaw 0.
 */
// Named with the `_A_` infix because the pack's other half exports a plan of
// its own and two star-exported `CLASSICAL_PROP_EXHIBIT_PLAN`s would be
// ambiguous — ESM drops an ambiguous star re-export silently.
export const CLASSICAL_A_PROP_EXHIBIT_PLAN: readonly {
  readonly row: string;
  readonly water: boolean;
  readonly cells: readonly {
    readonly prop: ClassicalPropName;
    readonly params: Record<string, unknown>;
  }[];
}[] = Object.freeze([
  {
    row: "classical_course",
    water: false,
    cells: [
      { prop: "hippodrome_spina", params: { yaw: 0 } },
      { prop: "hippodrome_spina", params: { yaw: 90 } },
    ],
  },
]);
