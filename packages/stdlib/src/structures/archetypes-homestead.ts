/**
 * Archetype breadth, **wave four D** — the homestead: rural yards and fantasy
 * houses.
 *
 * Twelve buildings: a stable, a silo, a dovecote, a chicken coop, an apiary, a
 * hop kiln, a cider press and a root-cellar mound on the rural side; a witch's
 * hut, a mushroom house, a hobbit hole and a gingerbread cottage on the
 * fantasy one.
 *
 * ## An archetype is a fit-out, not a second grammar
 *
 * The normative statement is the header of `archetypes-blitz.ts`; the short
 * form is the one `archetypes-regional.ts` restates. A fit-out runs **after**
 * every shape stage and writes into the same cell map, so it may re-clad a
 * wall field and rebuild a roof without a line of `core.ts` changing, and
 * every invariant the shell already guarantees still holds. A hop kiln is the
 * house shell under a corbelled brick cone with a cowl on it; a gingerbread
 * cottage is the same shell in brown with white icing courses. Neither is a
 * new grammar and neither may grow one: no new footprint, no new opening rule,
 * no second storey system.
 *
 * ## The two rules everything here obeys
 *
 * 1. **Nothing leaves the envelope.** Exterior work is bounded above by
 *    `roofTop + `{@link ROOF_FLOURISH_RISE} and in plan by the footprint plus
 *    the one-block apron ring the eave already uses. The root cellar in
 *    particular does **not** dig: a sunken floor would break the foundation
 *    skirt the shell lays under the whole footprint, so the cool room is read
 *    from its shelving and its turf mound, not from a hole.
 * 2. **The interior stays walkable.** Every interior prop goes through
 *    {@link PropCounter}, which routes through the ground floor's own `free`
 *    and `take`.
 *
 * ## The field lessons this file was written against
 *
 * Every one came back from an in-game walkthrough or a physics-lint failure,
 * and each is a rule here rather than a comment:
 *
 * - a **stair's `facing` is its backrest** — it points away from what the
 *   sitter looks at;
 * - a bare `flower_pot` renders **empty**; every pot goes through
 *   {@link pottedAt};
 * - the shell hangs a lantern over the **middle column** of the room at head
 *   height, so no route here is one cell wide through that column: the stable
 *   runs its stalls down *one* wall row and leaves the corridor off-centre,
 *   and every other interior prop in this file stands on a wall row;
 * - the trestle table is refused by the stack guard under a three-course
 *   storey, so {@link table} switches to a top slab there;
 * - nothing body-blocking stands on width-1 circulation, and no stair goes
 *   anywhere a stander has no headroom;
 * - **no sign blocks.** A sign needs a paired block entity the op stream
 *   cannot carry; a banner is the signage idiom;
 * - **an apron prop stands on the actual ground.** On conformed terrain the
 *   apron fills local `y = 0`; on a platform (the Terrarium) it sits one
 *   lower, and a post or a skep standing on air fails the support-chain rule.
 *   Every apron prop here goes through {@link groundAt}, which either fills a
 *   support course or stands the prop one lower — the stilt/veranda lesson,
 *   verbatim;
 * - **a corbel closes on a solid cap.** A partial block in the middle of the
 *   cap rect has nothing under it but the cone's hollow; the one place a
 *   partial block belongs is the finial, standing on the solid cap;
 * - chains and hanging things need an actual block over them, so this file
 *   hangs nothing at all: the trapdoor is the only thing it fixes to a wall,
 *   and a trapdoor takes its support from the wall beside it.
 */

import {
  PropCounter,
  ROOF_FLOURISH_RISE,
  type FitOutContext,
  roofPlan,
  wallPlan,
  type RebuildPlan,
} from "./archetypes-civic.js";
import { pottedAt } from "./archetypes-wave2.js";
import { cardinalStep, type Cardinal, type LocalRect } from "./core.js";

/* -------------------------------------------------------------------------- */
/* the archetypes                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The twelve archetypes this file fits out, in catalog order: the rural eight
 * first, then the fantasy four.
 *
 * Spread into `BUILDING_ARCHETYPES` by `archetypes.ts`.
 */
export const HOMESTEAD_BUILDING_ARCHETYPES = [
  "stable",
  "silo",
  "dovecote",
  "chicken_coop",
  "apiary",
  "hop_kiln",
  "cider_press",
  "root_cellar_mound",
  "witch_hut",
  "mushroom_house",
  "hobbit_hole",
  "gingerbread_cottage",
] as const;

/** One of the archetypes this file fits out. */
export type HomesteadBuildingArchetype = (typeof HOMESTEAD_BUILDING_ARCHETYPES)[number];

/** True for an archetype this file answers to. */
export function isHomesteadArchetype(value: string): value is HomesteadBuildingArchetype {
  return (HOMESTEAD_BUILDING_ARCHETYPES as readonly string[]).includes(value);
}

/**
 * Tag → archetype, or `null` when nothing matches.
 *
 * Consulted after the institutions and *before* the regional houses and the
 * extended table. Every tag below is one no other table claims, and the near
 * misses are the point:
 *
 * - **bare `stable` is not ours.** `stable` and `byre` belong to the extended
 *   **barn**, and claiming either would silently retheme every barn in the
 *   vocabulary. The stable answers to `horse_stable`, `stables` and `stalls`
 *   — its own id is reachable as a param, which is what an id is for;
 * - **bare `mill` and bare `kiln` are not ours** either: `mill` is the
 *   windmill's and `kiln` is wave two's pottery kiln. The oast answers to
 *   `hop_kiln` and `oast`;
 * - **bare `hut` is not ours.** `hut` is a wave-four residential id on a
 *   parallel track; the witch's hut claims the compounds `witch_hut` and
 *   `witch` only;
 * - `cellar` is the underground catalog's, so the mound claims
 *   `root_cellar_mound` and `root_cellar` — never bare `cellar`;
 * - `house` still falls through to a cottage, and `mushroom_house` is claimed
 *   as a compound beside bare `mushroom`, which no other table wants.
 */
