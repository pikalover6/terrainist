/**
 * The **wilds & camps pack's buildings** — the three entries of
 * that have an inside rather than a
 * footprint in the cut-over.
 *
 * The pack's thesis is battery P6's: extraction in the wilderness is a whole
 * settlement idiom and the catalog answers it with a tent. These three are the
 * idiom's roofed half:
 *
 * - `fire_lookout_tower` — the glazed cab over the canopy: a map table, the
 *   fire-finder on its plinth, a bunk against the back wall and the glass all
 *   the way round, which the shell's own facade delivers;
 * - `waystation` — the shelter on a long road: a hearth, a bench, and a
 *   woodpile somebody else keeps full;
 * - `hunting_lodge` — the trophy hall: a great hearth down one end, antlers up
 *   on the beam, a rack of long guns and the boots left by the door.
 *
 * ## The design law, and this file's place under it
 *
 * `archetypes-blitz.ts` states it and this file obeys it without restating it:
 * an archetype is a **fit-out**, not a second grammar. Everything here runs
 * after the shape stages and writes into the same cell map. Not a line of
 * `core.ts` moves for any of them, and — like `archetypes-brine.ts`, which is
 * this file's nearest model — it does **no exterior work at all**: it never
 * writes above the eave plate, never touches the wall ring, and never puts a
 * block in the apron. A lookout's legs are the shell's storeys, not a mast
 * this file builds: a leg drawn out here would be a column in the apron with
 * nothing under it, which is `floating.isolated` in its oldest clothes.
 *
 * ## The rules, inherited from every earlier wave and paid for there
 *
 * 1. **Everything goes through {@link PropCounter}**, which routes through the
 *    ground floor's own `free` and `take` — the door approach, the stair
 *    columns, the connectivity guard and the blocked-column guard, none of
 *    them restated here. There is not one `raw` call in this file, so the door
 *    column and its doorstep are untouchable by construction.
 * 2. **Everything stands against a wall.** Each fit-out here works the
 *    perimeter of its room and leaves the middle of the floor alone, which is
 *    both true of all three buildings and the cheapest way to keep a ground
 *    floor one walkable region on every envelope the solver can hand it.
 * 3. **Nothing is a pillar.** A stack that would fill an interior column from
 *    the floor to the ceiling is refused by `PropCounter`'s own headroom
 *    guard; the woodpile and the trophy beam are therefore written with
 *    {@link headroomOf} in hand rather than at a fixed height.
 * 4. **No lantern by name.** The lint's lantern rule fires on any block name
 *    ending `lantern`, so every glow in this file is `glowstone` with a solid
 *    neighbour — the hearth back, the fire-finder's plinth. The shell hangs
 *    the room's one real light and this file does not touch it.
 * 5. **No sign blocks**, no bare `flower_pot`, and `cauldron` takes no
 *    properties. `chain` is not in the pinned 1.21.11 table; where a hoist or
 *    a hanging line is wanted the block is `iron_bars`.
 * 6. **No transcendental maths and no unseeded draw.** Every pattern here is a
 *    pure function of position.
 */

import { PropCounter, type FitOutContext } from "./archetypes-civic.js";
import { buildingIdFromTags, defineBuildingDescriptors } from "./descriptor.js";
import type { BuildingDescriptor } from "./descriptor.js";

/* -------------------------------------------------------------------------- */
/* the archetypes                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The three archetypes this file fits out, in catalog order.
 *
 * Spread into `BUILDING_ARCHETYPES` by `archetypes.ts`, straight after the
 * nautical & pirate pack, and mirrored in the same order by the spec package's
 * `KNOWN_BUILDING_ARCHETYPES` — where the order is asserted element by
 * element, so it is load-bearing in both places.
 */
export const WILDS_BUILDING_ARCHETYPES = [
  "fire_lookout_tower",
  "waystation",
  "hunting_lodge",
] as const;

/** One of the archetypes this file fits out. */
export type WildsBuildingArchetype = (typeof WILDS_BUILDING_ARCHETYPES)[number];

/** True for an archetype this file answers to. */
export function isWildsArchetype(value: string): value is WildsBuildingArchetype {
  return (WILDS_BUILDING_ARCHETYPES as readonly string[]).includes(value);
}

