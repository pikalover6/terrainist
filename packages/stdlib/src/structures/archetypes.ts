/**
 * Building **contents** — archetypes and their fit-out.
 *
 * `core.ts` owns SHAPE (footprint, walls, openings, roof, stairs, the cellar
 * shell, rotation). This module owns CONTENTS: what a building is *for*, the
 * tag → archetype mapping, and the props each archetype puts on its floor.
 * Split out of `structures/index.ts` verbatim in the structures refactor;
 * `index.ts` re-exports both halves, so every existing import path is unchanged.
 */

import { positionFloat, type Seed256 } from "../determinism/index.js";
import { KNOWN_BUILDING_ARCHETYPES, type KnownBuildingArchetype } from "@terrainist/spec/ir";

import { cardinalStep, type Cardinal, type LocalRect, type LocalVoxelOp, type Put } from "./core.js";
import {
  FloorPlan,
  EXTENDED_BUILDING_DESCRIPTORS,
  furnishUpperFloors,
  furnishWing,
  isPassable,
  PropCounter,
  wholeFloorPlan,
  type FitOutContext,
} from "./archetypes-civic.js";

export * from "./archetypes-civic.js";

export * from "./archetypes-blitz.js";
export * from "./archetypes-vernacular.js";
export * from "./archetypes-regional.js";
export * from "./archetypes-wave2.js";
export * from "./archetypes-works.js";
export * from "./archetypes-institution.js";
export * from "./archetypes-leisure.js";
export * from "./archetypes-homestead.js";
export * from "./archetypes-agrarian.js";
export * from "./archetypes-brine.js";
export * from "./archetypes-wilds.js";
export * from "./archetypes-hedgerow.js";
export * from "./archetypes-frontier.js";
export * from "./archetypes-residential.js";
export * from "./archetypes-commerce.js";
export * from "./archetypes-terminus.js";
export * from "./archetypes-industry.js";
export * from "./archetypes-utility.js";
export * from "./archetypes-garrison.js";
export * from "./archetypes-siegeworks.js";
export * from "./archetypes-classical-b.js";
export * from "./archetypes-science.js";
export * from "./archetypes-arcana.js";
export * from "./archetypes-relic.js";
export * from "./archetypes-spectacle.js";
export * from "./archetypes-faith.js";
export * from "./archetypes-sanctum.js";
export * from "./archetypes-arcane.js";
export * from "./archetypes-eastern.js";
export * from "./archetypes-classical.js";
export * from "./archetypes-xeno.js";
export * from "./archetypes-corsair.js";
export * from "./archetypes-nile.js";
export * from "./archetypes-mesoamerican.js";
export * from "./archetypes-norse.js";
export * from "./archetypes-dwarven.js";
export * from "./archetypes-steppe.js";
export * from "./archetypes-atlantean.js";
export * from "./archetypes-swamp.js";
export * from "./archetypes-caravan.js";
export * from "./archetypes-himalayan.js";
export * from "./archetypes-feudal.js";
export * from "./archetypes-depths.js";
import { isRelicArchetype, relicBareRuinArchetype } from "./archetypes-relic.js";
import { decayProfileFor, decayShellChecked, settleDecayedFixtures, type DecayPassReport } from "./decay.js";

import { fitEntranceTreatment } from "./entrance-fittings.js";

export * from "./entrance-fittings.js";

import { HIGHRISE_BUILDING_DESCRIPTORS } from "./highrise.js";
import { TERRACE_BUILDING_DESCRIPTORS } from "./terrace.js";
import { UNDERGROUND_BUILDING_DESCRIPTORS } from "./underground.js";

