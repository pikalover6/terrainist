/**
 * The **agrarian expansion pack's buildings** — the five entries of
 * `docs/CATALOG-EXPANSION-v0.md` §3.5 that have an inside rather than a
 * footprint in the yard.
 *
 * The pack's thesis is battery P2's: F17 shipped the field and the farmstead,
 * and the countryside between them is still empty. These five are the roofed
 * half of that countryside, and every one of them is a working room rather
 * than a dwelling:
 *
 * - `cow_byre` — standings either side of a central dunging passage, with the
 *   feed walk at the head;
 * - `dutch_barn` — nothing but stacked hay between the piers: the read is the
 *   absence of anything else, so this fit-out is deliberately the sparsest in
 *   the catalog;
 * - `smokehouse` — a blind hut with the fire pit low and the racks up in the
 *   roof;
 * - `dairy` — cold on purpose: slate shelves round three walls, the churns
 *   under them, the floor kept wet;
 * - `wool_shed` — the wool table down the middle with the catching pens under
 *   one end.
 *
 * ## The design law, and this file's place under it
 *
 * `archetypes-blitz.ts` states it and this file obeys it without restating it:
 * an archetype is a **fit-out**, not a second grammar. Everything here runs
 * after the shape stages and writes into the same cell map. Not a line of
 * `core.ts` moves for any of them, and — like `archetypes-wilds.ts`, which is
 * this file's nearest model — it does **no exterior work at all**: it never
 * writes above the eave plate, never touches the wall ring, and never puts a
 * block in the apron. The dutch barn's open sides and the byre's half-doors
 * are the *shell's* business, and a pier drawn out here would be a column in
 * the apron with nothing under it, which is `floating.isolated` in its oldest
 * clothes.
 *
 * ## The rules, inherited from every earlier wave and paid for there
 *
 * 1. **Everything goes through {@link PropCounter}**, which routes through the
 *    ground floor's own `free` and `take` — the door approach, the stair
 *    columns, the connectivity guard and the blocked-column guard, none of
 *    them restated here. There is not one `raw` call in this file, so the door
 *    column and its doorstep are untouchable by construction.
 * 2. **Everything stands against a wall, and the middle stays walkable.** The
 *    byre's passage, the barn's floor, the shed's table run: each of them
 *    leaves the room one walkable region on every envelope the solver can
 *    hand it.
 * 3. **Nothing is a pillar.** A stack that would fill an interior column from
 *    the floor to the ceiling is refused by `PropCounter`'s own headroom
 *    guard; the hay stacks and the smokehouse racks are therefore written with
 *    {@link headroomOf} in hand rather than at a fixed height.
 * 4. **No lantern by name.** The lint's lantern rule fires on any block name
 *    ending `lantern`, so the smokehouse's fire is `glowstone` with a solid
 *    neighbour above it and one either side. The shell hangs the room's one
 *    real light and this file does not touch it.
 * 5. **No sign blocks**, no bare `flower_pot`, and `cauldron` takes no
 *    properties. `chain` is not in the pinned 1.21.11 table; where a hanging
 *    line is wanted the block is `iron_bars`.
 * 6. **No transcendental maths and no unseeded draw.** Every pattern here is a
 *    pure function of position.
 */

import { PropCounter, type FitOutContext } from "./archetypes-civic.js";

/* -------------------------------------------------------------------------- */
/* the archetypes                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The five archetypes this file fits out, in catalog order.
 *
 * Spread into `BUILDING_ARCHETYPES` by `archetypes.ts`, straight after the
 * wilds & camps pack, and mirrored in the same order by the spec package's
 * `KNOWN_BUILDING_ARCHETYPES` — where the order is asserted element by
 * element, so it is load-bearing in both places.
 */
export const HEDGEROW_BUILDING_ARCHETYPES = [
  "cow_byre",
  "dutch_barn",
  "smokehouse",
  "dairy",
  "wool_shed",
] as const;

/** One of the archetypes this file fits out. */
export type HedgerowBuildingArchetype = (typeof HEDGEROW_BUILDING_ARCHETYPES)[number];

/** True for an archetype this file answers to. */
export function isHedgerowArchetype(value: string): value is HedgerowBuildingArchetype {
  return (HEDGEROW_BUILDING_ARCHETYPES as readonly string[]).includes(value);
}

