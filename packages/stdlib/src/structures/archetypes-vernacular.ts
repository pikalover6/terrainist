/**
 * Archetype breadth, the **vernacular wave** — three regional houses.
 *
 * `archetypes.ts` owns the first six archetypes and the tag table;
 * `archetypes-civic.ts` owns the seven civic/rural ones, the walkability guard
 * and the two exterior flourishes; `archetypes-blitz.ts` owns the ten-building
 * breadth wave. This file owns three houses that are not new *buildings* at
 * all: they are the house the grammar already builds, re-clad and re-roofed
 * the way a region builds it — an alpine chalet, a New England saltbox and a
 * Dutch canal house.
 *
 * ## Why these are fit-outs and not a second grammar
 *
 * The design law is `archetypes-blitz.ts`'s and it is restated here because
 * this wave is the purest case of it: **an archetype is a fit-out, not a
 * second grammar.** A fit-out runs *after* every shape stage — foundation,
 * walls, windows, floors, roof, chimney — and writes into the same cell map
 * they did, where a later write to a cell replaces an earlier one.
 *
 * A chalet is therefore the cottage shell with its corners boxed in spruce
 * log, a heavy eave hung in the apron and a fire on the floor. A saltbox is
 * the same shell with its gable thrown away and rebuilt off-centre, so one
 * slope runs long down the back — the whole of what makes a saltbox a saltbox
 * is that one asymmetry, and it costs a roof rebuild, not a grammar. A Dutch
 * gable house is the same shell in brick with a stepped parapet standing
 * proud of the facade. None of the three needs a line of `core.ts`.
 *
 * ## The two rules everything here obeys
 *
 * 1. **Nothing leaves the envelope.** Exterior work is bounded above by
 *    `roofTop + `{@link ROOF_FLOURISH_RISE} and in plan by the footprint plus
 *    the one-block apron ring the eave already uses. The layout solver
 *    reserved a box; a building that outgrows it is a building that lied.
 * 2. **The interior stays walkable.** Every interior prop goes through
 *    {@link PropCounter}, which routes through the ground floor's own `free`
 *    and `take` — so the door approach, the stair columns, the hearth reserve
 *    and the connectivity guard are all honoured without this file restating
 *    any of them.
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

/* -------------------------------------------------------------------------- */
/* the archetypes                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The three archetypes this file fits out, in catalog order.
 *
 * Spread into `BUILDING_ARCHETYPES` by `archetypes.ts`. All three are
 * `vernacular` in the structure catalog, which is the point of grouping them:
 * they differ from a cottage in cladding and roof line rather than in what
 * the building is for.
 */
export const VERNACULAR_BUILDING_ARCHETYPES = [
  "alpine_chalet",
  "saltbox_house",
  "dutch_gable_house",
] as const;

/** One of the archetypes this file fits out. */
export type VernacularBuildingArchetype = (typeof VERNACULAR_BUILDING_ARCHETYPES)[number];

/** True for an archetype this file answers to. */
export function isVernacularArchetype(value: string): value is VernacularBuildingArchetype {
  return (VERNACULAR_BUILDING_ARCHETYPES as readonly string[]).includes(value);
}

/**
 * Tag → archetype, or `null` when nothing matches.
 *
 * Consulted after the breadth table and *before* the extended one, for the
 * reason every later table goes before an earlier one: the tables below are
 * greedy, and every archetype here is a house. The vocabulary is deliberately
 * narrow and regional — `chalet`, `saltbox`, `canal_house` — and it claims no
 * tag another table already answers to. In particular it does **not** claim
 * `house`, `home` or `cottage`, which belong to the default, nor `townhouse`,
 * which the catalog reserves for a residential entry of its own.
 */
export function vernacularArchetypeOfTags(
  tags: readonly string[],
): VernacularBuildingArchetype | null {
  const has = (t: string): boolean => tags.includes(t);
  if (has("chalet") || has("alpine")) return "alpine_chalet";
  if (has("saltbox")) return "saltbox_house";
  if (has("dutch_gable") || has("canal_house") || has("stepped_gable")) {
    return "dutch_gable_house";
  }
  return null;
}

