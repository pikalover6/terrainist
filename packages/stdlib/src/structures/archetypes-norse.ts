/**
 * The **Nordic & Viking pack's buildings** — the thirteen entries of that pack
 * which have an inside rather than a footprint on the heath.
 *
 * ## The thesis
 *
 * "A viking settlement" routes to the `medieval` era and arrives as a generic
 * European village in spruce. The *palette* was never the problem — the
 * catalog has had `boreal_pine` since the founding waves — the missing thing
 * is the **noun set**: a Norse place is a mead hall, a naust with a ship in
 * it, a turf house half sunk into the slope, a hof with idol posts in it and a
 * stave belfry over the burying ground, and the catalog could say none of
 * those. A cottage in spruce is a cottage.
 *
 * The thirteen:
 *
 * - `norse_mead_hall` — the anchor: the long drinking hall with the central
 *   hearth run down its axis, benches either side of it and the carved gable
 *   posts at the head;
 * - `jarls_hall` — grander, and organised round the **high seat**: a dais at
 *   the head with the two carved pillars either side of it and the guest
 *   benches ranked down both walls;
 * - `longship_shed` — the *naust*: keel blocks down the middle of an otherwise
 *   empty floor, spars and oars racked along one wall;
 * - `turf_house` — half sunk, the roof carried on paired posts, one long bench
 *   down the warm wall and the hearth at its middle;
 * - `stave_belfry` — the small stave tower: four corner posts, the bell frame
 *   up under the boards and the striking rope hanging beside it;
 * - `norse_forge` — anvil, bellows box, slack tub and the charcoal in the
 *   corner;
 * - `hof_shrine` — the heathen temple: three idol posts at the head, the blót
 *   bowl on the stall in front of them and the offering ring round it;
 * - `fishermans_cabin` — one room, a bunk on the cold wall, nets on the rail
 *   and the catch barrels by the door;
 * - `weaving_hall` — warp-weighted looms standing against the light wall with
 *   the wool bins under them;
 * - `shield_wall_gate` — the gate room hung with shields, benches for the
 *   watch and the spear rack against the inner wall;
 * - `palisade_watchtower` — the lookout floor: a rail round the edge, the
 *   signal brazier bedded in stone and the ladder well left open;
 * - `norse_storehouse` — the *stabbur*: cargo stacked clear of the floor on a
 *   slab plinth, with the grain bins down the far wall;
 * - `wool_shed_norse` — the fleece store: hurdles down one wall, the bales up
 *   on a plinth off the cold floor, the sorting table across the head. The id
 *   carries the pack because `wool_shed` is the agrarian expansion's and a
 *   form pack's members must be unique across the whole registry; the *words*
 *   stay where they were.
 *
 * ## The design law, and this file's place under it
 *
 * `archetypes-blitz.ts` states it and this file obeys it: an archetype is a
 * **fit-out, not a second grammar**. Everything here runs after the shape
 * stages and writes into the same cell map. Not a line of `core.ts` moves for
 * any of it — and, like `archetypes-hedgerow.ts` and `archetypes-wilds.ts`
 * which are this file's nearest models, it does **no exterior work at all**:
 * it never writes above the eave plate, never touches the wall ring and never
 * puts a block in the apron. The naust's open gable and the mead hall's curved
 * ridge are the *shell's* business, shaped through
 * {@link norseFacadeDefaults}; a carved post drawn out in the apron would be a
 * column with nothing under it, which is `floating.isolated` in its oldest
 * clothes.
 *
 * ## The rules, every one of them paid for by an earlier wave
 *
 * 1. **Everything goes through {@link PropCounter}**, which routes through the
 *    ground floor's own `free` and `take` — the door approach, the stair
 *    columns, the connectivity guard and the blocked-column guard, none of
 *    them restated here. There is not one `raw` call in this file, so the door
 *    column and its doorstep are untouchable by construction.
 * 2. **Everything stands against a wall and the middle stays walkable.** The
 *    hall's benches, the naust's keel blocks and the loom rank each leave the
 *    room one walkable region on every envelope the solver can hand it.
 * 3. **Nothing is a pillar.** A stack filling an interior column from floor to
 *    ceiling is `interior.blocked_column`, and `PropCounter`'s headroom guard
 *    refuses it — which is why every carved post and every loom here is
 *    written with {@link headroomOf} in hand rather than at a fixed height.
 * 4. **No lantern by name, and no lit fire.** The lint's lantern rule fires on
 *    any block whose name ends `lantern` and wants a floor under it or a chain
 *    over it. Every glow in this file is `glowstone` bedded against solid
 *    neighbours — a full cube against full cubes, with no support rule to
 *    fail. The shell hangs the room's one real light and this file never
 *    touches it.
 * 5. **No sign blocks**, no bare `flower_pot`, and `cauldron` takes no
 *    properties. **`chain` is not in the pinned 1.21.11 table**: every hanging
 *    line here is `iron_bars`.
 * 6. **No `mud`** anywhere — 15/16 of a block is a floor a body cannot stand
 *    on, and the turf read comes from the theme's own stone and timber.
 * 7. **No transcendental maths and no unseeded draw.** Every pattern here is a
 *    pure function of position, so the same document compiles to the same hall
 *    forever.
 */

import { PropCounter, type FitOutContext } from "./archetypes-civic.js";
import { buildingIdFromTags, defineBuildingDescriptors } from "./descriptor.js";

/* -------------------------------------------------------------------------- */
/* the archetypes                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The thirteen archetypes this file fits out, in catalog order.
 *
 * Spread into `BUILDING_ARCHETYPES` by `archetypes.ts` and mirrored in the
 * same order by the spec package's `KNOWN_BUILDING_ARCHETYPES` — where the
 * order is asserted element by element, so it is load-bearing in both places.
 */
export const NORSE_BUILDING_ARCHETYPES = [
  "norse_mead_hall",
  "jarls_hall",
  "longship_shed",
  "turf_house",
  "stave_belfry",
  "norse_forge",
  "hof_shrine",
  "fishermans_cabin",
  "weaving_hall",
  "shield_wall_gate",
  "palisade_watchtower",
  "norse_storehouse",
  "wool_shed_norse",
] as const;

