/**
 * The **agrarian pack** — the rural fabric a farm town is made of, plus the
 * open-air marketplace its produce ends up in.
 *
 * `archetypes-blitz.ts` states the design law in full and this file obeys it
 * without restating it: an archetype is a **fit-out**, not a second grammar.
 * Everything here runs after the shape stages and writes into the same cell
 * map, so a pigsty is the shell re-clad in mud with a pen in its apron, an
 * orchard is the fruit store with the planting around it, and a marketplace is
 * the shell with its upper wall band opened into an arcade. Not one line of
 * `core.ts` moves for any of them.
 *
 * Nine buildings in three groups:
 *
 * - **the yard** — `farmstead`, `pigsty`, `sheepfold`, `cattle_pen`;
 * - **the planting** — `orchard`, `vineyard`, `terraced_field`;
 * - **the work floor and the square** — `threshing_floor`, `marketplace`.
 *
 * ## Why the apron is where this pack spends its budget
 *
 * Every one of these is a building whose *meaning* is the ground around it. A
 * sty is a hut plus a pen; an orchard is a fruit store plus trees; a terraced
 * field is a field house plus the planted terrace. The catalog calls all nine
 * **buildings**, so none of them may invent a footprint or a second grammar —
 * what they may do is use the one-block apron ring the eave already occupies,
 * which is exactly the width a pen wall, a trellis row or a headland needs.
 * The rest of the budget goes on the wall band and the room, as usual.
 *
 * ## Where the farm precinct fits
 *
 * `compiler/src/structures/farm.ts` owns the **precinct**: parcels, crops,
 * baulks, gates and headlands laid out across a holding. Nothing here replaces
 * any of it. These are standalone catalog structures a `mix` can name by id,
 * and they deliberately speak the precinct's vocabulary so the two rhyme when
 * they stand in the same town: `farmland` at `moisture=0`, `wheat` at
 * `age=7`, `sweet_berry_bush` at `age=3`, hay, coarse dirt, and an oak fence
 * with an oak gate in it.
 *
 * ## The rules everything here obeys
 *
 * 1. **Nothing leaves the envelope.** Exterior work is bounded above by
 *    `roofTop + `{@link ROOF_FLOURISH_RISE} and in plan by the footprint plus
 *    the one-block apron the eave already uses. A pen is one block of apron
 *    wide, and a tree in it is a single trunk with a crown on top of it —
 *    never a crown that spreads sideways out of the envelope.
 * 2. **The interior stays walkable.** Every interior prop goes through
 *    {@link PropCounter}, which routes through the ground floor's own `free`
 *    and `take` — the door approach, the stair columns, the hearth reserve and
 *    the connectivity guard, none of them restated here.
 * 3. **A pen has a way in.** Every apron ring here leaves the **doorstep cell
 *    open** — that gap is the pen's entrance, and it is the same cell the
 *    physics reading of a door needs standable with air at `y+1` and `y+2`.
 *    A closed **gate** stands at the middle of the far side, so the ring reads
 *    as a pen from outside rather than as a low wall.
 *
 * ## The field lessons this pack was written against
 *
 * Each of these cost an earlier wave a walkthrough or a lint failure, so each
 * is a rule here rather than a comment:
 *
 * - **an apron prop stands on the actual ground.** On conformed terrain the
 *   apron fills local `y = 0`; on a platform it sits one lower, and a post
 *   standing on air fails the support-chain rule. Every apron prop here goes
 *   through {@link groundAt}, which fills a support course or stands the prop
 *   one lower;
 * - **a `cauldron` takes no `level`** — the vessel with levels is
 *   `water_cauldron`, and a `cauldron` with a level on it is a state nobody
 *   asked for. Every trough here is a bare `cauldron`;
 * - **a fence is not a wall, and both need a floor.** Fences stack on fences
 *   and the bottom one stands on the filled apron course, never on air;
 * - **leaves need a block under them.** The orchard's crown sits directly on
 *   its own trunk and the vineyard's canopy on its own post; nothing here
 *   hangs sideways off anything;
 * - the shell hangs a **lantern** over the middle column of the room at head
 *   height, so nothing here stands in that column and no route runs through
 *   it;
 * - **no sign blocks** anywhere, and no bare `flower_pot`: this file places
 *   neither;
 * - **an opening is not damage.** The marketplace opens its upper wall band
 *   into a fenced arcade *above* the plate course and *below* the plate
 *   itself, so the room behind it is still one region and the eave still has
 *   something to sit on.
 */

import {
  PropCounter,
  ROOF_FLOURISH_RISE,
  type FitOutContext,
  type RebuildPlan,
  wallPlan,
} from "./archetypes-civic.js";
import { cardinalStep, type Cardinal } from "./core.js";
import { buildingIdFromTags, defineBuildingDescriptors } from "./descriptor.js";
import type { BuildingDescriptor } from "./descriptor.js";

/* -------------------------------------------------------------------------- */
/* the archetypes                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The nine archetypes this file fits out, in catalog order: the eight rural
 * ones, then the commercial marketplace.
 *
 * Spread into `BUILDING_ARCHETYPES` by `archetypes.ts`, immediately after the
 * homestead wave it sits beside.
 */
