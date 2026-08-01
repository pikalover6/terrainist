/**
 * Archetype breadth, **wave six** — the depths: three buildings whose subject
 * is what is underneath them.
 *
 * `archetypes-blitz.ts` states the design law every file in this family obeys
 * and it is not restated here. What *is* particular to this file is the shape
 * of the thing it builds, and it is the mine head's shape rather than the
 * cottage's:
 *
 * > **the surface piece is an entrance.** A bunker complex is a concrete
 * > blockhouse over concrete rooms; a subway station is a ticket hall over a
 * > platform; an underground silo is a hatch hut over a shaft. In every case
 * > the building the reader walks into is the smaller half, and the half that
 * > carries the archetype's whole meaning is the cellar.
 *
 * So each of these three **digs itself a cellar** when the document says
 * nothing — `defaultBasementDepth` in `underground.ts` — and dresses it in a
 * style of its own — `defaultCellarStyle` in the same file. `mine_head` has
 * done the second of those since G4; this wave adds the first, because a
 * missile silo whose author forgot `"basement": 5` is a shed with a strange
 * name, and that is a worse failure than an unasked-for cellar.
 *
 * ## What the fit-out here may and may not do
 *
 * It fits out the **ground floor only**, through `ctx.place`/`PropCounter`,
 * which is the guarded surface every wave uses: a take that would strand part
 * of the room is refused rather than drawn. It never touches the cellar — the
 * cellar is `underground.ts`'s, reached by style, and the two halves meet only
 * at the ladder `core.ts` runs between them.
 *
 * The house rules, restated because they are what the lint checks:
 * no sign blocks (a label is a banner), no `chain` (a hanging light hangs from
 * the block above it), no plain `mud`, no fluid outside the boxed predicate —
 * none of these three writes a fluid at all — and every torch on a full block.
 */

import { PropCounter, type FitOutContext } from "./archetypes-civic.js";

/* -------------------------------------------------------------------------- */
/* the archetypes                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The three archetypes this file fits out, in catalog order.
 *
 * Spread into `BUILDING_ARCHETYPES` by `archetypes.ts`.
 */
export const DEPTHS_BUILDING_ARCHETYPES = [
  "bunker_complex",
  "subway_station",
  "underground_silo",
] as const;

/** One of the archetypes this file fits out. */
export type DepthsBuildingArchetype = (typeof DEPTHS_BUILDING_ARCHETYPES)[number];

/** True for an archetype this file answers to. */
export function isDepthsArchetype(value: string): value is DepthsBuildingArchetype {
  return (DEPTHS_BUILDING_ARCHETYPES as readonly string[]).includes(value);
}

/**
 * Tag → archetype, or `null` when nothing matches.
 *
 * Every claim here is a **compound**, and each near miss is deliberate,
 * because all three of the obvious bare words are already owned:
 *
 * - `bunker` is the **garrison's**, so the complex answers to `bunker_complex`
 *   and `fallout_shelter` and never reaches for the bare word;
 * - `station` alone is unclaimed on purpose (the science wave left it so for a
 *   railway station), and this file does not take it either: a subway station
 *   is `subway_station`, `metro_station` or `underground_station`;
 * - `silo` is the **homestead's** farm silo, so the buried one is
 *   `underground_silo` or `missile_silo`.
 */
export function depthsArchetypeOfTags(tags: readonly string[]): DepthsBuildingArchetype | null {
  const has = (t: string): boolean => tags.includes(t);
  if (has("bunker_complex") || has("fallout_shelter")) return "bunker_complex";
  if (has("subway_station") || has("metro_station") || has("underground_station")) {
    return "subway_station";
  }
  if (has("underground_silo") || has("missile_silo")) return "underground_silo";
  return null;
}

/**
 * Facade tendencies for this file's archetypes.
 *
 * Same contract as every other wave's: defaults a caller merges into its
 * params, never something applied over an explicit one. All three want as
 * few holes in the wall as the grammar will allow — these are buildings whose
 * job is to be shut.
 */
export function depthsFacadeDefaults(
  archetype: string,
): { readonly windowShape?: string; readonly windowRhythm?: string; readonly roof?: string } {
  switch (archetype) {
    case "bunker_complex":
      return { windowShape: "single", windowRhythm: "sparse", roof: "flat" };
    // A ticket hall is the one of the three that wants light: it is a place
    // people queue in.
    case "subway_station":
      return { windowShape: "mullion", windowRhythm: "regular", roof: "flat" };
    case "underground_silo":
      return { windowShape: "single", windowRhythm: "sparse", roof: "flat" };
    default:
      return {};
  }
}

/* -------------------------------------------------------------------------- */
/* the fit-out                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Ground-floor fit-out for the three depths archetypes.
 *
 * Returns the block count, as every wave's does; `0` when the archetype is not
 * one of this file's.
 */
