/**
 * The infrastructure-entry registry — `docs/INFRA-ENTRIES-v0.md` §3.3, W0.
 *
 * ## What this file is
 *
 * The catalog has sixty-eight rows that are not an object at a place: a *line*
 * over ground nobody owns, a *face* between two levels, a *treatment* of a
 * plane somebody else made. Exactly one of them is built — `curtain_wall`, via
 * `infra.wall@0` — and the lesson of that pass is that all three of its parts
 * generalise and none of them is the entry: `deriveWallCourse` is a route form,
 * `sweepCourse` is the engine every client shares, and what belongs to the
 * curtain wall alone is its cross-section and its material table.
 *
 * So an entry is **a row of data plus one profile function**, and this file is
 * where the rows live. Adding an entry must not cost a line of `structures/`
 * code — that is the acceptance test the design states for itself.
 *
 * ## Why the profile types are restated here
 *
 * The engine (`compiler/src/structures/sweep.ts`) owns {@link InfraSweptProfile}'s
 * real declaration, and `stdlib` sits *below* `compiler` in the dependency
 * graph — a registry that could not load without the engine it feeds would be a
 * layering inversion. This is the same move `spec` makes for
 * `KNOWN_BUILDING_ARCHETYPES` and the wall's own seam file made for the pinned
 * contract, and it is kept honest the same way: the compiler's
 * `structures/infra-entry.ts` assigns a registry profile to the engine's
 * `SweptProfile` through one typed adapter, so a drift between the two is a
 * **compile error** in the package that can see both, not a runtime surprise.
 *
 * ## What is here
 *
 * W0's internal fixture, {@link INFRA_TEST_ENTRY}, which exists so the host has
 * a client that does not wait on content — an internal row is **not** a catalog
 * id and is excluded from {@link INFRA_ENTRY_IDS}, the set the catalog guard
 * checks both ways — and W1's four: `quarantine_fence`, `barricade_line`,
 * `crash_furrow` and `crop_circle`, which are one prompt's world (P2, *"a small
 * farm town being invaded by aliens"*) and four different mechanisms.
 *
 * ## Determinism
 *
 * A profile function is a pure function of its context: the resolved theme, the
 * node's params and the entry's seed. It draws no random number itself — where
 * an entry wants variation it takes it from `ctx.seed`, which is
 * `hash(worldSeed, nodePath)` like everything else in this compiler.
 */

import { Rng, streamSeed, type Seed256 } from "../determinism/index.js";

import type { MaterialTheme } from "./themes.js";

/* -------------------------------------------------------------------------- */
/* the pinned profile vocabulary (restated — see the module note)              */
/* -------------------------------------------------------------------------- */

/** {@link InfraProfileBand}'s role. Mirrors the engine's `BandRole`. */
export type InfraBandRole =
  | "carriageway"
  | "verge"
  | "kerb"
  | "walkway"
  | "deck"
  | "core"
  | "parapet"
  | "footing"
  | "ditch";

/** Courses above a band's top. Mirrors the engine's `BandCap`. */
export interface InfraBandCap {
  readonly height: number;
  readonly block: string;
  /** A fence/wall rail rather than a solid course. */
  readonly rail?: boolean;
}

/** One band of a cross-section. Mirrors the engine's `ProfileBand`. */
export interface InfraProfileBand {
  readonly id: string;
  readonly role: InfraBandRole;
  /** Columns per side; with `centred`, the full width straddling the line. */
  readonly width: number;
  readonly centred?: boolean;
  /** Blocks relative to the swept datum. Negative cuts below it. */
  readonly level?: number;
  readonly surface: string;
  readonly fill?: string;
  readonly cap?: InfraBandCap;
}

/** Mirrors the engine's `IntervalFeature`. */
export interface InfraIntervalFeature {
  readonly id: string;
  /** Columns of arc length between instances. */
  readonly pitch: number;
  readonly phase?: number;
  readonly at?: "interval" | "bend" | "both";
  readonly offset: number;
  /** A stdlib prop id or `authored:<id>`; omitted means the profile draws it. */
  readonly generator?: string;
}

/** A cross-section. Mirrors the engine's `SweptProfile`. */
export interface InfraSweptProfile {
  readonly id: string;
  readonly bands: readonly InfraProfileBand[];
  readonly asymmetric?: boolean;
  readonly maxGrade: number;
  readonly follow: "grade" | "level" | "step";
  readonly features?: readonly InfraIntervalFeature[];
  readonly crossing: "bridge" | "causeway" | "ford" | "stop";
}

/* -------------------------------------------------------------------------- */
/* the registry's own vocabulary                                               */
/* -------------------------------------------------------------------------- */

/**
 * The route forms an entry may accept (§3.2).
 *
 * Closed, and closed *deliberately*: every form names something the compiler
 * placed, so a model cannot reach for a coordinate. `between` is declared
 * because the vocabulary is the design's, and is refused pre-freeze — it needs
 * the road router and a tier-A ground declaration (§5).
 */
export const INFRA_ROUTE_FORMS = ["ring", "along", "across", "between", "into", "over"] as const;

/** One route form. */
export type InfraRouteForm = (typeof INFRA_ROUTE_FORMS)[number];

/** The forms the W0 host resolves. `between` is post-freeze (§3.2, §5). */
export const INFRA_ROUTE_FORMS_IMPLEMENTED = ["ring", "along", "across", "into", "over"] as const;

/** True for a form this host resolves today. */
export function isImplementedRouteForm(form: string): form is InfraRouteForm {
  return (INFRA_ROUTE_FORMS_IMPLEMENTED as readonly string[]).includes(form);
}

