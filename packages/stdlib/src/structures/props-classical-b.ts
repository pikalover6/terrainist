/**
 * `prop.place@0` — the **classical Mediterranean pack, second half**: the eight
 * entries that are things you walk
 * *past* rather than into.
 *
 * The pack exists because of the Troy verdict: the `sun_clay` palette was
 * right and every **form** was borrowed, so a sandstone medieval town is what
 * came out. Nothing in this file has an interior worth a sentence; every one
 * of them is a *silhouette* a stranger names from thirty blocks away — a run
 * of columns, an arch over the road, a shaft with a head on it, a hull with a
 * ram on its nose.
 *
 * Eight props, in catalog order:
 *
 * - `agora_colonnade` — the free-standing colonnade, length-parameterised;
 * - `triumphal_arch` — the arch that spans a road rather than a room;
 * - `rostra` — the speaker's platform, with the ships' beaks on its face;
 * - `herm_post` — the saturation piece: a square shaft with a head course;
 * - `votive_column` — one column, alone, with a tripod on its capital;
 * - `column_drums` — the same column after the earthquake;
 * - `trireme` — the oared warship, on the water base;
 * - `pithos_store` — storage jars sunk to the shoulder in a paved yard.
 *
 * ## The contract, and why this file is a leaf
 *
 * `props.ts`'s contract unchanged, and this file imports **types** from it and
 * no values at all — exactly as `props-relics.ts` does — so the one edge
 * `props.ts` → here can never become a module-initialisation cycle. The hull
 * helpers in `ships.ts` are deliberately *not* imported for the same reason:
 * the trireme's twenty lines of hull are cheaper than a second cycle.
 * Node-local coordinates, `y = 0` the base plane, block **names** with a
 * property map, every op inside the declared box so `rotateOps` needs no
 * special case.
 *
 * ## The rules every prop here obeys
 *
 * 1. **Nothing floats.** The physics lint's `floating.*` family fires on a
 *    full cube with **six air faces**, so every block here rests on the base
 *    plane, on another of this file's own blocks, or is a lintel whose span is
 *    at most one cell wider than the thing under it. The colonnade's
 *    entablature is the case to watch: a bay of it is a lintel resting on
 *    nothing, so the bays are **one cell** and each lintel block touches
 *    entablature on both sides and a column head one cell away.
 * 2. **An arch is corbelled, never rung.** The triumphal arch's soffit steps
 *    in one cell per course and each course is solid across the mass, which is
 *    the sanctum pack's "solid per course, never a ring per course" lesson in
 *    its other clothes.
 * 3. **No sign blocks** — the attic band of a triumphal arch is *carved*
 *    (chiseled stone laid in a band), because a sign is a block entity this op
 *    stream cannot carry. `decorated_pot` is the one block entity used, and
 *    the emitter carries it.
 * 4. **No `chain`** — not in the pinned 1.21.11 table; rigging is `iron_bars`.
 * 5. **`cauldron` takes no properties.** The vessel with a `level` is
 *    `water_cauldron`; a bare `cauldron` with `level` on it is a state that
 *    does not exist. The tripods and oil jars here are bare cauldrons.
 * 6. **A floating prop displaces water.** The trireme writes solid at `y = 0`
 *    and `y = -1` and never writes air or water, which is `ships.ts`'s rule
 *    and the only thing standing between a fleet and a flooded world.
 * 7. **Determinism.** Every draw is a named stream of the node seed. No wall
 *    clock, no `Math.random`, no transcendental — the colonnade's rhythm and
 *    the drums' scatter are pure functions of position.
 */

import { definePropDescriptors } from "./descriptor.js";
import type { PropDescriptor } from "./descriptor.js";
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
export const CLASSICAL_B_PROP_NAMES = [
  "agora_colonnade",
  "triumphal_arch",
  "rostra",
  "herm_post",
  "votive_column",
  "column_drums",
  "trireme",
  "pithos_store",
] as const;

/** One of the props this file builds. */
export type ClassicalBPropName = (typeof CLASSICAL_B_PROP_NAMES)[number];

/** True for a name this file answers to. */
export function isClassicalBProp(name: string): name is ClassicalBPropName {
  return (CLASSICAL_B_PROP_NAMES as readonly string[]).includes(name);
}

