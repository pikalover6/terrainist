/**
 * Archetype breadth, **wave six C** — waterworks and energy.
 *
 * `archetypes-blitz.ts` states the design law this file obeys and it is not
 * restated: **an archetype is a fit-out, not a second grammar.** A fit-out runs
 * after every shape stage — foundation, walls, windows, floors, roof, chimney —
 * and writes into the same cell map they did, where a later write to a cell
 * replaces an earlier one. So a pumping station is the ordinary shed with a
 * flywheel stood against its wall, and a gasworks is the ordinary shed with its
 * wall field re-clad as a banded holder. Neither is a new shell.
 *
 * `archetypes-industry.ts` is this file's direct kin — its refinery and its
 * blast-furnace works are the same genre — and wave five's kiln fire, wave 3B's
 * corbel and the bathhouse's pool are all borrowed here rather than re-derived.
 *
 * Ten buildings, in two groups:
 *
 * - **waterworks** — `water_tower`, `cistern`, `well`, `pumping_station`;
 * - **energy** — `substation`, `gasworks`, `steam_plant`, `biomass_shed`,
 *   `battery_shed`, `coal_tipple`.
 *
 * The wave's other two entries — `wind_turbine` and `solar_array` — are **not**
 * here. Neither has an inside: a turbine is a mast with three arms on it and an
 * array is rows of panels on the ground, and wrapping either in a shell with a
 * door and a lantern would be a lie about what it is. They go down the
 * `prop.place@0` pipeline instead, in `props-energy.ts`, exactly as the windpump
 * did while the curtain wall stayed linear.
 *
 * ## The field lessons this file was written against
 *
 * Every one is a rule below rather than a comment, and every one came back from
 * a walkthrough or from the physics lint:
 *
 * - a **stair's `facing` is its high half** — the backrest;
 * - a bare `flower_pot` renders **empty**; {@link pottedAt} (wave two's,
 *   imported rather than re-derived) picks a `potted_*` from position;
 * - the shell hangs a lantern over the **middle column** of the room at head
 *   height, so **nothing here writes at `y = 2` over open floor** unless the
 *   storey has four courses. Every dial wall, every drum topper and every
 *   banner label below is gated on `storyHeight >= 4`;
 * - the trestle idiom — a fence with a plate on it — is refused by the stack
 *   guard under a three-course storey, so {@link utilTable} switches to a slab;
 * - nothing body-blocking stands on a one-wide circulation lane — which is why
 *   the cistern's inspection walkway carries **nothing at all** — and anything
 *   a body is meant to stand *on* is only built where {@link standerHeadroom}
 *   says the body fits;
 * - **no sign blocks**: signage is a wall banner;
 * - **fluids are cauldrons**, with exactly one exception: the cistern, whose
 *   water follows the bathhouse pool predicate *verbatim* — a rect inset one
 *   cell from the interior, written into the **floor plane** at `y = 0`, so
 *   every water cell has the foundation skirt under it and pool, coping or
 *   shell floor on all four sides, and no prop ever stands on one;
 * - **apron props stand on the actual ground**: every column the water tower's
 *   legs and the tipple's trestle write above ground level fills its own
 *   `y = 0` cell first when `blockAt` says there is nothing there;
 * - **a mound, a drum and a mast close on a solid cap**, and a topper only ever
 *   stands on a **continuous** column — the turret lesson. Every course of the
 *   water tower's tank rests on the course below or on the deck, and every
 *   course of the tipple's trestle rests on the one below or on the beam that
 *   spans two posts;
 * - **no `chain` blocks** — the 1.21.11 table this emitter is pinned to has no
 *   entry for one, so anything hanging is `iron_bars`;
 * - **no plain `mud`** — a mud floor is a sink; `packed_mud` is the block;
 * - **torches only on full blocks**, so this file uses none at all and lights
 *   with lanterns standing on solid props.
 */

import type { Cardinal, LocalRect } from "./core.js";
import {
  PropCounter,
  type FitOutContext,
  roofPlan,
  wallPlan,
  type RebuildPlan,
} from "./archetypes-civic.js";
import { pottedAt } from "./archetypes-wave2.js";

/* -------------------------------------------------------------------------- */
/* the archetypes                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The ten archetypes this file fits out, in catalog order.
 *
 * Spread into `BUILDING_ARCHETYPES` by `archetypes.ts`: the four waterworks
 * first, then the six energy ones.
 */
export const UTILITY_BUILDING_ARCHETYPES = [
  "water_tower",
  "cistern",
  "well",
  "pumping_station",
  "substation",
  "gasworks",
  "steam_plant",
  "biomass_shed",
  "battery_shed",
  "coal_tipple",
] as const;

/** One of the archetypes this file fits out. */
export type UtilityBuildingArchetype = (typeof UTILITY_BUILDING_ARCHETYPES)[number];

/** True for an archetype this file answers to. */
export function isUtilityArchetype(value: string): value is UtilityBuildingArchetype {
  return (UTILITY_BUILDING_ARCHETYPES as readonly string[]).includes(value);
}

