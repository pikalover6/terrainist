/**
 * Archetype breadth, **wave six A** — transport buildings.
 *
 * `archetypes-blitz.ts` states the design law every file in this family obeys
 * and it is restated nowhere: **an archetype is a fit-out, not a second
 * grammar.** A fit-out runs after every shape stage — foundation, walls,
 * windows, floors, roof, chimney — and writes into the same cell map they did,
 * where a later write to a cell replaces an earlier one. So a train station is
 * the house shell with a rail run laid down one wall row and benches down the
 * other; a roundhouse is the same shell with rail stubs off its head wall and
 * a painted inspection pit between them; an airport terminal is the school's
 * bank of rows with a check-in counter instead of a lectern. None of them is a
 * new shell.
 *
 * Twelve buildings, in four groups:
 *
 * - **rail** — `train_station`, `signal_box`, `roundhouse`;
 * - **road** — `coach_house`, `toll_house`, `transit_hub`;
 * - **air** — `control_tower`, `airport_terminal`;
 * - **water and the odd one out** — `boathouse`, `shipyard`, `lighthouse`,
 *   `climbing_wall`.
 *
 * ## Why these are buildings at all
 *
 * Eleven of the twelve sit in catalog groups whose default `kind` is `prop`
 * (`transport-land`, `transport-water`, `transport-air`). They are implemented
 * here as *building* archetypes — a station is a shell with a room in it, not
 * a model dropped on the ground — so each of those eleven carries a
 * `kind: "building"` override in its catalog entry, which is the curtain
 * wall's precedent used the other way round.
 *
 * ## The field lessons this file was written against
 *
 * Every one of these is a rule below rather than a comment:
 *
 * - a **stair's `facing` is its high half** — the backrest. Every waiting
 *   bench, departure row and bay seat therefore carries the cardinal pointing
 *   *away* from what its sitter looks at;
 * - a bare `flower_pot` renders **empty**; {@link pottedAt} (wave two's,
 *   imported rather than re-derived) picks a `potted_*` from position;
 * - the shell hangs a lantern over the **middle column** at head height, so
 *   **nothing this file writes stands at `y = 2` over an open floor cell**.
 *   Racks, bars and ledges are written through {@link PropCounter}, whose
 *   headroom guard refuses the second course of a three-course storey outright,
 *   and the ones that are meant to read as shelving are asked for only when
 *   `storyHeight >= 4` and over a cell something already occupies;
 * - the trestle idiom (a fence with a plate on it) is refused by the stack
 *   guard under a three-course storey, so {@link table} switches to a slab;
 * - **width-1 circulation stays clear of body-blockers**, and a standable —
 *   a bench, a ledge — needs headroom for the body that mounts it;
 * - **no sign blocks.** A departure board, a route map and a toll rate are all
 *   banners, and a banner beside an unmountable platform is a **wall** banner;
 * - **fluids are a cauldron or the boxed pool.** The boathouse slip is the
 *   bathhouse's predicate verbatim — written into the floor plane at `y = 0`,
 *   inset one cell from the interior on every side, so under every water cell
 *   is the foundation skirt and beside every water cell is pool or written
 *   floor — and nothing else here writes a fluid at all;
 * - **apron props are grounded**: {@link apronPost} fills `y = 0` when the
 *   apron cell has nothing under it, so the toll barrier's posts are never
 *   floating columns, and no apron prop ever stands on the doorstep;
 * - a rebuilt roof ends in a **solid** cap and a single-block topper — the
 *   lighthouse's lamp, the control tower's dish — stands on a **continuous
 *   column** raised from that cap (the turret lesson);
 * - **no `chain`** — it is missing from the pinned 1.21.11 block table; a
 *   hanging run is `iron_bars` or a wall trapdoor. No plain `mud` in a floor
 *   plane either (its hitbox is sub-full): `packed_mud`. A torch brackets only
 *   to a full block, never to glazing.
 */

import type { Cardinal, LocalRect } from "./core.js";
import {
  PropCounter,
  ROOF_FLOURISH_RISE,
  type FitOutContext,
  roofPlan,
  wallPlan,
  type RebuildPlan,
} from "./archetypes-civic.js";
import { pottedAt } from "./archetypes-wave2.js";
import { buildingIdFromTags, defineBuildingDescriptors } from "./descriptor.js";

/* -------------------------------------------------------------------------- */
/* the archetypes                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The twelve archetypes this file fits out, in catalog order.
 *
 * Spread into `BUILDING_ARCHETYPES` by `archetypes.ts`: rail first, then road,
 * then air, then the water three and the climbing wall.
 */
export const TERMINUS_BUILDING_ARCHETYPES = [
  "train_station",
  "signal_box",
  "roundhouse",
  "coach_house",
  "toll_house",
  "transit_hub",
  "control_tower",
  "airport_terminal",
  "boathouse",
  "shipyard",
  "lighthouse",
  "climbing_wall",
] as const;

/** One of the archetypes this file fits out. */
export type TerminusBuildingArchetype = (typeof TERMINUS_BUILDING_ARCHETYPES)[number];

/** True for an archetype this file answers to. */
export function isTerminusArchetype(value: string): value is TerminusBuildingArchetype {
  return (TERMINUS_BUILDING_ARCHETYPES as readonly string[]).includes(value);
}

/**
 * Tag → archetype, or `null` when nothing matches.
 *
 * Consulted after wave 5B's commerce table and *before* the extended table,
 * for the reason every later wave sits there: the tables under it are greedy.
 * Every near miss below is deliberate, and each one would otherwise have been
 * a silent theft:
 *
 * - bare **`station` is free and is claimed here**, by the train station. Wave
 *   5D deliberately left it: its own two are compounds
 *   (`weather_station`/`met_station`, `field_station`/`research_station`) and
 *   its module docs say in as many words that a railway station stays free to
 *   claim the bare word later. This is that later;
 * - **`roundhouse` is free too.** Wave three's `thatched_roundhouse` answers
 *   to `thatched_roundhouse` and `wattle` only, and its module docs name bare
 *   `roundhouse` as "an unimplemented catalog id — an *engine* roundhouse,
 *   which is a locomotive shed and not a hut". So this id takes `roundhouse`,
 *   and `engine_shed` and `engine_roundhouse` beside it;
 * - **`tower` is the watchtower's** and `tower_block` the tall grammar's, so
 *   the control tower answers to `control_tower` and `air_traffic_control` and
 *   never to bare `tower`;
 * - **`beacon`, `beacon_spire` and `beacon_tower` are claimed** — the fantasy
 *   track's spire and wave 5A's tower — so the lighthouse takes `lighthouse`
 *   and `pharos` and reaches for no beacon word at all;
 * - `depot` is the **warehouse's**, so the transit hub takes `transit_hub`,
 *   `bus_station` and bare `hub` (which nothing claims);
 * - `terminal` and `airport` are unclaimed and go to the terminal; `dock`,
 *   `wharf` and `slip` are left alone for the catalog's quay and slipway, so
 *   the shipyard takes `shipyard` and `drydock` and the boathouse `boathouse`
 *   and `boat_shed`;
 * - `gym` is the blitz gym's and `climbing` alone is too broad, so the wall is
 *   `climbing_wall` and `bouldering`.
 */
function terminusArchetypeOfTags(
  tags: readonly string[],
): TerminusBuildingArchetype | null {
  return buildingIdFromTags(TERMINUS_BUILDING_DESCRIPTORS, tags);
}

/**
 * Facade tendencies for this file's archetypes.
 *
 * Same contract as every other wave's: defaults a caller merges into its
 * params, never something applied over an explicit one.
 */
