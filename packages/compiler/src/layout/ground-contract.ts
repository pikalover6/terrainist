/**
 * The ground contract's declaration types and precedence order
 * (`docs/GROUND-CONTRACT-v0.md` §2, §4, and the type halves of §5.1 and §7).
 *
 * **Nothing may modify the ground after the ground is decided.** Eleven passes
 * write `plan.ground` after materialisation today, each reading whatever the
 * previous ones left, with no arbitration beyond array-write order. Every ground
 * defect walked between 2026-08-04 and 2026-08-06 is a collision in that pile:
 * `paveSidewalks` re-levelling ground `surfaceStreetGraph` had just graded by up
 * to **7 blocks** across one street's own width; a coping overwritten by a later
 * pass leaving **183 unsupported balustrade posts**; a retaining wall skipped on
 * **84%** of a hill town's faces because the street claimed them.
 *
 * This module is the contract's vocabulary and nothing else: what a subsystem
 * *declares* (§2), the total order that decides who wins a contested column
 * (§4), and the shapes the resolver hands back (§5.1, §7). It holds no
 * `ColumnPlan`, no region and no resolver, exactly as `structures/street-owner.ts`
 * holds none — so the precedence rule can be tested without compiling a world.
 *
 * The resolver itself (`resolveGround`) and the `LOAM-W490..E495` diagnostics it
 * raises land with WP-2. They are deliberately absent here rather than stubbed:
 * machinery that exists and never runs is a named failure mode.
 */

import type { LoamDiagnostic } from "@terrainist/spec";
import type { Region } from "@terrainist/stdlib";

import type { SeamTreatment } from "./levels.js";

/* -------------------------------------------------------------------------- */
/* 2. the declaration types                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The precedence class a claim belongs to (§4.2's table).
 *
 * `kind` alone cannot drive precedence — a building footprint and a prop pad are
 * both `platform` and must not rank together — so the order is over
 * `(source-class, subRank, source)` and this union is its domain.
 */
export type GroundSourceClass =
  | "fluid.channel"
  | "building.footprint"
  | "precinct.ground"
  | "structure.linework"
  | "plaza.ground"
  | "plaza.well"
  | "courtyard.floor"
  | "retaining.seam"
  | "retaining.skirt"
  | "street.network"
  | "street.sidewalk"
  | "road.network"
  | "sweep.run"
  | "doorstep.landing"
  | "prop.pad"
  | "verge"
  | "pad.record";

/**
 * Every class, in rank order, as a value — the union is a type and a test cannot
 * enumerate a type. The `satisfies` clause is what keeps the two in step: a
 * class added to {@link GroundSourceClass} and not to this array makes the
 * assignment to `readonly GroundSourceClass[]` fine but the exhaustiveness check
 * below fail to compile, and a typo here is rejected outright.
 */
export const GROUND_SOURCE_CLASSES = Object.freeze([
  "fluid.channel",
  "building.footprint",
  "precinct.ground",
  "structure.linework",
  "plaza.ground",
  "plaza.well",
  "courtyard.floor",
  "retaining.seam",
  "retaining.skirt",
  "street.network",
  "street.sidewalk",
  "road.network",
  "sweep.run",
  "doorstep.landing",
  "prop.pad",
  "verge",
  "pad.record",
] as const) satisfies readonly GroundSourceClass[];

/**
 * Compile-time proof that {@link GROUND_SOURCE_CLASSES} lists every member of
 * {@link GroundSourceClass}: if a class is missing, `GroundSourceClass` is not
 * assignable to the array's element union and this alias resolves to `never`,
 * which the `true` annotation rejects. The mirror of the runtime exhaustiveness
 * assertion in `test/ground-contract.test.ts` — a silently-missing entry looks
 * exactly like "precedence is broken", which is the `agent-defs.test.ts` lesson.
 */
type _AllClassesListed =
  GroundSourceClass extends (typeof GROUND_SOURCE_CLASSES)[number] ? true : never;
const _allClassesListed: _AllClassesListed = true;
void _allClassesListed;

/**
 * What a claim asserts (§2.2). `platform`/`profile`/`face` are level claims;
 * `clearance` and `preserve` are filters that propose no level of their own.
 */
