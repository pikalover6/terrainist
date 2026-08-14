/**
 * The **frontier West pack's buildings** — the nine entries of
 * `docs/CATALOG-EXPANSION-v0.md` §3.7 that have an inside rather than a
 * footprint on the ground or a run along a route.
 *
 * The pack's thesis is the era alias's failure: "a wild west town" routes to
 * `industrial` and arrives as a Victorian mill town — no false fronts, no
 * saloon, no assay office. These nine are the idiom's roofed half:
 *
 * - `false_front_saloon` — the long bar down one wall, the back bar lit behind
 *   it, the piano in the corner and the stair to the rooms;
 * - `assay_office` — the barred counter, the little furnace, the scales and
 *   the strongbox in the corner;
 * - `stamp_mill` — the ore bin at the head of the room, the battery of stamps
 *   under it and the shaking tables below that;
 * - `telegraph_office` — one room: the key desk under the window, the
 *   operator's chair and the wire coming down the wall;
 * - `livery_stable` — stalls down both sides, a hay loft over one of them and
 *   the aisle left clear from door to door;
 * - `wagon_shop` — wheels up on the wall, the forge in the corner and half a
 *   wagon on its trestles;
 * - `mission_church` — a deep plain room with the altar at the head of it and
 *   benches down both sides;
 * - `cantina` — a plain bar, terracotta, and the shaded end of the room;
 * - `dugout_shanty` — a bunk, a stove and a shelf, and the bank of earth the
 *   whole thing is cut back into.
 *
 * ## The design law, and this file's place under it
 *
 * `archetypes-blitz.ts` states it and this file obeys it without restating it:
 * an archetype is a **fit-out**, not a second grammar. Everything here runs
 * after the shape stages and writes into the same cell map. Not a line of
 * `core.ts` moves for any of them, and — like `archetypes-wilds.ts`, which is
 * this file's nearest model — it does **no exterior work at all**: it never
 * writes above the eave plate, never touches the wall ring, and never puts a
 * block in the apron. The saloon's false front, the mission's bell gable and
 * the dugout's turf roof are all *shell* business; a parapet drawn out here
 * would be a screen standing in the apron with nothing under it, which is
 * `floating.isolated` in its oldest clothes.
 *
 * ## The rules, inherited from every earlier wave and paid for there
 *
 * 1. **Everything goes through {@link PropCounter}**, which routes through the
 *    ground floor's own `free` and `take` — the door approach, the stair
 *    columns, the connectivity guard and the blocked-column guard, none of
 *    them restated here. There is not one `raw` call in this file, so the door
 *    column and its doorstep are untouchable by construction.
 * 2. **Everything stands against a wall.** Each fit-out works the perimeter of
 *    its room and leaves the middle of the floor alone, which is true of a bar
 *    room, a stable aisle and a chapel alike, and is the cheapest way to keep
 *    a ground floor one walkable region on every envelope the solver hands it.
 * 3. **Nothing hangs off nothing.** Every second course this file writes goes
 *    at `y = 2` directly **over a block it put at `y = 1`**, so the support
 *    chain runs to the floor without depending on what the wall ring happens
 *    to be at that height — a shelf that leaned on a window pane would be a
 *    fit-out that floats on whichever theme opens that bay.
 * 4. **Nothing is a pillar.** A stack that would fill an interior column from
 *    floor to ceiling is refused by `PropCounter`'s own headroom guard; every
 *    second course here is additionally gated on {@link headroomOf}.
 * 5. **No lantern by name.** The lint's lantern rule fires on any block name
 *    ending `lantern`, so every glow in this file is `glowstone` with a solid
 *    neighbour — the back bar, the forge, the altar. The shell hangs the
 *    room's one real light and this file does not touch it.
 * 6. **No sign blocks**, no bare `flower_pot`, and `cauldron` takes no
 *    properties. `chain` is not in the pinned 1.21.11 block table; where a
 *    hanging line is wanted the block is `iron_bars`.
 * 7. **No `mud`** anywhere — it is 15/16 of a block and a body cannot stand on
 *    it. The dugout's bank is `coarse_dirt` and `rooted_dirt`.
 * 8. **No transcendental maths and no unseeded draw.** Every pattern here is a
 *    pure function of position.
 */

import { PropCounter, type FitOutContext } from "./archetypes-civic.js";

