/**
 * The street datum — `docs/GROUND-UNIFICATION-v0.md` Part I, F2/F3.
 *
 * > A carriageway's elevation profile is computed exactly once, at the moment
 * > its graph is drawn, and every later consumer reads that answer rather than
 * > re-deriving one.
 *
 * This module is the kernel that computes that answer. It is **pure**: a
 * function of `(region, StreetGraph, field, seaLevel)` and nothing else — no
 * plan, no RNG, no clock, no map-iteration order in any decision — so a datum
 * can be graded in a test without a compile. That is the `solved-carriageway.ts`
 * discipline and this file sits beside it.
 *
 * It shares the surfacer's kernels rather than reimplementing them, which is
 * the whole point of F3: the layout-stage answer and the structure-stage answer
 * must be the *same number*, not two numbers that usually agree.
 *
 * 1. Ground is sampled as `clampY(Math.floor(field.values[k]))` — **the exact
 *    materialisation rule** (`terrain/columns.ts`, the `ground[idx]` write), not
 *    `medianGround`'s `Math.round`. The two differ by one block on half of all
 *    columns and that difference is itself a lip generator. `test/street-datum.test.ts`
 *    asserts the rule against `clampY` directly so the two cannot drift.
 * 2. Each segment's {@link ArcFrame} comes from `arcFrame` over the same
 *    simplified line the sweep uses, so the grade cap is one block per block of
 *    *ground travelled* and a 45° avenue does not climb √2 too fast.
 * 3. Segments are ordered by `compareStreetRank` and claim columns in that
 *    order; a segment arriving at a column somebody senior already owns is
 *    pinned to that column's level with `pinLevel`. The ownership machinery is
 *    used unchanged.
 * 4. `gradeProfile(ground, seaLevel, ROAD_FILL_BAND, floor)`, where `floor` is
 *    F9's cut cap — `ground − STREET_CUT_MAX`, maxed with the junction pins.
 *    **The deck and rim floor is deliberately zero here**: `routeFloorAt` needs
 *    `fluidTop`, which does not exist until `buildColumnPlan` runs. That half
 *    of the floor is the surfacer's, and F8 says what happens where it bites —
 *    it is the one legal cause `LOAM-T237` names. The *cut* half is not: it is
 *    a function of this street's own sampled ground and nothing else, so
 *    leaving it to the surfacer alone was two graders answering one question.
 *    Wave 8G moved it here, where it belongs (the walked defect: the datum dug
 *    an uncapped trench across a hill, the lots seated in it, and the surfaced
 *    carriageway stood up to nine blocks above its own frontages).
 * 5. `arcLevels(frame, profile)` binds the profile to its frame, and the swept
 *    cross-section (`carriagewaySpans`) rasterises `columnY`/`band`.
 *
 * F10: the datum declares nothing to the ground driver. It is an input to
 * seating, computed a full stage before the resolver exists.
 *
 * As of wave 8A this module has **no call site**. It is the kernel; 8B wires it
 * into `layDistrict` behind `FRONTAGE_TIE`.
 */

import type { HeightField, Region } from "@terrainist/stdlib";

import { WORLD_MIN_Y } from "../emit/prismarine.js";
import { clampY } from "../terrain/columns.js";
import {
  ROAD_FILL_BAND,
  STREET_CUT_MAX,
  clampX,
  clampZ,
  gradeProfile,
  index,
} from "../structures/roads.js";
import {
  arcFrame,
  arcLevels,
  carriagewaySpans,
  simplifyPath,
  sweptColumns,
  type ArcFrame,
  type ArcLevels,
  type LineVertex,
  type SweptColumn,
} from "../structures/sweep.js";
import {
  claimColumns,
  compareStreetRank,
  pinLevel,
  type StreetOwnerKind,
  type StreetOwnerRole,
  type StreetRank,
} from "../structures/street-owner.js";

import type { StreetGraph, StreetSegment } from "./streets.js";

/**
 * The sentinel `columnY` carries where no street reaches is `WORLD_MIN_Y`, the
 * emitter's own floor: a consumer that forgets to check `band` then produces an
 * obviously wrong answer rather than a plausible one.
 */