import { BLITZ_BUILDING_DESCRIPTORS } from "./archetypes-blitz.js";
import { TOWN_BUILDING_DESCRIPTORS } from "./archetypes-town.js";
import { TRADE_BUILDING_DESCRIPTORS } from "./archetypes-trade.js";
import { VERNACULAR_BUILDING_DESCRIPTORS } from "./archetypes-vernacular.js";
import { REGIONAL_BUILDING_DESCRIPTORS } from "./archetypes-regional.js";
import { WAVE2_BUILDING_DESCRIPTORS } from "./archetypes-wave2.js";
import { WORKS_BUILDING_DESCRIPTORS } from "./archetypes-works.js";
import { INSTITUTION_BUILDING_DESCRIPTORS } from "./archetypes-institution.js";
import { LEISURE_BUILDING_DESCRIPTORS } from "./archetypes-leisure.js";
import { HOMESTEAD_BUILDING_DESCRIPTORS } from "./archetypes-homestead.js";
import { AGRARIAN_BUILDING_DESCRIPTORS } from "./archetypes-agrarian.js";
import { BRINE_BUILDING_DESCRIPTORS } from "./archetypes-brine.js";
import { WILDS_BUILDING_DESCRIPTORS } from "./archetypes-wilds.js";
import { HEDGEROW_BUILDING_DESCRIPTORS } from "./archetypes-hedgerow.js";
import { FRONTIER_BUILDING_DESCRIPTORS } from "./archetypes-frontier.js";
import { RESIDENTIAL_BUILDING_DESCRIPTORS } from "./archetypes-residential.js";
import { COMMERCE_BUILDING_DESCRIPTORS } from "./archetypes-commerce.js";
import { TERMINUS_BUILDING_DESCRIPTORS } from "./archetypes-terminus.js";
import { INDUSTRY_BUILDING_DESCRIPTORS } from "./archetypes-industry.js";
import { UTILITY_BUILDING_DESCRIPTORS } from "./archetypes-utility.js";
import { GARRISON_BUILDING_DESCRIPTORS } from "./archetypes-garrison.js";
import { SIEGEWORKS_BUILDING_DESCRIPTORS } from "./archetypes-siegeworks.js";
import { CLASSICAL_B_BUILDING_DESCRIPTORS } from "./archetypes-classical-b.js";
import { SCIENCE_BUILDING_DESCRIPTORS } from "./archetypes-science.js";
import { ARCANA_BUILDING_DESCRIPTORS } from "./archetypes-arcana.js";
import { RELIC_BUILDING_DESCRIPTORS } from "./archetypes-relic.js";
import { SPECTACLE_BUILDING_DESCRIPTORS } from "./archetypes-spectacle.js";
import { FAITH_BUILDING_DESCRIPTORS } from "./archetypes-faith.js";
import { SANCTUM_BUILDING_DESCRIPTORS } from "./archetypes-sanctum.js";
import { ARCANE_BUILDING_DESCRIPTORS } from "./archetypes-arcane.js";
import { EASTERN_BUILDING_DESCRIPTORS } from "./archetypes-eastern.js";
import { CLASSICAL_BUILDING_DESCRIPTORS } from "./archetypes-classical.js";
import { XENO_BUILDING_DESCRIPTORS } from "./archetypes-xeno.js";
import { CORSAIR_BUILDING_DESCRIPTORS } from "./archetypes-corsair.js";
import { NILE_BUILDING_DESCRIPTORS } from "./archetypes-nile.js";
import { NORSE_BUILDING_DESCRIPTORS } from "./archetypes-norse.js";
import { MESOAMERICAN_BUILDING_DESCRIPTORS } from "./archetypes-mesoamerican.js";
import { DWARVEN_BUILDING_DESCRIPTORS } from "./archetypes-dwarven.js";
import { STEPPE_BUILDING_DESCRIPTORS } from "./archetypes-steppe.js";
import { ATLANTEAN_BUILDING_DESCRIPTORS } from "./archetypes-atlantean.js";
import { SWAMP_BUILDING_DESCRIPTORS } from "./archetypes-swamp.js";
import { CARAVAN_BUILDING_DESCRIPTORS } from "./archetypes-caravan.js";
import { HIMALAYAN_BUILDING_DESCRIPTORS } from "./archetypes-himalayan.js";
import { FEUDAL_BUILDING_DESCRIPTORS } from "./archetypes-feudal.js";
import { DEPTHS_BUILDING_DESCRIPTORS } from "./archetypes-depths.js";

import {
  createStructureRegistry,
  findByTag,
  type BuildingDescriptor,
  type BuildingFacadeDefaults,
} from "./descriptor.js";
export * from "./underground.js";
/* -------------------------------------------------------------------------- */
/* archetypes                                                                  */
/* -------------------------------------------------------------------------- */

/** Most of a granary floor that hay bales may stand on. */
const GRANARY_HAY_SHARE = 0.25;

/** What a building is *for* — the thing that drives its furniture and massing. */
export const BUILDING_ARCHETYPES = KNOWN_BUILDING_ARCHETYPES;

/** A building archetype. */
export type BuildingArchetype = KnownBuildingArchetype;

// The author-visible vocabulary lives in `@terrainist/spec`; the per-pack
// arrays above (EXTENDED_BUILDING_ARCHETYPES etc.) are implementation subsets
// that attach furnish functions to those ids. The exhaustive check below makes
// drift a compile error rather than a runtime surprise.
type _BuildingArchetypeExhaustive = KnownBuildingArchetype extends BuildingArchetype
  ? BuildingArchetype extends KnownBuildingArchetype
    ? true
    : never
  : never;
const _checkBuildingArchetypeExhaustive: _BuildingArchetypeExhaustive = true;
void _checkBuildingArchetypeExhaustive;

/* -------------------------------------------------------------------------- */
/* central base furnishing — the original six (hall/inn/smithy/granary/cottage) */
/* -------------------------------------------------------------------------- */

function furnishCentralBase(_ctx: FitOutContext): number {
  return 0;
}

/* -------------------------------------------------------------------------- */
/* central descriptors — watchtower + original five fallbacks (no leaf)        */
/* -------------------------------------------------------------------------- */