/* -------------------------------------------------------------------------- */
/* the archetypes                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The nine archetypes this file fits out, in catalog order.
 *
 * Spread into `BUILDING_ARCHETYPES` by `archetypes.ts`, straight after the
 * agrarian expansion pack, and mirrored in the same order by the spec
 * package's `KNOWN_BUILDING_ARCHETYPES` — where the order is asserted element
 * by element, so it is load-bearing in both places.
 */
export const FRONTIER_BUILDING_ARCHETYPES = [
  "false_front_saloon",
  "assay_office",
  "stamp_mill",
  "telegraph_office",
  "livery_stable",
  "wagon_shop",
  "mission_church",
  "cantina",
  "dugout_shanty",
] as const;

/** One of the archetypes this file fits out. */
export type FrontierBuildingArchetype = (typeof FRONTIER_BUILDING_ARCHETYPES)[number];

/** True for an archetype this file answers to. */
export function isFrontierArchetype(value: string): value is FrontierBuildingArchetype {
  return (FRONTIER_BUILDING_ARCHETYPES as readonly string[]).includes(value);
}

/**
 * Tag → archetype, or `null` when nothing matches.
 *
 * Consulted immediately after the agrarian expansion table and well before the
 * extended one. This pack claims **only words no earlier table claims**, and
 * the deliberate non-claims are the point of this comment:
 *
 * - bare **`bar`**, **`tavern`**, **`inn`** and **`pub`** are *not* taken. The
 *   tavern is a shipped archetype and the original table reads `inn` off
 *   `trade`; the saloon answers to `saloon`, `false_front`,
 *   `false_front_saloon` and `western_saloon` only;
 * - bare **`church`**, **`chapel`** and **`cathedral`** stay exactly where they
 *   are — a mission is a church *with adobe massing and a bell gable*, so it
 *   takes `mission`, `mission_church` and `adobe_church` and nothing plainer.
 *   **`adobe`** and **`pueblo`** are the regional table's `adobe_pueblo` and
 *   are not touched;
 * - bare **`stable`** is the shipped rural archetype and keeps every document
 *   that says it; the livery takes `livery` and `livery_stable`;
 * - bare **`mill`**, **`sawmill`** and **`windmill`** are somebody else's. The
 *   stamp mill takes `stamp_mill`, `stamp_battery` and `ore_mill`, all
 *   compounds;
 * - **`forge`**, **`smithy`** and **`blacksmith`** belong to the smithy; the
 *   wagon shop takes `wagon_shop`, `wagonwright` and `wheelwright`, which are
 *   the trade's own words and not the smith's;
 * - **`post_office`** and **`bank`** are shipped archetypes and are left
 *   alone; so is **`jail`**, which the institution table already reads as
 *   `prison`, and **`general_store`**, which is a shipped archetype in its own
 *   right. A sheriff's office is therefore *deliberately not claimed by
 *   anything here* — `jail`/`gaol`/`prison` already land somewhere sensible;
 * - **`sod_house`** is an earlier table's; the dugout takes `dugout`,
 *   `dugout_shanty`, `shanty` and `bank_dugout`, and bare **`hut`**,
 *   **`cabin`** and **`shack`** are not claimed;
 * - **`telegraph`** and **`assay`** are words no table had, and both are so
 *   specific to this pack that the bare form is claimed alongside the
 *   compound.
 */
export function frontierArchetypeOfTags(
  tags: readonly string[],
): FrontierBuildingArchetype | null {
  const has = (t: string): boolean => tags.includes(t);
  if (has("saloon") || has("false_front") || has("false_front_saloon") || has("western_saloon")) {
    return "false_front_saloon";
  }
  if (has("assay") || has("assay_office") || has("assayer")) return "assay_office";
  if (has("stamp_mill") || has("stamp_battery") || has("ore_mill")) return "stamp_mill";
  if (has("telegraph") || has("telegraph_office") || has("telegraph_station")) {
    return "telegraph_office";
  }
  if (has("livery") || has("livery_stable")) return "livery_stable";
  if (has("wagon_shop") || has("wagonwright") || has("wheelwright")) return "wagon_shop";
  if (has("mission") || has("mission_church") || has("adobe_church")) return "mission_church";
  if (has("cantina")) return "cantina";
  if (has("dugout") || has("dugout_shanty") || has("shanty") || has("bank_dugout")) {
    return "dugout_shanty";
  }
  return null;
}

