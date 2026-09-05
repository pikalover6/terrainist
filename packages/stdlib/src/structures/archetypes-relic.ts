/**
 * Archetype breadth, **wave six E** — the relics: five ruined buildings.
 *
 * A ruined cottage, a ruined keep, a ruined church, a collapsed tower and an
 * overgrown villa. The five monuments this wave ships beside them — the
 * standing stones, the henge, the monolith, the burial mound, the two digs and
 * the shattered obelisk — are **props**, and live in `props-relics.ts`: a
 * monument has no room in it, and a building grammar that builds a solid lump
 * is a building grammar being misused.
 *
 * ## THE RUIN LAW
 *
 * **A ruined building is the ordinary shell fit-out DECAYED, not a second
 * grammar.**
 *
 * This is the same statement `archetypes-blitz.ts` makes about archetypes in
 * general, pushed to the one place it looks like it should break. The fit-out
 * runs **after** every shape stage and a later write to a cell replaces an
 * earlier one, so "ruined" is not a different builder, a different footprint
 * or a different opening rule — it is the same shell, written over. No new
 * geometry is invented here; existing geometry is *removed* and *re-clad*.
 *
 * **Where the decay lives.** It used to live *here*, as five hand-written move
 * sequences. RUINS-PLAN-v0 WP-1 lifted the moves into **operators over a
 * finished shell** in `decay.ts` — the crumble line and the re-clad, the broken
 * roof, the apron spill, the green, the floor paint and the rubble — and what
 * is left in this file is {@link RELIC_DECAY_PROFILES}, the five parameter sets
 * that used to be the difference between one sequence and another, plus the
 * handful of props each ruin puts on its floor afterwards. The extraction is a
 * pure refactor and is held to **list-identity**: every relic emits the op list
 * it emitted before, element for element
 * (`test/relic-decay-identity.test.ts`). The ruin law applied to the ruin law.
 *
 * Read `decay.ts` for the operators, their order and why the order is
 * load-bearing.
 *
 * ## What decay may never touch
 *
 * - **the door, and the approach to it.** The walking agent starts in the cell
 *   inside the door and the lint's `traversal.unreachable` walk starts there
 *   too. {@link protectedColumn} keeps the door column, the doorstep outside
 *   it and the cell inside it out of every one of the five moves, and the test
 *   file re-walks every envelope with `assertNoPockets`;
 * - **the interior's reachability.** Every open cell must still be reachable
 *   from the door. Rubble goes through `take`, which refuses any placement
 *   that would strand a cell;
 * - **no fire and no fluids.** A ruin is cold and dry. No campfire, no water,
 *   no lava — a burning ruin is a fire, and a flooded one is a fluid-lint
 *   failure waiting to happen;
 * - **no chains** (`chain` is not in the pinned block table at all; `iron_bars`
 *   carries the read), and **no signs** (a sign is a block entity the op
 *   stream cannot carry; a wall banner is the signage idiom).
 */

import { buildingIdFromTags, defineBuildingDescriptors, type BuildingDescriptor } from "./descriptor.js";
import { PropCounter, type FitOutContext } from "./archetypes-civic.js";
import {
  cellHash,
  decayShell,
  protectedColumn,
  settleDecayedFixtures,
  type DecayProfile,
} from "./decay.js";

/* -------------------------------------------------------------------------- */
/* the archetypes                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The five ruined buildings this file fits out, in catalog order.
 *
 * Spread into `BUILDING_ARCHETYPES` by `archetypes.ts`.
 */
export const RELIC_BUILDING_ARCHETYPES = [
  "ruined_cottage",
  "ruined_keep",
  "ruined_church",
  "collapsed_tower",
  "overgrown_villa",
] as const;

/** One of the archetypes this file fits out. */
export type RelicBuildingArchetype = (typeof RELIC_BUILDING_ARCHETYPES)[number];

/** True for an archetype this file answers to. */
export function isRelicArchetype(value: string): value is RelicBuildingArchetype {
  return (RELIC_BUILDING_ARCHETYPES as readonly string[]).includes(value);
}

