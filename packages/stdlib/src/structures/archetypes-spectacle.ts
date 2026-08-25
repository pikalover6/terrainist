/**
 * Archetype breadth, **wave six D** — spectacle: the buildings you go *into*
 * to be amazed.
 *
 * Six buildings. Four amusement: a **big top**, a **hall of mirrors**, a
 * **funhouse** and a **dodgems pavilion**. One science: an **aquarium**. One
 * fantasy: a **hedge maze**.
 *
 * ## Why these six are buildings and the rest of the wave is not
 *
 * Wave 6D is a mixed track, and the split is decided by one question: *does a
 * body walk around inside it?* A ferris wheel, a bandstand, a memorial garden,
 * a portal frame and a floating platform are all things you look at and walk
 * *past*, so they are props (`props-spectacle.ts`); a houseboat is a dwelling
 * on open water, which is the watercraft template's question rather than the
 * building grammar's, so it is a hull (`ships.ts`). Everything here has an
 * interior, a door and a route through it — which is exactly what the building
 * grammar already owns and what the shared pocket detector already polices.
 *
 * The **hedge maze** is the interesting call. A maze read as a compound of
 * hedge props is a maze nothing can prove walkable: a prop has no interior, no
 * door and no reachability guard, so the whole point of a maze — that it is a
 * puzzle rather than a trap — would rest on a comment. Built as a *building*
 * with a leaf-wall interior, every hedge cell goes through the ground floor's
 * own `take`, and `assertNoPockets` walks the result from the door. So it is a
 * building, and it is one for the reason that matters.
 *
 * ## An archetype is a fit-out, not a second grammar
 *
 * `archetypes-blitz.ts`'s header is normative and `archetypes-arcana.ts`'s is
 * the short form. A fit-out runs **after** every shape stage and writes into
 * the same cell map, so it may re-clad a wall field and rebuild a roof without
 * a line of `core.ts` changing. A big top is the house shell re-roofed as a
 * striped cone; a hall of mirrors is the same shell gone reflective. Neither is
 * a new grammar and neither may grow one.
 *
 * ## The lesson block, all of it, and where each is paid
 *
 * - a **stair's `facing` is its backrest** — the big top's tiered benches and
 *   the funhouse's seats face *away* from what the sitter looks at;
 * - a bare `flower_pot` renders **empty**; every pot goes through
 *   {@link pottedAt};
 * - the shell hangs a lantern over the **middle column** at head height in a
 *   three-course storey, so nothing here routes one cell wide through that
 *   column: every maze in this file — the hedge, the mirrors — is a **comb**
 *   with an open corridor at each end, so no single blocked cell can strand a
 *   thing (see {@link comb});
 * - the trestle table is refused by the stack guard under a three-course
 *   storey, so anything table-shaped is a top slab there;
 * - **width-1 circulation stays clear**, and a stander needs headroom: every
 *   bench in this file is behind the `benchHeadroom` gate the bathhouse grew;
 * - **no sign blocks.** Signage is a **wall** banner, and a wall banner rather
 *   than a standing one for the opera-house reason: a standing banner beside
 *   an unmountable platform is a sealed pocket. The aquarium's specimen labels
 *   are all wall banners;
 * - **fluids are the boxed pool, verbatim.** See {@link fitAquarium} for the
 *   whole argument, including the decision about the wall tanks;
 * - **an apron prop stands on the actual ground** — {@link groundAt};
 * - **a cone closes on a solid cap**, and the one thing a cap may carry is a
 *   single-block finial standing on it. The big top's king poles are inside
 *   the crown for exactly this reason, and not floor-to-cap: a column from the
 *   floor to the roof is the `interior.blocked_column` defect however tent-like
 *   it looks;
 * - **no `chain` blocks** (`iron_bars` instead), **no plain `mud`**, and no
 *   torch on anything but a full block. This file places no torches at all.
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
 * The six archetypes this file fits out, in catalog order.
 *
 * Spread into `BUILDING_ARCHETYPES` by `archetypes.ts`.
 */
export const SPECTACLE_BUILDING_ARCHETYPES = [
  "big_top",
  "hall_of_mirrors",
  "funhouse",
  "dodgems_pavilion",
  "aquarium",
  "hedge_maze",
] as const;

/** One of the archetypes this file fits out. */
export type SpectacleBuildingArchetype = (typeof SPECTACLE_BUILDING_ARCHETYPES)[number];

/** True for an archetype this file answers to. */
export function isSpectacleArchetype(value: string): value is SpectacleBuildingArchetype {
  return (SPECTACLE_BUILDING_ARCHETYPES as readonly string[]).includes(value);
}

