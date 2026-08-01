/**
 * `prop.place@0` — wave 6D: spectacle and oddities, the prop half.
 *
 * Five props the fair, the park and the far end of a fantasy world are made
 * of: a **ferris wheel** big enough to be a landmark, a **bandstand**, a
 * **memorial garden** compound, a **portal frame**, and a **floating
 * platform** that reads as if it hangs in the air and is nevertheless legal.
 *
 * The contract is `props.ts`'s, unchanged, and the leaf discipline is
 * `props-wayside.ts`'s: **types** are imported from `props.ts` and no values at
 * all, so the one edge `props.ts` → this file cannot become a cycle at
 * module-initialisation time. Node-local coordinates, `y = 0` is the base
 * plane, block *names* with a property map, every op inside the declared box so
 * `rotateOps` needs no special case.
 *
 * ## The lesson block, as it applies to props
 *
 * 1. **Support closure.** Every block rests on the base plane, rests on
 *    another of this prop's own blocks, or hangs under one. `physics.ts` walks
 *    `NEEDS_GROUND` (fences, walls, carpets, pressure plates, campfires,
 *    standing lanterns) *down* to something solid and `hungChain` *up* from a
 *    hanging lantern; `floating.*` polices a half block with six air faces.
 *    `props-spectacle.test.ts` re-walks all three at yaw 0, plus the stronger
 *    "no full cube floats free of the prop" reading the wayside wave adopted.
 * 2. **No `chain`.** The pinned 1.21.11 block table has no `chain` entry, so a
 *    `chain` op is silently dropped with a BAD_PALETTE diagnostic. `iron_bars`
 *    carries the same read and the support rules police neither. The ferris
 *    wheel's gondola links and the floating platform's veil are both bars.
 * 3. **No sign blocks** — a sign is a block entity the op stream cannot carry.
 *    Signage is a banner.
 * 4. **No open fluids**, and no `mud`. Nothing here holds water.
 * 5. **A cone closes on a SOLID cap.** The bandstand's roof ends in one full
 *    block with the finial standing on it, never a ring with a hole at the
 *    apex — a ring cap leaves the apex cells joined to nothing.
 * 6. **Torches only on full blocks**; this file places none at all.
 *
 * ## Two idioms worth naming
 *
 * - the **wheel read** (the ferris wheel) is the prize wheel's, three sizes up
 *   and with the centre post deleted. A ground-mounted wheel cannot have a post
 *   under its hub — the rim's own bottom passes through that column — so the
 *   axle is carried from the *sides* by two A-frames, which is what a real
 *   ferris wheel does and what makes the silhouette read at all;
 * - the **disguised stem** (the floating platform) is the one honest way to
 *   build a floating island in a grammar whose lint refuses floating blocks: a
 *   real column carries the disc, and everything about the column that could
 *   be mistaken for masonry — its width, its material, its edges — is veiled
 *   with `iron_bars` and end stone so the eye reads a wisp rather than a pier.
 */

import type { LocalVoxelOp } from "./core.js";
import type { PropBase, PropGenerator, PropMeta } from "./props.js";

/* -------------------------------------------------------------------------- */
/* the catalog                                                                 */
/* -------------------------------------------------------------------------- */

/** Every prop this file builds, in catalog order. */
export const SPECTACLE_PROP_NAMES = [
  "ferris_wheel",
  "bandstand",
  "memorial_garden",
  "portal_frame",
  "floating_platform",
] as const;

/** One of the props this file builds. */
export type SpectaclePropName = (typeof SPECTACLE_PROP_NAMES)[number];

/** True for a name this file answers to. */
export function isSpectacleProp(name: string): name is SpectaclePropName {
  return (SPECTACLE_PROP_NAMES as readonly string[]).includes(name);
}

/* -------------------------------------------------------------------------- */
/* extents                                                                     */
/* -------------------------------------------------------------------------- */

