/**
 * Archetype breadth, **wave five E** — arcana: the fantastical and the
 * remembered.
 *
 * Twelve buildings. Five fantasy: an alchemist's tower, a dragon roost, a
 * crystal shrine, a dwarven gate and a beacon spire. Five memorial: a
 * cenotaph, a war memorial, an urn wall, a remembrance arch and a funeral
 * pyre platform. One leisure: a bathing pavilion. One residential: servants'
 * quarters.
 *
 * ## An archetype is a fit-out, not a second grammar
 *
 * The normative statement is `archetypes-blitz.ts`'s header; the short form is
 * `archetypes-homestead.ts`'s. A fit-out runs **after** every shape stage and
 * writes into the same cell map, so it may re-clad a wall field and rebuild a
 * roof without a line of `core.ts` changing, and every invariant the shell
 * already guarantees still holds. An alchemist's tower is the house shell in
 * copper-banded masonry under a corbelled cone; a cenotaph is the same shell
 * gone quiet with a cist in it. Neither is a new grammar and neither may grow
 * one: no new footprint, no new opening rule, no second storey system.
 *
 * ## The two rules everything here obeys
 *
 * 1. **Nothing leaves the envelope.** Exterior work is bounded above by
 *    `roofTop + `{@link ROOF_FLOURISH_RISE} and in plan by the footprint plus
 *    the one-block apron ring the eave already uses.
 * 2. **The interior stays walkable, and a monument is not an exception.** A
 *    cenotaph is a *shell with a memorial inside it*, not a solid plug: every
 *    interior prop here goes through {@link PropCounter}, which routes through
 *    the ground floor's own `free` and `take`, and every one of the twelve is
 *    held to the shared pocket detector in the test file.
 *
 * ## The field lessons this file was written against
 *
 * Every one came back from an in-game walkthrough or a physics-lint failure,
 * and each is a rule here rather than a comment:
 *
 * - a **stair's `facing` is its backrest** — it points away from what the
 *   sitter looks at. The crystal shrine's kneeling benches therefore face
 *   *away* from the crystal;
 * - a bare `flower_pot` renders **empty**; every pot goes through
 *   {@link pottedAt};
 * - the shell hangs a lantern over the **middle column** of the room at head
 *   height in a three-course storey, so no route here is one cell wide through
 *   that column: the cenotaph's cist and the pyre's dais both stand *off* the
 *   centre, and the bathing pavilion's divider is nudged off the lantern row
 *   exactly as the bathhouse's is;
 * - the trestle table is refused by the stack guard under a three-course
 *   storey, so {@link table} switches to a top slab there — which is what the
 *   servants' hall eats off;
 * - nothing body-blocking stands on width-1 circulation, and no stair goes
 *   anywhere a stander has no headroom (the bathing pavilion's `benchHeadroom`
 *   gate is the bathhouse's, verbatim);
 * - **no sign blocks.** A sign needs a paired block entity the op stream
 *   cannot carry. Signage is a **wall** banner — and it is a *wall* banner
 *   rather than a standing one for the opera-house reason: a standing banner
 *   beside an unmountable platform is a sealed pocket. The cenotaph's name
 *   wall, the war memorial's flags and the urn wall's all hang on walls;
 * - **fluids are a cauldron or the boxed pool.** The pavilion's water is the
 *   bathhouse's argument unchanged: into the floor plane at `y = 0`, in a rect
 *   inset one cell from the interior, so under every water cell is the
 *   foundation skirt and beside every water cell is pool or written floor;
 * - **an apron prop stands on the actual ground** — {@link groundAt}, so the
 *   dwarven gate's braziers never stand on air;
 * - **a spire closes on a solid cap.** A partial block in the middle of a cap
 *   rect has nothing under it but the cone's hollow; the one thing that may
 *   stand on a cap is the finial, and the beacon spire's light crown does
 *   exactly that. The remembrance arch obeys the same rule sideways: its crown
 *   is a **continuous course of full blocks from wall to wall**, never a run of
 *   floating slabs, because the lint's `floating.*` rules police a full cube
 *   with six air faces;
 * - **no `chain` blocks** — where something wants to read as hung ironwork it
 *   is `iron_bars`, which takes support from the block beside it.
 */

import {
  PropCounter,
  ROOF_FLOURISH_RISE,
  type FitOutContext,
} from "./archetypes-civic.js";
import { pottedAt } from "./archetypes-wave2.js";
import { cardinalStep, type Cardinal, type LocalRect } from "./core.js";

/* -------------------------------------------------------------------------- */
/* the archetypes                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The twelve archetypes this file fits out, in catalog order: the fantasy five
 * first, then the memorial five, then the pavilion and the quarters.
 *
 * Spread into `BUILDING_ARCHETYPES` by `archetypes.ts`.
 */
export const ARCANA_BUILDING_ARCHETYPES = [
  "alchemists_tower",
  "dragon_roost",
  "crystal_shrine",
  "dwarven_gate",
  "beacon_spire",
  "cenotaph",
  "war_memorial",
  "urn_wall",
  "remembrance_arch",
  "pyre_platform",
  "bathing_pavilion",
  "servants_quarters",
] as const;

/** One of the archetypes this file fits out. */
export type ArcanaBuildingArchetype = (typeof ARCANA_BUILDING_ARCHETYPES)[number];

/** True for an archetype this file answers to. */
export function isArcanaArchetype(value: string): value is ArcanaBuildingArchetype {
  return (ARCANA_BUILDING_ARCHETYPES as readonly string[]).includes(value);
}

/**
 * Tag → archetype, or `null` when nothing matches.
 *
 * Consulted straight after the dwellings and well before the extended table.
 * Every tag below is one no other table claims, and the near misses are the
 * whole of the review:
 *
 * - **`alchemist` is not ours.** It is the trade wave's **apothecary**, and
 *   claiming it would silently retheme every chemist's shop in the vocabulary.
 *   The tower answers to `alchemists_tower`, `alchemy_tower` and `alchemists`;
 * - **bare `wizard`, `arcane` and `sorcerer` are not ours** either — those are
 *   the breadth **wizard tower's**, which this building is the chemist cousin
 *   of, not a replacement for;
 * - **bare `shrine` and `temple` are not ours.** Both mean **church** in the
 *   extended table, and this table is consulted *before* that one, so claiming
 *   either would steal every temple in the vocabulary. The crystal shrine
 *   answers to `crystal_shrine`, `crystal` and `amethyst_shrine`;
 * - **bare `beacon` is not ours.** `beacon_tower` is a parallel military
 *   track's id and bare `beacon` is left free for it and for the lighthouse;
 *   this claims only `beacon_spire` and `spire`;
 * - **`tomb`, `sepulchre` and `mausoleum` are not ours** — the breadth
 *   mausoleum's and wave 4B's tomb keep them. The memorials here answer to
 *   their own names only;
 * - **`columbarium` is not ours.** It is the wave-4D **dovecote's**, which is
 *   the older sense of the word; the urn wall answers to `urn_wall`, `urns`
 *   and `urn_niches`. `ossuary` is left alone too — that is an underground
 *   catalog entry;
 * - **bare `baths`, `sauna` and `hammam` are not ours**: all three are the
 *   town **bathhouse's** (and the wave-4C dry sauna's). The pavilion answers
 *   to `bathing_pavilion` and `bath_pavilion`;
 * - `arch` is never claimed bare — a bridge is full of arches. The memorial
 *   arch answers to `remembrance_arch`, `memorial_arch` and `triumphal_arch`;
 * - `house` still falls through to a cottage and `hall` is still the great
 *   hall's: the quarters claim `servants_quarters` and `servants` only.
 */
