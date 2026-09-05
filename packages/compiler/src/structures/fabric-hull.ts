/**
 * `infra.wall@0`, part zero — **what the wall is drawn round**.
 *
 * ## The defect this file exists to end
 *
 * A walled city's circuit used to be derived from the settlement's *envelope*:
 * `wallJobsOf` and the `structures.fortification` dial both handed the course
 * the quarter's placed **rectangle** — the ground the solver reserved — plus
 * the buildings inside it. But a quarter's fabric does not fill its rectangle.
 * The blocks pack to their own organic footprint somewhere inside it, and the
 * ring stood at `margin` outside the *reservation*, not outside the town. Kai
 * walked Troy (2026-08-11) and found a band of grass between the last houses
 * and the wall wider than the city's whole quarters.
 *
 * The fix is a change of reference frame, and only that. `margin` keeps its
 * meaning — "how much ground between the houses and the wall" — and is measured
 * from **the city's edge**: the hull of what was actually built.
 *
 * ## What counts as "actually built"
 *
 * Two tiers, because they answer different questions.
 *
 * - **Core fabric.** Every building footprint under the precinct. This is the
 *   thing being enclosed and it seeds the hull outright.
 * - **Paved fabric.** Street and arterial carriageway and plaza paving, but
 *   *only where it hugs the core* — a column is fabric when it lies inside the
 *   core hull dilated by {@link FabricExtentInput.margin}. This is what keeps
 *   the old comment on `wallJobsOf` true ("without the quarter's ground the
 *   ring lands in the middle of the street grid, every column is a carriageway
 *   and the whole wall dissolves into one enormous gate"): the peripheral lane
 *   that runs behind the last row of houses is inside the wall, so the wall
 *   stands clear of it. The approach road that shoots off across the envelope
 *   towards the next town is *not* fabric, which is precisely the lawn we are
 *   killing — a convex hull that chased a highway to the region edge would
 *   re-import it.
 *
 * ## Why the hull stays convex (a support hull, as before)
 *
 * The course machinery downstream — `wall-course.ts` — is a 24-direction
 * support hull, and everything about the wall leans on that: the edges land on
 * multiples of 15°, the corners *are* the tower sites, and adding one shed at
 * the edge of town moves at most one edge instead of rotating every one of
 * them. A concave (orthogonal or alpha-shape) hull would follow a coastal
 * crescent's inner curve more tightly, and on such a plan a convex hull does
 * leave some lawn on the concave side — a known, bounded limit, and a far
 * smaller one than the envelope's, which left it on *every* side. Tightening
 * the hull's shape is a separate change to `wall-course.ts`'s own contract; the
 * frame correction is this file, and it is what the walk asked for.
 *
 * So the reduction here is exact rather than approximate: a support hull reads
 * only `max ⟨p, n_k⟩` over the twenty-four directions, so handing the course
 * the twenty-four extreme columns gives bit-for-bit the same polygon as handing
 * it every column of the fabric — for a scan of the precinct rather than an
 * array of a hundred thousand points.
 *
 * ## Determinism
 *
 * A fixed scan order (rects in the given order, `z` then `x` ascending), a
 * strict `>` for the running maximum so the first extreme in that order wins,
 * and no RNG, no clock, no plan. Same fabric in, same twenty-four points out.
 */

import { COURSE_NORMALS, type CoursePoint } from "./wall-course.js";
import { extentOfRects } from "./walls.js";
import type { Rect } from "../layout/frames.js";

/** A rectangular window in world columns. `bounds` shape, restated. */
interface FabricRegion {
  readonly x0: number;
  readonly z0: number;
  readonly width: number;
  readonly depth: number;
}

/**
 * The settlement's paved ground, as the wall step can ask it.
 *
 * One predicate over the plan's region, because that is the shape every
 * surfacing pass already publishes its occupancy in (`roads.roadColumns`,
 * `streets.road`, `plaza.paved` are all row-major masks over it).
 */
export interface FabricField {
  readonly region: FabricRegion;
  /** True on a column the surfacing claimed: street, carriageway, plaza. */
  readonly paved: (x: number, z: number) => boolean;
}