export function furnishDepths(ctx: FitOutContext): number {
  if (!isDepthsArchetype(ctx.archetype)) return 0;
  const c = new PropCounter(ctx);
  switch (ctx.archetype) {
    case "bunker_complex":
      fitBunkerComplex(ctx, c);
      break;
    case "subway_station":
      fitSubwayStation(ctx, c);
      break;
    case "underground_silo":
    default:
      fitUndergroundSilo(ctx, c);
      break;
  }
  return c.n;
}

/** The interior cells that touch a wall, in canonical (z, x) order. */
function wallAdjacent(ctx: FitOutContext): (readonly [number, number])[] {
  const it = ctx.interior;
  const out: (readonly [number, number])[] = [];
  for (let z = it.z0; z <= it.z1; z++) {
    for (let x = it.x0; x <= it.x1; x++) {
      if (x === it.x0 || x === it.x1 || z === it.z0 || z === it.z1) out.push([x, z] as const);
    }
  }
  return out;
}

/**
 * `bunker_complex` — a concrete blockhouse over concrete rooms.
 *
 * Above ground it is a guard post and a store: a lookout's ladder-height bench
 * of stairs, a table, a furnace, and crates against the wall. The concrete is
 * the *cellar's* material, not the shell's — the shell stays the theme's,
 * because a village of grey boxes is a worse read than a grey box in a village.
 */
function fitBunkerComplex(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  // The duty desk, at the far corner from the door.
  c.put1(it.x1, it.z0, "crafting_table");
  c.put1(it.x1, it.z0 + 1 <= it.z1 ? it.z0 + 1 : it.z0, "furnace", {
    facing: "west",
    lit: "false",
  });
  // Stores against the walls, sparsely: a bunker's ground floor is mostly the
  // way down to the bunker.
  for (const [x, z] of wallAdjacent(ctx)) {
    if ((x * 3 + z * 5) % 7 !== 0) continue;
    c.put1(x, z, "barrel", { facing: "up", open: "false" });
  }
  // A blast door's worth of iron in the corner. Deliberately *not* a lantern
  // stacked on top of it: a full cube with a light over it is a column the
  // `interior.blocked_column` rule has to argue about, and the shell has
  // already lit this room.
  c.put1(it.x0, it.z1, "iron_block");
}

/**
 * `subway_station` — a ticket hall over a platform.
 *
 * The hall is benches down one wall, a barrier of two lecterns at the head of
 * the way down, and a pair of banners for the line colours (a banner, never a
 * sign). The platform itself is the cellar, dressed `subway`.
 */
function fitSubwayStation(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  // Benches: stairs against the west wall, facing into the hall.
  for (let z = it.z0 + 1; z <= it.z1 - 1; z += 2) {
    c.put1(it.x0, z, "stone_stairs", { facing: "east", half: "bottom", shape: "straight" });
  }
  // The ticket line: two lecterns at the east wall, which is the closest this
  // grammar gets to a barrier a player can walk round.
  c.put1(it.x1, it.z0, "lectern", { facing: "west", has_book: "true" });
  c.put1(it.x1, it.z1, "lectern", { facing: "west", has_book: "false" });
  // The line colours, on the wall over the benches. Wall banners hang off the
  // wall block behind them and cost the floor nothing.
  // …on the interior face, never *in* the wall ring: a banner written into the
  // wall is a hole in the wall with a flag over it.
  const labelY = Math.min(2, ctx.storyHeight - 1);
  c.stack(it.x0, Math.floor((it.z0 + it.z1) / 2), labelY, "light_blue_wall_banner", {
    facing: "east",
  });
}

/**
 * `underground_silo` — a hatch hut over a shaft.
 *
 * Deliberately the barest interior of the three: a hut over a silo is a hut
 * with a hole in it, and everything that makes the archetype what it is lives
 * five blocks down. What the hut gets is the hardware — an anvil, a crate, and
 * a copper band at head height on the wall, which is the silo's own material
 * showing through above ground.
 */
function fitUndergroundSilo(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  c.put1(it.x1, it.z1, "anvil", { facing: "north" });
  c.put1(it.x0, it.z0, "barrel", { facing: "up", open: "false" });
  // The band: a course of cut copper on the inside face of the wall ring, at
  // head height. It is written into the *wall*, so it takes no floor.
  const bandY = Math.min(2, ctx.storyHeight - 1);
  for (let z = it.z0 - 1; z <= it.z1 + 1; z++) {
    for (let x = it.x0 - 1; x <= it.x1 + 1; x++) {
      const ring = x === it.x0 - 1 || x === it.x1 + 1 || z === it.z0 - 1 || z === it.z1 + 1;
      if (!ring) continue;
      if (ctx.door !== null && ctx.door.x === x && ctx.door.z === z) continue;
      if ((x + z) % 2 !== 0) continue;
      const existing = ctx.blockAt(x, bandY, z);
      // Never over a window, a door head or anything else an earlier stage
      // wrote: the band is a *fill* of the plain wall, not a paint over it.
      if (existing === undefined) continue;
      if (existing.block.includes("glass") || existing.block.includes("door")) continue;
      ctx.put(x, bandY, z, "cut_copper");
      c.n++;
    }
  }
}
