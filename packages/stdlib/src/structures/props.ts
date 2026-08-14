/**
 * `prop.place@0` — the vehicle-and-prop grammar.
 *
 * A settlement is not a set of houses; it is a set of houses plus the evidence
 * that somebody lives in them. A rowboat tied to a pier, a cart standing by a
 * lane, a fountain on the green: each of those is small, but each is what a
 * viewer reads as *inhabited*. This file is that vocabulary.
 *
 * It follows `building.grammar@0`'s contract exactly, and deliberately:
 *
 * - a prop is generated **unrotated, in node-local coordinates**, and returns
 *   {@link LocalVoxelOp}s carrying block *names* and property maps — nothing
 *   here knows what a block state id is;
 * - `y = 0` is the prop's **base plane**, and what that plane means is the
 *   prop's own declaration ({@link PropMeta.base}): for a land prop it is the
 *   first block *above* the ground, for a water prop it is the water surface
 *   itself. Ops below `y = 0` are legal, and are what a boat's hull and a
 *   fountain's floor are made of;
 * - every op lies inside `[0, sizeX) × [minY, minY + sizeY) × [0, sizeZ)`, so
 *   `rotateOps` maps the box onto its rotation with no special case and the
 *   caller can claim a footprint before it has generated anything.
 *
 * ## Fluid safety
 *
 * Two of these props meet water, and both are safe *by construction* rather
 * than by hope:
 *
 * - **boats** only ever replace water with solid. A hull course is written at
 *   and below the water line and a deck above it; no prop writes air, and
 *   removing water can never give a neighbouring water block a face to flow
 *   through that it did not already have.
 * - the **fountain** is the well's argument (see `plaza.ts`) at a larger
 *   scale: a solid floor one below the base plane, a solid rim ring *at* the
 *   base plane, and exactly one block of water inside it. Every water cell's
 *   four horizontal neighbours are rim, pillar or more water at the same
 *   level, and the block below is floor. There is nowhere for it to go.
 *
 * The compiler-side pass re-derives both claims from the emitted blocks rather
 * than trusting this comment.
 */

import { Rng, streamSeed, type Seed256 } from "../determinism/index.js";

import { sortOps, type LocalVoxelOp, type StructureYaw } from "./core.js";
import {
  AMUSEMENT_PROP_GENERATORS,
  AMUSEMENT_PROP_NAMES,
  amusementPropFootprint,
  isAmusementProp,
} from "./props-amusement.js";
import {
  BLITZ_PROP_GENERATORS,
  BLITZ_PROP_NAMES,
  blitzPropFootprint,
  isBlitzProp,
} from "./props-blitz.js";
import {
  ENERGY_PROP_GENERATORS,
  ENERGY_PROP_NAMES,
  energyPropFootprint,
  isEnergyProp,
} from "./props-energy.js";
// The classical Mediterranean pack's second half — the eight entries of §3.1
// that are things you walk past rather than into.
import {
  CLASSICAL_B_PROP_GENERATORS,
  CLASSICAL_B_PROP_NAMES,
  classicalBPropFootprint,
  isClassicalBProp,
} from "./props-classical-b.js";
// The alien & sci-fi pack's human response — the seven entries of §3.4 that
// are the invasion's human side: the cordon, the science and the soldiers.
import {
  RESPONSE_PROP_GENERATORS,
  RESPONSE_PROP_NAMES,
  isResponseProp,
  responsePropFootprint,
} from "./props-response.js";
// The nautical & pirate pack's shore props — the seven entries of §3.2 that
// stand on the quay, the strand and the headland rather than in the water.
import {
  BRINE_PROP_GENERATORS,
  BRINE_PROP_NAMES,
  brinePropFootprint,
  isBrineProp,
} from "./props-brine.js";
// The wilds & camps pack's ground pieces — the six entries of §3.6 that stand
// in a cut-over rather than roofing a room.
import {
  WILDS_PROP_GENERATORS,
  WILDS_PROP_NAMES,
  isWildsProp,
  wildsPropFootprint,
} from "./props-wilds.js";
// The agrarian expansion pack's ground pieces — the eight entries of §3.5 that
// stand in a yard or a field rather than roofing a room.
import {
  HEDGEROW_PROP_GENERATORS,
  HEDGEROW_PROP_NAMES,
  hedgerowPropFootprint,
  isHedgerowProp,
} from "./props-hedgerow.js";
// The frontier West pack's ground pieces — the three entries of §3.7 that
// stand on the ground rather than roofing a room or running along a route.
import {
  FRONTIER_PROP_GENERATORS,
  FRONTIER_PROP_NAMES,
  frontierPropFootprint,
  isFrontierProp,
} from "./props-frontier.js";
import {
  STREET_PROP_GENERATORS,
  STREET_PROP_NAMES,
  isStreetProp,
  streetPropFootprint,
} from "./props-street.js";
import {
  RELIC_PROP_GENERATORS,
  RELIC_PROP_NAMES,
  isRelicProp,
  relicPropFootprint,
} from "./props-relics.js";
import {
  SPECTACLE_PROP_GENERATORS,
  SPECTACLE_PROP_NAMES,
  isSpectacleProp,
  spectaclePropFootprint,
} from "./props-spectacle.js";
// The arcane & magical pack's props — the nine entries of §3.3 that are things
// you walk past rather than into: the inlaid ring, the waystone, the outcrop,
// the pool, the paddock, the orrery, the lantern run, the wyrm and the dial.
import {
  ARCANE_PROP_GENERATORS,
  ARCANE_PROP_NAMES,
  arcanePropFootprint,
  isArcaneProp,
} from "./props-arcane.js";
// The East Asian pack's props — the four entries of §3.9 that are things you
// walk past, under or along: the gate, the dry garden, the light at the turn
// of a path, and the boat.
import {
  EASTERN_PROP_GENERATORS,
  EASTERN_PROP_NAMES,
  easternPropFootprint,
  isEasternProp,
} from "./props-eastern.js";
import {
  CLASSICAL_PROP_GENERATORS,
  CLASSICAL_PROP_NAMES,
  classicalPropFootprint,
  isClassicalProp,
} from "./props-classical.js";
// The alien & sci-fi pack's organic props — the huddle and the wreck (§3.4).
import {
  XENO_PROP_GENERATORS,
  XENO_PROP_NAMES,
  isXenoProp,
  xenoPropFootprint,
} from "./props-xeno.js";
// The nautical & pirate pack's shore props — the flag, the law and the two
// hulls that are not afloat (§3.2).
import {
  CORSAIR_PROP_GENERATORS,
  CORSAIR_PROP_NAMES,
  corsairPropFootprint,
  isCorsairProp,
} from "./props-corsair.js";
// The Nile & ancient Egypt pack's props — the pyramid, the sacred lake and
// the felucca (§3.8). The pyramid is here rather than in the archetypes for
// the height-budget reason `props-nile.ts` states in full.
import {
  NILE_PROP_GENERATORS,
  NILE_PROP_NAMES,
  isNileProp,
  nilePropFootprint,
} from "./props-nile.js";
import {
  WAYSIDE_PROP_GENERATORS,
  WAYSIDE_PROP_NAMES,
  isWaysideProp,
  waysidePropFootprint,
} from "./props-wayside.js";
import { type BuildingMaterials } from "./themes.js";
// The two transport families live in files of their own — an airliner and a
// galleon are each longer than everything above put together — and are merged
// in here, which keeps `PROP_GENERATORS` the one place a prop is looked up.
// The import cycle (`props → aircraft → props`) is safe by construction:
// neither file reads a value of the other at module-evaluation time.
import { AIRCRAFT_FOOTPRINTS, AIRCRAFT_GENERATORS, AIRCRAFT_PROP_NAMES } from "./aircraft.js";
import { SHIP_FOOTPRINTS, SHIP_GENERATORS, SHIP_PROP_NAMES } from "./ships.js";
// Wave 6 adds a third transport family (rolling stock) and a second file to
// each of the other two. Same contract, same merge point.
import {
  AIRCRAFT6_FOOTPRINTS,
  AIRCRAFT6_GENERATORS,
  AIRCRAFT6_PROP_NAMES,
} from "./aircraft-wave6.js";
import { SHIP6_FOOTPRINTS, SHIP6_GENERATORS, SHIP6_PROP_NAMES } from "./ships-wave6.js";
import {
  RAILCRAFT_FOOTPRINTS,
  RAILCRAFT_GENERATORS,
  RAILCRAFT_PROP_NAMES,
} from "./railcraft.js";

