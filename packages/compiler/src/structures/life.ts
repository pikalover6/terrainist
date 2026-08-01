/**
 * C3 — **the life pass**: incident at eye level.
 *
 * Fabric v2 gave the city buildings and streets; Kai walked it and said the
 * worlds "lack a lot of immersion, 'wow' factor". The diagnosis in
 * `docs/DESIGN.md` ("Fabric v3 — the city") names the cause precisely: a player
 * standing on a pavement sees a correct building, a correct kerb, a lamp every
 * fourteen blocks, and *nothing else*. What reads as alive is density of small,
 * specific detail within about twenty blocks of the eye — awnings over
 * shopfronts, a banner, crates by a service door, a balcony two floors up, an
 * air-conditioning unit rattling on a side wall, a car at the kerb, a run of
 * market stalls on the square, and light behind a window at night.
 *
 * This module is that stage, and it is deliberately the **last** one. It owns
 * no ground, moves no wall, widens no street and re-sites nothing: every
 * candidate is tested whole against what the earlier passes already claimed and
 * dropped whole if any part of it would clip. That discipline is not
 * fastidiousness — the half-written prop is exactly the defect this codebase
 * has already shipped once, when a porch lamp and a planter fought over one
 * column and left a lantern standing on a trapdoor.
 *
 * ## The four hard rules
 *
 * 1. **Strictly additive, strictly last, all or nothing.** Every candidate is
 *    tested in full before a single op is written, and dropped whole if any
 *    part of it would land on something. What "something" means is the one
 *    place this pass refines the pinned contract, and it does so in the strict
 *    direction:
 *
 *    - {@link LifePassInput.avoid} and `keepClear` are an **absolute column
 *      veto** for every recipe without exception. The caller saying "not here"
 *      is not a claim a finer test can talk its way past.
 *    - A recipe that stands on open ground — a parked car, a market stall, a
 *      street tree — additionally demands that *no* earlier pass wrote a block
 *      anywhere in its columns. That is the column rule as pinned.
 *    - A recipe bolted to a wall, or standing on a pavement against one, is
 *      tested **voxel by voxel** instead: its own blocks, and one of air above
 *      each, must be empty in the emitted world. This is strictly more precise
 *      than the column rule, not weaker — it forbids overlap directly rather
 *      than by proxy — and it is load-bearing, because the building grammar's
 *      eaves and shutters already claim a block in every street-facing apron
 *      column, so the column rule alone deletes the entire shopfront band of
 *      the city over a shutter bracket twelve blocks below the awning.
 *      See {@link FACADE_RULE} and {@link PAVEMENT_RULE}.
 *    - {@link lightRooms} writes into a voxel *inside* a building's own room;
 *      see its doc comment for why the ceiling void of a room is not
 *      contested space.
 * 2. **The walk lane stays clear.** `streetscape.ts` reserves the sidewalk
 *    column against the kerb as a continuous clear run. Nothing here touches
 *    it, ever — not even overhead, because "not touching it" is a property that
 *    survives refactoring and "leaving three blocks of headroom" is not. Door
 *    approaches are reserved the same way.
 * 3. **Determinism.** Every decision is `hash2`/`hashInt`/`hashPick` keyed on a
 *    world column plus a stream seed, or a pure function of geometry. Runs are
 *    enumerated in sorted order, never in map-insertion order. No
 *    `Math.random`, no wall clock, no transcendentals.
 * 4. **Physics lint zero.** This is the single most dangerous file in the
 *    codebase for `unsupported.*`: awnings, balconies, lanterns and fire
 *    escapes are precisely the shapes those rules hunt. Every recipe below
 *    states, in its comment, which rule it would trip and what keeps it up, and
 *    every one of them is additionally checked against the live voxel map
 *    ({@link LifeWorld.solidAt}) before it is written — the recipe argues the
 *    support is there, and the check proves it for this particular wall.
 *
 * ## Two things this pass deliberately does not do
 *
 * - **No `*_sign` blocks.** `requiredBlockEntityId` makes any sign block
 *   without a `minecraft:sign` compound a `blockentity.orphan` finding, and the
 *   structure pass has no block-entity channel. Shop signage is therefore
 *   banners and painted boards, which need no NBT and read as well from the
 *   street.
 * - **No water.** A puddle in an alley is one `prop.fluid_leak` away from a
 *   flooded basement. Alley wetness is a *surface* repaint instead.
 */

import {
  generateProp,
  streamSeed,
  type LocalVoxelOp,
  type Region,
  type Seed256,
} from "@terrainist/stdlib";
import { note, type LoamDiagnostic } from "@terrainist/spec";

import type { PrismarineStack } from "../emit/prismarine.js";
import type { Rect } from "../layout/frames.js";
import type { StreetGraph } from "../layout/streets.js";
import { FluidKind, type ColumnPlan } from "../terrain/columns.js";
import { detailSeed, hash2, hashInt, hashPick } from "../terrain/detail.js";

import type { StructureBlock } from "./buildings.js";
import { index, inside } from "./roads.js";
import { perp, walkStreet, type StreetMasks } from "./streetscape.js";

/* -------------------------------------------------------------------------- */
/* what a frontage is                                                          */
/* -------------------------------------------------------------------------- */

/**
 * What kind of life a building's street wall wants.
 *
 * The whole density model hangs off this. "A stall every N blocks" is as
 * generated-looking as no stalls at all, so nothing here is driven by a global
 * constant: a shopping street gets awnings on most of its frontage and a
 * residential one gets almost none, because that is the difference between the
 * two things in the world.
 */
export type Frontage =
  | "shop"
  | "residential"
  | "office"
  | "civic"
  | "industrial"
  | "plain";

/** Which way a wall faces, as a unit column step. */
interface Dir {
  readonly dx: number;
  readonly dz: number;
  readonly name: "north" | "south" | "east" | "west";
}

const DIRS: readonly Dir[] = Object.freeze([
  { dx: 0, dz: -1, name: "north" },
  { dx: 1, dz: 0, name: "east" },
  { dx: 0, dz: 1, name: "south" },
  { dx: -1, dz: 0, name: "west" },
] as const);

/** The cardinal a block mounted on this wall should *face* (outward). */
function outwardFacing(d: Dir): string {
  return d.name;
}

/** The cardinal a stair or canopy should point back *into* the wall. */
function inwardFacing(d: Dir): string {
  return d.name === "north"
    ? "south"
    : d.name === "south"
      ? "north"
      : d.name === "east"
        ? "west"
        : "east";
}

/* -------------------------------------------------------------------------- */
/* archetype → frontage                                                        */
/* -------------------------------------------------------------------------- */

const SHOP_ARCHETYPES: ReadonlySet<string> = new Set([
  "shop_row", "department_store", "convenience_store", "food_court",
  "general_store", "bakery", "apothecary", "market_stall", "pawnshop",
  "tavern", "inn", "tea_house", "butchery", "spice_market", "shopping_mall",
  "trading_post", "auction_house", "brewery", "distillery", "cider_press",
  "cinema", "theater", "opera_house", "dance_hall", "gas_station",
  "caravanserai", "post_office", "boxing_gym", "gym", "clubhouse", "sauna",
  "hotel", "ski_lodge", "bathhouse", "smithy", "cooperage",
]);

const RESIDENTIAL_ARCHETYPES: ReadonlySet<string> = new Set([
  "townhouse", "terraced_row", "apartment_block", "cottage", "farmhouse",
  "bungalow", "hut", "log_cabin", "longhouse", "dormitory", "almshouse",
  "boarding_house", "manor_house", "mansion", "courtyard_house", "penthouse",
  "atrium_block", "modern_villa", "saltbox_house", "dutch_gable_house",
  "tudor_row", "mediterranean_villa", "alpine_chalet", "hanok", "machiya",
  "riad", "cycladic_house", "adobe_pueblo", "colonial_veranda_house",
  "hacienda", "servants_quarters", "gate_lodge", "brutalist_block",
  "stilt_house", "thatched_roundhouse", "trullo", "hobbit_hole",
  "gingerbread_cottage", "mushroom_house", "witch_hut", "shepherds_bothy",
]);

const OFFICE_ARCHETYPES: ReadonlySet<string> = new Set([
  "office", "skyscraper", "bank", "counting_house", "mint", "data_center",
  "control_tower", "customs_house", "guildhall", "conference_center",
  "parking_garage", "signal_box", "toll_house",
]);

const CIVIC_ARCHETYPES: ReadonlySet<string> = new Set([
  "museum", "library", "school", "town_hall", "courthouse", "church",
  "cathedral", "monastery", "abbey", "university_hall", "embassy",
  "council_chamber", "hospital", "infirmary", "police_station",
  "fire_station", "prison", "workhouse", "orphanage", "lecture_hall",
  "planetarium", "botanical_garden", "aquarium", "train_station",
  "transit_hub", "airport_terminal", "hall", "bell_tower", "mosque",
  "synagogue", "observatory", "telescope_dome", "conference_center",
]);

const INDUSTRIAL_ARCHETYPES: ReadonlySet<string> = new Set([
  "warehouse", "factory_hall", "foundry", "sawmill", "machine_shop",
  "refinery", "brickworks", "cannery", "textile_mill", "papermill",
  "glassworks", "tannery", "kiln", "blast_furnace_works", "ropewalk",
  "shipyard", "boathouse", "silo", "granary", "roundhouse", "gasworks",
  "steam_plant", "substation", "pumping_station", "water_tower",
  "coal_tipple", "biomass_shed", "battery_shed", "charcoal_burner",
  "hop_kiln", "barn", "stable", "mine_head", "drydock",
]);

/**
 * Classify a building's street wall.
 *
 * Archetype first, because that is what the author actually said; the tag list
 * is a fallback for a building the grammar resolved from tags alone. Anything
 * unrecognised is `"plain"`, which gets facade fittings and nothing else — the
 * conservative direction, because a wrong shopfront on a mausoleum is worse
 * than a bare wall.
 */
export function classifyFrontage(
  archetype: string | undefined,
  tags: readonly string[] = [],
): Frontage {
  const a = archetype ?? "";
  if (SHOP_ARCHETYPES.has(a)) return "shop";
  if (RESIDENTIAL_ARCHETYPES.has(a)) return "residential";
  if (OFFICE_ARCHETYPES.has(a)) return "office";
  if (CIVIC_ARCHETYPES.has(a)) return "civic";
  if (INDUSTRIAL_ARCHETYPES.has(a)) return "industrial";
  for (const tag of tags) {
    if (tag === "shop" || tag === "market" || tag === "commerce") return "shop";
    if (tag === "house" || tag === "residential") return "residential";
    if (tag === "civic" || tag === "temple") return "civic";
    if (tag === "industry" || tag === "works") return "industrial";
  }
  return "plain";
}

/* -------------------------------------------------------------------------- */
/* tuning — the density model                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Per-frontage street dressing intensity.
 *
 * `stretch` is the fraction of a frontage run that is dressed, **as one
 * contiguous stretch** rather than as a scatter: the run is the unit, not the
 * column. That is what makes a shopping street read as a shopping street — six
 * awnings in a row and then a gap, not one awning every seven blocks forever.
 *
 * `kerbClutter` is the per-column chance of a ground object on the *dressed*
 * stretch only, so a residential street with `stretch: 0.15` sees almost
 * nothing at ground level no matter what this number says.
 */
export interface FrontageRules {
  /** Fraction of a street run dressed, as one contiguous stretch. */
  readonly stretch: number;
  /** Columns of the dressed stretch that carry an awning or canopy. */
  readonly awning: number;
  /** Chance a dressed column carries a banner or a painted board. */
  readonly signage: number;
  /** Chance a dressed column carries a ground object (crate, stall, board). */
  readonly kerbClutter: number;
  /** Chance a storey above the first carries a balcony bay. */
  readonly balcony: number;
  /** Chance a wall bay above the first storey carries plant (AC, dish). */
  readonly plant: number;
  /** Chance a dressed column carries a facade light. */
  readonly light: number;
  /** Chance a room is lit from inside, per storey. */
  readonly litRooms: number;
}