const WATCHTOWER_BUILDING_DESCRIPTORS: readonly BuildingDescriptor[] = [
  {
    id: "watchtower",
    kind: "building",
    tags: ["watchtower", "lookout", "tower"],
    aliases: [],
    furnish: (() => 0) as unknown as (ctx: unknown) => number,
    dispatch: "watchtower",
  },
] as const;

const CENTRAL_FALLBACK_BUILDING_DESCRIPTORS: readonly BuildingDescriptor[] = [
  {
    id: "hall",
    kind: "building",
    tags: ["hall"],
    aliases: [],
    furnish: furnishCentralBase as unknown as (ctx: unknown) => number,
    dispatch: "standard",
  },
  {
    id: "inn",
    kind: "building",
    tags: ["inn", "trade"],
    aliases: [],
    furnish: furnishCentralBase as unknown as (ctx: unknown) => number,
    dispatch: "standard",
  },
  {
    id: "smithy",
    kind: "building",
    tags: ["smithy", "craft"],
    aliases: [],
    furnish: furnishCentralBase as unknown as (ctx: unknown) => number,
    dispatch: "standard",
  },
  {
    id: "granary",
    kind: "building",
    tags: ["granary", "store"],
    aliases: [],
    furnish: furnishCentralBase as unknown as (ctx: unknown) => number,
    dispatch: "standard",
  },
  {
    id: "cottage",
    kind: "building",
    tags: ["cottage", "house"],
    aliases: ["hut"],
    furnish: furnishCentralBase as unknown as (ctx: unknown) => number,
    dispatch: "standard",
  },
] as const;

/* -------------------------------------------------------------------------- */
/* building registry — explicit ordered composition (historical chain)          */
/* -------------------------------------------------------------------------- */

/**
 * Ordered building registry — explicit composition in historical `archetypeOfTags` chain order,
 * not spec ID order. Insertion order is the load-bearing tag-priority order.
 * Bare-ruin fallback (`ruin`/`ruins` → `ruined_cottage`) is preserved as an explicit check after
 * the extended wave and before the original fallbacks, matching the pre-registry `has("hall")` seam.
 */
export const buildingRegistry = createStructureRegistry(
  ...HIGHRISE_BUILDING_DESCRIPTORS,
  ...UNDERGROUND_BUILDING_DESCRIPTORS,
  ...WATCHTOWER_BUILDING_DESCRIPTORS,
  ...BLITZ_BUILDING_DESCRIPTORS,
  ...TOWN_BUILDING_DESCRIPTORS,
  ...TRADE_BUILDING_DESCRIPTORS,
  ...VERNACULAR_BUILDING_DESCRIPTORS,
  ...WAVE2_BUILDING_DESCRIPTORS,
  ...WORKS_BUILDING_DESCRIPTORS,
  ...INSTITUTION_BUILDING_DESCRIPTORS,
  ...LEISURE_BUILDING_DESCRIPTORS,
  ...RESIDENTIAL_BUILDING_DESCRIPTORS,
  ...COMMERCE_BUILDING_DESCRIPTORS,
  ...TERMINUS_BUILDING_DESCRIPTORS,
  ...INDUSTRY_BUILDING_DESCRIPTORS,
  ...UTILITY_BUILDING_DESCRIPTORS,
  ...GARRISON_BUILDING_DESCRIPTORS,
  ...SIEGEWORKS_BUILDING_DESCRIPTORS,
  ...CLASSICAL_B_BUILDING_DESCRIPTORS,
  ...SCIENCE_BUILDING_DESCRIPTORS,
  ...DEPTHS_BUILDING_DESCRIPTORS,
  ...ARCANA_BUILDING_DESCRIPTORS,
  ...RELIC_BUILDING_DESCRIPTORS,
  ...SPECTACLE_BUILDING_DESCRIPTORS,
  ...FAITH_BUILDING_DESCRIPTORS,
  ...SANCTUM_BUILDING_DESCRIPTORS,
  ...ARCANE_BUILDING_DESCRIPTORS,
  ...EASTERN_BUILDING_DESCRIPTORS,
  ...CLASSICAL_BUILDING_DESCRIPTORS,
  ...XENO_BUILDING_DESCRIPTORS,
  ...CORSAIR_BUILDING_DESCRIPTORS,
  ...NILE_BUILDING_DESCRIPTORS,
  ...NORSE_BUILDING_DESCRIPTORS,
  ...MESOAMERICAN_BUILDING_DESCRIPTORS,
  ...DWARVEN_BUILDING_DESCRIPTORS,
  ...STEPPE_BUILDING_DESCRIPTORS,
  ...ATLANTEAN_BUILDING_DESCRIPTORS,
  ...SWAMP_BUILDING_DESCRIPTORS,
  ...CARAVAN_BUILDING_DESCRIPTORS,
  ...HIMALAYAN_BUILDING_DESCRIPTORS,
  ...FEUDAL_BUILDING_DESCRIPTORS,
  ...HOMESTEAD_BUILDING_DESCRIPTORS,
  ...AGRARIAN_BUILDING_DESCRIPTORS,
  ...BRINE_BUILDING_DESCRIPTORS,
  ...WILDS_BUILDING_DESCRIPTORS,
  ...HEDGEROW_BUILDING_DESCRIPTORS,
  ...FRONTIER_BUILDING_DESCRIPTORS,
  ...REGIONAL_BUILDING_DESCRIPTORS,
  ...EXTENDED_BUILDING_DESCRIPTORS,
  ...TERRACE_BUILDING_DESCRIPTORS,
  ...CENTRAL_FALLBACK_BUILDING_DESCRIPTORS,
);

