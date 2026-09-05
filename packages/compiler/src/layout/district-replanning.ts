/**
 * Replanning policy —
 *
 * Deep module owning the composition metrics and the replan ladder. Extracted
 * from `layout/district.ts` as part of Phase 6: previously the replan ladder
 * lived interleaved with fabric orchestration and shared its large mutable
 * context. Here it is a narrow stage: `planQuarter` receives a FabricRequest
 * and a sidewalk width and returns a PlannedQuarter without touching
 * graph/masks/claimed/built/diagnostics.
 */
import { groundLevelsOf, NO_PLATFORM } from "./levels.js";
import type { Rect } from "./frames.js";
import {
  MAX_PRINCIPAL_STREETS,
  MIN_PRINCIPAL_STREETS,
  dilateMask,
  drawFabric,
  type FabricRequest,
  type FabricResult,
  type FormPlan,
  type PlanAttempt,
} from "./forms/index.js";
import { carriagewayCells } from "./streets.js";
import { Grid } from "./district-grid.js";

/* -------------------------------------------------------------------------- */
/* §6 — composition metrics and the replan ladder                              */
/* -------------------------------------------------------------------------- */

/**
 * Rungs of the ladder, and the bound states.
 *
 * Three, because the ceiling is four principal streets and the floor is two:
 * the ladder is `4 → 3 → 2` and there is nowhere below two to go. Derived from
 * the two rather than written as 3, so a ceiling that moves takes the ladder
 * with it — §12.5 is still open about whether a large quarter wants more.
 */
export const MAX_REPLAN_ROUNDS = MAX_PRINCIPAL_STREETS - MIN_PRINCIPAL_STREETS + 1;

/**
 * The two gates the planner can actually discharge, with §6.1's thresholds.
 *
 * §6.2 names four hard gates — `naturalFraction`, `platformPerBuilding`,
 * `wallPerBuilding` and `offPlatform` — and it is right about all four as
 * *acceptance* checks and wrong about two of them as *replan* gates, which is
 * the amendment WP-1 records in that document:
 *
 * - `offPlatform` is not a gate here because the planner makes it
 *   unrepresentable (§3.4 rule 2, §5.5); a non-zero count is a compiler bug and
 *   is raised as one, not replanned around.
 * - `platformPerBuilding` and `wallPerBuilding` are counted from buildings and
 *   walls, and neither exists when the plan is drawn. Replanning on them means
 *   re-entering the whole district pass — landmarks, terraces, coverage draws —
 *   three times per quarter, and §6.2's own sequencing says their thresholds
 *   are calibrated at WP-5 from an accepted world rather than guessed now.
 * - `streetFraction` §6.2 lists as a report metric because "the streetscape's
 *   dilation" is not the planner's. The dilation is a fixed ring count; what
 *   moves this number by twenty points is **how many streets the planner laid**,
 *   which is precisely what the ladder changes. It is the ladder's other gate,
 *   and §8.3 check 6 already treats it as a bar.
 */
export const COMPOSITION_GATES = Object.freeze({
  /** §6.1: uncut, unpaved ground inside the quarter. Most of a hillside is hillside. */
  naturalFraction: 0.4,
  /**
   * §6.1, §8.3 check 6: carriageway plus sidewalk, **net of the carriage
   * spine** (§3.6a; amendment 2026-08-07).
   *
   * The bar is unchanged at 0.25. What changed is what it measures: the spine's
   * columns are infrastructure the town needs — its length is
   * `SPINE_GRADE_RUN × drop`, a number the ladder cannot move, because dropping
   * a contour street does not shorten the road up the hill — so counting them
   * as street sprawl charged the ladder for a road it could not shorten.
   */
  streetFraction: 0.25,
});

/**
 * Columns of retaining wall a site-planned quarter may spend per dwelling —
 * §6.1's `wallPerBuilding` target, turned from an acceptance check into the
 * ration §5.2 rule 7 reads.
 *
 * Forty, verbatim from §6.1's table, against the walked hill town's measured
 * **224**. Counted in **dwellings** rather than in buildings for WP-1's reason:
 * a terrace is one `BuiltBuilding` with `bays` front doors and a player walking
 * the street counts the doors, so a row of six houses is entitled to six houses'
 * worth of masonry rather than one's.
 *
 * A budget rather than a cap: rule 7 hands the *next* edge a bank once the
 * quarter has spent, so what runs out is the marginal wall on the least-pressed
 * face — the edges the town is actually built against are the ones seen first.
 */