/**
 * Tag → archetype, or `null` when nothing matches.
 *
 * Consulted straight after the dwellings and well before the extended table,
 * for the reason every later wave sits high: the tables below are greedy. Every
 * tag below is one no earlier table claims, and the near misses are the review:
 *
 * - **bare `circus` and `tent` are not ours.** The big top answers to
 *   `big_top`, `circus_tent` and `marquee` — bare `tent` is the nomadic
 *   vocabulary's and would retheme every camp in a document;
 * - **bare `mirror`, `glass` and `hall` are not ours.** `hall` means the great
 *   hall in the original table and always will; the mirrors answer to
 *   `hall_of_mirrors`, `mirror_maze` and `mirror_hall`;
 * - **bare `fun`, `arcade` and `amusement` are not ours** — `arcade` is the
 *   leisure wave's. The funhouse answers to `funhouse` and `fun_house`;
 * - **bare `pavilion` is not ours.** That is the arcana bathing pavilion's
 *   near neighbour and the leisure track's word; the dodgems answer to
 *   `dodgems`, `dodgems_pavilion` and `bumper_cars`;
 * - **bare `museum` and `zoo` are not ours** — both are the institution
 *   wave's. The aquarium answers to `aquarium`, `oceanarium` and `fish_house`;
 * - **bare `maze` is ours, `labyrinth` is not.** A labyrinth is an underground
 *   catalog entry and claiming the word would steal it; the hedge maze answers
 *   to `hedge_maze`, `maze` and `hedges`.
 */
export function spectacleArchetypeOfTags(
  tags: readonly string[],
): SpectacleBuildingArchetype | null {
  const has = (t: string): boolean => tags.includes(t);
  if (has("big_top") || has("circus_tent") || has("marquee")) return "big_top";
  if (has("hall_of_mirrors") || has("mirror_maze") || has("mirror_hall")) return "hall_of_mirrors";
  if (has("funhouse") || has("fun_house")) return "funhouse";
  if (has("dodgems") || has("dodgems_pavilion") || has("bumper_cars")) return "dodgems_pavilion";
  if (has("aquarium") || has("oceanarium") || has("fish_house")) return "aquarium";
  if (has("hedge_maze") || has("maze") || has("hedges")) return "hedge_maze";
  return null;
}

/**
 * Facade tendencies for this file's archetypes.
 *
 * Same contract as `archetypeFacadeDefaults`: defaults a caller merges into its
 * params, never something applied over an explicit one. Everything that
 * rebuilds its roof as a cone asks for the shape with the most vertical room,
 * because the replacement is bounded by where the shell's own roof finished.
 */
export function spectacleFacadeDefaults(
  archetype: string,
): { readonly windowShape?: string; readonly windowRhythm?: string; readonly roof?: string } {
  switch (archetype) {
    // The tent *is* the building; it wants every course it can get.
    case "big_top":
      return { windowShape: "single", windowRhythm: "sparse", roof: "hip" };
    // A mirror maze is dark and disorienting on purpose.
    case "hall_of_mirrors":
      return { windowShape: "single", windowRhythm: "sparse", roof: "hip" };
    case "funhouse":
      return { windowShape: "tall", windowRhythm: "regular", roof: "gable" };
    // An open hall: the arena wants light and the roof wants to be out of the
    // way, which is a flat one.
    case "dodgems_pavilion":
      return { windowShape: "tall", windowRhythm: "regular", roof: "flat" };
    case "aquarium":
      return { windowShape: "single", windowRhythm: "sparse", roof: "flat" };
    // Open to the sky is the whole read of a hedge maze.
    case "hedge_maze":
      return { windowShape: "tall", windowRhythm: "regular", roof: "flat" };
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
 * **The apron-post ground rule**, wave 4D's helper unchanged. On conformed
 * terrain the apron ground fills local `y = 0`; on a platform it sits one
 * lower, so a prop written at `y = 1` would float and the support-chain rule
 * would rightly refuse it.
 */
function groundAt(ctx: FitOutContext, c: PropCounter, x: number, z: number, fill?: string): number {
  if (ctx.blockAt(x, 0, z) !== undefined) return 1;
  if (fill === undefined) return 0;
  ctx.put(x, 0, z, fill);
  c.n++;
  return 1;
}

/** Blocks a re-clad may never overwrite. Wave 4D's list unchanged. */
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
function slabFill(
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
 * Corbel a cone over the envelope, closing on a **solid** cap.
 *
 * Wave 4D's machinery, restated for the seam. `courses` is how many courses are
 * laid before the ring steps in, so 1 gives a steep cone and 2 a shallower one.
 * The first course is solid — it is the lid of the room below — and the last is
 * a solid cap slab, because a partial block in the middle of the cap rect has
 * nothing under it but the cone's hollow. Returns the cap's own Y and rect so a
 * caller can hang a king pole under it or stand a flag on it.
 */
function corbel(
  ctx: FitOutContext,
  plan: RebuildPlan,
  block: (x: number, y: number, z: number) => string,
  cap: string,
  courses = 1,
  finial?: string,
  finialProps?: Record<string, string>,
): { readonly n: number; readonly capY: number; readonly rect: LocalRect } {
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
      slabFill(ctx, y, x0, x1, z0, z1, block(x0, y, z0));
      continue;
    }
    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) {
        if (x !== x0 && x !== x1 && z !== z0 && z !== z1) continue;
        ctx.put(x, y, z, block(x, y, z));
      }
    }
  }
  slabFill(ctx, capY, rect.x0, rect.x1, rect.z0, rect.z1, cap);
  if (capY + 1 <= plan.top) {
    ctx.put((rect.x0 + rect.x1) >> 1, capY + 1, (rect.z0 + rect.z1) >> 1, finial ?? cap, finialProps);
    n++;
  }
  return { n, capY, rect };
}