/**
 * Tag → archetype, or `null` when nothing matches.
 *
 * Consulted immediately after the nautical table and well before the extended
 * one. This pack claims **only compounds derived from its own ids and their
 * catalog notes**, and the deliberate non-claims are the point of this
 * comment — every one of them belongs to an earlier table or to a plainer
 * building that has the better claim:
 *
 * - bare **`tower`**, **`watchtower`** and **`beacon_tower`** are *not* taken.
 *   The watchtower is one of the four founding archetypes and a document that
 *   says `tower` on a wall wants it; the lookout answers to `fire_lookout`,
 *   `fire_lookout_tower`, `lookout_tower` and `ranger_tower` only;
 * - bare **`lookout`** is left unclaimed as well: a lookout on a headland is
 *   the watchtower's word, and this building is the one *with a cab on it*;
 * - bare **`lodge`** stays where it is — `ski_lodge` and `hunting_lodge` are
 *   both compounds for a reason, and a bare lodge in a document is as likely
 *   to be either. The trophy hall takes `hunting_lodge`, `hunters_lodge` and
 *   `trophy_hall`;
 * - **`shelter`**, **`inn`**, **`hut`** and **`cabin`** are all somebody
 *   else's; the waystation takes `waystation`, `way_station` and
 *   `road_shelter` and nothing plainer;
 * - **`logging`**, **`lumber_camp`**, **`sawmill`** and **`camp`** are not
 *   claimed by any building here. The first two are the *prop* `logging_camp`,
 *   which is a compound and not a room; `sawmill` is an archetype the catalog
 *   already ships; `camp` is the campsite's.
 */
function wildsArchetypeOfTags(tags: readonly string[]): WildsBuildingArchetype | null {
  return buildingIdFromTags(WILDS_BUILDING_DESCRIPTORS, tags);
}

/**
 * Facade tendencies for this file's archetypes.
 *
 * Same contract as every other wave's: defaults a caller merges into its
 * params, never something applied over an explicit one.
 *
 * - the **fire lookout** is a glass box on legs, so it asks for the densest
 *   windows in the pack and a `hip` roof — a cab that can only see one way is
 *   not a lookout;
 * - the **waystation** has three walls and a hearth: `gable`, and the sparsest
 *   openings, because what a shelter has instead of windows is an open side;
 * - the **hunting lodge** is a hall with a great fire in it: `gable` again,
 *   and tall openings between the trophies.
 */
export function wildsFacadeDefaults(archetype: string): {
  readonly windowShape?: string;
  readonly windowRhythm?: string;
  readonly roof?: string;
} {
  switch (archetype) {
    case "fire_lookout_tower":
      return { windowShape: "mullion", windowRhythm: "dense", roof: "hip" };
    case "waystation":
      return { windowShape: "single", windowRhythm: "sparse", roof: "gable" };
    case "hunting_lodge":
      return { windowShape: "tall", windowRhythm: "regular", roof: "gable" };
    default:
      return {};
  }
}

/* -------------------------------------------------------------------------- */
/* descriptors — Phase 4 registry (ordered, no self-registration)             */
/* -------------------------------------------------------------------------- */

function wildsTagsFor(id: WildsBuildingArchetype): readonly string[] {
  switch (id) {
    case "fire_lookout_tower":
      return ["fire_lookout_tower", "fire_lookout", "lookout_tower", "ranger_tower"];
    case "waystation":
      return ["waystation", "way_station", "road_shelter"];
    case "hunting_lodge":
      return ["hunting_lodge", "hunters_lodge", "trophy_hall"];
    default:
      return [id];
  }
}

function wildsFacadeFor(id: WildsBuildingArchetype): BuildingDescriptor["facadeDefaults"] {
  const raw = wildsFacadeDefaults(id);
  const hasAny = raw.windowShape !== undefined || raw.windowRhythm !== undefined || raw.roof !== undefined;
  return hasAny ? raw : undefined;
}