export function homesteadArchetypeOfTags(
  tags: readonly string[],
): HomesteadBuildingArchetype | null {
  const has = (t: string): boolean => tags.includes(t);
  if (has("horse_stable") || has("stables") || has("stalls")) return "stable";
  if (has("silo") || has("grain_silo")) return "silo";
  if (has("dovecote") || has("columbarium") || has("pigeon_loft")) return "dovecote";
  if (has("chicken_coop") || has("coop") || has("henhouse")) return "chicken_coop";
  if (has("apiary") || has("bee_house") || has("beeyard")) return "apiary";
  if (has("hop_kiln") || has("oast") || has("oast_house")) return "hop_kiln";
  if (has("cider_press") || has("cidery") || has("press_house")) return "cider_press";
  if (has("root_cellar_mound") || has("root_cellar")) return "root_cellar_mound";
  if (has("witch_hut") || has("witch") || has("witches_hut")) return "witch_hut";
  if (has("mushroom_house") || has("mushroom") || has("toadstool")) return "mushroom_house";
  if (has("hobbit_hole") || has("hobbit") || has("burrow")) return "hobbit_hole";
  if (has("gingerbread_cottage") || has("gingerbread") || has("candy")) {
    return "gingerbread_cottage";
  }
  return null;
}

/**
 * Facade tendencies for this file's archetypes.
 *
 * Same contract as `archetypeFacadeDefaults`: defaults a caller merges into
 * its params, never something applied over an explicit one. Everything that
 * rebuilds its roof as a cone or a mound asks for the shape with the most
 * vertical room, because the replacement is bounded by where the shell's own
 * roof finished.
 */
export function homesteadFacadeDefaults(
  archetype: string,
): { readonly windowShape?: string; readonly windowRhythm?: string; readonly roof?: string } {
  switch (archetype) {
    // A working building: big doors, few lights, a roof that sheds.
    case "stable":
      return { windowShape: "single", windowRhythm: "sparse", roof: "gable" };
    // A bin, not a room: as blind as the grammar will let a wall be.
    case "silo":
      return { windowShape: "single", windowRhythm: "sparse", roof: "hip" };
    case "dovecote":
      return { windowShape: "single", windowRhythm: "sparse", roof: "hip" };
    case "chicken_coop":
      return { windowShape: "single", windowRhythm: "regular", roof: "gable" };
    case "apiary":
      return { windowShape: "single", windowRhythm: "regular", roof: "gable" };
    // The cone is the building; it wants every course it can get.
    case "hop_kiln":
      return { windowShape: "single", windowRhythm: "sparse", roof: "hip" };
    case "cider_press":
      return { windowShape: "single", windowRhythm: "regular", roof: "gable" };
    case "root_cellar_mound":
      return { windowShape: "single", windowRhythm: "sparse", roof: "hip" };
    // A crooked gable rebuilt as a saltbox, over a dark swamp box.
    case "witch_hut":
      return { windowShape: "single", windowRhythm: "sparse", roof: "gable" };
    case "mushroom_house":
      return { windowShape: "single", windowRhythm: "sparse", roof: "hip" };
    case "hobbit_hole":
      return { windowShape: "single", windowRhythm: "sparse", roof: "hip" };
    case "gingerbread_cottage":
      return { windowShape: "mullion", windowRhythm: "regular", roof: "gable" };
    default:
      return {};
  }
}

/* -------------------------------------------------------------------------- */
/* the exterior plan                                                           */
/* -------------------------------------------------------------------------- */

/** Clear everything the shell built above the eave plate, apron included. */
function clearRoof(ctx: FitOutContext, plan: RebuildPlan): void {
  for (let y = plan.base; y <= plan.top + 2; y++) {
    for (let x = -1; x <= plan.sx; x++) {
      for (let z = -1; z <= plan.sz; z++) ctx.put(x, y, z, "air");
    }
  }
}

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
 * **The apron-post ground rule.** On conformed terrain the apron ground fills
 * local `y = 0`; on a platform it sits one lower, so a prop written at `y = 1`
 * would float and the lint's support-chain rule would rightly refuse it. When
 * `fill` is given, the missing course is filled with it and the prop stands at
 * 1; otherwise the prop simply stands one lower, at 0, on the ground that is
 * actually there. Returns the Y to build the prop at.
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
 * Wave three's list unchanged: the way in, the way up, the fire, the glass and
 * anything the physics lint holds to a support rule.
 */
const PRESERVE = /(_door$|^ladder$|^campfire$|_sign$|torch$|^bell$|glass|_pane$|lantern$|banner$)/;

/**
 * Re-clad the wall ring between two courses.
 *
 * `block` is a pure function of position, so opposite walls agree and the
 * result is deterministic without a draw.
 */
function reclad(
  ctx: FitOutContext,
  plan: RebuildPlan,
  yFrom: number,
  yTo: number,
  block: (x: number, y: number, z: number) => string,
  props?: (x: number, y: number, z: number) => Record<string, string> | undefined,
): number {
  let n = 0;
  for (const cell of ringOf(plan.sx, plan.sz)) {
    for (let y = yFrom; y <= yTo; y++) {
      const standing = ctx.blockAt(cell.x, y, cell.z);
      if (standing !== undefined && PRESERVE.test(standing.block)) continue;
      ctx.put(cell.x, y, cell.z, block(cell.x, y, cell.z), props?.(cell.x, y, cell.z));
      n++;
    }
  }
  return n;
}