/**
 * Tag → archetype, or `null` when nothing matches.
 *
 * Consulted after the dwellings and *before* the extended table, for the reason
 * every later wave sits there: the tables under it are greedy. Every near miss
 * below is deliberate, and each one would otherwise have been a silent theft:
 *
 * - **`well_head` is the street prop's** — the little ring on the green — so
 *   the covered well *house* here answers to `well` and `well_house` only;
 * - **`tower` is the watchtower's**, so the water tower takes `water_tower` and
 *   `watertower` and never bare `tower`;
 * - **`windpump` is the waterworks prop's**, and `wind_turbine`/`turbine` are
 *   this wave's — they go to the turbine prop, not to anything here;
 * - `pump` is unclaimed by anything else, so the pumping station takes
 *   `pumping_station`, `pump_house` and `waterworks`;
 * - `bath`, `baths` and `sauna` are the bathhouse's, so the cistern — which
 *   borrows that bath's pool block for block — takes `cistern` and `reservoir`;
 * - `gas_station`, `filling_station` and `petrol_station` are wave 5C's, so the
 *   gasworks takes `gasworks`, `gasholder` and `gasometer`;
 * - `power_station` is left unclaimed for the catalog's own; the steam plant
 *   takes `steam_plant` and `powerhouse`;
 * - `barn`, `granary` and `store` are earlier tables', so the biomass shed
 *   takes `biomass_shed` and `biomass`;
 * - `battery_shed` and `battery` for the cells, `substation` and
 *   `transformer_station` for the yard, `coal_tipple` and `tipple` for the
 *   loader — none of those five words appears in any earlier table.
 */
export function utilityArchetypeOfTags(tags: readonly string[]): UtilityBuildingArchetype | null {
  const has = (t: string): boolean => tags.includes(t);
  if (has("water_tower") || has("watertower")) return "water_tower";
  if (has("cistern") || has("reservoir")) return "cistern";
  if (has("well") || has("well_house")) return "well";
  if (has("pumping_station") || has("pump_house") || has("waterworks")) return "pumping_station";
  if (has("substation") || has("transformer_station")) return "substation";
  if (has("gasworks") || has("gasholder") || has("gasometer")) return "gasworks";
  if (has("steam_plant") || has("powerhouse")) return "steam_plant";
  if (has("biomass_shed") || has("biomass")) return "biomass_shed";
  if (has("battery_shed") || has("battery")) return "battery_shed";
  if (has("coal_tipple") || has("tipple")) return "coal_tipple";
  return null;
}

/**
 * Facade tendencies for this file's archetypes.
 *
 * Same contract as `archetypeFacadeDefaults`: defaults a caller merges into its
 * params, never something applied over an explicit one. The genre splits three
 * ways — the two that build **above the eave** (the water tower's tank, the
 * tipple's trestle head) want a pitched roof, because a flat one leaves no
 * vertical room over the plate to build in; the sheds want a shed roof; and the
 * modern plant wants a flat deck and almost no glass.
 */
export function utilityFacadeDefaults(
  archetype: string,
): { readonly windowShape?: string; readonly windowRhythm?: string; readonly roof?: string } {
  switch (archetype) {
    // The tank is the building, and it needs the height over the plate.
    case "water_tower":
      return { windowShape: "single", windowRhythm: "sparse", roof: "hip" };
    // Light on the water: a cistern you cannot see into is a cellar.
    case "cistern":
      return { windowShape: "mullion", windowRhythm: "regular", roof: "gable" };
    case "well":
      return { windowShape: "single", windowRhythm: "regular", roof: "gable" };
    // A machine floor is worked by eye.
    case "pumping_station":
      return { windowShape: "mullion", windowRhythm: "regular", roof: "gable" };
    // Switchgear wants nothing to look at.
    case "substation":
      return { windowShape: "single", windowRhythm: "sparse", roof: "flat" };
    case "gasworks":
      return { windowShape: "single", windowRhythm: "sparse", roof: "hip" };
    case "steam_plant":
      return { windowShape: "mullion", windowRhythm: "dense", roof: "gable" };
    // Sheds: high, small and rare, like every store of fuel ever built.
    case "biomass_shed":
      return { windowShape: "single", windowRhythm: "sparse", roof: "gable" };
    case "battery_shed":
      return { windowShape: "single", windowRhythm: "sparse", roof: "flat" };
    case "coal_tipple":
      return { windowShape: "single", windowRhythm: "sparse", roof: "gable" };
    default:
      return {};
  }
}

/* -------------------------------------------------------------------------- */
/* exterior primitives                                                         */
/* -------------------------------------------------------------------------- */

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

/** Write a block on a wall-ring cell, unless what stands there is load-bearing. */
function clad(ctx: FitOutContext, x: number, y: number, z: number, block: string): boolean {
  const standing = ctx.blockAt(x, y, z);
  if (standing !== undefined && KEEP_AS_IS.test(standing.block)) return false;
  ctx.put(x, y, z, block);
  return true;
}

/** Re-clad the whole wall ring between two courses. */
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

/**
 * Stand a column in a cell, on the **actual ground**.
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
  props?: Record<string, string>,
): number {
  if (onWayIn(ctx, x, z)) return 0;
  let n = 0;
  if (ctx.blockAt(x, 0, z) === undefined) {
    ctx.put(x, 0, z, block, props);
    n++;
  }
  for (let y = 1; y <= top; y++) {
    ctx.put(x, y, z, block, props);
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
 * The end of the room furthest from the door — the thing you walk *towards*.
 *
 * Returns the z of that end and the cardinal a person in the room faces to look
 * at it.
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
 * True when the storey has a course to spare over a body's head.
 *
 * The one gate every head-height write in this file passes through: under a
 * three-course storey the cell at `y = 2` is where the shell's lantern hangs
 * and where a walking body's head goes, so nothing may be written there.
 */
function headHeightFree(ctx: FitOutContext): boolean {
  return ctx.storyHeight >= 4;
}

/**
 * One table cell, by the idiom the storey has headroom for.
 *
 * Wave two's rule, unchanged: the trestle — a fence stem with a plate on it —
 * is two blocks in one column, and under a three-course storey the second is
 * refused by the stack guard as an `interior.blocked_column`, leaving a bare
 * fence post that reads as a bollard. A top slab is one block at table height.
 */