export function arcanaArchetypeOfTags(tags: readonly string[]): ArcanaBuildingArchetype | null {
  const has = (t: string): boolean => tags.includes(t);
  if (has("alchemists_tower") || has("alchemy_tower") || has("alchemists")) {
    return "alchemists_tower";
  }
  if (has("dragon_roost") || has("dragon") || has("roost")) return "dragon_roost";
  if (has("crystal_shrine") || has("crystal") || has("amethyst_shrine")) return "crystal_shrine";
  if (has("dwarven_gate") || has("dwarven") || has("deep_gate")) return "dwarven_gate";
  if (has("beacon_spire") || has("spire")) return "beacon_spire";
  if (has("cenotaph")) return "cenotaph";
  if (has("war_memorial") || has("memorial")) return "war_memorial";
  if (has("urn_wall") || has("urns") || has("urn_niches")) return "urn_wall";
  if (has("remembrance_arch") || has("memorial_arch") || has("triumphal_arch")) {
    return "remembrance_arch";
  }
  if (has("pyre_platform") || has("pyre")) return "pyre_platform";
  if (has("bathing_pavilion") || has("bath_pavilion")) return "bathing_pavilion";
  if (has("servants_quarters") || has("servants")) return "servants_quarters";
  return null;
}

/**
 * Facade tendencies for this file's archetypes.
 *
 * Same contract as `archetypeFacadeDefaults`: defaults a caller merges into
 * its params, never something applied over an explicit one. Everything that
 * rebuilds its roof as a cone asks for the shape with the most vertical room,
 * because the replacement is bounded by where the shell's own roof finished.
 */
export function arcanaFacadeDefaults(
  archetype: string,
): { readonly windowShape?: string; readonly windowRhythm?: string; readonly roof?: string } {
  switch (archetype) {
    // A cone is the building; it wants every course it can get.
    case "alchemists_tower":
      return { windowShape: "single", windowRhythm: "sparse", roof: "hip" };
    // A great open hall: big and dim, lit by what is burning in it.
    case "dragon_roost":
      return { windowShape: "single", windowRhythm: "sparse", roof: "gable" };
    case "crystal_shrine":
      return { windowShape: "tall", windowRhythm: "regular", roof: "hip" };
    // The door face is the building; the walls beside it stay blind.
    case "dwarven_gate":
      return { windowShape: "single", windowRhythm: "sparse", roof: "gable" };
    case "beacon_spire":
      return { windowShape: "single", windowRhythm: "sparse", roof: "hip" };
    case "cenotaph":
      return { windowShape: "single", windowRhythm: "sparse", roof: "hip" };
    case "war_memorial":
      return { windowShape: "single", windowRhythm: "sparse", roof: "hip" };
    case "urn_wall":
      return { windowShape: "single", windowRhythm: "sparse", roof: "gable" };
    case "remembrance_arch":
      return { windowShape: "tall", windowRhythm: "regular", roof: "flat" };
    case "pyre_platform":
      return { windowShape: "single", windowRhythm: "sparse", roof: "flat" };
    // Airier than the bathhouse, which is the whole point of a pavilion.
    case "bathing_pavilion":
      return { windowShape: "tall", windowRhythm: "regular", roof: "hip" };
    case "servants_quarters":
      return { windowShape: "single", windowRhythm: "regular", roof: "gable" };
    default:
      return {};
  }
}

/* -------------------------------------------------------------------------- */
/* the exterior plan                                                           */
/* -------------------------------------------------------------------------- */

/**
 * What an exterior rebuild needs to know, or `null` when it may not run.
 *
 * Wave four D's `HomesteadPlan` in every respect, restated here rather than
 * imported because the two waves are separate seams and a shared private
 * helper is a shared edit. The refusals are the same: a **plain rect** only,
 * and at least two courses of room above the eave plate before a roof may be
 * rebuilt.
 */
interface ArcanaPlan {
  /** Envelope extents. */
  readonly sx: number;
  readonly sz: number;
  /** Y of the roof's lowest course — one above the eave plate. */
  readonly base: number;
  /** Highest Y anything may occupy: the shell's roof top plus the allowance. */
  readonly top: number;
  /** The footprint, as an inclusive rect. */
  readonly rect: LocalRect;
}

/** The plan for work on the **walls**: the rect condition, and nothing else. */
function wallPlan(ctx: FitOutContext): ArcanaPlan | null {
  const sx = ctx.size[0];
  const sz = ctx.size[2];
  const it = ctx.interior;
  if (it.x0 !== 1 || it.z0 !== 1 || it.x1 !== sx - 2 || it.z1 !== sz - 2) return null;
  return {
    sx,
    sz,
    base: ctx.wallTop + 1,
    top: ctx.roofTop + ROOF_FLOURISH_RISE,
    rect: { x0: 0, z0: 0, x1: sx - 1, z1: sz - 1 },
  };
}

/** The plan for a **roof rebuild**: a wall plan that also has room to build in. */
function roofPlan(ctx: FitOutContext): ArcanaPlan | null {
  const plan = wallPlan(ctx);
  if (plan === null) {
    ctx.skipped?.push("roof work: the interior is not the one-block inset the rebuild plans over");
    return null;
  }
  const courses = plan.top - plan.base;
  if (courses < 2) {
    ctx.skipped?.push(
      `roof work: ${courses} course${courses === 1 ? "" : "s"} above the eave where the rebuild needs 2 — a flat or low roof leaves no room`,
    );
    return null;
  }
  return plan;
}

