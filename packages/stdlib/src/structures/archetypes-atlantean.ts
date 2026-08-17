/**
 * The **Atlantean pack's buildings** — the thirteen entries of that pack which
 * have an inside rather than a footprint on the bare ground.
 *
 * ## The thesis
 *
 * "Atlantis", "a sunken city risen", "a drowned empire on dry land" all route
 * to the `ancient` era and arrive as a Greek town: a peripteral temple, an
 * agora, a stoa. The *palette* was never the problem — `white_quartz` has
 * shipped since the founding waves — the missing thing is the **noun set**. A
 * risen city is a tidal palace with the sea's own stone in its colonnade, a
 * trident temple, an oracle under a dome, a conch amphitheatre, a hall where
 * pearl divers sort the day's take, stalls built for sea-horses, a monumental
 * gate over a water channel, a court of coral planters, a navigators' academy,
 * salt baths, an archive the tide reached once and never left, a bell that
 * rings the tide, and a moon pool. The catalog could say none of those, and a
 * Greek temple in prismarine is still a Greek temple.
 *
 * ## What this pack is NOT
 *
 * **It does not build underwater.** Every one of these thirteen is a building
 * standing on land, in air, with a walkable floor — a city the sea gave back,
 * not a city the sea still holds. The pack's water is confined, without a
 * single exception, to **curbed sunken basins** (see {@link sunkenBasin}), and
 * every basin in it is stable by construction rather than by luck.
 *
 * The thirteen:
 *
 * - `tidal_palace` — the anchor: the prismarine-and-quartz colonnade down both
 *   walls, the shell motifs bedded between the columns, the throne dais at the
 *   head;
 * - `trident_temple` — the three prongs standing at the head over a chiselled
 *   altar band, tied across at head height;
 * - `sea_oracle_rotunda` — the pack's one piece of exterior work: the **dome**,
 *   built as filled discs stepping in, over a ring of seats and the oracle's
 *   own basin;
 * - `conch_amphitheater` — the banked seating, curved in at the corners so the
 *   bank reads as a spiral rather than as four benches;
 * - `pearl_diver_hall` — the dive lines overhead, the sorting benches under
 *   them and the rinse basin by the way in;
 * - `hippocamp_stable` — stalls built for a horse that swims: hurdles off one
 *   wall, dried kelp on the plinth, and **one curbed pool stall**;
 * - `tide_gate_arch` — the monumental arch over a water channel: the channel
 *   sunk into the floor down one side, one great arch bay spanning it;
 * - `coral_garden_court` — the court of planters: coral standing dry in kerbed
 *   beds down both walls, with the court's own basin at the middle;
 * - `navigator_academy` — the chart tables, the lodestone on its plinth and the
 *   armillary overhead;
 * - `salt_bath_terme` — the sunken bath, the heated benches round it and the
 *   brine cauldrons;
 * - `drowned_archive` — the water-stained library: the ranks of books, the tide
 *   line banded across the wall above them and the web where nobody has
 *   reached in a century. **Not one cell of water inside it** — a soaked
 *   library is a library, not a pond;
 * - `tide_bell_tower` — the bell, hung on **`iron_chain`** from a cap course of
 *   its own;
 * - `moon_pool_shrine` — the pool at the middle of the floor, curbed, with the
 *   four posts of the light well standing round it.
 *
 * ## The design law, and this file's place under it
 *
 * `archetypes-blitz.ts` states it and this file obeys it: an archetype is a
 * **fit-out, not a second grammar**. Everything here runs after the shape
 * stages and writes into the same cell map. Not a line of `core.ts` moves for
 * any of it.
 *
 * Twelve of the thirteen do **no exterior work at all**. The exception is the
 * **oracle's dome**, which is built the way the Mesoamerican pack's temazcal
 * and the steppe pack's ger are built and for the same reason — **filled discs
 * stepping in, each standing on the filled disc below it**. A dome built as a
 * ring per course is `floating.isolated` waiting to happen.
 *
 * ## The rules, every one of them paid for by an earlier wave
 *
 * 1. **Every interior block goes through {@link PropCounter}**, which routes
 *    through the ground floor's own `free` and `take` — the door approach, the
 *    stair columns, the connectivity guard and the blocked-column guard, none
 *    of them restated here. `raw` appears only above the eave plate and in the
 *    floor plane a basin's rim is written in.
 * 2. **Every pool is curb-closed and stable.** The water goes **into the
 *    floor** at `y = 0`, in a rect inset at least one cell from the interior on
 *    every side, and every floor cell touching it is written solid. Under every
 *    water cell is the shell's own foundation skirt; beside every water cell is
 *    either more basin or written rim; over it is air. That is the riad's
 *    argument and the science pond's, unchanged — and it is why this pack can
 *    have water at all. Nothing is ever placed **on** a water cell: the basin
 *    claims its cells through `take` before a drop of it is written.
 * 3. **Nothing is a pillar.** A stack filling an interior column floor to
 *    ceiling is `interior.blocked_column`, which is why every column here is
 *    written with {@link headroomOf} in hand rather than at a fixed height.
 * 4. **`iron_chain`, never `chain`.** `chain` is not in the pinned 1.21.11
 *    block table; `iron_chain` is, and it is what the bell hangs on. Every
 *    chain in this file has something solid directly above it, and the bell
 *    hangs directly under a chain — a hanger over air is `unsupported.chain`,
 *    which no render shows.
 * 5. **The glow is `sea_lantern` and `glowstone`, both bedded.** Neither ends
 *    in `lantern`... `sea_lantern` does, so it is only ever written with a
 *    solid block directly under it, which is exactly what the lint's lantern
 *    rule asks for. No `campfire`, no fire, nothing lit.
 * 6. **Coral is dry.** Every coral block in this file is a `dead_*` variant
 *    standing in air. A live coral block out of water dies on the first block
 *    tick, and a planter full of grey stubs is the one detail that would make
 *    the court read as a mistake rather than as a garden.
 * 7. **No sign blocks**, no bare `flower_pot`, no `mud`, no `farmland`, and no
 *    gravity block above the floor plane.
 * 8. **No transcendental maths and no unseeded draw.** Every pattern here is a
 *    pure function of position, so the same document compiles to the same city
 *    forever.
 */

import { PropCounter, ROOF_FLOURISH_RISE, type FitOutContext } from "./archetypes-civic.js";
import { cardinalStep, type LocalRect } from "./core.js";

/* -------------------------------------------------------------------------- */
/* the archetypes                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The thirteen archetypes this file fits out, in catalog order.
 *
 * Spread into `BUILDING_ARCHETYPES` by `archetypes.ts` **last**, and mirrored
 * in the same order and the same position by the spec package's
 * `KNOWN_BUILDING_ARCHETYPES` — where the order is asserted element by
 * element, so it is load-bearing in both places.
 */
export const ATLANTEAN_BUILDING_ARCHETYPES = [
  "tidal_palace",
  "trident_temple",
  "sea_oracle_rotunda",
  "conch_amphitheater",
  "pearl_diver_hall",
  "hippocamp_stable",
  "tide_gate_arch",
  "coral_garden_court",
  "navigator_academy",
  "salt_bath_terme",
  "drowned_archive",
  "tide_bell_tower",
  "moon_pool_shrine",
] as const;

/** One of the archetypes this file fits out. */
export type AtlanteanBuildingArchetype = (typeof ATLANTEAN_BUILDING_ARCHETYPES)[number];

/** True for an archetype this file answers to. */
export function isAtlanteanArchetype(value: string): value is AtlanteanBuildingArchetype {
  return (ATLANTEAN_BUILDING_ARCHETYPES as readonly string[]).includes(value);
}

