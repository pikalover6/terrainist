/**
 * `hillside` — the town generates the terraces it needs
 * (`docs/SITE-PLAN-v0.md` §3).
 *
 * **WP-1, the planner proper (§9); WP-0's prototype measured and kept.**
 * `terraced` cuts its bench field over the *entire* quarter, because the bench
 * index is a function of height and every column has a height; the quantity of retaining work therefore scales with the
 * relief of the hill rather than with the size of the town, and a walked hill
 * town came out as 24 320 columns of cut platform holding seven houses. This
 * form inverts the vertical half of "the void defines the solid":
 *
 * > On sloped ground, level ground is not the residue of anything. It is the
 * > scarcest resource in the quarter and it must be allocated to a use before it
 * > is cut.
 *
 * So: choose two to four **principal contour streets** for the *town*, scored by
 * the developable frontage they command and by nothing else (§3.3); grow a
 * buildable strip beside each, sized from lot depth and pinched out where the
 * ground steepens (§3.4); cut a platform for **those strips only** (§3.5); and
 * leave everything else natural slope (§3.6). A station that cannot hold its own
 * street and one column of standing room lays no street, which is what makes
 * `walkBack`'s `offPlatform` unrepresentable rather than counted-and-survived.
 *
 * **Determinism.** No random draw of any kind. Every choice is a total order
 * over measured quantities or a fixed constant, and every tie breaks on the
 * larger score, then the lower elevation, then the row-major index of the first
 * cell (§3.1). `seed` is carried only so the lot walk downstream can reach the
 * coverage draws that already exist. `Math.sqrt` is the only non-integer
 * operation and IEEE-754 requires it to be correctly rounded, so it is a
 * function of its argument on every runtime.
 *
 * **What this still does not build**, each named rather than quietly skipped:
 *
 * - **Civic ground (§3.6).** `params.plaza` and `FormReservation` do not reach
 *   `FormContext`, so no civic platform is cut.
 * - **Merge (§3.7).** The pair rule is implemented as its conservative arm only:
 *   where two strips come within `MIN_STRIP_SEPARATION`, the **lower** gives its
 *   columns back. Merging upward into one platform is still open.
 * - **§3.7's narrow arm as a feasibility response.** Measured to be a no-op and
 *   argued so where the steep regime is handled below: `D_target` is an upper
 *   bound on a claim the terrace-rise test has already cut short, so narrowing
 *   lowers scores and never raises one. `narrowBy` is honoured as §6.3's
 *   composition lever and nothing else.
 * - **One bench per *street*, not per strip.** §3.5 says one platform per strip;
 *   both strips of a street are at the same elevation `e` and the carriageway
 *   between them must stand on the same platform or the road runs on natural
 *   ground, so the two strips and their carriageway are declared as one
 *   `FormBench`. Nothing downstream can tell the difference — `groundLevelsOf`
 *   resolves a platform index per column and two platforms at one Y take part in
 *   no seam anyway — and it removes a seam that would have to be declared and
 *   then found to be nothing.
 */

import type { DistrictDensity } from "@terrainist/spec";

import { headingOf, type Point2 } from "../frames.js";
import { RETAIN_MAX } from "../levels.js";
import { maskRuns } from "../masks.js";
import type { StreetSegment } from "../streets.js";

import { MIN_CLIPPED_RUN, STREET_WIDTH, densify4, intersectionsOf } from "./axial.js";
import {
  DIAGONAL,
  boxBlur,
  branchesOf,
  componentsOf,
  dilateMask,
  flightFrom,
  linkComponents,
} from "./contour-lines.js";
import {
  ROUND_ZERO,
  drewAsAsked,
  type FormBench,
  type FormContext,
  type FormResult,
  type FormStrip,
  type UrbanForm,
} from "./types.js";

/* -------------------------------------------------------------------------- */
/* §3.8 — the constants, verbatim                                              */
/* -------------------------------------------------------------------------- */

/**
 * The tallest step the terrace will cut or fill.
 *
 * Tied to the tallest drop a retaining wall is built for, by the same argument
 * `BENCH_HEIGHT_MAX` already makes: a terrace whose face is taller than any wall
 * we build is a cliff with houses on it. `site-plan-hillside.test.ts` asserts
 * the two cannot drift apart.
 */
export const TERRACE_RISE = RETAIN_MAX;

/** Sol's floor. One contour street is `linear` on a slope. */
export const MIN_PRINCIPAL_STREETS = 2;

/** Sol's ceiling, and what bounds the whole composition. */
export const MAX_PRINCIPAL_STREETS = 4;

/**
 * Deepest strip Sol's band allows, in columns.
 *
 * The band's *floor* was `STRIP_DEPTH_MIN = 16` and is gone: WP-1 measured it to
 * be a target that §3.8 stated as a requirement, and the floor that actually
 * refuses a station is {@link minStripDepth}. Keeping a second, higher floor
 * would only clamp `narrowBy` — §6.3's composition lever — back up to a depth
 * the ground may not hold.
 */
export const STRIP_DEPTH_MAX = 28;

/**
 * The shortest side the grammar will build on — `district.ts`'s
 * `MIN_INFILL_SIDE`, restated for the reason `terraced` restates its own floors:
 * a form sits upstream of `district.ts`.
 */
export const MIN_BUILDABLE_DEPTH = 7;

/** The column the rear transition stands on. */
export const REAR_MARGIN = 1;

/**
 * Shallowest claim a station keeps, **measured from the carriageway edge** —
 * the same datum `D_target` is measured from.
 *
 * `docs/SITE-PLAN-v0.md` §3.8 wrote this as the constant 8, being
 * `MIN_INFILL_SIDE` (7) plus one for the rear boundary. That silently mixed two
 * datums (WP-0 finding 2): `D_target` and this floor are counted from the
 * **carriageway edge**, while `MIN_INFILL_SIDE` is a depth the grammar measures
 * back from the **build-to line**, and the two differ by the sidewalk. A station
 * that cleared the constant 8 with a two-column verge therefore handed the
 * frontage walk six buildable columns, and the walk dropped the lot — a rule
 * that passes and then produces nothing is worse than a rule that refuses.
 *
 * So the floor carries the verge it has to pay for. At `sidewalk = 2` it is 10,
 * and a station that clears it yields a lot the grammar keeps.
 */