function utilTable(ctx: FitOutContext, c: PropCounter, x: number, z: number): boolean {
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
 * climb onto, and a stander needs a course of air over their head.
 */
function standerHeadroom(ctx: FitOutContext): boolean {
  return ctx.floors < 2 || ctx.storyHeight >= 4;
}

/**
 * A run along one side wall, every `stride` cells, from a callback.
 *
 * Wave 3B's helper, restated. `stride` is what keeps a run from becoming a
 * palisade: a fitter has to be able to stand between two of their own machines.
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
  if (!headHeightFree(ctx)) return;
  const trapdoor = ctx.style["wall.trapdoor"] as string;
  wallRun(ctx, stride, 0, (z) => {
    c.stack(x, z, 2, trapdoor, {
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
 * A works has exactly one control desk, and "put it at `x0 + 1`" is how a
 * building ends up without one: the stair column, the door approach and the
 * hearth reserve can each eat any particular cell, and `put1` refuses rather
 * than replaces.
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
  if (headHeightFree(ctx)) c.stack(x, z, 2, "barrel", { facing: "up", open: "false" });
  return true;
}

/**
 * Recolour the floor plane over an inclusive rect.
 *
 * A carpet is a block at `y = 1`, which costs the room a walkable cell for
 * every cell of rug; the floor plane costs nothing and reads the same from a
 * standing eye. Every fuel bay, coal bay and yard surface in this file is
 * written this way and never as carpet, and every block used is a **full**
 * block a body stands on.
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
 * A wall of dials: buttons and levers on the **interior face** of a wall.
 *
 * Attached at the wall-row cell rather than written into the wall block itself,
 * so the thing they are stuck to is the wall behind them; skipped over glazing
 * and doors, where there is nothing to stick to; and only ever on a storey with
 * a course to spare over a head, because a dial at `y = 2` under a three-course
 * roof is an obstruction in the one band a body walks through.
 */
function dialWall(ctx: FitOutContext, c: PropCounter, z: number, face: Cardinal): void {
  if (!headHeightFree(ctx)) return;
  const it = ctx.interior;
  const wallZ = face === "south" ? z - 1 : z + 1;
  for (let x = it.x0; x <= it.x1; x++) {
    const behind = ctx.blockAt(x, 2, wallZ);
    if (behind === undefined || /glass|_pane$|_door$|air/.test(behind.block)) continue;
    c.stack(x, z, 2, (x + z) % 3 === 0 ? "lever" : "stone_button", {
      face: "wall",
      facing: face,
      powered: "false",
    });
  }
}

/**
 * The bathhouse's pool rect: the interior inset one cell all round, or `null`.
 *
 * Verbatim from `archetypes-town.ts`, and the inset is the whole fluid-safety
 * argument: every water cell has the shell's own floor cell on all four sides
 * or more pool, and the foundation skirt underneath. The one-cell ring it
 * leaves is also the inspection walkway, which is why nothing is ever placed
 * on it.
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
export function furnishUtility(ctx: FitOutContext): number {
  if (!isUtilityArchetype(ctx.archetype)) return 0;
  const c = new PropCounter(ctx);
  switch (ctx.archetype) {
    case "water_tower":
      fitWaterTower(ctx, c);
      break;
    case "cistern":
      fitCistern(ctx, c);
      break;
    case "well":
      fitWell(ctx, c);
      break;
    case "pumping_station":
      fitPumpingStation(ctx, c);
      break;
    case "substation":
      fitSubstation(ctx, c);
      break;
    case "gasworks":
      fitGasworks(ctx, c);
      break;
    case "steam_plant":
      fitSteamPlant(ctx, c);
      break;
    case "biomass_shed":
      fitBiomassShed(ctx, c);
      break;
    case "battery_shed":
      fitBatteryShed(ctx, c);
      break;
    case "coal_tipple":
    default:
      fitCoalTipple(ctx, c);
      break;
  }
  return c.n;
}

/* -------------------------------------------------------------------------- */
/* waterworks                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * `water_tower` — an iron-banded tank standing on a deck, on legs, with a ladder.
 *
 * The whole of the archetype is the **continuity rule**: a tank whose lowest
 * course hangs in air is a floating box, however good it looks from the road.
 * So the roof is cleared and rebuilt as a **solid deck across the entire
 * footprint**, and the drum rises from that deck course by course, each course
 * a full inset rect resting on the one below. The top course is a **full
 * block** — the mound lesson — and the finial rod stands on it, which is the
 * turret lesson: a topper only ever goes on a column that reaches the ground.
 *
 * The **legs** are the four apron corner posts, grounded through `y = 0`, and
 * the **ladder** runs up the west wall face in the apron, hung on the wall the
 * shell already built rather than on air.
 *
 * Inside there is almost nothing, because a water tower's inside is a valve
 * house: cauldrons on the far wall row, a barrel of fittings, an iron bench.
 */
function fitWaterTower(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const end = farEnd(ctx);
  const facing = opposite(end.look);
  const near = nearZ(ctx);
  const plan = roofPlan(ctx);

  if (plan !== null) {
    clearRoof(ctx, plan);
    // The deck: solid, edge to edge, so every drum cell below has something
    // under it and every drum cell has the walls under *that*.
    for (let z = 0; z < plan.sz; z++) {
      for (let x = 0; x < plan.sx; x++) {
        ctx.put(x, plan.base, z, ctx.style["roof.solid"] as string);
        c.n++;
      }
    }
    // The tank: an inset rect, banded, every course sitting on the last.
    const inset = 2;
    const x0 = inset;
    const x1 = plan.sx - 1 - inset;
    const z0 = inset;
    const z1 = plan.sz - 1 - inset;
    if (x1 - x0 >= 1 && z1 - z0 >= 1) {
      let y = plan.base + 1;
      for (; y <= plan.top - 1; y++) {
        const band = (y - plan.base) % 3 === 0;
        for (let z = z0; z <= z1; z++) {
          for (let x = x0; x <= x1; x++) {
            ctx.put(x, y, z, band ? "iron_block" : "stone_bricks");
            c.n++;
          }
        }
      }
      // The cap: full blocks, never a slab, and the vent standing on it.
      for (let z = z0; z <= z1; z++) {
        for (let x = x0; x <= x1; x++) {
          ctx.put(x, y, z, "iron_block");
          c.n++;
        }
      }
    }
    // The legs: grounded corner posts up to the plate.
    for (const [x, z] of [
      [0, 0],
      [plan.sx - 1, 0],
      [0, plan.sz - 1],
      [plan.sx - 1, plan.sz - 1],
    ] as const) {
      c.n += groundedPost(ctx, x, z, ctx.wallTop, "stone_bricks");
    }
    // The ladder up the west face, in the apron, hung on the wall behind it.
    //
    // The rule the terrarium's lint paid for: a ladder needs something SOLID
    // directly behind it, for every course of its run. A column of the west
    // wall with a window in it has a pane at that course and the lint calls
    // `unsupported.ladder`, so the column is chosen by scanning outward from
    // the middle of the wall for the first one that is solid all the way up —
    // and where the facade has no such column, the tower simply has no ladder.
    const mid = Math.floor(plan.sz / 2);
    const solidColumn = (z: number): boolean => {
      if (z < 1 || z > plan.sz - 2) return false;
      if (onWayIn(ctx, -1, z)) return false;
      for (let y = 1; y <= ctx.wallTop; y++) {
        const behind = ctx.blockAt(0, y, z);
        if (behind === undefined) return false;
        if (/glass|_pane$|_door$|^air$|^ladder$|_trapdoor$|banner$/.test(behind.block)) return false;
      }
      return true;
    };
    let lz: number | null = null;
    for (let d = 0; d <= plan.sz && lz === null; d++) {
      if (solidColumn(mid - d)) lz = mid - d;
      else if (solidColumn(mid + d)) lz = mid + d;
    }
    if (lz !== null) {
      for (let y = 1; y <= ctx.wallTop; y++) {
        ctx.put(-1, y, lz, "ladder", { facing: "west", waterlogged: "false" });
        c.n++;
      }
    }
  }

  // The valve house.
  wallRun(ctx, 3, 0, (z) => {
    c.put1(it.x0, z, "cauldron", { level: "0" });
  });
  wallRun(ctx, 3, 1, (z) => {
    c.put1(it.x1, z, "iron_block");
  });
  c.put1(it.x0, end.z, "iron_block");
  c.put1(it.x1, end.z, "cauldron", { level: "0" });
  putOnRow(c, it, near, "barrel", { facing: "up", open: "false" });
  c.put1(it.x1, near, "chest", { facing, type: "single" });
}

/**
 * `cistern` — the bathhouse pool, as pure storage.
 *
 * The water is written **verbatim** the way the bathhouse and the bathing
 * pavilion write theirs, and the argument is theirs unchanged:
 *
 * - it goes **into the floor plane** at `y = 0`, in a rect inset one cell from
 *   the interior, so under every water cell is the foundation skirt the shell
 *   laid under the whole footprint, and beside every water cell on all four
 *   sides is either more pool or a floor cell the shell has already written
 *   solid;
 * - the divider is nudged **off the lantern row**, because the shell hangs its
 *   ceiling light over the room's centre row at head height and a walkway under
 *   it is a walkway with a wall in it;
 * - the **measuring posts** are carved out of the pool's own corners — a solid
 *   cell replacing a water cell, which leaves every remaining water cell
 *   bounded by solid or water — and never stood on the walkway.
 *
 * The **inspection walkway** is the one-cell ring the inset leaves, and it
 * carries **nothing at all**: a body-blocking prop on a one-wide ring cuts it,
 * which is the lesson whole arcs of small bathhouses were unwalkable for.
 */
function fitCistern(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const pool = poolRect(it);
  const inPool = (x: number, z: number): boolean =>
    pool !== null && x >= pool.x0 && x <= pool.x1 && z >= pool.z0 && z <= pool.z1;

  if (pool !== null) {
    const zc = Math.floor((it.z0 + it.z1) / 2);
    let divider: number | null = pool.z1 - pool.z0 >= 3 ? Math.floor((pool.z0 + pool.z1) / 2) : null;
    if (divider !== null && divider === zc) {
      divider = divider + 1 <= pool.z1 ? divider + 1 : divider - 1;
    }
    for (let z = pool.z0; z <= pool.z1; z++) {
      for (let x = pool.x0; x <= pool.x1; x++) {
        if (z === divider) {
          ctx.put(x, 0, z, ctx.style["stone.slab"] as string, {
            type: "top",
            waterlogged: "false",
          });
          c.n++;
          continue;
        }
        ctx.put(x, 0, z, "water", { level: "0" });
        c.n++;
      }
    }
  }

  // The rim: dressed stone written into the floor plane all the way round the
  // water, which is what turns a hole full of water into a cistern.
  for (let z = it.z0; z <= it.z1; z++) {
    for (let x = it.x0; x <= it.x1; x++) {
      if (inPool(x, z)) continue;
      const beside = inPool(x + 1, z) || inPool(x - 1, z) || inPool(x, z + 1) || inPool(x, z - 1);
      if (!beside) continue;
      ctx.put(x, 0, z, "smooth_stone");
      c.n++;
    }
  }

  // The measuring posts, in the pool's own corners: a solid plinth standing in
  // the water with a graduated wall course on it.
  if (pool !== null) {
    const post = (px: number, pz: number, top: string, props?: Record<string, string>): void => {
      ctx.put(px, 0, pz, "smooth_stone");
      ctx.put(px, 1, pz, top, props);
      c.n += 2;
    };
    const wall = ctx.style["stone.wall"] as string;
    post(pool.x0, pool.z0, wall, { up: "true", north: "none", south: "none", east: "none", west: "none", waterlogged: "false" });
    post(pool.x1, pool.z1, wall, { up: "true", north: "none", south: "none", east: "none", west: "none", waterlogged: "false" });
    post(pool.x1, pool.z0, "cauldron", { level: "0" });
    post(pool.x0, pool.z1, pottedAt(pool.x0, pool.z1));
  } else {
    // Too small for a pool: a plain tank room, where the guard's own
    // connectivity check keeps corner props from sealing anything.
    c.put1(it.x0, it.z0, "cauldron", { level: "0" });
    c.put1(it.x1, it.z1, "cauldron", { level: "0" });
  }
}

/**
 * `well` — the street prop's building cousin: a well house with a windlass.
 *
 * The prop's own read, at building scale and with the same refusals. The water
 * is a **cauldron**, not a shaft: a shaft would have to be walled for its whole
 * depth to be stable and would then be invisible from the door.
 *
 * The **windlass** is the one piece of geometry worth stating. Two fence posts
 * flank the well cell and an **axle log** spans them one course higher, which
 * is the beam idiom: a log touching two posts is neither isolated nor
 * unsupported, where a fence in mid air is a support-chain defect. The well's
 * own column is deliberately left **open at head height** — cauldron, air,
 * axle — so it is never a sealed column, and the hanging rope is only drawn on
 * a storey tall enough to leave a course of air above it.
 */
function fitWell(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const end = farEnd(ctx);
  const facing = opposite(end.look);
  const near = nearZ(ctx);
  const lamp = lanternColumn(it);

  // The well itself, one row off the far end and one column off the lantern's,
  // so neither the shell's light nor the door approach is in it.
  const wx = lamp.x + 1 <= it.x1 - 1 ? lamp.x + 1 : lamp.x - 1;
  const wz = end.look === "north" ? it.z0 + 1 : it.z1 - 1;
  const built = c.put1(wx, wz, "water_cauldron", { level: "3" });
  if (built) {
    // The coping: a ring of dressed floor plane round the draw hole, which is
    // free — the floor plane costs the room nothing.
    c.n += floorPaint(
      ctx,
      {
        x0: Math.max(it.x0, wx - 1),
        z0: Math.max(it.z0, wz - 1),
        x1: Math.min(it.x1, wx + 1),
        z1: Math.min(it.z1, wz + 1),
      },
      () => "smooth_stone",
    );
    // The two posts and the axle across them.
    const fence = ctx.style["wall.fence"] as string;
    const log = (ctx.style["wall.log"] as string | undefined) ?? "stripped_oak_wood";
    for (const px of [wx - 1, wx + 1]) {
      if (px < it.x0 || px > it.x1) continue;
      if (!c.put1(px, wz, fence)) continue;
      c.stack(px, wz, 2, fence);
    }
    if (headHeightFree(ctx)) c.stack(wx, wz, 3, log, { axis: "x" });
    // The bucket on the line, only where a course of air is left above it.
    if (ctx.storyHeight >= 5) c.stack(wx, wz, 2, "iron_bars", { waterlogged: "false" });
  }

  // The bucket bench and the stores, up the walls.
  wallRun(ctx, 3, 0, (z) => {
    utilTable(ctx, c, it.x0, z);
  });
  wallRun(ctx, 3, 1, (z) => {
    c.put1(it.x1, z, "cauldron", { level: "0" });
  });
  rack(ctx, c, it.x1, "west", 3);
  c.put1(it.x0, end.z, "barrel", { facing: "up", open: "false" });
  c.put1(it.x1, near, "chest", { facing, type: "single" });
  putOnRow(c, it, near, "composter", { level: "0" });
}

/**
 * `pumping_station` — a flywheel on a solid post, pump rods, a gauge wall.
 *
 * The **flywheel** is the fairground prize wheel's idiom, borrowed: a disc is
 * read out of a hub standing on a **solid post** rather than out of a ring of
 * blocks hung in the air, so the whole thing has a support chain to the floor.
 * The spokes are trapdoors on the wall face either side of the hub, which cost
 * nothing and stick to the masonry behind them.
 *
 * The **pump rods** are iron trim columns down the opposite wall — full cubes,
 * never a piston: a piston in a wall is a trap rather than a machine. The
 * **gauge wall** is {@link dialWall} on the far wall, and the **boiler corner**
 * is a furnace with quench cauldrons beside it. No flame at all.
 */
function fitPumpingStation(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const end = farEnd(ctx);
  const facing = opposite(end.look);
  const near = nearZ(ctx);

  // The flywheel, half way down the west wall — offered the middle of the wall
  // and then the cells either side of it, because the stair column and the door
  // approach can each eat any particular one and a flywheel pinned to a named
  // cell is a flywheel some envelopes simply do not get.
  const mid = Math.floor((it.z0 + it.z1) / 2);
  let hubZ = mid;
  let hub = false;
  for (const dz of [0, -1, 1, -2, 2]) {
    const z = mid + dz;
    if (z < it.z0 || z > it.z1) continue;
    if (!c.put1(it.x0, z, "polished_andesite")) continue;
    hubZ = z;
    hub = true;
    break;
  }
  if (hub) {
    c.stack(it.x0, hubZ, 2, "iron_block");
    if (headHeightFree(ctx)) {
      for (const dz of [-1, 1]) {
        const z = hubZ + dz;
        if (z < it.z0 || z > it.z1) continue;
        c.stack(it.x0, z, 2, "iron_trapdoor", {
          facing: "east",
          half: "top",
          open: "false",
          powered: "false",
          waterlogged: "false",
        });
      }
    }
  }

  // The pump rods: iron trim down the east wall, with catch tubs between.
  wallRun(ctx, 2, 0, (z) => {
    c.put1(it.x1, z, "iron_block");
  });
  wallRun(ctx, 4, 1, (z) => {
    c.put1(it.x1, z, "cauldron", { level: "0" });
  });

  // The gauge wall, and the control desk under it.
  dialWall(ctx, c, end.z, end.look === "north" ? "south" : "north");
  putOnRow(c, it, end.z, "lectern", { facing: end.look, has_book: "false", powered: "false" });

  // The boiler corner and the fitting store.
  c.put1(it.x0, end.z, "furnace", { facing, lit: "false" });
  c.put1(it.x0, near, "cauldron", { level: "0" });
  c.put1(it.x1, near, "chest", { facing, type: "single" });
  wallRun(ctx, 5, 2, (z) => {
    barrelStack(ctx, c, it.x0, z);
  });
}

/* -------------------------------------------------------------------------- */
/* energy                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * `substation` — a switchyard read, built inside the walls.
 *
 * A real substation is a fenced compound, and a compound *inside* a building is
 * a ring of fence that seals half the room. So the fence is read as a **run**
 * along one wall rather than as an enclosure: posts on the wall row, which is
 * the same line the transformers stand on, and the lane down the middle of the
 * room stays a lane.
 *
 * The **transformer tanks** are iron blocks with **lightning rods standing on
 * them** — a topper on a continuous column, never floating — and only where the
 * storey has the course to spare. The **warning banners** are wall banners, and
 * the yard surface is a floor-plane recolour, so it costs the room nothing.
 */
function fitSubstation(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const end = farEnd(ctx);
  const facing = opposite(end.look);
  const near = nearZ(ctx);

  // The yard surface: gravel and andesite, in the floor plane.
  c.n += floorPaint(ctx, it, (x, z) =>
    (x * 3 + z * 5) % 7 === 0 ? "polished_andesite" : "smooth_stone",
  );

  // The transformer bank, with a rod on every tank.
  wallRun(ctx, 3, 0, (z) => {
    if (!c.put1(it.x0, z, "iron_block")) return;
    if (headHeightFree(ctx)) {
      c.stack(it.x0, z, 2, "lightning_rod", { facing: "up", powered: "false" });
    }
  });
  // The insulator strings: fence posts on the opposite wall row.
  wallRun(ctx, 2, 0, (z) => {
    c.put1(it.x1, z, ctx.style["wall.fence"] as string);
  });
  // The warning banners, over alternate insulators.
  if (headHeightFree(ctx)) {
    wallRun(ctx, 4, 0, (z) => {
      c.stack(it.x1, z, 2, "yellow_wall_banner", { facing: "west" });
    });
  }

  dialWall(ctx, c, end.z, end.look === "north" ? "south" : "north");
  putOnRow(c, it, end.z, "lectern", { facing: end.look, has_book: "false", powered: "false" });
  c.put1(it.x0, near, "chest", { facing, type: "single" });
  c.put1(it.x1, end.z, "iron_block");
}

/**
 * `gasworks` — the gasholder: a banded drum re-clad over the whole wall field.
 *
 * The holder is the building. An interior drum would be a solid column through
 * the room — the `interior.blocked_column` defect, whatever it is meant to
 * represent — so the drum is read on the **outside**: the wall field above the
 * plinth is re-clad in courses, iron banding every third course over a stone
 * shell, which from any distance is a gasometer and from none of them is a
 * pillar in somebody's way. The re-clad refuses on anything but a plain rect,
 * and `clad` preserves the door, the glazing and the lights.
 *
 * Inside: the **valve gear** (a dial wall over an iron bench) and the **retort
 * bench** — a run of furnaces with tar cauldrons between them, unlit.
 */
function fitGasworks(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const end = farEnd(ctx);
  const facing = opposite(end.look);
  const near = nearZ(ctx);
  const plan = wallPlan(ctx);

  if (plan !== null) {
    c.n += reclad(ctx, plan, 2, ctx.wallTop, (x, y, z) => {
      if ((y - 2) % 3 === 0) return "iron_block";
      return (x * 3 + y + z * 3) % 5 === 0 ? "polished_andesite" : "stone_bricks";
    });
  }

  // The retort bench: furnaces along the far wall, tar tubs between them.
  for (let x = it.x0; x <= it.x1; x++) {
    if ((x - it.x0) % 2 === 0) {
      c.put1(x, end.z, "furnace", { facing, lit: "false" });
    } else {
      c.put1(x, end.z, "cauldron", { level: "0" });
    }
  }
  // The valve gear, up the west wall: iron stands with levers over them.
  wallRun(ctx, 2, 0, (z) => {
    if (!c.put1(it.x0, z, "iron_block")) return;
    if (headHeightFree(ctx) && (z - it.z0) % 4 === 0) {
      c.stack(it.x0, z, 2, "lever", { face: "floor", facing: "north", powered: "false" });
    }
  });
  // The condensate barrels up the east wall, and the office end.
  wallRun(ctx, 3, 1, (z) => {
    barrelStack(ctx, c, it.x1, z);
  });
  putOnRow(c, it, near, "lectern", { facing: end.look, has_book: "false", powered: "false" });
  c.put1(it.x1, near, "chest", { facing, type: "single" });
}

/**
 * `steam_plant` — a boiler bank, a steam drum on it, and a turbine hall.
 *
 * The **boiler bank** is furnaces along the far wall with an **iron drum
 * standing on each of them** — supported by the furnace under it, so nothing is
 * hung — and the drum course is only built where the storey leaves a course of
 * air over a head.
 *
 * The **turbine hall** is the factory hall's drive-shaft idiom, verbatim: a run
 * of **stripped log** under the plate rather than a fence line, because a
 * fence's support chain walks *down* to solid and a fence in mid air fails the
 * lint whatever hangs above it. A continuous run of full cubes is legal by
 * every rule — each log touches the next — and line shafting was always a
 * turned log anyway. Under a three-course storey there is simply no shaft.
 *
 * The **condensers** are cauldrons up the other wall. No lava, no fire.
 */
function fitSteamPlant(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const end = farEnd(ctx);
  const facing = opposite(end.look);
  const near = nearZ(ctx);
  const lamp = lanternColumn(it);

  // The boiler bank and its steam drums.
  for (let x = it.x0; x <= it.x1; x++) {
    if ((x - it.x0) % 2 !== 0) continue;
    if (!c.put1(x, end.z, "furnace", { facing, lit: "false" })) continue;
    if (headHeightFree(ctx)) c.stack(x, end.z, 2, "iron_block");
  }
  for (let x = it.x0 + 1; x <= it.x1; x += 2) {
    c.put1(x, end.z, "waxed_copper_block");
  }

  // The turbine hall: the shaft under the plate, on the lantern's column.
  const shaftY = ctx.storyHeight - 1;
  if (shaftY >= 3) {
    const shaft = (ctx.style["wall.log"] as string | undefined) ?? "stripped_oak_wood";
    for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
      c.stack(lamp.x, z, shaftY, shaft, { axis: "z" });
    }
  }

  // The condensers and the feed pumps.
  wallRun(ctx, 2, 0, (z) => {
    c.put1(it.x1, z, "cauldron", { level: "0" });
  });
  wallRun(ctx, 3, 0, (z) => {
    c.put1(it.x0, z, "waxed_copper_block");
  });
  dialWall(ctx, c, near, end.look === "north" ? "north" : "south");
  putOnRow(c, it, near, "lectern", { facing: end.look, has_book: "false", powered: "false" });
  c.put1(it.x0, near, "chest", { facing, type: "single" });
}