/** Ordered list of building descriptors in historical tag-priority order. */
export const BUILDING_DESCRIPTORS_IN_HISTORICAL_ORDER: readonly BuildingDescriptor[] =
  buildingRegistry.listBuildings();

/** Map a node's tags onto an archetype; `cottage` when nothing matches. */
export function archetypeOfTags(tags: readonly string[]): BuildingArchetype {
  const isFallback = (id: string): boolean =>
    id === "hall" || id === "inn" || id === "smithy" || id === "granary" || id === "cottage";
  for (const d of buildingRegistry.list()) {
    const bd = d as BuildingDescriptor;
    if (isFallback(bd.id)) continue;
    if (bd.dispatch === "terrace") continue;
    if (bd.tags?.some((t) => tags.includes(t)) === true) return bd.id as BuildingArchetype;
    if (bd.aliases?.some((a) => tags.includes(a)) === true) return bd.id as BuildingArchetype;
  }
  const bareRuin = relicBareRuinArchetype(tags);
  if (bareRuin !== null) return bareRuin as unknown as BuildingArchetype;
  for (const d of CENTRAL_FALLBACK_BUILDING_DESCRIPTORS) {
    if (d.tags?.some((t) => tags.includes(t)) === true) return d.id as BuildingArchetype;
    if (d.aliases?.some((a) => tags.includes(a)) === true) return d.id as BuildingArchetype;
  }
  return "cottage";
}

export function resolveArchetype(value: string | undefined): BuildingArchetype {
  if (value !== undefined && (BUILDING_ARCHETYPES as readonly string[]).includes(value)) {
    return value as BuildingArchetype;
  }
  if (value !== undefined) {
    const d = buildingRegistry.get(value);
    if (d !== undefined) return d.id as BuildingArchetype;
  }
  return "cottage";
}

/**
 * Facade tendencies, expressed only in parameters `core.ts` already resolves.
 * Derived from descriptor `facadeDefaults` via ordered registry lookup.
 */
export function archetypeFacadeDefaults(
  archetype: string,
): { readonly windowShape?: string; readonly windowRhythm?: string; readonly roof?: string } {
  const d = buildingRegistry.get(archetype) as BuildingDescriptor | undefined;
  if (d?.facadeDefaults !== undefined) return d.facadeDefaults as BuildingFacadeDefaults;
  return {};
}

/* helpers                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Block names a wall-mounted torch, sign or bracket may hang on.
 *
 * The grammar's wall vocabulary is small and closed — planks, logs, stone,
 * brick, glass panes, doors, trapdoors — so a positive match on the solid part
 * of it is both exact and cheap. Anything unrecognised is treated as *not* a
 * face, which is the safe direction: the cost of a false negative is a torch
 * one cell further along the wall.
 */
const SOLID_BACKING = /(planks|_log$|_wood$|bricks?$|cobblestone$|stone$|_block$|deepslate$|terracotta$|sandstone$|_tiles$|glass$)/;

/* -------------------------------------------------------------------------- */
/* interiors                                                                   */
/* -------------------------------------------------------------------------- */