/**
 * Tag → archetype, or `null` when nothing matches.
 *
 * Consulted with the other pack tables, above the greedy general tables and
 * below nothing that would change. The **non-claims** are the load-bearing
 * half of this comment, because a risen-city vocabulary brushes up against a
 * great deal of white-stone language the unicorn and Hellenist waves already
 * own, and own correctly:
 *
 * - **bare `palace` is NOT ours** — `palace_range` and the Mesoamerican
 *   `maya_palace` hold every plain spelling of it. Ours answers to
 *   `tidal_palace`, `atlantean_palace` and `sunken_palace`;
 * - **bare `temple`, `shrine` and `chapel` are not ours** — the church's and
 *   the sanctum wave's, across a dozen compounds. Ours answers to
 *   `trident_temple`, `trident_shrine` and `poseidon_temple`, `trident` being
 *   a word no table in the catalog has ever claimed;
 * - **bare `rotunda` is not ours.** There is a `rotunda` already and it is a
 *   perfectly good round civic room; the oracle answers to
 *   `sea_oracle_rotunda`, `sea_oracle` and `oracle_rotunda`;
 * - **bare `amphitheater`, `amphitheatre`, `theater`, `arena` and `stadium`
 *   are not ours** — the sanctum and leisure waves'. Ours answers to
 *   `conch_amphitheater`, `conch_theater` and `shell_amphitheater`;
 * - **bare `hall` is not ours**, nor any of its thirty compounds. The divers'
 *   room answers to `pearl_diver_hall`, `pearl_divers_hall` and `pearl_hall`;
 * - **bare `stable`, `stables` and `paddock` are not ours** — the founding
 *   table's, and the arcana wave already owns `pegasus_stable`,
 *   `griffin_stable` and `hippogriff_stable`. The sea-horse stalls answer to
 *   `hippocamp_stable`, `hippocamp_stalls` and `seahorse_stable`;
 * - **bare `gate`, `arch` and `gatehouse` are not ours** — the city gate's, the
 *   triumphal arch's and the memorial arch's. Ours answers to `tide_gate_arch`,
 *   `tide_gate` and `tidal_arch`;
 * - **bare `court`, `courtyard` and `garden` are not ours** — the ball court's,
 *   the courtyard house's and the botanical garden's. The planter court
 *   answers to `coral_garden_court`, `coral_court` and `coral_garden`;
 * - **bare `academy`, `school` and `university` are not ours** — the arcane
 *   academy's and the institution wave's. Ours answers to `navigator_academy`,
 *   `navigators_academy` and `star_chart_hall`;
 * - **bare `bathhouse`, `baths` and `bath` are not ours** — the leisure wave's,
 *   and the dwarven pack's `stone_bath_house` beside it. The salt baths answer
 *   to `salt_bath_terme`, `terme` and `salt_baths`, `terme` being the Roman
 *   word and unclaimed;
 * - **bare `archive` and `library` are not ours** — there is an `archive`
 *   already, and three magical libraries. Ours answers to `drowned_archive`,
 *   `sunken_archive` and `tide_library`;
 * - **bare `bell_tower`, `belfry`, `campanile`, `watchtower` and `tower` are
 *   not ours** — the town's, the stave church's and the watchtower's. Ours
 *   answers to `tide_bell_tower`, `tide_bell` and `sea_bell_tower`;
 * - **bare `pool`, `moon_gate` and `scrying_pool` are not ours** — the leisure
 *   wave's swimming pool and the arcana wave's scrying pool. The moon pool
 *   answers to `moon_pool_shrine`, `moon_pool` and `tide_shrine`.
 *
 * Every claim below is therefore either a compound of this pack's own ids or a
 * word (`trident`, `hippocamp`, `conch`, `terme`, `poseidon`) that no table in
 * the catalog has ever claimed.
 */
export function atlanteanArchetypeOfTags(
  tags: readonly string[],
): AtlanteanBuildingArchetype | null {
  const has = (t: string): boolean => tags.includes(t);
  if (has("tidal_palace") || has("atlantean_palace") || has("sunken_palace")) return "tidal_palace";
  if (has("trident_temple") || has("trident_shrine") || has("poseidon_temple")) {
    return "trident_temple";
  }
  if (has("sea_oracle_rotunda") || has("sea_oracle") || has("oracle_rotunda")) {
    return "sea_oracle_rotunda";
  }
  if (has("conch_amphitheater") || has("conch_theater") || has("shell_amphitheater")) {
    return "conch_amphitheater";
  }
  if (has("pearl_diver_hall") || has("pearl_divers_hall") || has("pearl_hall")) {
    return "pearl_diver_hall";
  }
  if (has("hippocamp_stable") || has("hippocamp_stalls") || has("seahorse_stable")) {
    return "hippocamp_stable";
  }
  if (has("tide_gate_arch") || has("tide_gate") || has("tidal_arch")) return "tide_gate_arch";
  if (has("coral_garden_court") || has("coral_court") || has("coral_garden")) {
    return "coral_garden_court";
  }
  if (has("navigator_academy") || has("navigators_academy") || has("star_chart_hall")) {
    return "navigator_academy";
  }
  if (has("salt_bath_terme") || has("terme") || has("salt_baths")) return "salt_bath_terme";
  if (has("drowned_archive") || has("sunken_archive") || has("tide_library")) {
    return "drowned_archive";
  }
  if (has("tide_bell_tower") || has("tide_bell") || has("sea_bell_tower")) return "tide_bell_tower";
  if (has("moon_pool_shrine") || has("moon_pool") || has("tide_shrine")) return "moon_pool_shrine";
  return null;
}

/**
 * Facade tendencies for this file's archetypes.
 *
 * Same contract as every other wave's: defaults a caller merges into its
 * params, never something applied over an explicit one.
 *
 * The oracle takes **`hip`**, the shape that leaves the deepest gap between the
 * eave plate and the height allowance — and that gap is where the dome is
 * built. The palace, the temple, the arch and the amphitheatre take **`flat`**,
 * because a risen classical city has parapets and terraces rather than pitched
 * roofs, and the working rooms take **`gable`**.
 *
 * The window rhythms carry the rest. The civic pieces are `regular` — a
 * colonnaded palace is mostly opening — the archive is `none`, because a room
 * whose whole subject is a book that got wet is a room kept dark, and the
 * stable and the bell floor are `sparse`.
 */