export const WALL_COLUMNS_PER_DWELLING = 40;

/** §6.1's metrics, as far as they can be measured from a plan alone. */
export interface Composition {
  readonly quarterColumns: number;
  readonly streetColumns: number;
  readonly naturalColumns: number;
  readonly platformColumns: number;
  readonly naturalFraction: number;
  readonly streetFraction: number;
  readonly platformFraction: number;
  /**
   * Columns of {@link Composition.streetColumns} the carriage spine accounts for
   *
   * **Subtracted from {@link Composition.streetFraction}, which is why it
   * exists.** The open question that section ended on — raise the gate by one
   * spine's worth, or measure net of it — was settled net of it (Kai,
   * 2026-08-07), the bar staying 0.25. So `streetColumns` is every paved column
   * and `streetFraction` is `(streetColumns - spineColumns) / quarterColumns`:
   * the two are deliberately *not* a ratio of each other.
   */
  readonly spineColumns: number;
  readonly spineFraction: number;
}

/**
 * Measure a drawn plan's composition (§6.1).
 *
 * The street raster and the sidewalk dilation are the **same two constructions**
 * `layDistrict` performs below, in the same order — which is why this can run
 * before the district is built and still describe the district that will be
 * built.
 */
export function compositionOf(plan: FormPlan, bounds: Rect, sidewalkWidth: number): Composition {
  const grid = new Grid(bounds);
  const carriageway = new Uint8Array(grid.cells);
  for (const cell of carriagewayCells(plan.graph, bounds)) {
    const k = grid.index(cell.x, cell.z);
    if (k >= 0) carriageway[k] = 1;
  }
  const verge = dilateMask(carriageway, grid.width, grid.depth, sidewalkWidth);
  // The spine's own share, by the same two constructions over its own segments.
  const spineWay = new Uint8Array(grid.cells);
  const spineOnly = { ...plan.graph, segments: plan.graph.segments.filter((s) => s.role === "cart") };
  for (const cell of carriagewayCells(spineOnly, bounds)) {
    const k = grid.index(cell.x, cell.z);
    if (k >= 0) spineWay[k] = 1;
  }
  const spineVerge = dilateMask(spineWay, grid.width, grid.depth, sidewalkWidth);
  const levels = groundLevelsOf(bounds, plan.benches ?? []);
  let street = 0;
  let natural = 0;
  let platform = 0;
  let spine = 0;
  for (let k = 0; k < grid.cells; k++) {
    const paved = carriageway[k] === 1 || verge[k] === 1;
    if (paved && (spineWay[k] === 1 || spineVerge[k] === 1)) spine++;
    const onPlatform =
      levels !== null && levels.at(grid.x(k), grid.z(k)) !== NO_PLATFORM;
    if (paved) street++;
    if (onPlatform) platform++;
    if (!paved && !onPlatform) natural++;
  }
  const n = grid.cells;
  return {
    quarterColumns: n,
    streetColumns: street,
    naturalColumns: natural,
    platformColumns: platform,
    naturalFraction: natural / n,
    // Net of the spine: see COMPOSITION_GATES.streetFraction. `Math.max` is
    // belt and braces — every spine column is a paved column by construction.
    streetFraction: Math.max(0, street - spine) / n,
    platformFraction: platform / n,
    spineColumns: spine,
    spineFraction: spine / n,
  };
}

/** How many of {@link COMPOSITION_GATES} this composition clears. */
function gatesPassed(c: Composition): number {
  return (
    (c.naturalFraction >= COMPOSITION_GATES.naturalFraction ? 1 : 0) +
    (c.streetFraction <= COMPOSITION_GATES.streetFraction ? 1 : 0)
  );
}

/** One rung: what was asked for, and what came back. */
interface Rung {
  readonly attempt: PlanAttempt;
  readonly drawn: FabricResult;
  readonly composition: Composition | null;
}

/** A plan, the rounds it took, and what to say about the ones that failed. */
export interface PlannedQuarter {
  readonly drawn: FabricResult;
  readonly rounds: number;
  readonly composition: Composition | null;
  /** `[message, fix]` for a `SITE_COMPOSITION` note, or null when none is due. */
  readonly note: readonly [string, string] | null;
}

