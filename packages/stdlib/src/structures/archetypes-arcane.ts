/**
 * The **arcane & magical pack**, built half — the five entries of
 * a player walks *into*.
 *
 * The pack's thesis is that the fantasy corner of the catalog has towers and
 * one shrine, and that a magical *place* — the unicorn island of battery P1, a
 * mage college, a warded valley — needs more than a wizard's tower on a hill.
 * The props (`props-arcane.ts`) make the ground glow and the paths read as
 * marked; this file supplies the institutions that make a magical settlement a
 * settlement:
 *
 * - **the college** — `arcane_academy` (the pack's biggest building),
 *   `arcane_library`, `summoning_hall`;
 * - **the quiet corner** — `blossom_shrine`;
 * - **the beasts** — `pegasus_stable`.
 *
 * `archetypes-sanctum.ts` and `archetypes-classical.ts` state the law this
 * file obeys, so it is not restated: an archetype is a **fit-out**, not a
 * second grammar. Everything here runs after the shape stages and writes into
 * the same cell map.
 *
 * ## The one thing this pack must get right
 *
 * **Magic has to read at a glance.** In this medium that is three things and
 * nothing else: *glow*, *geometry that looks impossible while being perfectly
 * legal*, and *white-and-gold-and-amethyst against a world that is neither*.
 * So the accents here are **fixed blocks, not style roles** — `calcite`,
 * `smooth_quartz`, `amethyst_block`, `gold_block` and `glowstone` come out the
 * same in `temperate_timber` as in `sun_clay`, and the icon survives a
 * document that never names a theme. What the theme changes is the shell these
 * accents are set into, which is the right seam for a palette to work at.
 *
 * The one place that budget is spent hardest is the **volume over the eave
 * plate**: an academy is two unequal towers, a shrine is a cherry canopy, and
 * neither of those is expressible in a fit-out that only furnishes rooms. So
 * three of the five rebuild the roof, on the classical and xeno packs' plan
 * machinery, restated here rather than imported for the reason those packs
 * restated it from each other: two packs are two seams, and a shared private
 * helper is a shared edit.
 *
 * ## The rules, inherited whole from the classical, sanctum and xeno packs
 *
 * 1. **Nothing leaves the envelope** — the footprint plus its one-block apron,
 *    and `roofTop + `{@link ROOF_FLOURISH_RISE} overhead.
 * 2. **The interior stays walkable**: every interior prop goes through
 *    {@link PropCounter}, which routes through the ground floor's own `free`
 *    and `take`, and no fit-out here paints the door column or its approach.
 * 3. **Solid per course.** A tower is a solid prism and a canopy is a stack of
 *    shrinking discs; every course overlaps the one under it, so no cell in
 *    either is a full cube with six air faces.
 * 4. **A rebuilt roof starts with a lid**, because the room below needs a
 *    ceiling and everything above needs a floor.
 * 5. **No interior column runs floor to ceiling.** Every shelf, brazier and
 *    stall goes through {@link PropCounter}, whose headroom guard is the
 *    physics lint's `interior.blocked_column` rule.
 * 6. **The glow rides the structure.** `glowstone` is a full cube; every one
 *    written here is in the floor plane or against something already solid.
 * 7. **A gallery is only built where a gallery fits.** The summoning hall's
 *    high rail needs a tall single-storey room; on a short or multi-storey
 *    envelope it is silently not built, because a corbel course at head height
 *    is a wall through the room.
 * 8. **No transcendental maths, no unseeded randomness.** There is no RNG in a
 *    fit-out context and this file does not want one: every form is a pure
 *    function of the position or the envelope.
 * 9. No bare `flower_pot`, no sign blocks, no lit fire.
 */

import {
  PropCounter,
  ROOF_FLOURISH_RISE,
  type FitOutContext,
  roofPlan,
  type RebuildPlan,
} from "./archetypes-civic.js";
import { cardinalStep, type LocalRect } from "./core.js";
import { buildingIdFromTags, defineBuildingDescriptors } from "./descriptor.js";
import type { BuildingDescriptor } from "./descriptor.js";