/* -------------------------------------------------------------------------- */
/* extents                                                                     */
/* -------------------------------------------------------------------------- */

/** Default run of the free-standing colonnade, in bays' worth of cells. */
const COLONNADE_LENGTH = 15;
/** The shortest and longest colonnade a document may ask for. */
export const COLONNADE_MIN = 7;
/** See {@link COLONNADE_MIN}. */
export const COLONNADE_MAX = 31;
/** Depth of the colonnade: the two steps of its crepidoma. */
const COLONNADE_DEPTH = 3;
/** Height of the colonnade box: pavement, step, three shaft courses, and trim. */
const COLONNADE_H = 7;

/** Triumphal arch: pier, carriageway, pier. */
const ARCH_W = 11;
/** How far the arch runs along the road it spans. */
const ARCH_D = 5;
/** Arch height: pier, corbelled vault, crown, attic band. */
const ARCH_H = 12;

/** Rostra span across its face. */
const ROSTRA_W = 9;
/** Rostra depth: the dais, then the two steps up to it. */
const ROSTRA_D = 7;
/** Rostra height: two courses of dais and the rail on top. */
const ROSTRA_H = 4;

/** Herm pad, in x and z. */
const HERM_SPAN = 3;
/** Herm height: two shaft courses and the head. */
const HERM_H = 4;

/** Votive column pad. */
const VOTIVE_SPAN = 3;
/** Votive column height, tripod included. */
const VOTIVE_H = 11;

/** Fallen drums: the run of the shaft plus the stump it came off. */
const DRUMS_W = 11;
/** Fallen drums depth: the run, and the drum that rolled off it. */
const DRUMS_D = 5;

/** Trireme length. */
const TRIREME_L = 23;
/** Trireme beam. */
const TRIREME_B = 5;
/** Trireme height, from the submerged course to the yard. */
const TRIREME_H = 10;

/** Pithos yard, in x and z. */
const PITHOS_SPAN = 9;

/** Read the colonnade's `length` param the way the generator reads it. */
function colonnadeLength(params: Readonly<Record<string, unknown>>): number {
  const raw = params["length"];
  if (typeof raw !== "number" || !Number.isFinite(raw)) return COLONNADE_LENGTH;
  const v = Math.round(raw);
  return v < COLONNADE_MIN ? COLONNADE_MIN : v > COLONNADE_MAX ? COLONNADE_MAX : v;
}

/** The declared box of one of this file's props, before it is generated. */
export function classicalBPropFootprint(
  prop: ClassicalBPropName,
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
    case "agora_colonnade":
      return ground([colonnadeLength(params), COLONNADE_H, COLONNADE_DEPTH]);
    case "triumphal_arch":
      return ground([ARCH_W, ARCH_H, ARCH_D]);
    case "rostra":
      return ground([ROSTRA_W, ROSTRA_H, ROSTRA_D]);
    case "herm_post":
      return ground([HERM_SPAN, HERM_H, HERM_SPAN]);
    case "votive_column":
      return ground([VOTIVE_SPAN, VOTIVE_H, VOTIVE_SPAN]);
    case "column_drums":
      return ground([DRUMS_W, 3, DRUMS_D]);
    case "trireme":
      return { size: [TRIREME_L, TRIREME_H, TRIREME_B], minY: -1, base: "water" };
    case "pithos_store":
    default:
      return ground([PITHOS_SPAN, 2, PITHOS_SPAN]);
  }
}