export type GroundIntentKind = "platform" | "profile" | "face" | "clearance" | "preserve";

/** A claim on the ground, from one subsystem, before anything is decided. */
export interface GroundIntent {
  /** Who is asking — a node path or a pass id. Appears in diagnostics. */
  readonly source: string;
  /** Which precedence class this claim belongs to. See {@link INTENT_RANK}. */
  readonly sourceClass: GroundSourceClass;
  /** What kind of claim. Constrains which classes are legal — see §2.2. */
  readonly kind: GroundIntentKind;
  /** The columns and the levels asked for. Lazy; region-sized lists are normal. */
  readonly columns: Iterable<GroundClaim>;
  /** Absorbed how, when a neighbour disagrees: a ramp, a step, a wall. */
  readonly transition: GroundTransitionKind;
  /**
   * Fewest columns the claim needs to be worth anything. The resolver reports
   * `GROUND_CLAIM_REFUSED` below it; it never acts on it. Defaults to 1.
   */
  readonly minColumns?: number;
  /** Within-class ordering, for a class that has one (`street.network`). */
  readonly subRank?: number;
}

/** One column of one claim. */
export interface GroundClaim {
  /** Region-major column index, as every pass already computes it. */
  readonly idx: number;
  /** The level asked for: the Y of the topmost solid block. */
  readonly y: number;
  /**
   * The fluid this claim asks the column to hold. Omitted means "dry, and
   * `fluidTop` follows `y`" — which is every claim but the canal's and the two
   * wells'. Without this field `digCanals`, `pavePlaza`'s well and
   * `furnishCourtyards`' well could not be expressed at all and would have to
   * keep mutating, which would leave a hole in the freeze.
   */
  readonly fluid?: { readonly kind: 1 | 2; readonly top: number };
}

/**
 * How a boundary between two winners at different levels is absorbed (§2.5).
 *
 * On an intent this is a *request*; the resolver's answer comes from the drop
 * and the run (§5.6) and is authoritative, except that `"none"` on either side
 * suppresses the transition entirely.
 */
export type GroundTransitionKind = "ramp" | "step" | "wall" | "none";

/* -------------------------------------------------------------------------- */
/* 2.2 which kinds may come from which classes                                 */
/* -------------------------------------------------------------------------- */

/**
 * The kind→legal-class constraint of §2.2's table, as data a validator or a test
 * can read rather than a comment a reader must obey.
 *
 * `face` is legal only from `retaining.seam` and `retaining.skirt`: a face is a
 * declared cut, and only the two retaining declarers know one. Every other kind
 * is legal from any class — `platform`, `profile`, `clearance` and `preserve`
 * are each declared somewhere in tiers A through E — so the constraint is stated
 * as an explicit class list per kind rather than as a "any" sentinel, which
 * keeps the check a set comparison in both directions.
 */
export const LEGAL_KINDS: Readonly<Record<GroundIntentKind, readonly GroundSourceClass[]>> =
  Object.freeze({
    platform: GROUND_SOURCE_CLASSES,
    profile: GROUND_SOURCE_CLASSES,
    face: Object.freeze(["retaining.seam", "retaining.skirt"] as const),
    clearance: GROUND_SOURCE_CLASSES,
    preserve: GROUND_SOURCE_CLASSES,
  });

/** True when `kind` may legally be declared by `sourceClass` (§2.2). */
export function isLegalKind(kind: GroundIntentKind, sourceClass: GroundSourceClass): boolean {
  return LEGAL_KINDS[kind].includes(sourceClass);
}

/* -------------------------------------------------------------------------- */
/* 4. the total precedence order                                               */
/* -------------------------------------------------------------------------- */

/**
 * Precedence. **Lower wins.** Spaced by 10 so a class can be inserted without
 * renumbering everything below it — `structure.linework` at 25 is that spacing
 * already being used, for a class reserved rather than omitted so the table
 * stays total (§13.2).
 *
 * The tier progression (§4.3) reads down the numbers: A the immovable (water,
 * floor planes, precinct ground — each already immovable today via a mask that
 * exists because some pass discovered by walking that it must not write there),
 * B declared ground (a plaza, a courtyard, a well, a seam — each *is* a level
 * rather than accommodating one), C the network, D the accommodations
 * (doorsteps, prop pads, verges — none has an opinion the ground should defer
 * to), E the record.
 */
