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

import { cardinalStep, type Cardinal, type LocalRect, type LocalVoxelOp, type Put } from "./core.js";
import {
  FloorPlan,
  EXTENDED_BUILDING_ARCHETYPES,
  extendedArchetypeOfTags,
  furnishExtended,
  furnishUpperFloors,
  furnishWing,
  isPassable,
  wholeFloorPlan,
  type FitOutContext,
} from "./archetypes-civic.js";

export * from "./archetypes-civic.js";

import {
  BLITZ_BUILDING_ARCHETYPES,
  blitzArchetypeOfTags,
  furnishBlitz,
} from "./archetypes-blitz.js";

export * from "./archetypes-blitz.js";

import {
  TOWN_BUILDING_ARCHETYPES,
  furnishTown,
  townArchetypeOfTags,
} from "./archetypes-town.js";

// The trade wave is *not* re-exported here: `structures/index.ts` exports it
// directly, and exporting it twice through the same barrel is an ambiguity
// TypeScript resolves by dropping the names.
import {
  TRADE_BUILDING_ARCHETYPES,
  furnishTrade,
  tradeArchetypeOfTags,
} from "./archetypes-trade.js";

import {
  VERNACULAR_BUILDING_ARCHETYPES,
  furnishVernacular,
  vernacularArchetypeOfTags,
} from "./archetypes-vernacular.js";

export * from "./archetypes-vernacular.js";

import {
  WAVE2_BUILDING_ARCHETYPES,
  furnishWave2,
  wave2ArchetypeOfTags,
} from "./archetypes-wave2.js";

export * from "./archetypes-wave2.js";

import { HIGHRISE_ARCHETYPES, highriseArchetypeOfTags } from "./highrise.js";
import {
  UNDERGROUND_ARCHETYPES,
  furnishMineHead,
  undergroundArchetypeOfTags,
} from "./underground.js";

export * from "./underground.js";

/* -------------------------------------------------------------------------- */
/* archetypes                                                                  */
/* -------------------------------------------------------------------------- */

/** Most of a granary floor that hay bales may stand on. */
const GRANARY_HAY_SHARE = 0.25;

/** What a building is *for* — the thing that drives its furniture and massing. */
export const BUILDING_ARCHETYPES = [
  "cottage",
  "hall",
  "inn",
  "smithy",
  "granary",
  "watchtower",
  ...EXTENDED_BUILDING_ARCHETYPES,
  ...BLITZ_BUILDING_ARCHETYPES,
  ...TOWN_BUILDING_ARCHETYPES,
  ...TRADE_BUILDING_ARCHETYPES,
  ...VERNACULAR_BUILDING_ARCHETYPES,
  ...WAVE2_BUILDING_ARCHETYPES,
  ...HIGHRISE_ARCHETYPES,
  ...UNDERGROUND_ARCHETYPES,
] as const;

/** A building archetype. */
export type BuildingArchetype = (typeof BUILDING_ARCHETYPES)[number];

/** Map a node's tags onto an archetype; `cottage` when nothing matches. */
export function archetypeOfTags(tags: readonly string[]): BuildingArchetype {
  const has = (t: string): boolean => tags.includes(t);
  // The tall table goes first, ahead of even the watchtower: `tower` is the
  // greediest tag in the whole vocabulary, and `tower_block` means a block of
  // flats rather than a stone lookout.
  const tall = highriseArchetypeOfTags(tags);
  if (tall !== null) return tall;
  // The mine head, ahead of the lookout table: "tower" is greedy and a
  // headframe over a shaft is a tower to that rule, which is not what a
  // document tagged `mineshaft` is asking for.
  const dug = undergroundArchetypeOfTags(tags);
  if (dug !== null) return dug;
  if (has("lookout") || has("tower") || has("watchtower")) return "watchtower";
  // The breadth table, ahead of the extended one for the same reason the
  // extended one goes ahead of the original: `temple` means church over there,
  // and a pagoda would never reach its own building if this ran second.
  const blitz = blitzArchetypeOfTags(tags);
  if (blitz !== null) return blitz;
  // The town wave, between the breadth table and the extended one: the tables
  // below it are greedy, and a document tagged `academy` would otherwise never
  // reach a school. It claims only compounds — bare `hall` still belongs to the
  // original table, where it means a great hall.
  const town = townArchetypeOfTags(tags);
  if (town !== null) return town;
  // The trade table, for the reason every later table goes earlier: the older
  // ones are greedy. `trade` and `inn` mean inn down there and `store` means
  // granary, so this table claims none of those three — only `tavern`, `shop`
  // and their kin.
  const trade = tradeArchetypeOfTags(tags);
  if (trade !== null) return trade;
  // The vernacular wave, for the same reason: its archetypes are all houses,
  // and every table below it is greedier about dwellings than it is.
  const regional = vernacularArchetypeOfTags(tags);
  if (regional !== null) return regional;
  // Wave two, last of the new tables. It claims no tag any earlier table
  // claims — `mill` still reaches the windmill and `gate` the gatehouse — so
  // its position is about the greedy tables *below* it, not the ones above.
  const wave2 = wave2ArchetypeOfTags(tags);
  if (wave2 !== null) return wave2;
  // The extended table is consulted before the original one, not after: the
  // original is greedy (`trade` → inn, `store` → granary) and would otherwise
  // swallow `market` and `storehouse` before either reached its own building.
  const extended = extendedArchetypeOfTags(tags);
  if (extended !== null) return extended;
  if (has("hall")) return "hall";
  if (has("trade") || has("inn")) return "inn";
  if (has("craft") || has("smithy")) return "smithy";
  if (has("store") || has("granary")) return "granary";
  return "cottage";
}

export function resolveArchetype(value: string | undefined): BuildingArchetype {
  if (value !== undefined && (BUILDING_ARCHETYPES as readonly string[]).includes(value)) {
    return value as BuildingArchetype;
  }
  return "cottage";
}

/* -------------------------------------------------------------------------- */
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
        place(mid, z, style["wall.fence"] as string);
        if (free(mid, z)) {
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
  };
  n += furnishExtended(ctx);
  n += furnishBlitz(ctx);
  n += furnishTown(ctx);
  n += furnishTrade(ctx);
  n += furnishVernacular(ctx);
  n += furnishWave2(ctx);
  n += furnishMineHead(ctx);
  n += furnishWing(ctx);
  n += furnishUpperFloors(ctx);
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