export function terminusFacadeDefaults(
  archetype: string,
): { readonly windowShape?: string; readonly windowRhythm?: string; readonly roof?: string } {
  switch (archetype) {
    // A platform hall is a shed with a lot of glass in its ends.
    case "train_station":
      return { windowShape: "mullion", windowRhythm: "dense", roof: "gable" };
    // The signalman looks out of every side of the box: that *is* the box.
    case "signal_box":
      return { windowShape: "mullion", windowRhythm: "dense", roof: "hip" };
    // An engine shed is doors and roof; the openings are incidental.
    case "roundhouse":
      return { windowShape: "single", windowRhythm: "sparse", roof: "gable" };
    case "coach_house":
      return { windowShape: "single", windowRhythm: "sparse", roof: "gable" };
    case "toll_house":
      return { windowShape: "single", windowRhythm: "regular", roof: "hip" };
    // The shelter grown up: as open as walls allow.
    case "transit_hub":
      return { windowShape: "mullion", windowRhythm: "dense", roof: "flat" };
    // The glazed top level is the whole read. The roof is asked for as a
    // **hip** and not a flat, even though what gets built up there is a deck:
    // a flat roof leaves one course above the plate, `roofPlan` refuses that,
    // and the tower would lose its deck and its radar altogether. Wave 5D's
    // domes ask for the same shape for the same reason — the rebuild replaces
    // whatever the shell put there.
    case "control_tower":
      return { windowShape: "tall", windowRhythm: "dense", roof: "hip" };
    case "airport_terminal":
      return { windowShape: "mullion", windowRhythm: "dense", roof: "flat" };
    // A boat hall: high openings, broad roof, water underneath.
    case "boathouse":
      return { windowShape: "tall", windowRhythm: "regular", roof: "gable" };
    case "shipyard":
      return { windowShape: "tall", windowRhythm: "sparse", roof: "gable" };
    // The shaft is rebuilt above the plate anyway; ask for the shape that
    // leaves the most room in the air over it.
    case "lighthouse":
      return { windowShape: "single", windowRhythm: "sparse", roof: "hip" };
    case "climbing_wall":
      return { windowShape: "tall", windowRhythm: "paired", roof: "gable" };
    default:
      return {};
  }
}

/* -------------------------------------------------------------------------- */
/* the exterior plan                                                           */
/* -------------------------------------------------------------------------- */

/** Blocks a re-clad may never overwrite: the way in, the way up, the fire, the lights. */
const KEEP_AS_IS =
  /(_door$|^ladder$|^campfire$|_sign$|torch$|^bell$|glass|_pane$|lantern$|banner$)/;

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

/** The step of a cardinal, as `[dx, dz]`. */
function step(facing: Cardinal): readonly [number, number] {
  switch (facing) {
    case "north":
      return [0, -1];
    case "south":
      return [0, 1];
    case "east":
      return [1, 0];
    default:
      return [-1, 0];
  }
}

/**
 * The cell a player stands in to open the door, or `null` when there is none.
 *
 * The one apron cell nothing in this file may ever fill. The physics lint walks
 * a building **from its door**; a barrier post on the doorstep is a building
 * with no way in.
 */
function outsideDoor(ctx: FitOutContext): { readonly x: number; readonly z: number } | null {
  if (ctx.door === null) return null;
  const [dx, dz] = step(ctx.door.face);
  return { x: ctx.door.x + dx, z: ctx.door.z + dz };
}

/**
 * Write a block on a wall-ring cell, unless what stands there is load-bearing.
 *
 * Returns whether it landed, so a caller's count is the count of cells it
 * actually changed rather than the count it looked at.
 */
function clad(ctx: FitOutContext, x: number, y: number, z: number, block: string): boolean {
  const standing = ctx.blockAt(x, y, z);
  if (standing !== undefined && KEEP_AS_IS.test(standing.block)) return false;
  ctx.put(x, y, z, block);
  return true;
}

/** Re-clad the whole wall ring between two courses, from a position function. */
function reclad(
  ctx: FitOutContext,
  plan: RebuildPlan,
  yFrom: number,
  yTo: number,
  block: (x: number, y: number, z: number) => string,
): number {
  let n = 0;
  for (const cell of ringOf(plan.sx, plan.sz)) {
    for (let y = yFrom; y <= yTo; y++) {
      if (clad(ctx, cell.x, y, cell.z, block(cell.x, y, cell.z))) n++;
    }
  }
  return n;
}

/**
 * Clear everything the shell built above the eave plate, apron included.
 *
 * Two courses past `top` as well, for the chimney corbel and its chimney-pot
 * campfire: a replacement roof that cleared only to its own ceiling would leave
 * a fire burning over the ridge it deleted.
 */
function clearRoof(ctx: FitOutContext, plan: RebuildPlan): void {
  for (let y = plan.base; y <= plan.top + 2; y++) {
    for (let x = -1; x <= plan.sx; x++) {
      for (let z = -1; z <= plan.sz; z++) ctx.put(x, y, z, "air");
    }
  }
}

/** Fill an inclusive rect at one Y. */
function slabRect(
  ctx: FitOutContext,
  y: number,
  x0: number,
  x1: number,
  z0: number,
  z1: number,
  block: string,
  props?: Record<string, string>,
): void {
  for (let z = z0; z <= z1; z++) {
    for (let x = x0; x <= x1; x++) ctx.put(x, y, z, block, props);
  }
}

/**
 * A flat deck at the course above the ceiling plane, with a parapet on it.
 *
 * Wave 5D's terrace, restated at this seam. The deck is a **solid** course over
 * the whole footprint, so the parapet — and anything else that goes up there —
 * has something under it everywhere it stands.
 */
function terrace(
  ctx: FitOutContext,
  plan: RebuildPlan,
  deck: string,
  parapet: (x: number, z: number) => { readonly block: string; readonly height: number },
): number {
  let n = 0;
  slabRect(ctx, plan.base, 0, plan.sx - 1, 0, plan.sz - 1, deck);
  n += plan.sx * plan.sz;
  for (const cell of ringOf(plan.sx, plan.sz)) {
    const wall = parapet(cell.x, cell.z);
    for (let h = 1; h <= wall.height; h++) {
      const y = plan.base + h;
      if (y > plan.top) break;
      ctx.put(cell.x, y, cell.z, wall.block);
      n++;
    }
  }
  return n;
}

/**
 * A single-block topper on a **continuous column** raised from a solid deck.
 *
 * The turret lesson, as a function: a mast, a dish or a lamp with air under it
 * is a floating block, and the lint's support-chain rule is right to refuse it.
 * The column is written solid from `base + 1` up to one course under the
 * topper, and the topper stands on its head.
 */
function mast(
  ctx: FitOutContext,
  c: PropCounter,
  plan: RebuildPlan,
  x: number,
  z: number,
  column: string,
  topper: string,
  props?: Record<string, string>,
): void {
  let y = plan.base + 1;
  for (; y <= plan.top - 1; y++) c.raw(x, y, z, column);
  c.raw(x, y, z, topper, props);
}

/**
 * A post in the apron, grounded.
 *
 * The stilt lesson: an apron cell may have nothing under it, and a post that
 * starts at `y = 1` there is a column standing on air. Filling `y = 0` first
 * closes the gap.
 */
function apronPost(
  ctx: FitOutContext,
  c: PropCounter,
  x: number,
  z: number,
  block: string,
  toY: number,
): void {
  if (ctx.blockAt(x, 0, z) === undefined) c.raw(x, 0, z, block);
  for (let y = 1; y <= toY; y++) c.raw(x, y, z, block);
}

/* -------------------------------------------------------------------------- */
/* interior primitives                                                         */
/* -------------------------------------------------------------------------- */

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

/**
 * The end of the room furthest from the door.
 *
 * The ticket counter, the check-in run, the toll window and the lever bank are
 * all the same idea: the thing you walk *towards*. Returns the z of that end
 * and the cardinal a person standing in the room faces to look at it.
 */