/* -------------------------------------------------------------------------- */
/* the catalog                                                                 */
/* -------------------------------------------------------------------------- */

/** Every prop `prop.place@0` knows how to build, in catalog order. */
export const PROP_NAMES = [
  "rowboat",
  "fishing_sloop",
  "pier",
  "cart",
  "covered_wagon",
  "rail_line",
  "fountain",
  "gazebo",
  "statue_plinth",
  ...AIRCRAFT_PROP_NAMES,
  ...SHIP_PROP_NAMES,
  ...AIRCRAFT6_PROP_NAMES,
  ...SHIP6_PROP_NAMES,
  ...RAILCRAFT_PROP_NAMES,
  ...BLITZ_PROP_NAMES,
  ...STREET_PROP_NAMES,
  ...AMUSEMENT_PROP_NAMES,
  ...WAYSIDE_PROP_NAMES,
  ...RELIC_PROP_NAMES,
  ...SPECTACLE_PROP_NAMES,
  ...CLASSICAL_PROP_NAMES,
  ...XENO_PROP_NAMES,
  ...CORSAIR_PROP_NAMES,
  ...NILE_PROP_NAMES,
  ...ENERGY_PROP_NAMES,
  ...CLASSICAL_B_PROP_NAMES,
  ...ARCANE_PROP_NAMES,
  ...EASTERN_PROP_NAMES,
  ...RESPONSE_PROP_NAMES,
  ...BRINE_PROP_NAMES,
  ...WILDS_PROP_NAMES,
  ...HEDGEROW_PROP_NAMES,
  ...FRONTIER_PROP_NAMES,
] as const;

/** A prop name. */
export type PropName = (typeof PROP_NAMES)[number];

/** True for a name in the catalog. */
export function isPropName(name: string): name is PropName {
  return (PROP_NAMES as readonly string[]).includes(name);
}

/**
 * What a prop's `y = 0` plane means, and therefore where the placer puts it.
 *
 * - `ground` — the first block above the solid surface;
 * - `water` — the water *surface* block, so `y = -1` is submerged;
 * - `shore` — the first block above a **dry** column that has water within
 *   reach; the prop grows out over it.
 */
export type PropBase = "ground" | "water" | "shore";

/** The static facts a placer needs before it generates anything. */
export interface PropMeta {
  readonly prop: PropName;
  /** Unrotated extents, `[sizeX, sizeY, sizeZ]`. */
  readonly size: readonly [number, number, number];
  /** Lowest local `y` the op list uses; `size[1]` counts from here. */
  readonly minY: number;
  readonly base: PropBase;
  /**
   * Local columns whose support must be carried down to solid ground by the
   * caller — a pier's piles. Empty for every prop that stands on the ground.
   */
  readonly piles: readonly { readonly x: number; readonly z: number }[];
  /**
   * The local column another prop should anchor to, when this one is something
   * that can be moored at. A pier's is its seaward end.
   */
  readonly anchor?: { readonly x: number; readonly z: number };
}