export const AGRARIAN_BUILDING_ARCHETYPES = [
  "farmstead",
  "pigsty",
  "sheepfold",
  "cattle_pen",
  "orchard",
  "vineyard",
  "terraced_field",
  "threshing_floor",
  "marketplace",
] as const;

/** One of the archetypes this file fits out. */
export type AgrarianBuildingArchetype = (typeof AGRARIAN_BUILDING_ARCHETYPES)[number];

/** True for an archetype this file answers to. */
export function isAgrarianArchetype(value: string): value is AgrarianBuildingArchetype {
  return (AGRARIAN_BUILDING_ARCHETYPES as readonly string[]).includes(value);
}

/**
 * Tag → archetype, or `null` when nothing matches.
 *
 * Consulted immediately after wave four D's homestead table. Every tag below
 * is one no other table claims, and the deliberate **non-claims** are the
 * point of this doc comment:
 *
 * - **bare `farm` is not ours**, and neither is bare `farmstead`. `farm` is a
 *   land-use word the compiler's vegetation pass and the farm precinct both
 *   read, and the extended barn already carries it as a catalog tag;
 *   `farmstead` has been the residential wave's **farmhouse** since wave four
 *   A, and it is also the tag the farm precinct puts on the building it seats
 *   at the head of a holding — which is a farmhouse, exactly as it resolves
 *   today. So this entry's id stays reachable as an id, which is what an id is
 *   for, and its tags are `grange`, `croft` and `homestead`;
 * - **bare `market` is not ours** — it has been the extended **market
 *   stall's** since G4, and claiming it would silently retheme every stall in
 *   the vocabulary. `bazaar` and `souk` are the commerce wave's `spice_market`
 *   for the same reason. The marketplace claims `marketplace`,
 *   `market_square` and `market_place` only;
 * - **bare `sty`, `fold` and `terrace` are not ours.** The first two are too
 *   short to be anything but an accident, and `terrace` belongs to the
 *   terracing the compiler does to ground. The pens and the field claim their
 *   compounds instead;
 * - `vines` stays unclaimed — it is foliage, not a building — so the vineyard
 *   answers to `vineyard`, `winery` and `vinery`.
 */
function agrarianArchetypeOfTags(
  tags: readonly string[],
): AgrarianBuildingArchetype | null {
  return buildingIdFromTags(AGRARIAN_BUILDING_DESCRIPTORS, tags);
}

/**
 * Facade tendencies for this file's archetypes.
 *
 * Same contract as `archetypeFacadeDefaults`: defaults a caller merges into
 * its params, never something applied over an explicit one. A working yard
 * building wants few lights and a roof that sheds; the marketplace wants the
 * openest wall the grammar will give it, because everything above its plate
 * course is about to become an arcade.
 */
export function agrarianFacadeDefaults(
  archetype: string,
): { readonly windowShape?: string; readonly windowRhythm?: string; readonly roof?: string } {
  switch (archetype) {
    // The house of the holding: a proper farmhouse front, under a shed roof.
    case "farmstead":
      return { windowShape: "mullion", windowRhythm: "regular", roof: "gable" };
    // Animals do not want daylight, and a pen wants a low blind box.
    case "pigsty":
      return { windowShape: "single", windowRhythm: "sparse", roof: "gable" };
    case "sheepfold":
      return { windowShape: "single", windowRhythm: "sparse", roof: "gable" };
    case "cattle_pen":
      return { windowShape: "single", windowRhythm: "sparse", roof: "gable" };
    // Stores, not rooms: light enough to work by, no more.
    case "orchard":
      return { windowShape: "single", windowRhythm: "regular", roof: "gable" };
    case "vineyard":
      return { windowShape: "single", windowRhythm: "regular", roof: "hip" };
    case "terraced_field":
      return { windowShape: "single", windowRhythm: "sparse", roof: "hip" };
    // A work floor wants its whole width open to the light.
    case "threshing_floor":
      return { windowShape: "mullion", windowRhythm: "dense", roof: "gable" };
    // As open as walls allow — the arcade takes the rest.
    case "marketplace":
      return { windowShape: "mullion", windowRhythm: "dense", roof: "flat" };
    default:
      return {};
  }
}

/* -------------------------------------------------------------------------- */
/* the exterior plan                                                           */
/* -------------------------------------------------------------------------- */

/** The footprint perimeter of a rect plan, in canonical (z, x) order. */
function ringOf(sx: number, sz: number): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  for (let z = 0; z < sz; z++) {
    for (let x = 0; x < sx; x++) {
      if (x === 0 || x === sx - 1 || z === 0 || z === sz - 1) out.push({ x, z });
    }
  }
  return out;
}

/** The apron ring — the one-block skirt outside the footprint. */
function apronOf(sx: number, sz: number): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  for (let z = -1; z <= sz; z++) {
    for (let x = -1; x <= sx; x++) {
      if (x === -1 || x === sx || z === -1 || z === sz) out.push({ x, z });
    }
  }
  return out;
}

/** The cell a player stands in to open the door, or `null` when there is none. */
function outsideDoor(ctx: FitOutContext): { readonly x: number; readonly z: number } | null {
  if (ctx.door === null) return null;
  const [dx, dz] = cardinalStep(ctx.door.face);
  return { x: ctx.door.x + dx, z: ctx.door.z + dz };
}