/** The density model, per frontage class. Read the numbers as a portrait. */
export const FRONTAGE_RULES: Readonly<Record<Frontage, FrontageRules>> =
  Object.freeze({
    // A shopping street: almost continuous awning, a sign every few bays,
    // goods spilling onto the pavement, lit windows over the shop.
    shop: {
      stretch: 0.85, awning: 0.8, signage: 0.3, kerbClutter: 0.3,
      balcony: 0.1, plant: 0.05, light: 0.28, litRooms: 0.45,
    },
    // A residential street is quiet at ground level and busy above it: that
    // asymmetry IS the difference between a high street and a housing street,
    // and getting it wrong is what makes every street look the same.
    residential: {
      stretch: 0.35, awning: 0.05, signage: 0.02, kerbClutter: 0.05,
      balcony: 0.45, plant: 0.07, light: 0.12, litRooms: 0.5,
    },
    // An office tower: a hard canopy at the entrance, plant on the flanks,
    // and a lot of lit floors. Nothing on the pavement.
    office: {
      stretch: 0.4, awning: 0.15, signage: 0.12, kerbClutter: 0.04,
      balcony: 0.05, plant: 0.12, light: 0.15, litRooms: 0.6,
    },
    // Civic frontage is ceremonial: banners and flagpoles, no commerce, and
    // the building is lit from outside rather than from within.
    civic: {
      stretch: 0.5, awning: 0.05, signage: 0.35, kerbClutter: 0.08,
      balcony: 0.05, plant: 0.02, light: 0.3, litRooms: 0.2,
    },
    // Industrial frontage barely acknowledges the street; its life is round
    // the back, which `dressBacks` handles at a much higher rate.
    industrial: {
      stretch: 0.3, awning: 0.05, signage: 0.1, kerbClutter: 0.25,
      balcony: 0, plant: 0.1, light: 0.1, litRooms: 0.15,
    },
    plain: {
      stretch: 0.25, awning: 0.05, signage: 0.05, kerbClutter: 0.06,
      balcony: 0.12, plant: 0.04, light: 0.12, litRooms: 0.3,
    },
  });

/** Chance a back-of-block run gets a clutter cluster at all. */
export const BACK_CLUSTER_CHANCE = 0.55;
/** Half-width of a back-of-block clutter cluster, in columns. */
export const BACK_CLUSTER_SPREAD = 4;
/** Objects attempted inside one back-of-block cluster. */
export const BACK_CLUSTER_SIZE = 6;
/** Chance a back-of-block wall bay carries a fire escape. */
export const FIRE_ESCAPE_CHANCE = 0.22;
/** Least storeys a building needs before a fire escape is worth a ladder. */
export const FIRE_ESCAPE_MIN_STOREYS = 3;

/** Least carriageway width that leaves room for a parking lane. */
export const PARKING_MIN_WIDTH = 7;
/** Columns between the starts of two kerbside parking runs. */
export const PARKING_PERIOD = 22;
/** Length of a parked car along the kerb, in columns. */
export const CAR_LENGTH = 4;
/** Cars attempted per parking run. */
export const CARS_PER_RUN = 3;
/** Least carriageway width that counts as an arterial for a bus stop. */
export const ARTERIAL_MIN_WIDTH = 9;
/** Columns between kerbside fittings — hydrants, drains, newspaper boxes. */
export const KERB_FITTING_PERIOD = 17;

/** Least area, in columns, before an open patch is treated as a plaza. */
export const PLAZA_MIN_AREA = 320;
/** Greatest area an enclosed patch may have and still read as a back court. */
export const COURT_MAX_AREA = 900;
/** Columns between market stalls in a stall row. */
export const STALL_PITCH = 4;
/** Stalls in one market row. */
export const STALL_ROW_LENGTH = 5;
/** Columns between street trees along a plaza edge. */
export const TREE_PITCH = 7;

/** Sparsest a lit storey gets: a couple of windows on. */
export const LIT_ROOM_MIN = 0.02;
/** Brightest a lit storey gets: most of the floor working late. */
export const LIT_ROOM_MAX = 0.09;

/** Chebyshev gap enforced between two objects this pass plants on the ground. */
export const LIFE_MIN_GAP = 3;

/** How far in front of a door stays clear, in columns. */
export const DOOR_CLEARANCE = 2;

/* -------------------------------------------------------------------------- */
/* inputs and outputs                                                          */
/* -------------------------------------------------------------------------- */

/** One building, as much of it as this pass needs. */
export interface LifeBuilding {
  readonly nodePath: string;
  /** The placed envelope. */
  readonly footprint: Rect;
  /** The columns the building actually covers, as `"x,z"` world keys. */
  readonly cells: ReadonlySet<string>;
  /** The enclosed room columns, as `"x,z"` world keys. */
  readonly interiorCells?: ReadonlySet<string>;
  /**
   * The columns a storey-to-storey flight climbs through, as `"x,z"` keys.
   *
   * Never lit. A room lantern hangs at `ceiling - 1`, which clears a player
   * standing on a flat floor and does not clear one climbing past it two treads
   * up — and a blocked flight is not a cosmetic defect, it seals every storey
   * above it. This sealed all 4,103 upper-storey cells of Bayline's terraces.
   */
  readonly stairCells?: ReadonlySet<string>;
  /** World Y of the ground-floor walking plane. */
  readonly floorY: number;
  /** World Y of the topmost wall course. */
  readonly wallTopY: number;
  /** World Y of each storey's floor plane, lowest first. */
  readonly floorLevels: readonly number[];
  readonly archetype?: string;
  readonly tags?: readonly string[];
}

/** One district's street network, already dressed by F4. */
export interface LifeStreets {
  readonly nodePath: string;
  readonly bounds: Rect;
  readonly graph: StreetGraph;
  readonly masks: StreetMasks;
}

/** Everything {@link dressLife} reads. */
export interface LifePassInput {
  /** The finished column plan. Read for ground and fluid; surface is repainted. */
  readonly plan: ColumnPlan;
  readonly stack: PrismarineStack;
  /** The world/settlement seed; every hash stream derives from it. */
  readonly seed: Seed256;
  readonly nodePath?: string;
  readonly buildings: readonly LifeBuilding[];
  readonly districts?: readonly LifeStreets[];
  /**
   * Every block written so far, in emit order.
   *
   * Two things are derived from it and neither can be derived from anything
   * else: the **column claim** that {@link LifePassInput.avoid} would otherwise
   * have to be told about twice, and the **voxel map** that lets a recipe check
   * "is there actually a wall behind this bracket" instead of assuming one.
   */
  readonly existing?: readonly StructureBlock[];
  /**
   * Columns already carrying someone else's blocks. Merged with the columns
   * derived from {@link LifePassInput.existing}; a caller may supply either,
   * both, or neither.
   */
  readonly avoid?: (x: number, z: number) => boolean;
  /** Extra columns to keep clear — road surfaces, keep-clear aprons. */
  readonly keepClear?: ReadonlySet<string>;
  /** Cap on objects planted, as a safety valve on a very large city. */
  readonly budget?: number;
}

/** What {@link dressLife} produced. */
export interface LifeResult {
  readonly blocks: StructureBlock[];
  readonly diagnostics: LoamDiagnostic[];
  readonly stats: Readonly<Record<string, number>>;
}

/* -------------------------------------------------------------------------- */
/* the local op vocabulary                                                     */
/* -------------------------------------------------------------------------- */

/** One block a recipe wants, relative to the recipe's own anchor. */
interface LifeOp {
  readonly dx: number;
  readonly dy: number;
  readonly dz: number;
  readonly block: string;
  readonly props?: Readonly<Record<string, string>>;
}

const op = (
  dx: number,
  dy: number,
  dz: number,
  block: string,
  props?: Readonly<Record<string, string>>,
): LifeOp => (props === undefined ? { dx, dy, dz, block } : { dx, dy, dz, block, props });

/* -------------------------------------------------------------------------- */
/* the world view                                                              */
/* -------------------------------------------------------------------------- */

const key2 = (x: number, z: number): string => `${x},${z}`;
const key3 = (x: number, y: number, z: number): string => `${x},${y},${z}`;

/**
 * Everything the recipes ask about the world, in one place.
 *
 * The voxel map is the important half. Without it a recipe can only *assume*
 * there is a wall behind the awning it is bracketing, and an assumption is what
 * `unsupported.*` findings are made of; with it, "is there a full cube at the
 * block I am hanging off" is a lookup, and a recipe that cannot prove its own
 * support declines to place.
 */
interface LifeWorld {
  readonly region: Region;
  /**
   * True when the caller declared this column off limits.
   *
   * An absolute veto for every recipe, including the ones that otherwise
   * reason in voxels: `avoid` and `keepClear` are the caller saying "not
   * here", which is a different statement from "a block happens to exist
   * somewhere in this column" and is not something a voxel test can refine.
   */
  vetoed(x: number, z: number): boolean;
  /** True when an earlier pass wrote any block in this column, or it is vetoed. */
  taken(x: number, z: number): boolean;
  /** True when this voxel is a full cube — terrain or an earlier pass's block. */
  solidAt(x: number, y: number, z: number): boolean;
  /** True when this voxel holds nothing at all: no block, no terrain, no fluid. */
  emptyAt(x: number, y: number, z: number): boolean;
  /**
   * True when a hanging lantern at `y - 1` would be held up by this voxel.
   *
   * Exactly `hungChain`'s first step, and it is not the same question as "is
   * this a full cube": a storey deck built from bottom slabs presents a full,
   * flush underside, which vanilla and the lint both accept, while a deck built
   * from top slabs does not. Asking `solidAt` here would light only the
   * buildings whose floors happen to be planks.
   */
  hangableAt(x: number, y: number, z: number): boolean;
  /** The first air block above the ground in this column, or `undefined`. */
  standY(x: number, z: number): number | undefined;
  /** True when this column, or a neighbour, holds fluid. */
  wet(x: number, z: number): boolean;
}