export function atlanteanFacadeDefaults(archetype: string): {
  readonly windowShape?: string;
  readonly windowRhythm?: string;
  readonly roof?: string;
} {
  switch (archetype) {
    case "tidal_palace":
      return { windowShape: "tall", windowRhythm: "regular", roof: "flat" };
    case "trident_temple":
      return { windowShape: "tall", windowRhythm: "regular", roof: "flat" };
    case "sea_oracle_rotunda":
      return { windowShape: "single", windowRhythm: "sparse", roof: "hip" };
    case "conch_amphitheater":
      return { windowShape: "wide", windowRhythm: "regular", roof: "flat" };
    case "pearl_diver_hall":
      return { windowShape: "wide", windowRhythm: "regular", roof: "gable" };
    case "hippocamp_stable":
      return { windowShape: "wide", windowRhythm: "sparse", roof: "gable" };
    case "tide_gate_arch":
      return { windowShape: "tall", windowRhythm: "sparse", roof: "flat" };
    case "coral_garden_court":
      return { windowShape: "wide", windowRhythm: "regular", roof: "flat" };
    case "navigator_academy":
      return { windowShape: "tall", windowRhythm: "regular", roof: "gable" };
    case "salt_bath_terme":
      return { windowShape: "single", windowRhythm: "sparse", roof: "hip" };
    case "drowned_archive":
      return { windowShape: "single", windowRhythm: "none", roof: "gable" };
    case "tide_bell_tower":
      return { windowShape: "single", windowRhythm: "sparse", roof: "flat" };
    case "moon_pool_shrine":
      return { windowShape: "tall", windowRhythm: "sparse", roof: "hip" };
    default:
      return {};
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
export function furnishAtlantean(ctx: FitOutContext): number {
  if (!isAtlanteanArchetype(ctx.archetype)) return 0;
  const c = new PropCounter(ctx);
  switch (ctx.archetype) {
    case "tidal_palace":
      fitTidalPalace(ctx, c);
      break;
    case "trident_temple":
      fitTridentTemple(ctx, c);
      break;
    case "sea_oracle_rotunda":
      fitOracleRotunda(ctx, c);
      break;
    case "conch_amphitheater":
      fitConchAmphitheater(ctx, c);
      break;
    case "pearl_diver_hall":
      fitPearlDiverHall(ctx, c);
      break;
    case "hippocamp_stable":
      fitHippocampStable(ctx, c);
      break;
    case "tide_gate_arch":
      fitTideGateArch(ctx, c);
      break;
    case "coral_garden_court":
      fitCoralGardenCourt(ctx, c);
      break;
    case "navigator_academy":
      fitNavigatorAcademy(ctx, c);
      break;
    case "salt_bath_terme":
      fitSaltBathTerme(ctx, c);
      break;
    case "drowned_archive":
      fitDrownedArchive(ctx, c);
      break;
    case "tide_bell_tower":
      fitTideBellTower(ctx, c);
      break;
    case "moon_pool_shrine":
    default:
      fitMoonPoolShrine(ctx, c);
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
 * second would put its chain through somebody's floor. Wave 3B's number,
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

/** A closed barrel — the pack's one cargo block. */
const BARREL = { facing: "up", open: "false" } as const;

/** A bottom slab: the bench top, the plinth and the kerb of this whole file. */
const SLAB = { type: "bottom", waterlogged: "false" } as const;

/** A run of bars along z — a dive line, an armillary ring, a rack. */
const BARS_Z = {
  east: "false",
  north: "true",
  south: "true",
  waterlogged: "false",
  west: "false",
} as const;

/** A run of bars along x. */
const BARS_X = {
  east: "true",
  north: "false",
  south: "false",
  waterlogged: "false",
  west: "true",
} as const;

/** A vertical link of `iron_chain` — the one hanger this pack uses. */
const CHAIN_Y = { axis: "y", waterlogged: "false" } as const;

/** A source block of water, sunk into the floor plane. */
const WATER = { level: "0" } as const;

/**
 * The wall a cell is nearest, as a stair `facing` that puts the **backrest**
 * against it.
 *
 * The stair-seat rule, obeyed everywhere in this file: a stair's `facing` is
 * the direction of its high half, so a bank against the north wall faces north
 * and the sitter looks south, into the room.
 */
function seatFacing(it: LocalRect, x: number, z: number): "north" | "south" | "east" | "west" {
  if (z === it.z0) return "north";
  if (z === it.z1) return "south";
  if (x === it.x0) return "west";
  return "east";
}

/** The wall row furthest from the door — the head of a room. */
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
 * Stand one block somewhere in a row, preferring a cell and walking outward.
 *
 * The dwarven pack's law, banked and restated: a **single must-have** prop —
 * the bell, the lodestone, the throne — must not vanish because the one cell
 * it wanted was the door's. `free()` and `put1()` answer different questions,
 * so this asks `put1` itself, at every cell of the row, until one takes.
 */
function standInRow(
  ctx: FitOutContext,
  c: PropCounter,
  z: number,
  preferX: number,
  block: string,
  props?: Record<string, string>,
): boolean {
  const it = ctx.interior;
  if (z < it.z0 || z > it.z1) return false;
  for (let d = 0; d <= it.x1 - it.x0; d++) {
    for (const x of d === 0 ? [preferX] : [preferX - d, preferX + d]) {
      if (x < it.x0 || x > it.x1) continue;
      if (c.put1(x, z, block, props)) return true;
    }
  }
  return false;
}

/**
 * A **column** of the sea's own stone, capped short of the ceiling.
 *
 * Rule 3 as one function: a stack that reaches the boards is
 * `interior.blocked_column` however handsome it is, so a column here is
 * written to `headroomOf(ctx) - 1` and never further. Two courses is the
 * floor — a column shorter than a body does not read as a column at all — so
 * on a storey with no room for one, nothing is written and the caller carries
 * on. Returns whether it stood.
 */
function column(ctx: FitOutContext, c: PropCounter, x: number, z: number, block: string): boolean {
  const head = headroomOf(ctx);
  if (head < 3) return false;
  if (!c.put1(x, z, block, { axis: "y" })) return false;
  for (let y = 2; y <= head - 1; y++) c.stack(x, z, y, block, { axis: "y" });
  return true;
}

/**
 * The **shell motif** — the pack's recurring wall ornament and its only glow.
 *
 * `sea_lantern` between two courses of `dark_prismarine`, all three at the
 * floor course against a wall. The lint's lantern rule fires on any block whose
 * name ends `lantern` and asks for a solid floor under it or something to hang
 * from over it: this one is a full cube standing on the shell's own floor,
 * which is the first of those, and it has a solid neighbour either side so
 * `floating.isolated` has nothing to say either. Returns whether the glow
 * itself landed.
 */
function shellMotif(ctx: FitOutContext, c: PropCounter, x: number, z: number): boolean {
  const it = ctx.interior;
  const lit = c.put1(x, z, "sea_lantern");
  const along = z === it.z0 || z === it.z1;
  // The surround is tried **along the wall first and inward second**, and it
  // takes the first two cells that land rather than the two it wanted: on a
  // colonnaded wall the cells either side of a motif are as often a column as
  // they are floor, and a motif whose surround silently vanished is a bare
  // glow cube stuck to a wall.
  const order: [number, number][] = along
    ? [
        [x - 1, z],
        [x + 1, z],
        [x, z - 1],
        [x, z + 1],
      ]
    : [
        [x, z - 1],
        [x, z + 1],
        [x - 1, z],
        [x + 1, z],
      ];
  let laid = 0;
  for (const [nx, nz] of order) {
    if (laid >= 2) break;
    if (nx < it.x0 || nx > it.x1 || nz < it.z0 || nz > it.z1) continue;
    if (c.put1(nx, nz, "dark_prismarine")) laid++;
  }
  return lit;
}

/**
 * A **rail** of `iron_bars` down one wall, at the top of the storey.
 *
 * Head height and no lower, always: `iron_bars` is a body-blocking block to the
 * physics lint, so a rail at `y = 2` is a rail through somebody's face and the
 * cell under it stops being walkable. Nothing happens at all on a storey with
 * no room for one.
 */
function railOn(ctx: FitOutContext, c: PropCounter, x: number, props: Record<string, string>): void {
  const it = ctx.interior;
  const head = headroomOf(ctx);
  if (head < 3) return;
  for (let z = it.z0 + 1; z <= it.z1 - 1; z++) c.stack(x, z, head, "iron_bars", props);
}

/**
 * A **plinth** of bottom slabs down one wall, in bays.
 *
 * Bottom slabs, not full blocks: a body stands on a bottom slab, so a plinth
 * down a wall is furniture rather than a second wall, and the bays keep the
 * wall row steppable at intervals besides.
 */
function plinth(ctx: FitOutContext, c: PropCounter, x: number, slab: string, skipZ: number): void {
  const it = ctx.interior;
  for (let z = it.z0; z <= it.z1; z++) {
    if (z === skipZ) continue;
    c.put1(x, z, slab, SLAB);
  }
}

/**
 * A deterministic small draw, keyed on whatever the caller hands it.
 *
 * There is no RNG in a {@link FitOutContext} and this file does not want one: a
 * position-derived integer hash is the idiom every earlier wave uses, it is a
 * pure function, and `Math.imul` is exactly specified where `Math.pow` is not.
 */
function atlanteanJitter(a: number, b: number, c: number, n: number): number {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = (h ^ (h >>> 13)) >>> 0;
  return h % n;
}

/**
 * **Dead coral**, and the pack's one material argument about the garden.
 *
 * Rule 6: a live coral block out of water turns grey on the first block tick,
 * so a planter of live coral is a planter that looks like a mistake three
 * seconds after the world loads. These are the blocks the game gives you for
 * coral that has been out of the sea a long time, which is exactly what a
 * risen city's garden is made of, and they are theme-independent on purpose —
 * coral is coral in quartz and in sandstone alike.
 */
const DEAD_CORAL = [
  "dead_brain_coral_block",
  "dead_tube_coral_block",
  "dead_horn_coral_block",
  "dead_fire_coral_block",
  "dead_bubble_coral_block",
] as const;

/** One dead coral block, drawn from position. */
function coralAt(x: number, z: number): string {
  return DEAD_CORAL[atlanteanJitter(x, 0, z, DEAD_CORAL.length)] as string;
}

/* -------------------------------------------------------------------------- */
/* THE CURBED BASIN — the pack's load-bearing rule                             */
/* -------------------------------------------------------------------------- */

/**
 * **A pool, sunk into the floor and closed on every side.**
 *
 * This is the one piece of machinery an Atlantean pack cannot ship without,
 * and the one it would have been easiest to get wrong. The precedent is the
 * riad's courtyard basin and the science pack's pond, and the argument is
 * theirs word for word:
 *
 * - the water goes **into the floor plane at `y = 0`**, never up at `y = 1`. A
 *   water cell at `y = 1` is a body-blocking cell in the middle of the room
 *   *and* a fluid with a free face on every side of it;
 * - the rect is **inset at least one cell from the interior on every side**, so
 *   the walkway round it is the room's own floor and every water cell has a
 *   floor cell orthogonally beside it. A basin flush to a wall would be a basin
 *   whose closure depended on the shell's window rhythm, and a window is a hole;
 * - **every floor cell touching the water is written solid** — that is the half
 *   of the predicate the shell does not already guarantee, because a floor cell
 *   the fit-out never touched could be anything;
 * - under every water cell is the foundation skirt the shell lays under the
 *   whole footprint, and over it is air;
 * - the cells are **claimed through `take` before a drop is written**. That
 *   does two things at once: it runs the ground floor's connectivity guard, so
 *   a basin that would strand part of the room is refused outright rather than
 *   drowned; and it marks the cells occupied, so no later `put1` in this file
 *   can ever stand a bench on the water.
 *
 * Returns whether the basin was built. `false` is a perfectly good answer — a
 * courtyard you have to wade across is a pond, and a room too small for a
 * walkway round its pool does not get one.
 */
function sunkenBasin(
  ctx: FitOutContext,
  c: PropCounter,
  rect: LocalRect,
  rim: string,
): boolean {
  const it = ctx.interior;
  if (rect.x0 <= it.x0 || rect.x1 >= it.x1 || rect.z0 <= it.z0 || rect.z1 >= it.z1) return false;
  if (rect.x1 < rect.x0 || rect.z1 < rect.z0) return false;

  const cells: [number, number][] = [];
  for (let z = rect.z0; z <= rect.z1; z++) {
    for (let x = rect.x0; x <= rect.x1; x++) {
      if (!ctx.free(x, z)) return false;
      cells.push([x, z]);
    }
  }
  // The claim, and the connectivity guard with it. Refused, and not one drop
  // of water is written — which is the whole point of asking first.
  if (!ctx.take(cells, "prismarine")) return false;

  for (const [x, z] of cells) c.raw(x, 0, z, "water", WATER);

  // The rim: every floor cell touching the water, written solid. Interior
  // cells only — the ring outside the interior is the shell's own wall foot.
  for (let z = rect.z0 - 1; z <= rect.z1 + 1; z++) {
    for (let x = rect.x0 - 1; x <= rect.x1 + 1; x++) {
      if (x >= rect.x0 && x <= rect.x1 && z >= rect.z0 && z <= rect.z1) continue;
      if (x < it.x0 || x > it.x1 || z < it.z0 || z > it.z1) continue;
      c.raw(x, 0, z, rim);
    }
  }
  return true;
}

/**
 * **Put a basin somewhere near where the caller wanted it**, or nowhere.
 *
 * The lesson this helper *is*: on most envelopes the middle column of the room
 * is the **door's approach**, which the ground floor reserves and which
 * `free()` therefore refuses — so "centre the pool" is the one answer
 * unavailable on exactly the plans a pool most wants to be centred on. The
 * hedgerow pack learned this about hearths and the dwarven pack learned it
 * about single must-have props; this is the same lesson a third time, for a
 * shape three cells wide.
 *
 * So the centre is a *preference*: the search walks outward in x, and then
 * one row either way in z, and takes the first placement {@link sunkenBasin}
 * accepts. Every attempt is free of side effects until the claim succeeds —
 * `sunkenBasin` writes nothing at all before `take` says yes — so a failed
 * probe leaves the room exactly as it found it.
 *
 * Returns the rect actually filled, or `null` when the room will give none.
 */
function placeBasin(
  ctx: FitOutContext,
  c: PropCounter,
  cx: number,
  cz: number,
  halfX: number,
  halfZ: number,
  rim: string,
): LocalRect | null {
  const it = ctx.interior;
  for (let dz = 0; dz <= 1; dz++) {
    for (const z of dz === 0 ? [cz] : [cz - dz, cz + dz]) {
      if (z < it.z0 || z > it.z1) continue;
      for (let dx = 0; dx <= it.x1 - it.x0; dx++) {
        for (const x of dx === 0 ? [cx] : [cx - dx, cx + dx]) {
          const rect = basinAt(ctx, x, z, halfX, halfZ);
          if (rect === null) continue;
          if (sunkenBasin(ctx, c, rect, rim)) return rect;
        }
      }
    }
  }
  return null;
}

/**
 * The basin a room of this size can hold at a given centre, or `null`.
 *
 * `half` is how far the rect reaches either side of the centre; the answer is
 * clamped to leave a walkway one cell wide inside the interior on every side,
 * and refused outright when the room cannot give one.
 */
function basinAt(
  ctx: FitOutContext,
  cx: number,
  cz: number,
  halfX: number,
  halfZ: number,
): LocalRect | null {
  const it = ctx.interior;
  const x0 = Math.max(cx - halfX, it.x0 + 1);
  const x1 = Math.min(cx + halfX, it.x1 - 1);
  const z0 = Math.max(cz - halfZ, it.z0 + 1);
  const z1 = Math.min(cz + halfZ, it.z1 - 1);
  if (x1 < x0 || z1 < z0) return null;
  return { x0, x1, z0, z1 };
}

/* -------------------------------------------------------------------------- */
/* the oracle's dome                                                           */
/* -------------------------------------------------------------------------- */

/**
 * What an exterior rebuild needs to know, or `null` when it may not run.
 *
 * The Mesoamerican pack's plan in every respect, restated rather than imported
 * for the reason that pack restated the Nile's: two packs are two seams, and a
 * shared private helper is a shared edit.
 */
interface AtlanteanPlan {
  readonly sx: number;
  readonly sz: number;
  /** Y of the roof's lowest course — one above the eave plate. */
  readonly base: number;
  /** Highest Y anything may occupy: the shell's roof top plus the allowance. */
  readonly top: number;
}

/** The plan for work on the walls: the rect condition, and nothing else. */
function wallPlan(ctx: FitOutContext): AtlanteanPlan | null {
  const sx = ctx.size[0];
  const sz = ctx.size[2];
  const it = ctx.interior;
  if (it.x0 !== 1 || it.z0 !== 1 || it.x1 !== sx - 2 || it.z1 !== sz - 2) return null;
  return { sx, sz, base: ctx.wallTop + 1, top: ctx.roofTop + ROOF_FLOURISH_RISE };
}

/** The plan for a roof rebuild: a wall plan that also has room to build in. */
function roofPlan(ctx: FitOutContext): AtlanteanPlan | null {
  const plan = wallPlan(ctx);
  if (plan === null) return null;
  return plan.top - plan.base < 2 ? null : plan;
}

/** Clear everything the shell built above the eave plate, apron included. */
function clearRoof(ctx: FitOutContext, plan: AtlanteanPlan): void {
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
 * The Mesoamerican pack's list unchanged: the way in, the way up, the fire, the
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

/** Re-clad the wall ring between two courses. `block` is a pure function of position. */
function reclad(
  ctx: FitOutContext,
  plan: AtlanteanPlan,
  yFrom: number,
  yTo: number,
  block: (x: number, y: number, z: number) => string,
): number {
  const out = outsideDoor(ctx);
  let n = 0;
  for (const cell of ringOf(plan.sx, plan.sz)) {
    if (out !== null && out.x === cell.x && out.z === cell.z) continue;
    for (let y = yFrom; y <= yTo; y++) {
      if (protectedAt(ctx, cell.x, y, cell.z)) continue;
      ctx.put(cell.x, y, cell.z, block(cell.x, y, cell.z));
      n++;
    }
  }
  return n;
}

/**
 * **Sea stone** — the substance the risen city is faced in.
 *
 * Prismarine mostly, with the brick and the dark variants banded through it by
 * position. Named outright as a *substance* rather than drawn from the palette,
 * exactly as the Mesoamerican pack names `mossy_stone_bricks` and the steppe
 * pack names its felt: the theme's stone is what the *frame* is made of, and
 * no palette symbol in the grammar spells "the sea got at this".
 */
function seaStone(): (x: number, y: number, z: number) => string {
  return (x, y, z) => {
    const draw = atlanteanJitter(x, y, z, 8);
    if (draw === 0) return "dark_prismarine";
    if (draw === 1 || draw === 2) return "prismarine";
    return "prismarine_bricks";
  };
}

/**
 * **THE HANGER GUARD** — nothing this file writes may leave a hanging block
 * hanging from air.
 *
 * The Mesoamerican pack's closure, restated as code for the same reason it was
 * there: the shell hangs its lantern from the ceiling plane directly above it,
 * and **the dome rebuild deletes and re-lays the volume over that plane.**
 * `unsupported.chain` walks a hanger's support upward and fails it the moment
 * the cell above is air — a finding no render shows.
 *
 * It is a *closure*, not a fix: it holds for a hanger this pack never placed,
 * in a shape somebody adds next year.
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

/**
 * **The oracle's dome** — the pack's one silhouette argument.
 *
 * A rotunda is a *round* building and a hip roof on one is a villa with a funny
 * hat. Built the way the temazcal's shoulder and the ger's crown are built, and
 * for the same reason: **filled discs stepping in**, each standing on the
 * filled disc below it. A dome written as a ring per course leaves its
 * outermost cells with air below and beside them, which is `floating.isolated`;
 * a hollow dome is a sealed pocket besides. The lid under it gives the room a
 * ceiling and gives the first disc a floor.
 *
 * The last courses come out in `sea_lantern` rather than in stone: that is the
 * oculus, it is the only light an oracle works by, and a full cube of it
 * bedded in a filled disc has no support rule left to fail.
 *
 * Silently does nothing on an envelope with no room above the plate — a fit-out
 * that insisted would be arguing with the shell.
 */
function oracleDome(ctx: FitOutContext, c: PropCounter): void {
  const plan = roofPlan(ctx);
  const stone = seaStone();
  const wall = wallPlan(ctx);

  // The wall skin: sea stone from the ground to the plate. Doors, glass and
  // anything with a support rule are left alone.
  if (wall !== null) c.n += reclad(ctx, wall, 1, ctx.wallTop, stone);

  if (plan === null) {
    guardHangers(ctx, c);
    return;
  }

  clearRoof(ctx, plan);

  // The lid first — a ceiling for the room and a floor for the dome.
  const lidBlock = ctx.style["roof.solid"] as string;
  const board = ctx.style["floor.interior"] as string;
  for (let z = 0; z < plan.sz; z++) {
    for (let x = 0; x < plan.sx; x++) {
      c.raw(x, plan.base, z, atlanteanJitter(x, plan.base, z, 5) === 0 ? board : lidBlock);
    }
  }

  // The dome: filled discs, stepping in, each on the one below it.
  const cx = (plan.sx - 1) / 2;
  const cz = (plan.sz - 1) / 2;
  const r0 = Math.min(cx, cz);
  let crown = plan.base;
  for (let y = plan.base + 1; y <= plan.top; y++) {
    const radius = r0 - (y - plan.base - 1) * 0.85;
    if (radius < 0.5) break;
    for (let z = 0; z < plan.sz; z++) {
      for (let x = 0; x < plan.sx; x++) {
        const dx = x - cx;
        const dz = z - cz;
        if (dx * dx + dz * dz > radius * radius) continue;
        c.raw(x, y, z, radius < 1.6 ? "sea_lantern" : stone(x, y, z));
      }
    }
    crown = y;
  }

  // **The oculus, written last and unconditionally.** On a tall envelope the
  // discs shrink until the last of them comes out in `sea_lantern` on their
  // own; on a shallow one the dome runs out of height before that happens, and
  // an oracle whose light depends on how much roof allowance the shell felt
  // like giving it is an oracle that is sometimes dark. So the middle of the
  // topmost course is overwritten here, where the disc below it is already a
  // filled mass and there is nothing left for a support rule to fail.
  if (crown > plan.base) c.raw(Math.round(cx), crown, Math.round(cz), "sea_lantern");

  guardHangers(ctx, c);
}

/* -------------------------------------------------------------------------- */
/* the tidal palace                                                            */
/* -------------------------------------------------------------------------- */

/**
 * `tidal_palace` — the anchor, and the only building here a stranger will name
 * out loud.
 *
 * Three things. The **colonnade**: `quartz_pillar` columns down both wall rows
 * at every other bay, capped short of the ceiling so no column is a pillar
 * through the room. The **shell motifs** bedded between them, which is where
 * the pack's glow lives and where the prismarine argument is actually made.
 * And the **throne dais** across the head — a course of bottom slabs, so the
 * head of the room is visibly raised and still walkable, with the seat itself
 * on the row in front of it, which is where a chair on a dais actually is.
 *
 * The middle of the floor is untouched, because the middle of a throne room is
 * where the court stands.
 */
function fitTidalPalace(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const slab = style["stone.slab"] as string;
  const seat = style["stair.interior"] as string;
  const headZ = headRow(ctx);
  const look = headZ === it.z0 ? "north" : "south";

  // The colonnade, both walls, columns at every other bay.
  for (const x of [it.x0, it.x1]) {
    for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
      if ((z - it.z0) % 2 === 1) continue;
      if (z === headZ) continue;
      column(ctx, c, x, z, "quartz_pillar");
    }
    // The motifs, in the bays the columns left.
    for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
      if ((z - it.z0) % 4 !== 3) continue;
      if (z === headZ) continue;
      shellMotif(ctx, c, x, z);
    }
  }

  // The dais across the head, and the throne on the row in front of it.
  for (let x = it.x0; x <= it.x1; x++) c.put1(x, headZ, slab, SLAB);
  const front = headZ === it.z0 ? it.z0 + 1 : it.z1 - 1;
  const midX = bayOn(ctx, front, 0) ?? Math.floor((it.x0 + it.x1) / 2);
  standInRow(ctx, c, front, midX, seat, { facing: look, half: "bottom", shape: "straight" });

  // The tribute, at the door end.
  const doorEnd = headZ === it.z0 ? it.z1 : it.z0;
  c.put1(it.x0, doorEnd, "barrel", BARREL);
  c.put1(it.x1, doorEnd, "barrel", BARREL);
}

/* -------------------------------------------------------------------------- */
/* the trident temple                                                          */
/* -------------------------------------------------------------------------- */

/**
 * `trident_temple` — the three prongs, and nothing that is not them.
 *
 * The whole building is one emblem stood upright at the head of the room:
 * **three `quartz_pillar` prongs** on the head row, tied across at head height
 * by a run of `iron_bars` — the shaft's cross-piece, and at head height for the
 * reason every rail in this file is, because `iron_bars` is a body-blocking
 * block and a tie at chest height is a tie nobody can walk past. The **altar
 * band** of `dark_prismarine` runs along the head row between the prongs, and
 * the **glow** is bedded in the middle of it.
 *
 * Bare `temple` and bare `shrine` stay the church's and the sanctum wave's,
 * across a dozen compounds. `trident` is a word no table has ever claimed, and
 * it is the whole name.
 */
function fitTridentTemple(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it } = ctx;
  const head = headroomOf(ctx);
  const headZ = headRow(ctx);
  const doorEnd = headZ === it.z0 ? it.z1 : it.z0;

  // The three prongs. Two cells apart, so the emblem reads at a distance.
  const bay = bayOn(ctx, headZ, 2) ?? bayOn(ctx, headZ, 0);
  const prongs: number[] = [];
  if (bay !== null) {
    for (const x of [bay - 2, bay, bay + 2]) {
      if (x < it.x0 || x > it.x1) continue;
      if (column(ctx, c, x, headZ, "quartz_pillar")) prongs.push(x);
    }
  }

  // The tie across their heads — the shaft's cross-piece.
  if (prongs.length > 1 && head >= 3) {
    const lo = Math.min(...prongs);
    const hi = Math.max(...prongs);
    for (let x = lo; x <= hi; x++) c.stack(x, headZ, head - 1, "iron_bars", BARS_X);
  }

  // The altar band along the head row, in the cells the prongs left.
  for (let x = it.x0; x <= it.x1; x++) {
    if (prongs.includes(x)) continue;
    c.put1(x, headZ, "dark_prismarine");
  }

  // The glow, on the row in front of the emblem where an offering stands.
  const front = headZ === it.z0 ? it.z0 + 1 : it.z1 - 1;
  const alt = bayOn(ctx, front, 1) ?? bayOn(ctx, front, 0);
  if (alt !== null) shellMotif(ctx, c, alt, front);

  // The offerings, by the way in.
  c.put1(it.x0, doorEnd, "barrel", BARREL);
  c.put1(it.x1, doorEnd, "barrel", BARREL);
}

/* -------------------------------------------------------------------------- */
/* the oracle                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * `sea_oracle_rotunda` — the domed room, and the pack's only exterior work.
 *
 * Inside it is a **ring of seats** against all four walls with their backs to
 * the wall, so the room sits looking in; the **oracle's basin**, one course of
 * water sunk into the floor a little to the head side of the middle, curbed by
 * construction; and the **tripod** of `dark_prismarine` behind it.
 *
 * The basin is deliberately off the exact middle of the floor: the shell hangs
 * its lantern from the ceiling plane over the centre, and a basin under it
 * would be a room whose one route ran through the lantern column.
 */
function fitOracleRotunda(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const seat = style["stair.interior"] as string;
  const rim = style["foundation.accent"] as string;
  const headZ = headRow(ctx);

  oracleDome(ctx, c);

  // The ring of seats, in bays so no run is a second wall.
  for (const x of [it.x0, it.x1]) {
    for (let z = it.z0; z <= it.z1; z++) {
      if (z === headZ) continue;
      if ((z - it.z0) % 3 === 2) continue;
      c.put1(x, z, seat, { facing: seatFacing(it, x, z), half: "bottom", shape: "straight" });
    }
  }

  // The basin, one row to the head side of the middle of the floor.
  const cx = Math.floor((it.x0 + it.x1) / 2);
  const cz = Math.floor((it.z0 + it.z1) / 2) + (headZ === it.z0 ? -1 : 1);
  placeBasin(ctx, c, cx, cz, 0, 0, rim);

  // The tripod, and the glow at the head.
  const bay = bayOn(ctx, headZ, 1) ?? bayOn(ctx, headZ, 0);
  if (bay !== null) shellMotif(ctx, c, bay, headZ);
}

/* -------------------------------------------------------------------------- */
/* the conch amphitheatre                                                      */
/* -------------------------------------------------------------------------- */

/**
 * `conch_amphitheater` — the banked seating, curved.
 *
 * The floor is the point and it is left completely bare, exactly as the steppe
 * pack's wrestling ground is: the fit-out is entirely round the edge. What
 * makes it a *conch* rather than four benches is the **corners**: the bank runs
 * along all four walls and then turns one cell further in at each corner, so
 * the seating closes round the floor as a curve instead of meeting at right
 * angles.
 *
 * A second tier of bottom slabs goes up behind the bank at `y = 2` where the
 * storey has the room, which is what makes it read as banked rather than as a
 * single row of chairs.
 */
function fitConchAmphitheater(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const seat = style["stair.interior"] as string;
  const slab = style["stone.slab"] as string;
  const head = headroomOf(ctx);
  const headZ = headRow(ctx);
  const doorEnd = headZ === it.z0 ? it.z1 : it.z0;

  const bank: [number, number][] = [];
  for (const x of [it.x0, it.x1]) {
    for (let z = it.z0; z <= it.z1; z++) {
      if (z === headZ) continue;
      if ((z - it.z0) % 3 === 2) continue;
      bank.push([x, z]);
    }
  }
  // The curve: one cell further in at each corner, so the bank closes round.
  for (const [cxo, czo] of [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ] as const) {
    const x = cxo > 0 ? it.x0 + 1 : it.x1 - 1;
    const z = czo > 0 ? it.z0 : it.z1;
    if (z === headZ) continue;
    bank.push([x, z]);
  }

  for (const [x, z] of bank) {
    c.put1(x, z, seat, { facing: seatFacing(it, x, z), half: "bottom", shape: "straight" });
    // The upper tier, behind the bank rather than over the floor.
    if (head >= 4 && (x === it.x0 || x === it.x1)) c.stack(x, z, 2, slab, SLAB);
  }

  // The stage front at the head, and the players' stores by the way in.
  for (let x = it.x0; x <= it.x1; x++) {
    if ((x - it.x0) % 2 === 1) continue;
    c.put1(x, headZ, "dark_prismarine");
  }
  const bay = bayOn(ctx, headZ, 1) ?? bayOn(ctx, headZ, 0);
  if (bay !== null) shellMotif(ctx, c, bay, headZ);
  c.put1(it.x0, doorEnd, "barrel", BARREL);
  c.put1(it.x1, doorEnd, "barrel", BARREL);
}

/* -------------------------------------------------------------------------- */
/* the pearl divers' hall                                                      */
/* -------------------------------------------------------------------------- */

/**
 * `pearl_diver_hall` — where the day's take is sorted.
 *
 * The **dive lines** hang overhead on both walls (`iron_bars` at the top of the
 * storey, which is where every line in this file lives); the **sorting
 * benches** of bottom slabs run under them in bays; the **rinse cauldrons**
 * stand between the benches; and the **rinse basin** — a single course of water
 * sunk into the floor — sits by the way in, curbed, because a diver washes the
 * grit off before he walks on the floor somebody has to sweep.
 */
function fitPearlDiverHall(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const slab = style["stone.slab"] as string;
  const rim = style["foundation.accent"] as string;
  const headZ = headRow(ctx);
  const doorEnd = headZ === it.z0 ? it.z1 : it.z0;

  // The lines, both walls, at the top of the storey.
  railOn(ctx, c, it.x0, BARS_Z);
  railOn(ctx, c, it.x1, BARS_Z);

  // The benches under them, with the cauldrons in the bays between.
  for (const x of [it.x0, it.x1]) {
    for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
      if (z === headZ) continue;
      if ((z - it.z0) % 3 === 1) c.put1(x, z, "cauldron");
      else if ((z - it.z0) % 3 === 2) c.put1(x, z, slab, SLAB);
    }
  }

  // The rinse basin, one cell of water inset from the way in.
  const cx = Math.floor((it.x0 + it.x1) / 2);
  const cz = doorEnd === it.z0 ? it.z0 + 2 : it.z1 - 2;
  placeBasin(ctx, c, cx, cz, 0, 0, rim);

  // The pearl chests and the glow at the head.
  for (let x = it.x0; x <= it.x1; x++) {
    if ((x - it.x0) % 2 === 1) continue;
    c.put1(x, headZ, slab, SLAB);
  }
  const bay = bayOn(ctx, headZ, 1) ?? bayOn(ctx, headZ, 0);
  if (bay !== null) shellMotif(ctx, c, bay, headZ);
  standInRow(ctx, c, headZ, it.x1, "barrel", BARREL);
}

/* -------------------------------------------------------------------------- */
/* the hippocamp stable                                                        */
/* -------------------------------------------------------------------------- */

/**
 * `hippocamp_stable` — stalls built for a horse that swims.
 *
 * The mythic stable, and the one archetype in the pack whose *only* joke is a
 * material one: everything about it is a stable — hurdles off one wall in bays,
 * the fodder on a plinth down the other — except that the fodder is **dried
 * kelp** and one stall in it is a **pool**.
 *
 * The pool stall is a curbed basin like every other pool in this pack, and it
 * is sunk into the floor rather than raised: a raised trough of water is a
 * fluid with a free face on four sides, and the whole reason this pack can have
 * water indoors is that it never does that.
 *
 * Bare `stable`, `stables` and `paddock` stay the founding table's, and
 * `pegasus_stable`, `griffin_stable` and `hippogriff_stable` stay the arcana
 * wave's. `hippocamp` is the animal's own name and no table has claimed it.
 */
function fitHippocampStable(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const slab = style["stone.slab"] as string;
  const fence = style["wall.fence"] as string;
  const rim = style["foundation.accent"] as string;
  const head = headroomOf(ctx);
  const headZ = headRow(ctx);

  // The hurdles down one wall, in bays so the run is not a second wall.
  for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
    if (z === headZ) continue;
    if ((z - it.z0) % 3 === 1) c.put1(it.x0, z, fence, POST);
    else if ((z - it.z0) % 3 === 2) c.put1(it.x0, z, "cauldron");
  }

  // The plinth and the kelp down the other: fodder never on a wet floor.
  plinth(ctx, c, it.x1, slab, headZ);
  if (head >= 3) {
    for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
      if ((z - it.z0) % 2 === 1) continue;
      c.stack(it.x1, z, 2, "dried_kelp_block");
    }
  }

  // The pool stall: two cells of water, curbed, on the head side of the room.
  const cx = Math.floor((it.x0 + it.x1) / 2);
  const cz = headZ === it.z0 ? it.z0 + 2 : it.z1 - 2;
  placeBasin(ctx, c, cx, cz, 0, 1, rim);

  // The tack shelf across the head.
  for (let x = it.x0; x <= it.x1; x++) {
    if ((x - it.x0) % 2 === 1) continue;
    c.put1(x, headZ, slab, SLAB);
  }
}

