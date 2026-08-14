/**
 * `prop.place@0` — the **alien & sci-fi pack's human response**: the seven
 * entries of `docs/CATALOG-EXPANSION-v0.md` §3.4 that are *our* side of an
 * invasion rather than the invader's.
 *
 * The pack's thesis is that a world whose only alien thing is the landmark
 * reads as a museum. The xeno half supplies the arrival; this file supplies
 * the answer to it — the cordon that went up around the thing, the science
 * that came to look at it and the soldiers who came with the science. Every
 * one of them is a *silhouette a stranger names*: a white dome in a field, a
 * trailer on jacks, a rank of dishes all pointing the same way.
 *
 * Seven props, in catalog order:
 *
 * - `containment_tent` — the inflated dome, ribbed, with an airlock tube out
 *   one side and a generator at the back;
 * - `field_lab_trailer` — the boxed trailer on jacks; *three in a row is a
 *   response, one is a rumour*, so this is the repeat piece;
 * - `sensor_mast` — the tripod with a dish, a solar rack and a blinking head;
 * - `dish_array` — four parabolic dishes on pedestals, **all aimed the same
 *   way**, because the aim is the read;
 * - `sandbag_emplacement` — the horseshoe of bags with a firing step;
 * - `mobile_command_post` — the armoured box body with an awning, a map table
 *   under it and a mast of antennae;
 * - `sentry_turret` — the XS saturation piece: pedestal, head, lamp.
 *
 * ## The contract, and why this file is a leaf
 *
 * Same shape as `props-classical-b.ts`: this file imports **types** from
 * `props.ts` and no values at all, so the one edge `props.ts` → here can never
 * become a module-initialisation cycle. Node-local coordinates, `y = 0` the
 * base plane, block **names** with a property map, every op inside the
 * declared box so `rotateOps` needs no special case.
 *
 * ## The rules every prop here obeys
 *
 * 1. **Nothing floats.** The physics lint's `floating.*` family fires on a
 *    full cube with **six air faces**. Every prop here paves its whole
 *    footprint at `y = 0` — a compound *has* hardstanding, so this is honest
 *    rather than defensive — and everything above the pad rests on the pad, on
 *    a leg, or on a horizontal neighbour of its own.
 * 2. **Every leg is grounded.** The trailer's jacks, the mast's tripod and the
 *    command post's awning posts all run down to the pad; a body carried on
 *    legs is legal because its interior cells touch their neighbours, which is
 *    the classical pack's lintel lesson in its other clothes.
 * 3. **The dome is a shell, not a solid.** Each column of the skin runs from
 *    its own height down to the height of its lowest neighbour, which is what
 *    makes a hemisphere watertight against the six-air-face rule without
 *    filling it in.
 * 4. **No sign blocks** — warning bands are *coloured*, not written, because a
 *    sign is a block entity this op stream cannot carry.
 * 5. **No `chain`** — not in the pinned 1.21.11 table; masts and stays are
 *    `iron_bars` (`palette.chain`).
 * 6. **Determinism.** The only randomness is pad scuffing and bag colour, and
 *    both are named streams of the node seed. No wall clock, no `Math.random`.
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
export const RESPONSE_PROP_NAMES = [
  "containment_tent",
  "field_lab_trailer",
  "sensor_mast",
  "dish_array",
  "sandbag_emplacement",
  "mobile_command_post",
  "sentry_turret",
] as const;

/** One of the props this file builds. */
export type ResponsePropName = (typeof RESPONSE_PROP_NAMES)[number];

/** True for a name this file answers to. */
export function isResponseProp(name: string): name is ResponsePropName {
  return (RESPONSE_PROP_NAMES as readonly string[]).includes(name);
}

/* -------------------------------------------------------------------------- */
/* extents                                                                     */
/* -------------------------------------------------------------------------- */

/** Containment tent: generator bay, dome, airlock tube, along x. */
export const CONTAIN_W = 15;
/** Containment tent depth — the dome's diameter. */
export const CONTAIN_D = 11;
/** Containment tent height: the dome's rise, with headroom over it. */
export const CONTAIN_H = 8;
/** Radius of the tent's dome, in cells. */
export const CONTAIN_R = 5;