export function minStripDepth(sidewalk: number): number {
  return sidewalk + MIN_BUILDABLE_DEPTH + REAR_MARGIN;
}

/**
 * Radius of the platform closing (see `smoothTerrace`), in columns.
 *
 * Two: `MIN_STRIP_SEPARATION` is four, so a notch this fills is one no strip
 * pair could have been keeping apart, and four columns is the widest gap the
 * measured claims left in a terrace's own edge.
 */
const CLOSE_RADIUS = 2;

/**
 * Radius of the platform opening (see `smoothTerrace`), in columns.
 *
 * One, and deliberately smaller than {@link CLOSE_RADIUS}: the spurs measured
 * are two columns wide, and an opening is the one morphological operator that
 * takes ground *away* from a terrace, so it is given the smallest element that
 * does the job.
 */
const OPEN_RADIUS = 1;

/** Below this the two faces interfere and neither has room for a treatment. */
export const MIN_STRIP_SEPARATION = 4;

/** A performance bound on the candidate sweep, not a design choice. */
export const MAX_CANDIDATE_LEVELS = 64;

/** Half-width of the box blur applied to the height field, in columns (§3.2). */
const SMOOTH_RADIUS = 2;

/** How many times the blur is applied (§3.2). */
const SMOOTH_PASSES = 2;

/** Target frontage per lot — `district.ts`'s `LOT_FRONTAGE`, restated (§3.8). */
const LOT_FRONTAGE: Readonly<Record<DistrictDensity, number>> = Object.freeze({
  high: 13,
  medium: 15,
  low: 19,
});

/** Lot depth back from the build-to line — `district.ts`'s `LOT_DEPTH`. */
const LOT_DEPTH: Readonly<Record<DistrictDensity, number>> = Object.freeze({
  high: 17,
  medium: 16,
  low: 15,
});

/** Two lots. One lot is a building, not a terrace. */
function minStripRun(density: DistrictDensity): number {
  return 2 * (LOT_FRONTAGE[density] as number);
}

/** A street shorter than two blocks of buildable frontage is not a street. */
function minStreetScore(blockSize: number): number {
  return 2 * blockSize;
}

/** Most candidate paths taken per elevation. A bound on the BFS, not a choice. */
const BRANCHES_PER_LEVEL = 2;


/* -------------------------------------------------------------------------- */
/* the form                                                                    */
/* -------------------------------------------------------------------------- */

/** The `hillside` form. */
export const HILLSIDE_FORM: UrbanForm = {
  id: "hillside",
  requires: {
    minSpan: 48,
    // §7.2. A flat or near-flat quarter cannot select this form: the registry
    // refuses before `draw` is called and the announced fallback is drawn, which
    // is what makes flat byte-identity structural rather than a test result.
    minRelief: 2 * TERRACE_RISE,
    unlevelled: true,
    polygon: true,
    fallback: "grown",
  },
  describe:
    "A hill town that generates the terraces it needs: two to four principal streets chosen along the contours for the buildable frontage they command, a strip of level ground cut beside each and nowhere else, lots walked off the frontage, and the rest of the hillside left as hillside.",
  draw,
};

