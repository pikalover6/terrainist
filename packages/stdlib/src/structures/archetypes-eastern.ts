/**
 * The **East Asian pack**, built half — the four entries of
 * `docs/CATALOG-EXPANSION-v0.md` §3.9 a player walks *into*.
 *
 * The pack's thesis is that `hanok`, `machiya`, `pagoda` and `tea_house`
 * already exist as isolated houses, so an East Asian prompt produces one
 * correct house standing in a European town. The props
 * (`props-eastern.ts`) supply the gate, the light, the garden and the boat;
 * this file supplies the four buildings that make the town a town:
 *
 * - **the castle** — `tenshu_keep`, the pack's biggest building;
 * - **the gate** — `drum_tower`, tiered over a podium;
 * - **the garden** — `shoji_teahouse`, the pavilion in it;
 * - **the sound** — `bell_pavilion`, the tiered-eave answer to `bell_tower`.
 *
 * `archetypes-arcane.ts` and `archetypes-classical.ts` state the law this file
 * obeys, so it is not restated: an archetype is a **fit-out**, not a second
 * grammar. Everything here runs after the shape stages and writes into the
 * same cell map.
 *
 * ## The one thing this pack must get right
 *
 * **The silhouette is the eave, and the eave is above the plate.** Nothing
 * about an East Asian building is legible from its plan: what a stranger names
 * in half a second is the *stack of flaring tiled roofs*, each one narrower
 * than the one under it. So three of the four rebuild the volume over the eave
 * plate, on the classical, xeno and arcane packs' plan machinery — restated
 * here rather than imported for the reason those packs restated it from each
 * other: two packs are two seams, and a shared private helper is a shared
 * edit.
 *
 * The materials are **fixed blocks, not style roles**, for the arcane pack's
 * reason: the icon has to survive a document that never names a theme. The
 * roofs come out `deepslate_tiles` in `temperate_timber` and in `sun_clay`
 * alike, and the posts come out vermilion in both. What the theme changes is
 * the shell these sit on, which is the right seam for a palette to work at.
 *
 * ## The rules, inherited whole from the classical, sanctum and arcane packs
 *
 * 1. **Nothing leaves the envelope** — the footprint plus its one-block apron,
 *    and `roofTop` + {@link ROOF_FLOURISH_RISE} overhead.
 * 2. **The interior stays walkable**: every interior prop goes through
 *    {@link PropCounter}, which routes through the ground floor's own `free`
 *    and `take`, and no fit-out here paints the door column or its approach.
 *    The drum tower's arch is the sharpest case — a gate tower whose way
 *    through is not standable is a wall, so the passage cells are the first
 *    thing this file refuses to touch.
 * 3. **Solid per course.** A tier is a solid prism and an eave is a skirt on
 *    it; every course overlaps the one under it, so no cell in either is a
 *    full cube with six air faces.
 * 4. **A rebuilt roof starts with a lid**, because the room below needs a
 *    ceiling and everything above needs a floor.
 * 5. **No interior column runs floor to ceiling.** Every mat, hearth, alcove
 *    and drum stand goes through {@link PropCounter}, whose headroom guard is
 *    the physics lint's `interior.blocked_column` rule.
 * 6. **The glow rides the structure.** `glowstone` is a full cube; every one
 *    written here is in the floor plane or against something already solid,
 *    and **this file writes no `lantern` block at all**.
 * 7. **No `chain`** — `iron_bars`, where a hanger is wanted.
 * 8. **No transcendental maths, no unseeded randomness.** There is no RNG in a
 *    fit-out context and this file does not want one: every form is a pure
 *    function of the position or the envelope.
 * 9. No bare `flower_pot`, no sign blocks, no lit fire.
 */

import {
  PropCounter,
  ROOF_FLOURISH_RISE,
  type FitOutContext,
} from "./archetypes-civic.js";
import { cardinalStep, type LocalRect } from "./core.js";

/* -------------------------------------------------------------------------- */
/* the archetypes                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The four archetypes this file fits out, in catalog order.
 *
 * Spread into `BUILDING_ARCHETYPES` by `archetypes.ts` immediately after the
 * arcane pack, and repeated in that order in the spec's
 * `KNOWN_BUILDING_ARCHETYPES`, where the order is asserted.
 */
export const EASTERN_BUILDING_ARCHETYPES = [
  "tenshu_keep",
  "drum_tower",
  "shoji_teahouse",
  "bell_pavilion",
] as const;

