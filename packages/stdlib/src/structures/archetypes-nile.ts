/**
 * The **Nile & ancient Egypt pack**, buildings half — the seven entries of
 * `docs/CATALOG-EXPANSION-v0.md` §3.8 that a body walks into.
 *
 * The pack's thesis is the bluntest in the expansion document: *the catalog
 * cannot say pyramid*, and a `ziggurat` in `sun_clay` is Mesopotamia in a hat.
 * Egypt is the most recognisable silhouette in architecture and the grammar
 * had none of it. This file is the half of §3.8 that has an inside:
 *
 * - **the tombs** — `mastaba` (the bench tomb: a battered blind block with a
 *   false door and a real one nowhere);
 * - **the temple** — `hypostyle_hall` (the column forest with a taller central
 *   aisle), `mortuary_temple` (colonnaded storeys stepping back off a ramped
 *   axis), `pylon_gate` (two battered trapezoid towers over a lower door),
 *   `canopic_shrine` (the small chapel that carries the two mouldings —
 *   cavetto and torus roll — which are what make a block read as Egyptian);
 * - **the river and the field** — `nilometer` (the graduated gauge under a
 *   covered head), `mudbrick_granary` (corbelled domes on a shared plinth).
 *
 * The law every archetype file states and this one inherits whole: **an
 * archetype is a fit-out, not a second grammar.** Everything here runs after
 * `core.ts`'s shape stages and writes into the same cell map, so a pylon is
 * the shell wearing two towers and a mastaba is the shell re-clad and capped.
 * Not one line of `core.ts` moves for any of it.
 *
 * ## The entry that is NOT here, and why
 *
 * **`pyramid` is a prop** (`props-nile.ts`), not a building archetype, and the
 * reason is arithmetic rather than taste. A building's whole height budget is
 * `wallTop + MAX_ROOF_LAYERS + ROOF_FLOURISH_RISE`, and the only volume a
 * fit-out may rebuild is the part **above the eave plate** — at most six
 * courses. A mass that insets one cell per course closes a thirty-three block
 * base in sixteen; six courses over a sixteen-course vertical wall is a
 * mastaba with a hat, which is precisely the building this pack already
 * ships under its own name. Building it lower is worse: filling a storey
 * solid makes every column of that storey `interior.blocked_column`, which is
 * the lint rule that means "a pillar through the room" and does not care that
 * the pillar is six thousand blocks of limestone. So the pyramid is realised
 * where an XL solid mass with a carved entrance passage is *natural* — the
 * prop registry — exactly as §3.2's careening beach was. See `props-nile.ts`.
 *
 * ## The rules, inherited from the corsair and sanctum packs
 *
 * 1. **Nothing leaves the envelope** — the footprint plus its one-block apron,
 *    and `roofTop + `{@link ROOF_FLOURISH_RISE} overhead.
 * 2. **The interior stays walkable**: every interior prop goes through
 *    {@link PropCounter}, which routes through the ground floor's own `free`
 *    and `take`, so nothing here can strand a corner or seal a column.
 * 3. **Solid per course, never a ring per course.** Every mass this file
 *    rebuilds — the pylon towers, the granary domes, the terrace decks — is
 *    written as a *filled* course standing on the filled course below it. A
 *    stepped shell built as a floating ring is `floating.isolated` waiting to
 *    happen, and a hollow course is a sealed pocket besides.
 * 4. **A rebuilt roof starts with a lid** — the room below needs a ceiling and
 *    everything above needs a floor.
 * 5. **No interior column runs floor to ceiling.** Egypt is a *columned*
 *    architecture and this is the trap it walks into: the hypostyle's forest,
 *    the nilometer's gauge and the shrine's torus rolls are all capped short
 *    of the ceiling band, because `interior.blocked_column` fails a cell that
 *    is solid from its floor to its ceiling however handsome it is.
 * 6. **A rebuild may not strand what it did not place.** The shell hangs its
 *    lantern from the ceiling plane at `wallTop`, and every fit-out here
 *    deletes and re-lays the volume over that plane — the trap
 *    `archetypes-sanctum.ts` documented and the one the terrarium finds as
 *    `unsupported.chain`. {@link guardHangers} closes it for all seven at
 *    once, after the fit-out rather than inside it.
 * 7. **The lantern rule is a name rule.** The lint fires on any block whose
 *    name ends in `lantern` and wants a floor under it or a chain over it — so
 *    every light here is a standing `lantern` on masonry, or `glowstone`
 *    bracketed against a neighbour.
 * 8. **No `mud`.** The obvious block for a mud-brick architecture is fifteen
 *    sixteenths of a cube, which makes every floor laid in it a half-step and
 *    every wall built of it a hole the lint has to argue about. The mud-brick
 *    read comes from the theme's own foundation palette laid in courses.
 * 9. **No unseeded randomness and no wall clock**: {@link nileJitter} is a
 *    pure integer hash of the position, which is what makes "the same document
 *    compiles to the same pylon forever" true by construction.
 * 10. No bare `flower_pot`, no sign blocks, no lit fire, no `chain`.
 */

import {
  PropCounter,
  ROOF_FLOURISH_RISE,
  type FitOutContext,
} from "./archetypes-civic.js";
import { cardinalStep, type Cardinal, type LocalRect } from "./core.js";

/* -------------------------------------------------------------------------- */
/* the archetypes                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The seven archetypes this file fits out, in catalog order.
 *
 * Spread into `BUILDING_ARCHETYPES` by `archetypes.ts` immediately after the
 * nautical & pirate pack's four, and repeated in that order in the spec's
 * `KNOWN_BUILDING_ARCHETYPES`, where the order is asserted.
 */
export const NILE_BUILDING_ARCHETYPES = [
  "mastaba",
  "hypostyle_hall",
  "mortuary_temple",
  "pylon_gate",
  "nilometer",
  "mudbrick_granary",
  "canopic_shrine",
] as const;

/** One of the archetypes this file fits out. */
export type NileBuildingArchetype = (typeof NILE_BUILDING_ARCHETYPES)[number];

/** True for an archetype this file answers to. */
export function isNileArchetype(value: string): value is NileBuildingArchetype {
  return (NILE_BUILDING_ARCHETYPES as readonly string[]).includes(value);
}