/** One of the archetypes this file fits out. */
export type NorseBuildingArchetype = (typeof NORSE_BUILDING_ARCHETYPES)[number];

/** True for an archetype this file answers to. */
export function isNorseArchetype(value: string): value is NorseBuildingArchetype {
  return (NORSE_BUILDING_ARCHETYPES as readonly string[]).includes(value);
}

/**
 * Tag → archetype, or `null` when nothing matches.
 *
 * Consulted immediately after the Nile pack's table, where every later wave
 * sits, and for that same reason: the tables below it are greedy. The
 * **non-claims** are the load-bearing half of this comment, and this pack's
 * list is long because the Norse vocabulary is made of words older tables
 * already own and own correctly:
 *
 * - **bare `longhouse` and bare `mead_hall` are NOT ours.** Both belong to
 *   wave 4A's residential `longhouse` and have since G4, and a document that
 *   writes either wants the building it already gets — a good one. This
 *   pack's drinking hall answers to `norse_mead_hall`, `mjod_hall` and
 *   `drinking_hall` only, and the residential longhouse stays a **member of
 *   the pack** rather than a second copy of itself;
 * - **bare `hall` is not ours** — the original table's, where it means a great
 *   hall — and neither is bare `keep`, `castle` or `manor`. The chieftain's
 *   hall answers to `jarls_hall`, `chieftain_hall` and `high_seat_hall`;
 * - **bare `boathouse`, `shipyard`, `dock` and `ship_shed` are not ours.**
 *   Track A owns the first three and the classical pack the fourth. The naust
 *   answers to `longship_shed`, `naust` and `boat_shed`;
 * - **bare `sod_house`, `turf`, `sod` and `hut` are not ours** — `sod_house`
 *   is wave three's regional dwelling and has the better claim on every one
 *   of those words. The turf house answers to `turf_house` and `torfbaer`;
 * - **bare `bell_tower`, `belfry`, `campanile` and `tower` are not ours**:
 *   the faith wave's masonry shaft and the watchtower own them. The stave
 *   tower answers to `stave_belfry`, `stave_church` and `stave_tower` —
 *   `stave_church` deliberately, because a stave church is what a stranger
 *   calls this silhouette and nothing else in the catalog claims the word;
 * - **bare `smithy`, `forge` and `foundry` are not ours** — the founding
 *   table's and the industry wave's. This one answers to `norse_forge` and
 *   `viking_smithy`;
 * - **bare `shrine`, `temple` and `chapel` are not ours**, exactly as the
 *   sanctum, Nile and East Asian packs each recorded: they mean church in the
 *   extended table and stay there. The heathen temple answers to `hof_shrine`,
 *   `hof` and `heathen_temple`;
 * - **bare `cabin`, `cottage` and `fisherman` are not ours** — the wilds
 *   pack's, the founding table's and the fabric's respectively. The cabin
 *   answers to `fishermans_cabin` and `fisher_cabin`;
 * - **bare `weaving`, `mill`, `textile_mill` and `wool_shed` are not ours**;
 *   the loom room answers to `weaving_hall` and `loom_house`;
 * - **bare `gate`, `gatehouse` and `barbican` are not ours** — the town and
 *   garrison waves'. The shield gate answers to `shield_wall_gate` and
 *   `shield_gate`;
 * - **bare `watchtower`, `lookout` and `palisade` are not ours** — the first
 *   two are claimed *above every table in this file* by `archetypeOfTags`
 *   itself, and `palisade` is the garrison wave's linear work. This tower
 *   answers to `palisade_watchtower` and `norse_watchtower`;
 * - **bare `storehouse`, `store`, `warehouse` and `granary` are not ours** —
 *   the granary's, the general store's and the warehouse's. The stabbur
 *   answers to `norse_storehouse`, `stabbur` and `skemma`;
 * - **bare `wool_shed`, `woolshed` and `shearing_shed` are not ours** — every
 *   one of them is the agrarian expansion's shearing shed and stays there.
 *   The fleece store answers to `wool_shed_norse`, `norse_wool_shed` and
 *   `fleece_shed`.
 *
 * Every claim below is therefore either a compound of this pack's own ids or a
 * word (`naust`, `torfbaer`, `hof`, `stabbur`, `skemma`, `mjod_hall`) that no
 * table in the catalog has ever claimed.
 */
function norseArchetypeOfTags(tags: readonly string[]): NorseBuildingArchetype | null {
  return buildingIdFromTags(NORSE_BUILDING_DESCRIPTORS, tags);
}

/**
 * Facade tendencies for this file's archetypes.
 *
 * Same contract as every other wave's: defaults a caller merges into its
 * params, never something applied over an explicit one.
 *
 * Twelve of the thirteen ask for **`gable`**, and that is the pack's whole
 * exterior argument in one field. Northern timber building is a *ridge*
 * architecture — the long roof carried down the length of the hall, the gable
 * end carved and facing the way in — and a hip roof on a mead hall is the one
 * detail that would make a stranger read it as a barn from the wrong country.
 * The belfry is the exception and takes the **`flat`** top its bell frame is
 * built under, which is also the shape that leaves the deepest gap between the
 * eave plate and the height allowance.
 *
 * The window rhythms carry the rest: the hall and the weaving room are lit
 * (`regular`), the naust and the storehouse are working sheds with the
 * sparsest openings a wall can have, and the **turf house, the forge and the
 * hof are `none`** — a rank of glass in a turf wall, a forge or a heathen
 * temple is exactly wrong, and `none` is the grammar's precise word for "the
 * only opening is the door the shell always hangs".
 */