/** One of the archetypes this file fits out. */
export type EasternBuildingArchetype = (typeof EASTERN_BUILDING_ARCHETYPES)[number];

/** True for an archetype this file answers to. */
export function isEasternArchetype(value: string): value is EasternBuildingArchetype {
  return (EASTERN_BUILDING_ARCHETYPES as readonly string[]).includes(value);
}

/**
 * Tag → archetype, or `null` when nothing matches.
 *
 * Consulted immediately after the arcane table, where every later pack sits,
 * and for the same reason: the tables below it are greedy. **The non-claims
 * are the whole story in this pack**, because the East Asian vocabulary was
 * settled by the vernacular and regional waves long before §3.9 was written,
 * and this pack owning the *ids* must not move one of the *words*:
 *
 * - **`pagoda`, `tea_house`/`teahouse`, `hanok` and `machiya` are not ours** —
 *   all four are shipped archetypes with their own tags, and a document asking
 *   for a pagoda or a tea house wants the one it already gets. The garden
 *   pavilion is deliberately a *different building* from Track A's commercial
 *   `tea_house` and answers only to compounds nobody holds: `shoji_teahouse`,
 *   `shoji`, `garden_teahouse` and `tea_pavilion`;
 * - **`keep`, `castle` and `donjon` are not ours** — the garrison wave's keep
 *   holds them, and a node tagged `castle` in a European street must keep
 *   building the European keep. The tower keep answers to `tenshu`,
 *   `tenshu_keep`, `castle_keep` and `japanese_castle`;
 * - **`bell`, `bell_tower`, `belfry` and `campanile` are not ours** — the
 *   faith wave's masonry shaft has all four, and this pavilion is the *other*
 *   answer to the same brief rather than a replacement for it. It answers to
 *   `bell_pavilion` and `shoro`;
 * - **bare `pavilion` is left unclaimed**, as the leisure, spectacle and
 *   arcana waves each recorded in turn: the catalog has a bathing pavilion and
 *   a dodgems pavilion waiting for it, and a shape word is nobody's;
 * - **bare `tower`, `gate` and `gatehouse` are not ours** — the garrison and
 *   town waves hold them, and a gate tower is a *kind* of gatehouse rather
 *   than the word. The drum tower answers to `drum_tower` and `drum`, both of
 *   which were unclaimed and are now ours;
 * - **`shrine` and `temple` are not ours** — both mean church in the extended
 *   table and stay the church's, exactly as the sanctum, classical and arcane
 *   packs each record.
 */
export function easternArchetypeOfTags(tags: readonly string[]): EasternBuildingArchetype | null {
  const has = (t: string): boolean => tags.includes(t);
  if (has("tenshu") || has("tenshu_keep") || has("castle_keep") || has("japanese_castle")) {
    return "tenshu_keep";
  }
  if (has("drum_tower") || has("drum")) return "drum_tower";
  if (
    has("shoji_teahouse") ||
    has("shoji") ||
    has("garden_teahouse") ||
    has("tea_pavilion")
  ) {
    return "shoji_teahouse";
  }
  if (has("bell_pavilion") || has("shoro")) return "bell_pavilion";
  return null;
}

/**
 * Facade tendencies for this file's archetypes.
 *
 * Same contract as every other wave's — defaults a caller merges, never
 * something applied over an explicit param.
 *
 * All four ask for `hip`, which is the one case in this catalog where the
 * choice is not aesthetic: the hip leaves the deepest gap between the eave
 * plate and the allowance, and *the gap is where the tiers are built*. The
 * keep and the drum tower want sparse openings because a fortification has
 * few; the tea pavilion wants as much light as a wall allows, because a
 * pavilion is a view with a roof on it.
 */
export function easternFacadeDefaults(archetype: string): {
  readonly windowShape?: string;
  readonly windowRhythm?: string;
  readonly roof?: string;
} {
  switch (archetype) {
    case "tenshu_keep":
      return { windowShape: "single", windowRhythm: "sparse", roof: "hip" };
    case "drum_tower":
      return { windowShape: "tall", windowRhythm: "sparse", roof: "hip" };
    case "shoji_teahouse":
      return { windowShape: "mullion", windowRhythm: "dense", roof: "hip" };
    case "bell_pavilion":
      return { windowShape: "tall", windowRhythm: "regular", roof: "hip" };
    default:
      return {};
  }
}