/**
 * Tag → archetype, or `null` when nothing matches.
 *
 * Consulted straight after the commerce table and well before the extended
 * one. Every tag below is a **compound**, and the near misses are the whole of
 * the review:
 *
 * - **bare `ruin` and `ruins` resolve to `ruined_cottage`** (RUINS-PLAN-v0 Q3,
 *   ratified by Kai 2026-08-09). The long-standing objection was that an author
 *   who writes `"ruins"` and nothing else has not said *what* is ruined; the
 *   answer is that the **scale** question now lives in `decline` — a ruined
 *   quarter is a district with a high `decline`, not a lot tagged `ruins` — so
 *   what is left for a bare tag to mean is one ruined building, and the
 *   gentlest and most generic of the five is the honest reading. A seeded pick
 *   among the five was rejected: unpredictable is the wrong property for a word
 *   an author wrote on purpose;
 * - **bare `abbey` is not ours** — it is wave 4B's **abbey**, and claiming it
 *   would silently ruin every abbey in the vocabulary. The ruined church
 *   answers to `ruined_abbey` and `abbey_ruin`, which are compounds nothing
 *   else wants;
 * - **bare `keep`, `castle` and `tower` are not ours** either: those are the
 *   breadth keep's and the watchtower's. The ruined keep answers to
 *   `ruined_keep`, `ruined_castle` and `castle_ruin`, and the collapsed tower
 *   to `collapsed_tower`, `broken_tower` and `tower_ruin`;
 * - **bare `villa` is the Mediterranean villa's** and bare `house` still falls
 *   through to a cottage;
 * - **bare `overgrown` is not claimed.** It is an adjective, not a building —
 *   an overgrown *anything* is a plausible request, and this table must not be
 *   the one that decides an unqualified adjective means a villa.
 */
function relicArchetypeOfTags(tags: readonly string[]): RelicBuildingArchetype | null {
  return buildingIdFromTags(RELIC_BUILDING_DESCRIPTORS, tags);
}

/**
 * The **bare** `ruin` / `ruins` tags — `ruined_cottage`, or `null`.
 *
 * RUINS-PLAN-v0 **Q3, ratified by Kai 2026-08-09**: both bare tags point at
 * `ruined_cottage`, the gentlest and most generic of the five, now that the
 * *scale* answer lives in `decline` (a ruined quarter is a district with a high
 * `decline`, not a lot tagged `ruins`). A seeded pick among the five was
 * rejected — unpredictable is the wrong property for a word an author wrote on
 * purpose. This closes the kit's long-standing open authoring question.
 *
 * It is a **separate function, consulted last**, and that is the whole of the
 * care this ruling needs. `relicArchetypeOfTags` sits high in the chain because
 * its compounds must beat the greedy tables below it; a bare adjective claimed
 * from that position would steal `["ruins", "keep"]` from the garrison keep and
 * `["ruins", "abbey"]` from wave 4B's abbey, which is exactly the silent
 * hijack the compounds-only rule exists to prevent. Consulted immediately
 * before the extended table's `cottage` default instead, it changes the answer
 * for precisely the tag lists that used to reach that default with nothing more
 * specific to say — which is the ruling, and nothing else.
 */
export function relicBareRuinArchetype(tags: readonly string[]): RelicBuildingArchetype | null {
  return tags.includes("ruin") || tags.includes("ruins") ? "ruined_cottage" : null;
}

/**
 * Facade tendencies for this file's archetypes.
 *
 * Same contract as `archetypeFacadeDefaults`: defaults a caller merges into
 * its params, never something applied over an explicit one.
 *
 * Every ruin here asks for a **gable** and for **tall, sparse** openings, and
 * both are deliberate. A gable's shape is the one the crumble reads best
 * against — the roof is coming off anyway, and what survives is a wall head
 * with a jag in it. Tall sparse windows leave more solid wall between the
 * openings, and solid wall is what a crumble line is *drawn on*: a dense band
 * of glass gives the survivor courses nothing to be made of.
 */