/** What one prop generated. */
export interface PropResult {
  readonly ops: LocalVoxelOp[];
  readonly meta: PropMeta;
}

/** Everything {@link generateProp} reads. */
export interface PropRequest {
  readonly prop: string;
  /** The node's 256-bit seed; every draw here is a stream of it. */
  readonly seed: Seed256;
  /** Generator params, straight off the node. Unknown keys are ignored. */
  readonly params?: Readonly<Record<string, unknown>>;
  /** The theme triple this prop was dealt, if the caller assigned one. */
  readonly materials?: BuildingMaterials;
  /** Block-id overrides for the palette symbols. */
  readonly style?: Readonly<Record<string, string>>;
}

/** A prop generator: params and palette in, node-local ops out. */
export type PropGenerator = (ctx: PropContext) => PropResult;

/* -------------------------------------------------------------------------- */
/* palette                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The prop grammar's material symbols and their defaults.
 *
 * Same mechanism as `BUILDING_STYLE_DEFAULTS`: a caller that passes
 * `materials` gets the theme's woods and stones underneath its own `style`
 * overrides, and a caller that passes neither gets these.
 */
export const PROP_STYLE_DEFAULTS: Readonly<Record<string, string>> = Object.freeze({
  "prop.planks": "oak_planks",
  "prop.log": "oak_log",
  "prop.stripped": "stripped_oak_log",
  "prop.stairs": "oak_stairs",
  "prop.slab": "oak_slab",
  "prop.fence": "oak_fence",
  "prop.trapdoor": "spruce_trapdoor",
  "prop.stone": "cobblestone",
  "prop.stone_accent": "stone_bricks",
  "prop.stone_stairs": "stone_brick_stairs",
  "prop.stone_slab": "stone_brick_slab",
  "prop.stone_wall": "cobblestone_wall",
  "prop.roof_stairs": "dark_oak_stairs",
  "prop.roof_slab": "dark_oak_slab",
  "prop.sail": "white_wool",
  "prop.bed": "gravel",
  "prop.rail": "rail",
  "prop.lantern": "lantern",
  "prop.cargo": "barrel",
  "prop.hay": "hay_block",
  // The forestay. `chain` would be the obvious block and is not in the pinned
  // block table (1.21.11 via minecraft-data), so the rigging is bars; a
  // document that wants a chain says so through `style`.
  "prop.chain": "iron_bars",
});

/** Sail and canvas wools, in draw order — a harbour is not all one white. */
export const SAIL_WOOLS: readonly string[] = Object.freeze([
  "white_wool",
  "light_gray_wool",
  "red_wool",
  "light_blue_wool",
  "yellow_wool",
]);

/** The resolved block ids one prop builds from. */
export interface PropPalette {
  readonly planks: string;
  readonly log: string;
  readonly stripped: string;
  readonly stairs: string;
  readonly slab: string;
  readonly fence: string;
  readonly trapdoor: string;
  readonly stone: string;
  readonly stoneAccent: string;
  readonly stoneStairs: string;
  readonly stoneSlab: string;
  readonly stoneWall: string;
  readonly roofStairs: string;
  readonly roofSlab: string;
  readonly sail: string;
  readonly bed: string;
  readonly rail: string;
  readonly lantern: string;
  readonly cargo: string;
  readonly hay: string;
  readonly chain: string;
}

/** Flatten a theme triple into the prop grammar's symbol map. */
export function propSymbolsOf(m: BuildingMaterials): Record<string, string> {
  return {
    "prop.planks": m.wood.planks,
    "prop.log": m.wood.log,
    "prop.stripped": m.wood.stripped,
    "prop.stairs": m.wood.stairs,
    "prop.slab": m.wood.slab,
    "prop.fence": m.wood.fence,
    "prop.trapdoor": m.wood.trapdoor,
    "prop.stone": m.stone.primary,
    "prop.stone_accent": m.stone.accent,
    "prop.stone_stairs": m.stone.stairs,
    "prop.stone_slab": m.stone.slab,
    "prop.stone_wall": m.stone.wall,
    "prop.roof_stairs": m.roof.stairs,
    "prop.roof_slab": m.roof.slab,
  };
}

/** Resolve defaults, theme and overrides into one palette. */
export function resolvePropPalette(
  materials?: BuildingMaterials,
  style?: Readonly<Record<string, string>>,
): PropPalette {
  const map: Record<string, string> = {
    ...PROP_STYLE_DEFAULTS,
    ...(materials === undefined ? {} : propSymbolsOf(materials)),
    ...(style ?? {}),
  };
  const s = (key: string): string => map[key] as string;
  return {
    planks: s("prop.planks"),
    log: s("prop.log"),
    stripped: s("prop.stripped"),
    stairs: s("prop.stairs"),
    slab: s("prop.slab"),
    fence: s("prop.fence"),
    trapdoor: s("prop.trapdoor"),
    stone: s("prop.stone"),
    stoneAccent: s("prop.stone_accent"),
    stoneStairs: s("prop.stone_stairs"),
    stoneSlab: s("prop.stone_slab"),
    stoneWall: s("prop.stone_wall"),
    roofStairs: s("prop.roof_stairs"),
    roofSlab: s("prop.roof_slab"),
    sail: s("prop.sail"),
    bed: s("prop.bed"),
    rail: s("prop.rail"),
    lantern: s("prop.lantern"),
    cargo: s("prop.cargo"),
    hay: s("prop.hay"),
    chain: s("prop.chain"),
  };
}

/* -------------------------------------------------------------------------- */
/* generation context                                                          */
/* -------------------------------------------------------------------------- */