/** Field lab trailer: drawbar, body, tail. */
export const TRAILER_W = 9;
/** Field lab trailer depth. */
export const TRAILER_D = 5;
/** Field lab trailer height, aerial included. */
export const TRAILER_H = 7;

/** Sensor mast pad, in x and z. */
export const MAST_SPAN = 5;
/** Sensor mast height: tripod, deck, mast, head, rod. */
export const MAST_H = 9;

/** Dish array run — four dishes at a five-cell interval. */
export const ARRAY_W = 20;
/** Dish array depth: pad, dish face, rim, feed horn. */
export const ARRAY_D = 7;
/** Dish array height. */
export const ARRAY_H = 8;
/** How many dishes stand in the array. */
export const ARRAY_DISHES = 4;
/** Interval between dish pedestals, in cells. */
export const ARRAY_PITCH = 5;

/** Sandbag emplacement pad, in x and z. */
export const EMPLACEMENT_SPAN = 7;
/** Sandbag emplacement height: two courses of bags. */
export const EMPLACEMENT_H = 3;

/** Command post: body, then the antenna bay behind it. */
export const COMMAND_W = 13;
/** Command post depth: the body, then the awning off its flank. */
export const COMMAND_D = 7;
/** Command post height, mast included. */
export const COMMAND_H = 7;

/** Sentry turret pad, in x and z. */
export const TURRET_SPAN = 3;
/** Sentry turret height: pedestal, head, lamp. */
export const TURRET_H = 4;

/** The declared box of one of this file's props, before it is generated. */
export function responsePropFootprint(prop: ResponsePropName): {
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
    case "containment_tent":
      return ground([CONTAIN_W, CONTAIN_H, CONTAIN_D]);
    case "field_lab_trailer":
      return ground([TRAILER_W, TRAILER_H, TRAILER_D]);
    case "sensor_mast":
      return ground([MAST_SPAN, MAST_H, MAST_SPAN]);
    case "dish_array":
      return ground([ARRAY_W, ARRAY_H, ARRAY_D]);
    case "sandbag_emplacement":
      return ground([EMPLACEMENT_SPAN, EMPLACEMENT_H, EMPLACEMENT_SPAN]);
    case "mobile_command_post":
      return ground([COMMAND_W, COMMAND_H, COMMAND_D]);
    case "sentry_turret":
    default:
      return ground([TURRET_SPAN, TURRET_H, TURRET_SPAN]);
  }
}

