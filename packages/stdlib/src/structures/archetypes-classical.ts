/**
 * The **classical Mediterranean pack**, first half — eleven buildings whose
 * whole point is their FORM.
 *
 * `docs/CATALOG-EXPANSION-v0.md` §3.1 exists because of one walk: the Troy
 * candidate came out in `sun_clay`, the palette did exactly what it promised,
 * and the city still read as a sandstone village — because the palette was
 * right and **every form was borrowed**. A medieval townhouse in sandstone is
 * a medieval townhouse. This file is the answer: the eleven shapes a prompt
 * that says Troy, Athens, Olympia or a Hellenist waterfront is actually asking
 * for.
 *
 * - **the agora and the street** — `stoa`, `peristyle_house`, `megaron`;
 * - **the sanctuary** — `propylaea`, `bouleuterion`, `peripteral_temple`,
 *   `tholos`, `sanctuary_treasury`;
 * - **the games and the crowd** — `palaestra`, `gymnasion`, `odeon`.
 *
 * `archetypes-sanctum.ts` is this file's direct parent and states the law it
 * obeys, so the law is not restated: an archetype is a **fit-out**, not a
 * second grammar. Everything here runs after the shape stages and writes into
 * the same cell map. Not one line of `core.ts` moves for any of it.
 *
 * ## The one thing this pack must get right
 *
 * **A colonnade has to read as a colonnade from the street.** Interior detail
 * is worth nothing at all here — nobody names a prompt from a barrel — so
 * every fit-out in this file spends its budget on the apron ring and on the
 * volume between the eave plate and `roofTop + `{@link ROOF_FLOURISH_RISE},
 * and furnishes the room with whatever is left. {@link colonnade} is the
 * single move eight of the eleven are built out of, which is deliberate: a
 * pack whose members share one silhouette grammar is a *style*, and a style is
 * what a stranger recognises.
 *
 * ## The rules, inherited whole from the sanctum pack
 *
 * 1. **Nothing leaves the envelope** — the footprint plus its one-block apron,
 *    and `roofTop + `{@link ROOF_FLOURISH_RISE} overhead.
 * 2. **The interior stays walkable**: every interior prop goes through
 *    {@link PropCounter}, which routes through the ground floor's own `free`
 *    and `take`.
 * 3. **Solid per course, never a ring per course** — a stepped mass built as a
 *    ring leaves each course's outer cells with six air faces, which is the
 *    floating rule exactly. Every rebuilt roof here is a solid deck, a solid
 *    inset course, or a column that reaches the deck.
 * 4. **A rebuilt roof starts with a lid**, because the room below needs a
 *    ceiling and everything above needs a floor.
 * 5. **An apron column stands on the actual ground** — {@link footing} fills
 *    `y = 0` where the shell left it empty.
 * 6. **A stair's `facing` is its backrest**, so a seat faces *away* from what
 *    its sitter looks at ({@link seat}).
 * 7. **No interior column runs floor to ceiling.** The physics lint calls that
 *    `interior.blocked_column` and it does not care that the column is a
 *    beautiful Doric one; the inner ranks here are the sanctum temple's — a
 *    base block with two courses stacked on it, which still reads as a post
 *    and leaves the head course air.
 * 8. **No transcendental maths** anywhere: the tholos's cone and the odeon's
 *    half-ring are integer distance tests, never a sine.
 * 9. No bare `flower_pot`, no sign blocks, no lit fire on an altar.
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
 * The eleven archetypes this file fits out, in catalog order.
 *
 * Spread into `BUILDING_ARCHETYPES` by `archetypes.ts` immediately after the
 * sanctum pack, and repeated in that order in the spec's `KNOWN_BUILDING_-
 * ARCHETYPES`, where the order is asserted.
 */
export const CLASSICAL_BUILDING_ARCHETYPES = [
  "stoa",
  "peristyle_house",
  "megaron",
  "propylaea",
  "bouleuterion",
  "peripteral_temple",
  "tholos",
  "sanctuary_treasury",
  "palaestra",
  "gymnasion",
  "odeon",
] as const;

/** One of the archetypes this file fits out. */
export type ClassicalBuildingArchetype = (typeof CLASSICAL_BUILDING_ARCHETYPES)[number];

/** True for an archetype this file answers to. */
export function isClassicalArchetype(value: string): value is ClassicalBuildingArchetype {
  return (CLASSICAL_BUILDING_ARCHETYPES as readonly string[]).includes(value);
}

/**
 * Tag → archetype, or `null` when nothing matches.
 *
 * Consulted immediately after the sanctum table and for the same reason it
 * sits where it does: both tables must stay *ahead* of the extended one, whose
 * `temple`/`shrine`/`chapel` claims are right and stay the church's.
 *
 * This pack's non-claims are as sharp as the sanctum's, and every one of them
 * is a word this file's buildings would love to have:
 *
 * - **`odeon` is not ours**, although the archetype id is. The sanctum table
 *   claimed the word for its `amphitheater` before this pack existed, and an
 *   id is not a vocabulary: a document that says `odeon` gets the open bowl,
 *   and the roofed one here answers to `odeion`, `music_hall` and
 *   `concert_hall`. Exactly the `temple` situation, one wave later;
 * - **`peristyle` is not ours** either — it reaches the sanctum's classical
 *   temple. The house here takes `peristyle_house`, `atrium_house` and
 *   `domus`, and leaves `courtyard`/`courtyard_house` to wave 4A's courtyard
 *   house, which is the same idea without the columns;
 * - **`gymnasium` is not ours**: it is the blitz wave's school gym. The
 *   gymnasion answers to `gymnasion` and `xystos`;
 * - **`colonnade` is deliberately unclaimed here** — it belongs to the
 *   pack's own free-standing colonnade, which is a sweep client rather than a
 *   building. The stoa takes `stoa` and `portico`;
 * - `temple` in every form stays where it was: bare `temple` is the church's,
 *   `classical_temple`/`greek_temple`/`parthenon` the sanctum's, and the
 *   peripteral one here takes only the words that name its *plan* —
 *   `peripteral_temple`, `peripteral`, `doric_temple`, `ionic_temple`;
 * - `treasury` on its own is left unclaimed: it is a room in a bank as often
 *   as it is a building in a sanctuary, and a fabric that put a votive
 *   miniature temple where a document asked for a vault would be worse than
 *   one that put a cottage there.
 */
export function classicalArchetypeOfTags(
  tags: readonly string[],
): ClassicalBuildingArchetype | null {
  const has = (t: string): boolean => tags.includes(t);
  if (has("stoa") || has("portico")) return "stoa";
  if (has("peristyle_house") || has("atrium_house") || has("domus")) return "peristyle_house";
  if (has("megaron") || has("anaktoron")) return "megaron";
  if (has("propylaea") || has("propylon") || has("sanctuary_gate")) return "propylaea";
  if (has("bouleuterion") || has("boule") || has("council_house")) return "bouleuterion";
  if (
    has("peripteral_temple") ||
    has("peripteral") ||
    has("doric_temple") ||
    has("ionic_temple")
  ) {
    return "peripteral_temple";
  }
  if (has("tholos") || has("round_temple") || has("rotunda")) return "tholos";
  if (has("sanctuary_treasury") || has("thesauros") || has("votive_treasury")) {
    return "sanctuary_treasury";
  }
  if (has("palaestra") || has("wrestling_school")) return "palaestra";
  if (has("gymnasion") || has("xystos")) return "gymnasion";
  if (has("odeion") || has("music_hall") || has("concert_hall")) return "odeon";
  return null;
}