/* -------------------------------------------------------------------------- */
/* the archetypes                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The five archetypes this file fits out, in catalog order.
 *
 * Spread into `BUILDING_ARCHETYPES` by `archetypes.ts` immediately after the
 * sanctum pack, and repeated in that order in the spec's
 * `KNOWN_BUILDING_ARCHETYPES`, where the order is asserted.
 */
export const ARCANE_BUILDING_ARCHETYPES = [
  "arcane_academy",
  "summoning_hall",
  "arcane_library",
  "blossom_shrine",
  "pegasus_stable",
] as const;

/** One of the archetypes this file fits out. */
export type ArcaneBuildingArchetype = (typeof ARCANE_BUILDING_ARCHETYPES)[number];

/** True for an archetype this file answers to. */
export function isArcaneArchetype(value: string): value is ArcaneBuildingArchetype {
  return (ARCANE_BUILDING_ARCHETYPES as readonly string[]).includes(value);
}

/**
 * Tag → archetype, or `null` when nothing matches.
 *
 * Consulted immediately after the sanctum table, where every later pack sits,
 * and for the same reason: the tables below it are greedy. **The non-claims
 * matter more than the claims here than in any other pack**, because the
 * fantasy vocabulary was settled long ago by wave 4B's arcana and the blitz
 * wave, and this pack owning the *ids* must not move one of the *words*:
 *
 * - **bare `arcane` is not ours.** The blitz wave's `wizard_tower` has claimed
 *   `arcane` (with `wizard`, `wizard_tower` and `sorcerer`) since before this
 *   pack existed, and a document that says "arcane" with nothing else almost
 *   always wants the tower on the hill. The academy therefore answers to the
 *   compounds — `arcane_academy`, `mage_college`, `magic_school`,
 *   `wizard_school`, `magus_hall` — and leaves the bare adjective where it is;
 * - **`library` is not ours** — it is wave 4A's civic library, with `study`,
 *   `scriptorium` and `archive`, and a document asking for a library wants a
 *   library. The arcane one answers to `arcane_library`, `magic_library`,
 *   `spell_library`, `grimoire_hall` and `librarium`;
 * - **`school`, `academy`, `college` and `university` are not ours.** The
 *   town wave's `school` claims the first two, commerce's `university_hall`
 *   the last two, and a mage college is a *kind* of college rather than the
 *   word;
 * - **`shrine`, `temple` and `chapel` are not ours** — all three mean church
 *   in the extended table and stay the church's, exactly as the sanctum and
 *   classical packs record. The blossom shrine answers to `blossom_shrine`,
 *   `cherry_shrine`, `sakura_shrine` and `blossom_pavilion`, and bare
 *   `pavilion` stays the leisure wave's;
 * - **`stable`, `barn` and `byre` are not ours** — wave 4A's barn has them,
 *   and a stable full of horses is what a document asking for one wants. The
 *   winged-mount stable answers to `pegasus_stable`, `pegasus`,
 *   `winged_stable`, `griffin_stable` and `hippogriff_stable`;
 * - **`crystal`, `dragon` and `roost` are not ours** — wave 4B's
 *   `crystal_shrine` and `dragon_roost` hold all three, which is why this
 *   pack's own `crystal_outcrop` and `dragon_skeleton` are **props reached by
 *   name** and claim no tag at all. A node tagged `dragon` must keep building
 *   the roost;
 * - **`circle`, `ritual` and `summoning` were unclaimed and are now ours**,
 *   with `summoning_hall`, `conjuring_hall` and `ritual_hall`. Bare `circle`
 *   is deliberately **left alone** even so: it is a shape word, and a node
 *   tagged `circle` in a street of round towers should not become a hall.
 */
function arcaneArchetypeOfTags(tags: readonly string[]): ArcaneBuildingArchetype | null {
  return buildingIdFromTags(ARCANE_BUILDING_DESCRIPTORS, tags);
}


/**
 * Facade tendencies for this file's archetypes.
 *
 * Same contract as every other wave's — defaults a caller merges, never
 * something applied over an explicit param.
 *
 * The three college buildings ask for `hip`, because a hip roof leaves the
 * most room between the eave plate and the allowance and that gap is where the
 * academy's towers are built; the library asks for paired mullions for the
 * civic library's own reason (the shelving needs wall to stand against between
 * the lights); the shrine asks for as much glass as a wall allows, because an
 * *open* pavilion is the note and glass is the closest a shell gets to open;
 * and the stable asks for the gable its landing ledge swings out of, with
 * almost no windows, because a stall has none.
 */
