/**
 * Courtyard blocks — the introverted block (Phase 4.2, WP-C).
 *
 * is normative and this module is its
 * layout half; `structures/courtyards.ts` is the other half.
 *
 * Today a block is a **ring of buildings around leftover**: `subdivide` cuts the
 * street-facing perimeter into lots, builds on them, and calls the middle a
 * courtyard by which it means nothing happens there. An old quarter inverts
 * that. The buildings *enclose* a shared interior, the interior is a real place
 * — a well, a tree, washing lines — and you reach it through an arched passage
 * cut under a building. The street wall is unbroken, which is why a medina reads
 * completely differently from outside than from within.
 *
 * Almost all of that is already built (§4.1): at `high` density the coverage is
 * 1 and the side gap is 0, so all four faces already build continuous terraces
 * sharing party walls; the terrace grammar already builds a blind rear
 * elevation; `TERRACE_PASSAGE` already cuts a three-column gap; and the corner
 * unit — quoined pier, raised parapet, real windows, finial lamp — already
 * exists and is already triggered by `cornerStart` / `cornerEnd`.
 *
 * So what this module does is four things and no more:
 *
 * 1. **choose** which blocks close ({@link planCourtyard});
 * 2. **close the gaps that are not the passage** — a face with no street behind
 *    it still gets a range, and that range faces *inward*;
 * 3. **decide where the passage is** rather than getting one by accident, as a
 *    preferred cut column handed to the terrace cutter;
 * 4. hand `structures/courtyards.ts` the geometry it needs — the core to furnish
 *    and the gaps to roof — as {@link CourtyardBlock} records on the district
 *    product.
 *
 * ## Determinism
 *
 * The selection draw is **positional and keyed on the block's own min corner**,
 * exactly as `TERRACE_COVERAGE` is, so adding a landmark elsewhere in the
 * quarter leaves every other block's decision unchanged. Nothing here is keyed
 * on a counter or on an index into a list of blocks.
 *
 * ## The v0 guard, and why it is not fastidiousness
 *
 * `blocksOf` reduces every block to its largest inscribed axis-aligned
 * rectangle (§9.1). On a `grown`, `radial` or `organic` block the ragged margin
 * outside that rectangle is not subdivided — wasteful today, and *visible* the
 * moment a perimeter is supposed to be closed, because the perimeter closes
 * around the rectangle and the margin is an open hole in it. {@link
 * COURTYARD_FILL} is the v0 guard: a block whose inscribed rectangle is not most
 * of the block cannot hold a courtyard. The real fix is the polygon lot cutter,
 * which is out of scope here as it was in Phase 4.1.
 */

import { positionFloat, type Seed256 } from "@terrainist/stdlib";
import type { DistrictDensity, HorizontalFace } from "@terrainist/spec/ir";

import type { Rect } from "./frames.js";

/**
 * Smallest core, on both axes, that reads as a *place* rather than as a light
 * well. Nine columns holds a well, a tree, and room to stand around them; below
 * that it is the gap `TERRACE_PASSAGE` already gives you.
 */
export const MIN_COURT_SIDE = 9;

/**
 * How much of a block its inscribed rectangle has to be. See this module's
 * header, and §9.1 — this is the guard, not a taste.
 */
export const COURTYARD_FILL = 0.8;

/**
 * The most any density will close, before `params.courtyards` scales it.
 *
 * `low` is zero and reads as never: a village is detached houses in gardens,
 * and the gardens *are* the interior.
 */
export const COURTYARD_CEILING: Readonly<Record<DistrictDensity, number>> = Object.freeze({
  high: 1,
  medium: 0.8,
  low: 0,
});

/** Headroom under the passage arch, in blocks — one storey. */
export const PASSAGE_HEAD = 4;

/** Why one block was not selected. Exactly one reason per block, in §4.2 order. */
export type CourtyardReject = "share" | "density" | "perimeter" | "core" | "fill" | "draw";