/** True when a cell is the doorstep or the door column itself. */
function onWayIn(ctx: FitOutContext, x: number, z: number): boolean {
  if (ctx.door === null) return false;
  if (x === ctx.door.x && z === ctx.door.z) return true;
  const out = outsideDoor(ctx);
  return out !== null && out.x === x && out.z === z;
}

/**
 * The Y an apron prop stands at, filling a support course when it must.
 *
 * Wave four D's apron-post ground rule verbatim. On conformed terrain the
 * apron ground fills local `y = 0`; on a platform it sits one lower, so a prop
 * written at `y = 1` would float. When `fill` is given the missing course is
 * filled with it and the prop stands at 1; otherwise the prop stands at 0, on
 * the ground that is actually there.
 */
function groundAt(
  ctx: FitOutContext,
  c: PropCounter,
  x: number,
  z: number,
  fill?: string,
): number {
  if (ctx.blockAt(x, 0, z) !== undefined) return 1;
  if (fill === undefined) return 0;
  ctx.put(x, 0, z, fill);
  c.n++;
  return 1;
}

/**
 * Blocks a re-clad may never overwrite.
 *
 * Wave four D's list unchanged: the way in, the way up, the fire, the glass
 * and anything the physics lint holds to a support rule.
 */
const PRESERVE = /(_door$|^ladder$|^campfire$|_sign$|torch$|^bell$|glass|_pane$|lantern$|banner$)/;

/**
 * Re-clad the wall ring between two courses.
 *
 * `block` is a pure function of position, so opposite walls agree and the
 * result is deterministic without a draw. Returning `null` from it leaves the
 * cell exactly as the shell built it — which is how the marketplace opens only
 * the cells it means to.
 */
function reclad(
  ctx: FitOutContext,
  plan: RebuildPlan,
  yFrom: number,
  yTo: number,
  block: (x: number, y: number, z: number) => string | null,
  props?: (x: number, y: number, z: number) => Record<string, string> | undefined,
): number {
  let n = 0;
  for (const cell of ringOf(plan.sx, plan.sz)) {
    for (let y = yFrom; y <= yTo; y++) {
      const standing = ctx.blockAt(cell.x, y, cell.z);
      if (standing !== undefined && PRESERVE.test(standing.block)) continue;
      const b = block(cell.x, y, cell.z);
      if (b === null) continue;
      ctx.put(cell.x, y, cell.z, b, props?.(cell.x, y, cell.z));
      n++;
    }
  }
  return n;
}

/** The cardinal facing the other way. */
function opposite(facing: Cardinal): Cardinal {
  switch (facing) {
    case "north":
      return "south";
    case "south":
      return "north";
    case "east":
      return "west";
    default:
      return "east";
  }
}

/** The apron cell's outward cardinal — which way it faces away from the wall. */
function apronFacing(plan: RebuildPlan, x: number, z: number): Cardinal {
  if (z === -1) return "north";
  if (z === plan.sz) return "south";
  if (x === -1) return "west";
  return "east";
}

/** Trapdoor props for a screen, shutter or hatch hung flat against a wall. */
function shutter(facing: Cardinal): Record<string, string> {
  return {
    facing,
    half: "top",
    open: "false",
    powered: "false",
    waterlogged: "false",
  };
}

/** The end of the room furthest from the door. */
function farEnd(ctx: FitOutContext): { readonly z: number } {
  const it = ctx.interior;
  const north = ctx.door === null ? true : ctx.door.z > (it.z0 + it.z1) / 2;
  return { z: north ? it.z0 : it.z1 };
}

/** True when an apron cell is one of the ring's four corners. */
function apronCorner(plan: RebuildPlan, x: number, z: number): boolean {
  return (x === -1 || x === plan.sx) && (z === -1 || z === plan.sz);
}

/** The gate id for a fence, or `null` for a theme whose fence is not a `*_fence`. */
function gateOf(fence: string): string | null {
  return fence.endsWith("_fence") ? `${fence.slice(0, -"_fence".length)}_fence_gate` : null;
}

/**
 * A pen ring in the apron: `height` courses of `post`, with a gate in it.
 *
 * **The pen rules**, all three of them at once. The ring stands on the ground
 * the apron actually has, through {@link groundAt} with a fill, so no post
 * ever stands on air. It **leaves the doorstep open**, because that gap is
 * both the pen's entrance and the cell the door needs standable. And a closed
 * gate stands at the middle of the ring's far side, so the enclosure reads as
 * a pen rather than as a garden wall. It is open-topped by construction:
 * nothing in this file ever writes over an apron cell.
 *
 * Returns the number of ring cells written.
 */