/**
 * The ground-contract class an entry declares (§3.5).
 *
 * Three, and no new one — the domain is a subset of the compiler's
 * `GroundSourceClass`, pinned by the same typed adapter as the profile.
 * `structure.linework` is rank 25 / tier A and is **reserved**: a tier-A
 * declarer must declare before the streets exist, and every pre-freeze entry
 * finds its crossings against the *finished* carriageway. The driver refuses a
 * row that names it, which is the scope line §5 asks to be defended.
 */
export type InfraSourceClass = "sweep.run" | "retaining.seam" | "structure.linework";

/**
 * What an entry does where a carriageway crosses it (§3.6).
 *
 * `open` — the wall's rule verbatim: every maximal run of route columns a
 * carriageway claims becomes one opening and nothing is written in the road.
 * `block` — the entry crosses regardless; a hedgerow does not open for a cart
 * track. `gap` — the inversion, and a barricade's whole point: block the
 * carriageway but leave exactly one opening, chosen by a stated total order.
 */
export type InfraCrossing = "open" | "block" | "gap";

/**
 * What one column of an areal treatment becomes.
 *
 * `undefined` from {@link InfraAreaStamp.cell} means the column is **outside
 * the treatment** and is left exactly as the resolver decided it — which is
 * most of a field, because a crop circle is a geometry *in* a crop rather than
 * a repaint of one.
 */
export interface InfraAreaCell {
  /** The block this column's top course becomes; omitted leaves the material. */
  readonly surface?: string;
  /**
   * Courses of standing growth above the surface the treatment presses flat.
   *
   * A crop circle is not paint: what makes it read from the ground is that the
   * wheat that stood here is *down*. Clearing is the only way to say that, and
   * it is the one thing in this registry that removes a block somebody else
   * wrote — see {@link InfraEntryDef.declaresLevels} for the disposition that
   * makes it legal.
   */
  readonly clear?: number;
}

/** An areal treatment's stamp — the top course of ground it does not own. */
export interface InfraAreaStamp {
  readonly id: string;
  /** The block the treated column's top course becomes, when {@link cell} is absent. */
  readonly surface: string;
  /**
   * Courses below the surface this treatment also re-materialises. `0` (the
   * default) rewrites the top course alone, which is what a treatment *is*.
   */
  readonly depth?: number;
  /**
   * The treatment's own geometry, in columns **relative to the area's centre**.
   *
   * Absent means "every column of the mask, uniformly" — which is what W0's
   * host did and what a `stump_field` still wants. Present, it is the whole
   * difference between a treatment and a repaint: the mask says *where the
   * pass may write*, and this says *what the pattern is*. Coordinates are
   * relative because the registry may never see a world coordinate (§5), and
   * they are the only geometry an entry gets to compute for itself.
   */
  readonly cell?: (dx: number, dz: number) => InfraAreaCell | undefined;
}

/** What a profile or stamp function is handed. Mirrors `PropContext`'s shape. */
export interface InfraContext {
  /** The settlement's resolved material theme. */
  readonly theme: MaterialTheme | undefined;
  /** The node's own `params`, already validated by the spec. */
  readonly params: Readonly<Record<string, unknown>>;
  /** `hash(worldSeed, nodePath)` — for decoration that varies, not geometry. */
  readonly seed: Seed256;
  /**
   * The bounding span of the area an `over` route resolved to, in columns.
   *
   * Set for an area job and for nothing else. A disc has to know how big the
   * field is to size itself, and the alternative — a radius in the node's
   * params — is an author guessing at a number the compiler already knows.
   */
  readonly extent?: { readonly width: number; readonly depth: number };
}

/**
 * A fitting seated at an interval feature: one column of blocks, bottom-up,
 * standing on its own ground.
 *
 * The design's §3.3 hands `IntervalFeature.generator` a stdlib prop id and
 * lets `buildProps` seat it. That seam is real and unexercised, and it is also
 * the *expensive* half: a prop is a box, a yaw, a pad and a placement
 * negotiation. A mast is a column of five blocks. This is the cheap half, and
 * the two are not in competition — an entry that wants a whole trailer beside
 * its fence still names a generator.
 */
export interface InfraFitting {
  /** Blocks from the ground up. Every one a full cube unless it stands last. */
  readonly stack: readonly string[];
}

/** One row of the registry (§3.3). */
export interface InfraEntryDef {
  /** The catalog id — or, for an internal row, a name no catalog row has. */
  readonly id: string;
  /** Which route forms are legal for this entry. */
  readonly routes: readonly InfraRouteForm[];
  readonly geometry:
    | { readonly kind: "route"; readonly profile: (ctx: InfraContext) => InfraSweptProfile }
    | { readonly kind: "area"; readonly stamp: (ctx: InfraContext) => InfraAreaStamp };
  /** §3.5. A route entry that declares nothing writes no level at all. */
  readonly sourceClass?: InfraSourceClass;
  readonly crossings: InfraCrossing;
  /** Refuse a resolved route shorter than this — the `LOAM-T232` threshold. */
  readonly minRun: number;
  readonly features?: readonly InfraIntervalFeature[];
  /**
   * What each of the profile's interval features is made of, by feature id.
   *
   * A feature with no fitting and no `generator` is a position and nothing
   * else, which is what W0 shipped: the sweep seated them and the driver had
   * nowhere to send them.
   */
  readonly fittings?: Readonly<Record<string, InfraFitting>>;
  /**
   * This entry's levels go through the **ground contract** rather than being
   * built on top of what it finds (`docs/GROUND-CONTRACT-v0.md` §3.13, §9).
   *
   * Two entries need it and they need it for the same reason: a crash furrow
   * cuts *below* the ground and a crop circle flattens it, and neither can be
   * said by stacking blocks on a surface. Declare → resolve → build: the run's
   * levels are committed as an intent at {@link sourceClass}, the resolver
   * arbitrates them against every other claim on those columns, and the
   * materials are then laid on the ground the resolver actually gave — never
   * on the level the entry asked for, which is the mistake §9a.1 rule 2 exists
   * to forbid.
   *
   * It also changes the entry's occupancy disposition, and deliberately: a
   * treatment that flattens presses whatever stood in the columns it won,
   * because that is what "flattened" means. Columns carrying something taller
   * than the treatment's own clearance are skipped whole, so a crop circle
   * takes the wheat and never the barn.
   */
  readonly declaresLevels?: true;
  /**
   * Blocks of datum above the ground the sweep aims for, when the node says
   * nothing. A fence is low; a wall is not.
   */
  readonly rise: number;
  /**
   * An internal row: a client for the host's own tests and exhibit, with no
   * catalog row behind it.
   *
   * The catalog guard checks the registry **both ways** — an implemented
   * `infrastructure` row must name a registry id, and a registry id must name a
   * catalog row — and an internal row is excluded from both directions by being
   * absent from {@link INFRA_ENTRY_IDS}. Without the flag the guard would have
   * to be weakened to a one-way check, which is the silent failure it exists to
   * prevent.
   */
  readonly internal?: true;
}