function farEnd(ctx: FitOutContext): { readonly z: number; readonly look: Cardinal } {
  const it = ctx.interior;
  const north = ctx.door === null ? true : ctx.door.z > (it.z0 + it.z1) / 2;
  return north ? { z: it.z0, look: "north" } : { z: it.z1, look: "south" };
}

/** The middle column of the room — where the shell hangs its lantern. */
function lanternColumn(it: LocalRect): { readonly x: number; readonly z: number } {
  return { x: Math.floor((it.x0 + it.x1) / 2), z: Math.floor((it.z0 + it.z1) / 2) };
}

/**
 * One table cell, by the idiom the storey has headroom for.
 *
 * Wave two's rule, unchanged: the trestle — a fence stem with a plate on it —
 * is two blocks in one column, and under a three-course storey the second is
 * refused by the stack guard as an `interior.blocked_column`, leaving a bare
 * fence post that reads as a bollard. A top slab is one block at table height.
 */
function table(ctx: FitOutContext, c: PropCounter, x: number, z: number): boolean {
  if (ctx.storyHeight < 4) {
    return c.put1(x, z, ctx.style["stone.slab"] as string, { type: "top", waterlogged: "false" });
  }
  if (!c.put1(x, z, ctx.style["wall.fence"] as string)) return false;
  c.stack(x, z, 2, "oak_pressure_plate", { powered: "false" });
  return true;
}

/**
 * A bank of rows facing the far end — the school's discipline, imported by copy.
 *
 * Three constraints are built in, and every one of them came back from a
 * walkthrough: a **three-column aisle** centred on the lantern column, a
 * **one-cell clear lane** around the whole field inside the walls — which is
 * why no fit-out here lays a bank *and* fills its side wall rows — and
 * **alternate rows only**, so a body can get out of a row without climbing the
 * next one.
 */
function bankCells(
  ctx: FitOutContext,
  end: { readonly z: number; readonly look: Cardinal },
  startGap = 2,
  stride = 2,
): { readonly x: number; readonly z: number; readonly row: number }[] {
  const it = ctx.interior;
  const lamp = lanternColumn(it);
  const aisle0 = Math.max(it.x0, lamp.x - 1);
  const aisle1 = Math.min(it.x1, lamp.x + 1);
  const dir = end.look === "north" ? 1 : -1;
  const out: { x: number; z: number; row: number }[] = [];
  for (let k = startGap, row = 0; ; k += stride, row++) {
    const z = end.z + dir * k;
    if (z < it.z0 + 1 || z > it.z1 - 1) break;
    for (let x = it.x0 + 1; x <= it.x1 - 1; x++) {
      if (x >= aisle0 && x <= aisle1) continue;
      out.push({ x, z, row });
    }
  }
  return out;
}

/**
 * A bank of seats, flat, every one of them turned away from the thing it
 * looks at.
 *
 * Flat and not raked, deliberately: a riser is a stair a body stands *on*, and
 * a stander needs `floors < 2 || storyHeight >= 4`.
 */
function seatBank(
  ctx: FitOutContext,
  c: PropCounter,
  end: { readonly z: number; readonly look: Cardinal },
  startGap = 2,
): number {
  const seat = ctx.style["stair.interior"] as string;
  // THE SEAT RULE: `facing` names the stair's high half — the backrest — so a
  // seat looking at the counter carries the cardinal pointing *away* from it.
  const backrest = opposite(end.look);
  let n = 0;
  for (const cell of bankCells(ctx, end, startGap)) {
    if (c.put1(cell.x, cell.z, seat, { facing: backrest, half: "bottom", shape: "straight" })) {
      n++;
    }
  }
  return n;
}

/**
 * Recolour the floor plane over an inclusive rect.
 *
 * A carpet is a block at `y = 1`, which costs the room a walkable cell for
 * every cell of rug; the floor plane costs nothing and reads the same from a
 * standing eye. Every platform edge, inspection pit, crash mat and apron band
 * in this file is written this way — and never with plain `mud`, whose hitbox
 * is short of a full block: `packed_mud`.
 */
function floorPaint(
  ctx: FitOutContext,
  rect: LocalRect,
  block: (x: number, z: number) => string | null,
): number {
  let n = 0;
  for (let z = rect.z0; z <= rect.z1; z++) {
    for (let x = rect.x0; x <= rect.x1; x++) {
      const b = block(x, z);
      if (b === null) continue;
      ctx.put(x, 0, z, b);
      n++;
    }
  }
  return n;
}

/** True when a bench, which is a step a body mounts, has room for the body. */
function benchHeadroom(ctx: FitOutContext): boolean {
  return ctx.floors < 2 || ctx.storyHeight >= 4;
}

/** A wall banner on the interior face of the far wall, above every head. */
function wallBanner(
  ctx: FitOutContext,
  c: PropCounter,
  x: number,
  end: { readonly z: number; readonly look: Cardinal },
  colour: string,
): void {
  const y = Math.min(3, ctx.storyHeight - 1);
  if (y < 2) return;
  if (ctx.blockAt(x, y, end.z) !== undefined) return;
  // A wall banner's `facing` is the direction it faces *out of* the wall, so
  // one hung on the far wall looks back down the room.
  c.raw(x, y, end.z, colour, { facing: end.look === "north" ? "south" : "north" });
}

/**
 * A shoulder-height trapdoor rack on a wall row: a rack, and passable.
 *
 * `stack` refuses the second course of a three-course storey outright, so on a
 * short storey this writes nothing at all rather than hanging a rack at head
 * height over an open floor cell.
 */
function rack(ctx: FitOutContext, c: PropCounter, x: number, z: number, facing: Cardinal): void {
  c.stack(x, z, Math.min(2, ctx.storyHeight - 1), ctx.style["wall.trapdoor"] as string, {
    facing,
    half: "top",
    open: "false",
    powered: "false",
    waterlogged: "false",
  });
}

/**
 * A dial, switch or hold on the **interior face** of a wall, from the cell
 * beside it.
 *
 * The weather station's barometer wall, corrected at the seam: the dial goes in
 * the *interior* cell adjacent to the wall with `face: "wall"` and the cardinal
 * pointing away from the wall it hangs on, so the wall itself stays a wall.
 * Refused where the wall behind is glazing or a door — a button needs a full
 * block to bracket to — and refused where the interior cell is not empty.
 *
 * Buttons are passable, so one at `y = 2` costs the floor cell under it
 * nothing; nothing here is ever solid at head height over an open cell.
 */
function wallDial(
  ctx: FitOutContext,
  c: PropCounter,
  x: number,
  z: number,
  wallX: number,
  wallZ: number,
  y: number,
  block: string,
): boolean {
  if (y < 2 || y > ctx.storyHeight - 1) return false;
  const behind = ctx.blockAt(wallX, y, wallZ);
  if (behind === undefined || /glass|_pane$|_door$|_trapdoor$|banner$/.test(behind.block)) {
    return false;
  }
  if (ctx.blockAt(x, y, z) !== undefined) return false;
  const facing: Cardinal =
    wallX < x ? "east" : wallX > x ? "west" : wallZ < z ? "south" : "north";
  c.raw(x, y, z, block, { face: "wall", facing, powered: "false" });
  return true;
}

/**
 * The pool rect: the interior, inset one cell on every side.
 *
 * `poolRect` from `archetypes-town.ts` by way of the bathing pavilion, restated
 * for the seam. `null` when the room is too small to hold a slip and still have
 * a walkway round it — a slip you have to swim across to walk past is not a
 * boathouse.
 */
function poolRect(it: LocalRect): LocalRect | null {
  const rect = { x0: it.x0 + 1, z0: it.z0 + 1, x1: it.x1 - 1, z1: it.z1 - 1 };
  if (rect.x1 - rect.x0 < 1 || rect.z1 - rect.z0 < 1) return null;
  return rect;
}