export function relicFacadeDefaults(
  archetype: string,
): { readonly windowShape?: string; readonly windowRhythm?: string; readonly roof?: string } {
  switch (archetype) {
    case "ruined_cottage":
      return { windowShape: "single", windowRhythm: "sparse", roof: "gable" };
    case "ruined_keep":
      return { windowShape: "single", windowRhythm: "sparse", roof: "flat" };
    // A nave wants height in the surviving gable end.
    case "ruined_church":
      return { windowShape: "tall", windowRhythm: "sparse", roof: "gable" };
    case "collapsed_tower":
      return { windowShape: "single", windowRhythm: "sparse", roof: "hip" };
    case "overgrown_villa":
      return { windowShape: "tall", windowRhythm: "sparse", roof: "hip" };
    default:
      return {};
  }
}

/* -------------------------------------------------------------------------- */
/* the five decays, as parameter sets                                          */
/* -------------------------------------------------------------------------- */

/**
 * The five relics' decays, as five {@link DecayProfile}s.
 *
 * RUINS-PLAN-v0 WP-1: the five moves are no longer written here — they are the
 * operators in `decay.ts`, and these five records are the whole of what used to
 * distinguish one hand-written sequence from another. Table 14's five decays
 * "are not five models; they are three collapse shapes and two dials", and this
 * is that sentence as data.
 *
 * The `intensity` figures are RUINS-PLAN §5's table. **No operator reads them
 * yet** — WP-3's band table is what turns a `decline` into a whole profile; in
 * WP-1 they are recorded so the band table has something to be held to, and
 * `structures-relic.test.ts` asserts them against the document.
 */