/* -------------------------------------------------------------------------- */
/* interior primitives                                                         */
/* -------------------------------------------------------------------------- */

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

/** Trapdoor props for a screen, shutter or tank front hung flat on a wall. */
function shutter(facing: Cardinal): Record<string, string> {
  return { facing, half: "top", open: "false", powered: "false", waterlogged: "false" };
}

/**
 * Hang a wall banner on an interior wall row, at head height.
 *
 * **The opera lesson**, applied. A standing banner is a body-blocking block
 * that can seal a cell; a wall banner is passable and takes its support from the
 * wall behind it, which every re-clad in this file has already written solid.
 * `facing` is the direction the banner's face points — *away* from its wall.
 */
function wallBanner(
  ctx: FitOutContext,
  c: PropCounter,
  x: number,
  z: number,
  block: string,
  facing: Cardinal,
): void {
  if (ctx.blockAt(x, 2, z) !== undefined) return;
  ctx.put(x, 2, z, block, { facing });
  c.n++;
}

/**
 * Is a stander on a half step going to have room for their head?
 *
 * The bathhouse's gate, verbatim: under a three-course storey with a floor
 * plane overhead, the mounted head lands in the storey above and the bench
 * turns back into a wall.
 */
function benchHeadroom(ctx: FitOutContext): boolean {
  return ctx.floors < 2 || ctx.storyHeight >= 4;
}

/**
 * **The comb** — the only maze shape this file draws, and the reason why.
 *
 * A maze is a wall field inside a room, and a wall field is the easiest way in
 * this whole vocabulary to strand a cell. Three things can block a floor cell
 * that the fit-out never touched: the shell's hanging lantern over the middle
 * column at head height, the stair reserve, and the door approach. A serpentine
 * maze — the pretty one, with a single path through it — is cut in half by any
 * one of them.
 *
 * A **comb** cannot be. Its fingers run along z between `z0 + 1` and `z1 − 1`,
 * so the whole of the `z0` row and the whole of the `z1` row stay open as
 * corridors, and every free column touches *both*. Losing any single cell
 * therefore strands nothing, and the maze is still a maze to walk: you pick a
 * gap, you go down it, you come out the other end and you pick another.
 *
 * Each finger carries one **gap**, at a position derived from its own x, which
 * turns a comb into something that branches without ever disconnecting — a gap
 * only ever *adds* a route.
 *
 * Every cell goes through `put1`, so the ground floor's own connectivity guard
 * has the final say regardless, and `stack` adds the second course only where
 * the column would still have air in it.
 */
function comb(
  ctx: FitOutContext,
  c: PropCounter,
  block: string,
  props?: Record<string, string>,
  courses = 2,
): number {
  const it = ctx.interior;
  let placed = 0;
  for (let x = it.x0 + 1; x <= it.x1 - 1; x += 2) {
    // The gap in this finger, derived from x so it is deterministic and so no
    // two neighbouring fingers open at the same z.
    const span = it.z1 - 1 - (it.z0 + 1);
    if (span < 1) continue;
    const gap = it.z0 + 1 + (((x * 3) % (span + 1)) + (span + 1)) % (span + 1);
    for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
      if (z === gap) continue;
      if (onWayIn(ctx, x, z)) continue;
      if (!c.put1(x, z, block, props)) continue;
      placed++;
      for (let y = 2; y < courses + 1; y++) c.stack(x, z, y, block, props);
    }
  }
  return placed;
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
export function furnishSpectacle(ctx: FitOutContext): number {
  if (!isSpectacleArchetype(ctx.archetype)) return 0;
  const c = new PropCounter(ctx);
  switch (ctx.archetype) {
    case "big_top":
      fitBigTop(ctx, c);
      break;
    case "hall_of_mirrors":
      fitHallOfMirrors(ctx, c);
      break;
    case "funhouse":
      fitFunhouse(ctx, c);
      break;
    case "dodgems_pavilion":
      fitDodgemsPavilion(ctx, c);
      break;
    case "aquarium":
      fitAquarium(ctx, c);
      break;
    case "hedge_maze":
    default:
      fitHedgeMaze(ctx, c);
      break;
  }
  return c.n;
}

/* -------------------------------------------------------------------------- */
/* the fair, indoors                                                           */
/* -------------------------------------------------------------------------- */