function buildWorld(input: LifePassInput): LifeWorld {
  const plan = input.plan;
  const region = plan.region;
  // The emitted world, indexed **by column and then by height**.
  //
  // One string per block rather than two, and two orders of magnitude fewer
  // distinct strings than a flat `"x,y,z"` map: a city emits hundreds of
  // thousands of blocks over tens of thousands of columns, and on the dev
  // world and the terrarium — the two rigs that build every archetype in the
  // catalog at once — the flat map's key construction and its live-set cost
  // dominated this pass and pushed both suites past their hook timeout.
  const byColumn = new Map<string, Map<number, number>>();
  for (const b of input.existing ?? []) {
    const k = key2(b.x, b.z);
    let column = byColumn.get(k);
    if (column === undefined) {
      column = new Map<number, number>();
      byColumn.set(k, column);
    }
    column.set(b.y, b.stateId);
  }
  const stateOf = (x: number, y: number, z: number): number | undefined =>
    byColumn.get(key2(x, z))?.get(y);
  const stack = input.stack;
  const keepClear = input.keepClear;
  const avoid = input.avoid;

  const vetoed = (x: number, z: number): boolean => {
    if (keepClear !== undefined && keepClear.has(key2(x, z))) return true;
    return avoid !== undefined && avoid(x, z);
  };
  const taken = (x: number, z: number): boolean =>
    byColumn.has(key2(x, z)) || vetoed(x, z);

  const groundOf = (x: number, z: number): number | undefined => {
    if (!inside(region, x, z)) return undefined;
    return plan.ground[index(region, x, z)] as number;
  };

  const solidAt = (x: number, y: number, z: number): boolean => {
    const state = stateOf(x, y, z);
    if (state !== undefined) return stack.isFullCube(state);
    const g = groundOf(x, z);
    if (g === undefined) return false;
    if (y > g) return false;
    const idx = index(region, x, z);
    // A column whose fluid reaches this height is water, not rock.
    if (plan.fluidKind[idx] !== FluidKind.NONE && y > (plan.ground[idx] as number)) {
      return false;
    }
    return true;
  };

  const emptyAt = (x: number, y: number, z: number): boolean => {
    if (stateOf(x, y, z) !== undefined) return false;
    const g = groundOf(x, z);
    if (g === undefined) return false;
    if (y <= g) return false;
    const idx = index(region, x, z);
    if (plan.fluidKind[idx] !== FluidKind.NONE && y <= (plan.fluidTop[idx] as number)) {
      return false;
    }
    return true;
  };

  const hangableAt = (x: number, y: number, z: number): boolean => {
    const state = stateOf(x, y, z);
    if (state === undefined) return solidAt(x, y, z);
    if (stack.isFullCube(state)) return true;
    const decoded = stack.blockStateProps(state);
    if (decoded === undefined) return false;
    const { name, props } = decoded;
    if (name.endsWith("_slab")) return props["type"] === "bottom" || props["type"] === "double";
    if (name.endsWith("_stairs")) return props["half"] === "bottom";
    return false;
  };

  const standY = (x: number, z: number): number | undefined => {
    const g = groundOf(x, z);
    if (g === undefined) return undefined;
    const idx = index(region, x, z);
    if (plan.fluidKind[idx] !== FluidKind.NONE) return undefined;
    return g + 1;
  };

  const wet = (x: number, z: number): boolean => {
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!inside(region, x + dx, z + dz)) continue;
        if (plan.fluidKind[index(region, x + dx, z + dz)] !== FluidKind.NONE) return true;
      }
    }
    return false;
  };

  return { region, vetoed, taken, solidAt, emptyAt, hangableAt, standY, wet };
}

/* -------------------------------------------------------------------------- */
/* frontage extraction                                                         */
/* -------------------------------------------------------------------------- */

/** A maximal run of wall columns on one building, all facing the same way. */
export interface FrontageRun {
  readonly building: LifeBuilding;
  readonly frontage: Frontage;
  readonly dir: Dir;
  /** The wall columns, in ascending order along the run's own axis. */
  readonly wall: readonly { readonly x: number; readonly z: number }[];
  /** True when this run faces a street: sidewalk, kerb or carriageway. */
  readonly street: boolean;
}

/**
 * Every maximal straight run of exterior wall on a building, by facing.
 *
 * A run, not a column, is the unit the dressing works in: awnings, balconies
 * and stall rows are *runs of adjacent bays*, and a pass that decided
 * column-by-column would produce the evenly-sprinkled look this track exists to
 * remove. Enumeration is by cell set and then sorted, so a wing plan gives its
 * true ragged outline and nothing depends on set iteration order.
 */