/**
 * Facade tendencies for this file's archetypes.
 *
 * Same contract as every other wave's: defaults a caller merges into its
 * params, never something applied over an explicit one.
 *
 * - the **saloon** and the **cantina** are street frontages that want to be
 *   looked into, so both ask for the densest openings the grammar has;
 * - the **assay office**, the **telegraph office** and the **dugout** are the
 *   pack's small rooms and take `single`/`sparse` — a strongbox room with a
 *   wall of glass is not one;
 * - the **stamp mill** and the **livery stable** are sheds: `gable`, tall
 *   openings, because what a shed has instead of windows is a big door;
 * - the **mission church** takes `arched` where the grammar has it and the
 *   sparsest rhythm, which is the deep single door of the catalog note.
 */
export function frontierFacadeDefaults(archetype: string): {
  readonly windowShape?: string;
  readonly windowRhythm?: string;
  readonly roof?: string;
} {
  switch (archetype) {
    case "false_front_saloon":
      return { windowShape: "tall", windowRhythm: "dense", roof: "gable" };
    case "assay_office":
      return { windowShape: "single", windowRhythm: "sparse", roof: "gable" };
    case "stamp_mill":
      return { windowShape: "tall", windowRhythm: "regular", roof: "gable" };
    case "telegraph_office":
      return { windowShape: "single", windowRhythm: "sparse", roof: "gable" };
    case "livery_stable":
      return { windowShape: "tall", windowRhythm: "sparse", roof: "gable" };
    case "wagon_shop":
      return { windowShape: "mullion", windowRhythm: "regular", roof: "gable" };
    case "mission_church":
      return { windowShape: "arched", windowRhythm: "sparse", roof: "gable" };
    case "cantina":
      return { windowShape: "mullion", windowRhythm: "dense", roof: "hip" };
    case "dugout_shanty":
      return { windowShape: "single", windowRhythm: "sparse", roof: "gable" };
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
export function furnishFrontier(ctx: FitOutContext): number {
  if (!isFrontierArchetype(ctx.archetype)) return 0;
  const c = new PropCounter(ctx);
  switch (ctx.archetype) {
    case "false_front_saloon":
      fitSaloon(ctx, c);
      break;
    case "assay_office":
      fitAssayOffice(ctx, c);
      break;
    case "stamp_mill":
      fitStampMill(ctx, c);
      break;
    case "telegraph_office":
      fitTelegraphOffice(ctx, c);
      break;
    case "livery_stable":
      fitLiveryStable(ctx, c);
      break;
    case "wagon_shop":
      fitWagonShop(ctx, c);
      break;
    case "mission_church":
      fitMissionChurch(ctx, c);
      break;
    case "cantina":
      fitCantina(ctx, c);
      break;
    case "dugout_shanty":
    default:
      fitDugout(ctx, c);
      break;
  }
  return c.n;
}

/* -------------------------------------------------------------------------- */
/* the shared helpers                                                          */
/* -------------------------------------------------------------------------- */

/**
 * How many courses of clear air this storey actually has.
 *
 * On one floor the room runs to the eave plate; on more than one it stops at
 * the boards over it, and a fit-out that measured the first and built into the
 * second would put its shelves through somebody's floor.
 */
function headroomOf(ctx: FitOutContext): number {
  return ctx.floors > 1 ? ctx.storyHeight - 1 : ctx.wallTop - 1;
}

/** The default properties of a fence post standing on its own. */
const POST: Record<string, string> = {
  east: "false",
  north: "false",
  south: "false",
  waterlogged: "false",
  west: "false",
};

/** A closed barrel, the one cargo block every wave here uses. */
const BARREL: Record<string, string> = { facing: "up", open: "false" };

/** A bottom slab, standing on whatever is under it. */
const SLAB: Record<string, string> = { type: "bottom", waterlogged: "false" };

/** A run of bars along z — the counter grille, the wire and the wheel. */
const BARS_Z: Record<string, string> = {
  east: "false",
  north: "true",
  south: "true",
  waterlogged: "false",
  west: "false",
};

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

/** The end wall furthest from the door — where every fit-out here puts its head. */
function backZ(ctx: FitOutContext): number {
  const it = ctx.interior;
  if (ctx.door === null) return it.z0;
  return ctx.door.z > (it.z0 + it.z1) / 2 ? it.z0 : it.z1;
}

/**
 * The **safe glow** every room in this pack is lit by: glowstone at floor
 * level with a solid cap over it.
 *
 * Never a block whose name ends `lantern` — that is the lint's own rule — and
 * the cap goes at `y = 2` **over the glowstone itself**, so the support chain
 * runs to the floor whatever the wall behind is doing at that height.
 */
function glow(c: PropCounter, x: number, z: number, cap: string, head: number): boolean {
  if (!c.put1(x, z, "glowstone")) return false;
  if (head >= 3) c.stack(x, z, 2, cap);
  return true;
}

/* -------------------------------------------------------------------------- */
/* the saloon                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * `false_front_saloon` — the bar room.
 *
 * The **long bar** runs down one long wall, a solid counter of dressed timber
 * with the kegs stood at its ends, and the **back bar** is the glow set into
 * the end wall with the bottle shelf over it. The other long wall carries the
 * **tables** — slabs, so a body can still stand where one is — and the corner
 * by the door carries the piano. The middle of the floor is left completely
 * empty, which is what a room built for standing at a bar actually looks like.
 */
function fitSaloon(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const counter = style["wall.frame"] as string;
  const stone = style["foundation.accent"] as string;
  const slab = style["stone.slab"] as string;
  const seat = style["stair.interior"] as string;
  const head = headroomOf(ctx);
  const back = backZ(ctx);
  const front = back === it.z0 ? it.z1 : it.z0;

  // The back bar: the glow in the end wall's best bay, the bottle shelf over
  // it and a cabinet either side of it.
  const bayX = bayOn(ctx, back, 1) ?? bayOn(ctx, back, 0);
  if (bayX !== null) {
    glow(c, bayX, back, stone, head);
    for (const x of [bayX - 1, bayX + 1]) {
      if (x < it.x0 || x > it.x1) continue;
      if (c.put1(x, back, counter) && head >= 3) c.stack(x, back, 2, slab, SLAB);
    }
  }

  // The long bar, down one long wall, with a break in it so the barman can get
  // behind — and so the counter never reads as a second wall.
  const barX = it.x0;
  const gapZ = Math.floor((it.z0 + it.z1) / 2);
  for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
    if (z === gapZ) continue;
    c.put1(barX, z, counter);
  }

  // The kegs at the bar's ends and the spittoon by the door.
  c.put1(barX, it.z0, "barrel", BARREL);
  c.put1(barX, it.z1, "barrel", BARREL);
  c.put1(it.x1, front, "cauldron");

  // The tables down the other wall, one cell each, on the slab argument.
  for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
    if ((z - it.z0) % 2 === 1) {
      c.put1(it.x1, z, slab, SLAB);
      continue;
    }
    c.put1(it.x1, z, seat, {
      facing: seatFacing(it, it.x1, z),
      half: "bottom",
      shape: "straight",
    });
  }

  // The piano, in the corner away from the bar.
  c.put1(it.x1, back, "note_block");
}

