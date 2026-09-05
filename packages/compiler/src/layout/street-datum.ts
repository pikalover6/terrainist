/**
 * The street datum — Part I, F2/F3.
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
import { ROAD_FILL_BAND, STREET_CUT_MAX } from "../structures/roads.js";
import {
  arcFrame,
  arcLevels,
  carriagewaySpans,
  clampX,
  clampZ,
  gradeProfile,
  index,
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
 * : "the cell plane becomes its streets'
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
  /**
   * Segment id → blocks to subtract, **per station**, from that segment's
   * sampled ground before it is graded — the post-election harmonization's one
   * lever ({@link harmonizeStreetDatum}).
   *
   * One entry per station of that segment's {@link ArcFrame}; a shorter array
   * or an absent segment simply drops nothing, and no caller relies on that
   * leniency.
   *
   * A drop of the grader's *input*, not an offset of its output, and that
   * distinction is the whole safety argument: every law downstream of the
   * sample still runs on the result. F9's cut cap is sampled from the
   * **unlowered** ground below, so a segment already cutting `STREET_CUT_MAX`
   * into its hill cannot be talked one block deeper; `gradeProfile`'s own
   * floor holds the profile at `seaLevel + 1` (T13/W1); the junction pins are
   * taken from the levels the senior segments were graded to in this same
   * pass, so a lowered street ramps back up to its junctions rather than
   * stepping away from them; and the one-block grade cap governs the shape as
   * it always did.
   *
   * A segment the map does not name drops nothing. Absent or empty — which is
   * every caller while the flag is off — and this is F2's datum, unchanged.
   */
  readonly lower?: ReadonlyMap<string, readonly number[]>;
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
  const { region, graph, field, seaLevel, floorY, planeY, lower } = input;
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
    // The harmonizer's drop — `StreetDatumInput.lower`. It moves the *sample*,
    // never the answer: `cutFloor` below is still built from the unlowered
    // ground, so F9's cap is the cap it always was.
    const drop = lower?.get(job.segment.id);
    for (const [i, p] of frame.stations.entries()) {
      const k = index(region, clampX(region, p.x), clampZ(region, p.z));
      stationGround.push((ground[k] as number) - (drop?.[i] ?? 0));
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


/* -------------------------------------------------------------------------- */
/* the post-election harmonization — the +1 road lip                          */
/* -------------------------------------------------------------------------- */

/**
 * What one segment's flanks asked for, and what the re-grade did with it.
 *
 * `from`/`to` are the median graded level **over the dropped stations** before
 * and after, so a record with `from === to` is a stretch that was asked to
 * move and could not — F9's cut cap, the water floor or a junction pin held
 * it — and that is worth reading, not worth hiding.
 */
export interface HarmonizedSegment {
  readonly id: string;
  /** How many of the segment's stations were dropped. */
  readonly stations: number;
  /**
   * …of which this many were **carried** through a junction by the run beside
   * them rather than asked for by two speaking flanks.
   */
  readonly carried: number;
  /** The segment's total station count, so a record reads as a fraction. */
  readonly of: number;
  /** Median graded level over the asked stations, before the re-grade. */
  readonly from: number;
  /** …and after it. */
  readonly to: number;
  /** Median elected plane level over the negative-lane flank of those stations. */
  readonly left: number;
  /** …and over the positive-lane one. */
  readonly right: number;
  /** World bounds of the asked stretch — `[x0, z0, x1, z1]`, so a record is walkable. */
  readonly at: readonly [number, number, number, number];
}

/** What {@link harmonizeStreetDatum} needs, and nothing else. */
export interface StreetHarmonizeInput {
  /** Exactly the input {@link StreetHarmonizeInput.datum} was graded from. */
  readonly base: StreetDatumInput;
  /** That grading's answer. */
  readonly datum: StreetDatum;
  /**
   * The elected plane level at a column, or `undefined` where the election
   * put no platform there.
   *
   * A *pure* lookup over the finished election — `GroundLevels.levelY[at()]`
   * in `layDistrict`'s case. The harmonizer never learns how a level was
   * elected, which is what keeps this a datum (§1.3): it reads a proposal, not
   * the ground.
   */
  planeAt(x: number, z: number): number | undefined;
  /** Columns beyond the sidewalk's outer lane to read, per side. */
  readonly probe: number;
  /** Elected columns a side of a *station* must offer before it has an opinion. */
  readonly minFlank: number;
  /** Consecutive asking stations a stretch needs before it is allowed to move. */
  readonly minRun: number;
}

/** {@link harmonizeStreetDatum}'s answer. */
export interface StreetHarmonization {
  /** The harmonized datum, or the one handed in where nothing was asked. */
  readonly datum: StreetDatum;
  /** One record per segment with an asked stretch — see {@link HarmonizedSegment}. */
  readonly segments: readonly HarmonizedSegment[];
  /** Stations both flanks asked to drop, map-wide over this district. */
  readonly asked: number;
  /** Of those, the ones the re-grade actually moved. */
  readonly moved: number;
}

/**
 * The lower median of a list of integers — deterministic on an even count,
 * which is the only property this needs of it (F11).
 */
function lowerMedian(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[(sorted.length - 1) >> 1] as number;
}

/**
 * Make the agreement between a street and the ground beside it **mutual**.
 *
 * The datum grades on pristine terrain before the election, and the election
 * then pays a frontage cost to agree with the datum
 *. Nothing ever ran the other way, so
 * a stretch of street whose whole neighbourhood elected one block below the
 * natural grade it was sampled from stands proud of it for ever: Kai's walked
 * lip (n3 Troy, station 1 — a road at natural grade with the planes on both
 * sides one lower, a building `+1` submerged by the road's own sidewalk, and a
 * two-block dropoff where the meeting should have been clean).
 *
 * **The unit is a station, not a segment**, and that is a measurement rather
 * than a preference: on the citadel the whole east–west road through the
 * quarter is *one* segment 168 stations long, and its flanks' median over that
 * length is 0. A per-segment rule cannot see a lip that is forty stations
 * wide. A station is the unit the profile is graded in, so it is also the unit
 * the profile can be asked in.
 *
 * The repair is the smallest one that closes it:
 *
 * 1. **Read both flanks, per station.** Every column between the sidewalk's
 *    outer lane and `probe` beyond it is attributed to the station whose
 *    cross-section covers it and to the side its lane sign puts it on, and
 *    contributes the difference between the elected plane there and the
 *    street's own graded level. A side offering fewer than `minFlank` elected
 *    columns at that station has no opinion, and a station where either side
 *    is silent asks for nothing.
 * 2. **Both sides must want it lower, and one of them by exactly one.** Both
 *    medians `≤ −1` — a one-sided preference does nothing, which is what keeps
 *    a street along the top of a bank where it is — and at least one median
 *    exactly `−1`, so what is closed is a one-block disagreement rather than a
 *    cliff that a block would not fix. **Never a lift**: a positive median is
 *    not a case here at all, so T13's water floor and W1's berm clamp are
 *    untouched by construction.
 * 3. **Only a run.** An asking station is honoured only inside a run of
 *    `minRun` consecutive asking stations, so a lip is repaired and a flicker
 *    is not.
 * 4. **Re-grade, do not offset.** The asked stations' sampled ground drops by
 *    one and {@link gradeStreetDatum} runs again over the whole graph
 *    ({@link StreetDatumInput.lower}). Every law comes with it: F9's cut cap,
 *    sampled from the *unlowered* ground, refuses a station already cutting
 *    `STREET_CUT_MAX` into its hill; `gradeProfile`'s floor keeps the sea out;
 *    the one-block grade cap ramps the ends of a dropped run instead of
 *    stepping them; and the junction pins are re-taken in rank order, so a
 *    junior street pins to whatever its senior ended up at and no run walks
 *    away from a junction it may not move. A stretch that could not go is
 *    reported with `from === to`.
 *
 * Pure — `(base, datum, an election lookup)` and nothing else — and it
 * declares nothing (§1.3, F10). Returns the datum it was handed, un-re-graded,
 * when no station asks.
 */
export function harmonizeStreetDatum(input: StreetHarmonizeInput): StreetHarmonization {
  const { base, datum, planeAt, probe, minFlank, minRun } = input;
  // A city cell is one terrace and its carriageway *is* that terrace
  // (`planeY`): there is no shape under the plane for a drop to move, and its
  // lots seat on `cell.foundationY` directly, so moving the street off the
  // plane would re-open the inverted lip 8F measured and closed.
  if (base.planeY !== undefined) return { datum, segments: [], asked: 0, moved: 0 };

  const region = base.region;
  const sidewalk = Math.max(0, base.graph.sidewalk);
  const lower = new Map<string, readonly number[]>();
  /** Segment id → the record its asked stations earned, filled before the re-grade. */
  const asked = new Map<string, Omit<HarmonizedSegment, "to">>();
  let askedStations = 0;

  for (const segment of base.graph.segments) {
    const levels = datum.bySegment.get(segment.id);
    if (levels === undefined || segment.path.length === 0) continue;
    const stations = levels.y.length;
    if (stations === 0) continue;
    // The banded cross-section — carriageway plus sidewalk, exactly the span
    // the datum claims — and then `probe` columns further out on each side.
    const banded = carriagewaySpans(segment.width + 2 * sidewalk).lanes;
    const inner = Math.max(Math.abs(banded.lo), Math.abs(banded.hi));
    const line = simplifyPath(segment.path);
    const flank = sweptColumns(
      region,
      segment.path,
      { lo: -(inner + probe), hi: inner + probe },
      { line },
    );
    const left: number[][] = Array.from({ length: stations }, () => []);
    const right: number[][] = Array.from({ length: stations }, () => []);
    for (const spot of flank) {
      if (Math.abs(spot.lane) <= inner) continue;
      const plane = planeAt(spot.x, spot.z);
      if (plane === undefined) continue;
      // The station whose cross-section covers this column — the same map the
      // grader pins junctions through, so a column is scored against the level
      // it actually stands beside.
      const i = Math.min(stations - 1, levels.frame.station(spot.arc));
      (spot.lane < 0 ? left : right)[i]?.push(plane - (levels.y[i] as number));
    }

    /** 1 where both flanks of this station asked for the block back. */
    const wants = new Uint8Array(stations);
    /** 1 where a station may be *carried* by a run beside it — see below. */
    const permits = new Uint8Array(stations);
    const leftMed = new Int32Array(stations);
    const rightMed = new Int32Array(stations);
    for (let i = 0; i < stations; i++) {
      const l = left[i] as number[];
      const r = right[i] as number[];
      const lm = l.length < minFlank ? undefined : lowerMedian(l);
      const rm = r.length < minFlank ? undefined : lowerMedian(r);
      // A side that speaks and is content — or that wants the street *up* —
      // objects, and an objection is final: nothing carries through it.
      if ((lm !== undefined && lm >= 0) || (rm !== undefined && rm >= 0)) continue;
      // A station with one speaking, wanting side and one *silent* one is
      // where a street crosses a street: the flank there is another
      // carriageway, so the election put no platform in the probe and there is
      // nothing to disagree with. It cannot start a run — "a one-sided
      // preference does nothing" — but it may be carried through by one, which
      // is what keeps a repaired lip from stopping dead at its own junction and
      // leaving a one-block ridge across the road. Bounded below.
      if (lm !== undefined || rm !== undefined) permits[i] = 1;
      if (lm === undefined || rm === undefined) continue;
      if (lm !== -1 && rm !== -1) continue;
      wants[i] = 1;
      leftMed[i] = lm;
      rightMed[i] = rm;
    }
    // Runs shorter than `minRun` are dropped from the mask rather than from the
    // decision, so a long lip with a two-station gap in it is still two lips
    // and not one — the grade cap will bridge the gap for us.
    const drop = new Array<number>(stations).fill(0);
    let run = 0;
    for (let i = 0; i <= stations; i++) {
      if (i < stations && wants[i] === 1) {
        run += 1;
        continue;
      }
      if (run >= minRun) {
        const lo = i - run;
        for (let k = lo; k < i; k++) drop[k] = 1;
        // …and then carried outward over permitting stations, at most as far
        // as the run's own length in each direction. The evidence bounds the
        // extension: a seven-station lip may carry seven stations through its
        // junction and no further.
        const reach = Math.max(minRun, run);
        for (let k = lo - 1; k >= Math.max(0, lo - reach) && permits[k] === 1 && wants[k] === 0; k--)
          drop[k] = 1;
        for (let k = i; k < Math.min(stations, i + reach) && permits[k] === 1 && wants[k] === 0; k++)
          drop[k] = 1;
      }
      run = 0;
    }
    const chosen: number[] = [];
    for (let i = 0; i < stations; i++) if (drop[i] === 1) chosen.push(i);
    if (chosen.length === 0) continue;

    lower.set(segment.id, drop);
    askedStations += chosen.length;
    let x0 = Number.POSITIVE_INFINITY;
    let z0 = Number.POSITIVE_INFINITY;
    let x1 = Number.NEGATIVE_INFINITY;
    let z1 = Number.NEGATIVE_INFINITY;
    for (const i of chosen) {
      const p = levels.frame.stations[i] as { readonly x: number; readonly z: number };
      x0 = Math.min(x0, p.x);
      z0 = Math.min(z0, p.z);
      x1 = Math.max(x1, p.x);
      z1 = Math.max(z1, p.z);
    }
    // The flank medians are reported over the stations that *spoke*: a carried
    // station has one silent side by definition and averaging its zero in
    // would report an agreement nobody made.
    const spoke = chosen.filter((i) => wants[i] === 1);
    asked.set(segment.id, {
      id: segment.id,
      stations: chosen.length,
      carried: chosen.length - spoke.length,
      of: stations,
      from: lowerMedian(chosen.map((i) => levels.y[i] as number)),
      left: lowerMedian(spoke.map((i) => leftMed[i] as number)),
      right: lowerMedian(spoke.map((i) => rightMed[i] as number)),
      at: [x0, z0, x1, z1],
    });
  }

  if (lower.size === 0) return { datum, segments: [], asked: 0, moved: 0 };

  const regraded = gradeStreetDatum({ ...base, lower });

  const segments: HarmonizedSegment[] = [];
  let moved = 0;
  for (const segment of base.graph.segments) {
    const record = asked.get(segment.id);
    const before = datum.bySegment.get(segment.id);
    const after = regraded.bySegment.get(segment.id);
    if (record === undefined || before === undefined || after === undefined) continue;
    const drop = lower.get(segment.id) as readonly number[];
    const chosen: number[] = [];
    for (const [i, d] of drop.entries()) if (d === 1) chosen.push(i);
    for (const i of chosen) if ((after.y[i] as number) !== (before.y[i] as number)) moved += 1;
    segments.push({ ...record, to: lowerMedian(chosen.map((i) => after.y[i] as number)) });
  }
  return { datum: regraded, segments, asked: askedStations, moved };
}