interface FurnishRequest {
  readonly put: Put;
  readonly style: Readonly<Record<string, string>>;
  readonly archetype: BuildingArchetype;
  readonly interior: LocalRect;
  readonly door: { x: number; z: number; face: Cardinal } | null;
  readonly storyHeight: number;
  readonly floors: number;
  readonly choice: Seed256;
  /** Ground-floor columns the inter-storey stair run stands in. */
  readonly stairColumns: ReadonlySet<string>;
  /** Interior columns at and around the hearth; nothing may be pushed into a fire. */
  readonly hearthColumns: ReadonlySet<string>;
  /** The building's unrotated envelope, `[sizeX, sizeY, sizeZ]`. */
  readonly size: readonly [number, number, number];
  /** Y of the eave plate — the ceiling plane over the top storey. */
  readonly wallTop: number;
  /** Y of the roof's highest course, as the roof generator actually built it. */
  readonly roofTop: number;
  /**
   * Every enclosed floor cell, across **both** rects of the footprint.
   *
   * The generalization of {@link FurnishRequest.interior}: on a rect plan it
   * is exactly the interior rectangle's cells, and on an L or a T it also
   * carries the wing's room. The fit-out reasons about it rather than about
   * the rectangle so that a wing is part of the floor the walkability guard
   * keeps connected, and so a wing can be furnished at all.
   */
  readonly floorCells: readonly { readonly x: number; readonly z: number }[];
  /** What the earlier stages have already written at a cell, if anything. */
  readonly blockAt: (x: number, y: number, z: number) => LocalVoxelOp | undefined;
  /** `params.entrance.treatment` — family D's fitting. See {@link FitOutContext}. */
  readonly entranceTreatment?: string;
  /**
   * `params.decay` — how far gone this one building is, 0..1 (RUINS-PLAN §4.3).
   *
   * The author's way to ruin **one named thing** — a broken watchtower on a
   * ridge — without a district and without a second grammar: the ordinary shell
   * is built and fitted out exactly as it always is, and then written over by
   * the decay engine. Absent, or zero, and not one cell changes, which is what
   * keeps every world with no `decay` byte-identical.
   */
  readonly decay?: number;
  /** Where the decay pass records what it did. See {@link FitOutContext}. */
  readonly decayReport?: DecayPassReport;
  /** See `FitOutContext.skipped`: what the fit-out could not do, one line each. */
  readonly skipped?: string[];
}

/**
 * Fit out the ground floor for what the building is *for*.
 *
 * Modest on purpose: a handful of props that say "someone lives/works here" and
 * that a player can use. Everything stands on the floor plane at `y = 0`, which
 * exists over the whole interior, so nothing here can float. Cells adjacent to
 * the door are left clear so a prop never blocks the way in.
 */