/* -------------------------------------------------------------------------- */
/* the entries                                                                 */
/* -------------------------------------------------------------------------- */

/** The id of the one internal row W0 ships (see {@link InfraEntryDef.internal}). */
export const INFRA_TEST_ENTRY = "test_fence";

/**
 * The host's own client: one column of full cubes, capped, with a post at
 * intervals.
 *
 * Full cubes and a solid cap, not a `*_fence` block, and that is the registry
 * default the design asks for rather than a shortcut: a fence block is
 * `connection.stale` waiting to happen unless the run goes through
 * `applyConnectionStates`, and a slab or stair in a swept cap is
 * `floating.slab`. An entry that wants connective blocks must say so and take
 * the connection pass with it; the default is the wall's every-entry-a-full-cube
 * rule.
 *
 * Fixed materials rather than theme-derived, deliberately: this row is the
 * fixture the host is measured with, and a fixture whose blocks move when a
 * theme is re-dealt makes every driver test a theme test.
 */
function testFenceProfile(): InfraSweptProfile {
  return {
    id: `infra.entry@0/${INFRA_TEST_ENTRY}`,
    follow: "step",
    maxGrade: 1,
    crossing: "stop",
    bands: [
      {
        id: "line",
        role: "core",
        width: 1,
        centred: true,
        surface: "oak_planks",
        fill: "cobblestone",
        cap: { height: 1, block: "oak_planks" },
      },
    ],
    features: [{ id: "post", pitch: 8, at: "both", offset: 0 }],
  };
}

/* -------------------------------------------------------------------------- */
/* W1 — P2's four (docs/INFRA-ENTRIES-v0.md §4)                                */
/* -------------------------------------------------------------------------- */

/**
 * The four rows below are one prompt's worth of world — *"a small farm town
 * being invaded by aliens"* — and four different mechanisms, which is why they
 * are the set that proves the host: a ring with gates, a chord with a gap, a
 * run that cuts below the ground, and an areal geometry that flattens one.
 *
 * ## Materials are fixed, not themed
 *
 * A quarantine fence is put up in a week by people who did not consult the
 * town's stonemason, and a barricade is made of whatever was in the street. A
 * theme-derived cordon would be the settlement agreeing with itself about an
 * emergency, which is the opposite of the read. The one place a theme would
 * earn its keep — a hedgerow, a dry stone wall — is W3's, and those rows will
 * take `ctx.theme` when they land.
 *
 * ## No banner, no sign, no chain
 *
 * `props-response.ts`'s rules 4 and 5, obeyed here for the same reasons: a
 * banner and a sign are block entities this op stream cannot carry, so a
 * warning marker is *coloured* (wool over a post) rather than written, and
 * `chain` is not in the pinned 1.21.11 table, so wire is `iron_bars`.
 */

/** Columns between posts of a chain-link panel — a fence's own module. */
const PANEL = 4;

/**
 * `quarantine_fence` — the cordon that went up around the holding.
 *
 * A low concrete kerb carrying two courses of chain-link, a warning marker
 * every couple of panels, and a floodlight mast every fifth panel. Iron bars
 * are the one connective block in W1 and they are legal here for the reason
 * §3.7 states: every block this pass writes goes through the emitter's
 * `applyConnectionStates`, so a run of bars comes out joined rather than as a
 * line of default-state posts.
 *
 * The gate is not in this function and could not be: a gate is *found*, where
 * a carriageway crosses the derived line, and `crossings: "open"` is the whole
 * of the entry's opinion about it.
 */
function quarantineFenceProfile(): InfraSweptProfile {
  return {
    id: "infra.entry@0/quarantine_fence",
    follow: "step",
    maxGrade: 1,
    crossing: "stop",
    bands: [
      {
        id: "line",
        role: "core",
        width: 1,
        centred: true,
        surface: "gray_concrete",
        fill: "cobblestone",
        cap: { height: 2, block: "iron_bars", rail: true },
      },
    ],
    features: [
      // Off the line on the *outside* hand, so the mast lights the approach
      // and the marker faces whoever is being kept out.
      { id: "marker", pitch: PANEL * 2 + 1, at: "interval", offset: 1 },
      { id: "mast", pitch: PANEL * 5, at: "both", offset: -1 },
    ],
  };
}

/**
 * `barricade_line` — thrown across the carriageway, with one way through.
 *
 * Asymmetric by construction and not by decoration: the heaped side carries a
 * rubble spill with wire strung over it and the other side is clear, because a
 * barricade is built *from* one side by people standing on it. A symmetric
 * cross-section here would be a wall with a story attached.
 *
 * The gap is `crossings: "gap"` and nothing in this function — the host finds
 * the crossing and leaves a doorway in it. Every band is skipped across those
 * columns, so what is left is the carriageway as it was: walkable, which is
 * the only property of a gap that matters.
 */