/** Ferris wheel rim radius, in blocks, measured from the hub. */
export const FERRIS_RADIUS = 6;
/** Y of the ferris wheel's hub — the axle, and the top of both A-frames. */
export const FERRIS_HUB = 8;
/** Ferris wheel span in z: the rim's diameter plus its two end columns. */
export const FERRIS_SPAN = FERRIS_RADIUS * 2 + 1;
/** Bandstand span, in x and z — an octagon inscribed in this square. */
export const BANDSTAND_SPAN = 9;
/** Memorial garden span, in x and z. */
export const GARDEN_SPAN = 9;
/** Floating platform span, in x and z — the disc, at its widest. */
export const FLOAT_SPAN = 7;
/** Y the floating platform's disc is drawn at: the whole point of the prop. */
export const FLOAT_DECK = 5;

/** The declared box of one of this file's props, before it is generated. */
export function spectaclePropFootprint(prop: SpectaclePropName): {
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
    case "ferris_wheel":
      // Three columns in x — the two A-frame planes and the wheel between them
      // — and the full diameter in z. The banner over the hub is the top course.
      return ground([3, FERRIS_HUB + FERRIS_RADIUS + 2, FERRIS_SPAN]);
    case "bandstand":
      return ground([BANDSTAND_SPAN, 10, BANDSTAND_SPAN]);
    case "memorial_garden":
      return ground([GARDEN_SPAN, 5, GARDEN_SPAN]);
    case "portal_frame":
      return ground([4, 6, 3]);
    case "floating_platform":
    default:
      return ground([FLOAT_SPAN, FLOAT_DECK + 3, FLOAT_SPAN]);
  }
}

