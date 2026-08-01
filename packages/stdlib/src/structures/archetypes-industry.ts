/**
 * Archetype breadth, **wave five C** — industry and modern works.
 *
 * `archetypes-blitz.ts` states the design law this file obeys and it is not
 * restated: **an archetype is a fit-out, not a second grammar.** A fit-out runs
 * after every shape stage — foundation, walls, windows, floors, roof, chimney —
 * and writes into the same cell map they did, where a later write to a cell
 * replaces an earlier one. So a factory hall is the ordinary shed with machine
 * rows stood against its walls, and a brutalist block is the ordinary house
 * with its wall field re-clad in concrete. Neither is a new shell.
 *
 * `archetypes-works.ts` is this file's direct kin — its foundry and its
 * glassworks are the same genre — and wave two's kiln is the idiom the
 * brickworks and the blast-furnace works both borrow their fire from.
 *
 * Twelve buildings, in two groups:
 *
 * - **industrial** — `brickworks`, `blast_furnace_works`, `factory_hall`,
 *   `machine_shop`, `refinery`, `charcoal_burner`, `ropewalk`;
 * - **modern** — `parking_garage`, `gas_station`, `data_center`,
 *   `conference_center`, `brutalist_block`.
 *
 * ## The field lessons this file was written against
 *
 * Every one is a rule below rather than a comment, and every one came back from
 * a walkthrough or from the physics lint:
 *
 * - a **stair's `facing` is its high half** — the backrest. Every seat in the
 *   conference centre therefore carries the cardinal pointing *away* from the
 *   stage its sitter is looking at;
 * - a bare `flower_pot` renders **empty**; {@link pottedAt} (wave two's,
 *   imported rather than re-derived) picks a `potted_*` from position;
 * - the shell hangs a lantern over the **middle column** of the room at head
 *   height, so nothing here routes a lane through it: machinery stands against
 *   the walls and every field of props keeps a three-column aisle off that
 *   column and a one-cell lane round its whole edge;
 * - the trestle idiom — a fence with a plate on it — is refused by the stack
 *   guard under a three-course storey, so {@link indTable} switches to a slab;
 * - nothing body-blocking stands on a one-wide circulation lane, and anything a
 *   body is meant to stand *on* (a ramp stair, a charging platform) is only
 *   built where {@link standerHeadroom} says the body fits;
 * - **no sign blocks** — a sign is a block entity the local op stream cannot
 *   carry, so all signage here is a wall banner;
 * - **no open fluids and no lava, ever.** A refinery's product, a data centre's
 *   coolant and a brickworks' slip are all `cauldron`s, which are containers
 *   rather than sources; fire appears only as a `campfire` standing on a solid
 *   pedestal on a wall row, clear of every lane;
 * - **apron props stand on the actual ground.** The gas station's canopy posts
 *   fill their own `y = 0` cell when `blockAt` says there is nothing there —
 *   a post whose foot is air fails the support-chain rule;
 * - **a mound closes on a solid cap.** The charcoal burner's burn pile is the
 *   corbel idiom in miniature and its top course is a full block, never a slab
 *   or a wall;
 * - **no `chain` blocks** — the 1.21.11 table this emitter is pinned to has no
 *   entry for one, so anything hanging is `iron_bars`.
 */

import type { Cardinal, LocalRect } from "./core.js";
import { PropCounter, ROOF_FLOURISH_RISE, type FitOutContext } from "./archetypes-civic.js";
import { pottedAt } from "./archetypes-wave2.js";

/* -------------------------------------------------------------------------- */
/* the archetypes                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The twelve archetypes this file fits out, in catalog order.
 *
 * Spread into `BUILDING_ARCHETYPES` by `archetypes.ts`: the seven industrial
 * ones first, then the five modern ones.
 */
export const INDUSTRY_BUILDING_ARCHETYPES = [
  "brickworks",
  "blast_furnace_works",
  "factory_hall",
  "machine_shop",
  "refinery",
  "charcoal_burner",
  "ropewalk",
  "parking_garage",
  "gas_station",
  "data_center",
  "conference_center",
  "brutalist_block",
] as const;

/** One of the archetypes this file fits out. */
export type IndustryBuildingArchetype = (typeof INDUSTRY_BUILDING_ARCHETYPES)[number];

/** True for an archetype this file answers to. */
export function isIndustryArchetype(value: string): value is IndustryBuildingArchetype {
  return (INDUSTRY_BUILDING_ARCHETYPES as readonly string[]).includes(value);
}

/**
 * Tag → archetype, or `null` when nothing matches.
 *
 * Consulted after the dwellings and *before* the extended table, for the reason
 * every later wave sits there: the tables under it are greedy. Every near miss
 * below is deliberate, and each one would otherwise have been a silent theft:
 *
 * - **`kiln` is wave two's** pottery kiln, so the brickworks — which borrows
 *   that kiln's core wholesale — answers to `brickworks` and `brickyard` only;
 * - **`foundry` and `casting` are wave 3B's**, so the blast-furnace works takes
 *   `blast_furnace_works` and `blast_furnace`. The second is a *block* name
 *   rather than a tag any table claimed, which is why it is safe here;
 * - `mill`, `sawmill`, `tannery` and `craft` are the windmill's, wave two's and
 *   the smithy's, so `factory_hall` claims `factory_hall` and `factory` — bare
 *   `factory` belonged to nothing before this file;
 * - `shop`, `store` and `grocer` are the general store's and the granary's, so
 *   the machine shop takes `machine_shop` and `machinist` — never bare `shop`;
 * - `store` again for the data centre, which takes `data_center`, `datacenter`
 *   and `server_farm`;
 * - `hall` is the great hall's and `auditorium` the lecture hall's, so the
 *   conference centre takes `conference_center` and `convention_center`;
 * - `apartment` and `tower_block` are the tall grammar's, so the brutalist
 *   block takes `brutalist_block` and `brutalist`.
 */
