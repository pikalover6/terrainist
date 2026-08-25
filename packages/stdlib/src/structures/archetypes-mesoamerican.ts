/**
 * The **Mesoamerican jungle pack** — fifteen archetypes for the one silhouette
 * the catalog could not say: a Maya/Aztec ceremonial centre in the rainforest.
 *
 * The Troy lesson again (`docs/CATALOG-EXPANSION-v0.md` §1) in a wetter
 * climate: a prompt that says *jungle temple city* got a medieval village in
 * mossy stone, because the palette was reachable and every **form** was
 * borrowed. A ziggurat is Mesopotamia, a pyramid is Egypt's, and neither is a
 * step pyramid with a stair up its face and a temple on the crown.
 *
 * The pack, in catalog order:
 *
 * - **the ceremonial core** — `step_pyramid` (the anchor: tiers, an axial
 *   stair, a temple crown), `jaguar_temple` (the roof-comb temple),
 *   `serpent_stair` (the balustraded flight with carved heads at its foot),
 *   `stela_plaza` (carved standing stones round an open floor);
 * - **the civic set** — `ball_court` (two banked walls either side of an
 *   alley, a ring in each), `round_observatory` (the caracol drum and its
 *   dome), `palace_range` (the long many-doored range on its colonnade),
 *   `market_ramada` (open post-and-thatch stalls), `tzompantli_rack` (the
 *   skull rack, deliberately restrained to its posts and beams);
 * - **the works and the ground** — `chultun_cistern` (the bottle cistern's
 *   curbed mouth under a corbelled shoulder), `sacbe_terminus` (the raised
 *   white-road platform where a causeway lands), `milpa_terrace` (the maize
 *   terrace and its retaining steps), `canoe_landing` (the plank landing and
 *   its racks);
 * - **the houses** — `thatch_dwelling` (pole walls, steep thatch),
 *   `temazcal_bath` (the low domed sweat bath).
 *
 * ## The law
 *
 * **An archetype is a fit-out, not a second grammar.** Everything here runs
 * after `core.ts`'s shape stages and writes into the same cell map. Not one
 * line of `core.ts` moves for any of it.
 *
 * The rules, inherited whole from the Nile and corsair packs and every one of
 * them blood-bought:
 *
 * 1. **Nothing leaves the envelope** — the footprint plus its one-block apron,
 *    and `roofTop + `{@link ROOF_FLOURISH_RISE} overhead.
 * 2. **The interior stays walkable**: every interior prop goes through
 *    {@link PropCounter}, which routes through the ground floor's own `free`
 *    and `take`, so nothing here can strand a corner or seal a column.
 * 3. **Solid per course, never a ring per course.** Every mass rebuilt above
 *    the plate — the pyramid's tiers, the observatory's dome, the sweat
 *    bath's shoulder — is a *filled* deck standing on the filled deck below
 *    it. A stepped shell built as a floating ring is `floating.isolated`
 *    waiting to happen. A ring standing **on** a filled deck (a cornice, a
 *    parapet) is a different animal and is allowed.
 * 4. **A rebuilt roof starts with a lid** — the room below needs a ceiling and
 *    everything above needs a floor.
 * 5. **No interior column runs floor to ceiling** (`interior.blocked_column`).
 *    Every stela, post and hot-stone stack here is capped by
 *    {@link columnCap}.
 * 6. **A rebuild may not strand what it did not place.** The shell hangs its
 *    lantern from the ceiling plane and every fit-out here re-lays the volume
 *    over that plane; {@link guardHangers} closes it for all fifteen at once.
 * 7. **Lights are `glowstone` against masonry.** The physics lint fires on any
 *    block whose *name* ends in `lantern` and wants a floor under it or a
 *    chain over it, so this pack simply does not place one.
 * 8. **A stair a body cannot climb is a texture.** The pyramid's flight, the
 *    serpent stair and the terrace steps are real stair blocks, one riser per
 *    course, with the two courses above every tread left air — checked by the
 *    pack's own test rather than argued about here.
 * 9. **No `mud`, no `farmland`.** Both are fifteen sixteenths of a cube, which
 *    makes every floor laid in them a half-step. The milpa's beds are
 *    `moss_block` and `coarse_dirt`, which are whole blocks.
 * 10. No bare `flower_pot`, no sign blocks, no lit fire, no `chain`, no vines
 *    (a hanging plant is `unsupported.*` in a shape no render shows).
 *
 * ## Materials
 *
 * Theme-driven throughout: `foundation.*` is the limestone, `roof.*` the
 * thatch and the cap, `wall.*` the timber. The only blocks named outright are
 * **substances** rather than a palette — `mossy_stone_bricks` and `moss_block`
 * for the jungle's grip on dressed stone, `chiseled_stone_bricks` for a carved
 * face, `glowstone` for light, and the ordinary furniture blocks.
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
 * The fifteen archetypes this file fits out, in catalog order.
 *
 * Spread into `BUILDING_ARCHETYPES` by `archetypes.ts` at the end of the pack
 * blocks, and repeated in that order in the spec's `KNOWN_BUILDING_ARCHETYPES`,
 * where the order is asserted.
 */
export const MESOAMERICAN_BUILDING_ARCHETYPES = [
  "step_pyramid",
  "jaguar_temple",
  "serpent_stair",
  "stela_plaza",
  "ball_court",
  "round_observatory",
  "palace_range",
  "market_ramada",
  "tzompantli_rack",
  "chultun_cistern",
  "sacbe_terminus",
  "milpa_terrace",
  "canoe_landing",
  "thatch_dwelling",
  "temazcal_bath",
] as const;

/** One of the archetypes this file fits out. */
export type MesoamericanBuildingArchetype =
  (typeof MESOAMERICAN_BUILDING_ARCHETYPES)[number];

/** True for an archetype this file answers to. */
export function isMesoamericanArchetype(
  value: string,
): value is MesoamericanBuildingArchetype {
  return (MESOAMERICAN_BUILDING_ARCHETYPES as readonly string[]).includes(value);
}