/* -------------------------------------------------------------------------- */
/* the tide gate                                                               */
/* -------------------------------------------------------------------------- */

/**
 * `tide_gate_arch` — the monumental arch over a water channel.
 *
 * The **channel** runs the length of the room, one cell wide, inset from the
 * wall so that the walkway either side of it is the room's own floor and the
 * closure never depends on the shell's window rhythm. The **arch** is one great
 * bay across it: two columns on the floor cells flanking the channel, and the
 * lintel carried across their heads.
 *
 * **One** arch bay, and that is a walkability decision, not a taste one. A
 * second bay would cut the strip between the channel and the wall into a
 * segment with a column at each end and water down its side — a pocket, and
 * exactly the kind that passes a connectivity check and fails the lint's walk
 * from the door.
 */
function fitTideGateArch(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const rim = style["foundation.accent"] as string;
  const head = headroomOf(ctx);
  const headZ = headRow(ctx);

  // The channel: one cell wide, running the length, inset one from the wall.
  // Two candidate columns rather than one, because the room's middle column is
  // as often as not the door's own approach — and a channel that silently
  // failed would leave the arch spanning dry floor.
  let chan = -1;
  for (const x of [it.x0 + 2, it.x1 - 2]) {
    if (x <= it.x0 || x >= it.x1) continue;
    const rect: LocalRect = { x0: x, x1: x, z0: it.z0 + 1, z1: it.z1 - 1 };
    if (sunkenBasin(ctx, c, rect, rim)) {
      chan = x;
      break;
    }
  }
  const cut = chan >= 0;

  // The arch: one bay, at the head end of the channel.
  const archZ = headZ === it.z0 ? it.z0 + 2 : it.z1 - 2;
  const piers: number[] = [];
  if (cut && archZ > it.z0 && archZ < it.z1) {
    for (const x of [chan - 1, chan + 1]) {
      if (column(ctx, c, x, archZ, "prismarine_bricks")) piers.push(x);
    }
    if (piers.length === 2 && head >= 3) {
      for (let x = chan - 1; x <= chan + 1; x++) c.stack(x, archZ, head - 1, "dark_prismarine");
    }
  }

  // The gate keeper's side of the room: the sluice cauldrons and the stores.
  for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
    if ((z - it.z0) % 3 !== 1) continue;
    if (z === headZ) continue;
    c.put1(it.x1, z, "cauldron");
  }
  const bay = bayOn(ctx, headZ, 1) ?? bayOn(ctx, headZ, 0);
  if (bay !== null) shellMotif(ctx, c, bay, headZ);
  standInRow(ctx, c, headZ, it.x1, "barrel", BARREL);
}