/** What a {@link PropGenerator} is handed. */
export interface PropContext {
  readonly palette: PropPalette;
  readonly params: Readonly<Record<string, unknown>>;
  readonly seed: Seed256;
  /** Place one block. A later write to a cell replaces an earlier one. */
  readonly put: (
    x: number,
    y: number,
    z: number,
    block: string,
    props?: Record<string, string>,
  ) => void;
  /** A named RNG stream of this prop's node seed. */
  readonly rng: (stream: string) => Rng;
}

/** Read an integer param, clamped, with a default. */
export function intParam(
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

/** Read a boolean param with a default. */
export function boolParam(
  params: Readonly<Record<string, unknown>>,
  key: string,
  fallback: boolean,
): boolean {
  const raw = params[key];
  return typeof raw === "boolean" ? raw : fallback;
}

/**
 * Generate one prop.
 *
 * Throws on an unknown name rather than returning empty: the validator rejects
 * unknown prop names with a fix hint long before this, so reaching here with
 * one is a compiler bug and should be loud.
 */
export function generateProp(request: PropRequest): PropResult {
  const generator = PROP_GENERATORS[request.prop];
  if (generator === undefined) {
    throw new RangeError(
      `unknown prop "${request.prop}"; prop.place@0 builds one of: ${PROP_NAMES.join(", ")}`,
    );
  }
  const cells = new Map<string, LocalVoxelOp>();
  const ctx: PropContext = {
    palette: resolvePropPalette(request.materials, request.style),
    params: request.params ?? {},
    seed: request.seed,
    put: (x, y, z, block, props) => {
      cells.set(`${x},${y},${z}`, { x, y, z, block, ...(props === undefined ? {} : { props }) });
    },
    rng: (stream) => new Rng(streamSeed(request.seed, `prop.${stream}`)),
  };
  const result = generator(ctx);
  return { ops: sortOps([...cells.values()]), meta: result.meta };
}

/** Bounds of an op list — `[sizeX, sizeY, sizeZ]` and the min corner. */
export function propBounds(ops: readonly LocalVoxelOp[]): {
  readonly size: readonly [number, number, number];
  readonly minY: number;
  readonly minX: number;
  readonly minZ: number;
} {
  if (ops.length === 0) return { size: [0, 0, 0], minY: 0, minX: 0, minZ: 0 };
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const op of ops) {
    if (op.x < minX) minX = op.x;
    if (op.x > maxX) maxX = op.x;
    if (op.y < minY) minY = op.y;
    if (op.y > maxY) maxY = op.y;
    if (op.z < minZ) minZ = op.z;
    if (op.z > maxZ) maxZ = op.z;
  }
  return { size: [maxX - minX + 1, maxY - minY + 1, maxZ - minZ + 1], minY, minX, minZ };
}

/**
 * The declared footprint of a prop, without generating it.
 *
 * The placer needs this *before* it knows where the prop goes — it is what it
 * searches for room for. Params that change the extents (a pier's `length`, a
 * rail line's) are read here exactly as the generator reads them, and
 * `test/props.test.ts` asserts the two agree for every prop and every param.
 */
export function propFootprint(
  prop: PropName,
  params: Readonly<Record<string, unknown>> = {},
): {
  readonly size: readonly [number, number, number];
  readonly minY: number;
  readonly base: PropBase;
} {
  // The transport families declare their own boxes, in their own files, from
  // the same table their generators build against.
  const air = AIRCRAFT_FOOTPRINTS[prop];
  if (air !== undefined) return { ...air(params), base: "ground" };
  const ship = SHIP_FOOTPRINTS[prop];
  if (ship !== undefined) return ship(params);
  const air6 = AIRCRAFT6_FOOTPRINTS[prop];
  if (air6 !== undefined) return { ...air6(), base: "ground" };
  const ship6 = SHIP6_FOOTPRINTS[prop];
  if (ship6 !== undefined) return ship6();
  const rail = RAILCRAFT_FOOTPRINTS[prop];
  if (rail !== undefined) return { ...rail(), base: "ground" };

  if (isBlitzProp(prop)) return blitzPropFootprint(prop, params);
  if (isStreetProp(prop)) return streetPropFootprint(prop, params);
  if (isAmusementProp(prop)) return amusementPropFootprint(prop);
  if (isWaysideProp(prop)) return waysidePropFootprint(prop);
  if (isRelicProp(prop)) return relicPropFootprint(prop);
  if (isSpectacleProp(prop)) return spectaclePropFootprint(prop);
  if (isClassicalProp(prop)) return classicalPropFootprint(prop);
  if (isXenoProp(prop)) return xenoPropFootprint(prop);
  if (isCorsairProp(prop)) return corsairPropFootprint(prop);
  if (isNileProp(prop)) return nilePropFootprint(prop);
  if (isEnergyProp(prop)) return energyPropFootprint(prop, params);
  if (isClassicalBProp(prop)) return classicalBPropFootprint(prop, params);
  if (isArcaneProp(prop)) return arcanePropFootprint(prop, params);
  if (isEasternProp(prop)) return easternPropFootprint(prop);
  if (isResponseProp(prop)) return responsePropFootprint(prop);
  if (isBrineProp(prop)) return brinePropFootprint(prop, params);
  if (isWildsProp(prop)) return wildsPropFootprint(prop, params);
  if (isHedgerowProp(prop)) return hedgerowPropFootprint(prop, params);
  if (isFrontierProp(prop)) return frontierPropFootprint(prop, params);
  switch (prop) {
    case "rowboat":
      return { size: [5, 3, 3], minY: -1, base: "water" };
    case "fishing_sloop":
      return { size: [9, 8, 4], minY: -1, base: "water" };
    case "pier": {
      const length = intParam(params, "length", 8, 3, 32);
      const width = intParam(params, "width", 2, 1, 5);
      return { size: [width, 4, length], minY: -1, base: "shore" };
    }
    case "cart":
      return { size: [4, 3, 3], minY: 0, base: "ground" };
    case "covered_wagon":
      return { size: [4, 5, 3], minY: 0, base: "ground" };
    case "rail_line": {
      const length = intParam(params, "length", 12, 5, 64);
      const curve = boolParam(params, "curve", false);
      const grade = intParam(params, "grade", 0, 0, 4);
      return { size: [length, 5 + grade, curve ? 6 : 3], minY: -1, base: "ground" };
    }
    case "fountain":
      return { size: [7, 5, 7], minY: -1, base: "ground" };
    case "gazebo":
      return { size: [7, 6, 7], minY: 0, base: "ground" };
    case "statue_plinth":
    default:
      return { size: [3, 5, 3], minY: 0, base: "ground" };
  }
}