export function arcaneFacadeDefaults(archetype: string): {
  readonly windowShape?: string;
  readonly windowRhythm?: string;
  readonly roof?: string;
} {
  switch (archetype) {
    case "arcane_academy":
      return { windowShape: "tall", windowRhythm: "regular", roof: "hip" };
    case "summoning_hall":
      return { windowShape: "tall", windowRhythm: "sparse", roof: "hip" };
    case "arcane_library":
      return { windowShape: "mullion", windowRhythm: "paired", roof: "gable" };
    case "blossom_shrine":
      return { windowShape: "mullion", windowRhythm: "dense", roof: "hip" };
    case "pegasus_stable":
      return { windowShape: "single", windowRhythm: "sparse", roof: "gable" };
    default:
      return {};
  }
}

/* -------------------------------------------------------------------------- */
/* the pack's own materials                                                    */
/* -------------------------------------------------------------------------- */

/** The pale ground every inlay is cut into. */
const PALE = "calcite";
/** The polished stone of a worked plane. */
const POLISHED = "smooth_quartz";
/** The worked block with a face on it. */
const CHISELED = "chiseled_quartz_block";
/** A shaft. */
const PILLAR = "quartz_pillar";
/** The colour magic is in this pack. */
const AMETHYST = "amethyst_block";
/** The other half of the pack's colour claim. */
const GOLD = "gold_block";
/** The glow. Always a full cube, always against something solid. */
const GLOW = "glowstone";

/** A block standing on its end. */
const UPRIGHT: Record<string, string> = { axis: "y" };
/** Cherry foliage that will not decay when nothing under it is a tree. */
const LEAF: Record<string, string> = { distance: "1", persistent: "true", waterlogged: "false" };

/* -------------------------------------------------------------------------- */
/* the shared machinery                                                        */
/* -------------------------------------------------------------------------- */

/** Clear everything the shell built above the eave plate, apron included. */
function clearRoof(ctx: FitOutContext, plan: RebuildPlan): void {
  for (let y = plan.base; y <= plan.top + 2; y++) {
    for (let x = -1; x <= plan.sx; x++) {
      for (let z = -1; z <= plan.sz; z++) ctx.put(x, y, z, "air");
    }
  }
}

/**
 * A solid lid over the whole footprint at the roof's first course.
 *
 * Rule 4, and the reason it is a named function: `clearRoof` takes the shell's
 * roof away, and the room below needs a ceiling while everything above needs a
 * floor to stand on.
 */