/** The graded elevation of a district's carriageways — F2's artifact. */
export interface StreetDatum {
  /** Segment id → the graded level at each arc station. */
  readonly bySegment: ReadonlyMap<string, ArcLevels>;
  /** The region the two rasters are indexed over. */
  readonly region: Region;
  /** Region-indexed carriageway level, {@link WORLD_MIN_Y} where no street. */
  readonly columnY: Int32Array;
  /** 1 where `columnY` is meaningful — carriageway plus sidewalk band. */
  readonly band: Uint8Array;
  /**
   * The level at the nearest banded column within `reach`, or `undefined`.
   *
   * Nearest by squared Euclidean distance; ties break by **ascending region
   * index**, never by iteration order (F11).
   */
  levelNear(x: number, z: number, reach: number): number | undefined;
}

/** What {@link gradeStreetDatum} needs. Everything, and nothing else. */
export interface StreetDatumInput {
  /** The raster the datum is indexed over — usually the terrain field's. */
  readonly region: Region;
  /** The district's street skeleton, exactly as `buildStreetGraph` drew it. */
  readonly graph: StreetGraph;
  /** The levelled master field, sampled by the materialisation rule. */
  readonly field: HeightField;
  readonly seaLevel: number;
  /**
   * A floor every graded level is raised to.
   *
   * The general "a floor only ever lifts" primitive, kept because it is the
   * shape every *other* ground floor in this compiler has (`routeFloorAt`, the
   * surfacer's `deckFloor`, W1/W2's berm clamp) and because a floored profile
   * is still 1-Lipschitz and still junction-agreeing: the max of two
   * 1-Lipschitz functions is 1-Lipschitz, and two levels equal before the floor
   * are equal after it.
   *
   * **Not what a city cell wants** — see {@link StreetDatumInput.planeY}, which
   * is the client 8E wrote this field for and which 8F had to correct.
   */
  readonly floorY?: number;
  /**
   * The one level this quarter's whole ground is pinned to — **the city cell's
   * terrace** (8E, corrected at 8F).
   *
   * `docs/GROUND-UNIFICATION-v0.md` §1.8: "the cell plane becomes its streets'
   * floor rather than a competing plane". A cell is one terrace: `solveCities`
   * pins every column of its mask to `maskMedian(field, cell)` at apron 0, and
   * the pad is composed into the field a full substage *after* this datum is
   * graded — so a grader that read the raw hillside would hand the surfacer a
   * carriageway on ground that is about to be levelled out from under it.
   *
   * **A pin, not a floor, and 8F is where that distinction was measured.** 8E
   * shipped this as `floorY` on the argument that "`applyLevelPad` levels the
   * mask in both directions, so inside the cell the floor is the plane and
   * outside it the natural grade still wins where it is already higher". The
   * second half of that sentence is about ground the graph never occupies —
   * `CellFabric.mask`'s own contract is that *streets are clipped to `mask`*,
   * and `maskRuns` pins every column of that mask at apron 0 — while the first
   * half is only half true: a floor lifts the datum where the raw hillside sits
   * *below* the plane and leaves it alone where the hillside sits *above* it.
   * Those are the columns the pad is about to cut down to the plane, so the
   * street was surfaced from a level its own ground no longer had, and the lots
   * — which seat on `cell.foundationY` directly — ended up **under** their own
   * carriageway.
   *
   * Measured on `c1-harbourtown` at the 8F flip, over the 90 seated lots with a
   * carriageway within five columns of their footprint: **4 lots off their
   * street's level before the flip, 25 after it with the floor, 22 of those
   * *negative*** — the §0.1 lip, inverted, on the one world WP-8 exists to fix.
   * With the pin it is 4 again and none of them is a cell lot. The datum is
   * constant over the quarter, which is trivially 1-Lipschitz and trivially
   * junction-agreeing, and `FRONTAGE_RISE = 0` then puts every cell lot exactly
   * on its carriageway.
   *
   * Takes precedence over {@link StreetDatumInput.floorY}; no caller passes
   * both. Absent for every district that is not a city cell.
   */
  readonly planeY?: number;
}

/** A segment as the grader works on it. */
interface DatumJob {
  readonly segment: StreetSegment;
  readonly rank: StreetRank;
  readonly path: readonly { readonly x: number; readonly z: number }[];
  readonly width: number;
  readonly line: readonly LineVertex[];
  readonly frame: ArcFrame;
  readonly spots: readonly SweptColumn[];
  levels?: ArcLevels;
}