/** Fill an inclusive rect at one Y. */
function slab(
  ctx: FitOutContext,
  y: number,
  x0: number,
  x1: number,
  z0: number,
  z1: number,
  block: string,
): void {
  for (let z = z0; z <= z1; z++) {
    for (let x = x0; x <= x1; x++) ctx.put(x, y, z, block);
  }
}

/** True when an inset rect is too small to be drawn as a ring. */
function degenerate(x0: number, x1: number, z0: number, z1: number): boolean {
  return x1 - x0 < 2 || z1 - z0 < 2;
}

/**
 * Corbel a cone or a dome over the envelope, closing on a **solid** cap.
 *
 * Wave three's machinery, restated: `courses` is how many courses are laid
 * before the ring steps in, so 1 gives a steep cone and 2 a shallower mound.
 * The first course is solid — it is the lid of the room below — and the last
 * is a solid cap slab, because a partial block in the middle of the cap rect
 * has nothing under it but the cone's hollow. The one partial block a cone may
 * wear is the `finial`, standing directly on that solid cap.
 */
function corbel(
  ctx: FitOutContext,
  plan: RebuildPlan,
  block: (x: number, y: number, z: number) => string,
  cap: string,
  courses = 1,
  finial?: string,
): number {
  let n = 0;
  let capY = plan.base;
  let rect: LocalRect = plan.rect;
  for (let y = plan.base; y <= plan.top; y++) {
    const k = Math.floor((y - plan.base) / courses);
    const x0 = k;
    const x1 = plan.sx - 1 - k;
    const z0 = k;
    const z1 = plan.sz - 1 - k;
    if (x0 > x1 || z0 > z1 || (k > 0 && degenerate(x0, x1, z0, z1))) break;
    capY = y;
    rect = { x0, z0, x1, z1 };
    n++;
    if (y === plan.base) {
      slab(ctx, y, x0, x1, z0, z1, block(x0, y, z0));
      continue;
    }
    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) {
        if (x !== x0 && x !== x1 && z !== z0 && z !== z1) continue;
        ctx.put(x, y, z, block(x, y, z));
      }
    }
  }
  slab(ctx, capY, rect.x0, rect.x1, rect.z0, rect.z1, cap);
  if (capY + 1 <= plan.top) {
    ctx.put((rect.x0 + rect.x1) >> 1, capY + 1, (rect.z0 + rect.z1) >> 1, finial ?? cap);
    n++;
  }
  return n;
}

/* -------------------------------------------------------------------------- */
/* interior primitives                                                         */
/* -------------------------------------------------------------------------- */

/**
 * One table cell, by the idiom the storey has headroom for.
 *
 * Wave two's rule verbatim: the trestle — a fence stem under a pressure plate
 * — is two blocks in one column and is refused by the stack guard under a
 * three-course storey, so a top slab stands in for it there.
 */
function table(ctx: FitOutContext, c: PropCounter, x: number, z: number): boolean {
  if (ctx.storyHeight < 4) {
    return c.put1(x, z, ctx.style["stone.slab"] as string, { type: "top", waterlogged: "false" });
  }
  if (!c.put1(x, z, ctx.style["wall.fence"] as string)) return false;
  c.stack(x, z, 2, "oak_pressure_plate", { powered: "false" });
  return true;
}

/** The middle column of the room — where the shell hangs its lantern. */
function lanternColumn(it: LocalRect): { readonly x: number; readonly z: number } {
  return { x: Math.floor((it.x0 + it.x1) / 2), z: Math.floor((it.z0 + it.z1) / 2) };
}