export function frontageRuns(
  building: LifeBuilding,
  isStreet: (x: number, z: number) => boolean,
): FrontageRun[] {
  const frontage = classifyFrontage(building.archetype, building.tags);
  const out: FrontageRun[] = [];
  for (const dir of DIRS) {
    // Wall cells facing `dir`, bucketed by the coordinate the run is constant
    // in, then split into maximal consecutive runs along the other axis.
    const buckets = new Map<number, number[]>();
    for (const cellKey of building.cells) {
      const [x, z] = cellKey.split(",").map(Number) as [number, number];
      if (building.cells.has(key2(x + dir.dx, z + dir.dz))) continue;
      const constant = dir.dx === 0 ? z : x;
      const along = dir.dx === 0 ? x : z;
      const list = buckets.get(constant);
      if (list === undefined) buckets.set(constant, [along]);
      else list.push(along);
    }
    for (const constant of [...buckets.keys()].sort((a, b) => a - b)) {
      const alongs = (buckets.get(constant) as number[]).slice().sort((a, b) => a - b);
      let start = 0;
      for (let i = 1; i <= alongs.length; i++) {
        const broken = i === alongs.length || (alongs[i] as number) !== (alongs[i - 1] as number) + 1;
        if (!broken) continue;
        const wall = alongs.slice(start, i).map((along) =>
          dir.dx === 0 ? { x: along, z: constant } : { x: constant, z: along },
        );
        start = i;
        if (wall.length === 0) continue;
        // A run faces a street when most of what is in front of it is one.
        let facing = 0;
        for (const w of wall) {
          if (isStreet(w.x + dir.dx, w.z + dir.dz) || isStreet(w.x + 2 * dir.dx, w.z + 2 * dir.dz)) {
            facing++;
          }
        }
        out.push({
          building,
          frontage,
          dir,
          wall,
          street: facing * 2 >= wall.length,
        });
      }
    }
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* the placement engine                                                        */
/* -------------------------------------------------------------------------- */

/** Where a recipe's ops may land, and what must already be true there. */
interface PlaceRule {
  /** Columns the ops touch must be unclaimed by every earlier pass. */
  readonly requireFreeColumn: boolean;
  /** Every op voxel must currently be empty. */
  readonly requireEmptyVoxel: boolean;
  /**
   * Keep one block of air above every op, over this pass's own work.
   *
   * On by default, and it is what stops an air-conditioning unit growing out of
   * the underside of a balcony deck. Off for the handful of recipes that
   * *deliberately* hang off something this pass planted a moment ago — the
   * lantern under an awning is the whole reason the flag exists.
   */
  readonly padAbove?: boolean;
  /** Empty voxels demanded directly above each op, over foreign work too. */
  readonly clearance?: number;
  /**
   * Whether the recipe may stand in a carriageway column.
   *
   * Off for everything but a parked car. A bench is anchored on the pavement
   * but is three columns long, and a bench whose far end is in the middle of
   * the road is the kind of defect that only shows up when you walk it — the
   * anchor was legal, so no per-anchor check would ever have caught it.
   */
  readonly onCarriageway?: boolean;
}

const GROUND_RULE: PlaceRule = { requireFreeColumn: true, requireEmptyVoxel: true };

/**
 * The rule for a fitting bolted to a wall above head height.
 *
 * The column rule is the right question for anything that stands on the ground:
 * a lamp post owns its whole column, so a planter that shares the column is a
 * planter growing through a lamp post. It is the *wrong* question for an awning
 * four blocks up. The building grammar's own decorations — eaves, shutters, the
 * porch lamp — reach one cell into the apron, which on a build-to-line lot is
 * every street-facing column a shopfront has; asking the column question there
 * refuses the entire shopfront band of the city because there is a shutter
 * bracket at ankle height twelve blocks below.
 *
 * What replaces it is strictly *more* precise, not weaker: the op's own voxel
 * and the voxel above it must both be empty in the emitted world, and the test
 * is still all-or-nothing across the whole recipe. Nothing can be clipped, half
 * written, or left unsupported by it — the failure mode the column rule exists
 * to prevent is a prop overwriting another prop's blocks, and a voxel test
 * forbids that directly rather than by proxy.
 */
const FACADE_RULE: PlaceRule = {
  requireFreeColumn: false,
  requireEmptyVoxel: true,
  clearance: 1,
};

/**
 * The rule for something standing on a pavement against a building.
 *
 * The same argument as {@link FACADE_RULE}, applied to the ground. On a
 * build-to-line lot the sidewalk is two columns wide: the inner one is the
 * reserved walk lane and the outer one is where the grammar's shutters and
 * eaves land, so under a strict column rule there is nowhere at all to put a
 * crate outside a shop — the whole shopfront band of the city comes out bare.
 * The voxel test is what keeps it honest: the object's own blocks and one of
 * air above each of them must be empty, so a crate can sit under an eave but
 * never inside a lamp post, which is the collision the rule exists to forbid.
 */
const PAVEMENT_RULE: PlaceRule = {
  requireFreeColumn: false,
  requireEmptyVoxel: true,
  clearance: 1,
};

/** The one rule that lets a recipe stand in the road: the parking lane. */
const PARKING_RULE: PlaceRule = {
  requireFreeColumn: true,
  requireEmptyVoxel: true,
  onCarriageway: true,
};

/** For a fitting that attaches to something this pass already planted. */
const ATTACHED_RULE: PlaceRule = {
  requireFreeColumn: false,
  requireEmptyVoxel: true,
  padAbove: false,
};

/**
 * The one place a block is written, and therefore the one place the rules are
 * enforced.
 *
 * All or nothing, and the ordering inside matters: every op is checked before
 * any op is written, so a recipe can never be half-applied. The failure that
 * motivated this — a lantern left standing over a column another prop had taken
 * the post out of — is not a bug you find by reading; it is a bug you make
 * impossible.
 */
class Planter {
  readonly blocks: StructureBlock[] = [];
  readonly stats = new Map<string, number>();
  private readonly mine = new Set<string>();
  /**
   * Ground objects, bucketed on an 8-column grid.
   *
   * The min-gap test is asked once per candidate column, which on a city-sized
   * region is tens of thousands of times against thousands of planted objects;
   * a linear scan makes the pass quadratic in the thing it is best at. The
   * bucket size is comfortably larger than {@link LIFE_MIN_GAP}, so looking at
   * the nine buckets around a column sees every object that could be too close.
   */
  private readonly ground = new Map<string, { x: number; z: number }[]>();
  private planted = 0;

  constructor(
    private readonly world: LifeWorld,
    private readonly stack: PrismarineStack,
    private readonly walkLane: (x: number, z: number) => boolean,
    private readonly carriageway: (x: number, z: number) => boolean,
    private readonly reserved: ReadonlySet<string>,
    private readonly budget: number,
  ) {}

  spent(): number {
    return this.planted;
  }

  /** Chebyshev distance to the nearest object this pass already planted. */
  crowded(x: number, z: number, gap = LIFE_MIN_GAP): boolean {
    const bx = x >> 3;
    const bz = z >> 3;
    for (let j = -1; j <= 1; j++) {
      for (let i = -1; i <= 1; i++) {
        const bucket = this.ground.get(`${bx + i},${bz + j}`);
        if (bucket === undefined) continue;
        for (const c of bucket) {
          if (Math.abs(c.x - x) < gap && Math.abs(c.z - z) < gap) return true;
        }
      }
    }
    return false;
  }

  /**
   * Try to write one recipe. Returns true when every op landed.
   *
   * `anchorsGround` marks a recipe that stands on the ground, which is the only
   * kind that participates in the min-gap rule — a balcony four storeys up has
   * no business crowding out a bench.
   */
  place(
    kind: string,
    ops: readonly LifeOp[],
    ox: number,
    oy: number,
    oz: number,
    rule: PlaceRule = GROUND_RULE,
    anchorsGround = true,
  ): boolean {
    if (ops.length === 0) return false;
    if (this.spent() >= this.budget) return false;
    const resolved: StructureBlock[] = [];
    for (const o of ops) {
      const x = ox + o.dx;
      const y = oy + o.dy;
      const z = oz + o.dz;
      if (!inside(this.world.region, x, z)) return false;
      // The walk lane is absolute: not at ground level, not overhead, not ever.
      if (this.walkLane(x, z)) return false;
      if (rule.onCarriageway !== true && this.carriageway(x, z)) return false;
      if (this.reserved.has(key2(x, z))) return false;
      if (this.world.vetoed(x, z)) return false;
      if (rule.requireFreeColumn && this.world.taken(x, z)) return false;
      if (rule.requireEmptyVoxel && !this.world.emptyAt(x, y, z)) return false;
      for (let up = 1; up <= (rule.clearance ?? 0); up++) {
        if (!this.world.emptyAt(x, y + up, z)) return false;
      }
      // This pass's own claims, padded one block up: an air-conditioning unit
      // directly under a balcony deck is two recipes sharing a face, and the
      // second one to arrive would look like it grew out of the first.
      if (this.mine.has(key3(x, y, z))) return false;
      if (rule.padAbove !== false && this.mine.has(key3(x, y + 1, z))) return false;
      const stateId = this.resolve(o);
      if (stateId === undefined) return false;
      resolved.push({ x, y, z, stateId });
    }
    for (const b of resolved) {
      this.blocks.push(b);
      this.mine.add(key3(b.x, b.y, b.z));
    }
    if (anchorsGround) {
      const bucketKey = `${ox >> 3},${oz >> 3}`;
      const bucket = this.ground.get(bucketKey);
      if (bucket === undefined) this.ground.set(bucketKey, [{ x: ox, z: oz }]);
      else bucket.push({ x: ox, z: oz });
    }
    this.stats.set(kind, (this.stats.get(kind) ?? 0) + 1);
    this.planted++;
    return true;
  }

  private resolve(o: LifeOp): number | undefined {
    if (o.props !== undefined) {
      const withProps = this.stack.blockStateOf(o.block, o.props);
      if (withProps !== undefined) return withProps;
    }
    return this.stack.blockByName(o.block)?.stateId;
  }
}

/* -------------------------------------------------------------------------- */
/* materials                                                                   */
/* -------------------------------------------------------------------------- */

/** Awning and canopy colours, in a fixed order so the pick is deterministic. */
const AWNING_WOODS: readonly string[] = [
  "spruce", "dark_oak", "acacia", "birch", "jungle", "oak", "cherry", "mangrove",
];

/** Banner and board colours — a market's palette, not a rainbow. */
const SIGN_COLOURS: readonly string[] = [
  "red", "orange", "yellow", "green", "light_blue", "blue", "white", "black",
];

/** Car body colours. Muted, because a street of primary colours is a toy. */
const CAR_COLOURS: readonly string[] = [
  "white", "light_gray", "gray", "black", "red", "blue", "cyan", "brown",
];

/** Trunk and canopy woods for a street tree. */
const TREE_WOODS: readonly { readonly log: string; readonly leaves: string }[] = [
  { log: "oak_log", leaves: "oak_leaves" },
  { log: "birch_log", leaves: "birch_leaves" },
  { log: "jungle_log", leaves: "jungle_leaves" },
  { log: "acacia_log", leaves: "acacia_leaves" },
  { log: "cherry_log", leaves: "cherry_leaves" },
];

/* -------------------------------------------------------------------------- */
/* recipes — facade                                                            */
/* -------------------------------------------------------------------------- */

/**
 * A flat awning: one bottom slab in the column outside the wall.
 *
 * Physics. `floating.slab` fires only on a slab with air on *every* side; this
 * one shares a face with the wall it is bracketed to, which the caller has
 * already proved is a full cube at the same height. A **bottom** slab is not an
 * arbitrary choice: `hungChain`'s `solidUnderside` accepts the underside of a
 * bottom slab, which is what makes {@link awningLantern} legal beneath it. A
 * top slab there would read marginally better and would make every lantern
 * under it an `unsupported.chain` finding.
 */
function awningOps(wood: string): LifeOp[] {
  return [op(0, 0, 0, `${wood}_slab`, { type: "bottom", waterlogged: "false" })];
}

/** The stair variant: a pitched canopy. No lantern hangs from this one. */
function canopyOps(wood: string, d: Dir): LifeOp[] {
  return [
    op(0, 0, 0, `${wood}_stairs`, {
      facing: inwardFacing(d),
      half: "top",
      shape: "straight",
      waterlogged: "false",
    }),
  ];
}

/** A lantern hung under an awning slab; `dy` is one below the slab. */
function awningLanternOps(): LifeOp[] {
  return [op(0, 0, 0, "lantern", { hanging: "true", waterlogged: "false" })];
}

/**
 * A wall banner: shop signage without a block entity.
 *
 * A `*_sign` would be a `blockentity.orphan` finding the moment it was written,
 * because the structure pass has no block-entity channel. A banner carries no
 * required compound, hangs off the block behind it exactly as a sign would, and
 * is not touched by any `unsupported.*` rule.
 */
function bannerOps(colour: string, d: Dir): LifeOp[] {
  return [op(0, 0, 0, `${colour}_wall_banner`, { facing: outwardFacing(d) })];
}

/** A painted board over the shopfront: two glazed panels against the wall. */
function boardOps(colour: string): LifeOp[] {
  return [op(0, 0, 0, `${colour}_concrete`), op(0, 1, 0, `${colour}_terracotta`)];
}

/**
 * An air-conditioning unit: a boxed condenser with a grille over it.
 *
 * A full cube with air on six faces is `floating.isolated`; this one shares a
 * face with the wall. The trapdoor is unlinted and stands on the cube.
 */
function acUnitOps(d: Dir): LifeOp[] {
  return [
    op(0, 0, 0, "light_gray_concrete"),
    op(0, 1, 0, "iron_trapdoor", {
      facing: outwardFacing(d),
      half: "bottom",
      open: "false",
      powered: "false",
      waterlogged: "false",
    }),
  ];
}

/** A satellite dish, high on a flank wall: a mount and a pale pan. */
function dishOps(): LifeOp[] {
  return [
    op(0, 0, 0, "light_gray_concrete"),
    op(0, 1, 0, "smooth_quartz_slab", { type: "bottom", waterlogged: "false" }),
  ];
}

/**
 * A balcony bay: a two-deep deck with a rail on the outer edge.
 *
 * Physics, three rules at once. The deck slabs are bottom slabs sharing faces
 * with each other and with the wall, so neither is `floating.slab`. The rail is
 * a fence, which `needsGround` puts on the support-chain rule — and
 * `groundedChain` accepts a `STANDABLE_PARTIAL` block below, which a bottom
 * slab is. The rail therefore stands on its own deck and the chain terminates
 * in one step. Cantilevering the rail one column further out, over air, would
 * be an `unsupported.chain` finding for every bay in the city.
 */
function balconyOps(wood: string, d: Dir, width: number, depth: 1 | 2): LifeOp[] {
  const ops: LifeOp[] = [];
  // Local axes: `a` runs along the wall, `d` points out of it.
  const ax = d.dx === 0 ? 1 : 0;
  const az = d.dx === 0 ? 0 : 1;
  for (let i = 0; i < width; i++) {
    for (let out = 0; out < depth; out++) {
      ops.push(
        op(
          ax * i + d.dx * out,
          0,
          az * i + d.dz * out,
          `${wood}_slab`,
          { type: "bottom", waterlogged: "false" },
        ),
      );
    }
  }
  if (depth === 1) {
    // The one-deep balcony, which is what a build-to-line street leaves room
    // for: the reserved walk lane is the second column out, so the deep
    // version would be refused outright and the elevation would come out
    // blank. An open trapdoor standing on the outer face of the deck is the
    // rail — no support rule touches a trapdoor, and it cannot be the thing
    // holding the deck up because the deck is bracketed to the wall.
    for (let i = 0; i < width; i++) {
      ops.push(
        op(ax * i, 1, az * i, `${wood}_trapdoor`, {
          facing: inwardFacing(d),
          half: "bottom",
          open: "true",
          powered: "false",
          waterlogged: "false",
        }),
      );
    }
    return ops;
  }
  // The rail: the outer edge, plus the two returns against the wall.
  for (let i = 0; i < width; i++) {
    ops.push(op(ax * i + d.dx, 1, az * i + d.dz, `${wood}_fence`, { waterlogged: "false" }));
  }
  for (const i of [0, width - 1]) {
    if (width < 2 && i === width - 1) continue;
    ops.push(op(ax * i, 1, az * i, `${wood}_fence`, { waterlogged: "false" }));
  }
  return ops;
}

/**
 * A fire escape: a ladder up the wall with a landing at each storey.
 *
 * `unsupported.ladder` asks for a full cube *behind* the ladder, where "behind"
 * is one step against its `facing`. A ladder facing out of the building has the
 * wall behind it at every rung, which the caller proves column by column before
 * this is written — a window course in the middle of the run is a solid enough
 * block for the lint but not for the eye, so the caller requires full cubes.
 */
function fireEscapeOps(
  d: Dir,
  loY: number,
  hiY: number,
  landings: readonly number[],
): LifeOp[] {
  const ops: LifeOp[] = [];
  for (let y = loY; y <= hiY; y++) {
    ops.push(op(0, y - loY, 0, "ladder", { facing: outwardFacing(d), waterlogged: "false" }));
  }
  const ax = d.dx === 0 ? 1 : 0;
  const az = d.dx === 0 ? 0 : 1;
  for (const y of landings) {
    if (y < loY || y > hiY) continue;
    // A grating beside the ladder, bracketed to the wall like a balcony deck.
    for (const side of [-1, 1]) {
      ops.push(
        op(ax * side, y - loY, az * side, "iron_trapdoor", {
          facing: outwardFacing(d),
          half: "bottom",
          open: "false",
          powered: "false",
          waterlogged: "false",
        }),
      );
    }
  }
  return ops;
}

/** A window box: a shelf under a window, on the wall. */
function windowBoxOps(wood: string, d: Dir): LifeOp[] {
  return [
    op(0, 0, 0, `${wood}_trapdoor`, {
      facing: outwardFacing(d),
      half: "bottom",
      open: "false",
      powered: "false",
      waterlogged: "false",
    }),
  ];
}

/** A wall light. A torch brackets to the wall; a lantern cannot. */
function facadeLightOps(d: Dir, soul: boolean): LifeOp[] {
  return [op(0, 0, 0, soul ? "soul_wall_torch" : "wall_torch", { facing: outwardFacing(d) })];
}

/**
 * A glowing facade panel — a lit slab of the building, not a fixture.
 *
 * Glowstone rather than a sea lantern, and the reason is a name: every
 * `unsupported.lantern` and support-chain rule keys on `name.endsWith("lantern")`,
 * so a sea lantern bolted to a tower is a block the lint believes is standing
 * on air. It is the same light level with none of the argument.
 */
function glowPanelOps(): LifeOp[] {
  return [op(0, 0, 0, "glowstone")];
}

/** Graffiti: a glazed panel flat against a back wall. */
function muralOps(colour: string): LifeOp[] {
  return [op(0, 0, 0, `${colour}_glazed_terracotta`)];
}

/* -------------------------------------------------------------------------- */
/* recipes — ground                                                            */
/* -------------------------------------------------------------------------- */

/** A stack of crates by a door. */
function crateOps(count: number): LifeOp[] {
  const ops: LifeOp[] = [op(0, 0, 0, "barrel", { facing: "up", open: "false" })];
  if (count > 1) ops.push(op(0, 1, 0, "barrel", { facing: "up", open: "false" }));
  return ops;
}

/** A pallet: a low stack of planks. */
function palletOps(wood: string): LifeOp[] {
  return [op(0, 0, 0, `${wood}_slab`, { type: "bottom", waterlogged: "false" })];
}

/** A dumpster: a bin body with a lid thrown back. */
function dumpsterOps(d: Dir): LifeOp[] {
  const ax = d.dx === 0 ? 1 : 0;
  const az = d.dx === 0 ? 0 : 1;
  return [
    op(0, 0, 0, "green_concrete"),
    op(ax, 0, az, "green_concrete"),
    op(0, 1, 0, "spruce_trapdoor", {
      facing: outwardFacing(d),
      half: "bottom",
      open: "false",
      powered: "false",
      waterlogged: "false",
    }),
    op(ax, 1, az, "spruce_trapdoor", {
      facing: outwardFacing(d),
      half: "bottom",
      open: "false",
      powered: "false",
      waterlogged: "false",
    }),
  ];
}

/**
 * A hydrant: a squat body with a post on it.
 *
 * The wall block is on `needsGround`; `groundedChain` walks down one step to a
 * full cube and stops. Standing the post straight on the pavement would be the
 * same rule satisfied one step sooner, but it would read as a bollard.
 */
function hydrantOps(): LifeOp[] {
  return [
    op(0, 0, 0, "red_terracotta"),
    op(0, 1, 0, "red_nether_brick_wall", { up: "true", waterlogged: "false" }),
  ];
}

/** A newspaper box: a coloured cabinet with a flap. */
function newsBoxOps(colour: string, d: Dir): LifeOp[] {
  return [
    op(0, 0, 0, `${colour}_concrete`),
    op(0, 1, 0, "oak_trapdoor", {
      facing: outwardFacing(d),
      half: "bottom",
      open: "false",
      powered: "false",
      waterlogged: "false",
    }),
  ];
}

/**
 * A parked car: a body two columns wide and {@link CAR_LENGTH} long.
 *
 * Every block sits on the carriageway or on another block of the car, so
 * neither `floating.isolated` nor any support rule has anything to say. The
 * cabin glass is a full cube for the block table's purposes and is enclosed by
 * the body, which is why it does not trip the isolation rule either.
 */
function carOps(colour: string, alongX: boolean): LifeOp[] {
  const ops: LifeOp[] = [];
  const ax = alongX ? 1 : 0;
  const az = alongX ? 0 : 1;
  const bx = alongX ? 0 : 1;
  const bz = alongX ? 1 : 0;
  for (let l = 0; l < CAR_LENGTH; l++) {
    for (let w = 0; w < 2; w++) {
      ops.push(op(ax * l + bx * w, 0, az * l + bz * w, `${colour}_concrete`));
    }
  }
  for (let l = 1; l <= 2; l++) {
    for (let w = 0; w < 2; w++) {
      ops.push(
        op(ax * l + bx * w, 1, az * l + bz * w, "gray_stained_glass"),
      );
    }
  }
  return ops;
}

/**
 * A street tree in a pit: a three-block trunk under a small crown.
 *
 * Leaves are `persistent`, so nothing decays, and the crown is a solid 3x3 disc
 * with a cross-shaped cap over it — every leaf shares a face with another leaf
 * or with the trunk, which is what keeps `floating.isolated` quiet.
 */
function treeOps(log: string, leaves: string): LifeOp[] {
  const ops: LifeOp[] = [
    op(0, 0, 0, log, { axis: "y" }),
    op(0, 1, 0, log, { axis: "y" }),
    op(0, 2, 0, log, { axis: "y" }),
  ];
  const leaf = { distance: "1", persistent: "true", waterlogged: "false" };
  for (const [dx, dz] of [
    [0, 0], [1, 0], [-1, 0], [0, 1], [0, -1],
    [1, 1], [1, -1], [-1, 1], [-1, -1],
  ] as const) {
    ops.push(op(dx, 3, dz, leaves, leaf));
  }
  for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    ops.push(op(dx, 4, dz, leaves, leaf));
  }
  return ops;
}

/**
 * A market stall: four corner posts, a striped canvas, and a counter.
 *
 * The posts are fences, grounded in one step. The canvas is a course of wool
 * two blocks up, each cell of which shares a face with its neighbour and sits
 * directly on a post at the corners, so nothing floats and nothing is isolated.
 */
function stallOps(wood: string, colour: string, alongX: boolean): LifeOp[] {
  const ops: LifeOp[] = [];
  const ax = alongX ? 1 : 0;
  const az = alongX ? 0 : 1;
  const bx = alongX ? 0 : 1;
  const bz = alongX ? 1 : 0;
  for (const l of [0, 2]) {
    for (const w of [0, 1]) {
      for (let y = 0; y < 2; y++) {
        ops.push(
          op(ax * l + bx * w, y, az * l + bz * w, `${wood}_fence`, { waterlogged: "false" }),
        );
      }
    }
  }
  for (let l = 0; l <= 2; l++) {
    for (const w of [0, 1]) {
      ops.push(op(ax * l + bx * w, 2, az * l + bz * w, l % 2 === 0 ? `${colour}_wool` : "white_wool"));
    }
  }
  // The counter: a slab across the front, in the one bay the posts leave free.
  // Writing it across all three would put two ops in the corner voxels, and a
  // recipe that overwrites itself is a recipe whose block count is a lie.
  ops.push(op(ax, 0, az, `${wood}_slab`, { type: "top", waterlogged: "false" }));
  return ops;
}

/** A seating cluster: a planter with benches turned toward it. */
function seatClusterOps(wood: string): LifeOp[] {
  return [
    op(0, 0, 0, "flower_pot"),
    op(1, 0, 0, `${wood}_stairs`, { facing: "west", half: "bottom", shape: "straight", waterlogged: "false" }),
    op(-1, 0, 0, `${wood}_stairs`, { facing: "east", half: "bottom", shape: "straight", waterlogged: "false" }),
    op(0, 0, 1, `${wood}_stairs`, { facing: "north", half: "bottom", shape: "straight", waterlogged: "false" }),
    op(0, 0, -1, `${wood}_stairs`, { facing: "south", half: "bottom", shape: "straight", waterlogged: "false" }),
  ];
}

/* -------------------------------------------------------------------------- */
/* the pass                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Dress a finished city with eye-level incident.
 *
 * Order is by decreasing claim on the ground, which is the only order that
 * makes the min-gap rule mean anything: the big committed objects (parked cars,
 * market rows, trees) go first, then shopfronts, then the smaller clutter fills
 * the gaps that are left. Reversing it produces a pavement full of litter bins
 * and nowhere to put a stall.
 */
export function dressLife(input: LifePassInput): LifeResult {
  const world = buildWorld(input);
  const diagnostics: LoamDiagnostic[] = [];
  const region = input.plan.region;
  const nodePath = input.nodePath ?? "";

  // --- the reserved geometry ------------------------------------------------
  const walkLaneMasks = (input.districts ?? []).map((d) => d.masks.walkLane);
  const walkLane = (x: number, z: number): boolean => {
    if (!inside(region, x, z)) return false;
    const idx = index(region, x, z);
    for (const mask of walkLaneMasks) if (mask[idx] === 1) return true;
    return false;
  };
  const carriageway = (x: number, z: number): boolean => {
    if (!inside(region, x, z)) return false;
    const idx = index(region, x, z);
    for (const d of input.districts ?? []) if (d.masks.carriageway[idx] === 1) return true;
    return false;
  };
  const sidewalkOrRoad = (x: number, z: number): boolean => {
    if (!inside(region, x, z)) return false;
    const idx = index(region, x, z);
    for (const d of input.districts ?? []) {
      if (d.masks.sidewalk[idx] === 1 || d.masks.carriageway[idx] === 1) return true;
    }
    return false;
  };

  // Doors keep their step and their approach. The door columns are read back
  // off what the earlier passes wrote rather than taken on trust from a
  // rotated local coordinate: a door is a `*_door` block, and the emitted
  // world is the only place that is unambiguously true.
  const reserved = new Set<string>();
  for (const b of input.existing ?? []) {
    const name = input.stack.blockNameByStateId(b.stateId);
    if (name === undefined || !name.endsWith("_door")) continue;
    for (let dz = -DOOR_CLEARANCE; dz <= DOOR_CLEARANCE; dz++) {
      for (let dx = -DOOR_CLEARANCE; dx <= DOOR_CLEARANCE; dx++) {
        reserved.add(key2(b.x + dx, b.z + dz));
      }
    }
  }

  const planter = new Planter(
    world,
    input.stack,
    walkLane,
    carriageway,
    reserved,
    input.budget ?? 200000,
  );

  // --- frontage -------------------------------------------------------------
  const runs: FrontageRun[] = [];
  for (const building of input.buildings) {
    runs.push(...frontageRuns(building, sidewalkOrRoad));
  }

  // --- 1. the kerb ----------------------------------------------------------
  // First, because a parked car is the largest committed object on the street
  // and everything else can work around one.
  for (const district of input.districts ?? []) {
    dressKerbside(district, input, world, planter);
  }

  // --- 2. open ground -------------------------------------------------------
  const open = openPatches(input, world, sidewalkOrRoad);
  for (const patch of open) dressOpenGround(patch, input, world, planter);

  // --- 3. street frontage ---------------------------------------------------
  for (const run of runs) {
    if (!run.street) continue;
    dressStreetFrontage(run, input, world, planter);
  }

  // --- 4. facades above the ground -----------------------------------------
  for (const run of runs) dressFacade(run, input, world, planter);

  // --- 5. backs and alleys --------------------------------------------------
  for (const run of runs) {
    if (run.street) continue;
    dressBack(run, input, world, planter);
  }

  // --- 6. lit interiors -----------------------------------------------------
  for (const building of input.buildings) lightRooms(building, input, world, planter);

  // Only a settlement that *had* frontage and still dressed none of it is
  // saying anything. A hamlet with one cottage and no street produces no runs
  // at all, and "nothing to dress" is the correct outcome there, not a defect.
  //
  // A note rather than a warning, because the reader who can act on it is a
  // compiler author, not a document author: what it diagnoses is this pass
  // running before the streetscape instead of after it, which no edit to the
  // Loam document can fix. Raised as a warning it fed the authoring loop a
  // revision request the model could not satisfy, and every small world paid
  // two extra model calls to fail at it twice.
  if (planter.spent() === 0 && runs.length > 0) {
    diagnostics.push(
      note(
        "LIFE_PASS_EMPTY",
        nodePath,
        "the life pass planted nothing: every candidate column was already claimed",
        "this is usually a sign the pass ran before the streetscape rather than after it",
      ),
    );
  }

  const stats: Record<string, number> = {};
  for (const [kind, n] of [...planter.stats.entries()].sort()) stats[kind] = n;
  stats["lifeTotal"] = planter.spent();
  stats["lifeBlocks"] = planter.blocks.length;
  return { blocks: planter.blocks, diagnostics, stats };
}

/* -------------------------------------------------------------------------- */
/* 3 — street frontage                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Dress one street-facing run: awnings, signage, and goods on the pavement.
 *
 * The dressed part of a run is **one contiguous stretch**, positioned and
 * lengthened by a hash of the run's first column. That is the whole clustering
 * model, and it is deliberately simple: a run is a shop's frontage, a stretch
 * is the part of it with an awning over it, and two adjacent shops with
 * different hashes give exactly the ragged, partial coverage that a sprinkle
 * never produces.
 */
function dressStreetFrontage(
  run: FrontageRun,
  input: LifePassInput,
  world: LifeWorld,
  planter: Planter,
): void {
  const rules = FRONTAGE_RULES[run.frontage];
  const seed = detailSeed(input.seed, "life.frontage");
  const head = run.wall[0] as { x: number; z: number };
  const n = run.wall.length;
  if (n === 0) return;

  const span = Math.max(1, Math.round(n * rules.stretch));
  const slack = n - span;
  const start = slack <= 0 ? 0 : hashInt(seed, head.x, head.z, 1, 0, slack);
  const wood = hashPick(seed, head.x, head.z, 2, AWNING_WOODS);
  const shopColour = hashPick(seed, head.x, head.z, 3, SIGN_COLOURS);
  // A canopy street and an awning street are two different streets; the choice
  // is per run, not per bay, because a row of shops shares a builder.
  const pitched = hash2(seed, head.x, head.z, 4) < 0.35;
  const d = run.dir;
  const floorY = run.building.floorY;
  const awningY = floorY + 3;

  for (let i = start; i < start + span && i < n; i++) {
    const w = run.wall[i] as { x: number; z: number };
    const ox = w.x + d.dx;
    const oz = w.z + d.dz;
    const bay = hash2(seed, ox, oz, 5);
    // Headroom. The awning hangs off the *building*, so its height is set by
    // the building's floor; on a graded frontage the pavement can be most of
    // the way up to it, and a canopy at head height over a footway is worse
    // than no canopy. Three blocks of clear air or it does not go up.
    const pavement = world.standY(ox, oz);
    const headroom = pavement === undefined || awningY - pavement >= 3;

    // The awning. It brackets to the wall, so the wall has to be there —
    // "there", not "a full cube": `floating.slab` asks for a neighbour that is
    // not air, and a window pane at first-floor height is a wall as far as
    // both the lint and the eye are concerned. Demanding a full cube would
    // delete the awning from every bay with a window over the shopfront,
    // which on a shop_row is most of them.
    if (headroom && bay < rules.awning && !world.emptyAt(w.x, awningY, w.z)) {
      const ops = pitched ? canopyOps(wood, d) : awningOps(wood);
      if (planter.place("awning", ops, ox, awningY, oz, FACADE_RULE, false)) {
        // A lantern under a flat awning, and only under a flat one: a top-half
        // stair has no solid underside for `hungChain` to find.
        if (!pitched && hash2(seed, ox, oz, 6) < rules.light) {
          planter.place(
            "awningLantern",
            awningLanternOps(),
            ox,
            awningY - 1,
            oz,
            ATTACHED_RULE,
            false,
          );
        }
      }
    }

    // Signage. It goes *above* the awning band by default, because the awning
    // usually got there first and a banner tucked under one is a banner nobody
    // reads; the fascia band under the first-floor windows is where a shop
    // puts its name anyway. Below the awning is the fallback for a bay that
    // has none.
    if (hash2(seed, ox, oz, 7) < rules.signage) {
      const colour =
        hash2(seed, ox, oz, 8) < 0.5 ? shopColour : hashPick(seed, ox, oz, 9, SIGN_COLOURS);
      const boarded = hash2(seed, ox, oz, 13) < 0.35;
      const fascia = awningY + 1;
      const placed =
        world.solidAt(w.x, fascia, w.z) &&
        (boarded
          ? planter.place("shopBoard", boardOps(colour), ox, fascia, oz, FACADE_RULE, false)
          : planter.place("banner", bannerOps(colour, d), ox, fascia, oz, FACADE_RULE, false));
      if (!placed && world.solidAt(w.x, floorY + 2, w.z)) {
        planter.place("banner", bannerOps(colour, d), ox, floorY + 2, oz, FACADE_RULE, false);
      }
    }

    // A facade light where there is no awning to hang one under.
    if (hash2(seed, ox, oz, 10) < rules.light * 0.6) {
      const lightY = floorY + 3;
      if (world.solidAt(w.x, lightY, w.z)) {
        planter.place(
          "facadeLight",
          facadeLightOps(d, hash2(seed, ox, oz, 11) < 0.25),
          ox,
          lightY,
          oz,
          FACADE_RULE,
          false,
        );
      }
    }

    // Goods on the pavement. Ground objects respect the min-gap rule, which is
    // what stops two crates sharing a corner.
    if (hash2(seed, ox, oz, 12) >= rules.kerbClutter) continue;
    if (planter.crowded(ox, oz)) continue;
    const standY = world.standY(ox, oz);
    if (standY === undefined || world.wet(ox, oz)) continue;
    plantGroundObject(run.frontage, seed, ox, standY, oz, d, wood, planter, input);
  }
}

/** One piece of pavement clutter, chosen by frontage. */
function plantGroundObject(
  frontage: Frontage,
  seed: number,
  x: number,
  y: number,
  z: number,
  d: Dir,
  wood: string,
  planter: Planter,
  input: LifePassInput,
): boolean {
  const roll = hash2(seed, x, z, 20);
  if (frontage === "shop") {
    if (roll < 0.3) return planter.place("crates", crateOps(hashInt(seed, x, z, 21, 1, 2)), x, y, z, PAVEMENT_RULE);
    if (roll < 0.5) return placeCatalog("sandwich_board", input, planter, x, y, z);
    if (roll < 0.62) return placeCatalog("market_barrow", input, planter, x, y, z);
    if (roll < 0.74) return placeCatalog("planter", input, planter, x, y, z);
    if (roll < 0.86) return placeCatalog("litter_bin", input, planter, x, y, z);
    return placeCatalog("bicycle_rack", input, planter, x, y, z);
  }
  if (frontage === "industrial") {
    if (roll < 0.4) return planter.place("crates", crateOps(2), x, y, z, PAVEMENT_RULE);
    if (roll < 0.7) return planter.place("pallet", palletOps(wood), x, y, z, PAVEMENT_RULE);
    return planter.place("dumpster", dumpsterOps(d), x, y, z, PAVEMENT_RULE);
  }
  if (frontage === "civic") {
    if (roll < 0.4) return placeCatalog("planter", input, planter, x, y, z);
    if (roll < 0.7) return placeCatalog("notice_board", input, planter, x, y, z);
    return placeCatalog("flagpole", input, planter, x, y, z);
  }
  // Residential, office and plain frontage: quiet, useful things only.
  if (roll < 0.35) return placeCatalog("planter", input, planter, x, y, z);
  if (roll < 0.6) return placeCatalog("litter_bin", input, planter, x, y, z);
  if (roll < 0.8) return placeCatalog("bicycle_rack", input, planter, x, y, z);
  return planter.place("windowBoxPot", [op(0, 0, 0, "flower_pot")], x, y, z, PAVEMENT_RULE);
}

/* -------------------------------------------------------------------------- */
/* catalog props                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Plant one prop from the shared catalog.
 *
 * The catalog is the right home for anything that stands on the ground and has
 * already been drawn once — reimplementing a bench here would be a second bench
 * to keep in step with the first. Its `y = 0` course is the prop's own paved
 * pad, which is dropped: the pavement *is* the pad, and laying a second one
 * would raise the object a block and leave a lip beside it. That is the same
 * decision `streetscape.ts` makes, for the same reason.
 */
function placeCatalog(
  prop: string,
  input: LifePassInput,
  planter: Planter,
  x: number,
  y: number,
  z: number,
  rule: PlaceRule = PAVEMENT_RULE,
): boolean {
  let generated;
  try {
    generated = generateProp({
      prop,
      seed: streamSeed(input.seed, `life.${prop}.${x}.${z}`),
      params: {},
    });
  } catch {
    return false;
  }
  const [sizeX, , sizeZ] = generated.meta.size;
  // Only the small props belong on a pavement; a fairground stall on a
  // sidewalk is a fairground stall in someone's shopfront.
  if (sizeX > 5 || sizeZ > 5) return false;
  const ops: LifeOp[] = [];
  for (const o of generated.ops as readonly LocalVoxelOp[]) {
    if (o.y === 0) continue;
    ops.push(
      o.props === undefined
        ? op(o.x, o.y - 1, o.z, o.block)
        : op(o.x, o.y - 1, o.z, o.block, o.props as Record<string, string>),
    );
  }
  return planter.place(prop, ops, x, y, z, rule);
}

/* -------------------------------------------------------------------------- */
/* 4 — facades above the ground                                                */
/* -------------------------------------------------------------------------- */

/**
 * Everything above the shopfront band: balconies, plant, dishes, window boxes.
 *
 * Balconies cluster by **storey**, not by bay: a building gets a set of storeys
 * that have them and a stretch of bays on each, so the elevation reads as a
 * building with balconies rather than as a wall with balconies scattered on it.
 */
function dressFacade(
  run: FrontageRun,
  input: LifePassInput,
  world: LifeWorld,
  planter: Planter,
): void {
  const rules = FRONTAGE_RULES[run.frontage];
  const seed = detailSeed(input.seed, "life.facade");
  const head = run.wall[0] as { x: number; z: number } | undefined;
  if (head === undefined) return;
  const d = run.dir;
  const b = run.building;
  const wood = hashPick(seed, head.x, head.z, 1, AWNING_WOODS);
  const n = run.wall.length;

  // Storeys above the ground floor, with the top one left alone: a balcony
  // level with the eave has nowhere to put its roof.
  const storeys = b.floorLevels.filter((y) => y > b.floorY && y + 2 < b.wallTopY);

  for (const [level, storeyY] of storeys.entries()) {
    // Balconies are not a street-frontage-only fitting: a flat's balcony over
    // a side lane or a courtyard is the commonest kind there is, and refusing
    // them everywhere but the principal elevation left a city of eighteen.
    // Half the rate off the street, because the principal elevation is still
    // where a builder spends the money.
    const wantsBalcony =
      hash2(seed, head.x + level * 31, head.z, 2) <
      rules.balcony * (run.street ? 1 : 0.5);
    if (wantsBalcony && n >= 3) {
      const width = Math.min(3, n - 2);
      const slack = n - width;
      const at = slack <= 0 ? 0 : hashInt(seed, head.x, head.z + level * 17, 3, 0, slack);
      const anchor = run.wall[at] as { x: number; z: number };
      // Every bay of the deck needs a wall behind it at the deck's own height,
      // or the deck is a shelf bolted to a window.
      // Non-empty, not full-cube: a balcony hangs off a window bay as happily
      // as off a blank wall, and the deck's own neighbours keep it out of
      // `floating.slab` either way.
      let backed = true;
      for (let i = 0; i < width; i++) {
        const w = run.wall[at + i] as { x: number; z: number };
        if (world.emptyAt(w.x, storeyY, w.z) && world.emptyAt(w.x, storeyY + 1, w.z)) {
          backed = false;
          break;
        }
      }
      if (backed) {
        // Two deep if the pavement allows it, one deep otherwise. Trying the
        // generous version first and falling back is what stops the reserved
        // walk lane from silently deleting every balcony in the city.
        const deep = planter.place(
          "balcony",
          balconyOps(wood, d, width, 2),
          anchor.x + d.dx,
          storeyY,
          anchor.z + d.dz,
          FACADE_RULE,
          false,
        );
        if (!deep) {
          planter.place(
            "balcony",
            balconyOps(wood, d, width, 1),
            anchor.x + d.dx,
            storeyY,
            anchor.z + d.dz,
            FACADE_RULE,
            false,
          );
        }
      }
    }

    // Plant: condensers low, dishes high, and neither on a street elevation of
    // a civic building, which is the one place they would look wrong.
    for (let i = 0; i < n; i++) {
      const w = run.wall[i] as { x: number; z: number };
      const ox = w.x + d.dx;
      const oz = w.z + d.dz;
      // Plant lives round the side and the back. A principal elevation with a
      // condenser bolted over the shopfront is the tell that nobody looked at
      // the building from the street, so the street rate is a quarter of the
      // flank rate rather than the same number.
      const roll = hash2(seed, ox, oz + level * 101, 4);
      if (roll >= (run.street ? rules.plant * 0.25 : rules.plant)) continue;
      const high = level >= storeys.length - 1 && storeys.length > 1;
      const mountY = storeyY + 1;
      if (!world.solidAt(w.x, mountY, w.z)) continue;
      const ops = high && hash2(seed, ox, oz, 5) < 0.4 ? dishOps() : acUnitOps(d);
      planter.place(high ? "satelliteDish" : "acUnit", ops, ox, mountY, oz, FACADE_RULE, false);
    }

    // Window boxes: residential only, and clustered on one stretch per storey.
    if (run.frontage !== "residential" || !run.street) continue;
    if (hash2(seed, head.x, head.z + level * 7, 6) >= 0.5) continue;
    for (let i = 0; i < n; i++) {
      if (hash2(seed, (run.wall[i] as { x: number }).x, storeyY, 7) >= 0.5) continue;
      const w = run.wall[i] as { x: number; z: number };
      if (world.emptyAt(w.x, storeyY, w.z)) continue;
      planter.place(
        "windowBox",
        windowBoxOps(wood, d),
        w.x + d.dx,
        storeyY + 1,
        w.z + d.dz,
        FACADE_RULE,
        false,
      );
    }
  }

  // A glowing panel or two at the top of an office tower — the thing that makes
  // a skyline read at night from across the bay.
  if (run.frontage === "office" && b.wallTopY - b.floorY >= 12) {
    for (let i = 0; i < n; i++) {
      const w = run.wall[i] as { x: number; z: number };
      if (hash2(seed, w.x, w.z, 8) >= 0.12) continue;
      const y = b.wallTopY - 2;
      if (!world.solidAt(w.x, y, w.z)) continue;
      planter.place("glowPanel", glowPanelOps(), w.x + d.dx, y, w.z + d.dz, FACADE_RULE, false);
    }
  }
}

/* -------------------------------------------------------------------------- */
/* 5 — backs and alleys                                                        */
/* -------------------------------------------------------------------------- */

/**
 * The back of a block should feel like the back of a block.
 *
 * Concentrated, not spread: a run gets at most one cluster, centred on a hashed
 * column, and the cluster is dense inside its own few columns. Spreading the
 * same object count evenly along the alley would produce a tidy service yard,
 * which is the opposite of the thing.
 */
function dressBack(
  run: FrontageRun,
  input: LifePassInput,
  world: LifeWorld,
  planter: Planter,
): void {
  const seed = detailSeed(input.seed, "life.back");
  const n = run.wall.length;
  if (n < 3) return;
  const head = run.wall[0] as { x: number; z: number };
  const d = run.dir;
  const b = run.building;
  const wood = hashPick(seed, head.x, head.z, 1, AWNING_WOODS);

  // A fire escape, on a run that is tall enough to need one.
  if (
    b.floorLevels.length >= FIRE_ESCAPE_MIN_STOREYS &&
    hash2(seed, head.x, head.z, 2) < FIRE_ESCAPE_CHANCE
  ) {
    const at = hashInt(seed, head.x, head.z, 3, 1, n - 2);
    const w = run.wall[at] as { x: number; z: number };
    const loY = b.floorY + 1;
    const hiY = Math.min(b.wallTopY - 1, b.floorY + 3 * (b.floorLevels.length - 1) + 2);
    // Every rung needs a full cube behind it, or `unsupported.ladder` fires on
    // whichever rung crosses a window.
    let backed = hiY > loY + 2;
    for (let y = loY; y <= hiY && backed; y++) backed = world.solidAt(w.x, y, w.z);
    if (backed) {
      const landings = b.floorLevels.filter((y) => y > loY && y < hiY);
      planter.place(
        "fireEscape",
        fireEscapeOps(d, loY, hiY, landings),
        w.x + d.dx,
        loY,
        w.z + d.dz,
        FACADE_RULE,
        false,
      );
    }
  }

  // Graffiti: a glazed panel flat on the wall, at eye height rather than at
  // knee height — a full cube one block off the ground in a service alley is
  // something you walk into, and the point of the panel is that you see it.
  if (hash2(seed, head.x, head.z, 4) < 0.3) {
    const at = hashInt(seed, head.x, head.z, 5, 0, n - 1);
    const w = run.wall[at] as { x: number; z: number };
    const y = b.floorY + 2;
    if (world.solidAt(w.x, y, w.z)) {
      planter.place(
        "mural",
        muralOps(hashPick(seed, w.x, w.z, 6, SIGN_COLOURS)),
        w.x + d.dx,
        y,
        w.z + d.dz,
        FACADE_RULE,
        false,
      );
    }
  }

  if (hash2(seed, head.x, head.z, 7) >= BACK_CLUSTER_CHANCE) return;
  const centre = hashInt(seed, head.x, head.z, 8, 0, n - 1);
  for (let k = 0; k < BACK_CLUSTER_SIZE; k++) {
    const offset = hashInt(seed, head.x + k, head.z, 9, -BACK_CLUSTER_SPREAD, BACK_CLUSTER_SPREAD);
    const at = centre + offset;
    if (at < 0 || at >= n) continue;
    const w = run.wall[at] as { x: number; z: number };
    // The cluster spills one and two columns out from the wall, which is what
    // makes it a heap rather than a shelf.
    const out = hashInt(seed, w.x + k, w.z, 10, 1, 2);
    const x = w.x + d.dx * out;
    const z = w.z + d.dz * out;
    const y = world.standY(x, z);
    if (y === undefined || world.wet(x, z)) continue;
    if (planter.crowded(x, z, 2)) continue;
    const roll = hash2(seed, x + k, z, 11);
    if (roll < 0.3) planter.place("dumpster", dumpsterOps(d), x, y, z, PAVEMENT_RULE);
    else if (roll < 0.6) planter.place("crates", crateOps(hashInt(seed, x, z, 12, 1, 2)), x, y, z, PAVEMENT_RULE);
    else if (roll < 0.8) planter.place("pallet", palletOps(wood), x, y, z, PAVEMENT_RULE);
    else placeCatalog("log_pile", input, planter, x, y, z);
  }
}

/* -------------------------------------------------------------------------- */
/* 1 — the kerb                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Parked cars, bus stops and kerbside fittings along one district's streets.
 *
 * Cars go in **runs**: a short queue of two or three nose to tail, then a long
 * gap, which is what a parking lane looks like. A car every {@link CAR_LENGTH}
 * blocks forever is a car park.
 */
function dressKerbside(
  district: LifeStreets,
  input: LifePassInput,
  world: LifeWorld,
  planter: Planter,
): void {
  const seed = detailSeed(input.seed, "life.kerb");
  const region = input.plan.region;
  const masks = district.masks;

  for (const segment of district.graph.segments) {
    const cells = walkStreet(segment.path);
    if (cells.length < 12) continue;
    const half = (segment.width - 1) >> 1;
    const arterial = segment.width >= ARTERIAL_MIN_WIDTH;

    // --- parked cars -------------------------------------------------------
    if (segment.width >= PARKING_MIN_WIDTH) {
      for (let base = 4; base + CAR_LENGTH < cells.length - 4; base += PARKING_PERIOD) {
        const anchor = cells[base] as { x: number; z: number };
        if (hash2(seed, anchor.x, anchor.z, 1) >= 0.65) continue;
        const side = hash2(seed, anchor.x, anchor.z, 2) < 0.5 ? 1 : -1;
        const cars = hashInt(seed, anchor.x, anchor.z, 3, 1, CARS_PER_RUN);
        for (let c = 0; c < cars; c++) {
          const i = base + c * (CAR_LENGTH + 1);
          const step = cells[i];
          if (step === undefined || i + CAR_LENGTH >= cells.length) break;
          // The parking lane is the two carriageway columns against the kerb.
          // `perp` flips sign with the heading, so the two columns are found
          // and then min-ed rather than reasoned about: a car that grew the
          // wrong way on a southbound avenue would sit in the walk lane.
          const outer = perp(step, side * half);
          const inner = perp(step, side * (half - 1));
          if (!inside(region, outer.x, outer.z) || !inside(region, inner.x, inner.z)) break;
          if (masks.carriageway[index(region, outer.x, outer.z)] !== 1) break;
          if (masks.carriageway[index(region, inner.x, inner.z)] !== 1) break;
          const y = world.standY(outer.x, outer.z);
          if (y === undefined || world.wet(outer.x, outer.z)) break;
          const alongX = step.dx !== 0;
          const colour = hashPick(seed, outer.x, outer.z, 4, CAR_COLOURS);
          const ax = alongX ? outer.x : Math.min(outer.x, inner.x);
          const az = alongX ? Math.min(outer.z, inner.z) : outer.z;
          planter.place("parkedCar", carOps(colour, alongX), ax, y, az, PARKING_RULE);
        }
      }
    }

    // --- bus stops, on arterials only --------------------------------------
    if (arterial) {
      for (const frac of [0.3, 0.7]) {
        const i = Math.floor(cells.length * frac);
        const step = cells[i];
        if (step === undefined) continue;
        if (hash2(seed, step.x, step.z, 5) >= 0.5) continue;
        const side = hash2(seed, step.x, step.z, 6) < 0.5 ? 1 : -1;
        const at = perp(step, side * (half + district.graph.sidewalk));
        const y = world.standY(at.x, at.z);
        if (y === undefined) continue;
        if (!inside(region, at.x, at.z) || masks.sidewalk[index(region, at.x, at.z)] !== 1) continue;
        placeCatalog("bus_shelter", input, planter, at.x, y, at.z);
      }
    }

    // --- fittings: hydrants, boxes, drains ---------------------------------
    for (let i = 6; i < cells.length - 6; i += KERB_FITTING_PERIOD) {
      const step = cells[i] as { x: number; z: number; dx: number; dz: number };
      const side = hash2(seed, step.x, step.z, 7) < 0.5 ? 1 : -1;
      const at = perp(step, side * (half + district.graph.sidewalk));
      if (!inside(region, at.x, at.z)) continue;
      if (masks.sidewalk[index(region, at.x, at.z)] !== 1) continue;
      const y = world.standY(at.x, at.z);
      if (y === undefined || world.wet(at.x, at.z)) continue;
      if (planter.crowded(at.x, at.z)) continue;
      const roll = hash2(seed, at.x, at.z, 8);
      const facing =
        step.dx !== 0
          ? side === 1
            ? DIRS[0] as Dir
            : DIRS[2] as Dir
          : side === 1
            ? DIRS[1] as Dir
            : DIRS[3] as Dir;
      if (roll < 0.3) planter.place("hydrant", hydrantOps(), at.x, y, at.z, PAVEMENT_RULE);
      else if (roll < 0.5) {
        planter.place(
          "newspaperBox",
          newsBoxOps(hashPick(seed, at.x, at.z, 9, SIGN_COLOURS), facing),
          at.x,
          y,
          at.z,
          PAVEMENT_RULE,
        );
      } else if (roll < 0.7) placeCatalog("mailbox", input, planter, at.x, y, at.z);
      else if (roll < 0.85) placeCatalog("bollard_row", input, planter, at.x, y, at.z);
      else placeCatalog("phone_box", input, planter, at.x, y, at.z);
    }

    // --- gutter drains ------------------------------------------------------
    // A surface repaint, not a block: a grate you can trip on is worse than no
    // grate, and the carriageway column against the kerb is exactly where the
    // water would go.
    for (let i = 3; i < cells.length - 3; i += 9) {
      const step = cells[i] as { x: number; z: number; dx: number; dz: number };
      const side = hash2(seed, step.x, step.z, 10) < 0.5 ? 1 : -1;
      const at = perp(step, side * half);
      if (!inside(region, at.x, at.z)) continue;
      const idx = index(region, at.x, at.z);
      if (masks.carriageway[idx] !== 1) continue;
      if (input.plan.fluidKind[idx] !== FluidKind.NONE) continue;
      if (world.taken(at.x, at.z)) continue;
      if (hash2(seed, at.x, at.z, 11) >= 0.4) continue;
      const state = input.stack.blockByName("polished_blackstone")?.stateId;
      if (state === undefined) continue;
      input.plan.surface[idx] = state;
      planter.stats.set("gutterDrain", (planter.stats.get("gutterDrain") ?? 0) + 1);
    }
  }
}

/* -------------------------------------------------------------------------- */
/* 2 — plazas and open ground                                                  */
/* -------------------------------------------------------------------------- */

/** A contiguous patch of unclaimed open ground inside a district. */
interface OpenPatch {
  readonly columns: readonly { readonly x: number; readonly z: number }[];
  readonly bounds: Rect;
  /** True when the patch touches a sidewalk — a square, not a back court. */
  readonly public: boolean;
}

/**
 * Find the open ground: everything inside a district that nobody claimed.
 *
 * Derived rather than plumbed. `plaza: true` reserves a whole block of the
 * fabric and hands out no rectangle for it, and a courtyard in the middle of a
 * terrace is not in anybody's contract at all — but both are just "columns
 * inside the district that are neither street nor building nor claimed", and a
 * flood fill finds them with no new cross-track surface.
 *
 * Traversal is row-major over the district's bounds and the frontier is a
 * plain array used as a stack, so the patch list is a pure function of the
 * input regardless of how any set iterates.
 */
function openPatches(
  input: LifePassInput,
  world: LifeWorld,
  sidewalkOrRoad: (x: number, z: number) => boolean,
): OpenPatch[] {
  const out: OpenPatch[] = [];
  const region = input.plan.region;
  const building = new Set<string>();
  for (const b of input.buildings) for (const c of b.cells) building.add(c);

  for (const district of input.districts ?? []) {
    const { x0, z0, x1, z1 } = district.bounds;
    const w = x1 - x0 + 1;
    const h = z1 - z0 + 1;
    if (w <= 0 || h <= 0) continue;
    const seen = new Uint8Array(w * h);
    const free = (x: number, z: number): boolean => {
      if (x < x0 || x > x1 || z < z0 || z > z1) return false;
      if (!inside(region, x, z)) return false;
      if (sidewalkOrRoad(x, z)) return false;
      if (building.has(key2(x, z))) return false;
      if (world.taken(x, z)) return false;
      if (world.wet(x, z)) return false;
      return world.standY(x, z) !== undefined;
    };
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        if (seen[j * w + i] === 1) continue;
        seen[j * w + i] = 1;
        const sx = x0 + i;
        const sz = z0 + j;
        if (!free(sx, sz)) continue;
        const columns: { x: number; z: number }[] = [];
        const stack: { x: number; z: number }[] = [{ x: sx, z: sz }];
        let bx0 = sx;
        let bz0 = sz;
        let bx1 = sx;
        let bz1 = sz;
        let touchesStreet = false;
        while (stack.length > 0) {
          const c = stack.pop() as { x: number; z: number };
          columns.push(c);
          if (c.x < bx0) bx0 = c.x;
          if (c.z < bz0) bz0 = c.z;
          if (c.x > bx1) bx1 = c.x;
          if (c.z > bz1) bz1 = c.z;
          for (const d of DIRS) {
            const nx = c.x + d.dx;
            const nz = c.z + d.dz;
            if (sidewalkOrRoad(nx, nz)) touchesStreet = true;
            if (nx < x0 || nx > x1 || nz < z0 || nz > z1) continue;
            const k = (nz - z0) * w + (nx - x0);
            if (seen[k] === 1) continue;
            seen[k] = 1;
            if (!free(nx, nz)) continue;
            stack.push({ x: nx, z: nz });
          }
        }
        if (columns.length < 40) continue;
        columns.sort((a, b) => (a.z !== b.z ? a.z - b.z : a.x - b.x));
        out.push({
          columns,
          bounds: { x0: bx0, z0: bz0, x1: bx1, z1: bz1 },
          public: touchesStreet && columns.length >= PLAZA_MIN_AREA,
        });
      }
    }
  }
  return out;
}