/* -------------------------------------------------------------------------- */
/* the entry point                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Fit out one of this file's archetypes.
 *
 * Returns the number of blocks written, which `furnish` adds to its own count,
 * so `meta.furnitureCount` keeps meaning "things this building has in it".
 * Zero, and not one cell touched, for anything that is not ours.
 */
function furnishTerminus(ctx: FitOutContext): number {
  if (!isTerminusArchetype(ctx.archetype)) return 0;
  const c = new PropCounter(ctx);
  switch (ctx.archetype) {
    case "train_station":
      fitTrainStation(ctx, c);
      break;
    case "signal_box":
      fitSignalBox(ctx, c);
      break;
    case "roundhouse":
      fitRoundhouse(ctx, c);
      break;
    case "coach_house":
      fitCoachHouse(ctx, c);
      break;
    case "toll_house":
      fitTollHouse(ctx, c);
      break;
    case "transit_hub":
      fitTransitHub(ctx, c);
      break;
    case "control_tower":
      fitControlTower(ctx, c);
      break;
    case "airport_terminal":
      fitAirportTerminal(ctx, c);
      break;
    case "boathouse":
      fitBoathouse(ctx, c);
      break;
    case "shipyard":
      fitShipyard(ctx, c);
      break;
    case "lighthouse":
      fitLighthouse(ctx, c);
      break;
    case "climbing_wall":
    default:
      fitClimbingWall(ctx, c);
      break;
  }
  return c.n;
}

/* -------------------------------------------------------------------------- */
/* rail                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * `train_station` — the platform hall: a ticket counter, waiting benches, and a
 * rail line running down the room *inside*.
 *
 * The read is the rail. It is laid on the **floor cells of one wall row**, and
 * it works because a rail is passable: the lint's body walks straight over it,
 * so a track down a wall row costs the hall nothing while making the whole
 * building legible at a glance. The **platform edge** beside it is a floor-plane
 * band of polished andesite with a yellow safety line — paint, never a course
 * of blocks, because a raised platform is a step a body has to mount.
 *
 * The other wall row carries the **waiting benches**, backs to the wall, and
 * the far row carries the **ticket counter** with the clerk's window in the
 * middle of it. The **departure board** is a run of wall banners over the
 * counter and the **clock** is a glazed roundel set into the far wall above
 * them — a banner and a block, because there are no sign blocks in this stack.
 */
function fitTrainStation(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const end = farEnd(ctx);
  const lamp = lanternColumn(it);
  const nearZ = end.look === "north" ? it.z1 : it.z0;
  const look: Cardinal = end.look === "north" ? "south" : "north";

  // The track, down the west wall row, and the platform edge painted beside it.
  for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
    c.put1(it.x0, z, "rail", { shape: "north_south", waterlogged: "false" });
  }
  c.n += floorPaint(ctx, it, (x, z) => {
    if (x === it.x0) return "polished_andesite";
    if (x === it.x0 + 1) return z % 3 === 0 ? "yellow_terracotta" : "polished_andesite";
    return null;
  });

  // The waiting benches, down the east wall row with their backs to the wall.
  if (benchHeadroom(ctx)) {
    const seat = ctx.style["stair.interior"] as string;
    for (let z = it.z0 + 1; z <= it.z1 - 1; z += 2) {
      c.put1(it.x1, z, seat, { facing: "east", half: "bottom", shape: "straight" });
    }
  }

  // The ticket counter, across the head of the hall, with the clerk's window.
  for (let x = it.x0 + 1; x <= it.x1; x++) {
    if (x === lamp.x) continue;
    c.put1(x, end.z, (x - it.x0) % 4 === 0 ? "barrel" : (ctx.style["wall.frame"] as string),
      (x - it.x0) % 4 === 0 ? { facing: "up", open: "false" } : { axis: "x" });
  }
  c.put1(lamp.x, end.z, "lectern", { facing: look, has_book: "false", powered: "false" });

  // The departure board, and the station clock over it.
  for (const bx of [lamp.x - 2, lamp.x + 2]) {
    if (bx < it.x0 || bx > it.x1) continue;
    wallBanner(ctx, c, bx, end, bx < lamp.x ? "light_blue_wall_banner" : "white_wall_banner");
  }
  const wallZ = end.look === "north" ? it.z0 - 1 : it.z1 + 1;
  const clockY = Math.min(4, ctx.wallTop - 1);
  if (clockY >= 3 && clad(ctx, lamp.x, clockY, wallZ, "white_glazed_terracotta")) c.n++;

  // The porter's corner, by the way in.
  c.put1(it.x1, nearZ, "barrel", { facing: "up", open: "false" });
  c.put1(it.x1 - 1 >= it.x0 ? it.x1 - 1 : it.x1, nearZ, pottedAt(it.x1 - 1, nearZ));
}

/**
 * `signal_box` — the small two-level box: a lever bank on a desk row, windows
 * everywhere else.
 *
 * The **lever bank** is the whole building. A run of dressed timber across the
 * far row is the frame's desk, and the levers stand **on** it — which means
 * they land only where the storey has four courses, because a second block in a
 * three-course column is the `interior.blocked_column` the stack guard exists to
 * refuse. On a short box the desk reads as a desk and the switches move to the
 * **wall face** beside it through {@link wallDial}, which is passable and needs
 * no headroom at all.
 *
 * The window rhythm comes from the facade defaults — dense mullions on every
 * side, which is what a box is — and the only other furniture is the
 * signalman's stool, his stove and the block register.
 */
function fitSignalBox(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const end = farEnd(ctx);
  const lamp = lanternColumn(it);
  const nearZ = end.look === "north" ? it.z1 : it.z0;
  const look: Cardinal = end.look === "north" ? "south" : "north";
  const wallZ = end.look === "north" ? it.z0 - 1 : it.z1 + 1;

  // The frame: a desk run with the levers standing on it where they fit.
  for (let x = it.x0; x <= it.x1; x++) {
    if (!c.put1(x, end.z, ctx.style["wall.frame"] as string, { axis: "x" })) continue;
    c.stack(x, end.z, 2, "lever", { face: "floor", facing: look, powered: "false" });
  }
  // The switches that could not stand on the frame go on the wall over it.
  for (let x = it.x0; x <= it.x1; x += 2) {
    wallDial(ctx, c, x, end.z, x, wallZ, 2, (x + end.z) % 3 === 0 ? "lever" : "stone_button");
  }
  wallBanner(ctx, c, lamp.x, end, "red_wall_banner");

  // The signalman's own corner: a stool, the stove and the register.
  if (benchHeadroom(ctx)) {
    c.put1(it.x0, lamp.z, ctx.style["stair.interior"] as string, {
      facing: "west",
      half: "bottom",
      shape: "straight",
    });
  }
  c.put1(it.x1, lamp.z, "furnace", { facing: "west", lit: "false" });
  c.put1(it.x1, nearZ, "bookshelf");
  c.put1(it.x0, nearZ, "barrel", { facing: "up", open: "false" });
}

/**
 * `roundhouse` — the engine shed: a big hall, rail stubs off the head wall, an
 * inspection pit between them, tool walls down the sides.
 *
 * Not wave three's **thatched** roundhouse, which is a wattle hut under a cone
 * and answers to `thatched_roundhouse` and `wattle` only. This is the
 * locomotive shed the catalog id has always meant, and the tag note in
 * `archetypes-regional.ts` says so in as many words.
 *
 * The **stubs** are short rail runs from the far row down the hall, on alternate
 * columns and clear of the lantern's three-column lane. The **inspection pit** is
 * a floor-plane recolour under and between them — dark, sunken-*reading*
 * masonry, and never a hole: a hole in the floor plane is a fall and a broken
 * walk. The **tool walls** are trapdoor racks down both wall rows.
 */