export function norseFacadeDefaults(archetype: string): {
  readonly windowShape?: string;
  readonly windowRhythm?: string;
  readonly roof?: string;
} {
  switch (archetype) {
    case "norse_mead_hall":
      return { windowShape: "tall", windowRhythm: "regular", roof: "gable" };
    case "jarls_hall":
      return { windowShape: "tall", windowRhythm: "regular", roof: "gable" };
    case "longship_shed":
      return { windowShape: "single", windowRhythm: "sparse", roof: "gable" };
    case "turf_house":
      return { windowShape: "single", windowRhythm: "none", roof: "gable" };
    case "stave_belfry":
      return { windowShape: "tall", windowRhythm: "sparse", roof: "flat" };
    case "norse_forge":
      return { windowShape: "single", windowRhythm: "none", roof: "gable" };
    case "hof_shrine":
      return { windowShape: "single", windowRhythm: "none", roof: "gable" };
    case "fishermans_cabin":
      return { windowShape: "single", windowRhythm: "sparse", roof: "gable" };
    case "weaving_hall":
      return { windowShape: "tall", windowRhythm: "regular", roof: "gable" };
    case "shield_wall_gate":
      return { windowShape: "single", windowRhythm: "sparse", roof: "gable" };
    case "palisade_watchtower":
      return { windowShape: "single", windowRhythm: "sparse", roof: "gable" };
    case "norse_storehouse":
      return { windowShape: "single", windowRhythm: "sparse", roof: "gable" };
    case "wool_shed_norse":
      return { windowShape: "tall", windowRhythm: "regular", roof: "gable" };
    default:
      return {};
  }
}
/* -------------------------------------------------------------------------- */
/* descriptors — Phase 4 registry (no self-registration)                       */
/* -------------------------------------------------------------------------- */

/**
 * Ordered building descriptors for the Nordic & Viking pack.
 *
 * - Order mirrors \`NORSE_BUILDING_ARCHETYPES\` and \`norseArchetypeOfTags\` priority.
 * - \`tags\` is the full equivalence set per archetype (first is canonical id).
 * - \`facadeDefaults\` delegates to \`norseFacadeDefaults\` (nullable per-field, empty defaults preserved).
 * - \`furnish\` is the pack’s leaf handle (\`furnishNorse\`); no second grammar.
 * - No self-registration — central aggregator will import this array.
 */
export const NORSE_BUILDING_DESCRIPTORS = defineBuildingDescriptors(
  NORSE_BUILDING_ARCHETYPES,
  {
    tags: {
      norse_mead_hall: ["norse_mead_hall", "mjod_hall", "drinking_hall"],
      jarls_hall: ["jarls_hall", "chieftain_hall", "high_seat_hall"],
      longship_shed: ["longship_shed", "naust", "boat_shed"],
      turf_house: ["turf_house", "torfbaer"],
      stave_belfry: ["stave_belfry", "stave_church", "stave_tower"],
      norse_forge: ["norse_forge", "viking_smithy"],
      hof_shrine: ["hof_shrine", "hof", "heathen_temple"],
      fishermans_cabin: ["fishermans_cabin", "fisher_cabin"],
      weaving_hall: ["weaving_hall", "loom_house"],
      shield_wall_gate: ["shield_wall_gate", "shield_gate"],
      palisade_watchtower: ["palisade_watchtower", "norse_watchtower"],
      norse_storehouse: ["norse_storehouse", "stabbur", "skemma"],
      wool_shed_norse: ["wool_shed_norse", "norse_wool_shed", "fleece_shed"],
    },
    facadeDefaults: (id) => norseFacadeDefaults(id),
    furnish: furnishNorse,
    dispatch: "standard",
  },
);


/* -------------------------------------------------------------------------- */
/* the entry point                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Fit out one of this file's archetypes.
 *
 * Returns the number of blocks written, which `furnish` adds to its own count.
 * Zero, and not one cell touched, for anything that is not ours.
 */
function furnishNorse(ctx: FitOutContext): number {
  if (!isNorseArchetype(ctx.archetype)) return 0;
  const c = new PropCounter(ctx);
  switch (ctx.archetype) {
    case "norse_mead_hall":
      fitMeadHall(ctx, c);
      break;
    case "jarls_hall":
      fitJarlsHall(ctx, c);
      break;
    case "longship_shed":
      fitLongshipShed(ctx, c);
      break;
    case "turf_house":
      fitTurfHouse(ctx, c);
      break;
    case "stave_belfry":
      fitStaveBelfry(ctx, c);
      break;
    case "norse_forge":
      fitNorseForge(ctx, c);
      break;
    case "hof_shrine":
      fitHofShrine(ctx, c);
      break;
    case "fishermans_cabin":
      fitFishermansCabin(ctx, c);
      break;
    case "weaving_hall":
      fitWeavingHall(ctx, c);
      break;
    case "shield_wall_gate":
      fitShieldWallGate(ctx, c);
      break;
    case "palisade_watchtower":
      fitPalisadeWatchtower(ctx, c);
      break;
    case "norse_storehouse":
      fitNorseStorehouse(ctx, c);
      break;
    case "wool_shed_norse":
    default:
      fitNorseWoolShed(ctx, c);
      break;
  }
  return c.n;
}

/* -------------------------------------------------------------------------- */
/* the shared machinery                                                        */
/* -------------------------------------------------------------------------- */

/**
 * How many courses of clear air this storey actually has.
 *
 * On one floor the room runs to the eave plate; on more than one it stops at
 * the boards over it, and a fit-out that measured the first and built into the
 * second would put its loom through somebody's floor. Wave 3B's number,
 * restated here rather than imported for the reason every pack restates it:
 * two packs are two seams, and a shared private helper is a shared edit.
 */
function headroomOf(ctx: FitOutContext): number {
  return ctx.floors > 1 ? ctx.storyHeight - 1 : ctx.wallTop - 1;
}

/** The default properties of a fence post standing on its own. */
const POST = {
  east: "false",
  north: "false",
  south: "false",
  waterlogged: "false",
  west: "false",
} as const;

/** A closed barrel, the one cargo block every wave here uses. */
const BARREL = { facing: "up", open: "false" } as const;

/** A bottom slab — the bench top, the shelf and the table of this whole file. */
const SLAB = { type: "bottom", waterlogged: "false" } as const;