/* -------------------------------------------------------------------------- */
/* boats                                                                       */
/* -------------------------------------------------------------------------- */

/** The hull plan of a boat: which local columns carry hull. */
function hullColumns(sizeX: number, sizeZ: number): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  for (let x = 0; x < sizeX; x++) {
    // The bow and stern columns taper to the inner rows, which is what makes a
    // rectangle read as a boat from above.
    const taper = x === 0 || x === sizeX - 1;
    for (let z = 0; z < sizeZ; z++) {
      if (taper && (z === 0 || z === sizeZ - 1)) continue;
      out.push({ x, z });
    }
  }
  return out;
}

/** The gunwale course: a low rail of top trapdoors around a hull's edge. */
function gunwale(ctx: PropContext, hull: readonly { x: number; z: number }[], sizeX: number, sizeZ: number): void {
  for (const { x, z } of hull) {
    const edge = z === 0 || z === sizeZ - 1 || x === 0 || x === sizeX - 1;
    if (!edge) continue;
    ctx.put(x, 1, z, ctx.palette.trapdoor, {
      facing: z === 0 ? "north" : z === sizeZ - 1 ? "south" : x === 0 ? "west" : "east",
      half: "top",
      open: "false",
    });
  }
}

/**
 * `rowboat` — 5 × 3, one oar a side.
 *
 * `y = -1` is the submerged hull course, `y = 0` the deck at the water line,
 * `y = 1` the gunwale, its posts and its oars. Hull and deck are solid
 * throughout, so the boat displaces water rather than trapping a pocket of
 * air below the surface.
 */
const rowboat: PropGenerator = (ctx) => {
  const { put, palette } = ctx;
  const sizeX = 5;
  const sizeZ = 3;
  const hull = hullColumns(sizeX, sizeZ);
  for (const { x, z } of hull) {
    put(x, -1, z, palette.stripped, { axis: "x" });
    put(x, 0, z, palette.planks);
  }
  gunwale(ctx, hull, sizeX, sizeZ);
  // Bow and stern posts, and a thwart to sit on.
  put(0, 1, 1, palette.fence);
  put(sizeX - 1, 1, 1, palette.fence);
  put(2, 1, 1, palette.slab, { type: "bottom" });
  // The oars: open trapdoors standing out from the rowing station, one a side.
  put(1, 1, 0, palette.trapdoor, { facing: "south", half: "bottom", open: "true" });
  put(1, 1, sizeZ - 1, palette.trapdoor, { facing: "north", half: "bottom", open: "true" });
  // One seeded flourish: about half the rowboats carry a crate aft.
  if (ctx.rng("rowboat").float() < 0.5) put(3, 1, 1, palette.cargo, { facing: "up" });

  return {
    ops: [],
    meta: { prop: "rowboat", size: [sizeX, 3, sizeZ], minY: -1, base: "water", piles: [] },
  };
};

/**
 * `fishing_sloop` — 9 × 4, mast, sail and tiller.
 *
 * The sail is a fore-and-aft plane on the centre line, which is what a working
 * sloop carries; the mast passes through it, so the sail is the plane minus
 * the mast's own column.
 */
const fishingSloop: PropGenerator = (ctx) => {
  const { put, palette } = ctx;
  const sizeX = 9;
  const sizeZ = 4;
  const hull = hullColumns(sizeX, sizeZ);
  for (const { x, z } of hull) {
    put(x, -1, z, palette.stripped, { axis: "x" });
    put(x, 0, z, palette.planks);
  }
  gunwale(ctx, hull, sizeX, sizeZ);
  // Mast, stepped on the deck at the centre line, with a masthead lantern.
  const mastX = 4;
  const mastZ = 1;
  for (let y = 1; y <= 5; y++) put(mastX, y, mastZ, palette.log, { axis: "y" });
  put(mastX, 6, mastZ, palette.lantern, { hanging: "false" });
  // The sail: the fore-and-aft plane, mast column excepted.
  const sail = SAIL_WOOLS[ctx.rng("sail").int(0, SAIL_WOOLS.length - 1)] as string;
  for (let x = 2; x <= 6; x++) {
    if (x === mastX) continue;
    for (let y = 2; y <= 4; y++) put(x, y, mastZ, sail);
  }
  // Tiller at the stern, a chain stay forward, and deck cargo between them.
  put(0, 1, 1, palette.fence);
  put(0, 1, 2, palette.trapdoor, { facing: "east", half: "bottom", open: "true" });
  put(sizeX - 1, 1, 2, palette.chain);
  put(6, 1, 2, palette.cargo, { facing: "up" });
  put(2, 1, 2, palette.slab, { type: "bottom" });

  return {
    ops: [],
    meta: { prop: "fishing_sloop", size: [sizeX, 8, sizeZ], minY: -1, base: "water", piles: [] },
  };
};