export const RELIC_DECAY_PROFILES: Readonly<Record<RelicBuildingArchetype, DecayProfile>> = {
  /**
   * The gentlest of the five and the reference implementation of the ruin law:
   * an even crumble a course or two above the standing plane, mossy cobble
   * survivors, the thatch gone entirely with a fragment or two left on the wall
   * heads, a scatter of rubble on the floor and vines down the inside of what
   * is left.
   */
  ruined_cottage: {
    intensity: 0.5,
    collapse: "even",
    collapseFloor: 2,
    collapseSpread: 3,
    overgrowth: 0.35,
    rubble: 0.26,
    materials: {
      clad: (x, y, z) => (cellHash(3, x + y, z) % 3 === 0 ? "mossy_cobblestone" : "cobblestone"),
      fragmentStyle: "roof.slab",
      spill: "mossy_cobblestone",
      heap: (x, z) => (cellHash(11, x, z) % 2 === 0 ? "mossy_cobblestone" : "cobblestone"),
      floorPaint: (x, z) => (cellHash(5, x, z) % 4 === 0 ? "coarse_dirt" : null),
    },
  },
  /**
   * A fortress reduced to its corners — the *structured* collapse: a keep's
   * corners are its thickest masonry and are the last thing to go, and the
   * curtains between them are gone almost to the plinth. The read is four
   * stumps and a low wall, which is what a real keep ruin looks like from
   * across a field.
   */
  ruined_keep: {
    intensity: 0.6,
    collapse: "structured",
    collapseFloor: 2,
    collapseSpread: 3,
    overgrowth: 0.25,
    rubble: 0.3,
    materials: {
      clad: (x, y, z) => {
        const k = cellHash(13, x + y * 3, z) % 5;
        if (k === 0) return "cracked_stone_bricks";
        if (k === 1) return "mossy_stone_bricks";
        return "stone_bricks";
      },
      fragmentStyle: "stone.slab",
      spill: "cobbled_deepslate",
      heap: (x, z) => (cellHash(19, x, z) % 3 === 0 ? "mossy_stone_bricks" : "cobblestone"),
      floorPaint: (x, z) => (cellHash(17, x, z) % 5 === 0 ? "cracked_stone_bricks" : null),
    },
  },
  /**
   * A roofless nave with its gable ends still up. The crumble is generous, so
   * the walls stay tall enough to read as a nave; what makes it a *church* ruin
   * rather than a barn ruin is the survivor cladding — mossy stone brick with a
   * chiseled band at the springing course.
   */
  ruined_church: {
    intensity: 0.4,
    collapse: "structured",
    collapseFloor: 3,
    collapseSpread: 3,
    overgrowth: 0.4,
    rubble: 0.22,
    materials: {
      clad: (x, y, z) => {
        if (y === 3) return "chiseled_stone_bricks";
        return cellHash(23, x, y + z) % 3 === 0 ? "mossy_stone_bricks" : "stone_bricks";
      },
      fragmentStyle: "stone.slab",
      spill: "mossy_stone_bricks",
      heap: (x, z) => (cellHash(31, x, z) % 2 === 0 ? "mossy_stone_bricks" : "cobblestone"),
      floorPaint: (x, z) => (cellHash(29, x, z) % 6 === 0 ? "podzol" : null),
    },
  },
  /**
   * A tower that has fallen **one way** — the only *leaning* collapse here, and
   * the reason the shape exists: the surviving height falls off linearly along
   * `+x`, so the wall head slopes from a standing stub at one end to almost
   * nothing at the other. A tower goes over; it does not weather away.
   *
   * `clearInteriorFrom: 3` takes the deck with it. The shell's upper platform
   * was fed by a ladder whose backing wall has just crumbled, and a deck no
   * ladder reaches is a floating disc the walking agent is rightly unable to
   * get to — a collapsed tower is a stump, not a treehouse.
   */
  collapsed_tower: {
    intensity: 0.7,
    collapse: "leaning",
    collapseFloor: 2,
    collapseSpread: 3,
    overgrowth: 0.2,
    rubble: 0.34,
    clearInteriorFrom: 3,
    materials: {
      clad: (x, y, z) => {
        const k = cellHash(37, x, y + z) % 4;
        if (k === 0) return "cracked_stone_bricks";
        if (k === 1) return "mossy_cobblestone";
        return "stone_bricks";
      },
      fragmentStyle: "stone.slab",
      spill: "cobblestone",
      heap: (x, z) => (cellHash(43, x, z) % 3 === 0 ? "cracked_stone_bricks" : "cobblestone"),
      floorPaint: (x, z) => (cellHash(41, x, z) % 3 === 0 ? "gravel" : null),
    },
  },
  /**
   * A fine house the forest has taken back: the gentlest crumble of the five
   * (the walls are mostly *there*; it is the roof that has gone) and by far the
   * greenest — moss block among the survivors, vines on every second inside
   * face, moss carpet on most of the rubble and a floor gone half to grass.
   */
  overgrown_villa: {
    intensity: 0.3,
    collapse: "structured",
    collapseFloor: 3,
    collapseSpread: 2,
    overgrowth: 0.55,
    rubble: 0.2,
    materials: {
      clad: (x, y, z) => {
        const k = cellHash(47, x + y, z) % 6;
        if (k === 0) return "moss_block";
        if (k === 1) return "mossy_stone_bricks";
        return "smooth_sandstone";
      },
      fragmentStyle: "stone.slab",
      spill: "moss_block",
      heap: (x, z) => (cellHash(59, x, z) % 2 === 0 ? "moss_block" : "cobblestone"),
      floorPaint: (x, z) => (cellHash(53, x, z) % 3 === 0 ? "grass_block" : null),
    },
  },
};

/* -------------------------------------------------------------------------- */
/* the furniture the decay leaves behind                                       */
/* -------------------------------------------------------------------------- */

/**
 * Offer a prop every cell of the two wall rows in turn, and stop at the first
 * that takes it — wave 5E's helper, verbatim.
 */