/**
 * Tag → archetype, or `null` when nothing matches.
 *
 * Consulted immediately after the wilds table and well before the extended
 * one. This pack claims **only compounds derived from its own ids and their
 * catalog notes**, and the deliberate non-claims are the point of this
 * comment — every one of them belongs to an earlier table or to a plainer
 * building that has the better claim:
 *
 * - bare **`byre`** is *not* taken. It is the original table's word for
 *   `barn` and has been since the founding waves; the byre answers to
 *   `cow_byre`, `cowshed` and `cattle_shed` only;
 * - bare **`barn`** and **`stable`** stay where they are for the same reason,
 *   and so does **`hay`**: the dutch barn takes `dutch_barn`, `hay_barn` and
 *   `open_barn`, all of them compounds;
 * - **`cattle`**, **`cattle_pen`**, **`sheepfold`**, **`pigsty`**,
 *   **`farmstead`** and **`granary`** are Track A's agrarian pack's and are
 *   not touched here — the expansion is the countryside *between* those, not
 *   a second claim on them;
 * - bare **`shed`** is left unclaimed: it is the plainest word in the
 *   catalog's vocabulary and a document that says it wants something plainer
 *   than a shearing floor. The wool shed takes `wool_shed`, `woolshed` and
 *   `shearing_shed`;
 * - bare **`field`**, **`farm`** and **`yard`** are non-claims by design.
 *   They are land-use words, not building words, and the fabric reads them
 *   long before an archetype table does;
 * - **`dairy`**, **`creamery`**, **`milk_house`**, **`smokehouse`**,
 *   **`smoke_house`** and **`smokery`** are unclaimed by any earlier table
 *   and are taken here, which is why the dairy and the smokehouse are the
 *   only two entries in this pack whose plainest word is their own.
 */
export function hedgerowArchetypeOfTags(tags: readonly string[]): HedgerowBuildingArchetype | null {
  const has = (t: string): boolean => tags.includes(t);
  if (has("cow_byre") || has("cowshed") || has("cattle_shed")) return "cow_byre";
  if (has("dutch_barn") || has("hay_barn") || has("open_barn")) return "dutch_barn";
  if (has("smokehouse") || has("smoke_house") || has("smokery")) return "smokehouse";
  if (has("dairy") || has("creamery") || has("milk_house")) return "dairy";
  if (has("wool_shed") || has("woolshed") || has("shearing_shed")) return "wool_shed";
  return null;
}

/**
 * Facade tendencies for this file's archetypes.
 *
 * Same contract as every other wave's: defaults a caller merges into its
 * params, never something applied over an explicit one.
 *
 * - the **byre** wants the sparsest openings and a long `gable`: a byre is
 *   dark by design and what it has instead of windows is a half-door;
 * - the **dutch barn** is the opposite: "open on all four sides" is not a
 *   shape this grammar builds, so the nearest true thing is the **densest
 *   openings in the pack** — `mullion` at a `dense` rhythm, which is a wall
 *   that is mostly hole;
 * - the **smokehouse** is a blind hut, and the grammar has an exact word for
 *   that: rhythm **`none`**, so the only opening is the door the shell always
 *   hangs;
 * - the **dairy** wants small openings and a cold roof: `sparse` `single`
 *   under a `hip`, which is the note's "deliberately cold" as a facade
 *   decision;
 * - the **wool shed** is a long lit working floor: `regular` `tall` openings
 *   under a `gable`.
 */