/** Build a `PropMeta` from the declared footprint, so the two cannot drift. */
function metaOf(prop: SpectaclePropName): PropMeta {
  const foot = spectaclePropFootprint(prop);
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

/** The fair's two-colour stripe in wool, keyed by position. */
function stripe(i: number): string {
  return ((i % 2) + 2) % 2 === 0 ? "red_wool" : "white_wool";
}

/** Banner colours, in draw order. */
export const SPECTACLE_BANNERS: readonly string[] = Object.freeze([
  "red_banner",
  "yellow_banner",
  "blue_banner",
  "white_banner",
  "green_banner",
]);

/* -------------------------------------------------------------------------- */
/* the wheel                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * True on the ferris wheel's rim band, in offsets from the hub.
 *
 * The midpoint band `R² − R ≤ d² ≤ R² + R`, which is the standard integer
 * annulus and — unlike a one-thick digital circle — is **4-connected** all the
 * way round. That matters here and nowhere else: the support test walks face
 * neighbours, so a rim whose cells only touch at their corners is a ring of
 * blocks that each float free of the prop.
 */
export function onFerrisRim(dz: number, dy: number): boolean {
  const d2 = dz * dz + dy * dy;
  const r = FERRIS_RADIUS;
  return d2 >= r * r - r && d2 <= r * r + r;
}

/**
 * True on one of the wheel's four spokes.
 *
 * **The spokes run on the axes, not on the diagonals**, and that is a
 * correctness matter rather than a taste one: a diagonal run of cells touches
 * only at its corners, so a diagonal spoke is a line of blocks each of which
 * floats free of the prop by the face-neighbour reading the support test uses.
 * An axis spoke is an unbroken face-connected chain from the hub out to the
 * rim band, which is what a spoke has to be.
 */
function onFerrisSpoke(dz: number, dy: number): boolean {
  if (dz === 0 && dy === 0) return false;
  if (dz !== 0 && dy !== 0) return false;
  return dz * dz + dy * dy < FERRIS_RADIUS * FERRIS_RADIUS - FERRIS_RADIUS;
}

/**
 * Where the gondolas hang, as offsets from the hub.
 *
 * Each is a cell **outside** the rim band whose neighbour directly *above* is
 * on the rim: the link therefore hangs from the wheel rather than beside it,
 * and the box below the link is one further step down. The axis positions are
 * deliberately absent — `dz = 0` is the column the wheel's own bottom occupies,
 * and a car in it would be a car inside the rim.
 */
const FERRIS_CARS: readonly (readonly [number, number])[] = Object.freeze([
  [-5, -5],
  [-3, -6],
  [3, -6],
  [5, -5],
] as const);

/**
 * `ferris_wheel` — the big one.
 *
 * Two A-frames of logs splayed three cells either side of the hub carry a log
 * **axle** across the top; the wheel itself is drawn in the z/y plane on the
 * frames' centre column, as a trapdoor-and-wool rim on four diagonal spokes.
 * Four gondolas hang under the lower arc on `iron_bars` links.
 *
 * **Why there is no centre post.** The prize wheel stands on one, and it can:
 * its disc is small enough that its lowest cell is the post head. Scale the
 * disc up and the rim's own bottom cell lands *in* the post's column, so a
 * ground-mounted wheel with a post under its hub is a wheel with a pole through
 * its rim. The A-frames carry the axle from the sides, and every leg reaches
 * the base plane through an unbroken run of logs — including at the three
 * courses where the leg steps inward, where the step cell is written too so no
 * two frame blocks touch only at a corner.
 *
 * Read against the lint: the rim, the spokes and the frames are full cubes,
 * which the support rules do not police at all — but each is face-joined to the
 * body anyway, which is the stronger reading the wayside wave adopted and the
 * one the test enforces. The gondola boxes are bottom slabs with a bar directly
 * above them, so `floating.slab` (a half block with air on six faces) cannot
 * fire.
 */
const ferrisWheel: PropGenerator = (ctx) => {
  const { put, palette } = ctx;
  const r = FERRIS_RADIUS;
  const hub = FERRIS_HUB;
  const cz = r;
  const cx = 1;

  // --- the wheel -----------------------------------------------------------
  for (let dz = -r; dz <= r; dz++) {
    for (let dy = -r; dy <= r; dy++) {
      const y = hub + dy;
      if (y < 0) continue;
      const z = cz + dz;
      if (onFerrisRim(dz, dy)) {
        // The rim alternates trapdoor plating and wool, which at a distance is
        // the lattice-and-panel read a wheel has. The trapdoors are laid flat
        // on the wheel's own plane, so they never stick out of the box in x.
        if (((dz + dy) % 2 + 2) % 2 === 0) {
          put(cx, y, z, palette.trapdoor, {
            facing: "north",
            half: "top",
            open: "false",
            powered: "false",
            waterlogged: "false",
          });
        } else {
          put(cx, y, z, stripe(dz + dy));
        }
        continue;
      }
      if (onFerrisSpoke(dz, dy)) put(cx, y, z, palette.stripped, { axis: "y" });
    }
  }
  // --- the gondolas --------------------------------------------------------
  // Written **before** the frames on purpose: a car's side plate on a frame
  // plane can land in a leg's own column, and a leg with a trapdoor punched
  // into it no longer reaches the ground. Later ops win, so drawing the frames
  // afterwards means the leg always survives and only the plate is lost.
  for (const [dz, dy] of FERRIS_CARS) {
    const z = cz + dz;
    const linkY = hub + dy;
    const boxY = linkY - 1;
    put(cx, linkY, z, "iron_bars");
    put(cx, boxY, z, palette.slab, { type: "bottom", waterlogged: "false" });
    // The car's sides, hung flat against the box in the two frame planes.
    for (const [x, facing] of [
      [0, "east"],
      [2, "west"],
    ] as const) {
      put(x, boxY, z, palette.trapdoor, {
        facing,
        half: "bottom",
        open: "false",
        powered: "false",
        waterlogged: "false",
      });
    }
  }

  // --- the two A-frames ----------------------------------------------------
  // The leg's z offset from the hub, per course: three at the foot, nought at
  // the head. Integer arithmetic only — no trigonometry anywhere in this file.
  const legOffset = (y: number): number => 3 - Math.floor((y * 3) / hub);
  for (const x of [0, 2] as const) {
    let previous = legOffset(0);
    for (let y = 0; y <= hub; y++) {
      const off = legOffset(y);
      for (const sign of [-1, 1] as const) {
        // The step cell: written at the *old* offset as well, so a leg that
        // moves inward is still face-connected up its whole length.
        if (off !== previous) put(x, y, cz + sign * previous, palette.log, { axis: "y" });
        put(x, y, cz + sign * off, palette.log, { axis: "y" });
      }
      previous = off;
    }
  }
  // The axle: a log along x through both frame heads and the wheel's hub.
  for (let x = 0; x < 3; x++) put(x, hub, cz, palette.log, { axis: "x" });

  // The hub lights, either side of the axle on the wheel's own plane.
  put(cx, hub + 1, cz, "glowstone");
  put(cx, hub - 1, cz, "glowstone");

  // --- the flag ------------------------------------------------------------
  // On the wheel's own top rim cell, which is a full cube directly beneath it.
  const flag = SPECTACLE_BANNERS[ctx.rng("ferris").int(0, SPECTACLE_BANNERS.length - 1)] as string;
  put(cx, hub + r + 1, cz, flag, { rotation: "0" });

  return { ops: NO_OPS, meta: metaOf("ferris_wheel") };
};

/* -------------------------------------------------------------------------- */
/* the park                                                                    */
/* -------------------------------------------------------------------------- */

/** True inside the bandstand's pad disc, in offsets from the centre. */
function inBandstand(dx: number, dz: number): boolean {
  return dx * dx + dz * dz <= 18;
}

/**
 * `bandstand` — an open octagonal stand on a pad.
 *
 * A paved disc, eight fence pillars round its rim with a low fence rail
 * between them, and a shallow conical roof that steps in one ring per course
 * and closes on a **solid** finial block with a banner standing on it.
 *
 * Every pillar and every rail cell stands on the pad — `groundedChain` walks a
 * fence *down* and stops at the first solid block, and the pad is directly
 * beneath. The roof's first course is a full disc laid on the pillar heads, so
 * each successive ring rests on the ring below it and the apex is one block
 * rather than a hole.
 *
 * The stand is left **open** on the side facing `+z`: a bandstand you cannot
 * walk into is a gazebo with railings.
 */
const bandstand: PropGenerator = (ctx) => {
  const { put, palette } = ctx;
  const c = (BANDSTAND_SPAN - 1) / 2;

  // --- the pad -------------------------------------------------------------
  for (let dx = -c; dx <= c; dx++) {
    for (let dz = -c; dz <= c; dz++) {
      if (!inBandstand(dx, dz)) continue;
      const x = c + dx;
      const z = c + dz;
      const rim = !inBandstand(dx + 1, dz) || !inBandstand(dx - 1, dz) ||
        !inBandstand(dx, dz + 1) || !inBandstand(dx, dz - 1);
      put(x, 0, z, rim ? palette.stoneAccent : palette.stone);
    }
  }

  // --- pillars and rail ----------------------------------------------------
  // The eight octagon corners, and the rail runs that join them.
  const posts: readonly (readonly [number, number])[] = [
    [-4, 0],
    [-3, -3],
    [0, -4],
    [3, -3],
    [4, 0],
    [3, 3],
    [0, 4],
    [-3, 3],
  ];
  for (const [dx, dz] of posts) {
    for (let y = 1; y <= 3; y++) put(c + dx, y, c + dz, palette.log, { axis: "y" });
  }
  // The rail: one course of fence on the pad between neighbouring posts, on
  // every side but the way in.
  for (let i = 0; i < posts.length; i++) {
    const a = posts[i] as readonly [number, number];
    const b = posts[(i + 1) % posts.length] as readonly [number, number];
    // The way in: the arc that faces +z.
    if (a[1] >= 3 && b[1] >= 3) continue;
    const steps = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]));
    for (let s = 1; s < steps; s++) {
      const dx = a[0] + Math.round(((b[0] - a[0]) * s) / steps);
      const dz = a[1] + Math.round(((b[1] - a[1]) * s) / steps);
      if (!inBandstand(dx, dz)) continue;
      put(c + dx, 1, c + dz, palette.fence);
    }
  }

  // --- the roof ------------------------------------------------------------
  // A full disc on the pillar heads, then one ring in per course, closing on a
  // solid block. Never a ring with a hole at the apex.
  for (let dx = -c; dx <= c; dx++) {
    for (let dz = -c; dz <= c; dz++) {
      if (!inBandstand(dx, dz)) continue;
      put(c + dx, 4, c + dz, stripe(dx + dz));
    }
  }
  for (let k = 1; k <= 3; k++) {
    const reach = 3 - k;
    for (let dx = -reach; dx <= reach; dx++) {
      for (let dz = -reach; dz <= reach; dz++) {
        if (dx * dx + dz * dz > reach * reach + reach) continue;
        // The apex course is one SOLID block, never a ring with a hole in it.
        put(c + dx, 4 + k, c + dz, k === 3 ? "polished_andesite" : stripe(dx + dz + k));
      }
    }
  }
  // The solid finial, and its flag standing on it.
  put(c, 8, c, "chiseled_stone_bricks");
  const flag = SPECTACLE_BANNERS[ctx.rng("bandstand").int(0, SPECTACLE_BANNERS.length - 1)];
  put(c, 9, c, flag as string, { rotation: "0" });

  return { ops: NO_OPS, meta: metaOf("bandstand") };
};