/**
 * Dress an open patch: a market on a square, clutter in a back court.
 *
 * The market is a **row**, laid along the patch's long axis at a fixed pitch,
 * because that is what a market is; the seating and the trees hang off the row
 * rather than being scattered independently, so the square has a spine.
 */
function dressOpenGround(
  patch: OpenPatch,
  input: LifePassInput,
  world: LifeWorld,
  planter: Planter,
): void {
  const seed = detailSeed(input.seed, "life.open");
  const b = patch.bounds;
  const cx = (b.x0 + b.x1) >> 1;
  const cz = (b.z0 + b.z1) >> 1;
  const alongX = b.x1 - b.x0 >= b.z1 - b.z0;
  const wood = hashPick(seed, b.x0, b.z0, 1, AWNING_WOODS);
  const free = new Set(patch.columns.map((c) => key2(c.x, c.z)));

  if (!patch.public) {
    // A back court: a heap of service clutter near one corner, nothing else.
    if (patch.columns.length > COURT_MAX_AREA) return;
    const anchor = patch.columns[hashInt(seed, b.x0, b.z0, 2, 0, patch.columns.length - 1)] as {
      x: number;
      z: number;
    };
    for (let k = 0; k < 5; k++) {
      const x = anchor.x + hashInt(seed, anchor.x + k, anchor.z, 3, -2, 2);
      const z = anchor.z + hashInt(seed, anchor.x, anchor.z + k, 4, -2, 2);
      if (!free.has(key2(x, z))) continue;
      const y = world.standY(x, z);
      if (y === undefined) continue;
      if (planter.crowded(x, z, 2)) continue;
      if (hash2(seed, x, z, 5) < 0.5) planter.place("crates", crateOps(2), x, y, z, PAVEMENT_RULE);
      else planter.place("pallet", palletOps(wood), x, y, z, PAVEMENT_RULE);
    }
    return;
  }

  // --- a market row ---------------------------------------------------------
  const rowLength = Math.min(STALL_ROW_LENGTH, Math.floor((alongX ? b.x1 - b.x0 : b.z1 - b.z0) / STALL_PITCH));
  for (let k = 0; k < rowLength; k++) {
    const offset = (k - (rowLength - 1) / 2) * STALL_PITCH;
    const x = alongX ? cx + Math.round(offset) : cx;
    const z = alongX ? cz : cz + Math.round(offset);
    if (!free.has(key2(x, z))) continue;
    const y = world.standY(x, z);
    if (y === undefined) continue;
    planter.place(
      "marketStall",
      stallOps(wood, hashPick(seed, x, z, 6, SIGN_COLOURS), alongX),
      x,
      y,
      z,
    );
  }

  // --- a fountain, where the square is big enough to deserve one ------------
  if (patch.columns.length >= PLAZA_MIN_AREA * 2 && hash2(seed, b.x0, b.z0, 7) < 0.6) {
    const fx = alongX ? cx : cx;
    const fz = alongX ? cz + 8 : cz + 8;
    if (free.has(key2(fx, fz))) {
      const y = world.standY(fx, fz);
      if (y !== undefined) placeCatalog("drinking_fountain", input, planter, fx, y, fz);
    }
  }

  // --- seating clusters and street trees, along the square's edge -----------
  let trees = 0;
  for (const c of patch.columns) {
    const edge =
      c.x === b.x0 + 1 || c.x === b.x1 - 1 || c.z === b.z0 + 1 || c.z === b.z1 - 1;
    if (!edge) continue;
    if ((c.x + c.z) % TREE_PITCH !== 0) continue;
    const y = world.standY(c.x, c.z);
    if (y === undefined) continue;
    if (planter.crowded(c.x, c.z, 4)) continue;
    const wooded = hash2(seed, c.x, c.z, 8);
    if (wooded < 0.55) {
      const kind = hashPick(seed, c.x, c.z, 9, TREE_WOODS);
      if (planter.place("streetTree", treeOps(kind.log, kind.leaves), c.x, y, c.z)) trees++;
    } else if (wooded < 0.75) {
      planter.place("seatCluster", seatClusterOps(wood), c.x, y, c.z);
    } else {
      placeCatalog("bench", input, planter, c.x, y, c.z);
    }
  }
  if (trees === 0 && patch.columns.length >= PLAZA_MIN_AREA * 3) {
    // A square with no tree on it is a car park. Try the interior instead.
    for (const c of patch.columns) {
      if ((c.x * 7 + c.z * 13) % 23 !== 0) continue;
      const y = world.standY(c.x, c.z);
      if (y === undefined) continue;
      if (planter.crowded(c.x, c.z, 5)) continue;
      const kind = hashPick(seed, c.x, c.z, 10, TREE_WOODS);
      planter.place("streetTree", treeOps(kind.log, kind.leaves), c.x, y, c.z);
    }
  }
}

