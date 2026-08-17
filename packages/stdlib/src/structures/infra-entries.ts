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

/**
 * The forms the host resolves.
 *
 * `between` landed 2026-08-15 (the post-freeze item §3.2 and §5 held): it is
 * routed through the road router's own cost field at the entry's grade cap,
 * between two placed anchors. What it did *not* need in the end is the tier-A
 * ground declaration §5 paired it with — a span hangs in the air and a
 * telegraph line stands on the ground it finds, so neither has an opinion about
 * the baseline. The same turned out to be true of the carried pair — `aqueduct`
 * and `maglev_pylon`, landed 2026-08-15: a pier is refused where something else
 * owns the column rather than negotiated for, and rank 25 is reserved for the
 * entry that asks the *ground* to make room for one.
 */
export const INFRA_ROUTE_FORMS_IMPLEMENTED = [
  "ring",
  "along",
  "across",
  "between",
  "into",
  "over",
] as const;

/** True for a form this host resolves today. */
export function isImplementedRouteForm(form: string): form is InfraRouteForm {
  return (INFRA_ROUTE_FORMS_IMPLEMENTED as readonly string[]).includes(form);
}

/**
 * The ground-contract class an entry declares (§3.5).
 *
 * Four, and no new one — the domain is a subset of the compiler's
 * `GroundSourceClass`, pinned by the same typed adapter as the profile.
 *
 * `structure.linework` is rank 25 / tier A and stopped being **reserved** on
 * 2026-08-17 (`docs/GROUND-CONTRACT-v0.md` §13.2's amendment). The thing that
 * kept it unexercised was a conflation rather than a contradiction: *where does
 * a carriageway cross my line?* is answered by the **solved layout**, from the
 * moment placement is done, and only *what level does it hold there?* waits for
 * the street pass. So a row naming this class declares from the **linework
 * slot** — `compiler/src/structures/linework.ts`, between `buildPrecincts` and
 * `pavePlaza` — and the host's own slot lays its materials against the answer.
 * The host still refuses the class from *its* position, and a row that reaches
 * it with no bed is that refusal.
 *
 * The rank is for **a line whose own surface something else must walk onto**: a
 * viaduct's deck is a carriageway, so its approach embankments are ground the
 * street network has to join rather than cut. A line nothing walks onto — an
 * aqueduct's water, a guideway's beam — refuses a pier instead and stays at
 * `sweep.run`.
 */
export type InfraSourceClass =
  | "sweep.run"
  | "retaining.seam"
  | "fluid.channel"
  | "structure.linework";

/* -------------------------------------------------------------------------- */
/* the water movers (docs/INFRA-ENTRIES-v0.md families B and D)                */
/* -------------------------------------------------------------------------- */

/**
 * An entry that **moves water** — `docs/INFRA-ENTRIES-v0.md` family B's last
 * sentence, *"`dam` and `weir` additionally move water — a `fluid.channel`
 * declaration, rank 0, tier A"*, and family D's *"`canal_lock` … chambers on a
 * canal"*.
 *
 * A row with this field is not a line that stands on the ground: it is a
 * statement about **where the water surface sits**, and the surface is declared
 * once, through the ground contract, at `fluid.channel` — rank 0, above every
 * other claim — rather than painted block by block. That is not a stylistic
 * preference. `GROUND-CONTRACT-v0.md` §4's own note on the rank says it: *losing
 * a water claim is a physics failure, not an ugly walk*, and impounded water
 * painted into a plan somebody else may still raise a column out of is
 * `LOAM-T110` on the first tick.
 *
 * The host derives everything geometric. A row states only the four numbers
 * that are the *entry's* opinion — how high it holds, how much freeboard the
 * crest carries, how far a pool may reach before the entry calls it unbounded,
 * and (for a lock) how long the chamber is.
 */
export interface InfraWaterDef {
  /**
   * Blocks above the natural water surface the pool upstream is held at.
   *
   * A ceiling, not a promise: the host tries this hold, and where the pool it
   * would make does not *close* — where the flooded columns run past
   * {@link reach}, off the region, or into something already built — it drops
   * the hold a block and tries again, down to 1. A dam in a valley that closes
   * gets its whole head; the same dam beside a town settles at the head the
   * town leaves room for, which is the honest answer and is also the only one
   * that keeps the unstable-fluid count at zero.
   */
  readonly hold: number;
  /** Blocks the crest stands above the held surface — the dry walkway. */
  readonly freeboard: number;
  /** Furthest a pool may reach from the barrier before it is called unbounded. */
  readonly reach: number;
  /**
   * Courses of dressed face below the crest, on the barrier's own columns.
   *
   * The barrier is declared ground, so the mass under it is the terrain body —
   * stone by construction, and watertight for the same reason a canal's shell
   * is. This is how much of the exposed downstream face is re-materialised in
   * the entry's own masonry rather than left as raw rock.
   */
  readonly face: number;
  /**
   * A **chamber** between two gates, in columns along the flow — a lock.
   *
   * Absent means a plain barrier (a dam, a weir): one line across the water,
   * a pool behind it. Present means two: the crossing itself is the lower gate,
   * a second gate stands this far upstream of it, and the water between them is
   * held at the *upper* reach — gates set for a boat coming down, which is the
   * only still frame a lock has.
   */
  readonly chamber?: number;
}

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

