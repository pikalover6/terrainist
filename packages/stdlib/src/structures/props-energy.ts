/**
 * `prop.place@0` — wave 6C: the two energy objects that are not buildings.
 *
 * A wind turbine and a solar array have no inside. Wrapping either in the
 * building grammar would give it a door, a lantern over the middle of a room
 * and a walkable floor, none of which it has; the windpump made this call
 * first, and the curtain wall made the mirror of it by staying linear. So the
 * other ten entries of wave 6C are archetypes in `archetypes-utility.ts` and
 * these two are props.
 *
 * The contract is `props.ts`'s, unchanged and re-stated because both generators
 * below obey it: node-local coordinates, `y = 0` the base plane, block *names*
 * with a property map, every op inside the declared box so `rotateOps` needs no
 * special case. Like `props-street.ts` this file is a **leaf**: it imports types
 * from `props.ts` and no values, so the one edge `props.ts` → here cannot
 * become a module-initialisation cycle.
 *
 * ## Support
 *
 * Neither of these has a single floating block, and the turbine is the reason
 * the rule is worth writing down. A three-blade rotor drawn as arms radiating
 * from a hub in mid air is six support-chain defects; here **every blade block
 * touches the hub or the blade block inboard of it**, the hub stands on the
 * **mast**, and the mast is a continuous column of full cubes from `y = 0`. The
 * blade tips are slabs — smooth quartz, because concrete has no slab variant in
 * the 1.21.11 table this emitter is pinned to — which is the one place a partial
 * block appears, and a slab whose neighbour is a full cube is braced.
 *
 * The array is the same argument made trivial: every panel is a
 * `daylight_detector` — a real block, with a real model that already looks like
 * a photovoltaic panel — standing on its own plinth cube on the ground.
 *
 * ## No chains, no signs, no fluids
 *
 * Nothing here hangs, nothing here is labelled and nothing here is wet.
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
 * Spread into `PROP_NAMES` by `props.ts`, which stays the one place a prop name
 * is enumerated.
 */
export const ENERGY_PROP_NAMES = ["wind_turbine", "solar_array"] as const;

/** One of the props this file builds. */
export type EnergyPropName = (typeof ENERGY_PROP_NAMES)[number];

/** True for a name this file answers to. */
export function isEnergyProp(name: string): name is EnergyPropName {
  return (ENERGY_PROP_NAMES as readonly string[]).includes(name);
}


/* -------------------------------------------------------------------------- */
/* params                                                                      */
/* -------------------------------------------------------------------------- */