/* -------------------------------------------------------------------------- */
/* the coral garden court                                                      */
/* -------------------------------------------------------------------------- */

/**
 * `coral_garden_court` — the court of planters.
 *
 * The **beds** run down both walls: a kerb of bottom slabs with a **dead coral
 * block** standing in every other one. Rule 6 is the whole point of the room —
 * these are the `dead_*` blocks, dry, because live coral out of water turns
 * grey on the first block tick and a garden that decays three seconds after the
 * world loads is a bug that looks like a choice.
 *
 * The **court's basin** sits at the middle of the floor, curbed, and it is the
 * one place in this building water is legal.
 */
function fitCoralGardenCourt(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const slab = style["stone.slab"] as string;
  const rim = style["foundation.accent"] as string;
  const head = headroomOf(ctx);
  const headZ = headRow(ctx);

  // The beds, both walls: kerb, then the coral standing in it.
  for (const x of [it.x0, it.x1]) {
    for (let z = it.z0; z <= it.z1; z++) {
      if (z === headZ) continue;
      if ((z - it.z0) % 3 === 2) continue;
      c.put1(x, z, slab, SLAB);
    }
    if (head < 3) continue;
    for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
      if ((z - it.z0) % 3 !== 0) continue;
      if (z === headZ) continue;
      c.stack(x, z, 2, coralAt(x, z));
    }
  }

  // The court's own basin, at the middle of the floor, one row off the
  // lantern column so the room's route never runs through it.
  const cx = Math.floor((it.x0 + it.x1) / 2);
  const cz = Math.floor((it.z0 + it.z1) / 2) + (headZ === it.z0 ? -1 : 1);
  placeBasin(ctx, c, cx, cz, 1, 0, rim);

  // The gardener's bench and the glow at the head.
  for (let x = it.x0; x <= it.x1; x++) {
    if ((x - it.x0) % 2 === 1) continue;
    c.put1(x, headZ, slab, SLAB);
  }
  const bay = bayOn(ctx, headZ, 1) ?? bayOn(ctx, headZ, 0);
  if (bay !== null) shellMotif(ctx, c, bay, headZ);
}