/**
 * `memorial_garden` — a compound, on the graveyard's precedent.
 *
 * The wave-2 graveyard established that a *compound* — several small objects
 * arranged on one pad — is a legitimate prop rather than something the building
 * grammar owes a shell to, and this is the quiet version of it: a cross path of
 * gravel, four planted beds in the quarters, a small monument at the far end, a
 * bench either side of the path, and a low wall along two edges.
 *
 * Every plant stands on a **coarse dirt** bed written into the base plane, so
 * `groundedChain` finds solid ground one course down; the walls and the bench
 * stairs stand on the paving. Nothing here is a sign and nothing holds water.
 */
const memorialGarden: PropGenerator = (ctx) => {
  const { put, palette } = ctx;
  const span = GARDEN_SPAN;
  const c = (span - 1) / 2;
  const flowers = ["poppy", "dandelion", "cornflower", "azure_bluet", "oxeye_daisy"] as const;

  // --- the ground ----------------------------------------------------------
  for (let x = 0; x < span; x++) {
    for (let z = 0; z < span; z++) {
      const onPath = x === c || z === c || x === 0 || x === span - 1 || z === 0 || z === span - 1;
      put(x, 0, z, onPath ? palette.stone : "coarse_dirt");
    }
  }

  // --- the beds ------------------------------------------------------------
  // Every quarter, one flower per cell, chosen from the cell's coordinates so
  // a re-run is byte-identical and a rotation is still a planted bed.
  for (let x = 1; x < span - 1; x++) {
    for (let z = 1; z < span - 1; z++) {
      if (x === c || z === c) continue;
      const i = (((x * 3 + z * 5) % flowers.length) + flowers.length) % flowers.length;
      // A hedge of leaves round the bed edges, flowers inside it.
      const edge = x === 1 || x === span - 2 || z === 1 || z === span - 2;
      if (edge) put(x, 1, z, "oak_leaves", { persistent: "true", distance: "7", waterlogged: "false" });
      else put(x, 1, z, flowers[i] as string);
    }
  }

  // --- the monument --------------------------------------------------------
  // A plinth of dressed stone at the head of the path with a slab cap, and a
  // wreath of green carpet round its foot on the paving.
  put(c, 1, 1, "chiseled_stone_bricks");
  put(c, 2, 1, "polished_andesite");
  put(c, 3, 1, palette.stoneSlab, { type: "bottom", waterlogged: "false" });
  for (const [dx, dz] of [
    [1, 0],
    [-1, 0],
    [0, 1],
  ] as const) {
    put(c + dx, 1, 1 + dz, "green_carpet");
  }

  // --- the benches ---------------------------------------------------------
  // A stair's `facing` is its backrest, so a bench a visitor sits on looking up
  // the path at the monument faces **away** from it — south.
  for (const dx of [-1, 1] as const) {
    put(c + dx, 1, span - 2, palette.stairs, {
      facing: "south",
      half: "bottom",
      shape: "straight",
    });
  }

  // --- the low wall --------------------------------------------------------
  for (let x = 0; x < span; x += 2) {
    put(x, 1, 0, palette.stoneWall);
    put(x, 1, span - 1, palette.stoneWall);
  }

  return { ops: NO_OPS, meta: metaOf("memorial_garden") };
};