/**
 * Facade tendencies for this file's archetypes.
 *
 * Same contract as `archetypeFacadeDefaults` and `blitzFacadeDefaults`:
 * defaults a caller merges into its params, never something applied over an
 * explicit one. All three ask for `gable`, and for the same reason a keep asks
 * for `hip` — the shape whose height the replacement is going to take over.
 * A saltbox rebuilds its gable off-centre and a Dutch house builds a parapet
 * over the roof line, so both want the shell to have raised the ridge first.
 */
export function vernacularFacadeDefaults(
  archetype: string,
): { readonly windowShape?: string; readonly windowRhythm?: string; readonly roof?: string } {
  switch (archetype) {
    // Broad shuttered lights under a low pitch: the eave is the building.
    case "alpine_chalet":
      return { windowShape: "mullion", windowRhythm: "regular", roof: "gable" };
    // Small, even, colonial. The roof does the talking.
    case "saltbox_house":
      return { windowShape: "single", windowRhythm: "regular", roof: "gable" };
    // Tall lights in a narrow brick front, the way a canal frontage is taxed.
    case "dutch_gable_house":
      return { windowShape: "tall", windowRhythm: "regular", roof: "gable" };
    default:
      return {};
  }
}

/* -------------------------------------------------------------------------- */
/* the exterior plan                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Clear everything the shell built above the eave plate, apron included.
 *
 * Two courses past `top` as well, because the chimney's corbel and its
 * chimney-pot campfire stand there: a replacement roof that cleared only up to
 * its own ceiling would leave a fire burning in mid-air over the ridge it
 * deleted. The flue *below* the plate is wall and stays wall.
 */
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

/**
 * Blocks a re-clad may never overwrite.
 *
 * The blitz set — the way in, the way up, the fire, and anything the physics
 * lint holds to a support rule — plus **glazing**. That addition is the one
 * difference between this file's re-clads and the keep's, and it is the whole
 * character of the wave: a chalet's shutters need a window to stand beside,
 * and a canal house whose tall lights were bricked over by its own re-clad is
 * a warehouse.
 */
const KEEP_AS_IS = /(_door$|^ladder$|^campfire$|_sign$|torch$|^bell$|_pane$|^glass$|^lantern$)/;

/**
 * Re-clad the wall ring, leaving the openings and the fittings alone.
 *
 * `block` is a pure function of position, which is what keeps the whole file
 * deterministic without touching an RNG: same envelope, same cladding, every
 * time.
 */
function recladRing(
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
      if (standing !== undefined && KEEP_AS_IS.test(standing.block)) continue;
      ctx.put(cell.x, y, cell.z, block(cell.x, y, cell.z), props?.(cell.x, y, cell.z));
      n++;
    }
  }
  return n;
}

/** True at one of the four corner columns of the footprint. */
function isCorner(plan: RebuildPlan, x: number, z: number): boolean {
  return (x === 0 || x === plan.sx - 1) && (z === 0 || z === plan.sz - 1);
}

/**
 * A deep eave: a course of upturned stairs right round the apron ring.
 *
 * At the plate line rather than one above it, so it reads as an overhang under
 * the roof rather than as a second roof. The **whole** ring is drawn including
 * its corners, and that is load-bearing: an apron cell only touches the wall
 * diagonally at a corner, so a corner drawn on its own would be a stair with
 * air on every side — the physics lint's `floating.stair`. Drawn as a closed
 * ring, every cell has a neighbour in the ring.
 */