/** The rank a segment carries into `compareStreetRank`. */
function rankOf(segment: StreetSegment): StreetRank {
  return {
    id: segment.id,
    width: segment.width,
    role: (segment.role ?? "carriageway") as StreetOwnerRole,
    // A graph's width classes are exactly three of the four owner kinds;
    // `arterial` belongs to the city pass and never appears in a StreetGraph.
    kind: segment.kind as StreetOwnerKind,
  };
}

/**
 * Sample the ground exactly as `buildColumnPlan` will materialise it.
 *
 * F3 step 1. `clampY(Math.floor(v))` — `terrain/columns.ts`. Exported so the
 * test can assert the rule rather than a copy of it.
 */
export function materialisedGround(region: Region, field: HeightField): Int32Array {
  const out = new Int32Array(region.width * region.depth);
  for (let j = 0; j < region.depth; j++) {
    const z = region.z0 + j;
    for (let i = 0; i < region.width; i++) {
      const x = region.x0 + i;
      out[j * region.width + i] = clampY(Math.floor(field.values[field.clampedIndex(x, z)] as number));
    }
  }
  return out;
}

/**
 * Grade a district's street graph into a {@link StreetDatum}.
 *
 * Pure, integer, and independent of the order `graph.segments` happens to be
 * in: every decision below is taken in `compareStreetRank` order, which is
 * `(−width, roleRank, kindRank, id)` and is a total order on a graph's
 * segments because ids are unique within it.
 */