/** Build a `PropMeta` from the declared footprint, so the two cannot drift. */
function metaOf(prop: ResponsePropName): PropMeta {
  const foot = responsePropFootprint(prop);
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
/* the response's surfaces                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The **hardstanding** every prop in this file stands on.
 *
 * A response compound is laid on plates and trackway, not on grass, and paving
 * the whole declared footprint is also what makes the six-air-face rule
 * trivially satisfiable for everything above it: no leg, jack or bag course
 * can find itself over nothing.
 */
function hardstanding(x: number, z: number, scuff: number): string {
  const k = (x * 7 + z * 11 + scuff) % 9;
  if (k === 0) return "gravel";
  if (k === 1) return "smooth_stone";
  return "light_gray_concrete";
}

/** Pave the whole declared box at `y = 0`. */
function pave(
  put: PropContextPut,
  w: number,
  d: number,
  scuff: number,
): void {
  for (let z = 0; z < d; z++) {
    for (let x = 0; x < w; x++) put(x, 0, z, hardstanding(x, z, scuff));
  }
}

/** The `put` a generator is handed, narrowed for the helpers above. */
type PropContextPut = (
  x: number,
  y: number,
  z: number,
  block: string,
  props?: Record<string, string>,
) => void;

/**
 * The **inflated skin** — white panels with the ribs standing proud of them.
 *
 * A pure function of the cell's offset from the dome's axis, so the ribs are
 * meridians: they run from the crown to the ground and they agree with
 * themselves across every re-run and every quarter turn.
 */
function tentSkin(dx: number, dz: number): string {
  const rib = dx === 0 || dz === 0 || Math.abs(dx) === Math.abs(dz);
  return rib ? "light_gray_concrete" : "white_concrete";
}

/** Armour plate: the response's vehicles, banded so a flank reads at distance. */
function plate(palette: PropPalette, x: number, y: number, z: number): string {
  const k = (x * 5 + y * 3 + z * 7) % 6;
  if (k === 0) return "gray_concrete";
  if (k === 1) return palette.stoneAccent;
  return "light_gray_concrete";
}

/* -------------------------------------------------------------------------- */
/* the containment tent                                                        */
/* -------------------------------------------------------------------------- */

/** Height of the dome's skin over a cell, or `0` outside its disc. */
function domeHeight(dx: number, dz: number): number {
  const d2 = dx * dx + dz * dz;
  // Half a cell over the nominal radius, so the skin still has two courses at
  // the springing rather than dying to nothing at the rim: an inflated tent is
  // fattest at the ground, not tangent to it.
  const r2 = (CONTAIN_R + 0.5) * (CONTAIN_R + 0.5);
  if (d2 > r2) return 0;
  return Math.floor(Math.sqrt(r2 - d2));
}

/**
 * `containment_tent` — the white dome that means *they found something here*.
 *
 * Three parts, and the whole read is the first one:
 *
 * - **the dome**, a hemisphere of radius five, its skin ribbed by meridian.
 *   The shell is drawn column by column: each column runs from its own height
 *   down to the height of its lowest orthogonal neighbour, which is what makes
 *   a curved surface *closed* rather than a staircase of loose blocks. That is
 *   the entire answer to the six-air-face rule here;
 * - **the airlock tube**, a three-cell passage off the dome's east side with
 *   its own roof and an iron hatch at the outer end. It is left open along its
 *   axis, because a tube you cannot walk down is a box;
 * - **the generator**, at the back: a low plant block with an exhaust and a
 *   lantern on it. It is what the humming in the note is.
 */
const containmentTent: PropGenerator = (ctx) => {
  const { put, palette } = ctx;
  const scuff = ctx.rng("tent.pad").int(0, 8);
  pave(put, CONTAIN_W, CONTAIN_D, scuff);

  const cx = 7;
  const cz = 5;

  // The dome's skin. `bottom` is the lowest neighbour's height, so the column
  // reaches down to meet it and the shell closes.
  for (let z = 0; z < CONTAIN_D; z++) {
    for (let x = 2; x <= 12; x++) {
      const dx = x - cx;
      const dz = z - cz;
      // The tube's mouth: the skin parts where the airlock meets it, because
      // an airlock onto a closed wall is a cupboard.
      if (x === 12 && z >= 4 && z <= 6) continue;
      const h = domeHeight(dx, dz);
      if (h < 1) continue;
      const neighbours = [
        domeHeight(dx + 1, dz),
        domeHeight(dx - 1, dz),
        domeHeight(dx, dz + 1),
        domeHeight(dx, dz - 1),
      ];
      const lowest = Math.min(...neighbours);
      const bottom = Math.max(1, Math.min(h, lowest));
      for (let y = bottom; y <= h; y++) put(x, y, z, tentSkin(dx, dz));
    }
  }

  // The airlock tube, out the east side: walls, roof, and a hatch at the end.
  for (let x = 13; x <= 14; x++) {
    for (const z of [4, 6]) {
      put(x, 1, z, "white_concrete");
      put(x, 2, z, "white_concrete");
    }
    for (let z = 4; z <= 6; z++) put(x, 3, z, "light_gray_concrete");
  }
  put(14, 1, 5, "iron_trapdoor", {
    facing: "east",
    half: "bottom",
    open: "false",
    powered: "false",
    waterlogged: "false",
  });
  put(14, 2, 5, "iron_trapdoor", {
    facing: "east",
    half: "top",
    open: "false",
    powered: "false",
    waterlogged: "false",
  });

  // The generator at the back: a plant block, an exhaust and a work lamp.
  for (let z = 4; z <= 6; z++) {
    for (let x = 0; x <= 1; x++) put(x, 1, z, plate(palette, x, 1, z));
  }
  put(0, 2, 5, "gray_concrete");
  put(1, 2, 5, "iron_bars", {
    east: "false",
    north: "true",
    south: "true",
    waterlogged: "false",
    west: "false",
  });
  put(1, 2, 4, palette.lantern, { hanging: "false", waterlogged: "false" });

  return { ops: NO_OPS, meta: metaOf("containment_tent") };
};

/* -------------------------------------------------------------------------- */
/* the trailer                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * `field_lab_trailer` — the science that turned up, in the smallest box it
 * comes in.
 *
 * A boxed body standing clear of the ground on **six jacks**, every one of
 * them run down to the pad: the gap under the floor is the whole read, and it
 * is legal because the floor's interior cells touch their own neighbours.
 * A step at the tail, a shuttered hatch in the flank and an aerial off the
 * roof finish it.
 *
 * The note is a placement instruction as much as a description — *three in a
 * row is a response, one is a rumour* — so this is the pack's repeat piece and
 * the exhibit shows it three times.
 */
const fieldLabTrailer: PropGenerator = (ctx) => {
  const { put, palette } = ctx;
  const scuff = ctx.rng("trailer.pad").int(0, 8);
  pave(put, TRAILER_W, TRAILER_D, scuff);

  // The jacks: three a side, all the way down to the pad.
  for (const x of [1, 4, 7]) {
    for (const z of [1, 3]) put(x, 1, z, "iron_block");
  }

  // The floor, carried on the jacks.
  for (let z = 1; z <= 3; z++) {
    for (let x = 1; x <= 7; x++) put(x, 2, z, "gray_concrete");
  }

  // The walls, with a window band down the road side.
  for (let z = 1; z <= 3; z++) {
    for (let x = 1; x <= 7; x++) {
      const wall = x === 1 || x === 7 || z === 1 || z === 3;
      if (!wall) continue;
      const window = z === 1 && (x === 3 || x === 5);
      put(x, 3, z, window ? "glass" : "white_concrete");
    }
  }

  // The roof.
  for (let z = 1; z <= 3; z++) {
    for (let x = 1; x <= 7; x++) put(x, 4, z, "light_gray_concrete");
  }

  // The shuttered hatch, in the far flank.
  put(4, 3, 3, "iron_trapdoor", {
    facing: "south",
    half: "bottom",
    open: "false",
    powered: "false",
    waterlogged: "false",
  });

  // The step at the tail, and the aerial off the roof.
  put(4, 1, 4, palette.stoneStairs, { facing: "south", half: "bottom", shape: "straight" });
  put(6, 5, 2, palette.chain);
  put(6, 6, 2, "lightning_rod", { facing: "up", powered: "false", waterlogged: "false" });

  return { ops: NO_OPS, meta: metaOf("field_lab_trailer") };
};

/* -------------------------------------------------------------------------- */
/* the sensor mast                                                             */
/* -------------------------------------------------------------------------- */

/**
 * `sensor_mast` — three legs, a deck, and something listening on top of it.
 *
 * The tripod is literal: three legs at the corners of a triangle, each one
 * standing on the pad, carrying a deck that the solar rack sits on and the
 * mast rises out of. The head is a lamp with a rod over it — the blink — and
 * the dish is a four-armed cross, which is as much dish as a small one gets at
 * this size without turning into a blob.
 */
const sensorMast: PropGenerator = (ctx) => {
  const { put, palette } = ctx;
  const scuff = ctx.rng("mast.pad").int(0, 8);
  pave(put, MAST_SPAN, MAST_SPAN, scuff);

  // The three legs.
  for (const [lx, lz] of [
    [1, 1],
    [3, 1],
    [2, 3],
  ] as const) {
    for (let y = 1; y <= 2; y++) put(lx, y, lz, "iron_block");
  }

  // The deck they carry.
  for (let z = 1; z <= 3; z++) {
    for (let x = 1; x <= 3; x++) put(x, 3, z, plate(palette, x, 3, z));
  }

  // The solar rack: two ranks either side of the mast.
  for (const x of [1, 3]) {
    for (let z = 1; z <= 3; z++) put(x, 4, z, "daylight_detector");
  }

  // The mast, the dish, the head and the rod.
  for (let y = 4; y <= 6; y++) put(2, y, 2, "iron_block");
  put(1, 6, 2, "light_gray_concrete");
  put(3, 6, 2, "light_gray_concrete");
  put(2, 6, 1, "light_gray_concrete");
  put(2, 6, 3, "light_gray_concrete");
  put(2, 7, 2, "glowstone");
  put(2, 8, 2, "lightning_rod", { facing: "up", powered: "false", waterlogged: "false" });

  return { ops: NO_OPS, meta: metaOf("sensor_mast") };
};

/* -------------------------------------------------------------------------- */
/* the dish array                                                              */
/* -------------------------------------------------------------------------- */

/** Where the array's pedestals stand along x. */
export function dishStations(): readonly number[] {
  const xs: number[] = [];
  for (let i = 0; i < ARRAY_DISHES; i++) xs.push(2 + i * ARRAY_PITCH);
  return xs;
}

/**
 * `dish_array` — four parabolic dishes on pedestals, **all aimed the same
 * way**.
 *
 * The aim is the read, and it is the only thing this prop has to get right: a
 * rank of dishes pointing in four directions is scrap, and a rank pointing one
 * way is a world that is *listening to something*. So the dish is generated
 * once as a function of its station's x and everything else about it — face,
 * rim, boom, horn — is identical from dish to dish.
 *
 * The bowl is a diamond of face cells in the plane `z = 3`, its rim stepped
 * forward one cell to `z = 4` so the bowl is concave rather than a plate, with
 * the feed horn out on a short boom at the focus. The face's lowest cell lands
 * on the pedestal's mount, so the whole assembly hangs off masonry.
 */
const dishArray: PropGenerator = (ctx) => {
  const { put, palette } = ctx;
  const scuff = ctx.rng("array.pad").int(0, 8);
  pave(put, ARRAY_W, ARRAY_D, scuff);

  for (const px of dishStations()) {
    // The pedestal, and its mount.
    put(px, 1, 3, palette.stone);
    put(px, 2, 3, palette.stone);
    put(px, 3, 3, "iron_block");

    // The bowl: face at z = 3, rim stepped forward to z = 4.
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const r = Math.abs(dx) + Math.abs(dy);
        if (r > 2) continue;
        if (dx === 0 && dy === -2) continue; // the mount already fills it
        put(px + dx, 5 + dy, 3, r === 0 ? "white_concrete" : "light_gray_concrete");
      }
    }
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        // The rim is the outer ring of the face, carried one cell forward, so
        // every rim cell has its own face cell directly behind it.
        if (Math.abs(dx) + Math.abs(dy) !== 2) continue;
        put(px + dx, 5 + dy, 4, "light_gray_concrete");
      }
    }

    // The boom and the feed horn, at the focus.
    put(px, 5, 4, "iron_block");
    put(px, 5, 5, "glowstone");
  }

  return { ops: NO_OPS, meta: metaOf("dish_array") };
};