function fitRoundhouse(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const end = farEnd(ctx);
  const lamp = lanternColumn(it);
  const nearZ = end.look === "north" ? it.z1 : it.z0;
  const dir = end.look === "north" ? 1 : -1;
  const stubTo = 4;

  // The stubs, and the pit painted under them.
  const isStub = (x: number): boolean =>
    x > it.x0 && x < it.x1 && (x - it.x0) % 3 === 1 && Math.abs(x - lamp.x) > 1;
  for (let x = it.x0 + 1; x <= it.x1 - 1; x++) {
    if (!isStub(x)) continue;
    for (let k = 1; k <= stubTo; k++) {
      const z = end.z + dir * k;
      if (z < it.z0 || z > it.z1) break;
      c.put1(x, z, "rail", { shape: "north_south", waterlogged: "false" });
    }
  }
  c.n += floorPaint(ctx, it, (x, z) => {
    const k = (z - end.z) * dir;
    if (k < 0 || k > stubTo) return null;
    if (isStub(x)) return "polished_blackstone";
    if (isStub(x - 1) || isStub(x + 1)) return "gray_concrete";
    return null;
  });

  // The tool walls: racks down both sides, and the fitter's bench at the head.
  for (let z = it.z0 + 1; z <= it.z1 - 1; z += 2) {
    rack(ctx, c, it.x0, z, "east");
    rack(ctx, c, it.x1, z, "west");
  }
  c.put1(it.x0, end.z, "smithing_table");
  c.put1(it.x1, end.z, "anvil", { facing: end.look === "north" ? "east" : "west" });
  c.put1(it.x0, nearZ, "barrel", { facing: "up", open: "false" });
  c.put1(it.x1, nearZ, "crafting_table");
  wallBanner(ctx, c, lamp.x, end, "black_wall_banner");
}

/* -------------------------------------------------------------------------- */
/* road                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * `coach_house` — the carriage bay: an empty middle, tack down the walls, hay
 * in the corner, a wide door face outside.
 *
 * The carriage is the thing that is **not there**: the whole centre of the room
 * is left open, which is the courtyard house's plan and the only honest way to
 * read "a vehicle lives here" without an entity. Everything else is pushed to
 * the wall rows — tack racks, a harness chest, the feed bins — and the **hay
 * corner** is two bales at the head of one range.
 *
 * Outside, the **door face** gets a stone-brick pier either side of the opening
 * and a slab cornice over it: the wide-door trim, which is the read from the
 * street. Only on a plain rect — an L has a reflex corner this has no rule for.
 */
function fitCoachHouse(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const end = farEnd(ctx);
  const lamp = lanternColumn(it);
  const nearZ = end.look === "north" ? it.z1 : it.z0;
  const plan = wallPlan(ctx);

  if (plan !== null && ctx.door !== null) {
    // The wide-door trim, on the face the door is in.
    const faceZ = ctx.door.z <= 0 ? 0 : ctx.door.z >= plan.sz - 1 ? plan.sz - 1 : -1;
    if (faceZ >= 0) {
      for (const px of [ctx.door.x - 2, ctx.door.x + 2]) {
        if (px < 1 || px > plan.sx - 2) continue;
        for (let y = 1; y <= ctx.wallTop - 1; y++) {
          if (clad(ctx, px, y, faceZ, "stone_bricks")) c.n++;
        }
      }
      const corniceY = ctx.wallTop - 1;
      if (corniceY >= 2) {
        for (let x = Math.max(1, ctx.door.x - 1); x <= Math.min(plan.sx - 2, ctx.door.x + 1); x++) {
          if (clad(ctx, x, corniceY, faceZ, "polished_andesite")) c.n++;
        }
      }
    }
  }

  // The bay floor: a swept, dusty plane under where the carriage stands.
  c.n += floorPaint(ctx, it, (x, z) =>
    Math.abs(x - lamp.x) <= 1 && z > it.z0 && z < it.z1 ? "packed_mud" : null,
  );

  // The tack, down both wall rows — the middle stays empty.
  for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
    const bay = z - it.z0;
    if (bay % 3 === 1) {
      rack(ctx, c, it.x0, z, "east");
      rack(ctx, c, it.x1, z, "west");
      continue;
    }
    if (bay % 3 === 2) {
      c.put1(it.x0, z, "chest", { facing: "east", type: "single" });
      c.put1(it.x1, z, "barrel", { facing: "up", open: "false" });
    }
  }

  // The hay corner, at the head of the shed. Laid left to right along the far
  // row rather than pinned to the corner cell: the ground floor's own reserve
  // refuses whichever cells it refuses, and a bale pinned to one cell is a
  // bale some envelopes never get (the field station's lesson).
  let bales = 0;
  for (let x = it.x0; x <= it.x1 && bales < 2; x++) {
    if (c.put1(x, end.z, "hay_block", { axis: "y" })) bales++;
  }
  c.put1(it.x1, end.z, "cauldron", { level: "3" });
  c.put1(it.x1, nearZ, "crafting_table");
  wallBanner(ctx, c, lamp.x, end, "brown_wall_banner");
}

/**
 * `toll_house` — the gate lodge's road cousin: a toll counter at the window, the
 * strongbox behind it, the barrier outside.
 *
 * Inside is one room and a counter, which is what a toll house is: a run of
 * dressed timber across the far row with the **window seat** in the middle of it
 * and the **strongbox** — a chest under an iron grille, the embassy's records
 * idiom — in the corner beside it, with the rate board on the wall over it.
 *
 * Outside is the **barrier**, and it is the reason this building has an apron
 * pass at all: two posts in the apron, each **grounded** through
 * {@link apronPost} so neither is a column standing on air, and a trapdoor arm
 * between them at waist height. Neither post ever lands on the doorstep — the
 * lint walks the building from its door.
 */
function fitTollHouse(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const end = farEnd(ctx);
  const lamp = lanternColumn(it);
  const nearZ = end.look === "north" ? it.z1 : it.z0;
  const look: Cardinal = end.look === "north" ? "south" : "north";

  // The counter and the window seat.
  for (let x = it.x0; x <= it.x1; x++) {
    if (x === lamp.x) continue;
    c.put1(x, end.z, ctx.style["wall.frame"] as string, { axis: "x" });
  }
  if (benchHeadroom(ctx)) {
    c.put1(lamp.x, end.z, ctx.style["stair.interior"] as string, {
      facing: end.look,
      half: "bottom",
      shape: "straight",
    });
  }
  wallBanner(ctx, c, lamp.x, end, "yellow_wall_banner");

  // The strongbox: a chest under a grille, never a sealed corner.
  if (c.put1(it.x0, nearZ, "chest", { facing: look === "south" ? "south" : "north", type: "single" })) {
    c.stack(it.x0, nearZ, 2, "iron_bars", {
      north: "false",
      south: "false",
      east: "true",
      west: "true",
      waterlogged: "false",
    });
  }
  c.put1(it.x1, nearZ, "barrel", { facing: "up", open: "false" });
  c.put1(it.x1, lamp.z, pottedAt(it.x1, lamp.z));

  // The barrier: grounded posts in the apron with a trapdoor arm between them.
  const sx = ctx.size[0];
  const sz = ctx.size[2];
  const out = outsideDoor(ctx);
  const fence = ctx.style["wall.fence"] as string;
  const free = (cell: { x: number; z: number }): boolean =>
    !(out !== null && out.x === cell.x && out.z === cell.z);
  const posts = apronOf(sx, sz).filter(
    (cell) => cell.x === -1 && (cell.z === 1 || cell.z === sz - 2) && free(cell),
  );
  for (const post of posts) apronPost(ctx, c, post.x, post.z, fence, 2);
  if (posts.length === 2) {
    const a = posts[0] as { x: number; z: number };
    const b = posts[1] as { x: number; z: number };
    for (let z = Math.min(a.z, b.z) + 1; z < Math.max(a.z, b.z); z++) {
      c.raw(a.x, 2, z, ctx.style["wall.trapdoor"] as string, {
        facing: "east",
        half: "top",
        open: "false",
        powered: "false",
        waterlogged: "false",
      });
    }
  }
}