/* -------------------------------------------------------------------------- */
/* the navigators' academy                                                     */
/* -------------------------------------------------------------------------- */

/**
 * `navigator_academy` — where a risen city relearns where it is.
 *
 * The **chart tables** of bottom slabs run down both walls with a **lectern**
 * at every third bay; the **armillary** — a ring of `iron_bars` — turns
 * overhead at the top of the storey; and the **lodestone** stands at the head
 * on a plinth of its own, which is the one object in the room that is
 * unambiguously about *bearing* rather than about paper.
 *
 * The lodestone goes through {@link standInRow}: it is a single must-have prop
 * and it must not vanish because the one cell it wanted was the door's.
 */
function fitNavigatorAcademy(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const slab = style["stone.slab"] as string;
  const head = headroomOf(ctx);
  const headZ = headRow(ctx);
  const doorEnd = headZ === it.z0 ? it.z1 : it.z0;

  // The chart tables, both walls, with the lecterns in the bays.
  for (const x of [it.x0, it.x1]) {
    for (let z = it.z0; z <= it.z1; z++) {
      if (z === headZ) continue;
      if ((z - it.z0) % 3 === 2) continue;
      if ((z - it.z0) % 3 === 1) c.put1(x, z, slab, SLAB);
      else c.put1(x, z, "bookshelf");
    }
  }

  // The armillary, overhead on both walls.
  railOn(ctx, c, it.x0, BARS_Z);
  railOn(ctx, c, it.x1, BARS_Z);
  if (head >= 4) {
    const midX = Math.floor((it.x0 + it.x1) / 2);
    for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
      if ((z - it.z0) % 4 !== 2) continue;
      c.stack(midX, z, head, "iron_bars", BARS_X);
    }
  }

  // The lodestone on its plinth at the head, and the glow beside it.
  const bay = bayOn(ctx, headZ, 1) ?? bayOn(ctx, headZ, 0);
  if (bay !== null) shellMotif(ctx, c, bay, headZ);
  const front = headZ === it.z0 ? it.z0 + 1 : it.z1 - 1;
  standInRow(ctx, c, front, Math.floor((it.x0 + it.x1) / 2), "lodestone");

  // The instrument chests, by the way in.
  c.put1(it.x0, doorEnd, "barrel", BARREL);
  c.put1(it.x1, doorEnd, "barrel", BARREL);
}