/**
 * Facade tendencies for this file's archetypes.
 *
 * Same contract as every other wave's — defaults a caller merges, never
 * something applied over an explicit param. Three families:
 *
 * - **the blind ones.** A cella, a treasury and a house that turns its back on
 *   the street are all unbroken wall, so they ask for `windowRhythm: "none"`
 *   and get the ashlar the re-clad wants. That is half the classical read on
 *   its own: antiquity does not have a window rhythm, it has a colonnade;
 * - **the gabled ones** — everything that ends in a pediment keeps
 *   `roof: "gable"`, because a pediment is a gable-end move;
 * - **everything that rebuilds its roof** asks for `hip`, which leaves the
 *   most room between the eave plate and the allowance: the tholos's cone, the
 *   peristyle house's compluvium and the palaestra's open court are all built
 *   in exactly that gap.
 */
export function classicalFacadeDefaults(archetype: string): {
  readonly windowShape?: string;
  readonly windowRhythm?: string;
  readonly roof?: string;
} {
  switch (archetype) {
    // A stoa is a colonnade in front of a shop wall: the wall has no windows,
    // because the whole front of it is missing.
    case "stoa":
      return { windowShape: "single", windowRhythm: "none", roof: "gable" };
    case "peristyle_house":
      return { windowShape: "single", windowRhythm: "none", roof: "hip" };
    case "megaron":
      return { windowShape: "tall", windowRhythm: "sparse", roof: "gable" };
    case "propylaea":
      return { windowShape: "single", windowRhythm: "none", roof: "gable" };
    case "bouleuterion":
      return { windowShape: "mullion", windowRhythm: "sparse", roof: "hip" };
    case "peripteral_temple":
      return { windowShape: "tall", windowRhythm: "none", roof: "gable" };
    case "tholos":
      return { windowShape: "single", windowRhythm: "sparse", roof: "hip" };
    case "sanctuary_treasury":
      return { windowShape: "single", windowRhythm: "none", roof: "gable" };
    case "palaestra":
      return { windowShape: "single", windowRhythm: "sparse", roof: "hip" };
    case "gymnasion":
      return { windowShape: "single", windowRhythm: "sparse", roof: "hip" };
    case "odeon":
      return { windowShape: "mullion", windowRhythm: "sparse", roof: "hip" };
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
 * The sanctum pack's `SanctumPlan` in every respect, restated rather than
 * imported for the reason that wave restated wave 4B's: two packs are two
 * seams, and a shared private helper is a shared edit. The refusals are the
 * same — a **plain rect** only, and two courses of room over the plate before
 * a roof may be rebuilt.
 */
interface ClassicalPlan {
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
function wallPlan(ctx: FitOutContext): ClassicalPlan | null {
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
function roofPlan(ctx: FitOutContext): ClassicalPlan | null {
  const plan = wallPlan(ctx);
  if (plan === null) return null;
  return plan.top - plan.base < 2 ? null : plan;
}

/** Clear everything the shell built above the eave plate, apron included. */
function clearRoof(ctx: FitOutContext, plan: ClassicalPlan): void {
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
 * The sanctum pack's list unchanged: the way in, the way up, the fire, the
 * glass and anything the physics lint holds to a support rule. This file leans
 * on it harder than any earlier one, because three of its buildings *open*
 * their walls and must open them around the door rather than through it.
 */
const PRESERVE = /(_door$|^ladder$|^campfire$|_sign$|torch$|^bell$|glass|_pane$|lantern$|banner$)/;

/** True when the shell put something at this cell a fit-out must leave alone. */
function protectedAt(ctx: FitOutContext, x: number, y: number, z: number): boolean {
  const standing = ctx.blockAt(x, y, z);
  return standing !== undefined && PRESERVE.test(standing.block);
}

/**
 * True when a wall column carries anything a fit-out must leave alone.
 *
 * **A door is taller than its door block.** The cell-by-cell guard is not
 * enough for the two fit-outs here that *open* a wall: cutting the courses
 * over a door leaves the shell's little doorstep awning — a slab in the apron
 * at head height — hanging on nothing, which is the `floating.slab` rule
 * exactly, and it cost this pack a sweep. So an opened face skips the whole
 * column a protected block stands anywhere in: the door keeps its frame, and
 * the arcade goes round it.
 */
function columnProtected(ctx: FitOutContext, x: number, z: number): boolean {
  for (let y = 1; y <= ctx.wallTop; y++) if (protectedAt(ctx, x, y, z)) return true;
  return false;
}

/**
 * Re-clad the wall ring between two courses.
 *
 * `block` is a pure function of position, so opposite walls agree and the
 * result is deterministic without a draw.
 */
function reclad(
  ctx: FitOutContext,
  plan: ClassicalPlan,
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

/** The masonry mix the re-clads draw from — the shell's own stone palette. */
function masonry(ctx: FitOutContext): (x: number, y: number, z: number) => string {
  const primary = ctx.style["foundation.primary"] as string;
  const accent = ctx.style["foundation.accent"] as string;
  return (x, y, z) => ((x * 7 + y * 13 + z * 5) % 6 === 0 ? accent : primary);
}

/**
 * **Ashlar** — the same palette laid in courses rather than in a scatter.
 *
 * Dressed stone bands by course, and banding on `y` alone is what makes a
 * cella wall read as masonry rather than as rubble.
 */
function ashlar(ctx: FitOutContext): (x: number, y: number, z: number) => string {
  const primary = ctx.style["foundation.primary"] as string;
  const accent = ctx.style["foundation.accent"] as string;
  return (_x, y, _z) => (y % 4 === 0 ? accent : primary);
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
 * Wave 4B's cathedral lesson as a named function, and this pack's most-used
 * line: the apron is not always at `y = 1`, and a column whose foot is air is
 * a column standing on nothing.
 */
function footing(ctx: FitOutContext, c: PropCounter, x: number, z: number, block: string): void {
  if (ctx.blockAt(x, 0, z) === undefined) c.raw(x, 0, z, block);
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

/**
 * The end of the room furthest from the door, and the way a person looks at it.
 *
 * Every cult figure, speaker's floor and stage wall in this file is laid off
 * this, so a walker faces the thing the building is for on the way in.
 */
function farEnd(ctx: FitOutContext): { readonly z: number; readonly look: Cardinal } {
  const it = ctx.interior;
  const north = ctx.door === null ? true : ctx.door.z > (it.z0 + it.z1) / 2;
  return north ? { z: it.z0, look: "north" } : { z: it.z1, look: "south" };
}

/**
 * A seat that looks in direction `look`.
 *
 * THE STAIR-SEAT RULE: a stair's `facing` names the side its **high half**
 * stands on — the backrest — so a seat faces *away* from what its sitter looks
 * at. The bouleuterion and the odeon are both banks of these.
 */
function seat(look: Cardinal): Record<string, string> {
  return { facing: opposite(look), half: "bottom", shape: "straight" };
}

/** Unlit candles, the only light this file ever puts on an altar. */
const CANDLES = (n: number): Record<string, string> => ({
  candles: String(n),
  lit: "false",
  waterlogged: "false",
});

/* -------------------------------------------------------------------------- */
/* the colonnade                                                               */
/* -------------------------------------------------------------------------- */

/** Which apron faces a colonnade stands on. */
type Face = "north" | "south" | "east" | "west";

/** Every face — the peripteral case, and the palaestra's. */
const ALL_FACES: readonly Face[] = ["north", "south", "east", "west"];

/** The faces an apron cell lies on: a corner lies on two. */
function facesOf(plan: ClassicalPlan, x: number, z: number): readonly Face[] {
  const out: Face[] = [];
  if (x === -1) out.push("west");
  if (x === plan.sx) out.push("east");
  if (z === -1) out.push("north");
  if (z === plan.sz) out.push("south");
  return out;
}

/**
 * The **stylobate**: the step a classical building stands on.
 *
 * The apron's ground course, filled wherever the shell left it empty, plus
 * `courses` further full courses on top of it. Two courses is a crepidoma and
 * reads as a temple platform; one is a plain step. Without it a colonnade
 * grows out of the dirt, which is the single thing that most makes a columned
 * building look like a shed with poles round it.
 */
function stylobate(ctx: FitOutContext, c: PropCounter, plan: ClassicalPlan, courses = 0): void {
  const step = ctx.style["foundation.accent"] as string;
  for (const cell of apronOf(plan.sx, plan.sz)) {
    if (onWayIn(ctx, cell.x, cell.z)) continue;
    footing(ctx, c, cell.x, cell.z, step);
    for (let k = 1; k <= courses; k++) c.raw(cell.x, k, cell.z, step);
  }
}

/**
 * The **colonnade** — this pack's one move, and the reason it is a pack.
 *
 * Columns stand in the apron of the chosen faces, at `interval` bays, corners
 * always; each rises from the stylobate to one course under the eave plate.
 * Over them goes the **entablature**: an unbroken band of full blocks along
 * the whole of every chosen face at the plate course, which is what makes the
 * bays between columns read as lintels rather than as gaps. That band is also
 * why nothing here floats — a bay cell hangs off its two neighbours, which is
 * exactly what a lintel is.
 *
 * The doorstep bay is always left open. A porch a walker can get through is
 * worth more than a symmetry nobody counts.
 *
 * @param banded lay the entablature in two colours, alternating along its run
 *   — the triglyph read, which the peripteral temple wants and a plain stoa
 *   does not.
 */
function colonnade(
  ctx: FitOutContext,
  c: PropCounter,
  plan: ClassicalPlan,
  faces: readonly Face[],
  interval = 2,
  banded = false,
): void {
  const drum = ctx.style["foundation.primary"] as string;
  const beam = ctx.style["foundation.accent"] as string;
  const colTop = Math.max(1, ctx.wallTop - 1);
  const wanted = new Set<Face>(faces);
  for (const cell of apronOf(plan.sx, plan.sz)) {
    if (onWayIn(ctx, cell.x, cell.z)) continue;
    const on = facesOf(plan, cell.x, cell.z);
    if (!on.some((f) => wanted.has(f))) continue;
    footing(ctx, c, cell.x, cell.z, drum);
    // Counted along the side the column stands on, so the two flanks agree
    // with each other; a corner always carries one, because a colonnade that
    // stops short of its corner is a row of poles.
    const corner = on.length > 1;
    const along = (on.includes("west") || on.includes("east") ? cell.z : cell.x) + 1;
    if (!corner && along % interval !== 0) continue;
    for (let y = 1; y <= colTop; y++) c.raw(cell.x, y, cell.z, drum);
  }
  for (const cell of apronOf(plan.sx, plan.sz)) {
    if (onWayIn(ctx, cell.x, cell.z)) continue;
    const on = facesOf(plan, cell.x, cell.z);
    if (!on.some((f) => wanted.has(f))) continue;
    const along = on.includes("west") || on.includes("east") ? cell.z : cell.x;
    c.raw(
      cell.x,
      ctx.wallTop,
      cell.z,
      banded && ((along % 2) + 2) % 2 === 0 ? (ctx.style["stone.slab"] as string) : beam,
      banded && ((along % 2) + 2) % 2 === 0 ? { type: "double", waterlogged: "false" } : undefined,
    );
  }
}

/**
 * Open a wall face into an arcade, leaving the shell's corners standing.
 *
 * The stoa's front and the propylaea's passage. Cells at `interval` bays keep
 * a full column of masonry from the floor to the plate; everything between
 * them is taken out from `y = 1` to one under the plate, so a walker can step
 * straight through the face and the room behind it is a portico rather than a
 * shed. The corners are never touched — they carry the shell's own roof — and
 * neither is anything {@link PRESERVE} names, which is how the door survives
 * standing in the middle of an opened wall.
 */
function openFace(
  ctx: FitOutContext,
  c: PropCounter,
  plan: ClassicalPlan,
  face: Face,
  interval = 2,
): void {
  const drum = ctx.style["foundation.primary"] as string;
  const beam = ctx.style["foundation.accent"] as string;
  const along = face === "north" || face === "south";
  const fixed = face === "north" ? 0 : face === "south" ? plan.sz - 1 : face === "west" ? 0 : plan.sx - 1;
  const span = along ? plan.sx : plan.sz;
  for (let i = 1; i <= span - 2; i++) {
    const x = along ? i : fixed;
    const z = along ? fixed : i;
    const post = (i + 1) % interval === 0;
    if (columnProtected(ctx, x, z)) {
      c.raw(x, ctx.wallTop, z, beam);
      continue;
    }
    for (let y = 1; y < ctx.wallTop; y++) c.raw(x, y, z, post ? drum : "air");
    // The lintel over the whole run, post or bay: the plate course is what the
    // shell's roof lands on, and a face opened without one is a roof over air.
    c.raw(x, ctx.wallTop, z, beam);
  }
}

/**
 * The solid lid a rebuilt roof always starts with — a ceiling, and a floor.
 */
function lid(ctx: FitOutContext, c: PropCounter, plan: ClassicalPlan): void {
  const stone = ashlar(ctx);
  deck(c, plan.base, 0, plan.sx - 1, 0, plan.sz - 1, (x, z) => stone(x, plan.base, z));
}

/**
 * A flat roof deck with a **hole in the middle of it** and a parapet round the
 * rim.
 *
 * The compluvium — the one move that says "this house is built round a court"
 * from outside as well as in. Three of this file's buildings are the same
 * idea at three scales (a house, a palaestra, a gymnasion), so it is one
 * function: lay the deck everywhere except the court, then stand one course of
 * parapet on the outer rim and one on the court's own rim, both of which have
 * the deck under them and therefore stand on something.
 *
 * @returns the court rect actually opened, in footprint coordinates.
 */
function courtDeck(
  ctx: FitOutContext,
  c: PropCounter,
  plan: ClassicalPlan,
  court: LocalRect,
): LocalRect {
  const stone = ashlar(ctx);
  const inCourt = (x: number, z: number): boolean =>
    x >= court.x0 && x <= court.x1 && z >= court.z0 && z <= court.z1;
  for (let z = 0; z < plan.sz; z++) {
    for (let x = 0; x < plan.sx; x++) {
      if (inCourt(x, z)) continue;
      c.raw(x, plan.base, z, stone(x, plan.base, z));
    }
  }
  if (plan.base + 1 <= plan.top) {
    const rail = ctx.style["stone.wall"] as string;
    for (const cell of ringOf(plan.sx, plan.sz)) {
      c.raw(cell.x, plan.base + 1, cell.z, rail, { waterlogged: "false" });
    }
    // The court's own rim, one cell outside the hole: a gutter lip, and the
    // thing that stops the roof reading as a plain slab with a dent in it.
    const slabBlock = ctx.style["stone.slab"] as string;
    for (let z = court.z0 - 1; z <= court.z1 + 1; z++) {
      for (let x = court.x0 - 1; x <= court.x1 + 1; x++) {
        if (inCourt(x, z)) continue;
        if (x < 1 || z < 1 || x > plan.sx - 2 || z > plan.sz - 2) continue;
        c.raw(x, plan.base + 1, z, slabBlock, { type: "bottom", waterlogged: "false" });
      }
    }
  }
  return court;
}

/**
 * An **inner rank of posts**: a base block with two courses stacked on it.
 *
 * The sanctum temple's inner colonnade, promoted to a helper because five
 * buildings here want it. Deliberately *not* a full-height column: the physics
 * lint's `interior.blocked_column` rule fails a cell that is solid from floor
 * to ceiling however handsome it is, and a two-course post with air over its
 * head still reads as a post from the door. `put1` carries the walkability
 * guard, so a post that would strand part of the room simply is not placed.
 */
function post(ctx: FitOutContext, c: PropCounter, x: number, z: number): boolean {
  if (!c.put1(x, z, ctx.style["foundation.primary"] as string)) return false;
  c.stack(x, z, 2, ctx.style["foundation.accent"] as string);
  return true;
}

/**
 * The cult group a temple, a treasury and a tholos all end on.
 *
 * A dressed plinth with a block-built figure on it and unlit candles either
 * side. The figure is a *block* rather than a head or an armour stand: this
 * grammar has no entities and no block entities to spend here.
 */
function cultFigure(ctx: FitOutContext, c: PropCounter, x: number, z: number): void {
  const it = ctx.interior;
  if (c.put1(x, z, "chiseled_stone_bricks")) {
    c.stack(x, z, 2, ctx.style["foundation.accent"] as string);
  }
  if (x - 1 >= it.x0) c.put1(x - 1, z, "white_candle", CANDLES(3));
  if (x + 1 <= it.x1) c.put1(x + 1, z, "white_candle", CANDLES(2));
}

/**
 * A **pediment**: the roof rebuilt as a mass that insets in one axis only.
 *
 * Solid per course, because a stepped shell hangs its steps on nothing. The
 * inset runs in `x`, so the ridge runs the length of the building and each
 * **short face** is the triangle everybody means by a classical temple — which
 * is the face the door is on, because `core.ts` puts the door on a z face.
 * A slab cornice goes in the apron at the eave course, standing on the
 * entablature the colonnade has already carried.
 */
function pediment(ctx: FitOutContext, c: PropCounter, plan: ClassicalPlan): void {
  const stone = ashlar(ctx);
  for (let y = plan.base; y <= plan.top; y++) {
    const k = y - plan.base;
    const x0 = k;
    const x1 = plan.sx - 1 - k;
    if (x0 > x1) break;
    deck(c, y, x0, x1, 0, plan.sz - 1, (x, z) => stone(x, y, z));
  }
  const slabBlock = ctx.style["stone.slab"] as string;
  for (const cell of apronOf(plan.sx, plan.sz)) {
    if (onWayIn(ctx, cell.x, cell.z)) continue;
    c.raw(cell.x, plan.base, cell.z, slabBlock, { type: "bottom", waterlogged: "false" });
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
export function furnishClassical(ctx: FitOutContext): number {
  if (!isClassicalArchetype(ctx.archetype)) return 0;
  const c = new PropCounter(ctx);
  switch (ctx.archetype) {
    case "stoa":
      fitStoa(ctx, c);
      break;
    case "peristyle_house":
      fitPeristyleHouse(ctx, c);
      break;
    case "megaron":
      fitMegaron(ctx, c);
      break;
    case "propylaea":
      fitPropylaea(ctx, c);
      break;
    case "bouleuterion":
      fitBouleuterion(ctx, c);
      break;
    case "peripteral_temple":
      fitPeripteralTemple(ctx, c);
      break;
    case "tholos":
      fitTholos(ctx, c);
      break;
    case "sanctuary_treasury":
      fitTreasury(ctx, c);
      break;
    case "palaestra":
      fitPalaestra(ctx, c);
      break;
    case "gymnasion":
      fitGymnasion(ctx, c);
      break;
    case "odeon":
    default:
      fitOdeon(ctx, c);
      break;
  }
  return c.n;
}

/* -------------------------------------------------------------------------- */
/* the agora and the street                                                    */
/* -------------------------------------------------------------------------- */

/** The long face a stoa opens: the door's, so the colonnade faces the square. */
function doorFace(ctx: FitOutContext, plan: ClassicalPlan): Face {
  if (ctx.door === null) return "south";
  if (ctx.door.z === 0) return "north";
  if (ctx.door.z === plan.sz - 1) return "south";
  if (ctx.door.x === 0) return "west";
  if (ctx.door.x === plan.sx - 1) return "east";
  return "south";
}

/**
 * `stoa` — the agora's long side, and the pack's headline street form.
 *
 * **Two ranks deep**, which is the whole point and the thing a one-rank porch
 * cannot say:
 *
 * - the **outer rank** stands in the apron of the door's face, on a stylobate
 *   step, under a continuous entablature;
 * - the **inner rank** is the wall itself: that face is opened into an arcade
 *   by {@link openFace}, so alternate bays are columns and the rest is walked
 *   straight through. Between the two ranks is a covered walk one cell wide —
 *   a real portico, at the scale the envelope has;
 * - the **back** stays a closed shop wall in ashlar, with a counter of barrels
 *   and shelving along it. That is the note's whole sentence: the street face
 *   is columns and the back is trade.
 */
function fitStoa(ctx: FitOutContext, c: PropCounter): void {
  const wall = wallPlan(ctx);
  const it = ctx.interior;
  if (wall !== null) {
    c.n += reclad(ctx, wall, 1, ctx.wallTop, ashlar(ctx));
    const front = doorFace(ctx, wall);
    stylobate(ctx, c, wall, 0);
    openFace(ctx, c, wall, front);
    colonnade(ctx, c, wall, [front]);
  }

  // The trade behind the columns: a counter along the wall furthest from the
  // opened face, and shelving over it.
  const end = farEnd(ctx);
  const lamp = lanternColumn(it);
  const slabBlock = ctx.style["stone.slab"] as string;
  for (let x = it.x0; x <= it.x1; x++) {
    if (x === lamp.x && end.z === lamp.z) continue;
    if ((x - it.x0) % 3 === 2) {
      c.put1(x, end.z, "barrel", { facing: "up", open: "false" });
      continue;
    }
    if (c.put1(x, end.z, ctx.style["foundation.accent"] as string)) {
      c.stack(x, end.z, 2, slabBlock, { type: "bottom", waterlogged: "false" });
    }
  }
  // The inner rank, indoors: posts down the middle of the walk, on the bays
  // the outer colonnade uses, so the two ranks line up from the street.
  for (let x = it.x0 + 1; x <= it.x1 - 1; x += 2) {
    const z = end.z === it.z0 ? it.z1 : it.z0;
    if (x === lamp.x && z === lamp.z) continue;
    post(ctx, c, x, z);
  }
  c.put1(it.x0, end.z === it.z0 ? it.z1 : it.z0, pottedAt(it.x0, it.z1));
}

/**
 * `peristyle_house` — the courtyard house with its court *colonnaded*.
 *
 * The read is inside-out and it is the reason the pack has a house at all: a
 * classical house turns a blind wall to the street (`windowRhythm: "none"`)
 * and puts everything it has round a court in the middle. So:
 *
 * - the roof comes off and goes back as a **flat deck with a square hole in
 *   it** — the compluvium — with a parapet on the outer rim and a slab lip
 *   round the court. From the street that is a low blank block with a
 *   parapet, which is exactly right, and from the door it is a room open to
 *   the sky;
 * - the court itself is paved and ringed by a **post ring standing one cell in
 *   from the wall**, on a stylobate band of carpet, which is the note's
 *   sentence;
 * - the rooms open inward: benches and a table down the outer band, nothing at
 *   all against the outside wall but stone.
 */
function fitPeristyleHouse(ctx: FitOutContext, c: PropCounter): void {
  const wall = wallPlan(ctx);
  if (wall !== null) c.n += reclad(ctx, wall, 1, ctx.wallTop, ashlar(ctx));

  const it = ctx.interior;
  const roof = roofPlan(ctx);
  if (roof !== null) {
    clearRoof(ctx, roof);
    // The court is the middle of the plan, two cells in from the wall on every
    // side — never smaller than one cell, so a tight envelope still gets a
    // hole in its roof rather than a solid slab.
    const court: LocalRect = {
      x0: Math.min(it.x0 + 1, lanternColumn(it).x),
      x1: Math.max(it.x1 - 1, lanternColumn(it).x),
      z0: Math.min(it.z0 + 1, lanternColumn(it).z),
      z1: Math.max(it.z1 - 1, lanternColumn(it).z),
    };
    courtDeck(ctx, c, roof, court);
  }

  const lamp = lanternColumn(it);
  // The stylobate: a carpet band one cell in from the wall, which a player
  // walks over rather than into.
  for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
    for (let x = it.x0 + 1; x <= it.x1 - 1; x++) {
      const rim =
        x === it.x0 + 1 || x === it.x1 - 1 || z === it.z0 + 1 || z === it.z1 - 1;
      if (!rim) continue;
      c.put1(x, z, "light_gray_carpet");
    }
  }
  // The post ring: every other bay of that band, clear of the lantern column.
  for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
    for (let x = it.x0 + 1; x <= it.x1 - 1; x++) {
      const rim =
        x === it.x0 + 1 || x === it.x1 - 1 || z === it.z0 + 1 || z === it.z1 - 1;
      if (!rim || (x + z) % 2 !== 0) continue;
      if (x === lamp.x && z === lamp.z) continue;
      post(ctx, c, x, z);
    }
  }
  // The rooms, opening inward: a couch either side and a table at the head.
  const end = farEnd(ctx);
  const couch = ctx.style["stair.interior"] as string;
  for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
    c.put1(it.x0, z, couch, seat("east"));
    c.put1(it.x1, z, couch, seat("west"));
  }
  c.put1(lamp.x - 1 >= it.x0 ? lamp.x - 1 : lamp.x + 1, end.z, "cauldron", { level: "0" });
  c.put1(it.x1, end.z, pottedAt(it.x1, end.z));
}

/**
 * `megaron` — the palace hall, and the oldest classical form in the pack.
 *
 * Three moves, all of them on the door's face:
 *
 * - the **antae**: the two side walls carried out past the front as projecting
 *   stubs, built in the apron corners of that face and rising to the plate;
 * - **two columns *in antis*** between them — the whole definition of the
 *   form. They stand in the apron at the third points of the front, so the
 *   porch between the antae is two bays wide and a walker comes in through the
 *   middle of it;
 * - a **pediment** over the front, from the roof rebuild.
 *
 * Inside is one long room — a megaron is never subdivided — with a **raised
 * hearth ring** off the lantern column: a square of dressed stone with an
 * unlit campfire in the middle of it and a throne at the head of the room.
 */
function fitMegaron(ctx: FitOutContext, c: PropCounter): void {
  const wall = wallPlan(ctx);
  if (wall !== null) {
    c.n += reclad(ctx, wall, 1, ctx.wallTop, ashlar(ctx));
    const front = doorFace(ctx, wall);
    stylobate(ctx, c, wall, 0);
    const stone = ashlar(ctx);
    const along = front === "north" || front === "south";
    const fixed =
      front === "north" ? -1 : front === "south" ? wall.sz : front === "west" ? -1 : wall.sx;
    const span = along ? wall.sx : wall.sz;
    // The antae: the apron corners of the front face, full height.
    for (const i of [-1, span]) {
      const x = along ? i : fixed;
      const z = along ? fixed : i;
      footing(ctx, c, x, z, stone(x, 0, z));
      for (let y = 1; y <= ctx.wallTop; y++) c.raw(x, y, z, stone(x, y, z));
    }
    // The two columns in antis, at the third points of the front.
    const drum = ctx.style["foundation.primary"] as string;
    const first = Math.max(0, Math.floor((span - 1) / 3));
    const second = Math.min(span - 1, span - 1 - first);
    for (const i of first === second ? [first] : [first, second]) {
      const x = along ? i : fixed;
      const z = along ? fixed : i;
      if (onWayIn(ctx, x, z)) continue;
      footing(ctx, c, x, z, drum);
      for (let y = 1; y < ctx.wallTop; y++) c.raw(x, y, z, drum);
    }
    // The entablature across the porch, so the two columns carry something.
    const beam = ctx.style["foundation.accent"] as string;
    for (let i = -1; i <= span; i++) {
      const x = along ? i : fixed;
      const z = along ? fixed : i;
      c.raw(x, ctx.wallTop, z, beam);
    }
  }

  const roof = roofPlan(ctx);
  if (roof !== null) {
    clearRoof(ctx, roof);
    pediment(ctx, c, roof);
  }

  const it = ctx.interior;
  const lamp = lanternColumn(it);
  const end = farEnd(ctx);
  // The hearth ring, one column off the lantern so nobody stands in the light
  // to stand at the fire.
  const hx = lamp.x - 1 >= it.x0 + 1 ? lamp.x - 1 : lamp.x + 1;
  const hz = end.z === it.z0 ? lamp.z + 1 : lamp.z - 1;
  const kerb = ctx.style["foundation.accent"] as string;
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      const x = hx + dx;
      const z = hz + dz;
      if (x < it.x0 || x > it.x1 || z < it.z0 || z > it.z1) continue;
      if (dx === 0 && dz === 0) {
        c.put1(x, z, "campfire", {
          lit: "false",
          signal_fire: "false",
          facing: "north",
          waterlogged: "false",
        });
        continue;
      }
      if ((dx === 0 || dz === 0) && !(x === lamp.x && z === lamp.z)) {
        c.put1(x, z, kerb);
      }
    }
  }
  // The throne at the head of the hall, and the processional to it.
  const mid = Math.floor((it.x0 + it.x1) / 2);
  for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
    if (z === lamp.z) continue;
    c.put1(mid, z, "red_carpet");
  }
  c.put1(mid, end.z, ctx.style["stair.interior"] as string, seat(opposite(end.look)));
  if (mid - 1 >= it.x0) c.put1(mid - 1, end.z, "white_candle", CANDLES(3));
  if (mid + 1 <= it.x1) c.put1(mid + 1, end.z, pottedAt(mid + 1, end.z));
}

/* -------------------------------------------------------------------------- */
/* the sanctuary                                                               */
/* -------------------------------------------------------------------------- */

/**
 * `propylaea` — a gateway that is **only** a gateway.
 *
 * The hardest of the eleven to express in a grammar that builds rooms, and the
 * answer is to take the room away: both z faces are opened into arcades and
 * the middle three bays of each are cut clean through, so the building has a
 * passage where its room was and a walker goes in one side and straight out
 * the other. A colonnade stands in the apron of both, a pediment goes over the
 * front, and the only furniture is a pair of braziers flanking the way in —
 * a propylaea with a table in it is a gatehouse.
 *
 * The cut goes *round* anything {@link PRESERVE} names, which is how the
 * shell's door survives in the middle of an opened wall.
 */
function fitPropylaea(ctx: FitOutContext, c: PropCounter): void {
  const wall = wallPlan(ctx);
  if (wall !== null) {
    c.n += reclad(ctx, wall, 1, ctx.wallTop, ashlar(ctx));
    stylobate(ctx, c, wall, 1);
    openFace(ctx, c, wall, "north", 3);
    openFace(ctx, c, wall, "south", 3);
    colonnade(ctx, c, wall, ["north", "south"]);
    // The through-passage: the middle bays of both faces, cut to air.
    const mid = (wall.sx - 1) >> 1;
    for (const z of [0, wall.sz - 1]) {
      for (let x = mid - 1; x <= mid + 1; x++) {
        if (x < 1 || x > wall.sx - 2) continue;
        if (columnProtected(ctx, x, z)) continue;
        for (let y = 1; y < ctx.wallTop; y++) ctx.put(x, y, z, "air");
      }
    }
  }

  const roof = roofPlan(ctx);
  if (roof !== null) {
    clearRoof(ctx, roof);
    pediment(ctx, c, roof);
  }

  // The passage floor, and the two braziers that light it.
  const it = ctx.interior;
  const mid = Math.floor((it.x0 + it.x1) / 2);
  const lamp = lanternColumn(it);
  for (let z = it.z0; z <= it.z1; z++) {
    if (z === lamp.z) continue;
    c.put1(mid, z, "light_gray_carpet");
  }
  for (const x of [it.x0, it.x1]) {
    if (x === mid) continue;
    if (c.put1(x, it.z0 + 1, "chiseled_stone_bricks")) {
      c.stack(x, it.z0 + 1, 2, "white_candle", CANDLES(2));
    }
  }
  c.put1(it.x0, it.z1 - 1, pottedAt(it.x0, it.z1 - 1));
}

/**
 * `bouleuterion` — the council chamber's ancient parent.
 *
 * Stepped seating in a **half-ring** turned to a speaker's floor, roofed (the
 * shell's own roof is kept — this is the one classical form that is emphatically
 * a covered box), with the entry cut through the flat side. So the door end is
 * the speaker's floor, and everything past it rises away from him in arcs.
 *
 * The rings are integer distance bands, never a radius with a square root in
 * it, and every seat obeys the stair-seat rule: its backrest is the outward
 * side, so a councillor looks *in* at the floor. The back arc stands one
 * course higher — a bank two rows deep with the far one raised is the least
 * that reads as "stepped" from the door.
 */
function fitBouleuterion(ctx: FitOutContext, c: PropCounter): void {
  const wall = wallPlan(ctx);
  if (wall !== null) {
    c.n += reclad(ctx, wall, 1, Math.min(3, ctx.wallTop), masonry(ctx));
    stylobate(ctx, c, wall, 0);
    colonnade(ctx, c, wall, [doorFace(ctx, wall)], 3);
  }

  const it = ctx.interior;
  const lamp = lanternColumn(it);
  const end = farEnd(ctx);
  // The speaker stands at the door end; the bank rises away from him.
  const focusZ = end.z === it.z0 ? it.z1 : it.z0;
  const focusX = Math.floor((it.x0 + it.x1) / 2);
  const look: Cardinal = end.z === it.z0 ? "south" : "north";
  const bench = ctx.style["stair.interior"] as string;
  const riser = ctx.style["foundation.accent"] as string;
  for (let z = it.z0; z <= it.z1; z++) {
    for (let x = it.x0; x <= it.x1; x++) {
      if (x === lamp.x && z === lamp.z) continue;
      // THE SIDE AISLES. A bank that runs wall to wall turns the room into a
      // snake — every second row blocked but for one end cell — and a snake
      // has a *cut vertex* in it, which is how an earlier draft of this bank
      // made the lantern column the room's only route from front to back. The
      // outermost interior column on each flank is therefore never seated, and
      // the two aisles it leaves are what a real bouleuterion has anyway.
      if (x === it.x0 || x === it.x1) continue;
      // Chebyshev distance from the speaker: square arcs, which read as arcs
      // at block scale and cost no arithmetic anyone can argue with.
      const d = Math.max(Math.abs(x - focusX), Math.abs(z - focusZ));
      const away = end.z === it.z0 ? z < focusZ : z > focusZ;
      if (!away || d < 2) continue;
      if (d % 2 !== 0) continue;
      const back = d >= 4;
      if (back) {
        if (c.put1(x, z, riser)) c.stack(x, z, 2, bench, seat(look));
        continue;
      }
      c.put1(x, z, bench, seat(look));
    }
  }
  // The speaker's floor: a plinth on the chord, facing the bank.
  c.put1(focusX, focusZ, "chiseled_stone_bricks");
  if (focusX - 1 >= it.x0) {
    c.put1(focusX - 1, focusZ, "lectern", {
      facing: opposite(look),
      has_book: "false",
      powered: "false",
    });
  }
  if (focusX + 1 <= it.x1) c.put1(focusX + 1, focusZ, pottedAt(focusX + 1, focusZ));
}

/**
 * `peripteral_temple` — the colonnade on **all four sides**.
 *
 * The catalog note draws the line this fit-out exists to hold: the generic
 * `temple` (the sanctum pack's) is the cella-and-porch one, and this is the
 * peripteral plan — so the differences are all things a walker can see from
 * the road:
 *
 * - a **two-course crepidoma** under the whole apron, not a single step;
 * - columns on **every** face at every other bay, corners always;
 * - a **banded entablature** — alternate cells of the architrave laid as
 *   double slabs of the lighter stone, which is as close as a block palette
 *   gets to a triglyph frieze;
 * - a **pediment** over the short face, from {@link pediment};
 * - a **blind cella** inside: no inner colonnade at all, because a peripteral
 *   temple keeps its columns outside, and one big cult figure at the head of
 *   an otherwise empty room.
 */
function fitPeripteralTemple(ctx: FitOutContext, c: PropCounter): void {
  const wall = wallPlan(ctx);
  if (wall !== null) {
    c.n += reclad(ctx, wall, 1, ctx.wallTop, ashlar(ctx));
    stylobate(ctx, c, wall, 1);
    colonnade(ctx, c, wall, ALL_FACES, 2, true);
  }

  const roof = roofPlan(ctx);
  if (roof !== null) {
    clearRoof(ctx, roof);
    pediment(ctx, c, roof);
  }

  const it = ctx.interior;
  const mid = Math.floor((it.x0 + it.x1) / 2);
  const end = farEnd(ctx);
  const lamp = lanternColumn(it);
  const stepZ = end.z === it.z0 ? it.z0 + 1 : it.z1 - 1;
  for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
    if (z === lamp.z || z === stepZ) continue;
    c.put1(mid, z, "orange_carpet");
  }
  cultFigure(ctx, c, mid, end.z);
  // A cella is otherwise empty: two tripods on the chord, and nothing else.
  const near = end.z === it.z0 ? it.z1 : it.z0;
  c.put1(it.x0, near, "cauldron", { level: "0" });
  c.put1(it.x1, near, pottedAt(it.x1, near));
}

/**
 * `tholos` — the round one.
 *
 * A rect grammar cannot give a round footprint, so the roundness is carried
 * where it is actually visible: **the roof and the ring of columns**.
 *
 * - the roof comes off and goes back as a **shallow cone** — solid discs of
 *   shrinking radius, one per course, each disc a full disc rather than a
 *   ring, closing on a solid cap with a finial standing on it;
 * - the colonnade skips the apron corners and the cells beside them, which
 *   turns the square ring of posts into an **octagon** — at block scale, that
 *   is what a circle of columns looks like;
 * - a **two-course crepidoma** steps the whole thing up, and the shell's own
 *   wall is the drum inside the ring.
 */
function fitTholos(ctx: FitOutContext, c: PropCounter): void {
  const wall = wallPlan(ctx);
  if (wall !== null) {
    c.n += reclad(ctx, wall, 1, ctx.wallTop, ashlar(ctx));
    stylobate(ctx, c, wall, 1);
    const drum = ctx.style["foundation.primary"] as string;
    const beam = ctx.style["foundation.accent"] as string;
    const colTop = Math.max(1, ctx.wallTop - 1);
    for (const cell of apronOf(wall.sx, wall.sz)) {
      if (onWayIn(ctx, cell.x, cell.z)) continue;
      const on = facesOf(wall, cell.x, cell.z);
      // The chamfer: a corner cell, or a cell one step from one, is off the
      // circle and carries no column at all.
      const nearCorner =
        (cell.x <= 0 || cell.x >= wall.sx - 1) && (cell.z <= 0 || cell.z >= wall.sz - 1);
      c.raw(cell.x, ctx.wallTop, cell.z, beam);
      if (on.length > 1 || nearCorner) continue;
      const along = on.includes("west") || on.includes("east") ? cell.z : cell.x;
      if (along % 2 !== 0) continue;
      footing(ctx, c, cell.x, cell.z, drum);
      for (let y = 1; y <= colTop; y++) c.raw(cell.x, y, cell.z, drum);
    }
  }

  const roof = roofPlan(ctx);
  if (roof !== null) {
    clearRoof(ctx, roof);
    lid(ctx, c, roof);
    const stone = ashlar(ctx);
    const cx = (roof.sx - 1) / 2;
    const cz = (roof.sz - 1) / 2;
    const r0 = Math.min(cx, cz);
    let capY = roof.base;
    // Two courses of cone per course of radius: a shallow cone, which is what
    // a tholos has. Solid discs, never rings.
    for (let y = roof.base + 1; y <= roof.top; y++) {
      const k = y - roof.base;
      const r = r0 - k / 2;
      if (r < 0) break;
      let any = false;
      for (let z = 0; z < roof.sz; z++) {
        for (let x = 0; x < roof.sx; x++) {
          const dx = x - cx;
          const dz = z - cz;
          if (dx * dx + dz * dz > r * r + r) continue;
          c.raw(x, y, z, stone(x, y, z));
          any = true;
        }
      }
      if (!any) break;
      capY = y;
    }
    // The finial, standing on the cap — or *as* the cap, when the cone has
    // used every course the allowance had. A cone that runs out of height
    // finishes on a point either way; what it must never do is finish on air.
    c.raw(
      Math.floor(cx),
      Math.min(capY + 1, roof.top),
      Math.floor(cz),
      "chiseled_stone_bricks",
    );
  }

  const it = ctx.interior;
  const mid = Math.floor((it.x0 + it.x1) / 2);
  const end = farEnd(ctx);
  const lamp = lanternColumn(it);
  for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
    if (z === lamp.z) continue;
    c.put1(mid, z, "white_carpet");
  }
  cultFigure(ctx, c, mid, end.z);
  if (it.x0 !== mid) c.put1(it.x0, end.z, pottedAt(it.x0, end.z));
}

/**
 * `sanctuary_treasury` — the votive miniature a sanctuary carries a dozen of.
 *
 * A temple with the room taken out of it: **two columns in antis** on the door
 * face, a pediment over them, a crepidoma under the lot, and inside a single
 * votive plinth with candles and an offering chest. Everything about it is the
 * peripteral temple at a quarter of the size, which is what a treasury *is* —
 * and it is in the pack because a sanctuary reads by *repetition*, and this is
 * the cheapest classical building the catalog can place.
 */
function fitTreasury(ctx: FitOutContext, c: PropCounter): void {
  const wall = wallPlan(ctx);
  if (wall !== null) {
    c.n += reclad(ctx, wall, 1, ctx.wallTop, ashlar(ctx));
    stylobate(ctx, c, wall, 1);
    colonnade(ctx, c, wall, [doorFace(ctx, wall)], 2, true);
  }

  const roof = roofPlan(ctx);
  if (roof !== null) {
    clearRoof(ctx, roof);
    pediment(ctx, c, roof);
  }

  const it = ctx.interior;
  const mid = Math.floor((it.x0 + it.x1) / 2);
  const end = farEnd(ctx);
  cultFigure(ctx, c, mid, end.z);
  if (mid - 1 >= it.x0) c.put1(mid - 1, end.z, "barrel", { facing: "up", open: "false" });
  const near = end.z === it.z0 ? it.z1 : it.z0;
  c.put1(it.x1, near, pottedAt(it.x1, near));
}

/* -------------------------------------------------------------------------- */
/* the games and the crowd                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The open court every palaestra-shaped building is built round.
 *
 * Lays sand over the middle of the floor plane and opens the roof over exactly
 * that rect. The floor is *written*, never removed — the plane stays unbroken,
 * which is the rule the floor-plane test polices — and the middle is left
 * **deliberately empty** of furniture, which is the note's own word: a
 * palaestra with a table in the middle of it is a courtyard with a table in
 * it.
 */
function sandCourt(
  ctx: FitOutContext,
  c: PropCounter,
  roof: ClassicalPlan | null,
  court: LocalRect,
): void {
  for (let z = court.z0; z <= court.z1; z++) {
    for (let x = court.x0; x <= court.x1; x++) c.raw(x, 0, z, "sand");
  }
  if (roof !== null) courtDeck(ctx, c, roof, court);
}

/**
 * `palaestra` — a square sand court inside a colonnade on all four sides.
 *
 * The wrestling school, and the simplest statement of the classical court
 * plan: the roof is opened over the middle, the middle is sand, a rank of
 * posts stands round the court on all four sides, and one range — the far one
 * — carries **changing cells**, a row of alcoves divided by stone piers with a
 * chest in each. The middle stays empty on purpose.
 */
function fitPalaestra(ctx: FitOutContext, c: PropCounter): void {
  const wall = wallPlan(ctx);
  if (wall !== null) {
    c.n += reclad(ctx, wall, 1, ctx.wallTop, ashlar(ctx));
    stylobate(ctx, c, wall, 0);
    colonnade(ctx, c, wall, ALL_FACES, 2);
  }

  const it = ctx.interior;
  const roof = roofPlan(ctx);
  const court: LocalRect = {
    x0: Math.min(it.x0 + 1, lanternColumn(it).x),
    x1: Math.max(it.x1 - 1, lanternColumn(it).x),
    z0: Math.min(it.z0 + 1, lanternColumn(it).z),
    z1: Math.max(it.z1 - 1, lanternColumn(it).z),
  };
  if (roof !== null) clearRoof(ctx, roof);
  sandCourt(ctx, c, roof, court);

  const lamp = lanternColumn(it);
  // The inner rank, round all four sides of the court.
  for (let z = it.z0; z <= it.z1; z++) {
    for (let x = it.x0; x <= it.x1; x++) {
      const rim = x === it.x0 || x === it.x1 || z === it.z0 || z === it.z1;
      if (!rim || (x + z) % 2 !== 0) continue;
      if (x === lamp.x && z === lamp.z) continue;
      post(ctx, c, x, z);
    }
  }
  // The changing cells behind the far range: a chest per alcove.
  const end = farEnd(ctx);
  for (let x = it.x0 + 1; x <= it.x1 - 1; x += 2) {
    if (x === lamp.x && end.z === lamp.z) continue;
    c.put1(x, end.z, "barrel", { facing: "up", open: "false" });
  }
  c.put1(it.x0, end.z, pottedAt(it.x0, end.z));
}

/**
 * `gymnasion` — the palaestra plus a covered running track down one flank.
 *
 * The longest colonnade in the pack, and the read is the *length*: the court
 * is pushed off-centre so one long flank keeps its roof, and that roofed strip
 * is the **xystos** — a running track floored in smooth stone the whole length
 * of the building, with a rank of posts down its court edge at every other bay
 * and turning marks at both ends. Outside, both long faces carry a column in
 * **every** bay rather than every other one, which is what makes a gymnasion
 * read as longer than the palaestra it is otherwise identical to.
 */
function fitGymnasion(ctx: FitOutContext, c: PropCounter): void {
  const wall = wallPlan(ctx);
  if (wall !== null) {
    c.n += reclad(ctx, wall, 1, ctx.wallTop, ashlar(ctx));
    stylobate(ctx, c, wall, 0);
    // Every bay on the long flanks, every other one on the ends.
    const longFaces: readonly Face[] = wall.sz >= wall.sx ? ["west", "east"] : ["north", "south"];
    const endFaces: readonly Face[] = wall.sz >= wall.sx ? ["north", "south"] : ["west", "east"];
    colonnade(ctx, c, wall, endFaces, 2);
    colonnade(ctx, c, wall, longFaces, 1);
  }

  const it = ctx.interior;
  const lamp = lanternColumn(it);
  // The track takes the west band; the court is everything east of it.
  const trackX = it.x0;
  const court: LocalRect = {
    x0: Math.min(it.x0 + 2, lamp.x),
    x1: Math.max(it.x1 - 1, lamp.x),
    z0: Math.min(it.z0 + 1, lamp.z),
    z1: Math.max(it.z1 - 1, lamp.z),
  };
  const roof = roofPlan(ctx);
  if (roof !== null) clearRoof(ctx, roof);
  sandCourt(ctx, c, roof, court);

  // The xystos: a smooth-stone lane the whole length of the building.
  const lane = ctx.style["stone.slab"] as string;
  for (let z = it.z0; z <= it.z1; z++) {
    c.raw(trackX, 0, z, ctx.style["foundation.accent"] as string);
    if (z === it.z0 || z === it.z1) {
      // The turning marks: a slab kerb at each end of the run.
      c.put1(trackX, z, lane, { type: "bottom", waterlogged: "false" });
    }
  }
  // The rank down the track's court edge — the covered part of the covered
  // track, and the longest indoor run of posts in the catalog.
  const edgeX = Math.min(trackX + 1, it.x1);
  for (let z = it.z0 + 1; z <= it.z1 - 1; z += 2) {
    if (edgeX === lamp.x && z === lamp.z) continue;
    post(ctx, c, edgeX, z);
  }
  const end = farEnd(ctx);
  for (let x = it.x0 + 2; x <= it.x1 - 1; x += 3) {
    if (x === lamp.x && end.z === lamp.z) continue;
    c.put1(x, end.z, "barrel", { facing: "up", open: "false" });
  }
  c.put1(it.x1, end.z, pottedAt(it.x1, end.z));
}

/**
 * `odeon` — the roofed small theatre.
 *
 * The bouleuterion's bank with the two things that make it a theatre rather
 * than a council house: a **low stage wall across the chord** — two courses of
 * dressed stone with a slab cornice, the scaenae frons in miniature — and the
 * orchestra floor between it and the seats left clear. The roof stays on,
 * which is the whole distinction from the sanctum pack's open amphitheatre;
 * note that a document asking for `odeon` by *word* still gets that open bowl,
 * because the sanctum table claimed the word first and an id is not a
 * vocabulary. This one answers to `odeion`.
 */
function fitOdeon(ctx: FitOutContext, c: PropCounter): void {
  const wall = wallPlan(ctx);
  if (wall !== null) {
    c.n += reclad(ctx, wall, 1, ctx.wallTop, ashlar(ctx));
    stylobate(ctx, c, wall, 0);
    colonnade(ctx, c, wall, [doorFace(ctx, wall)], 2);
  }

  const it = ctx.interior;
  const lamp = lanternColumn(it);
  const end = farEnd(ctx);
  // The stage is at the door end, the bank rises away from it — a walker comes
  // in behind the stage wall and sees the whole cavea, which is the view.
  const stageZ = end.z === it.z0 ? it.z1 : it.z0;
  const focusX = Math.floor((it.x0 + it.x1) / 2);
  const look: Cardinal = end.z === it.z0 ? "south" : "north";
  const bench = ctx.style["stair.interior"] as string;
  const riser = ctx.style["foundation.accent"] as string;
  for (let z = it.z0; z <= it.z1; z++) {
    for (let x = it.x0; x <= it.x1; x++) {
      if (x === lamp.x && z === lamp.z) continue;
      // The side aisles, for the bouleuterion's reason: a bank that reaches
      // both walls leaves the room a snake with a cut vertex in it.
      if (x === it.x0 || x === it.x1) continue;
      const d = Math.max(Math.abs(x - focusX), Math.abs(z - stageZ));
      const away = end.z === it.z0 ? z < stageZ : z > stageZ;
      if (!away || d < 3 || d % 2 !== 0) continue;
      if (d >= 5) {
        if (c.put1(x, z, riser)) c.stack(x, z, 2, bench, seat(look));
        continue;
      }
      c.put1(x, z, bench, seat(look));
    }
  }
  // The stage wall across the chord: dressed stone with a slab cornice on it.
  const slabBlock = ctx.style["stone.slab"] as string;
  for (let x = it.x0; x <= it.x1; x++) {
    if (x === lamp.x && stageZ === lamp.z) continue;
    if (c.put1(x, stageZ, ctx.style["foundation.accent"] as string)) {
      c.stack(x, stageZ, 2, slabBlock, { type: "bottom", waterlogged: "false" });
    }
  }
  const backZ = end.z;
  c.put1(it.x0, backZ, pottedAt(it.x0, backZ));
  c.put1(it.x1, backZ, "white_candle", CANDLES(2));
}