/* -------------------------------------------------------------------------- */
/* the strange                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * `portal_frame` — an obsidian rectangle with nothing in it.
 *
 * Four wide and five tall, obsidian with crying-obsidian corners, standing on
 * its own base course. The interior is **empty on purpose**: a lit portal is a
 * `nether_portal` block, which is a world-changing gameplay object rather than
 * scenery, and this vocabulary places none. What it is, is a ruin that looks as
 * though it once worked.
 *
 * Two rune pedestals stand either side of the frame's feet: a dressed block
 * with an amethyst cluster growing out of the top of it.
 */
const portalFrame: PropGenerator = ({ put }) => {
  const zf = 1;

  // --- the frame -----------------------------------------------------------
  for (let x = 0; x < 4; x++) {
    put(x, 0, zf, x === 0 || x === 3 ? "crying_obsidian" : "obsidian");
    put(x, 4, zf, x === 0 || x === 3 ? "crying_obsidian" : "obsidian");
  }
  for (let y = 1; y <= 3; y++) {
    put(0, y, zf, y === 2 ? "crying_obsidian" : "obsidian");
    put(3, y, zf, y === 2 ? "crying_obsidian" : "obsidian");
  }

  // --- the pedestals -------------------------------------------------------
  for (const x of [0, 3] as const) {
    for (const z of [0, 2] as const) {
      put(x, 0, z, "polished_deepslate");
      put(x, 1, z, "amethyst_cluster", { facing: "up", waterlogged: "false" });
    }
  }

  // --- the keystone --------------------------------------------------------
  put(1, 5, zf, "chiseled_deepslate");
  put(2, 5, zf, "chiseled_deepslate");

  return { ops: NO_OPS, meta: metaOf("portal_frame") };
};