/* -------------------------------------------------------------------------- */
/* the assay office                                                            */
/* -------------------------------------------------------------------------- */

/**
 * `assay_office` — the room the gold is weighed in, and the pack's most
 * defended one.
 *
 * The **barred counter** runs down one long wall: a solid counter with the
 * grille standing on it, which is a run of `iron_bars` at `y = 2` over the
 * counter's own blocks and therefore supported from the floor. The **furnace**
 * and the **scales** are at the head of the room either side of the glow, and
 * the **strongbox** is a barrel in the corner furthest from the door — which
 * is where a strongbox goes.
 */
function fitAssayOffice(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const counter = style["wall.frame"] as string;
  const stone = style["foundation.accent"] as string;
  const head = headroomOf(ctx);
  const back = backZ(ctx);

  const bayX = bayOn(ctx, back, 1) ?? bayOn(ctx, back, 0);
  if (bayX !== null) {
    glow(c, bayX, back, stone, head);
    if (bayX - 1 >= it.x0) c.put1(bayX - 1, back, "blast_furnace", { facing: "south", lit: "false" });
    if (bayX + 1 <= it.x1) c.put1(bayX + 1, back, "smithing_table");
  }

  // The counter, with the grille standing on it.
  const gapZ = Math.floor((it.z0 + it.z1) / 2);
  for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
    if (z === gapZ) continue;
    if (!c.put1(it.x0, z, counter)) continue;
    if (head >= 3) c.stack(it.x0, z, 2, "iron_bars", BARS_Z);
  }

  // The strongbox and the ore trays, along the other wall.
  const front = back === it.z0 ? it.z1 : it.z0;
  c.put1(it.x1, back, "barrel", BARREL);
  c.put1(it.x1, front, "cauldron");
}

