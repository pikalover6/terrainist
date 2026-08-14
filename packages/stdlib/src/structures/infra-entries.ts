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
 * ## What ships in W0
 *
 * Nothing real. The registry is deliberately empty of catalog entries — W1's
 * four (`crop_circle`, `quarantine_fence`, `barricade_line`, `crash_furrow`)
 * are content and land in their own wave — and carries exactly one internal
 * row, {@link INFRA_TEST_ENTRY}, which exists so the host has a client to be
 * proven against. An internal row is **not** a catalog id and is excluded from
 * {@link INFRA_ENTRY_IDS}, which is the set the catalog guard checks both ways.
 *
 * ## Determinism
 *
 * A profile function is a pure function of its context: the resolved theme, the
 * node's params and the entry's seed. It draws no random number itself — where
 * an entry wants variation it takes it from `ctx.seed`, which is
 * `hash(worldSeed, nodePath)` like everything else in this compiler.
 */

import type { Seed256 } from "../determinism/index.js";

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

/** An areal treatment's stamp — the top course of ground it does not own. */
export interface InfraAreaStamp {
  readonly id: string;
  /** The block the treated column's top course becomes. */
  readonly surface: string;
  /**
   * Courses below the surface this treatment also re-materialises. `0` (the
   * default) rewrites the top course alone, which is what a treatment *is*.
   */
  readonly depth?: number;
}

/** What a profile or stamp function is handed. Mirrors `PropContext`'s shape. */
export interface InfraContext {
  /** The settlement's resolved material theme. */
  readonly theme: MaterialTheme | undefined;
  /** The node's own `params`, already validated by the spec. */
  readonly params: Readonly<Record<string, unknown>>;
  /** `hash(worldSeed, nodePath)` — for decoration that varies, not geometry. */
  readonly seed: Seed256;
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

/**
 * Every infrastructure entry, by id.
 *
 * **Empty of catalog entries in W0.** The host is machinery and had a date; the
 * entries it carries are content and are exempt. W1 adds four rows here and
 * nothing else — no pass, no node kind, no compiler edit outside this file.
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