/** True inside the floating platform's disc, in offsets from the centre. */
function inFloatDisc(dx: number, dz: number, reach: number): boolean {
  return dx * dx + dz * dz <= reach * reach + reach;
}

/**
 * `floating_platform` — the trick, stated plainly.
 *
 * A floating island cannot be built in this grammar: the physics lint refuses a
 * full cube with six air faces, and it is right to. So the platform is
 * **carried**, and the carrying is disguised:
 *
 * - a **stem** of end-stone brick runs from the base plane to the underside of
 *   the disc — one column wide, so from any distance it is a line rather than a
 *   pier;
 * - the stem is **veiled** with `iron_bars` on all four sides for its whole
 *   height (no `chain`; there is none in the block table). Bars are see-through
 *   and read as a shimmer or a tether, and they take support from the block
 *   beside them;
 * - the **disc** oversails the stem by three cells in every direction, which is
 *   the whole illusion: the eye reads the overhang, not the thread under the
 *   middle of it.
 *
 * Above the disc is an end-stone rim, a course of soil with sprouting growth on
 * it, and an amethyst crown at the centre. Every disc cell is face-joined to
 * its neighbour and the run reaches the stem, so nothing floats in the sense
 * the lint means, however much it looks as if it does.
 */
const floatingPlatform: PropGenerator = ({ put, palette }) => {
  const c = (FLOAT_SPAN - 1) / 2;
  const deck = FLOAT_DECK;

  // --- the stem, and its veil ----------------------------------------------
  for (let y = 0; y < deck; y++) {
    put(c, y, c, "end_stone_bricks");
    if (y === 0) continue;
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      put(c + dx, y, c + dz, "iron_bars");
    }
  }

  // --- the disc ------------------------------------------------------------
  for (let dx = -c; dx <= c; dx++) {
    for (let dz = -c; dz <= c; dz++) {
      if (!inFloatDisc(dx, dz, c)) continue;
      const x = c + dx;
      const z = c + dz;
      put(x, deck, z, (dx + dz) % 2 === 0 ? "end_stone" : "end_stone_bricks");
      // The soil course, inset one cell from the disc's own rim.
      if (inFloatDisc(dx, dz, c - 1)) {
        put(x, deck + 1, z, "moss_block");
      } else {
        put(x, deck + 1, z, palette.stoneWall);
      }
    }
  }

  // --- the crown -----------------------------------------------------------
  put(c, deck + 2, c, "amethyst_block");
  for (const [dx, dz] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const) {
    put(c + dx, deck + 2, c + dz, "moss_carpet");
  }

  return { ops: NO_OPS, meta: metaOf("floating_platform") };
};

