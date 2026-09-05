/**
 * The **solved carriageway band** — rule 5,
 * first bullet, and rule 6.
 *
 * A tier-A linework declares against the baseline, from a slot that runs long
 * before `surfaceStreetGraph`. It still has to know where the lanes will be,
 * because a bed under a lane is the one defect the class can produce. §13.2's
 * 2026-08-17 amendment is the answer, and it is a distinction rather than a
 * trick:
 *
 * | question | answered by | available |
 * | --- | --- | --- |
 * | *where does a carriageway cross my line?* | the **solved layout** | from the moment placement is done |
 * | *what level does the carriageway hold there?* | the **surfaced** street | only after the street pass |
 *
 * This module answers the first and cannot answer the second: it takes the
 * street graphs, the arterials and the registered corridors — every one of them
 * decided in the layout stage — and rasterizes them into a column mask. Pure, no
 * plan, no `ColumnPlan`, unit-testable without a compile, in the discipline
 * `structures/street-owner.ts` already keeps.
 *
 * ## Why the `+1`, and why it is not a fudge
 *
 * The mask must be a **superset** of the columns the finished carriageway
 * occupies. The surfacer's own rasterizer is not run here — it lays a
 * cross-section perpendicular to a local heading, and reproducing it would be
 * two rasterizers that have to agree forever. So every claim is dilated by
 * `ceil(width / 2) + 1` in the **Chebyshev** metric: half a width covers the
 * carriageway's own half-section, the `+1` covers the one column a perpendicular
 * lay can throw past it on a diagonal, and Chebyshev covers the corner. The
 * superset property is asserted directly on real worlds in
 * `test/linework.test.ts` rather than argued for here.
 *
 * The **dressing is deliberately not in the superset**. A sidewalk (rank 90), a
 * verge (140) or a doorstep landing (120) losing a column to a bed is the rank
 * order working; a *carriageway* losing one is the defect.
 *
 * ## Determinism
 *
 * Districts in document order, `StreetGraph.segments` in their own order, cells
 * in rasterization order, into one `Uint8Array`. Set-union is commutative, so
 * the mask is order-independent by construction; the order is stated anyway
 * because §13.2b asks for it and because a future short-circuit would otherwise
 * be free to observe it.
 */

import type { Region } from "@terrainist/stdlib";

import { lineCells } from "../structures/roads.js";

import { ROAD_CORRIDOR_MARGIN, type RouteCorridor } from "./corridors.js";
import type { ReadonlyUint8Array } from "./ground-contract.js";
import type { StreetGraph, StreetSegment } from "./streets.js";

/** A point on a solved centre line. */
interface Cell {
  readonly x: number;
  readonly z: number;
}

/** The arterials of one city plan, as this module reads them. */
interface CarriagewayArterial {
  readonly width: number;
  readonly path: readonly Cell[];
}

/** One district's contribution: its solved street skeleton. */
export interface CarriagewayDistrict {
  readonly streets: StreetGraph;
}

/** One city's contribution: the arterials on its plan. */
export interface CarriagewayCity {
  readonly plan: { readonly arterials: readonly CarriagewayArterial[] };
}

/**
 * True for a segment whose width is a **carriageway** (§13.2a rule 5).
 *
 * `role` absent means `"carriageway"` — that is the pinned contract in
 * `layout/streets.ts`, and it is every segment every form but `canal` and
 * `terraced` draws. A channel is water and a flight of steps is not a lane, so
 * neither is subtracted: a bed that met a canal loses to `fluid.channel` at rank
 * 0 anyway, which is the correct and silent answer.
 */
export function isCarriagewaySegment(segment: StreetSegment): boolean {
  return segment.role === undefined || segment.role === "carriageway";
}

/** The Chebyshev dilation radius a claim of this width earns (rule 6). */
export function bandRadius(width: number): number {
  return Math.ceil(Math.max(1, width) / 2) + 1;
}

/**
 * Every column the solved layout will put a carriageway on, dilated.
 *
 * The one input a linework declarer subtracts before it declares anything. A
 * column in this mask receives **no claim at all** — not a bed, not a clearance,
 * not a guard — so the road passes through by declaration rather than by rank,
 * which is §13.2's original instruction generalised from `infra.wall@0`'s gates
 * to every client of the class.
 */
export function solvedCarriagewayMask(
  region: Region,
  districts: readonly CarriagewayDistrict[],
  cities: readonly CarriagewayCity[],
  corridors: readonly RouteCorridor[] = [],
  corridorMask?: ReadonlyUint8Array,
): Uint8Array {
  const mask = new Uint8Array(region.width * region.depth);

  /** Stamp one column and its Chebyshev disc of the given radius. */
  const stamp = (x: number, z: number, radius: number): void => {
    for (let dz = -radius; dz <= radius; dz++) {
      const j = z + dz - region.z0;
      if (j < 0 || j >= region.depth) continue;
      for (let dx = -radius; dx <= radius; dx++) {
        const i = x + dx - region.x0;
        if (i < 0 || i >= region.width) continue;
        mask[j * region.width + i] = 1;
      }
    }
  };

  /** Rasterize a polyline 4-connected and stamp every cell of it. */
  const stampPath = (path: readonly Cell[], radius: number): void => {
    if (path.length === 0) return;
    if (path.length === 1) {
      stamp((path[0] as Cell).x, (path[0] as Cell).z, radius);
      return;
    }
    for (let i = 0; i + 1 < path.length; i++) {
      for (const c of lineCells(path[i] as Cell, path[i + 1] as Cell)) stamp(c.x, c.z, radius);
    }
  };

  // --- the district street graphs, in document order -----------------------
  for (const district of districts) {
    const graph = district.streets;
    const widest = new Map<string, number>();
    for (const segment of graph.segments) {
      if (!isCarriagewaySegment(segment)) continue;
      widest.set(segment.id, segment.width);
      stampPath(segment.path, bandRadius(segment.width));
    }
    // An intersection is not the union of two half-sections: the surfacer fills
    // the junction square out to the widest limb meeting there, which is wider
    // than either limb's own band on the diagonal.
    for (const junction of graph.intersections) {
      let maxWidth = 0;
      for (const id of junction.segments) {
        const w = widest.get(id);
        if (w !== undefined && w > maxWidth) maxWidth = w;
      }
      if (maxWidth === 0) continue;
      stamp(junction.x, junction.z, bandRadius(maxWidth));
    }
  }

  // --- the arterials, at their own widths ----------------------------------
  for (const city of cities) {
    for (const arterial of city.plan.arterials) {
      stampPath(arterial.path, bandRadius(arterial.width));
    }
  }

  // --- the registered corridors --------------------------------------------
  // A corridor is not a lane; it is the slack a lane is allowed to wander
  // inside, which is exactly why a bed must keep out of the whole of it. Its
  // `halfWidth` already carries `ROAD_CORRIDOR_MARGIN` for a road corridor, and
  // adding it again for a course corridor costs three columns of bed and buys
  // the superset property against both kinds without a second code path.
  for (const corridor of corridors) {
    stampPath(corridor.centerline, corridor.halfWidth + ROAD_CORRIDOR_MARGIN);
  }

  // The frozen corridor the road pass registered, already a column mask over
  // this region (§4.9.6). Unioned rather than re-rasterized: it *is* the
  // corridor, at the width the solver reserved.
  if (corridorMask !== undefined && corridorMask.length === mask.length) {
    for (let k = 0; k < mask.length; k++) if (corridorMask[k] === 1) mask[k] = 1;
  }

  return mask;
}