/**
 * `biomass_shed` — the barn, energetic: chip bays, a hopper read, a boiler.
 *
 * The **chip piles** are floor-plane bays of coarse dirt and podzol, and both
 * are **full blocks**: a bay written as a layer or a carpet is a cell a body
 * half-sinks into, and `mud` proper is worse — the block here is `packed_mud`
 * where a wet bay is wanted at all. A floor recolour costs the room nothing,
 * which is why the shed can have four bays and still be walkable everywhere.
 *
 * The **hopper read** is a hopper on the wall row with a composter beside it —
 * the fuel going in — and the **boiler corner** is a smoker with an unlit
 * furnace beside it.
 */
function fitBiomassShed(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const end = farEnd(ctx);
  const facing = opposite(end.look);
  const near = nearZ(ctx);

  // Four bays in the floor plane, in the corners, off the middle lane.
  const midX = Math.floor((it.x0 + it.x1) / 2);
  const bay = (x0: number, x1: number, z0: number, z1: number, wet: boolean): void => {
    if (x1 < x0 || z1 < z0) return;
    c.n += floorPaint(ctx, { x0, z0, x1, z1 }, (x, z) =>
      wet ? ((x + z) % 3 === 0 ? "packed_mud" : "coarse_dirt") : (x + z) % 3 === 0 ? "podzol" : "coarse_dirt",
    );
  };
  bay(it.x0, Math.max(it.x0, midX - 2), it.z0, it.z0 + 1, false);
  bay(Math.min(it.x1, midX + 2), it.x1, it.z0, it.z0 + 1, true);
  bay(it.x0, Math.max(it.x0, midX - 2), it.z1 - 1, it.z1, true);
  bay(Math.min(it.x1, midX + 2), it.x1, it.z1 - 1, it.z1, false);

  // The intake: hoppers and composters on the west wall row.
  wallRun(ctx, 3, 0, (z) => {
    c.put1(it.x0, z, "hopper", { enabled: "true", facing: "down" });
  });
  wallRun(ctx, 3, 1, (z) => {
    c.put1(it.x0, z, "composter", { level: "0" });
  });
  // The fuel store: barrels and hay up the east wall.
  wallRun(ctx, 2, 0, (z) => {
    c.put1(it.x1, z, (z - it.z0) % 4 === 0 ? "hay_block" : "barrel", (z - it.z0) % 4 === 0 ? { axis: "y" } : { facing: "up", open: "false" });
  });
  rack(ctx, c, it.x1, "west", 4);

  // The boiler corner and the tally desk.
  c.put1(it.x0, end.z, "smoker", { facing, lit: "false" });
  c.put1(it.x1, end.z, "furnace", { facing, lit: "false" });
  putOnRow(c, it, near, "lectern", { facing: end.look, has_book: "false", powered: "false" });
  c.put1(it.x1, near, "chest", { facing, type: "single" });
}

