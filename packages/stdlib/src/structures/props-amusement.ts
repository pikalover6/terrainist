/**
 * `prop.place@0` — the fairground wave: four amusements to stand beside the
 * carousel.
 *
 * The same leaf discipline as `props-blitz.ts`: **types** are imported from
 * `props.ts` and no values at all, so the one edge `props.ts` → this file
 * cannot become a cycle at module-initialisation time. Node-local coordinates,
 * `y = 0` is the base plane, block names not state ids, every op inside the
 * declared box so `rotateOps` needs no special case.
 *
 * ## Support, in the terms the lint actually uses
 *
 * `packages/compiler/src/emit/physics.ts` asks two different questions:
 *
 * - anything matching its `NEEDS_GROUND` set — fences, walls, carpets,
 *   torches, standing lanterns, potted plants — must have a chain of such
 *   blocks reaching something solid **below** it (`groundedChain`);
 * - a **hanging** lantern must have a chain reaching something solid **above**
 *   it (`hungChain`), where a chain block, a fence, a wall, a full cube or the
 *   flush underside of a bottom slab or stair all count as an anchor.
 *
 * Slabs and stairs are held to a much weaker rule — `floating.slab` fires only
 * when a half block has air on every side of it — which is what makes the
 * swing boats legal: each seat is a stair or a slab with a `chain` above it,
 * and every chain link runs unbroken up to the crossbar. So the seats really
 * do hang; they did not have to be put back on posts.
 *
 * No signs (the standing-sign rule and the wall-sign rule are both easy to get
 * wrong at yaw, and a banner reads better anyway), and no open fluids.
 */

import type { LocalVoxelOp } from "./core.js";
import { definePropDescriptors, type PropDescriptor } from "./descriptor.js";
import type { PropBase, PropGenerator, PropMeta } from "./props.js";

/* -------------------------------------------------------------------------- */
/* the catalog                                                                 */
/* -------------------------------------------------------------------------- */

/** Every prop this file builds, in catalog order. */
export const AMUSEMENT_PROP_NAMES = [
  "fairground_stall",
  "ticket_booth",
  "prize_wheel",
  "swing_boats",
] as const;

/** One of the props this file builds. */
export type AmusementPropName = (typeof AMUSEMENT_PROP_NAMES)[number];

/** True for a name this file answers to. */
export function isAmusementProp(name: string): name is AmusementPropName {
  return (AMUSEMENT_PROP_NAMES as readonly string[]).includes(name);
}

/* -------------------------------------------------------------------------- */
/* extents                                                                     */
/* -------------------------------------------------------------------------- */

/** Fairground stall: a five-wide counter under a striped awning. */
const STALL_W = 5;
/** Fairground stall depth: counter, standing room, back shelf. */
const STALL_D = 3;
/** Prize wheel span — the disc is `WHEEL_SPAN` across in x and in y. */
const WHEEL_SPAN = 7;
/** Swing boats span, in x: post, boat, gap, boat, post. */
const SWING_W = 7;
/** Swing boats depth: the A-frames' feet splay one either side of the mast. */
const SWING_D = 3;

/** The declared box of one of this file's props, before it is generated. */
export function amusementPropFootprint(prop: AmusementPropName): {
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
    case "fairground_stall":
      return ground([STALL_W, 6, STALL_D]);
    case "ticket_booth":
      return ground([3, 5, 3]);
    case "prize_wheel":
      return ground([1, WHEEL_SPAN + 3, WHEEL_SPAN]);
    case "swing_boats":
    default:
      return ground([SWING_W, 7, SWING_D]);
  }
}