export function hedgerowFacadeDefaults(archetype: string): {
  readonly windowShape?: string;
  readonly windowRhythm?: string;
  readonly roof?: string;
} {
  switch (archetype) {
    case "cow_byre":
      return { windowShape: "single", windowRhythm: "sparse", roof: "gable" };
    case "dutch_barn":
      return { windowShape: "mullion", windowRhythm: "dense", roof: "gable" };
    case "smokehouse":
      return { windowShape: "single", windowRhythm: "none", roof: "gable" };
    case "dairy":
      return { windowShape: "single", windowRhythm: "sparse", roof: "hip" };
    case "wool_shed":
      return { windowShape: "tall", windowRhythm: "regular", roof: "gable" };
    default:
      return {};
  }
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
export function furnishHedgerow(ctx: FitOutContext): number {
  if (!isHedgerowArchetype(ctx.archetype)) return 0;
  const c = new PropCounter(ctx);
  switch (ctx.archetype) {
    case "cow_byre":
      fitCowByre(ctx, c);
      break;
    case "dutch_barn":
      fitDutchBarn(ctx, c);
      break;
    case "smokehouse":
      fitSmokehouse(ctx, c);
      break;
    case "dairy":
      fitDairy(ctx, c);
      break;
    case "wool_shed":
    default:
      fitWoolShed(ctx, c);
      break;
  }
  return c.n;
}

/**
 * How many courses of clear air this storey actually has.
 *
 * On one floor the room runs to the eave plate; on more than one it stops at
 * the boards over it, and a fit-out that measured the first and built into the
 * second would put its hay through somebody's floor.
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

/** A bottom slab, the shelf and the table top of this whole file. */
const SLAB = { type: "bottom", waterlogged: "false" } as const;

/**
 * The wall a cell is nearest, as a stair `facing` that puts the **backrest**
 * against it.
 *
 * The stair-seat rule, obeyed everywhere in this file: a stair's `facing` is
 * the direction of its high half, so a seat against the north wall faces north
 * and the sitter looks south, into the room.
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
 * The same walk as the fire lookout's, and for the same reason: the middle of
 * a wall is where the shell reserves the hearth and where a door most often
 * lands, so the obvious answer — centre it — is the one answer that is
 * unavailable on most envelopes. `null` means the room will give none, and the
 * caller falls back to something one cell wide.
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

/** The wall row furthest from the door — the head of a working room. */
function headRow(ctx: FitOutContext): number {
  const it = ctx.interior;
  if (ctx.door === null) return it.z0;
  return ctx.door.z > (it.z0 + it.z1) / 2 ? it.z0 : it.z1;
}

/* -------------------------------------------------------------------------- */
/* the byre                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * `cow_byre` — standings either side of a central dunging passage.
 *
 * The **passage** is the middle column of the room and is never written into:
 * that is the whole plan of a byre, and it is also the cheapest way to keep
 * the ground floor one walkable region on every envelope. The **standings**
 * are the two side walls — a bay of hay to lie on, a division of fence, a bay
 * of hay — and the **feed walk** is the wall row furthest from the door, a run
 * of slab a body can still stand on, with the water trough at the end of it.
 */
function fitCowByre(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const fence = style["wall.fence"] as string;
  const slab = style["stone.slab"] as string;
  const feedZ = headRow(ctx);

  // The feed walk, along the head wall.
  for (let x = it.x0; x <= it.x1; x++) c.put1(x, feedZ, slab, SLAB);

  // The standings, either side of the passage: hay to lie on, fence to divide.
  for (let z = it.z0; z <= it.z1; z++) {
    if (z === feedZ) continue;
    for (const x of [it.x0, it.x1]) {
      if ((z - it.z0) % 3 === 2) {
        c.put1(x, z, fence, POST);
        continue;
      }
      c.put1(x, z, "hay_block", { axis: "z" });
    }
  }

  // The water trough and the muck barrow, at the tail of the standings. The
  // corners of that row are already a standing, so the bay is *found* rather
  // than assumed — the same walk the fire lookout's map table makes, and for
  // the same reason.
  const tail = feedZ === it.z0 ? it.z1 : it.z0;
  const troughX = bayOn(ctx, tail, 1);
  if (troughX !== null) {
    c.put1(troughX - 1, tail, "cauldron");
    c.put1(troughX + 1, tail, "composter", { level: "0" });
  } else {
    const lone = bayOn(ctx, tail, 0);
    if (lone !== null) c.put1(lone, tail, "cauldron");
  }
}

/* -------------------------------------------------------------------------- */
/* the dutch barn                                                              */
/* -------------------------------------------------------------------------- */

/**
 * `dutch_barn` — open on all four sides, and nothing but stacked hay between
 * the piers.
 *
 * The read is the **absence of walls**, which is the shell's business; what
 * this file can honour is the absence of everything *else*, so this is the
 * sparsest fit-out in the catalog on purpose. Hay against the two long walls,
 * stacked two courses where the storey has the room and one where it has not,
 * with a gap at the middle of each run so the stack reads as bales and not as
 * masonry — and absolutely nothing anywhere else.
 */
function fitDutchBarn(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const head = headroomOf(ctx);
  const midZ = Math.floor((it.z0 + it.z1) / 2);

  for (const x of [it.x0, it.x1]) {
    for (let z = it.z0; z <= it.z1; z++) {
      if (z === midZ) continue; // the gap, so a stack reads as bales
      if (!c.put1(x, z, "hay_block", { axis: "y" })) continue;
      if (head >= 3 && (z - it.z0) % 2 === 0) c.stack(x, z, 2, "hay_block", { axis: "y" });
    }
  }

  // One stack pulled out into the bay at the head end, which is what a barn
  // being filled actually looks like.
  const headZ = headRow(ctx);
  const bay = bayOn(ctx, headZ, 0);
  if (bay !== null) c.put1(bay, headZ, "hay_block", { axis: "y" });
}

/* -------------------------------------------------------------------------- */
/* the smokehouse                                                              */
/* -------------------------------------------------------------------------- */

/**
 * `smokehouse` — a blind hut with a low fire pit and the racks up in the roof.
 *
 * The **fire pit** is a course of dressed stone against the head wall with the
 * glow set into it and the breast carried one course over, so the glow has a
 * solid block above it and one either side: `glowstone`, never a block whose
 * name ends `lantern`. The **racks** are runs of `iron_bars` up at the top of
 * the storey down both long walls — that is where the meat hangs, and it is
 * also the one place in a hut this small that a rack does not become a wall.
 */
function fitSmokehouse(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const stone = style["foundation.accent"] as string;
  const head = headroomOf(ctx);
  const fireZ = headRow(ctx);

  const fireX = bayOn(ctx, fireZ, 1) ?? bayOn(ctx, fireZ, 0);
  if (fireX !== null) {
    if (c.put1(fireX, fireZ, "glowstone") && head >= 3) c.stack(fireX, fireZ, 2, stone);
    for (const x of [fireX - 1, fireX + 1]) {
      if (x < it.x0 || x > it.x1) continue;
      c.put1(x, fireZ, stone);
    }
  }

  // The racks, up under the boards on both long walls.
  if (head >= 3) {
    for (const x of [it.x0, it.x1]) {
      for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
        c.stack(x, z, head, "iron_bars", {
          east: "false",
          north: "true",
          south: "true",
          waterlogged: "false",
          west: "false",
        });
      }
    }
  }

  // The salting barrel by the way in — the only floor furniture a blind hut
  // has room for.
  const doorEnd = fireZ === it.z0 ? it.z1 : it.z0;
  c.put1(it.x1, doorEnd, "barrel", BARREL);
}