/* -------------------------------------------------------------------------- */
/* the stamp mill                                                              */
/* -------------------------------------------------------------------------- */

/**
 * `stamp_mill` — the loudest building on the frontier.
 *
 * The catalog note's stepping down a slope is the *shell's* and the terrace
 * engine's business; what a fit-out can honour is the sequence inside, and it
 * does, along the room's length: the **ore bin** at the head, a row of
 * barrels; the **battery** down one long wall, the stamps standing as iron
 * over their own bedplates; and the **shaking tables** down the other, slabs a
 * body can walk over. The aisle between them is the whole width of the room
 * minus its two wall rows, which is what keeps an XL shed one walkable region.
 */
function fitStampMill(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const stone = style["foundation.accent"] as string;
  const slab = style["stone.slab"] as string;
  const head = headroomOf(ctx);
  const back = backZ(ctx);

  // The ore bin, across the head of the room.
  const bayX = bayOn(ctx, back, 1) ?? bayOn(ctx, back, 0);
  if (bayX !== null) {
    glow(c, bayX, back, stone, head);
    for (const x of [bayX - 1, bayX + 1]) {
      if (x < it.x0 || x > it.x1) continue;
      c.put1(x, back, "barrel", BARREL);
    }
  }

  // The battery: a bedplate of dressed stone with the stamp standing on it.
  // Every stamp is over its own bedplate, so nothing here leans on the wall.
  for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
    if ((z - it.z0) % 2 !== 1) continue;
    if (!c.put1(it.x0, z, stone)) continue;
    if (head >= 3) c.stack(it.x0, z, 2, "iron_block");
  }

  // The shaking tables, down the other wall.
  for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
    c.put1(it.x1, z, slab, SLAB);
  }

  // The water butt at the foot of the run.
  const front = back === it.z0 ? it.z1 : it.z0;
  c.put1(it.x0, front, "cauldron");
}

/* -------------------------------------------------------------------------- */
/* the telegraph office                                                        */
/* -------------------------------------------------------------------------- */

/**
 * `telegraph_office` — one room and one job.
 *
 * The **key desk** is a slab under the window on a long wall with the
 * operator's chair beside it; the **wire** comes down the wall behind the desk
 * as a run of `iron_bars` standing on the desk's own block, because a wire
 * drawn hanging in the air is the floating rule with a story attached. The
 * message rack and the stove are at the head of the room either side of the
 * glow.
 */
function fitTelegraphOffice(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const desk = style["wall.frame"] as string;
  const stone = style["foundation.accent"] as string;
  const seat = style["stair.interior"] as string;
  const head = headroomOf(ctx);
  const back = backZ(ctx);

  const bayX = bayOn(ctx, back, 1) ?? bayOn(ctx, back, 0);
  if (bayX !== null) {
    glow(c, bayX, back, stone, head);
    if (bayX - 1 >= it.x0) c.put1(bayX - 1, back, "smoker", { facing: "south", lit: "false" });
    if (bayX + 1 <= it.x1) c.put1(bayX + 1, back, "barrel", BARREL);
  }

  // The key desk, with the wire coming down onto it.
  const deskZ = Math.floor((it.z0 + it.z1) / 2);
  if (c.put1(it.x0, deskZ, desk) && head >= 3) c.stack(it.x0, deskZ, 2, "iron_bars", BARS_Z);
  if (deskZ + 1 <= it.z1) {
    c.put1(it.x0, deskZ + 1, seat, {
      facing: seatFacing(it, it.x0, deskZ + 1),
      half: "bottom",
      shape: "straight",
    });
  }
  if (deskZ - 1 >= it.z0) c.put1(it.x0, deskZ - 1, "cartography_table");

  // The counter the public stands at, down the other wall.
  for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
    if ((z - it.z0) % 3 === 0) continue;
    c.put1(it.x1, z, desk);
  }
}

/* -------------------------------------------------------------------------- */
/* the livery stable                                                           */
/* -------------------------------------------------------------------------- */