/** A run of bars along z — a net rail, a rope, a rack. */
const BARS_Z = {
  east: "false",
  north: "true",
  south: "true",
  waterlogged: "false",
  west: "false",
} as const;

/** A bare post of bars, joined to nothing sideways. */
const BARS_POST = {
  east: "false",
  north: "false",
  south: "false",
  waterlogged: "false",
  west: "false",
} as const;

/**
 * The wall a cell is nearest, as a stair `facing` that puts the **backrest**
 * against it.
 *
 * The stair-seat rule, obeyed everywhere in this file: a stair's `facing` is
 * the direction of its high half, so a bench against the north wall faces
 * north and the sitter looks south, into the room.
 */
function seatFacing(
  it: FitOutContext["interior"],
  x: number,
  z: number,
): "north" | "south" | "east" | "west" {
  if (z === it.z0) return "north";
  if (z === it.z1) return "south";
  if (x === it.x0) return "west";
  return "east";
}

/** The wall row furthest from the door — the head of a hall. */
function headRow(ctx: FitOutContext): number {
  const it = ctx.interior;
  if (ctx.door === null) return it.z0;
  return ctx.door.z > (it.z0 + it.z1) / 2 ? it.z0 : it.z1;
}

/**
 * Where along a wall row a fit-out can actually stand something `reach` cells
 * either side of a centre.
 *
 * The hedgerow pack's walk, restated: the middle of a wall is where the shell
 * reserves the hearth and where a door most often lands, so "centre it" is the
 * one answer unavailable on most envelopes. `null` means the room will give
 * none and the caller falls back to something one cell wide.
 */
function bayOn(ctx: FitOutContext, z: number, reach: number): number | null {
  const it = ctx.interior;
  const midX = Math.floor((it.x0 + it.x1) / 2);
  for (let d = 0; d <= it.x1 - it.x0; d++) {
    for (const x of d === 0 ? [midX] : [midX - d, midX + d]) {
      if (x - reach < it.x0 || x + reach > it.x1) continue;
      let clear = true;
      for (let dx = -reach; dx <= reach && clear; dx++) clear = ctx.free(x + dx, z);
      if (clear) return x;
    }
  }
  return null;
}

/**
 * **The long hearth** down a hall's axis, and the pack's one recurring shape.
 *
 * A Norse hall is organised round a fire that runs the *length* of the room,
 * not a fireplace in a wall, and this is the single detail that separates a
 * mead hall from a barn with tables in it. It is written as a run of dressed
 * stone on the middle column with a `glowstone` bedded in the middle of the
 * run — never `campfire`, which is a lit fire, and never anything whose name
 * ends `lantern`.
 *
 * The run is deliberately **broken at both ends**: the room stays one walkable
 * region however tight the envelope, because a body can always pass round the
 * fire at either end of it. Every cell goes through `put1`, so the walkability
 * guard can refuse any one of them outright and the hall is still a hall.
 */
function longHearth(ctx: FitOutContext, c: PropCounter, stone: string): void {
  const it = ctx.interior;
  const midX = Math.floor((it.x0 + it.x1) / 2);
  const from = it.z0 + 1;
  const to = it.z1 - 1;
  if (to < from) return;
  const glowAt = Math.floor((from + to) / 2);
  for (let z = from; z <= to; z++) {
    if ((z - from) % 2 === 1) continue; // the gaps that keep it a fire, not a wall
    c.put1(midX, z, z === glowAt ? "glowstone" : stone);
  }
}

/**
 * **The benches** down both long walls, the other half of a hall.
 *
 * Stairs with their backrest against the wall, in bays with a gap between
 * them, so the run reads as furniture rather than as a second wall. The gaps
 * are also what keeps the wall row itself steppable at intervals.
 */
function wallBenches(ctx: FitOutContext, c: PropCounter, seat: string, skipZ: number): void {
  const it = ctx.interior;
  for (const x of [it.x0, it.x1]) {
    for (let z = it.z0; z <= it.z1; z++) {
      if (z === skipZ) continue;
      if ((z - it.z0) % 3 === 2) continue; // the gap between two bays
      c.put1(x, z, seat, {
        facing: seatFacing(it, x, z),
        half: "bottom",
        shape: "straight",
      });
    }
  }
}

/**
 * A **carved post** — the pack's vertical accent, capped short of the ceiling.
 *
 * Rule 3 as one function: a stack that reaches the boards is
 * `interior.blocked_column` however handsome it is, so a post here is written
 * to `headroomOf(ctx) - 1` and never further. Two courses is the floor — a
 * post shorter than a body does not read as a post at all — so on a storey
 * with no room for one, nothing is written and the caller carries on.
 *
 * Returns whether it stood, because a caller ranking a pair wants to know.
 */
function carvedPost(ctx: FitOutContext, c: PropCounter, x: number, z: number, log: string): boolean {
  const head = headroomOf(ctx);
  if (head < 3) return false;
  if (!c.put1(x, z, log, { axis: "y" })) return false;
  for (let y = 2; y <= head - 1; y++) c.stack(x, z, y, log, { axis: "y" });
  return true;
}

/* -------------------------------------------------------------------------- */
/* the mead hall                                                               */
/* -------------------------------------------------------------------------- */

/**
 * `norse_mead_hall` — the anchor of the pack, and the only building in it a
 * stranger will name out loud.
 *
 * Three things, and nothing else: the **long hearth** down the axis, the
 * **benches** either side of it, and the **carved gable posts** flanking the
 * head of the room. The mead barrels stand at the door end where they are
 * broached, which is also the one part of a hall a body walks straight into.
 */
function fitMeadHall(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const stone = style["foundation.accent"] as string;
  const seat = style["stair.interior"] as string;
  const log = style["wall.accent"] as string;
  const headZ = headRow(ctx);

  longHearth(ctx, c, stone);
  wallBenches(ctx, c, seat, headZ);

  // The carved posts, flanking the head of the hall.
  const bay = bayOn(ctx, headZ, 2);
  if (bay !== null) {
    carvedPost(ctx, c, bay - 2, headZ, log);
    carvedPost(ctx, c, bay + 2, headZ, log);
  }

  // The high table across the head, written as slabs so a body can still
  // stand where it is.
  for (let x = it.x0 + 1; x <= it.x1 - 1; x++) {
    if ((x - it.x0) % 2 === 0) continue;
    c.put1(x, headZ, style["stone.slab"] as string, SLAB);
  }

  // The mead, at the door end.
  const doorEnd = headZ === it.z0 ? it.z1 : it.z0;
  c.put1(it.x0, doorEnd, "barrel", BARREL);
  c.put1(it.x1, doorEnd, "barrel", BARREL);
}