/**
 * `big_top` — the shell re-roofed as a great striped cone tent.
 *
 * The roof is the building. Everything the shell put above the eave plate is
 * cleared and replaced with a one-course-per-inset corbel cone in **wool
 * stripes**, closing on a **solid** cap of white wool with a banner finial
 * standing on it. The walls below are re-clad in the same stripe, so the
 * canvas runs from the ground to the point.
 *
 * **The king poles.** A circus tent has masts from the ring to the crown, and
 * this one does not — deliberately. A column of logs from the floor to the cap
 * is a solid column through the room, which is the `interior.blocked_column`
 * defect whatever it is dressed as, and `PropCounter`'s headroom guard would
 * refuse it anyway. So the poles stand **inside the crown**, on the cone's own
 * solid base course, where they carry the read from every angle a viewer looks
 * at the tent from and take nothing from the ring below.
 *
 * The floor plane at `y = 0` is recoloured as a **ring**: sand inside a rim of
 * red concrete, which costs the room nothing because it takes no cell. The
 * benches are stairs on the wall rows, behind the headroom gate, backrests to
 * the wall so a spectator looks in at the ring.
 */
function fitBigTop(ctx: FitOutContext, c: PropCounter): void {
  const plan = wallPlan(ctx);
  if (plan !== null) {
    c.n += reclad(ctx, plan, 2, ctx.wallTop, (x, y, z) => {
      if (y === ctx.wallTop) return "yellow_concrete";
      const along = x === 0 || x === plan.sx - 1 ? z : x;
      return along % 2 === 0 ? "red_wool" : "white_wool";
    });
  }
  const roof = roofPlan(ctx);
  if (roof !== null) {
    clearRoof(ctx, roof);
    const cone = corbel(
      ctx,
      roof,
      (x, y, z) => {
        const along = x + z;
        return along % 2 === 0 ? "red_wool" : "white_wool";
      },
      "white_wool",
      1,
      "yellow_banner",
      { rotation: "0" },
    );
    c.n += cone.n;
    // The king poles: inside the crown, standing on the cone's solid base
    // course, never through the room below it.
    const cx = (cone.rect.x0 + cone.rect.x1) >> 1;
    const cz = (cone.rect.z0 + cone.rect.z1) >> 1;
    for (const [dx, dz] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ] as const) {
      for (let y = roof.base + 1; y < cone.capY; y++) {
        // `clearRoof` writes **`air` ops**, and an air op is a written cell as
        // far as `blockAt` is concerned — so "is this cell empty" has to ask
        // for the block name, not merely for a hit. Getting that wrong is how
        // this building came out with no king poles in it at all.
        const standing = ctx.blockAt(cx + dx, y, cz + dz);
        if (standing !== undefined && standing.block !== "air") continue;
        ctx.put(cx + dx, y, cz + dz, "stripped_dark_oak_log", { axis: "y" });
        c.n++;
      }
    }
  }

  // The ring: a floor-plane recolour, which takes no cell at all.
  const it = ctx.interior;
  const lamp = lanternColumn(it);
  for (let z = it.z0; z <= it.z1; z++) {
    for (let x = it.x0; x <= it.x1; x++) {
      if (ctx.blockAt(x, 0, z) === undefined) continue;
      const d = Math.abs(x - lamp.x) + Math.abs(z - lamp.z);
      if (d > 4) continue;
      ctx.put(x, 0, z, d === 4 ? "red_concrete" : "sand");
      c.n++;
    }
  }

  // The tiers: benches on both wall rows, backrests to the wall.
  const stair = ctx.style["stair.interior"] as string;
  if (benchHeadroom(ctx)) {
    for (let z = it.z0; z <= it.z1; z++) {
      c.put1(it.x0, z, stair, { facing: "west", half: "bottom", shape: "straight" });
      c.put1(it.x1, z, stair, { facing: "east", half: "bottom", shape: "straight" });
    }
  }
  const end = farEnd(ctx);
  wallBanner(ctx, c, it.x0, end.z, "red_wall_banner", "east");
  wallBanner(ctx, c, it.x1, end.z, "yellow_wall_banner", "west");
}

/**
 * `hall_of_mirrors` — glass on glass, and a maze you can prove.
 *
 * The **mirror wall** is a band of `glass_pane` up both interior wall rows at
 * head height, backed by the re-clad's own light-grey and white courses: a pane
 * with a pale solid block behind it is the closest this palette gets to a
 * mirror, and it is what every builder uses. The band starts at `y = 2` rather
 * than the floor for the urn wall's reason — a pane at the standing plane is a
 * body-blocking block on the route, and starting above it leaves the aisle
 * unambiguously clear at every envelope.
 *
 * The **partition maze** is the {@link comb}, in glass panes: fingers along z
 * with a gap in each, an open corridor at either end. Panes rather than solid
 * blocks because a mirror maze's walls are the mirrors.
 *
 * The **floor** is a checkerboard of black and white concrete written into the
 * floor plane, which costs the room nothing.
 */