function apronEave(ctx: FitOutContext, plan: RebuildPlan, stairs: string): number {
  let n = 0;
  const y = ctx.wallTop;
  for (let x = -1; x <= plan.sx; x++) {
    for (let z = -1; z <= plan.sz; z++) {
      const outside = x === -1 || x === plan.sx || z === -1 || z === plan.sz;
      if (!outside) continue;
      const facing: Cardinal = z === -1 ? "south" : z === plan.sz ? "north" : x === -1 ? "east" : "west";
      ctx.put(x, y, z, stairs, { facing, half: "top", shape: "straight" });
      n++;
    }
  }
  return n;
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
export function furnishVernacular(ctx: FitOutContext): number {
  if (!isVernacularArchetype(ctx.archetype)) return 0;
  const c = new PropCounter(ctx);
  switch (ctx.archetype) {
    case "alpine_chalet":
      fitAlpineChalet(ctx, c);
      break;
    case "saltbox_house":
      fitSaltboxHouse(ctx, c);
      break;
    case "dutch_gable_house":
    default:
      fitDutchGableHouse(ctx, c);
      break;
  }
  return c.n;
}

/* -------------------------------------------------------------------------- */
/* the alps                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * `alpine_chalet` — heavy timber, a deep eave and a fire on the floor.
 *
 * The one archetype here that keeps the shell's roof, because a chalet's roof
 * is already what the grammar builds: a low gable. What it does not have is
 * the *weight*, and weight is three things, all of them cladding —
 *
 * - **boxed corners**: whole columns of spruce log at the four corners, which
 *   is how a log-built house actually stands up and what the eye reads as
 *   "timber" before it reads anything else;
 * - **bands**: a log course at the plinth and another under the plate, with
 *   the field between them in the shell's own primary, so the wall has courses
 *   rather than one flat sheet;
 * - **a deep eave**: the apron ring at the plate line, upturned, which is the
 *   overhang the snow slides off.
 *
 * The shutters are trapdoors hung in the apron beside each light. They live in
 * the ring the eave already occupies, they are not a stair, a slab or a full
 * block, so no support rule reaches them — and swung open against the wall is
 * what a shutter looks like the whole time anyone is awake.
 */
function fitAlpineChalet(ctx: FitOutContext, c: PropCounter): void {
  const plan = wallPlan(ctx);
  if (plan !== null) {
    const primary = ctx.style["wall.primary"] as string;
    const bandY = ctx.wallTop - 1;
    c.n += recladRing(
      ctx,
      plan,
      1,
      ctx.wallTop,
      (x, y, z) => {
        if (isCorner(plan, x, z)) return "spruce_log";
        if (y <= 1 || y === bandY || y === ctx.wallTop) return "stripped_spruce_log";
        return primary;
      },
      (x, y, z) => {
        if (isCorner(plan, x, z)) return { axis: "y" };
        if (y <= 1 || y === bandY || y === ctx.wallTop) {
          // A band runs *along* its wall: north and south faces band on x, the
          // other two on z, or the grain turns the corner and reads as a knot.
          return { axis: z === 0 || z === plan.sz - 1 ? "x" : "z" };
        }
        return undefined;
      },
    );
    c.n += apronEave(ctx, plan, "spruce_stairs");

    // The shutters: one either side of every light, in the apron.
    for (const cell of ringOf(plan.sx, plan.sz)) {
      if (isCorner(plan, cell.x, cell.z)) continue;
      for (let y = 2; y < ctx.wallTop; y++) {
        const standing = ctx.blockAt(cell.x, y, cell.z);
        if (standing === undefined || !/_pane$|^glass$/.test(standing.block)) continue;
        // Outward normal of the face this light is in, and the axis along it.
        const onZ = cell.z === 0 || cell.z === plan.sz - 1;
        const nx = onZ ? 0 : cell.x === 0 ? -1 : 1;
        const nz = onZ ? (cell.z === 0 ? -1 : 1) : 0;
        for (const step of [-1, 1] as const) {
          const sx = cell.x + nx + (onZ ? step : 0);
          const sz = cell.z + nz + (onZ ? 0 : step);
          if (sx < -1 || sx > plan.sx || sz < -1 || sz > plan.sz) continue;
          const facing: Cardinal = onZ
            ? step < 0
              ? "east"
              : "west"
            : step < 0
              ? "south"
              : "north";
          ctx.put(sx, y, sz, "spruce_trapdoor", {
            facing,
            half: "bottom",
            open: "true",
            powered: "false",
            waterlogged: "false",
          });
          c.n++;
        }
      }
    }
  }

  // The stube: a hearth against a wall, benches turned in, and the kit a
  // household at altitude keeps — a cauldron, a barrel, a loom for the winter.
  const it = ctx.interior;
  const mid = Math.floor((it.x0 + it.x1) / 2);
  const hearthZ = ctx.door === null || ctx.door.z > (it.z0 + it.z1) / 2 ? it.z0 : it.z1;
  c.put1(mid, hearthZ, "campfire", {
    lit: "false",
    facing: "north",
    signal_fire: "false",
    waterlogged: "false",
  });
  const bench = ctx.style["stair.interior"] as string;
  const benchZ = hearthZ === it.z0 ? it.z0 + 1 : it.z1 - 1;
  if (benchZ >= it.z0 && benchZ <= it.z1) {
    for (const bx of [mid - 1, mid + 1]) {
      if (bx < it.x0 || bx > it.x1) continue;
      c.put1(bx, benchZ, bench, {
        facing: bx < mid ? "east" : "west",
        half: "bottom",
        shape: "straight",
      });
    }
  }
  c.put1(it.x0, it.z1, "loom", { facing: "north" });
  c.put1(it.x1, it.z1, "barrel", { facing: "up", open: "false" });
  c.put1(it.x1, it.z0, "cauldron", { level: "3" });
  ctx.placeBed(it.x0 + 1 <= it.x1 ? it.x0 + 1 : it.x0, it.z1, "west", "red_bed");
}

/* -------------------------------------------------------------------------- */
/* New England                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The saltbox profile: roof height above the plate, per depth column.
 *
 * The whole archetype is this function. A saltbox is a gable whose ridge sits
 * well forward of centre, so the front slope is short and steep and the back
 * one runs long and shallow all the way down to a single-storey eave — the
 * shape a lean-to added to the back of a colonial house makes, and the shape
 * the salt boxes of the period had.
 *
 * Integer arithmetic throughout, and a half added before the floor rather than
 * a rounding call, because the same spec and seed have to give the same world
 * on every machine.
 */
function saltboxRise(z: number, sz: number, ridge: number): number {
  if (z <= ridge) return z;
  const run = sz - 1 - ridge;
  if (run <= 0) return ridge;
  return Math.floor((ridge * (sz - 1 - z) * 2 + run) / (run * 2));
}

/**
 * `saltbox_house` — the asymmetric roof, and clapboard under it.
 *
 * The roof is thrown away and rebuilt: `saltboxRise` gives a height per depth
 * column, each column is drawn as a course of roof stairs across the full
 * width, the two gable ends are packed solid underneath, and the ridge column
 * gets a slab cap so the two pitches meet in a line rather than in a step.
 *
 * The cladding is the other half of the read. Clapboard is horizontal courses,
 * so the wall alternates the shell's primary with a stripped-wood band every
 * other course — the same trick the chalet's bands play, at twice the
 * frequency and in a lighter timber, which is the difference between a log
 * house and a boarded one.
 */
function fitSaltboxHouse(ctx: FitOutContext, c: PropCounter): void {
  const plan = roofPlan(ctx);
  if (plan !== null) {
    const primary = ctx.style["wall.primary"] as string;
    c.n += recladRing(
      ctx,
      plan,
      1,
      ctx.wallTop,
      (_x, y) => (y % 2 === 0 ? "stripped_oak_wood" : primary),
      (_x, y, z) => (y % 2 === 0 ? { axis: z === 0 || z === plan.sz - 1 ? "x" : "z" } : undefined),
    );

    clearRoof(ctx, plan);
    const stairs = ctx.style["roof.stairs"] as string;
    const solid = ctx.style["roof.solid"] as string;
    const slabBlock = ctx.style["roof.slab"] as string;
    // The ridge sits a third of the way back, and never higher than the room
    // the envelope left: an envelope that cannot carry the peak gets a
    // shallower saltbox, not one that pushes through its own ceiling.
    const ridge = Math.max(1, Math.min(Math.floor((plan.sz - 1) / 3), plan.top - plan.base));
    for (let z = 0; z < plan.sz; z++) {
      const rise = saltboxRise(z, plan.sz, ridge);
      const y = plan.base + rise;
      if (y > plan.top) continue;
      const facing: Cardinal = z <= ridge ? "north" : "south";
      for (let x = 0; x < plan.sx; x++) {
        // The gable ends are packed: a stepped pitch over an open end is a
        // roof you can see the sky through from inside the attic.
        if (x === 0 || x === plan.sx - 1) {
          for (let fy = plan.base; fy < y; fy++) ctx.put(x, fy, z, solid);
        }
        ctx.put(x, y, z, z === ridge ? slabBlock : stairs, {
          ...(z === ridge ? { type: "bottom" } : { facing, half: "bottom", shape: "straight" }),
        });
      }
      c.n++;
    }
    // The eave, in the apron, at the plate line — modest, as a colonial one is.
    c.n += apronEave(ctx, plan, stairs);
  }

  // A colonial parlour: a board table down the room, a settle beside it, the
  // press against the end wall and the household's own work in the corner.
  const it = ctx.interior;
  const mid = Math.floor((it.x0 + it.x1) / 2);
  for (let z = it.z0 + 1; z <= it.z1 - 1; z += 2) {
    if (c.put1(mid, z, ctx.style["wall.fence"] as string)) {
      c.stack(mid, z, 2, "oak_pressure_plate", { powered: "false" });
    }
    if (mid - 1 >= it.x0) {
      c.put1(mid - 1, z, ctx.style["stair.interior"] as string, {
        facing: "east",
        half: "bottom",
        shape: "straight",
      });
    }
  }
  // The loom is the household's own work and the prop this archetype is
  // recognised by, so it is offered every corner rather than one: a corner
  // taken by the stair run or the door approach is a corner `put1` refuses,
  // and a saltbox with no loom in it is a saltbox nobody can test for.
  for (const [lx, lz, facing] of [
    [it.x0, it.z0, "south"],
    [it.x1, it.z0, "south"],
    [it.x0, it.z1, "north"],
    [it.x1, it.z1, "north"],
  ] as const) {
    if (c.put1(lx, lz, "loom", { facing })) break;
  }
  c.put1(it.x1, it.z0, "chest", { facing: "west", type: "single" });
  c.put1(it.x1, it.z1, "bookshelf");
  c.put1(it.x0, it.z1, "barrel", { facing: "up", open: "false" });
  ctx.placeBed(it.x0 + 1 <= it.x1 ? it.x0 + 1 : it.x0, it.z1, "west", "white_bed");
}

/* -------------------------------------------------------------------------- */
/* the canal                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * `dutch_gable_house` — brick, tall lights and a stepped parapet.
 *
 * The gable of a canal house is not the end of the roof; it is a **wall that
 * carries on past it**, stepped back a course at a time to a peak with a hoist
 * beam over the street. So this rebuild runs the ridge along z — front to back
 * — and stands the parapet in the two z-faces, one course higher than the roof
 * plane beside it, capped with slabs. The steps come free: the pitch already
 * rises one per cell from each side, so a parapet drawn to the pitch is a
 * staircase.
 *
 * The hoist is a fence stem and a lantern at the peak of the *front* gable —
 * the door's face, or the north one when the shell put no door in. It is the
 * one asymmetry in the exterior, and it is the detail that says which way the
 * canal is.
 */
function fitDutchGableHouse(ctx: FitOutContext, c: PropCounter): void {
  const plan = roofPlan(ctx);
  if (plan !== null) {
    // Brick, with the shell's own accent stone at the plinth and every sixth
    // cell above it, so the courses have a header bond rather than a flat red.
    const accent = ctx.style["foundation.accent"] as string;
    c.n += recladRing(ctx, plan, 1, ctx.wallTop, (x, y, z) =>
      y <= 1 || (x * 7 + y * 13 + z * 5) % 9 === 0 ? accent : "bricks",
    );

    clearRoof(ctx, plan);
    const stairs = ctx.style["roof.stairs"] as string;
    const slabBlock = ctx.style["stone.slab"] as string;
    // Two courses of the allowance are the parapet's and the cap's, so the
    // pitch is capped to what is left.
    const room = Math.max(0, plan.top - plan.base - 2);
    const peak = Math.min(Math.floor((plan.sx - 1) / 2), room);
    const riseAt = (x: number): number => Math.min(peak, Math.min(x, plan.sx - 1 - x));

    for (let x = 0; x < plan.sx; x++) {
      const y = plan.base + riseAt(x);
      const facing: Cardinal = x * 2 < plan.sx - 1 ? "west" : "east";
      const ridgeColumn = riseAt(x) === peak;
      for (let z = 1; z < plan.sz - 1; z++) {
        ctx.put(x, y, z, ridgeColumn ? ctx.style["roof.solid"] as string : stairs, {
          ...(ridgeColumn ? {} : { facing, half: "bottom", shape: "straight" }),
        });
      }
      // The parapet: the two z-faces, run up solid to one course above the
      // roof plane beside them and capped with a slab. That course is what
      // makes the gable stand *proud* of the roof rather than flush with it.
      const capY = y + 1;
      for (const z of [0, plan.sz - 1]) {
        for (let py = plan.base; py <= capY && py <= plan.top; py++) ctx.put(x, py, z, "bricks");
        if (capY + 1 <= plan.top) ctx.put(x, capY + 1, z, slabBlock, { type: "bottom" });
      }
      c.n++;
    }

    // The hoist beam, at the peak of the front gable.
    const frontZ = ctx.door !== null && ctx.door.z > (plan.sz - 1) / 2 ? plan.sz - 1 : 0;
    const hx = plan.sx >> 1;
    const hoistY = plan.base + peak + 2;
    if (hoistY + 1 <= plan.top) {
      ctx.put(hx, hoistY, frontZ, ctx.style["wall.fence"] as string);
      ctx.put(hx, hoistY + 1, frontZ, ctx.style["light.lantern"] as string, { hanging: "false" });
      c.n += 2;
    }
  }

  // A merchant's ground floor: the counter across the front, the stock behind
  // it, and the ledger the whole house turns on.
  const it = ctx.interior;
  const counterZ = ctx.door === null || ctx.door.z > (it.z0 + it.z1) / 2 ? it.z0 + 1 : it.z1 - 1;
  if (counterZ >= it.z0 && counterZ <= it.z1) {
    for (let x = it.x0; x <= it.x1; x += 2) {
      c.put1(x, counterZ, ctx.style["stone.slab"] as string, { type: "top" });
    }
  }
  // The ledger, offered every corner in turn — as the saltbox's loom is, and
  // for the same reason: one named corner is one corner the stair run or the
  // door approach may already have taken.
  for (const [lx, lz] of [
    [it.x0, it.z0],
    [it.x1, it.z0],
    [it.x0, it.z1],
    [it.x1, it.z1],
  ] as const) {
    if (c.put1(lx, lz, "cartography_table")) break;
  }
  c.put1(it.x1, it.z0, "lectern", { facing: "west", has_book: "false", powered: "false" });
  c.put1(it.x0, it.z1, "barrel", { facing: "up", open: "false" });
  c.put1(it.x1, it.z1, "chest", { facing: "west", type: "single" });
  const mid = Math.floor((it.x0 + it.x1) / 2);
  c.put1(mid, it.z1, "barrel", { facing: "up", open: "false" });
}