/**
 * Tag → archetype, or `null` when nothing matches.
 *
 * Consulted immediately after the nautical pack's table, where every later
 * wave sits, and for the same reason: the tables below it are greedy. The
 * **non-claims** are the load-bearing half, and this pack's list is long
 * because Egypt's vocabulary is made of words older tables already own:
 *
 * - **bare `temple` is not ours.** It is the extended church's and has been
 *   since G4, and `classical_temple`/`greek_temple` are the sanctum's. The
 *   mortuary temple answers to `mortuary_temple`, `funerary_temple`,
 *   `terrace_temple` and `temple_terrace` only;
 * - **bare `tomb` is not ours** — it belongs to the faith wave — so the bench
 *   tomb takes `mastaba`, `bench_tomb` and `mastaba_tomb`;
 * - **bare `shrine` and bare `chapel` are not ours**: the extended church's
 *   and the sanctum's respectively. The chapel here answers to
 *   `canopic_shrine`, `egyptian_shrine`, `shrine_chapel` and `cavetto_shrine`;
 * - **bare `granary` is not ours** — the homestead's, and a document that says
 *   `granary` wants the building it already gets. The beehive row takes
 *   `mudbrick_granary`, `beehive_granary` and `mud_granary`;
 * - **bare `hall` and bare `gate` are left where they were** (the guildhall's
 *   and the gatehouse's). The column forest takes `hypostyle_hall`,
 *   `hypostyle` and `columned_hall`; the pylon takes `pylon_gate`, `pylon`,
 *   `temple_pylon` and `pylon_gateway`. Bare `pylon` is genuinely unclaimed —
 *   `power_pylon` and `maglev_pylon` are infrastructure *rows*, reached by id
 *   through `infra.entry@0` and never through this cascade;
 * - **`pyramid`, `great_pyramid`, `sphinx`, `sacred_lake` and `felucca` are
 *   claimed by nobody, on purpose.** They name this pack's **props**, which
 *   are reached by name and never through this cascade, so a node tagged
 *   `pyramid` must not silently become a building. `pyramid` is additionally
 *   a *roof value* in `core.ts` (`"pyramid"` → `hip`); leaving the word
 *   unclaimed here is what keeps those two namespaces from ever meeting, and
 *   is the curator's "claim deliberately" answered deliberately;
 * - `nilometer` has no near miss at all — nothing else in the catalog measures
 *   a river — so it takes `nilometer`, `nile_gauge` and `river_gauge`.
 */
export function nileArchetypeOfTags(tags: readonly string[]): NileBuildingArchetype | null {
  const has = (t: string): boolean => tags.includes(t);
  if (has("mastaba") || has("bench_tomb") || has("mastaba_tomb")) return "mastaba";
  if (has("hypostyle_hall") || has("hypostyle") || has("columned_hall")) {
    return "hypostyle_hall";
  }
  if (
    has("mortuary_temple") ||
    has("funerary_temple") ||
    has("terrace_temple") ||
    has("temple_terrace")
  ) {
    return "mortuary_temple";
  }
  if (has("pylon_gate") || has("pylon") || has("temple_pylon") || has("pylon_gateway")) {
    return "pylon_gate";
  }
  if (has("nilometer") || has("nile_gauge") || has("river_gauge")) return "nilometer";
  if (has("mudbrick_granary") || has("beehive_granary") || has("mud_granary")) {
    return "mudbrick_granary";
  }
  if (
    has("canopic_shrine") ||
    has("egyptian_shrine") ||
    has("shrine_chapel") ||
    has("cavetto_shrine")
  ) {
    return "canopic_shrine";
  }
  return null;
}

/**
 * Facade tendencies for this file's archetypes.
 *
 * Same contract as every other wave's — defaults a caller merges, never
 * something applied over an explicit param.
 *
 * Six of the seven ask for `windowRhythm: "none"`, and that is not laziness:
 * Egyptian monumental architecture has **no windows**, it has a door and a
 * clerestory, and a rank of glass in a battered ashlar wall is the one detail
 * that would make a stranger read a mastaba as a barn. The hypostyle is the
 * exception and takes a sparse tall rhythm, because its clerestory is the
 * whole point of the type. Every roof is `hip`, which is the shape that leaves
 * the most room between the eave plate and the allowance — the towers, the
 * domes, the terraces and the kiosk are all built in exactly that gap.
 */
export function nileFacadeDefaults(archetype: string): {
  readonly windowShape?: string;
  readonly windowRhythm?: string;
  readonly roof?: string;
} {
  switch (archetype) {
    case "mastaba":
      return { windowShape: "single", windowRhythm: "none", roof: "hip" };
    case "hypostyle_hall":
      return { windowShape: "tall", windowRhythm: "sparse", roof: "hip" };
    case "mortuary_temple":
      return { windowShape: "tall", windowRhythm: "none", roof: "hip" };
    case "pylon_gate":
      return { windowShape: "single", windowRhythm: "none", roof: "hip" };
    case "nilometer":
      return { windowShape: "single", windowRhythm: "none", roof: "hip" };
    case "mudbrick_granary":
      return { windowShape: "single", windowRhythm: "none", roof: "hip" };
    case "canopic_shrine":
      return { windowShape: "single", windowRhythm: "none", roof: "hip" };
    default:
      return {};
  }
}

/* -------------------------------------------------------------------------- */
/* the shared machinery                                                        */
/* -------------------------------------------------------------------------- */

/**
 * What an exterior rebuild needs to know, or `null` when it may not run.
 *
 * The corsair pack's plan in every respect, restated rather than imported for
 * the reason that pack restated the sanctum's: two packs are two seams, and a
 * shared private helper is a shared edit. The refusals are the same — a
 * **plain rect** only, and two courses of room over the plate before a roof
 * may be rebuilt.
 */
interface NilePlan {
  readonly sx: number;
  readonly sz: number;
  /** Y of the roof's lowest course — one above the eave plate. */
  readonly base: number;
  /** Highest Y anything may occupy: the shell's roof top plus the allowance. */
  readonly top: number;
  readonly rect: LocalRect;
}