function lid(c: PropCounter, plan: RebuildPlan, block: string): void {
  for (let z = 0; z < plan.sz; z++) {
    for (let x = 0; x < plan.sx; x++) c.raw(x, plan.base, z, block);
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
 * The classical pack's list unchanged: the way in, the way up, the fire, the
 * glass and anything the physics lint holds to a support rule.
 */
const PRESERVE = /(_door$|^ladder$|^campfire$|_sign$|torch$|^bell$|glass|_pane$|lantern$|banner$)/;

/** True when the shell put something at this cell a fit-out must leave alone. */
function protectedAt(ctx: FitOutContext, x: number, y: number, z: number): boolean {
  const standing = ctx.blockAt(x, y, z);
  return standing !== undefined && PRESERVE.test(standing.block);
}

/** The cell a player stands in to open the door, or `null` when there is none. */
function outsideDoor(ctx: FitOutContext): { readonly x: number; readonly z: number } | null {
  if (ctx.door === null) return null;
  const [dx, dz] = cardinalStep(ctx.door.face);
  return { x: ctx.door.x + dx, z: ctx.door.z + dz };
}

/**
 * True when a cell is the door column, its doorstep, or the cell inside it.
 *
 * **Wider than the classical pack's version on purpose.** A walkable cell is a
 * solid non-water floor with air at `y + 1` *and* `y + 2`, and the cell a body
 * lands in when it walks through the door is as load-bearing as the door
 * itself. Nothing in this file paints, corbels or rails any of the three.
 */
function onWayIn(ctx: FitOutContext, x: number, z: number): boolean {
  if (ctx.door === null) return false;
  if (x === ctx.door.x && z === ctx.door.z) return true;
  const out = outsideDoor(ctx);
  if (out !== null && out.x === x && out.z === z) return true;
  const [dx, dz] = cardinalStep(ctx.door.face);
  return x === ctx.door.x - dx && z === ctx.door.z - dz;
}

/**
 * A deterministic small draw, keyed on whatever the caller hands it.
 *
 * There is no RNG in a {@link FitOutContext} and this file does not want one:
 * a position-derived integer hash is a pure function, and it makes "the same
 * document compiles to the same academy forever" true by construction.
 */
function inlayHash(a: number, b: number, c: number, n: number): number {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = (h ^ (h >>> 13)) >>> 0;
  return h % n;
}

/**
 * Paint the floor plane where a predicate says so, counting each cell.
 *
 * `y = 0` is the floor itself, so this never takes a cell from the fit-out and
 * never needs the walkability guard — it changes what the floor is made of,
 * not what stands on it.
 */
function floorPaint(
  ctx: FitOutContext,
  c: PropCounter,
  pick: (x: number, z: number) => string | null,
): void {
  for (const cell of ctx.floorCells) {
    const block = pick(cell.x, cell.z);
    if (block === null) continue;
    c.raw(cell.x, 0, cell.z, block);
  }
}

/** The middle of the interior, where a circle is written and a lamp hangs. */
function heart(it: LocalRect): { readonly x: number; readonly z: number } {
  return { x: Math.floor((it.x0 + it.x1) / 2), z: Math.floor((it.z0 + it.z1) / 2) };
}

/** Chebyshev radius of a cell from a centre — the square rings a plan reads in. */
function chebyshev(x: number, z: number, cx: number, cz: number): number {
  return Math.max(Math.abs(x - cx), Math.abs(z - cz));
}

/**
 * A **solid prism** rising to a height, capped and lit.
 *
 * Solid, not a ring: rule 3. A tower this small costs a hundred blocks at
 * most, and a hollow one buys nothing a player can see from the street while
 * costing the one guarantee this pack cannot afford to lose.
 */
function turret(
  c: PropCounter,
  cx: number,
  cz: number,
  half: number,
  from: number,
  to: number,
  plan: RebuildPlan,
): void {
  if (to < from) return;
  for (let y = from; y <= to; y++) {
    for (let z = cz - half; z <= cz + half; z++) {
      for (let x = cx - half; x <= cx + half; x++) {
        if (x < 0 || z < 0 || x >= plan.sx || z >= plan.sz) continue;
        const rim = chebyshev(x, z, cx, cz) === half;
        const band = y === to || (y - from) % 4 === 3;
        c.raw(x, y, z, band ? (rim ? GOLD : CHISELED) : rim ? POLISHED : PALE);
      }
    }
  }
  // The finial: lit, and standing on the tower's own top course.
  if (to + 1 <= plan.top) c.raw(cx, to + 1, cz, GLOW);
}

/* -------------------------------------------------------------------------- */
/* dispatch                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Fit out one of this pack's buildings.
 *
 * Returns the number of ops written, which `furnish` adds to its own count.
 * Anything that is not one of ours returns 0 without touching a cell.
 */
function furnishArcane(ctx: FitOutContext): number {
  const c = new PropCounter(ctx);
  switch (ctx.archetype) {
    case "arcane_academy":
      fitArcaneAcademy(ctx, c);
      break;
    case "summoning_hall":
      fitSummoningHall(ctx, c);
      break;
    case "arcane_library":
      fitArcaneLibrary(ctx, c);
      break;
    case "blossom_shrine":
      fitBlossomShrine(ctx, c);
      break;
    case "pegasus_stable":
      fitPegasusStable(ctx, c);
      break;
    default:
      return 0;
  }
  return c.n;
}

/* -------------------------------------------------------------------------- */
/* the shared interior moves                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Shelf ranges against a wall, with a lit gap in them.
 *
 * *Shelves where a chapel would put pews*, and *one shelf bay left as a gap
 * that goes nowhere*: the ranges run along the two long walls, one cell in
 * from them so a body can walk the aisle behind, and every fourth bay is left
 * empty with a glow behind it. Everything goes through {@link PropCounter},
 * so a range that would strand a corner of the room simply does not get built.
 *
 * The stack is two high at most and only where the storey has the headroom for
 * it, which is the `interior.blocked_column` rule as the counter states it: on
 * a three-high storey the usable band is two courses, so a stack of two is
 * already a pillar.
 */
function shelfRanges(ctx: FitOutContext, c: PropCounter, gapEvery: number): void {
  const it = ctx.interior;
  for (const z of [it.z0, it.z1]) {
    for (let x = it.x0; x <= it.x1; x++) {
      if (onWayIn(ctx, x, z)) continue;
      if (x % gapEvery === 0) {
        // The gap that goes nowhere: no shelf, and a light in the wall behind
        // it so the empty bay is the one a walker notices.
        const wallZ = z === it.z0 ? it.z0 - 1 : it.z1 + 1;
        if (!protectedAt(ctx, x, 2, wallZ)) c.raw(x, 2, wallZ, GLOW);
        continue;
      }
      if (!c.put1(x, z, "bookshelf")) continue;
      c.stack(x, z, 2, "bookshelf");
    }
  }
}

/**
 * The lecterns a reading room needs, at the head of the aisle.
 *
 * Two of them, turned to face each other across the middle, which is what
 * makes a room of shelves read as a room somebody *works* in.
 */
function lecterns(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const mid = heart(it);
  c.put1(mid.x - 1, mid.z, "lectern", { facing: "east", has_book: "true", powered: "false" });
  c.put1(mid.x + 1, mid.z, "lectern", { facing: "west", has_book: "false", powered: "false" });
}

/* -------------------------------------------------------------------------- */
/* the academy                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * `arcane_academy` — **the wizard's tower gone collegiate**, and the pack's
 * biggest building.
 *
 * The note asks for four things and this fit-out answers each of them in the
 * one place it can be seen from:
 *
 * 1. **two unequal towers**, over the eave plate. This is the whole
 *    silhouette, and it is why the archetype's facade default asks for a hip
 *    roof: the hip leaves the deepest gap between the plate and the allowance,
 *    and the towers are built in it. Unequal is the point — a matched pair is
 *    a gatehouse, and a college is a thing that grew;
 * 2. **a cloister**, written into the floor plane as a pale ambulatory ring
 *    round a darker court, which costs no headroom and no walkable cell;
 * 3. **an orrery hall**, as a lit ring in that court with a gold heart. The
 *    floor plane is where a fit-out can be most extravagant for free;
 * 4. **shelves where a chapel would put pews** — the ranges down both long
 *    walls, with lecterns between them.
 */
function fitArcaneAcademy(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const mid = heart(it);
  const court = Math.max(2, Math.min(it.x1 - it.x0, it.z1 - it.z0) >> 2);

  // The cloister and the orrery ring, in the floor plane.
  floorPaint(ctx, c, (x, z) => {
    const r = chebyshev(x, z, mid.x, mid.z);
    if (x === mid.x && z === mid.z) return GOLD;
    if (r === court) return GLOW;
    if (r < court) return AMETHYST;
    if (x === it.x0 || x === it.x1 || z === it.z0 || z === it.z1) return POLISHED;
    return inlayHash(x, z, 3, 7) === 0 ? PALE : null;
  });

  shelfRanges(ctx, c, 4);
  lecterns(ctx, c);

  // The towers.
  const plan = roofPlan(ctx);
  if (plan === null) return;
  clearRoof(ctx, plan);
  lid(c, plan, POLISHED);

  // A low parapet on the lid, so the towers rise out of something rather than
  // off a flat plate.
  for (const cell of ringOf(plan.sx, plan.sz)) {
    c.raw(cell.x, plan.base + 1, cell.z, (cell.x + cell.z) % 2 === 0 ? POLISHED : PALE);
  }

  // The two towers, at diagonally opposite corners and of unequal height and
  // girth. The tall one is capped at the allowance; the short one stops two
  // courses under it.
  const inset = 3;
  const tallX = Math.min(inset, plan.sx - 1 - inset);
  const tallZ = Math.min(inset, plan.sz - 1 - inset);
  const half = plan.sx >= 11 && plan.sz >= 11 ? 2 : 1;
  turret(c, tallX, tallZ, half, plan.base + 1, plan.top - 1, plan);
  turret(
    c,
    plan.sx - 1 - tallX,
    plan.sz - 1 - tallZ,
    1,
    plan.base + 1,
    Math.max(plan.base + 1, plan.top - 3),
    plan,
  );

  // The link between them: a ridge of worked stone along the diagonal's spine,
  // one course over the parapet, so the two towers read as one building.
  const ridgeZ = Math.floor((plan.sz - 1) / 2);
  for (let x = 1; x < plan.sx - 1; x++) c.raw(x, plan.base + 1, ridgeZ, CHISELED);
  for (let x = 2; x < plan.sx - 2; x += 3) {
    if (plan.base + 2 <= plan.top) c.raw(x, plan.base + 2, ridgeZ, AMETHYST);
  }
}

/* -------------------------------------------------------------------------- */
/* the summoning hall                                                          */
/* -------------------------------------------------------------------------- */

/**
 * `summoning_hall` — one tall room with a circle written into its floor.
 *
 * Everything the note asks for is at one of two heights, and nothing is in
 * between, which is what makes the room read as *tall*:
 *
 * - **the circle**, in the floor plane: a lit ring about the heart of the
 *   room, with the four cardinal spokes in gold. It takes no cell from the
 *   fit-out, because a painted floor is still a floor;
 * - **the brazier pedestals**, at the four points of the compass just outside
 *   the ring — a worked plinth with a glow on it where the storey has the
 *   headroom, and a plinth alone where it does not;
 * - **the gallery rail**, high on the walls: a corbel course of worked stone
 *   with a fence rail on it, built **only** on a tall single-storey room. A
 *   corbel at head height is a wall through the room, and a corbel on a
 *   two-storey building is a wall through the *upper* room, which the ground
 *   floor's own guards would never have seen.
 */
function fitSummoningHall(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const mid = heart(it);
  const r = Math.max(2, (Math.min(it.x1 - it.x0, it.z1 - it.z0) >> 1) - 1);

  floorPaint(ctx, c, (x, z) => {
    const d = chebyshev(x, z, mid.x, mid.z);
    if (d === 0) return GOLD;
    if (d === r) return GLOW;
    if (d < r && (x === mid.x || z === mid.z)) return GOLD;
    if (d < r) return AMETHYST;
    return inlayHash(x, z, 11, 5) === 0 ? PALE : null;
  });

  // The four braziers, just outside the ring.
  for (const [dx, dz] of [
    [r + 1, 0],
    [-(r + 1), 0],
    [0, r + 1],
    [0, -(r + 1)],
  ] as const) {
    const x = mid.x + dx;
    const z = mid.z + dz;
    if (x < it.x0 || x > it.x1 || z < it.z0 || z > it.z1) continue;
    if (onWayIn(ctx, x, z)) continue;
    if (!c.put1(x, z, CHISELED)) continue;
    c.stack(x, z, 2, GLOW);
  }

  // The gallery rail — only where a gallery fits.
  if (ctx.floors !== 1 || ctx.wallTop < 6) return;
  const corbel = ctx.wallTop - 2;
  const fence = ctx.style["wall.fence"] as string;
  for (let x = it.x0; x <= it.x1; x++) {
    for (const z of [it.z0, it.z1]) {
      if (protectedAt(ctx, x, corbel, z) || protectedAt(ctx, x, corbel + 1, z)) continue;
      c.raw(x, corbel, z, POLISHED);
      c.raw(x, corbel + 1, z, fence, {
        east: "false",
        north: "false",
        south: "false",
        waterlogged: "false",
        west: "false",
      });
    }
  }
}

/* -------------------------------------------------------------------------- */
/* the library                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * `arcane_library` — shelf ranges to the ceiling plane, and one bay that goes
 * nowhere.
 *
 * The civic library is a room with shelving in it; this one is a room that is
 * *made* of shelving, with the reading floor inlaid and a light behind every
 * empty bay. The gap bays are every third one here rather than every fourth,
 * because a library's gaps are the thing the note singles out and one gap in a
 * long wall reads as an accident.
 */
function fitArcaneLibrary(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const mid = heart(it);

  floorPaint(ctx, c, (x, z) => {
    if (x === mid.x || z === mid.z) return POLISHED;
    if ((x + z) % 6 === 0) return AMETHYST;
    return inlayHash(x, z, 7, 4) === 0 ? PALE : null;
  });

  shelfRanges(ctx, c, 3);
  lecterns(ctx, c);

  // The end ranges, across the two short walls, leaving the door's own bay and
  // the aisle out of the middle clear.
  for (const x of [it.x0, it.x1]) {
    for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
      if (onWayIn(ctx, x, z) || z === mid.z) continue;
      if (!c.put1(x, z, "bookshelf")) continue;
      c.stack(x, z, 2, "bookshelf");
    }
  }
}

/* -------------------------------------------------------------------------- */
/* the blossom shrine                                                          */
/* -------------------------------------------------------------------------- */

/**
 * `blossom_shrine` — an open pavilion under a cherry canopy.
 *
 * The smallest building in the pack and the one with the least room to work
 * in, so all of its budget goes above the plate: the shell's roof comes off
 * and a **canopy of cherry foliage** is mounded over a plank lid, shrinking
 * course by course, which is the one silhouette in this catalog that says
 * *spring* from two hundred blocks away.
 *
 * Inside there is a low altar with **no figure on it** — the note is explicit,
 * and an empty altar is a stronger read than any statue this grammar can build
 * — and the corner posts are banded with pink where the shell's wall is not
 * carrying anything.
 */
function fitBlossomShrine(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const mid = heart(it);

  floorPaint(ctx, c, (x, z) => {
    const d = chebyshev(x, z, mid.x, mid.z);
    if (d === 0) return GOLD;
    if (d === 1) return POLISHED;
    return inlayHash(x, z, 5, 3) === 0 ? PALE : null;
  });

  // The altar: a low slab at the end furthest from the door, which is still a
  // cell a body can stand on, so it can never strand the room.
  const far = ctx.door === null || ctx.door.z > mid.z ? it.z0 : it.z1;
  c.put1(mid.x, far, "smooth_quartz_slab", { type: "bottom", waterlogged: "false" });
  c.put1(mid.x - 1, far, PALE);
  c.put1(mid.x + 1, far, PALE);

  // The ribbons: a pink band at head height on the four corner posts.
  for (const [x, z] of [
    [0, 0],
    [ctx.size[0] - 1, 0],
    [0, ctx.size[2] - 1],
    [ctx.size[0] - 1, ctx.size[2] - 1],
  ] as const) {
    if (protectedAt(ctx, x, 3, z)) continue;
    if (ctx.blockAt(x, 3, z) === undefined) continue;
    c.raw(x, 3, z, "pink_wool");
  }

  // The canopy.
  const plan = roofPlan(ctx);
  if (plan === null) return;
  clearRoof(ctx, plan);
  lid(c, plan, "cherry_planks");

  const cx = (plan.sx - 1) / 2;
  const cz = (plan.sz - 1) / 2;
  const rise = plan.top - plan.base;
  for (let k = 1; k <= rise; k++) {
    // The crown shrinks one cell a course, so every leaf sits over a leaf.
    const r = Math.max(0, Math.min(plan.sx, plan.sz) / 2 - k + 1);
    for (let z = 0; z < plan.sz; z++) {
      for (let x = 0; x < plan.sx; x++) {
        const dx = x - cx;
        const dz = z - cz;
        if (dx * dx + dz * dz > r * r) continue;
        c.raw(x, plan.base + k, z, "cherry_leaves", LEAF);
      }
    }
  }
  // The trunk of the thing the canopy belongs to, standing on the lid.
  for (let k = 1; k <= rise; k++) c.raw(Math.floor(cx), plan.base + k, Math.floor(cz), "cherry_log", UPRIGHT);
}

/* -------------------------------------------------------------------------- */
/* the winged-mount stable                                                     */
/* -------------------------------------------------------------------------- */

/**
 * `pegasus_stable` — **stalls with no doors, because the mounts leave upward**.
 *
 * The note is a piece of world-building disguised as a spec and it is worth
 * obeying literally: a stall with a door is a horse box, and this building's
 * whole claim is that what lives in it does not use the door. So:
 *
 * - the **stalls** are fence partitions running in from one long wall, one bay
 *   apart, with a bed of hay in each and **nothing across the mouth**. Every
 *   partition goes through {@link PropCounter}, so a stall that would strand
 *   the aisle is simply not built;
 * - the **landing ledge** projects from the gable end at the eave plate — a
 *   course of worked stone in the apron, carried by the wall it grows out of,
 *   with a lit marker at each end. It is the one thing about this building
 *   visible from the air, which is the point;
 * - the floor is inlaid with a pale run down the aisle, so the plan reads from
 *   the door.
 */
function fitPegasusStable(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const mid = heart(it);

  floorPaint(ctx, c, (x, z) => {
    if (z === mid.z) return POLISHED;
    return inlayHash(x, z, 13, 5) === 0 ? PALE : null;
  });

  // The stalls: partitions in from the north wall, every third bay, stopping
  // one cell short of the aisle so a body can always get past them.
  const stop = Math.max(it.z0 + 1, mid.z - 1);
  for (let x = it.x0 + 1; x <= it.x1 - 1; x += 3) {
    for (let z = it.z0; z < stop; z++) {
      if (onWayIn(ctx, x, z)) continue;
      c.put1(x, z, ctx.style["wall.fence"] as string, {
        east: "false",
        north: "false",
        south: "false",
        waterlogged: "false",
        west: "false",
      });
    }
    // The bed of hay in the stall beside the partition.
    if (x + 1 <= it.x1 && !onWayIn(ctx, x + 1, it.z0)) c.put1(x + 1, it.z0, "hay_block", UPRIGHT);
  }

  // The landing ledge, off the north gable at the eave plate.
  const ledge = ctx.wallTop;
  const sx = ctx.size[0];
  for (let x = 0; x < sx; x++) {
    if (protectedAt(ctx, x, ledge, 0)) continue;
    if (ctx.blockAt(x, ledge, 0) === undefined) continue;
    c.raw(x, ledge, -1, POLISHED);
  }
  // The markers: full cubes, each against the ledge it stands on.
  for (const x of [0, sx - 1]) {
    if (ctx.blockAt(x, ledge, -1) === undefined) continue;
    c.raw(x, ledge, -1, GOLD);
  }
  const lampX = Math.floor((sx - 1) / 2);
  if (ctx.blockAt(lampX, ledge, -1) !== undefined) c.raw(lampX, ledge + 1, -1, GLOW);

  // The gable's own eye: a lit cell in the wall over the ledge, which is what
  // a mount steers for at night.
  if (ledge + 1 <= ctx.roofTop && !protectedAt(ctx, lampX, ledge, 0)) {
    c.raw(lampX, ledge, 0, PILLAR, UPRIGHT);
  }
}

/**
 * Tag table preserving {@link arcaneArchetypeOfTags} boundaries.
 * Bare `arcane` is not ours (wizard_tower), `library`/`study` not ours,
 * `school`/`academy`/`college` not ours, `shrine`/`temple`/`chapel` not ours,
 * `stable`/`barn` not ours, `crystal`/`dragon`/`roost` not ours, bare `circle`
 * not ours.
 */
const ARCANE_BUILDING_TAGS: Readonly<Record<ArcaneBuildingArchetype, readonly string[]>> = {
  arcane_academy: ["arcane_academy", "mage_college", "magic_school", "wizard_school", "magus_hall"],
  summoning_hall: ["summoning_hall", "summoning", "conjuring_hall", "ritual_hall", "ritual"],
  arcane_library: ["arcane_library", "magic_library", "spell_library", "grimoire_hall", "librarium"],
  blossom_shrine: ["blossom_shrine", "cherry_shrine", "sakura_shrine", "blossom_pavilion"],
  pegasus_stable: ["pegasus_stable", "pegasus", "winged_stable", "griffin_stable", "hippogriff_stable"],
} as const;

/**
 * Ordered building descriptors for the arcane & magical pack, in catalog order.
 * Built from {@link ARCANE_BUILDING_ARCHETYPES} — insertion order is the
 * load-bearing tag-priority order. Facade defaults and furnish handle delegate
 * to existing leaf functions; no cell is touched here.
 */
export const ARCANE_BUILDING_DESCRIPTORS = defineBuildingDescriptors(
  ARCANE_BUILDING_ARCHETYPES,
  {
    tags: ARCANE_BUILDING_TAGS,
    facadeDefaults: arcaneFacadeDefaults,
    furnish: furnishArcane,
    dispatch: "standard",
  },
);