export function gradeStreetDatum(input: StreetDatumInput): StreetDatum {
  const { region, graph, field, seaLevel, floorY, planeY } = input;
  const cells = region.width * region.depth;
  const ground = materialisedGround(region, field);

  const columnY = new Int32Array(cells).fill(WORLD_MIN_Y);
  const band = new Uint8Array(cells);
  const owner = new Int32Array(cells).fill(-1);
  const bySegment = new Map<string, ArcLevels>();

  const jobs: DatumJob[] = [];
  for (const segment of graph.segments) {
    if (segment.path.length === 0) continue;
    // One simplified line, shared by the sweep and the frame: the arcs they
    // speak in must be the same coordinate or the level a column reads is not
    // the level its cross-section was graded to.
    const line = simplifyPath(segment.path);
    jobs.push({
      segment,
      rank: rankOf(segment),
      path: segment.path,
      width: segment.width,
      line,
      frame: arcFrame(segment.path, line),
      spots: sweptColumns(region, segment.path, carriagewaySpans(segment.width).lanes, { line }),
    });
  }

  const ranked = jobs.map((_, i) => i);
  ranked.sort((a, b) => compareStreetRank((jobs[a] as DatumJob).rank, (jobs[b] as DatumJob).rank));

  /* --- claim -------------------------------------------------------------- */
  // First writer wins in rank order. Nothing here knows about footprints or
  // water: the datum is a claim about the street's own line, one full stage
  // before anything is placed on the ground beside it.
  for (const j of ranked) {
    const job = jobs[j] as DatumJob;
    claimColumns(
      owner,
      job.spots.map((s) => s.idx),
      j,
    );
  }

  /* --- grade -------------------------------------------------------------- */
  for (const j of ranked) {
    const job = jobs[j] as DatumJob;
    const frame = job.frame;
    const stationGround: number[] = [];
    const stationBand: number[] = [];
    const deckFloor: number[] = [];
    /**
     * F9's cut cap, held apart from the pins — **the fix of wave 8G.**
     *
     * The surfacer's tied branch grades `gradeProfile(datumY, sea, band,
     * max(waterFloor, natural − STREET_CUT_MAX))`. The cut half of that floor
     * needs nothing this stage does not already have: it is a function of the
     * street's *own* sampled ground, the same array this profile is graded
     * from. Leaving it to the surfacer alone was the second grader — the datum
     * dug a trench through the hill with no cap (band 0 caps fill, never cut),
     * the lots seated in the trench, and the surfacer then held the carriageway
     * up at `natural − 2` and rode as much as nine blocks above them.
     *
     * Sampled from the *unpinned* ground on purpose: the surfacer's tied branch
     * runs no pins at all, so its `ground` is `natural` everywhere, and a floor
     * built from pinned ground would be a third answer. {@link pinLevel} then
     * maxes the pin into `deckFloor` below, and the two are combined once, in
     * the same `max` the surfacer uses.
     */
    const cutFloor: number[] = [];
    for (const p of frame.stations) {
      const k = index(region, clampX(region, p.x), clampZ(region, p.z));
      stationGround.push(ground[k] as number);
      stationBand.push(ROAD_FILL_BAND);
      // F3 step 4: zero, deliberately. `routeFloorAt` needs `fluidTop`, which
      // does not exist yet; the water floor is the surfacer's to apply — and
      // it is the one departure from the datum F8 declares legal, which is
      // exactly what `LOAM-T237` says a residual drift means.
      deckFloor.push(0);
      cutFloor.push((ground[k] as number) - STREET_CUT_MAX);
    }
    for (const [i, c] of job.path.entries()) {
      const k = index(region, clampX(region, c.x), clampZ(region, c.z));
      if (owner[k] === j || owner[k] === -1) continue;
      // A junction is a *place*, not a path cell: the pin lands on the station
      // whose cross-section covers the shared column, so the whole width of
      // this street arrives at the owner's level rather than one lane of it.
      pinLevel(
        stationGround,
        stationBand,
        deckFloor,
        frame.station(frame.pathArc[i] as number),
        columnY[k] as number,
      );
    }
    // One floor, one grading (F8): the same `max` the surfacer's tied branch
    // takes, so the profile it re-grades from this one is this one.
    const floor = deckFloor.map((f, i) => Math.max(f, cutFloor[i] as number));
    const profile = gradeProfile(stationGround, seaLevel, stationBand, floor);
    // 8E's one line for the cities, corrected at 8F. Applied to the graded
    // profile rather than to the sampled ground so the grade cap still governs
    // the *shape* of the run wherever the shape survives; the result is what
    // every later consumer — `columnY`, `levelNear`, the surfacer's `datumY` —
    // then reads.
    //
    // The plane wins over the floor, and there is no shape left under it: a
    // pinned quarter is one terrace and its carriageway is that terrace, at
    // every station of every segment. See `planeY` for the measurement that
    // says why the floor was the wrong operator here.
    if (planeY !== undefined) profile.fill(planeY);
    else if (floorY !== undefined) {
      for (const [i, y] of profile.entries()) if (y < floorY) profile[i] = floorY;
    }
    const levels = arcLevels(frame, profile);
    job.levels = levels;
    bySegment.set(job.segment.id, levels);
    for (const spot of job.spots) {
      if (owner[spot.idx] !== j) continue;
      columnY[spot.idx] = levels.at(spot.arc);
      band[spot.idx] = 1;
    }
  }

  /* --- the sidewalk band -------------------------------------------------- */
  // The band is "carriageway plus sidewalk band" (F2). A sidewalk column is
  // never *owned* — it is not carriageway — so it is filled after every
  // carriageway column is settled, and still in rank order, so a senior
  // street's pavement beats a junior one's where two of them abut.
  if (graph.sidewalk > 0) {
    for (const j of ranked) {
      const job = jobs[j] as DatumJob;
      const levels = job.levels;
      if (levels === undefined) continue;
      const walked = sweptColumns(
        region,
        job.path,
        carriagewaySpans(job.width + 2 * graph.sidewalk).lanes,
        { line: job.line },
      );
      for (const spot of walked) {
        if (band[spot.idx] === 1) continue;
        columnY[spot.idx] = levels.at(spot.arc);
        band[spot.idx] = 1;
      }
    }
  }

  const levelNear = (x: number, z: number, reach: number): number | undefined => {
    const r = Math.max(0, Math.floor(reach));
    let best: number | undefined;
    let bestD2 = Number.POSITIVE_INFINITY;
    const x0 = clampX(region, x - r);
    const x1 = clampX(region, x + r);
    const z0 = clampZ(region, z - r);
    const z1 = clampZ(region, z + r);
    // Ascending region index by construction: z outer, x inner, both ascending,
    // and a tie keeps the first — which is the lowest index. F11.
    for (let cz = z0; cz <= z1; cz++) {
      for (let cx = x0; cx <= x1; cx++) {
        const k = index(region, cx, cz);
        if (band[k] !== 1) continue;
        const dx = cx - x;
        const dz = cz - z;
        const d2 = dx * dx + dz * dz;
        if (d2 > r * r) continue;
        if (d2 < bestD2) {
          bestD2 = d2;
          best = columnY[k] as number;
        }
      }
    }
    return best;
  };

  return { bySegment, region, columnY, band, levelNear };
}