/**
 * A **span** — two standing ends and a member that hangs between them.
 *
 * The third geometry kind, and the one family E's `harbour_chain_tower` needed:
 * *"two props and a catenary, and the catenary hangs rather than stands"*
 * (`docs/INFRA-ENTRIES-v0.md` §2). A sweep cannot say this. Every band of a
 * `SweptProfile` is measured from a datum that follows the ground, and the
 * whole point of a hanging member is that it does not — it is a function of the
 * chord between two tower tops and of nothing underneath it.
 *
 * So a span is not a cross-section. It is two block stacks and a curve, and the
 * curve's shape is the registry's only say: {@link sag} as a fraction of the
 * chord. The host solves the catenary that has that sag.
 */
export interface InfraSpanDef {
  readonly id: string;
  /**
   * The tower, bottom-up from the ground, one block per course.
   *
   * Omitted on a **carried** span, which has no free-standing support at all:
   * an arcade's ends are abutments of its own masonry and the host raises them
   * to the deck, so a stated stack there would be a height said twice.
   *
   * Full cubes, for the registry's standing reason: a slab or a stair in a
   * stack this pass writes is a `floating.slab` waiting to happen. The **last**
   * block is the head the member hangs from, and its course is the curve's
   * anchor height.
   */
  readonly tower?: readonly string[];
  /**
   * The hanging member — one block id, written along the whole curve.
   *
   * Omitted on a **carried** span ({@link carry}), which has no hanging member
   * at all: a guideway beam and an aqueduct's channel stand on their piers.
   */
  readonly cable?: string;
  /**
   * The curve's sag at mid-span, as a fraction of the chord between the two
   * tower heads. `0.12` is a chain drawn taut across a harbour mouth; `0.3` is
   * one somebody let out.
   *
   * Omitted on a carried span, for the same reason {@link cable} is.
   */
  readonly sag?: number;
  /**
   * Blocks of air the member keeps above whatever stands under it.
   *
   * A harbour chain is slung above the water so a boat can be stopped by it
   * rather than sail under it, and this is that clearance. It is a *floor*
   * under the curve and never a lift above the tower heads: where the span is
   * long enough that the sag would reach the water anyway, the chain touches
   * the water, because the alternative is a chain that hangs upward.
   *
   * On a **carried** span it is read the other way round and is the whole of
   * the entry's height: the deck stands this many courses above the *higher* of
   * the two anchors' ground, dead level from end to end, and the piers under it
   * are however tall the ground beneath each one makes them.
   */
  readonly clearance: number;
  /**
   * Columns between one standing support and the next, along the run.
   *
   * Absent — `harbour_chain_tower` — means **two supports and no more**: the
   * pair of towers at the ends, and one curve between them. Present, the run is
   * a *line* rather than a span: poles down a telegraph route, piers under an
   * arcade, pylons under a guideway. A support that cannot stand where the
   * pitch put it (a road, an occupied column, unbuildable ground) is dropped
   * and the members either side of it join across the gap, which is exactly how
   * a pole line steps aside for a street.
   */
  readonly pitch?: number;
  /**
   * A **carried** deck rather than a hanging member (§3.2's other `between`
   * clients: `aqueduct`, `maglev_pylon`).
   *
   * The third thing two anchors can have between them, after "a chain" and
   * "nothing": a level run held up off the ground on regular supports. It is
   * not a swept profile — a sweep's datum follows the ground and the whole read
   * of an arcade is that it does *not* — and it is not a catenary, because it
   * is stiff. So it is a span whose member stands on piers, and everything
   * below is the cross-section of that member.
   */
  readonly carry?: InfraSpanCarry;
  /**
   * The grade cap the `between` router honours when it looks for these two
   * anchors' corridor — the entry's own, exactly as §3.2 words it.
   */
  readonly maxGrade: number;
}

/**
 * A **water channel** carried on a deck — the aqueduct's trough.
 *
 * The one place in this registry where a row writes a fluid, and the reason it
 * may is that the trough is *closed*: the host walls every column of water that
 * has a neighbour which is not water, floors every one of them, and writes the
 * body whole or not at all. A source block whose four horizontal neighbours are
 * water or solid and whose floor is solid cannot flow, which is the same
 * argument `canals.ts` makes about a dug channel — the difference is only that
 * this one is nine blocks in the air, where the column plan cannot follow it,
 * so the closure is over *placed blocks* rather than over the plan.
 *
 * A carried channel is therefore **not** a `fluid.channel` ground declaration
 * and could not be: that class states where the *terrain's* water surface sits,
 * and an aqueduct's water is above the terrain by construction.
 */
export interface InfraSpanChannel {
  /** Columns of water either side of the line — `1` is a three-wide trough. */
  readonly half: number;
  /** The trough's own masonry: its floor, and the wall that holds the water. */
  readonly lining: string;
}