function barricadeLineProfile(): InfraSweptProfile {
  return {
    id: "infra.entry@0/barricade_line",
    follow: "step",
    maxGrade: 2,
    crossing: "stop",
    asymmetric: true,
    bands: [
      // Sandbags, boarded over. Sand is a gravity block and stands on the fill
      // beneath it in every column — the `Planter` writes a column whole or not
      // at all, so there is no arrangement in which one is left hanging.
      {
        id: "bags",
        role: "core",
        width: 1,
        centred: true,
        surface: "sand",
        fill: "coarse_dirt",
        cap: { height: 1, block: "oak_planks" },
      },
      // The spill: rubble pushed out one hand, wire over it.
      {
        id: "spill",
        role: "verge",
        width: 2,
        surface: "gravel",
        fill: "cobblestone",
        cap: { height: 1, block: "iron_bars", rail: true },
      },
    ],
    features: [
      { id: "crate", pitch: 5, at: "interval", offset: -2 },
      { id: "wreck", pitch: 11, at: "interval", phase: 3, offset: -3 },
    ],
  };
}

/**
 * `crash_furrow` — the gouge, and the only W1 entry that edits terrain.
 *
 * A shallow trench claimed through the ground contract: a ditch band two
 * blocks under the datum, scorched shoulders a block under it, and spoil
 * thrown out either side at grade. Nothing here stands *on* anything, which is
 * why the row declares levels — the furrow says what the ground is, the
 * resolver arbitrates it against everything else that has an opinion about
 * those columns, and the blackstone is painted on the answer.
 *
 * `routes: ["into"]` alone is the refusal Q5 ratified: a scar with no cause is
 * set dressing, so a furrow that names nothing at the end of it is not a
 * shorter furrow, it is an `LOAM-T231`.
 */
function crashFurrowProfile(): InfraSweptProfile {
  return {
    id: "infra.entry@0/crash_furrow",
    follow: "grade",
    maxGrade: 2,
    crossing: "stop",
    bands: [
      { id: "gouge", role: "ditch", width: 3, centred: true, level: -2, surface: "blackstone", fill: "blackstone" },
      { id: "scorch", role: "verge", width: 2, level: -1, surface: "basalt", fill: "basalt" },
      { id: "spoil", role: "verge", width: 2, level: 0, surface: "coarse_dirt", fill: "coarse_dirt" },
    ],
    features: [
      { id: "debris", pitch: 7, at: "interval", offset: 5 },
      { id: "ember", pitch: 9, at: "interval", phase: 4, offset: -5 },
    ],
  };
}

/**
 * Twelve bearings, as **integer** direction vectors.
 *
 * §6.5 rule 6: `Math.cos`, `Math.atan2` and friends are not IEEE-specified, so
 * a stdlib that reached for one would make worlds disagree between machines —
 * silently, and only for some users. A spoke does not need an angle: it needs a
 * direction, and a direction is a pair of small integers. These are the twelve
 * around the circle at roughly thirty degrees; the ones that are not exactly
 * thirty are a rational approximation and are none the worse for it, because
 * what a spoke has to be is *evenly spread and the same everywhere*.
 */
const SPOKE_DIRS: readonly (readonly [number, number])[] = Object.freeze([
  [2, 0],
  [2, 1],
  [1, 1],
  [1, 2],
  [0, 2],
  [-1, 2],
  [-1, 1],
  [-2, 1],
  [-2, 0],
  [-2, -1],
  [-1, -1],
  [-1, -2],
]);

/** Spoke counts a figure may have — the divisors of the bearing table. */
const SPOKE_COUNTS: readonly number[] = Object.freeze([4, 6]);

/** Radius of a crop circle, as a share of the field's shorter span. */
const CIRCLE_SHARE = 0.35;
/** Smallest and largest disc worth pressing, in columns of radius. */
const CIRCLE_MIN_R = 6;
const CIRCLE_MAX_R = 28;
/** Courses of standing crop a pressed column loses. */
const CIRCLE_CLEAR = 3;

/**
 * `crop_circle` — rings and spokes pressed into a standing field.
 *
 * The cheapest strong icon in the expansion document, and the one row here
 * with no line at all: `over` hands it every column of the farm's published
 * `parcelMask` and the geometry decides which of them are *in* the figure.
 * Ratified stronger than the design proposed (Q2): the disc **flattens** —
 * it declares one level for its whole footprint through the ground contract
 * and presses the crop that stood there — because a circle that only repaints
 * the soil reads as paint from the air and as nothing at all from the ground.
 *
 * The pattern is rings and spokes, seeded: how many of each is the only thing
 * about this entry that varies between worlds, and both come from
 * `hash(worldSeed, nodePath)` like every other varying number in this
 * compiler. The bands are `hay_block` — flattened wheat is what a hay block
 * *is*, so the material is the crop's own top course laid down rather than a
 * foreign block dropped in a field.
 */