/**
 * Ordered building descriptors for this pack — one row per id in
 * {@link WILDS_BUILDING_ARCHETYPES} order. Tags preserve the compound-only
 * claims of {@link wildsArchetypeOfTags} and deliberately **do not** claim
 * bare `tower`/`watchtower`/`beacon_tower`, bare `lookout`, bare `lodge`,
 * `shelter`/`inn`/`hut`/`cabin`, or `logging`/`lumber_camp`/`sawmill`/`camp` —
 * every string here is a compound derived from the pack's own ids and catalog
 * notes. Facade defaults and furnish delegate to the leaf's existing functions
 * (no LocalVoxelOp order or seeded-draw change); `dispatch` is `standard`.
 */
export const WILDS_BUILDING_DESCRIPTORS =
  defineBuildingDescriptors<WildsBuildingArchetype, FitOutContext>(WILDS_BUILDING_ARCHETYPES, {
    tags: wildsTagsFor,
    facadeDefaults: wildsFacadeFor,
    furnish: furnishWilds,
    dispatch: "standard",
  });

/* -------------------------------------------------------------------------- */
/* the entry point                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Fit out one of this file's archetypes.
 *
 * Returns the number of blocks written, which `furnish` adds to its own count.
 * Zero, and not one cell touched, for anything that is not ours.
 */
function furnishWilds(ctx: FitOutContext): number {
  if (!isWildsArchetype(ctx.archetype)) return 0;
  const c = new PropCounter(ctx);
  switch (ctx.archetype) {
    case "fire_lookout_tower":
      fitFireLookout(ctx, c);
      break;
    case "waystation":
      fitWaystation(ctx, c);
      break;
    case "hunting_lodge":
    default:
      fitHuntingLodge(ctx, c);
      break;
  }
  return c.n;
}

/**
 * How many courses of clear air this storey actually has.
 *
 * On one floor the room runs to the eave plate; on more than one it stops at
 * the boards over it, and a fit-out that measured the first and built into the
 * second would put its trophies through somebody's floor.
 */
function headroomOf(ctx: FitOutContext): number {
  return ctx.floors > 1 ? ctx.storyHeight - 1 : ctx.wallTop - 1;
}

/** The default properties of a fence post standing on its own. */
const POST = {
  east: "false",
  north: "false",
  south: "false",
  waterlogged: "false",
  west: "false",
} as const;

/** A closed barrel, the one cargo block every wave here uses. */
const BARREL = { facing: "up", open: "false" } as const;

/**
 * The wall a cell is nearest, as a stair `facing` that puts the **backrest**
 * against it.
 *
 * The stair-seat rule, obeyed everywhere in this file: a stair's `facing` is
 * the direction of its high half, so a seat against the north wall faces
 * north and the sitter looks south, into the room.
 */
function seatFacing(
  it: FitOutContext["interior"],
  x: number,
  z: number,
): "north" | "south" | "east" | "west" {
  if (z === it.z0) return "north";
  if (z === it.z1) return "south";
  if (x === it.x0) return "west";
  return "east";
}

/**
 * Where along a wall row a fit-out can actually stand something `reach` cells
 * either side of a centre.
 *
 * The middle of a wall is where the shell reserves the **hearth** and where a
 * door most often lands, so the obvious answer — centre it — is the one answer
 * that is unavailable on most envelopes. This walks outward from the middle
 * and returns the first bay the room will give; `null` means there is none,
 * and the caller falls back to something one cell wide.
 *
 * The same walk as the treadwheel crane's, generalised, and for the same
 * reason: a fit-out that assumed its envelope is the oldest bug in the
 * catalog.
 */