/** Build a `PropMeta` from the declared footprint, so the two cannot drift. */
function metaOf(prop: AmusementPropName): PropMeta {
  const foot = amusementPropFootprint(prop);
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

/**
 * The fairground's two-colour stripe, keyed by position.
 *
 * Deterministic by construction — a pure function of the cell — so a re-run is
 * byte-identical and a rotation is still a stripe.
 */
function stripe(i: number): string {
  return i % 2 === 0 ? "red_wool" : "white_wool";
}

/** The same stripe in concrete, for the roofs that want a harder edge. */
function stripeConcrete(i: number): string {
  return i % 2 === 0 ? "yellow_concrete" : "light_blue_concrete";
}

/* -------------------------------------------------------------------------- */
/* the props                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * `fairground_stall` — the market-stall idiom, freestanding and in fair colours.
 *
 * Four corner posts, a counter across the front, a shelf of prizes at the back
 * and a striped awning over the lot. The awning is wool laid flat on the post
 * heads, so every course of it either rests on a post or on the wool beside it;
 * the front lip is a course of bottom slabs whose underside is what the two
 * hanging lanterns hang from.
 */
const fairgroundStall: PropGenerator = ({ put, palette }) => {
  const w = STALL_W;
  const d = STALL_D;

  // --- posts ---------------------------------------------------------------
  for (const [x, z] of [
    [0, 0],
    [w - 1, 0],
    [0, d - 1],
    [w - 1, d - 1],
  ] as const) {
    for (let y = 0; y <= 2; y++) put(x, y, z, palette.log, { axis: "y" });
  }

  // --- the counter ---------------------------------------------------------
  // A course of planks across the front with a slab lip: the surface a
  // customer leans on, and the thing that makes it a stall and not a shed.
  for (let x = 1; x < w - 1; x++) {
    put(x, 0, 0, palette.planks);
    put(x, 1, 0, palette.slab, { type: "bottom", waterlogged: "false" });
  }

  // --- the prize shelf -----------------------------------------------------
  // Back wall, waist high, with the wares on top of it. Every one of them
  // rests on the plank course below, so the support chain is one link long.
  for (let x = 0; x < w; x++) put(x, 0, d - 1, palette.planks);
  for (let x = 1; x < w - 1; x++) {
    put(x, 1, d - 1, palette.planks);
    put(x, 2, d - 1, x % 2 === 0 ? "hay_block" : palette.cargo);
  }

  // --- the awning ----------------------------------------------------------
  // Wool on the post heads, striped along x; the front row is slabs so the
  // lanterns have a flush underside to hang from.
  for (let x = 0; x < w; x++) {
    for (let z = 1; z < d; z++) put(x, 3, z, stripe(x));
    put(x, 3, 0, palette.roofSlab, { type: "bottom", waterlogged: "false" });
    put(x, 4, z0OfRidge(d), stripe(x + 1));
  }
  put(1, 2, 0, palette.lantern, { hanging: "true" });
  put(w - 2, 2, 0, palette.lantern, { hanging: "true" });

  // --- the flag ------------------------------------------------------------
  // A banner on the ridge, not a sign: it stands on the wool under it.
  put((w - 1) / 2, 5, z0OfRidge(d), "red_banner", { rotation: "8" });

  return { ops: NO_OPS, meta: metaOf("fairground_stall") };
};

/** The z of the stall's ridge course — the middle of the awning. */
function z0OfRidge(d: number): number {
  return Math.floor(d / 2);
}

/**
 * `ticket_booth` — a one-cell kiosk with a window and a till.
 *
 * Three by three on the ground, hollow in the middle, a hole in the front wall
 * at head height for the window and a barrel inside for the takings. The roof
 * oversails on slabs; the lantern under the sill hangs from the wall above it.
 */
const ticketBooth: PropGenerator = ({ put, palette }) => {
  const span = 3;
  const c = 1;

  // --- the shell -----------------------------------------------------------
  for (let x = 0; x < span; x++) {
    for (let z = 0; z < span; z++) {
      put(x, 0, z, palette.stone);
      if (x === c && z === c) continue; // the one cell you stand in
      for (let y = 1; y <= 2; y++) {
        // The window: the middle of the south wall, upper course only.
        if (z === 0 && x === c && y === 2) continue;
        put(x, y, z, x === c || z === c ? palette.planks : palette.log, { axis: "y" });
      }
    }
  }
  // The sill, and the counter it makes.
  put(c, 1, 0, palette.slab, { type: "top", waterlogged: "false" });
  put(c, 1, c, "barrel", { facing: "up", open: "false" });
  // The kiosk's light, hung from the underside of the roof cap above it. It is
  // inside, not in the window: a lantern in the window gap is a lantern where
  // the customer's head goes.
  put(c, 2, c, palette.lantern, { hanging: "true" });

  // --- the roof ------------------------------------------------------------
  // A flat cap with a slab oversail all round: nothing here floats, because
  // the cap rests on the wall head and the oversail rests beside the cap.
  for (let x = 0; x < span; x++) {
    for (let z = 0; z < span; z++) put(x, 3, z, stripeConcrete(x + z));
  }
  for (let x = 0; x < span; x++) {
    put(x, 4, 0, palette.roofSlab, { type: "bottom", waterlogged: "false" });
    put(x, 4, span - 1, palette.roofSlab, { type: "bottom", waterlogged: "false" });
  }
  put(c, 4, c, "white_banner", { rotation: "0" });

  return { ops: NO_OPS, meta: metaOf("ticket_booth") };
};

/**
 * `prize_wheel` — a standing wheel of fortune.
 *
 * A post up the middle and a disc of alternating colour built out from it in
 * the z/y plane. The disc's blocks are full cubes, which the lint holds to no
 * support rule at all; the *post* is what makes it read as supported, and
 * every disc cell is within the octagon centred on the post head, so the thing
 * cannot be mistaken for a floating billboard. A trapdoor at the top is the
 * pointer that says which way it is meant to spin.
 */
const prizeWheel: PropGenerator = ({ put, palette }) => {
  const span = WHEEL_SPAN;
  const r = (span - 1) / 2;
  const cz = r;
  // The post: from the ground to the hub, so the disc has something under it.
  const hub = r + 2;
  for (let y = 0; y <= hub; y++) put(0, y, cz, palette.log, { axis: "y" });

  // The disc: an octagon in the z/y plane, alternating around the rim.
  for (let dz = -r; dz <= r; dz++) {
    for (let dy = -r; dy <= r; dy++) {
      if (Math.abs(dz) + Math.abs(dy) > r + 1) continue;
      if (dz === 0 && dy === 0) continue; // the hub is the post
      const y = hub + dy;
      if (y < 1) continue; // never below the sill of the post
      put(0, y, cz + dz, stripe(dz + dy));
    }
  }
  // The pointer: a trapdoor over the top of the disc, and two lamps at the hub.
  put(0, hub + r + 1, cz, palette.trapdoor, {
    facing: "south",
    half: "top",
    open: "false",
    waterlogged: "false",
  });
  put(0, hub, cz - 1, "glowstone");
  put(0, hub, cz + 1, "glowstone");

  return { ops: NO_OPS, meta: metaOf("prize_wheel") };
};

/**
 * `swing_boats` — a pair of A-frames with two boats hung from the crossbar.
 *
 * The frames are fence posts splayed one cell either side of the mast, the
 * crossbar is a run of fence across their heads, and each boat hangs on two
 * `chain` links from the bar down to a stair-and-slab hull. Read against the
 * lint: the fences are `NEEDS_GROUND`, and every one of them reaches the
 * ground through the frame; the chains are not, and the hull's stairs and
 * slabs pass `floating.*` because the chain sits directly above them. The
 * seats therefore hang, as a swing boat should.
 */
const swingBoats: PropGenerator = ({ put, palette }) => {
  const w = SWING_W;
  const d = SWING_D;
  const cz = (d - 1) / 2;
  const barY = 5;

  // --- the two A-frames ----------------------------------------------------
  for (const x of [0, w - 1] as const) {
    for (let y = 0; y < barY; y++) put(x, y, cz, palette.fence);
    // The splayed feet: a leg either side, leaning in to the mast.
    for (const dz of [-1, 1] as const) {
      put(x, 0, cz + dz, palette.fence);
      put(x, 1, cz + dz, palette.fence);
    }
  }

  // --- the crossbar --------------------------------------------------------
  // A log, not a fence: `physics.ts` grounds a fence either straight down or
  // by bracing it sideways against something **solid**, and a fence spanning
  // between two fence masts is neither. A log run is a full cube, which the
  // support rules do not police at all, and it reads as the beam it is.
  for (let x = 0; x < w; x++) put(x, barY, cz, palette.log, { axis: "x" });

  // --- the boats -----------------------------------------------------------
  // Two hanger links each, then a hull: a bottom slab for the floor with a
  // stair at each end for the gunwales, all of it directly under the links.
  // Iron bars, not `chain`: the prismarine block table for 1.21.11 has no
  // `chain` entry at all (verified — `blockByName("chain")` is undefined), so
  // a chain op is silently dropped with a BAD_PALETTE diagnostic. Bars carry
  // the same read and the support rules police neither.
  for (const x of [2, w - 3] as const) {
    for (let y = barY - 2; y <= barY - 1; y++) put(x, y, cz, "iron_bars");
    put(x, barY - 3, cz, palette.slab, { type: "top", waterlogged: "false" });
    for (const dz of [-1, 1] as const) {
      put(x, barY - 3, cz + dz, palette.stairs, {
        facing: dz < 0 ? "south" : "north",
        half: "top",
        shape: "straight",
      });
    }
  }

  // The bunting: a banner on each mast head, standing on the fence below it.
  for (const x of [0, w - 1] as const) put(x, barY + 1, cz, stripeBanner(x));

  return { ops: NO_OPS, meta: metaOf("swing_boats") };
};

/** A banner in the fair's two colours. */
function stripeBanner(i: number): string {
  return i % 2 === 0 ? "red_banner" : "white_banner";
}

/* -------------------------------------------------------------------------- */
/* registry                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Name → generator, spread into `PROP_GENERATORS` by `props.ts`.
 *
 * Adding a prop is one entry here and one name in
 * {@link AMUSEMENT_PROP_NAMES}; the catalog test holds the two together.
 */
const AMUSEMENT_PROP_GENERATORS: Readonly<Record<string, PropGenerator>> = Object.freeze({
  fairground_stall: fairgroundStall,
  ticket_booth: ticketBooth,
  prize_wheel: prizeWheel,
  swing_boats: swingBoats,
});

/* -------------------------------------------------------------------------- */
/* descriptors — Phase 4 registry seam (additive, no self-registration)        */
/* -------------------------------------------------------------------------- */

/**
 * Ordered prop descriptors for this leaf pack, in {@link AMUSEMENT_PROP_NAMES}
 * catalog order. Each row delegates to the existing footprint function and
 * generator handle so realization (seeded draws, LocalVoxelOp order) stays in
 * the leaf.
 *
 * Param-dependent footprint remains a function — this pack has none today, so
 * the wrapper accepts `params` and delegates without forwarding, preserving the
 * `PropDescriptor` footprint signature.
 *
 * Preserved for central cutover — existing `AMUSEMENT_PROP_NAMES` /
 * `AMUSEMENT_PROP_GENERATORS` / `amusementPropFootprint` remain the source of
 * truth until the central aggregator migrates.
 */
export const AMUSEMENT_PROP_DESCRIPTORS: readonly PropDescriptor[] = definePropDescriptors(AMUSEMENT_PROP_NAMES, {
  footprint: (id, _params) => amusementPropFootprint(id),
  generator: AMUSEMENT_PROP_GENERATORS,
});