/* -------------------------------------------------------------------------- */
/* the emplacement                                                             */
/* -------------------------------------------------------------------------- */

/**
 * `sandbag_emplacement` — the horseshoe at the corner.
 *
 * Two courses of bags round three sides with the fourth left open to the
 * street behind, a firing step inside the parapet so somebody can see over it,
 * and an ammunition crate in the corner. The bags are sand and sandstone
 * mixed by position — a sandbag wall is never one colour — and every one of
 * them stands on the pad or on the bag below it, which matters twice over
 * because `sand` falls.
 */
const sandbagEmplacement: PropGenerator = (ctx) => {
  const { put, palette } = ctx;
  const scuff = ctx.rng("bags.pad").int(0, 8);
  pave(put, EMPLACEMENT_SPAN, EMPLACEMENT_SPAN, scuff);

  const bag = (x: number, y: number, z: number): string => {
    const k = (x * 3 + y * 5 + z * 7) % 5;
    if (k === 0) return "sandstone";
    if (k === 1) return "smooth_sandstone";
    return "sand";
  };

  // The horseshoe: the front face and both flanks, open to the rear.
  for (let y = 1; y <= 2; y++) {
    for (let x = 0; x < EMPLACEMENT_SPAN; x++) put(x, y, 0, bag(x, y, 0));
    for (let z = 1; z <= 4; z++) {
      put(0, y, z, bag(0, y, z));
      put(EMPLACEMENT_SPAN - 1, y, z, bag(EMPLACEMENT_SPAN - 1, y, z));
    }
  }

  // The firing step, inside the parapet.
  for (let x = 1; x < EMPLACEMENT_SPAN - 1; x++) put(x, 1, 1, palette.stone);

  // The ammunition crate, in the back corner.
  put(5, 1, 4, palette.cargo);

  return { ops: NO_OPS, meta: metaOf("sandbag_emplacement") };
};