/* -------------------------------------------------------------------------- */
/* the dairy                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * `dairy` — deliberately cold, and the only room in this pack with shelves.
 *
 * **Slate shelves round three walls**: a slab at the second course, which is
 * high enough to be a shelf and low enough that the column under it stays
 * clear, so nothing here trips the blocked-column guard. The **churns** stand
 * under them — cauldrons and barrels alternating along the two side walls —
 * and the **floor kept wet** is a cauldron at the head, which is as close to a
 * wet stone floor as a fit-out that must not touch the floor plane can get.
 */
function fitDairy(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const slab = style["stone.slab"] as string;
  const head = headroomOf(ctx);
  const shelfZ = headRow(ctx);

  // The shelves: the head wall and both side walls, never the door wall.
  if (head >= 3) {
    for (let x = it.x0; x <= it.x1; x++) c.stack(x, shelfZ, 2, slab, SLAB);
    for (const x of [it.x0, it.x1]) {
      for (let z = it.z0 + 1; z <= it.z1 - 1; z++) c.stack(x, z, 2, slab, SLAB);
    }
  }

  // The churns, under the shelves on both side walls.
  for (const x of [it.x0, it.x1]) {
    for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
      if ((z - it.z0) % 2 === 1) {
        c.put1(x, z, "cauldron");
        continue;
      }
      c.put1(x, z, "barrel", BARREL);
    }
  }

  // The settling pans along the head wall, and the wet floor's own cauldron.
  const panX = bayOn(ctx, shelfZ, 1);
  if (panX !== null) {
    for (const x of [panX - 1, panX + 1]) c.put1(x, shelfZ, "cauldron");
  }
}

/* -------------------------------------------------------------------------- */
/* the shearing shed                                                           */
/* -------------------------------------------------------------------------- */

/**
 * `wool_shed` — the wool table down the middle, the catching pens under one
 * end.
 *
 * The **table** runs on the room's axis and is written as slabs, so a body can
 * still stand where it is and the shed stays one region however tight the
 * envelope. The **catching pens** are hurdles across the end furthest from the
 * door — fences at the wall line, with the middle of the run left open so a
 * sheep comes out of them into the room — and the **fleece bins** are the
 * barrels down the far wall, which is where a fleece goes after the table.
 */
function fitWoolShed(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const fence = style["wall.fence"] as string;
  const seat = style["stair.interior"] as string;
  const slab = style["stone.slab"] as string;
  const midX = Math.floor((it.x0 + it.x1) / 2);
  const penZ = headRow(ctx);

  // The wool table, down the axis and one cell wide.
  for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
    if (z === penZ) continue;
    if ((z - it.z0) % 2 === 0) continue; // a table in bays, not a wall of slab
    c.put1(midX, z, slab, SLAB);
  }

  // The catching pens, across the head end with a way out of them.
  for (let x = it.x0; x <= it.x1; x++) {
    if (x === midX) continue;
    c.put1(x, penZ, fence, POST);
  }

  // The fleece bins down one wall, and the shearer's stool by the table.
  for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
    if ((z - it.z0) % 3 !== 1) continue;
    c.put1(it.x1, z, "barrel", BARREL);
  }
  const stoolZ = Math.floor((it.z0 + it.z1) / 2);
  if (stoolZ !== it.z0 && stoolZ !== it.z1) {
    c.put1(it.x0, stoolZ, seat, {
      facing: seatFacing(it, it.x0, stoolZ),
      half: "bottom",
      shape: "straight",
    });
  }

  // The boards the fleece is thrown on, at the door end.
  const doorEnd = penZ === it.z0 ? it.z1 : it.z0;
  const boardX = bayOn(ctx, doorEnd, 0);
  if (boardX !== null) c.put1(boardX, doorEnd, slab, SLAB);
}