function offerOnWalls(
  ctx: FitOutContext,
  c: PropCounter,
  block: string,
  props?: Record<string, string>,
): boolean {
  const it = ctx.interior;
  // A cobweb is the one offer here a player walks *through*: the physics lint
  // treats its cell as walkable and demands it stay reachable. Taking the cell
  // out of the plan's open set let the slab chair placed after it seal the web
  // into a one-cell pocket — legally, because the guard no longer counted the
  // cell. So a passable block is written without a take: the cell stays open,
  // and every later take must keep a route to it.
  const passable = block === "cobweb";
  for (let z = it.z0; z <= it.z1; z++) {
    for (const x of [it.x1, it.x0]) {
      if (protectedColumn(ctx, x, z)) continue;
      if (passable) {
        if (!ctx.free(x, z)) continue;
        if (ctx.blockAt(x, 1, z) !== undefined) continue;
        ctx.put(x, 1, z, block, props);
        c.n++;
        return true;
      }
      if (c.put1(x, z, block, props)) return true;
    }
  }
  return false;
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
function furnishRelic(ctx: FitOutContext): number {
  if (!isRelicArchetype(ctx.archetype)) return 0;
  const c = new PropCounter(ctx);
  switch (ctx.archetype) {
    case "ruined_cottage":
      fitRuinedCottage(ctx, c);
      break;
    case "ruined_keep":
      fitRuinedKeep(ctx, c);
      break;
    case "ruined_church":
      fitRuinedChurch(ctx, c);
      break;
    case "collapsed_tower":
      fitCollapsedTower(ctx, c);
      break;
    case "overgrown_villa":
    default:
      fitOvergrownVilla(ctx, c);
      break;
  }
  // After every decay pass, and after the ruin's own furniture: nothing the
  // decay unsupported may survive it.
  settleDecayedFixtures(ctx);
  return c.n;
}

/* -------------------------------------------------------------------------- */
/* the five ruins                                                              */
/* -------------------------------------------------------------------------- */

/**
 * `ruined_cottage` — a small house nobody has lived in for a long time.
 *
 * The decay is {@link RELIC_DECAY_PROFILES}`.ruined_cottage`; what is left
 * here is the furniture, and there is barely any: a hearth-side barrel and a
 * broken chair — a stair with its back to the room — because a cottage that
 * still has its dresser in it has not been abandoned.
 */
function fitRuinedCottage(ctx: FitOutContext, c: PropCounter): void {
  decayShell(ctx, c, RELIC_DECAY_PROFILES.ruined_cottage);
  offerOnWalls(ctx, c, "barrel", { facing: "up", open: "false" });
  offerOnWalls(ctx, c, ctx.style["stair.interior"] as string, {
    facing: "north",
    half: "bottom",
    shape: "straight",
  });
}

/**
 * `ruined_keep` — a fortress reduced to its corners.
 *
 * A cobweb and a fallen slab of the keep's own stone are the whole of what a
 * fortress leaves behind it.
 */
function fitRuinedKeep(ctx: FitOutContext, c: PropCounter): void {
  decayShell(ctx, c, RELIC_DECAY_PROFILES.ruined_keep);
  offerOnWalls(ctx, c, "cobweb");
  offerOnWalls(ctx, c, ctx.style["stone.slab"] as string, {
    type: "bottom",
    waterlogged: "false",
  });
}

/**
 * `ruined_church` — a roofless nave with one gable end still up.
 *
 * The one thing the decay does not say is that this was a church, so the
 * fit-out says it: an altar stump at the end furthest from the door, one block
 * of chiseled stone brick with a slab on it and nothing else. No candles —
 * this altar has been cold for a century.
 */
function fitRuinedChurch(ctx: FitOutContext, c: PropCounter): void {
  decayShell(ctx, c, RELIC_DECAY_PROFILES.ruined_church);
  const it = ctx.interior;
  // The altar stump, at the far end and one column off the middle — the shell
  // hangs its lantern in the middle column and nothing here stands under it.
  const far = ctx.door !== null && ctx.door.z > (it.z0 + it.z1) / 2 ? it.z0 : it.z1;
  const mid = Math.floor((it.x0 + it.x1) / 2);
  for (const x of [mid - 1, mid + 1, it.x0, it.x1]) {
    if (x < it.x0 || x > it.x1) continue;
    if (protectedColumn(ctx, x, far)) continue;
    if (c.put1(x, far, "chiseled_stone_bricks")) {
      c.stack(x, far, 2, ctx.style["stone.slab"] as string, {
        type: "bottom",
        waterlogged: "false",
      });
      break;
    }
  }
}

/**
 * `collapsed_tower` — a tower that has fallen **one way**.
 *
 * Everything the tower shed is on the ground, which the profile's heavy rubble
 * and heavy spill say; a cobweb is all the furniture a stump has room for.
 */
function fitCollapsedTower(ctx: FitOutContext, c: PropCounter): void {
  decayShell(ctx, c, RELIC_DECAY_PROFILES.collapsed_tower);
  offerOnWalls(ctx, c, "cobweb");
}

/**
 * `overgrown_villa` — a fine house the forest has taken back.
 *
 * The one piece of the villa still legible is a row of **fallen column drums**
 * — full blocks lying in a line along a wall row, each touching its neighbour
 * and the floor under it, which is what keeps the run out of
 * `floating.isolated`.
 */
function fitOvergrownVilla(ctx: FitOutContext, c: PropCounter): void {
  decayShell(ctx, c, RELIC_DECAY_PROFILES.overgrown_villa);
  const it = ctx.interior;
  // The fallen colonnade: a run of drums down one wall row, laid end to end so
  // every drum touches the one beside it and the floor beneath it.
  // Offered every cell of both wall rows in turn rather than laid blindly down
  // one: a cell taken by the stair run, the hearth reserve or the door
  // approach is a cell `put1` refuses, and a villa with no colonnade in it is
  // not the archetype. A refusal is skipped, never a reason to stop.
  let drums = 0;
  for (const row of [it.x0, it.x1]) {
    for (let z = it.z0 + 1; z <= it.z1 - 1; z++) {
      if (protectedColumn(ctx, row, z)) continue;
      if (c.put1(row, z, "chiseled_sandstone")) drums++;
    }
    if (drums > 0) break;
  }
}

/* -------------------------------------------------------------------------- */
/* descriptor seam — building registry handle (Phase 4, no self-registration)   */
/* -------------------------------------------------------------------------- */

/**
 * Ordered building descriptors for the relic pack — one row per local id, in
 * `RELIC_BUILDING_ARCHETYPES` order (catalog order). No realization change:
 * furnish stays `furnishRelic` (which runs `decayShell` + `settleDecayedFixtures`
 * in existing LocalVoxelOp order), facade defaults delegate to
 * `relicFacadeDefaults`, and tags preserve the compound-only matching semantics
 * from `relicArchetypeOfTags`. Bare `ruin`/`ruins` is a separate low-priority
 * resolver (see `relicBareRuinArchetype`) and is NOT merged into these tags —
 * that preserves the "adjective never outranks a noun" priority.
 *
 * Central `archetypeOfTags` consults `relicArchetypeOfTags` after arcana/depths
 * and before spectacle/faith, with `relicBareRuinArchetype` last after the
 * extended table — preserved by registering this array before spectacle/faith
 * and consulting the bare resolver last.
 */
export const RELIC_BUILDING_DESCRIPTORS = defineBuildingDescriptors(RELIC_BUILDING_ARCHETYPES, {
  tags: {
    ruined_cottage: ["ruined_cottage", "ruined_house", "derelict_cottage"],
    ruined_keep: ["ruined_keep", "ruined_castle", "castle_ruin"],
    ruined_church: ["ruined_church", "ruined_chapel", "ruined_abbey", "abbey_ruin"],
    collapsed_tower: ["collapsed_tower", "broken_tower", "tower_ruin"],
    overgrown_villa: ["overgrown_villa", "villa_ruin", "ruined_villa"],
  },
  facadeDefaults: relicFacadeDefaults,
  furnish: furnishRelic,
  dispatch: "standard",
});

const RELIC_BARE_RUIN_TAGS: readonly string[] = ["ruin", "ruins"] as const;