export function industryArchetypeOfTags(
  tags: readonly string[],
): IndustryBuildingArchetype | null {
  const has = (t: string): boolean => tags.includes(t);
  if (has("brickworks") || has("brickyard")) return "brickworks";
  if (has("blast_furnace_works") || has("blast_furnace")) return "blast_furnace_works";
  if (has("factory_hall") || has("factory")) return "factory_hall";
  if (has("machine_shop") || has("machinist")) return "machine_shop";
  if (has("refinery") || has("oil_refinery")) return "refinery";
  if (has("charcoal_burner") || has("charcoal") || has("collier")) return "charcoal_burner";
  if (has("ropewalk") || has("ropery")) return "ropewalk";
  if (has("parking_garage") || has("car_park")) return "parking_garage";
  if (has("gas_station") || has("filling_station") || has("petrol_station")) return "gas_station";
  if (has("data_center") || has("datacenter") || has("server_farm")) return "data_center";
  if (has("conference_center") || has("convention_center")) return "conference_center";
  if (has("brutalist_block") || has("brutalist")) return "brutalist_block";
  return null;
}

/**
 * Facade tendencies for this file's archetypes.
 *
 * Same contract as `archetypeFacadeDefaults`: defaults a caller merges into its
 * params, never something applied over an explicit one. The genre splits three
 * ways — a works wants a wide sparse-lit shed, a modern box wants a flat roof,
 * and the two rooms people sit in want daylight.
 */
export function industryFacadeDefaults(
  archetype: string,
): { readonly windowShape?: string; readonly windowRhythm?: string; readonly roof?: string } {
  switch (archetype) {
    // Heat, not daylight — and a roof that sheds over a long shed.
    case "brickworks":
      return { windowShape: "single", windowRhythm: "sparse", roof: "gable" };
    case "blast_furnace_works":
      return { windowShape: "single", windowRhythm: "sparse", roof: "hip" };
    // A machine floor is worked by eye, so the shed is as bright as walls allow.
    case "factory_hall":
      return { windowShape: "mullion", windowRhythm: "dense", roof: "gable" };
    case "machine_shop":
      return { windowShape: "mullion", windowRhythm: "regular", roof: "gable" };
    // Tanks and pipework want nothing to look at.
    case "refinery":
      return { windowShape: "single", windowRhythm: "sparse", roof: "flat" };
    // A collier's shed is barely a building.
    case "charcoal_burner":
      return { windowShape: "single", windowRhythm: "sparse", roof: "gable" };
    // The long alley: light down its whole length.
    case "ropewalk":
      return { windowShape: "single", windowRhythm: "regular", roof: "gable" };
    // A deck is an open edge, so the openings are as wide as the wall allows.
    case "parking_garage":
      return { windowShape: "mullion", windowRhythm: "dense", roof: "flat" };
    case "gas_station":
      return { windowShape: "mullion", windowRhythm: "dense", roof: "flat" };
    // Windowless on purpose: a hall of machines nobody sits in.
    case "data_center":
      return { windowShape: "single", windowRhythm: "sparse", roof: "flat" };
    case "conference_center":
      return { windowShape: "mullion", windowRhythm: "dense", roof: "flat" };
    // The facade is the whole building; the openings are punched, small, rare.
    case "brutalist_block":
      return { windowShape: "single", windowRhythm: "sparse", roof: "flat" };
    default:
      return {};
  }
}

/* -------------------------------------------------------------------------- */
/* exterior primitives                                                         */
/* -------------------------------------------------------------------------- */

/**
 * What exterior work needs to know, or `null` when it may not run.
 *
 * The blitz file's `ExteriorPlan`, restated rather than imported because the
 * waves are separate seams and a shared private helper is a shared edit. The
 * refusal is the same: a **plain rect** only — an L has a reflex corner none of
 * these routines has a rule for.
 */
interface IndustryPlan {
  /** Envelope extents. */
  readonly sx: number;
  readonly sz: number;
  /** Highest Y anything may occupy: the shell's roof top plus the allowance. */
  readonly top: number;
}

/** The plan for work on the walls and in the apron. */
function wallPlan(ctx: FitOutContext): IndustryPlan | null {
  const sx = ctx.size[0];
  const sz = ctx.size[2];
  const it = ctx.interior;
  if (it.x0 !== 1 || it.z0 !== 1 || it.x1 !== sx - 2 || it.z1 !== sz - 2) return null;
  return { sx, sz, top: ctx.roofTop + ROOF_FLOURISH_RISE };
}

/** Blocks a re-clad may never overwrite: the way in, the way up, the lights. */
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

/**
 * True when a cell is the doorstep or the door column itself.
 *
 * Nothing in the apron may stand here: it is the one route the road pass has to
 * reach, and a post on it is a building with no way in.
 */