/* -------------------------------------------------------------------------- */
/* 6 — lit interiors                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Hang a lantern in a fraction of rooms, so the city reads at night.
 *
 * **This is the one place the pass writes into a column another pass claimed**,
 * and the exemption is narrow and deliberate. The column rule exists to stop
 * two objects fighting over the same *space*; a room's ceiling void is not
 * contested space, it is empty air inside a building, and asking the column
 * question about it would forbid the only thing that turns a dark elevation
 * into a lit one. What replaces the column rule is a stricter voxel rule:
 *
 * - the target voxel and the one below it are empty **in the emitted world**;
 * - the voxel above it is a full cube, which is what `hanging=true` needs and
 *   what `hungChain` walks up to find;
 * - the lantern sits at least two blocks above the storey's floor, so a 1x2
 *   body standing under it is not inside it — otherwise the traversal lint
 *   would report a room it cannot cross, which is exactly how three archetypes
 *   failed in the terrarium.
 *
 * Variation is per building *and* per storey: a tower with every window lit is
 * as dead as a tower with none.
 */
/**
 * Whether `(x, z)` is a stair column or touches one.
 *
 * The ring matters as much as the flight. A room lantern hangs at `foot + 2`,
 * one block over the head of a player standing on that storey's floor — and
 * exactly at the head height of one climbing the tread below it. A flight
 * arrives and leaves through the columns beside its own, so guarding only the
 * treads still sealed the storeys above.
 */