function draw(ctx: FormContext): FormResult {
  const { bounds } = ctx;
  const width = bounds.x1 - bounds.x0 + 1;
  const depth = bounds.z1 - bounds.z0 + 1;
  const cells = width * depth;
  const at = (x: number, z: number): number => (z - bounds.z0) * width + (x - bounds.x0);
  const pointOf = (k: number): Point2 => ({
    x: bounds.x0 + (k % width),
    z: bounds.z0 + Math.floor(k / width),
  });
  const masked = (k: number): boolean => ctx.mask === undefined || ctx.mask[k] === 1;
  const inside = (p: Point2): boolean =>
    p.x >= bounds.x0 &&
    p.x <= bounds.x1 &&
    p.z >= bounds.z0 &&
    p.z <= bounds.z1 &&
    masked(at(p.x, p.z));

  /* --- S1: the field (§3.2) ---------------------------------------------- */
  const field = new Float64Array(cells);
  for (let z = bounds.z0; z <= bounds.z1; z++) {
    for (let x = bounds.x0; x <= bounds.x1; x++) field[at(x, z)] = ctx.ground.height(x, z);
  }
  const smooth = boxBlur(field, width, depth, SMOOTH_RADIUS, SMOOTH_PASSES);
  let base = Number.POSITIVE_INFINITY;
  let top = Number.NEGATIVE_INFINITY;
  for (let k = 0; k < cells; k++) {
    if (!masked(k)) continue;
    const h = Math.round(smooth[k] as number);
    if (h < base) base = h;
    if (h > top) top = h;
  }
  if (base === Number.POSITIVE_INFINITY) {
    return {
      ok: false,
      reason:
        "no column of this quarter is inside its own cell, so there is no ground to read contours off",
      fix: "nothing to change in the document: a cell this thin is dropped and its ground is left for the ground treatment pass",
      fallback: "grown",
    };
  }
  const relief = top - base;
  if (relief < 2 * TERRACE_RISE) {
    return {
      ok: false,
      reason: `after the contour blur the ground under this quarter has ${relief} blocks of relief, and a hill town needs at least ${2 * TERRACE_RISE} — two terraces, one above the other`,
      fix: 'move the quarter onto a slope with a "zone" or "at" constraint, drop "terrain_conform" (a hill town levels itself, one terrace at a time), or write "fabric": "grown" for an unplanned quarter on level ground',
      fallback: "grown",
    };
  }

  /* --- the probe, shared by the score and the claim (§3.3, §3.4) ---------- */
  const half = STREET_WIDTH.street >> 1;
  const sidewalk = ctx.sidewalk;
  const claimStart = half + 1;
  // Which rung of §6.3's ladder this is. Round 0 is the full ceiling at full
  // depth, which is what an unattempted context asks for.
  const attempt = ctx.attempt ?? ROUND_ZERO;
  const streetCap = clamp(
    MAX_PRINCIPAL_STREETS - attempt.dropStreets,
    MIN_PRINCIPAL_STREETS,
    MAX_PRINCIPAL_STREETS,
  );
  // Both floors are counted from the **carriageway edge** — see `minStripDepth`
  // for why that sentence is the whole of WP-0's finding 2.
  const floorDepth = minStripDepth(sidewalk);
  const fullDepth = clamp(
    sidewalk + (LOT_DEPTH[ctx.density] as number) + REAR_MARGIN - attempt.narrowBy,
    floorDepth,
    STRIP_DEPTH_MAX,
  );
  // 1 on a column some earlier strip already claimed. Read by the probe, so a
  // candidate is scored against the ground that is actually still free.
  const claimed = new Uint8Array(cells);

  /**
   * How deep this station can claim on one side, at elevation `e`.
   *
   * Marching perpendicular to the **true line** rather than to the raster — the
   * `SweptProfile` band-membership rule — from the carriageway edge outward,
   * while the column is inside the mask, unclaimed, and within one terrace rise
   * of the level the platform will be cut to.
   */
  const probe = (p: Point2, perp: Point2, sign: number, e: number, dTarget: number): number => {
    let claimable = 0;
    for (let d = claimStart; d < claimStart + dTarget; d++) {
      const x = Math.round(p.x + perp.x * sign * d);
      const z = Math.round(p.z + perp.z * sign * d);
      if (!inside({ x, z })) break;
      const k = at(x, z);
      if (claimed[k] === 1) break;
      if (Math.abs((smooth[k] as number) - e) > TERRACE_RISE) break;
      claimable++;
    }
    return claimable;
  };

  /* --- S2: candidate contour streets (§3.3) ------------------------------ */
  const lo = base + TERRACE_RISE;
  const hi = base + relief - TERRACE_RISE;
  const span = hi - lo + 1;
  const stride = Math.max(1, Math.ceil(span / MAX_CANDIDATE_LEVELS));
  // The **paths** are a property of the ground alone; only their scores depend
  // on how deep a strip is trying to be, so discovery runs once and the steep
  // regime below re-scores rather than re-walks.
  const found: Contour[] = [];
  for (let e = lo; e <= hi; e += stride) {
    const band = new Uint8Array(cells);
    for (let k = 0; k < cells; k++) {
      if (!masked(k)) continue;
      if (Math.abs((smooth[k] as number) - e) <= 1) band[k] = 1;
    }
    // 8-connected: a contour on a lattice is a staircase, and 4-connected
    // grouping here produces the same crumbs it produced in `levelSeams`.
    const components = componentsOf(band, width, depth, DIAGONAL).sort((a, b) =>
      b.length !== a.length ? b.length - a.length : (a[0] as number) - (b[0] as number),
    );
    for (const component of components.slice(0, BRANCHES_PER_LEVEL)) {
      for (const branch of branchesOf(component, width, depth, BRANCHES_PER_LEVEL, DIAGONAL)) {
        const path = densify4(branch.map(pointOf)).filter(inside);
        if (path.length < MIN_CLIPPED_RUN) continue;
        found.push({
          e,
          path,
          normals: normalsOf(path),
          first: at(path[0]!.x, path[0]!.z),
        });
      }
    }
  }

  /* --- selection (§3.3), and what steep ground actually does (§3.7) ------- */
  const floor = minStreetScore(ctx.blockSize);
  let best = 0;
  /** Contours that cleared the score floor on the last pass, chosen or not. */
  let cleared = 0;

  /**
   * Score every contour for a strip of this depth and take the streets, greedy.
   *
   * A pure function of `(found, dTarget)`: it reads `claimed`, which is all
   * zeroes until the first strip is claimed below, and writes nothing outside
   * itself but `best` — the largest score any contour reached, which is the
   * number the refusal has to quote.
   */
  const select = (dTarget: number): Candidate[] => {
    const scored = found.map((c): Candidate => {
      let score = 0;
      const need = floorDepth;
      for (const [i, p] of c.path.entries()) {
        const n = c.normals[i] as Point2;
        if (probe(p, n, 1, c.e, dTarget) >= need || probe(p, n, -1, c.e, dTarget) >= need) score++;
      }
      best = Math.max(best, score);
      return { ...c, score };
    });
    // Ties as §3.1: the larger score, then the lower elevation, then the
    // row-major index of the first cell.
    scored.sort((a, b) =>
      b.score !== a.score ? b.score - a.score : a.e !== b.e ? a.e - b.e : a.first - b.first,
    );
    // Columns within the spacing radius of a chosen street — the rule every
    // other form already uses, applied to contours. **The radius is the lesser
    // of half a block and the reach of a strip**, because those are the two
    // things it is standing in for and a large `blockSize` makes them disagree:
    // spacing two contour streets further apart than either can build is how a
    // quarter comes to refuse with candidates in hand. At `blockSize = 32` and
    // any full-depth strip the reach is the larger, so this is `blockSize / 2`
    // exactly and nothing on a shipped world moves.
    const radius = Math.min(Math.floor(ctx.blockSize / 2), claimStart + dTarget);
    const near = new Uint8Array(cells);
    const taken: Candidate[] = [];
    cleared = 0;
    for (const candidate of scored) {
      if (candidate.score >= floor) cleared++;
      if (taken.length >= streetCap) continue;
      if (candidate.score < floor) continue;
      if (taken.some((c) => Math.abs(c.e - candidate.e) < TERRACE_RISE)) continue;
      let crowded = 0;
      for (const p of candidate.path) if (near[at(p.x, p.z)] === 1) crowded++;
      if (crowded * 2 > candidate.path.length) continue;
      taken.push(candidate);
      paint(near, candidate.path, radius, at, inside);
    }
    return taken;
  };

  // **The steep regime, measured** (§3.7's narrow arm; WP-0 finding 6). That
  // finding reads `STRIP_DEPTH_MIN = 16` as a requirement — "16 columns with a
  // terrace rise of 6 needs ground no steeper than about 1:3, and the walked
  // site is 1:2.5" — and it is a *target*. What refuses a station is
  // `minStripDepth(sidewalk)`, ten columns at `sidewalk = 2`, and ten columns
  // stay inside one terrace rise on any slope gentler than about 1:1.7. So a
  // 1:2.5 quarter plans at full depth and simply claims less: the strips come
  // out irregular and about thirteen deep instead of nineteen, which is the
  // sparse-but-real town the narrow arm was asked for, arrived at by the claim
  // rule that was already there.
  //
  // Narrowing `D_target` **cannot** rescue a quarter that this refuses, and
  // saying so is the point: `D_target` is an upper bound on a claim the
  // terrace-rise test has already cut short, so a narrower target lowers every
  // score and never raises one. Below ten columns there is no lot the grammar
  // will build on (`MIN_INFILL_SIDE` is 7 and the verge is not negotiable), so
  // the floor is the grammar's and not the planner's to trade. `narrowBy`
  // survives as what §6.3 uses it for — a *composition* lever, a shallower
  // terrace that cuts and fills less — and `fullDepth` above honours it.
  const dTarget = fullDepth;
  const chosen = select(dTarget);

  if (chosen.length < MIN_PRINCIPAL_STREETS) {
    // Two different refusals wear one sentence badly. Either no contour
    // commands enough frontage — the measurement §3.3 quotes — or several do
    // and they all lie on one another, which is a quarter that spans one
    // terrace however long its contours are, and says so.
    const reason =
      cleared >= MIN_PRINCIPAL_STREETS
        ? `the "hillside" form lays two to four principal streets along the contours of the ground and builds only beside them; ${cleared} contours here command enough frontage but they all lie within one terrace rise (${TERRACE_RISE} blocks) or half a block in plan of one another, so this quarter spans one terrace however long its contours are`
        : `the "hillside" form lays two to four principal streets along the contours of the ground and builds only beside them; on this ground the best contour commands ${best} columns of buildable frontage and a street needs ${floor}`;
    return {
      ok: false,
      reason,
      fix: 'move the quarter onto a broader, gentler slope with a "zone" or "at" constraint, give it a larger footprint so it spans more of the hillside, or write "fabric": "grown" for an unplanned quarter that climbs the hill without terracing it',
      fallback: "grown",
    };
  }
  // Selection order is score order; emission order is elevation order, so the
  // segment ids and the bench indices climb the hill.
  chosen.sort((a, b) => (a.e !== b.e ? a.e - b.e : a.first - b.first));

  /* --- S3 + S4: strips and platforms (§3.4, §3.5) ------------------------- */
  const segments: StreetSegment[] = [];
  const strips: FormStrip[] = [];
  /** One platform mask per surviving street, and the level it is cut to. */
  const platforms: Uint8Array[] = [];
  const platformLevel: number[] = [];
  const adapted: string[] = [];
  /**
   * Columns that are one street's standing room and must stay platform.
   *
   * §3.4 rule 2's `+1` is what a retaining wall stands on, and it belongs to the
   * **street**, not to the strip that happens to have claimed it as its own
   * build-to column. A strip that dissolves, or a lower strip that retreats from
   * a higher one, gives its ground back to the hillside — and if the street's
   * standing column went with it, `walkBack` steps off the platform crossing its
   * own carriageway and reports `offPlatform`, which §5.5 says is a compiler bug
   * rather than a number. So the ring is remembered and never given back.
   */
  const standingRoom = new Uint8Array(cells);
  const owner = new Int32Array(cells).fill(-1);
  const claim = (index: number, path: readonly Point2[]): void => {
    for (const p of path) {
      if (!inside(p)) continue;
      owner[at(p.x, p.z)] = index;
    }
  };
  /** The platform level a chosen street sits on, by segment index. */
  const streetLevel: number[] = [];
  let dissolved = 0;

  for (const [c, candidate] of chosen.entries()) {
    const { e, path, normals } = candidate;
    // §3.4 rule 1 per side, and rule 2 for the street. A station whose claim is
    // shallower than `minStripDepth(sidewalk)` claims nothing on that side; a
    // station that holds no side lays no street, which is where `offPlatform`
    // is made unrepresentable — the condition `walkBack` discovers eight passes
    // downstream is checked here, while it can still be acted on.
    const depths: [number, number][] = path.map((p, i) => {
      const n = normals[i] as Point2;
      const up = probe(p, n, 1, e, dTarget);
      const down = probe(p, n, -1, e, dTarget);
      return [up >= floorDepth ? up : 0, down >= floorDepth ? down : 0];
    });
    // …and the station must be able to hold the street's **whole
    // cross-section**, standing room included, inside the quarter. A station
    // whose band is sliced by the district edge lays a platform that ends at
    // the boundary with a seam on it and no ground of its own beyond the road
    // for a wall to stand on — `walkBack` crosses the carriageway and steps off
    // the platform, which is the `offPlatform` §5.5 refuses. This is §3.4 rule
    // 2 asked of the *edge* rather than of the slope; the two failures are the
    // same failure and were found the same way (WP-0's control was seated flush
    // against the region boundary and its blocks were sliced by it).
    const whole = path.map((p) => {
      const r = half + sidewalk + 1;
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) if (!inside({ x: p.x + dx, z: p.z + dz })) return false;
      }
      return true;
    });
    const laid = depths.map(([a, b], i) => (a > 0 || b > 0) && whole[i] === true);

    for (const [r, run] of runsWhere(path, laid).entries()) {
      const from = path.indexOf(run[0] as Point2);
      const platform = new Uint8Array(cells);
      const id = `hs${c}_${r}`;
      // **The street band comes off the raster, not off the arithmetic**
      // (§3.4 rule 2; WP-0 finding 5). `carriagewayCells` lays the carriageway
      // as perpendicular offsets about the *local heading*, and `layDistrict`
      // then dilates that raster by the sidewalk width — a ring walk, which on
      // a diagonal run reaches a full column further than `half + sidewalk`
      // says it does. A platform sized by the arithmetic leaves the outermost
      // verge column off the platform, and that column is exactly the
      // `offPlatform` `walkBack` reports four passes later. So the band is
      // built the way the street will actually be built, from the same two
      // functions, and one more ring beyond it is the standing room a retaining
      // wall needs on the platform it holds.
      const paved = streetBand(run, at, inside, masked, cells, width, depth, sidewalk);
      const ring = dilateMask(paved, width, depth, 1);
      for (let k = 0; k < cells; k++) if (ring[k] === 1 && !masked(k)) ring[k] = 0;
      // …**and** a standing margin about every station of the run. The dilated
      // band is the right answer along a straight street and one column short
      // at the **cap** of a run and on the inside of a bend, where the platform
      // edge draws in towards the road and a stair descending from the junction
      // paves the ground just beyond it. `walkBack` crosses road looking for
      // ground of its own to stand on and finds the stair, which is the
      // `offPlatform` §5.5 refuses. The margin is `RETAIN_STREET_CLEARANCE`'s
      // one column measured from the centre line rather than from the raster,
      // so it is generous exactly where the raster is thin.
      for (const p of run) disc(p, half + sidewalk + 1, at, inside, (k) => (ring[k] = 1));
      for (let k = 0; k < cells; k++) {
        if (ring[k] === 1 && paved[k] === 1) ring[k] = 0;
        if (paved[k] === 1 || ring[k] === 1) platform[k] = 1;
      }

      // **The claim is a breadth-first walk out from the street, not a ray per
      // station.** A ray per station aliases on any run that is not axis
      // aligned: adjacent rays diverge and leave unhit columns between them, and
      // the comb that results has almost no inscribed rectangle in it — which is
      // exactly what the frontage walk exists to stop happening. So the walk
      // finds each column's *nearest station*, and the perpendicular distance is
      // then computed **against the true line** from that station's normal,
      // which is the `SweptProfile` band-membership rule (§3.4).
      const nearest = new Int32Array(cells).fill(-1);
      const reach = claimStart + dTarget;
      const queue: number[] = [];
      for (const [i, p] of run.entries()) {
        if (!inside(p)) continue;
        const k = at(p.x, p.z);
        if ((nearest[k] as number) >= 0) continue;
        nearest[k] = from + i;
        queue.push(k);
      }
      const steps = new Int32Array(cells).fill(-1);
      for (const k of queue) steps[k] = 0;
      for (let head = 0; head < queue.length; head++) {
        const k = queue[head] as number;
        const d = steps[k] as number;
        if (d >= reach) continue;
        const i = k % width;
        const j = (k - i) / width;
        for (const [di, dj] of DIAGONAL) {
          const ii = i + di;
          const jj = j + dj;
          if (ii < 0 || jj < 0 || ii >= width || jj >= depth) continue;
          const n = jj * width + ii;
          if ((nearest[n] as number) >= 0 || !masked(n)) continue;
          if (claimed[n] === 1) continue;
          if (Math.abs((smooth[n] as number) - e) > TERRACE_RISE) continue;
          nearest[n] = nearest[k] as number;
          steps[n] = d + 1;
          queue.push(n);
        }
      }

      // **Refine the nearest station, and take the distance from it.** The walk
      // above is 8-connected, so its own distance is Chebyshev and, along a
      // straight run, every station within `|along| <= steps` is equidistant —
      // the tie goes to whichever was enqueued first, which is the wrong end of
      // the street. So the walk is used for *reachability* only, and both the
      // station and the depth then come from the nearest point of the polyline
      // in the plane, ties to the lower index. That is `SweptProfile`'s
      // band-membership rule — perpendicular distance to the true line, never to
      // the raster — and it is also what stops a strip growing a cap of platform
      // twenty columns past the end of its own street.
      const away = new Float64Array(cells).fill(-1);
      for (const k of queue) {
        const st = nearest[k] as number;
        const x = (k % width) + bounds.x0;
        const z = (k - (k % width)) / width + bounds.z0;
        let bestAt = st;
        let bestD = Number.POSITIVE_INFINITY;
        for (let t = Math.max(from, st - reach); t <= Math.min(from + run.length - 1, st + reach); t++) {
          const q = path[t] as Point2;
          const d = (q.x - x) * (q.x - x) + (q.z - z) * (q.z - z);
          if (d < bestD) {
            bestD = d;
            bestAt = t;
          }
        }
        nearest[k] = bestAt;
        away[k] = Math.sqrt(bestD);
      }

      const sides: FormStrip[] = [];
      for (const sign of [1, -1]) {
        const columns = new Uint8Array(cells);
        const station = new Int32Array(cells).fill(-1);
        const back = new Int32Array(cells).fill(-1);
        const held = new Uint8Array(run.length);
        for (const k of queue) {
          const st = nearest[k] as number;
          const n = normals[st] as Point2;
          const p = path[st] as Point2;
          const dx = (k % width) + bounds.x0 - p.x;
          const dz = ((k - (k % width)) / width) + bounds.z0 - p.z;
          // **Which side** is the sign of the projection on the station's
          // normal, which is what the true line says and is stable however the
          // walk broke its ties.
          const proj = dx * n.x + dz * n.z;
          if (Math.sign(proj) !== sign && proj !== 0) continue;
          const perp = away[k] as number;
          // The carriageway and its two verges stand on the platform whatever
          // the side: a road running on natural ground beside a cut terrace is
          // the thing this form exists not to do. Asked of the **raster**, for
          // the reason the band above is built from it.
          if (paved[k] === 1) {
            platform[k] = 1;
            continue;
          }
          const deep = (depths[st] as [number, number])[sign === 1 ? 0 : 1];
          if (deep <= 0) continue;
          if (perp > claimStart + deep - 1) continue;
          columns[k] = 1;
          platform[k] = 1;
          station[k] = st - from;
          back[k] = Math.max(0, Math.round(perp) - (half + sidewalk + 1));
          held[st - from] = 1;

        }
        // **Compact the stations.** The strip's arc length is the frontage it
        // actually holds, not the length of the street it fronts: a station
        // that pinched out claims nothing, and allocating a lot to it would
        // cut a parcel with no ground in it and then drop it. §4.2 allocates by
        // the arc length of the *frontage line*, and this is that line.
        const compact = new Int32Array(run.length).fill(-1);
        const outward: Point2[] = [];
        let stations = 0;
        for (let i = 0; i < held.length; i++) {
          if (held[i] !== 1) continue;
          compact[i] = stations++;
          const n = normals[from + i] as Point2;
          outward.push({ x: n.x * sign, z: n.z * sign });
        }
        for (let k = 0; k < cells; k++) {
          const st = station[k] as number;
          if (st >= 0) station[k] = compact[st] as number;
        }
        // §3.7 dissolve: a strip whose surviving usable frontage is shorter
        // than two lots gives its columns back to natural ground.
        if (stations < minStripRun(ctx.density)) {
          if (stations > 0) dissolved++;
          // Everything but the street's own standing room, which is the
          // street's and not this strip's to give away.
          for (let k = 0; k < cells; k++) if (columns[k] === 1 && ring[k] !== 1) platform[k] = 0;
          continue;
        }
        sides.push({
          street: id,
          index: 0,
          level: e,
          stations,
          station,
          depth: back,
          outward,
          columns,
        });
      }
      // A street with no strip left is not a street: it is a path across a
      // hillside, and this form does not pave those.
      if (sides.length === 0) continue;

      for (const side of sides) {
        for (let k = 0; k < cells; k++) if (side.columns[k] === 1) claimed[k] = 1;
      }
      for (let k = 0; k < cells; k++) if (platform[k] === 1) claimed[k] = 1;

      for (let k = 0; k < cells; k++) if (ring[k] === 1) standingRoom[k] = 1;
      segments.push({ id, kind: "street", width: STREET_WIDTH.street, path: [...run] });
      streetLevel.push(e);
      claim(segments.length - 1, run);
      strips.push(...sides.map((side, n) => ({ ...side, index: strips.length + n })));
      platforms.push(platform);
      platformLevel.push(e);
    }
  }

  if (platforms.length === 0) {
    return {
      ok: false,
      reason:
        "every contour this quarter could build on pinched out before it was two lots long, so no terrace survived",
      fix: 'move the quarter onto a broader, gentler slope with a "zone" or "at" constraint, or write "fabric": "grown" for an unplanned quarter that climbs the hill without terracing it',
      fallback: "grown",
    };
  }
  if (dissolved > 0) adapted.push(`${dissolved} frontage strip(s) dissolved back to natural ground`);

  /* --- S5: connectors (§3.6) ---------------------------------------------- */
  // Stair-alleys every `blockSize` columns of arc, by the steepest-descent walk
  // `terraced` already uses. **A connector never gets a platform**: its ground
  // is the street family's, and the `SweptProfile` tread law grades and steps
  // it. Paving a platform under every stair is how a hillside becomes a
  // staircase of pads.
  const terraceIndex = new Int32Array(cells).fill(-1);
  for (let k = 0; k < cells; k++) {
    if (masked(k)) terraceIndex[k] = Math.floor(((smooth[k] as number) - base) / TERRACE_RISE);
  }
  const principals = segments.length;
  for (let s = 0; s < principals; s++) {
    const segment = segments[s] as StreetSegment;
    const pitch = ctx.blockSize;
    const starts =
      segment.path.length > pitch
        ? Array.from(
            { length: Math.floor((segment.path.length - 1) / pitch) },
            (_, n) => (n + 1) * pitch,
          )
        : [segment.path.length >> 1];
    // Downhill only: a connector runs **between adjacent principal streets**,
    // and the alley from the street above is the same alley as the one from the
    // street below. Throwing one in each direction from every street draws each
    // connection twice and doubles the paving, which is the defect this whole
    // form exists to fix, arriving by a new route.
    for (const sign of [1]) {
      for (const a of starts) {
        const walk = flightFrom(segment.path[a] as Point2, s, {
          smooth,
          owner,
          bench: terraceIndex,
          at,
          inside,
          limit: 4 * ctx.blockSize,
          sign,
          span: Number.POSITIVE_INFINITY,
          // A connector that stalls without reaching another principal street is
          // kept only if it left the terrace it started on — `terraced`'s
          // `keepStalled` rule, unchanged.
          keepStalled: true,
        });
        if (walk === null || walk.length < MIN_CLIPPED_RUN) continue;
        const path = densify4(walk);
        segments.push({
          id: `${sign === 1 ? "dn" : "up"}${s}_${a}`,
          kind: "lane",
          width: STREET_WIDTH.lane,
          path,
          role: "steps",
        });
        claim(segments.length - 1, path);
      }
    }
  }
  linkComponents(segments, { at, inside, owner, pointOf, cells, width, depth, bounds });

  /* --- S6: feasibility, the conservative arm (§3.7) ----------------------- */
  // Where two strips come within `MIN_STRIP_SEPARATION` the two faces interfere
  // and neither has room for a treatment, so the **lower** gives its columns
  // back. (Merging upward into one platform is still open — see the module
  // note.)
  const released = separationRelease(strips, cells, width, depth);
  // A released column is not levelled either: it goes back to natural ground,
  // which is what "gives its columns back" has to mean if it is to mean
  // anything the walk can see.
  const terrace = new Uint8Array(cells);
  const benches: FormBench[] = platforms.map((platform, b) => {
    const mask = Uint8Array.from(platform);
    for (let k = 0; k < cells; k++) if (released[k] === 1 && standingRoom[k] !== 1) mask[k] = 0;
    smoothTerrace(mask, width, depth);
    for (let k = 0; k < cells; k++) if (mask[k] === 1) terrace[k] = 1;
    return { id: `terrace.${b}`, runs: maskRuns(bounds, mask), level: platformLevel[b] as number };
  });
  // **A strip may only offer ground that is on a terrace**, and the terraces are
  // now final: the release took columns back and `smoothTerrace` moved the
  // boundary a little in both directions. A lot grown on a column no bench
  // declares would be seated at its corner's level and stand on natural ground
  // everywhere else, which is a floating building or a buried one — the two
  // findings the physics lint exists to refuse. So the strips are intersected
  // with what was actually cut, after it was cut, rather than before.
  const kept = strips.map((strip) => {
    const columns = Uint8Array.from(strip.columns);
    for (let k = 0; k < cells; k++) if (released[k] === 1 || terrace[k] !== 1) columns[k] = 0;
    return { ...strip, columns };
  });

  /* --- the lot mask: nothing outside a strip may be lotted (§3.6) --------- */
  const lotMask = new Uint8Array(cells);
  for (const strip of kept) {
    for (let k = 0; k < cells; k++) if (strip.columns[k] === 1) lotMask[k] = 1;
  }

  return {
    ok: true,
    plan: {
      graph: { segments, intersections: intersectionsOf(segments), sidewalk: ctx.sidewalk },
      benches,
      strips: kept,
      lotMask,
      record: drewAsAsked("hillside", {
        adapted: [
          `${chosen.length} principal contour street(s) at ${chosen.map((c) => c.e).join(", ")}`,
          `${kept.length} frontage strip(s) ${dTarget} columns deep`,
          ...(attempt.round === 0
            ? []
            : [`replan round ${attempt.round}: at most ${streetCap} principal street(s)`]),
          ...adapted,
        ],
        // The contours decide which way a street runs; an author's angle cannot.
        ignored: ["orientation (contour-led)"],
      }),
    },
  };
}