/** Everything {@link fabricExtent} reads. */
export interface FabricExtentInput {
  /**
   * The precinct's placed rectangles — a **clipping window** on the paved
   * field, never a source of extent points.
   *
   * This is the whole frame correction: the reservation still says *which*
   * fabric belongs to this circuit (which is what makes nested circuits work —
   * a citadel's rect clips to the citadel's fabric, the city's to the city's),
   * and it no longer says where the wall goes.
   */
  readonly clip: readonly Rect[];
  /** Buildings the precinct owns. Core fabric, wherever they landed. */
  readonly buildings: readonly Rect[];
  /**
   * The circuit's margin — and, at the same reach, how far outside the core
   * hull paved ground still counts as fabric. One knob, because they are the
   * same judgement: ground a house's own lane's width away from the last house
   * is the town, and ground further out than the wall would stand is not.
   */
  readonly margin: number;
  /** The paved field, when the caller has one. */
  readonly field?: FabricField;
}

/**
 * Below this span, in columns, a fabric hull is not a city edge — it is three
 * sheds — and the envelope is the more honest thing to ring. Mirrors
 * `wall-course.ts`'s `WALL_MIN_SPAN`, restated rather than imported so the two
 * decisions can drift apart if one of them ever needs to.
 */
export const FABRIC_MIN_SPAN = 24;

/**
 * The columns a circuit round this precinct should be drawn outside of.
 *
 * Returns the twenty-four support-extreme columns of the built fabric, or —
 * when there is no fabric worth hulling — the envelope corners the pass was
 * handed before this file existed, which is the old behaviour kept as the
 * degenerate fallback rather than a diagnostic.
 */
export function fabricExtent(input: FabricExtentInput): CoursePoint[] {
  const envelope = (): CoursePoint[] => extentOfRects([...input.clip, ...input.buildings]);
  if (input.buildings.length === 0) {
    // A precinct with nothing built in it: a hamlet the solver never filled, or
    // a quarter that is all plaza. Nothing to hug, so the reservation is the
    // only statement of extent there is.
    return envelope();
  }

  // --- the core hull --------------------------------------------------------
  const support = new Float64Array(COURSE_NORMALS.length).fill(Number.NEGATIVE_INFINITY);
  const argmax: (CoursePoint | undefined)[] = new Array<CoursePoint | undefined>(
    COURSE_NORMALS.length,
  ).fill(undefined);
  const fold = (p: CoursePoint): void => {
    for (let k = 0; k < COURSE_NORMALS.length; k++) {
      const n = COURSE_NORMALS[k] as { nx: number; nz: number };
      const h = n.nx * p.x + n.nz * p.z;
      if (h > (support[k] as number)) {
        support[k] = h;
        argmax[k] = p;
      }
    }
  };
  for (const p of extentOfRects(input.buildings)) fold(p);

  // --- the paved ground that hugs it ---------------------------------------
  // Snapshot the core hull first: acceptance is tested against *it*, not
  // against the hull as it grows, so the answer cannot depend on scan order.
  const field = input.field;
  if (field !== undefined && input.clip.length > 0) {
    const core = Float64Array.from(support);
    const reach = Math.max(0, input.margin);
    const { x0, z0, width, depth } = field.region;
    for (const rect of input.clip) {
      const xa = Math.max(rect.x0, x0);
      const xb = Math.min(rect.x1, x0 + width - 1);
      const za = Math.max(rect.z0, z0);
      const zb = Math.min(rect.z1, z0 + depth - 1);
      for (let z = za; z <= zb; z++) {
        for (let x = xa; x <= xb; x++) {
          if (!field.paved(x, z)) continue;
          if (!withinReach(core, x, z, reach)) continue;
          fold({ x, z });
        }
      }
    }
  }

  const points: CoursePoint[] = [];
  const seen = new Set<string>();
  for (const p of argmax) {
    if (p === undefined) continue;
    const key = `${p.x},${p.z}`;
    if (seen.has(key)) continue;
    seen.add(key);
    points.push(p);
  }

  // --- degeneracy ----------------------------------------------------------
  // A fabric too small to ring: the course pass would decline it and the world
  // would lose a wall an author or a dial explicitly asked for. Fall back to
  // the envelope, which is the frame this file replaced — a small lawn round a
  // hamlet beats no circuit at all.
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }
  if (maxX - minX < FABRIC_MIN_SPAN || maxZ - minZ < FABRIC_MIN_SPAN) return envelope();
  return points;
}

/** True when `(x, z)` is inside every one of the core half-planes, plus reach. */
function withinReach(core: Float64Array, x: number, z: number, reach: number): boolean {
  for (let k = 0; k < COURSE_NORMALS.length; k++) {
    const n = COURSE_NORMALS[k] as { nx: number; nz: number };
    if (n.nx * x + n.nz * z > (core[k] as number) + reach) return false;
  }
  return true;
}