/**
 * `transit_hub` — the bus shelter grown into a building: bay benches, a route
 * wall, a kiosk in the corner.
 *
 * The shelter is a pole, a flag and two seats on a pad; this is what happens
 * when it gets walls. The **bays** are seat pairs down both wall rows with a
 * bay marker painted into the floor plane in front of each — paint, because a
 * kerb is a step and a step in a concourse is a trip. The **route wall** is a
 * run of wall banners across the far row over a bench, and the **kiosk** is the
 * near corner: a counter, a barrel of stock and the timetable trapdoor.
 */
function fitTransitHub(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const end = farEnd(ctx);
  const lamp = lanternColumn(it);
  const nearZ = end.look === "north" ? it.z1 : it.z0;
  const seat = ctx.style["stair.interior"] as string;

  // The bays, down both wall rows, with the bay markers painted in front.
  if (benchHeadroom(ctx)) {
    for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
      if ((z - it.z0) % 3 === 0) continue;
      c.put1(it.x0, z, seat, { facing: "west", half: "bottom", shape: "straight" });
      c.put1(it.x1, z, seat, { facing: "east", half: "bottom", shape: "straight" });
    }
  }
  c.n += floorPaint(ctx, it, (x, z) => {
    if (x !== it.x0 + 1 && x !== it.x1 - 1) return null;
    return (z - it.z0) % 3 === 0 ? "yellow_concrete" : "light_gray_concrete";
  });

  // The route wall: banners across the head over the enquiries bench.
  for (const bx of [lamp.x - 2, lamp.x, lamp.x + 2]) {
    if (bx < it.x0 || bx > it.x1) continue;
    wallBanner(ctx, c, bx, end, bx === lamp.x ? "green_wall_banner" : "lime_wall_banner");
  }
  for (let x = it.x0; x <= it.x1; x++) {
    if (Math.abs(x - lamp.x) <= 1) continue;
    c.put1(x, end.z, ctx.style["wall.frame"] as string, { axis: "x" });
  }

  // The kiosk, in the corner by the way in.
  c.put1(it.x0, nearZ, "barrel", { facing: "up", open: "false" });
  c.put1(it.x1, nearZ, "cartography_table");
  rack(ctx, c, it.x1, nearZ, "west");
  c.put1(it.x0, lamp.z, pottedAt(it.x0, lamp.z));
}

/* -------------------------------------------------------------------------- */
/* air                                                                         */
/* -------------------------------------------------------------------------- */

/**
 * `control_tower` — the watchtower, modernized: a concrete shaft, a glazed top,
 * console desks and a radar dish on the roof.
 *
 * The **glazing is the shell's**, not this file's: the facade defaults ask for
 * tall dense openings and the window stage lays them, which is how a tower gets
 * a real band of glass instead of a hand-punched hole. This fit-out re-clads the
 * shaft in concrete between the plinth course and the plate, so the building
 * reads grey and modern from the ground.
 *
 * The **consoles** are a desk run across the far row with switches on the wall
 * face over them — {@link wallDial}, which brackets only to a full block and is
 * passable, so a console never costs the room head height. The **radar** stands
 * on the roof deck: a solid deck over the whole footprint and a **continuous
 * masonry column** up from it with the dish on its head, which is the turret
 * lesson — a topper with air under it is a floating block.
 */
function fitControlTower(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const end = farEnd(ctx);
  const lamp = lanternColumn(it);
  const nearZ = end.look === "north" ? it.z1 : it.z0;
  const look: Cardinal = end.look === "north" ? "south" : "north";
  const wallZ = end.look === "north" ? it.z0 - 1 : it.z1 + 1;
  const plan = roofPlan(ctx);

  if (plan !== null) {
    // The shaft.
    c.n += reclad(ctx, plan, 2, ctx.wallTop, (x, y, z) =>
      (x + y + z) % 7 === 0 ? "light_gray_concrete" : "gray_concrete",
    );
    // The roof deck, and the radar on its own column.
    clearRoof(ctx, plan);
    c.n += terrace(ctx, plan, "smooth_stone", (x, z) => ({
      block: ctx.style["stone.wall"] as string,
      height: (x + z) % 2 === 0 ? 1 : 0,
    }));
    mast(ctx, c, plan, plan.sx >> 1, plan.sz >> 1, "smooth_stone", "daylight_detector", {
      inverted: "false",
      power: "0",
    });
  }

  // The consoles, and the switches on the wall over them.
  for (let x = it.x0; x <= it.x1; x++) {
    if (x === lamp.x) continue;
    c.put1(x, end.z, ctx.style["wall.frame"] as string, { axis: "x" });
  }
  c.put1(lamp.x, end.z, "lectern", { facing: look, has_book: "false", powered: "false" });
  for (let x = it.x0; x <= it.x1; x++) {
    wallDial(ctx, c, x, end.z, x, wallZ, 2, (x + end.z) % 3 === 0 ? "lever" : "stone_button");
  }

  // The controller's chair and the log, by the way in.
  if (benchHeadroom(ctx)) {
    c.put1(it.x0, lamp.z, ctx.style["stair.interior"] as string, {
      facing: "west",
      half: "bottom",
      shape: "straight",
    });
  }
  c.put1(it.x1, lamp.z, "bookshelf");
  c.put1(it.x1, nearZ, "barrel", { facing: "up", open: "false" });
  wallBanner(ctx, c, lamp.x, end, "light_blue_wall_banner");
}

/**
 * `airport_terminal` — check-in at the head, departure rows in the body, gates
 * along the far end, barrows by the door.
 *
 * The rows are one field laid through {@link bankCells}, which is the school's
 * discipline: a three-column aisle centred on the lantern, a one-cell clear lane
 * round the whole field, alternate rows only. That is also why the side wall
 * rows carry nothing solid — they **are** the lane.
 *
 * The **check-in** is a counter run across the far row with the desk in the
 * middle. The **gates** are painted bands in the floor plane at the head of the
 * hall with a numbered banner over each, which reads as a gate and costs the
 * concourse no cell at all. The **baggage barrows** are crates by the way in.
 */
function fitAirportTerminal(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const end = farEnd(ctx);
  const lamp = lanternColumn(it);
  const nearZ = end.look === "north" ? it.z1 : it.z0;
  const look: Cardinal = end.look === "north" ? "south" : "north";
  const dir = end.look === "north" ? 1 : -1;

  // The check-in counters.
  for (let x = it.x0; x <= it.x1; x++) {
    if (x === lamp.x) continue;
    c.put1(x, end.z, (x - it.x0) % 4 === 0 ? "barrel" : (ctx.style["wall.frame"] as string),
      (x - it.x0) % 4 === 0 ? { facing: "up", open: "false" } : { axis: "x" });
  }
  c.put1(lamp.x, end.z, "lectern", { facing: look, has_book: "false", powered: "false" });

  // The gates: painted bands one cell off the counter, and a banner over each.
  const gateZ = end.z + dir;
  c.n += floorPaint(ctx, it, (x, z) =>
    z === gateZ ? ((x - it.x0) % 3 === 0 ? "light_blue_concrete" : "white_concrete") : null,
  );
  for (const bx of [lamp.x - 3, lamp.x + 3]) {
    if (bx < it.x0 || bx > it.x1) continue;
    wallBanner(ctx, c, bx, end, "blue_wall_banner");
  }

  // The departure rows, every seat turned away from what it looks at.
  seatBank(ctx, c, end, 3);

  // The barrows, by the way in.
  c.put1(it.x0, nearZ, "barrel", { facing: "up", open: "false" });
  c.put1(it.x1, nearZ, "barrel", { facing: "up", open: "false" });
  c.put1(it.x1 - 1 >= it.x0 ? it.x1 - 1 : it.x1, nearZ, "cartography_table");
}