function penRing(
  ctx: FitOutContext,
  c: PropCounter,
  plan: RebuildPlan,
  post: string,
  height: number,
  corner?: string,
): number {
  const out = outsideDoor(ctx);
  const gate = gateOf(ctx.style["wall.fence"] as string);
  // The far side's middle cell — the gate. Chosen off the door's side so the
  // ring has an entrance at one end and a gate at the other.
  const doorNorth = out === null ? false : out.z < 0;
  const doorSouth = out === null ? false : out.z > plan.sz - 1;
  const midX = plan.sx >> 1;
  const midZ = plan.sz >> 1;
  const gateCell = doorNorth
    ? { x: midX, z: plan.sz }
    : doorSouth
      ? { x: midX, z: -1 }
      : { x: out !== null && out.x < 0 ? plan.sx : -1, z: midZ };
  let n = 0;
  for (const cell of apronOf(plan.sx, plan.sz)) {
    if (onWayIn(ctx, cell.x, cell.z)) continue;
    const y = groundAt(ctx, c, cell.x, cell.z, "coarse_dirt");
    const isGate = cell.x === gateCell.x && cell.z === gateCell.z && gate !== null;
    const block = isGate
      ? (gate as string)
      : corner !== undefined && apronCorner(plan, cell.x, cell.z)
        ? corner
        : post;
    const props = isGate
      ? {
          facing: apronFacing(plan, cell.x, cell.z),
          in_wall: "false",
          open: "false",
          powered: "false",
        }
      : undefined;
    ctx.put(cell.x, y, cell.z, block, props);
    c.n++;
    n++;
    // A second course, for the ring's plain posts only: a gate is one block
    // tall by definition and a post over it would seal the way through.
    for (let k = 1; k < height && !isGate; k++) {
      ctx.put(cell.x, y + k, cell.z, block);
      c.n++;
      n++;
    }
  }
  return n;
}

/**
 * Paint a scatter into the **floor plane** — `y = 0`, which is always solid.
 *
 * **Two rules, both paid for.** The block must be a **full cube**: the physics
 * lint's walking agent stands on `isFullCube`, plus slabs, stairs, `dirt_path`
 * and `farmland` — and *nothing else*. `mud` is none of those; it is a
 * fifteen-sixteenths block the readback refuses to stand a player on, so a
 * wallow of it inside the door cost the whole pack a `traversal.no_start` in
 * all seven themes of the sweep, at the one cell where the room was small
 * enough that the door's approach had nowhere else to go. And the paint keeps
 * off the **way in** regardless of what it is made of, because the door's
 * approach is the one column the lint starts its flood from and a floor
 * repaint is never worth risking it.
 */
function floorPatch(ctx: FitOutContext, c: PropCounter, block: string, step: number): void {
  const it = ctx.interior;
  const inside = ctx.door === null ? null : { x: ctx.door.x, z: ctx.door.z };
  const approach =
    inside === null || ctx.door === null
      ? null
      : (() => {
          const [dx, dz] = cardinalStep(ctx.door.face);
          return { x: inside.x - dx, z: inside.z - dz };
        })();
  for (let z = it.z0; z <= it.z1; z++) {
    for (let x = it.x0; x <= it.x1; x++) {
      if (((x + z) % step + step) % step !== 0) continue;
      if (inside !== null && x === inside.x && z === inside.z) continue;
      if (approach !== null && x === approach.x && z === approach.z) continue;
      ctx.put(x, 0, z, block);
      c.n++;
    }
  }
}

/** Stores down the far wall row: a crate, a barrel and a bale. */
function storeRow(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const end = farEnd(ctx);
  c.put1(it.x1, end.z, "barrel", { facing: "up", open: "false" });
  c.put1(it.x0, end.z, "chest", { facing: end.z === it.z0 ? "south" : "north", type: "single" });
  c.put1(it.x1, end.z === it.z0 ? it.z1 : it.z0, "hay_block", { axis: "y" });
}

/* -------------------------------------------------------------------------- */
/* the entry point                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Fit out one of this file's archetypes.
 *
 * Returns the number of blocks written, which `furnish` adds to its own count.
 * Zero, and not one cell touched, for anything that is not ours.
 */
function furnishAgrarian(ctx: FitOutContext): number {
  if (!isAgrarianArchetype(ctx.archetype)) return 0;
  const c = new PropCounter(ctx);
  switch (ctx.archetype) {
    case "farmstead":
      fitFarmstead(ctx, c);
      break;
    case "pigsty":
      fitPigsty(ctx, c);
      break;
    case "sheepfold":
      fitSheepfold(ctx, c);
      break;
    case "cattle_pen":
      fitCattlePen(ctx, c);
      break;
    case "orchard":
      fitOrchard(ctx, c);
      break;
    case "vineyard":
      fitVineyard(ctx, c);
      break;
    case "terraced_field":
      fitTerracedField(ctx, c);
      break;
    case "threshing_floor":
      fitThreshingFloor(ctx, c);
      break;
    case "marketplace":
    default:
      fitMarketplace(ctx, c);
      break;
  }
  return c.n;
}

/* -------------------------------------------------------------------------- */
/* the yard                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * `farmstead` — the house of the holding, with its yard clutter round it.
 *
 * A timber-framed re-clad: a cobble plinth at the plate's foot, studs every
 * third bay and plank infill between them, which is the oldest farmhouse read
 * there is. The room is a kitchen-and-store: a table, a hearth-side cauldron,
 * barrels, a composter and hay. In the apron, off the doorstep, stand the two
 * things a yard always has — a water trough and a bale.
 *
 * It answers to `farmstead`, `grange`, `croft` and `homestead`, never to bare
 * `farm`, which is a land-use word the precinct and the vegetation pass read.
 */