/* -------------------------------------------------------------------------- */
/* the pack's own materials                                                    */
/* -------------------------------------------------------------------------- */

/** The dark tile every roof and coping in this pack is finished in. */
const TILE = "deepslate_tiles";
/** The tile's stair, which is what makes an eave flare. */
const TILE_STAIRS = "deepslate_tile_stairs";
/** The tile's slab — an eave's thin edge. */
const TILE_SLAB = "deepslate_tile_slab";
/** The vermilion a post and a rail are painted. */
const VERMILION = "red_concrete";
/** The pale plaster of a tier's wall. */
const PLASTER = "white_terracotta";
/** The worked stone of a podium and a battered base. */
const WORKED = "stone_bricks";
/** The stone with a face on it. */
const CARVED = "chiseled_stone_bricks";
/** Gold, and the only place this pack spends it: a ridge finial. */
const GOLD = "gold_block";
/** The glow. Always a full cube, always against something solid. */
const GLOW = "glowstone";
/** The mat a floor is laid in. */
const MAT = "bamboo_mosaic";

/** A block laid along x — a beam, a drum slung across a frame. */
const ALONG_X: Record<string, string> = { axis: "x" };

/** An eave stair, per facing, hung so its thick edge is outboard. */
function eaveStair(facing: string): Record<string, string> {
  return { facing, half: "bottom", shape: "straight", waterlogged: "false" };
}

/** A slab sitting on the floor of its own cell. */
const BOTTOM_SLAB: Record<string, string> = { type: "bottom", waterlogged: "false" };

/* -------------------------------------------------------------------------- */
/* the shared machinery                                                        */
/* -------------------------------------------------------------------------- */

/**
 * What an exterior rebuild needs to know, or `null` when it may not run.
 *
 * The arcane pack's plan in every respect. The refusals are the same — a
 * **plain rect** only, and two courses of room over the plate before a roof
 * may be rebuilt.
 */
interface EasternPlan {
  /** Envelope extents. */
  readonly sx: number;
  readonly sz: number;
  /** Y of the roof's lowest course — one above the eave plate. */
  readonly base: number;
  /** Highest Y anything may occupy: the shell's roof top plus the allowance. */
  readonly top: number;
}

/** The plan for a **roof rebuild**: the rect condition, plus room to build in. */
function roofPlan(ctx: FitOutContext): EasternPlan | null {
  const sx = ctx.size[0];
  const sz = ctx.size[2];
  const it = ctx.interior;
  if (it.x0 !== 1 || it.z0 !== 1 || it.x1 !== sx - 2 || it.z1 !== sz - 2) {
    ctx.skipped?.push("roof work: the interior is not the one-block inset the rebuild plans over");
    return null;
  }
  const base = ctx.wallTop + 1;
  const top = ctx.roofTop + ROOF_FLOURISH_RISE;
  const courses = top - base;
  if (courses < 2) {
    ctx.skipped?.push(
      `roof work: ${courses} course${courses === 1 ? "" : "s"} above the eave where the rebuild needs 2 — a flat or low roof leaves no room`,
    );
    return null;
  }
  return { sx, sz, base, top };
}