function cropCircleStamp(ctx: InfraContext): InfraAreaStamp {
  const span = Math.min(ctx.extent?.width ?? 0, ctx.extent?.depth ?? 0);
  const radius = Math.max(
    CIRCLE_MIN_R,
    Math.min(CIRCLE_MAX_R, Math.round(span * CIRCLE_SHARE)),
  );
  const rng = new Rng(streamSeed(ctx.seed, "crop_circle.figure"));
  const rings = rng.int(2, 3);
  const spokes = SPOKE_COUNTS[rng.int(0, SPOKE_COUNTS.length - 1)] as number;
  // Ring radii, evenly spaced inside the disc and computed once: a per-column
  // recomputation would be the same numbers and a great many more of them.
  const ringAt: number[] = [];
  for (let k = 1; k <= rings; k++) ringAt.push((radius * k) / (rings + 1));
  // The figure's own spokes, taken every `step` bearings so they are evenly
  // spread whichever count came up.
  const step = SPOKE_DIRS.length / spokes;
  const arms: { nx: number; nz: number }[] = [];
  for (let k = 0; k < spokes; k++) {
    const [ax, az] = SPOKE_DIRS[k * step] as readonly [number, number];
    const len = Math.sqrt(ax * ax + az * az);
    arms.push({ nx: ax / len, nz: az / len });
  }

  return {
    id: "infra.entry@0/crop_circle",
    surface: "hay_block",
    cell: (dx, dz) => {
      const r = Math.sqrt(dx * dx + dz * dz);
      if (r > radius) return undefined;
      // Inside the disc every column is flattened; only the figure's own bands
      // are re-materialised. That is the difference between a circle and a
      // disc of hay, and it is what makes the rings read.
      const onRim = r >= radius - 1;
      const onRing = ringAt.some((rr) => Math.abs(r - rr) <= 0.6);
      // A spoke is a *perpendicular distance* to an arm's line, taken only on
      // the arm's own side of the centre: one column wide the whole way out,
      // rather than the wedge an angular tolerance would give.
      const onSpoke = arms.some(
        (a) => dx * a.nx + dz * a.nz > 0 && Math.abs(dx * a.nz - dz * a.nx) <= 0.7,
      );
      return onRim || onRing || onSpoke
        ? { surface: "hay_block", clear: CIRCLE_CLEAR }
        : { clear: CIRCLE_CLEAR };
    },
  };
}

/* -------------------------------------------------------------------------- */
/* W2 + W3 — the content tail (docs/INFRA-ENTRIES-v0.md §4)                     */
/* -------------------------------------------------------------------------- */

/**
 * The rows below are the design's W2 and W3: `cannon_battery` (P1's shore
 * battery), and the cheap tail — `hedgerow`, `dry_stone_wall`, `cart_track`,
 * `boardwalk`, `sphinx_avenue`. Every one of them is a row and a function, and
 * **not one line of `structures/` code moved to land them**, which is the
 * acceptance test §3.3 states for itself and the first wave that gets to pass
 * it whole.
 *
 * ## Where the materials come from
 *
 * W1's four are an emergency and their materials are fixed, for the reason
 * stated above them: a theme-derived cordon would be the settlement agreeing
 * with itself about a catastrophe. **These are peacetime fabric and the rule
 * inverts.** A hedgerow, a dry stone wall, a cart track and a boardwalk are
 * built by the same people, out of the same valley, as the houses they run
 * between, so they take the theme's own wood and stone
 * ({@link hedgeWood}, {@link entryStone}). The two whose *icon* is the
 * material — a shore battery's dark guns, an avenue of sandstone figures —
 * stay fixed, because a sphinx avenue in cobblestone is not a sphinx avenue.
 *
 * ## What is not here, and why
 *
 * `log_flume` and `sluice_box` are W3's other two and are **deliberately
 * absent**. Both are a trough that follows a *fall*, and the host has no route
 * form that expresses one: `along` needs a corridor somebody else drew, and
 * `into` gives a straight bearing and a length — the bearing is chosen by the
 * steepest rise out of the anchor, which makes the run *start* high, but
 * nothing anywhere makes it *stay* falling. Over a saddle a flume is buried at
 * one end and hanging at the other, and a column needing more footing than
 * `INFRA_MAX_FILL` is dropped whole, so what a walker would find is a trestle
 * full of holes and an `LOAM-T234` explaining it. The water in the trough is
 * the second refusal and the design already made it: moving water is a
 * `fluid.channel` declaration and §4 puts it post-freeze with `dam` and `weir`.
 * A fall-following route form is honest work; forcing one of these two through
 * `into` is not.
 */

/** Woods that have a leaf block. A palette's `log` role may be concrete. */
const LEAFY_WOODS: readonly string[] = Object.freeze([
  "oak",
  "spruce",
  "birch",
  "dark_oak",
  "jungle",
  "acacia",
  "cherry",
  "mangrove",
  "pale_oak",
]);

/** The hedge's own timber: the theme's first wood that is actually a tree. */
function hedgeWood(theme: MaterialTheme | undefined): { log: string; leaves: string } {
  const set = theme?.woods.find((w) => LEAFY_WOODS.includes(w.id));
  const id = set?.id ?? "oak";
  return { log: `${id}_log`, leaves: `${id}_leaves` };
}

/** The theme's first masonry, or the cobble every fallback in this repo uses. */
function entryStone(theme: MaterialTheme | undefined): { primary: string; accent: string } {
  const set = theme?.stones[0];
  return {
    primary: set?.primary ?? "cobblestone",
    accent: set?.accent ?? "stone_bricks",
  };
}

/** Columns between one gun and the next — the battery's own bay. */
const EMBRASURE = 7;

/**
 * `cannon_battery` — the shore battery (W2, P1's one new row).
 *
 * Asymmetric, because a battery has a sea side and a land side and the whole
 * read is that it faces one way: a firing platform straddling the line, a
 * parapet standing two courses proud on the seaward hand, guns at every bay in
 * front of it and the powder behind, well back from them.
 *
 * **The embrasures are the gun bays, not a notch in the parapet.** A swept
 * cross-section has one cap for the whole run — there is no per-index
 * crenellation in the vocabulary, and inventing one for a single row would be
 * exactly the eighth band role §5 refuses. So the gun stands *outside* the
 * parapet band, at the platform's own course, with the parapet crest above and
 * behind it: from the water you read a wall with dark muzzles set in it at a
 * regular bay, which is what an embrasured battery looks like from the only
 * place anybody looks at one.
 *
 * The gun is the `martello_tower`'s, one axis short. That tower draws a
 * horizontal barrel with hinged trapdoor trucks because it may write block
 * states; a fitting is a column of default states, so this is the same gun
 * stood on its truck: a wooden bed on the ground and a `polished_blackstone`
 * breech on it — the pack's dark cube, which is what a gun has to be in a
 * medium with no dark metal.
 */