/* -------------------------------------------------------------------------- */
/* the command post                                                            */
/* -------------------------------------------------------------------------- */

/**
 * `mobile_command_post` — the vehicle everybody stands next to.
 *
 * An armoured box body on wheels, a canvas awning off one flank on grounded
 * posts, the map table under the awning, and a mast of antennae behind. The
 * awning is the part that makes it a *command* post rather than a truck: it
 * is where the argument happens, so the table stands under it in the open.
 */
const mobileCommandPost: PropGenerator = (ctx) => {
  const { put, palette } = ctx;
  const scuff = ctx.rng("command.pad").int(0, 8);
  pave(put, COMMAND_W, COMMAND_D, scuff);

  // The running gear.
  for (const x of [2, 7]) {
    for (const z of [1, 4]) put(x, 1, z, "polished_blackstone");
  }
  for (let x = 1; x <= 8; x++) {
    put(x, 1, 2, "gray_concrete");
    put(x, 1, 3, "gray_concrete");
  }

  // The body: floor, armour, roof, with a vision slit forward.
  for (let z = 1; z <= 4; z++) {
    for (let x = 1; x <= 8; x++) {
      put(x, 2, z, "gray_concrete");
      put(x, 5, z, plate(palette, x, 5, z));
      const wall = x === 1 || x === 8 || z === 1 || z === 4;
      if (!wall) continue;
      put(x, 3, z, plate(palette, x, 3, z));
      const slit = x === 1 && (z === 2 || z === 3);
      put(x, 4, z, slit ? "black_stained_glass" : plate(palette, x, 4, z));
    }
  }

  // The awning off the near flank, on posts that reach the pad.
  for (const x of [2, 7]) {
    for (let y = 1; y <= 4; y++) put(x, y, 6, palette.chain);
  }
  for (let x = 2; x <= 7; x++) {
    put(x, 5, 5, "white_wool");
    put(x, 5, 6, "white_wool");
  }

  // The map table under it.
  put(4, 1, 5, "cartography_table");
  put(5, 1, 5, "cartography_table");

  // The mast of antennae behind the body.
  for (let y = 1; y <= 5; y++) put(10, y, 3, "iron_block");
  put(10, 6, 3, "lightning_rod", { facing: "up", powered: "false", waterlogged: "false" });
  put(9, 5, 3, palette.chain);
  put(11, 5, 3, palette.chain);

  return { ops: NO_OPS, meta: metaOf("mobile_command_post") };
};