/**
 * `battery_shed` — rack rows of cells, bus bars at the plate, a monitoring desk.
 *
 * The **cells** are iron blocks with waxed copper on them: waxed and not plain,
 * because plain copper oxidises in play and a store that turns green in a
 * fortnight is a different building every time you look at it.
 *
 * The **bus bars** are the shaft idiom again, and the reason is worth stating
 * because it is the single most common defect in this genre: a bar run drawn as
 * a **fence line** in mid air fails the support chain, which walks *down* to
 * solid. So the bars are stripped-log runs laid **on top of the cell stacks
 * themselves** — every bar block has a battery under it or a bar block beside
 * it — and they only exist where the storey has the course to spare.
 */
function fitBatteryShed(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const end = farEnd(ctx);
  const facing = opposite(end.look);
  const near = nearZ(ctx);
  const bar = (ctx.style["wall.log"] as string | undefined) ?? "stripped_oak_wood";

  // The racks, up both wall rows, with the bus bar on top of them.
  for (const x of [it.x0, it.x1]) {
    let k = 0;
    wallRun(ctx, 2, 0, (z) => {
      const cell = k++ % 2 === 0 ? "iron_block" : "waxed_copper_block";
      if (!c.put1(x, z, cell)) return;
      if (headHeightFree(ctx)) c.stack(x, z, 2, bar, { axis: "z" });
    });
  }

  // The floor: a painted plate grid, so the rows read as bays.
  c.n += floorPaint(ctx, it, (x, z) =>
    (x + z) % 4 === 0 ? "light_gray_concrete" : "smooth_stone",
  );

  // The monitoring desk, and the spares.
  dialWall(ctx, c, end.z, end.look === "north" ? "south" : "north");
  putOnRow(c, it, end.z, "lectern", { facing: end.look, has_book: "false", powered: "false" });
  putOnRow(c, it, near, "barrel", { facing: "up", open: "false" });
  c.put1(it.x0, near, "chest", { facing, type: "single" });
}

