/**
 * `hillside` — the town generates the terraces it needs
 * (`docs/SITE-PLAN-v0.md` §3).
 *
 * **WP-0, the Phase-1 prototype (§8).** `terraced` cuts its bench field over the
 * *entire* quarter, because the bench index is a function of height and every
 * column has a height; the quantity of retaining work therefore scales with the
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
 * **What WP-0 does not build**, each named rather than quietly skipped:
 *
 * - **Civic ground (§3.6).** `params.plaza` and `FormReservation` do not reach
 *   `FormContext`, so no civic platform is cut. WP-1.
 * - **Merge (§3.7).** The pair rule is implemented as its conservative arm only:
 *   where two strips come within `MIN_STRIP_SEPARATION`, the **lower** gives its
 *   columns back. Merging upward into one platform is WP-1.
 * - **The replan ladder (§6.3).** One attempt, round 0. WP-4.
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

import type { Point2 } from "../frames.js";
import { RETAIN_MAX } from "../levels.js";
import { maskRuns } from "../masks.js";
import type { StreetSegment } from "../streets.js";

import { MIN_CLIPPED_RUN, STREET_WIDTH, densify4, intersectionsOf } from "./axial.js";
import {
  DIAGONAL,
  boxBlur,
  branchesOf,
  componentsOf,
  flightFrom,
  linkComponents,
} from "./contour-lines.js";
import {
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

/** Sol's target lot/building depth band, in columns. */
export const STRIP_DEPTH_MIN = 16;
export const STRIP_DEPTH_MAX = 28;

/**
 * Shallowest claim a station keeps: `MIN_INFILL_SIDE` (7) plus one column for
 * the rear boundary. Restated rather than imported for the reason `terraced`
 * restates its own floors: a form sits upstream of `district.ts`.
 */
export const MIN_STRIP_DEPTH = 8;

/** The column the rear transition stands on. */
export const REAR_MARGIN = 1;

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
  const dTarget = clamp(
    sidewalk + (LOT_DEPTH[ctx.density] as number) + REAR_MARGIN,
    STRIP_DEPTH_MIN,
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
  const probe = (p: Point2, perp: Point2, sign: number, e: number): number => {
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
  const candidates: Candidate[] = [];
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
        const normals = normalsOf(path);
        let score = 0;
        for (const [i, p] of path.entries()) {
          const n = normals[i] as Point2;
          if (probe(p, n, 1, e) >= MIN_STRIP_DEPTH || probe(p, n, -1, e) >= MIN_STRIP_DEPTH) {
            score++;
          }
        }
        candidates.push({ e, path, normals, score, first: at(path[0]!.x, path[0]!.z) });
      }
    }
  }

  /* --- selection (§3.3) --------------------------------------------------- */
  // Ties as §3.1: the larger score, then the lower elevation, then the
  // row-major index of the first cell.
  candidates.sort((a, b) =>
    b.score !== a.score ? b.score - a.score : a.e !== b.e ? a.e - b.e : a.first - b.first,
  );
  const floor = minStreetScore(ctx.blockSize);
  const chosen: Candidate[] = [];
  // Columns within `blockSize / 2` in plan distance of a chosen street — the
  // spacing rule every other form already uses, applied to contours.
  const near = new Uint8Array(cells);
  let best = 0;
  for (const candidate of candidates) {
    best = Math.max(best, candidate.score);
    if (chosen.length >= MAX_PRINCIPAL_STREETS) break;
    if (candidate.score < floor) continue;
    if (chosen.some((c) => Math.abs(c.e - candidate.e) < TERRACE_RISE)) continue;
    let crowded = 0;
    for (const p of candidate.path) if (near[at(p.x, p.z)] === 1) crowded++;
    if (crowded * 2 > candidate.path.length) continue;
    chosen.push(candidate);
    paint(near, candidate.path, Math.floor(ctx.blockSize / 2), at, inside);
  }

  if (chosen.length < MIN_PRINCIPAL_STREETS) {
    return {
      ok: false,
      reason: `the "hillside" form lays two to four principal streets along the contours of the ground and builds only beside them; on this ground the best contour commands ${best} columns of buildable frontage and a street needs ${floor}`,
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
    // shallower than `MIN_STRIP_DEPTH` claims nothing on that side; a station
    // that holds no side lays no street, which is where `offPlatform` is made
    // unrepresentable — the condition `walkBack` discovers eight passes
    // downstream is checked here, while it can still be acted on.
    const depths: [number, number][] = path.map((p, i) => {
      const n = normals[i] as Point2;
      const up = probe(p, n, 1, e);
      const down = probe(p, n, -1, e);
      return [up >= MIN_STRIP_DEPTH ? up : 0, down >= MIN_STRIP_DEPTH ? down : 0];
    });
    const laid = depths.map(([a, b]) => a > 0 || b > 0);

    for (const [r, run] of runsWhere(path, laid).entries()) {
      const from = path.indexOf(run[0] as Point2);
      const platform = new Uint8Array(cells);
      const id = `hs${c}_${r}`;
      // One column wider than the street's own cross-section. The carriageway
      // is rastered from the centre line and the sidewalk is *dilated* from
      // that raster, so on a diagonal run the finished street reaches half a
      // column further than `half + sidewalk` says; a platform that stopped at
      // the arithmetic would leave the outermost verge column off it, which is
      // precisely the `offPlatform` `walkBack` reports.
      for (const p of run) disc(p, half + sidewalk + 1, at, inside, (k) => (platform[k] = 1));

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
          // the thing this form exists not to do.
          if (perp <= half + sidewalk) {
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
          for (let k = 0; k < cells; k++) if (columns[k] === 1) platform[k] = 0;
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
  // back. (Merging upward into one platform is WP-1 — see the module note.)
  const released = separationRelease(strips, cells, width, depth);
  const kept = strips.map((strip) => {
    const columns = Uint8Array.from(strip.columns);
    for (let k = 0; k < cells; k++) if (released[k] === 1) columns[k] = 0;
    return { ...strip, columns };
  });
  // A released column is not levelled either: it goes back to natural ground,
  // which is what "gives its columns back" has to mean if it is to mean
  // anything the walk can see.
  const benches: FormBench[] = platforms.map((platform, b) => {
    const mask = Uint8Array.from(platform);
    for (let k = 0; k < cells; k++) if (released[k] === 1) mask[k] = 0;
    return { id: `terrace.${b}`, runs: maskRuns(bounds, mask), level: platformLevel[b] as number };
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

/** One scored contour, before selection. */
interface Candidate {
  readonly e: number;
  readonly path: readonly Point2[];
  readonly normals: readonly Point2[];
  readonly score: number;
  /** Row-major index of the first cell — §3.1's last tiebreak. */
  readonly first: number;
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