/** Clear everything the shell built above the eave plate, apron included. */
function clearRoof(ctx: FitOutContext, plan: ArcanaPlan): void {
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
 * **The apron-post ground rule**, wave four D's helper unchanged. On conformed
 * terrain the apron ground fills local `y = 0`; on a platform it sits one
 * lower, so a prop written at `y = 1` would float and the support-chain rule
 * would rightly refuse it.
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
 * result is deterministic without a draw.
 */
function reclad(
  ctx: FitOutContext,
  plan: ArcanaPlan,
  yFrom: number,
  yTo: number,
  block: (x: number, y: number, z: number) => string,
): number {
  let n = 0;
  for (const cell of ringOf(plan.sx, plan.sz)) {
    for (let y = yFrom; y <= yTo; y++) {
      const standing = ctx.blockAt(cell.x, y, cell.z);
      if (standing !== undefined && PRESERVE.test(standing.block)) continue;
      ctx.put(cell.x, y, cell.z, block(cell.x, y, cell.z));
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
 * Wave four D's machinery, restated: `courses` is how many courses are laid
 * before the ring steps in, so 1 gives a steep cone and 2 a shallower mound.
 * The first course is solid — it is the lid of the room below — and the last
 * is a solid cap slab, because a partial block in the middle of the cap rect
 * has nothing under it but the cone's hollow. The one block a cone may wear on
 * top of that is the `finial`, standing directly on the solid cap.
 */
function corbel(
  ctx: FitOutContext,
  plan: ArcanaPlan,
  block: (x: number, y: number, z: number) => string,
  cap: string,
  courses = 1,
  finial?: string,
  finialProps?: Record<string, string>,
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
    ctx.put((rect.x0 + rect.x1) >> 1, capY + 1, (rect.z0 + rect.z1) >> 1, finial ?? cap, finialProps);
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

/** The end of the room furthest from the door, and which way a visitor looks. */
function farEnd(ctx: FitOutContext): { readonly z: number; readonly look: Cardinal } {
  const it = ctx.interior;
  const north = ctx.door === null ? true : ctx.door.z > (it.z0 + it.z1) / 2;
  return { z: north ? it.z0 : it.z1, look: north ? "north" : "south" };
}

/** Trapdoor props for a screen, shutter or niche front hung flat on a wall. */
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
function apronFacing(plan: ArcanaPlan, x: number, z: number): Cardinal {
  if (z === -1) return "north";
  if (z === plan.sz) return "south";
  if (x === -1) return "west";
  return "east";
}

/**
 * Offer a prop every cell of the two wall rows in turn, and stop at the first
 * that takes it.
 *
 * The idiom the cider press and the witch's hut both had to grow: a cell taken
 * by the stair run, the hearth reserve or the door approach is a cell `put1`
 * refuses, and a building whose defining prop is absent on a tight envelope is
 * a building nobody can write a test for. Wall rows only — the middle of the
 * floor is the route.
 */
function offerOnWalls(
  ctx: FitOutContext,
  c: PropCounter,
  block: string,
  props?: Record<string, string>,
): boolean {
  const it = ctx.interior;
  for (let z = it.z0; z <= it.z1; z++) {
    for (const x of [it.x1, it.x0]) {
      if (c.put1(x, z, block, props)) return true;
    }
  }
  return false;
}

/** Candle props at a given count, always unlit: a memorial candle is not lit. */
function candles(n: number): Record<string, string> {
  return { candles: String(n), lit: "false", waterlogged: "false" };
}

/**
 * Hang a wall banner on an interior wall row, at head height.
 *
 * **The opera lesson**, applied. A standing banner is a body-blocking block
 * that can seal a cell; a wall banner is passable and takes its support from
 * the wall behind it, which every re-clad in this file has already written
 * solid. `facing` is the direction the banner's face points — *away* from its
 * wall — so a banner on the `x0` row faces east.
 */
function wallBanner(ctx: FitOutContext, c: PropCounter, x: number, z: number, block: string,
  facing: Cardinal): void {
  if (ctx.blockAt(x, 2, z) !== undefined) return;
  ctx.put(x, 2, z, block, { facing });
  c.n++;
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
export function furnishArcana(ctx: FitOutContext): number {
  if (!isArcanaArchetype(ctx.archetype)) return 0;
  const c = new PropCounter(ctx);
  switch (ctx.archetype) {
    case "alchemists_tower":
      fitAlchemistsTower(ctx, c);
      break;
    case "dragon_roost":
      fitDragonRoost(ctx, c);
      break;
    case "crystal_shrine":
      fitCrystalShrine(ctx, c);
      break;
    case "dwarven_gate":
      fitDwarvenGate(ctx, c);
      break;
    case "beacon_spire":
      fitBeaconSpire(ctx, c);
      break;
    case "cenotaph":
      fitCenotaph(ctx, c);
      break;
    case "war_memorial":
      fitWarMemorial(ctx, c);
      break;
    case "urn_wall":
      fitUrnWall(ctx, c);
      break;
    case "remembrance_arch":
      fitRemembranceArch(ctx, c);
      break;
    case "pyre_platform":
      fitPyrePlatform(ctx, c);
      break;
    case "bathing_pavilion":
      fitBathingPavilion(ctx, c);
      break;
    case "servants_quarters":
    default:
      fitServantsQuarters(ctx, c);
      break;
  }
  return c.n;
}

/* -------------------------------------------------------------------------- */
/* the fantastical                                                             */
/* -------------------------------------------------------------------------- */

/**
 * `alchemists_tower` — the wizard tower's chemist cousin.
 *
 * Where the wizard's tower glows out of its own masonry, this one is
 * **copper-banded**: stone brick with cut-copper hoops every third course and
 * an oxidised band at the plate, which is the read of a building full of
 * apparatus rather than of spellwork. The roof is a corbelled cone closing on
 * a **solid** cap with a **lightning rod** vent standing on it — one block, on
 * the cap, which is the only thing a cap may carry.
 *
 * Inside is the lab floor: a brewing stand and the still (a cauldron with a
 * blast furnace beside it), the specimen shelves (barrels under trapdoor
 * fronts up the far wall row) and a reading press of bookshelves. Every one is
 * on a wall row, so the corridor down the middle — the one the lantern hangs
 * over — never has a prop across it.
 */
function fitAlchemistsTower(ctx: FitOutContext, c: PropCounter): void {
  const plan = wallPlan(ctx);
  if (plan !== null) {
    c.n += reclad(ctx, plan, 2, ctx.wallTop, (_x, y) => {
      if (y === ctx.wallTop) return "oxidized_cut_copper";
      return y % 3 === 0 ? "cut_copper" : "stone_bricks";
    });
  }
  const roof = roofPlan(ctx);
  if (roof !== null) {
    clearRoof(ctx, roof);
    c.n += corbel(
      ctx,
      roof,
      (x, y, z) => ((x * 3 + y * 5 + z * 7) % 8 === 0 ? "cut_copper" : "stone_bricks"),
      "chiseled_stone_bricks",
      1,
      "lightning_rod",
      { facing: "up", powered: "false" },
    );
  }

  const it = ctx.interior;
  const end = farEnd(ctx);
  const near = end.z === it.z0 ? it.z1 : it.z0;
  // The bench: the brewing stand and the still, side by side on the far wall.
  // The stand is offered every cell down the west wall row rather than one —
  // a cell taken by the stair run, the hearth reserve or the door approach is
  // a cell `put1` refuses, and an alchemist's tower with no brewing stand in
  // it is not one.
  for (let z = it.z0; z <= it.z1; z++) {
    const bz = end.z === it.z0 ? z : it.z1 - (z - it.z0);
    if (
      c.put1(it.x0, bz, "brewing_stand", {
        has_bottle_0: "false",
        has_bottle_1: "false",
        has_bottle_2: "false",
      })
    ) {
      break;
    }
  }
  c.put1(it.x0, end.z === it.z0 ? end.z + 1 : end.z - 1, "cauldron", { level: "2" });
  c.put1(it.x1, end.z, "blast_furnace", { facing: opposite(end.look), lit: "false" });
  // The specimen shelves: barrels up the east wall row with a hatch front over
  // each, so the wall reads as a case of jars rather than as a store.
  for (let z = it.z0 + 1; z <= it.z1 - 1; z += 2) {
    if (!c.put1(it.x1, z, "barrel", { facing: "up", open: "false" })) continue;
    c.stack(it.x1, z, Math.min(2, ctx.storyHeight - 1), ctx.style["wall.trapdoor"] as string,
      shutter("west"));
  }
  c.put1(it.x0, near, "bookshelf");
  c.put1(it.x1, near, pottedAt(it.x1, near));
}

/**
 * `dragon_roost` — a great open hall something enormous sleeps in.
 *
 * Three moves and no more, because the read is *emptiness with evidence in
 * it*:
 *
 * - **charred trim.** The re-clad is blackstone and basalt with a polished
 *   band at the plinth head and the plate, which is a hall that has been on
 *   fire more than once;
 * - **the nest**, centre-*offset* and deliberately **open on one side**. A
 *   closed ring of hay in the middle of a floor is a sealed pocket with straw
 *   round it; this is a crescent — the far and side arms only — laid one
 *   column off the lantern, so a body walks in through the gap and out again.
 *   Every cell goes through `put1`, so the ground floor's own connectivity
 *   guard has the final say anyway;
 * - **the hoard corner**, sparingly: one block of gold, one of raw gold and a
 *   chest, on the wall row furthest from the way in. Sparingly is the whole
 *   character — a floor of gold reads as a bank vault.
 *
 * The scorch is written into the **floor plane** at `y = 0`, so it recolours
 * without taking a cell: a blackened patch under the nest, in the shell's own
 * foundation course.
 */
function fitDragonRoost(ctx: FitOutContext, c: PropCounter): void {
  const plan = wallPlan(ctx);
  if (plan !== null) {
    c.n += reclad(ctx, plan, 2, ctx.wallTop, (x, y, z) => {
      if (y === 2 || y === ctx.wallTop) return "polished_blackstone";
      const along = x === 0 || x === plan.sx - 1 ? z : x;
      return (along + y) % 4 === 0 ? "basalt" : "blackstone";
    });
  }

  const it = ctx.interior;
  const lamp = lanternColumn(it);
  const end = farEnd(ctx);
  // The nest, one column off the lantern so the middle of the room is never
  // the nest's own centre.
  const nx = lamp.x - 1 >= it.x0 + 1 ? lamp.x - 1 : lamp.x + 1;
  const nz = lamp.z;
  // The scorch: a recolour of the floor plane under and around the nest. The
  // floor stays solid, so this costs the room nothing.
  for (let z = nz - 2; z <= nz + 2; z++) {
    for (let x = nx - 2; x <= nx + 2; x++) {
      if (x < it.x0 || x > it.x1 || z < it.z0 || z > it.z1) continue;
      if (ctx.blockAt(x, 0, z) === undefined) continue;
      const d = Math.abs(x - nx) + Math.abs(z - nz);
      ctx.put(x, 0, z, d <= 1 ? "blackstone" : d <= 2 ? "basalt" : "polished_blackstone");
      c.n++;
    }
  }
  // The nest crescent: the far arm and the two sides, never the near one —
  // that gap is the way in and out of the bowl.
  const open = end.z === it.z0 ? nz + 1 : nz - 1;
  for (let z = nz - 1; z <= nz + 1; z++) {
    for (let x = nx - 1; x <= nx + 1; x++) {
      if (x === nx && z === nz) continue; // the bowl itself stays empty
      if (z === open) continue; // the gap
      if (x < it.x0 || x > it.x1 || z < it.z0 || z > it.z1) continue;
      const bone = (x + z) % 3 === 0;
      c.put1(x, z, bone ? "bone_block" : "hay_block", { axis: bone ? "x" : "y" });
    }
  }
  // The hoard, on the far wall row and nowhere else.
  c.put1(it.x1, end.z, "gold_block");
  c.put1(it.x1, end.z === it.z0 ? end.z + 1 : end.z - 1, "raw_gold_block");
  c.put1(it.x0, end.z, "chest", { facing: "east", type: "single" });
  c.put1(it.x0, end.z === it.z0 ? it.z1 : it.z0, "barrel", { facing: "up", open: "false" });
}

/**
 * `crystal_shrine` — a geode with a room round it.
 *
 * The focus is an **amethyst pedestal**: a block of amethyst standing on the
 * floor with a cluster growing out of its top. The cluster is placed by
 * `stack`, so on a three-course storey — where a block at `y = 1` and anything
 * at `y = 2` is a pillar through the room — it is simply refused and the
 * pedestal stands bare. That is the right answer: a shrine with a shorter
 * crystal is a shrine; a shrine with a sealed cell in the middle of it is not.
 *
 * The pedestal stands one column **off** the lantern, for the reason every
 * centred prop in this vocabulary does. The trim is purpur and quartz above
 * the plinth. The kneeling benches are stairs either side of the approach, and
 * they obey the seat rule: a stair's `facing` is its backrest, so a bench a
 * worshipper kneels on looking *at* the crystal faces **away** from it.
 */
function fitCrystalShrine(ctx: FitOutContext, c: PropCounter): void {
  const plan = wallPlan(ctx);
  if (plan !== null) {
    c.n += reclad(ctx, plan, 2, ctx.wallTop, (x, y, z) => {
      if (y === ctx.wallTop) return "quartz_block";
      return (x * 5 + y * 3 + z * 7) % 6 === 0 ? "purpur_block" : "quartz_bricks";
    });
  }

  const it = ctx.interior;
  const lamp = lanternColumn(it);
  const end = farEnd(ctx);
  // The focus, off the lantern column.
  const fx = lamp.x - 1 >= it.x0 ? lamp.x - 1 : lamp.x + 1;
  const fz = end.z === it.z0 ? it.z0 + 1 : it.z1 - 1;
  const focusZ = fz >= it.z0 && fz <= it.z1 ? fz : lamp.z;
  if (c.put1(fx, focusZ, "amethyst_block")) {
    c.stack(fx, focusZ, 2, "amethyst_cluster", { facing: "up", waterlogged: "false" });
  }
  // The kneeling benches, either side of the approach, looking at the focus.
  // The crystal is to the north when the far end is, so the backrest is south.
  const backrest: Cardinal = end.look === "north" ? "south" : "north";
  const stair = ctx.style["stair.interior"] as string;
  const benchZ = end.look === "north" ? focusZ + 2 : focusZ - 2;
  if (benchZ >= it.z0 && benchZ <= it.z1) {
    for (const bx of [fx - 1, fx + 1]) {
      if (bx < it.x0 || bx > it.x1) continue;
      c.put1(bx, benchZ, stair, { facing: backrest, half: "bottom", shape: "straight" });
    }
  }
  // The offerings, on the wall rows: budding amethyst behind glass is not a
  // block palette away, so it is an amethyst block and unlit candles instead.
  c.put1(it.x0, end.z, "amethyst_block");
  c.put1(it.x1, end.z, "purple_candle", candles(3));
  c.put1(it.x0, end.z === it.z0 ? it.z1 : it.z0, pottedAt(it.x0, it.z1));
  c.put1(it.x1, end.z === it.z0 ? it.z1 : it.z0, "barrel", { facing: "up", open: "false" });
}

/**
 * `dwarven_gate` — the door face is the building.
 *
 * A **megalith trim** of deepslate brick is written into the wall around the
 * doorway, full height and three columns wide, with a **rune band** of
 * chiseled deepslate across it at the plate line — the whole face reads as one
 * carved slab of mountain with a hole in it. The doorway itself is never
 * touched: the preserve list guarantees it.
 *
 * The **braziers** stand in the apron either side of the doorstep, each on a
 * pedestal that goes through {@link groundAt} — a brazier standing on air is
 * the stilt-house lesson, and this file pays it once.
 *
 * Inside is a forge hall: an anvil and a smithing table on one wall row, the
 * fire (a lit furnace with its fuel) on the other, and ore stores at the far
 * end.
 */
function fitDwarvenGate(ctx: FitOutContext, c: PropCounter): void {
  const plan = wallPlan(ctx);
  if (plan !== null) {
    c.n += reclad(ctx, plan, 2, ctx.wallTop, (x, y, z) => {
      if (y === ctx.wallTop) return "chiseled_deepslate";
      const along = x === 0 || x === plan.sx - 1 ? z : x;
      return along % 4 === 0 ? "polished_deepslate" : "deepslate_bricks";
    });
    // The megalith around the doorway, and the rune band across it.
    if (ctx.door !== null) {
      const onX = ctx.door.x === 0 || ctx.door.x === plan.sx - 1;
      for (let d = -2; d <= 2; d++) {
        const x = onX ? ctx.door.x : ctx.door.x + d;
        const z = onX ? ctx.door.z + d : ctx.door.z;
        if (x < 0 || x >= plan.sx || z < 0 || z >= plan.sz) continue;
        for (let y = 1; y <= ctx.wallTop; y++) {
          if (d === 0 && y <= 3) continue; // the doorway itself
          const standing = ctx.blockAt(x, y, z);
          if (standing !== undefined && PRESERVE.test(standing.block)) continue;
          const rune = y === ctx.wallTop || (Math.abs(d) === 2 && y % 3 === 0);
          ctx.put(x, y, z, rune ? "chiseled_deepslate" : "deepslate_tiles");
          c.n++;
        }
      }
      // The braziers, in the apron beside the doorstep, on real ground.
      const out = outsideDoor(ctx);
      if (out !== null) {
        for (const [ox, oz] of [
          [out.x + 1, out.z],
          [out.x - 1, out.z],
          [out.x, out.z + 1],
          [out.x, out.z - 1],
        ] as const) {
          const skirt = ox === -1 || ox === plan.sx || oz === -1 || oz === plan.sz;
          if (!skirt || onWayIn(ctx, ox, oz)) continue;
          const y = groundAt(ctx, c, ox, oz, "polished_deepslate");
          ctx.put(ox, y, oz, "polished_deepslate");
          ctx.put(ox, y + 1, oz, "campfire", {
            lit: "true",
            signal_fire: "false",
            facing: apronFacing(plan, ox, oz),
            waterlogged: "false",
          });
          c.n += 2;
        }
      }
    }
  }

  const it = ctx.interior;
  const end = farEnd(ctx);
  const near = end.z === it.z0 ? it.z1 : it.z0;
  // The forge hall: the fire on one wall row, the work on the other.
  c.put1(it.x0, end.z, "furnace", { facing: "east", lit: "true" });
  // The anvil is offered every cell down the west row rather than one: a cell
  // taken by the stair run, the hearth reserve or the door approach is a cell
  // `put1` refuses, and a forge hall with no anvil in it is a storeroom.
  for (let z = it.z0; z <= it.z1; z++) {
    const az = end.z === it.z0 ? it.z1 - (z - it.z0) : z;
    if (c.put1(it.x0, az, "anvil", { facing: "east" })) break;
  }
  c.put1(it.x1, end.z, "smithing_table");
  c.put1(it.x1, end.z === it.z0 ? end.z + 1 : end.z - 1, "grindstone", {
    face: "floor",
    facing: "west",
  });
  c.put1(it.x0, near, "barrel", { facing: "up", open: "false" });
  c.put1(it.x1, near, "chest", { facing: "west", type: "single" });
}

/**
 * `beacon_spire` — a slim tower with a light on the end of it.
 *
 * The spire is a **one-course-per-inset corbel cone**, which is the steepest
 * this vocabulary draws, closing on a **solid** cap of smooth stone. The crown
 * — a sea lantern — stands **on** that cap: the one place a spire may carry
 * anything, and the reason the cap is solid rather than slabbed.
 *
 * Under it is the keeper's room, and it is a room rather than a plinth: a bed
 * on the wall row, a chest, a barrel of oil and a lectern with the light book
 * on it. Nothing stands in the middle.
 */
function fitBeaconSpire(ctx: FitOutContext, c: PropCounter): void {
  const plan = wallPlan(ctx);
  if (plan !== null) {
    c.n += reclad(ctx, plan, 2, ctx.wallTop, (_x, y) =>
      y % 4 === 0 ? "polished_andesite" : "stone_bricks",
    );
  }
  const roof = roofPlan(ctx);
  if (roof !== null) {
    clearRoof(ctx, roof);
    c.n += corbel(
      ctx,
      roof,
      (x, y, z) => ((x + y + z) % 7 === 0 ? "polished_andesite" : "stone_bricks"),
      "smooth_stone",
      1,
      "sea_lantern",
    );
  }

  const it = ctx.interior;
  const end = farEnd(ctx);
  const near = end.z === it.z0 ? it.z1 : it.z0;
  ctx.placeBed(it.x0, end.z, "west", "white_bed");
  c.put1(it.x1, end.z, "lectern", {
    facing: opposite(end.look),
    has_book: "false",
    powered: "false",
  });
  c.put1(it.x1, end.z === it.z0 ? end.z + 1 : end.z - 1, "barrel", {
    facing: "up",
    open: "false",
  });
  c.put1(it.x0, near, "chest", { facing: "east", type: "single" });
  c.put1(it.x1, near, pottedAt(it.x1, near));
}

/* -------------------------------------------------------------------------- */
/* the remembered                                                              */
/* -------------------------------------------------------------------------- */

/**
 * `cenotaph` — an empty tomb, in a quiet shell.
 *
 * A cenotaph is a monument to someone who is not in it, and the building is
 * that sentence: a sealed masonry shell with **one** thing in the middle of
 * it, and a room to stand in and read the names.
 *
 * - the **cist** is a plinth of dressed stone with a top slab lid, laid along
 *   z one column **off** the lantern — the tomb's own rule, because a bier
 *   under a hanging light is a bier nobody can stand beside;
 * - the **wreath ring** is green carpet on the floor cells round the cist.
 *   Carpet is passable, so the ring costs the room nothing at all and the
 *   route past the cist is never on it in the blocking sense;
 * - the **name wall** is a band of chiseled stone across the far wall with
 *   **wall** banners on it. Wall banners, not standing ones: a standing banner
 *   beside an unmountable plinth is a sealed pocket, which is the opera
 *   house's lesson and this file's rule.
 */
function fitCenotaph(ctx: FitOutContext, c: PropCounter): void {
  const plan = wallPlan(ctx);
  if (plan !== null) {
    c.n += reclad(ctx, plan, 2, ctx.wallTop, (x, y, z) => {
      if (y === ctx.wallTop) return "chiseled_stone_bricks";
      return (x * 3 + y * 7 + z * 5) % 9 === 0 ? "polished_andesite" : "stone_bricks";
    });
  }

  const it = ctx.interior;
  const lamp = lanternColumn(it);
  const end = farEnd(ctx);
  // The cist, one column off the lantern.
  const bx = lamp.x - 1 >= it.x0 ? lamp.x - 1 : lamp.x + 1;
  const slabBlock = ctx.style["stone.slab"] as string;
  const cist: [number, number][] = [];
  for (const bz of [lamp.z, lamp.z + 1]) {
    if (bz < it.z0 || bz > it.z1) continue;
    if (c.put1(bx, bz, "chiseled_stone_bricks")) {
      c.stack(bx, bz, 2, slabBlock, { type: "bottom", waterlogged: "false" });
      cist.push([bx, bz]);
    }
  }
  // The wreath: carpet on the floor cells round the cist. Passable, so it
  // takes nothing from the route — but it is still kept off the doorstep.
  for (const [cx, cz] of cist) {
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const x = cx + dx;
      const z = cz + dz;
      if (x < it.x0 || x > it.x1 || z < it.z0 || z > it.z1) continue;
      if (!ctx.free(x, z) || ctx.blockAt(x, 1, z) !== undefined) continue;
      ctx.put(x, 1, z, "green_carpet");
      c.n++;
    }
  }
  // The name wall, and its banners.
  wallBanner(ctx, c, it.x0, end.z, "white_wall_banner", "east");
  wallBanner(ctx, c, it.x1, end.z, "white_wall_banner", "west");
  c.put1(it.x0, end.z, "white_candle", candles(3));
  c.put1(it.x1, end.z, "gray_candle", candles(2));
  c.put1(it.x0, end.z === it.z0 ? it.z1 : it.z0, pottedAt(it.x0, it.z1));
}

/**
 * `war_memorial` — a plinth, a figure and the flags.
 *
 * There are no armour stands in this op stream, so the **figure** is built out
 * of blocks: a plinth of chiseled stone with a stone pillar on it and a wall
 * course for a helmet — a silhouette, which at block scale is all a figure
 * ever is. Like every centred prop here it stands one column off the lantern,
 * and the stacked courses go through `stack`, so a three-course storey simply
 * gets the plinth and the room stays walkable.
 *
 * The **benches** flank the approach, backrests to the walls so a sitter looks
 * in at the figure, and the **flags** are wall banners either side of it.
 */
function fitWarMemorial(ctx: FitOutContext, c: PropCounter): void {
  const plan = wallPlan(ctx);
  if (plan !== null) {
    c.n += reclad(ctx, plan, 2, ctx.wallTop, (_x, y) =>
      y === ctx.wallTop ? "chiseled_stone_bricks" : "stone_bricks",
    );
  }

  const it = ctx.interior;
  const lamp = lanternColumn(it);
  const end = farEnd(ctx);
  const px = lamp.x - 1 >= it.x0 ? lamp.x - 1 : lamp.x + 1;
  const pz = end.z === it.z0 ? it.z0 + 1 : it.z1 - 1;
  const plinthZ = pz >= it.z0 && pz <= it.z1 ? pz : lamp.z;
  if (c.put1(px, plinthZ, "chiseled_stone_bricks")) {
    // The figure, one course at a time: each is refused rather than forced
    // when the storey has no room, which is what keeps the cell walkable-round
    // instead of turning it into a pillar the lint calls a blocked column.
    if (c.stack(px, plinthZ, 2, "polished_andesite")) {
      c.stack(px, plinthZ, 3, "stone_brick_wall", {
        up: "true",
        north: "none",
        south: "none",
        east: "none",
        west: "none",
        waterlogged: "false",
      });
    }
  }
  // The flanking benches: backrest to the wall, so the sitter looks in.
  const stair = ctx.style["stair.interior"] as string;
  c.put1(it.x0, plinthZ, stair, { facing: "west", half: "bottom", shape: "straight" });
  c.put1(it.x1, plinthZ, stair, { facing: "east", half: "bottom", shape: "straight" });
  // The flags, on the far wall, and the wreath candles under them.
  wallBanner(ctx, c, it.x0, end.z, "red_wall_banner", "east");
  wallBanner(ctx, c, it.x1, end.z, "red_wall_banner", "west");
  c.put1(it.x0, end.z, "white_candle", candles(2));
  c.put1(it.x1, end.z, "white_candle", candles(2));
  c.put1(it.x0, end.z === it.z0 ? it.z1 : it.z0, pottedAt(it.x0, it.z1));
}

/**
 * `urn_wall` — niches, an aisle, and nothing else.
 *
 * The whole building is its two side walls: **trapdoor-fronted cubbies** from
 * the second course to the plate, up both interior wall rows, each hung flat
 * against the wall it belongs to and taking its support from it. They start at
 * `y = 2` rather than at the floor deliberately — a trapdoor is passable, so
 * one at `y = 1` would be harmless, but starting above the standing plane
 * leaves the aisle unambiguously clear at every envelope, and clear is the
 * point of an aisle.
 *
 * The candles are **unlit**. A columbarium lit like a furnace is not a quiet
 * building, and every candle in this file is lit by the visitor.
 */
function fitUrnWall(ctx: FitOutContext, c: PropCounter): void {
  const plan = wallPlan(ctx);
  if (plan !== null) {
    c.n += reclad(ctx, plan, 2, ctx.wallTop, (x, y, z) => {
      const along = x === 0 || x === plan.sx - 1 ? z : x;
      return (along + y) % 3 === 0 ? "polished_deepslate" : "deepslate_bricks";
    });
  }

  const it = ctx.interior;
  const end = farEnd(ctx);
  const near = end.z === it.z0 ? it.z1 : it.z0;

  // **The aisle ends go in first, and that ordering is load-bearing.** A niche
  // column filled from the second course to the plate has no air left in it
  // above the floor, and `PropCounter`'s headroom guard — the rule the lint
  // calls `interior.blocked_column` — then refuses *anything* at `y = 1` in
  // that column. Written the other way round, this building came out with
  // nothing in it but trapdoors.
  if (!c.put1(it.x0, end.z, "white_candle", candles(3))) {
    offerOnWalls(ctx, c, "white_candle", candles(3));
  }
  if (!c.put1(it.x1, end.z, "gray_candle", candles(3))) {
    offerOnWalls(ctx, c, "gray_candle", candles(3));
  }
  if (
    !c.put1(it.x1, near, "lectern", {
      facing: end.look,
      has_book: "false",
      powered: "false",
    })
  ) {
    offerOnWalls(ctx, c, "lectern", {
      facing: end.look,
      has_book: "false",
      powered: "false",
    });
  }
  wallBanner(ctx, c, it.x0, near, "gray_wall_banner", "east");

  // The niches: both interior wall rows, every course from the second to one
  // under the plate. Passable, so the aisle between them is untouched — and
  // the top course of a column that already carries something at `y = 1` is
  // left open, so the column keeps the air the blocked-column rule wants.
  const trapdoor = ctx.style["wall.trapdoor"] as string;
  const topY = Math.min(ctx.storyHeight - 1, ctx.wallTop - 1);
  for (let z = it.z0; z <= it.z1; z++) {
    for (const [x, facing] of [
      [it.x0, "west"],
      [it.x1, "east"],
    ] as const) {
      if (onWayIn(ctx, x, z)) continue;
      const occupied = ctx.blockAt(x, 1, z) !== undefined;
      for (let y = 2; y <= (occupied ? topY - 1 : topY); y++) {
        if (ctx.blockAt(x, y, z) !== undefined) continue;
        ctx.put(x, y, z, trapdoor, shutter(facing));
        c.n++;
      }
    }
  }
}

/**
 * `remembrance_arch` — the arch is the building.
 *
 * **The arch rule**, which is why this archetype exists at all. A monumental
 * arch must be built of **full blocks**, every course either continuous or
 * standing on something: the physics lint's `floating.*` rules police a full
 * cube with six air faces, and a crown of slabs hung across a room is exactly
 * that. So the crown here is an unbroken course of full blocks running
 * **wall to wall** at one Y, with the shell's own walls carrying both ends,
 * and the piers under it stand on the wall rows where each already has a solid
 * face beside it.
 *
 * It is refused outright on a storey with no room for it — under four courses
 * there is no Y between a stander's head and the ceiling, and an arch you
 * cannot walk under is a wall. That refusal is the same instinct as the clock
 * gable's: a flourish that has to overshoot is a building that lied about its
 * size.
 *
 * The **names band** alternates chiseled blocks along the crown; the
 * **processional runner** is a carpet recolour of the floor from the door to
 * the far wall, which is passable and so takes nothing from the route.
 */
function fitRemembranceArch(ctx: FitOutContext, c: PropCounter): void {
  const plan = wallPlan(ctx);
  if (plan !== null) {
    c.n += reclad(ctx, plan, 2, ctx.wallTop, (_x, y) =>
      y === ctx.wallTop ? "chiseled_sandstone" : "smooth_sandstone",
    );
  }

  const it = ctx.interior;
  const lamp = lanternColumn(it);
  const end = farEnd(ctx);
  // The crown Y: the highest interior course, which on a four-course storey is
  // one clear of a stander's head. Under four courses there is no such Y.
  const crownY = ctx.storyHeight - 1;
  if (crownY >= 3) {
    // The row: off the lantern's own, so the light hangs in front of the arch
    // rather than inside it.
    const rowZ = lamp.z + 1 <= it.z1 ? lamp.z + 1 : lamp.z - 1;
    if (rowZ >= it.z0 && rowZ <= it.z1) {
      // The crown: one continuous course of full blocks, wall to wall. Both
      // ends land on the interior wall rows, and the shell's wall stands
      // immediately beyond each, so no cube in the course has six air faces.
      for (let x = it.x0; x <= it.x1; x++) {
        ctx.put(x, crownY, rowZ, (x + rowZ) % 3 === 0 ? "chiseled_sandstone" : "sandstone");
        c.n++;
      }
      // The piers: the two wall-row columns under the crown, from head height
      // up. `y = 1` stays clear so no floor cell is ever taken by the arch,
      // and every pier block has the shell's wall solid beside it.
      for (const px of [it.x0, it.x1]) {
        for (let y = 2; y < crownY; y++) {
          if (onWayIn(ctx, px, rowZ)) continue;
          if (ctx.blockAt(px, y, rowZ) !== undefined) continue;
          ctx.put(px, y, rowZ, "smooth_sandstone");
          c.n++;
        }
      }
    }
  }

  // The runner: floor carpet up the middle, door end to far end. Passable.
  for (let z = it.z0; z <= it.z1; z++) {
    if (!ctx.free(lamp.x, z) || ctx.blockAt(lamp.x, 1, z) !== undefined) continue;
    ctx.put(lamp.x, 1, z, "red_carpet");
    c.n++;
  }
  // The names, on the far wall, and the wreath under them.
  wallBanner(ctx, c, it.x0, end.z, "white_wall_banner", "east");
  wallBanner(ctx, c, it.x1, end.z, "white_wall_banner", "west");
  c.put1(it.x0, end.z, "white_candle", candles(2));
  c.put1(it.x1, end.z, "chiseled_sandstone");
  c.put1(it.x0, end.z === it.z0 ? it.z1 : it.z0, pottedAt(it.x0, it.z1));
}

/**
 * `pyre_platform` — a solemn platform, and room to stand back from it.
 *
 * The **dais** is a low solid plinth with slab tops, laid off the lantern
 * column, and every cell of it goes through `put1` — so the ground floor's own
 * connectivity guard refuses any cell whose loss would strand part of the
 * room, and a dais on a small plan simply comes out smaller.
 *
 * On its centre stands an **unlit** campfire. Unlit is the archetype: a pyre
 * that is already burning is a bonfire, and the building is the *waiting*. The
 * log cribbing is read from the dais itself — stripped logs on the rim, dressed
 * stone in the middle — and the mourners' benches stand at a respectful
 * distance on the wall rows, which leaves a walkable ring all the way round.
 */
function fitPyrePlatform(ctx: FitOutContext, c: PropCounter): void {
  const plan = wallPlan(ctx);
  if (plan !== null) {
    c.n += reclad(ctx, plan, 2, ctx.wallTop, (x, y, z) => {
      if (y === 2 || y === ctx.wallTop) return "polished_andesite";
      const along = x === 0 || x === plan.sx - 1 ? z : x;
      return along % 4 === 0 ? "stripped_spruce_log" : "stone_bricks";
    });
  }

  const it = ctx.interior;
  const lamp = lanternColumn(it);
  const end = farEnd(ctx);
  // The dais, one column off the lantern.
  const dx = lamp.x - 1 >= it.x0 + 1 ? lamp.x - 1 : lamp.x + 1;
  const dz = lamp.z;
  const slabBlock = ctx.style["stone.slab"] as string;
  let centred = false;
  for (let z = dz - 1; z <= dz + 1; z++) {
    for (let x = dx - 1; x <= dx + 1; x++) {
      if (x < it.x0 || x > it.x1 || z < it.z0 || z > it.z1) continue;
      const rim = x !== dx || z !== dz;
      if (rim) {
        if (!c.put1(x, z, "stripped_spruce_log", { axis: "y" })) continue;
        c.stack(x, z, 2, slabBlock, { type: "bottom", waterlogged: "false" });
        continue;
      }
      // The centre. Where the storey has the headroom, the fire stands on a
      // dressed plinth; under a three-course storey a plinth with a fire on it
      // is a pillar and the stack guard rightly refuses it, so the fire stands
      // on the floor inside its own cribbing instead — the same read, one
      // course lower, and never a blocked column.
      const fire = {
        lit: "false",
        signal_fire: "false",
        facing: "north",
        waterlogged: "false",
      };
      if (ctx.storyHeight >= 4) {
        if (!c.put1(x, z, "smooth_stone")) continue;
        centred = c.stack(x, z, 2, "campfire", fire);
      } else {
        centred = c.put1(x, z, "campfire", fire);
      }
    }
  }
  // A pyre with no fire on it is not one. When the dais centre was refused —
  // the door approach, the stair reserve, a short storey — the campfire is
  // offered the far wall row instead, where it is a brazier rather than a pyre
  // but is at least there.
  if (!centred) {
    offerOnWalls(ctx, c, "campfire", {
      lit: "false",
      signal_fire: "false",
      facing: "north",
      waterlogged: "false",
    });
  }
  // The mourners' benches, at a distance: on the wall rows, backrests to the
  // wall so a sitter looks in at the dais.
  const stair = ctx.style["stair.interior"] as string;
  for (let z = it.z0 + 1; z <= it.z1 - 1; z += 2) {
    c.put1(it.x0, z, stair, { facing: "west", half: "bottom", shape: "straight" });
    c.put1(it.x1, z, stair, { facing: "east", half: "bottom", shape: "straight" });
  }
  c.put1(it.x1, end.z, "white_candle", candles(3));
  c.put1(it.x0, end.z === it.z0 ? it.z1 : it.z0, "barrel", { facing: "up", open: "false" });
}

/* -------------------------------------------------------------------------- */
/* the pavilion and the quarters                                               */
/* -------------------------------------------------------------------------- */

/**
 * The pool rect: the interior, inset one cell on every side.
 *
 * `poolRect` from `archetypes-town.ts`, restated for the seam. `null` when the
 * room is too small to hold a pool and still have a walkway round it. A bath
 * you have to stand in to walk past is not a bath.
 */
function poolRect(it: LocalRect): LocalRect | null {
  const rect = { x0: it.x0 + 1, z0: it.z0 + 1, x1: it.x1 - 1, z1: it.z1 - 1 };
  if (rect.x1 - rect.x0 < 1 || rect.z1 - rect.z0 < 1) return null;
  return rect;
}

/**
 * `bathing_pavilion` — the bathhouse's garden cousin.
 *
 * **The fluid argument is the bathhouse's, unchanged, and it is unchanged on
 * purpose.** The water goes *into the floor plane* at `y = 0`, in a rect inset
 * one cell from the interior, so
 *
 * - under every water cell is the foundation skirt the shell laid under the
 *   whole footprint;
 * - beside every water cell, on all four sides, is either more pool or a floor
 *   cell the shell has already written solid;
 * - no prop ever stands on a pool cell, so the cells above the water are clear
 *   and the room is walkable in the only sense that matters — you can get
 *   everywhere, and where the floor is water you get wet.
 *
 * Nothing about that depends on the terrain, the theme or the seed, so it is
 * true for every pavilion this grammar will build. The three moves that make
 * it a *pavilion* rather than a bathhouse are all above the water line: an
 * airier trim (quartz with a trellis band of chiseled quartz at the plate),
 * tall regular lights from the facade defaults, and no clutter on the walkway.
 *
 * The three refusals are the bathhouse's, verbatim, because each one was paid
 * for in a walkthrough:
 *
 * - **the pedestals are carved out of the pool's own corners**, never stood on
 *   the walkway. The walkway round an inset pool is one cell wide, and a
 *   body-blocking prop on a one-wide ring cuts it;
 * - **the divider is nudged off the lantern row.** The shell hangs its ceiling
 *   light over the room's centre row at head height; a divider walkway under
 *   it had its whole west half sealed;
 * - **benches only where a stander on one fits.** A bench is a mountable half
 *   step *provided* there is headroom above it; under a three-course storey
 *   with a floor plane overhead the mounted head lands in the storey above and
 *   the bench turns back into a wall.
 */
function fitBathingPavilion(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const plan = wallPlan(ctx);
  if (plan !== null) {
    c.n += reclad(ctx, plan, 2, ctx.wallTop, (x, y, z) => {
      // The trellis band at the plate: chiseled quartz, not a fence. A fence
      // in a wall field is a hole with a shelf in it.
      if (y === ctx.wallTop) return "chiseled_quartz_block";
      return (x * 3 + y * 5 + z * 7) % 4 === 0 ? "quartz_bricks" : "quartz_block";
    });
  }

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

  // The coping: dressed stone written into the floor plane all the way round
  // the water, which is what turns a hole full of water into a bath.
  for (let z = it.z0; z <= it.z1; z++) {
    for (let x = it.x0; x <= it.x1; x++) {
      if (inPool(x, z)) continue;
      const beside = inPool(x + 1, z) || inPool(x - 1, z) || inPool(x, z + 1) || inPool(x, z - 1);
      if (!beside) continue;
      ctx.put(x, 0, z, "smooth_quartz");
      c.n++;
    }
  }

  // The pedestals, in the pool's own corners. A pool cell is never walkable
  // anyway, so a pedestal there costs nothing, and replacing a water corner
  // with solid stone keeps every remaining water cell bounded by solid or
  // water — the fluid argument is unchanged.
  if (pool !== null) {
    const pedestal = (px: number, pz: number, top: string, props?: Record<string, string>): void => {
      ctx.put(px, 0, pz, "smooth_quartz");
      ctx.put(px, 1, pz, top, props);
      c.n += 2;
    };
    pedestal(pool.x0, pool.z0, "campfire", {
      lit: "true",
      signal_fire: "false",
      facing: "north",
      waterlogged: "false",
    });
    pedestal(pool.x1, pool.z1, "cauldron", { level: "3" });
    pedestal(pool.x1, pool.z0, pottedAt(pool.x1, pool.z0));
  } else {
    // No pool, no pedestals: an open changing room, where the guard's own
    // connectivity check is enough to keep corner props from sealing anything.
    c.put1(it.x0, it.z0, "cauldron", { level: "3" });
    c.put1(it.x1, it.z1 - 1 >= it.z0 ? it.z1 - 1 : it.z1, pottedAt(it.x1, it.z1));
  }

  // The benches, on the walkway, and only where a stander on one fits.
  const benchHeadroom = ctx.floors < 2 || ctx.storyHeight >= 4;
  const stair = ctx.style["stair.interior"] as string;
  if (benchHeadroom) {
    if (!inPool(it.x1, it.z0)) {
      c.put1(it.x1, it.z0, stair, { facing: "east", half: "bottom", shape: "straight" });
    }
    if (!inPool(it.x0, it.z1)) {
      c.put1(it.x0, it.z1, stair, { facing: "west", half: "bottom", shape: "straight" });
    }
    for (let z = it.z0 + 1; z <= it.z1 - 1; z += 2) {
      if (inPool(it.x0, z)) continue;
      c.put1(it.x0, z, stair, { facing: "west", half: "bottom", shape: "straight" });
    }
  }
}

/**
 * `servants_quarters` — honest and spare, and that is the whole brief.
 *
 * Plain bunks up one wall row, laid by `placeBed` so a bed is a whole pair or
 * nothing; a shared table down the middle of the far end in whichever idiom
 * the storey's headroom allows — the trestle where there is room over the
 * post, an upturned slab where there is not; utility racks (barrels and a
 * chest) in the gaps between the cot heads; and a wash cauldron at the end.
 *
 * There is nothing else, deliberately. A servants' hall that reads as a
 * cottage with fewer flowers has not been designed, it has been diluted.
 */
function fitServantsQuarters(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const end = farEnd(ctx);
  const near = end.z === it.z0 ? it.z1 : it.z0;
  const bunkX = it.x0 + 1 <= it.x1 ? it.x0 + 1 : it.x0;

  // The bunks: heads to the west wall, feet into the room, every other bay.
  for (let z = it.z0; z <= it.z1; z += 2) {
    ctx.placeBed(bunkX, z, "west", "white_bed");
  }
  // The racks, on the wall row in the gaps between cot heads.
  for (let z = it.z0 + 1; z <= it.z1 - 1; z += 2) {
    c.put1(it.x0, z, "barrel", { facing: "up", open: "false" });
  }
  // The shared table, on the east row so it never crosses the corridor.
  for (let z = it.z0 + 1; z <= it.z1 - 1; z += 2) {
    table(ctx, c, it.x1, z);
  }
  c.put1(it.x1, end.z, "cauldron", { level: "3" });
  c.put1(it.x1, near, "chest", { facing: "west", type: "single" });
  c.put1(it.x0, end.z, "crafting_table");
}