/* -------------------------------------------------------------------------- */
/* pier                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * `pier` — a plank walkway on log piles, running out from the shore.
 *
 * Local `+z` is seaward: `z = 0` stands on the shore column the placer found,
 * `z = length - 1` is the seaward end and the {@link PropMeta.anchor} a boat
 * moors to. The piles are *declared* rather than drawn to the bed: this
 * grammar has no idea how deep the water is, so it emits the pile head at
 * `y = -1`, lists the column, and the caller carries it down.
 */
const pier: PropGenerator = ({ put, palette, params }) => {
  const length = intParam(params, "length", 8, 3, 32);
  const width = intParam(params, "width", 2, 1, 5);
  const piles: { x: number; z: number }[] = [];

  for (let z = 0; z < length; z++) {
    for (let x = 0; x < width; x++) {
      put(x, 0, z, palette.planks);
      // A pile course every third bay, and always under the seaward end.
      const bay = z % 3 === 0 || z === length - 1;
      const outer = x === 0 || x === width - 1;
      if (bay && outer) {
        put(x, -1, z, palette.log, { axis: "y" });
        piles.push({ x, z });
      }
    }
  }
  // Mooring posts at the seaward corners and halfway along, so the walkway
  // does not read as a floating plank; lanterns on the seaward pair.
  for (const z of [length - 1, Math.max(1, (length - 1) >> 1)]) {
    for (const x of [0, width - 1]) put(x, 1, z, palette.fence);
  }
  put(0, 2, length - 1, palette.lantern, { hanging: "false" });
  if (width > 1) put(width - 1, 2, length - 1, palette.lantern, { hanging: "false" });

  return {
    ops: [],
    meta: {
      prop: "pier",
      size: [width, 4, length],
      minY: -1,
      base: "shore",
      piles,
      anchor: { x: width >> 1, z: length - 1 },
    },
  };
};

/* -------------------------------------------------------------------------- */
/* carts                                                                       */
/* -------------------------------------------------------------------------- */

/** The chassis both cart variants share: wheels, bed and side boards. */
function cartChassis(ctx: PropContext, sizeX: number, sizeZ: number): void {
  const { put, palette } = ctx;
  // Wheels and axle: stripped-log ends, axis along z so the grain reads as a
  // hub from the side. That axis is the thing a quarter turn has to swap, and
  // `rotateProps` does.
  for (const x of [0, sizeX - 1]) {
    for (let z = 0; z < sizeZ; z++) put(x, 0, z, palette.stripped, { axis: "z" });
  }
  for (let x = 0; x < sizeX; x++) {
    for (let z = 0; z < sizeZ; z++) put(x, 1, z, palette.planks);
  }
  // Side boards: open trapdoors standing on the bed's long edges, plus a
  // tailboard at the back.
  for (let x = 0; x < sizeX; x++) {
    put(x, 2, 0, palette.trapdoor, { facing: "south", half: "bottom", open: "true" });
    put(x, 2, sizeZ - 1, palette.trapdoor, { facing: "north", half: "bottom", open: "true" });
  }
  put(0, 2, 1, palette.trapdoor, { facing: "east", half: "bottom", open: "true" });
}

/** `cart` — 4 × 3, a plank bed on four wheels with a load in it. */
const cart: PropGenerator = (ctx) => {
  const sizeX = 4;
  const sizeZ = 3;
  cartChassis(ctx, sizeX, sizeZ);
  if (ctx.rng("cart.load").float() < 0.5) ctx.put(2, 2, 1, ctx.palette.hay, { axis: "y" });
  else ctx.put(2, 2, 1, ctx.palette.cargo, { facing: "up" });
  return {
    ops: [],
    meta: { prop: "cart", size: [sizeX, 3, sizeZ], minY: 0, base: "ground", piles: [] },
  };
};

/** `covered_wagon` — the same chassis under a wool arc on hoops. */
const coveredWagon: PropGenerator = (ctx) => {
  const { put, palette } = ctx;
  const sizeX = 4;
  const sizeZ = 3;
  cartChassis(ctx, sizeX, sizeZ);
  const canvas = SAIL_WOOLS[ctx.rng("wagon.canvas").int(0, SAIL_WOOLS.length - 1)] as string;
  // The arc: shoulders one block below the ridge, repeated down the bed.
  for (let x = 0; x < sizeX; x++) {
    put(x, 3, 0, canvas);
    put(x, 3, sizeZ - 1, canvas);
    put(x, 4, 1, canvas);
  }
  return {
    ops: [],
    meta: { prop: "covered_wagon", size: [sizeX, 5, sizeZ], minY: 0, base: "ground", piles: [] },
  };
};

/* -------------------------------------------------------------------------- */
/* rail line                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * `rail_line` — a short decorative line with a platform beside it.
 *
 * The line runs along local `+x` at `z = 2`; the platform is `z = 0..1`, so a
 * viewer standing on it looks south at the track. Buffers cap both ends. No
 * entity is placed: a minecart is an entity, and everything this compiler
 * emits has to survive a load-save round trip as blocks.
 *
 * Two params make this the test bed for the rail-state pass:
 *
 * - `grade` raises the last *n* track cells one block each, which is what an
 *   `ascending_*` shape has to be derived from;
 * - `curve` adds a spur turning south near the far end, which is what a corner
 *   shape has to be derived from.
 *
 * Every rail is emitted with the block's *default* shape. Shape is a property
 * of a neighbourhood, not of a placement — the cell east of a rail may be
 * written by a different pass entirely — so it is computed once at the end by
 * `emit/connections.ts`, on the same argument that gave fences their
 * connections.
 */