function onWayIn(ctx: FitOutContext, x: number, z: number): boolean {
  if (ctx.door === null) return false;
  const d = ctx.door;
  if (x === d.x && z === d.z) return true;
  return Math.abs(x - d.x) + Math.abs(z - d.z) <= 2 && (x === d.x || z === d.z);
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

/**
 * Stand a column in an apron cell, on the **actual ground**.
 *
 * The lesson the cathedral's buttresses paid for: the apron is not always at
 * `y = 1`. When `blockAt(x, 0, z)` is empty the ground course is written first,
 * or the post's foot is air and the support-chain rule fails.
 *
 * Returns the number of blocks written, or `0` when the cell is on the way in.
 */
function groundedPost(
  ctx: FitOutContext,
  x: number,
  z: number,
  top: number,
  block: string,
): number {
  if (onWayIn(ctx, x, z)) return 0;
  let n = 0;
  if (ctx.blockAt(x, 0, z) === undefined) {
    ctx.put(x, 0, z, block);
    n++;
  }
  for (let y = 1; y <= top; y++) {
    ctx.put(x, y, z, block);
    n++;
  }
  return n;
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
 * The kiln core, the furnace bank, the stage and the burn pile are the same
 * idea: the thing you walk *towards*. Returns the z of that end and the
 * cardinal a person in the room faces to look at it.
 */
function farEnd(ctx: FitOutContext): { readonly z: number; readonly look: Cardinal } {
  const it = ctx.interior;
  const north = ctx.door === null ? true : ctx.door.z > (it.z0 + it.z1) / 2;
  return north ? { z: it.z0, look: "north" } : { z: it.z1, look: "south" };
}

/** The z of the end the door is at — the near end of the room. */
function nearZ(ctx: FitOutContext): number {
  const it = ctx.interior;
  return farEnd(ctx).look === "north" ? it.z1 : it.z0;
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
function indTable(ctx: FitOutContext, c: PropCounter, x: number, z: number): boolean {
  if (ctx.storyHeight < 4) {
    return c.put1(x, z, ctx.style["stone.slab"] as string, { type: "top", waterlogged: "false" });
  }
  if (!c.put1(x, z, ctx.style["wall.fence"] as string)) return false;
  c.stack(x, z, 2, "oak_pressure_plate", { powered: "false" });
  return true;
}

/**
 * True when a body has room to stand on a step this fit-out builds.
 *
 * A ramp stair and a charging platform are both things a player is meant to
 * climb onto, and a stander needs a course of air over their head: `floors < 2`
 * (nothing above but roof) or a storey of four or more.
 */
function standerHeadroom(ctx: FitOutContext): boolean {
  return ctx.floors < 2 || ctx.storyHeight >= 4;
}

/**
 * A run along one side wall, every `stride` cells, from a callback.
 *
 * Wave 3B's helper, restated. `stride` is what keeps a run from becoming a
 * palisade: a machinist has to be able to stand between two of their own
 * machines.
 */
function wallRun(
  ctx: FitOutContext,
  stride: number,
  phase: number,
  put: (z: number) => void,
): void {
  const it = ctx.interior;
  for (let z = it.z0; z <= it.z1; z++) {
    if ((((z - it.z0) % stride) + stride) % stride !== phase) continue;
    put(z);
  }
}

/** A shelf of trapdoors up a side wall — the cheapest honest rack there is. */
function rack(ctx: FitOutContext, c: PropCounter, x: number, facing: Cardinal, stride = 2): void {
  const trapdoor = ctx.style["wall.trapdoor"] as string;
  const y = Math.min(2, ctx.storyHeight - 1);
  wallRun(ctx, stride, 0, (z) => {
    c.stack(x, z, y, trapdoor, {
      facing,
      half: "top",
      open: "false",
      powered: "false",
      waterlogged: "false",
    });
  });
}

/**
 * One prop somewhere on a row, offered every cell of it in turn.
 *
 * A works has exactly one clocking desk, one control desk, one ops chest, and
 * "put it at `x0 + 1`" is how a building ends up without one: the stair column,
 * the door approach and the hearth reserve can each eat any particular cell,
 * and `put1` refuses rather than replaces.
 */
function putOnRow(
  c: PropCounter,
  it: LocalRect,
  z: number,
  block: string,
  props?: Record<string, string>,
): boolean {
  for (let x = it.x0; x <= it.x1; x++) {
    if (c.put1(x, z, block, props)) return true;
  }
  return false;
}

/** A barrel, stacked two high where the storey has room for the second one. */
function barrelStack(ctx: FitOutContext, c: PropCounter, x: number, z: number): boolean {
  if (!c.put1(x, z, "barrel", { facing: "up", open: "false" })) return false;
  if (ctx.storyHeight >= 4) c.stack(x, z, 2, "barrel", { facing: "up", open: "false" });
  return true;
}

/**
 * Recolour the floor plane over an inclusive rect.
 *
 * A carpet is a block at `y = 1`, which costs the room a walkable cell for
 * every cell of rug; the floor plane costs nothing and reads the same from a
 * standing eye. Every clay bay, bay stripe, raised-floor grid and collier's
 * clearing in this file is written this way and never as carpet.
 */
function floorPaint(
  ctx: FitOutContext,
  rect: LocalRect,
  block: (x: number, z: number) => string,
): number {
  let n = 0;
  for (let z = rect.z0; z <= rect.z1; z++) {
    for (let x = rect.x0; x <= rect.x1; x++) {
      ctx.put(x, 0, z, block(x, z));
      n++;
    }
  }
  return n;
}

/**
 * A field of rows facing the far end — wave 4C's bank discipline, restated.
 *
 * Three constraints are built in, and every one of them came back from a
 * walkthrough: a **three-column aisle** centred on the lantern's column, a
 * **one-cell clear lane** round the whole field, and **alternate rows only**,
 * so a body can leave the row it is in without climbing the next one.
 */
function bankCells(
  ctx: FitOutContext,
  end: { readonly z: number; readonly look: Cardinal },
  startGap = 2,
  step = 2,
): { readonly x: number; readonly z: number; readonly row: number }[] {
  const it = ctx.interior;
  const lamp = lanternColumn(it);
  const aisle0 = Math.max(it.x0, lamp.x - 1);
  const aisle1 = Math.min(it.x1, lamp.x + 1);
  const dir = end.look === "north" ? 1 : -1;
  const out: { x: number; z: number; row: number }[] = [];
  for (let k = startGap, row = 0; ; k += step, row++) {
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
 * A dais at the far end: top slabs across the end row, minus any cells kept.
 *
 * A top slab is a half step, so a dais is walkable rather than a wall, and it
 * goes through the prop counter so a cell the shell reserved is simply not
 * raised.
 */
function dais(
  ctx: FitOutContext,
  c: PropCounter,
  z: number,
  keep: ReadonlySet<number> = new Set(),
): void {
  const it = ctx.interior;
  const slab = ctx.style["stone.slab"] as string;
  for (let x = it.x0; x <= it.x1; x++) {
    if (keep.has(x)) continue;
    c.put1(x, z, slab, { type: "top", waterlogged: "false" });
  }
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
export function furnishIndustry(ctx: FitOutContext): number {
  if (!isIndustryArchetype(ctx.archetype)) return 0;
  const c = new PropCounter(ctx);
  switch (ctx.archetype) {
    case "brickworks":
      fitBrickworks(ctx, c);
      break;
    case "blast_furnace_works":
      fitBlastFurnaceWorks(ctx, c);
      break;
    case "factory_hall":
      fitFactoryHall(ctx, c);
      break;
    case "machine_shop":
      fitMachineShop(ctx, c);
      break;
    case "refinery":
      fitRefinery(ctx, c);
      break;
    case "charcoal_burner":
      fitCharcoalBurner(ctx, c);
      break;
    case "ropewalk":
      fitRopewalk(ctx, c);
      break;
    case "parking_garage":
      fitParkingGarage(ctx, c);
      break;
    case "gas_station":
      fitGasStation(ctx, c);
      break;
    case "data_center":
      fitDataCenter(ctx, c);
      break;
    case "conference_center":
      fitConferenceCenter(ctx, c);
      break;
    case "brutalist_block":
    default:
      fitBrutalistBlock(ctx, c);
      break;
  }
  return c.n;
}

/* -------------------------------------------------------------------------- */
/* industrial                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * `brickworks` — drying racks of green brick, a kiln core, and the clay bays.
 *
 * The **kiln core** is wave two's, block for block: brickwork on the far wall
 * row with the fire in its mouth at `y = 2` rather than on the floor of the
 * room, because a campfire is a body-blocking cell and one of those in a lane
 * seals it. It is only lit where the storey has the course to spare.
 *
 * The **drying racks** are stacks of brick up the west wall with trapdoor
 * shelves over them; the **clay bays** are a floor recolour — mud and clay in
 * the two door-end corners, so the pits read as recessed without a single cell
 * of the floor plane being a hole a body can fall into.
 */
function fitBrickworks(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const end = farEnd(ctx);
  const facing = opposite(end.look);
  const near = nearZ(ctx);

  // The clay bays: two floor-plane pits at the door end, one either side.
  const dir = end.look === "north" ? -1 : 1;
  const bayZ0 = Math.min(near, near + dir * 2);
  const bayZ1 = Math.max(near, near + dir * 2);
  c.n += floorPaint(
    ctx,
    { x0: it.x0, z0: bayZ0, x1: it.x0 + 1, z1: bayZ1 },
    (x, z) => ((x + z) % 3 === 0 ? "clay" : "packed_mud"),
  );
  c.n += floorPaint(
    ctx,
    { x0: it.x1 - 1, z0: bayZ0, x1: it.x1, z1: bayZ1 },
    (x, z) => ((x + z) % 3 === 0 ? "clay" : "packed_mud"),
  );

  // The kiln core, on the far wall row, with its mouth over the middle of it.
  let mouth: { x: number; z: number } | null = null;
  for (let x = it.x0 + 1; x <= it.x1 - 1; x++) {
    if ((x - it.x0) % 2 !== 0) continue;
    if (!c.put1(x, end.z, "bricks")) continue;
    if (mouth === null) mouth = { x, z: end.z };
  }
  if (mouth !== null && ctx.storyHeight >= 4) {
    c.stack(mouth.x, mouth.z, 2, "campfire", {
      facing,
      lit: "false",
      signal_fire: "false",
      waterlogged: "false",
    });
  }
  c.put1(it.x0, end.z, "furnace", { facing, lit: "false" });
  c.put1(it.x1, end.z, "smoker", { facing, lit: "false" });

  // The drying racks: green brick stacked up the west wall, shelves over them.
  wallRun(ctx, 2, 0, (z) => {
    if (!c.put1(it.x0, z, "bricks")) return;
    if (ctx.storyHeight >= 4) c.stack(it.x0, z, 2, "brick_slab", { type: "bottom", waterlogged: "false" });
  });
  // The shelf rack sits at y=2 — head height under a three-course storey,
  // where it turns the open wall-row cells beneath it into sealed pockets
  // (the lint caught three brickworks). Racks only where a head clears them.
  if (ctx.storyHeight >= 4) rack(ctx, c, it.x1, "west", 2);
  // The slip tubs and the barrows, up the east wall.
  wallRun(ctx, 3, 1, (z) => {
    c.put1(it.x1, z, "cauldron", { level: "0" });
  });
  c.put1(it.x0, near, "composter", { level: "0" });
  c.put1(it.x1, near, "chest", { facing, type: "single" });
}

/**
 * `blast_furnace_works` — a furnace bank in a masonry core, slag, a charging deck.
 *
 * The **core** is deepslate brick across the far wall row with blast furnaces
 * set into it, and the **tuyere** read is a course of waxed copper standing on
 * the core rather than on the floor: waxed and not plain, because plain copper
 * oxidises in play and a works that turns green in a fortnight is a different
 * building every time you look at it.
 *
 * The **charging platform** is a run of top slabs along the west wall — a half
 * step a body mounts, so it is only built where {@link standerHeadroom} says
 * the body fits. The slag store is barrels up the east wall.
 */
function fitBlastFurnaceWorks(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const end = farEnd(ctx);
  const facing = opposite(end.look);
  const near = nearZ(ctx);

  for (let x = it.x0; x <= it.x1; x++) {
    const bank = (x - it.x0) % 2 === 0;
    if (!c.put1(x, end.z, bank ? "blast_furnace" : "deepslate_bricks", bank ? { facing, lit: "false" } : undefined)) {
      continue;
    }
    // The tuyeres: copper on the masonry between the furnaces, never over one.
    if (!bank) c.stack(x, end.z, 2, "waxed_copper_block");
  }

  // The charging deck: a half step along the west wall, only where a body fits
  // on it.
  if (standerHeadroom(ctx)) {
    const slab = ctx.style["stone.slab"] as string;
    wallRun(ctx, 1, 0, (z) => {
      c.put1(it.x0, z, slab, { type: "top", waterlogged: "false" });
    });
  } else {
    wallRun(ctx, 3, 0, (z) => {
      c.put1(it.x0, z, "deepslate_bricks");
    });
  }

  // The slag store and the quench tubs, up the east wall.
  wallRun(ctx, 3, 0, (z) => {
    barrelStack(ctx, c, it.x1, z);
  });
  wallRun(ctx, 3, 1, (z) => {
    c.put1(it.x1, z, "cauldron", { level: "0" });
  });
  c.put1(it.x0, near, "iron_block");
  c.put1(it.x1, near, "chest", { facing, type: "single" });
}

/**
 * `factory_hall` — long machine rows, a drive shaft under the plate, a clocking desk.
 *
 * The **machine rows** are smithing and fletching tables alternating up both
 * side walls: vanilla blocks whose models are benches with work on them, and
 * nothing redstone, because a piston in a wall is a trap rather than a machine.
 *
 * The **drive shaft** is a fence line run along the middle of the hall at
 * `storyHeight - 1` — the course under the ceiling — and it is only built where
 * that course is over a body's head *and* the ceiling above it is solid, so the
 * shaft hangs from something. Under a three-course storey there is no such
 * course and the hall simply has no shaft.
 */
function fitFactoryHall(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const end = farEnd(ctx);
  const facing = opposite(end.look);
  const near = nearZ(ctx);
  const lamp = lanternColumn(it);

  let k = 0;
  wallRun(ctx, 2, 0, (z) => {
    c.put1(it.x0, z, k++ % 2 === 0 ? "smithing_table" : "fletching_table");
  });
  let j = 0;
  wallRun(ctx, 2, 0, (z) => {
    c.put1(it.x1, z, j++ % 2 === 0 ? "fletching_table" : "smithing_table");
  });
  // The stock between the benches.
  wallRun(ctx, 4, 1, (z) => {
    c.put1(it.x1, z, "iron_block");
  });

  // The drive shaft: a line under the plate. A stripped log run and not a
  // fence one — a fence's support chain walks DOWN to solid, so a fence in
  // mid-air fails the lint no matter what hangs above it (the lint caught
  // exactly this in the Terrarium). A continuous run of full cubes is legal
  // by every rule — each log touches the next, so none has six air faces —
  // and line shafting was always a turned log anyway.
  const shaftY = ctx.storyHeight - 1;
  if (shaftY >= 3) {
    const log = ctx.style["wall.log"] as string | undefined;
    const shaft = log ?? "stripped_oak_wood";
    for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
      c.stack(lamp.x, z, shaftY, shaft, { axis: "z" });
    }
  }

  // The clocking desk by the door, and the finished-goods end.
  putOnRow(c, it, near, "lectern", { facing: end.look, has_book: "false", powered: "false" });
  putOnRow(c, it, end.z, "barrel", { facing: "up", open: "false" });
  c.put1(it.x0, end.z, "chest", { facing, type: "single" });
  c.put1(it.x1, end.z, "crafting_table");
}

/**
 * `machine_shop` — lathes down one wall, tool boards up the other, swarf barrels.
 *
 * The **lathes** are stonecutters, which are the only block in the palette
 * whose model is a bed with a blade over it, all turned to face the floor they
 * are worked from. The **tool board** is a trapdoor rack, and the **work
 * lights** are wall torches at head height on the interior face of the west
 * wall: a torch is passable, so a light on a wall row costs the room nothing.
 */
function fitMachineShop(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const end = farEnd(ctx);
  const facing = opposite(end.look);
  const near = nearZ(ctx);

  wallRun(ctx, 2, 0, (z) => {
    c.put1(it.x0, z, "stonecutter", { facing: "east" });
  });
  // The work lights, between the lathes and out of the floor's way entirely.
  // A wall torch brackets to a FULL block: a window pane at that course is
  // "something there" but nothing a bracket holds to — the lint caught two
  // machine shops with torches on their glazing. Occupied is not enough; the
  // bracket cell must not be glass.
  wallRun(ctx, 4, 1, (z) => {
    const bracket = ctx.blockAt(it.x0 - 1, 2, z);
    if (bracket === undefined) return;
    const name = bracket.block;
    if (name.includes("glass") || name.includes("pane")) return;
    c.stack(it.x0, z, 2, "wall_torch", { facing: "east" });
  });

  rack(ctx, c, it.x1, "west", 2);
  wallRun(ctx, 3, 0, (z) => {
    barrelStack(ctx, c, it.x1, z);
  });

  // The bench end: a grindstone, an anvil and the parts store.
  c.put1(it.x0, end.z, "grindstone", { face: "floor", facing });
  putOnRow(c, it, end.z, "anvil", { facing: "north" });
  putOnRow(c, it, end.z, "smithing_table");
  c.put1(it.x1, end.z, "chest", { facing, type: "single" });
  c.put1(it.x0, near, "composter", { level: "0" });
}

/**
 * `refinery` — pipe runs on the walls, tank pedestals, a control desk. No flame.
 *
 * The **pipe runs** are courses of waxed copper at head height along both side
 * walls, standing on the tank pedestals rather than floating: waxed so the
 * building looks the same in a fortnight as it does on the day it lands.
 *
 * The **tanks** are iron blocks on the wall rows with a cauldron between them —
 * a container, not a fluid. Nothing here writes water and nothing here writes
 * lava: an open source flows, and the physics lint's zero-unstable-fluids rule
 * is not negotiable. There is no fire in this building at all.
 */
function fitRefinery(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const end = farEnd(ctx);
  const facing = opposite(end.look);
  const near = nearZ(ctx);

  for (const x of [it.x0, it.x1]) {
    // The tanks, spaced so the wall row is not a palisade.
    wallRun(ctx, 3, 0, (z) => {
      if (!c.put1(x, z, "iron_block")) return;
      // The pipe standing on the tank: head height, over a solid foot.
      c.stack(x, z, 2, "waxed_copper_block");
    });
    // The catch tubs between them.
    wallRun(ctx, 3, 1, (z) => {
      c.put1(x, z, "cauldron", { level: "0" });
    });
  }

  // The control desk: a stone plinth on the far wall with levers on it.
  let desks = 0;
  for (let x = it.x0 + 1; x <= it.x1 - 1; x++) {
    if ((x - it.x0) % 2 !== 0) continue;
    if (!c.put1(x, end.z, "smooth_stone")) continue;
    desks++;
    c.stack(x, end.z, 2, "lever", { face: "floor", facing, powered: "false" });
  }
  if (desks === 0) putOnRow(c, it, end.z, "smooth_stone");
  c.put1(it.x0, end.z, "barrel", { facing: "up", open: "false" });
  c.put1(it.x1, end.z, "chest", { facing, type: "single" });
  c.put1(it.x1, near, "cauldron", { level: "0" });
}

/**
 * `charcoal_burner` — the collier's clearing: a turf-capped burn pile, log stores.
 *
 * The **burn pile** is the corbel idiom in miniature: a three-by-three foot of
 * coarse dirt against the far wall with a **solid** grass cap over its middle.
 * Solid and not a slab or a wall, because a partial block in the middle of a
 * mound is a hole a body drops into — the homestead's root-cellar lesson, and
 * the one rule this archetype cannot bend.
 *
 * The pile stands *against the far wall*, never in the middle of the floor, so
 * the ring around it stays a lane the whole way round. The clearing itself is a
 * floor recolour of coarse dirt and podzol; the log store is stacked timber up
 * one wall and the collier's corner is a chest, a barrel and a pot.
 */
function fitCharcoalBurner(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const end = farEnd(ctx);
  const facing = opposite(end.look);
  const near = nearZ(ctx);
  const lamp = lanternColumn(it);
  const dir = end.look === "north" ? 1 : -1;

  // The clearing.
  c.n += floorPaint(ctx, it, (x, z) => ((x * 3 + z) % 4 === 0 ? "podzol" : "coarse_dirt"));

  // The burn pile: a 3x3 foot against the far wall, its cap over the middle.
  const midZ = end.z + dir;
  let footprint = 0;
  for (let dz = 0; dz <= 2; dz++) {
    const z = end.z + dir * dz;
    if (z < it.z0 || z > it.z1) continue;
    if (z === lamp.z) continue;
    for (let x = lamp.x - 1; x <= lamp.x + 1; x++) {
      if (x < it.x0 || x > it.x1) continue;
      if (c.put1(x, z, "coarse_dirt")) footprint++;
    }
  }
  // THE SOLID CAP. A mound that closes on a partial block is a pit.
  if (footprint > 0 && midZ >= it.z0 && midZ <= it.z1 && midZ !== lamp.z) {
    c.stack(lamp.x, midZ, 2, "grass_block", { snowy: "false" });
  }

  // The log store, up both walls: timber stacked, and the cut cordwood between.
  const log = ctx.style["wall.accent"] as string;
  wallRun(ctx, 2, 0, (z) => {
    if (!c.put1(it.x0, z, log, { axis: "y" })) return;
    if (ctx.storyHeight >= 4) c.stack(it.x0, z, 2, log, { axis: "x" });
  });
  wallRun(ctx, 3, 0, (z) => {
    c.put1(it.x1, z, "hay_block", { axis: "y" });
  });
  // The collier's corner.
  c.put1(it.x1, near, "chest", { facing, type: "single" });
  c.put1(it.x0, near, "barrel", { facing: "up", open: "false" });
  c.put1(it.x1, end.z, pottedAt(it.x1, end.z));
}

/**
 * `ropewalk` — the long alley: rope lines down the hall, winding wheels, coils.
 *
 * The **rope lines** are runs of white wool at working height along both side
 * walls, and each run is anchored at both ends by a **fence post** standing on
 * the floor beneath it: a line held up at one end only is a floating block the
 * support rule has an opinion about. The lines stop at the last post, so no
 * cell of wool ever hangs off the end of the run.
 *
 * The **winding wheels** are the prize-wheel post at small scale — a laid log
 * with iron bars standing on it, which reads as a spoked drum — and the coil
 * stacks are wool on the floor at the door end.
 */
function fitRopewalk(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const end = farEnd(ctx);
  const facing = opposite(end.look);
  const near = nearZ(ctx);
  const fence = ctx.style["wall.fence"] as string;
  const lineY = Math.min(2, ctx.storyHeight - 1);

  for (const x of [it.x0, it.x1]) {
    // The posts, every fourth cell.
    const posts: number[] = [];
    wallRun(ctx, 4, 0, (z) => {
      if (c.put1(x, z, fence, {
        north: "false",
        south: "false",
        east: "false",
        west: "false",
        waterlogged: "false",
      })) {
        posts.push(z);
      }
    });
    if (posts.length < 2) continue;
    // The line, strictly between the first and the last post, so both ends of
    // every run stand on something.
    const first = posts[0] as number;
    const last = posts[posts.length - 1] as number;
    for (let z = first; z <= last; z++) {
      c.stack(x, z, lineY, "white_wool");
    }
  }

  // The winding wheels, at the far end.
  const drum = ctx.style["wall.frame"] as string;
  for (let x = it.x0 + 1; x <= it.x1 - 1; x++) {
    if ((x - it.x0) % 3 !== 0) continue;
    if (!c.put1(x, end.z, drum, { axis: "x" })) continue;
    c.stack(x, end.z, 2, "iron_bars", {
      north: "false",
      south: "false",
      east: "false",
      west: "false",
      waterlogged: "false",
    });
  }
  c.put1(it.x0, end.z, "chest", { facing, type: "single" });
  // The coil stacks by the door.
  c.put1(it.x1, end.z, "white_wool");
  c.put1(it.x0, near, "white_wool");
  c.put1(it.x1, near, "barrel", { facing: "up", open: "false" });
}

/* -------------------------------------------------------------------------- */
/* modern                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * `parking_garage` — painted bays, a concrete deck, a ramp, a barrier arm.
 *
 * The **bays** are the whole read and they cost nothing: the floor plane goes
 * gray concrete with white stripes every third column, so a deck reads as
 * parking from a standing eye without one walkable cell being spent on paint.
 *
 * The **ramp** is a stair run against the east wall, all one facing, and it is
 * only laid where {@link standerHeadroom} says a body fits on it — otherwise
 * the deck is flat plates and stripes, which is the honest answer for a
 * three-course storey. The **barrier arm** is an iron bar on a concrete plinth
 * beside the door, never on the doorstep.
 */
function fitParkingGarage(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const end = farEnd(ctx);
  const near = nearZ(ctx);

  // The bays.
  c.n += floorPaint(ctx, it, (x) =>
    (((x - it.x0) % 3) + 3) % 3 === 0 ? "white_concrete" : "gray_concrete",
  );

  if (standerHeadroom(ctx)) {
    // The ramp: a stair run up the east wall, one facing the whole way.
    const stairs = ctx.style["stone.stairs"] as string;
    wallRun(ctx, 1, 0, (z) => {
      c.put1(it.x1, z, stairs, {
        facing: end.look,
        half: "bottom",
        shape: "straight",
        waterlogged: "false",
      });
    });
  } else {
    // No ramp on a short storey: plates and stripes only.
    const slab = ctx.style["stone.slab"] as string;
    wallRun(ctx, 2, 0, (z) => {
      c.put1(it.x1, z, slab, { type: "top", waterlogged: "false" });
    });
  }

  // The concrete trim: a banded course at head height on the west wall.
  wallRun(ctx, 2, 0, (z) => {
    c.stack(it.x0, z, Math.min(2, ctx.storyHeight - 1), "light_gray_concrete");
  });

  // The barrier arm: beside the way in, on a plinth of its own.
  let armed = false;
  for (let x = it.x0; x <= it.x1 && !armed; x++) {
    if (!c.put1(x, near, "polished_andesite")) continue;
    armed = c.stack(x, near, 2, "iron_bars", {
      north: "false",
      south: "false",
      east: "true",
      west: "true",
      waterlogged: "false",
    });
  }
  c.put1(it.x0, end.z, "barrel", { facing: "up", open: "false" });
}

/**
 * `gas_station` — a forecourt canopy on grounded posts, pumps, a shop corner.
 *
 * The **canopy** is the only thing in this file that lives outside the walls,
 * and it lives in the apron — the one-block ring the eave already uses — on the
 * door's own face. Its posts are written by {@link groundedPost}, which fills
 * the `y = 0` cell when `blockAt` says there is nothing there: **an apron prop
 * stands on the actual ground**, and a post whose foot is air fails the
 * support-chain rule. Nothing stands on the doorstep.
 *
 * The **pumps** are iron blocks with a lever on them under that canopy; the
 * shop corner is the convenience store's gondola idiom in miniature, and the
 * price board is a wall banner because a sign block is a block entity the local
 * op stream cannot carry.
 */
function fitGasStation(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const end = farEnd(ctx);
  const facing = opposite(end.look);
  const near = nearZ(ctx);
  const plan = wallPlan(ctx);

  if (plan !== null && ctx.door !== null) {
    // The forecourt: the apron row on the door's own face.
    const doorFaceZ = ctx.door.z <= 0 ? -1 : ctx.door.z >= plan.sz - 1 ? plan.sz : null;
    const deck = Math.min(ctx.wallTop, plan.top - 1);
    if (doorFaceZ !== null && deck >= 2) {
      const row = apronOf(plan.sx, plan.sz).filter((cell) => cell.z === doorFaceZ);
      let posts = 0;
      for (const cell of row) {
        if (cell.x < 0 || cell.x >= plan.sx) continue;
        // A post every fourth bay and one at each end: a deck spanning the
        // whole forecourt off two posts is a plank, not a canopy.
        const post = cell.x % 4 === 0 || cell.x === plan.sx - 1;
        if (post) {
          const wrote = groundedPost(ctx, cell.x, cell.z, deck - 1, "polished_andesite");
          c.n += wrote;
          if (wrote > 0) posts++;
          continue;
        }
        // The pumps, under the canopy, between the posts.
        if (onWayIn(ctx, cell.x, cell.z)) continue;
        if (cell.x % 2 === 1 && ctx.blockAt(cell.x, 1, cell.z) === undefined) {
          if (ctx.blockAt(cell.x, 0, cell.z) === undefined) {
            ctx.put(cell.x, 0, cell.z, "polished_andesite");
            c.n++;
          }
          ctx.put(cell.x, 1, cell.z, "iron_block");
          ctx.put(cell.x, 2, cell.z, "lever", {
            face: "floor",
            facing: doorFaceZ < 0 ? "north" : "south",
            powered: "false",
          });
          c.n += 2;
        }
      }
      // The canopy deck: slabs across the whole forecourt row, once it has
      // posts to stand on.
      if (posts > 0) {
        for (const cell of row) {
          if (cell.x < 0 || cell.x >= plan.sx) continue;
          ctx.put(cell.x, deck, cell.z, "smooth_stone_slab", {
            type: "bottom",
            waterlogged: "false",
          });
          c.n++;
        }
      }
    }
  }

  // The shop: gondolas on the bank discipline, a counter and a cold cabinet.
  for (const cell of bankCells(ctx, end, 2)) {
    const block = (cell.x + cell.z) % 3 === 0 ? "barrel" : "bookshelf";
    c.put1(cell.x, cell.z, block, block === "barrel" ? { facing: "up", open: "false" } : undefined);
  }
  const counter = ctx.style["wall.frame"] as string;
  for (let x = it.x0; x <= it.x1; x++) {
    c.put1(x, end.z, counter, { axis: "x" });
  }
  // The price board: a wall banner over the counter, never a sign block.
  ctx.put(it.x0, 2, end.z, "yellow_wall_banner", { facing: "east" });
  c.n++;
  c.put1(it.x1, near, "chest", { facing, type: "single" });
  c.put1(it.x0, near, "cauldron", { level: "0" });
}

/**
 * `data_center` — server rack rows, a raised-floor grid, cooling, an ops desk.
 *
 * The **racks** are iron blocks laid on wave 4C's bank discipline: alternate
 * rows, a three-column aisle off the lantern's column and a one-cell lane
 * around the whole field, so a hall of machines is still a hall a body walks.
 * Every other rack carries a **lever** standing on it — a passable block, so a
 * switch costs the aisle nothing.
 *
 * The **raised floor** is a checker in the floor plane, and the **cooling** is
 * cauldrons on the far wall row: a container, never a fluid.
 */
function fitDataCenter(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const end = farEnd(ctx);
  const facing = opposite(end.look);
  const near = nearZ(ctx);

  c.n += floorPaint(ctx, it, (x, z) =>
    (x + z) % 2 === 0 ? "light_gray_concrete" : "gray_concrete",
  );

  for (const cell of bankCells(ctx, end, 2)) {
    if (!c.put1(cell.x, cell.z, "iron_block")) continue;
    if ((cell.x + cell.z) % 2 !== 0) continue;
    c.stack(cell.x, cell.z, 2, "lever", { face: "floor", facing, powered: "false" });
  }

  // The cooling plant and the ops desk.
  for (let x = it.x0; x <= it.x1; x++) {
    if ((x - it.x0) % 2 !== 0) continue;
    c.put1(x, end.z, "cauldron", { level: "0" });
  }
  c.put1(it.x0, end.z, "chest", { facing, type: "single" });
  indTable(ctx, c, it.x0, near);
  putOnRow(c, it, near, "lectern", { facing: end.look, has_book: "false", powered: "false" });
  c.put1(it.x1, near, "barrel", { facing: "up", open: "false" });
}

/**
 * `conference_center` — a stage dais, seat banks, breakout bays, a lobby.
 *
 * The school's discipline at scale. The **dais** is top slabs across the far
 * row, which is a half step rather than a wall, so the room walks onto it. The
 * **house** is one flat seat bank: flat and not raked, because a riser is a
 * stair a body stands on and a bank that raked itself only on the tall
 * envelopes would be two buildings wearing one name.
 *
 * Every seat's `facing` is its **backrest**, so a seat looking at the stage
 * carries the cardinal pointing away from it. The **breakout bays** are tables
 * on the two near corners and the **lobby** is the near row: a pot, a bench and
 * nothing a body trips over.
 */
function fitConferenceCenter(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const end = farEnd(ctx);
  const near = nearZ(ctx);
  const seat = ctx.style["stair.interior"] as string;
  // THE SEAT RULE: `facing` names the stair's high half — the backrest.
  const backrest = opposite(end.look);

  dais(ctx, c, end.z, new Set([it.x0, it.x1]));
  // The lectern on the dais end, and the house banners either side of it.
  ctx.put(it.x0, 2, end.z, "blue_wall_banner", { facing: "east" });
  ctx.put(it.x1, 2, end.z, "blue_wall_banner", { facing: "west" });
  c.n += 2;

  for (const cell of bankCells(ctx, end, 3)) {
    c.put1(cell.x, cell.z, seat, { facing: backrest, half: "bottom", shape: "straight" });
  }

  // The breakout bays: a table on each side wall, well clear of the bank —
  // and only on a plan with the room for them. On a tight envelope the lobby
  // row is two cells deep, and a table on it plus the shell's own stair
  // reserve is how the near corner becomes a pocket a body cannot reach.
  const dir = end.look === "north" ? -1 : 1;
  const bayZ = near + dir;
  const roomy = it.x1 - it.x0 >= 6 && it.z1 - it.z0 >= 8;
  if (roomy && bayZ >= it.z0 && bayZ <= it.z1) {
    indTable(ctx, c, it.x0, bayZ);
    indTable(ctx, c, it.x1, bayZ);
  }
  // The lobby: the two near corners and nothing else. Nothing stands on the
  // lobby row between them — that row is the way in.
  c.put1(it.x0, near, pottedAt(it.x0, near));
  c.put1(it.x1, near, "barrel", { facing: "up", open: "false" });
}

/**
 * `brutalist_block` — the facade is the point: raw concrete and deep fins.
 *
 * Three moves and nothing else, because a fourth would be a different building.
 * The wall field becomes **gray concrete**; a **fin** stands in every third
 * column of the ring in polished andesite, from the plinth head to the plate,
 * with a **band** at the head of the plinth and one course under the plate, so
 * the fins read as a repeated order rather than as a fence with concrete in it.
 * The facade defaults ask for small, rare openings, and the re-clad refuses to
 * overwrite one.
 *
 * The interior is honest: a slab bench under each side wall, a chest and a
 * barrel at the far end, a pot by the door. Nothing stands in the middle.
 */
function fitBrutalistBlock(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const end = farEnd(ctx);
  const facing = opposite(end.look);
  const near = nearZ(ctx);
  const plan = wallPlan(ctx);

  if (plan !== null) {
    const top = ctx.wallTop - 1;
    for (const cell of ringOf(plan.sx, plan.sz)) {
      for (let y = 2; y <= top; y++) {
        const along = cell.x === 0 || cell.x === plan.sx - 1 ? cell.z : cell.x;
        const band = y === 2 || y === top;
        const fin = along % 3 === 0;
        const block = band || fin ? "polished_andesite" : "gray_concrete";
        if (clad(ctx, cell.x, y, cell.z, block)) c.n++;
      }
    }
  }

  const slab = ctx.style["stone.slab"] as string;
  wallRun(ctx, 2, 0, (z) => {
    c.put1(it.x0, z, slab, { type: "top", waterlogged: "false" });
  });
  wallRun(ctx, 3, 0, (z) => {
    c.put1(it.x1, z, "bookshelf");
  });
  putOnRow(c, it, end.z, "chest", { facing, type: "single" });
  putOnRow(c, it, end.z, "barrel", { facing: "up", open: "false" });
  c.put1(it.x0, near, pottedAt(it.x0, near));
  c.put1(it.x1, near, "composter", { level: "0" });
}