/**
 * Tag → archetype, or `null` when nothing matches.
 *
 * Consulted after the Nile table, where every later wave sits, and for the
 * same reason: the tables below it are greedy. The **non-claims** are the
 * load-bearing half:
 *
 * - **bare `pyramid` is claimed by nobody and stays that way.** It names the
 *   Nile pack's prop and is a *roof value* in `core.ts` besides. The anchor
 *   here answers to `step_pyramid`, `stepped_pyramid`, `temple_pyramid` and
 *   `teocalli` only;
 * - **bare `temple`, `shrine` and `chapel` are not ours** — the church's, the
 *   extended church's and the sanctum's. The jaguar temple takes
 *   `jaguar_temple`, `temple_of_the_jaguar` and `jaguar_shrine`;
 * - **bare `observatory` is not ours**: the science wave owns it, and a
 *   domed drum with sightlines is exactly what a document saying
 *   `observatory` already gets. The caracol takes `round_observatory` and
 *   `caracol`;
 * - **bare `palace`, `market`, `court`, `plaza`, `terrace`, `bath`, `stair`
 *   and `landing` are all left where they were.** Every claim in this table
 *   is a compound of this pack's own ids or a word no other table has ever
 *   wanted (`chultun`, `sacbe`, `temazcal`, `tzompantli`, `milpa`);
 * - `terrace` in particular is the district fabric's and wave 4A's, so the
 *   maize terrace answers to `milpa`, `milpa_terrace` and `maize_terrace`.
 */
export function mesoamericanArchetypeOfTags(
  tags: readonly string[],
): MesoamericanBuildingArchetype | null {
  const has = (t: string): boolean => tags.includes(t);
  if (has("step_pyramid") || has("stepped_pyramid") || has("temple_pyramid") || has("teocalli")) {
    return "step_pyramid";
  }
  if (has("jaguar_temple") || has("temple_of_the_jaguar") || has("jaguar_shrine")) {
    return "jaguar_temple";
  }
  if (has("serpent_stair") || has("feathered_serpent_stair") || has("serpent_balustrade")) {
    return "serpent_stair";
  }
  if (has("stela_plaza") || has("stelae_plaza") || has("stela_field")) return "stela_plaza";
  if (has("ball_court") || has("ballcourt") || has("pok_ta_pok")) return "ball_court";
  if (has("round_observatory") || has("caracol")) return "round_observatory";
  if (has("palace_range") || has("maya_palace") || has("range_palace")) return "palace_range";
  if (has("market_ramada") || has("ramada") || has("stall_ramada")) return "market_ramada";
  if (has("tzompantli_rack") || has("tzompantli") || has("skull_rack")) return "tzompantli_rack";
  if (has("chultun_cistern") || has("chultun")) return "chultun_cistern";
  if (has("sacbe_terminus") || has("sacbe") || has("causeway_terminus")) return "sacbe_terminus";
  if (has("milpa_terrace") || has("milpa") || has("maize_terrace")) return "milpa_terrace";
  if (has("canoe_landing") || has("canoe_dock") || has("dugout_landing")) return "canoe_landing";
  if (has("thatch_dwelling") || has("palm_thatch_hut") || has("na_house")) {
    return "thatch_dwelling";
  }
  if (has("temazcal_bath") || has("temazcal") || has("sweat_bath")) return "temazcal_bath";
  return null;
}

/**
 * Facade tendencies for this file's archetypes.
 *
 * Same contract as every other wave's — defaults a caller merges, never
 * something applied over an explicit param.
 *
 * Mesoamerican masonry has **no windows**: it has doorways, and where it wants
 * light it opens the whole front onto a colonnade. So every entry here asks
 * for `windowRhythm: "none"` except the palace range and the market ramada,
 * whose long open fronts are the whole read of the type. Every roof is `hip`,
 * which leaves the most room between the eave plate and the allowance — the
 * tiers, the domes, the combs and the thatch are all built in exactly that
 * gap.
 */
export function mesoamericanFacadeDefaults(archetype: string): {
  readonly windowShape?: string;
  readonly windowRhythm?: string;
  readonly roof?: string;
} {
  if (!isMesoamericanArchetype(archetype)) return {};
  switch (archetype) {
    case "palace_range":
      return { windowShape: "tall", windowRhythm: "regular", roof: "hip" };
    case "market_ramada":
      return { windowShape: "wide", windowRhythm: "sparse", roof: "hip" };
    default:
      return { windowShape: "single", windowRhythm: "none", roof: "hip" };
  }
}

/* -------------------------------------------------------------------------- */
/* the shared machinery                                                        */
/* -------------------------------------------------------------------------- */

/**
 * What an exterior rebuild needs to know, or `null` when it may not run.
 *
 * The Nile pack's plan in every respect, restated rather than imported for the
 * reason that pack restated the corsair's: two packs are two seams, and a
 * shared private helper is a shared edit.
 */
interface MesoPlan {
  readonly sx: number;
  readonly sz: number;
  /** Y of the roof's lowest course — one above the eave plate. */
  readonly base: number;
  /** Highest Y anything may occupy: the shell's roof top plus the allowance. */
  readonly top: number;
  readonly rect: LocalRect;
}