export const INTENT_RANK: Readonly<Record<GroundSourceClass, number>> = Object.freeze({
  "fluid.channel": 0,
  "building.footprint": 10,
  "precinct.ground": 20,
  "structure.linework": 25,
  "plaza.ground": 30,
  "plaza.well": 40,
  "courtyard.floor": 50,
  "retaining.seam": 60,
  "retaining.skirt": 70,
  "street.network": 80,
  "street.sidewalk": 90,
  "road.network": 100,
  "sweep.run": 110,
  "doorstep.landing": 120,
  "prop.pad": 130,
  verge: 140,
  "pad.record": 150,
});

/** The five tiers of §4.2/§4.3, in order. */
export type GroundTier = "A" | "B" | "C" | "D" | "E";

/**
 * Which tier each class sits in (§4.2's `tier` column), so the tier boundaries
 * are data and a test can assert the ranks ascend with them rather than trusting
 * a comment. Tier A declares against the baseline only; tier B against the
 * baseline and tier A; and so on down.
 */
export const GROUND_TIERS: Readonly<Record<GroundSourceClass, GroundTier>> = Object.freeze({
  "fluid.channel": "A",
  "building.footprint": "A",
  "precinct.ground": "A",
  "structure.linework": "A",
  "plaza.ground": "B",
  "plaza.well": "B",
  "courtyard.floor": "B",
  "retaining.seam": "B",
  "retaining.skirt": "B",
  "street.network": "C",
  "street.sidewalk": "C",
  "road.network": "C",
  "sweep.run": "C",
  "doorstep.landing": "D",
  "prop.pad": "D",
  verge: "D",
  "pad.record": "E",
});

/**
 * Negative when `a` owns a column `b` also wants. Total on distinct intents.
 *
 * Total in the strict sense: two distinct intents never compare equal, because
 * `source` is unique within a class — a pass that wants two claims declares two
 * sources (`world.town.high_street#carriageway`,
 * `world.town.high_street#verge`), which also makes the report readable. That
 * uniqueness is what makes the resolver's result independent of the order
 * subsystems are enumerated in: the same argument `compareStreetRank`
 * (`structures/street-owner.ts`) makes, for the same reason, and this comparator
 * is modelled directly on it.
 *
 * Within `street.network`, `subRank` is the position in the
 * `compareStreetRank`-sorted job list, so the proven order
 * `(−width, roleRank, kindRank, id)` is preserved exactly and is not
 * re-litigated here.
 */
export function compareIntent(a: GroundIntent, b: GroundIntent): number {
  const ra = INTENT_RANK[a.sourceClass];
  const rb = INTENT_RANK[b.sourceClass];
  if (ra !== rb) return ra - rb;
  const sa = a.subRank ?? 0;
  const sb = b.subRank ?? 0;
  if (sa !== sb) return sa - sb;
  return a.source < b.source ? -1 : a.source > b.source ? 1 : 0;
}

/* -------------------------------------------------------------------------- */
/* 5.1 / 5.6 what the resolver is handed, and hands back                       */
/* -------------------------------------------------------------------------- */

/** The materialised ground the contract resolves against (§5.1). */
export interface GroundBaseline {
  readonly region: Region;
  readonly ground: Int32Array; // as materialised
  readonly fluidTop: Int32Array;
  readonly fluidKind: Uint8Array;
  readonly seaLevel: number;
}

/**
 * One boundary run between two winners at different levels (§5.6).
 *
 * Transitions are **derived, never declared**, for the reason `layout/levels.ts`
 * already states about seams: "a form that declared its own seams could get one
 * wrong, and a wrong seam is a cliff through a town". `treatment` comes from
 * `treatmentForSeam(drop, cells.length)` reused verbatim, so `RETAIN_MAX`,
 * `RETAIN_RAIL` and `MIN_RETAIN_RUN` keep meaning one thing; `requested` is the
 * pair of declared requests, kept so the report can say when the drop/run table
 * overrode one.
 */