export function furnish(r: FurnishRequest): number {
  const { put, style, interior, door } = r;
  const w = interior.x1 - interior.x0 + 1;
  const d = interior.z1 - interior.z0 + 1;
  if (w < 2 || d < 2) return 0;

  let n = 0;
  /**
   * The ground floor's walkable region, maintained as props land on it.
   *
   * The granary learned this rule for hay and nothing else learned it at all:
   * an inn on a nine-wide plan put a table and two chairs across the room and
   * cut its own front half off from its back. Routing every solid prop through
   * one guard makes "you can cross the room" a property of the fit-out rather
   * than of each archetype's arithmetic.
   */
  const plan = wholeFloorPlan(interior, r.blockAt, r.floorCells);
  /** Every cell of the room, both rects — what `free` is bounded by. */
  const floorSet = new Set(r.floorCells.map((c) => `${c.x},${c.z}`));
  const take = (cells: readonly (readonly [number, number])[], block: string): boolean =>
    isPassable(block) || plan.occupy(cells);
  const free = (x: number, z: number): boolean => {
    // The room, not the rectangle. On a rect plan the two are the same set;
    // on an L or a T the difference is the wing, which is floor a player can
    // stand on and therefore floor the fit-out may use.
    if (!floorSet.has(`${x},${z}`)) return false;
    // Never on the stairs: a bed head in the bottom step is both ugly and a
    // broken climb, and it is exactly what happened the first time round.
    if (r.stairColumns.has(`${x},${z}`)) return false;
    // Never at the hearth: the chimney is in the wall now, and the cell it
    // opens onto is the fireside, not a shelf. A bed or a table there is the
    // "cobblestone directly above a bed" defect in its other form.
    if (r.hearthColumns.has(`${x},${z}`)) return false;
    if (door === null) return true;
    // The door column and the cell straight inside it stay clear.
    const [dx, dz] = cardinalStep(door.face);
    return !((x === door.x && z === door.z) || (x === door.x - dx && z === door.z - dz));
  };
  const place = (x: number, z: number, block: string, props?: Record<string, string>): boolean => {
    if (!free(x, z)) return false;
    if (!take([[x, z]], block)) return false;
    put(x, 1, z, block, props);
    n++;
    return true;
  };
  /**
   * Lay a bed, both halves or neither.
   *
   * Minecraft stores a bed as two blocks sharing one `facing`, with the head
   * at `foot + facing`. The first version had the pair the other way round —
   * head at the anchor, foot at `+z` with `facing = south` — and the client
   * renders that mismatch as two overlapping bed pieces, which is what a
   * walkthrough reported. It also placed each half through `place`, so a foot
   * that landed on a blocked cell left a headboard on its own. Both halves are
   * now checked before either is written, and the head offset is taken from
   * the same `facing` the blocks carry, so {@link rotateOps} — which rotates
   * coordinates and `facing` by the same yaw — keeps the pair together.
   */
  const placeBed = (x: number, z: number, facing: Cardinal, block: string): void => {
    const [dx, dz] = cardinalStep(facing);
    const hx = x + dx;
    const hz = z + dz;
    if (!free(x, z) || !free(hx, hz)) return;
    if (!take([[x, z], [hx, hz]], block)) return;
    put(x, 1, z, block, { facing, part: "foot", occupied: "false" });
    put(hx, 1, hz, block, { facing, part: "head", occupied: "false" });
    n += 2;
  };
  // Wall torches, on the interior face of the two long walls.
  const torchY = Math.min(3, r.storyHeight - 1);
  const torch = style["light.torch"] as string;
  const wallTorch = torch === "torch" ? "wall_torch" : torch;
  for (const [tx0, tz, facing, slide] of [
    [interior.x0, interior.z0, "south", 1],
    [interior.x1, interior.z1, "north", -1],
  ] as const) {
    // A torch bracketed to the north or south wall may slide *along* that wall
    // but never off it, because `facing` names the block it hangs on. It has
    // to slide for two reasons, both found by a world readback: a torch two
    // blocks over the bottom step of a stair is a low bridge you cannot walk
    // under, and a torch whose backing cell is a **window** is bracketed to a
    // pane, which is not a solid face and which the game would drop on the
    // first block update.
    const [bx, bz] = cardinalStep(facing);
    let tx: number | null = null;
    for (let k = 0; k <= interior.x1 - interior.x0; k++) {
      const candidate = tx0 + slide * k;
      if (candidate < interior.x0 || candidate > interior.x1) break;
      if (r.stairColumns.has(`${candidate},${tz}`)) continue;
      const backing = r.blockAt(candidate + bx, torchY, tz + bz);
      if (backing === undefined || !SOLID_BACKING.test(backing.block)) continue;
      tx = candidate;
      break;
    }
    if (tx === null) continue;
    put(tx, torchY, tz, wallTorch, { facing });
    n++;
  }

  const x0 = interior.x0;
  const x1 = interior.x1;
  const z0 = interior.z0;
  const z1 = interior.z1;

  switch (r.archetype) {
    case "cottage": {
      // Head to the wall, foot into the room — the same idiom the upper-storey
      // `beds()` uses. `facing` names the direction from foot to head, so a bed
      // standing at the north edge of the room takes `facing: "north"` with its
      // foot one cell south of the headboard. The first version anchored the
      // foot at the north-west interior corner and faced it *south*, which put
      // the headboard in the middle of the floor and the foot against the wall.
      placeBed(x0, z0 + 1, "north", "red_bed");
      place(x1, z0, "chest", { facing: "west", type: "single" });
      place(x1, z1, "crafting_table");
      place(x1 - 1 >= x0 ? x1 - 1 : x1, z1, "barrel", { facing: "up", open: "false" });
      break;
    }
    case "inn": {
      // Two or three tables: a fence stem with a pressure plate for a top, and
      // stair chairs turned in towards it.
      for (let i = 0; i < 3; i++) {
        const tx = x0 + 1 + i * 2;
        const tz = z0 + 1 + (i % 2);
        if (tx > x1 - 1 || tz > z1 - 1) continue;
        // No table, no chairs: a refused fence cell (the hearth, a reserve)
        // must not leave a pair of seats drawn up to nothing.
        if (!place(tx, tz, style["wall.fence"] as string)) continue;
        if (free(tx, tz)) {
          put(tx, 2, tz, "oak_pressure_plate", { powered: "false" });
          n++;
        }
        // RULE: a stair-chair's `facing` points AWAY from the thing it faces.
        // A stair's `facing` is the direction its HIGH half — the backrest —
        // stands in; the seat opens the opposite way. So the chair *west* of
        // the table takes `facing: "west"` (back to the west, seat opening
        // east, towards the table) and the chair east of it takes "east".
        // This pair was exactly inverted, and both chairs sat with their backs
        // to the table.
        place(tx - 1, tz, style["stair.interior"] as string, { facing: "west", half: "bottom" });
        place(tx + 1, tz, style["stair.interior"] as string, { facing: "east", half: "bottom" });
      }
      place(x1, z0, "barrel", { facing: "up", open: "false" });
      place(x1, z0 + 1, "barrel", { facing: "up", open: "false" });
      place(x0, z1, "cauldron", { level: "0" });
      break;
    }
    case "smithy": {
      // The forge works the *east* wall. It used to work the west one, which
      // is the wall the stair climbs: the anvil landed in the single cell
      // between the room and the foot of the flight and sealed the stairs off
      // from the shop floor.
      place(x1, z0, "blast_furnace", { facing: "west", lit: "false" });
      place(x1, z0 + 1 <= z1 ? z0 + 1 : z0, "anvil", { facing: "west" });
      place(x1, z1, "smithing_table");
      place(x0, z1, "chest", { facing: "east", type: "single" });
      place(x0 + 1 <= x1 ? x0 + 1 : x0, z1, "cauldron", { level: "0" });
      break;
    }
    case "granary": {
      // Stacks against the walls, never a field of them. The first version
      // filled every other cell of the whole floor, and a checkerboard of
      // full blocks is not a granary — it is a maze with no legal move, because
      // the free cells only touch each other at their corners. A walkthrough
      // called it exactly that. Hay now goes where hay goes: piled one to three
      // high along the walls, leaving the floor of the room open.
      const cap = Math.max(1, Math.floor(w * d * GRANARY_HAY_SHARE));
      let stacks = 0;
      // Bales are *stores*, so they go down as neat rectangular piles rather
      // than as single bales dropped one every third cell — the old
      // `(x + z * 2) % 3` pattern, which reads in game as random scatter. Each
      // pile is a 1x2 run of cells along one wall, laid level and with one
      // shared axis, and a pile is only drawn when BOTH of its cells are
      // legal — a half-laid pile is the lone stranded bale all over again.
      // Everything here is derived from position; no RNG.
      const walls = [
        { fixed: z0, along: "x" as const },
        { fixed: z1, along: "x" as const },
        { fixed: x0, along: "z" as const },
        { fixed: x1, along: "z" as const },
      ];
      /** Corners and their neighbours stay bare: a bale each side of a corner
       * boxes the corner in, and a floor cell you can see and not reach is the
       * checkerboard defect one cell wide. */
      const nearCorner = (x: number, z: number): boolean =>
        ((x === x0 || x === x1) && (z <= z0 + 1 || z >= z1 - 1)) ||
        ((z === z0 || z === z1) && (x <= x0 + 1 || x >= x1 - 1));
      for (const wall of walls) {
        if (stacks >= cap) break;
        const onXWall = wall.along === "x";
        const lo = onXWall ? x0 : z0;
        const hi = onXWall ? x1 : z1;
        // Runs of two with a two-cell gap between them, anchored to the room
        // so both ends of a wall read the same way.
        for (let t = lo; t + 1 <= hi && stacks + 2 <= cap; t += 4) {
          const cells: [number, number][] = [
            onXWall ? [t, wall.fixed] : [wall.fixed, t],
            onXWall ? [t + 1, wall.fixed] : [wall.fixed, t + 1],
          ];
          if (cells.some(([cx, cz]) => nearCorner(cx, cz) || !free(cx, cz))) continue;
          if (!take(cells, "hay_block")) continue;
          // Two-high wherever the ceiling allows, single elsewhere, and never
          // up to the joists: a pile that reaches them is a column through the
          // room, which is the defect one door along.
          const height = Math.max(
            1,
            Math.min(1 + (((t - lo) / 4 + wall.fixed) % 2 === 0 ? 1 : 0), r.storyHeight - 2),
          );
          for (const [cx, cz] of cells) {
            for (let h = 0; h < height; h++) {
              // The upper course lies along the wall, the whole pile matching.
              put(cx, 1 + h, cz, "hay_block", { axis: h === 0 ? "y" : onXWall ? "x" : "z" });
              n++;
            }
            stacks++;
          }
        }
      }
      place(x1, z1, "composter", { level: "0" });
      place(x0, z1, "barrel", { facing: "up", open: "false" });
      break;
    }
    case "hall": {
      // A long table down the middle, a carpet runner beside it, banners high on
      // the end wall.
      const mid = Math.floor((x0 + x1) / 2);
      for (let z = z0 + 1; z <= z1 - 1; z++) {
        // The plate is the table top and the fence is its trestle: the plate
        // goes on ONLY where the trestle landed. `place` may refuse a cell
        // (reserved, or it would cut the room in two), and a plate written
        // over that refusal is a table top floating on air.
        if (place(mid, z, style["wall.fence"] as string)) {
          put(mid, 2, z, "oak_pressure_plate", { powered: "false" });
          n++;
        }
        place(mid - 1, z, "white_carpet");
        place(mid + 1, z, "white_carpet");
      }
      for (const bx of [mid - 1, mid + 1]) {
        if (bx < x0 || bx > x1) continue;
        put(bx, Math.min(4, r.storyHeight - 1), z0, "blue_banner", { rotation: "8" });
        n++;
      }
      place(x0, z1, "barrel", { facing: "up", open: "false" });
      place(x1, z1, "bookshelf");
      break;
    }
    default:
      break;
  }

  // The extended archetypes, and then every storey above the ground one.
  // Both go through the same context, so the door/stair/hearth reserve the
  // ground floor built above is the one they honour too.
  const ctx: FitOutContext = {
    put,
    style,
    archetype: r.archetype,
    interior,
    door,
    storyHeight: r.storyHeight,
    floors: r.floors,
    free,
    place,
    placeBed,
    take,
    size: r.size,
    wallTop: r.wallTop,
    roofTop: r.roofTop,
    floorCells: r.floorCells,
    blockAt: r.blockAt,
    ...(r.entranceTreatment === undefined ? {} : { entranceTreatment: r.entranceTreatment }),
    ...(r.decay === undefined ? {} : { decay: r.decay }),
    ...(r.decayReport === undefined ? {} : { decayReport: r.decayReport }),
    ...(r.skipped === undefined ? {} : { skipped: r.skipped }),
  };
  const desc = buildingRegistry.get(r.archetype) as unknown as BuildingDescriptor | undefined;
  if (desc !== undefined && (desc.dispatch === "standard" || desc.dispatch === "underground")) {
    n += (desc.furnish as unknown as (ctx: FitOutContext) => number)(ctx);
  }
  n += furnishWing(ctx);
  n += furnishUpperFloors(ctx);
  // The family-D entrance fitting, last of the fit-outs and before the decay:
  // it writes over the shell's own leaf, frame and awning, so it has to be the
  // last hand on the door — and a ruined building's blast door is the ordinary
  // one decayed, which is the ruin law and why it is not after the decay pass.
  n += fitEntranceTreatment(ctx);
  // --- the decay (RUINS-PLAN-v0 WP-2) --------------------------------------
  // **Last, and after every `furnish*` pass**, because THE RUIN LAW says a
  // ruined building is the ordinary shell fit-out DECAYED: the same shell is
  // built, the same archetype furnishes it, and then it is written over. A
  // decay that ran earlier would be decorating a ruin, which is the second
  // grammar the law forbids.
  //
  // The five relics are exempt because they run the engine themselves, from
  // their own profiles — `params.decay` on a `ruined_cottage` would be a decay
  // over a decay, and the relic's own list is a WP-1 golden.
  if (r.decay !== undefined && r.decay > 0 && !isRelicArchetype(r.archetype)) {
    const c = new PropCounter(ctx);
    const outcome = decayShellChecked(ctx, c, decayProfileFor(ctx, r.decay));
    // Nothing the decay unsupported may survive it. One entry point, one
    // invariant — see the note on `settleDecayedFixtures`.
    const settled = settleDecayedFixtures(ctx);
    if (r.decayReport !== undefined) {
      r.decayReport.written = outcome.written;
      r.decayReport.quenched = outcome.quenched;
      r.decayReport.withdrawn = outcome.withdrawn;
      r.decayReport.refused = outcome.refused;
      r.decayReport.settled = settled;
      r.decayReport.mode = outcome.mode;
    }
    n += c.n;
  }
  return n;
}