function cannonBatteryProfile(ctx: InfraContext): InfraSweptProfile {
  const stone = entryStone(ctx.theme);
  return {
    id: "infra.entry@0/cannon_battery",
    follow: "step",
    maxGrade: 1,
    crossing: "stop",
    asymmetric: true,
    bands: [
      {
        id: "platform",
        role: "deck",
        width: 3,
        centred: true,
        surface: stone.primary,
        fill: stone.accent,
      },
      {
        id: "parapet",
        role: "parapet",
        width: 2,
        surface: stone.primary,
        fill: stone.accent,
        cap: { height: 2, block: stone.primary },
      },
    ],
    features: [
      // Seaward of the parapet, at the platform's own course: the muzzle in
      // the embrasure. Landward and half a bay out of step with it, the powder,
      // which is never stacked beside the gun that would set it off.
      { id: "gun", pitch: EMBRASURE, at: "interval", offset: 4 },
      { id: "powder", pitch: EMBRASURE, phase: 3, at: "interval", offset: -3 },
    ],
  };
}

/**
 * `hedgerow` — the living boundary (W3, agrarian).
 *
 * Three columns wide and three courses tall on grade: a log heart with two
 * courses of leaf over it, and a lower leaf shoulder either side on a bank of
 * coarse dirt. The leaves stand directly on and beside the log at every
 * column, so a hedge is never more than two blocks from its own timber and
 * nothing in it decays when the game first ticks it.
 *
 * `crossings: "open"` is the field gate: where a cart track crosses the line
 * the hedge stops either side of it and the gap *is* the gateway — found, never
 * placed, exactly as the cordon's gate is. That is also why the row takes
 * `along` and `ring` and nothing else: a hedge is a boundary of something or a
 * line beside a way, and a hedge thrown across a road is a mistake with a
 * diagnostic already written for it.
 */
function hedgerowProfile(ctx: InfraContext): InfraSweptProfile {
  const wood = hedgeWood(ctx.theme);
  return {
    id: "infra.entry@0/hedgerow",
    // A hedge is planted on the ground it grows out of: it follows the grade
    // and never steps, which is the whole difference between a hedge and a
    // wall on the same line.
    follow: "grade",
    maxGrade: 2,
    crossing: "stop",
    bands: [
      {
        id: "heart",
        role: "core",
        width: 1,
        centred: true,
        surface: wood.log,
        fill: "coarse_dirt",
        cap: { height: 2, block: wood.leaves },
      },
      {
        id: "shoulder",
        role: "verge",
        width: 1,
        surface: "coarse_dirt",
        fill: "coarse_dirt",
        cap: { height: 1, block: wood.leaves },
      },
    ],
    // Sparse, off the hedge on both hands, and out of step with each other so
    // the two never come up in the same column of the run.
    features: [
      { id: "may", pitch: 9, at: "interval", offset: 3 },
      { id: "campion", pitch: 11, phase: 5, at: "interval", offset: -3 },
    ],
  };
}

/**
 * `dry_stone_wall` — the upland field wall (W3, agrarian).
 *
 * One course wide, two courses tall, with a coping of the theme's accent stone
 * stood on top of its own body — the read that separates a field wall from a
 * garden wall at fifty blocks. Full cubes throughout and no `*_wall` block: a
 * connective block in a swept cap is `connection.stale` waiting to happen, and
 * the registry default the design asks for is the curtain wall's
 * every-entry-a-full-cube rule.
 *
 * The stiles are a fitting each hand at the same pitch and phase, so they are
 * a *pair* — one step up on the field side and one down on the lane side,
 * which is what a stile is. A single block either side of a two-course wall is
 * climbable in both directions, and a wall a walker cannot get over is a wall
 * the walkability audit has an opinion about.
 */
function dryStoneWallProfile(ctx: InfraContext): InfraSweptProfile {
  const stone = entryStone(ctx.theme);
  return {
    id: "infra.entry@0/dry_stone_wall",
    // Stepped, not graded: a dry wall is laid in level courses and takes a
    // slope as a series of drops, which is exactly what `step` means here.
    follow: "step",
    maxGrade: 1,
    crossing: "stop",
    bands: [
      {
        id: "course",
        role: "core",
        width: 1,
        centred: true,
        surface: stone.primary,
        fill: stone.primary,
        cap: { height: 1, block: stone.accent },
      },
    ],
    features: [
      { id: "stile_field", pitch: 17, at: "interval", offset: 2 },
      { id: "stile_lane", pitch: 17, at: "interval", offset: -2 },
    ],
  };
}

/**
 * `cart_track` — the road engine's humblest profile (W3, agrarian).
 *
 * Two ruts of `dirt_path` at one column either hand and a baulk of grass
 * between them, and **nothing else at all**: no kerb, no verge, no camber, no
 * furniture. What makes it a track rather than a path of blocks laid on a lawn
 * is that it declares its levels: the run commits the ground it *found* through
 * the ground contract at `sweep.run`, and the materials go on the resolver's
 * answer as the top course of the column, so the ruts are worn *into* the field
 * rather than standing one proud of it. That is the same machinery
 * `crash_furrow` uses to cut below the ground, asking it for nothing at all.
 *
 * `crossings: "open"` is the honest value even though a track blocks nothing:
 * where a real carriageway crosses, the road's own surface is what a walker
 * should meet, and a track that repainted a street's top course would be
 * `road.proud`'s inverse — a lane of dirt through a paved junction.
 *
 * The baulk reads the theme's one statement about its country: a dry palette
 * gets coarse dirt between the ruts, because a green baulk in a sun-baked
 * valley is the same mistake `aridAmbient` was added to fix.
 */