/**
 * `coal_tipple` — the mine-side loader: an elevated bin on a timber trestle.
 *
 * Everything that makes this archetype is **outside** the walls, in the apron,
 * and every block of it is on a support chain to the ground:
 *
 * - the **posts** are grounded through `y = 0` — an apron cell is not always at
 *   `y = 1`, and a post whose foot is air fails the support-chain rule;
 * - the **beam** is a run of logs spanning post to post at the head of them.
 *   A log touching two posts is neither isolated nor unsupported, where a fence
 *   would be a defect;
 * - the **bin** sits on the beam, course on course, closing on a **solid** cap;
 * - the **chute** is a stepped run of *grounded* columns descending away from
 *   the bin with a stair on each head — a topper on a continuous column, the
 *   turret lesson, rather than a staircase hanging in the air.
 *
 * Inside, the coal bays are full-block floor plane — coal blocks and black
 * concrete — so the shed reads as loaded and stays walkable end to end.
 */
function fitCoalTipple(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const end = farEnd(ctx);
  const facing = opposite(end.look);
  const near = nearZ(ctx);
  const plan = wallPlan(ctx);
  const timber = (ctx.style["wall.log"] as string | undefined) ?? "oak_log";

  if (plan !== null) {
    // The trestle runs up the east apron, clear of the way in.
    const tx = plan.sx;
    const deckY = Math.max(3, ctx.wallTop - 1);
    let posts = 0;
    for (let z = 0; z < plan.sz; z += 2) {
      const wrote = groundedPost(ctx, tx, z, deckY - 1, timber, { axis: "y" });
      c.n += wrote;
      if (wrote > 0) posts++;
    }
    if (posts >= 2) {
      // The beam, spanning the posts.
      for (let z = 0; z < plan.sz; z++) {
        if (onWayIn(ctx, tx, z)) continue;
        ctx.put(tx, deckY, z, timber, { axis: "z" });
        c.n++;
      }
      // The bin: two courses on the beam over the middle of the run, capped
      // solid.
      const bz0 = Math.max(1, Math.floor(plan.sz / 2) - 1);
      const bz1 = Math.min(plan.sz - 2, bz0 + 2);
      for (let z = bz0; z <= bz1; z++) {
        if (onWayIn(ctx, tx, z)) continue;
        ctx.put(tx, deckY + 1, z, "deepslate_bricks");
        ctx.put(tx, deckY + 2, z, "polished_deepslate");
        c.n += 2;
      }
      // The chute: grounded columns stepping down away from the bin, each with
      // a stair on its head.
      const stair = ctx.style["stone.stairs"] as string | undefined;
      for (let step = 1; step <= 3; step++) {
        const z = bz1 + step;
        if (z > plan.sz - 1) break;
        const top = deckY - step;
        if (top < 1) break;
        if (groundedPost(ctx, tx, z, top, "deepslate_bricks") === 0) continue;
        c.n++;
        ctx.put(tx, top + 1, z, stair ?? "cobblestone_stairs", {
          facing: "south",
          half: "bottom",
          shape: "straight",
          waterlogged: "false",
        });
      }
    }
  }

  // The coal bays, in the floor plane, off the middle lane.
  const midX = Math.floor((it.x0 + it.x1) / 2);
  const bay = (x0: number, x1: number, z0: number, z1: number): void => {
    if (x1 < x0 || z1 < z0) return;
    c.n += floorPaint(ctx, { x0, z0, x1, z1 }, (x, z) =>
      (x + z) % 3 === 0 ? "coal_block" : "black_concrete",
    );
  };
  bay(it.x0, Math.max(it.x0, midX - 2), it.z0, it.z0 + 1);
  bay(Math.min(it.x1, midX + 2), it.x1, it.z1 - 1, it.z1);

  // The weigh house: a hopper run, a store, a tally desk.
  wallRun(ctx, 3, 0, (z) => {
    c.put1(it.x0, z, "hopper", { enabled: "true", facing: "down" });
  });
  wallRun(ctx, 3, 1, (z) => {
    barrelStack(ctx, c, it.x1, z);
  });
  c.put1(it.x0, end.z, "furnace", { facing, lit: "false" });
  putOnRow(c, it, near, "lectern", { facing: end.look, has_book: "false", powered: "false" });
  c.put1(it.x1, near, "chest", { facing, type: "single" });
  if (standerHeadroom(ctx)) {
    // The loading step by the door: a half course a body actually fits on.
    c.put1(it.x1, end.z, ctx.style["stone.slab"] as string, {
      type: "top",
      waterlogged: "false",
    });
  }
}