/* -------------------------------------------------------------------------- */
/* registry                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Name → generator, spread into `PROP_GENERATORS` by `props.ts`.
 *
 * Adding a prop is one entry here and one name in
 * {@link SPECTACLE_PROP_NAMES}; the catalog test holds the two together.
 */
export const SPECTACLE_PROP_GENERATORS: Readonly<Record<string, PropGenerator>> = Object.freeze({
  ferris_wheel: ferrisWheel,
  bandstand,
  memorial_garden: memorialGarden,
  portal_frame: portalFrame,
  floating_platform: floatingPlatform,
});

/* -------------------------------------------------------------------------- */
/* exhibits                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Dev-world exhibit rows for this wave's props, in the shape
 * `exhibits/props.ts` spreads.
 *
 * It lives here rather than compiler-side for `props-wayside.ts`'s reason:
 * `exhibits/props.ts` is shared ground between parallel tracks, and registering
 * a wave there should be one import and one spread. The rotations are spent on
 * the props whose op lists are asymmetric — the wheel's plane, the bandstand's
 * open side, the garden's monument end — which are the ones where a property
 * that failed to rotate would be invisible at yaw 0.
 */
export const SPECTACLE_PROP_EXHIBIT_PLAN: readonly {
  readonly row: string;
  readonly water: boolean;
  readonly cells: readonly {
    readonly prop: SpectaclePropName;
    readonly params: Record<string, unknown>;
  }[];
}[] = Object.freeze([
  {
    row: "spec_fair",
    water: false,
    cells: [
      { prop: "ferris_wheel", params: { yaw: 0 } },
      { prop: "ferris_wheel", params: { yaw: 90 } },
      { prop: "bandstand", params: { yaw: 0 } },
      { prop: "bandstand", params: { yaw: 180 } },
    ],
  },
  {
    row: "spec_oddities",
    water: false,
    cells: [
      { prop: "memorial_garden", params: { yaw: 0 } },
      { prop: "memorial_garden", params: { yaw: 180 } },
      { prop: "portal_frame", params: { yaw: 0 } },
      { prop: "portal_frame", params: { yaw: 90 } },
      { prop: "floating_platform", params: { yaw: 0 } },
    ],
  },
]);