/** A carried deck: what stands on the piers of a {@link InfraSpanDef.carry}. */
export interface InfraSpanCarry {
  /** Columns of deck either side of the line. `1` is a three-wide beam. */
  readonly half: number;
  /** The deck's surface — the beam a walker is on, or the aqueduct's walk. */
  readonly deck: string;
  /** The pier, the haunch either side of it, and the two end abutments. */
  readonly pier: string;
  /** Columns of pier either side of the line. `0` is a single slender pylon. */
  readonly pierHalf: number;
  /**
   * A course stood on the deck's two outer columns — a guideway's rail.
   *
   * Omitted leaves a bare deck, which is what a channel-carrying arcade wants:
   * its edges are the maintenance walk and a walk with a wall on both hands is
   * a corridor.
   */
  readonly rail?: string;
  /** The trough, for a run that carries water rather than traffic. */
  readonly channel?: InfraSpanChannel;
  /**
   * The tallest pier the entry will stand, in courses.
   *
   * A bay whose ground is further below the deck than this is left **open** —
   * no pier, and the deck spans it — rather than filled with a column of
   * masonry the length of a tower. An arcade striding a gorge is an arcade; a
   * hundred-block leg is a mistake nobody would build.
   */
  readonly maxPier: number;
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
    | { readonly kind: "area"; readonly stamp: (ctx: InfraContext) => InfraAreaStamp }
    | { readonly kind: "span"; readonly span: (ctx: InfraContext) => InfraSpanDef };
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
   * This entry **moves water** (`docs/INFRA-ENTRIES-v0.md` families B and D).
   *
   * Implies {@link sourceClass} `"fluid.channel"` and implies the declaring
   * disposition {@link declaresLevels} names — a water mover is a statement
   * about the ground *and* about the fluid over it, and neither can be said by
   * stacking blocks on a surface. The host resolves the watercourse, chooses
   * the head, declares the barrier and the pool as one rank-0 intent set, and
   * only then sweeps the profile over the crest the resolver gave it.
   */
  readonly water?: InfraWaterDef;
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

/* -------------------------------------------------------------------------- */
/* W4 — the `between` form's first client                                       */
/* -------------------------------------------------------------------------- */

/** Courses of tower above the mole, head included. */
const CHAIN_TOWER_HEIGHT = 9;

/**
 * `harbour_chain_tower` — the pair that closes a port.
 *
 * The catalog note is the whole brief: *"two towers on opposite moles with a
 * chain slung between them across the water. Ships as a pair or not at all."*
 * The design filed it under family E — honestly a prop — and then wrote the one
 * sentence that keeps it out of family E: *"the catenary hangs rather than
 * sweeps"*. A prop is a box at a place, and no box contains this: what the pair
 * *is* is the relation between them, and the relation is a curve over water
 * neither tower touches. Hence {@link InfraSpanDef} and the `between` form,
 * which is also why this row is the form's first client rather than
 * `telegraph_line` — a chain across a harbour mouth is one span, and one span
 * is the honest unit test for a curve.
 *
 * ## The chain is a chain now
 *
 * W1's module note says "`chain` is not in the pinned 1.21.11 table, so wire is
 * `iron_bars`". The pinned registry has since renamed `chain` to `iron_chain`
 * and it *is* in the table, so this row writes `iron_chain` directly rather
 * than the old spelling that `parseBlockString` still maps. Iron bars would
 * have been the wrong block anyway: bars are a fence-family block that would
 * connect sideways to each other and read as a railing strung between two
 * towers, and a harbour chain is not a railing.
 *
 * ## Materials
 *
 * Fixed, and for W1's reason turned around: a chain tower is a piece of naval
 * engineering paid for by an admiralty, not by the town, and it is built out of
 * whatever will take a battering. A themed chain tower would be the harbour
 * agreeing with the high street about masonry.
 */
function harbourChainTowerSpan(): InfraSpanDef {
  const shaft = Array.from({ length: CHAIN_TOWER_HEIGHT - 2 }, () => "stone_bricks");
  return {
    id: "infra.entry@0/harbour_chain_tower",
    // A plain shaft, a course of chiselled band, and a polished head for the
    // chain to leave from. Every one a full cube.
    tower: [...shaft, "chiseled_stone_bricks", "polished_blackstone"],
    cable: "iron_chain",
    // A chain drawn taut but not straight: an eighth of the chord at mid-span
    // is a curve you can read from a boat and still low enough to look heavy.
    sag: 0.125,
    // Two blocks of air over whatever is beneath — enough that the chain reads
    // as slung *across* the water rather than lying in it.
    clearance: 2,
    // Generous, because the two anchors are moles at opposite ends of a harbour
    // mouth and the corridor between them is water: the router is being asked
    // whether they face each other, not to find a lane a cart could take.
    maxGrade: 8,
  };
}

/* -------------------------------------------------------------------------- */
/* W6 — the `between` form's other three clients (§3.2's route-forms table)     */
/* -------------------------------------------------------------------------- */

/**
 * The route-forms table names four clients for `between` and W4 landed one of
 * them. These are the other three, and between them they are the whole of what
 * two anchors can have strung between them: a **carried** run that stands on
 * piers (`aqueduct`, `maglev_pylon`) and a **poled** run whose member hangs
 * from one support to the next (`telegraph_line`).
 *
 * ## What the ground contract has to say about them, which is nothing
 *
 * §5 paired `between` with a tier-A `structure.linework` declaration and W4
 * found it did not need one. Neither do these: an arcade's piers and a pole
 * line's poles stand on the ground they find, in the columns they find it in,
 * and every one of them is refused rather than negotiated where something else
 * already owns the column. These three rows declare nothing at all, and the
 * reason generalises exactly as far as it should: **nothing walks onto an
 * aqueduct's water or a maglev guideway's beam**, so neither has any business
 * asking the ground for anything.
 *
 * That property fails for one member of the family — `viaduct`, below, whose
 * deck *is* a carriageway — and that is the whole of why rank 25 exists
 * (`docs/GROUND-CONTRACT-v0.md` §13.2d).
 *
 * ## The aqueduct's water
 *
 * Held level, sealed, and written whole — see {@link InfraSpanChannel}. It is
 * the one fluid in this registry and the reason it is legal is a closure
 * argument over placed blocks rather than a declaration, because the terrain's
 * water surface is not where an aqueduct's water is.
 */

/** Courses of pole, head included — a telegraph pole clears a loaded cart. */
const POLE_HEIGHT = 7;
/** Columns between poles. Far enough that the wire reads as a wire. */
const POLE_PITCH = 12;

/**
 * `aqueduct` — the channel that walks to town on arches.
 *
 * A level trough nine columns of arcade above the higher of its two anchors:
 * three columns of water on a lined floor, a lining wall either hand standing
 * two courses proud of it, and a maintenance walk outside each wall. Piers to
 * the ground every seven columns, three wide, with a haunch either side of each
 * — so what a walker under it meets is a **rank of openings at grade**, four
 * columns clear between one pier and the next, which is the one thing an
 * aqueduct must never take away from the ground it crosses.
 *
 * Theme masonry, by W2/W3's rule: an aqueduct is the most public thing a dry
 * country builds and it is built by the same masons, out of the same valley, as
 * the town it waters.
 *
 * The water is the entry, and it is *held level* — one course, end to end,
 * regardless of what the ground does underneath. That is the only reading that
 * makes an aqueduct an aqueduct rather than a wall with a puddle on it, and it
 * is why this row is carried rather than swept: a swept datum follows the
 * ground, and water that followed the ground would be a river.
 */
function aqueductSpan(ctx: InfraContext): InfraSpanDef {
  const stone = entryStone(ctx.theme);
  return {
    id: "infra.entry@0/aqueduct",
    // Nine courses over the higher anchor: high enough that the arcade reads
    // as an arcade, low enough that a walk under it is still a walk under a
    // building rather than under a cloud.
    clearance: 9,
    pitch: 7,
    maxGrade: 4,
    carry: {
      half: 3,
      deck: stone.primary,
      pier: stone.primary,
      pierHalf: 1,
      maxPier: 24,
      channel: { half: 1, lining: stone.accent },
    },
  };
}

/**
 * `telegraph_line` — poles and wire, following the ground.
 *
 * The cheapest strong read in family E: a pole every twelve columns, seven
 * courses of the theme's own timber, and a wire strung head to head with barely
 * any sag. It is a *poled* span rather than a single one, which is the only
 * structural difference between this and a harbour chain, and it is the whole
 * entry — one wire across a valley is a chain, and a line of them down a road
 * is a telegraph.
 *
 * **Iron bars, not chain.** W1's note said bars for want of a chain block and
 * W4 corrected it for the harbour; here the old answer is the right one for the
 * opposite reason. A telegraph wire is near-horizontal, so almost every column
 * of it is a single block, and a horizontal run of `iron_chain` is a line of
 * unconnected vertical links. Bars join sideways to their neighbours through
 * the emitter's `applyConnectionStates`, so what comes out is a line.
 *
 * The poles step aside for a street rather than standing in one — `crossings:
 * "open"`, and the host drops a pole it cannot stand and strings the wire
 * across the gap, which is what a pole line does at a junction.
 */
function telegraphLineSpan(ctx: InfraContext): InfraSpanDef {
  const set = ctx.theme?.woods[0];
  const log = set?.log ?? "oak_log";
  const head = set?.planks ?? "oak_planks";
  return {
    id: "infra.entry@0/telegraph_line",
    tower: [...Array.from({ length: POLE_HEIGHT - 1 }, () => log), head],
    cable: "iron_bars",
    // Barely any: a telegraph wire is strung tight, and the sag that reads is
    // the one you notice only when you look along the line.
    sag: 0.05,
    // Over a loaded cart and a rider, whatever the ground under the bay does.
    clearance: 5,
    pitch: POLE_PITCH,
    maxGrade: 6,
  };
}

/**
 * `maglev_pylon` — the far-future viaduct.
 *
 * The aqueduct's sibling with the water taken out and the ground pushed further
 * away: a three-wide guideway beam twelve courses up, a copper rail stood on
 * each edge of it, and a single slender pylon to the ground every ten columns.
 * The beam's centre column is bare deck with air over it, so the guideway is
 * walkable end to end — which is not a concession, it is how anybody ever looks
 * at one of these.
 *
 * Fixed materials, by the icon rule §3.3 leaves to the row: a maglev guideway
 * in the local cobblestone is a Roman aqueduct with the water missing. Concrete
 * and smooth stone with a cut-copper rail is the whole vocabulary a
 * block-medium future has.
 */
/**
 * `viaduct` — the arcade a road walks onto.
 *
 * The aqueduct's sibling with the channel taken out and the deck widened to a
 * carriageway, and that one substitution is the whole reason this row is the
 * ground contract's first `structure.linework` client. Nothing walks onto an
 * aqueduct's water or a guideway's beam, so both refuse a pier they cannot
 * stand and ask the ground for nothing. **A viaduct's deck is a road.** A road
 * has to *arrive* on it, which means its two approach embankments are ground
 * the street network must join rather than cut — and that is a rank-25
 * declaration or it is a ramp of air.
 *
 * ## What the row says, and what the slot derives
 *
 * The row is a cross-section and two numbers. The **approaches** are not in it
 * at all: their length is `clearance / grade`, their line is the run's own
 * bearing continued outward, and their width is the deck's — every one of them
 * arithmetic over things the compiler already knows, which is the standing rule
 * that an entry states no geometry the host can derive (§3.3).
 *
 * ## The bays keep their grade
 *
 * Seven-column pitch with a haunch either side, three columns of pier, exactly
 * as the aqueduct: what a walker under it meets is a rank of openings at grade.
 * A viaduct that levelled its own bays would be an embankment with holes in it
 * (`docs/GROUND-CONTRACT-v0.md` §13.2e), so the arcade declares a *clearance* at
 * the deck's underside over the bays and never a bed.
 *
 * ## Materials
 *
 * Theme masonry, by W2/W3's rule: a viaduct is public works, built by the same
 * masons and out of the same valley as the town it carries traffic into.
 *
 * **And no rail**, which is the one place this row differs from `maglev_pylon`
 * and the difference is physics rather than taste. The host raises a carried
 * span's two abutments to the top of its whole section, so a row that states a
 * rail gets a full-width block of masonry a course *above* the deck at each end
 * — a wall exactly where the approach embankment arrives. On a guideway nobody
 * notices; on the one carried run something is supposed to walk onto, it is the
 * defect the rank exists to prevent. Bare deck, flush with the embankment at
 * both ends, walkable end to end.
 */
function viaductSpan(ctx: InfraContext): InfraSpanDef {
  const stone = entryStone(ctx.theme);
  return {
    id: "infra.entry@0/viaduct",
    // Eleven: two courses more than the aqueduct's nine, because what passes
    // under a viaduct is a road rather than a footpath, and a loaded cart under
    // a rank of arches wants the headroom an aqueduct never had to give.
    clearance: 11,
    pitch: 7,
    // The corridor question a viaduct asks its anchors is a road's: it may be
    // routed over ground a cart could not climb, because the deck is level and
    // the piers make up the difference. The **approach** grade is not this
    // number and must not be — see `structures/linework.ts`.
    maxGrade: 4,
    carry: {
      // Seven columns of deck: a five-wide carriageway with a kerb course
      // either hand, which is the narrowest thing a road reads as.
      half: 3,
      deck: stone.primary,
      pier: stone.primary,
      pierHalf: 1,
      maxPier: 24,
    },
  };
}

function maglevPylonSpan(): InfraSpanDef {
  return {
    id: "infra.entry@0/maglev_pylon",
    clearance: 12,
    pitch: 10,
    // A guideway is surveyed rather than routed: it will take a grade a cart
    // never would, and the corridor question it asks its two anchors is only
    // whether a line between them stands on anything at all.
    maxGrade: 8,
    carry: {
      half: 1,
      deck: "smooth_stone",
      pier: "light_gray_concrete",
      pierHalf: 0,
      maxPier: 32,
      rail: "cut_copper",
    },
  };
}

/* -------------------------------------------------------------------------- */
/* W5 — the water movers (docs/INFRA-ENTRIES-v0.md families B and D)           */
/* -------------------------------------------------------------------------- */

/**
 * The three rows below are the post-freeze rung family B held: *"`dam` and
 * `weir` additionally move water — a `fluid.channel` declaration, rank 0, tier
 * A"*, plus family D's `canal_lock`, *"a chamber on a canal"*.
 *
 * ## What is the entry, and what is the host's
 *
 * Nothing about a dam's *shape* is interesting: it is a masonry line with a
 * walkable crest. What is interesting is that the water behind it is somewhere
 * else than it was, and that is not something a cross-section can say. So these
 * three rows are the first in the registry whose real content is four numbers —
 * {@link InfraWaterDef} — and whose profile function is the small half.
 *
 * ## Peacetime fabric, so the materials are the theme's
 *
 * W2/W3's rule: a dam is built by the same masons, out of the same valley, as
 * the town it waters. All three take `ctx.theme` through {@link entryStone}, and
 * the lock's gates take its timber, because a lock gate is a timber gate
 * everywhere anybody has ever built one.
 *
 * ## No moving parts
 *
 * A lock has no pistons, no redstone and no water logic: it is sculpture with
 * *correct* water. The gates stand closed, the chamber is full to the upper
 * reach, and what makes it read is that the three water levels either side of
 * it are the three levels a lock actually has.
 */

/** Furthest a dam's pool may run before the entry calls the valley unbounded. */
const DAM_REACH = 96;
/** A weir's head is one block, so its pool is a fraction of a dam's. */
const WEIR_REACH = 48;
/** A lock's pool is a canal reach, not a valley. */
const LOCK_REACH = 64;
/** Columns of chamber between a lock's two gates — a narrowboat and its rope. */
const LOCK_CHAMBER = 12;

/** The theme's timber, as planks — a lock gate is a timber gate. */
function entryTimber(theme: MaterialTheme | undefined): { planks: string; trim: string } {
  const id = theme?.woods[0]?.id ?? "dark_oak";
  return { planks: `${id}_planks`, trim: `${id}_log` };
}

/**
 * `dam` — the crest, and the mass under it.
 *
 * Three columns of walkway between two parapet courses, which is the narrowest
 * thing that reads as a dam crest and still passes the traversal rules with a
 * kerb either side. Every block a full cube: a slab or a stair on a swept cap
 * is `floating.slab` waiting to happen, and a dam crest is the last place to
 * find out.
 *
 * The *face* is not in this function and could not be — it is courses of
 * masonry below the declared crest, on ground the resolver has already given,
 * and {@link InfraWaterDef.face} is the entry's whole say in it.
 */
function damProfile(ctx: InfraContext): InfraSweptProfile {
  const stone = entryStone(ctx.theme);
  return {
    id: "infra.entry@0/dam",
    // The crest is flat because the *ground* under it is flat: the host
    // declares one level for the whole barrier and the datum follows the
    // answer. `step` is what carries it up onto the abutments at either end.
    follow: "step",
    maxGrade: 2,
    crossing: "stop",
    bands: [
      { id: "crest", role: "walkway", width: 3, centred: true, surface: stone.accent, fill: stone.primary },
      {
        id: "parapet",
        role: "parapet",
        width: 1,
        surface: stone.primary,
        fill: stone.primary,
        cap: { height: 1, block: stone.primary },
      },
    ],
  };
}

/**
 * `weir` — the low-water sibling: a lip, and a shoulder either side of it.
 *
 * Small enough that the geometry is almost all of it. One course of dressed
 * stone at the head the entry holds, a rough shoulder either side, and no
 * parapet at all: a weir with a railing is a dam that lost its nerve.
 */
function weirProfile(ctx: InfraContext): InfraSweptProfile {
  const stone = entryStone(ctx.theme);
  return {
    id: "infra.entry@0/weir",
    follow: "step",
    maxGrade: 2,
    crossing: "stop",
    bands: [
      { id: "lip", role: "kerb", width: 1, centred: true, surface: stone.accent, fill: stone.primary },
      { id: "shoulder", role: "verge", width: 1, surface: stone.primary, fill: stone.primary },
    ],
  };
}

/**
 * `canal_lock` — one gate's cross-section, swept twice.
 *
 * The host builds the lower gate on the crossing and the upper gate a chamber's
 * length upstream, out of this one profile: the two are the same object and
 * writing them as one row is what stops them drifting apart.
 *
 * A closed timber leaf on the centre line with a stone catwalk either side of
 * it. The catwalks are the walkable part — a lock is crossed beside its gate,
 * never over it — and the leaf standing two courses proud of them is the whole
 * read: *shut*.
 */
function canalLockProfile(ctx: InfraContext): InfraSweptProfile {
  const stone = entryStone(ctx.theme);
  const timber = entryTimber(ctx.theme);
  return {
    id: "infra.entry@0/canal_lock",
    follow: "step",
    maxGrade: 2,
    crossing: "stop",
    bands: [
      {
        id: "leaf",
        role: "core",
        width: 1,
        centred: true,
        surface: timber.trim,
        fill: stone.primary,
        cap: { height: 2, block: timber.planks },
      },
      { id: "catwalk", role: "walkway", width: 1, surface: stone.accent, fill: stone.primary },
    ],
  };
}

/* -------------------------------------------------------------------------- */
/* W7 — family B, the retaining / terrain-defining entries                     */
/* -------------------------------------------------------------------------- */

/**
 * The four rows below are `docs/INFRA-ENTRIES-v0.md` **family B**, and the
 * family is defined by one sentence: *"a declared `face` between two levels"*.
 *
 * ## Why they are declaring entries and not swept walls
 *
 * A retaining wall is not masonry stood on a hillside — it is the statement
 * *"the ground on this hand is higher than the ground on that hand, and the
 * step between them is dressed"*. Said as blocks it is a facade with raw dirt
 * behind it; said through the ground contract it is terrain. So every row here
 * carries `declaresLevels` and `sourceClass: "retaining.seam"`, which is the
 * only class `face` is legal from (`GROUND-CONTRACT-v0.md` §2.2's `LEGAL_KINDS`,
 * and §13.2's rank 60 / tier B). The host declares, the resolver arbitrates,
 * and only then is the top course laid on the ground it was actually given.
 *
 * ## The cross-sections are one-sided, and that is the geometry
 *
 * Every row is `asymmetric`, so the band walker lays lanes on the **inward**
 * hand only: lane 0 is the face itself and the lanes past it run back into the
 * platform the wall holds — `RETAINING_PROFILE`'s own construction, which
 * thickens outward so a wall never eats the terrace it carries. The low side
 * is not written at all, because the low side is whatever was already there.
 * The `level` on each band is therefore the *lift*: how far above the ground
 * the wall stands on this band's columns end up.
 *
 * That also makes the batter free. `castle_base_wall`'s ōgi curve is three
 * bands at rising levels stepping inward — from below you read courses
 * receding as they climb, which is what a battered base *is* — and no new
 * vocabulary was needed to say it.
 *
 * ## Walkability
 *
 * No row here carries a `cap`. A retaining wall's rail is the retaining pass's
 * own per-column `railRun` and is not a swept course; a cap here would put a
 * solid ring around a terrace the entry just made standable. So the top of
 * every one of these is a solid non-water course with open air over it, which
 * is the whole of the walkability rule.
 */

/** Blocks of lift a plain retaining wall carries — a wall, not a kerb. */
const RETAIN_LIFT = 3;

/** The sanctuary's lift: the terrace is meant to be seen from the town. */
const ACROPOLIS_LIFT = 6;

/** The keep's podium, in courses — three receding courses and a bailey top. */
const CASTLE_LIFT = 6;

/**
 * `retaining_wall` — the plainest face there is (W7, family B).
 *
 * One dressed course at the lip and a two-column terrace behind it, three
 * blocks above the ground the wall stands on. `along` a way or `ring` around
 * something: those are the two things a retaining wall is ever the boundary
 * of, and a wall thrown `across` a street is the curtain wall's job.
 */
function retainingWallProfile(ctx: InfraContext): InfraSweptProfile {
  const stone = entryStone(ctx.theme);
  return {
    id: "infra.entry@0/retaining_wall",
    asymmetric: true,
    follow: "step",
    maxGrade: 1,
    crossing: "stop",
    bands: [
      {
        id: "face",
        role: "core",
        width: 1,
        level: RETAIN_LIFT,
        surface: stone.accent,
        fill: stone.primary,
      },
      {
        id: "terrace",
        role: "walkway",
        width: 2,
        level: RETAIN_LIFT,
        surface: stone.primary,
        fill: stone.primary,
      },
    ],
  };
}

/**
 * `terrace_steps` — the flight that makes a face passable (W7, family B).
 *
 * The one row of the family that goes `across`, and the reason is the same one
 * the retaining pass gives for leaving a crossing street open: *a street that
 * crosses a seam is the connection between its two levels*. A flight is that
 * connection, drawn on purpose.
 *
 * `follow: "grade"` at `maxGrade: 1` is the whole stair. The datum tracks the
 * hillside a block at a time, the declaration hands the resolver that ladder of
 * levels, and what the walker gets is a run of columns each one course above
 * the last — the tread law's own geometry, arrived at by declaring terrain
 * rather than by stacking stair blocks the physics lint would have to forgive.
 *
 * Symmetric, unlike the rest of the family: a flight has a cheek on each hand.
 */
function terraceStepsProfile(ctx: InfraContext): InfraSweptProfile {
  const stone = entryStone(ctx.theme);
  return {
    id: "infra.entry@0/terrace_steps",
    follow: "grade",
    maxGrade: 1,
    crossing: "stop",
    bands: [
      {
        id: "tread",
        role: "walkway",
        width: 3,
        centred: true,
        surface: stone.accent,
        fill: stone.primary,
      },
      { id: "cheek", role: "kerb", width: 1, surface: stone.primary, fill: stone.primary },
    ],
  };
}

/**
 * `acropolis_terrace` — the family's grandest row (W7, family B).
 *
 * Two columns of polygonal face six blocks proud, and four columns of
 * peribolos behind it: the sanctuary stands on its own ground, above the town
 * that looks up at it. A votive stands on the walk at a long pitch, which is
 * the one thing that tells a terrace from a plinth on a walk.
 *
 * **The stair cut into one face is not here, and that is composition rather
 * than an omission.** `docs/INFRA-ENTRIES-v0.md` describes this row as "its
 * grandest row plus a stair cut into one face"; the stair is
 * {@link terraceStepsProfile}, which an author places `across` the same seam.
 * Building a second flight into this cross-section would be one entry owning
 * two mechanisms, and the family already ships the second one.
 */
function acropolisTerraceProfile(ctx: InfraContext): InfraSweptProfile {
  const stone = entryStone(ctx.theme);
  return {
    id: "infra.entry@0/acropolis_terrace",
    asymmetric: true,
    follow: "step",
    maxGrade: 1,
    crossing: "stop",
    bands: [
      {
        id: "face",
        role: "core",
        width: 2,
        level: ACROPOLIS_LIFT,
        surface: stone.primary,
        fill: stone.primary,
      },
      {
        id: "peribolos",
        role: "walkway",
        width: 4,
        level: ACROPOLIS_LIFT,
        surface: stone.accent,
        fill: stone.primary,
      },
    ],
    features: [{ id: "votive", pitch: 11, at: "interval", offset: 4 }],
  };
}

/**
 * `castle_base_wall` — the ōgi revetment (W7, family B).
 *
 * Three courses receding inward as they climb, then the bailey the keep stands
 * on. Read from the ground below, a course that steps back at every lift is a
 * batter, and a batter drawn in one-column steps is the closest a lattice gets
 * to the fan curve the catalog row names — the same answer `tenshu_keep`'s own
 * base already gives, said once here so the two agree.
 */
function castleBaseWallProfile(ctx: InfraContext): InfraSweptProfile {
  const stone = entryStone(ctx.theme);
  return {
    id: "infra.entry@0/castle_base_wall",
    asymmetric: true,
    follow: "step",
    maxGrade: 1,
    crossing: "stop",
    bands: [
      { id: "footing", role: "footing", width: 1, level: 2, surface: stone.primary, fill: stone.primary },
      { id: "batter", role: "core", width: 1, level: 4, surface: stone.primary, fill: stone.primary },
      {
        id: "coping",
        role: "kerb",
        width: 1,
        level: CASTLE_LIFT,
        surface: stone.accent,
        fill: stone.primary,
      },
      {
        id: "bailey",
        role: "walkway",
        width: 3,
        level: CASTLE_LIFT,
        surface: stone.accent,
        fill: stone.primary,
      },
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

  /* --- W4: the `between` form's first client --- */

  harbour_chain_tower: {
    id: "harbour_chain_tower",
    // One form, and it is the entry: a chain tower alone is a tower. `between`
    // is the only form that names *two* anchors, which is the only shape this
    // row has.
    routes: ["between"],
    geometry: { kind: "span", span: harbourChainTowerSpan },
    // Nothing declared: two towers stand on the moles they were given and the
    // chain is in the air. §3.5's tier-A question never arises.
    // A span writes on the ground at exactly two columns; where a carriageway
    // owns one of them the tower is refused rather than planted in the road,
    // and the chain overhead is unaffected because it is not on the ground.
    crossings: "open",
    // Below this the two moles are the same mole and what is between them is a
    // gap you could step over.
    minRun: 12,
    rise: 0,
  } satisfies InfraEntryDef,

  /* --- W6: the `between` form's other three clients --- */

  aqueduct: {
    id: "aqueduct",
    // One form, for the harbour tower's reason: an aqueduct is the relation
    // between a source and a town, and no single anchor contains it.
    routes: ["between"],
    geometry: { kind: "span", span: aqueductSpan },
    // Nothing declared, and §3.5's reserved rank stays reserved: the piers
    // stand on the ground they find and are refused where they cannot.
    crossings: "open",
    // Under two bays there is no arcade — what stands there is a wall with a
    // gutter on it.
    minRun: 24,
    rise: 0,
  } satisfies InfraEntryDef,

  telegraph_line: {
    id: "telegraph_line",
    routes: ["between"],
    geometry: { kind: "span", span: telegraphLineSpan },
    // The poles step aside for a carriageway; the wire crosses over it.
    crossings: "open",
    // Three bays, or it is two poles and a washing line.
    minRun: POLE_PITCH * 3,
    rise: 0,
  } satisfies InfraEntryDef,

  // The ground contract's first `structure.linework` client
  // (`docs/GROUND-CONTRACT-v0.md` §13.2e). Its approach embankments are
  // declared at rank 25 from the linework slot — before the streets exist, with
  // the crossings found in the *solved* layout — and its materials are laid
  // here, on the ground the resolver gave.
  viaduct: {
    id: "viaduct",
    routes: ["between"],
    geometry: { kind: "span", span: viaductSpan },
    // The one row in this registry that names it. Rank 25, tier A: the ground
    // makes room for the approaches and the streets *join* them.
    sourceClass: "structure.linework",
    // The bays are left open at grade and the deck strides them, exactly as the
    // aqueduct's arcade does. The approach embankments are the half that is
    // *not* open: a lane crossing one receives no claim at all, so it passes
    // through by declaration rather than by rank.
    crossings: "open",
    // Under two bays there is no arcade — what stands there is a bridge.
    minRun: 24,
    rise: 0,
  } satisfies InfraEntryDef,

  maglev_pylon: {
    id: "maglev_pylon",
    routes: ["between"],
    geometry: { kind: "span", span: maglevPylonSpan },
    crossings: "open",
    minRun: 24,
    rise: 0,
  } satisfies InfraEntryDef,

  /* --- W5: the water movers (families B and D) --- */

  dam: {
    id: "dam",
    // One form, and it is the entry: a dam is a line *across* a watercourse.
    // The host reads `across` against the water rather than against a
    // carriageway for a row that declares `water` — a dam thrown across a
    // street is a wall.
    routes: ["across"],
    geometry: { kind: "route", profile: damProfile },
    sourceClass: "fluid.channel",
    // The crest is a road nobody routed: it crosses whatever it crosses, and
    // the ground under it is declared at rank 0, so there is nothing to open
    // for. A carriageway that met a dam would be carried over it, not through.
    crossings: "block",
    // Under this the "watercourse" is a puddle and the dam is a garden step.
    minRun: 8,
    rise: 0,
    declaresLevels: true,
    water: { hold: 5, freeboard: 2, reach: DAM_REACH, face: 6 },
  } satisfies InfraEntryDef,

  weir: {
    id: "weir",
    routes: ["across"],
    geometry: { kind: "route", profile: weirProfile },
    sourceClass: "fluid.channel",
    crossings: "block",
    minRun: 6,
    rise: 0,
    declaresLevels: true,
    // **Zero freeboard is the entry.** A weir's crest sits *at* the head it
    // holds, so the pool comes right to the lip and the step reads as the thing
    // water goes over rather than the thing that stops it. It stays stable for
    // the reason the canal's coping is stable — a neighbour standing at the
    // water line holds it — and it stays walkable because the lip is dry solid
    // ground with air above it.
    water: { hold: 1, freeboard: 0, reach: WEIR_REACH, face: 2 },
  } satisfies InfraEntryDef,

  canal_lock: {
    id: "canal_lock",
    routes: ["across"],
    geometry: { kind: "route", profile: canalLockProfile },
    sourceClass: "fluid.channel",
    crossings: "block",
    minRun: 6,
    rise: 0,
    declaresLevels: true,
    water: { hold: 2, freeboard: 1, reach: LOCK_REACH, face: 3, chamber: LOCK_CHAMBER },
  } satisfies InfraEntryDef,

  /* --- W7: family B, the retaining / terrain-defining entries --- */
  // Four rows, one mechanism: `declaresLevels` at `retaining.seam`, which is
  // the only class a `face` is legal from. `crossings: "open"` throughout —
  // a street that crosses a face is the connection between its two levels, and
  // a wall across a road is the mistake the retaining pass already refuses.

  retaining_wall: {
    id: "retaining_wall",
    routes: ["along", "ring"],
    geometry: { kind: "route", profile: retainingWallProfile },
    sourceClass: "retaining.seam",
    crossings: "open",
    // Under this a "wall" is a kerb, and the terrain pass already makes kerbs.
    minRun: 8,
    // The lift lives in the bands' `level`, not in the datum: the wall stands
    // on the low ground it finds and raises the platform behind it.
    rise: 0,
    declaresLevels: true,
  } satisfies InfraEntryDef,

  terrace_steps: {
    id: "terrace_steps",
    routes: ["across"],
    geometry: { kind: "route", profile: terraceStepsProfile },
    sourceClass: "retaining.seam",
    // The one row of the family that does *not* open for a carriageway, and
    // the dam's argument verbatim: the ground under a flight is declared, so
    // there is nothing to open for. A way that meets these steps climbs them.
    crossings: "block",
    // Four columns is one storey at the grade cap — below that it is a doorstep.
    minRun: 4,
    rise: 0,
    declaresLevels: true,
  } satisfies InfraEntryDef,

  acropolis_terrace: {
    id: "acropolis_terrace",
    routes: ["ring", "along"],
    geometry: { kind: "route", profile: acropolisTerraceProfile },
    sourceClass: "retaining.seam",
    crossings: "open",
    // A sanctuary terrace shorter than its own lift is a plinth.
    minRun: 16,
    rise: 0,
    declaresLevels: true,
    fittings: { votive: { stack: ["polished_andesite", "chiseled_stone_bricks"] } },
  } satisfies InfraEntryDef,

  castle_base_wall: {
    id: "castle_base_wall",
    routes: ["ring", "along"],
    geometry: { kind: "route", profile: castleBaseWallProfile },
    sourceClass: "retaining.seam",
    crossings: "open",
    minRun: 12,
    rise: 0,
    declaresLevels: true,
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