/**
 * Draw a quarter, and **replan it smaller if its composition fails a gate**
 *
 * > A district that fails a hard gate replans smaller. It never ships the
 * > failing composition, and it never grows to fix one.
 *
 * The ladder is `dropStreets = 0, 1, 2` — a ceiling of four principal streets,
 * then three, then two — and it stops at the **first** rung that clears both
 * gates. The rung that is dropped each time is by construction the street
 * commanding the least frontage, because selection is greedy on that score.
 *
 * Two things it deliberately does **not** do, both amendments this package
 * records in the document:
 *
 * - It does not ladder any form but `hillside`. The gate is `plan.strips`, so a
 *   `grid` or a `grown` quarter — and a `hillside` that fell back to one — is
 *   drawn exactly once, with exactly today's arguments.
 * - **Exhausting the ladder does not fall back to `grown`.** §6.3 step 4 says it
 *   does; §6.2 says in the same breath that these thresholds are calibrated at
 *   WP-5 from a world Kai has accepted, and §11.5 names "over-tight gates turn
 *   every hill town into `grown`" as a risk of exactly this ordering. Until the
 *   thresholds are measured rather than quoted, a ladder that abandons the plan
 *   would abandon it on a number nobody has confirmed — including on the
 *   accepted WP-0 prototype, which misses `streetFraction` by five thousandths.
 *   So the best rung ships and the miss is reported in the author's terms.
 */
export function planQuarter(request: FabricRequest, sidewalkWidth: number): PlannedQuarter {
  const rungs: Rung[] = [];
  for (let round = 0; round < MAX_REPLAN_ROUNDS; round++) {
    const attempt: PlanAttempt = { round, dropStreets: round, narrowBy: 0 };
    const drawn = drawFabric({ ...request, attempt });
    if (!drawn.ok) return { drawn, rounds: round + 1, composition: null, note: null };
    const plan = drawn.outcome.plan;
    // Not a planned quarter: one draw, today's arguments, nothing measured.
    if (plan.strips === undefined) {
      return { drawn, rounds: round + 1, composition: null, note: null };
    }
    const composition = compositionOf(plan, request.bounds, sidewalkWidth);
    rungs.push({ attempt, drawn, composition });
    if (gatesPassed(composition) === 2) {
      return { drawn, rounds: rungs.length, composition, note: null };
    }
  }
  // Nobody passed. Take the best composition by a total order — gates cleared,
  // then the most hillside left, then the least road — and say what it missed.
  // Ties break on the earlier round, which is the larger town.
  const best = rungs.reduce((a, b) => (better(b.composition!, a.composition!) ? b : a));
  const c = best.composition as Composition;
  const missed: string[] = [];
  if (c.naturalFraction < COMPOSITION_GATES.naturalFraction) {
    missed.push(
      `${(c.naturalFraction * 100).toFixed(1)}% of it is uncut hillside where the plan asks for ${COMPOSITION_GATES.naturalFraction * 100}%`,
    );
  }
  if (c.streetFraction > COMPOSITION_GATES.streetFraction) {
    missed.push(
      `${(c.streetFraction * 100).toFixed(1)}% of it is road other than the carriage spine, where the plan asks for at most ${COMPOSITION_GATES.streetFraction * 100}%`,
    );
  }
  return {
    drawn: best.drawn,
    rounds: rungs.length,
    composition: c,
    note: [
      `"${request.nodePath}" was planned ${rungs.length} time(s), down to ${MAX_PRINCIPAL_STREETS - best.attempt.dropStreets} principal street(s), and the best of them is still more engineering than town: ${missed.join(", and ")}`,
      `Move the quarter onto a broader, gentler slope with a "zone" constraint, or give it a smaller footprint so it sits across fewer contours.`,
    ],
  };
}

/** §6.3's total order over compositions: gates, then hillside, then road. */
function better(a: Composition, b: Composition): boolean {
  const ga = gatesPassed(a);
  const gb = gatesPassed(b);
  if (ga !== gb) return ga > gb;
  if (a.naturalFraction !== b.naturalFraction) return a.naturalFraction > b.naturalFraction;
  return a.streetFraction < b.streetFraction;
}