/* -------------------------------------------------------------------------- */
/* helpers                                                                     */
/* -------------------------------------------------------------------------- */

/** One contour of the field, before it is scored for any particular depth. */
interface Contour {
  readonly e: number;
  readonly path: readonly Point2[];
  readonly normals: readonly Point2[];
  /** Row-major index of the first cell — §3.1's last tiebreak. */
  readonly first: number;
}

/** A contour scored by the developable frontage it commands, and by nothing else. */
interface Candidate extends Contour {
  readonly score: number;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/**
 * The unit normal of the true line at each station.
 *
 * Read over a window rather than between neighbours: a 4-connected raster of a
 * shallow diagonal alternates between two axis steps, so a one-step tangent is
 * one of four directions and the strip beside it comes out as a staircase of
 * rectangles rather than a band.
 */
function normalsOf(path: readonly Point2[]): Point2[] {
  const WINDOW = 4;
  const n = path.length;
  return path.map((_, i) => {
    const a = path[Math.max(0, i - WINDOW)] as Point2;
    const b = path[Math.min(n - 1, i + WINDOW)] as Point2;
    const tx = b.x - a.x;
    const tz = b.z - a.z;
    const len = Math.sqrt(tx * tx + tz * tz);
    if (len === 0) return { x: 0, z: 1 };
    return { x: -tz / len, z: tx / len };
  });
}

/** Maximal runs of a path where a predicate holds, `MIN_CLIPPED_RUN` or longer. */
function runsWhere(path: readonly Point2[], keep: readonly boolean[]): Point2[][] {
  const out: Point2[][] = [];
  let current: Point2[] = [];
  for (const [i, p] of path.entries()) {
    if (keep[i] === true) {
      current.push(p);
      continue;
    }
    if (current.length >= MIN_CLIPPED_RUN) out.push(current);
    current = [];
  }
  if (current.length >= MIN_CLIPPED_RUN) out.push(current);
  return out;
}

/**
 * Take the notches and the spurs off a platform mask, in place — a morphological
 * closing, then an opening.
 *
 * A terrace's boundary is irregular by design: deep where the ground is flat,
 * absent where it steepens, and §3.4 says that irregularity is the feature. A
 * **notch** is not that. It is a few columns of natural ground with cut terrace
 * on either side of them, left where the claim's per-station depth stepped,
 * where a strip's two sides met, or where a released column sat between two that
 * were kept. It reads as nothing on the walk, and downstream it is expensive:
 * `walkBack` steps back from a seam looking for platform to stand a wall on,
 * finds the notch, and reports `offPlatform` — which §5.5 says is a compiler bug
 * rather than a number to be survived. On the steep fixture the notches were
 * eight such columns; closing them is what takes the count to zero.
 *
 * A closing (dilate then erode by the same radius) is chosen over a hole fill
 * because the notches are open — they run out to the hillside — and over a plain
 * dilation because a dilation would *grow* the terrace, which is the one thing
 * this planner exists not to do. A closing adds only what a disc of
 * {@link CLOSE_RADIUS} can reach into and not out of, so a convex boundary is
 * left exactly where it was.
 */
function smoothTerrace(mask: Uint8Array, width: number, depth: number): void {
  const r = CLOSE_RADIUS;
  const grown = Uint8Array.from(mask);
  const ring = dilateMask(mask, width, depth, r);
  for (let k = 0; k < grown.length; k++) if (ring[k] === 1) grown[k] = 1;
  for (let j = 0; j < depth; j++) {
    for (let i = 0; i < width; i++) {
      const k = j * width + i;
      if (grown[k] !== 1) continue;
      let solid = true;
      for (let dj = -r; dj <= r && solid; dj++) {
        for (let di = -r; di <= r; di++) {
          const ii = i + di;
          const jj = j + dj;
          // Outside the footprint is not a hole: a terrace clipped by the
          // quarter's own edge keeps its edge.
          if (ii < 0 || jj < 0 || ii >= width || jj >= depth) continue;
          if (grown[jj * width + ii] !== 1) {
            solid = false;
            break;
          }
        }
      }
      if (solid) mask[k] = 1;
    }
  }
  // …and then take the spurs off. A closing only ever *adds*, so it cannot
  // answer the mirror defect: two or three columns of platform sticking out of
  // a terrace's edge, following the last station of a claim or the first
  // columns of a stair that leaves it. A wall walking back along one of those
  // steps off the terrace within two columns, which is the other half of the
  // measured `offPlatform`. An opening — erode, then dilate the survivors —
  // removes exactly the features thinner than its structuring element and puts
  // every other boundary back where it was. A terrace is ground you can stand a
  // building and a wall on; a two-column spur is neither.
  const core = new Uint8Array(mask.length);
  for (let j = 0; j < depth; j++) {
    for (let i = 0; i < width; i++) {
      const k = j * width + i;
      if (mask[k] !== 1) continue;
      let solid = true;
      for (let dj = -OPEN_RADIUS; dj <= OPEN_RADIUS && solid; dj++) {
        for (let di = -OPEN_RADIUS; di <= OPEN_RADIUS; di++) {
          const ii = i + di;
          const jj = j + dj;
          if (ii < 0 || jj < 0 || ii >= width || jj >= depth) continue;
          if (mask[jj * width + ii] !== 1) {
            solid = false;
            break;
          }
        }
      }
      if (solid) core[k] = 1;
    }
  }
  const back = dilateMask(core, width, depth, OPEN_RADIUS);
  for (let k = 0; k < mask.length; k++) mask[k] = core[k] === 1 || back[k] === 1 ? 1 : 0;
}

/**
 * The finished street: the carriageway raster plus the sidewalk dilated off it.
 *
 * **The same two constructions `layDistrict` uses, in the same order.**
 * `carriagewayCells` lays offsets `−half … width−1−half` perpendicular to the
 * local heading (`headingOf`, which lives in `layout/frames.ts` precisely so
 * this module can read it without a cycle), and `dilate` — `dilateMask`, the one
 * dilation — grows the verge off that raster ring by ring. Two different notions
 * of where a street is, is how a platform ends up half under one.
 */
function streetBand(
  run: readonly Point2[],
  at: (x: number, z: number) => number,
  inside: (q: Point2) => boolean,
  masked: (k: number) => boolean,
  cells: number,
  width: number,
  depth: number,
  sidewalk: number,
): Uint8Array {
  const band = new Uint8Array(cells);
  const w = STREET_WIDTH.street;
  const half = (w - 1) >> 1;
  for (const [i, p] of run.entries()) {
    const heading = headingOf(run, i);
    for (let o = -half; o <= w - 1 - half; o++) {
      const q = { x: p.x + heading.pz * o, z: p.z + heading.px * o };
      if (!inside(q)) continue;
      band[at(q.x, q.z)] = 1;
    }
  }
  const verge = dilateMask(band, width, depth, sidewalk);
  for (let k = 0; k < cells; k++) if (verge[k] === 1 && masked(k)) band[k] = 1;
  return band;
}

/** Every column within Chebyshev `r` of a point, in a fixed order. */
function disc(
  p: Point2,
  r: number,
  at: (x: number, z: number) => number,
  inside: (q: Point2) => boolean,
  hit: (k: number) => void,
): void {
  for (let dz = -r; dz <= r; dz++) {
    for (let dx = -r; dx <= r; dx++) {
      const q = { x: p.x + dx, z: p.z + dz };
      if (!inside(q)) continue;
      hit(at(q.x, q.z));
    }
  }
}

/** Paint a plan-distance halo around a path, for the spacing rule. */
function paint(
  mask: Uint8Array,
  path: readonly Point2[],
  r: number,
  at: (x: number, z: number) => number,
  inside: (q: Point2) => boolean,
): void {
  for (const p of path) disc(p, r, at, inside, (k) => (mask[k] = 1));
}

/**
 * §3.7's pair rule, conservative arm: the columns a **lower** strip gives back
 * because a higher one comes within {@link MIN_STRIP_SEPARATION} of them.
 *
 * Below that separation the two faces interfere and neither has room for a
 * treatment. Only the lower strip retreats: a merged terrace holds its own
 * uphill cut, whereas retreating the upper one would bury the lower's frontage
 * under fill (§3.7).
 */
function separationRelease(
  strips: readonly FormStrip[],
  cells: number,
  width: number,
  depth: number,
): Uint8Array {
  const release = new Uint8Array(cells);
  if (strips.length < 2) return release;
  // Which strip owns a column. Claiming was first-wins, so no column has two.
  const ownerOf = new Int32Array(cells).fill(-1);
  for (const [s, strip] of strips.entries()) {
    for (let k = 0; k < cells; k++) if (strip.columns[k] === 1) ownerOf[k] = s;
  }
  const r = MIN_STRIP_SEPARATION;
  for (let k = 0; k < cells; k++) {
    const mine = ownerOf[k] as number;
    if (mine < 0) continue;
    const level = (strips[mine] as FormStrip).level;
    const i = k % width;
    const j = (k - i) / width;
    for (let dj = -r; dj <= r && release[k] === 0; dj++) {
      for (let di = -r; di <= r; di++) {
        const ii = i + di;
        const jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= width || jj >= depth) continue;
        const other = ownerOf[jj * width + ii] as number;
        if (other < 0 || other === mine) continue;
        if ((strips[other] as FormStrip).level <= level) continue;
        release[k] = 1;
        break;
      }
    }
  }
  return release;
}