function fitFarmstead(ctx: FitOutContext, c: PropCounter): void {
  const plan = wallPlan(ctx);
  if (plan !== null) {
    c.n += reclad(ctx, plan, 2, ctx.wallTop, (x, y, z) => {
      if (y === 2) return ctx.style["foundation.primary"] as string;
      if (y === ctx.wallTop) return "stripped_oak_log";
      const along = x === 0 || x === plan.sx - 1 ? z : x;
      return along % 3 === 0 ? "stripped_oak_log" : (ctx.style["wall.primary"] as string);
    });
    const out = outsideDoor(ctx);
    if (out !== null) {
      const yard: readonly (readonly [number, number, string])[] = [
        [out.x + 1, out.z, "cauldron"],
        [out.x - 1, out.z, "hay_block"],
        [out.x, out.z + 1, "hay_block"],
      ];
      for (const [ox, oz, block] of yard) {
        const skirt = ox === -1 || ox === plan.sx || oz === -1 || oz === plan.sz;
        if (!skirt || onWayIn(ctx, ox, oz)) continue;
        ctx.put(ox, groundAt(ctx, c, ox, oz, "coarse_dirt"), oz, block);
        c.n++;
      }
    }
  }

  const it = ctx.interior;
  const end = farEnd(ctx);
  const nearZ = end.z === it.z0 ? it.z1 : it.z0;
  // The kitchen end: a table with a chair at it, on the wall row so the middle
  // column the lantern hangs in stays clear.
  if (ctx.storyHeight >= 4) {
    if (c.put1(it.x0, end.z, ctx.style["wall.fence"] as string)) {
      c.stack(it.x0, end.z, 2, "oak_pressure_plate", { powered: "false" });
    }
  } else {
    c.put1(it.x0, end.z, ctx.style["stone.slab"] as string, { type: "top", waterlogged: "false" });
  }
  c.put1(it.x0, end.z === it.z0 ? end.z + 1 : end.z - 1, ctx.style["stair.interior"] as string, {
    facing: end.z === it.z0 ? "south" : "north",
    half: "bottom",
    shape: "straight",
    waterlogged: "false",
  });
  // The store end.
  c.put1(it.x1, end.z, "cauldron");
  c.put1(it.x1, nearZ, "composter", { level: "0" });
  storeRow(ctx, c);
}

/**
 * `pigsty` — a mud hut in the middle of its own wallow.
 *
 * The walls come back in packed mud over a mud-brick foot, which is the one
 * palette in the block set that reads as "this building is mostly mud". The
 * floor plane gets a scatter of **packed** mud in it — written at `y = 0`, so
 * the floor stays unbroken, and packed rather than raw because raw `mud` is not
 * a block the lint's walking agent may stand on — and a trough stands on
 * the wall row. The pen is a two-course fence ring in the apron with a gate at
 * the far side and the doorstep left open as its entrance.
 */
function fitPigsty(ctx: FitOutContext, c: PropCounter): void {
  const plan = wallPlan(ctx);
  if (plan !== null) {
    c.n += reclad(ctx, plan, 2, ctx.wallTop, (_x, y) => (y === 2 ? "mud_bricks" : "packed_mud"));

    penRing(ctx, c, plan, ctx.style["wall.fence"] as string, 2);
  }
  // Packed mud, not `mud`: see {@link floorPatch}. The read is the same and
  // the lint's walking agent can stand on it.
  floorPatch(ctx, c, "packed_mud", 3);
  const it = ctx.interior;
  const end = farEnd(ctx);
  c.put1(it.x0, end.z, "cauldron");
  c.put1(it.x1, end.z, "composter", { level: "0" });
  storeRow(ctx, c);
}

/**
 * `sheepfold` — the dry-stone fold, with the shepherd's hut inside it.
 *
 * The ring here is a single course of the theme's **stone wall**, not a fence:
 * a fold is chest-high dry stone, and the block that reads as dry stone in
 * every theme is the one the chimney rim already uses. The hut is re-clad in
 * the foundation stone over a plinth, and inside are the two things a fold
 * works with — fleeces (wool bales on the wall rows) and a dip (a cauldron).
 */
function fitSheepfold(ctx: FitOutContext, c: PropCounter): void {
  const plan = wallPlan(ctx);
  if (plan !== null) {
    c.n += reclad(ctx, plan, 2, ctx.wallTop, (x, y, z) => {
      if (y === ctx.wallTop) return ctx.style["foundation.accent"] as string;
      const along = x === 0 || x === plan.sx - 1 ? z : x;
      return (along + y) % 4 === 0
        ? (ctx.style["foundation.accent"] as string)
        : (ctx.style["foundation.primary"] as string);
    });
    penRing(ctx, c, plan, ctx.style["stone.wall"] as string, 1);
  }
  const it = ctx.interior;
  const end = farEnd(ctx);
  for (let z = it.z0; z <= it.z1; z++) {
    if ((z - it.z0) % 3 !== 0) continue;
    c.put1(it.x0, z, "white_wool");
  }
  c.put1(it.x1, end.z, "cauldron");
  storeRow(ctx, c);
}