/** The four sides, in the fixed order the subdivision walks them. */
const SIDES: readonly HorizontalFace[] = Object.freeze([
  "north",
  "south",
  "west",
  "east",
] as const);

/** The face opposite `face`. */
function opposite(face: HorizontalFace): HorizontalFace {
  switch (face) {
    case "north":
      return "south";
    case "south":
      return "north";
    case "west":
      return "east";
    default:
      return "west";
  }
}

/** What {@link planCourtyard} decided for one block. */
export interface CourtyardPlan {
  /** The enclosed interior: the block's rectangle inset by one lot depth. */
  readonly core: Rect;
  /** The faces that carry a passage, in {@link SIDES} order. One or two. */
  readonly passageFaces: readonly HorizontalFace[];
  /**
   * Where the terrace cutter should prefer to cut, per face: the world column
   * (x for a north/south face, z for an east/west one) nearest the middle of
   * that face. The gap it opens *is* the passage.
   */
  readonly preferAt: ReadonlyMap<HorizontalFace, number>;
}

/** One passage through a courtyard block's perimeter, as the fabric cut it. */
export interface CourtyardPassage {
  /** Index of the block in the district's own block list. */
  readonly block: number;
  /** Which side of the block it pierces. */
  readonly face: HorizontalFace;
  /**
   * The gap itself: `TERRACE_PASSAGE` columns across the face, spanning the
   * full depth of the strip. This is ground with nothing built on it, flanked
   * by two terrace ends that were planned as corners.
   */
  readonly rect: Rect;
}

/** One courtyard block, as the district product carries it. */
export interface CourtyardBlock {
  readonly block: number;
  /** The block's inscribed rectangle — the whole of what was subdivided. */
  readonly rect: Rect;
  /** The enclosed interior the structure pass furnishes. */
  readonly core: Rect;
  /** The passages the fabric actually cut. Usually one; two on a long block. */
  readonly passages: readonly CourtyardPassage[];
  /**
   * The dominant archetype of the ranges around it, when the mix named one.
   * The interior treatment is chosen from this via `treatmentOf` (§4.5), so a
   * block of chapels gets a cloister and a block of warehouses gets a yard
   * without anybody writing it down.
   */
  readonly archetype?: string;
}

/** Everything {@link planCourtyard} reads. */
export interface CourtyardPlanInput {
  /** The block's inscribed rectangle. */
  readonly rect: Rect;
  /** Columns in the block's connected component — the denominator of §4.2.3. */
  readonly columns: number;
  readonly density: DistrictDensity;
  /** `params.courtyards`, after the intent fan-out. 0 disables the feature. */
  readonly share: number;
  /** The lot depth this block's subdivision settled on. */
  readonly depth: number;
  /** `subdivide`'s own `perimeter` test: the block is thick enough for two rows. */
  readonly perimeter: boolean;
  /** The sides that have a street behind them. Empty is impossible here. */
  readonly fronts: ReadonlySet<HorizontalFace>;
  /** The face `bestSide` chose — the first, in side order, with a street. */
  readonly primary: HorizontalFace;
  /** `TERRACE_MAX_FRONTAGE[density]`, for the two-passage test. */
  readonly maxFrontage: number;
  /** The district's positional stream. Never a counter. */
  readonly stream: Seed256;
}

/** A block that will not close, and the one measurement that says so. */
export interface CourtyardRefusal {
  readonly rejected: CourtyardReject;
}

/**
 * Decide whether one block closes around a courtyard, and where its passage is.
 *
 * §4.2's four criteria, in order, each of them a number the pass already has,
 * and the first that fails is the reason reported — so a `COURTYARD_NONE`
 * diagnostic can name the measurement that failed rather than shrugging.
 */