/** Read an integer param, rounded and clamped, with a default. */
function readInt(
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

/** Default mast height of a turbine, and the range the param is clamped to. */
export const TURBINE_HEIGHT_DEFAULT = 11;
/** See {@link TURBINE_HEIGHT_DEFAULT}. */
const TURBINE_HEIGHT_MIN = 7;
/** See {@link TURBINE_HEIGHT_DEFAULT}. */
const TURBINE_HEIGHT_MAX = 21;

/** Default panel rows in an array, and the range the param is clamped to. */
const SOLAR_ROWS_DEFAULT = 3;
/** See {@link SOLAR_ROWS_DEFAULT}. */
const SOLAR_ROWS_MIN = 1;
/** See {@link SOLAR_ROWS_DEFAULT}. */
const SOLAR_ROWS_MAX = 8;

const SOLAR_ROW_LENGTH = 5;

/* -------------------------------------------------------------------------- */
/* footprints                                                                  */
/* -------------------------------------------------------------------------- */

/** The declared box of one of this file's props, before it is generated. */
export function energyPropFootprint(
  prop: EnergyPropName,
  params: Readonly<Record<string, unknown>> = {},
): {
  readonly size: readonly [number, number, number];
  readonly minY: number;
  readonly base: PropBase;
} {
  if (prop === "wind_turbine") {
    const height = readInt(
      params,
      "height",
      TURBINE_HEIGHT_DEFAULT,
      TURBINE_HEIGHT_MIN,
      TURBINE_HEIGHT_MAX,
    );
    // Five wide for the rotor (two blades either side of the hub), three deep
    // for the transformer cabinet behind the mast, and the box is as tall as
    // the mast plus the upward blade.
    return { size: [5, height + 4, 3], minY: 0, base: "ground" };
  }
  const rows = readInt(params, "rows", SOLAR_ROWS_DEFAULT, SOLAR_ROWS_MIN, SOLAR_ROWS_MAX);
  // A row of panels, a walk lane behind each row, and one cable trench in
  // front of the lot.
  return { size: [SOLAR_ROW_LENGTH + 2, 3, rows * 2], minY: 0, base: "ground" };
}

/** Build a `PropMeta` from the declared footprint, so the two cannot drift. */
function metaOf(prop: EnergyPropName, params: Readonly<Record<string, unknown>> = {}): PropMeta {
  const foot = energyPropFootprint(prop, params);
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

/** A masonry mix, keyed by position so a re-run is byte-identical. */
function stoneAt(palette: PropPalette, x: number, y: number, z: number): string {
  return (x * 5 + y * 11 + z * 3) % 4 === 0 ? palette.stoneAccent : palette.stone;
}

/* -------------------------------------------------------------------------- */
/* the generators                                                              */
/* -------------------------------------------------------------------------- */

/**
 * `wind_turbine` — a white mast, a hub on it, three blades, a cabinet at the foot.
 *
 * The windpump grown up and modernised. The **mast** is a continuous column of
 * white concrete from the ground pad to the hub, so the whole machine has one
 * support chain and it reaches the floor. The **hub** is a full cube on the head
 * of that column.
 *
 * The **rotor** is the only part with a rule worth stating. Each blade is two
 * blocks of white concrete and a slab tip, drawn **outward from the hub**: the
 * inboard block touches the hub, the outboard block touches the inboard one,
 * the tip touches the outboard. There is no radius, no angle and no
 * trigonometry — a three-arm rotor at rest is one arm up and two arms out,
 * which is what a stopped turbine looks like in every photograph of one.
 *
 * The **transformer cabinet** stands on the pad behind the mast: an iron block
 * with a lever on its head, which is the honest read of switchgear out of the
 * block table and needs nothing that hangs.
 */
const windTurbine: PropGenerator = ({ put, palette, params }) => {
  const height = readInt(
    params,
    "height",
    TURBINE_HEIGHT_DEFAULT,
    TURBINE_HEIGHT_MIN,
    TURBINE_HEIGHT_MAX,
  );
  const cx = 2;
  const cz = 1;

  // The pad: a stone apron under the whole machine, so the mast stands on
  // something laid rather than on whatever the terrain happened to be.
  for (let x = 1; x <= 3; x++) {
    for (let z = 0; z < 3; z++) put(x, 0, z, stoneAt(palette, x, 0, z));
  }

  // The mast: continuous, ground to hub.
  for (let y = 1; y <= height; y++) put(cx, y, cz, "white_concrete");
  // The hub, on the head of it.
  const hub = height + 1;
  put(cx, hub, cz, "light_gray_concrete");

  // The three blades. Each block touches the one inboard of it.
  put(cx, hub + 1, cz, "white_concrete");
  put(cx, hub + 2, cz, "smooth_quartz_slab", { type: "bottom", waterlogged: "false" });
  for (const dx of [-1, 1]) {
    put(cx + dx, hub, cz, "white_concrete");
    put(cx + 2 * dx, hub, cz, "smooth_quartz_slab", { type: "bottom", waterlogged: "false" });
  }

  // The transformer cabinet, on the pad behind the mast.
  put(cx, 1, cz + 1, "iron_block");
  put(cx, 2, cz + 1, "lever", { face: "floor", facing: "south", powered: "false" });
  put(cx + 1, 1, cz + 1, palette.stoneWall);
  return { ops: NO_OPS, meta: metaOf("wind_turbine", params) };
};

/**
 * `solar_array` — rows of panels on plinths, an inverter, a cable trench.
 *
 * The **panel is a real block**: `daylight_detector` is in the table, it is a
 * flat dark-blue slab-height thing with a lattice on top, and it is already
 * what a photovoltaic panel looks like. Nothing here needs to fake a tilt with
 * stairs — a stair panel reads as a step you can climb, which is the wrong
 * thing to say about a solar farm.
 *
 * Each panel stands on its own **plinth cube**, so no panel is on the ground
 * and no panel is in the air, and the rows are laid two apart, which leaves a
 * one-cell service lane between every pair of them.
 *
 * The **cable trench** is a floor recolour along the front — a full block, so
 * it is a surface a body walks over rather than a hole it falls into — and the
 * **inverter cabinet** stands at the head of the trench.
 */
const solarArray: PropGenerator = ({ put, palette, params }) => {
  const rows = readInt(params, "rows", SOLAR_ROWS_DEFAULT, SOLAR_ROWS_MIN, SOLAR_ROWS_MAX);

  // The cable trench, along the front edge, in the ground plane.
  for (let x = 0; x < SOLAR_ROW_LENGTH + 2; x++) {
    put(x, 0, 0, x % 2 === 0 ? "light_gray_concrete" : "gray_concrete");
  }
  // The inverter cabinet at the head of it: a cube with a lever on its head.
  put(0, 1, 0, "iron_block");
  put(0, 2, 0, "lever", { face: "floor", facing: "north", powered: "false" });

  // The rows: a plinth cube per panel, a panel on every plinth.
  for (let r = 0; r < rows; r++) {
    const z = r * 2 + 1;
    for (let i = 0; i < SOLAR_ROW_LENGTH; i++) {
      const x = i + 1;
      put(x, 0, z, stoneAt(palette, x, 0, z));
      put(x, 1, z, "smooth_stone");
      put(x, 2, z, "daylight_detector", { inverted: "false", power: "0" });
    }
    // The row's own end post, so a row terminates deliberately.
    put(SOLAR_ROW_LENGTH + 1, 0, z, stoneAt(palette, SOLAR_ROW_LENGTH + 1, 0, z));
    put(SOLAR_ROW_LENGTH + 1, 1, z, palette.stoneWall);
  }
  return { ops: NO_OPS, meta: metaOf("solar_array", params) };
};

/** The generators, keyed by prop name — spread into `PROP_GENERATORS`. */
const ENERGY_PROP_GENERATORS: Readonly<Record<string, PropGenerator>> = Object.freeze({
  wind_turbine: windTurbine,
  solar_array: solarArray,
});

/* -------------------------------------------------------------------------- */
/* exhibits                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Dev-world exhibit rows for this wave, in the shape `exhibits/props.ts`
 * spreads.
 *
 * It lives here rather than compiler-side for the same reason
 * `STREET_PROP_EXHIBIT_PLAN` does: `exhibits/props.ts` is shared ground between
 * parallel tracks, and registering a wave there should be one import and one
 * spread — a conflict a merge can resolve. The rotations are spent on the
 * asymmetric object: the turbine's rotor lies in the x plane and its cabinet
 * sits behind the mast, so a `facing` that failed to rotate is invisible at
 * yaw 0 and obvious at yaw 90.
 *
 * Typed structurally rather than against the compiler's `PropName` because this
 * package cannot import the compiler.
 */
export const ENERGY_PROP_EXHIBIT_PLAN: readonly {
  readonly row: string;
  readonly water: boolean;
  readonly cells: readonly {
    readonly prop: EnergyPropName;
    readonly params: Record<string, unknown>;
  }[];
}[] = Object.freeze([
  {
    row: "energy_props",
    water: false,
    cells: [
      { prop: "wind_turbine", params: { yaw: 0 } },
      { prop: "wind_turbine", params: { yaw: 90 } },
      { prop: "wind_turbine", params: { height: 17, yaw: 0 } },
      { prop: "solar_array", params: { yaw: 0 } },
      { prop: "solar_array", params: { rows: 5, yaw: 90 } },
      { prop: "solar_array", params: { rows: 1, yaw: 180 } },
    ],
  },
]);

/* -------------------------------------------------------------------------- */
/* descriptors — Phase 4 leaf export (no self-registration)                    */
/* -------------------------------------------------------------------------- */

/**
 * Ordered prop descriptors for the energy pack, one per {@link ENERGY_PROP_NAMES}.
 *
 * - Delegates footprint param-dependently to {@link energyPropFootprint}:
 *   `wind_turbine` reads `height` clamped to
 *   {@link TURBINE_HEIGHT_MIN}–{@link TURBINE_HEIGHT_MAX}
 *   (default {@link TURBINE_HEIGHT_DEFAULT}), `solar_array` reads `rows`
 *   clamped to {@link SOLAR_ROWS_MIN}–{@link SOLAR_ROWS_MAX} (row length
 *   {@link SOLAR_ROW_LENGTH}). Same helper (`readInt`) as generator, so
 *   footprint and realization cannot drift.
 * - Generator is the leaf handle from {@link ENERGY_PROP_GENERATORS}.
 * - Insertion order equals {@link ENERGY_PROP_NAMES}; preserves LocalVoxelOp
 *   order and seeded draws in the leaf modules.
 */
export const ENERGY_PROP_DESCRIPTORS: readonly PropDescriptor[] = definePropDescriptors(ENERGY_PROP_NAMES, {
  footprint: (id, params) => energyPropFootprint(id, params),
  generator: ENERGY_PROP_GENERATORS,
});