/* -------------------------------------------------------------------------- */
/* the salt baths                                                              */
/* -------------------------------------------------------------------------- */

/**
 * `salt_bath_terme` — the sunken bath, and the largest body of water the pack
 * writes anywhere.
 *
 * The **bath** is a curbed basin three cells by one at the middle of the floor;
 * the **benches** are stairs against both walls with their backs to them; the
 * **brine cauldrons** stand in the bays between; and the **hot stones** are the
 * pack's own glow, bedded at the head under a dressed cap.
 *
 * Bare `bathhouse`, `baths` and `bath` stay the leisure wave's, and
 * `stone_bath_house` stays the dwarven pack's — which is the interesting
 * comparison, because that one writes **no water at all** on the argument that
 * a bath house a body cannot cross is a pool. This one writes water and keeps
 * the crossing, by sinking it into the floor and curbing it: the two rooms
 * answer the same question two legitimate ways.
 */
function fitSaltBathTerme(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const seat = style["stair.interior"] as string;
  const rim = style["foundation.accent"] as string;
  const head = headroomOf(ctx);
  const headZ = headRow(ctx);

  // The benches and the brine, both walls.
  for (const x of [it.x0, it.x1]) {
    for (let z = it.z0; z <= it.z1; z++) {
      if (z === headZ) continue;
      if ((z - it.z0) % 3 === 2) continue;
      if ((z - it.z0) % 3 === 1) c.put1(x, z, "cauldron");
      else {
        c.put1(x, z, seat, { facing: seatFacing(it, x, z), half: "bottom", shape: "straight" });
      }
    }
  }

  // The bath itself, at the middle of the floor, one row off the lantern.
  const cx = Math.floor((it.x0 + it.x1) / 2);
  const cz = Math.floor((it.z0 + it.z1) / 2) + (headZ === it.z0 ? -1 : 1);
  placeBasin(ctx, c, cx, cz, 1, 0, rim);

  // The hot stones at the head, under a dressed cap.
  const bay = bayOn(ctx, headZ, 1) ?? bayOn(ctx, headZ, 0);
  if (bay !== null) {
    if (shellMotif(ctx, c, bay, headZ) && head >= 3) c.stack(bay, headZ, 2, rim);
  }
}