const railLine: PropGenerator = ({ put, palette, params }) => {
  const length = intParam(params, "length", 12, 5, 64);
  const curve = boolParam(params, "curve", false);
  const grade = intParam(params, "grade", 0, 0, 4);
  const platform = boolParam(params, "platform", true);
  const railZ = 2;
  const sizeZ = curve ? 6 : 3;

  /** Rail-head height at track cell `x`: flat, then one step per graded cell. */
  const heightAt = (x: number): number => {
    if (grade === 0) return 0;
    const from = length - 1 - grade;
    return x <= from ? 0 : Math.min(grade, x - from);
  };

  for (let x = 0; x < length; x++) {
    const y = heightAt(x);
    // Ballast from the base plane up to just under the rail head, so a graded
    // line rides an embankment rather than floating.
    for (let b = -1; b < y; b++) put(x, b, railZ, palette.bed);
    if (x === 0 || x === length - 1) {
      put(x, y, railZ, palette.stone); // buffer block
      put(x, y + 1, railZ, palette.fence); // buffer stop
      continue;
    }
    put(x, y, railZ, palette.rail);
  }

  if (curve) {
    // The spur: two cells running south off a track cell, then a buffer. The
    // corner cell has a west neighbour and a south neighbour, which is exactly
    // one curve shape and no other.
    const spurX = length - 2;
    const y = heightAt(spurX);
    for (let z = railZ + 1; z <= railZ + 2; z++) {
      for (let b = -1; b < y; b++) put(spurX, b, z, palette.bed);
      put(spurX, y, z, palette.rail);
    }
    for (let b = -1; b < y; b++) put(spurX, b, railZ + 3, palette.bed);
    put(spurX, y, railZ + 3, palette.stone);
    put(spurX, y + 1, railZ + 3, palette.fence);
  }

  if (platform) {
    for (let x = 0; x < length; x++) {
      for (let z = 0; z <= 1; z++) put(x, 0, z, palette.planks);
    }
    // Two posts carrying a slab roof, and a bench facing the track. Everything
    // is inset from the ends so the roof does not overhang the buffers.
    for (const x of [2, length - 3]) {
      for (let y = 1; y <= 2; y++) put(x, y, 0, palette.log, { axis: "y" });
    }
    for (let x = 1; x <= length - 2; x++) {
      put(x, 3, 0, palette.roofSlab, { type: "bottom" });
      put(x, 3, 1, palette.roofSlab, { type: "bottom" });
    }
    const bench = length >> 1;
    put(bench, 1, 1, palette.stairs, { facing: "south", half: "bottom", shape: "straight" });
    put(1, 1, 1, palette.lantern, { hanging: "false" });
  }

  return {
    ops: [],
    meta: {
      prop: "rail_line",
      size: [length, 5 + grade, sizeZ],
      minY: -1,
      base: "ground",
      piles: [],
    },
  };
};

/* -------------------------------------------------------------------------- */
/* fountain, gazebo, statue                                                    */
/* -------------------------------------------------------------------------- */

/**
 * `fountain` — 7 × 7, one block of water, stable by construction.
 *
 * `y = -1` is a solid floor across the whole footprint. `y = 0` is the rim
 * ring (solid, all 24 perimeter cells) and, inside it, 24 water cells around
 * the centre pillar. Every water cell's four horizontal neighbours are rim,
 * pillar or water at the same level, and the cell below every one of them is
 * floor. The one-tick spread simulation has nothing to find.
 *
 * The jet is a *column*, not a source over air: masonry to `y = 2`, capped
 * with a slab. A source block up there would flow, and a fountain that floods
 * the village green is worse than a fountain that does not sparkle.
 */
const fountain: PropGenerator = ({ put, palette }) => {
  const size = 7;
  const last = size - 1;
  for (let x = 0; x < size; x++) {
    for (let z = 0; z < size; z++) {
      put(x, -1, z, palette.stone);
      const rim = x === 0 || z === 0 || x === last || z === last;
      if (rim) {
        put(x, 0, z, palette.stoneAccent);
        // A decorative wall course on the rim, one block up. A wall is not a
        // full cube, but it stands *on* the rim rather than beside the water,
        // so it is never a face the water could use.
        put(x, 1, z, palette.stoneWall);
        continue;
      }
      if (x === 3 && z === 3) continue; // the pillar's column
      put(x, 0, z, "water", { level: "0" });
    }
  }
  for (let y = 0; y <= 2; y++) put(3, y, 3, palette.stoneAccent);
  put(3, 3, 3, palette.stoneSlab, { type: "bottom" });
  // Corner lanterns, standing on the rim's wall course.
  for (const [x, z] of [
    [0, 0],
    [0, last],
    [last, 0],
    [last, last],
  ] as const) {
    put(x, 2, z, palette.lantern, { hanging: "false" });
  }
  return {
    ops: [],
    meta: { prop: "fountain", size: [size, 5, size], minY: -1, base: "ground", piles: [] },
  };
};

/** The octagon mask of a square footprint: the square with its corners cut. */
export function octagonCells(size: number): { x: number; z: number }[] {
  const c = (size - 1) / 2;
  const out: { x: number; z: number }[] = [];
  for (let x = 0; x < size; x++) {
    for (let z = 0; z < size; z++) {
      if (Math.abs(x - c) + Math.abs(z - c) > c + 1) continue;
      out.push({ x, z });
    }
  }
  return out;
}

/**
 * `gazebo` — an open octagon of posts under a slab roof.
 *
 * Floor at `y = 0` (one step up from the ground, which is what makes it read
 * as a structure rather than as a patch of paving), posts to `y = 3`, roof at
 * `y = 4` with a cap at `y = 5`. The middle of the south face is left open as
 * the way in.
 */