/**
 * `cattle_pen` — the byre, in a post-and-rail corral.
 *
 * The same ring as the sty, two courses of fence, but with a **solid log post
 * at each corner**, which is how a corral reads at a distance: the corners
 * carry the rails. Inside, feed and water down the wall rows — hay every third
 * bay on one side, a trough and a bale on the other.
 */
function fitCattlePen(ctx: FitOutContext, c: PropCounter): void {
  const plan = wallPlan(ctx);
  if (plan !== null) {
    c.n += reclad(ctx, plan, 2, ctx.wallTop, (x, y, z) => {
      if (y === 2 || y === ctx.wallTop) return "stripped_spruce_log";
      const along = x === 0 || x === plan.sx - 1 ? z : x;
      return along % 4 === 0 ? "stripped_spruce_log" : "spruce_planks";
    });
    penRing(ctx, c, plan, ctx.style["wall.fence"] as string, 2, "stripped_spruce_log");
  }
  const it = ctx.interior;
  const end = farEnd(ctx);
  for (let z = it.z0; z <= it.z1; z++) {
    if ((z - it.z0) % 3 !== 0) continue;
    if (!c.put1(it.x0, z, "hay_block", { axis: "y" })) continue;
    c.stack(it.x0, z, Math.min(2, ctx.storyHeight - 1), ctx.style["wall.trapdoor"] as string,
      shutter("east"));
  }
  c.put1(it.x1, end.z, "cauldron");
  storeRow(ctx, c);
}

/* -------------------------------------------------------------------------- */
/* the planting                                                                */
/* -------------------------------------------------------------------------- */

/**
 * A row of single-column plants in the apron: a trunk, then a crown on it.
 *
 * The envelope rule is why every tree in this file is one column wide: the
 * apron *is* the envelope's edge, so a crown that spread sideways would leave
 * it. A trunk of `stem` courses with `crown` courses on top of it is supported
 * all the way down to the filled apron course, reads as planting from outside,
 * and never touches the doorstep gap.
 */
function plantRow(
  ctx: FitOutContext,
  c: PropCounter,
  plan: RebuildPlan,
  step: number,
  phase: number,
  stem: string,
  stemHigh: number,
  crown: string,
  crownHigh: number,
  crownProps?: Record<string, string>,
): number {
  let n = 0;
  for (const cell of apronOf(plan.sx, plan.sz)) {
    if (onWayIn(ctx, cell.x, cell.z)) continue;
    if (apronCorner(plan, cell.x, cell.z)) continue;
    const onX = cell.x === -1 || cell.x === plan.sx;
    const along = onX ? cell.z : cell.x;
    if (((along % step) + step) % step !== phase) continue;
    const y = groundAt(ctx, c, cell.x, cell.z, "coarse_dirt");
    for (let k = 0; k < stemHigh; k++) {
      ctx.put(cell.x, y + k, cell.z, stem, stem.endsWith("_log") ? { axis: "y" } : undefined);
      c.n++;
      n++;
    }
    for (let k = 0; k < crownHigh; k++) {
      ctx.put(cell.x, y + stemHigh + k, cell.z, crown, crownProps);
      c.n++;
      n++;
    }
  }
  return n;
}

/**
 * `orchard` — the fruit store, standing in its own trees.
 *
 * The trees are the archetype: a trunk of two oak logs with a two-course crown
 * on top, every third apron cell, each one a single column so nothing leaves
 * the envelope. The store behind them is plank-clad with a ladder up one wall
 * — the picking ladder, and a ladder is passable, so it costs the room no
 * walkable cell — and its floor is barrels and crates of fruit.
 */
function fitOrchard(ctx: FitOutContext, c: PropCounter): void {
  const plan = wallPlan(ctx);
  if (plan !== null) {
    c.n += reclad(ctx, plan, 2, ctx.wallTop, (x, y, z) => {
      if (y === ctx.wallTop) return "stripped_oak_log";
      const along = x === 0 || x === plan.sx - 1 ? z : x;
      return (along + y) % 5 === 0 ? "oak_log" : "oak_planks";
    });
    plantRow(ctx, c, plan, 3, 1, "oak_log", 2, "oak_leaves", 2, {
      distance: "1",
      persistent: "true",
      waterlogged: "false",
    });
  }
  const it = ctx.interior;
  const end = farEnd(ctx);
  for (let z = it.z0; z <= it.z1; z++) {
    if ((z - it.z0) % 2 !== 0) continue;
    c.put1(it.x0, z, "barrel", { facing: "up", open: "false" });
  }
  c.put1(it.x1, end.z, "composter", { level: "0" });
  // The picking ladder, flat on the far wall: passable, so the room keeps it.
  if (ctx.storyHeight >= 4) {
    c.stack(it.x1, end.z === it.z0 ? end.z + 1 : end.z - 1, 2, "ladder", {
      facing: "west",
      waterlogged: "false",
    });
  }
  storeRow(ctx, c);
}

/**
 * `vineyard` — the vintner's shed between its trellis rows.
 *
 * The trellis is a fence post with a leaf canopy on it, in rows every third
 * apron cell; the cells between them carry `sweet_berry_bush` at `age=3`,
 * which is the fruiting bush the farm precinct already sows and the closest
 * this block set gets to a vine on a wire. Inside is the making end of it:
 * barrels down one row and a vat — a bare cauldron — at the far wall.
 */