export interface GroundTransition {
  /**
   * Winning intent index (as in `ResolvedGround.owner`) on the higher side, or
   * −1 for the baseline. A component never mixes owner pairs (§5.6), so one
   * index describes every cell of the run.
   */
  readonly above: number;
  /** Winning intent index on the lower side — the side a transition stands on. */
  readonly below: number;
  /** The winning claim's source on each side, for diagnostics and the report. */
  readonly aboveSource: string;
  readonly belowSource: string;
  /** The lower-side columns of the run, 8-connected and row-major. */
  readonly cells: readonly number[];
  /** `ground[above] − ground[below]`; one number per component. */
  readonly drop: number;
  /** What `treatmentForSeam` says to build: `kerb`/`retaining`/`bank`/`built`. */
  readonly treatment: SeamTreatment;
  /** What each side asked for, before the table had its say. */
  readonly requested: {
    readonly above: GroundTransitionKind;
    readonly below: GroundTransitionKind;
  };
}

/** Everything `resolveGround` decides (§5.1). Handed out readonly. */
export interface ResolvedGround {
  readonly ground: Int32Array; // frozen; handed out readonly
  readonly fluidTop: Int32Array;
  readonly fluidKind: Uint8Array;
  /** 1 where the resolved level differs from the baseline. Drives the snow rule. */
  readonly moved: Uint8Array;
  /** 1 where `fluidKind !== NONE`. The one answer the classification passes read. */
  readonly wet: Uint8Array;
  /** Winning intent index per column, or −1. What the report and the shim read. */
  readonly owner: Int32Array;
  /** Every boundary run between two winners at different levels. */
  readonly transitions: readonly GroundTransition[];
  readonly report: GroundReport;
  readonly diagnostics: readonly LoamDiagnostic[];
}

/* -------------------------------------------------------------------------- */
/* 7. the report section                                                       */
/* -------------------------------------------------------------------------- */

/**
 * `TerrainCompileReport.stats` gains this optional `ground` section (§7).
 *
 * The three-way `satisfied / adjusted / refused` split with `refusedTo` is the
 * "by whom": a reader can answer "why is my quarter's wall short?" from the
 * report alone, without recompiling — the thing each of the six walked defects
 * cost a walk to discover. `renderCompileFeedback` deliberately does not print
 * it: that channel is diagnostics going back to the authoring model, and a claim
 * table is not author-actionable.
 */
export interface GroundReport {
  /** Region size, for context — the role `examined` plays in the physics lint. */
  readonly columns: number;
  /** Columns any level claim touched. */
  readonly claimed: number;
  /** Columns whose resolved level differs from the materialised one. */
  readonly moved: number;
  /** One row per level claim, in `compareIntent` order. */
  readonly claims: readonly GroundClaimRow[];
  readonly transitions: {
    readonly ramp: number;
    readonly step: number;
    readonly wall: number;
    /** Requests the drop/run table overrode, with what it substituted. */
    readonly substituted: readonly {
      readonly source: string;
      readonly requested: string;
      readonly built: string;
      readonly why: "MIN_RETAIN_RUN" | "RETAIN_MAX" | "faced" | "none-side";
    }[];
  };
  /** Every `preserve` loss, in full. These are the ones worth walking to. */
  readonly conflicts: readonly {
    readonly guard: string;
    readonly loser: string;
    readonly x: number;
    readonly z: number;
    readonly guardY: number;
    readonly askedY: number;
  }[];
}

/** One claim's line in the report (§7). */
export interface GroundClaimRow {
  readonly source: string;
  readonly sourceClass: GroundSourceClass;
  readonly kind: GroundIntentKind;
  readonly rank: number;
  readonly declared: number;
  /** Won at the level asked, or agreed with a winner at that level. */
  readonly satisfied: number;
  /** Won, but clamped by a clearance. */
  readonly adjusted: number;
  /** Lost to a higher rank. */
  readonly refused: number;
  /** Winner source → columns taken. Sorted by count desc, then source. */
  readonly refusedTo: Readonly<Record<string, number>>;
  /** Worst |declared − resolved| over the refused columns. */
  readonly maxDelta: number;
}