/* -------------------------------------------------------------------------- */
/* the turret                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * `sentry_turret` — the saturation piece, at three cells square.
 *
 * A short pedestal, a head that has plainly swivelled (it is turned off the
 * pad's axis by its barrel, not by a property), sensor blisters either side
 * and a lamp on the crown. Cheap enough to put at every gate and on every
 * parapet, which is the only way an XS prop earns its id.
 */
const sentryTurret: PropGenerator = (ctx) => {
  const { put, palette } = ctx;
  const scuff = ctx.rng("turret.pad").int(0, 8);
  pave(put, TURRET_SPAN, TURRET_SPAN, scuff);

  put(1, 1, 1, palette.stone);
  put(1, 2, 1, "gray_concrete");
  put(1, 2, 0, "iron_bars", {
    east: "false",
    north: "true",
    south: "true",
    waterlogged: "false",
    west: "false",
  });
  put(0, 2, 1, "light_gray_concrete");
  put(2, 2, 1, "light_gray_concrete");
  put(1, 3, 1, "glowstone");

  return { ops: NO_OPS, meta: metaOf("sentry_turret") };
};

/* -------------------------------------------------------------------------- */
/* the registry                                                                */
/* -------------------------------------------------------------------------- */

/** Every generator this file contributes, merged into `PROP_GENERATORS`. */
export const RESPONSE_PROP_GENERATORS: Readonly<Record<string, PropGenerator>> = Object.freeze({
  containment_tent: containmentTent,
  field_lab_trailer: fieldLabTrailer,
  sensor_mast: sensorMast,
  dish_array: dishArray,
  sandbag_emplacement: sandbagEmplacement,
  mobile_command_post: mobileCommandPost,
  sentry_turret: sentryTurret,
});