/** Clear everything the shell built above the eave plate, apron included. */
function clearRoof(ctx: FitOutContext, plan: EasternPlan): void {
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
function lid(c: PropCounter, plan: EasternPlan, block: string): void {
  for (let z = 0; z < plan.sz; z++) {
    for (let x = 0; x < plan.sx; x++) c.raw(x, plan.base, z, block);
  }
}

/**
 * **The pack's one move**: a flaring eave skirt round a rectangle.
 *
 * A rank of stairs laid all the way round the given rect at one course, each
 * turned outward so its thick edge is the drip and its thin edge tucks under
 * the tier above. Every stair rests on the course below it, and a stair is not
 * a full cube, so the `floating.*` family has nothing to say about the skirt
 * even where it steps out past the wall under it.
 *
 * The corners are slabs rather than stairs, because a stair at a corner faces
 * one way and reads wrong from the other.
 */
function eaveSkirt(
  c: PropCounter,
  plan: EasternPlan,
  y: number,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
): void {
  if (y > plan.top) return;
  for (let x = x0; x <= x1; x++) {
    for (const [z, facing] of [
      [z0, "north"],
      [z1, "south"],
    ] as const) {
      if (x < -1 || z < -1 || x > plan.sx || z > plan.sz) continue;
      const corner = x === x0 || x === x1;
      if (corner) c.raw(x, y, z, TILE_SLAB, BOTTOM_SLAB);
      else c.raw(x, y, z, TILE_STAIRS, eaveStair(facing));
    }
  }
  for (let z = z0 + 1; z <= z1 - 1; z++) {
    for (const [x, facing] of [
      [x0, "west"],
      [x1, "east"],
    ] as const) {
      if (x < -1 || z < -1 || x > plan.sx || z > plan.sz) continue;
      c.raw(x, y, z, TILE_STAIRS, eaveStair(facing));
    }
  }
}

/**
 * A **solid prism** of tier wall, from one course to another.
 *
 * Solid, not a ring: rule 3. A tier this small costs a few hundred blocks at
 * most, and a hollow one buys nothing a player can see from the street while
 * costing the one guarantee this pack cannot afford to lose.
 */
function tierBox(
  c: PropCounter,
  plan: EasternPlan,
  from: number,
  to: number,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
): void {
  for (let y = from; y <= to && y <= plan.top; y++) {
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        if (x < 0 || z < 0 || x >= plan.sx || z >= plan.sz) continue;
        const rim = x === x0 || x === x1 || z === z0 || z === z1;
        // The posts read at the corners, the plaster between them.
        const post = (x === x0 || x === x1) && (z === z0 || z === z1);
        c.raw(x, y, z, post ? VERMILION : rim ? PLASTER : WORKED);
      }
    }
  }
}

/**
 * The whole tiered stack: shrink, skirt, shrink again, and finish with a
 * ridge.
 *
 * Each tier is inset one cell from the one under it and carries its own eave
 * skirt at its foot, which is what "each storey smaller than the one below"
 * means once it is blocks. The stack stops when it runs out of allowance or
 * out of plan, whichever comes first — a tier with no room is simply not
 * built, which is the same refusal the arcane pack's towers make.
 *
 * `gable` breaks every second eave with a raised centre block, which is the
 * detail the keep's note asks for by name.
 */
function tieredStack(
  c: PropCounter,
  plan: EasternPlan,
  tierHeight: number,
  gable: boolean,
): void {
  let x0 = 0;
  let z0 = 0;
  let x1 = plan.sx - 1;
  let z1 = plan.sz - 1;
  let y = plan.base + 1;
  let tier = 0;
  while (y + tierHeight <= plan.top && x1 - x0 >= 2 && z1 - z0 >= 2) {
    // The skirt at this tier's foot, one cell proud of the tier itself.
    eaveSkirt(c, plan, y, x0 - 1, z0 - 1, x1 + 1, z1 + 1);
    tierBox(c, plan, y + 1, y + tierHeight, x0, z0, x1, z1);
    if (gable && tier % 2 === 1) {
      // The gable that breaks the eave: a raised block over the middle of the
      // long face, standing on the skirt it interrupts.
      const mx = Math.floor((x0 + x1) / 2);
      if (y + 1 <= plan.top) c.raw(mx, y + 1, z0 - 1 < 0 ? z0 : z0 - 1, PLASTER);
    }
    y += tierHeight + 1;
    x0 += 1;
    z0 += 1;
    x1 -= 1;
    z1 -= 1;
    tier += 1;
  }
  // The ridge: a lit gold finial on the top tier's own last course.
  const cx = Math.floor((x0 + x1) / 2);
  const cz = Math.floor((z0 + z1) / 2);
  if (y <= plan.top) {
    c.raw(cx, y, cz, GOLD);
    if (y + 1 <= plan.top) c.raw(cx, y + 1, cz, GLOW);
  }
}

/**
 * **Write the ceiling back over anything left hanging from air.**
 *
 * The sanctum pack's oldest note, restated as *code* rather than as a caution,
 * because a caution is a thing four fit-outs each have to remember: the shell
 * hangs its lantern from the ceiling plane directly above it (`core.ts` writes
 * the interior floor block over every interior cell at `wallTop` for exactly
 * that reason), and **three of the four rebuilds in this file delete and
 * re-lay the volume over that plane.** The physics lint's `unsupported.chain`
 * rule walks a hanger's support upward and fails it the moment the cell above
 * is air — which is precisely how the bell pavilion, an *open* pavilion whose
 * whole fit-out is above the plate, shipped nine findings at five of seven
 * stations in one terrarium row and none at the others: the failure is
 * envelope-dependent, so no single envelope's fit-out could argue itself
 * innocent.
 *
 * So rather than each fit-out arguing that its own lid happens to land over
 * the lantern column, {@link furnishEastern} runs this over the finished
 * envelope for all four: every cell carrying a block with `hanging: "true"`
 * gets the ceiling material written above it if that cell came out empty. It
 * is a **closure, not a fix** — it holds for a hanger this pack never placed,
 * at a position no envelope in the test matrix produced, in a shape somebody
 * adds next year.
 *
 * The block written is `floor.interior`, which is the very block `core.ts`
 * lays for the same purpose, so the ceiling stays the ceiling in every theme.
 */