/* -------------------------------------------------------------------------- */
/* the drowned archive                                                         */
/* -------------------------------------------------------------------------- */

/**
 * `drowned_archive` — the library the tide reached once, and never left.
 *
 * **Not one cell of water is written in this room**, and that is the whole
 * design. A soaked library is a library: the water is *history*, and history in
 * this medium is a **tide line** — a band of `dark_prismarine` at `y = 2` along
 * both wall rows, level all the way round, marking exactly how high it came —
 * plus **cobweb** hung at the top of the storey, which is what a room nobody
 * has reached into for a century actually contains. A pond on the floor would
 * be a room a reader cannot cross, and it would say the tide is still here.
 *
 * The books are `bookshelf` ranks in bays down both walls with the tide line
 * banded over the gaps between them, so the line is read against the wall
 * rather than against the spines.
 */
function fitDrownedArchive(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const slab = style["stone.slab"] as string;
  const head = headroomOf(ctx);
  const headZ = headRow(ctx);
  const doorEnd = headZ === it.z0 ? it.z1 : it.z0;

  for (const x of [it.x0, it.x1]) {
    for (let z = it.z0; z <= it.z1; z++) {
      if (z === headZ) continue;
      const slot = (z - it.z0) % 3;
      if (slot === 2) continue; // the gap between two ranks
      if (slot === 0) c.put1(x, z, "bookshelf");
      else c.put1(x, z, slab, SLAB);
    }
    // The tide line, banded at `y = 2` over the gaps, where it reads against
    // the wall rather than against the books.
    if (head < 3) continue;
    for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
      if ((z - it.z0) % 3 !== 2) continue;
      c.stack(x, z, 2, "dark_prismarine");
    }
    // The web, at the top of the storey and nowhere a body walks.
    if (head < 4) continue;
    for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
      if ((z - it.z0) % 4 !== 1) continue;
      c.stack(x, z, head, "cobweb");
    }
  }

  // The reading table across the head, the glow over it, the crates by the door.
  for (let x = it.x0; x <= it.x1; x++) {
    if ((x - it.x0) % 2 === 1) continue;
    c.put1(x, headZ, slab, SLAB);
  }
  const bay = bayOn(ctx, headZ, 1) ?? bayOn(ctx, headZ, 0);
  if (bay !== null) shellMotif(ctx, c, bay, headZ);
  c.put1(it.x0, doorEnd, "barrel", BARREL);
  c.put1(it.x1, doorEnd, "barrel", BARREL);
}

/* -------------------------------------------------------------------------- */
/* the tide bell                                                               */
/* -------------------------------------------------------------------------- */

/**
 * `tide_bell_tower` — the bell that rings the tide, and the chain lesson made
 * real.
 *
 * **`iron_chain`, never `chain`.** `chain` is not in the pinned 1.21.11 block
 * table — a whole wave learned that the expensive way — and every hanging line
 * in every pack since has been `iron_bars` for want of the right block. This is
 * the right block, and this building exists partly to say so.
 *
 * The hang is a closed argument, top down: a **cap course** of the theme's own
 * roof stone at the top of the storey, an **`iron_chain`** directly under it,
 * and the **bell** directly under that with `attachment: ceiling`, which names
 * the block above it. Nothing in that stack has air over it, which is what
 * `unsupported.chain` walks upward to find.
 *
 * On a storey too short to hang a bell over a body's head, the bell **stands**
 * instead — `attachment: floor`, through {@link standInRow}, because a bell
 * tower with no bell in it is not a shorter bell tower, it is a mistake.
 */
function fitTideBellTower(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const cap = style["roof.solid"] as string;
  const fence = style["wall.fence"] as string;
  const head = headroomOf(ctx);
  const headZ = headRow(ctx);
  const facing = headZ === it.z0 ? "south" : "north";

  // The rail round the bell floor: posts at intervals, never a solid run — a
  // bell floor is a thing you see out of.
  for (const x of [it.x0, it.x1]) {
    for (let z = it.z0; z <= it.z1; z++) {
      if (z === headZ) continue;
      if ((z - it.z0) % 2 === 1) continue;
      c.put1(x, z, fence, POST);
    }
  }

  // The hang, top down, with nothing anywhere in it standing over air.
  const bay = bayOn(ctx, headZ, 0);
  const front = headZ === it.z0 ? it.z0 + 1 : it.z1 - 1;
  const hangX = bay ?? Math.floor((it.x0 + it.x1) / 2);
  let hung = false;
  if (head >= 5 && front > it.z0 && front < it.z1 && ctx.free(hangX, front)) {
    c.stack(hangX, front, head, cap);
    c.stack(hangX, front, head - 1, "iron_chain", CHAIN_Y);
    hung = c.stack(hangX, front, head - 2, "bell", {
      attachment: "ceiling",
      facing,
      powered: "false",
    });
  }
  if (!hung) {
    standInRow(ctx, c, headZ, hangX, "bell", {
      attachment: "floor",
      facing,
      powered: "false",
    });
  }

  // The ringer's stores and the glow at the head.
  const lit = bayOn(ctx, headZ, 1);
  if (lit !== null) shellMotif(ctx, c, lit, headZ);
  standInRow(ctx, c, headZ === it.z0 ? it.z1 : it.z0, it.x1, "barrel", BARREL);
}

/* -------------------------------------------------------------------------- */
/* the moon pool                                                               */
/* -------------------------------------------------------------------------- */

/**
 * `moon_pool_shrine` — the pool at the middle of the floor, open to the sky.
 *
 * The pool is a curbed basin at the middle of the room with **four columns**
 * standing at its corners: those columns are the light well, and they are how a
 * fit-out says "open to the sky" **without cutting a hole in a roof it does not
 * own**. This file's one piece of exterior work is the oracle's dome; a second
 * archetype reaching up through the shell to make a skylight would be the
 * second grammar the design law forbids, and it would strand whatever the shell
 * hung from the ceiling plane besides.
 *
 * The glow at the head is the moon's stand-in on a night the sky is shut.
 */
function fitMoonPoolShrine(ctx: FitOutContext, c: PropCounter): void {
  const { interior: it, style } = ctx;
  const slab = style["stone.slab"] as string;
  const rim = style["foundation.accent"] as string;
  const headZ = headRow(ctx);

  // The pool: at the middle, one row off the lantern column.
  const cx = Math.floor((it.x0 + it.x1) / 2);
  const cz = Math.floor((it.z0 + it.z1) / 2) + (headZ === it.z0 ? -1 : 1);
  const rect = placeBasin(ctx, c, cx, cz, 0, 0, rim);

  // The four posts of the light well, at the pool's corners.
  if (rect !== null) {
    for (const [px, pz] of [
      [rect.x0 - 1, rect.z0 - 1],
      [rect.x0 - 1, rect.z1 + 1],
      [rect.x1 + 1, rect.z0 - 1],
      [rect.x1 + 1, rect.z1 + 1],
    ] as const) {
      if (px < it.x0 || px > it.x1 || pz < it.z0 || pz > it.z1) continue;
      column(ctx, c, px, pz, "quartz_pillar");
    }
  }

  // The offering shelf round the walls, in bays.
  for (const x of [it.x0, it.x1]) {
    for (let z = it.z0; z <= it.z1; z++) {
      if (z === headZ) continue;
      if ((z - it.z0) % 3 === 2) continue;
      c.put1(x, z, slab, SLAB);
    }
  }

  // The moon's stand-in at the head.
  const bay = bayOn(ctx, headZ, 1) ?? bayOn(ctx, headZ, 0);
  if (bay !== null) shellMotif(ctx, c, bay, headZ);
  standInRow(ctx, c, headZ, it.x0, "barrel", BARREL);
}