/* -------------------------------------------------------------------------- */
/* cellar fit-out                                                              */
/* -------------------------------------------------------------------------- */

/**
 * What a cellar is for.
 *
 * Barrels on the floor and cobwebs under the beams, both position-keyed and
 * both kept off the ladder's column and the two cells that reach it — the
 * approach a player needs is the one thing the decoration may not take.
 */
export function furnishCellar(
  put: Put,
  style: Readonly<Record<string, string>>,
  choice: Seed256,
  interior: LocalRect,
  access: { readonly x: number; readonly z: number },
  center: { readonly x: number; readonly z: number },
  floorY: number,
  /**
   * Interior columns that are not really room — a pilaster the cellar's own
   * geometry stands inside it. They are neither furnished nor counted as floor
   * by the walkability guard, because they are solid stone.
   */
  blocked?: ReadonlySet<string>,
): void {
  const { x: cx, z: cz } = center;
  const reserved = new Set([
    `${access.x},${access.z}`,
    `${access.x - 1},${access.z}`,
    `${access.x},${access.z - 1}`,
    `${cx},${cz}`,
  ]);
  // The cellar's copy of the walkability invariant, and it needed one: two
  // crates drawn independently against a wall boxed the corner between them
  // in, and the physics lint duly reported a standable cellar cell with no
  // route to it. The draw is unchanged — the guard only ever *refuses*.
  const cells: string[] = [];
  for (let z = interior.z0; z <= interior.z1; z++) {
    for (let x = interior.x0; x <= interior.x1; x++) {
      if (blocked?.has(`${x},${z}`) === true) continue;
      cells.push(`${x},${z}`);
    }
  }
  const plan = new FloorPlan(cells, reserved);
  for (let z = interior.z0; z <= interior.z1; z++) {
    for (let x = interior.x0; x <= interior.x1; x++) {
      if (reserved.has(`${x},${z}`) || blocked?.has(`${x},${z}`) === true) continue;
      const wall =
        x === interior.x0 || x === interior.x1 || z === interior.z0 || z === interior.z1;
      if (wall && positionFloat(choice, x, floorY, z) < 0.22) {
        if (!plan.occupy([[x, z]])) continue;
        put(x, floorY, z, style["cellar.crate"] as string);
      } else if (positionFloat(choice, z, floorY, x) < 0.1) {
        // Under the beams, never at head height on the floor: a cobweb a player
        // has to wade through to cross their own cellar is a bug, not a mood.
        put(x, -1, z, style["cellar.cobweb"] as string);
      }
    }
  }
}