function fitVineyard(ctx: FitOutContext, c: PropCounter): void {
  const plan = wallPlan(ctx);
  if (plan !== null) {
    c.n += reclad(ctx, plan, 2, ctx.wallTop, (_x, y) =>
      y === 2 || y === ctx.wallTop ? "smooth_stone" : "stone_bricks",
    );
    plantRow(ctx, c, plan, 3, 1, ctx.style["wall.fence"] as string, 2, "oak_leaves", 1, {
      distance: "1",
      persistent: "true",
      waterlogged: "false",
    });
    // The fruit, between the trellis posts. It stands on the same filled
    // apron course the posts do, never on air.
    for (const cell of apronOf(plan.sx, plan.sz)) {
      if (onWayIn(ctx, cell.x, cell.z)) continue;
      if (apronCorner(plan, cell.x, cell.z)) continue;
      const onX = cell.x === -1 || cell.x === plan.sx;
      const along = onX ? cell.z : cell.x;
      if (((along % 3) + 3) % 3 !== 2) continue;
      const y = groundAt(ctx, c, cell.x, cell.z, "coarse_dirt");
      ctx.put(cell.x, y, cell.z, "sweet_berry_bush", { age: "3" });
      c.n++;
    }
  }
  const it = ctx.interior;
  const end = farEnd(ctx);
  for (let z = it.z0; z <= it.z1; z++) {
    if ((z - it.z0) % 2 !== 0) continue;
    c.put1(it.x1, z, "barrel", { facing: "up", open: "false" });
  }
  c.put1(it.x0, end.z, "cauldron");
  storeRow(ctx, c);
}

/**
 * `terraced_field` — the field house on the lip of its own terrace.
 *
 * The apron is the terrace: `farmland` at `moisture=0` written into the floor
 * plane with mature `wheat` standing on it, which is the precinct's own crop
 * vocabulary laid one ring wide. The house is dry-stone banded like a
 * retaining wall, because that is what a terraced field's built edge is, and
 * inside are the seed store and the tools.
 *
 * It claims `terraced_field`, `field_terrace` and `rice_terrace` — never bare
 * `terrace`, which is what the compiler does to ground.
 */
function fitTerracedField(ctx: FitOutContext, c: PropCounter): void {
  const plan = wallPlan(ctx);
  if (plan !== null) {
    c.n += reclad(ctx, plan, 2, ctx.wallTop, (x, y, z) => {
      const along = x === 0 || x === plan.sx - 1 ? z : x;
      return (along + y * 2) % 5 === 0
        ? (ctx.style["foundation.accent"] as string)
        : (ctx.style["foundation.primary"] as string);
    });
    for (const cell of apronOf(plan.sx, plan.sz)) {
      if (onWayIn(ctx, cell.x, cell.z)) continue;
      if (apronCorner(plan, cell.x, cell.z)) continue;
      const y = groundAt(ctx, c, cell.x, cell.z, "farmland");
      // `groundAt` fills only when the apron had no ground of its own; when it
      // did, the top course becomes the soil instead.
      ctx.put(cell.x, y - 1, cell.z, "farmland", { moisture: "0" });
      c.n++;
      ctx.put(cell.x, y, cell.z, "wheat", { age: "7" });
      c.n++;
    }
  }
  const it = ctx.interior;
  const end = farEnd(ctx);
  for (let z = it.z0; z <= it.z1; z++) {
    if ((z - it.z0) % 3 !== 0) continue;
    c.put1(it.x0, z, "barrel", { facing: "up", open: "false" });
  }
  c.put1(it.x1, end.z, "composter", { level: "0" });
  storeRow(ctx, c);
}

/* -------------------------------------------------------------------------- */
/* the work floor and the square                                               */
/* -------------------------------------------------------------------------- */

/**
 * `threshing_floor` — a swept stone floor under an open-sided shed.
 *
 * The floor is the archetype, so it is written into the floor plane itself:
 * smooth stone across the whole interior, which is the one surface a flail
 * works on. Everything else stands out of the way on the wall rows — sheaves
 * (hay) down one, winnowing baskets (cauldrons) and the grain store down the
 * other — and the walls come back as a boarded shed on a stone foot.
 */
function fitThreshingFloor(ctx: FitOutContext, c: PropCounter): void {
  const plan = wallPlan(ctx);
  if (plan !== null) {
    c.n += reclad(ctx, plan, 2, ctx.wallTop, (x, y, z) => {
      if (y === 2) return ctx.style["foundation.primary"] as string;
      if (y === ctx.wallTop) return "stripped_oak_log";
      const along = x === 0 || x === plan.sx - 1 ? z : x;
      return along % 4 === 0 ? "stripped_oak_log" : (ctx.style["wall.primary"] as string);
    });
  }
  // The swept floor: every cell of it, so the plane stays unbroken.
  const it = ctx.interior;
  for (let z = it.z0; z <= it.z1; z++) {
    for (let x = it.x0; x <= it.x1; x++) {
      ctx.put(x, 0, z, "smooth_stone");
      c.n++;
    }
  }
  const end = farEnd(ctx);
  for (let z = it.z0; z <= it.z1; z++) {
    if ((z - it.z0) % 3 !== 0) continue;
    c.put1(it.x0, z, "hay_block", { axis: "y" });
  }
  c.put1(it.x1, end.z, "cauldron");
  c.put1(it.x1, end.z === it.z0 ? end.z + 1 : end.z - 1, "barrel", {
    facing: "up",
    open: "false",
  });
  storeRow(ctx, c);
}