/* -------------------------------------------------------------------------- */
/* the chieftain's hall                                                        */
/* -------------------------------------------------------------------------- */

/**
 * `jarls_hall` — the mead hall organised round the **high seat**.
 *
 * The difference between this and the mead hall is one piece of furniture and
 * it is the whole building: the *öndvegi*, the high seat at the head with a
 * carved pillar either side of it, raised one course on a dais. Everything
 * else is the hall's — the long fire, the guest benches — because a
 * chieftain's hall *is* a hall, and a fit-out that made it something else
 * would be arguing with the note.
 *
 * The dais is a course of slabs rather than of full blocks: a body can stand
 * on a bottom slab, so the head of the room stays walkable and the seat is
 * still visibly raised.
 */
function fitJarlsHall(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const stone = style["foundation.accent"] as string;
  const seat = style["stair.interior"] as string;
  const slab = style["stone.slab"] as string;
  const log = style["wall.accent"] as string;
  const headZ = headRow(ctx);
  const look = headZ === it.z0 ? "north" : "south";

  longHearth(ctx, c, stone);
  wallBenches(ctx, c, seat, headZ);

  // The dais, a course of slabs across the head.
  for (let x = it.x0; x <= it.x1; x++) c.put1(x, headZ, slab, SLAB);

  // The high seat itself, and the two carved pillars either side of it. The
  // seat is written on the row *in front of* the dais, which is where a chair
  // on a dais actually is, and it faces the head so the sitter looks down the
  // hall.
  const front = headZ === it.z0 ? it.z0 + 1 : it.z1 - 1;
  const midX = bayOn(ctx, front, 1) ?? bayOn(ctx, front, 0);
  if (midX !== null && front >= it.z0 && front <= it.z1) {
    c.put1(midX, front, seat, { facing: look, half: "bottom", shape: "straight" });
    for (const x of [midX - 2, midX + 2]) {
      if (x < it.x0 || x > it.x1) continue;
      carvedPost(ctx, c, x, front, log);
    }
  }

  // The gift chests, at the door end where a guest sets them down.
  const doorEnd = headZ === it.z0 ? it.z1 : it.z0;
  c.put1(it.x0, doorEnd, "barrel", BARREL);
  c.put1(it.x1, doorEnd, "barrel", BARREL);
}

/* -------------------------------------------------------------------------- */
/* the naust                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * `longship_shed` — the *naust*, and the emptiest room in the pack on purpose.
 *
 * A boat shed is a building whose entire content is the **absence** of
 * content: the ship fills it, and the ship is not something a fit-out may
 * build (a hull is a prop with its own declared box — `ships.ts` — and drawing
 * one inside a shell would be a second grammar). So what this writes is the
 * evidence of the ship: the **keel blocks** down the middle of the floor in a
 * broken run a body steps over, the **spar rack** of `iron_bars` up under the
 * boards on one wall, and the **oars and tar barrels** at the head.
 *
 * The keel blocks are slabs, every one of them, and the run is broken: a solid
 * line down the axis of a narrow shed is a wall, and a shed a body cannot
 * cross is not a shed.
 */
function fitLongshipShed(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const slab = style["stone.slab"] as string;
  const head = headroomOf(ctx);
  const midX = Math.floor((it.x0 + it.x1) / 2);
  const headZ = headRow(ctx);

  // The keel blocks, down the axis in a broken run.
  for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
    if ((z - it.z0) % 3 !== 1) continue;
    c.put1(midX, z, slab, SLAB);
  }

  // The spar rack, up under the boards on one wall — head height, so the
  // floor beneath it keeps its two courses of air.
  if (head >= 3) {
    for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
      c.stack(it.x0, z, head, "iron_bars", BARS_Z);
    }
  }

  // The oars, standing against the other wall, and the tar at the head.
  for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
    if ((z - it.z0) % 2 === 0) continue;
    c.put1(it.x1, z, style["wall.fence"] as string, POST);
  }
  const bay = bayOn(ctx, headZ, 0);
  if (bay !== null) c.put1(bay, headZ, "barrel", BARREL);
}

/* -------------------------------------------------------------------------- */
/* the turf house                                                              */
/* -------------------------------------------------------------------------- */

/**
 * `turf_house` — the *torfbær*: half sunk, dark, and warm.
 *
 * Its whole plan is one **long bench** — the *set* — down the wall away from
 * the door, which is bed, seat and table at once and is what a turf house has
 * instead of rooms. The **hearth** sits at the middle of the floor as a single
 * bedded glow with dressed stone round it, and the **roof posts** stand in
 * pairs at the two ends, capped short of the boards.
 *
 * Nothing here is `mud`. A turf wall is 15/16 of a block and a floor of it is
 * a floor a body cannot stand on; the turf read is the theme's own stone and
 * the room's darkness, which {@link norseFacadeDefaults} supplies by asking
 * for no window rhythm at all.
 */