function guardHangers(ctx: FitOutContext, c: PropCounter): void {
  const sx = ctx.size[0];
  const sz = ctx.size[2];
  const ceiling = ctx.style["floor.interior"] as string;
  const top = ctx.roofTop + ROOF_FLOURISH_RISE;
  for (let y = 1; y <= top; y++) {
    for (let z = -1; z <= sz; z++) {
      for (let x = -1; x <= sx; x++) {
        const here = ctx.blockAt(x, y, z);
        if (here === undefined || here.props?.["hanging"] !== "true") continue;
        const above = ctx.blockAt(x, y + 1, z);
        if (above !== undefined && above.block !== "air") continue;
        c.raw(x, y + 1, z, ceiling);
      }
    }
  }
}

/** True when the shell hung something from the ceiling over this cell. */
function hangerUnder(ctx: FitOutContext, x: number, y: number, z: number): boolean {
  return ctx.blockAt(x, y - 1, z)?.props?.["hanging"] === "true";
}

/** Blocks a re-clad may never overwrite — the classical pack's list unchanged. */
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
 * The arcane pack's wider version, for its reason: a walkable cell is a solid
 * non-water floor with air at `y + 1` *and* `y + 2`, and the cell a body lands
 * in when it walks through the door is as load-bearing as the door itself.
 * Nothing in this file paints, mats or rails any of the three.
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
 * True when a cell is on the drum tower's **through passage**.
 *
 * The gate tower's whole claim is that a street goes through it, so the line
 * from the door straight across the building is reserved as hard as the door
 * itself: nothing is painted on it, nothing stands in it, and the arch built
 * over it starts two courses clear of the floor.
 */
function onPassage(ctx: FitOutContext, x: number, z: number): boolean {
  if (ctx.door === null) return true;
  const [dx] = cardinalStep(ctx.door.face);
  return dx === 0 ? x === ctx.door.x : z === ctx.door.z;
}

/**
 * A deterministic small draw, keyed on a position.
 *
 * There is no RNG in a {@link FitOutContext} and this file does not want one:
 * a position-derived integer hash is a pure function, and it makes "the same
 * document compiles to the same keep forever" true by construction.
 */