/**
 * `marketplace` — the open-air square, as a market hall.
 *
 * The catalog tags it `open-air`, so the fit-out **opens the wall**: piers of
 * masonry every fourth bay, and between them a fenced arcade from the course
 * above head height up to the course below the plate. The plate itself stays
 * solid, because the eave has to sit on something, and the two courses at
 * standing height stay solid too, so the room behind is still a room and the
 * arcade reads as an arcade rather than as a hole.
 *
 * The floor is the market: counters — top slabs on the wall rows, which is a
 * counter a player can stand at — with barrels and crates behind them.
 *
 * It claims `marketplace`, `market_square` and `market_place`, never bare
 * `market`, which has been the extended market stall's since G4.
 */
function fitMarketplace(ctx: FitOutContext, c: PropCounter): void {
  const plan = wallPlan(ctx);
  if (plan !== null) {
    const pierBlock = ctx.style["foundation.accent"] as string;
    const fence = ctx.style["wall.fence"] as string;
    // The arcade band: above head height, below the plate. When the storey is
    // too short for one, nothing opens and the re-clad is all that happens.
    const from = 4;
    const to = ctx.wallTop - 1;
    c.n += reclad(ctx, plan, 2, ctx.wallTop, (x, y, z) => {
      const along = x === 0 || x === plan.sx - 1 ? z : x;
      const corner = (x === 0 || x === plan.sx - 1) && (z === 0 || z === plan.sz - 1);
      const pier = corner || along % 4 === 0;
      if (pier) return pierBlock;
      if (y < from || y > to) return null; // the shell's own wall stands
      return fence;
    });
  }
  const it = ctx.interior;
  const slab = ctx.style["stone.slab"] as string;
  for (let z = it.z0; z <= it.z1; z++) {
    const bay = (z - it.z0) % 3;
    if (bay === 0) {
      c.put1(it.x0, z, slab, { type: "top", waterlogged: "false" });
      c.put1(it.x1, z, slab, { type: "top", waterlogged: "false" });
    } else if (bay === 1) {
      c.put1(it.x0, z, "barrel", { facing: "up", open: "false" });
      c.put1(it.x1, z, "chest", { facing: "west", type: "single" });
    }
  }
  c.put1(it.x1, farEnd(ctx).z, "hay_block", { axis: "y" });
}

/* -------------------------------------------------------------------------- */
/* descriptor rows — Phase 4 registry (single source; builder seam)             */
/* -------------------------------------------------------------------------- */

/**
 * Tag equivalence for a single agrarian archetype, matching
 * {@link agrarianArchetypeOfTags}. Preserves the farm/farmstead distinction:
 * farmstead is grange/croft/homestead (neither bare farm nor bare farmstead),
 * marketplace is marketplace/market_square/market_place (never bare market),
 * vineyard is vineyard/winery/vinery (not vines), etc.
 */
function agrarianTagsFor(id: AgrarianBuildingArchetype): readonly string[] {
  switch (id) {
    case "farmstead":
      return ["grange", "croft", "homestead"] as const;
    case "pigsty":
      return ["pigsty", "pigpen", "pig_pen"] as const;
    case "sheepfold":
      return ["sheepfold", "sheep_fold", "sheep_pen"] as const;
    case "cattle_pen":
      return ["cattle_pen", "cattle", "corral", "paddock"] as const;
    case "orchard":
      return ["orchard", "apple_orchard", "fruit_grove"] as const;
    case "vineyard":
      return ["vineyard", "winery", "vinery"] as const;
    case "terraced_field":
      return ["terraced_field", "field_terrace", "rice_terrace"] as const;
    case "threshing_floor":
      return ["threshing_floor", "threshing", "winnowing"] as const;
    case "marketplace":
      return ["marketplace", "market_square", "market_place"] as const;
    default:
      return [id] as const;
  }
}

function agrarianFacadeFor(id: AgrarianBuildingArchetype): BuildingDescriptor["facadeDefaults"] {
  const raw = agrarianFacadeDefaults(id);
  const hasAny = raw.windowShape !== undefined || raw.windowRhythm !== undefined || raw.roof !== undefined;
  return hasAny ? raw : undefined;
}

/**
 * Ordered building descriptor rows for the agrarian pack.
 *
 * Order via {@link AGRARIAN_BUILDING_ARCHETYPES}, tags via
 * {@link agrarianArchetypeOfTags} (preserving farm/farmstead alias distinctions),
 * facade defaults via {@link agrarianFacadeDefaults}, furnish via
 * {@link furnishAgrarian}. Standard dispatch; no catalog invented.
 */
export const AGRARIAN_BUILDING_DESCRIPTORS = defineBuildingDescriptors<
  AgrarianBuildingArchetype,
  FitOutContext
>(AGRARIAN_BUILDING_ARCHETYPES, {
  tags: agrarianTagsFor,
  facadeDefaults: agrarianFacadeFor,
  furnish: furnishAgrarian,
  dispatch: "standard",
});