function cartTrackProfile(ctx: InfraContext): InfraSweptProfile {
  const baulk = ctx.theme?.aridAmbient === true ? "coarse_dirt" : "grass_block";
  return {
    id: "infra.entry@0/cart_track",
    // Following the ground rather than cutting it is the catalog note's own
    // words, and `grade` is that sentence in the vocabulary.
    follow: "grade",
    maxGrade: 3,
    crossing: "stop",
    bands: [
      { id: "baulk", role: "verge", width: 1, centred: true, surface: baulk, fill: "dirt" },
      { id: "rut", role: "carriageway", width: 1, surface: "dirt_path", fill: "coarse_dirt" },
    ],
  };
}

/**
 * `boardwalk` — the frontier street's edge (W3, frontier West).
 *
 * Planks on posts, one course proud of grade: the deck straddles the line
 * three columns wide, its fill is the theme's own log so the walk stands on
 * timber rather than floating over a gap, and its surface is the planks a
 * walker's feet are actually on. One course proud is the entry's whole
 * geometry — a boardwalk flush with the street is a pavement, and two courses
 * proud is a verandah nobody can step onto.
 *
 * `crossings: "open"` is the step down at each cross-street, and it costs
 * nothing: where the carriageway claims the line the deck stops, the road keeps
 * its surface, and what is left is exactly the gap a frontage has at every
 * corner.
 */
function boardwalkProfile(ctx: InfraContext): InfraSweptProfile {
  // The theme's own first timber, both roles from the same set: a deck of one
  // wood on posts of another is a palette accident, not a choice.
  const set = ctx.theme?.woods[0];
  const planks = set?.planks ?? "oak_planks";
  const posts = set?.log ?? "oak_log";
  return {
    id: "infra.entry@0/boardwalk",
    // Level courses with a step at each grade change: a plank deck is built
    // flat and the frontier answer to a slope is another step, not a ramp.
    follow: "step",
    maxGrade: 1,
    crossing: "stop",
    bands: [
      { id: "deck", role: "walkway", width: 3, centred: true, surface: planks, fill: posts },
    ],
  };
}

/** Columns between one pair of figures and the next, down the whole avenue. */
const SPHINX_BAY = 9;

/**
 * `sphinx_avenue` — the processional way (W3, nile).
 *
 * A paved way five columns wide with a kerb either hand, and a figure standing
 * off each kerb at a fixed bay, both sides, in step — which is the entry's
 * whole read: not the figures, the *rank* of them, the same distance apart all
 * the way to the thing at the end.
 *
 * The figures are **plinth-figures and deliberately small** — a cut-sandstone
 * plinth carrying two courses of chiselled mass. The real sphinx was ratified
 * out to the bespoke tier and is not this: a fitting is a column of blocks, an
 * icon with a face is a program, and a row that tried to draw a sphinx out of
 * three cubes would be a worse sphinx *and* a worse avenue. What a rank of
 * small dark masses at a fixed interval buys is the one thing a processional
 * way needs, which is rhythm.
 *
 * Fixed sandstone, not the theme's stone, and that is the icon rule §3.3 leaves
 * to the row: an avenue of cobblestone figures is not an avenue of sphinxes.
 */
function sphinxAvenueProfile(): InfraSweptProfile {
  return {
    id: "infra.entry@0/sphinx_avenue",
    follow: "step",
    maxGrade: 1,
    crossing: "stop",
    bands: [
      {
        id: "way",
        role: "walkway",
        width: 5,
        centred: true,
        surface: "smooth_sandstone",
        fill: "sandstone",
      },
      { id: "kerb", role: "kerb", width: 1, surface: "cut_sandstone", fill: "sandstone" },
    ],
    // The pair: one pitch, one phase, one on each hand, clear of the kerb.
    features: [
      { id: "figure_east", pitch: SPHINX_BAY, at: "interval", offset: 5 },
      { id: "figure_west", pitch: SPHINX_BAY, at: "interval", offset: -5 },
    ],
  };
}

/**
 * Every infrastructure entry, by id.
 *
 * W0 shipped the host with one internal fixture; W1 added P2's four; W2 and W3
 * add the shore battery and the cheap tail, and **nothing else moves in this
 * package**. Adding an entry is a row and a function, which is the design's own
 * acceptance test, and the four host changes W1 did need are named in
 * `compiler/src/structures/infra-entry.ts`.
 */