/** Build a `PropMeta` from the declared footprint, so the two cannot drift. */
function metaOf(prop: ClassicalBPropName, params: Readonly<Record<string, unknown>>): PropMeta {
  const foot = classicalBPropFootprint(prop, params);
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
/* the classical surfaces                                                      */
/* -------------------------------------------------------------------------- */

/**
 * **Ashlar** — dressed stone, banded by course.
 *
 * A pure function of `y` alone, because dressed stone bands by course and
 * banding on anything else reads as rubble. The sanctum pack learned this on
 * the obelisk: a shaft is a shaft because its courses line up.
 */
function ashlar(palette: PropPalette, y: number): string {
  return y % 4 === 0 ? palette.stoneAccent : palette.stone;
}

/**
 * The **marble** a monument is dressed in — the palette's accent, relieved.
 *
 * Position-derived, never drawn, so opposite faces of the same pier agree with
 * each other and the whole thing is stable across re-runs and yaws.
 */
function marble(palette: PropPalette, x: number, y: number, z: number): string {
  const k = (x * 7 + y * 13 + z * 5) % 7;
  if (k === 0) return palette.stoneAccent;
  if (k === 1) return "smooth_stone";
  return palette.stone;
}

/** A column shaft cell: the drum stone, with the fluting relief on the accent. */
function drumStone(palette: PropPalette, y: number): string {
  return y % 3 === 0 ? palette.stoneAccent : palette.stone;
}

/* -------------------------------------------------------------------------- */
/* the colonnade                                                               */
/* -------------------------------------------------------------------------- */

/**
 * `agora_colonnade` — columns at a fixed interval under a continuous
 * entablature.
 *
 * The one prop in the pack that is a *run* rather than an object, and the
 * cheapest way to make a square read as antiquity: a stranger names a
 * colonnade before they name anything it belongs to.
 *
 * Four courses, bottom to top, and each one answers a support question:
 *
 * - **the crepidoma** — the whole box paved at `y = 0`, then the column row
 *   raised one course, so the colonnade stands on a *step* rather than on the
 *   dirt. That step is what a stylobate is;
 * - **the shafts** — three courses of drum stone on every other cell of the
 *   row, so the bays are one cell wide;
 * - **the entablature** — an unbroken course of full blocks on the column
 *   heads. Each block over a bay touches entablature on both sides and sits
 *   one cell from a column head, so no cell of it has six air faces. This is
 *   what a lintel *is*, and it is only legal because the bay is one cell;
 * - **the cornice** — a slab course over the entablature and out over both
 *   flanks, which is the shadow line that makes the run read from the side.
 */
const agoraColonnade: PropGenerator = (ctx) => {
  const { put, palette } = ctx;
  const length = colonnadeLength(ctx.params);
  const row = 1; // the stylobate row, one cell in from each flank

  for (let x = 0; x < length; x++) {
    for (let z = 0; z < COLONNADE_DEPTH; z++) {
      put(x, 0, z, (x + z) % 5 === 0 ? palette.stoneAccent : palette.stone);
    }
    // The upper step: the column row only, which is the two-step crepidoma.
    put(x, 1, row, palette.stoneAccent);
  }

  // The shafts and their capitals.
  for (let x = 0; x < length; x++) {
    if (x % 2 !== 0) continue;
    for (let y = 2; y <= 4; y++) put(x, y, row, drumStone(palette, y));
    put(x, 4, row, "chiseled_stone_bricks");
  }

  // The entablature, and the cornice over it.
  for (let x = 0; x < length; x++) {
    put(x, 5, row, ashlar(palette, 5));
    for (let z = 0; z < COLONNADE_DEPTH; z++) {
      put(x, 6, z, palette.stoneSlab, { type: "bottom", waterlogged: "false" });
    }
  }

  return { ops: NO_OPS, meta: metaOf("agora_colonnade", ctx.params) };
};

/* -------------------------------------------------------------------------- */
/* the arch                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * `triumphal_arch` — the arch that spans a **road**, not a room.
 *
 * Piers either side of the carriageway, a corbelled barrel over it, a
 * continuous crown and an attic band of carved stone where the inscription
 * goes. The whole thing is a mass: every course is solid across whatever it
 * covers, so the soffit steps in rather than hanging a ring on nothing.
 *
 * The carriageway is left **open along z** — five cells wide and five deep —
 * because the road goes through it, and a road under an arch that a horse
 * cannot get through is a wall with a hole in it.
 */
const triumphalArch: PropGenerator = (ctx) => {
  const { put, palette } = ctx;
  const pier = 3; // cells of pier at each end of x
  const springing = 7; // the first course of the vault

  // The carriageway: paved, so the road has something to run over.
  for (let x = pier; x < ARCH_W - pier; x++) {
    for (let z = 0; z < ARCH_D; z++) put(x, 0, z, (x * 3 + z) % 4 === 0 ? "smooth_stone" : palette.stone);
  }

  // The piers, and the engaged half-columns on their outer faces.
  for (let y = 0; y < springing; y++) {
    for (let z = 0; z < ARCH_D; z++) {
      for (let x = 0; x < pier; x++) {
        put(x, y, z, marble(palette, x, y, z));
        put(ARCH_W - 1 - x, y, z, marble(palette, ARCH_W - 1 - x, y, z));
      }
    }
    // The engaged columns: the middle cell of each pier's road face, in drum
    // stone, so the pier reads as columned rather than as a block of masonry.
    if (y > 0 && y < springing - 1) {
      for (const x of [1, ARCH_W - 2]) {
        put(x, y, 0, drumStone(palette, y));
        put(x, y, ARCH_D - 1, drumStone(palette, y));
      }
    }
  }

  // The vault: corbelled, the opening one cell narrower per course, and every
  // course solid across everything it is not opening. Each overhanging block
  // has the block beside it for a neighbour, which is what a corbel is and why
  // no cell of it is a full cube with six air faces.
  for (let k = 0; k <= 2; k++) {
    const y = springing + k;
    const x0 = pier + k;
    const x1 = ARCH_W - 1 - pier - k;
    for (let z = 0; z < ARCH_D; z++) {
      for (let x = 0; x < ARCH_W; x++) {
        if (x >= x0 && x <= x1) continue; // still the opening
        put(x, y, z, marble(palette, x, y, z));
      }
    }
  }

  // The crown, and the attic band of carved stone over it — the inscription,
  // which is carved because a sign is a block entity this stream cannot carry.
  for (let z = 0; z < ARCH_D; z++) {
    for (let x = 0; x < ARCH_W; x++) {
      put(x, ARCH_H - 2, z, ashlar(palette, ARCH_H - 2));
      const edge = z === 0 || z === ARCH_D - 1;
      put(x, ARCH_H - 1, z, edge && x % 2 === 1 ? "chiseled_stone_bricks" : palette.stoneAccent);
    }
  }

  return { ops: NO_OPS, meta: metaOf("triumphal_arch", ctx.params) };
};

/* -------------------------------------------------------------------------- */
/* the forum furniture                                                         */
/* -------------------------------------------------------------------------- */

/**
 * `rostra` — the speaker's platform, and the reason it has that name.
 *
 * A stepped masonry dais with a rail round three sides and the open front
 * turned to the forum. The **beaks** are the etymology and the icon: the Roman
 * platform was faced with the bronze rams of captured ships, drawn here as a
 * course of stairs projecting from the front face at deck height.
 *
 * The two steps are on the back, so the walk up is behind the speaker and the
 * face toward the crowd is unbroken.
 */
const rostra: PropGenerator = (ctx) => {
  const { put, palette } = ctx;
  const deep = 5; // the dais itself, z = 0..4; the steps are behind it

  for (let z = 0; z < ROSTRA_D; z++) {
    for (let x = 0; x < ROSTRA_W; x++) put(x, 0, z, (x + z) % 6 === 0 ? "smooth_stone" : palette.stone);
  }

  // The dais: two solid courses, so a speaker stands two blocks over the
  // forum and is seen from the back of it.
  for (let z = 0; z < deep; z++) {
    for (let x = 0; x < ROSTRA_W; x++) {
      for (let y = 1; y <= 2; y++) put(x, y, z, ashlar(palette, y));
    }
  }

  // The steps up the back, in the middle three bays, each one standing on the
  // block below it: ground → stair → stair → dais top.
  const mid = (ROSTRA_W - 1) / 2;
  const onStair = (x: number): boolean => x >= mid - 1 && x <= mid + 1;
  for (let x = 0; x < ROSTRA_W; x++) {
    if (!onStair(x)) continue;
    put(x, 1, deep, palette.stone);
    put(x, 2, deep, palette.stoneStairs, { facing: "north", half: "bottom", shape: "straight" });
    put(x, 1, deep + 1, palette.stoneStairs, {
      facing: "north",
      half: "bottom",
      shape: "straight",
    });
  }

  // The rail: the back and both flanks, leaving the front open to the crowd
  // and the three step bays open to the stair.
  for (let x = 0; x < ROSTRA_W; x++) {
    if (onStair(x)) continue;
    put(x, 3, deep - 1, palette.stoneWall);
  }
  for (let z = 0; z < deep; z++) {
    put(0, 3, z, palette.stoneWall);
    put(ROSTRA_W - 1, 3, z, palette.stoneWall);
  }

  // The beaks: captured rams on the front face, every other bay.
  for (let x = 1; x < ROSTRA_W - 1; x += 2) {
    put(x, 2, 0, "copper_block");
  }

  return { ops: NO_OPS, meta: metaOf("rostra", ctx.params) };
};

/**
 * `herm_post` — the pack's saturation piece, and its cheapest icon.
 *
 * A square shaft with a blocky head course on it, on a small paved base. Nine
 * blocks of pavement and four of stone say *antiquity* at a street corner, and
 * twenty of them down a lane say it louder than one temple does — which is the
 * whole argument of the form-pack document.
 */
const hermPost: PropGenerator = (ctx) => {
  const { put, palette } = ctx;
  const c = (HERM_SPAN - 1) / 2;
  for (let z = 0; z < HERM_SPAN; z++) {
    for (let x = 0; x < HERM_SPAN; x++) {
      put(x, 0, z, x === c && z === c ? palette.stoneAccent : palette.stone);
    }
  }
  put(c, 1, c, palette.stoneAccent);
  put(c, 2, c, "smooth_stone");
  // The head: carved, and set proud of the shaft by nothing at all — a herm is
  // a head on a post, not a statue.
  put(c, 3, c, "chiseled_stone_bricks");
  return { ops: NO_OPS, meta: metaOf("herm_post", ctx.params) };
};

/**
 * `votive_column` — one column standing alone with a tripod on its capital.
 *
 * The vertical the pack needs between its horizontals. A stepped plinth, a
 * seven-course shaft banded like a drum stack, a carved capital, and a bare
 * `cauldron` for the tripod bowl — bare because a `cauldron` with a `level` is
 * a block state that does not exist; the vessel with levels is
 * `water_cauldron`.
 */
const votiveColumn: PropGenerator = (ctx) => {
  const { put, palette } = ctx;
  const c = (VOTIVE_SPAN - 1) / 2;
  for (let z = 0; z < VOTIVE_SPAN; z++) {
    for (let x = 0; x < VOTIVE_SPAN; x++) put(x, 0, z, palette.stone);
  }
  // The plinth: a second course, inset to the cross of the pad, so the step
  // reads without the shaft looking as if it stands in a box.
  for (let z = 0; z < VOTIVE_SPAN; z++) {
    for (let x = 0; x < VOTIVE_SPAN; x++) {
      if (x !== c && z !== c) continue;
      put(x, 1, z, palette.stoneAccent);
    }
  }
  for (let y = 2; y <= 8; y++) put(c, y, c, drumStone(palette, y));
  put(c, 9, c, "chiseled_stone_bricks");
  put(c, 10, c, "cauldron");
  return { ops: NO_OPS, meta: metaOf("votive_column", ctx.params) };
};

/**
 * `column_drums` — the same column, a few centuries later.
 *
 * A shaft falls as a **row of drums**, which is why a ruined colonnade is
 * recognisable at all: the cylinders stay in line where they rolled off each
 * other. So this is a stump at one end, a run of drums lying half in the grass
 * away from it, one drum rolled off the line, and the capital at the far end
 * of the run where the top of the shaft landed.
 *
 * Every block rests on the pad or on the run beside it; nothing is stacked
 * higher than the stump, which is a monument that has stopped being one.
 */
const columnDrums: PropGenerator = (ctx) => {
  const { put, palette } = ctx;
  const line = 2; // the z the shaft fell along
  for (let z = 0; z < DRUMS_D; z++) {
    for (let x = 0; x < DRUMS_W; x++) {
      put(x, 0, z, (x * 3 + z * 5) % 7 === 0 ? "coarse_dirt" : "grass_block", { snowy: "false" });
    }
  }
  // The stump: two courses of what is left standing.
  put(0, 1, line, drumStone(palette, 1));
  put(0, 2, line, "chiseled_stone_bricks");
  // The run: drums lying where they fell, weathered by position.
  for (let x = 1; x <= DRUMS_W - 3; x++) {
    put(x, 1, line, (x * 5) % 4 === 0 ? "mossy_cobblestone" : drumStone(palette, x));
  }
  // The drum that rolled off the line — beside the run, touching it.
  put(4, 1, line + 1, "mossy_cobblestone");
  put(7, 1, line - 1, palette.stone);
  // The capital, at the end of the run.
  put(DRUMS_W - 2, 1, line, "chiseled_stone_bricks");
  put(DRUMS_W - 1, 1, line, palette.stoneSlab, { type: "bottom", waterlogged: "false" });
  return { ops: NO_OPS, meta: metaOf("column_drums", ctx.params) };
};

/* -------------------------------------------------------------------------- */
/* the trireme                                                                 */
/* -------------------------------------------------------------------------- */

/** Half-beam of the trireme at station `x` — never zero: a station with no beam is a hole. */
function triremeHalf(x: number): number {
  const bow = 6;
  const stern = 4;
  if (x < bow) return Math.max(1, Math.round((2 * (x + 1)) / bow));
  if (x >= TRIREME_L - stern) {
    const i = TRIREME_L - 1 - x;
    return Math.max(1, Math.round((2 * (i + 1)) / stern));
  }
  return 2;
}

/**
 * `trireme` — the oared warship, and the one hull antiquity is known by.
 *
 * Long, low and slim: twenty-three by five, where a galleon of the same length
 * would be nine wide. Four things make it read, and all four are on the
 * outside of the hull:
 *
 * - **the ram** — a bronze beak at the waterline off the stem, in
 *   `copper_block`, which is the only bronze the block table has;
 * - **the oar banks** — trapdoors down both topsides at two heights, which at
 *   any distance is a hundred oars;
 * - **the eye** at the bow, white with a black pupil: the apotropaic eye every
 *   Greek hull carried, and the cheapest identification in the pack;
 * - **one square sail** on a mast stepped amidships, because a trireme fought
 *   under oar and travelled under sail.
 *
 * The fluid argument is `ships.ts`'s, unchanged: solid at `y = 0` and `y = -1`,
 * never air and never water, so the hull displaces rather than trapping a
 * pocket.
 */
const trireme: PropGenerator = (ctx) => {
  const { put, palette } = ctx;
  const cz = (TRIREME_B - 1) / 2;
  const dark = ctx.rng("trireme.timber").float() < 0.5;
  const hull = dark ? palette.log : palette.stripped;
  const deck = palette.planks;
  const cloth = ctx.rng("trireme.cloth").float() < 0.5 ? "white_wool" : "light_gray_wool";

  for (let x = 0; x < TRIREME_L; x++) {
    const h = triremeHalf(x);
    for (let dz = -h; dz <= h; dz++) {
      const z = cz + dz;
      put(x, 0, z, deck);
      if (Math.abs(dz) < h || h === 1) put(x, -1, z, hull);
      if (Math.abs(dz) === h || x === 0 || x === TRIREME_L - 1) put(x, 1, z, hull);
    }
  }

  // The oar banks: two rows of ports down the topsides. A trapdoor hangs off
  // the bulwark beside it, so nothing here needs ground under it.
  for (let x = 3; x < TRIREME_L - 4; x++) {
    if (x % 2 !== 1) continue;
    const h = triremeHalf(x);
    for (const sign of [-1, 1]) {
      const z = cz + sign * h;
      put(x, 1, z, palette.trapdoor, {
        facing: sign < 0 ? "south" : "north",
        half: "bottom",
        open: "true",
        powered: "false",
        waterlogged: "false",
      });
      put(x, 0, z, hull);
    }
  }

  // The ram, and the eye above it.
  put(0, 0, cz, "copper_block");
  put(1, 0, cz, "copper_block");
  for (const sign of [-1, 1]) {
    const z = cz + sign * triremeHalf(4);
    put(4, 1, z, "white_wool");
    put(5, 1, z, "black_wool");
  }

  // The mast, the yard and the sail.
  const mx = Math.floor(TRIREME_L / 2);
  for (let y = 1; y <= 7; y++) put(mx, y, cz, palette.log, { axis: "y" });
  for (let y = 4; y <= 6; y++) {
    for (let dz = -2; dz <= 2; dz++) {
      if (dz === 0) continue;
      put(mx, y, cz + dz, cloth);
    }
  }
  for (let dz = -2; dz <= 2; dz++) put(mx, 7, cz + dz, palette.log, { axis: "z" });
  // The forestay and backstay: bars, because the pinned table has no `chain`.
  put(mx - 3, 1, cz, palette.chain);
  put(mx + 3, 1, cz, palette.chain);

  // The steering oars, off the quarter.
  for (const sign of [-1, 1]) {
    const z = cz + sign * triremeHalf(TRIREME_L - 3);
    put(TRIREME_L - 3, 1, z, palette.fence);
  }

  return { ops: NO_OPS, meta: metaOf("trireme", ctx.params) };
};

/* -------------------------------------------------------------------------- */
/* the store                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * `pithos_store` — the classical warehouse, outdoors.
 *
 * Great storage jars sunk to the shoulder in a paved yard, lids stacked beside
 * them. The jar is a `decorated_pot` standing in a ring of clay written into
 * the pavement, which is what "sunk to the shoulder" looks like from standing
 * height; the lids are stone slabs on the paving next to each jar.
 *
 * `decorated_pot` is the one block entity in this file, and the emitter
 * carries it — unlike a sign, which it cannot.
 */
const pithosStore: PropGenerator = (ctx) => {
  const { put, palette } = ctx;
  for (let z = 0; z < PITHOS_SPAN; z++) {
    for (let x = 0; x < PITHOS_SPAN; x++) {
      put(x, 0, z, (x * 5 + z * 3) % 4 === 0 ? palette.stoneAccent : palette.stone);
    }
  }
  // The jars, on a grid with a lane between the ranks. The clay collar is
  // written into the pavement, so the jar is sunk rather than stood on it.
  for (let z = 1; z < PITHOS_SPAN - 1; z += 3) {
    for (let x = 1; x < PITHOS_SPAN - 1; x += 3) {
      put(x, 0, z, "terracotta");
      put(x, 1, z, "decorated_pot", { cracked: "false", facing: "north", waterlogged: "false" });
      // The lid, off the jar's shoulder.
      if (x + 1 < PITHOS_SPAN) {
        put(x + 1, 1, z, palette.stoneSlab, { type: "bottom", waterlogged: "false" });
      }
    }
  }
  return { ops: NO_OPS, meta: metaOf("pithos_store", ctx.params) };
};

/* -------------------------------------------------------------------------- */
/* the registry                                                                */
/* -------------------------------------------------------------------------- */

/** Every generator this file contributes, merged into `PROP_GENERATORS`. */
const CLASSICAL_B_PROP_GENERATORS: Readonly<Record<string, PropGenerator>> = Object.freeze({
  agora_colonnade: agoraColonnade,
  triumphal_arch: triumphalArch,
  rostra,
  herm_post: hermPost,
  votive_column: votiveColumn,
  column_drums: columnDrums,
  trireme,
  pithos_store: pithosStore,
});

/* -------------------------------------------------------------------------- */
/* descriptors — Phase 4 leaf export (no self-registration)                    */
/* -------------------------------------------------------------------------- */

/**
 * Ordered prop descriptors for the classical-b pack, one per
 * {@link CLASSICAL_B_PROP_NAMES}.
 *
 * - Delegates footprint param-dependently to {@link classicalBPropFootprint}:
 *   `agora_colonnade` reads `length` via {@link colonnadeLength} clamped to
 *   {@link COLONNADE_MIN}–{@link COLONNADE_MAX} (default {@link COLONNADE_LENGTH});
 *   the remaining seven are static (`triumphal_arch`, `rostra`, `herm_post`,
 *   `votive_column`, `column_drums`, `trireme` on water, `pithos_store`).
 *   The same helper as the generator, so footprint realization stays aligned.
 * - Generator is the leaf handle from {@link CLASSICAL_B_PROP_GENERATORS}.
 * - Insertion order equals {@link CLASSICAL_B_PROP_NAMES} and mirrors the
 *   local switch/generator order; preserves LocalVoxelOp order and seeded draws.
 */
export const CLASSICAL_B_PROP_DESCRIPTORS: readonly PropDescriptor[] = definePropDescriptors(CLASSICAL_B_PROP_NAMES, {
  footprint: (id, params) => classicalBPropFootprint(id, params),
  generator: CLASSICAL_B_PROP_GENERATORS,
});