function nearStair(building: LifeBuilding, x: number, z: number): boolean {
  const stairs = building.stairCells;
  if (stairs === undefined) return false;
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      if (stairs.has(`${x + dx},${z + dz}`)) return true;
    }
  }
  return false;
}

function lightRooms(
  building: LifeBuilding,
  input: LifePassInput,
  world: LifeWorld,
  planter: Planter,
): void {
  const cells = building.interiorCells;
  if (cells === undefined || cells.size === 0) return;
  const rules = FRONTAGE_RULES[classifyFrontage(building.archetype, building.tags)];
  const seed = detailSeed(input.seed, "life.rooms");
  const columns = [...cells]
    .map((k) => k.split(",").map(Number) as [number, number])
    .sort((a, b) => (a[1] !== b[1] ? a[1] - b[1] : a[0] - b[0]));

  for (const [level, floorPlane] of building.floorLevels.entries()) {
    if (floorPlane < building.floorY) continue;
    // Per-storey occupancy: some floors are dark, and which ones is a property
    // of the building, not of the city.
    const lit = hash2(seed, building.footprint.x0 + level * 37, building.footprint.z0, 1);
    if (lit >= rules.litRooms) continue;
    // …and how brightly a lit floor is lit varies too. A single global rate
    // gives every occupied storey the same even glow, which from across the
    // bay reads as a grid of identical windows — the exact "generated" tell
    // this track exists to remove. Two per cent to nine, per storey.
    const density = LIT_ROOM_MIN + (LIT_ROOM_MAX - LIT_ROOM_MIN) * lit / Math.max(rules.litRooms, 1e-6);
    for (const [x, z] of columns) {
      if (nearStair(building, x, z)) continue;
      if (hash2(seed, x, z + level * 211, 2) >= density) continue;
      // The walkable plane. `floorLevels` names a storey's *floor*, and whether
      // that index is the deck itself or the air standing on it depends on the
      // grammar's cellar handling — so take whichever of the two is empty
      // rather than assuming, which is what made this stage light one room in
      // ten and look like a tuning problem.
      let foot = -1;
      for (const y of [floorPlane, floorPlane + 1]) {
        if (world.emptyAt(x, y, z)) {
          foot = y;
          break;
        }
      }
      if (foot < 0 || !world.emptyAt(x, foot + 1, z)) continue;
      // Find the ceiling: the first voxel above the room that a lantern could
      // actually hang from. A storey deck is as often slabs as planks, and
      // `hangableAt` is the lint's own answer to which of those will hold.
      let ceiling = -1;
      for (let y = foot + 2; y <= foot + 8; y++) {
        if (world.emptyAt(x, y, z)) continue;
        if (world.hangableAt(x, y, z)) ceiling = y;
        break;
      }
      if (ceiling < foot + 3) continue;
      const at = ceiling - 1;
      if (!world.emptyAt(x, at, z)) continue;
      planter.place(
        "roomLight",
        [op(0, 0, 0, "lantern", { hanging: "true", waterlogged: "false" })],
        x,
        at,
        z,
        { requireFreeColumn: false, requireEmptyVoxel: true },
        false,
      );
    }
  }
}