function matHash(a: number, b: number, c: number, n: number): number {
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

/** The middle of the interior, where a hearth is cut and a bell hangs. */
function heart(it: LocalRect): { readonly x: number; readonly z: number } {
  return { x: Math.floor((it.x0 + it.x1) / 2), z: Math.floor((it.z0 + it.z1) / 2) };
}

/** Chebyshev radius of a cell from a centre — the square rings a plan reads in. */
function chebyshev(x: number, z: number, cx: number, cz: number): number {
  return Math.max(Math.abs(x - cx), Math.abs(z - cz));
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
export function furnishEastern(ctx: FitOutContext): number {
  const c = new PropCounter(ctx);
  switch (ctx.archetype) {
    case "tenshu_keep":
      fitTenshuKeep(ctx, c);
      break;
    case "drum_tower":
      fitDrumTower(ctx, c);
      break;
    case "shoji_teahouse":
      fitShojiTeahouse(ctx, c);
      break;
    case "bell_pavilion":
      fitBellPavilion(ctx, c);
      break;
    default:
      return 0;
  }
  // The pack's one module-wide rule, run after every fit-out rather than
  // inside any of them: nothing this file rebuilt may leave a hanger with air
  // over it. See {@link guardHangers}.
  guardHangers(ctx, c);
  return c.n;
}

/* -------------------------------------------------------------------------- */
/* the keep                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * `tenshu_keep` — **the pack's biggest building**, and the one whose whole
 * argument is above the plate.
 *
 * The note asks for three things:
 *
 * 1. **stacked tiered storeys, each smaller than the one below.** That is
 *    {@link tieredStack}, and it is why this archetype's facade default asks
 *    for a hip roof: the hip leaves the deepest gap between the plate and the
 *    allowance, and the tiers are built in it;
 * 2. **gables breaking every second eave** — the stack's `gable` flag, which
 *    raises a block over the middle of the long face on alternate tiers;
 * 3. **a battered stone base with a curved cyclopean face.** The base proper
 *    is `castle_base_wall`, an infrastructure entry the retaining pass owns
 *    and this file cannot build; what a fit-out *can* do is clad the shell's
 *    own first course in cyclopean stone, in a course that steps out at the
 *    foot, which is the batter as far up as an archetype reaches.
 *
 * Inside, the floor is laid as a hall: a worked ambulatory ring round a
 * boarded court, which costs no headroom and no walkable cell.
 */
function fitTenshuKeep(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const mid = heart(it);

  floorPaint(ctx, c, (x, z) => {
    if (onWayIn(ctx, x, z)) return null;
    const r = chebyshev(x, z, mid.x, mid.z);
    if (r === 0) return GOLD;
    if (x === it.x0 || x === it.x1 || z === it.z0 || z === it.z1) return WORKED;
    return matHash(x, z, 7, 6) === 0 ? CARVED : MAT;
  });

  // The batter: a cyclopean apron course round the foot of the shell, one cell
  // proud of it, resting on the ground the building stands on.
  const sx = ctx.size[0];
  const sz = ctx.size[2];
  for (let x = -1; x <= sx; x++) {
    for (let z = -1; z <= sz; z++) {
      if (x !== -1 && x !== sx && z !== -1 && z !== sz) continue;
      if (onWayIn(ctx, x, z)) continue;
      c.raw(x, 0, z, matHash(x, z, 11, 5) === 0 ? CARVED : WORKED);
    }
  }

  const plan = roofPlan(ctx);
  if (plan === null) return;
  clearRoof(ctx, plan);
  lid(c, plan, TILE);
  tieredStack(c, plan, 2, true);
}

/* -------------------------------------------------------------------------- */
/* the drum tower                                                              */
/* -------------------------------------------------------------------------- */

/**
 * `drum_tower` — **a tower a street goes through**.
 *
 * The note asks for a tiered gate tower on a masonry podium with an arch
 * through it and a drum hung in the upper storey, and of those four the arch
 * is the one that can go wrong: a passage that is not standable turns the
 * building from a gate into a wall with a picture of a gate on it. So
 * {@link onPassage} reserves the whole line from the door across the plan, and
 * nothing — not the podium cladding, not the drum stand, not one block of
 * paint — is written on it.
 *
 * - the **podium** is the shell's first course clad in worked stone and given
 *   a proud apron, as the keep's batter is, minus the passage mouth;
 * - the **arch** is written *over* the passage at the eave plate, in stairs
 *   turned inward, which is a soffit rather than a ceiling and leaves the
 *   passage's own headroom untouched;
 * - the **drum** hangs in the upper storey: a stack of two logs on the lid's
 *   underside is impossible in a fit-out, so it is written the honest way —
 *   the drum stands on the floor of the tier above, on its own frame, where
 *   the tiered stack has already laid a lid to stand it on;
 * - the **tiers** are the pack's stack, without gables: a gate tower is a
 *   plain thing under its roofs.
 */
function fitDrumTower(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const mid = heart(it);

  floorPaint(ctx, c, (x, z) => {
    if (onWayIn(ctx, x, z) || onPassage(ctx, x, z)) return null;
    if (x === it.x0 || x === it.x1 || z === it.z0 || z === it.z1) return WORKED;
    return matHash(x, z, 3, 5) === 0 ? CARVED : PLASTER;
  });

  // The podium apron, minus the passage mouth.
  const sx = ctx.size[0];
  const sz = ctx.size[2];
  for (let x = -1; x <= sx; x++) {
    for (let z = -1; z <= sz; z++) {
      if (x !== -1 && x !== sx && z !== -1 && z !== sz) continue;
      if (onWayIn(ctx, x, z) || onPassage(ctx, x, z)) continue;
      c.raw(x, 0, z, WORKED);
    }
  }

  // The arch soffit, at the eave plate over the passage — never lower, so the
  // passage keeps every course of headroom the shell gave it.
  const soffit = ctx.wallTop;
  // No door means no passage to arch over — and `onPassage` says *everything*
  // is passage in that case, which is the safe answer for a reserve and the
  // wrong one for a soffit.
  if (ctx.door !== null) {
    for (let x = it.x0; x <= it.x1; x++) {
      for (let z = it.z0; z <= it.z1; z++) {
        if (!onPassage(ctx, x, z)) continue;
        if (chebyshev(x, z, mid.x, mid.z) === 0) continue;
        if (protectedAt(ctx, x, soffit, z)) continue;
        if (ctx.blockAt(x, soffit, z) !== undefined) continue;
        c.raw(x, soffit, z, TILE_SLAB, BOTTOM_SLAB);
      }
    }
  }

  const plan = roofPlan(ctx);
  if (plan === null) return;
  clearRoof(ctx, plan);
  lid(c, plan, TILE);

  // The drum, standing on the lid in the upper storey: a barrel of timber
  // between two carved posts, with a lit face so it reads at night.
  const dx = Math.floor((plan.sx - 1) / 2);
  const dz = Math.floor((plan.sz - 1) / 2);
  if (plan.base + 1 <= plan.top) {
    c.raw(dx, plan.base + 1, dz, VERMILION, ALONG_X);
    if (dx - 1 >= 0) c.raw(dx - 1, plan.base + 1, dz, CARVED);
    if (dx + 1 < plan.sx) c.raw(dx + 1, plan.base + 1, dz, CARVED);
    if (plan.base + 2 <= plan.top) c.raw(dx, plan.base + 2, dz, GLOW);
  }

  tieredStack(c, plan, 2, false);
}

/* -------------------------------------------------------------------------- */
/* the tea pavilion                                                            */
/* -------------------------------------------------------------------------- */

/**
 * `shoji_teahouse` — the garden pavilion, and **the smallest building in the
 * pack**.
 *
 * Deliberately a different building from Track A's commercial `tea_house`: it
 * is not a shop, it is a room in a garden with four things in it and nothing
 * else, which is the whole point of the form.
 *
 * - **a mat floor** — `bamboo_mosaic` laid in the floor plane in bays, with a
 *   worked border, because a tea room's floor is measured in mats and the
 *   measure is the decoration;
 * - **a hearth recess** — the sunken square in the middle of the mats, written
 *   in the floor plane as worked stone round a lit heart. A *recess*, not a
 *   fire: the floor stays solid and walkable everywhere, and there is no lit
 *   fire block in this catalog's grammar;
 * - **one alcove** — the *tokonoma*, against the wall furthest from the door:
 *   a raised step with a single object on it. One, because two alcoves is a
 *   corridor;
 * - **a low crawl-in entry** — the *nijiriguchi*, which is the one thing in
 *   the note this fit-out **deliberately does not build**. A low entry is a
 *   door column painted down to crawling height, and that is exactly the move
 *   the physics rules forbid: the way in must stay standable. The note's
 *   intent is served instead by the lintel course written *beside* the door,
 *   which reads as a low opening from outside while leaving the opening
 *   itself full height.
 */
function fitShojiTeahouse(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const mid = heart(it);

  floorPaint(ctx, c, (x, z) => {
    if (onWayIn(ctx, x, z)) return null;
    if (chebyshev(x, z, mid.x, mid.z) === 0) return GLOW;
    if (chebyshev(x, z, mid.x, mid.z) === 1) return WORKED;
    if (x === it.x0 || x === it.x1 || z === it.z0 || z === it.z1) return CARVED;
    return matHash(Math.floor(x / 2), z, 5, 4) === 0 ? "bamboo_planks" : MAT;
  });

  // The alcove: a raised step against the wall furthest from the door, with
  // one object on it. Everything goes through the counter, so an alcove that
  // would strand the room is simply not built.
  const far = ctx.door === null || ctx.door.z > mid.z ? it.z0 : it.z1;
  c.put1(mid.x, far, "bamboo_mosaic_slab", BOTTOM_SLAB);
  if (c.put1(mid.x + 1, far, CARVED)) c.stack(mid.x + 1, far, 2, GLOW);

  // The false lintel beside the door, which is what reads as a crawl-in entry
  // from outside without ever narrowing the way in.
  if (ctx.door !== null) {
    const [dx, dz] = cardinalStep(ctx.door.face);
    for (const side of [-1, 1] as const) {
      const lx = ctx.door.x + (dx === 0 ? side : 0);
      const lz = ctx.door.z + (dz === 0 ? side : 0);
      if (protectedAt(ctx, lx, 2, lz)) continue;
      if (ctx.blockAt(lx, 2, lz) === undefined) continue;
      c.raw(lx, 2, lz, VERMILION);
    }
  }

  const plan = roofPlan(ctx);
  if (plan === null) return;
  clearRoof(ctx, plan);
  lid(c, plan, "bamboo_planks");
  // One tier only, deep-eaved: a tea pavilion is all roof and no storeys.
  eaveSkirt(c, plan, plan.base + 1, -1, -1, plan.sx, plan.sz);
  tierBox(c, plan, plan.base + 2, plan.base + 2, 1, 1, plan.sx - 2, plan.sz - 2);
  if (plan.base + 3 <= plan.top) {
    eaveSkirt(c, plan, plan.base + 3, 1, 1, plan.sx - 2, plan.sz - 2);
  }
}

/* -------------------------------------------------------------------------- */
/* the bell pavilion                                                           */
/* -------------------------------------------------------------------------- */

/**
 * `bell_pavilion` — **the tiered-eave answer to `bell_tower`'s masonry
 * shaft**, and the pack's one building whose fit-out is mostly one block.
 *
 * The faith wave's bell tower is a shaft with a bell at the top of it, seen
 * from far away. This is the opposite building for the same purpose: a low
 * open pavilion on a raised podium with a great bell hung from the beam at
 * head height, seen from *underneath*, which is where a bell is actually rung
 * from.
 *
 * - **the bell** hangs from the ceiling at the middle of the room. `bell` with
 *   `attachment: ceiling` wants something solid directly above it, and the
 *   cell above it is the lid this fit-out has just laid, so the support chain
 *   closes on the pack's own block;
 * - **the striking log** is slung beside it: a log laid along the floor on its
 *   side, through {@link PropCounter}, so a room too small to hold it simply
 *   does not get one;
 * - **the podium** is the proud apron course, as the keep's batter is;
 * - **the eaves** are two tiers of the pack's stack, because two is what makes
 *   a pavilion read as a pavilion rather than as a shed.
 */
function fitBellPavilion(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const mid = heart(it);

  floorPaint(ctx, c, (x, z) => {
    if (onWayIn(ctx, x, z)) return null;
    const r = chebyshev(x, z, mid.x, mid.z);
    if (r === 1) return CARVED;
    if (x === it.x0 || x === it.x1 || z === it.z0 || z === it.z1) return WORKED;
    return matHash(x, z, 17, 4) === 0 ? PLASTER : WORKED;
  });

  // The podium: the proud apron round the foot of the shell.
  const sx = ctx.size[0];
  const sz = ctx.size[2];
  for (let x = -1; x <= sx; x++) {
    for (let z = -1; z <= sz; z++) {
      if (x !== -1 && x !== sx && z !== -1 && z !== sz) continue;
      if (onWayIn(ctx, x, z)) continue;
      c.raw(x, 0, z, WORKED);
    }
  }

  // The striking log, slung beside where the bell will hang.
  if (mid.x - 2 >= it.x0) c.put1(mid.x - 2, mid.z, ctx.style["wall.frame"] as string, ALONG_X);

  const plan = roofPlan(ctx);
  if (plan === null) return;
  clearRoof(ctx, plan);
  lid(c, plan, TILE);

  // The bell, hung from the lid's underside at the middle of the room. The
  // cell above it is the lid itself, which is what `attachment: ceiling`
  // needs; the cell below it stays air, which is what a rung bell needs.
  // The shell hangs its own lantern from the middle of the ceiling plane, and
  // that is the same column a bell wants. The closure below would rescue the
  // lantern by writing the ceiling straight back over the bell, so the bell
  // steps one cell aside first: a rescued bell is better than a rescued hole
  // where the bell was.
  let bx = mid.x;
  if (hangerUnder(ctx, bx, ctx.wallTop, mid.z) && bx + 1 <= it.x1) bx += 1;
  if (hangerUnder(ctx, bx, ctx.wallTop, mid.z) && mid.x - 1 >= it.x0) bx = mid.x - 1;
  if (
    !hangerUnder(ctx, bx, ctx.wallTop, mid.z) &&
    !onWayIn(ctx, bx, mid.z) &&
    !protectedAt(ctx, bx, ctx.wallTop, mid.z)
  ) {
    c.raw(bx, ctx.wallTop, mid.z, "bell", {
      attachment: "ceiling",
      facing: "north",
      powered: "false",
    });
  }

  tieredStack(c, plan, 1, false);
}
