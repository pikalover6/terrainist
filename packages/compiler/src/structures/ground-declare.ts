/**
 * **The shadow declarers** — `docs/GROUND-CONTRACT-v0.md` §8.1, item 2.
 *
 * WP-2 converts **no** caller. Every one of the eleven passes still writes
 * `plan.ground` exactly as it always has; this module recomputes, from what
 * those passes now hand back, the `GroundIntent`s each of them *would* declare
 * after conversion (§3, subsection by subsection). The equivalence shim then
 * resolves that declaration set beside the mutating pipeline and asserts the two
 * agree where §8.3 says they must — which is the safety net for the whole
 * rewrite, and is worth nothing if the declarations are invented rather than
 * derived.
 *
 * Two rules govern everything below.
 *
 * **Read-only.** Nothing here mutates a plan, a mask or a pass result. The
 * inputs are the passes' own return values, and every level in them was recorded
 * by the pass *at the moment it wrote it* — because by the time a declarer could
 * look at `plan.ground`, five later passes have written the same columns. That
 * is why WP-2's changes to the passes are return values and write-only sinks,
 * and why production behaviour is bit-for-bit unchanged.
 *
 * **Declare the contract level, not the mutated result.** For most passes those
 * are the same number. For three they are not, and the difference is the point:
 *
 * - the **sidewalk** (§3.8b) declares the flanking carriageway's *arc-station*
 *   level, not the `plan.ground` of the centre cell it levels to today. That is
 *   inversion I6 — measured at up to seven blocks of step across one street's
 *   own width — and it has to be visible in the declaration set or the shim
 *   cannot see it at all;
 * - the **doorstep** (§3.11b) declares only the `dropped` outcome's cut columns;
 *   the `stepped` outcome is block placement above a ground it does not move;
 * - the **prop pad** (§3.10b) declares only the columns its own fill-never-cut
 *   filter selected.
 *
 * And three passes declare **nothing**, deliberately: `kerbSeam` and `faceCuts`
 * (§3.3b) and the courtyard interiors (§3.4b) are materials, and the contract
 * does not protect materials.
 *
 * Out of scope for WP-2, stated so it is not mistaken for an omission: the
 * exhibit and devworld builders of §3.12's second bullet (`exhibits/context.ts`,
 * `exhibits/props.ts`) declare nothing here. They write the same `ColumnPlan`
 * type on the terrarium path, and WP-6's freeze test must either cover them or
 * scope itself to the world pipeline explicitly — "not covering them and not
 * saying so is how a freeze leaks".
 */

import type { PadEdit } from "../layout/types.js";
import type { GroundClaim, GroundIntent } from "../layout/ground-contract.js";
import type { ColumnPlan } from "../terrain/columns.js";
import { index, inside } from "./roads.js";
import type { RoadNetworkResult, StreetSurfaceResult } from "./roads.js";
import type { PrecinctPassResult } from "./precincts.js";
import type { PlazaResult } from "./plaza.js";
import type { RetainingPassResult } from "./retaining.js";
import type { CourtyardPassResult } from "./courtyards.js";
import type { CanalPassResult } from "./canals.js";
import type { StreetscapeResult } from "./streetscape.js";
import type { PropPassResult } from "./props.js";
import type { DoorstepResult } from "./doorsteps.js";
import { projectToLine } from "./sweep.js";

/* -------------------------------------------------------------------------- */
/* §3.1 precincts                                                              */
/* -------------------------------------------------------------------------- */

/**
 * §3.1b — one `platform` per precinct kit, at the level it graded its apron,
 * taxiway, quay and forecourt to.
 *
 * `transition: "ramp"`: the forecourt walks out to its own ground rather than
 * ending at a cut face. A quay declares its own dry columns and declares nothing
 * at all for the water it fronts — that water is the terrain's, which is exactly
 * why `padFor` returns `null` for `precinct.harbour@0`.
 */
export function declarePrecincts(result: PrecinctPassResult | undefined): GroundIntent[] {
  if (result === undefined) return [];
  return result.declarations
    .filter((d) => d.columns.length > 0)
    .map((d) => ({
      source: d.nodePath,
      sourceClass: "precinct.ground" as const,
      kind: "platform" as const,
      columns: d.columns,
      transition: "ramp" as const,
    }));
}