function fitHallOfMirrors(ctx: FitOutContext, c: PropCounter): void {
  const plan = wallPlan(ctx);
  if (plan !== null) {
    c.n += reclad(ctx, plan, 2, ctx.wallTop, (x, y, z) => {
      if (y === ctx.wallTop) return "polished_diorite";
      return (x + y + z) % 2 === 0 ? "white_concrete" : "light_gray_concrete";
    });
  }

  const it = ctx.interior;

  // The floor: a checkerboard, in the floor plane.
  for (let z = it.z0; z <= it.z1; z++) {
    for (let x = it.x0; x <= it.x1; x++) {
      if (ctx.blockAt(x, 0, z) === undefined) continue;
      ctx.put(x, 0, z, (x + z) % 2 === 0 ? "black_concrete" : "white_concrete");
      c.n++;
    }
  }

  // The mirror band — **in the wall ring, not on the wall row.**
  //
  // This is the one place this archetype could have gone wrong and did not. A
  // pane hung in the interior wall *row* is a body-blocking block standing on a
  // floor cell, and a band of them up both rows is a band of blocked cells
  // straight through the middle of the route — including, at every envelope
  // where the door is on an x face, the very cell a walker arrives in. So the
  // mirrors go one column further out, into the wall itself, where a pane costs
  // the room nothing at all and still reads as a mirrored wall from inside.
  if (plan !== null) {
    const band = Math.max(2, Math.min(ctx.wallTop - 1, ctx.storyHeight - 1));
    for (const cell of ringOf(plan.sx, plan.sz)) {
      const standing = ctx.blockAt(cell.x, band, cell.z);
      if (standing !== undefined && PRESERVE.test(standing.block)) continue;
      ctx.put(cell.x, band, cell.z, "glass_pane", {
        north: "true",
        south: "true",
        east: "true",
        west: "true",
      });
      c.n++;
    }
  }

  // The maze itself.
  comb(ctx, c, "glass_pane", { north: "true", south: "true" });

  const end = farEnd(ctx);
  wallBanner(ctx, c, it.x0, end.z, "white_wall_banner", "east");
}

/**
 * `funhouse` — everything crooked, nothing broken.
 *
 * The three reads, and every one of them is written somewhere a body never
 * stands:
 *
 * - the **tilted floor** is a wave of colour and half steps in the **floor
 *   plane** at `y = 0`. Nothing about it is a prop and nothing about it takes a
 *   cell: the wave is drawn as bands of bright concrete with an occasional top
 *   slab set into the plane, so a walker crosses ridges without ever meeting a
 *   block that stands in the room;
 * - the **spinning tunnel** is concentric wool rings on the far *wall*, drawn
 *   by Chebyshev distance from the wall's own middle. A wall field is not a
 *   floor cell, so a ring the whole height of the room costs the route nothing;
 * - the **distorted door trim** is a band of mismatched blocks around the
 *   doorway — one course of purple, one of lime, deliberately not lining up —
 *   which is what makes a straight door look bent.
 *
 * The seats are the funhouse's one piece of furniture: two stairs on a wall
 * row, behind the headroom gate, backrests to the wall.
 */
function fitFunhouse(ctx: FitOutContext, c: PropCounter): void {
  const plan = wallPlan(ctx);
  const bright = (i: number): string => {
    const wools = ["magenta_concrete", "lime_concrete", "orange_concrete", "light_blue_concrete"];
    return wools[(((i % wools.length) + wools.length) % wools.length)] as string;
  };
  if (plan !== null) {
    c.n += reclad(ctx, plan, 2, ctx.wallTop, (x, y, z) => {
      const along = x === 0 || x === plan.sx - 1 ? z : x;
      return bright(along + y);
    });
    // The distorted trim: two bands round the doorway that refuse to line up.
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
          ctx.put(x, y, z, (y + Math.abs(d) * 3) % 2 === 0 ? "purple_concrete" : "lime_concrete");
          c.n++;
        }
      }
    }
  }

  const it = ctx.interior;
  const end = farEnd(ctx);

  // The wave, in the floor plane. Bands of colour with a ridge of top slabs
  // where the wave crests — set *into* the plane, so nothing stands in the room.
  const slab = ctx.style["stone.slab"] as string;
  for (let z = it.z0; z <= it.z1; z++) {
    for (let x = it.x0; x <= it.x1; x++) {
      if (ctx.blockAt(x, 0, z) === undefined) continue;
      const phase = (((x + z * 2) % 6) + 6) % 6;
      if (phase === 0) {
        ctx.put(x, 0, z, slab, { type: "top", waterlogged: "false" });
      } else {
        ctx.put(x, 0, z, bright(phase));
      }
      c.n++;
    }
  }

  // The spinning tunnel: concentric rings on the far wall, in wool.
  const wallZ = end.z === it.z0 ? 0 : ctx.size[2] - 1;
  const midX = Math.floor((it.x0 + it.x1) / 2);
  const midY = Math.max(2, Math.floor(ctx.wallTop / 2));
  const wools = ["red_wool", "white_wool", "blue_wool", "yellow_wool"];
  for (let x = it.x0; x <= it.x1; x++) {
    for (let y = 1; y <= ctx.wallTop; y++) {
      const standing = ctx.blockAt(x, y, wallZ);
      if (standing !== undefined && PRESERVE.test(standing.block)) continue;
      const ring = Math.max(Math.abs(x - midX), Math.abs(y - midY));
      ctx.put(x, y, wallZ, wools[ring % wools.length] as string);
      c.n++;
    }
  }

  // The seats.
  const stair = ctx.style["stair.interior"] as string;
  if (benchHeadroom(ctx)) {
    for (let z = it.z0 + 1; z <= it.z1 - 1; z += 3) {
      c.put1(it.x0, z, stair, { facing: "west", half: "bottom", shape: "straight" });
    }
  }
  c.put1(it.x1, end.z, pottedAt(it.x1, end.z));
  wallBanner(ctx, c, it.x1, end.z === it.z0 ? it.z1 : it.z0, "magenta_wall_banner", "west");
}