/** The plan for work on the **walls**: the rect condition, and nothing else. */
function wallPlan(ctx: FitOutContext): NilePlan | null {
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
function roofPlan(ctx: FitOutContext): NilePlan | null {
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
function clearRoof(ctx: FitOutContext, plan: NilePlan): void {
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
 * Blocks a re-clad may never overwrite.
 *
 * The corsair pack's list unchanged: the way in, the way up, the fire, the
 * glass and anything the physics lint holds to a support rule.
 */
const PRESERVE = /(_door$|^ladder$|^campfire$|_sign$|torch$|^bell$|glass|_pane$|lantern$|banner$)/;

/** True when the shell put something at this cell a fit-out must leave alone. */
function protectedAt(ctx: FitOutContext, x: number, y: number, z: number): boolean {
  const standing = ctx.blockAt(x, y, z);
  return standing !== undefined && PRESERVE.test(standing.block);
}

/** Re-clad the wall ring between two courses. `block` is a pure function of position. */
function reclad(
  ctx: FitOutContext,
  plan: NilePlan,
  yFrom: number,
  yTo: number,
  block: (x: number, y: number, z: number) => string,
): number {
  let n = 0;
  for (const cell of ringOf(plan.sx, plan.sz)) {
    for (let y = yFrom; y <= yTo; y++) {
      if (protectedAt(ctx, cell.x, y, cell.z)) continue;
      ctx.put(cell.x, y, cell.z, block(cell.x, y, cell.z));
      n++;
    }
  }
  return n;
}

/**
 * A deterministic small draw, keyed on whatever the caller hands it.
 *
 * There is no RNG in a {@link FitOutContext} and this file does not want one:
 * a position-derived integer hash is the idiom every earlier wave uses, it is
 * a pure function, and `Math.imul` is exactly specified where `Math.pow` is
 * not — which is why the mix uses it.
 */
function nileJitter(a: number, b: number, c: number, n: number): number {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = (h ^ (h >>> 13)) >>> 0;
  return h % n;
}

/**
 * **Ashlar** — the theme's own stone laid in courses rather than in a scatter.
 *
 * Dressed stone bands by course, and banding on `y` alone is what makes a
 * battered wall read as *dressed* rather than as rubble. This is the pack's
 * whole material story, and the reason rule 7 can refuse `mud` without losing
 * the mud-brick read: a `sun_clay` foundation palette laid in courses is
 * sandstone in bands, which is the thing itself.
 */
function ashlar(ctx: FitOutContext): (x: number, y: number, z: number) => string {
  const primary = ctx.style["foundation.primary"] as string;
  const accent = ctx.style["foundation.accent"] as string;
  return (_x, y, _z) => (y % 4 === 0 ? accent : primary);
}

/** The masonry mix a re-clad draws from, scattered rather than banded. */
function masonry(ctx: FitOutContext): (x: number, y: number, z: number) => string {
  const primary = ctx.style["foundation.primary"] as string;
  const accent = ctx.style["foundation.accent"] as string;
  return (x, y, z) => (nileJitter(x, y, z, 6) === 0 ? accent : primary);
}

/** Fill an inclusive rect at one Y, counting every cell. */
function deck(
  c: PropCounter,
  y: number,
  x0: number,
  x1: number,
  z0: number,
  z1: number,
  block: (x: number, z: number) => string,
): void {
  for (let z = z0; z <= z1; z++) {
    for (let x = x0; x <= x1; x++) c.raw(x, y, z, block(x, z));
  }
}

/**
 * Fill the ground course under an apron cell when the ground there is air.
 *
 * Wave 4B's cathedral lesson, restated: the apron is not always at `y = 1`,
 * and a colonnade post whose foot is air is a post standing on nothing.
 */
function footing(ctx: FitOutContext, c: PropCounter, x: number, z: number, block: string): void {
  if (ctx.blockAt(x, 0, z) === undefined) c.raw(x, 0, z, block);
}

/** A solid lid over the whole footprint at the roof's first course (rule 4). */
function lid(ctx: FitOutContext, c: PropCounter, plan: NilePlan): void {
  const block = ctx.style["foundation.accent"] as string;
  const solid = ctx.style["roof.solid"] as string;
  for (let z = 0; z < plan.sz; z++) {
    for (let x = 0; x < plan.sx; x++) {
      c.raw(x, plan.base, z, nileJitter(x, plan.base, z, 5) === 0 ? solid : block);
    }
  }
}

/**
 * **THE HANGER GUARD** — nothing this file writes may leave a hanging block
 * hanging from air.
 *
 * The sanctum pack's oldest note, restated as *code* rather than as a caution,
 * because a caution is a thing seven fit-outs each have to remember: the shell
 * hangs its lantern from the ceiling plane directly above it (`core.ts` writes
 * `floor.interior` over every interior cell at `wallTop` for exactly that
 * reason), and **every rebuild in this file deletes and re-lays the volume
 * over that plane.** The physics lint's `unsupported.chain` rule walks a
 * hanger's support upward and fails it the moment the cell above is air, and
 * "nothing above it to hang from" is a finding no reviewer can act on and no
 * render shows.
 *
 * So rather than each fit-out arguing that its own lid happens to land over
 * the lantern column, {@link furnishNile} runs this over the finished envelope
 * for all seven: every cell carrying a block with `hanging: "true"` gets the
 * ceiling material written over it if that cell came out empty. It is a
 * *closure*, not a fix — it holds for a hanger this pack never placed, at a
 * position no envelope in the test matrix produced, in a shape somebody adds
 * next year.
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

/** The middle column of the room — where the shell hangs its lantern. */
function lanternColumn(it: LocalRect): { readonly x: number; readonly z: number } {
  return { x: Math.floor((it.x0 + it.x1) / 2), z: Math.floor((it.z0 + it.z1) / 2) };
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

/** The end of the room furthest from the door, and the way a person looks at it. */
function farEnd(ctx: FitOutContext): { readonly z: number; readonly look: Cardinal } {
  const it = ctx.interior;
  const north = ctx.door === null ? true : ctx.door.z > (it.z0 + it.z1) / 2;
  return north ? { z: it.z0, look: "north" } : { z: it.z1, look: "south" };
}

/**
 * The tallest an interior column may be before it becomes a defect.
 *
 * Rule 5, as one function. The lint's band for a storey runs from the floor's
 * first air course to the course under the ceiling, so a column that reaches
 * the ceiling is `interior.blocked_column` — and Egypt is *nothing but*
 * columns, which makes this the single most load-bearing number in the file.
 * Two courses is the floor: a post shorter than a body does not read as a
 * column at all.
 */
function columnCap(ctx: FitOutContext): number {
  return Math.max(2, ctx.storyHeight - 2);
}

/**
 * A **papyrus column**: a banded shaft with a wider capital block on it.
 *
 * The pack's recurring interior read, and the one shape five of these seven
 * buildings want. It is capped by {@link columnCap} rather than by the
 * ceiling, it goes down through {@link PropCounter.put1} so the walkability
 * guard can refuse it outright, and the capital is the theme's accent so the
 * shaft reads as banded even in a palette with one stone in it.
 *
 * Returns whether it stood — a caller counting a colonnade wants to know.
 */
function papyrusColumn(ctx: FitOutContext, c: PropCounter, x: number, z: number): boolean {
  const shaft = ctx.style["foundation.primary"] as string;
  const capital = ctx.style["foundation.accent"] as string;
  if (!c.put1(x, z, shaft)) return false;
  const cap = columnCap(ctx);
  for (let y = 2; y < cap; y++) c.stack(x, z, y, shaft);
  if (cap >= 2) c.stack(x, z, cap, capital);
  return true;
}

/**
 * A **cavetto cornice** — the flared moulding that crowns every Egyptian wall.
 *
 * A ring of stairs at one course, each one facing *into* the building so its
 * high half stands over the wall it crowns and its low half oversails. A
 * stair's `facing` is the side its high half is on, which is the rule this
 * whole pack's cornices, ramps and steps are written against.
 *
 * Never written over the way in: an oversailing stair at head height on the
 * doorstep is a door a body cannot walk through.
 */
function cavetto(ctx: FitOutContext, c: PropCounter, plan: NilePlan, y: number): void {
  const stairs = ctx.style["stone.stairs"] as string;
  for (const cell of ringOf(plan.sx, plan.sz)) {
    if (onWayIn(ctx, cell.x, cell.z)) continue;
    if (protectedAt(ctx, cell.x, y, cell.z)) continue;
    const towards: Cardinal =
      cell.x === 0
        ? "east"
        : cell.x === plan.sx - 1
          ? "west"
          : cell.z === 0
            ? "south"
            : "north";
    c.raw(cell.x, y, cell.z, stairs, {
      facing: towards,
      half: "bottom",
      shape: "straight",
      waterlogged: "false",
    });
  }
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
export function furnishNile(ctx: FitOutContext): number {
  if (!isNileArchetype(ctx.archetype)) return 0;
  const c = new PropCounter(ctx);
  switch (ctx.archetype) {
    case "mastaba":
      fitMastaba(ctx, c);
      break;
    case "hypostyle_hall":
      fitHypostyleHall(ctx, c);
      break;
    case "mortuary_temple":
      fitMortuaryTemple(ctx, c);
      break;
    case "pylon_gate":
      fitPylonGate(ctx, c);
      break;
    case "nilometer":
      fitNilometer(ctx, c);
      break;
    case "mudbrick_granary":
      fitMudbrickGranary(ctx, c);
      break;
    case "canopic_shrine":
    default:
      fitCanopicShrine(ctx, c);
      break;
  }
  // Last, and for all seven: nothing above may have been taken out from over
  // a hanging block. See {@link guardHangers}.
  guardHangers(ctx, c);
  return c.n;
}

/* -------------------------------------------------------------------------- */
/* the mastaba                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * `mastaba` — the bench tomb, and the pack's cheapest sentence.
 *
 * The curator's note is three refusals and one feature: a battered blind
 * block, a flat top, **a false door on one face and a real one nowhere**. The
 * false door is the whole entry — it is the oldest Egyptian architectural
 * motif there is, a recessed panel of nested jambs that goes nowhere — and it
 * is what stops the shape reading as a shed with the windows bricked up.
 *
 * "A real one nowhere" is not literally buildable: the grammar's shell always
 * cuts a door, the walking agent starts at it, and a fit-out that bricked it
 * up would be a room nobody can reach. So the door stays, is left standable
 * and enterable, and the *false* door goes on the opposite face, which is
 * where a stranger walking round the block meets it.
 *
 * Outside: banded ashlar, an apron plinth at the foot so the block has a base,
 * a cavetto under the eave, and a flat capped top. Inside: a sarcophagus at
 * the far end with unlit candles either side of it.
 */
function fitMastaba(ctx: FitOutContext, c: PropCounter): void {
  const wall = wallPlan(ctx);
  const roof = roofPlan(ctx);
  const stone = ctx.style["foundation.primary"] as string;
  const accent = ctx.style["foundation.accent"] as string;

  if (wall !== null) {
    c.n += reclad(ctx, wall, 1, ctx.wallTop, ashlar(ctx));

    // --- the plinth ---------------------------------------------------------
    // A full apron course at the foot, so the block stands on a base rather
    // than sitting on the dirt. Grounded, because the apron is not always at
    // `y = 1`.
    for (const cell of apronOf(wall.sx, wall.sz)) {
      if (onWayIn(ctx, cell.x, cell.z)) continue;
      footing(ctx, c, cell.x, cell.z, stone);
      c.raw(cell.x, 1, cell.z, accent);
    }

    // --- the false door -----------------------------------------------------
    // On the face opposite the real one: a recessed panel of nested jambs,
    // three cells wide and as tall as the wall allows. Written as accent
    // against the primary band, which is what "recessed" can mean in a medium
    // with no depth to spare.
    const face = ctx.door === null ? "north" : opposite(ctx.door.face);
    const [fx, fz] = cardinalStep(face);
    const mid = { x: (wall.sx - 1) >> 1, z: (wall.sz - 1) >> 1 };
    const panelX = fx === 0 ? mid.x : fx > 0 ? wall.sx - 1 : 0;
    const panelZ = fz === 0 ? mid.z : fz > 0 ? wall.sz - 1 : 0;
    const along = fx === 0 ? [-1, 0, 1] : [0];
    const across = fz === 0 ? [-1, 0, 1] : [0];
    const height = Math.max(2, Math.min(4, ctx.wallTop - 1));
    for (const dx of along) {
      for (const dz of across) {
        const x = panelX + (fx === 0 ? dx : 0);
        const z = panelZ + (fz === 0 ? dz : 0);
        if (x < 0 || z < 0 || x >= wall.sx || z >= wall.sz) continue;
        for (let y = 1; y <= height; y++) {
          if (protectedAt(ctx, x, y, z)) continue;
          const jamb = dx === 0 && dz === 0;
          c.raw(x, y, z, jamb && y < height ? "chiseled_stone_bricks" : accent);
        }
      }
    }
  }

  if (roof !== null) {
    clearRoof(ctx, roof);
    lid(ctx, c, roof);
    // The cavetto sits on the lid, and the flat top on the course above it —
    // two solid courses, each standing on the one below, which is rule 3 in
    // the simplest shape the file has.
    cavetto(ctx, c, roof, roof.base + 1);
    if (roof.base + 2 <= roof.top) {
      const top = ashlar(ctx);
      deck(c, roof.base + 2, 1, roof.sx - 2, 1, roof.sz - 2, (x, z) => top(x, roof.base + 2, z));
    }
  }

  // --- the burial chamber ---------------------------------------------------
  const it = ctx.interior;
  const end = farEnd(ctx);
  const mid = Math.floor((it.x0 + it.x1) / 2);
  if (c.put1(mid, end.z, accent)) c.stack(mid, end.z, 2, "chiseled_stone_bricks");
  if (it.x0 !== mid) c.put1(it.x0, end.z, "white_candle", { candles: "2", lit: "false", waterlogged: "false" });
  if (it.x1 !== mid) c.put1(it.x1, end.z, "white_candle", { candles: "3", lit: "false", waterlogged: "false" });
  const lamp = lanternColumn(it);
  for (const z of [end.z + (end.look === "north" ? 2 : -2)]) {
    if (z < it.z0 || z > it.z1) continue;
    for (const x of [it.x0, it.x1]) {
      if (x === lamp.x && z === lamp.z) continue;
      c.put1(x, z, "decorated_pot", { waterlogged: "false" });
    }
  }
}

/* -------------------------------------------------------------------------- */
/* the hypostyle hall                                                          */
/* -------------------------------------------------------------------------- */

/**
 * `hypostyle_hall` — a forest of columns, and the clerestory the forest is for.
 *
 * The note names two things and they are one mechanism: columns on a grid,
 * with **the central aisle's taller than the rest** so a band of light opens
 * between the two roof levels. That is the type; a hall of equal columns is a
 * warehouse with pillars.
 *
 * So the fit-out builds:
 *
 * 1. **the forest** — a papyrus column on every other cell of the interior
 *    grid, skipping the aisle, the lantern column and the way in. Each one is
 *    capped short of the ceiling by {@link columnCap}, because a column that
 *    reaches the ceiling is a defect however handsome (rule 5), and each goes
 *    down through the walkability guard, so a column that would strand a
 *    corner simply is not placed;
 * 2. **the aisle** — the middle strip left clear, flanked by the two ranks
 *    that carry the raised roof;
 * 3. **the clerestory** — the roof rebuilt as two solid decks: the whole
 *    footprint at the first course, and the aisle strip again two courses
 *    higher, with the gap between them filled along the flanks by a solid
 *    course so the raised deck stands on masonry rather than on air. The band
 *    left open in the flanks *is* the clerestory, and the light in it is
 *    `glowstone` bedded in the raised deck's own edge — a full cube against a
 *    full cube, which is the lint's name rule met by construction.
 */
function fitHypostyleHall(ctx: FitOutContext, c: PropCounter): void {
  const wall = wallPlan(ctx);
  const roof = roofPlan(ctx);
  const it = ctx.interior;
  const lamp = lanternColumn(it);
  const aisle = Math.floor((it.x0 + it.x1) / 2);

  if (wall !== null) c.n += reclad(ctx, wall, 1, ctx.wallTop, ashlar(ctx));

  // --- the forest -----------------------------------------------------------
  let trees = 0;
  for (let z = it.z0 + 1; z <= it.z1 - 1; z += 2) {
    for (let x = it.x0 + 1; x <= it.x1 - 1; x += 2) {
      if (Math.abs(x - aisle) <= 1) continue;
      if (x === lamp.x && z === lamp.z) continue;
      if (onWayIn(ctx, x, z)) continue;
      if (papyrusColumn(ctx, c, x, z)) trees++;
    }
  }
  // The two ranks that flank the aisle, taller than the forest by their
  // capital: the pair of rows a walker reads the aisle by.
  for (let z = it.z0 + 1; z <= it.z1 - 1; z += 3) {
    for (const x of [aisle - 2, aisle + 2]) {
      if (x < it.x0 || x > it.x1) continue;
      if (x === lamp.x && z === lamp.z) continue;
      if (onWayIn(ctx, x, z)) continue;
      if (papyrusColumn(ctx, c, x, z)) trees++;
    }
  }
  // An offering table at the head of the aisle, so the walk down it ends
  // somewhere. Skipped when the forest refused to grow at all — an envelope
  // that tight is a room, not a hall.
  const end = farEnd(ctx);
  if (trees > 0) {
    if (c.put1(aisle, end.z, ctx.style["foundation.accent"] as string)) {
      c.stack(aisle, end.z, 2, "chiseled_stone_bricks");
    }
  }

  if (roof !== null) {
    clearRoof(ctx, roof);
    lid(ctx, c, roof);
    const stone = ashlar(ctx);
    const aisleLo = Math.max(0, aisle - 2);
    const aisleHi = Math.min(roof.sx - 1, aisle + 2);
    // The flanks of the raised deck: a solid course either side of the aisle
    // at the intermediate level, so the raised deck lands on masonry. Rule 3.
    const midY = roof.base + 1;
    if (midY <= roof.top) {
      deck(c, midY, aisleLo, aisleHi, 0, roof.sz - 1, (x, z) => stone(x, midY, z));
    }
    const highY = roof.base + 2;
    if (highY <= roof.top) {
      deck(c, highY, aisleLo, aisleHi, 0, roof.sz - 1, (x, z) => stone(x, highY, z));
      // The clerestory lights: bedded in the raised deck's own edge, every
      // fourth bay down both sides.
      for (let z = 1; z < roof.sz - 1; z += 4) {
        c.raw(aisleLo, highY, z, "glowstone");
        c.raw(aisleHi, highY, z, "glowstone");
      }
    }
  }
}

/* -------------------------------------------------------------------------- */
/* the mortuary temple                                                         */
/* -------------------------------------------------------------------------- */

/**
 * `mortuary_temple` — colonnaded storeys stepping back off a ramped axis.
 *
 * Deir el-Bahari, at catalog scale. The note asks for three things and the
 * fit-out spends its whole budget on them:
 *
 * 1. **the portico** — a rank of columns standing in the apron along the door
 *    face, each one footed at the ground course and carrying a lintel, which
 *    is what makes the front read as a *colonnade* rather than as a wall with
 *    a hole in it. Never across the way in: the doorstep is left clear, so the
 *    colonnade is a screen a body walks through rather than a fence;
 * 2. **the ramp** — the axis, as a run of stairs climbing the terrace face
 *    from the plinth. A stair's high half is its `facing`, so the run faces
 *    *away* from the door: a body climbing it is walking toward the building;
 * 3. **the terrace** — the roof rebuilt as two solid decks, the upper one
 *    stepped back on all four sides, with a rank of columns standing on the
 *    lower deck's margin. Solid per course, each deck standing on the one
 *    below, and the upper colonnade standing on the deck rather than on air.
 */
function fitMortuaryTemple(ctx: FitOutContext, c: PropCounter): void {
  const wall = wallPlan(ctx);
  const roof = roofPlan(ctx);
  const stone = ctx.style["foundation.primary"] as string;
  const accent = ctx.style["foundation.accent"] as string;

  if (wall !== null) {
    c.n += reclad(ctx, wall, 1, ctx.wallTop, ashlar(ctx));

    // --- the portico --------------------------------------------------------
    // Every other apron cell along the door's face, corners excluded. The
    // lintel is the course over the capital, which is what ties the rank into
    // one screen instead of a row of posts.
    const face = ctx.door === null ? "south" : ctx.door.face;
    const [fx, fz] = cardinalStep(face);
    const capY = Math.max(2, ctx.wallTop - 2);
    const rank: { x: number; z: number }[] = [];
    for (const cell of apronOf(wall.sx, wall.sz)) {
      const onFace =
        fx === 0
          ? cell.z === (fz > 0 ? wall.sz : -1) && cell.x >= 0 && cell.x < wall.sx
          : cell.x === (fx > 0 ? wall.sx : -1) && cell.z >= 0 && cell.z < wall.sz;
      if (!onFace) continue;
      const along = fx === 0 ? cell.x : cell.z;
      if (along % 2 !== 1) continue;
      if (onWayIn(ctx, cell.x, cell.z)) continue;
      rank.push(cell);
      footing(ctx, c, cell.x, cell.z, stone);
      for (let y = 1; y < capY; y++) c.raw(cell.x, y, cell.z, stone);
      c.raw(cell.x, capY, cell.z, accent);
    }
    // The lintel: one course over the capitals, bridging the whole rank. Each
    // cell of it sits directly on a capital or beside a lintel cell already
    // written, so nothing in it is isolated.
    if (rank.length > 1 && capY + 1 <= ctx.wallTop) {
      const lo = rank[0] as { x: number; z: number };
      const hi = rank[rank.length - 1] as { x: number; z: number };
      if (fx === 0) {
        for (let x = lo.x; x <= hi.x; x++) c.raw(x, capY + 1, lo.z, accent);
      } else {
        for (let z = lo.z; z <= hi.z; z++) c.raw(lo.x, capY + 1, z, accent);
      }
    }

    // --- the ramp -----------------------------------------------------------
    // On the axis, one cell to the side of the doorstep so the way in is never
    // painted: a stair on the plinth course climbing toward the building.
    const out = outsideDoor(ctx);
    if (out !== null) {
      const rampX = fx === 0 ? out.x + 1 : out.x;
      const rampZ = fx === 0 ? out.z : out.z + 1;
      if (!onWayIn(ctx, rampX, rampZ)) {
        footing(ctx, c, rampX, rampZ, stone);
        c.raw(rampX, 1, rampZ, ctx.style["stone.stairs"] as string, {
          facing: opposite(face),
          half: "bottom",
          shape: "straight",
          waterlogged: "false",
        });
      }
    }
  }

  if (roof !== null) {
    clearRoof(ctx, roof);
    lid(ctx, c, roof);
    const banded = ashlar(ctx);
    const upperY = roof.base + 1;
    if (upperY <= roof.top) {
      // The stepped-back storey: a solid deck inset two cells all round.
      const x0 = Math.min(2, (roof.sx - 1) >> 1);
      const z0 = Math.min(2, (roof.sz - 1) >> 1);
      deck(c, upperY, x0, roof.sx - 1 - x0, z0, roof.sz - 1 - z0, (x, z) => banded(x, upperY, z));
      // The upper colonnade: posts on the lower deck's margin, standing on the
      // lid under them and no taller than the allowance.
      const postTop = Math.min(roof.top, upperY + 1);
      for (let x = 1; x < roof.sx - 1; x += 3) {
        for (const z of [0, roof.sz - 1]) {
          for (let y = upperY; y <= postTop; y++) c.raw(x, y, z, y === postTop ? accent : stone);
        }
      }
    }
  }

  // --- the sanctuary --------------------------------------------------------
  const it = ctx.interior;
  const end = farEnd(ctx);
  const mid = Math.floor((it.x0 + it.x1) / 2);
  if (c.put1(mid, end.z, accent)) c.stack(mid, end.z, 2, "chiseled_stone_bricks");
  const lamp = lanternColumn(it);
  for (const x of [mid - 2, mid + 2]) {
    if (x < it.x0 || x > it.x1) continue;
    if (x === lamp.x && end.z === lamp.z) continue;
    papyrusColumn(ctx, c, x, end.z);
  }
}

/* -------------------------------------------------------------------------- */
/* the pylon gate                                                              */
/* -------------------------------------------------------------------------- */

/**
 * `pylon_gate` — two battered trapezoid towers over a lower door.
 *
 * The single most recognisable Egyptian *frontage* there is, and the one entry
 * in this pack whose whole read is a proportion: **the towers are tall, the
 * door between them is low, and the towers batter** — they lean in as they
 * rise. Get that and a stranger names it from two hundred blocks; miss it and
 * it is a gatehouse.
 *
 * The fit-out therefore:
 *
 * 1. **re-clads the wall in banded ashlar and battens the corners** — the
 *    four corner columns get the accent full height, which is the grooved pier
 *    a real pylon's corner torus is;
 * 2. **rebuilds the roof as two masses, not one.** Over each end of the door
 *    face a solid block climbs to the allowance, inset one cell per course, so
 *    the tower tapers; between them the lid alone, which is the low lintel
 *    band the door sits under. Every course is filled and stands on the course
 *    below (rule 3);
 * 3. **stands the banners in the grooves.** Four flagstaff recesses run up the
 *    face as accent stripes, and a standing banner tops the two that reach the
 *    tower. A banner is a fixture with a support rule, so it stands *on* the
 *    tower's own top course and never hangs off the face.
 *
 * Inside is a **passage**, not a room: a gate is a way through, so the fit-out
 * furnishes only the two flanking plinths and leaves the middle of the floor
 * to the walker.
 *
 * Catalog note: §3.8 lists this entry as `infrastructure` and it is realised
 * here as a **building** — it has a footprint, a door and a room, which is
 * what the building registry hosts, and it follows no route. The row's `kind`
 * is left as the curator wrote it, exactly as the careening beach before it.
 */
function fitPylonGate(ctx: FitOutContext, c: PropCounter): void {
  const wall = wallPlan(ctx);
  const roof = roofPlan(ctx);
  const stone = ctx.style["foundation.primary"] as string;
  const accent = ctx.style["foundation.accent"] as string;
  const face = ctx.door === null ? "south" : ctx.door.face;
  const [fx] = cardinalStep(face);
  /** True when the towers stand at the two ends of the X axis. */
  const alongX = fx === 0;

  if (wall !== null) {
    c.n += reclad(ctx, wall, 1, ctx.wallTop, ashlar(ctx));
    // The corner piers, and the flagstaff grooves beside them.
    for (const x of [0, wall.sx - 1]) {
      for (const z of [0, wall.sz - 1]) {
        for (let y = 1; y <= ctx.wallTop; y++) {
          if (protectedAt(ctx, x, y, z)) continue;
          c.raw(x, y, z, accent);
        }
      }
    }
    for (const cell of ringOf(wall.sx, wall.sz)) {
      const along = alongX ? cell.x : cell.z;
      if (along !== 2 && along !== (alongX ? wall.sx - 3 : wall.sz - 3)) continue;
      const onFrontOrBack = alongX
        ? cell.z === 0 || cell.z === wall.sz - 1
        : cell.x === 0 || cell.x === wall.sx - 1;
      if (!onFrontOrBack) continue;
      for (let y = 1; y <= ctx.wallTop; y++) {
        if (protectedAt(ctx, cell.x, y, cell.z)) continue;
        c.raw(cell.x, y, cell.z, "chiseled_stone_bricks");
      }
    }
  }

  if (roof !== null) {
    clearRoof(ctx, roof);
    lid(ctx, c, roof);
    const banded = ashlar(ctx);
    /** How deep into the plan a tower reaches, from its own end. */
    const span = Math.max(2, Math.min(4, ((alongX ? roof.sx : roof.sz) - 1) >> 1));
    /** The plan across the gate — the axis the door looks along. */
    const cross = alongX ? roof.sz : roof.sx;
    // The towers climb to one course short of the allowance, leaving that
    // course for the banner: a standing banner needs a floor under it, and the
    // floor is the tower's own crown.
    const crownY = roof.top - 1;
    for (const end of [0, 1]) {
      let last: { x: number; z: number } | null = null;
      for (let y = roof.base + 1; y <= crownY; y++) {
        const k = y - roof.base - 1;
        // The batter: one cell in every two courses, on both edges, and never
        // so far in that the tower vanishes. A trapezoid, not a spike.
        const t = Math.min(k >> 1, (span - 1) >> 1);
        const u = Math.min(k >> 1, (cross - 1) >> 1);
        const lo = t;
        const hi = span - 1 - t;
        if (lo > hi) break;
        const x0 = alongX ? (end === 0 ? lo : roof.sx - span) : u;
        const x1 = alongX ? (end === 0 ? hi : roof.sx - 1 - lo) : roof.sx - 1 - u;
        const z0 = alongX ? u : end === 0 ? lo : roof.sz - span;
        const z1 = alongX ? roof.sz - 1 - u : end === 0 ? hi : roof.sz - 1 - lo;
        if (x0 > x1 || z0 > z1) break;
        deck(c, y, x0, x1, z0, z1, (x, z) => banded(x, y, z));
        last = { x: (x0 + x1) >> 1, z: (z0 + z1) >> 1 };
      }
      // The banner in the flagstaff groove, standing on the crown it belongs
      // to. `rotation: 8` is south-facing, which is the gate's own front.
      if (last !== null && crownY + 1 <= roof.top) {
        c.raw(last.x, crownY + 1, last.z, "white_banner", { rotation: "8" });
      }
    }
  }

  // --- the passage ----------------------------------------------------------
  // Two flanking plinths against the walls and nothing at all down the middle:
  // a gate's floor belongs to whoever is walking through it.
  const it = ctx.interior;
  const end = farEnd(ctx);
  const lamp = lanternColumn(it);
  for (const x of [it.x0, it.x1]) {
    for (const z of [end.z]) {
      if (x === lamp.x && z === lamp.z) continue;
      if (onWayIn(ctx, x, z)) continue;
      if (c.put1(x, z, stone)) c.stack(x, z, 2, "chiseled_stone_bricks");
    }
  }
}

/* -------------------------------------------------------------------------- */
/* the nilometer                                                               */
/* -------------------------------------------------------------------------- */

/**
 * `nilometer` — the gauge the whole year's taxation was read off.
 *
 * The note asks for a stepped shaft down to river level with a graduated
 * column in it and a covered head at the top. The shaft is the one part this
 * grammar cannot literally build — a building's floor plane is `y = 0` and
 * there is nothing under it to dig into — so the fit-out builds the three
 * parts a walker can actually read:
 *
 * 1. **the graduated column**, standing on the floor at the far end: courses
 *    of the theme's stone with an accent band at every second course, capped
 *    short of the ceiling by {@link columnCap} (rule 5). The banding *is* the
 *    graduation, and it is the reason this building is not a well house;
 * 2. **the steps**, a flight of stairs turning down around the gauge, each one
 *    standable, each one facing outward so its high half is the riser a body
 *    steps off;
 * 3. **the covered head**, a kiosk rebuilt over the roof: a solid deck, a
 *    ring of piers on it and a second deck on the piers, so the gauge is
 *    roofed but the head is open — which is what a *covered* head means and a
 *    sealed box does not.
 *
 * The water is a `cauldron` at the gauge's foot: a full basin, on the floor,
 * a block a body walks round rather than falls into.
 */
function fitNilometer(ctx: FitOutContext, c: PropCounter): void {
  const wall = wallPlan(ctx);
  const roof = roofPlan(ctx);
  const stone = ctx.style["foundation.primary"] as string;
  const accent = ctx.style["foundation.accent"] as string;

  if (wall !== null) c.n += reclad(ctx, wall, 1, ctx.wallTop, ashlar(ctx));

  const it = ctx.interior;
  const end = farEnd(ctx);
  const lamp = lanternColumn(it);
  const gx = Math.floor((it.x0 + it.x1) / 2);
  const gz = end.z;

  // --- the gauge ------------------------------------------------------------
  if (!(gx === lamp.x && gz === lamp.z) && c.put1(gx, gz, accent)) {
    const cap = columnCap(ctx);
    for (let y = 2; y <= cap; y++) c.stack(gx, gz, y, y % 2 === 0 ? accent : stone);
  }

  // --- the steps down -------------------------------------------------------
  // A flight beside the gauge, one tread per cell, each facing away from the
  // gauge so a body steps *down* toward the water as it comes in.
  const stairs = ctx.style["stone.stairs"] as string;
  const inward: Cardinal = end.look;
  for (const [i, x] of [gx - 1, gx + 1].entries()) {
    if (x < it.x0 || x > it.x1) continue;
    if (x === lamp.x && gz === lamp.z) continue;
    c.put1(x, gz, stairs, {
      facing: i === 0 ? inward : opposite(inward),
      half: "bottom",
      shape: "straight",
      waterlogged: "false",
    });
  }

  // --- the water ------------------------------------------------------------
  // The basin at the gauge's foot, in the first cell the walkability guard
  // will actually take: `put1` refuses a cell in the door, stair or hearth
  // reserve, and a nilometer with no water in it is a chimney with stripes.
  const step = end.look === "north" ? 1 : -1;
  for (const [wx, wz] of [
    [gx, gz + step],
    [gx - 1, gz + step],
    [gx + 1, gz + step],
    [gx, gz + step * 2],
  ] as const) {
    if (wx < it.x0 || wx > it.x1 || wz < it.z0 || wz > it.z1) continue;
    if (wx === lamp.x && wz === lamp.z) continue;
    if (c.put1(wx, wz, "cauldron")) break;
  }

  if (roof !== null) {
    clearRoof(ctx, roof);
    lid(ctx, c, roof);
    const banded = ashlar(ctx);
    const midY = roof.base + 1;
    const topY = roof.base + 2;
    // The kiosk: piers on the lid, a deck on the piers. The piers are written
    // at every corner of an inset rect, so each one stands on the lid and the
    // deck above stands on them.
    const x0 = Math.min(2, (roof.sx - 1) >> 1);
    const z0 = Math.min(2, (roof.sz - 1) >> 1);
    const x1 = roof.sx - 1 - x0;
    const z1 = roof.sz - 1 - z0;
    if (midY <= roof.top && x0 < x1 && z0 < z1) {
      for (const x of [x0, x1]) {
        for (const z of [z0, z1]) c.raw(x, midY, z, accent);
      }
      if (topY <= roof.top) deck(c, topY, x0, x1, z0, z1, (x, z) => banded(x, topY, z));
    }
  }
}

/* -------------------------------------------------------------------------- */
/* the beehive granary                                                         */
/* -------------------------------------------------------------------------- */

/**
 * `mudbrick_granary` — corbelled domes in a row on a shared plinth.
 *
 * The most *village* thing in the pack and the one that will actually
 * saturate a Nile settlement: four or five mud domes in a line, filled from a
 * hatch at the crown and drawn from a hole at the foot. Everybody has seen it
 * and nobody can name it, which is exactly what a fabric piece should be.
 *
 * The domes are the roof rebuild: over the shared lid, each dome is a stack of
 * **filled discs** on an integer radius test — filled, not rung, because a
 * corbelled ring is a floating ring by another name (rule 3) — closing on a
 * crown with the filling hatch in it. The draw hole is a trapdoor low on the
 * wall, hinged to the masonry beside it.
 *
 * Rule 8 is at its sharpest here: the obvious block is `mud`, and `mud` is
 * fifteen sixteenths of a cube. Everything below is the theme's own stone.
 */
function fitMudbrickGranary(ctx: FitOutContext, c: PropCounter): void {
  const wall = wallPlan(ctx);
  const roof = roofPlan(ctx);
  const stone = ctx.style["foundation.primary"] as string;

  if (wall !== null) {
    c.n += reclad(ctx, wall, 1, ctx.wallTop, masonry(ctx));
    // The shared plinth: an apron course at the foot, grounded.
    for (const cell of apronOf(wall.sx, wall.sz)) {
      if (onWayIn(ctx, cell.x, cell.z)) continue;
      footing(ctx, c, cell.x, cell.z, stone);
      c.raw(cell.x, 1, cell.z, stone);
    }
    // The draw hole: a trapdoor low on the face beside the door, hinged on the
    // masonry it is written against.
    if (ctx.door !== null) {
      const [dx, dz] = cardinalStep(ctx.door.face);
      const hx = ctx.door.x + (dx === 0 ? 2 : 0);
      const hz = ctx.door.z + (dz === 0 ? 2 : 0);
      if (hx >= 0 && hz >= 0 && hx < wall.sx && hz < wall.sz && !onWayIn(ctx, hx, hz)) {
        c.raw(hx, 1, hz, ctx.style["wall.trapdoor"] as string, {
          facing: ctx.door.face,
          half: "bottom",
          open: "false",
          powered: "false",
          waterlogged: "false",
        });
      }
    }
  }

  if (roof !== null) {
    clearRoof(ctx, roof);
    lid(ctx, c, roof);
    const banded = ashlar(ctx);
    /** The dome's radius: as big as the plan allows, and never more than 3. */
    const r = Math.max(1, Math.min(3, ((Math.min(roof.sx, roof.sz) - 1) >> 1) - 1));
    const rows = Math.max(1, Math.floor((roof.sx - 2) / (2 * r + 2)));
    for (let i = 0; i < rows; i++) {
      const cx = r + 1 + i * (2 * r + 2);
      const cz = (roof.sz - 1) >> 1;
      if (cx + r > roof.sx - 1) break;
      let crown = roof.base;
      for (let y = roof.base + 1; y <= roof.top; y++) {
        const k = y - roof.base - 1;
        const rr = r - k;
        if (rr < 0) break;
        // A FILLED disc, drawn from squared integers — no transcendentals.
        for (let dz = -rr; dz <= rr; dz++) {
          for (let dx = -rr; dx <= rr; dx++) {
            if (dx * dx + dz * dz > rr * rr + rr) continue;
            const x = cx + dx;
            const z = cz + dz;
            if (x < 0 || z < 0 || x > roof.sx - 1 || z > roof.sz - 1) continue;
            c.raw(x, y, z, banded(x, y, z));
          }
        }
        crown = y;
      }
      // The filling hatch, in the crown: a trapdoor lying on the dome's top.
      if (crown > roof.base) {
        c.raw(cx, crown, cz, ctx.style["wall.trapdoor"] as string, {
          facing: "north",
          half: "top",
          open: "false",
          powered: "false",
          waterlogged: "false",
        });
      }
    }
  }

  // --- the store ------------------------------------------------------------
  const it = ctx.interior;
  const lamp = lanternColumn(it);
  for (let z = it.z0; z <= it.z1; z += 2) {
    for (const x of [it.x0, it.x1]) {
      if (x === lamp.x && z === lamp.z) continue;
      if (onWayIn(ctx, x, z)) continue;
      c.put1(x, z, "hay_block", { axis: "y" });
    }
  }
  const end = farEnd(ctx);
  const mid = Math.floor((it.x0 + it.x1) / 2);
  if (!(mid === lamp.x && end.z === lamp.z)) c.put1(mid, end.z, "barrel", { facing: "up", open: "false" });
}

/* -------------------------------------------------------------------------- */
/* the shrine chapel                                                           */
/* -------------------------------------------------------------------------- */

/**
 * `canopic_shrine` — the smallest thing here and the most precisely specified.
 *
 * The curator's note is a claim about *mouldings*: a cavetto cornice and a
 * torus roll at every corner are **the two profiles that make a block read as
 * Egyptian**, and everything else about this chapel is a small chapel. So the
 * fit-out spends everything on those two:
 *
 * - **the torus roll** — the four corner columns re-clad as a `stone.wall`
 *   run from the plinth to the cornice. A wall block is a *round* post in this
 *   medium, it is not a full cube so it never floats, and it is the closest
 *   the block table gets to a bundled reed roll;
 * - **the cavetto** — {@link cavetto} at the eave, the same flared ring the
 *   mastaba wears, never written over the way in.
 *
 * Inside: an offering table, unlit candles, and a canopic set — four decorated
 * pots on the far wall, which is the entry's own name made literal.
 */
function fitCanopicShrine(ctx: FitOutContext, c: PropCounter): void {
  const wall = wallPlan(ctx);
  const roof = roofPlan(ctx);
  const accent = ctx.style["foundation.accent"] as string;

  if (wall !== null) {
    c.n += reclad(ctx, wall, 1, ctx.wallTop, ashlar(ctx));
    // The torus rolls, corner by corner.
    const roll = ctx.style["stone.wall"] as string;
    for (const x of [0, wall.sx - 1]) {
      for (const z of [0, wall.sz - 1]) {
        for (let y = 1; y <= ctx.wallTop; y++) {
          if (protectedAt(ctx, x, y, z)) continue;
          c.raw(x, y, z, roll, {
            north: "none",
            south: "none",
            east: "none",
            west: "none",
            up: "true",
            waterlogged: "false",
          });
        }
      }
    }
  }

  if (roof !== null) {
    clearRoof(ctx, roof);
    lid(ctx, c, roof);
    cavetto(ctx, c, roof, roof.base + 1);
    if (roof.base + 2 <= roof.top) {
      const top = ashlar(ctx);
      deck(c, roof.base + 2, 1, roof.sx - 2, 1, roof.sz - 2, (x, z) => top(x, roof.base + 2, z));
    }
  }

  // --- the chapel -----------------------------------------------------------
  const it = ctx.interior;
  const end = farEnd(ctx);
  const lamp = lanternColumn(it);
  const mid = Math.floor((it.x0 + it.x1) / 2);
  if (!(mid === lamp.x && end.z === lamp.z) && c.put1(mid, end.z, accent)) {
    c.stack(mid, end.z, 2, "chiseled_stone_bricks");
  }
  // The canopic four, along the far wall either side of the table.
  let set = 0;
  for (const x of [mid - 2, mid - 1, mid + 1, mid + 2]) {
    if (x < it.x0 || x > it.x1) continue;
    if (x === lamp.x && end.z === lamp.z) continue;
    if (c.put1(x, end.z, "decorated_pot", { waterlogged: "false" })) set++;
  }
  if (set === 0) {
    const near = end.z + (end.look === "north" ? 1 : -1);
    if (near >= it.z0 && near <= it.z1 && !(mid === lamp.x && near === lamp.z)) {
      c.put1(mid, near, "decorated_pot", { waterlogged: "false" });
    }
  }
  for (const [i, x] of [it.x0, it.x1].entries()) {
    const z = end.z + (end.look === "north" ? 2 : -2);
    if (z < it.z0 || z > it.z1) continue;
    if (x === lamp.x && z === lamp.z) continue;
    c.put1(x, z, "white_candle", { candles: `${i + 2}`, lit: "false", waterlogged: "false" });
  }
}