/* -------------------------------------------------------------------------- */
/* §3.2 plaza                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * §3.2b — the paved square as `plaza.ground`, and the well as `plaza.well` plus
 * a `preserve` over its eight perimeter columns.
 *
 * The plaza's level claim is what makes the `paved` mask's level behaviour a
 * rank instead of a special case (inversion I7, which must move **no** column on
 * any world). The well's `preserve` is the cleanest use of the kind in the
 * codebase: the module header's "the geometry is the proof" only survives a
 * later pass if the eight columns the proof stands on are declared.
 */
export function declarePlaza(
  nodePath: string,
  result: PlazaResult | undefined,
): GroundIntent[] {
  if (result === undefined) return [];
  const out: GroundIntent[] = [];
  const well = result.declaration.well;
  // The paving runs before the well is dug, so `declaration.paved` holds the
  // centre column too — and `plaza.ground` (30) outranks `plaza.well` (40), so
  // declared as it stands the paving wins the well and fills it in. Measured on
  // `showcase-ironvale` and `demo-deltaport`: one column each, dry stone at the
  // plaza's level where the pass left a block of water. The pass does not own
  // that column when it is finished, so it does not declare it.
  const paved =
    well === undefined
      ? result.declaration.paved
      : result.declaration.paved.filter((c) => c.idx !== well.centre.idx);
  if (paved.length > 0) {
    out.push({
      source: nodePath,
      sourceClass: "plaza.ground",
      kind: "platform",
      columns: paved,
      transition: "ramp",
    });
  }
  if (well !== undefined) {
    out.push(
      {
        source: `${nodePath}#well`,
        sourceClass: "plaza.well",
        kind: "platform",
        columns: [well.centre],
        transition: "step",
      },
      {
        source: `${nodePath}#well`,
        sourceClass: "plaza.well",
        kind: "preserve",
        columns: well.perimeter,
        transition: "none",
      },
    );
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* §3.3 retaining                                                              */
/* -------------------------------------------------------------------------- */

/**
 * §3.3b — a `face` plus a `preserve` per wall run, and a `verge` per bank.
 *
 * A wall run's columns are the thickened, chained course at the coping's own
 * walking level, and `transition: "wall"` because the face *is* the transition:
 * the resolver suppresses transition generation across a `face`. The `preserve`
 * is the `unsupported.chain` finding that survived four rounds of fixes — a
 * balustrade may never be left standing over ground something else dropped.
 *
 * A bank is `verge`, tier D, so it can only move columns nothing else claimed —
 * the generalisation of the `street`/`occupied`/water guards `gradeBank` carries
 * by hand. `kerbSeam` and `faceCuts` declare **nothing**: materials only.
 */
export function declareRetaining(result: RetainingPassResult | undefined): GroundIntent[] {
  if (result === undefined) return [];
  const out: GroundIntent[] = [];
  for (const wall of result.declaration.walls) {
    const sourceClass = wall.measured ? ("retaining.skirt" as const) : ("retaining.seam" as const);
    out.push(
      {
        source: wall.source,
        sourceClass,
        kind: "face",
        columns: wall.columns,
        transition: "wall",
      },
      {
        source: wall.source,
        sourceClass,
        kind: "preserve",
        columns: wall.columns,
        transition: "none",
      },
    );
  }
  for (const bank of result.declaration.banks) {
    out.push({
      source: bank.source,
      sourceClass: "verge",
      kind: "profile",
      columns: bank.columns,
      transition: "ramp",
    });
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* §3.4 courtyards                                                             */
/* -------------------------------------------------------------------------- */

/**
 * §3.4b — each passage rect as a `courtyard.floor` platform at the pend's median
 * level, and the well exactly as §3.2's.
 *
 * Declaring the pend is what converts `roofPassage`'s silent refusal ("an arch
 * across a step is a lintel with daylight under one end") into either a level
 * pend or a named conflict. The interiors declare nothing: they are materials.
 */
export function declareCourtyards(result: CourtyardPassResult | undefined): GroundIntent[] {
  if (result === undefined) return [];
  const out: GroundIntent[] = [];
  for (const pend of result.declaration.passages) {
    out.push({
      source: pend.nodePath,
      sourceClass: "courtyard.floor",
      kind: "platform",
      columns: pend.columns,
      transition: "step",
    });
  }
  for (const [i, well] of result.declaration.wells.entries()) {
    const source = `${well.nodePath}#courtyard-well@${i}`;
    out.push(
      {
        source,
        sourceClass: "plaza.well",
        kind: "platform",
        columns: [well.centre],
        transition: "step",
      },
      {
        source,
        sourceClass: "plaza.well",
        kind: "preserve",
        columns: well.perimeter,
        transition: "none",
      },
    );
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* §3.5 canals                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * §3.5b — the channel at its bed carrying its water, plus a `preserve`; and the
 * coping ∪ quay at the quay level.
 *
 * `fluid.channel` is rank 0 because losing a water claim is a *physics* failure
 * and not an ugly walk: raising a column out of a channel opens a face the water
 * flows into on the first tick. `transition: "wall"` on the channel — the quay
 * is the transition — and `"step"` on the banks.
 *
 * One intent per pass rather than per quarter: the pass claims every channel
 * column of every quarter before writing one, so the arbitration between two
 * canals a block apart has already happened and re-splitting it here would
 * invent a conflict the pass does not have.
 */
export function declareCanals(
  nodePath: string,
  result: CanalPassResult | undefined,
): GroundIntent[] {
  if (result === undefined) return [];
  const out: GroundIntent[] = [];
  if (result.declaration.channel.length > 0) {
    out.push(
      {
        source: `${nodePath}#channel`,
        sourceClass: "fluid.channel",
        kind: "platform",
        columns: result.declaration.channel,
        transition: "wall",
      },
      {
        source: `${nodePath}#channel`,
        sourceClass: "fluid.channel",
        kind: "preserve",
        columns: result.declaration.channel,
        transition: "none",
      },
    );
  }
  if (result.declaration.banks.length > 0) {
    out.push({
      source: `${nodePath}#quay`,
      sourceClass: "fluid.channel",
      kind: "platform",
      columns: result.declaration.banks,
      transition: "step",
    });
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* §3.6 + §3.7 streets and street stairs                                       */
/* -------------------------------------------------------------------------- */

/**
 * §3.6b and §3.7b — the street family declares as **one subsystem**, because its
 * internal arbitration (rank, ownership, endpoint pins) is already correct and
 * is not the resolver's business.
 *
 * Per surfaced segment: a `profile` at class `street.network`, `subRank` = its
 * position in the `compareStreetRank` sort, `transition: "none"` (a
 * carriageway's own cross-section takes no kerb), over the columns it *owns* at
 * the surfacer's own levels. A flight of steps is the same intent with the
 * subRank that puts it below any street of its width — a flight arrives at a
 * street; a street does not arrive at a flight.
 *
 * Plus, exactly as §3.6b lists them: `preserve` over any run carrying a
 * balustrade or a bridge rail, and `clearance` + `preserve` over the bridged
 * water columns at the fluid surface — the deck is *meant* to stand over its
 * channel, and the column beneath it must not move. And `blendShoulders`
 * declares separately, as `verge`: the pass still computes the BFS; the resolver
 * only arbitrates.
 */
export function declareStreets(result: StreetSurfaceResult | undefined): GroundIntent[] {
  if (result === undefined) return [];
  const out: GroundIntent[] = [];
  for (const segment of result.declaration.segments) {
    if (segment.columns.length > 0) {
      out.push({
        source: segment.source,
        sourceClass: "street.network",
        kind: "profile",
        columns: segment.columns,
        transition: "none",
        subRank: segment.subRank,
      });
    }
    if (segment.preserve && segment.columns.length > 0) {
      out.push({
        source: segment.source,
        sourceClass: "street.network",
        kind: "preserve",
        columns: segment.columns,
        transition: "none",
        subRank: segment.subRank,
      });
    }
    if (segment.bridged.length > 0) {
      out.push(
        {
          source: `${segment.source}#deck`,
          sourceClass: "street.network",
          kind: "clearance",
          columns: segment.bridged,
          transition: "none",
          subRank: segment.subRank,
        },
        {
          source: `${segment.source}#deck`,
          sourceClass: "street.network",
          kind: "preserve",
          columns: segment.bridged,
          transition: "none",
          subRank: segment.subRank,
        },
      );
    }
  }
  if (result.declaration.shoulders.length > 0) {
    out.push({
      source: "street#shoulders",
      sourceClass: "verge",
      kind: "profile",
      columns: result.declaration.shoulders,
      transition: "ramp",
    });
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* §3.8 streetscape                                                            */
/* -------------------------------------------------------------------------- */

/**
 * §3.8b — the sidewalk band as a `street.sidewalk` profile, **at the flanking
 * carriageway's arc-station level**.
 *
 * This is inversion I6 and it is a bug fix, not a policy choice. Today
 * `paveSidewalks` reads the current `plan.ground` of the centre column —
 * whatever the last writer left — and levels the whole band to it. Here the
 * level comes from the same `ArcLevels` the carriageway's did, so the sidewalk's
 * level and the carriageway's are one number by construction. A column whose
 * flanking segment the surfacer never levelled (a graph dressed on its own, a
 * segment refused) falls back to what the pass wrote: there is no arc frame to
 * ask, and inventing one would be a second answer.
 *
 * `transition: "step"` — the kerb is the transition, and the resolver generates
 * it. `thickenCurbs` declares nothing: it is a *material* course over columns
 * this pass already paved.
 */
export function declareSidewalks(
  nodePath: string,
  dressed: StreetscapeResult | undefined,
  streets: StreetSurfaceResult | undefined,
): GroundIntent[] {
  if (dressed === undefined || dressed.declaration.length === 0) return [];
  const bySegment = new Map(
    (streets?.declaration.segments ?? []).map((s) => [s.id, s] as const),
  );
  const columns: GroundClaim[] = [];
  for (const column of dressed.declaration) {
    const segment = bySegment.get(`segment:${column.segment}`);
    const frame = segment?.frame;
    const levels = segment?.levels;
    if (frame === undefined || levels === undefined) {
      columns.push({ idx: column.idx, y: column.wrote });
      continue;
    }
    const arc = projectToLine({ x: column.cx, z: column.cz }, frame.line, frame.arcs).arc;
    columns.push({ idx: column.idx, y: levels.at(arc) });
  }
  return [
    {
      source: `${nodePath}#sidewalk`,
      sourceClass: "street.sidewalk",
      kind: "profile",
      columns,
      transition: "step",
    },
  ];
}

/**
 * What `paveSidewalks` **wrote**, per column — the other half of inversion I6.
 *
 * {@link declareSidewalks} declares the arc-station level, which is the whole
 * point of I6 and is deliberately *not* the number the pass put in the plan. So
 * on an I6 column no claim in the set carries the written level, and §8.3's
 * "the claim whose level equals `plan.ground[k]`" finds nothing to attribute the
 * divergence to. §8.5's I6 row names `street.sidewalk` as its own loser for
 * exactly this reason — "the level changed, not the winner" — and this map is
 * the evidence that makes that row checkable per column instead of assumed.
 *
 * Later districts overwrite earlier ones, as the pipeline's write order does.
 */
export function sidewalkWrites(
  streetscape: readonly { readonly result: StreetscapeResult }[] | undefined,
): Map<number, number> {
  const out = new Map<number, number>();
  for (const dressed of streetscape ?? []) {
    for (const column of dressed.result.declaration) out.set(column.idx, column.wrote);
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* §3.9 roads                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * §3.9b — one `road.network` profile per route over its swept columns at the
 * graded profile, `transition: "none"`; its shoulders declare `verge` exactly as
 * §3.6b's do.
 *
 * `road.network` sits below `street.network`, which is inversion I2: the router
 * already discounts existing road cells so a lane *joins* the grid rather than
 * running alongside it, and the levels should join too. The bridged columns get
 * the same `clearance` + `preserve` a street's deck does, for the same reason.
 */
export function declareRoads(result: RoadNetworkResult | undefined): GroundIntent[] {
  if (result === undefined) return [];
  const out: GroundIntent[] = [];
  for (const [i, route] of result.declaration.routes.entries()) {
    // Routing order, later-wins — `road.network`'s answer to `street.network`'s
    // `subRank`. `surfaceRoute` has no "already surfaced" guard, so where two
    // lanes share a column the pipeline's level is the **last** route's, and
    // without this the winner would be whichever route's source string sorted
    // first. Measured on `hillside-village`: 5 columns, up to 4 blocks, decided
    // by alphabetical accident. Negative because lower wins (§4.1).
    const subRank = -i;
    if (route.columns.length > 0) {
      out.push({
        source: route.source,
        sourceClass: "road.network",
        kind: "profile",
        columns: route.columns,
        transition: "none",
        subRank,
      });
    }
    if (route.bridged.length > 0) {
      out.push(
        {
          source: `${route.source}#deck`,
          sourceClass: "road.network",
          kind: "clearance",
          columns: route.bridged,
          transition: "none",
          subRank,
        },
        {
          source: `${route.source}#deck`,
          sourceClass: "road.network",
          kind: "preserve",
          columns: route.bridged,
          transition: "none",
          subRank,
        },
      );
    }
  }
  if (result.declaration.shoulders.length > 0) {
    out.push({
      source: "road#shoulders",
      sourceClass: "verge",
      kind: "profile",
      columns: result.declaration.shoulders,
      transition: "ramp",
    });
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* §3.10 props, §3.11 doorsteps                                                */
/* -------------------------------------------------------------------------- */

/**
 * §3.10b — a `prop.pad` platform per pad, over **only** the columns the pass's
 * own filter selected, at their targets.
 *
 * Tier D, so "fill only, never cut" needs no new field: the pass already filters
 * with `if (g >= want) continue`, and against a resolved ground a pad simply has
 * fewer columns to fill. A pad it cannot fill was already refused by
 * `PROP_MAX_RELIEF`.
 */
export function declareProps(result: PropPassResult | undefined): GroundIntent[] {
  if (result === undefined) return [];
  return result.padDeclarations.map((pad) => ({
    source: pad.source,
    sourceClass: "prop.pad" as const,
    kind: "platform" as const,
    columns: pad.columns,
    transition: "step" as const,
  }));
}

/**
 * §3.11b — a `doorstep.landing` platform per cut landing, over only the
 * `dropped` outcome's columns at their targets.
 *
 * The `stepped` outcome declares nothing: it is pure block placement above a
 * ground it does not move, which is why inversion I3 (a street beats a doorstep)
 * costs a door its trench and not its approach.
 */
export function declareDoorsteps(result: DoorstepResult | undefined): GroundIntent[] {
  if (result === undefined) return [];
  return result.declarations.map((d) => ({
    source: d.source,
    sourceClass: "doorstep.landing" as const,
    kind: "platform" as const,
    columns: d.columns,
    transition: "step" as const,
  }));
}

/* -------------------------------------------------------------------------- */
/* §3.12 the solver's pads                                                     */
/* -------------------------------------------------------------------------- */

/**
 * §3.12, first bullet — the `PadEdit` list as `platform`, class `pad.record`.
 *
 * Advisory, at the bottom of the built ranks: the field already carries the
 * answer, so this costs nothing, and it is what makes a building's floor plane
 * visible to conflict detection rather than baked in — the thing that lets
 * inversion I1 catch the fourth walked defect, *"a building's `apron: 2` ramped
 * away the seam a retaining wall stood on"*.
 *
 * Only the footprint is declared, never the apron: whether the apron should
 * become a declared transition is §13.3, and answering it here would be deciding
 * an open question by implementation.
 */
export function declarePadEdits(
  plan: ColumnPlan,
  padEdits: readonly PadEdit[],
): GroundIntent[] {
  const region = plan.region;
  const out: GroundIntent[] = [];
  for (const [i, pad] of padEdits.entries()) {
    const columns: GroundClaim[] = [];
    for (let z = pad.footprint.z0; z <= pad.footprint.z1; z++) {
      for (let x = pad.footprint.x0; x <= pad.footprint.x1; x++) {
        if (!inside(region, x, z)) continue;
        columns.push({ idx: index(region, x, z), y: pad.targetY });
      }
    }
    if (columns.length === 0) continue;
    out.push({
      source: `${pad.nodePath}#pad@${i}`,
      sourceClass: "pad.record",
      kind: "platform",
      columns,
      transition: "ramp",
      // Application order, later-wins, exactly as `applyPadEdits` composes them:
      // inside a footprint `applyLevelPad` writes `targetY` outright, so where
      // two footprints overlap the field carries the **last** pad's level. Left
      // to the class's default the two would be ordered by `source` string, and
      // on `c1-harbourtown` 162 columns would then be decided by whether a node
      // path happens to sort before another — right by luck, and the same luck
      // could as easily run the other way. Negative because lower wins (§4.1).
      subRank: -i,
    });
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* the whole declaration set                                                   */
/* -------------------------------------------------------------------------- */

/** Everything {@link declareAll} needs; every field optional, as every pass is. */
export interface GroundDeclarationInput {
  readonly plan: ColumnPlan;
  readonly precincts?: PrecinctPassResult;
  readonly plaza?: { readonly nodePath: string; readonly result: PlazaResult };
  readonly retaining?: RetainingPassResult;
  readonly courtyards?: CourtyardPassResult;
  readonly canals?: { readonly nodePath: string; readonly result: CanalPassResult };
  readonly streets?: StreetSurfaceResult;
  /** One per district dressed, each with the node path its sidewalks belong to. */
  readonly streetscape?: readonly {
    readonly nodePath: string;
    readonly result: StreetscapeResult;
  }[];
  readonly roads?: RoadNetworkResult;
  readonly props?: PropPassResult;
  readonly doorsteps?: DoorstepResult;
  readonly padEdits?: readonly PadEdit[];
}

/**
 * The whole declaration set, in pipeline order — what the shim resolves.
 *
 * Pipeline order is not precedence order and does not need to be: the resolver's
 * answer is a pure function of the set (§4.1's comparator is total on distinct
 * intents, because `source` is unique within a class), so this order is for the
 * *reader* — it is §3's inventory, in §3's sequence, so a missing pass is missing
 * from a list somebody can check against the doc.
 */
export function declareAll(input: GroundDeclarationInput): GroundIntent[] {
  const out: GroundIntent[] = [];
  out.push(...declarePrecincts(input.precincts));
  if (input.plaza !== undefined) {
    out.push(...declarePlaza(input.plaza.nodePath, input.plaza.result));
  }
  out.push(...declareRetaining(input.retaining));
  out.push(...declareCourtyards(input.courtyards));
  if (input.canals !== undefined) {
    out.push(...declareCanals(input.canals.nodePath, input.canals.result));
  }
  out.push(...declareStreets(input.streets));
  for (const dressed of input.streetscape ?? []) {
    out.push(...declareSidewalks(dressed.nodePath, dressed.result, input.streets));
  }
  out.push(...declareRoads(input.roads));
  out.push(...declareProps(input.props));
  out.push(...declareDoorsteps(input.doorsteps));
  if (input.padEdits !== undefined) out.push(...declarePadEdits(input.plan, input.padEdits));
  return out;
}

/**
 * Every column any *level* claim in a set names, with the levels proposed for
 * it — §8.3's partition, minus the two answers it is not allowed to look at.
 *
 * Filters and level claims are told apart here rather than by the caller because
 * §2.2 is where that distinction lives: `clearance` and `preserve` propose no
 * level of their own, so a column named only by those two is `UNCLAIMED`.
 */
export function levelClaimsByColumn(
  intents: readonly GroundIntent[],
): Map<number, Set<number>> {
  const out = new Map<number, Set<number>>();
  for (const intent of intents) {
    if (intent.kind !== "platform" && intent.kind !== "profile" && intent.kind !== "face") {
      continue;
    }
    for (const claim of intent.columns) {
      let levels = out.get(claim.idx);
      if (levels === undefined) {
        levels = new Set<number>();
        out.set(claim.idx, levels);
      }
      levels.add(claim.y);
    }
  }
  return out;
}

/**
 * True when a claim asks the column to hold a fluid (§2.1).
 *
 * `fluid` omitted means "dry, and `fluidTop` follows `y`", which is every claim
 * but the canal's and the two wells' — and the type says so: `kind` is `1 | 2`,
 * so a *present* `fluid` is never `NONE`.
 */
export function isWetClaim(claim: GroundClaim): boolean {
  return claim.fluid !== undefined;
}