/**
 * `livery_stable` — wide doors both ends and an aisle straight through.
 *
 * The **stalls** are hurdles of fence down both long walls with the manger —
 * a bale of hay — at the head of each; the **loft** is a run of slabs at
 * `y = 2` over the mangers on one side only, which is what a hay door in one
 * gable actually implies. The aisle itself is untouched from end to end,
 * because a livery whose aisle is blocked is a livery no rig ever left.
 */
function fitLiveryStable(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const fence = style["wall.fence"] as string;
  const stone = style["foundation.accent"] as string;
  const head = headroomOf(ctx);
  const back = backZ(ctx);

  const bayX = bayOn(ctx, back, 0);
  if (bayX !== null) glow(c, bayX, back, stone, head);

  // The stalls: a hurdle post, then the manger, all the way down both walls.
  for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
    const k = (z - it.z0) % 3;
    if (k === 1) {
      c.put1(it.x0, z, fence, POST);
      c.put1(it.x1, z, fence, POST);
      continue;
    }
    if (k !== 2) continue;
    // The manger, and the loft boards over the one on the loft side.
    if (c.put1(it.x0, z, "hay_block", { axis: "y" }) && head >= 3) {
      c.stack(it.x0, z, 2, style["stone.slab"] as string, SLAB);
    }
    c.put1(it.x1, z, "hay_block", { axis: "y" });
  }

  // The water trough and the tack barrel, by the way in.
  const front = back === it.z0 ? it.z1 : it.z0;
  c.put1(it.x0, front, "cauldron");
  c.put1(it.x1, front, "barrel", BARREL);
}

/* -------------------------------------------------------------------------- */
/* the wagon shop                                                              */
/* -------------------------------------------------------------------------- */

/**
 * `wagon_shop` — half a wagon on trestles and the wheels up on the wall.
 *
 * The **wheels** are `iron_bars` at `y = 2` standing on the workbench blocks
 * under them: a wheel hung on a wall with nothing under it is the floating
 * rule, and a wheel over its own bench is a wheel leaning where a wheelwright
 * leans one. The **forge** is at the head of the room with the glow in it, and
 * the **wagon** is a pair of slabs on the axis of the other wall — trestles a
 * body can walk over.
 */
function fitWagonShop(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const bench = style["wall.frame"] as string;
  const stone = style["foundation.accent"] as string;
  const slab = style["stone.slab"] as string;
  const head = headroomOf(ctx);
  const back = backZ(ctx);

  const bayX = bayOn(ctx, back, 1) ?? bayOn(ctx, back, 0);
  if (bayX !== null) {
    glow(c, bayX, back, stone, head);
    if (bayX - 1 >= it.x0) c.put1(bayX - 1, back, "blast_furnace", { facing: "south", lit: "false" });
    if (bayX + 1 <= it.x1) c.put1(bayX + 1, back, "smithing_table");
  }

  // The bench down one wall, with the wheels over it.
  for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
    if (!c.put1(it.x0, z, bench)) continue;
    if (head >= 3 && (z - it.z0) % 2 === 1) c.stack(it.x0, z, 2, "iron_bars", BARS_Z);
  }

  // The wagon on its trestles, down the other wall.
  for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
    if ((z - it.z0) % 3 === 0) {
      c.put1(it.x1, z, "barrel", BARREL);
      continue;
    }
    c.put1(it.x1, z, slab, SLAB);
  }
}

/* -------------------------------------------------------------------------- */
/* the mission church                                                          */
/* -------------------------------------------------------------------------- */

/**
 * `mission_church` — adobe massing, a deep single door, and a plain room.
 *
 * The bell gable is the shell's; inside, the **altar** stands at the head of
 * the room with the glow in it and the two candlestands either side, and the
 * **benches** run down both long walls facing in. Nothing crosses the floor,
 * because a mission nave is a walk from the door to the altar and this file
 * refuses to interrupt it.
 */