/* -------------------------------------------------------------------------- */
/* water, and the wall                                                         */
/* -------------------------------------------------------------------------- */

/**
 * `boathouse` — a hall over a water slip.
 *
 * **The fluid argument is the bathhouse's, unchanged, and it is unchanged on
 * purpose.** The slip goes *into the floor plane* at `y = 0`, in a rect inset
 * one cell from the interior on every side, so
 *
 * - under every water cell is the foundation skirt the shell laid under the
 *   whole footprint;
 * - beside every water cell, on all four sides, is either more slip or a floor
 *   cell this pass has written solid (the coping);
 * - no prop ever stands on a slip cell, so the air over the water is clear.
 *
 * The **rowboat** is a stair-and-slab hull on the slip **rim**, never in the
 * water — a hull written into a water cell would be a prop over a fluid, and the
 * rim is where a boat gets hauled out anyway. Two adjacent rim cells is the most
 * it ever takes, which leaves the one-wide walkway a path rather than two
 * islands. The **oar racks** are trapdoors on the wall rows: passable, so the
 * walkway stays a walkway.
 */
function fitBoathouse(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const end = farEnd(ctx);
  const lamp = lanternColumn(it);
  const nearZ = end.look === "north" ? it.z1 : it.z0;
  const slip = poolRect(it);
  const inSlip = (x: number, z: number): boolean =>
    slip !== null && x >= slip.x0 && x <= slip.x1 && z >= slip.z0 && z <= slip.z1;

  if (slip !== null) {
    for (let z = slip.z0; z <= slip.z1; z++) {
      for (let x = slip.x0; x <= slip.x1; x++) {
        ctx.put(x, 0, z, "water", { level: "0" });
        c.n++;
      }
    }
    // The coping: every floor cell touching the water, written solid. This is
    // the rim the fluid rule wants, and it is what turns a hole full of water
    // into a slip.
    for (let z = it.z0; z <= it.z1; z++) {
      for (let x = it.x0; x <= it.x1; x++) {
        if (inSlip(x, z)) continue;
        const beside = inSlip(x + 1, z) || inSlip(x - 1, z) || inSlip(x, z + 1) || inSlip(x, z - 1);
        if (!beside) continue;
        ctx.put(x, 0, z, "smooth_stone");
        c.n++;
      }
    }
  }

  // The rowboat, hauled out of the water: a stair bow and a slab thwart
  // standing on the **rim the slip's own edge cells are turned into**, never on
  // the walkway and never in the water.
  //
  // The walkway round an inset slip is one cell wide, and the shell is free to
  // block a cell of it for its own reasons (a stair column, the door reserve);
  // one more cut from this pass turns the ring into two arcs and strands one of
  // them. So the hull replaces two water cells with solid stone and stands on
  // that — which leaves every remaining water cell bounded by pool or solid,
  // exactly as the coping does, and costs the walkway nothing.
  if (slip !== null) {
    const hullZ = Math.max(slip.z0, Math.min(slip.z1 - 1, lamp.z));
    const bow = (px: number, pz: number, block: string, props: Record<string, string>): void => {
      ctx.put(px, 0, pz, "smooth_stone");
      ctx.put(px, 1, pz, block, props);
      c.n += 2;
    };
    bow(slip.x0, hullZ, ctx.style["stair.interior"] as string, {
      facing: "north",
      half: "bottom",
      shape: "straight",
    });
    if (hullZ + 1 <= slip.z1) {
      bow(slip.x0, hullZ + 1, ctx.style["stone.slab"] as string, {
        type: "top",
        waterlogged: "false",
      });
    }
  }

  // The oar racks and the chandlery, on the walkway's walls — passable only.
  for (let z = it.z0 + 1; z <= it.z1 - 1; z += 2) {
    rack(ctx, c, it.x1, z, "west");
  }
  // The chandlery stands in the **slip's own corners**, carved out of the
  // water and never on the walkway. The walkway round an inset slip is one
  // cell wide and its corners are the only links between its four arms, so a
  // crate in a corner cuts the ring into arms the door cannot reach — which is
  // exactly what the first cut of this building did. Replacing a water corner
  // with solid stone leaves every remaining water cell bounded by pool or
  // solid, so the fluid argument is unchanged.
  if (slip !== null) {
    const pedestal = (px: number, pz: number, top: string, props?: Record<string, string>): void => {
      ctx.put(px, 0, pz, "smooth_stone");
      ctx.put(px, 1, pz, top, props);
      c.n += 2;
    };
    pedestal(slip.x1, slip.z0, "barrel", { facing: "up", open: "false" });
    pedestal(slip.x1, slip.z1, "cauldron", { level: "3" });
  } else {
    c.put1(it.x1, end.z, "barrel", { facing: "up", open: "false" });
    c.put1(it.x0, nearZ, "cauldron", { level: "3" });
  }
  wallBanner(ctx, c, lamp.x, end, "cyan_wall_banner");
}

/**
 * `shipyard` — a hull under construction: a keel, ribs, scaffolds, plank stores.
 *
 * The hull is the read and **every part of it is supported**. The keel is a run
 * of stripped log laid in the floor's own course, offset one column off the
 * lantern lane; the **ribs** stand on solid floor blocks beside it and rise one
 * course *only where the storey has the height for it* — a rib that would seal
 * its column is refused by the stack guard, which is exactly right, because a
 * rib at head height over an open cell is a beam through a walkway.
 *
 * The **scaffolds** are fence stems on the ground with a plank stage on top, the
 * same rule again; the **plank stores** are barrels and log stacks down one wall
 * row, and the far wall carries the shipwright's bench.
 */
function fitShipyard(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const end = farEnd(ctx);
  const lamp = lanternColumn(it);
  const nearZ = end.look === "north" ? it.z1 : it.z0;
  const keelX = lamp.x + 1 <= it.x1 - 1 ? lamp.x + 1 : lamp.x - 1;
  const log = "stripped_oak_log";

  // The keel, short of both ends so the hall never closes on itself.
  for (let z = it.z0 + 2; z <= it.z1 - 2; z++) {
    c.put1(keelX, z, log, { axis: "z" });
  }
  // The ribs, standing on the floor beside the keel and rising where they fit.
  for (let z = it.z0 + 2; z <= it.z1 - 2; z += 3) {
    for (const rx of [keelX - 1, keelX + 1]) {
      if (rx <= it.x0 || rx >= it.x1) continue;
      if (!c.put1(rx, z, log, { axis: "y" })) continue;
      c.stack(rx, z, 2, log, { axis: "y" });
    }
  }
  // The building dock, painted under the hull.
  c.n += floorPaint(ctx, it, (x, z) =>
    Math.abs(x - keelX) <= 1 && z > it.z0 + 1 && z < it.z1 - 1 ? "polished_andesite" : null,
  );

  // The scaffolds: a stem on the ground with a stage on top of it.
  const fence = ctx.style["wall.fence"] as string;
  for (let z = it.z0 + 2; z <= it.z1 - 2; z += 4) {
    if (!c.put1(it.x0, z, fence)) continue;
    c.stack(it.x0, z, 2, ctx.style["roof.slab"] as string, {
      type: "top",
      waterlogged: "false",
    });
  }

  // The plank stores, down the east range, and the bench at the head.
  for (let z = it.z0 + 1; z <= it.z1 - 1; z += 2) {
    c.put1(it.x1, z, (z - it.z0) % 4 === 0 ? log : "barrel",
      (z - it.z0) % 4 === 0 ? { axis: "y" } : { facing: "up", open: "false" });
  }
  c.put1(it.x0, end.z, "smithing_table");
  c.put1(it.x1, end.z, "crafting_table");
  c.put1(it.x0, nearZ, "barrel", { facing: "up", open: "false" });
  wallBanner(ctx, c, lamp.x, end, "light_gray_wall_banner");
}