export const INFRA_ENTRIES: Readonly<Record<string, InfraEntryDef>> = Object.freeze({
  [INFRA_TEST_ENTRY]: {
    id: INFRA_TEST_ENTRY,
    // Every route form the host resolves, because this row is what proves them.
    routes: ["ring", "along", "across", "into"],
    geometry: { kind: "route", profile: testFenceProfile },
    sourceClass: "sweep.run",
    crossings: "open",
    minRun: 8,
    rise: 2,
    internal: true,
  } satisfies InfraEntryDef,

  quarantine_fence: {
    id: "quarantine_fence",
    // A cordon rings something. `along` a road would be a fence beside a road,
    // which is a different entry (W3's `hedgerow`) wearing this one's name.
    routes: ["ring"],
    geometry: { kind: "route", profile: quarantineFenceProfile },
    sourceClass: "sweep.run",
    crossings: "open",
    // Below two dozen columns a "cordon" is a garden fence: the ring around a
    // holding is a hundred and up, and anything short of this is an author who
    // pointed at the wrong node.
    minRun: 24,
    rise: 1,
    fittings: {
      marker: { stack: ["gray_concrete", "gray_concrete", "yellow_wool"] },
      mast: {
        stack: ["gray_concrete", "gray_concrete", "gray_concrete", "gray_concrete", "glowstone"],
      },
    },
  } satisfies InfraEntryDef,

  barricade_line: {
    id: "barricade_line",
    routes: ["across"],
    geometry: { kind: "route", profile: barricadeLineProfile },
    sourceClass: "sweep.run",
    crossings: "gap",
    minRun: 6,
    rise: 1,
    fittings: {
      crate: { stack: ["barrel"] },
      wreck: { stack: ["polished_blackstone", "gray_concrete", "gray_concrete"] },
    },
  } satisfies InfraEntryDef,

  crash_furrow: {
    id: "crash_furrow",
    // One form, and that is the refusal: no target, no furrow (Q5).
    routes: ["into"],
    geometry: { kind: "route", profile: crashFurrowProfile },
    sourceClass: "sweep.run",
    // A furrow does not open for a cart track; it went through it.
    crossings: "block",
    minRun: 12,
    // The datum *is* the ground: every band of this profile is at or below it.
    rise: 0,
    declaresLevels: true,
    fittings: {
      debris: { stack: ["cobblestone"] },
      ember: { stack: ["basalt"] },
    },
  } satisfies InfraEntryDef,

  crop_circle: {
    id: "crop_circle",
    routes: ["over"],
    geometry: { kind: "area", stamp: cropCircleStamp },
    sourceClass: "sweep.run",
    // Areal: there is no line for a carriageway to cross.
    crossings: "block",
    minRun: 1,
    rise: 0,
    declaresLevels: true,
  } satisfies InfraEntryDef,

  /* --- W2: P1's shore battery --- */

  cannon_battery: {
    id: "cannon_battery",
    // A battery lines a shore or rings a headland. It never goes `across`
    // anything: a gun line thrown over a street is a barricade.
    routes: ["along", "ring"],
    geometry: { kind: "route", profile: cannonBatteryProfile },
    sourceClass: "sweep.run",
    // A road reaching the water passes through the battery, as it must: the
    // powder and the shot arrive by cart.
    crossings: "open",
    // Under two bays there is no rhythm and what stands there is one gun on a
    // wall, which is a prop somebody else already ships.
    minRun: EMBRASURE * 2 + 2,
    rise: 1,
    fittings: {
      gun: { stack: ["dark_oak_trapdoor", "polished_blackstone"] },
      powder: { stack: ["barrel"] },
    },
  } satisfies InfraEntryDef,

  /* --- W3: the cheap tail --- */

  hedgerow: {
    id: "hedgerow",
    routes: ["along", "ring"],
    geometry: { kind: "route", profile: hedgerowProfile },
    sourceClass: "sweep.run",
    // The field gate, found: where a track crosses, the hedge stops.
    crossings: "open",
    minRun: 16,
    // Planted on the grade, not raised on a datum above it.
    rise: 0,
    fittings: {
      // A flower on the bare ground is a flower somebody else's biome may not
      // support, so each one stands on its own moss — two blocks, grounded, and
      // the seasonal read stays.
      may: { stack: ["moss_block", "oxeye_daisy"] },
      campion: { stack: ["moss_block", "poppy"] },
    },
  } satisfies InfraEntryDef,

  dry_stone_wall: {
    id: "dry_stone_wall",
    routes: ["along", "ring"],
    geometry: { kind: "route", profile: dryStoneWallProfile },
    sourceClass: "sweep.run",
    crossings: "open",
    minRun: 16,
    rise: 0,
    fittings: {
      stile_field: { stack: ["cobblestone"] },
      stile_lane: { stack: ["cobblestone"] },
    },
  } satisfies InfraEntryDef,

  cart_track: {
    id: "cart_track",
    // A track runs beside or between things somebody else placed; it is not a
    // boundary, so it never rings one.
    routes: ["along"],
    geometry: { kind: "route", profile: cartTrackProfile },
    sourceClass: "sweep.run",
    // It *is* a path: nothing blocks, and where a real carriageway crosses, the
    // carriageway's own surface is what a walker should meet.
    crossings: "open",
    minRun: 12,
    // The datum is the ground: this run declares what it found and paints the
    // top course of it.
    rise: 0,
    declaresLevels: true,
  } satisfies InfraEntryDef,

  boardwalk: {
    id: "boardwalk",
    routes: ["along"],
    geometry: { kind: "route", profile: boardwalkProfile },
    sourceClass: "sweep.run",
    // The step down at each cross-street, which is the frontage's own rhythm.
    crossings: "open",
    minRun: 12,
    // One course proud of grade — the entry's whole geometry.
    rise: 1,
  } satisfies InfraEntryDef,

  sphinx_avenue: {
    id: "sphinx_avenue",
    routes: ["along"],
    geometry: { kind: "route", profile: sphinxAvenueProfile },
    sourceClass: "sweep.run",
    crossings: "open",
    // Three bays of figures, or it is a gate with statues rather than an avenue.
    minRun: SPHINX_BAY * 3,
    rise: 1,
    fittings: {
      figure_east: { stack: ["cut_sandstone", "chiseled_sandstone", "chiseled_sandstone"] },
      figure_west: { stack: ["cut_sandstone", "chiseled_sandstone", "chiseled_sandstone"] },
    },
  } satisfies InfraEntryDef,
});

/**
 * The entry ids the **catalog** backs — every row that is not internal.
 *
 * This is the set `stdlib/test/catalog.test.ts` joins to `BUILDING_ARCHETYPES`,
 * `PROP_NAMES` and `NON_NODE_IMPLEMENTED`, in both directions. Flipping an
 * infrastructure row to `implemented` is therefore **data**: add the registry
 * row, and the catalog row it names becomes legal to claim.
 */
export const INFRA_ENTRY_IDS: readonly string[] = Object.freeze(
  Object.values(INFRA_ENTRIES)
    .filter((e) => e.internal !== true)
    .map((e) => e.id),
);

/** Look an entry up, or `undefined` — the validator has already grounded it. */
export function infraEntry(id: string): InfraEntryDef | undefined {
  return INFRA_ENTRIES[id];
}

/** True when this entry may be asked for in the named route form. */
export function entryAcceptsRoute(def: InfraEntryDef, form: InfraRouteForm): boolean {
  return def.routes.includes(form);
}