/** The end of the room furthest from the door. */
function farEnd(ctx: FitOutContext): { readonly z: number } {
  const it = ctx.interior;
  const north = ctx.door === null ? true : ctx.door.z > (it.z0 + it.z1) / 2;
  return { z: north ? it.z0 : it.z1 };
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

/**
 * A trapdoor grid on the wall ring, hung flat: the nesting-hole idiom.
 *
 * Trapdoors are written into the apron ring facing *at* the building, which is
 * where a shutter belongs, and never over the doorstep. Each takes its support
 * from the wall cell beside it, which the re-clad has already made solid.
 */
function trapdoorGrid(
  ctx: FitOutContext,
  c: PropCounter,
  plan: RebuildPlan,
  ys: readonly number[],
  step: number,
): void {
  const trapdoor = ctx.style["wall.trapdoor"] as string;
  for (const cell of apronOf(plan.sx, plan.sz)) {
    if (onWayIn(ctx, cell.x, cell.z)) continue;
    const onX = cell.x === -1 || cell.x === plan.sx;
    const onZ = cell.z === -1 || cell.z === plan.sz;
    if (onX && onZ) continue; // corners carry nothing
    const along = onX ? cell.z : cell.x;
    if (along < 0 || along > (onX ? plan.sz : plan.sx) - 1) continue;
    if (((along % step) + step) % step !== 1) continue;
    const facing = opposite(apronFacing(plan, cell.x, cell.z));
    for (const y of ys) {
      if (y < 2 || y > ctx.wallTop - 1) continue;
      ctx.put(cell.x, y, cell.z, trapdoor, shutter(facing));
      c.n++;
    }
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
export function furnishHomestead(ctx: FitOutContext): number {
  if (!isHomesteadArchetype(ctx.archetype)) return 0;
  const c = new PropCounter(ctx);
  switch (ctx.archetype) {
    case "stable":
      fitStable(ctx, c);
      break;
    case "silo":
      fitSilo(ctx, c);
      break;
    case "dovecote":
      fitDovecote(ctx, c);
      break;
    case "chicken_coop":
      fitChickenCoop(ctx, c);
      break;
    case "apiary":
      fitApiary(ctx, c);
      break;
    case "hop_kiln":
      fitHopKiln(ctx, c);
      break;
    case "cider_press":
      fitCiderPress(ctx, c);
      break;
    case "root_cellar_mound":
      fitRootCellarMound(ctx, c);
      break;
    case "witch_hut":
      fitWitchHut(ctx, c);
      break;
    case "mushroom_house":
      fitMushroomHouse(ctx, c);
      break;
    case "hobbit_hole":
      fitHobbitHole(ctx, c);
      break;
    case "gingerbread_cottage":
    default:
      fitGingerbreadCottage(ctx, c);
      break;
  }
  return c.n;
}

/* -------------------------------------------------------------------------- */
/* the yard                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * `stable` — stalls down one side of an off-centre corridor.
 *
 * The stalls are the archetype: fence partitions with a **gate** between them,
 * standing on the `x0` wall row only, so the corridor beside them runs down
 * the rest of the room and the lantern column is never the only way past. Hay
 * nets are trapdoors hung over the stalls; the tack wall — chests and barrels
 * — is on the far row; and the water trough is a cauldron in the apron, on the
 * ground the apron actually has.
 *
 * It answers to `horse_stable`, `stables` and `stalls`, never to bare
 * `stable`, which is the extended barn's.
 */
function fitStable(ctx: FitOutContext, c: PropCounter): void {
  const plan = wallPlan(ctx);
  if (plan !== null) {
    c.n += reclad(ctx, plan, 2, ctx.wallTop, (x, y, z) => {
      if (y === 2 || y === ctx.wallTop) return "stripped_oak_log";
      const along = x === 0 || x === plan.sx - 1 ? z : x;
      return along % 4 === 0 ? "stripped_oak_log" : "spruce_planks";
    });
    // The trough, in the apron on the door face, off the doorstep and on the
    // ground: the apron-post ground rule, applied to a filled cauldron.
    const out = outsideDoor(ctx);
    if (out !== null) {
      for (const [ox, oz] of [
        [out.x + 1, out.z],
        [out.x - 1, out.z],
      ] as const) {
        const skirt = ox === -1 || ox === plan.sx || oz === -1 || oz === plan.sz;
        if (!skirt || onWayIn(ctx, ox, oz)) continue;
        ctx.put(ox, groundAt(ctx, c, ox, oz), oz, "cauldron", { level: "3" });
        c.n++;
        break;
      }
    }
  }

  const it = ctx.interior;
  const fence = ctx.style["wall.fence"] as string;
  // There is no gate in the style table, so it is derived from the fence —
  // the two are always the same wood, and a theme whose fence is not a
  // `*_fence` simply gets partitions without gates rather than a guess.
  const gate = fence.endsWith("_fence") ? `${fence.slice(0, -"_fence".length)}_fence_gate` : null;
  // The partitions: on the west wall row only, so the corridor stays wide.
  for (let z = it.z0; z <= it.z1; z++) {
    const bay = (z - it.z0) % 3;
    if (bay === 0) c.put1(it.x0, z, fence);
    else if (bay === 1 && gate !== null) {
      c.put1(it.x0, z, gate, { facing: "east", in_wall: "false", open: "false", powered: "false" });
    }
    // The hay net over the stall: a trapdoor on the wall above it.
    if (bay === 0) {
      c.stack(it.x0, z, Math.min(2, ctx.storyHeight - 1), ctx.style["wall.trapdoor"] as string,
        shutter("east"));
    }
  }
  // The tack wall, on the east row.
  const end = farEnd(ctx);
  c.put1(it.x1, end.z, "chest", { facing: "west", type: "single" });
  c.put1(it.x1, end.z === it.z0 ? end.z + 1 : end.z - 1, "barrel", {
    facing: "up",
    open: "false",
  });
  c.put1(it.x1, end.z === it.z0 ? it.z1 : it.z0, "hay_block", { axis: "y" });
}

/**
 * `silo` — the tower idiom as a grain bin.
 *
 * The exterior is a **banded re-clad**: stone-brick courses with a hoop of
 * smooth stone every third one, which is how a bin reads from a field away.
 * Inside is grain, not a room: hay columns stand on the wall rows with
 * **inspection hatches** — trapdoors on the wall over them, at courses the
 * hay actually reaches, never hanging over air. A run of hatches in the apron
 * near the plate is the filling head.
 */
function fitSilo(ctx: FitOutContext, c: PropCounter): void {
  const plan = wallPlan(ctx);
  if (plan !== null) {
    c.n += reclad(ctx, plan, 2, ctx.wallTop, (_x, y) =>
      y % 3 === 0 ? "smooth_stone" : "stone_bricks",
    );
    trapdoorGrid(ctx, c, plan, [Math.max(2, ctx.wallTop - 1)], 3);
  }
  const roof = roofPlan(ctx);
  if (roof !== null) {
    clearRoof(ctx, roof);
    c.n += corbel(ctx, roof, () => "stone_bricks", "chiseled_stone_bricks", 2, "stone_brick_wall");
  }

  const it = ctx.interior;
  // The grain: hay on the two wall rows, a second course where the storey has
  // the headroom for one, and a hatch on the wall over each pile.
  for (let z = it.z0; z <= it.z1; z++) {
    if ((z - it.z0) % 2 !== 0) continue;
    for (const [x, facing] of [
      [it.x0, "east"],
      [it.x1, "west"],
    ] as const) {
      if (!c.put1(x, z, "hay_block", { axis: "y" })) continue;
      if (ctx.storyHeight >= 5) c.stack(x, z, 2, "hay_block", { axis: "y" });
      c.stack(x, z, Math.min(ctx.storyHeight - 1, 3), ctx.style["wall.trapdoor"] as string,
        shutter(facing));
    }
  }
  c.put1(it.x1, farEnd(ctx).z, "barrel", { facing: "up", open: "false" });
}

/**
 * `dovecote` — the minaret of birds.
 *
 * A slim tower whose whole face is **nesting holes**: a dense trapdoor grid on
 * every wall, at three courses, kept off the doorstep. The roof is a stone
 * cone on a solid cap with a perch finial. Inside, a **ladder** climbs one
 * wall — a ladder is passable, so it costs the room no walkable cell — and a
 * composter stands in the corner, which is the closest a block palette gets to
 * the joke every dovecote's floor is.
 */
function fitDovecote(ctx: FitOutContext, c: PropCounter): void {
  const plan = wallPlan(ctx);
  if (plan !== null) {
    c.n += reclad(ctx, plan, 2, ctx.wallTop, (x, y, z) =>
      (x * 3 + y * 5 + z * 7) % 7 === 0 ? "smooth_stone" : "stone_bricks",
    );
    trapdoorGrid(ctx, c, plan, [3, 5, 7], 2);
  }
  const roof = roofPlan(ctx);
  if (roof !== null) {
    clearRoof(ctx, roof);
    c.n += corbel(ctx, roof, () => "stone_bricks", "chiseled_stone_bricks", 1, "stone_brick_wall");
  }

  const it = ctx.interior;
  // The ladder up the east wall, from the floor to under the plate. It is
  // passable, so it neither strands a cell nor blocks the corridor.
  const ladderZ = Math.floor((it.z0 + it.z1) / 2);
  if (c.put1(it.x1, ladderZ, "ladder", { facing: "west" })) {
    for (let y = 2; y <= Math.min(ctx.storyHeight - 1, ctx.wallTop - 1); y++) {
      c.stack(it.x1, ladderZ, y, "ladder", { facing: "west" });
    }
  }
  c.put1(it.x0, it.z0, "composter", { level: "0" });
  c.put1(it.x0, it.z1, "barrel", { facing: "up", open: "false" });
  c.put1(it.x1, it.z0, pottedAt(it.x1, it.z0));
}

/**
 * `chicken_coop` — a low house of cubbies and roost bars.
 *
 * Nesting boxes are **trapdoor cubbies** on the wall rows at the second
 * course, each over the hay pile it belongs to; the roosts are fence rails
 * standing on the wall row, and they stand on the floor rather than hanging,
 * because a rail with nothing under it is a rail the lint refuses. Feed lives
 * in barrels by the door end.
 */
function fitChickenCoop(ctx: FitOutContext, c: PropCounter): void {
  const plan = wallPlan(ctx);
  if (plan !== null) {
    c.n += reclad(ctx, plan, 2, ctx.wallTop, (x, y, z) => {
      if (y === ctx.wallTop) return "stripped_birch_log";
      const along = x === 0 || x === plan.sx - 1 ? z : x;
      return along % 3 === 0 ? "birch_planks" : "oak_planks";
    });
    // A hay nest in the apron, on the ground the apron actually has.
    const out = outsideDoor(ctx);
    if (out !== null) {
      for (const [ox, oz] of [
        [out.x + 1, out.z],
        [out.x - 1, out.z],
      ] as const) {
        const skirt = ox === -1 || ox === plan.sx || oz === -1 || oz === plan.sz;
        if (!skirt || onWayIn(ctx, ox, oz)) continue;
        ctx.put(ox, groundAt(ctx, c, ox, oz), oz, "hay_block", { axis: "y" });
        c.n++;
        break;
      }
    }
  }

  const it = ctx.interior;
  const fence = ctx.style["wall.fence"] as string;
  for (let z = it.z0; z <= it.z1; z++) {
    const bay = (z - it.z0) % 3;
    if (bay === 0) {
      // The roost bar: a fence standing on the floor at the wall row.
      c.put1(it.x0, z, fence);
    } else if (bay === 1) {
      // The nesting box: hay with a cubby trapdoor on the wall above it.
      if (c.put1(it.x0, z, "hay_block", { axis: "y" })) {
        c.stack(it.x0, z, Math.min(2, ctx.storyHeight - 1),
          ctx.style["wall.trapdoor"] as string, shutter("east"));
      }
    }
  }
  const end = farEnd(ctx);
  c.put1(it.x1, end.z, "barrel", { facing: "up", open: "false" });
  c.put1(it.x1, end.z === it.z0 ? end.z + 1 : end.z - 1, "composter", { level: "0" });
  c.put1(it.x1, end.z === it.z0 ? it.z1 : it.z0, "chest", { facing: "west", type: "single" });
}

/**
 * `apiary` — skeps in the yard and an extraction bench indoors.
 *
 * The **skeps** are the archetype: a hay dome on a fence pedestal, standing in
 * the apron ring. Each pedestal goes through {@link groundAt}, so on a
 * platform the missing course is filled rather than left as a floating post —
 * the lesson the stilt house and the veranda both paid for. Where the apron
 * has the room, real **beehives** stand beside them. Inside is the honey
 * house: a cauldron, a counter and shelves of jars in barrels.
 */
function fitApiary(ctx: FitOutContext, c: PropCounter): void {
  const plan = wallPlan(ctx);
  if (plan !== null) {
    c.n += reclad(ctx, plan, 2, ctx.wallTop, (x, y, z) => {
      if (y === 2 || y === ctx.wallTop) return "stripped_spruce_log";
      const along = x === 0 || x === plan.sx - 1 ? z : x;
      return along % 5 === 0 ? "honeycomb_block" : "spruce_planks";
    });
    const fence = ctx.style["wall.fence"] as string;
    for (const cell of apronOf(plan.sx, plan.sz)) {
      if (onWayIn(ctx, cell.x, cell.z)) continue;
      const onX = cell.x === -1 || cell.x === plan.sx;
      const onZ = cell.z === -1 || cell.z === plan.sz;
      if (onX && onZ) continue;
      const along = onX ? cell.z : cell.x;
      if (along < 1 || along > (onX ? plan.sz : plan.sx) - 2) continue;
      if (along % 3 === 1) {
        // The skep: a pedestal on the actual ground, a hay dome on top of it.
        const y = groundAt(ctx, c, cell.x, cell.z, fence);
        ctx.put(cell.x, y, cell.z, fence);
        ctx.put(cell.x, y + 1, cell.z, "hay_block", { axis: "y" });
        c.n += 2;
      } else if (along % 3 === 2) {
        const y = groundAt(ctx, c, cell.x, cell.z, "spruce_planks");
        ctx.put(cell.x, y, cell.z, "beehive", {
          facing: apronFacing(plan, cell.x, cell.z),
          honey_level: "0",
        });
        c.n++;
      }
    }
  }

  const it = ctx.interior;
  const end = farEnd(ctx);
  // The extraction bench: a cauldron with a counter run beside it.
  c.put1(it.x0, end.z, "cauldron", { level: "0" });
  table(ctx, c, it.x0, end.z === it.z0 ? end.z + 1 : end.z - 1);
  c.put1(it.x1, end.z, "barrel", { facing: "up", open: "false" });
  c.put1(it.x1, end.z === it.z0 ? it.z1 : it.z0, "chest", { facing: "west", type: "single" });
  c.put1(it.x0, end.z === it.z0 ? it.z1 : it.z0, pottedAt(it.x0, it.z1));
}

/**
 * `hop_kiln` — the oast, cowl and all.
 *
 * The kiln is a **brick corbel cone** closing on a solid cap with a white
 * **cowl** spike on it, over brick walls. The drying floor above the fire is
 * read as a band of slatted trapdoors near the plate; the fire itself is a
 * furnace at the base, on the far wall row, with the fuel beside it.
 */
function fitHopKiln(ctx: FitOutContext, c: PropCounter): void {
  const plan = wallPlan(ctx);
  if (plan !== null) {
    c.n += reclad(ctx, plan, 2, ctx.wallTop, (x, y, z) =>
      (x * 5 + y * 3 + z * 7) % 9 === 0 ? "mud_bricks" : "bricks",
    );
    // The drying floor, read from outside: a slatted band under the plate.
    trapdoorGrid(ctx, c, plan, [Math.max(2, ctx.wallTop - 2)], 2);
  }
  const roof = roofPlan(ctx);
  if (roof !== null) {
    clearRoof(ctx, roof);
    // Solid cap, then the cowl: the one partial block a cone may wear stands
    // directly on the solid cap.
    c.n += corbel(ctx, roof, () => "bricks", "smooth_stone", 1, "white_wool");
  }

  const it = ctx.interior;
  const end = farEnd(ctx);
  c.put1(it.x0, end.z, "furnace", { facing: "east", lit: "false" });
  c.put1(it.x0, end.z === it.z0 ? end.z + 1 : end.z - 1, "barrel", {
    facing: "up",
    open: "false",
  });
  c.put1(it.x1, end.z, "hay_block", { axis: "y" });
  c.put1(it.x1, end.z === it.z0 ? it.z1 : it.z0, "chest", { facing: "west", type: "single" });
}

/**
 * `cider_press` — the works idiom, rustic.
 *
 * The press is the prop: a fence **screw** with a slab **platen** stacked over
 * it, standing beside the cauldron that catches the juice — the platen has the
 * screw under it, so nothing floats. Apple barrels line the far row and a
 * shelf of bottles is read as a trapdoor run on the wall.
 */
function fitCiderPress(ctx: FitOutContext, c: PropCounter): void {
  const plan = wallPlan(ctx);
  if (plan !== null) {
    c.n += reclad(ctx, plan, 2, ctx.wallTop, (x, y, z) => {
      if (y === 2 || y === ctx.wallTop) return "stripped_oak_log";
      const along = x === 0 || x === plan.sx - 1 ? z : x;
      return along % 4 === 2 ? "oak_planks" : "cobblestone";
    });
  }

  const it = ctx.interior;
  const end = farEnd(ctx);
  const near = end.z === it.z0 ? it.z1 : it.z0;
  const step = end.z === it.z0 ? 1 : -1;
  // The press: the screw and its platen, with the catching vessel beside it.
  if (c.put1(it.x0, end.z, ctx.style["wall.fence"] as string)) {
    c.stack(it.x0, end.z, 2, ctx.style["stone.slab"] as string, {
      type: "bottom",
      waterlogged: "false",
    });
  }
  // The catching vessel, offered every cell down the press's own wall row: a
  // cell taken by the stair run, the hearth reserve or the door approach is a
  // cell `put1` refuses, and a cider press with nothing under the platen is a
  // cider press nobody can test for.
  for (let z = end.z; z >= it.z0 && z <= it.z1; z += step) {
    if (z === end.z) continue;
    if (c.put1(it.x0, z, "cauldron", { level: "0" })) break;
  }
  // The apple barrels and the bottle shelf.
  for (let z = it.z0; z <= it.z1; z += 2) {
    if (!c.put1(it.x1, z, "barrel", { facing: "up", open: "false" })) continue;
    c.stack(it.x1, z, Math.min(2, ctx.storyHeight - 1), ctx.style["wall.trapdoor"] as string,
      shutter("west"));
  }
  c.put1(it.x0, near, "composter", { level: "0" });
}

/**
 * `root_cellar_mound` — a cool room under a turf mound.
 *
 * The mound is a **two-course corbel** of coarse dirt surfaced in grass, the
 * sod house's roof at a shallower pitch, closing on a solid grass cap. The
 * walls are cobble and packed mud, which is what a cellar's retaining wall is.
 *
 * It does **not** dig. A sunken floor would break the foundation skirt the
 * shell lays under the whole footprint, and this file may not leave the
 * envelope in either direction — so the cool room is read from its shelving:
 * barrels and crates along both wall rows, with a lidded hatch over each.
 */
function fitRootCellarMound(ctx: FitOutContext, c: PropCounter): void {
  const plan = wallPlan(ctx);
  if (plan !== null) {
    c.n += reclad(ctx, plan, 2, ctx.wallTop, (_x, y) =>
      y % 2 === 0 ? "packed_mud" : "cobblestone",
    );
  }
  const roof = roofPlan(ctx);
  if (roof !== null) {
    clearRoof(ctx, roof);
    c.n += corbel(
      ctx,
      roof,
      (x, y, z) => ((x + y + z) % 5 === 0 ? "coarse_dirt" : "grass_block"),
      "grass_block",
      2,
    );
  }

  const it = ctx.interior;
  for (let z = it.z0; z <= it.z1; z += 2) {
    for (const [x, facing] of [
      [it.x0, "east"],
      [it.x1, "west"],
    ] as const) {
      const crate = (x + z) % 2 === 0 ? "barrel" : "chest";
      const props =
        crate === "barrel"
          ? { facing: "up", open: "false" }
          : { facing: facing === "east" ? "east" : "west", type: "single" };
      if (!c.put1(x, z, crate, props)) continue;
      c.stack(x, z, Math.min(2, ctx.storyHeight - 1), ctx.style["wall.trapdoor"] as string,
        shutter(facing));
    }
  }
  c.put1(lanternColumn(it).x, farEnd(ctx).z, "composter", { level: "0" });
}

/* -------------------------------------------------------------------------- */
/* the fantasy houses                                                          */
/* -------------------------------------------------------------------------- */

/** How far back a crooked ridge sits, as a share of the depth. */
function saltboxRise(z: number, sz: number, ridge: number): number {
  return z <= ridge ? z : Math.max(0, ridge - Math.floor(((z - ridge) * ridge) / (sz - 1 - ridge)));
}

/**
 * `witch_hut` — dark spruce, a crooked roof and a cauldron in the corner.
 *
 * The re-clad is swamp timber: spruce planks over a dark under-course, with
 * stripped posts at every third bay. The roof is rebuilt **asymmetrically** —
 * the saltbox idiom, ridge a third of the way back, gable ends packed solid so
 * there is no sky through the attic — which is the crooked read without a
 * second grammar for a crooked shape.
 *
 * Inside is the cauldron, on a wall row and well clear of the circulation and
 * of the lantern column; the potion shelves are bookshelves; and the cat is a
 * carpet cushion, because entities are not this file's to place.
 */
function fitWitchHut(ctx: FitOutContext, c: PropCounter): void {
  const plan = roofPlan(ctx);
  if (plan !== null) {
    c.n += reclad(ctx, plan, 2, ctx.wallTop, (x, y, z) => {
      if (y === 2) return "dark_oak_log";
      const along = x === 0 || x === plan.sx - 1 ? z : x;
      return along % 3 === 0 ? "stripped_spruce_log" : "spruce_planks";
    });
    clearRoof(ctx, plan);
    const stairs = "spruce_stairs";
    const solid = "spruce_planks";
    const slabBlock = "spruce_slab";
    const ridge = Math.max(1, Math.min(Math.floor((plan.sz - 1) / 3), plan.top - plan.base));
    for (let z = 0; z < plan.sz; z++) {
      const y = plan.base + saltboxRise(z, plan.sz, ridge);
      if (y > plan.top) continue;
      const facing: Cardinal = z <= ridge ? "north" : "south";
      for (let x = 0; x < plan.sx; x++) {
        if (x === 0 || x === plan.sx - 1) {
          for (let fy = plan.base; fy < y; fy++) ctx.put(x, fy, z, solid);
        }
        ctx.put(x, y, z, z === ridge ? slabBlock : stairs, {
          ...(z === ridge
            ? { type: "bottom", waterlogged: "false" }
            : { facing, half: "bottom", shape: "straight" }),
        });
      }
      c.n++;
    }
  }

  const it = ctx.interior;
  const end = farEnd(ctx);
  // The cauldron is offered every corner rather than one: a corner taken by
  // the stair run, the hearth reserve or the door approach is a corner `put1`
  // refuses, and a witch's hut with no cauldron in it is not one.
  for (const [cx, cz] of [
    [it.x0, end.z],
    [it.x1, end.z],
    [it.x0, end.z === it.z0 ? it.z1 : it.z0],
    [it.x1, end.z === it.z0 ? it.z1 : it.z0],
  ] as const) {
    if (c.put1(cx, cz, "cauldron", { level: "3" })) break;
  }
  c.put1(it.x0, end.z === it.z0 ? end.z + 1 : end.z - 1, "bookshelf");
  c.put1(it.x1, end.z, "bookshelf");
  c.put1(it.x1, end.z === it.z0 ? it.z1 : it.z0, "barrel", { facing: "up", open: "false" });
  // The cat's cushion.
  c.put1(it.x0, end.z === it.z0 ? it.z1 : it.z0, "purple_carpet");
}

/**
 * `mushroom_house` — a cap of mushroom blocks over a stem-white drum.
 *
 * The one archetype in the file whose ideal material is exactly what it is:
 * the cap is a corbelled dome of **red mushroom blocks** closing on a solid
 * red cap — solid, because a partial block over the dome's hollow is a
 * floating block — and the walls are **mushroom stem** with brown-mushroom
 * spots keyed off position. Inside is a small round-feeling room: a stool, a
 * table and a store of shrooms in barrels.
 */
function fitMushroomHouse(ctx: FitOutContext, c: PropCounter): void {
  const plan = wallPlan(ctx);
  if (plan !== null) {
    c.n += reclad(ctx, plan, 2, ctx.wallTop, (x, y, z) =>
      (x * 7 + y * 5 + z * 3) % 11 === 0 ? "brown_mushroom_block" : "mushroom_stem",
    );
  }
  const roof = roofPlan(ctx);
  if (roof !== null) {
    clearRoof(ctx, roof);
    c.n += corbel(
      ctx,
      roof,
      (x, y, z) => ((x * 3 + y + z * 5) % 9 === 0 ? "mushroom_stem" : "red_mushroom_block"),
      "red_mushroom_block",
      2,
    );
  }

  const it = ctx.interior;
  const end = farEnd(ctx);
  table(ctx, c, it.x1, end.z);
  // The stool: a stair, backrest away from the table it is drawn up to.
  c.put1(it.x1, end.z === it.z0 ? end.z + 1 : end.z - 1, ctx.style["stair.interior"] as string, {
    facing: end.z === it.z0 ? "south" : "north",
    half: "bottom",
    shape: "straight",
  });
  c.put1(it.x0, end.z, "barrel", { facing: "up", open: "false" });
  c.put1(it.x0, end.z === it.z0 ? it.z1 : it.z0, "brown_mushroom_block");
  c.put1(it.x1, end.z === it.z0 ? it.z1 : it.z0, pottedAt(it.x1, it.z1));
}

/**
 * `hobbit_hole` — a round door in a green bank.
 *
 * Two things carry it. The **door ring**: a trim of stripped log written into
 * the wall around the door column — never over the door itself, which the
 * preserve list guarantees — so the opening reads round without a round
 * opening existing. And the **turf roof**: the sod house's shallow corbel in
 * grass over coarse dirt, closing on a solid grass cap.
 *
 * Inside it is comfort: a rug in the corner, a settle whose backrest points
 * away from the room, and a pantry of barrels along the far row.
 */
function fitHobbitHole(ctx: FitOutContext, c: PropCounter): void {
  const plan = wallPlan(ctx);
  if (plan !== null) {
    c.n += reclad(ctx, plan, 2, ctx.wallTop, (x, y, z) =>
      (x + z + y) % 4 === 0 ? "coarse_dirt" : "packed_mud",
    );
    // The round-door read: a ring of trim on the wall around the doorway.
    if (ctx.door !== null) {
      const onX = ctx.door.x === 0 || ctx.door.x === plan.sx - 1;
      for (let d = -1; d <= 1; d++) {
        for (let y = 1; y <= 4; y++) {
          const x = onX ? ctx.door.x : ctx.door.x + d;
          const z = onX ? ctx.door.z + d : ctx.door.z;
          if (x < 0 || x >= plan.sx || z < 0 || z >= plan.sz) continue;
          if (d === 0 && y <= 3) continue; // the doorway itself
          const standing = ctx.blockAt(x, y, z);
          if (standing !== undefined && PRESERVE.test(standing.block)) continue;
          ctx.put(x, y, z, "stripped_oak_log", { axis: onX ? "z" : "x" });
          c.n++;
        }
      }
    }
  }
  const roof = roofPlan(ctx);
  if (roof !== null) {
    clearRoof(ctx, roof);
    c.n += corbel(
      ctx,
      roof,
      (x, y, z) => ((x + y + z) % 6 === 0 ? "coarse_dirt" : "grass_block"),
      "grass_block",
      2,
    );
  }

  const it = ctx.interior;
  const end = farEnd(ctx);
  table(ctx, c, it.x0, end.z);
  // The settle beside the table: its backrest is west, so the sitter looks east.
  c.put1(it.x0, end.z === it.z0 ? end.z + 1 : end.z - 1, ctx.style["stair.interior"] as string, {
    facing: "west",
    half: "bottom",
    shape: "straight",
  });
  c.put1(it.x1, end.z, "bookshelf");
  c.put1(it.x1, end.z === it.z0 ? it.z1 : it.z0, "barrel", { facing: "up", open: "false" });
  c.put1(it.x0, end.z === it.z0 ? it.z1 : it.z0, "brown_carpet");
}

/**
 * `gingerbread_cottage` — brown biscuit, white icing and candy dots.
 *
 * The re-clad is the archetype: brown walls with **icing courses** in white at
 * the plinth head and under the plate, and candy dots — pink and lime concrete
 * — scattered by position so opposite walls agree. The icing is concrete and
 * quartz rather than snow layers: a snow layer is a partial block, and a
 * partial block in a wall field is a hole with a shelf in it.
 *
 * Inside there is a sweets counter: a table run, a cake on it and jars in
 * barrels behind.
 */
function fitGingerbreadCottage(ctx: FitOutContext, c: PropCounter): void {
  const plan = wallPlan(ctx);
  if (plan !== null) {
    c.n += reclad(ctx, plan, 2, ctx.wallTop, (x, y, z) => {
      if (y === 2 || y === ctx.wallTop) return "white_concrete";
      const key = (x * 5 + y * 7 + z * 3) % 13;
      if (key === 0) return "pink_concrete";
      if (key === 5) return "lime_concrete";
      return "brown_terracotta";
    });
    // The icing eave: a white course in the apron at the plate line, which is
    // the drip a piped roof edge reads as.
    for (const cell of apronOf(plan.sx, plan.sz)) {
      if (onWayIn(ctx, cell.x, cell.z)) continue;
      ctx.put(cell.x, ctx.wallTop, cell.z, "quartz_block");
      c.n++;
    }
  }

  const it = ctx.interior;
  const end = farEnd(ctx);
  table(ctx, c, it.x0, end.z);
  c.put1(it.x1, end.z, "cake", { bites: "0" });
  c.put1(it.x1, end.z === it.z0 ? end.z + 1 : end.z - 1, "barrel", {
    facing: "up",
    open: "false",
  });
  c.put1(it.x0, end.z === it.z0 ? it.z1 : it.z0, "chest", { facing: "east", type: "single" });
  c.put1(it.x1, end.z === it.z0 ? it.z1 : it.z0, pottedAt(it.x1, it.z1));
}