const gazebo: PropGenerator = ({ put, palette }) => {
  const size = 7;
  const cells = octagonCells(size);
  const inside = new Set(cells.map((c) => `${c.x},${c.z}`));
  const c = (size - 1) / 2;
  for (const { x, z } of cells) put(x, 0, z, palette.stoneSlab, { type: "top" });

  const posts: readonly (readonly [number, number])[] = [
    [0, 3],
    [6, 3],
    [3, 0],
    // The south face is the way in, so its post is split into a pair either
    // side of the opening rather than standing in the middle of it.
    [2, 6],
    [4, 6],
    [1, 1],
    [5, 1],
    [1, 5],
    [5, 5],
  ];
  for (const [x, z] of posts) {
    for (let y = 1; y <= 3; y++) put(x, y, z, palette.log, { axis: "y" });
  }
  // Balustrade around the boundary of the octagon — a floor cell with at least
  // one of its four neighbours outside — with the south face left open.
  for (const { x, z } of cells) {
    const boundary =
      !inside.has(`${x - 1},${z}`) ||
      !inside.has(`${x + 1},${z}`) ||
      !inside.has(`${x},${z - 1}`) ||
      !inside.has(`${x},${z + 1}`);
    if (!boundary) continue;
    if (z === size - 1 && x === 3) continue; // the way in
    if (posts.some(([px, pz]) => px === x && pz === z)) continue;
    put(x, 1, z, palette.fence);
  }
  // Roof: a full octagon of slabs, then a smaller cap, and a lantern hung from
  // the ridge over the middle of the floor.
  for (const { x, z } of cells) put(x, 4, z, palette.roofSlab, { type: "bottom" });
  for (const { x, z } of cells) {
    if (Math.abs(x - c) + Math.abs(z - c) > 2) continue;
    put(x, 5, z, palette.roofSlab, { type: "top" });
  }
  put(c, 3, c, palette.lantern, { hanging: "true" });
  return {
    ops: [],
    meta: { prop: "gazebo", size: [size, 6, size], minY: 0, base: "ground", piles: [] },
  };
};

/**
 * `statue_plinth` — a stone base with a blocky figure on it.
 *
 * No armour stand and no entity of any kind: the figure is blocks, because
 * nothing this compiler emits may depend on entity data it did not write.
 */
const statuePlinth: PropGenerator = ({ put, palette }) => {
  for (let x = 0; x < 3; x++) {
    for (let z = 0; z < 3; z++) put(x, 0, z, palette.stone);
  }
  // Cornice: stairs facing out on the four edge cells, plain masonry at the
  // corners and under the figure.
  put(1, 1, 0, palette.stoneStairs, { facing: "north", half: "top", shape: "straight" });
  put(1, 1, 2, palette.stoneStairs, { facing: "south", half: "top", shape: "straight" });
  put(0, 1, 1, palette.stoneStairs, { facing: "west", half: "top", shape: "straight" });
  put(2, 1, 1, palette.stoneStairs, { facing: "east", half: "top", shape: "straight" });
  for (const [x, z] of [
    [0, 0],
    [0, 2],
    [2, 0],
    [2, 2],
    [1, 1],
  ] as const) {
    put(x, 1, z, palette.stoneAccent);
  }
  // The figure: legs, torso, two outstretched arms of wall post, and a head.
  put(1, 2, 1, palette.stoneAccent);
  put(1, 3, 1, palette.stoneAccent);
  put(0, 3, 1, palette.stoneWall);
  put(2, 3, 1, palette.stoneWall);
  put(1, 4, 1, palette.stone);
  return {
    ops: [],
    meta: { prop: "statue_plinth", size: [3, 5, 3], minY: 0, base: "ground", piles: [] },
  };
};

/* -------------------------------------------------------------------------- */
/* registry                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Prop name → generator.
 *
 * The one place a prop is looked up. Callers — the settlement dressing pass,
 * the dev-world exhibits — go through this map rather than importing nine
 * generators one by one, so adding a prop is one entry here and one name in
 * {@link PROP_NAMES}.
 */
export const PROP_GENERATORS: Readonly<Record<string, PropGenerator>> = Object.freeze({
  rowboat,
  fishing_sloop: fishingSloop,
  pier,
  cart,
  covered_wagon: coveredWagon,
  rail_line: railLine,
  fountain,
  gazebo,
  statue_plinth: statuePlinth,
  ...AIRCRAFT_GENERATORS,
  ...SHIP_GENERATORS,
  ...AIRCRAFT6_GENERATORS,
  ...SHIP6_GENERATORS,
  ...RAILCRAFT_GENERATORS,
  ...BLITZ_PROP_GENERATORS,
  ...STREET_PROP_GENERATORS,
  ...AMUSEMENT_PROP_GENERATORS,
  ...WAYSIDE_PROP_GENERATORS,
  ...RELIC_PROP_GENERATORS,
  ...SPECTACLE_PROP_GENERATORS,
  ...CLASSICAL_PROP_GENERATORS,
  ...XENO_PROP_GENERATORS,
  ...CORSAIR_PROP_GENERATORS,
  ...NILE_PROP_GENERATORS,
  ...ENERGY_PROP_GENERATORS,
  ...CLASSICAL_B_PROP_GENERATORS,
  ...ARCANE_PROP_GENERATORS,
  ...EASTERN_PROP_GENERATORS,
  ...RESPONSE_PROP_GENERATORS,
  ...BRINE_PROP_GENERATORS,
  ...WILDS_PROP_GENERATORS,
  ...HEDGEROW_PROP_GENERATORS,
  ...FRONTIER_PROP_GENERATORS,
});

/** The four quarter turns, in order — the yaws a prop may be placed at. */
export const PROP_YAWS: readonly StructureYaw[] = Object.freeze([0, 90, 180, 270] as const);