/** The plan for work on the **walls**: the rect condition, and nothing else. */
function wallPlan(ctx: FitOutContext): MesoPlan | null {
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
function roofPlan(ctx: FitOutContext): MesoPlan | null {
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
function clearRoof(ctx: FitOutContext, plan: MesoPlan): void {
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
 * The Nile pack's list unchanged: the way in, the way up, the fire, the glass
 * and anything the physics lint holds to a support rule.
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
  plan: MesoPlan,
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
 * not.
 */
function mesoJitter(a: number, b: number, c: number, n: number): number {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = (h ^ (h >>> 13)) >>> 0;
  return h % n;
}

/**
 * **Limestone** — the theme's own stone, banded by course.
 *
 * Dressed stone laid in courses is what makes a battered wall read as cut
 * rather than piled, and it is the whole material story of a Maya platform.
 */
function limestone(ctx: FitOutContext): (x: number, y: number, z: number) => string {
  const primary = ctx.style["foundation.primary"] as string;
  const accent = ctx.style["foundation.accent"] as string;
  return (_x, y, _z) => (y % 4 === 0 ? accent : primary);
}

/**
 * **Mossy limestone** — the same stone with the jungle in it.
 *
 * `mossy_stone_bricks` is a *substance* rather than a palette: it is what
 * dressed stone becomes under a canopy, and one cell in seven is the density
 * that reads as damp instead of as ruined.
 */
function mossyMasonry(ctx: FitOutContext): (x: number, y: number, z: number) => string {
  const primary = ctx.style["foundation.primary"] as string;
  const accent = ctx.style["foundation.accent"] as string;
  return (x, y, z) => {
    const draw = mesoJitter(x, y, z, 7);
    if (draw === 0) return "mossy_stone_bricks";
    return draw === 1 ? accent : primary;
  };
}

/** Pole-and-daub: the theme's timber standing in courses of its own plaster. */
function poleWall(ctx: FitOutContext): (x: number, y: number, z: number) => string {
  const post = ctx.style["wall.accent"] as string;
  const daub = ctx.style["wall.primary"] as string;
  return (x, _y, z) => ((x + z) % 3 === 0 ? post : daub);
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
function lid(ctx: FitOutContext, c: PropCounter, plan: MesoPlan): void {
  const block = ctx.style["foundation.accent"] as string;
  const solid = ctx.style["roof.solid"] as string;
  for (let z = 0; z < plan.sz; z++) {
    for (let x = 0; x < plan.sx; x++) {
      c.raw(x, plan.base, z, mesoJitter(x, plan.base, z, 5) === 0 ? solid : block);
    }
  }
}

/**
 * **Tiers** — filled decks stepping inward, one inset per course.
 *
 * The pack's recurring exterior mass and rule 3 in its plainest shape: each
 * deck is *filled* and stands on the filled deck below it, so nothing here can
 * float and nothing here is a sealed ring. Returns the tiers actually built,
 * outermost first, so a caller can run a stair up their faces.
 */
function tiers(
  ctx: FitOutContext,
  c: PropCounter,
  plan: MesoPlan,
  inset: number,
  block: (x: number, y: number, z: number) => string,
): { readonly y: number; readonly x0: number; readonly x1: number; readonly z0: number; readonly z1: number }[] {
  const out: { y: number; x0: number; x1: number; z0: number; z1: number }[] = [];
  let step = inset;
  for (let y = plan.base + 1; y <= plan.top; y++, step += inset) {
    const x0 = step;
    const x1 = plan.sx - 1 - step;
    const z0 = step;
    const z1 = plan.sz - 1 - step;
    if (x0 > x1 || z0 > z1) break;
    deck(c, y, x0, x1, z0, z1, (x, z) => block(x, y, z));
    out.push({ y, x0, x1, z0, z1 });
  }
  return out;
}

/**
 * **THE HANGER GUARD** — nothing this file writes may leave a hanging block
 * hanging from air.
 *
 * The Nile pack's closure, restated as code for the same reason it was there:
 * the shell hangs its lantern from the ceiling plane directly above it, and
 * **every rebuild in this file deletes and re-lays the volume over that
 * plane.** `unsupported.chain` walks a hanger's support upward and fails it
 * the moment the cell above is air — a finding no render shows.
 *
 * Every cell carrying a block with `hanging: "true"` gets the ceiling material
 * written over it if that cell came out empty. It is a *closure*, not a fix:
 * it holds for a hanger this pack never placed, in a shape somebody adds next
 * year.
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
 * Rule 5, as one function. A column solid from its floor to its ceiling is
 * `interior.blocked_column` however handsome it is, and this pack raises
 * stelae, posts and hot-stone stacks on purpose.
 */
function columnCap(ctx: FitOutContext): number {
  return Math.max(2, ctx.storyHeight - 2);
}

/**
 * A **stela**: a carved standing stone, capped short of the ceiling.
 *
 * Goes down through {@link PropCounter.put1} so the walkability guard can
 * refuse it outright, and is carved (`chiseled_stone_bricks`) at the head,
 * which is where a Maya stela carries its glyph band.
 */
function stela(ctx: FitOutContext, c: PropCounter, x: number, z: number): boolean {
  const shaft = ctx.style["foundation.primary"] as string;
  if (!c.put1(x, z, shaft)) return false;
  const cap = columnCap(ctx);
  for (let y = 2; y < cap; y++) c.stack(x, z, y, shaft);
  if (cap >= 2) c.stack(x, z, cap, "chiseled_stone_bricks");
  return true;
}

/**
 * A **post** in the apron, with a footing under it and a lintel course over.
 *
 * The colonnade of the palace range, the ramada's stalls and the skull rack's
 * frame are all this shape. Exterior only — the apron is outside every
 * interior rule — and never written across the way in.
 */
function apronPost(
  ctx: FitOutContext,
  c: PropCounter,
  x: number,
  z: number,
  height: number,
  block: string,
): boolean {
  if (onWayIn(ctx, x, z)) return false;
  footing(ctx, c, x, z, block);
  for (let y = 1; y <= height; y++) {
    if (protectedAt(ctx, x, y, z)) return false;
    c.raw(x, y, z, block);
  }
  return true;
}

/**
 * A **cornice** — a ring of stairs at one course, each facing *into* the
 * building so its high half stands over the wall it crowns.
 *
 * A stair's `facing` is the side its high half is on, which is the rule every
 * cornice, ramp and step in this pack is written against. Never written over
 * the way in: an oversailing stair at head height on the doorstep is a door a
 * body cannot walk through.
 */
function cornice(ctx: FitOutContext, c: PropCounter, plan: MesoPlan, y: number): void {
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

/**
 * **The axial flight** — one real stair block per tier, up the south face.
 *
 * Rule 8, as one function and shared by the pyramid, the serpent stair and the
 * temple: a Mesoamerican pyramid *is* its stair, and a stack of full blocks
 * with no tread is a wall with a texture on it. Each riser stands on the tier
 * below it and the two courses above every tread are left air, because the
 * tier behind is inset by one — which is precisely why {@link tiers} insets by
 * one and not by two.
 *
 * Returns the treads it wrote, foot first, so a caller can balustrade them.
 */
function axialFlight(
  ctx: FitOutContext,
  c: PropCounter,
  plan: MesoPlan,
  levels: readonly { readonly y: number; readonly z0: number; readonly z1: number }[],
): { x: number; y: number; z: number }[] {
  const stairs = ctx.style["stone.stairs"] as string;
  const mid = (plan.sx - 1) >> 1;
  const treads: { x: number; y: number; z: number }[] = [];
  for (const level of levels) {
    const z = level.z1 + 1;
    if (z < 0 || z >= plan.sz) continue;
    if (protectedAt(ctx, mid, level.y, z)) continue;
    c.raw(mid, level.y, z, stairs, {
      facing: "south",
      half: "bottom",
      shape: "straight",
      waterlogged: "false",
    });
    treads.push({ x: mid, y: level.y, z });
  }
  return treads;
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
export function furnishMesoamerican(ctx: FitOutContext): number {
  if (!isMesoamericanArchetype(ctx.archetype)) return 0;
  const c = new PropCounter(ctx);
  switch (ctx.archetype) {
    case "step_pyramid":
      fitStepPyramid(ctx, c);
      break;
    case "jaguar_temple":
      fitJaguarTemple(ctx, c);
      break;
    case "serpent_stair":
      fitSerpentStair(ctx, c);
      break;
    case "stela_plaza":
      fitStelaPlaza(ctx, c);
      break;
    case "ball_court":
      fitBallCourt(ctx, c);
      break;
    case "round_observatory":
      fitRoundObservatory(ctx, c);
      break;
    case "palace_range":
      fitPalaceRange(ctx, c);
      break;
    case "market_ramada":
      fitMarketRamada(ctx, c);
      break;
    case "tzompantli_rack":
      fitTzompantliRack(ctx, c);
      break;
    case "chultun_cistern":
      fitChultunCistern(ctx, c);
      break;
    case "sacbe_terminus":
      fitSacbeTerminus(ctx, c);
      break;
    case "milpa_terrace":
      fitMilpaTerrace(ctx, c);
      break;
    case "canoe_landing":
      fitCanoeLanding(ctx, c);
      break;
    case "thatch_dwelling":
      fitThatchDwelling(ctx, c);
      break;
    case "temazcal_bath":
    default:
      fitTemazcalBath(ctx, c);
      break;
  }
  // Last, and for all fifteen: nothing above may have been taken out from over
  // a hanging block. See {@link guardHangers}.
  guardHangers(ctx, c);
  return c.n;
}

/* -------------------------------------------------------------------------- */
/* the ceremonial core                                                         */
/* -------------------------------------------------------------------------- */

/**
 * `step_pyramid` — the anchor, and the form the catalog could not say.
 *
 * Tiers over the eave plate, an axial stair up the south face of them, and a
 * temple crown on the top. The honest limit is stated once, here: **a
 * building's whole rebuild budget is the room between the eave plate and the
 * allowance**, which is why this is a temple *platform* rather than the
 * thirty-three block mass the Nile pack made a prop of. Filling the storeys
 * solid instead would make every column of them `interior.blocked_column` —
 * that is the arithmetic, and it does not care how handsome the mass is.
 *
 * Inside: the sanctuary at the far end, censers either side of it.
 */
function fitStepPyramid(ctx: FitOutContext, c: PropCounter): void {
  const wall = wallPlan(ctx);
  const roof = roofPlan(ctx);
  const stone = ctx.style["foundation.primary"] as string;
  const accent = ctx.style["foundation.accent"] as string;

  if (wall !== null) {
    c.n += reclad(ctx, wall, 1, ctx.wallTop, limestone(ctx));
    // The plinth: a full apron course at the foot so the mass stands on a
    // base. Grounded, because the apron is not always at `y = 1`.
    for (const cell of apronOf(wall.sx, wall.sz)) {
      if (onWayIn(ctx, cell.x, cell.z)) continue;
      footing(ctx, c, cell.x, cell.z, stone);
      c.raw(cell.x, 1, cell.z, accent);
    }
  }

  if (roof !== null) {
    clearRoof(ctx, roof);
    lid(ctx, c, roof);
    const levels = tiers(ctx, c, roof, 1, mossyMasonry(ctx));
    axialFlight(ctx, c, roof, levels);
    // The temple crown: the innermost tier carries a carved head course, so
    // the silhouette ends in a building rather than in a flat step.
    // The temple crown: a carved course over the innermost tier, or — when the
    // tiers have already eaten the whole allowance — the innermost tier itself
    // re-laid carved. Either way the silhouette ends in a building rather than
    // in a flat step, and neither branch adds a course above the allowance.
    const crown = levels[levels.length - 1];
    if (crown !== undefined) {
      const y = crown.y < roof.top ? crown.y + 1 : crown.y;
      deck(c, y, crown.x0, crown.x1, crown.z0, crown.z1, () => "chiseled_stone_bricks");
    }
  }

  const it = ctx.interior;
  const end = farEnd(ctx);
  const mid = Math.floor((it.x0 + it.x1) / 2);
  if (c.put1(mid, end.z, accent)) c.stack(mid, end.z, 2, "chiseled_stone_bricks");
  if (it.x0 !== mid) c.put1(it.x0, end.z, "white_candle", { candles: "2", lit: "false", waterlogged: "false" });
  if (it.x1 !== mid) c.put1(it.x1, end.z, "white_candle", { candles: "3", lit: "false", waterlogged: "false" });
}

/**
 * `jaguar_temple` — the roof-comb temple.
 *
 * The comb is the type: a thin openwork wall standing on the ridge, taller
 * than the room under it and carrying nothing. Built as filled courses on the
 * lid (rule 3), one cell thick, on the long axis; the throne inside is the
 * other half of the read.
 */
function fitJaguarTemple(ctx: FitOutContext, c: PropCounter): void {
  const wall = wallPlan(ctx);
  const roof = roofPlan(ctx);
  const accent = ctx.style["foundation.accent"] as string;

  if (wall !== null) c.n += reclad(ctx, wall, 1, ctx.wallTop, mossyMasonry(ctx));

  if (roof !== null) {
    clearRoof(ctx, roof);
    lid(ctx, c, roof);
    const mid = (roof.sx - 1) >> 1;
    const stone = mossyMasonry(ctx);
    for (let y = roof.base + 1; y <= roof.top; y++) {
      for (let z = 1; z <= roof.sz - 2; z++) {
        // The comb narrows as it rises, and every cell stands on the cell
        // below it: a filled wall, not a floating frieze.
        const shrink = y - roof.base - 1;
        if (z <= shrink || z >= roof.sz - 1 - shrink) continue;
        c.raw(mid, y, z, y === roof.top ? "chiseled_stone_bricks" : stone(mid, y, z));
      }
    }
    cornice(ctx, c, roof, roof.base + 1);
  }

  const it = ctx.interior;
  const end = farEnd(ctx);
  const mid = Math.floor((it.x0 + it.x1) / 2);
  // The throne: a carved seat facing the door, which is the way a jaguar
  // throne is met. A stair's `facing` is its BACKREST, so it faces the wall.
  c.put1(mid, end.z, ctx.style["stone.stairs"] as string, {
    facing: end.look,
    half: "bottom",
    shape: "straight",
    waterlogged: "false",
  });
  if (it.x0 !== mid) c.put1(it.x0, end.z, accent);
  if (it.x1 !== mid) c.put1(it.x1, end.z, "decorated_pot", { waterlogged: "false" });
}

/**
 * `serpent_stair` — the balustraded flight with carved heads at its foot.
 *
 * The pyramid's stair on its own terms: tiers, a flight up them, a **wall**
 * balustrade either side of the flight (a wall block is the only thing in the
 * palette that reads as a carved rail rather than as a kerb), and a carved
 * head where the rail lands.
 */
function fitSerpentStair(ctx: FitOutContext, c: PropCounter): void {
  const wall = wallPlan(ctx);
  const roof = roofPlan(ctx);
  const rail = ctx.style["stone.wall"] as string;

  if (wall !== null) c.n += reclad(ctx, wall, 1, ctx.wallTop, limestone(ctx));

  if (roof !== null) {
    clearRoof(ctx, roof);
    lid(ctx, c, roof);
    const levels = tiers(ctx, c, roof, 1, limestone(ctx));
    const treads = axialFlight(ctx, c, roof, levels);
    for (const tread of treads) {
      for (const dx of [-1, 1]) {
        const x = tread.x + dx;
        if (x < 0 || x >= roof.sx) continue;
        if (protectedAt(ctx, x, tread.y, tread.z)) continue;
        c.raw(x, tread.y, tread.z, rail, {
          north: "false",
          south: "false",
          east: "false",
          west: "false",
          up: "true",
          waterlogged: "false",
        });
      }
    }
    // The heads: the lowest rail cell on each side, carved. The rail below is
    // what they stand on, so nothing here has six air faces.
    const foot = treads[0];
    if (foot !== undefined && foot.y + 1 <= roof.top) {
      for (const dx of [-1, 1]) {
        const x = foot.x + dx;
        if (x < 0 || x >= roof.sx) continue;
        c.raw(x, foot.y + 1, foot.z, "chiseled_stone_bricks");
      }
    }
  }

  const it = ctx.interior;
  stela(ctx, c, it.x0, it.z0);
  stela(ctx, c, it.x1, it.z1);
}

/**
 * `stela_plaza` — carved standing stones round an open floor.
 *
 * The plaza is the *absence*: the floor is left clear and the stones stand
 * round its edge, each one capped short of the ceiling by {@link columnCap}
 * because a stone from floor to ceiling is a pillar through the room and the
 * lint says so.
 */
function fitStelaPlaza(ctx: FitOutContext, c: PropCounter): void {
  const wall = wallPlan(ctx);
  const roof = roofPlan(ctx);

  if (wall !== null) c.n += reclad(ctx, wall, 1, ctx.wallTop, mossyMasonry(ctx));

  if (roof !== null) {
    clearRoof(ctx, roof);
    lid(ctx, c, roof);
    cornice(ctx, c, roof, roof.base + 1);
  }

  const it = ctx.interior;
  const lamp = lanternColumn(it);
  let raised = 0;
  for (let z = it.z0; z <= it.z1; z += 2) {
    for (const x of [it.x0, it.x1]) {
      if (x === lamp.x && z === lamp.z) continue;
      if (stela(ctx, c, x, z)) raised++;
    }
  }
  // An altar in the middle of the rank, low enough to be furniture.
  if (raised > 0) {
    const mid = Math.floor((it.x0 + it.x1) / 2);
    c.put1(mid, it.z1, ctx.style["stone.slab"] as string, { type: "bottom", waterlogged: "false" });
  }
}

/* -------------------------------------------------------------------------- */
/* the civic set                                                               */
/* -------------------------------------------------------------------------- */

/**
 * `ball_court` — two banked walls either side of an alley, a ring in each.
 *
 * Built **over the plate**, where a mass may be rebuilt: the lid is the
 * playing alley, and the banks are filled decks either side of it, sloped by a
 * stair course on their inner face. The ring is a wall block standing on the
 * bank, which is the one shape in the palette that reads as a hoop.
 */
function fitBallCourt(ctx: FitOutContext, c: PropCounter): void {
  const wall = wallPlan(ctx);
  const roof = roofPlan(ctx);

  if (wall !== null) c.n += reclad(ctx, wall, 1, ctx.wallTop, limestone(ctx));

  if (roof !== null) {
    clearRoof(ctx, roof);
    lid(ctx, c, roof);
    const stone = limestone(ctx);
    const stairs = ctx.style["stone.stairs"] as string;
    const bank = Math.max(1, Math.floor(roof.sx / 5));
    for (let y = roof.base + 1; y <= Math.min(roof.top, roof.base + 2); y++) {
      const shrink = y - roof.base - 1;
      for (let z = 0; z < roof.sz; z++) {
        for (let x = 0; x < roof.sx; x++) {
          const west = x < bank - shrink;
          const east = x > roof.sx - 1 - (bank - shrink);
          if (!west && !east) continue;
          c.raw(x, y, z, stone(x, y, z));
        }
      }
    }
    // The sloped inner face, and the rings over it.
    const midZ = (roof.sz - 1) >> 1;
    for (const side of [
      { x: bank, facing: "west" as Cardinal },
      { x: roof.sx - 1 - bank, facing: "east" as Cardinal },
    ]) {
      if (side.x < 0 || side.x >= roof.sx) continue;
      for (let z = 0; z < roof.sz; z++) {
        c.raw(side.x, roof.base + 1, z, stairs, {
          facing: side.facing,
          half: "bottom",
          shape: "straight",
          waterlogged: "false",
        });
      }
      if (roof.base + 2 <= roof.top) {
        // The ring stands on the sloped face's own stair — never in mid air.
        c.raw(side.x, roof.base + 2, midZ, ctx.style["stone.wall"] as string, {
          north: "false",
          south: "false",
          east: "false",
          west: "false",
          up: "true",
          waterlogged: "false",
        });
      }
    }
  }

  // Inside: the players' benches down the long walls, and nothing in the
  // middle — a court is an empty floor by definition.
  const it = ctx.interior;
  const seat = ctx.style["stair.interior"] as string;
  for (let z = it.z0 + 1; z <= it.z1 - 1; z += 2) {
    c.put1(it.x0, z, seat, {
      facing: "west",
      half: "bottom",
      shape: "straight",
      waterlogged: "false",
    });
    c.put1(it.x1, z, seat, {
      facing: "east",
      half: "bottom",
      shape: "straight",
      waterlogged: "false",
    });
  }
}

/**
 * `round_observatory` — the caracol: a drum on a platform under a dome.
 *
 * The drum is round the only way a block world can be round: a filled disc per
 * course, each disc smaller than the one under it. Filled, never rung (rule
 * 3), and lit with `glowstone` against the masonry rather than a lantern
 * (rule 7).
 */
function fitRoundObservatory(ctx: FitOutContext, c: PropCounter): void {
  const wall = wallPlan(ctx);
  const roof = roofPlan(ctx);

  if (wall !== null) c.n += reclad(ctx, wall, 1, ctx.wallTop, mossyMasonry(ctx));

  if (roof !== null) {
    clearRoof(ctx, roof);
    lid(ctx, c, roof);
    const stone = mossyMasonry(ctx);
    const cx = (roof.sx - 1) / 2;
    const cz = (roof.sz - 1) / 2;
    const r0 = Math.min(cx, cz);
    for (let y = roof.base + 1; y <= roof.top; y++) {
      const radius = r0 - (y - roof.base - 1) * 0.8;
      if (radius < 0.5) break;
      let wrote = 0;
      for (let z = 0; z < roof.sz; z++) {
        for (let x = 0; x < roof.sx; x++) {
          const dx = x - cx;
          const dz = z - cz;
          if (dx * dx + dz * dz > radius * radius) continue;
          c.raw(x, y, z, y === roof.top ? "chiseled_stone_bricks" : stone(x, y, z));
          wrote++;
        }
      }
      if (wrote === 0) break;
    }
    // The sightline light: glowstone in the drum's skin, which has masonry on
    // every side of it and therefore needs no support of its own.
    const lampY = Math.min(roof.top, roof.base + 2);
    c.raw(Math.round(cx), lampY, Math.round(cz), "glowstone");
  }

  const it = ctx.interior;
  const lamp = lanternColumn(it);
  // The instrument: a sighting stone off the middle of the floor, capped
  // short, and the observer's stool beside it.
  const sx = it.x0 === lamp.x ? it.x0 + 1 : it.x0;
  if (c.put1(sx, it.z0, ctx.style["foundation.accent"] as string)) {
    c.stack(sx, it.z0, 2, "chiseled_stone_bricks");
  }
  c.put1(it.x1, it.z1, ctx.style["stone.slab"] as string, {
    type: "bottom",
    waterlogged: "false",
  });
}

/**
 * `palace_range` — the long many-doored range on its colonnade.
 *
 * The type is a *rhythm*: a low range whose whole front is a rank of openings
 * under one roofline. The colonnade goes in the apron, every third cell,
 * lintelled at its head and never written across the way in.
 */
function fitPalaceRange(ctx: FitOutContext, c: PropCounter): void {
  const wall = wallPlan(ctx);
  const roof = roofPlan(ctx);
  const stone = ctx.style["foundation.primary"] as string;

  if (wall !== null) {
    c.n += reclad(ctx, wall, 1, ctx.wallTop, limestone(ctx));
    // The colonnade, on the door's own face: posts at every third cell, a
    // lintel course over them, and a footing under each.
    const face = ctx.door === null ? "south" : ctx.door.face;
    const [fx, fz] = cardinalStep(face);
    const height = Math.max(2, Math.min(4, ctx.wallTop - 1));
    const posts: { x: number; z: number }[] = [];
    if (fz !== 0) {
      const z = fz > 0 ? wall.sz : -1;
      for (let x = 0; x < wall.sx; x += 3) posts.push({ x, z });
    } else {
      const x = fx > 0 ? wall.sx : -1;
      for (let z = 0; z < wall.sz; z += 3) posts.push({ x, z });
    }
    const stood: { x: number; z: number }[] = [];
    for (const post of posts) {
      if (apronPost(ctx, c, post.x, post.z, height, stone)) stood.push(post);
    }
    // The lintel: one course over the posts, spanning between them, so the
    // rank reads as an arcade rather than as a fence. Every cell of it sits on
    // or beside a post.
    for (let i = 0; i + 1 < stood.length; i++) {
      const a = stood[i] as { x: number; z: number };
      const b = stood[i + 1] as { x: number; z: number };
      const steps = Math.max(Math.abs(b.x - a.x), Math.abs(b.z - a.z));
      if (steps === 0) continue;
      for (let k = 0; k <= steps; k++) {
        const x = a.x + Math.round(((b.x - a.x) * k) / steps);
        const z = a.z + Math.round(((b.z - a.z) * k) / steps);
        if (onWayIn(ctx, x, z)) continue;
        if (protectedAt(ctx, x, height + 1, z)) continue;
        c.raw(x, height + 1, z, ctx.style["foundation.accent"] as string);
      }
    }
  }

  if (roof !== null) {
    clearRoof(ctx, roof);
    lid(ctx, c, roof);
    cornice(ctx, c, roof, roof.base + 1);
    if (roof.base + 2 <= roof.top) {
      const top = limestone(ctx);
      deck(c, roof.base + 2, 1, roof.sx - 2, 1, roof.sz - 2, (x, z) => top(x, roof.base + 2, z));
    }
  }

  const it = ctx.interior;
  const seat = ctx.style["stair.interior"] as string;
  for (let z = it.z0; z <= it.z1; z += 3) {
    c.put1(it.x0, z, seat, {
      facing: "west",
      half: "bottom",
      shape: "straight",
      waterlogged: "false",
    });
  }
  c.put1(it.x1, it.z0, "decorated_pot", { waterlogged: "false" });
  c.put1(it.x1, it.z1, "barrel", { facing: "up", open: "false" });
}

/**
 * `market_ramada` — open post-and-thatch stalls.
 *
 * An awning on posts is the whole building: the apron carries the posts on
 * every face, the roof is thatch over them, and the inside is trestles and
 * baskets rather than rooms.
 */
function fitMarketRamada(ctx: FitOutContext, c: PropCounter): void {
  const wall = wallPlan(ctx);
  const roof = roofPlan(ctx);
  const post = ctx.style["wall.accent"] as string;

  if (wall !== null) {
    const height = Math.max(2, Math.min(4, ctx.wallTop - 1));
    for (const cell of apronOf(wall.sx, wall.sz)) {
      const corner = (cell.x === -1 || cell.x === wall.sx) && (cell.z === -1 || cell.z === wall.sz);
      if (!corner && (cell.x + cell.z) % 4 !== 0) continue;
      apronPost(ctx, c, cell.x, cell.z, height, post);
    }
  }

  if (roof !== null) {
    clearRoof(ctx, roof);
    lid(ctx, c, roof);
    // The thatch: two filled decks stepping in, in the theme's roof material.
    const thatch = ctx.style["roof.solid"] as string;
    tiers(ctx, c, roof, 1, () => thatch);
  }

  const it = ctx.interior;
  const trestle = ctx.style["stone.slab"] as string;
  for (let z = it.z0; z <= it.z1; z += 2) {
    c.put1(it.x0, z, trestle, { type: "bottom", waterlogged: "false" });
    c.put1(it.x1, z, "barrel", { facing: "up", open: "false" });
  }
  c.put1(Math.floor((it.x0 + it.x1) / 2), it.z0, "decorated_pot", { waterlogged: "false" });
}

/**
 * `tzompantli_rack` — the skull rack, and the pack's exercise in restraint.
 *
 * The curator's note says restrained and this file takes it literally: the
 * rack is **posts and cross beams**, a frame standing in the apron of a plain
 * platform, and what a frame like that carried is left to the reader. Nothing
 * here is a head.
 */
function fitTzompantliRack(ctx: FitOutContext, c: PropCounter): void {
  const wall = wallPlan(ctx);
  const roof = roofPlan(ctx);
  const post = ctx.style["wall.accent"] as string;

  if (wall !== null) {
    c.n += reclad(ctx, wall, 1, ctx.wallTop, limestone(ctx));
    const face = ctx.door === null ? "south" : opposite(ctx.door.face);
    const [fx, fz] = cardinalStep(face);
    const height = Math.max(2, Math.min(4, ctx.wallTop - 1));
    const cells: { x: number; z: number }[] = [];
    if (fz !== 0) {
      const z = fz > 0 ? wall.sz : -1;
      for (let x = 0; x < wall.sx; x += 3) cells.push({ x, z });
    } else {
      const x = fx > 0 ? wall.sx : -1;
      for (let z = 0; z < wall.sz; z += 3) cells.push({ x, z });
    }
    const stood: { x: number; z: number }[] = [];
    for (const cell of cells) {
      if (apronPost(ctx, c, cell.x, cell.z, height, post)) stood.push(cell);
    }
    // Two cross beams between the posts, at the head and at mid height: the
    // rack itself. Each beam cell has a post or another beam cell beside it.
    for (const y of [height, Math.max(1, height - 2)]) {
      for (let i = 0; i + 1 < stood.length; i++) {
        const a = stood[i] as { x: number; z: number };
        const b = stood[i + 1] as { x: number; z: number };
        const steps = Math.max(Math.abs(b.x - a.x), Math.abs(b.z - a.z));
        if (steps === 0) continue;
        for (let k = 0; k <= steps; k++) {
          const x = a.x + Math.round(((b.x - a.x) * k) / steps);
          const z = a.z + Math.round(((b.z - a.z) * k) / steps);
          if (onWayIn(ctx, x, z)) continue;
          if (protectedAt(ctx, x, y, z)) continue;
          c.raw(x, y, z, post);
        }
      }
    }
  }

  if (roof !== null) {
    clearRoof(ctx, roof);
    lid(ctx, c, roof);
    cornice(ctx, c, roof, roof.base + 1);
  }

  const it = ctx.interior;
  stela(ctx, c, it.x0, it.z0);
  c.put1(it.x1, it.z1, "decorated_pot", { waterlogged: "false" });
}

/* -------------------------------------------------------------------------- */
/* the works and the ground                                                    */
/* -------------------------------------------------------------------------- */

/**
 * `chultun_cistern` — the bottle cistern's curbed mouth under a corbelled
 * shoulder.
 *
 * A chultun is a flask cut into the bedrock, and the part of it a body meets
 * is the **mouth**: a curb of walls round a lid, with the catchment floor
 * sloping to it. The shaft itself is below the floor plane, where a building
 * fit-out may not go, so it is implied by the curb rather than lied about.
 */
function fitChultunCistern(ctx: FitOutContext, c: PropCounter): void {
  const wall = wallPlan(ctx);
  const roof = roofPlan(ctx);

  if (wall !== null) c.n += reclad(ctx, wall, 1, ctx.wallTop, mossyMasonry(ctx));

  if (roof !== null) {
    clearRoof(ctx, roof);
    lid(ctx, c, roof);
    // The shoulder: two decks stepping in, which is what a corbel is.
    tiers(ctx, c, roof, 1, mossyMasonry(ctx));
  }

  const it = ctx.interior;
  const lamp = lanternColumn(it);
  const curb = ctx.style["stone.wall"] as string;
  // The mouth, off the lantern column so the room's own light is never the
  // cell a body has to route through.
  const mx = lamp.x === it.x0 ? it.x0 + 1 : it.x0;
  const mz = Math.floor((it.z0 + it.z1) / 2);
  for (const [dx, dz] of [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ] as const) {
    const x = mx + dx;
    const z = mz + dz;
    if (x < it.x0 || x > it.x1 || z < it.z0 || z > it.z1) continue;
    if (x === lamp.x && z === lamp.z) continue;
    c.put1(x, z, curb, {
      north: "false",
      south: "false",
      east: "false",
      west: "false",
      up: "true",
      waterlogged: "false",
    });
  }
  c.put1(mx, mz, "cauldron", { level: "3" });
  c.put1(it.x1, it.z1, "barrel", { facing: "up", open: "false" });
}

/**
 * `sacbe_terminus` — the raised white-road platform where a causeway lands.
 *
 * A sacbe is a *raised* road, and its terminus is the plinth it climbs onto.
 * So this is the pack's plainest building and its most useful: a broad plinth
 * with steps all round, a clear deck on top, and a rank of markers.
 */
function fitSacbeTerminus(ctx: FitOutContext, c: PropCounter): void {
  const wall = wallPlan(ctx);
  const roof = roofPlan(ctx);
  const stone = ctx.style["foundation.primary"] as string;
  const stairs = ctx.style["stone.stairs"] as string;

  if (wall !== null) {
    c.n += reclad(ctx, wall, 1, ctx.wallTop, limestone(ctx));
    // The steps: an apron ring of stairs facing OUT, so a body climbs onto
    // the plinth from any side. Never over the way in.
    for (const cell of apronOf(wall.sx, wall.sz)) {
      if (onWayIn(ctx, cell.x, cell.z)) continue;
      footing(ctx, c, cell.x, cell.z, stone);
      const away: Cardinal =
        cell.x === -1 ? "east" : cell.x === wall.sx ? "west" : cell.z === -1 ? "south" : "north";
      c.raw(cell.x, 1, cell.z, stairs, {
        facing: away,
        half: "bottom",
        shape: "straight",
        waterlogged: "false",
      });
    }
  }

  if (roof !== null) {
    clearRoof(ctx, roof);
    lid(ctx, c, roof);
    cornice(ctx, c, roof, roof.base + 1);
  }

  const it = ctx.interior;
  const lamp = lanternColumn(it);
  for (const corner of [
    { x: it.x0, z: it.z0 },
    { x: it.x1, z: it.z1 },
  ]) {
    if (corner.x === lamp.x && corner.z === lamp.z) continue;
    stela(ctx, c, corner.x, corner.z);
  }
  c.put1(it.x1, it.z0, ctx.style["stone.slab"] as string, {
    type: "bottom",
    waterlogged: "false",
  });
}

/**
 * `milpa_terrace` — the maize terrace and its retaining steps.
 *
 * Beds rather than furniture: alternating rows of the floor plane are written
 * as `moss_block` and `coarse_dirt`, which are **whole blocks** and therefore
 * walkable — `farmland` is fifteen sixteenths of a cube and is the `mud`
 * lesson wearing a hat.
 */
function fitMilpaTerrace(ctx: FitOutContext, c: PropCounter): void {
  const wall = wallPlan(ctx);
  const roof = roofPlan(ctx);
  const stone = ctx.style["foundation.primary"] as string;

  if (wall !== null) {
    c.n += reclad(ctx, wall, 1, ctx.wallTop, mossyMasonry(ctx));
    // The retaining wall: an apron plinth course, which is what holds a
    // terrace up on a slope.
    for (const cell of apronOf(wall.sx, wall.sz)) {
      if (onWayIn(ctx, cell.x, cell.z)) continue;
      footing(ctx, c, cell.x, cell.z, stone);
      c.raw(cell.x, 1, cell.z, mesoJitter(cell.x, 1, cell.z, 6) === 0 ? "mossy_stone_bricks" : stone);
    }
  }

  if (roof !== null) {
    clearRoof(ctx, roof);
    lid(ctx, c, roof);
    cornice(ctx, c, roof, roof.base + 1);
  }

  // The beds, written INTO the floor plane at y = 0: no cell of the room ever
  // becomes unwalkable, because every block written is a full cube.
  const it = ctx.interior;
  for (let z = it.z0; z <= it.z1; z++) {
    if ((z - it.z0) % 2 === 1) continue;
    for (let x = it.x0; x <= it.x1; x++) {
      c.raw(x, 0, z, (x + z) % 3 === 0 ? "coarse_dirt" : "moss_block");
    }
  }
  c.put1(it.x1, it.z1, "hay_block", { axis: "y" });
  c.put1(it.x0, it.z1, "barrel", { facing: "up", open: "false" });
}

/**
 * `canoe_landing` — the plank landing and its racks.
 *
 * The landing is an apron deck stepping down to the water on the far side of
 * the door, and the racks inside are the dugouts drawn up out of it. Nothing
 * here goes below the floor plane: a slipway is a *stair*, not a hole.
 */
function fitCanoeLanding(ctx: FitOutContext, c: PropCounter): void {
  const wall = wallPlan(ctx);
  const roof = roofPlan(ctx);
  const plank = ctx.style["wall.primary"] as string;
  const stairs = ctx.style["roof.stairs"] as string;

  if (wall !== null) {
    c.n += reclad(ctx, wall, 1, ctx.wallTop, poleWall(ctx));
    const face = ctx.door === null ? "south" : opposite(ctx.door.face);
    const [fx, fz] = cardinalStep(face);
    const cells: { x: number; z: number }[] = [];
    if (fz !== 0) {
      const z = fz > 0 ? wall.sz : -1;
      for (let x = 0; x < wall.sx; x++) cells.push({ x, z });
    } else {
      const x = fx > 0 ? wall.sx : -1;
      for (let z = 0; z < wall.sz; z++) cells.push({ x, z });
    }
    for (const cell of cells) {
      if (onWayIn(ctx, cell.x, cell.z)) continue;
      footing(ctx, c, cell.x, cell.z, plank);
      c.raw(cell.x, 1, cell.z, stairs, {
        facing: face,
        half: "bottom",
        shape: "straight",
        waterlogged: "false",
      });
    }
  }

  if (roof !== null) {
    clearRoof(ctx, roof);
    lid(ctx, c, roof);
    const thatch = ctx.style["roof.solid"] as string;
    tiers(ctx, c, roof, 1, () => thatch);
  }

  const it = ctx.interior;
  for (let z = it.z0; z <= it.z1; z += 3) {
    c.put1(it.x0, z, ctx.style["wall.accent"] as string, { axis: "z" });
  }
  c.put1(it.x1, it.z0, "barrel", { facing: "up", open: "false" });
  c.put1(it.x1, it.z1, "decorated_pot", { waterlogged: "false" });
}

/* -------------------------------------------------------------------------- */
/* the houses                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * `thatch_dwelling` — pole walls and a steep thatch, the house that has not
 * changed in two thousand years.
 *
 * The roof is the whole read: steep, deep-eaved, and hipped on all four sides.
 * Built as filled decks stepping in by one per course — the thatch is a mass
 * in this medium, not a membrane.
 */
function fitThatchDwelling(ctx: FitOutContext, c: PropCounter): void {
  const wall = wallPlan(ctx);
  const roof = roofPlan(ctx);

  if (wall !== null) c.n += reclad(ctx, wall, 1, ctx.wallTop, poleWall(ctx));

  if (roof !== null) {
    clearRoof(ctx, roof);
    lid(ctx, c, roof);
    const thatch = ctx.style["roof.solid"] as string;
    const ridge = ctx.style["roof.slab"] as string;
    const levels = tiers(ctx, c, roof, 1, () => thatch);
    const crown = levels[levels.length - 1];
    if (crown !== undefined && crown.y < roof.top) {
      deck(c, crown.y + 1, crown.x0, crown.x1, crown.z0, crown.z1, () => ridge);
    }
  }

  const it = ctx.interior;
  const end = farEnd(ctx);
  c.put1(it.x0, end.z, "barrel", { facing: "up", open: "false" });
  c.put1(it.x1, end.z, "decorated_pot", { waterlogged: "false" });
  const hearthZ = end.look === "north" ? it.z1 : it.z0;
  c.put1(Math.floor((it.x0 + it.x1) / 2), hearthZ, ctx.style["chimney.block"] as string);
}

/**
 * `temazcal_bath` — the low domed sweat bath.
 *
 * Low is the point: a temazcal is a dome a body crouches into, with a fire
 * pit outside it and hot stones within. The dome is discs stepping in fast
 * (rule 3, filled), and the hot stones inside are capped short of the ceiling
 * (rule 5) — a stack of stones is exactly the shape `interior.blocked_column`
 * was written for.
 */
function fitTemazcalBath(ctx: FitOutContext, c: PropCounter): void {
  const wall = wallPlan(ctx);
  const roof = roofPlan(ctx);

  if (wall !== null) c.n += reclad(ctx, wall, 1, ctx.wallTop, mossyMasonry(ctx));

  if (roof !== null) {
    clearRoof(ctx, roof);
    lid(ctx, c, roof);
    const stone = mossyMasonry(ctx);
    const cx = (roof.sx - 1) / 2;
    const cz = (roof.sz - 1) / 2;
    const r0 = Math.min(cx, cz);
    for (let y = roof.base + 1; y <= roof.top; y++) {
      const radius = r0 - (y - roof.base - 1) * 1.4;
      if (radius < 0.5) break;
      for (let z = 0; z < roof.sz; z++) {
        for (let x = 0; x < roof.sx; x++) {
          const dx = x - cx;
          const dz = z - cz;
          if (dx * dx + dz * dz > radius * radius) continue;
          c.raw(x, y, z, stone(x, y, z));
        }
      }
    }
  }

  const it = ctx.interior;
  const lamp = lanternColumn(it);
  const end = farEnd(ctx);
  // The hot stones, against the far wall and off the lantern column.
  const hx = it.x0 === lamp.x ? it.x0 + 1 : it.x0;
  if (c.put1(hx, end.z, ctx.style["chimney.block"] as string)) {
    c.stack(hx, end.z, 2, "chiseled_stone_bricks");
  }
  c.put1(it.x1, end.z, "cauldron", { level: "3" });
  c.put1(it.x1, end.look === "north" ? it.z1 : it.z0, "decorated_pot", { waterlogged: "false" });
}