function fitTurfHouse(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const stone = style["foundation.accent"] as string;
  const slab = style["stone.slab"] as string;
  const log = style["wall.accent"] as string;
  const headZ = headRow(ctx);

  // The set: the long bench down the wall furthest from the door.
  const wallX = ctx.door !== null && ctx.door.x > (it.x0 + it.x1) / 2 ? it.x0 : it.x1;
  for (let z = it.z0; z <= it.z1; z++) c.put1(wallX, z, slab, SLAB);

  // The hearth, at the middle of the floor: the glow bedded, with stone either
  // side of it so it is a fire and not a lamp on the floor.
  const midZ = Math.floor((it.z0 + it.z1) / 2);
  const hx = bayOn(ctx, midZ, 1) ?? bayOn(ctx, midZ, 0);
  if (hx !== null) {
    c.put1(hx, midZ, "glowstone");
    for (const x of [hx - 1, hx + 1]) {
      if (x < it.x0 || x > it.x1 || x === wallX) continue;
      c.put1(x, midZ, stone);
    }
  }

  // The paired roof posts at the two ends of the room.
  for (const z of [it.z0, it.z1]) {
    const bay = bayOn(ctx, z, 1);
    if (bay === null) continue;
    carvedPost(ctx, c, bay - 1, z, log);
    carvedPost(ctx, c, bay + 1, z, log);
  }

  // The meal chest at the head.
  const chestX = wallX === it.x0 ? it.x1 : it.x0;
  c.put1(chestX, headZ, "barrel", BARREL);
}

/* -------------------------------------------------------------------------- */
/* the stave belfry                                                            */
/* -------------------------------------------------------------------------- */

/**
 * `stave_belfry` — the small stave tower over the burying ground.
 *
 * A stave building is a **post** building: four corner staves carrying
 * everything, and here they are the four interior corners, each a carved post
 * capped short of the boards. The **bell frame** is a run of `iron_bars`
 * across the top of the storey between two of them, with the **striking rope**
 * hanging from its middle — `iron_bars` again, because `chain` is not in the
 * pinned 1.21.11 table and the rope has to stop clear of the floor anyway.
 *
 * The bell itself is not written. `bell` is a block the faith wave places from
 * the shell with its own attachment rules, and a fit-out that laid a second
 * one would be arguing with the wave that owns it.
 */
function fitStaveBelfry(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const log = style["wall.accent"] as string;
  const head = headroomOf(ctx);

  // The four staves.
  for (const x of [it.x0, it.x1]) {
    for (const z of [it.z0, it.z1]) carvedPost(ctx, c, x, z, log);
  }

  if (head >= 4) {
    // The bell frame, across the top of the storey.
    for (let z = it.z0; z <= it.z1; z++) {
      c.stack(it.x0 + 1 > it.x1 ? it.x0 : it.x0 + 1, z, head, "iron_bars", BARS_Z);
    }
    // The striking rope, hanging one course under the frame at its middle.
    const midZ = Math.floor((it.z0 + it.z1) / 2);
    const midX = Math.floor((it.x0 + it.x1) / 2);
    c.stack(midX, midZ, head - 1, "iron_bars", BARS_POST);
  }

  // The bier trestle at the head, where a coffin is set down.
  const headZ = headRow(ctx);
  const bay = bayOn(ctx, headZ, 0);
  if (bay !== null) c.put1(bay, headZ, style["stone.slab"] as string, SLAB);
}

/* -------------------------------------------------------------------------- */
/* the forge                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * `norse_forge` — anvil, bellows, slack tub, charcoal.
 *
 * The **fire** is the head wall: a course of dressed stone with the glow bedded
 * in it and the breast carried one course over, so the glow has a solid block
 * above it and one either side — `glowstone`, never a block whose name ends
 * `lantern`, and never a lit `campfire`. The **anvil** stands out on the floor
 * a pace in front of the fire, which is the one piece of furniture in this
 * building that is allowed to be in the middle of the room and is a single
 * cell besides. The **slack tub** is a cauldron beside it and the **charcoal**
 * is stacked in the far corner.
 */
function fitNorseForge(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const stone = style["foundation.accent"] as string;
  const head = headroomOf(ctx);
  const fireZ = headRow(ctx);

  const fireX = bayOn(ctx, fireZ, 1) ?? bayOn(ctx, fireZ, 0);
  if (fireX !== null) {
    if (c.put1(fireX, fireZ, "glowstone") && head >= 3) c.stack(fireX, fireZ, 2, stone);
    for (const x of [fireX - 1, fireX + 1]) {
      if (x < it.x0 || x > it.x1) continue;
      c.put1(x, fireZ, stone);
    }
    // The anvil and the slack tub, a pace out into the room.
    const front = fireZ === it.z0 ? fireZ + 1 : fireZ - 1;
    if (front >= it.z0 && front <= it.z1) {
      c.put1(fireX, front, "anvil", { facing: "north" });
      if (fireX - 1 >= it.x0) c.put1(fireX - 1, front, "cauldron");
    }
  }

  // The bellows box and the tool barrels down one wall.
  for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
    if ((z - it.z0) % 3 !== 1) continue;
    c.put1(it.x0, z, "barrel", BARREL);
  }

  // The charcoal, in the corner furthest from the fire.
  const far = fireZ === it.z0 ? it.z1 : it.z0;
  c.put1(it.x1, far, "coal_block");
}

/* -------------------------------------------------------------------------- */
/* the hof                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * `hof_shrine` — the heathen temple, and the one building here with a rite in
 * it.
 *
 * Three **idol posts** stand across the head of the room — carved posts,
 * capped short of the boards like every post in this file — with the **stall**
 * in front of them: a run of dressed stone carrying the **blót bowl**, which
 * is a `cauldron` and takes no properties. Round it the **offering ring** of
 * unlit candles, which are lightless by design because a hof is not lit and
 * because a lit anything is a fire the lint has opinions about.
 *
 * The room's own light is the shell's hanging one and this file never touches
 * it.
 */
function fitHofShrine(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const stone = style["foundation.accent"] as string;
  const log = style["wall.accent"] as string;
  const headZ = headRow(ctx);

  // The three idols.
  const bay = bayOn(ctx, headZ, 2);
  if (bay !== null) {
    for (const x of [bay - 2, bay, bay + 2]) carvedPost(ctx, c, x, headZ, log);
  } else {
    const lone = bayOn(ctx, headZ, 0);
    if (lone !== null) carvedPost(ctx, c, lone, headZ, log);
  }

  // The stall and the bowl, a pace in front of the idols.
  const front = headZ === it.z0 ? headZ + 1 : headZ - 1;
  if (front >= it.z0 && front <= it.z1) {
    const stallX = bayOn(ctx, front, 1) ?? bayOn(ctx, front, 0);
    if (stallX !== null) {
      c.put1(stallX, front, "cauldron");
      for (const x of [stallX - 1, stallX + 1]) {
        if (x < it.x0 || x > it.x1) continue;
        c.put1(x, front, stone);
      }
    }
  }

  // The offering ring: unlit candles down both walls.
  for (const x of [it.x0, it.x1]) {
    for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
      if ((z - it.z0) % 3 !== 1) continue;
      c.put1(x, z, "white_candle", {
        candles: `${1 + ((z - it.z0) % 3)}`,
        lit: "false",
        waterlogged: "false",
      });
    }
  }
}