function bayOn(ctx: FitOutContext, z: number, reach: number): number | null {
  const it = ctx.interior;
  const midX = Math.floor((it.x0 + it.x1) / 2);
  for (let d = 0; d <= it.x1 - it.x0; d++) {
    for (const x of d === 0 ? [midX] : [midX - d, midX + d]) {
      if (x - reach < it.x0 || x + reach > it.x1) continue;
      let clear = true;
      for (let dx = -reach; dx <= reach && clear; dx++) clear = ctx.free(x + dx, z);
      if (clear) return x;
    }
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* the fire lookout                                                            */
/* -------------------------------------------------------------------------- */

/**
 * `fire_lookout_tower` — the cab you can see the whole valley from, and the
 * one room in the pack whose contents are all instruments.
 *
 * The **map table** runs along the back wall: two cartography tables with the
 * fire-finder between them, which is a plinth of dressed stone with a
 * glowstone core so the table is lit without a block whose name ends
 * `lantern`. The **bunk** goes into a corner, the **stove** and the water butt
 * into the other, and the middle of the cab is left completely empty, which is
 * what a room whose whole purpose is standing at the glass and turning round
 * actually looks like.
 */
function fitFireLookout(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const stone = style["foundation.accent"] as string;
  const bench = style["stair.interior"] as string;
  const midX = Math.floor((it.x0 + it.x1) / 2);
  const head = headroomOf(ctx);

  // The map table goes along the wall row **away from the door**, and it goes
  // wherever that row will take it: the middle of a wall is where the shell
  // reserves the hearth and where a door most often lands, so a fit-out that
  // insisted on the centre is a fit-out that builds nothing on half its
  // envelopes. This walks outward from the middle and takes the first bay of
  // three cells the room will actually give it.
  const back = ctx.door !== null && ctx.door.z <= (it.z0 + it.z1) / 2 ? it.z1 : it.z0;
  const bayX = bayOn(ctx, back, 1);

  // The fire-finder's glow is glowstone under a stone cap: a solid neighbour
  // above and one either side, which is the safe glow this pack uses
  // everywhere.
  if (bayX !== null) {
    for (const x of [bayX - 1, bayX + 1]) c.put1(x, back, "cartography_table");
    if (c.put1(bayX, back, "glowstone") && head >= 3) c.stack(bayX, back, 2, stone);
  } else {
    const lone = bayOn(ctx, back, 0);
    if (lone !== null && c.put1(lone, back, "glowstone") && head >= 3) {
      c.stack(lone, back, 2, stone);
    }
  }

  // The bunk in one corner and the stove in the other — both against a wall,
  // both one cell, so the floor round them stays a ring a body can walk.
  c.put1(it.x0, it.z1, "smoker", { facing: "east", lit: "false" });
  c.put1(it.x1, it.z1, "barrel", BARREL);
  c.put1(it.x1, it.z0, "cauldron");

  // The watch seat, facing the glass on the long wall.
  const seatZ = Math.floor((it.z0 + it.z1) / 2);
  if (seatZ !== it.z0 && seatZ !== it.z1) {
    c.put1(it.x0, seatZ, bench, {
      facing: seatFacing(it, it.x0, seatZ),
      half: "bottom",
      shape: "straight",
    });
  }

  // The instrument shelf over the map table, where the storey has the room.
  if (head >= 3 && bayX !== null) {
    for (const x of [bayX - 1, bayX + 1]) {
      c.stack(x, back, 2, style["stone.slab"] as string, {
        type: "bottom",
        waterlogged: "false",
      });
    }
  }
}

/* -------------------------------------------------------------------------- */
/* the waystation                                                              */
/* -------------------------------------------------------------------------- */

/**
 * `waystation` — a hearth, a bench, and firewood somebody else split.
 *
 * The catalog note's "no door" is the *shell's* business and the shell always
 * hangs one; what this file can honour is the rest of it, and it does:
 * everything is against a wall, the hearth is at the end furthest from the
 * way in so a body walks past the bench to reach it, and the woodpile is two
 * courses of split log rather than three, because a woodpile that reaches the
 * boards is `interior.blocked_column` wearing a hat.
 */
function fitWaystation(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const stone = style["foundation.accent"] as string;
  const log = style["wall.accent"] as string;
  const bench = style["stair.interior"] as string;
  const midX = Math.floor((it.x0 + it.x1) / 2);
  const head = headroomOf(ctx);

  // The hearth goes at the end away from the door, so the room is walked
  // through rather than stood in.
  const hearthNorth = ctx.door === null ? true : ctx.door.z > (it.z0 + it.z1) / 2;
  const hearthZ = hearthNorth ? it.z0 : it.z1;

  // The fire: a stone back with the glow set into it, and the hearth stone
  // either side. Glowstone, never a name ending `lantern`. The bay is found
  // rather than assumed, for {@link bayOn}'s reason.
  const fireX = bayOn(ctx, hearthZ, 1) ?? bayOn(ctx, hearthZ, 0);
  if (fireX !== null) {
    if (c.put1(fireX, hearthZ, "glowstone") && head >= 3) c.stack(fireX, hearthZ, 2, stone);
    for (const x of [fireX - 1, fireX + 1]) {
      if (x < it.x0 || x > it.x1) continue;
      c.put1(x, hearthZ, stone);
    }
  }

  // The bench, down the long wall, facing the fire's side of the room.
  const benchZ = hearthNorth ? it.z1 : it.z0;
  for (let x = it.x0; x <= it.x1; x++) {
    if (x === midX) continue; // a gap, so the bench reads as two and not a wall
    c.put1(x, benchZ, bench, {
      facing: seatFacing(it, x, benchZ),
      half: "bottom",
      shape: "straight",
    });
  }

  // The woodpile, stacked against a side wall — two courses, never three.
  for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
    if (!c.put1(it.x0, z, log, { axis: "x" })) continue;
    if (head >= 3 && (z - it.z0) % 2 === 1) c.stack(it.x0, z, 2, log, { axis: "x" });
  }

  // The water butt at the other side, and the traveller's cauldron by the fire.
  c.put1(it.x1, hearthZ === it.z0 ? it.z1 : it.z0, "cauldron");
}

/* -------------------------------------------------------------------------- */
/* the hunting lodge                                                           */
/* -------------------------------------------------------------------------- */

/**
 * `hunting_lodge` — the trophy hall.
 *
 * The **great hearth** takes the whole end wall away from the door: dressed
 * stone with the fire glowing in the middle of it and the chimney breast
 * carried one course over, so the glow has a solid block on top of it as well
 * as one on either side. Down the long walls: the **antlers**, bone blocks up
 * at head height with the wall behind them and never over a seat; the **gun
 * rack**, a run of fence with the barrels standing in it; and the boots and
 * the dogs' bowl by the door, which is the only thing in the room a stranger
 * needs to name it.
 *
 * The middle of the floor carries the long table — two cells of it, on the
 * axis, and no more: a hall whose table crosses the room is a hall with two
 * halves.
 */
function fitHuntingLodge(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const stone = style["foundation.accent"] as string;
  const fence = style["wall.fence"] as string;
  const seat = style["stair.interior"] as string;
  const slab = style["stone.slab"] as string;
  const midX = Math.floor((it.x0 + it.x1) / 2);
  const midZ = Math.floor((it.z0 + it.z1) / 2);
  const head = headroomOf(ctx);

  const hearthNorth = ctx.door === null ? true : ctx.door.z > (it.z0 + it.z1) / 2;
  const hearthZ = hearthNorth ? it.z0 : it.z1;

  // The great hearth, across the end wall — centred on the bay the room will
  // actually give it.
  const fireX = bayOn(ctx, hearthZ, 1) ?? bayOn(ctx, hearthZ, 0) ?? midX;
  for (let x = it.x0; x <= it.x1; x++) {
    if (x === fireX) {
      if (c.put1(x, hearthZ, "glowstone") && head >= 3) c.stack(x, hearthZ, 2, stone);
      continue;
    }
    if (Math.abs(x - fireX) > 2) continue; // a hearth, not a wall of stone
    c.put1(x, hearthZ, stone);
  }

  // The antlers, up on the beam down both long walls. Each one has the wall
  // ring directly behind it, so nothing here has six air faces.
  if (head >= 3) {
    for (const x of [it.x0, it.x1]) {
      for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
        if ((z - it.z0) % 3 !== 1) continue;
        c.stack(x, z, head, "bone_block", { axis: "x" });
      }
    }
  }

  // The gun rack, along one long wall under the trophies, and the seats under
  // the other.
  for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
    if ((z - it.z0) % 2 === 1) {
      c.put1(it.x0, z, fence, POST);
      continue;
    }
    c.put1(it.x1, z, seat, {
      facing: seatFacing(it, it.x1, z),
      half: "bottom",
      shape: "straight",
    });
  }

  // The long table, on the axis and two cells of it — a slab, so a body can
  // still stand where it is.
  for (const z of [midZ, midZ + 1]) {
    if (z <= it.z0 || z >= it.z1) continue;
    c.put1(midX, z, slab, { type: "bottom", waterlogged: "false" });
  }

  // The boots and the dogs' bowl, by the way in.
  const doorEnd = hearthNorth ? it.z1 : it.z0;
  c.put1(it.x0, doorEnd, "cauldron");
  c.put1(it.x1, doorEnd, "barrel", BARREL);
}