function fitMissionChurch(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const stone = style["foundation.accent"] as string;
  const slab = style["stone.slab"] as string;
  const seat = style["stair.interior"] as string;
  const head = headroomOf(ctx);
  const back = backZ(ctx);

  // The altar: the glow in the middle of the head wall with the mensa over it,
  // and the dressed stone either side of it.
  const bayX = bayOn(ctx, back, 1) ?? bayOn(ctx, back, 0);
  if (bayX !== null) {
    if (c.put1(bayX, back, "glowstone") && head >= 3) c.stack(bayX, back, 2, slab, SLAB);
    for (const x of [bayX - 1, bayX + 1]) {
      if (x < it.x0 || x > it.x1) continue;
      if (c.put1(x, back, stone) && head >= 3) c.stack(x, back, 2, stone);
    }
  }

  // The benches, down both walls, facing the middle of the room.
  for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
    if ((z - it.z0) % 3 === 0) continue;
    for (const x of [it.x0, it.x1]) {
      c.put1(x, z, seat, {
        facing: seatFacing(it, x, z),
        half: "bottom",
        shape: "straight",
      });
    }
  }

  // The font by the way in.
  const front = back === it.z0 ? it.z1 : it.z0;
  c.put1(it.x0, front, "cauldron");
}

/* -------------------------------------------------------------------------- */
/* the cantina                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * `cantina` — the saloon's southern cousin, and a smaller room.
 *
 * A **plain bar** across the head of the room rather than down its side, the
 * glow set into the back of it; the **jars** — terracotta, which is the one
 * palette-independent thing this pack says out loud — stand on the shelf over
 * the bar; and a run of low stools down one wall. The shaded arcade of the
 * catalog note is a *facade*, and is left to the shell.
 */
function fitCantina(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const counter = style["wall.frame"] as string;
  const stone = style["foundation.accent"] as string;
  const seat = style["stair.interior"] as string;
  const head = headroomOf(ctx);
  const back = backZ(ctx);

  // The bar, across the head wall, with a jar on every second block of it.
  const gapX = Math.floor((it.x0 + it.x1) / 2);
  for (let x = it.x0; x <= it.x1; x++) {
    if (x === gapX) {
      glow(c, x, back, stone, head);
      continue;
    }
    if (!c.put1(x, back, counter)) continue;
    if (head >= 3 && (x - it.x0) % 2 === 0) c.stack(x, back, 2, "terracotta");
  }

  // The stools down one wall, and the water jar by the door.
  for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
    if ((z - it.z0) % 2 === 0) continue;
    c.put1(it.x0, z, seat, {
      facing: seatFacing(it, it.x0, z),
      half: "bottom",
      shape: "straight",
    });
  }
  const front = back === it.z0 ? it.z1 : it.z0;
  c.put1(it.x1, front, "cauldron");
  c.put1(it.x1, back, "barrel", BARREL);
}

/* -------------------------------------------------------------------------- */
/* the dugout                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * `dugout_shanty` — one room cut back into a bank.
 *
 * The **bank** is the earth banked against the wall away from the door:
 * `coarse_dirt` and `rooted_dirt`, never `mud`, which is 15/16 of a block and
 * cannot be stood on. Against it: the **stove**, the **bunk** — a slab, so the
 * cell it stands in is still a cell — and the one shelf the room has. The turf
 * roof is the shell's.
 */
function fitDugout(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const stone = style["foundation.accent"] as string;
  const slab = style["stone.slab"] as string;
  const head = headroomOf(ctx);
  const back = backZ(ctx);

  // The bank, along the head wall — a pattern, not a draw, so it repeats.
  for (let x = it.x0; x <= it.x1; x++) {
    const k = (x * 5 + back * 13 + 7) % 3;
    c.put1(x, back, k === 0 ? "rooted_dirt" : "coarse_dirt");
  }

  // The stove, in the corner of the bank away from the door.
  const stoveZ = back === it.z0 ? it.z0 + 1 : it.z1 - 1;
  if (stoveZ > it.z0 && stoveZ < it.z1) {
    c.put1(it.x0, stoveZ, "smoker", { facing: "east", lit: "false" });
    glow(c, it.x1, stoveZ, stone, head);
  }

  // The bunk, down the wall opposite the stove.
  for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
    if ((z - it.z0) % 2 === 0) continue;
    if (c.put1(it.x1, z, slab, SLAB) && head >= 3 && (z - it.z0) % 4 === 1) {
      c.stack(it.x1, z, 2, slab, SLAB);
    }
  }

  // The bucket and the crate by the way in.
  const front = back === it.z0 ? it.z1 : it.z0;
  c.put1(it.x0, front, "cauldron");
  c.put1(it.x1, front, "barrel", BARREL);
}