export function planCourtyard(input: CourtyardPlanInput): CourtyardPlan | CourtyardRefusal {
  const { rect, density, depth } = input;
  const ceiling = COURTYARD_CEILING[density];

  // 0. The feature is off, or the density says never. Not a rejection anybody
  //    can act on, but it is counted separately so the diagnostic can tell
  //    "your village asked for a medina" from "your blocks are too small".
  if (input.share <= 0) return { rejected: "share" };
  if (ceiling <= 0) return { rejected: "density" };

  // 1. A perimeter block. A block too thin for two opposite strips has no core.
  if (!input.perimeter) return { rejected: "perimeter" };

  // 2. The core is a *place*: at least MIN_COURT_SIDE on both axes once all
  //    four strips are cut. Note that all four are cut for a courtyard block
  //    even where there is no street — §4.3 — so the inset is symmetric and
  //    this is the honest measurement rather than an optimistic one.
  const core: Rect = {
    x0: rect.x0 + depth,
    z0: rect.z0 + depth,
    x1: rect.x1 - depth,
    z1: rect.z1 - depth,
  };
  const coreW = core.x1 - core.x0 + 1;
  const coreD = core.z1 - core.z0 + 1;
  if (coreW < MIN_COURT_SIDE || coreD < MIN_COURT_SIDE) return { rejected: "core" };

  // 3. The inscribed rectangle is most of the block. §9.1, and this module's
  //    header: an unclosed perimeter is a courtyard with a hole in it.
  const area = (rect.x1 - rect.x0 + 1) * (rect.z1 - rect.z0 + 1);
  if (input.columns > 0 && area < COURTYARD_FILL * input.columns) return { rejected: "fill" };

  // 4. The positional draw, keyed on the block's own min corner.
  if (positionFloat(input.stream, rect.x0, 7, rect.z0) >= input.share * ceiling) {
    return { rejected: "draw" };
  }

  // The passage goes on the block's primary face — the first side, in the fixed
  // order, that has a street behind it — at the terrace cut nearest the middle
  // of that face. A second passage on the opposite face when the perimeter is
  // long enough that one way in reads as a siege (§4.4).
  const perimeterLength = 2 * (rect.x1 - rect.x0 + 1 + (rect.z1 - rect.z0 + 1));
  const faces: HorizontalFace[] = [input.primary];
  if (input.maxFrontage > 0 && perimeterLength > 2 * input.maxFrontage) {
    const other = opposite(input.primary);
    if (input.fronts.has(other)) faces.push(other);
  }
  faces.sort((a, b) => SIDES.indexOf(a) - SIDES.indexOf(b));

  const preferAt = new Map<HorizontalFace, number>();
  for (const face of faces) {
    const along = face === "north" || face === "south";
    preferAt.set(face, along ? midpoint(rect.x0, rect.x1) : midpoint(rect.z0, rect.z1));
  }

  return { core, passageFaces: faces, preferAt };
}

/** True when a plan was returned rather than a refusal. */
export function isCourtyardPlan(
  result: CourtyardPlan | CourtyardRefusal,
): result is CourtyardPlan {
  return (result as CourtyardPlan).core !== undefined;
}

/** The middle column of an inclusive span, floored so it is order-independent. */
function midpoint(lo: number, hi: number): number {
  return lo + Math.floor((hi - lo) / 2);
}

/**
 * Where to cut a run of lots so the gap lands nearest a preferred column.
 *
 * The terrace cutter walks a run accumulating frontage and cuts when the cap is
 * reached; a courtyard block instead asks for a cut *here*, and gets it by
 * splitting the run at the lot boundary nearest `preferAt`. Returns the index
 * of the first lot of the second part, or `null` when the run cannot be split
 * into two parts of at least `minLots` each — in which case the block simply
 * gets no passage on that face and the pass says so rather than opening a hole
 * somewhere arbitrary.
 *
 * Ties break low, which is what makes this a pure function of the run.
 */
export function splitIndexNearest(
  starts: readonly number[],
  preferAt: number,
  minLots: number,
): number | null {
  let best: number | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let i = minLots; i <= starts.length - minLots; i++) {
    const at = starts[i] as number;
    const d = Math.abs(at - preferAt);
    if (d < bestDistance) {
      bestDistance = d;
      best = i;
    }
  }
  return best;
}