/* -------------------------------------------------------------------------- */
/* the fisherman's cabin                                                       */
/* -------------------------------------------------------------------------- */

/**
 * `fishermans_cabin` — one room on a cold shore.
 *
 * A **bunk** against one wall (a bed, which the palette supplies so the theme
 * keeps its colour), the **net rail** of `iron_bars` up under the boards on
 * the other, the **catch barrels** by the door and a **cauldron** of brine at
 * the head. Nothing else: a cabin with furniture in the middle of it is a
 * cottage, and the catalog already has an excellent cottage.
 */
function fitFishermansCabin(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const head = headroomOf(ctx);
  const headZ = headRow(ctx);
  const slab = style["stone.slab"] as string;

  // The bunk, along the wall away from the door.
  //
  // Written as **slabs and not as a `bed`**, deliberately: a bed is a two-cell
  // block whose halves must agree, and `put1` may legally refuse either one of
  // them — a head with no foot is a broken block, not a sparser cabin. A run of
  // bottom slabs is a bunk a body can also stand on, which is the safer of the
  // two shapes in a room this small.
  const bunkX = ctx.door !== null && ctx.door.x > (it.x0 + it.x1) / 2 ? it.x0 : it.x1;
  for (let z = it.z0; z <= it.z1; z++) {
    if ((z - it.z0) % 3 === 2) continue;
    c.put1(bunkX, z, slab, SLAB);
  }

  // The net rail, up under the boards on the other wall.
  const railX = bunkX === it.x0 ? it.x1 : it.x0;
  if (head >= 3) {
    for (let z = it.z0 + 1; z <= it.z1 - 1; z++) c.stack(railX, z, head, "iron_bars", BARS_Z);
  }

  // The catch, by the door, and the brine at the head.
  const doorEnd = headZ === it.z0 ? it.z1 : it.z0;
  c.put1(railX, doorEnd, "barrel", BARREL);
  const bay = bayOn(ctx, headZ, 0);
  if (bay !== null) c.put1(bay, headZ, "cauldron");
}

/* -------------------------------------------------------------------------- */
/* the weaving hall                                                            */
/* -------------------------------------------------------------------------- */

/**
 * `weaving_hall` — warp-weighted looms against the light.
 *
 * A warp-weighted loom leans against a **wall**, which is the only reason this
 * room can have looms at all: a frame in the middle of the floor would be a
 * pillar and `interior.blocked_column` would say so. Each loom is a post of
 * `iron_bars` against the wall — bars, not `chain`, and not a full cube, so
 * there is nothing here for the floating rule either — with the **wool bins**
 * standing under the run and the **cloth table** of slabs across the head.
 */
function fitWeavingHall(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const slab = style["stone.slab"] as string;
  const head = headroomOf(ctx);
  const headZ = headRow(ctx);

  // The looms, ranked against both long walls.
  for (const x of [it.x0, it.x1]) {
    for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
      if ((z - it.z0) % 2 === 0) continue;
      if (head < 3) continue;
      for (let y = 2; y <= head; y++) c.stack(x, z, y, "iron_bars", BARS_Z);
    }
  }

  // The wool bins, in the bays between the looms.
  for (const x of [it.x0, it.x1]) {
    for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
      if ((z - it.z0) % 2 === 1) continue;
      c.put1(x, z, "barrel", BARREL);
    }
  }

  // The cloth table across the head, in bays so it is not a wall of slab.
  for (let x = it.x0; x <= it.x1; x++) {
    if ((x - it.x0) % 2 === 1) continue;
    c.put1(x, headZ, slab, SLAB);
  }
}

/* -------------------------------------------------------------------------- */
/* the shield gate                                                             */
/* -------------------------------------------------------------------------- */

/**
 * `shield_wall_gate` — the gate room of a Norse stockade.
 *
 * The read is the **shields hung on the inner wall**, and the honest block for
 * a shield in this medium is a `trapdoor` laid flat against the wall face —
 * open, so it stands proud of the wall and is not a cube. They go up at the
 * *second* course rather than at the floor, because a shield at knee height is
 * furniture and one at eye height is a shield wall.
 *
 * Under them the **watch bench**, and against the wall opposite the **spear
 * rack** of `iron_bars`. The middle of the room is left completely clear,
 * which is what a gate room is for: a body walks through it.
 */
function fitShieldWallGate(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const seat = style["stair.interior"] as string;
  const trapdoor = style["wall.trapdoor"] as string;
  const head = headroomOf(ctx);

  if (head >= 3) {
    for (let z = it.z0; z <= it.z1; z++) {
      c.stack(it.x0, z, 2, trapdoor, {
        facing: "east",
        half: "bottom",
        open: "true",
        powered: "false",
        waterlogged: "false",
      });
    }
  }

  // The watch bench under the shields.
  for (let z = it.z0; z <= it.z1; z++) {
    if ((z - it.z0) % 3 === 2) continue;
    c.put1(it.x0, z, seat, {
      facing: seatFacing(it, it.x0, z),
      half: "bottom",
      shape: "straight",
    });
  }

  // The spear rack opposite, up under the boards.
  if (head >= 3) {
    for (let z = it.z0 + 1; z <= it.z1 - 1; z++) c.stack(it.x1, z, head, "iron_bars", BARS_Z);
  }

  // The watch's brazier at the head — bedded glow, solid on three sides.
  const headZ = headRow(ctx);
  const bay = bayOn(ctx, headZ, 1);
  if (bay !== null) {
    const stone = style["foundation.accent"] as string;
    if (c.put1(bay, headZ, "glowstone") && head >= 3) c.stack(bay, headZ, 2, stone);
    for (const x of [bay - 1, bay + 1]) {
      if (x < it.x0 || x > it.x1) continue;
      c.put1(x, headZ, stone);
    }
  }
}