/**
 * `dodgems_pavilion` — an open hall with a painted floor.
 *
 * The arena is a **plane**, not a structure: a rectangle of polished blackstone
 * inset one cell from the interior, written into the floor at `y = 0`, with a
 * **kerb** of full blocks round it in the same plane. The kerb is a colour
 * change rather than a raised rail because a raised rail on a one-wide walkway
 * is a raised rail across the only route — the bathhouse's lesson, applied to
 * something that looks nothing like a bath.
 *
 * The **power grid** is the log-run idiom at the plate: a course of stripped
 * logs along the wall head, which is what the ceiling grid of a dodgems track
 * reads as from below.
 *
 * The **cars** are parked at the edge, on the wall rows: a stair for the seat
 * with a trapdoor bumper hung on the wall beside it. Every one goes through
 * `put1`, so a car that would strand a cell is simply not parked there.
 */
function fitDodgemsPavilion(ctx: FitOutContext, c: PropCounter): void {
  const plan = wallPlan(ctx);
  if (plan !== null) {
    c.n += reclad(ctx, plan, 2, ctx.wallTop, (x, y, z) => {
      if (y === ctx.wallTop) return "stripped_spruce_log";
      const along = x === 0 || x === plan.sx - 1 ? z : x;
      return along % 3 === 0 ? "yellow_concrete" : "polished_blackstone";
    });
  }

  const it = ctx.interior;
  const arena = { x0: it.x0 + 1, x1: it.x1 - 1, z0: it.z0 + 1, z1: it.z1 - 1 };
  const inArena = (x: number, z: number): boolean =>
    x >= arena.x0 && x <= arena.x1 && z >= arena.z0 && z <= arena.z1;

  for (let z = it.z0; z <= it.z1; z++) {
    for (let x = it.x0; x <= it.x1; x++) {
      if (ctx.blockAt(x, 0, z) === undefined) continue;
      if (inArena(x, z)) {
        ctx.put(x, 0, z, (x + z) % 4 === 0 ? "blue_concrete" : "polished_blackstone");
        c.n++;
        continue;
      }
      const beside =
        inArena(x + 1, z) || inArena(x - 1, z) || inArena(x, z + 1) || inArena(x, z - 1);
      if (!beside) continue;
      ctx.put(x, 0, z, "yellow_concrete");
      c.n++;
    }
  }

  // The cars, on the wall rows only.
  const stair = ctx.style["stair.interior"] as string;
  const trapdoor = ctx.style["wall.trapdoor"] as string;
  for (let z = it.z0 + 1; z <= it.z1 - 1; z += 3) {
    for (const [x, facing] of [
      [it.x0, "west"],
      [it.x1, "east"],
    ] as const) {
      if (!c.put1(x, z, stair, { facing, half: "bottom", shape: "straight" })) continue;
      c.stack(x, z, 2, trapdoor, shutter(opposite(facing)));
    }
  }
  const end = farEnd(ctx);
  wallBanner(ctx, c, it.x0, end.z, "blue_wall_banner", "east");
  wallBanner(ctx, c, it.x1, end.z, "yellow_wall_banner", "west");
}

/* -------------------------------------------------------------------------- */
/* the aquarium                                                                */
/* -------------------------------------------------------------------------- */

/**
 * The pool rect: the interior, inset one cell on every side.
 *
 * `poolRect` from `archetypes-town.ts` by way of `archetypes-arcana.ts`,
 * restated for the seam. `null` when the room is too small to hold a pool and
 * still have a walkway round it.
 */
function poolRect(it: LocalRect): LocalRect | null {
  const rect = { x0: it.x0 + 1, z0: it.z0 + 1, x1: it.x1 - 1, z1: it.z1 - 1 };
  if (rect.x1 - rect.x0 < 1 || rect.z1 - rect.z0 < 1) return null;
  return rect;
}