/**
 * `lighthouse` — the beacon spire, maritime: banded courses, a lamp room, a
 * keeper's room under it.
 *
 * The **bands** are the read: the wall ring is re-clad in courses of white and
 * red terracotta, alternating in threes, from the plinth to the plate. Over the
 * plate the roof is cleared and rebuilt as a **solid deck with a parapet** —
 * the gallery — and the **lamp** stands on a continuous column raised from that
 * deck, with a sea lantern on its head. That is the turret lesson twice over: a
 * cap that is solid, and a topper with masonry all the way down.
 *
 * Inside is the keeper's room and nothing clever: a bunk laid through
 * `placeBed` (both halves or neither), a stove, a store and the log desk. **No
 * spiral stair is written here** — the shell owns the way up, and a second
 * stair beside the shell's is a shaft with two ladders in it.
 */
function fitLighthouse(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const end = farEnd(ctx);
  const lamp = lanternColumn(it);
  const nearZ = end.look === "north" ? it.z1 : it.z0;
  const plan = roofPlan(ctx);

  if (plan !== null) {
    // The bands, three courses of each, from the plinth to the plate.
    c.n += reclad(ctx, plan, 2, ctx.wallTop, (_x, y) =>
      Math.floor(y / 3) % 2 === 0 ? "white_terracotta" : "red_terracotta",
    );
    // The gallery, and the lamp on its column.
    clearRoof(ctx, plan);
    c.n += terrace(ctx, plan, "smooth_stone", () => ({
      block: ctx.style["stone.wall"] as string,
      height: 1,
    }));
    mast(ctx, c, plan, plan.sx >> 1, plan.sz >> 1, "smooth_stone", "sea_lantern");
  }

  // The keeper's room.
  ctx.placeBed(it.x0, nearZ, end.look === "north" ? "south" : "north", "red_bed");
  c.put1(it.x1, nearZ, "chest", { facing: "west", type: "single" });
  c.put1(it.x0, end.z, "furnace", { facing: end.look === "north" ? "south" : "north", lit: "false" });
  c.put1(it.x1, end.z, "barrel", { facing: "up", open: "false" });
  c.put1(lamp.x, end.z, "lectern", {
    facing: end.look === "north" ? "south" : "north",
    has_book: "false",
    powered: "false",
  });
  wallBanner(ctx, c, lamp.x - 1 >= it.x0 ? lamp.x - 1 : it.x0, end, "red_wall_banner");
  c.put1(it.x1, lamp.z, pottedAt(it.x1, lamp.z));
}

/**
 * `climbing_wall` — an interior hold wall: holds up one tall face, mats on the
 * floor, a top ledge.
 *
 * The **holds** are stone buttons on the interior face of one side wall, laid
 * from a position function so they scatter rather than line up, and written
 * through {@link wallDial}: they bracket only to a full block, never to glazing,
 * and a button is passable, so the lane along the wall stays a lane and nothing
 * this building writes is solid at head height over an open floor cell.
 *
 * The **crash mats** are a floor-plane recolour in wool along the foot of that
 * wall — paint, not carpet, because a carpet is a block at `y = 1` and costs a
 * cell. The **top ledge** is a slab standing on a post at the head of the wall,
 * and it goes in only where the storey has the headroom for both.
 */
function fitClimbingWall(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const end = farEnd(ctx);
  const lamp = lanternColumn(it);
  const nearZ = end.look === "north" ? it.z1 : it.z0;
  const wallX = it.x0 - 1;
  const wools = ["blue_wool", "light_blue_wool", "cyan_wool"] as const;

  // The holds, up the whole height of the west wall.
  for (let z = it.z0; z <= it.z1; z++) {
    for (let y = 2; y <= ctx.storyHeight - 1; y++) {
      if ((z * 5 + y * 3) % 4 !== 0) continue;
      wallDial(ctx, c, it.x0, z, wallX, z, y, (z + y) % 3 === 0 ? "polished_blackstone_button" : "stone_button");
    }
  }

  // The mats, painted along the foot of the wall.
  c.n += floorPaint(ctx, it, (x, z) =>
    x <= it.x0 + 1 ? (wools[(x * 3 + z) % wools.length] as string) : null,
  );

  // The top ledge: a slab on a post, and only where both fit.
  const ledgeZ = Math.max(it.z0 + 1, Math.min(it.z1 - 1, lamp.z));
  if (c.put1(it.x0 + 1 <= it.x1 ? it.x0 + 1 : it.x0, ledgeZ, ctx.style["wall.frame"] as string, { axis: "y" })) {
    c.stack(it.x0 + 1 <= it.x1 ? it.x0 + 1 : it.x0, ledgeZ, 2, ctx.style["stone.slab"] as string, {
      type: "top",
      waterlogged: "false",
    });
  }

  // The rest of the room: the chalk store, the mat stack and a bench.
  c.put1(it.x1, end.z, "barrel", { facing: "up", open: "false" });
  c.put1(it.x1, nearZ, "cauldron", { level: "0" });
  if (benchHeadroom(ctx)) {
    c.put1(it.x1, lamp.z, ctx.style["stair.interior"] as string, {
      facing: "east",
      half: "bottom",
      shape: "straight",
    });
  }
  wallBanner(ctx, c, lamp.x, end, "orange_wall_banner");
}

/* -------------------------------------------------------------------------- */
/* descriptors — ordered building rows for Phase 4 registry                    */
/* -------------------------------------------------------------------------- */

/**
 * Ordered building descriptors for the terminus pack.
 *
 * One row per id in {@link TERMINUS_BUILDING_ARCHETYPES}, preserving:
 * - tag/alias semantics from {@link terminusArchetypeOfTags} (canonical id first, then alternates in OR-chain order; preserves station distinction: train_station claims bare "station"),
 * - nullable facade defaults via {@link terminusFacadeDefaults},
 * - furnish handle {@link furnishTerminus},
 * - dispatch "standard" (this pack is standard; bunker/underground dispatch lives in underground pack).
 *
 * No self-registration / no global side effects; existing exports kept for central cutover.
 */
export const TERMINUS_BUILDING_DESCRIPTORS =
  defineBuildingDescriptors<TerminusBuildingArchetype, FitOutContext>(TERMINUS_BUILDING_ARCHETYPES, {
    tags: (id) => {
      switch (id) {
        case "train_station":
          return ["train_station", "railway_station", "station"];
        case "signal_box":
          return ["signal_box", "signal_cabin"];
        case "roundhouse":
          return ["roundhouse", "engine_shed", "engine_roundhouse"];
        case "coach_house":
          return ["coach_house", "carriage_house"];
        case "toll_house":
          return ["toll_house", "tollbooth", "toll_gate"];
        case "transit_hub":
          return ["transit_hub", "bus_station", "hub"];
        case "control_tower":
          return ["control_tower", "air_traffic_control"];
        case "airport_terminal":
          return ["airport_terminal", "terminal", "airport"];
        case "boathouse":
          return ["boathouse", "boat_shed"];
        case "shipyard":
          return ["shipyard", "drydock"];
        case "lighthouse":
          return ["lighthouse", "pharos"];
        case "climbing_wall":
          return ["climbing_wall", "bouldering"];
        default:
          return [id];
      }
    },
    facadeDefaults: terminusFacadeDefaults,
    furnish: furnishTerminus,
    dispatch: "standard",
  });