/* -------------------------------------------------------------------------- */
/* the watchtower                                                              */
/* -------------------------------------------------------------------------- */

/**
 * `palisade_watchtower` — the lookout floor over a stockade.
 *
 * The tower's *shape* is the shell's and this file never argues with it. What
 * a lookout floor needs is three things: the **rail** round the edge (fence
 * posts at the corners and at intervals, never a solid run, because a solid
 * run is a second wall and a lookout has to be able to see), the **signal
 * brazier** bedded in stone at the head, and the **middle left completely
 * clear** for the ladder well the shell cuts.
 *
 * The spare torch bundle and the water butt stand in one corner, which is
 * where a watch actually keeps them.
 */
function fitPalisadeWatchtower(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const fence = style["wall.fence"] as string;
  const stone = style["foundation.accent"] as string;
  const head = headroomOf(ctx);
  const headZ = headRow(ctx);

  // The rail: posts at intervals round the ring, never a solid run.
  for (const x of [it.x0, it.x1]) {
    for (let z = it.z0; z <= it.z1; z++) {
      if ((z - it.z0) % 2 === 1) continue;
      if (z === headZ) continue;
      c.put1(x, z, fence, POST);
    }
  }

  // The brazier at the head.
  const bay = bayOn(ctx, headZ, 1) ?? bayOn(ctx, headZ, 0);
  if (bay !== null) {
    if (c.put1(bay, headZ, "glowstone") && head >= 3) c.stack(bay, headZ, 2, stone);
    for (const x of [bay - 1, bay + 1]) {
      if (x < it.x0 || x > it.x1) continue;
      c.put1(x, headZ, stone);
    }
  }

  // The watch's stores, in the corner furthest from the brazier.
  const far = headZ === it.z0 ? it.z1 : it.z0;
  c.put1(it.x1, far, "barrel", BARREL);
}

/* -------------------------------------------------------------------------- */
/* the stabbur                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * `norse_storehouse` — the *stabbur*, and the plainest room in the pack.
 *
 * A stabbur keeps food **off the floor**, which is its entire architectural
 * idea (outside, on staddle stones the shell may or may not give it; inside,
 * on a plinth). So the fit-out is a course of **slabs down both walls** with
 * the **cargo standing on nothing but that plinth**, and the **grain bins**
 * ranked along the head wall. The middle of the floor is bare, because that is
 * where a body carrying a sack has to walk.
 */
function fitNorseStorehouse(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const slab = style["stone.slab"] as string;
  const head = headroomOf(ctx);
  const headZ = headRow(ctx);

  // The plinth, down both walls.
  for (const x of [it.x0, it.x1]) {
    for (let z = it.z0; z <= it.z1; z++) {
      if (z === headZ) continue;
      c.put1(x, z, slab, SLAB);
    }
  }

  // The cargo, standing on the plinth in bays.
  if (head >= 3) {
    for (const x of [it.x0, it.x1]) {
      for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
        if ((z - it.z0) % 3 !== 1) continue;
        c.stack(x, z, 2, "barrel", BARREL);
      }
    }
  }

  // The grain bins along the head wall.
  for (let x = it.x0; x <= it.x1; x++) {
    if ((x - it.x0) % 2 === 1) continue;
    c.put1(x, headZ, "hay_block", { axis: "y" });
  }
}

/* -------------------------------------------------------------------------- */
/* the fleece shed                                                             */
/* -------------------------------------------------------------------------- */

/**
 * `wool_shed_norse` — the Norse fleece shed.
 *
 * **On the name.** The obvious id for this building is `wool_shed`, and it is
 * taken: the agrarian expansion pack ships an excellent shearing shed under
 * exactly that word, and a form pack's members must be unique across the whole
 * registry — a member named twice is a member whose pack nobody can determine.
 * So the id carries the pack (`wool_shed_norse`) and the *words* stay where
 * they were: bare `wool_shed`, `woolshed` and `shearing_shed` all still reach
 * the agrarian shed, and this one answers to `wool_shed_norse`,
 * `norse_wool_shed` and `fleece_shed`.
 *
 * **On the building.** It is not a second copy of the agrarian shed either.
 * That one is a *shearing floor* — the table down the middle, the catching
 * pens at one end. This is the northern half of the same trade: the **fleece
 * store**, where a winter's clip is kept dry. Hurdles down one wall, the
 * sorting table against the other, the bales stacked on a slab plinth so the
 * fleece never sits on a cold floor, and the tallow barrel at the head.
 */
function fitNorseWoolShed(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const slab = style["stone.slab"] as string;
  const fence = style["wall.fence"] as string;
  const head = headroomOf(ctx);
  const headZ = headRow(ctx);

  // The hurdles down one wall, in bays so the run is not a second wall.
  for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
    if ((z - it.z0) % 3 === 2) continue;
    c.put1(it.x0, z, fence, POST);
  }

  // The plinth and the bales down the other: fleece never on a cold floor.
  for (let z = it.z0; z <= it.z1; z++) {
    if (z === headZ) continue;
    c.put1(it.x1, z, slab, SLAB);
  }
  if (head >= 3) {
    for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
      if ((z - it.z0) % 2 === 1) continue;
      c.stack(it.x1, z, 2, "hay_block", { axis: "y" });
    }
  }

  // The sorting table across the head, in bays, and the tallow beside it.
  for (let x = it.x0; x <= it.x1; x++) {
    if ((x - it.x0) % 2 === 1) continue;
    c.put1(x, headZ, slab, SLAB);
  }
  const doorEnd = headZ === it.z0 ? it.z1 : it.z0;
  c.put1(it.x0, doorEnd, "barrel", BARREL);
}