/**
 * `aquarium` — the hard fluid case in this wave, and the decision it forced.
 *
 * **The centre pool is real water, by the bathhouse predicate verbatim.** It
 * goes *into the floor plane* at `y = 0`, in a rect inset one cell from the
 * interior, so
 *
 * - under every water cell is the foundation skirt the shell laid under the
 *   whole footprint;
 * - beside every water cell, on all four sides, is either more pool or a floor
 *   cell the shell has already written solid;
 * - no prop ever stands on a pool cell, so the cells above the water are clear
 *   and the room stays walkable in the only sense that matters.
 *
 * Nothing about that depends on the terrain, the theme or the seed, so it is
 * true for every aquarium this grammar will build. A **rim** of prismarine is
 * written into the plane all the way round it, which is what turns a hole full
 * of water into a tank.
 *
 * **The wall tanks are glass with blue concrete, and are NOT water.** This is
 * the deliberate call this archetype exists to make. A wall tank is a column of
 * glass in the interior wall row with something behind it, and for the fluid
 * rule to be satisfied its water would have to be enclosed by glass or solid on
 * **every** face including the top and the bottom. The top face is the problem
 * and it is not a small one: the tank's top course is bounded above by the
 * storey's ceiling only when the storey is tall enough, and on a three-course
 * storey the top of the tank *is* the head-height course the shell hangs its
 * lantern in. A tank that is provably sealed on one envelope and open on the
 * next is not a provable tank at all. So the tanks are **glass fronted with
 * blue concrete behind**, which reads as water through glass at any distance
 * and is, block for block, not a fluid. The one real fluid in this building is
 * the pool, where the predicate is exact.
 *
 * The **specimen labels** are wall banners — never signs — beside each tank,
 * and the coral is dry coral *block* set inside the tank cells, which is
 * scenery rather than something that wants water to stay alive.
 */
function fitAquarium(ctx: FitOutContext, c: PropCounter): void {
  const plan = wallPlan(ctx);
  if (plan !== null) {
    c.n += reclad(ctx, plan, 2, ctx.wallTop, (x, y, z) => {
      if (y === ctx.wallTop) return "dark_prismarine";
      return (x * 3 + y * 5 + z * 7) % 5 === 0 ? "prismarine_bricks" : "prismarine";
    });
  }

  const it = ctx.interior;
  const pool = poolRect(it);
  const inPool = (x: number, z: number): boolean =>
    pool !== null && x >= pool.x0 && x <= pool.x1 && z >= pool.z0 && z <= pool.z1;

  if (pool !== null) {
    for (let z = pool.z0; z <= pool.z1; z++) {
      for (let x = pool.x0; x <= pool.x1; x++) {
        ctx.put(x, 0, z, "water", { level: "0" });
        c.n++;
      }
    }
  }
  // The rim: dressed stone in the floor plane all the way round the water.
  for (let z = it.z0; z <= it.z1; z++) {
    for (let x = it.x0; x <= it.x1; x++) {
      if (inPool(x, z)) continue;
      const beside = inPool(x + 1, z) || inPool(x - 1, z) || inPool(x, z + 1) || inPool(x, z - 1);
      if (!beside) continue;
      ctx.put(x, 0, z, "dark_prismarine");
      c.n++;
    }
  }

  // The wall tanks — **written into the wall ring, not onto the wall row.**
  //
  // The second half of the fluid decision, and the same argument the hall of
  // mirrors makes: a tank column standing in the interior wall row is a column
  // of body-blocking blocks on floor cells, and at every envelope where the
  // door is on an x face one of those cells is the one a walker arrives in. In
  // the wall itself an alcove costs the room nothing. Each alcove is a glass
  // front with blue concrete deeper in the same column — a course of glass, a
  // course of blue — and a block of dry coral set into it for the specimen.
  const topY = Math.max(2, Math.min(ctx.wallTop - 1, ctx.storyHeight - 1));
  const coral = ["tube_coral_block", "brain_coral_block", "horn_coral_block"];
  if (plan !== null) {
    for (const cell of ringOf(plan.sx, plan.sz)) {
      // Alcoves in runs of two with a pier of masonry between them.
      const along = cell.x === 0 || cell.x === plan.sx - 1 ? cell.z : cell.x;
      if (along % 3 === 2) continue;
      for (let y = 2; y <= topY; y++) {
        const standing = ctx.blockAt(cell.x, y, cell.z);
        if (standing !== undefined && PRESERVE.test(standing.block)) continue;
        const k = (cell.x * 3 + y * 5 + cell.z * 7) % 6;
        ctx.put(
          cell.x,
          y,
          cell.z,
          k === 0
            ? (coral[(cell.x + cell.z) % coral.length] as string)
            : k < 3
              ? "glass"
              : k === 3
                ? "light_blue_concrete"
                : "blue_concrete",
        );
        c.n++;
      }
    }
  }

  // The labels, on the wall rows: banners, never signs.
  const end = farEnd(ctx);
  wallBanner(ctx, c, it.x0, end.z, "light_blue_wall_banner", "east");
  wallBanner(ctx, c, it.x1, end.z, "blue_wall_banner", "west");
  // The keeper's corner, on the walkway and never on a pool cell.
  if (!inPool(it.x0, end.z)) {
    c.put1(it.x0, end.z, "barrel", { facing: "up", open: "false" });
  }
  if (!inPool(it.x1, end.z === it.z0 ? it.z1 : it.z0)) {
    c.put1(it.x1, end.z === it.z0 ? it.z1 : it.z0, "lectern", {
      facing: opposite(end.look),
      has_book: "false",
      powered: "false",
    });
  }
  // The lamps: sea lanterns set into the rim, which is a floor-plane cell.
  if (pool !== null) {
    for (const [px, pz] of [
      [pool.x0, pool.z0],
      [pool.x1, pool.z1],
    ] as const) {
      ctx.put(px, 0, pz, "sea_lantern");
      c.n++;
    }
  }
}

/* -------------------------------------------------------------------------- */
/* the hedge maze                                                              */
/* -------------------------------------------------------------------------- */

/**
 * `hedge_maze` — a leaf-wall maze in a walled garden.
 *
 * **The hedge material.** Leaves, and specifically `oak_leaves` with
 * `persistent = true`: `archetypes-science.ts` already writes `oak_leaves` for
 * its conservatory planting, so there is a precedent in this vocabulary and no
 * reason to invent a second one. The `persistent` flag is the part worth
 * naming — a leaf block placed without it decays, and a maze that dissolves
 * after a few ticks is not a maze. Every hedge cell stands on a course of
 * **coarse dirt** written into the floor plane, so it reads as planted rather
 * than as green blocks stuck to a floor.
 *
 * **The shape is the {@link comb}**, for the reason the comb exists: a
 * serpentine is prettier and any one blocked cell cuts it in half. Every hedge
 * cell goes through the ground floor's own `take`, so the connectivity guard
 * refuses anything that would strand a cell before the maze is even drawn, and
 * `assertNoPockets` then walks the whole storey from the door.
 *
 * The hedge is two courses where the storey has room for two and one where it
 * does not; either is a hedge, and neither is a blocked column.
 */
function fitHedgeMaze(ctx: FitOutContext, c: PropCounter): void {
  const plan = wallPlan(ctx);
  if (plan !== null) {
    c.n += reclad(ctx, plan, 2, ctx.wallTop, (x, y, z) => {
      if (y === ctx.wallTop) return "mossy_stone_bricks";
      const along = x === 0 || x === plan.sx - 1 ? z : x;
      return (along + y) % 4 === 0 ? "mossy_cobblestone" : "stone_bricks";
    });
    // The garden urns, in the apron either side of the doorstep, on real
    // ground: an apron prop that stands on air is the stilt-house lesson.
    const out = outsideDoor(ctx);
    if (out !== null) {
      for (const [ox, oz] of [
        [out.x + 1, out.z],
        [out.x - 1, out.z],
      ] as const) {
        const skirt = ox === -1 || ox === plan.sx || oz === -1 || oz === plan.sz ||
          ox === 0 || ox === plan.sx - 1 || oz === 0 || oz === plan.sz - 1;
        if (!skirt || onWayIn(ctx, ox, oz)) continue;
        const y = groundAt(ctx, c, ox, oz, "mossy_cobblestone");
        ctx.put(ox, y, oz, "mossy_stone_brick_wall", {
          up: "true",
          north: "none",
          south: "none",
          east: "none",
          west: "none",
          waterlogged: "false",
        });
        c.n++;
      }
    }
  }

  const it = ctx.interior;
  // The beds: coarse dirt in the floor plane under every hedge column, and
  // grass paths between them. Neither takes a cell.
  for (let z = it.z0; z <= it.z1; z++) {
    for (let x = it.x0; x <= it.x1; x++) {
      if (ctx.blockAt(x, 0, z) === undefined) continue;
      const bed = (x - it.x0) % 2 === 1 && z > it.z0 && z < it.z1;
      ctx.put(x, 0, z, bed ? "coarse_dirt" : "gravel");
      c.n++;
    }
  }

  const leaf = { persistent: "true", distance: "7", waterlogged: "false" };
  comb(ctx, c, "oak_leaves", leaf);

  // A bench at the far end, backrest to the wall so a sitter looks back down
  // the maze, and a planted pot beside it.
  const end = farEnd(ctx);
  const stair = ctx.style["stair.interior"] as string;
  if (benchHeadroom(ctx)) {
    c.put1(it.x0, end.z, stair, { facing: "west", half: "bottom", shape: "straight" });
  }
  c.put1(it.x1, end.z, pottedAt(it.x1, end.z));
  wallBanner(ctx, c, it.x0, end.z === it.z0 ? it.z1 : it.z0, "green_wall_banner", "east");
}
